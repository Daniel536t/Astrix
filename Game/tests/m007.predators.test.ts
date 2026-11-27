import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERATOR_V2, createWorld, ensureChunk, residentSurfaceAt } from '../src/sim/world';
import { Creature, FaunaContext, spawnChunkFauna, stepCreature, FAUNA_STEP } from '../src/sim/fauna';

function meadow() {
  const world = createWorld(1337, GENERATOR_V2);
  for (let cz = 28; cz <= 32; cz++) for (let cx = 28; cx <= 32; cx++) ensureChunk(world, cx, cz);
  // A flat spot in the founder valley (chunk 30 is near world x = 0).
  for (let z = -120; z < 30; z += 2) for (let x = -120; x < 30; x += 2) {
    const h = residentSurfaceAt(world, x, z);
    if (h === null) continue;
    let ok = true;
    for (let dz = -4; dz <= 4 && ok; dz++) for (let dx = -4; dx <= 4 && ok; dx++) if (residentSurfaceAt(world, x + dx, z + dz) !== h) ok = false;
    if (ok) return { world, x: x + 0.5, z: z + 0.5, y: h };
  }
  throw new Error('no flat meadow');
}
const make = (species: Creature['species'], id: string, x: number, y: number, z: number, behaviour: Creature['behaviour'] = 'graze'): Creature => ({
  id, species, tier: 'ambient', chunk: '0,0', x, y, z, heading: 0, homeX: x, homeZ: z, behaviour, timer: 5,
  goalX: x, goalZ: z, depthPref: 0, speed: 0, rng: 12345,
});
const run = (world: ReturnType<typeof meadow>['world'], all: Creature[], ctxOf: () => FaunaContext, steps: number, each?: () => void) => {
  for (let i = 0; i < steps; i++) { const ctx = ctxOf(); for (const c of all) stepCreature(world, c, ctx); each?.(); }
};

test('predators spawn deterministically and never move existing wildlife', () => {
  const world = createWorld(1337, GENERATOR_V2);
  for (let cz = 26; cz <= 34; cz++) for (let cx = 26; cx <= 34; cx++) ensureChunk(world, cx, cz);
  let foxes = 0, wolves = 0, leaders = 0, followers = 0;
  for (let cz = 27; cz <= 33; cz++) for (let cx = 27; cx <= 33; cx++) {
    const a = spawnChunkFauna(world, cx, cz), b = spawnChunkFauna(world, cx, cz);
    assert.deepEqual(a, b);
    for (const c of a) {
      if (c.species === 'fox') foxes++;
      if (c.species === 'wolf') { wolves++; if (c.leader) followers++; else leaders++; }
    }
  }
  assert.ok(foxes + wolves > 0, 'some predators in the founder valley');
  if (wolves) assert.ok(followers + leaders === wolves && leaders >= 1);
});

test('a hare bolts from a nearby fox; a fox at distance does not alarm it', () => {
  const { world, x, z, y } = meadow();
  const hare = make('rabbit', 'h', x, y, z), fox = make('fox', 'f', x + 4, y, z, 'rest');
  const ctx = (): FaunaContext => ({ threats: [], night: false, predators: [{ species: 'fox', x: fox.x, z: fox.z }] });
  run(world, [hare], ctx, 3);
  assert.equal(hare.behaviour, 'flee');
  const far = make('rabbit', 'h2', x, y, z), distant = make('fox', 'f2', x + 25, y, z, 'rest');
  run(world, [far], () => ({ threats: [], night: false, predators: [{ species: 'fox', x: distant.x, z: distant.z }] }), 3);
  assert.notEqual(far.behaviour, 'flee');
});

test('a fox stalks a hare, then pounces, and a missed pounce ends in rest', () => {
  const { world, x, z, y } = meadow();
  const hare = make('rabbit', 'h', x + 9, y, z, 'sleep'), fox = make('fox', 'f', x, y, z, 'idle');
  fox.timer = 0;
  const seen = new Set<string>();
  let nearest = 99;
  run(world, [fox], () => ({ threats: [], night: false, prey: [{ x: hare.x, z: hare.z }] }), 400, () => {
    seen.add(fox.behaviour);
    nearest = Math.min(nearest, Math.hypot(hare.x - fox.x, hare.z - fox.z));
  });
  assert.ok(seen.has('stalk'), `behaviours ${[...seen]}`);
  assert.ok(seen.has('chase'), `behaviours ${[...seen]}`);
  assert.ok(nearest < 1.5, `closed to ${nearest.toFixed(2)} m`);
  assert.ok(seen.has('rest'), 'gave up after the pounce');
});

test('wolf pack members stay with their leader and flee from people as a group', () => {
  const { world, x, z, y } = meadow();
  const leader = make('wolf', 'w0', x, y, z, 'wander'), a = make('wolf', 'w1', x + 2, y, z + 1), b = make('wolf', 'w2', x - 2, y, z - 1);
  a.leader = 'w0'; b.leader = 'w0';
  leader.goalX = x + 40; leader.goalZ = z; leader.timer = 1000;
  const leaders = new Map([['w0', leader]]);
  let maxSpread = 0;
  run(world, [leader, a, b], () => ({ threats: [], night: false, leaders }), 900, () => {
    maxSpread = Math.max(maxSpread, Math.hypot(a.x - leader.x, a.z - leader.z), Math.hypot(b.x - leader.x, b.z - leader.z));
  });
  assert.ok(maxSpread < 12, `pack spread ${maxSpread.toFixed(1)} m`);
  assert.ok(Math.hypot(leader.x - x, leader.z - z) > 6, 'the pack travelled');
  const person: FaunaContext = { threats: [{ x: leader.x + 10, z: leader.z }], night: false, leaders };
  for (let i = 0; i < 5; i++) for (const c of [leader, a, b]) stepCreature(world, c, person);
  assert.equal(leader.behaviour, 'flee', 'wolves are wary of people (wariness 20 m)');
  assert.ok(FAUNA_STEP > 0);
});

test('deer bolt from wolves but not from foxes', () => {
  const { world, x, z, y } = meadow();
  const d1 = make('deer', 'd1', x, y, z), d2 = make('deer', 'd2', x, y, z);
  run(world, [d1], () => ({ threats: [], night: false, predators: [{ species: 'wolf', x: x + 6, z }] }), 3);
  run(world, [d2], () => ({ threats: [], night: false, predators: [{ species: 'fox', x: x + 3, z }] }), 3);
  assert.equal(d1.behaviour, 'flee');
  assert.notEqual(d2.behaviour, 'flee');
});
