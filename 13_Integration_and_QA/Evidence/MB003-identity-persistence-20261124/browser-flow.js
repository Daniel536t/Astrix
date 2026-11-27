// Playwright flow used for MB003 (run with browser_run_code). Serves Game/dist at https://astrix.local/.
// Define TEST_WALLET_1/2 (JSON arrays) before running. Uses a Chrome virtual authenticator with PRF.
async (page) => {
  const DIR = '/projects/sandbox/.kiro/artifacts/screenshots/probe/dist';
  const SHOTS = '/projects/sandbox/.kiro/artifacts/screenshots/';
  const W1 = JSON.parse(TEST_WALLET_1); // 64-byte devnet test secret key, 0 SOL; not committed
  const W2 = JSON.parse(TEST_WALLET_2);
  const browser = page.context().browser();
  const out = { steps: [] };
  const step = (name, data) => out.steps.push({ name, ...data });
  const mk = async (wallet) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route(/^https:\/\/astrix\.local\//, async (route) => {
      let p = route.request().url().replace(/^https:\/\/astrix\.local/, '').split('?')[0].split('#')[0];
      if (p === '/' || p === '') p = '/index.html';
      await route.fulfill({ path: DIR + p });
    });
    if (wallet) await ctx.addInitScript((sec) => {
      const secret = Uint8Array.from(sec), pub = secret.slice(32);
      window.phantom = { solana: { isPhantom: true, publicKey: null,
        async connect() { this.publicKey = { toBytes: () => pub }; return { publicKey: this.publicKey }; },
        async signTransaction(tx) { const PK = tx.feePayer.constructor; tx.partialSign({ publicKey: new PK(pub), secretKey: secret }); window.__walletSigned = (window.__walletSigned || 0) + 1; return tx; } } };
    }, wallet);
    const pg = await ctx.newPage();
    const logs = [];
    pg.on('pageerror', (e) => logs.push('pageerror ' + String(e).slice(0, 200)));
    const cdp = await ctx.newCDPSession(pg);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
    return { ctx, pg, cdp, authenticatorId, logs };
  };
  const rec = (X) => X.pg.evaluate(() => JSON.parse(localStorage.getItem('astrix:guest:v1') ?? 'null'));
  const result = async (X) => {
    await X.pg.waitForFunction(() => /^(done|failed|protected|your|session)/.test(document.querySelector('#chain-panel .result')?.textContent ?? ''), null, { timeout: 90000 });
    const t = await X.pg.locator('#chain-panel .result').innerText();
    return t;
  };
  const act = async (X, a) => {
    await X.pg.waitForSelector(`#chain-panel button[data-act="${a}"]:not([disabled])`, { timeout: 60000 });
    await X.pg.evaluate(() => { const r = document.querySelector('#chain-panel .result'); if (r) r.textContent = ''; });
    await X.pg.click(`#chain-panel button[data-act="${a}"]`);
    return result(X);
  };
  const enterAndWait = async (X, a) => {
    await X.pg.waitForSelector('#enter-screen', { timeout: 90000 });
    const t0 = Date.now();
    const before = JSON.stringify(await rec(X));
    await X.pg.click(`#enter-screen button[data-act="${a}"]`);
    await X.pg.waitForFunction((b) => (localStorage.getItem('astrix:guest:v1') ?? 'null') !== b, before === 'null' ? 'null' : before, { timeout: 120000 });
    const ms = Date.now() - t0;
    await X.pg.waitForTimeout(2500);
    await X.pg.waitForLoadState('load');
    await X.pg.waitForSelector('#chain-panel .protection', { timeout: 60000 });
    await X.pg.waitForTimeout(3000);
    return ms;
  };
  const pick = (r) => r && { kind: r.kind, slot: r.slot, seed: r.seed, owner: r.owner, wallet: r.wallet, credentialId: r.credentialId ? 'present' : undefined };

  const ctxs = []; let cur = null;
  try {
  // ---- A: Quick Play -> passkey -> clear browser data -> recover -> move to wallet ----
  const A = await mk(W1); ctxs.push(A); cur = A;
  await A.pg.goto('https://astrix.local/');
  let ms = await enterAndWait(A, 'create');
  const g = await rec(A);
  step('A quick play', { ms, rec: pick(g), badge: await A.pg.locator('#chain-panel .protection').innerText() });
  step('A guest action', { result: await act(A, 'wood') });
  step('A protect with passkey', { result: await act(A, 'protect') });
  const p = await rec(A);
  step('A after protect', { rec: pick(p), badge: await A.pg.locator('#chain-panel .protection').innerText(), sameWorld: p.slot === g.slot && p.seed === g.seed, ownerChanged: p.owner !== g.owner });
  await A.pg.waitForTimeout(1500);
  step('A session-key action after protect', { result: await act(A, 'stone') });
  await A.pg.screenshot({ path: SHOTS + 'MB003-02-protected-passkey.png' });
  // Browser data lost: the passkey stays in the authenticator, site storage is wiped.
  await A.pg.evaluate(() => localStorage.clear());
  await A.pg.reload();
  await A.pg.waitForSelector('#enter-screen', { timeout: 90000 });
  await A.pg.waitForTimeout(2000);
  await A.pg.screenshot({ path: SHOTS + 'MB003-03-storage-cleared.png' });
  ms = await enterAndWait(A, 'recover-passkey');
  const r = await rec(A);
  step('A recovered with passkey after storage wipe', { ms, rec: pick(r), sameWorld: r.slot === g.slot && r.seed === g.seed, sameOwner: r.owner === p.owner });
  step('A action after recovery', { result: await act(A, 'wood') });
  step('A move to wallet', { result: await act(A, 'link:0') });
  const w = await rec(A);
  step('A after wallet link', { rec: pick(w), badge: await A.pg.locator('#chain-panel .protection').innerText(), sameWorld: w.slot === g.slot && w.seed === g.seed, walletSignatures: await A.pg.evaluate(() => window.__walletSigned) });
  await A.pg.waitForTimeout(1500);
  step('A session action under wallet ownership', { result: await act(A, 'stone') });
  await A.pg.screenshot({ path: SHOTS + 'MB003-04-wallet-owner.png' });
  const panelA = await A.pg.locator('#chain-panel').innerText();
  step('A panel', { panel: panelA, errors: A.logs });

  // ---- B: a different browser, same wallet -> recover the same world ----
  const B = await mk(W1); ctxs.push(B); cur = B;
  await B.pg.goto('https://astrix.local/');
  ms = await enterAndWait(B, 'recover-wallet:0');
  const b = await rec(B);
  step('B recovered with wallet in a fresh browser', { ms, rec: pick(b), sameWorld: b.slot === g.slot && b.seed === g.seed, hud: (await B.pg.locator('#hud').innerText()).split('\n')[0] });
  step('B action', { result: await act(B, 'wood') });
  await B.pg.screenshot({ path: SHOTS + 'MB003-05-fresh-browser-wallet-recovery.png' });
  // A's session key was replaced? No: sessions are one per world, so B's session supersedes A's.
  step('A old session after B took over', { result: await act(A, 'wood') });

  // ---- C: Wallet Play from scratch with a second wallet ----
  const C = await mk(W2); ctxs.push(C); cur = C;
  await C.pg.goto('https://astrix.local/');
  ms = await enterAndWait(C, 'wallet:0');
  const c = await rec(C);
  step('C wallet play new world', { ms, rec: pick(c), differentWorld: c.slot !== g.slot && c.seed !== g.seed, walletSignatures: await C.pg.evaluate(() => window.__walletSigned), badge: await C.pg.locator('#chain-panel .protection').innerText() });
  step('C action', { result: await act(C, 'wood') });
  await C.pg.screenshot({ path: SHOTS + 'MB003-06-wallet-play.png' });
  step('errors', { A: A.logs, B: B.logs, C: C.logs });
  } catch (e) {
    out.error = String(e).slice(0, 300);
    if (cur) {
      out.enterStatus = await cur.pg.locator('#enter-screen .enter-status').innerText().catch(() => null);
      out.panelResult = await cur.pg.locator('#chain-panel .result').innerText().catch(() => null);
      out.logs = cur.logs;
      await cur.pg.screenshot({ path: SHOTS + 'MB003-error.png' }).catch(() => {});
    }
  }
  for (const X of ctxs) await X.ctx.close();
  return out;
}
