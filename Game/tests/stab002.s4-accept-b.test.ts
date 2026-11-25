// STAB-002 S4 acceptance (b): at the S4 walking speed routine and upkeep work waits at most 120 daytime ticks
// (due to taken, and nothing open longer) on every S3 farm: fresh v7 and v6 -> v7 with 2, 4 and 6 fields (600
// ticks after the owner field, observed from founding), and the standard farm (1500 ticks); seeds 1337 / 42 / 7.
import test from 'node:test';
import assert from 'node:assert/strict';
import { busyField, farm, markField } from './stab002-s3-harness';
import { RUNS, SEEDS } from './stab002-s4-accept';

test('S4 acceptance: routine and upkeep waits <= 120 daytime ticks on every S3 farm, fresh and upgraded, 2 / 4 / 6 fields, and the standard farm', () => {
  const rows: string[] = [];
  for (const [label, o] of RUNS) for (const seed of SEEDS) for (const n of [2, 4, 6]) {
    const r = busyField(seed, 7, n, 300, 6, 6, 1, o);
    r.f.step(600);
    const w = r.f.work.metrics().waits;
    rows.push(`${label} ${seed} ${n}: ${w.max}`);
    assert.ok(w.max <= 120, `${label} seed ${seed}, ${n} fields: max wait ${w.max}`);
    assert.ok(!w.open || w.open.age <= 120, `${label} seed ${seed}, ${n} fields: open ${JSON.stringify(w.open)}`);
    assert.ok(r.f.maxStep() <= 1, `step ${r.f.maxStep()}`);
  }
  for (const seed of SEEDS) {
    const f = farm(seed, 7);
    markField(f.s, f.send, 4, 4);
    f.step(1500);
    const w = f.work.metrics().waits;
    rows.push(`standard ${seed}: ${w.max}`);
    assert.ok(w.max <= 120, `standard farm seed ${seed}: max wait ${w.max}`);
    assert.equal(f.work.metrics().total.starving, 0, 'no starving ticks');
  }
  console.log(`# ${rows.join(' | ')}`);
});
