async (page) => {
  // M015 device report 1, problems 3-5 in the browser (EMULATED, NOT a real device). Playwright Chromium at the
  // owner's viewport 1365x709 with touch and the owner's desktop-site user agent (isMobile false). The WebGL
  // debug renderer strings are patched to the owner's GPU ("Adreno (TM) 710") because the sandbox GPU is
  // SwiftShader. Checks: (3) the automatic level on two loads (first load and a reload) and before the first
  // frame; (4) the frame-rate cap in Settings, applied without a reload and recorded by the perf monitor;
  // (5) Copy report gives the compact paste (summary + bucket table) and Download the full JSON.
  const CFG = /*CFG*/{
    base: 'https://astrix.local/',
    dist: '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist',
    out: '/projects/sandbox/Astrix/13_Integration_and_QA/Evidence/M015-mobile-verification',
    distBefore: '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist-before',
    ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  }/*END*/;
  const errs = [];
  const ctx = await page.context().browser().newContext({ viewport: { width: 1365, height: 709 }, hasTouch: true, isMobile: false, deviceScaleFactor: 1, userAgent: CFG.ua, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: CFG.base.replace(/\/$/, '') });
  await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: CFG.dist + p }); });
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('m015d')) { localStorage.clear(); localStorage.setItem('astrix:entered:v1', '1'); sessionStorage.setItem('m015d', '1'); }
    // The owner's GPU strings (WEBGL_debug_renderer_info: 37445 vendor, 37446 renderer).
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const get = C.prototype.getParameter;
      C.prototype.getParameter = function (p) { if (p === 37446) return 'Adreno (TM) 710'; if (p === 37445) return 'Qualcomm'; return get.call(this, p); };
    }
    // The level in force when the first frame is drawn.
    const raf = window.requestAnimationFrame.bind(window);
    let first = true;
    window.requestAnimationFrame = (cb) => raf((t) => { if (first && window.__metrics?.quality) { first = false; window.__firstFrameQuality = window.__metrics.quality.level; } cb(t); });
  });
  const pg = await ctx.newPage();
  pg.setDefaultNavigationTimeout(240000);
  pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const read = () => pg.evaluate(() => ({ quality: window.__metrics.quality, firstFrame: window.__firstFrameQuality ?? null, frameCap: window.__metrics.frameCap,
    coarse: matchMedia('(pointer: coarse)').matches, anyCoarse: matchMedia('(any-pointer: coarse)').matches, maxTouchPoints: navigator.maxTouchPoints, ua: navigator.userAgent, platform: navigator.platform }));
  const out = { emulated: 'Playwright Chromium 1365x709, hasTouch, isMobile false, the owner\'s desktop-site user agent, WebGL renderer string patched to Adreno (TM) 710, software GL: NOT a real device', loads: [], errs };
  // The owner's first load: the pointer media queries answered "fine" (simulated by patching matchMedia).
  out.finePointerLoad = {};
  for (const [tag, dist] of [['before', CFG.distBefore], ['after', CFG.dist]]) {
    const fctx = await page.context().browser().newContext({ viewport: { width: 1365, height: 709 }, hasTouch: true, isMobile: false, deviceScaleFactor: 1, userAgent: CFG.ua });
    await fctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: dist + p }); });
    await fctx.addInitScript(() => {
      localStorage.setItem('astrix:entered:v1', '1');
      for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
        const get = C.prototype.getParameter;
        C.prototype.getParameter = function (p) { if (p === 37446) return 'Adreno (TM) 710'; if (p === 37445) return 'Qualcomm'; return get.call(this, p); };
      }
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) => /pointer:\s*coarse/.test(q) ? { ...mm(q), matches: false, media: q } : mm(q);
    });
    const fp = await fctx.newPage();
    fp.setDefaultNavigationTimeout(240000);
    try {
      await fp.goto(`${CFG.base}?chain=0&metrics=1`);
      await fp.waitForFunction(() => window.__metrics?.quality && window.__ready, null, { timeout: 300000 });
      out.finePointerLoad[tag] = await fp.evaluate(() => ({ quality: window.__metrics.quality, coarse: matchMedia('(pointer: coarse)').matches, maxTouchPoints: navigator.maxTouchPoints }));
    } catch (e) { errs.push(`fine-pointer load: ${String(e).slice(0, 200)}`); }
    await fctx.close();
  }
  try {
    await pg.goto(`${CFG.base}?chain=0&perf=1&metrics=1`);
    await pg.waitForFunction(() => window.__metrics?.homestead && window.__ready, null, { timeout: 300000 });
    out.loads.push(await read());
    await pg.reload();
    await pg.waitForFunction(() => window.__metrics?.homestead && window.__ready, null, { timeout: 300000 });
    out.loads.push(await read());
    // (4) Settings: 30 fps (battery saver), applied without a reload.
    await pg.click('#settings-button');
    await pg.screenshot({ path: `${CFG.out}/m015d-settings-framecap.png` });
    await pg.check('input[name="astrix-fpscap"][value="30"]');
    await pg.waitForTimeout(1500);
    out.afterCap = await pg.evaluate(() => ({ frameCap: window.__metrics.frameCap, saved: localStorage.getItem('astrix:fpscap:v1') }));
    await pg.click('[data-settings-close]');
    // Let two 10 s buckets close with the cap in force.
    await pg.waitForFunction(() => (window.__metrics?.perf?.buckets ?? 0) >= 2, null, { timeout: 120000, polling: 2000 }).catch(() => errs.push('fewer than 2 buckets'));
    // (5) Copy report: the compact paste.
    await pg.click('.perf-pill');
    await pg.click('[data-perf="copy"]');
    await pg.waitForTimeout(1000);
    const clip = await pg.evaluate(() => navigator.clipboard.readText());
    out.copy = { chars: clip.length, status: await pg.textContent('.perf-status'), head: clip.split('\n').slice(0, 4), render: clip.split('\n').find((l) => l.startsWith('Render:')), events: clip.split('\n').find((l) => l.startsWith('Events:')),
      tableHeader: clip.split('\n').find((l) => l.startsWith('Buckets')), tableLines: clip.split('\n').filter((l) => /^\d+ \d+ /.test(l)) };
    const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-perf="download"]')]);
    const path = `${CFG.out}/m015d-device-report.json`;
    await dl.saveAs(path);
    out.download = { file: 'm015d-device-report.json' };
    await pg.screenshot({ path: `${CFG.out}/m015d-perf-copy.png` });
  } catch (e) { errs.push(String(e).slice(0, 300)); }
  await ctx.close();
  const sctx = await page.context().browser().newContext({ acceptDownloads: true });
  try {
    await sctx.route(`${CFG.base}m015d-results.html`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>m015d</title>' }));
    const o = await sctx.newPage();
    await o.goto(`${CFG.base}m015d-results.html`);
    const [dl] = await Promise.all([o.waitForEvent('download'), o.evaluate((r) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r], { type: 'application/json' })); a.download = 'r.json'; document.body.appendChild(a); a.click(); }, JSON.stringify(out, null, 1))]);
    await dl.saveAs(`${CFG.out}/m015d-device-results.json`);
  } catch (e) { errs.push(`results not written: ${e}`); }
  await sctx.close();
  return JSON.stringify({ fine: Object.fromEntries(Object.entries(out.finePointerLoad).map(([k, v]) => [k, [v.quality.level, v.quality.reasons]])), loads: out.loads.map((l) => [l.quality.level, l.quality.reasons, l.firstFrame, l.coarse, l.anyCoarse, l.maxTouchPoints]), afterCap: out.afterCap, copy: out.copy && { chars: out.copy.chars, status: out.copy.status, render: out.copy.render, lines: out.copy.tableLines.length, sample: out.copy.tableLines.slice(0, 2) }, errs });
}
