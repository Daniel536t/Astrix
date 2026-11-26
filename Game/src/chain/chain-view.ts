// Presentation of the on-chain settlement inside the 3D world (read-only).
//
// Shows the MagicBlock settlement as a block-built outpost east of the founder
// valley: a granary whose stacks follow the on-chain stockpile, a sawmill that
// appears once `sawmill` is true on chain, crop rows per planted on-chain plot,
// and one settler per on-chain population. Plus a panel with live and committed
// state and explorer links. Loaded lazily; any failure leaves the game intact.
import * as THREE from 'three';
import { SettlementWatcher, ChainView, CHAIN, RESOURCE_NAMES } from './settlement';
import { GuestWorld } from './guest';
import { detectWallets, passkeySupported, PROTECTION_LABEL, DetectedWallet } from './identity';
import { showEnterScreen } from './enter';
import { buildCottage, buildCrate, buildWoodpile, buildFence } from '../render/village-kit';
import { buildFigure, VILLAGER_STYLE } from '../render/characters';
import { mergeStaticGroup } from '../render/static-merge';

/** One shared material for the on-chain crop rows (they are merged with the other props). */
const ROW_MATERIAL = new THREE.MeshLambertMaterial({ color: 0x7fa64a });

export interface ChainViewOptions {
  scene: THREE.Scene;
  groundY: (x: number, z: number) => number;
  origin: { x: number; z: number };
  /** W1: the local world list shown on the entry screen. */
  worlds?: import('../app/worlds').WorldListState;
}

export function startChainView(o: ChainViewOptions): { metrics: () => Record<string, unknown> } {
  const guest = new GuestWorld();
  const watcher = new SettlementWatcher(guest.address ?? undefined);
  let busy = '';
  let lastResult = '';
  const erTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(CHAIN.erRpc)}`;
  const root = new THREE.Group();
  root.name = 'magicblock_settlement';
  o.scene.add(root);
  const panel = document.createElement('div');
  panel.id = 'chain-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'MagicBlock settlement');
  document.body.appendChild(panel);
  const info = document.createElement('div');
  const controls = document.createElement('div');
  const links = document.createElement('div');
  // M015: on phones and tablets the panel starts folded to one button, so it never covers the Farm button,
  // the vitals or the banner and zoom buttons; tap it to unfold (the choice is kept in this browser).
  const fold = document.createElement('button');
  fold.type = 'button';
  fold.className = 'chain-fold';
  const body = document.createElement('div');
  body.className = 'chain-body';
  body.append(info, controls, links);
  panel.append(fold, body);
  const FOLD_KEY = 'astrix:chainpanel:v1';
  let folded = matchMedia('(pointer: coarse)').matches;
  try { const v = localStorage.getItem(FOLD_KEY); if (v === 'open') folded = false; if (v === 'folded') folded = true; } catch { /* keep the default */ }
  const setFold = (f: boolean) => {
    folded = f;
    panel.classList.toggle('folded', f);
    // Plain text: the triangle glyphs are missing from some Android and Linux fonts.
    fold.textContent = f ? 'MagicBlock' : 'Hide MagicBlock';
    fold.setAttribute('aria-expanded', String(!f));
    fold.setAttribute('aria-label', f ? 'Show the MagicBlock settlement panel' : 'Fold the MagicBlock settlement panel');
  };
  setFold(folded);
  fold.addEventListener('click', () => { setFold(!folded); try { localStorage.setItem(FOLD_KEY, folded ? 'folded' : 'open'); } catch { /* ignore */ } });
  let controlsKey = '';
  let mergedMeshes = { input: 0, output: 0 };
  let lastKey = '';
  let tickSamples: Array<{ t: number; tick: number }> = [];

  // Built into a staging group, then baked into one mesh per material (M015: about 60 draw calls
  // with shadows when every crate, woodpile and settler was its own mesh). None of them move.
  let staging = new THREE.Group();
  const place = (obj: THREE.Object3D, dx: number, dz: number, ry = 0) => {
    const x = o.origin.x + dx, z = o.origin.z + dz;
    obj.position.set(x, o.groundY(Math.floor(x), Math.floor(z)), z);
    obj.rotation.y = ry;
    staging.add(obj);
  };

  const rebuild = (v: ChainView) => {
    const s = v.live ?? v.committed;
    if (!s) return;
    const key = [s.sawmill, s.population, s.plots.map((p) => (p === null ? 0 : 1)).join(''),
      Math.min(12, Math.ceil(s.stock.food / 40)), Math.min(8, Math.ceil(s.stock.planks / 3)), Math.min(6, Math.ceil(s.stock.ore / 6))].join('|');
    if (key === lastKey) return;
    lastKey = key;
    staging = new THREE.Group();
    place(buildCottage({ width: 6, depth: 5, seed: 11 }), 0, 0, Math.PI);
    if (s.sawmill) place(buildCottage({ width: 7, depth: 5, roof: 'shingle', seed: 12, chimney: false }), 10, 0, Math.PI);
    // Stockpile: crates for food, woodpiles for planks, small stacks for ore.
    for (let i = 0; i < Math.min(12, Math.ceil(s.stock.food / 40)); i++) place(buildCrate(), -6 + (i % 4) * 1.1, 6 + Math.floor(i / 4) * 1.1);
    for (let i = 0; i < Math.min(8, Math.ceil(s.stock.planks / 3)); i++) place(buildWoodpile(i + 1), 8 + (i % 2) * 2.2, 6 + Math.floor(i / 2) * 1.2, Math.PI / 2);
    // Crop rows: one fenced row per planted on-chain plot.
    s.plots.forEach((p, i) => {
      if (p === null) return;
      const row = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 0.9), ROW_MATERIAL);
      row.castShadow = true;
      place(row, -14, -6 + i * 1.4);
      row.position.y += 0.25;
    });
    if (s.plots.some((p) => p !== null)) place(buildFence(6), -14, -7.4);
    // Settlers: one figure per on-chain population, standing in the yard.
    for (let i = 0; i < s.population; i++) {
      const f = buildFigure(VILLAGER_STYLE);
      place(f.root, -3 + (i % 5) * 1.5, 10 + Math.floor(i / 5) * 1.6, Math.PI + (i % 3) * 0.4);
    }
    for (const c of root.children) c.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
    root.clear();
    const merged = mergeStaticGroup(staging, 'magicblock_props');
    root.add(merged.group);
    mergedMeshes = { input: merged.input, output: merged.output };
  };

  const render = (v: ChainView) => {
    const s = v.live;
    const c = v.committed;
    if (s) {
      tickSamples.push({ t: Date.now(), tick: s.tick });
      tickSamples = tickSamples.filter((x) => Date.now() - x.t < 30_000);
    }
    const first = tickSamples[0], last = tickSamples[tickSamples.length - 1];
    const rate = first && last && last.t > first.t ? ((last.tick - first.tick) / ((last.t - first.t) / 1000)) : 0;
    const er = `https://explorer.solana.com/address/${watcher.addressBase58}?cluster=custom&customUrl=${encodeURIComponent(CHAIN.erRpc)}`;
    const base = `https://explorer.solana.com/address/${watcher.addressBase58}?cluster=devnet`;
    const mine = !!guest.record;
    const title = mine ? `Your world <span class="dim">· slot ${guest.record!.slot} · seed ${guest.record!.seed}</span>` : 'Demo settlement <span class="dim">(owner-run)</span>';
    const wallets = detectWallets();
    const short = (k: string | null) => (k ? `${k.slice(0, 4)}…${k.slice(-4)}` : '');
    let html = `<strong>MagicBlock · ${title}</strong><br><span class="${v.error ? 'warn' : 'ok'}">${v.error ? 'offline — local game unaffected' : 'live on Ephemeral Rollup'}</span>`
      + (s ? `<div>tick <b>${s.tick}</b> · crank ${rate > 0 ? rate.toFixed(2) + ' ticks/s' : 'measuring…'} · settlers ${s.population}${s.sawmill ? ' · sawmill' : ''}</div>`
        + `<div class="stock">${RESOURCE_NAMES.map((n) => `${n} ${s.stock[n]}`).join(' · ')}</div>`
        + `<div>prospects ${s.prospects} · last VRF find: <b>${s.lastFind}</b>${s.prospectPending ? ' (waiting for randomness…)' : ` (roll ${s.lastRoll})`}</div>` : '<div>loading…</div>')
      + (c && !mine ? `<div class="dim">committed to Solana at tick ${c.tick}</div>` : '');
    let ctl = '';
    const dis = busy ? 'disabled' : '';
    const btn = (act: string, label: string, cls = '') => `<button data-act="${act}" class="${cls}" ${dis}>${label}</button>`;
    const walletButtons = (prefix: string, label: (n: string) => string) => wallets.length
      ? wallets.map((w, i) => btn(`${prefix}:${i}`, label(w.name))).join('')
      : `<button disabled title="Install Phantom or Backpack">${label('wallet')} (none found)</button>`;
    if (mine) {
      const kind = guest.kind;
      ctl += `<div class="protection p-${kind}">${PROTECTION_LABEL[kind]}</div>`;
      if (guest.sessionExpired) ctl += `<div class="chain-actions">${btn('renew', 'Renew this browser’s session', 'primary')}</div>`;
      ctl += `<div class="chain-actions">`
        + ['plant:Plant crop', 'wood:Gather wood', 'stone:Quarry stone', 'sawmill:Build sawmill', 'prospect:Prospect (VRF)']
          .map((x) => { const [k, l] = x.split(':'); return btn(k, l); }).join('')
        + `</div><div class="dim result">${busy || lastResult}</div>`;
      if (kind === 'guest') {
        ctl += `<div class="chain-actions upgrade">${passkeySupported() ? btn('protect', 'Protect with passkey') : ''}${walletButtons('link', (n) => `Move to ${n}`)}</div>`
          + `<div class="dim">This world's key exists only in this browser. Protect it with a passkey or a wallet to recover it on any device (<a href="#" data-key="export">export key</a>).</div>`;
      } else if (kind === 'passkey') {
        ctl += `<div class="chain-actions upgrade">${walletButtons('link', (n) => `Move to ${n}`)}</div>`
          + `<div class="dim">Owned by your passkey (${short(guest.owner)}). Use “Recover with passkey” on any device. This browser plays with a session key.</div>`;
      } else {
        ctl += `<div class="dim">Owned by ${guest.record!.wallet ?? 'your wallet'} ${short(guest.owner)}. This browser plays with a session key until ${new Date((guest.record!.sessionExpires ?? 0) * 1000).toLocaleDateString()}.</div>`;
      }
    } else {
      ctl += `<div class="chain-actions">${btn('create', 'Quick Play', 'primary')}${walletButtons('wallet', (n) => `Wallet Play (${n})`)}</div>`
        + `<div class="chain-actions">${passkeySupported() ? btn('recover-passkey', 'Recover with passkey') : ''}${wallets.length ? wallets.map((w, i) => btn(`recover-wallet:${i}`, `Recover with ${w.name}`)).join('') : ''}</div>`
        + `<div class="dim result">${busy || 'Quick Play needs no wallet and no SOL. Wallet Play makes your wallet the owner.'} <a href="#" data-key="import">Import a saved key</a></div>`;
    }
    info.innerHTML = html;
    if (ctl !== controlsKey) { controls.innerHTML = ctl; controlsKey = ctl; }
    const l = `<div class="dim"><a href="${er}" target="_blank" rel="noopener">ER account</a> · <a href="${base}" target="_blank" rel="noopener">Solana account</a> · M: hide</div>`;
    if (links.innerHTML !== l) links.innerHTML = l;
    rebuild(v);
  };

  watcher.onChange = render;
  const reloadIntoWorld = () => {
    const q = new URLSearchParams(location.search); q.delete('seed');
    setTimeout(() => { location.search = q.toString(); }, 900);
  };
  const status = (m: string) => { busy = m; render(watcher.view); enter?.status(m); };
  const run = async (act: string): Promise<void> => {
    if (busy) return;
    const [name, arg] = act.split(':');
    const wallet: DetectedWallet | undefined = arg !== undefined ? detectWallets()[Number(arg)] : undefined;
    try {
      if (name === 'create' || name === 'wallet' || name === 'recover-passkey' || name === 'recover-wallet') {
        status(name === 'create' ? 'creating your world…' : 'connecting…');
        const rec = name === 'create' ? await guest.create(status)
          : name === 'wallet' ? await guest.createWithWallet(wallet!, status)
            : name === 'recover-passkey' ? await guest.recoverWithPasskey(status)
              : await guest.recoverWithWallet(wallet!, status);
        status(`world ${rec.slot} ready (seed ${rec.seed}); loading your terrain…`);
        reloadIntoWorld();
        return;
      }
      if (name === 'protect') { status('protecting…'); await guest.protectWithPasskey(status); lastResult = 'protected: your passkey now owns this world'; }
      else if (name === 'link') { status('linking…'); await guest.linkWallet(wallet!, status); lastResult = `your ${wallet!.name} wallet now owns this world`; }
      else if (name === 'renew') { status('renewing…'); await guest.renewSession(detectWallets(), status); lastResult = 'session renewed'; }
      else {
        status(`${act}…`);
        const s = watcher.view.live;
        const plot = s ? Math.max(0, s.plots.findIndex((p) => p === null)) : 0;
        const r = await guest.act(act as 'plant', plot);
        lastResult = r.ok ? `done: ${act} <a href="${erTx(r.sig)}" target="_blank" rel="noopener">tx</a>` : `failed: ${act}: ${r.reason}`;
      }
    } catch (e) { lastResult = `failed: ${(e as Error).message}`; enter?.status(lastResult); }
    busy = ''; render(watcher.view);
  };
  const enter = guest.record ? null : showEnterScreen({
    wallets: detectWallets, passkey: passkeySupported(),
    choose: (act) => run(act),
    worlds: o.worlds,
  });
  panel.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const act = t.closest('button')?.getAttribute('data-act');
    if (act) { void run(act); return; }
    const key = t.getAttribute('data-key');
    if (key === 'export') { e.preventDefault(); guest.exportKey(); }
    if (key === 'import') {
      e.preventDefault();
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'application/json';
      input.onchange = async () => { const f = input.files?.[0]; if (f && guest.importKey(await f.text())) location.reload(); };
      input.click();
    }
  });
  watcher.start();
  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') panel.classList.toggle('hidden');
  });
  return { metrics: () => ({ ...watcher.view, props: mergedMeshes, address: watcher.addressBase58, guest: guest.record ? { slot: guest.record.slot, seed: guest.record.seed, key: guest.publicKey, kind: guest.kind, owner: guest.owner } : null }) };
}
