// STAB-002 S4: evidence-tuned walking speed under settlement rules v8 (v7 was released with S3 and keeps its
// behaviour; tests/stab002.v8.test.ts proves it against the S3 build).
//  - v8 villagers walk 39 dm per tick (1.95 m/s, 1.5x); v1 to v7 keep 26 dm; starving halves it;
//  - under v8 a tick's step never exceeds the speed (part steps round toward zero; no +1 dm of rounding);
//  - queueing at a gate and the head-on step-aside still work at the higher speed, gates are shut behind;
//  - the herder still drives strays home and shuts the gate (animal speeds unchanged);
//  - a founder chasing villagers round the farm: no villager steps from a cell centre into the founder's cells or
//    closer than the S2 bound,
//    idle villagers step aside;
//  - the walk cycle of the drawn villagers keeps planted feet at both speeds;
//  - S4 priority fixes: routine sowing leaves the seed an owner field still needs; work 85 daytime ticks old is
//    critical for anyone.
// The bounds of the S3 scenarios at the new speed are in stab002.s4-accept-*.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/app/session';
import { GENERATOR_V2 } from '../src/sim/world';
import {
  AGE_CRITICAL, AGE_OVERDUE, DM, Leg, NIGHT_END, PRIORITY, PLAYER_ID, VILLAGER_SPEED, VILLAGER_SPEED_V8, Villager, dueClass, facility,
  NAV_TICK_BUDGET, TILL_PER_UNIT, homesteadNav, homesteadSnapshot, penGate, straysOf, validateHomestead, villagerSpeed,
} from '../src/sim/homestead';
import type { DueJob } from '../src/sim/homestead';
import { navStep } from '../src/sim/nav';
import { PLAYER_R, presenceCells } from '../src/sim/bodies';
import { CONTACT_SQUEEZE_DEPTH } from '../src/sim/character';
import { plantedStride } from '../src/render/characters';
import { Walk, farm as s2farm } from './stab002-s2-harness';
import { farm, markField } from './stab002-s3-harness';

let seq = 0;
const send = (s: GameSession, c: Record<string, unknown>) => s.dispatch({ schema: 3, id: `s4:${seq++}`, expectedRevision: s.world.revision, ...c } as never);
const ticks = (s: GameSession, n: number, each?: () => void) => {
  for (let i = 0; i < n; i++) { const r = send(s, { type: 'tick', ticks: 1 }); assert.ok(r.ok, JSON.stringify(r)); each?.(); }
};
const founded = (rules: number, seed = 1337) => {
  const s = GameSession.genesis(seed, GENERATOR_V2);
  assert.ok(send(s, { type: 'found_homestead', rules }).ok);
  return s;
};
function calm(s: GameSession) {
  const h = s.world.homestead!;
  for (const e of h.enclosures) { e.water = 30; e.feed = 30; e.grass = 100; e.eggs = 0; }
  for (const a of h.animals) a.product = 0;
  for (const v of h.villagers) { v.hunger = Math.min(v.hunger, 30); v.energy = Math.max(v.energy, 80); }
}
const cellOf = (dm: number) => Math.floor(dm / DM);
const cellKey = (v: { x: number; z: number }) => `${cellOf(v.x)},${cellOf(v.z)}`;
const gate = (s: GameSession, id: string) => s.world.homestead!.gates!.find((g) => g.id === id)!.state;
function walkTask(kind: string, target: string, to: { x: number; z: number }, workTicks = 6): NonNullable<Villager['task']> {
  const legs: Leg[] = [{ op: 'walk', x: to.x, z: to.z, ticks: 0, effect: 'none' }, { op: 'work', x: to.x, z: to.z, ticks: workTicks, effect: 'none' }];
  return { kind, target, legs, leg: 0, progress: 0 };
}
/** Park the third villager inside the farmhouse on a long stint, out of a two-villager test. */
function park(s: GameSession, v: Villager) {
  const home = facility(s.world.homestead!, 'farmhouse')!.use;
  v.x = home.x; v.z = home.z; delete v.nav;
  v.task = walkTask('feed', `feed:park:${v.id}`, home, 500);
}

test('speed: v8 villagers walk 39 dm per tick (1.95 m/s), v1-v7 keep 26 dm (v7 as released with S3); a full tick covers the whole speed and never more; starving halves it', () => {
  assert.equal(VILLAGER_SPEED, 26);
  assert.equal(VILLAGER_SPEED_V8, 39);
  for (const v of [1, 2, 3, 4, 5, 6, 7]) assert.equal(villagerSpeed({ version: v }), 26, `v${v}`);
  assert.equal(villagerSpeed({ version: 8 }), 39);
  for (const [rules, speed, allowance] of [[7, 26, 27], [8, 39, 39]] as const) {
    const s = founded(rules);
    let worst = 0, full = 0;
    const last = new Map<string, { x: number; z: number }>();
    ticks(s, 600, () => {
      for (const v of s.world.homestead!.villagers) {
        const b = last.get(v.id);
        if (b) { const d = Math.hypot(v.x - b.x, v.z - b.z); worst = Math.max(worst, d); if (d >= speed - 1) full++; }
        last.set(v.id, { x: v.x, z: v.z });
      }
    });
    assert.ok(worst <= allowance, `v${rules}: largest step ${worst.toFixed(2)} dm against ${allowance}`);
    assert.ok(worst >= speed - 1 && full > 20, `v${rules}: villagers do walk at ${speed} dm (largest ${worst.toFixed(2)}, ${full} full steps)`);
  }
  // Starving: half the speed, still exact.
  const s = founded(8);
  calm(s);
  const h = s.world.homestead!;
  const v = h.villagers[0];
  for (const o of h.villagers.slice(1)) park(s, o);
  const home = facility(h, 'farmhouse')!.use, far = { x: home.x + 200, z: home.z + 120 };
  s.world.life!.tick = 300;
  v.hunger = 100; v.task = walkTask('feed', 'feed:test', far, 50); delete v.nav;
  let prev = { x: v.x, z: v.z }, max = 0;
  for (let i = 0; i < 12; i++) {
    const r = send(s, { type: 'tick', ticks: 1 }); assert.ok(r.ok);
    v.hunger = 100;
    max = Math.max(max, Math.hypot(v.x - prev.x, v.z - prev.z)); prev = { x: v.x, z: v.z };
  }
  assert.ok(max <= 39 / 2 && max >= 18, `starving step ${max.toFixed(2)} dm`);
});

test('exact part steps: with `exact` a step that ends between two centres is never longer than the speed; without it (v2-v7) the old rounding is kept', () => {
  const s = founded(8);
  const h = s.world.homestead!;
  const grid = homesteadNav(s.world, h);
  const home = facility(h, 'farmhouse')!.use;
  let overExact = 0, overOld = 0, n = 0;
  for (const exact of [true, false]) {
    for (let k = 0; k < 40; k++) {
      const w = { x: home.x + 25 + (k % 7), z: home.z + 40 + (k % 5) };
      const goal = { x: w.x + 60 + 13 * k, z: w.z + 37 + 7 * k, reach: 7 };
      for (let t = 0; t < 8; t++) {
        const b = { x: w.x, z: w.z };
        navStep({ world: s.world, grid, tick: t, budget: { left: NAV_TICK_BUDGET }, gate: () => 'open', setGate: () => {}, canOperate: () => true, ...(exact ? { exact: true } : {}) },
          w, goal, 39, 'test');
        const d = Math.hypot(w.x - b.x, w.z - b.z);
        if (exact && d > 39 + 1e-9) overExact++;
        if (!exact && d > 39 + 1e-9) overOld++;
        n++;
      }
    }
  }
  assert.equal(overExact, 0, 'exact steps never exceed the speed');
  assert.ok(overOld > 0, `the old rounding does exceed it now and then (${overOld} of ${n / 2}), which v2-v7 keep`);
});

test('v8 at 39 dm: two villagers queue at a narrow gate (the wait is in the saved state); head-on at the gate the later id steps aside; the gate is shut behind', () => {
  // Queue.
  {
    const s = founded(8);
    const h = s.world.homestead!;
    calm(s);
    const pg = penGate(h, 'pen');
    const [ada, bram, cora] = [...h.villagers].sort((a, b) => a.id.localeCompare(b.id));
    park(s, cora);
    const trough = facility(h, 'pen')!.trough!;
    ada.x = pg.outside[0] * DM + 5; ada.z = (pg.outside[1] - 1) * DM + 5;
    bram.x = pg.outside[0] * DM + 5; bram.z = (pg.outside[1] - 2) * DM + 5;
    for (const v of [ada, bram]) { delete v.nav; v.task = walkTask('feed', `feed:${v === ada ? 'pen' : 'sty'}`, trough, 20); v.hunger = 0; v.energy = 100; }
    s.world.life!.tick = 300;
    let queued = false, saved = false;
    const spot = new Map<string, string>();
    for (let i = 0; i < 40; i++) {
      ticks(s, 1, () => calm(s));
      assert.notEqual(cellKey(ada), cellKey(bram), `tick ${i}: shared a cell`);
      for (const v of [ada, bram]) if (v.task?.kind === 'feed' && v.task.leg === 1 && !spot.has(v.name)) spot.set(v.name, cellKey(v));
      if (/queueing at the pen gate behind Ada/.test(bram.nav?.wait?.reason ?? '')) {
        queued = true;
        const snap = JSON.parse(JSON.stringify(homesteadSnapshot(h)));
        saved ||= JSON.stringify(validateHomestead(snap, s.world.life!.tick)) === JSON.stringify(snap);
      }
    }
    assert.ok(queued, 'Bram queued behind Ada at the pen gate');
    assert.ok(saved, 'the wait is saved state');
    assert.equal(spot.size, 2, 'both worked at the trough');
    assert.notEqual(spot.get('Ada'), spot.get('Bram'));
    assert.equal(gate(s, 'gate:pen'), 'closed');
  }
  // Head-on.
  {
    const s = founded(8);
    const h = s.world.homestead!;
    calm(s);
    const pg = penGate(h, 'pen');
    const [ada, bram, cora] = [...h.villagers].sort((a, b) => a.id.localeCompare(b.id));
    park(s, cora);
    ada.x = pg.inside[0] * DM + 5; ada.z = (pg.inside[1] + 1) * DM + 5;
    bram.x = pg.outside[0] * DM + 5; bram.z = (pg.outside[1] - 1) * DM + 5;
    const yard = { x: pg.outside[0] * DM + 5, z: (pg.outside[1] - 4) * DM + 5 };
    const pen = { x: pg.inside[0] * DM + 5, z: (pg.inside[1] + 3) * DM + 5 };
    for (const v of [ada, bram]) { delete v.nav; v.hunger = 0; v.energy = 100; }
    ada.task = walkTask('feed', 'feed:yard', yard, 30);
    bram.task = walkTask('feed', 'feed:pen', pen, 30);
    s.world.life!.tick = 300;
    const arrived = new Set<string>();
    let shut: string | null = null, aside = false;
    const at = (v: Villager, p: { x: number; z: number }) => Math.abs(v.x - p.x) <= 10 && Math.abs(v.z - p.z) <= 10;
    for (let i = 0; i < 40; i++) {
      ticks(s, 1, () => calm(s));
      assert.notEqual(cellKey(ada), cellKey(bram), `tick ${i}: shared a cell`);
      if (/stepping aside/.test(bram.nav?.wait?.reason ?? '')) aside = true;
      if (at(ada, yard)) arrived.add('Ada');
      if (at(bram, pen)) arrived.add('Bram');
      if (arrived.size === 2 && shut === null) shut = gate(s, 'gate:pen');
    }
    assert.ok(arrived.has('Ada') && arrived.has('Bram'), `both got through (${[...arrived]})`);
    assert.ok(aside, 'Bram (the later id) stepped aside');
    assert.equal(shut, 'closed', 'the gate was shut behind them');
  }
});

test('v8 at 39 dm: the herder drives strays back through the gate, holds it and shuts it; animals keep their own speeds', () => {
  const s = founded(8);
  const h = s.world.homestead!;
  ticks(s, 10);
  assert.ok(send(s, { type: 'set_gate', gateId: 'gate:pen', state: 'open' }).ok);
  ticks(s, 300, () => calm(s));
  assert.ok(straysOf(h, 'pen').length >= 1, 'some sheep or goats are out');
  assert.ok(send(s, { type: 'set_gate', gateId: 'gate:pen', state: 'closed' }).ok);
  let roundUp = false, held = false, maxAnimal = 0;
  const last = new Map(h.animals.map((a) => [a.id, { x: a.x, z: a.z }]));
  for (let i = 0; i < 600 && straysOf(h, 'pen').length; i++) {
    ticks(s, 1, () => calm(s));
    for (const v of h.villagers) {
      if (v.task?.kind === 'round_up') roundUp = true;
      if (v.task?.legs[v.task.leg]?.effect === 'hold_gate' && gate(s, 'gate:pen') === 'open') held = true;
    }
    for (const a of h.animals) { const b = last.get(a.id); if (b) maxAnimal = Math.max(maxAnimal, Math.hypot(a.x - b.x, a.z - b.z)); last.set(a.id, { x: a.x, z: a.z }); }
  }
  assert.ok(roundUp && held, `round-up (${roundUp}), gate held (${held})`);
  assert.equal(straysOf(h, 'pen').length, 0, 'every stray is back');
  ticks(s, 40, () => calm(s));
  assert.equal(gate(s, 'gate:pen'), 'closed', 'the gate was shut behind them');
  assert.ok(maxAnimal <= 13, `animals still walk at most their driven speed (largest step ${maxAnimal.toFixed(1)} dm)`);
});

test('v8 at 39 dm: a founder chasing villagers round the farm for 3 seeds: no villager walks into the founder\'s cells or within the S2 distance; idle villagers step aside; capsule overlap within the squeeze', () => {
  for (const seed of [1337, 42, 7]) {
    const s = s2farm(8, seed);
    const h = s.world.homestead!;
    // Start at the store, in the middle of the traffic.
    const home = facility(h, 'farmhouse')!.use;
    const w = new Walk(s, home.x / DM + 3.5, home.z / DM + 4.5);
    let checked = 0, asides = 0, near = Infinity, moves = 0, committed = 0;
    const prev = new Map<string, { x: number; z: number; idle: boolean }>();
    let lastTick = s.world.life!.tick, target = h.villagers[0].id;
    for (let f = 0; f < 60 * 160; f++) {
      if (f % 600 === 0) target = h.villagers[(f / 600) % h.villagers.length].id;
      // Steer at the villager as drawn (its capsule, the same blend the renderer draws), as a player would.
      const v = h.villagers.find((x) => x.id === target)!;
      const drawn = w.current().find((b) => b.id === target) ?? { x: v.x / DM, z: v.z / DM };
      const dx = drawn.x - w.ch.x, dz = drawn.z - w.ch.z, d = Math.hypot(dx, dz);
      w.frame(d > 0.3 ? { moveX: dx / d, moveZ: dz / d } : {});
      if (s.world.life!.tick === lastTick) continue;
      lastTick = s.world.life!.tick;
      const sent = s.journal.entries[s.journal.entries.length - 1].command as { presence?: { x: number; z: number; mx: number; mz: number } };
      const at = sent.presence;
      if (at) {
        const cells = new Set(presenceCells(at).map(([x, z]) => `${x},${z}`));
        for (const u of h.villagers) {
          const dd = Math.hypot(u.x - at.x, u.z - at.z);
          near = Math.min(near, dd);
          const b = prev.get(u.id);
          // The founder may press up to a villager standing still (contact stops at the capsules); a villager that
          // moves never steps into the founder's cells and never closer than the S2 distance (0.6 m) while closing in.
          if (b && (b.x !== u.x || b.z !== u.z)) {
            const d0 = Math.hypot(b.x - at.x, b.z - at.z);
            // A step already under way (from between two centres, into the cell it was stepping into, which it holds in
            // the occupancy map) may end in a cell the founder walked into meanwhile; a step from a centre never does.
            const atCentre = b.x % DM === 5 || b.x % DM === -5 ? (b.z % DM === 5 || b.z % DM === -5) : false;
            assert.ok(!cells.has(cellKey(u)) || cells.has(cellKey(b)) || !atCentre, `seed ${seed}: ${u.name} walked from a cell centre into the founder's cells (tick ${s.world.life!.tick})`);
            if (cells.has(cellKey(u)) && !cells.has(cellKey(b))) committed++;
            assert.ok(dd >= PLAYER_R * 2 * 10 - 1 || dd >= d0, `seed ${seed}: ${u.name} walked to ${dd.toFixed(1)} dm from the founder (from ${d0.toFixed(1)})`);
            moves++;
          }
          // An idle villager the founder walked at moved away by a step (the S2 step aside).
          if (b && b.idle && (at.mx || at.mz) && Math.hypot(b.x - at.x, b.z - at.z) < 15 && dd > Math.hypot(b.x - at.x, b.z - at.z)) asides++;
        }
        checked++;
      }
      for (const u of h.villagers) prev.set(u.id, { x: u.x, z: u.z, idle: !u.task || u.task.kind === 'idle' });
    }
    assert.ok(checked >= 60 && moves >= 60, `seed ${seed}: ${checked} ticks with presence, ${moves} villager moves`);
    console.log(`# seed ${seed}: ${checked} ticks, ${moves} villager moves, ${asides} step-asides, nearest ${near.toFixed(1)} dm, committed steps into founder cells ${committed}, deepest overlap ${(-w.minGap).toFixed(3)} m`);
    assert.ok(asides >= 1, `seed ${seed}: idle villagers stepped aside (${asides})`);
    assert.ok(w.minGap >= -(CONTACT_SQUEEZE_DEPTH + 0.02), `seed ${seed}: deepest capsule overlap ${(-w.minGap).toFixed(3)} m (${w.minGapId})`);
    assert.ok(near < 15, `seed ${seed}: the chase did reach the villagers (nearest ${near.toFixed(1)} dm)`);
    assert.ok(!h.villagers.some((u) => u.nav?.wait?.by === PLAYER_ID && s.world.life!.tick - u.nav.wait.since > 15), 'no wait on the founder beyond NAV_GIVE_UP');
  }
});

test('drawn villagers: the walk cycle keeps planted feet at 1.3 and 1.95 m/s (the leg sweep per step equals the ground covered); cadence rises with speed', () => {
  // groundPose: amplitude (0.35 + 0.45 min(1, v/7.5)) min(1, 1.5 v); hips 0.82 m above the feet.
  const amp = (v: number) => (0.35 + 0.45 * Math.min(1, v / 7.5)) * Math.min(1, v * 1.5);
  for (const v of [1.3, 1.95]) {
    const stride = plantedStride(v);
    const sweep = 2 * 0.82 * Math.sin(amp(v));
    assert.ok(Math.abs(stride / 2 - sweep) < 1e-9, `${v} m/s: step ${(stride / 2).toFixed(3)} m vs leg sweep ${sweep.toFixed(3)} m`);
  }
  const cadence = (v: number) => (2 * v) / plantedStride(v); // steps per second
  assert.ok(cadence(1.3) > 1.7 && cadence(1.3) < 2.1, `1.3 m/s: ${cadence(1.3).toFixed(2)} steps/s`);
  assert.ok(cadence(1.95) > 2.4 && cadence(1.95) < 2.8, `1.95 m/s: ${cadence(1.95).toFixed(2)} steps/s`);
  // The founder's stride (2.4 m per cycle) would make a 1.95 m/s villager's feet slide by 40 % of each step.
  assert.ok(2.4 / 2 > 2 * 0.82 * Math.sin(amp(1.95)) * 1.5);
});

test('S4 priority: routine sowing leaves the seed an owner field still needs (v8: a dug routine field gets none of the 4 seed a new owner field needs, which is fully sown); work 85 daytime ticks old is critical for anyone under v8 and is not under v7 (S3)', () => {
  // A dug 6 x 6 routine field and a new 6 x 6 owner field (4 units each) with exactly 4 seed in the store and no
  // fibre to thresh, seeds 1337 / 42 / 7. (S4 found the fault on v6 -> v7 seed 42 with 4 fields, where routine
  // sowing took 2 seed the owner field needed; the newborn follow rule changed that run's random stream under v8,
  // so the case is set up directly.) Under v8 no seed is fetched for the routine field while the owner field still
  // needs it, and the owner field is fully sown. v7 is run the same way and only logged: these set-ups do not hit
  // the S3 race either (the v7 and v8 difference is pinned by the hashes in stab002.v8.test.ts).
  const took: Record<number, number> = { 7: 0, 8: 0 };
  for (const seed of [1337, 42, 7]) for (const rules of [8, 7]) {
    const f = farm(seed, rules);
    const routineId = markField(f.s, f.send, 6, 6);
    const orderId = markField(f.s, f.send, 6, 6);
    const hh = f.s.world.homestead!;
    const routine = hh.plots.find((p) => p.id === routineId)!;
    delete routine.order; routine.state = 'tilled'; routine.tilled = TILL_PER_UNIT * 4; routine.sown = 0;
    const inv = f.s.world.life!.stockpiles.get('stockpile:founder')!.inventory;
    inv.seed = 4; delete inv.fiber; hh.overflow.seed = 0; delete hh.overflow.fiber;
    const order = () => f.s.world.homestead!.plots.find((p) => p.id === orderId)!;
    for (let i = 0; i < 900 && order().state !== 'growing'; i++) {
      f.step();
      for (const v of f.s.world.homestead!.villagers) {
        const t = v.task;
        if (t && t.target === routineId && t.legs.some((l, k) => k >= t.leg && l.effect === 'take' && l.item === 'seed')) took[rules]++;
      }
    }
    if (rules === 8) {
      assert.equal(took[8], 0, `seed ${seed}, v8: no seed fetched for the routine field while the owner field needs it`);
      assert.equal(order().state, 'growing', `seed ${seed}, v8: the owner field is fully sown`);
    }
  }
  console.log(`# seed for routine sowing while the owner field needed it: v8 ${took[8]} task-ticks, v7 ${took[7]}`);
  // Classes by age (daytime ticks), any role.
  const s = farm(1337, 8);
  const h = s.s.world.homestead!;
  const j: DueJob = { key: 'eggs:coop', kind: 'eggs', target: 'coop', role: 'herder', base: 3, critical: false, place: 'coop' };
  const day0 = 300 + NIGHT_END; // the second dawn (daytime until tick 771)
  const at = (age: number) => { h.due = { ...(h.due ?? {}), 'eggs:coop': day0 }; return dueClass(h, j, day0 + age, 'farmer'); };
  assert.equal(at(10), PRIORITY.routine);
  assert.equal(at(AGE_OVERDUE), PRIORITY.lateOther, 'another role: late, after owner orders');
  assert.equal(at(AGE_CRITICAL - 1), PRIORITY.lateOther);
  assert.equal(at(AGE_CRITICAL), PRIORITY.critical, 'critical for anyone at 85');
  assert.equal(dueClass(h, j, day0 + AGE_CRITICAL, 'herder'), PRIORITY.critical);
  assert.ok(PRIORITY.critical < PRIORITY.onJob && PRIORITY.critical < PRIORITY.order);
  // Rules v7 (released with S3) have no critical age: the same job stays late for another role, overdue for its own.
  h.version = 7;
  assert.equal(at(AGE_CRITICAL), PRIORITY.lateOther, 'v7: no critical age');
  assert.equal(dueClass(h, j, day0 + AGE_CRITICAL, 'herder'), PRIORITY.overdue);
  h.version = 8;
});
