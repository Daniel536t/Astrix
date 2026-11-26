async (page) => {
  // STAB-002 v8 browser sanity (EMULATED desktop Chromium, software GL; not a real device).
  // 1. Live S3 build (https://astrix.nyc.boxd.sh/?chain=0), fresh context: founds a farm (rules v7), runs ~60 ticks,
  //    then every localStorage key is exported.
  // 2. Local v8 build (Game/dist copied to probe/dist, served as https://astrix.local/): that exported storage is
  //    loaded; the farm must upgrade to v8 with the same animals and villagers, no page errors.
  // 3. Local v8 build, fresh storage: a new farm is founded at v8.
  const DIST = '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist';
  const OUT = '/projects/sandbox/Astrix/13_Integration_and_QA/Evidence/STAB-002-stabilization/v8';
  const browser = page.context().browser();
  const errs = { live: [], upgrade: [], fresh: [] };
  const out = { emulated: 'Playwright Chromium 1000x600, desktop, software GL: NOT a real device' };
  const meta = async (pg) => pg.evaluate(() => { const m = window.__metrics, h = m?.homestead; return h ? { tick: h.tick, rules: h.rules, hash: m.stateHash ?? null, build: m.build ?? null,
    animals: h.herd.map((a) => a.id), herd: h.herd.map((a) => [a.id, a.species, a.x, a.z, a.act]), villagers: h.villagers.map((v) => [v.id, v.name, v.role]), sites: h.sites.length, fields: h.fields.length } : null; });
  const wait = async (pg, f, ms) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await pg.waitForTimeout(1000); } return null; };
  const local = async (ctx) => ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: DIST + p }); });

  // 1. Live S3.
  let exported = null;
  {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } });
    await ctx.addInitScript(() => { if (!sessionStorage.getItem('v8probe')) { localStorage.clear(); localStorage.setItem('astrix:entered:v1', '1'); sessionStorage.setItem('v8probe', '1'); } });
    const pg = await ctx.newPage();
    pg.setDefaultNavigationTimeout(240000);
    pg.on('pageerror', (e) => errs.live.push(String(e).slice(0, 200)));
    await pg.goto('https://astrix.nyc.boxd.sh/?chain=0&metrics=1&timescale=4');
    const first = await wait(pg, () => meta(pg), 300000);
    const at60 = await wait(pg, async () => { const m = await meta(pg); return m && first && m.tick >= first.tick + 60 ? m : null; }, 300000);
    await pg.waitForTimeout(2500); // let the next save land
    exported = await pg.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
    const saveKey = Object.keys(exported).find((k) => /^astrix:m002:v\d+:seed:1337$/.test(k));
    const save = saveKey ? JSON.parse(exported[saveKey]) : null;
    const snapH = save?.snapshot?.homestead;
    out.live = { url: 'https://astrix.nyc.boxd.sh/?chain=0&metrics=1&timescale=4', first: first && { tick: first.tick, rules: first.rules, build: first.build }, at60,
      saveKey, saveRules: snapH?.version ?? null, saveTick: save?.snapshot?.life?.tick ?? null, saveAnimals: snapH?.animals?.map((a) => a.id) ?? null,
      saveVillagers: snapH?.villagers?.map((v) => v.id) ?? null, journalEntries: save?.journal?.entries?.length ?? null,
      keys: Object.keys(exported), bytes: Object.values(exported).reduce((n, v) => n + (v?.length ?? 0), 0) };
    await pg.screenshot({ path: `${OUT}/stab002-v8-live-s3-at60.png` });
    await ctx.close();
  }

  // 2. The live save in the local v8 build.
  {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } });
    await local(ctx);
    await ctx.addInitScript((store) => { if (!sessionStorage.getItem('v8probe')) { localStorage.clear(); for (const [k, v] of Object.entries(store)) localStorage.setItem(k, v); sessionStorage.setItem('v8probe', '1'); } }, exported);
    const pg = await ctx.newPage();
    pg.setDefaultNavigationTimeout(240000);
    pg.on('pageerror', (e) => errs.upgrade.push(String(e).slice(0, 200)));
    await pg.goto('https://astrix.local/?chain=0&metrics=1');
    const m = await wait(pg, async () => { const x = await meta(pg); return x && x.rules === 8 ? x : null; }, 300000);
    const after = m ?? await meta(pg);
    await pg.waitForTimeout(3000);
    const later = await meta(pg);
    const st = await pg.evaluate(() => { const k = Object.keys(localStorage).find((x) => /^astrix:m002:v\d+:seed:1337$/.test(x)); return k ? localStorage.getItem(k) : null; });
    const save = st ? JSON.parse(st) : null;
    const entries = save?.journal?.entries ?? [];
    const up = entries.filter((e) => e.command?.type === 'upgrade_homestead').map((e) => ({ sequence: e.sequence, rules: e.command.rules }));
    const toast = await pg.evaluate(() => [...document.querySelectorAll('.toast, [role="status"]')].map((e) => e.textContent?.trim()).filter(Boolean).slice(0, 3));
    const liveA = out.live.saveAnimals ?? [], liveV = out.live.saveVillagers ?? [];
    out.upgrade = { after, later: later && { tick: later.tick, rules: later.rules, hash: later.hash }, upgrades: up, saveRules: save?.snapshot?.homestead?.version ?? null,
      animalsKept: !!after && liveA.length > 0 && liveA.every((id) => after.animals.includes(id)), animalsLive: liveA.length, animalsLocal: after?.animals.length ?? null,
      villagersKept: !!after && liveV.length > 0 && liveV.every((id) => after.villagers.some((v) => v[0] === id)), villagersLive: liveV.length, villagersLocal: after?.villagers.length ?? null, toast };
    await pg.screenshot({ path: `${OUT}/stab002-v8-local-upgraded.png` });
    await ctx.close();
  }

  // 3. Fresh world in the local v8 build.
  {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } });
    await local(ctx);
    await ctx.addInitScript(() => { if (!sessionStorage.getItem('v8probe')) { localStorage.clear(); localStorage.setItem('astrix:entered:v1', '1'); sessionStorage.setItem('v8probe', '1'); } });
    const pg = await ctx.newPage();
    pg.setDefaultNavigationTimeout(240000);
    pg.on('pageerror', (e) => errs.fresh.push(String(e).slice(0, 200)));
    await pg.goto('https://astrix.local/?chain=0&metrics=1&timescale=4');
    const m = await wait(pg, () => meta(pg), 300000);
    await pg.waitForTimeout(5000);
    const later = await meta(pg);
    out.fresh = { first: m && { tick: m.tick, rules: m.rules, build: m.build, animals: m.animals.length, villagers: m.villagers.map((v) => v[1]) }, later: later && { tick: later.tick, rules: later.rules } };
    await pg.screenshot({ path: `${OUT}/stab002-v8-local-fresh.png` });
    await ctx.close();
  }
  out.errs = errs;
  const ctx = await browser.newContext({ acceptDownloads: true });
  try {
    await ctx.route('https://astrix.local/v8-results.html', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>v8</title>' }));
    const o = await ctx.newPage();
    await o.goto('https://astrix.local/v8-results.html');
    const [dl] = await Promise.all([o.waitForEvent('download'), o.evaluate((r) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r], { type: 'application/json' })); a.download = 'r.json'; document.body.appendChild(a); a.click(); }, JSON.stringify(out, null, 1))]);
    await dl.saveAs(`${OUT}/stab002-v8-browser-results.json`);
    const [dl2] = await Promise.all([o.waitForEvent('download'), o.evaluate((r) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r], { type: 'application/json' })); a.download = 's.json'; document.body.appendChild(a); a.click(); }, JSON.stringify(exported))]);
    await dl2.saveAs(`${OUT}/stab002-v8-live-s3-localstorage.json`);
  } catch (e) { errs.fresh.push(`results not written: ${e}`); }
  await ctx.close();
  return JSON.stringify({ live: { first: out.live.first, tick: out.live.at60?.tick, rules: out.live.at60?.rules, saveRules: out.live.saveRules, saveTick: out.live.saveTick, animals: out.live.saveAnimals?.length, villagers: out.live.saveVillagers?.length },
    upgrade: { rules: out.upgrade.after?.rules, tick: out.upgrade.after?.tick, upgrades: out.upgrade.upgrades, saveRules: out.upgrade.saveRules, animalsKept: out.upgrade.animalsKept, a: [out.upgrade.animalsLive, out.upgrade.animalsLocal], villagersKept: out.upgrade.villagersKept, v: [out.upgrade.villagersLive, out.upgrade.villagersLocal], toast: out.upgrade.toast },
    fresh: out.fresh, errs });
}
