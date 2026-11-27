async (page) => {
  // M015 mobile layout audit (EMULATED, not a real device): Playwright Chromium with isMobile + hasTouch,
  // deviceScaleFactor 1 (CSS layout is identical at any DPR), software GL. One viewport per run.
  // For each screen it takes a screenshot and measures every visible UI element: overlaps between
  // panels/controls, elements clipped by the viewport, tap targets under 40 px, text overflow, and
  // panels that cover the joystick thumb area or the Jump button. A FRESH world (?chain=0) except the
  // entry screen run (?enter=1, chain on, then "Explore offline", which shows the MagicBlock panel).
  // Viewports run in parallel contexts (CFG.vps). Generate a copy for other viewports/dist with gen-m015.mjs.
  const ALL = /*CFG*/{
    base: 'https://astrix.local/',
    dist: '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist',
    out: '/projects/sandbox/Astrix/13_Integration_and_QA/Evidence/M015-mobile-verification',
    prefix: 'before',
    vps: ['p390'],
    extra: '',
  }/*END*/;
  const VP = { p360: { w: 360, h: 780, mobile: true }, p390: { w: 390, h: 844, mobile: true }, l844: { w: 844, h: 390, mobile: true },
    t1280: { w: 1280, h: 800, mobile: true }, t800: { w: 800, h: 1280, mobile: true }, d1280: { w: 1280, h: 720, mobile: false } };
  const one = async (CFG) => {
  const local = /^https:\/\/astrix\.local\//.test(CFG.base);
  const ctx = await page.context().browser().newContext(CFG.mobile
    ? { viewport: { width: CFG.w, height: CFG.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
    : { viewport: { width: CFG.w, height: CFG.h } });
  if (local) await ctx.route(/^https:\/\/astrix\.local\//, async (route) => { let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0]; if (p === '/' || p === '') p = '/index.html'; await route.fulfill({ path: CFG.dist + p }); });
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('m015-fresh')) { localStorage.clear(); localStorage.setItem('astrix:entered:v1', '1'); sessionStorage.setItem('m015-fresh', '1'); }
    const seed = sessionStorage.getItem('m015-avatar');
    if (seed) { localStorage.setItem('astrix:avatar:v1:seed:1337:gen:2', seed); sessionStorage.removeItem('m015-avatar'); }
  });
  const pg = await ctx.newPage();
  pg.setDefaultNavigationTimeout(240000);
  const cdp = CFG.mobile ? await ctx.newCDPSession(pg) : null;
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
  const t0 = Date.now();
  const sec = () => Math.round((Date.now() - t0) / 100) / 10;
  const screens = [];
  const SEL = ['#hud', '#inventory', '#build-panel', '#life-panel', '#homestead-panel', '#build-bar', '#field-planner', '#farm-button', '#mode-button',
    '.drawer-toggle', '#vitals', '#toast', '#gather-nearest', '#jump-button', '#dive-button', '#return-home-button', '#return-banner-button',
    '#plant-banner-button', '.zoomers', '#chain-panel', '#enter-screen .enter-card', '#perf-overlay', '#settings-button', '#settings-panel'];
  const measure = () => pg.evaluate((SEL) => {
    const vw = innerWidth, vh = innerHeight;
    const vis = (e) => { if (!e) return false; const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05 && r.width > 0 && r.height > 0 && !e.closest('[hidden]'); };
    const rect = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const els = {};
    for (const s of SEL) { const e = document.querySelector(s); if (vis(e)) els[s] = rect(e); }
    const over = (a, b) => a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.y < b.y + b.h - 1 && a.y + a.h > b.y + 1;
    const overlaps = [];
    const keys = Object.keys(els);
    // Toast and HUD are pointer-transparent overlays; their overlaps with each other are reported separately.
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      const a = document.querySelector(keys[i]), b = document.querySelector(keys[j]);
      if (a.contains(b) || b.contains(a)) continue;
      if (over(els[keys[i]], els[keys[j]])) overlaps.push([keys[i], keys[j]]);
    }
    const clipped = keys.filter((k) => { const r = els[k]; return r.x < -1 || r.y < -1 || r.x + r.w > vw + 1 || r.y + r.h > vh + 1; });
    // Tap targets: every visible, enabled button / select / label-for / input in the game UI.
    const small = [];
    for (const e of document.querySelectorAll('button, select, label[for], input:not(.drawer-state)')) {
      if (!vis(e)) continue;
      // A checkbox or radio inside a label is tapped through its label.
      const hit = (e.type === 'checkbox' || e.type === 'radio') && e.closest('label') ? e.closest('label') : e;
      const r = hit.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      // Inside a scrolled panel, only rows in view count.
      if (Math.min(r.width, r.height) < 40) small.push({ el: (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.dataset && Object.keys(e.dataset)[0] ? `[data-${Object.keys(e.dataset)[0].replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}]` : '') + (e.className ? '.' + String(e.className).split(' ')[0] : '')), text: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height), in: e.closest('[id]')?.id ?? '' });
    }
    const overflow = [];
    for (const e of document.querySelectorAll('button, label[for], #hud, #mode-button, .drawer-toggle label')) {
      if (!vis(e)) continue;
      if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX !== 'auto') overflow.push({ el: e.id || e.textContent.trim().slice(0, 20), scroll: e.scrollWidth, client: e.clientWidth });
    }
    const scrollers = {};
    for (const s of ['#homestead-panel', '#build-bar', '#life-panel', '#build-panel']) {
      const e = document.querySelector(s); if (!vis(e)) continue;
      scrollers[s] = { scrollH: e.scrollHeight, clientH: e.clientHeight, scrolls: e.scrollHeight > e.clientHeight + 2, overflowY: getComputedStyle(e).overflowY };
    }
    // Walk-mode thumb areas: the joystick rest area (bottom-left) and the Jump button.
    const walking = document.body.classList.contains('explore');
    const thumb = { x: 0, y: Math.round(vh * 0.6), w: Math.min(Math.round(vw * 0.5), 260), h: Math.round(vh * 0.4) };
    const cover = [];
    if (walking && matchMedia('(pointer: coarse)').matches) {
      const jump = els['#jump-button'];
      for (const k of keys) {
        if (['#hud', '#toast', '#vitals', '#jump-button', '#dive-button', '#gather-nearest', '.zoomers', '#return-home-button', '#return-banner-button', '#plant-banner-button'].includes(k)) continue;
        if (over(els[k], thumb)) cover.push([k, 'joystick area']);
        if (jump && over(els[k], jump)) cover.push([k, 'Jump']);
      }
    }
    return { vw, vh, body: document.body.className, els, overlaps, clipped, small, overflow, scrollers, cover, thumb };
  }, SEL);
  const shot = async (name, why) => {
    const file = `${CFG.prefix}-${CFG.vp}-${name}.png`;
    await pg.screenshot({ path: `${CFG.out}/${file}` });
    const m = await measure();
    screens.push({ name, file, why, t: sec(), ...m });
    return m;
  };
  const settle = async () => {
    let stable = 0;
    for (let i = 0; i < 30 && stable < 2; i++) { await pg.waitForTimeout(2000); const p = await pg.evaluate(() => window.__metrics?.pendingChunkBuilds ?? 1); stable = p === 0 ? stable + 1 : 0; }
  };
  // A real tap: scroll the element into view, then touch its centre (no actionability wait: software GL
  // runs at a few fps here, and the panels may re-render while Playwright waits for a stable box).
  const tap = async (sel) => {
    const c = await pg.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; e.scrollIntoView({ block: 'center', inline: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
    if (!c) throw new Error(`no ${sel}`);
    await pg.waitForTimeout(300);
    const d = await pg.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
    if (CFG.mobile) await pg.touchscreen.tap(d.x, d.y); else await pg.mouse.click(d.x, d.y);
    await pg.waitForTimeout(800);
  };
  const touch = (type, points) => cdp?.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const load = async (q) => {
    await pg.goto(`${CFG.base}?${q}${CFG.extra}`);
    await pg.waitForFunction(() => window.__metrics?.explore?.spawned && window.__metrics?.homestead, null, { timeout: 400000 });
    await settle();
  };

  // ---- 1. entry screen (chain on), then Explore offline: the MagicBlock panel ----
  try {
    await pg.goto(`${CFG.base}?enter=1${CFG.extra}`);
    await pg.waitForSelector('#enter-screen', { timeout: 120000 });
    await pg.waitForTimeout(1500);
    await shot('1-entry', 'first load: entry screen (Quick Play / Wallet Play)');
    await tap('[data-act="offline"]');
    await pg.waitForFunction(() => window.__metrics?.explore?.spawned && window.__metrics?.homestead, null, { timeout: 400000 });
    await settle();
    await pg.waitForTimeout(3000);
    await shot('2-chain-explore', 'walk mode with the MagicBlock settlement panel (chain on)');
  } catch (e) { errs.push(`entry: ${String(e).slice(0, 200)}`); }

  // ---- 2. walk mode, fresh world (chain off) ----
  await pg.evaluate(() => { sessionStorage.removeItem('m015-fresh'); });
  await load('chain=0');
  await shot('3-explore', 'walk mode on arrival: HUD, vitals, settlers toast, controls');
  // Thumb down on the joystick (held) for the screenshot.
  if (CFG.mobile) {
    const x = 90, y = CFG.h - 110;
    await touch('touchStart', [{ x, y, id: 1 }]);
    for (let i = 1; i <= 4; i++) { await touch('touchMove', [{ x, y: y - 12 * i, id: 1 }]); await pg.waitForTimeout(60); }
    await pg.waitForTimeout(400);
    await shot('4-joystick', 'joystick held (walking)');
    await touch('touchEnd', []);
    await pg.waitForTimeout(600);
  }
  // Plant a banner: toast + field banner button lights up.
  if (CFG.mobile) { await tap('#plant-banner-button'); await pg.waitForTimeout(400); await shot('5-toast', 'Plant banner: toast in walk mode'); }
  // ---- 3. Farm panel ----
  await tap('#farm-button');
  await shot('6-farm-top', 'Farm panel open (top)');
  await pg.evaluate(() => { const p = document.getElementById('homestead-panel'); p.scrollTop = p.scrollHeight; });
  await pg.waitForTimeout(500);
  await shot('7-farm-bottom', 'Farm panel scrolled to the bottom');
  await pg.evaluate(() => { const p = document.getElementById('homestead-panel'); p.scrollTop = 0; });
  // ---- 4. build mode from Farm ----
  await tap('[data-build-open]');
  await pg.waitForTimeout(800);
  await shot('8-build-walk', 'build mode in walk mode (Farm -> Build...)');
  await tap('[data-build-close]').catch(() => {});
  // ---- 5. builder view and its tabs ----
  await tap('#mode-button');
  await pg.waitForTimeout(1200);
  await shot('9-builder', 'builder view (default tab)');
  for (const [lab, name] of [['.drawer-build', 'b-build-tab'], ['.drawer-world', 'c-world-tab'], ['.drawer-settlement', 'a-settlement-tab']]) {
    const shown = await pg.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; }, lab);
    if (!shown) continue;
    await tap(lab);
    await shot(`9${name}`, `builder view: ${name}`);
  }
  // Build mode in the builder view (the desktop overlap case from M014).
  await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true })));
  await pg.waitForTimeout(1000);
  await shot('10-build-builder', 'build mode in the builder view');
  await pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true })));
  await pg.waitForTimeout(500);
  // ---- 6. swimming (seeded avatar in the river west of the spawn) ----
  await pg.evaluate(() => sessionStorage.setItem('m015-avatar', JSON.stringify({ x: -59.5, y: 100, z: 4.5, heading: 0, health: 100, stamina: 1 })));
  await load('chain=0');
  await pg.waitForTimeout(4000);
  await shot('11-swim', 'swimming: Dive button shown');

  // ---- 7. optional settings / perf overlay (after M015) ----
  const hasSettings = await pg.evaluate(() => !!document.getElementById('settings-button'));
  if (hasSettings) { await tap('#settings-button'); await shot('12-settings', 'settings: graphics quality'); await tap('#settings-button'); }
  if (/perf=1/.test(CFG.extra)) {
    await tap('#perf-overlay .perf-pill').catch(() => {});
    await shot('13-perf-open', 'performance monitor expanded');
  }

  const issues = screens.map((s) => ({ name: s.name, overlaps: s.overlaps.filter(([a, b]) => !(['#hud', '#toast'].includes(a) || ['#hud', '#toast'].includes(b))), hudToast: s.overlaps.filter(([a, b]) => ['#hud', '#toast'].includes(a) || ['#hud', '#toast'].includes(b)), clipped: s.clipped, small: s.small.length, smallList: s.small.slice(0, 30), overflow: s.overflow, cover: s.cover, scrollers: s.scrollers }));
  const result = { base: CFG.base, dist: CFG.dist, vp: CFG.vp, size: [CFG.w, CFG.h], mobile: CFG.mobile, emulated: 'Playwright Chromium emulation, not a real device', seconds: sec(), errs, issues, screens };
  let written = false;
  try {
    const out = await ctx.newPage();
    await ctx.route(`${CFG.base}m015-results.html`, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>m015</title>' }));
    await out.goto(`${CFG.base}m015-results.html`);
    const [dl] = await Promise.all([out.waitForEvent('download'), out.evaluate((r) => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r], { type: 'application/json' })); a.download = 'r.json'; document.body.appendChild(a); a.click();
    }, JSON.stringify(result, null, 1))]);
    await dl.saveAs(`${CFG.out}/m015-layout-${CFG.prefix}-${CFG.vp}.json`);
    written = true;
  } catch (e) { errs.push(`results not written: ${e}`); }
  await ctx.close();
  return { vp: CFG.vp, written, seconds: result.seconds, errs: errs.slice(0, 4), issues: issues.map((i) => ({ n: i.name, ov: i.overlaps, cl: i.clipped, sm: i.small, of: i.overflow.length, cv: i.cover })) };
  };
  const res = await Promise.all(ALL.vps.map((v) => one({ ...ALL, vp: v, ...VP[v] }).catch((e) => ({ vp: v, error: String(e).slice(0, 300) }))));
  return JSON.stringify(res);
}
