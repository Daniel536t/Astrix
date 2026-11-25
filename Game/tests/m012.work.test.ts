// M012 Stage B "living settlement: work". Settlement rules v4 add a
// woodcutter who fells mature trees through the player's own harvest rule and
// carries the timber to the store, and a builder who carries materials
// reserved for an approved building site and builds it. Jobs are assigned by
// the journaled assign_role command (owner or steward under its policy);
// every move is a navStep on the shared walking grid; resources only move
// between real inventories. Old saves (v1-v3) keep their exact hashes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/app/session';
import { GENERATOR_V2 } from '../src/sim/world';
import {
  BuildSite, DM, HOMESTEAD_WORK_VERSION, SITE_RULES, VILLAGER_SPEED, Villager, bedSpot, findFieldSpot, findSiteSpot, homesteadNav, homesteadSnapshot,
  reservations, reservedOf, settlementCollision, siteCells, siteProgress, siteStatus, treeEntityId, treeTarget, validateHomestead, woodlot,
  MIN_STANDING_TREES, WOOD_CARRY,
} from '../src/sim/homestead';
import { growthStage, treeTimber } from '../src/sim/vegetation';
import { BLOCK, SOLID, navStats, resetNavCache, structureHits } from '../src/sim/nav';
import { FOUNDER_STOCKPILE_ID } from '../src/sim/economy';

type Session = GameSession;
let seq = 0;
function send(s: Session, c: Record<string, unknown>) {
  return s.dispatch({ schema: 3, id: `m012b:${seq++}:${String(c.type)}`, expectedRevision: s.world.revision, ...c } as never);
}
const ok = (s: Session, c: Record<string, unknown>) => { const r = send(s, c); assert.ok(r.ok, `${c.type}: ${JSON.stringify(r)}`); return r; };
const store = (s: Session) => s.world.life!.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory;
const founded = (rules = 4) => { const s = GameSession.genesis(1337, GENERATOR_V2); ok(s, { type: 'found_homestead', rules }); return s; };
const vill = (s: Session, id: string) => s.world.homestead!.villagers.find((v) => v.id === id)!;

/** Woodcutter Cora, builder Ada, one approved woodshed: the reproducible job set-up (the browser probe issues the same commands from the Farm panel). */
function workSetup(s: Session): BuildSite {
  ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'player' });
  ok(s, { type: 'assign_role', villagerId: 'villager:0', role: 'builder', actor: 'player' });
  const spot = findSiteSpot(s.world)!;
  ok(s, { type: 'place_site', kind: 'woodshed', ...spot });
  const st = s.world.homestead!.sites![0];
  ok(s, { type: 'approve_site', siteId: st.id });
  return st;
}

interface Watch {
  maxStep: number; chosen: Map<string, string>; woodAtStoreOnly: boolean; storeWoodGains: number; felled: number;
  doorChanges: number; reservedOk: boolean; conserved: boolean; carried: number; deliveredTicks: number;
}
/** Tick and check every tick: no teleport, chop targets, store gains only at the store, reservations within stock, wood conserved. */
function run(s: Session, n: number, w?: Watch): Watch {
  const h = s.world.homestead!;
  w ??= { maxStep: 0, chosen: new Map(), woodAtStoreOnly: true, storeWoodGains: 0, felled: 0, doorChanges: 0, reservedOk: true, conserved: true, carried: 0, deliveredTicks: 0 };
  const cut = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const before = new Map(h.villagers.map((v) => [v.id, { x: v.x, z: v.z, task: v.task?.kind, leg: v.task?.legs[v.task.leg]?.effect, carry: v.carry ? { ...v.carry } : null }]));
    const wood0 = store(s).wood ?? 0, door0 = h.gates!.find((g) => g.id === 'door:farmhouse')!.state;
    const delivered0 = (h.sites ?? []).reduce((a, st) => a + Object.values(st.delivered).reduce((x, y) => x + y, 0), 0);
    ok(s, { type: 'tick', ticks: 1 });
    for (const v of h.villagers) {
      const b = before.get(v.id);
      if (!b) continue;
      w.maxStep = Math.max(w.maxStep, Math.hypot(v.x - b.x, v.z - b.z));
      if (v.task?.kind === 'chop') {
        const e = s.world.entities.get(treeEntityId(v.task.target)!);
        if (e) w.chosen.set(e.id, growthStage(e)!);
      }
      if (v.carry?.item === 'wood') w.carried = Math.max(w.carried, v.carry.amount);
    }
    const wood1 = store(s).wood ?? 0;
    if (wood1 > wood0) {
      w.storeWoodGains++;
      // Who put it there: a woodcutter whose store leg just ran, standing at the store, with wood in hand before.
      const by = h.villagers.find((v) => { const b = before.get(v.id)!; return b.carry?.item === 'wood' && !b.carry.site && (v.carry?.item !== 'wood') && b.leg === 'store'; });
      const at = by && Math.hypot(by.x / DM - (-50), by.z / DM - (-30.4)) < 2;
      if (!by || !at) w.woodAtStoreOnly = false;
    }
    if (h.gates!.find((g) => g.id === 'door:farmhouse')!.state !== door0) w.doorChanges++;
    const delivered1 = (h.sites ?? []).reduce((a, st) => a + Object.values(st.delivered).reduce((x, y) => x + y, 0), 0);
    if (delivered1 > delivered0) w.deliveredTicks++;
    // Reservations never exceed the stock they hold.
    for (const [k, n2] of Object.entries(reservations(h))) if (n2 > (store(s)[k] ?? 0)) w.reservedOk = false;
    // Wood conservation: everything cut is in the store, the barn, a hand or on a site.
    for (const e of s.world.entities.values()) if (e.kind.startsWith('styl_tree') && e.harvestedOnce && !e.authored) cut.set(e.id, treeTimber(e)!.total - e.remaining);
    const cutTotal = [...cut.values()].reduce((a, b) => a + b, 0);
    const held = (store(s).wood ?? 0) + (h.overflow.wood ?? 0) + h.villagers.reduce((a, v) => a + (v.carry?.item === 'wood' ? v.carry.amount : 0), 0)
      + (h.sites ?? []).reduce((a, st) => a + (st.delivered.wood ?? 0), 0);
    if (held !== cutTotal + baseWood.get(s)!) w.conserved = false;
  }
  w.felled = [...s.world.entities.values()].filter((e) => e.kind.startsWith('styl_tree') && e.harvested && !e.authored).length;
  return w;
}
const baseWood = new WeakMap<Session, number>();
const markWood = (s: Session) => { const h = s.world.homestead!; baseWood.set(s, (store(s).wood ?? 0) + (h.overflow.wood ?? 0)
  + h.villagers.reduce((a, v) => a + (v.carry?.item === 'wood' ? v.carry.amount : 0), 0)
  - [...s.world.entities.values()].filter((e) => e.kind.startsWith('styl_tree') && e.harvestedOnce && !e.authored).reduce((a, e) => a + treeTimber(e)!.total - e.remaining, 0)); };

// ---------- the acceptance run ----------

test('a woodcutter and a builder, assigned by journaled commands, fell trees, carry timber and build the woodshed: real transport, no teleport, wood conserved', () => {
  const s = founded();
  const h = s.world.homestead!;
  assert.equal(h.version, HOMESTEAD_WORK_VERSION);
  assert.deepEqual(h.villagers.map((v) => `${v.name}:${v.role}`), ['Ada:farmer', 'Bram:herder', 'Cora:farmer'], 'Cora arrives with rules v4');
  const st = workSetup(s);
  assert.equal(vill(s, 'villager:2').role, 'woodcutter');
  assert.equal(vill(s, 'villager:0').role, 'builder');
  assert.deepEqual(st.reserved, { fiber: 4 }, 'approval reserves what is free now (the store has no wood yet)');
  markWood(s);
  const lot0 = woodlot(s.world, h);
  const tree0 = new Map(lot0.trees.map((e) => [e.id, e.remaining]));
  const w = run(s, 420);
  // Woodcutter.
  assert.ok(w.chosen.size >= 2, `several trees chosen (${[...w.chosen.keys()]})`);
  for (const [id, stage] of w.chosen) { assert.ok(stage === 'mature' || stage === 'old', `${id} is ${stage}`); assert.ok(tree0.has(id), `${id} was in the woodlot`); }
  assert.ok(w.felled >= 1, 'at least one tree felled outright');
  assert.equal(w.carried, WOOD_CARRY, 'timber carried in full loads');
  assert.ok(w.storeWoodGains >= 1 && w.woodAtStoreOnly, 'store wood rose only when the woodcutter delivered at the store');
  assert.ok(w.conserved, 'no wood invented or lost: cut = store + barn + hands + sites');
  assert.ok(w.maxStep <= VILLAGER_SPEED + 1, `no villager moved more than walking speed (plus integer rounding) in a tick (max ${w.maxStep.toFixed(1)} dm)`);
  // Felled trees left the walking grid.
  const g = homesteadNav(s.world, h);
  for (const e of s.world.entities.values()) if (e.harvested && w.chosen.has(e.id)) {
    for (let i = 0; i < g.block.length; i++) assert.notEqual(g.blockId.get(i), e.id, `${e.id} no longer blocks a cell`);
  }
  // Builder.
  assert.ok(w.deliveredTicks >= 3, `materials delivered in several trips (${w.deliveredTicks})`);
  assert.equal(st.state, 'done', `the woodshed is built (${siteProgress(st)}%: ${siteStatus(s.world, st)})`);
  assert.deepEqual(st.delivered, SITE_RULES.woodshed.cost, 'exactly its materials went into it');
  assert.ok(w.reservedOk, 'reservations never exceeded the store');
  // Daily routine: they went to bed at night through the door, each in their own bed.
  assert.ok(w.doorChanges >= 2, `the door opened and closed as they passed (${w.doorChanges})`);
  ok(s, { type: 'tick', ticks: 1 });
});

test('the finished building is real: solid on the walking grid and for the player', () => {
  const s = founded();
  const st = workSetup(s);
  run(s, 420);
  assert.equal(st.state, 'done');
  const h = s.world.homestead!;
  const g = homesteadNav(s.world, h);
  const c = siteCells(st);
  for (let z = c.z0; z < c.z1; z++) for (let x = c.x0; x < c.x1; x++) {
    assert.notEqual(g.block[g.index(x, z)], BLOCK.none, `cell ${x},${z} blocked`);
    assert.equal(g.solid[g.index(x, z)], SOLID.shelter);
  }
  const col = settlementCollision(s.world)!;
  const mid = { x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2 };
  assert.ok(structureHits(col.grid, col.gate, mid.x, g.ground[g.index(c.x0, c.z0)], mid.z, 0.3, 1.7).length > 0, 'the player collides with it');
});

test('daily routine: three villagers sleep in three different beds at night and work by day; they eat from the store', () => {
  const s = founded();
  workSetup(s);
  const h = s.world.homestead!;
  const food0 = store(s).food ?? 0;
  run(s, 171 + 40 - s.world.life!.tick);
  const beds = h.villagers.map((v) => bedSpot(h, v));
  assert.equal(new Set(beds.map((b) => `${b.x},${b.z}`)).size, 3, 'three distinct beds');
  for (const v of h.villagers) {
    assert.equal(v.task?.kind, 'rest', `${v.name} rests at night`);
    const b = bedSpot(h, v);
    assert.deepEqual([v.x, v.z], [b.x, b.z], `${v.name} is in bed`);
  }
  assert.ok((store(s).food ?? 0) < food0, 'meals came out of the store');
});

// ---------- reservations ----------

test('material reservations: two sites never hold the same stock; the second waits with a reason; nobody else can take reserved stock', () => {
  const s = founded();
  const h = s.world.homestead!;
  // 14 wood in the store: enough for one woodshed (12), not two.
  ok(s, { type: 'deposit', stockpileId: FOUNDER_STOCKPILE_ID, resources: { wood: 14 } });
  const a = findSiteSpot(s.world)!;
  ok(s, { type: 'place_site', kind: 'woodshed', ...a });
  const b = findSiteSpot(s.world)!;
  ok(s, { type: 'place_site', kind: 'woodshed', ...b });
  const [s1, s2] = h.sites!;
  assert.equal(siteStatus(s.world, s1), 'waiting for your approval (nothing reserved yet)');
  ok(s, { type: 'approve_site', siteId: s1.id });
  ok(s, { type: 'approve_site', siteId: s2.id });
  assert.deepEqual(s1.reserved, { fiber: 4, wood: 12 });
  assert.deepEqual(s2.reserved, { fiber: 4, wood: 2 }, 'the second site gets only what the first did not hold');
  assert.equal(reservedOf(h, 'wood'), 14);
  assert.match(siteStatus(s.world, s2), /waiting for a builder/);
  // The owner cannot withdraw reserved stock, the steward cannot spend it on a fence, production cannot use it.
  const wd = send(s, { type: 'withdraw', stockpileId: FOUNDER_STOCKPILE_ID, resources: { wood: 1 } });
  assert.ok(!wd.ok && wd.code === 'reserved', JSON.stringify(wd));
  ok(s, { type: 'steward_policy', enabled: true, assign_role: 'auto', expand_field: 'auto' });
  const ex = send(s, { type: 'expand_field', actor: 'steward' });
  assert.ok(!ex.ok && /free 0/.test(ex.reasons[0]), JSON.stringify(ex));
  const fiberFree = (store(s).fiber ?? 0) - reservedOf(h, 'fiber');
  ok(s, { type: 'withdraw', stockpileId: FOUNDER_STOCKPILE_ID, resources: { fiber: fiberFree } });
  const pr = send(s, { type: 'produce', stockpileId: FOUNDER_STOCKPILE_ID, recipe: 'seed' });
  assert.ok(!pr.ok && pr.code === 'reserved', JSON.stringify(pr));
  // A builder serves the first site first; the second never draws the first's stock.
  ok(s, { type: 'assign_role', villagerId: 'villager:0', role: 'builder', actor: 'player' });
  for (let i = 0; i < 600 && s1.state !== 'done'; i++) {
    ok(s, { type: 'tick', ticks: 1 });
    for (const [k, n] of Object.entries(reservations(h))) assert.ok(n <= (store(s)[k] ?? 0), `tick ${s.world.life!.tick}: ${n} ${k} reserved, ${store(s)[k] ?? 0} in store`);
    assert.ok((s2.delivered.wood ?? 0) + (s2.reserved.wood ?? 0) + h.villagers.reduce((n, v) => n + (v.carry?.site === s2.id && v.carry.item === 'wood' ? v.carry.amount : 0), 0) <= 2,
      'site 2 never holds more than the 2 wood left after site 1');
  }
  assert.equal(s1.state, 'done', `site 1 built (${siteStatus(s.world, s1)})`);
  assert.match(siteStatus(s.world, s2), /waiting for 10 wood/, siteStatus(s.world, s2));
  // Cancelling a site with nothing delivered releases its reservation; one with materials on it cannot be cancelled.
  if (Object.keys(s2.delivered).length) assert.equal(send(s, { type: 'cancel_site', siteId: s2.id }).ok, false);
  else {
    const c = ok(s, { type: 'cancel_site', siteId: s2.id });
    assert.equal(reservedOf(h, 'wood'), 0);
    assert.ok(c.ok && c.outcome.type === 'cancel_site');
  }
});

test('the herder never feeds reserved fibre to the animals', () => {
  const s = founded();
  const h = s.world.homestead!;
  ok(s, { type: 'place_site', kind: 'woodshed', ...findSiteSpot(s.world)! });
  ok(s, { type: 'place_site', kind: 'woodshed', ...findSiteSpot(s.world)! });
  ok(s, { type: 'place_site', kind: 'woodshed', ...findSiteSpot(s.world)! });
  for (const st of [...h.sites!]) ok(s, { type: 'approve_site', siteId: st.id });
  assert.equal(reservedOf(h, 'fiber'), 12);
  for (const e of h.enclosures) { e.grass = 0; e.feed = 0; }
  const fiber0 = store(s).fiber!;
  for (let i = 0; i < 150; i++) { ok(s, { type: 'tick', ticks: 1 }); assert.ok((store(s).fiber ?? 0) >= 12, 'reserved fibre stays in the store'); }
  assert.ok(store(s).fiber! < fiber0, 'the herder did feed the free fibre');
});

test('a tree a woodcutter is felling is reserved: the player cannot harvest it, and saplings and young trees are never chosen', () => {
  const s = founded();
  workSetup(s);
  const h = s.world.homestead!;
  let target = '';
  for (let i = 0; i < 40 && !target; i++) { ok(s, { type: 'tick', ticks: 1 }); const t = vill(s, 'villager:2').task; if (t?.kind === 'chop') target = t.target; }
  assert.ok(target);
  const r = send(s, { type: 'harvest', entityId: treeEntityId(target)! });
  assert.ok(!r.ok && r.code === 'reserved', JSON.stringify(r));
  // The woodlot (the only trees a woodcutter considers) holds mature and old natural trees only; the grove and young trees stay.
  const lot = woodlot(s.world, h);
  assert.ok(lot.trees.length > 0);
  for (const e of lot.trees) assert.ok(['mature', 'old'].includes(growthStage(e)!) && !e.authored && treeTarget(e.id));
  const young = [...s.world.entities.values()].filter((e) => e.kind.startsWith('styl_tree') && !e.harvested && ['sapling', 'young'].includes(growthStage(e)!));
  assert.ok(young.length > 0);
  for (const e of young) assert.ok(!lot.trees.includes(e));
  // Over a long run, the young trees all still stand.
  run(s, 600);
  for (const e of young) assert.ok(!e.harvestedOnce, `${e.id} (${growthStage(e)}) untouched`);
});

test('no clear-cutting: felling stops at the minimum number of standing trees', () => {
  const s = founded();
  ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'player' });
  ok(s, { type: 'assign_role', villagerId: 'villager:0', role: 'woodcutter', actor: 'player' });
  const h = s.world.homestead!;
  // Keep the store under the timber target (stock taken away by the test), so only the standing-tree rule stops them.
  for (let i = 0; i < 2400; i++) {
    ok(s, { type: 'tick', ticks: 1 });
    if ((store(s).wood ?? 0) >= 20) delete store(s).wood;
  }
  const lot = woodlot(s.world, h);
  assert.ok(lot.standing >= MIN_STANDING_TREES, `${lot.standing} mature or old trees still standing`);
  assert.ok(h.villagers.every((v) => v.task?.kind !== 'chop' || s.world.entities.get(treeEntityId(v.task.target)!)?.harvestedOnce));
});

// ---------- failures and abandonment ----------

test('an abandoned job releases its claim: reassigning the woodcutter frees the tree and the load goes to the store; a cancelled site frees its reservation', () => {
  const s = founded();
  const h = s.world.homestead!;
  ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'player' });
  markWood(s);
  let i = 0;
  while ((vill(s, 'villager:2').carry?.amount ?? 0) < 4 && i++ < 200) ok(s, { type: 'tick', ticks: 1 });
  const cora = vill(s, 'villager:2');
  assert.equal(cora.carry?.item, 'wood');
  const tree = cora.task!.target;
  ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'farmer', actor: 'player' });
  assert.ok(!h.villagers.some((v) => v.task?.target === tree), 'nobody holds the tree');
  const carried = cora.carry!.amount, wood0 = store(s).wood ?? 0;
  const w = run(s, 80);
  assert.equal((store(s).wood ?? 0) - wood0, carried, 'the load in hand was walked to the store');
  assert.ok(w.woodAtStoreOnly && w.conserved);
  // A builder walking to fetch for a site that is cancelled stops and the stock is free again.
  ok(s, { type: 'assign_role', villagerId: 'villager:0', role: 'builder', actor: 'player' });
  ok(s, { type: 'place_site', kind: 'woodshed', ...findSiteSpot(s.world)! });
  const st = h.sites![0];
  ok(s, { type: 'approve_site', siteId: st.id });
  ok(s, { type: 'tick', ticks: 1 });
  assert.equal(vill(s, 'villager:0').task?.target, st.id);
  ok(s, { type: 'cancel_site', siteId: st.id });
  assert.equal(vill(s, 'villager:0').task, null);
  assert.equal(reservedOf(h, 'fiber'), 0);
});

test('an unreachable building site is reported and given up (no teleport), keeping the materials', () => {
  const s = founded();
  const h = s.world.homestead!;
  ok(s, { type: 'assign_role', villagerId: 'villager:0', role: 'builder', actor: 'player' });
  // Ada goes to bed; the owner locks the farmhouse door on her, then approves a woodshed with its wood in the store.
  run(s, 200 - s.world.life!.tick);
  assert.equal(vill(s, 'villager:0').task?.kind, 'rest');
  ok(s, { type: 'set_gate', gateId: 'door:farmhouse', state: 'locked' });
  ok(s, { type: 'deposit', stockpileId: FOUNDER_STOCKPILE_ID, resources: { wood: 12 } });
  ok(s, { type: 'place_site', kind: 'woodshed', ...findSiteSpot(s.world)! });
  const st = h.sites![0];
  ok(s, { type: 'approve_site', siteId: st.id });
  const ada = vill(s, 'villager:0');
  let reported = '';
  for (let i = 0; i < 200 && !reported; i++) {
    const at = { x: ada.x, z: ada.z };
    ok(s, { type: 'tick', ticks: 1 });
    assert.ok(Math.hypot(ada.x - at.x, ada.z - at.z) <= VILLAGER_SPEED + 1);
    if (ada.nav?.blocked) reported = ada.nav.blocked.reason;
  }
  assert.match(reported, /door is locked/);
  for (let i = 0; i < 20; i++) ok(s, { type: 'tick', ticks: 1 });
  assert.ok(ada.avoid?.some((a) => a.target === st.id || a.target.startsWith('eat:')), `gave the job up openly: ${JSON.stringify(ada.avoid)}`);
  assert.deepEqual(st.reserved, { fiber: 4, wood: 12 }, 'the reservation stays with the site');
  const total = (store(s).wood ?? 0) + (ada.carry?.item === 'wood' ? ada.carry.amount : 0) + (st.delivered.wood ?? 0);
  assert.equal(total, 12, 'no wood vanished');
});

// ---------- save / reload, replay, compatibility ----------

test('work survives save and reload exactly: mid-chop, mid-haul, reservations and site progress', () => {
  const s = founded();
  const st = workSetup(s);
  const h = s.world.homestead!;
  // Run until Cora is mid-chop with wood in hand and the site has started.
  let i = 0;
  while (i++ < 400 && !(vill(s, 'villager:2').task?.kind === 'chop' && vill(s, 'villager:2').carry && (st.work > 0 || Object.keys(st.delivered).length))) ok(s, { type: 'tick', ticks: 1 });
  assert.ok(i < 400, 'reached a mid-job state');
  const snap = JSON.parse(JSON.stringify(s.snapshot));
  const journal = JSON.parse(JSON.stringify(s.journal));
  const r = GameSession.restore(snap, journal);
  assert.equal(r.stateHash, s.stateHash);
  assert.deepEqual(homesteadSnapshot(r.world.homestead!), homesteadSnapshot(h), 'carried loads, tasks, reservations and site progress restored');
  const t = r.world.homestead!.villagers.find((v) => v.id === 'villager:2')!;
  assert.deepEqual(t.carry, vill(s, 'villager:2').carry);
  assert.equal(t.task!.progress, vill(s, 'villager:2').task!.progress);
  const tree = s.world.entities.get(treeEntityId(t.task!.target)!)!;
  assert.equal(r.world.entities.get(tree.id)!.remaining, tree.remaining, 'the tree\'s remaining timber is saved');
  // Both continue identically (dropping derived caches on the restored one).
  resetNavCache(r.world);
  for (let k = 0; k < 150; k++) { ok(s, { type: 'tick', ticks: 1 }); ok(r, { type: 'tick', ticks: 1 }); }
  assert.equal(r.stateHash, s.stateHash);
  // A v4 snapshot validates strictly.
  const bad = JSON.parse(JSON.stringify(homesteadSnapshot(h)));
  bad.sites[0].reserved = { stone: 1 };
  assert.throws(() => validateHomestead(bad, s.world.life!.tick));
  const bad2 = JSON.parse(JSON.stringify(s.snapshot));
  bad2.homestead.sites = [{ ...bad2.homestead.sites[0], state: 'approved', reserved: { wood: 12 } }];
  bad2.stockpiles[0].inventory.wood = 0;
  delete bad2.stockpiles[0].inventory.wood;
  assert.throws(() => GameSession.restore(bad2, journal));
});

test('v4 replay is deterministic: genesis replay, mid-run snapshot plus tail and a second run agree', () => {
  const mk = () => { const s = founded(); workSetup(s); run(s, 250); return s; };
  const a = mk(), b = mk();
  assert.equal(a.stateHash, b.stateHash);
  const replay = GameSession.replay(JSON.parse(JSON.stringify(a.journal)));
  assert.equal(replay.stateHash, a.stateHash);
  assert.ok(navStats(a.world).ticks > 0);
});

test('old saves keep their hashes (v1, v2 and v3 runs), genesis is unchanged, and v3 upgrades to v4 by one journaled command (Cora arrives)', () => {
  assert.equal(GameSession.genesis(1337).stateHash, 'e659504b056654dc');
  // Hashes measured with the Stage A build (commit d46d58e) for the same sequence.
  const runOld = (rules: 1 | 2 | 3) => {
    const s = GameSession.genesis(1337, GENERATOR_V2);
    ok(s, rules === 1 ? { type: 'found_homestead' } : { type: 'found_homestead', rules });
    ok(s, { type: 'mark_field', ...findFieldSpot(s.world, 5, 4, 'potato')! });
    for (let i = 0; i < 300; i++) ok(s, { type: 'tick', ticks: 1 });
    if (rules >= 2) ok(s, { type: 'set_gate', gateId: 'gate:pen', state: 'open' });
    for (let i = 0; i < 100; i++) ok(s, { type: 'tick', ticks: 1 });
    return s;
  };
  const v1 = runOld(1), v2 = runOld(2), v3 = runOld(3);
  assert.equal(v1.stateHash, '16ca4c350d98096f');
  assert.equal(v2.stateHash, '542411888c83bf3a');
  assert.equal(v3.stateHash, 'd2c28283712a8de7');
  // A v3 save restores byte-identical, with no v4 fields.
  const snap = JSON.parse(JSON.stringify(v3.snapshot));
  assert.equal(snap.homestead.sites, undefined);
  const restored = GameSession.restore(snap, JSON.parse(JSON.stringify(v3.journal)));
  assert.equal(restored.stateHash, v3.stateHash);
  assert.equal(JSON.stringify(restored.snapshot), JSON.stringify(v3.snapshot));
  // v3 refuses v4 jobs and sites.
  assert.equal(send(v3, { type: 'assign_role', villagerId: 'villager:0', role: 'woodcutter', actor: 'player' }).ok, false);
  assert.equal(send(v3, { type: 'place_site', kind: 'woodshed', x: 0, z: 0 }).ok, false);
  const bad = JSON.parse(JSON.stringify(homesteadSnapshot(v3.world.homestead!)));
  bad.villagers[0].role = 'builder';
  assert.throws(() => validateHomestead(bad, v3.world.life!.tick));
  // One journaled upgrade; a second is refused. Cora arrives on a free cell; snapshot + journal and replay reach the live hash.
  ok(v3, { type: 'upgrade_homestead', rules: 4 });
  assert.equal(send(v3, { type: 'upgrade_homestead', rules: 4 }).ok, false);
  const h = v3.world.homestead!;
  assert.equal(h.version, 4);
  assert.deepEqual(h.villagers.map((v) => v.name), ['Ada', 'Bram', 'Cora']);
  assert.deepEqual(h.sites, []);
  const cora = vill(v3, 'villager:2');
  assert.equal(homesteadNav(v3.world, h).block[homesteadNav(v3.world, h).index(Math.floor(cora.x / DM), Math.floor(cora.z / DM))], BLOCK.none);
  for (let i = 0; i < 50; i++) ok(v3, { type: 'tick', ticks: 1 });
  assert.equal(GameSession.restore(snap, JSON.parse(JSON.stringify(v3.journal))).stateHash, v3.stateHash);
  assert.equal(GameSession.replay(JSON.parse(JSON.stringify(v3.journal))).stateHash, v3.stateHash);
  // v1 straight to v4 works too.
  ok(v1, { type: 'upgrade_homestead', rules: 4 });
  assert.equal(v1.world.homestead!.villagers.length, 3);
});

test('governance: the steward gives a spare farmer the builder job under its assign_role policy (ask first makes a request instead)', () => {
  // The steward runs in the browser (app/homestead.ts); its decisions are ordinary journaled, permission-checked commands.
  const s = founded();
  ok(s, { type: 'steward_policy', enabled: true, assign_role: 'approve', expand_field: 'off' });
  const r = send(s, { type: 'assign_role', villagerId: 'villager:2', role: 'builder', actor: 'steward' });
  assert.ok(!r.ok && r.code === 'approval_required');
  const p = ok(s, { type: 'steward_propose', action: 'assign_role', villagerId: 'villager:2', role: 'builder', reason: 'Make Cora a builder: the woodshed is approved and nobody is building it' });
  assert.ok(p.ok && p.outcome.type === 'steward_propose');
  ok(s, { type: 'resolve_proposal', proposalId: (p.ok && p.outcome.type === 'steward_propose') ? p.outcome.proposalId : '', approve: true });
  assert.equal(vill(s, 'villager:2').role, 'builder');
  ok(s, { type: 'steward_policy', enabled: true, assign_role: 'auto', expand_field: 'off' });
  ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'steward' });
  assert.equal(vill(s, 'villager:2').role, 'woodcutter');
  // New commands are strictly validated.
  for (const bad of [{ type: 'place_site', kind: 'castle', x: 0, z: 0 }, { type: 'approve_site', siteId: 'field:1' }, { type: 'place_site', kind: 'woodshed', x: 0.5, z: 0 },
    { type: 'assign_role', villagerId: 'villager:0', role: 'king', actor: 'player' }]) {
    const rr = send(s, bad);
    assert.ok(!rr.ok && rr.code === 'invalid_command', JSON.stringify(bad));
  }
});

// Villagers in the acceptance run keep to their own cells (Stage A avoidance still holds with three).
test('three villagers never share a cell while working', () => {
  const s = founded();
  workSetup(s);
  const h = s.world.homestead!;
  for (let i = 0; i < 400; i++) {
    ok(s, { type: 'tick', ticks: 1 });
    const cells = h.villagers.map((v: Villager) => `${Math.floor(v.x / DM)},${Math.floor(v.z / DM)}`);
    assert.equal(new Set(cells).size, cells.length, `tick ${s.world.life!.tick}: ${cells}`);
  }
});

test('drawn from state: sites share the troughs mesh, work roles have their own look, and a load is shown exactly while the sim says it is carried', async () => {
  const s = founded();
  const st = workSetup(s);
  const h = s.world.homestead!;
  const { HomesteadView } = await import('../src/render/homestead');
  const view = new HomesteadView(s.world, 2);
  const meshes = () => { let n = 0; view.group.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh && o.name !== 'villager_load') n++; }); return n; };
  view.update(0.016);
  const n0 = meshes();
  const shapes = new Set<number>();
  let sawLoad = 0;
  for (let i = 0; i < 420; i++) {
    ok(s, { type: 'tick', ticks: 1 });
    view.update(0.016);
    const m = view.metrics() as { villagers: Array<{ role: string; load: string | null; visible: boolean }> };
    h.villagers.forEach((v, k) => {
      const shown = m.villagers[k];
      assert.equal(shown.role, v.role);
      const want = !v.carry || v.carry.item === 'water' || !shown.visible ? null : v.carry.item === 'wood' ? 'wood' : v.carry.item === 'fiber' ? 'fiber' : 'other';
      assert.equal(shown.load, want, `tick ${s.world.life!.tick} ${v.name} carries ${JSON.stringify(v.carry)}`);
      if (want) sawLoad++;
    });
    if (i % 20 === 0) {
      assert.equal(meshes(), n0, 'no new meshes for sites');
      const troughs = view.group.getObjectByName('homestead_troughs') as unknown as { geometry: { attributes: { position: { count: number } } } };
      shapes.add(troughs.geometry.attributes.position.count);
    }
  }
  assert.equal(st.state, 'done');
  assert.ok(shapes.size >= 3, `site drawn at several stages (${[...shapes]})`);
  assert.ok(sawLoad > 20);
});
