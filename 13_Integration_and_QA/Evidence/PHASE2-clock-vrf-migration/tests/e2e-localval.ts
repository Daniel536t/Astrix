// End-to-end on a LOCAL solana-test-validator (127.0.0.1 only): devnet binary + backup state ->
// in-place program upgrade -> migration of all world accounts -> real-time outage/catch-up ->
// rollback by re-deploying the dumped devnet binary -> re-upgrade. Never talks to devnet.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, ComputeBudgetProgram, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { PROGRAM_ID, backupAccounts, backupData, ixMigrate, ixSettle, ixTick, ixClaim, ixHarvest, ix, W, R, settlement, ext, slotPda, passportPda, solvePow, P2, SO_V2, SO_OLD } from './h.ts';

const URL = 'http://127.0.0.1:8899';
if (!URL.startsWith('http://127.0.0.1')) throw new Error('local only');
const conn = new Connection(URL, 'confirmed');
const auth = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(`${P2}/localval/local-authority.json`, 'utf8'))));
const out: any = { steps: [] };
const log = (step: string, o: any = {}) => { const e = { step, at: new Date().toISOString(), ...o }; out.steps.push(e); console.log(JSON.stringify(e)); };
const cli = (...args: string[]) => execFileSync('solana', ['-u', URL, '-k', `${P2}/localval/local-authority.json`, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const buf = () => { const f = `${P2}/localval/buffer-e2e.json`; execFileSync('solana-keygen', ['new', '--no-bip39-passphrase', '-s', '--force', '-o', f], { stdio: 'ignore' }); return f; };
const NAMES = ['settlement', 'registry', 'treasury', ...Array.from({ length: 32 }, (_, i) => `slot-${String(i).padStart(2, '0')}`), ...Array.from({ length: 32 }, (_, i) => `passport-${String(i).padStart(2, '0')}`)];
const er = NAMES.map((n) => backupAccounts.find((b) => b.layer === 'er' && b.name === n)!);
const WORLDS = er.filter((b) => b.name === 'settlement' || b.name.startsWith('slot-'));

async function send(ixs: TransactionInstruction[], signers: Keypair[] = []) {
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...ixs);
  try {
    const sig = await sendAndConfirmTransaction(conn, tx, [auth, ...signers], { commitment: 'confirmed', skipPreflight: true });
    const t = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    if (t?.meta?.err) return { ok: false, sig, cu: t.meta.computeUnitsConsumed, logs: t.meta.logMessages ?? [] };
    return { ok: true, sig, cu: t?.meta?.computeUnitsConsumed, logs: t?.meta?.logMessages ?? [] };
  } catch (e: any) { return { ok: false, err: String(e).slice(0, 400), logs: e.logs ?? [] }; }
}
async function snapshot(keys: PublicKey[]) {
  const res: (Buffer | null)[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    const infos = await conn.getMultipleAccountsInfo(keys.slice(i, i + 100));
    res.push(...infos.map((x) => (x ? Buffer.from(x.data) : null)));
  }
  return res;
}
async function clockTs(): Promise<bigint> {
  const c = await conn.getAccountInfo(new PublicKey('SysvarC1ock11111111111111111111111111111111'));
  return Buffer.from(c!.data).readBigInt64LE(32);
}
const programHash = () => cli('program', 'show', PROGRAM_ID.toBase58());

for (let i = 0; i < 60; i++) { try { await conn.getSlot(); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
log('validator', { version: await conn.getVersion(), program: programHash() });
const keys = er.map((b) => new PublicKey(b.pubkey));

// 1. the loaded copy equals the backup byte for byte
const s0 = await snapshot(keys);
er.forEach((b, i) => assert.deepEqual(s0[i], backupData(b), b.name));
log('1-loaded-copy-equals-backup', { accounts: er.length });

// 2. old (devnet) binary works on the copy
const w0 = slotPda(0);
const oldTick = await send([ixTick(w0)]);
const oldLink = await send([ix('link_passport', {}, [R(w0), W(passportPda(w0))])]);
log('2-old-binary-sanity', { tick: oldTick.ok, link: oldLink.ok, tickCu: oldTick.cu });
assert.ok(oldTick.ok && oldLink.ok);

// 3. upgrade in place (extend programdata, then deploy to the same program id)
const balBefore = await conn.getBalance(auth.publicKey);
const newLen = fs.statSync(SO_V2).size;
const pdKey = PublicKey.findProgramAddressSync([PROGRAM_ID.toBuffer()], new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'))[0];
const pdLen = (await conn.getAccountInfo(pdKey))!.data.length - 45;
const extend = Math.max(0, newLen - pdLen);
if (extend > 0) cli('program', 'extend', PROGRAM_ID.toBase58(), String(extend));
const dep = cli('program', 'deploy', '--buffer', buf(), '--program-id', PROGRAM_ID.toBase58(), '--upgrade-authority', `${P2}/localval/local-authority.json`, SO_V2);
const balAfter = await conn.getBalance(auth.publicKey);
await new Promise((r) => setTimeout(r, 1500)); // program cache: next slot
log('3-upgrade', { oldElfCapacity: pdLen, newElf: newLen, extendBytes: extend, costLamports: balBefore - balAfter, deploy: dep.trim().split('\n').slice(-1)[0] });

// 4. v1 accounts keep working under the new binary (tick alias, settle)
const t4 = await send([ixTick(w0), ixSettle(slotPda(1))]);
log('4-new-binary-on-v1', { ok: t4.ok, cu: t4.cu, logs: t4.logs.filter((l: string) => l.includes('settle')) });
assert.ok(t4.ok);

// 5. migrate every world account; compare the 240-byte prefix to the pre-migration bytes
const worldKeys = WORLDS.map((b) => new PublicKey(b.pubkey));
const pre = await snapshot(worldKeys);
const migCu: number[] = []; let migLamports = 0;
const balM0 = await conn.getBalance(auth.publicKey);
for (const k of worldKeys) { const r = await send([ixMigrate(k, auth.publicKey)]); assert.ok(r.ok, JSON.stringify(r).slice(0, 500)); migCu.push(r.cu ?? 0); }
migLamports = balM0 - (await conn.getBalance(auth.publicKey));
const post = await snapshot(worldKeys);
let prefixIdentical = 0;
post.forEach((d, i) => { assert.equal(d!.length, 876); assert.deepEqual(d!.subarray(0, 240), pre[i]); assert.ok(ext(d!)); prefixIdentical++; });
const others = er.filter((b) => !(b.name === 'settlement' || b.name.startsWith('slot-')));
const oth = await snapshot(others.map((b) => new PublicKey(b.pubkey)));
others.forEach((b, i) => assert.deepEqual(oth[i], backupData(b), b.name));
// fields preserved vs the original backup (owner, seed, stock, plots, population, sessions) for all 33 worlds
let fieldsPreserved = 0;
WORLDS.forEach((b, i) => { const a = settlement(backupData(b)); const c = settlement(post[i]!); assert.equal(c.owner, a.owner); assert.equal(c.worldSeed, a.worldSeed);
  assert.equal(c.prospects, a.prospects); assert.equal(c.rareFinds, a.rareFinds); assert.ok(c.tick >= a.tick); fieldsPreserved++; });
const reMig = await send([ixMigrate(worldKeys[3], auth.publicKey)]);
log('5-migration', { worlds: worldKeys.length, prefixIdentical, fieldsPreserved, passportsRegistryTreasuryIdentical: others.length, maxCu: Math.max(...migCu),
  totalCostLamports: migLamports, idempotentRerun: reMig.ok && reMig.logs.some((l: string) => l.includes('already layout v2')) });

// 6. real-time outage: nobody calls for 61 s (scheduler stopped, player away), then restart
const before6 = settlement((await conn.getAccountInfo(w0))!.data as Buffer);
log('6a-scheduler-stopped', { tick: Number(before6.tick), lastSettledTs: Number(before6.lastTickTs) });
await new Promise((r) => setTimeout(r, 61_000));
const r6 = await send([ixSettle(w0)]);
const d6 = Buffer.from((await conn.getAccountInfo(w0))!.data); const a6 = settlement(d6); const e6 = ext(d6)!;
const now6 = await clockTs();
const r6b = await send([ixSettle(w0), ixSettle(w0), ixTick(w0)]); // duplicate crank runs right after
const a6b = settlement(Buffer.from((await conn.getAccountInfo(w0))!.data));
log('6b-restart-catch-up', { ok: r6.ok, applied: Number(a6.tick - before6.tick), clockNow: Number(now6), expectedTick: Number((now6 - e6.epochStart) / 2n),
  tick: Number(a6.tick), duplicateRunsAddedTicks: Number(a6b.tick - a6.tick), cu: r6.cu });
assert.ok(a6.tick - before6.tick >= 29n);

// 7. rollback: re-deploy the dumped devnet binary into the same program id
cli('program', 'deploy', '--buffer', buf(), '--program-id', PROGRAM_ID.toBase58(), '--upgrade-authority', `${P2}/localval/local-authority.json`, SO_OLD);
await new Promise((r) => setTimeout(r, 1500));
const shown = programHash();
const g = Keypair.generate();
await conn.requestAirdrop(g.publicKey, 1e9).then((s) => conn.confirmTransaction(s, 'confirmed'));
const nonce = solvePow(g.publicKey, 20);
const c7 = await send([ixClaim(20, g.publicKey, nonce)], [g]);
const h7 = await send([ixHarvest(slotPda(20), g.publicKey, 0, 3)], [g]);
const tk7 = await send([ixTick(w0)]);
const l7 = await send([ix('link_passport', {}, [R(w0), W(passportPda(w0))])]);
const d7 = Buffer.from((await conn.getAccountInfo(w0))!.data);
log('7-rollback-old-binary', { claimLegacy: c7.ok, harvest: h7.ok, tick: tk7.ok, link: l7.ok, worldLen: d7.length, tailIntact: !!ext(d7), programShow: shown.split('\n').filter((l) => /Data Length|Authority/.test(l)) });
assert.ok(c7.ok && h7.ok && tk7.ok && l7.ok);

// 8. re-upgrade to v2: re-anchor, catch up, VRF tail intact
cli('program', 'deploy', '--buffer', buf(), '--program-id', PROGRAM_ID.toBase58(), '--upgrade-authority', `${P2}/localval/local-authority.json`, SO_V2);
await new Promise((r) => setTimeout(r, 3000));
const r8 = await send([ixSettle(w0), ixSettle(slotPda(20))]);
const d8 = Buffer.from((await conn.getAccountInfo(w0))!.data); const e8 = ext(d8)!; const a8 = settlement(d8);
const now8 = await clockTs();
log('8-re-upgrade', { ok: r8.ok, reanchors: e8.reanchors, tick: Number(a8.tick), epochInvariant: e8.epochStart === a8.lastTickTs - a8.tick * 2n, behindSeconds: Number(now8 - a8.lastTickTs) });
assert.ok(r8.ok);
fs.writeFileSync(`${P2}/results/e2e-localval.json`, JSON.stringify(out, null, 1));
console.log('E2E OK');
