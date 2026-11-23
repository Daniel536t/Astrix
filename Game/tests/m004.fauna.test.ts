import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERATOR_V2, MAT, createWorld, ensureChunk, getVoxel, residentSurfaceAt } from '../src/sim/world';
import { SPECIES, residentWaterAt, spawnChunkFauna, stepCreature, Creature } from '../src/sim/fauna';

function region(seed: number, cx0: number, cz0: number, r: number) {
  const world = createWorld(seed, GENERATOR_V2);
  for (let cz = cz0 - r - 1; cz <= cz0 + r + 1; cz++) for (let cx = cx0 - r - 1; cx <= cx0 + r + 1; cx++) ensureChunk(world, cx, cz);
  const creatures: Creature[] = [];
  for (let cz = cz0 - r; cz <= cz0 + r; cz++) for (let cx = cx0 - r; cx <= cx0 + r; cx++) creatures.push(...spawnChunkFauna(world, cx, cz));
  return { world, creatures };
}

test('ambient fauna spawns deterministically with stable ids and valid habitat', () => {
  // Founder valley (river, lake shore, forest) around chunk (30, 30).
  const a = region(1337, 29, 29, 3), b = region(1337, 29, 29, 3);
  assert.deepEqual(a.creatures, b.creatures);
  const species = new Set(a.creatures.map((c) => c.species));
  assert.ok(a.creatures.length > 10, `creatures ${a.creatures.length}`);
  assert.ok(species.has('trout'), 'fish in the river/lake');
  assert.ok(species.has('deer') || species.has('rabbit'), 'land animals');
  for (const c of a.creatures) {
    assert.match(c.id, /^fauna:(deer|rabbit|trout):\d+,\d+:\d+$/);
    assert.equal(c.tier, 'ambient');
    if (c.species === 'trout') {
      const w = residentWaterAt(a.world, Math.floor(c.x), Math.floor(c.z));
      assert.ok(w && c.y > w.bed && c.y < w.top, `fish ${c.id} is in water`);
    } else {
      const h = residentSurfaceAt(a.world, Math.floor(c.x), Math.floor(c.z))!;
      assert.equal(c.y, h);
      assert.notEqual(getVoxel(a.world, Math.floor(c.x), h - 1, Math.floor(c.z)), MAT.WATER);
    }
  }
});

test('creatures stay in habitat, never generate chunks, and flee from people', () => {
  const { world, creatures } = region(1337, 29, 29, 2);
  const before = world.chunks.size;
  const land = creatures.find((c) => c.species !== 'trout')!;
  const fish = creatures.find((c) => c.species === 'trout')!;
  assert.ok(land && fish);
  for (let i = 0; i < 600; i++) for (const c of creatures) stepCreature(world, c, { threats: [], night: false });
  assert.equal(world.chunks.size, before, 'behaviour must not materialize chunks');
  for (const c of creatures) {
    if (c.species === 'trout') {
      const w = residentWaterAt(world, Math.floor(c.x), Math.floor(c.z));
      assert.ok(w, `${c.id} left the water`);
    } else {
      assert.ok(residentSurfaceAt(world, Math.floor(c.x), Math.floor(c.z)) !== null);
      assert.ok(Math.hypot(c.x - c.homeX, c.z - c.homeZ) <= SPECIES[c.species].range * 2 + 20, `${c.id} strayed`);
    }
  }
  const threat = { x: land.x + 2, z: land.z };
  const start = Math.hypot(land.x - threat.x, land.z - threat.z);
  for (let i = 0; i < 20; i++) stepCreature(world, land, { threats: [threat], night: false });
  assert.equal(land.behaviour, 'flee');
  assert.ok(Math.hypot(land.x - threat.x, land.z - threat.z) > start + 3, 'the animal ran away');
});

test('diurnal animals sleep at night', () => {
  const { world, creatures } = region(1337, 29, 29, 2);
  const land = creatures.filter((c) => c.species !== 'trout');
  for (let i = 0; i < 400; i++) for (const c of land) stepCreature(world, c, { threats: [], night: true });
  assert.ok(land.filter((c) => c.behaviour === 'sleep').length >= Math.ceil(land.length / 2));
});
