// The player's own world on the MagicBlock rollup, for all three protection levels
// (see identity.ts): Quick Play (browser guest key), passkey-protected, wallet-owned.
//
// Keys are created and kept in this browser; ASTrix runs no signing server and
// never sees a secret. None of these keys needs SOL: Ephemeral Rollup transactions
// are fee-free (verified on devnet). Ownership is enforced on chain.
//
// Stored record (localStorage `astrix:guest:v1`, name kept for compatibility):
//   guest    `secret` is the owner key itself.
//   passkey  `secret` is a session key authorised by the passkey-derived owner.
//   wallet   `secret` is a session key authorised by the wallet.
// For passkey and wallet worlds losing this record loses nothing: the owner
// re-authorises a new session key on any device.
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { CHAIN } from './settlement';
import {
  IdentityKind, KIND_CODE, solveClaimPow, createPasskeyKey, getPasskeyKey, connectWallet, DetectedWallet,
  passportAddress, findOwnedWorlds, findCheckpointedWorlds, OwnedWorld,
} from './identity';

const STORE = 'astrix:guest:v1';
export const REGISTRY = PublicKey.findProgramAddressSync([new TextEncoder().encode('astrix-registry'), CHAIN.owner.toBytes()], CHAIN.programId)[0];
export const SLOT_COUNT = 32;
export const slotAddress = (i: number) =>
  PublicKey.findProgramAddressSync([new TextEncoder().encode('world-slot'), CHAIN.owner.toBytes(), Uint8Array.of(i)], CHAIN.programId)[0];
export const SLOTS = Array.from({ length: SLOT_COUNT }, (_, i) => slotAddress(i));
const IDENTITY = PublicKey.findProgramAddressSync([new TextEncoder().encode('identity')], CHAIN.programId)[0];
const VRF = new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz');
const EPHEMERAL_QUEUE = new PublicKey('5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc');
const SLOT_HASHES = new PublicKey('SysvarS1otHashes111111111111111111111111111');
/** Session keys for passkey and wallet worlds: one week, generous action budget. */
const SESSION_SECONDS = 7 * 24 * 3600;
const SESSION_BUDGET = 100_000;
const ERR: Record<string, string> = {
  '0x1772': 'not your world', '0x1773': 'session expired', '0x1774': 'session budget used up',
  '0x1775': 'only the owner may do this', '0x1779': 'plot already planted', '0x177a': 'not enough resources',
  '0x177b': 'already built', '0x177c': 'a prospect is already in progress', '0x1780': 'that world slot was just taken',
  '0x1782': 'proof of work rejected', '0x1783': 'too many actions right now; slow down a little', '0x7d1': 'this key no longer owns the world',
};
const SESSION_ENDED = new Set(['0x1773', '0x1774', '0x1772']);

export interface GuestRecord {
  secret: number[]; slot: number; seed: number; created: number;
  v?: 2; kind?: IdentityKind; owner?: string; sessionExpires?: number; credentialId?: string; wallet?: string;
}
type Result = { ok: true; sig: string } | { ok: false; code: string; reason: string };

export function loadGuest(): GuestRecord | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    return v && Array.isArray(v.secret) && v.secret.length === 64 && Number.isInteger(v.slot) ? v : null;
  } catch { return null; }
}

async function discriminator(name: string): Promise<Uint8Array> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`global:${name}`));
  return new Uint8Array(h).slice(0, 8);
}
async function ix(name: string, args: Uint8Array, keys: TransactionInstruction['keys']): Promise<TransactionInstruction> {
  return new TransactionInstruction({ programId: CHAIN.programId, keys, data: Buffer.from([...(await discriminator(name)), ...args]) });
}
const W = (k: PublicKey) => ({ pubkey: k, isSigner: false, isWritable: true });
const S = (k: PublicKey) => ({ pubkey: k, isSigner: true, isWritable: false });
const u64 = (n: bigint) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, n, true); return b; };
const i64 = (n: number) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, BigInt(n), true); return b; };
const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };

export class GuestWorld {
  private er = new Connection(CHAIN.erRpc, 'confirmed');
  private base = new Connection(CHAIN.baseRpc, 'confirmed');
  record: GuestRecord | null = loadGuest();
  private key: Keypair | null = this.record ? Keypair.fromSecretKey(Uint8Array.from(this.record.secret)) : null;

  get kind(): IdentityKind { return this.record?.kind ?? 'guest'; }
  get address(): PublicKey | null { return this.record ? slotAddress(this.record.slot) : null; }
  /** The key that signs gameplay here (owner key for guests, session key otherwise). */
  get publicKey(): string | null { return this.key?.publicKey.toBase58() ?? null; }
  get owner(): string | null { return this.record ? (this.record.owner ?? this.publicKey) : null; }
  get sessionExpired(): boolean { return this.kind !== 'guest' && (this.record?.sessionExpires ?? 0) * 1000 < Date.now(); }

  private save(r: GuestRecord, key: Keypair) {
    this.record = r; this.key = key;
    localStorage.setItem(STORE, JSON.stringify(r));
  }

  /** Send instructions to the rollup. Local keys sign; a wallet signs first if given. */
  private async send(ixs: TransactionInstruction[], locals: Keypair[], wallet?: { w: DetectedWallet; key: PublicKey }): Promise<Result> {
    const tx = new Transaction().add(...ixs);
    tx.feePayer = wallet?.key ?? locals[0].publicKey; // fee-free on the rollup; no key here holds SOL
    tx.recentBlockhash = (await this.er.getLatestBlockhash()).blockhash;
    try {
      const signed = wallet ? await wallet.w.provider.signTransaction(tx) : tx;
      if (locals.length) signed.partialSign(...locals);
      const sig = await this.er.sendRawTransaction(signed.serialize());
      const conf = await this.er.confirmTransaction(sig, 'confirmed');
      if (conf.value.err) return { ok: false, code: '', reason: JSON.stringify(conf.value.err).slice(0, 100) };
      return { ok: true, sig };
    } catch (e) {
      const m = String((e as Error).message ?? e);
      const code = m.match(/custom program error: (0x[0-9a-f]+)/)?.[1] ?? '';
      return { ok: false, code, reason: ERR[code] ?? m.slice(0, 120) };
    }
  }

  private async readSeed(slot: number): Promise<number> {
    const info = await this.er.getAccountInfo(slotAddress(slot));
    return info ? new DataView(info.data.buffer, info.data.byteOffset).getUint32(40, true) : 0;
  }

  private async freeSlot(): Promise<number> {
    const infos = await this.er.getMultipleAccountsInfo(SLOTS);
    const i = infos.findIndex((info) => info && new PublicKey(info.data.slice(8, 40)).equals(PublicKey.default));
    if (i < 0) throw new Error('all worlds on this server are taken right now; please try again later');
    return i;
  }

  private claimIx(slot: number, claimant: PublicKey, nonce: bigint) {
    return ix('claim_world', new Uint8Array([slot, ...u64(nonce)]),
      [W(REGISTRY), W(slotAddress(slot)), W(passportAddress(slotAddress(slot))), S(claimant)]);
  }
  private transferIx(slot: number, owner: PublicKey, next: PublicKey, kind: IdentityKind) {
    const w = slotAddress(slot);
    return ix('transfer_world', Uint8Array.of(KIND_CODE[kind]), [W(w), W(passportAddress(w)), S(owner), S(next)]);
  }
  private sessionIx(slot: number, owner: PublicKey, session: PublicKey, expires: number) {
    return ix('set_session', new Uint8Array([...session.toBytes(), ...i64(expires), ...u32(SESSION_BUDGET)]), [W(slotAddress(slot)), S(owner)]);
  }

  /** Quick Play: a new browser key claims a free world (proof of work, no SOL). */
  async create(onStatus: (s: string) => void): Promise<GuestRecord> {
    const key = Keypair.generate();
    for (let attempt = 0; attempt < 6; attempt++) {
      const slot = await this.freeSlot();
      onStatus(`preparing world ${slot} (anti-abuse check)…`);
      const nonce = await solveClaimPow(key.publicKey, slot);
      onStatus(`claiming world ${slot}…`);
      const r = await this.send([await this.claimIx(slot, key.publicKey, nonce)], [key]);
      if (r.ok) {
        const rec: GuestRecord = { v: 2, kind: 'guest', secret: Array.from(key.secretKey), slot, seed: await this.readSeed(slot), created: Date.now(), owner: key.publicKey.toBase58() };
        this.save(rec, key);
        return rec;
      }
      onStatus(`${r.reason}; retrying…`);
      await new Promise((res) => setTimeout(res, 800));
    }
    throw new Error('could not create a world; please try again');
  }

  /** Wallet Play, new world: the wallet claims, takes ownership as a wallet
   *  identity and authorises a browser session key, in one signature. */
  async createWithWallet(w: DetectedWallet, onStatus: (s: string) => void): Promise<GuestRecord> {
    const owner = await connectWallet(w);
    const existing = await findOwnedWorlds(this.er, owner, SLOTS);
    if (existing.length) { onStatus('this wallet already owns a world; opening it…'); return this.adoptWithWallet(w, owner, existing[0]); }
    const session = Keypair.generate();
    for (let attempt = 0; attempt < 6; attempt++) {
      const slot = await this.freeSlot();
      onStatus(`preparing world ${slot} (anti-abuse check)…`);
      const nonce = await solveClaimPow(owner, slot);
      const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
      onStatus(`approve in ${w.name}: claim world ${slot} and allow this browser to play it…`);
      const r = await this.send([
        await this.claimIx(slot, owner, nonce),
        await this.transferIx(slot, owner, owner, 'wallet'), // records the wallet identity kind
        await this.sessionIx(slot, owner, session.publicKey, expires),
      ], [], { w, key: owner });
      if (r.ok) {
        const rec: GuestRecord = { v: 2, kind: 'wallet', secret: Array.from(session.secretKey), slot, seed: await this.readSeed(slot), created: Date.now(), owner: owner.toBase58(), wallet: w.name, sessionExpires: expires };
        this.save(rec, session);
        return rec;
      }
      if (r.code !== '0x1780') throw new Error(r.reason);
      onStatus(`${r.reason}; retrying…`);
    }
    throw new Error('could not create a world; please try again');
  }

  /** Quick Play → Protected guest: move ownership to a passkey-derived key. The
   *  old browser key loses all control; this browser keeps playing via a session key. */
  async protectWithPasskey(onStatus: (s: string) => void): Promise<void> {
    if (!this.record || !this.key || this.kind !== 'guest') throw new Error('only a guest world can be protected');
    onStatus('create a passkey for this world…');
    const { key: owner, credentialId } = await createPasskeyKey(`ASTrix world ${this.record.slot}`);
    const session = Keypair.generate();
    const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
    onStatus('moving ownership to your passkey…');
    const slot = this.record.slot;
    const r = await this.send([await this.transferIx(slot, this.key.publicKey, owner.publicKey, 'passkey'),
      await this.sessionIx(slot, owner.publicKey, session.publicKey, expires)], [this.key, owner]);
    if (!r.ok) throw new Error(r.reason);
    this.save({ ...this.record, v: 2, kind: 'passkey', secret: Array.from(session.secretKey), owner: owner.publicKey.toBase58(), credentialId, sessionExpires: expires }, session);
  }

  /** Quick Play (or passkey) → Wallet owner: the same world moves to the wallet. */
  async linkWallet(w: DetectedWallet, onStatus: (s: string) => void): Promise<void> {
    if (!this.record || !this.key) throw new Error('no world to link');
    const wallet = await connectWallet(w);
    const slot = this.record.slot;
    let current: Keypair;
    if (this.kind === 'guest') current = this.key;
    else if (this.kind === 'passkey') { onStatus('confirm with your passkey…'); current = (await getPasskeyKey(this.record.credentialId)).key; }
    else throw new Error('this world is already wallet-owned');
    const session = Keypair.generate();
    const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
    onStatus(`approve in ${w.name}: take ownership of world ${slot}…`);
    const r = await this.send([await this.transferIx(slot, current.publicKey, wallet, 'wallet'),
      await this.sessionIx(slot, wallet, session.publicKey, expires)], [current], { w, key: wallet });
    if (!r.ok) throw new Error(r.reason);
    this.save({ ...this.record, v: 2, kind: 'wallet', secret: Array.from(session.secretKey), owner: wallet.toBase58(), wallet: w.name, credentialId: undefined, sessionExpires: expires }, session);
  }

  private async adoptWithWallet(w: DetectedWallet, owner: PublicKey, world: OwnedWorld): Promise<GuestRecord> {
    const session = Keypair.generate();
    const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
    const r = await this.send([await this.sessionIx(world.slot, owner, session.publicKey, expires)], [], { w, key: owner });
    if (!r.ok) throw new Error(r.reason);
    const rec: GuestRecord = { v: 2, kind: 'wallet', secret: Array.from(session.secretKey), slot: world.slot, seed: world.seed, created: Date.now(), owner: owner.toBase58(), wallet: w.name, sessionExpires: expires };
    this.save(rec, session);
    return rec;
  }

  /** New device or cleared browser: find the world this passkey owns and play it here. */
  async recoverWithPasskey(onStatus: (s: string) => void): Promise<GuestRecord> {
    onStatus('choose your ASTrix passkey…');
    const { key: owner, credentialId } = await getPasskeyKey();
    onStatus('looking up your world…');
    const world = await this.lookup(owner);
    const session = Keypair.generate();
    const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
    const r = await this.send([await this.sessionIx(world.slot, owner.publicKey, session.publicKey, expires)], [owner]);
    if (!r.ok) throw new Error(r.reason);
    const rec: GuestRecord = { v: 2, kind: 'passkey', secret: Array.from(session.secretKey), slot: world.slot, seed: world.seed, created: Date.now(), owner: owner.publicKey.toBase58(), credentialId, sessionExpires: expires };
    this.save(rec, session);
    return rec;
  }

  async recoverWithWallet(w: DetectedWallet, onStatus: (s: string) => void): Promise<GuestRecord> {
    const owner = await connectWallet(w);
    onStatus('looking up your world…');
    const world = await this.lookup({ publicKey: owner });
    onStatus(`approve in ${w.name}: allow this browser to play world ${world.slot}…`);
    return this.adoptWithWallet(w, owner, world);
  }

  private async lookup(owner: { publicKey: PublicKey }): Promise<OwnedWorld> {
    let found: OwnedWorld[];
    try { found = await findOwnedWorlds(this.er, owner.publicKey, SLOTS); } catch {
      found = await findCheckpointedWorlds(this.base, owner.publicKey, SLOTS);
      if (found.length) throw new Error(`world ${found[0].slot} found in its Solana checkpoint${found[0].verified ? ' (hash verified)' : ''}, but the rollup is unreachable right now; try again shortly`);
    }
    if (!found.length) throw new Error('no world is owned by this identity');
    return found[0];
  }

  /** Re-authorise this browser when a passkey or wallet session has ended. */
  async renewSession(wallets: DetectedWallet[], onStatus: (s: string) => void): Promise<void> {
    if (!this.record) throw new Error('no world');
    const session = Keypair.generate();
    const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
    let r: Result;
    if (this.kind === 'passkey') {
      onStatus('confirm with your passkey…');
      const { key } = await getPasskeyKey(this.record.credentialId);
      r = await this.send([await this.sessionIx(this.record.slot, key.publicKey, session.publicKey, expires)], [key]);
    } else if (this.kind === 'wallet') {
      const w = wallets.find((x) => x.name === this.record!.wallet) ?? wallets[0];
      if (!w) throw new Error('no wallet extension found');
      const owner = await connectWallet(w);
      onStatus(`approve in ${w.name}…`);
      r = await this.send([await this.sessionIx(this.record.slot, owner, session.publicKey, expires)], [], { w, key: owner });
    } else return;
    if (!r.ok) throw new Error(r.reason);
    this.save({ ...this.record, secret: Array.from(session.secretKey), sessionExpires: expires }, session);
  }

  async act(kind: 'plant' | 'wood' | 'stone' | 'sawmill' | 'prospect', plot = 0): Promise<Result & { sessionEnded?: boolean }> {
    if (!this.key || !this.address) throw new Error('no world yet');
    const world = W(this.address);
    const me = S(this.key.publicKey);
    let i: TransactionInstruction;
    if (kind === 'plant') i = await ix('plant', Uint8Array.of(plot), [world, me]);
    else if (kind === 'sawmill') i = await ix('build_sawmill', new Uint8Array(), [world, me]);
    else if (kind === 'wood' || kind === 'stone') i = await ix('harvest', Uint8Array.of(kind === 'wood' ? 0 : 1, 4, 0, 0, 0), [world, me]);
    else i = await ix('prospect', Uint8Array.of(Math.floor(Math.random() * 255)), [
      { pubkey: this.key.publicKey, isSigner: true, isWritable: true }, world,
      { pubkey: EPHEMERAL_QUEUE, isSigner: false, isWritable: true },
      { pubkey: IDENTITY, isSigner: false, isWritable: false }, { pubkey: VRF, isSigner: false, isWritable: false },
      { pubkey: SLOT_HASHES, isSigner: false, isWritable: false }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ]);
    const r = await this.send([i], [this.key]);
    return !r.ok && this.kind !== 'guest' && SESSION_ENDED.has(r.code) ? { ...r, reason: 'this browser’s session has ended; renew it', sessionEnded: true } : r;
  }

  /** Guest worlds only: download the owner key as a manual backup. */
  exportKey(): void {
    if (!this.record) return;
    const blob = new Blob([JSON.stringify(this.record)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `astrix-world-${this.record.slot}-${this.record.seed}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  importKey(text: string): boolean {
    try {
      const v = JSON.parse(text) as GuestRecord;
      if (!Array.isArray(v.secret) || v.secret.length !== 64 || !Number.isInteger(v.slot)) return false;
      Keypair.fromSecretKey(Uint8Array.from(v.secret));
      localStorage.setItem(STORE, JSON.stringify(v));
      return true;
    } catch { return false; }
  }

  forget(): void { localStorage.removeItem(STORE); this.record = null; this.key = null; }
}
