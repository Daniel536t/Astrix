async (page) => {
  // STAB-002 S2 browser probe (emulated desktop Chromium, not a phone). Fresh storage, the founder walks
  // with the keyboard (W/A/S/D steered toward targets from the camera's own direction) into a cow and a
  // horse in the paddock (gate opened with E), a sheep in the pen, a chicken in the coop, stands in the
  // pen, walks into a villager; samples contact (explore metrics: capsules from sim state), the sim herd,
  // the drawn herd instances, the presence on the ticks, journal size, draw calls; then reloads.
  const VARIANT = '__VARIANT__'; // 'chain0' or 'chainon'
  const DIR = '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist';
  const SHOTS = '/projects/sandbox/.kiro/artifacts/screenshots/probe/s2/'; // copied to the evidence folder s2/ afterwards
  const ctx = await page.context().browser().newContext({ viewport: { width: 1200, height: 700 } });
  await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: DIR + p }); });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('probe:init')) { localStorage.clear(); sessionStorage.setItem('probe:init', '1'); } localStorage.setItem('astrix:entered:v1', '1'); });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
  const URL = VARIANT === 'chain0' ? 'https://astrix.local/?chain=0&metrics=1' : 'https://astrix.local/?metrics=1';
  await pg.goto(URL);
  await pg.waitForFunction(() => window.__ready === true && window.__metrics?.homestead?.herd?.length > 0 && window.__metrics?.explore?.spawned, null, { timeout: 300000 });
  // Drawn herd instances (render only, for comparing what is drawn with the capsules the founder collides with).
  await pg.evaluate(() => { const r = window.__probe.renderer, o = r.render; r.render = function (sc, c) { if (!window.__H) { const l = []; sc.traverse((m) => { if (m.isInstancedMesh && /^herd_/.test(m.name)) l.push(m); }); if (l.length) window.__H = l; }
      if (!window.__V || window.__V.length < 3) { const v = []; sc.traverse((m) => { if (/^villager_/.test(m.name)) v.push(m); }); window.__V = v; } return o.call(this, sc, c); }; });
  await pg.waitForTimeout(1500);
  const out = { variant: VARIANT, errors: errs, segments: {}, notes: [] };
  const M = () => pg.evaluate(() => {
    const m = window.__metrics, e = m.explore, h = m.homestead, cam = window.__probe.camera.position;
    const drawn = {};
    for (const o of window.__H ?? []) { const a = o.instanceMatrix.array, l = []; for (let k = 0; k < o.count; k++) l.push([a[k * 16 + 12], a[k * 16 + 14]]); drawn[o.name.slice(5)] = l; }
    const figs = (window.__V ?? []).filter((f) => f.visible).map((f) => ({ id: f.userData.villagerId, x: f.position.x, z: f.position.z }));
    return { drawn, figs, t: performance.now(), x: e.x, z: e.z, speed: e.speed, contact: e.contact, cam: { x: cam.x, z: cam.z }, tick: h.tick, rules: h.rules, anchor: h.anchor,
      herd: h.herd, villagers: h.villagers.map((v) => ({ id: v.id, name: v.name, x: v.x, z: v.z, wait: v.nav?.wait ?? null, task: v.task })), gates: h.gates,
      presence: m.realtime.presence, hash: m.stateHash, commands: m.acceptedCommands, calls: m.rendererCalls, tris: m.rendererTriangles, save: m.save };
  });
  const keys = new Set();
  const press = async (want) => { for (const k of ['w', 'a', 's', 'd']) { if (want.has(k) && !keys.has(k)) { await pg.keyboard.down(k); keys.add(k); } if (!want.has(k) && keys.has(k)) { await pg.keyboard.up(k); keys.delete(k); } } };
  const release = () => press(new Set());
  const samples = [];
  /** Steer toward a target (a point, or a function of the latest sample) for up to ms; stops within `stop` m unless chase. */
  const steer = async (target, ms, { stop = 0.3, chase = false, label = '' } = {}) => {
    const t0 = Date.now();
    let s = await M();
    while (Date.now() - t0 < ms) {
      const tg = typeof target === 'function' ? target(s) : target;
      if (!tg) break;
      const dx = tg.x - s.x, dz = tg.z - s.z, d = Math.hypot(dx, dz);
      if (!chase && d < stop) break;
      let fx = s.x - s.cam.x, fz = s.z - s.cam.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      const rx = -fz, rz = fx;
      const kf = (dx * fx + dz * fz) / (d || 1), kr = (dx * rx + dz * rz) / (d || 1);
      const want = new Set();
      if (d > 0.05) { if (kf > 0.38) want.add('w'); if (kf < -0.38) want.add('s'); if (kr > 0.38) want.add('d'); if (kr < -0.38) want.add('a'); }
      await press(want);
      await pg.waitForTimeout(60);
      s = await M();
      if (label) samples.push({ label, ...s });
    }
    await release();
    return s;
  };
  /** Leave a pen through its gate (inside cell, then outside), close it with E only once outside. */
  const leave = async (inside, outside) => {
    for (let k = 0; k < 3; k++) {
      await steer(inside, 10000);
      const s = await steer(outside, 6000);
      if (Math.hypot(s.x - outside.x, s.z - outside.z) < 0.5) { await pg.keyboard.press('e'); await pg.waitForTimeout(300); return true; }
    }
    out.notes.push(`could not leave through ${JSON.stringify(outside)}`);
    return false;
  };
  const near = (s, id) => s.herd.find((a) => a.id === id);
  // The drawn instance of an animal: the instance of its species nearest its sim position.
  const drawnOf = (s, id) => { const a = near(s, id); if (!a) return null; let best = null, bd = Infinity; for (const [x, z] of s.drawn[a.species] ?? []) { const d = Math.hypot(x - a.x, z - a.z); if (d < bd) { bd = d; best = { x, z }; } } return best; };
  const RADII = { cattle: 0.46, horse: 0.32, sheep: 0.42, goat: 0.26, pig: 0.35, chicken: 0.2 };
  const first = (s, sp) => s.herd.filter((a) => a.species === sp).sort((a, b) => a.id.localeCompare(b.id))[0];
  const s0 = await M();
  out.start = { tick: s0.tick, rules: s0.rules, anchor: s0.anchor, hash: s0.hash, x: s0.x, z: s0.z };
  if (s0.anchor.x !== -24 || s0.anchor.z !== -4) out.notes.push(`unexpected anchor ${JSON.stringify(s0.anchor)}`);
  let saveStart = null;
  const saveSize = () => pg.evaluate(() => { const k = window.__metrics.save.key; const raw = localStorage.getItem(k) ?? ''; let entries = 0, presence = 0, tickEntries = 0, bytesTick = 0;
    try { const j = JSON.parse(raw); const list = (j.journal ?? j).entries ?? []; entries = list.length; for (const e of list) { if (e.command?.type === 'tick') { tickEntries++; bytesTick += JSON.stringify(e).length; if (e.command.presence) presence++; } } } catch { /* other format */ }
    return { bytes: raw.length, entries, tickEntries, presence, bytesTick, at: Date.now() }; });
  saveStart = await saveSize();
  const gateOpen = async (id, outsideCentre) => {
    await steer(outsideCentre, 25000, { stop: 0.35 });
    const b = await M();
    const before = b.gates.find((g) => g.id === id).state;
    const nearest = await pg.evaluate(() => JSON.stringify(window.__metrics.homestead.nearest));
    // E works the nearest action: at the coop that can be collecting eggs first, so press again until the gate is open.
    for (let k = 0; k < 3 && (await M()).gates.find((g) => g.id === id).state !== 'open'; k++) { await pg.keyboard.press('e'); await pg.waitForTimeout(400); }
    const after = (await M()).gates.find((g) => g.id === id).state;
    out.notes.push(`${id}: ${before} -> ${after} with E at ${b.x.toFixed(2)},${b.z.toFixed(2)} (nearest action ${nearest})`);
  };
  const seg = async (label, fn) => {
    const i0 = samples.length;
    await fn();
    const list = samples.slice(i0);
    const c0 = list[0]?.contact, c1 = list[list.length - 1]?.contact;
    let minGap = Infinity, nearestId = null, maxHeld = 0, msSum = 0, msN = 0, maxMs = 0;
    for (const s of list) {
      const n = s.contact?.nearest;
      if (n && n.gap < minGap) { minGap = n.gap; nearestId = n.id; }
      maxHeld = Math.max(maxHeld, s.contact?.heldS ?? 0);
      maxMs = Math.max(maxMs, s.contact?.maxCollectMs ?? 0);
    }
    let stepSum = 0;
    if (c0 && c1 && c1.frames > c0.frames) { msSum = c1.collectMsPerFrame * c1.frames - c0.collectMsPerFrame * c0.frames; stepSum = c1.stepMsPerFrame * c1.frames - c0.stepMsPerFrame * c0.frames; msN = c1.frames - c0.frames; }
    const calls = list.map((s) => s.calls).sort((a, b) => a - b), tris = list.map((s) => s.tris).sort((a, b) => a - b);
    out.segments[label] = { samples: list.length, ticks: [list[0]?.tick, list[list.length - 1]?.tick], minGapSampled: +minGap.toFixed(3), nearestAtMin: nearestId,
      maxHeldS: +maxHeld.toFixed(2), collectMsPerFrame: msN ? +(msSum / msN).toFixed(4) : null, stepMsPerFrame: msN ? +(stepSum / msN).toFixed(4) : null, maxCollectMsSoFar: maxMs, bodiesNear: list[list.length - 1]?.contact?.bodies,
      callsMedian: calls[calls.length >> 1], trisMedian: tris[tris.length >> 1], presenceSeen: list.filter((s) => s.presence).length };
    return list;
  };
  // Sim distance (m) from the presence point to an animal, per new tick, and how often an animal inside its ring moved away.
  const simReport = (list, ids) => {
    const r = {};
    let lastTick = -1;
    for (const s of list) {
      if (s.tick === lastTick || !s.presence) continue;
      lastTick = s.tick;
      for (const id of ids) { const a = near(s, id); if (!a) continue; const d = Math.hypot(a.x - s.presence.x / 10, a.z - s.presence.z / 10); (r[id] ??= []).push(+d.toFixed(2)); }
    }
    return r;
  };
  // Closest founder-to-drawn-centre distance (m) of this animal, against the sum of radii.
  const drawnCentreMin = (list, sp, simId) => {
    let best = Infinity;
    for (const s of list) { const d = drawnOf(s, simId); if (d) best = Math.min(best, Math.hypot(d.x - s.x, d.z - s.z)); }
    return { drawnCentre: +best.toFixed(3), sumOfRadii: +(RADII[sp] + 0.3).toFixed(2) };
  };

  // 1. Paddock: open the gate with E, walk into a cow, then a horse.
  await gateOpen('gate:paddock', { x: -21.5, z: 4.4 });
  await steer({ x: -21.5, z: 6.0 }, 6000);
  const cowId = first(await M(), 'cattle').id, horseId = first(await M(), 'horse').id;
  const cow = await seg('cow', () => steer((s) => drawnOf(s, cowId), 12000, { chase: true, label: 'cow' }));
  out.segments.cow.animal = cowId; out.segments.cow.simDistance = simReport(cow, [cowId]); out.segments.cow.minSimCentre = drawnCentreMin(cow, 'cattle', cowId);
  await pg.screenshot({ path: SHOTS + `stab002-s2-${VARIANT}-cow.png` });
  const horse = await seg('horse', () => steer((s) => drawnOf(s, horseId), 12000, { chase: true, label: 'horse' }));
  out.segments.horse.animal = horseId; out.segments.horse.simDistance = simReport(horse, [horseId]); out.segments.horse.minSimCentre = drawnCentreMin(horse, 'horse', horseId);
  await pg.screenshot({ path: SHOTS + `stab002-s2-${VARIANT}-horse.png` });
  // Out of the paddock again, gate closed behind.
  await leave({ x: -21.5, z: 5.5 }, { x: -21.5, z: 4.4 });
  // 2. Pen: a sheep, then stand in the pen 24 s. Round the pens by the lane between the pen and the sty.
  for (const p of [{ x: -21.0, z: 4.0 }, { x: -21.0, z: -5.6 }, { x: -25.0, z: -5.6 }]) await steer(p, 12000, { stop: 0.4 });
  await gateOpen('gate:pen', { x: -25.0, z: -4.35 });
  await steer({ x: -25.5, z: -3.0 }, 6000);
  const sheepId = first(await M(), 'sheep').id;
  const sheep = await seg('sheep', () => steer((s) => drawnOf(s, sheepId), 10000, { chase: true, label: 'sheep' }));
  out.segments.sheep.animal = sheepId; out.segments.sheep.simDistance = simReport(sheep, [sheepId]); out.segments.sheep.minSimCentre = drawnCentreMin(sheep, 'sheep', sheepId);
  const standList = await seg('stand-in-pen', async () => { const t0 = Date.now(); while (Date.now() - t0 < 24000) { await pg.waitForTimeout(150); samples.push({ label: 'stand', ...(await M()) }); } });
  const penIds = standList[0].herd.filter((a) => a.species === 'sheep' || a.species === 'goat').map((a) => a.id);
  const penDist = simReport(standList, penIds);
  let reentries = 0, approaches = 0;
  for (const [id, ds] of Object.entries(penDist)) {
    const sp = standList[0].herd.find((a) => a.id === id).species;
    const ring = sp === 'sheep' ? 1.9 : 2.1;
    let left = false;
    for (let k = 1; k < ds.length; k++) { if (ds[k - 1] < ring && ds[k] < ds[k - 1] - 0.05) approaches++; if (k >= 2) { if (ds[k] >= ring) left = true; else if (left) { reentries++; left = false; } } }
  }
  out.segments['stand-in-pen'].simDistance = penDist; out.segments['stand-in-pen'].ringReentries = reentries; out.segments['stand-in-pen'].approachesInsideRing = approaches;
  await pg.screenshot({ path: SHOTS + `stab002-s2-${VARIANT}-pen.png` });
  await leave({ x: -25.5, z: -3.5 }, { x: -25.0, z: -4.35 });
  // 3. Coop: a chicken (along the lane south of the pens).
  for (const p of [{ x: -25.0, z: -5.6 }, { x: -32.6, z: -5.6 }]) await steer(p, 12000, { stop: 0.4 });
  await gateOpen('gate:coop', { x: -32.9, z: -4.35 });
  await steer({ x: -33.5, z: -3.0 }, 6000);
  const henId = first(await M(), 'chicken').id;
  const hen = await seg('chicken', () => steer((s) => drawnOf(s, henId), 9000, { chase: true, label: 'chicken' }));
  out.segments.chicken.animal = henId; out.segments.chicken.simDistance = simReport(hen, [henId]); out.segments.chicken.minSimCentre = drawnCentreMin(hen, 'chicken', henId);
  await leave({ x: -33.5, z: -3.5 }, { x: -32.9, z: -4.35 });
  // 4. A villager.
  // The nearest drawn villager figure (what the player sees and walks at).
  const nearestVillager = (s) => (s.figs.length ? s.figs : s.villagers).map((v) => ({ ...v, d: Math.hypot(v.x - s.x, v.z - s.z) })).sort((a, b) => a.d - b.d)[0];
  const vil = nearestVillager(await M());
  const vlist = await seg('villager', () => steer((s) => nearestVillager(s), 25000, { chase: true, label: 'villager' }));
  out.segments.villager.villager = vil.id;
  out.segments.villager.waits = [...new Set(vlist.flatMap((s) => s.villagers.filter((v) => v.wait).map((v) => `${v.name}: ${v.wait.reason}`)))];
  out.segments.villager.minCentreDrawn = +Math.min(...vlist.map((s) => nearestVillager(s).d)).toFixed(3);
  out.segments.villager.minCentreSim = +Math.min(...vlist.map((s) => Math.min(...s.villagers.map((v) => Math.hypot(v.x - s.x, v.z - s.z))))).toFixed(3);
  // Drawn figure against the contact capsule for the villager in contact (both from the same sim blend).
  const cmp = [];
  for (const q of vlist) { const n = q.contact?.nearest; if (!n || !n.id.startsWith('villager')) continue; const f = q.figs.find((x) => x.id === n.id); if (!f) continue; cmp.push(+(Math.hypot(f.x - q.x, f.z - q.z) - 0.6 - n.gap).toFixed(3)); }
  cmp.sort((a, b) => a - b);
  out.segments.villager.drawnMinusCapsuleGap = { n: cmp.length, min: cmp[0] ?? null, median: cmp[cmp.length >> 1] ?? null };
  await pg.screenshot({ path: SHOTS + `stab002-s2-${VARIANT}-villager.png` });
  // Journal growth.
  const saveEnd = await saveSize();
  const minutes = (saveEnd.at - saveStart.at) / 60000;
  out.journal = { start: saveStart, end: saveEnd, minutes: +minutes.toFixed(2), bytesPerMinute: Math.round((saveEnd.bytes - saveStart.bytes) / minutes),
    tickEntryBytes: saveEnd.tickEntries ? Math.round(saveEnd.bytesTick / saveEnd.tickEntries) : null, presenceShare: saveEnd.tickEntries ? +(saveEnd.presence / saveEnd.tickEntries).toFixed(2) : null };
  // Contact metrics over the whole run.
  const last = await M();
  out.contactTotal = last.contact;
  // 5. Reload: same hash.
  // Right after a tick (ticks are 2 s apart), read the hash and reopen the same save with ?freeze=1 (no new ticks after loading).
  const c0 = await pg.evaluate(() => window.__metrics.acceptedCommands);
  await pg.waitForFunction((c) => window.__metrics.acceptedCommands > c, c0, { timeout: 10000 });
  await pg.waitForTimeout(300);
  const before = await pg.evaluate(() => ({ hash: window.__metrics.stateHash, commands: window.__metrics.acceptedCommands }));
  await pg.goto(URL + '&freeze=1');
  await pg.waitForFunction(() => window.__ready === true && window.__metrics?.homestead, null, { timeout: 300000 });
  const after = await pg.evaluate(() => ({ hash: window.__metrics.stateHash, commands: window.__metrics.acceptedCommands, status: window.__metrics.save.status }));
  out.reload = { before, after, same: before.hash === after.hash };
  out.errors = errs;
  await ctx.close();
  return JSON.stringify(out);
}
