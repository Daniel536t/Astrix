// World clock: settle catch-up, cap, idempotency, regression, failure-atomicity, tick alias, crank
// independence and the owner's disconnect / stop-scheduler / wait / restart / reconnect test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Env, ixSettle, ixTick, ixHarvest, settlement, ext, err, SO_OLD, SO_V2, backupOf, settlementPda, ixMigrate } from './h.ts';
import { claimFresh, farm, prefix, record } from './common.ts';

const CAP = 300n;

test('catch-up: elapsed ER time becomes exactly floor(dt/2) steps, remainder kept', () => {
  const env = new Env();
  const { w } = claimFresh(env, 20);
  const s0 = settlement(env.data(w));
  env.advance(61);
  const r = env.send([ixSettle(w)]);
  assert.ok(r.ok, r.err);
  const s1 = settlement(env.data(w));
  assert.equal(s1.tick - s0.tick, 30n);
  assert.equal(s1.lastTickTs - s0.lastTickTs, 60n); // the odd second is kept, not lost
  const e = ext(env.data(w))!;
  assert.equal(e.epochStart, s1.lastTickTs - s1.tick * 2n);
  env.advance(1);
  env.send([ixSettle(w)]);
  assert.equal(settlement(env.data(w)).tick - s0.tick, 31n);
  record('clock.jsonl', { test: 'catch-up', dt: 62, steps: 31 });
});

test('idempotent: repeated settle/tick at the same clock changes no byte', () => {
  const env = new Env();
  const { w, guest } = claimFresh(env, 21);
  farm(env, w, guest);
  env.advance(40);
  assert.ok(env.send([ixSettle(w)]).ok);
  const before = env.data(w);
  for (let i = 0; i < 5; i++) { assert.ok(env.send([ixSettle(w), ixTick(w), ixSettle(w)]).ok); }
  // last_settle_slot is the only field allowed to change (same slot here, so nothing changes)
  assert.deepEqual(env.data(w), before);
});

test('cap: a 3-hour outage drains over ceil(5400/cap) calls and ends exactly at world time', () => {
  const env = new Env();
  const { w, guest } = claimFresh(env, 22);
  farm(env, w, guest);
  const s0 = settlement(env.data(w));
  env.advance(3 * 3600);
  let calls = 0; const cus: number[] = [];
  for (;;) {
    const before = settlement(env.data(w)).tick;
    const r = env.send([ixSettle(w)]);
    assert.ok(r.ok, r.err); calls++; cus.push(r.cu);
    const after = settlement(env.data(w)).tick;
    assert.ok(after - before <= CAP);
    if (settlement(env.data(w)).lastTickTs + 2n > env.now) break;
  }
  const s1 = settlement(env.data(w));
  assert.equal(s1.tick - s0.tick, 5400n);
  assert.equal(BigInt(calls), (5400n + CAP - 1n) / CAP);
  const r = env.send([ixSettle(w)]);
  assert.equal(settlement(env.data(w)).tick, s1.tick); // nothing more
  record('clock.jsonl', { test: 'cap', outageS: 3 * 3600, calls, maxCu: Math.max(...cus), noopCu: r.cu });
});

test('player action during a large backlog fails with CatchUpRequired and saves nothing', () => {
  const env = new Env();
  const { w, guest } = claimFresh(env, 23);
  env.advance(3600);
  const before = env.data(w);
  const r = env.send([ixHarvest(w, guest.publicKey, 0, 2)], [guest]);
  assert.equal(r.ok, false);
  assert.equal(err(r), 'CatchUpRequired');
  assert.deepEqual(env.data(w), before); // failed execution did not advance the saved timestamp
  while (!env.send([ixHarvest(w, guest.publicKey, 0, 2)], [guest]).ok) assert.ok(env.send([ixSettle(w)]).ok);
  const s = settlement(env.data(w));
  assert.equal((env.now - s.lastTickTs) < 2n, true); // action happened at the present world tick
});

test('failed execution never advances the saved timestamp (invalid harvest after elapsed time)', () => {
  const env = new Env();
  const { w, guest } = claimFresh(env, 24);
  env.advance(30);
  const before = env.data(w);
  const r = env.send([ixHarvest(w, guest.publicKey, 0, 99)], [guest]); // amount > MAX_HARVEST_PER_ACTION
  assert.equal(r.ok, false);
  assert.equal(err(r), 'InvalidAmount');
  assert.deepEqual(env.data(w), before);
  const r2 = env.send([ixSettle(w), ixHarvest(w, guest.publicKey, 0, 99)], [guest]); // settle + failing action in one tx
  assert.equal(r2.ok, false);
  assert.deepEqual(env.data(w), before);
});

test('clock regression: an earlier ER clock is ignored; time never moves backwards', () => {
  const env = new Env();
  const { w } = claimFresh(env, 25);
  env.advance(90); // 45 steps, below the cap
  assert.ok(env.send([ixSettle(w)]).ok);
  const s1 = settlement(env.data(w));
  env.setTime(env.now - 500n);
  const r = env.send([ixSettle(w)]);
  assert.ok(r.ok, r.err);
  const s2 = settlement(env.data(w));
  assert.equal(s2.tick, s1.tick); assert.equal(s2.lastTickTs, s1.lastTickTs);
  assert.equal(ext(env.data(w))!.clockRegressions, 1);
  assert.ok(r.logs.some((l) => l.includes('clock-regression')));
  env.setTime(env.now + 500n + 10n);
  env.send([ixSettle(w)]);
  assert.equal(settlement(env.data(w)).tick - s1.tick, 5n);
});

test('tick alias == settle; old cranks (2 s tick) + new crank (30 s settle) together never double-apply', () => {
  const a = new Env(); const b = new Env();
  const A = claimFresh(a, 26); const B = claimFresh(b, 26);
  // make both worlds identical in state and clock
  b.setRaw(B.w, a.data(A.w), a.account(A.w)!.owner, a.account(A.w)!.lamports); b.setTime(a.now);
  farm(a, A.w, A.guest); b.setRaw(B.w, a.data(A.w), a.account(A.w)!.owner, a.account(A.w)!.lamports);
  // A: only the old 2 s tick crank. B: 2 s tick crank + 30 s settle crank + 3 duplicate tick runs every 10 s.
  for (let t = 1; t <= 600; t++) {
    a.advance(1, 100); b.advance(1, 100);
    if (t % 2 === 0) { assert.ok(a.send([ixTick(A.w)]).ok); assert.ok(b.send([ixTick(B.w)]).ok); }
    if (t % 30 === 0) assert.ok(b.send([ixSettle(B.w)]).ok);
    if (t % 10 === 0) assert.ok(b.send([ixTick(B.w), ixTick(B.w), ixSettle(B.w)]).ok);
  }
  assert.deepEqual(prefix(a.data(A.w)), prefix(b.data(B.w)));
  const s = settlement(a.data(A.w)); const e = ext(a.data(A.w))!;
  assert.equal(s.tick, (a.now - e.epochStart) / 2n); // world_tick = floor((now - epoch_start) / 2)
});

test('OWNER TEST: disconnect, stop scheduler, wait 3 h, restart (30 s crank), reconnect -> identical to never stopping', () => {
  // Reference: scheduler never stopped (settle every 30 s). Subject: player + scheduler gone for 3 h.
  const ref = new Env(); const sub = new Env();
  const R = claimFresh(ref, 27); const S = claimFresh(sub, 27);
  sub.setRaw(S.w, ref.data(R.w), ref.account(R.w)!.owner, ref.account(R.w)!.lamports); sub.setTime(ref.now);
  farm(ref, R.w, R.guest); sub.setRaw(S.w, ref.data(R.w), ref.account(R.w)!.owner, ref.account(R.w)!.lamports);
  const guest = R.guest; // same key in both (state copied)
  const t0 = ref.now;
  const startPop = settlement(ref.data(R.w)).population;
  // 1. player plays for 10 minutes on both
  for (let t = 0; t < 600; t += 30) { ref.advance(30); sub.advance(30); ref.send([ixSettle(R.w)]); sub.send([ixSettle(S.w)]); }
  assert.ok(ref.send([ixHarvest(R.w, guest.publicKey, 0, 4)], [guest]).ok);
  assert.ok(sub.send([ixHarvest(S.w, guest.publicKey, 0, 4)], [guest]).ok);
  // 2. disconnect the player and 3. stop the scheduler (subject only), 4. wait 3 h
  for (let t = 0; t < 3 * 3600; t += 30) { ref.advance(30); ref.send([ixSettle(R.w)]); }
  sub.advance(3 * 3600);
  const mid = settlement(sub.data(S.w));
  // 5. restart the system: the 30 s crank resumes; 6. reconnect when caught up
  let crankRuns = 0;
  while (true) {
    const r = sub.send([ixSettle(S.w)]); assert.ok(r.ok, r.err); crankRuns++;
    if (settlement(sub.data(S.w)).lastTickTs + 2n > sub.now) break;
    sub.advance(30); ref.advance(30); assert.ok(ref.send([ixSettle(R.w)]).ok); // 30 s crank cadence while draining
  }
  // reference keeps going to the same clock
  ref.setTime(sub.now); ref.send([ixSettle(R.w)]);
  const a = settlement(ref.data(R.w)); const b = settlement(sub.data(S.w));
  assert.deepEqual(prefix(ref.data(R.w)), prefix(sub.data(S.w)), 'no duplicate production, deaths or crafting; no lost time');
  assert.equal(b.tick, (sub.now - ext(sub.data(S.w))!.epochStart) / 2n);
  // reconnect: player acts immediately
  assert.ok(sub.send([ixHarvest(S.w, guest.publicKey, 1, 4)], [guest]).ok);
  record('clock.jsonl', { test: 'owner-disconnect', outageS: 3 * 3600, ticksAtStop: Number(mid.tick), finalTick: Number(b.tick),
    totalWorldSeconds: Number(sub.now - t0), crankRunsToCatchUp: crankRuns, stock: b.stock, population: b.population, startPop,
    planks: b.stock[6], plotsPlanted: b.plots.filter((p) => p !== 0xffffffffffffffffn).length });
});

test('rollback compatibility: the old devnet binary ticks a v2 world; the new binary re-anchors without double time', () => {
  const env = new Env();
  const { w } = claimFresh(env, 28);
  env.advance(20); env.send([ixSettle(w)]);
  env.replaceProgram(SO_OLD);
  for (let i = 0; i < 5; i++) { env.advance(2); assert.ok(env.send([ixTick(w)]).ok); } // old +1/tick, last_tick_ts = now
  env.advance(3); assert.ok(env.send([ixTick(w)]).ok);
  const oldS = settlement(env.data(w));
  assert.equal(env.data(w).length, 876); // old binary left the v2 tail intact
  env.replaceProgram(SO_V2);
  env.advance(10);
  assert.ok(env.send([ixSettle(w)]).ok);
  const s = settlement(env.data(w));
  assert.equal(s.tick - oldS.tick, 5n);
  const e = ext(env.data(w))!;
  assert.equal(e.epochStart, s.lastTickTs - s.tick * 2n);
  assert.ok(e.reanchors >= 1);
});

test('demo settlement (v1, ER backup) keeps working unmigrated and after migration', () => {
  const env = new Env();
  env.loadBackup(backupOf('er', 'settlement'));
  const w = settlementPda();
  const s0 = settlement(env.data(w));
  env.setTime(s0.lastTickTs + 10n);
  assert.ok(env.send([ixTick(w)]).ok);
  assert.equal(settlement(env.data(w)).tick - s0.tick, 5n); // v1 layout: catch-up works without the tail
  assert.equal(env.data(w).length, 240);
  assert.ok(env.send([ixMigrate(w, env.payer.publicKey)]).ok);
  assert.deepEqual(prefix(env.data(w)), prefix(Buffer.concat([env.data(w).subarray(0, 240)])));
  env.advance(4); assert.ok(env.send([ixTick(w)]).ok);
  assert.equal(settlement(env.data(w)).tick - s0.tick, 7n);
});
