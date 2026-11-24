// M008 ground vegetation and world-asset optimisation (FEAT-003).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GameSession } from '../src/app/session';
import { renderBreakdown } from '../src/app/render-breakdown';
import {
  CHUNK_SIZE, GENERATOR_V2, LATEST_GENERATOR_VERSION, MAT, SEA_LEVEL, World, Y_MIN, chunkKey, createWorld,
  ensureChunk, forestScore, localIndex, worldToChunkX, worldToChunkZ, yToIndex,
} from '../src/sim/world';
import { DM, fieldRect, findFieldSpot, homesteadLayout } from '../src/sim/homestead';
import { OBSTRUCTION_RADIUS } from '../src/sim/terrain';
import {
  CoverPiece, GROUND_COVER_RADIUS, GroundCoverView, coverExclusions, groundCoverChunk,
} from '../src/render/ground-cover';
import { buildMacroMesh, buildWaterSurface, VoxelTerrainView } from '../src/render/terrain';
import { buildNoxelNature } from '../src/render/nature';
import { LodBatch, TiledLodMesh } from '../src/render/lod';
import { SHADOW_HALF_EXTENT, snapShadowCentre } from '../src/render/sky';
import { AnimalBatch } from '../src/render/animal-kit';
import { ANIMAL_MODELS } from '../src/render/animal-models';

const FOREST = { x: 220, z: -110 };
const FARM = { x: -28, z: 4 };

/** Resident chunks (and so their entities) within `r` chunks of a point. */
function loadAround(world: World, p: { x: number; z: number }, r: number, order: 1 | -1 = 1): Set<string> {
  const ccx = worldToChunkX(p.x), ccz = worldToChunkZ(p.z);
  const keys = new Set<string>();
  const list: Array<[number, number]> = [];
  for (let dz = -r - 1; dz <= r + 1; dz++) for (let dx = -r - 1; dx <= r + 1; dx++) list.push([ccx + dx, ccz + dz]);
  if (order < 0) list.reverse();
  for (const [cx, cz] of list) {
    ensureChunk(world, cx, cz);
    if (Math.abs(cx - ccx) <= r && Math.abs(cz - ccz) <= r) keys.add(chunkKey(cx, cz));
  }
  return keys;
}

function chunkCover(world: World, cx: number, cz: number): CoverPiece[] {
  return groundCoverChunk(world.seed, cx, cz, world.chunks.get(chunkKey(cx, cz))!, coverExclusions(world));
}

function founded(): GameSession {
  const s = GameSession.genesis(1337, GENERATOR_V2);
  const send = (c: Record<string, unknown>) =>
    s.dispatch({ schema: 3, id: `test:${s.nextSequence}:${String(c.type)}`, expectedRevision: s.world.revision, ...c } as never);
  assert.ok(send({ type: 'found_homestead' }).ok);
  const spot = findFieldSpot(s.world, 6, 4, 'wheat');
  assert.ok(spot);
  assert.ok(send({ type: 'mark_field', ...spot }).ok);
  return s;
}

test('ground cover is deterministic per chunk and independent of chunk load order', () => {
  const a = createWorld(1337, LATEST_GENERATOR_VERSION);
  const b = createWorld(1337, LATEST_GENERATOR_VERSION);
  loadAround(a, FOREST, 2, 1);
  loadAround(b, FOREST, 2, -1);
  const ccx = worldToChunkX(FOREST.x), ccz = worldToChunkZ(FOREST.z);
  let total = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const pa = chunkCover(a, ccx + dx, ccz + dz), pb = chunkCover(b, ccx + dx, ccz + dz);
    assert.deepEqual(pa, pb);
    assert.deepEqual(chunkCover(a, ccx + dx, ccz + dz), pa, 'same chunk twice gives the same pieces');
    total += pa.length;
  }
  assert.ok(total > 100, `forest chunks carry ground cover (${total})`);
  // The view builds the same mesh whichever way the chunks were loaded.
  const va = new GroundCoverView(a), vb = new GroundCoverView(b);
  va.update(FOREST, loadAround(a, FOREST, 3, 1));
  vb.update(FOREST, loadAround(b, FOREST, 3, -1));
  assert.deepEqual(va.metrics(), vb.metrics());
  assert.deepEqual([...(va.mesh.geometry.attributes.position.array as Float32Array)],
    [...(vb.mesh.geometry.attributes.position.array as Float32Array)]);
});

test('ground cover never lands on water, edits, structures, homestead cells or within tree clearance', () => {
  const s = founded();
  const world = s.world;
  const h = world.homestead!;
  const rects = [...homesteadLayout(h).map((f) => f.rect), ...h.plots.map((p) => fieldRect(p))]
    .map((r) => ({ x0: r.x0 / DM, z0: r.z0 / DM, x1: r.x1 / DM, z1: r.z1 / DM }));
  const centre = { x: (rects[0].x0 + rects[0].x1) / 2, z: (rects[0].z0 + rects[0].z1) / 2 };
  const loaded = loadAround(world, centre, 3);
  // Plus the river and lake near the founder valley.
  for (const p of [{ x: 0, z: 0 }, FOREST]) for (const k of loadAround(world, p, 2)) loaded.add(k);
  const ex = coverExclusions(world);
  let pieces = 0, water = 0;
  for (const key of loaded) {
    const chunk = world.chunks.get(key)!;
    for (const p of groundCoverChunk(world.seed, chunk.cx, chunk.cz, chunk, ex)) {
      pieces++;
      const lx = Math.floor(p.x) - (chunk.cx * CHUNK_SIZE - 1024), lz = Math.floor(p.z) - (chunk.cz * CHUNK_SIZE - 1024);
      const col = lz * CHUNK_SIZE + lx;
      assert.ok(p.y > SEA_LEVEL, 'above the sea');
      assert.equal(p.y, chunk.heights[col] + Y_MIN + 1, 'stands on the surface');
      assert.equal(chunk.data[localIndex(lx, yToIndex(p.y), lz)], MAT.AIR, 'never in water');
      const top = chunk.topMaterials[col];
      assert.ok([MAT.GRASS, MAT.SOIL, MAT.MOSS, MAT.STONE, MAT.GRAVEL].includes(top as never), `top ${top}`);
      for (const r of rects) {
        assert.ok(!(p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1), `${p.kind} inside homestead rect at ${p.x},${p.z}`);
      }
      for (const e of world.entities.values()) {
        const radius = (OBSTRUCTION_RADIUS as Record<string, number>)[e.kind] ?? 1;
        assert.ok(Math.hypot(p.x - e.x, p.z - e.z) >= radius, `${p.kind} within ${e.kind} clearance`);
      }
      for (const site of world.sites) {
        assert.ok(Math.hypot(p.x - site.x, p.z - site.z) >= OBSTRUCTION_RADIUS[site.kind]);
      }
    }
    // Water columns exist in these chunks and none got a piece.
    for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
      const y = chunk.heights[i] + Y_MIN + 1;
      if (y <= SEA_LEVEL) water++;
    }
  }
  assert.ok(pieces > 200 && water > 0, `${pieces} pieces, ${water} water columns checked`);
  // A newly marked field clears its cells.
  const plot = h.plots[0];
  const fr = fieldRect(plot);
  const cx = worldToChunkX(Math.floor(fr.x0 / DM)), cz = worldToChunkZ(Math.floor(fr.z0 / DM));
  const bare = { ...ex, rects: [], key: 'none' };
  const without = groundCoverChunk(world.seed, cx, cz, world.chunks.get(chunkKey(cx, cz))!, bare);
  const inside = (p: CoverPiece) => p.x > fr.x0 / DM && p.x < fr.x1 / DM && p.z > fr.z0 / DM && p.z < fr.z1 / DM;
  assert.ok(without.some(inside), 'the field area would have cover without the exclusion');
});

test('ground cover is denser in forest than in meadow and includes every kind', () => {
  const world = createWorld(1337, LATEST_GENERATOR_VERSION);
  const forest = new GroundCoverView(world);
  forest.update(FOREST, loadAround(world, FOREST, 3));
  const meadow = new GroundCoverView(world);
  meadow.update(FARM, loadAround(world, FARM, 3));
  const f = forest.metrics(), m = meadow.metrics();
  assert.ok(forestScore(FOREST.x, FOREST.z, world.seed) > 0.5 && forestScore(FARM.x, FARM.z, world.seed) < 0.3);
  for (const kind of ['fern', 'bush', 'sapling', 'log', 'mushroom', 'stone', 'grass', 'flower']) {
    assert.ok((f.byKind[kind] ?? 0) > 0, `forest has ${kind}`);
  }
  assert.ok((m.byKind.grass ?? 0) > 100 && (m.byKind.flower ?? 0) > 50, 'meadow has grass and flowers');
  assert.equal(m.byKind.log ?? 0, 0, 'no logs in open meadow');
  // Understory: forest carries more triangles of decoration and more tall pieces.
  const tall = (x: typeof f) => (x.byKind.fern ?? 0) + (x.byKind.bush ?? 0) + (x.byKind.sapling ?? 0) + (x.byKind.log ?? 0);
  assert.ok(tall(f) > 4 * tall(m), `forest understory ${tall(f)} vs meadow ${tall(m)}`);
  assert.ok(f.triangles > m.triangles);
  // Budget guard: measured 13,676 (forest) and 10,334 (farm meadow).
  assert.ok(f.triangles <= 16000 && m.triangles <= 13000, `${f.triangles} / ${m.triangles}`);
  // Only pieces inside the ring are drawn.
  const pos = forest.mesh.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 37) {
    assert.ok(Math.hypot(pos.getX(i) - FOREST.x, pos.getZ(i) - FOREST.z) < GROUND_COVER_RADIUS + 3);
  }
});

test('ground cover adds no entities and leaves the genesis hash unchanged', () => {
  const s = GameSession.genesis(1337);
  const loaded = loadAround(s.world, { x: -27, z: -30 }, 2);
  const hash = s.stateHash;
  const ids = [...s.world.entities.keys()].sort();
  const view = new GroundCoverView(s.world);
  view.update({ x: -27, z: -30 }, loaded);
  assert.ok(view.metrics().pieces > 0);
  assert.equal(s.stateHash, hash);
  assert.equal(GameSession.genesis(1337).stateHash, 'e659504b056654dc');
  assert.deepEqual([...s.world.entities.keys()].sort(), ids);
});

test('shadow policy: ground cover, far vegetation, macro tiles and near chunks cast no shadow', () => {
  const world = createWorld(1337, LATEST_GENERATOR_VERSION);
  const view = new GroundCoverView(world);
  view.update(FOREST, loadAround(world, FOREST, 3));
  assert.equal(view.mesh.castShadow, false);
  assert.equal(view.mesh.receiveShadow, true);
  const hits: THREE.Intersection[] = [];
  view.mesh.raycast(new THREE.Raycaster(new THREE.Vector3(FOREST.x, 100, FOREST.z), new THREE.Vector3(0, -1, 0)), hits);
  assert.equal(hits.length, 0, 'ground cover is never picked');

  const macro = buildMacroMesh(world, { step: 8, focus: FOREST });
  assert.ok(macro.meshes.length > 1);
  for (const m of macro.meshes) assert.equal(m.castShadow, false);

  const scene = new THREE.Scene();
  const terrain = new VoxelTerrainView(world, scene, { nearRadius: 1 });
  terrain.frameBudgetMs = Number.POSITIVE_INFINITY;
  terrain.preload(new THREE.Vector3(FOREST.x, 20, FOREST.z));
  let chunks = 0;
  scene.traverse((o) => {
    if (o.name.startsWith('voxel_chunk_') || o.name.startsWith('macro_lod')) {
      assert.equal((o as THREE.Mesh).castShadow, false, o.name);
      if (o.name.startsWith('voxel_chunk_')) chunks++;
    }
  });
  assert.equal(chunks, 9);

  const batched = buildNoxelNature(world, loadAround(world, FOREST, 1), { camera: { x: FOREST.x, y: 30, z: FOREST.z } });
  assert.ok(batched.lod instanceof LodBatch);
  assert.equal((batched.lod as LodBatch).far.castShadow, false);
  const tiled = buildNoxelNature(world, loadAround(world, FOREST, 1), { camera: { x: FOREST.x + 400, y: 30, z: FOREST.z }, multiDraw: false });
  assert.ok(tiled.lod instanceof TiledLodMesh);
  tiled.group.traverse((o) => {
    if (o.name.endsWith('_tile_far')) assert.equal((o as THREE.Mesh).castShadow, false);
    if (o.name.endsWith('_tile')) assert.equal((o as THREE.Mesh).castShadow, true);
  });
});

test('macro LOD: map view unchanged, world view tiered and tiled under a measured bound', () => {
  const world = createWorld(1337, LATEST_GENERATOR_VERSION);
  const hole = (p: { x: number; z: number }) => {
    const cx = worldToChunkX(p.x), cz = worldToChunkZ(p.z);
    return { minX: (cx - 3) * 32 - 1024, maxX: (cx + 4) * 32 - 1024, minZ: (cz - 3) * 32 - 1024, maxZ: (cz + 4) * 32 - 1024 };
  };
  // Before M008 the world view drew one 129,100 (farm) / 129,600 (forest) triangle mesh.
  const before = buildMacroMesh(world, { step: 8, hole: hole(FARM) });
  assert.equal(before.meshes.length, 1);
  assert.equal(before.triangles, 129100, 'map / untiled output is unchanged');
  for (const p of [FARM, FOREST]) {
    const r = buildMacroMesh(world, { step: 8, hole: hole(p), focus: p });
    assert.ok(r.triangles <= 75000, `tiered macro ${r.triangles} (measured 72,660 / 74,116)`);
    assert.ok(r.meshes.length >= 9);
    for (const m of r.meshes) assert.ok(m.geometry.boundingBox, 'tiles carry boxes for culling');
  }
  // Frustum culling: a camera looking down at the farm keeps only a few tiles.
  const scene = new THREE.Scene();
  const view = new VoxelTerrainView(world, scene, { nearRadius: 1 });
  view.preload(new THREE.Vector3(FARM.x, 14, FARM.z));
  const cam = new THREE.PerspectiveCamera(38, 1000 / 600, 0.5, 9000);
  cam.position.set(-28, 34, 38.6);
  cam.lookAt(-28, 14, 4);
  view.cullMacro(cam);
  assert.ok(view.macroVisibleTriangles < view.macroTriangleCount / 2,
    `visible ${view.macroVisibleTriangles} of ${view.macroTriangleCount}`);
  // Sea plane keeps its island lattice and drops the far ocean grid.
  const water = buildWaterSurface(world);
  assert.ok((water.geometry.index!.count / 3) <= 1200, 'measured 1,152 (was 18,432)');
});

test('without WEBGL_multi_draw the vegetation fallback keeps draw calls bounded and inspectable', () => {
  const world = createWorld(1337, LATEST_GENERATOR_VERSION);
  const loaded = loadAround(world, FOREST, 3);
  const camera = new THREE.PerspectiveCamera(38, 1000 / 600, 0.5, 9000);
  camera.position.set(235.1, 37.5, -68.5);
  camera.lookAt(FOREST.x, 14, FOREST.z);
  camera.updateMatrixWorld();
  const measure = (multiDraw: boolean) => {
    const scene = new THREE.Scene();
    const nature = buildNoxelNature(world, loaded, { camera: camera.position, multiDraw });
    scene.add(nature.group);
    scene.updateMatrixWorld(true);
    return { nature, b: renderBreakdown(scene, { camera, multiDraw: false, shadows: false }) };
  };
  const batched = measure(true);
  const tiled = measure(false);
  assert.ok(batched.nature.instances > 400);
  // A BatchedMesh on such a GPU pays one call per visible tree.
  assert.ok(batched.b.totals.main.draws > 100, `batched fallback ${batched.b.totals.main.draws}`);
  // The tiled fallback: at most two calls per 96 m tile.
  const lod = tiled.nature.lod as TiledLodMesh;
  assert.ok(lod.tileCount <= 16);
  assert.ok(tiled.b.totals.main.draws <= 20, `tiled draws ${tiled.b.totals.main.draws}`);
  assert.deepEqual(tiled.nature.lodCounts, batched.nature.lodCounts, 'same LOD bands either way');
  // Raycasts report the entity under the hit triangle.
  const tree = [...world.entities.values()].find((e) => e.kind.startsWith('styl_tree_') && loaded.has(e.chunk)
    && Math.hypot(e.x - camera.position.x, e.z - camera.position.z) < 50)!;
  const ray = new THREE.Raycaster(new THREE.Vector3(tree.x, tree.y + 40, tree.z), new THREE.Vector3(0, -1, 0));
  const hits = ray.intersectObjects(tiled.nature.group.children, true) as Array<THREE.Intersection & { batchId?: number }>;
  assert.ok(hits.length > 0 && typeof hits[0].batchId === 'number');
  const ids = hits[0].object.userData.inspectableBatchIds as string[];
  assert.equal(ids[hits[0].batchId!], tree.id);
  // Band switches rebuild only the affected tiles.
  const builds = lod.tileBuilds;
  lod.update({ x: camera.position.x + 6, y: camera.position.y, z: camera.position.z });
  assert.ok(lod.tileBuilds - builds < lod.tileCount);
});

test('sun shadow box snaps to texels and herds cull by a sphere around their animals', () => {
  const dir = new THREE.Vector3(0.4, 0.8, 0.45).normalize();
  const texel = (2 * SHADOW_HALF_EXTENT) / 2048;
  const a = snapShadowCentre(new THREE.Vector3(10.03, 5, -3.31), dir, texel);
  const b = snapShadowCentre(new THREE.Vector3(10.03 + texel * 0.3, 5, -3.31), dir, texel);
  assert.ok(a.distanceTo(new THREE.Vector3(10.03, 5, -3.31)) <= texel);
  assert.ok(a.distanceTo(b) < 1e-9 || a.distanceTo(b) >= texel * 0.99, 'centres move in whole texels');

  const herd = new AnimalBatch(ANIMAL_MODELS.deer, 8, 'herd_test');
  herd.begin();
  const pose = { heading: 0, scale: 1, phase: 0, legSwing: 0, headPitch: 0, tailWag: 0, male: true, young: false, lying: false, extra: 0 };
  herd.push({ ...pose, x: 100, y: 10, z: 50 });
  herd.push({ ...pose, x: 130, y: 12, z: 70 });
  herd.end();
  assert.equal(herd.mesh.frustumCulled, true);
  const s = herd.mesh.boundingSphere!;
  for (const p of [[100, 10, 50], [130, 12, 70]]) assert.ok(s.distanceToPoint(new THREE.Vector3(...p)) <= -AnimalBatch.BOUNDS_MARGIN + 1e-6);
  assert.equal(herd.count, 2, 'culling never drops animals from the batch');
});
