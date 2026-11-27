// Shared render helper: merges static rigid-part GLB meshes into a single
// rigid-bone SkinnedMesh (1 draw call per pass instead of 18-20) while leaving
// modular equipment subtrees (eq_*) intact and toggleable.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const skinMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

function hasAncestor(obj: THREE.Object3D, pred: (o: THREE.Object3D) => boolean): boolean {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (pred(cur)) return true;
    cur = cur.parent;
  }
  return false;
}

/**
 * Collapses all non-equipment rigid meshes under `root` into one SkinnedMesh
 * bound 1:1 to Bones inserted into their original parent joint groups, so
 * AnimationMixer tracks on those joint groups keep driving the mesh identically
 * at 1 draw call per pass.
 */
export function skinRigidGltf(
  root: THREE.Object3D,
  keepSubtree: (obj: THREE.Object3D) => boolean,
  boundsRadius = 2.4,
): THREE.SkinnedMesh | null {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();

  const targets: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    if (hasAncestor(o, keepSubtree)) return;
    targets.push(o as THREE.Mesh);
  });
  if (targets.length <= 1) return null;

  const boneByParent = new Map<THREE.Object3D, number>();
  const bones: THREE.Bone[] = [];
  const geos: THREE.BufferGeometry[] = [];

  for (const m of targets) {
    const parent = m.parent ?? root;
    let boneIdx = boneByParent.get(parent);
    if (boneIdx === undefined) {
      const bone = new THREE.Bone();
      bone.name = `${parent.name || 'joint'}_skin_bone`;
      parent.add(bone);
      boneIdx = bones.length;
      bones.push(bone);
      boneByParent.set(parent, boneIdx);
    }

    const raw = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    const g = new THREE.BufferGeometry();
    const pos = raw.getAttribute('position');
    if (!pos) { raw.dispose(); continue; }
    g.setAttribute('position', pos.clone());

    const norm = raw.getAttribute('normal');
    if (norm) g.setAttribute('normal', norm.clone());
    else g.computeVertexNormals();

    const n = pos.count;
    const colAttr = raw.getAttribute('color');
    const colors = new Float32Array(n * 3);
    if (colAttr) {
      for (let i = 0; i < n; i++) {
        colors[i * 3] = colAttr.getX(i);
        colors[i * 3 + 1] = colAttr.getY(i);
        colors[i * 3 + 2] = colAttr.getZ(i);
      }
    } else {
      const matColor = (m.material as THREE.MeshStandardMaterial | undefined)?.color;
      const r = matColor ? matColor.r : 0.7;
      const gr = matColor ? matColor.g : 0.7;
      const b = matColor ? matColor.b : 0.7;
      for (let i = 0; i < n; i++) {
        colors[i * 3] = r;
        colors[i * 3 + 1] = gr;
        colors[i * 3 + 2] = b;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Transform geometry into root-local bind space
    const mat = new THREE.Matrix4().multiplyMatrices(toRoot, m.matrixWorld);
    g.applyMatrix4(mat);

    const skinIndex = new Uint16Array(n * 4);
    const skinWeight = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      skinIndex[i * 4] = boneIdx;
      skinWeight[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));

    raw.dispose();
    geos.push(g);
  }

  if (!geos.length) return null;
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return null;

  for (const m of targets) m.removeFromParent();

  const skinned = new THREE.SkinnedMesh(merged, skinMaterial);
  skinned.name = 'rigid_skinned_body';
  skinned.castShadow = true;
  skinned.receiveShadow = true;
  skinned.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.0, 0), boundsRadius);
  skinned.boundingBox = new THREE.Box3(
    new THREE.Vector3(-boundsRadius, -0.5, -boundsRadius),
    new THREE.Vector3(boundsRadius, boundsRadius + 0.5, boundsRadius),
  );
  root.add(skinned);
  root.updateMatrixWorld(true);
  skinned.bind(new THREE.Skeleton(bones));
  return skinned;
}
