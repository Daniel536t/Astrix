// Noxel renderer — [PROVISIONAL].
//
// The owner's Noxel reference images have never been supplied (the folder is
// still empty). The Noxel Style Guide v1.0 itself records that provenance gap.
// These volumes therefore implement the *written* grammar (rectangular prisms,
// axis-aligned, 90° whole-asset rotation, flat colour, 4-9 volumes) and are
// labelled provisional until Mimo can rebuild them from the owner's images.
//
// Every asset origin is the centre of its footprint on its underside, +X is
// length, +Z thickness, +Y up — the convention in Noxel Style Guide §2.5.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import palette from '../data/palette.json';
import { NoxelSite } from '../sim/world';

const M = palette.materials as Record<string, { hex: string }>;
const H = (k: string) => M[k].hex;

const STONE = H('noxel_stone');
const STONE_B = H('noxel_stone_b');
const OCHRE = H('strata_ochre');
const TIMBER = H('bark_dark');
const BLUE = H('accent_blue');

interface Box {
  w: number; h: number; d: number;
  x?: number; y?: number; z?: number;
  colour: string;
}

function box(b: Box): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(b.w, b.h, b.d);
  g.translate(b.x ?? 0, (b.y ?? 0) + b.h / 2, b.z ?? 0);
  const ng = g.index ? g.toNonIndexed() : g;
  ng.deleteAttribute('uv');
  const c = new THREE.Color(b.colour);
  const n = ng.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return ng;
}

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

function assembly(boxes: Box[], name: string, mat: THREE.Material = MAT): THREE.Mesh {
  const g = mergeGeometries(boxes.map(box), false)!;
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = name;
  mesh.castShadow = true;
  // Noxel masses are simple prisms; self-shadowing only produced acne on the
  // large flat faces, so keep the cast shadow but not the receive.
  mesh.receiveShadow = false;
  return mesh;
}

/** Shared kit piece vocabulary (dimensions from Noxel Style Guide §3). */
export function noxelWall(): THREE.Mesh {
  return assembly([
    { w: 4.0, h: 0.4, d: 1.2, y: 0, colour: STONE_B },          // foundation slab
    { w: 3.8, h: 0.2, d: 1.0, y: 0.4, colour: OCHRE },           // threshold accent
    { w: 4.0, h: 3.2, d: 0.6, y: 0.4, colour: STONE },           // mass
    { w: 4.0, h: 0.3, d: 0.6, x: 0, y: 3.6, colour: STONE_B },   // parapet slab
    { w: 0.3, h: 0.3, d: 0.7, x: -1.4, y: 3.9, colour: STONE },  // cap blocks
    { w: 0.3, h: 0.3, d: 0.7, x: 0.0, y: 3.9, colour: STONE },
    { w: 0.3, h: 0.3, d: 0.7, x: 1.4, y: 3.9, colour: STONE },
  ], 'noxel_wall');
}

export function noxelPost(): THREE.Mesh {
  return assembly([
    { w: 1.8, h: 0.4, d: 1.8, y: 0, colour: STONE_B },           // slab base
    { w: 1.2, h: 4.8, d: 1.2, y: 0.4, colour: STONE },            // post
    { w: 1.6, h: 0.3, d: 1.6, y: 5.2, colour: STONE_B },          // post cap
  ], 'noxel_post');
}

export function noxelGateway(): THREE.Mesh {
  return assembly([
    { w: 1.8, h: 0.4, d: 1.8, x: -2.4, y: 0, colour: STONE_B },
    { w: 1.8, h: 0.4, d: 1.8, x: 2.4, y: 0, colour: STONE_B },
    { w: 1.2, h: 4.8, d: 1.2, x: -2.4, y: 0.4, colour: STONE },
    { w: 1.2, h: 4.8, d: 1.2, x: 2.4, y: 0.4, colour: STONE },
    { w: 6.0, h: 0.8, d: 1.2, y: 5.2, colour: STONE },            // lintel mass
    { w: 1.6, h: 0.3, d: 1.6, x: -2.4, y: 6.0, colour: STONE_B }, // cap blocks
    { w: 1.6, h: 0.3, d: 1.6, x: 2.4, y: 6.0, colour: STONE_B },
  ], 'noxel_gateway');
}

export function noxelStair(): THREE.Mesh {
  const boxes: Box[] = [];
  for (let i = 0; i < 4; i++) {
    boxes.push({ w: 2.0, h: 0.3, d: 0.9, z: i * 0.9, y: i * 0.3, colour: i % 2 ? STONE_B : STONE });
  }
  boxes.push({ w: 2.0, h: 0.3, d: 2.0, z: 3.6, y: 1.2, colour: STONE });
  return assembly(boxes, 'noxel_stair');
}

export function noxelBench(): THREE.Mesh {
  return assembly([
    { w: 2.0, h: 0.4, d: 0.6, y: 0, colour: STONE_B },
    { w: 1.8, h: 0.25, d: 0.5, y: 0.4, colour: TIMBER },
    { w: 0.4, h: 0.4, d: 0.4, x: -0.7, y: 0.65, colour: OCHRE },
  ], 'noxel_bench');
}

const ACCENT_MAT = new THREE.MeshLambertMaterial({
  vertexColors: true, flatShading: true,
  emissive: new THREE.Color(H('accent_teal')), emissiveIntensity: 0.55,
});

/**
 * A tall forked waystone. The cream stone mass is the Noxel body; the teal
 * inlay is the only emissive accent. The split crown gives it a silhouette
 * that is legible at 60 m without turning it into a settlement building.
 */
function waystone(): THREE.Object3D {
  const body = assembly([
    // Volumes overlap by 1-2 cm at every seat. Exact coplanar contacts
    // produced a moiré/depth-fight hatch on the horizontal shoulders.
    { w: 3.2, h: 0.50, d: 2.6, y: 0, colour: STONE_B },            // plinth
    { w: 2.4, h: 0.35, d: 2.0, y: 0.45, colour: STONE },           // step
    { w: 1.7, h: 2.90, d: 1.25, y: 0.75, colour: STONE },          // lower shaft
    { w: 2.1, h: 0.33, d: 1.5, y: 3.60, colour: STONE_B },         // shoulder
    { w: 1.0, h: 2.32, d: 0.85, y: 3.88, colour: STONE },          // upper shaft
    { w: 1.25, h: 0.35, d: 0.95, y: 6.15, colour: STONE },         // fork bridge
    { w: 0.35, h: 1.40, d: 0.55, x: -0.45, y: 6.45, colour: STONE_B }, // left prong
    { w: 0.35, h: 1.40, d: 0.55, x: 0.45, y: 6.45, colour: STONE_B },  // right prong
  ], 'noxel_waystone');
  const glow = assembly([
    { w: 0.18, h: 1.65, d: 0.055, x: -0.23, z: -0.655, y: 1.2, colour: H('accent_teal') },
    { w: 0.18, h: 1.65, d: 0.055, x: 0.23, z: -0.655, y: 1.2, colour: H('accent_teal') },
    { w: 0.18, h: 1.65, d: 0.055, x: -0.23, z: 0.655, y: 1.2, colour: H('accent_teal') },
    { w: 0.18, h: 1.65, d: 0.055, x: 0.23, z: 0.655, y: 1.2, colour: H('accent_teal') },
    { w: 1.15, h: 0.13, d: 1.35, y: 3.66, colour: H('accent_blue') },
    { w: 0.05, h: 0.55, d: 0.55, x: 0.53, y: 4.35, colour: H('accent_teal') },
    { w: 0.05, h: 0.55, d: 0.55, x: -0.53, y: 4.35, colour: H('accent_teal') },
  ], 'noxel_waystone_glow', ACCENT_MAT);
  const g = new THREE.Group();
  g.add(body, glow);
  g.name = 'noxel_waystone';
  body.castShadow = true;
  return g;
}

function marker(): THREE.Object3D {
  const body = assembly([
    { w: 1.8, h: 0.4, d: 1.8, y: 0, colour: STONE_B },
    { w: 1.2, h: 0.25, d: 1.2, y: 0.4, colour: STONE },
    { w: 0.7, h: 2.6, d: 0.7, y: 0.65, colour: STONE },
    { w: 1.15, h: 0.22, d: 1.15, y: 3.25, colour: STONE_B },
    { w: 0.35, h: 0.55, d: 0.35, y: 3.47, colour: STONE },
  ], 'noxel_marker');
  const glow = assembly([
    { w: 0.24, h: 1.15, d: 0.04, z: -0.37, y: 1.0, colour: H('accent_teal') },
    { w: 0.24, h: 1.15, d: 0.04, z: 0.37, y: 1.0, colour: H('accent_teal') },
    { w: 0.52, h: 0.10, d: 0.52, y: 3.36, colour: H('accent_blue') },
  ], 'noxel_marker_glow', ACCENT_MAT);
  const g = new THREE.Group();
  g.add(body, glow);
  g.name = 'noxel_marker';
  return g;
}

export function buildNoxelSite(site: NoxelSite): THREE.Object3D {
  const mesh = site.kind === 'waystone' ? waystone() : marker();
  mesh.position.set(site.x, site.y - 0.12, site.z);
  mesh.rotation.y = site.rot;
  mesh.userData.siteId = site.id;
  mesh.userData.inspectTarget = {
    x: 0, y: site.kind === 'waystone' ? 3.2 : 1.8, z: 0,
  };
  return mesh;
}

export interface KitItem { name: string; build: () => THREE.Object3D; x: number; z: number }

/** Small integration-test set: terrain section + founder-tier modules. */
export function buildKit(): THREE.Object3D[] {
  const items: KitItem[] = [
    { name: 'Post', build: noxelPost, x: -9, z: 0 },
    { name: 'Wall panel', build: noxelWall, x: -4.5, z: 0 },
    { name: 'Gateway', build: noxelGateway, x: 2.5, z: 0 },
    { name: 'Stair', build: noxelStair, x: 5.8, z: 0.2 },
    { name: 'Waystone', build: waystone, x: 13.2, z: 2.2 },
  ];
  return items.map((it) => {
    const m = it.build();
    m.position.x = it.x;
    m.position.z = it.z;
    if (it.name === 'Stair') m.rotation.y = Math.PI / 2;
    m.userData.kitId = it.name.toLowerCase().replace(' panel', '');
    m.userData.inspectTarget = { x: 0, y: it.name === 'Waystone' ? 3.2 : 1.2, z: 0 };
    return m;
  });
}

export { BLUE };
