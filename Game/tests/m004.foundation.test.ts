import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  MAT, chunkKey, createWorld, editVersion, ensureChunk, residentSurfaceAt, residentVoxelAt,
  setVoxel, surfaceAt, worldToChunkX, worldToChunkZ, CHUNK_SIZE,
} from '../src/sim/world';
import { createWorldSnapshot, restoreWorldSnapshot } from '../src/sim/snapshot';
import { VoxelTerrainView } from '../src/render/terrain';
import { buildNoxelNature } from '../src/render/nature';
import { GameSession } from '../src/app/session';

test('resident queries never generate chunks and agree with generating queries', () => {
  const world = createWorld(1337);
  assert.equal(residentSurfaceAt(world, 10, 10), null);
  assert.equal(residentVoxelAt(world, 10, 5, 10), null);
  assert.equal(world.chunks.size, 0, 'resident queries must not materialize chunks');
  const generated = surfaceAt(world, 10, 10);
  assert.equal(residentSurfaceAt(world, 10, 10), generated);
  assert.equal(residentVoxelAt(world, 10, generated - 1, 10) !== MAT.AIR, true);
  assert.equal(residentVoxelAt(world, 10, -999, 10), MAT.BEDROCK);
  assert.equal(residentSurfaceAt(world, 5000, 0), null, 'outside the world is null');
});

test('edit version advances on real edits and snapshot restore, not on no-ops', () => {
  const world = createWorld(1337);
  const y = surfaceAt(world, 3, 3);
  const v0 = editVersion(world);
  assert.ok(setVoxel(world, 3, y, 3, MAT.STONE));
  const v1 = editVersion(world);
  assert.ok(v1 > v0);
  assert.equal(setVoxel(world, 3, y, 3, MAT.STONE), false);
  assert.equal(editVersion(world), v1, 'a no-op write is not a change');
  restoreWorldSnapshot(world, createWorldSnapshot(world, 0));
  assert.ok(editVersion(world) > v1, 'restoring a snapshot replaces the edit overlay');
});

test('terrain view keeps resident chunks bounded while travelling, and edits survive eviction', () => {
  const world = createWorld(1337);
  const scene = new THREE.Scene();
  const view = new VoxelTerrainView(world, scene, { nearRadius: 1 });
  view.frameBudgetMs = Number.POSITIVE_INFINITY;

  const editX = 2, editZ = 2;
  const editY = surfaceAt(world, editX, editZ);
  assert.ok(setVoxel(world, editX, editY, editZ, MAT.ORE));

  const focus = new THREE.Vector3(0, 10, 0);
  view.preload(focus);
  const keep = 1 + 2;
  const bound = (2 * keep + 1) ** 2;
  let maxResident = 0;
  for (let step = 0; step < 40; step++) {
    focus.x += CHUNK_SIZE / 2;
    focus.z += CHUNK_SIZE / 3;
    for (let f = 0; f < 30; f++) view.update(focus);
    maxResident = Math.max(maxResident, world.chunks.size);
  }
  assert.ok(view.evictedBySweep > 0, 'the sweep must release chunks behind the focus');
  assert.ok(maxResident <= bound, `resident chunks ${maxResident} exceed ${bound}`);
  assert.equal(world.chunks.has(chunkKey(worldToChunkX(editX), worldToChunkZ(editZ))), false,
    'the edited chunk is evicted once far away');
  assert.equal(surfaceAt(world, editX, editZ), editY + 1, 'the durable edit is reapplied on regeneration');
});

test('pinned regions stay resident through sweeps', () => {
  const world = createWorld(1337);
  const view = new VoxelTerrainView(world, new THREE.Scene(), { nearRadius: 1 });
  view.frameBudgetMs = Number.POSITIVE_INFINITY;
  view.pinRect(-60, -48, -25, -33);
  ensureChunk(world, worldToChunkX(-50), worldToChunkZ(-40));
  const focus = new THREE.Vector3(600, 10, 600);
  view.preload(focus);
  for (let f = 0; f < 60; f++) view.update(focus);
  assert.ok(world.chunks.has(chunkKey(worldToChunkX(-50), worldToChunkZ(-40))));
});

test('nature rebuilds reuse cached variant geometry with identical output', () => {
  const session = GameSession.genesis(1337);
  const first = buildNoxelNature(session.world);
  const second = buildNoxelNature(session.world);
  assert.ok(first.instances > 0);
  assert.equal(second.instances, first.instances);
  assert.equal(second.triangles, first.triangles);
});
