// M010 navigation: a reusable, deterministic walking layer over the
// authoritative world, for villagers today and any later profession.
//
// Layers (all derived, never saved; rebuilt only when their inputs change):
//  - terrain: walking height and water depth of every 1 m column in a window
//    around the settlement, read from the voxels (keyed on the edit overlay);
//  - nature and structures: trees by growth stage, bushes, ore, landmarks and
//    built modules (keyed on the world revision);
//  - features supplied by the caller (the homestead): buildings with doors,
//    fences on cell edges with openings and gates, occupied cells, crop costs.
//
// Rules: neighbouring columns may differ by at most MAX_STEP metre (a step);
// more is a cliff. Water deeper than WADE_MAX is dangerous and impassable;
// shallower water is a ford with a cost. A bridge (or any deck) supplies a
// walking height that overrides the water. Fences block the cell edge they
// stand on; a gate or door is an edge that is passable unless locked, and the
// walker has to stop and open it when closed. Diagonal moves never cut a
// blocked corner, a fence or a gate, so every gate crossing is orthogonal.
//
// Search is A* with integer costs, an admissible octile heuristic and a total
// order on the open list (f, then h, then cell index), so equal inputs give
// equal paths everywhere. Every search is bounded by an expansion budget the
// caller passes in. A walker stores its route (corner cells), the grid hash it
// was planned on and its destination; any grid change (a gate locked, a tree
// felled, a field marked, a voxel edit) changes the hash and the walker
// replans from where it stands. All of that is plain integer/string state, so
// a restored snapshot continues exactly as the live run did.
import type { World } from './world';
import {
  CHUNK_SIZE, HALF, chunkKey, editVersion, ensureChunk, isRetiredStoneKind, natureVersion, structureVersion, surfaceAt, waterDepthAt,
  worldToChunkX, worldToChunkZ,
} from './world';
import { LIFE_FOOTPRINT, TreeStage, treeLife } from './woodland';

export type GateState = 'open' | 'closed' | 'locked';
export const GATE_STATES: readonly GateState[] = ['closed', 'locked', 'open'];

/** Why a cell cannot be stood on (0 = it can). */
export const BLOCK = {
  none: 0, outside: 1, deep_water: 2, building: 3, occupied: 4, tree: 5, rock: 6, landmark: 7, structure: 8,
} as const;
export type BlockReason = keyof typeof BLOCK;
const REASON_NAMES = Object.keys(BLOCK) as BlockReason[];
export const REASON_TEXT: Record<BlockReason, string> = {
  none: 'open ground', outside: 'outside the settlement', deep_water: 'deep water', building: 'a building',
  occupied: 'an occupied space', tree: 'a tree', rock: 'a rock', landmark: 'a landmark', structure: 'a built wall',
};

// Costs are tenths of a metre walked, so the octile heuristic is admissible.
export const COST_STRAIGHT = 10;
export const COST_DIAGONAL = 14;
/** Extra for a one-metre step up or down. */
export const COST_STEP = 6;
/** Extra for wading a shallow ford. */
export const COST_FORD = 20;
/** Extra for crossing a gate or door (opening and closing it). */
export const COST_GATE = 4;
/** Extra for pushing through a bush. */
export const COST_BUSH = 8;
/** Highest height difference (m) between neighbouring columns a walker can step. */
export const MAX_STEP = 1;
/** Deepest water (m) a walker may ford. Deeper is dangerous and avoided. */
export const WADE_MAX = 1;

const WALL_E = 1, WALL_S = 2, GATE_E = 4, GATE_S = 8;

/**
 * M012 structure layer: which cells hold a solid built thing (a building, a
 * shelter, a trough) for anything with a body, not only for walkers. Derived
 * from the same features as the walking grid and never hashed, so v2 grids
 * keep their hashes. The player's physics sweeps against these cells and the
 * fence/gate edges (see `structureHits`).
 */
export const SOLID = { none: 0, building: 1, shelter: 2, low: 3 } as const;
/** Height (m above the cell's ground) of each solid kind. */
export const SOLID_HEIGHT = [0, 4.5, 2.6, 0.75] as const;
/** Fence and gate edges: height above the higher side's ground, and half thickness (m). */
export const FENCE_HEIGHT = 1.15;
export const FENCE_HALF = 0.08;

export interface CellRect { x0: number; z0: number; x1: number; z1: number } // world metres, [x0, x1) cells
export type Side = 'n' | 's' | 'e' | 'w';
/** A gate or door on the edge between cell (x, z) and its neighbour on `side`. */
export interface NavGate { id: string; x: number; z: number; side: Side }
export interface NavFeatures {
  /** Stable text of everything below (the cache key). */
  key: string;
  /** Walking height over water (bridges, jetties); applied before everything else. */
  decks: Array<CellRect & { y: number }>;
  costs: Array<CellRect & { extra: number }>;
  blocks: Array<CellRect & { reason: BlockReason; id: string }>;
  /** Cells inside a block that stay walkable (a doorway, a threshold); `keepSolid` keeps them solid for bodies (an interior the renderer does not draw). */
  clear: Array<CellRect & { keepSolid?: boolean }>;
  /** Fences on the rect's outline; `gaps` are cell edges left open (no gate). */
  fences: Array<CellRect & { id: string; gaps: Array<{ x: number; z: number; side: Side }> }>;
  gates: NavGate[];
  gateStates: Record<string, GateState>;
}

export function emptyFeatures(key = ''): NavFeatures {
  return { key, decks: [], costs: [], blocks: [], clear: [], fences: [], gates: [], gateStates: {} };
}

export interface NavRegion { ox: number; oz: number; w: number; h: number }

interface TerrainLayer { key: string; ground: Int16Array; water: Uint8Array; block: Uint8Array }

export class NavGrid {
  readonly ground: Int16Array;
  readonly block: Uint8Array;
  readonly extra: Uint16Array;
  readonly walls: Uint8Array;
  /** M012: solid built cells for bodies (SOLID kinds); not part of the hash. */
  readonly solid: Uint8Array;
  /** Smallest blocking id per blocked cell (deterministic whatever the input order). */
  readonly blockId = new Map<number, string>();
  readonly gateAt = new Map<number, string>(); // cell index * 2 + (0 = east edge, 1 = south edge)
  readonly gateCells = new Map<string, [number, number, number, number]>();
  readonly gateState = new Map<string, GateState>();
  hash = '';
  // Reused search buffers.
  g: Int32Array; parent: Int32Array; closed: Uint8Array;
  constructor(readonly ox: number, readonly oz: number, readonly w: number, readonly h: number) {
    const n = w * h;
    this.ground = new Int16Array(n); this.block = new Uint8Array(n); this.extra = new Uint16Array(n); this.walls = new Uint8Array(n);
    this.solid = new Uint8Array(n);
    this.g = new Int32Array(n); this.parent = new Int32Array(n); this.closed = new Uint8Array(n);
  }
  inside(x: number, z: number): boolean { return x >= this.ox && z >= this.oz && x < this.ox + this.w && z < this.oz + this.h; }
  index(x: number, z: number): number { return (z - this.oz) * this.w + (x - this.ox); }
  cellX(i: number): number { return this.ox + (i % this.w); }
  cellZ(i: number): number { return this.oz + Math.floor(i / this.w); }
  reason(x: number, z: number): BlockReason { return this.inside(x, z) ? REASON_NAMES[this.block[this.index(x, z)]] : 'outside'; }
  /** The gate on the edge between two orthogonal neighbours, or null. */
  gateBetween(ax: number, az: number, bx: number, bz: number): string | null {
    const e = edge(this, ax, az, bx, bz);
    return e < 0 ? null : this.gateAt.get(e) ?? null;
  }
}

/** Edge key of two orthogonal neighbours (both inside), or -1. */
function edge(g: NavGrid, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) + Math.abs(dz) !== 1 || !g.inside(ax, az) || !g.inside(bx, bz)) return -1;
  if (dx === 1) return g.index(ax, az) * 2;
  if (dx === -1) return g.index(bx, bz) * 2;
  if (dz === 1) return g.index(ax, az) * 2 + 1;
  return g.index(bx, bz) * 2 + 1;
}

// ---------- building the grid ----------

interface NavCache { region: string; terrain?: TerrainLayer; memo?: string; staticKey?: string; claims?: Map<string, Claim>; featureKey?: string; grid?: NavGrid; builds: number; ms: number }
const caches = new WeakMap<World, Map<string, NavCache>>();

export interface NavStats {
  /** Obstacle-layer rebuilds, and how many of them changed the grid (new hash). */
  gridBuilds: number; gridPatches: number; gridChanges: number; gridMs: number; terrainBuilds: number; terrainMs: number;
  searches: number; expanded: number; searchMs: number; ticks: number; tickMs: number; maxTickMs: number; lastTickMs: number;
}
const stats = new WeakMap<World, NavStats>();
/** Presentation-only timing counters (never saved or hashed). */
export function navStats(world: World): NavStats {
  let s = stats.get(world);
  if (!s) {
    s = { gridBuilds: 0, gridPatches: 0, gridChanges: 0, gridMs: 0, terrainBuilds: 0, terrainMs: 0, searches: 0, expanded: 0, searchMs: 0, ticks: 0, tickMs: 0, maxTickMs: 0, lastTickMs: 0 };
    stats.set(world, s);
  }
  return s;
}

function terrainLayer(world: World, r: NavRegion): TerrainLayer {
  const t0 = performance.now();
  const n = r.w * r.h;
  const ground = new Int16Array(n), water = new Uint8Array(n), block = new Uint8Array(n);
  for (let z = 0; z < r.h; z++) {
    for (let x = 0; x < r.w; x++) {
      const wx = r.ox + x, wz = r.oz + z, i = z * r.w + x;
      if (wx < -HALF || wz < -HALF || wx >= HALF || wz >= HALF) { block[i] = BLOCK.outside; continue; }
      // surfaceAt generates a missing chunk (and its natural entities): the
      // grid is the same whichever chunks a renderer happened to load.
      ground[i] = surfaceAt(world, wx, wz);
      const d = Math.max(0, waterDepthAt(world, wx, wz));
      water[i] = Math.min(255, d);
      if (d > WADE_MAX) block[i] = BLOCK.deep_water;
    }
  }
  const s = navStats(world);
  s.terrainBuilds++; s.terrainMs += performance.now() - t0;
  return { key: '', ground, water, block };
}

function forRect(g: NavGrid, r: CellRect, f: (i: number, x: number, z: number) => void): void {
  const x0 = Math.max(r.x0, g.ox), x1 = Math.min(r.x1, g.ox + g.w), z0 = Math.max(r.z0, g.oz), z1 = Math.min(r.z1, g.oz + g.h);
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) f(g.index(x, z), x, z);
}

/** Block a cell; when several things claim it, the smallest id wins (order-independent). */
function setBlock(g: NavGrid, i: number, reason: BlockReason, id: string): void {
  const cur = g.block[i];
  if (cur === BLOCK.outside || cur === BLOCK.deep_water) return;
  if (cur !== BLOCK.none) { const prev = g.blockId.get(i); if (prev !== undefined && prev <= id) return; }
  g.block[i] = BLOCK[reason];
  g.blockId.set(i, id);
}

/** Wall bit for the edge on `side` of cell (x, z). */
function markEdge(g: NavGrid, x: number, z: number, side: Side, bits: 'wall' | 'gate', id?: string): void {
  let cx = x, cz = z, south = false;
  if (side === 'e') { /* own east edge */ } else if (side === 'w') cx = x - 1;
  else if (side === 's') south = true; else { cz = z - 1; south = true; }
  if (!g.inside(cx, cz)) return;
  // Edges on the far border of the window belong to no in-grid neighbour.
  if (!south && !g.inside(cx + 1, cz)) return;
  if (south && !g.inside(cx, cz + 1)) return;
  const i = g.index(cx, cz);
  if (bits === 'wall') { g.walls[i] |= south ? WALL_S : WALL_E; return; }
  g.walls[i] &= south ? ~WALL_S : ~WALL_E;
  g.walls[i] |= south ? GATE_S : GATE_E;
  g.gateAt.set(i * 2 + (south ? 1 : 0), id!);
  g.gateCells.set(id!, south ? [cx, cz, cx, cz + 1] : [cx, cz, cx + 1, cz]);
}

const sideOf = (x: number, z: number, side: Side) => `${x},${z},${side}`;
/** The same edge named from either side, normalised to an east or south edge. */
function normEdge(x: number, z: number, side: Side): string {
  if (side === 'w') return sideOf(x - 1, z, 'e');
  if (side === 'n') return sideOf(x, z - 1, 's');
  return sideOf(x, z, side);
}

function applyFeatures(g: NavGrid, f: NavFeatures, only?: Set<number>): void {
  // `only`: an incremental update re-stamps just these cells (costs, blocks, clears); edges are unchanged.
  const each = (r: CellRect, fn: (i: number) => void) => forRect(g, r, only ? (i) => { if (only.has(i)) fn(i); } : fn);
  if (!only) for (const d of f.decks) forRect(g, d, (i) => { g.ground[i] = d.y; if (g.block[i] === BLOCK.deep_water) g.block[i] = BLOCK.none; });
  for (const c of f.costs) each(c, (i) => { g.extra[i] += c.extra; });
  for (const b of f.blocks) {
    const kind = b.reason === 'building' ? SOLID.building : b.reason === 'occupied' ? (b.id.startsWith('trough:') ? SOLID.low : SOLID.shelter) : SOLID.none;
    each(b, (i) => { setBlock(g, i, b.reason, b.id); if (kind && (!g.solid[i] || kind < g.solid[i])) g.solid[i] = kind; });
  }
  for (const c of f.clear) each(c, (i) => {
    if (!c.keepSolid) g.solid[i] = SOLID.none;
    if (g.block[i] !== BLOCK.deep_water && g.block[i] !== BLOCK.outside) { g.block[i] = BLOCK.none; g.blockId.delete(i); }
  });
  if (only) return;
  const open = new Set<string>();
  for (const fe of f.fences) for (const gap of fe.gaps) open.add(normEdge(gap.x, gap.z, gap.side));
  for (const gt of f.gates) open.add(normEdge(gt.x, gt.z, gt.side));
  for (const fe of f.fences) {
    for (let x = fe.x0; x < fe.x1; x++) {
      if (!open.has(normEdge(x, fe.z0, 'n'))) markEdge(g, x, fe.z0, 'n', 'wall');
      if (!open.has(normEdge(x, fe.z1 - 1, 's'))) markEdge(g, x, fe.z1 - 1, 's', 'wall');
    }
    for (let z = fe.z0; z < fe.z1; z++) {
      if (!open.has(normEdge(fe.x0, z, 'w'))) markEdge(g, fe.x0, z, 'w', 'wall');
      if (!open.has(normEdge(fe.x1 - 1, z, 'e'))) markEdge(g, fe.x1 - 1, z, 'e', 'wall');
    }
  }
  for (const gt of [...f.gates].sort((a, b) => a.id.localeCompare(b.id))) {
    markEdge(g, gt.x, gt.z, gt.side, 'gate', gt.id);
    const st = f.gateStates[gt.id] ?? 'closed';
    g.gateState.set(gt.id, st);
    // A locked gate is a wall for everyone (its gate bit stays, for reports).
    if (st === 'locked') {
      const cells = g.gateCells.get(gt.id);
      if (cells) { const i = g.index(cells[0], cells[1]); g.walls[i] |= cells[2] !== cells[0] ? WALL_E : WALL_S; }
    }
  }
}

/**
 * What one natural entity contributes to the grid. Positions never change, so
 * a claim is fully described by its code; a change of code (a tree grew,
 * was felled, resprouted or fell; a bush was gathered) is what the
 * incremental update below repairs.
 */
interface Claim { code: string; kind: 'tree' | 'bush' | 'cell'; x: number; z: number; r: number; reason: BlockReason }

/** Chunk range the window's entities can come from (2 m margin, as before). */
function claimChunks(g: { ox: number; oz: number; w: number; h: number }): [number, number, number, number] {
  return [worldToChunkX(Math.max(-HALF, g.ox - 2)), worldToChunkX(Math.min(HALF - 1, g.ox + g.w + 1)),
    worldToChunkZ(Math.max(-HALF, g.oz - 2)), worldToChunkZ(Math.min(HALF - 1, g.oz + g.h + 1))];
}

/**
 * Trees by lifecycle stage (M013; the M008 visual stage under older rules),
 * bushes, ore and landmarks near the window. Every chunk in range is
 * generated first, so the claims never depend on which chunks a renderer
 * happened to load.
 */
function worldClaims(world: World, g: { ox: number; oz: number; w: number; h: number }): Map<string, Claim> {
  const out = new Map<string, Claim>();
  const [cx0, cx1, cz0, cz1] = claimChunks(g);
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      ensureChunk(world, cx, cz);
      const ids = world.entityChunks.get(chunkKey(cx, cz));
      if (!ids) continue;
      for (const id of ids) {
        const e = world.entities.get(id);
        if (!e || world.entityRemovals.has(id) || isRetiredStoneKind(e.kind)) continue;
        if (e.kind.startsWith('styl_tree_')) {
          // A stump is felled (harvested) but still stands; a gap is felled or fallen and gone.
          const life = treeLife(world, e);
          if (!life || !life.present) continue;
          const r = LIFE_FOOTPRINT[life.stage as TreeStage];
          out.set(id, { code: `t${r}`, kind: 'tree', x: e.x, z: e.z, r, reason: 'tree' });
          continue;
        }
        if (e.harvested) continue;
        if (e.kind === 'styl_shrub') { out.set(id, { code: 'b', kind: 'bush', x: e.x, z: e.z, r: 0, reason: 'tree' }); continue; }
        const reason: BlockReason = e.kind === 'styl_ore' || e.kind.startsWith('styl_rock') ? 'rock' : 'landmark';
        out.set(id, { code: reason, kind: 'cell', x: e.x, z: e.z, r: 0, reason });
      }
    }
  }
  return out;
}

/** Cells a claim can touch (a bounding square; the stamp itself tests the disc). */
function claimArea(g: NavGrid, c: Claim, add: (i: number) => void): void {
  const ex = Math.floor(c.x), ez = Math.floor(c.z);
  const reach = c.kind === 'tree' ? Math.ceil(c.r) : 0;
  for (let z = ez - reach; z <= ez + reach; z++) for (let x = ex - reach; x <= ex + reach; x++) if (g.inside(x, z)) add(g.index(x, z));
}

function stampClaim(g: NavGrid, id: string, c: Claim, only?: Set<number>): void {
  const ex = Math.floor(c.x), ez = Math.floor(c.z);
  if (c.kind === 'bush') {
    if (g.inside(ex, ez) && (!only || only.has(g.index(ex, ez)))) g.extra[g.index(ex, ez)] += COST_BUSH;
    return;
  }
  if (c.kind === 'tree') {
    const reach = Math.ceil(c.r);
    for (let z = ez - reach; z <= ez + reach; z++) {
      for (let x = ex - reach; x <= ex + reach; x++) {
        const dx = x + 0.5 - c.x, dz = z + 0.5 - c.z;
        if (dx * dx + dz * dz <= c.r * c.r + 1e-9 && g.inside(x, z) && (!only || only.has(g.index(x, z)))) setBlock(g, g.index(x, z), 'tree', id);
      }
    }
    return;
  }
  if (g.inside(ex, ez) && (!only || only.has(g.index(ex, ez)))) setBlock(g, g.index(ex, ez), c.reason, id);
}

/** Landmark sites and built modules (not entities). */
function applyStatic(world: World, g: NavGrid, only?: Set<number>): void {
  const ok = (i: number) => !only || only.has(i);
  for (const s of world.sites) {
    const x = Math.floor(s.x), z = Math.floor(s.z);
    if (g.inside(x, z) && ok(g.index(x, z))) setBlock(g, g.index(x, z), 'landmark', s.id);
  }
  for (const s of [...world.structures.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const m of s.modules) {
      if (m.kind === 'crop_row' || m.kind === 'door' || m.kind === 'threshold') continue;
      // A rotated module is bounded by its half-diagonal (no trigonometry in the hashed sim).
      const hw = m.rot ? Math.sqrt(m.w * m.w + m.d * m.d) / 2 : m.w / 2;
      const hd = m.rot ? hw : m.d / 2;
      for (let z = Math.floor(m.z - hd); z <= Math.floor(m.z + hd); z++) {
        for (let x = Math.floor(m.x - hw); x <= Math.floor(m.x + hw); x++) {
          if (!g.inside(x, z) || Math.abs(x + 0.5 - m.x) >= hw || Math.abs(z + 0.5 - m.z) >= hd) continue;
          const i = g.index(x, z), floor = g.ground[i];
          if (!ok(i)) continue;
          // Taller than a step and low enough to walk into: a wall. Lower: a floor or a step.
          if (m.y + m.h > floor + 1.05 && m.y < floor + 1.7) setBlock(g, i, 'structure', s.id);
        }
      }
    }
  }
}

function hashGrid(g: NavGrid): string {
  let a = 0x811c9dc5, b = 0x9e3779b9;
  const mix = (v: number) => {
    a = Math.imul(a ^ (v & 0xffff), 0x01000193);
    b = Math.imul(b ^ ((v & 0xffff) + 0x9e), 0x85ebca6b); b ^= b >>> 13;
  };
  mix(g.ox); mix(g.oz); mix(g.w); mix(g.h);
  for (let i = 0; i < g.ground.length; i++) {
    mix(g.ground[i]); mix(g.block[i] === 0 ? 0 : 1); mix(g.extra[i]); mix(g.walls[i]);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

function cloneGrid(src: NavGrid): NavGrid {
  const g = new NavGrid(src.ox, src.oz, src.w, src.h);
  g.ground.set(src.ground); g.block.set(src.block); g.extra.set(src.extra); g.walls.set(src.walls); g.solid.set(src.solid);
  for (const [k, v] of src.blockId) g.blockId.set(k, v);
  for (const [k, v] of src.gateAt) g.gateAt.set(k, v);
  for (const [k, v] of src.gateCells) g.gateCells.set(k, v);
  for (const [k, v] of src.gateState) g.gateState.set(k, v);
  return g;
}

/** A full build from the terrain layer, the claims, the static layer and the caller's features. */
function buildGrid(world: World, region: NavRegion, terrain: TerrainLayer, claims: Map<string, Claim>, features: NavFeatures): NavGrid {
  const g = new NavGrid(region.ox, region.oz, region.w, region.h);
  g.ground.set(terrain.ground);
  g.block.set(terrain.block);
  for (let i = 0; i < g.extra.length; i++) if (terrain.water[i] > 0 && g.block[i] === 0) g.extra[i] = COST_FORD;
  for (const [id, c] of claims) stampClaim(g, id, c);
  applyStatic(world, g);
  applyFeatures(g, features);
  g.hash = hashGrid(g);
  return g;
}

/**
 * M013 incremental update: only the cells the changed claims touch (before
 * and after) are reset to the terrain layer and stamped again by every claim,
 * static block and feature that covers them. Setting a block is
 * order-independent (smallest id wins) and costs add, so the result equals a
 * full build exactly (tests compare both on every change).
 */
function patchGrid(world: World, prev: NavGrid, terrain: TerrainLayer, before: Map<string, Claim>, claims: Map<string, Claim>, changed: string[], features: NavFeatures): NavGrid {
  const g = cloneGrid(prev);
  const cells = new Set<number>();
  for (const id of changed) {
    const a = before.get(id), b = claims.get(id);
    if (a) claimArea(g, a, (i) => cells.add(i));
    if (b) claimArea(g, b, (i) => cells.add(i));
  }
  for (const i of cells) {
    g.block[i] = terrain.block[i];
    g.blockId.delete(i);
    g.extra[i] = terrain.water[i] > 0 && terrain.block[i] === 0 ? COST_FORD : 0;
  }
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const i of cells) { const x = g.cellX(i), z = g.cellZ(i); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  for (const [id, c] of claims) {
    // Claims reach at most 2 cells from their trunk.
    if (c.x < x0 - 3 || c.x > x1 + 4 || c.z < z0 - 3 || c.z > z1 + 4) continue;
    stampClaim(g, id, c, cells);
  }
  applyStatic(world, g, cells);
  applyFeatures(g, features, cells);
  g.hash = hashGrid(g);
  return g;
}

/**
 * The navigation grid of a window, current with the world and the caller's
 * features. Within one tick and world state it is a memo lookup. Otherwise
 * the window's entity claims are compared with the cached grid's: no change
 * returns the cached grid, a few changed claims patch it (M013: growth,
 * felling and resprouting update only their own cells), anything else
 * (terrain edits, structures, new features) rebuilds it.
 */
export function navGrid(world: World, region: NavRegion, features: NavFeatures): NavGrid {
  let byRegion = caches.get(world);
  if (!byRegion) { byRegion = new Map(); caches.set(world, byRegion); }
  const rk = `${region.ox},${region.oz},${region.w},${region.h}`;
  let c = byRegion.get(rk);
  if (!c) { c = { region: rk, builds: 0, ms: 0 }; byRegion.set(rk, c); }
  const tKey = `${world.seed}:${world.params.generatorVersion}:${editVersion(world)}`;
  if (!c.terrain || c.terrain.key !== tKey) {
    c.terrain = terrainLayer(world, region);
    c.terrain.key = tKey;
    c.grid = undefined;
  }
  const memo = `${natureVersion(world)}:${world.revision}:${world.life?.tick ?? 0}:${world.entities.size}:${world.entityRemovals.size}`;
  if (c.grid && c.memo === memo && c.featureKey === features.key) return c.grid;
  const t0 = performance.now();
  const sKey = `${world.structures.size}:${world.sites.length}:${structureVersion(world)}`;
  const claims = worldClaims(world, region);
  const s = navStats(world);
  if (c.grid && c.claims && c.featureKey === features.key && c.staticKey === sKey) {
    const changed: string[] = [];
    for (const [id, cl] of claims) if (c.claims.get(id)?.code !== cl.code) changed.push(id);
    for (const id of c.claims.keys()) if (!claims.has(id)) changed.push(id);
    if (!changed.length) { c.claims = claims; c.memo = memo; return c.grid; }
    if (changed.length <= 64 && features.decks.length === 0) {
      const g = patchGrid(world, c.grid, c.terrain, c.claims, claims, changed, features);
      s.gridBuilds++; s.gridPatches++; s.gridMs += performance.now() - t0;
      c.claims = claims; c.memo = memo;
      if (g.hash === c.grid.hash && sameGates(c.grid, g)) { for (const [k, v] of g.gateState) c.grid.gateState.set(k, v); return c.grid; }
      c.grid = g; s.gridChanges++;
      return g;
    }
  }
  const g = buildGrid(world, region, c.terrain, claims, features);
  s.gridBuilds++; s.gridMs += performance.now() - t0;
  // Keep the old object when nothing that matters changed (search buffers stay warm).
  if (c.grid && c.grid.hash === g.hash && sameGates(c.grid, g)) {
    c.claims = claims; c.memo = memo; c.featureKey = features.key; c.staticKey = sKey;
    for (const [k, v] of g.gateState) c.grid.gateState.set(k, v); return c.grid;
  }
  c.grid = g; c.claims = claims; c.memo = memo; c.featureKey = features.key; c.staticKey = sKey;
  s.gridChanges++;
  return g;
}

/** Tests: the grid a full rebuild gives now (never cached). */
export function navGridFull(world: World, region: NavRegion, features: NavFeatures): NavGrid {
  return buildGrid(world, region, terrainLayer(world, region), worldClaims(world, region), features);
}

function sameGates(a: NavGrid, b: NavGrid): boolean {
  if (a.gateAt.size !== b.gateAt.size) return false;
  for (const [k, v] of a.gateAt) if (b.gateAt.get(k) !== v) return false;
  if (a.blockId.size !== b.blockId.size) return false;
  for (const [k, v] of a.blockId) if (b.blockId.get(k) !== v) return false;
  return true;
}

/** Drop cached grids (tests and tools). */
export function resetNavCache(world: World): void { caches.delete(world); }

// ---------- moving between cells ----------

export interface SearchOptions {
  /** Treat locked gates as passable (used only to explain a failure). */
  ignoreLocked?: boolean;
  /** Treat trees, bushes and rocks as passable (used only to explain a failure). */
  ignoreNature?: boolean;
  /** M012 animals: a gate is a passage only while it is open (they cannot open one); closed or locked it is a fence. */
  openGatesOnly?: boolean;
  /** M012 villagers: cells another walker stands on (never the start cell); also never chosen as the goal. */
  avoid?: (cell: number) => boolean;
  /** STAB-002 rules v7 animals: blocked cells walkable for this move (an animal walking out of a shelter footprint it is trapped in). */
  pass?: (cell: number) => boolean;
  maxExpansions: number;
}

const natureBlock = (b: number) => b === BLOCK.tree || b === BLOCK.rock;

function free(g: NavGrid, i: number, o: SearchOptions): boolean {
  const b = g.block[i];
  return (b === BLOCK.none || (!!o.ignoreNature && natureBlock(b)) || (!!o.pass && o.pass(i))) && !o.avoid?.(i);
}

/** Wall state of an orthogonal edge: 0 open, 1 gate (passable), 2 blocked. */
function edgeState(g: NavGrid, ax: number, az: number, bx: number, bz: number, o: SearchOptions): 0 | 1 | 2 {
  const e = edge(g, ax, az, bx, bz);
  if (e < 0) return 2;
  const bits = g.walls[e >> 1], south = (e & 1) === 1;
  const wall = bits & (south ? WALL_S : WALL_E), gate = bits & (south ? GATE_S : GATE_E);
  if (gate) {
    if (wall && !o.ignoreLocked) return 2;
    if (o.openGatesOnly) return g.gateState.get(g.gateAt.get(e)!) === 'open' ? 1 : 2;
    return 1;
  }
  return wall ? 2 : 0;
}

/** Cost of moving from cell a to the neighbour b (dx, dz in -1..1), or -1 when impossible. */
function moveCost(g: NavGrid, ax: number, az: number, dx: number, dz: number, o: SearchOptions): number {
  const bx = ax + dx, bz = az + dz;
  if (!g.inside(bx, bz)) return -1;
  const ia = g.index(ax, az), ib = g.index(bx, bz);
  if (!free(g, ib, o)) return -1;
  const dh = g.ground[ib] - g.ground[ia];
  if (dh > MAX_STEP || dh < -MAX_STEP) return -1;
  let cost = (dx !== 0 && dz !== 0 ? COST_DIAGONAL : COST_STRAIGHT) + g.extra[ib] + (dh !== 0 ? COST_STEP : 0);
  if (dx === 0 || dz === 0) {
    const s = edgeState(g, ax, az, bx, bz, o);
    if (s === 2) return -1;
    if (s === 1) cost += COST_GATE;
    return cost;
  }
  // Diagonal: both corner cells walkable and level enough, and no wall or gate on any of the four edges.
  const c1 = g.index(bx, az), c2 = g.index(ax, bz);
  if (!free(g, c1, o) || !free(g, c2, o)) return -1;
  for (const c of [c1, c2]) {
    if (Math.abs(g.ground[c] - g.ground[ia]) > MAX_STEP || Math.abs(g.ground[ib] - g.ground[c]) > MAX_STEP) return -1;
  }
  if (edgeState(g, ax, az, bx, az, o) !== 0 || edgeState(g, bx, az, bx, bz, o) !== 0
    || edgeState(g, ax, az, ax, bz, o) !== 0 || edgeState(g, ax, bz, bx, bz, o) !== 0) return -1;
  return cost;
}

/** True when a walker can move from cell a to neighbour b right now (gates count as passable unless locked). */
export function canMove(g: NavGrid, ax: number, az: number, bx: number, bz: number, o: SearchOptions = { maxExpansions: 0 }): boolean {
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) > 1 || Math.abs(dz) > 1 || (dx === 0 && dz === 0) || !g.inside(ax, az)) return false;
  return moveCost(g, ax, az, dx, dz, o) >= 0;
}

/**
 * M012: built things a body (the player) overlaps at feet (x, y, z) with the
 * given radius and height, as stable keys: solid cells (`c<index>`) and fence
 * or gate edges (`e<edge>`). A gate or door edge counts only while it is not
 * open. The same fence edges, gates and footprints the walkers route on.
 */
export function structureHits(g: NavGrid, gateState: (id: string) => GateState, x: number, y: number, z: number, r: number, height: number, out: string[] = []): string[] {
  const fx0 = Math.floor(x - r) - 1, fx1 = Math.floor(x + r) + 1, fz0 = Math.floor(z - r) - 1, fz1 = Math.floor(z + r) + 1;
  const vert = (lo: number, hi: number) => y + 0.02 < hi && y + height > lo + 0.02;
  for (let cz = fz0; cz <= fz1; cz++) {
    for (let cx = fx0; cx <= fx1; cx++) {
      if (!g.inside(cx, cz)) continue;
      const i = g.index(cx, cz), k = g.solid[i];
      if (k && x + r > cx && x - r < cx + 1 && z + r > cz && z - r < cz + 1 && vert(g.ground[i], g.ground[i] + SOLID_HEIGHT[k])) out.push(`c${i}`);
      const bits = g.walls[i];
      if (!bits) continue;
      for (const south of [false, true]) {
        const wall = bits & (south ? WALL_S : WALL_E), gate = bits & (south ? GATE_S : GATE_E);
        if (!wall && !gate) continue;
        const e = i * 2 + (south ? 1 : 0);
        if (gate && !wall && gateState(g.gateAt.get(e)!) === 'open') continue;
        const j = south ? g.index(cx, cz + 1) : g.index(cx + 1, cz);
        const lo = Math.min(g.ground[i], g.ground[j]), hi = Math.max(g.ground[i], g.ground[j]) + FENCE_HEIGHT;
        // The edge is a thin box along the cell side, a post's width past each end so corners close.
        const hit = south
          ? x + r > cx - FENCE_HALF && x - r < cx + 1 + FENCE_HALF && z + r > cz + 1 - FENCE_HALF && z - r < cz + 1 + FENCE_HALF
          : z + r > cz - FENCE_HALF && z - r < cz + 1 + FENCE_HALF && x + r > cx + 1 - FENCE_HALF && x - r < cx + 1 + FENCE_HALF;
        if (hit && vert(lo, hi)) out.push(`e${e}`);
      }
    }
  }
  return out;
}

// ---------- search ----------

/**
 * A destination: a point in decimetres, how close (dm) the walker must get,
 * and how far (dm) the point may move before the route is replanned (a
 * walking animal); fixed destinations use 0.
 */
export interface NavGoal { x: number; z: number; reach: number; drift?: number }
export type PathResult =
  | { ok: true; cells: number[]; cost: number; expanded: number }
  | { ok: false; code: 'no_route' | 'budget' | 'outside'; expanded: number };

const cellOfDm = (v: number) => Math.floor(v / 10);
const centreDm = (c: number) => c * 10 + 5;
const DIRS: ReadonlyArray<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

function octile(ax: number, az: number, bx: number, bz: number): number {
  const dx = Math.abs(ax - bx), dz = Math.abs(az - bz);
  return COST_STRAIGHT * Math.max(dx, dz) + (COST_DIAGONAL - COST_STRAIGHT) * Math.min(dx, dz);
}

/** Min-heap ordered by (f, h, cell index): a total order, so ties never depend on insertion. */
class Heap {
  private f: number[] = []; private h: number[] = []; private i: number[] = [];
  get size() { return this.i.length; }
  private less(a: number, b: number) {
    return this.f[a] < this.f[b] || (this.f[a] === this.f[b] && (this.h[a] < this.h[b] || (this.h[a] === this.h[b] && this.i[a] < this.i[b])));
  }
  private swap(a: number, b: number) {
    [this.f[a], this.f[b]] = [this.f[b], this.f[a]]; [this.h[a], this.h[b]] = [this.h[b], this.h[a]]; [this.i[a], this.i[b]] = [this.i[b], this.i[a]];
  }
  push(f: number, h: number, i: number) {
    this.f.push(f); this.h.push(h); this.i.push(i);
    let k = this.i.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (!this.less(k, p)) break; this.swap(k, p); k = p; }
  }
  pop(): number {
    const top = this.i[0], last = this.i.length - 1;
    this.swap(0, last); this.f.pop(); this.h.pop(); this.i.pop();
    let k = 0;
    for (;;) {
      const l = 2 * k + 1, r = l + 1;
      let m = k;
      if (l < this.i.length && this.less(l, m)) m = l;
      if (r < this.i.length && this.less(r, m)) m = r;
      if (m === k) break;
      this.swap(k, m); k = m;
    }
    return top;
  }
}

/** Cells (world metres) whose centre is within `reach` of the goal point. */
function isGoal(x: number, z: number, goal: NavGoal): boolean {
  const dx = centreDm(x) - goal.x, dz = centreDm(z) - goal.z;
  return dx * dx + dz * dz <= goal.reach * goal.reach;
}

/**
 * Shortest route from a point (dm) to a goal. The start cell may itself be
 * blocked (a walker standing where a gate just locked can still step out).
 * Returns the cells after the start cell, as flat [x0, z0, x1, z1, ...].
 */
export function findPath(world: World, g: NavGrid, from: { x: number; z: number }, goal: NavGoal, o: SearchOptions): PathResult {
  const t0 = performance.now();
  const s = navStats(world);
  s.searches++;
  const res = search(g, from, goal, o);
  s.expanded += res.expanded; s.searchMs += performance.now() - t0;
  return res;
}

/**
 * M012 rules v4: which of several destinations is nearest by route cost (a
 * Dijkstra search from the walker over the same moves `findPath` uses). Ties
 * on cost go to the smallest id, so the choice never depends on input order.
 */
export function findNearest(world: World, g: NavGrid, from: { x: number; z: number }, goals: ReadonlyArray<NavGoal & { id: string }>, o: SearchOptions):
  { ok: true; id: string; cost: number; expanded: number } | { ok: false; code: 'no_route' | 'budget' | 'outside'; expanded: number } {
  const t0 = performance.now();
  const s = navStats(world);
  s.searches++;
  const sx = cellOfDm(from.x), sz = cellOfDm(from.z);
  const done = (r: { ok: true; id: string; cost: number; expanded: number } | { ok: false; code: 'no_route' | 'budget' | 'outside'; expanded: number }) => {
    s.expanded += r.expanded; s.searchMs += performance.now() - t0; return r;
  };
  if (!g.inside(sx, sz)) return done({ ok: false, code: 'outside', expanded: 0 });
  if (!goals.length) return done({ ok: false, code: 'no_route', expanded: 0 });
  g.g.fill(-1); g.closed.fill(0);
  const start = g.index(sx, sz);
  const heap = new Heap();
  g.g[start] = 0; g.parent[start] = -1;
  heap.push(0, 0, start);
  let expanded = 0, best = -1;
  const found: string[] = [];
  while (heap.size) {
    const i = heap.pop();
    if (g.closed[i]) continue;
    if (best >= 0 && g.g[i] > best) break;
    g.closed[i] = 1;
    const x = g.cellX(i), z = g.cellZ(i);
    if (i !== start || g.block[i] === BLOCK.none) {
      for (const goal of goals) if (isGoal(x, z, goal)) { best = g.g[i]; found.push(goal.id); }
    }
    if (best >= 0) continue;
    if (++expanded > o.maxExpansions) return done({ ok: false, code: 'budget', expanded });
    for (const [dx, dz] of DIRS) {
      const c = moveCost(g, x, z, dx, dz, o);
      if (c < 0) continue;
      const j = g.index(x + dx, z + dz);
      if (g.closed[j]) continue;
      const ng = g.g[i] + c;
      if (g.g[j] >= 0 && g.g[j] <= ng) continue;
      g.g[j] = ng; g.parent[j] = i;
      heap.push(ng, 0, j);
    }
  }
  if (best < 0) return done({ ok: false, code: 'no_route', expanded });
  found.sort();
  return done({ ok: true, id: found[0], cost: best, expanded });
}

/**
 * M013: route cost (tenths of a metre) from a point to every reachable cell
 * of the grid, by the same moves walkers use (-1: unreachable). Read-only
 * planning queries (woodland statistics, M014 placement previews) use it;
 * nothing in the hashed sim depends on it.
 */
export function distanceField(g: NavGrid, from: { x: number; z: number }, maxExpansions = 40_000, avoid?: (cell: number) => boolean): Int32Array {
  const out = new Int32Array(g.w * g.h).fill(-1);
  const sx = cellOfDm(from.x), sz = cellOfDm(from.z);
  if (!g.inside(sx, sz)) return out;
  const closed = new Uint8Array(g.w * g.h);
  const heap = new Heap();
  const start = g.index(sx, sz);
  out[start] = 0;
  heap.push(0, 0, start);
  // M014: `avoid` treats extra cells as blocked (a building that is not on the grid yet).
  const o: SearchOptions = avoid ? { maxExpansions, avoid } : { maxExpansions };
  let expanded = 0;
  while (heap.size && expanded < maxExpansions) {
    const i = heap.pop();
    if (closed[i]) continue;
    closed[i] = 1; expanded++;
    const x = g.cellX(i), z = g.cellZ(i);
    for (const [dx, dz] of DIRS) {
      const c = moveCost(g, x, z, dx, dz, o);
      if (c < 0) continue;
      const j = g.index(x + dx, z + dz);
      const ng = out[i] + c;
      if (closed[j] || (out[j] >= 0 && out[j] <= ng)) continue;
      out[j] = ng;
      heap.push(ng, 0, j);
    }
  }
  return out;
}

function search(g: NavGrid, from: { x: number; z: number }, goal: NavGoal, o: SearchOptions): PathResult {
  const sx = cellOfDm(from.x), sz = cellOfDm(from.z);
  const tx = cellOfDm(goal.x), tz = cellOfDm(goal.z);
  if (!g.inside(sx, sz)) return { ok: false, code: 'outside', expanded: 0 };
  g.g.fill(-1); g.closed.fill(0);
  const start = g.index(sx, sz);
  const heap = new Heap();
  const hOf = (x: number, z: number) => Math.max(0, octile(x, z, tx, tz) - goal.reach);
  g.g[start] = 0; g.parent[start] = -1;
  heap.push(hOf(sx, sz), hOf(sx, sz), start);
  let expanded = 0;
  while (heap.size) {
    const i = heap.pop();
    if (g.closed[i]) continue;
    g.closed[i] = 1;
    const x = g.cellX(i), z = g.cellZ(i);
    if ((i !== start || g.block[i] === BLOCK.none || (o.ignoreNature && natureBlock(g.block[i]))) && isGoal(x, z, goal) && !(i !== start && o.avoid?.(i))) {
      const cells: number[] = [];
      for (let k = i; k !== start; k = g.parent[k]) cells.push(g.cellZ(k), g.cellX(k));
      cells.reverse();
      return { ok: true, cells, cost: g.g[i], expanded };
    }
    if (++expanded > o.maxExpansions) return { ok: false, code: 'budget', expanded };
    for (const [dx, dz] of DIRS) {
      const c = moveCost(g, x, z, dx, dz, o);
      if (c < 0) continue;
      const j = g.index(x + dx, z + dz);
      if (g.closed[j]) continue;
      const ng = g.g[i] + c;
      if (g.g[j] >= 0 && g.g[j] <= ng) continue;
      g.g[j] = ng; g.parent[j] = i;
      const h = hOf(x + dx, z + dz);
      heap.push(ng + h, h, j);
    }
  }
  return { ok: false, code: 'no_route', expanded };
}

/** What stops a walker reaching a goal: the first locked gate, tree or rock on the best route around it, or the destination itself. */
export function explainNoRoute(world: World, g: NavGrid, from: { x: number; z: number }, goal: NavGoal, budget: number): { reason: string; by: string; expanded: number } {
  let expanded = 0;
  const tx = cellOfDm(goal.x), tz = cellOfDm(goal.z);
  if (!g.inside(cellOfDm(from.x), cellOfDm(from.z)) || !g.inside(tx, tz)) return { reason: 'the destination is outside the settlement', by: 'outside', expanded };
  const withGates = findPath(world, g, from, goal, { ignoreLocked: true, maxExpansions: budget });
  expanded += withGates.expanded;
  if (withGates.ok) {
    let px = cellOfDm(from.x), pz = cellOfDm(from.z);
    for (let k = 0; k < withGates.cells.length; k += 2) {
      const gate = g.gateBetween(px, pz, withGates.cells[k], withGates.cells[k + 1]);
      if (gate && g.gateState.get(gate) === 'locked') return { reason: `the ${gateLabel(gate)} is locked`, by: gate, expanded };
      px = withGates.cells[k]; pz = withGates.cells[k + 1];
    }
  }
  const through = findPath(world, g, from, goal, { ignoreLocked: true, ignoreNature: true, maxExpansions: budget });
  expanded += through.expanded;
  if (through.ok) {
    for (let k = 0; k < through.cells.length; k += 2) {
      const i = g.index(through.cells[k], through.cells[k + 1]);
      if (natureBlock(g.block[i])) return { reason: `${REASON_TEXT[REASON_NAMES[g.block[i]]]} blocks the way`, by: g.blockId.get(i) ?? REASON_NAMES[g.block[i]], expanded };
    }
  }
  // Nothing passable near the destination itself?
  let standable = false, worst: BlockReason = 'none', worstId = '';
  const r = Math.ceil(goal.reach / 10) + 1;
  for (let z = tz - r; z <= tz + r; z++) {
    for (let x = tx - r; x <= tx + r; x++) {
      if (!g.inside(x, z) || !isGoal(x, z, goal)) continue;
      const i = g.index(x, z);
      if (g.block[i] === BLOCK.none) standable = true;
      else if (worst === 'none') { worst = REASON_NAMES[g.block[i]]; worstId = g.blockId.get(i) ?? worst; }
    }
  }
  if (!standable) return { reason: `the destination is ${worst === 'none' ? 'not walkable' : `taken by ${REASON_TEXT[worst]}`}`, by: worstId || worst, expanded };
  return { reason: 'no walkable route: cliffs, deep water or fences cut it off', by: 'terrain', expanded };
}

export function gateLabel(id: string): string {
  const [kind, name] = id.split(':');
  return kind === 'door' ? `${name} door` : `${name} gate`;
}

// ---------- routes as state ----------

/** Keep only the cells where the direction changes (and the last). */
export function compressPath(cells: number[], startX: number, startZ: number): number[] {
  const out: number[] = [];
  let px = startX, pz = startZ, dx = NaN, dz = NaN;
  for (let k = 0; k < cells.length; k += 2) {
    const x = cells[k], z = cells[k + 1], ndx = x - px, ndz = z - pz;
    if (out.length && ndx === dx && ndz === dz) { out[out.length - 2] = x; out[out.length - 1] = z; }
    else out.push(x, z);
    dx = ndx; dz = ndz; px = x; pz = z;
  }
  return out;
}

/** Every cell of a compressed route, walking from (startX, startZ). */
export function expandPath(corners: number[], startX: number, startZ: number): number[] {
  const out: number[] = [];
  let x = startX, z = startZ;
  for (let k = 0; k < corners.length; k += 2) {
    const tx = corners[k], tz = corners[k + 1];
    if (x === tx && z === tz && out.length === 0) { out.push(x, z); continue; }
    let guard = 0;
    while ((x !== tx || z !== tz) && guard++ < 512) { x += Math.sign(tx - x); z += Math.sign(tz - z); out.push(x, z); }
  }
  return out;
}

/** A walker's route state (saved with the walker; integers and strings only). */
export interface NavState {
  /** Corner cells still to walk (world metres, flat x, z pairs). */
  path: number[];
  /** Grid hash the route was planned on; any change triggers a replan. */
  plan: string;
  /** Destination point (dm) and reach (dm) the route serves. */
  dest: [number, number, number];
  /** A closed gate the walker stopped at; it opens it on its next tick. */
  opening?: string;
  /** A gate this walker opened and must close behind itself, and the far cell. */
  opened?: string;
  far?: [number, number];
  blocked?: NavBlocked;
  /** M012 (rules v3): waiting for another villager to move out of the next cell (queueing at a gate, a door or a work spot). */
  wait?: NavWait;
}
export interface NavBlocked { reason: string; by: string; target: string; since: number }
export interface NavWait { by: string; reason: string; since: number }

export interface NavContext {
  world: World;
  grid: NavGrid;
  tick: number;
  /** Shared search budget for this tick (expansions), decremented by every search. */
  budget: { left: number };
  gate(id: string): GateState;
  setGate(id: string, state: GateState): void;
  /** May this walker open and close the gate (it is never asked for a locked one). */
  canOperate(id: string): boolean;
  /**
   * M012 (settlement rules v3): cells other walkers stand on or are stepping
   * into (cell index -> walker id). A walker never enters one; it waits, or
   * takes a way round when there is one. Absent under v2 (walkers ignore each other).
   */
  occupied?: Map<number, string>;
  /** This walker's id (its own cells are never in its way). */
  self?: string;
  /** Who another walker is waiting for right now: a mutual wait is broken by the later id stepping aside. */
  waitingOn?(id: string): string | undefined;
  nameOf?(id: string): string;
  /**
   * STAB-002 S2 (rules v7 with the player's presence): how far (0..1) this
   * walker may go along a move from a to b (dm) before it would come too
   * close to the player. A cut move ends there and the walker waits for
   * `clipBy` (the player). Absent: every move is whole.
   */
  clip?(ax: number, az: number, bx: number, bz: number): number;
  clipBy?: string;
  /** STAB-002 S2: a gate that must not be closed right now (the player stands in one of its cells). */
  keepOpen?(gateId: string): boolean;
}

/** Expansions a detour around other walkers may use before the walker just waits in line. */
export const DETOUR_BUDGET = 4000;
/** A waiting walker looks for a way round when it starts waiting and then every this many ticks. */
export const DETOUR_EVERY = 4;

export type NavStep =
  | { status: 'arrived' }
  | { status: 'moving' }
  | { status: 'waiting' }
  | { status: 'blocked'; reason: string; by: string; fresh: boolean };

const dist = (ax: number, az: number, bx: number, bz: number) => { const dx = bx - ax, dz = bz - az; return Math.sqrt(dx * dx + dz * dz); };

/**
 * Walk one tick toward a goal: replan when the grid or goal changed, stop to
 * open closed gates, close them behind, and report a real obstruction when
 * no route exists. The walker only ever moves along a valid route: there is
 * no teleport and no straight-line fallback.
 */
export function navStep(ctx: NavContext, w: { x: number; z: number; nav?: NavState }, goal: NavGoal, speed: number, target: string): NavStep {
  const g = ctx.grid;
  let nav = w.nav;
  // Open the gate it stopped at (one tick of work), unless it was locked meanwhile.
  if (nav?.opening) {
    const id = nav.opening;
    delete nav.opening;
    const st = ctx.gate(id);
    if (st === 'closed' && ctx.canOperate(id)) {
      ctx.setGate(id, 'open');
      nav.opened = id;
      return { status: 'moving' };
    }
    if (st === 'locked') nav.plan = '';
  }
  const here = (): [number, number] => [cellOfDm(w.x), cellOfDm(w.z)];
  const finalPoint = (cx: number, cz: number, last: boolean, dest: [number, number, number]): [number, number] =>
    last && cellOfDm(dest[0]) === cx && cellOfDm(dest[1]) === cz ? [dest[0], dest[1]] : [centreDm(cx), centreDm(cz)];
  const atFinal = (n: NavState) => {
    if (n.path.length) return false;
    const [cx, cz] = here();
    if (!isGoal(cx, cz, { x: n.dest[0], z: n.dest[1], reach: n.dest[2] })) return false;
    const [fx, fz] = finalPoint(cx, cz, true, n.dest);
    return w.x === fx && w.z === fz;
  };
  const drift = goal.drift ?? 0;
  const goalMoved = !nav || nav.dest[2] !== goal.reach
    || Math.abs(nav.dest[0] - goal.x) > drift || Math.abs(nav.dest[1] - goal.z) > drift;
  // Blocked with nothing changed: the answer would be the same, so do not search again.
  if (nav?.blocked && !goalMoved && nav.plan === g.hash && !nav.path.length && nav.blocked.target === target) {
    closeBehind(ctx, w, nav);
    return { status: 'blocked', reason: nav.blocked.reason, by: nav.blocked.by, fresh: false };
  }
  if (!nav || goalMoved || nav.plan !== g.hash || (!nav.path.length && !atFinal(nav))) {
    if (ctx.budget.left <= 0) return { status: 'waiting' };
    const [sx, sz] = here();
    // v3: prefer a route round other walkers that ends on a free spot; else the plain route (then queue on it).
    let res: PathResult | null = null;
    const avoid = othersAt(ctx);
    if (avoid && freeGoalCell(g, goal, avoid)) {
      const r1 = findPath(ctx.world, g, w, goal, { maxExpansions: Math.min(ctx.budget.left, DETOUR_BUDGET), avoid });
      ctx.budget.left -= r1.expanded;
      if (r1.ok) res = r1;
    }
    if (!res) {
      if (ctx.budget.left <= 0) return { status: 'waiting' };
      res = findPath(ctx.world, g, w, goal, { maxExpansions: ctx.budget.left });
      ctx.budget.left -= res.expanded;
    }
    if (!res.ok && res.code === 'budget') return { status: 'waiting' };
    const keep: Partial<NavState> = nav ? { ...(nav.opened ? { opened: nav.opened } : {}), ...(nav.far ? { far: nav.far } : {}) } : {};
    if (!res.ok) {
      const why = res.code === 'outside' ? { reason: 'it is outside the settlement grid', by: 'outside', expanded: 0 }
        : explainNoRoute(ctx.world, g, w, goal, Math.max(0, ctx.budget.left));
      ctx.budget.left -= why.expanded;
      const prev = nav?.blocked;
      const fresh = !prev || prev.target !== target || prev.reason !== why.reason;
      nav = { path: [], plan: g.hash, dest: [goal.x, goal.z, goal.reach], ...keep,
        blocked: { reason: why.reason, by: why.by, target, since: fresh ? ctx.tick : prev!.since } };
      w.nav = nav;
      closeBehind(ctx, w, nav);
      return { status: 'blocked', reason: why.reason, by: why.by, fresh };
    }
    // An off-centre start walks to its own cell centre first, so every gate check happens at a centre.
    // Already in a goal cell: the route is that cell (to the exact spot when it lies inside it).
    const cells = !res.cells.length ? [sx, sz]
      : w.x !== centreDm(sx) || w.z !== centreDm(sz) ? [sx, sz, ...res.cells] : res.cells;
    nav = { path: compressPath(cells, sx, sz), plan: g.hash, dest: [goal.x, goal.z, goal.reach], ...keep };
    w.nav = nav;
  }
  // Walk along the route.
  let budget = speed;
  const [sx0, sz0] = here();
  const cells = expandPath(nav.path, sx0, sz0);
  let moved = false;
  let waitFor: string | null = null, waitCell: [number, number] | null = null;
  while (budget > 0 && cells.length) {
    const nx = cells[0], nz = cells[1];
    const [cx, cz] = here();
    if (w.x === centreDm(cx) && w.z === centreDm(cz) && (nx !== cx || nz !== cz)) {
      // About to leave a centre for the next cell: is the edge still passable?
      if (!canMove(g, cx, cz, nx, nz)) { nav.plan = ''; break; }
      // v3: is another walker standing there (or stepping into it)?
      const occ = ctx.occupied?.get(g.index(nx, nz));
      if (occ !== undefined && occ !== ctx.self) { waitFor = occ; waitCell = [nx, nz]; break; }
      const gate = g.gateBetween(cx, cz, nx, nz);
      if (gate) {
        const st = ctx.gate(gate);
        if (st === 'locked' || (st === 'closed' && !ctx.canOperate(gate))) { nav.plan = ''; break; }
        if (st === 'closed') { nav.opening = gate; break; }
        if (nav.opened === gate) nav.far = [nx, nz];
      }
    }
    const [tx, tz] = finalPoint(nx, nz, cells.length === 2, nav.dest);
    const d = dist(w.x, w.z, tx, tz);
    if (ctx.clip) {
      // STAB-002 S2: never walk into the player; stop short and wait for them to pass.
      const reach = Math.min(d, budget);
      const ex = d > 0 ? w.x + ((tx - w.x) / d) * reach : tx, ez = d > 0 ? w.z + ((tz - w.z) / d) * reach : tz;
      const t = ctx.clip(w.x, w.z, ex, ez);
      if (t < 1) {
        const k = Math.floor(t * reach);
        if (k > 0 && d > 0) {
          w.x += Math.trunc(((tx - w.x) / d) * k); w.z += Math.trunc(((tz - w.z) / d) * k);
          moved = true;
        }
        waitFor = ctx.clipBy ?? 'player'; waitCell = [nx, nz];
        break;
      }
    }
    if (d <= budget) {
      w.x = tx; w.z = tz; budget -= d; cells.splice(0, 2); moved = true;
      if (nav.opened && nav.far && nav.far[0] === nx && nav.far[1] === nz) closeBehind(ctx, w, nav, true);
      continue;
    }
    w.x += Math.round(((tx - w.x) / d) * budget); w.z += Math.round(((tz - w.z) / d) * budget);
    moved = true;
    break;
  }
  const [ex, ez] = here();
  nav.path = compressPath(cells, ex, ez);
  closeBehind(ctx, w, nav);
  if (nav.blocked) delete nav.blocked;
  if (waitFor && waitCell && !moved) return queue(ctx, w, nav, waitFor, waitCell, goal, speed);
  if (nav.wait && (moved || !waitFor)) delete nav.wait;
  if (!cells.length && atFinal(nav)) return { status: 'arrived' };
  return moved || nav.opening ? { status: 'moving' } : { status: 'waiting' };
}

/** Cells other walkers hold, as a search filter (v3 only). */
function othersAt(ctx: NavContext): ((i: number) => boolean) | undefined {
  const occ = ctx.occupied;
  if (!occ) return undefined;
  return (i) => { const o = occ.get(i); return o !== undefined && o !== ctx.self; };
}

/** Is any standable goal cell free of other walkers? (A search that must end on a free spot is only tried then.) */
function freeGoalCell(g: NavGrid, goal: NavGoal, avoid: (i: number) => boolean): boolean {
  const tx = cellOfDm(goal.x), tz = cellOfDm(goal.z), r = Math.ceil(goal.reach / 10) + 1;
  for (let z = tz - r; z <= tz + r; z++) {
    for (let x = tx - r; x <= tx + r; x++) {
      if (!g.inside(x, z) || !isGoal(x, z, goal)) continue;
      const i = g.index(x, z);
      if (g.block[i] === BLOCK.none && !avoid(i)) return true;
    }
  }
  return false;
}

/**
 * The next cell is taken by another walker: wait in line (the reason is
 * kept on the route state), look for a way round now and then, and break a
 * head-on standoff by having the later id step aside to a free neighbour.
 */
function queue(ctx: NavContext, w: { x: number; z: number; nav?: NavState }, nav: NavState, by: string, cell: [number, number], goal: NavGoal, speed: number): NavStep {
  const g = ctx.grid;
  const cx = cellOfDm(w.x), cz = cellOfDm(w.z);
  const name = ctx.nameOf?.(by) ?? by;
  let gate = g.gateBetween(cx, cz, cell[0], cell[1]);
  for (const [dx, dz] of DIRS.slice(0, 4)) gate ??= g.gateBetween(cell[0], cell[1], cell[0] + dx, cell[1] + dz);
  const reason = gate ? `queueing at the ${gateLabel(gate)} behind ${name}`
    : isGoal(cell[0], cell[1], { x: nav.dest[0], z: nav.dest[1], reach: nav.dest[2] }) ? `waiting for ${name} to make room` : `waiting for ${name} to pass`;
  const since = nav.wait && nav.wait.by === by ? nav.wait.since : ctx.tick;
  nav.wait = { by, reason, since };
  const avoid = othersAt(ctx)!;
  if (ctx.waitingOn?.(by) === ctx.self && ctx.self! > by) {
    // Head-on: step aside into a free neighbour that is not the other walker's.
    for (const [dx, dz] of DIRS) {
      const sx = cx + dx, sz = cz + dz;
      if (!g.inside(sx, sz) || (sx === cell[0] && sz === cell[1]) || avoid(g.index(sx, sz)) || !canMove(g, cx, cz, sx, sz)) continue;
      if (g.gateBetween(cx, cz, sx, sz)) continue;
      const tx = centreDm(sx), tz = centreDm(sz), d = dist(w.x, w.z, tx, tz);
      if (ctx.clip && ctx.clip(w.x, w.z, d <= speed ? tx : w.x + ((tx - w.x) / d) * speed, d <= speed ? tz : w.z + ((tz - w.z) / d) * speed) < 1) continue;
      if (d <= speed) { w.x = tx; w.z = tz; } else { w.x += Math.round(((tx - w.x) / d) * speed); w.z += Math.round(((tz - w.z) / d) * speed); }
      nav.path = d <= speed ? [] : [sx, sz];
      nav.plan = '';
      nav.wait = { by, reason: `stepping aside for ${name}`, since };
      return { status: 'moving' };
    }
    return { status: 'waiting' };
  }
  if ((ctx.tick - since) % DETOUR_EVERY === 0 && ctx.budget.left > 0) {
    const r = findPath(ctx.world, g, w, goal, { maxExpansions: Math.min(ctx.budget.left, DETOUR_BUDGET), avoid });
    ctx.budget.left -= r.expanded;
    if (r.ok) {
      const cells = !r.cells.length ? [cx, cz] : w.x !== centreDm(cx) || w.z !== centreDm(cz) ? [cx, cz, ...r.cells] : r.cells;
      nav.path = compressPath(cells, cx, cz);
    }
  }
  return { status: 'waiting' };
}

/** Close a gate this walker opened once it is through (or has left it behind). */
function closeBehind(ctx: NavContext, w: { x: number; z: number }, nav: NavState, through = false): void {
  if (!nav.opened) return;
  const cells = ctx.grid.gateCells.get(nav.opened);
  const cx = cellOfDm(w.x), cz = cellOfDm(w.z);
  const onGate = !!cells && ((cells[0] === cx && cells[1] === cz) || (cells[2] === cx && cells[3] === cz));
  if (!through && onGate) return;
  // STAB-002 S2: never shut a gate onto the player; it is closed on a later tick, once they are out of it.
  if (ctx.keepOpen?.(nav.opened)) return;
  if (ctx.gate(nav.opened) === 'open') ctx.setGate(nav.opened, 'closed');
  delete nav.opened;
  delete nav.far;
}

/** Decimetre helpers for callers. */
export const navCell = cellOfDm;
export const navCentre = centreDm;
export { CHUNK_SIZE as NAV_CHUNK };
