async (page) => {
  const ctx = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist' + p }); });
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('f')) { localStorage.clear(); localStorage.setItem('astrix:entered:v1', '1'); sessionStorage.setItem('f', '1'); }
    window.__log = [];
    const raf = window.requestAnimationFrame.bind(window);
    const tick = () => { const e = window.__metrics?.explore; if (e) window.__log.push([Math.round(performance.now()), e.y, e.vy, e.grounded, e.mode]); raf(tick); };
    raf(tick);
    window.__pd = [];
    window.addEventListener('pointerdown', (e) => window.__pd.push(['down', Math.round(performance.now()), e.pointerId, e.target?.id]), true);
    window.addEventListener('pointerup', (e) => window.__pd.push(['up', Math.round(performance.now()), e.pointerId, e.target?.id]), true);
  });
  const pg = await ctx.newPage();
  pg.setDefaultNavigationTimeout(240000);
  const cdp = await ctx.newCDPSession(pg);
  await pg.goto('https://astrix.local/?chain=0&metrics=1');
  await pg.waitForFunction(() => window.__metrics?.explore?.spawned && window.__metrics?.homestead, null, { timeout: 400000 });
  await pg.waitForTimeout(15000);
  const c = await pg.evaluate(() => { const r = document.getElementById('jump-button').getBoundingClientRect(); return { x: r.x + 40, y: r.y + 40 }; });
  await pg.evaluate(() => { window.__log.length = 0; });
  const t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await t('touchStart', [{ x: c.x, y: c.y, id: 1 }]); await pg.waitForTimeout(150); await t('touchEnd', []);
  await pg.waitForFunction(() => window.__metrics.explore.y > window.__log[0][1] + 0.05, null, { timeout: 20000, polling: 50 });
  await t('touchStart', [{ x: c.x, y: c.y, id: 2 }]); await pg.waitForTimeout(150); await t('touchEnd', []);
  await pg.waitForTimeout(12000);
  const out = await pg.evaluate(() => ({ log: window.__log.filter((r, i, a) => i === 0 || r[1] !== a[i - 1][1]).slice(0, 30), pd: window.__pd.slice(-6) }));
  await ctx.close();
  return JSON.stringify(out);
}
