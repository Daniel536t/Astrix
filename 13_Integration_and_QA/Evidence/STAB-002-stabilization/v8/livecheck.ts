// STAB-002 v8: the save the live S3 build (https://astrix.nyc.boxd.sh/, bf23ae5) wrote in the browser probe
// (stab002-v8-live-s3-localstorage.json), checked headless on this tree: it restores to its own hash, its journal
// replays from genesis to the same hash under rules v7, and one upgrade_homestead { rules: 8 } keeps the farm.
// From Game/: npx esbuild ../13_Integration_and_QA/Evidence/STAB-002-stabilization/v8/livecheck.ts --bundle
//   --platform=node --format=esm --external:three --outfile=.tmp-tb/livecheck.mjs && node .tmp-tb/livecheck.mjs
import { readFileSync } from 'node:fs';
import { GameSession } from '../../../../Game/src/app/session';
import { homesteadSnapshot } from '../../../../Game/src/sim/homestead';

const store = JSON.parse(readFileSync('../13_Integration_and_QA/Evidence/STAB-002-stabilization/v8/stab002-v8-live-s3-localstorage.json', 'utf8')) as Record<string, string>;
const key = Object.keys(store).find((k) => /^astrix:m002:v\d+:seed:1337$/.test(k))!;
const save = JSON.parse(store[key]);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const s = GameSession.restore(clone(save.snapshot), clone(save.journal));
const r = GameSession.replay(clone(save.journal));
const same = JSON.stringify(s.snapshot) === JSON.stringify(save.snapshot);
console.log(`key ${key}: rules v${s.world.homestead!.version}, tick ${s.world.life!.tick}, entries ${save.journal.entries.length}, restore ${s.stateHash} (snapshot byte-identical ${same}), replay from genesis ${r.stateHash}, equal ${s.stateHash === r.stateHash}`);
const before = JSON.stringify({ ...homesteadSnapshot(s.world.homestead!), version: 0 });
const u = s.dispatch({ schema: 3, id: 'livecheck:up', expectedRevision: s.world.revision, type: 'upgrade_homestead', rules: 8 } as never);
console.log(`upgrade ok ${u.ok}, v${s.world.homestead!.version}, farm unchanged but the rules number ${JSON.stringify({ ...homesteadSnapshot(s.world.homestead!), version: 0 }) === before}, animals ${s.world.homestead!.animals.length}, villagers ${s.world.homestead!.villagers.length}`);
