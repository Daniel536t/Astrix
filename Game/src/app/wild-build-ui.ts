// W4: the wilderness Build menu, the placement ghost (the M014 build mode with
// a wilderness adapter) and the construction / building panels. Presentation
// and input only: every change is a journaled command the simulation
// (sim/wild-build.ts) accepts or refuses, and every verdict shown is the
// simulation's own (`checkWildSite`, the function `place_site` runs).
import * as THREE from 'three';
import type { World } from '../sim/world';
import { BUILD_CATALOGUE, BuildingDef, CATEGORY_LABEL, MATERIAL_LABEL, buildingDef } from '../sim/catalogue';
import {
  MAX_FUEL, RESERVE_REACH, SITE_REACH, WildSite, affordability, buildingsNear, checkWildSite, deliverable, freeIn, freeInBag, homeShelter, lockReasons,
  reservationsInSource, reservedTotalsIn, siteNeeds, siteProgress, siteSizeOf, stageNeeds, stockWeight,
} from '../sim/wild-build';
import { CARRY_CAPACITY, ITEM_LABEL, ITEM_WEIGHT, WILD_RECIPES, WildItem, carriedWeight } from '../sim/gathering';
import { BuildMode } from './build-mode';
import { DOOR_FACING } from '../sim/buildings';
import { WildBuildingsView } from '../render/wild-buildings';

type Receipt = { ok: boolean; code?: string; reasons?: string[]; outcome?: Record<string, unknown> & { type: string } };

export interface WildBuildHost {
  world(): World;
  /** Send a journaled command; null when refused (the host shows the reason unless quiet). */
  send(c: Record<string, unknown>, target: string, quiet?: boolean): Receipt | null;
  toast(message: string, kind?: 'good' | 'warn' | 'bad'): void;
  /** The player's position (dm), or null when not walking. */
  at(): { x: number; z: number } | null;
  player(): { x: number; z: number; heading: number } | null;
  scene: THREE.Scene;
  camera?: THREE.Camera;
  canvas?: HTMLElement;
}

const label = (k: string) => MATERIAL_LABEL[k] ?? ITEM_LABEL[k as WildItem] ?? k.replace(/_/g, ' ');
const bagText = (b: Record<string, number>) => Object.entries(b).map(([k, n]) => `${n} ${label(k)}`).join(', ');

export class WildBuildUI {
  readonly view = new WildBuildingsView();
  readonly mode: BuildMode;
  readonly menu: HTMLElement;
  readonly site: HTMLElement;
  readonly button: HTMLButtonElement;
  private menuKey = '';
  private siteKey = '';
  private cancelArmed: string | null = null;
  /** The site or building whose panel shows (nearest within reach). */
  near: WildSite | null = null;
  readonly stats = { placed: 0, refusedPlacements: 0, lastRefusal: '' };

  constructor(private readonly h: WildBuildHost) {
    h.scene.add(this.view.group);
    this.button = document.createElement('button');
    this.button.id = 'build-menu-button';
    this.button.type = 'button';
    this.button.textContent = 'Build';
    this.button.setAttribute('aria-label', 'Build: the catalogue of what you can construct (G)');
    this.button.addEventListener('click', () => this.toggleMenu());
    document.body.appendChild(this.button);
    this.menu = document.createElement('section');
    this.menu.id = 'wild-build-panel';
    this.menu.className = 'wild-sheet';
    this.menu.hidden = true;
    this.menu.setAttribute('aria-label', 'Build catalogue');
    this.menu.addEventListener('click', (e) => this.onMenu(e));
    document.body.appendChild(this.menu);
    this.site = document.createElement('section');
    this.site.id = 'wild-site-panel';
    this.site.className = 'wild-sheet';
    this.site.hidden = true;
    this.site.setAttribute('aria-label', 'Building site');
    this.site.addEventListener('click', (e) => this.onSite(e));
    document.body.appendChild(this.site);
    this.mode = new BuildMode({
      world: () => h.world(), scene: h.scene, camera: () => h.camera ?? null, canvas: h.canvas ?? null,
      send: (c, t) => (h.send(c, t ?? '') ?? { ok: false }) as never, toast: (m, k) => h.toast(m, k), player: () => h.player(),
      onChange: () => { this.menuKey = ''; },
      adapter: {
        available: () => !!h.world().wild?.build,
        unavailable: 'This world predates building (wilderness content v4).',
        size: (kind, rot) => siteSizeOf(kind, rot),
        check: (kind, x, z, rot) => checkWildSite(h.world(), kind, x, z, rot, h.at()),
        // Reach depends on where the player stands; the reservation verdict on what is carried and lies around.
        key: () => { const a = h.at(), w = h.world().wild; return `${a ? `${Math.round(a.x / 5)},${Math.round(a.z / 5)}` : '-'}:${JSON.stringify(w?.items ?? {})}:${w?.piles.size ?? 0}`; },
        confirm: (kind, x, z, rot) => this.place(kind, x, z, rot),
        bar: (kind, rot, pinned, c) => this.bar(kind, rot, pinned, c as ReturnType<typeof checkWildSite> | null),
      },
    });
  }

  get world(): World { return this.h.world(); }

  toggleMenu(force?: boolean): void {
    this.menu.hidden = force === undefined ? !this.menu.hidden : !force;
    this.button.classList.toggle('on', !this.menu.hidden);
    this.menuKey = '';
    if (!this.menu.hidden) this.mode.close();
    this.renderMenu();
  }

  /** Keys while build mode is open (Escape, X, Enter); G toggles the menu. */
  key(e: KeyboardEvent): boolean {
    if (this.mode.key(e)) return true;
    if ((e.key === 'g' || e.key === 'G') && !e.repeat) {
      if (this.mode.active) this.mode.close(); else this.toggleMenu();
      return true;
    }
    return false;
  }

  private place(kind: string, x: number, z: number, rot: number): boolean {
    const at = this.h.at();
    if (!at) { this.h.toast('walk (Tab) to where you want to build', 'warn'); return false; }
    const r = this.h.send({ type: 'place_site', kind, x, z, rot, at }, `${kind}:${x},${z}`, true);
    const d = buildingDef(kind)!;
    if (!r) {
      const c = checkWildSite(this.world, kind, x, z, rot, at);
      this.stats.refusedPlacements++; this.stats.lastRefusal = c.reasons.join('; ');
      this.h.toast(`Cannot build here: ${c.reasons.join('; ')}`, 'bad');
      return false;
    }
    this.stats.placed++;
    const res = (r.outcome as { reserved?: Record<string, Record<string, number>> } | undefined)?.reserved ?? {};
    const where = Object.entries(res).map(([src, b]) => `${bagText(b)} ${src === 'bag' ? 'in your bag' : src.startsWith('d:') ? 'in a pile' : 'in storage'}`).join('; ');
    this.h.toast(`${d.label} marked out. Reserved for it: ${where}. Deliver them and work on it (E / Build).`, 'good');
    return true;
  }

  private bar(kind: string, rot: number, pinned: boolean, c: ReturnType<typeof checkWildSite> | null): string {
    const d = buildingDef(kind)!;
    const s = siteSizeOf(kind, rot);
    // The verdict's own reservation plan: what placing here reserves, or what is missing.
    const f = c?.funding ?? null;
    const got = (k: string) => (d.materials[k] ?? 0) - (f?.short[k] ?? 0);
    const need = Object.entries(d.materials).map(([k, n]) => `<span class="${!f || got(k) >= n ? 'dim' : 'warn'}">${label(k)} ${f ? got(k) : '?'}/${n}</span>`).join(' · ');
    const verdict = !c ? 'Point at the ground (or tap it) to choose where it goes.'
      : c.ok ? `<b>Good spot.</b> Door faces ${DOOR_FACING[c.rot]}${c.routeToPlayer !== null ? ` · ${c.routeToPlayer} m walk to you` : ''}${c.clearText ? ` · clears ${c.clearText}` : ''}`
        : c.reasons.map((r) => `• ${r}`).join('<br>');
    const kinds = BUILD_CATALOGUE.filter((x) => lockReasons(this.world, x).length === 0)
      .map((x) => `<button type="button" data-build-kind="${x.id}" class="${x.id === kind ? 'on' : ''}" aria-pressed="${x.id === kind}">${x.label}</button>`).join('');
    return `<div class="build-row kinds">${kinds}</div>
      <div class="build-info" data-build-funding>${d.label} · ${s.w} × ${s.d} m · ${need} (free to reserve / it needs: bag, piles and storage within ${RESERVE_REACH} m) · ${d.work} swings${d.tool === 'hands' ? ' by hand' : ` with a ${label(d.tool)}`}</div>
      <div class="build-verdict ${c?.ok ? 'ok' : 'bad'}" data-build-verdict aria-live="polite">${verdict}</div>
      <div class="build-row actions"><button type="button" data-build-turn aria-label="Turn the building a quarter">Turn 90°</button><button type="button" class="primary" data-build-place ${c?.ok ? '' : 'disabled'}>Place</button><button type="button" data-build-close>Close</button>
      <span class="dim build-help">${pinned ? 'Pinned: tap/click elsewhere or drag it to move' : 'Move over the ground; click or tap to pin'} · X / Shift+wheel: turn · Enter: place · Esc: close</span></div>`;
  }

  private onMenu(e: MouseEvent): void {
    const b = (e.target as HTMLElement).closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.close !== undefined) { this.toggleMenu(false); return; }
    if (b.dataset.choose) {
      const kind = b.dataset.choose;
      if (!this.h.at()) { this.h.toast('walk (Tab) to where you want to build first', 'warn'); return; }
      this.toggleMenu(false);
      this.mode.open(kind);
      this.h.toast(`Place the ${buildingDef(kind)!.label.toLowerCase()}: green is a good spot; red lists why not.`, 'good');
    }
  }

  private renderMenu(): void {
    if (this.menu.hidden) return;
    const w = this.world.wild;
    const key = JSON.stringify([w?.items, w?.tools.map((t) => t.kind), [...(w?.build?.sites.values() ?? [])].map((s) => `${s.kind}:${s.state}`)]);
    if (key === this.menuKey) return;
    this.menuKey = key;
    const rows: string[] = [];
    let cat = '';
    for (const d of BUILD_CATALOGUE) {
      if (d.category !== cat) { cat = d.category; rows.push(`<h3>${CATEGORY_LABEL[d.category]}</h3>`); }
      rows.push(this.entry(d));
    }
    const held = reservedTotalsIn(this.world);
    this.menu.innerHTML = `<header><h2>Build</h2><span class="dim">placing reserves all its materials; you carry them and do the work</span><button type="button" data-close aria-label="Close build menu">×</button></header>`
      + (Object.keys(held).length ? `<p class="dim" data-reserved>Reserved for your sites: ${bagText(held)}</p>` : '')
      + `<ul>${rows.join('')}</ul>`;
  }

  private entry(d: BuildingDef): string {
    const locked = lockReasons(this.world, d);
    const at = this.h.at();
    const a = affordability(this.world, d, at ? { x: at.x / 10, z: at.z / 10 } : undefined);
    const mats = Object.entries(d.materials).map(([k, n]) => `<span class="${(a.have[k] ?? 0) >= n ? 'ok' : 'miss'}">${label(k)} ${Math.min(a.have[k] ?? 0, n)}/${n}</span>`).join(' · ');
    return `<li class="recipe ${locked.length ? 'locked' : ''}" data-entry="${d.id}"><div><b>${d.label}</b> <span class="dim">${d.footprint.w}×${d.footprint.d} m · ${d.work} swings${d.tool === 'hands' ? ', by hand' : `, ${label(d.tool)}`}</span><br><small>${mats}</small>`
      + `<br><small class="dim">${d.function.summary}</small>${locked.length ? `<br><small class="miss" data-locked>Locked: ${locked.join('; ')}</small>` : ''}</div>`
      + `<button type="button" data-choose="${d.id}" ${locked.length ? 'disabled aria-disabled="true"' : ''}>${locked.length ? 'Locked' : 'Place'}</button></li>`;
  }

  /** The unfinished site or finished building the player stands by. */
  private nearest(): WildSite | null {
    const at = this.h.at();
    if (!at) return null;
    return buildingsNear(this.world, at.x / 10, at.z / 10, SITE_REACH - 0.3)[0]?.s ?? null;
  }

  private act(c: Record<string, unknown>, target: string, done?: (r: Receipt) => void): void {
    const at = this.h.at();
    if (!at) return;
    const r = this.h.send({ ...c, at }, target);
    if (r && done) done(r);
    this.siteKey = '';
  }

  /** Deliver every reserved material within reach (bag, and piles or storage at the site). */
  deliverAll(s: WildSite): number {
    let n = 0;
    for (const d of deliverable(this.world, s, this.h.at())) {
      this.act({ type: 'deliver_site', siteId: s.id, item: d.item, n: d.n, ...(d.from === 'bag' ? {} : { from: d.from }) }, `${s.id}:${d.from}:${d.item}`);
      n += d.n;
    }
    if (n) {
      const left = siteNeeds(s);
      this.h.toast(`delivered ${n} · ${Object.keys(left).length ? `still needs ${bagText(left)}` : 'all materials delivered: work on it (E / Build)'}`, 'good');
    }
    return n;
  }

  private onSite(e: MouseEvent): void {
    const b = (e.target as HTMLElement).closest('button');
    if (!b || b.disabled) return;
    const s = this.near;
    if (!s) return;
    const d = b.dataset;
    if (d.deliver) this.act({ type: 'deliver_site', siteId: s.id, item: d.deliver, n: Number(d.n), ...(d.from && d.from !== 'bag' ? { from: d.from } : {}) }, `${s.id}:${d.from}:${d.deliver}`, () => this.h.toast(`delivered ${d.n} ${label(d.deliver!)}`));
    else if (d.deliverAll !== undefined) this.deliverAll(s);
    else if (d.work !== undefined) this.onWork?.(s);
    else if (d.cancel !== undefined) {
      if (this.cancelArmed !== s.id) { this.cancelArmed = s.id; this.siteKey = ''; this.h.toast('press Confirm to cancel the site: its reservations are released and delivered materials are left on the ground there', 'warn'); }
      else { this.cancelArmed = null; this.act({ type: 'cancel_site', siteId: s.id }, s.id, () => this.h.toast('site cancelled: reservations released; its delivered materials lie on the ground at the site', 'warn')); }
    } else if (d.claim !== undefined) this.act({ type: 'claim_shelter', siteId: s.id }, s.id, () => this.h.toast('This lean-to is your home now: Home (R) returns here and you wake here after drowning.', 'good'));
    else if (d.fuel) this.act({ type: 'fuel_fire', siteId: s.id, item: d.fuel, n: 1 }, `${s.id}:${d.fuel}`, () => this.h.toast(`added a ${label(d.fuel!)} to the fire`));
    else if (d.cook) this.act({ type: 'cook', siteId: s.id, item: d.cook }, `${s.id}:${d.cook}`, () => this.h.toast('cooked a mushroom (24 food; raw 10)'));
    else if (d.store) this.act({ type: 'store_items', siteId: s.id, item: d.store, n: Number(d.n) }, `${s.id}:${d.store}`, () => this.h.toast(`stored ${d.n} ${label(d.store!)}`));
    else if (d.take) this.act({ type: 'take_items', siteId: s.id, item: d.take, n: Number(d.n), ...(d.for ? { forSite: d.for } : {}) }, `${s.id}:${d.take}:${d.for ?? ''}`, () => this.h.toast(`took ${d.n} ${label(d.take!)}${d.for ? ' (still reserved for its site)' : ''}`));
    else if (d.craft) this.onCraft?.(d.craft);
  }
  /** Set by the host: one swing of work (shared with E / Use and its pacing). */
  onWork: ((s: WildSite) => void) | null = null;
  onCraft: ((recipe: string) => void) | null = null;

  private renderSite(): void {
    const s = this.near;
    const hide = !s || this.mode.active || !this.menu.hidden;
    if (hide) { if (!this.site.hidden) { this.site.hidden = true; this.siteKey = ''; } return; }
    const w = this.world.wild!;
    const key = JSON.stringify([s.id, s.state, s.stage, s.work, s.delivered, s.reserved, s.fuel ? Math.ceil(s.fuel / 15) : 0, s.stock, w.items, w.build?.home, this.cancelArmed,
      [...(w.build?.sites.values() ?? [])].map((x) => x.reserved), this.h.at() ? deliverable(this.world, s, this.h.at()).length : 0]);
    this.site.hidden = false;
    if (key === this.siteKey) return;
    this.siteKey = key;
    const d = buildingDef(s.kind)!;
    let body = '';
    if (s.state !== 'done') {
      const p = siteProgress(s);
      const missing = stageNeeds(s);
      const can = deliverable(this.world, s, this.h.at());
      const where = (k: string) => Object.entries(s.reserved).filter(([, b]) => b[k]).map(([src, b]) => `${b[k]} ${src === 'bag' ? 'in your bag' : src.startsWith('d:') ? 'in a pile' : 'in storage'}`).join(', ');
      const rows = Object.entries(d.materials).map(([k, n]) => {
        const got = (s.delivered[k] ?? 0) + (s.consumed[k] ?? 0);
        const btns = can.filter((c) => c.item === k).map((c) => `<button type="button" data-deliver="${k}" data-n="${c.n}" data-from="${c.from}">Deliver ${c.n}${c.from === 'bag' ? '' : c.from.startsWith('d:') ? ' from pile' : ' from store'}</button>`).join('');
        return `<li><span>${label(k)} <b>${got}/${n}</b>${where(k) ? ` <span class="dim" data-reserved-${k}>(reserved: ${where(k)})</span>` : ''}</span>${btns}</li>`;
      }).join('');
      const tool = d.tool === 'hands' ? 'by hand' : `needs a ${label(d.tool)}${w.tools.some((t) => t.kind === d.tool && t.durability > 0) ? '' : ' <span class="miss">(you have none)</span>'}`;
      body = `<div class="dim">Stage ${Math.min(s.stage + 1, d.stages.length)}/${d.stages.length}: ${p.stage} · ${tool}</div>`
        + `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.done}"><i style="width:${Math.round(p.done / p.total * 100)}%"></i></div>`
        + `<div class="dim">${p.done}/${p.total} swings${Object.keys(missing).length ? ` · <span class="miss">this stage needs ${bagText(missing)}</span>` : ''}</div>`
        + `<h3>Materials (at the site or built in / needed)</h3><ul>${rows}</ul>`
        + `<div class="row"><button type="button" class="primary" data-work ${Object.keys(missing).length ? 'disabled' : ''}>Work (E)</button>`
        + `<button type="button" data-cancel>${this.cancelArmed === s.id ? 'Confirm cancel' : 'Cancel site'}</button></div>`;
    } else {
      const fn = d.function;
      if (fn.kind === 'shelter') {
        const mine = w.build?.home === s.id;
        body = `<div>${mine ? '<b class="ok">Your home.</b> Home (R) returns here; after drowning you wake here. Carried items stay where you died (recoverable); tools stay with you.' : 'A shelter you can claim as home and respawn point.'}</div>`
          + (mine ? '' : `<div class="row"><button type="button" class="primary" data-claim>Claim as home</button></div>`);
      } else if (fn.kind === 'fire') {
        const f = s.fuel ?? 0;
        const mm = Math.floor(f * 2 / 60), ss = (f * 2) % 60;
        body = `<div>${f > 0 ? `<b class="ok">Lit</b> · fuel ${mm}:${String(ss).padStart(2, '0')} (max ${MAX_FUEL * 2 / 60} min) · cooks mushrooms` : '<b class="miss">Out.</b> Add branches or logs to light it.'}</div>`
          + `<div class="row">${freeInBag(this.world, 'branch') ? '<button type="button" data-fuel="branch">Add branch (+1 min)</button>' : ''}${freeInBag(this.world, 'log') ? '<button type="button" data-fuel="log">Add log (+5 min)</button>' : ''}`
          + `${(w.items.mushroom ?? 0) ? `<button type="button" class="primary" data-cook="mushroom" ${f >= fn.cookFuel ? '' : 'disabled'}>Cook mushroom (${w.items.mushroom})</button>` : '<span class="dim">no raw mushrooms to cook</span>'}</div>`;
      } else if (fn.kind === 'station') {
        // Free items only: what is reserved for a site is not offered.
        const have = (k: string) => freeInBag(this.world, k);
        const rows = WILD_RECIPES.filter((r) => r.station === fn.station).map((r) => {
          const need = Object.entries(r.input).map(([k, n]) => `<span class="${have(k) >= (n ?? 0) ? 'ok' : 'miss'}">${label(k)} ${Math.min(have(k), n ?? 0)}/${n}</span>`).join(' · ');
          const toolOk = !r.tool || w.tools.some((t) => t.kind === r.tool && t.durability > 0);
          // Carried but reserved: the button stays live so the simulation's refusal (and its reason) is shown.
          const carried = toolOk && Object.entries(r.input).every(([k, n]) => (w.items[k] ?? 0) >= (n ?? 0));
          return `<li data-recipe="${r.id}"><div><b>${r.label}</b><br><small>${need}${r.tool ? ` · <span class="${toolOk ? 'ok' : 'miss'}">${label(r.tool)}</span>` : ''}</small>${r.note ? `<br><small class="dim" data-note>${r.note}</small>` : ''}</div><button type="button" data-craft="${r.id}" ${carried ? '' : 'disabled'}>Craft</button></li>`;
        }).join('');
        body = `<div class="dim">${fn.summary}</div><ul>${rows}</ul>`;
      } else if (fn.kind === 'storage') {
        const stock = Object.entries(s.stock ?? {});
        const used = stockWeight(s.stock);
        const fits = (k: string) => carriedWeight(w) + ITEM_WEIGHT[k as WildItem] <= CARRY_CAPACITY;
        const held = reservationsInSource(this.world, s.id);
        const takeRows = stock.length ? stock.map(([k, n]) => {
          const free = freeIn(this.world, s.id, k);
          const forSite = held.filter((r) => r.bag[k]).map((r) => `<button type="button" data-take="${k}" data-n="1" data-for="${r.siteId}" ${fits(k) ? '' : 'disabled'}>Take 1 for ${buildingDef(r.kind)!.label.toLowerCase()}</button>`).join('');
          return `<li><span>${label(k)} <b>×${n}</b>${free < n ? ` <span class="dim">(${n - free} reserved)</span>` : ''}</span>${free > 0 ? `<button type="button" data-take="${k}" data-n="1" ${fits(k) ? '' : 'disabled'}>Take 1</button>` : ''}${forSite}</li>`;
        }).join('') : '<li class="dim">empty</li>';
        const storeRows = Object.keys(w.items).map((k) => [k, freeInBag(this.world, k)] as const).filter(([, n]) => n > 0).map(([k, n]) => `<li><span>${label(k)} ×${n}</span><button type="button" data-store="${k}" data-n="${n}" ${used + ITEM_WEIGHT[k as WildItem] * n <= fn.capacity ? '' : 'disabled'}>Store ${n}</button></li>`).join('');
        body = `<div class="dim">holds ${used}/${fn.capacity} weight</div><h3>Inside</h3><ul>${takeRows}</ul>${storeRows ? `<h3>Put in</h3><ul>${storeRows}</ul>` : ''}`;
      } else body = `<div class="dim">${fn.summary}</div>`;
    }
    this.site.innerHTML = `<header><h2>${d.label}${s.state === 'done' ? '' : ' · site'}</h2></header>${body}`;
  }

  update(time: number): void {
    this.view.sync(this.world);
    this.view.update(time);
    this.mode.update();
    this.near = this.nearest();
    if (this.near?.id !== this.cancelArmed) this.cancelArmed = this.near && this.cancelArmed === this.near.id ? this.cancelArmed : null;
    this.renderMenu();
    this.renderSite();
    this.button.hidden = !this.world.wild?.build;
  }

  metrics(): Record<string, unknown> {
    const b = this.world.wild?.build;
    const at = this.h.at();
    return {
      sites: b ? [...b.sites.values()].map((s) => ({ id: s.id, kind: s.kind, x: s.x, z: s.z, rot: s.rot, state: s.state, stage: s.stage, work: s.work,
        reserved: JSON.parse(JSON.stringify(s.reserved)), consumed: { ...s.consumed }, delivered: { ...s.delivered }, progress: siteProgress(s), ...(s.fuel !== undefined ? { fuel: s.fuel } : {}), ...(s.stock ? { stock: { ...s.stock } } : {}) })) : [],
      home: b?.home ?? null, homeSpot: (() => { const hs = homeShelter(this.world); return hs ? { id: hs.id } : null; })(), death: b?.death ?? null,
      reserved: reservedTotalsIn(this.world), reservedInBag: reservedTotalsIn(this.world, 'bag'),
      deliverable: this.near && at ? deliverable(this.world, this.near, at) : [],
      near: this.near?.id ?? null, sitePanel: !this.site.hidden, menu: !this.menu.hidden,
      mode: this.mode.active ? { kind: this.mode.kind, rot: this.mode.rot, pos: this.mode.pos, ok: this.mode.preview?.check.ok ?? null,
        reasons: this.mode.preview?.check.reasons ?? [], bar: this.mode.metrics().bar } : null,
      drawn: { ...this.view.drawn }, stats: { ...this.stats },
    };
  }
}
