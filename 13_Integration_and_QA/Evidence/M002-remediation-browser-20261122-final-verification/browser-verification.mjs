import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/ubuntu/.npm/_npx/420ff84f11983ee5/node_modules/playwright/index.js');
const { chromium } = require('playwright');
const root = '/home/ubuntu/as/13_Integration_and_QA/Evidence/M002-remediation-browser-20261122-final-verification';
mkdirSync(root);
const base = 'http://127.0.0.1:4173/?freeze=1';
const key = 'astrix:m002:v1:seed:1337';
const browser = await chromium.launch({ headless: true });
const errors = [];
const results = { environment: 'Chromium against Vite production build at 127.0.0.1:4173', date: '2026-11-22', checks: [], errors };
function record(name, details) { results.checks.push({ name, ...details }); }
async function refreshed(page, predicate = () => true, argument) {
  await page.waitForFunction(({ serialized, argument }) => {
    const m = window.__metrics;
    return Function('m', 'argument', `return (${serialized})(m, argument)`)(m, argument);
  }, { serialized: predicate.toString(), argument }, { timeout: 10_000 });
  return page.evaluate(() => window.__metrics);
}
async function ready(page, url) {
  page.on('pageerror', (e) => errors.push({ page: url, error: String(e) }));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 90_000 });
  await page.waitForTimeout(400);
}
async function buildAll(page) {
  for (const [index, id] of ['house', 'path', 'farm'].entries()) {
    await page.locator(`[data-project="${id}"]`).click();
    await page.locator('.btn-build').click();
    await refreshed(page, (m, expected) => m.m2.projectsBuilt === expected, index + 1);
    assert.equal(await page.evaluate(() => window.__metrics.m2.lastBuild.startsWith('Unexpected')), false);
  }
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await ready(page, `${base}&debug=1&debugMutations=1`);
  let initial = await page.evaluate(() => window.__metrics);
  assert.deepEqual(initial.inventory, { stone: 48, wood: 24 });
  assert.equal(initial.acceptedCommands, 0);
  assert.equal(initial.edits, 0);
  assert.equal(initial.structures, 0);
  assert.equal(initial.debugMutations, false);
  assert.equal(await page.evaluate(() => ['__world', '__scene'].every((k) => window[k] === undefined)), true);
  await page.keyboard.press('f');
  await page.keyboard.press('g');
  await page.waitForTimeout(300);
  let blocked = await page.evaluate(() => window.__metrics);
  assert.equal(blocked.edits, 0);
  assert.equal(blocked.stateHash, initial.stateHash);
  assert.equal(blocked.acceptedCommands, 0);
  record('production blocks raw debug state and F/G/debugMutations', { beforeHash: initial.stateHash, afterHash: blocked.stateHash, acceptedCommands: blocked.acceptedCommands });
  await page.screenshot({ path: `${root}/desktop-genesis.png` });

  await page.keyboard.press('h');
  await page.waitForTimeout(350);
  const harvested = await refreshed(page, m => m.acceptedCommands === 1);
  assert.equal(harvested.acceptedCommands, 1);
  assert.equal(harvested.inventory.wood, 28);
  assert.equal(harvested.harvested, 1);
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
  assert.equal(saved.schema, 1);
  assert.equal(saved.snapshot.nextSequence, 1);
  assert.equal(saved.journal.entries.length, 1);
  assert.equal(saved.journal.entries[0].command.type, 'harvest');
  record('browser harvest dispatches and atomically saves', { hash: harvested.stateHash, inventory: harvested.inventory, sequence: harvested.acceptedCommands, journal: saved.journal });

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 90_000 });
  await page.waitForTimeout(400);
  const harvestRestored = await page.evaluate(() => window.__metrics);
  assert.equal(harvestRestored.stateHash, harvested.stateHash);
  assert.equal(harvestRestored.inventory.wood, 28);
  assert.equal(harvestRestored.acceptedCommands, 1);
  assert.equal(harvestRestored.save.status, 'restored');
  assert.equal(harvestRestored.harvested, 1);
  record('harvest snapshot restores exactly once without duplicate starter grant', { hash: harvestRestored.stateHash, inventory: harvestRestored.inventory, save: harvestRestored.save });

  // Exercise snapshot-tail transport without using a writable simulation hook.
  const boundaryOne = await page.evaluate((k) => localStorage.getItem(k), key);
  await buildAll(page);
  const built = await page.evaluate(() => window.__metrics);
  assert.equal(built.acceptedCommands, 4);
  assert.equal(built.structures, 3);
  assert.equal(built.m2.projectsBuilt, 3);
  const boundaryFour = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
  assert.equal(built.inventory.wood, 24);
  assert.equal(boundaryFour.snapshot.nextSequence, 4);
  assert.equal(boundaryFour.journal.entries.length, 4);
  await page.evaluate((k) => localStorage.removeItem(k), key);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 90_000 });
  const newWorld = await page.evaluate(() => window.__metrics);
  assert.equal(newWorld.structures, 0);
  assert.deepEqual(newWorld.inventory, { stone: 48, wood: 24 });
  await page.evaluate(({ k, raw }) => localStorage.setItem(k, raw), { k: key, raw: boundaryOne });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 90_000 });
  const snapshotTail = await page.evaluate(() => window.__metrics);
  assert.equal(snapshotTail.stateHash, harvested.stateHash);
  assert.equal(snapshotTail.acceptedCommands, 1);
  record('saved record clears and snapshot-tail boundary restores', { before: { structures: built.structures, accepted: built.acceptedCommands }, cleared: { structures: newWorld.structures, inventory: newWorld.inventory }, restoredHash: snapshotTail.stateHash });

  await page.evaluate(({ k, raw }) => localStorage.setItem(k, raw), { k: key, raw: JSON.stringify(boundaryFour) });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 90_000 });
  await page.waitForTimeout(400);
  const restoredAll = await page.evaluate(() => window.__metrics);
  // Initial wood 24 + harvest 4 + farm preparation 12 - project costs 16.
  assert.equal(restoredAll.stateHash, built.stateHash);
  assert.equal(restoredAll.structures, 3);
  assert.equal(restoredAll.inventory.wood, 24);
  assert.equal(restoredAll.inventory.stone, 9);
  assert.equal(restoredAll.save.status, 'restored');
  await page.screenshot({ path: `${root}/desktop-restored-all.png` });
  record('desktop restored house/path/farm', { hash: restoredAll.stateHash, inventory: restoredAll.inventory, structures: restoredAll.structures, save: restoredAll.save, metrics: restoredAll });

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await mobile.addInitScript(({ k, raw }) => localStorage.setItem(k, raw), { k: key, raw: JSON.stringify(boundaryFour) });
  const phone = await mobile.newPage();
  await ready(phone, `${base}&ui=0`);
  const mobileMetrics = await phone.evaluate(() => window.__metrics);
  assert.equal(mobileMetrics.stateHash, built.stateHash);
  assert.equal(mobileMetrics.structures, 3);
  await phone.screenshot({ path: `${root}/mobile-restored-all.png` });
  record('mobile clean view restores built world', { hash: mobileMetrics.stateHash, structures: mobileMetrics.structures });

  await phone.close();
  const phoneUi = await mobile.newPage();
  await ready(phoneUi, base);
  const bounds = await phoneUi.locator('#build-panel').boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390.5);
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 844.5);
  await phoneUi.screenshot({ path: `${root}/mobile-restored-ui.png` });
  record('mobile interface fits viewport', { viewport: { width: 390, height: 844 }, panel: bounds });
  await mobile.close();

  // Save-tail: restore boundary 1 with all four accepted journal commands.
  await page.evaluate(({ k, saved, full }) => {
    const tail = JSON.parse(saved); tail.journal = JSON.parse(full).journal;
    localStorage.setItem(k, JSON.stringify(tail));
  }, { k: key, saved: boundaryOne, full: JSON.stringify(boundaryFour) });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 90_000 });
  const replayTail = await page.evaluate(() => window.__metrics);
  assert.equal(replayTail.stateHash, built.stateHash);
  assert.equal(replayTail.structures, 3);
  record('browser snapshot-tail replay matches live', { expected: built.stateHash, actual: replayTail.stateHash, sequence: replayTail.acceptedCommands });

  // A rejected record is quarantined byte-for-byte, not silently discarded.
  const corrupt = '{broken';
  await page.evaluate(({ k, corrupt }) => localStorage.setItem(k, corrupt), { k: key, corrupt });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, undefined, { timeout: 90_000 });
  const corruptResult = await page.evaluate((k) => ({ metrics: window.__metrics, corrupt: localStorage.getItem(k + ':corrupt'), save: localStorage.getItem(k) }), key);
  assert.equal(corruptResult.metrics.save.status, 'corrupt');
  assert.equal(corruptResult.corrupt, corrupt);
  assert.equal(corruptResult.save, null);
  assert.deepEqual(corruptResult.metrics.inventory, { stone: 48, wood: 24 });
  record('browser rejects and quarantines corrupt save', { status: corruptResult.metrics.save.status, quarantined: corruptResult.corrupt, originalKeyCleared: corruptResult.save === null });

  // Start the fault-injection check from a clean session after closing the desktop renderer.
  await page.close();
  const fresh = await context.newPage();
  await ready(fresh, base);
  await fresh.evaluate((k) => { localStorage.removeItem(k); localStorage.removeItem(k + ':corrupt'); }, key);
  await fresh.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
  await fresh.waitForFunction(() => window.__ready === true, undefined, { timeout: 90_000 });
  await fresh.evaluate((k) => {
    Storage.prototype.setItem = function (name, value) { if (name === k) throw new DOMException('QA quota', 'QuotaExceededError'); };
  }, key);
  await fresh.locator('[data-project="house"]').click();
  await fresh.locator('.btn-build').click();
  const quota = await refreshed(fresh, m => m.acceptedCommands === 1 && m.structures === 1);
  assert.equal(quota.structures, 1);
  assert.equal(quota.save.persistent, false);
  assert.match(quota.save.message, /Latest accepted work is not safely persisted/);
  assert.equal(quota.save.status, 'unavailable');
  record('browser storage fault keeps game usable but reports volatile work', { structures: quota.structures, accepted: quota.acceptedCommands, save: quota.save });

  const dig = await context.newPage();
  await ready(dig, `${base}&action=dig&debug=1&debugMutations=1`);
  const digMetrics = await dig.evaluate(() => window.__metrics);
  assert.equal(digMetrics.edits, 0);
  assert.equal(digMetrics.acceptedCommands, 0);
  assert.equal(await dig.evaluate(() => window.__world === undefined), true);
  record('production action=dig ignored even with debug requests', { edits: digMetrics.edits, acceptedCommands: digMetrics.acceptedCommands });

  await dig.close();
  await fresh.close();
  const scriptedContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const scripted = await scriptedContext.newPage();
  await ready(scripted, `${base}&action=build`);
  const scriptedMetrics = await refreshed(scripted, m => m.structures === 3);
  assert.equal(scriptedMetrics.structures, 3);
  assert.equal(scriptedMetrics.acceptedCommands, 3);
  const scriptedSave = await scripted.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
  assert.equal(scriptedSave.schema, 1);
  assert.deepEqual(scriptedSave.journal.entries.map((e) => e.sequence), [0, 1, 2]);
  assert.equal(await scripted.evaluate(() => !!window.__probe.renderer.isWebGLRenderer), true);
  await scripted.screenshot({ path: `${root}/desktop-scripted-build.png` });
  record('scripted build uses accepted commands and persists', { structures: scriptedMetrics.structures, sequence: scriptedMetrics.acceptedCommands, hash: scriptedMetrics.stateHash, journalSequences: scriptedSave.journal.entries.map((e) => e.sequence) });
  await context.close();

  assert.deepEqual(errors, []);
  results.disposition = 'Browser checks passed; not a formal closure approval.';
  writeFileSync(`${root}/results.json`, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  results.failure = String(error.stack || error);
  writeFileSync(`${root}/results-failure.json`, JSON.stringify(results, null, 2) + '\n');
  console.error(error);
  process.exitCode = 1;
} finally { await browser.close(); }
