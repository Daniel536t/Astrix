// tests/m008.breakdown.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE2 from "three";

// src/app/render-breakdown.ts
import * as THREE from "three";
var _frustum = new THREE.Frustum();
var _proj = new THREE.Matrix4();
var _m = new THREE.Matrix4();
var _sphere = new THREE.Sphere();
function frustumOf(camera, out = new THREE.Frustum()) {
  _proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  return out.setFromProjectionMatrix(_proj, camera.coordinateSystem, camera.reversedDepth);
}
function graphVisible(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
function ownerOf(o, root) {
  let top = o;
  while (top.parent && top.parent !== root) top = top.parent;
  return top;
}
function label(o) {
  return (o.name || o.type).replace(/-?\d+(\.\d+)?/g, "#");
}
function elementCount(g) {
  return g.index ? g.index.count : g.attributes.position?.count ?? 0;
}
function passes(mat, main) {
  return main && mat.transparent && mat.side === THREE.DoubleSide && !mat.forceSinglePass ? 2 : 1;
}
function groupCounts(obj, main) {
  const g = obj.geometry;
  const total = elementCount(g);
  const rs = Math.max(0, g.drawRange.start);
  const re = Math.min(total, g.drawRange.start + g.drawRange.count);
  const mats = obj.material;
  if (Array.isArray(mats) && g.groups.length > 0) {
    const out = [];
    for (const grp of g.groups) {
      const mat2 = mats[grp.materialIndex ?? 0];
      if (!mat2 || !mat2.visible) continue;
      const s = Math.max(rs, grp.start), e = Math.min(re, grp.start + grp.count);
      if (e > s) for (let p = passes(mat2, main); p > 0; p--) out.push(e - s);
    }
    return out;
  }
  const mat = Array.isArray(mats) ? mats[0] : mats;
  if (!mat || !mat.visible) return [];
  return re > rs ? new Array(passes(mat, main)).fill(re - rs) : [];
}
function trianglesPerElement(obj) {
  return obj.isMesh ? 1 / 3 : 0;
}
function drawCost(obj, frustum, multiDraw, main) {
  if (frustum && obj.frustumCulled && !frustum.intersectsObject(obj)) return null;
  const perEl = trianglesPerElement(obj);
  if (obj.isBatchedMesh) {
    const b = obj;
    const info = b._instanceInfo;
    const mat = Array.isArray(b.material) ? b.material[0] : b.material;
    if (!mat || !mat.visible) return null;
    const range = { indexCount: 0, vertexCount: 0 };
    const indexed = !!b.geometry.index;
    let elements2 = 0, drawn = 0;
    for (let i = 0; i < info.length; i++) {
      const it = info[i];
      if (!it.active || !it.visible) continue;
      if (frustum && b.perObjectFrustumCulled) {
        b.getMatrixAt(i, _m);
        const s = b.getBoundingSphereAt(it.geometryIndex, _sphere);
        if (s && !frustum.intersectsSphere(s.applyMatrix4(_m).applyMatrix4(b.matrixWorld))) continue;
      }
      b.getGeometryRangeAt(it.geometryIndex, range);
      elements2 += indexed ? range.indexCount : range.vertexCount;
      drawn++;
    }
    if (drawn === 0) return null;
    const p = passes(mat, main);
    return { draws: (multiDraw ? 1 : drawn) * p, triangles: Math.round(elements2 * perEl) * p };
  }
  const counts = groupCounts(obj, main);
  if (counts.length === 0) return null;
  const inst = obj.isInstancedMesh ? obj.count : 1;
  if (inst <= 0) return null;
  let elements = 0;
  for (const c of counts) elements += c;
  return { draws: counts.length, triangles: Math.round(elements * perEl * inst) };
}
function instancesOf(obj) {
  if (obj.isBatchedMesh) return obj.instanceCount;
  if (obj.isInstancedMesh) return obj.count;
  return 1;
}
function typeOf(obj) {
  if (obj.isBatchedMesh) return "BatchedMesh";
  if (obj.isInstancedMesh) return "InstancedMesh";
  if (obj.isMesh) return "Mesh";
  if (obj.isLine) return "Line";
  return "Points";
}
var add = (a, b) => {
  if (b) {
    a.draws += b.draws;
    a.triangles += b.triangles;
  }
};
var zero = () => ({ draws: 0, triangles: 0 });
function renderBreakdown(scene, opts = {}) {
  const camera = opts.camera;
  const mainFrustum = camera ? frustumOf(camera, _frustum) : null;
  const drawables = [];
  const shadowViews = [];
  const shadowsOn = opts.shadows ?? opts.renderer?.shadowMap?.enabled ?? true;
  const multiDraw = opts.multiDraw ?? opts.renderer?.extensions?.has("WEBGL_multi_draw") ?? true;
  scene.traverse((o) => {
    const any = o;
    if (any.isMesh || any.isLine || any.isPoints) drawables.push(o);
    if (shadowsOn && any.isLight && any.castShadow && any.shadow && graphVisible(o)) {
      const shadow = any.shadow;
      if (any.isPointLight) {
        shadowViews.push({ frustum: null, layers: shadow.camera.layers, repeat: 6 });
      } else {
        shadowViews.push({ frustum: frustumOf(shadow.camera, new THREE.Frustum()), layers: shadow.camera.layers, repeat: 1 });
      }
    }
  });
  const byKey = /* @__PURE__ */ new Map();
  const totals = { main: zero(), shadow: zero(), all: zero() };
  for (const obj of drawables) {
    const owner = label(ownerOf(obj, scene));
    const mesh = label(obj);
    const key = `${owner}/${mesh}/${typeOf(obj)}`;
    let e = byKey.get(key);
    if (!e) {
      e = { owner, mesh, type: typeOf(obj), meshes: 0, visible: 0, castShadow: 0, instances: 0, main: zero(), shadow: zero() };
      byKey.set(key, e);
    }
    e.meshes++;
    const vis = graphVisible(obj);
    if (!vis) continue;
    e.visible++;
    e.instances += instancesOf(obj);
    if (!camera || obj.layers.test(camera.layers)) add(e.main, drawCost(obj, mainFrustum, multiDraw, true));
    if (obj.castShadow) {
      e.castShadow++;
      for (const v of shadowViews) {
        if (!obj.layers.test(v.layers)) continue;
        const c = drawCost(obj, v.frustum, multiDraw, false);
        if (c) add(e.shadow, { draws: c.draws * v.repeat, triangles: c.triangles * v.repeat });
      }
    }
  }
  const entries = [...byKey.values()].sort((a, b) => b.main.draws + b.shadow.draws - (a.main.draws + a.shadow.draws) || b.main.triangles + b.shadow.triangles - (a.main.triangles + a.shadow.triangles));
  const owners = {};
  for (const e of entries) {
    const o = owners[e.owner] ??= { meshes: 0, main: zero(), shadow: zero(), total: zero() };
    o.meshes += e.meshes;
    add(o.main, e.main);
    add(o.shadow, e.shadow);
    add(o.total, e.main);
    add(o.total, e.shadow);
    add(totals.main, e.main);
    add(totals.shadow, e.shadow);
  }
  add(totals.all, totals.main);
  add(totals.all, totals.shadow);
  const out = { owners, entries, totals, shadowLights: shadowViews.length, multiDraw };
  if (opts.renderer) out.renderer = { calls: opts.renderer.info.render.calls, triangles: opts.renderer.info.render.triangles };
  return out;
}

// tests/m008.breakdown.test.ts
function sceneUnderTest() {
  const scene = new THREE2.Scene();
  const mat = new THREE2.MeshLambertMaterial();
  const box = new THREE2.BoxGeometry(1, 1, 1);
  const plane = new THREE2.PlaneGeometry(1, 1);
  const solo = new THREE2.Mesh(box, mat);
  solo.name = "solo";
  solo.castShadow = true;
  scene.add(solo);
  const inst = new THREE2.InstancedMesh(box, mat, 8);
  inst.name = "herd_deer";
  inst.count = 5;
  for (let i = 0; i < 8; i++) inst.setMatrixAt(i, new THREE2.Matrix4().makeTranslation(i * 2, 0, 0));
  inst.castShadow = false;
  scene.add(inst);
  const batch = new THREE2.BatchedMesh(8, 200, 400, mat);
  batch.name = "styl_nature_batch";
  batch.castShadow = true;
  const gBox = batch.addGeometry(box);
  const gPlane = batch.addGeometry(plane);
  for (let i = 0; i < 3; i++) {
    const id = batch.addInstance(gBox);
    batch.setMatrixAt(id, new THREE2.Matrix4().makeTranslation(i * 2, 0, 3));
  }
  batch.setMatrixAt(batch.addInstance(gPlane), new THREE2.Matrix4().makeTranslation(0, 0, -3));
  batch.setMatrixAt(batch.addInstance(gBox), new THREE2.Matrix4().makeTranslation(1e3, 0, 0));
  const hidden = batch.addInstance(gBox);
  batch.setVisibleAt(hidden, false);
  const group = new THREE2.Group();
  group.name = "natureGroup";
  group.add(batch);
  scene.add(group);
  const water = new THREE2.Mesh(plane, new THREE2.MeshLambertMaterial({ transparent: true, side: THREE2.DoubleSide }));
  water.name = "water_chunk_1_2";
  water.position.set(-3, 0, 0);
  water.castShadow = true;
  scene.add(water);
  const off = new THREE2.Mesh(box, mat);
  off.name = "chunk_3_-2";
  off.visible = false;
  off.castShadow = true;
  scene.add(off);
  const sun = new THREE2.DirectionalLight("#fff", 1);
  sun.castShadow = true;
  sun.position.set(10, 30, 10);
  const sc = sun.shadow.camera;
  sc.left = -50;
  sc.right = 50;
  sc.top = 50;
  sc.bottom = -50;
  sc.near = 0.5;
  sc.far = 200;
  sc.updateProjectionMatrix();
  scene.add(sun, sun.target);
  const camera = new THREE2.PerspectiveCamera(60, 1, 0.1, 500);
  camera.position.set(0, 20, 40);
  camera.lookAt(0, 0, 0);
  scene.updateMatrixWorld();
  camera.updateMatrixWorld();
  sun.shadow.updateMatrices(sun);
  return { scene, camera, inst, batch, off };
}
test("breakdown counts draws and drawn triangles for Mesh, InstancedMesh and BatchedMesh", () => {
  const { scene, camera } = sceneUnderTest();
  const fakeRenderer = { info: { render: { calls: 7, triangles: 1234 } }, shadowMap: { enabled: true } };
  const b = renderBreakdown(scene, { camera, renderer: fakeRenderer });
  assert.deepEqual(b.owners.solo.main, { draws: 1, triangles: 12 });
  assert.deepEqual(b.owners.solo.shadow, { draws: 1, triangles: 12 });
  assert.deepEqual(b.owners.herd_deer.main, { draws: 1, triangles: 60 });
  assert.deepEqual(b.owners.herd_deer.shadow, { draws: 0, triangles: 0 });
  assert.deepEqual(b.owners.natureGroup.main, { draws: 1, triangles: 38 });
  assert.deepEqual(b.owners.natureGroup.shadow, { draws: 1, triangles: 38 });
  const chunk = b.entries.find((e) => e.mesh === "chunk_#_#");
  assert.ok(chunk);
  assert.equal(chunk.meshes, 1);
  assert.equal(chunk.visible, 0);
  assert.deepEqual(chunk.main, { draws: 0, triangles: 0 });
  assert.deepEqual(b.owners["water_chunk_#_#"].main, { draws: 2, triangles: 4 });
  assert.deepEqual(b.owners["water_chunk_#_#"].shadow, { draws: 1, triangles: 2 });
  assert.deepEqual(b.totals.main, { draws: 5, triangles: 114 });
  assert.deepEqual(b.totals.shadow, { draws: 3, triangles: 52 });
  assert.deepEqual(b.totals.all, { draws: 8, triangles: 166 });
  assert.equal(b.shadowLights, 1);
  assert.deepEqual(b.renderer, { calls: 7, triangles: 1234 });
  const nature = b.entries.find((e) => e.mesh === "styl_nature_batch");
  assert.equal(nature?.type, "BatchedMesh");
  assert.equal(nature?.instances, 6);
  assert.equal(nature?.castShadow, 1);
});
test("breakdown respects shadow toggles, frustum culling and stays read-only", () => {
  const { scene, camera, inst, batch, off } = sceneUnderTest();
  const before = { count: inst.count, vis: off.visible, n: batch.instanceCount };
  const noShadow = renderBreakdown(scene, { camera, shadows: false });
  assert.equal(noShadow.shadowLights, 0);
  assert.deepEqual(noShadow.totals.shadow, { draws: 0, triangles: 0 });
  batch.castShadow = false;
  const b = renderBreakdown(scene, { camera });
  assert.deepEqual(b.totals.shadow, { draws: 2, triangles: 14 });
  assert.deepEqual(b.totals.main, { draws: 5, triangles: 114 });
  const all = renderBreakdown(scene, { shadows: false });
  assert.deepEqual(all.owners.natureGroup.main, { draws: 1, triangles: 50 });
  camera.lookAt(0, 20, 400);
  camera.updateMatrixWorld();
  const away = renderBreakdown(scene, { camera, shadows: false });
  assert.deepEqual(away.totals.main, { draws: 0, triangles: 0 });
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const fallback = renderBreakdown(scene, { camera, shadows: false, multiDraw: false });
  assert.deepEqual(fallback.owners.natureGroup.main, { draws: 4, triangles: 38 });
  assert.equal(fallback.multiDraw, false);
  const ext = renderBreakdown(scene, { camera, renderer: { info: { render: { calls: 0, triangles: 0 } }, extensions: { has: () => false } } });
  assert.equal(ext.multiDraw, false);
  assert.deepEqual({ count: inst.count, vis: off.visible, n: batch.instanceCount }, before);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vbTAwOC5icmVha2Rvd24udGVzdC50cyIsICIuLi8uLi9zcmMvYXBwL3JlbmRlci1icmVha2Rvd24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB0ZXN0IGZyb20gJ25vZGU6dGVzdCc7XG5pbXBvcnQgYXNzZXJ0IGZyb20gJ25vZGU6YXNzZXJ0L3N0cmljdCc7XG5pbXBvcnQgKiBhcyBUSFJFRSBmcm9tICd0aHJlZSc7XG5pbXBvcnQgeyByZW5kZXJCcmVha2Rvd24gfSBmcm9tICcuLi9zcmMvYXBwL3JlbmRlci1icmVha2Rvd24nO1xuXG5mdW5jdGlvbiBzY2VuZVVuZGVyVGVzdCgpIHtcbiAgY29uc3Qgc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcbiAgY29uc3QgbWF0ID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoKTtcbiAgY29uc3QgYm94ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KDEsIDEsIDEpOyAvLyAxMiB0cmlhbmdsZXNcbiAgY29uc3QgcGxhbmUgPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeSgxLCAxKTsgLy8gMiB0cmlhbmdsZXNcblxuICBjb25zdCBzb2xvID0gbmV3IFRIUkVFLk1lc2goYm94LCBtYXQpO1xuICBzb2xvLm5hbWUgPSAnc29sbyc7XG4gIHNvbG8uY2FzdFNoYWRvdyA9IHRydWU7XG4gIHNjZW5lLmFkZChzb2xvKTtcblxuICBjb25zdCBpbnN0ID0gbmV3IFRIUkVFLkluc3RhbmNlZE1lc2goYm94LCBtYXQsIDgpO1xuICBpbnN0Lm5hbWUgPSAnaGVyZF9kZWVyJztcbiAgaW5zdC5jb3VudCA9IDU7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgODsgaSsrKSBpbnN0LnNldE1hdHJpeEF0KGksIG5ldyBUSFJFRS5NYXRyaXg0KCkubWFrZVRyYW5zbGF0aW9uKGkgKiAyLCAwLCAwKSk7XG4gIGluc3QuY2FzdFNoYWRvdyA9IGZhbHNlO1xuICBzY2VuZS5hZGQoaW5zdCk7XG5cbiAgY29uc3QgYmF0Y2ggPSBuZXcgVEhSRUUuQmF0Y2hlZE1lc2goOCwgMjAwLCA0MDAsIG1hdCk7XG4gIGJhdGNoLm5hbWUgPSAnc3R5bF9uYXR1cmVfYmF0Y2gnO1xuICBiYXRjaC5jYXN0U2hhZG93ID0gdHJ1ZTtcbiAgY29uc3QgZ0JveCA9IGJhdGNoLmFkZEdlb21ldHJ5KGJveCk7XG4gIGNvbnN0IGdQbGFuZSA9IGJhdGNoLmFkZEdlb21ldHJ5KHBsYW5lKTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCAzOyBpKyspIHtcbiAgICBjb25zdCBpZCA9IGJhdGNoLmFkZEluc3RhbmNlKGdCb3gpO1xuICAgIGJhdGNoLnNldE1hdHJpeEF0KGlkLCBuZXcgVEhSRUUuTWF0cml4NCgpLm1ha2VUcmFuc2xhdGlvbihpICogMiwgMCwgMykpO1xuICB9XG4gIGJhdGNoLnNldE1hdHJpeEF0KGJhdGNoLmFkZEluc3RhbmNlKGdQbGFuZSksIG5ldyBUSFJFRS5NYXRyaXg0KCkubWFrZVRyYW5zbGF0aW9uKDAsIDAsIC0zKSk7XG4gIC8vIEZhciBhd2F5OiBjdWxsZWQgYnkgdGhlIG1haW4gY2FtZXJhIGFuZCB0aGUgc2hhZG93IGNhbWVyYS5cbiAgYmF0Y2guc2V0TWF0cml4QXQoYmF0Y2guYWRkSW5zdGFuY2UoZ0JveCksIG5ldyBUSFJFRS5NYXRyaXg0KCkubWFrZVRyYW5zbGF0aW9uKDEwMDAsIDAsIDApKTtcbiAgLy8gSGlkZGVuIGluc3RhbmNlOiBuZXZlciBkcmF3bi5cbiAgY29uc3QgaGlkZGVuID0gYmF0Y2guYWRkSW5zdGFuY2UoZ0JveCk7XG4gIGJhdGNoLnNldFZpc2libGVBdChoaWRkZW4sIGZhbHNlKTtcbiAgY29uc3QgZ3JvdXAgPSBuZXcgVEhSRUUuR3JvdXAoKTtcbiAgZ3JvdXAubmFtZSA9ICduYXR1cmVHcm91cCc7XG4gIGdyb3VwLmFkZChiYXRjaCk7XG4gIHNjZW5lLmFkZChncm91cCk7XG5cbiAgLy8gVHJhbnNwYXJlbnQgRG91YmxlU2lkZTogZHJhd24gYmFjayB0aGVuIGZyb250IGZhY2VzIGluIHRoZSBtYWluIHBhc3MuXG4gIGNvbnN0IHdhdGVyID0gbmV3IFRIUkVFLk1lc2gocGxhbmUsIG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHsgdHJhbnNwYXJlbnQ6IHRydWUsIHNpZGU6IFRIUkVFLkRvdWJsZVNpZGUgfSkpO1xuICB3YXRlci5uYW1lID0gJ3dhdGVyX2NodW5rXzFfMic7XG4gIHdhdGVyLnBvc2l0aW9uLnNldCgtMywgMCwgMCk7XG4gIHdhdGVyLmNhc3RTaGFkb3cgPSB0cnVlO1xuICBzY2VuZS5hZGQod2F0ZXIpO1xuXG4gIGNvbnN0IG9mZiA9IG5ldyBUSFJFRS5NZXNoKGJveCwgbWF0KTtcbiAgb2ZmLm5hbWUgPSAnY2h1bmtfM18tMic7XG4gIG9mZi52aXNpYmxlID0gZmFsc2U7XG4gIG9mZi5jYXN0U2hhZG93ID0gdHJ1ZTtcbiAgc2NlbmUuYWRkKG9mZik7XG5cbiAgY29uc3Qgc3VuID0gbmV3IFRIUkVFLkRpcmVjdGlvbmFsTGlnaHQoJyNmZmYnLCAxKTtcbiAgc3VuLmNhc3RTaGFkb3cgPSB0cnVlO1xuICBzdW4ucG9zaXRpb24uc2V0KDEwLCAzMCwgMTApO1xuICBjb25zdCBzYyA9IHN1bi5zaGFkb3cuY2FtZXJhIGFzIFRIUkVFLk9ydGhvZ3JhcGhpY0NhbWVyYTtcbiAgc2MubGVmdCA9IC01MDsgc2MucmlnaHQgPSA1MDsgc2MudG9wID0gNTA7IHNjLmJvdHRvbSA9IC01MDsgc2MubmVhciA9IDAuNTsgc2MuZmFyID0gMjAwO1xuICBzYy51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XG4gIHNjZW5lLmFkZChzdW4sIHN1bi50YXJnZXQpO1xuXG4gIGNvbnN0IGNhbWVyYSA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYSg2MCwgMSwgMC4xLCA1MDApO1xuICBjYW1lcmEucG9zaXRpb24uc2V0KDAsIDIwLCA0MCk7XG4gIGNhbWVyYS5sb29rQXQoMCwgMCwgMCk7XG5cbiAgc2NlbmUudXBkYXRlTWF0cml4V29ybGQoKTtcbiAgY2FtZXJhLnVwZGF0ZU1hdHJpeFdvcmxkKCk7XG4gIHN1bi5zaGFkb3cudXBkYXRlTWF0cmljZXMoc3VuKTtcbiAgcmV0dXJuIHsgc2NlbmUsIGNhbWVyYSwgaW5zdCwgYmF0Y2gsIG9mZiB9O1xufVxuXG50ZXN0KCdicmVha2Rvd24gY291bnRzIGRyYXdzIGFuZCBkcmF3biB0cmlhbmdsZXMgZm9yIE1lc2gsIEluc3RhbmNlZE1lc2ggYW5kIEJhdGNoZWRNZXNoJywgKCkgPT4ge1xuICBjb25zdCB7IHNjZW5lLCBjYW1lcmEgfSA9IHNjZW5lVW5kZXJUZXN0KCk7XG4gIGNvbnN0IGZha2VSZW5kZXJlciA9IHsgaW5mbzogeyByZW5kZXI6IHsgY2FsbHM6IDcsIHRyaWFuZ2xlczogMTIzNCB9IH0sIHNoYWRvd01hcDogeyBlbmFibGVkOiB0cnVlIH0gfTtcbiAgY29uc3QgYiA9IHJlbmRlckJyZWFrZG93bihzY2VuZSwgeyBjYW1lcmEsIHJlbmRlcmVyOiBmYWtlUmVuZGVyZXIgfSk7XG5cbiAgYXNzZXJ0LmRlZXBFcXVhbChiLm93bmVycy5zb2xvLm1haW4sIHsgZHJhd3M6IDEsIHRyaWFuZ2xlczogMTIgfSk7XG4gIGFzc2VydC5kZWVwRXF1YWwoYi5vd25lcnMuc29sby5zaGFkb3csIHsgZHJhd3M6IDEsIHRyaWFuZ2xlczogMTIgfSk7XG4gIGFzc2VydC5kZWVwRXF1YWwoYi5vd25lcnMuaGVyZF9kZWVyLm1haW4sIHsgZHJhd3M6IDEsIHRyaWFuZ2xlczogNjAgfSk7XG4gIGFzc2VydC5kZWVwRXF1YWwoYi5vd25lcnMuaGVyZF9kZWVyLnNoYWRvdywgeyBkcmF3czogMCwgdHJpYW5nbGVzOiAwIH0pO1xuICAvLyAzIGJveGVzICsgMSBwbGFuZSBpbiB2aWV3OyB0aGUgZmFyIGFuZCBoaWRkZW4gaW5zdGFuY2VzIGFyZSBza2lwcGVkLlxuICBhc3NlcnQuZGVlcEVxdWFsKGIub3duZXJzLm5hdHVyZUdyb3VwLm1haW4sIHsgZHJhd3M6IDEsIHRyaWFuZ2xlczogMzggfSk7XG4gIGFzc2VydC5kZWVwRXF1YWwoYi5vd25lcnMubmF0dXJlR3JvdXAuc2hhZG93LCB7IGRyYXdzOiAxLCB0cmlhbmdsZXM6IDM4IH0pO1xuICAvLyBJbnZpc2libGUgbWVzaDogbGlzdGVkIGJ1dCBjb3N0cyBub3RoaW5nOyBudW1lcmljIG5hbWUgcGFydHMgYXJlIGNvbGxhcHNlZC5cbiAgY29uc3QgY2h1bmsgPSBiLmVudHJpZXMuZmluZCgoZSkgPT4gZS5tZXNoID09PSAnY2h1bmtfI18jJyk7XG4gIGFzc2VydC5vayhjaHVuayk7XG4gIGFzc2VydC5lcXVhbChjaHVuay5tZXNoZXMsIDEpO1xuICBhc3NlcnQuZXF1YWwoY2h1bmsudmlzaWJsZSwgMCk7XG4gIGFzc2VydC5kZWVwRXF1YWwoY2h1bmsubWFpbiwgeyBkcmF3czogMCwgdHJpYW5nbGVzOiAwIH0pO1xuXG4gIGFzc2VydC5kZWVwRXF1YWwoYi5vd25lcnNbJ3dhdGVyX2NodW5rXyNfIyddLm1haW4sIHsgZHJhd3M6IDIsIHRyaWFuZ2xlczogNCB9KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChiLm93bmVyc1snd2F0ZXJfY2h1bmtfI18jJ10uc2hhZG93LCB7IGRyYXdzOiAxLCB0cmlhbmdsZXM6IDIgfSk7XG5cbiAgYXNzZXJ0LmRlZXBFcXVhbChiLnRvdGFscy5tYWluLCB7IGRyYXdzOiA1LCB0cmlhbmdsZXM6IDExNCB9KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChiLnRvdGFscy5zaGFkb3csIHsgZHJhd3M6IDMsIHRyaWFuZ2xlczogNTIgfSk7XG4gIGFzc2VydC5kZWVwRXF1YWwoYi50b3RhbHMuYWxsLCB7IGRyYXdzOiA4LCB0cmlhbmdsZXM6IDE2NiB9KTtcbiAgYXNzZXJ0LmVxdWFsKGIuc2hhZG93TGlnaHRzLCAxKTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChiLnJlbmRlcmVyLCB7IGNhbGxzOiA3LCB0cmlhbmdsZXM6IDEyMzQgfSk7XG4gIGNvbnN0IG5hdHVyZSA9IGIuZW50cmllcy5maW5kKChlKSA9PiBlLm1lc2ggPT09ICdzdHlsX25hdHVyZV9iYXRjaCcpO1xuICBhc3NlcnQuZXF1YWwobmF0dXJlPy50eXBlLCAnQmF0Y2hlZE1lc2gnKTtcbiAgYXNzZXJ0LmVxdWFsKG5hdHVyZT8uaW5zdGFuY2VzLCA2KTtcbiAgYXNzZXJ0LmVxdWFsKG5hdHVyZT8uY2FzdFNoYWRvdywgMSk7XG59KTtcblxudGVzdCgnYnJlYWtkb3duIHJlc3BlY3RzIHNoYWRvdyB0b2dnbGVzLCBmcnVzdHVtIGN1bGxpbmcgYW5kIHN0YXlzIHJlYWQtb25seScsICgpID0+IHtcbiAgY29uc3QgeyBzY2VuZSwgY2FtZXJhLCBpbnN0LCBiYXRjaCwgb2ZmIH0gPSBzY2VuZVVuZGVyVGVzdCgpO1xuICBjb25zdCBiZWZvcmUgPSB7IGNvdW50OiBpbnN0LmNvdW50LCB2aXM6IG9mZi52aXNpYmxlLCBuOiBiYXRjaC5pbnN0YW5jZUNvdW50IH07XG4gIGNvbnN0IG5vU2hhZG93ID0gcmVuZGVyQnJlYWtkb3duKHNjZW5lLCB7IGNhbWVyYSwgc2hhZG93czogZmFsc2UgfSk7XG4gIGFzc2VydC5lcXVhbChub1NoYWRvdy5zaGFkb3dMaWdodHMsIDApO1xuICBhc3NlcnQuZGVlcEVxdWFsKG5vU2hhZG93LnRvdGFscy5zaGFkb3csIHsgZHJhd3M6IDAsIHRyaWFuZ2xlczogMCB9KTtcblxuICAvLyBUb2dnbGluZyBjYXN0U2hhZG93IG1vdmVzIHRoZSBiYXRjaCBvdXQgb2YgdGhlIHNoYWRvdyBwYXNzIG9ubHkuXG4gIGJhdGNoLmNhc3RTaGFkb3cgPSBmYWxzZTtcbiAgY29uc3QgYiA9IHJlbmRlckJyZWFrZG93bihzY2VuZSwgeyBjYW1lcmEgfSk7XG4gIGFzc2VydC5kZWVwRXF1YWwoYi50b3RhbHMuc2hhZG93LCB7IGRyYXdzOiAyLCB0cmlhbmdsZXM6IDE0IH0pO1xuICBhc3NlcnQuZGVlcEVxdWFsKGIudG90YWxzLm1haW4sIHsgZHJhd3M6IDUsIHRyaWFuZ2xlczogMTE0IH0pO1xuXG4gIC8vIFdpdGhvdXQgYSBjYW1lcmEgbm90aGluZyBpcyBmcnVzdHVtIGN1bGxlZDogdGhlIGZhciBiYXRjaCBib3ggY291bnRzLlxuICBjb25zdCBhbGwgPSByZW5kZXJCcmVha2Rvd24oc2NlbmUsIHsgc2hhZG93czogZmFsc2UgfSk7XG4gIGFzc2VydC5kZWVwRXF1YWwoYWxsLm93bmVycy5uYXR1cmVHcm91cC5tYWluLCB7IGRyYXdzOiAxLCB0cmlhbmdsZXM6IDUwIH0pO1xuXG4gIC8vIExvb2tpbmcgYXdheSBmcm9tIGV2ZXJ5dGhpbmcgY3VsbHMgdGhlIG1haW4gcGFzcyBlbnRpcmVseS5cbiAgY2FtZXJhLmxvb2tBdCgwLCAyMCwgNDAwKTtcbiAgY2FtZXJhLnVwZGF0ZU1hdHJpeFdvcmxkKCk7XG4gIGNvbnN0IGF3YXkgPSByZW5kZXJCcmVha2Rvd24oc2NlbmUsIHsgY2FtZXJhLCBzaGFkb3dzOiBmYWxzZSB9KTtcbiAgYXNzZXJ0LmRlZXBFcXVhbChhd2F5LnRvdGFscy5tYWluLCB7IGRyYXdzOiAwLCB0cmlhbmdsZXM6IDAgfSk7XG4gIGNhbWVyYS5sb29rQXQoMCwgMCwgMCk7XG4gIGNhbWVyYS51cGRhdGVNYXRyaXhXb3JsZCgpO1xuXG4gIC8vIFdpdGhvdXQgV0VCR0xfbXVsdGlfZHJhdyB0aHJlZS5qcyBpc3N1ZXMgb25lIGNhbGwgcGVyIGRyYXduIGJhdGNoIGluc3RhbmNlLlxuICBjb25zdCBmYWxsYmFjayA9IHJlbmRlckJyZWFrZG93bihzY2VuZSwgeyBjYW1lcmEsIHNoYWRvd3M6IGZhbHNlLCBtdWx0aURyYXc6IGZhbHNlIH0pO1xuICBhc3NlcnQuZGVlcEVxdWFsKGZhbGxiYWNrLm93bmVycy5uYXR1cmVHcm91cC5tYWluLCB7IGRyYXdzOiA0LCB0cmlhbmdsZXM6IDM4IH0pO1xuICBhc3NlcnQuZXF1YWwoZmFsbGJhY2subXVsdGlEcmF3LCBmYWxzZSk7XG4gIGNvbnN0IGV4dCA9IHJlbmRlckJyZWFrZG93bihzY2VuZSwgeyBjYW1lcmEsIHJlbmRlcmVyOiB7IGluZm86IHsgcmVuZGVyOiB7IGNhbGxzOiAwLCB0cmlhbmdsZXM6IDAgfSB9LCBleHRlbnNpb25zOiB7IGhhczogKCkgPT4gZmFsc2UgfSB9IH0pO1xuICBhc3NlcnQuZXF1YWwoZXh0Lm11bHRpRHJhdywgZmFsc2UpO1xuXG4gIGFzc2VydC5kZWVwRXF1YWwoeyBjb3VudDogaW5zdC5jb3VudCwgdmlzOiBvZmYudmlzaWJsZSwgbjogYmF0Y2guaW5zdGFuY2VDb3VudCB9LCBiZWZvcmUpO1xufSk7XG4iLCAiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xuXG4vLyBQcmVzZW50YXRpb24tb25seSByZW5kZXIgY29zdCBicmVha2Rvd24uIFdhbGtzIHRoZSBzY2VuZSB0aGUgc2FtZSB3YXlcbi8vIFdlYkdMUmVuZGVyZXIgZG9lcyBhbmQgZXN0aW1hdGVzLCBwZXIgb3duZXIsIGhvdyBtYW55IGRyYXcgY2FsbHMgYW5kXG4vLyB0cmlhbmdsZXMgdGhlIG1haW4gcGFzcyBhbmQgdGhlIHNoYWRvdyBwYXNzKGVzKSBpc3N1ZS4gUmVhZC1vbmx5OiBpdCBuZXZlclxuLy8gY2hhbmdlcyB0aGUgc2NlbmUsIHRoZSByZW5kZXJlciBvciBzaW11bGF0aW9uIHN0YXRlLCBhbmQgcmVhZHMgbWF0cmljZXMgYXNcbi8vIHRoZXkgd2VyZSBsZWZ0IGJ5IHRoZSBsYXN0IHJlbmRlci5cbi8vXG4vLyBNb2RlbCBvZiB3aGF0IHRocmVlLmpzIGRyYXdzIChyMTg2IFdlYkdMUmVuZGVyZXIgLyBXZWJHTFNoYWRvd01hcCk6XG4vLyAtIGV2ZXJ5IHZpc2libGUgTWVzaCAvIEluc3RhbmNlZE1lc2ggLyBCYXRjaGVkTWVzaCB0aGF0IHBhc3NlcyB0aGUgbGF5ZXIgYW5kXG4vLyAgIGZydXN0dW0gdGVzdCBpcyBvbmUgZHJhdyBwZXIgbWF0ZXJpYWwgZ3JvdXAgKHR3byBpbiB0aGUgbWFpbiBwYXNzIGZvclxuLy8gICB0cmFuc3BhcmVudCBEb3VibGVTaWRlIG1hdGVyaWFscywgd2hpY2ggdGhyZWUuanMgZHJhd3MgYmFjayB0aGVuIGZyb250XG4vLyAgIGZhY2VzKS4gQSBCYXRjaGVkTWVzaCBpcyBvbmVcbi8vICAgbXVsdGktZHJhdyBjYWxsIHdoZW4gV0VCR0xfbXVsdGlfZHJhdyBleGlzdHMsIG90aGVyd2lzZSB0aHJlZS5qcyBmYWxsc1xuLy8gICBiYWNrIHRvIG9uZSBkcmF3IHBlciBkcmF3biBpbnN0YW5jZSwgYW5kIG5vIGNhbGwgd2hlbiBub3RoaW5nIHN1cnZpdmVzXG4vLyAgIHBlci1vYmplY3QgY3VsbGluZztcbi8vIC0gdHJpYW5nbGVzID0gZHJhd24gaW5kZXggKG9yIHZlcnRleCkgY291bnQgLyAzLCB0aW1lcyBpbnN0YW5jZSBjb3VudCBmb3Jcbi8vICAgSW5zdGFuY2VkTWVzaDsgQmF0Y2hlZE1lc2ggc3VtcyBpdHMgdmlzaWJsZSwgYWN0aXZlLCBwZXItb2JqZWN0IGZydXN0dW1cbi8vICAgY3VsbGVkIGluc3RhbmNlcztcbi8vIC0gZWFjaCBzaGFkb3ctY2FzdGluZyBEaXJlY3Rpb25hbExpZ2h0IC8gU3BvdExpZ2h0IHJlZHJhd3MgZXZlcnkgY2FzdFNoYWRvd1xuLy8gICBtZXNoIGluc2lkZSBpdHMgc2hhZG93IGNhbWVyYSBmcnVzdHVtIChQb2ludExpZ2h0OiA2IGZhY2VzLCBub3QgY3VsbGVkXG4vLyAgIHBlciBmYWNlIGhlcmUsIHNvIGl0IGlzIGFuIHVwcGVyIGJvdW5kKS5cblxuZXhwb3J0IGludGVyZmFjZSBCcmVha2Rvd25Db3N0IHtcbiAgZHJhd3M6IG51bWJlcjtcbiAgdHJpYW5nbGVzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQnJlYWtkb3duRW50cnkge1xuICBvd25lcjogc3RyaW5nO1xuICBtZXNoOiBzdHJpbmc7XG4gIHR5cGU6ICdNZXNoJyB8ICdJbnN0YW5jZWRNZXNoJyB8ICdCYXRjaGVkTWVzaCcgfCAnTGluZScgfCAnUG9pbnRzJztcbiAgbWVzaGVzOiBudW1iZXI7XG4gIHZpc2libGU6IG51bWJlcjtcbiAgY2FzdFNoYWRvdzogbnVtYmVyO1xuICBpbnN0YW5jZXM6IG51bWJlcjtcbiAgbWFpbjogQnJlYWtkb3duQ29zdDtcbiAgc2hhZG93OiBCcmVha2Rvd25Db3N0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlbmRlckJyZWFrZG93biB7XG4gIG93bmVyczogUmVjb3JkPHN0cmluZywgeyBtZXNoZXM6IG51bWJlcjsgbWFpbjogQnJlYWtkb3duQ29zdDsgc2hhZG93OiBCcmVha2Rvd25Db3N0OyB0b3RhbDogQnJlYWtkb3duQ29zdCB9PjtcbiAgZW50cmllczogQnJlYWtkb3duRW50cnlbXTtcbiAgdG90YWxzOiB7IG1haW46IEJyZWFrZG93bkNvc3Q7IHNoYWRvdzogQnJlYWtkb3duQ29zdDsgYWxsOiBCcmVha2Rvd25Db3N0IH07XG4gIHNoYWRvd0xpZ2h0czogbnVtYmVyO1xuICBtdWx0aURyYXc6IGJvb2xlYW47XG4gIHJlbmRlcmVyPzogeyBjYWxsczogbnVtYmVyOyB0cmlhbmdsZXM6IG51bWJlciB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEJyZWFrZG93bk9wdGlvbnMge1xuICBjYW1lcmE/OiBUSFJFRS5DYW1lcmE7XG4gIHJlbmRlcmVyPzoge1xuICAgIGluZm86IHsgcmVuZGVyOiB7IGNhbGxzOiBudW1iZXI7IHRyaWFuZ2xlczogbnVtYmVyIH0gfTtcbiAgICBzaGFkb3dNYXA/OiB7IGVuYWJsZWQ6IGJvb2xlYW4gfTtcbiAgICBleHRlbnNpb25zPzogeyBoYXMobmFtZTogc3RyaW5nKTogYm9vbGVhbiB9O1xuICB9O1xuICAvKiogSW5jbHVkZSBzaGFkb3cgcGFzc2VzIChkZWZhdWx0cyB0byByZW5kZXJlci5zaGFkb3dNYXAuZW5hYmxlZCwgZWxzZSB0cnVlKS4gKi9cbiAgc2hhZG93cz86IGJvb2xlYW47XG4gIC8qKiBXRUJHTF9tdWx0aV9kcmF3IGF2YWlsYWJsZSAoZGVmYXVsdHMgdG8gcmVuZGVyZXIuZXh0ZW5zaW9ucywgZWxzZSB0cnVlKS4gKi9cbiAgbXVsdGlEcmF3PzogYm9vbGVhbjtcbn1cblxudHlwZSBEcmF3YWJsZSA9IFRIUkVFLk1lc2ggfCBUSFJFRS5JbnN0YW5jZWRNZXNoIHwgVEhSRUUuQmF0Y2hlZE1lc2ggfCBUSFJFRS5MaW5lIHwgVEhSRUUuUG9pbnRzO1xuXG5jb25zdCBfZnJ1c3R1bSA9IG5ldyBUSFJFRS5GcnVzdHVtKCk7XG5jb25zdCBfcHJvaiA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG5jb25zdCBfbSA9IG5ldyBUSFJFRS5NYXRyaXg0KCk7XG5jb25zdCBfc3BoZXJlID0gbmV3IFRIUkVFLlNwaGVyZSgpO1xuXG5mdW5jdGlvbiBmcnVzdHVtT2YoY2FtZXJhOiBUSFJFRS5DYW1lcmEsIG91dCA9IG5ldyBUSFJFRS5GcnVzdHVtKCkpOiBUSFJFRS5GcnVzdHVtIHtcbiAgX3Byb2oubXVsdGlwbHlNYXRyaWNlcyhjYW1lcmEucHJvamVjdGlvbk1hdHJpeCwgY2FtZXJhLm1hdHJpeFdvcmxkSW52ZXJzZSk7XG4gIHJldHVybiBvdXQuc2V0RnJvbVByb2plY3Rpb25NYXRyaXgoX3Byb2osIGNhbWVyYS5jb29yZGluYXRlU3lzdGVtLCAoY2FtZXJhIGFzIGFueSkucmV2ZXJzZWREZXB0aCk7XG59XG5cbi8qKiBWaXNpYmxlIGluIHRoZSBzY2VuZSBncmFwaDogdGhlIG9iamVjdCBhbmQgZXZlcnkgYW5jZXN0b3IgYXJlIHZpc2libGUuICovXG5mdW5jdGlvbiBncmFwaFZpc2libGUobzogVEhSRUUuT2JqZWN0M0QpOiBib29sZWFuIHtcbiAgZm9yIChsZXQgcDogVEhSRUUuT2JqZWN0M0QgfCBudWxsID0gbzsgcDsgcCA9IHAucGFyZW50KSBpZiAoIXAudmlzaWJsZSkgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gb3duZXJPZihvOiBUSFJFRS5PYmplY3QzRCwgcm9vdDogVEhSRUUuT2JqZWN0M0QpOiBUSFJFRS5PYmplY3QzRCB7XG4gIGxldCB0b3AgPSBvO1xuICB3aGlsZSAodG9wLnBhcmVudCAmJiB0b3AucGFyZW50ICE9PSByb290KSB0b3AgPSB0b3AucGFyZW50O1xuICByZXR1cm4gdG9wO1xufVxuXG4vKiogQ29sbGFwc2UgbnVtZXJpYyBwYXJ0cyBvZiBuYW1lcyBzbyA0OSBjaHVuayBtZXNoZXMgYWdncmVnYXRlIHRvIG9uZSByb3cuICovXG5mdW5jdGlvbiBsYWJlbChvOiBUSFJFRS5PYmplY3QzRCk6IHN0cmluZyB7XG4gIHJldHVybiAoby5uYW1lIHx8IG8udHlwZSkucmVwbGFjZSgvLT9cXGQrKFxcLlxcZCspPy9nLCAnIycpO1xufVxuXG5mdW5jdGlvbiBlbGVtZW50Q291bnQoZzogVEhSRUUuQnVmZmVyR2VvbWV0cnkpOiBudW1iZXIge1xuICByZXR1cm4gZy5pbmRleCA/IGcuaW5kZXguY291bnQgOiAoZy5hdHRyaWJ1dGVzLnBvc2l0aW9uPy5jb3VudCA/PyAwKTtcbn1cblxuLyoqXG4gKiBNYWluLXBhc3MgZHJhd3MgcGVyIG1hdGVyaWFsOiB0cmFuc3BhcmVudCBEb3VibGVTaWRlIG1hdGVyaWFscyBhcmUgZHJhd25cbiAqIHR3aWNlIChiYWNrIGZhY2VzLCB0aGVuIGZyb250IGZhY2VzKSB1bmxlc3MgZm9yY2VTaW5nbGVQYXNzIGlzIHNldC4gVGhlXG4gKiBzaGFkb3cgcGFzcyB1c2VzIGRlcHRoIG1hdGVyaWFscyBhbmQgZHJhd3Mgb25jZS5cbiAqL1xuZnVuY3Rpb24gcGFzc2VzKG1hdDogVEhSRUUuTWF0ZXJpYWwsIG1haW46IGJvb2xlYW4pOiBudW1iZXIge1xuICByZXR1cm4gbWFpbiAmJiBtYXQudHJhbnNwYXJlbnQgJiYgbWF0LnNpZGUgPT09IFRIUkVFLkRvdWJsZVNpZGUgJiYgIW1hdC5mb3JjZVNpbmdsZVBhc3MgPyAyIDogMTtcbn1cblxuLyoqIFBlci1tYXRlcmlhbC1ncm91cCBlbGVtZW50IGNvdW50cyAocmVwZWF0ZWQgcGVyIHBhc3MpLCBjbGFtcGVkIGJ5IHRoZSBkcmF3IHJhbmdlLiAqL1xuZnVuY3Rpb24gZ3JvdXBDb3VudHMob2JqOiBEcmF3YWJsZSwgbWFpbjogYm9vbGVhbik6IG51bWJlcltdIHtcbiAgY29uc3QgZyA9IG9iai5nZW9tZXRyeSBhcyBUSFJFRS5CdWZmZXJHZW9tZXRyeTtcbiAgY29uc3QgdG90YWwgPSBlbGVtZW50Q291bnQoZyk7XG4gIGNvbnN0IHJzID0gTWF0aC5tYXgoMCwgZy5kcmF3UmFuZ2Uuc3RhcnQpO1xuICBjb25zdCByZSA9IE1hdGgubWluKHRvdGFsLCBnLmRyYXdSYW5nZS5zdGFydCArIGcuZHJhd1JhbmdlLmNvdW50KTtcbiAgY29uc3QgbWF0cyA9IG9iai5tYXRlcmlhbDtcbiAgaWYgKEFycmF5LmlzQXJyYXkobWF0cykgJiYgZy5ncm91cHMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IG91dDogbnVtYmVyW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGdycCBvZiBnLmdyb3Vwcykge1xuICAgICAgY29uc3QgbWF0ID0gbWF0c1tncnAubWF0ZXJpYWxJbmRleCA/PyAwXTtcbiAgICAgIGlmICghbWF0IHx8ICFtYXQudmlzaWJsZSkgY29udGludWU7XG4gICAgICBjb25zdCBzID0gTWF0aC5tYXgocnMsIGdycC5zdGFydCksIGUgPSBNYXRoLm1pbihyZSwgZ3JwLnN0YXJ0ICsgZ3JwLmNvdW50KTtcbiAgICAgIGlmIChlID4gcykgZm9yIChsZXQgcCA9IHBhc3NlcyhtYXQsIG1haW4pOyBwID4gMDsgcC0tKSBvdXQucHVzaChlIC0gcyk7XG4gICAgfVxuICAgIHJldHVybiBvdXQ7XG4gIH1cbiAgY29uc3QgbWF0ID0gQXJyYXkuaXNBcnJheShtYXRzKSA/IG1hdHNbMF0gOiBtYXRzO1xuICBpZiAoIW1hdCB8fCAhKG1hdCBhcyBUSFJFRS5NYXRlcmlhbCkudmlzaWJsZSkgcmV0dXJuIFtdO1xuICByZXR1cm4gcmUgPiBycyA/IG5ldyBBcnJheShwYXNzZXMobWF0IGFzIFRIUkVFLk1hdGVyaWFsLCBtYWluKSkuZmlsbChyZSAtIHJzKSA6IFtdO1xufVxuXG5mdW5jdGlvbiB0cmlhbmdsZXNQZXJFbGVtZW50KG9iajogRHJhd2FibGUpOiBudW1iZXIge1xuICByZXR1cm4gKG9iaiBhcyBUSFJFRS5NZXNoKS5pc01lc2ggPyAxIC8gMyA6IDA7XG59XG5cbi8qKiBDb3N0IG9mIGRyYXdpbmcgb2JqIG9uY2UgZnJvbSBhIHZpZXcsIG9yIG51bGwgd2hlbiBjdWxsZWQuICovXG5mdW5jdGlvbiBkcmF3Q29zdChvYmo6IERyYXdhYmxlLCBmcnVzdHVtOiBUSFJFRS5GcnVzdHVtIHwgbnVsbCwgbXVsdGlEcmF3OiBib29sZWFuLCBtYWluOiBib29sZWFuKTogQnJlYWtkb3duQ29zdCB8IG51bGwge1xuICBpZiAoZnJ1c3R1bSAmJiBvYmouZnJ1c3R1bUN1bGxlZCAmJiAhZnJ1c3R1bS5pbnRlcnNlY3RzT2JqZWN0KG9iaikpIHJldHVybiBudWxsO1xuICBjb25zdCBwZXJFbCA9IHRyaWFuZ2xlc1BlckVsZW1lbnQob2JqKTtcbiAgaWYgKChvYmogYXMgVEhSRUUuQmF0Y2hlZE1lc2gpLmlzQmF0Y2hlZE1lc2gpIHtcbiAgICBjb25zdCBiID0gb2JqIGFzIFRIUkVFLkJhdGNoZWRNZXNoO1xuICAgIGNvbnN0IGluZm8gPSAoYiBhcyBhbnkpLl9pbnN0YW5jZUluZm8gYXMgeyB2aXNpYmxlOiBib29sZWFuOyBhY3RpdmU6IGJvb2xlYW47IGdlb21ldHJ5SW5kZXg6IG51bWJlciB9W107XG4gICAgY29uc3QgbWF0ID0gQXJyYXkuaXNBcnJheShiLm1hdGVyaWFsKSA/IGIubWF0ZXJpYWxbMF0gOiBiLm1hdGVyaWFsO1xuICAgIGlmICghbWF0IHx8ICFtYXQudmlzaWJsZSkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcmFuZ2UgPSB7IGluZGV4Q291bnQ6IDAsIHZlcnRleENvdW50OiAwIH0gYXMgYW55O1xuICAgIGNvbnN0IGluZGV4ZWQgPSAhIWIuZ2VvbWV0cnkuaW5kZXg7XG4gICAgbGV0IGVsZW1lbnRzID0gMCwgZHJhd24gPSAwO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaW5mby5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgaXQgPSBpbmZvW2ldO1xuICAgICAgaWYgKCFpdC5hY3RpdmUgfHwgIWl0LnZpc2libGUpIGNvbnRpbnVlO1xuICAgICAgaWYgKGZydXN0dW0gJiYgYi5wZXJPYmplY3RGcnVzdHVtQ3VsbGVkKSB7XG4gICAgICAgIGIuZ2V0TWF0cml4QXQoaSwgX20pO1xuICAgICAgICBjb25zdCBzID0gYi5nZXRCb3VuZGluZ1NwaGVyZUF0KGl0Lmdlb21ldHJ5SW5kZXgsIF9zcGhlcmUpO1xuICAgICAgICBpZiAocyAmJiAhZnJ1c3R1bS5pbnRlcnNlY3RzU3BoZXJlKHMuYXBwbHlNYXRyaXg0KF9tKS5hcHBseU1hdHJpeDQoYi5tYXRyaXhXb3JsZCkpKSBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGIuZ2V0R2VvbWV0cnlSYW5nZUF0KGl0Lmdlb21ldHJ5SW5kZXgsIHJhbmdlKTtcbiAgICAgIGVsZW1lbnRzICs9IGluZGV4ZWQgPyByYW5nZS5pbmRleENvdW50IDogcmFuZ2UudmVydGV4Q291bnQ7XG4gICAgICBkcmF3bisrO1xuICAgIH1cbiAgICBpZiAoZHJhd24gPT09IDApIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHAgPSBwYXNzZXMobWF0LCBtYWluKTtcbiAgICByZXR1cm4geyBkcmF3czogKG11bHRpRHJhdyA/IDEgOiBkcmF3bikgKiBwLCB0cmlhbmdsZXM6IE1hdGgucm91bmQoZWxlbWVudHMgKiBwZXJFbCkgKiBwIH07XG4gIH1cbiAgY29uc3QgY291bnRzID0gZ3JvdXBDb3VudHMob2JqLCBtYWluKTtcbiAgaWYgKGNvdW50cy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuICBjb25zdCBpbnN0ID0gKG9iaiBhcyBUSFJFRS5JbnN0YW5jZWRNZXNoKS5pc0luc3RhbmNlZE1lc2ggPyAob2JqIGFzIFRIUkVFLkluc3RhbmNlZE1lc2gpLmNvdW50IDogMTtcbiAgaWYgKGluc3QgPD0gMCkgcmV0dXJuIG51bGw7XG4gIGxldCBlbGVtZW50cyA9IDA7XG4gIGZvciAoY29uc3QgYyBvZiBjb3VudHMpIGVsZW1lbnRzICs9IGM7XG4gIHJldHVybiB7IGRyYXdzOiBjb3VudHMubGVuZ3RoLCB0cmlhbmdsZXM6IE1hdGgucm91bmQoZWxlbWVudHMgKiBwZXJFbCAqIGluc3QpIH07XG59XG5cbmZ1bmN0aW9uIGluc3RhbmNlc09mKG9iajogRHJhd2FibGUpOiBudW1iZXIge1xuICBpZiAoKG9iaiBhcyBUSFJFRS5CYXRjaGVkTWVzaCkuaXNCYXRjaGVkTWVzaCkgcmV0dXJuIChvYmogYXMgVEhSRUUuQmF0Y2hlZE1lc2gpLmluc3RhbmNlQ291bnQ7XG4gIGlmICgob2JqIGFzIFRIUkVFLkluc3RhbmNlZE1lc2gpLmlzSW5zdGFuY2VkTWVzaCkgcmV0dXJuIChvYmogYXMgVEhSRUUuSW5zdGFuY2VkTWVzaCkuY291bnQ7XG4gIHJldHVybiAxO1xufVxuXG5mdW5jdGlvbiB0eXBlT2Yob2JqOiBEcmF3YWJsZSk6IEJyZWFrZG93bkVudHJ5Wyd0eXBlJ10ge1xuICBpZiAoKG9iaiBhcyBUSFJFRS5CYXRjaGVkTWVzaCkuaXNCYXRjaGVkTWVzaCkgcmV0dXJuICdCYXRjaGVkTWVzaCc7XG4gIGlmICgob2JqIGFzIFRIUkVFLkluc3RhbmNlZE1lc2gpLmlzSW5zdGFuY2VkTWVzaCkgcmV0dXJuICdJbnN0YW5jZWRNZXNoJztcbiAgaWYgKChvYmogYXMgVEhSRUUuTWVzaCkuaXNNZXNoKSByZXR1cm4gJ01lc2gnO1xuICBpZiAoKG9iaiBhcyBUSFJFRS5MaW5lKS5pc0xpbmUpIHJldHVybiAnTGluZSc7XG4gIHJldHVybiAnUG9pbnRzJztcbn1cblxuY29uc3QgYWRkID0gKGE6IEJyZWFrZG93bkNvc3QsIGI6IEJyZWFrZG93bkNvc3QgfCBudWxsKSA9PiB7IGlmIChiKSB7IGEuZHJhd3MgKz0gYi5kcmF3czsgYS50cmlhbmdsZXMgKz0gYi50cmlhbmdsZXM7IH0gfTtcbmNvbnN0IHplcm8gPSAoKTogQnJlYWtkb3duQ29zdCA9PiAoeyBkcmF3czogMCwgdHJpYW5nbGVzOiAwIH0pO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQnJlYWtkb3duKHNjZW5lOiBUSFJFRS5TY2VuZSwgb3B0czogQnJlYWtkb3duT3B0aW9ucyA9IHt9KTogUmVuZGVyQnJlYWtkb3duIHtcbiAgLy8gVXNlcyB0aGUgd29ybGQgLyBjYW1lcmEgLyBzaGFkb3ctY2FtZXJhIG1hdHJpY2VzIGFzIG9mIHRoZSBsYXN0IHJlbmRlcixcbiAgLy8gc28gY2FsbCBpdCBhZnRlciByZW5kZXJlci5yZW5kZXIgKG9yIHVwZGF0ZSB0aGVtIHlvdXJzZWxmIGluIHRlc3RzKS5cbiAgY29uc3QgY2FtZXJhID0gb3B0cy5jYW1lcmE7XG4gIGNvbnN0IG1haW5GcnVzdHVtID0gY2FtZXJhID8gZnJ1c3R1bU9mKGNhbWVyYSwgX2ZydXN0dW0pIDogbnVsbDtcblxuICBjb25zdCBkcmF3YWJsZXM6IERyYXdhYmxlW10gPSBbXTtcbiAgY29uc3Qgc2hhZG93Vmlld3M6IHsgZnJ1c3R1bTogVEhSRUUuRnJ1c3R1bSB8IG51bGw7IGxheWVyczogVEhSRUUuTGF5ZXJzOyByZXBlYXQ6IG51bWJlciB9W10gPSBbXTtcbiAgY29uc3Qgc2hhZG93c09uID0gb3B0cy5zaGFkb3dzID8/IG9wdHMucmVuZGVyZXI/LnNoYWRvd01hcD8uZW5hYmxlZCA/PyB0cnVlO1xuICBjb25zdCBtdWx0aURyYXcgPSBvcHRzLm11bHRpRHJhdyA/PyBvcHRzLnJlbmRlcmVyPy5leHRlbnNpb25zPy5oYXMoJ1dFQkdMX211bHRpX2RyYXcnKSA/PyB0cnVlO1xuICBzY2VuZS50cmF2ZXJzZSgobykgPT4ge1xuICAgIGNvbnN0IGFueSA9IG8gYXMgYW55O1xuICAgIGlmIChhbnkuaXNNZXNoIHx8IGFueS5pc0xpbmUgfHwgYW55LmlzUG9pbnRzKSBkcmF3YWJsZXMucHVzaChvIGFzIERyYXdhYmxlKTtcbiAgICBpZiAoc2hhZG93c09uICYmIGFueS5pc0xpZ2h0ICYmIGFueS5jYXN0U2hhZG93ICYmIGFueS5zaGFkb3cgJiYgZ3JhcGhWaXNpYmxlKG8pKSB7XG4gICAgICBjb25zdCBzaGFkb3cgPSBhbnkuc2hhZG93IGFzIFRIUkVFLkxpZ2h0U2hhZG93O1xuICAgICAgaWYgKGFueS5pc1BvaW50TGlnaHQpIHtcbiAgICAgICAgc2hhZG93Vmlld3MucHVzaCh7IGZydXN0dW06IG51bGwsIGxheWVyczogc2hhZG93LmNhbWVyYS5sYXllcnMsIHJlcGVhdDogNiB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNoYWRvd1ZpZXdzLnB1c2goeyBmcnVzdHVtOiBmcnVzdHVtT2Yoc2hhZG93LmNhbWVyYSwgbmV3IFRIUkVFLkZydXN0dW0oKSksIGxheWVyczogc2hhZG93LmNhbWVyYS5sYXllcnMsIHJlcGVhdDogMSB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuXG4gIGNvbnN0IGJ5S2V5ID0gbmV3IE1hcDxzdHJpbmcsIEJyZWFrZG93bkVudHJ5PigpO1xuICBjb25zdCB0b3RhbHMgPSB7IG1haW46IHplcm8oKSwgc2hhZG93OiB6ZXJvKCksIGFsbDogemVybygpIH07XG4gIGZvciAoY29uc3Qgb2JqIG9mIGRyYXdhYmxlcykge1xuICAgIGNvbnN0IG93bmVyID0gbGFiZWwob3duZXJPZihvYmosIHNjZW5lKSk7XG4gICAgY29uc3QgbWVzaCA9IGxhYmVsKG9iaik7XG4gICAgY29uc3Qga2V5ID0gYCR7b3duZXJ9LyR7bWVzaH0vJHt0eXBlT2Yob2JqKX1gO1xuICAgIGxldCBlID0gYnlLZXkuZ2V0KGtleSk7XG4gICAgaWYgKCFlKSB7XG4gICAgICBlID0geyBvd25lciwgbWVzaCwgdHlwZTogdHlwZU9mKG9iaiksIG1lc2hlczogMCwgdmlzaWJsZTogMCwgY2FzdFNoYWRvdzogMCwgaW5zdGFuY2VzOiAwLCBtYWluOiB6ZXJvKCksIHNoYWRvdzogemVybygpIH07XG4gICAgICBieUtleS5zZXQoa2V5LCBlKTtcbiAgICB9XG4gICAgZS5tZXNoZXMrKztcbiAgICBjb25zdCB2aXMgPSBncmFwaFZpc2libGUob2JqKTtcbiAgICBpZiAoIXZpcykgY29udGludWU7XG4gICAgZS52aXNpYmxlKys7XG4gICAgZS5pbnN0YW5jZXMgKz0gaW5zdGFuY2VzT2Yob2JqKTtcbiAgICBpZiAoIWNhbWVyYSB8fCBvYmoubGF5ZXJzLnRlc3QoY2FtZXJhLmxheWVycykpIGFkZChlLm1haW4sIGRyYXdDb3N0KG9iaiwgbWFpbkZydXN0dW0sIG11bHRpRHJhdywgdHJ1ZSkpO1xuICAgIC8vIFNoYWRvdyBwYXNzIG1pcnJvcnMgV2ViR0xTaGFkb3dNYXA6IGNhc3RTaGFkb3cgbWVzaGVzL2xpbmVzL3BvaW50cy5cbiAgICBpZiAob2JqLmNhc3RTaGFkb3cpIHtcbiAgICAgIGUuY2FzdFNoYWRvdysrO1xuICAgICAgZm9yIChjb25zdCB2IG9mIHNoYWRvd1ZpZXdzKSB7XG4gICAgICAgIGlmICghb2JqLmxheWVycy50ZXN0KHYubGF5ZXJzKSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IGMgPSBkcmF3Q29zdChvYmosIHYuZnJ1c3R1bSwgbXVsdGlEcmF3LCBmYWxzZSk7XG4gICAgICAgIGlmIChjKSBhZGQoZS5zaGFkb3csIHsgZHJhd3M6IGMuZHJhd3MgKiB2LnJlcGVhdCwgdHJpYW5nbGVzOiBjLnRyaWFuZ2xlcyAqIHYucmVwZWF0IH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGVudHJpZXMgPSBbLi4uYnlLZXkudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+XG4gICAgKGIubWFpbi5kcmF3cyArIGIuc2hhZG93LmRyYXdzKSAtIChhLm1haW4uZHJhd3MgKyBhLnNoYWRvdy5kcmF3cylcbiAgICB8fCAoYi5tYWluLnRyaWFuZ2xlcyArIGIuc2hhZG93LnRyaWFuZ2xlcykgLSAoYS5tYWluLnRyaWFuZ2xlcyArIGEuc2hhZG93LnRyaWFuZ2xlcykpO1xuICBjb25zdCBvd25lcnM6IFJlbmRlckJyZWFrZG93blsnb3duZXJzJ10gPSB7fTtcbiAgZm9yIChjb25zdCBlIG9mIGVudHJpZXMpIHtcbiAgICBjb25zdCBvID0gb3duZXJzW2Uub3duZXJdID8/PSB7IG1lc2hlczogMCwgbWFpbjogemVybygpLCBzaGFkb3c6IHplcm8oKSwgdG90YWw6IHplcm8oKSB9O1xuICAgIG8ubWVzaGVzICs9IGUubWVzaGVzO1xuICAgIGFkZChvLm1haW4sIGUubWFpbik7IGFkZChvLnNoYWRvdywgZS5zaGFkb3cpO1xuICAgIGFkZChvLnRvdGFsLCBlLm1haW4pOyBhZGQoby50b3RhbCwgZS5zaGFkb3cpO1xuICAgIGFkZCh0b3RhbHMubWFpbiwgZS5tYWluKTsgYWRkKHRvdGFscy5zaGFkb3csIGUuc2hhZG93KTtcbiAgfVxuICBhZGQodG90YWxzLmFsbCwgdG90YWxzLm1haW4pOyBhZGQodG90YWxzLmFsbCwgdG90YWxzLnNoYWRvdyk7XG4gIGNvbnN0IG91dDogUmVuZGVyQnJlYWtkb3duID0geyBvd25lcnMsIGVudHJpZXMsIHRvdGFscywgc2hhZG93TGlnaHRzOiBzaGFkb3dWaWV3cy5sZW5ndGgsIG11bHRpRHJhdyB9O1xuICBpZiAob3B0cy5yZW5kZXJlcikgb3V0LnJlbmRlcmVyID0geyBjYWxsczogb3B0cy5yZW5kZXJlci5pbmZvLnJlbmRlci5jYWxscywgdHJpYW5nbGVzOiBvcHRzLnJlbmRlcmVyLmluZm8ucmVuZGVyLnRyaWFuZ2xlcyB9O1xuICByZXR1cm4gb3V0O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFBLE9BQU8sVUFBVTtBQUNqQixPQUFPLFlBQVk7QUFDbkIsWUFBWUEsWUFBVzs7O0FDRnZCLFlBQVksV0FBVztBQWdFdkIsSUFBTSxXQUFXLElBQVUsY0FBUTtBQUNuQyxJQUFNLFFBQVEsSUFBVSxjQUFRO0FBQ2hDLElBQU0sS0FBSyxJQUFVLGNBQVE7QUFDN0IsSUFBTSxVQUFVLElBQVUsYUFBTztBQUVqQyxTQUFTLFVBQVUsUUFBc0IsTUFBTSxJQUFVLGNBQVEsR0FBa0I7QUFDakYsUUFBTSxpQkFBaUIsT0FBTyxrQkFBa0IsT0FBTyxrQkFBa0I7QUFDekUsU0FBTyxJQUFJLHdCQUF3QixPQUFPLE9BQU8sa0JBQW1CLE9BQWUsYUFBYTtBQUNsRztBQUdBLFNBQVMsYUFBYSxHQUE0QjtBQUNoRCxXQUFTLElBQTJCLEdBQUcsR0FBRyxJQUFJLEVBQUUsT0FBUSxLQUFJLENBQUMsRUFBRSxRQUFTLFFB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QUFHLEdBQUcsQ0FBQztBQUNyQixTQUFPLGtCQUFrQjtBQUd6QixRQUFNLFdBQVcsZ0JBQWdCLE9BQU8sRUFBRSxRQUFRLFNBQVMsT0FBTyxXQUFXLE1BQU0sQ0FBQztBQUNwRixTQUFPLFVBQVUsU0FBUyxPQUFPLFlBQVksTUFBTSxFQUFFLE9BQU8sR0FBRyxXQUFXLEdBQUcsQ0FBQztBQUM5RSxTQUFPLE1BQU0sU0FBUyxXQUFXLEtBQUs7QUFDdEMsUUFBTSxNQUFNLGdCQUFnQixPQUFPLEVBQUUsUUFBUSxVQUFVLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxPQUFPLEdBQUcsV0FBVyxFQUFFLEVBQUUsR0FBRyxZQUFZLEVBQUUsS0FBSyxNQUFNLE1BQU0sRUFBRSxFQUFFLENBQUM7QUFDM0ksU0FBTyxNQUFNLElBQUksV0FBVyxLQUFLO0FBRWpDLFNBQU8sVUFBVSxFQUFFLE9BQU8sS0FBSyxPQUFPLEtBQUssSUFBSSxTQUFTLEdBQUcsTUFBTSxjQUFjLEdBQUcsTUFBTTtBQUMxRixDQUFDOyIsCiAgIm5hbWVzIjogWyJUSFJFRSIsICJtYXQiLCAiZWxlbWVudHMiXQp9Cg==
