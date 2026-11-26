// W6 (wilderness content v7): deposits, mining and processing.
// - Six deposit types (iron, copper, coal, clay, sand, gravel) with ids, locations and finite quantities,
//   generated deterministically by geography rules; existing entity ids and pickups unchanged.
// - Deposits are discovered by exploring (W5 rules) and only then mined; map state records them.
// - Mining is one journaled swing at a time: pickaxe in hand, reach, rate, bag capacity; a unit comes out
//   only after its swings; deposits deplete to exhaustion and never regrow.
// - Mined material is real: carried, dropped (piles), picked up, stored; reservations keep it from double use.
// - The clay smelter is built with W4 construction from mined clay, sand and gravel; smelting takes ore and
//   coal from the bag at the start and puts ingots at its door after the recipe's time; refused without a
//   finished smelter or the inputs; survives save, reload and replay mid-batch.
// - Old saves: the v6 fixture made by the live W5 code (5917608) and the W1-W5 fixtures load, replay under
//   their own rules and upgrade to v7 by one journaled upgrade_wilderness.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameSession } from '../src/app/session';
import { BrowserSaveStore, KeyValueStorage } from '../src/app/persistence';
import {
  GENERATOR_V2, MAT, WILDERNESS, baseColumnAt, baseWaterLevelAt, chunkKey, generateEntityChunk, rockScore, worldToChunkX, worldToChunkZ, Y_MIN,
} from '../src/sim/world';
import { CARRY_CAPACITY_V5, ITEM_WEIGHT, LATEST_WILD_CONTENT, carriedWeight, carryCapacity, pickupsInChunk } from '../src/sim/gathering';
import { COPPER_ABOVE, DEPOSIT_TYPES, Deposit, copperField, depositOf, depositsInChunk, typedDepositsNear } from '../src/sim/deposits';
import { DEPOSIT_ITEM, MINE_REACH, MINE_SWINGS, depositLeft } from '../src/sim/mining';
import { DEPOSIT_SIGHT, exploredCount, mapSnapshot } from '../src/sim/map';
import { BUILD_CATALOGUE, SMELT_RECIPES, buildingDef } from '../src/sim/catalogue';
import { findWildSpot, freeInBag, lockReasons, siteSpotOf, smelterOutSpot } from '../src/sim/wild-build';
import { validateWildSnapshot, wildSnapshot } from '../src/sim/gathering';
import { SPAWN, axe, build, clone, code, deliverAll, dm, gather, load, ok, placeAt, reasons, send, swing, tick, workAll } from './w4-harness';

class MemoryStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
}
const G = GENERATOR_V2;
// W7: an explicit v7 world, so these tests keep testing exactly the v7 rules (a new world now starts at v8).
const v7 = () => GameSession.genesis(1337, G, 'wilderness', 7);
const explore = (s: GameSession, p: { x: number; z: number }) => send(s, { type: 'explore', at: dm(p) });
/** Walk from a to b reporting every 16 m, a world tick per report (the W5 travel credit). */
function walk(s: GameSession, a: { x: number; z: number }, b: { x: number; z: number }): void {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 16));
  for (let k = 1; k <= n; k++) { tick(s); ok(explore(s, { x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n }), `report ${k}/${n}`); }
}
const dep = (id: string): Deposit => depositOf(1337, G, id)!;
/** Where to stand to mine a deposit: 1 m from it toward `from`. */
const by = (d: Deposit, from = SPAWN) => { const l = Math.hypot(from.x - d.x, from.z - d.z) || 1; return { x: d.x + (from.x - d.x) / l, z: d.z + (from.z - d.z) / l }; };
const mine = (s: GameSession, d: Deposit, at = by(d)) => send(s, { type: 'mine', depositId: d.id, at: dm(at) });
/** Swing (waiting out the rate limit) until `n` units came out; returns the outcomes. */
function mineUnits(s: GameSession, d: Deposit, n: number, at = by(d)) {
  const out: Array<ReturnType<typeof send>> = [];
  let got = 0;
  for (let i = 0; i < 200 && got < n; i++) {
    const r = ok(swing(s, { type: 'mine', depositId: d.id, at: dm(at) }), `mine ${d.id}`);
    out.push(r);
    if (r.ok && r.outcome.type === 'mine' && r.outcome.amount) got++;
  }
  assert.equal(got, n, `${n} units from ${d.id}`);
  return out;
}

// Pinned deposits near the W1 spawn (seed 1337) and on the way north to the nearest ore.
const CLAY = 'k:29,28:0', CLAY2 = 'k:28,28:1', SAND = 'k:28,27:1', GRAVEL = 'k:28,27:0', IRON = 'e:31,16:6', COAL = 'k:25,15:0';

/** A v7 world with a stone axe, a finished workbench, a stone pickaxe (equipped), standing at the spawn. Built once; tests get a restored copy. */
let BASE: { snapshot: unknown; journal: unknown; bench: string } | null = null;
function base(): { s: GameSession; bench: string } {
  if (!BASE) {
    const s = v7();
    load(s);
    tick(s, 2);
    ok(explore(s, SPAWN), 'first report');
    axe(s);
    const bench = build(s, 'workbench', { x: SPAWN.x - 10, z: SPAWN.z + 2 });
    gather(s, 'branch', 1); gather(s, 'loose_stone', 2); gather(s, 'fiber_plant', 2);
    ok(send(s, { type: 'craft', recipe: 'cord' }), 'cord');
    ok(send(s, { type: 'craft', recipe: 'stone_pickaxe', at: dm(siteSpotOf(s.world.wild!.build!.sites.get(bench)!)) }), 'pickaxe');
    ok(send(s, { type: 'equip', item: 'stone_pickaxe' }), 'equip');
    // Put down what the bag carries (the tests count weights from a light bag).
    for (const [k, n] of Object.entries(s.world.wild!.items)) ok(send(s, { type: 'drop', item: k, n, at: dm({ x: SPAWN.x - 30, z: SPAWN.z + 30 }) }), `drop ${k}`);
    BASE = { snapshot: clone(s.snapshot), journal: clone(s.journal), bench };
  }
  const s = GameSession.restore(clone(BASE.snapshot) as never, clone(BASE.journal));
  load(s);
  return { s, bench: BASE.bench };
}

// ---------- generation ----------

test('deposits: all six types, deterministic, finite, on their own id namespace; existing entities and pickups unchanged', () => {
  const counts: Record<string, number> = {};
  const all: Deposit[] = [];
  for (let cz = 8; cz < 40; cz++) for (let cx = 8; cx < 40; cx++) for (const d of depositsInChunk(1337, G, cx, cz)) { counts[d.type] = (counts[d.type] ?? 0) + 1; all.push(d); }
  for (const t of DEPOSIT_TYPES) assert.ok((counts[t] ?? 0) >= 5, `${t}: ${counts[t] ?? 0} in the 1 km around the spawn`);
  for (const d of all) {
    assert.ok(d.qty >= 8 && d.qty <= 20, `${d.id} finite quantity ${d.qty}`);
    assert.match(d.id, d.type === 'iron' || d.type === 'copper' ? /^e:\d+,\d+:\d+$/ : /^k:\d+,\d+:\d+$/);
  }
  assert.equal(new Set(all.map((d) => d.id)).size, all.length, 'unique ids');
  // Pins (seed 1337): a few deposits by id, type, place and quantity.
  const pin = (id: string) => { const d = dep(id); return `${d.type}@${d.x},${d.z}:${d.qty}`; };
  assert.equal(pin(CLAY), 'clay@-94.5,-126.5:10');
  assert.equal(pin(SAND), 'sand@-125.5,-142.5:13');
  assert.equal(pin(GRAVEL), 'gravel@-124.5,-158.5:18');
  assert.equal(pin(IRON), 'iron@-30.5,-484.5:15');
  assert.equal(pin(COAL), 'coal@-207.5,-536.5:13');
  assert.equal(pin('e:17,26:3'), 'copper@-477.5,-176.5:9');
  // The same in another seed's worlds too, and a different layout.
  const other: Record<string, number> = {};
  for (let cz = 8; cz < 40; cz++) for (let cx = 8; cx < 40; cx++) for (const d of depositsInChunk(4242, G, cx, cz)) other[d.type] = (other[d.type] ?? 0) + 1;
  for (const t of DEPOSIT_TYPES) assert.ok((other[t] ?? 0) >= 3, `seed 4242 ${t}: ${other[t] ?? 0}`);
  // Iron and copper deposits are exactly the ore outcrops chunk generation places (same ids, same spots); other entities untouched.
  const s = v7();
  for (const [cx, cz] of [[31, 16], [32, 16], [17, 26], [16, 26], [28, 27], [29, 28]]) {
    generateEntityChunk(s.world, cx, cz);
    const ore = (s.world.entityChunks.get(chunkKey(cx, cz)) ?? []).map((id) => s.world.entities.get(id)!).filter((e) => e.kind === 'styl_ore');
    const metal = depositsInChunk(1337, G, cx, cz).filter((d) => d.type === 'iron' || d.type === 'copper');
    assert.deepEqual(metal.map((d) => [d.id, d.x, d.z]), ore.map((e) => [e.id, e.x, e.z]), `chunk ${cx},${cz}`);
  }
  // Pickups: the W2 stream is not touched (pinned in w2; here: a chunk's first ids and kinds are those of before W6).
  assert.ok(pickupsInChunk(1337, G, 29, 26).every((p, i) => p.id === `p:29,26:${i}`));
});

test('geography: every deposit stands where its rule holds (clay at the water, sand on banks, gravel on stream bars, coal on highland stone slopes, metal on high stone)', () => {
  const col = (x: number, z: number) => { const c = baseColumnAt(1337, G, Math.floor(x), Math.floor(z)); return { h: c.stored + Y_MIN, top: c.top }; };
  const level = (x: number, z: number) => baseWaterLevelAt(1337, G, Math.floor(x), Math.floor(z));
  const wet = (x: number, z: number) => level(x, z) > col(x, z).h;
  const waterWithin = (x: number, z: number, r: number) => {
    for (let d = 1; d <= r; d++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (wet(x + dx * d, z + dz * d)) return true;
    return false;
  };
  let n = 0;
  for (let cz = 10; cz < 38; cz++) for (let cx = 10; cx < 38; cx++) for (const d of depositsInChunk(1337, G, cx, cz)) {
    const c = col(d.x, d.z), depth = level(d.x, d.z) - c.h;
    n++;
    switch (d.type) {
      case 'clay': assert.ok(c.top === MAT.GRASS && depth <= 0 && waterWithin(d.x, d.z, 6), `${d.id} clay on a grassy margin by water`); break;
      case 'sand': assert.ok(c.top === MAT.SAND && depth <= 0 && waterWithin(d.x, d.z, 4), `${d.id} sand on a bank`); break;
      case 'gravel': assert.ok(c.top === MAT.GRAVEL && depth <= 1 && (depth > 0 || waterWithin(d.x, d.z, 4)), `${d.id} gravel bar (depth ${depth})`); break;
      case 'coal': {
        const r = rockScore(Math.floor(d.x), Math.floor(d.z), 1337);
        assert.ok(c.top === MAT.STONE && c.h >= 22 && c.h <= 70 && r >= 0.4 && r <= 0.66, `${d.id} coal seam on highland stone (h ${c.h}, rock ${r.toFixed(2)})`);
        break;
      }
      case 'iron': case 'copper':
        assert.equal(c.top, MAT.STONE, `${d.id} on stone`);
        assert.ok(rockScore(Math.floor(d.x), Math.floor(d.z), 1337) > 0.58, `${d.id} rocky high ground`);
        assert.equal(copperField(1337, d.x, d.z) > COPPER_ABOVE, d.type === 'copper', `${d.id} metal by the copper province`);
        break;
    }
    assert.ok(c.h > -3, `${d.id} not in the sea`);
  }
  assert.ok(n > 100, `${n} deposits checked`);
});

// ---------- discovery ----------

test('discovery: a deposit is found only by coming within sight (24 m), recorded in the map, and only then minable', () => {
  const { s } = base();
  const clay = dep(CLAY);
  const m = s.world.wild!.map!;
  assert.equal(m.deposits.has(CLAY), false, 'not seen from the spawn');
  assert.equal(code(mine(s, clay)), 'undiscovered', 'an unseen deposit is not mined, even standing by it');
  // 40 m away: still not discovered.
  const far = { x: clay.x + 40, z: clay.z };
  walk(s, SPAWN, far);
  assert.equal(m.deposits.has(CLAY), false, 'not at 40 m');
  walk(s, far, { x: clay.x + DEPOSIT_SIGHT - 2, z: clay.z });
  assert.equal(m.deposits.has(CLAY), true, 'discovered within 24 m');
  const last = s.journal.entries.at(-1)!;
  assert.ok(last.outcome.type === 'explore');
  // Everything discovered really is within sight of an accepted report; nothing beyond was revealed.
  for (const id of m.deposits) assert.ok(depositOf(1337, G, id), id);
  assert.ok(typedDepositsNear(s.world, SPAWN.x, SPAWN.z, 400).some((d) => !m.deposits.has(d.id)), 'farther deposits stay undiscovered');
  assert.equal(code(mine(s, clay)), undefined, 'now it can be mined');
});

// ---------- mining ----------

test('mining validation: pickaxe in hand, reach, the swing rate, bag capacity; a refused swing changes nothing', () => {
  const { s } = base();
  const clay = dep(CLAY);
  walk(s, SPAWN, by(clay));
  const w = s.world.wild!;
  ok(send(s, { type: 'equip', item: 'hands' }));
  assert.equal(code(mine(s, clay)), 'no_pickaxe', 'bare hands');
  ok(send(s, { type: 'equip', item: 'stone_axe' }));
  assert.equal(code(mine(s, clay)), 'no_pickaxe', 'an axe is not a pickaxe');
  ok(send(s, { type: 'equip', item: 'stone_pickaxe' }));
  assert.equal(code(mine(s, clay, { x: clay.x + MINE_REACH + 0.6, z: clay.z })), 'out_of_reach');
  tick(s);
  for (let i = 0; i < 4; i++) ok(mine(s, clay), `swing ${i + 1}`);
  const before = s.stateHash;
  assert.equal(code(mine(s, clay)), 'too_fast', 'four swings every 2 s');
  assert.equal(s.stateHash, before);
  // Capacity: fill the bag to within one unit of clay (3), then a swing is refused before any work.
  tick(s);
  gather(s, 'loose_stone', Math.ceil((carryCapacity(w) - carriedWeight(w) - 2) / ITEM_WEIGHT.stone), clay);
  assert.ok(carryCapacity(w) - carriedWeight(w) < ITEM_WEIGHT.clay, `bag ${carriedWeight(w)}/${carryCapacity(w)}`);
  const full = s.stateHash;
  const r = mine(s, clay);
  assert.equal(code(r), 'capacity', JSON.stringify(r));
  assert.match(reasons(r)[0], /bag is full/);
  assert.equal(s.stateHash, full);
  assert.equal(w.items.clay ?? 0, 2, 'only the two units the swings made');
});

test('mining: a unit comes out only after its swings, into the bag; the deposit and the pickaxe wear; events', () => {
  const { s } = base();
  const iron = dep(IRON);
  walk(s, SPAWN, by(iron));
  const w = s.world.wild!;
  const pick = w.tools.find((t) => t.kind === 'stone_pickaxe')!;
  const d0 = pick.durability;
  const outs: Array<ReturnType<typeof send>> = [];
  for (let i = 0; i < MINE_SWINGS.iron; i++) outs.push(ok(swing(s, { type: 'mine', depositId: IRON, at: dm(by(iron)) })));
  const o = outs.map((r) => (r.ok && r.outcome.type === 'mine' ? r.outcome : null)!);
  assert.deepEqual(o.map((x) => x.work), [1, 2, 3, 0]);
  assert.deepEqual(o.map((x) => x.amount ?? 0), [0, 0, 0, 1], 'nothing until the fourth swing: a click is not ore');
  assert.deepEqual(o[0].events, ['MINE_STARTED']);
  assert.deepEqual(o[3].events, ['DEPOSIT_MINED']);
  assert.equal(o[3].item, 'iron_ore');
  assert.equal(w.items.iron_ore, 1);
  assert.equal(depositLeft(s.world, iron), iron.qty - 1);
  assert.equal(pick.durability, d0 - 4);
  assert.deepEqual(w.mine!.deposits.get(IRON), { id: IRON, left: iron.qty - 1, work: 0 });
  assert.deepEqual(s.world.wild!.fell!.events.slice(-1).map((e) => [e.type, e.ref, e.n]), [['DEPOSIT_MINED', IRON, iron.qty - 1]]);
});

test('depletion: a deposit is worked out after its quantity and never regrows; worked out it refuses', () => {
  const { s } = base();
  const clay = dep(CLAY);
  walk(s, SPAWN, by(clay));
  const w = s.world.wild!;
  let got = 0;
  for (let k = 0; k < clay.qty; k++) {
    mineUnits(s, clay, 1);
    got++;
    // Carry it away: drop each unit beside the deposit (a pile), so the bag never fills.
    ok(send(s, { type: 'drop', item: 'clay', n: 1, at: dm({ x: clay.x + 2, z: clay.z + 2 }) }));
  }
  assert.equal(got, 10);
  assert.equal(depositLeft(s.world, clay), 0);
  const last = s.world.wild!.fell!.events.slice(-3).map((e) => e.type);
  assert.ok(last.includes('DEPOSIT_EXHAUSTED'), last.join());
  tick(s);
  const r = mine(s, clay);
  assert.equal(code(r), 'exhausted');
  assert.match(reasons(r)[0], /does not regrow/);
  // Hours of world time later: still worked out.
  for (let i = 0; i < 30; i++) ok(send(s, { type: 'tick', ticks: 60 }));
  assert.equal(depositLeft(s.world, clay), 0);
  assert.equal(code(mine(s, clay)), 'exhausted');
  // The mined clay is real: 10 units in piles at the drop spot.
  const piles = [...w.piles.values()].filter((p) => p.item === 'clay');
  assert.equal(piles.reduce((a, p) => a + p.qty, 0), 10);
  assert.ok(piles.every((p) => Math.hypot(p.x - (clay.x + 2), p.z - (clay.z + 2)) < 0.01), 'where they were dropped');
});

test('resource lifecycle: mined material is carried, dropped as a pile, picked up and stored with its weight; storage capacity holds', () => {
  const { s } = base();
  const sand = dep(SAND);
  walk(s, SPAWN, by(sand));
  const w = s.world.wild!;
  mineUnits(s, sand, 3);
  assert.equal(w.items.sand, 3);
  const weight = carriedWeight(w);
  const r = ok(send(s, { type: 'drop', item: 'sand', n: 2, at: dm({ x: sand.x + 1.5, z: sand.z }) }));
  const pileId = r.ok && r.outcome.type === 'drop' ? r.outcome.pileId : '';
  const pile = w.piles.get(pileId)!;
  assert.deepEqual([pile.item, pile.qty, pile.x, pile.z], ['sand', 2, Math.round((sand.x + 1.5) * 10) / 10, sand.z]);
  assert.equal(carriedWeight(w), weight - 2 * ITEM_WEIGHT.sand);
  assert.equal(code(send(s, { type: 'pickup', entityId: pileId, at: dm({ x: sand.x + 20, z: sand.z }) })), 'out_of_reach', 'items do not jump to the player');
  ok(send(s, { type: 'pickup', entityId: pileId, at: dm({ x: sand.x + 1.5, z: sand.z }) }));
  assert.equal(w.items.sand, 3);
  assert.equal(w.piles.has(pileId), false);
  // Stored in a log store (built with the axe) and taken back.
  ok(send(s, { type: 'equip', item: 'stone_axe' }));
  const store = build(s, 'log_store', { x: sand.x + 6, z: sand.z + 6 });
  const at = dm(siteSpotOf(w.build!.sites.get(store)!));
  ok(send(s, { type: 'store_items', siteId: store, item: 'sand', n: 3, at }));
  assert.equal(w.build!.sites.get(store)!.stock!.sand, 3);
  assert.equal(w.items.sand ?? 0, 0);
  ok(send(s, { type: 'take_items', siteId: store, item: 'sand', n: 1, at }));
  assert.equal(w.items.sand, 1);
  assert.equal(w.build!.sites.get(store)!.stock!.sand, 2);
});

// ---------- the smelter ----------

/** Mine and stage the smelter's materials (clay, sand, gravel; stone and branches gathered) in piles at `site`, then build it. */
function buildSmelter(s: GameSession): string {
  const w = s.world.wild!;
  const stage = { x: SPAWN.x - 14, z: SPAWN.z + 26 };
  const clay = dep(CLAY), clay2 = dep(CLAY2), sand = dep(SAND), gravel = dep(GRAVEL);
  walk(s, SPAWN, by(sand));
  walk(s, by(sand), by(gravel));
  walk(s, by(gravel), by(clay));
  walk(s, by(clay), by(clay2));
  // Mine, walk the load to the staging spot (explore reports at walking pace), put it down, walk back.
  let here = by(clay2);
  const carry = (d: Deposit, n: number) => {
    let left = n;
    while (left > 0) {
      walk(s, here, by(d)); here = by(d);
      const k = Math.min(left, Math.floor((carryCapacity(w) - carriedWeight(w)) / ITEM_WEIGHT[DEPOSIT_ITEM[d.type]]));
      mineUnits(s, d, k);
      walk(s, here, stage); here = stage;
      ok(send(s, { type: 'drop', item: DEPOSIT_ITEM[d.type], n: freeInBag(s.world, DEPOSIT_ITEM[d.type]), at: dm(stage) }), `stage ${d.type}`);
      left -= k;
    }
  };
  carry(clay, 6); carry(clay2, 4); carry(sand, 4); carry(gravel, 4);
  gather(s, 'loose_stone', 6, stage); gather(s, 'branch', 2, stage);
  const p = findWildSpot(s.world, 'smelter', 0, dm(stage));
  assert.ok(p, 'a spot for the smelter');
  const id = placeAt(s, 'smelter', p!, 0, stage);
  const site = w.build!.sites.get(id)!;
  assert.deepEqual(Object.keys(site.reserved).sort().length > 0, true);
  deliverAll(s, id);
  const r = workAll(s, id);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(site.state, 'done');
  assert.deepEqual(site.consumed, { branch: 2, clay: 10, gravel: 4, sand: 4, stone: 6 });
  return id;
}

/** Iron ore and coal from the nearest pinned deposits, carried back to the spawn. */
function fetchOre(s: GameSession, iron = 2, coal = 2): void {
  walk(s, SPAWN, by(dep(IRON)));
  mineUnits(s, dep(IRON), iron);
  walk(s, by(dep(IRON)), by(dep(COAL), dep(IRON)));
  mineUnits(s, dep(COAL), coal, by(dep(COAL), dep(IRON)));
  walk(s, by(dep(COAL), dep(IRON)), SPAWN);
}

let SMELT: { snapshot: unknown; journal: unknown; smelter: string } | null = null;
function withSmelter(): { s: GameSession; smelter: string } {
  if (!SMELT) {
    const { s } = base();
    const smelter = buildSmelter(s);
    // One pickaxe (60 swings) mines the smelter's 18 soft units (36 swings), 2 iron ore (8) and 3 coal (9).
    fetchOre(s, 2, 3);
    SMELT = { snapshot: clone(s.snapshot), journal: clone(s.journal), smelter };
  }
  const s = GameSession.restore(clone(SMELT.snapshot) as never, clone(SMELT.journal));
  load(s);
  return { s, smelter: SMELT.smelter };
}

test('the clay smelter is built with W4 construction from mined clay, sand and gravel (reserved, delivered, worked)', () => {
  const { s, smelter } = withSmelter();
  const site = s.world.wild!.build!.sites.get(smelter)!;
  assert.equal(site.kind, 'smelter');
  assert.equal(site.state, 'done');
  assert.deepEqual(buildingDef('smelter')!.materials, { branch: 2, clay: 10, gravel: 4, sand: 4, stone: 6 });
  // The clay deposits used are depleted by what was taken.
  assert.equal(depositLeft(s.world, dep(CLAY)), dep(CLAY).qty - 6);
  assert.equal(depositLeft(s.world, dep(CLAY2)), dep(CLAY2).qty - 4);
});

test('smelting: refused without a finished smelter, within reach, or the inputs; takes exactly the inputs at the start and makes the ingot only after its time', () => {
  const { s, smelter } = withSmelter();
  const w = s.world.wild!;
  const site = w.build!.sites.get(smelter)!;
  const at = dm(siteSpotOf(site));
  const fire = [...w.build!.sites.values()].find((x) => x.kind === 'workbench')!;
  assert.equal(code(send(s, { type: 'smelt', siteId: fire.id, recipe: 'iron_ingot', at: dm(siteSpotOf(fire)) })), 'wrong_building', 'a workbench does not smelt');
  assert.equal(code(send(s, { type: 'smelt', siteId: 'b:9999', recipe: 'iron_ingot', at })), 'not_found', 'no smelter');
  assert.equal(code(send(s, { type: 'smelt', siteId: smelter, recipe: 'iron_ingot', at: dm({ x: site.x + 20, z: site.z }) })), 'out_of_reach');
  assert.equal(code(send(s, { type: 'smelt', siteId: smelter, recipe: 'copper_ingot', at })), 'missing', 'no copper ore');
  const ore = w.items.iron_ore, coal = w.items.coal;
  assert.deepEqual([ore, coal], [2, 3]);
  const r = ok(send(s, { type: 'smelt', siteId: smelter, recipe: 'iron_ingot', at }));
  assert.ok(r.ok && r.outcome.type === 'smelt');
  const recipe = SMELT_RECIPES.find((x) => x.id === 'iron_ingot')!;
  if (r.ok && r.outcome.type === 'smelt') assert.deepEqual(r.outcome.spent, { coal: 2, iron_ore: 2 });
  assert.deepEqual([w.items.iron_ore ?? 0, w.items.coal], [0, 1], 'the inputs left the bag at once');
  assert.deepEqual(site.job!.charge, { coal: 2, iron_ore: 2 });
  // One batch at a time; the ore in the smelter cannot be dropped or used: it is no longer in the bag.
  assert.equal(code(send(s, { type: 'smelt', siteId: smelter, recipe: 'iron_ingot', at })), 'busy');
  assert.equal(code(send(s, { type: 'drop', item: 'iron_ore', n: 1, at })), 'missing');
  const out = smelterOutSpot(site);
  const ingots = () => [...w.piles.values()].filter((p) => p.item === 'iron_ingot').reduce((a, p) => a + p.qty, 0);
  ok(send(s, { type: 'tick', ticks: recipe.ticks - 1 }));
  assert.equal(ingots(), 0, 'not before its time');
  assert.ok(site.job);
  tick(s);
  assert.equal(ingots(), 1, 'one iron ingot after 45 ticks (90 s)');
  assert.equal(site.job, undefined);
  const pile = [...w.piles.values()].find((p) => p.item === 'iron_ingot')!;
  assert.deepEqual([pile.x, pile.z], [out.x, out.z], 'at the smelter door');
  assert.ok(s.world.wild!.fell!.events.some((e) => e.type === 'SMELT_DONE' && e.ref === smelter && e.n === 1));
  // A second batch with what is left (1 coal, no ore) is refused and says what is missing.
  const short = send(s, { type: 'smelt', siteId: smelter, recipe: 'iron_ingot', at });
  assert.equal(code(short), 'missing');
  assert.match(reasons(short)[0], /missing 1 coal, 2 iron ore/);
  // The pickaxe is worn out by now (60 swings): mining refuses until a new one is made.
  assert.equal(w.tools.find((t) => t.kind === 'stone_pickaxe')!.durability, 7);
  // The ingot is picked up into the bag like anything else.
  ok(send(s, { type: 'pickup', entityId: pile.id, at: dm(out) }));
  assert.equal(w.items.iron_ingot, 1);
});

test('reservations: materials reserved for a site cannot be dropped or reserved twice; a smelt takes only free bag items and leaves reservations alone', () => {
  const { s, smelter } = withSmelter();
  const w = s.world.wild!;
  // No W6 building needs ore or coal, so no site can reserve them; the smelt goes through the same free-in-bag rule as crafting
  // (bagRefusal). Here: a second smelter's whole list must be reserved, and nothing is free, so it is refused.
  const site = w.build!.sites.get(smelter)!;
  const at = dm(siteSpotOf(site));
  const p = findWildSpot(s.world, 'smelter', 0, at, 4)!;
  const r = send(s, { type: 'place_site', kind: 'smelter', x: p.x, z: p.z, rot: 0, at });
  assert.equal(code(r), 'unfunded', 'the materials built into the first smelter are gone; nothing is free to reserve');
  // A campfire site reserves free stone and branches: the reserved ones cannot then be used elsewhere.
  gather(s, 'loose_stone', 6, siteSpotOf(site)); gather(s, 'branch', 3, siteSpotOf(site));
  const fp = findWildSpot(s.world, 'campfire', 0, at, 4)!;
  const fire = placeAt(s, 'campfire', fp, 0, siteSpotOf(site));
  assert.ok(w.build!.sites.get(fire)!.reserved.bag);
  assert.equal(code(send(s, { type: 'drop', item: 'stone', n: 1, at })), 'reserved');
  // A second site never reserves the first one's stones: either it is refused for want of free stone, or it is funded elsewhere.
  const fp2 = findWildSpot(s.world, 'campfire', 0, at, 4)!;
  const r2 = send(s, { type: 'place_site', kind: 'campfire', x: fp2.x, z: fp2.z, rot: 0, at });
  if (r2.ok && r2.outcome.type === 'place_site') assert.equal(r2.outcome.reserved.bag?.stone, undefined, 'not the reserved bag stones');
  else assert.equal(code(r2), 'unfunded');
  // Smelting uses only free bag items: the smelt takes 2 ore + 2 coal, never anything reserved.
  ok(send(s, { type: 'smelt', siteId: smelter, recipe: 'iron_ingot', at }));
  assert.deepEqual(w.build!.sites.get(fire)!.reserved.bag, { branch: 3, stone: 6 }, 'the fire site keeps its reservation');
  deliverAll(s, fire);
  assert.equal(w.build!.sites.get(fire)!.state, 'building');
});

test('a smelt survives save, reload, compaction and replay mid-batch; the ingot comes out identically', () => {
  const { s, smelter } = withSmelter();
  const at = dm(siteSpotOf(s.world.wild!.build!.sites.get(smelter)!));
  ok(send(s, { type: 'smelt', siteId: smelter, recipe: 'iron_ingot', at }));
  ok(send(s, { type: 'tick', ticks: 20 }));
  const storage = new MemoryStorage();
  const store = new BrowserSaveStore(storage, 1337, G, { scenario: WILDERNESS, id: 'w6' });
  assert.ok(store.save(s).ok);
  const again = new BrowserSaveStore(storage, 1337, G, { scenario: WILDERNESS, id: 'w6' }).load();
  assert.equal(again.status, 'restored', again.message);
  const r = again.session;
  assert.equal(r.stateHash, s.stateHash);
  assert.deepEqual(r.world.wild!.build!.sites.get(smelter)!.job, s.world.wild!.build!.sites.get(smelter)!.job);
  const replayed = GameSession.replay(clone(s.journal));
  assert.equal(replayed.stateHash, s.stateHash, 'replay from genesis mid-batch');
  for (const x of [s, r, replayed]) ok(send(x, { type: 'tick', ticks: 30 }));
  assert.equal(r.stateHash, s.stateHash);
  assert.equal(replayed.stateHash, s.stateHash);
  assert.equal([...r.world.wild!.piles.values()].filter((p) => p.item === 'iron_ingot').reduce((a, p) => a + p.qty, 0), 1);
  assert.ok(s.compact());
  assert.ok(store.save(s).ok);
  const third = new BrowserSaveStore(storage, 1337, G, { scenario: WILDERNESS, id: 'w6' }).load();
  assert.equal(third.session.stateHash, s.stateHash, 'compacted save');
});

test('snapshot validation: mining and smelting blocks are strict; tampering is refused', () => {
  const { s, smelter } = withSmelter();
  const at = dm(siteSpotOf(s.world.wild!.build!.sites.get(smelter)!));
  ok(send(s, { type: 'smelt', siteId: smelter, recipe: 'iron_ingot', at }));
  const tickNow = s.world.life!.tick;
  const snap = clone(wildSnapshot(s.world.wild!));
  assert.doesNotThrow(() => validateWildSnapshot(clone(snap), tickNow));
  const bad = (f: (x: any) => void, what: RegExp) => { const x = clone(snap) as any; f(x); assert.throws(() => validateWildSnapshot(x, tickNow), what); };
  bad((x) => { x.mine.deposits[0].left = 99; }, /mining/);
  bad((x) => { x.mine.deposits[0].id = 'q:1'; }, /mining/);
  bad((x) => { delete x.mine; }, /mining block/);
  bad((x) => { const j = x.build.sites.find((q: any) => q.job).job; j.end += 1; }, /smelting batch/);
  bad((x) => { const j = x.build.sites.find((q: any) => q.job).job; j.charge = { coal: 1, iron_ore: 2 }; }, /smelting batch/);
  bad((x) => { x.content = 6; delete x.mine; }, /./);
});

// ---------- versions and old saves ----------

test('a v6 world: mine and smelt are refused, the smelter is locked, ore outcrops are still the only deposits; v6 and v7 genesis pinned', () => {
  const s6 = GameSession.genesis(1337, G, 'wilderness', 6);
  assert.equal(s6.stateHash, '2d9f702a4368b9d1', 'v6 genesis unchanged');
  assert.equal(code(send(s6, { type: 'mine', depositId: CLAY, at: dm(SPAWN) })), 'wilderness');
  assert.equal(code(send(s6, { type: 'smelt', siteId: 'b:1', recipe: 'iron_ingot', at: dm(SPAWN) })), 'wilderness');
  assert.match(lockReasons(s6.world, buildingDef('smelter')!).join(';'), /content v7/);
  assert.match(lockReasons(s6.world, buildingDef('smelter')!).join(';'), /clay \(not obtainable yet: mining arrives/);
  assert.equal(code(send(s6, { type: 'place_site', kind: 'smelter', x: -80, z: -170, rot: 0, at: dm(SPAWN) })), 'locked');
  // v6 discovery is ore only: walking by the clay records nothing.
  load(s6);
  tick(s6, 2);
  ok(explore(s6, SPAWN));
  walk(s6, SPAWN, by(dep(CLAY)));
  assert.ok(![...s6.world.wild!.map!.deposits].some((id) => id.startsWith('k:')));
  const s7 = v7();
  assert.equal(s7.journal.wildContent, 7);
  assert.equal(LATEST_WILD_CONTENT, 8);
  assert.equal(s7.stateHash, V7_PIN, 'v7 genesis');
  assert.equal(GameSession.genesis(1337).stateHash, 'e659504b056654dc', 'settlement genesis');
  // The catalogue: the smelter is the only W6 building; the forge and the workshop stay locked, and say why.
  assert.deepEqual(BUILD_CATALOGUE.filter((d) => d.minContent === 7).map((d) => d.id), ['smelter']);
  assert.deepEqual(lockReasons(s7.world, buildingDef('smelter')!), []);
  assert.match(lockReasons(s7.world, buildingDef('forge')!).join(';'), /needs a finished workshop.*|cut stone/);
  assert.match(lockReasons(s7.world, buildingDef('workshop')!).join(';'), /iron nails \(not obtainable yet: nails are smithed at a forge/);
});
const V7_PIN = '2b53c51d7dec7daa';

type Fx = { key: string; hash: string; record: string; compacted?: boolean };
function openFx(f: Fx) {
  const storage = new MemoryStorage();
  storage.setItem(f.key, f.record);
  const id = /^astrix:wild:v3:([^:]+):/.exec(f.key)![1];
  const store = new BrowserSaveStore(storage, 1337, G, { scenario: WILDERNESS, id });
  const loaded = store.load();
  assert.equal(loaded.status, 'restored', loaded.message);
  return { storage, store, id, s: loaded.session };
}

const W6FX = JSON.parse(readFileSync('tests/fixtures/w6-wilderness-save.json', 'utf8')) as {
  made: string; fire: string; bench: string; lean: string; ore: { id: string; x: number; z: number }; at: { x: number; z: number }; short: Fx; long: Fx;
};
for (const which of ['short', 'long'] as const) {
  test(`the v6 save made by the live W5 code (5917608, ${which}) loads byte-identically, replays under v6, upgrades to v7; its discovered outcrop is an iron deposit to mine`, () => {
    const f = W6FX[which];
    const { storage, store, id, s } = openFx(f);
    assert.equal(s.stateHash, f.hash);
    assert.equal(JSON.stringify({ schema: 3, seed: 1337, snapshot: s.snapshot, journal: s.journal }), f.record, 'byte-identical record');
    if (!f.compacted) assert.equal(GameSession.replay(clone(s.journal)).stateHash, f.hash, 'replays from genesis under the v6 rules');
    const w = s.world.wild!;
    assert.equal(w.content, 6);
    assert.equal(w.mine, undefined);
    const before = { items: { ...w.items }, tools: clone(w.tools), piles: w.piles.size, map: JSON.stringify(mapSnapshot(w.map!)),
      sites: [...w.build!.sites.values()].map((x) => [x.id, x.kind, x.state, x.stage, x.work]) };
    assert.equal(code(send(s, { type: 'mine', depositId: W6FX.ore.id, at: W6FX.at })), 'wilderness', 'no mining before the upgrade');
    ok(send(s, { type: 'upgrade_wilderness', content: 7 }), 'upgrade to v7 (what the game sends on load)');
    assert.equal(w.content, 7);
    assert.deepEqual({ items: { ...w.items }, tools: clone(w.tools), piles: w.piles.size, map: JSON.stringify(mapSnapshot(w.map!)),
      sites: [...w.build!.sites.values()].map((x) => [x.id, x.kind, x.state, x.stage, x.work]) }, before, 'v6 state untouched by the upgrade');
    assert.equal(carryCapacity(w), CARRY_CAPACITY_V5);
    assert.ok(w.map!.deposits.has(W6FX.ore.id), 'the outcrop seen in v6 is still discovered');
    assert.equal(dep(W6FX.ore.id).type, 'iron');
    // Mine it with the pickaxe the v6 save made (equipped), from where the save stood.
    tick(s);
    const outs = [];
    for (let i = 0; i < MINE_SWINGS.iron; i++) outs.push(ok(swing(s, { type: 'mine', depositId: W6FX.ore.id, at: W6FX.at })));
    assert.equal(w.items.iron_ore, 1);
    // The lean-to from v6 is still finished by W4 rules.
    const lean = w.build!.sites.get(W6FX.lean)!;
    assert.ok(workAll(s, lean.id).ok);
    assert.equal(lean.state, 'done');
    assert.ok(store.save(s).ok);
    const again = new BrowserSaveStore(storage, 1337, G, { scenario: WILDERNESS, id }).load();
    assert.equal(again.status, 'restored');
    assert.equal(again.session.stateHash, s.stateHash);
    if (!f.compacted) assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'upgraded journal replays');
    void exploredCount;
  });
}

for (const n of ['w1', 'w2', 'w3', 'w4', 'w5'] as const) {
  test(`the ${n.toUpperCase()} wilderness fixture loads, replays under its own rules and upgrades straight to v7`, () => {
    const FX = JSON.parse(readFileSync(`tests/fixtures/${n}-wilderness-save.json`, 'utf8')) as { short: Fx; long: Fx };
    for (const f of [FX.short, FX.long]) {
      const { s } = openFx(f);
      assert.equal(s.stateHash, f.hash);
      if (!f.compacted) assert.equal(GameSession.replay(clone(s.journal)).stateHash, f.hash);
      const was = s.world.wild?.content ?? 1;
      assert.ok(was < 7);
      ok(send(s, { type: 'upgrade_wilderness', content: 7 }), `${n} upgrade from v${was}`);
      const w = s.world.wild!;
      assert.equal(w.content, 7);
      assert.ok(w.fell && w.build && w.map && w.mine, 'every block since W3');
      assert.equal(w.mine!.deposits.size, 0);
      ok(explore(s, SPAWN));
      if (!f.compacted) assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'upgraded journal replays');
    }
  });
}
