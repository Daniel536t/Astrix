async (page) => {
  // STAB-002 S4 mobile/perf comparison (EMULATED in Playwright Chromium with software GL; NOT a real device).
  // One viewport per run, four variants in turn (chain=0 / chain-on x quality medium / low), fresh storage, the
  // founder spawned at the farm (between the pens and the farmhouse) and walked back and forth through it.
  // Per variant, ~40 s of samples (1 per second) at ?timescale=4: renderer draw calls and triangles (farm view),
  // the sim tick (sections.tick: realtimeTick incl. presence), the founder's contact cost
  // (explore.contact: building the capsules and the fixed steps with contact, per frame; S2 and later only),
  // frame work p95. `tag` names the build: 'before' (6e7fc61 tracked dist), 'live' (https://astrix.nyc.boxd.sh/),
  // 'after' (local S4 build).
  const CFG = /*CFG*/{
    base: 'https://astrix.local/',
    dist: '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist',
    out: '/projects/sandbox/Astrix/13_Integration_and_QA/Evidence/STAB-002-stabilization/s4',
    tag: 'after',
    view: { name: 'phone', width: 390, height: 844, isMobile: true },
    variants: [[false, 'medium'], [false, 'low'], [true, 'medium'], [true, 'low']],
    spot: [-24, 6],
    seconds: 40,
  }/*END*/;
  const local = /^https:\/\/astrix\.local\//.test(CFG.base);
  const errs = [], results = [];
  const t0 = Date.now();
  const med = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const max = (a) => { const s = a.filter((x) => Number.isFinite(x)); return s.length ? Math.max(...s) : null; };
  for (const [chain, level] of CFG.variants) {
    const key = `${CFG.view.name} ${chain ? 'chain-on' : 'chain=0'} ${level}`;
    const ctx = await page.context().browser().newContext({ viewport: { width: CFG.view.width, height: CFG.view.height }, hasTouch: true, isMobile: CFG.view.isMobile, deviceScaleFactor: 1 });
    if (local) await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: CFG.dist + p }); });
    await ctx.addInitScript(([x, z]) => { if (!sessionStorage.getItem('s4perf')) { localStorage.clear(); localStorage.setItem('astrix:entered:v1', '1');
      localStorage.setItem('astrix:avatar:v1:seed:1337:gen:2', JSON.stringify({ x, y: 100, z, heading: 0 })); sessionStorage.setItem('s4perf', '1'); } }, [CFG.spot[0] + 0.5, CFG.spot[1] + 0.5]);
    const pg = await ctx.newPage();
    pg.setDefaultNavigationTimeout(240000);
    pg.on('pageerror', (e) => errs.push(`${key}: ${String(e).slice(0, 200)}`));
    try {
      await pg.goto(`${CFG.base}?${chain ? '' : 'chain=0&'}metrics=1&timescale=4&quality=${level}`);
      await pg.waitForFunction(() => window.__metrics?.homestead && window.__metrics.explore?.spawned, null, { timeout: 300000 });
      let st = 0; for (let i = 0; i < 60 && st < 2; i++) { await pg.waitForTimeout(1500); const p = await pg.evaluate(() => window.__metrics?.pendingChunkBuilds ?? 1); st = p === 0 ? st + 1 : 0; }
      if (chain) { for (let i = 0; i < 20; i++) { const n = await pg.evaluate(() => { let n = 0; window.__renderBreakdown?.().entries.forEach((e) => { if (e.owner === 'magicblock_settlement') n += e.meshes; }); return n; }); if (n) break; await pg.waitForTimeout(2000); } }
      const s0 = await pg.evaluate(() => ({ tick: window.__metrics.homestead.tick ?? window.__metrics.life?.tick, rules: window.__metrics.homestead.rules, build: window.__metrics.build ?? null }));
      const samples = [];
      const keys = ['w', 's'];
      for (let i = 0; i < CFG.seconds; i++) {
        // Walk through the farm: 4 s one way, 4 s back (keys held), so contact and the farm view are exercised.
        if (i % 4 === 0) { await pg.keyboard.up(keys[(i / 4 + 1) % 2]); await pg.keyboard.down(keys[(i / 4) % 2]); }
        await pg.waitForTimeout(1000);
        samples.push(await pg.evaluate(() => { const m = window.__metrics; const c = m.explore?.contact; const sec = m.sections ?? {};
          return { calls: m.rendererCalls, tris: m.rendererTriangles, tick: m.homestead?.tick, tickMs: sec.tick?.meanMs, tickP95: sec.tick?.p95Ms, tickN: sec.tick?.n,
            collect: c?.collectMsPerFrame, stepMs: c?.stepMsPerFrame, maxStep: c?.maxStepMs, bodies: c?.bodies, frameP95: m.frameWork?.p95Ms ?? m.frameWork?.p95, quality: m.quality?.level, x: m.explore?.x, z: m.explore?.z }; }));
      }
      await pg.keyboard.up('w'); await pg.keyboard.up('s');
      const last = samples.at(-1);
      await pg.screenshot({ path: `${CFG.out}/stab002-s4-perf-${CFG.tag}-${CFG.view.name}-${chain ? 'chainon' : 'chain0'}-${level}.png` });
      results.push({ key, chain, level, rules: s0.rules, ticks: [s0.tick, last.tick], quality: last.quality,
        drawCalls: { median: med(samples.map((s) => s.calls)), max: max(samples.map((s) => s.calls)) },
        triangles: { median: med(samples.map((s) => s.tris)), max: max(samples.map((s) => s.tris)) },
        simTickMs: { mean: last.tickMs, p95: last.tickP95, n: last.tickN },
        contactMsPerFrame: last.collect === undefined ? null : { collect: last.collect, stepsWithContact: last.stepMs, maxSteps: last.maxStep, bodies: last.bodies },
        frameWorkP95: last.frameP95 ?? null, walked: [samples[0].x, samples[0].z, last.x, last.z] });
    } catch (e) { errs.push(`${key}: ${String(e).slice(0, 300)}`); }
    await ctx.close();
  }
  const out = { emulated: `Playwright Chromium ${CFG.view.width}x${CFG.view.height}, hasTouch, isMobile ${CFG.view.isMobile}, dpr 1, software GL: NOT a real device`, tag: CFG.tag, base: CFG.base, seconds: Math.round((Date.now() - t0) / 1000), results, errs };
  const ctx = await page.context().browser().newContext({ acceptDownloads: true });
  try {
    await ctx.route('https://astrix.local/s4-results.html', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>s4</title>' }));
    const o = await ctx.newPage();
    await o.goto('https://astrix.local/s4-results.html');
    const [dl] = await Promise.all([o.waitForEvent('download'), o.evaluate((r) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r], { type: 'application/json' })); a.download = 'r.json'; document.body.appendChild(a); a.click(); }, JSON.stringify(out, null, 1))]);
    await dl.saveAs(`${CFG.out}/stab002-s4-perf-${CFG.tag}-${CFG.view.name}.json`);
  } catch (e) { errs.push(`results not written: ${e}`); }
  await ctx.close();
  return JSON.stringify({ tag: CFG.tag, view: CFG.view.name, s: out.seconds, errs: errs.slice(0, 4), r: results.map((r) => [r.key, r.rules, r.drawCalls.median, r.triangles.median, r.simTickMs.mean, r.simTickMs.p95, r.contactMsPerFrame?.collect, r.contactMsPerFrame?.stepsWithContact, r.ticks]) });
}
