// Playwright probe: hold W for a fixed time and sample streaming, memory and
// frame-interval metrics. Works against any ASTrix build (old or new) because it
// only reads window.__metrics fields that existed before this change, plus an
// in-page requestAnimationFrame interval collector.
//
// Set TARGET to the URL to test. Use 'https://astrix.local/' to serve the local
// Game/dist build through request interception (no local server needed).
async (page) => {
  const TARGET = 'https://astrix.local/';
  const DIST = '/projects/sandbox/Astrix/Game/dist';
  const HOLD_MS = 24000;
  if (TARGET.startsWith('https://astrix.local/')) {
    // A RegExp matcher: the Playwright code sandbox has no URL global for globs.
    await page.route(/^https:\/\/astrix\.local\//, async (route) => {
      const pathname = route.request().url().replace(/^https:\/\/astrix\.local/, '').split(/[?#]/)[0];
      const path = pathname === '/' || pathname === '' ? '/index.html' : pathname;
      try { await route.fulfill({ path: DIST + path }); }
      catch { await route.fulfill({ path: DIST + '/index.html' }); }
    });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(TARGET + '?freeze=1');
  await page.evaluate('localStorage.clear()');
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const s = (window.__probeIntervals = []);
    let last = performance.now();
    const tick = (t) => { s.push(t - last); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const read = () => page.evaluate(() => {
    const m = window.__metrics;
    const mem = performance.memory;
    return {
      t: Math.round(performance.now()),
      target: [Math.round(window.__probe.camera.position.x), Math.round(window.__probe.camera.position.z)],
      loaded: m.loadedChunks, resident: m.cachedChunks, generated: m.chunksGenerated,
      pending: m.pendingChunkBuilds ?? null, swept: m.sweptChunks ?? null,
      heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
      calls: m.rendererCalls, tris: m.rendererTriangles, geoms: m.rendererGeometries,
    };
  });
  const samples = [await read()];
  await page.locator('canvas').first().click({ position: { x: 640, y: 360 } });
  await page.keyboard.down('w');
  const start = Date.now();
  while (Date.now() - start < HOLD_MS) {
    await page.waitForTimeout(3000);
    samples.push(await read());
  }
  await page.keyboard.up('w');
  await page.waitForTimeout(3000);
  samples.push(await read());
  const intervals = await page.evaluate(() => window.__probeIntervals.slice(30));
  intervals.sort((a, b) => a - b);
  const q = (p) => Math.round(intervals[Math.min(intervals.length - 1, Math.floor(p * (intervals.length - 1)))]);
  const errors = await page.evaluate(() => window.__errors ?? null);
  return {
    TARGET,
    samples,
    frameIntervalMs: { n: intervals.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1),
      over100: intervals.filter((v) => v > 100).length, over250: intervals.filter((v) => v > 250).length },
    frameWork: await page.evaluate(() => window.__metrics.frameWork ?? null),
    errors,
  };
}
