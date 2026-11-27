async (page) => {
  const DIR = '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist';
  const SHOTS = '/projects/sandbox/.kiro/artifacts/screenshots/';
  const out = { steps: [] };
  const step = (name, data) => out.steps.push({ name, ...data });
  const ctx = await page.context().browser().newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: DIR + p }); });
  await ctx.addInitScript(() => { localStorage.setItem('astrix:entered:v1', '1'); });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
  const cdp = await ctx.newCDPSession(pg);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([id, x, y]) => ({ id, x, y })) });
  const H = () => pg.evaluate(() => window.__metrics.homestead);
  const tap = async (sel) => { const b = await pg.locator(sel).first().boundingBox(); await touch('touchStart', [[7, b.x + b.width / 2, b.y + b.height / 2]]); await touch('touchEnd', []); await pg.waitForTimeout(1500); };
  try {
    await pg.goto('https://astrix.local/?chain=0');
    await pg.waitForFunction(() => window.__metrics?.explore?.grounded === true && window.__metrics?.homestead, null, { timeout: 300000 });
    await tap('#farm-button');
    await pg.screenshot({ path: SHOTS + 'M006-06-mobile-panel.png' });
    step('panel open', { visible: await pg.locator('#homestead-panel').isVisible() });
    await tap('#homestead-panel button[data-plan-new]');
    step('planner open', { visible: await pg.locator('#field-planner').isVisible(), planning: (await H()).planning?.crop });
    await tap('#field-planner button[data-crop="flax"]');
    // Walk with the joystick until the spot in front is valid.
    let ok = false;
    for (const [dx, dy] of [[0, -38], [0, -38], [30, -20], [-30, -20], [0, -38], [38, 0], [0, -38]]) {
      const h = await H(); if (h.planning?.reasons.length === 0 && h.planning.spec) { ok = true; break; }
      await touch('touchStart', [[1, 130, 300]]); await touch('touchMove', [[1, 130 + dx, 300 + dy]]);
      await pg.waitForTimeout(4000); await touch('touchEnd', []); await pg.waitForTimeout(3000);
    }
    const h1 = await H();
    step('spot', { ok: ok || h1.planning?.reasons.length === 0, spec: h1.planning?.spec, reasons: h1.planning?.reasons });
    await pg.screenshot({ path: SHOTS + 'M006-07-mobile-planner.png' });
    if (h1.planning?.reasons.length === 0) await tap('#field-planner button[data-plan="place"]');
    const h2 = await H();
    step('marked', { fields: h2.fields.map((f) => `${f.crop} ${f.w}x${f.d} ${f.state}`), toast: await pg.evaluate(() => window.__metrics.lastAction) });
    // Use button label follows what is in reach.
    step('use button', { label: await pg.locator('#gather-nearest').innerText(), nearest: h2.nearest });
    await pg.screenshot({ path: SHOTS + 'M006-08-mobile-field.png' });
  } catch (e) { out.error = String(e).slice(0, 300); }
  out.errors = errs;
  await ctx.close();
  return out;
}
