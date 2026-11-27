async (page) => {
  // FINAL-MAP probe B (after A, same page, desktop 1280x800): tap far -> waypoint + route + trail; tap another -> replaced;
  // tap the lake -> refused with the reason, previous kept; walk a little -> the trail follows; a far deposit is not minable.
  const SH = '/projects/sandbox/.kiro/artifacts/screenshots/final-map/';
  const out = { taps: [] };
  const M = () => page.evaluate(() => { const w = window.__metrics.wild, m = w.map; return { dest: m.dest, rejected: m.rejected, planning: m.planning, planningKind: m.planningKind, route: m.route, routeText: m.routeText, nav: m.navWaypoint, waypoints: m.waypoints, trailVisible: m.trailVisible, trailTriangles: m.trailTriangles, trailEnds: m.trailEnds, routePts: m.routePts.slice(0, 12), calls: window.__metrics.rendererCalls, tris: window.__metrics.rendererTriangles, budget: window.__metrics.sceneBudget, pos: { x: window.__metrics.explore.x, z: window.__metrics.explore.z }, found: m.deposits, visited: m.places, explored: m.explored, journal: window.__metrics.acceptedCommands, stats: { routeMs: m.stats.routeMs, routeCpuMs: m.stats.routeCpuMs, taps: m.stats.taps, rejected: m.stats.rejected, replaced: m.stats.replaced, mapOpenMs: m.stats.mapOpenMs, mapDrawMs: m.stats.mapDrawMs, mapDrawMaxMs: m.stats.mapDrawMaxMs, minimapMs: m.stats.minimapMs, minimapMaxMs: m.stats.minimapMaxMs, tilesBuilt: m.stats.tilesBuilt, tilesFromWorkers: m.stats.tilesFromWorkers, surveyPumpMaxMs: m.stats.surveyPumpMaxMs, refineMs: m.stats.refineMs, replans: m.stats.replans }, mines: w.stats.mines }; });
  const openMap = async () => { if (!(await page.evaluate(() => window.__metrics.wild.map.open))) { await page.keyboard.press('m'); await page.waitForTimeout(400); } };
  const tapWorld = async (x, z) => {
    const v = await page.evaluate(() => window.__metrics.wild.map.view);
    const sx = v.left + v.w / 2 + (x - v.cx) * v.s, sy = v.top + v.h / 2 + (z - v.cz) * v.s;
    await page.mouse.click(sx, sy);
    await page.waitForTimeout(300);
    await page.waitForFunction(() => !window.__metrics.wild.map.planning, null, { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(400);
    return M();
  };
  await openMap();
  // The whole world in view (zoomed out), centred on the player.
  await page.click('#world-map [data-centre]');
  await page.waitForTimeout(300);
  // 1) A far spot (about 330 m north-east), then others if it had no route.
  let first = null;
  for (const [x, z] of [[150, -420], [120, -380], [60, -330]]) {
    const r = await tapWorld(x, z);
    out.taps.push({ at: [x, z], dest: r.dest, rejected: r.rejected, nav: r.nav, route: r.route, routeMs: r.stats.routeMs, routeCpuMs: r.stats.routeCpuMs });
    if (r.dest && !r.rejected) { first = r; break; }
  }
  await page.screenshot({ path: SH + 'fm-b1-desktop-tap-far-route.png' });
  out.first = first && { nav: first.nav, dest: first.dest, route: first.route, routeText: first.routeText, waypoints: first.waypoints.length };
  // In the world: the trail and the pill.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  out.world1 = await M();
  await page.screenshot({ path: SH + 'fm-b2-desktop-world-trail.png' });
  // 2) Another destination replaces it.
  await openMap();
  await page.click('#world-map [data-centre]');
  await page.waitForTimeout(300);
  const second = await tapWorld(-248, -104);
  out.second = { nav: second.nav, dest: second.dest, rejected: second.rejected, route: second.route, waypoints: second.waypoints, replaced: second.stats.replaced };
  await page.screenshot({ path: SH + 'fm-b3-desktop-tap-replaced.png' });
  // 3) The middle of Mirror Lake: refused with the reason; the previous route and waypoint stay.
  const third = await tapWorld(-265, -286);
  out.third = { nav: third.nav, dest: third.dest, rejected: third.rejected, routeSame: JSON.stringify(third.routePts) === JSON.stringify(second.routePts), routeText: third.routeText, status: await page.textContent('#world-map [data-route-status]'), popup: await page.textContent('#world-map .map-popup') };
  await page.screenshot({ path: SH + 'fm-b4-desktop-tap-lake-refused.png' });
  out.nearest = await page.evaluate(() => window.__metrics.wild.map.nearestDeposits);
  out.depositList = await page.evaluate(() => [...document.querySelectorAll('#world-map [data-deposits] li')].slice(0, 5).map((li) => li.textContent.trim()));
  out.legend = await page.evaluate(() => [...document.querySelectorAll('#world-map .legend li')].map((li) => li.textContent.trim()));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  return out;
}
