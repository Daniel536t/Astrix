// Migration of the full backup copy (ER state as it would be after commit+undelegate: program-owned),
// byte-level preservation, old-binary compatibility, and the escape hatch against the devnet DLP binary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { Env, backupAccounts, backupData, ixMigrate, ixTick, ixSettle, ix, W, R, S, settlement, ext, err, slotPda, passportPda, registryPda,
  settlementPda, treasuryPda, PROGRAM_ID, DLP_ID, dlpPda, loadAdmin, SO_OLD, SO_V2, ADMIN, journalGenesis, sha256 } from './h.ts';
import { prefix, record } from './common.ts';

const WORLD_NAMES = ['settlement', ...Array.from({ length: 32 }, (_, i) => `slot-${String(i).padStart(2, '0')}`)];
const OTHER_NAMES = ['registry', 'treasury', ...Array.from({ length: 32 }, (_, i) => `passport-${String(i).padStart(2, '0')}`)];

function loadAllEr(env: Env) {
  const loaded = backupAccounts.filter((b) => b.layer === 'er' && (WORLD_NAMES.includes(b.name) || OTHER_NAMES.includes(b.name)));
  for (const b of loaded) env.loadBackup(b); // owner = program, exactly as on the ER / after undelegation
  return loaded;
}

test('MIGRATION: all 33 world accounts + 32 passports + registry + treasury from the backup copy', () => {
  const env = new Env();
  const loaded = loadAllEr(env);
  assert.equal(loaded.length, 67);
  const rent876 = env.svm.minimumBalanceForRentExemption(876n);
  const rows: any[] = []; let totalLamports = 0n; let maxCu = 0;
  for (const b of loaded) {
    const key = new PublicKey(b.pubkey); const orig = backupData(b);
    if (!WORLD_NAMES.includes(b.name)) continue;
    const r = env.send([ixMigrate(key, env.payer.publicKey)]);
    assert.ok(r.ok, `${b.name}: ${r.err}`);
    maxCu = Math.max(maxCu, r.cu);
    const a = env.account(key)!;
    assert.equal(a.data.length, 876, b.name);
    assert.deepEqual(prefix(a.data), orig, `${b.name}: v1 prefix byte-identical`);
    assert.equal(a.lamports, rent876, `${b.name}: exactly rent-exempt at 876 bytes`);
    totalLamports += a.lamports - BigInt(b.lamports);
    const e = ext(a.data)!;
    const s = settlement(a.data);
    assert.equal(e.layout, 2); assert.equal(e.seedOrigin, 0); assert.equal(e.stateEpoch, 0); assert.equal(e.pending.kind, 0);
    assert.equal(e.epochStart, s.lastTickTs - s.tick * s.interval);
    assert.equal(e.migratedFromTick, s.tick); assert.equal(e.nextRequestId, 1n); assert.equal(e.journalSeq, 1n);
    assert.ok(e.reserved.every((x) => x === 0));
    // idempotent
    const again = env.send([ixMigrate(key, env.payer.publicKey)]);
    assert.ok(again.ok); assert.deepEqual(env.data(key), a.data);
    rows.push({ name: b.name, tick: Number(s.tick), seed: s.worldSeed, owner: s.owner.slice(0, 6), addedLamports: Number(a.lamports - BigInt(b.lamports)) });
  }
  // passports, registry, treasury untouched byte for byte
  for (const b of loaded.filter((x) => OTHER_NAMES.includes(x.name))) {
    const a = env.account(new PublicKey(b.pubkey))!;
    assert.deepEqual(a.data, backupData(b), b.name); assert.equal(a.lamports, BigInt(b.lamports), b.name);
  }
  // every migrated world still works: settle, link_passport (reads world), and the passport/world binding
  for (let i = 0; i < 32; i++) {
    const w = slotPda(i);
    assert.ok(env.send([ix('link_passport', {}, [R(w), W(passportPda(w))])]).ok, `link ${i}`);
  }
  record('migration.jsonl', { test: 'migrate-all', worlds: rows.length, others: 34, totalAddedLamports: Number(totalLamports), maxCu, rows });
});

test('MIGRATION: the base-layer (stale, delegated) copies also migrate once undelegated; data preserved', () => {
  const env = new Env();
  const rows = [];
  for (const name of WORLD_NAMES) {
    const b = backupAccounts.find((x) => x.layer === 'base' && x.name === name)!;
    env.loadBackup(b, PROGRAM_ID); // as if returned to the program
    const key = new PublicKey(b.pubkey);
    assert.ok(env.send([ixMigrate(key, env.payer.publicKey)]).ok);
    assert.deepEqual(prefix(env.data(key)), backupData(b));
    rows.push(name);
  }
  assert.equal(rows.length, 33);
});

test('ROLLBACK: the dumped devnet binary works on migrated (v2) accounts; re-upgrade continues correctly', () => {
  const env = new Env();
  loadAllEr(env);
  for (const n of WORLD_NAMES) { const b = backupAccounts.find((x) => x.layer === 'er' && x.name === n)!; assert.ok(env.send([ixMigrate(new PublicKey(b.pubkey), env.payer.publicKey)]).ok); }
  const w = slotPda(0);
  const t0 = settlement(env.data(w)).tick;
  env.setTime(settlement(env.data(w)).lastTickTs + 1n);
  env.replaceProgram(SO_OLD); // "re-deploy the dumped old binary"
  const results: Record<string, boolean> = {};
  for (let i = 0; i < 3; i++) { env.advance(2); results[`old tick ${i}`] = env.send([ixTick(w)]).ok; }
  results['old link_passport'] = env.send([ix('link_passport', {}, [R(w), W(passportPda(w))])]).ok;
  const admin = loadAdmin();
  results['old tick demo settlement'] = env.send([ixTick(settlementPda())]).ok;
  // the old harvest on the admin's demo settlement (owner GVbu...) — signed inside the local SVM only
  results['old harvest demo settlement'] = env.send([ix('harvest', { resource: 0, amount: 2 }, [W(settlementPda()), S(admin.publicKey)])], [admin]).ok;
  assert.equal(env.data(w).length, 876);
  assert.ok(Object.values(results).every(Boolean), JSON.stringify(results));
  assert.equal(settlement(env.data(w)).tick - t0, 3n);
  const tailBefore = env.data(w).subarray(240);
  env.replaceProgram(SO_V2);
  assert.deepEqual(env.data(w).subarray(240), tailBefore, 'old binary did not touch the v2 tail');
  env.advance(10);
  assert.ok(env.send([ixSettle(w)]).ok);
  assert.equal(settlement(env.data(w)).tick - t0, 8n);
  record('migration.jsonl', { test: 'rollback-binary', results });
});

// ---------- escape hatch with the real devnet DLP binary ----------
function loadDelegated(env: Env, name: string) {
  for (const b of backupAccounts.filter((x) => x.layer === 'base' && (x.name === name || x.name.startsWith(name + '.')))) env.loadBackup(b);
}
const escapeAccounts = (payer: PublicKey, delegated: PublicKey) => ({
  request: [S(payer, true), W(delegated), R(PROGRAM_ID), W(dlpPda('undelegation-request', delegated)), R(dlpPda('delegation', delegated)),
    W(dlpPda('delegation-metadata', delegated)), R(DLP_ID), R(SystemProgram.programId)],
  rollback: [S(payer, true), W(delegated), R(PROGRAM_ID), W(dlpPda('undelegation-request', delegated)), W(dlpPda('delegation', delegated)),
    W(dlpPda('delegation-metadata', delegated)), W(dlpPda('state-diff', delegated)), W(dlpPda('commit-state-record', delegated)),
    W(new PublicKey('MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e')), R(DLP_ID)],
});

test('ESCAPE HATCH (devnet DLP binary): request_undelegation, refused before 9,000 slots, rollback after; data restored', () => {
  const env = new Env({ dlp: true });
  const admin = loadAdmin(); env.fund(admin.publicKey, 5);
  const out: any = {};
  for (const [kind, index, name, key] of [[2, 3, 'slot-03', slotPda(3)], [3, 3, 'passport-03', passportPda(slotPda(3))], [1, 0, 'registry', registryPda()],
    [4, 0, 'treasury', treasuryPda()], [0, 0, 'settlement', settlementPda()]] as [number, number, string, PublicKey][]) {
    loadDelegated(env, name);
    const base = backupAccounts.find((x) => x.layer === 'base' && x.name === name)!;
    const acc = escapeAccounts(admin.publicKey, key);
    const rq = env.send([ix('request_undelegation', { kind, index }, acc.request)], [admin]);
    assert.ok(rq.ok, `${name} request: ${rq.err}\n${rq.logs.join('\n')}`);
    const reqAcc = env.account(dlpPda('undelegation-request', key))!;
    assert.equal(reqAcc.owner.toBase58(), DLP_ID.toBase58());
    const rq2 = env.send([ix('request_undelegation', { kind, index }, acc.request)], [admin]);
    const early = env.send([ix('rollback_undelegation', { kind, index }, acc.rollback)], [admin]);
    assert.equal(early.ok, false, `${name} early rollback must fail`);
    env.warpSlots(9_001);
    const rb = env.send([ix('rollback_undelegation', { kind, index }, acc.rollback)], [admin]);
    assert.ok(rb.ok, `${name} rollback: ${rb.err}\n${rb.logs.join('\n')}`);
    const a = env.account(key)!;
    assert.equal(a.owner.toBase58(), PROGRAM_ID.toBase58(), `${name} owner back to ASTrix`);
    assert.deepEqual(a.data, backupData(base), `${name} data = last committed base state`);
    assert.equal(a.lamports, BigInt(base.lamports));
    assert.equal(env.account(dlpPda('delegation', key)), null, 'delegation record closed');
    out[name] = { requestCu: rq.cu, idempotentRequestOk: rq2.ok, earlyErr: err(early).slice(0, 60), rollbackCu: rb.cu };
  }
  // a stranger cannot drive the escape hatch: seeds are derived from the signer
  const s = Keypair.generate(); env.fund(s.publicKey, 1);
  loadDelegated(env, 'slot-04');
  const bad = env.send([ix('request_undelegation', { kind: 2, index: 4 }, escapeAccounts(s.publicKey, slotPda(4)).request)], [s]);
  assert.equal(bad.ok, false); assert.equal(err(bad), 'InvalidSlot');
  record('escape.jsonl', { test: 'escape-hatch-devnet-dlp', ...out });
});

test('ESCAPE HATCH on a migrated v2 world: re-delegate via DLP, rollback -> state_epoch + 1, ROLLBACK journaled, still playable', () => {
  const env = new Env({ dlp: true });
  const admin = loadAdmin(); env.fund(admin.publicKey, 5);
  const b = backupAccounts.find((x) => x.layer === 'er' && x.name === 'slot-05')!;
  env.loadBackup(b);
  const w = slotPda(5);
  assert.ok(env.send([ixMigrate(w, env.payer.publicKey)]).ok);
  const v2data = env.data(w);
  // delegate_slot (re-delegation path after base-layer migration) against the real DLP binary
  const dAccs = [S(admin.publicKey, true), W(dlpPda('buffer', w)), W(dlpPda('delegation', w)), W(dlpPda('delegation-metadata', w)), W(w), R(PROGRAM_ID), R(DLP_ID), R(SystemProgram.programId)];
  // the delegate macro derives the buffer PDA under the owner program
  dAccs[1] = W(PublicKey.findProgramAddressSync([Buffer.from('buffer'), w.toBuffer()], PROGRAM_ID)[0]);
  const del = env.send([ix('delegate_slot', { index: 5 }, [...dAccs, R(new PublicKey('MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e'))])], [admin]);
  assert.ok(del.ok, del.err + '\n' + del.logs.join('\n'));
  assert.equal(env.account(w)!.owner.toBase58(), DLP_ID.toBase58());
  assert.deepEqual(env.data(w), v2data);
  const acc = escapeAccounts(admin.publicKey, w);
  assert.ok(env.send([ix('request_undelegation', { kind: 2, index: 5 }, acc.request)], [admin]).ok);
  env.warpSlots(9_001);
  const rb = env.send([ix('rollback_undelegation', { kind: 2, index: 5 }, acc.rollback)], [admin]);
  assert.ok(rb.ok, rb.err + rb.logs.join('\n'));
  const after = env.data(w); const e = ext(after)!;
  assert.deepEqual(prefix(after), prefix(v2data));
  assert.equal(e.stateEpoch, 1);
  assert.ok(e.recent.some((r) => r.kind === 5 && r.epochLo === 1));
  env.advance(20);
  assert.ok(env.send([ixSettle(w)]).ok);
  record('escape.jsonl', { test: 'escape-v2', delegateCu: del.cu, rollbackCu: rb.cu });
  void ADMIN; void journalGenesis; void sha256;
});
