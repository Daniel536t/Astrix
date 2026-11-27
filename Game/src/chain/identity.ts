// Player identity for ASTrix worlds. Three protection levels share one world model:
//
//   guest    key generated in this browser; it owns the world directly.
//   passkey  owner key derived from a device passkey (WebAuthn PRF). The same
//            passkey on another device derives the same key, so the world can be
//            recovered without any server. Gameplay uses a browser session key.
//   wallet   an external wallet (Phantom, Backpack, ...) owns the world and
//            authorises a restricted browser session key once.
//
// No key ever leaves the browser and ASTrix runs no signing server. Ownership is
// enforced by the on-chain program, not by this UI.
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { sha256 } from '@noble/hashes/sha2';
import { CHAIN } from './settlement';

export type IdentityKind = 'guest' | 'passkey' | 'wallet';
export const KIND_CODE: Record<IdentityKind, number> = { guest: 0, passkey: 1, wallet: 2 };
export const PROTECTION_LABEL: Record<IdentityKind, string> = {
  guest: 'Local guest', passkey: 'Protected guest (passkey)', wallet: 'Wallet owner',
};

/** Must match CLAIM_POW_BITS in the program. */
export const CLAIM_POW_BITS = 18;
const enc = new TextEncoder();

export function leadingZeroBits(d: Uint8Array): number {
  let n = 0;
  for (const b of d) {
    if (b === 0) { n += 8; continue; }
    n += Math.clz32(b) - 24;
    break;
  }
  return n;
}

/** Proof of work for an anonymous claim: sha256(key || slot || nonce_le64) with
 *  CLAIM_POW_BITS leading zero bits. Bound to the claimant key and slot, so a
 *  solution cannot be reused by anyone else. Yields to the page between batches. */
export async function solveClaimPow(key: PublicKey, slot: number, onProgress?: (hashes: number) => void): Promise<bigint> {
  const buf = new Uint8Array(32 + 1 + 8);
  buf.set(key.toBytes(), 0);
  buf[32] = slot;
  const view = new DataView(buf.buffer);
  for (let nonce = 0n; ; ) {
    for (let i = 0; i < 20_000; i++, nonce++) {
      view.setBigUint64(33, nonce, true);
      if (leadingZeroBits(sha256(buf)) >= CLAIM_POW_BITS) return nonce;
    }
    onProgress?.(Number(nonce));
    await new Promise((r) => setTimeout(r, 0));
  }
}

// ---------- passkey (WebAuthn PRF) ----------

/** Fixed PRF input; the authenticator mixes it with a per-credential secret. */
const PRF_SALT = sha256(enc.encode('astrix-world-owner-v1'));

export function passkeySupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials;
}

/** Owner key = ed25519 seed sha256("astrix-passkey-v1" || PRF output). */
export function keyFromPrf(prf: ArrayBuffer | Uint8Array): Keypair {
  const p = prf instanceof Uint8Array ? prf : new Uint8Array(prf);
  const input = new Uint8Array([...enc.encode('astrix-passkey-v1'), ...p]);
  return Keypair.fromSeed(sha256(input));
}

const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };

/** Read the PRF output from a passkey. Without `credentialId` the browser
 *  offers every ASTrix passkey on this device or synced to it (recovery). */
export async function getPasskeyKey(credentialId?: string): Promise<{ key: Keypair; credentialId: string }> {
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: random(32), rpId: location.hostname, userVerification: 'required', timeout: 120_000,
      allowCredentials: credentialId ? [{ type: 'public-key', id: unb64u(credentialId) }] : [],
      extensions: { prf: { eval: { first: PRF_SALT } } } as AuthenticationExtensionsClientInputs,
    },
  }) as PublicKeyCredential | null;
  if (!cred) throw new Error('passkey prompt was cancelled');
  const first = (cred.getClientExtensionResults() as PrfResults).prf?.results?.first;
  if (!first) throw new Error('this passkey or browser does not support the PRF extension; use a wallet instead');
  return { key: keyFromPrf(first), credentialId: b64u(cred.rawId) };
}

/** Create a discoverable passkey for this world and derive its owner key. */
export async function createPasskeyKey(label: string): Promise<{ key: Keypair; credentialId: string }> {
  const cred = await navigator.credentials.create({
    publicKey: {
      rp: { name: 'ASTrix', id: location.hostname },
      user: { id: random(16), name: label, displayName: label },
      challenge: random(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      timeout: 120_000,
      extensions: { prf: { eval: { first: PRF_SALT } } } as AuthenticationExtensionsClientInputs,
    },
  }) as PublicKeyCredential | null;
  if (!cred) throw new Error('passkey creation was cancelled');
  const ext = cred.getClientExtensionResults() as PrfResults;
  if (ext.prf?.enabled === false) throw new Error('this authenticator does not support the PRF extension; use a wallet instead');
  const credentialId = b64u(cred.rawId);
  const first = ext.prf?.results?.first;
  // Some authenticators only return PRF output on assertion, not on creation.
  return first ? { key: keyFromPrf(first), credentialId } : getPasskeyKey(credentialId);
}

// ---------- external wallets ----------

export interface WalletProvider {
  publicKey?: { toBytes(): Uint8Array } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toBytes(): Uint8Array } }>;
  signTransaction(tx: Transaction): Promise<Transaction>;
  disconnect?(): Promise<void>;
}
export interface DetectedWallet { name: string; provider: WalletProvider }

/** Injected Solana wallets (Phantom, Backpack, Solflare and window.solana). */
export function detectWallets(): DetectedWallet[] {
  const w = window as unknown as Record<string, any>;
  const found: DetectedWallet[] = [];
  const add = (name: string, p: any) => {
    if (p && typeof p.connect === 'function' && typeof p.signTransaction === 'function' && !found.some((f) => f.provider === p)) found.push({ name, provider: p });
  };
  add('Phantom', w.phantom?.solana);
  add('Backpack', w.backpack?.solana ?? w.backpack);
  add('Solflare', w.solflare);
  add(w.solana?.isPhantom ? 'Phantom' : 'Solana wallet', w.solana);
  return found;
}

export async function connectWallet(w: DetectedWallet): Promise<PublicKey> {
  const r = await w.provider.connect();
  return new PublicKey(r.publicKey.toBytes());
}

// ---------- recovery lookup ----------

/** 8-byte discriminator + Settlement::INIT_SPACE (232). */
export const SETTLEMENT_SIZE = 240;
export const PASSPORT_SIZE = 332;
export const passportAddress = (world: PublicKey) =>
  PublicKey.findProgramAddressSync([enc.encode('passport'), world.toBytes()], CHAIN.programId)[0];

export interface OwnedWorld { slot: number; address: PublicKey; seed: number; source: 'rollup' | 'solana'; verified?: boolean }

/** Worlds owned by `owner`, read from the live rollup (owner is at byte 8). */
export async function findOwnedWorlds(er: Connection, owner: PublicKey, slots: PublicKey[]): Promise<OwnedWorld[]> {
  const accts = await er.getProgramAccounts(CHAIN.programId, {
    // Owner sits at byte 8 of a settlement. The rollup ignores dataSize filters,
    // so results are narrowed to known world slots and the settlement size below.
    filters: [{ memcmp: { offset: 8, bytes: owner.toBase58() } }],
  });
  const out: OwnedWorld[] = [];
  for (const a of accts) {
    const slot = slots.findIndex((s) => s.equals(a.pubkey));
    if (slot < 0 || a.account.data.length !== SETTLEMENT_SIZE) continue; // not a player world
    out.push({ slot, address: a.pubkey, seed: new DataView(a.account.data.buffer, a.account.data.byteOffset).getUint32(40, true), source: 'rollup' });
  }
  return out.sort((x, y) => x.slot - y.slot);
}

/** Fallback when the rollup is unreachable: read the last checkpoint on Solana and
 *  verify the committed world bytes against the hash recorded in its passport. */
export async function findCheckpointedWorlds(base: Connection, owner: PublicKey, slots: PublicKey[]): Promise<OwnedWorld[]> {
  const out: OwnedWorld[] = [];
  const infos = await base.getMultipleAccountsInfo(slots.flatMap((s) => [passportAddress(s), s]));
  for (let slot = 0; slot < slots.length; slot++) {
    const [pp, w] = [infos[2 * slot], infos[2 * slot + 1]];
    if (!pp || !w || pp.data.length < PASSPORT_SIZE) continue;
    if (!new PublicKey(pp.data.subarray(44, 76)).equals(owner)) continue;
    const h = sha256(w.data), want = pp.data.subarray(108, 140);
    const verified = h.every((b, i) => b === want[i]);
    out.push({ slot, address: slots[slot], seed: new DataView(w.data.buffer, w.data.byteOffset).getUint32(40, true), source: 'solana', verified });
  }
  return out;
}
