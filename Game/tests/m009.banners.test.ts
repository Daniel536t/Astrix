// M009 banners: the home banner at the founding spawn, one movable field
// banner, "Return home" / "Return to banner" onto safe ground after a short
// channel, player-local persistence that leaves world saves byte-identical,
// and the wading double-jump fix found while investigating the stuck-in-a-hole report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERATOR_V2, MAT, World, createWorld, ensureChunk, residentVoxelAt, setVoxel, surfaceAt, worldToChunkX, worldToChunkZ } from '../src/sim/world';
import { CharacterState, canStandAt, createCharacter, overlapsTerrain, stepCharacter } from '../src/sim/character';
import {
  HOME_BANNER_OFFSET, LANDING_MAX_RISE, RETURN_CHANNEL_SECONDS, ReturnChannel, findLanding, homeBannerFor, plantBanner,
} from '../src/sim/banners';
import { BannerStore, bannerKey } from '../src/app/banners';
import { BrowserSaveStore, KeyValueStorage } from '../src/app/persistence';
import { GameSession } from '../src/app/session';
import { BannerView, bannerBlocks, HOME_CLOTH, FIELD_CLOTH } from '../src/render/banners';

const SPAWN = { x: -18, z: -18 };

class MemoryStorage implements KeyValueStorage {
  readonly map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

function residentAround(world: World, x: number, z: number, r = 1) {
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) ensureChunk(world, worldToChunkX(x) + dx, worldToChunkZ(z) + dz);
}

/** A flat 20 x 20 stone pad at y = 30 (top face y = 31), clear above. */
function flatPad(): World {
  const world = createWorld(1337);
  residentAround(world, 0, 0);
  for (let z = -10; z <= 10; z++) for (let x = -10; x <= 10; x++) {
    for (let y = surfaceAt(world, x, z); y <= 40; y++) setVoxel(world, x, y, z, MAT.AIR);
    setVoxel(world, x, 30, z, MAT.STONE);
  }
  return world;
}

function settle(world: World, s: CharacterState, steps = 20): CharacterState {
  for (let i = 0; i < steps; i++) s = stepCharacter(world, s, { moveX: 0, moveZ: 0, run: false, jump: false });
  return s;
}

/** Steps with the given taps (step indices), walking +x. */
function hop(world: World, s: CharacterState, taps: number[], steps = 90): CharacterState {
  for (let i = 0; i < steps; i++) s = stepCharacter(world, s, { moveX: 1, moveZ: 0, run: false, jump: taps.includes(i) });
  return s;
}

/** A 2 x 2 shaft `depth` voxels deep in a 7 x 7 raised block, optionally with `water` voxels of water at the bottom. */
function shaft(world: World, depth: number, water = 0): void {
  for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) for (let k = 1; k <= depth; k++) setVoxel(world, x, 30 + k, z, MAT.STONE);
  for (let z = 0; z <= 1; z++) for (let x = 0; x <= 1; x++) for (let k = 1; k <= depth; k++) setVoxel(world, x, 30 + k, z, k <= water ? MAT.WATER : MAT.AIR);
}

test('the home banner stands beside the founding spawn; planting puts one field banner at the feet and planting again moves it', () => {
  const home = homeBannerFor(SPAWN);
  assert.deepEqual(home, { x: SPAWN.x + 0.5 + HOME_BANNER_OFFSET, z: SPAWN.z + 0.5 });
  const world = flatPad();
  let s = settle(world, createCharacter(2.5, 33, 2.5));
  assert.equal(s.mode, 'ground');
  const first = plantBanner(s);
  assert.ok(first.ok);
  assert.deepEqual(first.banner, { x: 2.5, y: 31, z: 2.5 });

  const storage = new MemoryStorage();
  const store = new BannerStore(storage, 1337, GENERATOR_V2, SPAWN);
  let set = store.load();
  assert.equal(set.field, null, 'no field banner until one is planted');
  set = { ...set, field: first.banner };
  store.save(set);
  s = settle(world, createCharacter(-4.25, 31, 6.75));
  const second = plantBanner(s);
  assert.ok(second.ok);
  set = { ...set, field: second.banner };
  store.save(set);
  const loaded = store.load();
  assert.deepEqual(loaded.field, { x: -4.25, y: 31, z: 6.75 }, 'the second plant moved the one field banner');
  assert.deepEqual(loaded.home, home, 'the home banner never moves');
});

test('a banner cannot be planted in the air, in water or while down', () => {
  const world = flatPad();
  assert.equal(plantBanner(null).ok, false);
  const air = createCharacter(0.5, 35, 0.5);
  assert.equal(stepCharacter(world, air, { moveX: 0, moveZ: 0, run: false, jump: false }).mode, 'air');
  assert.equal(plantBanner(stepCharacter(world, air, { moveX: 0, moveZ: 0, run: false, jump: false })).ok, false);
  // A chest-deep pool: swimming.
  for (let z = -2; z <= 2; z++) for (let x = -2; x <= 2; x++) { setVoxel(world, x, 30, z, MAT.WATER); setVoxel(world, x, 29, z, MAT.WATER); setVoxel(world, x, 28, z, MAT.STONE); }
  const swim = settle(world, createCharacter(0.5, 29, 0.5), 30);
  assert.notEqual(swim.mode, 'ground');
  assert.equal(plantBanner(swim).ok, false);
  const down = { ...settle(world, createCharacter(6.5, 31, 6.5)), dead: true };
  assert.equal(plantBanner(down).ok, false);
});

test('returning lands on safe, dry ground next to the banner, never in voxels or water', () => {
  const world = flatPad();
  // Water around the banner on three sides, a wall on the fourth, a tree trunk nearby.
  const bx = 0.5, bz = 0.5;
  for (let z = -6; z <= 6; z++) for (let x = -6; x <= 6; x++) {
    if (Math.hypot(x + 0.5 - bx, z + 0.5 - bz) < 0.9) continue;
    if (x >= 1) { setVoxel(world, x, 31, z, MAT.STONE); setVoxel(world, x, 32, z, MAT.STONE); setVoxel(world, x, 33, z, MAT.STONE); }
    else if (x > -4) setVoxel(world, x, 30, z, MAT.WATER);
  }
  const land = findLanding(world, bx, bz, 31);
  assert.ok(land.ok, 'found a landing');
  assert.ok(canStandAt(world, land.x, land.y, land.z));
  assert.equal(overlapsTerrain(world, land.x, land.y, land.z), false, 'not inside voxels');
  assert.notEqual(residentVoxelAt(world, Math.floor(land.x), Math.floor(land.y), Math.floor(land.z)), MAT.WATER, 'not in water');
  assert.notEqual(residentVoxelAt(world, Math.floor(land.x), Math.floor(land.y) - 1, Math.floor(land.z)), MAT.WATER, 'not on water');
  assert.ok(Math.hypot(land.x - bx, land.z - bz) <= 5.01, 'next to the banner');
  assert.ok(Math.abs(land.y - 31) <= LANDING_MAX_RISE, 'at the banner level');
  // The landed founder stands still there: nothing pushes or drops them.
  const s = settle(world, createCharacter(land.x, land.y, land.z));
  assert.equal(s.mode, 'ground');
  assert.ok(Math.abs(s.x - land.x) < 1e-6 && Math.abs(s.y - land.y) < 1e-6 && Math.abs(s.z - land.z) < 1e-6);

  // Deterministic: the same world gives the same spot.
  assert.deepEqual(findLanding(world, bx, bz, 31), land);
  // Terrain that is not resident yet: wait for streaming instead of guessing.
  const empty = createWorld(1337);
  assert.deepEqual(findLanding(empty, 0.5, 0.5), { ok: false, reason: 'unloaded' });
});

test('the real home banner on the founding ground (v2 world) has a safe landing', () => {
  const world = createWorld(1337, GENERATOR_V2);
  const home = homeBannerFor(SPAWN);
  residentAround(world, home.x, home.z);
  const land = findLanding(world, home.x, home.z);
  assert.ok(land.ok);
  assert.ok(canStandAt(world, land.x, land.y, land.z));
  assert.ok(Math.hypot(land.x - home.x, land.z - home.z) <= 5.01);
});

test('a founder stuck in a three-voxel hole cannot jump out, and Return home gets them out', () => {
  const world = flatPad();
  shaft(world, 3);
  const s = settle(world, createCharacter(0.5, 31, 0.5));
  for (let tap = 1; tap < 25; tap++) assert.ok(hop(world, s, [0, tap]).x < 2.1, `no double jump timing leaves a 3-deep hole (tap ${tap})`);
  const home = { x: 7.5, z: 7.5 };
  const land = findLanding(world, home.x, home.z);
  assert.ok(land.ok);
  assert.equal(land.y, 31, 'lands on the pad outside the hole');
  assert.ok(Math.hypot(land.x - 0.5, land.z - 0.5) > 4);
});

test('wading in a two-voxel hole: the second jump tap now works from a wading jump (was a trap)', () => {
  const world = flatPad();
  shaft(world, 2, 1);
  const s = settle(world, createCharacter(0.5, 31, 0.5));
  assert.equal(s.mode, 'wade');
  let escapes = 0;
  for (let tap = 1; tap < 25; tap++) if (hop(world, s, [0, tap]).x > 2.5) escapes++;
  assert.ok(escapes >= 3, `several tap timings escape (${escapes})`);
  assert.ok(hop(world, s, [0]).x < 2.1, 'a single wading jump still does not');
});

test('the return channel waits about 1.5 s and moving cancels it', () => {
  assert.ok(RETURN_CHANNEL_SECONDS >= 1 && RETURN_CHANNEL_SECONDS <= 2);
  const c = new ReturnChannel();
  c.start('home', 1000);
  assert.equal(c.update(1000 + RETURN_CHANNEL_SECONDS * 1000 - 1, null), null, 'not yet');
  assert.ok(c.progress(1750) > 0.4 && c.progress(1750) < 0.6);
  assert.deepEqual(c.update(1000 + RETURN_CHANNEL_SECONDS * 1000, null), { type: 'done', target: 'home' });
  assert.equal(c.active, false);
  c.start('field', 5000);
  assert.deepEqual(c.update(5200, 'cancelled: you moved'), { type: 'cancelled', target: 'field', why: 'cancelled: you moved' });
  assert.equal(c.update(9000, null), null, 'a cancelled channel never completes');
});

test('banner persistence round trip, and unreadable records fall back to the derived home banner', () => {
  const storage = new MemoryStorage();
  const a = new BannerStore(storage, 42, GENERATOR_V2, SPAWN);
  assert.ok(a.save({ home: homeBannerFor(SPAWN), field: { x: 120.25, y: 18, z: -340.5 } }));
  const b = new BannerStore(storage, 42, GENERATOR_V2, SPAWN).load();
  assert.deepEqual(b, { home: homeBannerFor(SPAWN), field: { x: 120.25, y: 18, z: -340.5 } });
  // Per seed and generator, like the avatar record.
  assert.equal(new BannerStore(storage, 43, GENERATOR_V2, SPAWN).load().field, null);
  assert.equal(storage.map.has(bannerKey(42, GENERATOR_V2)), true);
  for (const raw of ['{', 'null', '{"v":9}', '{"v":1,"home":{"x":"a","z":0},"field":{"x":1e9,"y":0,"z":0}}']) {
    storage.setItem(bannerKey(42, GENERATOR_V2), raw);
    const set = new BannerStore(storage, 42, GENERATOR_V2, SPAWN).load();
    assert.deepEqual(set, { home: homeBannerFor(SPAWN), field: null }, raw);
  }
  // No storage at all: banners still work for the session.
  const volatile = new BannerStore(null, 42, GENERATOR_V2, SPAWN);
  assert.equal(volatile.save({ home: homeBannerFor(SPAWN), field: null }), false);
  assert.deepEqual(volatile.load().home, homeBannerFor(SPAWN));
});

test('an old world save (no banners) loads with identical bytes and hash and gets the derived home banner', () => {
  const storage = new MemoryStorage();
  const saver = new BrowserSaveStore(storage, 1337, GENERATOR_V2);
  const first = saver.load();
  assert.equal(first.status, 'new');
  const session = first.session;
  const tree = [...session.world.entities.values()].find((e) => e.kind.startsWith('styl_tree') && !e.harvested)!;
  assert.ok(session.dispatch({ schema: 3, id: 'test:harvest', type: 'harvest', entityId: tree.id, expectedRevision: session.world.revision } as never).ok);
  assert.ok(saver.save(session).ok);
  const before = new Map(storage.map);
  const hash = session.stateHash;

  const restored = new BrowserSaveStore(storage, 1337, GENERATOR_V2).load();
  assert.equal(restored.status, 'restored');
  assert.equal(restored.session.stateHash, hash, 'world hash unchanged');
  const banners = new BannerStore(storage, 1337, GENERATOR_V2, SPAWN);
  assert.deepEqual(banners.load(), { home: homeBannerFor(SPAWN), field: null }, 'derived home banner');
  // Planting a banner writes only the banner record; the world save bytes are untouched.
  banners.save({ home: homeBannerFor(SPAWN), field: { x: 1, y: 20, z: 2 } });
  for (const [k, v] of before) assert.equal(storage.map.get(k), v, `world save key ${k} unchanged`);
  assert.deepEqual([...storage.map.keys()].filter((k) => !before.has(k)), [bannerKey(1337, GENERATOR_V2)]);
  assert.ok(![...before.values()].some((v) => v.includes('banner')), 'banners never enter the world save');
  assert.equal(new BrowserSaveStore(storage, 1337, GENERATOR_V2).load().session.stateHash, hash);
});

test('the genesis state hash does not depend on banners', () => {
  const a = GameSession.genesis(1337, GENERATOR_V2).stateHash;
  const storage = new MemoryStorage();
  new BannerStore(storage, 1337, GENERATOR_V2, SPAWN).save({ home: homeBannerFor(SPAWN), field: { x: 3, y: 20, z: 4 } });
  assert.equal(GameSession.genesis(1337, GENERATOR_V2).stateHash, a);
});

test('both banners are one small mesh in two plain colours', () => {
  const view = new BannerView();
  assert.equal(view.mesh.visible, false);
  view.set({ x: 0, y: 10, z: 0 }, null);
  const homeOnly = view.triangles;
  view.set({ x: 0, y: 10, z: 0 }, { x: 8, y: 11, z: 3 });
  assert.equal(view.mesh.visible, true);
  assert.ok(view.triangles > homeOnly && view.triangles <= 150, `${view.triangles} triangles`);
  assert.equal(view.mesh.children.length, 0, 'one mesh, no child draws');
  assert.notEqual(HOME_CLOTH, FIELD_CLOTH);
  const home = bannerBlocks(0, 0, 0, HOME_CLOTH, true), field = bannerBlocks(0, 0, 0, FIELD_CLOTH, false);
  assert.ok(home.some((b) => b.hex === HOME_CLOTH) && field.some((b) => b.hex === FIELD_CLOTH));
  const pole = home.find((b) => b.h > 2)!;
  assert.ok(pole.w <= 0.15, 'a thin pole');
});
