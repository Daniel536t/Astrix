// Write a copy of the M012 Stage B job probe pointed at another deployment:
//   node gen-jobs.mjs <base-url> <out.js> [prefix] [untilTick]
// e.g. node gen-jobs.mjs https://astrix.nyc.boxd.sh/ /tmp/m012-jobs.live.js live
// Only https://astrix.local/ is served from the local Game/dist copy; other bases load from the network.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const [base, out, prefix = 'live', untilTick] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node gen-jobs.mjs <base-url> <out.js> [prefix] [untilTick]'); process.exit(1); }
const src = readFileSync(resolve(here, 'm012-jobs.probe.js'), 'utf8');
const m = /\/\*CFG\*\/([\s\S]*?)\/\*END\*\//.exec(src);
const cfg = Function(`return (${m[1]})`)();
Object.assign(cfg, { base: base.endsWith('/') ? base : `${base}/`, prefix, ...(untilTick ? { untilTick: Number(untilTick) } : {}) });
writeFileSync(out, src.replace(m[0], `/*CFG*/${JSON.stringify(cfg, null, 2)}/*END*/`));
console.log('wrote', out, cfg);
