// M014 build mode: the owner picks a building from the catalogue, moves a
// ghost of it over the ground and turns it, and confirms. Nothing here
// decides anything: the verdict, its reasons and the woodland figures come
// from the simulation's own validator (sim/buildings.ts `buildingPreview`,
// the same `checkBuilding` that the journaled `place_site` runs), and the
// confirmation is two journaled commands (`place_site`, then `approve_site`).
//
// Desktop: G opens it; the ghost follows the mouse; a click pins it there
// (click again elsewhere to move it, or drag the ghost); X or Shift + wheel
// turns it; Enter places and approves; Escape closes. Touch: Farm -> Build;
// the ghost starts in front of the founder; tap the ground to move it, drag
// the ghost, and use the bar's Turn / Place / Close buttons. The bar sits at
// the top of the screen, clear of the joystick and the Jump button.
//
// W4: the same mode serves the wilderness through a `BuildAdapter`: the
// catalogue kinds, footprint sizes, the verdict (sim/wild-build.ts
// `checkWildSite`, the function `place_site` runs) and the bar's text come
// from the adapter; the ghost, its green/red footprint, door step and tree
// marks, the pointer and touch handling and the rotation are shared.
import * as THREE from 'three';
import type { World } from '../sim/world';
import { residentSurfaceAt } from '../sim/world';
import { BUILD_KINDS, SITE_RULES, SiteKind, freeInStore, isBuildHomestead, siteSize } from '../sim/homestead';
import { BuildPreview, DOOR_FACING, buildingPreview } from '../sim/buildings';
import type { PlacementCheck } from '../sim/placement';
import { B, boxes } from '../render/homestead';

type Receipt = { ok: boolean; reasons?: string[]; outcome?: { type: string; siteId?: string; reserved?: Record<string, number> } };

export interface BuildModeOptions {
  world: () => World;
  scene: THREE.Scene;
  camera: () => THREE.Camera | null;
  canvas: HTMLElement | null;
  send: (command: Record<string, unknown>, target?: string) => Receipt;
  toast: (message: string, kind: 'good' | 'warn' | 'bad') => void;
  player: () => { x: number; z: number; heading: number } | null;
  /** Called when the mode opens or closes (the HUD and panels react). */
  onChange?: (active: boolean) => void;
  /** W4: another scenario's catalogue and validator (absent: the settlement's M014 one). */
  adapter?: BuildAdapter;
}

/** What a scenario supplies to the shared build mode (W4 wilderness). */
export interface BuildAdapter {
  available(): boolean;
  unavailable: string;
  size(kind: string, rot: number): { w: number; d: number };
  /** The validator's verdict (the same function the command runs). */
  check(kind: string, x: number, z: number, rot: number): PlacementCheck;
  /** Extra preview key (e.g. the player's position, which reach depends on). */
  key(): string;
  /** Place it; true when accepted. */
  confirm(kind: string, x: number, z: number, rot: number): boolean;
  /** The bar's content (kinds row, info, verdict, actions). */
  bar(kind: string, rot: number, pinned: boolean, check: PlacementCheck | null): string;
}
type AnyPreview = BuildPreview | { check: PlacementCheck & { routeToStore?: number | null; routeToHome?: number | null }; woodland: null; viaStore: null };

const GHOST_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });
const OK = '#7FE08A', BAD = '#F06A5E', DOOR = '#F4E8A4', FELL = '#6FD06F', KEEP = '#6FA8F0', CLEAR = '#E8A050', BLOCK = '#E04040', RING = '#D8E8F0';

export class BuildMode {
  active = false;
  kind: string = 'woodshed';
  rot = 0;
  /** Footprint min corner (whole metres), or null before the first ground point. */
  pos: { x: number; z: number } | null = null;
  /** Pinned by a click or tap: hovering no longer moves it. */
  pinned = false;
  preview: AnyPreview | null = null;
  readonly ghost = new THREE.Group();
  private readonly bar: HTMLElement;
  private ghostKey = '';
  private previewKey = '';
  private previewAt = 0;
  private barKey = '';
  private down: { id: number; x: number; y: number; t: number } | null = null;
  private drag: number | null = null;
  private hover: { x: number; y: number } | null = null;
  /** Timing of the validator calls (presentation-only metrics). */
  readonly stats = { previews: 0, previewMs: 0, maxPreviewMs: 0, ghostBuilds: 0, ghostTriangles: 0 };

  constructor(private readonly o: BuildModeOptions) {
    this.ghost.name = 'build_ghost';
    this.ghost.visible = false;
    this.ghost.renderOrder = 5;
    o.scene.add(this.ghost);
    this.bar = document.createElement('div');
    this.bar.id = 'build-bar';
    this.bar.hidden = true;
    this.bar.setAttribute('role', 'group');
    this.bar.setAttribute('aria-label', 'Build: choose a building, where it goes and which way it faces');
    document.body.appendChild(this.bar);
    this.bar.addEventListener('click', (e) => this.onBar(e));
    const c = o.canvas;
    if (c) {
      // Capture phase: a drag that starts on the ghost moves the ghost, not the camera.
      window.addEventListener('pointerdown', (e) => this.onDown(e), { capture: true });
      window.addEventListener('pointermove', (e) => this.onMove(e), { capture: true });
      window.addEventListener('pointerup', (e) => this.onUp(e), { capture: true });
      window.addEventListener('pointercancel', () => { this.down = null; this.drag = null; }, { capture: true });
      window.addEventListener('wheel', (e) => {
        if (!this.active || !e.shiftKey || e.target !== c) return;
        e.preventDefault(); e.stopImmediatePropagation();
        this.turn(e.deltaY > 0 ? 1 : -1);
      }, { capture: true, passive: false });
    }
  }

  get available(): boolean {
    if (this.o.adapter) return this.o.adapter.available();
    const h = this.o.world().homestead; return !!h && isBuildHomestead(h);
  }
  private sizeOf(kind: string, rot: number): { w: number; d: number } {
    return this.o.adapter ? this.o.adapter.size(kind, rot) : siteSize(kind as SiteKind, rot);
  }

  open(kind: string = this.kind): void {
    if (!this.available) { this.o.toast(this.o.adapter?.unavailable ?? 'Choosing where to build needs settlement rules v6.', 'warn'); return; }
    this.kind = kind;
    this.active = true;
    this.pinned = false;
    this.bar.hidden = false;
    this.ghost.visible = true;
    document.body.classList.add('building');
    // Start in front of the founder (touch has no hover).
    const p = this.o.player();
    if (p) this.placeAt(p.x + Math.sin(p.heading) * 6, p.z + Math.cos(p.heading) * 6);
    this.previewKey = ''; this.barKey = '';
    this.o.onChange?.(true);
  }

  close(): void {
    if (!this.active) return;
    this.active = false;
    this.bar.hidden = true;
    this.ghost.visible = false;
    document.body.classList.remove('building');
    this.o.onChange?.(false);
  }

  /** Choose another building; the ghost stays centred where it was. */
  setKind(kind: string): void {
    if (this.pos) {
      const a = this.sizeOf(this.kind, this.rot);
      const cx = this.pos.x + a.w / 2, cz = this.pos.z + a.d / 2;
      this.kind = kind;
      this.pos = null;
      this.placeAt(cx, cz);
    } else this.kind = kind;
    this.previewKey = ''; this.barKey = '';
  }

  turn(dir = 1): void {
    this.rot = (this.rot + (dir > 0 ? 1 : 3)) % 4;
    // Keep the ghost centred where it was.
    if (this.pos) {
      const a = this.sizeOf(this.kind, (this.rot + 3) % 4), b = this.sizeOf(this.kind, this.rot);
      this.pos = { x: this.pos.x + Math.floor(a.w / 2) - Math.floor(b.w / 2), z: this.pos.z + Math.floor(a.d / 2) - Math.floor(b.d / 2) };
    }
    this.previewKey = '';
  }

  /** Centre the footprint on a ground point (metres). */
  placeAt(x: number, z: number): void {
    const s = this.sizeOf(this.kind, this.rot);
    const next = { x: Math.floor(x - s.w / 2 + 0.5), z: Math.floor(z - s.d / 2 + 0.5) };
    if (!this.pos || next.x !== this.pos.x || next.z !== this.pos.z) { this.pos = next; this.previewKey = ''; }
  }

  /** Where the view ray through a screen point meets the loaded ground (metres), or null. */
  groundAt(clientX: number, clientY: number): { x: number; z: number } | null {
    const cam = this.o.camera(), c = this.o.canvas;
    if (!cam || !c) return null;
    const r = c.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, cam);
    const o = ray.ray.origin, d = ray.ray.direction, w = this.o.world();
    const top = (x: number, z: number) => residentSurfaceAt(w, Math.floor(x), Math.floor(z));
    // March along the ray; refine the first step that goes under the ground.
    let prev = 0;
    for (let t = 0.5; t < 400; t += t < 60 ? 0.5 : 1.5) {
      const y = top(o.x + d.x * t, o.z + d.z * t);
      if (y !== null && o.y + d.y * t <= y) {
        let a = prev, b = t;
        for (let k = 0; k < 8; k++) { const m = (a + b) / 2, ym = top(o.x + d.x * m, o.z + d.z * m); if (ym !== null && o.y + d.y * m <= ym) b = m; else a = m; }
        return { x: o.x + d.x * b, z: o.z + d.z * b };
      }
      prev = t;
    }
    return null;
  }

  private onTarget(e: PointerEvent): boolean { return this.active && !!this.o.canvas && e.target === this.o.canvas; }

  private onDown(e: PointerEvent): void {
    if (!this.onTarget(e)) return;
    this.down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    // A press on the ghost picks it up.
    const g = this.groundAt(e.clientX, e.clientY);
    if (g && this.pos && this.pinned) {
      const s = this.sizeOf(this.kind, this.rot);
      if (g.x >= this.pos.x - 1 && g.x <= this.pos.x + s.w + 1 && g.z >= this.pos.z - 1 && g.z <= this.pos.z + s.d + 1) {
        this.drag = e.pointerId;
        e.stopImmediatePropagation();
      }
    }
  }

  private onMove(e: PointerEvent): void {
    if (!this.active) return;
    if (this.drag === e.pointerId) {
      e.stopImmediatePropagation();
      const g = this.groundAt(e.clientX, e.clientY);
      if (g) this.placeAt(g.x, g.z);
      return;
    }
    // Desktop hover: an unpinned ghost follows the mouse.
    if (e.pointerType === 'mouse' && e.target === this.o.canvas && e.buttons === 0) this.hover = { x: e.clientX, y: e.clientY };
  }

  private onUp(e: PointerEvent): void {
    if (!this.active) return;
    if (this.drag === e.pointerId) { this.drag = null; this.down = null; e.stopImmediatePropagation(); return; }
    const d = this.down;
    this.down = null;
    if (!d || d.id !== e.pointerId || e.target !== this.o.canvas) return;
    // A tap or click (little movement, short): put the ghost there and pin it.
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 9 && performance.now() - d.t < 450) {
      const g = this.groundAt(e.clientX, e.clientY);
      if (g) { this.placeAt(g.x, g.z); this.pinned = true; this.hover = null; }
    }
  }

  /** Keyboard while active (main.ts routes keys here first). Returns true when the key was used. */
  key(e: KeyboardEvent): boolean {
    if (!this.active) return false;
    if (e.key === 'Escape') { this.close(); return true; }
    if (e.key === 'x' || e.key === 'X') { this.turn(e.shiftKey ? -1 : 1); return true; }
    if (e.key === 'Enter') { this.confirm(); return true; }
    return false;
  }

  /** Place the site and approve it (its materials are reserved): two journaled commands. */
  confirm(): boolean {
    if (!this.pos) return false;
    const { x, z } = this.pos;
    if (this.o.adapter) {
      const done = this.o.adapter.confirm(this.kind, x, z, this.rot);
      this.pinned = false; this.previewKey = ''; this.barKey = '';
      if (done) this.close();
      return done;
    }
    const r = this.o.send({ type: 'place_site', kind: this.kind, x, z, rot: this.rot }, `${this.kind}:${x},${z}`);
    if (!r.ok) { this.o.toast(`Cannot build here: ${(r.reasons ?? []).join('; ')}`, 'bad'); this.previewKey = ''; return false; }
    const id = r.outcome?.siteId ?? '';
    const a = this.o.send({ type: 'approve_site', siteId: id }, id);
    const label = SITE_RULES[this.kind as SiteKind].label;
    const held = a.ok && a.outcome?.reserved ? Object.entries(a.outcome.reserved).map(([k, n]) => `${n} ${k}`).join(', ') : '';
    this.o.toast(a.ok ? `${label} placed and approved: ${held || 'nothing'} reserved now; the rest as it comes in. A builder will put it up.`
      : `${label} marked out; approve it in Farm (${(a.reasons ?? []).join('; ')})`, a.ok ? 'good' : 'warn');
    this.pinned = false;
    this.previewKey = '';
    return true;
  }

  private onBar(e: Event): void {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.buildKind) this.setKind(b.dataset.buildKind);
    if (b.hasAttribute('data-build-turn')) this.turn(1);
    if (b.hasAttribute('data-build-place')) this.confirm();
    if (b.hasAttribute('data-build-close')) this.close();
    this.barKey = '';
  }

  /** Every frame while active: follow the hover, re-ask the validator (throttled), redraw the ghost and the bar when they change. */
  update(): void {
    if (!this.active) return;
    if (!this.available) { this.close(); return; }
    if (this.hover && !this.pinned) {
      const g = this.groundAt(this.hover.x, this.hover.y);
      if (g) this.placeAt(g.x, g.z);
      this.hover = null;
    }
    if (!this.pos) return;
    const w = this.o.world();
    const key = `${this.kind}:${this.pos.x},${this.pos.z}:${this.rot}:${w.revision}:${w.life?.tick ?? 0}:${this.o.adapter?.key() ?? ''}`;
    const now = performance.now();
    if (key !== this.previewKey && (now - this.previewAt > 180 || !this.preview || this.preview.check.kind !== this.kind || this.preview.check.rot !== this.rot)) {
      this.previewKey = key; this.previewAt = now;
      const t0 = performance.now();
      const a = this.o.adapter;
      this.preview = a ? { check: a.check(this.kind, this.pos.x, this.pos.z, this.rot), woodland: null, viaStore: null }
        : buildingPreview(w, this.kind as SiteKind, this.pos.x, this.pos.z, this.rot);
      const ms = performance.now() - t0;
      this.stats.previews++; this.stats.previewMs += ms; this.stats.maxPreviewMs = Math.max(this.stats.maxPreviewMs, ms);
    }
    this.drawGhost();
    this.renderBar();
  }

  private drawGhost(): void {
    const p = this.preview;
    if (!p) return;
    const c = p.check;
    const key = `${c.kind}:${c.x},${c.z}:${c.rot}:${c.ok}:${c.clears.join(',')}:${c.blockers.map((b) => b.id).join(',')}:${p.woodland?.harvestableIds.join(',') ?? ''}:${p.woodland?.protectedIds.join(',') ?? ''}`;
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    for (const m of this.ghost.children) (m as THREE.Mesh).geometry.dispose();
    this.ghost.clear();
    const w = this.o.world();
    const y = (x: number, z: number) => residentSurfaceAt(w, Math.floor(x), Math.floor(z)) ?? c.ground.hi;
    const list: B[] = [];
    for (let z = c.cells.z0; z < c.cells.z1; z++) for (let x = c.cells.x0; x < c.cells.x1; x++) {
      list.push({ w: 0.94, h: 0.5, d: 0.94, x: x + 0.5, y: y(x, z) + 0.02, z: z + 0.5, c: c.ok ? OK : BAD });
    }
    // The door step: a pale tile with a post at the door.
    list.push({ w: 0.8, h: 0.08, d: 0.8, x: c.entrance.x + 0.5, y: y(c.entrance.x, c.entrance.z) + 0.03, z: c.entrance.z + 0.5, c: DOOR });
    list.push({ w: 0.14, h: 1.2, d: 0.14, x: c.entrance.x + 0.5, y: y(c.entrance.x, c.entrance.z), z: c.entrance.z + 0.5, c: DOOR });
    const mark = (id: string, col: string, h: number) => {
      const e = w.entities.get(id);
      if (e) list.push({ w: 0.3, h, d: 0.3, x: e.x, y: y(e.x, e.z) + 3.2, z: e.z, c: col });
    };
    for (const id of c.clears) mark(id, CLEAR, 0.4);
    for (const b of c.blockers) mark(b.id, BLOCK, 1.2);
    if (p.woodland) {
      for (const id of p.woodland.harvestableIds) mark(id, FELL, 0.8);
      for (const id of p.woodland.protectedIds) mark(id, KEEP, 0.8);
      // The work radius: a dotted ring on the ground.
      const r = p.woodland.radius, cx = p.woodland.centre.x, cz = p.woodland.centre.z;
      for (let k = 0; k < 64; k++) {
        const a = (k / 64) * Math.PI * 2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        list.push({ w: 0.5, h: 0.12, d: 0.5, x, y: y(x, z) + 0.05, z, c: RING });
      }
    }
    const geo = boxes(list);
    const m = new THREE.Mesh(geo, GHOST_MAT);
    m.name = 'build_ghost_mesh';
    m.renderOrder = 5;
    m.frustumCulled = false;
    this.ghost.add(m);
    this.stats.ghostBuilds++;
    this.stats.ghostTriangles = geo.attributes.position.count / 3;
  }

  private renderBar(): void {
    const p = this.preview, w = this.o.world();
    if (this.o.adapter) {
      // Redrawn only when what it shows changes (not every tick): a bar rebuilt under a finger loses the tap.
      const f = (p?.check as { funding?: { short: unknown } | null } | undefined)?.funding;
      const key = `${this.kind}:${this.rot}:${this.pinned}:${p ? `${p.check.x},${p.check.z}:${p.check.ok}:${p.check.reasons.join('|')}:${JSON.stringify(f?.short ?? null)}:${(p.check as { routeToPlayer?: number | null }).routeToPlayer ?? ''}` : ''}`;
      if (key === this.barKey) return;
      this.barKey = key;
      this.bar.innerHTML = this.o.adapter.bar(this.kind, this.rot, this.pinned, p?.check ?? null);
      return;
    }
    const key = `${this.kind}:${this.rot}:${this.pinned}:${p ? `${p.check.x},${p.check.z}:${p.check.reasons.join('|')}:${p.woodland?.harvestable}:${p.woodland?.meanPathToStore}` : ''}:${freeInStore(w, 'wood')}:${freeInStore(w, 'fiber')}`;
    if (key === this.barKey) return;
    this.barKey = key;
    const rule = SITE_RULES[this.kind as SiteKind];
    const c = p?.check as BuildPreview['check'] | undefined;
    const cost = Object.entries(rule.cost).map(([k, n]) => { const free = freeInStore(w, k); return `${n} ${k} <span class="${free >= n ? 'dim' : 'warn'}">(${free} free in store)</span>`; }).join(', ');
    const verdict = !c ? 'Point at the ground (or tap it) to choose where it goes.'
      : c.ok ? `<b>Good spot.</b> Door faces ${DOOR_FACING[c.rot]}${c.routeToStore !== null ? ` · ${c.routeToStore} m walk to the store` : ''}${c.clearText ? ` · clears ${c.clearText}` : ''}`
        : c.reasons.map((r) => `• ${r}`).join('<br>');
    const wl = p?.woodland, via = p?.viaStore;
    const wood = wl ? `<div class="build-wood" data-build-woodland>Woodland within ${wl.radius} m: ${wl.trees} trees · <b class="fell">${wl.harvestable} may be felled</b> (${wl.harvestableTimber} wood) · <b class="keep">${wl.protected} protected</b>${wl.newlyProtected ? ` (${wl.newlyProtected} by this building's ${wl.policy.buffer} m buffer)` : ''} · ${wl.regrowing} regrowing
      <br>Haul to this ${rule.label.toLowerCase()}: ${wl.meanPathToStore ?? '–'} m on average${via?.meanPathToStore != null ? ` (to the store now: ${via.meanPathToStore} m)` : ''}${wl.unreachable ? ` · ${wl.unreachable} unreachable` : ''}
      · holds ${rule.store!.capacity} ${rule.store!.item}
      <br>Sustainable: ${wl.sustainableTreesPerDay} trees (${wl.sustainableWoodPerDay} wood) a day, ${wl.rotationDays}-day rotation · ${rule.demandPerDay} wood a day needs ${wl.spotsForDemand} managed tree spots${wl.regenerationShortfall ? `: <b class="warn">${wl.regenerationShortfall} short</b> (let it regrow or plant)` : ': enough'}</div>` : '';
    this.bar.innerHTML = `
      <div class="build-row kinds">${BUILD_KINDS.map((k) => `<button type="button" data-build-kind="${k}" class="${k === this.kind ? 'on' : ''}" aria-pressed="${k === this.kind}">${SITE_RULES[k].label}</button>`).join('')}</div>
      <div class="build-info">${rule.label}: ${rule.role} · ${this.sizeOf(this.kind, this.rot).w} × ${this.sizeOf(this.kind, this.rot).d} m · ${cost} · ${rule.work} work ticks</div>
      <div class="build-verdict ${c?.ok ? 'ok' : 'bad'}" data-build-verdict aria-live="polite">${verdict}</div>
      ${wood}
      <div class="build-row actions"><button type="button" data-build-turn aria-label="Turn the building a quarter">Turn 90°</button><button type="button" class="primary" data-build-place ${c?.ok ? '' : 'disabled'}>Place &amp; approve</button><button type="button" data-build-close>Close</button>
      <span class="dim build-help">${this.pinned ? 'Pinned: tap/click elsewhere or drag it to move' : 'Move over the ground; click or tap to pin'} · X / Shift+wheel: turn · Enter: place · Esc: close</span></div>`;
  }

  metrics(): Record<string, unknown> {
    const p = this.preview;
    return {
      active: this.active, kind: this.kind, rot: this.rot, pos: this.pos, pinned: this.pinned,
      check: p ? { ok: p.check.ok, reasons: p.check.reasons, x: p.check.x, z: p.check.z, rot: p.check.rot, entrance: p.check.entrance, clears: p.check.clears.length,
        clearText: p.check.clearText, blockers: p.check.blockers, routeToStore: p.check.routeToStore ?? null, routeToHome: p.check.routeToHome ?? null } : null,
      woodland: p?.woodland ? { ...p.woodland, harvestableIds: undefined, protectedIds: undefined } : null,
      viaStore: p?.viaStore ? { meanPathToStore: p.viaStore.meanPathToStore, harvestable: p.viaStore.harvestable } : null,
      ghost: { visible: this.ghost.visible, meshes: this.ghost.children.length, ...this.stats },
      bar: this.active ? (this.bar.querySelector('[data-build-verdict]')?.textContent ?? '').replace(/\s+/g, ' ').trim() : null,
    };
  }
}

