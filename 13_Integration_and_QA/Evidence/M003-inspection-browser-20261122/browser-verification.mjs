// Production-bundle browser verification for read-only world inspection.
// Mouse/touch events use actual DOM/canvas input. Scene projection is read-only;
// there is no mutable world or renderer handle in this harness.
import { chromium } from '/home/ubuntu/as/08_Technical_Director/Project_Setup/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const OUT = new globalThis.URL('./', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const BASE = process.env.ASTRIX_BASE ?? 'http://127.0.0.1:4173/';
const KEY = 'astrix:m002:v3:seed:1337';
const errors = [];
const consoleLog = [];
const results = { startedAt: new Date().toISOString(), url: BASE,
  browser: 'Chromium + SwiftShader (software WebGL)', steps: [], errors,
  physicalDeviceTested: false, physicalGpuTested: false };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
let page;
const url = (x, z, y = 20, dist = 20, yaw = 0, pitch = 48) =>
  `${BASE}?seed=1337&freeze=1&tx=${x}&tz=${z}&ty=${y}&dist=${dist}&yaw=${yaw}&pitch=${pitch}`;
const logPage = (p, prefix = '') => {
  p.on('pageerror', e => { errors.push(String(e)); consoleLog.push(`${prefix}pageerror: ${e}`); });
  p.on('console', m => { consoleLog.push(`${prefix}${m.type()}: ${m.text()}`); if (m.type() === 'error') errors.push(m.text()); });
};
const project = (p, key) => p.evaluate(key => {
  const target = window.__metrics.inspection.targets[key];
  if (!target) return null;
  const rect = window.__probe.renderer.domElement.getBoundingClientRect();
  const point = window.__probe.camera.position.clone().set(target.x, target.y, target.z).project(window.__probe.camera);
  return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2,
    visible: point.z >= -1 && point.z <= 1 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 };
}, key);
const card = p => p.evaluate(() => {
  const el = document.querySelector('#inspect-card');
  return { hidden: el.hidden, mode: el.dataset.mode ?? null, ref: el.dataset.ref ?? null,
    name: document.querySelector('#inspect-name').textContent,
    category: document.querySelector('#inspect-card .inspect-category').textContent,
    description: document.querySelector('#inspect-description').textContent,
    facts: [...document.querySelectorAll('.inspect-facts > div')].map(row => row.innerText),
    selected: window.__metrics.inspection.selected, hovered: window.__metrics.inspection.hovered };
});
const readOnlySnapshot = p => p.evaluate(() => ({
  stateHash: window.__metrics.stateHash, revision: window.__metrics.revision,
  acceptedCommands: window.__metrics.acceptedCommands, inventory: {...window.__metrics.inventory},
  savedRaw: localStorage.getItem('astrix:m002:v3:seed:1337'),
}));
const assertReadOnly = async (p, before, name) => {
  const after = await readOnlySnapshot(p);
  assert.deepEqual(after, before, `${name} must not change simulation or storage`);
  results.steps.push({ name, readOnly: true, stateHash: after.stateHash, acceptedCommands: after.acceptedCommands });
};
// Production metrics are sampled every six animation frames and intentionally
// expose no frame counter. Give live input/render a short settling window without
// waiting for a diagnostic field that does not exist.
const settle = async p => p.waitForTimeout(150);
async function pin(p, key, expectedName) {
  await settle(p);
  const point = await project(p, key);
  assert.ok(point?.visible, `${key} projected into viewport`);
  await p.mouse.click(point.x, point.y);
  await p.waitForFunction(name => window.__metrics.inspection.selected === name, expectedName, { timeout: 10000 });
  const selected = await card(p);
  assert.equal(selected.mode, 'pinned');
  assert.equal(selected.name, expectedName);
  return selected;
}
async function tap(p, key, expectedName) {
  await settle(p);
  const point = await project(p, key);
  assert.ok(point?.visible, `${key} projected into viewport`);
  await p.touchscreen.tap(point.x, point.y);
  await p.waitForFunction(name => window.__metrics.inspection.selected === name, expectedName, { timeout: 10000 });
  const selected = await card(p);
  assert.equal(selected.hidden, false, 'tap must display the inspector card');
  assert.equal(selected.mode, 'pinned');
  assert.equal(selected.name, expectedName);
  return selected;
}
async function fail(e) {
  results.failure = String(e?.stack ?? e);
  const active = browser.contexts().flatMap(c => c.pages()).filter(p => !p.isClosed()).at(-1);
  if (active) await active.screenshot({ path: `${OUT}failure.png`, timeout: 15000 }).catch(() => {});
  writeFileSync(`${OUT}results-failure.json`, JSON.stringify(results, null, 2));
  writeFileSync(`${OUT}console-failure.log`, consoleLog.join('\n'));
  await browser.close().catch(() => {});
  throw e;
};
try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page = await desktop.newPage(); logPage(page);
  await page.goto(url(-10, -14), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__ready && window.__metrics.inspection, null, { timeout: 60000 });
  const beforeDesktop = await readOnlySnapshot(page);
  const waystonePoint = await project(page, 'siteId:site:waystone');
  assert.ok(waystonePoint.visible);
  await page.mouse.move(waystonePoint.x, waystonePoint.y);
  await page.waitForFunction(() => window.__metrics.inspection.hovered === 'Waystone', null, { timeout: 15000 });
  const hover = await card(page);
  assert.equal(hover.mode, 'hover'); assert.equal(hover.selected, null);
  assert.match(hover.description, /cream stone and teal inlay/);
  await page.screenshot({ path: `${OUT}desktop-hover-waystone.png`, timeout: 60000 });
  results.steps.push({ name: 'real mouse hover identifies Waystone', card: hover });
  const pinned = await pin(page, 'siteId:site:waystone', 'Waystone');
  await page.mouse.move(200, 850); await page.waitForTimeout(300);
  assert.equal((await card(page)).name, 'Waystone', 'other hover must not replace pin');
  await page.screenshot({ path: `${OUT}desktop-pinned-waystone.png`, timeout: 60000 });
  await page.locator('#inspect-close').click();
  await page.waitForFunction(() => window.__metrics.inspection.selected === null && document.querySelector('#inspect-card').hidden);
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'CANVAS',
    'Close click must restore focus to the world canvas');
  await pin(page, 'siteId:site:waystone', 'Waystone');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__metrics.inspection.selected === null && document.querySelector('#inspect-card').hidden);
  results.steps.push({ name: 'click pins; Close and Escape dismiss', card: pinned });
  const rock = await pin(page, 'entityId:hero:styl_rock_medium:-6:-10', 'Stone boulder');
  assert.match(rock.description, /intentional pale block-stone/);
  await page.screenshot({ path: `${OUT}desktop-pale-stone.png`, timeout: 60000 });
  await page.keyboard.press('Escape');
  results.steps.push({ name: 'pale blocks identified as persistent resource', card: rock });

  await page.locator('#inspect-toggle').focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('#inspect-objects').hidden);
  const listCount = await page.locator('#inspect-objects button[data-inspect-key]').count();
  assert.equal(listCount, await page.evaluate(() => window.__metrics.inspection.targetCount));
  await page.locator('#inspect-objects button[data-inspect-key="siteId:site:marker"]').focus();
  await page.keyboard.press('Enter');
  assert.equal((await card(page)).name, 'Trail marker');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'inspect-close');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#inspect-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'CANVAS');
  results.steps.push({ name: 'keyboard list, selection, focus and dismissal', listCount });

  const dragPoint = await project(page, 'siteId:site:waystone');
  await page.mouse.move(dragPoint.x, dragPoint.y); await page.mouse.down();
  await page.mouse.move(dragPoint.x + 100, dragPoint.y + 40, { steps: 8 }); await page.mouse.up();
  assert.equal(await page.evaluate(() => window.__metrics.inspection.selected), null, 'drag cannot pin');
  results.steps.push({ name: 'desktop orbit drag does not select' });
  await assertReadOnly(page, beforeDesktop, 'all desktop inspection');
  await desktop.close();

  // Small stone and ore are separate persistent entities, not architecture.
  const paleContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await paleContext.newPage(); logPage(page, 'pale ');
  await page.goto(url(-20, -6, 18, 14, 0, 48), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__ready && window.__metrics.inspection.targets['entityId:hero:styl_cairn:-20:-6'], null, { timeout: 60000 });
  const smallStone = await pin(page, 'entityId:hero:styl_cairn:-20:-6', 'Stone cairn');
  assert.match(smallStone.description, /stacked pile of natural stones/);
  await page.screenshot({ path: `${OUT}desktop-pale-cairn.png`, timeout: 60000 });
  await page.keyboard.press('Escape');
  await paleContext.close();

  const oreContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await oreContext.newPage(); logPage(page, 'ore ');
  await page.goto(url(-38, -42, 20, 14, 0, 48), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__ready && window.__metrics.inspection.targets['entityId:hero:styl_ore:-38:-42'], null, { timeout: 60000 });
  const ore = await pin(page, 'entityId:hero:styl_ore:-38:-42', 'Purple-seam ore deposit');
  assert.match(ore.description, /pale rock host with purple mineral seams/);
  await page.screenshot({ path: `${OUT}desktop-purple-seam-ore.png`, timeout: 60000 });
  await page.keyboard.press('Escape');
  await oreContext.close();

  // Build a real saved farm through accepted UI commands, then inspect its
  // stockpile and crop. Also verify selection survives a life-mesh rebuild.
  const farmContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await farmContext.newPage(); logPage(page, 'farm ');
  await page.goto(url(-14, -8, 22, 78), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__ready && window.__metrics.life, null, { timeout: 60000 });
  for (let i = 0; i < 2; i++) {
    await page.locator('canvas').click({ position: { x: 350, y: 450 } }); await page.keyboard.press('h');
    await page.waitForFunction(n => window.__metrics.inventory.fiber >= n, i + 1, { timeout: 30000 });
  }
  await page.selectOption('#life-deposit-resource', 'fiber');
  await page.locator('#life-deposit-amount').fill('2'); await page.locator('[data-action="deposit"]').click();
  await page.locator('[data-action="produce"][data-recipe="seed"]').click();
  await page.locator('[data-action="tick"][data-ticks="1"]').click();
  await page.locator('[data-project="farm"]').click();
  await page.locator('#build-panel .btn-build').click();
  await page.waitForFunction(() => window.__metrics.inspection.targets['cropId:crop:0'], null, { timeout: 60000 });
  await page.locator('[data-plot="crop:0"]').click();
  await page.locator('[data-action="tick"][data-ticks="4"]').click();
  await page.waitForFunction(() => window.__metrics.life.crops[0]?.ready, null, { timeout: 60000 });
  await page.locator('.drawer-world').click().catch(() => {});
  const raw = await page.evaluate(key => localStorage.getItem(key), KEY);
  const saved = JSON.parse(raw);
  await farmContext.close();

  const savedContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await savedContext.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: KEY, raw });
  page = await savedContext.newPage(); logPage(page, 'saved ');
  await page.goto(url(-33, -38.5, 20, 20, 0, 48), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__ready && window.__metrics.inspection.targets['cropId:crop:0'], null, { timeout: 60000 });
  const cropKey = Object.keys(await page.evaluate(() => window.__metrics.inspection.targets)).find(k => k.startsWith('cropId:'));
  const crop = await pin(page, cropKey, 'Terrace crop plot 1');
  assert.match(crop.facts.join(' '), /Ready to harvest/);
  await page.screenshot({ path: `${OUT}desktop-crop.png`, timeout: 60000 });
  await page.keyboard.press('Escape');
  await savedContext.close();

  const stockContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await stockContext.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: KEY, raw });
  page = await stockContext.newPage(); logPage(page, 'stock ');
  await page.goto(url(-50, -32, 16, 12, 0, 48), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__ready && window.__metrics.inspection.targets['stockpileId:stockpile:founder'], null, { timeout: 60000 });
  const stock = await pin(page, 'stockpileId:stockpile:founder', 'Founder stockpile');
  assert.match(stock.description, /Deposit carried supplies here for processing/);
  assert.match(stock.facts.join(' '), /200/);
  await page.screenshot({ path: `${OUT}desktop-stockpile.png`, timeout: 60000 });
  await page.keyboard.press('Escape');
  const beforeHarvest = await readOnlySnapshot(page);
  await page.locator('#app canvas').focus(); await page.keyboard.press('h');
  await page.waitForFunction(n => window.__metrics.acceptedCommands > n, beforeHarvest.acceptedCommands, { timeout: 30000 });
  results.steps.push({ name: 'dynamic natural mesh refresh retains target identities',
    targetCount: await page.evaluate(() => window.__metrics.inspection.targetCount) });
  await stockContext.close();

  // Verify live-card refresh after a genuine accepted command and mesh rebuild.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  // Seed this fixture once. Reloading must not restore the pre-harvest bytes
  // over the save written by the accepted harvest command above.
  await mobile.addInitScript(({ key, raw }) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
  }, { key: KEY, raw });
  page = await mobile.newPage(); logPage(page, 'mobile ');
  await page.goto(url(-10, -14, 18, 22, 0, 48), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__ready && window.__metrics.inspection, null, { timeout: 60000 });
  await page.locator('.drawer-settlement').click();
  const selectedCropKey = Object.keys(await page.evaluate(() => window.__metrics.inspection.targets)).find(k => k.startsWith('cropId:'));
  await page.locator('#inspect-toggle').click();
  await page.locator(`#inspect-objects button[data-inspect-key="${selectedCropKey}"]`).click();
  assert.match((await card(page)).facts.join(' '), /Ready to harvest/);
  await page.locator(`[data-plot="${selectedCropKey.slice(7)}"]`).click();
  await page.waitForFunction(() => window.__metrics.inspection.selected === 'Terrace crop plot 1'
    && document.querySelector('#inspect-description').textContent.includes('empty tilled'), null, { timeout: 30000 });
  results.steps.push({ name: 'pinned crop refreshes after accepted harvest and life mesh rebuild', card: await card(page) });
  await page.keyboard.press('Escape');
  await page.locator('.drawer-world').click();
  const beforeTouch = await readOnlySnapshot(page);
  // Move the programmatic camera through an ordinary reload, not by dispatching
  // a mutation. A 22 m close view makes narrow mobile crop controls obscure the
  // far resource, so the resource gets its own framing for this real tap.
  await page.goto(url(-6, -10, 18, 22, 0, 48), { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__ready && window.__metrics.inspection, null, { timeout: 60000 });
  // Radio drawers reset to Settlement on a full reload; activate World through
  // the same labelled UI so the Settlement form cannot intercept canvas taps.
  await page.locator('.drawer-world').click();
  assert.equal(await page.locator('#life-panel').isVisible(), false, 'World drawer hides Settlement form');
  const mobileRock = await tap(page, 'entityId:hero:styl_rock_medium:-6:-10', 'Stone boulder');
  const closeRect = await page.locator('#inspect-close').boundingBox();
  assert.ok(closeRect.width >= 44 && closeRect.height >= 44, 'touch close is at least 44 px');
  await page.screenshot({ path: `${OUT}mobile-tap-stone.png`, timeout: 60000 });
  await page.locator('#inspect-close').tap();
  await page.waitForFunction(() => window.__metrics.inspection.selected === null && document.querySelector('#inspect-card').hidden);
  const waystone = await tap(page, 'siteId:site:waystone', 'Waystone');
  await page.screenshot({ path: `${OUT}mobile-tap-waystone.png`, timeout: 60000 });
  await page.locator('#inspect-close').tap();
  await page.waitForFunction(() => window.__metrics.inspection.selected === null && document.querySelector('#inspect-card').hidden);
  const beforeGesture = await readOnlySnapshot(page);
  const session = await mobile.newCDPSession(page);
  const tp = await project(page, 'siteId:site:waystone');
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tp.x, y: tp.y, id: 0 }] });
  for (let i = 1; i <= 8; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tp.x + i * 14, y: tp.y + i * 5, id: 0 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal((await card(page)).hidden, true, 'touch drag must not select');
  await settle(page);
  const pinch = await project(page, 'siteId:site:waystone');
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pinch.x - 20, y: pinch.y, id: 0 }, { x: pinch.x + 20, y: pinch.y, id: 1 }] });
  for (let i = 1; i <= 5; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pinch.x - 20 - i * 8, y: pinch.y + i * 2, id: 0 }, { x: pinch.x + 20 + i * 8, y: pinch.y - i * 2, id: 1 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal((await card(page)).hidden, true, 'pinch must not select');
  assert.deepEqual(await readOnlySnapshot(page), beforeGesture);
  await assertReadOnly(page, beforeTouch, 'mobile taps and gestures');
  results.steps.push({ name: 'emulated real touch tap, Close, drag and pinch', mobileRock, waystone });
  await mobile.close();

  assert.deepEqual(errors, []);
  results.status = 'passed'; results.finishedAt = new Date().toISOString();
  writeFileSync(`${OUT}results.json`, JSON.stringify(results, null, 2));
  writeFileSync(`${OUT}console.log`, consoleLog.join('\n'));
  await browser.close();
  console.log(JSON.stringify({ status: results.status, steps: results.steps.length, errors }, null, 2));
} catch (e) { await fail(e); }
