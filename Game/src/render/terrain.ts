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
import { meshChunkWater, installFarWaterHole, waterTime } from './water';
import { MeshArrays, buildPadded, meshPadded } from './mesher';
import type { ChunkWorkerPool } from './chunk-pool';
import {
  World, VoxelChunk, MatId, SurfaceSample, GENERATOR_VERSION,
  WORLD_SIZE, HALF, CHUNK_SIZE, CHUNKS_PER_SIDE, CHUNK_AREA, WORLD_HEIGHT,
  Y_MIN, Y_MAX, SEA_LEVEL, MAT, isOpaque,
  chunkKey, chunkOriginX, chunkOriginZ, localIndex, yToIndex,
  worldToChunkX, worldToChunkZ, worldToLocalX, worldToLocalZ,
  getVoxel, ensureChunk, evictChunk, hash2i, fbm2,
  editVersion, baseHeightAt, baseTopMaterialFor, installBaseChunk, seedBaseColumns,
} from '../sim/world';

import {
  M, H, colorCache, c, COL, SHADE, MAX_PERF_SAMPLES, recordSample, percentile, heightBand, stoneTone, shadeAt, keyFor, faceColorCache, colorForKey,
} from './voxel-colors';

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

/** Build a BufferGeometry from mesher output (main thread). */
export function geometryFromArrays(a: MeshArrays): MeshResult {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(a.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(a.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(a.colors, 3));
  geometry.setAttribute('aMat', new THREE.BufferAttribute(a.mats, 1));
  geometry.setIndex(new THREE.BufferAttribute(a.indices, 1));
  geometry.computeBoundingSphere();
  return { geometry, triangles: a.triangles };
}

/** Padded volume for a resident chunk; neighbours come from the world (3x3 must be resident). */
export function paddedFor(world: World, chunk: VoxelChunk): Uint8Array {
  const ox = chunkOriginX(chunk.cx), oz = chunkOriginZ(chunk.cz);
  return buildPadded(chunk.data, (x, y, z) => getVoxel(world, ox + x, Y_MIN + y, oz + z));
}

/**
 * Greedy 3D face mesher (synchronous path). A face is emitted when an opaque
 * voxel touches a non-opaque cell (air or water); water surfaces are meshed
 * separately in water.ts.
 */
export function meshChunk(world: World, chunk: VoxelChunk): MeshResult {
  const ox = chunkOriginX(chunk.cx), oz = chunkOriginZ(chunk.cz);
  return geometryFromArrays(meshPadded(paddedFor(world, chunk), chunk.heights, ox, oz, world.seed));
}

/**
 * Grid lines of the sea plane: the original `segments` lattice over the
 * island plus two cells of margin (same vertices, so the same colours), then
 * lines that double their spacing out to the plane edge. Open ocean far
 * beyond the 2048 m island is flat, fogged and needs no 208 m vertex grid;
 * this keeps the near pattern and drops about 90% of the triangles.
 */
export function waterGridLines(size: number, segments: number): number[] {
  const seg = size / segments, coord = (k: number) => -size / 2 + k * seg;
  const inner: number[] = [];
  for (let k = 0; k <= segments; k++) if (Math.abs(coord(k)) <= HALF + 2 * seg) inner.push(k);
  if (inner.length === 0) return [0, segments].map(coord);
  const keep = new Set(inner);
  for (let k = inner[0], s = 1; k > 0; s *= 2) { k = Math.max(0, k - s); keep.add(k); }
  for (let k = inner[inner.length - 1], s = 1; k < segments; s *= 2) { k = Math.min(segments, k + s); keep.add(k); }
  return [...keep].sort((a, b) => a - b).map(coord);
}

function waterGridGeometry(size: number, segments: number): THREE.BufferGeometry {
  const lines = waterGridLines(size, segments), n = lines.length;
  const positions = new Float32Array(n * n * 3), normals = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = (j * n + i) * 3;
      positions[v] = lines[i]; positions[v + 2] = lines[j];
      normals[v + 1] = 1;
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = (j + 1) * n + i, c = a + 1, d = b + 1;
      indices.push(a, b, c, c, b, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/** One opaque sea-level surface for the whole view. */
export function buildWaterSurface(world: World, size = 20000, segments = 96): THREE.Mesh {
  const geo = waterGridGeometry(size, segments);
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
    const h = baseHeightAt(world.seed, world.params.generatorVersion, Math.round(x), Math.round(z));
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
/**
 * Distance tiers of the world-view macro mesh. Cells within `fine` metres
 * (Chebyshev distance of their block from the focus) keep the base step,
 * cells within `mid` metres merge 2x2, cells beyond merge 4x4. Blocks are
 * 4 base cells wide, so tier boundaries never split a coarse cell.
 */
export interface MacroTiers { fine: number; mid: number }
export const DEFAULT_MACRO_TIERS: MacroTiers = { fine: 448, mid: 896 };
/** Side (m) of a world-view macro tile; tiles outside the camera frustum are not drawn. */
export const MACRO_TILE = 256;

interface MacroOptions {
  step: number;
  /** Rectangular hole covered by the near 1 m chunk ring. */
  hole?: MacroHole;
  /** World view focus; with it, far cells use coarser tiers (map mode passes none). */
  focus?: { x: number; z: number };
  tiers?: MacroTiers;
}

interface MacroResult {
  /** The whole mesh when untiled (no focus); otherwise the first tile. */
  mesh: THREE.Mesh;
  /** Every tile mesh (one when untiled), each with a bounding box for culling. */
  meshes: THREE.Mesh[];
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

const macroEditKeyMemo = new WeakMap<World, { version: number; key: string }>();

/** Memoized by the world's edit version: O(1) per frame unless edits changed. */
function macroEditKey(world: World): string {
  const version = editVersion(world);
  const memo = macroEditKeyMemo.get(world);
  if (memo && memo.version === version) return memo.key;
  const key = computeMacroEditKey(world);
  macroEditKeyMemo.set(world, { version, key });
  return key;
}

function computeMacroEditKey(world: World): string {
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
      const h = baseHeightAt(world.seed, world.params.generatorVersion, Math.round(x), Math.round(z));
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
      tops[idx] = baseTopMaterialFor(world.seed, world.params.generatorVersion,
        Math.round(x), Math.round(z), h, slope, nearWater);
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
  // With a focus the mesh is split into MACRO_TILE square tiles so the view
  // can skip tiles outside the camera frustum (VoxelTerrainView.cullMacro).
  // Without one (map mode, tests) it stays a single mesh.
  const tileCells = opts.focus ? Math.max(1, Math.round(MACRO_TILE / step)) : N;
  const tilesPerSide = Math.ceil(N / tileCells);
  type TileBuffers = { positions: number[]; normals: number[]; colors: number[]; indices: number[] };
  const tileBuffers: TileBuffers[] = [];
  for (let t = 0; t < tilesPerSide * tilesPerSide; t++) tileBuffers.push({ positions: [], normals: [], colors: [], indices: [] });
  let buf = tileBuffers[0];

  const pushQuad = (p: number[][], n: [number, number, number], color: THREE.Color) => {
    const { positions, normals, colors, indices } = buf;
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
    if (top === MAT.SNOW) return COL.snow.clone().multiplyScalar(0.94 + 0.08 * shade);
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

  // Cell layout. Without a focus (map mode) every cell is one base cell. In
  // the world view, 4x4-cell blocks far from the focus merge into 2x2 or 4x4
  // cells: a far cell covers the same ground with one top and fewer sides.
  // Coarse cells take the highest land height (keeps ridges and peaks on the
  // skyline), the material of that highest sub-cell and the mean top colour
  // of their land sub-cells; a coarse cell that is mostly sea stays sea.
  const tiers = opts.focus ? (opts.tiers ?? DEFAULT_MACRO_TIERS) : null;
  const B = 4;
  const levelOf = (bi: number, bj: number): number => {
    if (!tiers || !opts.focus) return 1;
    const cx = -HALF + (bi + 0.5) * B * step, cz = -HALF + (bj + 0.5) * B * step;
    const d = Math.max(Math.abs(cx - opts.focus.x), Math.abs(cz - opts.focus.z)) - B * step / 2;
    return d <= tiers.fine ? 1 : d <= tiers.mid ? 2 : 4;
  };
  // Render height per base cell (of the cell that covers it) and whether
  // that cell is drawn as land.
  const renderH = new Float32Array(N * N);
  const renderLand = new Uint8Array(N * N);
  type Cell = { i: number; j: number; k: number; h: number; top: MatId; color: THREE.Color };
  const cells: Cell[] = [];
  const colorAcc = new THREE.Color();
  for (let bj = 0; bj < N; bj += B) {
    for (let bi = 0; bi < N; bi += B) {
      const k = levelOf(bi / B, bj / B);
      for (let j0 = bj; j0 < Math.min(N, bj + B); j0 += k) {
        for (let i0 = bi; i0 < Math.min(N, bi + B); i0 += k) {
          let land = 0, total = 0, best = -1;
          colorAcc.setRGB(0, 0, 0);
          for (let j = j0; j < Math.min(N, j0 + k); j++) {
            for (let i = i0; i < Math.min(N, i0 + k); i++) {
              const idx = j * N + i;
              total++;
              if (holeCell[idx] || underwater[idx]) continue;
              land++;
              if (best < 0 || heights[idx] > heights[best]) best = idx;
              if (k > 1) colorAcc.add(topColor(tops[idx] as MatId, heights[idx], i, j));
            }
          }
          if (best < 0 || land * 2 < total) continue;
          const h = heights[best];
          const top = tops[best] as MatId;
          const color = k > 1 ? colorAcc.clone().multiplyScalar(1 / land) : topColor(top, h, i0, j0);
          cells.push({ i: i0, j: j0, k, h, top, color });
          for (let j = j0; j < Math.min(N, j0 + k); j++) {
            for (let i = i0; i < Math.min(N, i0 + k); i++) {
              renderH[j * N + i] = h;
              renderLand[j * N + i] = 1;
            }
          }
        }
      }
    }
  }

  /** Height a side face drops to beside base cell (ni, nj), or null for no face. */
  const neighbourDrop = (ni: number, nj: number): number | null => {
    // The world edge is ocean. Do not draw a side face down to the water
    // here; the opaque water plane already covers the boundary.
    if (ni < 0 || nj < 0 || ni >= N || nj >= N) return null;
    const nidx = nj * N + ni;
    if (holeCell[nidx]) return null;
    if (renderLand[nidx]) return renderH[nidx];
    // Sea, or a land sub-cell of a coarse cell that is mostly sea: the face
    // runs down to the water so no see-through gap opens above it.
    return underwater[nidx] ? Math.max(SEA_LEVEL - 0.5, heights[nidx]) : SEA_LEVEL - 0.5;
  };

  for (const { i, j, k, h, top, color } of cells) {
    buf = tileBuffers[Math.floor(j / tileCells) * tilesPerSide + Math.floor(i / tileCells)];
    const x0 = -HALF + i * step, x1 = Math.min(HALF, x0 + k * step);
    const z0 = -HALF + j * step, z1 = Math.min(HALF, z0 + k * step);
    const span = Math.min(k, N - i), spanZ = Math.min(k, N - j);

    pushQuad(
      [[x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0]],
      [0, 1, 0],
      color,
    );

    // One side face per run of equal drop height along each edge. Coarse
    // cells beside finer ones get several runs, so no gap opens at a tier
    // boundary; equal-size neighbours give exactly one face as before.
    const edge = (side: 0 | 1 | 2 | 3) => {
      const n = side < 2 ? spanZ : span;
      let runStart = 0, runH: number | null = null;
      const flush = (end: number) => {
        if (runH === null || h <= runH) return;
        const nh = runH;
        const col = sideColor(top, h, nh, i, j);
        if (side === 0) {
          const za = z0 + runStart * step, zb = z0 + end * step;
          pushQuad([[x1, nh, za], [x1, h, za], [x1, h, zb], [x1, nh, zb]], [1, 0, 0], col);
        } else if (side === 1) {
          const za = z0 + runStart * step, zb = z0 + end * step;
          pushQuad([[x0, nh, za], [x0, nh, zb], [x0, h, zb], [x0, h, za]], [-1, 0, 0], col);
        } else if (side === 2) {
          const xa = x0 + runStart * step, xb = x0 + end * step;
          pushQuad([[xa, nh, z1], [xb, nh, z1], [xb, h, z1], [xa, h, z1]], [0, 0, 1], col);
        } else {
          const xa = x0 + runStart * step, xb = x0 + end * step;
          pushQuad([[xa, nh, z0], [xa, h, z0], [xb, h, z0], [xb, nh, z0]], [0, 0, -1], col);
        }
      };
      for (let t = 0; t < n; t++) {
        const nh = side === 0 ? neighbourDrop(i + span, j + t)
          : side === 1 ? neighbourDrop(i - 1, j + t)
            : side === 2 ? neighbourDrop(i + t, j + spanZ)
              : neighbourDrop(i + t, j - 1);
        if (t > 0 && nh === runH) continue;
        flush(t);
        runStart = t; runH = nh;
      }
      flush(n);
    };
    edge(0); edge(1); edge(2); edge(3);
  }

  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const meshes: THREE.Mesh[] = [];
  let triangles = 0;
  if (tileBuffers.length > 1) {
    // Tiled: every tile's quads go into ONE shared set of vertex and index
    // buffers, tile after tile in row-major order. Each tile mesh is a view
    // of its own index range (drawRange) with its own bounding box, so
    // cullMacro can hide off-screen tiles and then draw each run of
    // consecutive visible tiles with a single call by widening the first
    // tile's range. GPU memory is the same as one mesh.
    let vertexCount = 0, indexCount = 0;
    for (const b of tileBuffers) { vertexCount += b.positions.length / 3; indexCount += b.indices.length; }
    const position = new Float32Array(vertexCount * 3), normal = new Float32Array(vertexCount * 3), color = new Float32Array(vertexCount * 3);
    const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
    const ranges: Array<{ t: number; start: number; count: number; box: THREE.Box3 }> = [];
    let vo = 0, io = 0;
    for (let t = 0; t < tileBuffers.length; t++) {
      const b = tileBuffers[t];
      if (b.indices.length === 0) continue;
      position.set(b.positions, vo * 3);
      normal.set(b.normals, vo * 3);
      color.set(b.colors, vo * 3);
      for (let k = 0; k < b.indices.length; k++) index[io + k] = b.indices[k] + vo;
      const box = new THREE.Box3();
      for (let k = 0; k < b.positions.length; k += 3) {
        _boxPoint.set(b.positions[k], b.positions[k + 1], b.positions[k + 2]);
        box.expandByPoint(_boxPoint);
      }
      ranges.push({ t, start: io, count: b.indices.length, box });
      vo += b.positions.length / 3;
      io += b.indices.length;
    }
    const shared = {
      position: new THREE.BufferAttribute(position, 3),
      normal: new THREE.BufferAttribute(normal, 3),
      color: new THREE.BufferAttribute(color, 3),
      index: new THREE.BufferAttribute(index, 1),
    };
    for (const r of ranges) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', shared.position);
      geometry.setAttribute('normal', shared.normal);
      geometry.setAttribute('color', shared.color);
      geometry.setIndex(shared.index);
      geometry.setDrawRange(r.start, r.count);
      geometry.boundingBox = r.box;
      geometry.boundingSphere = r.box.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `macro_lod_tile_${r.t % tilesPerSide}_${Math.floor(r.t / tilesPerSide)}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      // cullMacro decides visibility by box; a widened run would fail
      // three's per-tile sphere test.
      mesh.frustumCulled = false;
      mesh.userData.macroRange = { start: r.start, count: r.count };
      meshes.push(mesh);
      triangles += r.count / 3;
    }
  }
  for (let t = 0; t < tileBuffers.length && tileBuffers.length === 1; t++) {
    const { positions, normals, colors, indices } = tileBuffers[t];
    if (indices.length === 0 && (tileBuffers.length > 1 || meshes.length > 0)) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = tileBuffers.length > 1 ? `macro_lod_tile_${t % tilesPerSide}_${Math.floor(t / tilesPerSide)}` : 'macro_lod';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    meshes.push(mesh);
    triangles += indices.length / 3;
  }
  if (meshes.length === 0) {
    const empty = new THREE.Mesh(new THREE.BufferGeometry(), material);
    empty.name = 'macro_lod';
    meshes.push(empty);
  }
  return {
    mesh: meshes[0],
    meshes,
    triangles,
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

const _cullFrustum = new THREE.Frustum();
const _cullMatrix = new THREE.Matrix4();
const _boxPoint = new THREE.Vector3();
/**
 * cullMacro joins two runs of visible macro tiles across an off-screen tile
 * of at most this many triangles (it is drawn and clipped by the GPU), to
 * save a draw call. Coast and sea tiles are small, so wide views collapse to
 * a few runs.
 */
export const MACRO_BRIDGE_TRIANGLES = 1500;

/**
 * Camera distances (m) past which the drawn near ring shrinks by one more
 * chunk: radius - 1 beyond the first, radius - 2 beyond the second (never
 * below 1). Review v1: at builder zoom 300 m and beyond the whole 7x7 ring is
 * on screen and its 49 chunk meshes plus water cost about 75 calls, while one
 * voxel there covers 2 to 4 pixels. Chunks stay loaded (sim, fauna and
 * vegetation still see them); only their meshes are hidden and the macro
 * mesh fills their area.
 */
export const NEAR_DISPLAY_DISTANCES: readonly number[] = [220, 450];
/** Zooming back in, a level is kept until the distance drops below threshold x this. */
export const NEAR_DISPLAY_HYSTERESIS = 0.9;

/**
 * Drawn near ring radius (chunks) for a camera `distance` (m) from its
 * target, with hysteresis against the previously drawn radius.
 */
export function nearDisplayRadius(distance: number, nearRadius: number, previous = nearRadius): number {
  const prevLevel = nearRadius - previous;
  let level = 0;
  for (let i = 0; i < NEAR_DISPLAY_DISTANCES.length; i++) {
    const t = NEAR_DISPLAY_DISTANCES[i] * (prevLevel > i ? NEAR_DISPLAY_HYSTERESIS : 1);
    if (distance > t) level = i + 1;
  }
  return Math.max(1, Math.min(nearRadius, nearRadius - level));
}

interface ChunkView { mesh: THREE.Mesh; water: THREE.Mesh | null; triangles: number; }

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
  /** Radius (chunks) of the near ring actually drawn; <= nearRadius (see nearDisplayRadius). */
  private displayRadius: number;
  /** Macro hole of the last world rebuild, in chunk coordinates (inclusive). */
  private holeChunks = { minX: 0, maxX: -1, minZ: 0, maxZ: -1 };
  private displayed = new Set<string>();
  /** displayRadius the macro hole was last built for. */
  private macroDisplayRadius = -1;
  private worldMacroStep: number;
  private mapMacroStep: number;
  private chunks = new Map<string, ChunkView>();
  private loaded = new Set<string>();
  private mode: ViewMode = 'world';
  private macro: THREE.Mesh[] = [];
  private macroVisibility: boolean[] = [];
  private macroInView = 0;
  private macroTriangles = 0;
  private macroFocus = new THREE.Vector3(1e9, 0, 1e9);
  private macroMode: ViewMode | null = null;
  private chunkGenSamples: number[] = [];
  private chunkMeshSamples: number[] = [];
  private macroSamples: number[] = [];
  private macroSampleSamples: number[] = [];
  private macroCacheHits = 0;
  private macroEditKey: string | null = null;
  /** Main-thread milliseconds per frame for streaming and dirty re-meshing. */
  frameBudgetMs = 6;
  private pendingChunks = 0;
  private sweepCounter = 0;
  private sweptChunks = 0;
  private pinned = new Set<string>();
  private pool: ChunkWorkerPool | null = null;
  private generating = new Set<string>();
  /** Latest mesh request per chunk; older results are discarded. */
  private meshStamp = new Map<string, number>();
  private stampCounter = 0;
  private workerStats = { generated: 0, meshed: 0, discarded: 0, genMs: 0, meshMs: 0 };
  private waterGroup = new THREE.Group();
  private farWaterHole: { value: THREE.Vector4 };
  onChunksChanged: (() => void) | null = null;

  constructor(world: World, scene: THREE.Scene, opts: VoxelTerrainViewOptions = {}) {
    this.world = world;
    this.nearRadius = Math.max(1, opts.nearRadius ?? 3);
    this.displayRadius = this.nearRadius;
    this.worldMacroStep = Math.max(4, opts.worldMacroStep ?? 8);
    this.mapMacroStep = Math.max(4, opts.mapMacroStep ?? 8);
    this.group.name = 'voxel_world';
    this.nearGroup.name = 'voxel_chunks';
    this.macroGroup.name = 'macro_lod';
    this.group.add(this.nearGroup, this.macroGroup);
    this.water = buildWaterSurface(world);
    this.farWaterHole = installFarWaterHole(this.water.material as THREE.Material);
    this.group.add(this.water);
    this.waterGroup.name = 'near_water';
    this.group.add(this.waterGroup);
    scene.add(this.group);
  }

  preload(focus: THREE.Vector3): void {
    this.mode = 'world';
    this.ensureChunks(focus, true);
    this.rebuildMacro(focus, 'world', true);
  }

  /** Advance presentation-only water animation (seconds). */
  setWaterTime(seconds: number): void { waterTime.value = seconds; }

  update(focus: THREE.Vector3, mode: ViewMode = 'world'): void {
    if (mode !== this.mode) {
      this.mode = mode;
      this.nearGroup.visible = mode !== 'map';
      this.waterGroup.visible = mode !== 'map';
      if (mode === 'map') this.farWaterHole.value.set(0, 0, 0, 0);
      this.rebuildMacro(focus, mode, true);
    }

    if (mode === 'map') {
      if (macroEditKey(this.world) !== this.macroEditKey) this.rebuildMacro(focus, mode, true);
      return;
    }

    const frameStart = performance.now();
    this.ensureChunks(focus, false, frameStart);
    this.rebuildDirty(focus, frameStart);
    if (++this.sweepCounter % 30 === 0) this.sweepResident(focus);

    const moved = Math.hypot(focus.x - this.macroFocus.x, focus.z - this.macroFocus.z);
    if (this.macroDisplayRadius !== this.displayRadius) {
      this.rebuildMacro(focus, mode, true);
    } else if (this.macroMode !== mode || moved > 48 || macroEditKey(this.world) !== this.macroEditKey) {
      this.rebuildMacro(focus, mode, false);
    }
    this.applyDisplay(focus);
  }

  /**
   * Presentation only: pick the drawn near ring radius for a camera this far
   * (m) from its target (nearDisplayRadius). Takes effect at the next update().
   */
  setViewDistance(distance: number): void {
    this.displayRadius = nearDisplayRadius(distance, this.nearRadius, this.displayRadius);
  }

  /** Radius (chunks) of the near ring currently drawn. */
  get displayRadiusChunks(): number { return this.displayRadius; }

  /**
   * Show a loaded chunk when it lies in the macro hole (so no gap opens) or
   * within displayRadius of the focus chunk (leading edge while the macro
   * waits for its 48 m rebuild). With the full radius every chunk is drawn,
   * exactly as before.
   */
  private applyDisplay(focus: THREE.Vector3): void {
    const all = this.displayRadius >= this.nearRadius;
    const ccx = worldToChunkX(Math.round(focus.x));
    const ccz = worldToChunkZ(Math.round(focus.z));
    const h = this.holeChunks, r = this.displayRadius;
    this.displayed.clear();
    for (const [key, view] of this.chunks) {
      let show = all;
      if (!show) {
        const [cx, cz] = key.split(',').map(Number);
        show = (cx >= h.minX && cx <= h.maxX && cz >= h.minZ && cz <= h.maxZ)
          || (Math.abs(cx - ccx) <= r && Math.abs(cz - ccz) <= r);
      }
      view.mesh.visible = show;
      if (view.water) view.water.visible = show;
      if (show && this.loaded.has(key)) this.displayed.add(key);
    }
  }

  /**
   * Stream the near ring nearest-first within a per-frame time budget. At least
   * one chunk is built per frame so streaming always makes progress.
   */
  /**
   * Move streaming generation and meshing to workers. Explicit rebuilds
   * (construction, edits via rebuildAround) and preload stay synchronous so
   * authoritative changes are visible immediately.
   */
  enableWorkers(pool: ChunkWorkerPool): void { this.pool = pool; }

  get workerMetrics(): Record<string, number> | null {
    if (!this.pool) return null;
    return {
      workers: this.pool.size, inFlight: this.pool.inFlight, ...this.workerStats,
      genMsAvg: this.workerStats.generated ? Math.round(this.workerStats.genMs / this.workerStats.generated * 10) / 10 : 0,
      meshMsAvg: this.workerStats.meshed ? Math.round(this.workerStats.meshMs / this.workerStats.meshed * 10) / 10 : 0,
    };
  }

  private requestGenerate(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    if (this.world.chunks.has(key) || this.generating.has(key) || !this.pool) return;
    if (cx < 0 || cz < 0 || cx >= CHUNKS_PER_SIDE || cz >= CHUNKS_PER_SIDE) return;
    this.generating.add(key);
    const { seed } = this.world, version = this.world.params.generatorVersion;
    void this.pool.generate(seed, version, cx, cz).then((r) => {
      this.generating.delete(key);
      // The main thread is the only World writer: install only if still wanted.
      if (this.world.seed !== seed || this.world.params.generatorVersion !== version
        || this.world.chunks.has(key)) { this.workerStats.discarded++; return; }
      seedBaseColumns(this.world, key, r.columns);
      installBaseChunk(this.world, r.base, r.ms);
      this.workerStats.generated++;
      this.workerStats.genMs += r.ms;
    });
  }

  private requestMesh(key: string): void {
    const chunk = this.world.chunks.get(key);
    if (!chunk || !this.pool) return;
    const stamp = ++this.stampCounter;
    this.meshStamp.set(key, stamp);
    this.world.dirty.delete(key);
    const ox = chunkOriginX(chunk.cx), oz = chunkOriginZ(chunk.cz);
    const padded = paddedFor(this.world, chunk);
    void this.pool.mesh(padded, chunk.heights, ox, oz, this.world.seed).then((r) => {
      // Superseded (newer request, unloaded or synchronously rebuilt) results are dropped.
      if (this.meshStamp.get(key) !== stamp) { this.workerStats.discarded++; return; }
      this.meshStamp.delete(key);
      const current = this.world.chunks.get(key);
      if (!current) { this.workerStats.discarded++; return; }
      // An edit to this chunk while in flight re-marked it dirty; the result is
      // still shown now and replaced by the next (fresh) request.
      this.adoptMesh(key, current, geometryFromArrays(r.arrays));
      this.workerStats.meshed++;
      this.workerStats.meshMs += r.ms;
      this.onChunksChanged?.();
    });
  }

  private adoptMesh(key: string, chunk: VoxelChunk, result: MeshResult): void {
    const existing = this.chunks.get(key);
    if (existing) {
      this.nearGroup.remove(existing.mesh);
      existing.mesh.geometry.dispose();
      if (existing.water) { this.waterGroup.remove(existing.water); existing.water.geometry.dispose(); }
    }
    const mesh = new THREE.Mesh(result.geometry, terrainMaterial);
    mesh.name = `voxel_chunk_${chunk.cx}_${chunk.cz}`;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.nearGroup.add(mesh);
    const water = meshChunkWater(this.world, chunk);
    if (water) this.waterGroup.add(water);
    this.chunks.set(key, { mesh, water, triangles: result.triangles + (water?.userData.waterTriangles ?? 0) });
    this.loaded.add(key);
  }

  /** Worker streaming: generate the 3x3 neighbourhood, then mesh, nearest first. */
  private ensureChunksAsync(missing: Array<{ cx: number; cz: number; d: number }>): void {
    const pool = this.pool!;
    const maxInFlight = pool.size * 3;
    for (const m of missing) {
      if (pool.inFlight >= maxInFlight) break;
      const key = chunkKey(m.cx, m.cz);
      if (this.meshStamp.has(key)) continue;
      let ready = true;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = m.cx + dx, cz = m.cz + dz;
          if (cx < 0 || cz < 0 || cx >= CHUNKS_PER_SIDE || cz >= CHUNKS_PER_SIDE) continue;
          if (!this.world.chunks.has(chunkKey(cx, cz))) { ready = false; this.requestGenerate(cx, cz); }
        }
      }
      if (ready) this.requestMesh(key);
    }
  }

  private ensureChunks(focus: THREE.Vector3, immediate: boolean, frameStart = performance.now()): void {
    const ccx = worldToChunkX(Math.round(focus.x));
    const ccz = worldToChunkZ(Math.round(focus.z));
    let changed = false;

    const missing: Array<{ cx: number; cz: number; d: number }> = [];
    for (let dz = -this.nearRadius; dz <= this.nearRadius; dz++) {
      for (let dx = -this.nearRadius; dx <= this.nearRadius; dx++) {
        const cx = ccx + dx, cz = ccz + dz;
        if (cx < 0 || cz < 0 || cx >= CHUNKS_PER_SIDE || cz >= CHUNKS_PER_SIDE) continue;
        if (this.loaded.has(chunkKey(cx, cz))) continue;
        missing.push({ cx, cz, d: dx * dx + dz * dz });
      }
    }
    missing.sort((a, b) => a.d - b.d);
    let built = 0;
    if (this.pool && !immediate && !this.pool.failed) {
      this.ensureChunksAsync(missing);
      missing.length = 0;
    }
    for (const m of missing) {
      if (!immediate && built > 0 && performance.now() - frameStart >= this.frameBudgetMs) break;
      this.buildChunk(m.cx, m.cz);
      built++;
      changed = true;
    }
    this.pendingChunks = this.pool && !immediate ? this.meshStamp.size + this.generating.size : missing.length - built;

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
      if (existing.water) { this.waterGroup.remove(existing.water); existing.water.geometry.dispose(); }
    }

    const meshT0 = performance.now();
    const { geometry, triangles } = meshChunk(this.world, chunk);
    recordSample(this.chunkMeshSamples, performance.now() - meshT0);
    const mesh = new THREE.Mesh(geometry, terrainMaterial);
    mesh.name = `voxel_chunk_${cx}_${cz}`;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.nearGroup.add(mesh);
    const water = meshChunkWater(this.world, chunk);
    if (water) this.waterGroup.add(water);
    this.chunks.set(key, { mesh, water, triangles: triangles + (water?.userData.waterTriangles ?? 0) });
    this.loaded.add(key);
    this.world.dirty.delete(key);
  }

  private disposeChunk(key: string): void {
    const view = this.chunks.get(key);
    if (view) {
      this.nearGroup.remove(view.mesh);
      view.mesh.geometry.dispose();
      if (view.water) { this.waterGroup.remove(view.water); view.water.geometry.dispose(); }
      this.chunks.delete(key);
    }
    this.loaded.delete(key);
    this.meshStamp.delete(key);
    if (this.pinned.has(key)) return;
    this.world.dirty.delete(key);
    evictChunk(this.world, key);
  }

  private rebuildChunk(key: string): void {
    const [cx, cz] = key.split(',').map(Number);
    this.buildChunk(cx, cz);
  }

  /** Re-mesh dirty loaded chunks nearest-first, sharing the frame budget. */
  private rebuildDirty(focus: THREE.Vector3, frameStart: number): void {
    const ccx = worldToChunkX(Math.round(focus.x));
    const ccz = worldToChunkZ(Math.round(focus.z));
    const dirty: Array<{ key: string; d: number }> = [];
    for (const key of this.loaded) {
      if (!this.world.dirty.has(key)) continue;
      const [cx, cz] = key.split(',').map(Number);
      dirty.push({ key, d: (cx - ccx) ** 2 + (cz - ccz) ** 2 });
    }
    if (dirty.length === 0) return;
    dirty.sort((a, b) => a.d - b.d);
    if (this.pool && !this.pool.failed) {
      for (const { key } of dirty) if (!this.meshStamp.has(key) || this.world.dirty.has(key)) this.requestMesh(key);
      return;
    }
    let rebuilt = 0;
    for (const { key } of dirty) {
      if (rebuilt > 0 && performance.now() - frameStart >= this.frameBudgetMs) break;
      this.rebuildChunk(key);
      rebuilt++;
    }
    if (rebuilt > 0) this.onChunksChanged?.();
  }

  /**
   * Chunk lifetime policy. Meshing generates a ring of neighbour chunks, and
   * simulation queries can generate more; none of those were ever released.
   * Resident chunk bytes are derived (regenerated from seed + durable edits),
   * so anything outside the keep radius that is not loaded or pinned is freed.
   */
  private sweepResident(focus: THREE.Vector3): void {
    const ccx = worldToChunkX(Math.round(focus.x));
    const ccz = worldToChunkZ(Math.round(focus.z));
    const keep = this.nearRadius + 2;
    for (const key of [...this.world.chunks.keys()]) {
      if (this.loaded.has(key) || this.pinned.has(key) || this.meshStamp.has(key)) continue;
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - ccx) <= keep && Math.abs(cz - ccz) <= keep) continue;
      evictChunk(this.world, key);
      this.world.dirty.delete(key);
      this.sweptChunks++;
    }
  }

  /**
   * Keep the chunks under a world-space rectangle resident (for example the
   * settlement envelope that construction previews query several times a second).
   */
  pinRect(minX: number, minZ: number, maxX: number, maxZ: number): void {
    for (let cz = worldToChunkZ(minZ) - 1; cz <= worldToChunkZ(maxZ) + 1; cz++) {
      for (let cx = worldToChunkX(minX) - 1; cx <= worldToChunkX(maxX) + 1; cx++) {
        if (cx >= 0 && cz >= 0 && cx < CHUNKS_PER_SIDE && cz < CHUNKS_PER_SIDE) this.pinned.add(chunkKey(cx, cz));
      }
    }
  }

  get residentChunks(): number { return this.world.chunks.size; }
  get pendingChunkBuilds(): number { return this.pendingChunks; }
  get evictedBySweep(): number { return this.sweptChunks; }

  rebuildAround(x: number, z: number): void {
    const cx = worldToChunkX(x), cz = worldToChunkZ(z);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = chunkKey(cx + dx, cz + dz);
        this.meshStamp.delete(key);
        if (this.loaded.has(key)) this.rebuildChunk(key);
      }
    }
    this.onChunksChanged?.();
    if (this.macro.length) this.rebuildMacro(this.macroFocus, this.mode, true);
  }

  private rebuildMacro(focus: THREE.Vector3, mode: ViewMode, force: boolean): void {
    if (!force && this.macroMode === mode) {
      const moved = Math.hypot(focus.x - this.macroFocus.x, focus.z - this.macroFocus.z);
      if (mode === 'map' || moved <= 48) return;
    }
    const macroT0 = performance.now();
    for (const tile of this.macro) {
      this.macroGroup.remove(tile);
      // Tiles share their buffers; disposing each view frees them once.
      tile.geometry.dispose();
    }
    this.macro = [];
    const step = mode === 'map' ? this.mapMacroStep : this.worldMacroStep;
    let hole: MacroHole | undefined;
    if (mode !== 'map') {
      const ccx = worldToChunkX(Math.round(focus.x));
      const ccz = worldToChunkZ(Math.round(focus.z));
      const r = this.displayRadius;
      hole = {
        minX: chunkOriginX(ccx - r),
        maxX: chunkOriginX(ccx + r) + CHUNK_SIZE,
        minZ: chunkOriginZ(ccz - r),
        maxZ: chunkOriginZ(ccz + r) + CHUNK_SIZE,
      };
      this.holeChunks = { minX: ccx - r, maxX: ccx + r, minZ: ccz - r, maxZ: ccz + r };
      this.farWaterHole.value.set(hole.minX, hole.minZ, hole.maxX, hole.maxZ);
    }
    this.macroDisplayRadius = this.displayRadius;
    const result = buildMacroMesh(this.world, { step, hole, focus: mode === 'map' ? undefined : focus });
    this.macro = result.meshes;
    this.macroTriangles = result.triangles;
    this.macroGroup.add(...result.meshes);
    this.macroFocus.copy(focus);
    this.macroMode = mode;
    this.macroEditKey = macroEditKey(this.world);
    recordSample(this.macroSamples, performance.now() - macroT0);
    if (result.sampleCached) this.macroCacheHits++;
    else recordSample(this.macroSampleSamples, result.sampleMs);
  }

  get loadedChunks(): number { return this.loaded.size; }
  get loadedChunkKeys(): ReadonlySet<string> { return this.loaded; }
  /** Loaded chunks whose meshes are drawn (all of them unless zoomed out). */
  get displayedChunkKeys(): ReadonlySet<string> { return this.displayRadius >= this.nearRadius ? this.loaded : this.displayed; }
  get displayedChunks(): number { return this.displayedChunkKeys.size; }
  get nearTriangles(): number {
    let t = 0;
    for (const v of this.chunks.values()) t += v.triangles;
    return t;
  }
  /** Triangles of the near chunks currently drawn (see displayedChunkKeys). */
  get nearDisplayedTriangles(): number {
    let t = 0;
    for (const v of this.chunks.values()) if (v.mesh.visible) t += v.triangles;
    return t;
  }
  get macroTriangleCount(): number { return this.macroTriangles; }
  /** Triangles the macro draws after the last cullMacro call (runs, including bridged tiles). */
  get macroVisibleTriangles(): number {
    let t = 0;
    for (const tile of this.macro) {
      if (!tile.visible) continue;
      const g = tile.geometry;
      t += Math.min(g.drawRange.count, g.index?.count ?? 0) / 3;
    }
    return t;
  }
  /** Macro tiles whose box is inside the frustum at the last cullMacro call. */
  get macroTilesInView(): number { return this.macroInView; }

  /**
   * Hide macro tiles whose bounding box is outside the camera frustum, then
   * draw each run of consecutive visible tiles (row-major, sharing one index
   * buffer) as one call. Three only culls by bounding sphere, which never
   * rejects a 256 m tile next to the camera; the box test also drops far
   * tiles below the frustum when the camera pitches down. A run continues
   * across an off-screen tile of at most MACRO_BRIDGE_TRIANGLES. Review v1:
   * at the 1400 m builder zoom 40 tiles were on screen and each cost a call.
   * Presentation only, call once per frame before render.
   */
  cullMacro(camera: THREE.Camera): void {
    if (this.macro.length <= 1) {
      for (const tile of this.macro) tile.visible = true;
      this.macroInView = this.macro.length;
      return;
    }
    camera.updateMatrixWorld();
    _cullMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _cullFrustum.setFromProjectionMatrix(_cullMatrix);
    const n = this.macro.length;
    const inView = this.macroVisibility.length === n ? this.macroVisibility : (this.macroVisibility = new Array<boolean>(n));
    let count = 0;
    for (let i = 0; i < n; i++) {
      const box = this.macro[i].geometry.boundingBox;
      inView[i] = !box || _cullFrustum.intersectsBox(box);
      if (inView[i]) count++;
    }
    this.macroInView = count;
    let head: THREE.Mesh | null = null, headStart = 0, gap = 0;
    for (let i = 0; i < n; i++) {
      const tile = this.macro[i];
      const range = tile.userData.macroRange as { start: number; count: number };
      tile.visible = false;
      if (!inView[i]) { gap += range.count / 3; continue; }
      if (head && gap <= MACRO_BRIDGE_TRIANGLES) {
        head.geometry.setDrawRange(headStart, range.start + range.count - headStart);
      } else {
        head = tile;
        headStart = range.start;
        tile.visible = true;
        tile.geometry.setDrawRange(headStart, range.count);
      }
      gap = 0;
    }
  }
  get drawCalls(): number {
    let near = 0, water = 0;
    for (const [key, v] of this.chunks) {
      if (!this.loaded.has(key) || !v.mesh.visible) continue;
      near++;
      if (v.water) water++;
    }
    let macro = 0;
    for (const tile of this.macro) if (tile.visible) macro++;
    return near + water + macro + 1;
  }
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
