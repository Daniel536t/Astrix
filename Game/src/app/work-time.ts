// STAB-002 S3: where villagers' time goes, and how long upkeep and routine
// work waits, for evidence (presentation side, never saved or hashed). Reads
// homestead state once per simulation tick it observes; never writes it.
//
// Time per villager and tick, from the task it was on at the start of the
// tick and whether it moved (the STAB-001 BUG-C grouping):
//  - sleeping: the rest task (walking to bed included);
//  - eating: the eat task (walking to the store included);
//  - idle: the idle stroll, or no task;
//  - travel: a walk leg of any other task, moving;
//  - waiting: a walk leg without moving (a gate, a queue, a blocked route);
//  - work: a work leg of any other task.
// Waits: each piece of due work (`dueWork`) from when it became due to when a
// villager's task first takes it, in daytime ticks (nobody works at night).
import type { World } from '../sim/world';
import { DueJob, daylightAge, dueWork, isHerdHomestead, touches } from '../sim/homestead';
import type { HomesteadState, Task } from '../sim/homestead';

export const WORK_CATS = ['travel', 'waiting', 'work', 'idle', 'eating', 'sleeping'] as const;
export type WorkCat = typeof WORK_CATS[number];
export type WorkTicks = Record<WorkCat, number> & { ticks: number; starving: number };
const empty = (): WorkTicks => ({ travel: 0, waiting: 0, work: 0, idle: 0, eating: 0, sleeping: 0, ticks: 0, starving: 0 });

/** Which task takes a piece of due work. */
export function claimsDue(t: Task, j: DueJob): boolean {
  switch (j.kind) {
    case 'water': return t.kind === 'water' && touches(t, j.target);
    case 'harvest': return t.kind === 'harvest' && touches(t, j.target);
    case 'sow': return (t.kind === 'sow' && touches(t, j.target)) || t.kind === 'thresh';
    case 'till': return (t.kind === 'till' || t.kind === 'sow') && touches(t, j.target);
    case 'stray': return touches(t, `stray:${j.target}`);
    case 'trough': return touches(t, `water:${j.target}`);
    case 'feed': return touches(t, `feed:${j.target}`);
    case 'eggs': return touches(t, 'eggs:coop');
    case 'product': return touches(t, j.target);
    case 'restock': return touches(t, 'overflow:store');
  }
}

export interface DueWait { key: string; kind: string; since: number; claimed: number; wait: number }

export class WorkTime {
  private tick = -1;
  private readonly last = new Map<string, { x: number; z: number; kind: string | null; op: 'walk' | 'work' | null }>();
  private readonly per = new Map<string, WorkTicks>();
  private readonly total = empty();
  private readonly since = new Map<string, number>();
  private readonly taken = new Set<string>();
  readonly waits: DueWait[] = [];

  /** Call once per tick (or every frame: a repeated tick is ignored). */
  observe(world: World, tick: number): void {
    const h = world.homestead;
    if (!h || tick === this.tick) return;
    const first = this.tick < 0;
    this.tick = tick;
    this.countTime(h, first);
    this.countWaits(world, h, tick);
  }

  private countTime(h: HomesteadState, first: boolean): void {
    for (const v of h.villagers) {
      const prev = this.last.get(v.id);
      const leg = v.task ? v.task.legs[v.task.leg] : undefined;
      this.last.set(v.id, { x: v.x, z: v.z, kind: v.task?.kind ?? null, op: leg?.op ?? null });
      if (first || !prev) continue;
      const kind = prev.kind ?? v.task?.kind ?? 'none';
      const op = prev.op ?? (v.task ? v.task.legs[0].op : null);
      const moved = prev.x !== v.x || prev.z !== v.z;
      const cat: WorkCat = kind === 'rest' ? 'sleeping' : kind === 'eat' ? 'eating' : kind === 'idle' || kind === 'none' ? 'idle'
        : op === 'walk' ? (moved ? 'travel' : 'waiting') : 'work';
      let r = this.per.get(v.id);
      if (!r) { r = empty(); this.per.set(v.id, r); }
      for (const c of [r, this.total]) { c[cat]++; c.ticks++; if (v.hunger >= 100) c.starving++; }
    }
  }

  private countWaits(world: World, h: HomesteadState, tick: number): void {
    const jobs = dueWork(world, h);
    const now = new Set(jobs.map((j) => j.key));
    for (const k of [...this.since.keys()]) if (!now.has(k)) { this.since.delete(k); this.taken.delete(k); }
    for (const j of jobs) {
      // Under v7 the sim keeps the tick it became due; older rules are timed from when this observer first saw it.
      if (!this.since.has(j.key)) this.since.set(j.key, isHerdHomestead(h) ? h.due?.[j.key] ?? tick : tick);
      if (this.taken.has(j.key)) continue;
      if (h.villagers.some((v) => v.task && claimsDue(v.task, j))) {
        const since = this.since.get(j.key)!;
        this.taken.add(j.key);
        this.waits.push({ key: j.key, kind: j.kind, since, claimed: tick, wait: daylightAge(since, tick) });
      }
    }
  }

  /** Longest daytime age of due work nobody has taken yet. */
  openMax(): { key: string; age: number } | null {
    let best: { key: string; age: number } | null = null;
    for (const [k, since] of this.since) {
      if (this.taken.has(k)) continue;
      const age = daylightAge(since, this.tick);
      if (!best || age > best.age) best = { key: k, age };
    }
    return best;
  }

  metrics(): { total: WorkTicks; villagers: Record<string, WorkTicks>; waits: { count: number; max: number; open: { key: string; age: number } | null; byKind: Record<string, { count: number; max: number }> } } {
    const byKind: Record<string, { count: number; max: number }> = {};
    for (const w of this.waits) { const b = byKind[w.kind] ??= { count: 0, max: 0 }; b.count++; b.max = Math.max(b.max, w.wait); }
    return {
      total: { ...this.total },
      villagers: Object.fromEntries([...this.per].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, { ...v }])),
      waits: { count: this.waits.length, max: this.waits.reduce((n, w) => Math.max(n, w.wait), 0), open: this.openMax(), byKind },
    };
  }
}
