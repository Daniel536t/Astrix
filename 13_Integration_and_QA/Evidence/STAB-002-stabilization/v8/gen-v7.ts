// STAB-002 v8: run on a git worktree of bf23ae5 (S3, the deployed rules v7) with Game/tests/stab002-v7-scenario.ts copied
// into it; prints the v7 reference hash and writes the v7 save fixture (argv[2]). From the worktree's Game/:
//   npx esbuild <this file> --bundle --platform=node --format=esm --external:three --outfile=.tmp-gen.mjs && node .tmp-gen.mjs out.json

import { writeFileSync } from 'node:fs';
import { v7Scenario } from '../../../../Game/tests/stab002-v7-scenario';
const t0 = Date.now();
const fresh = v7Scenario({ rules: 7, ticks: 900 });
console.log('fresh v7 900', fresh.s.stateHash, 'rejected', fresh.rejected, 'animals', fresh.s.world.homestead!.animals.length, 'version', fresh.s.world.homestead!.version);
const up = v7Scenario({ rules: 7, from: 6, pre: 300, ticks: 600 });
const h = up.s.world.homestead!;
console.log('v6->v7 300+600', up.s.stateHash, 'rejected', up.rejected, 'animals', h.animals.length, 'villagers', h.villagers.length, 'sites', h.sites!.map((x) => x.state).join(','), 'plots', h.plots.map((p) => p.state).join(','));
const fh = fresh.s.world.homestead!;
console.log('fresh: sites', fh.sites!.map((x) => x.kind + ':' + x.state).join(','), 'plots', fh.plots.map((p) => p.state + '/' + (p.sown ?? 0)).join(','), 'acts', [...new Set(fh.animals.map((a) => a.act))].join(','), 'roles', fh.villagers.map((v) => v.role).join(','));
const presence = fresh.s.journal.entries.filter((e: any) => e.command.type === 'tick' && e.command.presence).length;
console.log('presence ticks', presence, 'entries', fresh.s.journal.entries.length);
writeFileSync(process.argv[2], JSON.stringify({ made: 'bf23ae5 (STAB-002 S3, rules v7, deployed 20261125T230303Z-bf23ae5) via tests/stab002-v7-scenario.ts { rules: 7, from: 6, pre: 300, ticks: 600 }', hash: up.s.stateHash, snapshot: up.s.snapshot, journal: up.s.journal }));
console.log('ms', Date.now() - t0);
import { GameSession } from '../../../../Game/src/app/session';
const g = GameSession.replay(JSON.parse(JSON.stringify(up.s.journal)));
console.log('S3 replay of fixture journal', g.stateHash);
