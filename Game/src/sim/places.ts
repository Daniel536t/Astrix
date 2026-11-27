// W5: named places of a wilderness world, from deterministic pure rules.
//
// A place exists only where its rule holds on the generated terrain; nothing
// is placed by hand and nothing reads the voxel edits, so the list is a pure
// function of (seed, generator version). Places are never saved: a world
// saves only which place ids the player has discovered (sim/map.ts).
//
// Rules (sampled on a 16 m lattice; area places one per 512 m block at most,
// at the best lattice point, and only with enough qualifying ground around it):
//   meadow   "Fertile Meadow": open grass (forest < 0.1), gentle (8 m relief
//            <= 2 m), low (2-30 m), within 120 m of the river or lake;
//   forest   "... Wood/Forest": forestScore >= 0.55 on land with 8 m relief <= 4 m
//            (where the tree rule plants 72 % of its lattice points);
//   highland "Rocky Highlands": height >= 45 m and rockScore >= 0.5;
//   ore      "Ore Mountain/Ridge": bare stone (top STONE) with rockScore > 0.58 and
//            height >= 30 m: the ground the styl_ore rule places outcrops on;
//   quarry   "Quarry": bare stone faces (top STONE) below 30 m with rockScore > 0.45:
//            stone within reach of low ground;
// and along the water network (hydrology):
//   ford     "River Ford": a stretch of river where a straight crossing
//            perpendicular to the flow stays within WADE_MAX depth (the same
//            1 m rule walkers and routes use) with dry land on both banks;
//   valley   "River Valley": a lowland river point with low land (<= 10 m) on
//            both banks at 40 m and higher ground (>= 15 m) within 150 m of each;
//   lake     "Mirror Lake" and tarn "Highland Tarn": the hydrology water bodies,
//            when their centre is really under water.
// The Trading Post is not a place here (W10). No three.js.
import { GENERATOR_V2, HALF, MAT, WORLD_SIZE, terrainV2, baseHeightAt, baseTopMaterialFor, baseWaterLevelAt, forestScore, hydrologyFor, rockScore } from './world';
import { hash2i } from './noise';
import { WADE_MAX } from './nav';

export const PLACE_KINDS = ['ford', 'valley', 'lake', 'tarn', 'meadow', 'forest', 'highland', 'ore', 'quarry'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];
export interface Place { id: string; kind: PlaceKind; name: string; x: number; z: number; note: string }

export const PLACE_BLOCK = 512;
export const PLACE_BLOCKS = WORLD_SIZE / PLACE_BLOCK;
const LATTICE = 16;
export const PLACE_ID = /^pl:(?:lake|tarn|ford:[0-3],[0-3]:[0-2]|(?:valley|meadow|forest|highland|ore|quarry):[0-3],[0-3])$/;

const NAMES: Record<PlaceKind, readonly string[]> = {
  ford: ['River Ford', 'Shallow Ford', 'Pebble Ford', 'Stony Ford', 'Reed Ford', 'Willow Ford'],
  valley: ['River Valley', 'Lower Valley', 'Long Valley', 'Green Valley'],
  lake: ['Mirror Lake'], tarn: ['Highland Tarn'],
  meadow: ['Fertile Meadow', 'Clover Meadow', 'Sunny Meadow', 'Long Meadow'],
  forest: ['Old Forest', 'Deep Wood', 'Mossy Wood', 'Green Forest'],
  highland: ['Rocky Highlands', 'Stony Heights', 'High Crags', 'Windy Heights'],
  ore: ['Ore Mountain', 'Ore Ridge', 'Ore Crags', 'Ore Spur'],
  quarry: ['Quarry', 'Stone Quarry', 'Grey Quarry', 'Rock Quarry'],
};
const NOTES: Record<PlaceKind, string> = {
  ford: 'a shallow crossing: the river is no deeper than 1 m along a straight line here',
  valley: 'low land along the river between higher ground',
  lake: 'a deep lake', tarn: 'a mountain lake, the source of the mountain river',
  meadow: 'open, gentle grassland near water',
  forest: 'dense woodland',
  highland: 'high, rocky ground',
  ore: 'bare stone of the kind ore outcrops form on',
  quarry: 'bare stone faces near low ground',
};
/** A name from the kind's pool, by a hash of the block (and the k-th of several in one block: distinct names). */
const nameOf = (kind: PlaceKind, seed: number, a: number, b: number, k = 0) =>
  NAMES[kind][(Math.min(NAMES[kind].length - 1, Math.floor(hash2i(a, b, seed + 9301 + PLACE_KINDS.indexOf(kind)) * NAMES[kind].length)) + k) % NAMES[kind].length];

const height = (seed: number, gen: number, x: number, z: number) => baseHeightAt(seed, gen, Math.floor(x), Math.floor(z));
const depthAt = (seed: number, gen: number, x: number, z: number) => {
  const fx = Math.floor(x), fz = Math.floor(z);
  return Math.max(0, baseWaterLevelAt(seed, gen, fx, fz) - baseHeightAt(seed, gen, fx, fz));
};
const inWorld = (x: number, z: number) => Math.abs(x) < HALF - 2 && Math.abs(z) < HALF - 2;

// ---------- one sampled grid per 512 m block ----------
const GRID = 8;
const MARGIN = 48;
const GN = (PLACE_BLOCK + 2 * MARGIN) / GRID;
/** Generated height and water depth every 8 m over a block and a 48 m margin (one terrain column each). */
interface BlockGrid { x0: number; z0: number; h: Int16Array; d: Uint8Array }
function blockGrid(seed: number, gen: number, bx: number, bz: number): BlockGrid {
  const x0 = -HALF + bx * PLACE_BLOCK - MARGIN, z0 = -HALF + bz * PLACE_BLOCK - MARGIN;
  const h = new Int16Array(GN * GN), d = new Uint8Array(GN * GN);
  const v2 = gen >= GENERATOR_V2 ? terrainV2(seed) : null;
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
    const x = x0 + i * GRID, z = z0 + j * GRID, k = j * GN + i;
    if (!inWorld(x, z)) { h[k] = -14; d[k] = 255; continue; }
    if (v2) { const c = v2.column(x, z); h[k] = c.h; d[k] = Math.min(254, Math.max(0, c.level - c.h)); }
    else { h[k] = height(seed, gen, x, z); d[k] = Math.min(254, depthAt(seed, gen, x, z)); }
  }
  return { x0, z0, h, d };
}

// ---------- area places ----------
interface Sample { x: number; z: number; h: number; d: number; relief: number; forest: number; rock: number; top: number; li: number; lj: number }
const blockCache = new Map<string, Place[]>();

type Rule = { kind: PlaceKind; holds: (s: Sample, nearWater: boolean) => boolean; score: (s: Sample) => number; radius: number; need: number };
const AREA_RULES: readonly Rule[] = [
  { kind: 'meadow', holds: (s, w) => s.d === 0 && s.h >= 2 && s.h <= 30 && s.relief <= 2 && s.forest < 0.1 && w, score: (s) => -s.relief - s.forest, radius: 48, need: 6 },
  { kind: 'forest', holds: (s) => s.d === 0 && s.h > 1 && s.relief <= 4 && s.forest >= 0.55, score: (s) => s.forest, radius: 48, need: 10 },
  { kind: 'highland', holds: (s) => s.d === 0 && s.h >= 45 && s.rock >= 0.5, score: (s) => s.h / 100 + s.rock, radius: 48, need: 8 },
  { kind: 'ore', holds: (s) => s.top === MAT.STONE && s.rock > 0.58 && s.h >= 30, score: (s) => s.rock, radius: 64, need: 5 },
  { kind: 'quarry', holds: (s) => s.top === MAT.STONE && s.rock > 0.45 && s.h < 30 && s.h > 1, score: (s) => s.rock, radius: 32, need: 4 },
];

/** Water within 120 m (river or lake), from the hydrology network. */
function nearWaterOf(seed: number, gen: number, x: number, z: number): boolean {
  const hy = hydrologyFor(seed, gen);
  const low = hy.lower.nearest(x, z);
  if (low && low.d < 120) return true;
  const up = hy.upper?.nearest(x, z);
  if (up && up.d < 120) return true;
  return Math.hypot((x - hy.lake.x) / (hy.lake.rx + 120), (z - hy.lake.z) / (hy.lake.rz + 120)) < 1;
}

/** The places of one 512 m block (pure, cached): area places on a 16 m lattice, then fords and a valley. */
export function placesInBlock(seed: number, gen: number, bx: number, bz: number): Place[] {
  if (bx < 0 || bz < 0 || bx >= PLACE_BLOCKS || bz >= PLACE_BLOCKS) return [];
  const key = `${seed}:${gen}:${bx},${bz}`;
  const hit = blockCache.get(key);
  if (hit) return hit;
  const g = blockGrid(seed, gen, bx, bz);
  const LN = PLACE_BLOCK / LATTICE;
  const lattice: Array<Sample | null> = new Array(LN * LN).fill(null);
  const samples: Sample[] = [];
  const water: boolean[] = [];
  for (let lj = 0; lj < LN; lj++) for (let li = 0; li < LN; li++) {
    // Lattice point (x0 + 8 + 16 li): grid index 7 + 2 li (the grid starts 48 m before the block).
    const gi = MARGIN / GRID + 1 + 2 * li, gj = MARGIN / GRID + 1 + 2 * lj, k = gj * GN + gi;
    const x = g.x0 + gi * GRID, z = g.z0 + gj * GRID;
    if (!inWorld(x, z)) continue;
    const h = g.h[k], d = g.d[k];
    const relief = Math.max(Math.abs(h - g.h[k + 1]), Math.abs(h - g.h[k - 1]), Math.abs(h - g.h[k + GN]), Math.abs(h - g.h[k - GN]));
    const forest = forestScore(x, z, seed), rock = rockScore(x, z, seed);
    // Top material only where a stone rule could use it (the ore and quarry rules); it is the generator's own.
    let top = -1;
    if (d === 0 && rock > 0.45) {
      const slope = Math.max(Math.abs(h - baseHeightAt(seed, gen, x + 1, z)), Math.abs(h - baseHeightAt(seed, gen, x - 1, z)),
        Math.abs(h - baseHeightAt(seed, gen, x, z + 1)), Math.abs(h - baseHeightAt(seed, gen, x, z - 1)));
      top = baseTopMaterialFor(seed, gen, x, z, h, slope);
    }
    const sm: Sample = { x, z, h, d, relief, forest, rock, top, li, lj };
    lattice[lj * LN + li] = sm;
    samples.push(sm);
    water.push(d === 0 && forest < 0.1 && relief <= 2 && h >= 2 && h <= 30 ? nearWaterOf(seed, gen, x, z) : false);
  }
  const out: Place[] = [];
  for (const rule of AREA_RULES) {
    const ok = new Uint8Array(LN * LN);
    samples.forEach((sm, i) => { if (rule.holds(sm, water[i])) ok[sm.lj * LN + sm.li] = 1; });
    const r = Math.floor(rule.radius / LATTICE);
    let best: Sample | null = null, bestScore = -Infinity;
    for (const sm of samples) {
      if (!ok[sm.lj * LN + sm.li]) continue;
      let n = 0;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        const li = sm.li + di, lj = sm.lj + dj;
        if (li < 0 || lj < 0 || li >= LN || lj >= LN || !ok[lj * LN + li]) continue;
        if (Math.hypot(di * LATTICE, dj * LATTICE) <= rule.radius) n++;
      }
      if (n < rule.need) continue;
      const sc = rule.score(sm) + n / 1000;
      if (sc > bestScore) { bestScore = sc; best = sm; }
    }
    if (!best) continue;
    out.push({ id: `pl:${rule.kind}:${bx},${bz}`, kind: rule.kind, name: nameOf(rule.kind, seed, bx, bz), x: best.x, z: best.z, note: NOTES[rule.kind] });
  }
  out.push(...blockWaterPlaces(seed, gen, bx, bz, g));
  out.sort((a, b) => a.id.localeCompare(b.id));
  blockCache.set(key, out);
  return out;
}

// ---------- water places ----------
const waterCache = new Map<string, Place[]>();
const RIVER_MAX = 48;

/** Is the straight 1 m line from (x0, z0) to (x1, z1) a wadeable crossing (every sample within WADE_MAX, some water, dry both ends)? */
export function fordableLine(seed: number, gen: number, x0: number, z0: number, x1: number, z1: number): boolean {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
  let wet = 0;
  for (let k = 0; k <= n; k++) {
    const d = depthAt(seed, gen, x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n);
    if (d > WADE_MAX) return false;
    if (d > 0) wet++;
  }
  return wet >= 2 && depthAt(seed, gen, x0, z0) === 0 && depthAt(seed, gen, x1, z1) === 0;
}

interface Run { a: number; b: number; line: number; deep: boolean }

/**
 * Fords and a valley in one 512 m block, from the block's 8 m water map (with
 * its 48 m margin, so a river on the edge is seen whole). A crossing is a run
 * of water no wider than RIVER_MAX between dry samples on a row (or column);
 * it is a ford when the 1 m line across it is wadeable, and deep water lies
 * within 160 m (so the shallow stretch is the way across).
 */
function blockWaterPlaces(seed: number, gen: number, bx: number, bz: number, g: BlockGrid): Place[] {
  const { x0, z0, d: depth } = g;
  const n = GN, STEP = GRID;
  const deepCells: number[] = [];
  for (let k = 0; k < depth.length; k++) if (depth[k] > WADE_MAX && depth[k] < 255) deepCells.push(k);
  const deepNear = (x: number, z: number) => deepCells.some((k) => Math.hypot(x0 + (k % n) * STEP - x, z0 + Math.floor(k / n) * STEP - z) <= 160);
  const inBlock = (x: number, z: number) => x >= x0 + MARGIN && x < x0 + MARGIN + PLACE_BLOCK && z >= z0 + MARGIN && z < z0 + MARGIN + PLACE_BLOCK;
  type Crossing = { x: number; z: number };
  const stretches: Array<{ rows: Crossing[] }> = [];
  const channels: Array<{ x: number; z: number; nx: number; nz: number }> = [];
  for (const horizontal of [true, false]) {
    let open: Array<{ rows: Crossing[]; last: number; c: number }> = [];
    for (let line = 0; line < n; line++) {
      const runs: Run[] = [];
      let start = -1, deep = false;
      for (let t = 0; t < n; t++) {
        const dd = depth[horizontal ? line * n + t : t * n + line];
        if (dd > 0 && dd < 255) { if (start < 0) { start = t; deep = false; } if (dd > WADE_MAX) deep = true; continue; }
        if (start > 0 && dd === 0 && (t - start) * STEP <= RIVER_MAX) runs.push({ a: start - 1, b: t, line, deep });
        start = -1;
      }
      const next: typeof open = [];
      for (const r of runs) {
        const c = (r.a + r.b) / 2;
        const p = (t: number) => horizontal ? { x: x0 + t * STEP, z: z0 + line * STEP } : { x: x0 + line * STEP, z: z0 + t * STEP };
        const A = p(r.a), B = p(r.b), M = p(c);
        if (line % 8 === 0) channels.push({ x: M.x, z: M.z, nx: horizontal ? 1 : 0, nz: horizontal ? 0 : 1 });
        if (r.deep || !inBlock(M.x, M.z) || !fordableLine(seed, gen, A.x, A.z, B.x, B.z)) continue;
        const cr = { x: M.x, z: M.z };
        const prev = open.find((o) => o.last === line - 1 && Math.abs(o.c - c) <= 1);
        if (prev) { prev.rows.push(cr); prev.last = line; prev.c = c; next.push(prev); } else { const st = { rows: [cr], last: line, c }; next.push(st); stretches.push({ rows: st.rows }); }
      }
      open = next;
    }
  }
  const out: Place[] = [];
  const fords: Array<{ x: number; z: number; len: number }> = [];
  for (const st of stretches) {
    if (st.rows.length < 2) continue;
    const m = st.rows[Math.floor(st.rows.length / 2)];
    if (!deepNear(m.x, m.z)) continue;
    if (fords.some((f) => Math.hypot(f.x - m.x, f.z - m.z) < 32)) continue;
    fords.push({ x: m.x, z: m.z, len: st.rows.length * STEP });
  }
  fords.sort((a, b) => b.len - a.len || a.x - b.x || a.z - b.z);
  fords.slice(0, 3).forEach((f, k) => out.push({ id: `pl:ford:${bx},${bz}:${k}`, kind: 'ford', name: nameOf('ford', seed, bx, bz, k), x: f.x, z: f.z, note: NOTES.ford }));
  // Valley: a river run with low dry banks 40 m out on both sides and higher ground within 150 m of each.
  let best: { x: number; z: number; score: number } | null = null;
  for (const c of channels) {
    if (!inBlock(c.x, c.z)) continue;
    let score = 0, ok = true;
    for (const sg of [1, -1]) {
      const bxw = c.x + c.nx * 40 * sg, bzw = c.z + c.nz * 40 * sg;
      const near = height(seed, gen, bxw, bzw);
      if (depthAt(seed, gen, bxw, bzw) !== 0 || near < 1 || near > 10) { ok = false; break; }
      let high = false;
      for (let r = 60; r <= 150 && !high; r += 15) high = height(seed, gen, c.x + c.nx * r * sg, c.z + c.nz * r * sg) >= 15;
      if (!high) { ok = false; break; }
      score -= near;
    }
    if (ok && (!best || score > best.score)) best = { x: c.x, z: c.z, score };
  }
  if (best) out.push({ id: `pl:valley:${bx},${bz}`, kind: 'valley', name: nameOf('valley', seed, bx, bz), x: best.x, z: best.z, note: NOTES.valley });
  return out;
}

/** The lake and the tarn of the hydrology network, when their centre is really under water. */
export function waterPlaces(seed: number, gen: number): Place[] {
  const key = `${seed}:${gen}`;
  const hit = waterCache.get(key);
  if (hit) return hit;
  const hy = hydrologyFor(seed, gen);
  const out: Place[] = [];
  const lake = hy.lake;
  if (inWorld(lake.x, lake.z) && depthAt(seed, gen, lake.x, lake.z) > WADE_MAX) {
    out.push({ id: 'pl:lake', kind: 'lake', name: NAMES.lake[0], x: Math.round(lake.x), z: Math.round(lake.z), note: NOTES.lake });
  }
  const tarn = hy.tarn;
  if (tarn && inWorld(tarn.x, tarn.z) && depthAt(seed, gen, tarn.x, tarn.z) > 0) {
    out.push({ id: 'pl:tarn', kind: 'tarn', name: NAMES.tarn[0], x: Math.round(tarn.x), z: Math.round(tarn.z), note: NOTES.tarn });
  }
  waterCache.set(key, out);
  return out;
}

/** Every place whose anchor lies within `r` metres of (x, z) (sorted by id). */
export function placesNear(seed: number, gen: number, x: number, z: number, r: number): Place[] {
  const out: Place[] = [];
  const b0x = Math.max(0, Math.floor((x - r + HALF) / PLACE_BLOCK)), b1x = Math.min(PLACE_BLOCKS - 1, Math.floor((x + r + HALF) / PLACE_BLOCK));
  const b0z = Math.max(0, Math.floor((z - r + HALF) / PLACE_BLOCK)), b1z = Math.min(PLACE_BLOCKS - 1, Math.floor((z + r + HALF) / PLACE_BLOCK));
  for (let bz = b0z; bz <= b1z; bz++) for (let bx = b0x; bx <= b1x; bx++) {
    for (const p of placesInBlock(seed, gen, bx, bz)) if (Math.hypot(p.x - x, p.z - z) <= r) out.push(p);
  }
  for (const p of waterPlaces(seed, gen)) if (Math.hypot(p.x - x, p.z - z) <= r) out.push(p);
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** The place with this id, or null (computes its block). */
export function placeById(seed: number, gen: number, id: string): Place | null {
  const m = /^pl:[a-z]+:([0-3]),([0-3])/.exec(id);
  if (m) return placesInBlock(seed, gen, Number(m[1]), Number(m[2])).find((p) => p.id === id) ?? null;
  return waterPlaces(seed, gen).find((p) => p.id === id) ?? null;
}

/** Forget computed places (tests: prove a recomputation gives the same). */
export function resetPlaceCache(): void { blockCache.clear(); waterCache.clear(); }

/** Every place of the world (tests and tools; computes all 16 blocks). */
export function allPlaces(seed: number, gen: number): Place[] {
  const out: Place[] = [];
  for (let bz = 0; bz < PLACE_BLOCKS; bz++) for (let bx = 0; bx < PLACE_BLOCKS; bx++) out.push(...placesInBlock(seed, gen, bx, bz));
  out.push(...waterPlaces(seed, gen));
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
