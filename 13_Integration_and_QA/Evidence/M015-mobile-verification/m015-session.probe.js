async (page) => {
  // M015 10-minute emulated session with ?perf=1 (EMULATED, NOT a real device; software GL, so the fps
  // values say nothing about a phone). Proves the monitor and its report: 2 min idle at the farm (thermal
  // baseline), a joystick walk loop, Home, a reload in the middle (the session log must continue), the
  // builder view, back to walking and idle at the farm again until 10 min; then the overlay's Copy report
  // (clipboard) and Download report (file) are used through the real buttons and the files are checked.
  const CFG = /*CFG*/{
    base: 'https://astrix.local/',
    dist: '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist',
    out: '/projects/sandbox/Astrix/13_Integration_and_QA/Evidence/M015-mobile-verification',
    minutes: 10,
    extra: '',
  }/*END*/;
  const W = 390, H = 844;
  const ctx = await page.context().browser().newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: CFG.dist + p }); });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('m015-fresh')) { localStorage.clear(); localStorage.setItem('astrix:entered:v1', '1'); sessionStorage.setItem('m015-fresh', '1'); } });
  const pg = await ctx.newPage();
  pg.setDefaultNavigationTimeout(240000);
  const cdp = await ctx.newCDPSession(pg);
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
  const t0 = Date.now();
  const el = () => (Date.now() - t0) / 1000;
  const log = [];
  const note = (what) => log.push({ t: Math.round(el()), what });
  const url = `${CFG.base}?chain=0&perf=1${CFG.extra}`;
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const tapSel = async (sel) => { const c = await pg.evaluate((s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel); await pg.touchscreen.tap(c.x, c.y); await pg.waitForTimeout(700); };
  const until = (s) => pg.waitForTimeout(Math.max(0, s * 1000 - (Date.now() - t0)));
  const walkFor = async (ms, dx = 0) => {
    const x = 70, y = H - 130;
    await touch('touchStart', [{ x, y, id: 1 }]);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: x + (dx * i) / 6, y: y - (44 * i) / 6, id: 1 }]); await pg.waitForTimeout(40); }
    await pg.waitForTimeout(ms);
    await touch('touchEnd', []);
  };
  await pg.goto(url);
  await pg.waitForFunction(() => window.__metrics?.explore?.spawned && window.__metrics?.homestead && document.getElementById('perf-overlay'), null, { timeout: 400000 });
  note('loaded (walk mode at the farm, idle: thermal baseline)');
  await until(125);
  note('walk loop with the joystick');
  for (let i = 0; i < 6; i++) { await walkFor(12000, i % 2 ? 30 : -30); await pg.waitForTimeout(3000); }
  note('Home');
  await tapSel('#return-home-button'); await pg.waitForTimeout(6000);
  await until(260);
  note('reload in the middle of the session');
  const before = await pg.evaluate(() => window.__metrics.perf);
  await pg.reload();
  await pg.waitForFunction(() => window.__metrics?.explore?.spawned && document.getElementById('perf-overlay'), null, { timeout: 400000 });
  const after = await pg.evaluate(() => window.__metrics.perf);
  note(`after reload: ${after.buckets} buckets (before ${before.buckets})`);
  await until(330);
  note('builder view');
  await tapSel('#mode-button');
  await until(390);
  note('walk mode again, idle at the farm');
  await tapSel('#mode-button');
  await until(CFG.minutes * 60);
  // ---- the overlay: open it, Copy report, Download report ----
  await tapSel('#perf-overlay .perf-pill');
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: `${CFG.out}/session-1-overlay-open.png` });
  await tapSel('#perf-overlay [data-perf="copy"]');
  await pg.waitForTimeout(1200);
  let copied = '';
  try { copied = await pg.evaluate(() => navigator.clipboard.readText()); } catch (e) { errs.push(`clipboard: ${String(e).slice(0, 120)}`); }
  const copyStatus = await pg.evaluate(() => document.querySelector('#perf-overlay .perf-status')?.textContent);
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 30000 }), tapSel('#perf-overlay [data-perf="download"]')]);
  const name = dl.suggestedFilename();
  await dl.saveAs(`${CFG.out}/m015-session-report.json`);
  await pg.screenshot({ path: `${CFG.out}/session-2-after-download.png` });
  const shareShown = await pg.evaluate(() => !!document.querySelector('#perf-overlay [data-perf="share"]'));
  const m = await pg.evaluate(() => ({ hash: window.__metrics.stateHash, perf: window.__metrics.perf, quality: window.__metrics.quality }));
  const textPart = copied.split('\n--- JSON ---\n')[0];
  const result = { emulated: 'Playwright Chromium phone emulation 390x844, software GL: NOT a real device', seconds: Math.round(el()), log, reload: { before, after },
    copy: { status: copyStatus, chars: copied.length, hasJson: copied.includes('--- JSON ---'), text: textPart }, download: { suggested: name }, shareShown, final: m, errs };
  try {
    const out = await ctx.newPage();
    await ctx.route(`${CFG.base}m015-results.html`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>m015</title>' }));
    await out.goto(`${CFG.base}m015-results.html`);
    const [d2] = await Promise.all([out.waitForEvent('download'), out.evaluate((r) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r], { type: 'application/json' })); a.download = 'r.json'; document.body.appendChild(a); a.click(); }, JSON.stringify(result, null, 1))]);
    await d2.saveAs(`${CFG.out}/m015-session-results.json`);
  } catch (e) { errs.push(`results not written: ${e}`); }
  await ctx.close();
  return JSON.stringify({ s: result.seconds, name, reload: [before.buckets, after.buckets], copy: [copyStatus, copied.length], shareShown, errs: errs.slice(0, 3), text: textPart });
}
