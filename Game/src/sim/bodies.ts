// STAB-002 S2 · bodies and presence (pure TS, no three.js).
//
// One table of body sizes shared by the hashed homestead sim (how far an
// animal keeps from the player) and the player-local physics (the capsules
// the founder collides with), plus the capsule maths and a tracker that
// derives those capsules from simulation state.
//
// Tiers, as before:
//   - homestead animals and villagers are hashed sim state (integer dm, one
//     move per 2 s tick). The sim learns of the player only through the
//     journaled, quantised `presence` on a `tick` command (rules v7).
//   - the founder's contact with bodies is player-local physics in
//     `stepCharacter`, like its collision with voxels, fences and trees. The
//     capsules come from sim state (the last two ticks' positions, blended
//     by the time since the tick arrived), never from rendered meshes.
//   - wildlife is app-tier sim (`sim/fauna.ts`); its capsules are the
//     creature records themselves.
import type { Species } from './homestead';

/** A body the founder collides with: a capsule of radius `r` along `heading`, half-length `hl` (metres). */
export interface DynamicBody {
  id: string;
  /** Capsule centre (the model's offset along the heading already applied). */
  x: number; z: number;
  /** Feet height and height of the body (metres). */
  y: number; h: number;
  r: number; hl: number;
  /** Radians; +z forward (atan2(dx, dz)), as the renderer uses. */
  heading: number;
}

export interface BodySize {
  /** Radius (m). */
  r: number;
  /** Half-length of the capsule's segment (m), along the heading. */
  hl: number;
  /** Centre offset along the heading from the animal's position (m). */
  off: number;
  /** Height (m). */
  h: number;
}

/**
 * Body sizes, measured from the block models in `render/animal-models.ts`
 * (body width; nose to tail including the head, without horns and thin
 * tails). Young animals scale by the renderer's young scale.
 */
export const FARM_BODIES: Record<Species, BodySize> = {
  cattle: { r: 0.46, hl: 0.70, off: 0.30, h: 1.6 },
  horse: { r: 0.32, hl: 0.95, off: 0.35, h: 2.2 },
  sheep: { r: 0.42, hl: 0.40, off: 0.06, h: 1.2 },
  goat: { r: 0.26, hl: 0.58, off: 0.25, h: 1.4 },
  pig: { r: 0.35, hl: 0.52, off: 0.22, h: 1.0 },
  chicken: { r: 0.20, hl: 0.17, off: 0.02, h: 0.8 },
};
export type WildId = 'deer' | 'rabbit' | 'fox' | 'wolf';
export const WILD_BODIES: Record<WildId, BodySize> = {
  deer: { r: 0.22, hl: 0.58, off: 0.14, h: 1.9 },
  rabbit: { r: 0.11, hl: 0.24, off: 0.03, h: 0.5 },
  fox: { r: 0.12, hl: 0.50, off: 0.03, h: 0.7 },
  wolf: { r: 0.17, hl: 0.75, off: 0.06, h: 1.2 },
};
/** Villagers are people: the founder's own size. */
export const PERSON_BODY: BodySize = { r: 0.3, hl: 0, off: 0, h: 1.7 };
/** The renderer's young scale (`render/homestead.ts`). */
export const youngScale = (species: Species) => (species === 'chicken' ? 0.5 : 0.62);
/** The founder's radius (same as `CHARACTER_RADIUS`; repeated here so the sim does not import the character module). */
export const PLAYER_R = 0.3;

/** Farthest point of a body from the animal's position (m), any heading. */
export const bodyReach = (b: BodySize, scale = 1) => (b.r + b.hl + Math.abs(b.off)) * scale;

/**
 * Rules v7 sim: how close (dm) an animal's position may come to the
 * player's presence point. It covers the whole capsule for any heading
 * (the sim does not keep a heading), plus the player's radius.
 */
export function keepDm(species: Species, young: boolean): number {
  return Math.ceil((PLAYER_R + bodyReach(FARM_BODIES[species], young ? youngScale(species) : 1)) * 10);
}
/** Rules v7: the distance (dm) of an animal walking past the player alongside: its half-width plus the player's radius. */
export function sideDm(species: Species, young: boolean): number {
  return Math.ceil((PLAYER_R + FARM_BODIES[species].r * (young ? youngScale(species) : 1)) * 10);
}
/**
 * Rules v7: how close (dm) an animal may pass a player standing still: its
 * side distance plus 2 dm. Its body turns toward its new direction at a
 * limited rate (`turnRate`), so while it walks past it may still be partly
 * turned toward the player; for the long bodies (cattle, horses: more than
 * 0.9 m from the centre to the nose) half that length is added. Never more than `keep`.
 */
export function passDm(species: Species, young: boolean): number {
  const b = FARM_BODIES[species], k = young ? youngScale(species) : 1, front = (b.hl + Math.abs(b.off)) * k;
  return Math.min(keepDm(species, young), sideDm(species, young) + 2 + (front > 0.9 ? Math.ceil(front * 10 / 2) : 0));
}
/** Villagers keep the two radii apart (dm). */
export const VILLAGER_KEEP_DM = Math.ceil((PLAYER_R + PERSON_BODY.r) * 10);
/**
 * Rules v7: an animal within this many dm of the player steps aside, and
 * routes only through cells whose centre is at least this far. A route runs
 * centre to centre, and every point of such a segment lies within 7 dm (half
 * a diagonal) of one of its ends, so a route through those cells never comes
 * closer than `keepDm`.
 */
export const ringDm = (species: Species, young: boolean) => keepDm(species, young) + 7;
/** Rules v7: no new walk or graze target this close (dm) to the player (2 m, or the ring when larger). */
export const targetClearDm = (species: Species, young: boolean) => Math.max(20, ringDm(species, young));

// ---------- presence ----------

/** The player's quantised presence on a journaled `tick` (rules v7): position in dm, sign of motion per axis. */
export interface Presence { x: number; z: number; mx: -1 | 0 | 1; mz: -1 | 0 | 1 }
/** Presence keys in canonical order. */
export const PRESENCE_KEYS = ['x', 'z', 'mx', 'mz'] as const;
/** Bound on presence coordinates (dm), the same as homestead positions (±2 km). */
export const PRESENCE_POS = 20_000;

/** Speed (m/s) above which a motion component counts as moving. */
const MOVING = 0.5;
export function quantisePresence(x: number, z: number, vx: number, vz: number): Presence {
  const sign = (v: number): -1 | 0 | 1 => (v > MOVING ? 1 : v < -MOVING ? -1 : 0);
  return { x: Math.round(x * 10), z: Math.round(z * 10), mx: sign(vx), mz: sign(vz) };
}

/** 1 m cells (world metres) the player's disc covers at a presence point (1 to 4 cells). */
export function presenceCells(p: Pick<Presence, 'x' | 'z'>): Array<[number, number]> {
  const r = PLAYER_R * 10;
  const x0 = Math.floor((p.x - r) / 10), x1 = Math.floor((p.x + r - 1e-6) / 10);
  const z0 = Math.floor((p.z - r) / 10), z1 = Math.floor((p.z + r - 1e-6) / 10);
  const out: Array<[number, number]> = [];
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) out.push([x, z]);
  return out;
}

/**
 * How far (0..1) a mover may go along the segment a -> b (dm) without coming
 * closer than `keep` to p while getting closer: 1 when the whole segment is
 * fine. A mover already inside `keep` may always move away. Pure arithmetic,
 * deterministic.
 */
export function clipApproach(ax: number, az: number, bx: number, bz: number, px: number, pz: number, keep: number): number {
  const dx = bx - ax, dz = bz - az;
  const ux = ax - px, uz = az - pz;
  const a = dx * dx + dz * dz;
  if (a === 0) return 1;
  const b = 2 * (ux * dx + uz * dz), c = ux * ux + uz * uz - keep * keep;
  // Moving away (or sideways) from p at the start: the distance only grows along a straight segment.
  if (b >= 0) return 1;
  if (c < 0) return 0; // inside and approaching
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return 1; // the line never comes within keep
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 1 ? 1 : Math.max(0, t);
}

// ---------- capsule maths (player-local physics) ----------

/** Distance (m) from a point to a body's segment. */
export function segmentDistance(b: DynamicBody, x: number, z: number): number {
  if (b.hl <= 0) return Math.hypot(x - b.x, z - b.z);
  const ux = Math.sin(b.heading), uz = Math.cos(b.heading);
  let t = (x - b.x) * ux + (z - b.z) * uz;
  if (t > b.hl) t = b.hl; else if (t < -b.hl) t = -b.hl;
  return Math.hypot(x - (b.x + ux * t), z - (b.z + uz * t));
}
/** Overlap depth (m) of a disc of radius `r` at (x, z) with a body; <= 0 when apart. */
export function penetration(b: DynamicBody, x: number, z: number, r: number): number {
  return b.r + r - segmentDistance(b, x, z);
}
/** Unit push-out direction from a body for a point at (x, z) (away from the closest segment point). */
export function pushNormal(b: DynamicBody, x: number, z: number): { nx: number; nz: number } {
  let cx = b.x, cz = b.z;
  if (b.hl > 0) {
    const ux = Math.sin(b.heading), uz = Math.cos(b.heading);
    let t = (x - b.x) * ux + (z - b.z) * uz;
    if (t > b.hl) t = b.hl; else if (t < -b.hl) t = -b.hl;
    cx = b.x + ux * t; cz = b.z + uz * t;
  }
  const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
  if (d > 1e-6) return { nx: dx / d, nz: dz / d };
  // Exactly on the segment: push sideways off the body's axis (fixed, deterministic choice).
  return { nx: Math.cos(b.heading), nz: -Math.sin(b.heading) };
}

// ---------- capsules from sim state ----------

/** The renderer's resting heading for an animal it has not seen move (same hash as `render/homestead.ts`). */
export function restHeading(xDm: number, zDm: number): number {
  let h = Math.imul(xDm | 0, 374761393) ^ Math.imul(zDm | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * Math.PI * 2;
}

/**
 * Rules v7: how fast (m/s) the ends of a turning farm animal may sweep
 * sideways. Below the founder's push-out speed, so an animal turning beside
 * the founder nudges them instead of swinging its head through them. The
 * renderer turns v7 animals at the same rate.
 */
export const TURN_TIP_SPEED = 1.2;
/** Turn rate (rad/s) of a farm animal: its longest end sweeps at TURN_TIP_SPEED. */
export function turnRate(species: Species, scale = 1): number {
  return TURN_TIP_SPEED / Math.max(0.3, bodyReach(FARM_BODIES[species], scale));
}
/** Heading after turning from `from` toward `to` for `seconds` at `rate` rad/s (shortest way; never past `to`). */
export function turnHeading(from: number, to: number, seconds: number, rate: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const step = rate * Math.max(0, seconds);
  return Math.abs(d) <= step ? to : from + Math.sign(d) * step;
}

/** ph: heading shown when the tick arrived; heading: the direction of the last move (the turn's target). */
interface Track { px: number; pz: number; x: number; z: number; ph: number; heading: number; step: number; rate: number }
/** Same as the renderer's snap distance: a jump this long (load, teleport) is not blended. */
const SNAP = 6;

export interface HomesteadLike {
  animals: ReadonlyArray<{ id: string; species: Species; x: number; z: number; born: number }>;
  villagers: ReadonlyArray<{ id: string; x: number; z: number; task?: { kind: string } | null }>;
}
export interface SpeciesAge { adultAge: number }

/**
 * Capsules of homestead animals and villagers, from the hashed sim state:
 * each tick's position (dm) and the previous tick's, blended by the time
 * since the tick was observed, the same blend the renderer draws. Heading is
 * the direction of the last move (the renderer's target heading).
 */
export class HomesteadBodies {
  private readonly tracks = new Map<string, Track>();
  private tick = -1;
  private at = 0;
  constructor(private readonly tickSeconds: number) {}

  /** Record a new tick's positions (call every frame; only a new tick changes anything). */
  observe(h: HomesteadLike, tick: number, nowMs: number): void {
    if (tick === this.tick) return;
    const since = (nowMs - this.at) / 1000;
    // Where each body is shown now: the new blend starts there (as the renderer's does), so a tick that comes
    // early (the clock catching up after a slow frame) never makes the capsule jump.
    const shownAlpha = Math.min(1, Math.max(0, since / this.tickSeconds));
    this.tick = tick; this.at = nowMs;
    const alive = new Set<string>();
    const see = (id: string, xDm: number, zDm: number, rate: number) => {
      alive.add(id);
      const x = xDm / 10, z = zDm / 10, t = this.tracks.get(id);
      if (!t) { const r = restHeading(xDm, zDm); this.tracks.set(id, { px: x, pz: z, x, z, ph: r, heading: r, step: 0, rate }); return; }
      const d = Math.hypot(x - t.x, z - t.z);
      t.ph = turnHeading(t.ph, t.heading, since, t.rate);
      t.rate = rate;
      if (d > 0.04) t.heading = Math.atan2(x - t.x, z - t.z);
      t.step = d;
      const sx = t.px + (t.x - t.px) * shownAlpha, sz = t.pz + (t.z - t.pz) * shownAlpha;
      t.px = sx; t.pz = sz; t.x = x; t.z = z;
      if (Math.hypot(x - sx, z - sz) > SNAP) { t.px = x; t.pz = z; }
    };
    for (const a of h.animals) see(a.id, a.x, a.z, turnRate(a.species));
    for (const v of h.villagers) see(v.id, v.x, v.z, Infinity);
    for (const id of [...this.tracks.keys()]) if (!alive.has(id)) this.tracks.delete(id);
  }

  /**
   * Append the bodies within `range` metres of (x, z) to `out`. `ground`
   * gives the feet height at a point; `adultAge` the species' adult age.
   */
  collect(h: HomesteadLike, tick: number, nowMs: number, x: number, z: number, range: number,
    ground: (x: number, z: number) => number, adultAge: (s: Species) => number, out: DynamicBody[]): void {
    const alpha = Math.min(1, Math.max(0, (nowMs - this.at) / (this.tickSeconds * 1000)));
    for (const a of h.animals) {
      const t = this.tracks.get(a.id);
      if (!t) continue;
      const bx = t.px + (t.x - t.px) * alpha, bz = t.pz + (t.z - t.pz) * alpha;
      if (Math.abs(bx - x) > range || Math.abs(bz - z) > range) continue;
      const size = FARM_BODIES[a.species], k = tick - a.born < adultAge(a.species) ? youngScale(a.species) : 1;
      const heading = turnHeading(t.ph, t.heading, (nowMs - this.at) / 1000, t.rate);
      const ux = Math.sin(heading), uz = Math.cos(heading);
      out.push({ id: a.id, x: bx + ux * size.off * k, z: bz + uz * size.off * k, y: ground(bx, bz), h: size.h * k, r: size.r * k, hl: size.hl * k, heading });
    }
    for (const v of h.villagers) {
      const t = this.tracks.get(v.id);
      if (!t) continue;
      // Indoors at night (the renderer hides a resting villager that is not walking).
      if (v.task?.kind === 'rest' && t.step < 0.05) continue;
      const bx = t.px + (t.x - t.px) * alpha, bz = t.pz + (t.z - t.pz) * alpha;
      if (Math.abs(bx - x) > range || Math.abs(bz - z) > range) continue;
      out.push({ id: v.id, x: bx, z: bz, y: ground(bx, bz), h: PERSON_BODY.h, r: PERSON_BODY.r, hl: 0, heading: t.heading });
    }
  }
}

/** A wildlife creature's capsule from its sim record (trout are not bodies: they are in the water). */
export function creatureBody(c: { id: string; species: string; x: number; y: number; z: number; heading: number }): DynamicBody | null {
  const size = WILD_BODIES[c.species as WildId];
  if (!size) return null;
  const ux = Math.sin(c.heading), uz = Math.cos(c.heading);
  return { id: c.id, x: c.x + ux * size.off, z: c.z + uz * size.off, y: c.y, h: size.h, r: size.r, hl: size.hl, heading: c.heading };
}
