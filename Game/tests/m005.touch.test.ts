import test from 'node:test';
import assert from 'node:assert/strict';
import { STICK_DEAD_ZONE, STICK_RADIUS, followBase, stickVector } from '../src/app/touch-controls';

test('joystick dead zone produces no movement', () => {
  const v = stickVector(STICK_RADIUS * STICK_DEAD_ZONE * 0.9, 0);
  assert.deepEqual(v, { x: 0, z: 0, magnitude: 0, run: false });
});

test('pushing the knob up walks forward, right strafes right, analog in between', () => {
  const up = stickVector(0, -STICK_RADIUS * 0.6);
  assert.ok(up.z > 0.4 && Math.abs(up.x) < 1e-9 && !up.run);
  const right = stickVector(STICK_RADIUS * 0.6, 0);
  assert.ok(right.x > 0.4 && Math.abs(right.z) < 1e-9);
  const half = stickVector(0, -STICK_RADIUS * 0.5);
  const full = stickVector(0, -STICK_RADIUS * 0.85);
  assert.ok(half.magnitude < full.magnitude, 'speed follows how far the knob is pushed');
});

test('pushing to the rim runs and the vector never exceeds length 1', () => {
  const v = stickVector(STICK_RADIUS * 3, -STICK_RADIUS * 3);
  assert.equal(v.run, true);
  assert.ok(Math.abs(Math.hypot(v.x, v.z) - 1) < 1e-9);
});

test('the base follows the finger past the rim so the stick never runs out', () => {
  const base = followBase({ x: 100, y: 100 }, { x: 100 + STICK_RADIUS * 2, y: 100 });
  assert.equal(base.x, 100 + STICK_RADIUS);
  assert.equal(base.y, 100);
  const still = followBase({ x: 100, y: 100 }, { x: 120, y: 90 });
  assert.deepEqual(still, { x: 100, y: 100 });
});
