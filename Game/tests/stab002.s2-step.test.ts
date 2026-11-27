// STAB-002 S2 regression: bodies below the founder's feet. In the browser the
// founder walked off the coop's 1 m terrain step onto a hen at its foot and
// fell into it (0.14 m and 0.40 m, feet 0.32 m above the hen's ground while
// falling): a body was only tested while it shared height with the feet, so
// the founder passed over the hen on the upper level and the fall was never
// tested. A body is now tested against (a) a standing founder whose feet are
// above its top by less than an animal's 1 m step, (b) a move without support
// (off a step or a ledge, or in the air) down to where it would come down,
// and (c) a fall onto it lands on its top. Capsules from sim state span the
// ground under the whole body, so an animal crossing a step is on both levels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAT, createWorld, ensureChunk, setVoxel, surfaceAt, worldToChunkX, worldToChunkZ } from '../src/sim/world';
import { CharacterState, FIXED_STEP, bodyOverlap, createCharacter, stepCharacter } from '../src/sim/character';
import { DynamicBody, FARM_BODIES, WILD_BODIES, groundSpan, youngScale } from '../src/sim/bodies';
import { DM } from '../src/sim/homestead';
import { Walk, animalsOf, farm } from './stab002-s2-harness';

/** Flat stone at feet y 31, with an upper level `rise` m higher for x >= 0. */
function stepPad(rise: number) {
  const world = createWorld(1337);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) ensureChunk(world, worldToChunkX(0) + dx, worldToChunkZ(0) + dz);
  for (let z = -12; z <= 12; z++) for (let x = -12; x <= 12; x++) {
    for (let y = surfaceAt(world, x, z); y <= 42; y++) setVoxel(world, x, y, z, MAT.AIR);
    setVoxel(world, x, 30, z, MAT.GRASS);
    if (x >= 0) for (let k = 1; k <= rise; k++) setVoxel(world, x, 30 + k, z, MAT.STONE);
  }
  return world;
}
const LOW = 31;
type Pad = ReturnType<typeof stepPad>;
const at = (size: { r: number; hl: number; h: number }, x: number, z: number, heading: number, k = 1): DynamicBody =>
  ({ id: 'b', x, z, y: LOW, h: size.h * k, r: size.r * k, hl: size.hl * k, heading });
const settle = (world: Pad, x: number, z: number, y: number) => {
  let s = createCharacter(x, y + 0.5, z);
  for (let i = 0; i < 30; i++) s = stepCharacter(world, s, { moveX: 0, moveZ: 0, run: false, jump: false }, FIXED_STEP);
  return s;
};
const SHORT: Array<[string, { r: number; hl: number; h: number }, number]> = [
  ['chicken', FARM_BODIES.chicken, 1], ['chick', FARM_BODIES.chicken, youngScale('chicken')], ['piglet', FARM_BODIES.pig, youngScale('pig')],
  ['lamb', FARM_BODIES.sheep, youngScale('sheep')], ['pig', FARM_BODIES.pig, 1], ['rabbit', WILD_BODIES.rabbit, 1], ['fox', WILD_BODIES.fox, 1],
  ['sheep', FARM_BODIES.sheep, 1], ['cattle', FARM_BODIES.cattle, 1],
];

test('walking off a 1 m step onto an animal at its foot (the coop hen): the founder stops at it, never overlaps it, at 60 fps and the fixed step', () => {
  const world = stepPad(1);
  for (const [name, size, k] of SHORT) {
    for (const heading of [0, Math.PI / 2, 0.7]) {
      for (const bx of [-0.15, -0.3, -0.5]) {
        for (const dt of [1 / 60, FIXED_STEP]) {
          for (const run of [false, true]) {
            const b = at(size, bx - size.r * k, 0.5, heading, k);
            let s: CharacterState = settle(world, 1.6, 0.5, LOW + 1);
            assert.equal(s.y, LOW + 1);
            let worst = 0;
            // For less than CONTACT_SQUEEZE_AFTER of pressing (the squeeze is tested on its own).
            for (let i = 0; i < 2.4 / dt; i++) {
              s = stepCharacter(world, s, { moveX: -1, moveZ: 0, run, jump: false }, dt, [b]);
              worst = Math.max(worst, bodyOverlap([b], s.x, s.y, s.z));
            }
            assert.ok(worst <= 0.02, `${name} at ${bx} heading ${heading} dt ${dt.toFixed(3)}${run ? ' running' : ''}: overlap ${worst.toFixed(3)} m`);
            assert.ok(s.x > b.x, `${name}: did not get past it (x ${s.x.toFixed(2)})`);
          }
        }
      }
    }
  }
});

test('the founder still passes over an animal when the feet stay above its top: along a 2 m ledge over a hen, not held', () => {
  const world = stepPad(2);
  // Walking along the edge (+z), the disc overhanging the hen below by 0.2 m: feet 1.25 m over its top.
  const hen = at(FARM_BODIES.chicken, -0.25, 0.5, 0);
  let s = settle(world, 0.1, -2.5, LOW + 2);
  for (let i = 0; i < 2.5 * 60; i++) s = stepCharacter(world, s, { moveX: 0, moveZ: 1, run: false, jump: false }, 1 / 60, [hen]);
  assert.ok(s.z > 2.5, `walked on over the hen (z ${s.z.toFixed(2)})`);
  assert.equal(s.y, LOW + 2);
  // Walking off the 2 m ledge onto it: the drop waits until the hen is clear, so the founder never lands in it.
  let t = settle(world, 1.5, 0.5, LOW + 2), worst = 0;
  for (let i = 0; i < 3 * 60; i++) { t = stepCharacter(world, t, { moveX: -1, moveZ: 0, run: false, jump: false }, 1 / 60, [hen]); worst = Math.max(worst, bodyOverlap([hen], t.x, t.y, t.z)); }
  assert.ok(worst <= 0.02, `overlap ${worst.toFixed(3)}`);
  assert.equal(t.y, LOW + 2, 'stayed on the ledge');
});

test('jumping at or onto a short animal never ends inside it: blocked in the air, or landing on its top', () => {
  const world = stepPad(0);
  for (const [name, size, k] of SHORT) {
    for (const dt of [1 / 60, FIXED_STEP]) {
      // Run and jump at it from 1.6 m.
      const b = at(size, 0.5, 0.5, Math.PI / 2, k);
      let s = settle(world, -1.6, 0.5, LOW), worst = 0;
      for (let i = 0; i < 2 / dt; i++) {
        s = stepCharacter(world, s, { moveX: 1, moveZ: 0, run: true, jump: i % Math.round(0.9 / dt) === 2 }, dt, [b]);
        worst = Math.max(worst, bodyOverlap([b], s.x, s.y, s.z));
      }
      assert.ok(worst <= 0.02, `${name} dt ${dt.toFixed(3)}: overlap ${worst.toFixed(3)} m`);
      // Coming down from above straight onto it: rests on its top, then is pushed off, never inside.
      let d = createCharacter(b.x, LOW + b.h + 0.6, b.z), worstD = 0, rested = false;
      for (let i = 0; i < 3 / dt; i++) {
        d = stepCharacter(world, d, { moveX: 0, moveZ: 0, run: false, jump: false }, dt, [b]);
        worstD = Math.max(worstD, bodyOverlap([b], d.x, d.y, d.z));
        if (d.grounded && d.y > LOW + 0.01) rested = true;
      }
      assert.ok(worstD <= 0.02, `${name}: dropped onto it, overlap ${worstD.toFixed(3)} m`);
      assert.ok(rested, `${name}: rested on its top first`);
      assert.equal(d.y, LOW, `${name}: slid off it to the ground`);
    }
  }
});

test('coop: the founder walking off the 1 m step at a hen at its foot (sim-derived capsules, presence on the ticks) never overlaps it; a hen across the step is on both levels', () => {
  for (const mode of ['60fps', 'fixed'] as const) {
    for (const hx of [-33.25, -33.5, -33.7]) {
      const s = farm(7);
      const h = s.world.homestead!;
      const [hen, ...rest] = animalsOf(h, 'chicken');
      hen.x = Math.round(hx * DM); hen.z = -25; hen.tx = hen.x; hen.tz = hen.z; hen.hunger = 0;
      for (const o of rest) { o.x = -365; o.z = 5; o.tx = o.x; o.tz = o.z; }
      const w = new Walk(s, -32.4, -2.5, mode);
      assert.equal(w.ch.y, 13, 'starts on the step');
      let worst = 0;
      for (let f = 0; f < 6 * 60; f++) {
        w.frame({ moveX: -1, moveZ: 0 });
        worst = Math.max(worst, bodyOverlap(w.current(), w.ch.x, w.ch.y, w.ch.z));
      }
      // Before the fix: 0.29 to 0.48 m (the founder fell into the hen from the step).
      assert.ok(worst <= 0.02, `${mode} hen at ${hx}: overlap ${worst.toFixed(3)} m`);
    }
  }
  // A capsule over both levels of the step spans from the low ground to the high one plus its height.
  const g = (x: number) => (x >= -33 ? 13 : 12);
  assert.deepEqual(groundSpan((x) => g(x), -33.1, -2.5, 0.2, 0.2), { lo: 12, hi: 13 });
  assert.deepEqual(groundSpan((x) => g(x), -33.5, -2.5, 0.2, 0.2), { lo: 12, hi: 12 });
});
