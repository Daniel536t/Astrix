// Bake a group of static props into one mesh per material (presentation only).
//
// M015 device report 1: the MagicBlock settlement drew every crate, woodpile,
// cottage, crop row and settler as its own mesh, about 30 draw calls in the
// main pass and 30 more in the shadow pass. None of them move, so their
// geometry is baked (in the group's space) into one mesh per material and
// attribute layout. Shapes, colours and shadows are unchanged. Skinned
// figures are baked in the pose they were built in (their rest pose).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Attributes that only matter for skinning; a baked figure drops them. */
const SKIN_ATTRIBUTES = ['skinIndex', 'skinWeight'];

export interface StaticMergeResult {
  group: THREE.Group;
  /** Meshes that went in and merged meshes that came out. */
  input: number;
  output: number;
}

/**
 * Merge every visible mesh under `source` into one mesh per material. The
 * result is a new group whose children are in `source`'s local space, so it
 * takes `source`'s place (position it the same way). The source geometries
 * are disposed.
 */
export function mergeStaticGroup(source: THREE.Object3D, name: string): StaticMergeResult {
  source.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(source.matrixWorld).invert();
  const buckets = new Map<string, { material: THREE.Material; geos: THREE.BufferGeometry[]; castShadow: boolean; receiveShadow: boolean; names: Set<string> }>();
  const sources = new Set<THREE.BufferGeometry>();
  let input = 0;
  source.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    let visible = true;
    for (let p: THREE.Object3D | null = m; p && p !== source; p = p.parent) if (!p.visible) visible = false;
    if (!visible) return;
    input++;
    sources.add(m.geometry);
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const a of SKIN_ATTRIBUTES) if (g.attributes[a]) g.deleteAttribute(a);
    if (g.attributes.uv && !(m.material as THREE.MeshStandardMaterial).map) g.deleteAttribute('uv');
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, m.matrixWorld));
    const key = `${m.material.uuid}|${Object.keys(g.attributes).sort().join(',')}`;
    let b = buckets.get(key);
    if (!b) { b = { material: m.material, geos: [], castShadow: false, receiveShadow: false, names: new Set() }; buckets.set(key, b); }
    b.geos.push(g);
    b.castShadow ||= m.castShadow;
    b.receiveShadow ||= m.receiveShadow;
    b.names.add(m.name.replace(/_\d+$/, ''));
  });
  const group = new THREE.Group();
  group.name = name;
  let i = 0;
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.name = `${name}_merged_${i++}`;
    mesh.castShadow = b.castShadow;
    mesh.receiveShadow = b.receiveShadow;
    mesh.userData.parts = [...b.names];
    group.add(mesh);
  }
  for (const g of sources) g.dispose();
  return { group, input, output: group.children.length };
}
