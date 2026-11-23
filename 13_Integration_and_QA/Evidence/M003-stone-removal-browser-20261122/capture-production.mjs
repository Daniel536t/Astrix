// Read-only production views using CDP capture; no mutable simulation handles.
import { chromium } from '/home/ubuntu/as/08_Technical_Director/Project_Setup/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = '/home/ubuntu/as/13_Integration_and_QA/Evidence/M003-stone-removal-browser-20261122/';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const results = {
  scope: 'read-only production visual captures',
  browser: 'Chromium / SwiftShader software WebGL',
  captures: [], errors: [], failedResponses: [],
};
async function capture(page, name) {
  const cdp = await page.context().newCDPSession(page);
  const image = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(out + name, Buffer.from(image.data, 'base64'));
  results.captures.push(name);
  console.log('captured ' + name);
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', e => results.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') results.errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) results.failedResponses.push({ url: r.url(), status: r.status() }); });
  await page.goto('http://18.116.53.201/?seed=1337&freeze=1&tx=-14&tz=-8&ty=22&dist=78',
    { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await capture(page, 'production-removal-desktop.png');
  for (const [key, name, expected] of [
    ['entityId:hero:styl_cairn:-20:-6', 'production-cairn-desktop.png', 'Stone cairn'],
    ['entityId:hero:styl_ore:-38:-42', 'production-ore-desktop.png', 'Purple-seam ore deposit'],
    ['siteId:site:waystone', 'production-waystone-desktop.png', 'Waystone'],
  ]) {
    await page.locator('#inspect-toggle').click();
    await page.locator(`[data-inspect-key="${key}"]`).click();
    await page.waitForFunction(expected => window.__metrics.inspection.selected === expected, expected);
    if (await page.locator('#inspect-name').innerText() !== expected) throw new Error('wrong inspection ' + expected);
    await capture(page, name);
    await page.locator('#inspect-close').click();
  }
  await page.locator('#inspect-toggle').click();
  await page.locator('[data-project="house"]').click();
  await page.waitForSelector('.build-detail .detail-desc', { state: 'visible' });
  await capture(page, 'production-founder-house-preview-desktop.png');
  results.genesisInventory = await page.evaluate(() => window.__metrics.inventory);
  results.stateHash = await page.evaluate(() => window.__metrics.stateHash);
  results.retiredNamesVisible = await page.evaluate(() => document.body.innerText.includes('Stone Boulder')
    || document.body.innerText.includes('Small stone deposit')
    || document.body.innerText.includes('Large stone outcrop'));
  await context.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', e => results.errors.push(String(e)));
  mobile.on('console', m => { if (m.type() === 'error') results.errors.push(m.text()); });
  mobile.on('response', r => { if (r.status() >= 400) results.failedResponses.push({ url: r.url(), status: r.status() }); });
  await mobile.goto('http://18.116.53.201/?seed=1337&freeze=1&tx=-14&tz=-8&ty=22&dist=78',
    { waitUntil: 'load', timeout: 120000 });
  await mobile.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await capture(mobile, 'production-removal-mobile-emulated-touch.png');
  await mobile.locator('#inspect-toggle').tap();
  await mobile.locator('[data-inspect-key="entityId:hero:styl_cairn:-20:-6"]').tap();
  await mobile.waitForFunction(() => window.__metrics.inspection.selected === 'Stone cairn');
  await capture(mobile, 'production-cairn-mobile-emulated-touch.png');
  await mobile.locator('#inspect-close').tap();
  await mobile.locator('.drawer-build').tap();
  await capture(mobile, 'production-build-mobile-emulated-touch.png');
  await mobile.locator('.drawer-world').tap();
  await capture(mobile, 'production-world-mobile-emulated-touch.png');
  await mobileContext.close();
  results.status = results.errors.length || results.failedResponses.length ? 'capture-errors' : 'captures-complete';
} catch (error) {
  results.status = 'failed'; results.failure = String(error?.stack ?? error);
  throw error;
} finally {
  results.finishedAt = new Date().toISOString();
  writeFileSync(out + 'visual-capture-results.json', JSON.stringify(results, null, 2));
  await browser.close();
}
