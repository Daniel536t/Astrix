import { GameSession } from '../../../Astrix/Game/src/app/session';
import { GENERATOR_V2 } from '../../../Astrix/Game/src/sim/world';
import { findFieldSpot, findSiteSpot } from '../../../Astrix/Game/src/sim/homestead';
const pinned = (rules: number) => {
  let n = 0;
  const s = GameSession.genesis(1337, GENERATOR_V2);
  const go = (c: Record<string, unknown>) => { const r = s.dispatch({ schema: 3, id: `pin:${n++}:${String(c.type)}`, expectedRevision: s.world.revision, ...c } as never); if (!r.ok) throw new Error(JSON.stringify(r)); };
  go({ type: 'found_homestead', rules });
  go({ type: 'mark_field', ...findFieldSpot(s.world, 5, 4, 'potato')! });
  go({ type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'player' });
  go({ type: 'place_site', kind: 'woodshed', ...findSiteSpot(s.world)! });
  go({ type: 'approve_site', siteId: s.world.homestead!.sites![0].id });
  go({ type: 'assign_role', villagerId: 'villager:0', role: 'builder', actor: 'player' });
  for (let i = 0; i < 400; i++) go({ type: 'tick', ticks: 1 });
  go({ type: 'set_gate', gateId: 'gate:pen', state: 'open' });
  for (let i = 0; i < 50; i++) go({ type: 'tick', ticks: 1 });
  return s;
};
for (const r of (process.argv[2] ?? '4,5,6').split(',').map(Number)) console.log(`v${r}`, pinned(r).stateHash);
console.log('genesis', GameSession.genesis(1337).stateHash);
import { writeFileSync } from 'node:fs';
if (process.argv[3]) { const s = pinned(6); writeFileSync(process.argv[3], JSON.stringify({ hash: s.stateHash, snapshot: s.snapshot, journal: s.journal })); }
