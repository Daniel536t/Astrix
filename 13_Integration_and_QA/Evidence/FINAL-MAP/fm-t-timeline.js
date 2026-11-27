async (page) => {
  // FINAL-MAP: survey timeline on a fresh load (cache cleared), map closed; with the frame rate.
  await page.goto('https://astrix.local/blank');
  const removed = await page.evaluate(() => { const ks = Object.keys(localStorage).filter((k) => k.startsWith('astrix:mapsurvey:')); for (const k of ks) localStorage.removeItem(k); return ks; });
  await page.goto('https://astrix.local/?chain=0&metrics=1');
  await page.waitForFunction(() => window.__metrics?.explore?.spawned === true, null, { timeout: 180000 });
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const r = await page.evaluate(async () => {
      let n = 0; const t0 = performance.now();
      await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      const s = window.__metrics.wild.map.survey;
      return { t: Math.round(performance.now()), fps: n, chunks: s.chunksDone, cpu: s.chunkMsTotal, strips: s.overview, done: s.depositsDoneMs };
    });
    rows.push(r);
    if (r.done != null) break;
    await page.waitForTimeout(3000);
  }
  return { removed, rows };
}
