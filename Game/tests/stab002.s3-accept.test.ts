// STAB-002 S3 acceptance, measured with the BUG-C scenarios (tests/stab002-s3-harness.ts; the same
// numbers are in 13_Integration_and_QA/Evidence/STAB-002-stabilization/REPORT.md, section S3).
//  - an approved woodshed (with a well approved beside it), fresh store, no hand-assigned roles, default
//    steward: finished within one in-game day (300 ticks), fresh v7 and upgraded v6 -> v7;
//  - a 6 x 6 owner field on a busy farm (2, 4, 6 fields, default steward): taken within 30 ticks; fully
//    sown within 60 ticks, or, when the store holds less free seed than the field has units when it is
//    marked, at least that many units sown within 60 ticks;
//  - no villager moves more than its walking allowance in a tick (STAB-002 S4: under v7 exactly villagerSpeed x 1 tick,
//    39 dm; the pre-upgrade v6 ticks VILLAGER_SPEED + 1 dm of the rounding v6 recorded; see the harness's maxStep).
import test from 'node:test';
import assert from 'node:assert/strict';
import { busyField, woodshed } from './stab002-s3-harness';

const SEEDS = [1337, 42, 7];
const ALLOWANCE = 1;

test('S3 acceptance: an approved woodshed (and a well) with no hand-assigned roles is finished within 300 ticks, fresh v7 (approved at 0, 120, 400) and v6 -> v7 (at 0, 120); never a jump', () => {
  const rows: string[] = [];
  for (const seed of SEEDS) {
    for (const at of [0, 120, 400]) {
      const r = woodshed(seed, 7, at, 300, { well: true });
      rows.push(`v7 ${seed}@${at}: ${r.done}`);
      assert.ok(r.done !== null && r.done <= 300, `fresh v7 seed ${seed} approved at ${at}: woodshed ${r.done}`);
      assert.ok(r.f.maxStep() <= ALLOWANCE, `step ${r.f.maxStep()}`);
    }
    for (const at of [0, 120]) {
      const r = woodshed(seed, 7, at, 300, { from: 6, pre: 300, well: true });
      rows.push(`v6->v7 ${seed}@${at}: ${r.done}`);
      assert.ok(r.done !== null && r.done <= 300, `v6 -> v7 seed ${seed} approved at ${at}: woodshed ${r.done}`);
      assert.ok(r.f.maxStep() <= ALLOWANCE, `step ${r.f.maxStep()}`);
    }
  }
  console.log(rows.join(' | '));
});

test('S3 acceptance: a 6 x 6 owner field on a farm with 2, 4 or 6 fields is taken within 30 ticks and sown within 60 (as far as the free seed allows), fresh v7 and v6 -> v7', () => {
  const rows: string[] = [];
  const cases: Array<[number, number, { from?: number; pre?: number }]> = [];
  for (const seed of SEEDS) { for (const n of [2, 4, 6]) cases.push([seed, n, {}]); for (const n of [2, 4]) cases.push([seed, n, { from: 6, pre: 300 }]); }
  for (const [seed, n, o] of cases) {
    const r = busyField(seed, 7, n, 300, 6, 6, 60, o);
    const label = `${o.from ? 'v6->v7' : 'v7'} seed ${seed} ${n} fields`;
    rows.push(`${label}: taken ${r.claimed} sown ${r.sown} (${r.sownAt60}/${r.units}, seed ${r.seedAtMark})`);
    assert.ok(r.claimed !== null && r.claimed <= 30, `${label}: first taken ${r.claimed}`);
    if (r.seedAtMark >= r.units) assert.ok(r.sown !== null && r.sown <= 60, `${label}: sown ${r.sown}`);
    else assert.ok(r.sownAt60 >= r.seedAtMark, `${label}: ${r.sownAt60} units sown by +60 with ${r.seedAtMark} free seed`);
    assert.ok(r.f.maxStep() <= ALLOWANCE, `step ${r.f.maxStep()}`);
  }
  console.log(rows.join('\n'));
});
