import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { renderBreakdown } from '../src/app/render-breakdown';

function sceneUnderTest() {
  const scene = new THREE.Scene();
  const mat = new THREE.MeshLambertMaterial();
  const box = new THREE.BoxGeometry(1, 1, 1); // 12 triangles
  const plane = new THREE.PlaneGeometry(1, 1); // 2 triangles

  const solo = new THREE.Mesh(box, mat);
  solo.name = 'solo';
  solo.castShadow = true;
  scene.add(solo);

  const inst = new THREE.InstancedMesh(box, mat, 8);
  inst.name = 'herd_deer';
  inst.count = 5;
  for (let i = 0; i < 8; i++) inst.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i * 2, 0, 0));
  inst.castShadow = false;
  scene.add(inst);

  const batch = new THREE.BatchedMesh(8, 200, 400, mat);
  batch.name = 'styl_nature_batch';
  batch.castShadow = true;
  const gBox = batch.addGeometry(box);
  const gPlane = batch.addGeometry(plane);
  for (let i = 0; i < 3; i++) {
    const id = batch.addInstance(gBox);
    batch.setMatrixAt(id, new THREE.Matrix4().makeTranslation(i * 2, 0, 3));
  }
  batch.setMatrixAt(batch.addInstance(gPlane), new THREE.Matrix4().makeTranslation(0, 0, -3));
  // Far away: culled by the main camera and the shadow camera.
  batch.setMatrixAt(batch.addInstance(gBox), new THREE.Matrix4().makeTranslation(1000, 0, 0));
  // Hidden instance: never drawn.
  const hidden = batch.addInstance(gBox);
  batch.setVisibleAt(hidden, false);
  const group = new THREE.Group();
  group.name = 'natureGroup';
  group.add(batch);
  scene.add(group);

  // Transparent DoubleSide: drawn back then front faces in the main pass.
  const water = new THREE.Mesh(plane, new THREE.MeshLambertMaterial({ transparent: true, side: THREE.DoubleSide }));
  water.name = 'water_chunk_1_2';
  water.position.set(-3, 0, 0);
  water.castShadow = true;
  scene.add(water);

  const off = new THREE.Mesh(box, mat);
  off.name = 'chunk_3_-2';
  off.visible = false;
  off.castShadow = true;
  scene.add(off);

  const sun = new THREE.DirectionalLight('#fff', 1);
  sun.castShadow = true;
  sun.position.set(10, 30, 10);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50; sc.near = 0.5; sc.far = 200;
  sc.updateProjectionMatrix();
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  camera.position.set(0, 20, 40);
  camera.lookAt(0, 0, 0);

  scene.updateMatrixWorld();
  camera.updateMatrixWorld();
  sun.shadow.updateMatrices(sun);
  return { scene, camera, inst, batch, off };
}

test('breakdown counts draws and drawn triangles for Mesh, InstancedMesh and BatchedMesh', () => {
  const { scene, camera } = sceneUnderTest();
  const fakeRenderer = { info: { render: { calls: 7, triangles: 1234 } }, shadowMap: { enabled: true } };
  const b = renderBreakdown(scene, { camera, renderer: fakeRenderer });

  assert.deepEqual(b.owners.solo.main, { draws: 1, triangles: 12 });
  assert.deepEqual(b.owners.solo.shadow, { draws: 1, triangles: 12 });
  assert.deepEqual(b.owners.herd_deer.main, { draws: 1, triangles: 60 });
  assert.deepEqual(b.owners.herd_deer.shadow, { draws: 0, triangles: 0 });
  // 3 boxes + 1 plane in view; the far and hidden instances are skipped.
  assert.deepEqual(b.owners.natureGroup.main, { draws: 1, triangles: 38 });
  assert.deepEqual(b.owners.natureGroup.shadow, { draws: 1, triangles: 38 });
  // Invisible mesh: listed but costs nothing; numeric name parts are collapsed.
  const chunk = b.entries.find((e) => e.mesh === 'chunk_#_#');
  assert.ok(chunk);
  assert.equal(chunk.meshes, 1);
  assert.equal(chunk.visible, 0);
  assert.deepEqual(chunk.main, { draws: 0, triangles: 0 });

  assert.deepEqual(b.owners['water_chunk_#_#'].main, { draws: 2, triangles: 4 });
  assert.deepEqual(b.owners['water_chunk_#_#'].shadow, { draws: 1, triangles: 2 });

  assert.deepEqual(b.totals.main, { draws: 5, triangles: 114 });
  assert.deepEqual(b.totals.shadow, { draws: 3, triangles: 52 });
  assert.deepEqual(b.totals.all, { draws: 8, triangles: 166 });
  assert.equal(b.shadowLights, 1);
  assert.deepEqual(b.renderer, { calls: 7, triangles: 1234 });
  const nature = b.entries.find((e) => e.mesh === 'styl_nature_batch');
  assert.equal(nature?.type, 'BatchedMesh');
  assert.equal(nature?.instances, 6);
  assert.equal(nature?.castShadow, 1);
});

test('breakdown respects shadow toggles, frustum culling and stays read-only', () => {
  const { scene, camera, inst, batch, off } = sceneUnderTest();
  const before = { count: inst.count, vis: off.visible, n: batch.instanceCount };
  const noShadow = renderBreakdown(scene, { camera, shadows: false });
  assert.equal(noShadow.shadowLights, 0);
  assert.deepEqual(noShadow.totals.shadow, { draws: 0, triangles: 0 });

  // Toggling castShadow moves the batch out of the shadow pass only.
  batch.castShadow = false;
  const b = renderBreakdown(scene, { camera });
  assert.deepEqual(b.totals.shadow, { draws: 2, triangles: 14 });
  assert.deepEqual(b.totals.main, { draws: 5, triangles: 114 });

  // Without a camera nothing is frustum culled: the far batch box counts.
  const all = renderBreakdown(scene, { shadows: false });
  assert.deepEqual(all.owners.natureGroup.main, { draws: 1, triangles: 50 });

  // Looking away from everything culls the main pass entirely.
  camera.lookAt(0, 20, 400);
  camera.updateMatrixWorld();
  const away = renderBreakdown(scene, { camera, shadows: false });
  assert.deepEqual(away.totals.main, { draws: 0, triangles: 0 });
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  // Without WEBGL_multi_draw three.js issues one call per drawn batch instance.
  const fallback = renderBreakdown(scene, { camera, shadows: false, multiDraw: false });
  assert.deepEqual(fallback.owners.natureGroup.main, { draws: 4, triangles: 38 });
  assert.equal(fallback.multiDraw, false);
  const ext = renderBreakdown(scene, { camera, renderer: { info: { render: { calls: 0, triangles: 0 } }, extensions: { has: () => false } } });
  assert.equal(ext.multiDraw, false);

  assert.deepEqual({ count: inst.count, vis: off.visible, n: batch.instanceCount }, before);
});
