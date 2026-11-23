import assert from 'node:assert/strict';
import { writeFileSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/ubuntu/.npm/_npx/420ff84f11983ee5/node_modules/playwright/index.js');
const { chromium } = require('playwright');
const root = '/home/ubuntu/as/13_Integration_and_QA/Evidence/M002-founder-visual-browser-20261122';
const base = 'http://127.0.0.1:4173/?freeze=1';
const key = 'astrix:m002:v2:seed:1337';
const browser = await chromium.launch({ headless: true });
appendFileSync(`${root}/run-attempts.log`, `${new Date().toISOString()} starting production verification\n`);
const errors = [];
const results = { environment: 'Headless Chromium / software WebGL against Vite production preview at 127.0.0.1:4173', date: '2026-11-22', bundle: '/assets/index-D0Cff74d.js', checks: [], errors };
function record(name, details) { results.checks.push({ name, ...details }); console.log(`PASS ${name}`); }
async function ready(page, url) {
  page.on('pageerror', (e) => {
    const detail = { page: url, error: String(e) };
    errors.push(detail);
    appendFileSync(`${root}/run-attempts.log`, `PAGEERROR ${JSON.stringify(detail)}\n`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      appendFileSync(`${root}/run-attempts.log`, `${message.type().toUpperCase()} ${url} ${message.text()}\n`);
    }
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 90_000 });
  assert.equal(await page.evaluate(() => document.querySelector('script[type="module"]')?.getAttribute('src')), results.bundle);
  await page.waitForFunction(() => window.__metrics.structures === (new URLSearchParams(location.search).get('action') ? 3 : window.__metrics.structures), undefined, { timeout: 90_000 });
  await page.waitForTimeout(600);
  const view = new URL(url).searchParams;
  if (view.has('tx') && view.has('ty') && view.has('tz')) {
    const camera = await page.evaluate(() => {
      const c = window.__probe.camera;
      return { position: c.position.toArray(), direction: c.getWorldDirection(c.position.clone()).toArray() };
    });
    const actual = camera.position;
    const yaw = Number(view.get('yaw') ?? 38) * Math.PI / 180;
    const pitch = Number(view.get('pitch') ?? 20) * Math.PI / 180;
    const distance = Number(view.get('dist') ?? 78);
    const expected = [
      Number(view.get('tx')) + distance * Math.cos(pitch) * Math.sin(yaw),
      Number(view.get('ty')) + distance * Math.sin(pitch),
      Number(view.get('tz')) + distance * Math.cos(pitch) * Math.cos(yaw),
    ];
    assert.ok(actual.every((value, i) => Math.abs(value - expected[i]) < 1e-8),
      `inspection camera is stale: ${JSON.stringify({ actual, expected })}`);
    const target = ['tx', 'ty', 'tz'].map((k) => Number(view.get(k)));
    const length = Math.hypot(...target.map((v, i) => v - actual[i]));
    const forward = target.map((v, i) => (v - actual[i]) / length);
    assert.ok(camera.direction.every((value, i) => Math.abs(value - forward[i]) < 1e-8),
      `inspection camera direction is stale: ${JSON.stringify({ actual: camera.direction, expected: forward })}`);
  }
}
async function metrics(page) { return page.evaluate(() => window.__metrics); }
async function screenshot(page, name) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${root}/${name}.png`, timeout: 90_000 });
}
async function buildAll(page) {
  for (const [index, id] of ['house', 'path', 'farm'].entries()) {
    await page.locator(`[data-project="${id}"]`).click();
    await page.locator('.btn-build').click();
    await page.waitForFunction((n) => window.__metrics.m2.projectsBuilt === n, index + 1, { timeout: 90_000 });
  }
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await ready(page, `${base}&debug=1&debugMutations=1`);
  const initial = await metrics(page);
  assert.equal(initial.structures, 0);
  assert.equal(initial.save.schema, 2);
  assert.equal(initial.debugMutations, false);
  assert.equal(await page.evaluate(() => ['__world', '__scene'].every((k) => window[k] === undefined)), true);
  await page.keyboard.press('f');
  assert.equal((await metrics(page)).stateHash, initial.stateHash);
  await screenshot(page, 'desktop-genesis');
  record('genesis uses schema 2 and production debug hooks stay inert', { hash: initial.stateHash, save: initial.save });

  await page.keyboard.press('h');
  await page.waitForFunction(() => window.__metrics.acceptedCommands === 1, undefined, { timeout: 90_000 });
  const harvested = await metrics(page);
  assert.equal(harvested.inventory.wood, 28);
  await page.reload({ waitUntil: 'load', timeout: 90_000 });
  await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 90_000 });
  const restoredHarvest = await metrics(page);
  assert.equal(restoredHarvest.stateHash, harvested.stateHash);
  assert.equal(restoredHarvest.save.status, 'restored');
  const boundaryOne = await page.evaluate((k) => localStorage.getItem(k), key);
  record('schema-2 harvest save restores exactly once', { hash: restoredHarvest.stateHash, inventory: restoredHarvest.inventory });

  await buildAll(page);
  await page.locator('[data-project="house"]').count();
  const built = await metrics(page);
  assert.equal(built.acceptedCommands, 4);
  assert.equal(built.structures, 3);
  assert.deepEqual(built.inventory, { ore: 8, stone: 9, wood: 24 });
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
  assert.equal(saved.schema, 2);
  assert.equal(saved.snapshot.schema, 2);
  assert.equal(saved.journal.schema, 2);
  assert.ok(saved.snapshot.structures.every((s) => s.designVersion === 2));
  assert.equal(saved.snapshot.structures.find((s) => s.kind === 'house').modules.length, 19);
  assert.equal(saved.snapshot.structures.find((s) => s.kind === 'path').modules.length, 9);
  assert.equal(saved.journal.entries[0].command.schema, 1);
  assert.ok(saved.journal.entries.slice(1).every((e) => e.command.schema === 2 && e.command.designVersion === 2));
  await screenshot(page, 'desktop-built-ui');
  record('normal UI builds bounded founder structures and stores canonical schema-2 commands', { hash: built.stateHash, inventory: built.inventory, save: built.save, modules: saved.snapshot.structures.map((s) => ({ kind: s.kind, count: s.modules.length })) });

  await page.reload({ waitUntil: 'load', timeout: 90_000 });
  await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 90_000 });
  await page.waitForTimeout(900);
  const restored = await metrics(page);
  assert.equal(restored.stateHash, built.stateHash);
  assert.equal(restored.structures, 3);
  assert.equal(restored.save.status, 'restored');
  await screenshot(page, 'desktop-restored-ui');
  record('browser reload reconstructs exact founder state', { hash: restored.stateHash, accepted: restored.acceptedCommands, rendererCalls: restored.rendererCalls, triangles: restored.rendererTriangles });

  await page.evaluate(({ k, saved, full }) => {
    const tail = JSON.parse(saved); tail.journal = JSON.parse(full).journal;
    localStorage.setItem(k, JSON.stringify(tail));
  }, { k: key, saved: boundaryOne, full: JSON.stringify(saved) });
  await page.reload({ waitUntil: 'load', timeout: 90_000 });
  await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 90_000 });
  const tail = await metrics(page);
  assert.equal(tail.stateHash, built.stateHash);
  record('browser snapshot-tail replay matches the live founder world', { hash: tail.stateHash, accepted: tail.acceptedCommands });
  await context.close();

  const clean = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await clean.addInitScript(({ k, raw }) => localStorage.setItem(k, raw), { k: key, raw: JSON.stringify(saved) });
  const wide = await clean.newPage();
  await ready(wide, `${base}&ui=0&t=0.42&yaw=38&pitch=23&dist=78&tx=-43&ty=14&tz=-41&radius=4`);
  assert.equal((await metrics(wide)).stateHash, built.stateHash);
  await screenshot(wide, 'wide-daylight');
  record('wide daylight restores voxel terrain and founder construction', { camera: await wide.evaluate(() => ({ position: window.__probe.camera.position.toArray(), shadowEnabled: window.__probe.renderer.shadowMap.enabled })) });

  const close = await clean.newPage();
  await wide.close();
  await ready(close, `${base}&ui=0&t=0.5&yaw=65&pitch=15&dist=18&tx=-56.5&ty=12.6&tz=-41.5&radius=2`);
  assert.equal((await metrics(close)).stateHash, built.stateHash);
  await screenshot(close, 'close-house-openings');
  record('close south/east facade inspection rendered', { camera: await close.evaluate(() => ({ position: window.__probe.camera.position.toArray(), target: [-56.5, 12.6, -41.5] })) });
  await close.close();

  const farm = await clean.newPage();
  await ready(farm, `${base}&ui=0&t=0.42&yaw=25&pitch=40&dist=23&tx=-32&ty=15&tz=-38&radius=2`);
  assert.equal((await metrics(farm)).stateHash, built.stateHash);
  await screenshot(farm, 'close-farm-crops');
  record('faceted crop and stepped terrace inspection rendered');
  await clean.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await mobile.addInitScript(({ k, raw }) => localStorage.setItem(k, raw), { k: key, raw: JSON.stringify(saved) });
  const phone = await mobile.newPage();
  await ready(phone, `${base}&t=0.42&yaw=38&pitch=23&dist=82&tx=-43&ty=14&tz=-41&radius=3`);
  assert.equal((await metrics(phone)).stateHash, built.stateHash);
  const panel = await phone.locator('#build-panel').boundingBox();
  assert.ok(panel.x >= 0 && panel.x + panel.width <= 390.5);
  assert.ok(panel.y >= 0 && panel.y + panel.height <= 844.5);
  await screenshot(phone, 'mobile-built-ui');
  await phone.locator('[data-project="house"]').click();
  await screenshot(phone, 'mobile-house-inspection');
  record('mobile founder world and project inspection fit viewport', { panel, hash: (await metrics(phone)).stateHash });
  await mobile.close();

  assert.deepEqual(errors, []);
  results.disposition = 'Production-browser implementation evidence only; not art acceptance or formal M002 closure.';
  writeFileSync(`${root}/results.json`, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  results.failure = String(error.stack || error);
  writeFileSync(`${root}/results-failure.json`, JSON.stringify(results, null, 2) + '\n');
  console.error(error);
  process.exitCode = 1;
} finally { await browser.close(); }
