// STAB-002 S4: the v7 reference hashes pinned in Game/tests/stab002.s2.test.ts (M014 reference run without
// presence, and 900-tick fresh v7 runs on seeds 1 / 42 / 1337 / 2024), plus the v1-v6 pins and genesis.
// From Game/: npx esbuild ../13_Integration_and_QA/Evidence/STAB-002-stabilization/s4/pin7.ts --bundle --platform=node
//   --format=esm --external:three --outfile=tests/.pin7.tmp.mjs && node tests/.pin7.tmp.mjs
import { GameSession } from '../../../../Game/src/app/session';
import { GENERATOR_V2 } from '../../../../Game/src/sim/world';
import { findFieldSpot, findSiteSpot } from '../../../../Game/src/sim/homestead';
import { ok, tick } from '../../../../Game/tests/stab002-s2-harness';

function reference(rules: number): GameSession {
  const s = GameSession.genesis(1337, GENERATOR_V2);
  const t = (n: number) => { for (let i = 0; i < n; i++) tick(s); };
  ok(s, { type: 'found_homestead', rules });
  ok(s, { type: 'mark_field', ...findFieldSpot(s.world, 5, 4, 'potato')! });
  ok(s, { type: 'assign_role', villagerId: 'villager:2', role: 'woodcutter', actor: 'player' });
  ok(s, { type: 'place_site', kind: 'woodshed', ...findSiteSpot(s.world)! });
  ok(s, { type: 'approve_site', siteId: s.world.homestead!.sites![0].id });
  ok(s, { type: 'assign_role', villagerId: 'villager:0', role: 'builder', actor: 'player' });
  t(400);
  ok(s, { type: 'set_gate', gateId: 'gate:pen', state: 'open' });
  t(50);
  return s;
}
console.log('genesis', GameSession.genesis(1337).stateHash);
for (const r of [4, 5, 6, 7]) console.log(`reference v${r}`, reference(r).stateHash);
for (const seed of [1, 42, 1337, 2024]) {
  const s = GameSession.genesis(seed, GENERATOR_V2);
  ok(s, { type: 'found_homestead', rules: 7 });
  for (let i = 0; i < 900; i++) tick(s);
  console.log(`fresh v7 seed ${seed} 900 ticks`, s.stateHash);
}
