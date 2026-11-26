// W7 (wilderness content v8): persistent wildlife and animal minds. Pure TS, deterministic, no three.js.
//
// This is the authoritative creature tier designed in sim/fauna.ts. The
// species, their ids (`fauna:<species>:<cx>,<cz>:<i>`) and their habitats
// are fauna.ts's; the creatures are now part of the hashed wilderness state.
//
// Identity: derive, override, tombstone.
//  - Every chunk's population is derived from (seed, generator, chunk) alone
//    (`wildlifeInChunk`): base terrain (route.ts's TerrainCache, the same 1 m
//    columns the voxels are generated from) and the natural planner's trees
//    (deposits.ts `naturalPlanInChunk`). No voxels, no loaded chunks, no
//    load order.
//  - A creature gets a saved record the first time its chunk comes within the
//    active ring of the player (`materialize`). From then on the record is the
//    creature: position, heading, behaviour, needs, target, random stream.
//  - A creature that dies (W7: brought down by wolves) leaves its id in the
//    tombstone set and a carcass record. Materialization skips a recorded or
//    tombstoned id, so a reload or a replay never duplicates or resurrects one.
//
// Simulation: on the 2 s world tick, around the player's last journaled
// presence (`focus`, decimetres). Chunk rings around the focus chunk:
//  - full    (Chebyshev distance <= FULL_RING): two 1 s sub-steps a tick,
//             perception of the player, of noise, of predators and prey;
//  - coarse  (<= ACTIVE_RING): one 2 s step, needs and calm behaviour only
//             (no perception, no hunts), so the edge of the active area keeps
//             moving at a fraction of the cost;
//  - frozen  (beyond): not stepped. The record keeps everything; when it is
//             next stepped, its needs converge toward the species' resting
//             baseline by the time it was away (`catchUp`) and a transient
//             act (a flight, a chase) ends. Position never jumps.
// Rendering (render/fauna.ts) draws only records in the loaded near chunks,
// which lie inside the full ring, and blends between ticks.
//
// Movement: positions are integer decimetres, headings one of 32 directions
// (an integer table), randomness each creature's own 32-bit stream, distances
// integer squares; no Math.sin/cos/atan2/hypot, so every engine replays the
// same. A land animal stands only on dry 1 m cells that are not a tree, an
// ore outcrop, a building footprint or a fallen trunk, and steps at most 1 m
// up or down (nav.ts MAX_STEP); a trout swims only in cells at least 1 m deep.
// A blocked straight line is routed around by a bounded A* on the same cells.
// An animal on a cell it may not be on (a building placed over it) walks out
// to the nearest good cell; one that makes no progress picks a new goal.
import { CHUNK_SIZE, CHUNKS_PER_SIDE, HALF, chunkKey, chunkOriginX, chunkOriginZ } from './world';
import type { World } from './world';
import { hash2i, mulberry32 } from './noise';
import { FEARS } from './fauna';
import type { SpeciesDef } from './fauna';
import { TerrainCache, blockedCells, cellKey, terrainCache } from './route';
import { naturalPlanInChunk } from './deposits';
import { Heap, MAX_STEP } from './nav';
import { PLAYER_R, WILD_BODIES, WildId, bodyReach } from './bodies';
import type { Presence } from './bodies';

export const WILD_CONTENT_V8 = 8 as const;
export type WildSpecies = SpeciesDef['id'];
export const WILD_SPECIES: readonly WildSpecies[] = ['deer', 'fox', 'rabbit', 'trout', 'wolf'];

export const ACTS = ['alert', 'avoid', 'browse', 'chase', 'cruise', 'dart', 'drink', 'escape', 'feed', 'flee', 'follow', 'freeze', 'graze', 'hold',
  'idle', 'mouse', 'patrol', 'pounce', 'rest', 'rise', 'school', 'stalk', 'wander'] as const;
export type Act = (typeof ACTS)[number];
/** What each species does. Every species has its own decision rules below; this is only the vocabulary. */
export const SPECIES_ACTS: Record<WildSpecies, readonly Act[]> = {
  deer: ['alert', 'browse', 'drink', 'escape', 'flee', 'graze', 'idle', 'rest', 'wander'],
  rabbit: ['drink', 'escape', 'flee', 'freeze', 'graze', 'idle', 'rest', 'wander'],
  fox: ['avoid', 'drink', 'escape', 'flee', 'idle', 'mouse', 'pounce', 'rest', 'stalk', 'wander'],
  wolf: ['avoid', 'chase', 'drink', 'escape', 'feed', 'flee', 'follow', 'idle', 'patrol', 'rest'],
  trout: ['cruise', 'dart', 'escape', 'hold', 'rise', 'school'],
};
/** Acts that end when the animal is not watched (frozen); everything else is kept as it was. */
const TRANSIENT: readonly Act[] = ['alert', 'avoid', 'chase', 'dart', 'escape', 'feed', 'flee', 'freeze', 'pounce', 'stalk'];

/** Chunk rings around the focus chunk (Chebyshev distance). The renderer's near ring (3) is inside FULL_RING. */
export const FULL_RING = 3;
export const ACTIVE_RING = 4;
/** Sub-steps a tick in the full ring (each 1 s of the 2 s tick). */
export const FULL_SUBSTEPS = 2;
/** Most records kept. Beyond it, the farthest calm frozen records go back to their derived state (see `evict`). */
export const MAX_ANIMALS = 4096;
let animalCap = MAX_ANIMALS;
/** Test hook: a lower record budget, to exercise eviction. */
export function setWildlifeCapForTests(n: number): void { animalCap = n; }
export const MAX_DEAD = 20_000;
export const MAX_CARCASSES = 256;
/** A carcass lies this long (3 days) before it is gone; the tombstone stays for good. */
export const CARCASS_TICKS = 900;
/** Needs are 0..NEED_MAX (hunger, thirst, fatigue). */
export const NEED_MAX = 10_000;
/** Same day as the homestead's DAY_TICKS (300 ticks = 10 min); the wilderness sky follows it in content v8. */
export const WILD_DAY_TICKS = 300;

export type DayPhase = 'dawn' | 'morning' | 'midday' | 'afternoon' | 'dusk' | 'night';
/** Phase of the day at a tick (the sky's time t = tick / 300 + 0.23: noon at tick 81, night from t 0.83 to 0.18). */
export function dayPhase(tick: number): DayPhase {
  const t = ((tick % WILD_DAY_TICKS) + WILD_DAY_TICKS) % WILD_DAY_TICKS;
  if (t < 24 || t >= 285) return 'dawn';
  if (t < 60) return 'morning';
  if (t < 120) return 'midday';
  if (t < 150) return 'afternoon';
  if (t < 180) return 'dusk';
  return 'night';
}

/** Per-species rules: speeds (dm/s), senses (dm), needs per second (of NEED_MAX). */
export interface WildRules {
  walk: number; trot: number; run: number; tired: number;
  /** Notices a still player / a moving player at this distance. */
  seeStill: number; seeMoving: number;
  /** Bolts at once when the player is this close. */
  bolt: number;
  /** Bolts when a predator it fears is this close. */
  predator: number;
  hunger: number; thirst: number; fatigue: number;
  /** Home range (dm) around the derived spawn point. */
  range: number;
  /** Rests in these phases of the day. */
  restIn: readonly DayPhase[];
}
export const WILD_RULES: Record<WildSpecies, WildRules> = {
  deer: { walk: 12, trot: 30, run: 85, tired: 60, seeStill: 140, seeMoving: 220, bolt: 90, predator: 120, hunger: 16, thirst: 10, fatigue: 8, range: 320, restIn: ['midday', 'night'] },
  rabbit: { walk: 9, trot: 20, run: 65, tired: 50, seeStill: 60, seeMoving: 100, bolt: 40, predator: 90, hunger: 20, thirst: 4, fatigue: 10, range: 160, restIn: ['morning', 'midday', 'afternoon'] },
  fox: { walk: 15, trot: 30, run: 70, tired: 50, seeStill: 110, seeMoving: 160, bolt: 60, predator: 120, hunger: 10, thirst: 8, fatigue: 8, range: 320, restIn: ['morning', 'midday', 'afternoon'] },
  wolf: { walk: 18, trot: 40, run: 80, tired: 60, seeStill: 200, seeMoving: 260, bolt: 80, predator: 0, hunger: 6, thirst: 8, fatigue: 7, range: 420, restIn: ['midday', 'afternoon'] },
  trout: { walk: 6, trot: 12, run: 35, tired: 35, seeStill: 50, seeMoving: 80, bolt: 40, predator: 0, hunger: 10, thirst: 0, fatigue: 0, range: 200, restIn: [] },
};
/** Thresholds (of NEED_MAX). */
const THIRSTY = 6000, HUNGRY = 3500, TIRED = 7000, FULL = 800, SLAKED = 600, RESTED = 400;
/** Wolves hunt when the pack leader is this hungry; a deer this tired is caught. */
const PACK_HUNT = 8500, CAUGHT = 6500;
/** The need thresholds (for tests and the report). */
export const NEED_LEVELS = { THIRSTY, HUNGRY, TIRED, FULL, SLAKED, RESTED, PACK_HUNT, CAUGHT } as const;
/** Resting baseline a frozen animal's needs converge to, and how fast (per second away). */
const BASELINE = { hu: 3000, th: 3000, fa: 3000 };
const CONVERGE = 5;

// ---------- integer geometry ----------

/** 32 directions, (dx, dz) x 1000; heading k is atan2(dx, dz) = k * 11.25 degrees (the renderer's convention). */
export const DIRS32: ReadonlyArray<readonly [number, number]> = [
  [0, 1000], [195, 981], [383, 924], [556, 831], [707, 707], [831, 556], [924, 383], [981, 195], [1000, 0], [981, -195], [924, -383], [831, -556],
  [707, -707], [556, -831], [383, -924], [195, -981], [0, -1000], [-195, -981], [-383, -924], [-556, -831], [-707, -707], [-831, -556], [-924, -383],
  [-981, -195], [-1000, 0], [-981, 195], [-924, 383], [-831, 556], [-707, 707], [-556, 831], [-383, 924], [-195, 981],
];
/** Heading (radians) of a direction index, for drawing. */
export const headingOf = (d: number) => (d * Math.PI * 2) / 32;
export function dirToward(dx: number, dz: number): number {
  let best = 0, bv = -Infinity;
  for (let k = 0; k < 32; k++) { const v = DIRS32[k][0] * dx + DIRS32[k][1] * dz; if (v > bv) { bv = v; best = k; } }
  return best;
}
const d2 = (ax: number, az: number, bx: number, bz: number) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
const cellOf = (dm: number) => Math.floor(dm / 10);
const centreDm = (m: number) => m * 10 + 5;
const chunkOfDm = (dm: number) => Math.max(0, Math.min(CHUNKS_PER_SIDE - 1, Math.floor((cellOf(dm) + HALF) / CHUNK_SIZE)));

function rand(a: { r: number }): number {
  a.r = (a.r + 0x6d2b79f5) >>> 0;
  let t = a.r;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (a: { r: number }, n: number) => Math.floor(rand(a) * n);

// ---------- ground ----------

const MARGIN = 3;
const insideM = (x: number, z: number) => x >= -HALF + MARGIN && z >= -HALF + MARGIN && x < HALF - MARGIN && z < HALF - MARGIN;
const solidCache = new Map<string, { cells: Set<number>; trees: Set<number>; count: number }>();
/** Tree and ore cells of a chunk (natural planner, no voxels). */
function chunkSolids(seed: number, gen: number, cx: number, cz: number): { cells: Set<number>; trees: Set<number>; count: number } {
  const key = `${seed}:${gen}:${cx},${cz}`;
  const hit = solidCache.get(key);
  if (hit) return hit;
  const cells = new Set<number>(), trees = new Set<number>();
  let count = 0;
  if (cx >= 0 && cz >= 0 && cx < CHUNKS_PER_SIDE && cz < CHUNKS_PER_SIDE) {
    for (const s of naturalPlanInChunk(seed, gen, cx, cz).solid) {
      const k = cellKey(Math.floor(s.x), Math.floor(s.z));
      cells.add(k);
      if (s.tree) { trees.add(k); count++; }
    }
  }
  if (solidCache.size > 8192) solidCache.delete(solidCache.keys().next().value!);
  const out = { cells, trees, count };
  solidCache.set(key, out);
  return out;
}

/** What animals walk on: generated terrain, the natural planner's trees and ore, building footprints and fallen trunks. */
export class WildGround {
  readonly t: TerrainCache;
  private readonly solids = new Map<number, { cells: Set<number>; trees: Set<number>; count: number }>();
  constructor(readonly seed: number, readonly gen: number, readonly built: Set<number>, readonly version: string) {
    this.t = terrainCache(seed, gen);
  }
  private solidsAt(x: number, z: number) {
    const cx = (x + HALF) >> 5, cz = (z + HALF) >> 5, k = cz * 4096 + cx;
    let v = this.solids.get(k);
    if (!v) { v = chunkSolids(this.seed, this.gen, cx, cz); this.solids.set(k, v); }
    return v;
  }
  solid(x: number, z: number): boolean {
    const k = cellKey(x, z);
    return this.built.has(k) || this.solidsAt(x, z).cells.has(k);
  }
  tree(x: number, z: number): boolean { return this.solidsAt(x, z).trees.has(cellKey(x, z)); }
  /** Can a land animal stand on the 1 m cell (x, z)? Dry, inside, not solid. */
  land(x: number, z: number): boolean { return insideM(x, z) && this.t.d(x, z) === 0 && !this.solid(x, z); }
  /** Can a trout be in the cell? At least 1 m of water. */
  water(x: number, z: number): boolean { return insideM(x, z) && this.t.d(x, z) >= 1; }
  ok(fish: boolean, x: number, z: number): boolean { return fish ? this.water(x, z) : this.land(x, z); }
  /** The 1 m move a -> b (8-neighbours): b allowed, at most MAX_STEP up or down, diagonals keep both corners allowed and level. */
  step(fish: boolean, ax: number, az: number, bx: number, bz: number): boolean {
    if (Math.abs(bx - ax) > 1 || Math.abs(bz - az) > 1) {
      // A longer jump (never more than one cell per 5 dm move, but be safe): every cell of the line.
      return this.line(fish, ax, az, bx, bz, 4);
    }
    if (!this.ok(fish, bx, bz)) return false;
    if (fish) return ax === bx || az === bz || (this.water(bx, az) && this.water(ax, bz));
    const ha = this.t.h(ax, az), hb = this.t.h(bx, bz);
    if (Math.abs(hb - ha) > MAX_STEP) return false;
    if (ax !== bx && az !== bz) {
      for (const [cx, cz] of [[bx, az], [ax, bz]] as const) {
        if (!this.land(cx, cz)) return false;
        const hc = this.t.h(cx, cz);
        if (Math.abs(hc - ha) > MAX_STEP || Math.abs(hb - hc) > MAX_STEP) return false;
      }
    }
    return true;
  }
  /** Is the 8-connected line of cells from a to b walkable (at most `max` cells)? */
  line(fish: boolean, ax: number, az: number, bx: number, bz: number, max = 80): boolean {
    let x = ax, z = az;
    const dx = Math.abs(bx - ax), dz = Math.abs(bz - az), sx = Math.sign(bx - ax), sz = Math.sign(bz - az);
    if (dx + dz > max * 2) return false;
    let err = dx - dz;
    while (x !== bx || z !== bz) {
      const e2 = 2 * err;
      let mx = 0, mz = 0;
      if (e2 > -dz) { err -= dz; mx = sx; }
      if (e2 < dx) { err += dx; mz = sz; }
      if (!this.step(fish, x, z, x + mx, z + mz)) return false;
      x += mx; z += mz;
    }
    return true;
  }
  /** Feet height (m) of a land cell, or the water top of a water cell. */
  height(x: number, z: number): number { return this.t.h(x, z); }
  depth(x: number, z: number): number { return this.t.d(x, z); }
}

const groundCache = new Map<string, WildGround>();
/** The ground of a world now (cached on its seed, generator, building sites and fallen trunks). */
export function wildGround(world: World): WildGround {
  const sites = world.wild?.build?.sites, trunks = world.wild?.fell?.trunks;
  const version = `${world.seed}:${world.params.generatorVersion}|${sites ? [...sites.keys()].join(',') : ''}|${trunks ? [...trunks.keys()].join(',') : ''}`;
  const hit = groundCache.get(version);
  if (hit) return hit;
  const built = blockedCells(world);
  for (const t of trunks?.values() ?? []) {
    // A fallen trunk lies along DIRS16[dir] from its base; animals walk around it (len in dm).
    const DIRS16X = [1, 0.9239, 0.7071, 0.3827, 0, -0.3827, -0.7071, -0.9239, -1, -0.9239, -0.7071, -0.3827, 0, 0.3827, 0.7071, 0.9239];
    const ux = DIRS16X[t.dir & 15], uz = DIRS16X[(t.dir + 12) & 15];
    for (let s = 0; s <= t.len; s += 5) built.add(cellKey(Math.floor(t.x + (ux * s) / 10), Math.floor(t.z + (uz * s) / 10)));
  }
  const g = new WildGround(world.seed, world.params.generatorVersion, built, version);
  if (groundCache.size > 16) groundCache.delete(groundCache.keys().next().value!);
  groundCache.set(version, g);
  return g;
}

// ---------- derivation (pure in seed, generator, chunk) ----------

export interface Spawn { id: string; sp: WildSpecies; x: number; z: number; grp: string; r: number }
const spawnCache = new Map<string, Spawn[]>();
export const ANIMAL_ID = /^fauna:(deer|rabbit|trout|fox|wolf):(\d{1,2}),(\d{1,2}):(\d{1,2})$/;

/**
 * The creatures a chunk starts with: pure in (seed, generator, chunk). The same
 * rules as the ambient tier's `spawnChunkFauna` (fish schools in deep water,
 * deer at forest edges, hares in open ground, foxes at thin woods, wolf packs
 * in forest; predators on their own random stream), read from base terrain.
 */
export function wildlifeInChunk(seed: number, gen: number, cx: number, cz: number): Spawn[] {
  if (cx < 0 || cz < 0 || cx >= CHUNKS_PER_SIDE || cz >= CHUNKS_PER_SIDE) return [];
  const ck = `${seed}:${gen}:${cx},${cz}`;
  const hit = spawnCache.get(ck);
  if (hit) return hit;
  const t = terrainCache(seed, gen);
  const solids = chunkSolids(seed, gen, cx, cz);
  const key = chunkKey(cx, cz);
  const ox = chunkOriginX(cx), oz = chunkOriginZ(cz);
  const land = (x: number, z: number) => insideM(x, z) && t.d(x, z) === 0 && !solids.cells.has(cellKey(x, z))
    && !chunkSolids(seed, gen, Math.floor((x + HALF) / CHUNK_SIZE), Math.floor((z + HALF) / CHUNK_SIZE)).cells.has(cellKey(x, z));
  const flat = (x: number, z: number) => {
    const h = t.h(x, z);
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => t.d(x + dx, z + dz) === 0 && Math.abs(t.h(x + dx, z + dz) - h) <= 1);
  };
  const out: Spawn[] = [];
  let index = 0;
  const rnd = mulberry32((hash2i(cx, cz, seed + 7771) * 4294967296) >>> 0);
  const water: Array<{ x: number; z: number }> = [], grass: Array<{ x: number; z: number }> = [];
  for (let lz = 2; lz < CHUNK_SIZE; lz += 4) for (let lx = 2; lx < CHUNK_SIZE; lx += 4) {
    const x = ox + lx, z = oz + lz;
    if (t.d(x, z) >= 2) water.push({ x, z });
    else if (land(x, z) && flat(x, z)) grass.push({ x, z });
  }
  const add = (sp: WildSpecies, x: number, z: number, r: number) => {
    out.push({ id: `fauna:${sp}:${key}:${index}`, sp, x: centreDm(x), z: centreDm(z), grp: `${sp}:${key}`, r: (r * 4294967296) >>> 0 });
    index++;
  };
  if (water.length >= 8 && rnd() < 0.7) {
    let sx = 0, sz = 0;
    for (const w of water) { sx += w.x; sz += w.z; }
    const mx = sx / water.length, mz = sz / water.length;
    let at = water[0], bd = Infinity;
    for (const w of water) { const d = (w.x - mx) ** 2 + (w.z - mz) ** 2; if (d < bd) { bd = d; at = w; } }
    const n = 4 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const x = Math.floor(at.x + (rnd() - 0.5) * 4), z = Math.floor(at.z + (rnd() - 0.5) * 4);
      const r = rnd();
      if (insideM(x, z) && t.d(x, z) >= 1) add('trout', x, z, r);
    }
  }
  const trees = solids.count;
  if (grass.length >= 6) {
    const sp: WildSpecies | null = trees >= 3 && rnd() < 0.42 ? 'deer' : trees <= 2 && rnd() < 0.45 ? 'rabbit' : null;
    if (sp) {
      const at = grass[Math.floor(rnd() * grass.length)];
      const n = sp === 'deer' ? 2 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const x = Math.floor(at.x + 0.5 + (rnd() - 0.5) * 6), z = Math.floor(at.z + 0.5 + (rnd() - 0.5) * 6);
        const r = rnd();
        if (land(x, z) && flat(x, z)) add(sp, x, z, r);
      }
    }
  }
  if (grass.length >= 4) {
    const r2 = mulberry32((hash2i(cx, cz, seed + 7772) * 4294967296) >>> 0);
    const kind: WildSpecies | null = trees >= 6 && r2() < 0.16 ? 'wolf' : trees >= 2 && trees <= 5 && r2() < 0.26 ? 'fox' : null;
    if (kind) {
      const at = grass[Math.floor(r2() * grass.length)];
      const n = kind === 'wolf' ? 2 + Math.floor(r2() * 3) : 1;
      for (let i = 0; i < n; i++) {
        const x = Math.floor(at.x + 0.5 + (r2() - 0.5) * 4), z = Math.floor(at.z + 0.5 + (r2() - 0.5) * 4);
        const r = r2();
        if (land(x, z) && flat(x, z)) add(kind, x, z, r);
      }
    }
  }
  if (spawnCache.size > 8192) spawnCache.delete(spawnCache.keys().next().value!);
  spawnCache.set(ck, out);
  return out;
}

/** The derived spawn of an id (its home), or null for an id no chunk derives. */
export function spawnOf(seed: number, gen: number, id: string): Spawn | null {
  const m = ANIMAL_ID.exec(id);
  if (!m) return null;
  return wildlifeInChunk(seed, gen, Number(m[2]), Number(m[3])).find((s) => s.id === id) ?? null;
}

// ---------- state ----------

export interface Animal {
  id: string; sp: WildSpecies;
  /** Position (dm) and heading (0..31). */
  x: number; z: number; d: number;
  a: Act;
  /** Sim second the current act ends; 0 while walking to the act's spot. */
  u: number;
  /** The act's goal (dm). */
  tx: number; tz: number;
  /** Another creature the act is about (prey, a predator, a herd-mate), or ''. */
  tg: string;
  /** Hunger, thirst, fatigue (0..NEED_MAX). */
  hu: number; th: number; fa: number;
  /** Trout: depth in the water column, 0 (surface) .. 10 (bed). Others 0. */
  dp: number;
  /** Own random stream. */
  r: number;
  /** Sim second it was last stepped. */
  s: number;
  /** Sub-steps without progress toward its goal. */
  st: number;
  /** Not saved: where it was at the start of the latest step and after each sub-step (dm), for drawing only. */
  trail?: number[];
}
export interface Carcass { id: string; sp: WildSpecies; x: number; z: number; t: number; by: 'wolf' }
export interface WildlifeState {
  animals: Map<string, Animal>;
  dead: Set<string>;
  carcasses: Map<string, Carcass>;
  /** The player's last journaled presence (dm): the centre of the active area. */
  focus: { x: number; z: number } | null;
  /** Rings materialized around the focus so far (grows by one a tick up to ACTIVE_RING). */
  reach: number;
  /** The latest loud action (chopping, mining, building) the animals may hear: where and in which tick. */
  noise: { t: number; x: number; z: number } | null;
  kills: number;
}
export const createWildlife = (): WildlifeState => ({ animals: new Map(), dead: new Set(), carcasses: new Map(), focus: null, reach: 0, noise: null, kills: 0 });

/** Presentation and evidence counters (not state). */
export const wildlifeStats = { ms: 0, maxMs: 0, ticks: 0, full: 0, coarse: 0, frozen: 0, materialized: 0, evicted: 0, plans: 0 };

const secsOf = (tick: number) => tick * 2;

/** A loud action at (x, z) (dm): the animals that hear it react on the next tick. */
export function noteNoise(world: World, at: { x: number; z: number }): void {
  const wl = world.wild?.wildlife;
  if (wl) wl.noise = { t: world.life?.tick ?? 0, x: at.x, z: at.z };
}

function newAnimal(s: Spawn, secs: number, tick: number): Animal {
  const a: Animal = { id: s.id, sp: s.sp, x: s.x, z: s.z, d: 0, a: s.sp === 'trout' ? 'hold' : 'idle', u: secs, tx: s.x, tz: s.z, tg: '',
    hu: 0, th: 0, fa: 0, dp: 0, r: s.r, s: secs, st: 0 };
  a.d = randInt(a, 32);
  a.hu = 1500 + randInt(a, 4000);
  a.th = s.sp === 'trout' ? 0 : 1000 + randInt(a, 5000);
  a.fa = s.sp === 'trout' ? 0 : 1000 + randInt(a, 3000);
  if (s.sp === 'trout') a.dp = 4 + randInt(a, 5);
  else if (WILD_RULES[s.sp].restIn.includes(dayPhase(tick))) { a.a = 'rest'; a.u = secs + 20 + randInt(a, 60); }
  return a;
}

/** Records for every derived creature of the chunks within `ring` of (fcx, fcz) that has none and is not dead. */
function materialize(world: World, wl: WildlifeState, fcx: number, fcz: number, ring: number, secs: number, tick: number): void {
  const seed = world.seed, gen = world.params.generatorVersion;
  for (let cz = fcz - ring; cz <= fcz + ring; cz++) for (let cx = fcx - ring; cx <= fcx + ring; cx++) {
    for (const s of wildlifeInChunk(seed, gen, cx, cz)) {
      if (wl.animals.has(s.id) || wl.dead.has(s.id)) continue;
      wl.animals.set(s.id, newAnimal(s, secs, tick));
      wildlifeStats.materialized++;
    }
  }
}

/** Over the record budget: the farthest calm frozen records are dropped (they come back as derived when their chunk is next active). */
function evict(wl: WildlifeState, fcx: number, fcz: number): void {
  if (wl.animals.size <= animalCap) return;
  const far = [...wl.animals.values()].map((a) => ({ a, r: Math.max(Math.abs(chunkOfDm(a.x) - fcx), Math.abs(chunkOfDm(a.z) - fcz)) }))
    .filter((e) => e.r > ACTIVE_RING && !TRANSIENT.includes(e.a.a))
    .sort((p, q) => q.r - p.r || (p.a.id < q.a.id ? -1 : p.a.id > q.a.id ? 1 : 0));
  for (const e of far) {
    if (wl.animals.size <= animalCap) break;
    wl.animals.delete(e.a.id);
    wildlifeStats.evicted++;
  }
}

/** A frozen animal is stepped again: its needs converge to the resting baseline by the time away; a flight or chase is over. */
function catchUp(a: Animal, away: number): void {
  const k = away * CONVERGE;
  const to = (v: number, b: number) => (v > b ? Math.max(b, v - k) : Math.min(b, v + k));
  a.hu = to(a.hu, BASELINE.hu);
  if (a.sp !== 'trout') { a.th = to(a.th, BASELINE.th); a.fa = to(a.fa, BASELINE.fa); }
  if (TRANSIENT.includes(a.a)) { a.a = a.sp === 'trout' ? 'hold' : 'idle'; a.tg = ''; a.u = a.s + away; a.tx = a.x; a.tz = a.z; }
  a.st = 0;
}

// ---------- the step ----------

interface Env {
  w: World; g: WildGround; secs: number; tick: number; dt: number; phase: DayPhase; coarse: boolean;
  /** The player this tick (dm), or null. */
  p: Presence | null;
  noise: { x: number; z: number } | null;
  wl: WildlifeState;
  grid: Map<number, Animal[]>;
  groups: Map<string, Animal[]>;
  home: (a: Animal) => { x: number; z: number };
}
const bucket = (x: number, z: number) => (Math.floor(x / 160) + 1024) * 4096 + (Math.floor(z / 160) + 1024);
function near(env: Env, a: { x: number; z: number }, r: number, f: (o: Animal) => boolean): Animal[] {
  const out: Animal[] = [];
  const r2 = r * r;
  const bx0 = Math.floor((a.x - r) / 160), bx1 = Math.floor((a.x + r) / 160), bz0 = Math.floor((a.z - r) / 160), bz1 = Math.floor((a.z + r) / 160);
  for (let bz = bz0; bz <= bz1; bz++) for (let bx = bx0; bx <= bx1; bx++) {
    for (const o of env.grid.get((bx + 1024) * 4096 + (bz + 1024)) ?? []) if (d2(o.x, o.z, a.x, a.z) <= r2 && f(o)) out.push(o);
  }
  return out;
}
const nearest = (a: Animal, list: Animal[]) => {
  let best: Animal | null = null, bd = Infinity;
  for (const o of list) { const d = d2(o.x, o.z, a.x, a.z); if (d < bd || d === bd && best && o.id < best.id) { bd = d; best = o; } }
  return best;
};
const isqrt = (v: number) => Math.floor(Math.sqrt(v));

/** The player as a threat to `a`: distance (dm), whether moving and whether approaching. */
function playerThreat(env: Env, a: Animal): { d: number; moving: boolean; toward: boolean } | null {
  const p = env.p;
  if (!p || env.coarse) return null;
  const dd = d2(p.x, p.z, a.x, a.z);
  if (dd > 400 * 400) return null;
  const moving = p.mx !== 0 || p.mz !== 0;
  return { d: isqrt(dd), moving, toward: moving && p.mx * (a.x - p.x) + p.mz * (a.z - p.z) > 0 };
}
/**
 * The nearest predator `a` fears that is a danger now: one chasing this very
 * animal (seen from 30 m), a stalking fox only very close, a resting or
 * feeding one only at half the alarm distance, any other within it.
 */
function predatorNear(env: Env, a: Animal, scale = 1): Animal | null {
  const fears = FEARS[a.sp];
  if (!fears || env.coarse) return null;
  const R = WILD_RULES[a.sp].predator * scale;
  return nearest(a, near(env, a, 300, (o) => {
    if (!fears.includes(o.sp)) return false;
    const dd = d2(o.x, o.z, a.x, a.z);
    if (o.a === 'chase' && o.tg === a.id) return true;
    if (o.a === 'stalk') return dd <= 35 * 35;
    if (o.a === 'rest' || o.a === 'feed') return dd * 4 <= R * R;
    return dd <= R * R;
  }));
}
function heardNoise(env: Env, a: Animal, r: number): boolean {
  return !env.coarse && !!env.noise && d2(env.noise.x, env.noise.z, a.x, a.z) <= r * r;
}

/** Keep-away from the player: a move never ends inside the player's body plus the animal's whole length while it gets closer. */
function keepOf(sp: WildSpecies): number {
  const b = WILD_BODIES[sp as WildId];
  return b ? Math.ceil((PLAYER_R + bodyReach(b)) * 10) : 0;
}

/** Try a move of `dist` dm along direction k; returns the end point without committing it. */
function tryMove(env: Env, a: Animal, k: number, dist: number, free = false): { x: number; z: number; moved: number } {
  const fish = a.sp === 'trout', [ux, uz] = DIRS32[k];
  const keep = keepOf(a.sp), p = env.p;
  let x = a.x, z = a.z, moved = 0;
  while (moved < dist) {
    const s = Math.min(5, dist - moved);
    const nx = a.x + Math.round((ux * (moved + s)) / 1000), nz = a.z + Math.round((uz * (moved + s)) / 1000);
    const ax = cellOf(x), az = cellOf(z), bx = cellOf(nx), bz = cellOf(nz);
    if (ax !== bx || az !== bz) {
      if (free ? !insideM(bx, bz) : !env.g.step(fish, ax, az, bx, bz)) break;
    }
    if (p && keep && !fish) {
      const n2 = d2(nx, nz, p.x, p.z);
      if (n2 < keep * keep && n2 <= d2(x, z, p.x, p.z)) break;
    }
    x = nx; z = nz; moved += s;
  }
  return { x, z, moved };
}
const FAN = [0, 1, -1, 2, -2, 3, -3, 4, -4, 6, -6, 8, -8, 11, -11];

/** Move up to speed*dt toward direction k, steering around what blocks it; returns metres-tenths moved. */
function moveDir(env: Env, a: Animal, k0: number, dist: number, free = false): number {
  let best: { x: number; z: number; moved: number; k: number } | null = null;
  for (const off of FAN) {
    const k = (k0 + off + 32) & 31;
    const m = tryMove(env, a, k, dist, free);
    if (!best || m.moved > best.moved) best = { ...m, k };
    if (m.moved * 10 >= dist * 6) break;
  }
  if (!best || best.moved === 0) return 0;
  a.x = best.x; a.z = best.z; a.d = best.k;
  return best.moved;
}

const planCache = new Map<string, number[] | null>();
/**
 * A* on the animal's cells from its cell to the goal cell, in a window around
 * both: the path's cells after the start (cell keys, at most 24), or null.
 * Pure in (ground, cells), so the cache never changes a result.
 */
function plan(g: WildGround, fish: boolean, ax: number, az: number, bx: number, bz: number): number[] | null {
  const key = `${g.version}|${fish ? 1 : 0}|${ax},${az}>${bx},${bz}`;
  const hit = planCache.get(key);
  if (hit !== undefined) return hit;
  wildlifeStats.plans++;
  const ox = Math.min(ax, bx) - 12, oz = Math.min(az, bz) - 12;
  const W = Math.min(96, Math.max(ax, bx) + 12 - ox + 1), H = Math.min(96, Math.max(az, bz) + 12 - oz + 1);
  const idx = (x: number, z: number) => (z - oz) * W + (x - ox);
  const inWin = (x: number, z: number) => x >= ox && z >= oz && x < ox + W && z < oz + H;
  let result: number[] | null = null;
  if (inWin(bx, bz) && inWin(ax, az) && g.ok(fish, bx, bz)) {
    const gs = new Int32Array(W * H).fill(-1), par = new Int32Array(W * H).fill(-1), closed = new Uint8Array(W * H);
    const heap = new Heap();
    const hOf = (x: number, z: number) => { const dx = Math.abs(x - bx), dz = Math.abs(z - bz); return 10 * Math.max(dx, dz) + 4 * Math.min(dx, dz); };
    const s0 = idx(ax, az), goal = idx(bx, bz);
    gs[s0] = 0; heap.push(hOf(ax, az), hOf(ax, az), s0);
    let n = 0, found = false;
    while (heap.size && n++ < 2500) {
      const i = heap.pop();
      if (closed[i]) continue;
      closed[i] = 1;
      if (i === goal) { found = true; break; }
      const x = ox + (i % W), z = oz + Math.floor(i / W);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (!inWin(nx, nz)) continue;
        const j = idx(nx, nz);
        if (closed[j] || !g.step(fish, x, z, nx, nz)) continue;
        const ng = gs[i] + (dx && dz ? 14 : 10);
        if (gs[j] >= 0 && gs[j] <= ng) continue;
        gs[j] = ng; par[j] = i;
        const h = hOf(nx, nz);
        heap.push(ng + h, h, j);
      }
    }
    if (found) {
      const path: number[] = [];
      for (let k = goal; k !== -1 && path.length <= W * H; k = par[k]) path.push(k);
      path.reverse();
      result = path.slice(1, 25).map((c) => cellKey(ox + (c % W), oz + Math.floor(c / W)));
    }
  }
  if (planCache.size > 4096) planCache.delete(planCache.keys().next().value!);
  planCache.set(key, result);
  return result;
}
const keyX = (k: number) => Math.floor(k / 4096) - HALF, keyZ = (k: number) => (k % 4096) - HALF;

/**
 * Walk along straight segments through `pts` (dm) for up to `dist` dm. Every
 * cell change is checked by the ground's step rule and the keep-away from the
 * player; the walk stops at the first refusal. Returns dm walked.
 */
function walkPoints(env: Env, a: Animal, pts: number[], dist: number): number {
  const fish = a.sp === 'trout', keep = keepOf(a.sp), p = env.p;
  let left = dist, walked = 0;
  for (let i = 0; i < pts.length && left > 0; i += 2) {
    const sx = a.x, sz = a.z, ex = pts[i], ez = pts[i + 1];
    const L = Math.sqrt(d2(sx, sz, ex, ez));
    if (L < 1) continue;
    const go = Math.min(left, L);
    let x = sx, z = sz, done = 0;
    while (done < go) {
      const s = Math.min(5, go - done);
      const f = (done + s) / L;
      const nx = sx + Math.round((ex - sx) * f), nz = sz + Math.round((ez - sz) * f);
      if ((cellOf(nx) !== cellOf(x) || cellOf(nz) !== cellOf(z)) && !env.g.step(fish, cellOf(x), cellOf(z), cellOf(nx), cellOf(nz))) { left = 0; break; }
      if (p && keep && !fish) { const n2 = d2(nx, nz, p.x, p.z); if (n2 < keep * keep && n2 <= d2(x, z, p.x, p.z)) { left = 0; break; } }
      x = nx; z = nz; done += s;
    }
    if (x !== a.x || z !== a.z) a.d = dirToward(x - a.x, z - a.z);
    a.x = x; a.z = z; walked += done;
    left -= done;
    if (done < go) break;
  }
  return walked;
}

/** Walk toward (tx, tz) dm at `speed` dm/s for this step: straight when the line is clear, else along the A* route, else steering; true when there. */
function goTo(env: Env, a: Animal, tx: number, tz: number, speed: number): boolean {
  const dx = tx - a.x, dz = tz - a.z, dd = dx * dx + dz * dz;
  if (dd <= 25) return true;
  const L = Math.sqrt(dd), dist = Math.min(Math.round(speed * env.dt), Math.ceil(L));
  const fish = a.sp === 'trout', ax = cellOf(a.x), az = cellOf(a.z), bx = cellOf(tx), bz = cellOf(tz);
  let moved = 0;
  // Straight along the cells of a clear line (an exact segment can still clip a corner cell: then the route).
  if (env.g.line(fish, ax, az, bx, bz, 90)) moved = walkPoints(env, a, [tx, tz], dist);
  if (moved * 2 < dist && L < 900) {
    const path = plan(env.g, fish, ax, az, bx, bz);
    if (path) {
      // Along the route's cell centres; if the first leg from where it stands clips a blocked corner, by its own cell's centre first.
      const pts: number[] = [];
      for (const k of path) pts.push(centreDm(keyX(k)), centreDm(keyZ(k)));
      if (cellOf(tx) === keyX(path[path.length - 1]) && cellOf(tz) === keyZ(path[path.length - 1])) pts.push(tx, tz);
      const m = walkPoints(env, a, pts, dist - moved);
      moved += m > 0 ? m : walkPoints(env, a, [centreDm(ax), centreDm(az), ...pts], dist - moved);
    }
  }
  if (moved === 0) moveDir(env, a, dirToward(dx, dz), dist);
  // Progress is getting nearer the goal (running along a shore that never gets closer is no progress).
  const now = d2(a.x, a.z, tx, tz);
  // Back and forth (a step nearer, a step away) still adds up to no progress: +2 for a step that gets nowhere, -1 for one that does.
  a.st = Math.sqrt(now) > L - Math.max(2, dist / 4) ? a.st + 2 : Math.max(0, a.st - 1);
  return now <= 36;
}
/** Run away from a point. */
function away(env: Env, a: Animal, fx: number, fz: number, speed: number, zig = 0): number {
  const k = (dirToward(a.x - fx, a.z - fz) + zig + 32) & 31;
  const dist = Math.round(speed * env.dt);
  const moved = moveDir(env, a, k, dist);
  a.st = moved * 4 < dist ? a.st + 1 : 0;
  return moved;
}

/** Can the animal walk (swim) from where it is to the cell: a straight line, or a route the bounded A* finds. */
function reachable(env: Env, a: Animal, x: number, z: number): boolean {
  const fish = a.sp === 'trout', ax = cellOf(a.x), az = cellOf(a.z);
  return env.g.line(fish, ax, az, x, z, 90) || plan(env.g, fish, ax, az, x, z) !== null;
}
/** A random good cell within r dm of (cx, cz) satisfying `pred` that the animal can reach (a few draws of its stream), as dm centre. */
function spotNear(env: Env, a: Animal, cx: number, cz: number, r: number, pred: (x: number, z: number) => boolean = () => true, tries = 6): { x: number; z: number } | null {
  const fish = a.sp === 'trout';
  for (let i = 0; i < tries; i++) {
    const k = randInt(a, 32), d = randInt(a, Math.max(1, r));
    const x = cellOf(cx + Math.round((DIRS32[k][0] * d) / 1000)), z = cellOf(cz + Math.round((DIRS32[k][1] * d) / 1000));
    if (env.g.ok(fish, x, z) && pred(x, z) && reachable(env, a, x, z)) return { x: centreDm(x), z: centreDm(z) };
  }
  return null;
}
/** The nearest drinking place the animal can reach, or null. */
function drinkFor(env: Env, a: Animal, x = a.x, z = a.z): { x: number; z: number } | null {
  const s = drinkSpot(env.g, cellOf(x), cellOf(z));
  return s && reachable(env, a, cellOf(s.x), cellOf(s.z)) ? s : null;
}
const treesWithin = (g: WildGround, x: number, z: number, r: number) => {
  let n = 0;
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (g.tree(x + dx, z + dz)) n++;
  return n;
};
const drinkIndex = new Map<string, number[]>();
/** Dry cells beside water in a chunk (cell keys), from terrain and the natural planner only: pure in (seed, generator, chunk). */
function drinkCells(g: WildGround, cx: number, cz: number): number[] {
  const key = `${g.seed}:${g.gen}:${cx},${cz}`;
  let hit = drinkIndex.get(key);
  if (hit) return hit;
  hit = [];
  if (cx >= 0 && cz >= 0 && cx < CHUNKS_PER_SIDE && cz < CHUNKS_PER_SIDE) {
    const ox = chunkOriginX(cx), oz = chunkOriginZ(cz), sol = chunkSolids(g.seed, g.gen, cx, cz).cells;
    for (let z = oz; z < oz + CHUNK_SIZE; z++) for (let x = ox; x < ox + CHUNK_SIZE; x++) {
      if (!insideM(x, z) || g.t.d(x, z) !== 0 || sol.has(cellKey(x, z))) continue;
      if (g.t.d(x + 1, z) > 0 || g.t.d(x - 1, z) > 0 || g.t.d(x, z + 1) > 0 || g.t.d(x, z - 1) > 0) hit.push(cellKey(x, z));
    }
  }
  if (drinkIndex.size > 8192) drinkIndex.delete(drinkIndex.keys().next().value!);
  drinkIndex.set(key, hit);
  return hit;
}
/** The nearest dry cell beside water within 60 m that an animal may stand on (ties: lower cell key), or null. */
function drinkSpot(g: WildGround, x0: number, z0: number): { x: number; z: number } | null {
  const c0x = (x0 + HALF) >> 5, c0z = (z0 + HALF) >> 5;
  let best = -1, bd = 60 * 60 + 1;
  for (let cz = c0z - 2; cz <= c0z + 2; cz++) for (let cx = c0x - 2; cx <= c0x + 2; cx++) {
    for (const k of drinkCells(g, cx, cz)) {
      const x = Math.floor(k / 4096) - HALF, z = (k % 4096) - HALF, dd = (x - x0) * (x - x0) + (z - z0) * (z - z0);
      if (dd < bd || dd === bd && k < best) { if (g.built.has(k)) continue; bd = dd; best = k; }
    }
  }
  return best < 0 ? null : { x: centreDm(Math.floor(best / 4096) - HALF), z: centreDm((best % 4096) - HALF) };
}
/** A cell at the foot of a tree within 12 m (cover to bed down in), or null. */
function coverSpot(env: Env, a: Animal): { x: number; z: number } | null {
  return spotNear(env, a, a.x, a.z, 120, (x, z) => treesWithin(env.g, x, z, 2) > 0, 8);
}
/** The water level (bed + depth) of a water cell. */
const levelAt = (g: WildGround, x: number, z: number) => g.height(x, z) + g.depth(x, z);

const need = (v: number, by: number) => Math.max(0, Math.min(NEED_MAX, v + by));
function needs(a: Animal, env: Env): void {
  const R = WILD_RULES[a.sp], dt = env.dt;
  const resting = a.a === 'rest';
  a.hu = need(a.hu, R.hunger * dt * (resting ? 0.5 : 1));
  a.th = need(a.th, R.thirst * dt * (resting ? 0.5 : 1));
  const hard = a.a === 'flee' || a.a === 'chase' || a.a === 'pounce' || a.a === 'dart';
  a.fa = a.sp === 'trout' ? 0 : need(a.fa, resting ? -50 * dt : hard ? (a.sp === 'deer' ? 150 : 90) * dt : R.fatigue * dt);
}
const start = (a: Animal, act: Act, tx: number, tz: number, u = 0, tg = '') => { a.a = act; a.tx = tx; a.tz = tz; a.u = u; a.tg = tg; a.st = 0; };
const arrivedAct = (env: Env, a: Animal, secs: number) => { if (a.u === 0) a.u = env.secs + secs; };

/** Walk out of a cell the animal may not stand on (a building placed over it): to the nearest good cell, never a jump. */
function escapeIfStuck(env: Env, a: Animal): boolean {
  const fish = a.sp === 'trout', cx = cellOf(a.x), cz = cellOf(a.z);
  if (env.g.ok(fish, cx, cz)) { if (a.a === 'escape') start(a, fish ? 'hold' : 'idle', a.x, a.z, env.secs); return false; }
  if (a.a !== 'escape' || !env.g.ok(fish, cellOf(a.tx), cellOf(a.tz))) {
    let found: { x: number; z: number } | null = null;
    outer: for (let r = 1; r <= 24; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (env.g.ok(fish, cx + dx, cz + dz)) { found = { x: centreDm(cx + dx), z: centreDm(cz + dz) }; break outer; }
      }
    }
    if (!found) return true;
    start(a, 'escape', found.x, found.z);
  }
  const R = WILD_RULES[a.sp];
  moveDir(env, a, dirToward(a.tx - a.x, a.tz - a.z), Math.round(R.walk * env.dt), true);
  return true;
}

// ----- deer: forest-edge grazers and browsers in a herd; alert, then bolt; drink at water; bed down in cover at midday and at night.
function deer(env: Env, a: Animal): void {
  const R = WILD_RULES.deer, home = env.home(a);
  const runSpeed = a.fa >= CAUGHT ? R.tired : R.run;
  const wolf = predatorNear(env, a);
  const pl = playerThreat(env, a);
  const see = pl ? (pl.moving ? R.seeMoving : R.seeStill) : 0;
  // Herd alarm: a herd-mate in flight close by.
  const mates = env.groups.get(groupOf(a.id)) ?? [];
  // (Only from a mate that saw the danger itself, so an alarm passes one step and never keeps a herd running by itself.)
  const alarm = !env.coarse ? mates.find((o) => o !== a && o.a === 'flee' && !o.tg.startsWith('fauna:deer:') && d2(o.x, o.z, a.x, a.z) <= 150 * 150) : undefined;
  // A wolf on the hunt, or one at its heels, puts the deer to flight; one just passing makes it watch, then move off.
  const wolfClose = wolf && (wolf.a === 'chase' || wolf.a !== 'rest' && wolf.a !== 'feed' && d2(wolf.x, wolf.z, a.x, a.z) <= 60 * 60) ? wolf : null;
  if (wolfClose) start(a, 'flee', wolfClose.x, wolfClose.z, env.secs + 8, wolfClose.id);
  else if (wolf && a.a !== 'flee' && a.a !== 'alert') { start(a, 'alert', wolf.x, wolf.z, env.secs + 3, wolf.id); a.d = dirToward(wolf.x - a.x, wolf.z - a.z); }
  else if (pl && (pl.d < R.bolt || a.a === 'alert' && env.secs >= a.u && pl.d < see && (pl.toward || pl.d < R.seeStill))) start(a, 'flee', env.p!.x, env.p!.z, env.secs + 6, 'player');
  else if (pl && pl.d < see && a.a !== 'flee' && a.a !== 'alert') {
    // Head up, stamp, face the intruder: two or three seconds before deciding.
    start(a, 'alert', env.p!.x, env.p!.z, env.secs + 2 + randInt(a, 2), 'player');
    a.d = dirToward(env.p!.x - a.x, env.p!.z - a.z);
  } else if (heardNoise(env, a, 140) && a.a !== 'flee') start(a, 'flee', env.noise!.x, env.noise!.z, env.secs + 5, 'noise');
  else if (heardNoise(env, a, 250) && a.a !== 'flee' && a.a !== 'alert') start(a, 'alert', env.noise!.x, env.noise!.z, env.secs + 3, 'noise');
  else if (alarm && a.a !== 'flee') start(a, 'flee', alarm.tx, alarm.tz, env.secs + 5, alarm.id);

  if (a.a === 'flee') {
    // Away from the threat while it is in sight (a herd-mate's alarm: away from where it fled from); then stand alert.
    const src = fleeSource(env, a);
    if (src) { a.tx = src.x; a.tz = src.z; }
    away(env, a, a.tx, a.tz, runSpeed);
    // In sight: the player within 30 m, a wolf on the chase within 30 m, any other wolf within 15 m.
    const sight = !src ? 0 : a.tg === 'player' || (src as Animal).a === 'chase' ? 300 : 150;
    const still = src ? d2(src.x, src.z, a.x, a.z) < sight * sight : false;
    if (env.secs >= a.u && !still) start(a, 'alert', a.x, a.z, env.secs + 3);
    return;
  }
  if (a.a === 'alert') {
    if (env.secs < a.u) return;
    const w = a.tg.startsWith('fauna:wolf:') ? env.wl.animals.get(a.tg) : undefined;
    if (w && d2(w.x, w.z, a.x, a.z) < 200 * 200) {
      // Walk off, away from the wolf, 25 to 35 m.
      const k = dirToward(a.x - w.x, a.z - w.z), d = 250 + randInt(a, 100);
      const p = spotNear(env, a, a.x + Math.round((DIRS32[k][0] * d) / 1000), a.z + Math.round((DIRS32[k][1] * d) / 1000), 60);
      if (p) { start(a, 'wander', p.x, p.z); calmAct(env, a, R); return; }
    }
    start(a, 'idle', a.x, a.z, env.secs + 1);
    return;
  }
  const resting = R.restIn.includes(env.phase);
  if (a.u !== 0 && env.secs >= a.u) {
    const s = a.th > THIRSTY ? drinkFor(env, a) : null;
    if (s) start(a, 'drink', s.x, s.z);
    else {
      // The herd moves as one: every spot is chosen near the herd (its centre while that is within the home range, else home).
      const others = mates.filter((o) => o !== a);
      const c = centroid(others);
      const anchor = c && d2(c.x, c.z, home.x, home.z) <= R.range * R.range ? c : home;
      if (c && d2(c.x, c.z, a.x, a.z) > 120 * 120) start(a, 'wander', c.x, c.z);
      else if (resting && a.hu < 7000 || a.fa > TIRED) {
        const p = spotNear(env, a, anchor.x, anchor.z, 80, (x, z) => treesWithin(env.g, x, z, 2) > 0, 8) ?? { x: a.x, z: a.z };
        start(a, 'rest', p.x, p.z);
      } else if (a.hu > HUNGRY) {
        // Forest edge: browse at a tree, or graze the open ground beside the trees.
        const browse = rand(a) < 0.4;
        const p = spotNear(env, a, anchor.x, anchor.z, 100, (x, z) => browse ? treesWithin(env.g, x, z, 1) > 0
          : !env.g.tree(x, z) && treesWithin(env.g, x, z, 1) === 0 && treesWithin(env.g, x, z, 6) > 0, 8) ?? spotNear(env, a, a.x, a.z, 60);
        if (p) start(a, browse ? 'browse' : 'graze', p.x, p.z); else start(a, 'idle', a.x, a.z, env.secs + 2);
      } else {
        const p = spotNear(env, a, anchor.x, anchor.z, 100, (x, z) => treesWithin(env.g, x, z, 8) > 0);
        if (p) start(a, 'wander', p.x, p.z); else start(a, 'idle', a.x, a.z, env.secs + 3);
      }
    }
  }
  calmAct(env, a, R);
}
/** What a fleeing animal runs from now: the player, a predator, or (a herd-mate's alarm, a noise) the fixed point it fled from. */
function fleeSource(env: Env, a: Animal): { x: number; z: number } | null {
  if (a.tg === 'player') return env.p;
  if (!a.tg || a.tg === 'noise') return null;
  const o = env.wl.animals.get(a.tg);
  return o && o.sp !== a.sp ? o : null;
}
/** The shared second half of a calm act: walk to its spot, then do it there for its time. */
function calmAct(env: Env, a: Animal, R: WildRules): void {
  if (a.a === 'idle') return;
  if (a.u === 0) {
    const there = goTo(env, a, a.tx, a.tz, a.a === 'wander' || a.a === 'patrol' ? R.walk : R.walk);
    if (a.st >= 4) { start(a, 'idle', a.x, a.z, env.secs + 2); return; }
    if (!there) return;
    const dt = env.dt;
    switch (a.a) {
      case 'graze': case 'browse': arrivedAct(env, a, 20 + randInt(a, 30)); break;
      case 'drink': arrivedAct(env, a, 15 + randInt(a, 10)); break;
      case 'rest': arrivedAct(env, a, R.restIn.includes(env.phase) ? 90 + randInt(a, 90) : 30 + randInt(a, 40)); break;
      default: start(a, 'idle', a.x, a.z, env.secs + 2 + randInt(a, 6)); break;
    }
    void dt;
    return;
  }
  const dt = env.dt;
  if (a.a === 'graze' || a.a === 'browse') {
    a.hu = need(a.hu, -(a.sp === 'rabbit' ? 120 : 100) * dt);
    // A step or two between mouthfuls.
    if (rand(a) < 0.15) { const s = spotNear(env, a, a.x, a.z, 15, a.a === 'browse' ? (x, z) => treesWithin(env.g, x, z, 1) > 0 : undefined, 2); if (s) goTo(env, a, s.x, s.z, R.walk * 0.5); }
    if (a.hu < FULL) a.u = env.secs;
  } else if (a.a === 'drink') {
    a.th = need(a.th, -400 * dt);
    if (a.th < SLAKED) a.u = env.secs;
  } else if (a.a === 'rest') {
    if (a.fa < RESTED && !R.restIn.includes(env.phase) && rand(a) < 0.1) a.u = env.secs;
    if (a.hu > 8000 || a.th > 8500) a.u = env.secs;
  }
}
const groupOf = (id: string) => { const m = /^fauna:([a-z]+):(\d+,\d+):/.exec(id); return m ? `${m[1]}:${m[2]}` : id; };
function centroid(list: Animal[]): { x: number; z: number } | null {
  if (!list.length) return null;
  let x = 0, z = 0;
  for (const o of list) { x += o.x; z += o.z; }
  return { x: Math.round(x / list.length), z: Math.round(z / list.length) };
}

// ----- hare: grazes near its form; freezes when it is seen, then bolts in zig-zags; rests in its form by day.
function rabbit(env: Env, a: Animal): void {
  const R = WILD_RULES.rabbit, home = env.home(a);
  const pred = predatorNear(env, a);
  const pl = playerThreat(env, a);
  if (pred) start(a, 'flee', pred.x, pred.z, env.secs + 4, pred.id);
  else if (pl && a.a !== 'flee') {
    const see = pl.moving ? R.seeMoving : R.seeStill;
    if (pl.d < R.bolt || a.a === 'freeze' && env.secs >= a.u && pl.d < see && (pl.toward || pl.d < R.seeStill)) start(a, 'flee', env.p!.x, env.p!.z, env.secs + 4, 'player');
    else if (pl.d < see && a.a !== 'freeze') start(a, 'freeze', a.x, a.z, env.secs + 2 + randInt(a, 3), 'player');
    else if (pl.d >= see && a.a === 'freeze') start(a, 'idle', a.x, a.z, env.secs + 1);
  } else if (heardNoise(env, a, 150) && a.a !== 'flee' && a.a !== 'freeze') start(a, 'freeze', a.x, a.z, env.secs + 3, 'noise');

  if (a.a === 'flee') {
    const t = fleeSource(env, a);
    if (t) { a.tx = t.x; a.tz = t.z; }
    // Zig-zag: the heading swings 45 degrees either side, a new side every second.
    const zig = Math.floor(env.secs) % 2 === 0 ? 4 : -4;
    away(env, a, a.tx, a.tz, R.run, zig);
    const still = t ? d2(t.x, t.z, a.x, a.z) < 150 * 150 : false;
    if (env.secs >= a.u && !still) start(a, 'freeze', a.x, a.z, env.secs + 2);
    return;
  }
  if (a.a === 'freeze') { if (env.secs >= a.u && !pl) start(a, 'idle', a.x, a.z, env.secs + 1); return; }
  const resting = R.restIn.includes(env.phase);
  if (a.u !== 0 && env.secs >= a.u) {
    const w = a.th > 8000 ? drinkFor(env, a) : null;
    if (w && d2(w.x, w.z, a.x, a.z) < 300 * 300) start(a, 'drink', w.x, w.z);
    else if (resting && a.hu < 6000 || a.fa > TIRED) start(a, 'rest', home.x, home.z);
    else if (a.hu > 2500) {
      // Near cover: within 10 m of a tree or of the form.
      const s = spotNear(env, a, home.x, home.z, R.range, (x, z) => treesWithin(env.g, x, z, 10) > 0 || d2(centreDm(x), centreDm(z), home.x, home.z) < 100 * 100);
      if (s) start(a, 'graze', s.x, s.z);
    } else { const s = spotNear(env, a, home.x, home.z, R.range * 0.6); if (s) start(a, 'wander', s.x, s.z); }
  }
  calmAct(env, a, R);
}

// ----- fox: solitary; mouses in grass, stalks hares and pounces (W7: the hare always gets away); avoids people; flees wolves; rests by day.
function fox(env: Env, a: Animal): void {
  const R = WILD_RULES.fox, home = env.home(a);
  const wolf = predatorNear(env, a);
  const pl = playerThreat(env, a);
  if (wolf) start(a, 'flee', wolf.x, wolf.z, env.secs + 6, wolf.id);
  else if (pl && pl.d < R.bolt) start(a, 'flee', env.p!.x, env.p!.z, env.secs + 5, 'player');
  else if (pl && pl.d < (pl.moving ? R.seeMoving : R.seeStill) && a.a !== 'flee' && a.a !== 'avoid') start(a, 'avoid', env.p!.x, env.p!.z, env.secs + 4, 'player');
  else if (heardNoise(env, a, 200) && a.a !== 'flee') start(a, 'avoid', env.noise!.x, env.noise!.z, env.secs + 4, 'noise');

  if (a.a === 'flee' || a.a === 'avoid') {
    const t = fleeSource(env, a);
    if (t) { a.tx = t.x; a.tz = t.z; }
    away(env, a, a.tx, a.tz, a.a === 'flee' ? R.run : R.trot);
    const far = t ? d2(t.x, t.z, a.x, a.z) > 220 * 220 : true;
    if (env.secs >= a.u && far) start(a, 'idle', a.x, a.z, env.secs + 2);
    return;
  }
  if (a.a === 'stalk') {
    const hare = env.wl.animals.get(a.tg);
    if (!hare || hare.a === 'flee' || d2(hare.x, hare.z, a.x, a.z) > 200 * 200 || env.secs >= a.u) { start(a, 'idle', a.x, a.z, env.secs + 3); return; }
    // Creep up, low and slow.
    goTo(env, a, hare.x, hare.z, 6);
    if (d2(hare.x, hare.z, a.x, a.z) <= 35 * 35) start(a, 'pounce', hare.x, hare.z, env.secs + 2, hare.id);
    return;
  }
  if (a.a === 'pounce') {
    const hare = env.wl.animals.get(a.tg);
    if (hare) goTo(env, a, hare.x, hare.z, R.run); else goTo(env, a, a.tx, a.tz, R.run);
    // The hare bolts (it sees a fox that runs); W7 has no hare kills: the fox gives up and rests a little.
    if (env.secs >= a.u) start(a, 'rest', a.x, a.z, env.secs + 8 + randInt(a, 8));
    return;
  }
  if (a.a === 'mouse') {
    // Listen, then a high pounce into the grass: one in four catches a vole.
    if (a.u === 0) { if (goTo(env, a, a.tx, a.tz, R.walk) || a.st >= 4) a.u = env.secs + 4 + randInt(a, 6); return; }
    if (env.secs >= a.u) {
      if (rand(a) < 0.25) a.hu = need(a.hu, -3500);
      start(a, 'idle', a.x, a.z, env.secs + 1);
    }
    return;
  }
  const active = !R.restIn.includes(env.phase);
  if (a.u !== 0 && env.secs >= a.u) {
    const hungry = a.hu > HUNGRY && (active || a.hu > 6500);
    const hare = hungry && !env.coarse ? nearest(a, near(env, a, 130, (o) => o.sp === 'rabbit' && o.a !== 'flee')) : null;
    const w = a.th > THIRSTY ? drinkFor(env, a) : null;
    if (hare && rand(a) < 0.7) { start(a, 'stalk', hare.x, hare.z, env.secs + 20, hare.id); return; }
    if (w) start(a, 'drink', w.x, w.z);
    else if (!active && a.hu < 6500) start(a, 'rest', home.x, home.z);
    else if (hungry) { const s = spotNear(env, a, a.x, a.z, 100, (x, z) => !env.g.tree(x, z) && treesWithin(env.g, x, z, 2) === 0); if (s) start(a, 'mouse', s.x, s.z); }
    else { const s = spotNear(env, a, home.x, home.z, R.range); if (s) start(a, 'wander', s.x, s.z); }
  }
  calmAct(env, a, R);
}

// ----- wolf: a pack that follows its leader; the leader patrols, hunts deer when the pack is hungry (a caught deer dies), drinks and rests.
const SLOTS: ReadonlyArray<readonly [number, number]> = [[30, -25], [-30, -25], [0, -45], [45, 10], [-45, 10]];
function wolf(env: Env, a: Animal): void {
  const R = WILD_RULES.wolf, home = env.home(a);
  const pack = (env.groups.get(groupOf(a.id)) ?? []).filter((o) => o.sp === 'wolf');
  const leader = pack[0];
  const follower = !!leader && leader !== a;
  const pl = playerThreat(env, a);
  if (pl && pl.d < R.bolt && a.a !== 'chase') start(a, 'flee', env.p!.x, env.p!.z, env.secs + 5, 'player');
  else if (pl && pl.d < (pl.moving ? R.seeMoving : R.seeStill) && a.a !== 'flee' && a.a !== 'avoid' && a.a !== 'chase' && a.a !== 'feed') start(a, 'avoid', env.p!.x, env.p!.z, env.secs + 5, 'player');
  else if (heardNoise(env, a, 250) && a.a !== 'flee' && a.a !== 'avoid' && a.a !== 'chase') start(a, 'avoid', env.noise!.x, env.noise!.z, env.secs + 5, 'noise');
  else if (follower && leader.a === 'chase' && !env.coarse && a.a !== 'chase' && a.a !== 'flee') start(a, 'chase', leader.tx, leader.tz, leader.u, leader.tg);
  else if (follower && leader.a === 'feed' && a.a !== 'feed') start(a, 'feed', leader.tx, leader.tz, 0, leader.tg);
  if (a.a === 'flee' || a.a === 'avoid') {
    const t = fleeSource(env, a);
    if (t) { a.tx = t.x; a.tz = t.z; }
    away(env, a, a.tx, a.tz, a.a === 'flee' ? R.run : R.trot);
    if (env.secs >= a.u && (!t || d2(t.x, t.z, a.x, a.z) > 300 * 300)) start(a, 'idle', a.x, a.z, env.secs + 2);
    return;
  }
  if (a.a === 'chase') {
    const prey = env.wl.animals.get(a.tg);
    if (!prey || env.coarse || env.secs >= a.u || d2(prey.x, prey.z, a.x, a.z) > 500 * 500) { start(a, 'rest', a.x, a.z, env.secs + 30); return; }
    a.tx = prey.x; a.tz = prey.z;
    goTo(env, a, prey.x, prey.z, R.run);
    a.st = 0;
    if (d2(prey.x, prey.z, a.x, a.z) <= 15 * 15 && prey.fa >= CAUGHT) kill(env, prey, a);
    return;
  }
  if (a.a === 'feed') {
    const c = env.wl.carcasses.get(a.tg);
    if (!c) { start(a, 'rest', a.x, a.z, env.secs + 60); return; }
    if (a.u === 0) { if (goTo(env, a, c.x, c.z, R.walk) || a.st >= 4 || d2(c.x, c.z, a.x, a.z) < 20 * 20) a.u = env.secs + 120; return; }
    a.hu = need(a.hu, -120 * env.dt);
    if (env.secs >= a.u || a.hu < FULL) start(a, 'rest', a.x, a.z, env.secs + 120 + randInt(a, 60));
    return;
  }
  if (follower) {
    // Rest and drink with the leader; otherwise keep to a place behind it.
    const slot = SLOTS[Math.max(0, pack.indexOf(a) - 1) % SLOTS.length];
    const sx = leader.x + slot[0], sz = leader.z + slot[1];
    if (leader.a === 'rest') {
      if (a.a !== 'rest') start(a, 'rest', sx, sz);
      if (a.u === 0 && (goTo(env, a, sx, sz, R.walk) || a.st >= 4)) a.u = Math.max(leader.u, env.secs + 1);
      return;
    }
    // Drink with the leader, or alone when very thirsty (then back to its place).
    if ((leader.a === 'drink' && a.th > 2000 || a.th > 8000) && a.a !== 'drink') { const s = drinkFor(env, a, a.th > 8000 ? a.x : sx, a.th > 8000 ? a.z : sz); if (s) start(a, 'drink', s.x, s.z); }
    if (a.a === 'drink') { calmAct(env, a, R); if (a.u !== 0 && env.secs >= a.u) start(a, 'follow', sx, sz); return; }
    if (a.a !== 'follow') start(a, 'follow', sx, sz);
    a.tx = sx; a.tz = sz;
    goTo(env, a, sx, sz, d2(sx, sz, a.x, a.z) > 80 * 80 ? R.trot : R.walk);
    a.st = 0;
    return;
  }
  // The leader.
  const active = !R.restIn.includes(env.phase);
  if (a.u !== 0 && env.secs >= a.u || a.a === 'patrol' && a.st >= 4 || a.a === 'follow') {
    const deer = !env.coarse && (a.hu >= PACK_HUNT && active || a.hu >= 9500) ? near(env, a, 450, (o) => o.sp === 'deer') : [];
    deer.sort((p, q) => q.fa - p.fa || d2(p.x, p.z, a.x, a.z) - d2(q.x, q.z, a.x, a.z) || (p.id < q.id ? -1 : 1));
    const w = a.th > THIRSTY ? drinkFor(env, a) : null;
    if (deer.length) { start(a, 'chase', deer[0].x, deer[0].z, env.secs + 60, deer[0].id); return; }
    if (w) start(a, 'drink', w.x, w.z);
    else if (!active && a.hu < 9000) { const c = coverSpot(env, a) ?? { x: a.x, z: a.z }; start(a, 'rest', c.x, c.z); }
    else { const p = spotNear(env, a, home.x, home.z, R.range); if (p) start(a, 'patrol', p.x, p.z); else start(a, 'idle', a.x, a.z, env.secs + 4); }
  }
  if (a.a === 'patrol') {
    if (goTo(env, a, a.tx, a.tz, R.walk)) start(a, 'idle', a.x, a.z, env.secs + 3 + randInt(a, 5));
    return;
  }
  calmAct(env, a, R);
}

/** An authoritative death: the record goes, the id is tombstoned for good, a carcass lies where it fell. */
function kill(env: Env, prey: Animal, by: Animal): void {
  const wl = env.wl;
  wl.animals.delete(prey.id);
  wl.dead.add(prey.id);
  wl.kills++;
  if (wl.carcasses.size >= MAX_CARCASSES) {
    const oldest = [...wl.carcasses.values()].sort((p, q) => p.t - q.t || (p.id < q.id ? -1 : 1))[0];
    wl.carcasses.delete(oldest.id);
  }
  wl.carcasses.set(prey.id, { id: prey.id, sp: prey.sp, x: prey.x, z: prey.z, t: env.tick, by: 'wolf' });
  // The whole pack feeds.
  for (const o of env.groups.get(groupOf(by.id)) ?? []) if (o.sp === 'wolf') start(o, 'feed', prey.x, prey.z, 0, prey.id);
  const grid = env.grid.get(bucket(prey.x, prey.z));
  if (grid) { const i = grid.indexOf(prey); if (i >= 0) grid.splice(i, 1); }
  const grp = env.groups.get(groupOf(prey.id));
  if (grp) { const i = grp.indexOf(prey); if (i >= 0) grp.splice(i, 1); }
}

// ----- trout: only in water; hold station facing upstream, cruise up or down the stream, keep with the school, rise to feed at dusk, dart from a shadow on the bank.
function trout(env: Env, a: Animal): void {
  const R = WILD_RULES.trout;
  const pl = playerThreat(env, a);
  if (pl && pl.d < (pl.moving ? R.seeMoving : R.seeStill) && a.a !== 'dart') { start(a, 'dart', env.p!.x, env.p!.z, env.secs + 3, 'player'); a.dp = 8; }
  if (a.a === 'dart') {
    away(env, a, a.tx, a.tz, R.run);
    if (env.secs >= a.u) start(a, 'hold', a.x, a.z, env.secs + 4);
    return;
  }
  const school = (env.groups.get(groupOf(a.id)) ?? []).filter((o) => o !== a);
  const c = centroid(school);
  if (a.u !== 0 && env.secs < a.u) {
    if (a.a === 'rise') { a.hu = need(a.hu, -80 * env.dt); if (a.hu < FULL) a.u = env.secs; }
    if (a.a === 'hold') { const up = upstream(env.g, a); if (up >= 0) a.d = up; }
    return;
  }
  if (a.u === 0) {
    const there = goTo(env, a, a.tx, a.tz, a.a === 'school' ? R.trot : R.walk);
    if (there || a.st >= 4) { a.u = env.secs + (a.a === 'rise' ? 20 : 6) + randInt(a, 8); if (a.a !== 'rise') a.a = 'hold'; }
    return;
  }
  // Choose.
  if (c && d2(c.x, c.z, a.x, a.z) > 40 * 40) { start(a, 'school', c.x, c.z); a.dp = 5; return; }
  if (a.hu > HUNGRY && (env.phase === 'dusk' || env.phase === 'dawn' || a.hu > 7000)) { const s = spotNear(env, a, a.x, a.z, 40); if (s) { start(a, 'rise', s.x, s.z); a.dp = 1; return; } }
  // Cruise up or down the stream to a new lie (up more often), within the home range.
  const up = upstream(env.g, a);
  const dir = up >= 0 ? (rand(a) < 0.65 ? up : (up + 16) & 31) : randInt(a, 32);
  const home = env.home(a);
  let best: { x: number; z: number } | null = null;
  for (let d = 150; d >= 30; d -= 30) {
    const x = cellOf(a.x + Math.round((DIRS32[dir][0] * d) / 1000)), z = cellOf(a.z + Math.round((DIRS32[dir][1] * d) / 1000));
    if (env.g.water(x, z) && d2(centreDm(x), centreDm(z), home.x, home.z) < R.range * R.range) { best = { x: centreDm(x), z: centreDm(z) }; break; }
  }
  if (!best) best = spotNear(env, a, home.x, home.z, R.range * 0.5);
  if (best) { start(a, 'cruise', best.x, best.z); a.dp = 3 + randInt(a, 4); }
  else start(a, 'hold', a.x, a.z, env.secs + 6);
}
/** Direction (0..31) to the higher water within 6 m (upstream), or -1 in still water. */
function upstream(g: WildGround, a: Animal): number {
  const cx = cellOf(a.x), cz = cellOf(a.z), here = levelAt(g, cx, cz);
  let best = -1, bl = here;
  for (let k = 0; k < 32; k += 4) {
    const x = cellOf(a.x + Math.round((DIRS32[k][0] * 60) / 1000)), z = cellOf(a.z + Math.round((DIRS32[k][1] * 60) / 1000));
    if (!g.water(x, z)) continue;
    const l = levelAt(g, x, z);
    if (l > bl) { bl = l; best = k; }
  }
  return best;
}

const MINDS: Record<WildSpecies, (env: Env, a: Animal) => void> = { deer, rabbit, fox, wolf, trout };

/**
 * One world tick of wildlife (content v8). `presence` is the tick's journaled
 * player presence; without it the active area stays where the last one was,
 * and nothing reacts to the player.
 */
export function stepWildlife(world: World, tick: number, presence?: Presence): void {
  const wl = world.wild?.wildlife;
  if (!wl) return;
  const t0 = performance.now();
  if (presence) {
    // A jump of the active area (a respawn far away) grows the new area ring by ring again, as at the start.
    if (wl.focus && Math.max(Math.abs(chunkOfDm(presence.x) - chunkOfDm(wl.focus.x)), Math.abs(chunkOfDm(presence.z) - chunkOfDm(wl.focus.z))) > ACTIVE_RING) wl.reach = 0;
    wl.focus = { x: presence.x, z: presence.z };
  }
  // Carcasses lie for CARCASS_TICKS, then are gone (their tombstones stay).
  for (const c of [...wl.carcasses.values()]) if (tick - c.t >= CARCASS_TICKS) wl.carcasses.delete(c.id);
  if (!wl.focus) return;
  const secs = secsOf(tick);
  const fcx = chunkOfDm(wl.focus.x), fcz = chunkOfDm(wl.focus.z);
  wl.reach = Math.min(ACTIVE_RING, wl.reach + 1);
  materialize(world, wl, fcx, fcz, wl.reach, secs, tick);
  evict(wl, fcx, fcz);
  const g = wildGround(world);
  const seed = world.seed, gen = world.params.generatorVersion;
  const homes = new Map<string, { x: number; z: number }>();
  const home = (a: Animal) => {
    let h = homes.get(a.id);
    if (!h) { const s = spawnOf(seed, gen, a.id); h = s ? { x: s.x, z: s.z } : { x: a.x, z: a.z }; homes.set(a.id, h); }
    return h;
  };
  const list = [...wl.animals.values()].sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  const full: Animal[] = [], coarse: Animal[] = [];
  let frozen = 0;
  for (const a of list) {
    // The ring of where it stands, or of its home when that is nearer: an animal of the active area that strayed past its edge is still
    // stepped (coarse) and walks home, instead of freezing out there.
    const h = home(a);
    const r = Math.min(Math.max(Math.abs(chunkOfDm(a.x) - fcx), Math.abs(chunkOfDm(a.z) - fcz)),
      Math.max(Math.abs(chunkOfDm(h.x) - fcx), Math.abs(chunkOfDm(h.z) - fcz)));
    if (r > ACTIVE_RING) { frozen++; a.trail = undefined; continue; }
    if (a.s < secs - 2) catchUp(a, secs - 2 - a.s);
    a.trail = [a.x, a.z];
    (r <= FULL_RING ? full : coarse).push(a);
  }
  const phase = dayPhase(tick);
  const noise = wl.noise && tick - wl.noise.t <= 1 ? { x: wl.noise.x, z: wl.noise.z } : null;
  const groups = new Map<string, Animal[]>();
  for (const a of [...full, ...coarse]) { const k = groupOf(a.id); const l = groups.get(k); if (l) l.push(a); else groups.set(k, [a]); }
  for (const l of groups.values()) l.sort(byId);
  const mk = (dt: number, c: boolean, s: number): Env => ({ w: world, g, secs: s, tick, dt, phase, coarse: c, p: presence ?? null, noise, wl, grid: new Map(), groups, home });
  // Full ring: two 1 s sub-steps with perception.
  for (let k = 1; k <= FULL_SUBSTEPS; k++) {
    const env = mk(2 / FULL_SUBSTEPS, false, secs - 2 + k * (2 / FULL_SUBSTEPS));
    for (const a of full) { const b = bucket(a.x, a.z); const l = env.grid.get(b); if (l) l.push(a); else env.grid.set(b, [a]); }
    for (const a of full) {
      if (!wl.animals.has(a.id)) continue;
      stepOne(env, a);
      a.trail!.push(a.x, a.z);
    }
  }
  // Coarse ring: one 2 s step, calm behaviour only.
  const envC = mk(2, true, secs);
  for (const a of coarse) { if (!wl.animals.has(a.id)) continue; stepOne(envC, a); a.trail!.push(a.x, a.z); }
  for (const a of [...full, ...coarse]) a.s = secs;
  const ms = performance.now() - t0;
  wildlifeStats.ms = ms; wildlifeStats.maxMs = Math.max(wildlifeStats.maxMs, ms); wildlifeStats.ticks++;
  wildlifeStats.full = full.length; wildlifeStats.coarse = coarse.length; wildlifeStats.frozen = frozen;
}

function stepOne(env: Env, a: Animal): void {
  needs(a, env);
  if (escapeIfStuck(env, a)) return;
  MINDS[a.sp](env, a);
  if (a.st >= 6) {
    // No progress for a while: a new goal in another direction, walked to (never a jump).
    const s = spotNear(env, a, a.x, a.z, 100, (x, z) => env.g.line(a.sp === 'trout', cellOf(a.x), cellOf(a.z), x, z, 12));
    if (s) start(a, a.sp === 'trout' ? 'cruise' : 'wander', s.x, s.z); else a.st = 0;
  }
}

// ---------- queries ----------

export function animalsNear(world: World, x: number, z: number, r: number): Animal[] {
  const wl = world.wild?.wildlife;
  if (!wl) return [];
  const out: Animal[] = [];
  const xd = x * 10, zd = z * 10, rd = r * 10;
  for (const a of wl.animals.values()) if (d2(a.x, a.z, xd, zd) <= rd * rd) out.push(a);
  return out.sort((p, q) => (p.id < q.id ? -1 : 1));
}

// ---------- snapshot form ----------

export interface AnimalSnapshot { a: Act; d: number; dp?: number; fa: number; hu: number; id: string; r: number; s: number; st: number; tg?: string; th: number; tx: number; tz: number; u: number; x: number; z: number }
export interface CarcassSnapshot { by: 'wolf'; id: string; t: number; x: number; z: number }
export interface WildlifeSnapshot {
  animals: AnimalSnapshot[];
  carcasses: CarcassSnapshot[];
  dead: string[];
  focus?: { x: number; z: number };
  kills: number;
  noise?: { t: number; x: number; z: number };
  reach: number;
}
const byId = <T extends { id: string }>(p: T, q: T) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0);
export function wildlifeSnapshot(wl: WildlifeState): WildlifeSnapshot {
  return {
    animals: [...wl.animals.values()].sort(byId).map((a) => ({
      a: a.a, d: a.d, ...(a.sp === 'trout' ? { dp: a.dp } : {}), fa: a.fa, hu: a.hu, id: a.id, r: a.r, s: a.s, st: a.st,
      ...(a.tg ? { tg: a.tg } : {}), th: a.th, tx: a.tx, tz: a.tz, u: a.u, x: a.x, z: a.z,
    })),
    carcasses: [...wl.carcasses.values()].sort(byId).map((c) => ({ by: c.by, id: c.id, t: c.t, x: c.x, z: c.z })),
    dead: [...wl.dead].sort(),
    ...(wl.focus ? { focus: { x: wl.focus.x, z: wl.focus.z } } : {}),
    kills: wl.kills,
    ...(wl.noise ? { noise: { t: wl.noise.t, x: wl.noise.x, z: wl.noise.z } } : {}),
    reach: wl.reach,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= lo && v <= hi;
const POS = HALF * 10;
const TG = /^(?:player|noise|fauna:(?:deer|rabbit|trout|fox|wolf):\d{1,2},\d{1,2}:\d{1,2})$/;
const speciesOf = (id: string) => ANIMAL_ID.exec(id)![1] as WildSpecies;

/** Strict canonical form (formats and bounds; a record's id must be one a chunk can derive by its pattern); throws otherwise. */
export function validateWildlife(raw: unknown, tick: number): WildlifeSnapshot {
  const bad = (what: string): never => { throw new Error(`snapshot wilderness wildlife: invalid ${what}`); };
  if (!isObj(raw)) bad('block');
  const v = raw as Record<string, unknown>;
  const keys = Object.keys(v);
  const want = ['animals', 'carcasses', 'dead', ...(v.focus !== undefined ? ['focus'] : []), 'kills', ...(v.noise !== undefined ? ['noise'] : []), 'reach'];
  if (keys.join() !== want.join()) bad('fields');
  if (!Array.isArray(v.animals) || v.animals.length > MAX_ANIMALS || !Array.isArray(v.carcasses) || v.carcasses.length > MAX_CARCASSES
    || !Array.isArray(v.dead) || v.dead.length > MAX_DEAD || !int(v.kills, 0, 1e9) || !int(v.reach, 0, ACTIVE_RING)) bad('fields');
  const secs = tick * 2;
  const dead = new Set<string>();
  let last = '';
  for (const id of v.dead as unknown[]) {
    if (typeof id !== 'string' || !ANIMAL_ID.test(id) || (last && !(last < id))) bad('tombstone');
    last = id as string; dead.add(id as string);
  }
  last = '';
  const animals: AnimalSnapshot[] = [];
  for (const x of v.animals as unknown[]) {
    if (!isObj(x) || typeof x.id !== 'string' || !ANIMAL_ID.test(x.id) || (last && !(last < x.id)) || dead.has(x.id)) bad('animal');
    const r = x as Record<string, unknown>, id = r.id as string, sp = speciesOf(id);
    const fish = sp === 'trout';
    const k = ['a', 'd', ...(fish ? ['dp'] : []), 'fa', 'hu', 'id', 'r', 's', 'st', ...(r.tg !== undefined ? ['tg'] : []), 'th', 'tx', 'tz', 'u', 'x', 'z'];
    if (Object.keys(r).join() !== k.join()) bad(`animal ${id} fields`);
    if (typeof r.a !== 'string' || !SPECIES_ACTS[sp].includes(r.a as Act) || !int(r.d, 0, 31) || fish && !int(r.dp, 0, 10)
      || !int(r.hu, 0, NEED_MAX) || !int(r.th, 0, NEED_MAX) || !int(r.fa, 0, NEED_MAX) || fish && (r.th !== 0 || r.fa !== 0)
      || !int(r.r, 0, 0xffffffff) || !int(r.s, 0, secs) || !int(r.st, 0, 100) || r.tg !== undefined && (typeof r.tg !== 'string' || !TG.test(r.tg))
      || !int(r.x, -POS, POS) || !int(r.z, -POS, POS) || !int(r.tx, -POS, POS) || !int(r.tz, -POS, POS) || !int(r.u, 0, Number.MAX_SAFE_INTEGER)) bad(`animal ${id}`);
    last = id;
    animals.push({ a: r.a as Act, d: r.d as number, ...(fish ? { dp: r.dp as number } : {}), fa: r.fa as number, hu: r.hu as number, id, r: r.r as number,
      s: r.s as number, st: r.st as number, ...(r.tg !== undefined ? { tg: r.tg as string } : {}), th: r.th as number, tx: r.tx as number, tz: r.tz as number,
      u: r.u as number, x: r.x as number, z: r.z as number });
  }
  last = '';
  const carcasses: CarcassSnapshot[] = [];
  for (const x of v.carcasses as unknown[]) {
    if (!isObj(x) || Object.keys(x).join() !== 'by,id,t,x,z' || x.by !== 'wolf' || typeof x.id !== 'string' || !ANIMAL_ID.test(x.id) || !dead.has(x.id)
      || (last && !(last < x.id)) || !int(x.t, 0, tick) || tick - (x.t as number) > CARCASS_TICKS || !int(x.x, -POS, POS) || !int(x.z, -POS, POS)) bad('carcass');
    const c = x as Record<string, unknown>;
    last = c.id as string;
    carcasses.push({ by: 'wolf', id: c.id as string, t: c.t as number, x: c.x as number, z: c.z as number });
  }
  const pt = (p: unknown, t: boolean) => isObj(p) && Object.keys(p).join() === (t ? 't,x,z' : 'x,z') && int(p.x, -POS, POS) && int(p.z, -POS, POS) && (!t || int(p.t, 0, tick));
  if (v.focus !== undefined && !pt(v.focus, false)) bad('focus');
  if (v.noise !== undefined && !pt(v.noise, true)) bad('noise');
  return {
    animals, carcasses, dead: [...dead], ...(v.focus !== undefined ? { focus: { ...(v.focus as { x: number; z: number }) } } : {}), kills: v.kills as number,
    ...(v.noise !== undefined ? { noise: { ...(v.noise as { t: number; x: number; z: number }) } } : {}), reach: v.reach as number,
  };
}

export function wildlifeFromSnapshot(s: WildlifeSnapshot): WildlifeState {
  return {
    animals: new Map(s.animals.map((a) => [a.id, { id: a.id, sp: speciesOf(a.id), x: a.x, z: a.z, d: a.d, a: a.a, u: a.u, tx: a.tx, tz: a.tz, tg: a.tg ?? '',
      hu: a.hu, th: a.th, fa: a.fa, dp: a.dp ?? 0, r: a.r, s: a.s, st: a.st }])),
    dead: new Set(s.dead),
    carcasses: new Map(s.carcasses.map((c) => [c.id, { id: c.id, sp: speciesOf(c.id), x: c.x, z: c.z, t: c.t, by: c.by }])),
    focus: s.focus ? { ...s.focus } : null, reach: s.reach, noise: s.noise ? { ...s.noise } : null, kills: s.kills,
  };
}

/** The animals' bounded A* (cell keys after the start, or null): exported for tests. */
export const planCells = (g: WildGround, fish: boolean, ax: number, az: number, bx: number, bz: number) => plan(g, fish, ax, az, bx, bz);
