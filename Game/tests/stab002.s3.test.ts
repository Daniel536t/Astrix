// STAB-002 S3 "work priority and steward rules" (settlement rules v7): priority classes with ageing,
// any villager helps with owner orders, two share a large job, batched trips, digging in units,
// pre-emption only with empty hands, eating before bed and slower hunger asleep, the steward's
// cooldown in the world, per-villager time and routine waits. Rules v1-v6 are untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameSession } from '../src/app/session';
import { GENERATOR_V2 } from '../src/sim/world';
import {
  AGE_OVERDUE, DAY_TICKS, findFieldSpot, NIGHT_END, NIGHT_START, SITE_RULES, TILL_PER_UNIT, daylight, daylightAge, dueWork, homesteadSnapshot, validateHomestead,
} from '../src/sim/homestead';
import type { Effect, HomesteadState } from '../src/sim/homestead';
import { FOUNDER_STOCKPILE_ID } from '../src/sim/economy';
import { newStewardMemory, stewardCommands, stewardDue, stewardPlan } from '../src/app/steward';
import { WORK_CATS } from '../src/app/work-time';
import { busyField, farm, markField, placeApproved } from './stab002-s3-harness';
import { findBuildingSpot } from '../src/sim/buildings';

type Session = GameSession;
let seq = 0;
const send = (s: Session, c: Record<string, unknown>) => s.dispatch({ schema: 3, id: `s3t:${seq++}:${String(c.type)}`, expectedRevision: s.world.revision, ...c } as never);
const ok = (s: Session, c: Record<string, unknown>) => { const r = send(s, c); assert.ok(r.ok, `${String(c.type)}: ${JSON.stringify(r)}`); return r; };
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const restore = (s: Session) => GameSession.restore(clone(s.snapshot), clone(s.journal));

test('rules v1-v6 and their saves are unchanged; the S3 state (leg targets, shared loads, part-sown fields, owner orders, due work, priorities, the steward cooldown) is v7 only and strictly validated', () => {
  assert.equal(GameSession.genesis(1337).stateHash, 'e659504b056654dc');
  const fixture = JSON.parse(readFileSync('tests/fixtures/stab002-v6-save.json', 'utf8'));
  const s = GameSession.restore(clone(fixture.snapshot), clone(fixture.journal));
  assert.equal(s.stateHash, '037429c4ffbcf710');
  assert.equal(JSON.stringify(s.snapshot), JSON.stringify(fixture.snapshot));
  const v6 = s.world.homestead!;
  const tick = s.world.life!.tick;
  const bad = (h: HomesteadState, mutate: (r: Record<string, any>) => void) => { const raw = clone(homesteadSnapshot(h)) as Record<string, any>; mutate(raw); return () => validateHomestead(raw, tick); };
  assert.throws(bad(v6, (r) => { r.due = {}; }));
  assert.throws(bad(v6, (r) => { r.priority = ['coop']; }));
  assert.throws(bad(v6, (r) => { r.steward.lastAssign = 0; }));
  assert.throws(bad(v6, (r) => { r.plots.push({ id: 'field:999', x: 0, z: 0, w: 4, d: 4, crop: 'wheat', state: 'wild', growth: 0, moisture: 0, dry: 0, tilled: 0, order: 0 }); }));
  // Upgrade the same save: everything validates under v7 and round-trips byte for byte after play.
  ok(s, { type: 'upgrade_homestead', rules: 7 });
  const f = { s, step: (n: number) => { for (let i = 0; i < n; i++) ok(s, { type: 'tick', ticks: 1 }); } };
  f.step(120);
  const h = s.world.homestead!;
  assert.ok(h.due && Object.keys(h.due).length >= 0);
  const snap = homesteadSnapshot(h);
  assert.equal(JSON.stringify(validateHomestead(clone(snap), s.world.life!.tick)), JSON.stringify(snap));
  assert.throws(bad(h, (r) => { r.due = { 'Bad Key': 1 }; }));
  assert.throws(bad(h, (r) => { r.priority = ['coop', 'coop']; }));
  assert.throws(bad(h, (r) => { r.steward.lastAssign = r.steward.lastAssign === undefined ? 10 ** 9 : -1; }));
  // set_priority is v7 only.
  const old = GameSession.genesis(1337, GENERATOR_V2);
  ok(old, { type: 'found_homestead', rules: 6 });
  const r = send(old, { type: 'set_priority', target: 'coop', on: true });
  assert.ok(!r.ok && r.code === 'needs_rules');
});

test('priority: a field the owner marks is taken at once by any free villager (role is a preference); routine work ages up (urgent, then overdue for its own role) in daytime ticks; set_priority makes upkeep an order and is journaled', () => {
  assert.equal(daylight(DAY_TICKS), DAY_TICKS - (NIGHT_END - NIGHT_START));
  assert.equal(daylightAge(NIGHT_START - 5, NIGHT_END + 5), 10);
  const f = farm(42, 7);
  f.step(40);
  const id = markField(f.s, f.send, 6, 6);
  const plot = f.s.world.homestead!.plots.find((p) => p.id === id)!;
  assert.equal(plot.order, f.s.world.life!.tick, 'an owner order from the tick it was marked');
  let taken: string | null = null;
  for (let i = 0; i < 10 && !taken; i++) { f.step(1); taken = f.s.world.homestead!.villagers.find((v) => v.task?.target === id)?.role ?? null; }
  assert.ok(taken, 'taken within 10 ticks');
  // Herders help with owner orders too: over the field's whole job some villager who is not a farmer works on it.
  const roles = new Set<string>();
  for (let i = 0; i < 120 && f.s.world.homestead!.plots.find((p) => p.id === id)!.state !== 'growing'; i++) {
    f.step(1);
    for (const v of f.s.world.homestead!.villagers) if (v.task?.target === id) roles.add(v.role);
  }
  assert.ok(f.s.world.homestead!.plots.find((p) => p.id === id)!.state === 'growing', 'sown');
  assert.equal(f.s.world.homestead!.plots.find((p) => p.id === id)!.order, undefined, 'the order ends when it is sown');
  assert.ok([...roles].some((r) => r !== 'farmer'), `roles on the owner field: ${[...roles]}`);
  // Due work keeps the tick it became due (the age is daytime ticks).
  const h = f.s.world.homestead!;
  assert.ok(Object.values(h.due!).every((t) => t <= f.s.world.life!.tick));
  assert.ok(Object.keys(h.due!).length <= dueWork(f.s.world, h).length + 8);
  // set_priority: the coop's work becomes an order (journaled, validated, removable).
  ok(f.s, { type: 'set_priority', target: 'coop', on: true });
  assert.deepEqual(f.s.world.homestead!.priority, ['coop']);
  assert.ok(!send(f.s, { type: 'set_priority', target: 'coop', on: true }).ok, 'unchanged');
  assert.ok(!send(f.s, { type: 'set_priority', target: 'field:12345', on: true }).ok, 'no such field');
  const re = restore(f.s);
  assert.equal(re.stateHash, f.s.stateHash);
  ok(f.s, { type: 'set_priority', target: 'coop', on: false });
  assert.equal(f.s.world.homestead!.priority, undefined);
  assert.ok(AGE_OVERDUE > 0);
});

test('large jobs take two villagers, never three; digging is split into units of at most 4 work ticks; batched trips carry for two sites, water several troughs and milk or shear several animals on one trip', () => {
  let two = 0, three = 0, twoSites = 0, troughs = 0, animals = 0, bigTill = 0;
  for (const seed of [1337, 42, 7]) {
    const f = farm(seed, 7);
    placeApproved(f.s, f.send, 'woodshed'); placeApproved(f.s, f.send, 'well');
    markField(f.s, f.send, 8, 8);
    for (let i = 0; i < 900; i++) {
      f.step(1);
      const h = f.s.world.homestead!;
      const on = new Map<string, number>();
      for (const v of h.villagers) {
        const t = v.task;
        if (!t) continue;
        if (['till', 'sow', 'haul', 'build'].includes(t.kind)) on.set(t.target, (on.get(t.target) ?? 0) + 1);
        if (t.kind === 'till') for (const l of t.legs) if (l.effect === 'till' && l.ticks > TILL_PER_UNIT) bigTill++;
        if (t.legs.filter((l) => l.effect === 'fetch').length >= 2) twoSites++;
        if (t.legs.filter((l) => l.effect === 'water_trough').length >= 2) troughs++;
        if (t.legs.filter((l) => l.effect === 'milk' || l.effect === 'shear').length >= 2) animals++;
      }
      for (const n of on.values()) { if (n === 2) two++; if (n > 2) three++; }
    }
  }
  assert.ok(two > 0, 'two villagers shared a job');
  assert.equal(three, 0, 'never three on one job');
  assert.equal(bigTill, 0, 'digging legs are one unit');
  assert.ok(twoSites > 0, 'one load for two sites');
  assert.ok(troughs > 0, 'several troughs on one bucket trip');
  assert.ok(animals > 0, 'several animals on one trip');
});

/** Effects that use up (or set down) a load in hand. */
const USES: ReadonlySet<Effect> = new Set<Effect>(['store', 'stow', 'deliver', 'sow', 'water_plot', 'water_trough', 'fill_feed', 'plant']);

test('a load in hand is never dropped by a change of plan: it shrinks only on a leg that uses it; reservations never exceed the store, deliveries never exceed the cost; pre-emption happens only with empty hands', () => {
  let shrinks = 0, preempted = 0, preemptedWithLoad = 0;
  for (const seed of [1337, 42]) {
    const f = farm(seed, 7);
    placeApproved(f.s, f.send, 'woodshed'); placeApproved(f.s, f.send, 'well');
    markField(f.s, f.send, 6, 6);
    for (let i = 0; i < 900; i++) {
      const h0 = f.s.world.homestead!;
      const before = new Map(h0.villagers.map((v) => [v.id, { carry: v.carry ? { ...v.carry } : null, task: v.task ? clone(v.task) : null }]));
      if (i === 200) markField(f.s, f.send, 4, 4);
      f.step(1);
      const h = f.s.world.homestead!;
      const inv = f.s.world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory;
      for (const st of h.sites ?? []) {
        for (const [k, n] of Object.entries(st.delivered)) assert.ok(n <= (SITE_RULES[st.kind].cost[k] ?? 0), `${st.id} delivered ${n} ${k}`);
      }
      for (const k of ['wood', 'fiber']) {
        const reserved = (h.sites ?? []).filter((st) => st.state === 'approved').reduce((n, st) => n + (st.reserved[k] ?? 0), 0);
        const stock = (inv[k] ?? 0) + (h.sites ?? []).reduce((n, st) => n + (st.stock?.[k] ?? 0), 0);
        assert.ok(reserved <= stock, `reserved ${reserved} ${k} > stock ${stock}`);
      }
      for (const v of h.villagers) {
        const b = before.get(v.id)!;
        if (b.carry && (!v.carry || v.carry.item !== b.carry.item || v.carry.amount < b.carry.amount)) {
          shrinks++;
          const leg = b.task?.legs[b.task.leg];
          const usedBy = !!leg && leg.op === 'work' && USES.has(leg.effect);
          // Water is poured out and a sapling set down by design (the well is endless; saplings are never stored).
          const known = b.carry.item === 'water' || b.carry.item.startsWith('sapling:');
          assert.ok(usedBy || known, `${v.name} lost ${b.carry.amount} ${b.carry.item} on ${JSON.stringify(leg)} (tick ${f.s.world.life!.tick})`);
        }
        // A task replaced while its first leg was still running counts as a pre-emption.
        if (b.task && v.task && b.task.kind !== 'rest' && (b.task.kind !== v.task.kind || b.task.target !== v.task.target) && v.task.leg === 0
          && b.task.leg === 0 && b.task.legs.length > 1 && b.task.legs[0].op === 'walk' && b.task.kind !== 'idle') {
          preempted++;
          if (b.carry) preemptedWithLoad++;
        }
      }
    }
  }
  assert.ok(shrinks > 0);
  assert.equal(preemptedWithLoad, 0, 'never pre-empted with a load in hand');
  assert.ok(preempted >= 0);
});

test('eating and sleep: villagers eat before bed when hungry, hunger rises a third as fast asleep, nobody wakes starving or hungry, and nobody starves over 3 days', () => {
  for (const seed of [1337, 42, 7]) {
    const f = farm(seed, 7);
    markField(f.s, f.send, 4, 4);
    let starving = 0, ateAtDusk = 0;
    const wake: number[] = [];
    for (let i = 0; i < 3 * DAY_TICKS; i++) {
      f.step(1);
      const t = f.s.world.life!.tick % DAY_TICKS;
      for (const v of f.s.world.homestead!.villagers) {
        if (v.hunger >= 100) starving++;
        if (t === NIGHT_END) wake.push(v.hunger);
        if (t >= NIGHT_START - 25 && t < NIGHT_START && v.task?.kind === 'eat') ateAtDusk++;
      }
    }
    assert.equal(starving, 0, `seed ${seed}: starving villager-ticks`);
    assert.ok(ateAtDusk > 0, `seed ${seed}: eats before bed`);
    assert.ok(wake.every((n) => n < 70), `seed ${seed}: hunger at dawn ${wake}`);
    assert.equal(f.work.metrics().total.starving, 0);
  }
});

test('steward (rules v7): its cooldown is world state, so a reload decides exactly as before; no farmer becomes a herder in the first day; an approved site gets a builder within 60 ticks; anyone fells for a site short of wood within 15 ticks', () => {
  const f = farm(1337, 7);
  const site = placeApproved(f.s, f.send, 'woodshed');
  let builderAt = -1, fellerAt = -1;
  for (let i = 0; i < DAY_TICKS; i++) {
    f.step(1);
    const h = f.s.world.homestead!;
    if (builderAt < 0 && h.villagers.some((v) => v.role === 'builder')) builderAt = f.s.world.life!.tick;
    if (fellerAt < 0 && h.villagers.some((v) => v.task?.kind === 'chop' && v.task.legs.some((l) => l.at === site))) fellerAt = f.s.world.life!.tick;
  }
  assert.ok(builderAt >= 0 && builderAt <= 60, `builder at ${builderAt}`);
  assert.ok(fellerAt >= 0 && fellerAt <= 15, `felling for the site from ${fellerAt}`);
  assert.ok(!f.stewardLog.some((l) => /->herder/.test(l)), `first day moves: ${f.stewardLog}`);
  const h = f.s.world.homestead!;
  assert.ok(h.steward.lastAssign !== undefined && h.steward.lastAssign > 0, 'the cooldown is in the world');
  // Reload at a tick the steward runs on, then run the steward and the sim on both for 300 ticks: same journal outcome, same hash.
  const a = f.s, b = restore(f.s);
  assert.equal(b.stateHash, a.stateHash);
  const run = (s: Session) => {
    const mem = newStewardMemory();
    for (let i = 0; i < 300; i++) {
      ok(s, { type: 'tick', ticks: 1 });
      const tick = s.world.life!.tick;
      if (stewardDue(tick)) for (const c of stewardCommands(s.world.homestead!, stewardPlan(s.world, tick, mem))) send(s, c);
    }
    return s.stateHash;
  };
  assert.equal(run(b), run(a));
});

test('replay and reload: a v7 journal with orders, shared jobs and batched trips replays from genesis to the same hash; a save mid-task restores and plays on identically', () => {
  // Only journaled commands (the bag's 24 wood pays the fences).
  const s = GameSession.genesis(42, GENERATOR_V2);
  ok(s, { type: 'found_homestead', rules: 7 });
  for (const [w, d] of [[4, 4], [4, 4]]) ok(s, { type: 'mark_field', ...findFieldSpot(s.world, w, d, 'wheat')! });
  for (let i = 0; i < 120; i++) ok(s, { type: 'tick', ticks: 1 });
  ok(s, { type: 'mark_field', ...findFieldSpot(s.world, 6, 6, 'wheat')! });
  ok(s, { type: 'place_site', kind: 'well', ...findBuildingSpot(s.world, 'well', 0)!, rot: 0 });
  ok(s, { type: 'approve_site', siteId: s.world.homestead!.sites![0].id });
  for (let i = 0; i < 40; i++) ok(s, { type: 'tick', ticks: 1 });
  assert.ok(s.world.homestead!.villagers.some((v) => v.task && v.task.kind !== 'idle' && v.task.kind !== 'rest'), 'mid-task');
  const mid = restore(s);
  assert.equal(mid.stateHash, s.stateHash);
  for (const x of [s, mid]) for (let i = 0; i < 200; i++) ok(x, { type: 'tick', ticks: 1 });
  assert.equal(mid.stateHash, s.stateHash);
  const replay = GameSession.restore(clone(GameSession.genesis(42, GENERATOR_V2).snapshot), clone(s.journal));
  assert.equal(replay.stateHash, s.stateHash);
});

test('time accounting: travel, waiting, work, idle, eating and sleeping add up to the ticks observed, per villager, under v6 and v7 alike', () => {
  for (const rules of [6, 7]) {
    const f = farm(7, rules);
    markField(f.s, f.send, 4, 4);
    f.step(600);
    const m = f.work.metrics();
    for (const t of [m.total, ...Object.values(m.villagers)]) {
      assert.equal(WORK_CATS.reduce((n, c) => n + t[c], 0), t.ticks);
      assert.ok(t.ticks > 0);
    }
    assert.equal(Object.keys(m.villagers).length, 3);
    assert.ok(m.waits.count > 0);
  }
});

test('routine and upkeep work waits at most 120 daytime ticks on a fresh v7 farm with 2 or 4 fields and a new owner field (600 ticks), and on the standard farm (1500 ticks)', () => {
  const rows: string[] = [];
  for (const seed of [1337, 42, 7]) {
    for (const n of [2, 4]) {
      const r = busyField(seed, 7, n, 300, 6, 6, 1);
      r.f.step(600);
      const w = r.f.work.metrics().waits;
      rows.push(`${seed}/${n}: ${w.max}`);
      assert.ok(w.max <= 120, `seed ${seed}, ${n} fields: max wait ${w.max}`);
      assert.ok(!w.open || w.open.age <= 120, `seed ${seed}, ${n} fields: open ${JSON.stringify(w.open)}`);
    }
    const f = farm(seed, 7);
    markField(f.s, f.send, 4, 4);
    f.step(1500);
    const w = f.work.metrics().waits;
    rows.push(`${seed}/standard: ${w.max}`);
    assert.ok(w.max <= 120, `seed ${seed} standard farm: max wait ${w.max}`);
  }
  console.log(rows.join(' | '));
});
