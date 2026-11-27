// Block-built vegetation kit: trees, bushes and stone props from plain boxes.
//
// Owner direction (REF-004 rows 1, 5, 7): canopies of stacked cubes, many
// species and sizes, very chunky trees. The language matches the village kit
// and animal models: axis-aligned boxes, plain vertex colours, flat Lambert
// shading, a baked top/side/bottom face shade and a slight per-block tint. No
// textures.
//
// Every model is authored once as a plan (trunk blocks, canopy tiers, detail
// blocks) and three LOD geometries are derived from the same plan, so the
// silhouette and colours stay put when a tree switches band:
//   near: every block, hidden trunk caps removed;
//   mid:  main trunk plus at most 3 boxes that bound groups of canopy tiers;
//   far:  at most 3 boxes (trunk plus up to 2 canopy boxes), <= 36 triangles.
//
// Geometry is a pure function of (species, stage, variant, lod): presentation
// only, built from a local seeded RNG, never the simulation stream.
import * as THREE from 'three';
import palette from '../data/palette.json';
import { mulberry32 } from '../sim/noise';
import type { BushSpecies, GrowthStage, TreeSpecies, VegetationSpecies } from '../sim/vegetation';
import type { TreeStage } from '../sim/woodland';
import type { LodBand } from './lod';

const M = palette.materials as Record<string, { hex: string }>;
const H = (k: string) => M[k].hex;

/** Face bits for `omit`: +x, -x, +y, -y, +z, -z. */
export const FACE_PX = 1, FACE_NX = 2, FACE_PY = 4, FACE_NY = 8, FACE_PZ = 16, FACE_NZ = 32;
const CAPS = FACE_PY | FACE_NY;

export interface Block {
  /** Centre and size in metres. */
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  hex: string;
  /** Faces not emitted (hidden in the ground or inside another block). */
  omit?: number;
  /** Per-block brightness tint, default 1. */
  k?: number;
}

export interface VegetationPlan {
  /** trunk[0] is the main trunk used by the mid and far LODs. */
  trunk: Block[];
  /** Near-only blocks: branches, root flare, berries, bark marks. */
  detail: Block[];
  /** Canopy tiers from bottom to top. */
  tiers: Block[][];
  /** Max canopy boxes in the mid and far LODs. */
  midBoxes: number;
  farBoxes: number;
}

const FACES: Array<{ n: [number, number, number]; bit: number; shade: number }> = [
  { n: [1, 0, 0], bit: FACE_PX, shade: 0.86 },
  { n: [-1, 0, 0], bit: FACE_NX, shade: 0.86 },
  { n: [0, 1, 0], bit: FACE_PY, shade: 1 },
  { n: [0, -1, 0], bit: FACE_NY, shade: 0.7 },
  { n: [0, 0, 1], bit: FACE_PZ, shade: 0.8 },
  { n: [0, 0, -1], bit: FACE_NZ, shade: 0.8 },
];

export function blockTriangles(b: Block): number {
  let faces = 6;
  for (const f of FACES) if ((b.omit ?? 0) & f.bit) faces--;
  return faces * 2;
}

/** Merges blocks into one non-indexed position/normal/color geometry. */
export function blocksGeometry(blocks: Block[]): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [], col: number[] = [];
  const c = new THREE.Color();
  for (const b of blocks) {
    c.set(b.hex).multiplyScalar(b.k ?? 1);
    const hx = b.w / 2, hy = b.h / 2, hz = b.d / 2;
    for (const f of FACES) {
      if ((b.omit ?? 0) & f.bit) continue;
      const [nx, ny, nz] = f.n;
      // Two tangent axes of the face; corners walk them counter-clockwise
      // seen from outside (t1 x t2 = n).
      const t1: [number, number, number] = nx !== 0 ? [0, 1, 0] : ny !== 0 ? [0, 0, 1] : [1, 0, 0];
      const t2: [number, number, number] = [ny * t1[2] - nz * t1[1], nz * t1[0] - nx * t1[2], nx * t1[1] - ny * t1[0]];
      const corner = (s1: number, s2: number): [number, number, number] => [
        b.x + (nx + s1 * t1[0] + s2 * t2[0]) * hx,
        b.y + (ny + s1 * t1[1] + s2 * t2[1]) * hy,
        b.z + (nz + s1 * t1[2] + s2 * t2[2]) * hz,
      ];
      const q = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos.push(...q[i]);
        nrm.push(nx, ny, nz);
        col.push(c.r * f.shade, c.g * f.shade, c.b * f.shade);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** One box bounding `blocks`, shrunk horizontally, coloured by the largest block. */
function boundingBlock(blocks: Block[], shrink: number): Block {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  let main = blocks[0];
  for (const b of blocks) {
    x0 = Math.min(x0, b.x - b.w / 2); x1 = Math.max(x1, b.x + b.w / 2);
    y0 = Math.min(y0, b.y - b.h / 2); y1 = Math.max(y1, b.y + b.h / 2);
    z0 = Math.min(z0, b.z - b.d / 2); z1 = Math.max(z1, b.z + b.d / 2);
    if (b.w * b.h * b.d > main.w * main.h * main.d) main = b;
  }
  const one = blocks.length === 1 ? 1 : shrink;
  return {
    x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2,
    w: (x1 - x0) * one, h: y1 - y0, d: (z1 - z0) * one,
    hex: main.hex, k: main.k,
  };
}

/** Splits tiers into at most `n` contiguous groups and bounds each group. */
function groupedBoxes(tiers: Block[][], n: number, shrink: number): Block[] {
  const count = Math.min(n, tiers.length);
  const out: Block[] = [];
  for (let g = 0; g < count; g++) {
    const from = Math.floor(g * tiers.length / count), to = Math.floor((g + 1) * tiers.length / count);
    out.push(boundingBlock(tiers.slice(from, to).flat(), shrink));
  }
  return out;
}

/** The blocks drawn at `lod`. */
export function planBlocks(plan: VegetationPlan, lod: LodBand): Block[] {
  if (lod === 0) return [...plan.trunk, ...plan.detail, ...plan.tiers.flat()];
  const trunk = plan.trunk.length ? [{ ...plan.trunk[0], omit: CAPS }] : [];
  if (lod === 1) return [...trunk, ...groupedBoxes(plan.tiers, plan.midBoxes, 0.88)];
  const canopy = groupedBoxes(plan.tiers, plan.farBoxes, 0.85);
  const far = [...trunk, ...canopy];
  // Far must stay cheaper than mid; small plants drop the trunk first.
  const mid = planBlocks(plan, 1);
  const tris = (bs: Block[]) => bs.reduce((s, b) => s + blockTriangles(b), 0);
  if (tris(far) >= tris(mid) || tris(far) > 36) return canopy.slice(0, 3);
  return far;
}

export function planTriangles(plan: VegetationPlan, lod: LodBand): number {
  return planBlocks(plan, lod).reduce((s, b) => s + blockTriangles(b), 0);
}

// ---------- authoring helpers ----------
const STAGE_SIZE: Record<TreeStage, number> = { sapling: 0.4, young: 0.68, mature: 1, old: 1.12, dying: 1.12, snag: 1.08, stump: 1 };
const Q = (v: number) => Math.round(v * 20) / 20;

/** Plan authoring context: stage scale, detail switch and a variant RNG. */
class Author {
  readonly s: number;
  readonly full: boolean;
  readonly old: boolean;
  readonly rnd: () => number;
  constructor(readonly stage: TreeStage, seed: number, size = STAGE_SIZE[stage]) {
    this.s = size;
    this.full = stage === 'mature' || stage === 'old' || stage === 'dying';
    this.old = stage === 'old' || stage === 'dying';
    this.rnd = mulberry32(seed);
  }
  /** Signed jitter in [-a, a]. */
  j(a: number): number { return (this.rnd() * 2 - 1) * a; }
  /** A scaled block with small variant jitter of position and size. */
  b(hex: string, w: number, h: number, d: number, x: number, y: number, z: number, jit = 0.25, omit = 0): Block {
    const s = this.s, sz = 1 + this.j(0.08);
    return {
      x: Q((x + this.j(jit)) * s), y: Q((y + this.j(jit * 0.5)) * s), z: Q((z + this.j(jit)) * s),
      w: Q(Math.max(0.1, w * sz * s)), h: Q(Math.max(0.1, h * s)), d: Q(Math.max(0.1, d * sz * s)),
      hex, omit, k: (this.old ? 0.94 : 1) * (1 + this.j(0.05)),
    };
  }
  /** A trunk column from the ground to `top` (unscaled metres). */
  trunk(hex: string, w: number, top: number, x = 0, z = 0): Block {
    const s = this.s, ww = w * (this.old ? 1.3 : 1);
    return { x: Q(x * s), y: Q(top * s / 2), z: Q(z * s), w: Q(Math.max(0.1, ww * s)), h: Q(top * s), d: Q(Math.max(0.1, ww * s)), hex, omit: CAPS };
  }
  flare(hex: string, w: number): Block[] {
    if (!this.full) return [];
    const ww = w * (this.old ? 1.35 : 1);
    const out = [this.b(hex, ww, 0.45, ww, 0, 0.225, 0, 0, FACE_NY)];
    if (this.old) out.push(this.b(hex, ww * 0.55, 0.3, ww * 1.45, 0.1, 0.15, 0, 0.1, FACE_NY));
    return out;
  }
}

// ---------- tree species ----------
function sapling(a: Author, trunkHex: string, leaf: string, leafB: string, conifer: boolean): VegetationPlan {
  // Saplings use the species colours at a fixed small size (stage scale 0.4).
  const tiers = conifer
    ? [[a.b(leaf, 2.6, 1.6, 2.6, 0, 3.0, 0, 0.1)], [a.b(leafB, 1.5, 1.4, 1.5, 0, 4.4, 0, 0.1)]]
    : [[a.b(leaf, 2.8, 2.2, 2.6, 0, 3.6, 0, 0.1)], [a.b(leafB, 1.5, 1.3, 1.4, 0.6, 5.0, -0.3, 0.2)]];
  return { trunk: [a.trunk(trunkHex, 0.5, conifer ? 2.4 : 3.0)], detail: [], tiers, midBoxes: 1, farBoxes: 1 };
}

function oak(a: Author): VegetationPlan {
  const [T, B, gA, gB, gC] = [H('trunk'), H('bark_dark'), H('canopy_green_a'), H('canopy_green_b'), H('canopy_green_c')];
  if (a.stage === 'sapling') return sapling(a, T, gB, gC, false);
  const detail = [...a.flare(B, 1.25)];
  if (a.full) {
    detail.push(a.b(T, 1.6, 0.35, 0.35, 0.95, 3.0, 0, 0.1));
    detail.push(a.b(T, 0.35, 0.35, 1.4, -0.3, 3.3, -0.85, 0.1));
  }
  const t0 = [a.b(gA, 4.4, 1.6, 4.0, 0, 4.0, 0), a.b(gB, 1.8, 1.6, 1.8, 2.3, 3.9, 0.6), a.b(gB, 1.8, 1.5, 1.8, -2.2, 4.1, -0.5)];
  if (a.full) t0.push(a.b(gA, 1.7, 1.4, 1.7, 0.4, 3.8, -2.1), a.b(gB, 1.6, 1.5, 1.6, -0.3, 4.2, 2.1));
  const t1 = [a.b(gB, 3.2, 1.4, 3.0, 0.2, 5.5, -0.1)];
  if (a.full) t1.push(a.b(gC, 1.4, 1.3, 1.4, 1.6, 5.6, 1.0));
  const t2 = [a.b(gC, 1.8, 1.0, 1.8, -0.2, 6.6, 0.2, 0.2)];
  return { trunk: [a.trunk(T, 0.8, 3.6)], detail, tiers: [t0, t1, t2], midBoxes: 3, farBoxes: 2 };
}

function pine(a: Author): VegetationPlan {
  const [T, B, g, gB] = [H('trunk'), H('bark_dark'), H('conifer_pine'), H('conifer_pine_b')];
  if (a.stage === 'sapling') return sapling(a, T, g, gB, true);
  const detail = [...a.flare(B, 0.85)];
  if (a.full) detail.push(a.b(B, 0.9, 0.25, 0.25, 0.5, 3.6, 0, 0.1));
  const t0 = [a.b(g, 3.6, 0.9, 3.2, 0, 5.3, 0, 0.2)];
  if (a.full) t0.push(a.b(gB, 1.5, 0.9, 1.5, 1.9, 5.1, 0.7), a.b(g, 1.4, 0.8, 1.4, -1.6, 5.4, -0.9));
  const t1 = [a.b(gB, 2.7, 0.9, 2.5, 0.1, 6.3, -0.1, 0.2)];
  if (a.full) t1.push(a.b(g, 1.2, 0.8, 1.2, -1.4, 6.2, 0.8));
  const t2 = [a.b(g, 1.7, 0.8, 1.6, 0, 7.2, 0, 0.15)];
  const t3 = [a.b(gB, 0.8, 0.8, 0.8, 0, 8.0, 0, 0.1)];
  return { trunk: [a.trunk(T, 0.55, 6.6)], detail, tiers: [t0, t1, t2, t3], midBoxes: 3, farBoxes: 2 };
}

function spruce(a: Author): VegetationPlan {
  const [T, B, g, gB] = [H('bark_dark'), H('bark_dark'), H('conifer_spruce'), H('conifer_spruce_b')];
  if (a.stage === 'sapling') return sapling(a, T, g, gB, true);
  // M013 (REF-006 image 2): flat, layered tiers with the dark trunk showing between them.
  const cross = (w: number, n: number, y: number, h: number, hexA: string, hexB: string): Block[] => {
    const out = [a.b(hexA, w, h, n, 0, y, 0, 0.1)];
    if (a.full) out.push(a.b(hexB, n, h * 0.9, w, 0, y + 0.05, 0, 0.1));
    return out;
  };
  const tiers = [
    cross(4.4, 2.4, 1.75, 0.7, g, gB),
    cross(3.7, 2.0, 2.75, 0.65, gB, g),
    cross(2.9, 1.7, 3.7, 0.6, g, gB),
    [a.b(gB, 2.1, 0.6, 2.1, 0, 4.6, 0, 0.1)],
    [a.b(g, 1.3, 0.6, 1.3, 0, 5.4, 0, 0.1)],
    [a.b(gB, 0.55, 0.75, 0.55, 0, 6.2, 0, 0.05)],
  ];
  // Drooping tier tips at full detail: the layered spruce edge.
  const detail = [...a.flare(B, 0.8)];
  if (a.full) detail.push(a.b(g, 0.6, 0.35, 0.6, 2.25, 1.35, 0, 0.1), a.b(gB, 0.6, 0.35, 0.6, -2.2, 1.35, 0.1, 0.1),
    a.b(gB, 0.5, 0.3, 0.5, 0, 2.4, 1.9, 0.1), a.b(g, 0.5, 0.3, 0.5, 0.1, 2.4, -1.85, 0.1));
  return { trunk: [a.trunk(T, 0.5, 5.6)], detail, tiers, midBoxes: 3, farBoxes: 2 };
}

function birch(a: Author): VegetationPlan {
  const [T, mark, g, gB] = [H('birch_bark'), H('birch_mark'), H('birch_leaf'), H('birch_leaf_b')];
  if (a.stage === 'sapling') return sapling(a, T, g, gB, false);
  const detail: Block[] = [];
  detail.push(a.b(mark, 0.55, 0.14, 0.55, 0, 1.4, 0, 0));
  if (a.full) detail.push(a.b(mark, 0.55, 0.12, 0.55, 0, 2.7, 0, 0), a.b(T, 1.0, 0.25, 0.25, 0.55, 3.4, 0, 0.1));
  const t0 = [a.b(g, 2.6, 1.4, 2.3, 0, 4.3, 0, 0.2)];
  if (a.full) t0.push(a.b(gB, 1.2, 1.2, 1.2, 1.5, 4.2, 0.4));
  const t1 = [a.b(gB, 2.2, 1.4, 2.0, 0.1, 5.7, -0.1, 0.2), a.b(g, 1.1, 1.1, 1.1, -1.25, 5.6, -0.35)];
  const t2 = [a.b(g, 1.4, 1.0, 1.3, -0.1, 6.9, 0.1, 0.15)];
  if (a.full) t2.push(a.b(gB, 0.7, 0.7, 0.7, 0.1, 7.7, 0, 0.1));
  return { trunk: [a.trunk(T, 0.45, 4.2)], detail, tiers: [t0, t1, t2], midBoxes: 3, farBoxes: 2 };
}

function beech(a: Author): VegetationPlan {
  const [T, B, g, gB, gC] = [H('beech_bark'), H('bark_dark'), H('beech_leaf'), H('beech_leaf_b'), H('canopy_green_c')];
  if (a.stage === 'sapling') return sapling(a, T, g, gB, false);
  const t0 = [a.b(g, 3.9, 1.6, 3.7, 0, 3.6, 0), a.b(gB, 1.5, 1.4, 1.5, 2.2, 3.7, 0.2), a.b(gB, 1.5, 1.4, 1.5, -2.1, 3.5, -0.3)];
  if (a.full) t0.push(a.b(g, 1.4, 1.3, 1.4, 0.3, 3.4, 2.1), a.b(gB, 1.4, 1.3, 1.4, -0.2, 3.8, -2.1));
  const t1 = [a.b(gB, 3.0, 1.4, 2.8, 0.1, 5.1, 0)];
  if (a.full) t1.push(a.b(gC, 1.2, 1.1, 1.2, -1.3, 5.2, 0.9));
  const t2 = [a.b(gC, 1.8, 0.8, 1.6, 0, 6.2, -0.1, 0.15)];
  return { trunk: [a.trunk(T, 0.65, 3.0)], detail: [...a.flare(B, 1.0)], tiers: [t0, t1, t2], midBoxes: 3, farBoxes: 2 };
}

function cherry(a: Author): VegetationPlan {
  const [T, B, p, pB, gC] = [H('trunk'), H('bark_dark'), H('canopy_pink'), H('canopy_pink_b'), H('canopy_green_c')];
  if (a.stage === 'sapling') return sapling(a, T, pB, p, false);
  const detail = [...a.flare(B, 1.0)];
  if (a.full) {
    detail.push(a.b(T, 0.35, 1.2, 0.35, 0.7, 3.0, 0, 0.05), a.b(T, 0.35, 1.1, 0.35, -0.6, 3.0, 0.2, 0.05));
    detail.push(a.b(gC, 0.9, 0.5, 0.9, 1.8, 3.25, -1.2, 0.2));
  }
  const t0 = [a.b(pB, 5.0, 1.2, 4.2, 0, 4.0, 0), a.b(p, 1.6, 1.3, 1.6, 2.6, 4.0, 0.8), a.b(p, 1.6, 1.2, 1.6, -2.5, 3.9, -0.9)];
  if (a.full) t0.push(a.b(pB, 1.5, 1.1, 1.5, 0.6, 3.8, 2.2));
  const t1 = [a.b(p, 3.4, 1.0, 3.0, 0.2, 5.1, -0.2)];
  if (a.full) t1.push(a.b(pB, 1.4, 0.9, 1.4, -1.4, 5.0, 0.9));
  const t2 = [a.b(p, 1.6, 0.7, 1.6, -0.1, 5.9, 0.1, 0.15)];
  return { trunk: [a.trunk(T, 0.6, 3.5)], detail, tiers: [t0, t1, t2], midBoxes: 3, farBoxes: 2 };
}

// ---------- bushes ----------
const BUSH_SIZE: Record<GrowthStage, number> = { sapling: 0.55, young: 0.78, mature: 1, old: 1.2 };

function bush(species: BushSpecies, a: Author): VegetationPlan {
  if (species === 'leafy_bush') {
    const [gA, gB, gC] = [H('canopy_green_a'), H('canopy_green_b'), H('canopy_green_c')];
    const base = [a.b(gA, 1.5, 0.9, 1.3, 0, 0.45, 0, 0.1), a.b(gB, 0.7, 0.6, 0.7, 0.6, 0.45, 0.55, 0.1)];
    const top = [a.b(gB, 0.9, 0.7, 0.9, 0.35, 1.1, -0.15, 0.1)];
    if (a.full) top.push(a.b(gC, 0.7, 0.6, 0.7, -0.45, 1.0, 0.3, 0.1));
    return { trunk: [], detail: [], tiers: [base, top], midBoxes: 2, farBoxes: 1 };
  }
  if (species === 'berry_bush') {
    const [g, gB, red] = [H('bush_dark'), H('canopy_green_a'), H('berry_red')];
    const base = [a.b(g, 1.4, 1.0, 1.3, 0, 0.5, 0, 0.1)];
    const top = [a.b(gB, 1.0, 0.6, 0.9, -0.1, 1.25, 0.1, 0.1)];
    const berries = [
      a.b(red, 0.22, 0.22, 0.22, 0.72, 0.7, 0.2, 0.05), a.b(red, 0.22, 0.22, 0.22, -0.3, 0.55, 0.67, 0.05),
      a.b(red, 0.2, 0.2, 0.2, 0.2, 1.05, -0.67, 0.05),
    ];
    if (a.full) berries.push(a.b(red, 0.2, 0.2, 0.2, -0.72, 0.85, -0.2, 0.05), a.b(red, 0.2, 0.2, 0.2, 0.25, 1.58, 0.2, 0.05));
    return { trunk: [], detail: berries, tiers: [base, top], midBoxes: 2, farBoxes: 1 };
  }
  const [f, fB] = [H('fern_green'), H('fern_green_b')];
  const low = [a.b(fB, 1.9, 0.18, 0.42, 0, 0.3, 0, 0.05), a.b(f, 0.42, 0.18, 1.9, 0, 0.34, 0, 0.05)];
  const high = [a.b(f, 0.5, 0.55, 0.5, 0, 0.35, 0, 0.05), a.b(fB, 1.1, 0.16, 0.34, 0.55, 0.62, 0.45, 0.05)];
  if (a.full) high.push(a.b(f, 0.34, 0.16, 1.1, -0.5, 0.66, -0.5, 0.05));
  return { trunk: [], detail: [], tiers: [low, high], midBoxes: 2, farBoxes: 1 };
}

// ---------- plan lookup ----------
const SPECIES_SEED: Record<VegetationSpecies, number> = {
  pine: 11, spruce: 13, oak: 23, birch: 37, beech: 41, cherry: 53,
  leafy_bush: 97, berry_bush: 101, fern_clump: 103,
};
const STAGE_INDEX: Record<TreeStage, number> = { sapling: 0, young: 1, mature: 2, old: 3, dying: 4, snag: 5, stump: 6 };
const TREE_BUILDERS: Record<TreeSpecies, (a: Author) => VegetationPlan> = { oak, pine, spruce, birch, beech, cherry };
const CONIFERS = new Set<TreeSpecies>(['pine', 'spruce']);

export function isTreeSpecies(species: VegetationSpecies): species is TreeSpecies {
  return species in TREE_BUILDERS;
}

// ---------- M013: near-only character and the end of a tree's life ----------

/**
 * Near-LOD detail for mature and old trees (REF-006 images 1 and 3): root
 * spurs spreading from the flare, and, on broadleaves, smaller blocks set
 * into the crown so it reads lumpy rather than boxed. Detail blocks are drawn
 * only in the near band; mid and far are built from the trunk and tiers, so
 * they do not change.
 */
function addCharacter(species: TreeSpecies, a: Author, plan: VegetationPlan): VegetationPlan {
  if (!a.full) return plan;
  const rnd = mulberry32(SPECIES_SEED[species] * 31 + (a.old ? 7 : 3));
  const root = species === 'birch' ? H('birch_bark') : species === 'beech' ? H('beech_bark') : H('bark_dark');
  const tw = plan.trunk[0]?.w ?? 0.6;
  const detail = [...plan.detail];
  // Root spurs: low blocks reaching out from the trunk foot (four for oak, three otherwise).
  const spurs = species === 'oak' ? 4 : 3;
  for (let i = 0; i < spurs; i++) {
    const ang = (i / spurs) * Math.PI * 2 + rnd() * 0.6;
    const len = tw * (0.95 + rnd() * 0.5);
    const along = Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang));
    detail.push({ x: Q(Math.cos(ang) * (tw * 0.5 + len * 0.42)), y: Q(0.11 + rnd() * 0.05), z: Q(Math.sin(ang) * (tw * 0.5 + len * 0.42)),
      w: Q(along ? len : Math.max(0.15, tw * 0.32)), h: 0.22, d: Q(along ? Math.max(0.15, tw * 0.32) : len), hex: root, omit: FACE_NY, k: 0.92 });
  }
  if (CONIFERS.has(species)) return { ...plan, detail };
  // Lumps: small blocks set into the sides and tops of the bigger crown blocks.
  const big = plan.tiers.flat().filter((b) => b.w >= 1.6 || b.d >= 1.6).slice(0, 3);
  for (const b of big) {
    for (let k = 0; k < 1; k++) {
      const side = Math.floor(rnd() * 4);
      const sx = side === 0 ? 1 : side === 1 ? -1 : 0, sz = side === 2 ? 1 : side === 3 ? -1 : 0;
      const size = Q(Math.max(0.35, Math.min(b.w, b.d) * (0.3 + rnd() * 0.12)));
      const off = (rnd() - 0.5) * 0.5;
      detail.push({
        x: Q(b.x + sx * (b.w / 2 + size * 0.2) + (sz ? off * b.w : 0)), y: Q(b.y + (rnd() - 0.3) * b.h * 0.5),
        z: Q(b.z + sz * (b.d / 2 + size * 0.2) + (sx ? off * b.d : 0)), w: size, h: Q(size * 0.85), d: size, hex: b.hex, k: (b.k ?? 1) * (0.94 + rnd() * 0.1),
      });
    }
    // One lump on top of the largest blocks breaks the flat crown line.
    if (b === big[0]) {
      const size = Q(Math.max(0.4, Math.min(b.w, b.d) * 0.32));
      detail.push({ x: Q(b.x + (rnd() - 0.5) * b.w * 0.4), y: Q(b.y + b.h / 2 + size * 0.3), z: Q(b.z + (rnd() - 0.5) * b.d * 0.4), w: size, h: Q(size * 0.7), d: size, hex: b.hex, omit: FACE_NY, k: (b.k ?? 1) * 1.04 });
    }
  }
  // Birch: a wide crown with drooping tips (REF-006 image 2).
  if (species === 'birch') {
    for (const [x, z] of [[1.6, 0.2], [-1.5, -0.3], [0.2, 1.4]] as const) detail.push(a.b(H('birch_leaf_b'), 0.45, 0.7, 0.45, x, 3.55, z, 0.1));
  }
  return { ...plan, detail };
}

/** Dying: the old tree's shape with a thinning, yellowing-brown crown (every third crown block gone). */
function dyingPlan(species: TreeSpecies, base: VegetationPlan): VegetationPlan {
  const conifer = CONIFERS.has(species);
  const [dA, dB] = conifer ? [H('conifer_dying'), H('leaf_dying_a')] : [H('leaf_dying_a'), H('leaf_dying_b')];
  let n = 0;
  const tiers = base.tiers.map((tier) => tier.filter((_b, i) => i === 0 || (n++ % 3) !== 2)
    .map((b, i) => ({ ...b, hex: (i + n) % 2 ? dA : dB, k: (b.k ?? 1) * 0.92, w: Q(b.w * 0.9), d: Q(b.d * 0.9) })));
  const detail = base.detail.filter((b) => b.y < 1 || (b.h < 0.4 && b.y < 4)).map((b) => b.y < 1 ? b : { ...b, hex: H('snag_bark') });
  return { ...base, tiers, detail };
}

/**
 * A standing dead tree (REF-006 image 1): a bare, reddish-brown trunk with
 * broken limbs; conifers keep short stubs up a tall pole. The limbs form the
 * "tiers" so the mid and far LODs keep the silhouette.
 */
function snagPlan(species: TreeSpecies, a: Author): VegetationPlan {
  const [S, SB] = [H('snag_bark'), H('snag_bark_b')];
  const conifer = CONIFERS.has(species);
  const top = conifer ? 6.2 : 4.4;
  const trunk = [a.trunk(S, conifer ? 0.55 : 0.75, top)];
  const tiers: Block[][] = conifer
    ? [[a.b(SB, 1.6, 0.22, 0.22, 0.5, 2.2, 0, 0.1)], [a.b(S, 0.22, 0.22, 1.3, 0, 3.4, -0.4, 0.1)], [a.b(SB, 1.0, 0.2, 0.2, -0.3, 4.6, 0, 0.1)], [a.b(S, 0.3, 0.6, 0.3, 0.05, top + 0.25, 0, 0.05)]]
    : [[a.b(SB, 1.9, 0.3, 0.3, 0.9, 3.4, 0, 0.1), a.b(S, 0.3, 1.2, 0.3, 1.75, 4.1, 0, 0.05)],
      [a.b(S, 0.3, 0.3, 1.6, -0.1, 3.9, -0.75, 0.1), a.b(SB, 0.28, 1.0, 0.28, -0.1, 4.6, -1.45, 0.05)],
      [a.b(SB, 0.4, 0.8, 0.4, 0, top + 0.35, 0.05, 0.05)]];
  const detail = [...a.flare(SB, conifer ? 0.85 : 1.1), a.b(SB, 0.5, 0.18, 0.12, 0, 1.3, 0.34, 0.05)];
  return { trunk, detail, tiers, midBoxes: conifer ? 2 : 3, farBoxes: 2 };
}

/** A felled stump: a short trunk with a pale cut face and a few roots (the last stage in REF-006 image 1's row). */
function stumpPlan(species: TreeSpecies): VegetationPlan {
  const bark = species === 'birch' ? H('birch_bark') : species === 'beech' ? H('beech_bark') : CONIFERS.has(species) ? H('bark_dark') : H('trunk');
  const w = species === 'oak' ? 0.95 : species === 'birch' || CONIFERS.has(species) ? 0.62 : 0.78;
  const trunk: Block[] = [{ x: 0, y: 0.25, z: 0, w, h: 0.5, d: w, hex: bark, omit: CAPS }];
  const tiers: Block[][] = [[{ x: 0, y: 0.53, z: 0, w: Q(w * 0.92), h: 0.06, d: Q(w * 0.92), hex: H('stump_cut'), omit: FACE_NY }]];
  const detail: Block[] = [
    { x: Q(w * 0.62), y: 0.1, z: 0, w: Q(w * 0.5), h: 0.2, d: Q(w * 0.3), hex: bark, omit: FACE_NY, k: 0.9 },
    { x: Q(-w * 0.55), y: 0.08, z: Q(w * 0.1), w: Q(w * 0.4), h: 0.16, d: Q(w * 0.3), hex: bark, omit: FACE_NY, k: 0.9 },
    { x: 0, y: 0.09, z: Q(-w * 0.6), w: Q(w * 0.3), h: 0.18, d: Q(w * 0.45), hex: bark, omit: FACE_NY, k: 0.9 },
  ];
  return { trunk, detail, tiers, midBoxes: 1, farBoxes: 1 };
}

const planCache = new Map<string, VegetationPlan>();

/** The authored plan of one species, stage and variant (0..2). Cached. Trees also have the M013 stages dying, snag and stump. */
export function vegetationPlan(species: VegetationSpecies, stage: GrowthStage | TreeStage, variant: number): VegetationPlan {
  const key = `${species}:${stage}:${variant}`;
  const cached = planCache.get(key);
  if (cached) return cached;
  const seed = SPECIES_SEED[species] * 7919 + STAGE_INDEX[stage] * 613 + variant * 104729;
  let plan: VegetationPlan;
  if (isTreeSpecies(species)) {
    if (stage === 'stump') plan = stumpPlan(species);
    else if (stage === 'snag') plan = snagPlan(species, new Author(stage, seed));
    else if (stage === 'dying') {
      // The same tree as its old stage (same seed), thinned and browning.
      const old = new Author('old', SPECIES_SEED[species] * 7919 + STAGE_INDEX.old * 613 + variant * 104729);
      plan = dyingPlan(species, TREE_BUILDERS[species](old));
    } else {
      const a = new Author(stage, seed);
      plan = addCharacter(species, a, TREE_BUILDERS[species](a));
    }
  } else {
    const s = stage as GrowthStage;
    plan = bush(species, new Author(s, seed, BUSH_SIZE[s] ?? 1));
  }
  planCache.set(key, plan);
  return plan;
}

// ---------- stone props (ore, cairn) in the same language ----------
export function orePlan(variant: number): VegetationPlan {
  const flip = variant === 1 ? -1 : 1;
  const [S, SB, O, OB] = [H('stone_top'), H('stone_body_b'), H('ore_crystal'), H('ore_crystal_b')];
  return {
    trunk: [],
    detail: [{ x: 0.1, y: 0.45, z: 0.865 * flip, w: 0.5, h: 0.14, d: 0.07, hex: OB }],
    tiers: [
      [{ x: 0, y: 0.45, z: 0, w: 1.8, h: 0.9, d: 1.5, hex: S, omit: FACE_NY },
        { x: 0.15, y: 1.1, z: -0.1, w: 1.2, h: 0.7, d: 1.0, hex: S, omit: FACE_NY },
        { x: -0.4, y: 1.4, z: 0.25, w: 0.7, h: 0.5, d: 0.6, hex: SB }],
      [{ x: 0.1, y: 0.45, z: 0.75 * flip, w: 0.9, h: 0.35, d: 0.2, hex: O }],
    ],
    midBoxes: 2, farBoxes: 1,
  };
}

export function cairnPlan(): VegetationPlan {
  const [S, SB, SS] = [H('stone_top'), H('stone_body_b'), H('stone_shade')];
  return {
    trunk: [],
    detail: [],
    tiers: [
      [{ x: 0, y: 0.25, z: 0, w: 1.5, h: 0.5, d: 1.3, hex: S, omit: FACE_NY },
        { x: 0.1, y: 0.725, z: 0, w: 1.15, h: 0.45, d: 1.0, hex: SB, omit: FACE_NY }],
      [{ x: -0.1, y: 1.15, z: 0.05, w: 0.85, h: 0.4, d: 0.75, hex: S, omit: FACE_NY }],
      [{ x: 0.1, y: 1.525, z: 0.05, w: 0.5, h: 0.35, d: 0.5, hex: SB, omit: FACE_NY },
        { x: 0.1, y: 1.85, z: 0.05, w: 0.3, h: 0.3, d: 0.3, hex: SS, omit: FACE_NY }],
    ],
    midBoxes: 2, farBoxes: 1,
  };
}
