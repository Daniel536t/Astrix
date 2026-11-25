// Writes the S4 browser probe variants (CFG replaced) under .kiro/artifacts/screenshots/ for Playwright
// browser_run_code_unsafe { filename }. node gen-s4-probes.mjs <suffix>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const dest = '/projects/sandbox/.kiro/artifacts/screenshots';
const probe = '/projects/sandbox/.kiro/artifacts/screenshots/probe';
const suffix = process.argv[2] ?? 'a';
const views = { phone: { name: 'phone', width: 390, height: 844, isMobile: true }, tablet: { name: 'tablet', width: 1365, height: 709, isMobile: false } };
const builds = {
  before: { base: 'https://astrix.local/', dist: `${probe}/dist-s4-before` },
  live: { base: 'https://astrix.nyc.boxd.sh/', dist: '' },
  after: { base: 'https://astrix.local/', dist: `${probe}/dist` },
};
const src = readFileSync(resolve(here, 'stab002-s4-perf.probe.js'), 'utf8');
for (const [tag, b] of Object.entries(builds)) for (const [vn, view] of Object.entries(views)) {
  const cfg = { base: b.base, dist: b.dist, out: here, tag, view, variants: [[false, 'medium'], [false, 'low'], [true, 'medium'], [true, 'low']], spot: [-24, 6], seconds: 40 };
  const code = src.replace(/\/\*CFG\*\/[\s\S]*?\/\*END\*\//, `/*CFG*/${JSON.stringify(cfg)}/*END*/`);
  const f = `${dest}/s4-perf-${tag}-${vn}-${suffix}.js`;
  writeFileSync(f, code);
  console.log(f);
}
// The S3 no-manual-roles flow at the S4 speed (allowance 3.9 m per tick elapsed).
const s3 = readFileSync(resolve(here, '../s3/stab002-s3-probe.js'), 'utf8')
  .replace("const file = `stab002-s3-${CFG.phase}-${name}.png`", "const file = `stab002-s4-flow-${CFG.phase}-${name}.png`")
  .replace('allow = dt * 2.7;', 'allow = dt * 3.9 + 0.015;')
  .replace("`${CFG.out}/stab002-s3-${CFG.phase}-results.json`", "`${CFG.out}/stab002-s4-flow-${CFG.phase}-results.json`");
for (const phase of ['panel', 'build']) {
  const code = s3.replace(/\/\*CFG\*\/\{[\s\S]*?\}\/\*END\*\//, (m) => m.replace("out: '/projects/sandbox/Astrix/13_Integration_and_QA/Evidence/STAB-002-stabilization/s3'", `out: '${here}'`).replace("phase: 'panel'", `phase: '${phase}'`));
  const f = `${dest}/s4-flow-${phase}-${suffix}.js`;
  writeFileSync(f, code);
  console.log(f);
}
