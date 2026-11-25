// Write a copy of an M015 probe with other settings (viewport, dist, base URL, prefix, extra URL params):
//   node gen-m015.mjs <probe> <out.js> key=value ...
// probes: layout (m015-layout.probe.js), controls (m015-controls.probe.js), perf (m015-perf.probe.js), session (m015-session.probe.js)
// viewports (vp=): p360 (360x780), p390 (390x844), l844 (844x390), t1280 (1280x800), t800 (800x1280), d1280 (desktop 1280x720, no touch)
// e.g. node gen-m015.mjs layout /projects/sandbox/.kiro/artifacts/screenshots/probe/m015-lay-p390-a.js vp=p390 prefix=after dist=/projects/sandbox/.kiro/artifacts/screenshots/probe/dist
//      node gen-m015.mjs layout <out.js> vp=t1280 base=https://astrix.nyc.boxd.sh/ prefix=live
// Only https://astrix.local/ is served from the local dist copy; other bases load from the network.
// Run the written file with Playwright's browser_run_code_unsafe { filename } (write a new filename after each edit).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const [probe, out, ...kv] = process.argv.slice(2);
if (!probe || !out) { console.error('usage: node gen-m015.mjs <layout|controls|perf|session> <out.js> key=value ...'); process.exit(1); }
const VP = {
  p360: { w: 360, h: 780, mobile: true }, p390: { w: 390, h: 844, mobile: true }, l844: { w: 844, h: 390, mobile: true },
  t1280: { w: 1280, h: 800, mobile: true }, t800: { w: 800, h: 1280, mobile: true }, d1280: { w: 1280, h: 720, mobile: false },
  d1000: { w: 1000, h: 600, mobile: false },
};
const src = readFileSync(resolve(here, `m015-${probe}.probe.js`), 'utf8');
const m = /\/\*CFG\*\/([\s\S]*?)\/\*END\*\//.exec(src);
const cfg = Function(`return (${m[1]})`)();
for (const pair of kv) {
  const i = pair.indexOf('=');
  const k = pair.slice(0, i), v = pair.slice(i + 1);
  if (k === "vps") cfg.vps = v.split(",");
  else if (k === "vp") Object.assign(cfg, { vp: v, ...VP[v] });
  else cfg[k] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v === 'true' ? true : v === 'false' ? false : v;
}
if (cfg.base && !cfg.base.endsWith('/')) cfg.base += '/';
writeFileSync(out, src.replace(m[0], `/*CFG*/${JSON.stringify(cfg, null, 2)}/*END*/`));
console.log('wrote', out, JSON.stringify(cfg));
