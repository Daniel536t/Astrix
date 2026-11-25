async (page) => {
  // STAB-002 S2 re-measure after the step fix (emulated desktop Chromium, not a phone). Fresh storage, the
  // founder walks with the keyboard (W/A/S/D steered from the camera's own direction) at each species, steering
  // at the animal's SIM position matched by its sim id (window.__metrics.homestead.herd), not at the nearest
  // drawn instance: cow and horse (paddock), sheep and goat (pen), pig (sty), every hen in the coop (it has a
  // 1 m terrain step inside). Overlap per body over all frames from __metrics.explore.contact.minGapById
  // (squeeze frames, after 2.5 s of pressing, separately in squeezeGapById).
  const VARIANT = '__VARIANT__'; // 'chain0' or 'chainon'
  const DIR = '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist';
  const SHOTS = '/projects/sandbox/.kiro/artifacts/screenshots/probe/s2/';
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
    return { drawn, figs, t: performance.now(), x: e.x, y: e.y, z: e.z, speed: e.speed, contact: e.contact, cam: { x: cam.x, z: cam.z }, tick: h.tick, rules: h.rules, anchor: h.anchor,
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

  // Sim position of an animal by its sim id (the probe used to match the nearest drawn instance; hens stack).
  const simOf = (s, id) => { const a = near(s, id); return a ? { x: a.x, z: a.z } : null; };
  const chase = async (label, id, ms) => { const l = await seg(label, () => steer((s) => simOf(s, id), ms, { chase: true, label })); out.segments[label].animal = id; return l; };
  const all = await M();
  const ids = (sp) => all.herd.filter((a) => a.species === sp).sort((a, b) => a.id.localeCompare(b.id)).map((a) => a.id);
  // 1. Paddock: a cow, then a horse.
  await gateOpen('gate:paddock', { x: -21.5, z: 4.4 });
  await steer({ x: -21.5, z: 6.0 }, 6000);
  await chase('cow', ids('cattle')[0], 12000);
  await chase('horse', ids('horse')[0], 12000);
  await leave({ x: -21.5, z: 5.5 }, { x: -21.5, z: 4.4 });
  // 2. Pen: a sheep, a goat.
  for (const p of [{ x: -21.0, z: 4.0 }, { x: -21.0, z: -5.6 }, { x: -25.0, z: -5.6 }]) await steer(p, 12000, { stop: 0.4 });
  await gateOpen('gate:pen', { x: -25.0, z: -4.35 });
  await steer({ x: -25.5, z: -3.0 }, 6000);
  await chase('sheep', ids('sheep')[0], 10000);
  await chase('goat', ids('goat')[0], 10000);
  await leave({ x: -25.5, z: -3.5 }, { x: -25.0, z: -4.35 });
  // 3. Sty: a pig.
  for (const p of [{ x: -25.0, z: -5.6 }, { x: -14.6, z: -5.6 }]) await steer(p, 15000, { stop: 0.4 });
  await gateOpen('gate:sty', { x: -14.6, z: -4.35 });
  await steer({ x: -14.6, z: -3.0 }, 6000);
  await chase('pig', ids('pig')[0], 10000);
  await leave({ x: -14.6, z: -3.5 }, { x: -14.6, z: -4.35 });
  // 4. Coop (1 m terrain step inside): every hen in turn.
  for (const p of [{ x: -14.6, z: -5.6 }, { x: -32.6, z: -5.6 }]) await steer(p, 20000, { stop: 0.4 });
  await gateOpen('gate:coop', { x: -32.9, z: -4.35 });
  await steer({ x: -33.5, z: -3.0 }, 6000);
  const hens = ids('chicken');
  for (let k = 0; k < hens.length; k++) await chase(`chicken-${k}`, hens[k], 8000);
  await pg.screenshot({ path: SHOTS + `stab002-s2fix-${VARIANT}-coop.png` });
  await leave({ x: -33.5, z: -3.5 }, { x: -32.9, z: -4.35 });
  // Per species: the smallest gap over all frames (explore metrics, sim-derived capsules, bodies level with the feet).
  const last = await M();
  out.contactTotal = last.contact;
  const species = Object.fromEntries(last.herd.map((a) => [a.id, a.species]));
  const per = {};
  for (const [id, g] of Object.entries(last.contact.minGapById ?? {})) { const sp = species[id] ?? (id.startsWith('villager') ? 'villager' : 'other'); per[sp] = Math.min(per[sp] ?? Infinity, g); }
  const sq = {};
  for (const [id, g] of Object.entries(last.contact.squeezeGapById ?? {})) { const sp = species[id] ?? (id.startsWith('villager') ? 'villager' : 'other'); sq[sp] = Math.min(sq[sp] ?? Infinity, g); }
  out.minGapBySpecies = per;
  out.maxOverlapBySpecies = Object.fromEntries(Object.entries(per).map(([k, g]) => [k, +Math.max(0, -g).toFixed(3)]));
  // While squeezing (pressed CONTACT_SQUEEZE_AFTER = 2.5 s without getting anywhere; documented S2 deviation, up to 0.12 m).
  out.squeezeOverlapBySpecies = Object.fromEntries(Object.entries(sq).map(([k, g]) => [k, +Math.max(0, -g).toFixed(3)]));
  out.feetY = { min: Math.min(...samples.map((s) => s.y ?? Infinity)), max: Math.max(...samples.map((s) => s.y ?? -Infinity)) };
  out.errors = errs;
  await ctx.close();
  return JSON.stringify(out);
}
