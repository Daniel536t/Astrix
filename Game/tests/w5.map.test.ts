// W5 (wilderness content v6): world navigation and map.
// - Named places come from deterministic pure rules and exist only where their rule holds.
// - The fog starts unexplored; exploration is driven by journaled `explore` reports of the player's position,
//   revealed by the visibility rule; places and ore outcrops are discovered only when legitimately seen.
// - Implausible reports (jumps the player could not have walked) are refused and change nothing.
// - Waypoints are journaled, capped, and persist; discovery persists across save, reload, compaction and replay.
// - Routes follow the 1 m walking rules: around deep water and cliffs, across a ford, refused with a reason.
// - Old saves: the v5 fixture made by the live W4 candidate code (0e41531) and the W1-W4 fixtures load,
//   replay under their own rules and upgrade to v6 by one journaled upgrade_wilderness.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameSession } from '../src/app/session';
import { BrowserSaveStore, KeyValueStorage } from '../src/app/persistence';
import { GENERATOR_V2, MAT, WILDERNESS, baseHeightAt, baseTopMaterialFor, baseWaterLevelAt, forestScore, rockScore, surfaceAt, waterDepthAt, generateEntityChunk, worldToChunkX, worldToChunkZ, chunkKey } from '../src/sim/world';
import { CARRY_CAPACITY_V5, carryCapacity } from '../src/sim/gathering';
import {
  DEPOSIT_SIGHT, EXPLORE_CREDIT_CAP, FOG_CELL, MAX_WAYPOINTS, REVEAL_RADIUS, cellsWithin, exploreGain, exploredCount, fogIndex, isExplored, mapSnapshot, oreInChunk, revealRadius,
} from '../src/sim/map';
import { allPlaces, fordableLine, placeById, placesNear, resetPlaceCache } from '../src/sim/places';
import {
  COARSE, EDGE, RouteGround, TerrainCache, lineCost, nodeCentre, nodeOf, planRoute, refineStart, RouteSearch, routeGround, stepCost, terrainCache,
} from '../src/sim/route';
import { WADE_MAX } from '../src/sim/nav';
import { siteSpotOf } from '../src/sim/wild-build';
import { SPAWN, clone, code, dm, ok, send, tick, workAll, load, reasons } from './w4-harness';

class MemoryStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
}
// W6: new worlds start at v7; the W5 tests keep testing exactly the v6 rules.
const v6 = () => GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 6);
const mapOf = (s: GameSession) => s.world.wild!.map!;
const explore = (s: GameSession, p: { x: number; z: number }) => send(s, { type: 'explore', at: dm(p) });
/** Walk from a to b reporting every `step` m, with a world tick every `perTick` reports (16 m per tick: 8 m/s at most). */
function walk(s: GameSession, a: { x: number; z: number }, b: { x: number; z: number }, step = 16, perTick = 1): void {
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / step));
  for (let k = 1; k <= n; k++) {
    if (k % perTick === 0) tick(s);
    ok(explore(s, { x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n }), `report ${k}/${n}`);
  }
}

// ---------- places ----------

test('named places: deterministic pure rules, pinned near the spawn, each one where its rule really holds', () => {
  const a = allPlaces(1337, GENERATOR_V2);
  resetPlaceCache();
  const b = allPlaces(1337, GENERATOR_V2);
  assert.deepEqual(a, b, 'recomputed from scratch: identical');
  assert.ok(a.length >= 10, `${a.length} places`);
  assert.notDeepEqual(allPlaces(4242, GENERATOR_V2).map((p) => [p.x, p.z]), a.map((p) => [p.x, p.z]), 'another seed, other places');
  // Pins near the W1 spawn (seed 1337): the shallow river crossing west of the spawn, the forest, the lake, the meadow.
  const near = placesNear(1337, GENERATOR_V2, SPAWN.x, SPAWN.z, 260).map((p) => `${p.id}=${p.name}@${p.x},${p.z}`);
  for (const pin of ['pl:ford:1,1:0=Shallow Ford@-120,-216', 'pl:forest:1,1=Green Forest@-40,-312', 'pl:lake=Mirror Lake@-265,-286', 'pl:meadow:1,1=Fertile Meadow@-248,-104']) {
    assert.ok(near.includes(pin), `${pin} in ${near.join(' ')}`);
  }
  assert.ok(!a.some((p) => /trading/i.test(p.name)), 'no Trading Post (W10)');
  const H = (x: number, z: number) => baseHeightAt(1337, GENERATOR_V2, Math.floor(x), Math.floor(z));
  const D = (x: number, z: number) => Math.max(0, baseWaterLevelAt(1337, GENERATOR_V2, Math.floor(x), Math.floor(z)) - H(x, z));
  for (const p of a) {
    const h = H(p.x, p.z), d = D(p.x, p.z);
    switch (p.kind) {
      case 'ford': {
        // A wadeable straight crossing through the anchor (row or column), and the river is deep within 160 m.
        let crossing = false;
        for (const [dx, dz] of [[1, 0], [0, 1]]) for (let half = 2; half <= 48 && !crossing; half++) {
          crossing = fordableLine(1337, GENERATOR_V2, p.x - dx * half, p.z - dz * half, p.x + dx * half, p.z + dz * half);
        }
        assert.ok(crossing, `${p.id}: a wadeable crossing`);
        let deep = false;
        for (let r = 4; r <= 160 && !deep; r += 4) for (let k = 0; k < 32 && !deep; k++) deep = D(p.x + Math.cos(k / 5.09) * r, p.z + Math.sin(k / 5.09) * r) > WADE_MAX;
        assert.ok(deep, `${p.id}: deep water nearby (so the ford is the way across)`);
        break;
      }
      case 'lake': assert.ok(d > WADE_MAX, `${p.id} is deep water`); break;
      case 'tarn': assert.ok(d > 0, `${p.id} is water`); break;
      case 'forest': assert.ok(forestScore(p.x, p.z, 1337) >= 0.55 && d === 0, `${p.id} forest`); break;
      case 'meadow': assert.ok(forestScore(p.x, p.z, 1337) < 0.1 && d === 0 && h >= 2 && h <= 30, `${p.id} meadow`); break;
      case 'highland': assert.ok(h >= 45 && rockScore(p.x, p.z, 1337) >= 0.5, `${p.id} highland`); break;
      case 'ore': case 'quarry': {
        const fx = Math.floor(p.x), fz = Math.floor(p.z);
        const slope = Math.max(...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => Math.abs(h - baseHeightAt(1337, GENERATOR_V2, fx + dx, fz + dz))));
        assert.equal(baseTopMaterialFor(1337, GENERATOR_V2, fx, fz, h, slope), MAT.STONE, `${p.id} bare stone`);
        assert.ok(p.kind === 'ore' ? rockScore(p.x, p.z, 1337) > 0.58 && h >= 30 : h < 30, `${p.id} rule`);
        break;
      }
      case 'valley': assert.ok(d > 0, `${p.id} on the river`); break;
    }
  }
  // Only where the rule holds: no place in open sea; no ford in the middle of the deep lake.
  assert.equal(placesNear(1337, GENERATOR_V2, 950, 950, 60).length, 0, 'nothing in the south-east sea corner');
  assert.ok(!a.some((p) => p.kind === 'ford' && Math.hypot(p.x + 265, p.z + 286) < 40), 'no ford in the lake');
  assert.equal(placeById(1337, GENERATOR_V2, 'pl:ford:1,1:0')!.name, 'Shallow Ford');
});

// ---------- fog, exploration and discovery ----------

test('fog starts unexplored: a new v6 world has explored nothing and discovered nothing; v6 genesis is pinned', () => {
  const s = v6();
  assert.equal(s.journal.wildContent, 6);
  assert.equal(s.stateHash, W6_PIN, 'v6 genesis');
  const m = mapOf(s);
  assert.equal(exploredCount(m), 0);
  assert.equal(m.places.size, 0);
  assert.equal(m.deposits.size, 0);
  assert.equal(m.waypoints.size, 0);
  assert.deepEqual(mapSnapshot(m), { deposits: [], explored: [], nextWaypoint: 1, places: [], waypoints: [] });
  assert.ok(placesNear(1337, GENERATOR_V2, SPAWN.x, SPAWN.z, 200).length > 0, 'there are places nearby, all undiscovered');
  // Even a long run of world time reveals nothing: only movement does.
  tick(s, 20);
  assert.equal(exploredCount(m), 0);
});
const W6_PIN = '2d9f702a4368b9d1';

test('exploring: the reveal radius around the reported position; a place only when its cell is seen; ore only within 24 m', () => {
  const s = v6();
  load(s);
  const m = mapOf(s);
  const r0 = ok(explore(s, SPAWN), 'first report at the spawn');
  assert.ok(r0.ok && r0.outcome.type === 'explore');
  const expected = cellsWithin(SPAWN.x, SPAWN.z, revealRadius(s.world, SPAWN.x, SPAWN.z));
  assert.equal(revealRadius(s.world, SPAWN.x, SPAWN.z), REVEAL_RADIUS, 'low ground: 48 m');
  assert.equal(exploredCount(m), expected.length);
  assert.ok(r0.ok && r0.outcome.type === 'explore' && r0.outcome.revealed === expected.length);
  for (const i of expected) assert.equal(m.explored[i], 1);
  // A cell 80 m away is still fog.
  assert.equal(isExplored(m, SPAWN.x - 80, SPAWN.z), false);
  // The Shallow Ford's cell is ~59 m from the spawn: not yet seen, not discovered.
  const ford = placeById(1337, GENERATOR_V2, 'pl:ford:1,1:0')!;
  assert.equal(isExplored(m, ford.x, ford.z), false);
  assert.equal(m.places.has(ford.id), false);
  // The same report again reveals nothing new.
  const again = ok(explore(s, SPAWN));
  assert.ok(again.ok && again.outcome.type === 'explore' && again.outcome.revealed === 0 && again.outcome.places.length === 0);
  // Walk toward the ford: it is discovered when its cell is revealed, and the outcome names it.
  tick(s);
  const toward = { x: SPAWN.x - 20, z: SPAWN.z - 20 };
  const r = ok(explore(s, toward));
  assert.ok(r.ok && r.outcome.type === 'explore');
  assert.ok(r.ok && r.outcome.type === 'explore' && r.outcome.places.includes(ford.id), JSON.stringify(r.ok && r.outcome));
  assert.equal(m.places.has(ford.id), true);
  // Every discovered place has its anchor cell explored; no undiscovered place lies in an explored cell.
  for (const p of placesNear(1337, GENERATOR_V2, SPAWN.x, SPAWN.z, 400)) assert.equal(m.places.has(p.id), isExplored(m, p.x, p.z), p.id);
});

/** A styl_ore entity in the rocky ground west of the spawn, with a dry, low-relief approach. */
function findOre(s: GameSession): { id: string; x: number; z: number } {
  for (const c of [[-472, -168], [-616, -376], [-504, 344]]) {
    for (let cz = worldToChunkZ(c[1] - 64); cz <= worldToChunkZ(c[1] + 64); cz++) for (let cx = worldToChunkX(c[0] - 64); cx <= worldToChunkX(c[0] + 64); cx++) {
      generateEntityChunk(s.world, cx, cz);
      for (const id of s.world.entityChunks.get(chunkKey(cx, cz)) ?? []) {
        const e = s.world.entities.get(id)!;
        if (e.kind === 'styl_ore' && /^e:/.test(id)) return { id, x: e.x, z: e.z };
      }
    }
  }
  throw new Error('no ore found');
}

test('ore outcrops become map features only when the player comes within 24 m; passing at 40 m does not reveal them', () => {
  const s = v6();
  const m = mapOf(s);
  const ore = findOre(s);
  // The first report after the content upgrade is anchored where it is made; 40 m from the outcrop.
  const far = { x: ore.x + 40, z: ore.z };
  const r1 = ok(explore(s, far));
  assert.ok(r1.ok && r1.outcome.type === 'explore' && !r1.outcome.deposits.includes(ore.id));
  assert.equal(m.deposits.has(ore.id), false, 'seen as land (the cell is explored) but the outcrop is not discovered');
  assert.equal(isExplored(m, ore.x, ore.z), true);
  tick(s);
  const near = { x: ore.x + DEPOSIT_SIGHT - 2, z: ore.z };
  const r2 = ok(explore(s, near));
  assert.ok(r2.ok && r2.outcome.type === 'explore' && r2.outcome.deposits.includes(ore.id), JSON.stringify(r2.ok && r2.outcome));
  assert.equal(m.deposits.has(ore.id), true);
  // Every discovered deposit is a real, unremoved styl_ore within 24 m of an accepted report.
  for (const id of m.deposits) {
    const [cx, cz] = /^e:(\d+),(\d+):/.exec(id)!.slice(1).map(Number);
    generateEntityChunk(s.world, cx, cz);
    assert.equal(s.world.entities.get(id)?.kind, 'styl_ore');
  }
  // The pure planner the map reads gives exactly the outcrops chunk generation places (ids and positions).
  const ocx = worldToChunkX(Math.floor(ore.x)), ocz = worldToChunkZ(Math.floor(ore.z));
  for (let cz = ocz - 2; cz <= ocz + 2; cz++) for (let cx = ocx - 2; cx <= ocx + 2; cx++) {
    generateEntityChunk(s.world, cx, cz);
    const generated = (s.world.entityChunks.get(chunkKey(cx, cz)) ?? []).map((id) => s.world.entities.get(id)!).filter((e) => e.kind === 'styl_ore').map((e) => ({ id: e.id, x: e.x, z: e.z }));
    assert.deepEqual(oreInChunk(1337, GENERATOR_V2, cx, cz), generated, `chunk ${cx},${cz}`);
  }
});

test('explore validation: jumps the player could not have walked are refused and change nothing; returns, the spawn and respawns are allowed', () => {
  const s = v6();
  load(s);
  const m = mapOf(s);
  ok(explore(s, SPAWN));
  const h0 = s.stateHash, n0 = exploredCount(m);
  // 500 m away a moment later: refused.
  const jump = explore(s, { x: SPAWN.x + 500, z: SPAWN.z });
  assert.equal(code(jump), 'implausible');
  assert.match(reasons(jump).join(';'), /could not have walked/);
  assert.equal(s.stateHash, h0, 'refusal changes nothing');
  assert.equal(exploredCount(m), n0);
  // Outside the world.
  assert.equal(code(explore(s, { x: 1030, z: 0 })), 'out_of_world');
  // Credit: 16 m a tick up to 160 m. After 5 ticks 160 m is plausible (80 m left at the first report + 80).
  tick(s, 5);
  ok(explore(s, { x: SPAWN.x + 150, z: SPAWN.z }), '150 m after 10 s');
  assert.equal(code(explore(s, { x: SPAWN.x + 150 + EXPLORE_CREDIT_CAP, z: SPAWN.z })), 'implausible', 'the credit is spent');
  // A return to an explored cell (Home, a banner) is plausible at once, and so is the spawn.
  ok(explore(s, { x: SPAWN.x + 5, z: SPAWN.z + 5 }), 'return to an explored spot');
  ok(explore(s, { x: SPAWN.x + 150, z: SPAWN.z }), 'and back to an explored spot');
  // A forged journal entry (an explore outcome naming a place it did not discover) is refused on replay.
  const j = clone(s.journal);
  const e = j.entries.find((x: { command: { type: string } }) => x.command.type === 'explore')!;
  (e.outcome as { places: string[] }).places = ['pl:lake'];
  assert.throws(() => GameSession.replay(j));
  assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'the real journal replays');
});

test('a respawn landing anchors the next report; a v5 world refuses map commands until upgraded', () => {
  const s = GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 5);
  for (const c of [{ type: 'explore', at: dm(SPAWN) }, { type: 'set_waypoint', x: 0, z: 0, name: 'Home' }, { type: 'remove_waypoint', waypointId: 'w:1' }]) {
    assert.equal(code(send(s, c)), 'wilderness', c.type);
  }
  ok(send(s, { type: 'upgrade_wilderness', content: 6 }), 'upgrade');
  assert.equal(code(send(s, { type: 'upgrade_wilderness', content: 6 })), 'already_current');
  assert.equal(exploredCount(mapOf(s)), 0, 'the upgrade reveals nothing');
  ok(explore(s, SPAWN));
});

// ---------- waypoints ----------

test('waypoints: placed, inspected, removed; names validated; capped; they persist through save, reload and replay', () => {
  const storage = new MemoryStorage();
  const store = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w5' });
  const s = store.load().session;
  const m = mapOf(s);
  const a = ok(send(s, { type: 'set_waypoint', x: -150, z: -180, name: 'Across the river' }));
  assert.ok(a.ok && a.outcome.type === 'set_waypoint');
  const id = a.ok && a.outcome.type === 'set_waypoint' ? a.outcome.waypointId : '';
  assert.equal(id, 'w:1');
  assert.deepEqual(m.waypoints.get(id), { id, name: 'Across the river', x: -150, z: -180 });
  for (const bad of ['', ' lead', 'trail ', 'x'.repeat(25), '<b>', 'a\nb']) assert.equal(send(s, { type: 'set_waypoint', x: 0, z: 0, name: bad }).ok, false, JSON.stringify(bad));
  assert.equal(send(s, { type: 'set_waypoint', x: 1023, z: 0, name: 'Edge' }).ok, false, 'outside');
  ok(send(s, { type: 'set_waypoint', x: 10, z: 20, name: 'Camp' }));
  assert.ok(store.save(s).ok);
  let again = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w5' }).load();
  assert.equal(again.status, 'restored');
  assert.deepEqual([...mapOf(again.session).waypoints.values()].map((w) => w.name), ['Across the river', 'Camp']);
  const s2 = again.session;
  ok(send(s2, { type: 'remove_waypoint', waypointId: 'w:1' }));
  assert.equal(code(send(s2, { type: 'remove_waypoint', waypointId: 'w:1' })), 'not_found');
  for (let k = mapOf(s2).waypoints.size; k < MAX_WAYPOINTS; k++) ok(send(s2, { type: 'set_waypoint', x: k, z: k, name: `P ${k}` }));
  assert.equal(code(send(s2, { type: 'set_waypoint', x: 0, z: 0, name: 'One more' })), 'too_many');
  assert.ok(store.save(s2).ok);
  again = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w5' }).load();
  assert.equal(mapOf(again.session).waypoints.size, MAX_WAYPOINTS);
  assert.equal(mapOf(again.session).waypoints.has('w:1'), false, 'the removed one stays removed');
  assert.equal(again.session.stateHash, s2.stateHash);
  assert.equal(GameSession.replay(clone(s2.journal)).stateHash, s2.stateHash, 'replays from genesis');
});

test('exploration and discoveries persist across save, reload, compaction and replay; a tampered map block is refused', () => {
  const storage = new MemoryStorage();
  const store = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w6' });
  const s = store.load().session;
  load(s);
  ok(explore(s, SPAWN));
  walk(s, SPAWN, { x: SPAWN.x - 60, z: SPAWN.z - 40 });
  const m = mapOf(s);
  const snap = JSON.stringify(mapSnapshot(m));
  assert.ok(m.places.size >= 1, 'the ford at least');
  assert.ok(store.save(s).ok);
  const r = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w6' }).load();
  assert.equal(r.status, 'restored');
  assert.equal(JSON.stringify(mapSnapshot(mapOf(r.session))), snap, 'the same fog, places and deposits');
  assert.equal(r.session.stateHash, s.stateHash);
  assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash);
  s.compact();
  assert.ok(store.save(s).ok);
  const c = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w6' }).load();
  assert.equal(c.status, 'restored');
  assert.equal(JSON.stringify(mapSnapshot(mapOf(c.session))), snap, 'compacted save: the same map');
  // Tampering with the saved map block is refused (a run that touches, an unknown place id, a bad waypoint).
  const key = [...storage.map.keys()].find((k) => k.startsWith('astrix:wild:'))!;
  const rec = JSON.parse(storage.getItem(key)!);
  for (const f of [
    (w: { map: Record<string, unknown> }) => { (w.map.explored as number[]).push(1, 1); },
    (w: { map: Record<string, unknown> }) => { w.map.places = ['pl:castle']; },
    (w: { map: Record<string, unknown> }) => { w.map.waypoints = [{ id: 'w:9', name: 'x', x: 0, z: 0 }]; },
    (w: { map: Record<string, unknown> }) => { delete w.map.explored; },
  ]) {
    const bad = clone(rec);
    f(bad.snapshot.wild);
    const st = new MemoryStorage();
    st.setItem(key, JSON.stringify(bad));
    assert.notEqual(new BrowserSaveStore(st, 1337, GENERATOR_V2, { scenario: WILDERNESS, id: 'w6' }).load().status, 'restored');
  }
});

test('journal growth: exploring new land at walking speed costs a few KB a minute; walking in explored land costs nothing', () => {
  const s = v6();
  const start = { x: -200, z: 100 };
  ok(explore(s, start));
  const before = JSON.stringify(s.journal).length;
  // One minute at walking speed (4.2 m/s = 252 m) into new land: one tick every 2 s, a report each 16 m when it reveals something.
  let x = start.x, sent = 0, lastX = start.x;
  for (let t = 0; t < 30; t++) {
    tick(s);
    x += 8.4;
    if (x - lastX >= 16) { ok(explore(s, { x, z: start.z })); sent++; lastX = x; }
  }
  const withTicks = JSON.stringify(s.journal).length - before;
  const exploreBytes = s.journal.entries.filter((e) => e.command.type === 'explore').reduce((n, e) => n + JSON.stringify(e).length, 0) - JSON.stringify(s.journal.entries[0]).length;
  console.log(`# W5 journal growth, 1 min walking (252 m) into new land: ${sent} explore reports, ${exploreBytes} bytes of explore entries; ${withTicks} bytes including the 30 world ticks`);
  assert.ok(exploreBytes < 6000, `${exploreBytes} B/min`);
  // Walking back along the same line: nothing to discover, so the client (which reports only on a gain) sends nothing.
  for (let bx = x; bx >= start.x; bx -= 16) {
    const g = exploreGain(s.world, mapOf(s), bx, start.z);
    assert.deepEqual([g.cells.length, g.places.length, g.deposits.length], [0, 0, 0], `explored at ${bx}`);
  }
});

// ---------- routes ----------

/** Every 1 m move along a route's segments obeys the walking rules (the route's own claim). */
function walkable(g: RouteGround, pts: Array<{ x: number; z: number }>): boolean {
  for (let k = 1; k < pts.length; k++) {
    if (lineCost(g, Math.floor(pts[k - 1].x), Math.floor(pts[k - 1].z), Math.floor(pts[k].x), Math.floor(pts[k].z)) < 0) return false;
  }
  return true;
}
const maxDepthAlong = (g: RouteGround, pts: Array<{ x: number; z: number }>) => {
  let worst = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z));
    for (let i = 0; i <= n; i++) worst = Math.max(worst, g.t.d(Math.floor(a.x + (b.x - a.x) * i / n), Math.floor(a.z + (b.z - a.z) * i / n)));
  }
  return worst;
};

test('routes cross the river by wading a ford (never deeper than 1 m) and go around the deep lake; never a straight line through it', () => {
  const g: RouteGround = { t: terrainCache(1337, GENERATOR_V2), blocked: new Set() };
  // Across the river west of the spawn.
  const west = { x: -160, z: -180 };
  const r = planRoute(g, SPAWN, west);
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(r.ok && r.fords >= 1 && r.wadeM > 0, 'it wades');
  assert.ok(r.ok && maxDepthAlong(g, r.points) <= WADE_MAX, 'never deeper than 1 m');
  assert.ok(r.ok && walkable(g, r.points), 'every segment walkable at 1 m');
  // Around the lake: from its south-east shore to the north-west, where the straight line crosses deep water.
  const lake = placeById(1337, GENERATOR_V2, 'pl:lake')!;
  const shore = (dir: number) => { for (let r = 0; r < 400; r++) { const x = lake.x + dir * r; if (g.t.d(Math.floor(x), lake.z) === 0) return { x: x + dir * 12, z: lake.z }; } throw new Error('no shore'); };
  const a = shore(1), b = shore(-1);
  assert.ok(g.t.d(Math.floor(a.x), Math.floor(a.z)) === 0 && g.t.d(Math.floor(b.x), Math.floor(b.z)) === 0, `dry ends ${JSON.stringify([a, b])}`);
  assert.equal(-lineCost(g, a.x, a.z, b.x, b.z), EDGE.deep_water, 'the straight line crosses deep water');
  const around = planRoute(g, a, b);
  assert.ok(around.ok, JSON.stringify(around));
  if (around.ok) {
    assert.ok(maxDepthAlong(g, around.points) <= WADE_MAX, 'the route never enters deep water');
    assert.ok(walkable(g, around.points));
    assert.ok(around.length > Math.hypot(b.x - a.x, b.z - a.z) * 1.1, `a detour: ${around.length} m vs ${Math.round(Math.hypot(b.x - a.x, b.z - a.z))} m straight`);
    assert.ok(around.points.length > 2, 'not a straight line');
  }
});

/** Synthetic terrain for exact cases. */
class FakeTerrain extends TerrainCache {
  constructor(private readonly fh: (x: number, z: number) => number, private readonly fd: (x: number, z: number) => number) { super(0, 0); }
  override h(x: number, z: number): number { return this.fh(x, z); }
  override d(x: number, z: number): number { return this.fd(x, z); }
}

test('routes: a deep river is crossed only at its ford; a cliff is walked around; a cut-off destination is refused with the reason', () => {
  // A deep river along x = 0..9 (2 m deep) with a 1 m-deep ford at z 40..47.
  const river: RouteGround = { t: new FakeTerrain(() => 5, (x, z) => x >= 0 && x < 10 ? (z >= 40 && z < 48 ? 1 : 2) : 0), blocked: new Set() };
  const r = planRoute(river, { x: -40, z: -60 }, { x: 50, z: -60 });
  assert.ok(r.ok, JSON.stringify(r));
  if (r.ok) {
    assert.ok(r.points.some((p, k) => k > 0 && (Math.min(p.z, r.points[k - 1].z) <= 47 && Math.max(p.z, r.points[k - 1].z) >= 40)), 'it goes by the ford');
    assert.ok(maxDepthAlong(river, r.points) <= 1);
    assert.equal(r.fords, 1);
  }
  // Without the ford: cut off, and the reason says deep water.
  const noFord: RouteGround = { t: new FakeTerrain(() => 5, (x) => x >= 0 && x < 10 ? 2 : 0), blocked: new Set() };
  const n = planRoute(noFord, { x: -40, z: -60 }, { x: 50, z: -60 });
  assert.equal(n.ok, false);
  assert.ok(!n.ok && n.code === 'closed_in' && /deep water/.test(n.reason), JSON.stringify(n));
  // A plateau 3 m high (a cliff all round) with one ramp: the route climbs the ramp, never the cliff.
  const plateau = (x: number, z: number) => {
    if (x >= 100 && x < 140 && z >= 100 && z < 140) return 13;
    if (x >= 140 && x < 143 && z >= 116 && z < 124) return 13 - (x - 139);
    return 10;
  };
  const cliff: RouteGround = { t: new FakeTerrain(plateau, () => 0), blocked: new Set() };
  assert.equal(-lineCost(cliff, 60, 120, 120, 120), EDGE.cliff, 'the straight line meets the cliff');
  const up = planRoute(cliff, { x: 60, z: 120 }, { x: 120, z: 120 });
  assert.ok(up.ok, JSON.stringify(up));
  assert.ok(up.ok && walkable(cliff, up.points), 'every 1 m step at most 1 m');
  assert.ok(up.ok && up.points.some((p) => p.x >= 140 && p.z >= 116 && p.z < 124), 'by the ramp');
  // No ramp: refused, with cliffs as the reason.
  const sheer: RouteGround = { t: new FakeTerrain((x, z) => x >= 100 && x < 140 && z >= 100 && z < 140 ? 13 : 10, () => 0), blocked: new Set() };
  const no = planRoute(sheer, { x: 60, z: 120 }, { x: 120, z: 120 }, 20_000);
  assert.ok(!no.ok && no.code === 'cut_off' && /cliffs/.test(no.reason), JSON.stringify(no));
  // A destination in deep water, and outside the world.
  const lake = planRoute(noFord, { x: -40, z: -60 }, { x: 4, z: -60 });
  assert.ok(!lake.ok && lake.code === 'deep_destination' && /deep water/.test(lake.reason));
  const out = planRoute(river, { x: -40, z: -60 }, { x: 1100, z: 0 });
  assert.ok(!out.ok && out.code === 'outside');
  // Buildings: a ring of footprints closes a spot in.
  const ring = new Set<number>();
  for (let k = -12; k <= 12; k++) for (const [x, z] of [[k, -12], [k, 12], [-12, k], [12, k]]) ring.add((x + 300 + 1024) * 4096 + (z + 1024));
  const walled: RouteGround = { t: new FakeTerrain(() => 5, () => 0), blocked: ring };
  const w = planRoute(walled, { x: 260, z: 0 }, { x: 300.5, z: 0.5 }, 20_000);
  assert.ok(!w.ok && /buildings/.test(w.reason), JSON.stringify(w));
});

test('routes are deterministic whatever the step slicing; the local planner joins the route on the live 1 m grid', () => {
  const g: RouteGround = { t: terrainCache(1337, GENERATOR_V2), blocked: new Set() };
  const to = { x: -248, z: -104 };
  const a = planRoute(g, SPAWN, to);
  const s = new RouteSearch(g, SPAWN, to);
  let steps = 0;
  while (!s.step(7)) steps++;
  assert.deepEqual(s.result, a, `${steps} slices`);
  const fresh = planRoute({ t: new TerrainCache(1337, GENERATOR_V2), blocked: new Set() }, SPAWN, to);
  assert.deepEqual(fresh, a, 'fresh terrain cache');
  // The coarse terrain samples equal the live world's surface and water.
  const w = v6();
  load(w);
  for (let k = 0; k < 200; k++) {
    const x = Math.floor(SPAWN.x - 60 + (k * 37) % 120), z = Math.floor(SPAWN.z - 60 + (k * 53) % 120);
    assert.equal(g.t.h(x, z), surfaceAt(w.world, x, z), `h ${x},${z}`);
    assert.equal(g.t.d(x, z), Math.max(0, waterDepthAt(w.world, x, z)), `d ${x},${z}`);
  }
  assert.ok(a.ok);
  if (a.ok) {
    const loc = refineStart(w.world, SPAWN, a.points);
    assert.ok(loc, 'the local planner found its way to the route');
    assert.deepEqual(loc!.path[0], SPAWN);
    assert.ok(loc!.joinIndex >= 1);
  }
  // The node lattice: 8 m, centres on cell corners + 4.
  assert.equal(COARSE, 8);
  assert.equal(nodeCentre(nodeOf(SPAWN.x)), -84);
  assert.ok(stepCost(g, -84, -172, 1, 0) > 0);
  void routeGround; void FOG_CELL; void fogIndex;
});

// ---------- old saves ----------

type Fx = { key: string; hash: string; record: string; compacted?: boolean };
function openFx(f: Fx) {
  const storage = new MemoryStorage();
  storage.setItem(f.key, f.record);
  const id = /^astrix:wild:v3:([^:]+):/.exec(f.key)![1];
  const store = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id });
  const loaded = store.load();
  assert.equal(loaded.status, 'restored', loaded.message);
  return { storage, store, id, s: loaded.session };
}

const W5FX = JSON.parse(readFileSync('tests/fixtures/w5-wilderness-save.json', 'utf8')) as { made: string; fire: string; lean: string; short: Fx; long: Fx };
for (const which of ['short', 'long'] as const) {
  test(`the v5 save made by the live W4 candidate code (0e41531, ${which}) loads byte-identically, replays under v5, upgrades to v6 and keeps everything`, () => {
    const f = W5FX[which];
    const { storage, store, id, s } = openFx(f);
    assert.equal(s.stateHash, f.hash);
    assert.equal(JSON.stringify({ schema: 3, seed: 1337, snapshot: s.snapshot, journal: s.journal }), f.record, 'byte-identical record');
    if (!f.compacted) assert.equal(GameSession.replay(clone(s.journal)).stateHash, f.hash, 'replays from genesis under the v5 rules');
    const w = s.world.wild!;
    assert.equal(w.content, 5);
    assert.equal(w.map, undefined);
    assert.equal(carryCapacity(w), CARRY_CAPACITY_V5, 'the 60-weight bag');
    const before = { items: { ...w.items }, piles: w.piles.size, sites: [...w.build!.sites.values()].map((x) => [x.id, x.state, x.stage, x.work]) };
    ok(send(s, { type: 'upgrade_wilderness', content: 6 }), 'upgrade to v6 (what the game sends on load)');
    assert.equal(w.content, 6);
    assert.equal(exploredCount(w.map!), 0, 'nothing revealed by the upgrade');
    assert.deepEqual({ items: { ...w.items }, piles: w.piles.size, sites: [...w.build!.sites.values()].map((x) => [x.id, x.state, x.stage, x.work]) }, before, 'W4 state untouched');
    assert.equal(carryCapacity(w), CARRY_CAPACITY_V5);
    // W4 still works after the upgrade: the unfinished lean-to is finished.
    const lean = w.build!.sites.get(W5FX.lean)!;
    const done = workAll(s, lean.id);
    assert.ok(done.ok, JSON.stringify(done));
    assert.equal(lean.state, 'done');
    // And the map works: explore at the lean-to, a waypoint.
    ok(explore(s, siteSpotOf(lean)));
    assert.ok(exploredCount(w.map!) > 0);
    ok(send(s, { type: 'set_waypoint', x: -150, z: -180, name: 'Ford side' }));
    assert.ok(store.save(s).ok);
    const again = new BrowserSaveStore(storage, 1337, GENERATOR_V2, { scenario: WILDERNESS, id }).load();
    assert.equal(again.status, 'restored');
    assert.equal(again.session.stateHash, s.stateHash);
    assert.equal(JSON.stringify(mapSnapshot(again.session.world.wild!.map!)), JSON.stringify(mapSnapshot(w.map!)));
    if (!f.compacted) assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'upgraded journal replays');
  });
}

for (const n of ['w1', 'w2', 'w3', 'w4'] as const) {
  test(`the ${n.toUpperCase()} wilderness fixtures load, replay under their own rules and upgrade straight to v6`, () => {
    const FX = JSON.parse(readFileSync(`tests/fixtures/${n}-wilderness-save.json`, 'utf8')) as { short: Fx; long: Fx };
    for (const f of [FX.short, FX.long]) {
      const { s } = openFx(f);
      assert.equal(s.stateHash, f.hash);
      if (!f.compacted) assert.equal(GameSession.replay(clone(s.journal)).stateHash, f.hash);
      const was = s.world.wild?.content ?? 1;
      assert.ok(was < 6);
      ok(send(s, { type: 'upgrade_wilderness', content: 6 }), `${n} upgrade from v${was}`);
      const w = s.world.wild!;
      assert.equal(w.content, 6);
      assert.ok(w.fell && w.build && w.map, 'every block since W3');
      assert.equal(exploredCount(w.map!), 0);
      assert.equal(carryCapacity(w), CARRY_CAPACITY_V5);
      ok(explore(s, SPAWN));
      if (!f.compacted) assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'upgraded journal replays');
    }
  });
}

test('pins: settlement genesis and the wilderness v2-v5 genesis hashes are unchanged', () => {
  assert.equal(GameSession.genesis(1337).stateHash, 'e659504b056654dc');
  assert.equal(GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 2).stateHash, '3c3a0c8e4090efcf');
  assert.equal(GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 3).stateHash, '158e989e4c10cf13');
  assert.equal(GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 4).stateHash, '6d50f19f01f39eec');
  assert.equal(GameSession.genesis(1337, GENERATOR_V2, 'wilderness', 5).stateHash, '9ddf941c10692096');
});
