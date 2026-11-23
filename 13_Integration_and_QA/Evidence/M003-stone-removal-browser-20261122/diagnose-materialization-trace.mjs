// Read-only production materialization trace during actual founder build actions.
// No state mutation is performed by the diagnostic other than ordinary Build UI.
import { chromium } from '/home/ubuntu/as/08_Technical_Director/Project_Setup/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'] });
const suffix = new Date().toISOString().replaceAll(':', '-');
const result = { scope: 'actual production build-camera materialization', steps: [], errors: [], responseFailures: [] };
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', e => result.errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') result.errors.push(m.text()); });
page.on('response', r => { if (r.status() >= 400) result.responseFailures.push({ url: r.url(), status: r.status() }); });
async function metrics(label, commands) {
  await page.waitForFunction(n => window.__ready === true && window.__metrics.acceptedCommands >= n,
    commands, { timeout: 60000 });
  await page.waitForTimeout(1200);
  result.steps.push(await page.evaluate(label => ({ label, entities: window.__metrics.entities,
    chunksGenerated: window.__metrics.chunksGenerated, cachedChunks: window.__metrics.cachedChunks,
    loadedChunks: window.__metrics.loadedChunks, targets: window.__metrics.inspection.targetCount,
    stateHash: window.__metrics.stateHash }), label));
}
try {
  await page.goto('http://18.116.53.201/?seed=1337&freeze=1&tx=-14&tz=-8&ty=22&dist=78',
    { waitUntil: 'load', timeout: 120000 });
  await metrics('original', 0);
  for (const [project, commands] of [['house', 1], ['path', 2], ['farm', 3]]) {
    await page.locator(`[data-project="${project}"]`).click();
    await metrics(`${project} selected`, commands);
    await page.locator('#build-panel .btn-build').click();
    await page.waitForFunction(n => window.__metrics.acceptedCommands === n && window.__metrics.save.status === 'saved',
      commands, { timeout: 45000 });
    await metrics(`${project} built`, commands);
  }
  result.status = 'completed';
} catch (error) { result.status = 'failed'; result.failure = String(error?.stack ?? error); process.exitCode = 1; }
finally {
  writeFileSync(new URL(`materialization-trace-${suffix}.json`, import.meta.url).pathname, JSON.stringify(result, null, 2));
  await browser.close();
  console.log(JSON.stringify(result, null, 2));
}
