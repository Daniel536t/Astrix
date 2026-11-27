// STAB-002 S1: time spent per behaviour state, for evidence (presentation side,
// never hashed). Counts the sim's own `act` of every farm animal once per
// simulation tick it observes, and whether the animal's position changed in
// that tick. Reads homestead state only; never writes it.
import { DAY_TICKS, NIGHT_END, NIGHT_START } from '../sim/homestead';
import type { HomesteadState } from '../sim/homestead';

export interface StateTicks { wander: number; graze: number; drink: number; rest: number; none: number; moved: number; ticks: number; dayTicks: number; dayMoved: number }
const empty = (): StateTicks => ({ wander: 0, graze: 0, drink: 0, rest: 0, none: 0, moved: 0, ticks: 0, dayTicks: 0, dayMoved: 0 });

export class HerdTime {
  private tick = -1;
  private readonly last = new Map<string, { x: number; z: number }>();
  private readonly per = new Map<string, StateTicks>();
  private readonly total = empty();

  /** Call every frame; counts once per new tick (a jump of several ticks counts as one sample). */
  observe(h: HomesteadState | undefined, tick: number): void {
    if (!h || tick === this.tick) return;
    const first = this.tick < 0;
    this.tick = tick;
    const t = (tick - 1) % DAY_TICKS;
    const day = !(t >= NIGHT_START && t < NIGHT_END);
    for (const a of h.animals) {
      const prev = this.last.get(a.id);
      this.last.set(a.id, { x: a.x, z: a.z });
      if (first || !prev) continue;
      const moved = prev.x !== a.x || prev.z !== a.z;
      let r = this.per.get(a.id);
      if (!r) { r = empty(); this.per.set(a.id, r); }
      for (const c of [r, this.total]) {
        c[a.act ?? 'none']++; c.ticks++;
        if (moved) c.moved++;
        if (day) { c.dayTicks++; if (moved) c.dayMoved++; }
      }
    }
  }

  metrics(): { total: StateTicks; animals: Record<string, StateTicks> } {
    return { total: { ...this.total }, animals: Object.fromEntries([...this.per].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, { ...v }])) };
  }
}
