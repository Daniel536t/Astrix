import test from 'node:test';
import assert from 'node:assert/strict';
import { MAT, createWorld, ensureChunk, setVoxel, surfaceAt, worldToChunkX, worldToChunkZ } from '../src/sim/world';
import {
  BREATH_SECONDS, CharacterInput, CharacterState, DROWN_DAMAGE_PER_S, EXHAUSTED_FLOAT_DEPTH, EXHAUSTED_SWIM_SPEED, EYE_HEIGHT,
  FIXED_STEP, FLOAT_DEPTH, MAX_HEALTH, SWIM_STAMINA_SECONDS, WALK_SPEED, createCharacter, respawnCharacter, stepCharacter,
} from '../src/sim/character';

const SURFACE = 35; // water cells 31..34, bank top face at 35
const STEPS_PER_S = Math.round(1 / FIXED_STEP);

/** A 13 x 13 pool, 4 m deep, cut into a stone shelf whose top is level with the water. */
function pool() {
  const world = createWorld(1337);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) ensureChunk(world, worldToChunkX(0) + dx, worldToChunkZ(0) + dz);
  for (let z = -14; z <= 14; z++) for (let x = -14; x <= 14; x++) {
    for (let y = surfaceAt(world, x, z); y <= 45; y++) setVoxel(world, x, y, z, MAT.AIR);
    setVoxel(world, x, 30, z, MAT.STONE);
    const inPool = Math.abs(x) <= 6 && Math.abs(z) <= 6;
    for (let y = 31; y < SURFACE; y++) setVoxel(world, x, y, z, inPool ? MAT.WATER : MAT.STONE);
  }
  return world;
}

function run(world: ReturnType<typeof createWorld>, s: CharacterState, steps: number, input: Partial<CharacterInput> = {}) {
  for (let i = 0; i < steps; i++) s = stepCharacter(world, s, { moveX: 0, moveZ: 0, run: false, jump: false, ...input });
  return s;
}

test('a swimmer at rest floats with head and shoulders out and does not tire (M011)', () => {
  const world = pool();
  let s = createCharacter(0.5, SURFACE - 1, 0.5);
  s = run(world, s, 5 * STEPS_PER_S);
  assert.equal(s.mode, 'swim');
  assert.equal(s.headUnderwater, false, `eye ${s.y + EYE_HEIGHT} vs surface ${SURFACE}`);
  assert.ok(Math.abs(s.y - (SURFACE - FLOAT_DEPTH)) < 0.03, `float line ${SURFACE - s.y}`);
  assert.ok(s.y + EYE_HEIGHT > SURFACE + 0.15 && s.y + EYE_HEIGHT < SURFACE + 0.3, `eye height ${s.y + EYE_HEIGHT}`);
  assert.equal(s.waterSurface, SURFACE);
  assert.equal(s.stamina, 1, 'floating at rest costs no stamina');
  assert.equal(s.breath, 1);
});

test('holding dive goes under; breath runs out after 15 s, then health drains until drowning', () => {
  const world = pool();
  let s = createCharacter(0.5, SURFACE - 1.5, 0.5);
  s = run(world, s, STEPS_PER_S, { dive: true });
  assert.equal(s.headUnderwater, true);
  assert.ok(s.y < SURFACE - EYE_HEIGHT - 0.3);
  // Stay down on the bottom of the 4 m pool.
  s = run(world, s, (BREATH_SECONDS - 2) * STEPS_PER_S, { dive: true });
  assert.ok(s.breath > 0 && s.breath < 0.15, `breath ${s.breath}`);
  assert.equal(s.health, MAX_HEALTH, 'no damage while breath lasts');
  s = run(world, s, 3 * STEPS_PER_S, { dive: true });
  assert.equal(s.breath, 0);
  assert.ok(s.health < MAX_HEALTH && s.health > MAX_HEALTH - 3 * DROWN_DAMAGE_PER_S, `health ${s.health}`);
  assert.ok(s.hurt > 0);
  s = run(world, s, 10 * STEPS_PER_S, { dive: true });
  assert.equal(s.dead, true);
  assert.equal(s.cause, 'drowned');
  assert.equal(s.health, 0);
  const frozen = run(world, s, 30, { moveX: 1, dive: true });
  assert.equal(frozen.x, s.x, 'the dead do not move');
});

test('surfacing refills breath and damage stops', () => {
  const world = pool();
  let s = createCharacter(0.5, SURFACE - 1.5, 0.5);
  s = run(world, s, 17 * STEPS_PER_S, { dive: true });
  assert.ok(s.health < MAX_HEALTH);
  // Rise until the eyes clear the water (still drowning on the way up).
  let up = 0;
  while (s.headUnderwater && up++ < 10 * STEPS_PER_S) s = run(world, s, 1, { rise: true });
  assert.equal(s.headUnderwater, false);
  const surfacedHealth = s.health;
  s = run(world, s, 3 * STEPS_PER_S, { rise: true });
  assert.equal(s.breath, 1);
  assert.equal(s.health, surfacedHealth, 'no drowning damage once the head is above water');
});

test('an exhausted swimmer floats lower and slower, keeps breathing and cannot dive (M011)', () => {
  const world = pool();
  let s = createCharacter(0.5, SURFACE - 1.5, 0.5);
  s = run(world, s, STEPS_PER_S);
  s = { ...s, x: -4.5, stamina: 0 };
  s = run(world, s, 4 * STEPS_PER_S, { moveX: 1, dive: true });
  assert.equal(s.stamina, 0);
  assert.equal(s.headUnderwater, false, `feet ${s.y}`);
  assert.ok(Math.abs(s.y - (SURFACE - EXHAUSTED_FLOAT_DEPTH)) < 0.05, `float line ${SURFACE - s.y}`);
  assert.ok(s.speed <= EXHAUSTED_SWIM_SPEED + 0.05, `speed ${s.speed}`);
  assert.equal(s.breath, 1);
});

test('active swimming tires in about 40 s; resting afloat recovers (M011)', () => {
  const world = pool();
  let s = createCharacter(0.5, SURFACE - 1.5, 0.5);
  s = run(world, s, (SWIM_STAMINA_SECONDS + 1) * STEPS_PER_S, { rise: true });
  assert.equal(s.stamina, 0);
  s = run(world, s, 10 * STEPS_PER_S);
  assert.ok(s.stamina > 0.25 && s.stamina < 0.45, `stamina ${s.stamina}`);
  assert.equal(s.headUnderwater, false);
});

test('a swimmer hauls out onto the bank, keeps a dry respawn point and recovers stamina', () => {
  const world = pool();
  let s = createCharacter(0.5, SURFACE - 1.5, 0.5);
  s = run(world, s, 2 * STEPS_PER_S);
  s = { ...s, stamina: 0.5 };
  const tired = s.stamina;
  s = run(world, s, Math.round(3.5 * STEPS_PER_S), { moveX: 1 }); // swim east and climb the x = 7 bank
  assert.ok(s.x > 7, `x ${s.x}`);
  assert.equal(s.y, SURFACE);
  assert.equal(s.mode, 'ground');
  assert.ok(s.safe.x > 7 && s.safe.y === SURFACE, 'dry footing recorded');
  s = run(world, s, 9 * STEPS_PER_S);
  assert.ok(s.stamina > tired && s.stamina === 1, `stamina ${s.stamina}`);
});

test('a drowned character respawns on its last dry footing with full vitals', () => {
  const world = pool();
  let s = createCharacter(8.5, SURFACE, 0.5);
  s = run(world, s, STEPS_PER_S);
  assert.deepEqual(s.safe, { x: 8.5, y: SURFACE, z: 0.5 });
  s = { ...s, x: 0.5, y: 31, dead: true, health: 0, cause: 'drowned', breath: 0 };
  const r = respawnCharacter(world, s);
  assert.equal(r.dead, false);
  assert.equal(r.health, MAX_HEALTH);
  assert.equal(r.breath, 1);
  assert.equal(r.x, 8.5);
  assert.equal(r.y, SURFACE);
});

test('wading through waist-deep water is slower than walking', () => {
  const world = pool();
  for (let z = -6; z <= 6; z++) for (let x = -6; x <= 6; x++) setVoxel(world, x, 33, z, MAT.STONE); // 1 m deep shelf
  for (let z = -6; z <= 6; z++) for (let x = -6; x <= 6; x++) setVoxel(world, x, 31, z, MAT.STONE);
  for (let z = -6; z <= 6; z++) for (let x = -6; x <= 6; x++) setVoxel(world, x, 32, z, MAT.STONE);
  let s = createCharacter(-4.5, 34, 0.5);
  s = run(world, s, 10);
  s = run(world, s, 25, { moveX: 1 });
  assert.equal(s.mode, 'wade');
  assert.ok(s.speed < WALK_SPEED * 0.85 && s.speed > 1.5, `wade speed ${s.speed}`);
});

test('water physics are deterministic', () => {
  const world = pool();
  const input = { moveX: 0.4, moveZ: 0.7, dive: true };
  const a = run(world, createCharacter(0.5, SURFACE - 1, 0.5), 400, input);
  const b = run(world, createCharacter(0.5, SURFACE - 1, 0.5), 400, input);
  assert.deepEqual(a, b);
});
