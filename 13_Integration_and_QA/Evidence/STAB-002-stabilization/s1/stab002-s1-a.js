async (page) => {
  // STAB-002 S1 browser probe A: fresh v7 homestead (fresh storage), ?chain=0. Samples the sim herd
  // (__metrics.homestead.herd: position, act, until) and the drawn herd instances (lying, head pitch)
  // every 500 ms for 240 s, takes screenshots, then reloads and checks the restored hash.
  const DIR = '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist';
  const SHOTS = '/projects/sandbox/.kiro/artifacts/screenshots/probe/';
  const ctx = await page.context().browser().newContext({ viewport: { width: 1200, height: 700 } });
  await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: DIR + p }); });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('probe:init')) { localStorage.clear(); sessionStorage.setItem('probe:init', '1'); } localStorage.setItem('astrix:entered:v1', '1'); });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
  const URL = 'https://astrix.local/?chain=0&metrics=1&tx=-26&ty=12&tz=4&yaw=0&pitch=50&dist=26';
  await pg.goto(URL);
  await pg.waitForFunction(() => window.__ready === true && window.__metrics?.homestead?.herd?.length > 0, null, { timeout: 300000 });
  await pg.evaluate(() => { const r = window.__probe.renderer, o = r.render; r.render = function (s, c) { window.__S = s; return o.call(this, s, c); }; });
  await pg.waitForTimeout(2000);
  const sample = () => pg.evaluate(() => {
    const m = window.__metrics.homestead; if (!m) return null;
    const drawn = {};
    window.__S?.traverse((o) => {
      if (!o.isInstancedMesh || !/^herd_/.test(o.name)) return;
      const a = o.instanceMatrix.array, an = o.geometry.attributes.iAnim.array, st = o.geometry.attributes.iState.array, out = [];
      for (let k = 0; k < o.count; k++) out.push([+a[k * 16 + 12].toFixed(3), +a[k * 16 + 14].toFixed(3), +an[k * 4 + 2].toFixed(2), st[k * 4 + 2]]);
      drawn[o.name.slice(5)] = out;
    });
    return { tick: m.tick, night: m.day.night, rules: m.rules, herd: m.herd, drawn, hash: window.__metrics.stateHash, herdTime: m.herdTime.total };
  });
  const S = [];
  const SECONDS = 240, EVERY = 500;
  let shots = 0;
  const shotLog = [];
  for (let i = 0; i < (SECONDS * 1000) / EVERY; i++) {
    const x = await sample(); if (x) S.push(x);
    if (x && i % 40 === 20 && shots < 6) {
      const c = { graze: 0, drink: 0, rest: 0, wander: 0 }; for (const a of x.herd) c[a.act]++;
      const f = `stab002-s1-fresh-${shots++}.png`;
      await pg.screenshot({ path: SHOTS + f });
      shotLog.push({ f, tick: x.tick, states: c, ids: x.herd.filter((a) => a.act === 'rest' || (a.act === 'graze' && a.until > 0)).map((a) => `${a.id}:${a.species}:${a.act}`) });
    }
    await pg.waitForTimeout(EVERY);
  }
  // Per animal: sim ticks seen, ticks moved, ticks per state; drawn lying / head-down agreement with the sim state.
  const per = {};
  let lieOk = 0, lieBad = 0, headOk = 0, headBad = 0;
  for (let k = 1; k < S.length; k++) {
    const a = S[k - 1], b = S[k];
    const idx = {};
    for (const an of b.herd) {
      idx[an.species] = (idx[an.species] ?? -1) + 1;
      const r = per[an.id] ??= { sp: an.species, ticks: 0, moved: 0, st: {} };
      const pa = a.herd.find((q) => q.id === an.id);
      if (b.tick !== a.tick && pa) { r.ticks++; if (pa.x !== an.x || pa.z !== an.z) r.moved++; r.st[an.act] = (r.st[an.act] ?? 0) + 1; }
      const d = b.drawn[an.species]?.[idx[an.species]];
      if (!d) continue;
      const lying = d[3] > 0.5, head = d[2] > 0.5;
      if (an.act === 'rest' && pa && pa.x === an.x && pa.z === an.z) { if (lying) lieOk++; else lieBad++; }
      else if (an.act !== 'rest' && lying) lieBad++;
      if ((an.act === 'graze' || an.act === 'drink') && an.until > 0 && pa && pa.x === an.x && pa.z === an.z) { if (head) headOk++; else headBad++; }
    }
  }
  const animals = Object.entries(per).map(([id, r]) => `${id} ${r.sp} moved ${r.moved}/${r.ticks} ${JSON.stringify(r.st)}`);
  const frozen = Object.entries(per).filter(([, r]) => r.ticks >= 60 && r.moved === 0).map(([id]) => id);
  const minShare = Math.min(...Object.values(per).filter((r) => r.ticks >= 60).map((r) => r.moved / r.ticks));
  // Reload: the save written by the last accepted command restores to the same hash.
  const before = await pg.evaluate(() => { const raw = localStorage.getItem('astrix:m002:v3:seed:1337'); const rec = JSON.parse(raw); return { n: rec.journal.entries.length, seq: rec.journal.entries.at(-1)?.sequence ?? null, hash: window.__metrics.stateHash, accepted: window.__metrics.acceptedCommands, bytes: raw.length }; });
  await pg.evaluate(() => { window.__frozenHash = null; });
  await pg.reload();
  await pg.waitForFunction(() => window.__ready === true && window.__metrics?.homestead, null, { timeout: 300000 });
  const after = await pg.evaluate(() => ({ status: window.__metrics.save.status, message: window.__metrics.save.message, hash: window.__metrics.stateHash, accepted: window.__metrics.acceptedCommands, rules: window.__metrics.homestead.rules, tick: window.__metrics.homestead.tick }));
  const rec = await pg.evaluate(() => localStorage.getItem('astrix:m002:v3:seed:1337'));
  let saved = 'no';
  try { (await import('node:fs')).writeFileSync(SHOTS + 'stab002-s1-fresh-save.json', rec); saved = 'yes'; } catch (e) { try { require('fs').writeFileSync(SHOTS + 'stab002-s1-fresh-save.json', rec); saved = 'yes(require)'; } catch (e2) { saved = String(e2).slice(0, 100); } }
  await ctx.close();
  return { n: S.length, ticks: [S[0]?.tick, S.at(-1)?.tick], rules: S[0]?.rules, night: [S[0]?.night, S.at(-1)?.night], herdTime: S.at(-1)?.herdTime, frozen, minShare: +(minShare * 100).toFixed(1),
    drawnVsSim: { lyingMatchesRest: lieOk, lyingMismatch: lieBad, headDownWhileBout: headOk, headUpWhileBout: headBad }, shots: shotLog, before, after, saved, animals, errs };
}
