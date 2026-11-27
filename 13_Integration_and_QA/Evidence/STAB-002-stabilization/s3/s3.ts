// STAB-002 S3 evidence: the BUG-C scenarios, before (rules v6) and after (rules v7), fresh and upgraded v6 -> v7.
// From Game/: npx esbuild ../13_Integration_and_QA/Evidence/STAB-002-stabilization/s3/s3.ts --bundle --platform=node
//   --format=esm --external:three --outfile=tests/.s3.tmp.mjs && node tests/.s3.tmp.mjs [B|F|T|W|all]
import { busyField, farm, markField, woodshed } from '../../../../Game/tests/stab002-s3-harness';
import { VILLAGER_SPEED } from '../../../../Game/src/sim/homestead';

const SEEDS = [1337, 42, 7];
const which = process.argv[2] ?? 'all';
const out: string[] = [];
const say = (s: string) => { out.push(s); console.log(s); };
let worstStep = 0;
const step = (f: { maxStep: () => number }) => { worstStep = Math.max(worstStep, f.maxStep()); };

if (which === 'all' || which === 'B') {
  say('## B: woodshed + well approved, fresh store, steward default, no owner help (ticks after approval; null = not within 1800)');
  say('| rules | seed | approved at | woodshed done | well done | steward moves |');
  say('|---|---|---|---|---|---|');
  for (const [label, rules, o] of [['v6 fresh', 6, {}], ['v7 fresh', 7, {}], ['v6->v7 (300 ticks of v6)', 7, { from: 6, pre: 300 }]] as const) {
    for (const seed of SEEDS) for (const at of [0, 120, 400]) {
      if (label.startsWith('v6->') && at === 400) continue;
      const r = woodshed(seed, rules, at, 1800, { ...o, well: true });
      step(r.f);
      say(`| ${label} | ${seed} | ${at} | ${r.done ?? 'never'} | ${r.well ?? 'never'} | ${r.f.stewardLog.join(', ')} |`);
    }
  }
}
if (which === 'all' || which === 'F') {
  say('\n## F: busy farm (n 4x4 fields marked at tick 0, 300 ticks played), then a 6x6 owner field; ticks after marking');
  say('| rules | seed | fields | first claimed | fully sown | free seed at marking | units sown by +60 | max routine wait (to sown) |');
  say('|---|---|---|---|---|---|---|---|');
  for (const [label, rules, o] of [['v6 fresh', 6, {}], ['v7 fresh', 7, {}], ['v6->v7', 7, { from: 6, pre: 300 }]] as const) {
    for (const seed of SEEDS) for (const n of [2, 4, 6]) {
      if (label === 'v6->v7' && n === 6) continue;
      const r = busyField(seed, rules, n, 300, 6, 6, 900, o);
      step(r.f);
      say(`| ${label} | ${seed} | ${n} | ${r.claimed ?? 'never'} | ${r.sown ?? 'never'} | ${r.seedAtMark} | ${r.sownAt60}/${r.units} | ${r.f.work.metrics().waits.max} |`);
    }
  }
}
if (which === 'all' || which === 'W') {
  say('\n## W: routine and upkeep waits (daytime ticks from due to taken), busy farms played 600 ticks after the owner field');
  say('| rules | seed | fields | pieces of work | max wait | by kind (max) | longest still open |');
  say('|---|---|---|---|---|---|---|');
  for (const [label, rules, o] of [['v6 fresh', 6, {}], ['v7 fresh', 7, {}], ['v6->v7', 7, { from: 6, pre: 300 }]] as const) {
    for (const seed of SEEDS) for (const n of [2, 4, 6]) {
      if (label === 'v6->v7' && n === 6) continue;
      const r = busyField(seed, rules, n, 300, 6, 6, 1, o);
      r.f.step(600);
      step(r.f);
      const m = r.f.work.metrics().waits;
      say(`| ${label} | ${seed} | ${n} | ${m.count} | ${m.max} | ${Object.entries(m.byKind).map(([k, b]) => `${k} ${b.max}`).join(', ')} | ${m.open ? `${m.open.key} ${m.open.age}` : '-'} |`);
    }
  }
}
if (which === 'all' || which === 'T') {
  say('\n## T: time per villager, fresh farm, 4x4 owner field at tick 0, steward default, 1500 ticks (share of all ticks)');
  say('| rules | seed | villager | travel | waiting | work | idle | eating | sleeping | starving | work share of awake ticks |');
  say('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const rules of [6, 7]) for (const seed of SEEDS) {
    const f = farm(seed, rules);
    markField(f.s, f.send, 4, 4);
    f.step(1500);
    step(f);
    const m = f.work.metrics();
    const names = new Map(f.s.world.homestead!.villagers.map((v) => [v.id, v.name]));
    const pc = (n: number, d: number) => `${((100 * n) / d).toFixed(0)} %`;
    for (const [id, t] of [...Object.entries(m.villagers), ['all', m.total] as const]) {
      const awake = t.ticks - t.sleeping;
      say(`| v${rules} | ${seed} | ${names.get(id) ?? id} | ${pc(t.travel, t.ticks)} | ${pc(t.waiting, t.ticks)} | ${pc(t.work, t.ticks)} | ${pc(t.idle, t.ticks)} | ${pc(t.eating, t.ticks)} | ${pc(t.sleeping, t.ticks)} | ${pc(t.starving, t.ticks)} | ${pc(t.work, awake)} |`);
    }
    say(`| v${rules} | ${seed} | waits | max ${m.waits.max} over ${m.waits.count} pieces of work | | | | | | | |`);
  }
}
say(`\nLargest villager step in one tick, all runs: ${(worstStep * VILLAGER_SPEED).toFixed(1)} dm (${worstStep.toFixed(3)} of VILLAGER_SPEED ${VILLAGER_SPEED} dm; ${(worstStep * VILLAGER_SPEED / (VILLAGER_SPEED + 1)).toFixed(3)} of the ${VILLAGER_SPEED + 1} dm allowance with integer-dm rounding)`);
