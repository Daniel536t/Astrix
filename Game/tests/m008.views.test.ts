// M008 review v1: zoomed-out macro draw calls, the drawn near ring at long
// zoom, the tiled vegetation fallback while panning, and shadow box / ground
// cover anchored to the ground on screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LATEST_GENERATOR_VERSION, World, chunkKey, createWorld, ensureChunk, worldToChunkX, worldToChunkZ } from '../src/sim/world';
import { MACRO_BRIDGE_TRIANGLES, NEAR_DISPLAY_DISTANCES, VoxelTerrainView, nearDisplayRadius } from '../src/render/terrain';
import { buildNoxelNature } from '../src/render/nature';
import { DEFAULT_LOD_BANDS, LOD_FAR, TILED_LOD_BAKES_PER_UPDATE, TiledLodMesh } from '../src/render/lod';
import { alongView, viewGroundOffset } from '../src/render/camera';
import { SHADOW_HALF_EXTENT, SHADOW_LEAD, shadowCentre, shadowLead } from '../src/render/sky';
import { GROUND_COVER_RADIUS, groundCoverOffset } from '../src/render/ground-cover';

const FARM = { x: -28, z: 4 };
const FOREST = { x: 220, z: -110 };

function loadAround(world: World, p: { x: number; z: number }, r: number): Set<string> {
  const ccx = worldToChunkX(p.x), ccz = worldToChunkZ(p.z);
  const keys = new Set<string>();
  for (let dz = -r - 1; dz <= r + 1; dz++) for (let dx = -r - 1; dx <= r + 1; dx++) {
    ensureChunk(world, ccx + dx, ccz + dz);
    if (Math.abs(dx) <= r && Math.abs(dz) <= r) keys.add(chunkKey(ccx + dx, ccz + dz));
  }
  return keys;
}

/** Builder camera as OrbitRig.setView places it (angles in radians). */
function orbit(target: THREE.Vector3, dist: number, pitch: number, yaw: number, aspect = 1000 / 600): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(38, aspect, 0.5, 9000);
  cam.position.set(
    target.x + dist * Math.cos(pitch) * Math.sin(yaw),
    target.y + dist * Math.sin(pitch),
    target.z + dist * Math.cos(pitch) * Math.cos(yaw),
  );
  cam.lookAt(target);
  cam.updateMatrixWorld(true);
  return cam;
}

test('macro tiles: wide views draw the visible tiles in a few runs, close views still cull', () => {
  const world = createWorld(1337, LATEST_GENERATOR_VERSION);
  const scene = new THREE.Scene();
  const view = new VoxelTerrainView(world, scene, { nearRadius: 1 });
  const target = new THREE.Vector3(FARM.x, 14, FARM.z);
  view.preload(target);
  const tiles: THREE.Mesh[] = [];
  scene.traverse((o) => { if (o.name.startsWith('macro_lod_tile_')) tiles.push(o as THREE.Mesh); });
  assert.ok(tiles.length >= 9);
  // One shared vertex and index buffer for every tile.
  for (const t of tiles) assert.equal(t.geometry.index, tiles[0].geometry.index);
  const cases: Array<[number, number, number, number]> = [
    // dist, pitch, yaw, max macro calls. At 1400 m / 0.35 rad 40 tiles are
    // in view; before review v1 each was one call.
    [1400, 0.35, 0, 4], [1400, 1.25, 0, 4], [600, 0.6, 0, 4], [300, 0.5, 0, 6], [1400, 0.35, 2.2, 4],
  ];
  for (const [dist, pitch, yaw, maxCalls] of cases) {
    const cam = orbit(target, dist, pitch, yaw);
    view.cullMacro(cam);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const runs = tiles.filter((t) => t.visible).map((t) => ({ start: t.geometry.drawRange.start, end: t.geometry.drawRange.start + t.geometry.drawRange.count }));
    assert.ok(runs.length <= maxCalls, `dist ${dist} pitch ${pitch}: ${runs.length} macro calls`);
    let inView = 0, inViewTris = 0;
    for (const t of tiles) {
      const r = t.userData.macroRange as { start: number; count: number };
      if (!frustum.intersectsBox(t.geometry.boundingBox!)) continue;
      inView++;
      inViewTris += r.count / 3;
      // Every on-screen tile is inside one drawn run.
      assert.ok(runs.some((run) => run.start <= r.start && r.start + r.count <= run.end), `tile ${t.name} drawn`);
    }
    assert.equal(view.macroTilesInView, inView);
    // Bridged off-screen tiles add at most MACRO_BRIDGE_TRIANGLES per join.
    assert.ok(view.macroVisibleTriangles <= inViewTris + MACRO_BRIDGE_TRIANGLES * tiles.length);
  }
  // A close farm view still draws only part of the macro.
  view.cullMacro(orbit(target, 40, 0.52, 0));
  assert.ok(view.macroTilesInView <= 6);
  assert.ok(view.macroVisibleTriangles < view.macroTriangleCount / 2,
    `visible ${view.macroVisibleTriangles} of ${view.macroTriangleCount}`);
});

test('zoomed out, the drawn near ring shrinks while every chunk stays loaded and the macro fills the gap', () => {
  // Pure radius choice with hysteresis (nearRadius 3, as in the game).
  assert.deepEqual(NEAR_DISPLAY_DISTANCES, [220, 450]);
  assert.equal(nearDisplayRadius(40, 3), 3);
  assert.equal(nearDisplayRadius(300, 3), 2);
  assert.equal(nearDisplayRadius(600, 3), 1);
  assert.equal(nearDisplayRadius(1400, 3), 1);
  assert.equal(nearDisplayRadius(210, 3, 2), 2, 'kept until below 220 x 0.9');
  assert.equal(nearDisplayRadius(190, 3, 2), 3);
  assert.equal(nearDisplayRadius(420, 3, 1), 1);
  assert.equal(nearDisplayRadius(400, 3, 1), 2);
  assert.equal(nearDisplayRadius(1400, 1), 1, 'never below one chunk');

  const world = createWorld(1337, LATEST_GENERATOR_VERSION);
  const scene = new THREE.Scene();
  const view = new VoxelTerrainView(world, scene, { nearRadius: 2 });
  const target = new THREE.Vector3(FARM.x, 14, FARM.z);
  view.preload(target);
  view.setViewDistance(40);
  view.update(target);
  const loaded = new Set(view.loadedChunkKeys);
  const fullMacro = view.macroTriangleCount;
  const fullCalls = view.drawCalls;
  assert.equal(view.displayRadiusChunks, 2);
  assert.equal(view.displayedChunks, loaded.size);
  const chunkMeshes = () => {
    const out = new Map<string, boolean>();
    scene.traverse((o) => { const m = /^voxel_chunk_(\d+)_(\d+)$/.exec(o.name); if (m) out.set(`${m[1]},${m[2]}`, o.visible); });
    return out;
  };

  view.setViewDistance(600);
  view.update(target);
  assert.equal(view.displayRadiusChunks, 1);
  assert.deepEqual(new Set(view.loadedChunkKeys), loaded, 'presentation only: the loaded set is unchanged');
  const ccx = worldToChunkX(Math.round(target.x)), ccz = worldToChunkZ(Math.round(target.z));
  let shown = 0;
  for (const [key, visible] of chunkMeshes()) {
    const [cx, cz] = key.split(',').map(Number);
    assert.equal(visible, Math.abs(cx - ccx) <= 1 && Math.abs(cz - ccz) <= 1, `chunk ${key}`);
    if (visible) shown++;
  }
  assert.equal(shown, 9);
  assert.equal(view.displayedChunks, 9);
  assert.ok(view.macroTriangleCount > fullMacro, 'the macro mesh now covers the hidden ring');
  assert.ok(view.drawCalls < fullCalls - 10, `calls ${view.drawCalls} vs ${fullCalls}`);

  // Zooming back in restores the full ring and the original macro hole.
  view.setViewDistance(40);
  view.update(target);
  assert.equal(view.displayRadiusChunks, 2);
  assert.equal(view.displayedChunks, loaded.size);
  for (const visible of chunkMeshes().values()) assert.ok(visible);
  assert.equal(view.macroTriangleCount, fullMacro);
  assert.equal(view.drawCalls, fullCalls);
});

test('tiled vegetation fallback spreads re-bakes over frames while panning and converges when the camera stops', () => {
  const world = createWorld(1337, LATEST_GENERATOR_VERSION);
  const loaded = loadAround(world, FOREST, 3);
  const cam = orbit(new THREE.Vector3(FOREST.x, 14, FOREST.z), 50, THREE.MathUtils.degToRad(28), THREE.MathUtils.degToRad(20));
  const nature = buildNoxelNature(world, loaded, { camera: cam.position, multiDraw: false });
  const lod = nature.lod as TiledLodMesh;
  assert.ok(lod instanceof TiledLodMesh);
  const bakedTriangles = () => {
    let t = 0;
    nature.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.visible) t += m.geometry.attributes.position.count / 3; });
    return t;
  };
  assert.equal(lod.pendingBakes, 0);
  assert.equal(bakedTriangles(), lod.drawnTriangles(), 'initial bake matches the bands');
  const pos = cam.position.clone();
  let maxBakes = 0;
  for (let i = 0; i < 40; i++) {
    pos.x += 1.2; pos.z -= 0.6;
    const before = lod.meshBakes;
    lod.update(pos);
    maxBakes = Math.max(maxBakes, lod.meshBakes - before);
  }
  assert.ok(maxBakes <= TILED_LOD_BAKES_PER_UPDATE, `at most ${TILED_LOD_BAKES_PER_UPDATE} mesh bakes per update (saw ${maxBakes})`);
  assert.ok(lod.stats().switches > 0);
  // Camera stops: pending tiles keep baking without movement and converge.
  for (let i = 0; i < 40 && lod.pendingBakes > 0; i++) lod.update(pos);
  assert.equal(lod.pendingBakes, 0);
  assert.equal(bakedTriangles(), lod.drawnTriangles(), 'baked geometry matches the bands once drained');
  lod.update(new THREE.Vector3(pos.x, pos.y + 4000, pos.z), true);
  assert.equal(lod.pendingBakes, 0, 'force bakes everything at once');
  assert.equal(bakedTriangles(), lod.drawnTriangles());

  // A near/mid switch re-bakes only the shadow-casting near/mid mesh of its
  // tile; entering the far band re-bakes both meshes together.
  const small = new TiledLodMesh({ name: 'probe', material: new THREE.MeshBasicMaterial() });
  const box = () => new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const g = { near: small.addGeometry(0, box()), mid: small.addGeometry(1, box()), far: small.addGeometry(LOD_FAR, box()), triangles: [12, 12, 12] as [number, number, number] };
  small.addInstance(g, new THREE.Matrix4(), { x: 10, y: 0, z: 10 });
  small.update({ x: 10, y: 0, z: 10 }, true);
  small.finish();
  const b0 = small.meshBakes;
  small.update({ x: 10 + DEFAULT_LOD_BANDS.near + 20, y: 0, z: 10 });
  assert.equal(small.bandAt(0), 1);
  assert.equal(small.meshBakes - b0, 1, 'near to mid: one mesh');
  small.update({ x: 10 + DEFAULT_LOD_BANDS.mid + 40, y: 0, z: 10 });
  assert.equal(small.bandAt(0), LOD_FAR);
  assert.equal(small.meshBakes - b0, 3, 'into far: both meshes in the same update');
});

test('shadow box and ground cover cover the nearest ground on screen at long zoom', () => {
  const target = new THREE.Vector3(FOREST.x, 14, FOREST.z);
  const pitch = THREE.MathUtils.degToRad(28), yaw = THREE.MathUtils.degToRad(20);
  // Close views keep the first-pass anchors.
  for (const dist of [30, 40, 50]) {
    const near = viewGroundOffset(orbit(target, dist, pitch, yaw), target);
    assert.ok(near < 0 && near > -30, `bottom edge ${near.toFixed(1)} m`);
    assert.equal(shadowLead(near), SHADOW_LEAD);
    assert.equal(groundCoverOffset(near), 0);
  }
  for (const [dist, p] of [[140, pitch], [300, 0.5], [600, 0.6], [1400, 0.35]] as const) {
    const cam = orbit(target, dist, p, yaw);
    const near = viewGroundOffset(cam, target);
    // The bottom-centre screen ray really meets the target plane there.
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, -1), cam);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -target.y), new THREE.Vector3())!;
    assert.ok(hit.distanceTo(alongView(target, cam.position, near)) < 0.01, `dist ${dist}: ground hit`);
    // Shadow box (half extent along the view axis) reaches past the hit.
    const centre = shadowCentre(target, cam.position, new THREE.Vector3(), shadowLead(near));
    const dir = new THREE.Vector3(target.x - cam.position.x, 0, target.z - cam.position.z).normalize();
    const along = (v: THREE.Vector3) => (v.x - target.x) * dir.x + (v.z - target.z) * dir.z;
    assert.ok(along(centre) - SHADOW_HALF_EXTENT < along(hit), `dist ${dist}: shadow box reaches the bottom edge`);
    // Ground cover disc reaches past the hit as well.
    const cover = alongView(target, cam.position, groundCoverOffset(near));
    assert.ok(cover.distanceTo(new THREE.Vector3(hit.x, target.y, hit.z)) < GROUND_COVER_RADIUS, `dist ${dist}: ground cover reaches the bottom edge`);
  }
  // Also on a portrait phone viewport (same vertical FOV, so the same anchors).
  const phone = orbit(target, 140, pitch, yaw, 390 / 844);
  assert.ok(Math.abs(viewGroundOffset(phone, target) - viewGroundOffset(orbit(target, 140, pitch, yaw), target)) < 1e-9);
  assert.equal(DEFAULT_LOD_BANDS.near, 90);
});
