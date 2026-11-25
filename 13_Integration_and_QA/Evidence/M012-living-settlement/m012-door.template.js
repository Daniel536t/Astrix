async (page) => {
  // M012 Stage A probe, door run (a v2 save: the game upgrades it to v3 on load) (desktop 1000x600, software GL): restore a Node-made settlement-rules-v3
  // save, walk the founder into the pen fence and the closed gate, open the gate with E (journaled
  // set_gate), walk in and out, watch sheep and goats leave through the open gate, close it with E and
  // watch the herder bring the strays back. Samples are the game's own metrics (window.__metrics).
  const CFG = /*CFG*/null;
  const DIR = '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist';
  const OUT = '/projects/sandbox/Astrix/13_Integration_and_QA/Evidence/M012-living-settlement';
  const ctx = await page.context().browser().newContext({ viewport: { width: 1000, height: 600 } });
  await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: DIR + p }); });
  await ctx.addInitScript((storage) => { if (!sessionStorage.getItem('m012-seeded')) { for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v); sessionStorage.setItem('m012-seeded', '1'); } }, CFG.storage);
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
  const log = [], shots = [];
  const t0 = Date.now();
  const sec = () => Math.round((Date.now() - t0) / 1000);
  const sample = (label) => pg.evaluate((label) => {
    const m = window.__metrics, h = m.homestead, e = m.explore || {};
    return { label, tick: h?.tick, rules: h?.rules, px: e.x, py: e.y, pz: e.z, mode: e.mode,
      gates: h ? Object.fromEntries(h.gates.map((g) => [g.id, g.state])) : null, drawn: h?.view?.leaves ?? null,
      strays: h ? Object.fromEntries(Object.entries(h.strays).filter(([, v]) => v.length)) : null,
      going: h ? h.herd.filter((a) => a.go).map((a) => `${a.id}:${a.go}`) : null,
      v: h ? h.villagers.map((v) => ({ n: v.name, task: v.task, x: Math.round(v.x * 10) / 10, z: Math.round(v.z * 10) / 10, wait: v.nav?.wait?.reason ?? null, blocked: v.nav?.blocked?.reason ?? null })) : null,
      nearest: h?.nearest?.label ?? null, seq: m.acceptedCommands, save: m.save?.status, calls: m.rendererCalls, tris: m.rendererTriangles,
      nav: h?.navStats ? { ticks: h.navStats.ticks, tickMs: Math.round(h.navStats.tickMs * 10) / 10, maxTickMs: Math.round(h.navStats.maxTickMs * 10) / 10 } : null,
      toast: [...document.querySelectorAll('.toast, #toast, [role=status]')].map((x) => x.textContent).filter(Boolean).slice(-1)[0] ?? null };
  }, label).then((s) => { log.push({ t: sec(), ...s }); return s; });
  const shot = async (name, why) => { await pg.screenshot({ path: `${OUT}/${name}` }); shots.push({ name, why, t: sec() }); };
  const pos = () => pg.evaluate(() => ({ x: window.__metrics.explore.x, z: window.__metrics.explore.z }));
  const hold = async (key, ms) => { await pg.keyboard.down(key); await pg.waitForTimeout(ms); await pg.keyboard.up(key); await pg.waitForTimeout(250); };
  const dirs = {};
  const measure = async () => {
    for (const [k, back] of [['w', 's'], ['a', 'd'], ['s', 'w'], ['d', 'a']]) {
      const a = await pos(); await hold(k, 700); const b = await pos();
      const dx = b.x - a.x, dz = b.z - a.z, n = Math.hypot(dx, dz) || 1;
      dirs[k] = { x: dx / n, z: dz / n, speed: n };
      await hold(back, 700);
    }
  };
  const goto = async (x, z, tol = 0.3) => {
    for (let i = 0; i < 120; i++) {
      const p = await pos(), dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d < tol) return p;
      const [k, dir] = Object.entries(dirs).sort((a, b) => (b[1].x * dx + b[1].z * dz) - (a[1].x * dx + a[1].z * dz))[0];
      const along = (dir.x * dx + dir.z * dz);
      await hold(k, Math.max(60, Math.min(900, (along / (dir.speed / 0.7)) * 1000 * 0.6)));
    }
    return pos();
  };
  /** Stand next to the gate and make sure E will work it (the HUD's nearest action names the gate). */
  const useGate = async (x, z, want) => {
    await goto(x, z);
    for (let i = 0; i < 6; i++) {
      const n = await pg.evaluate(() => window.__metrics.homestead?.nearest?.label ?? '');
      if (n.includes(want)) { await press('e'); return n; }
      await goto(x, z, 0.15);
    }
    return null;
  };
  const keyFor = (wx, wz) => Object.entries(dirs).sort((a, b) => (b[1].x * wx + b[1].z * wz) - (a[1].x * wx + a[1].z * wz))[0][0];
  const press = async (key) => { await pg.keyboard.press(key); await pg.waitForTimeout(1200); };

  await pg.goto('https://astrix.local/?chain=0');
  await pg.waitForFunction(() => window.__metrics?.explore?.spawned && window.__metrics?.homestead, null, { timeout: 400000 });
  let stable = 0;
  for (let i = 0; i < 30 && stable < 2; i++) { await pg.waitForTimeout(4000); const p = await pg.evaluate(() => window.__metrics.pendingChunkBuilds); stable = p === 0 ? stable + 1 : 0; }
  await sample('loaded (upgraded?)');
  const upgradeToast = await pg.evaluate(() => [...document.querySelectorAll('.toast, #toast, [role=status]')].map((x) => x.textContent).join(' | '));
  await measure();
  // Square the camera up: W should walk straight along -z (toward the house front).
  for (let r = 0; r < 3; r++) {
    const err = Math.atan2(-dirs.w.x, -dirs.w.z);
    if (Math.abs(err) < 0.04) break;
    const dx = err / 0.005;
    await pg.mouse.move(500, 300); await pg.mouse.down(); for (let k = 1; k <= 6; k++) { await pg.mouse.move(500 + dx * k / 6, 300); await pg.waitForTimeout(150); } await pg.mouse.up();
    await pg.waitForTimeout(800);
    await measure();
  }
  const D = CFG.door; // door cell [x, z]; front wall z = D[1] + 1
  const wallZ = D[1] + 1, fwd = keyFor(0, -1);
  await goto(D[0] + 0.5, wallZ + 2.5, 0.15);
  await sample('in front of the door');
  await shot('door-0-front.png', 'the farmhouse front, door closed');
  await hold(fwd, 3000);
  await sample('pressed into the closed door');
  await shot('door-1-closed-blocks.png', 'the closed door holds the founder');
  await useGate(D[0] + 0.5, wallZ + 0.5, 'Open the farmhouse door');
  await sample('E: door opened');
  await goto(D[0] + 0.5, wallZ + 2.8, 0.2);
  await sample('stepped back');
  await shot('door-2-open.png', 'door leaf swung open (drawn from the sim state)');
  await hold(fwd, 3000);
  await sample('walked into the doorway');
  await shot('door-3-in-doorway.png', 'in the doorway; the house behind it is solid');
  await press('e');
  await sample('E from inside: door closed');
  await shot('door-4-closed-from-inside.png', 'closed from inside');
  await press('e');
  await sample('E from inside: door opened');
  await hold(keyFor(0, 1), 2500);
  await sample('walked out');
  await shot('door-5-out-door-open.png', 'out again');
  await useGate(D[0] + 0.5, wallZ + 0.8, 'Close the farmhouse door');
  await pg.waitForTimeout(1500);
  await goto(D[0] + 0.5, wallZ + 2.8, 0.2);
  await sample('door closed again');
  await shot('door-6-closed.png', 'door leaf back in the frame');
  // Into the wall beside the door.
  await goto(D[0] - 2, wallZ + 2, 0.2);
  await hold(fwd, 3000);
  await sample('pressed into the wall');
  await pg.waitForTimeout(30000);
  await sample('end');
  const sections = await pg.evaluate(() => window.__metrics.sections);
  const breakdown = await pg.evaluate(() => window.__renderBreakdown ? window.__renderBreakdown().totals : null);
  await ctx.close();
  return { errs, upgradeToast, dirs, shots, breakdown, sections, log };
}
