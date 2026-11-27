async (page) => {
  // M014 player-directed construction probe (reproducible). FRESH world (?chain=0, empty localStorage,
  // 'astrix:entered:v1' = '1'). Phases:
  //  - 'build' (desktop 1000x600): open build mode through the real Farm panel button; hover an invalid spot
  //    (red ghost and reasons); turn the woodshed (X) and hover a spot beside the woodland north of the farm
  //    (green ghost with the woodland figures); click to pin, drag the ghost (the camera must not turn), place
  //    and approve; choose a second building (well), turn it, place and approve; assign Cora woodcutter and Ada
  //    builder in the Farm panel; reload into the ?timescale= time-lapse and sample window.__metrics once a
  //    second: deliveries, building progress, the woodcutter's loads going to the woodshed, a reload in the
  //    middle of construction (same hash), and after both are finished a reload showing they persist.
  //    Then render cost with the buildings in the farm view, with the ghost open, and on the multidraw=0
  //    fallback in the forest (fixed cameras and a 20 s pan sampled every 2 s).
  //  - 'phone' (390x844, touch, isMobile): Farm -> Build..., tap the ground to move the ghost, Turn, Place &
  //    approve; checks that the build bar does not cover the joystick area or the Jump button.
  // Point it at another deployment with gen-construction.mjs. Only https://astrix.local/ is served from
  // CFG.dist (a copy of Game/dist); any other base loads from the network.
  const CFG = /*CFG*/{
    base: 'https://astrix.local/',
    dist: '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist',
    out: '/projects/sandbox/Astrix/13_Integration_and_QA/Evidence/M014-player-construction',
    prefix: 'build',
    phase: 'build',
    timescale: 30,
    untilTick: 2400,
    maxMinutes: 6,
    cam: 'mode=builder&tx=-30&tz=6&ty=8&dist=62&pitch=70&yaw=0',
    /** Woodshed (turned once: door east) beside the woodland north of the farm, then a well; candidates tried in order. */
    shed: [[-32, 20], [-33, 18], [-34, 22], [-24, 14]],
    well: [[-28, -9], [-20, -21], [-21, -18], [-16, -12]],
    invalid: [-33.5, -13.5],
  }/*END*/;
  const local = /^https:\/\/astrix\.local\//.test(CFG.base);
  const phone = CFG.phase === 'phone';
  const ctx = await page.context().browser().newContext(phone
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, acceptDownloads: true }
    : { viewport: { width: 1000, height: 600 }, acceptDownloads: true });
  if (local) await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: CFG.dist + p }); });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('m014-fresh')) { localStorage.clear(); localStorage.setItem('astrix:entered:v1', '1'); sessionStorage.setItem('m014-fresh', '1'); } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
  const t0 = Date.now();
  const sec = () => Math.round((Date.now() - t0) / 100) / 10;
  const log = [], shots = [], checks = {}, perf = {};
  const cleanCss = 'body.m014-clean #life-panel, body.m014-clean #build-panel, body.m014-clean #hud, body.m014-clean #world-panel, body.m014-clean #homestead-panel { visibility: hidden !important; }';
  const shot = async (name, why, clean = false) => {
    const file = `${CFG.prefix}-${name}.png`;
    await pg.evaluate((c) => document.body.classList.toggle('m014-clean', c), clean);
    await pg.screenshot({ path: `${CFG.out}/${file}` });
    await pg.evaluate(() => document.body.classList.remove('m014-clean'));
    shots.push({ file, why, t: sec(), tick: log.at(-1)?.tick ?? null });
  };
  const waitLoaded = async () => {
    await pg.waitForFunction(() => window.__metrics?.homestead?.woodland && window.__metrics.homestead.villagers.length === 3, null, { timeout: 600000 });
    await pg.addStyleTag({ content: cleanCss });
  };
  const settle = async () => {
    let stable = 0;
    for (let i = 0; i < 40 && stable < 2; i++) { await pg.waitForTimeout(2000); const p = await pg.evaluate(() => window.__metrics.pendingChunkBuilds); stable = p === 0 ? stable + 1 : 0; }
  };
  const paused = () => pg.evaluate(() => /settlement paused/.test(document.getElementById('hud')?.innerText ?? ''));
  const pause = async () => { if (!(await paused())) await pg.keyboard.press('p'); await pg.waitForTimeout(800); };
  const build = () => pg.evaluate(() => window.__metrics.homestead.build);
  const sample = (label) => pg.evaluate((label) => {
    const m = window.__metrics, h = m.homestead;
    const v = (id) => { const x = h.villagers.find((q) => q.id === id); return { role: x.role, task: x.task, target: x.target, op: x.legOp, last: x.lastLeg, carry: x.carry, x: Math.round(x.x * 10) / 10, z: Math.round(x.z * 10) / 10 }; };
    return { label, tick: h.tick, rules: h.rules, hash: m.stateHash, seq: m.acceptedCommands, store: h.store, reserved: h.reserved,
      sites: h.sites.map((s) => ({ id: s.id, kind: s.kind, x: s.x, z: s.z, rot: s.rot, state: s.state, delivered: s.delivered, reserved: s.reserved, work: s.work, stock: s.stock ?? null, entrance: s.entrance, progress: s.progress, status: s.status })),
      cora: v('villager:2'), ada: v('villager:0'), calls: m.rendererCalls, tris: m.rendererTriangles,
      tickMs: m.sections?.tick ? { mean: m.sections.tick.meanMs, p95: m.sections.tick.p95Ms, max: m.sections.tick.maxMs } : null,
      homeMs: m.sections?.homestead ? { mean: m.sections.homestead.meanMs, p95: m.sections.homestead.p95Ms, max: m.sections.homestead.maxMs } : null };
  }, label).then((s) => { log.push({ t: sec(), ...s }); return s; });
  // World point -> screen point through the game's own camera (read-only __probe handle).
  const toScreen = (x, y, z) => pg.evaluate(([x, y, z]) => {
    const c = window.__probe.camera; c.updateMatrixWorld();
    const mul = (M, v) => [0, 1, 2, 3].map((r) => M[r] * v[0] + M[4 + r] * v[1] + M[8 + r] * v[2] + M[12 + r] * v[3]);
    const b = mul(c.projectionMatrix.elements, mul(c.matrixWorldInverse.elements, [x, y, z, 1]));
    const r = document.querySelector('#app canvas').getBoundingClientRect();
    return [r.left + (b[0] / b[3] + 1) / 2 * r.width, r.top + (1 - b[1] / b[3]) / 2 * r.height];
  }, [x, y, z]);
  /** Move the pointer (mouse hover, or a tap on touch) until the ghost's footprint corner is (tx, tz). */
  const aim = async (tx, tz, tap = false) => {
    const b0 = await build();
    const size = b0.kind === 'woodshed' ? (b0.rot % 2 ? [2, 3] : [3, 2]) : b0.kind === 'logstore' ? (b0.rot % 2 ? [1, 2] : [2, 1]) : [2, 2];
    let gx = tx + size[0] / 2, gz = tz + size[1] / 2, y = 9, b = b0;
    for (let k = 0; k < 6; k++) {
      const [sx, sy] = await toScreen(gx, y, gz);
      if (tap) await pg.touchscreen.tap(sx, sy); else await pg.mouse.move(sx, sy, { steps: 4 });
      await pg.waitForTimeout(700);
      b = await build();
      if (!b.pos) continue;
      if (b.pos.x === tx && b.pos.z === tz) break;
      gx += tx - b.pos.x; gz += tz - b.pos.z;
    }
    await pg.waitForTimeout(500);
    return build();
  };
  const panel = async (open) => {
    const hidden = await pg.evaluate(() => document.getElementById('homestead-panel')?.hidden ?? true);
    if (hidden === open) { if (phone) await pg.tap('#farm-button'); else await pg.click('#farm-button'); }
    await pg.waitForTimeout(700);
  };
  const press = async (sel) => { if (phone) await pg.tap(sel); else await pg.click(sel); await pg.waitForTimeout(700); };

  if (CFG.phase === 'build') {
    // ---- 1. fresh world, paused, build mode through the real UI ----
    await pg.goto(`${CFG.base}?chain=0&${CFG.cam}`);
    await waitLoaded(); await settle(); await pause();
    const first = await sample('loaded');
    checks.freshWorld = { ok: first.rules === 6 && first.sites.length === 0, rules: first.rules, tick: first.tick, store: first.store };
    await shot('0-fresh-world', 'fresh world under settlement rules v6', true);
    await panel(true);
    await press('[data-build-open]');
    const opened = await build();
    // ---- 2. an invalid spot: over the farmhouse ----
    const [ix, iz] = CFG.invalid;
    const [sx, sy] = await toScreen(ix, 10, iz);
    await pg.mouse.move(sx, sy, { steps: 4 }); await pg.waitForTimeout(1200);
    const red = await build();
    checks.invalid = { ok: opened.active && red.check && !red.check.ok && red.check.reasons.length > 0, opened: opened.active, pos: red.pos, reasons: red.check?.reasons, bar: red.bar };
    await shot('1-red-ghost', `red ghost over the farmhouse: ${red.check?.reasons.join('; ')}`);
    // ---- 3. the woodshed beside the woodland, turned once (door east) ----
    await pg.keyboard.press('x'); await pg.waitForTimeout(400);
    let green = null;
    for (const [x, z] of CFG.shed) { green = await aim(x, z); if (green.check?.ok && green.pos.x === x && green.pos.z === z) break; }
    const [px, py] = await toScreen(green.pos.x + 1, 9, green.pos.z + 1.5);
    await pg.mouse.click(px, py); await pg.waitForTimeout(1200);
    green = await build();
    checks.valid = { ok: !!green.check?.ok && green.rot === 1 && green.pinned && !!green.woodland, pos: green.pos, rot: green.rot, pinned: green.pinned, check: green.check, woodland: green.woodland, viaStore: green.viaStore, bar: green.bar,
      woodlandText: await pg.evaluate(() => (document.querySelector('[data-build-woodland]')?.textContent ?? '').replace(/\s+/g, ' ').trim()), ghost: green.ghost };
    await shot('2-green-ghost-woodland', 'green ghost of the woodshed (door east) beside the woodland, with the woodland figures from woodlandStats');
    // Drag the pinned ghost two metres and back: it moves, the camera does not turn.
    const yaw0 = await pg.evaluate(() => window.__probe.camera.quaternion.toArray().join(','));
    const [gx1, gy1] = await toScreen(green.pos.x + 1, 9, green.pos.z + 1.5);
    const [gx2, gy2] = await toScreen(green.pos.x + 4, 9, green.pos.z + 1.5);
    await pg.mouse.move(gx1, gy1); await pg.mouse.down(); await pg.mouse.move(gx2, gy2, { steps: 8 }); await pg.mouse.up(); await pg.waitForTimeout(800);
    const dragged = await build();
    const yaw1 = await pg.evaluate(() => window.__probe.camera.quaternion.toArray().join(','));
    await pg.mouse.move(gx2, gy2); await pg.mouse.down(); await pg.mouse.move(gx1, gy1, { steps: 8 }); await pg.mouse.up(); await pg.waitForTimeout(1200);
    const back = await build();
    checks.drag = { ok: dragged.pos.x !== green.pos.x && yaw0 === yaw1 && back.pos.x === green.pos.x && back.pos.z === green.pos.z, from: green.pos, to: dragged.pos, back: back.pos, cameraTurned: yaw0 !== yaw1 };
    if (!back.check?.ok || back.pos.x !== green.pos.x) await aim(green.pos.x, green.pos.z);
    await press('[data-build-place]');
    const afterShed = await sample('placed-shed');
    // ---- 4. a second building: a well, turned to face north ----
    await press('[data-build-kind="well"]');
    await pg.keyboard.press('x'); await pg.waitForTimeout(400);
    let well = null;
    for (const [x, z] of CFG.well) { well = await aim(x, z); if (well.check?.ok && well.pos.x === x && well.pos.z === z) break; }
    const [wx, wy] = await toScreen(well.pos.x + 1, 9, well.pos.z + 1);
    await pg.mouse.click(wx, wy); await pg.waitForTimeout(1000);
    well = await build();
    await shot('3-second-building-ghost', `well ghost (door ${['south', 'east', 'north', 'west'][well.rot]}): ${well.bar}`);
    await press('[data-build-place]');
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
    const placed = await sample('placed-both');
    checks.placed = { ok: placed.sites.length === 2 && placed.sites.every((s) => s.state === 'approved') && placed.sites[0].rot === 1 && placed.sites[1].rot === 2 && (await build()).active === false,
      sites: placed.sites.map((s) => ({ id: s.id, kind: s.kind, x: s.x, z: s.z, rot: s.rot, state: s.state, reserved: s.reserved })), commands: placed.seq - first.seq, afterShedSites: afterShed.sites.length };
    // ---- 5. jobs through the Farm panel ----
    await panel(true);
    await pg.selectOption('select[data-role-of="villager:2"]', 'woodcutter'); await pg.waitForTimeout(600);
    await pg.selectOption('select[data-role-of="villager:0"]', 'builder'); await pg.waitForTimeout(600);
    await pg.selectOption('select[data-wpolicy="harvest"]', 'demand'); await pg.waitForTimeout(600);
    await pg.evaluate(() => document.querySelector('[data-sites]')?.scrollIntoView());
    await shot('4-farm-panel-sites', 'Farm panel: the two approved sites with reservations and status, the jobs set');
    await panel(false);
    const setup = await sample('setup');
    checks.setup = { ok: setup.cora.role === 'woodcutter' && setup.ada.role === 'builder', commands: setup.seq - placed.seq };
    await pg.waitForTimeout(2500);
    await pg.goto(`${CFG.base}?chain=0&timescale=${CFG.timescale}&${CFG.cam}`);
    await waitLoaded();
    // ---- 6. construction, deliveries and the woodshed as the woodcutter's drop-off ----
    let midReload = null, taken = new Set(), lastTick = -1;
    const deadline = t0 + CFG.maxMinutes * 60000;
    while (Date.now() < deadline) {
      await pg.waitForTimeout(1000);
      const s = await sample('run');
      if (s.tick === lastTick) { log.pop(); continue; }
      lastTick = s.tick;
      const shed = s.sites.find((q) => q.kind === 'woodshed');
      if (!taken.has('building') && s.sites.some((q) => q.work > 0 && q.state === 'approved')) { taken.add('building'); await shot('5-under-construction', 'a frame rising on a site', true); }
      if (!midReload && s.sites.some((q) => q.state === 'approved' && Object.keys(q.delivered).length) && (s.ada.carry || s.cora.carry)) {
        await pg.keyboard.press('p'); await pg.waitForTimeout(2500);
        const before = await sample('before-reload');
        await pg.goto(`${CFG.base}?chain=0&freeze=1&${CFG.cam}`);
        await waitLoaded(); await settle();
        const after = await sample('after-reload');
        midReload = { tickBefore: before.tick, tickAfter: after.tick, hashBefore: before.hash, hashAfter: after.hash,
          sameSites: JSON.stringify(after.sites.map((q) => [q.id, q.state, q.delivered, q.reserved, q.work])) === JSON.stringify(before.sites.map((q) => [q.id, q.state, q.delivered, q.reserved, q.work])),
          sameLoads: JSON.stringify([after.ada.carry, after.cora.carry]) === JSON.stringify([before.ada.carry, before.cora.carry]), sites: before.sites.map((q) => [q.kind, q.state, q.delivered, q.work]) };
        await shot('6-mid-construction-after-reload', 'after the reload in the middle of construction', true);
        await pg.goto(`${CFG.base}?chain=0&timescale=${CFG.timescale}&${CFG.cam}`);
        await waitLoaded();
        lastTick = after.tick;
      }
      if (!taken.has('stow') && shed?.state === 'done' && s.cora.last?.effect === 'stow' && s.cora.carry?.item === 'wood') {
        taken.add('stow');
        await shot('7-woodcutter-to-woodshed', `Cora carrying ${s.cora.carry.amount} wood to the woodshed at ${shed.x},${shed.z}`, true);
      }
      const done = s.sites.length === 2 && s.sites.every((q) => q.state === 'done');
      if (done && (shed?.stock?.wood ?? 0) > 0) break;
      if (s.tick >= CFG.untilTick) break;
    }
    // ---- 7. finished buildings persist through a reload ----
    await pg.keyboard.press('p'); await pg.waitForTimeout(2500);
    const end = await sample('end');
    await pg.goto(`${CFG.base}?chain=0&freeze=1&${CFG.cam}`);
    await waitLoaded(); await settle();
    const reloaded = await sample('end-reloaded');
    await shot('8-finished-buildings', 'the finished woodshed and well after a reload', true);
    const shedEnd = reloaded.sites.find((q) => q.kind === 'woodshed');
    if (shedEnd) {
      await pg.goto(`${CFG.base}?chain=0&freeze=1&mode=builder&tx=${shedEnd.x + 1}&tz=${shedEnd.z + 1.5}&ty=10&dist=16&pitch=35&yaw=200`);
      await waitLoaded(); await settle();
      await shot('9-woodshed-close', `the woodshed (door east) holding ${JSON.stringify(shedEnd.stock)}`, true);
    }
    const run = log.filter((s) => s.label === 'run');
    const delivers = []; let prev = null;
    for (const s of run) { for (const q of s.sites) { const p = prev?.sites.find((x) => x.id === q.id); if (p && JSON.stringify(p.delivered) !== JSON.stringify(q.delivered)) delivers.push({ tick: s.tick, site: q.kind, delivered: q.delivered, ada: [s.ada.x, s.ada.z] }); } prev = s; }
    checks.construction = { ok: end.sites.length === 2 && end.sites.every((q) => q.state === 'done'), sites: end.sites.map((q) => ({ kind: q.kind, state: q.state, delivered: q.delivered, work: q.work, stock: q.stock })),
      doneAt: Object.fromEntries(end.sites.map((q) => [q.kind, run.find((s) => s.sites.find((x) => x.id === q.id)?.state === 'done')?.tick ?? null])), deliveries: delivers.slice(0, 20) };
    const stows = run.filter((s) => s.cora.last?.effect === 'stow').map((s) => s.tick);
    checks.woodshedDropOff = { ok: (end.sites.find((q) => q.kind === 'woodshed')?.stock?.wood ?? 0) > 0 && stows.length > 0, stowTicks: [stows[0], stows.at(-1)], samplesWithStowLeg: stows.length,
      stock: end.sites.find((q) => q.kind === 'woodshed')?.stock, storeWood: end.store.wood ?? 0, coraTargets: [...new Set(run.filter((s) => s.cora.task === 'chop').map((s) => `${s.cora.target}->${s.cora.last?.effect}`))] };
    checks.midReload = { ok: !!midReload && midReload.hashBefore === midReload.hashAfter && midReload.tickBefore === midReload.tickAfter && midReload.sameSites && midReload.sameLoads, ...midReload };
    checks.persist = { ok: reloaded.hash === end.hash && reloaded.tick === end.tick && JSON.stringify(reloaded.sites) === JSON.stringify(end.sites), hash: [end.hash, reloaded.hash], tick: [end.tick, reloaded.tick] };
    // ---- 8. render cost ----
    const view = async (name, q, extra = '&freeze=1', ghost = false) => {
      await pg.goto(`${CFG.base}?chain=0&${q}${extra}`);
      await waitLoaded(); await settle();
      if (ghost) { await pg.keyboard.press('g'); await pg.mouse.move(500, 330, { steps: 3 }); }
      await pg.waitForTimeout(3000);
      const r = await pg.evaluate(() => { const m = window.__metrics; return { calls: m.rendererCalls, tris: m.rendererTriangles, ghost: m.homestead?.build?.ghost ?? null, home: m.sections?.homestead ?? null }; });
      perf[name] = r;
      await shot(`view-${name}`, `${name}: ${r.calls} calls, ${r.tris} triangles`, true);
      return r;
    };
    await view('farm', 'mode=builder&tx=-28&ty=14&tz=4&yaw=0&pitch=30&dist=40');
    await view('farm-ghost', 'mode=builder&tx=-28&ty=14&tz=4&yaw=0&pitch=30&dist=40', '&freeze=1', true);
    await view('farm-multidraw0', 'mode=builder&tx=-28&ty=14&tz=4&yaw=0&pitch=30&dist=40&multidraw=0');
    await view('farm-600', 'mode=builder&tx=-28&ty=14&tz=4&yaw=0&pitch=30&dist=600');
    await view('forest', 'mode=builder&tx=220&ty=14&tz=-110&yaw=20&pitch=28&dist=50');
    await view('forest-multidraw0', 'mode=builder&tx=220&ty=14&tz=-110&yaw=20&pitch=28&dist=50&multidraw=0');
    await view('forest-140-multidraw0', 'mode=builder&tx=220&ty=14&tz=-110&yaw=20&pitch=28&dist=140&multidraw=0');
    const pan = async (name, extra) => {
      await pg.goto(`${CFG.base}?chain=0&freeze=1&mode=builder&tx=220&ty=14&tz=-110&yaw=20&pitch=28&dist=50${extra}`);
      await waitLoaded(); await settle();
      const during = [];
      await pg.keyboard.down('d');
      for (let i = 0; i < 10; i++) { await pg.waitForTimeout(2000); during.push(await pg.evaluate(() => [window.__metrics.rendererCalls, window.__metrics.rendererTriangles])); }
      await pg.keyboard.up('d');
      perf[name] = { calls: Math.max(...during.map((d) => d[0])), tris: Math.max(...during.map((d) => d[1])), during };
    };
    await pan('pan-forest-multidraw0', '&multidraw=0');
    checks.render = { ok: Object.values(perf).every((p) => p.calls < 120 && p.tris < 250000), maxCalls: Math.max(...Object.values(perf).map((p) => p.calls)), maxTris: Math.max(...Object.values(perf).map((p) => p.tris)) };
  }

  if (CFG.phase === 'phone') {
    await pg.goto(`${CFG.base}?chain=0`);
    await waitLoaded(); await settle(); await pause();
    const first = await sample('loaded');
    await panel(true);
    await press('[data-build-open]');
    const opened = await build();
    await shot('p1-build-open', 'phone: build mode opened from Farm; the ghost starts in front of the founder');
    // Tap the ground on the right half (the look side, outside the joystick) to move the ghost; try screen spots until one is valid.
    let b = opened;
    const tried = [];
    for (const [sx, sy] of [[300, 520], [330, 460], [260, 580], [340, 600], [280, 420], [350, 520], [240, 480]]) {
      await pg.touchscreen.tap(sx, sy); await pg.waitForTimeout(1200);
      b = await build();
      tried.push({ at: [sx, sy], pos: b.pos, pinned: b.pinned, ok: b.check?.ok, reasons: b.check?.reasons });
      if (b.check?.ok && b.pinned) break;
    }
    const tappedTo = b.pos;
    await press('[data-build-turn]');
    await pg.waitForTimeout(1200);
    const turned = await build();
    await shot('p2-ghost-turned', `phone: ghost tapped into place and turned (door ${['south', 'east', 'north', 'west'][turned.rot]}): ${turned.bar}`);
    const rects = await pg.evaluate(() => Object.fromEntries(['#build-bar', '#move-zone', '#jump-button', '#farm-button', '#gather-nearest'].map((s) => { const e = document.querySelector(s); const r = e?.getBoundingClientRect(); return [s, r && getComputedStyle(e).display !== 'none' && r.width > 0 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null]; })));
    const overlap = (a, c) => !!a && !!c && a.x < c.x + c.w && a.x + a.w > c.x && a.y < c.y + c.h && a.y + a.h > c.y;
    const bar = rects['#build-bar'], jump = rects['#jump-button'];
    // The joystick appears under the left thumb in the lower part of the left half.
    const stick = { x: 0, y: 844 * 0.55, w: 195, h: 844 * 0.45 };
    if (!turned.check?.ok) {
      for (const [sx, sy] of [[310, 500], [270, 560], [340, 440]]) { await pg.touchscreen.tap(sx, sy); await pg.waitForTimeout(1200); if ((await build()).check?.ok) break; }
    }
    const beforePlace = await build();
    await press('[data-build-place]');
    await pg.waitForTimeout(800);
    const after = await sample('placed');
    await shot('p3-placed', 'phone: placed and approved');
    checks.phone = { ok: opened.active && !!beforePlace.check?.ok && after.sites.length === 1 && after.sites[0].state === 'approved' && !!bar && !!jump && !overlap(bar, jump) && !overlap(bar, stick)
        && tried.some((t) => t.pinned && (t.pos.x !== opened.pos.x || t.pos.z !== opened.pos.z)),
      opened: opened.active, startPos: opened.pos, tried, tappedTo, turnedRot: turned.rot, placed: after.sites.map((s) => ({ kind: s.kind, x: s.x, z: s.z, rot: s.rot, state: s.state })),
      rects, barCoversJump: overlap(bar, jump), barCoversJoystickArea: overlap(bar, stick), commands: after.seq - first.seq };
  }

  checks.pageErrors = errs;
  const verdict = Object.fromEntries(Object.entries(checks).filter(([, v]) => v && typeof v === 'object' && 'ok' in v).map(([k, v]) => [k, v.ok]));
  const result = { base: CFG.base, startedAt: new Date(t0).toISOString(), seconds: sec(), phase: CFG.phase, verdict, checks, perf, shots, samples: log };
  let written = false;
  try {
    const out = await ctx.newPage();
    await ctx.route(`${CFG.base}m014-results.html`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>m014 results</title>' }));
    await out.goto(`${CFG.base}m014-results.html`);
    const [dl] = await Promise.all([out.waitForEvent('download'), out.evaluate((r) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([r], { type: 'application/json' })); a.download = 'results.json';
      document.body.appendChild(a); a.click();
    }, JSON.stringify(result, null, 1))]);
    await dl.saveAs(`${CFG.out}/m014-${CFG.prefix}-${CFG.phase}-results.json`);
    written = true;
  } catch (e) { errs.push(`results not written: ${e}`); }
  await ctx.close();
  return { written, verdict, seconds: result.seconds, perf, shots: shots.map((s) => s.file), errs: errs.slice(0, 3), checks: written ? Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v && v.ok === false ? v : v?.ok])) : checks };
}
