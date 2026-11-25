async (page) => {
  // M011 swimming, emulated phone (NOT a real phone): Playwright Chromium 390x844, deviceScaleFactor 3,
  // isMobile, hasTouch, software GL. Touch via CDP Input.dispatchTouchEvent (joystick, Dive, Jump).
  const DIR = '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist';
  const OUT = '/projects/sandbox/Astrix/13_Integration_and_QA/Evidence/M011-swimming';
  const ctx = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: DIR + p }); });
  await ctx.addInitScript(() => {
    localStorage.setItem('astrix:entered:v1', '1');
    if (!sessionStorage.getItem('m011-seeded')) {
      sessionStorage.setItem('m011-seeded', '1');
      localStorage.setItem('astrix:avatar:v1:seed:1337:gen:2', JSON.stringify({ x: -59.5, y: 100, z: 4.5, heading: 0, health: 100, stamina: 1 }));
    }
  });
  const pg = await ctx.newPage();
  const cdp = await ctx.newCDPSession(pg);
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
  const samples = [];
  const t0 = Date.now();
  const sample = async (label) => {
    const s = await pg.evaluate(() => {
      const e = window.__metrics.explore || {}; const m = window.__metrics; const cam = window.__probe.camera.position;
      const d = document.getElementById('dive-button'); const r = d.getBoundingClientRect();
      return { mode: e.mode, y: e.y, eyeAboveWater: Math.round((e.y + 1.5 - e.waterSurface) * 100) / 100, headUnderwater: e.headUnderwater,
        breath: e.breath, stamina: e.stamina, health: e.health, vy: e.vy, speed: e.speed, camAboveWater: Math.round((cam.y - e.waterSurface) * 100) / 100,
        calls: m.rendererCalls, tris: m.rendererTriangles, diveShown: getComputedStyle(d).display !== 'none' && r.width > 0 };
    });
    samples.push({ label, t: Math.round((Date.now() - t0) / 100) / 10, ...s });
  };
  const shot = (name) => pg.screenshot({ path: OUT + '/' + name });
  const series = async (label, seconds, every = 1000) => { for (let i = 0; i < seconds * 1000 / every; i++) { await pg.waitForTimeout(every); await sample(label); } };
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const center = (id) => pg.evaluate((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, id);

  await pg.goto('https://astrix.local/?chain=0');
  await pg.waitForFunction(() => window.__metrics?.explore?.spawned, null, { timeout: 400000 });
  let stable = 0;
  for (let i = 0; i < 40 && stable < 2; i++) { await pg.waitForTimeout(5000); const p = await pg.evaluate(() => window.__metrics.pendingChunkBuilds); stable = p === 0 ? stable + 1 : 0; }
  await sample('loaded (phone)');
  for (let i = 0; i < 3; i++) { await pg.evaluate(() => document.querySelector('.zoomers button')?.click()); await pg.waitForTimeout(150); }
  await series('rest', 10);
  await shot('mobile-1-treading.png');
  // Joystick: thumb on the left half, pushed up = swim forward.
  await touch('touchStart', [{ x: 100, y: 700, id: 1 }]);
  for (let i = 1; i <= 5; i++) { await touch('touchMove', [{ x: 100, y: 700 - 10 * i, id: 1 }]); await pg.waitForTimeout(40); }
  await pg.waitForTimeout(1500); await sample('joystick: stroke'); await shot('mobile-2a-stroke.png');
  await pg.waitForTimeout(450); await sample('joystick: stroke'); await shot('mobile-2b-stroke.png');
  await touch('touchEnd', []);
  await series('glide to rest', 3);
  // Hold Dive (second finger id, as on a phone).
  const dive = await center('dive-button');
  await touch('touchStart', [{ x: dive.x, y: dive.y, id: 5 }]);
  await series('Dive held', 3, 500);
  await shot('mobile-3-diving.png');
  await touch('touchEnd', []);
  await series('Dive released (buoyancy)', 4, 500);
  // Dive, then hold Jump: swim up.
  await touch('touchStart', [{ x: dive.x, y: dive.y, id: 5 }]); await pg.waitForTimeout(1500); await touch('touchEnd', []);
  await sample('dived again');
  const jump = await center('jump-button');
  await touch('touchStart', [{ x: jump.x, y: jump.y, id: 6 }]);
  await series('Jump held (swim up)', 2, 500);
  await touch('touchEnd', []);
  await series('rest again', 3);
  await shot('mobile-4-back-at-surface.png');
  const breakdown = await pg.evaluate(() => window.__renderBreakdown ? window.__renderBreakdown().totals : null);
  await ctx.close();
  const keys = ['label', 't', 'mode', 'y', 'eyeAboveWater', 'headUnderwater', 'breath', 'stamina', 'health', 'vy', 'speed', 'camAboveWater', 'diveShown', 'calls', 'tris'];
  return { errs, breakdown, keys, rows: samples.map((r) => keys.map((k) => r[k])) };
}
