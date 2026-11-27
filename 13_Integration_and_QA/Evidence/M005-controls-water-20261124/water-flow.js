async (page) => {
  const DIR = '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist';
  const SHOTS = '/projects/sandbox/.kiro/artifacts/screenshots/';
  const out = { steps: [] };
  const ctx = await page.context().browser().newContext({ viewport: { width: 740, height: 360 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await ctx.route(/^https:\/\/astrix\.local\//, async (route) => {
    let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0];
    if (p === '/' || p === '') p = '/index.html';
    await route.fulfill({ path: DIR + p });
  });
  // Start in a 5 m deep pool of the default world, with a dry respawn point on its bank.
  await ctx.addInitScript(() => {
    localStorage.setItem('astrix:entered:v1', '1');
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('astrix:avatar:v1:seed:1337:gen:2', JSON.stringify({ x: -251.5, y: -5, z: -333.5, heading: 0, health: 100, stamina: 1, safe: { x: -243.5, y: 1, z: -351.5 } }));
    }
  });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const cdp = await ctx.newCDPSession(pg);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 8, radiusY: 8, force: 1 })) });
  const e = () => pg.evaluate(() => window.__metrics.explore);
  const until = async (pred, ms) => { const t0 = Date.now(); for (;;) { const v = await e(); if (pred(v)) return { ...v, waitedS: Math.round((Date.now() - t0) / 1000) }; if (Date.now() - t0 > ms) return { ...v, timeout: true }; await pg.waitForTimeout(700); } };
  const ui = () => pg.evaluate(() => ({
    dive: getComputedStyle(document.getElementById('dive-button')).display,
    breathShown: document.querySelector('#vitals .breath').classList.contains('visible'),
    bubbles: document.querySelectorAll('#vitals .bubble:not(.gone)').length,
    staminaShown: document.querySelector('#vitals .stamina').classList.contains('visible'),
    tint: getComputedStyle(document.getElementById('underwater-tint')).opacity,
    vignette: Number(getComputedStyle(document.getElementById('hurt-vignette')).opacity).toFixed(2),
    death: document.getElementById('death-screen').classList.contains('visible') ? document.getElementById('death-screen').innerText : null,
  }));
  const step = (name, data) => out.steps.push({ name, ...data });
  try {
    await pg.goto('https://astrix.local/?chain=0');
    await pg.waitForFunction(() => window.__metrics?.explore?.spawned === true, null, { timeout: 400000 });
    const start = await e();
    step('spawned on the pool bed', { y: start.y, waterSurface: start.waterSurface, mode: start.mode });
    const floated = await until((v) => v.mode === 'swim' && !v.headUnderwater && Math.abs(v.vy ?? 0) < 1 && v.y > -2, 150000);
    step('floats up and treads water', { y: floated.y, surface: floated.waterSurface, under: floated.headUnderwater, stamina: floated.stamina, waitedS: floated.waitedS, timeout: floated.timeout, ui: await ui() });
    await pg.waitForTimeout(3000);
    await pg.screenshot({ path: SHOTS + 'WTR-01-treading.png' });

    // Hold Dive with the right thumb.
    const db = await pg.locator('#dive-button').boundingBox();
    await touch('touchStart', [[9, db.x + db.width / 2, db.y + db.height / 2]]);
    const under = await until((v) => v.headUnderwater && v.breath < 0.6, 200000);
    step('dives: breath drains', { y: under.y, breath: under.breath, health: under.health, waitedS: under.waitedS, ui: await ui() });
    await pg.screenshot({ path: SHOTS + 'WTR-02-holding-breath.png' });
    const drowning = await until((v) => v.health < 75, 300000);
    step('out of breath: health drains', { breath: drowning.breath, health: drowning.health, waitedS: drowning.waitedS, ui: await ui() });
    await pg.screenshot({ path: SHOTS + 'WTR-03-drowning.png' });
    const dead = await until((v) => v.dead, 300000);
    step('drowned', { health: dead.health, deaths: dead.deaths, waitedS: dead.waitedS, ui: await ui() });
    await pg.screenshot({ path: SHOTS + 'WTR-04-drowned.png' });
    await touch('touchEnd', []);
    const back = await until((v) => !v.dead, 120000);
    await pg.waitForTimeout(4000);
    const r = await e();
    step('respawned on the bank', { x: r.x, y: r.y, z: r.z, health: r.health, breath: r.breath, mode: r.mode, deaths: r.deaths, waitedS: back.waitedS, ui: await ui() });
    await pg.screenshot({ path: SHOTS + 'WTR-05-respawned.png' });
  } catch (err) { out.error = String(err).slice(0, 300); }
  out.errors = errs;
  await ctx.close();
  return out;
}
