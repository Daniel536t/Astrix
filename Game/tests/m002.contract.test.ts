import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAT, Y_MIN, Y_MAX, surfaceAt, topMaterialAtWorld, getVoxel, setVoxel,
  generateChunk, removeEntity, isSolid, chunkKey,
} from '../src/sim/world';
import {
  columnAt, clearanceAt, obstructionsIn, TerrainQuery, rectColumns,
  envelopeContains, VoxelRegion,
} from '../src/sim/terrain';
import {
  canonicalRegionHash, canonicalInventoryHash, canonicalEntityHash,
  derivedCacheHash, checkDerivedCaches, editsOutsideEnvelope,
  newChunksOutsideEnvelope, worldChunkRegion,
} from '../src/sim/canonical';
import { createM002Fixture, createM002Live, M002_LAYOUT } from '../src/sim/m002';

const FULL_CELLS = 20 * 32 * 32 * 128;

function protectedHash(world: ReturnType<typeof createM002Fixture>['world'], envelope = M002_LAYOUT.envelope) {
  return canonicalRegionHash(world, M002_LAYOUT.protectedRegion, envelope);
}

test('M002 fixture is deterministic across independent builds', () => {
  const a = createM002Fixture();
  const b = createM002Fixture();
  assert.deepEqual(a.chunkKeys, b.chunkKeys);
  assert.equal(a.chunkKeys.length, 20);

  const ha = canonicalRegionHash(a.world, a.layout.protectedRegion);
  const hb = canonicalRegionHash(b.world, b.layout.protectedRegion);
  assert.equal(ha.hash, hb.hash);
  assert.equal(ha.chunks, 20);
  assert.equal(ha.cells, FULL_CELLS);
  assert.equal(ha.excludedCells, 0);

  assert.equal(
    canonicalEntityHash(a.world, a.layout.protectedRegion),
    canonicalEntityHash(b.world, b.layout.protectedRegion),
  );
  assert.equal(canonicalInventoryHash(a.world), canonicalInventoryHash(b.world));
});

test('column query agrees with the authoritative voxel volume', () => {
  const { world } = createM002Fixture();
  const x = -56, z = -43;
  const col = columnAt(world, x, z);
  assert.equal(col.surfaceY, surfaceAt(world, x, z));
  assert.equal(col.topSolidY, col.surfaceY - 1);
  assert.equal(col.topMaterial, topMaterialAtWorld(world, x, z));
  assert.equal(col.solid, true);
  assert.equal(col.waterDepth, 0);
  assert.equal(col.underwater, false);
  assert.ok(col.slope <= 1);
  assert.ok(col.clearance >= 2);
  assert.ok(isSolid(getVoxel(world, x, col.surfaceY - 1, z)));
  assert.equal(getVoxel(world, x, col.surfaceY, z), MAT.AIR);
  assert.equal(clearanceAt(world, x, z, 3), true);
});

test('area stats distinguish the rejected slope from the viable shelf and farm', () => {
  const { world, layout } = createM002Fixture();
  const q = new TerrainQuery(world);

  const rejected = q.area(layout.rejected.rect);
  assert.ok(rejected.relief >= 5, `rejected relief ${rejected.relief}`);
  assert.ok(rejected.maxStep <= 2, `rejected maxStep ${rejected.maxStep}`);
  assert.ok(rejected.obstructedColumns > 0, 'rejected site must have an obstruction');
  assert.ok(rejected.obstructions.some((o) => o.kind.startsWith('styl_rock')));

  const house = q.area(layout.house.rect);
  assert.equal(house.relief, 2);
  assert.equal(house.obstructedColumns, 0, 'viable shelf must be obstruction-free');
  assert.equal(house.obstructions.length, 0);
  assert.equal(house.waterColumns, 0);

  const farm = q.area(layout.farm.rect);
  assert.ok(farm.relief >= 3, `farm relief ${farm.relief}`);
  assert.ok(farm.obstructions.some((o) => o.kind === 'styl_tree_blossom'));
  assert.equal(farm.waterColumns, 0);
});

test('footprint query reports cut, fill and obstructions for a floor', () => {
  const { world, layout } = createM002Fixture();
  const q = new TerrainQuery(world);

  const house = q.footprint(layout.house.rect, layout.house.floorY);
  assert.equal(house.support.total, rectColumns(layout.house.rect));
  assert.ok(house.support.cut > 0);
  assert.ok(house.support.fill > 0);
  assert.ok(house.support.level > 0);
  assert.equal(house.support.maxCut, 1);
  assert.equal(house.support.maxFill, 1);
  assert.equal(house.support.water, 0);
  assert.equal(house.support.deepFill, 0);
  assert.equal(house.stats.cutVolume, house.support.cutVolume);
  assert.equal(house.stats.fillVolume, house.support.fillVolume);
  assert.equal(house.obstructions.length, 0);

  const rejected = q.footprint(layout.rejected.rect, layout.rejected.floorY);
  assert.ok(rejected.support.maxCut >= 5);
  assert.ok(rejected.stats.cutVolume >= 40);
  assert.ok(rejected.obstructions.length > 0);
});

test('canonical voxel hash ignores derived cache and dirty-flag changes', () => {
  const { world, layout } = createM002Fixture();
  const beforeVoxel = protectedHash(world);
  const beforeCache = derivedCacheHash(world, layout.protectedRegion);
  assert.deepEqual(checkDerivedCaches(world, layout.protectedRegion), []);

  // Chunk 28,29 is inside the protected region and outside the envelope.
  const chunk = world.chunks.get('28,29');
  assert.ok(chunk);
  const oldHeight = chunk!.heights[0];
  const oldMaterial = chunk!.topMaterials[0];
  chunk!.heights[0] = (oldHeight + 1) % 128;
  chunk!.topMaterials[0] = MAT.ORE;
  chunk!.dirty = true;
  world.dirty.add('28,29');

  const afterVoxel = protectedHash(world);
  const afterCache = derivedCacheHash(world, layout.protectedRegion);
  assert.equal(afterVoxel.hash, beforeVoxel.hash, 'derived caches must not change voxel state');
  assert.equal(afterVoxel.cells, beforeVoxel.cells);
  assert.notEqual(afterCache.hash, beforeCache.hash);
  const mismatches = checkDerivedCaches(world, layout.protectedRegion);
  assert.ok(mismatches.length >= 2, 'both height and material cache mismatches expected');
  assert.ok(mismatches.some((m) => m.field === 'height'));
  assert.ok(mismatches.some((m) => m.field === 'material'));

  chunk!.heights[0] = oldHeight;
  chunk!.topMaterials[0] = oldMaterial;
  chunk!.dirty = false;
  world.dirty.delete('28,29');
  assert.equal(protectedHash(world).hash, beforeVoxel.hash);
  assert.equal(derivedCacheHash(world, layout.protectedRegion).hash, beforeCache.hash);
  assert.deepEqual(checkDerivedCaches(world, layout.protectedRegion), []);
});

test('canonical voxel hash detects an unauthorized edit outside the envelope', () => {
  const { world } = createM002Fixture();
  const before = protectedHash(world);
  const x = -120, z = -80;
  const y = surfaceAt(world, x, z) - 1;
  assert.equal(setVoxel(world, x, y, z, MAT.AIR), true);
  const after = protectedHash(world);
  assert.notEqual(after.hash, before.hash);
  assert.equal(after.cells, before.cells);

  const outside = editsOutsideEnvelope(world, M002_LAYOUT.envelope);
  assert.equal(outside.length, 1);
  assert.deepEqual([outside[0].x, outside[0].y, outside[0].z], [x, y, z]);
});

test('authorized edit inside the envelope leaves protected terrain and resources unchanged', () => {
  const fixture = createM002Fixture();
  const { world, layout } = fixture;
  const beforeVoxel = protectedHash(world);
  const beforeAll = canonicalRegionHash(world, layout.protectedRegion);
  const beforeInventory = canonicalInventoryHash(world);
  const beforeEntities = canonicalEntityHash(world, layout.protectedRegion);

  // A foundation edit under the house floor, inside the declared envelope.
  assert.equal(setVoxel(world, -56, 10, -43, MAT.STONE), true);

  const afterVoxel = protectedHash(world);
  const afterAll = canonicalRegionHash(world, layout.protectedRegion);
  assert.equal(afterVoxel.hash, beforeVoxel.hash, 'protected terrain changed');
  assert.equal(afterVoxel.excludedCells, beforeVoxel.excludedCells);
  assert.notEqual(afterAll.hash, beforeAll.hash, 'the edit must be visible in the envelope');
  assert.equal(canonicalInventoryHash(world), beforeInventory);
  assert.equal(canonicalEntityHash(world, layout.protectedRegion), beforeEntities);
  assert.deepEqual(editsOutsideEnvelope(world, layout.envelope), []);
  assert.deepEqual(newChunksOutsideEnvelope(world, fixture.chunkKeys, layout.envelope), []);
  assert.equal(world.edits.get('30,30')?.size, 1);
  assert.equal(world.dirty.has('30,30'), true);
});

test('inventory hash is canonical and order-independent', () => {
  const { world } = createM002Fixture();
  world.inventory = { wood: 2, stone: 1 };
  const a = canonicalInventoryHash(world);
  world.inventory = { stone: 1, wood: 2 };
  const b = canonicalInventoryHash(world);
  assert.equal(a, b);
  world.inventory = { stone: 2, wood: 1 };
  assert.notEqual(a, canonicalInventoryHash(world));
});

test('entity hash detects an unauthorized entity change without changing terrain', () => {
  const { world, layout } = createM002Fixture();
  const beforeVoxel = protectedHash(world);
  const beforeEntities = canonicalEntityHash(world, layout.protectedRegion);
  const outside = [...world.entities.values()].find(
    (e) => !envelopeContains(layout.envelope, Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)),
  );
  assert.ok(outside, 'expected an entity outside the envelope');
  const revision = world.revision;
  assert.equal(removeEntity(world, outside!.id), true);
  assert.ok(world.revision > revision);
  assert.notEqual(canonicalEntityHash(world, layout.protectedRegion), beforeEntities);
  assert.equal(protectedHash(world).hash, beforeVoxel.hash, 'entity removal must not mutate voxels');
});

test('hash coverage is exactly the protected region minus the envelope', () => {
  const { world, layout } = createM002Fixture();
  const region = worldChunkRegion(world);
  assert.deepEqual(region, layout.protectedRegion);
  const all = canonicalRegionHash(world, region);
  const protectedOnly = canonicalRegionHash(world, region, layout.envelope);
  assert.equal(all.cells, FULL_CELLS);
  assert.equal(protectedOnly.cells + protectedOnly.excludedCells, FULL_CELLS);
  assert.ok(protectedOnly.excludedCells > 3000);
  assert.equal(protectedOnly.chunks, 20);
});

test('new chunks outside the envelope are detected even when voxels are untouched', () => {
  const fixture = createM002Fixture();
  const { world, layout } = fixture;
  const before = protectedHash(world);
  generateChunk(world, 27, 29);
  assert.equal(protectedHash(world).hash, before.hash);
  const added = newChunksOutsideEnvelope(world, fixture.chunkKeys, layout.envelope);
  assert.ok(added.includes(chunkKey(27, 29)), `added chunks: ${added.join(',')}`);
});

test('live 2048 m world: authorized edit leaves protected terrain unchanged', () => {
  const live = createM002Live();
  const { world, layout } = live;
  assert.ok(world.chunks.size >= 81, `live chunks ${world.chunks.size}`);
  const region = worldChunkRegion(world);
  const before = canonicalRegionHash(world, region, layout.envelope);
  const beforeInventory = canonicalInventoryHash(world);
  const beforeEntities = canonicalEntityHash(world, region);

  assert.equal(setVoxel(world, -56, 10, -43, MAT.STONE), true);

  const after = canonicalRegionHash(world, region, layout.envelope);
  assert.equal(after.hash, before.hash, 'live protected terrain changed');
  assert.equal(after.cells, before.cells);
  assert.equal(after.excludedCells, before.excludedCells);
  assert.equal(canonicalInventoryHash(world), beforeInventory);
  assert.equal(canonicalEntityHash(world, region), beforeEntities);
  assert.deepEqual(editsOutsideEnvelope(world, layout.envelope), []);
  assert.deepEqual(newChunksOutsideEnvelope(world, live.chunkKeys, layout.envelope), []);
});
