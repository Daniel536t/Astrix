async (page) => {
  // STAB-002 S1 browser probe C: a v6 save made in the browser by the build before v7 (dist-v6-head = 4169c21/090cab6 dist),
  // then loaded by the v7 build in the same storage: one journaled upgrade_homestead rules 7 on load.
  // Checks: rules, hash before/after, every animal id kept at its place at the upgrade, trapped animals walk out, states.
  const ROOT = '/projects/sandbox/.kiro/artifacts/screenshots/probe/';
  let DIR = ROOT + 'dist-v6-head';
  const ctx = await page.context().browser().newContext({ viewport: { width: 1200, height: 700 } });
  await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: DIR + p }); });
  await ctx.addInitScript(() => { localStorage.setItem('astrix:entered:v1', '1'); }); // a new context starts with empty storage; both pages share it
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
  const URL = 'https://astrix.local/?chain=0&metrics=1&tx=-26&ty=12&tz=4&yaw=0&pitch=50&dist=26';
  await pg.goto(URL);
  await pg.waitForFunction(() => window.__ready === true && window.__metrics?.homestead?.herd?.length > 0, null, { timeout: 300000 });
  await pg.waitForTimeout(60000);
  const v6 = await pg.evaluate(() => {
    const m = window.__metrics, raw = localStorage.getItem('astrix:m002:v3:seed:1337'), rec = JSON.parse(raw);
    return { rules: m.homestead.rules, hash: m.stateHash, accepted: m.acceptedCommands, tick: m.homestead.tick, saveAnimals: rec.snapshot.homestead ? null : null,
      herd: m.homestead.herd.map((a) => [a.id, a.x, a.z]), villagers: m.homestead.villagers.map((v) => [v.id, v.role]), enclosures: m.homestead.enclosures, store: m.homestead.store, bytes: raw.length };
  });
  await pg.screenshot({ path: ROOT + 'stab002-s1-v6-before.png' });
  // Close the page so no further v6 tick is written, then open the v7 build on the same storage.
  await pg.close();
  DIR = ROOT + 'dist';
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
  await p2.goto(URL);
  await p2.waitForFunction(() => window.__ready === true && window.__metrics?.homestead?.rules === 7, null, { timeout: 300000 });
  const up = await p2.evaluate(() => {
    const rec = JSON.parse(localStorage.getItem('astrix:m002:v3:seed:1337'));
    const ents = rec.journal.entries;
    const k = ents.findIndex((e) => e.command.type === 'upgrade_homestead');
    return { status: window.__metrics.save.status, upgradeEntry: k >= 0 ? { index: k, command: ents[k].command, outcome: ents[k].outcome } : null, entries: ents.length, tick: window.__metrics.homestead.tick };
  });
  await p2.evaluate(() => { const r = window.__probe.renderer, o = r.render; r.render = function (s, c) { window.__S = s; return o.call(this, s, c); }; });
  const S = [];
  for (let i = 0; i < 240; i++) {
    S.push(await p2.evaluate(() => { const m = window.__metrics.homestead; const lying = {};
      window.__S?.traverse((o) => { if (o.isInstancedMesh && /^herd_/.test(o.name)) { const st = o.geometry.attributes.iState.array, out = []; for (let k = 0; k < o.count; k++) out.push(st[k * 4 + 2]); lying[o.name.slice(5)] = out; } });
      return { tick: m.tick, rules: m.rules, herd: m.herd.map((a) => [a.id, a.x, a.z, a.act, a.until, a.species]), lying, hash: window.__metrics.stateHash }; }));
    if (i === 120) await p2.screenshot({ path: ROOT + 'stab002-s1-v6-upgraded.png' });
    await p2.waitForTimeout(500);
  }
  // Animals the v6 farm held at the close: ids, and the first v7 sample positions vs the last v6 positions.
  const v6ids = v6.herd.map((a) => a[0]);
  const first = S[0].herd, kept = v6ids.filter((id) => first.some((a) => a[0] === id));
  const per = {};
  let maxStep = 0, lieBad = 0;
  for (let k = 1; k < S.length; k++) {
    const idx = {};
    for (const a of S[k].herd) {
      idx[a[5]] = (idx[a[5]] ?? -1) + 1;
      const pa = S[k - 1].herd.find((q) => q[0] === a[0]);
      const r = per[a[0]] ??= { ticks: 0, moved: 0, st: {} };
      if (pa && S[k].tick !== S[k - 1].tick) { r.ticks++; const d = Math.hypot(a[1] - pa[1], a[2] - pa[2]); maxStep = Math.max(maxStep, d / Math.max(1, S[k].tick - S[k - 1].tick)); if (d > 0) r.moved++; r.st[a[3]] = (r.st[a[3]] ?? 0) + 1; }
      const l = S[k].lying[a[5]]?.[idx[a[5]]];
      if (l !== undefined && (l > 0.5) !== (a[3] === 'rest') && !(a[3] === 'rest' && pa && (pa[1] !== a[1] || pa[2] !== a[2]))) lieBad++;
    }
  }
  const frozen = Object.entries(per).filter(([, r]) => r.ticks >= 60 && r.moved === 0).map(([id]) => id);
  const shares = Object.entries(per).filter(([, r]) => r.ticks >= 60).map(([id, r]) => [id, +(r.moved / r.ticks * 100).toFixed(1)]);
  await ctx.close();
  return { v6: { rules: v6.rules, hash: v6.hash, accepted: v6.accepted, tick: v6.tick, animals: v6ids.length, villagers: v6.villagers, enclosures: v6.enclosures, store: v6.store },
    upgrade: up, v7first: { tick: S[0].tick, rules: S[0].rules, animals: first.length, keptIds: kept.length, samePlaceAsV6Close: v6.herd.filter((a) => first.some((b) => b[0] === a[0] && b[1] === a[1] && b[2] === a[2])).length },
    ticks: [S[0].tick, S.at(-1).tick], frozen, minShare: Math.min(...shares.map((x) => x[1])), shares, maxStepPerTick_m: +maxStep.toFixed(2), lyingMismatch: lieBad,
    states: Object.fromEntries(Object.entries(per).map(([id, r]) => [id, r.st])), errs };
}
