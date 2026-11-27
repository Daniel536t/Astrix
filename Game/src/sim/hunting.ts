// W8 (wilderness content v9): hunting with a bow. Pure TS, deterministic, no three.js.
//
// A shot is one journaled `shoot` command: the arrow kind, the release point
// (`from`, integer cm), the aim (`dir`, an integer vector of length about
// 10,000), the draw time (`draw`, ms) and the moment of release within the
// current 2 s world tick (`t`, thousandths: how far the drawn animals had
// moved along their latest tick's path when the player let go). The arrow is
// NOT sent to a target: the simulation flies it.
//
// Flight. The launch speed follows the draw time (SPEED_MIN at DRAW_MIN_MS
// up to SPEED_MAX at DRAW_FULL_MS). The arrow is integrated with fixed
// sub-steps of 1/60 s (semi-implicit Euler) under gravity 9.81 m/s^2 and
// quadratic air drag (k|v|v, per arrow kind), for at most 4 s. Only + - * /
// and Math.sqrt, which are correctly rounded, so every engine replays the
// same. Each sub-step is a segment tested against, in this order on ties:
//  - the ground and water: the 1 m terrain columns (route.ts TerrainCache,
//    the same columns the voxels are generated from; the wilderness has no
//    voxel edits), traversed cell by cell (an exact 2D DDA); water stops an arrow;
//  - finished buildings (their collision boxes, wild-build.ts);
//  - standing trees and stumps (a vertical cylinder: the trunk radius of the
//    stage, up to the trunk's height; the crown's leaves do not stop arrows);
//  - fallen trunks (a horizontal cylinder);
//  - land animals: a body capsule and a head sphere per species, placed where
//    the animal is at that moment of the flight. An animal's position is its
//    latest tick's path (saved in content v9), each sub-step an equal share of
//    the 2 s tick, at the fraction t/1000 + (flight time)/2 s; past the end of
//    the path it stands where its record is. Lying animals (resting, a frozen
//    hare, stunned) are lower. Trout are in the water and are not targets.
// The first contact is the impact; nothing is decided by what the player
// selected or aimed at.
//
// Damage, by the speed at impact v: 10 * (v / SPEED_MAX)^2 points, x1.5 on
// the head, rounded. Below 1 point a sharp arrow glances off. A sharp arrow
// takes health (WILD_HP: deer 12, wolf 10, fox 4, hare 3): at 0 the animal
// dies (a tombstone and a player's carcass, where it was hit); otherwise it is
// wounded (slower, tires faster, flees; heals 1 point every 300 s). A blunt
// arrow never takes health: with stun power (the same formula) at or above
// the species' threshold the animal lies stunned for its species' time, then
// gets up and flees (`stunned`, never a tombstone, never a carcass); below
// the threshold it is only bruised and flees. Animals the arrow passes within
// 2 m of flee, and the impact is a noise the animals around hear (W7).
//
// Arrows: a sharp arrow that hits an animal is spent; one that hits stone,
// gravel, ore or a building breaks; one in soft ground, a tree or a trunk
// can be picked up where it struck (a pile). A blunt arrow never breaks: it
// drops where it struck (at an animal's feet). In water or out of the world
// an arrow is lost.
//
// Butchering: a journaled `butcher` is one knife swing at a player's carcass
// within reach. Every BUTCHER_SWINGS swings one output (BUTCHER_ORDER) comes
// off onto a pile beside the carcass (meat, hide or bone, a pile per item),
// counted in the carcass record, so nothing comes off twice. The last output
// removes the carcass; the tombstone stays. A wolves' kill is picked over and
// cannot be butchered.
import type { World } from './world';
import { HALF, MAT, baseTopMaterialFor, chunkKey, ensureChunk } from './world';
import { terrainCache } from './route';
import type { TerrainCache } from './route';
import { LIFE_TRUNK, treeLife } from './woodland';
import type { TreeStage } from './woodland';
import { DIRS16, SWINGS_PER_TICK, noteEvent, standingTreeHeight } from './felling';
import type { FellEvent, FellState } from './felling';
import { bagRefusal, buildingSolids } from './wild-build';
import {
  Animal, BUTCHER_ORDER, BUTCHER_SWINGS, Carcass, DIRS32, STUN_ACT, WILD_HP, WildSpecies, WildlifeState, makeRoomForCarcass, noteNoise,
} from './wildlife';
import type { At, WildItem, WildResult, WildState } from './gathering';

export const ARROW_KINDS = ['arrow', 'blunt_arrow'] as const;
export type ArrowKind = (typeof ARROW_KINDS)[number];
export type Prey = Exclude<WildSpecies, 'trout'>;

/** Fixed integration step (s) and the longest flight (s). */
export const ARROW_DT = 1 / 60;
export const MAX_FLIGHT_STEPS = 240;
export const ARROW_GRAVITY = 9.81;
/** Quadratic drag coefficient (1/m): the blunt head is heavier and draggier. */
export const ARROW_DRAG: Record<ArrowKind, number> = { arrow: 0.0022, blunt_arrow: 0.006 };
/** Launch speed (m/s) from the draw time (ms). */
export const SPEED_MIN = 12, SPEED_MAX = 40;
export const DRAW_MIN_MS = 300, DRAW_FULL_MS = 1200, DRAW_MAX_MS = 60_000;
/** Shots the simulation accepts per world tick (2 s). */
export const SHOTS_PER_TICK = 3;
/** Release point: within this horizontal distance of the player's position (m), and this high above the ground there (m). */
export const ORIGIN_REACH = 1.0;
export const ORIGIN_LOW = 0.2, ORIGIN_HIGH = 3.5;
/** The player may not be farther than this from the last journaled presence (m): 2 s at a run, and a margin. */
export const PRESENCE_SLACK = 16;
/** An arrow passing this close to an animal's body centre (m) puts it to flight. */
export const NEAR_PASS = 2;
/** Body points of a hit at SPEED_MAX on the body; the head takes 1.5 times as much. */
export const ARROW_DAMAGE = 10;
export const HEAD_FACTOR = 1.5;
/** Blunt arrows: stun power needed per species, and how long (s) a stunned animal lies. */
export const STUN_AT: Record<Prey, number> = { rabbit: 2, fox: 3, wolf: 7, deer: 8 };
export const STUN_SECS: Record<Prey, number> = { rabbit: 40, fox: 40, wolf: 24, deer: 30 };
/** A wounded animal flees this long (s); one startled by a near miss or a bruise, this long. */
export const WOUND_FLEE = 12, STARTLE_FLEE = 6;
/** Butchering reach (m) from the player to the carcass. */
export const BUTCHER_REACH = 2.2;
export { BUTCHER_ORDER, BUTCHER_SWINGS };
export const BOW_DURABILITY = 150;

/**
 * Hit shapes (m), from the block models (render/animal-models.ts): the body a horizontal capsule along the heading
 * (centre `bz` ahead of the position, half-length `hl`, radius `r`, at height `y`), the head a sphere (`hz` ahead, at
 * `hy`, radius `hr`). A lying animal is `lie` lower (the renderer lowers it by 0.7 of its leg length).
 */
export const HIT_SHAPES: Record<Prey, { bz: number; hl: number; r: number; y: number; hz: number; hy: number; hr: number; lie: number }> = {
  deer: { bz: -0.05, hl: 0.36, r: 0.21, y: 1.02, hz: 0.62, hy: 1.5, hr: 0.17, lie: 0.6 },
  wolf: { bz: 0, hl: 0.3, r: 0.18, y: 0.76, hz: 0.72, hy: 0.95, hr: 0.16, lie: 0.41 },
  fox: { bz: -0.02, hl: 0.22, r: 0.11, y: 0.4, hz: 0.5, hy: 0.48, hr: 0.1, lie: 0.21 },
  rabbit: { bz: -0.08, hl: 0.1, r: 0.11, y: 0.22, hz: 0.25, hy: 0.3, hr: 0.08, lie: 0.08 },
};

export const isArrowKind = (v: unknown): v is ArrowKind => ARROW_KINDS.includes(v as ArrowKind);

// ---------- ballistics (shared with the client's aim preview and flight drawing) ----------

/** Launch speed (m/s) of a draw held `drawMs`. */
export function arrowSpeed(drawMs: number): number {
  const k = Math.min(1, Math.max(0, (drawMs - DRAW_MIN_MS) / (DRAW_FULL_MS - DRAW_MIN_MS)));
  return SPEED_MIN + (SPEED_MAX - SPEED_MIN) * k;
}
/** The unit aim of an integer direction (length 9,900..10,100), or null. */
export function unitDir(d: { x: number; y: number; z: number }): { x: number; y: number; z: number } | null {
  const n = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
  if (!(n >= 9900 && n <= 10100)) return null;
  return { x: d.x / n, y: d.y / n, z: d.z / n };
}
/** The integer direction the client sends for a unit vector. */
export const quantiseDir = (x: number, y: number, z: number) => { const n = Math.hypot(x, y, z) || 1; return { x: Math.round(x / n * 10000), y: Math.round(y / n * 10000), z: Math.round(z / n * 10000) }; };

export interface Flight { x: number; y: number; z: number; vx: number; vy: number; vz: number }
/** One fixed step: velocity under gravity and drag, then position (semi-implicit Euler). */
export function stepFlight(f: Flight, kind: ArrowKind): void {
  const v = Math.sqrt(f.vx * f.vx + f.vy * f.vy + f.vz * f.vz), k = ARROW_DRAG[kind] * v;
  f.vx -= k * f.vx * ARROW_DT;
  f.vy -= (ARROW_GRAVITY + k * f.vy) * ARROW_DT;
  f.vz -= k * f.vz * ARROW_DT;
  f.x += f.vx * ARROW_DT; f.y += f.vy * ARROW_DT; f.z += f.vz * ARROW_DT;
}
/** The flight's start from the command's numbers (release in cm, integer aim, draw ms). */
export function launch(from: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, drawMs: number): Flight | null {
  const u = unitDir(dir);
  if (!u) return null;
  const s = arrowSpeed(drawMs);
  return { x: from.x / 100, y: from.y / 100, z: from.z / 100, vx: u.x * s, vy: u.y * s, vz: u.z * s };
}
/** Positions (x, y, z, every step from the release) of a free flight of `steps` steps: the aim preview and the drawn flight. */
export function flightPath(f0: Flight, kind: ArrowKind, steps = MAX_FLIGHT_STEPS): number[] {
  const f = { ...f0 }, out = [f.x, f.y, f.z];
  for (let i = 0; i < steps; i++) { stepFlight(f, kind); out.push(f.x, f.y, f.z); }
  return out;
}

// ---------- geometry ----------

type V3 = { x: number; y: number; z: number };
/** Squared distance from point p to segment ab, and the parameter. */
function pointSeg(px: number, py: number, pz: number, a: V3, b: V3): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l = dx * dx + dy * dy + dz * dz;
  let t = l > 0 ? ((px - a.x) * dx + (py - a.y) * dy + (pz - a.z) * dz) / l : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const ex = a.x + dx * t - px, ey = a.y + dy * t - py, ez = a.z + dz * t - pz;
  return ex * ex + ey * ey + ez * ez;
}
/** Closest points of segments p0p1 and q0q1 (Ericson): the parameter on p, and the squared distance. */
function segSeg(p0: V3, p1: V3, q0: V3, q1: V3): { s: number; d2: number } {
  const d1x = p1.x - p0.x, d1y = p1.y - p0.y, d1z = p1.z - p0.z, d2x = q1.x - q0.x, d2y = q1.y - q0.y, d2z = q1.z - q0.z;
  const rx = p0.x - q0.x, ry = p0.y - q0.y, rz = p0.z - q0.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
  let s = 0, t = 0;
  if (a <= 1e-12 && e <= 1e-12) { s = 0; t = 0; } else if (a <= 1e-12) { s = 0; t = clamp01(f / e); } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-12) { t = 0; s = clamp01(-c / a); } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
      s = den > 1e-12 ? clamp01((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp01(-c / a); } else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
    }
  }
  const cx = p0.x + d1x * s - (q0.x + d2x * t), cy = p0.y + d1y * s - (q0.y + d2y * t), cz = p0.z + d1z * s - (q0.z + d2z * t);
  return { s, d2: cx * cx + cy * cy + cz * cz };
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const at = (p0: V3, p1: V3, s: number): V3 => ({ x: p0.x + (p1.x - p0.x) * s, y: p0.y + (p1.y - p0.y) * s, z: p0.z + (p1.z - p0.z) * s });
/** First parameter on p0p1 within r of the capsule axis ab, or null (the set is an interval: bisection from the start to the closest point). */
function capsuleFirst(p0: V3, p1: V3, a: V3, b: V3, r: number): number | null {
  const c = segSeg(p0, p1, a, b);
  if (c.d2 > r * r) return null;
  if (pointSeg(p0.x, p0.y, p0.z, a, b) <= r * r) return 0;
  let lo = 0, hi = c.s;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2, p = at(p0, p1, m); if (pointSeg(p.x, p.y, p.z, a, b) <= r * r) hi = m; else lo = m; }
  return hi;
}
/** First parameter on p0p1 inside the sphere (c, r), or null. */
function sphereFirst(p0: V3, p1: V3, c: V3, r: number): number | null {
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z, fx = p0.x - c.x, fy = p0.y - c.y, fz = p0.z - c.z;
  const a = dx * dx + dy * dy + dz * dz, b = 2 * (fx * dx + fy * dy + fz * dz), cc = fx * fx + fy * fy + fz * fz - r * r;
  if (cc <= 0) return 0;
  if (a <= 1e-12) return null;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const s = (-b - Math.sqrt(disc)) / (2 * a);
  return s >= 0 && s <= 1 ? s : null;
}

// ---------- the world an arrow meets ----------

/** First contact of p0p1 with the terrain columns: parameter, water or ground, the column. Null when clear. */
function terrainFirst(t: TerrainCache, p0: V3, p1: V3): { s: number; water: boolean; cx: number; cz: number } | 'out' | null {
  const dx = p1.x - p0.x, dz = p1.z - p0.z, dy = p1.y - p0.y;
  let ix = Math.floor(p0.x), iz = Math.floor(p0.z);
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0, sz = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  let tx = sx === 0 ? Infinity : (sx > 0 ? ix + 1 - p0.x : p0.x - ix) / Math.abs(dx);
  let tz = sz === 0 ? Infinity : (sz > 0 ? iz + 1 - p0.z : p0.z - iz) / Math.abs(dz);
  const ddx = sx === 0 ? Infinity : 1 / Math.abs(dx), ddz = sz === 0 ? Infinity : 1 / Math.abs(dz);
  let s0 = 0;
  for (let guard = 0; guard < 64; guard++) {
    if (ix < -HALF + 1 || iz < -HALF + 1 || ix >= HALF - 1 || iz >= HALF - 1) return 'out';
    const s1 = Math.min(tx, tz, 1);
    const h = t.h(ix, iz), d = t.d(ix, iz), top = h + d;
    const y0 = p0.y + dy * s0, y1 = p0.y + dy * s1;
    if (d > 0) {
      if (y0 < top) return { s: s0, water: true, cx: ix, cz: iz };
      if (y1 < top) return { s: (top - p0.y) / dy, water: true, cx: ix, cz: iz };
    } else {
      if (y0 < h) return { s: s0, water: false, cx: ix, cz: iz };
      if (y1 < h) return { s: (h - p0.y) / dy, water: false, cx: ix, cz: iz };
    }
    if (s1 >= 1) return null;
    if (tx < tz) { ix += sx; s0 = tx; tx += ddx; } else { iz += sz; s0 = tz; tz += ddz; }
  }
  return null;
}

interface TreeBody { id: string; x: number; z: number; y: number; r: number; h: number }
/** Standing trees and stumps of a chunk as arrow obstacles (the chunk is generated if it is not, like felling's). */
function treesOfChunk(world: World, cx: number, cz: number): TreeBody[] {
  const out: TreeBody[] = [];
  if (cx < 0 || cz < 0 || cx >= 64 || cz >= 64) return out;
  ensureChunk(world, cx, cz);
  for (const id of world.entityChunks.get(chunkKey(cx, cz)) ?? []) {
    const e = world.entities.get(id);
    if (!e || !e.kind.startsWith('styl_tree_') || world.entityRemovals.has(id)) continue;
    const life = treeLife(world, e);
    if (!life || !life.present || life.stage === 'gap') continue;
    const stage = life.stage as TreeStage;
    const r = LIFE_TRUNK[stage] * e.scale;
    const h = stage === 'stump' ? 0.5 : stage === 'snag' ? standingTreeHeight(life.species, 'snag', e.scale) : 0.5 * standingTreeHeight(life.species, stage, e.scale);
    out.push({ id, x: e.x, z: e.z, y: e.y, r, h });
  }
  return out;
}
/** First parameter on p0p1 inside a vertical trunk cylinder, or null. */
function trunkFirst(p0: V3, p1: V3, tr: TreeBody): number | null {
  const dx = p1.x - p0.x, dz = p1.z - p0.z, fx = p0.x - tr.x, fz = p0.z - tr.z, dy = p1.y - p0.y;
  const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - tr.r * tr.r;
  let s1: number, s2: number;
  if (a <= 1e-12) { if (c > 0) return null; s1 = 0; s2 = 1; } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const q = Math.sqrt(disc);
    s1 = (-b - q) / (2 * a); s2 = (-b + q) / (2 * a);
  }
  if (s2 < 0 || s1 > 1) return null;
  const e = Math.max(0, s1), x = Math.min(1, s2), top = tr.y + tr.h;
  const ye = p0.y + dy * e, yx = p0.y + dy * x;
  if (ye >= tr.y && ye <= top) return e;
  // Dropping into the cut top of a stump (or a trunk) from above.
  if (ye > top && yx <= top && dy < 0) { const s = (top - p0.y) / dy; return s >= e && s <= x ? s : null; }
  return null;
}
/** First parameter on p0p1 inside an axis-aligned box, or null. */
function boxFirst(p0: V3, p1: V3, b: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }): number | null {
  let lo = 0, hi = 1;
  for (const [o, d, mn, mx] of [[p0.x, p1.x - p0.x, b.x0, b.x1], [p0.y, p1.y - p0.y, b.y0, b.y1], [p0.z, p1.z - p0.z, b.z0, b.z1]] as const) {
    if (Math.abs(d) < 1e-12) { if (o < mn || o > mx) return null; continue; }
    let a = (mn - o) / d, c = (mx - o) / d;
    if (a > c) { const t = a; a = c; c = t; }
    if (a > lo) lo = a;
    if (c < hi) hi = c;
    if (lo > hi) return null;
  }
  return lo;
}

/** Where an animal is at a fraction (0..1) of its latest tick's path: position (m), unit heading, whether lying. */
export function animalPose(a: Animal, frac: number): { x: number; z: number; ux: number; uz: number } {
  const tr = a.trail && a.trail.length >= 4 ? a.trail : null;
  let x = a.x, z = a.z, hx = 0, hz = 0;
  if (tr) {
    const segs = tr.length / 2 - 1, f = clamp01(frac) * segs, i = Math.min(segs - 1, Math.floor(f)), k = f - i;
    const ax = tr[i * 2], az = tr[i * 2 + 1], bx = tr[i * 2 + 2], bz = tr[i * 2 + 3];
    x = ax + (bx - ax) * k; z = az + (bz - az) * k; hx = bx - ax; hz = bz - az;
  }
  const l = Math.sqrt(hx * hx + hz * hz);
  if (l >= 0.5) return { x: x / 10, z: z / 10, ux: hx / l, uz: hz / l };
  return { x: x / 10, z: z / 10, ux: DIRS32[a.d][0] / 1000, uz: DIRS32[a.d][1] / 1000 };
}
/** Is the animal lying (resting where it beds, a frozen hare, stunned)? */
export const lyingAnimal = (a: Animal) => a.a === STUN_ACT || a.a === 'rest' && a.u !== 0 || a.sp === 'rabbit' && a.a === 'freeze';
/** The body capsule and head sphere of an animal at a pose (m). */
export function hitShape(a: Animal, pose: { x: number; z: number; ux: number; uz: number }, ground: number) {
  const H = HIT_SHAPES[a.sp as Prey], drop = lyingAnimal(a) ? H.lie : 0;
  const cx = pose.x + pose.ux * H.bz, cz = pose.z + pose.uz * H.bz, y = ground + H.y - drop;
  return {
    a: { x: cx - pose.ux * H.hl, y, z: cz - pose.uz * H.hl }, b: { x: cx + pose.ux * H.hl, y, z: cz + pose.uz * H.hl }, r: H.r,
    head: { x: pose.x + pose.ux * H.hz, y: ground + H.hy - drop, z: pose.z + pose.uz * H.hz }, hr: H.hr,
  };
}

// ---------- state ----------

export interface HuntState {
  /** Shots accepted in world tick `tick` and the latest release moment `t` in it (releases in a tick never go back in time). */
  shot: { n: number; t: number; tick: number };
  shots: number; hits: number; kills: number; stuns: number;
}
export const createHunt = (tick = 0): HuntState => ({ shot: { n: 0, t: 0, tick }, shots: 0, hits: 0, kills: 0, stuns: 0 });
export interface HuntSnapshot { hits: number; kills: number; shot: { n: number; t: number; tick: number }; shots: number; stuns: number }
export const huntSnapshot = (h: HuntState): HuntSnapshot => ({ hits: h.hits, kills: h.kills, shot: { n: h.shot.n, t: h.shot.t, tick: h.shot.tick }, shots: h.shots, stuns: h.stuns });
export const huntFromSnapshot = (s: HuntSnapshot): HuntState => ({ shot: { ...s.shot }, shots: s.shots, hits: s.hits, kills: s.kills, stuns: s.stuns });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= lo && v <= hi;
export function validateHunt(raw: unknown, tick: number): HuntSnapshot {
  const bad = (what: string): never => { throw new Error(`snapshot wilderness hunting: invalid ${what}`); };
  if (!isObj(raw) || Object.keys(raw).join() !== 'hits,kills,shot,shots,stuns') bad('fields');
  const v = raw as Record<string, unknown>, sh = v.shot as Record<string, unknown>;
  if (!isObj(sh) || Object.keys(sh).join() !== 'n,t,tick' || !int(sh.n, 0, SHOTS_PER_TICK) || !int(sh.t, 0, 1000) || !int(sh.tick, 0, tick)) bad('shot');
  const shots = v.shots, hits = v.hits, kills = v.kills, stuns = v.stuns;
  if (!int(shots, 0, 1e9) || !int(hits, 0, shots as number) || !int(kills, 0, hits as number) || !int(stuns, 0, hits as number)) bad('counters');
  return { hits: hits as number, kills: kills as number, shot: { n: sh.n as number, t: sh.t as number, tick: sh.tick as number }, shots: shots as number, stuns: stuns as number };
}

// ---------- the shot ----------

export type HitKind = 'none' | 'terrain' | 'water' | 'tree' | 'trunk' | 'building' | 'animal';
export type HitResult = 'wounded' | 'killed' | 'stunned' | 'bruised' | 'glanced';
export interface ShotInput { arrow: ArrowKind; from: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number }; draw: number; t: number; at: At }
export interface ShotValue {
  hit: HitKind; ref?: string; part?: 'body' | 'head';
  /** Impact point (cm), flight time (ms), speed at impact (dm/s). */
  x: number; y: number; z: number; ms: number; speed: number;
  result?: HitResult; damage?: number; hp?: number;
  /** Where the arrow can be picked up, or that it broke. */
  pileId?: string; broke?: true;
  startled: string[]; durability: number; events: FellEvent[];
}

const fail = (code: string, reason: string): { ok: false; code: string; reasons: string[] } => ({ ok: false, code, reasons: [reason] });
const tickOf = (world: World) => world.life?.tick ?? 0;
const HARD = new Set<number>([MAT.STONE, MAT.GRAVEL, MAT.ORE, MAT.BEDROCK]);
const r2 = (v: number) => Math.round(v * 100) / 100;

function bowOf(w: WildState): { ok: true; tool: { durability: number } } | { ok: false; code: string; reasons: string[] } {
  const tool = w.equipped ? w.tools.find((t) => t.id === w.equipped) : undefined;
  if (!tool || tool.kind !== 'bow') return fail('no_bow', 'you need a bow in hand: make one at the workbench and equip it (bag)');
  if (tool.durability <= 0) return fail('broken_tool', 'your bow is broken: make a new one');
  return { ok: true, tool };
}

/** A pile of one unit of `item` at (x, z) m (joining a pile of it at exactly that spot), or null when the world holds too many piles. */
function addPile(world: World, w: WildState, item: WildItem, x: number, z: number): string | null {
  x = Math.max(-HALF + 1, Math.min(HALF - 1, r2(x))); z = Math.max(-HALF + 1, Math.min(HALF - 1, r2(z)));
  for (const p of w.piles.values()) if (p.item === item && p.x === x && p.z === z) { p.qty++; return p.id; }
  if (w.piles.size >= 512) return null;
  const id = `d:${w.nextId++}`;
  w.piles.set(id, { id, item, qty: 1, x, y: terrainCache(world.seed, world.params.generatorVersion).h(Math.floor(x), Math.floor(z)), z });
  return id;
}

const fleeFrom = (a: Animal, from: At, secs: number, dur: number) => { a.a = 'flee'; a.tx = from.x; a.tz = from.z; a.u = secs + dur; a.tg = 'player'; a.st = 0; };

/** One arrow: refused (and nothing changes) or flown to its first contact, with what that did. */
export function shoot(world: World, c: ShotInput): WildResult<ShotValue> {
  const w = world.wild!, wl = w.wildlife!, hunt = w.hunt!, tick = tickOf(world);
  const bow = bowOf(w);
  if (!bow.ok) return bow;
  if ((w.items[c.arrow] ?? 0) < 1) return fail('no_arrows', c.arrow === 'arrow' ? 'you have no arrows: make them at the workbench' : 'you have no blunt arrows: make them at the workbench');
  const held = w.build ? bagRefusal(world, c.arrow, 1, 'shoot it') : null;
  if (held) return { ok: false, ...held };
  if (c.draw < DRAW_MIN_MS) return fail('not_drawn', `draw the bow longer (at least ${DRAW_MIN_MS} ms)`);
  const f0 = launch(c.from, c.dir, c.draw);
  if (!f0) return fail('bad_aim', 'the aim is not a direction');
  const t = terrainCache(world.seed, world.params.generatorVersion);
  const px = c.at.x / 10, pz = c.at.z / 10;
  if (Math.abs(px) > HALF - 2 || Math.abs(pz) > HALF - 2) return fail('out_of_world', 'outside the world');
  if (Math.hypot(f0.x - px, f0.z - pz) > ORIGIN_REACH) return fail('out_of_reach', 'the arrow must leave the bow where you stand');
  const gx = Math.floor(px), gz = Math.floor(pz), ground = t.h(gx, gz);
  if (f0.y < ground + ORIGIN_LOW || f0.y > ground + ORIGIN_HIGH) return fail('out_of_reach', 'the arrow must leave the bow at your height');
  if (t.d(gx, gz) > 0 && f0.y < ground + t.d(gx, gz) + 0.3) return fail('in_water', 'you cannot shoot a bow from the water');
  if (f0.y < t.h(Math.floor(f0.x), Math.floor(f0.z))) return fail('blocked', 'something is in the way of the bow');
  if (wl.focus && Math.hypot(wl.focus.x / 10 - px, wl.focus.z / 10 - pz) > PRESENCE_SLACK) return fail('out_of_reach', 'you are not where the world last saw you');
  if (hunt.shot.tick === tick && hunt.shot.n >= SHOTS_PER_TICK) return fail('too_fast', `too fast: at most ${SHOTS_PER_TICK} arrows every 2 s`);
  if (hunt.shot.tick === tick && c.t < hunt.shot.t) return fail('too_fast', 'a release cannot come before the previous one');

  // ---- fly ----
  const secs = tick * 2, frac0 = c.t / 1000;
  const sites = buildingSolids(world);
  const trunks = [...(w.fell?.trunks.values() ?? [])];
  const treeChunks = new Map<number, TreeBody[]>();
  const treesNear = (x0: number, z0: number, x1: number, z1: number): TreeBody[] => {
    const out: TreeBody[] = [];
    const cx0 = Math.floor((Math.min(x0, x1) - 1.5 + HALF) / 32), cx1 = Math.floor((Math.max(x0, x1) + 1.5 + HALF) / 32);
    const cz0 = Math.floor((Math.min(z0, z1) - 1.5 + HALF) / 32), cz1 = Math.floor((Math.max(z0, z1) + 1.5 + HALF) / 32);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      const k = cz * 64 + cx;
      let l = treeChunks.get(k);
      if (!l) { l = treesOfChunk(world, cx, cz); treeChunks.set(k, l); }
      out.push(...l);
    }
    return out;
  };
  // Land animals that can be reached in the flight: within range of the release, with the box their path covers.
  const reach = SPEED_MAX * MAX_FLIGHT_STEPS * ARROW_DT + 10;
  const cands: Array<{ a: Animal; x0: number; x1: number; z0: number; z1: number; near: number }> = [];
  for (const a of [...wl.animals.values()].sort((p, q) => (p.id < q.id ? -1 : 1))) {
    if (a.sp === 'trout' || Math.abs(a.x / 10 - f0.x) > reach || Math.abs(a.z / 10 - f0.z) > reach) continue;
    const pts = a.trail && a.trail.length >= 4 ? a.trail : [a.x, a.z];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i] / 10); x1 = Math.max(x1, pts[i] / 10); z0 = Math.min(z0, pts[i + 1] / 10); z1 = Math.max(z1, pts[i + 1] / 10); }
    const m = 1.2 + NEAR_PASS;
    cands.push({ a, x0: x0 - m, x1: x1 + m, z0: z0 - m, z1: z1 + m, near: Infinity });
  }
  const g = (x: number, z: number) => t.h(Math.floor(x), Math.floor(z));
  const f: Flight = { ...f0 };
  type Hit = { kind: HitKind; s: number; ref?: string; part?: 'body' | 'head'; a?: Animal; pose?: { x: number; z: number }; col?: { cx: number; cz: number } };
  let hit = null as Hit | null;
  let steps = 0, p1: V3 = { x: f.x, y: f.y, z: f.z }, vAt = 0, lost = false;
  while (steps < MAX_FLIGHT_STEPS) {
    steps++;
    const p0: V3 = { x: f.x, y: f.y, z: f.z };
    stepFlight(f, c.arrow);
    p1 = { x: f.x, y: f.y, z: f.z };
    vAt = Math.sqrt(f.vx * f.vx + f.vy * f.vy + f.vz * f.vz);
    let best = null as Hit | null;
    const take = (h: Hit) => { if (!best || h.s < best.s) best = h; };
    const tr = terrainFirst(t, p0, p1);
    if (tr === 'out') { lost = true; p1 = p0; break; }
    if (tr) take({ kind: tr.water ? 'water' : 'terrain', s: tr.s, col: { cx: tr.cx, cz: tr.cz } });
    const bx0 = Math.min(p0.x, p1.x), bx1 = Math.max(p0.x, p1.x), bz0 = Math.min(p0.z, p1.z), bz1 = Math.max(p0.z, p1.z);
    for (const b of sites) {
      if (b.x1 < bx0 || b.x0 > bx1 || b.z1 < bz0 || b.z0 > bz1) continue;
      const s = boxFirst(p0, p1, b);
      if (s !== null) take({ kind: 'building', s, ref: b.id });
    }
    for (const tb of treesNear(p0.x, p0.z, p1.x, p1.z)) {
      if (Math.abs(tb.x - p0.x) > tb.r + 2 && Math.abs(tb.x - p1.x) > tb.r + 2 || Math.abs(tb.z - p0.z) > tb.r + 2 && Math.abs(tb.z - p1.z) > tb.r + 2) continue;
      const s = trunkFirst(p0, p1, tb);
      if (s !== null) take({ kind: 'tree', s, ref: tb.id });
    }
    for (const tk of trunks) {
      const [dx, dz] = DIRS16[tk.dir], L = tk.len / 10 * tk.left / tk.logs, r = tk.r / 100;
      const a = { x: tk.x, y: tk.y + r, z: tk.z }, b = { x: tk.x + dx * L, y: tk.y + r, z: tk.z + dz * L };
      if (Math.max(a.x, b.x) + r < bx0 || Math.min(a.x, b.x) - r > bx1 || Math.max(a.z, b.z) + r < bz0 || Math.min(a.z, b.z) - r > bz1) continue;
      const s = capsuleFirst(p0, p1, a, b, r);
      if (s !== null) take({ kind: 'trunk', s, ref: tk.id });
    }
    // Animals where they are at the middle of this step of the flight.
    const frac = Math.min(1, frac0 + (steps + 0.5) * ARROW_DT / 2);
    for (const e of cands) {
      if (e.x1 < bx0 || e.x0 > bx1 || e.z1 < bz0 || e.z0 > bz1) continue;
      const a = e.a, pose = animalPose(a, frac), sh = hitShape(a, pose, g(pose.x, pose.z));
      const cy = (sh.a.y + sh.head.y) / 2;
      const near = Math.sqrt(pointSeg((sh.a.x + sh.b.x) / 2, cy, (sh.a.z + sh.b.z) / 2, p0, p1));
      if (near < e.near) e.near = near;
      const sb = capsuleFirst(p0, p1, sh.a, sh.b, sh.r), shd = sphereFirst(p0, p1, sh.head, sh.hr);
      if (sb !== null && (shd === null || sb <= shd)) take({ kind: 'animal', s: sb, ref: a.id, part: 'body', a, pose });
      else if (shd !== null) take({ kind: 'animal', s: shd, ref: a.id, part: 'head', a, pose });
    }
    if (best) { hit = best; p1 = at(p0, p1, best.s); break; }
    if (f.y < -40) break;
  }
  const kind: HitKind = hit?.kind ?? 'none';
  const ms = Math.round((steps - 1 + (hit ? hit.s : lost ? 0 : 1)) * ARROW_DT * 1000);

  // ---- commit (every check is done: from here the shot is accepted) ----
  w.items[c.arrow] -= 1;
  if (w.items[c.arrow] === 0) delete w.items[c.arrow];
  bow.tool.durability -= 1;
  if (hunt.shot.tick !== tick) hunt.shot = { n: 0, t: 0, tick };
  hunt.shot.n++; hunt.shot.t = c.t; hunt.shots++;
  const events: FellEvent[] = [noteEvent(world, 'ARROW_SHOT', c.arrow)];
  const out: ShotValue = { hit: kind, x: Math.round(p1.x * 100), y: Math.round(p1.y * 100), z: Math.round(p1.z * 100), ms, speed: Math.round(vAt * 10), startled: [], durability: bow.tool.durability, events };
  if (hit?.ref) out.ref = hit.ref;
  const blunt = c.arrow === 'blunt_arrow';
  const shooter = { x: c.at.x, z: c.at.z };
  if (kind === 'animal' && hit?.a && hit.pose) {
    const a = hit.a, sp = a.sp as Prey;
    out.part = hit.part;
    hunt.hits++;
    events.push(noteEvent(world, 'ANIMAL_HIT', a.id));
    const k = vAt / SPEED_MAX, power = ARROW_DAMAGE * k * k * (hit.part === 'head' ? HEAD_FACTOR : 1);
    const ix = Math.round(hit.pose.x * 10), iz = Math.round(hit.pose.z * 10);
    if (blunt) {
      out.damage = Math.round(power);
      if (power >= STUN_AT[sp]) {
        out.result = 'stunned';
        hunt.stuns++;
        events.push(noteEvent(world, 'ANIMAL_STUNNED', a.id));
        const until = secs + STUN_SECS[sp];
        if (a.a !== STUN_ACT) { a.a = STUN_ACT; a.u = until; a.x = ix; a.z = iz; a.trail = undefined; a.tg = 'player'; a.st = 0; } else a.u = Math.max(a.u, until);
        a.tx = shooter.x; a.tz = shooter.z;
      } else {
        out.result = 'bruised';
        if (a.a !== STUN_ACT) fleeFrom(a, shooter, secs, STARTLE_FLEE);
      }
      out.hp = a.hp ?? WILD_HP[sp];
      const pile = addPile(world, w, 'blunt_arrow', hit.pose.x, hit.pose.z);
      if (pile) out.pileId = pile;
    } else {
      const dmg = Math.round(power);
      out.damage = dmg;
      if (dmg < 1) {
        out.result = 'glanced';
        out.hp = a.hp ?? WILD_HP[sp];
        if (a.a !== STUN_ACT) fleeFrom(a, shooter, secs, STARTLE_FLEE);
        const pile = addPile(world, w, 'arrow', hit.pose.x, hit.pose.z);
        if (pile) out.pileId = pile;
      } else {
        const hp = (a.hp ?? WILD_HP[sp]) - dmg;
        out.hp = Math.max(0, hp);
        if (hp <= 0) {
          out.result = 'killed';
          hunt.kills++;
          events.push(noteEvent(world, 'ANIMAL_KILLED', a.id));
          killByPlayer(wl, a, ix, iz, tick);
        } else {
          out.result = 'wounded';
          a.hp = hp;
          if (a.a !== STUN_ACT) fleeFrom(a, shooter, secs, WOUND_FLEE);
        }
      }
    }
  } else if (kind === 'terrain' || kind === 'tree' || kind === 'trunk' || kind === 'building') {
    let breaks = !blunt && kind === 'building';
    if (!blunt && kind === 'terrain' && hit?.col) {
      const { cx, cz } = hit.col, h = t.h(cx, cz);
      const slope = Math.max(Math.abs(h - t.h(cx + 1, cz)), Math.abs(h - t.h(cx - 1, cz)), Math.abs(h - t.h(cx, cz + 1)), Math.abs(h - t.h(cx, cz - 1)));
      breaks = HARD.has(baseTopMaterialFor(world.seed, world.params.generatorVersion, cx, cz, h, slope));
    }
    if (breaks) out.broke = true;
    else { const pile = addPile(world, w, c.arrow, p1.x, p1.z); if (pile) out.pileId = pile; }
  }
  // Animals the arrow went close by take flight.
  for (const e of cands) {
    if (e.near > NEAR_PASS || e.a === hit?.a || !wl.animals.has(e.a.id) || e.a.a === STUN_ACT) continue;
    fleeFrom(e.a, shooter, secs, STARTLE_FLEE);
    out.startled.push(e.a.id);
  }
  out.startled.sort();
  if (out.startled.length > 16) out.startled.length = 16;
  // The impact is heard around it (W7 noise).
  if (kind !== 'none') noteNoise(world, { x: Math.round(out.x / 10), z: Math.round(out.z / 10) });
  return { ok: true, value: out };
}

/** The player's arrow killed an animal: its record goes, its id is tombstoned for good, its carcass lies where it was hit. */
function killByPlayer(wl: WildlifeState, a: Animal, x: number, z: number, tick: number): void {
  wl.animals.delete(a.id);
  wl.dead.add(a.id);
  makeRoomForCarcass(wl);
  wl.carcasses.set(a.id, { id: a.id, sp: a.sp, x, z, t: tick, by: 'player', cut: 0, work: 0 });
}

// ---------- butchering ----------

export interface ButcherValue { cut: number; left: number; work: number; durability: number; item?: WildItem; pileId?: string; events: FellEvent[] }
/** Where each kind of output is put beside a carcass (m): one pile per item. */
const OUTPUT_SPOT: Record<'raw_meat' | 'hide' | 'bone', [number, number]> = { raw_meat: [0.9, 0], hide: [-0.9, 0.3], bone: [0, -0.9] };
export const carcassOutputs = (c: Pick<Carcass, 'sp'>): ReadonlyArray<'raw_meat' | 'hide' | 'bone'> => (c.sp === 'trout' ? [] : BUTCHER_ORDER[c.sp]);
/** The outputs still in a carcass, by item. */
export function carcassLeft(c: Carcass): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of carcassOutputs(c).slice(c.cut ?? 0)) out[k] = (out[k] ?? 0) + 1;
  return out;
}

/** One knife swing at a carcass of an animal the player shot. */
export function butcher(world: World, carcassId: string, at: At): WildResult<ButcherValue> {
  const w = world.wild!, wl = w.wildlife!, f = w.fell as FellState, tick = tickOf(world);
  const tool = w.equipped ? w.tools.find((x) => x.id === w.equipped) : undefined;
  if (!tool || tool.kind !== 'knife') return fail('no_knife', 'you need a knife in hand: make a stone knife at the workbench and equip it (bag)');
  if (tool.durability <= 0) return fail('broken_tool', 'your knife is broken: make a new one');
  const c = wl.carcasses.get(carcassId);
  if (!c) return fail('not_found', 'there is no carcass there');
  if (c.by !== 'player' || c.sp === 'trout') return fail('picked_over', 'wolves have picked this carcass over: there is nothing left to take');
  if (Math.hypot(c.x / 10 - at.x / 10, c.z / 10 - at.z / 10) > BUTCHER_REACH) return fail('out_of_reach', `out of reach: kneel by the carcass (${BUTCHER_REACH} m)`);
  if (f.swing.tick === tick && f.swing.n >= SWINGS_PER_TICK) return fail('too_fast', `too fast: at most ${SWINGS_PER_TICK} swings every 2 s`);
  const order = carcassOutputs(c), cut = c.cut ?? 0;
  const item = order[cut];
  const [ox, oz] = OUTPUT_SPOT[item];
  const fits = [...w.piles.values()].some((p) => p.item === item && p.x === r2(c.x / 10 + ox) && p.z === r2(c.z / 10 + oz));
  if (!fits && w.piles.size >= 512) return fail('too_many_piles', 'too many piles on the ground in this world');
  if (f.swing.tick !== tick) f.swing = { tick, n: 0 };
  f.swing.n++;
  tool.durability -= 1;
  c.work = (c.work ?? 0) + 1;
  const events: FellEvent[] = [];
  let pileId: string | undefined, made: WildItem | undefined;
  if (c.work >= BUTCHER_SWINGS[c.sp]) {
    c.work = 0;
    c.cut = cut + 1;
    made = item;
    pileId = addPile(world, w, item, c.x / 10 + ox, c.z / 10 + oz)!;
    events.push(noteEvent(world, 'CARCASS_CUT', pileId, 1));
    if (c.cut >= order.length) { wl.carcasses.delete(c.id); events.push(noteEvent(world, 'CARCASS_BUTCHERED', c.id)); }
  }
  return { ok: true, value: { cut: c.cut ?? 0, left: order.length - (c.cut ?? 0), work: c.work ?? 0, durability: tool.durability, ...(made ? { item: made, pileId } : {}), events } };
}

/** Carcasses within r m of (x, z), nearest first (UI). */
export function carcassesNear(world: World, x: number, z: number, r: number): Array<{ c: Carcass; d: number }> {
  const wl = world.wild?.wildlife;
  if (!wl) return [];
  const out: Array<{ c: Carcass; d: number }> = [];
  for (const c of wl.carcasses.values()) { const d = Math.hypot(c.x / 10 - x, c.z / 10 - z); if (d <= r) out.push({ c, d }); }
  return out.sort((a, b) => a.d - b.d || (a.c.id < b.c.id ? -1 : 1));
}
