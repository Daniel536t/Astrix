import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  MAT, SEA_LEVEL, Y_MIN, Y_MAX, WORLD_SIZE, CHUNK_SIZE, GENERATOR_VERSION,
  World, generateWorld, createWorld, generateChunk, ensureChunk, getVoxel, setVoxel,
  surfaceAt, surfaceHeightAt, topMaterialAtWorld, waterDepthAt, isSolid,
  worldToChunkX, worldToChunkZ, chunkKey, nearestHarvestable, harvestEntity,
  exportChunkDelta, applyChunkDelta, worldManifest, localIndex, chunkOriginX, chunkOriginZ,
} from '../src/sim/world';

function checksum(chunk: { data: Uint8Array }): number {
  let h = 2166136261;
  for (let i = 0; i < chunk.data.length; i++) {
    h ^= chunk.data[i];
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function findLandColumn(world: World): { x: number; z: number; y: number } {
  for (let z = -40; z <= 40; z++) {
    for (let x = -40; x <= 40; x++) {
      const y = surfaceAt(world, x, z);
      if (y <= SEA_LEVEL + 2) continue;
      const top = topMaterialAtWorld(world, x, z);
      if (top !== MAT.GRASS && top !== MAT.MOSS) continue;
      let solidBelow = 0;
      for (let d = 1; d <= 5; d++) if (isSolid(getVoxel(world, x, y - d, z))) solidBelow++;
      if (solidBelow === 5) return { x, z, y };
    }
  }
  throw new Error('no suitable land column found');
}

function findWaterColumn(world: World): { x: number; z: number } {
  for (let z = -90; z <= 90; z += 3) {
    for (let x = -90; x <= 90; x += 3) {
      if (surfaceAt(world, x, z) < SEA_LEVEL && getVoxel(world, x, SEA_LEVEL - 1, z) === MAT.WATER) {
        return { x, z };
      }
    }
  }
  throw new Error('no water column found');
}

test('deterministic generation: same seed, same chunks, entities and sites', () => {
  const a = generateWorld(1337, 0);
  const b = generateWorld(1337, 0);
  assert.deepEqual([...a.chunks.keys()].sort(), [...b.chunks.keys()].sort());
  for (const [key, chunk] of a.chunks) {
    const other = b.chunks.get(key);
    assert.ok(other, `missing chunk ${key}`);
    assert.equal(checksum(chunk), checksum(other), `chunk ${key} differs`);
    assert.deepEqual([...chunk.heights], [...other.heights], `heights ${key} differ`);
  }
  assert.deepEqual([...a.entities.keys()].sort(), [...b.entities.keys()].sort());
  for (const [id, e] of a.entities) {
    const other = b.entities.get(id)!;
    assert.deepEqual([e.x, e.y, e.z, e.kind, e.variant], [other.x, other.y, other.z, other.kind, other.variant]);
  }
  assert.deepEqual(a.sites, b.sites);
  assert.equal(a.stats.trees, b.stats.trees);
  assert.equal(a.stats.pinkTrees, b.stats.pinkTrees);
});

test('different seed changes the terrain', () => {
  const a = generateWorld(1337, 0);
  const b = generateWorld(1338, 0);
  const key = [...a.chunks.keys()][0];
  assert.notEqual(checksum(a.chunks.get(key)!), checksum(b.chunks.get(key)!));
});

test('chunk generation is independent of generation order', () => {
  const orderA: Array<[number, number]> = [[32, 32], [31, 32], [32, 31], [31, 31]];
  const orderB: Array<[number, number]> = [[31, 31], [32, 31], [31, 32], [32, 32]];
  const a = createWorld(1337);
  const b = createWorld(1337);
  for (const [cx, cz] of orderA) generateChunk(a, cx, cz);
  for (const [cx, cz] of orderB) generateChunk(b, cx, cz);
  for (const [key, chunk] of a.chunks) {
    assert.equal(checksum(chunk), checksum(b.chunks.get(key)!), `chunk ${key} depends on order`);
  }
  assert.deepEqual([...a.entities.keys()].sort(), [...b.entities.keys()].sort());
});

test('surfaceAt is the exposed top face, not the height model', () => {
  const world = generateWorld(1337, 3);
  const land = findLandColumn(world);
  assert.ok(isSolid(getVoxel(world, land.x, land.y - 1, land.z)));
  assert.ok(!isSolid(getVoxel(world, land.x, land.y, land.z)));
  // An intact column matches the height model. Carved overhangs and added
  // ledges intentionally make other columns differ; surfaceAt must follow the
  // actual voxel volume, which is why it is not defined as surfaceHeightAt.
  assert.equal(surfaceAt(world, land.x, land.z), surfaceHeightAt(world.seed, land.x, land.z));
  assert.equal(getVoxel(world, 0, Y_MIN - 1, 0), MAT.BEDROCK);
  assert.equal(getVoxel(world, 0, Y_MAX, 0), MAT.AIR);
  assert.equal(getVoxel(world, WORLD_SIZE, 0, 0), MAT.AIR);
  assert.equal(setVoxel(world, WORLD_SIZE, 0, 0, MAT.STONE), false);
});

test('material layers: grass top over soil and stone, with no air pocket below', () => {
  const world = generateWorld(1337, 3);
  const c = findLandColumn(world);
  assert.equal(topMaterialAtWorld(world, c.x, c.z), getVoxel(world, c.x, c.y - 1, c.z));
  assert.ok([MAT.GRASS, MAT.MOSS].includes(topMaterialAtWorld(world, c.x, c.z)));
  const below = getVoxel(world, c.x, c.y - 2, c.z);
  assert.ok([MAT.SOIL, MAT.STONE, MAT.GRAVEL].includes(below), `unexpected subsoil ${below}`);
  for (let d = 1; d <= 5; d++) assert.ok(isSolid(getVoxel(world, c.x, c.y - d, c.z)));
  assert.ok(isSolid(getVoxel(world, c.x, Y_MIN, c.z)), 'world floor must be solid');
});

test('water columns hold water at sea level and report depth', () => {
  const world = generateWorld(1337, 3);
  const w = findWaterColumn(world);
  assert.equal(getVoxel(world, w.x, SEA_LEVEL - 1, w.z), MAT.WATER);
  assert.ok(waterDepthAt(world, w.x, w.z) > 0);
  const land = findLandColumn(world);
  assert.equal(waterDepthAt(world, land.x, land.z), 0);
});

test('voxel edits are authoritative, recorded as deltas and reversible', () => {
  const world = generateWorld(1337, 3);
  const c = findLandColumn(world);
  const key = chunkKey(worldToChunkX(c.x), worldToChunkZ(c.z));
  const original = getVoxel(world, c.x, c.y - 1, c.z);
  assert.equal(setVoxel(world, c.x, c.y - 1, c.z, MAT.AIR), true);
  assert.equal(getVoxel(world, c.x, c.y - 1, c.z), MAT.AIR);
  assert.equal(world.edits.get(key)?.size, 1);
  assert.ok(world.dirty.has(key));
  assert.ok(surfaceAt(world, c.x, c.z) <= c.y - 1);
  assert.equal(setVoxel(world, c.x, c.y - 1, c.z, MAT.AIR), false, 'no-op edits must not be recorded');

  const delta = exportChunkDelta(world, key);
  assert.equal(delta.schema, 1);
  assert.equal(delta.baseVersion, GENERATOR_VERSION);
  assert.equal(delta.edits.length, 1);

  const restored = generateWorld(1337, 3);
  applyChunkDelta(restored, delta);
  assert.equal(getVoxel(restored, c.x, c.y - 1, c.z), MAT.AIR);
  assert.equal(restored.edits.get(key)?.size, 1);

  setVoxel(world, c.x, c.y - 1, c.z, original);
  assert.equal(getVoxel(world, c.x, c.y - 1, c.z), original);
  assert.equal(surfaceAt(world, c.x, c.z), c.y);
});

test('entities sit on the exposed surface, not one metre below it', () => {
  const world = generateWorld(1337, 3);
  assert.ok(world.entities.size > 20);
  for (const e of world.entities.values()) {
    const y = surfaceAt(world, Math.floor(e.x), Math.floor(e.z));
    assert.equal(e.y, y, `${e.id} is not on the surface`);
    assert.equal(e.chunk, chunkKey(worldToChunkX(Math.floor(e.x)), worldToChunkZ(Math.floor(e.z))));
    if (!e.kind.startsWith('styl_') && e.kind !== 'waystone' && e.kind !== 'marker') {
      assert.fail(`unexpected entity kind ${e.kind}`);
    }
  }
  assert.ok(world.sites.some((s) => s.kind === 'waystone'));
  assert.ok(world.sites.some((s) => s.kind === 'marker'));
});

test('harvesting is owned by the simulation and depletes the entity', () => {
  const world = generateWorld(1337, 3);
  const tree = [...world.entities.values()].find((e) => e.kind.startsWith('styl_tree') && !e.harvested);
  assert.ok(tree);
  const before = world.inventory.wood ?? 0;
  let total = 0;
  for (let i = 0; i < 3; i++) {
    const result = harvestEntity(world, tree!.id);
    assert.ok(result);
    total += result.amount;
    if (i === 0) {
      assert.equal(tree!.harvestedOnce, true);
      assert.equal(tree!.harvested, false, 'one harvest must not deplete a 12-yield tree');
    }
  }
  assert.equal(world.inventory.wood, before + total);
  assert.equal(tree!.harvested, true);
  assert.equal(harvestEntity(world, tree!.id), null);
  assert.notEqual(nearestHarvestable(world, tree!.x, tree!.z, 0.1, 'wood')?.id, tree!.id);
});

test('world manifest pins generator parameters', () => {
  const world = generateWorld(1337, 0);
  const manifest = worldManifest(world);
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.seed, 1337);
  assert.equal(manifest.generatorVersion, GENERATOR_VERSION);
  assert.equal(manifest.size, WORLD_SIZE);
  assert.equal(manifest.chunkSize, CHUNK_SIZE);
  assert.equal(manifest.yMin, Y_MIN);
  assert.equal(manifest.yMax, Y_MAX);
  assert.equal(manifest.seaLevel, SEA_LEVEL);
  assert.match(manifest.paramsHash, /^[0-9a-f]{8}$/);
});

test('simulation layer does not import the renderer or three.js', () => {
  const dir = resolve(process.cwd(), 'src/sim');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  assert.ok(files.length > 0);
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    assert.ok(!/from\s+['"]three['"]/.test(text), `${f} imports three`);
    assert.ok(!/from\s+['"][^'"]*\/render\//.test(text), `${f} imports the renderer`);
  }
});

test('chunk-local indexing matches world coordinates', () => {
  const world = generateWorld(1337, 0);
  const chunk = world.chunks.get('32,32')!;
  for (let lz = 0; lz < CHUNK_SIZE; lz += 7) {
    for (let lx = 0; lx < CHUNK_SIZE; lx += 7) {
      const x = chunkOriginX(32) + lx;
      const z = chunkOriginZ(32) + lz;
      const y = surfaceAt(world, x, z) - 1;
      const idx = localIndex(lx, y - Y_MIN, lz);
      assert.equal(chunk.data[idx], getVoxel(world, x, y, z));
    }
  }
});
