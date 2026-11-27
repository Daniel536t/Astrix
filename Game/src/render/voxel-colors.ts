// Voxel face colours and keys shared by the main-thread terrain view and the
// chunk worker. Pure data + THREE.Color math (no WebGL objects).
import * as THREE from 'three';
import palette from '../data/palette.json';
import { MAT, hash2i } from '../sim/world';

export const M = palette.materials as Record<string, { hex: string }>;
export const H = (k: string) => M[k].hex;

export const colorCache = new Map<string, THREE.Color>();
export function c(hex: string): THREE.Color {
  let out = colorCache.get(hex);
  if (!out) { out = new THREE.Color(hex); colorCache.set(hex, out); }
  return out;
}

export const COL = {
  grassTop: [c(H('grass_top')), c(H('grass_high')), c(H('grass_peak'))],
  grassCap: c(H('grass_cap')),
  soil: c(H('strata_ochre')).clone().multiplyScalar(0.78),
  ochre: c(H('strata_ochre')),
  rust: c(H('strata_rust')),
  stoneTop: c(H('stone_top')),
  stoneA: c(H('stone_body_a')),
  stoneB: c(H('stone_body_b')),
  stoneShade: c(H('stone_shade')),
  sand: c(H('sand')),
  gravel: c(H('stone_body_b')).clone().lerp(c(H('sand')), 0.35),
  ore: c(H('ore_crystal')),
  moss: c(H('grass_cap')).clone().lerp(c(H('stone_body_b')), 0.35),
  snow: c(H('snow')),
  snowShade: c(H('snow')).clone().lerp(c(H('stone_shade')), 0.35),
  waterRim: c(H('water_rim')),
  waterShallow: c(H('water_shallow')),
  waterMid: c(H('water_mid')),
  waterDeep: c(H('water_deep')),
};

export const SHADE = [0.90, 0.96, 1.0, 1.04];

// Keep a small rolling window of build timings for the performance evidence.
// These are instrumentation, not simulation state.
export const MAX_PERF_SAMPLES = 128;
export function recordSample(samples: number[], ms: number): void {
  samples.push(ms);
  if (samples.length > MAX_PERF_SAMPLES) samples.shift();
}
export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return Math.round(sorted[i] * 100) / 100;
}

export function heightBand(y: number): number {
  return y >= 45 ? 2 : y >= 18 ? 1 : 0;
}
export function stoneTone(y: number): number {
  return ((y + 64) >> 3) & 1;
}
export function shadeAt(x: number, y: number, z: number, seed: number): number {
  const sx = Math.floor(x / 2) + Math.floor(y / 3) * 17;
  const sz = Math.floor(z / 2);
  return Math.floor(hash2i(sx, sz, seed + 300) * 4);
}

export function keyFor(mat: number, variant: number, shade: number, axis: number, dir: number): number {
  return (mat & 15) | ((variant & 15) << 4) | ((shade & 3) << 8) | ((axis & 3) << 10) | ((dir > 0 ? 1 : 0) << 12);
}

export const faceColorCache = new Map<number, THREE.Color>();

export function colorForKey(key: number): THREE.Color {
  const cached = faceColorCache.get(key);
  if (cached) return cached;
  const mat = key & 15;
  const variant = (key >> 4) & 15;
  const shade = (key >> 8) & 3;
  const axis = (key >> 10) & 3;
  const dir = (key >> 12) & 1;
  let color: THREE.Color;

  if (axis === 1 && dir === 1) {
    const hb = Math.min(2, variant & 3);
    if (mat === MAT.GRASS) color = COL.grassTop[hb];
    else if (mat === MAT.SAND) color = COL.sand;
    else if (mat === MAT.GRAVEL) color = COL.gravel;
    else if (mat === MAT.SOIL) color = COL.ochre;
    else if (mat === MAT.ORE) color = COL.ore;
    else if (mat === MAT.MOSS) color = COL.moss;
    else if (mat === MAT.SNOW) color = COL.snow;
    else color = COL.stoneTop;
  } else if (axis === 1 && dir === 0) {
    color = COL.stoneShade;
  } else {
    const depth = variant & 7;
    const tone = (variant >> 3) & 1;
    const body = tone ? COL.stoneB : COL.stoneA;
    if (mat === MAT.GRASS || mat === MAT.MOSS) {
      if (depth === 0) color = mat === MAT.MOSS ? COL.moss : COL.grassCap;
      else if (depth <= 2) color = COL.soil;
      else if (depth === 3) color = COL.rust;
      else color = body;
    } else if (mat === MAT.SOIL) {
      color = depth <= 1 ? COL.soil : body;
    } else if (mat === MAT.SAND) {
      color = depth <= 1 ? COL.sand : depth === 2 ? COL.ochre : body;
    } else if (mat === MAT.GRAVEL) {
      color = depth <= 1 ? COL.gravel : body;
    } else if (mat === MAT.ORE) {
      color = COL.ore;
    } else if (mat === MAT.SNOW) {
      color = depth === 0 ? COL.snowShade : body;
    } else if (mat === MAT.BEDROCK) {
      color = COL.stoneShade;
    } else {
      color = body;
    }
  }

  const out = color.clone().multiplyScalar(SHADE[shade]);
  faceColorCache.set(key, out);
  return out;
}
