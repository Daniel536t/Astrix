// Real-time settlement clock.
//
// The simulation still only advances through accepted, journaled `tick`
// commands; this class just decides *when* the local player's client issues
// them: one tick per TICK_SECONDS of active play. Rules:
//   - active play only: paused, hidden/suspended tab, or a non-leader tab
//     accumulates nothing (no offline catch-up);
//   - at most one tick per call, and the accumulator is capped, so resuming a
//     suspended tab never bursts many ticks;
//   - deterministic: the economic result depends only on the journaled ticks,
//     never on frame timing.

export const TICK_SECONDS = 2;
/** Never carry more than one pending tick across a long frame or resume. */
const MAX_ACCUMULATED = TICK_SECONDS * 1.5;

export class SimClock {
  private accumulated = 0;
  ticksIssued = 0;

  /** Returns true when a tick is due. `dt` is real elapsed seconds since the last call. */
  advance(dt: number, active: boolean): boolean {
    if (!active || !Number.isFinite(dt) || dt <= 0) return false;
    this.accumulated = Math.min(MAX_ACCUMULATED, this.accumulated + Math.min(dt, TICK_SECONDS));
    if (this.accumulated < TICK_SECONDS) return false;
    this.accumulated -= TICK_SECONDS;
    this.ticksIssued++;
    return true;
  }

  /** Forget partial progress (after resume or a manual time skip). */
  reset(): void { this.accumulated = 0; }

  /** Seconds until the next tick while active. */
  get secondsToNext(): number { return Math.max(0, TICK_SECONDS - this.accumulated); }
}

/**
 * Throttled persistence: real-time ticks mark the session dirty; it is saved at
 * most every `intervalMs`, and immediately when the tab hides or closes.
 */
export class SaveScheduler {
  private dirtySince: number | null = null;
  private lastSave = -Infinity;
  constructor(private readonly save: () => void, private readonly intervalMs = 10_000) {}
  markDirty(now: number): void { if (this.dirtySince === null) this.dirtySince = now; }
  /** Call every frame. */
  poll(now: number): void {
    if (this.dirtySince !== null && now - this.lastSave >= this.intervalMs) this.flush(now);
  }
  flush(now = Date.now()): void {
    if (this.dirtySince === null) return;
    this.dirtySince = null;
    this.lastSave = now;
    this.save();
  }
  /** A player command saved immediately; nothing is pending. */
  saved(now: number): void { this.dirtySince = null; this.lastSave = now; }
  get pending(): boolean { return this.dirtySince !== null; }
}

export interface LockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * One writing tab per world. Two tabs on the same save would each tick and
 * overwrite the other's journal; the second tab therefore stays read-only for
 * simulation time until the first tab's heartbeat lapses.
 */
export class TabLease {
  readonly id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  private leader = false;
  constructor(private readonly storage: LockStorage | null, private readonly key: string,
    private readonly ttlMs = 6000) {}

  /** Refresh the lease; returns whether this tab may advance and save the world. */
  heartbeat(now = Date.now()): boolean {
    if (!this.storage) { this.leader = true; return true; }
    try {
      const raw = this.storage.getItem(this.key);
      const held = raw ? JSON.parse(raw) as { id: string; at: number } : null;
      if (!held || held.id === this.id || now - held.at > this.ttlMs) {
        this.storage.setItem(this.key, JSON.stringify({ id: this.id, at: now }));
        this.leader = JSON.parse(this.storage.getItem(this.key) ?? '{}').id === this.id;
      } else {
        this.leader = false;
      }
    } catch {
      this.leader = true;
    }
    return this.leader;
  }

  get isLeader(): boolean { return this.leader; }

  release(): void {
    try {
      const raw = this.storage?.getItem(this.key);
      if (raw && JSON.parse(raw).id === this.id) this.storage?.removeItem(this.key);
    } catch { /* best effort */ }
  }
}
