import * as THREE from 'three';

// Presentation-only render cost breakdown. Walks the scene the same way
// WebGLRenderer does and estimates, per owner, how many draw calls and
// triangles the main pass and the shadow pass(es) issue. Read-only: it never
// changes the scene, the renderer or simulation state, and reads matrices as
// they were left by the last render.
//
// Model of what three.js draws (r186 WebGLRenderer / WebGLShadowMap):
// - every visible Mesh / InstancedMesh / BatchedMesh that passes the layer and
//   frustum test is one draw per material group (two in the main pass for
//   transparent DoubleSide materials, which three.js draws back then front
//   faces). A BatchedMesh is one
//   multi-draw call when WEBGL_multi_draw exists, otherwise three.js falls
//   back to one draw per drawn instance, and no call when nothing survives
//   per-object culling;
// - triangles = drawn index (or vertex) count / 3, times instance count for
//   InstancedMesh; BatchedMesh sums its visible, active, per-object frustum
//   culled instances;
// - each shadow-casting DirectionalLight / SpotLight redraws every castShadow
//   mesh inside its shadow camera frustum (PointLight: 6 faces, not culled
//   per face here, so it is an upper bound).

export interface BreakdownCost {
  draws: number;
  triangles: number;
}

export interface BreakdownEntry {
  owner: string;
  mesh: string;
  type: 'Mesh' | 'InstancedMesh' | 'BatchedMesh' | 'Line' | 'Points';
  meshes: number;
  visible: number;
  castShadow: number;
  instances: number;
  main: BreakdownCost;
  shadow: BreakdownCost;
}

export interface RenderBreakdown {
  owners: Record<string, { meshes: number; main: BreakdownCost; shadow: BreakdownCost; total: BreakdownCost }>;
  entries: BreakdownEntry[];
  totals: { main: BreakdownCost; shadow: BreakdownCost; all: BreakdownCost };
  shadowLights: number;
  multiDraw: boolean;
  renderer?: { calls: number; triangles: number };
}

export interface BreakdownOptions {
  camera?: THREE.Camera;
  renderer?: {
    info: { render: { calls: number; triangles: number } };
    shadowMap?: { enabled: boolean };
    extensions?: { has(name: string): boolean };
  };
  /** Include shadow passes (defaults to renderer.shadowMap.enabled, else true). */
  shadows?: boolean;
  /** WEBGL_multi_draw available (defaults to renderer.extensions, else true). */
  multiDraw?: boolean;
}

type Drawable = THREE.Mesh | THREE.InstancedMesh | THREE.BatchedMesh | THREE.Line | THREE.Points;

const _frustum = new THREE.Frustum();
const _proj = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _sphere = new THREE.Sphere();

function frustumOf(camera: THREE.Camera, out = new THREE.Frustum()): THREE.Frustum {
  _proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  return out.setFromProjectionMatrix(_proj, camera.coordinateSystem, (camera as any).reversedDepth);
}

/** Visible in the scene graph: the object and every ancestor are visible. */
function graphVisible(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

function ownerOf(o: THREE.Object3D, root: THREE.Object3D): THREE.Object3D {
  let top = o;
  while (top.parent && top.parent !== root) top = top.parent;
  return top;
}

/** Collapse numeric parts of names so 49 chunk meshes aggregate to one row. */
function label(o: THREE.Object3D): string {
  return (o.name || o.type).replace(/-?\d+(\.\d+)?/g, '#');
}

function elementCount(g: THREE.BufferGeometry): number {
  return g.index ? g.index.count : (g.attributes.position?.count ?? 0);
}

/**
 * Main-pass draws per material: transparent DoubleSide materials are drawn
 * twice (back faces, then front faces) unless forceSinglePass is set. The
 * shadow pass uses depth materials and draws once.
 */
function passes(mat: THREE.Material, main: boolean): number {
  return main && mat.transparent && mat.side === THREE.DoubleSide && !mat.forceSinglePass ? 2 : 1;
}

/** Per-material-group element counts (repeated per pass), clamped by the draw range. */
function groupCounts(obj: Drawable, main: boolean): number[] {
  const g = obj.geometry as THREE.BufferGeometry;
  const total = elementCount(g);
  const rs = Math.max(0, g.drawRange.start);
  const re = Math.min(total, g.drawRange.start + g.drawRange.count);
  const mats = obj.material;
  if (Array.isArray(mats) && g.groups.length > 0) {
    const out: number[] = [];
    for (const grp of g.groups) {
      const mat = mats[grp.materialIndex ?? 0];
      if (!mat || !mat.visible) continue;
      const s = Math.max(rs, grp.start), e = Math.min(re, grp.start + grp.count);
      if (e > s) for (let p = passes(mat, main); p > 0; p--) out.push(e - s);
    }
    return out;
  }
  const mat = Array.isArray(mats) ? mats[0] : mats;
  if (!mat || !(mat as THREE.Material).visible) return [];
  return re > rs ? new Array(passes(mat as THREE.Material, main)).fill(re - rs) : [];
}

function trianglesPerElement(obj: Drawable): number {
  return (obj as THREE.Mesh).isMesh ? 1 / 3 : 0;
}

/** Cost of drawing obj once from a view, or null when culled. */
function drawCost(obj: Drawable, frustum: THREE.Frustum | null, multiDraw: boolean, main: boolean): BreakdownCost | null {
  if (frustum && obj.frustumCulled && !frustum.intersectsObject(obj)) return null;
  const perEl = trianglesPerElement(obj);
  if ((obj as THREE.BatchedMesh).isBatchedMesh) {
    const b = obj as THREE.BatchedMesh;
    const info = (b as any)._instanceInfo as { visible: boolean; active: boolean; geometryIndex: number }[];
    const mat = Array.isArray(b.material) ? b.material[0] : b.material;
    if (!mat || !mat.visible) return null;
    const range = { indexCount: 0, vertexCount: 0 } as any;
    const indexed = !!b.geometry.index;
    let elements = 0, drawn = 0;
    for (let i = 0; i < info.length; i++) {
      const it = info[i];
      if (!it.active || !it.visible) continue;
      if (frustum && b.perObjectFrustumCulled) {
        b.getMatrixAt(i, _m);
        const s = b.getBoundingSphereAt(it.geometryIndex, _sphere);
        if (s && !frustum.intersectsSphere(s.applyMatrix4(_m).applyMatrix4(b.matrixWorld))) continue;
      }
      b.getGeometryRangeAt(it.geometryIndex, range);
      elements += indexed ? range.indexCount : range.vertexCount;
      drawn++;
    }
    if (drawn === 0) return null;
    const p = passes(mat, main);
    return { draws: (multiDraw ? 1 : drawn) * p, triangles: Math.round(elements * perEl) * p };
  }
  const counts = groupCounts(obj, main);
  if (counts.length === 0) return null;
  const inst = (obj as THREE.InstancedMesh).isInstancedMesh ? (obj as THREE.InstancedMesh).count : 1;
  if (inst <= 0) return null;
  let elements = 0;
  for (const c of counts) elements += c;
  return { draws: counts.length, triangles: Math.round(elements * perEl * inst) };
}

function instancesOf(obj: Drawable): number {
  if ((obj as THREE.BatchedMesh).isBatchedMesh) return (obj as THREE.BatchedMesh).instanceCount;
  if ((obj as THREE.InstancedMesh).isInstancedMesh) return (obj as THREE.InstancedMesh).count;
  return 1;
}

function typeOf(obj: Drawable): BreakdownEntry['type'] {
  if ((obj as THREE.BatchedMesh).isBatchedMesh) return 'BatchedMesh';
  if ((obj as THREE.InstancedMesh).isInstancedMesh) return 'InstancedMesh';
  if ((obj as THREE.Mesh).isMesh) return 'Mesh';
  if ((obj as THREE.Line).isLine) return 'Line';
  return 'Points';
}

const add = (a: BreakdownCost, b: BreakdownCost | null) => { if (b) { a.draws += b.draws; a.triangles += b.triangles; } };
const zero = (): BreakdownCost => ({ draws: 0, triangles: 0 });

export function renderBreakdown(scene: THREE.Scene, opts: BreakdownOptions = {}): RenderBreakdown {
  // Uses the world / camera / shadow-camera matrices as of the last render,
  // so call it after renderer.render (or update them yourself in tests).
  const camera = opts.camera;
  const mainFrustum = camera ? frustumOf(camera, _frustum) : null;

  const drawables: Drawable[] = [];
  const shadowViews: { frustum: THREE.Frustum | null; layers: THREE.Layers; repeat: number }[] = [];
  const shadowsOn = opts.shadows ?? opts.renderer?.shadowMap?.enabled ?? true;
  const multiDraw = opts.multiDraw ?? opts.renderer?.extensions?.has('WEBGL_multi_draw') ?? true;
  scene.traverse((o) => {
    const any = o as any;
    if (any.isMesh || any.isLine || any.isPoints) drawables.push(o as Drawable);
    if (shadowsOn && any.isLight && any.castShadow && any.shadow && graphVisible(o)) {
      const shadow = any.shadow as THREE.LightShadow;
      if (any.isPointLight) {
        shadowViews.push({ frustum: null, layers: shadow.camera.layers, repeat: 6 });
      } else {
        shadowViews.push({ frustum: frustumOf(shadow.camera, new THREE.Frustum()), layers: shadow.camera.layers, repeat: 1 });
      }
    }
  });

  const byKey = new Map<string, BreakdownEntry>();
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
    // Shadow pass mirrors WebGLShadowMap: castShadow meshes/lines/points.
    if (obj.castShadow) {
      e.castShadow++;
      for (const v of shadowViews) {
        if (!obj.layers.test(v.layers)) continue;
        const c = drawCost(obj, v.frustum, multiDraw, false);
        if (c) add(e.shadow, { draws: c.draws * v.repeat, triangles: c.triangles * v.repeat });
      }
    }
  }

  const entries = [...byKey.values()].sort((a, b) =>
    (b.main.draws + b.shadow.draws) - (a.main.draws + a.shadow.draws)
    || (b.main.triangles + b.shadow.triangles) - (a.main.triangles + a.shadow.triangles));
  const owners: RenderBreakdown['owners'] = {};
  for (const e of entries) {
    const o = owners[e.owner] ??= { meshes: 0, main: zero(), shadow: zero(), total: zero() };
    o.meshes += e.meshes;
    add(o.main, e.main); add(o.shadow, e.shadow);
    add(o.total, e.main); add(o.total, e.shadow);
    add(totals.main, e.main); add(totals.shadow, e.shadow);
  }
  add(totals.all, totals.main); add(totals.all, totals.shadow);
  const out: RenderBreakdown = { owners, entries, totals, shadowLights: shadowViews.length, multiDraw };
  if (opts.renderer) out.renderer = { calls: opts.renderer.info.render.calls, triangles: opts.renderer.info.render.triangles };
  return out;
}
