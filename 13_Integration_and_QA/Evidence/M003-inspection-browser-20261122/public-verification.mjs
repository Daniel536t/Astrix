// Focused public production check: actual network URL, real pointer/touch input.
import { chromium } from '/home/ubuntu/as/08_Technical_Director/Project_Setup/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const OUT = new globalThis.URL('./', import.meta.url).pathname;
const BASE = 'http://18.116.53.201/';
const url = `${BASE}?seed=1337&freeze=1&tx=-6&tz=-10&ty=18&dist=22&yaw=0&pitch=48`;
const results = { startedAt: new Date().toISOString(), url, browser: 'Chromium + SwiftShader', steps: [], errors: [], requestFailures: [], assets: [] };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const observe = page => {
  page.on('pageerror', e => results.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') results.errors.push(m.text()); });
  page.on('requestfailed', r => results.requestFailures.push({ url: r.url(), failure: r.failure() }));
};
const project = (page, key) => page.evaluate(key => {
  const target = window.__metrics.inspection.targets[key];
  if (!target) return null;
  const rect = window.__probe.renderer.domElement.getBoundingClientRect();
  const point = window.__probe.camera.position.clone().set(target.x, target.y, target.z).project(window.__probe.camera);
  return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
}, key);
const card = page => page.evaluate(() => ({
  hidden: document.querySelector('#inspect-card').hidden,
  name: document.querySelector('#inspect-name').textContent,
  description: document.querySelector('#inspect-description').textContent,
}));
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let page = await desktop.newPage(); observe(page);
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__ready && window.__metrics.inspection, null, { timeout: 60000 });
  results.assets = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => /\/assets\//.test(e.name)).map(e => e.name));
  const point = await project(page, 'entityId:hero:styl_rock_medium:-6:-10');
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => window.__metrics.inspection.selected === 'Stone boulder', null, { timeout: 15000 });
  const selected = await card(page);
  assert.equal(selected.hidden, false);
  assert.match(selected.description, /intentional pale block-stone/);
  results.steps.push({ name: 'public desktop click identifies intentional Stone boulder', card: selected });
  await page.screenshot({ path: `${OUT}public-desktop-stone.png`, timeout: 60000 });
  await page.locator('#inspect-close').click();
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'CANVAS');
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  page = await mobile.newPage(); observe(page);
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__ready && window.__metrics.inspection, null, { timeout: 60000 });
  await page.locator('.drawer-world').click();
  const tapPoint = await project(page, 'entityId:hero:styl_rock_medium:-6:-10');
  await page.touchscreen.tap(tapPoint.x, tapPoint.y);
  await page.waitForFunction(() => window.__metrics.inspection.selected === 'Stone boulder', null, { timeout: 15000 });
  const tapped = await card(page);
  assert.equal(tapped.hidden, false, 'public touch must visibly display the card');
  const close = await page.locator('#inspect-close').boundingBox();
  assert.ok(close.width >= 44 && close.height >= 44);
  await page.screenshot({ path: `${OUT}public-mobile-stone.png`, timeout: 60000 });
  await page.locator('#inspect-close').tap();
  await page.waitForFunction(() => document.querySelector('#inspect-card').hidden);
  results.steps.push({ name: 'public emulated touch displays card and 44 px Close works', card: tapped, close });
  await mobile.close();
  assert.deepEqual(results.errors, []);
  assert.deepEqual(results.requestFailures, []);
  results.status = 'passed';
} catch (e) {
  results.status = 'failed';
  results.failure = String(e?.stack ?? e);
  const active = browser.contexts().flatMap(c => c.pages()).filter(p => !p.isClosed()).at(-1);
  if (active) {
    results.diagnostics = await active.evaluate(() => ({ ready: window.__ready, metrics: window.__metrics,
      inspectorDisplay: getComputedStyle(document.querySelector('.inspector')).display,
      html: document.documentElement.outerHTML.slice(0, 2000) })).catch(() => null);
    await active.screenshot({ path: `${OUT}public-failure.png`, timeout: 15000 }).catch(() => {});
  }
} finally {
  results.finishedAt = new Date().toISOString();
  writeFileSync(`${OUT}public-results.json`, JSON.stringify(results, null, 2));
  await browser.close().catch(() => {});
  console.log(JSON.stringify(results, null, 2));
  if (results.status !== 'passed') process.exitCode = 1;
}
