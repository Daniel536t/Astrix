// W5 (wilderness content v6): exploration, discovery and waypoints.
//
// Authoritative, compact and journaled:
//  - explored: a 128 x 128 bitset of 16 m cells over the 2048 m world (kept
//    as one byte a cell in memory, saved as sorted runs of explored cells);
//  - places: ids of discovered named places (sim/places.ts);
//  - deposits: ids of discovered ore outcrops (the existing styl_ore entities);
//  - waypoints: up to MAX_WAYPOINTS named points the player placed.
//
// Exploration is driven by the player's movement: the journaled `explore`
// command carries the player's position (integer decimetres, reported like
// every wilderness command's `at`). The visibility rule: every fog cell whose
// centre lies within the reveal radius of that position is explored
// (REVEAL_RADIUS 48 m; 64 m standing at 35 m or higher, 80 m at 60 m or
// higher, by the generated ground height there). A place is discovered when
// the fog cell of its anchor is explored. An ore outcrop is discovered only
// when the player comes within DEPOSIT_SIGHT (24 m) of it (the outcrops
// natural generation places there, read without generating voxels).
//
// Plausible movement: a report must be reachable from the last accepted one.
// Each world tick (2 s) adds EXPLORE_CREDIT_PER_TICK metres of travel credit
// (8 m/s, above the run speed of 7.5 m/s), up to EXPLORE_CREDIT_CAP; a report
// spends its straight-line distance. Exceptions, which spend nothing: the
// first report since the content upgrade; a return to an already explored
// cell (the Home and banner returns go only where the player has been); the
// spawn and the claimed lean-to; and the respawn landing point. Anything else
// is refused (`implausible`) and changes nothing. No three.js.
import {
  CHUNKS_PER_SIDE, CHUNK_SIZE, HALF, MatId, Y_MIN, World, baseColumnAt, baseHeightAt, chunkOriginX, chunkOriginZ, planNaturalEntities, worldToChunkX, worldToChunkZ,
} from './world';
import { PLACE_ID, placesNear } from './places';

export const FOG_CELL = 16;
export const FOG_N = 2048 / FOG_CELL;
export const FOG_CELLS = FOG_N * FOG_N;
export const REVEAL_RADIUS = 48;
export const DEPOSIT_SIGHT = 24;
/** The client reports after moving this far (metres) when the report would discover something. */
export const EXPLORE_STEP = 16;
export const EXPLORE_CREDIT_PER_TICK = 16;
export const EXPLORE_CREDIT_CAP = 160;
/** Anchors (spawn, lean-to) count within this distance (metres). */
const ANCHOR_REACH = 8;
export const MAX_WAYPOINTS = 32;
export const WAYPOINT_ID = /^w:\d{1,6}$/;
export const WAYPOINT_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9 '.,()-]{0,22}[A-Za-z0-9.')])?$/;
export const DEPOSIT_ID = /^e:\d{1,2},\d{1,2}:\d{1,4}$/;

export interface Waypoint { id: string; name: string; x: number; z: number }
export interface ExploreAnchor { x: number; z: number; tick: number; credit: number }
export interface MapState {
  explored: Uint8Array;
  places: Set<string>;
  deposits: Set<string>;
  waypoints: Map<string, Waypoint>;
  nextWaypoint: number;
  /** The last accepted report (dm), the tick it was made and the travel credit left (m). Null until the first report. */
  last: ExploreAnchor | null;
}

export function createMap(): MapState {
  return { explored: new Uint8Array(FOG_CELLS), places: new Set(), deposits: new Set(), waypoints: new Map(), nextWaypoint: 1, last: null };
}

export const fogIndex = (x: number, z: number): number => {
  const cx = Math.floor((x + HALF) / FOG_CELL), cz = Math.floor((z + HALF) / FOG_CELL);
  return cx < 0 || cz < 0 || cx >= FOG_N || cz >= FOG_N ? -1 : cz * FOG_N + cx;
};
export const isExplored = (m: MapState, x: number, z: number): boolean => { const i = fogIndex(x, z); return i >= 0 && m.explored[i] === 1; };
export const exploredCount = (m: MapState): number => { let n = 0; for (let i = 0; i < FOG_CELLS; i++) n += m.explored[i]; return n; };

/** The reveal radius (metres) standing at (x, z) metres: larger from high ground (generated height). */
export function revealRadius(world: Pick<World, 'seed' | 'params'>, x: number, z: number): number {
  const h = baseHeightAt(world.seed, world.params.generatorVersion, Math.floor(x), Math.floor(z));
  return h >= 60 ? 80 : h >= 35 ? 64 : REVEAL_RADIUS;
}

/** Fog cells whose centre lies within `r` of (x, z) metres (row-major order). */
export function cellsWithin(x: number, z: number, r: number): number[] {
  const out: number[] = [];
  const c0x = Math.max(0, Math.floor((x - r + HALF) / FOG_CELL)), c1x = Math.min(FOG_N - 1, Math.floor((x + r + HALF) / FOG_CELL));
  const c0z = Math.max(0, Math.floor((z - r + HALF) / FOG_CELL)), c1z = Math.min(FOG_N - 1, Math.floor((z + r + HALF) / FOG_CELL));
  for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
    const mx = -HALF + cx * FOG_CELL + FOG_CELL / 2, mz = -HALF + cz * FOG_CELL + FOG_CELL / 2;
    if ((mx - x) ** 2 + (mz - z) ** 2 <= r * r) out.push(cz * FOG_N + cx);
  }
  return out;
}

const oreCache = new Map<string, Array<{ id: string; x: number; z: number }>>();
/**
 * The ore outcrops (styl_ore) natural generation places in a chunk, from the
 * same pure planner as `generateEntityChunk` (the same ids and positions) but
 * reading only the base columns it needs: no voxels are generated, so a
 * report (or its replay) costs a few column samples, not chunk generation.
 */
export function oreInChunk(seed: number, gen: number, cx: number, cz: number): Array<{ id: string; x: number; z: number }> {
  if (cx < 0 || cz < 0 || cx >= CHUNKS_PER_SIDE || cz >= CHUNKS_PER_SIDE) return [];
  const key = `${seed}:${gen}:${cx},${cz}`;
  const hit = oreCache.get(key);
  if (hit) return hit;
  const cols = new Map<number, { stored: number; top: MatId }>();
  const col = (lx: number, lz: number) => {
    const k = lz * CHUNK_SIZE + lx;
    let c = cols.get(k);
    if (!c) { c = baseColumnAt(seed, gen, chunkOriginX(cx) + lx, chunkOriginZ(cz) + lz); cols.set(k, c); }
    return c;
  };
  const out: Array<{ id: string; x: number; z: number }> = [];
  planNaturalEntities(seed, cx, cz, (lx, lz) => col(lx, lz).stored + Y_MIN, (lx, lz) => col(lx, lz).top, false, {
    entity: (e) => { if (e.kind === 'styl_ore') out.push({ id: e.id, x: e.x, z: e.z }); },
    stat: () => {},
  });
  if (oreCache.size > 4096) oreCache.delete(oreCache.keys().next().value!);
  oreCache.set(key, out);
  return out;
}

/** The outcrop with this id (its position), or null. */
export function depositById(seed: number, gen: number, id: string): { id: string; x: number; z: number } | null {
  const m = /^e:(\d{1,2}),(\d{1,2}):\d+$/.exec(id);
  return m ? oreInChunk(seed, gen, Number(m[1]), Number(m[2])).find((o) => o.id === id) ?? null : null;
}

/** Ore outcrops within `r` metres (not removed from the world), sorted by id. */
export function depositsNear(world: World, x: number, z: number, r: number): Array<{ id: string; x: number; z: number }> {
  const out: Array<{ id: string; x: number; z: number }> = [];
  for (let cz = worldToChunkZ(Math.floor(z - r)); cz <= worldToChunkZ(Math.floor(z + r)); cz++) {
    for (let cx = worldToChunkX(Math.floor(x - r)); cx <= worldToChunkX(Math.floor(x + r)); cx++) {
      for (const o of oreInChunk(world.seed, world.params.generatorVersion, cx, cz)) {
        if (world.entityRemovals.has(o.id) || !DEPOSIT_ID.test(o.id)) continue;
        if (Math.hypot(o.x - x, o.z - z) <= r) out.push(o);
      }
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export interface ExploreGain { cells: number[]; places: string[]; deposits: string[] }

/** What a report at (x, z) metres would discover now (read-only). */
export function exploreGain(world: World, m: MapState, x: number, z: number): ExploreGain {
  const r = revealRadius(world, x, z);
  const cells = cellsWithin(x, z, r).filter((i) => !m.explored[i]);
  const fresh = new Set(cells);
  const places = placesNear(world.seed, world.params.generatorVersion, x, z, r + FOG_CELL)
    .filter((p) => !m.places.has(p.id) && (fresh.has(fogIndex(p.x, p.z)) || m.explored[fogIndex(p.x, p.z)] === 1)).map((p) => p.id);
  const deposits = depositsNear(world, x, z, DEPOSIT_SIGHT).filter((d) => !m.deposits.has(d.id)).map((d) => d.id);
  return { cells, places, deposits };
}

export type MapResult<T> = { ok: true; value: T } | { ok: false; code: string; reasons: string[] };
const fail = (code: string, reason: string): { ok: false; code: string; reasons: string[] } => ({ ok: false, code, reasons: [reason] });
export interface At { x: number; z: number }

/** Why a report at `at` (dm) is not plausible from the last accepted one, or null; and the credit it leaves. */
export function explorePlausibility(world: World, m: MapState, at: At, anchors: () => At[]): { ok: true; credit: number } | { ok: false; reason: string } {
  const tick = world.life?.tick ?? 0;
  if (!m.last) return { ok: true, credit: EXPLORE_CREDIT_CAP / 2 };
  const credit = Math.min(EXPLORE_CREDIT_CAP, m.last.credit + Math.max(0, tick - m.last.tick) * EXPLORE_CREDIT_PER_TICK);
  const d = Math.ceil(Math.hypot(at.x - m.last.x, at.z - m.last.z) / 10);
  if (d <= credit) return { ok: true, credit: credit - d };
  if (isExplored(m, at.x / 10, at.z / 10)) return { ok: true, credit };
  // The anchors are computed only when needed (the spawn search is not free).
  if (anchors().some((a) => Math.hypot(a.x - at.x, a.z - at.z) <= ANCHOR_REACH * 10)) return { ok: true, credit };
  return { ok: false, reason: `you could not have walked ${d} m since your last explored spot (at most ${credit} m by now): exploration is recorded as you walk` };
}

/** The journaled `explore`: reveal around the reported position and record what it discovers. */
export function exploreAt(world: World, m: MapState, at: At, anchors: () => At[]): MapResult<{ revealed: number; places: string[]; deposits: string[] }> {
  if (Math.abs(at.x) >= HALF * 10 - 10 || Math.abs(at.z) >= HALF * 10 - 10) return fail('out_of_world', 'outside the world');
  const p = explorePlausibility(world, m, at, anchors);
  if (!p.ok) return fail('implausible', p.reason);
  const g = exploreGain(world, m, at.x / 10, at.z / 10);
  for (const i of g.cells) m.explored[i] = 1;
  // A place is discovered once its anchor's cell is explored (by this report, or before it).
  const places = g.places;
  for (const id of places) m.places.add(id);
  for (const id of g.deposits) m.deposits.add(id);
  m.last = { x: at.x, z: at.z, tick: world.life?.tick ?? 0, credit: p.credit };
  return { ok: true, value: { revealed: g.cells.length, places, deposits: g.deposits } };
}

/** A recorded landing (respawn): the next report is measured from there. */
export function noteLanding(world: World, m: MapState, at: At): void {
  m.last = { x: at.x, z: at.z, tick: world.life?.tick ?? 0, credit: m.last?.credit ?? EXPLORE_CREDIT_CAP / 2 };
}

export function setWaypoint(m: MapState, x: number, z: number, name: string): MapResult<{ waypointId: string }> {
  if (!WAYPOINT_NAME.test(name)) return fail('bad_name', 'a waypoint name is 1 to 24 letters, digits, spaces or simple punctuation');
  if (Math.abs(x) >= HALF - 1 || Math.abs(z) >= HALF - 1) return fail('out_of_world', 'outside the world');
  if (m.waypoints.size >= MAX_WAYPOINTS) return fail('too_many', `you already have ${MAX_WAYPOINTS} waypoints: remove one first`);
  if (m.nextWaypoint > 999_999) return fail('too_many', 'no more waypoint ids');
  const id = `w:${m.nextWaypoint++}`;
  m.waypoints.set(id, { id, name, x, z });
  return { ok: true, value: { waypointId: id } };
}

export function removeWaypoint(m: MapState, id: string): MapResult<{ waypointId: string }> {
  if (!m.waypoints.delete(id)) return fail('not_found', 'no such waypoint (already removed?)');
  return { ok: true, value: { waypointId: id } };
}

// ---------- snapshot form ----------
export interface MapSnapshot {
  deposits: string[];
  /** Explored fog cells as sorted, non-touching runs [start, length, start, length, ...] (row-major). */
  explored: number[];
  last?: ExploreAnchor;
  nextWaypoint: number;
  places: string[];
  waypoints: Waypoint[];
}

const wpOrder = (a: Waypoint, b: Waypoint) => Number(a.id.slice(2)) - Number(b.id.slice(2));

export function mapSnapshot(m: MapState): MapSnapshot {
  const runs: number[] = [];
  for (let i = 0; i < FOG_CELLS;) {
    if (!m.explored[i]) { i++; continue; }
    let j = i;
    while (j < FOG_CELLS && m.explored[j]) j++;
    runs.push(i, j - i);
    i = j;
  }
  return {
    deposits: [...m.deposits].sort((a, b) => a.localeCompare(b)),
    explored: runs,
    ...(m.last ? { last: { credit: m.last.credit, tick: m.last.tick, x: m.last.x, z: m.last.z } as ExploreAnchor } : {}),
    nextWaypoint: m.nextWaypoint,
    places: [...m.places].sort((a, b) => a.localeCompare(b)),
    waypoints: [...m.waypoints.values()].sort(wpOrder).map((w) => ({ id: w.id, name: w.name, x: w.x, z: w.z })),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= lo && v <= hi;

/** Strict: the canonical form only. Throws on anything else. */
export function validateMap(value: unknown, tick: number): MapSnapshot {
  const bad = (what: string): never => { throw new Error(`snapshot wilderness map: invalid ${what}`); };
  if (!isObj(value)) bad('block');
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v).sort().join();
  if (keys !== 'deposits,explored,last,nextWaypoint,places,waypoints' && keys !== 'deposits,explored,nextWaypoint,places,waypoints') bad('fields');
  if (!Array.isArray(v.explored) || v.explored.length % 2 || v.explored.length > FOG_CELLS) bad('explored');
  const runs = v.explored as unknown[];
  let end = -1;
  for (let k = 0; k < runs.length; k += 2) {
    const s = runs[k], l = runs[k + 1];
    if (!int(s, 0, FOG_CELLS - 1) || !int(l, 1, FOG_CELLS) || s <= end || s + l > FOG_CELLS) bad('explored run');
    end = (s as number) + (l as number);
  }
  const ids = (list: unknown, re: RegExp, max: number, what: string): string[] => {
    if (!Array.isArray(list) || list.length > max) bad(what);
    const arr = list as unknown[];
    for (let k = 0; k < arr.length; k++) if (typeof arr[k] !== 'string' || !re.test(arr[k] as string) || (k && (arr[k - 1] as string).localeCompare(arr[k] as string) >= 0)) bad(what);
    return [...arr] as string[];
  };
  const places = ids(v.places, PLACE_ID, 512, 'places');
  const deposits = ids(v.deposits, DEPOSIT_ID, 50_000, 'deposits');
  if (!int(v.nextWaypoint, 1, 1_000_000)) bad('waypoint counter');
  if (!Array.isArray(v.waypoints) || v.waypoints.length > MAX_WAYPOINTS) bad('waypoints');
  const wps: Waypoint[] = [];
  for (const w of v.waypoints as unknown[]) {
    if (!isObj(w) || Object.keys(w).sort().join() !== 'id,name,x,z' || typeof w.id !== 'string' || !WAYPOINT_ID.test(w.id) || Number(w.id.slice(2)) >= (v.nextWaypoint as number)
      || Number(w.id.slice(2)) < 1 || typeof w.name !== 'string' || !WAYPOINT_NAME.test(w.name) || !int(w.x, -(HALF - 2), HALF - 2) || !int(w.z, -(HALF - 2), HALF - 2)) bad('waypoint');
    const q = w as unknown as Waypoint;
    if (wps.length && wpOrder(wps[wps.length - 1], q) >= 0) bad('waypoint order');
    wps.push({ id: q.id, name: q.name, x: q.x, z: q.z });
  }
  let last: ExploreAnchor | undefined;
  if (v.last !== undefined) {
    const l = v.last as Record<string, unknown>;
    if (!isObj(l) || Object.keys(l).sort().join() !== 'credit,tick,x,z' || !int(l.credit, 0, EXPLORE_CREDIT_CAP) || !int(l.tick, 0, tick)
      || !int(l.x, -(HALF * 10 - 10), HALF * 10 - 10) || !int(l.z, -(HALF * 10 - 10), HALF * 10 - 10)) bad('last report');
    last = { credit: l.credit as number, tick: l.tick as number, x: l.x as number, z: l.z as number };
  }
  return { deposits, explored: [...runs] as number[], ...(last ? { last } : {}), nextWaypoint: v.nextWaypoint as number, places, waypoints: wps };
}

export function mapFromSnapshot(s: MapSnapshot): MapState {
  const explored = new Uint8Array(FOG_CELLS);
  for (let k = 0; k < s.explored.length; k += 2) explored.fill(1, s.explored[k], s.explored[k] + s.explored[k + 1]);
  return {
    explored, places: new Set(s.places), deposits: new Set(s.deposits),
    waypoints: new Map(s.waypoints.map((w) => [w.id, { ...w }])), nextWaypoint: s.nextWaypoint,
    last: s.last ? { ...s.last } : null,
  };
}
