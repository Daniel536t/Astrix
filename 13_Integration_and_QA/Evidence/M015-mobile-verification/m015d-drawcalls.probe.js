async (page) => {
  // M015 device report 1, problem 1 (EMULATED, NOT a real device): reproduce the owner's "walk:-1,0:mid" scene
  // (walk mode beside the farm in 48 m cell (-1,0), default walk zoom ~58 m = the "mid" band) in Playwright
  // Chromium at the owner's viewport 1365x709 (touch, desktop-site mode: isMobile false), software GL.
  // For each ?quality= level (run side by side) the founder spawns at a few spots in the cell; the camera is turned through
  // 8 headings at two pitches (mouse drags on the canvas) and every view records renderer.info calls /
  // triangles and window.__renderBreakdown() owners. Reports the worst view per level and its breakdown.
  const CFG = /*CFG*/{
    base: 'https://astrix.local/',
    dist: '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist',
    out: '/projects/sandbox/Astrix/13_Integration_and_QA/Evidence/M015-mobile-verification',
    tag: 'before',
    levels: ['high', 'medium', 'low'],
    spots: [[-28, 10], [-12, 30], [-40, 40]],
    extra: '',
    chain: true,
  }/*END*/;
  // Results are written through a download (the probe runs without Node module access).
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
  // Levels run side by side (separate contexts); calls and triangles do not depend on timing.
  const runOne = async (level, sx, sz) => {
    {
      const ctx = await page.context().browser().newContext({ viewport: { width: 1365, height: 709 }, hasTouch: true, isMobile: false, deviceScaleFactor: 1 });
      await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: CFG.dist + p }); });
      await ctx.addInitScript(([x, z]) => { if (!sessionStorage.getItem('m015d')) { localStorage.clear(); localStorage.setItem('astrix:entered:v1', '1');
        localStorage.setItem('astrix:avatar:v1:seed:1337:gen:2', JSON.stringify({ x, y: 100, z, heading: Math.PI }));
        sessionStorage.setItem('m015d', '1'); } }, [sx + 0.5, sz + 0.5]);
      const pg = await ctx.newPage();
      pg.setDefaultNavigationTimeout(240000);
      pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
      const key = `${level}@${sx},${sz}`;
      try {
        await pg.goto(`${CFG.base}?${CFG.chain ? '' : 'chain=0&'}freeze=1&metrics=1&quality=${level}${CFG.extra}`);
        await pg.waitForFunction(() => window.__metrics?.homestead && window.__metrics.natureInstances > 0 && window.__metrics.explore?.spawned, null, { timeout: 300000 });
        const settle = async () => { let st = 0; for (let i = 0; i < 40 && st < 2; i++) { await pg.waitForTimeout(1500); const p = await pg.evaluate(() => window.__metrics?.pendingChunkBuilds ?? 1); st = p === 0 ? st + 1 : 0; } };
        await settle();
        // The MagicBlock settlement is drawn once its on-chain state arrives (network); wait up to 60 s for it.
        if (CFG.chain) { for (let i = 0; i < 30; i++) { const ok = await pg.evaluate(() => { let n = 0; window.__renderBreakdown().entries.forEach((e) => { if (e.owner === 'magicblock_settlement') n += e.meshes; }); return n; }); if (ok) break; await pg.waitForTimeout(2000); } }
        const views = [];
        const box = await pg.locator('canvas').boundingBox();
        const cx = box.x + box.width * 0.75, cy = box.y + box.height * 0.4;
        const drag = async (dx, dy) => { await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx + dx, cy + dy, { steps: 4 }); await pg.mouse.up(); };
        for (const pitch of [0, -70]) {
          if (pitch) await drag(0, pitch);
          for (let h = 0; h < 8; h++) {
            await drag(157, 0);
            await pg.waitForTimeout(2500);
            await settle();
            const v = await pg.evaluate(() => { const m = window.__metrics; const chainState = m.chain ? JSON.stringify(m.chain).slice(0, 160) : null; const b = window.__renderBreakdown();
              const owners = Object.fromEntries(Object.entries(b.owners).filter(([, o]) => o.total.draws > 0).sort((a, c) => c[1].total.draws - a[1].total.draws)
                .map(([k, o]) => [k, `${o.main.draws}+${o.shadow.draws}s`]));
              const top = b.entries.filter((e) => e.main.draws + e.shadow.draws > 0).slice(0, 14).map((e) => `${e.owner}/${e.mesh} ${e.type} ${e.main.draws}+${e.shadow.draws}s ${e.main.triangles + e.shadow.triangles}t`);
              return { calls: m.rendererCalls, tris: m.rendererTriangles, est: b.totals.all.draws, dist: m.explore?.cameraDistance, scene: m.perf?.last?.scene ?? null,
                chainState, at: m.explore ? [Math.round(m.explore.x ?? 0), Math.round(m.explore.z ?? 0)] : null, owners, top }; });
            v.pitch = pitch; v.h = h;
            views.push(v);
          }
        }
        views.sort((a, b) => b.calls - a.calls);
        results[key] = { worst: views[0], callsByView: views.map((v) => v.calls), trisMax: Math.max(...views.map((v) => v.tris)), quality: await pg.evaluate(() => window.__metrics.quality.level) };
        await pg.screenshot({ path: `${CFG.out}/m015d-dc-${CFG.tag}-${level}-${sx}_${sz}.png` });
      } catch (e) { errs.push(`${key}: ${String(e).slice(0, 200)}`); }
      await ctx.close();
    }
  };
  for (const [sx, sz] of CFG.spots) await Promise.all(CFG.levels.map((level) => runOne(level, sx, sz)));
  const out = { emulated: 'Playwright Chromium 1365x709, hasTouch, isMobile false (desktop-site mode), dpr 1, software GL (SwiftShader): NOT a real device', tag: CFG.tag, seconds: Math.round((Date.now() - t0) / 1000), results, errs };
  await save(page, CFG, `m015d-drawcalls-${CFG.tag}.json`, out, errs);
  return JSON.stringify({ tag: CFG.tag, s: out.seconds, errs: errs.slice(0, 3), r: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, [v.worst.calls, v.trisMax, v.worst.est, v.worst.owners]])) });
}
