async (page) => {
  // M011 swimming desktop probe (1000x600, software GL). The saved avatar position is put in the
  // 2 m deep river west of the spawn (-59.5, 4.5); the game spawns on the river bed and floats up.
  const DIR = '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist';
  const OUT = '/projects/sandbox/Astrix/13_Integration_and_QA/Evidence/M011-swimming';
  const ctx = await page.context().browser().newContext({ viewport: { width: 1000, height: 600 } });
  await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: DIR + p }); });
  await ctx.addInitScript(() => {
    localStorage.setItem('astrix:entered:v1', '1');
    if (!sessionStorage.getItem('m011-seeded')) {
      sessionStorage.setItem('m011-seeded', '1');
      localStorage.setItem('astrix:avatar:v1:seed:1337:gen:2', JSON.stringify({ x: -59.5, y: 100, z: 4.5, heading: 0, health: 100, stamina: 1 }));
    }
  });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
  const samples = [];
  const t0 = Date.now();
  const sample = async (label) => {
    const s = await pg.evaluate(() => {
      const e = window.__metrics.explore || {}; const m = window.__metrics;
      const cam = window.__probe.camera.position;
      return { x: e.x, y: e.y, z: e.z, mode: e.mode, breath: e.breath, stamina: e.stamina, health: e.health, headUnderwater: e.headUnderwater,
        waterSurface: e.waterSurface, eyeAboveWater: Math.round((e.y + 1.5 - e.waterSurface) * 100) / 100, vy: e.vy, speed: e.speed,
        camAboveWater: Math.round((cam.y - e.waterSurface) * 100) / 100, calls: m.rendererCalls, tris: m.rendererTriangles,
        underwaterClass: document.body.classList.contains('underwater'), diveShown: getComputedStyle(document.getElementById('dive-button')).display !== 'none' };
    });
    samples.push({ label, t: Math.round((Date.now() - t0) / 100) / 10, ...s });
    return s;
  };
  const shot = (name) => pg.screenshot({ path: OUT + '/' + name });
  const series = async (label, seconds, every = 1000) => { for (let i = 0; i < seconds * 1000 / every; i++) { await pg.waitForTimeout(every); await sample(label); } };

  await pg.goto('https://astrix.local/?chain=0');
  await pg.waitForFunction(() => window.__metrics?.explore?.spawned, null, { timeout: 400000 });
  let stable = 0;
  for (let i = 0; i < 40 && stable < 2; i++) { await pg.waitForTimeout(5000); const p = await pg.evaluate(() => window.__metrics.pendingChunkBuilds); stable = p === 0 ? stable + 1 : 0; }
  await sample('loaded');
  // Zoom in for a close view of the swimmer.
  await pg.mouse.move(500, 300);
  for (let i = 0; i < 4; i++) { await pg.mouse.wheel(0, -120); await pg.waitForTimeout(100); }
  // 1. At rest for 20 s: floating, treading.
  await series('rest', 20);
  await shot('desktop-1-treading.png');
  // 2. Swim forward (W): breaststroke at the surface; shots a moment apart (different stroke phases).
  await pg.keyboard.down('w');
  await pg.waitForTimeout(1500); await sample('stroke'); await shot('desktop-2a-stroke.png');
  await pg.waitForTimeout(450); await sample('stroke'); await shot('desktop-2b-stroke.png');
  await pg.waitForTimeout(400); await sample('stroke'); await shot('desktop-2c-stroke.png');
  await pg.keyboard.up('w');
  await series('glide to rest', 3);
  // 3. Low camera orbit: the lens stays above the water while floating.
  await pg.mouse.move(500, 300); await pg.mouse.down(); await pg.mouse.move(500, 120, { steps: 10 }); await pg.mouse.up();
  await pg.waitForTimeout(800); await sample('low camera'); await shot('desktop-3-low-camera.png');
  await pg.mouse.move(500, 200); await pg.mouse.down(); await pg.mouse.move(500, 560, { steps: 12 }); await pg.mouse.up(); await pg.waitForTimeout(500); await sample('high camera for the dive');
  // 4. Hold C: dive.
  await pg.keyboard.down('c');
  await series('dive (C held)', 2.5, 500);
  await shot('desktop-4a-dive.png');
  await pg.keyboard.down('s');
  await series('dive + swim back toward deep water (C+S)', 1.5, 500);
  await shot('desktop-4b-underwater-stroke.png');
  await pg.keyboard.up('s');
  await pg.keyboard.up('c');
  // 5. Released: buoyancy brings the swimmer up.
  await series('released (buoyancy)', 5, 500);
  // 6. Dive again, then hold Space: swim up faster.
  await pg.keyboard.down('c'); await pg.waitForTimeout(1500); await pg.keyboard.up('c');
  await sample('dived again');
  await pg.keyboard.down('Space');
  await series('Space held (swim up)', 3, 500);
  await pg.keyboard.up('Space');
  await series('rest again', 4);
  await shot('desktop-5-back-at-surface.png');
  const breakdown = await pg.evaluate(() => window.__renderBreakdown ? window.__renderBreakdown().totals : null);
  await ctx.close();
  const keys = ['label', 't', 'mode', 'y', 'eyeAboveWater', 'headUnderwater', 'breath', 'stamina', 'health', 'vy', 'speed', 'camAboveWater', 'calls', 'tris'];
  return { errs, breakdown, keys, rows: samples.map((r) => keys.map((k) => r[k])) };
}
