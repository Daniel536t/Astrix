async (page) => {
  // FINAL-MAP probe D: phone 390x844 (touch). The map: opened from the minimap, touch pan, pinch zoom, tap -> route + waypoint;
  // a second tap replaces it; overlaps between the map and the game controls.
  const DIR = '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist', SH = '/projects/sandbox/.kiro/artifacts/screenshots/final-map/';
  const ctx = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: DIR + p }); });
  await ctx.addInitScript(() => { if (!localStorage.getItem('astrix:worlds:v1')) { localStorage.setItem('astrix:entered:v1', '1'); localStorage.setItem('astrix:worlds:v1', JSON.stringify({ v: 1, worlds: [{ id: 'w1', seed: 1337, generatorVersion: 2, created: 1764000000000, spawn: { x: -82, z: -172 } }] })); localStorage.setItem('astrix:world:active:v1', 'w1'); } });
  const pg = await ctx.newPage();
  const L = { console: [], pageerror: [], failed: [], http: [] };
  pg.on('console', (m) => { if (m.type() === 'error') L.console.push(m.text().slice(0, 300)); });
  pg.on('pageerror', (e) => L.pageerror.push(String(e).slice(0, 300)));
  pg.on('requestfailed', (r) => L.failed.push(r.url()));
  pg.on('response', (r) => { if (r.status() >= 400) L.http.push(r.status() + ' ' + r.url()); });
  const out = {};
  try {
    await pg.goto('https://astrix.local/?chain=0&metrics=1');
    await pg.waitForFunction(() => window.__metrics?.explore?.spawned === true, null, { timeout: 180000 });
    await pg.waitForTimeout(3000);
    const mini = await pg.evaluate(() => { const b = document.getElementById('minimap').getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); });
    out.minimap = mini;
    await pg.screenshot({ path: SH + 'fm-d1-phone390-minimap.png' });
    await pg.touchscreen.tap(mini[0] + mini[2] / 2, mini[1] + mini[3] / 2);
    await pg.waitForTimeout(800);
    const V = () => pg.evaluate(() => window.__metrics.wild.map.view);
    out.openView = await V();
    out.openMs = await pg.evaluate(() => window.__metrics.wild.map.stats.mapOpenMs);
    await pg.screenshot({ path: SH + 'fm-d2-phone390-map-open.png' });
    // Overlaps: any visible game control drawn over the map sheet (sampled with elementFromPoint on a 10 px grid).
    out.overlap = await pg.evaluate(() => {
      const sheet = document.getElementById('world-map'); const b = sheet.getBoundingClientRect(); let foreign = 0, n = 0; const who = new Set();
      for (let y = b.top + 2; y < b.bottom - 2; y += 10) for (let x = b.left + 2; x < b.right - 2; x += 10) { n++; const el = document.elementFromPoint(x, y); if (el && !sheet.contains(el)) { foreign++; who.add(el.id || el.className || el.tagName); } }
      return { sheet: [b.left, b.top, b.right, b.bottom].map(Math.round), samples: n, foreign, who: [...who] };
    });
    // Touch pan (one finger) and pinch zoom (two fingers) through CDP touch events.
    const cdp = await ctx.newCDPSession(pg);
    const v0 = out.openView;
    const cx = v0.left + v0.w / 2, cy = v0.top + v0.h / 2;
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
    await touch('touchStart', [[cx, cy]]);
    for (let k = 1; k <= 6; k++) { await touch('touchMove', [[cx + 10 * k, cy + 8 * k]]); await pg.waitForTimeout(40); }
    await touch('touchEnd', []);
    await pg.waitForTimeout(500);
    out.afterPan = await V();
    await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
    for (let k = 1; k <= 6; k++) { await touch('touchMove', [[cx - 30 - 12 * k, cy], [cx + 30 + 12 * k, cy]]); await pg.waitForTimeout(40); }
    await touch('touchEnd', []);
    await pg.waitForTimeout(500);
    out.afterPinch = await V();
    // Pinch out again to see the land around, then tap a spot ~150 m away (screen from the view).
    await touch('touchStart', [[cx - 100, cy], [cx + 100, cy]]);
    for (let k = 1; k <= 6; k++) { await touch('touchMove', [[cx - 100 + 14 * k, cy], [cx + 100 - 14 * k, cy]]); await pg.waitForTimeout(40); }
    await touch('touchEnd', []);
    await pg.waitForTimeout(500);
    await pg.click('#world-map [data-centre]');
    await pg.waitForTimeout(300);
    const tapAt = async (x, z) => {
      const v = await V();
      const sx = v.left + v.w / 2 + (x - v.cx) * v.s, sy = v.top + v.h / 2 + (z - v.cz) * v.s;
      const onCanvas = await pg.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName === 'CANVAS' && !!document.elementFromPoint(x, y).closest('#world-map'), [sx, sy]);
      await pg.touchscreen.tap(sx, sy);
      await pg.waitForTimeout(400);
      await pg.waitForFunction(() => !window.__metrics.wild.map.planning, null, { timeout: 120000 }).catch(() => {});
      await pg.waitForTimeout(400);
      return pg.evaluate((OC) => { const m = window.__metrics.wild.map; return { onCanvas: OC, s: m.view.s, dest: m.dest, rejected: m.rejected, nav: m.navWaypoint, waypoints: m.waypoints.length, route: m.route, trailVisible: m.trailVisible }; }, onCanvas);
    };
    out.view2 = await V();
    out.tap1 = await tapAt(-40, -280);
    await pg.screenshot({ path: SH + 'fm-d3-phone390-tap-route.png' });
    out.tap2 = await tapAt(-150, -90);
    await pg.screenshot({ path: SH + 'fm-d4-phone390-tap-replaced.png' });
    out.overlapPopup = await pg.evaluate(() => {
      const p = document.querySelector('#world-map .map-popup'); if (!p || p.hidden) return null; const b = p.getBoundingClientRect(), s = document.getElementById('world-map').getBoundingClientRect();
      return { popup: [b.left, b.top, b.right, b.bottom].map(Math.round), insideSheet: b.left >= s.left && b.right <= s.right && b.top >= s.top && b.bottom <= s.bottom };
    });
    await pg.click('#world-map [data-close]');
    await pg.waitForTimeout(1500);
    out.world = await pg.evaluate(() => ({ calls: window.__metrics.rendererCalls, tris: window.__metrics.rendererTriangles, pill: (() => { const b = document.getElementById('route-pill').getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); })(), mini: (() => { const b = document.getElementById('minimap').getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); })(), minimapMs: window.__metrics.wild.map.stats.minimapMs, minimapMaxMs: window.__metrics.wild.map.stats.minimapMaxMs }));
    // Pill and minimap vs the other visible controls.
    out.hudOverlaps = await pg.evaluate(() => {
      const vis = (el) => { const cs = getComputedStyle(el); const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && !el.closest('[hidden]'); };
      const els = [...document.querySelectorAll('body > button, #controls button, #hud, #vitals, #wild-events, #minimap, #route-pill, #mode-button')].filter(vis);
      const r = els.map((el) => ({ id: el.id || (el.textContent || '').trim().slice(0, 12), b: el.getBoundingClientRect() }));
      const hits = [];
      for (const k of ['minimap', 'route-pill']) { const a = r.find((q) => q.id === k); if (!a) continue; for (const o of r) { if (o === a) continue; const ix = Math.min(a.b.right, o.b.right) - Math.max(a.b.left, o.b.left), iy = Math.min(a.b.bottom, o.b.bottom) - Math.max(a.b.top, o.b.top); if (ix > 0 && iy > 0) hits.push(`${k} x ${o.id}`); } }
      return { checked: r.map((q) => q.id), hits };
    });
    await pg.screenshot({ path: SH + 'fm-d5-phone390-world-trail.png' });
  } finally {
    out.log = L;
    await ctx.close();
  }
  return out;
}
