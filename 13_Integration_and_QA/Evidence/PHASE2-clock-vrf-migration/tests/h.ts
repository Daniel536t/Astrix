// PHASE2 local test harness (LiteSVM, no network). Loads the ASTrix program, a TEST-ONLY mock VRF
// at the VRF program id, optionally the devnet DLP binary, and accounts from the PHASE2 backup.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { LiteSVM, Clock, TransactionMetadata, FailedTransactionMetadata } from 'litesvm';
import { Account as SvmAccount } from 'litesvm/dist/internal.js';
import { Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js';
import { BorshCoder } from '@coral-xyz/anchor';

export const P2 = '/projects/sandbox/.tools/scratch/phase2';
export const PROGRAM_ID = new PublicKey('Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy');
export const VRF_ID = new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz');
export const DLP_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
export const EPHEMERAL_QUEUE = new PublicKey('5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc');
export const SLOT_HASHES = new PublicKey('SysvarS1otHashes111111111111111111111111111');
export const ADMIN = new PublicKey('GVbuuocW6hzMcsCAsvX6AAJnGDo3VZHwTmSLGhkZSw32');
export const SO_V2 = `${P2}/build/v2/astrix_settlement.so`;
export const SO_OLD = `${P2}/backup/program/astrix_settlement.devnet.so`;
export const SO_MOCK = `${P2}/build/mock/mock_vrf.so`;
export const SO_DLP = `${P2}/backup/program/dlp.devnet.so`;
export const idl = JSON.parse(fs.readFileSync(`${P2}/ws/idl-v2.json`, 'utf8'));
export const coder = new BorshCoder(idl);
export const V1_LEN = 240, V2_LEN = 876, EXT = 240;

export const pda = (seeds: Buffer[], prog = PROGRAM_ID) => PublicKey.findProgramAddressSync(seeds, prog)[0];
export const slotPda = (i: number, admin = ADMIN) => pda([Buffer.from('world-slot'), admin.toBuffer(), Buffer.from([i])]);
export const passportPda = (w: PublicKey) => pda([Buffer.from('passport'), w.toBuffer()]);
export const registryPda = (admin = ADMIN) => pda([Buffer.from('astrix-registry'), admin.toBuffer()]);
export const settlementPda = (o = ADMIN) => pda([Buffer.from('astrix-settlement'), o.toBuffer()]);
export const treasuryPda = (a = ADMIN) => pda([Buffer.from('checkpoint-treasury'), a.toBuffer()]);
export const PROGRAM_IDENTITY = pda([Buffer.from('identity')]);
export const VRF_SCOPED_IDENTITY = PublicKey.findProgramAddressSync([Buffer.from('identity'), PROGRAM_ID.toBuffer()], VRF_ID)[0];
export const dlpPda = (tag: string, acc: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from(tag), acc.toBuffer()], DLP_ID)[0];

export function loadAdmin(): Keypair {
  // The devnet admin key is used ONLY to sign transactions inside this in-process SVM (no RPC).
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/projects/sandbox/.tools/wallets/astrix-devnet.json', 'utf8'))));
}

const manifest = JSON.parse(fs.readFileSync(`${P2}/backup/manifest.json`, 'utf8'));
export type Backup = { layer: string; name: string; pubkey: string; owner: string; lamports: number; file: string };
export const backupAccounts: Backup[] = manifest.accounts.filter((a: any) => a.exists);
export const backupOf = (layer: 'base' | 'er', name: string) => backupAccounts.find((a) => a.layer === layer && a.name === name)!;
export const backupData = (b: Backup) => fs.readFileSync(`${P2}/backup/${b.file}`);

export class Env {
  svm: LiteSVM;
  inner: any;
  payer = Keypair.generate();
  now = 1_795_733_400n; // ~ the ER clock at backup time
  slot = 1_000n;
  constructor(opts: { program?: string; dlp?: boolean; mock?: boolean } = {}) {
    this.svm = new LiteSVM();
    this.inner = (this.svm as any).inner;
    this.inner.addProgramFromFile(PROGRAM_ID.toBytes(), opts.program ?? SO_V2);
    if (opts.mock !== false) {
      this.inner.addProgramFromFile(VRF_ID.toBytes(), SO_MOCK);
      this.setRaw(EPHEMERAL_QUEUE, Buffer.alloc(64 * 1024), VRF_ID, 10_000_000_000);
    }
    if (opts.dlp) this.inner.addProgramFromFile(DLP_ID.toBytes(), SO_DLP);
    this.inner.airdrop(this.payer.publicKey.toBytes(), 100_000_000_000n);
    this.setClock();
  }
  replaceProgram(path: string) { this.inner.addProgramFromFile(PROGRAM_ID.toBytes(), path); this.svm.expireBlockhash(); }
  setClock() {
    const c = this.svm.getClock();
    this.svm.setClock(new Clock(this.slot, c.epochStartTimestamp, c.epoch, c.leaderScheduleEpoch, this.now));
  }
  /** Advance the authoritative clock (the ER Clock sysvar in production) and the slot. */
  advance(seconds: number, slots = Math.max(1, Math.round(seconds * 100))) {
    this.now += BigInt(seconds); this.slot += BigInt(slots); this.svm.warpToSlot(this.slot); this.setClock(); this.svm.expireBlockhash();
  }
  warpSlots(n: number) { this.slot += BigInt(n); this.svm.warpToSlot(this.slot); this.setClock(); this.svm.expireBlockhash(); }
  setTime(ts: bigint) { this.now = ts; this.setClock(); this.svm.expireBlockhash(); }
  setRaw(key: PublicKey, data: Buffer, owner: PublicKey, lamports: number | bigint) {
    this.inner.setAccount(key.toBytes(), new SvmAccount(BigInt(lamports), Uint8Array.from(data), owner.toBytes(), false, 0n));
  }
  loadBackup(b: Backup, ownerOverride?: PublicKey) {
    this.setRaw(new PublicKey(b.pubkey), backupData(b), ownerOverride ?? new PublicKey(b.owner), b.lamports);
  }
  account(key: PublicKey): { lamports: bigint; data: Buffer; owner: PublicKey } | null {
    const a = this.inner.getAccount(key.toBytes());
    return a ? { lamports: BigInt(a.lamports()), data: Buffer.from(a.data()), owner: new PublicKey(a.owner()) } : null;
  }
  data(key: PublicKey): Buffer { return this.account(key)?.data ?? Buffer.alloc(0); }
  fund(k: PublicKey, sol = 10) { this.inner.airdrop(k.toBytes(), BigInt(sol * 1e9)); }
  send(ixs: TransactionInstruction[], signers: Keypair[] = [], cuLimit = 1_400_000): Result {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }), ...ixs);
    tx.feePayer = this.payer.publicKey;
    tx.recentBlockhash = this.inner.latestBlockhash();
    tx.sign(this.payer, ...signers.filter((s) => !s.publicKey.equals(this.payer.publicKey)));
    const r = this.inner.sendLegacyTransaction(tx.serialize());
    this.svm.expireBlockhash();
    if (typeof r.err === 'function') {
      const m = r.meta();
      return { ok: false, cu: Number(m.computeUnitsConsumed()), logs: m.logs(), err: r.toString() };
    }
    return { ok: true, cu: Number(r.computeUnitsConsumed()), logs: r.logs(), err: '' };
  }
}
export type Result = { ok: boolean; cu: number; logs: string[]; err: string };

/** Anchor instruction from the v2 IDL; `accounts` in IDL order (w = writable, s = signer). */
export function ix(name: string, args: Record<string, unknown>, keys: { pubkey: PublicKey; w?: boolean; s?: boolean }[]): TransactionInstruction {
  const data = coder.instruction.encode(name, args);
  return new TransactionInstruction({ programId: PROGRAM_ID, data, keys: keys.map((k) => ({ pubkey: k.pubkey, isWritable: !!k.w, isSigner: !!k.s })) });
}
export const W = (pubkey: PublicKey) => ({ pubkey, w: true });
export const R = (pubkey: PublicKey) => ({ pubkey });
export const S = (pubkey: PublicKey, w = false) => ({ pubkey, s: true, w });

export const ixSettle = (w: PublicKey) => ix('settle', {}, [W(w)]);
export const ixTick = (w: PublicKey) => ix('tick', {}, [W(w)]);
export const ixMigrate = (w: PublicKey, payer: PublicKey) => ix('migrate_world', {}, [W(w), S(payer, true), R(SystemProgram.programId)]);
export const ixHarvest = (w: PublicKey, signer: PublicKey, resource: number, amount: number) => ix('harvest', { resource, amount }, [W(w), S(signer)]);
export const ixPlant = (w: PublicKey, signer: PublicKey, plot: number) => ix('plant', { plot }, [W(w), S(signer)]);
export const ixSawmill = (w: PublicKey, signer: PublicKey) => ix('build_sawmill', {}, [W(w), S(signer)]);
const vrfAccounts = (payer: PublicKey, w: PublicKey) => [S(payer, true), W(w), W(EPHEMERAL_QUEUE), R(PROGRAM_IDENTITY), R(VRF_ID), R(SLOT_HASHES), R(SystemProgram.programId)];
export const ixProspect = (w: PublicKey, payer: PublicKey, clientSeed = 7) => ix('prospect', { client_seed: clientSeed }, vrfAccounts(payer, w));
export const ixRetryGenesis = (w: PublicKey, payer: PublicKey) => ix('retry_genesis', {}, vrfAccounts(payer, w));
export const ixCancelProspect = (w: PublicKey, owner: PublicKey) => ix('cancel_prospect', {}, [W(w), S(owner)]);
export const ixClaim = (i: number, guest: PublicKey, nonce: bigint, admin = ADMIN) =>
  ix('claim_world', { index: i, nonce: new (require_bn())(nonce.toString()) }, [W(registryPda(admin)), W(slotPda(i, admin)), W(passportPda(slotPda(i, admin))), S(guest)]);
export const ixClaimVrf = (i: number, guest: PublicKey, nonce: bigint, configHash: number[], admin = ADMIN) =>
  ix('claim_world_vrf', { index: i, nonce: new (require_bn())(nonce.toString()), config_hash: configHash },
    [W(registryPda(admin)), W(slotPda(i, admin)), W(passportPda(slotPda(i, admin))), S(guest, true), W(EPHEMERAL_QUEUE), R(PROGRAM_IDENTITY), R(VRF_ID), R(SLOT_HASHES), R(SystemProgram.programId)]);
import anchorPkg from '@coral-xyz/anchor';
function require_bn() { return (anchorPkg as any).BN; }
export const BN = require_bn();

/** Mock VRF fulfilment of queue item `idx` with `rnd` (TEST ONLY; real fulfilment carries a proof). */
export function ixFulfil(idx: number, rnd: Buffer, callbackAccounts: PublicKey[], forgedArgs?: Buffer): TransactionInstruction {
  const head = Buffer.alloc(5); head[0] = forgedArgs ? 201 : 200; head.writeUInt32LE(idx, 1);
  const parts = [head, rnd];
  if (forgedArgs) { const n = Buffer.alloc(4); n.writeUInt32LE(forgedArgs.length); parts.push(n, forgedArgs); }
  return new TransactionInstruction({
    programId: VRF_ID, data: Buffer.concat(parts),
    keys: [{ pubkey: VRF_SCOPED_IDENTITY, isSigner: false, isWritable: false }, { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: EPHEMERAL_QUEUE, isSigner: false, isWritable: false }, ...callbackAccounts.map((k) => ({ pubkey: k, isSigner: false, isWritable: true }))],
  });
}
export function queueItems(env: Env): Buffer[] {
  const q = env.data(EPHEMERAL_QUEUE); const n = q.readUInt32LE(0); const out: Buffer[] = []; let o = 4;
  for (let i = 0; i < n; i++) { const l = q.readUInt32LE(o); out.push(q.subarray(o + 4, o + 4 + l)); o += 4 + l; }
  return out;
}
/** Decodes the callback args (VrfTicket) of a queued request. */
export function queuedTicket(item: Buffer) {
  let o = 64; const dl = item.readUInt32LE(o); o += 4 + dl; const m = item.readUInt32LE(o); o += 4 + m * 34; const al = item.readUInt32LE(o); o += 4;
  const a = item.subarray(o, o + al);
  return { raw: Buffer.from(a), callerSeed: item.subarray(0, 32), world: new PublicKey(a.subarray(0, 32)), requestId: a.readBigUInt64LE(32), prospectId: a.readUInt32LE(40), nonce: a.readBigUInt64LE(44), kind: a[52] };
}

// ---------- decoding ----------
export function settlement(d: Buffer) {
  return {
    owner: new PublicKey(d.subarray(8, 40)).toBase58(), worldSeed: d.readUInt32LE(40), tick: d.readBigUInt64LE(46), lastTickTs: d.readBigInt64LE(54),
    interval: d.readBigInt64LE(62), stock: Array.from({ length: 8 }, (_, i) => d.readUInt32LE(70 + 4 * i)),
    plots: Array.from({ length: 9 }, (_, i) => d.readBigUInt64LE(102 + 8 * i)), population: d.readUInt16LE(174), sawmill: d[176] === 1,
    prospectPending: d[177] === 1, prospects: d.readUInt32LE(178), lastFind: d[182], lastRoll: d[183], rareFinds: d.readUInt32LE(184),
  };
}
export function ext(d: Buffer) {
  if (d.length < V2_LEN || d.subarray(EXT, EXT + 4).toString() !== 'AXv2') return null;
  const e = d.subarray(EXT);
  const rec = (o: number) => ({ seq: e.readBigUInt64LE(o), requestId: e.readBigUInt64LE(o + 8), prospectId: e.readUInt32LE(o + 16), kind: e[o + 20], outcome: e[o + 21],
    find: e[o + 22], epochLo: e[o + 23], worldTick: e.readBigUInt64LE(o + 24), ts: e.readBigInt64LE(o + 32), randomness: Buffer.from(e.subarray(o + 40, o + 72)), raw: Buffer.from(e.subarray(o, o + 72)) });
  return {
    layout: e[4], rules: e[5], seedOrigin: e[6], flags: e[7], stateEpoch: e.readUInt32LE(8), epochStart: e.readBigInt64LE(12), maxClockTs: e.readBigInt64LE(20),
    clockRegressions: e.readUInt32LE(28), reanchors: e.readUInt32LE(32), lastSettleSlot: e.readBigUInt64LE(36), settledStepsTotal: e.readBigUInt64LE(44),
    migratedTs: e.readBigInt64LE(52), migratedFromTick: e.readBigUInt64LE(60), nextRequestId: e.readBigUInt64LE(68),
    pending: { requestId: e.readBigUInt64LE(76), nonce: e.readBigUInt64LE(84), prospectId: e.readUInt32LE(92), kind: e[96], requestedTs: e.readBigInt64LE(100), requestedSlot: e.readBigUInt64LE(108) },
    journalSeq: e.readBigUInt64LE(116), journalHash: Buffer.from(e.subarray(124, 156)), recent: [0, 1, 2, 3].map((i) => rec(156 + 72 * i)),
    genesisCommitment: Buffer.from(e.subarray(444, 476)), genesisRandomness: Buffer.from(e.subarray(476, 508)), reserved: Buffer.from(e.subarray(508, 636)),
  };
}
export const sha256 = (...b: Buffer[]) => crypto.createHash('sha256').update(Buffer.concat(b)).digest();
export const journalGenesis = (w: PublicKey) => sha256(Buffer.from('astrix-journal-v1'), w.toBuffer());
/** Decode Anchor `JournalEvent`s from program logs ("Program data: <base64>"). */
export function journalEvents(logs: string[]) {
  return logs.filter((l) => l.startsWith('Program data: ')).map((l) => coder.events.decode(l.slice('Program data: '.length))).filter(Boolean) as any[];
}
/** Recompute the on-chain journal hash from emitted events (the off-chain journal check). */
export function replayJournal(world: PublicKey, events: any[], start = journalGenesis(world)) {
  let h = start;
  for (const ev of events) {
    const d = ev.data;
    const r = Buffer.alloc(72);
    r.writeBigUInt64LE(BigInt(d.seq.toString()), 0); r.writeBigUInt64LE(BigInt(d.request_id.toString()), 8); r.writeUInt32LE(d.prospect_id, 16);
    r[20] = d.kind; r[21] = d.outcome; r[22] = d.find; r[23] = d.state_epoch & 0xff; r.writeBigUInt64LE(BigInt(d.world_tick.toString()), 24);
    r.writeBigInt64LE(BigInt(d.ts.toString()), 32); Buffer.from(d.randomness).copy(r, 40);
    h = sha256(h, world.toBuffer(), r);
  }
  return h;
}

/** Claim proof of work: sha256(guest || slot || nonce LE) with >= 18 leading zero bits. */
export function solvePow(guest: PublicKey, slot: number): bigint {
  const g = guest.toBuffer();
  for (let n = 0n; ; n++) {
    const nb = Buffer.alloc(8); nb.writeBigUInt64LE(n);
    const h = sha256(g, Buffer.from([slot]), nb);
    if (h[0] === 0 && h[1] === 0 && h[2] < 64) return n;
  }
}
export const err = (r: Result) => (r.logs.find((l) => l.includes('Error Code:')) ?? r.err).replace(/.*Error Code: /, '').split('.')[0];
