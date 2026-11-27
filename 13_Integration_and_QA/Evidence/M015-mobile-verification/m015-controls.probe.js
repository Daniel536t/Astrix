async (page) => {
  // M015 emulated touch control flows (EMULATED, not a real device): Playwright Chromium, isMobile + hasTouch,
  // deviceScaleFactor 1, software GL. Touches go through CDP Input.dispatchTouchEvent (real touch -> pointer
  // events, multi-touch capable), taps on UI through the touchscreen. Fresh world (?chain=0). Flows:
  // joystick walk + release stops, jump, double jump, Plant banner, To banner, Home, Farm panel job change,
  // build mode (tap the ground, Turn 90°, Place & approve), Use opens the pen gate, Use gathers from a tree,
  // swim + Dive (hold) + float back up. Viewports in parallel (CFG.vps).
  const ALL = /*CFG*/{
    base: 'https://astrix.local/',
    dist: '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist',
    out: '/projects/sandbox/Astrix/13_Integration_and_QA/Evidence/M015-mobile-verification',
    prefix: 'ctl',
    vps: ['p390', 't1280'],
    extra: '&metrics=1',
  }/*END*/;
  const VP = { p360: { w: 360, h: 780 }, p390: { w: 390, h: 844 }, l844: { w: 844, h: 390 }, t1280: { w: 1280, h: 800 }, t800: { w: 800, h: 1280 } };
  const one = async (CFG) => {
    const ctx = await page.context().browser().newContext({ viewport: { width: CFG.w, height: CFG.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, acceptDownloads: true });
    await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: CFG.dist + p }); });
    await ctx.addInitScript(() => {
      if (!sessionStorage.getItem('m015-fresh')) { localStorage.clear(); localStorage.setItem('astrix:entered:v1', '1'); sessionStorage.setItem('m015-fresh', '1'); }
      const seed = sessionStorage.getItem('m015-avatar');
      if (seed) { localStorage.setItem('astrix:avatar:v1:seed:1337:gen:2', seed); sessionStorage.removeItem('m015-avatar'); }
    });
    const pg = await ctx.newPage();
  pg.setDefaultNavigationTimeout(240000);
    const cdp = await ctx.newCDPSession(pg);
    const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
    const t0 = Date.now();
    const sec = () => Math.round((Date.now() - t0) / 100) / 10;
    const results = {}, shots = [];
    const shot = async (name) => { const file = `${CFG.prefix}-${CFG.vp}-${name}.png`; await pg.screenshot({ path: `${CFG.out}/${file}` }); shots.push(file); };
    const ex = () => pg.evaluate(() => ({ ...window.__metrics.explore, wood: window.__metrics.inventory?.wood ?? 0 }));
    const settle = async () => { let st = 0; for (let i = 0; i < 30 && st < 2; i++) { await pg.waitForTimeout(2000); const p = await pg.evaluate(() => window.__metrics?.pendingChunkBuilds ?? 1); st = p === 0 ? st + 1 : 0; } };
    const load = async (avatar) => {
      if (avatar) await pg.evaluate((a) => sessionStorage.setItem('m015-avatar', JSON.stringify(a)), avatar);
      await pg.goto(`${CFG.base}?chain=0${CFG.extra}`);
      await pg.waitForFunction(() => window.__metrics?.explore?.spawned && window.__metrics?.homestead, null, { timeout: 400000 });
      await settle();
      await pg.waitForTimeout(1500);
    };
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    const center = (sel) => pg.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return s.display === 'none' || !r.width ? null : { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
    const tap = async (sel) => { const c = await center(sel); if (!c) throw new Error(`${sel} not shown`); await pg.waitForTimeout(200); const d = await center(sel); await pg.touchscreen.tap(d.x, d.y); await pg.waitForTimeout(900); };
    const press = async (sel, ms, id = 5) => { const c = await center(sel); if (!c) return false; await touch('touchStart', [{ x: c.x, y: c.y, id }]); await pg.waitForTimeout(ms); await touch('touchEnd', []); return true; };
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const rec = (k, ok, detail) => { results[k] = { ok: !!ok, ...detail }; };
    // Wait for a condition on window.__metrics (refreshed every frame with ?metrics=1). Software GL runs at a
    // few fps here and the animation step is capped at 0.1 s, so game time runs slower than wall time.
    const until = async (fn, arg, ms = 30000) => { try { await pg.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch { return false; } };
    const frames = () => pg.evaluate(() => window.__metrics.frameWork.frames);
    const afterFrames = async (n) => { const f0 = await frames(); await until((f) => window.__metrics.frameWork.frames >= f, f0 + n, 60000); };
    const fps = () => pg.evaluate(() => { const p = window.__metrics.frameInterval.p50Ms; return p > 0 ? Math.round(10000 / p) / 10 : 0; });
    // A page-side sampler: the highest explore.y seen on any frame since reset.
    await ctx.addInitScript(() => {
      window.__m015 = { peak: -1e9, reset() { this.peak = -1e9; } };
      const raf = window.requestAnimationFrame.bind(window);
      const tick = () => { const y = window.__metrics?.explore?.y; if (typeof y === 'number' && y > window.__m015.peak) window.__m015.peak = y; raf(tick); };
      raf(tick);
    });
    const stickDown = async () => {
      const x = Math.round(CFG.w * 0.18), y = CFG.h - 130;
      await touch('touchStart', [{ x, y, id: 1 }]);
      for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x, y: y - (44 * i) / 6, id: 1 }]); await pg.waitForTimeout(40); }
    };
    // Walk until `m` metres from the start (or 60 s), then lift the thumb.
    const walk = async (m) => {
      const p0 = await ex();
      await stickDown();
      const ok = await until(([x, z, m]) => Math.hypot(window.__metrics.explore.x - x, window.__metrics.explore.z - z) > m, [p0.x, p0.z, m], 60000);
      const mid = await pg.evaluate(() => ({ speed: window.__metrics.explore.speed, stick: window.__metrics.touch?.stick }));
      await touch('touchEnd', []);
      return { ok, p0, mid };
    };

    try {
      // ---- 1. walk with the joystick; lifting the thumb stops ----
      await load(null);
      const first = await pg.evaluate(() => { const h = window.__metrics.homestead; return { anchor: h.anchor, trees: (h.woodland?.trees ?? []).filter((t) => t.present && /mature|old/.test(t.stage)).map((t) => ({ id: t.id, x: t.x, z: t.z, stage: t.stage })) }; });
      results.fps = await fps();
      const w = await walk(1.5);
      const stopped = await until(() => window.__metrics.touch?.stick === false && window.__metrics.explore.speed < 0.2, null, 30000);
      const a1 = await ex(); await afterFrames(10); const a2 = await ex();
      rec('joystickWalk', w.ok && w.mid.stick && w.mid.speed > 0.3 && stopped && dist(a1, a2) < 0.05, { moved: Math.round(dist(w.p0, a1) * 100) / 100, speedWhileHeld: w.mid.speed, stoppedAfterRelease: stopped, driftAfterStopM: Math.round(dist(a1, a2) * 1000) / 1000 });
      await shot('1-walked');
      // ---- 2. jump and double jump (the second tap once airborne) ----
      const jump = async (double) => {
        await until(() => window.__metrics.explore.grounded, null, 20000);
        const y0 = (await ex()).y;
        await pg.evaluate(() => window.__m015.reset());
        const c = await center('#jump-button');
        await touch('touchStart', [{ x: c.x, y: c.y, id: 7 }]); await afterFrames(1); await touch('touchEnd', []);
        const air = await until(() => !window.__metrics.explore.grounded, null, 20000);
        // At ~1 fps the jump peaks within 3 frames: tap again on the first airborne frame (a later tap is
        // buffered as a ground jump instead of an air jump).
        if (double) { await until((y) => window.__metrics.explore.y > y + 0.05, y0, 20000); await touch('touchStart', [{ x: c.x, y: c.y, id: 8 }]); await afterFrames(1); await touch('touchEnd', []); }
        await until(() => window.__metrics.explore.grounded, null, 40000);
        const rise = Math.round((await pg.evaluate(() => window.__m015.peak) - y0) * 100) / 100;
        return { air: air || rise > 0.3, rise };
      };
      const j1 = await jump(false);
      const j2 = await jump(true);
      rec('jump', j1.air && j1.rise > 0.3, j1);
      rec('doubleJump', j2.air && j2.rise > j1.rise + 0.15, { ...j2, single: j1.rise });
      // ---- 3. banners: Plant, walk away, To banner, Home ----
      await tap('#plant-banner-button');
      const plantedOk = await until(() => !!window.__metrics.explore.banners.field, null, 20000);
      const planted = (await ex()).banners.field;
      await walk(4);
      await until(() => window.__metrics.explore.speed < 0.2, null, 20000);
      const away = await ex();
      const r0 = away.banners.returns;
      await press('#return-banner-button', 150);
      const chan = await until(() => window.__metrics.explore.banners.channel === 'field', null, 10000);
      const returned = await until((r) => window.__metrics.explore.banners.returns > r, r0, 90000);
      await afterFrames(5);
      const back = await ex();
      rec('plantBanner', plantedOk, { planted });
      rec('toBanner', returned && !!planted && dist(away, planted) > 2 && dist(back, planted) < 3, { awayM: planted ? Math.round(dist(away, planted) * 10) / 10 : null, afterM: planted ? Math.round(dist(back, planted) * 10) / 10 : null, channelled: chan });
      await press('#return-home-button', 150);
      const homeOk = await until((r) => window.__metrics.explore.banners.returns > r + 1, r0, 90000);
      await afterFrames(5);
      const home = await ex();
      rec('home', homeOk && !!home.banners.home && dist(home, home.banners.home) < 4, { homeM: home.banners.home ? Math.round(dist(home, home.banners.home) * 10) / 10 : null, returns: home.banners.returns });
      await shot('2-home');
      // ---- 4. Farm panel: give Cora a job (scroll to her row, tap the select, choose) ----
      await tap('#farm-button');
      const role0 = await pg.evaluate(() => window.__metrics.homestead.villagers.find((v) => v.id === 'villager:2').role);
      const want = role0 === 'woodcutter' ? 'builder' : 'woodcutter';
      const sel = await center('select[data-role-of="villager:2"]');
      await pg.touchscreen.tap(sel.x, sel.y);
      await pg.waitForTimeout(600);
      // The native picker cannot be driven by touch in headless Chromium; choose the option as the picker would.
      await pg.selectOption('select[data-role-of="villager:2"]', want, { timeout: 15000, force: true });
      const jobOk = await until((w) => window.__metrics.homestead.villagers.find((v) => v.id === 'villager:2').role === w, want, 30000);
      await shot('3-farm-job');
      rec('farmJob', jobOk, { from: role0, want, to: await pg.evaluate(() => window.__metrics.homestead.villagers.find((v) => v.id === 'villager:2').role) });
      // ---- 5. build: Farm -> Build..., tap the ground, Turn 90°, Place & approve ----
      await tap('[data-build-open]');
      await until(() => window.__metrics.homestead.build.active, null, 20000);
      const b0 = await pg.evaluate(() => window.__metrics.homestead.build);
      let b = b0; const tried = [];
      for (const [fx, fy] of [[0.75, 0.62], [0.82, 0.55], [0.68, 0.7], [0.85, 0.68], [0.7, 0.5], [0.9, 0.6], [0.62, 0.58]]) {
        const sx = Math.round(CFG.w * fx), sy = Math.round(CFG.h * fy);
        await pg.touchscreen.tap(sx, sy);
        await until(() => window.__metrics.homestead.build.pinned, null, 15000); await afterFrames(4);
        b = await pg.evaluate(() => window.__metrics.homestead.build);
        tried.push({ at: [sx, sy], pos: b.pos, ok: b.check?.ok, pinned: b.pinned });
        if (b.check?.ok && b.pinned) break;
      }
      await tap('[data-build-turn]');
      const turned = await until((r) => window.__metrics.homestead.build.rot !== r, b.rot, 20000);
      await afterFrames(4);
      let t = await pg.evaluate(() => window.__metrics.homestead.build);
      if (!t.check?.ok) for (const [fx, fy] of [[0.78, 0.6], [0.7, 0.66], [0.86, 0.52]]) { await pg.touchscreen.tap(Math.round(CFG.w * fx), Math.round(CFG.h * fy)); await afterFrames(6); t = await pg.evaluate(() => window.__metrics.homestead.build); if (t.check?.ok) break; }
      await shot('4-build-turned');
      await tap('[data-build-place]');
      const placed = await until(() => window.__metrics.homestead.sites.length > 0, null, 30000);
      const sites = await pg.evaluate(() => window.__metrics.homestead.sites.map((s) => ({ kind: s.kind, x: s.x, z: s.z, rot: s.rot, state: s.state })));
      rec('buildPlace', b0.active && tried.some((q) => q.pinned) && turned && placed && sites[0]?.state === 'approved' && sites[0]?.rot === t.rot, { tried, turnedRot: t.rot, sites });
      await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
      // ---- 6. Use opens the pen gate ----
      const ax = first.anchor.x, az = first.anchor.z;
      await load({ x: ax - 2 + 0.5, y: 100, z: az - 0.8, heading: Math.PI, health: 100, stamina: 1 });
      await until(() => /gate/i.test(document.getElementById('gather-nearest')?.textContent ?? ''), null, 20000);
      const gate0 = await pg.evaluate(() => ({ label: document.getElementById('gather-nearest')?.textContent, state: window.__metrics.homestead.gates.find((g) => g.id === 'gate:pen')?.state ?? 'closed' }));
      await tap('#gather-nearest');
      const gateOk = await until(() => window.__metrics.homestead.gates.find((g) => g.id === 'gate:pen')?.state === 'open', null, 20000);
      await shot('5-gate');
      rec('useGate', /gate/i.test(gate0.label ?? '') && gateOk, { button: gate0.label, before: gate0.state, after: await pg.evaluate(() => window.__metrics.homestead.gates.find((g) => g.id === 'gate:pen')?.state) });
      // ---- 7. Use gathers from a tree away from the homestead ----
      const tree = first.trees.map((q) => ({ ...q, d: Math.hypot(q.x - ax, q.z - az) })).filter((q) => q.d > 18).sort((a, c) => a.d - c.d)[0];
      if (tree) {
        await load({ x: tree.x + 1.3, y: 100, z: tree.z + 0.2, heading: -Math.PI / 2, health: 100, stamina: 1 });
        const g0 = await pg.evaluate(() => ({ reachable: window.__metrics.explore.reachable, harvested: window.__metrics.harvested, label: document.getElementById('gather-nearest')?.textContent }));
        await tap('#gather-nearest');
        const gOk = await until(() => /^harvested \d+ wood/.test(window.__metrics.lastAction), null, 20000);
        await shot('6-gather');
        rec('gatherTree', !!g0.reachable && gOk, { tree: tree.id, stage: tree.stage, reachable: g0.reachable, button: g0.label, lastAction: await pg.evaluate(() => window.__metrics.lastAction) });
      } else rec('gatherTree', false, { note: 'no mature tree found away from the homestead' });
      // ---- 8. swim, hold Dive, release: float back up ----
      await load({ x: -59.5, y: 100, z: 4.5, heading: 0, health: 100, stamina: 1 });
      const swimming = await until(() => window.__metrics.explore.mode === 'swim', null, 30000);
      const dc = await center('#dive-button');
      let under = false, up = false;
      if (dc) {
        await touch('touchStart', [{ x: dc.x, y: dc.y, id: 9 }]);
        under = await until(() => window.__metrics.explore.headUnderwater, null, 40000);
        await afterFrames(4);
        await shot('7-diving');
        await touch('touchEnd', []);
        up = await until(() => !window.__metrics.explore.headUnderwater, null, 90000);
      }
      const s2 = await ex();
      await shot('8-surfaced');
      rec('swimDive', swimming && !!dc && under && up, { swimming, diveShown: !!dc, headUnderWhileHeld: under, surfacedAfterRelease: up, after: { mode: s2.mode, breath: s2.breath } });
      results.fpsEnd = await fps();
    } catch (e) { errs.push(`flow: ${String(e).slice(0, 300)}`); }

    const verdict = Object.fromEntries(Object.entries(results).filter(([, v]) => v && typeof v === 'object').map(([k, v]) => [k, v.ok]));
    const quality = await pg.evaluate(() => window.__metrics?.quality ?? null).catch(() => null);
    const result = { vp: CFG.vp, size: [CFG.w, CFG.h], emulated: 'Playwright Chromium mobile emulation (isMobile, hasTouch, CDP touch), software GL: NOT a real device', quality, seconds: sec(), verdict, results, shots, errs };
    try {
      const out = await ctx.newPage();
      await ctx.route(`${CFG.base}m015-results.html`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>m015</title>' }));
      await out.goto(`${CFG.base}m015-results.html`);
      const [dl] = await Promise.all([out.waitForEvent('download'), out.evaluate((r) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r], { type: 'application/json' })); a.download = 'r.json'; document.body.appendChild(a); a.click(); }, JSON.stringify(result, null, 1))]);
      await dl.saveAs(`${CFG.out}/m015-controls-${CFG.prefix}-${CFG.vp}.json`);
    } catch (e) { errs.push(`results not written: ${e}`); }
    await ctx.close();
    return { vp: CFG.vp, seconds: result.seconds, verdict, errs: errs.slice(0, 3) };
  };
  return JSON.stringify(await Promise.all(ALL.vps.map((v) => one({ ...ALL, vp: v, ...VP[v] }).catch((e) => ({ vp: v, error: String(e).slice(0, 300) })))));
}
