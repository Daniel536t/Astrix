// Ground vegetation: grass tufts, flowers, ferns, small stones, fallen logs,
// mushrooms and forest understory (bushes and saplings) near the view.
//
// Render-only decoration. Nothing here is a simulation entity: it is never
// saved, never harvested, has no collider and is not inspectable. Placement
// is a pure function of (seed, chunk, voxel surface, exclusion zones) drawn
// from its own hash stream (GROUND_COVER_SALT), so it never touches the
// generation RNG and cannot change saves or state hashes. Every lattice cell
// consumes the same number of draws whether or not it places a piece, so an
// exclusion zone appearing (a new field) never reshuffles the rest.
//
// Drawing: every piece inside GROUND_COVER_RADIUS of the view focus is baked
// into ONE merged mesh (one draw call on every GPU, with or without
// WEBGL_multi_draw) that casts no shadow and receives shadows. Pieces are
// built from the vegetation kit's plain-colour boxes; understory bushes and
// saplings reuse the FEAT-002 bush and sapling plans.
import * as THREE from 'three';
import palette from '../data/palette.json';
import {
  CHUNKS_PER_SIDE, CHUNK_SIZE, MAT, SEA_LEVEL, World, Y_MAX, Y_MIN, chunkKey, chunkOriginX, chunkOriginZ, editVersion,
  forestScore, localIndex, rockScore, worldToChunkX, worldToChunkZ, yToIndex,
} from '../sim/world';
import { hash2i, mulberry32 } from '../sim/noise';
import { DM, fieldRect, homesteadLayout } from '../sim/homestead';
import { M002_LAYOUT } from '../sim/m002';
import { FOUNDER_STOCKPILE } from '../sim/economy';
import { OBSTRUCTION_RADIUS } from '../sim/terrain';
import { Block, FACE_NY, FACE_PY, blocksGeometry, planBlocks, vegetationPlan } from './vegetation-kit';
import { LOD_NEAR } from './lod';
import type { BushSpecies, TreeSpecies } from '../sim/vegetation';

/** Salt of the decoration hash stream; distinct from every generation salt. */
export const GROUND_COVER_SALT = 0x6c3a1;
/** Pieces farther than this from the view focus (m) are not drawn. */
export const GROUND_COVER_RADIUS = 52;
/** Lattice spacing (m): one candidate piece per cell. */
export const GROUND_COVER_CELL = 2;
/** Rebuild the merged mesh after the focus moved this far (m). */
export const GROUND_COVER_MOVE = 6;
/** Ground (m) the cover disc keeps beyond the bottom screen edge. */
export const GROUND_COVER_NEAR_MARGIN = 8;

/**
 * Offset (m) of the ground-cover focus along the horizontal view direction
 * from the view target, for a view whose bottom screen edge meets the ground
 * at `nearOffset` (see viewGroundOffset; negative = toward the camera). Close
 * views keep the disc on the target (offset 0). At long zoom the disc slides
 * toward the camera so the nearest, largest ground on screen keeps its cover
 * (review v1: it used to sit around the target, leaving the foreground bare).
 */
export function groundCoverOffset(nearOffset: number, radius = GROUND_COVER_RADIUS): number {
  return Math.min(0, nearOffset + radius - GROUND_COVER_NEAR_MARGIN);
}

export type CoverKind = 'grass' | 'flower' | 'fern' | 'stone' | 'log' | 'mushroom' | 'bush' | 'sapling';
export const COVER_KINDS: readonly CoverKind[] = ['grass', 'flower', 'fern', 'stone', 'log', 'mushroom', 'bush', 'sapling'];

export interface CoverPiece {
  kind: CoverKind;
  /** Geometry key (kind:variant). */
  model: string;
  x: number; y: number; z: number;
  rot: number;
  scale: number;
  /** Footprint radius (m) used for exclusion. */
  radius: number;
}

const M = palette.materials as Record<string, { hex: string }>;
const H = (k: string) => M[k].hex;

// ---------- piece models (bottom = y 0, no bottom faces) ----------

const NO_BOTTOM = FACE_NY;
const b = (hex: string, w: number, h: number, d: number, x = 0, y = 0, z = 0, omit = NO_BOTTOM, k = 1): Block =>
  ({ x, y: y + h / 2, z, w, h, d, hex, omit, k });

const BUSHES: BushSpecies[] = ['leafy_bush', 'berry_bush', 'fern_clump'];
const SAPLINGS: TreeSpecies[] = ['spruce', 'beech', 'birch', 'pine'];

/** Variants per kind. */
export const COVER_VARIANTS: Record<CoverKind, number> = {
  grass: 3, flower: 3, fern: 2, stone: 3, log: 2, mushroom: 2, bush: 3, sapling: 4,
};

/** Footprint radius per kind (m), before scale. */
const COVER_RADIUS: Record<CoverKind, number> = {
  grass: 0.25, flower: 0.15, fern: 0.6, stone: 0.3, log: 1.2, mushroom: 0.2, bush: 0.8, sapling: 0.6,
};

function coverBlocks(kind: CoverKind, v: number): Block[] {
  switch (kind) {
    case 'grass': {
      const [g, gH, gC] = [H('grass_top'), H('grass_high'), H('fern_green_b')];
      if (v === 0) return [b(gC, 0.34, 0.16, 0.3), b(gH, 0.08, 0.42, 0.08, 0.06, 0.1, 0.02)];
      if (v === 1) return [b(g, 0.1, 0.36, 0.1, -0.08, 0, 0.04), b(gH, 0.08, 0.5, 0.08, 0.07, 0, -0.05), b(gC, 0.09, 0.28, 0.09, 0.02, 0, 0.12)];
      return [b(gC, 0.42, 0.12, 0.38), b(g, 0.26, 0.24, 0.2, 0.03, 0.06, 0)];
    }
    case 'flower': {
      const head = [H('flower_yellow'), H('flower_white'), H('flower_violet')][v];
      const stem = H('fern_green_b');
      return [
        b(stem, 0.05, 0.34, 0.05, 0, 0, 0, NO_BOTTOM | FACE_PY),
        b(head, 0.16, 0.09, 0.16, 0, 0.34, 0),
        b(H('grass_top'), 0.22, 0.08, 0.12, 0.08, 0, 0.02),
      ];
    }
    case 'fern': {
      const [f, fB] = [H('fern_green'), H('fern_green_b')];
      if (v === 0) return [b(fB, 1.1, 0.1, 0.24, 0, 0.12), b(f, 0.24, 0.1, 1.1, 0, 0.16)];
      return [b(f, 0.9, 0.1, 0.22, 0.05, 0.1, 0.1), b(fB, 0.22, 0.1, 0.8, -0.1, 0.18, 0), b(fB, 0.22, 0.26, 0.22)];
    }
    case 'stone': {
      const [s, sB] = [H('stone_body_a'), H('stone_body_b')];
      if (v === 0) return [b(s, 0.42, 0.2, 0.34)];
      if (v === 1) return [b(sB, 0.3, 0.16, 0.26, -0.1, 0, 0), b(s, 0.2, 0.12, 0.18, 0.16, 0, 0.1)];
      return [b(s, 0.6, 0.26, 0.46), b(sB, 0.3, 0.12, 0.26, 0.08, 0.26, -0.04)];
    }
    case 'log': {
      const [t, d, moss] = [H('trunk'), H('bark_dark'), H('moss_green')];
      const len = v === 0 ? 2.2 : 1.6;
      const out = [b(t, len, 0.36, 0.36), b(moss, len * 0.55, 0.06, 0.26, -len * 0.12, 0.36, 0)];
      out.push(b(d, 0.1, 0.4, 0.4, len / 2 + 0.05, 0, 0, NO_BOTTOM | FACE_NY));
      if (v === 0) out.push(b(d, 0.12, 0.12, 0.42, 0.3, 0.2, 0.36));
      return out;
    }
    case 'mushroom': {
      const [cap, stem] = [H('mushroom_cap'), H('mushroom_stem')];
      const one = (x: number, z: number, s: number) => [
        b(stem, 0.07 * s, 0.13 * s, 0.07 * s, x, 0, z, NO_BOTTOM | FACE_PY),
        b(cap, 0.22 * s, 0.08 * s, 0.22 * s, x, 0.13 * s, z),
      ];
      return v === 0 ? one(0, 0, 1.1) : [...one(-0.08, 0.02, 1), ...one(0.12, -0.06, 0.7)];
    }
    case 'bush':
      return planBlocks(vegetationPlan(BUSHES[v], 'sapling', v), LOD_NEAR);
    case 'sapling':
      return planBlocks(vegetationPlan(SAPLINGS[v], 'sapling', v % 3), LOD_NEAR);
  }
}

const coverGeometryCache = new Map<string, THREE.BufferGeometry>();

/** Geometry of one piece model (cached; pure function of kind and variant). */
export function coverGeometry(model: string): THREE.BufferGeometry {
  let g = coverGeometryCache.get(model);
  if (!g) {
    const [kind, v] = model.split(':');
    g = blocksGeometry(coverBlocks(kind as CoverKind, Number(v)));
    coverGeometryCache.set(model, g);
  }
  return g;
}

export function coverTriangles(model: string): number {
  return coverGeometry(model).attributes.position.count / 3;
}

// ---------- exclusion zones (read-only views of sim state) ----------

interface Rect { x0: number; z0: number; x1: number; z1: number }
interface Disc { x: number; z: number; r: number }

export interface CoverExclusions {
  rects: Rect[];
  discs: Disc[];
  /**
   * Entities per chunk key (trees, shrubs, ore, cairns), for trunk clearance.
   * M015: read on demand from world.entityChunks (the index collision and nav
   * use), so it is always current and nothing indexes every entity when
   * streamed chunks add theirs.
   */
  entities: { get(chunk: string): Disc[] | undefined; clear(): void };
  /** Cache key: changes when any exclusion input changes. */
  key: string;
}

const inWorld = (cx: number, cz: number) => cx >= 0 && cz >= 0 && cx < CHUNKS_PER_SIDE && cz < CHUNKS_PER_SIDE;
const pad = (r: Rect, m: number): Rect => ({ x0: r.x0 - m, z0: r.z0 - m, x1: r.x1 + m, z1: r.z1 + m });

/**
 * Exclusion zones from authoritative state: homestead buildings, enclosures
 * and fields, the founder store and barn, the M002 settlement sites and
 * paths, built structures and Noxel sites, and every natural entity's
 * obstruction radius. Edited voxel columns are excluded per chunk.
 */
export function coverExclusions(world: World): CoverExclusions {
  const rects: Rect[] = [];
  const discs: Disc[] = [];
  const h = world.homestead;
  if (h) {
    for (const f of homesteadLayout(h)) {
      rects.push(pad({ x0: f.rect.x0 / DM, z0: f.rect.z0 / DM, x1: f.rect.x1 / DM, z1: f.rect.z1 / DM }, 1));
    }
    for (const p of h.plots) {
      const r = fieldRect(p);
      rects.push(pad({ x0: r.x0 / DM, z0: r.z0 / DM, x1: r.x1 / DM, z1: r.z1 / DM }, 0.8));
    }
  }
  // Founder store and the barn beside it.
  rects.push({ x0: FOUNDER_STOCKPILE.x - 4, z0: FOUNDER_STOCKPILE.z - 4, x1: FOUNDER_STOCKPILE.x + 8, z1: FOUNDER_STOCKPILE.z + 4 });
  for (const r of M002_LAYOUT.envelope) rects.push({ x0: r.x0, z0: r.z0, x1: r.x1 + 1, z1: r.z1 + 1 });
  for (const s of world.structures.values()) discs.push({ x: s.x, z: s.z, r: 6 });
  for (const s of world.sites) discs.push({ x: s.x, z: s.z, r: (OBSTRUCTION_RADIUS[s.kind] ?? 1) + 0.6 });

  // Memoised per chunk until clear() (GroundCoverView clears it at every update).
  const memo = new Map<string, Disc[] | undefined>();
  const entities = {
    clear(): void { memo.clear(); },
    get(chunk: string): Disc[] | undefined {
      if (memo.has(chunk)) return memo.get(chunk);
      const ids = world.entityChunks.get(chunk);
      if (!ids) { memo.set(chunk, undefined); return undefined; }
      const list: Disc[] = [];
      for (const id of ids) {
        const e = world.entities.get(id);
        if (!e || e.chunk !== chunk) continue;
        list.push({ x: e.x, z: e.z, r: (OBSTRUCTION_RADIUS as Record<string, number>)[e.kind] ?? 1 });
      }
      memo.set(chunk, list);
      return list;
    },
  };
  return { rects, discs, entities, key: coverExclusionKey(world) };
}

/** Cheap fingerprint of every exclusion input except the entity list. */
export function coverExclusionKey(world: World): string {
  const h = world.homestead;
  return `e${editVersion(world)}|s${world.structures.size}|n${world.sites.length}`
    + (h ? `|h${h.anchorX},${h.anchorZ}:${h.plots.map((p) => `${p.x},${p.z},${p.w},${p.d}`).join(';')}` : '');
}

function excluded(ex: CoverExclusions, cx: number, cz: number, x: number, z: number, r: number): boolean {
  for (const q of ex.rects) if (x + r > q.x0 && x - r < q.x1 && z + r > q.z0 && z - r < q.z1) return true;
  for (const d of ex.discs) if ((x - d.x) ** 2 + (z - d.z) ** 2 < (d.r + r) ** 2) return true;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const list = ex.entities.get(chunkKey(cx + dx, cz + dz));
      if (!list) continue;
      for (const d of list) if ((x - d.x) ** 2 + (z - d.z) ** 2 < (d.r + r) ** 2) return true;
    }
  }
  return false;
}

// ---------- placement ----------

type Weights = Array<[CoverKind, number]>;
const FOREST: Weights = [['fern', 30], ['grass', 22], ['mushroom', 12], ['bush', 8], ['sapling', 6], ['stone', 8], ['log', 7], ['flower', 7]];
const EDGE: Weights = [['grass', 35], ['fern', 20], ['flower', 15], ['bush', 10], ['stone', 8], ['mushroom', 6], ['sapling', 4], ['log', 2]];
const MEADOW: Weights = [['grass', 55], ['flower', 30], ['stone', 8], ['fern', 7]];

function pick(weights: Weights, roll: number): CoverKind {
  let total = 0;
  for (const [, w] of weights) total += w;
  let t = roll * total;
  for (const [k, w] of weights) { t -= w; if (t < 0) return k; }
  return weights[weights.length - 1][0];
}

/** Presence probability per lattice cell by biome. */
export function coverDensity(forest: number, stoneTop: boolean): number {
  if (stoneTop) return 0.12;
  return forest > 0.5 ? 0.28 : 0.26;
}

export interface ChunkSurface {
  heights: Uint8Array;
  topMaterials: Uint8Array;
  data: Uint8Array;
}

/**
 * Deterministic decoration of one chunk. Pure: depends only on the seed,
 * chunk coordinates, the chunk's voxel surface and the exclusion zones; never
 * on which other chunks are loaded or the order they loaded in.
 */
export function groundCoverChunk(
  seed: number, cx: number, cz: number, chunk: ChunkSurface, ex: CoverExclusions,
  editedColumns: ReadonlySet<number> | null = null,
): CoverPiece[] {
  const rnd = mulberry32((hash2i(cx, cz, seed + GROUND_COVER_SALT) * 4294967296) >>> 0);
  const ox = chunkOriginX(cx), oz = chunkOriginZ(cz);
  const out: CoverPiece[] = [];
  const surf = (lx: number, lz: number) => chunk.heights[lz * CHUNK_SIZE + lx];
  const cells = CHUNK_SIZE / GROUND_COVER_CELL;
  for (let gz = 0; gz < cells; gz++) {
    for (let gx = 0; gx < cells; gx++) {
      // Fixed draws per cell: placement elsewhere never depends on rejections here.
      const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd(), r5 = rnd(), r6 = rnd();
      const fx = gx * GROUND_COVER_CELL + 0.2 + r1 * (GROUND_COVER_CELL - 0.4);
      const fz = gz * GROUND_COVER_CELL + 0.2 + r2 * (GROUND_COVER_CELL - 0.4);
      const lx = Math.floor(fx), lz = Math.floor(fz);
      const col = lz * CHUNK_SIZE + lx;
      if (editedColumns?.has(col)) continue;
      const enc = chunk.heights[col];
      if (enc === 0) continue;
      const topY = enc + Y_MIN; // top solid voxel
      const y = topY + 1;
      if (y <= SEA_LEVEL || y >= Y_MAX) continue;
      // Never on or under water.
      const above = chunk.data[localIndex(lx, yToIndex(y), lz)];
      if (above !== MAT.AIR) continue;
      const top = chunk.topMaterials[col];
      const soft = top === MAT.GRASS || top === MAT.SOIL || top === MAT.MOSS;
      const stoneTop = top === MAT.STONE || top === MAT.GRAVEL;
      if (!soft && !stoneTop) continue;
      let slope = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = Math.min(CHUNK_SIZE - 1, Math.max(0, lx + dx)), nz = Math.min(CHUNK_SIZE - 1, Math.max(0, lz + dz));
        slope = Math.max(slope, Math.abs(surf(nx, nz) - enc));
      }
      if (slope > 1) continue;
      const wx = ox + fx, wz = oz + fz;
      const forest = forestScore(wx, wz, seed);
      if (r3 >= coverDensity(forest, stoneTop)) continue;
      let kind: CoverKind;
      if (stoneTop) kind = 'stone';
      else if (forest > 0.5) kind = pick(FOREST, r4);
      else if (forest > 0.3) kind = pick(EDGE, r4);
      else kind = rockScore(wx, wz, seed) > 0.6 && r4 < 0.3 ? 'stone' : pick(MEADOW, r4);
      // Logs and saplings need flat ground.
      if ((kind === 'log' || kind === 'sapling' || kind === 'bush') && slope > 0) kind = 'fern';
      const variant = Math.floor(r5 * COVER_VARIANTS[kind]);
      const scale = 0.8 + r6 * 0.4;
      const radius = COVER_RADIUS[kind] * scale;
      if (excluded(ex, cx, cz, wx, wz, radius)) continue;
      out.push({ kind, model: `${kind}:${variant}`, x: wx, y, z: wz, rot: Math.floor(r5 * 997) % 24 * (Math.PI / 12), scale, radius });
    }
  }
  return out;
}

/** Edited voxel columns of a chunk (local column index), or null when unedited. */
export function editedColumnsOf(world: World, key: string): Set<number> | null {
  const edits = world.edits.get(key);
  if (!edits || edits.size === 0) return null;
  const cols = new Set<number>();
  for (const index of edits.keys()) cols.add(index % (CHUNK_SIZE * CHUNK_SIZE));
  return cols;
}

// ---------- the view ----------

export const groundCoverMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

interface ChunkCover { pieces: CoverPiece[] }

export interface GroundCoverMetrics {
  pieces: number;
  triangles: number;
  chunks: number;
  rebuilds: number;
  /** Ring chunks waiting for their neighbourhood. */
  pending: number;
  byKind: Record<string, number>;
}

/**
 * Owns the ground-cover mesh. Per-chunk placements are cached and only
 * recomputed when a chunk first comes into the ring or an exclusion input
 * changes; the merged mesh is rebuilt when the focus moves GROUND_COVER_MOVE
 * metres or the chunk set changes, never every frame.
 */
export class GroundCoverView {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  private readonly cache = new Map<string, ChunkCover>();
  private exclusionKey = '';
  private exclusions: CoverExclusions | null = null;
  private lastFocus = new THREE.Vector3(Infinity, 0, Infinity);
  private chunkSignature = '';
  /** Chunks in the ring whose neighbourhood was not ready at the last rebuild. */
  private pending = 0;
  private lastRebuildAt = -Infinity;
  private stats: GroundCoverMetrics = { pieces: 0, triangles: 0, chunks: 0, rebuilds: 0, pending: 0, byKind: {} };

  /** Drawing radius (m); M015 quality levels shorten it (presentation only). */
  readonly radius: number;
  /**
   * M015: main-thread milliseconds per update for placing newly entered
   * chunks (at least one chunk per update). While chunks wait, the previous
   * mesh stays and the merge runs once when they are all placed. Default:
   * unlimited (everything in one update, as before).
   */
  budgetMs: number;
  /** Chunks whose placements were deferred by the budget at the last update. */
  deferred = 0;

  constructor(private readonly world: World, options: { radius?: number; budgetMs?: number } = {}) {
    this.radius = options.radius ?? GROUND_COVER_RADIUS;
    this.budgetMs = options.budgetMs ?? Infinity;
    this.group.name = 'ground_cover';
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), groundCoverMaterial);
    this.mesh.name = 'ground_cover_batch';
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
    // Decoration is never picked by the inspector or anything else.
    this.mesh.raycast = () => {};
    this.group.add(this.mesh);
  }

  /** Cached placements for a loaded chunk (computes them on first use). */
  private chunkCover(key: string, ex: CoverExclusions): ChunkCover | null {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const chunk = this.world.chunks.get(key);
    if (!chunk) return null;
    // Trunk clearance reads the 3x3 neighbourhood's entities; wait until they
    // exist so the result never depends on load order.
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = chunkKey(chunk.cx + dx, chunk.cz + dz);
        if (!this.world.chunks.has(n) && !this.world.entityChunks.has(n) && inWorld(chunk.cx + dx, chunk.cz + dz)) return null;
      }
    }
    const cover = { pieces: groundCoverChunk(this.world.seed, chunk.cx, chunk.cz, chunk, ex, editedColumnsOf(this.world, key)) };
    this.cache.set(key, cover);
    return cover;
  }

  /**
   * Keep the mesh around `focus`. `loaded` are the resident near chunks the
   * terrain view draws; chunks outside it are skipped (and their cache
   * dropped). Returns true when the mesh was rebuilt.
   */
  update(focus: { x: number; z: number }, loaded: ReadonlySet<string>, force = false): boolean {
    const r = this.radius;
    const keys: string[] = [];
    for (let cz = worldToChunkZ(Math.floor(focus.z - r)); cz <= worldToChunkZ(Math.floor(focus.z + r)); cz++) {
      for (let cx = worldToChunkX(Math.floor(focus.x - r)); cx <= worldToChunkX(Math.floor(focus.x + r)); cx++) {
        const key = chunkKey(cx, cz);
        if (loaded.has(key)) keys.push(key);
      }
    }
    const signature = keys.join(';');
    const moved = Math.hypot(focus.x - this.lastFocus.x, focus.z - this.lastFocus.z);
    const retry = this.pending > 0 && performance.now() - this.lastRebuildAt > 500;
    // The fingerprint is cheap enough per frame; the zone list is rebuilt
    // only when it changes (trunk clearance reads the entities live).
    const exKey = coverExclusionKey(this.world);
    if (!(force || retry || this.deferred > 0 || moved >= GROUND_COVER_MOVE || signature !== this.chunkSignature
      || !this.exclusions || exKey !== this.exclusionKey)) return false;
    if (exKey !== this.exclusionKey) this.cache.clear();
    // The entity part reads the world live; only the rest is rebuilt when its fingerprint changes.
    if (!this.exclusions || exKey !== this.exclusionKey) this.exclusions = coverExclusions(this.world);
    else this.exclusions.entities.clear();
    this.exclusionKey = exKey;
    for (const key of [...this.cache.keys()]) if (!loaded.has(key)) this.cache.delete(key);
    // Place new chunks within the budget; the merge waits until none are deferred.
    const t0 = performance.now();
    let placed = 0;
    this.deferred = 0;
    for (const key of keys) {
      if (this.cache.has(key)) continue;
      if (placed > 0 && performance.now() - t0 >= this.budgetMs) { this.deferred++; continue; }
      if (this.chunkCover(key, this.exclusions)) placed++;
    }
    if (this.deferred > 0) return false;
    this.rebuild(focus, keys, this.exclusions);
    this.lastFocus.set(focus.x, 0, focus.z);
    this.chunkSignature = signature;
    return true;
  }

  /** Drop cached placements (e.g. after a chunk was re-meshed by an edit). */
  invalidate(): void { this.cache.clear(); this.exclusions = null; }

  private rebuild(focus: { x: number; z: number }, keys: string[], ex: CoverExclusions): void {
    const r2 = this.radius * this.radius;
    const chosen: CoverPiece[] = [];
    let vertices = 0;
    this.pending = 0;
    this.lastRebuildAt = performance.now();
    for (const key of keys) {
      const cover = this.chunkCover(key, ex);
      if (!cover) { this.pending++; continue; }
      for (const p of cover.pieces) {
        if ((p.x - focus.x) ** 2 + (p.z - focus.z) ** 2 > r2) continue;
        chosen.push(p);
        vertices += coverGeometry(p.model).attributes.position.count;
      }
    }
    const positions = new Float32Array(vertices * 3);
    const normals = new Float32Array(vertices * 3);
    const colors = new Float32Array(vertices * 3);
    const byKind: Record<string, number> = {};
    // M015: each piece is a turn about Y, a uniform scale and a move, so the transform is written out
    // here (the Matrix4 / Matrix3 path cost 20-75 ms per merge at 4x CPU throttle while walking).
    let o = 0;
    for (const p of chosen) {
      byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
      const g = coverGeometry(p.model);
      const c = Math.cos(p.rot), sn = Math.sin(p.rot), k = p.scale;
      const gp = g.attributes.position.array as Float32Array;
      const gn = g.attributes.normal.array as Float32Array;
      const gc = g.attributes.color.array as Float32Array;
      for (let i = 0; i < gp.length; i += 3) {
        const x = gp[i], y = gp[i + 1], z = gp[i + 2];
        positions[o] = (c * x + sn * z) * k + p.x;
        positions[o + 1] = y * k + p.y;
        positions[o + 2] = (c * z - sn * x) * k + p.z;
        const nx = gn[i], ny = gn[i + 1], nz = gn[i + 2];
        const rx = c * nx + sn * nz, rz = c * nz - sn * nx;
        const len = Math.hypot(rx, ny, rz) || 1;
        normals[o] = rx / len; normals[o + 1] = ny / len; normals[o + 2] = rz / len;
        colors[o] = gc[i]; colors[o + 1] = gc[i + 1]; colors[o + 2] = gc[i + 2];
        o += 3;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
    this.mesh.visible = vertices > 0;
    this.stats = { pieces: chosen.length, triangles: vertices / 3, chunks: keys.length, rebuilds: this.stats.rebuilds + 1, pending: this.pending, byKind };
  }

  metrics(): GroundCoverMetrics { return { ...this.stats, byKind: { ...this.stats.byKind } }; }
}
