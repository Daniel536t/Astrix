// W4 follow-up: a loaded or respawning character always lands on ground it can
// stand on (app/avatar-spawn.ts, sim/character.ts standingSpotNear).
//
// The bug: after a refused drowning, the page saved the avatar at its last dry
// spot, a shore edge at y = 0 whose centre lies over a water cell (the box
// rests on the dry cell beside it). findStandingY looks only under the centre,
// found nothing, and the reloaded page never spawned the character. The avatar
// is player-local: none of this may change a simulation hash.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/app/session';
import { surfaceAt, waterDepthAt } from '../src/sim/world';
import {
  CHARACTER_RADIUS, FIXED_STEP, CharacterState, createCharacter, findStandingY, settlementHits, standProblemAt, stepCharacter,
} from '../src/sim/character';
import { SAVED_SEARCH_M, planAvatarSpawn, planLanding } from '../src/app/avatar-spawn';
import { buildingHits, spawnPoint } from '../src/sim/wild-build';
import { wildernessSpawn } from '../src/sim/wilderness';
import { SPAWN, build, code, dm, load, ok, send, wild } from './w4-harness';

/** The shore south-west of the spawn banner (seed 1337, generator 2): open water to the south-west. */
const SHORE = { x: -170.5, z: -215.5 };
const spawnOf = (s: GameSession) => wildernessSpawn(s.world.seed, s.world.params.generatorVersion);

/** Walk from the shore into the water, diving, until the character drowns (the movement rules only). */
function drown(s: GameSession, dir: [number, number]): CharacterState {
  let c = createCharacter(SHORE.x, surfaceAt(s.world, Math.floor(SHORE.x), Math.floor(SHORE.z)), SHORE.z, 0);
  const n = Math.hypot(dir[0], dir[1]);
  for (let t = 0; t < 200 && !c.dead; t += FIXED_STEP) c = stepCharacter(s.world, c, { moveX: dir[0] / n, moveZ: dir[1] / n, run: false, jump: false, dive: true }, FIXED_STEP);
  assert.ok(c.dead, 'drowned');
  return c;
}
const standable = (s: GameSession, p: { x: number; y: number; z: number }) => standProblemAt(s.world, p.x, p.y, p.z) === null;

test('reproduced from a clean start: a drowning off the shore records a last dry spot findStandingY cannot stand on; the loaded avatar now lands exactly there', () => {
  const s = wild(); load(s, -171, -216); load(s);
  const h0 = s.stateHash;
  for (const dir of [[-1, -1], [-1, 0], [0, -1]] as Array<[number, number]>) {
    const dead = drown(s, dir);
    const safe = dead.safe;
    assert.equal(safe.y, 0, 'the shore edge is at y = 0');
    assert.equal(waterDepthAt(s.world, Math.floor(safe.x), Math.floor(safe.z)) > 0 || waterDepthAt(s.world, Math.floor(safe.x - CHARACTER_RADIUS), Math.floor(safe.z - CHARACTER_RADIUS)) > 0, true, 'part of the body is over a water cell');
    // The old spawn path: nothing under the centre, so the page waited for ever.
    assert.equal(findStandingY(s.world, safe.x, safe.z, safe.y + 2), null, 'the old lookup finds nothing (the bug)');
    assert.equal(findStandingY(s.world, safe.x, safe.z, 110), null);
    // The movement rules did stand there: it is valid ground, so it is kept exactly.
    assert.equal(standProblemAt(s.world, safe.x, safe.y, safe.z), null);
    const plan = planAvatarSpawn(s.world, safe, spawnOf(s));
    assert.deepEqual(plan, { status: 'ok', x: safe.x, y: 0, z: safe.z, source: 'saved', problem: null, moved: 0, note: null }, `dir ${dir}`);
  }
  assert.equal(s.stateHash, h0, 'player-local: no hash changes');
});

test('the refused-death path: the client wakes at the last dry spot, saves it, and a reload spawns there; a refused lean-to wake lands exactly at the recorded spawn point', () => {
  const s = wild(); load(s, -171, -216); load(s);
  const dead = drown(s, [-1, -1]);
  // A death the world cannot record (here: a spot with no water near it) is refused and drops nothing.
  const dry = { x: SPAWN.x, z: SPAWN.z };
  const h0 = s.stateHash;
  assert.equal(code(send(s, { type: 'died', cause: 'drowned', at: dm(dry) })), 'implausible');
  assert.equal(s.stateHash, h0);
  // No recorded death: the client wakes at the last dry spot (explore.ts uses planAvatarSpawn on dead.safe).
  const wake = planAvatarSpawn(s.world, dead.safe, spawnOf(s));
  assert.equal(wake.status, 'ok');
  if (wake.status !== 'ok') return;
  assert.deepEqual({ x: wake.x, y: wake.y, z: wake.z, source: wake.source }, { x: dead.safe.x, y: 0, z: dead.safe.z, source: 'saved' });
  // The page saves that spot (y = 0); a reload of a fresh session from the same journal spawns there, never waits.
  const saved = JSON.parse(JSON.stringify({ x: wake.x, y: wake.y, z: wake.z }));
  const again = GameSession.replay(JSON.parse(JSON.stringify(s.journal)));
  assert.equal(again.stateHash, s.stateHash);
  load(again, -171, -216); load(again);
  const reload = planAvatarSpawn(again.world, saved, spawnOf(again));
  assert.equal(reload.status, 'ok');
  assert.deepEqual(reload.status === 'ok' && { x: reload.x, y: reload.y, z: reload.z }, saved);
  // The same death, reported from the real last dry spot, is recorded now (the rounding fix), and the respawn lands exactly at its outcome.
  const d = ok(send(s, { type: 'died', cause: 'drowned', at: dm(dead.safe) }), 'died at the shore edge');
  assert.equal(d.ok && d.outcome.type, 'died');
  const r = ok(send(s, { type: 'respawn', to: 'spawn' }));
  const out = (r as { outcome: { x: number; z: number } }).outcome;
  assert.deepEqual(out, { ...out, ...spawnPoint(s.world) });
  const land = planLanding(s.world, { x: out.x / 10, z: out.z / 10 }, spawnOf(s));
  assert.equal(land.status, 'ok');
  if (land.status === 'ok') assert.deepEqual({ x: land.x, z: land.z, exact: land.exact, note: land.note }, { x: out.x / 10, z: out.z / 10, exact: true, note: null });
});

test('a saved avatar at a height that is not ground stands on the ground in the same column, and says so', () => {
  const s = wild(); load(s);
  const x = SPAWN.x + 0.3, z = SPAWN.z - 0.2;
  const ground = findStandingY(s.world, x, z, 110)!;
  assert.ok(ground !== null);
  for (const y of [ground - 6, ground + 25, -15]) {
    const p = planAvatarSpawn(s.world, { x, y, z }, spawnOf(s));
    assert.equal(p.status, 'ok');
    if (p.status !== 'ok') continue;
    assert.deepEqual({ x: p.x, y: p.y, z: p.z, source: p.source, moved: p.moved }, { x, y: ground, z, source: 'saved_ground', moved: 0 }, `saved y ${y}`);
    assert.ok(p.problem && p.note && /not ground/.test(p.note), p.note ?? '');
    assert.ok(standable(s, p));
  }
  // The exact saved height is kept when it is standable.
  const keep = planAvatarSpawn(s.world, { x, y: ground, z }, spawnOf(s));
  assert.deepEqual(keep.status === 'ok' && [keep.source, keep.y, keep.note], ['saved', ground, null]);
  // No saved avatar: the spawn banner's spot.
  const fresh = planAvatarSpawn(s.world, null, spawnOf(s));
  assert.deepEqual(fresh.status === 'ok' && [fresh.source, fresh.x, fresh.z], ['spawn', spawnOf(s).x + 0.5, spawnOf(s).z + 0.5]);
});

test('a saved avatar inside water lands on the nearest dry ground within reach, else at the spawn banner, and says so', () => {
  const s = wild(); load(s, -171, -216); load(s, -190, -235); load(s);
  const h0 = s.stateHash;
  // Two metres deep, a few metres from the shore.
  const wet = { x: -175.5, y: -2, z: -219.5 };
  assert.ok(waterDepthAt(s.world, Math.floor(wet.x), Math.floor(wet.z)) >= 2);
  const p = planAvatarSpawn(s.world, wet, spawnOf(s));
  assert.equal(p.status, 'ok');
  if (p.status === 'ok') {
    assert.equal(p.source, 'saved_nearby');
    assert.equal(p.problem, 'water');
    assert.ok(p.moved > 0 && p.moved <= SAVED_SEARCH_M, `moved ${p.moved}`);
    assert.ok(standable(s, p), 'dry, clear ground');
    assert.match(p.note!, /in water/);
  }
  // Far out in the lake: nothing dry within reach, so the spawn banner.
  const lake = { x: -181.5, y: -4, z: -224.5 };
  const q = planAvatarSpawn(s.world, lake, spawnOf(s));
  assert.equal(q.status, 'ok');
  if (q.status === 'ok') {
    assert.ok(q.source === 'spawn' || q.source === 'spawn_nearby', q.source);
    assert.ok(Math.hypot(q.x - (spawnOf(s).x + 0.5), q.z - (spawnOf(s).z + 0.5)) <= 8);
    assert.match(q.note!, /spawn banner/);
    assert.ok(standable(s, q));
  }
  assert.equal(s.stateHash, h0);
});

test('a saved avatar inside a finished building lands outside it; terrain not yet resident waits instead of inventing a spot', () => {
  const s = wild(); load(s);
  const id = build(s, 'workbench', SPAWN);
  const site = s.world.wild!.build!.sites.get(id)!;
  const box = { x: site.x + (site.rot % 2 ? 0.5 : 1), z: site.z + (site.rot % 2 ? 1 : 0.5) };
  assert.ok(buildingHits(s.world, box.x, site.y, box.z, CHARACTER_RADIUS, 1.7).length, 'the saved spot is inside the bench');
  const h0 = s.stateHash;
  const p = planAvatarSpawn(s.world, { x: box.x, y: site.y, z: box.z }, spawnOf(s));
  assert.equal(p.status, 'ok');
  if (p.status === 'ok') {
    assert.equal(p.problem, 'building');
    assert.equal(p.source, 'saved_nearby');
    assert.deepEqual(buildingHits(s.world, p.x, p.y, p.z, CHARACTER_RADIUS, 1.7), []);
    assert.ok(standable(s, p));
    assert.match(p.note!, /building/);
  }
  assert.equal(s.stateHash, h0);
  // A fresh world whose chunks are not resident: pending, at the saved spot.
  const cold = wild();
  assert.deepEqual(planAvatarSpawn(cold.world, { x: 300.5, y: 4, z: 300.5 }, spawnOf(cold)), { status: 'pending', x: 300.5, z: 300.5 });
  assert.deepEqual(planLanding(cold.world, { x: 300.5, z: 300.5 }, spawnOf(cold)), { status: 'pending' });
});

test('the settlement scenario shares the spawn path: a shore-edge avatar spawns, one inside the farmhouse lands outside, and no settlement hash changes', () => {
  const s = GameSession.genesis(1337);
  assert.equal(s.stateHash, 'e659504b056654dc');
  ok(s.dispatch({ schema: 3, id: 'sp:found', expectedRevision: s.world.revision, type: 'found_homestead', rules: 8 } as never), 'found (rules v8: buildings collide)');
  const h = s.world.homestead!;
  load(s, h.anchorX, h.anchorZ);
  const h0 = s.stateHash;
  // Inside the farmhouse (rect anchor -13..-6, -12..-7).
  let inside = { x: h.anchorX - 9.5, z: h.anchorZ - 9.5 }, y = 0;
  for (let dz = 0; dz < 5; dz++) for (let dx = 0; dx < 7; dx++) {
    const q = { x: h.anchorX - 13 + dx + 0.5, z: h.anchorZ - 12 + dz + 0.5 };
    const qy = surfaceAt(s.world, Math.floor(q.x), Math.floor(q.z));
    if (!y && settlementHits(s.world, q.x, qy, q.z).length) { inside = q; y = qy; }
  }
  assert.ok(settlementHits(s.world, inside.x, y, inside.z).length, 'the saved spot is inside the farmhouse');
  const p = planAvatarSpawn(s.world, { ...inside, y }, { x: h.anchorX, z: h.anchorZ });
  assert.equal(p.status, 'ok');
  if (p.status === 'ok') {
    assert.equal(p.problem, 'building');
    assert.deepEqual(settlementHits(s.world, p.x, p.y, p.z), []);
    assert.ok(standable(s, p));
  }
  // A shore edge the movement rules stood on (centre over a water cell), wherever this world has one near the farm.
  let edge: { x: number; y: number; z: number } | null = null;
  for (let d = 2; d < 60 && !edge; d++) for (let a = 0; a < 64 && !edge; a++) {
    const cx = Math.floor(h.anchorX + Math.cos(a / 64 * Math.PI * 2) * d), cz = Math.floor(h.anchorZ + Math.sin(a / 64 * Math.PI * 2) * d);
    if (waterDepthAt(s.world, cx, cz) <= 0 || waterDepthAt(s.world, cx + 1, cz) > 0) continue;
    const q = { x: cx + 1 - 0.2, y: surfaceAt(s.world, cx + 1, cz), z: cz + 0.5 };
    if (standProblemAt(s.world, q.x, q.y, q.z) === null && findStandingY(s.world, q.x, q.z, q.y + 2) === null) edge = q;
  }
  assert.ok(edge, 'a shore edge near the farm');
  const e = planAvatarSpawn(s.world, edge!, { x: h.anchorX, z: h.anchorZ });
  assert.deepEqual(e.status === 'ok' && [e.source, e.x, e.y, e.z], ['saved', edge!.x, edge!.y, edge!.z], 'spawns exactly at the shore edge (findStandingY found nothing there)');
  assert.equal(s.stateHash, h0, 'the avatar is player-local: no settlement hash changes');
});
