// Guest identity and player-owned world on the MagicBlock rollup.
//
// The guest keypair is generated in this browser and its secret never leaves
// it: no server sees it, ASTrix does not custody it. It holds no SOL and needs
// none: transactions on the Ephemeral Rollup are fee-free (verified on devnet).
// Limitation, shown to the player: the key lives only in this browser's
// storage; clearing site data loses the world unless the key was exported.
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { CHAIN } from './settlement';

const STORE = 'astrix:guest:v1';
export const REGISTRY = PublicKey.findProgramAddressSync([new TextEncoder().encode('astrix-registry'), CHAIN.owner.toBytes()], CHAIN.programId)[0];
export const SLOT_COUNT = 16;
export const slotAddress = (i: number) =>
  PublicKey.findProgramAddressSync([new TextEncoder().encode('world-slot'), CHAIN.owner.toBytes(), Uint8Array.of(i)], CHAIN.programId)[0];
const IDENTITY = PublicKey.findProgramAddressSync([new TextEncoder().encode('identity')], CHAIN.programId)[0];
const VRF = new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz');
const EPHEMERAL_QUEUE = new PublicKey('5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc');
const SLOT_HASHES = new PublicKey('SysvarS1otHashes111111111111111111111111111');
const ERR: Record<string, string> = {
  '0x1780': 'that world slot was just taken', '0x1781': 'many worlds are being created right now',
  '0x1772': 'not your world', '0x177a': 'not enough resources', '0x1779': 'plot already planted',
  '0x177b': 'already built', '0x177c': 'a prospect is already in progress',
};

export interface GuestRecord { secret: number[]; slot: number; seed: number; created: number; }

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

export class GuestWorld {
  private er = new Connection(CHAIN.erRpc, 'confirmed');
  record: GuestRecord | null = loadGuest();
  private key: Keypair | null = this.record ? Keypair.fromSecretKey(Uint8Array.from(this.record.secret)) : null;

  get address(): PublicKey | null { return this.record ? slotAddress(this.record.slot) : null; }
  get publicKey(): string | null { return this.key?.publicKey.toBase58() ?? null; }

  private async send(name: string, args: Uint8Array, keys: TransactionInstruction['keys'], signer: Keypair) {
    const data = new Uint8Array([...(await discriminator(name)), ...args]);
    const tx = new Transaction().add(new TransactionInstruction({ programId: CHAIN.programId, keys, data: Buffer.from(data) }));
    tx.feePayer = signer.publicKey; // fee-free on the rollup; the guest key holds 0 SOL
    tx.recentBlockhash = (await this.er.getLatestBlockhash()).blockhash;
    tx.sign(signer);
    try {
      const sig = await this.er.sendRawTransaction(tx.serialize());
      await this.er.confirmTransaction(sig, 'confirmed');
      return { ok: true as const, sig };
    } catch (e) {
      const m = String((e as Error).message);
      const code = m.match(/custom program error: (0x[0-9a-f]+)/)?.[1] ?? '';
      return { ok: false as const, code, reason: ERR[code] ?? m.slice(0, 100) };
    }
  }

  /** Create this browser's own world: new key, claim a free pre-funded slot. */
  async create(onStatus: (s: string) => void): Promise<GuestRecord> {
    const key = Keypair.generate();
    for (let attempt = 0; attempt < 8; attempt++) {
      let slot = -1;
      for (let i = 0; i < SLOT_COUNT; i++) {
        const info = await this.er.getAccountInfo(slotAddress(i));
        if (info && new PublicKey(info.data.slice(8, 40)).equals(PublicKey.default)) { slot = i; break; }
      }
      if (slot < 0) throw new Error('all demo worlds are taken right now — please try again later');
      onStatus(`claiming world slot ${slot}…`);
      const r = await this.send('claim_world', Uint8Array.of(slot), [
        { pubkey: REGISTRY, isSigner: false, isWritable: true },
        { pubkey: slotAddress(slot), isSigner: false, isWritable: true },
        { pubkey: key.publicKey, isSigner: true, isWritable: false },
      ], key);
      if (r.ok) {
        const info = await this.er.getAccountInfo(slotAddress(slot));
        const seed = info ? new DataView(info.data.buffer, info.data.byteOffset).getUint32(40, true) : 0;
        this.record = { secret: Array.from(key.secretKey), slot, seed, created: Date.now() };
        this.key = key;
        localStorage.setItem(STORE, JSON.stringify(this.record));
        return this.record;
      }
      onStatus(`${r.reason}; retrying…`);
      await new Promise((res) => setTimeout(res, r.code === '0x1781' ? 5000 : 800));
    }
    throw new Error('could not create a world; please try again');
  }

  async act(kind: 'plant' | 'wood' | 'stone' | 'sawmill' | 'prospect', plot = 0) {
    if (!this.key || !this.address) throw new Error('no world yet');
    const world = { pubkey: this.address, isSigner: false, isWritable: true };
    const me = { pubkey: this.key.publicKey, isSigner: true, isWritable: false };
    if (kind === 'plant') return this.send('plant', Uint8Array.of(plot), [world, me], this.key);
    if (kind === 'sawmill') return this.send('build_sawmill', new Uint8Array(), [world, me], this.key);
    if (kind === 'wood' || kind === 'stone') return this.send('harvest', Uint8Array.of(kind === 'wood' ? 0 : 1, 4, 0, 0, 0), [world, me], this.key);
    return this.send('prospect', Uint8Array.of(Math.floor(Math.random() * 255)), [
      { pubkey: this.key.publicKey, isSigner: true, isWritable: true }, world,
      { pubkey: EPHEMERAL_QUEUE, isSigner: false, isWritable: true },
      { pubkey: IDENTITY, isSigner: false, isWritable: false }, { pubkey: VRF, isSigner: false, isWritable: false },
      { pubkey: SLOT_HASHES, isSigner: false, isWritable: false }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ], this.key);
  }

  /** Download the guest key so the player can keep or move their world. */
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
