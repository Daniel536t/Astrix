// M011: realistic swimming. Buoyant floating at the surface with head and
// shoulders out (breath never drops there), diving as a choice, buoyancy
// bringing the swimmer back up, a stroke / treading / underwater animation.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  LATEST_GENERATOR_VERSION, MAT, World, createWorld, ensureChunk, setVoxel, surfaceAt, waterDepthAt, worldToChunkX, worldToChunkZ,
} from '../src/sim/world';
import {
  CharacterInput, CharacterState, EYE_HEIGHT, FIXED_STEP, FLOAT_DEPTH, MAX_HEALTH, createCharacter, findStandingY, stepCharacter,
} from '../src/sim/character';
import { animateFigure, buildFigure, placeFigure } from '../src/render/characters';
import { WATER_DRAW_DROP } from '../src/render/water';

const SURFACE = 35; // water cells 31..34 over a stone floor at 30; banks level with the water
const HZ = Math.round(1 / FIXED_STEP);

function pool(): World {
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

const input = (i: Partial<CharacterInput> = {}): CharacterInput => ({ moveX: 0, moveZ: 0, run: false, jump: false, ...i });
function run(world: World, s: CharacterState, steps: number, i: Partial<CharacterInput> = {}, each?: (s: CharacterState) => void) {
  for (let k = 0; k < steps; k++) { s = stepCharacter(world, s, input(i)); each?.(s); }
  return s;
}
/** A swimmer settled at the surface of the pool. */
const floating = (world: World) => run(world, createCharacter(0.5, 31, 0.5), 4 * HZ);

test('floating at rest keeps the head above water; breath never drops and refills', () => {
  const world = pool();
  let s = floating(world);
  assert.equal(s.mode, 'swim');
  s = { ...s, breath: 0.4 };
  let last = s.breath, minEye = Infinity, maxEye = -Infinity;
  s = run(world, s, 30 * HZ, {}, (q) => {
    assert.equal(q.headUnderwater, false);
    assert.ok(q.breath >= last, 'breath never drops at the surface');
    last = q.breath;
    const eye = q.y + EYE_HEIGHT - q.waterSurface;
    minEye = Math.min(minEye, eye); maxEye = Math.max(maxEye, eye);
  });
  assert.equal(s.breath, 1, 'refilled');
  assert.equal(s.health, MAX_HEALTH);
  assert.equal(s.stamina, 1);
  // The water line is at the chest: feet FLOAT_DEPTH below the surface, eyes 0.2 m clear.
  assert.ok(minEye > 0.15 && maxEye < 0.3, `eye clearance ${minEye}..${maxEye}`);
  assert.ok(Math.abs(SURFACE - s.y - FLOAT_DEPTH) < 0.03);
});

test('falling in, the swimmer sinks a little, then buoyancy bobs it up to the float line', () => {
  const world = pool();
  let s = run(world, createCharacter(0.5, SURFACE + 2, 0.5), 1);
  let lowest = Infinity;
  s = run(world, s, 6 * HZ, {}, (q) => { lowest = Math.min(lowest, q.y); });
  assert.ok(lowest < SURFACE - FLOAT_DEPTH - 0.2, `plunged to ${lowest}`);
  assert.equal(s.mode, 'swim');
  assert.equal(s.headUnderwater, false);
  assert.ok(Math.abs(SURFACE - s.y - FLOAT_DEPTH) < 0.03, `settled ${SURFACE - s.y}`);
});

test('holding Dive submerges and breath drops; releasing lets buoyancy surface the swimmer', () => {
  const world = pool();
  let s = floating(world);
  s = run(world, s, Math.round(1.5 * HZ), { dive: true });
  assert.equal(s.headUnderwater, true);
  assert.ok(s.y < SURFACE - EYE_HEIGHT - 0.5, `feet ${s.y}`);
  s = run(world, s, 3 * HZ, { dive: true });
  assert.ok(s.breath < 0.8 && s.breath > 0.6, `breath ${s.breath}`);
  const down = s.breath;
  // Release: buoyancy alone brings the head out within a few seconds.
  let t = 0;
  while (s.headUnderwater && t++ < 6 * HZ) s = run(world, s, 1);
  assert.equal(s.headUnderwater, false);
  assert.ok(t < 4 * HZ, `surfaced in ${t / HZ} s`);
  assert.ok(s.breath > 0 && s.breath <= down, 'still holding breath on the way up');
  s = run(world, s, 4 * HZ);
  assert.ok(Math.abs(SURFACE - s.y - FLOAT_DEPTH) < 0.05, 'back at the float line');
  assert.equal(s.breath, 1);
});

test('holding Jump swims up faster than buoyancy alone', () => {
  const world = pool();
  const bottom = run(world, floating(world), 3 * HZ, { dive: true });
  assert.equal(bottom.y, 31, 'on the pool floor');
  const timeUp = (i: Partial<CharacterInput>) => {
    let s = bottom, t = 0;
    while (s.headUnderwater && t++ < 10 * HZ) s = run(world, s, 1, i);
    return t;
  };
  const buoyant = timeUp({}), kick = timeUp({ rise: true });
  assert.ok(kick < buoyant * 0.75, `jump ${kick} steps vs buoyancy ${buoyant}`);
  // Holding Jump at the surface lifts the head a little higher, without leaving the water.
  let s = run(world, floating(world), 3 * HZ, { rise: true }, (q) => assert.equal(q.mode, 'swim'));
  assert.ok(s.y > SURFACE - FLOAT_DEPTH + 0.1, `lifted ${s.y}`);
  s = run(world, s, 3 * HZ);
  assert.ok(Math.abs(SURFACE - s.y - FLOAT_DEPTH) < 0.05);
});

test('kept under, the swimmer still drowns when breath runs out', () => {
  const world = pool();
  let s = floating(world);
  let t = 0;
  while (!s.dead && t++ < 40 * HZ) s = run(world, s, 1, { dive: true });
  assert.equal(s.dead, true);
  assert.equal(s.cause, 'drowned');
  // 15 s of breath plus 10 s of damage, from the surface.
  assert.ok(t / HZ > 24 && t / HZ < 28, `drowned after ${t / HZ} s`);
});

test('a floating swimmer still climbs out onto the bank', () => {
  const world = pool();
  let s = floating(world);
  s = run(world, s, 3 * HZ, { moveX: 1 });
  assert.equal(s.mode, 'ground');
  assert.equal(s.y, SURFACE);
  assert.ok(s.x > 7);
});

test('swimming over a submerged ledge glides across without dipping the head under', () => {
  const world = pool();
  // A 2 m wide ledge, its top 1 m below the surface, across the pool.
  for (let z = -6; z <= 6; z++) for (let x = 0; x <= 1; x++) for (let y = 31; y <= 33; y++) setVoxel(world, x, y, z, MAT.STONE);
  let s = run(world, createCharacter(-4.5, 31, 0.5), 4 * HZ);
  let lowest = Infinity;
  s = run(world, s, Math.round(3.5 * HZ), { moveX: 1 }, (q) => {
    assert.equal(q.headUnderwater, false, `x ${q.x} y ${q.y}`);
    assert.equal(q.mode, 'swim');
    lowest = Math.min(lowest, q.y);
  });
  assert.ok(s.x > 3, `crossed (x ${s.x})`);
  assert.ok(lowest > SURFACE - FLOAT_DEPTH - 0.15, `lowest ${lowest}`);
  assert.equal(s.breath, 1);
});

test('in the river near the spawn the founder floats at rest for 90 s without losing breath or health', () => {
  const world = createWorld(1337, LATEST_GENERATOR_VERSION);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) ensureChunk(world, worldToChunkX(-60) + dx, worldToChunkZ(4) + dz);
  assert.ok(waterDepthAt(world, -60, 4) >= 2, 'deep river column');
  let s = createCharacter(-59.5, findStandingY(world, -59.5, 4.5, 110)!, 4.5);
  s = run(world, s, 90 * HZ);
  assert.equal(s.mode, 'swim');
  assert.equal(s.dead, false);
  assert.equal(s.headUnderwater, false);
  assert.equal(s.breath, 1);
  assert.equal(s.health, MAX_HEALTH);
});

// ---- animation ----

const world3 = new THREE.Vector3();
const headY = (f: ReturnType<typeof buildFigure>) => { f.root.updateMatrixWorld(true); return f.head.getWorldPosition(world3).y; };

/** Step the sim and animate a figure at 30 fps; `each` sees the figure after each frame. */
function animate(world: World, s: CharacterState, seconds: number, i: Partial<CharacterInput>, f: ReturnType<typeof buildFigure>, each?: (s: CharacterState) => void) {
  for (let k = 0; k < seconds * HZ; k++) {
    s = stepCharacter(world, s, input(i));
    placeFigure(f, s.x, s.y, s.z, s.heading);
    animateFigure(f, s, FIXED_STEP);
    each?.(s);
  }
  return s;
}

test('swimming at the surface strokes: arm and leg joints cycle with speed, neck above the drawn water', () => {
  const world = pool();
  const f = buildFigure();
  let s = animate(world, createCharacter(-4.5, 31, 0.5), 3, {}, f);
  const armX: number[] = [], legX: number[] = [];
  s = animate(world, s, 3, { moveX: 1 }, f, (q) => {
    armX.push(f.armL.rotation.x); legX.push(f.legL.rotation.x);
    assert.ok(headY(f) > q.waterSurface - WATER_DRAW_DROP, 'neck above the drawn water line');
  });
  assert.equal(s.mode, 'swim');
  const span = (v: number[]) => Math.max(...v) - Math.min(...v);
  assert.ok(span(armX.slice(-60)) > 1.4, `arm sweep ${span(armX)}`);
  assert.ok(span(legX.slice(-60)) > 0.7, `leg kick ${span(legX)}`);
  // The body leans into the stroke; the head stays up.
  assert.ok(f.hips.rotation.x > 0.6, `body pitch ${f.hips.rotation.x}`);
  assert.ok(f.ripple.scale.x > 0.5, 'foam ring at the water line');
});

test('floating idle treads water: arms scull out to the sides, legs kick gently, body upright', () => {
  const world = pool();
  const f = buildFigure();
  let s = animate(world, createCharacter(0.5, 31, 0.5), 4, {}, f);
  const zs: number[] = [], xs: number[] = [], legs: number[] = [];
  s = animate(world, s, 2, {}, f, (q) => {
    zs.push(f.armL.rotation.z); xs.push(f.armL.rotation.x); legs.push(f.legL.rotation.x - f.legR.rotation.x);
    assert.ok(headY(f) > q.waterSurface - WATER_DRAW_DROP + 0.03, 'neck clear of the water');
  });
  assert.ok(Math.min(...zs) > 0.7, 'arms out to the sides');
  assert.ok(Math.max(...xs) - Math.min(...xs) > 0.5, 'sculling forward and back');
  assert.ok(Math.max(...legs) - Math.min(...legs) > 0.6, 'legs kick alternately');
  assert.ok(f.hips.rotation.x < 0.3, 'upright');
  // The figure bobs: hips height changes a little over time.
  const hy: number[] = [];
  animate(world, s, 4, {}, f, () => hy.push(f.hips.position.y));
  const bob = Math.max(...hy) - Math.min(...hy);
  assert.ok(bob > 0.02 && bob < 0.12, `bob ${bob}`);
});

test('underwater the body pitches toward the swim direction and strokes; transitions are smooth', () => {
  const world = pool();
  const f = buildFigure();
  let s = animate(world, createCharacter(0.5, 31, 0.5), 4, {}, f);
  let prev = { arm: f.armL.rotation.x, pitch: f.hips.rotation.x, y: f.hips.position.y };
  let jump = 0;
  const track = () => {
    jump = Math.max(jump, Math.abs(f.hips.rotation.x - prev.pitch), Math.abs(f.hips.position.y - prev.y));
    prev = { arm: f.armL.rotation.x, pitch: f.hips.rotation.x, y: f.hips.position.y };
  };
  // Straight down: head first.
  s = animate(world, s, 1.2, { dive: true }, f, track);
  assert.equal(s.headUnderwater, true);
  assert.ok(f.hips.rotation.x > 2.2, `head-down dive pitch ${f.hips.rotation.x}`);
  // Along the floor: about level.
  const arms: number[] = [];
  s = animate(world, s, 2, { dive: true, moveX: 1 }, f, (q) => { track(); arms.push(f.armL.rotation.x); });
  s = animate(world, s, 1.5, { moveX: -1 }, f, track);
  assert.ok(Math.max(...arms) - Math.min(...arms) > 2, 'long underwater pull');
  // Releasing: rising upright, then back to treading at the surface.
  s = animate(world, s, 5, {}, f, track);
  assert.equal(s.headUnderwater, false);
  assert.ok(f.hips.rotation.x < 0.3, `upright again ${f.hips.rotation.x}`);
  assert.ok(jump < 0.25, `no pose snaps between frames (largest step ${jump})`);
  // Climb out: the figure goes back to the walking pose.
  s = { ...s, x: 5.5 };
  s = animate(world, s, 1.6, { moveX: 1 }, f);
  assert.equal(s.mode, 'ground');
  assert.ok(f.hips.rotation.x < 0.01 && Math.abs(f.hips.position.y - 0.82) < 0.06, 'walking pose');
  assert.equal(f.ripple.scale.x, 0, 'no foam on land');
});

test('the figure is still one skinned mesh (one draw call per pass) with the foam ring included', () => {
  const f = buildFigure();
  let meshes = 0, tris = 0;
  f.root.traverse((n) => { const m = n as THREE.Mesh; if (m.isMesh) { meshes++; tris += m.geometry.attributes.position.count / 3; } });
  assert.equal(meshes, 1);
  assert.ok(tris < 400, `triangles ${tris}`);
});
