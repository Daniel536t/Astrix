// Banners (M009): checkpoints the founder can return to. Pure TypeScript, no three.js.
//
// The home banner stands beside the founding spawn, where every world first
// puts the player; it cannot be moved. The field banner is one personal
// checkpoint planted where the founder stands; planting again moves it.
// "Return home" / "Return to banner" put the founder back on safe, dry
// ground next to a banner after a short channel.
//
// Banners are player-local presentation state, like the character position
// they return (sim/character.ts is not journaled either): they never enter
// the hashed world snapshot or the command journal.
import { World, residentSurfaceAt } from './world';
import { CharacterState, canStandAt, findStandingY } from './character';

export interface BannerPoint { x: number; y: number; z: number }

export interface BannerSet {
  /** The home banner's pole (x/z). Its height comes from the terrain. */
  home: { x: number; z: number };
  /** The planted field banner (feet position it was planted at), if any. */
  field: BannerPoint | null;
}

export type BannerTarget = 'home' | 'field';

/** The home banner pole sits this far east of the founding spawn, beside the arriving founder. */
export const HOME_BANNER_OFFSET = 1.6;
/** Seconds the founder must stand still before a return happens. */
export const RETURN_CHANNEL_SECONDS = 1.5;
/** Rings (m) searched around a banner for a landing spot; the first is just clear of the pole. */
export const LANDING_RINGS = [1.2, 1.8, 2.6, 3.6, 5] as const;
/** A landing next to a planted banner stays within this height of where it was planted. */
export const LANDING_MAX_RISE = 3;
/** Banners further than this from the origin are rejected (the playable 2048 m world). */
export const BANNER_LIMIT = 1000;

/** The home banner derived from the founding spawn cell (ExploreOptions.spawn). */
export function homeBannerFor(spawn: { x: number; z: number }): { x: number; z: number } {
  return { x: spawn.x + 0.5 + HOME_BANNER_OFFSET, z: spawn.z + 0.5 };
}

export type PlantResult = { ok: true; banner: BannerPoint } | { ok: false; reason: string };

/** Plant the field banner at the founder's feet. Only on dry, solid footing. */
export function plantBanner(s: CharacterState | null): PlantResult {
  if (!s) return { ok: false, reason: 'the founder has not arrived yet' };
  if (s.dead) return { ok: false, reason: 'cannot plant a banner while down' };
  if (s.mode !== 'ground' || !s.grounded) {
    return { ok: false, reason: s.mode === 'air' ? 'land first to plant the banner' : 'stand on dry ground to plant the banner' };
  }
  if (Math.abs(s.x) > BANNER_LIMIT || Math.abs(s.z) > BANNER_LIMIT) return { ok: false, reason: 'too far out to plant a banner' };
  const r = (v: number) => Math.round(v * 100) / 100;
  return { ok: true, banner: { x: r(s.x), y: r(s.y), z: r(s.z) } };
}

export type LandingResult =
  | { ok: true; x: number; y: number; z: number }
  /** 'unloaded': the banner's terrain is not resident yet (stream it, then retry). */
  | { ok: false; reason: 'unloaded' | 'blocked' };

/**
 * A safe standing spot next to a banner at (bx, bz): resident, dry, clear of
 * voxels, structures and trunks. `by` (the planted feet height) keeps the
 * landing at the banner's level; without it the column's top surface is used.
 * Deterministic: candidates are tried in a fixed ring order.
 */
export function findLanding(world: World, bx: number, bz: number, by: number | null = null): LandingResult {
  let unloaded = false;
  for (const radius of LANDING_RINGS) {
    for (let k = 0; k < 8; k++) {
      // Start toward +x and go around, so the founder appears beside the pole.
      const a = (k * Math.PI) / 4;
      const x = bx + Math.cos(a) * radius, z = bz + Math.sin(a) * radius;
      if (residentSurfaceAt(world, Math.floor(x), Math.floor(z)) === null) { unloaded = true; continue; }
      const y = findStandingY(world, x, z, by === null ? 110 : by + LANDING_MAX_RISE);
      if (y === null) continue;
      if (by !== null && Math.abs(y - by) > LANDING_MAX_RISE) continue;
      if (canStandAt(world, x, y, z)) return { ok: true, x, y, z };
    }
  }
  // Fall back to the banner's own column.
  if (residentSurfaceAt(world, Math.floor(bx), Math.floor(bz)) === null) unloaded = true;
  else {
    const y = findStandingY(world, bx, bz, by === null ? 110 : by + LANDING_MAX_RISE);
    if (y !== null && (by === null || Math.abs(y - by) <= LANDING_MAX_RISE) && canStandAt(world, bx, y, bz)) return { ok: true, x: bx, y, z: bz };
  }
  // Some candidate columns still streaming: wait for them before giving up.
  return { ok: false, reason: unloaded ? 'unloaded' : 'blocked' };
}

/** Banner ground height for drawing: planted y, or the terrain under the home pole. */
export function bannerGroundY(world: World, x: number, z: number): number | null {
  return findStandingY(world, x, z, 110);
}

export type ChannelEvent = { type: 'done'; target: BannerTarget } | { type: 'cancelled'; target: BannerTarget; why: string } | null;

/**
 * The return channel: stand still for RETURN_CHANNEL_SECONDS (wall-clock, so a
 * slow frame rate does not stretch it). Moving, jumping or taking damage cancels.
 */
export class ReturnChannel {
  target: BannerTarget | null = null;
  private endsAt = 0;
  private startedAt = 0;

  constructor(readonly seconds = RETURN_CHANNEL_SECONDS) {}

  start(target: BannerTarget, nowMs: number): void {
    this.target = target;
    this.startedAt = nowMs;
    this.endsAt = nowMs + this.seconds * 1000;
  }

  get active(): boolean { return this.target !== null; }

  /** 0..1 progress of the channel. */
  progress(nowMs: number): number {
    if (!this.target) return 0;
    return Math.max(0, Math.min(1, (nowMs - this.startedAt) / (this.endsAt - this.startedAt)));
  }

  remaining(nowMs: number): number {
    return this.target ? Math.max(0, (this.endsAt - nowMs) / 1000) : 0;
  }

  cancel(why: string): ChannelEvent {
    if (!this.target) return null;
    const target = this.target;
    this.target = null;
    return { type: 'cancelled', target, why };
  }

  /** Advance; `interrupted` is the reason the founder broke the channel this frame, if any. */
  update(nowMs: number, interrupted: string | null): ChannelEvent {
    if (!this.target) return null;
    if (interrupted) return this.cancel(interrupted);
    if (nowMs < this.endsAt) return null;
    const target = this.target;
    this.target = null;
    return { type: 'done', target };
  }
}
