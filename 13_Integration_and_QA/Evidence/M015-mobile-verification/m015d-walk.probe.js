async (page) => {
  // M015 device report 1, problem 2 (EMULATED, NOT a real device): a walk in walk mode that crosses into new
  // ground, as in the owner's buckets 9-11 and 16-25 (walking west from 48 m cell -3 to -8). Playwright
  // Chromium at half the owner's viewport (683x355, same aspect; software GL renders at about 1 fps at the
  // full size, and the streaming work measured here does not depend on the canvas size), touch,
  // desktop-site mode, dpr 1, software GL (SwiftShader),
  // CPU throttled 4x (CDP) for the whole walk. The founder spawns at (-150, 10), the stream settles, then
  // the founder runs west (Shift+W with the camera turned to face west) until 128 m (4 chunks) are covered
  // or the time runs out. Records every frame interval (rAF in the page), main-thread long tasks
  // (PerformanceObserver 'longtask', > 50 ms, includes worker callbacks outside the frame), the frame-loop
  // sections and the streaming counters. Software GL makes every frame slow, so the comparison that
  // carries over to a phone is the main-thread work outside rendering: long tasks and the sections.
  const CFG = /*CFG*/{
    base: 'https://astrix.local/',
    dist: '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist',
    out: '/projects/sandbox/Astrix/13_Integration_and_QA/Evidence/M015-mobile-verification',
    tag: 'before',
    levels: ['high', 'medium', 'low'],
    start: [-150, 10],
    walkM: 128,
    maxS: 240,
    throttle: 4,
    extra: '',
    viewport: { width: 683, height: 355 },
  }/*END*/;
  const save = async (page, CFG, name, data, errs) => {
    const ctx = await page.context().browser().newContext({ acceptDownloads: true });
    try {
      await ctx.route(`${CFG.base}m015d-results.html`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>m015d</title>' }));
      const out = await ctx.newPage();
      await out.goto(`${CFG.base}m015d-results.html`);
      const [dl] = await Promise.all([out.waitForEvent('download'), out.evaluate((r) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r], { type: 'application/json' })); a.download = 'r.json'; document.body.appendChild(a); a.click(); }, JSON.stringify(data, null, 1))]);
      await dl.saveAs(`${CFG.out}/${name}`);
    } catch (e) { errs.push(`results not written: ${e}`); }
    await ctx.close();
  };
  const results = {}, errs = [];
  const t0 = Date.now();
  for (const level of CFG.levels) {
    const ctx = await page.context().browser().newContext({ viewport: CFG.viewport, hasTouch: true, isMobile: false, deviceScaleFactor: 1 });
    await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: CFG.dist + p }); });
    await ctx.addInitScript(([x, z]) => {
      if (!sessionStorage.getItem('m015d')) { localStorage.clear(); localStorage.setItem('astrix:entered:v1', '1');
        localStorage.setItem('astrix:avatar:v1:seed:1337:gen:2', JSON.stringify({ x, y: 100, z, heading: Math.PI })); sessionStorage.setItem('m015d', '1'); }
      // Frame intervals and long tasks, collected only while window.__walkRec is set.
      window.__walk = { frames: [], long: [] };
      let last = 0;
      const tick = (t) => { if (window.__walkRec && last) window.__walk.frames.push(t - last); last = t; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      try { new PerformanceObserver((l) => { if (window.__walkRec) for (const e of l.getEntries()) window.__walk.long.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: false }); } catch { /* no longtask */ }
    }, CFG.start);
    const pg = await ctx.newPage();
    pg.setDefaultNavigationTimeout(240000);
    pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    const cdp = await ctx.newCDPSession(pg);
    try {
      await pg.goto(`${CFG.base}?chain=0&freeze=1&metrics=1&quality=${level}${CFG.extra}`);
      await pg.waitForFunction(() => window.__metrics?.homestead && window.__metrics.natureInstances > 0 && window.__metrics.explore?.spawned, null, { timeout: 300000 });
      const settle = async () => { let st = 0; for (let i = 0; i < 60 && st < 3; i++) { await pg.waitForTimeout(1500); const p = await pg.evaluate(() => window.__metrics?.pendingChunkBuilds ?? 1); st = p === 0 ? st + 1 : 0; } };
      await settle();
      // Face west: the camera yaw is the angle of (camera - target) in xz; walking forward goes along -(sin, cos).
      const yaw = await pg.evaluate(() => { const c = window.__probe.camera.position, m = window.__metrics.explore; return Math.atan2(c.x - m.x, c.z - m.z); });
      let d = yaw - Math.PI / 2; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const box = await pg.locator('canvas').boundingBox();
      const cx = box.x + box.width * 0.6, cy = box.y + box.height * 0.4;
      let dx = d / 0.005;
      while (Math.abs(dx) > 1) { const step = Math.max(-500, Math.min(500, dx)); await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx + step, cy, { steps: 5 }); await pg.mouse.up(); dx -= step; }
      await pg.waitForTimeout(1500);
      const before = await pg.evaluate(() => ({ x: window.__metrics.explore.x, z: window.__metrics.explore.z, chunksGenerated: window.__metrics.chunksGenerated, worker: window.__metrics.chunkWorkers }));
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: CFG.throttle });
      await pg.evaluate(() => { window.__perfReset?.(); window.__walkRec = true; });
      await pg.keyboard.down('Shift');
      await pg.keyboard.down('w');
      const tw = Date.now();
      let pos = before;
      while (Date.now() - tw < CFG.maxS * 1000) {
        await pg.waitForTimeout(2000);
        pos = await pg.evaluate(() => ({ x: window.__metrics.explore.x, z: window.__metrics.explore.z }));
        if (Math.hypot(pos.x - before.x, pos.z - before.z) >= CFG.walkM) break;
      }
      await pg.keyboard.up('w');
      await pg.keyboard.up('Shift');
      const walkS = (Date.now() - tw) / 1000;
      const rec = await pg.evaluate(() => { window.__walkRec = false; const m = window.__metrics; return { frameUpdate: m.frameUpdate ?? null, frames: window.__walk.frames, long: window.__walk.long, sections: m.sections, streamPerf: m.streamPerf,
        worker: m.chunkWorkers, chunksGenerated: m.chunksGenerated, natureSync: m.natureSync, groundCover: m.groundCover ? { tiles: m.groundCover.tiles, builds: m.groundCover.builds, pieces: m.groundCover.pieces } : null,
        x: m.explore.x, z: m.explore.z, stream: m.stream ?? null, quality: m.quality.level }; });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const f = rec.frames.slice().sort((a, b) => a - b);
      const sum = f.reduce((a, b) => a + b, 0);
      const pct = (q) => f.length ? Math.round(f[Math.min(f.length - 1, Math.ceil(q * f.length) - 1)]) : 0;
      const walked = Math.round(Math.hypot(rec.x - before.x, rec.z - before.z));
      const sec = Object.fromEntries(Object.entries(rec.sections).map(([k, v]) => [k, `${v.meanMs}/${v.p95Ms}/${v.maxMs}`]));
      // Main-thread milliseconds per section over the walk (mean x calls), and their sum outside rendering.
      const totals = Object.fromEntries(Object.entries(rec.sections).map(([k, v]) => [k, Math.round(v.meanMs * v.n)]));
      const nested = new Set(['render', 'faunasync', 'chunkinstall', 'chunkpad', 'chunkgeom', 'chunkwater', 'watermerge', 'macro', 'macroadopt']);
      const streamTotal = Object.entries(totals).filter(([k]) => !nested.has(k)).reduce((a, [, v]) => a + v, 0);
      results[level] = { quality: rec.quality, walkS: Math.round(walkS), walkedM: walked, frames: f.length, fps: Math.round((f.length * 1000 / Math.max(1, sum)) * 10) / 10,
        p50: pct(0.5), p95: pct(0.95), max: Math.round(f.at(-1) ?? 0), over50: f.filter((x) => x > 50).length, over100: f.filter((x) => x > 100).length, over200: f.filter((x) => x > 200).length,
        longTasks: rec.long.length, longTasksOver100: rec.long.filter((x) => x > 100).length, longTaskMax: Math.max(0, ...rec.long), longTaskMsPer32m: Math.round(rec.long.reduce((a, b) => a + b, 0) / Math.max(1, walked / 32)),
        update: rec.frameUpdate ? { over50: rec.frameUpdate.over50Total, over33: rec.frameUpdate.longFrames, over100: rec.frameUpdate.hitches, p50: rec.frameUpdate.p50Ms, p95: rec.frameUpdate.p95Ms, max: rec.frameUpdate.maxMs, frames: rec.frameUpdate.windowFrames } : null,
        sectionTotalsMs: totals, frameLoopMsPer32m: Math.round(streamTotal / Math.max(1, walked / 32)),
        // All main-thread work outside rendering (frame loop + worker callbacks), per 32 m (one chunk) walked.
        updateMsPer32m: rec.frameUpdate?.totalMs !== undefined ? Math.round(rec.frameUpdate.totalMs / Math.max(1, walked / 32)) : null,
        chunksGenerated: rec.chunksGenerated - before.chunksGenerated, sections: sec, streamPerf: rec.streamPerf, worker: rec.worker, natureSync: rec.natureSync, groundCover: rec.groundCover };
      await pg.screenshot({ path: `${CFG.out}/m015d-walk-${CFG.tag}-${level}.png` });
    } catch (e) { errs.push(`${level}: ${String(e).slice(0, 300)}`); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {}); }
    await ctx.close();
  }
  const out = { emulated: `Playwright Chromium ${CFG.viewport.width}x${CFG.viewport.height}, hasTouch, isMobile false (desktop-site mode), dpr 1, software GL (SwiftShader), CPU throttle ${CFG.throttle}x during the walk: NOT a real device`, tag: CFG.tag, seconds: Math.round((Date.now() - t0) / 1000), results, errs };
  await save(page, CFG, `m015d-walk-${CFG.tag}.json`, out, errs);
  return JSON.stringify({ tag: CFG.tag, s: out.seconds, errs: errs.slice(0, 3), r: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { upd: v.update, updPer32: v.updateMsPer32m, loopPer32: v.frameLoopMsPer32m, tot: v.sectionTotalsMs, walked: v.walkedM, s: v.walkS, fps: v.fps, p95: v.p95, over50: v.over50, over100: v.over100, lt: v.longTasks, lt100: v.longTasksOver100, ltMax: v.longTaskMax, ltPer32: v.longTaskMsPer32m, gen: v.chunksGenerated }])) });
}
