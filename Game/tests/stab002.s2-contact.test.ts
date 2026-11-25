// STAB-002 S2 "bodies and presence": the founder's soft contact with moving
// bodies (player-local physics in stepCharacter, like the voxel, fence and
// trunk collision) and the wildlife step rule. Static capsules on a flat pad,
// so every number here is about the contact rule itself; the farm runs with
// capsules derived from sim state are in stab002.s2.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAT, createWorld, ensureChunk, setVoxel, surfaceAt, worldToChunkX, worldToChunkZ } from '../src/sim/world';
import { CHARACTER_RADIUS, CONTACT_PUSH_SPEED, CONTACT_SQUEEZE_DEPTH, CharacterState, FIXED_STEP, bodyOverlap, createCharacter, stepCharacter } from '../src/sim/character';
import { DynamicBody, FARM_BODIES, PERSON_BODY, PLAYER_R, WILD_BODIES, bodyReach, creatureBody, penetration, segmentDistance } from '../src/sim/bodies';
import { Creature, FAUNA_STEP, SPECIES, stepCreature } from '../src/sim/fauna';

function flatPad() {
  const world = createWorld(1337);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) ensureChunk(world, worldToChunkX(0) + dx, worldToChunkZ(0) + dz);
  for (let z = -12; z <= 12; z++) for (let x = -12; x <= 12; x++) {
    for (let y = surfaceAt(world, x, z); y <= 40; y++) setVoxel(world, x, y, z, MAT.AIR);
    setVoxel(world, x, 30, z, MAT.STONE);
    // Grass on top so wildlife may walk here too.
    setVoxel(world, x, 30, z, MAT.GRASS);
  }
  return world;
}
const Y = 31;
const body = (id: string, size: { r: number; hl: number; h: number }, x: number, z: number, heading: number): DynamicBody =>
  ({ id, x, z, y: Y, h: size.h, r: size.r, hl: size.hl, heading });
const gapOf = (b: DynamicBody, s: CharacterState) => -penetration(b, s.x, s.z, CHARACTER_RADIUS);
const step = (world: ReturnType<typeof flatPad>, s: CharacterState, mx: number, mz: number, dt: number, bodies?: DynamicBody[], run = false) =>
  stepCharacter(world, s, { moveX: mx, moveZ: mz, run, jump: false }, dt, bodies);
const settle = (world: ReturnType<typeof flatPad>, x: number, z: number) => {
  let s = createCharacter(x, Y + 0.5, z);
  for (let i = 0; i < 20; i++) s = step(world, s, 0, 0, FIXED_STEP);
  return s;
};

const SIZES: Array<[string, { r: number; hl: number; h: number }]> = [
  ...Object.entries(FARM_BODIES), ...Object.entries(WILD_BODIES), ['villager', PERSON_BODY],
];

test('the founder cannot walk or run through any body (six farm species, wildlife, villagers) at 60 fps and at the fixed 1/30 s step; at 45 degrees it slides past', () => {
  const world = flatPad();
  const worst: string[] = [];
  for (const [name, size] of SIZES) {
    for (const heading of [0, Math.PI / 2, Math.PI / 4, 2.2]) {
      for (const [dt, label] of [[1 / 60, '60 fps'], [FIXED_STEP, 'fixed']] as const) {
        for (const run of [false, true]) {
          const b = body(name, size, 0.5, 0.5, heading);
          // Head-on: from 4 m west, straight at the body's centre (for less than CONTACT_SQUEEZE_AFTER of pressing).
          let s = settle(world, -3.5, 0.5);
          let minGap = Infinity, deeper = 0, prevPen = 0;
          for (let i = 0; i < 2.4 / dt; i++) {
            s = step(world, s, 1, 0, dt, [b], run);
            const g = gapOf(b, s);
            minGap = Math.min(minGap, g);
            const pen = Math.max(0, -g);
            if (pen > prevPen + 1e-6) deeper++;
            prevPen = pen;
          }
          assert.ok(minGap >= -0.02, `${name} heading ${heading.toFixed(2)} ${label}${run ? ' running' : ''}: min gap ${minGap.toFixed(3)} m`);
          assert.equal(deeper, 0, `${name}: never deeper than the step before`);
          assert.ok(s.x < 0.5, `${name}: stopped in front (x ${s.x.toFixed(2)})`);
          assert.ok(Math.hypot(s.x - b.x, s.z - b.z) >= b.r + PLAYER_R - 0.02, `${name}: centre distance >= sum of radii`);
          worst.push(`${name}:${minGap.toFixed(3)}`);
        }
      }
    }
  }
  // Glancing at 45 degrees past a cow's flank: slides along it and comes out beyond.
  const cow = body('cow', FARM_BODIES.cattle, 0.5, 0.5, 0);
  let s = settle(world, -3, -2.2);
  let minGap = Infinity;
  for (let i = 0; i < 4 * 60; i++) { s = step(world, s, Math.SQRT1_2, Math.SQRT1_2, 1 / 60, [cow]); minGap = Math.min(minGap, gapOf(cow, s)); }
  assert.ok(minGap >= -0.02, `45 degrees: min gap ${minGap.toFixed(3)}`);
  assert.ok(s.x > 2 || s.z > 2.5, `slid past the cow (${s.x.toFixed(2)}, ${s.z.toFixed(2)})`);
});

test('pressing on against a body for 10 s squeezes at most CONTACT_SQUEEZE_DEPTH into it, never through; letting go, the push-out clears it', () => {
  const world = flatPad();
  for (const [name, size] of SIZES) {
    for (const heading of [0, Math.PI / 2]) {
      const b = body(name, size, 0.5, 0.5, heading);
      let s = settle(world, -3.5, 0.5), worst = 0, minCentre = Infinity;
      for (let i = 0; i < 10 * 60; i++) {
        s = step(world, s, 1, 0, 1 / 60, [b]);
        worst = Math.max(worst, penetration(b, s.x, s.z, CHARACTER_RADIUS));
        minCentre = Math.min(minCentre, Math.hypot(s.x - b.x, s.z - b.z));
      }
      assert.ok(worst <= CONTACT_SQUEEZE_DEPTH + 0.01, `${name}: squeezed ${worst.toFixed(3)} m`);
      assert.ok(s.x < b.x, `${name}: never through`);
      assert.ok(minCentre >= size.r + PLAYER_R - CONTACT_SQUEEZE_DEPTH - 0.01, `${name}: centre distance ${minCentre.toFixed(2)}`);
      for (let i = 0; i < 30; i++) s = step(world, s, 0, 0, FIXED_STEP, [b]);
      assert.ok(gapOf(b, s) > -0.002, `${name}: cleared after letting go (${gapOf(b, s).toFixed(3)})`);
    }
  }
});

test('a body placed on the founder separates them monotonically within 0.5 s, at most CONTACT_PUSH_SPEED, then nothing moves (no jitter)', () => {
  const world = flatPad();
  for (const [name, size] of SIZES) {
    for (const off of [0.05, 0.25, 0.4]) {
      const b = body(name, size, 0.5 + off, 0.5 + off * 0.3, 1.1);
      let s = settle(world, 0.5, 0.5);
      const start = { x: s.x, z: s.z };
      let gap = gapOf(b, s), reversals = 0, lastDelta = 0, separatedAt = -1;
      for (let i = 0; i < 60; i++) {
        const before = { x: s.x, z: s.z };
        s = step(world, s, 0, 0, FIXED_STEP, [b]);
        const moved = Math.hypot(s.x - before.x, s.z - before.z);
        assert.ok(moved <= CONTACT_PUSH_SPEED * FIXED_STEP + 1e-6, `${name}: push ${moved.toFixed(4)} m in a step`);
        const g = gapOf(b, s), delta = g - gap;
        assert.ok(delta >= -1e-9, `${name} off ${off}: separation never goes back (${delta})`);
        if (lastDelta > 1e-9 && delta <= 1e-9 && i > 0) reversals++;
        lastDelta = delta; gap = g;
        if (separatedAt < 0 && g > -1e-3) separatedAt = i;
      }
      assert.ok(separatedAt >= 0 && separatedAt * FIXED_STEP <= 0.5, `${name} off ${off}: separated after ${separatedAt} steps`);
      assert.ok(reversals <= 1, `${name}: ${reversals} changes of direction`);
      // Standing next to it now: 300 steps without any motion.
      const rest = { x: s.x, z: s.z };
      for (let i = 0; i < 300; i++) s = step(world, s, 0, 0, FIXED_STEP, [b]);
      assert.ok(Math.hypot(s.x - rest.x, s.z - rest.z) < 1e-9, `${name}: still after separating`);
      assert.ok(Math.hypot(rest.x - start.x, rest.z - start.z) < 0.8, `${name}: no pop`);
    }
  }
});

test('a body walking into a standing founder at 0.6 m/s (the fastest drawn animal) keeps the overlap under 0.05 m; the founder is nudged, never held', () => {
  const world = flatPad();
  for (const [name, size] of SIZES) {
    let s = settle(world, 0.5, 0.5);
    let worst = 0;
    for (let i = 0; i < 6 / FIXED_STEP; i++) {
      const t = i * FIXED_STEP;
      const b = body(name, size, -3 + 0.6 * t, 0.5, Math.PI / 2);
      s = step(world, s, 0, 0, FIXED_STEP, [b]);
      worst = Math.max(worst, penetration(b, s.x, s.z, CHARACTER_RADIUS));
    }
    assert.ok(worst <= 0.05, `${name}: deepest overlap ${worst.toFixed(3)} m`);
    const end = -3 + 0.6 * 6;
    assert.ok(s.x > end + size.r + 0.2, `${name}: the founder was nudged along ahead of it (x ${s.x.toFixed(2)})`);
  }
});

test('a villager walking (1.3 m/s) into a founder who has been pressing into it for 3 s (squeezing) never gets deeper than the squeeze depth plus 0.05 m', () => {
  const world = flatPad();
  let s = settle(world, 0.5, 0.5);
  let worst = 0;
  for (let i = 0; i < 8 / FIXED_STEP; i++) {
    const t = i * FIXED_STEP;
    // Standing still in front of the founder for 3 s (they press into it), then walking through them.
    const b = body('v', PERSON_BODY, t < 3 ? 1.05 : 1.05 - 1.3 * (t - 3), 0.5, -Math.PI / 2);
    s = step(world, s, 1, 0, FIXED_STEP, [b]);
    worst = Math.max(worst, penetration(b, s.x, s.z, CHARACTER_RADIUS));
  }
  assert.ok(worst <= CONTACT_SQUEEZE_DEPTH + 0.05, `deepest ${worst.toFixed(3)} m`);
});

test('without bodies (absent, empty, or far away) every step is identical to the code before S2', () => {
  const world = flatPad();
  for (let z = -12; z <= 12; z++) for (let x = 4; x <= 12; x++) setVoxel(world, x, 31, z, MAT.STONE);
  const far = [body('far', FARM_BODIES.cattle, 11, 11, 0)];
  let a = settle(world, -6.5, 0.5), b = { ...a }, c = { ...a };
  for (let i = 0; i < 600; i++) {
    const inp = { moveX: Math.sin(i / 40), moveZ: Math.cos(i / 55), run: i % 200 > 120, jump: i % 97 === 0 };
    a = stepCharacter(world, a, inp, FIXED_STEP);
    b = stepCharacter(world, b, inp, FIXED_STEP, []);
    c = stepCharacter(world, c, inp, FIXED_STEP, far);
    assert.deepEqual(b, a, `step ${i}: empty list`);
    if (Math.hypot(a.x - 11, a.z - 11) > 4) assert.deepEqual(c, a, `step ${i}: far body`);
  }
});

test('pinned between a wall and a cornered cow, or pinched between two animals, the founder walks out within 1 s and is never held', () => {
  const world = flatPad();
  // A two-voxel wall along z = 2 (x 0..10).
  for (let x = -12; x <= 12; x++) for (const y of [31, 32]) setVoxel(world, x, y, 2, MAT.STONE);
  const cow = body('cow', FARM_BODIES.cattle, 0.5, 0.5, Math.PI / 2); // flank toward +z, 0.46 m radius
  // The founder squeezed between the cow's flank and the wall (overlapping both a little).
  let s = createCharacter(0.5, Y, 1.55);
  let held = 0, maxHeld = 0;
  const start = s.x;
  for (let i = 0; i < 30; i++) {
    const before = s.x;
    s = step(world, s, 1, 0, FIXED_STEP, [cow]);
    if (s.x - before < 0.01) held += FIXED_STEP; else held = 0;
    maxHeld = Math.max(maxHeld, held);
  }
  assert.ok(s.x - start > 1.5, `walked out along the wall (${(s.x - start).toFixed(2)} m in 1 s)`);
  assert.ok(maxHeld <= 0.2, `held ${maxHeld.toFixed(2)} s`);
  assert.ok(gapOf(cow, s) > -0.01, 'and is clear of the cow');
  // Pinched between two sheep whose bodies touch the founder from both sides: settles between, walks out.
  const a = body('a', FARM_BODIES.sheep, 0.5, -0.25, Math.PI / 2), b = body('b', FARM_BODIES.sheep, 0.5, 1.25, Math.PI / 2);
  s = createCharacter(0.5, Y, 0.5);
  let worst = 0;
  for (let i = 0; i < 20; i++) { s = step(world, s, 0, 0, FIXED_STEP, [a, b]); worst = Math.max(worst, bodyOverlap([a, b], s.x, s.y, s.z)); }
  const pinched = bodyOverlap([a, b], s.x, s.y, s.z);
  assert.ok(pinched <= 0.13, `pinched: overlap ${pinched.toFixed(3)} m, shared between both`);
  const x0 = s.x;
  for (let i = 0; i < 30; i++) s = step(world, s, -1, 0, FIXED_STEP, [a, b]);
  assert.ok(x0 - s.x > 1.5, `walked out of the pinch (${(x0 - s.x).toFixed(2)} m in 1 s)`);
  void worst;
});

test('wildlife never ends a step inside the founder: a stalking fox, a following wolf, a wandering deer and hare; the founder never walks into them', () => {
  const world = flatPad();
  const P = { x: 0.5, z: 0.5 };
  const make = (species: Creature['species'], x: number, z: number, behaviour: Creature['behaviour'], goal: { x: number; z: number }): Creature => ({
    id: `fauna:${species}:t:0`, species, tier: 'ambient', chunk: '0,0', x, y: Y, z, heading: Math.atan2(goal.x - x, goal.z - z), homeX: goal.x, homeZ: goal.z,
    behaviour, timer: 30, goalX: goal.x, goalZ: goal.z, depthPref: 0, speed: 0, rng: 12345,
  });
  const cases: Array<[Creature, string]> = [
    [make('fox', -6, 0.5, 'stalk', { x: 6, z: 0.5 }), 'stalk through the founder at a hare beyond'],
    [make('wolf', -6, 0.7, 'follow', { x: 6, z: 0.5 }), 'follow through the founder'],
    [make('deer', -6, 0.4, 'wander', { x: 6, z: 0.5 }), 'wander through the founder'],
    [make('rabbit', -4, 0.5, 'wander', { x: 4, z: 0.5 }), 'wander through the founder'],
  ];
  // Wild creatures flee a person long before contact (wariness 6 to 20 m), so to test the step rule itself
  // their wariness is set near zero here (a creature that does not flee: cornered, or a future tame tier).
  const wary = Object.fromEntries(Object.entries(SPECIES).map(([k, d]) => [k, d.wariness]));
  try {
    for (const d of Object.values(SPECIES)) d.wariness = 0.01;
    for (const [c, what] of cases) {
      const keep = PLAYER_R + bodyReach(WILD_BODIES[c.species as keyof typeof WILD_BODIES]);
      let minD = Infinity, moved = 0;
      for (let i = 0; i < 12 / FAUNA_STEP; i++) {
        const bx = c.x, bz = c.z;
        stepCreature(world, c, { threats: [P], night: false, prey: c.species === 'fox' ? [{ x: 6, z: 0.5 }] : [] });
        moved += Math.hypot(c.x - bx, c.z - bz);
        minD = Math.min(minD, Math.hypot(c.x - P.x, c.z - P.z));
      }
      assert.ok(minD >= keep - 1e-9, `${c.species} (${what}): closest ${minD.toFixed(3)} m, keeps ${keep.toFixed(2)} m`);
      assert.ok(moved > 2, `${c.species} kept moving (${moved.toFixed(1)} m)`);
    }
  } finally {
    for (const [k, v] of Object.entries(wary)) SPECIES[k as keyof typeof SPECIES].wariness = v;
  }
  // Without the rule a stalking fox would have walked through: the same fox with no threat passes the point.
  const free = make('fox', -6, 0.5, 'stalk', { x: 6, z: 0.5 });
  let through = Infinity;
  for (let i = 0; i < 120; i++) { stepCreature(world, free, { threats: [], night: false, prey: [{ x: 6, z: 0.5 }] }); through = Math.min(through, Math.hypot(free.x - P.x, free.z - P.z)); }
  assert.ok(through < 0.3, `control: without a founder the fox crosses the spot (${through.toFixed(2)} m)`);
  // The founder walking at a deer, a hare and a fox (capsules from the creature records) stops at contact.
  for (const sp of ['deer', 'rabbit', 'fox', 'wolf'] as const) {
    const b = creatureBody({ id: sp, species: sp, x: 0.5, y: Y, z: 0.5, heading: 0.7 })!;
    let s = settle(world, -4, 0.5), minGap = Infinity;
    for (let i = 0; i < 180; i++) { s = step(world, s, 1, 0, 1 / 60, [b], true); minGap = Math.min(minGap, gapOf(b, s)); }
    assert.ok(minGap >= -0.02, `${sp}: min gap ${minGap.toFixed(3)}`);
  }
  assert.equal(creatureBody({ id: 't', species: 'trout', x: 0, y: 0, z: 0, heading: 0 }), null, 'trout are not bodies');
});

test('contact cost: stepCharacter with 120 bodies around costs at most 0.05 ms more per step than without (Node)', () => {
  const world = flatPad();
  const bodies: DynamicBody[] = [];
  for (let i = 0; i < 120; i++) bodies.push(body(`b${i}`, FARM_BODIES.cattle, ((i * 7) % 23) - 11, ((i * 13) % 17) - 8, i));
  const time = (b?: DynamicBody[]) => {
    let s = settle(world, 0.5, 0.5);
    const t0 = performance.now();
    for (let i = 0; i < 6000; i++) s = step(world, s, Math.sin(i / 50), Math.cos(i / 50), FIXED_STEP, b);
    return (performance.now() - t0) / 6000;
  };
  const runs: number[] = [];
  for (let k = 0; k < 5; k++) runs.push(time(bodies) - time());
  runs.sort((a, b) => a - b);
  assert.ok(runs[2] <= 0.05, `median extra ${(runs[2] * 1000).toFixed(1)} us per step`);
  assert.ok(segmentDistance(bodies[0], bodies[0].x, bodies[0].z) === 0);
});
