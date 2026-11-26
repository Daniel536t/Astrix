// W5: world-scale walking routes (pure TypeScript, deterministic, no three.js).
//
// Two layers, both derived and never saved:
//  - coarse: an 8 m lattice of nodes over the generated terrain of the whole
//    world. An edge between neighbouring nodes exists only when the 1 m
//    walk along it obeys the walking rules of sim/nav.ts exactly: every
//    1 m move steps at most MAX_STEP, never enters water deeper than
//    WADE_MAX (deep water), diagonal moves keep both corner cells walkable
//    and level, and never enters a building footprint. Costs are nav's own
//    (tenths of a metre, +COST_STEP per step, +COST_FORD per wading cell). So
//    every drawn segment of a route is a walkable 1 m path on the generated
//    terrain: never a straight line through a cliff or a lake. It is
//    conservative: a walkable zig-zag between lattice lines is not seen.
//  - local: near the player, nav's own 1 m grid of the live world (voxel
//    edits, buildings, trees, rocks) refines the first stretch (refineStart).
//
// The coarse search is A* (octile heuristic, total order on ties) that runs
// in bounded steps, so the caller can spread it over frames; the result never
// depends on how it was sliced. A backward flood from the destination runs
// beside it: when either side runs out of nodes, no route exists, and the
// refused edges around that side say why (deep water, cliffs, a building, the
// world's edge). Terrain is sampled once per 32 m tile and cached.
import { HALF, WORLD_SIZE, baseHeightAt, baseWaterLevelAt, terrainV2, GENERATOR_V2 } from './world';
import {
  COST_DIAGONAL, COST_FORD, COST_STEP, COST_STRAIGHT, Heap, MAX_STEP, WADE_MAX, findPath, compressPath,
} from './nav';
import type { World } from './world';
import { siteCellsOf, windowGrid } from './wild-build';

export const TILE = 32;
const TILES = WORLD_SIZE / TILE;
export const COARSE = 8;
export const NODES = WORLD_SIZE / COARSE;
/** Forward search budget (nodes expanded); the world has NODES² = 65,536. */
export const ROUTE_BUDGET = 60_000;
/** The backward flood gives up (the destination is not closed in) after this many nodes. */
const FLOOD_LIMIT = 6_000;

export interface TerrainTile { h: Int16Array; d: Uint8Array }

/** Cached 1 m terrain samples of one seed and generator (32 m tiles, FIFO-capped). */
export class TerrainCache {
  private readonly tiles: Array<TerrainTile | undefined> = new Array(TILES * TILES);
  private readonly order: number[] = [];
  built = 0; ms = 0;
  constructor(readonly seed: number, readonly gen: number, readonly cap = 1500) {}
  tile(tx: number, tz: number): TerrainTile {
    const k = tz * TILES + tx;
    const hit = this.tiles[k];
    if (hit) return hit;
    const t0 = performance.now();
    const h = new Int16Array(TILE * TILE), d = new Uint8Array(TILE * TILE);
    const ox = -HALF + tx * TILE, oz = -HALF + tz * TILE;
    const v2 = this.gen >= GENERATOR_V2 ? terrainV2(this.seed) : null;
    for (let z = 0; z < TILE; z++) for (let x = 0; x < TILE; x++) {
      const wx = ox + x, wz = oz + z, i = z * TILE + x;
      if (v2) { const c = v2.column(wx, wz); h[i] = c.h; d[i] = Math.max(0, Math.min(255, c.level - c.h)); }
      else { const hh = baseHeightAt(this.seed, this.gen, wx, wz); h[i] = hh; d[i] = Math.max(0, Math.min(255, baseWaterLevelAt(this.seed, this.gen, wx, wz) - hh)); }
    }
    const t: TerrainTile = { h, d };
    this.tiles[k] = t;
    this.order.push(k);
    if (this.order.length > this.cap) this.tiles[this.order.shift()!] = undefined;
    this.built++; this.ms += performance.now() - t0;
    return t;
  }
  has(tx: number, tz: number): boolean { return !!this.tiles[tz * TILES + tx]; }
  /** Height (top solid + 1) of the 1 m column (x, z); x, z integers inside the world. */
  h(x: number, z: number): number {
    const tx = (x + HALF) >> 5, tz = (z + HALF) >> 5;
    return this.tile(tx, tz).h[((z + HALF) & 31) * TILE + ((x + HALF) & 31)];
  }
  d(x: number, z: number): number {
    const tx = (x + HALF) >> 5, tz = (z + HALF) >> 5;
    return this.tile(tx, tz).d[((z + HALF) & 31) * TILE + ((x + HALF) & 31)];
  }
}
const caches = new Map<string, TerrainCache>();
export function terrainCache(seed: number, gen: number): TerrainCache {
  const k = `${seed}:${gen}`;
  let c = caches.get(k);
  if (!c) { c = new TerrainCache(seed, gen); caches.set(k, c); }
  return c;
}

/** Why an edge is refused. */
export const EDGE = { ok: 0, cliff: 1, deep_water: 2, building: 3, outside: 4 } as const;
export type EdgeReason = Exclude<keyof typeof EDGE, 'ok'>;
const EDGE_NAMES: EdgeReason[] = ['cliff', 'deep_water', 'building', 'outside'];
const EDGE_TEXT: Record<EdgeReason, string> = {
  cliff: 'cliffs (steps over 1 m)', deep_water: 'deep water (over 1 m)', building: 'buildings', outside: 'the edge of the world',
};

export const nodeOf = (v: number) => Math.max(0, Math.min(NODES - 1, Math.floor((v + HALF) / COARSE)));
export const nodeCentre = (i: number) => -HALF + i * COARSE + COARSE / 2;
const MARGIN = 2;
const inside = (x: number, z: number) => x >= -HALF + MARGIN && z >= -HALF + MARGIN && x < HALF - MARGIN && z < HALF - MARGIN;

/** The terrain and the obstacles a route reads. `blocked` holds 1 m cells (x * 4096 + z, offset) inside building footprints. */
export interface RouteGround { t: TerrainCache; blocked: Set<number> }
export const cellKey = (x: number, z: number) => (x + HALF) * 4096 + (z + HALF);

/** Building footprints of a wilderness world as blocked 1 m cells. */
export function blockedCells(world: World): Set<number> {
  const out = new Set<number>();
  for (const s of world.wild?.build?.sites.values() ?? []) {
    const c = siteCellsOf(s);
    for (let z = c.z0; z < c.z1; z++) for (let x = c.x0; x < c.x1; x++) out.add(cellKey(x, z));
  }
  return out;
}

/** Can a walker stand on the 1 m cell (x, z)? 0 = yes, else the reason. */
function cellReason(g: RouteGround, x: number, z: number): number {
  if (!inside(x, z)) return EDGE.outside;
  if (g.t.d(x, z) > WADE_MAX) return EDGE.deep_water;
  if (g.blocked.size && g.blocked.has(cellKey(x, z))) return EDGE.building;
  return 0;
}

/**
 * Cost of the 1 m move a -> b (dx, dz in -1..1), or -(reason) when it is not
 * allowed: the rules of nav.ts `moveCost` on terrain without fences or gates.
 */
export function stepCost(g: RouteGround, ax: number, az: number, dx: number, dz: number): number {
  const bx = ax + dx, bz = az + dz;
  const rb = cellReason(g, bx, bz);
  if (rb) return -rb;
  const ha = g.t.h(ax, az), hb = g.t.h(bx, bz);
  const dh = hb - ha;
  if (dh > MAX_STEP || dh < -MAX_STEP) return -EDGE.cliff;
  let cost = (dx !== 0 && dz !== 0 ? COST_DIAGONAL : COST_STRAIGHT) + (g.t.d(bx, bz) > 0 ? COST_FORD : 0) + (dh !== 0 ? COST_STEP : 0);
  if (dx !== 0 && dz !== 0) {
    for (const [cx, cz] of [[bx, az], [ax, bz]] as const) {
      const rc = cellReason(g, cx, cz);
      if (rc) return -rc;
      const hc = g.t.h(cx, cz);
      if (Math.abs(hc - ha) > MAX_STEP || Math.abs(hb - hc) > MAX_STEP) return -EDGE.cliff;
    }
  }
  return cost;
}

/** Cost of the 1 m walk from node (i, j) to its neighbour (i + di, j + dj), or -(reason). */
export function edgeCost(g: RouteGround, i: number, j: number, di: number, dj: number): number {
  const ni = i + di, nj = j + dj;
  if (ni < 0 || nj < 0 || ni >= NODES || nj >= NODES) return -EDGE.outside;
  let x = nodeCentre(i), z = nodeCentre(j), cost = 0;
  for (let k = 0; k < COARSE; k++) {
    const c = stepCost(g, x, z, di, dj);
    if (c < 0) return c;
    cost += c; x += di; z += dj;
  }
  return cost;
}

/** Is the 1 m line from (x0, z0) to (x1, z1) (integers) walkable under the same rules? Returns its cost or -(reason). */
export function lineCost(g: RouteGround, x0: number, z0: number, x1: number, z1: number): number {
  let x = x0, z = z0, cost = 0;
  if (cellReason(g, x, z)) return -cellReason(g, x, z);
  // Bresenham's 8-connected line: each move is one of nav's 1 m moves.
  const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0), sx = Math.sign(x1 - x0), sz = Math.sign(z1 - z0);
  let err = dx - dz;
  while (x !== x1 || z !== z1) {
    const e2 = 2 * err;
    let mx = 0, mz = 0;
    if (e2 > -dz) { err -= dz; mx = sx; }
    if (e2 < dx) { err += dx; mz = sz; }
    const c = stepCost(g, x, z, mx, mz);
    if (c < 0) return c;
    cost += c; x += mx; z += mz;
  }
  return cost;
}

const DIRS: ReadonlyArray<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
const ORTH = COARSE * COST_STRAIGHT, DIAG = COARSE * COST_DIAGONAL;
const octile = (ai: number, aj: number, bi: number, bj: number) => {
  const dx = Math.abs(ai - bi), dz = Math.abs(aj - bj);
  return ORTH * Math.max(dx, dz) + (DIAG - ORTH) * Math.min(dx, dz);
};

export interface RoutePoint { x: number; z: number }
export type RouteCode = 'outside' | 'deep_destination' | 'deep_start' | 'cut_off' | 'closed_in' | 'too_far' | 'same_place';
export type RouteResult =
  | { ok: true; points: RoutePoint[]; length: number; cost: number; fords: number; wadeM: number; expanded: number }
  | { ok: false; code: RouteCode; reason: string; expanded: number; causes: Partial<Record<EdgeReason, number>> };

/** The node a point stands on, or the nearest standable node within `r` nodes (deterministic order), or -1. */
function standableNode(g: RouteGround, x: number, z: number, r: number): number {
  const i0 = nodeOf(x), j0 = nodeOf(z);
  let best = -1, bd = Infinity;
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const i = i0 + di, j = j0 + dj;
    if (i < 0 || j < 0 || i >= NODES || j >= NODES) continue;
    if (cellReason(g, nodeCentre(i), nodeCentre(j))) continue;
    const d = (nodeCentre(i) - x) ** 2 + (nodeCentre(j) - z) ** 2;
    if (d < bd) { bd = d; best = j * NODES + i; }
  }
  return best;
}

function describeCauses(c: Partial<Record<EdgeReason, number>>): string {
  const list = EDGE_NAMES.filter((k) => (c[k] ?? 0) > 0).sort((a, b) => (c[b] ?? 0) - (c[a] ?? 0) || EDGE_NAMES.indexOf(a) - EDGE_NAMES.indexOf(b));
  if (!list.length) return 'impassable ground';
  return list.length === 1 ? EDGE_TEXT[list[0]] : `${list.slice(0, -1).map((k) => EDGE_TEXT[k]).join(', ')} and ${EDGE_TEXT[list[list.length - 1]]}`;
}

/**
 * A resumable coarse route search from `from` to `to` (metres). Call `step`
 * until it returns true; `result` is then set. Equal inputs give equal
 * results whatever the step sizes.
 */
export class RouteSearch {
  result: RouteResult | null = null;
  expanded = 0;
  private readonly g: Int32Array;
  private readonly parent: Int32Array;
  private readonly closed: Uint8Array;
  private readonly heap = new Heap();
  private readonly flood = new Uint8Array(NODES * NODES);
  private readonly floodQueue: number[] = [];
  private floodHead = 0;
  private floodDone = false;
  private readonly fwdCauses: Partial<Record<EdgeReason, number>> = {};
  private readonly backCauses: Partial<Record<EdgeReason, number>> = {};
  private start = -1;
  private goal = -1;
  constructor(readonly ground: RouteGround, readonly from: RoutePoint, readonly to: RoutePoint, readonly budget = ROUTE_BUDGET) {
    const n = NODES * NODES;
    this.g = new Int32Array(n).fill(-1); this.parent = new Int32Array(n).fill(-1); this.closed = new Uint8Array(n);
    const fail = (code: RouteCode, reason: string) => { this.result = { ok: false, code, reason, expanded: 0, causes: {} }; };
    if (!inside(Math.floor(to.x), Math.floor(to.z))) { fail('outside', 'the destination is outside the world'); return; }
    if (!inside(Math.floor(from.x), Math.floor(from.z))) { fail('outside', 'you are outside the world'); return; }
    const dd = ground.t.d(Math.floor(to.x), Math.floor(to.z));
    if (dd > WADE_MAX) { fail('deep_destination', `the destination is in deep water (${dd} m deep; walkers wade at most ${WADE_MAX} m): pick a spot on land or in shallow water`); return; }
    this.goal = standableNode(ground, to.x, to.z, 1);
    if (this.goal < 0) { fail('deep_destination', 'no ground to stand on at the destination (deep water or a building all around it)'); return; }
    this.start = standableNode(ground, from.x, from.z, 2);
    if (this.start < 0) { fail('deep_start', 'you are in deep water or inside a building: get onto walkable ground first'); return; }
    const si = this.start % NODES, sj = Math.floor(this.start / NODES), gi = this.goal % NODES, gj = Math.floor(this.goal / NODES);
    this.g[this.start] = 0;
    const h = octile(si, sj, gi, gj);
    this.heap.push(h, h, this.start);
    this.flood[this.goal] = 1; this.floodQueue.push(this.goal);
  }

  /** Run up to `n` expansions (forward and backward together); true when finished. */
  step(n: number): boolean {
    if (this.result) return true;
    const gi = this.goal % NODES, gj = Math.floor(this.goal / NODES);
    for (let k = 0; k < n; k++) {
      // One backward flood node for every forward one, until the flood proves the destination open (or closed).
      if (!this.floodDone) this.floodStep();
      if (this.result) return true;
      if (!this.heap.size) { this.finishFail('closed_in'); return true; }
      const i = this.heap.pop();
      if (this.closed[i]) continue;
      this.closed[i] = 1;
      if (i === this.goal) { this.finishOk(); return true; }
      if (++this.expanded > this.budget) {
        this.result = { ok: false, code: 'too_far', expanded: this.expanded, causes: { ...this.fwdCauses },
          reason: `no route found within the planning limit (${Math.round(this.budget * COARSE * COARSE / 1e4) / 100} km² searched; the way is blocked by ${describeCauses(this.fwdCauses)}): try a nearer destination` };
        return true;
      }
      const ni = i % NODES, nj = Math.floor(i / NODES);
      for (const [di, dj] of DIRS) {
        const c = edgeCost(this.ground, ni, nj, di, dj);
        if (c < 0) { const r = EDGE_NAMES[-c - 1]; this.fwdCauses[r] = (this.fwdCauses[r] ?? 0) + 1; continue; }
        const j = (nj + dj) * NODES + ni + di;
        if (this.closed[j]) continue;
        const ng = this.g[i] + c;
        if (this.g[j] >= 0 && this.g[j] <= ng) continue;
        this.g[j] = ng; this.parent[j] = i;
        const h = octile(ni + di, nj + dj, gi, gj);
        this.heap.push(ng + h, h, j);
      }
    }
    return false;
  }

  private floodStep(): void {
    if (this.floodHead >= this.floodQueue.length) {
      this.floodDone = true;
      if (!this.flood[this.start]) {
        this.result = { ok: false, code: 'cut_off', expanded: this.expanded + this.floodHead, causes: { ...this.backCauses },
          reason: `the destination is cut off: ${describeCauses(this.backCauses)} close it in, with no walkable way or ford (an area of about ${this.floodHead * COARSE * COARSE} m²)` };
      }
      return;
    }
    if (this.floodHead >= FLOOD_LIMIT) { this.floodDone = true; return; }
    const i = this.floodQueue[this.floodHead++];
    const ni = i % NODES, nj = Math.floor(i / NODES);
    for (const [di, dj] of DIRS) {
      // Connectivity is symmetric (both ends standable, the same 1 m moves backwards); the cost is not needed here.
      const c = edgeCost(this.ground, ni, nj, di, dj);
      if (c < 0) { const r = EDGE_NAMES[-c - 1]; this.backCauses[r] = (this.backCauses[r] ?? 0) + 1; continue; }
      const j = (nj + dj) * NODES + ni + di;
      if (this.flood[j]) continue;
      this.flood[j] = 1; this.floodQueue.push(j);
    }
  }

  private finishFail(code: 'closed_in'): void {
    this.result = { ok: false, code, expanded: this.expanded, causes: { ...this.fwdCauses },
      reason: `no walkable route: ${describeCauses(this.fwdCauses)} close in the ground you can reach from here (about ${this.expanded * COARSE * COARSE} m²)` };
  }

  private finishOk(): void {
    const nodes: number[] = [];
    for (let k = this.goal; k !== -1; k = this.parent[k]) nodes.push(k);
    nodes.reverse();
    const pts: RoutePoint[] = nodes.map((k) => ({ x: nodeCentre(k % NODES) + 0.5, z: nodeCentre(Math.floor(k / NODES)) + 0.5 }));
    // The last metres to the tapped spot, only if that 1 m line is walkable too.
    const tx = Math.floor(this.to.x), tz = Math.floor(this.to.z), last = nodes[nodes.length - 1];
    if (lineCost(this.ground, nodeCentre(last % NODES), nodeCentre(Math.floor(last / NODES)), tx, tz) >= 0) {
      // No doubling back: when the node before the last one reaches the spot by a walkable line too, go straight there.
      const prev = nodes.length >= 2 ? nodes[nodes.length - 2] : -1;
      if (prev >= 0 && lineCost(this.ground, nodeCentre(prev % NODES), nodeCentre(Math.floor(prev / NODES)), tx, tz) >= 0) { pts.pop(); nodes.pop(); }
      pts.push({ x: tx + 0.5, z: tz + 0.5 });
    }
    let length = 0, fords = 0, wade = 0, wet = false;
    for (let k = 1; k < pts.length; k++) length += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
    // Wading metres along the 1 m walk of the coarse edges.
    for (let k = 1; k < nodes.length; k++) {
      const a = nodes[k - 1], b = nodes[k];
      const di = (b % NODES) - (a % NODES), dj = Math.floor(b / NODES) - Math.floor(a / NODES);
      let x = nodeCentre(a % NODES), z = nodeCentre(Math.floor(a / NODES));
      for (let s = 0; s < COARSE; s++) {
        x += di; z += dj;
        const w = this.ground.t.d(x, z) > 0;
        if (w) wade++;
        if (w && !wet) fords++;
        wet = w;
      }
    }
    this.result = { ok: true, points: simplify(pts), length: Math.round(length), cost: this.g[this.goal], fords, wadeM: wade, expanded: this.expanded };
  }
}

/** Drop points on a straight run (same direction), keeping every corner. The kept segments are the same walk. */
export function simplify(pts: RoutePoint[]): RoutePoint[] {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  for (let k = 1; k + 1 < pts.length; k++) {
    const a = out[out.length - 1], b = pts[k], c = pts[k + 1];
    const d1x = Math.sign(b.x - a.x), d1z = Math.sign(b.z - a.z), d2x = Math.sign(c.x - b.x), d2z = Math.sign(c.z - b.z);
    const straight = (b.x - a.x) * (c.z - b.z) === (b.z - a.z) * (c.x - b.x) && d1x === d2x && d1z === d2z;
    if (!straight) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Plan a whole route at once (tests and tools). */
export function planRoute(ground: RouteGround, from: RoutePoint, to: RoutePoint, budget = ROUTE_BUDGET): RouteResult {
  const s = new RouteSearch(ground, from, to, budget);
  while (!s.step(4096));
  return s.result!;
}

/** Ground for a world: its generated terrain and its building footprints. */
export function routeGround(world: World): RouteGround {
  return { t: terrainCache(world.seed, world.params.generatorVersion), blocked: blockedCells(world) };
}

/** Walk a route (in order) and give the point `d` metres along it. */
export function pointAlong(pts: RoutePoint[], d: number): { p: RoutePoint; index: number } {
  let left = d;
  for (let k = 1; k < pts.length; k++) {
    const l = Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
    if (left <= l) { const t = l ? left / l : 0; return { p: { x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * t, z: pts[k - 1].z + (pts[k].z - pts[k - 1].z) * t }, index: k }; }
    left -= l;
  }
  return { p: pts[pts.length - 1], index: pts.length - 1 };
}

/** Distance from a point to a polyline (metres) and the arc length of the nearest point. */
export function distanceToRoute(pts: RoutePoint[], x: number, z: number): { d: number; s: number } {
  let best = Infinity, bs = 0, acc = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz, l = Math.sqrt(l2);
    const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
    const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
    if (d < best) { best = d; bs = acc + l * t; }
    acc += l;
  }
  return { d: best, s: bs };
}

/**
 * Local refinement: the walk from the player to the route on nav's 1 m grid
 * of the live world (voxel edits, buildings, trees, rocks), in a 64 m window
 * around the player. Returns the 1 m path (cell centres) to the farthest
 * route point inside the window that it reaches, and the index of that
 * route point, or null when the nearby ground blocks every such point.
 */
export function refineStart(world: World, from: RoutePoint, pts: RoutePoint[], maxExpansions = 6000): { path: RoutePoint[]; joinIndex: number } | null {
  const W = 64, cx = Math.floor(from.x), cz = Math.floor(from.z);
  const ox = Math.max(-HALF, Math.floor(cx / 16) * 16 - 24), oz = Math.max(-HALF, Math.floor(cz / 16) * 16 - 24);
  const region = { ox, oz, w: Math.min(W, HALF - ox), h: Math.min(W, HALF - oz) };
  const g = windowGrid(world, region);
  const within = (p: RoutePoint) => p.x >= ox + 4 && p.z >= oz + 4 && p.x < ox + region.w - 4 && p.z < oz + region.h - 4;
  // Candidates: route points inside the window, farthest along first (at most 4 tries).
  const cands: number[] = [];
  for (let k = pts.length - 1; k >= 1 && cands.length < 4; k--) if (within(pts[k])) cands.push(k);
  for (const k of cands) {
    const r = findPath(world, g, { x: Math.round(from.x * 10), z: Math.round(from.z * 10) }, { x: Math.round(pts[k].x * 10), z: Math.round(pts[k].z * 10), reach: 15 }, { maxExpansions });
    if (!r.ok) continue;
    const corners = compressPath(r.cells, cx, cz);
    const path: RoutePoint[] = [{ x: from.x, z: from.z }];
    for (let i = 0; i < corners.length; i += 2) path.push({ x: corners[i] + 0.5, z: corners[i + 1] + 0.5 });
    return { path, joinIndex: k };
  }
  return null;
}
