// Read-only reproduction of the production map renderer warning.
import { chromium } from '/home/ubuntu/as/08_Technical_Director/Project_Setup/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const OUT = new URL('./', import.meta.url).pathname;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const result = { url: 'http://18.116.53.201/?scene=map&seed=1337&freeze=1', errors: [] };
const cdp = await page.context().newCDPSession(page);
await cdp.send('Runtime.enable');
cdp.on('Runtime.consoleAPICalled', (event) => {
  if (event.type !== 'error') return;
  result.errors.push({ args: event.args.map(a => a.description ?? a.value), stack: event.stackTrace });
});
page.on('pageerror', e => result.errors.push({ pageError: e.stack }));
await page.goto(result.url, { waitUntil: 'load', timeout: 120000 });
await page.waitForTimeout(12000);
result.metrics = await page.evaluate(() => window.__metrics);
result.ready = await page.evaluate(() => window.__ready);
writeFileSync(`${OUT}map-diagnostic-${new Date().toISOString().replaceAll(':', '-')}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ errors: result.errors, ready: result.ready, loadedChunks: result.metrics?.loadedChunks }, null, 2));
await browser.close();
