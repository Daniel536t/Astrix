// One bounded production viewport capture after ordinary Build-button use.
// No direct dispatch, mutable simulation handle, or action URL is used.
import { chromium } from '/home/ubuntu/as/08_Technical_Director/Project_Setup/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const OUT = new URL('./', import.meta.url).pathname;
const suffix = new Date().toISOString().replaceAll(':', '-');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const results = { scope: 'actual built founder structures through production Build controls',
  browser: 'Chromium / SwiftShader software WebGL', errors: [], failedResponses: [],
  steps: [], startedAt: new Date().toISOString(), status: 'failed' };
function step(text) { results.steps.push(text); console.log(text); }
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', e => results.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') results.errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) results.failedResponses.push({ url: r.url(), status: r.status() }); });
  await page.goto('http://18.116.53.201/?seed=1337&freeze=1&tx=-38&tz=-42&ty=17&dist=48&pitch=38',
    { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__ready === true && window.__metrics.inspection?.targetCount > 0,
    null, { timeout: 60000 });
  step('genesis ready');
  for (const [project, commands] of [['house', 1], ['path', 2], ['farm', 3]]) {
    await page.locator(`[data-project="${project}"]`).click();
    await page.locator('#build-panel .btn-build').click();
    await page.waitForFunction(n => window.__metrics.acceptedCommands === n && window.__metrics.save.status === 'saved',
      commands, { timeout: 45000 });
    step(`accepted and saved ${project}`);
  }
  results.built = await page.evaluate(() => ({ structures: window.__metrics.structures,
    commands: window.__metrics.acceptedCommands, inventory: window.__metrics.inventory,
    stockpile: window.__metrics.life.stockpile.inventory, hash: window.__metrics.stateHash,
    save: window.__metrics.save }));
  if (results.built.structures !== 3 || results.built.commands !== 3 || !results.built.save.persistent) {
    throw new Error('built settlement persistence assertion failed');
  }
  const cdp = await page.context().newCDPSession(page);
  const capture = cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const timeout = new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('bounded CDP viewport capture timeout')), 30000);
    timer.unref();
  });
  try {
    const image = await Promise.race([capture, timeout]);
    const name = `production-built-founder-settlement-${suffix}.png`;
    writeFileSync(OUT + name, Buffer.from(image.data, 'base64'));
    results.capture = name;
    results.status = results.errors.length || results.failedResponses.length ? 'capture-with-browser-errors' : 'captured';
    step('viewport capture succeeded');
  } catch (error) {
    results.captureFailure = String(error?.stack ?? error);
    step('capture failed');
  }
} catch (error) {
  results.failure = String(error?.stack ?? error);
  console.error(error);
  process.exitCode = 1;
} finally {
  results.finishedAt = new Date().toISOString();
  writeFileSync(`${OUT}focused-founder-capture-${suffix}.json`, JSON.stringify(results, null, 2));
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}
