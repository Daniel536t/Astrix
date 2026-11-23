// Terrain query layer — pure simulation, no three.js imports (D-005).
//
// M002 System 1: one shared, cached contract for construction, farming,
// movement, navigation and the AI agent. These queries describe the
// authoritative voxel volume; they never mutate it and never create a second
// terrain representation.
//
// Conventions:
//   * x/z are integer column coordinates in [-1024, 1024).
//   * y is an integer voxel coordinate in [-16, 112).
//   * surfaceY is the exposed top face (topSolid + 1), matching M001.
//   * A rect is inclusive on all four edges.
import {
  World, MatId, MAT, SEA_LEVEL, Y_MIN, Y_MAX, HALF,
  surfaceAt, topMaterialAtWorld, getVoxel, isSolid,
  worldToChunkX, worldToChunkZ, chunkKey,
  ActiveEntityKind, EntityKind, isRetiredStoneKind,
} from './world';
import { isStoneReplay } from './stone-compat';

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface VoxelRegion extends Rect {
  y0: number;
  y1: number;
}

export function normalizeRect(rect: Rect): Rect {
  return {
    x0: Math.min(rect.x0, rect.x1),
    z0: Math.min(rect.z0, rect.z1),
    x1: Math.max(rect.x0, rect.x1),
    z1: Math.max(rect.z0, rect.z1),
  };
}

export function rectColumns(rect: Rect): number {
  const r = normalizeRect(rect);
  return (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1);
}

export function rectContains(rect: Rect, x: number, z: number): boolean {
  return x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1;
}

export function expandRect(rect: Rect, amount: number): Rect {
  return {
    x0: rect.x0 - amount,
    z0: rect.z0 - amount,
    x1: rect.x1 + amount,
    z1: rect.z1 + amount,
  };
}

export function rectToRegion(rect: Rect, y0 = Y_MIN, y1 = Y_MAX - 1): VoxelRegion {
  return { ...normalizeRect(rect), y0, y1 };
}

export function regionsOverlap(a: VoxelRegion, b: VoxelRegion): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.z0 <= b.z1 && a.z1 >= b.z0
    && a.y0 <= b.y1 && a.y1 >= b.y0;
}

/** Inclusive containment of a voxel in a work envelope. */
export function envelopeContains(rects: readonly VoxelRegion[], x: number, y: number, z: number): boolean {
  for (const r of rects) {
    if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1 && z >= r.z0 && z <= r.z1) return true;
  }
  return false;
}

export interface TerrainColumn {
  x: number;
  z: number;
  /** Exposed top face of the solid column; the first air cell above it. */
  surfaceY: number;
  /** The highest solid voxel, or Y_MIN - 1 if the column has no solid. */
  topSolidY: number;
  topMaterial: MatId;
  solid: boolean;
  /** Water above the solid surface, up to sea level. 0 on dry land. */
  waterDepth: number;
  underwater: boolean;
  /** Largest 4-neighbour surface step in metres (1 = a single voxel riser). */
  slope: number;
  /** Free air cells above the surface, capped at CLEARANCE_PROBE. */
  clearance: number;
}

export const CLEARANCE_PROBE = 8;

function surfaceAtSafe(world: World, x: number, z: number, fallback: number): number {
  if (x < -HALF || z < -HALF || x >= HALF || z >= HALF) return fallback;
  return surfaceAt(world, x, z);
}

/** Water depth that respects a dry pit below sea level (unlike height alone). */
export function waterDepthAtColumn(world: World, x: number, z: number): number {
  const surface = surfaceAt(world, x, z);
  if (surface >= SEA_LEVEL) return 0;
  if (getVoxel(world, x, SEA_LEVEL - 1, z) !== MAT.WATER) return 0;
  return SEA_LEVEL - surface;
}

/** True when `height` air cells above the surface are free of solid or water. */
export function clearanceAt(world: World, x: number, z: number, height: number): boolean {
  const surface = surfaceAt(world, x, z);
  for (let i = 0; i < height; i++) {
    if (getVoxel(world, x, surface + i, z) !== MAT.AIR) return false;
  }
  return true;
}

export function columnAt(world: World, x: number, z: number): TerrainColumn {
  const cx = Math.floor(x), cz = Math.floor(z);
  const surfaceY = surfaceAt(world, cx, cz);
  const topMaterial = topMaterialAtWorld(world, cx, cz);
  const solid = surfaceY > Y_MIN && isSolid(topMaterial);
  const waterDepth = waterDepthAtColumn(world, cx, cz);
  const slope = Math.max(
    Math.abs(surfaceY - surfaceAtSafe(world, cx - 1, cz, surfaceY)),
    Math.abs(surfaceY - surfaceAtSafe(world, cx + 1, cz, surfaceY)),
    Math.abs(surfaceY - surfaceAtSafe(world, cx, cz - 1, surfaceY)),
    Math.abs(surfaceY - surfaceAtSafe(world, cx, cz + 1, surfaceY)),
  );
  let clearance = 0;
  while (clearance < CLEARANCE_PROBE && getVoxel(world, cx, surfaceY + clearance, cz) === MAT.AIR) {
    clearance++;
  }
  return {
    x: cx, z: cz, surfaceY, topSolidY: surfaceY - 1, topMaterial,
    solid, waterDepth, underwater: waterDepth > 0, slope, clearance,
  };
}

// Entity footprints are deliberately explicit. A tree occupies more site than
// its trunk; a pebble occupies less than a boulder. These are simulation
// clearance radii, not render bounds.
export const OBSTRUCTION_RADIUS: Record<ActiveEntityKind, number> = {
  styl_tree_spire: 1.5,
  styl_tree_table: 1.8,
  styl_tree_cluster: 1.9,
  styl_tree_blossom: 1.6,
  styl_shrub: 0.6,
  styl_ore: 0.9,
  styl_cairn: 0.8,
  waystone: 1.4,
  marker: 0.5,
};

export interface Obstruction {
  entityId: string;
  kind: EntityKind;
  x: number;
  z: number;
  radius: number;
  /** Footprint cells overlapped by this entity. */
  cells: number;
}

function entityChunksForRect(world: World, rect: Rect): string[] {
  const r = normalizeRect(rect);
  // A rect owns whole voxel cells. Include every chunk whose root could overlap
  // those cells, without scanning the entire 2048 m world.
  const radius = Math.max(...Object.values(OBSTRUCTION_RADIUS), 1.5);
  const minCellX = Math.floor(r.x0 + 0.5 - radius);
  const maxCellX = Math.ceil(r.x1 + 0.5 + radius) - 1;
  const minCellZ = Math.floor(r.z0 + 0.5 - radius);
  const maxCellZ = Math.ceil(r.z1 + 0.5 + radius) - 1;
  const keys: string[] = [];
  const cx0 = Math.max(0, worldToChunkX(minCellX)), cx1 = worldToChunkX(maxCellX);
  const cz0 = Math.max(0, worldToChunkZ(minCellZ)), cz1 = worldToChunkZ(maxCellZ);
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) keys.push(chunkKey(cx, cz));
  }
  return keys;
}

/** Entities whose simulation footprint overlaps the rect. */
export function obstructionsIn(world: World, rect: Rect): Obstruction[] {
  const r = normalizeRect(rect);
  const seen = new Set<string>();
  const out: Obstruction[] = [];
  for (const key of entityChunksForRect(world, r)) {
    const ids = world.entityChunks.get(key);
    if (!ids) continue;
    for (const id of ids) {
      if (seen.has(id)) continue;
      const e = world.entities.get(id);
      if (!e || (isRetiredStoneKind(e.kind) && !isStoneReplay(world)) || world.entityRemovals.has(e.id)) continue;
      seen.add(id);
      const radius = isRetiredStoneKind(e.kind)
        ? e.kind === 'styl_rock_small' ? 0.6 : e.kind === 'styl_rock_medium' ? 1.1 : 1.5
        : OBSTRUCTION_RADIUS[e.kind as ActiveEntityKind];
      let cells = 0;
      const ex0 = Math.max(r.x0, Math.floor(e.x - radius - 0.5));
      const ex1 = Math.min(r.x1, Math.ceil(e.x + radius - 0.5));
      const ez0 = Math.max(r.z0, Math.floor(e.z - radius - 0.5));
      const ez1 = Math.min(r.z1, Math.ceil(e.z + radius - 0.5));
      for (let z = ez0; z <= ez1; z++) {
        for (let x = ex0; x <= ex1; x++) {
          if (Math.hypot(e.x - (x + 0.5), e.z - (z + 0.5)) <= radius) cells++;
        }
      }
      if (cells > 0) {
        out.push({ entityId: e.id, kind: e.kind, x: e.x, z: e.z, radius, cells });
      }
    }
  }
  out.sort((a, b) => (a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0));
  return out;
}

export interface AreaStats {
  rect: Rect;
  columns: number;
  minY: number;
  maxY: number;
  meanY: number;
  relief: number;
  maxStep: number;
  waterColumns: number;
  stoneColumns: number;
  materials: Record<number, number>;
  obstructions: Obstruction[];
  obstructedColumns: number;
  /** Cut/fill relative to floorY when supplied, otherwise 0. */
  floorY: number | null;
  cutVolume: number;
  fillVolume: number;
  maxCut: number;
  maxFill: number;
}

export interface SupportSummary {
  total: number;
  level: number;
  cut: number;
  fill: number;
  water: number;
  /** Fill deeper than 8 m; a validator may reject these as unsupported. */
  deepFill: number;
  maxCut: number;
  maxFill: number;
  cutVolume: number;
  fillVolume: number;
}

export interface FootprintQuery {
  rect: Rect;
  floorY: number;
  stats: AreaStats;
  support: SupportSummary;
  obstructions: Obstruction[];
  /** Cells in the building volume above the prepared floor that are not air. */
  overhangCells: Array<{ x: number; y: number; z: number; material: MatId }>;
}

/**
 * Cached query context. Caches are keyed on world.revision: a voxel or entity
 * edit invalidates them, while mesh/nav rebuilds do not. Use one context for a
 * site search or a footprint evaluation, then discard it.
 */
export class TerrainQuery {
  private cache = new Map<string, TerrainColumn>();
  private obstructionCache = new Map<string, Obstruction[]>();
  private revision: number;

  constructor(public readonly world: World) {
    this.revision = world.revision;
  }

  private sync(): void {
    if (this.revision !== this.world.revision) {
      this.cache.clear();
      this.obstructionCache.clear();
      this.revision = this.world.revision;
    }
  }

  /** Cached entity obstructions for one footprint. */
  obstructionsFor(rect: Rect): Obstruction[] {
    this.sync();
    const r = normalizeRect(rect);
    const key = `${r.x0},${r.z0},${r.x1},${r.z1}`;
    let list = this.obstructionCache.get(key);
    if (!list) {
      list = obstructionsIn(this.world, r);
      this.obstructionCache.set(key, list);
    }
    return list;
  }

  column(x: number, z: number): TerrainColumn {
    this.sync();
    const cx = Math.floor(x), cz = Math.floor(z);
    const key = `${cx},${cz}`;
    let col = this.cache.get(key);
    if (!col) {
      col = columnAt(this.world, cx, cz);
      this.cache.set(key, col);
    }
    return col;
  }

  area(rect: Rect, floorY?: number): AreaStats {
    this.sync();
    const r = normalizeRect(rect);
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let sum = 0;
    let maxStep = 0;
    let waterColumns = 0;
    let stoneColumns = 0;
    let cutVolume = 0;
    let fillVolume = 0;
    let maxCut = 0;
    let maxFill = 0;
    const materials: Record<number, number> = {};

    for (let z = r.z0; z <= r.z1; z++) {
      for (let x = r.x0; x <= r.x1; x++) {
        const col = this.column(x, z);
        minY = Math.min(minY, col.surfaceY);
        maxY = Math.max(maxY, col.surfaceY);
        sum += col.surfaceY;
        maxStep = Math.max(maxStep, col.slope);
        if (col.waterDepth > 0) waterColumns++;
        if (col.topMaterial === MAT.STONE) stoneColumns++;
        materials[col.topMaterial] = (materials[col.topMaterial] ?? 0) + 1;
        if (floorY !== undefined) {
          const dy = col.surfaceY - floorY;
          if (dy > 0) {
            cutVolume += dy;
            maxCut = Math.max(maxCut, dy);
          } else if (dy < 0) {
            fillVolume += -dy;
            maxFill = Math.max(maxFill, -dy);
          }
        }
      }
    }

    const obstructions = this.obstructionsFor(r);
    const obstructed = new Set<string>();
    for (const o of obstructions) {
      const radius = o.radius;
      const ex0 = Math.max(r.x0, Math.floor(o.x - radius - 0.5));
      const ex1 = Math.min(r.x1, Math.ceil(o.x + radius - 0.5));
      const ez0 = Math.max(r.z0, Math.floor(o.z - radius - 0.5));
      const ez1 = Math.min(r.z1, Math.ceil(o.z + radius - 0.5));
      for (let z = ez0; z <= ez1; z++) {
        for (let x = ex0; x <= ex1; x++) {
          if (Math.hypot(o.x - (x + 0.5), o.z - (z + 0.5)) <= radius) obstructed.add(`${x},${z}`);
        }
      }
    }

    const columns = (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1);
    return {
      rect: r,
      columns,
      minY, maxY,
      meanY: Math.round((sum / columns) * 1000) / 1000,
      relief: maxY - minY,
      maxStep,
      waterColumns,
      stoneColumns,
      materials,
      obstructions,
      obstructedColumns: obstructed.size,
      floorY: floorY ?? null,
      cutVolume,
      fillVolume,
      maxCut,
      maxFill,
    };
  }

  /**
   * Evaluate a complete building footprint. `floorY` is the prepared walking
   * floor: terrain above it is cut, terrain below it is filled. The result is
   * raw site data; construction rules live in construction.ts.
   */
  footprint(rect: Rect, floorY: number): FootprintQuery {
    const stats = this.area(rect, floorY);
    const r = normalizeRect(rect);
    const support: SupportSummary = {
      total: stats.columns, level: 0, cut: 0, fill: 0, water: 0, deepFill: 0,
      maxCut: 0, maxFill: 0, cutVolume: 0, fillVolume: 0,
    };
    const overhangCells: FootprintQuery['overhangCells'] = [];

    for (let z = r.z0; z <= r.z1; z++) {
      for (let x = r.x0; x <= r.x1; x++) {
        const col = this.column(x, z);
        const dy = col.surfaceY - floorY;
        if (dy > 0) {
          support.cut++;
          support.cutVolume += dy;
          support.maxCut = Math.max(support.maxCut, dy);
        } else if (dy < 0) {
          support.fill++;
          support.fillVolume += -dy;
          support.maxFill = Math.max(support.maxFill, -dy);
          if (-dy > 8) support.deepFill++;
        } else {
          support.level++;
        }
        if (col.waterDepth > 0) support.water++;

        // An overhang is terrain above the floor that survives the cut plane.
        // For a column below the floor, its solid body is fill, not overhang.
        const start = Math.max(floorY, col.surfaceY);
        for (let y = start; y < start + 4; y++) {
          const m = getVoxel(this.world, x, y, z) as MatId;
          if (m !== MAT.AIR) overhangCells.push({ x, y, z, material: m });
        }
      }
    }

    return { rect: r, floorY, stats, support, obstructions: stats.obstructions, overhangCells };
  }
}

// ---------- movement contract ----------
export interface WalkParams {
  maxStepUp: number;
  maxStepDown: number;
  maxWaterDepth: number;
  /** Maximum adjacent surface step; 1.0 is a 45 degree voxel riser. */
  maxSlope: number;
  clearance: number;
}

export const DEFAULT_WALK: WalkParams = {
  maxStepUp: 1.0,
  maxStepDown: 1.5,
  maxWaterDepth: 0.4,
  maxSlope: 1.0,
  clearance: 2.0,
};

export interface WalkResult {
  ok: boolean;
  reason: 'ok' | 'not_adjacent' | 'step_up' | 'fall' | 'water' | 'slope' | 'clearance';
  step: number;
  waterDepth: number;
}

/** Evaluate one grid step. Paths are validated with the same contract. */
export function walkStep(
  world: World, fromX: number, fromZ: number, toX: number, toZ: number,
  params: WalkParams = DEFAULT_WALK,
): WalkResult {
  const dx = Math.abs(Math.floor(toX) - Math.floor(fromX));
  const dz = Math.abs(Math.floor(toZ) - Math.floor(fromZ));
  if (dx + dz !== 1) {
    return { ok: false, reason: 'not_adjacent', step: 0, waterDepth: 0 };
  }
  const from = columnAt(world, fromX, fromZ);
  const to = columnAt(world, toX, toZ);
  const step = to.surfaceY - from.surfaceY;
  if (step > params.maxStepUp) return { ok: false, reason: 'step_up', step, waterDepth: to.waterDepth };
  if (-step > params.maxStepDown) return { ok: false, reason: 'fall', step, waterDepth: to.waterDepth };
  if (to.waterDepth > params.maxWaterDepth) return { ok: false, reason: 'water', step, waterDepth: to.waterDepth };
  if (to.slope > params.maxSlope) return { ok: false, reason: 'slope', step, waterDepth: to.waterDepth };
  if (!clearanceAt(world, toX, toZ, params.clearance)) {
    return { ok: false, reason: 'clearance', step, waterDepth: to.waterDepth };
  }
  return { ok: true, reason: 'ok', step, waterDepth: to.waterDepth };
}

/** Effective grade of a straight path segment, used by path validation. */
export function effectiveGrade(world: World, x0: number, z0: number, x1: number, z1: number): number {
  const a = columnAt(world, x0, z0);
  const b = columnAt(world, x1, z1);
  const run = Math.hypot(x1 - x0, z1 - z0);
  if (run === 0) return Math.abs(b.surfaceY - a.surfaceY);
  return Math.abs(b.surfaceY - a.surfaceY) / run;
}
