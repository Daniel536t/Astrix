// Write a copy of the M013 woodland probe pointed at another deployment (or with other settings):
//   node gen-woodland.mjs <base-url> <out.js> [prefix] [phase: life|views|all] [untilTick] [timescale] [ageTo]
// ageTo (views phase only): first run a fresh world at x60 until that tick, then measure the views on the aged woodland.
// Use '' to skip a positional argument, e.g. node gen-woodland.mjs https://astrix.local/ out.js aged views '' '' 1200
// e.g. node gen-woodland.mjs https://astrix.nyc.boxd.sh/ /projects/sandbox/.kiro/artifacts/screenshots/probe/m013-live-life.js live life
//      node gen-woodland.mjs https://astrix.nyc.boxd.sh/ /projects/sandbox/.kiro/artifacts/screenshots/probe/m013-live-views.js live views
// Only https://astrix.local/ is served from the local Game/dist copy; other bases load from the network.
// Run the written file with Playwright's browser_run_code_unsafe { filename } (the file must sit under an allowed root).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const [base, out, prefix = 'live', phase = 'all', untilTick, timescale, ageTo] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node gen-woodland.mjs <base-url> <out.js> [prefix] [phase] [untilTick] [timescale] [ageTo]'); process.exit(1); }
const src = readFileSync(resolve(here, 'm013-woodland.probe.js'), 'utf8');
const m = /\/\*CFG\*\/([\s\S]*?)\/\*END\*\//.exec(src);
const cfg = Function(`return (${m[1]})`)();
Object.assign(cfg, { base: base.endsWith('/') ? base : `${base}/`, prefix, phase, ...(untilTick ? { untilTick: Number(untilTick) } : {}), ...(timescale ? { timescale: Number(timescale) } : {}), ...(ageTo ? { ageTo: Number(ageTo) } : {}) });
writeFileSync(out, src.replace(m[0], `/*CFG*/${JSON.stringify(cfg, null, 2)}/*END*/`));
console.log('wrote', out, cfg);
