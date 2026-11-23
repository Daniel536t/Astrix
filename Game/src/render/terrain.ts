// Render layer — chunked 3D voxel mesher + streaming + macro LOD.
//
// The visible surface is derived from the sim's occupancy/material volume.
// Near chunks are meshed at 1 m with greedy face merging; the far landscape is
// an 8 m (world) / 8 m (map) macro LOD sampled from the same deterministic
// generator. Water is a single sea-level surface derived from the seabed depth.
//
// No apron, horizon ring or foundation skirt: the world edge is ocean, and the
// ocean surface extends far beyond the 2048 m playable island.
import * as THREE from 'three';
import palette from '../data/palette.json';
import {
  World, VoxelChunk, MatId, SurfaceSample, GENERATOR_VERSION,
  WORLD_SIZE, HALF, CHUNK_SIZE, CHUNKS_PER_SIDE, CHUNK_AREA, WORLD_HEIGHT,
  Y_MIN, Y_MAX, SEA_LEVEL, MAT, isOpaque,
  chunkKey, chunkOriginX, chunkOriginZ, localIndex, yToIndex,
  worldToChunkX, worldToChunkZ, worldToLocalX, worldToLocalZ,
  getVoxel, ensureChunk, evictChunk, surfaceHeightAt, baseTopMaterial, hash2i, fbm2,
} from '../sim/world';

const M = palette.materials as Record<string, { hex: string }>;
const H = (k: string) => M[k].hex;

const colorCache = new Map<string, THREE.Color>();
function c(hex: string): THREE.Color {
  let out = colorCache.get(hex);
  if (!out) { out = new THREE.Color(hex); colorCache.set(hex, out); }
  return out;
}

const COL = {
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
  waterRim: c(H('water_rim')),
  waterShallow: c(H('water_shallow')),
  waterMid: c(H('water_mid')),
  waterDeep: c(H('water_deep')),
};

const SHADE = [0.90, 0.96, 1.0, 1.04];

// Keep a small rolling window of build timings for the performance evidence.
// These are instrumentation, not simulation state.
const MAX_PERF_SAMPLES = 128;
function recordSample(samples: number[], ms: number): void {
  samples.push(ms);
  if (samples.length > MAX_PERF_SAMPLES) samples.shift();
}
function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return Math.round(sorted[i] * 100) / 100;
}

function heightBand(y: number): number {
  return y >= 45 ? 2 : y >= 18 ? 1 : 0;
}
function stoneTone(y: number): number {
  return ((y + 64) >> 3) & 1;
}
function shadeAt(x: number, y: number, z: number, seed: number): number {
  const sx = Math.floor(x / 2) + Math.floor(y / 3) * 17;
  const sz = Math.floor(z / 2);
  return Math.floor(hash2i(sx, sz, seed + 300) * 4);
}

function keyFor(mat: number, variant: number, shade: number, axis: number, dir: number): number {
  return (mat & 15) | ((variant & 15) << 4) | ((shade & 3) << 8) | ((axis & 3) << 10) | ((dir > 0 ? 1 : 0) << 12);
}

const faceColorCache = new Map<number, THREE.Color>();

function colorForKey(key: number): THREE.Color {
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

const terrainMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true,
  side: THREE.FrontSide,
});
terrainMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aMat;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\nvarying float vMat;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);\nvMat = aMat;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
varying vec3 vWPos;
varying vec3 vWNrm;
varying float vMat;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vn2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
             mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 n = normalize(vWNrm);
  float vert = 1.0 - smoothstep(0.35, 0.70, abs(n.y));
  float isGrass = ((vMat > 0.5 && vMat < 1.5) || (vMat > 8.5 && vMat < 9.5)) ? 1.0 : 0.0;
  float isStone = ((vMat > 4.5 && vMat < 6.5) || (vMat > 7.5 && vMat < 8.5)) ? 1.0 : 0.0;

  float horiz = abs(n.x) > abs(n.z) ? vWPos.z : vWPos.x;
  float row = floor(vWPos.y);
  float col = floor(horiz);
  float h = h21(vec2(col, row));
  vec2 f = vec2(fract(horiz), fract(vWPos.y));
  float joint = smoothstep(0.0, 0.055, min(f.x, 1.0 - f.x))
              * smoothstep(0.0, 0.050, min(f.y, 1.0 - f.y));
  vec3 stone = mix(vec3(0.62, 0.62, 0.58), vec3(1.04, 1.02, 0.95), h);
  stone *= mix(0.90, 1.0, joint);
  stone *= mix(0.93, 1.0, smoothstep(0.0, 0.30, f.y));
  diffuseColor.rgb *= mix(vec3(1.0), stone, vert * isStone);

  float gy = smoothstep(0.45, 0.88, abs(n.y));
  float g1 = vn2(vWPos.xz * 1.35);
  float g2 = vn2(vWPos.xz * 0.11);
  vec3 grass = mix(vec3(0.82, 0.86, 0.72), vec3(1.06, 1.04, 0.98), g1 * 0.42 + g2 * 0.46 + vn2(vWPos.xz * 4.3) * 0.12);
  float cell = h21(floor(vWPos.xz) + 17.0);
  grass *= 0.95 + 0.10 * cell;
  diffuseColor.rgb *= mix(vec3(1.0), grass, gy * isGrass);
}`);
};

interface MeshResult { geometry: THREE.BufferGeometry; triangles: number; }

function posFrom(axis: number, slice: number, i: number, j: number): [number, number, number] {
  if (axis === 0) return [slice, i, j];
  if (axis === 1) return [j, slice, i];
  return [i, j, slice];
}

/**
 * Greedy 3D face mesher. A face is emitted when an opaque voxel touches a
 * non-opaque cell (air or water). Water itself is rendered by the sea-level
 * surface, not as a voxel mesh.
 */
export function meshChunk(world: World, chunk: VoxelChunk): MeshResult {
  const ox = chunkOriginX(chunk.cx), oz = chunkOriginZ(chunk.cz);
  const data = chunk.data;
  const sample = (x: number, y: number, z: number): number => {
    if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && y >= 0 && y < WORLD_HEIGHT) {
      return data[localIndex(x, y, z)];
    }
    return getVoxel(world, ox + x, Y_MIN + y, oz + z);
  };

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const mats: number[] = [];
  const indices: number[] = [];
  const dims = [CHUNK_SIZE, WORLD_HEIGHT, CHUNK_SIZE];

  const emitQuad = (
    axis: number, dir: number, slice: number,
    i0: number, j0: number, w: number, h: number, key: number,
  ) => {
    // The face lies on the boundary between slice and slice+1 for both
    // directions. Using `slice` for negative faces shifted every -x/-y/-z
    // face one voxel into the air cell, leaving 1 m slits in the terrain.
    const plane = slice + 1;
    const u0 = i0, u1 = i0 + w, v0 = j0, v1 = j0 + h;
    let p: number[][];
    if (axis === 0) {
      const x = ox + plane, y0 = Y_MIN + u0, y1 = Y_MIN + u1, z0 = oz + v0, z1 = oz + v1;
      p = dir > 0
        ? [[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]]
        : [[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]];
    } else if (axis === 1) {
      const y = Y_MIN + plane, z0 = oz + u0, z1 = oz + u1, x0 = ox + v0, x1 = ox + v1;
      p = dir > 0
        ? [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]]
        : [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
    } else {
      const z = oz + plane, x0 = ox + u0, x1 = ox + u1, y0 = Y_MIN + v0, y1 = Y_MIN + v1;
      p = dir > 0
        ? [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]
        : [[x0, y0, z], [x0, y1, z], [x1, y1, z], [x1, y0, z]];
    }

    const color = colorForKey(key);
    const mat = key & 15;
    const nx = axis === 0 ? dir : 0;
    const ny = axis === 1 ? dir : 0;
    const nz = axis === 2 ? dir : 0;
    const base = positions.length / 3;
    for (const v of p) {
      positions.push(v[0], v[1], v[2]);
      normals.push(nx, ny, nz);
      colors.push(color.r, color.g, color.b);
      mats.push(mat);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    const du = dims[u], dv = dims[v], dd = dims[axis];
    const mask = new Uint16Array(du * dv);

    for (let slice = -1; slice < dd; slice++) {
      mask.fill(0);
      let any = false;

      for (let j = 0; j < dv; j++) {
        for (let i = 0; i < du; i++) {
          const [ax, ay, az] = posFrom(axis, slice, i, j);
          const [bx, by, bz] = posFrom(axis, slice + 1, i, j);
          const a = sample(ax, ay, az);
          const b = sample(bx, by, bz);
          const ao = isOpaque(a), bo = isOpaque(b);
          if (ao === bo) continue;

          // Only the chunk that owns the solid voxel emits its face. At the
          // slice -1/dd boundary the neighbour chunk owns the outward face.
          const aInside = slice >= 0 && slice < dd;
          const bInside = slice + 1 >= 0 && slice + 1 < dd;
          let x: number, y: number, z: number, mat: number, dir: number;
          if (ao && !bo && aInside) { x = ax; y = ay; z = az; mat = a; dir = 1; }
          else if (bo && !ao && bInside) { x = bx; y = by; z = bz; mat = b; dir = -1; }
          else continue;

          const wy = Y_MIN + y;
          const surfaceY = chunk.heights[z * CHUNK_SIZE + x] + Y_MIN;
          const depth = surfaceY - (wy + 1);
          let variant: number;
          if (axis === 1 && dir > 0) variant = heightBand(wy);
          else if (axis === 1 && dir < 0) variant = 15;
          else variant = (Math.max(0, Math.min(7, depth)) & 7) | (stoneTone(wy) << 3);

          const shade = shadeAt(ox + x, wy, oz + z, world.seed);
          mask[j * du + i] = keyFor(mat, variant, shade, axis, dir);
          any = true;
        }
      }

      if (!any) continue;

      for (let j = 0; j < dv; j++) {
        for (let i = 0; i < du;) {
          const key = mask[j * du + i];
          if (!key) { i++; continue; }

          let w = 1;
          while (i + w < du && mask[j * du + i + w] === key) w++;

          let h = 1;
          outer: while (j + h < dv) {
            for (let k = 0; k < w; k++) {
              if (mask[(j + h) * du + i + k] !== key) break outer;
            }
            h++;
          }

          for (let jj = 0; jj < h; jj++) {
            for (let ii = 0; ii < w; ii++) mask[(j + jj) * du + i + ii] = 0;
          }

          const dir = (key >> 12) & 1 ? 1 : -1;
          emitQuad(axis, dir, slice, i, j, w, h, key);
          i += w;
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aMat', new THREE.Float32BufferAttribute(mats, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return { geometry, triangles: indices.length / 3 };
}

/** One opaque sea-level surface for the whole view. */
export function buildWaterSurface(world: World, size = 20000, segments = 96): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  const smoothstep = (a: number, b: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    // The water plane samples the seabed only for a narrow shore rim. A depth
    // ramp on a 47 m grid missed the 10 m river entirely and turned it white;
    // the river and lake read better as the same deep water as the sea.
    const h = surfaceHeightAt(world.seed, Math.round(x), Math.round(z));
    const shore = smoothstep(-0.9, -0.15, h) * (1 - smoothstep(-0.15, 0.4, h));
    const n = hash2i(Math.floor(x / 45), Math.floor(z / 45), world.seed + 501);
    tmp.copy(COL.waterMid).lerp(COL.waterDeep, 0.35 + 0.35 * n);
    // A weak shore tint. A strong one, sampled on a coarse plane, produced
    // pale rectangles over offshore seamounts in the map view.
    tmp.lerp(COL.waterRim, shore * 0.15);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // Opaque: the sea-level surface is the water read. A translucent plane let
  // the macro seabed show through, which made the finite 2048 m world edge
  // visible as a square in the first M001 map capture.
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    vertexColors: true,
  }));
  mesh.position.y = -0.06;
  mesh.renderOrder = 1;
  mesh.name = 'water_surface';
  mesh.receiveShadow = false;
  return mesh;
}

interface MacroHole { minX: number; maxX: number; minZ: number; maxZ: number; }
interface MacroOptions {
  step: number;
  /** Rectangular hole covered by the near 1 m chunk ring. */
  hole?: MacroHole;
}

interface MacroResult {
  mesh: THREE.Mesh;
  triangles: number;
  sampleMs: number;
  totalMs: number;
  sampleCached: boolean;
}

interface MacroSampleCache {
  N: number;
  heights: Int16Array;
  tops: Uint8Array;
  underwater: Uint8Array;
  sampleMs: number;
}

export interface MacroTerrainSample { x: number; z: number; height: number; top: MatId; underwater: boolean; }

// Cache the deterministic base grid and the authoritative edited grid separately.
// Base entries never need invalidation. Edited entries are scoped by World identity
// (two same-seed worlds can have different edits) and by both the coarse edit
// revision and chunk streaming, since evicting/regenerating data and snapshot
// restoration do not necessarily produce a new coarse revision. Only chunks with
// durable voxel deltas are materialized; the other 64x64 cells remain base samples.
interface MacroWorldCaches {
  base: Map<number, MacroSampleCache>;
  edited: Map<string, MacroSampleCache>;
  /** Sparse authoritative columns, independent of the mesh sampling resolution. */
  columns: Map<string, Map<number, { height: number; top: MatId }>>;
  revision: number;
}
const macroSampleCache = new WeakMap<World, MacroWorldCaches>();

function syncMacroColumns(world: World, caches: MacroWorldCaches): void {
  if (world.revision === caches.revision) return;
  // Snapshot restore replaces edits and chunks before assigning its saved
  // revision. Never mix remembered columns from that previous world state.
  caches.columns.clear();
  // A normal edit has already updated the loaded chunk, so it costs only the
  // edited chunks. Restored/evicted edited chunks are generated on demand.
  for (const [key, edits] of world.edits) {
    if (!edits.size || !world.chunks.has(key)) continue;
    const chunk = world.chunks.get(key)!;
    const ox = chunkOriginX(chunk.cx), oz = chunkOriginZ(chunk.cz);
    const columns = new Map<number, { height: number; top: MatId }>();
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const col = lz * CHUNK_SIZE + lx;
        columns.set((ox + lx + HALF) * WORLD_SIZE + oz + lz + HALF, {
          height: chunk.heights[col] + Y_MIN + 1,
          top: chunk.topMaterials[col] as MatId,
        });
      }
    }
    caches.columns.set(key, columns);
  }
  caches.edited.clear();
  caches.revision = world.revision;
}

function macroColumn(world: World, caches: MacroWorldCaches, key: string, index: number) {
  let columns = caches.columns.get(key);
  if (columns) return columns.get(index);
  const [cx, cz] = key.split(',').map(Number);
  if (!ensureChunk(world, cx, cz)) return undefined;
  // Capture once after loading. Loaded chunks are cheap and do not require
  // walking every voxel; this remains O(32x32) per edited chunk.
  const chunk = world.chunks.get(key)!;
  columns = new Map();
  const ox = chunkOriginX(cx), oz = chunkOriginZ(cz);
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const col = lz * CHUNK_SIZE + lx;
      columns.set((ox + lx + HALF) * WORLD_SIZE + oz + lz + HALF, {
        height: chunk.heights[col] + Y_MIN + 1,
        top: chunk.topMaterials[col] as MatId,
      });
    }
  }
  caches.columns.set(key, columns);
  return columns.get(index);
}

function macroEditKey(world: World): string {
  // Include a commutative content fingerprint as well as count: eviction and
  // snapshot restore bypass the coarse World.revision path, and a restored
  // delta can have the same number of cells with different indices/materials.
  return [...world.edits.entries()]
    .filter(([, edits]) => edits.size > 0)
    .map(([key, edits]) => {
      let sum = 0;
      let mixed = 0;
      for (const [index, material] of edits) {
        const value = Math.imul(index + 1, 31) + material;
        sum = (sum + value) | 0;
        mixed = (mixed ^ Math.imul(value, 0x45d9f3b)) | 0;
      }
      return `${key}:${edits.size}:${sum}:${mixed}`;
    })
    .sort()
    .join('|');
}

function editedMacroSamples(world: World, step: number, cache: MacroSampleCache): MacroSampleCache {
  const caches = macroSampleCache.get(world)!;
  const key = `${step}:${macroEditKey(world)}`;
  const cached = caches.edited.get(key);
  if (cached) return cached;

  for (const [chunk, edits] of world.edits) {
    if (edits.size && !caches.columns.has(chunk)) macroColumn(world, caches, chunk, 0);
  }

  const t0 = performance.now();
  const { N, heights, tops, underwater } = cache;
  const sample = {
    N,
    heights: new Int16Array(heights),
    tops: new Uint8Array(tops),
    underwater: new Uint8Array(underwater),
    sampleMs: cache.sampleMs,
  };
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = Math.round(-HALF + (i + 0.5) * step);
      const z = Math.round(-HALF + (j + 0.5) * step);
      const chunk = chunkKey(worldToChunkX(x), worldToChunkZ(z));
      if (!world.edits.get(chunk)?.size) continue;
      const idx = j * N + i;
      const edited = macroColumn(world, caches, chunk, (x + HALF) * WORLD_SIZE + z + HALF);
      if (!edited) continue;
      sample.heights[idx] = edited.height;
      sample.tops[idx] = edited.top;
      sample.underwater[idx] = sample.heights[idx] < SEA_LEVEL ? 1 : 0;
    }
  }
  sample.sampleMs = performance.now() - t0;
  caches.edited.set(key, sample);
  return sample;
}

function macroSamples(world: World, step: number): MacroSampleCache {
  let caches = macroSampleCache.get(world);
  if (!caches) {
    caches = { base: new Map(), edited: new Map(), columns: new Map(), revision: -1 };
    macroSampleCache.set(world, caches);
  }
  syncMacroColumns(world, caches);
  const cached = caches.base.get(step);
  if (cached) return editedMacroSamples(world, step, cached);

  const t0 = performance.now();
  const N = Math.ceil(WORLD_SIZE / step);
  const heights = new Int16Array(N * N);
  const tops = new Uint8Array(N * N);
  const underwater = new Uint8Array(N * N);
  const cellX = (i: number) => -HALF + (i + 0.5) * step;
  const cellZ = (j: number) => -HALF + (j + 0.5) * step;

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = cellX(i), z = cellZ(j);
      const h = surfaceHeightAt(world.seed, Math.round(x), Math.round(z));
      const idx = j * N + i;
      heights[idx] = h;
      if (h < SEA_LEVEL) underwater[idx] = 1;
    }
  }

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const idx = j * N + i;
      if (underwater[idx]) continue;
      const h = heights[idx];
      const x = cellX(i), z = cellZ(j);
      let slope = 0;
      let nearWater = false;
      const ns = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dx, dz] of ns) {
        const nx = Math.max(0, Math.min(N - 1, i + dx));
        const nz = Math.max(0, Math.min(N - 1, j + dz));
        const nh = heights[nz * N + nx];
        slope = Math.max(slope, Math.abs(h - nh));
        if (nh < SEA_LEVEL + 1) nearWater = true;
      }
      tops[idx] = baseTopMaterial(world.seed, Math.round(x), Math.round(z), h, slope, nearWater);
    }
  }

  const cache: MacroSampleCache = {
    N, heights, tops, underwater,
    sampleMs: performance.now() - t0,
  };
  caches.base.set(step, cache);
  return editedMacroSamples(world, step, cache);
}

/** Authoritative macro-grid value at a world column (step defaults to 8 m). */
export function sampleMacroTerrain(world: World, x: number, z: number, step = 8): MacroTerrainSample {
  const cache = macroSamples(world, step);
  const i = Math.max(0, Math.min(cache.N - 1, Math.floor((x + HALF) / step)));
  const j = Math.max(0, Math.min(cache.N - 1, Math.floor((z + HALF) / step)));
  const idx = j * cache.N + i;
  return {
    x: -HALF + (i + 0.5) * step,
    z: -HALF + (j + 0.5) * step,
    height: cache.heights[idx], top: cache.tops[idx] as MatId,
    underwater: cache.underwater[idx] !== 0,
  };
}

/**
 * Far landscape LOD derived from the same deterministic surface sampler.
 * Cells below sea level are omitted: the opaque water surface is the only
 * water read, so the finite 2048 m world cannot appear as a square seabed.
 */
export function buildMacroMesh(world: World, opts: MacroOptions): MacroResult {
  const totalT0 = performance.now();
  const { step, hole } = opts;
  const cacheKey = `${step}:${macroEditKey(world)}`;
  const sampleCached = macroSampleCache.get(world)?.edited.has(cacheKey) ?? false;
  const cache = macroSamples(world, step);
  const { N, heights, tops, underwater } = cache;
  const holeCell = new Uint8Array(N * N);
  const cellX = (i: number) => -HALF + (i + 0.5) * step;
  const cellZ = (j: number) => -HALF + (j + 0.5) * step;

  if (hole) {
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = cellX(i), z = cellZ(j);
        if (x > hole.minX && x < hole.maxX && z > hole.minZ && z < hole.maxZ) {
          holeCell[j * N + i] = 1;
        }
      }
    }
  }

  const sampleMs = sampleCached ? 0 : cache.sampleMs;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const pushQuad = (p: number[][], n: [number, number, number], color: THREE.Color) => {
    const base = positions.length / 3;
    for (const v of p) {
      positions.push(v[0], v[1], v[2]);
      normals.push(n[0], n[1], n[2]);
      colors.push(color.r, color.g, color.b);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  const cellShade = (i: number, j: number) => 0.94 + 0.12 * hash2i(i, j, world.seed + 401);

  const topColor = (top: MatId, h: number, i: number, j: number): THREE.Color => {
    const shade = cellShade(i, j);
    const moist = fbm2(cellX(i) / 130, cellZ(j) / 130, world.seed + 601, 3);
    if (top === MAT.SAND) return COL.sand.clone().multiplyScalar(shade * 0.90);
    if (top === MAT.GRAVEL) return COL.gravel.clone().multiplyScalar(shade);
    if (top === MAT.STONE) {
      return COL.stoneShade.clone().lerp(COL.stoneB, 0.35 + 0.25 * shade).multiplyScalar(
        (0.82 + 0.14 * Math.min(1, Math.max(0, (h + 8) / 70))) * (0.92 + 0.08 * shade),
      );
    }
    if (top === MAT.ORE) return COL.ore.clone().multiplyScalar(shade);
    // Forest-floor patches break up the uniform green of the far LOD. They
    // are a colour approximation, not extra geometry; the near ring has real
    // Styl trees.
    return COL.grassTop[heightBand(h)].clone()
      .lerp(COL.grassCap, 0.12 + 0.34 * moist)
      .multiplyScalar(shade);
  };

  const sideColor = (top: MatId, h: number, nh: number, i: number, j: number): THREE.Color => {
    const drop = h - nh;
    const shade = 0.90 + 0.10 * hash2i(i, j, world.seed + 402);
    if (top === MAT.SAND) return COL.sand.clone().lerp(COL.stoneB, drop > 5 ? 0.55 : 0.2).multiplyScalar(shade * 0.92);
    if (top === MAT.STONE) {
      return COL.stoneShade.clone().multiplyScalar(
        (0.80 + 0.16 * Math.min(1, Math.max(0, (h + 8) / 70))) * shade,
      );
    }
    // A grass-topped bank is not a stone cliff, however tall the 8 m macro
    // cell makes it look. Keeping the side in the soil range removed the
    // bright white quarry walls around the river and lake in the wide view.
    if (drop > 4) return COL.grassCap.clone().lerp(COL.ochre, 0.55).multiplyScalar(shade);
    return COL.grassCap.clone().lerp(COL.stoneB, 0.22).multiplyScalar(shade);
  };

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const idx = j * N + i;
      if (holeCell[idx] || underwater[idx]) continue;
      const h = heights[idx];
      const top = tops[idx] as MatId;
      const x0 = -HALF + i * step, x1 = x0 + step;
      const z0 = -HALF + j * step, z1 = z0 + step;

      pushQuad(
        [[x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0]],
        [0, 1, 0],
        topColor(top, h, i, j),
      );

      const check = (di: number, dj: number) => {
        const ni = i + di, nj = j + dj;
        let nh: number;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) {
          // The world edge is ocean. Do not draw a side face down to the
          // water here; the opaque water plane already covers the boundary.
          return;
        } else {
          const nidx = nj * N + ni;
          if (holeCell[nidx]) return;
          nh = underwater[nidx] ? Math.max(SEA_LEVEL - 0.5, heights[nidx]) : heights[nidx];
        }
        if (h <= nh) return;
        const col = sideColor(top, h, nh, i, j);
        if (di === 1) {
          pushQuad([[x1, nh, z0], [x1, h, z0], [x1, h, z1], [x1, nh, z1]], [1, 0, 0], col);
        } else if (di === -1) {
          pushQuad([[x0, nh, z0], [x0, nh, z1], [x0, h, z1], [x0, h, z0]], [-1, 0, 0], col);
        } else if (dj === 1) {
          pushQuad([[x0, nh, z1], [x1, nh, z1], [x1, h, z1], [x0, h, z1]], [0, 0, 1], col);
        } else if (dj === -1) {
          pushQuad([[x0, nh, z0], [x0, h, z0], [x1, h, z0], [x1, nh, z0]], [0, 0, -1], col);
        }
      };
      check(1, 0); check(-1, 0); check(0, 1); check(0, -1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
    vertexColors: true, flatShading: true,
  }));
  mesh.name = 'macro_lod';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return {
    mesh,
    triangles: indices.length / 3,
    sampleMs,
    totalMs: performance.now() - totalT0,
    sampleCached,
  };
}

export type ViewMode = 'world' | 'map' | 'kit';

export interface VoxelTerrainViewOptions {
  nearRadius?: number;
  worldMacroStep?: number;
  mapMacroStep?: number;
}

interface ChunkView { mesh: THREE.Mesh; triangles: number; }

/**
 * Owns the near chunk meshes, macro LOD and water surface. It reads world
 * state and never mutates generation rules; eviction only frees derived data.
 */
export class VoxelTerrainView {
  readonly group = new THREE.Group();
  private nearGroup = new THREE.Group();
  private macroGroup = new THREE.Group();
  private water: THREE.Mesh;
  private world: World;
  private nearRadius: number;
  private worldMacroStep: number;
  private mapMacroStep: number;
  private chunks = new Map<string, ChunkView>();
  private loaded = new Set<string>();
  private mode: ViewMode = 'world';
  private macro: THREE.Mesh | null = null;
  private macroTriangles = 0;
  private macroFocus = new THREE.Vector3(1e9, 0, 1e9);
  private macroMode: ViewMode | null = null;
  private chunkGenSamples: number[] = [];
  private chunkMeshSamples: number[] = [];
  private macroSamples: number[] = [];
  private macroSampleSamples: number[] = [];
  private macroCacheHits = 0;
  private macroEditKey: string | null = null;
  onChunksChanged: (() => void) | null = null;

  constructor(world: World, scene: THREE.Scene, opts: VoxelTerrainViewOptions = {}) {
    this.world = world;
    this.nearRadius = Math.max(1, opts.nearRadius ?? 3);
    this.worldMacroStep = Math.max(4, opts.worldMacroStep ?? 8);
    this.mapMacroStep = Math.max(4, opts.mapMacroStep ?? 8);
    this.group.name = 'voxel_world';
    this.nearGroup.name = 'voxel_chunks';
    this.macroGroup.name = 'macro_lod';
    this.group.add(this.nearGroup, this.macroGroup);
    this.water = buildWaterSurface(world);
    this.group.add(this.water);
    scene.add(this.group);
  }

  preload(focus: THREE.Vector3): void {
    this.mode = 'world';
    this.ensureChunks(focus, true);
    this.rebuildMacro(focus, 'world', true);
  }

  update(focus: THREE.Vector3, mode: ViewMode = 'world'): void {
    if (mode !== this.mode) {
      this.mode = mode;
      this.nearGroup.visible = mode !== 'map';
      this.rebuildMacro(focus, mode, true);
    }

    if (mode === 'map') {
      if (macroEditKey(this.world) !== this.macroEditKey) this.rebuildMacro(focus, mode, true);
      return;
    }

    this.ensureChunks(focus, false);
    for (const key of this.loaded) {
      if (this.world.dirty.has(key)) this.rebuildChunk(key);
    }

    const moved = Math.hypot(focus.x - this.macroFocus.x, focus.z - this.macroFocus.z);
    if (this.macroMode !== mode || moved > 48 || macroEditKey(this.world) !== this.macroEditKey) {
      this.rebuildMacro(focus, mode, false);
    }
  }

  private ensureChunks(focus: THREE.Vector3, immediate: boolean): void {
    const ccx = worldToChunkX(Math.round(focus.x));
    const ccz = worldToChunkZ(Math.round(focus.z));
    let changed = false;
    let budget = immediate ? Number.MAX_SAFE_INTEGER : 2;

    for (let dz = -this.nearRadius; dz <= this.nearRadius; dz++) {
      for (let dx = -this.nearRadius; dx <= this.nearRadius; dx++) {
        const cx = ccx + dx, cz = ccz + dz;
        if (cx < 0 || cz < 0 || cx >= CHUNKS_PER_SIDE || cz >= CHUNKS_PER_SIDE) continue;
        const key = chunkKey(cx, cz);
        if (this.loaded.has(key)) continue;
        if (budget <= 0) continue;
        this.buildChunk(cx, cz);
        budget--;
        changed = true;
      }
    }

    const margin = this.nearRadius + 1;
    for (const key of [...this.loaded]) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - ccx) > margin || Math.abs(cz - ccz) > margin) {
        this.disposeChunk(key);
        changed = true;
      }
    }

    if (changed) this.onChunksChanged?.();
  }

  private buildChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const genBefore = this.world.stats.generationMs;
    const chunksBefore = this.world.stats.chunksGenerated;
    // Ensure the 3x3 neighbourhood exists so boundary faces use real data.
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) ensureChunk(this.world, cx + dx, cz + dz);
    }
    const chunk = ensureChunk(this.world, cx, cz);
    if (!chunk) return;
    const generated = this.world.stats.chunksGenerated - chunksBefore;
    if (generated > 0) {
      recordSample(this.chunkGenSamples, (this.world.stats.generationMs - genBefore) / generated);
    }

    const existing = this.chunks.get(key);
    if (existing) {
      this.nearGroup.remove(existing.mesh);
      existing.mesh.geometry.dispose();
    }

    const meshT0 = performance.now();
    const { geometry, triangles } = meshChunk(this.world, chunk);
    recordSample(this.chunkMeshSamples, performance.now() - meshT0);
    const mesh = new THREE.Mesh(geometry, terrainMaterial);
    mesh.name = `voxel_chunk_${cx}_${cz}`;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.nearGroup.add(mesh);
    this.chunks.set(key, { mesh, triangles });
    this.loaded.add(key);
    this.world.dirty.delete(key);
  }

  private disposeChunk(key: string): void {
    const view = this.chunks.get(key);
    if (view) {
      this.nearGroup.remove(view.mesh);
      view.mesh.geometry.dispose();
      this.chunks.delete(key);
    }
    this.loaded.delete(key);
    this.world.dirty.delete(key);
    evictChunk(this.world, key);
  }

  private rebuildChunk(key: string): void {
    const [cx, cz] = key.split(',').map(Number);
    this.buildChunk(cx, cz);
  }

  rebuildAround(x: number, z: number): void {
    const cx = worldToChunkX(x), cz = worldToChunkZ(z);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = chunkKey(cx + dx, cz + dz);
        if (this.loaded.has(key)) this.rebuildChunk(key);
      }
    }
    this.onChunksChanged?.();
    if (this.macro) this.rebuildMacro(this.macroFocus, this.mode, true);
  }

  private rebuildMacro(focus: THREE.Vector3, mode: ViewMode, force: boolean): void {
    if (!force && this.macroMode === mode) {
      const moved = Math.hypot(focus.x - this.macroFocus.x, focus.z - this.macroFocus.z);
      if (mode === 'map' || moved <= 48) return;
    }
    const macroT0 = performance.now();
    if (this.macro) {
      this.macroGroup.remove(this.macro);
      this.macro.geometry.dispose();
      this.macro = null;
    }
    const step = mode === 'map' ? this.mapMacroStep : this.worldMacroStep;
    let hole: MacroHole | undefined;
    if (mode !== 'map') {
      const ccx = worldToChunkX(Math.round(focus.x));
      const ccz = worldToChunkZ(Math.round(focus.z));
      hole = {
        minX: chunkOriginX(ccx - this.nearRadius),
        maxX: chunkOriginX(ccx + this.nearRadius) + CHUNK_SIZE,
        minZ: chunkOriginZ(ccz - this.nearRadius),
        maxZ: chunkOriginZ(ccz + this.nearRadius) + CHUNK_SIZE,
      };
    }
    const result = buildMacroMesh(this.world, { step, hole });
    this.macro = result.mesh;
    this.macroTriangles = result.triangles;
    this.macroGroup.add(result.mesh);
    this.macroFocus.copy(focus);
    this.macroMode = mode;
    this.macroEditKey = macroEditKey(this.world);
    recordSample(this.macroSamples, performance.now() - macroT0);
    if (result.sampleCached) this.macroCacheHits++;
    else recordSample(this.macroSampleSamples, result.sampleMs);
  }

  get loadedChunks(): number { return this.loaded.size; }
  get loadedChunkKeys(): ReadonlySet<string> { return this.loaded; }
  get nearTriangles(): number {
    let t = 0;
    for (const v of this.chunks.values()) t += v.triangles;
    return t;
  }
  get macroTriangleCount(): number { return this.macroTriangles; }
  get drawCalls(): number { return this.loaded.size + (this.macro ? 1 : 0) + 1; }
  get nearRadiusChunks(): number { return this.nearRadius; }
  /** Clear the rolling timing window before a measurement run. */
  resetPerf(): void {
    this.chunkGenSamples.length = 0;
    this.chunkMeshSamples.length = 0;
    this.macroSamples.length = 0;
    this.macroSampleSamples.length = 0;
    this.macroCacheHits = 0;
  }
  /** Rolling build timings in milliseconds, for the performance evidence. */
  get streamPerf(): Record<string, number> {
    return {
      chunkGenP50: percentile(this.chunkGenSamples, 0.5),
      chunkGenP95: percentile(this.chunkGenSamples, 0.95),
      chunkGenMax: percentile(this.chunkGenSamples, 1),
      chunkMeshP50: percentile(this.chunkMeshSamples, 0.5),
      chunkMeshP95: percentile(this.chunkMeshSamples, 0.95),
      chunkMeshMax: percentile(this.chunkMeshSamples, 1),
      macroP50: percentile(this.macroSamples, 0.5),
      macroMax: percentile(this.macroSamples, 1),
      macroSampleP50: percentile(this.macroSampleSamples, 0.5),
      macroSampleMax: percentile(this.macroSampleSamples, 1),
      macroCacheHits: this.macroCacheHits,
      chunkSamples: this.chunkGenSamples.length,
      macroSamples: this.macroSamples.length,
    };
  }
}
