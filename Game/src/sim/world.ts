// Simulation layer — pure TypeScript, no three.js imports (D-005).
//
// M001 world foundation: a chunked, genuinely three-dimensional voxel world.
// The stored state is one material byte per cell (0 = air); occupancy is
// implicit. Surface height is a derived query, not the storage. This replaces
// the former 256 x 256 heightfield (see IR-005).
//
// World metres: x/z in [-1024, 1024), y in [-16, 112), sea level 0.
// A chunk is 32 x 32 x 128 cells. Generation is a pure function of the seed,
// generator version, parameters and chunk coordinates; edits are recorded
// separately and re-applied when a chunk is regenerated.
import type { Structure } from './structures';
import type { LifeState } from './economy';
import { isStoneReplay } from './stone-compat';

export const WORLD_SIZE = 2048;
export const HALF = WORLD_SIZE / 2;
export const CHUNK_SIZE = 32;
export const CHUNKS_PER_SIDE = WORLD_SIZE / CHUNK_SIZE;
export const Y_MIN = -16;
export const Y_MAX = 112;
export const WORLD_HEIGHT = Y_MAX - Y_MIN;
export const SEA_LEVEL = 0;
export const WATER = SEA_LEVEL;
export const GENERATOR_VERSION = 1;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;

export const MAT = {
  AIR: 0,
  GRASS: 1,
  SOIL: 2,
  SAND: 3,
  GRAVEL: 4,
  STONE: 5,
  ORE: 6,
  WATER: 7,
  BEDROCK: 8,
  MOSS: 9,
} as const;
export type MatId = (typeof MAT)[keyof typeof MAT];

export const isSolid = (m: number): boolean => m !== MAT.AIR && m !== MAT.WATER;
export const isOpaque = isSolid;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------- deterministic hash / noise ----------
export function hash2i(x: number, y: number, seed: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function hash3i(x: number, y: number, z: number, seed: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash2i(xi, yi, seed), b = hash2i(xi + 1, yi, seed);
  const c = hash2i(xi, yi + 1, seed), d = hash2i(xi + 1, yi + 1, seed);
  const top = a + (b - a) * xf;
  const bottom = c + (d - c) * xf;
  return top + (bottom - top) * yf;
}

export function fbm2(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + i * 131);
    norm += amp;
    amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}

function valueNoise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  const c000 = hash3i(xi, yi, zi, seed), c100 = hash3i(xi + 1, yi, zi, seed);
  const c010 = hash3i(xi, yi + 1, zi, seed), c110 = hash3i(xi + 1, yi + 1, zi, seed);
  const c001 = hash3i(xi, yi, zi + 1, seed), c101 = hash3i(xi + 1, yi, zi + 1, seed);
  const c011 = hash3i(xi, yi + 1, zi + 1, seed), c111 = hash3i(xi + 1, yi + 1, zi + 1, seed);
  const x00 = c000 + (c100 - c000) * xf;
  const x10 = c010 + (c110 - c010) * xf;
  const x01 = c001 + (c101 - c001) * xf;
  const x11 = c011 + (c111 - c011) * xf;
  const y0 = x00 + (x10 - x00) * yf;
  const y1 = x01 + (x11 - x01) * yf;
  return y0 + (y1 - y0) * zf;
}

function fbm3(x: number, y: number, z: number, seed: number, octaves: number): number {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3(x * freq, y * freq, z * freq, seed + i * 131);
    norm += amp;
    amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}

// ---------- world types ----------
export interface WorldParams {
  size: number;
  chunkSize: number;
  yMin: number;
  yMax: number;
  seaLevel: number;
  generatorVersion: number;
}

export const DEFAULT_PARAMS: WorldParams = {
  size: WORLD_SIZE,
  chunkSize: CHUNK_SIZE,
  yMin: Y_MIN,
  yMax: Y_MAX,
  seaLevel: SEA_LEVEL,
  generatorVersion: GENERATOR_VERSION,
};

export interface VoxelChunk {
  cx: number;
  cz: number;
  key: string;
  /** x + z*32 + (y-Y_MIN)*1024 */
  data: Uint8Array;
  /** top solid y, encoded as (y - Y_MIN), 0..127; 0 means no solid. */
  heights: Uint8Array;
  /** top material per column. */
  topMaterials: Uint8Array;
  nonAir: number;
  dirty: boolean;
  generatedAt: number;
}

// Natural assets are the project's Styl (`nat_`) pipeline (AS-001 v2), not
// Noxel architecture. Noxel remains the human-made kit/waystone/marker system.
// Retired only as world content. The names remain in the serialized type so
// old snapshots and accepted harvest journals can be migrated without rejecting
// otherwise valid saves. Generation, collision and inspection never use them.
export const RETIRED_STONE_KINDS = new Set<EntityKind>([
  'styl_rock_small', 'styl_rock_medium', 'styl_rock_large',
]);
export const isRetiredStoneKind = (kind: EntityKind): boolean => RETIRED_STONE_KINDS.has(kind);
export type ActiveEntityKind = Exclude<EntityKind,
  'styl_rock_small' | 'styl_rock_medium' | 'styl_rock_large'>;

function liveEntity(world: World, id: string): Entity | null {
  const entity = world.entities.get(id);
  return !entity || (isRetiredStoneKind(entity.kind) && !isStoneReplay(world))
    || world.entityRemovals.has(id) ? null : entity;
}

export type EntityKind =
  | 'styl_tree_spire'
  | 'styl_tree_table'
  | 'styl_tree_cluster'
  | 'styl_tree_blossom'
  | 'styl_shrub'
  | 'styl_rock_small'
  | 'styl_rock_medium'
  | 'styl_rock_large'
  | 'styl_ore'
  | 'styl_cairn'
  | 'waystone'
  | 'marker';

export type ResourceType = 'wood' | 'stone' | 'ore' | 'fiber';

export interface Entity {
  id: string;
  kind: EntityKind;
  chunk: string;
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  variant: number;
  resource: ResourceType | null;
  remaining: number;
  yieldPerHarvest: number;
  /** True once the entity is fully depleted. */
  harvested: boolean;
  /** True after the first successful harvest, even if yield remains. */
  harvestedOnce?: boolean;
  provisional: boolean;
  authored: boolean;
}

export interface NoxelSite {
  id: string;
  kind: 'waystone' | 'marker';
  x: number;
  y: number;
  z: number;
  rot: number;
  provisional: true;
}

export interface RegionInfo {
  id: string;
  label: string;
  type: 'plain' | 'forest' | 'hills' | 'highland' | 'water' | 'ridge';
  cx: number;
  cz: number;
  rx: number;
  rz: number;
}

export interface WorldStats {
  chunksGenerated: number;
  chunksEvicted: number;
  voxelsFilled: number;
  generationMs: number;
  entities: number;
  trees: number;
  pinkTrees: number;
  pinkOverflow: number;
}

export interface World {
  seed: number;
  params: WorldParams;
  chunks: Map<string, VoxelChunk>;
  entities: Map<string, Entity>;
  entityChunks: Map<string, string[]>;
  /** Chunks whose deterministic natural-entity state has been changed. */
  entityChanges: Set<string>;
  /** Tombstones for removed deterministic natural entities. */
  entityRemovals: Set<string>;
  /** Authoritative built structures (house, path, terraces, crops). */
  structures: Map<string, Structure>;
  sites: NoxelSite[];
  regions: RegionInfo[];
  /** chunk key -> local voxel index -> material. Durable, compact edits. */
  edits: Map<string, Map<number, number>>;
  /** Global local-player carried bag; bounded in schema 3, legacy in 1/2. */
  inventory: Record<string, number>;
  /** Present only after schema-3 genesis/restoration. */
  life?: LifeState;
  dirty: Set<string>;
  stats: WorldStats;
  authoredPlaced: boolean;
  /**
   * Monotonic revision of authoritative state (voxels and entities). Derived
   * caches keyed on this value are discarded after an edit; mesh/navigation
   * revisions are separate because they are derived, not world state.
   */
  revision: number;
}

export const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;
export const chunkOriginX = (cx: number) => cx * CHUNK_SIZE - HALF;
export const chunkOriginZ = (cz: number) => cz * CHUNK_SIZE - HALF;
export const localIndex = (lx: number, yIndex: number, lz: number) =>
  lx + lz * CHUNK_SIZE + yIndex * CHUNK_AREA;
export const worldToChunkX = (x: number) => Math.floor((x + HALF) / CHUNK_SIZE);
export const worldToChunkZ = (z: number) => Math.floor((z + HALF) / CHUNK_SIZE);
export const worldToLocalX = (x: number) => x - (worldToChunkX(x) * CHUNK_SIZE - HALF);
export const worldToLocalZ = (z: number) => z - (worldToChunkZ(z) * CHUNK_SIZE - HALF);
export const yToIndex = (y: number) => y - Y_MIN;

export function createWorld(seed = 1337): World {
  return {
    seed,
    params: { ...DEFAULT_PARAMS },
    chunks: new Map(),
    entities: new Map(),
    entityChunks: new Map(),
    entityChanges: new Set(),
    entityRemovals: new Set(),
    structures: new Map(),
    sites: [],
    regions: REGIONS,
    edits: new Map(),
    inventory: {},
    dirty: new Set(),
    stats: {
      chunksGenerated: 0, chunksEvicted: 0, voxelsFilled: 0, generationMs: 0,
      entities: 0, trees: 0, pinkTrees: 0, pinkOverflow: 0,
    },
    authoredPlaced: false,
    revision: 0,
  };
}

export function generateWorld(seed = 1337, initialRadius = 0): World {
  const world = createWorld(seed);
  const centre = Math.floor(CHUNKS_PER_SIDE / 2);
  for (let cz = centre - initialRadius; cz <= centre + initialRadius; cz++) {
    for (let cx = centre - initialRadius; cx <= centre + initialRadius; cx++) {
      generateChunk(world, cx, cz);
    }
  }
  placeAuthoredSites(world);
  return world;
}

// ---------- geography ----------
export const REGIONS: RegionInfo[] = [
  { id: 'founder', label: 'Founder valley', type: 'plain', cx: 0, cz: 0, rx: 110, rz: 85 },
  { id: 'eastwood', label: 'Eastwood', type: 'forest', cx: 220, cz: -110, rx: 260, rz: 220 },
  { id: 'crown', label: 'Crown highlands', type: 'highland', cx: -360, cz: -300, rx: 380, rz: 300 },
  { id: 'lake', label: 'Mirror lake', type: 'water', cx: -260, cz: -230, rx: 120, rz: 95 },
  { id: 'southdowns', label: 'South downs', type: 'hills', cx: 120, cz: 330, rx: 260, rz: 190 },
  { id: 'westrise', label: 'West rise', type: 'hills', cx: -360, cz: 120, rx: 220, rz: 210 },
  { id: 'coast', label: 'Broken coast', type: 'ridge', cx: 0, cz: 0, rx: 780, rz: 660 },
];

export function riverCenterX(z: number): number {
  // The river runs north–south about 70–110 m west of the founder shelf, so
  // the default north-west view has water, a near bank and a far bank.
  return -90 + 55 * Math.sin((z + 100) / 240) + 18 * Math.sin((z - 20) / 80);
}

export function riverDistance(x: number, z: number): number {
  return Math.abs(x - riverCenterX(z));
}

export function lakeDistance(x: number, z: number): number {
  return Math.sqrt(((x + 260) / 120) ** 2 + ((z + 230) / 95) ** 2);
}

/**
 * Integer top solid y of the base generated surface (no edits/overhangs).
 *
 * This is the *shape* the voxel volume is filled from, not the stored world.
 * The important correction over the first M001 pass is that the landscape is
 * not one smooth radial bowl: it is a warped multi-scale surface with a broad
 * river valley, a small buildable shelf, and ridged highlands. A shallow
 * smooth surface quantised to 1 m voxels is what produced the concentric
 * contour rings; varied relief and a river valley break them naturally.
 */
export function surfaceHeightAt(seed: number, x: number, z: number): number {
  // Two-scale domain warp. The broad warp moves coastlines and hills; the
  // small warp keeps the 1 m quantisation from following clean contours.
  const wx = x
    + (fbm2(x / 420, z / 420, seed + 101, 3) - 0.5) * 240
    + (fbm2(x / 95, z / 95, seed + 102, 2) - 0.5) * 30;
  const wz = z
    + (fbm2(x / 420 + 7.3, z / 420 - 3.1, seed + 103, 3) - 0.5) * 240
    + (fbm2(x / 95 + 3.7, z / 95 - 8.1, seed + 104, 2) - 0.5) * 30;

  const radial = Math.sqrt((wx / 780) ** 2 + (wz / 660) ** 2);
  const coastNoise = (fbm2(wx / 300, wz / 300, seed + 105, 4) - 0.5) * 0.34
    + (fbm2(wx / 95, wz / 95, seed + 106, 2) - 0.5) * 0.10;
  const landness = 1.0 - radial + coastNoise;
  const inland = smoothstep(-0.03, 0.12, landness);

  const oceanFloor = -13 + 6 * fbm2(wx / 170, wz / 170, seed + 107, 3);

  // Rolling land at three scales. The 40 m and 15 m components are real
  // surface height, not a render decoration, so the macro sampler agrees.
  const swell = 4 + 11 * fbm2(wx / 340, wz / 340, seed + 108, 4);
  const hills = 8 * fbm2(wx / 115, wz / 115, seed + 109, 3);
  const bumps = 2.2 * fbm2(x / 42, z / 42, seed + 110, 2)
    + 0.9 * fbm2(x / 15, z / 15, seed + 111, 2);

  // Ridged highlands. The massif mask is regional and biased to the
  // north-west; without the regional gate the first M001 pass raised a 48 m
  // mountain directly under the founder shelf.
  const massifNoise = fbm2(wx / 480 + 11, wz / 480 - 7, seed + 112, 4);
  const massifMask = smoothstep(0.60, 0.78, massifNoise);
  const ridge = 1 - Math.abs(2 * fbm2(wx / 230, wz / 230, seed + 113, 4) - 1);
  const ridge2 = 1 - Math.abs(2 * fbm2(wx / 90, wz / 90, seed + 114, 3) - 1);
  const nwBias = Math.exp(-(((wx + 360) / 380) ** 2 + ((wz + 300) / 320) ** 2));
  const mount = Math.min(1, massifMask * (0.30 + 0.70 * nwBias) + 0.22 * nwBias);

  let h = swell + hills + bumps
    + mount * (20 + 40 * ridge * ridge + 12 * ridge2);

  // Spurs and gullies at 30–90 m. Without these, a smooth hill quantised to
  // 1 m voxels reads as concentric contour rings; with them, the same hill
  // breaks into ridges, side valleys and rock faces.
  const spur = 1 - Math.abs(2 * fbm2(wx / 85, wz / 85, seed + 120, 3) - 1);
  const gully = Math.pow(1 - Math.abs(2 * fbm2(wx / 52 + 13, wz / 52 - 5, seed + 121, 3) - 1), 2);
  h += (spur - 0.55) * 5.0 - gully * 3.2;

  h = oceanFloor + (h - oceanFloor) * inland;
  h += 1.6 * smoothstep(0.0, 0.10, landness);

  // Broad river valley, then the channel itself. The valley mask is gated by
  // landness: without the gate it pulled the ocean floor up to the valley
  // floor outside the island, which the map view showed as pale river-shaped
  // bars running to the horizon.
  const rd = riverDistance(wx, wz);
  const valley = smoothstep(95, 10, rd) * smoothstep(0.0, 0.10, landness);
  const valleyFloor = 2.5 + 1.0 * fbm2(wx / 60, wz / 60, seed + 115, 2);
  h = lerp(h, valleyFloor, valley * 0.75);
  const riverW = 5.0 + 3.0 * fbm2(wx / 45, wz / 45, seed + 116, 2);
  // A wide, shallow channel profile. The first pass carved a 12 m slot with
  // near-vertical banks, which read as a bright stone quarry rather than a
  // river. The outer edge is now ~25 m from the centreline, and the bed is
  // only 2 m below sea level.
  const channel = smoothstep(riverW + 18, riverW * 0.4, rd);
  if (landness > 0.0) h = lerp(h, -2.0, channel * 0.95);

  // Lake basin at the foot of the north-west highlands.
  const lakeD = lakeDistance(wx, wz)
    * (1 + 0.18 * (fbm2(wx / 90, wz / 90, seed + 117, 2) - 0.5) * 2);
  if (lakeD < 1.15) {
    const lakeMask = smoothstep(1.15, 0.55, lakeD);
    h = lerp(h, -6.5, lakeMask * 0.95);
  }

  // Founder shelf: a small, irregular buildable terrace on the east bank.
  // Deliberately not a 260 m radial flatten; the previous pass showed that a
  // large flatten-to-constant becomes a visible bowl of contour rings.
  const shelfD = Math.sqrt(((x + 8) / 62) ** 2 + ((z - 4) / 48) ** 2)
    + (fbm2(x / 45, z / 45, seed + 118, 2) - 0.5) * 0.55;
  const shelf = smoothstep(1.05, 0.55, shelfD);
  if (shelf > 0) {
    const target = 13.0 + 1.2 * fbm2(x / 36, z / 36, seed + 119, 2) + x * 0.01;
    h = lerp(h, target, shelf * 0.78);
  }

  return Math.round(clamp(h, -14, 92));
}

function slopeAt(seed: number, x: number, z: number, h: number): number {
  return Math.max(
    Math.abs(h - surfaceHeightAt(seed, x - 1, z)),
    Math.abs(h - surfaceHeightAt(seed, x + 1, z)),
    Math.abs(h - surfaceHeightAt(seed, x, z - 1)),
    Math.abs(h - surfaceHeightAt(seed, x, z + 1)),
  );
}

function topMaterialAt(seed: number, x: number, z: number, h: number, slope: number, nearWater?: boolean): MatId {
  // River bed is gravel; the beach is a narrow sand band, not the whole
  // valley floor. The first pass marked every cell within 4 m of sea level
  // as sand, which produced a conspicuous pale strip along the river.
  if (riverDistance(x, z) < 12 && h < SEA_LEVEL + 1) return MAT.GRAVEL;
  if (h <= SEA_LEVEL + 0.5) return MAT.SAND;
  if (nearWater === undefined) {
    nearWater =
      surfaceHeightAt(seed, x - 3, z) < SEA_LEVEL + 1 ||
      surfaceHeightAt(seed, x + 3, z) < SEA_LEVEL + 1 ||
      surfaceHeightAt(seed, x, z - 3) < SEA_LEVEL + 1 ||
      surfaceHeightAt(seed, x, z + 3) < SEA_LEVEL + 1;
  }
  if (nearWater && h <= SEA_LEVEL + 1.5) return MAT.SAND;
  if (slope >= 3) return MAT.STONE;
  if (h > 58 && fbm2(x / 18, z / 18, seed + 120, 2) > 0.45) return MAT.STONE;
  if (h > 48 && slope >= 2) return MAT.STONE;
  if (h > 40 && slope >= 2 && fbm2(x / 12, z / 12, seed + 121, 2) > 0.55) return MAT.STONE;
  return MAT.GRASS;

}

/** Public base-material selector for macro LOD and tests. */
export function baseTopMaterial(
  seed: number, x: number, z: number, h: number, slope: number, nearWater: boolean,
): MatId {
  return topMaterialAt(seed, x, z, h, slope, nearWater);
}

function subsoilFor(top: MatId): MatId {
  if (top === MAT.GRASS || top === MAT.MOSS) return MAT.SOIL;
  if (top === MAT.SAND) return MAT.SAND;
  if (top === MAT.GRAVEL) return MAT.GRAVEL;
  return MAT.STONE;
}

function oreAt(seed: number, x: number, y: number, z: number): boolean {
  const cluster = fbm2(x / 55, z / 55, seed + 130, 2);
  if (cluster < 0.57) return false;
  const n = valueNoise3(x * 0.09, y * 0.13, z * 0.09, seed + 131);
  const n2 = valueNoise3(x * 0.22 + 5, y * 0.31, z * 0.22 - 3, seed + 132);
  return n > 0.70 && n2 > 0.50;
}

function caveAt(seed: number, x: number, y: number, z: number): boolean {
  return fbm3(x * 0.075, y * 0.11, z * 0.075, seed + 140, 2) > 0.72;
}

function overhangAt(seed: number, x: number, y: number, z: number): boolean {
  return valueNoise3(x * 0.18, y * 0.22, z * 0.18, seed + 141) > 0.62;
}

export interface SurfaceSample {
  y: number;
  top: MatId;
  slope: number;
}

/** Base surface sample for macro LOD. Does not include voxel edits/overhangs. */
export function sampleSurface(seed: number, x: number, z: number): SurfaceSample {
  const y = surfaceHeightAt(seed, x, z);
  const slope = slopeAt(seed, x, z, y);
  return { y, top: topMaterialAt(seed, x, z, y, slope), slope };
}

// ---------- chunk generation ----------
export function ensureChunk(world: World, cx: number, cz: number): VoxelChunk | null {
  if (cx < 0 || cz < 0 || cx >= CHUNKS_PER_SIDE || cz >= CHUNKS_PER_SIDE) return null;
  const key = chunkKey(cx, cz);
  const existing = world.chunks.get(key);
  if (existing) return existing;
  return generateChunk(world, cx, cz);
}

export function generateChunk(world: World, cx: number, cz: number): VoxelChunk | null {
  if (cx < 0 || cz < 0 || cx >= CHUNKS_PER_SIDE || cz >= CHUNKS_PER_SIDE) return null;
  const key = chunkKey(cx, cz);
  const existing = world.chunks.get(key);
  if (existing) return existing;

  const t0 = performance.now();
  const data = new Uint8Array(CHUNK_VOLUME);
  const heights = new Uint8Array(CHUNK_AREA);
  const topMaterials = new Uint8Array(CHUNK_AREA);
  const ox = chunkOriginX(cx), oz = chunkOriginZ(cz);
  const seed = world.seed;

  // Padded height cache: a three-cell border covers slope, beach and ledges.
  const P = 3;
  const PW = CHUNK_SIZE + P * 2;
  const baseH = new Int16Array(PW * PW);
  for (let pz = 0; pz < PW; pz++) {
    for (let px = 0; px < PW; px++) {
      baseH[pz * PW + px] = surfaceHeightAt(seed, ox + px - P, oz + pz - P);
    }
  }

  let nonAir = 0;
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = ox + lx, wz = oz + lz;
      const h = baseH[(lz + P) * PW + (lx + P)];
      const slope = Math.max(
        Math.abs(h - baseH[(lz + P) * PW + (lx + P - 1)]),
        Math.abs(h - baseH[(lz + P) * PW + (lx + P + 1)]),
        Math.abs(h - baseH[(lz + P - 1) * PW + (lx + P)]),
        Math.abs(h - baseH[(lz + P + 1) * PW + (lx + P)]),
      );
      const nearWater =
        baseH[(lz + P) * PW + (lx + P - 3)] < SEA_LEVEL + 1 ||
        baseH[(lz + P) * PW + (lx + P + 3)] < SEA_LEVEL + 1 ||
        baseH[(lz + P - 3) * PW + (lx + P)] < SEA_LEVEL + 1 ||
        baseH[(lz + P + 3) * PW + (lx + P)] < SEA_LEVEL + 1;
      const top = topMaterialAt(seed, wx, wz, h, slope, nearWater);
      const sub = subsoilFor(top);
      const orePotential = fbm2(wx / 55, wz / 55, seed + 130, 2) > 0.57;
      const col = lz * CHUNK_SIZE + lx;

      const start = Y_MIN;
      const end = Math.min(Y_MAX - 1, h - 1);
      for (let y = start; y <= end; y++) {
        const depth = h - 1 - y;
        let m: MatId;
        if (y === Y_MIN) m = MAT.BEDROCK;
        else if (depth === 0) m = top;
        else if (depth <= 2) m = sub;
        else m = MAT.STONE;

        if (m === MAT.STONE && depth > 4 && orePotential && oreAt(seed, wx, y, wz)) {
          m = MAT.ORE;
        }

        // Sparse 3D overhangs/undercuts at steep faces. This is a real
        // occupancy change, not a decoration on top of a heightfield.
        if (depth <= 2 && slope >= 2 && overhangAt(seed, wx, y, wz)) {
          m = MAT.AIR;
        }
        // Deep caves, kept away from the surface so they do not create holes.
        if (m !== MAT.AIR && depth > 7 && depth < 24 && caveAt(seed, wx, y, wz)) {
          m = MAT.AIR;
        }

        if (m !== MAT.AIR) {
          data[localIndex(lx, yToIndex(y), lz)] = m;
          nonAir++;
        }
      }

      // Water volume: everything above the solid surface up to sea level.
      if (h < SEA_LEVEL) {
        for (let y = Math.max(Y_MIN, h); y < SEA_LEVEL; y++) {
          const idx = localIndex(lx, yToIndex(y), lz);
          if (data[idx] === MAT.AIR) {
            data[idx] = MAT.WATER;
            nonAir++;
          }
        }
      }

      const topSolid = Math.min(Y_MAX - 1, Math.max(Y_MIN, h - 1));
      heights[col] = clamp(topSolid - Y_MIN, 0, WORLD_HEIGHT - 1);
      topMaterials[col] = top;
    }
  }

  // Protruding ledges: one or two stone blocks extend from a high column over
  // a lower neighbour. They create readable overhangs without a full cave pass.
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const h = baseH[(lz + P) * PW + (lx + P)];
      const slope = Math.max(
        Math.abs(h - baseH[(lz + P) * PW + (lx + P - 1)]),
        Math.abs(h - baseH[(lz + P) * PW + (lx + P + 1)]),
        Math.abs(h - baseH[(lz + P - 1) * PW + (lx + P)]),
        Math.abs(h - baseH[(lz + P + 1) * PW + (lx + P)]),
      );
      if (slope < 2) continue;
      const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dx, dz] of dirs) {
        const nx = lx + dx, nz = lz + dz;
        if (nx < 0 || nz < 0 || nx >= CHUNK_SIZE || nz >= CHUNK_SIZE) continue;
        const nh = baseH[(nz + P) * PW + (nx + P)];
        if (h - nh < 2) continue;
        if (hash3i(lx, lz, dx * 3 + dz * 7, seed + 150) < 0.55) continue;
        const y = h - 2;
        if (y < Y_MIN || y >= h) continue;
        const idx = localIndex(nx, yToIndex(y), nz);
        if (data[idx] === MAT.AIR) {
          data[idx] = MAT.STONE;
          nonAir++;
        }
      }
    }
  }

  // Recompute the column cache after ledges/caves. The exposed top material
  // must come from the actual top solid voxel, not the pre-carve guess.
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      let topSolid = Y_MIN;
      let topMat: number = topMaterials[lz * CHUNK_SIZE + lx];
      for (let y = Y_MAX - 1; y >= Y_MIN; y--) {
        const m = data[localIndex(lx, yToIndex(y), lz)];
        if (isSolid(m)) { topSolid = y; topMat = m; break; }
      }
      heights[lz * CHUNK_SIZE + lx] = clamp(topSolid - Y_MIN, 0, WORLD_HEIGHT - 1);
      topMaterials[lz * CHUNK_SIZE + lx] = topMat;
    }
  }

  const chunk: VoxelChunk = {
    cx, cz, key, data, heights, topMaterials, nonAir,
    dirty: true,
    generatedAt: performance.now(),
  };

  // Apply durable edits after base generation.
  const edits = world.edits.get(key);
  if (edits) {
    for (const [idx, m] of edits) {
      chunk.data[idx] = m;
    }
    // Recompute the cache for edited chunks.
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) updateColumnCache(chunk, lx, lz);
    }
  }
  // Non-air counts are derived renderer statistics, not durable world state.
  // Edited base air may become solid (and vice versa) during restoration.
  let editedNonAir = 0;
  for (const material of chunk.data) if (material !== MAT.AIR) editedNonAir++;
  world.stats.voxelsFilled += editedNonAir - nonAir;

  world.chunks.set(key, chunk);
  world.stats.chunksGenerated++;
  world.stats.voxelsFilled += nonAir;
  world.stats.generationMs += performance.now() - t0;
  world.dirty.add(key);

  generateEntities(world, chunk);
  return chunk;
}

/** A base-terrain cache shared by edited and unedited regeneration. Natural
 * scenery never depends on later voxel edits; this also lets a snapshot restore
 * a harvested chunk without materializing unrelated neighbouring chunks. */
const baseColumnCache = new WeakMap<World, Map<string, { heights: Uint8Array; topMaterials: Uint8Array }>>();

function baseColumns(world: World, chunk: VoxelChunk): { heights: Uint8Array; topMaterials: Uint8Array } {
  let cache = baseColumnCache.get(world);
  if (!cache) { cache = new Map(); baseColumnCache.set(world, cache); }
  const cached = cache.get(chunk.key);
  if (cached) return cached;
  const columns = { heights: new Uint8Array(chunk.heights), topMaterials: new Uint8Array(chunk.topMaterials) };
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const x = chunkOriginX(chunk.cx) + lx, z = chunkOriginZ(chunk.cz) + lz;
      const h = surfaceHeightAt(world.seed, x, z);
      const slope = slopeAt(world.seed, x, z, h);
      const index = lz * CHUNK_SIZE + lx;
      columns.heights[index] = clamp(h - Y_MIN, 0, WORLD_HEIGHT - 1);
      columns.topMaterials[index] = topMaterialAt(world.seed, x, z, h, slope);
    }
  }
  cache.set(chunk.key, columns);
  return columns;
}

export function evictChunk(world: World, key: string): boolean {
  if (!world.chunks.has(key)) return false;
  world.chunks.delete(key);
  world.stats.chunksEvicted++;
  // Chunk bytes and column caches are regenerated on demand. Entities remain
  // authoritative: eviction must not forget their persistent state.
  return true;
}

// ---------- queries / edits ----------
export function getVoxel(world: World, x: number, y: number, z: number): MatId {
  if (y < Y_MIN) return MAT.BEDROCK;
  if (y >= Y_MAX) return MAT.AIR;
  if (x < -HALF || z < -HALF || x >= HALF || z >= HALF) return MAT.AIR;
  const cx = worldToChunkX(x), cz = worldToChunkZ(z);
  const chunk = ensureChunk(world, cx, cz);
  if (!chunk) return MAT.AIR;
  return chunk.data[localIndex(worldToLocalX(x), yToIndex(y), worldToLocalZ(z))] as MatId;
}

export function setVoxel(world: World, x: number, y: number, z: number, m: MatId): boolean {
  if (y < Y_MIN || y >= Y_MAX) return false;
  if (x < -HALF || z < -HALF || x >= HALF || z >= HALF) return false;
  const cx = worldToChunkX(x), cz = worldToChunkZ(z);
  const idx = localIndex(worldToLocalX(x), yToIndex(y), worldToLocalZ(z));
  const previousEdit = world.edits.get(chunkKey(cx, cz))?.get(idx);
  // A chunk evicted after an earlier edit can regenerate with that durable
  // material already applied. Dropping the edit here would make it disappear
  // on the next eviction/restoration, even though the current write no-ops.
  if (previousEdit === m) return false;
  const chunk = ensureChunk(world, cx, cz);
  if (!chunk) return false;
  let edits = world.edits.get(chunk.key);
  if (!edits) { edits = new Map(); world.edits.set(chunk.key, edits); }
  // An idempotent write must still restore a durable delta discarded by an
  // older snapshot or delta decoder. It is not a new authoritative revision.
  if (chunk.data[idx] === m) {
    if (!edits.has(idx)) edits.set(idx, m);
    return false;
  }
  chunk.data[idx] = m;
  edits.set(idx, m);
  chunk.dirty = true;
  world.dirty.add(chunk.key);
  world.revision++;
  updateColumnCache(chunk, worldToLocalX(x), worldToLocalZ(z));
  return true;
}

function updateColumnCache(chunk: VoxelChunk, lx: number, lz: number): void {
  let topSolid = Y_MIN;
  for (let y = Y_MAX - 1; y >= Y_MIN; y--) {
    if (isSolid(chunk.data[localIndex(lx, yToIndex(y), lz)])) { topSolid = y; break; }
  }
  chunk.heights[lz * CHUNK_SIZE + lx] = clamp(topSolid - Y_MIN, 0, WORLD_HEIGHT - 1);
  const tm = chunk.topMaterials[lz * CHUNK_SIZE + lx];
  if (topSolid >= Y_MIN) {
    const m = chunk.data[localIndex(lx, yToIndex(topSolid), lz)];
    if (m !== MAT.WATER) chunk.topMaterials[lz * CHUNK_SIZE + lx] = m;
  } else {
    chunk.topMaterials[lz * CHUNK_SIZE + lx] = tm;
  }
}

/**
 * The y coordinate of the exposed top face of the solid column at x/z.
 * A solid voxel at y occupies [y, y+1), so the walkable surface is topSolid+1.
 * This is a derived query; the authoritative state remains the voxel volume.
 */
export function surfaceAt(world: World, x: number, z: number): number {
  if (x < -HALF || z < -HALF || x >= HALF || z >= HALF) return Y_MIN;
  const cx = worldToChunkX(x), cz = worldToChunkZ(z);
  const chunk = ensureChunk(world, cx, cz);
  if (!chunk) return Y_MIN;
  return chunk.heights[worldToLocalZ(z) * CHUNK_SIZE + worldToLocalX(x)] + Y_MIN + 1;
}

export function topMaterialAtWorld(world: World, x: number, z: number): MatId {
  if (x < -HALF || z < -HALF || x >= HALF || z >= HALF) return MAT.AIR;
  const cx = worldToChunkX(x), cz = worldToChunkZ(z);
  const chunk = ensureChunk(world, cx, cz);
  if (!chunk) return MAT.AIR;
  return chunk.topMaterials[worldToLocalZ(z) * CHUNK_SIZE + worldToLocalX(x)] as MatId;
}

export function heightAt(world: World, x: number, z: number): number {
  return surfaceAt(world, x, z);
}

export function waterDepthAt(world: World, x: number, z: number): number {
  const h = surfaceAt(world, x, z);
  return h < SEA_LEVEL ? SEA_LEVEL - h : 0;
}

// ---------- entities ----------
function addEntity(world: World, e: Entity): void {
  if (world.entities.has(e.id) || (isRetiredStoneKind(e.kind) && !isStoneReplay(world))
    || world.entityRemovals.has(e.id)) return;
  world.entities.set(e.id, e);
  let list = world.entityChunks.get(e.chunk);
  if (!list) { list = []; world.entityChunks.set(e.chunk, list); }
  list.push(e.id);
  world.stats.entities = world.entities.size;
  // Generation is deterministic and advances no player-command precondition.
  // Authored scaffolding may transiently change it; the snapshot restores the
  // saved revision after placing that scaffolding.
}

/**
 * Remove an entity from the authoritative world. Used when a site is cleared:
 * the resource yield is accounted for by the caller, and the entity must stop
 * existing for collision, obstruction and persistence, not just be hidden by
 * the renderer.
 */
export function removeEntity(world: World, id: string): boolean {
  const e = world.entities.get(id);
  if (!e || (isRetiredStoneKind(e.kind) && !isStoneReplay(world))) return false;
  world.entities.delete(id);
  const list = world.entityChunks.get(e.chunk);
  if (list) {
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) world.entityChunks.set(e.chunk, []);
  }
  world.entityChanges.add(e.chunk);
  if (!e.authored) world.entityRemovals.add(id);
  if (e.kind.startsWith('styl_tree')) world.stats.trees = Math.max(0, world.stats.trees - 1);
  if (e.kind === 'styl_tree_blossom') world.stats.pinkTrees = Math.max(0, world.stats.pinkTrees - 1);
  world.stats.entities = world.entities.size;
  world.revision++;
  return true;
}

function entityId(chunk: string, i: number): string {
  return `e:${chunk}:${i}`;
}

function forestScore(wx: number, wz: number, seed: number): number {
  const east = Math.exp(-(((wx - 220) / 260) ** 2 + ((wz + 110) / 220) ** 2));
  const north = Math.exp(-(((wx - 20) / 300) ** 2 + ((wz + 300) / 190) ** 2));
  const west = Math.exp(-(((wx + 340) / 200) ** 2 + ((wz - 120) / 180) ** 2));
  const south = Math.exp(-(((wx - 120) / 240) ** 2 + ((wz - 330) / 180) ** 2));
  const moisture = fbm2(wx / 260, wz / 260, seed + 201, 4);
  const valley = Math.exp(-((wx / 140) ** 2 + (wz / 105) ** 2));
  return Math.max(east, north * 0.92, west * 0.80, south * 0.78) * 0.82
    + moisture * 0.38 - 0.22 - valley * 0.34;
}

function rockScore(wx: number, wz: number, seed: number): number {
  const mountain = fbm2(wx / 330, wz / 330, seed + 202, 3);
  const ridge = 1 - Math.abs(2 * fbm2(wx / 140, wz / 140, seed + 203, 3) - 1);
  return mountain * 0.55 + ridge * 0.45;
}

function generateEntities(world: World, chunk: VoxelChunk): void {
  generateEntityChunk(world, chunk.cx, chunk.cz);
}

/** @internal Replays deterministic generation for snapshot entity deltas. */
export function generateEntityChunk(world: World, cx: number, cz: number): void {
  const key = chunkKey(cx, cz);
  if (world.entityChunks.has(key)) return;
  const chunk = ensureChunk(world, cx, cz);
  if (!chunk) return;

  const rnd = mulberry32((hash2i(chunk.cx, chunk.cz, world.seed + 900) * 4294967296) >>> 0);
  const ox = chunkOriginX(chunk.cx), oz = chunkOriginZ(chunk.cz);
  const columns = baseColumns(world, chunk);
  let n = 0;
  let naturalTrees = 0;
  let naturalPinkTrees = 0;

  const localSurface = (lx: number, lz: number): number => {
    return columns.heights[lz * CHUNK_SIZE + lx] + Y_MIN;
  };
  const localTop = (lx: number, lz: number): MatId => {
    return columns.topMaterials[lz * CHUNK_SIZE + lx] as MatId;
  };
  const localSlope = (lx: number, lz: number): number => {
    const h = localSurface(lx, lz);
    return Math.max(
      Math.abs(h - localSurface(clamp(lx - 1, 0, CHUNK_SIZE - 1), lz)),
      Math.abs(h - localSurface(clamp(lx + 1, 0, CHUNK_SIZE - 1), lz)),
      Math.abs(h - localSurface(lx, clamp(lz - 1, 0, CHUNK_SIZE - 1))),
      Math.abs(h - localSurface(lx, clamp(lz + 1, 0, CHUNK_SIZE - 1))),
    );
  };

  // A jittered 8 m lattice gives coherent masses and avoids per-frame scatter.
  for (let gz = 0; gz < CHUNK_SIZE; gz += 8) {
    for (let gx = 0; gx < CHUNK_SIZE; gx += 8) {
      const lx = clamp(Math.floor(gx + 2 + (rnd() - 0.5) * 5), 1, CHUNK_SIZE - 2);
      const lz = clamp(Math.floor(gz + 2 + (rnd() - 0.5) * 5), 1, CHUNK_SIZE - 2);
      const wx = ox + lx, wz = oz + lz;
      const h = localSurface(lx, lz);
      if (h <= SEA_LEVEL + 1) continue;
      const slope = localSlope(lx, lz);
      const top = localTop(lx, lz);
      if (top === MAT.WATER) continue;
      const forest = forestScore(wx, wz, world.seed);
      const rocky = rockScore(wx, wz, world.seed);
      const roll = rnd();

      const treeChance = forest > 0.50 ? 0.72 : forest > 0.30 ? 0.25 : 0.05;
      if (top === MAT.GRASS && slope <= 2 && roll < treeChance) {
        // The cap is a deterministic natural-generation property. It cannot
        // depend on which chunks a renderer loaded before this one.
        let kind: EntityKind;
        let variant: number;
        const speciesRoll = rnd();
        if (speciesRoll < 0.12) {
          if ((naturalPinkTrees + 1) > 0.25 * (naturalTrees + 1)) {
            kind = 'styl_tree_cluster';
            variant = Math.floor(rnd() * 3);
            world.stats.pinkOverflow++;
          } else {
            kind = 'styl_tree_blossom';
            variant = Math.floor(rnd() * 2);
            naturalPinkTrees++;
            world.stats.pinkTrees++;
          }
        } else if (speciesRoll < 0.40) {
          kind = 'styl_tree_spire';
          variant = Math.floor(rnd() * 4);
        } else if (speciesRoll < 0.74) {
          kind = 'styl_tree_table';
          variant = Math.floor(rnd() * 4);
        } else {
          kind = 'styl_tree_cluster';
          variant = Math.floor(rnd() * 3);
        }
        naturalTrees++;
        world.stats.trees++;
        addEntity(world, {
          id: entityId(chunk.key, n++),
          kind, chunk: chunk.key, x: wx + 0.5, y: h, z: wz + 0.5,
          rot: Math.floor(rnd() * 24) * (Math.PI / 12),
          scale: 0.88 + rnd() * 0.24, variant,
          resource: 'wood', remaining: 12, yieldPerHarvest: 4,
          harvested: false, provisional: true, authored: false,
        });
        continue;
      }
      if (top === MAT.GRASS && rocky > 0.46 && roll < 0.38) {
        // Consume the retired stone form's random draws and allocate its old
        // sequence ID, but do not insert an entity. Later natural placements
        // therefore remain byte-for-byte compatible with recorded saves.
        const sizeRoll = rnd();
        const kind: EntityKind = sizeRoll < 0.55 ? 'styl_rock_small'
          : sizeRoll < 0.90 ? 'styl_rock_medium' : 'styl_rock_large';
        const id = entityId(chunk.key, n++);
        const record = {
          id, kind, chunk: chunk.key, x: wx + 0.5, y: h, z: wz + 0.5,
          resource: 'stone' as const,
          remaining: kind === 'styl_rock_small' ? 4 : kind === 'styl_rock_medium' ? 8 : 12,
          yieldPerHarvest: 3, harvested: false, provisional: true, authored: false,
          rot: Math.floor(rnd() * 24) * (Math.PI / 12),
          scale: 0.9 + rnd() * 0.2, variant: Math.floor(rnd() * 3),
        };
        // Only entities that existed in an accepted old save get tombstones,
        // during explicit migration. Ordinary generation must restore exactly.
        if (isStoneReplay(world)) addEntity(world, record);
        continue;
      }
      if (top === MAT.STONE && rocky > 0.58 && roll < 0.18) {
        addEntity(world, {
          id: entityId(chunk.key, n++),
          kind: 'styl_ore', chunk: chunk.key, x: wx + 0.5, y: h, z: wz + 0.5,
          rot: Math.floor(rnd() * 24) * (Math.PI / 12),
          scale: 0.9 + rnd() * 0.2, variant: Math.floor(rnd() * 2),
          resource: 'ore', remaining: 8, yieldPerHarvest: 2,
          harvested: false, provisional: true, authored: false,
        });
        continue;
      }
      if (top === MAT.GRASS && slope <= 1 && roll < 0.30) {
        addEntity(world, {
          id: entityId(chunk.key, n++),
          kind: 'styl_shrub', chunk: chunk.key, x: wx + 0.5, y: h, z: wz + 0.5,
          rot: Math.floor(rnd() * 24) * (Math.PI / 12),
          scale: 0.8 + rnd() * 0.4, variant: Math.floor(rnd() * 3),
          resource: 'fiber', remaining: 4, yieldPerHarvest: 1,
          harvested: false, provisional: true, authored: false,
        });
      }
    }
  }
}

function addAuthoredEntity(world: World, kind: EntityKind, x: number, z: number, variant: number, rot: number, scale: number, resource: ResourceType | null, remaining: number, yieldPerHarvest: number): void {
  const y = surfaceAt(world, x, z);
  if (y <= SEA_LEVEL) return;
  const cx = worldToChunkX(x), cz = worldToChunkZ(z);
  const key = chunkKey(cx, cz);
  // A hero asset owns its spot: clear any generated entity that would overlap
  // it, rather than silently dropping the authored composition.
  const ids = world.entityChunks.get(key) ?? [];
  if (isRetiredStoneKind(kind) && !isStoneReplay(world)) return;
  for (const id of ids) {
    const e = world.entities.get(id);
    if (e && Math.hypot(e.x - x, e.z - z) < 2.6) {
      world.entities.delete(id);
      if (e.kind.startsWith('styl_tree')) world.stats.trees = Math.max(0, world.stats.trees - 1);
      if (e.kind === 'styl_tree_blossom') world.stats.pinkTrees = Math.max(0, world.stats.pinkTrees - 1);
    }
  }
  world.entityChunks.set(key, ids.filter((id) => world.entities.has(id)));
  // Authored composition is durable state: it can clear overlapping natural
  // entities, so save the complete affected chunk rather than only its heroes.
  world.entityChanges.add(key);

  const id = `hero:${kind}:${Math.round(x)}:${Math.round(z)}`;
  const before = world.entities.size;
  const entity: Entity = {
    id, kind, chunk: key, x: x + 0.5, y, z: z + 0.5,
    rot, scale, variant, resource, remaining, yieldPerHarvest,
    harvested: false, provisional: true, authored: true,
  };
  addEntity(world, entity);
  if (world.entities.size > before && kind.startsWith('styl_tree')) {
    world.stats.trees++;
    if (kind === 'styl_tree_blossom') world.stats.pinkTrees++;
  }
}

export function placeAuthoredSites(world: World): void {
  if (world.authoredPlaced) return;
  world.authoredPlaced = true;

  const sites: Array<{ kind: 'waystone' | 'marker'; x: number; z: number; rot: number }> = [
    { kind: 'waystone', x: -10, z: -14, rot: 0 },
    { kind: 'marker', x: -32, z: -8, rot: Math.PI / 2 },
  ];
  for (const s of sites) {
    const y = surfaceAt(world, s.x, s.z);
    if (y <= SEA_LEVEL) continue;
    world.sites.push({
      id: `site:${s.kind}`,
      kind: s.kind,
      x: s.x + 0.5, y, z: s.z + 0.5,
      rot: s.rot,
      provisional: true,
    });
  }

  // A hero grove composed in the default camera's view direction. These are
  // Styl natural assets (AS-001 v2), not Noxel architecture; the Noxel
  // waystone/marker above remain the human-made landmarks.
  const grove: Array<[EntityKind, number, number, number, number, number]> = [
    ['styl_tree_spire', -22, -26, 0, 1.00, 0],
    ['styl_tree_table', -34, -18, 1, 0.95, Math.PI / 12],
    ['styl_tree_cluster', -16, -34, 2, 1.00, Math.PI / 6],
    ['styl_tree_blossom', -28, -38, 0, 0.90, Math.PI / 4],
    ['styl_tree_table', -40, -30, 2, 1.05, Math.PI / 3],
    ['styl_tree_cluster', -12, -24, 0, 0.90, Math.PI / 2.4],
  ];
  for (const [kind, x, z, variant, scale, rot] of grove) {
    addAuthoredEntity(world, kind, x, z, variant, rot, scale, 'wood', 12, 4);
  }
  addAuthoredEntity(world, 'styl_rock_medium', -6, -10, 0, 0, 1.0, 'stone', 8, 3);
  addAuthoredEntity(world, 'styl_shrub', -14, -8, 1, Math.PI / 12, 1.1, 'fiber', 4, 1);
  addAuthoredEntity(world, 'styl_cairn', -20, -6, 0, 0, 1.0, 'stone', 6, 2);
  addAuthoredEntity(world, 'styl_ore', -38, -42, 0, Math.PI / 4, 1.1, 'ore', 8, 2);
}

export function nearestHarvestable(
  world: World, x: number, z: number, radius: number, resource?: ResourceType,
): Entity | null {
  let best: Entity | null = null;
  let bestD = radius * radius;
  for (const e of world.entities.values()) {
    if (isRetiredStoneKind(e.kind) || world.entityRemovals.has(e.id)
      || e.harvested || !e.resource || e.remaining <= 0) continue;
    if (resource && e.resource !== resource) continue;
    const d = (e.x - x) ** 2 + (e.z - z) ** 2;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

export interface HarvestResult { entity: Entity; resource: ResourceType; amount: number; }

export function harvestEntity(world: World, id: string): HarvestResult | null {
  const e = liveEntity(world, id);
  if (!e || e.harvested || !e.resource || e.remaining <= 0) return null;
  const amount = Math.min(e.yieldPerHarvest, e.remaining);
  if (world.life && Object.values(world.inventory).reduce((sum, n) => sum + n, 0) + amount > 120) return null;
  e.remaining -= amount;
  if (!e.authored) world.entityChanges.add(e.chunk);
  e.harvestedOnce = true;
  if (e.remaining <= 0) e.harvested = true;
  world.inventory[e.resource] = (world.inventory[e.resource] ?? 0) + amount;
  world.revision++;
  return { entity: e, resource: e.resource, amount };
}

/** Remove every retired source after verified historical replay. This migration
 * creates deterministic tombstones but is not a player command or revision. */
export function retireStoneEntities(world: World): void {
  for (const e of [...world.entities.values()]) {
    if (!isRetiredStoneKind(e.kind)) continue;
    world.entities.delete(e.id);
    if (!e.authored) world.entityRemovals.add(e.id);
    world.entityChanges.add(e.chunk);
    if (!world.entityChunks.has(e.chunk)) world.entityChunks.set(e.chunk, []);
  }
  for (const [key, ids] of world.entityChunks) {
    const active = ids.filter((id) => world.entities.has(id));
    if (active.length > 0 || world.entityChanges.has(key)) world.entityChunks.set(key, active);
    else world.entityChunks.delete(key);
  }
  world.stats.entities = world.entities.size;
}

// ---------- persistence / authority boundary ----------
export interface WorldManifest {
  schema: 1;
  seed: number;
  generatorVersion: number;
  size: number;
  chunkSize: number;
  yMin: number;
  yMax: number;
  seaLevel: number;
  paramsHash: string;
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function worldManifest(world: World): WorldManifest {
  const p = world.params;
  return {
    schema: 1,
    seed: world.seed,
    generatorVersion: p.generatorVersion,
    size: p.size,
    chunkSize: p.chunkSize,
    yMin: p.yMin,
    yMax: p.yMax,
    seaLevel: p.seaLevel,
    paramsHash: fnv1a(JSON.stringify(p)),
  };
}

export interface VoxelEdit { i: number; m: number; }
export interface ChunkDelta {
  schema: 1;
  key: string;
  baseVersion: number;
  edits: VoxelEdit[];
}

export function exportChunkDelta(world: World, key: string): ChunkDelta {
  const edits = world.edits.get(key);
  return {
    schema: 1,
    key,
    baseVersion: world.params.generatorVersion,
    edits: edits ? [...edits.entries()].map(([i, m]) => ({ i, m })).sort((a, b) => a.i - b.i) : [],
  };
}

export function applyChunkDelta(world: World, delta: ChunkDelta): void {
  const [cx, cz] = delta.key.split(',').map(Number);
  for (const e of delta.edits) {
    const yIndex = Math.floor(e.i / CHUNK_AREA);
    const rem = e.i % CHUNK_AREA;
    const lz = Math.floor(rem / CHUNK_SIZE);
    const lx = rem % CHUNK_SIZE;
    const x = chunkOriginX(cx) + lx;
    const y = Y_MIN + yIndex;
    const z = chunkOriginZ(cz) + lz;
    setVoxel(world, x, y, z, e.m as MatId);
  }
}

// ---------- time ----------
export interface TimeState { t: number; dayLengthSec: number; paused: boolean; }

export function advanceTime(s: TimeState, dt: number): void {
  if (s.paused) return;
  s.t = (s.t + dt / s.dayLengthSec) % 1;
}
