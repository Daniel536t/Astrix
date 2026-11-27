async (page) => {
  const dist = '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist';
  const ctx = await page.context().browser().newContext({ viewport: { width: 1000, height: 600 } });
  await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: dist + p }); });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('f')) { localStorage.clear(); localStorage.setItem('astrix:entered:v1', '1'); sessionStorage.setItem('f', '1'); } });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  const out = [];
  const snap = (l) => pg.evaluate((l) => { const m = window.__metrics, h = m.homestead; return { l, tick: h?.tick, seq: m.acceptedCommands, protect: h?.woodland?.protect, role: h?.villagers?.[2]?.role, hud: document.getElementById('hud')?.innerText.slice(0, 80), btns: [...document.querySelectorAll('[data-protect-tree]')].map((b) => b.getAttribute('data-protect-tree')), toast: [...document.querySelectorAll('.toast, [class*=toast]')].map((t) => t.textContent).slice(-3) }; }, l).then((s) => out.push(s));
  await pg.goto('https://astrix.local/?chain=0&mode=builder&tx=-40&tz=-14&ty=8&dist=70&pitch=48&yaw=20');
  await pg.waitForFunction(() => window.__metrics?.homestead?.woodland && window.__metrics.homestead.villagers.length === 3, null, { timeout: 300000 });
  await pg.waitForTimeout(8000);
  await pg.keyboard.press('p'); await pg.waitForTimeout(1500);
  await snap('paused');
  await pg.click('#farm-button'); await pg.waitForTimeout(600);
  await pg.selectOption('select[data-role-of="villager:2"]', 'woodcutter'); await pg.waitForTimeout(800);
  await snap('role');
  const id = await pg.evaluate(() => document.querySelector('[data-protect-tree]')?.getAttribute('data-protect-tree'));
  // record events reaching the panel
  await pg.evaluate(() => { window.__ev = []; const p = document.getElementById('homestead-panel'); for (const t of ['mousedown', 'mouseup', 'click']) p.addEventListener(t, (e) => window.__ev.push(`${t}:${e.target.tagName}:${e.target.getAttribute?.('data-protect-tree') ?? ''}:${e.target.isConnected}`), true); });
  await pg.click(`[data-protect-tree="${id}"]`); await pg.waitForTimeout(800);
  await snap('clicked');
  const ev = await pg.evaluate(() => window.__ev);
  await pg.waitForTimeout(3000);
  await snap('later');
  await ctx.close();
  return { id, ev, out, errs };
}
