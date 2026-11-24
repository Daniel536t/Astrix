async (page) => {
  const DIR = '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist';
  const SHOTS = '/projects/sandbox/.kiro/artifacts/screenshots/';
  const out = { steps: [] };
  const ctx = await page.context().browser().newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await ctx.route(/^https:\/\/astrix\.local\//, async (route) => {
    let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0];
    if (p === '/' || p === '') p = '/index.html';
    await route.fulfill({ path: DIR + p });
  });
  await ctx.addInitScript(() => { localStorage.setItem('astrix:entered:v1', '1'); });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const cdp = await ctx.newCDPSession(pg);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 8, radiusY: 8, force: 1 })) });
  const m = () => pg.evaluate(() => { const x = window.__metrics; return { e: x.explore, t: x.touch, cam: window.__probe.camera.position.toArray().map((v) => Math.round(v * 100) / 100) }; });
  const step = (name, data) => out.steps.push({ name, ...data });
  try {
    await pg.goto('https://astrix.local/?chain=0');
    await pg.waitForFunction(() => window.__metrics?.explore?.spawned === true, null, { timeout: 120000 });
    await pg.waitForFunction(() => window.__metrics?.explore?.grounded === true, null, { timeout: 120000 });
    const m0 = await m();
    step('spawned', { pos: [m0.e.x, m0.e.z], mode: m0.e.mode });

    // Thumb down on the left half, push up ~2/3 of the radius: walk.
    await touch('touchStart', [[1, 130, 300]]);
    await touch('touchMove', [[1, 130, 280]]);
    await touch('touchMove', [[1, 130, 262]]);
    await pg.waitForTimeout(6000);
    const m1 = await m();
    step('hold joystick (walk)', { stick: m1.t, speed: m1.e.speed, moved: Math.hypot(m1.e.x - m0.e.x, m1.e.z - m0.e.z).toFixed(2) });
    await pg.screenshot({ path: SHOTS + 'CTL-after-joystick-walk.png' });

    // Second finger drags on the right half to look while the left thumb keeps walking.
    await touch('touchMove', [[1, 130, 262], [2, 640, 200]]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[1, 130, 262], [2, 640 - i * 15, 200]]);
    await pg.waitForTimeout(3000);
    const m2 = await m();
    step('second finger looks while walking', { stick: m2.t.stick, speed: m2.e.speed, cameraMoved: JSON.stringify(m2.cam) !== JSON.stringify(m1.cam) });
    await touch('touchMove', [[1, 130, 262]]); // CDP: a point missing from the next event is released (lifts the look finger only)
    await pg.waitForTimeout(4000);
    const m3 = await m();
    step('lift look finger: still walking', { stick: m3.t.stick, speed: m3.e.speed });

    // Push to the rim: run.
    await touch('touchMove', [[1, 130, 236]]);
    await touch('touchMove', [[1, 130, 228]]);
    await pg.waitForTimeout(6000);
    const m4 = await m();
    step('push to rim (run)', { run: m4.t.run, speed: m4.e.speed });

    // Lift the thumb: must stop at once.
    await touch('touchEnd', []);
    await pg.waitForTimeout(5000);
    const m5 = await m();
    step('lift thumb: stops', { stick: m5.t.stick, speed: m5.e.speed });
    const p5 = [m5.e.x, m5.e.z];
    await pg.waitForTimeout(4000);
    const m6 = await m();
    step('stays stopped', { drift: Math.hypot(m6.e.x - p5[0], m6.e.z - p5[1]).toFixed(3) });

    // OS steals the touch (blur without touchend): must not keep walking.
    await touch('touchStart', [[3, 130, 300]]);
    await touch('touchMove', [[3, 130, 262]]);
    await pg.waitForTimeout(5000);
    const m6b = await m();
    step('second hold walks', { speed: m6b.e.speed });
    await pg.evaluate(() => window.dispatchEvent(new Event('blur')));
    await pg.waitForTimeout(5000);
    const m7 = await m();
    step('blur while holding: stops', { stick: m7.t.stick, speed: m7.e.speed });
    await touch('touchEnd', []);

    // Jump button while walking with the stick.
    const jb = await pg.locator('#jump-button').boundingBox();
    const y0 = (await m()).e.y;
    await touch('touchStart', [[4, 130, 300]]);
    await touch('touchMove', [[4, 130, 262]]);
    await pg.waitForTimeout(3000);
    await touch('touchMove', [[4, 130, 262], [5, jb.x + jb.width / 2, jb.y + jb.height / 2]]);
    let maxRise = 0, sawAir = false, held = false;
    for (let i = 0; i < 16; i++) {
      await pg.waitForTimeout(500);
      const q = await m();
      held = held || await pg.evaluate(() => document.getElementById('jump-button').classList.contains('held'));
      maxRise = Math.max(maxRise, q.e.y - y0); sawAir = sawAir || q.e.mode === 'air';
    }
    await touch('touchMove', [[4, 130, 262]]); // lift the jump finger, keep walking
    await pg.waitForTimeout(3000);
    const m9 = await m();
    await touch('touchEnd', []);
    step('jump while walking', { jumpHeldClass: held, sawAir, maxRise: maxRise.toFixed(2), stillWalking: m9.t.stick, speed: m9.e.speed });
    await pg.screenshot({ path: SHOTS + 'CTL-after-idle.png' });
  } catch (e) { out.error = String(e).slice(0, 300); }
  out.errors = errs;
  await ctx.close();
  return out;
}
