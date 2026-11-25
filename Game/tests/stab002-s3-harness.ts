// STAB-002 S3: shared measurement for the BUG-C scenarios (imported by the
// stab002.s3*.test.ts files and the evidence script s3/s3.ts). Worlds are made
// with the same journaled commands the app sends; the steward runs exactly as
// the app's frame loop runs it (app/steward.ts, every 15th tick, after the tick).
import { GameSession } from '../src/app/session';
import { GENERATOR_V2 } from '../src/sim/world';
import { DM, VILLAGER_SPEED, facility, findFieldSpot, isHerdHomestead, villagerSpeed } from '../src/sim/homestead';
import type { SiteKind } from '../src/sim/homestead';
import { checkBuilding } from '../src/sim/buildings';
import { newStewardMemory, stewardCommands, stewardDue, stewardPlan } from '../src/app/steward';
import { WorkTime } from '../src/app/work-time';

let seq = 0;
export interface Farm {
  s: GameSession;
  send: (c: Record<string, unknown>) => { ok: boolean; outcome?: any; reasons?: string[] };
  step: (n?: number) => void;
  work: WorkTime;
  /**
   * Largest villager step in one tick over its allowance (1.0 = the allowance): under v7 the exact walking
   * speed x 1 tick (`villagerSpeed`, STAB-002 S4); under v1 to v6 (the pre-upgrade ticks) VILLAGER_SPEED + 1 dm,
   * the integer rounding those rules recorded.
   */
  maxStep: () => number;
  stewardLog: string[];
}

/**
 * A fresh homestead under `rules`, or (with `from`) one founded under `from`,
 * played `pre` ticks with the steward and upgraded to `rules` by the journaled
 * command, as the app does on load.
 */
export function farm(seed: number, rules: number, o: { from?: number; pre?: number; steward?: boolean; fields?: number } = {}): Farm {
  const s = GameSession.genesis(seed, GENERATOR_V2);
  const send = (c: Record<string, unknown>) => s.dispatch({ schema: 3, id: `s3:${seq++}`, expectedRevision: s.world.revision, ...c } as never) as never;
  const mem = newStewardMemory();
  const stewardOn = o.steward ?? true;
  const stewardLog: string[] = [];
  const work = new WorkTime();
  let worst = 0;
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      const before = new Map(s.world.homestead!.villagers.map((v) => [v.id, { x: v.x, z: v.z }]));
      const r = send({ type: 'tick', ticks: 1 });
      if (!r.ok) throw new Error(JSON.stringify(r));
      for (const v of s.world.homestead!.villagers) {
        const b = before.get(v.id);
        const h = s.world.homestead!;
        if (b) worst = Math.max(worst, Math.hypot(v.x - b.x, v.z - b.z) / (isHerdHomestead(h) ? villagerSpeed(h) : VILLAGER_SPEED + 1));
      }
      const tick = s.world.life!.tick;
      work.observe(s.world, tick);
      if (stewardOn && stewardDue(tick)) {
        const plan = stewardPlan(s.world, tick, mem);
        for (const c of stewardCommands(s.world.homestead!, plan)) {
          const rr = send(c);
          if (rr.ok && c.type === 'assign_role') stewardLog.push(`t${tick} ${plan.move!.name}->${plan.move!.role}`);
        }
      }
    }
  };
  const first = o.from ?? rules;
  const r0 = send(first === 1 ? { type: 'found_homestead' } : { type: 'found_homestead', rules: first });
  if (!r0.ok) throw new Error(JSON.stringify(r0));
  for (let k = 0; k < (o.fields ?? 0); k++) markField(s, send, 4, 4);
  if (o.from !== undefined) {
    step(o.pre ?? 0);
    const r = send({ type: 'upgrade_homestead', rules });
    if (!r.ok) throw new Error(JSON.stringify(r));
  }
  return { s, send, step, work, maxStep: () => worst, stewardLog };
}

/** The owner marks a w x d wheat field at the first good spot, paying the fence from the bag (fence wood is put in the bag first, as BUG-C did). */
export function markField(s: GameSession, send: Farm['send'], w: number, d: number): string {
  s.world.inventory.wood = (s.world.inventory.wood ?? 0) + 20;
  const spec = findFieldSpot(s.world, w, d, 'wheat');
  if (!spec) throw new Error('no field spot');
  const r = send({ type: 'mark_field', ...spec });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.outcome.fieldId as string;
}

/** The owner places a building (rotation 0) at the first valid ring spot round the farmhouse and approves it (BUG-C placement). */
export function placeApproved(s: GameSession, send: Farm['send'], kind: SiteKind): string {
  const h = s.world.homestead!;
  const home = facility(h, 'farmhouse')!.use;
  const hx = Math.round(home.x / DM), hz = Math.round(home.z / DM);
  for (let r = 6; r <= 40; r += 2) for (let a = 0; a < 24; a++) {
    const x = hx + Math.round(Math.cos((a / 24) * 2 * Math.PI) * r), z = hz + Math.round(Math.sin((a / 24) * 2 * Math.PI) * r);
    if (!checkBuilding(s.world, kind, x, z, 0).ok) continue;
    const p = send({ type: 'place_site', kind, x, z, rot: 0 });
    if (!p.ok) continue;
    const id = p.outcome.siteId as string;
    const ap = send({ type: 'approve_site', siteId: id });
    if (!ap.ok) throw new Error(JSON.stringify(ap));
    return id;
  }
  throw new Error(`no spot for ${kind}`);
}

/** Ticks until `done()` holds, stepping one tick at a time (null: not within `limit`). */
export function until(f: Farm, limit: number, done: () => boolean): number | null {
  for (let i = 1; i <= limit; i++) { f.step(); if (done()) return i; }
  return null;
}

/** Scenario B: a woodshed placed and approved at `at` (fresh store, no owner help, default steward). Ticks to done, or null. */
export function woodshed(seed: number, rules: number, at: number, limit: number, o: { from?: number; pre?: number; well?: boolean } = {}): { done: number | null; well: number | null; f: Farm; id: string } {
  const f = farm(seed, rules, o);
  f.step(at);
  const id = placeApproved(f.s, f.send, 'woodshed');
  const wellId = o.well ? placeApproved(f.s, f.send, 'well') : null;
  const site = (x: string) => f.s.world.homestead!.sites!.find((st) => st.id === x)!;
  let done: number | null = null, well: number | null = null;
  for (let i = 1; i <= limit; i++) {
    f.step();
    if (done === null && site(id).state === 'done') done = i;
    if (wellId && well === null && site(wellId).state === 'done') well = i;
    if (done !== null && (!wellId || well !== null)) break;
  }
  return { done, well, f, id };
}

/**
 * Scenario F on a busy farm: `fields` 4 x 4 fields marked at tick 0 and
 * played `warm` ticks, then a w x d field marked; ticks to first claimed (a
 * villager's task works on it) and to fully sown, within `limit`.
 */
export function busyField(seed: number, rules: number, fields: number, warm: number, w: number, d: number, limit: number, o: { from?: number; pre?: number } = {}):
  { claimed: number | null; sown: number | null; sownUnits: number; units: number; seedShort: boolean; seedAtMark: number; sownAt60: number; f: Farm; id: string } {
  const f = o.from !== undefined ? farm(seed, rules, { from: o.from, pre: o.pre }) : farm(seed, rules, {});
  for (let k = 0; k < fields; k++) markField(f.s, f.send, 4, 4);
  f.step(warm);
  const freeSeed = () => (f.s.world.life!.stockpiles.get('stockpile:founder')!.inventory.seed ?? 0) + (f.s.world.homestead!.overflow.seed ?? 0);
  const seedAtMark = freeSeed();
  const id = markField(f.s, f.send, w, d);
  const h = () => f.s.world.homestead!;
  const plot = () => h().plots.find((p) => p.id === id)!;
  const units = Math.ceil((w * d) / 9);
  let claimed: number | null = null, sown: number | null = null, seedShort = false, sownAt60 = 0;
  const sownNow = () => { const p = plot(); return p.state === 'growing' || p.state === 'ripe' ? units : p.sown ?? 0; };
  for (let i = 1; i <= limit; i++) {
    f.step();
    if (i === 60) sownAt60 = sownNow();
    if (claimed === null && h().villagers.some((v) => v.task && (v.task.target === id || v.task.legs.some((l, k) => k >= v.task!.leg && l.at === id)))) claimed = i;
    if (sown === null && (plot().state === 'growing' || plot().state === 'ripe')) { sown = i; if (i <= 60) sownAt60 = units; break; }
    const inv = f.s.world.life!.stockpiles.get('stockpile:founder')!.inventory;
    if ((inv.seed ?? 0) + (h().overflow.seed ?? 0) === 0 && plot().state === 'tilled') seedShort = true;
  }
  const p = plot();
  const sownUnits = p.state === 'growing' || p.state === 'ripe' ? units : p.sown ?? 0;
  return { claimed, sown, sownUnits, units, seedShort, seedAtMark, sownAt60, f, id };
}
