async (page) => {
  // M012 Stage B live job probe (reproducible). Starts a FRESH world (?chain=0, empty localStorage,
  // 'astrix:entered:v1' = '1'), then uses the real Farm panel to make Cora a woodcutter and Ada a builder,
  // plan a woodshed and approve it (each a journaled command: assign_role, place_site, approve_site).
  // It then samples the game's own window.__metrics every simulation tick (2 s of real time) and checks:
  // the woodcutter reaches a mature tree, the tree's timber goes down, timber is carried, store wood rises
  // only when the woodcutter is at the store; the builder carries reserved materials, site progress rises,
  // the woodshed is finished; gates and doors open and close as villagers pass; no position ever jumps
  // further than walking speed allows; a reload in the middle of the work continues the same state.
  // Results: m012-jobs-results.json plus jobs-*.png in CFG.out.
  //
  // Point it at another deployment by changing CFG.base (gen-jobs.mjs writes a copy:
  //   node gen-jobs.mjs https://astrix.nyc.boxd.sh/ m012-jobs.live.js). Only https://astrix.local/ is
  // served from CFG.dist (a copy of Game/dist); any other base is loaded from the network as is.
  const CFG = /*CFG*/{
    base: 'https://astrix.local/',
    dist: '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist',
    out: '/projects/sandbox/Astrix/13_Integration_and_QA/Evidence/M012-living-settlement',
    prefix: 'jobs',
    /** Stop after this settlement tick (night starts at 171: villagers go to bed through the farmhouse door). */
    untilTick: 196,
    /** Hard stop in real minutes. */
    maxMinutes: 16,
    view: 'mode=builder&tx=-36&tz=-8&ty=6&dist=88&pitch=52&yaw=20',
  }/*END*/;
  const local = /^https:\/\/astrix\.local\//.test(CFG.base);
  const ctx = await page.context().browser().newContext({ viewport: { width: 1000, height: 600 }, acceptDownloads: true });
  if (local) await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: CFG.dist + p }); });
  // Fresh world once per tab: storage cleared on the first load only (a reload keeps the save).
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('m012b-fresh')) { localStorage.clear(); localStorage.setItem('astrix:entered:v1', '1'); sessionStorage.setItem('m012b-fresh', '1'); } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
  const t0 = Date.now();
  const sec = () => Math.round((Date.now() - t0) / 100) / 10;
  const log = [], shots = [], checks = {};
  const STORE = { x: -50, z: -30.4 };
  // Scene shots hide the builder-view side panels (presentation only) so the yard is visible; panel shots show the Farm panel.
  const shot = async (name, why, clean = true) => {
    const file = `${CFG.prefix}-${name}.png`;
    await pg.evaluate((c) => document.body.classList.toggle('m012b-clean', c), clean);
    await pg.screenshot({ path: `${CFG.out}/${file}` });
    await pg.evaluate(() => document.body.classList.remove('m012b-clean'));
    shots.push({ file, why, t: sec(), tick: log.at(-1)?.tick ?? null });
  };
  const cleanCss = 'body.m012b-clean #life-panel, body.m012b-clean #build-panel, body.m012b-clean #hud, body.m012b-clean #world-panel { visibility: hidden !important; }';
  const sample = (label) => pg.evaluate((label) => {
    const m = window.__metrics, h = m.homestead;
    if (!h) return { label, tick: null };
    const r1 = (v) => Math.round(v * 100) / 100;
    return { label, tick: h.tick, rules: h.rules, hash: m.stateHash, seq: m.acceptedCommands, save: m.save?.status ?? null,
      v: h.villagers.map((v) => ({ id: v.id, n: v.name, role: v.role, task: v.task, target: v.target, leg: v.leg, op: v.legOp, x: r1(v.x), z: r1(v.z),
        carry: v.carry, opening: v.nav?.opening ?? null, opened: v.nav?.opened ?? null, blocked: v.nav?.blocked?.reason ?? null, wait: v.nav?.wait?.reason ?? null })),
      gates: Object.fromEntries(h.gates.map((g) => [g.id, g.state])), drawn: h.view?.leaves ?? null,
      store: h.store, overflow: h.overflow, reserved: h.reserved,
      sites: h.sites.map((s) => ({ id: s.id, state: s.state, reserved: s.reserved, delivered: s.delivered, work: s.work, progress: s.progress, status: s.status })),
      woodlot: h.woodlot ? { fellable: h.woodlot.fellable, standing: h.woodlot.standing, trees: h.woodlot.trees.map((t) => `${t.id}:${t.remaining}${t.cut ? '*' : ''}`) } : null,
      chopping: h.choppingTree, loads: (h.view?.villagers ?? []).map((p) => p.load),
      calls: m.rendererCalls, tris: m.rendererTriangles, tickMs: m.sections?.tick ?? null, navTickMs: h.navStats ? r1(h.navStats.tickMs / Math.max(1, h.navStats.ticks)) : null };
  }, label).then((s) => { log.push({ t: sec(), ...s }); return s; });
  const panel = async (open) => {
    const hidden = await pg.evaluate(() => document.getElementById('homestead-panel')?.hidden ?? true);
    if (hidden === open) await pg.click('#farm-button');
    await pg.waitForTimeout(600);
  };
  const waitLoaded = async () => {
    await pg.waitForFunction(() => window.__metrics?.homestead?.villagers?.length === 3 && window.__metrics.homestead.rules === 4, null, { timeout: 600000 });
  };

  // ---- start a fresh world ----
  await pg.goto(`${CFG.base}?chain=0&${CFG.view}`);
  await waitLoaded();
  await pg.addStyleTag({ content: cleanCss });
  let stable = 0;
  for (let i = 0; i < 40 && stable < 2; i++) { await pg.waitForTimeout(3000); const p = await pg.evaluate(() => window.__metrics.pendingChunkBuilds); stable = p === 0 ? stable + 1 : 0; }
  const first = await sample('loaded');
  checks.freshWorld = { tick: first.tick, seq: first.seq, rules: first.rules, villagers: first.v.map((v) => `${v.n}:${v.role}`), store: first.store };
  await shot('0-fresh-world', 'fresh world: the settlers (Ada, Bram, Cora) and the yard; nothing assigned yet');

  // ---- assign jobs and approve a site through the real Farm panel ----
  await panel(true);
  await pg.selectOption('select[data-role-of="villager:2"]', 'woodcutter');
  await pg.waitForTimeout(800);
  await pg.selectOption('select[data-role-of="villager:0"]', 'builder');
  await pg.waitForTimeout(800);
  await pg.click('button[data-site-new]');
  await pg.waitForTimeout(800);
  await pg.click('button[data-approve-site]');
  await pg.waitForTimeout(800);
  const assigned = await sample('assigned');
  checks.assigned = { roles: assigned.v.map((v) => `${v.n}:${v.role}`), sites: assigned.sites, reserved: assigned.reserved,
    commands: assigned.seq - first.seq,
    panelText: await pg.evaluate(() => document.querySelector('#homestead-panel')?.innerText.slice(0, 1600) ?? '') };
  await shot('1-farm-panel-jobs', 'Farm panel: Cora woodcutter, Ada builder, woodshed approved with 4 fibre reserved (no wood in the store yet)', false);
  await panel(false);

  // ---- watch the work, tick by tick ----
  let reloaded = null, lastTick = assigned.tick, shotsTaken = new Set();
  const deadline = t0 + CFG.maxMinutes * 60000;
  while (Date.now() < deadline) {
    await pg.waitForTimeout(1000);
    const s = await sample('run');
    if (s.tick === lastTick) { log.pop(); continue; }
    lastTick = s.tick;
    const cora = s.v.find((v) => v.id === 'villager:2'), ada = s.v.find((v) => v.id === 'villager:0');
    if (!shotsTaken.has('chop') && cora.task === 'chop' && cora.op === 'work') { shotsTaken.add('chop'); await shot('2-woodcutter-chopping', `Cora chopping ${s.chopping?.id} (${s.chopping?.stage}, ${s.chopping?.remaining} wood left)`); }
    if (!shotsTaken.has('carry') && cora.carry?.item === 'wood' && cora.op === 'walk' && cora.leg === 2) { shotsTaken.add('carry'); await shot('3-woodcutter-carrying', `Cora walking to the store with ${cora.carry.amount} wood`); }
    if (!shotsTaken.has('haul') && ada.carry?.site) { shotsTaken.add('haul'); await shot('4-builder-hauling', `Ada carrying ${ada.carry.amount} reserved ${ada.carry.item} to the site`); }
    if (!shotsTaken.has('build') && ada.task === 'build' && ada.op === 'work') { shotsTaken.add('build'); await shot('5-builder-building', `Ada building, site ${s.sites[0].progress}%`); }
    if (!shotsTaken.has('done') && s.sites[0]?.state === 'done') {
      shotsTaken.add('done'); await shot('7-woodshed-built', 'the woodshed is finished (solid on the walking grid)');
      await panel(true); await shot('8-farm-panel-built', 'Farm panel after completion', false); await panel(false);
    }
    // ---- reload in the middle of the work (once both have done something) ----
    if (!reloaded && s.tick >= 45 && ((cora.carry && cora.task === 'chop') || ada.carry?.site)) {
      await pg.keyboard.press('p'); // pause settlement time, so the saved state is the one we read
      await pg.waitForTimeout(2500);
      const before = await sample('before-reload');
      await pg.reload();
      await waitLoaded();
      await pg.addStyleTag({ content: cleanCss });
      const after = await sample('after-reload');
      reloaded = { tick: before.tick, hashBefore: before.hash, hashAfter: after.hash, tickAfter: after.tick, seqBefore: before.seq, seqAfter: after.seq,
        same: after.tick === before.tick ? JSON.stringify(after.v) === JSON.stringify(before.v) && JSON.stringify(after.sites) === JSON.stringify(before.sites)
          && JSON.stringify(after.store) === JSON.stringify(before.store) && after.hash === before.hash : null,
        villagersBefore: before.v.map((v) => ({ n: v.n, task: v.task, leg: v.leg, carry: v.carry, x: v.x, z: v.z })),
        villagersAfter: after.v.map((v) => ({ n: v.n, task: v.task, leg: v.leg, carry: v.carry, x: v.x, z: v.z })), sites: [before.sites, after.sites] };
      await shot('6-after-reload', `reloaded mid-job at tick ${before.tick}; work continues from the saved state`);
      lastTick = after.tick;
    }
    if (s.tick >= CFG.untilTick) break;
  }
  await shot('9-night', 'nightfall: the villagers have gone to bed through the farmhouse door');
  await panel(true); await shot('9-farm-panel-end', 'Farm panel at the end', false); await panel(false);

  // ---- checks over the samples ----
  const run = log.filter((s) => s.tick !== null && s.label !== 'loaded');
  const per = (id) => run.map((s) => ({ t: s.tick, label: s.label, ...s.v.find((v) => v.id === id) }));
  // No teleport: between consecutive samples nobody moves further than 2.6 m per tick elapsed (+ rounding).
  let worst = { ratio: 0 };
  const jumps = [];
  for (const id of ['villager:0', 'villager:1', 'villager:2']) {
    const p = per(id);
    for (let k = 1; k < p.length; k++) {
      const dt = p[k].t - p[k - 1].t;
      if (dt <= 0) continue;
      const d = Math.hypot(p[k].x - p[k - 1].x, p[k].z - p[k - 1].z), allow = dt * 2.6 + 0.15;
      if (d / allow > worst.ratio) worst = { ratio: Math.round((d / allow) * 100) / 100, id, from: p[k - 1].t, to: p[k].t, d: Math.round(d * 100) / 100 };
      if (d > allow) jumps.push({ id, from: p[k - 1].t, to: p[k].t, d });
    }
  }
  checks.noTeleport = { ok: jumps.length === 0, worst, jumps: jumps.slice(0, 5) };
  // Woodcutter.
  const cut = per('villager:2');
  const atTree = run.filter((s) => { const c = s.v.find((v) => v.id === 'villager:2'); return c.task === 'chop' && c.op === 'work' && s.chopping && Math.hypot(c.x - s.chopping.x, c.z - s.chopping.z) <= 2.8; });
  checks.woodcutterReachedTree = { ok: atTree.length > 0, ticks: atTree.length, first: atTree[0] ? { tick: atTree[0].tick, tree: atTree[0].chopping, cora: atTree[0].v[2] } : null,
    stages: [...new Set(run.map((s) => s.chopping?.stage).filter(Boolean))] };
  const remainingDrops = [];
  for (let k = 1; k < run.length; k++) { const a = run[k - 1].chopping, b = run[k].chopping; if (a && b && a.id === b.id && b.remaining < a.remaining) remainingDrops.push({ tick: run[k].tick, tree: b.id, from: a.remaining, to: b.remaining }); }
  const fellable = run.map((s) => s.woodlot?.fellable).filter((n) => n !== undefined);
  checks.treeYieldDecreased = { ok: remainingDrops.length > 0, drops: remainingDrops, fellableFirst: fellable[0], fellableLast: fellable.at(-1), standingLast: run.at(-1)?.woodlot?.standing };
  checks.timberCarried = { ok: cut.some((c) => c.carry?.item === 'wood'), maxLoad: Math.max(0, ...cut.map((c) => (c.carry?.item === 'wood' ? c.carry.amount : 0))),
    drawnLoad: run.some((s) => s.loads?.[2] === 'wood') };
  const gains = [];
  for (let k = 1; k < run.length; k++) {
    const a = run[k - 1], b = run[k];
    const dw = (b.store.wood ?? 0) - (a.store.wood ?? 0);
    const fetched = b.v.reduce((n, v) => n + (v.carry?.site && v.carry.item === 'wood' ? v.carry.amount : 0), 0) - a.v.reduce((n, v) => n + (v.carry?.site && v.carry.item === 'wood' ? v.carry.amount : 0), 0);
    const ca = a.v[2], cb = b.v[2];
    const dropped = (ca.carry?.item === 'wood' ? ca.carry.amount : 0) - (cb.carry?.item === 'wood' ? cb.carry.amount : 0);
    if (dw + Math.max(0, fetched) > 0 || dropped > 0) {
      gains.push({ tick: b.tick, storeWood: [a.store.wood ?? 0, b.store.wood ?? 0], dropped, fetchedByBuilder: fetched, coraToStore: Math.round(Math.hypot(cb.x - STORE.x, cb.z - STORE.z) * 10) / 10, coraTask: `${cb.task}/${cb.leg}` });
    }
  }
  // Every rise in store wood (plus anything the builder picked straight up) equals what Cora put down, and she was at the store.
  checks.storeWoodOnlyAtStore = { ok: gains.length > 0 && gains.every((g) => Math.abs((g.storeWood[1] - g.storeWood[0]) + Math.max(0, g.fetchedByBuilder) - g.dropped) === 0 && (g.dropped === 0 || g.coraToStore <= 2.5)),
    events: gains };
  // Builder.
  const ada = per('villager:0');
  checks.builderCarriedReserved = { ok: ada.some((v) => v.carry?.site), loads: [...new Set(ada.filter((v) => v.carry?.site).map((v) => `${v.carry.amount} ${v.carry.item}`))],
    reservedSeen: [...new Set(run.map((s) => JSON.stringify(s.reserved)))] };
  const prog = run.map((s) => s.sites[0]?.progress ?? 0);
  checks.siteProgress = { ok: prog.at(-1) > prog[0], first: prog[0], last: prog.at(-1), done: run.at(-1)?.sites[0]?.state === 'done', doneTick: run.find((s) => s.sites[0]?.state === 'done')?.tick ?? null,
    steps: [...new Set(prog)], statusSeen: [...new Set(run.map((s) => s.sites[0]?.status))].slice(0, 12) };
  // Reservations never above the store.
  checks.reservationsWithinStore = { ok: run.every((s) => Object.entries(s.reserved).every(([k, n]) => n <= (s.store[k] ?? 0))) };
  // Gates.
  const gateEvents = [];
  for (let k = 1; k < run.length; k++) for (const [id, st] of Object.entries(run[k].gates)) if (run[k - 1].gates[id] !== st) {
    const by = run[k].v.filter((v) => v.opened === id || v.opening === id).map((v) => v.n).concat(run[k - 1].v.filter((v) => v.opened === id || v.opening === id).map((v) => v.n));
    gateEvents.push({ tick: run[k].tick, gate: id, from: run[k - 1].gates[id], to: st, by: [...new Set(by)] });
  }
  checks.gates = { ok: gateEvents.some((e) => e.to === 'open') && gateEvents.some((e) => e.to === 'closed'), events: gateEvents,
    drawnMatches: run.every((s) => !s.drawn || Object.entries(s.gates).every(([id, st]) => s.drawn[id] === st)), endStates: run.at(-1)?.gates };
  checks.reload = { ok: !!reloaded && (reloaded.same === true || (reloaded.same === null && reloaded.tickAfter >= reloaded.tick)), ...reloaded };
  checks.render = { maxCalls: Math.max(...log.map((s) => s.calls ?? 0)), maxTris: Math.max(...log.map((s) => s.tris ?? 0)), lastTickSection: run.at(-1)?.tickMs, navTickMsAvg: run.at(-1)?.navTickMs };
  checks.pageErrors = errs;
  const verdict = Object.fromEntries(Object.entries(checks).filter(([, v]) => v && typeof v === 'object' && 'ok' in v).map(([k, v]) => [k, v.ok]));
  const result = { base: CFG.base, startedAt: new Date(t0).toISOString(), seconds: sec(), ticks: [first.tick, run.at(-1)?.tick], verdict, checks, shots, samples: log };
  // The Playwright tool's sandbox has no file system API: the results leave as a browser download saved to CFG.out.
  let written = false;
  try {
    const out = await ctx.newPage();
    await ctx.route(`${CFG.base}m012b-results.html`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>m012b results</title>' }));
    await out.goto(`${CFG.base}m012b-results.html`);
    const [dl] = await Promise.all([out.waitForEvent('download'), out.evaluate((r) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([r], { type: 'application/json' })); a.download = 'results.json';
      document.body.appendChild(a); a.click();
    }, JSON.stringify(result, null, 1))]);
    await dl.saveAs(`${CFG.out}/m012-${CFG.prefix}-results.json`);
    written = true;
  } catch (e) { errs.push(`results not written: ${e}`); }
  await ctx.close();
  // Written by the caller when this runner cannot reach the file system (the Playwright tool returns it).
  try { const fs = await import('node:fs'); fs.writeFileSync(`${CFG.out}/m012-${CFG.prefix}-results.json`, JSON.stringify(result, null, 1)); written = true; } catch { /* returned below */ }
  return written ? { written: true, verdict, seconds: result.seconds, ticks: result.ticks, shots: shots.map((s) => s.file), errs: errs.slice(0, 3) } : result;
}
