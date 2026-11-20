// Headless render harness — Task 007
// Usage: node tools/render.mjs <url> <out.png> [width] [height]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [, , url, out, w = '1600', h = '900'] = process.argv;
if (!url || !out) {
  console.error('usage: node tools/render.mjs <url> <out.png> [w] [h]');
  process.exit(2);
}

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-gpu-sandbox',
    '--no-sandbox'
  ]
});
const page = await browser.newPage({
  viewport: { width: Number(w), height: Number(h) },
  deviceScaleFactor: 1
});

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });
// Let the frame loop publish post-action metrics and settle streaming/LOD.
await page.waitForTimeout(500);
const info = await page.evaluate(() => {
  const r = window.__probe?.renderer;
  if (!r) return null;
  return {
    calls: r.info.render.calls,
    tris: r.info.render.triangles,
    gl: r.getContext().getParameter(r.getContext().VERSION),
    metrics: window.__metrics ?? null,
  };
});

const p = resolve(out);
mkdirSync(dirname(p), { recursive: true });
await page.screenshot({ path: p, timeout: 120000 });
await browser.close();

console.log(JSON.stringify({ out: p, url, info, errors }, null, 2));
if (errors.length) process.exit(1);
