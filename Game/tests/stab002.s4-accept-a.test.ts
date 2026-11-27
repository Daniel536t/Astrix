// STAB-002 S4 acceptance (a): at the S4 walking speed every S3 woodshed and owner-field bound holds on every
// scenario, fresh v8 and v6 -> v8 (including the v6 -> v8 woodshed at 400 and the 6-field upgraded farm, which
// S3 did not assert), no step exceeds the exact allowance, and the total task time is at least 30 % below S3's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { S3_TOTAL_TASK_TIME, bRuns, fRuns, taskTime } from './stab002-s4-accept';

test('S4 acceptance: woodshed (with a well) done within 300 ticks and owner field taken within 30 / sown within 60 (seed-limited) on every S3 scenario; total task time at least 30 % below S3; never a step over the allowance', () => {
  const b = bRuns(), f = fRuns();
  for (const r of b) {
    assert.ok(r.woodshed !== null && r.woodshed <= 300, `${r.label} seed ${r.seed} at ${r.at}: woodshed ${r.woodshed}`);
    assert.ok(r.step <= 1, `${r.label} seed ${r.seed}: step ${r.step}`);
  }
  for (const r of f) {
    const label = `${r.label} seed ${r.seed} ${r.n} fields`;
    assert.ok(r.claimed !== null && r.claimed <= 30, `${label}: taken ${r.claimed}`);
    if (r.seedAtMark >= r.units) assert.ok(r.sown !== null && r.sown <= 60, `${label}: sown ${r.sown}`);
    else assert.ok(r.sownAt60 >= r.seedAtMark, `${label}: ${r.sownAt60} units sown by +60 with ${r.seedAtMark} free seed`);
    assert.ok(r.step <= 1, `${label}: step ${r.step}`);
  }
  const total = taskTime(b, f);
  console.log(`# S4 total task time ${total} vs S3 ${S3_TOTAL_TASK_TIME} (${((100 * (total - S3_TOTAL_TASK_TIME)) / S3_TOTAL_TASK_TIME).toFixed(1)} %)`);
  assert.ok(total <= 0.7 * S3_TOTAL_TASK_TIME, `total task time ${total} against S3 ${S3_TOTAL_TASK_TIME}`);
});
