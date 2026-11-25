async (page) => {
  // STAB-002 S3 browser probe (emulated desktop Chromium). A FRESH world (?chain=0, empty storage,
  // 'astrix:entered:v1' = '1') under settlement rules v7, with NO manual role assignment:
  //  - phase 'panel' (the M012 job-probe flow): Farm panel -> New woodshed -> Approve (journaled place_site,
  //    approve_site), nothing else;
  //  - phase 'build' (the M014 placement flow): Build mode (G) through the Farm panel, the ghost aimed with the
  //    mouse through the game's camera, Place (placed and approved), a woodshed and then a well.
  // Then it samples window.__metrics every second at ?timescale=CFG.timescale and records: who works on the
  // site (roles and tasks), the steward's role changes (journaled assign_role, its cooldown in the world),
  // the woodshed's finishing tick, the largest step per tick elapsed (no teleport), the villagers' time
  // (travel/waiting/work/idle/eating/sleeping, __metrics.homestead.workTime) and a reload mid-run (same hash).
  const CFG = /*CFG*/{
    base: 'https://astrix.local/',
    dist: '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist',
    out: '/projects/sandbox/Astrix/13_Integration_and_QA/Evidence/STAB-002-stabilization/s3',
    phase: 'panel',
    timescale: 8,
    untilTick: 330,
    maxMinutes: 9,
    cam: 'mode=builder&tx=-30&tz=0&ty=8&dist=70&pitch=62&yaw=0',
    shed: [[-32, 20], [-33, 18], [-34, 22], [-24, 14], [-26, 18]],
    well: [[-28, -9], [-20, -21], [-21, -18], [-16, -12]],
  }/*END*/;
  const local = /^https:\/\/astrix\.local\//.test(CFG.base);
  const ctx = await page.context().browser().newContext({ viewport: { width: 1000, height: 600 }, acceptDownloads: true });
  if (local) await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: CFG.dist + p }); });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('s3-fresh')) { localStorage.clear(); localStorage.setItem('astrix:entered:v1', '1'); sessionStorage.setItem('s3-fresh', '1'); } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
  const t0 = Date.now();
  const sec = () => Math.round((Date.now() - t0) / 100) / 10;
  const log = [], shots = [], checks = {};
  const shot = async (name, why) => { const file = `stab002-s3-${CFG.phase}-${name}.png`; await pg.screenshot({ path: `${CFG.out}/${file}` }); shots.push({ file, why, tick: log.at(-1)?.tick ?? null }); };
  const sample = (label) => pg.evaluate((label) => {
    const m = window.__metrics, h = m.homestead;
    if (!h) return { label, tick: null };
    const r1 = (v) => Math.round(v * 100) / 100;
    return { label, tick: h.tick, rules: h.rules, hash: m.stateHash, seq: m.acceptedCommands, lastAssign: h.stewardLastAssign,
      v: h.villagers.map((v) => ({ id: v.id, n: v.name, role: v.role, task: v.task, target: v.target, op: v.legOp, x: r1(v.x), z: r1(v.z), carry: v.carry })),
      sites: h.sites.map((s) => ({ id: s.id, kind: s.kind, state: s.state, delivered: s.delivered, reserved: s.reserved, work: s.work, progress: s.progress, status: s.status })),
      workTime: h.workTime, store: h.store };
  }, label).then((s) => { log.push({ t: sec(), ...s }); return s; });
  const panel = async (open) => { const hidden = await pg.evaluate(() => document.getElementById('homestead-panel')?.hidden ?? true); if (hidden === open) await pg.click('#farm-button'); await pg.waitForTimeout(700); };
  const waitLoaded = () => pg.waitForFunction(() => window.__metrics?.homestead?.villagers?.length === 3 && window.__metrics.homestead.rules === 7, null, { timeout: 600000 });
  const paused = () => pg.evaluate(() => /settlement paused/.test(document.getElementById('hud')?.innerText ?? ''));
  const pause = async () => { if (!(await paused())) await pg.keyboard.press('p'); await pg.waitForTimeout(800); };
  const build = () => pg.evaluate(() => window.__metrics.homestead.build);
  const toScreen = (x, y, z) => pg.evaluate(([x, y, z]) => {
    const c = window.__probe.camera; c.updateMatrixWorld();
    const mul = (M, v) => [0, 1, 2, 3].map((r) => M[r] * v[0] + M[4 + r] * v[1] + M[8 + r] * v[2] + M[12 + r] * v[3]);
    const b = mul(c.projectionMatrix.elements, mul(c.matrixWorldInverse.elements, [x, y, z, 1]));
    const r = document.querySelector('#app canvas').getBoundingClientRect();
    return [r.left + (b[0] / b[3] + 1) / 2 * r.width, r.top + (1 - b[1] / b[3]) / 2 * r.height];
  }, [x, y, z]);
  const aim = async (tx, tz) => {
    const b0 = await build();
    const size = b0.kind === 'woodshed' ? (b0.rot % 2 ? [2, 3] : [3, 2]) : [2, 2];
    let gx = tx + size[0] / 2, gz = tz + size[1] / 2, b = b0;
    for (let k = 0; k < 6; k++) {
      const [sx, sy] = await toScreen(gx, 9, gz);
      await pg.mouse.move(sx, sy, { steps: 4 }); await pg.waitForTimeout(700);
      b = await build();
      if (!b.pos) continue;
      if (b.pos.x === tx && b.pos.z === tz) break;
      gx += tx - b.pos.x; gz += tz - b.pos.z;
    }
    return build();
  };

  await pg.goto(`${CFG.base}?chain=0&${CFG.cam}`);
  await waitLoaded();
  let stable = 0;
  for (let i = 0; i < 40 && stable < 2; i++) { await pg.waitForTimeout(3000); const p = await pg.evaluate(() => window.__metrics.pendingChunkBuilds); stable = p === 0 ? stable + 1 : 0; }
  await pause();
  const first = await sample('loaded');
  checks.freshWorld = { ok: first.rules === 7 && first.sites.length === 0, rules: first.rules, tick: first.tick, roles: first.v.map((v) => `${v.n}:${v.role}`) };
  await shot('0-fresh', 'fresh v7 world, roles as founded (Ada farmer, Bram herder, Cora farmer)');
  await panel(true);
  if (CFG.phase === 'panel') {
    await pg.click('button[data-site-new]'); await pg.waitForTimeout(800);
    await pg.click('button[data-approve-site]'); await pg.waitForTimeout(800);
  } else {
    await pg.click('[data-build-open]'); await pg.waitForTimeout(900);
    for (const [kind, spots] of [['woodshed', CFG.shed], ['well', CFG.well]]) {
      if (kind === 'well') { await pg.click('[data-build-kind="well"]'); await pg.waitForTimeout(700); }
      let g = null;
      for (const [x, z] of spots) { g = await aim(x, z); if (g.check?.ok && g.pos.x === x && g.pos.z === z) break; }
      const [px, py] = await toScreen(g.pos.x + 1, 9, g.pos.z + 1);
      await pg.mouse.click(px, py); await pg.waitForTimeout(1000);
      await shot(`1-ghost-${kind}`, `${kind} ghost: ${(await build()).bar ?? ''}`);
      await pg.click('[data-build-place]'); await pg.waitForTimeout(900);
    }
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(600);
  }
  const placed = await sample('placed');
  checks.placed = { ok: placed.sites.length >= 1 && placed.sites.every((s) => s.state === 'approved'), sites: placed.sites, commands: placed.seq - first.seq,
    rolesUnchanged: JSON.stringify(placed.v.map((v) => v.role)) === JSON.stringify(first.v.map((v) => v.role)) };
  await panel(true); await shot('2-panel-approved', 'Farm panel: approved, no role assigned by hand'); await panel(false);
  await pg.goto(`${CFG.base}?chain=0&timescale=${CFG.timescale}&${CFG.cam}`);
  await waitLoaded();
  let reloaded = null, lastTick = -1, doneTick = null;
  const deadline = t0 + CFG.maxMinutes * 60000;
  while (Date.now() < deadline) {
    await pg.waitForTimeout(1000);
    const s = await sample('run');
    if (s.tick === lastTick) { log.pop(); continue; }
    lastTick = s.tick;
    const shed = s.sites.find((x) => x.kind === 'woodshed');
    if (doneTick === null && shed?.state === 'done') { doneTick = s.tick; await shot('4-woodshed-done', `woodshed finished at tick ${s.tick}`); }
    if (!reloaded && s.tick >= 60) {
      await pause(); await pg.waitForTimeout(2000);
      const before = await sample('before-reload');
      await pg.reload(); await waitLoaded();
      const after = await sample('after-reload');
      reloaded = { tick: before.tick, tickAfter: after.tick, hashBefore: before.hash, hashAfter: after.hash, lastAssign: [before.lastAssign, after.lastAssign],
        same: after.tick === before.tick ? after.hash === before.hash && JSON.stringify(after.v) === JSON.stringify(before.v) : null };
      await shot('3-after-reload', `reloaded at tick ${before.tick}`);
      if (await paused()) await pg.keyboard.press('p');
      lastTick = after.tick;
    }
    if (s.tick >= CFG.untilTick || (doneTick !== null && s.tick >= doneTick + 10)) break;
  }
  const run = log.filter((s) => s.tick !== null && s.label === 'run');
  const startTick = placed.tick;
  // Roles over time, and who worked on the sites.
  const roleChanges = [];
  for (let k = 1; k < log.length; k++) for (const v of log[k].v ?? []) { const p = log[k - 1].v?.find((q) => q.id === v.id); if (p && p.role !== v.role) roleChanges.push({ tick: log[k].tick, n: v.n, from: p.role, to: v.role }); }
  const siteWork = {};
  for (const s of run) for (const v of s.v) if (['haul', 'build', 'chop'].includes(v.task) && (s.sites.some((x) => x.id === v.target) || v.task === 'chop')) siteWork[`${v.n}:${v.role}:${v.task}`] = (siteWork[`${v.n}:${v.role}:${v.task}`] ?? 0) + 1;
  checks.woodshed = { ok: doneTick !== null && doneTick - startTick <= 300, approvedAt: startTick, doneTick, after: doneTick === null ? null : doneTick - startTick,
    roleChanges, siteWork, lastAssign: run.at(-1)?.lastAssign, statusSeen: [...new Set(run.map((s) => s.sites[0]?.status))].slice(0, 10) };
  let worst = { ratio: 0 };
  for (const id of ['villager:0', 'villager:1', 'villager:2']) {
    const p = run.map((s) => ({ t: s.tick, ...s.v.find((v) => v.id === id) }));
    for (let k = 1; k < p.length; k++) {
      const dt = p[k].t - p[k - 1].t; if (dt <= 0) continue;
      const d = Math.hypot(p[k].x - p[k - 1].x, p[k].z - p[k - 1].z), allow = dt * 2.7;
      if (d / allow > worst.ratio) worst = { ratio: Math.round((d / allow) * 1000) / 1000, id, from: p[k - 1].t, to: p[k].t, d: Math.round(d * 100) / 100 };
    }
  }
  checks.noTeleport = { ok: worst.ratio <= 1, worst };
  checks.reload = { ok: !!reloaded && (reloaded.same === true || reloaded.same === null), ...reloaded };
  checks.workTime = { ok: !!run.at(-1)?.workTime, ...run.at(-1)?.workTime };
  checks.pageErrors = errs;
  const verdict = Object.fromEntries(Object.entries(checks).filter(([, v]) => v && typeof v === 'object' && 'ok' in v).map(([k, v]) => [k, v.ok]));
  const result = { phase: CFG.phase, base: CFG.base, startedAt: new Date(t0).toISOString(), seconds: sec(), ticks: [first.tick, run.at(-1)?.tick], verdict, checks, shots, samples: log.map(({ workTime, ...s }) => s) };
  let written = false;
  try {
    const out = await ctx.newPage();
    await ctx.route(`${CFG.base}s3-results.html`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>s3 results</title>' }));
    await out.goto(`${CFG.base}s3-results.html`);
    const [dl] = await Promise.all([out.waitForEvent('download'), out.evaluate((r) => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r], { type: 'application/json' })); a.download = 'results.json'; document.body.appendChild(a); a.click();
    }, JSON.stringify(result, null, 1))]);
    await dl.saveAs(`${CFG.out}/stab002-s3-${CFG.phase}-results.json`);
    written = true;
  } catch (e) { errs.push(`results not written: ${e}`); }
  await ctx.close();
  return { written, verdict, woodshed: { approvedAt: checks.woodshed.approvedAt, doneTick: checks.woodshed.doneTick, after: checks.woodshed.after, roleChanges: checks.woodshed.roleChanges, siteWork: checks.woodshed.siteWork },
    noTeleport: checks.noTeleport.worst, reload: reloaded, workTotal: checks.workTime.total, waits: checks.workTime.waits, seconds: result.seconds, errs: errs.slice(0, 3) };
}
