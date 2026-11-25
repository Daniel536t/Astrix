async (page) => {
  // M015 emulated performance per quality level (EMULATED, NOT a real device): Playwright Chromium phone
  // emulation (390x844, deviceScaleFactor 2, isMobile, hasTouch), software GL (SwiftShader), CPU throttled
  // 4x through CDP Emulation.setCPUThrottlingRate while measuring (loading runs unthrottled). For one
  // ?quality= level: the walk view at the spawn and the M013/M014 builder views (farm, forest, farm zoomed
  // to 600 m), each with multi-draw and with ?multidraw=0. Records draw calls, triangles (main + shadow
  // passes, renderer.info), the pixel ratio and canvas size, frame interval p50/p95 and the frame-loop
  // sections, plus the state hash (it must not depend on the level). fps here is software rendering on a
  // shared CPU and says nothing about a phone GPU; calls and triangles are what transfer.
  const CFG = /*CFG*/{
    base: 'https://astrix.local/',
    dist: '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist',
    out: '/projects/sandbox/Astrix/13_Integration_and_QA/Evidence/M015-mobile-verification',
    quality: 'medium',
    throttle: 4,
    sampleMs: 6000,
    views: {
      walk: '',
      farm: 'mode=builder&tx=-28&ty=14&tz=4&yaw=0&pitch=30&dist=40',
      forest: 'mode=builder&tx=220&ty=14&tz=-110&yaw=20&pitch=28&dist=50',
      'farm-600': 'mode=builder&tx=-28&ty=14&tz=4&yaw=0&pitch=30&dist=600',
    },
  }/*END*/;
  const ctx = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, acceptDownloads: true });
  await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: CFG.dist + p }); });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('m015-fresh')) { localStorage.clear(); localStorage.setItem('astrix:entered:v1', '1'); sessionStorage.setItem('m015-fresh', '1'); } });
  const pg = await ctx.newPage();
  pg.setDefaultNavigationTimeout(240000);
  const cdp = await ctx.newCDPSession(pg);
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
  const t0 = Date.now();
  const views = {}, shots = [];
  const settle = async () => { let st = 0; for (let i = 0; i < 40 && st < 2; i++) { await pg.waitForTimeout(2000); const p = await pg.evaluate(() => window.__metrics?.pendingChunkBuilds ?? 1); st = p === 0 ? st + 1 : 0; } };
  for (const [name, q] of Object.entries(CFG.views)) {
    for (const md of [1, 0]) {
      const key = `${name}${md ? '' : '-multidraw0'}`;
      try {
        await pg.goto(`${CFG.base}?chain=0&freeze=1&quality=${CFG.quality}${md ? '' : '&multidraw=0'}${q ? '&' + q : ''}`);
        await pg.waitForFunction(() => window.__metrics?.homestead && window.__metrics.natureInstances > 0, null, { timeout: 400000 });
        await settle();
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: CFG.throttle });
        await pg.waitForTimeout(3000);
        // Fresh frame statistics for the throttled window: sample the rolling frame-interval window at the end.
        const samples = [];
        const end = Date.now() + CFG.sampleMs;
        while (Date.now() < end) { await pg.waitForTimeout(2000); samples.push(await pg.evaluate(() => [window.__metrics.rendererCalls, window.__metrics.rendererTriangles])); }
        const m = await pg.evaluate(() => { const m = window.__metrics; const c = window.__probe.renderer.domElement; return {
          calls: m.rendererCalls, tris: m.rendererTriangles, quality: m.quality, multiDraw: m.multiDraw, canvas: [c.width, c.height], css: [innerWidth, innerHeight], dpr: devicePixelRatio,
          frameInterval: m.frameInterval, frameWork: m.frameWork, sections: m.sections, vegetation: m.vegetation, groundCover: m.groundCover ? { pieces: m.groundCover.pieces, triangles: m.groundCover.triangles } : null,
          hash: m.stateHash, mode: m.explore?.active ? 'walk' : 'builder' }; });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        m.maxCalls = Math.max(m.calls, ...samples.map((s) => s[0]));
        m.maxTris = Math.max(m.tris, ...samples.map((s) => s[1]));
        views[key] = m;
        if (md || name === 'forest') { const file = `perf-${CFG.quality}-${key}.png`; await pg.screenshot({ path: `${CFG.out}/${file}` }); shots.push(file); }
      } catch (e) { errs.push(`${key}: ${String(e).slice(0, 200)}`); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {}); }
    }
  }
  const hashes = [...new Set(Object.values(views).map((v) => v.hash))];
  const result = { emulated: 'Playwright Chromium phone emulation 390x844 @2x, software GL (SwiftShader), CPU throttle 4x while sampling: NOT a real device', quality: CFG.quality, throttle: CFG.throttle,
    seconds: Math.round((Date.now() - t0) / 1000), hashes, views, shots, errs };
  try {
    const out = await ctx.newPage();
    await ctx.route(`${CFG.base}m015-results.html`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>m015</title>' }));
    await out.goto(`${CFG.base}m015-results.html`);
    const [dl] = await Promise.all([out.waitForEvent('download'), out.evaluate((r) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r], { type: 'application/json' })); a.download = 'r.json'; document.body.appendChild(a); a.click(); }, JSON.stringify(result, null, 1))]);
    await dl.saveAs(`${CFG.out}/m015-perf-${CFG.quality}.json`);
  } catch (e) { errs.push(`results not written: ${e}`); }
  await ctx.close();
  return JSON.stringify({ q: CFG.quality, s: result.seconds, hashes, errs: errs.slice(0, 3), v: Object.fromEntries(Object.entries(views).map(([k, v]) => [k, [v.maxCalls, v.maxTris, v.canvas.join('x'), v.frameInterval.p50Ms]])) });
}
