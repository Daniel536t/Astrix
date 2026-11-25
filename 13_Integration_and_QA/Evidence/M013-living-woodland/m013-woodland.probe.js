async (page) => {
  // M013 living-woodland probe (reproducible). Starts a FRESH world (?chain=0, empty localStorage,
  // 'astrix:entered:v1' = '1'). Settlement time is paused (P) while the real Farm panel is used, so the
  // panel is not re-rendered under the clicks: Cora becomes the woodcutter (journaled assign_role) and the
  // first tree listed as fellable is protected (journaled protect_tree). The page is then reloaded with the
  // dev time-lapse ?timescale=N (it only issues the ordinary one-tick commands more often; rules are
  // unchanged) and the game's own window.__metrics is sampled about once a second. Checks: felling, the
  // stump left behind, replanting orders, a lifted sapling carried and planted, trees changing stage over
  // time (growth), natural seeding, the protected tree never cut, a reload in the middle of the cycle with
  // the same state hash, then render cost in the farm, forest and zoomed-out views and the incremental
  // nature update cost while panning. Results: m013-<prefix>-results.json and <prefix>-*.png in CFG.out.
  //
  // Point it at another deployment with gen-woodland.mjs (writes a copy with another CFG.base). Only
  // https://astrix.local/ is served from CFG.dist (a copy of Game/dist); any other base loads from the network.
  const CFG = /*CFG*/{
    base: 'https://astrix.local/',
    dist: '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist',
    out: '/projects/sandbox/Astrix/13_Integration_and_QA/Evidence/M013-living-woodland',
    prefix: 'wood',
    /** 'life' (fresh world, woodcutter, felling, replanting, growth, reload), 'views' (render cost, panning, lineup) or 'all'.
     *  The Playwright tool stops a run after 900 s, so the two phases are run as two files (gen-woodland.mjs). */
    phase: 'all',
    timescale: 20,
    /** Stop sampling after this settlement tick (300 ticks = one day). */
    untilTick: 1200,
    /** Reload mid-cycle at or after this tick (once a stump and a planting order exist). */
    reloadAfter: 300,
    maxMinutes: 10,
    farm: 'mode=builder&tx=-40&tz=-14&ty=8&dist=70&pitch=48&yaw=20',
  }/*END*/;
  const local = /^https:\/\/astrix\.local\//.test(CFG.base);
  const ctx = await page.context().browser().newContext({ viewport: { width: 1000, height: 600 }, acceptDownloads: true });
  if (local) await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: CFG.dist + p }); });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('m013-fresh')) { localStorage.clear(); localStorage.setItem('astrix:entered:v1', '1'); sessionStorage.setItem('m013-fresh', '1'); } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
  const t0 = Date.now();
  const sec = () => Math.round((Date.now() - t0) / 100) / 10;
  const log = [], shots = [], checks = {}, perf = {};
  const cleanCss = 'body.m013-clean #life-panel, body.m013-clean #build-panel, body.m013-clean #hud, body.m013-clean #world-panel, body.m013-clean #homestead-panel { visibility: hidden !important; }';
  const shot = async (name, why, clean = true) => {
    const file = `${CFG.prefix}-${name}.png`;
    await pg.evaluate((c) => document.body.classList.toggle('m013-clean', c), clean);
    await pg.screenshot({ path: `${CFG.out}/${file}` });
    await pg.evaluate(() => document.body.classList.remove('m013-clean'));
    shots.push({ file, why, t: sec(), tick: log.at(-1)?.tick ?? null });
  };
  const sample = (label) => pg.evaluate((label) => {
    const m = window.__metrics, h = m.homestead;
    if (!h || !h.woodland) return { label, tick: null };
    const w = h.woodland, r1 = (v) => Math.round(v * 100) / 100;
    const cora = h.villagers.find((v) => v.id === 'villager:2');
    const sec = (k) => m.sections?.[k] ? { mean: m.sections[k].meanMs, p95: m.sections[k].p95Ms, max: m.sections[k].maxMs } : null;
    return { label, tick: h.tick, rules: h.rules, hash: m.stateHash, seq: m.acceptedCommands,
      cora: { role: cora.role, task: cora.task, target: cora.target, op: cora.legOp, x: r1(cora.x), z: r1(cora.z), carry: cora.carry },
      why: w.woodcutters.map((c) => c.why), felled: w.felled, planted: w.planted, seeded: w.seeded, sprouted: w.sprouted, records: w.records,
      quota: w.quota, rate: w.rate, orders: w.orders, protect: w.protect, standing: w.standing,
      trees: Object.fromEntries(w.trees.map((t) => [t.id, `${t.sp}:${t.stage}:${t.present ? 1 : 0}:${t.remaining ?? ''}:${t.from}`])),
      treePos: Object.fromEntries(w.trees.map((t) => [t.id, [r1(t.x), r1(t.z), t.y]])),
      stats: w.stats && { trees: w.stats.trees, harvestable: w.stats.harvestable, protected: w.stats.protected, regrowing: w.stats.regrowing, path: w.stats.meanPathToStore, perDay: w.stats.sustainableTreesPerDay },
      store: h.store, calls: m.rendererCalls, tris: m.rendererTriangles, natureSync: m.natureSync, natureInstances: m.natureInstances,
      tickMs: sec('tick'), syncMs: sec('naturesync'), vegMs: sec('vegetation'), navTickMs: h.navStats ? r1(h.navStats.tickMs / Math.max(1, h.navStats.ticks)) : null,
      gridPatches: h.navStats?.gridPatches ?? null, gridBuilds: h.navStats?.gridBuilds ?? null, timescale: m.timescale };
  }, label).then((s) => { log.push({ t: sec(), ...s }); return s; });
  const panel = async (open) => {
    const hidden = await pg.evaluate(() => document.getElementById('homestead-panel')?.hidden ?? true);
    if (hidden === open) await pg.click('#farm-button');
    await pg.waitForTimeout(600);
  };
  const waitLoaded = async () => {
    await pg.waitForFunction(() => window.__metrics?.homestead?.woodland && window.__metrics.homestead.villagers.length === 3, null, { timeout: 600000 });
    await pg.addStyleTag({ content: cleanCss });
  };
  const settle = async () => {
    let stable = 0;
    for (let i = 0; i < 40 && stable < 2; i++) { await pg.waitForTimeout(2500); const p = await pg.evaluate(() => window.__metrics.pendingChunkBuilds); stable = p === 0 ? stable + 1 : 0; }
  };
  const paused = () => pg.evaluate(() => /settlement paused/.test(document.getElementById('hud')?.innerText ?? ''));

  const first = { tick: null }, run = [];
  if (CFG.phase !== 'views') {
  // ---- 1. a fresh world, paused while the owner sets up through the Farm panel ----
  await pg.goto(`${CFG.base}?chain=0&${CFG.farm}`);
  await waitLoaded();
  await settle();
  if (!(await paused())) await pg.keyboard.press('p');
  await pg.waitForTimeout(1500);
  Object.assign(first, await sample('loaded'));
  checks.freshWorld = { ok: first.rules === 5, tick: first.tick, rules: first.rules, trees: first.stats, quota: first.quota, rate: first.rate };
  await shot('0-fresh-world', 'fresh world under settlement rules v5 (the farm and its woodland)');
  await panel(true);
  await pg.selectOption('select[data-role-of="villager:2"]', 'woodcutter');
  await pg.waitForTimeout(800);
  const protectId = await pg.evaluate(() => document.querySelector('[data-protect-tree]')?.getAttribute('data-protect-tree') ?? null);
  if (protectId) { await pg.click(`[data-protect-tree="${protectId}"]`); await pg.waitForTimeout(800); }
  const setup = await sample('setup');
  checks.setup = { ok: setup.cora.role === 'woodcutter' && !!protectId && setup.protect.includes(protectId), protectId, protect: setup.protect, commands: setup.seq - first.seq,
    panelText: await pg.evaluate(() => (document.querySelector('[data-woodland-stats]')?.textContent ?? '').replace(/\s+/g, ' ').trim()) };
  await pg.evaluate(() => document.querySelector('[data-woodland-policy]')?.scrollIntoView());
  await shot('1-farm-panel-woodland', 'Farm panel: the woodland section (stats, policy, protection, fellable trees), Cora made woodcutter, one tree protected', false);
  await panel(false);
  // Let the save land, then reload into the time-lapse (the same save; P pause is not saved).
  await pg.waitForTimeout(2500);
  await pg.goto(`${CFG.base}?chain=0&timescale=${CFG.timescale}&${CFG.farm}`);
  await waitLoaded();
  const resumed = await sample('timelapse');
  // The panel click is one synchronous journaled command: the tree must be protected right after the click
  // (setup sample) and still protected in the reloaded save.
  checks.setup.immediate = !!protectId && setup.protect.includes(protectId);
  checks.setup.ok = checks.setup.immediate && resumed.cora.role === 'woodcutter' && resumed.protect.includes(protectId);
  checks.setup.protectAfterReload = resumed.protect;
  checks.resumed = { ok: resumed.tick >= setup.tick && resumed.seq >= setup.seq, hashBefore: setup.hash, hashAfter: resumed.hash, tick: [setup.tick, resumed.tick], seq: [setup.seq, resumed.seq] };

  // ---- 2. watch the woodland ----
  let reloaded = null, lastTick = resumed.tick;
  const taken = new Set();
  const deadline = t0 + CFG.maxMinutes * 60000;
  while (Date.now() < deadline) {
    await pg.waitForTimeout(1000);
    const s = await sample('run');
    if (s.tick === lastTick) { log.pop(); continue; }
    lastTick = s.tick;
    if (!taken.has('chop') && s.cora.task === 'chop' && (s.cora.op === 'work' || s.cora.carry?.item === 'wood')) { taken.add('chop'); await shot('2-felling', `Cora felling ${s.cora.target}`); }
    if (!taken.has('sapling') && s.cora.carry?.item?.startsWith('sapling:')) { taken.add('sapling'); await shot('3-carrying-sapling', `Cora carrying a ${s.cora.carry.item.slice(8)} wildling to replant`); }
    const stump = Object.entries(s.trees).find(([, v]) => v.split(':')[1] === 'stump');
    if (!reloaded && s.tick >= CFG.reloadAfter && stump) {
      // Reload mid-cycle with the camera on the stump: same tick, same hash, same woodland.
      await pg.keyboard.press('p');
      await pg.waitForTimeout(2500);
      const before = await sample('before-reload');
      const [x, z, y] = before.treePos[stump[0]];
      // freeze=1: settlement time does not run in this load, so the restored state is read exactly as saved.
      await pg.goto(`${CFG.base}?chain=0&freeze=1&mode=builder&tx=${x}&tz=${z}&ty=${y + 1}&dist=14&pitch=35&yaw=35`);
      await waitLoaded();
      await settle();
      const after = await sample('after-reload');
      reloaded = { tickBefore: before.tick, tickAfter: after.tick, hashBefore: before.hash, hashAfter: after.hash, stump: stump[0],
        sameWoodland: JSON.stringify(after.trees) === JSON.stringify(before.trees) && JSON.stringify(after.orders) === JSON.stringify(before.orders) && after.quota === before.quota };
      await shot('4-stump-after-reload', `after the mid-cycle reload: the stump of ${stump[0]} (${stump[1]})`);
      await pg.goto(`${CFG.base}?chain=0&timescale=${CFG.timescale}&${CFG.farm}`);
      await waitLoaded();
      lastTick = after.tick;
    }
    if (!taken.has('planted') && s.planted > 0) {
      taken.add('planted');
      const pid = Object.entries(s.trees).find(([, v]) => v.endsWith(':plant'));
      if (pid) {
        const [x, z, y] = s.treePos[pid[0]];
        await pg.goto(`${CFG.base}?chain=0&freeze=1&mode=builder&tx=${x}&tz=${z}&ty=${y + 1}&dist=12&pitch=35&yaw=-30`);
        await waitLoaded(); await settle();
        await shot('5-planted-sapling', `the replanted sapling ${pid[0]} (${pid[1]})`);
        await pg.goto(`${CFG.base}?chain=0&timescale=${CFG.timescale}&${CFG.farm}`);
        await waitLoaded();
      }
    }
    if (s.tick >= CFG.untilTick) break;
  }
  await pg.goto(`${CFG.base}?chain=0&freeze=1&${CFG.farm}`);
  await waitLoaded(); await settle();
  await shot('6-farm-later', `the farm woodland at tick ${log.at(-1)?.tick} (day ${Math.floor((log.at(-1)?.tick ?? 0) / 300) + 1})`);
  await panel(true);
  await pg.evaluate(() => document.querySelector('[data-woodland-stats]')?.scrollIntoView());
  await shot('7-farm-panel-end', 'Farm panel woodland section at the end', false);
  const panelEnd = await pg.evaluate(() => ({ stats: (document.querySelector('[data-woodland-stats]')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    why: [...document.querySelectorAll('[data-woodcutter-why]')].map((e) => e.textContent) }));
  await panel(false);

  // ---- 3. checks over the samples ----
  run.push(...log.filter((s) => s.tick !== null && s.label !== 'loaded' && s.label !== 'setup'));
  const stagesOf = (id) => run.map((s) => s.trees[id]).filter(Boolean).map((v) => v.split(':')[1]);
  const ids = [...new Set(run.flatMap((s) => Object.keys(s.trees)))];
  const transitions = [];
  for (const id of ids) {
    const st = stagesOf(id);
    for (let k = 1; k < st.length; k++) if (st[k] !== st[k - 1]) transitions.push({ id, from: st[k - 1], to: st[k], tick: run.filter((s) => s.trees[id])[k].tick });
  }
  const growth = transitions.filter((t) => t.to !== 'stump' && t.to !== 'gap' && t.from !== 'stump');
  const fellings = transitions.filter((t) => t.to === 'stump');
  checks.felling = { ok: fellings.length > 0, fellings: fellings.slice(0, 10), felled: run.at(-1).felled, choppedTargets: [...new Set(run.filter((s) => s.cora.task === 'chop').map((s) => s.cora.target))] };
  checks.stumps = { ok: fellings.length > 0, stumpIds: [...new Set(fellings.map((t) => t.id))], resprouted: transitions.filter((t) => t.from === 'stump' && t.to !== 'gap'), rotted: transitions.filter((t) => t.from === 'stump' && t.to === 'gap') };
  checks.replanting = { ok: run.some((s) => s.orders.length > 0) && run.some((s) => s.cora.carry?.item?.startsWith('sapling:')) && run.at(-1).planted > 0,
    ordersSeen: [...new Set(run.flatMap((s) => s.orders.map((o) => `${o.id}:${o.sp}@${o.x},${o.z}`)))], planted: run.at(-1).planted,
    plantedTrees: Object.entries(run.at(-1).trees).filter(([, v]) => v.endsWith(':plant')) };
  checks.growth = { ok: growth.length > 0, transitions: growth.slice(0, 20), count: growth.length };
  checks.seeding = { ok: true, seeded: run.at(-1).seeded, seedlings: Object.entries(run.at(-1).trees).filter(([, v]) => v.endsWith(':seed')).length, note: 'informational: natural seeding is a random process; zero in a short run is possible' };
  const prot = protectId;
  checks.protectedUntouched = { ok: !!prot && run.every((s) => s.cora.target !== (prot ? `tree:${prot.slice(2).replace(',', ':')}` : '') && (s.trees[prot] ?? '').split(':')[1] !== 'stump' && (s.trees[prot] ?? '').split(':')[3] === ''),
    id: prot, states: [...new Set(run.map((s) => s.trees[prot]))] };
  const reasons = [...new Set(run.flatMap((s) => s.why).filter(Boolean))];
  checks.idleReasons = { ok: true, reasons, note: 'informational: why the woodcutter was not felling (quota, canopy minimum, store full)' };
  checks.reload = { ok: !!reloaded && reloaded.hashBefore === reloaded.hashAfter && reloaded.tickBefore === reloaded.tickAfter && reloaded.sameWoodland, ...reloaded };
  checks.panel = { ok: /may be felled/.test(panelEnd.stats), ...panelEnd };
  }
  if (CFG.phase !== 'life') {
  // Optional: age a fresh world to CFG.ageTo ticks first (time-lapse x60), so the views measure a woodland that
  // has grown, died and regrown for some days instead of the epoch state (every tree in its M008 drawn stage).
  if (CFG.ageTo && CFG.phase === 'views') {
    await pg.goto(`${CFG.base}?chain=0&timescale=60&${CFG.farm}`);
    await waitLoaded();
    await pg.waitForFunction((n) => (window.__metrics?.homestead?.tick ?? 0) >= n, CFG.ageTo, { timeout: 600000, polling: 2000 });
    await pg.keyboard.press('p');
    await pg.waitForTimeout(3000);
    const a = await sample('aged');
    checks.aged = { ok: a.tick >= CFG.ageTo, tick: a.tick, hash: a.hash, seconds: sec() };
  }

  // ---- 4. render cost: farm, forest and zoomed-out views; incremental nature cost while panning ----
  const view = async (name, q, extra = '&freeze=1') => {
    await pg.goto(`${CFG.base}?chain=0&${q}${extra}`);
    await waitLoaded(); await settle(); await pg.waitForTimeout(3000);
    const r = await pg.evaluate(() => { const m = window.__metrics; return { calls: m.rendererCalls, tris: m.rendererTriangles, instances: m.natureInstances, vegetation: m.vegetation ? { near: m.vegetation.near, mid: m.vegetation.mid, far: m.vegetation.far } : null, sync: m.natureSync, tick: m.sections?.tick ?? null }; });
    perf[name] = r;
    await shot(`view-${name}`, `${name}: ${r.calls} calls, ${r.tris} triangles`);
    return r;
  };
  await view('farm', 'mode=builder&tx=-28&ty=14&tz=4&yaw=0&pitch=30&dist=40');
  await view('forest', 'mode=builder&tx=220&ty=14&tz=-110&yaw=20&pitch=28&dist=50');
  await view('forest-140', 'mode=builder&tx=220&ty=14&tz=-110&yaw=20&pitch=28&dist=140');
  await view('farm-600', 'mode=builder&tx=-28&ty=14&tz=4&yaw=0&pitch=30&dist=600');
  await view('forest-600', 'mode=builder&tx=220&ty=14&tz=-110&yaw=20&pitch=28&dist=600');
  // The same forest views on the fallback path (no WEBGL_multi_draw: tiled baked meshes).
  await view('forest-multidraw0', 'mode=builder&tx=220&ty=14&tz=-110&yaw=20&pitch=28&dist=50&multidraw=0');
  await view('forest-140-multidraw0', 'mode=builder&tx=220&ty=14&tz=-110&yaw=20&pitch=28&dist=140&multidraw=0');
  await view('farm-timelapse', `mode=builder&tx=-28&ty=14&tz=4&yaw=0&pitch=30&dist=40&timescale=${CFG.timescale}`, '');
  const pan = async (name, extra) => {
    await pg.goto(`${CFG.base}?chain=0&freeze=1&mode=builder&tx=220&ty=14&tz=-110&yaw=20&pitch=28&dist=50${extra}`);
    await waitLoaded(); await settle();
    const s0 = await pg.evaluate(() => ({ sync: { ...window.__metrics.natureSync }, frames: window.__metrics.frames ?? null }));
    // Sample draw calls and triangles every 2 s during the pan: how far 20 s of panning goes depends on the frame
    // rate, so the end-of-pan numbers alone are not comparable between runs.
    const during = [];
    await pg.keyboard.down('d');
    for (let i = 0; i < 10; i++) { await pg.waitForTimeout(2000); during.push(await pg.evaluate(() => [window.__metrics.rendererCalls, window.__metrics.rendererTriangles])); }
    await pg.keyboard.up('d');
    await pg.waitForTimeout(4000);
    const s1 = await pg.evaluate(() => { const m = window.__metrics; return { sync: { ...m.natureSync }, syncSection: m.sections?.naturesync ?? null, vegetation: m.sections?.vegetation ?? null, rebuild: m.sections?.naturerebuild ?? null, calls: m.rendererCalls, tris: m.rendererTriangles, rebuilds: m.natureRebuilds, pendingBakes: m.vegetation?.pendingBakes ?? null }; });
    perf[name] = { chunksAdded: s1.sync.chunksAdded - s0.sync.chunksAdded, chunksDropped: s1.sync.chunksDropped - s0.sync.chunksDropped, adds: s1.sync.adds - s0.sync.adds, removes: s1.sync.removes - s0.sync.removes,
      syncs: s1.sync.syncs - s0.sync.syncs, syncMeanMs: (s1.sync.totalMs - s0.sync.totalMs) / Math.max(1, s1.sync.syncs - s0.sync.syncs), syncMaxMs: s1.sync.maxMs, syncSection: s1.syncSection, vegetationSection: s1.vegetation,
      fullRebuilds: s1.rebuilds, rebuildSection: s1.rebuild, calls: Math.max(s1.calls, ...during.map((d) => d[0])), tris: Math.max(s1.tris, ...during.map((d) => d[1])),
      endCalls: s1.calls, endTris: s1.tris, during, pendingBakes: s1.pendingBakes };
  };
  await pan('pan-forest', '');
  await pan('pan-forest-multidraw0', '&multidraw=0');
  checks.render = { ok: Object.values(perf).filter((p) => p.calls !== undefined).every((p) => p.calls < 120 && p.tris < 250000), maxCalls: Math.max(...Object.values(perf).map((p) => p.calls ?? 0), ...log.map((s) => s.calls ?? 0)), maxTris: Math.max(...Object.values(perf).map((p) => p.tris ?? 0), ...log.map((s) => s.tris ?? 0)) };
  // ---- 5. the lifecycle lineup close up ----
  await pg.goto(`${CFG.base}?chain=0&freeze=1&mode=builder&trees=1&tx=19&ty=14&tz=62&yaw=180&pitch=26&dist=58`);
  await waitLoaded(); await settle();
  await shot('8-lineup', 'dev lineup (?trees=1): rows oak, birch... columns sapling, young, mature, old, dying, dead snag, stump (near LOD)');
  await pg.goto(`${CFG.base}?chain=0&freeze=1&mode=builder&trees=1&tx=12&ty=14&tz=46&yaw=200&pitch=14&dist=22`);
  await waitLoaded(); await settle();
  await shot('9-lineup-close', 'lineup close-up: the first rows at near LOD (root spurs, lumpy crowns, layered spruce)');
  }
  checks.pageErrors = errs;
  const verdict = Object.fromEntries(Object.entries(checks).filter(([, v]) => v && typeof v === 'object' && 'ok' in v).map(([k, v]) => [k, v.ok]));
  const result = { base: CFG.base, startedAt: new Date(t0).toISOString(), seconds: sec(), phase: CFG.phase, ticks: [first.tick, run.at(-1)?.tick ?? null], verdict, checks, perf, shots, samples: log };
  let written = false;
  try {
    const out = await ctx.newPage();
    await ctx.route(`${CFG.base}m013-results.html`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>m013 results</title>' }));
    await out.goto(`${CFG.base}m013-results.html`);
    const [dl] = await Promise.all([out.waitForEvent('download'), out.evaluate((r) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([r], { type: 'application/json' })); a.download = 'results.json';
      document.body.appendChild(a); a.click();
    }, JSON.stringify(result, null, 1))]);
    await dl.saveAs(`${CFG.out}/m013-${CFG.prefix}${CFG.phase === 'all' ? '' : `-${CFG.phase}`}-results.json`);
    written = true;
  } catch (e) { errs.push(`results not written: ${e}`); }
  await ctx.close();
  return written ? { written: true, verdict, seconds: result.seconds, ticks: result.ticks, perf, shots: shots.map((s) => s.file), errs: errs.slice(0, 3) } : result;
}
