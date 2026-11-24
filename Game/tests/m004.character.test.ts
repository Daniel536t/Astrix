import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERATOR_V2, MAT, createWorld, ensureChunk, hydrologyFor, setVoxel, surfaceAt, worldToChunkX, worldToChunkZ } from '../src/sim/world';
import {
  CharacterState, FIXED_STEP, RUN_SPEED, WALK_SPEED, createCharacter, findStandingY, stepCharacter,
} from '../src/sim/character';

function residentAround(world: ReturnType<typeof createWorld>, x: number, z: number, r = 1) {
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) ensureChunk(world, worldToChunkX(x) + dx, worldToChunkZ(z) + dz);
}

function run(world: ReturnType<typeof createWorld>, s: CharacterState, steps: number, input: Partial<{ moveX: number; moveZ: number; run: boolean; jump: boolean }>) {
  for (let i = 0; i < steps; i++) s = stepCharacter(world, s, { moveX: 0, moveZ: 0, run: false, jump: false, ...input });
  return s;
}

/** A flat 20 x 20 stone pad at y = 30 (top face y = 31), clear above. */
function flatPad() {
  const world = createWorld(1337);
  residentAround(world, 0, 0);
  for (let z = -10; z <= 10; z++) for (let x = -10; x <= 10; x++) {
    for (let y = surfaceAt(world, x, z); y <= 40; y++) setVoxel(world, x, y, z, MAT.AIR);
    setVoxel(world, x, 30, z, MAT.STONE);
  }
  return world;
}

test('character lands, walks and runs at the rule speeds on flat ground', () => {
  const world = flatPad();
  let s = createCharacter(0.5, 33, 0.5);
  s = run(world, s, 30, {});
  assert.equal(s.grounded, true);
  assert.equal(s.y, 31);
  s = run(world, s, 20, { moveZ: 1 });
  assert.ok(Math.abs(s.speed - WALK_SPEED) < 0.2, `walk ${s.speed}`);
  s = run(world, s, 15, { moveZ: 1, run: true });
  assert.ok(Math.abs(s.speed - RUN_SPEED) < 0.3, `run ${s.speed}`);
  assert.equal(s.y, 31, 'stays on the ground');
});

test('character steps up one voxel, is blocked by two, and can jump', () => {
  const world = flatPad();
  for (let z = -10; z <= 10; z++) for (let x = 3; x <= 10; x++) setVoxel(world, x, 31, z, MAT.STONE);
  for (let z = -10; z <= 10; z++) for (let x = 7; x <= 10; x++) { setVoxel(world, x, 32, z, MAT.STONE); setVoxel(world, x, 33, z, MAT.STONE); }
  let s = run(world, createCharacter(0.5, 31, 0.5), 10, {});
  s = run(world, s, 30, { moveX: 1 });
  assert.equal(s.y, 32, 'climbed the one-voxel ledge');
  s = run(world, s, 60, { moveX: 1 });
  assert.ok(s.x < 7 - 0.29, `a two-voxel wall blocks walking (x=${s.x.toFixed(2)})`);
  const grounded = run(world, s, 5, {});
  const jumped = run(world, grounded, 8, { jump: true });
  assert.ok(jumped.y > grounded.y + 0.5, 'jump leaves the ground');
  assert.equal(run(world, jumped, 60, {}).y, grounded.y, 'and lands again');
});

test('movement never generates chunks; unloaded terrain acts as a wall', () => {
  const world = flatPad();
  const before = world.chunks.size;
  let s = run(world, createCharacter(0.5, 31, 0.5), 10, {});
  s = run(world, s, 600, { moveX: 1, run: true });
  assert.equal(world.chunks.size, before, 'no chunk generation during movement');
  assert.ok(s.x < 64 + 0.5, `stops at the resident edge (x=${s.x.toFixed(1)})`);
  assert.equal(findStandingY(world, 900, 900), null);
});

test('stepping is deterministic', () => {
  const world = flatPad();
  const a = run(world, createCharacter(0.5, 33, 0.5), 200, { moveX: 0.6, moveZ: 0.8, run: true });
  const b = run(world, createCharacter(0.5, 33, 0.5), 200, { moveX: 0.6, moveZ: 0.8, run: true });
  assert.deepEqual(a, b);
  assert.ok(FIXED_STEP > 0);
});

test('character swims in the deep mountain river instead of sinking', () => {
  const world = createWorld(1337, GENERATOR_V2);
  const p = hydrologyFor(1337, GENERATOR_V2).upper!.points.find((q) => q.level > 20)!;
  residentAround(world, p.x, p.z);
  const level = Math.round(p.level);
  let s = createCharacter(Math.floor(p.x) + 0.5, level + 0.5, Math.floor(p.z) + 0.5);
  let swam = false;
  for (let i = 0; i < 90; i++) {
    s = run(world, s, 1, {});
    assert.ok(s.y >= surfaceAt(world, Math.floor(s.x), Math.floor(s.z)) - 1e-6, 'never below the bed');
    if (s.mode === 'swim') swam = true;
  }
  // The current carries the swimmer down the stepped cascade, so it can be
  // briefly airborne between pools; it must have floated, not walked the bed.
  assert.ok(swam, 'swam in the river');
});
