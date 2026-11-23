// Read-only production diagnostic for exact entity/chunk materialization histories.
// This does not mutate simulation state or write a save. Real page navigation and
// inspection controls are used; only published __metrics / __probe values are read.
import { chromium } from '/home/ubuntu/as/08_Technical_Director/Project_Setup/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const ORIGIN = 'http://18.116.53.201/';
const GAME = ORIGIN + '?seed=1337&freeze=1&tx=-14&tz=-8&ty=22&dist=78';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const suffix = new Date().toISOString().replaceAll(':', '-');
const out = new URL(`camera-history-${suffix}.json`, import.meta.url).pathname;
const result = { scope: 'unbuilt exact camera materialization history', steps: [], errors: [], failedResponses: [] };
async function metrics(page, label) {
  await page.waitForFunction(() => window.__ready === true && window.__metrics.inspection?.targetCount > 0,
    null, { timeout: 60000 });
  const m = await page.evaluate(() => ({ entities: window.__metrics.entities,
    chunksGenerated: window.__metrics.chunksGenerated, loadedChunks: window.__metrics.loadedChunks,
    cachedChunks: window.__metrics.cachedChunks, inspection: window.__metrics.inspection.targetCount,
    stateHash: window.__metrics.stateHash, camera: {
      x: window.__probe.camera.position.x, y: window.__probe.camera.position.y, z: window.__probe.camera.position.z } }));
  result.steps.push({ label, ...m });
  return m;
}
async function inspect(page, key, label) {
  await page.locator('#inspect-toggle').click();
  await page.locator(`[data-inspect-key="${key}"]`).click();
  await page.waitForFunction(() => window.__metrics.inspection.selected !== null);
  await page.locator('#inspect-close').click();
  await page.locator('canvas').focus();
  await page.keyboard.press('Escape');
  await metrics(page, label);
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => result.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') result.errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) result.failedResponses.push({ status: r.status(), url: r.url() }); });
  await page.goto(GAME, { waitUntil: 'load', timeout: 120000 });
  await metrics(page, 'original');
  await inspect(page, 'entityId:hero:styl_cairn:-20:-6', 'original after cairn inspect');
  await inspect(page, 'entityId:hero:styl_ore:-38:-42', 'original after ore inspect');
  await inspect(page, 'siteId:site:waystone', 'original after waystone inspect');
  await page.goto(ORIGIN + '?seed=1337&freeze=1&tx=-10&tz=-14&ty=19&dist=28&pitch=35', { waitUntil: 'load', timeout: 120000 });
  await metrics(page, 'waystone');
  await page.locator('canvas').focus();
  await page.keyboard.press('Escape');
  await metrics(page, 'waystone after canvas escape');
  await page.goto(GAME, { waitUntil: 'load', timeout: 120000 });
  await metrics(page, 'original final');
  result.status = result.errors.length || result.failedResponses.length ? 'browser-errors' : 'completed';
} catch (error) {
  result.status = 'failed';
  result.failure = String(error?.stack ?? error);
  process.exitCode = 1;
} finally {
  writeFileSync(out, JSON.stringify(result, null, 2));
  await browser.close();
  console.log(JSON.stringify(result, null, 2));
}
