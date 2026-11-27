async (page) => {
  // FINAL-MAP probe A: a fresh W1 world (seed 1337) on the local build; open the map at once; watch the survey fill in.
  const DIR = '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist', SH = '/projects/sandbox/.kiro/artifacts/screenshots/final-map/';
  const ctx = page.context();
  await ctx.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
  await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/blank') { await route.fulfill({ body: '<html></html>', contentType: 'text/html' }); return; } if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: DIR + p }); });
  if (!page.__fm) {
    page.__fm = { console: [], pageerror: [], failed: [], http: [] };
    const L = page.__fm;
    page.on('console', (m) => { if (m.type() === 'error') L.console.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => L.pageerror.push(String(e).slice(0, 300)));
    page.on('requestfailed', (r) => L.failed.push(r.url()));
    page.on('response', (r) => { if (r.status() >= 400) L.http.push(r.status() + ' ' + r.url()); });
    await ctx.addInitScript({ path: '/projects/sandbox/.kiro/artifacts/screenshots/probe/w4-helpers.js' });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('https://astrix.local/blank');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('astrix:entered:v1', '1'); localStorage.setItem('astrix:worlds:v1', JSON.stringify({ v: 1, worlds: [{ id: 'w1', seed: 1337, generatorVersion: 2, created: 1764000000000, spawn: { x: -82, z: -172 } }] })); localStorage.setItem('astrix:world:active:v1', 'w1'); });
  for (const k of Object.keys(page.__fm)) page.__fm[k].length = 0;
  await page.goto('https://astrix.local/?chain=0&metrics=1');
  await page.waitForFunction(() => window.__metrics?.explore?.spawned === true, null, { timeout: 180000 });
  const mm = () => page.evaluate(() => { const m = window.__metrics.wild.map; return { survey: m.survey, found: m.deposits, visited: m.places.length, explored: m.explored, open: m.open, stats: { mapOpenMs: m.stats.mapOpenMs, mapDrawMs: m.stats.mapDrawMs, drawnDeposits: m.stats.drawnDeposits, drawnClusters: m.stats.drawnClusters, drawnPlaces: m.stats.drawnPlaces, minimapMs: m.stats.minimapMs, minimapMaxMs: m.stats.minimapMaxMs } }; });
  const out = { atSpawn: await mm() };
  out.perfAtSpawn = await page.evaluate(() => { const p = window.__metrics.perf; return p ? JSON.stringify(p).slice(0, 400) : null; });
  await page.keyboard.press('m');
  await page.waitForTimeout(300);
  out.justOpened = await mm();
  await page.screenshot({ path: SH + 'fm-a1-desktop-map-just-opened.png' });
  await page.waitForTimeout(3000);
  out.after3s = await mm();
  await page.screenshot({ path: SH + 'fm-a2-desktop-map-3s.png' });
  // Zoom right out: the whole world.
  for (let i = 0; i < 6; i++) { await page.click('#world-map [data-mapzoom="out"]'); await page.waitForTimeout(150); }
  await page.waitForTimeout(500);
  out.zoomedOut = await mm();
  out.view = await page.evaluate(() => window.__metrics.wild.map.view);
  await page.screenshot({ path: SH + 'fm-a3-desktop-whole-world-early.png' });
  const t0 = Date.now();
  await page.waitForFunction(() => window.__metrics.wild.map.survey?.depositsDoneMs != null, null, { timeout: 240000 }).catch(() => {});
  out.waitedMs = Date.now() - t0;
  await page.waitForTimeout(1500);
  out.surveyed = await mm();
  await page.screenshot({ path: SH + 'fm-a4-desktop-whole-world-surveyed.png' });
  out.cache = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('astrix:mapsurvey:')).map((k) => [k, localStorage.getItem(k).length]));
  out.perfEnd = await page.evaluate(() => { const p = window.__metrics.perf; return p ? JSON.stringify(p).slice(0, 400) : null; });
  out.log = page.__fm;
  return out;
}
