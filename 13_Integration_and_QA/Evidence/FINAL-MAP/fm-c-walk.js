async (page) => {
  // FINAL-MAP probe C (after B): walk ~15 m along the route -> the trail follows; E far from deposits mines nothing;
  // reload -> the survey comes from the cache and the navigation waypoint is the destination again.
  const SH = '/projects/sandbox/.kiro/artifacts/screenshots/final-map/';
  const M = () => page.evaluate(() => { const w = window.__metrics.wild, m = w.map; return { pos: { x: Math.round(window.__metrics.explore.x * 10) / 10, z: Math.round(window.__metrics.explore.z * 10) / 10 }, dest: m.dest, nav: m.navWaypoint, route: m.route, trailVisible: m.trailVisible, trailEnds: m.trailEnds, trailTriangles: m.trailTriangles, replans: m.stats.replans, refineMs: m.stats.refineMs, mines: w.stats.mines, found: m.deposits, nearest: m.nearestDeposits.slice(0, 3), action: (window.__wildNear?.(4) ?? {}).action ?? null, calls: window.__metrics.rendererCalls, tris: window.__metrics.rendererTriangles }; });
  const out = {};
  out.before = await M();
  const pts = await page.evaluate(() => window.__metrics.wild.map.routePts);
  // A point about 15 m along the route.
  let acc = 0, target = pts[pts.length - 1];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (acc + d >= 15) { const f = (15 - acc) / d; target = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]; break; } acc += d; }
  out.walkTo = target;
  out.walk = await page.evaluate(([x, z]) => window.__h.walk(x, z, 1.5, 90000), target);
  await page.waitForTimeout(2500);
  out.after = await M();
  await page.screenshot({ path: SH + 'fm-c1-desktop-walked-trail.png' });
  // E with no deposit in reach: nothing is mined (the nearest deposits are tens of metres away).
  const minesBefore = out.after.mines;
  for (let i = 0; i < 3; i++) { await page.evaluate(() => window.__h.tapE()); }
  await page.waitForTimeout(500);
  out.afterE = await M();
  out.minedNothing = out.afterE.mines === minesBefore;
  // Reload: survey from the cache; the navigation waypoint becomes the destination again.
  const t0 = Date.now();
  await page.goto('https://astrix.local/?chain=0&metrics=1');
  await page.waitForFunction(() => window.__metrics?.explore?.spawned === true, null, { timeout: 180000 });
  out.reloadReadyMs = Date.now() - t0;
  await page.waitForTimeout(3000);
  out.reload = await page.evaluate(() => { const m = window.__metrics.wild.map; return { survey: m.survey, dest: m.dest, nav: m.navWaypoint, route: m.route, trailVisible: m.trailVisible, found: m.deposits, explored: m.explored }; });
  await page.keyboard.press('m');
  await page.waitForTimeout(600);
  out.reloadOpen = await page.evaluate(() => { const m = window.__metrics.wild.map; return { mapOpenMs: m.stats.mapOpenMs, drawn: m.stats.drawnDeposits, places: m.stats.drawnPlaces }; });
  for (let i = 0; i < 4; i++) { await page.click('#world-map [data-mapzoom="out"]'); await page.waitForTimeout(150); }
  await page.waitForTimeout(400);
  out.reloadZoomed = await page.evaluate(() => { const m = window.__metrics.wild.map; return { s: m.view.s, drawn: m.stats.drawnDeposits, clusters: m.stats.drawnClusters, places: m.stats.drawnPlaces, mapDrawMs: m.stats.mapDrawMs, mapDrawMaxMs: m.stats.mapDrawMaxMs }; });
  await page.screenshot({ path: SH + 'fm-c2-desktop-reload-cached-world.png' });
  await page.keyboard.press('Escape');
  out.log = page.__fm;
  return out;
}
