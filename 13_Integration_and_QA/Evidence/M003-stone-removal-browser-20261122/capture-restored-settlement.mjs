// Bounded production founder-structure persistence visual capture.
// All mutations use normal Build UI; the reload uses only persisted localStorage.
import { chromium } from '/home/ubuntu/as/08_Technical_Director/Project_Setup/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const suffix = new Date().toISOString().replaceAll(':', '-');
const OUT = new URL('./', import.meta.url).pathname;
const result = { scope: 'built founder settlement before and after genuine production reload',
  startedAt: new Date().toISOString(), errors: [], responseFailures: [], screenshots: [], steps: [] };
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1,
 });
page.on('pageerror', e => result.errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') result.errors.push(m.text()); });
page.on('response', r => { if (r.status() >= 400) result.responseFailures.push({ url: r.url(), status: r.status() }); });
async function capture(label) {
  const timeout = new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: capture exceeded 30 seconds`)), 30000);
    timer.unref();
  });
  try {
    const cdp = await page.context().newCDPSession(page);
    const image = await Promise.race([
      cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true }), timeout,
    ]);
    const filename = `${label}-${suffix}.png`;
    writeFileSync(OUT + filename, Buffer.from(image.data, 'base64'));
    result.screenshots.push({ phase: label, filename });
  } catch (error) {
    result.captureFailure = String(error?.message ?? error);
    throw error;
  }
}
async function state(label) {
  const m = await page.evaluate(() => ({
    entities: window.__metrics.entities, chunksGenerated: window.__metrics.chunksGenerated,
    stateHash: window.__metrics.stateHash, structures: window.__metrics.structures,
    inventory: window.__metrics.inventory, life: window.__metrics.life,
    acceptedCommands: window.__metrics.acceptedCommands, save: window.__metrics.save,
    structureNames: Object.values(window.__metrics.inspection.targets)
      .filter(t => t.ref.structureId).map(t => t.name).sort(),
  }));
  result.steps.push({ phase: label, ...m });
  return m;
}
try {
  const url = 'http://18.116.53.201/?seed=1337&freeze=1&tx=-38&tz=-42&ty=17&dist=48&pitch=38';
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__ready === true && window.__metrics.inspection?.targetCount > 0,
    null, { timeout: 60000 });
  for (const [project, commands] of [['house', 1], ['path', 2], ['farm', 3]]) {
    await page.locator(`[data-project="${project}"]`).click();
    await page.locator('#build-panel .btn-build').click();
    await page.waitForFunction(n => window.__metrics.acceptedCommands === n
      && window.__metrics.save.status === 'saved', commands, { timeout: 45000 });
  }
  const built = await state('built');
  // The game applies the post-build settlement camera immediately. Confirm the
  // actual read-only world-space target rather than infer it from save metrics.
  result.camera = await page.evaluate(() => {
    const camera = window.__probe.camera;
    return { position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: camera.position.clone().addScaledVector(camera.getWorldDirection(camera.position.clone()), 72) };
  });
  for (const [axis, expected] of [['x', -43], ['y', 14], ['z', -41]]) {
    assert.ok(Math.abs(result.camera.target[axis] - expected) < 0.0001,
      `the real settlement camera ${axis} must equal ${expected}`);
  }
  await page.waitForTimeout(1500);
  assert.equal(built.structures, 3);
  assert.equal(built.acceptedCommands, 3);
  assert.equal(built.save.persistent, true);
  assert.deepEqual(built.inventory, { stone: 9, wood: 20, ore: 8 });
  const key = 'astrix:m002:v3:seed:1337';
  const savedRaw = await page.evaluate(k => localStorage.getItem(k), key);
  assert.ok(savedRaw);
  await capture('production-built-founder-settlement');
  await page.reload({ waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__ready === true && window.__metrics.save.status === 'restored'
    && window.__metrics.inspection?.targetCount > 0, null, { timeout: 60000 });
  const restored = await state('restored');
  assert.equal(restored.stateHash, built.stateHash);
  assert.equal(restored.structures, 3);
  assert.equal(restored.acceptedCommands, 3);
  assert.deepEqual(restored.structureNames, built.structureNames);
  assert.deepEqual(restored.inventory, built.inventory);
  assert.deepEqual(restored.life, built.life);
  assert.equal(await page.evaluate(k => localStorage.getItem(k), key), savedRaw);
  await capture('production-restored-founder-settlement');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.responseFailures, []);
  result.status = 'captured';
} catch (error) {
  result.status = 'failed';
  result.failure = String(error?.stack ?? error);
  process.exitCode = 1;
} finally {
  result.finishedAt = new Date().toISOString();
  writeFileSync(new URL(`restored-founder-capture-${suffix}.json`, import.meta.url).pathname,
    JSON.stringify(result, null, 2));
  await browser.close();
  console.log(JSON.stringify(result, null, 2));
}
