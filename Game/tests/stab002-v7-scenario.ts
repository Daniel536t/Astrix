// STAB-002 v8 versioning: the v7 reference scenario. The same file ran on the S3 tree (bf23ae5, the build
// deployed with rules v7 on 2026-11-25) to pin V7_S3_FRESH and write tests/fixtures/stab002-v7-s3-save.json,
// so it uses only commands and helpers that S3 already had. It exercises S1 (v7 founding, animal states,
// births, an open gate), S2 (the founder's presence walking through the pens on the journaled tick) and S3
// (owner fields and a site as orders, set_priority, the steward assigning roles as the app runs it).
import { GameSession } from '../src/app/session';
import { GENERATOR_V2 } from '../src/sim/world';
import { facility, findFieldSpot, findSiteSpot } from '../src/sim/homestead';
import type { EnclosureId } from '../src/sim/homestead';
import { newStewardMemory, stewardCommands, stewardDue, stewardPlan } from '../src/app/steward';

let seq = 0;
export interface V7Run { s: GameSession; rejected: number }

/**
 * Fresh under `rules` (or founded under `from`, played `pre` ticks and upgraded to `rules`), then `ticks`
 * ticks: two owner fields, an approved woodshed, the coop on the priority list, the founder walking through
 * the pens for ticks 100-399 of the run, the pen gate opened at 450 and closed at 700; steward every 15th tick.
 */
export function v7Scenario(o: { rules: number; from?: number; pre?: number; ticks: number; seed?: number }): V7Run {
  const s = GameSession.genesis(o.seed ?? 1337, GENERATOR_V2);
  const send = (c: Record<string, unknown>) => s.dispatch({ schema: 3, id: `v7ref:${seq++}`, expectedRevision: s.world.revision, ...c } as never) as { ok: boolean; reasons?: string[] };
  const ok = (c: Record<string, unknown>) => { const r = send(c); if (!r.ok) throw new Error(`${String(c.type)}: ${JSON.stringify(r)}`); };
  const mem = newStewardMemory();
  let rejected = 0, k = 0;
  const step = (presence: boolean) => {
    let p: Record<string, number> | null = null;
    if (presence) {
      const ids: EnclosureId[] = ['coop', 'pen', 'sty', 'paddock'];
      const r = facility(s.world.homestead!, ids[Math.floor(k / 25) % 4])!.rect; k++;
      p = { x: Math.round((r.x0 + r.x1) / 2 + Math.sin(k) * 15), z: Math.round((r.z0 + r.z1) / 2 + Math.cos(k) * 12), mx: Math.sign(Math.cos(k)), mz: 0 };
    }
    ok({ type: 'tick', ticks: 1, ...(p ? { presence: p } : {}) });
    const tick = s.world.life!.tick;
    if (stewardDue(tick)) for (const c of stewardCommands(s.world.homestead!, stewardPlan(s.world, tick, mem))) if (!send(c).ok) rejected++;
  };
  // Only journaled commands touch the world (no wood put in the bag by hand), so the journal replays from genesis.
  const field = (w: number, d: number, crop: string) => ok({ type: 'mark_field', ...findFieldSpot(s.world, w, d, crop as never)! });
  const first = o.from ?? o.rules;
  ok(first === 1 ? { type: 'found_homestead' } : { type: 'found_homestead', rules: first });
  field(5, 4, 'potato');
  if (o.from !== undefined) {
    for (let i = 0; i < (o.pre ?? 0); i++) step(false);
    ok({ type: 'upgrade_homestead', rules: o.rules });
  }
  field(6, 6, 'wheat');
  ok({ type: 'place_site', kind: 'woodshed', ...findSiteSpot(s.world)! });
  ok({ type: 'approve_site', siteId: s.world.homestead!.sites!.at(-1)!.id });
  ok({ type: 'set_priority', target: 'coop', on: true });
  for (let i = 0; i < o.ticks; i++) {
    if (i === 450 && !send({ type: 'set_gate', gateId: 'gate:pen', state: 'open' }).ok) rejected++;
    if (i === 700 && !send({ type: 'set_gate', gateId: 'gate:pen', state: 'closed' }).ok) rejected++;
    step(i >= 100 && i < 400);
  }
  return { s, rejected };
}
