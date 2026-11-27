// M015 optional frame-rate cap (presentation only). Settings offers
// Unlimited (the default), 60 and 30 ("battery saver"); `?fps=0|30|60`
// overrides it for one load. The limiter keeps requestAnimationFrame running
// at the display rate and skips whole frames (no simulation step, no render)
// until 1/cap seconds have passed, so a 60 Hz screen capped at 30 draws every
// second frame and a 120 Hz screen capped at 60 every second one. Settlement
// time runs on the wall clock and the animation step on the elapsed time, so
// a cap changes smoothness and power, never the game.

export type FrameCap = 0 | 30 | 60;
export const FRAME_CAPS: readonly FrameCap[] = [0, 60, 30];
export const FRAME_CAP_STORAGE_KEY = 'astrix:fpscap:v1';

export function parseFrameCap(text: string | null | undefined): FrameCap | null {
  const t = (text ?? '').trim().toLowerCase();
  if (t === '0' || t === 'unlimited' || t === 'off') return 0;
  if (t === '30') return 30;
  if (t === '60') return 60;
  return null;
}

/** URL parameter, then the saved choice, then unlimited. */
export function resolveFrameCap(url: string | null, saved: string | null): { cap: FrameCap; source: 'url' | 'saved' | 'default' } {
  const u = parseFrameCap(url);
  if (u !== null) return { cap: u, source: 'url' };
  const s = parseFrameCap(saved);
  if (s !== null) return { cap: s, source: 'saved' };
  return { cap: 0, source: 'default' };
}

export const frameCapLabel = (cap: number): string => cap === 0 ? 'unlimited' : `${cap} fps`;

/**
 * Decides per animation frame whether to draw. Pure: driven by the rAF
 * timestamps (ms), so tests can feed synthetic display rates.
 */
export class FrameLimiter {
  private last = -Infinity;
  constructor(public cap: number = 0) {}

  /** Change the cap (takes effect at the next frame). */
  set(cap: number): void { this.cap = cap; this.last = -Infinity; }

  shouldDraw(now: number): boolean {
    if (!(this.cap > 0)) return true;
    const interval = 1000 / this.cap;
    const since = now - this.last;
    // A 2 ms tolerance absorbs rAF jitter: on a 60 Hz screen a 60 cap draws every frame.
    if (since < interval - 2) return false;
    // Keep a steady cadence; after a stall (tab hidden, a long frame) start again from now.
    this.last = since > interval * 2 ? now : this.last + interval;
    return true;
  }
}
