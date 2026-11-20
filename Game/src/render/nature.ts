// Styl natural assets — [PROVISIONAL art direction, documented geometry].
//
// The project has three distinct authored languages (ADB §2):
//   * voxel terrain   — 1 m occupancy/material volume, this directory's terrain;
//   * Noxel           — human-made architecture and props (`noxel.ts`);
//   * Styl (`nat_`)   — organic natural assets, implemented here.
//
// AS-001 v2 supersedes the old stacked-cuboid trees: canopies are faceted
// NatMass ellipsoids (7–11 sides, flat shaded) and trunks are 6-gon NatColumn
// prisms. Rocks and ore hosts stay blocky by design. The owner's reference
// images are still absent, so the set remains provisional.
//
// Entities are the source of truth. A harvested entity is not rendered; the
// renderer never decides whether a tree exists.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import palette from '../data/palette.json';
import { Entity, EntityKind, World, mulberry32 } from '../sim/world';

const M = palette.materials as Record<string, { hex: string }>;
const H = (k: string) => M[k].hex;

const GREEN = [H('canopy_green_a'), H('canopy_green_b'), H('canopy_green_c')];
const PINK = [H('canopy_pink_b'), H('canopy_pink')];
const TRUNK = H('trunk');
const BARK = H('bark_dark');
const STONE = H('stone_top');
const STONE_B = H('stone_body_b');
const STONE_SHADE = H('stone_shade');
const ORE = H('ore_crystal');
const ORE_B = H('ore_crystal_b');
const OCHRE = H('strata_ochre');

type Vec3 = [number, number, number];

interface MassSpec {
  cx: number; cy: number; cz: number;
  rx: number; ry: number; rz: number;
  sides: number;
  shape: 'orb' | 'dome' | 'drum';
  yawDeg: number;
  hex: string;
}

interface TreeSpec {
  trunkR: number;
  trunkH: number;
  flareR: number;
  flareH: number;
  masses: MassSpec[];
  satellite?: { cx: number; cy: number; cz: number; sx: number; sy: number; sz: number; hex: string };
}

// ---------- primitives ----------
function paint(geo: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const color = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, hex: string): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate(cx, cy, cz);
  const out = paint(g, hex);
  out.computeVertexNormals();
  return out;
}

function column(cx: number, cz: number, y0: number, h: number, r: number, sides: number, yawDeg: number, hex: string): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, sides, 1, false);
  g.translate(cx, y0 + h / 2, cz);
  g.rotateY(yawDeg * Math.PI / 180);
  const out = paint(g, hex);
  out.computeVertexNormals();
  return out;
}

/**
 * Literal implementation of AS-001 §3.1: ellipsoid tessellation with flat
 * face normals, outward winding, and authored facet phase.
 */
function massGeometry(m: MassSpec): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const D = Math.PI / 180;
  const lon = (k: number) => m.yawDeg * D + k * 2 * Math.PI / m.sides;
  const row = (phiDeg: number): Vec3[] => {
    const phi = phiDeg * D, c = Math.cos(phi), s = Math.sin(phi);
    const out: Vec3[] = [];
    for (let k = 0; k < m.sides; k++) {
      const t = lon(k);
      out.push([
        m.cx + m.rx * c * Math.cos(t),
        m.cy + m.ry * s,
        m.cz + m.rz * c * Math.sin(t),
      ]);
    }
    return out;
  };
  const pole = (sign: number): Vec3 => [m.cx, m.cy + sign * m.ry, m.cz];
  const capCentre = (phiDeg: number): Vec3 => [m.cx, m.cy + m.ry * Math.sin(phiDeg * D), m.cz];

  const tri = (a: Vec3, b: Vec3, c: Vec3): void => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L; ny /= L; nz /= L;
    const fx = (a[0] + b[0] + c[0]) / 3 - m.cx;
    const fy = (a[1] + b[1] + c[1]) / 3 - m.cy;
    const fz = (a[2] + b[2] + c[2]) / 3 - m.cz;
    if (nx * fx + ny * fy + nz * fz < 0) {
      const t = b; b = c; c = t;
      nx = -nx; ny = -ny; nz = -nz;
    }
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      nrm.push(nx, ny, nz);
    }
  };
  const band = (r0: Vec3[], r1: Vec3[]): void => {
    for (let k = 0; k < m.sides; k++) {
      const j = (k + 1) % m.sides;
      tri(r0[k], r0[j], r1[k]);
      tri(r0[j], r1[j], r1[k]);
    }
  };
  const fan = (ring: Vec3[], apex: Vec3): void => {
    for (let k = 0; k < m.sides; k++) tri(ring[k], ring[(k + 1) % m.sides], apex);
  };
  const cap = (ring: Vec3[], centre: Vec3): void => {
    for (let k = 0; k < m.sides; k++) tri(ring[(k + 1) % m.sides], ring[k], centre);
  };

  if (m.shape === 'orb') {
    const r = [row(-45), row(0), row(45)];
    band(r[0], r[1]); band(r[1], r[2]);
    fan(r[0], pole(-1)); fan(r[2], pole(+1));
  } else if (m.shape === 'dome') {
    const r = [row(0), row(45)];
    band(r[0], r[1]);
    fan(r[1], pole(+1));
    cap(r[0], capCentre(0));
  } else {
    const r = [row(-45), row(0), row(45)];
    band(r[0], r[1]); band(r[1], r[2]);
    cap(r[0], capCentre(-45)); cap(r[2], capCentre(+45));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return paint(geo, m.hex);
}

function assembly(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('Styl geometry merge failed');
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// ---------- authored species (AS-001 §6.3) ----------
const T1: TreeSpec = {
  trunkR: 0.28, trunkH: 4.90, flareR: 0.38, flareH: 0.30,
  masses: [
    { cx: 0.00, cy: 5.45, cz: 0.00, rx: 2.10, ry: 1.00, rz: 2.05, sides: 9, shape: 'orb', yawDeg: 0, hex: GREEN[0] },
    { cx: 0.20, cy: 6.85, cz: -0.20, rx: 1.45, ry: 0.95, rz: 1.35, sides: 7, shape: 'orb', yawDeg: 15, hex: GREEN[1] },
    { cx: -0.15, cy: 7.85, cz: 0.15, rx: 0.95, ry: 0.65, rz: 0.90, sides: 7, shape: 'orb', yawDeg: 30, hex: GREEN[2] },
  ],
  satellite: { cx: 2.40, cy: 5.55, cz: 0.75, sx: 0.80, sy: 0.50, sz: 0.80, hex: GREEN[2] },
};

const T2: TreeSpec = {
  trunkR: 0.34, trunkH: 3.85, flareR: 0.46, flareH: 0.28,
  masses: [
    { cx: 0.00, cy: 3.50, cz: 0.00, rx: 2.95, ry: 1.30, rz: 2.30, sides: 11, shape: 'dome', yawDeg: 0, hex: GREEN[0] },
    { cx: 1.35, cy: 4.00, cz: -0.60, rx: 1.45, ry: 0.95, rz: 1.25, sides: 9, shape: 'dome', yawDeg: 15, hex: GREEN[1] },
    { cx: -0.35, cy: 5.20, cz: 0.25, rx: 1.35, ry: 0.95, rz: 1.25, sides: 9, shape: 'orb', yawDeg: 30, hex: GREEN[2] },
    { cx: -1.45, cy: 4.05, cz: 0.95, rx: 1.10, ry: 0.75, rz: 1.00, sides: 7, shape: 'dome', yawDeg: 45, hex: GREEN[1] },
  ],
};

const T3: TreeSpec = {
  trunkR: 0.26, trunkH: 3.60, flareR: 0.36, flareH: 0.26,
  masses: [
    { cx: 0.00, cy: 4.55, cz: 0.00, rx: 1.45, ry: 1.30, rz: 1.40, sides: 9, shape: 'orb', yawDeg: 0, hex: GREEN[0] },
    { cx: 1.25, cy: 4.05, cz: 0.30, rx: 0.95, ry: 0.80, rz: 0.90, sides: 7, shape: 'orb', yawDeg: 15, hex: GREEN[1] },
    { cx: -1.30, cy: 4.45, cz: -0.45, rx: 0.85, ry: 0.75, rz: 0.85, sides: 7, shape: 'orb', yawDeg: 30, hex: GREEN[1] },
    { cx: 0.10, cy: 5.70, cz: -0.10, rx: 1.00, ry: 0.90, rz: 0.95, sides: 7, shape: 'orb', yawDeg: 45, hex: GREEN[2] },
  ],
  satellite: { cx: 2.35, cy: 3.90, cz: -0.25, sx: 0.70, sy: 0.45, sz: 0.70, hex: GREEN[2] },
};

const T4: TreeSpec = {
  trunkR: 0.30, trunkH: 4.45, flareR: 0.42, flareH: 0.28,
  masses: [
    { cx: 0.00, cy: 5.00, cz: 0.00, rx: 2.35, ry: 1.15, rz: 2.20, sides: 9, shape: 'drum', yawDeg: 0, hex: PINK[0] },
    { cx: 0.30, cy: 5.90, cz: -0.25, rx: 1.55, ry: 1.00, rz: 1.45, sides: 9, shape: 'drum', yawDeg: 15, hex: PINK[1] },
    { cx: -1.40, cy: 4.95, cz: 0.75, rx: 1.05, ry: 0.80, rz: 1.00, sides: 7, shape: 'drum', yawDeg: 30, hex: PINK[0] },
    { cx: 0.15, cy: 6.45, cz: 0.10, rx: 0.95, ry: 0.65, rz: 0.90, sides: 7, shape: 'orb', yawDeg: 45, hex: PINK[1] },
  ],
  satellite: { cx: 2.55, cy: 5.35, cz: 0.85, sx: 0.85, sy: 0.55, sz: 0.85, hex: PINK[1] },
};

const SHRUB: MassSpec[] = [
  { cx: 0.00, cy: 0.55, cz: 0.00, rx: 0.70, ry: 0.55, rz: 0.65, sides: 9, shape: 'orb', yawDeg: 0, hex: GREEN[0] },
  { cx: 0.25, cy: 0.95, cz: -0.15, rx: 0.45, ry: 0.42, rz: 0.42, sides: 7, shape: 'orb', yawDeg: 15, hex: GREEN[1] },
  { cx: -0.20, cy: 1.05, cz: 0.20, rx: 0.34, ry: 0.45, rz: 0.32, sides: 7, shape: 'orb', yawDeg: 30, hex: GREEN[2] },
];

const quant = (v: number) => Math.round(v / 0.05) * 0.05;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

function jitterMass(m: MassSpec, rnd: () => number, groupX: number, groupZ: number): MassSpec {
  const rjit = (v: number) => quant(clamp(v * (1 + (rnd() * 0.16 - 0.08)), 0.25, 4));
  return {
    ...m,
    cx: quant(m.cx + groupX + (rnd() * 0.60 - 0.30)),
    cy: quant(m.cy + (rnd() * 0.40 - 0.20)),
    cz: quant(m.cz + groupZ + (rnd() * 0.60 - 0.30)),
    rx: rjit(m.rx), ry: rjit(m.ry), rz: rjit(m.rz),
    yawDeg: m.yawDeg + (Math.floor(rnd() * 3) - 1) * 15,
  };
}

function treeGeometry(species: TreeSpec, variant: number): THREE.BufferGeometry {
  const rnd = mulberry32((species === T1 ? 11 : species === T2 ? 23 : species === T3 ? 37 : 53) * 7919 + variant * 104729);
  const jittered = variant > 0;
  const groupX = jittered ? rnd() * 0.70 - 0.35 : 0;
  const groupZ = jittered ? rnd() * 0.70 - 0.35 : 0;
  const trunkR = jittered ? quant(clamp(species.trunkR + (rnd() * 0.10 - 0.05), 0.20, 0.40)) : species.trunkR;
  // V5 permits ±0.60 m, but K4 (trunk top inside the canopy) is a hard clamp;
  // a smaller ±0.30 m jitter keeps every variant valid.
  const trunkH = jittered ? quant(clamp(species.trunkH + (rnd() * 0.60 - 0.30), 3.0, 5.4)) : species.trunkH;
  const flareR = trunkR + 0.10;
  const parts: THREE.BufferGeometry[] = [
    column(0, 0, 0, trunkH, trunkR, 6, 0, TRUNK),
    column(0, 0, 0, species.flareH, flareR, 6, 0, BARK),
  ];
  for (const m of species.masses) {
    parts.push(massGeometry(jittered ? jitterMass(m, rnd, groupX, groupZ) : m));
  }
  if (species.satellite && variant % 3 === 0) {
    const s = species.satellite;
    parts.push(box(s.cx + groupX, s.cy, s.cz + groupZ, s.sx, s.sy, s.sz, s.hex));
  }
  return assembly(parts);
}

function shrubGeometry(variant: number): THREE.BufferGeometry {
  const rnd = mulberry32(97 * 7919 + variant * 104729);
  const parts = SHRUB.map((m, i) => {
    if (variant === 0 && i === 0) return massGeometry(m);
    return massGeometry(jitterMass(m, rnd, 0, 0));
  });
  return assembly(parts);
}

// ---------- rocks / ore (block language, AS-001 §8–§9) ----------
function rockGeometry(size: 'small' | 'medium' | 'large', variant: number): THREE.BufferGeometry {
  const rnd = mulberry32((size === 'small' ? 5 : size === 'medium' ? 7 : 9) * 7919 + variant * 104729);
  const j = variant === 0 ? 0 : 1;
  const jx = () => (rnd() * 2 - 1) * (size === 'small' ? 0.15 : size === 'medium' ? 0.25 : 0.35) * j;
  const jz = () => (rnd() * 2 - 1) * (size === 'small' ? 0.15 : size === 'medium' ? 0.25 : 0.35) * j;

  if (size === 'small') {
    return assembly([
      box(0 + jx(), 0.20, 0 + jz(), 0.80, 0.40, 0.70, STONE),
      box(0.10 + jx(), 0.50, -0.05 + jz(), 0.50, 0.30, 0.45, STONE),
      box(-0.20 + jx(), 0.60, 0.10 + jz(), 0.30, 0.20, 0.30, STONE_B),
    ]);
  }
  if (size === 'medium') {
    return assembly([
      box(0 + jx(), 0.45, 0 + jz(), 1.80, 0.90, 1.50, STONE),
      box(0.15 + jx(), 1.10, -0.10 + jz(), 1.20, 0.70, 1.00, STONE),
      box(-0.40 + jx(), 1.40, 0.25 + jz(), 0.70, 0.50, 0.60, STONE_B),
    ]);
  }
  return assembly([
    box(0 + jx(), 0.70, 0 + jz(), 3.00, 1.40, 2.40, STONE),
    box(0.30 + jx(), 1.80, -0.20 + jz(), 1.80, 1.00, 1.40, STONE),
    box(-0.60 + jx(), 2.40, 0.40 + jz(), 1.10, 0.90, 0.90, STONE_B),
    box(0.90 + jx(), 2.20, -0.70 + jz(), 0.60, 0.50, 0.55, STONE_SHADE),
  ]);
}

function oreGeometry(variant: number): THREE.BufferGeometry {
  const flip = variant === 1 ? -1 : 1;
  const parts = [
    box(0, 0.45, 0, 1.80, 0.90, 1.50, STONE),
    box(0.15, 1.10, -0.10, 1.20, 0.70, 1.00, STONE),
    box(-0.40, 1.40, 0.25, 0.70, 0.50, 0.60, STONE_B),
    box(0.10, 0.45, 0.75 * flip, 0.90, 0.35, 0.20, ORE),
    box(0.10, 0.45, 0.865 * flip, 0.50, 0.14, 0.07, ORE_B),
  ];
  return assembly(parts);
}

function cairnGeometry(): THREE.BufferGeometry {
  return assembly([
    box(0, 0.25, 0, 1.50, 0.50, 1.30, STONE),
    box(0.10, 0.725, 0, 1.15, 0.45, 1.00, STONE_B),
    box(-0.10, 1.15, 0.05, 0.85, 0.40, 0.75, STONE),
    box(0.10, 1.525, 0.05, 0.50, 0.35, 0.50, STONE_B),
    box(0.10, 1.85, 0.05, 0.30, 0.30, 0.30, STONE_SHADE),
  ]);
}

// ---------- asset lookup ----------
function geometryFor(kind: EntityKind, variant: number): THREE.BufferGeometry | null {
  if (kind === 'styl_tree_spire') return treeGeometry(T1, Math.abs(variant) % 4);
  if (kind === 'styl_tree_table') return treeGeometry(T2, Math.abs(variant) % 4);
  if (kind === 'styl_tree_cluster') return treeGeometry(T3, Math.abs(variant) % 3);
  if (kind === 'styl_tree_blossom') return treeGeometry(T4, Math.abs(variant) % 2);
  if (kind === 'styl_shrub') return shrubGeometry(Math.abs(variant) % 3);
  if (kind === 'styl_rock_small') return rockGeometry('small', Math.abs(variant) % 3);
  if (kind === 'styl_rock_medium') return rockGeometry('medium', Math.abs(variant) % 3);
  if (kind === 'styl_rock_large') return rockGeometry('large', Math.abs(variant) % 3);
  if (kind === 'styl_ore') return oreGeometry(Math.abs(variant) % 2);
  if (kind === 'styl_cairn') return cairnGeometry();
  return null;
}

export interface NatureBuildResult {
  group: THREE.Group;
  triangles: number;
  instances: number;
}

const natureMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/**
 * Build one InstancedMesh per kind+variant for the supplied loaded chunks.
 * Entities remain the source of truth; harvested entities are skipped.
 */
export function buildNoxelNature(
  world: World,
  loadedChunks: ReadonlySet<string> | null = null,
): NatureBuildResult {
  const group = new THREE.Group();
  group.name = 'styl_nature';
  const buckets = new Map<string, Entity[]>();

  for (const e of world.entities.values()) {
    if (e.harvested) continue;
    if (loadedChunks && !loadedChunks.has(e.chunk)) continue;
    if (!geometryFor(e.kind, e.variant)) continue;
    const key = `${e.kind}:${e.variant}`;
    let list = buckets.get(key);
    if (!list) { list = []; buckets.set(key, list); }
    list.push(e);
  }

  let triangles = 0;
  let instanceCount = 0;
  const geometries = new Map<string, THREE.BufferGeometry>();
  for (const [key, list] of buckets) {
    const [kind, variantStr] = key.split(':');
    const geo = geometryFor(kind as EntityKind, Number(variantStr));
    if (!geo) continue;
    geometries.set(key, geo.index ? geo.toNonIndexed() : geo);
    triangles += (geo.attributes.position.count / 3) * list.length;
    instanceCount += list.length;
  }

  if (instanceCount === 0) return { group, triangles: 0, instances: 0 };

  // One BatchedMesh for every natural asset. The old code used one
  // InstancedMesh per kind+variant (~31 draw calls); this keeps the same
  // authored variants and per-instance transforms in a single draw call.
  let vertexCount = 0;
  for (const geo of geometries.values()) vertexCount += geo.attributes.position.count;
  const batched = new THREE.BatchedMesh(
    instanceCount,
    Math.ceil(vertexCount * 1.08) + 16,
    0,
    natureMaterial,
  );
  batched.name = 'styl_nature_batch';
  batched.castShadow = true;
  batched.receiveShadow = true;
  batched.perObjectFrustumCulled = true;

  const geometryIds = new Map<string, number>();
  for (const [key, geo] of geometries) {
    geometryIds.set(key, batched.addGeometry(geo));
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let instances = 0;
  for (const [key, list] of buckets) {
    const geometryId = geometryIds.get(key);
    if (geometryId === undefined) continue;
    for (const e of list) {
      const id = batched.addInstance(geometryId);
      q.setFromAxisAngle(up, e.rot);
      v.set(e.x, e.y - 0.15, e.z);
      s.setScalar(e.scale);
      batched.setMatrixAt(id, m.compose(v, q, s));
      instances++;
    }
  }
  batched.computeBoundingBox();
  batched.computeBoundingSphere();
  group.add(batched);

  return { group, triangles, instances };
}
