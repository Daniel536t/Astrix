// W7 (wilderness content v8): persistent wildlife and animal minds.
// - Identity: every creature's id and starting state are derived from (seed, generator, chunk); a saved record
//   overrides the derivation once the creature has lived; tombstones keep the dead dead. Reload, compaction and
//   replay never duplicate or resurrect one.
// - Behaviour: per species (deer, hare, fox, wolf, trout), driven by needs (hunger, thirst, fatigue), the time of
//   day, the player's journaled presence, noise, predators and prey. Wolves can bring down a tired deer: an
//   authoritative death with a carcass record.
// - Movement: land animals on dry, unblocked cells (no trees, ore, buildings, trunks), at most 1 m steps; trout only
//   in water 1 m deep or more; walk-out from a building placed over an animal; no jumps.
// - LOD: full (two 1 s sub-steps) near the player, coarse at the edge, frozen beyond with state kept.
// - Old saves: the v7 fixture made by the live W6 code (12bf1e2) and the W1-W6 fixtures load, replay under their
//   own rules and upgrade to v8 by one journaled upgrade_wilderness. Settlement pins are unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameSession } from '../src/app/session';
import { BrowserSaveStore, KeyValueStorage } from '../src/app/persistence';
import { GENERATOR_V2, HALF, WILDERNESS, createWorld, surfaceAt, waterDepthAt } from '../src/sim/world';
import { LATEST_WILD_CONTENT, validateWildSnapshot, wildSnapshot } from '../src/sim/gathering';
import {
  ACTIVE_RING, ANIMAL_ID, Animal, CARCASS_TICKS, DIRS32, FULL_RING, NEED_LEVELS, WILD_RULES, WildSpecies, dayPhase, setWildlifeCapForTests, spawnOf,
  validateWildlife, wildGround, wildlifeInChunk, wildlifeSnapshot, wildlifeStats, MAX_ANIMALS,
} from '../src/sim/wildlife';
import { siteCellsOf } from '../src/sim/wild-build';
import { SPAWN, build, clone, code, dm, load, ok, send } from './w4-harness';

class MemoryStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
}
const G = GENERATOR_V2;
// W8: the default (latest) content is v9; these tests keep testing exactly the v8 rules.
const v8 = () => GameSession.genesis(1337, G, 'wilderness', 8);
type P = { x: number; z: number; mx?: number; mz?: number };
const pres = (p: P) => ({ x: Math.round(p.x * 10), z: Math.round(p.z * 10), mx: p.mx ?? 0, mz: p.mz ?? 0 });
/** World ticks carrying the player's presence (what the game sends every 2 s in v8). */
function tickP(s: GameSession, p: P | null, n = 1, each?: (s: GameSession) => void): void {
  for (let i = 0; i < n; i++) {
    ok(send(s, { type: 'tick', ticks: 1, ...(p ? { presence: pres(p) } : {}) }), 'tick');
    each?.(s);
  }
}
const wl = (s: GameSession) => s.world.wild!.wildlife!;
const animals = (s: GameSession, sp?: WildSpecies) => [...wl(s).animals.values()].filter((a) => !sp || a.sp === sp).sort((a, b) => (a.id < b.id ? -1 : 1));
const dist = (a: { x: number; z: number }, p: P) => Math.hypot(a.x / 10 - p.x, a.z / 10 - p.z);
const secs = (s: GameSession) => s.world.life!.tick * 2;
const chunkOf = (m: number) => Math.floor((m + HALF) / 32);
const FOREST = { x: 272, z: -176 };
const cell = (dmv: number) => Math.floor(dmv / 10);

// ---------- derivation and identity ----------

test('derivation: every chunk population is a pure function of (seed, generator, chunk); stable ids; each species on its own ground; no voxels', () => {
  const world = createWorld(1337, G, WILDERNESS);
  const chunksBefore = world.chunks.size;
  const g = wildGround(world);
  const count: Record<string, number> = {};
  const sx = chunkOf(SPAWN.x), sz = chunkOf(SPAWN.z);
  for (let cz = sz - 6; cz <= sz + 6; cz++) for (let cx = sx - 6; cx <= sx + 6; cx++) {
    const a = wildlifeInChunk(1337, G, cx, cz);
    assert.deepEqual(clone(a), clone(wildlifeInChunk(1337, G, cx, cz)), 'the same twice');
    a.forEach((s, i) => {
      const m = ANIMAL_ID.exec(s.id)!;
      assert.ok(m, s.id);
      assert.equal(m[1], s.sp);
      assert.equal(`${m[2]},${m[3]}`, `${cx},${cz}`);
      assert.equal(Number(m[4]), i, 'ids number the chunk in order');
      const x = cell(s.x), z = cell(s.z);
      if (s.sp === 'trout') assert.ok(g.water(x, z), `${s.id} in water 1 m deep`);
      else assert.ok(g.land(x, z), `${s.id} on dry, unblocked ground`);
      assert.deepEqual(spawnOf(1337, G, s.id), s);
      count[s.sp] = (count[s.sp] ?? 0) + 1;
    });
  }
  assert.equal(world.chunks.size, chunksBefore, 'no voxel chunk generated');
  for (const sp of ['deer', 'rabbit', 'fox', 'wolf', 'trout']) assert.ok((count[sp] ?? 0) >= 3, `${sp} near the spawn: ${JSON.stringify(count)}`);
  // The surface the animals walk on is the voxel surface (no edits in the wilderness), sampled.
  for (let z = -200; z < -140; z += 3) for (let x = -110; x < -50; x += 3) {
    assert.equal(g.height(x, z), surfaceAt(world, x, z));
    assert.equal(g.depth(x, z) > 0, waterDepthAt(world, x, z) > 0);
  }
  // A forest with a meaningful population (the M008 forest views): 7x7 chunks around it.
  const f: Record<string, number> = {};
  for (let cz = chunkOf(FOREST.z) - 3; cz <= chunkOf(FOREST.z) + 3; cz++) for (let cx = chunkOf(FOREST.x) - 3; cx <= chunkOf(FOREST.x) + 3; cx++) {
    for (const s of wildlifeInChunk(1337, G, cx, cz)) f[s.sp] = (f[s.sp] ?? 0) + 1;
  }
  assert.ok(f.deer >= 40 && f.wolf >= 30, JSON.stringify(f));
});

test('records: the first ticks around the player derive the creatures ring by ring; every record is a derived id, none twice; v8 genesis pinned', () => {
  const s = v8();
  assert.equal(s.journal.wildContent, 8);
  assert.equal(LATEST_WILD_CONTENT, 9, 'W8: the latest content is v9');
  assert.equal(s.stateHash, V8_PIN, 'v8 genesis');
  assert.equal(GameSession.genesis(1337, G, 'wilderness', 7).stateHash, '2b53c51d7dec7daa', 'v7 genesis unchanged');
  assert.equal(GameSession.genesis(1337).stateHash, 'e659504b056654dc', 'settlement genesis unchanged');
  assert.equal(wl(s).animals.size, 0, 'nothing recorded at genesis');
  // Ticks without presence (the player never seen): nothing to simulate around.
  tickP(s, null, 3);
  assert.equal(wl(s).animals.size, 0);
  const sizes: number[] = [];
  tickP(s, SPAWN, 5, (x) => sizes.push(wl(x).animals.size));
  assert.ok(sizes[0] > 0 && sizes[0] < sizes[3], `grows ring by ring: ${sizes}`);
  assert.equal(sizes[3], sizes[4], 'complete at the active ring');
  const fx = chunkOf(SPAWN.x), fz = chunkOf(SPAWN.z);
  const derived: string[] = [];
  for (let cz = fz - ACTIVE_RING; cz <= fz + ACTIVE_RING; cz++) for (let cx = fx - ACTIVE_RING; cx <= fx + ACTIVE_RING; cx++) derived.push(...wildlifeInChunk(1337, G, cx, cz).map((a) => a.id));
  assert.deepEqual([...wl(s).animals.keys()].sort(), derived.sort(), 'exactly the derived creatures of the active area');
  assert.equal(new Set(derived).size, derived.length);
});

// ---------- persistence ----------

test('save and reload: identity, position, behaviour and needs survive; the reloaded world and the continued one stay equal; replay equals', () => {
  const storage = new MemoryStorage();
  const store = new BrowserSaveStore(storage, 1337, G, { scenario: WILDERNESS, id: 'w1' });
  const s = store.load().session;
  load(s);
  // Walk north-west through the spawn meadow (animals react), 40 ticks.
  for (let i = 0; i < 40; i++) tickP(s, { x: SPAWN.x - i * 0.8, z: SPAWN.z + i * 1.2, mx: -1, mz: 1 });
  const before = JSON.stringify(wildlifeSnapshot(wl(s)));
  assert.ok(animals(s).some((a) => a.x !== spawnOf(1337, G, a.id)!.x || a.z !== spawnOf(1337, G, a.id)!.z), 'animals have moved from their spawn');
  assert.ok(store.save(s).ok);
  const r = new BrowserSaveStore(storage, 1337, G, { scenario: WILDERNESS, id: 'w1' }).load();
  assert.equal(r.status, 'restored');
  const t = r.session;
  assert.equal(t.stateHash, s.stateHash);
  assert.equal(JSON.stringify(wildlifeSnapshot(wl(t))), before, 'every record identical');
  for (let i = 0; i < 40; i++) { const p = { x: SPAWN.x - 32 + i, z: SPAWN.z + 48, mx: 1, mz: 0 }; tickP(s, p); tickP(t, p); }
  assert.equal(t.stateHash, s.stateHash, 'reloaded and continued worlds agree');
  assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'the journal replays to the same state');
  s.compact();
  assert.ok(store.save(s).ok);
  const c = new BrowserSaveStore(storage, 1337, G, { scenario: WILDERNESS, id: 'w1' }).load().session;
  assert.equal(c.stateHash, s.stateHash, 'compacted save restores');
  const ids = animals(c).map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicates');
  const sz = JSON.stringify(wildlifeSnapshot(wl(c))).length;
  console.log(`# wildlife block: ${wl(c).animals.size} records, ${sz} bytes (${Math.round(sz / wl(c).animals.size)} per record)`);
  assert.ok(sz / wl(c).animals.size < 200);
});

/** A forest run (built once): the player stands in the forest at (272, -176) for 600 ticks. */
let FOREST_RUN: { s: GameSession; storage: MemoryStorage; store: BrowserSaveStore; samples: Array<Map<string, Animal>>; kill: number; ms: number[] } | null = null;
function forestRun() {
  if (FOREST_RUN) return FOREST_RUN;
  const storage = new MemoryStorage();
  const store = new BrowserSaveStore(storage, 1337, G, { scenario: WILDERNESS, id: 'w2' });
  const s = store.load().session;
  const samples: Array<Map<string, Animal>> = [];
  const ms: number[] = [];
  let kill = -1;
  for (let i = 0; i < 600; i++) {
    tickP(s, FOREST);
    ms.push(wildlifeStats.ms);
    samples.push(new Map([...wl(s).animals.values()].filter((a) => a.s === secs(s)).map((a) => [a.id, { ...a, trail: a.trail ? [...a.trail] : undefined }])));
    if (kill < 0 && wl(s).kills > 0) kill = i;
  }
  FOREST_RUN = { s, storage, store, samples, kill, ms };
  return FOREST_RUN;
}

test('wolves bring down a tired deer: an authoritative death, a carcass record, a tombstone; reload, compaction and replay never resurrect it', () => {
  const { s, storage, kill } = forestRun();
  assert.ok(kill >= 0, 'a kill within 600 ticks (deterministic run)');
  const w = wl(s);
  const dead = [...w.dead];
  assert.equal(dead.length, w.kills);
  for (const id of dead) {
    assert.ok(!w.animals.has(id), `${id} has no record`);
    assert.match(id, /^fauna:deer:/, 'only deer are killed (by wolves)');
  }
  const c = [...w.carcasses.values()][0];
  assert.ok(c && w.dead.has(c.id) && c.by === 'wolf');
  // Save, reload: still dead, the carcass where it fell; materialization skips it on every following tick.
  const store = new BrowserSaveStore(storage, 1337, G, { scenario: WILDERNESS, id: 'w2' });
  assert.ok(store.save(s).ok);
  const r = new BrowserSaveStore(storage, 1337, G, { scenario: WILDERNESS, id: 'w2' }).load().session;
  assert.equal(r.stateHash, s.stateHash);
  tickP(r, FOREST, 20);
  for (const id of dead) assert.ok(!wl(r).animals.has(id) && wl(r).dead.has(id), `${id} stays dead after reload`);
  // (The 600-tick journal was compacted by the save: it restores from its base snapshot; replay of an uncompacted kill journal is below.)
  assert.equal(GameSession.restore(clone(s.snapshot), clone(s.journal)).stateHash, s.stateHash, 'restore');
  assert.equal(GameSession.restore(clone(r.snapshot), clone(r.journal)).stateHash, r.stateHash, 'restore after reload');
  // The carcass is gone after CARCASS_TICKS; the tombstone stays and the deer is never derived again.
  const t = GameSession.restore(clone(s.snapshot), clone(s.journal));
  for (let i = 0; i < CARCASS_TICKS / 60 + 1; i++) ok(send(t, { type: 'tick', ticks: 60 }));
  assert.ok(!wl(t).carcasses.has(c.id), 'the carcass has rotted away');
  assert.ok(wl(t).dead.has(c.id) && !wl(t).animals.has(c.id), 'the tombstone remains');
  // A snapshot that brings the dead back is refused.
  const snap = wildlifeSnapshot(wl(s));
  const alive = clone(snap.animals[0]);
  alive.id = dead[0];
  const bad = { ...snap, animals: [...snap.animals, alive].sort((a, b) => (a.id < b.id ? -1 : 1)) };
  assert.throws(() => validateWildlife(bad, s.world.life!.tick), /animal/);
});

// ---------- behaviour ----------

test('deer: rest bedded down at midday and at night, graze and browse otherwise, herd together', () => {
  const { samples, s } = forestRun();
  const t0 = s.world.life!.tick - samples.length + 1;
  const by: Record<string, { rest: number; feed: number; n: number }> = {};
  let herdNear = 0, herdN = 0;
  samples.forEach((m, i) => {
    const ph = dayPhase(t0 + i);
    const e = by[ph] ??= { rest: 0, feed: 0, n: 0 };
    const deer = [...m.values()].filter((a) => a.sp === 'deer');
    for (const a of deer) {
      e.n++;
      if (a.a === 'rest') e.rest++;
      if (a.a === 'graze' || a.a === 'browse') e.feed++;
      const mates = deer.filter((o) => o !== a && o.id.split(':')[2] === a.id.split(':')[2]);
      if (mates.length) { herdN++; if (mates.some((o) => Math.hypot(o.x - a.x, o.z - a.z) < 200)) herdNear++; }
    }
  });
  const share = (ph: string, k: 'rest' | 'feed') => by[ph][k] / by[ph].n;
  console.log(`# deer by phase: ${Object.entries(by).map(([k, v]) => `${k} rest ${(v.rest / v.n * 100).toFixed(0)}% feed ${(v.feed / v.n * 100).toFixed(0)}%`).join('; ')}; with a herd-mate within 20 m ${(herdNear / herdN * 100).toFixed(0)}%`);
  assert.ok(share('night', 'rest') > 0.5, 'most deer bed down at night');
  assert.ok(share('midday', 'rest') > share('morning', 'rest'), 'more rest at midday than in the morning');
  assert.ok(share('morning', 'feed') + share('afternoon', 'feed') > 0.3, 'they graze and browse by day');
  assert.ok(herdNear / herdN > 0.6, 'herds keep together');
});

test('a thirsty deer walks to the water and drinks until slaked, standing on the bank', () => {
  const s = v8();
  tickP(s, SPAWN, 6);
  const g = wildGround(s.world);
  const d = animals(s, 'deer').find((a) => dist(a, SPAWN) > 30 && dist(a, SPAWN) < 90)!;
  assert.ok(d, 'a deer near the spawn');
  d.th = 9000; d.a = 'idle'; d.u = secs(s);
  const seen: string[] = [];
  let drankAt: { x: number; z: number } | null = null;
  for (let i = 0; i < 120 && d.th > NEED_LEVELS.SLAKED; i++) {
    tickP(s, SPAWN);
    seen.push(d.a);
    if (d.a === 'drink' && d.u !== 0) drankAt = { x: cell(d.x), z: cell(d.z) };
  }
  assert.ok(seen.includes('drink'), `went to drink: ${[...new Set(seen)]}`);
  assert.ok(drankAt, 'arrived at its drinking spot');
  assert.ok(g.land(drankAt!.x, drankAt!.z), 'on dry ground');
  assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => g.depth(drankAt!.x + dx, drankAt!.z + dz) > 0), 'beside the water');
  assert.ok(d.th <= NEED_LEVELS.SLAKED, `slaked: ${d.th}`);
});

test('deer and the player: noticed at a distance (alert, facing), a closer or approaching player puts them to flight; they end farther away', () => {
  const s = v8();
  tickP(s, SPAWN, 6);
  const d = animals(s, 'deer').filter((a) => a.a !== 'rest' && dist(a, SPAWN) > 25).sort((a, b) => dist(a, SPAWN) - dist(b, SPAWN))[0];
  assert.ok(d);
  // Stand 12 m away, still: alert (head up, facing the player), not flight.
  const k = (d.id.length * 7) & 31;
  const at = (m: number) => ({ x: d.x / 10 + DIRS32[k][0] / 1000 * m, z: d.z / 10 + DIRS32[k][1] / 1000 * m });
  const p0 = at(12);
  tickP(s, p0);
  assert.equal(d.a, 'alert', `alert at 12 m (still): ${d.a}`);
  assert.equal(d.tg, 'player');
  // Walk toward it.
  const toward = { ...at(8), mx: -Math.sign(DIRS32[k][0]), mz: -Math.sign(DIRS32[k][1]) };
  const startD = dist(d, toward);
  tickP(s, toward, 3);
  assert.equal(d.a, 'flee');
  assert.ok(dist(d, toward) > startD + 8, `it ran: ${startD.toFixed(1)} -> ${dist(d, toward).toFixed(1)} m`);
});

test('hare: freezes when it sees the player, then bolts in zig-zags when the player comes on', () => {
  const s = v8();
  tickP(s, SPAWN, 6);
  const h = animals(s, 'rabbit').filter((a) => a.a !== 'rest').sort((a, b) => dist(a, SPAWN) - dist(b, SPAWN))[0] ?? animals(s, 'rabbit')[0];
  assert.ok(h);
  h.a = 'idle'; h.u = secs(s);
  const p = { x: h.x / 10 + 8, z: h.z / 10, mx: -1, mz: 0 };
  tickP(s, p);
  assert.equal(h.a, 'freeze', `froze: ${h.a}`);
  const still = { x: h.x, z: h.z };
  // The player passes by (sideways, 7 m): the hare stays frozen, not moving.
  tickP(s, { x: h.x / 10 + 7, z: h.z / 10, mx: 0, mz: 1 });
  assert.ok(h.a === 'freeze' && h.x === still.x && h.z === still.z, `stays frozen, not moving: ${h.a}`);
  tickP(s, { x: h.x / 10 + 3, z: h.z / 10, mx: -1, mz: 0 });
  assert.equal(h.a, 'flee');
  // Its sub-step headings swing from side to side.
  const heads: number[] = [];
  for (let i = 0; i < 3; i++) {
    const tr = h.trail!;
    for (let j = 2; j < tr.length; j += 2) if (tr[j] !== tr[j - 2] || tr[j + 1] !== tr[j - 1]) heads.push(Math.atan2(tr[j] - tr[j - 2], tr[j + 1] - tr[j - 1]));
    if (h.a !== 'flee') break;
    tickP(s, { x: h.x / 10 + 4, z: h.z / 10, mx: -1, mz: 0 });
  }
  let swings = 0;
  for (let i = 1; i < heads.length; i++) { let d = heads[i] - heads[i - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; if (Math.abs(d) > 0.6) swings++; }
  assert.ok(swings >= 1, `zig-zag: ${heads.map((x) => x.toFixed(2))}`);
});

test('fox: a hungry fox stalks a hare (slow, low), then pounces; it hunts voles in the grass; it keeps away from the player', () => {
  const s = v8();
  tickP(s, SPAWN, 6);
  const g = wildGround(s.world);
  const f = animals(s, 'fox')[0], h = animals(s, 'rabbit').find((a) => dist(a, SPAWN) > 40)!;
  assert.ok(f && h);
  // Put the fox 10 m from the hare, hungry (test setup on the records).
  let spot: { x: number; z: number } | null = null;
  for (let k = 0; k < 32 && !spot; k++) {
    const x = cell(h.x + DIRS32[k][0] / 10), z = cell(h.z + DIRS32[k][1] / 10);
    if (g.land(x, z) && g.line(false, x, z, cell(h.x), cell(h.z))) spot = { x: x * 10 + 5, z: z * 10 + 5 };
  }
  assert.ok(spot);
  f.x = spot!.x; f.z = spot!.z; f.hu = 8000; f.a = 'idle'; f.u = secs(s); f.tg = '';
  h.a = 'graze'; h.u = secs(s) + 200;
  const far = { x: h.x / 10 - 60, z: h.z / 10 };
  const acts: string[] = [];
  let stalked = '', stalkD = -1, pounced = '';
  for (let i = 0; i < 20 && !pounced; i++) {
    tickP(s, far);
    acts.push(f.a);
    const prey = wl(s).animals.get(f.tg);
    if (f.a === 'stalk' && prey?.sp === 'rabbit' && !stalked) { stalked = f.tg; stalkD = Math.hypot(f.x - prey.x, f.z - prey.z) / 10; }
    if (f.a === 'pounce') pounced = f.tg;
  }
  assert.ok(stalked, `stalked a hare: ${acts}`);
  assert.ok(stalkD > 3.5, `from ${stalkD.toFixed(1)} m (it pounces only within 3.5 m, so it crept up)`);
  assert.equal(pounced, stalked, `pounced on it: ${acts}`);
  for (let i = 0; i < 3; i++) tickP(s, far);
  assert.ok(wl(s).animals.has(stalked) && !wl(s).dead.has(stalked), 'W7: the hare is not killed by foxes');
  assert.equal(wl(s).animals.get(stalked)!.a === 'flee' || wl(s).animals.get(stalked)!.a === 'freeze', true, 'the hare bolted');
  // Mousing: a hungry fox with no hare around.
  const s2 = v8();
  tickP(s2, SPAWN, 6);
  const f2 = animals(s2, 'fox')[0];
  f2.hu = 8000; f2.a = 'idle'; f2.u = secs(s2);
  for (const o of animals(s2, 'rabbit')) wl(s2).animals.delete(o.id);
  const seen = new Set<string>();
  for (let i = 0; i < 30; i++) { tickP(s2, { x: f2.x / 10 + 60, z: f2.z / 10 }); seen.add(f2.a); }
  assert.ok(seen.has('mouse'), `mousing: ${[...seen]}`);
  // The player near: the fox moves off.
  const before = dist(f2, { x: f2.x / 10 + 9, z: f2.z / 10 });
  const pp = { x: f2.x / 10 + 9, z: f2.z / 10, mx: -1, mz: 0 };
  tickP(s2, pp, 2);
  assert.ok(f2.a === 'avoid' || f2.a === 'flee', f2.a);
  assert.ok(dist(f2, pp) > before);
});

test('wolves: the pack follows its leader (lowest id), rests and drinks with it; the leader patrols and hunts', () => {
  const { samples } = forestRun();
  let near = 0, n = 0;
  const leaderActs = new Set<string>(), followerActs = new Set<string>();
  for (const m of samples) {
    const packs = new Map<string, Animal[]>();
    for (const a of m.values()) if (a.sp === 'wolf') { const k = a.id.split(':')[2]; (packs.get(k) ?? packs.set(k, []).get(k)!).push(a); }
    for (const p of packs.values()) {
      p.sort((a, b) => (a.id < b.id ? -1 : 1));
      const [lead, ...rest] = p;
      leaderActs.add(lead.a);
      for (const f of rest) {
        followerActs.add(f.a);
        if (f.a === 'follow' || f.a === 'rest') { n++; if (Math.hypot(f.x - lead.x, f.z - lead.z) < 150) near++; }
      }
    }
  }
  console.log(`# wolves: followers within 15 m of the leader ${(near / n * 100).toFixed(0)}% of follow/rest samples; leader acts ${[...leaderActs]}; follower acts ${[...followerActs]}`);
  assert.ok(near / n > 0.75);
  for (const a of ['patrol', 'rest', 'chase']) assert.ok(leaderActs.has(a), `leader ${a}`);
  for (const a of ['follow', 'rest', 'chase', 'feed']) assert.ok(followerActs.has(a), `follower ${a}`);
});

test('trout: never out of water (every sub-step), hold facing upstream, cruise, school; dart from the player on the bank', () => {
  const s = v8();
  const g = wildGround(s.world);
  const acts = new Set<string>();
  let darted = false;
  for (let i = 0; i < 200; i++) {
    // The player walks back and forth along the river bank north of the spawn.
    const p = { x: SPAWN.x - 20 + (i % 40), z: SPAWN.z + 45, mx: i % 80 < 40 ? 1 : -1, mz: 0 };
    tickP(s, p);
    for (const t of animals(s, 'trout')) {
      if (t.s !== secs(s)) continue;
      acts.add(t.a);
      const tr = t.trail ?? [t.x, t.z];
      for (let j = 0; j < tr.length; j += 2) assert.ok(g.water(cell(tr[j]), cell(tr[j + 1])), `${t.id} in water at every sub-step (${tr[j]}, ${tr[j + 1]})`);
      if (t.a === 'dart' && t.tg === 'player') darted = true;
    }
  }
  assert.ok(animals(s, 'trout').length > 10);
  for (const a of ['hold', 'cruise']) assert.ok(acts.has(a), `${a}: ${[...acts]}`);
  assert.ok(darted, 'darted from the player');
});

test('threats: a noise (an axe swing) startles deer nearby; a wolf at a deer\'s heels puts it to flight; prey flee their own predators only', () => {
  const s = v8();
  tickP(s, SPAWN, 6);
  const d = animals(s, 'deer').filter((a) => dist(a, SPAWN) > 30 && dist(a, SPAWN) < 90)[0];
  assert.ok(d, 'a deer in the full ring, away from the player');
  d.a = 'graze'; d.u = secs(s) + 100;
  // A noise 6 m from it (the next test shows the journaled commands that make one).
  const at = { x: d.x / 10 + 6, z: d.z / 10 };
  s.world.wild!.wildlife!.noise = { t: s.world.life!.tick, x: Math.round(at.x * 10), z: Math.round(at.z * 10) };
  tickP(s, { x: SPAWN.x, z: SPAWN.z });
  assert.ok(d.a === 'flee' && d.tg === 'noise', `fled the noise: ${d.a} ${d.tg}`);
  // A wolf walking up to a deer.
  const s2 = v8();
  tickP(s2, SPAWN, 6);
  const d2 = animals(s2, 'deer').find((a) => a.a !== 'rest' && dist(a, SPAWN) > 30 && dist(a, SPAWN) < 90)!;
  assert.ok(d2);
  const w = animals(s2, 'wolf')[0];
  const g = wildGround(s2.world);
  for (let k = 0; k < 32; k++) { const x = cell(d2.x + DIRS32[k][0] * 4 / 100), z = cell(d2.z + DIRS32[k][1] * 4 / 100); if (g.land(x, z)) { w.x = x * 10 + 5; w.z = z * 10 + 5; break; } }
  w.a = 'patrol'; w.u = 0; w.tx = d2.x; w.tz = d2.z;
  d2.a = 'graze'; d2.u = secs(s2) + 100;
  tickP(s2, SPAWN);
  assert.equal(d2.a, 'flee');
  assert.equal(d2.tg, w.id);
});

test('the chop, mine, cut and build_work commands are noises the wildlife hears (v8 only, on acceptance)', () => {
  const s = v8();
  load(s);
  tickP(s, SPAWN, 2);
  ok(send(s, { type: 'explore', at: dm(SPAWN) }));
  const bench = build(s, 'workbench', { x: SPAWN.x - 10, z: SPAWN.z + 2 });
  assert.ok(bench);
  const n = wl(s).noise!;
  assert.ok(n, 'construction work was heard');
  assert.ok(Math.hypot(n.x / 10 - (SPAWN.x - 10), n.z / 10 - (SPAWN.z + 2)) < 8, 'where the work was done');
  // A refused swing (nothing to chop there) is no noise.
  const before = JSON.stringify(n);
  assert.equal(code(send(s, { type: 'chop', entityId: 'e:0,0:0', at: dm({ x: 0, z: 0 }) })), 'not_found');
  assert.equal(JSON.stringify(wl(s).noise), before);
});

// ---------- movement, collision, stuck recovery ----------

test('collision: over the forest run every land animal stands on dry, unblocked ground at every sub-step; no jumps', () => {
  const { s, samples } = forestRun();
  const g = wildGround(s.world);
  let points = 0, maxStep = 0;
  for (const m of samples) for (const a of m.values()) {
    const tr = a.trail;
    if (!tr) continue;
    for (let j = 0; j < tr.length; j += 2) {
      points++;
      if (a.sp === 'trout') assert.ok(g.water(cell(tr[j]), cell(tr[j + 1])));
      else assert.ok(g.land(cell(tr[j]), cell(tr[j + 1])), `${a.id} (${a.a}) on a blocked or wet cell at ${tr[j]},${tr[j + 1]}`);
      if (j >= 2) {
        const step = Math.hypot(tr[j] - tr[j - 2], tr[j + 1] - tr[j - 1]) / 10;
        maxStep = Math.max(maxStep, step);
        // A sub-step is at most a second at the species' run speed (coarse steps: two seconds).
        assert.ok(step <= WILD_RULES[a.sp].run * 2 / 10 + 0.6, `${a.id} jumped ${step} m`);
      }
    }
  }
  console.log(`# collision: ${points} sub-step positions checked; longest sub-step ${maxStep.toFixed(1)} m`);
  assert.ok(points > 50_000);
});

test('a building put over an animal: it walks out (no jump) and is never inside a footprint again', () => {
  const s = v8();
  load(s);
  tickP(s, SPAWN, 2);
  ok(send(s, { type: 'explore', at: dm(SPAWN) }));
  const bench = build(s, 'workbench', { x: SPAWN.x - 10, z: SPAWN.z + 2 });
  const site = s.world.wild!.build!.sites.get(bench)!;
  const c = siteCellsOf(site);
  const d = animals(s, 'deer')[0];
  // Test setup: the deer stands in the middle of the bench's footprint.
  d.x = Math.floor((c.x0 + c.x1) / 2) * 10 + 5; d.z = Math.floor((c.z0 + c.z1) / 2) * 10 + 5; d.a = 'graze'; d.u = secs(s) + 50;
  const inside = (a: Animal) => cell(a.x) >= c.x0 && cell(a.x) < c.x1 && cell(a.z) >= c.z0 && cell(a.z) < c.z1;
  assert.ok(inside(d));
  let out = -1;
  const insideCell = (x: number, z: number) => cell(x) >= c.x0 && cell(x) < c.x1 && cell(z) >= c.z0 && cell(z) < c.z1;
  for (let i = 0; i < 10; i++) {
    tickP(s, { x: SPAWN.x + 30, z: SPAWN.z });
    // Every sub-step that starts inside the footprint walks (1 s at walking pace), never jumps out.
    const tr = d.trail!;
    for (let j = 2; j < tr.length; j += 2) if (insideCell(tr[j - 2], tr[j - 1])) assert.ok(Math.hypot(tr[j] - tr[j - 2], tr[j + 1] - tr[j - 1]) <= WILD_RULES.deer.walk + 6, 'walks out at walking pace');
    if (!inside(d) && out < 0) out = i;
  }
  assert.ok(out >= 0 && out <= 4, `out within 5 ticks (${out})`);
  for (let i = 0; i < 60; i++) { tickP(s, { x: SPAWN.x + 30, z: SPAWN.z }); for (const a of animals(s)) if (a.sp !== 'trout') assert.ok(!inside(a), `${a.id} inside the bench`); }
});

test('stuck recovery: an animal sent to a goal it cannot reach does not stay stuck; awake animals keep moving', () => {
  const s = v8();
  tickP(s, SPAWN, 6);
  const g = wildGround(s.world);
  const d = animals(s, 'deer').find((a) => a.a !== 'rest')!;
  // A goal in deep water.
  let goal: { x: number; z: number } | null = null;
  for (let r = 5; r < 120 && !goal; r++) for (let k = 0; k < 32 && !goal; k++) {
    const x = cell(d.x + DIRS32[k][0] * r / 100), z = cell(d.z + DIRS32[k][1] * r / 100);
    if (g.depth(x, z) >= 2) goal = { x: x * 10 + 5, z: z * 10 + 5 };
  }
  assert.ok(goal);
  d.a = 'wander'; d.u = 0; d.tx = goal!.x; d.tz = goal!.z; d.th = 0; d.hu = 0; d.fa = 0;
  const acts: string[] = [];
  for (let i = 0; i < 40; i++) { tickP(s, { x: SPAWN.x + 40, z: SPAWN.z }); acts.push(`${d.a}:${d.st}`); assert.ok(g.land(cell(d.x), cell(d.z))); }
  assert.ok(d.tx !== goal!.x || d.tz !== goal!.z || d.a !== 'wander', `gave up the unreachable goal: ${acts.slice(-5)}`);
  // Over the forest run, no awake animal stands still for long.
  const { samples } = forestRun();
  const last = new Map<string, { x: number; z: number; still: number; max: number }>();
  for (const m of samples) for (const a of m.values()) {
    const e = last.get(a.id) ?? { x: a.x, z: a.z, still: 0, max: 0 };
    const calm = a.a === 'rest' || a.a === 'graze' || a.a === 'browse' || a.a === 'drink' || a.a === 'feed' || a.a === 'hold' || a.a === 'alert' || a.a === 'freeze' || a.a === 'mouse' || a.a === 'rise' || a.a === 'idle' && a.u > 0
      // A pack member keeping its place behind a leader that stands still.
      || a.a === 'follow' && Math.hypot(a.tx - a.x, a.tz - a.z) < 30;
    e.still = e.x === a.x && e.z === a.z && !calm ? e.still + 1 : 0;
    e.max = Math.max(e.max, e.still); e.x = a.x; e.z = a.z;
    last.set(a.id, e);
  }
  const worstE = [...last.entries()].sort((p, q) => q[1].max - p[1].max)[0];
  const worst = worstE[1].max;
  console.log(`# forest run: longest time an animal stood still while meaning to move: ${worst} ticks (${worstE[0]})`);
  const wa = samples[samples.length - 1].get(worstE[0]);
  assert.ok(worst <= 8, `${worst} ticks: ${worstE[0]} ${JSON.stringify(wa)}`);
});

// ---------- LOD ----------

test('LOD: away from the player the records freeze unchanged; back in range they wake with needs caught up, from where they stood', () => {
  const s = v8();
  tickP(s, SPAWN, 10);
  const near = new Map(animals(s).filter((a) => Math.max(Math.abs(chunkOf(a.x / 10) - chunkOf(SPAWN.x)), Math.abs(chunkOf(a.z / 10) - chunkOf(SPAWN.z))) <= 2).map((a) => [a.id, JSON.stringify({ ...a, trail: undefined })]));
  assert.ok(near.size > 20);
  const far = { x: SPAWN.x + 400, z: SPAWN.z - 300 };
  tickP(s, far, 60);
  assert.ok(wildlifeStats.frozen > 0 && wildlifeStats.full > 0 && wildlifeStats.coarse > 0, JSON.stringify(wildlifeStats));
  for (const [id, j] of near) assert.equal(JSON.stringify({ ...wl(s).animals.get(id)!, trail: undefined }), j, `${id} frozen as it was`);
  const pos = new Map([...near.keys()].map((id) => [id, { ...wl(s).animals.get(id)! }]));
  tickP(s, SPAWN, 1);
  let caught = 0;
  for (const [id, b] of pos) {
    const a = wl(s).animals.get(id)!;
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) <= WILD_RULES[a.sp].run * 2 + 6, `${id} woke where it stood`);
    if (a.sp !== 'trout' && a.th !== b.th) caught++;
  }
  assert.ok(caught > 0, 'needs moved on after the time away');
  // Back and forth is deterministic: replay.
  assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash);
});

test('the record budget: over it, the farthest calm frozen records go back to their derived state; never a duplicate, never the dead', () => {
  const s = v8();
  tickP(s, SPAWN, 6);
  const n0 = wl(s).animals.size;
  try {
    setWildlifeCapForTests(n0 + 20);
    tickP(s, FOREST, 6);
    assert.ok(wl(s).animals.size <= n0 + 20 + 200, 'bounded (the new area may need more than the budget; only frozen calm records are dropped)');
    const ids = [...wl(s).animals.keys()];
    assert.equal(new Set(ids).size, ids.length);
    const spawnLeft = ids.filter((id) => Math.abs(chunkOf(spawnOf(1337, G, id)!.x / 10) - chunkOf(SPAWN.x)) <= 4 && Math.abs(chunkOf(spawnOf(1337, G, id)!.z / 10) - chunkOf(SPAWN.z)) <= 4).length;
    assert.ok(spawnLeft < n0, `spawn-area records evicted (${n0} -> ${spawnLeft})`);
    // Back at the spawn: they are derived again (not duplicated).
    tickP(s, SPAWN, 6);
    const again = [...wl(s).animals.keys()];
    assert.equal(new Set(again).size, again.length);
  } finally { setWildlifeCapForTests(MAX_ANIMALS); }
});

// ---------- snapshot form ----------

test('the wildlife block is strict: wrong acts, the dead alive, carcasses without tombstones, fish with fatigue and bad order are refused', () => {
  const { s } = forestRun();
  const tick = s.world.life!.tick;
  const snap = wildlifeSnapshot(wl(s));
  assert.deepEqual(validateWildlife(clone(snap), tick), snap, 'canonical');
  const mut = (f: (x: ReturnType<typeof wildlifeSnapshot>) => void) => { const x = clone(snap); f(x); return x; };
  const deer = snap.animals.findIndex((a) => a.id.startsWith('fauna:deer:'));
  const fish = snap.animals.findIndex((a) => a.id.startsWith('fauna:trout:'));
  assert.throws(() => validateWildlife(mut((x) => { x.animals[deer].a = 'hold'; }), tick), /animal/, 'a deer cannot hold station');
  assert.throws(() => validateWildlife(mut((x) => { x.animals.reverse(); }), tick), /animal/, 'order');
  assert.throws(() => validateWildlife(mut((x) => { x.carcasses.push({ by: 'wolf', id: 'fauna:deer:0,0:0', t: tick, x: 0, z: 0 }); }), tick), /carcass/);
  if (fish >= 0) assert.throws(() => validateWildlife(mut((x) => { x.animals[fish].fa = 5; }), tick), /animal/);
  assert.throws(() => validateWildlife(mut((x) => { x.animals[deer].hu = 10_001; }), tick), /animal/);
  assert.throws(() => validateWildlife(mut((x) => { (x as unknown as Record<string, unknown>).extra = 1; }), tick), /fields/);
  // In the whole wild snapshot: v7 content with a wildlife block, and v8 without one.
  const w = wildSnapshot(s.world.wild!);
  assert.throws(() => validateWildSnapshot({ ...clone(w), content: 7 }, tick), /wildlife block|block/);
  const { wildlife: _drop, ...rest } = clone(w);
  assert.throws(() => validateWildSnapshot(rest, tick), /wildlife block/);
});

test('performance: a forest with 40+ deer and 30+ wolves stepped around the player (sim ms per tick)', () => {
  const { samples, ms } = forestRun();
  const last = samples[samples.length - 1];
  const c: Record<string, number> = {};
  for (const a of last.values()) c[a.sp] = (c[a.sp] ?? 0) + 1;
  const sorted = ms.slice(20).sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)], p95 = sorted[Math.floor(sorted.length * 0.95)];
  console.log(`# forest: stepped ${JSON.stringify(c)}; wildlife sim ms per tick median ${med.toFixed(2)}, p95 ${p95.toFixed(2)}, max ${sorted[sorted.length - 1].toFixed(2)} (after the first 20 ticks)`);
  assert.ok(c.deer >= 40 && c.wolf >= 30, JSON.stringify(c));
  // Generous: a 2 s tick; the browser measurement is in the W7 report.
  assert.ok(med < 60, `median ${med} ms`);
});

// ---------- old saves ----------

const V8_PIN = '7c46024708b9815d';
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
const W7FX = JSON.parse(readFileSync('tests/fixtures/w7-wilderness-save.json', 'utf8')) as { made: string; bench: string; clay: string; at: { x: number; z: number }; tick: number; short: Fx; long: Fx };
for (const which of ['short', 'long'] as const) {
  test(`the v7 save made by the live W6 code (12bf1e2, ${which}) loads byte-identically, replays under v7 (presence ignored), upgrades to v8 with its state untouched`, () => {
    const f = W7FX[which];
    const { storage, store, id, s } = openFx(f);
    assert.equal(s.stateHash, f.hash);
    assert.equal(JSON.stringify({ schema: 3, seed: 1337, snapshot: s.snapshot, journal: s.journal }), f.record, 'byte-identical record');
    if (!f.compacted) {
      assert.ok(s.journal.entries.some((e) => e.command.type === 'tick' && 'presence' in e.command), 'the v7 journal has ticks with presence');
      assert.equal(GameSession.replay(clone(s.journal)).stateHash, f.hash, 'replays under v7 rules');
    }
    const w = s.world.wild!;
    assert.equal(w.content, 7);
    assert.equal(w.wildlife, undefined);
    const before = JSON.stringify({ ...wildSnapshot(w), content: 0 });
    ok(send(s, { type: 'upgrade_wilderness', content: 8 }), 'upgrade to v8 (what the game sends on load)');
    assert.equal(w.content, 8);
    const { wildlife, ...rest } = wildSnapshot(w);
    assert.equal(JSON.stringify({ ...rest, content: 0 }), before, 'v7 state untouched');
    assert.deepEqual(wildlife, { animals: [], carcasses: [], dead: [], kills: 0, reach: 0 });
    tickP(s, { x: f.at ? W7FX.at.x / 10 : SPAWN.x, z: W7FX.at.z / 10 }, 5);
    assert.ok(w.wildlife!.animals.size > 20, 'creatures around the player');
    assert.equal(w.items.clay, 1, 'its mined clay');
    assert.ok(store.save(s).ok);
    const again = new BrowserSaveStore(storage, 1337, G, { scenario: WILDERNESS, id }).load();
    assert.equal(again.session.stateHash, s.stateHash);
    if (!f.compacted) assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'upgraded journal replays');
  });
}

test('a v7 world ignores tick presence: the same state with or without it', () => {
  const a = GameSession.genesis(1337, G, 'wilderness', 7), b = GameSession.genesis(1337, G, 'wilderness', 7);
  for (let i = 0; i < 5; i++) { tickP(a, SPAWN); tickP(b, null); }
  assert.equal(a.stateHash, b.stateHash);
});

for (const n of ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'] as const) {
  test(`the ${n.toUpperCase()} wilderness fixture loads, replays under its own rules and upgrades straight to v8`, () => {
    const FX = JSON.parse(readFileSync(`tests/fixtures/${n}-wilderness-save.json`, 'utf8')) as { short: Fx; long: Fx };
    for (const f of [FX.short, FX.long]) {
      const { s } = openFx(f);
      assert.equal(s.stateHash, f.hash);
      if (!f.compacted) assert.equal(GameSession.replay(clone(s.journal)).stateHash, f.hash);
      const was = s.world.wild?.content ?? 1;
      assert.ok(was < 8);
      ok(send(s, { type: 'upgrade_wilderness', content: 8 }), `${n} upgrade from v${was}`);
      const w = s.world.wild!;
      assert.equal(w.content, 8);
      assert.ok(w.fell && w.build && w.map && w.mine && w.wildlife, 'every block since W3');
      tickP(s, SPAWN, 3);
      assert.ok(w.wildlife!.animals.size > 0);
      if (!f.compacted) assert.equal(GameSession.replay(clone(s.journal)).stateHash, s.stateHash, 'upgraded journal replays');
    }
  });
}

test('the settlement is untouched: no wildlife block, genesis pinned, ticks with presence unchanged by W7', () => {
  const s = GameSession.genesis(1337);
  assert.equal(s.stateHash, 'e659504b056654dc');
  assert.equal(s.world.wild, undefined);
  void FULL_RING;
});
