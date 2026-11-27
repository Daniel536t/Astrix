// Rehearsal of the proposed devnet procedure on a FULLY LOCAL MagicBlock stack:
// base = mb-test-validator (127.0.0.1:8899), ER = ephemeral-validator 2.0.3 (127.0.0.1:7799),
// hydra-cranker + VRF oracle on the local ER. Admin = a local throwaway key. Never talks to devnet.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, ComputeBudgetProgram } from '@solana/web3.js';
import { PROGRAM_ID, DLP_ID, ix, W, R, S, settlement, ext, solvePow, P2, SO_V2, BN, journalEvents, replayJournal } from './h.ts';

const BASE = 'http://127.0.0.1:8899', ER = 'http://127.0.0.1:7799';
for (const u of [BASE, ER]) if (!u.startsWith('http://127.0.0.1')) throw new Error('local only');
const base = new Connection(BASE, 'confirmed');
const er = new Connection(ER, { commitment: 'confirmed', wsEndpoint: 'ws://127.0.0.1:7800' });
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(`${P2}/localval/local-authority.json`, 'utf8'))));
const MAGIC_PROGRAM = new PublicKey('Magic11111111111111111111111111111111111111');
const MAGIC_CONTEXT = new PublicKey('MagicContext1111111111111111111111111111111');
const VRF = new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz');
const EQ = new PublicKey('5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc');
const SLOT_HASHES = new PublicKey('SysvarS1otHashes111111111111111111111111111');
const pda = (s: Buffer[], p = PROGRAM_ID) => PublicKey.findProgramAddressSync(s, p)[0];
const registry = pda([Buffer.from('astrix-registry'), admin.publicKey.toBuffer()]);
const slot = (i: number) => pda([Buffer.from('world-slot'), admin.publicKey.toBuffer(), Buffer.from([i])]);
const passport = (w: PublicKey) => pda([Buffer.from('passport'), w.toBuffer()]);
const treasury = pda([Buffer.from('checkpoint-treasury'), admin.publicKey.toBuffer()]);
const IDENTITY = pda([Buffer.from('identity')]);
const N = 4;
const out: any = { steps: [] };
const log = (step: string, o: any = {}) => { const e = { step, at: new Date().toISOString(), ...o }; out.steps.push(e); const rep = (_k: string, v: any) => (typeof v === 'bigint' ? v.toString() : (v && v.type === 'Buffer' ? Buffer.from(v.data).toString('hex') : v)); console.log(JSON.stringify(e, rep).slice(0, 1500)); fs.writeFileSync(`${P2}/results/er-local.json`, JSON.stringify(out, rep, 1)); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cli = (...a: string[]) => execFileSync('solana', ['-u', BASE, '-k', `${P2}/localval/local-authority.json`, ...a], { encoding: 'utf8' });

async function send(conn: Connection, ixs: TransactionInstruction[], signers: Keypair[] = [], feePayer = admin) {
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ...ixs);
  tx.feePayer = feePayer.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(feePayer, ...signers.filter((s) => !s.publicKey.equals(feePayer.publicKey)));
  try {
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    await conn.confirmTransaction(sig, 'confirmed');
    for (let i = 0; i < 20; i++) {
      const t = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      if (t) return { ok: !t.meta?.err, sig, cu: t.meta?.computeUnitsConsumed, logs: t.meta?.logMessages ?? [], err: JSON.stringify(t.meta?.err ?? null) };
      await sleep(250);
    }
    return { ok: true, sig, logs: [] as string[], err: 'no tx meta' };
  } catch (e: any) { return { ok: false, err: (e?.message ?? JSON.stringify(e)).slice(0, 800), logs: (e.logs ?? e?.transactionLogs ?? []) as string[] }; }
}
const must = (name: string, r: any) => { if (!r.ok) { log(name + ' FAILED', { err: r.err, logs: (r.logs ?? []).slice(-12) }); throw new Error(name); } return r; };
const bufferPda = (a: PublicKey) => pda([Buffer.from('buffer'), a.toBuffer()]);
const dlp = (tag: string, a: PublicKey) => pda([Buffer.from(tag), a.toBuffer()], DLP_ID);
const delegAccs = (a: PublicKey) => [W(bufferPda(a)), W(dlp('delegation', a)), W(dlp('delegation-metadata', a)), W(a), R(PROGRAM_ID), R(DLP_ID), R(SystemProgram.programId)];
async function info(conn: Connection, k: PublicKey) { const a = await conn.getAccountInfo(k, 'confirmed'); return a ? { owner: a.owner.toBase58(), len: a.data.length, data: Buffer.from(a.data), lamports: a.lamports } : null; }
async function waitFor(desc: string, f: () => Promise<boolean>, ms = 60_000) { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await sleep(1000); } log('timeout: ' + desc); return false; }
const scheduleIx = (name: string, task: number, ms: number, iters: number, worlds: PublicKey[]) =>
  ix(name, { task_id: new BN(task), interval_ms: new BN(ms), iterations: new BN(iters) }, [R(MAGIC_PROGRAM), S(admin.publicKey, true), R(registry), R(PROGRAM_ID), ...worlds.map(W)]);
const cancelIx = (task: number) => { const d = Buffer.alloc(12); d.writeUInt32LE(7, 0); d.writeBigInt64LE(BigInt(task), 4); return new TransactionInstruction({ programId: MAGIC_PROGRAM, keys: [{ pubkey: admin.publicKey, isSigner: true, isWritable: true }], data: d }); };
const prospectIx = (w: PublicKey, payer: PublicKey) => ix('prospect', { client_seed: 9 }, [S(payer, true), W(w), W(EQ), R(IDENTITY), R(VRF), R(SLOT_HASHES), R(SystemProgram.programId)]);

for (let i = 0; i < 90; i++) { try { await base.getSlot(); await er.getSlot(); break; } catch { await sleep(1000); } }
const erIdentity = (await (await fetch(ER, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getIdentity' }) })).json()).result.identity;
const validatorMeta = { pubkey: new PublicKey(erIdentity) };
log('stack', { baseVersion: await base.getVersion(), erVersion: await er.getVersion(), erIdentity, admin: admin.publicKey.toBase58() });

// A. base: current devnet shape with the OLD binary (v1 accounts), delegated to the local ER
must('init_registry', await send(base, [ix('init_registry', { slots: N, claim_cooldown_s: new BN(0) }, [W(registry), S(admin.publicKey, true), R(SystemProgram.programId)])]));
for (let i = 0; i < N; i++) {
  must(`init_slot ${i}`, await send(base, [ix('init_slot', { index: i }, [W(slot(i)), S(admin.publicKey, true), R(SystemProgram.programId)])]));
  must(`init_passport ${i}`, await send(base, [ix('init_passport', { _index: i }, [R(slot(i)), W(passport(slot(i))), S(admin.publicKey, true), R(SystemProgram.programId)])]));
}
must('init_treasury', await send(base, [ix('init_treasury', {}, [W(treasury), S(admin.publicKey, true), R(SystemProgram.programId)]), SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: treasury, lamports: 500_000_000 })]));
log('A-base-v1-accounts', { slotLen: (await info(base, slot(0)))!.len });
must('delegate_registry', await send(base, [ix('delegate_registry', {}, [S(admin.publicKey, true), ...delegAccs(registry), { pubkey: validatorMeta.pubkey }])]));
must('delegate_treasury', await send(base, [ix('delegate_treasury', {}, [S(admin.publicKey, true), ...delegAccs(treasury), { pubkey: validatorMeta.pubkey }])]));
for (let i = 0; i < N; i++) {
  must(`delegate_slot ${i}`, await send(base, [ix('delegate_slot', { index: i }, [S(admin.publicKey, true), ...delegAccs(slot(i)), { pubkey: validatorMeta.pubkey }])]));
  must(`delegate_passport ${i}`, await send(base, [ix('delegate_passport', { _index: i }, [S(admin.publicKey, true), R(slot(i)), ...delegAccs(passport(slot(i))), { pubkey: validatorMeta.pubkey }])]));
}
await waitFor('ER sees delegated slot', async () => !!(await info(er, slot(0))));
log('A-delegated', { erSlot0: (await info(er, slot(0)))?.owner, baseOwner: (await info(base, slot(0)))?.owner });

// B. ER: a player claims slot 0 and farms; the OLD 2 s tick crank runs (old binary)
const guest = Keypair.generate();
must('claim_world (old binary, ER)', await send(er, [ix('claim_world', { index: 0, nonce: new BN(solvePow(guest.publicKey, 0).toString()) }, [W(registry), W(slot(0)), W(passport(slot(0))), S(guest.publicKey)])], [guest], guest));
for (let p = 0; p < 4; p++) must(`plant ${p}`, await send(er, [ix('plant', { plot: p }, [W(slot(0)), S(guest.publicKey)])], [guest], guest));
must('schedule old tick crank 742101', await send(er, [scheduleIx('schedule_world_ticks', 742101, 2000, 100000, [slot(0), slot(1)])]));
const b0 = settlement((await info(er, slot(0)))!.data);
await sleep(12_000);
const b1 = settlement((await info(er, slot(0)))!.data);
log('B-old-crank-running', { tickBefore: Number(b0.tick), tickAfter12s: Number(b1.tick) });

// C. upgrade the program on base in place; the ER must pick up the new code; the old crank keeps working (tick alias)
const pdKey = pda([PROGRAM_ID.toBuffer()], new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'));
const pdLen = (await base.getAccountInfo(pdKey))!.data.length - 45;
const extend = Math.max(0, fs.statSync(SO_V2).size - pdLen);
if (extend > 0) cli('program', 'extend', PROGRAM_ID.toBase58(), String(extend));
const bufKp = `${P2}/localval/buffer-er.json`;
execFileSync('solana-keygen', ['new', '--no-bip39-passphrase', '-s', '--force', '-o', bufKp]);
cli('program', 'deploy', '--program-id', PROGRAM_ID.toBase58(), '--buffer', bufKp, '--upgrade-authority', `${P2}/localval/local-authority.json`, SO_V2);
let erHasNew = false;
await waitFor('ER loads the upgraded program', async () => { const r = await send(er, [ix('settle', {}, [W(slot(0))])]); erHasNew = r.ok; return r.ok; }, 90_000);
const c0 = settlement((await info(er, slot(0)))!.data);
await sleep(10_000);
const c1 = settlement((await info(er, slot(0)))!.data);
log('C-upgraded', { extendBytes: extend, erRunsNewProgram: erHasNew, oldCrankTicksIn10s: Number(c1.tick - c0.tick), lastTickTsMinusNow: Number(c1.lastTickTs) - Math.floor(Date.now() / 1000) });

// D. new 30 s settle crank (new task id) alongside the old tick crank: no double time
must('schedule new settle crank 744101', await send(er, [scheduleIx('schedule_world_settles', 744101, 3000, 100000, [slot(0), slot(1)])]));
const d0 = settlement((await info(er, slot(0)))!.data); const dt0 = Date.now();
await sleep(20_000);
const d1 = settlement((await info(er, slot(0)))!.data); const dt1 = Date.now();
log('D-two-cranks', { ticks: Number(d1.tick - d0.tick), wallSeconds: (dt1 - dt0) / 1000, lastTickTsDelta: Number(d1.lastTickTs - d0.lastTickTs), expectTicksEqualHalfOfTsDelta: Number(d1.tick - d0.tick) * 2 === Number(d1.lastTickTs - d0.lastTickTs) });

// E. can migrate_world run on the ER while delegated? (devnet plan depends on the answer)
const eTry = await send(er, [ix('migrate_world', {}, [W(slot(1)), S(admin.publicKey, true), R(SystemProgram.programId)])]);
log('E-migrate-on-ER', { ok: eTry.ok, err: eTry.err, logs: eTry.logs.slice(-6) });

// F. stop the scheduler (cancel both cranks), wait, then undelegate everything to the base layer
must('cancel 742101', await send(er, [cancelIx(742101)]));
must('cancel 744101', await send(er, [cancelIx(744101)]));
const f0 = settlement((await info(er, slot(0)))!.data);
await sleep(20_000);
const f1 = settlement((await info(er, slot(0)))!.data);
log('F-scheduler-stopped', { ticksWhileStopped: Number(f1.tick - f0.tick) });
const erPre = await Promise.all([...Array.from({ length: N }, (_, i) => slot(i)), ...Array.from({ length: N }, (_, i) => passport(slot(i))), registry, treasury].map((k) => info(er, k)));
const batches: PublicKey[][] = [...Array.from({ length: N }, (_, i) => [slot(i), passport(slot(i))]), [treasury]];
const undelCu: number[] = [];
for (const b of batches) { const r = must('undelegate_worlds batch', await send(er, [ix('undelegate_worlds', { include_registry: false }, [S(admin.publicKey, true), W(registry), R(MAGIC_PROGRAM), W(MAGIC_CONTEXT), ...b.map(W)])])); undelCu.push(r.cu); }
await waitFor('worlds returned', async () => (await info(base, slot(N - 1)))?.owner === PROGRAM_ID.toBase58() && (await info(base, treasury))?.owner === PROGRAM_ID.toBase58(), 300_000);
const undel = must('undelegate registry', await send(er, [ix('undelegate_worlds', { include_registry: true }, [S(admin.publicKey, true), W(registry), R(MAGIC_PROGRAM), W(MAGIC_CONTEXT)])]));
const back = await waitFor('base ownership returns to ASTrix', async () => (await info(base, registry))?.owner === PROGRAM_ID.toBase58(), 300_000);
const basePost = await Promise.all([...Array.from({ length: N }, (_, i) => slot(i)), ...Array.from({ length: N }, (_, i) => passport(slot(i))), registry, treasury].map((k) => info(base, k)));
const sameAsEr = basePost.map((b, i) => !!b && !!erPre[i] && b.data.equals(erPre[i]!.data));
log('F-undelegated', { returned: back, baseEqualsErSnapshot: sameAsEr, treasuryLamports: basePost[basePost.length - 1]?.lamports, batchCu: undelCu, registryCu: undel.cu, alt: !!(await base.getAccountInfo(new PublicKey('AddressLookupTab1e1111111111111111111111111'))) });

// G. base: migrate to v2 (admin pays rent), re-delegate; ER: v2 settle catches up the stopped time
const pre = await Promise.all(Array.from({ length: N }, (_, i) => info(base, slot(i))));
for (let i = 0; i < N; i++) must(`migrate ${i}`, await send(base, [ix('migrate_world', {}, [W(slot(i)), S(admin.publicKey, true), R(SystemProgram.programId)])]));
const post = await Promise.all(Array.from({ length: N }, (_, i) => info(base, slot(i))));
log('G-migrated-on-base', { lens: post.map((p) => p!.len), prefixIdentical: post.map((p, i) => p!.data.subarray(0, 240).equals(pre[i]!.data)) });
must('delegate_registry 2', await send(base, [ix('delegate_registry', {}, [S(admin.publicKey, true), ...delegAccs(registry), { pubkey: validatorMeta.pubkey }])]));
must('delegate_treasury 2', await send(base, [ix('delegate_treasury', {}, [S(admin.publicKey, true), ...delegAccs(treasury), { pubkey: validatorMeta.pubkey }])]));
for (let i = 0; i < N; i++) {
  must(`redelegate slot ${i}`, await send(base, [ix('delegate_slot', { index: i }, [S(admin.publicKey, true), ...delegAccs(slot(i)), { pubkey: validatorMeta.pubkey }])]));
  must(`redelegate passport ${i}`, await send(base, [ix('delegate_passport', { _index: i }, [S(admin.publicKey, true), R(slot(i)), ...delegAccs(passport(slot(i))), { pubkey: validatorMeta.pubkey }])]));
}
await waitFor('ER sees v2 slot', async () => (await info(er, slot(0)))?.len === 876, 60_000);
const g0 = settlement((await info(er, slot(0)))!.data);
const gs = await send(er, [ix('settle', {}, [W(slot(0))])]);
const g1d = (await info(er, slot(0)))!.data; const g1 = settlement(g1d); const ge = ext(g1d)!;
log('G-v2-on-ER', { erLen: g1d.length, settleOk: gs.ok, caughtUpTicks: Number(g1.tick - g0.tick), stoppedSeconds: Number(g1.lastTickTs - f1.lastTickTs), epochInvariant: ge.epochStart === g1.lastTickTs - g1.tick * 2n, logs: gs.logs.filter((l) => l.includes('settle')) });
must('schedule settle crank 744102 (v2)', await send(er, [scheduleIx('schedule_world_settles', 744102, 3000, 100000, [slot(0), slot(1), slot(2), slot(3)])]));

// H. VRF on the ER with the local oracle: prospect -> vrf_callback(ticket), journal record
await sleep(8000);
const s0 = settlement((await info(er, slot(0)))!.data);
let vrfOk = false; let vrfLogs: string[] = [];
if (s0.stock[3] >= 4) {
  const p = await send(er, [prospectIx(slot(0), guest.publicKey)], [guest], guest);
  vrfLogs = p.logs.slice(-6);
  if (p.ok) vrfOk = await waitFor('VRF callback', async () => settlement((await info(er, slot(0)))!.data).prospectPending === false, 60_000);
}
const hd = (await info(er, slot(0)))!.data; const he = ext(hd)!;
const q = await er.getAccountInfo(EQ); const qb = await base.getAccountInfo(EQ);
log('H-vrf-on-ER', { queueOnEr: q ? { owner: q.owner.toBase58(), len: q.data.length } : null, queueOnBase: qb ? { owner: qb.owner.toBase58(), len: qb.data.length } : null, foodBefore: s0.stock[3], fulfilled: vrfOk, lastRoll: settlement(hd).lastRoll, journalSeq: Number(he.journalSeq), lastRecord: he.recent.reduce((a, b) => (b.seq > a.seq ? b : a)), prospectLogs: vrfLogs });

// I. ranked world creation: claim_world_vrf on slot 1 with the local oracle
const g2 = Keypair.generate();
const cv = await send(er, [ix('claim_world_vrf', { index: 1, nonce: new BN(solvePow(g2.publicKey, 1).toString()), config_hash: Array.from(crypto.randomBytes(32)) },
  [W(registry), W(slot(1)), W(passport(slot(1))), S(g2.publicKey, true), W(EQ), R(IDENTITY), R(VRF), R(SLOT_HASHES), R(SystemProgram.programId)])], [g2], g2);
const gen = cv.ok && await waitFor('genesis callback', async () => ext((await info(er, slot(1)))!.data)?.seedOrigin === 1, 60_000);
const id = (await info(er, slot(1)))!.data;
log('I-vrf-genesis-on-ER', { claimOk: cv.ok, err: cv.err, revealed: gen, seed: settlement(id).worldSeed, seedOrigin: ext(id)?.seedOrigin, logs: cv.logs.slice(-4) });

// J. commit v2 accounts to base (DLP finalize must accept the 876-byte layout)
const cm = await send(er, [ix('commit_worlds', {}, [S(admin.publicKey, true), W(registry), R(MAGIC_PROGRAM), W(MAGIC_CONTEXT), W(slot(0)), W(slot(1))])]);
const erNow = (await info(er, slot(0)))!.data;
const committed = cm.ok && await waitFor('commit lands on base', async () => { const b = await info(base, slot(0)); return !!b && settlement(b.data).tick >= settlement(erNow).tick && b.len === 876; }, 60_000);
log('J-commit-v2', { ok: cm.ok, err: cm.err, landed: committed, baseLen: (await info(base, slot(0)))?.len });

// K. old cranks still harmless: re-schedule the legacy tick crank (old task id) on v2 worlds next to the settle crank
must('reschedule legacy tick crank 742101 on v2', await send(er, [scheduleIx('schedule_world_ticks', 742101, 2000, 100000, [slot(0)])]));
const k0 = settlement((await info(er, slot(0)))!.data);
await sleep(15_000);
const k1d = (await info(er, slot(0)))!.data; const k1 = settlement(k1d); const ke = ext(k1d)!;
log('K-both-cranks-v2', { ticks: Number(k1.tick - k0.tick), tsDelta: Number(k1.lastTickTs - k0.lastTickTs), invariant: ke.epochStart === k1.lastTickTs - k1.tick * 2n, regressions: ke.clockRegressions });
for (const t of [742101, 744102]) await send(er, [cancelIx(t)]);
log('DONE');
