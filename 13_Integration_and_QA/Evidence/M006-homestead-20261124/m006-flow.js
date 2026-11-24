async (page) => {
  const DIR = '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist';
  const SHOTS = '/projects/sandbox/.kiro/artifacts/screenshots/';
  const out = { steps: [] };
  const step = (name, data) => out.steps.push({ name, ...data });
  const ctx = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: DIR + p }); });
  await ctx.addInitScript(() => { localStorage.setItem('astrix:entered:v1', '1'); });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
  const H = () => pg.evaluate(() => window.__metrics.homestead);
  const E = () => pg.evaluate(() => window.__metrics.explore);
  try {
    await pg.goto('https://astrix.local/?chain=0');
    await pg.waitForFunction(() => window.__metrics?.explore?.grounded === true && window.__metrics?.homestead, null, { timeout: 300000 });
    const h0 = await H();
    step('founded', { villagers: h0.villagers.map((v) => `${v.name}:${v.role}`), animals: h0.animals, fields: h0.fields.length, inspector: await pg.locator('#inspector').count() });
    // Open the planner (F) and walk until the spot in front is valid.
    await pg.keyboard.press('f');
    await pg.waitForTimeout(3000);
    let h = await H();
    step('planner opened', { planning: h.planning && { crop: h.planning.crop, w: h.planning.w, d: h.planning.d, reasons: h.planning.reasons } });
    await pg.screenshot({ path: SHOTS + 'M006-02-planner-invalid.png' });
    // Choose potatoes, make the field 5 x 4.
    await pg.click('#field-planner button[data-crop="potato"]');
    await pg.click('#field-planner button[data-plan="w+"]');
    await pg.waitForTimeout(2500);
    const moves = ['w', 'w', 'a', 'w', 'd', 'w', 's', 'a', 'w', 'w', 'd', 'd', 'w', 'a', 'a', 's'];
    let ok = false;
    for (let i = 0; i < moves.length && !ok; i++) {
      h = await H();
      if (h.planning && h.planning.reasons.length === 0 && h.planning.spec) { ok = true; break; }
      await pg.keyboard.down(moves[i]); await pg.waitForTimeout(2500); await pg.keyboard.up(moves[i]);
      await pg.waitForTimeout(2500);
    }
    h = await H();
    step('found a valid spot', { ok, spec: h.planning?.spec, reasons: h.planning?.reasons, me: await E().then((e) => [e.x, e.z]) });
    await pg.screenshot({ path: SHOTS + 'M006-03-planner-valid.png' });
    if (ok) {
      const wood0 = await pg.evaluate(() => window.__metrics.inventory.wood);
      await pg.click('#field-planner button[data-plan="place"]');
      await pg.waitForTimeout(3000);
      h = await H();
      step('field marked', { fields: h.fields, wood: [wood0, await pg.evaluate(() => window.__metrics.inventory.wood)], toast: await pg.evaluate(() => window.__metrics.lastAction) });
    }
    // Watch the farmer work it.
    const seen = new Set();
    for (let i = 0; i < 24; i++) {
      await pg.waitForTimeout(5000);
      h = await H();
      for (const v of h.villagers) seen.add(`${v.name}:${v.task}`);
      for (const f of h.fields) seen.add(`field:${f.state}:${f.stage}`);
      if (h.fields[0]?.state === 'growing' && h.fields[0].moisture > 0) break;
    }
    step('farm activity', { seen: [...seen], fields: h.fields, tick: h.tick });
    await pg.screenshot({ path: SHOTS + 'M006-04-farmer-at-work.png' });
    await pg.click('#farm-button');
    await pg.waitForTimeout(2500);
    await pg.screenshot({ path: SHOTS + 'M006-05-farm-panel.png' });
    step('panel', { text: (await pg.locator('#homestead-panel').innerText()).slice(0, 900) });
    // Reload: state must survive.
    const before = await H();
    await pg.reload();
    await pg.waitForFunction(() => window.__metrics?.homestead, null, { timeout: 300000 });
    const after = await H();
    step('after reload', { fieldsBefore: before.fields.map((f) => `${f.id}:${f.crop}:${f.w}x${f.d}:${f.state}`), fieldsAfter: after.fields.map((f) => `${f.id}:${f.crop}:${f.w}x${f.d}:${f.state}`), tickBefore: before.tick, tickAfter: after.tick, animals: after.animals });
    step('perf', await pg.evaluate(() => ({ calls: window.__metrics.rendererCalls, tris: window.__metrics.rendererTriangles, frameWork: window.__metrics.frameWork })));
  } catch (e) { out.error = String(e).slice(0, 300); await pg.screenshot({ path: SHOTS + 'M006-error.png' }).catch(() => {}); }
  out.errors = errs;
  await ctx.close();
  return out;
}
