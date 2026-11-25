// Write a copy of the M014 construction probe pointed at another deployment (or with other settings):
//   node gen-construction.mjs <base-url> <out.js> [prefix] [phase: build|phone] [untilTick] [timescale]
// e.g. node gen-construction.mjs https://astrix.local/ /projects/sandbox/.kiro/artifacts/screenshots/probe/m014-build-a.js build build
//      node gen-construction.mjs https://astrix.local/ /projects/sandbox/.kiro/artifacts/screenshots/probe/m014-phone-a.js phone phone
//      node gen-construction.mjs https://astrix.nyc.boxd.sh/ /projects/sandbox/.kiro/artifacts/screenshots/probe/m014-live-a.js live build
// Only https://astrix.local/ is served from the local Game/dist copy; other bases load from the network.
// Run the written file with Playwright's browser_run_code_unsafe { filename } (the file must sit under an allowed root;
// write a new filename after each edit, and retry once on ENOENT).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const [base, out, prefix = 'live', phase = 'build', untilTick, timescale] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node gen-construction.mjs <base-url> <out.js> [prefix] [phase] [untilTick] [timescale]'); process.exit(1); }
const src = readFileSync(resolve(here, 'm014-construction.probe.js'), 'utf8');
const m = /\/\*CFG\*\/([\s\S]*?)\/\*END\*\//.exec(src);
const cfg = Function(`return (${m[1]})`)();
Object.assign(cfg, { base: base.endsWith('/') ? base : `${base}/`, prefix, phase, ...(untilTick ? { untilTick: Number(untilTick) } : {}), ...(timescale ? { timescale: Number(timescale) } : {}) });
writeFileSync(out, src.replace(m[0], `/*CFG*/${JSON.stringify(cfg, null, 2)}/*END*/`));
console.log('wrote', out, cfg);
