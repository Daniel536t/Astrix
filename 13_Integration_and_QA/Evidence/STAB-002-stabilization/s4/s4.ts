// STAB-002 S4 evidence: the S3 scenarios (BUG-C) at the villagers' walking speed, before (S3, 1.3 m/s) and
// after (S4, 1.95 m/s under rules v7). The same script runs on both trees: on the S3 tree (bf23ae5)
// `villagerSpeed` does not exist and VILLAGER_SPEED (26 dm) is the v7 speed.
// From Game/: npx esbuild ../13_Integration_and_QA/Evidence/STAB-002-stabilization/s4/s4.ts --bundle --platform=node
//   --format=esm --external:three --outfile=tests/.s4.tmp.mjs && node tests/.s4.tmp.mjs [B|F|W|T|all] > out.json
//
// Measures, per run:
//  - B: woodshed and well approved at 0 / 120 / 400, fresh store, default steward, no hand roles: ticks to done;
//  - F: 6 x 6 owner field on a farm with 2 / 4 / 6 fields (300 ticks warm): ticks to first taken and fully sown,
//    free seed at marking, units sown by +60;
//  - W: the same farms played 600 ticks after the owner field: max wait of routine/upkeep work (daytime ticks);
//  - T: standard farm (4 x 4 owner field at tick 0, 1500 ticks): time shares;
//  - every run: each finished villager task (not idle, eat, rest) from the tick it was taken to the tick it ended
//    ("errand time"), and the largest step in one tick against the exact walking allowance (speed x 1 tick).
import { busyField, farm, markField, woodshed } from '../../../../Game/tests/stab002-s3-harness';
import * as H from '../../../../Game/src/sim/homestead';
import { WorkTime } from '../../../../Game/src/app/work-time';
import type { World } from '../../../../Game/src/sim/world';

const SEEDS = [1337, 42, 7];
const which = process.argv[2] ?? 'all';
const speedOf = (h: { version: number }): number => ((H as unknown as { villagerSpeed?: (h: { version: number }) => number }).villagerSpeed?.(h) ?? H.VILLAGER_SPEED);

// Observe every tick the harness plays (WorkTime.observe is called once per tick by the harness).
interface Open { kind: string; ref: object; start: number }
let errands: Array<{ kind: string; ticks: number }> = [];
let worst = 0;
const open = new Map<string, Open>();
const last = new Map<string, { x: number; z: number; tick: number }>();
const orig = WorkTime.prototype.observe;
WorkTime.prototype.observe = function (this: WorkTime, world: World, tick: number) {
  const h = world.homestead;
  if (h) {
    // Exact allowance under v7 (speed x 1 tick); the pre-upgrade v6 ticks keep their recorded rounding (+1 dm).
    const sp = h.version >= 7 ? speedOf(h) : H.VILLAGER_SPEED + 1;
    for (const v of h.villagers) {
      const p = last.get(v.id);
      if (p && p.tick === tick - 1) worst = Math.max(worst, Math.hypot(v.x - p.x, v.z - p.z) / sp);
      last.set(v.id, { x: v.x, z: v.z, tick });
      const o = open.get(v.id), t = v.task;
      const same = !!o && !!t && o.ref === t;
      if (o && !same) {
        if (!['idle', 'eat', 'rest'].includes(o.kind)) errands.push({ kind: o.kind, ticks: tick - o.start });
        open.delete(v.id);
      }
      if (t && !same) open.set(v.id, { kind: t.kind, ref: t, start: tick });
    }
  }
  return orig.call(this, world, tick);
};
const reset = () => { errands = []; worst = 0; open.clear(); last.clear(); };
const errandStats = () => ({ errands: errands.length, errandTicks: errands.reduce((a, e) => a + e.ticks, 0) });

const rows: Record<string, unknown>[] = [];
const runs: Array<[string, number, { from?: number; pre?: number }]> = [['v7 fresh', 7, {}], ['v6->v7', 7, { from: 6, pre: 300 }]];

if (which === 'all' || which === 'B') {
  for (const [label, rules, o] of runs) for (const seed of SEEDS) for (const at of [0, 120, 400]) {
    reset();
    const r = woodshed(seed, rules, at, 1800, { ...o, well: true });
    rows.push({ t: 'B', label, seed, at, woodshed: r.done, well: r.well, steward: r.f.stewardLog.join(', '), step: worst, ...errandStats() });
  }
}
if (which === 'all' || which === 'F') {
  for (const [label, rules, o] of runs) for (const seed of SEEDS) for (const n of [2, 4, 6]) {
    reset();
    const r = busyField(seed, rules, n, 300, 6, 6, 900, o);
    rows.push({ t: 'F', label, seed, n, claimed: r.claimed, sown: r.sown, seedAtMark: r.seedAtMark, sownAt60: r.sownAt60, units: r.units, step: worst, ...errandStats() });
  }
}
if (which === 'all' || which === 'W') {
  for (const [label, rules, o] of runs) for (const seed of SEEDS) for (const n of [2, 4, 6]) {
    reset();
    const r = busyField(seed, rules, n, 300, 6, 6, 1, o);
    r.f.step(600);
    const m = r.f.work.metrics();
    const byKind = Object.fromEntries(Object.entries(m.waits.byKind).map(([k, b]) => [k, b.max]));
    const long = r.f.work.waits.filter((w) => w.wait > 100).map((w) => `${w.key}@${w.since}->${w.claimed}:${w.wait}`);
    rows.push({ t: 'W', label, seed, n, count: m.waits.count, max: m.waits.max, open: m.waits.open, byKind, long, step: worst, ...errandStats(),
      travel: m.total.travel, work: m.total.work, idle: m.total.idle, ticks: m.total.ticks });
  }
}
if (which === 'all' || which === 'T') {
  for (const seed of SEEDS) {
    reset();
    const f = farm(seed, 7);
    markField(f.s, f.send, 4, 4);
    f.step(1500);
    const m = f.work.metrics();
    rows.push({ t: 'T', label: 'v7 standard', seed, max: m.waits.max, open: m.waits.open, total: m.total, step: worst, ...errandStats() });
  }
}
console.log(JSON.stringify({ speed: speedOf({ version: 7 }), rows }, null, 1));
