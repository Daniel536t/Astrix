import { GameSession } from '../../../Astrix/Game/src/app/session';
import { GENERATOR_V2 } from '../../../Astrix/Game/src/sim/world';
import { navStats } from '../../../Astrix/Game/src/sim/nav';
for (const rules of [6, 7, 6, 7]) {
  const s = GameSession.genesis(1337, GENERATOR_V2); let n = 0;
  const send = (c: any) => { const r = s.dispatch({ schema: 3, id: `p:${n++}`, expectedRevision: s.world.revision, ...c }); if (!r.ok) throw new Error(JSON.stringify(r)); };
  send({ type: 'found_homestead', rules });
  const st0 = { ...navStats(s.world) };
  const t0 = performance.now(); let worst = 0;
  for (let i = 0; i < 900; i++) { const a = performance.now(); send({ type: 'tick', ticks: 1 }); worst = Math.max(worst, performance.now() - a); }
  const st = navStats(s.world);
  console.log(`v${rules} ${((performance.now() - t0) / 900).toFixed(2)} ms/tick (worst ${worst.toFixed(1)}), searches/tick ${((st.searches - st0.searches) / 900).toFixed(1)}, expanded/tick ${((st.expanded - st0.expanded) / 900).toFixed(0)}, searchMs/tick ${((st.searchMs - st0.searchMs) / 900).toFixed(2)}`);
}
