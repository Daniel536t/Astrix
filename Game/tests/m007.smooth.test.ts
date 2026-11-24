import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERATOR_V2, createWorld, ensureChunk } from '../src/sim/world';
import { FAUNA_STEP } from '../src/sim/fauna';
import { FaunaView } from '../src/render/fauna';
import { SNAP_DISTANCE, Pose, blendPose, shortestArc, stepAlpha, tickAlpha } from '../src/render/smooth';
import { SimClock, TICK_SECONDS } from '../src/app/sim-clock';

const P = (x: number, z: number, heading = 0, y = 0): Pose => ({ x, y, z, heading });

test('tickAlpha follows the clock and stays in [0,1]', () => {
  assert.equal(tickAlpha(TICK_SECONDS, TICK_SECONDS), 0);
  assert.equal(tickAlpha(0, TICK_SECONDS), 1);
  assert.equal(tickAlpha(TICK_SECONDS / 2, TICK_SECONDS), 0.5);
  assert.equal(tickAlpha(-3, TICK_SECONDS), 1);
  assert.equal(tickAlpha(99, TICK_SECONDS), 0);
  assert.equal(tickAlpha(NaN, TICK_SECONDS), 1);
  const clock = new SimClock();
  clock.advance(0.5, true);
  assert.equal(tickAlpha(clock.secondsToNext, TICK_SECONDS), 0.25);
  assert.equal(stepAlpha(FAUNA_STEP / 4, FAUNA_STEP), 0.25);
});

test('blend is continuous across a tick boundary and is not a step function', () => {
  // Two consecutive ticks, 1.5 m each. Sample at 60 fps across both.
  const a = P(0, 0), b = P(1.5, 0), c = P(3, 0);
  const out = P(0, 0);
  const xs: number[] = [];
  const frames = Math.round(TICK_SECONDS * 60);
  for (let i = 0; i < frames; i++) xs.push(blendPose(a, b, i / frames, out).x);
  for (let i = 0; i < frames; i++) xs.push(blendPose(b, c, i / frames, out).x);
  xs.push(blendPose(b, c, 1, out).x);
  let maxJump = 0;
  for (let i = 1; i < xs.length; i++) maxJump = Math.max(maxJump, Math.abs(xs[i] - xs[i - 1]));
  assert.ok(maxJump <= 1.5 / frames + 1e-9, `per-frame jump ${maxJump}`);
  assert.ok(xs.every((x, i) => i === 0 || x >= xs[i - 1]), 'monotonic');
  // Without interpolation (alpha forced to 1) the same walk jumps a whole tick at once.
  const raw = [blendPose(a, b, 1, out).x, blendPose(b, c, 1, out).x];
  assert.ok(Math.abs(raw[1] - raw[0]) > 100 * (1.5 / frames));
});

test('yaw takes the shortest arc across the +-PI seam', () => {
  assert.ok(Math.abs(shortestArc(3.0, -3.0) - (Math.PI * 2 - 6)) < 1e-9);
  assert.ok(Math.abs(shortestArc(-3.0, 3.0) + (Math.PI * 2 - 6)) < 1e-9);
  const out = P(0, 0);
  const mid = blendPose(P(0, 0, 3.0), P(0, 0, -3.0), 0.5, out).heading;
  // Halfway is on the seam (near PI), not near 0.
  assert.ok(Math.abs(Math.abs(mid) - Math.PI) < 0.01 || Math.abs(mid - Math.PI) < 0.01, `mid ${mid}`);
  assert.ok(Math.abs(shortestArc(0, 7 * Math.PI)) <= Math.PI);
});

test('large jumps snap instead of sliding', () => {
  const out = P(0, 0);
  blendPose(P(0, 0), P(SNAP_DISTANCE + 1, 0, 1), 0.1, out);
  assert.equal(out.x, SNAP_DISTANCE + 1);
  assert.equal(out.heading, 1);
  blendPose(P(0, 0), P(SNAP_DISTANCE - 1, 0), 0.5, out);
  assert.equal(out.x, (SNAP_DISTANCE - 1) / 2);
});

test('blend depends only on alpha, never on how many frames it took', () => {
  const a = P(2, 3, 0.4, 5), b = P(4, 1, 1.2, 6), o1 = P(0, 0), o2 = P(0, 0);
  for (const t of [0, 0.13, 0.5, 0.99, 1]) {
    blendPose(a, b, t, o1);
    for (let i = 0; i < 7; i++) blendPose(a, b, t, o2);
    assert.deepEqual(o1, o2);
  }
});

function populatedView(): FaunaView {
  const world = createWorld(1337, GENERATOR_V2);
  const keys = new Set<string>();
  for (let cz = 28; cz <= 32; cz++) for (let cx = 28; cx <= 32; cx++) { ensureChunk(world, cx, cz); keys.add(`${cx},${cz}`); }
  const view = new FaunaView(world);
  for (let i = 0; i < 20 && (i === 0 || view.pendingSpawn); i++) view.sync(keys);
  return view;
}
const snapshot = (v: FaunaView) => JSON.stringify(v.all().map((c) => [c.id, c.x, c.y, c.z, c.heading, c.behaviour, c.rng]));
const ctx = { threats: [], night: false };

test('rendering never changes simulation state', () => {
  // Same sim time, but one view is also drawn extra times (update(0)) between steps.
  const plain = populatedView(), drawn = populatedView();
  assert.ok(plain.count > 0);
  for (let i = 0; i < 100; i++) plain.update(0.1, ctx);
  for (let i = 0; i < 100; i++) { drawn.update(0.1, ctx); drawn.update(0, ctx); drawn.update(0, ctx); }
  assert.equal(snapshot(plain), snapshot(drawn));
});

test('drawn animals move every frame, not once per 10 Hz sim step', () => {
  const view = populatedView();
  for (let i = 0; i < 60; i++) view.update(1 / 60, ctx);
  const meshes = view.group.children as unknown as Array<{ count: number; instanceMatrix: { array: Float32Array } }>;
  const read = () => meshes.flatMap((m) => Array.from({ length: m.count }, (_, i) => [m.instanceMatrix.array[i * 16 + 12], m.instanceMatrix.array[i * 16 + 14]]));
  let prev = read();
  const total = prev.map(() => 0), moved = prev.map(() => 0), biggest = prev.map(() => 0);
  const FRAMES = 180;
  for (let f = 0; f < FRAMES; f++) {
    view.update(1 / 60, ctx);
    const now = read();
    now.forEach((p, i) => {
      const d = Math.hypot(p[0] - prev[i][0], p[1] - prev[i][1]);
      total[i] += d; if (d > 1e-6) moved[i]++; biggest[i] = Math.max(biggest[i], d);
    });
    prev = now;
  }
  const best = total.indexOf(Math.max(...total));
  assert.ok(total[best] > 0.5, 'some animal travelled');
  // Blended: a walking animal advances on nearly every frame (a raw 10 Hz step only on every 6th).
  assert.ok(moved[best] / FRAMES > 0.6, `moved on ${moved[best]} of ${FRAMES} frames`);
});

test('FaunaView spawns at most SPAWN_CHUNKS_PER_FRAME chunks per sync and finishes over later frames', () => {
  const world = createWorld(1337, GENERATOR_V2);
  const keys = new Set<string>();
  for (let cx = 0; cx < 5; cx++) { ensureChunk(world, cx, 0); keys.add(`${cx},0`); }
  const view = new FaunaView(world);
  const priv = view as unknown as { creatures: Map<string, unknown> };
  const frames: number[] = [];
  for (let i = 0; i < 6 && (i === 0 || view.pendingSpawn); i++) {
    view.sync(keys);
    frames.push(priv.creatures.size);
  }
  assert.deepEqual(frames, [2, 4, 5]);
  assert.equal(view.pendingSpawn, false);
  view.sync(keys);
  assert.equal(priv.creatures.size, 5, 'a settled sync spawns nothing more');
});
