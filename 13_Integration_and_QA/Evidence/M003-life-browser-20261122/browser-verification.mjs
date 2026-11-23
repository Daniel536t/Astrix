// Production-only, actual-DOM verification of the schema-3 playable life loop.
// No mutable simulation handles or direct dispatch are used.
import { chromium } from '/home/ubuntu/as/08_Technical_Director/Project_Setup/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const OUT = new globalThis.URL('./', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const GAME_URL = 'http://127.0.0.1:4173/?seed=1337&freeze=1&tx=-14&tz=-8&ty=22&dist=78';
const KEY = 'astrix:m002:v3:seed:1337';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
const consoleLog = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { consoleLog.push(`${m.type()}: ${m.text()}`); if (m.type() === 'error') errors.push(m.text()); });
const results = { startedAt: new Date().toISOString(), authority: 'local-stub / local-simulation-only', url: GAME_URL, browser: 'Chromium + SwiftShader (software WebGL)', steps: [], errors };
const fail = async e => {
  results.failure = String(e?.stack ?? e);
  // Desktop is deliberately closed before mobile starts. Capture the current
  // live page, and never let secondary diagnostics mask the original failure.
  const active = browser.contexts().flatMap(c => c.pages()).filter(p => !p.isClosed()).at(-1);
  const stamp = new Date().toISOString().replaceAll(':', '-');
  if (active) await active.screenshot({ path: `${OUT}failure-${stamp}.png`, timeout: 15000 })
    .catch(captureError => { results.failureCapture = String(captureError); });
  writeFileSync(`${OUT}results-failure-${stamp}.json`, JSON.stringify(results, null, 2));
  writeFileSync(`${OUT}console-failure-${stamp}.log`, consoleLog.join('\n'));
  await browser.close().catch(() => {});
  throw e;
};
try {
  const metrics = () => page.evaluate(() => window.__metrics);
  const poll = (fn, arg = null) => page.waitForFunction(fn, arg, { timeout: 30000 });
  const click = async selector => {
    await page.locator(selector).scrollIntoViewIfNeeded();
    await page.locator(selector).click();
  };
  const step = async (name, expected) => {
    await poll(expected => window.__metrics.acceptedCommands === expected, expected);
    const m = await metrics();
    assert.equal(m.acceptedCommands, expected, `${name} accepted command sequence`);
    assert.equal(m.save.persistent, true, `${name} must save`);
    assert.equal(m.save.status, 'saved', `${name} persistence status`);
    results.steps.push({ name, acceptedCommands: m.acceptedCommands, stateHash: m.stateHash, tick: m.life.tick, inventory: m.inventory, stockpile: m.life.stockpile, lastAction: m.lastAction });
  };
  await page.goto(GAME_URL, { waitUntil: 'load', timeout: 60000 });
  await poll(() => window.__ready === true && window.__metrics.life);
  assert.equal(await page.locator('#life-panel').isVisible(), true);
  await page.screenshot({ path: `${OUT}desktop-genesis.png`, timeout: 60000 });
  const genesisMetrics = await metrics();
  assert.equal(genesisMetrics.acceptedCommands, 0, 'fresh world has no accepted commands');
  assert.equal(genesisMetrics.save.status, 'new', 'fresh world has not yet been saved');
  assert.equal(genesisMetrics.save.persistent, false, 'a fresh world is not falsely reported as persisted');
  results.steps.push({ name: 'fresh world before first save', acceptedCommands: 0,
    save: genesisMetrics.save, stateHash: genesisMetrics.stateHash });

  // Normal keyboard action, not a test-only command or camera helper.
  await page.locator('canvas').click({ position: { x: 350, y: 450 } });
  await page.keyboard.press('h');
  await poll(() => window.__metrics.inventory.fiber >= 1);
  await page.keyboard.press('h');
  await poll(() => window.__metrics.inventory.fiber >= 2);
  assert.equal((await metrics()).inventory.fiber, 2);
  assert.match((await metrics()).persistenceMessage, /saved/i);
  results.steps.push({ name: 'two keyboard harvests', acceptedCommands: 2, inventory: (await metrics()).inventory, save: (await metrics()).save, lastAction: (await metrics()).lastAction });

  await page.selectOption('#life-deposit-resource', 'fiber');
  await page.locator('#life-deposit-amount').fill('2');
  await click('[data-action="deposit"]');
  assert.equal(await page.inputValue('#life-deposit-resource'), 'fiber');
  await step('deposit two fiber', 3);
  await click('[data-action="produce"][data-recipe="seed"]');
  await step('start seed job', 4);
  assert.equal((await metrics()).life.jobs.length, 1);
  await click('[data-action="tick"][data-ticks="1"]');
  await step('finish seeds', 5);
  assert.equal((await metrics()).life.stockpile.inventory.seed, 3);

  await click('[data-project="farm"]');
  await click('#build-panel .btn-build');
  await step('build farm with carried resources', 6);
  await click('[data-plot="crop:0"]');
  await step('plant crop zero', 7);
  assert.equal((await metrics()).life.crops[0].ready, false);
  await click('[data-action="tick"][data-ticks="4"]');
  await step('grow crop in exactly four ticks', 8);
  assert.equal((await metrics()).life.crops[0].ready, true);
  assert.equal((await page.locator('[data-plot="crop:0"]').getAttribute('data-action')), 'harvest_crop');
  await page.screenshot({ path: `${OUT}desktop-ready-crop.png`, timeout: 60000 });
  await click('[data-plot="crop:0"]');
  await step('harvest food and fiber into carried bag', 9);
  assert.equal((await metrics()).inventory.food, 6);
  assert.equal((await metrics()).inventory.fiber, 1);
  await page.selectOption('#life-deposit-resource', 'food');
  await page.locator('#life-deposit-amount').fill('2');
  await click('[data-action="deposit"]');
  await step('deposit food', 10);
  await click('[data-action="produce"][data-recipe="rations"]');
  await step('start ration production', 11);
  await click('[data-action="tick"][data-ticks="1"]');
  await step('rations unfinished after one tick', 12);
  assert.equal((await metrics()).life.jobs[0].remainingTicks, 1);
  await click('[data-action="tick"][data-ticks="1"]');
  await step('rations finished after second tick', 13);
  assert.equal((await metrics()).life.stockpile.inventory.rations, 3);
  await page.selectOption('#life-withdraw-resource', 'rations');
  await page.locator('#life-withdraw-amount').fill('2');
  await click('[data-action="withdraw"]');
  await step('withdraw two rations', 14);
  assert.equal((await metrics()).inventory.rations, 2);
  const beforeReload = await metrics();
  const savedRaw = await page.evaluate(key => localStorage.getItem(key), KEY);
  assert.ok(savedRaw);
  const saved = JSON.parse(savedRaw);
  assert.equal(saved.schema, 3);
  assert.equal(saved.snapshot.nextSequence, 14, 'snapshot boundary uses the next accepted sequence');
  const acceptedJournal = saved.journal.entries.map(e => e.command.type);
  assert.deepEqual(acceptedJournal, ['harvest','harvest','deposit','produce','tick','build','plant','tick','harvest_crop','deposit','produce','tick','tick','withdraw']);

  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await poll(() => window.__ready === true && window.__metrics.save.status === 'restored');
  const restored = await metrics();
  assert.equal(restored.stateHash, beforeReload.stateHash);
  assert.deepEqual(restored.inventory, beforeReload.inventory);
  assert.deepEqual(restored.life, beforeReload.life);
  assert.equal(restored.acceptedCommands, 14);
  await page.screenshot({ path: `${OUT}desktop-restored.png`, timeout: 60000 });
  results.restored = { stateHash: restored.stateHash, save: restored.save, life: restored.life, inventory: restored.inventory };

  // Save/reload has exercised the persisted snapshot. Replay-from-genesis and
  // snapshot-tail equivalence are separately covered by m003.life.test.ts.

  // Keyboard must not alter simulation or steer while a number input has focus.
  const beforeTyping = (await metrics()).stateHash;
  await page.locator('#life-deposit-amount').focus();
  await page.keyboard.press('h');
  await page.waitForTimeout(200);
  assert.equal((await metrics()).stateHash, beforeTyping);
  results.keyboardGuard = true;

  // Do not run two continuously animating WebGL2 worlds in one software GPU
  // process. This is a harness isolation boundary, not a production setting.
  await context.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await mobileContext.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key: KEY, raw: savedRaw });
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', e => errors.push(String(e)));
  mobile.on('console', m => { consoleLog.push(`mobile ${m.type()}: ${m.text()}`); if (m.type() === 'error') errors.push(m.text()); });
  await mobile.goto(GAME_URL, { waitUntil: 'load', timeout: 60000 });
  await mobile.waitForFunction(() => window.__ready === true && window.__metrics.save.status === 'restored', null, { timeout: 60000 });
  assert.equal(await mobile.locator('#life-panel').isVisible(), true);
  await mobile.locator('.drawer-build').click();
  assert.equal(await mobile.locator('#build-panel').isVisible(), true);
  assert.equal(await mobile.locator('#life-panel').isVisible(), false);
  await mobile.locator('.drawer-world').click();
  assert.equal(await mobile.locator('#life-panel').isVisible(), false);
  assert.equal(await mobile.locator('#gather-nearest').isVisible(), true);
  await mobile.screenshot({ path: `${OUT}mobile-restored-world.png`, timeout: 60000 });
  await mobile.locator('.drawer-settlement').click();
  assert.equal(await mobile.locator('#life-panel').isVisible(), true);
  await mobile.locator('[data-action="tick"][data-ticks="1"]').click();
  await mobile.waitForFunction(() => window.__metrics.life.tick === 8 && window.__metrics.acceptedCommands === 15);
  await mobile.screenshot({ path: `${OUT}mobile-settlement.png`, timeout: 60000 });
  results.mobile = { viewport: [390,844], tabs: true, gatherButton: true, tickAccepted: true, physicalDeviceTested: false };
  await mobileContext.close();

  // Reject storage writes only after genesis has loaded. The simulation command
  // remains accepted, but the UI must never claim this volatile work was saved.
  const failureContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await failureContext.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('astrix:')) throw new DOMException('Injected quota failure', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  const failurePage = await failureContext.newPage();
  failurePage.on('pageerror', e => errors.push(String(e)));
  await failurePage.goto(GAME_URL, { waitUntil: 'load', timeout: 60000 });
  await failurePage.waitForFunction(() => window.__ready === true && window.__metrics.save.status === 'new');
  await failurePage.click('[data-action="tick"][data-ticks="1"]');
  await failurePage.waitForFunction(() => window.__metrics.save.status === 'unavailable'
    && window.__metrics.acceptedCommands === 1 && window.__metrics.life.tick === 1);
  const volatile = await failurePage.evaluate(() => window.__metrics);
  assert.equal(volatile.save.persistent, false);
  assert.match(volatile.save.message, /Save failed: Injected quota failure.*not safely persisted/);
  assert.match(volatile.persistenceMessage, /Save failed: Injected quota failure/);
  assert.match(volatile.lastAction, /Advanced 1 simulation tick · Save failed: Injected quota failure/);
  assert.equal(await failurePage.locator('#toast').getAttribute('class'), 'toast show bad');
  assert.match(await failurePage.locator('#toast').innerText(), /Save failed: Injected quota failure/);
  const failureRaw = await failurePage.evaluate(key => localStorage.getItem(key), KEY);
  assert.equal(failureRaw, null, 'the failed save must leave storage untouched');
  await failurePage.screenshot({ path: `${OUT}desktop-save-failure.png`, timeout: 60000 });
  results.injectedStorageFailure = { acceptedInMemory: true, persistent: false,
    failureVisible: true, originalBytesUntouched: true };
  await failureContext.close();
  assert.deepEqual(errors, []);
  results.status = 'passed';
  results.finishedAt = new Date().toISOString();
  writeFileSync(`${OUT}results.json`, JSON.stringify(results, null, 2));
  writeFileSync(`${OUT}console.log`, consoleLog.join('\n'));
  await browser.close();
  console.log(JSON.stringify({ status: results.status, steps: results.steps.length, restoredHash: restored.stateHash, errors }, null, 2));
} catch (e) { await fail(e); }
