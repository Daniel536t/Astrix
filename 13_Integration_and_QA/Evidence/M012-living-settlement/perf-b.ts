import { GameSession } from '../Astrix/Game/src/app/session';
import { GENERATOR_V2 } from '../Astrix/Game/src/sim/world';
import { findSiteSpot } from '../Astrix/Game/src/sim/homestead';
import { navStats } from '../Astrix/Game/src/sim/nav';
for (const rules of [3, 4]) {
  const s = GameSession.genesis(1337, GENERATOR_V2);
  let n = 0;
  const send = (c: Record<string, unknown>) => s.dispatch({ schema: 3, id: `p:${n++}`, expectedRevision: s.world.revision, ...c } as never);
  send({ type: 'found_homestead', rules });
  if (rules === 4) {
    send({ type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'player' });
    send({ type: 'assign_role', villagerId: 'villager:0', role: 'builder', actor: 'player' });
    send({ type: 'place_site', kind: 'woodshed', ...findSiteSpot(s.world)! });
    send({ type: 'approve_site', siteId: s.world.homestead!.sites![0].id });
  }
  const ms: number[] = [];
  for (let i = 0; i < 900; i++) { const t0 = performance.now(); send({ type: 'tick', ticks: 1 }); ms.push(performance.now() - t0); }
  const first = ms[0]; const rest = ms.slice(1).sort((a, b) => a - b);
  const st = navStats(s.world);
  console.log({ rules, first: first.toFixed(0), mean: (rest.reduce((a, b) => a + b) / rest.length).toFixed(2), p50: rest[449].toFixed(2), p99: rest[889].toFixed(2), max: rest[898].toFixed(1),
    searches: st.searches, expanded: st.expanded, searchMs: st.searchMs.toFixed(0), gridBuilds: st.gridBuilds, gridMs: st.gridMs.toFixed(0), site: s.world.homestead!.sites?.[0]?.state });
}
