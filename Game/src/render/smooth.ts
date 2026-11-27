// Render-only smoothing between simulation steps. Nothing here reads or
// writes simulation state: it blends two already-computed poses by an alpha
// derived from real time, so the picture is independent of frame rate.

export interface Pose { x: number; y: number; z: number; heading: number }

/** Beyond this distance between consecutive steps the creature teleported (spawn, reset): show it, do not slide it. */
export const SNAP_DISTANCE = 6;

/** Signed shortest rotation from `from` to `to`, in (-PI, PI]. */
export function shortestArc(from: number, to: number): number {
  const TAU = Math.PI * 2;
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU; else if (d <= -Math.PI) d += TAU;
  return d;
}

/** Fraction of the current tick that has elapsed, from the clock's seconds-to-next. In [0, 1]. */
export function tickAlpha(secondsToNext: number, tickSeconds: number): number {
  if (!(tickSeconds > 0) || !Number.isFinite(secondsToNext)) return 1;
  return Math.min(1, Math.max(0, 1 - secondsToNext / tickSeconds));
}

/** Fraction of the current fixed step that has elapsed, from the leftover accumulator. */
export function stepAlpha(accumulated: number, step: number): number {
  if (!(step > 0)) return 1;
  return Math.min(1, Math.max(0, accumulated / step));
}

/** Blend prev to cur into `out` (no allocation). Snaps to `cur` when the jump exceeds `snap`. */
export function blendPose(prev: Pose, cur: Pose, alpha: number, out: Pose, snap = SNAP_DISTANCE): Pose {
  const a = Math.min(1, Math.max(0, alpha));
  if (Math.hypot(cur.x - prev.x, cur.z - prev.z) > snap) {
    out.x = cur.x; out.y = cur.y; out.z = cur.z; out.heading = cur.heading;
    return out;
  }
  out.x = prev.x + (cur.x - prev.x) * a;
  out.y = prev.y + (cur.y - prev.y) * a;
  out.z = prev.z + (cur.z - prev.z) * a;
  out.heading = prev.heading + shortestArc(prev.heading, cur.heading) * a;
  return out;
}
