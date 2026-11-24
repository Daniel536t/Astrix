// Presentation of the on-chain settlement inside the 3D world (read-only).
//
// Shows the MagicBlock settlement as a block-built outpost east of the founder
// valley: a granary whose stacks follow the on-chain stockpile, a sawmill that
// appears once `sawmill` is true on chain, crop rows per planted on-chain plot,
// and one settler per on-chain population. Plus a panel with live and committed
// state and explorer links. Loaded lazily; any failure leaves the game intact.
import * as THREE from 'three';
import { SettlementWatcher, ChainView, CHAIN, RESOURCE_NAMES } from './settlement';
import { buildCottage, buildCrate, buildWoodpile, buildFence } from '../render/village-kit';
import { buildFigure, VILLAGER_STYLE } from '../render/characters';

export interface ChainViewOptions {
  scene: THREE.Scene;
  groundY: (x: number, z: number) => number;
  origin: { x: number; z: number };
}

export function startChainView(o: ChainViewOptions): { metrics: () => Record<string, unknown> } {
  const watcher = new SettlementWatcher();
  const root = new THREE.Group();
  root.name = 'magicblock_settlement';
  o.scene.add(root);
  const panel = document.createElement('div');
  panel.id = 'chain-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'MagicBlock settlement');
  document.body.appendChild(panel);
  let lastKey = '';
  let tickSamples: Array<{ t: number; tick: number }> = [];

  const place = (obj: THREE.Object3D, dx: number, dz: number, ry = 0) => {
    const x = o.origin.x + dx, z = o.origin.z + dz;
    obj.position.set(x, o.groundY(Math.floor(x), Math.floor(z)), z);
    obj.rotation.y = ry;
    root.add(obj);
  };

  const rebuild = (v: ChainView) => {
    const s = v.live ?? v.committed;
    if (!s) return;
    const key = [s.sawmill, s.population, s.plots.map((p) => (p === null ? 0 : 1)).join(''),
      Math.min(12, Math.ceil(s.stock.food / 40)), Math.min(8, Math.ceil(s.stock.planks / 3)), Math.min(6, Math.ceil(s.stock.ore / 6))].join('|');
    if (key === lastKey) return;
    lastKey = key;
    root.clear();
    place(buildCottage({ width: 6, depth: 5, seed: 11 }), 0, 0, Math.PI);
    if (s.sawmill) place(buildCottage({ width: 7, depth: 5, roof: 'shingle', seed: 12, chimney: false }), 10, 0, Math.PI);
    // Stockpile: crates for food, woodpiles for planks, small stacks for ore.
    for (let i = 0; i < Math.min(12, Math.ceil(s.stock.food / 40)); i++) place(buildCrate(), -6 + (i % 4) * 1.1, 6 + Math.floor(i / 4) * 1.1);
    for (let i = 0; i < Math.min(8, Math.ceil(s.stock.planks / 3)); i++) place(buildWoodpile(i + 1), 8 + (i % 2) * 2.2, 6 + Math.floor(i / 2) * 1.2, Math.PI / 2);
    // Crop rows: one fenced row per planted on-chain plot.
    s.plots.forEach((p, i) => {
      if (p === null) return;
      const row = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 0.9), new THREE.MeshLambertMaterial({ color: 0x7fa64a }));
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
    panel.innerHTML = `<strong>MagicBlock settlement</strong> <span class="${v.error ? 'warn' : 'ok'}">${v.error ? 'offline — local game unaffected' : v.delegated ? 'live on Ephemeral Rollup' : 'on Solana'}</span>`
      + (s ? `<div>tick <b>${s.tick}</b> · crank ${rate > 0 ? rate.toFixed(2) + ' ticks/s' : 'measuring…'} · settlers ${s.population}${s.sawmill ? ' · sawmill' : ''}</div>`
        + `<div class="stock">${RESOURCE_NAMES.map((n) => `${n} ${s.stock[n]}`).join(' · ')}</div>`
        + `<div>prospects ${s.prospects} · last VRF find: <b>${s.lastFind}</b> (roll ${s.lastRoll}) · rare ${s.rareFinds}</div>` : '<div>loading…</div>')
      + (c ? `<div class="dim">committed to Solana at tick ${c.tick}</div>` : '')
      + `<div class="dim"><a href="${er}" target="_blank" rel="noopener">ER account</a> · <a href="${base}" target="_blank" rel="noopener">Solana account</a> · M: hide</div>`;
    rebuild(v);
  };

  watcher.onChange = render;
  watcher.start();
  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') panel.classList.toggle('hidden');
  });
  return { metrics: () => ({ ...watcher.view, address: watcher.addressBase58 }) };
}
