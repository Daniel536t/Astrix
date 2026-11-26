// W5: the wilderness minimap, full map, waypoints, routes and the in-world
// trail. Presentation and input only:
//  - exploration: as the player walks, a journaled `explore` report is sent
//    every EXPLORE_STEP metres when it would discover something (new fog
//    cells, a place, an ore outcrop); the simulation reveals and records;
//  - waypoints: journaled `set_waypoint` / `remove_waypoint`;
//  - routes: derived (sim/route.ts), planned in time slices, refined near the
//    player on the live 1 m grid, replanned when the player strays; never saved.
// The maps draw only explored fog cells' terrain (canvas 2D, cached 32 m
// tiles), discovered places and ore, waypoints, the player and the route
// (clipped to explored ground: the line is not drawn through the fog).
import * as THREE from 'three';
import type { World } from '../sim/world';
import { HALF, forestScore } from '../sim/world';
import { EXPLORE_STEP, FOG_CELL, FOG_N, MAX_WAYPOINTS, WAYPOINT_NAME, depositById, exploreGain, exploredCount } from '../sim/map';
import { Place, placeById } from '../sim/places';
import {
  RouteResult, RouteSearch, RoutePoint, TILE, distanceToRoute, pointAlong, refineStart, routeGround, terrainCache,
} from '../sim/route';
import { TrailView } from '../render/trail';

type Receipt = { ok: true; outcome: Record<string, unknown> & { type: string } } | { ok: false; code: string; reasons: string[] };
export interface WildMapOptions {
  world: () => World;
  /** Dispatch a journaled command (the caller saves on acceptance). */
  dispatch: (c: Record<string, unknown>, target: string) => Receipt;
  toast: (message: string, kind?: 'good' | 'warn' | 'bad') => void;
  player: () => { x: number; z: number; heading: number } | null;
  /** The camera's forward direction on the ground (x, z), for the route arrow. */
  cameraForward: () => { x: number; z: number } | null;
  groundY: (x: number, z: number) => number | null;
  scene: THREE.Scene;
  storage: Storage | null;
}
interface View { cx: number; cz: number; s: number; w: number; h: number }
interface Destination { x: number; z: number; label: string; waypointId?: string }

const TILES = 2048 / TILE;
const TILE_PX = TILE / 2;
const FOG = '#1c232d';
const MINIMAP_KEY = 'astrix:minimap:v1';
const TRAIL_AHEAD = 60;
const STRAY = 12;
const ARRIVED = 4;

const compass = (dx: number, dz: number) => {
  const a = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(a / 45) % 8];
};
const fmtDist = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class WildMap {
  readonly trail = new TrailView();
  private readonly mini: HTMLButtonElement;
  private readonly miniCanvas: HTMLCanvasElement;
  private readonly pill: HTMLButtonElement;
  private readonly sheet: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly status: HTMLElement;
  private readonly lists: HTMLElement;
  private readonly popup: HTMLElement;
  private readonly tiles = new Map<number, HTMLCanvasElement>();
  private readonly pending = new Set<number>();
  private view: View = { cx: 0, cz: 0, s: 1, w: 0, h: 0 };
  private miniShown = true;
  private miniDrawn = { x: NaN, z: NaN, h: NaN, key: '', at: 0 };
  private mapDirty = true;
  // exploration reporting
  private lastQueued: RoutePoint | null = null;
  private readonly queue: RoutePoint[] = [];
  private refusedTick = -1;
  // routing
  dest: Destination | null = null;
  private search: RouteSearch | null = null;
  private searchFrom: RoutePoint | null = null;
  private searchT0 = 0;
  private searchCpu = 0;
  private coarse: RoutePoint[] = [];
  route: RoutePoint[] = [];
  private routeInfo: Extract<RouteResult, { ok: true }> | null = null;
  refusal: string | null = null;
  private lastRefine = { at: 0, x: NaN, z: NaN };
  private lastStrayCheck = 0;
  private trailKey = '';
  private routeVersion = 0;
  private drag: { id: number; x: number; y: number; cx: number; cz: number; moved: boolean } | null = null;
  private pinch: { d: number; s: number } | null = null;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private openT0 = 0;
  readonly stats = {
    reports: 0, refused: 0, exploreMaxMs: 0, exploreLastMs: 0, lastRefusal: '', minimapMs: 0, minimapMaxMs: 0, minimapDraws: 0, mapDrawMs: 0, mapOpenMs: null as number | null,
    routeMs: null as number | null, routeCpuMs: 0, routeExpanded: 0, routes: 0, replans: 0, refineMs: null as number | null, tilesMs: 0, tilesBuilt: 0,
  };

  constructor(private readonly o: WildMapOptions) {
    o.scene.add(this.trail.mesh);
    try { this.miniShown = o.storage?.getItem(MINIMAP_KEY) !== '0'; } catch { this.miniShown = true; }
    this.mini = document.createElement('button');
    this.mini.id = 'minimap';
    this.mini.type = 'button';
    this.mini.setAttribute('aria-label', 'Map: tap to open the full map (M)');
    this.miniCanvas = document.createElement('canvas');
    this.mini.appendChild(this.miniCanvas);
    this.mini.addEventListener('click', () => this.open());
    this.pill = document.createElement('button');
    this.pill.id = 'route-pill';
    this.pill.type = 'button';
    this.pill.hidden = true;
    this.pill.addEventListener('click', () => this.open());
    this.sheet = document.createElement('section');
    this.sheet.id = 'world-map';
    this.sheet.hidden = true;
    this.sheet.setAttribute('aria-label', 'Map');
    this.sheet.innerHTML = `<header><h2>Map</h2><span class="dim" data-map-count></span>
      <button type="button" data-mapzoom="in" aria-label="Zoom in">+</button><button type="button" data-mapzoom="out" aria-label="Zoom out">−</button>
      <button type="button" data-centre aria-label="Centre on you">Me</button><button type="button" data-close aria-label="Close the map">×</button></header>
      <canvas></canvas><div class="map-popup" hidden></div>
      <aside><p class="map-status" data-route-status></p><div data-lists></div></aside>`;
    this.canvas = this.sheet.querySelector('canvas')!;
    this.status = this.sheet.querySelector('[data-route-status]')!;
    this.lists = this.sheet.querySelector('[data-lists]')!;
    this.popup = this.sheet.querySelector('.map-popup')!;
    this.sheet.addEventListener('click', (e) => this.onSheetClick(e));
    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    for (const ev of ['pointerup', 'pointercancel'] as const) this.canvas.addEventListener(ev, (e) => this.onUp(e));
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1.25 : 0.8, e.offsetX, e.offsetY); }, { passive: false });
    document.body.append(this.mini, this.pill, this.sheet);
    this.applyMiniShown();
  }

  private get world(): World { return this.o.world(); }
  private get map() { return this.world.wild?.map ?? null; }
  get isOpen(): boolean { return !this.sheet.hidden; }
  get minimapShown(): boolean { return this.miniShown; }

  setMinimap(on: boolean): void {
    this.miniShown = on;
    try { this.o.storage?.setItem(MINIMAP_KEY, on ? '1' : '0'); } catch { /* private mode */ }
    this.applyMiniShown();
  }
  private applyMiniShown(): void { this.mini.hidden = !this.miniShown || !this.map; document.body.classList.toggle('has-minimap', !this.mini.hidden); }

  // ---------- per frame ----------
  update(): void {
    const m = this.map;
    if (!m) { this.mini.hidden = true; return; }
    if (this.mini.hidden === this.miniShown) this.applyMiniShown();
    const p = this.o.player();
    if (p) this.reportExploration(p);
    this.stepRoute(p);
    this.buildTiles(4);
    if (p && this.miniShown) this.drawMini(p);
    if (this.isOpen && this.mapDirty) this.drawMap();
    this.updatePill(p);
  }

  /** Journal an exploration report every EXPLORE_STEP metres that would discover something; refused ones wait for the next tick. */
  private reportExploration(p: { x: number; z: number }): void {
    const m = this.map!;
    if (!this.lastQueued || Math.hypot(p.x - this.lastQueued.x, p.z - this.lastQueued.z) >= EXPLORE_STEP) {
      const g = exploreGain(this.world, m, p.x, p.z);
      // The first report since the upgrade (or a load with nothing yet recorded) anchors the player.
      if (g.cells.length || g.places.length || g.deposits.length || !m.last) { this.queue.push({ x: p.x, z: p.z }); if (this.queue.length > 64) this.queue.shift(); }
      this.lastQueued = { x: p.x, z: p.z };
    }
    const tick = this.world.life?.tick ?? 0;
    if (!this.queue.length || this.refusedTick === tick) return;
    const q = this.queue[0];
    const at = { x: Math.round(q.x * 10), z: Math.round(q.z * 10) };
    const tx0 = performance.now();
    const r = this.o.dispatch({ type: 'explore', at }, `${at.x},${at.z}`);
    const dt = performance.now() - tx0;
    this.stats.exploreMaxMs = Math.max(this.stats.exploreMaxMs, Math.round(dt * 10) / 10); this.stats.exploreLastMs = Math.round(dt * 10) / 10;
    if (!r.ok) {
      this.stats.refused++; this.stats.lastRefusal = r.reasons.join('; ');
      if (r.code === 'implausible') { this.refusedTick = tick; return; }
      this.queue.shift();
      return;
    }
    this.queue.shift();
    this.stats.reports++;
    this.mapDirty = true;
    const o = r.outcome as unknown as { places: string[]; deposits: string[] };
    const names = o.places.map((id) => placeById(this.world.seed, this.world.params.generatorVersion, id)?.name).filter(Boolean);
    if (names.length) this.o.toast(`Discovered: ${names.join(', ')} (on your map)`, 'good');
    else if (o.deposits.length) this.o.toast(`You spot ${o.deposits.length === 1 ? 'an ore outcrop' : `${o.deposits.length} ore outcrops`}: marked on your map`, 'good');
  }

  // ---------- terrain tiles ----------
  private tileKey(tx: number, tz: number) { return tz * TILES + tx; }
  private buildTiles(max: number): void {
    const t0 = performance.now();
    let n = 0;
    for (const k of this.pending) {
      if (n >= max || performance.now() - t0 > 6) break;
      this.pending.delete(k);
      if (this.tiles.has(k)) continue;
      this.tiles.set(k, this.renderTile(k % TILES, Math.floor(k / TILES)));
      n++;
    }
    if (n) { this.stats.tilesBuilt += n; this.stats.tilesMs += performance.now() - t0; this.mapDirty = true; this.miniDrawn.key = ''; }
  }
  private renderTile(tx: number, tz: number): HTMLCanvasElement {
    const w = this.world;
    const t = terrainCache(w.seed, w.params.generatorVersion).tile(tx, tz);
    const c = document.createElement('canvas');
    c.width = TILE_PX; c.height = TILE_PX;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(TILE_PX, TILE_PX);
    const ox = -HALF + tx * TILE, oz = -HALF + tz * TILE;
    for (let j = 0; j < TILE_PX; j++) for (let i = 0; i < TILE_PX; i++) {
      const x = i * 2, z = j * 2, k = z * TILE + x;
      const h = t.h[k], d = t.d[k];
      const hx = t.h[z * TILE + Math.min(TILE - 1, x + 1)], hz = t.h[Math.min(TILE - 1, z + 1) * TILE + x];
      const hxm = t.h[z * TILE + Math.max(0, x - 1)], hzm = t.h[Math.max(0, z - 1) * TILE + x];
      const slope = Math.max(Math.abs(hx - h), Math.abs(hz - h), Math.abs(hxm - h), Math.abs(hzm - h));
      let r: number, g: number, b: number;
      if (d > 1) { const f = Math.min(1, d / 8); r = 40 - 20 * f; g = 92 - 40 * f; b = 140 - 30 * f; }
      else if (d > 0) { r = 96; g = 158; b = 190; }
      else if (h < 2) { r = 206; g = 196; b = 150; }
      else if (h >= 74) { r = 236; g = 238; b = 240; }
      else if (slope >= 3) { r = 128; g = 122; b = 114; }
      else {
        const f = forestScore(ox + x, oz + z, w.seed);
        const hi = Math.min(1, Math.max(0, (h - 20) / 50));
        r = 100 + 40 * hi; g = 152 - 20 * hi; b = 72 + 30 * hi;
        if (f > 0.5) { r *= 0.62; g *= 0.78; b *= 0.62; } else if (f > 0.3) { r *= 0.82; g *= 0.9; b *= 0.82; }
      }
      // Hillshade, light from the north-west.
      const shade = d > 0 ? 1 : Math.max(0.72, Math.min(1.25, 1 + ((hxm - hx) + (hzm - hz)) * 0.07));
      const p = (j * TILE_PX + i) * 4;
      img.data[p] = Math.min(255, r * shade); img.data[p + 1] = Math.min(255, g * shade); img.data[p + 2] = Math.min(255, b * shade); img.data[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // ---------- drawing ----------
  private toScreen(v: View, x: number, z: number): [number, number] { return [v.w / 2 + (x - v.cx) * v.s, v.h / 2 + (z - v.cz) * v.s]; }
  private toWorld(v: View, sx: number, sy: number): RoutePoint { return { x: v.cx + (sx - v.w / 2) / v.s, z: v.cz + (sy - v.h / 2) / v.s }; }

  private prepare(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  /** Fog, explored terrain and a clip path of the explored cells in view. */
  private drawGround(ctx: CanvasRenderingContext2D, v: View): Path2D {
    const m = this.map!;
    ctx.fillStyle = FOG;
    ctx.fillRect(0, 0, v.w, v.h);
    const a = this.toWorld(v, 0, 0), b = this.toWorld(v, v.w, v.h);
    const c0x = Math.max(0, Math.floor((a.x + HALF) / FOG_CELL)), c1x = Math.min(FOG_N - 1, Math.floor((b.x + HALF) / FOG_CELL));
    const c0z = Math.max(0, Math.floor((a.z + HALF) / FOG_CELL)), c1z = Math.min(FOG_N - 1, Math.floor((b.z + HALF) / FOG_CELL));
    const clip = new Path2D();
    const size = FOG_CELL * v.s;
    ctx.imageSmoothingEnabled = v.s < 2;
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      if (!m.explored[cz * FOG_N + cx]) continue;
      const [sx, sy] = this.toScreen(v, -HALF + cx * FOG_CELL, -HALF + cz * FOG_CELL);
      clip.rect(sx, sy, size, size);
      const k = this.tileKey(cx >> 1, cz >> 1);
      const tile = this.tiles.get(k);
      if (tile) ctx.drawImage(tile, (cx & 1) * TILE_PX / 2, (cz & 1) * TILE_PX / 2, TILE_PX / 2, TILE_PX / 2, sx, sy, size + 0.6, size + 0.6);
      else { this.pending.add(k); ctx.fillStyle = '#4a5a44'; ctx.fillRect(sx, sy, size + 0.6, size + 0.6); }
    }
    return clip;
  }

  private drawOverlays(ctx: CanvasRenderingContext2D, v: View, clip: Path2D, full: boolean, p: { x: number; z: number; heading: number } | null): void {
    const m = this.map!, w = this.world;
    // The route, only over explored ground.
    if (this.route.length >= 2) {
      ctx.save();
      ctx.clip(clip);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      this.route.forEach((q, i) => { const [x, y] = this.toScreen(v, q.x, q.z); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.strokeStyle = 'rgba(30,20,0,0.65)'; ctx.lineWidth = full ? 6 : 5; ctx.stroke();
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = full ? 3 : 2.5; ctx.stroke();
      ctx.restore();
    }
    // Discovered ore outcrops.
    for (const id of m.deposits) {
      const e = depositById(w.seed, w.params.generatorVersion, id);
      if (!e) continue;
      const [x, y] = this.toScreen(v, e.x, e.z);
      if (x < -8 || y < -8 || x > v.w + 8 || y > v.h + 8) continue;
      ctx.fillStyle = '#e0904a'; ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, full ? 4 : 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // Discovered places.
    ctx.font = `${full ? 13 : 10}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    for (const id of m.places) {
      const pl = placeById(w.seed, w.params.generatorVersion, id);
      if (!pl) continue;
      const [x, y] = this.toScreen(v, pl.x, pl.z);
      if (x < -60 || y < -20 || x > v.w + 60 || y > v.h + 20) continue;
      ctx.fillStyle = '#fff3d6'; ctx.strokeStyle = '#2a2116'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (full || v.s >= 1.2) { ctx.lineWidth = 3; ctx.strokeText(pl.name, x, y - 9); ctx.fillText(pl.name, x, y - 9); }
    }
    // Waypoints and the destination.
    for (const wp of m.waypoints.values()) {
      const [x, y] = this.toScreen(v, wp.x, wp.z);
      ctx.fillStyle = '#5ec8ff'; ctx.strokeStyle = '#06263a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y - 7, 5, 0, Math.PI * 2); ctx.moveTo(x - 3, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + 3, y - 4); ctx.fill(); ctx.stroke();
      if (full) { ctx.fillStyle = '#d8f2ff'; ctx.lineWidth = 3; ctx.strokeText(wp.name, x, y - 15); ctx.fillText(wp.name, x, y - 15); }
    }
    if (this.dest) {
      const [x, y] = this.toScreen(v, this.dest.x, this.dest.z);
      ctx.strokeStyle = this.refusal ? '#ff6b5e' : '#ffd34d'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke();
    }
    // The player: an arrow pointing the way they face (north up).
    if (p) {
      const [x, y] = this.toScreen(v, p.x, p.z);
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(fz, fx) - Math.PI / 2);
      const r = full ? 9 : 7;
      ctx.beginPath(); ctx.moveTo(0, r); ctx.lineTo(r * 0.7, -r * 0.7); ctx.lineTo(0, -r * 0.3); ctx.lineTo(-r * 0.7, -r * 0.7); ctx.closePath();
      ctx.fillStyle = '#ff4f3a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  private drawMini(p: { x: number; z: number; heading: number }): void {
    const now = performance.now();
    const key = `${this.map!.explored.length}:${this.routeVersion}:${this.map!.places.size}:${this.map!.deposits.size}:${this.map!.waypoints.size}:${this.stats.reports}`;
    const moved = Math.hypot(p.x - this.miniDrawn.x, p.z - this.miniDrawn.z) > 0.5 || Math.abs(p.heading - this.miniDrawn.h) > 0.05;
    if ((!moved && key === this.miniDrawn.key) || now - this.miniDrawn.at < 120) return;
    const t0 = performance.now();
    const b = this.mini.getBoundingClientRect();
    const size = Math.max(40, Math.round(b.width - 4));
    const v: View = { cx: p.x, cz: p.z, s: size / 130, w: size, h: size };
    const ctx = this.prepare(this.miniCanvas, size, size);
    const clip = this.drawGround(ctx, v);
    this.drawOverlays(ctx, v, clip, false, p);
    ctx.fillStyle = '#fff3d6'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.strokeStyle = '#1c232d'; ctx.lineWidth = 3; ctx.strokeText('N', size / 2, 12); ctx.fillText('N', size / 2, 12);
    const ms = performance.now() - t0;
    this.stats.minimapDraws++;
    this.stats.minimapMs = this.stats.minimapMs ? this.stats.minimapMs * 0.9 + ms * 0.1 : ms;
    this.stats.minimapMaxMs = Math.max(this.stats.minimapMaxMs, ms);
    this.miniDrawn = { x: p.x, z: p.z, h: p.heading, key, at: now };
  }

  private drawMap(): void {
    const t0 = performance.now();
    const b = this.canvas.getBoundingClientRect();
    this.view.w = b.width; this.view.h = b.height;
    const ctx = this.prepare(this.canvas, b.width, b.height);
    const clip = this.drawGround(ctx, this.view);
    this.drawOverlays(ctx, this.view, clip, true, this.o.player());
    // Scale bar.
    const metres = [10, 25, 50, 100, 250, 500, 1000].find((mm) => mm * this.view.s >= 60) ?? 1000;
    ctx.fillStyle = '#fff3d6'; ctx.fillRect(12, b.height - 18, metres * this.view.s, 3);
    ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(fmtDist(metres), 12, b.height - 24);
    this.mapDirty = this.pending.size > 0;
    this.stats.mapDrawMs = performance.now() - t0;
    if (this.openT0) { this.stats.mapOpenMs = Math.round((performance.now() - this.openT0) * 10) / 10; this.openT0 = 0; }
  }

  // ---------- the full map ----------
  open(): void {
    if (!this.map) return;
    this.openT0 = performance.now();
    this.sheet.hidden = false;
    document.body.classList.add('map-open');
    const p = this.o.player();
    const b = this.canvas.getBoundingClientRect();
    this.view = { cx: p?.x ?? 0, cz: p?.z ?? 0, s: Math.max(0.3, Math.min(3, Math.min(b.width, b.height) / 360)), w: b.width, h: b.height };
    this.popup.hidden = true;
    this.renderLists();
    this.mapDirty = true;
    this.drawMap();
  }
  close(): void { this.sheet.hidden = true; this.popup.hidden = true; document.body.classList.remove('map-open'); }
  toggle(): void { if (this.isOpen) this.close(); else this.open(); }

  private zoom(f: number, sx = this.view.w / 2, sy = this.view.h / 2): void {
    const before = this.toWorld(this.view, sx, sy);
    this.view.s = Math.max(0.12, Math.min(4, this.view.s * f));
    const after = this.toWorld(this.view, sx, sy);
    this.view.cx += before.x - after.x; this.view.cz += before.z - after.z;
    this.popup.hidden = true;
    this.mapDirty = true;
  }

  private onDown(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: this.view.s };
      this.drag = null;
    } else this.drag = { id: e.pointerId, x: e.offsetX, y: e.offsetY, cx: this.view.cx, cz: this.view.cz, moved: false };
  }
  private onMove(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const f = (Math.hypot(a.x - b.x, a.y - b.y) || 1) / this.pinch.d;
      this.zoom(this.pinch.s * f / this.view.s, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.offsetX - d.x, dy = e.offsetY - d.y;
    if (Math.hypot(dx, dy) > 8) d.moved = true;
    if (d.moved) { this.view.cx = d.cx - dx / this.view.s; this.view.cz = d.cz - dy / this.view.s; this.mapDirty = true; this.popup.hidden = true; }
  }
  private onUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const d = this.drag;
    this.drag = null;
    if (d && d.id === e.pointerId && !d.moved) this.tap(e.offsetX, e.offsetY);
  }

  /** A tap on the map: a waypoint or place under the finger, else the spot itself. */
  tap(sx: number, sy: number): void {
    const m = this.map!, w = this.world;
    const hit = (x: number, z: number) => { const [a, b] = this.toScreen(this.view, x, z); return Math.hypot(a - sx, b - sy) <= 18; };
    const wp = [...m.waypoints.values()].find((q) => hit(q.x, q.z - 7 / this.view.s));
    const pl = wp ? null : [...m.places].map((id) => placeById(w.seed, w.params.generatorVersion, id)).find((q): q is Place => !!q && hit(q.x, q.z)) ?? null;
    const at = this.toWorld(this.view, sx, sy);
    const p = this.o.player();
    const info = (x: number, z: number) => p ? `${fmtDist(Math.hypot(x - p.x, z - p.z))} ${compass(x - p.x, z - p.z)} of you` : '';
    let html: string;
    if (wp) html = `<b>${esc(wp.name)}</b><span class="dim">waypoint · ${info(wp.x, wp.z)}</span>
      <button type="button" data-route-to="${wp.x},${wp.z}" data-label="${esc(wp.name)}" data-wp="${wp.id}">Route here</button><button type="button" data-remove="${wp.id}">Remove</button>`;
    else if (pl) html = `<b>${esc(pl.name)}</b><span class="dim">${esc(pl.note)} · ${info(pl.x, pl.z)}</span>
      <button type="button" data-route-to="${pl.x},${pl.z}" data-label="${esc(pl.name)}">Route here</button><button type="button" data-add="${pl.x},${pl.z}" data-label="${esc(pl.name)}">Add waypoint</button>`;
    else {
      const x = Math.round(at.x), z = Math.round(at.z);
      const seen = m.explored[Math.floor((z + HALF) / FOG_CELL) * FOG_N + Math.floor((x + HALF) / FOG_CELL)] === 1;
      html = `<b>${seen ? 'This spot' : 'Unexplored land'}</b><span class="dim">${info(x, z)}</span>
        <button type="button" data-route-to="${x},${z}" data-label="the marked spot">Route here</button><button type="button" data-add="${x},${z}" data-label="">Add waypoint</button>`;
    }
    this.popup.innerHTML = `${html}<button type="button" data-popup-close aria-label="Close">×</button>`;
    this.popup.hidden = false;
    const b = this.canvas.getBoundingClientRect(), sb = this.sheet.getBoundingClientRect(), pw = this.popup.offsetWidth, ph = this.popup.offsetHeight;
    this.popup.style.left = `${b.left - sb.left + Math.max(6, Math.min(b.width - pw - 6, sx - pw / 2))}px`;
    this.popup.style.top = `${b.top - sb.top + Math.max(6, Math.min(b.height - ph - 6, sy + 16))}px`;
  }

  private onSheetClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest('button');
    if (!t) return;
    if (t.matches('[data-close]')) { this.close(); return; }
    if (t.matches('[data-popup-close]')) { this.popup.hidden = true; return; }
    if (t.matches('[data-mapzoom]')) { this.zoom(t.dataset.mapzoom === 'in' ? 1.5 : 1 / 1.5); return; }
    if (t.matches('[data-centre]')) { const p = this.o.player(); if (p) { this.view.cx = p.x; this.view.cz = p.z; this.mapDirty = true; } return; }
    if (t.matches('[data-stop]')) { this.setDestination(null); this.renderLists(); return; }
    if (t.dataset.routeTo) {
      const [x, z] = t.dataset.routeTo.split(',').map(Number);
      this.setDestination({ x, z, label: t.dataset.label || 'the marked spot', ...(t.dataset.wp ? { waypointId: t.dataset.wp } : {}) });
      this.popup.hidden = true;
      return;
    }
    if (t.dataset.add) {
      const [x, z] = t.dataset.add.split(',').map(Number);
      this.addWaypoint(x, z, t.dataset.label ?? '');
      this.popup.hidden = true;
      return;
    }
    if (t.dataset.remove) { this.removeWaypoint(t.dataset.remove); this.popup.hidden = true; return; }
    if (t.dataset.focus) { const [x, z] = t.dataset.focus.split(',').map(Number); this.view.cx = x; this.view.cz = z; this.mapDirty = true; this.tap(this.view.w / 2, this.view.h / 2); }
  }

  /** A journaled waypoint; the name is the place's, or "Waypoint N". */
  addWaypoint(x: number, z: number, label: string): string | null {
    const m = this.map!;
    if (m.waypoints.size >= MAX_WAYPOINTS) { this.o.toast(`You already have ${MAX_WAYPOINTS} waypoints: remove one first`, 'warn'); return null; }
    let name = label.replace(/[^A-Za-z0-9 '.,()-]/g, '').trim().slice(0, 24).trim();
    if (!WAYPOINT_NAME.test(name)) name = `Waypoint ${m.nextWaypoint}`;
    const r = this.o.dispatch({ type: 'set_waypoint', x: Math.max(-1022, Math.min(1022, Math.round(x))), z: Math.max(-1022, Math.min(1022, Math.round(z))), name }, name);
    if (!r.ok) { this.o.toast(`Cannot add the waypoint: ${r.reasons.join('; ')}`, 'warn'); return null; }
    this.o.toast(`Waypoint "${name}" added`, 'good');
    this.mapDirty = true; this.renderLists();
    return String(r.outcome.waypointId);
  }
  removeWaypoint(id: string): boolean {
    const name = this.map!.waypoints.get(id)?.name ?? id;
    const r = this.o.dispatch({ type: 'remove_waypoint', waypointId: id }, id);
    if (!r.ok) { this.o.toast(`Cannot remove it: ${r.reasons.join('; ')}`, 'warn'); return false; }
    if (this.dest?.waypointId === id) this.setDestination(null);
    this.o.toast(`Waypoint "${name}" removed`, 'good');
    this.mapDirty = true; this.renderLists();
    return true;
  }

  private renderLists(): void {
    const m = this.map;
    if (!m) return;
    const w = this.world, p = this.o.player();
    const far = (x: number, z: number) => p ? ` · ${fmtDist(Math.hypot(x - p.x, z - p.z))} ${compass(x - p.x, z - p.z)}` : '';
    const places = [...m.places].map((id) => placeById(w.seed, w.params.generatorVersion, id)).filter((q): q is Place => !!q)
      .sort((a, b) => a.name.localeCompare(b.name));
    const wps = [...m.waypoints.values()];
    (this.sheet.querySelector('[data-map-count]') as HTMLElement).textContent = (() => { const a = exploredCount(m) * FOG_CELL * FOG_CELL; return `${a >= 1e5 ? `${(a / 1e6).toFixed(2)} km²` : `${a.toLocaleString('en')} m²`} explored`; })();
    this.lists.innerHTML = `<details open><summary>Waypoints (${wps.length}/${MAX_WAYPOINTS})</summary><ul>${wps.length ? wps.map((q) => `<li><button type="button" data-focus="${q.x},${q.z}">${esc(q.name)}<span class="dim">${far(q.x, q.z)}</span></button>`
      + `<button type="button" data-route-to="${q.x},${q.z}" data-label="${esc(q.name)}" data-wp="${q.id}" aria-label="Route to ${esc(q.name)}">Go</button><button type="button" data-remove="${q.id}" aria-label="Remove ${esc(q.name)}">×</button></li>`).join('')
      : '<li class="dim">none yet: tap the map, then Add waypoint</li>'}</ul></details>`
      + `<details${places.length ? ' open' : ''}><summary>Discovered places (${places.length})</summary><ul>${places.length ? places.map((q) => `<li><button type="button" data-focus="${q.x},${q.z}">${esc(q.name)}<span class="dim">${far(q.x, q.z)}</span></button></li>`).join('')
      : '<li class="dim">none yet: explore to find named places</li>'}</ul></details>`
      + `<details><summary>Legend</summary><ul class="legend"><li><i class="lg-fog"></i>unexplored (fog)</li><li><i class="lg-deep"></i>deep water: not walkable</li><li><i class="lg-shallow"></i>shallow water (fordable, up to 1 m)</li>`
      + `<li><i class="lg-place"></i>discovered place</li><li><i class="lg-ore"></i>ore outcrop you have seen</li><li><i class="lg-wp"></i>waypoint</li><li><i class="lg-route"></i>route (hidden over unexplored land)</li><li><i class="lg-you"></i>you</li></ul></details>`;
    this.renderStatus();
  }

  private renderStatus(): void {
    const t = this.routeText();
    this.status.innerHTML = `${esc(t)}${this.dest ? ' <button type="button" data-stop>Stop route</button>' : ''}`;
    this.status.classList.toggle('bad', !!this.refusal);
  }

  routeText(): string {
    if (!this.dest) return 'Tap the map to plan a walking route or add a waypoint.';
    if (this.refusal) return `No route to ${this.dest.label}: ${this.refusal}`;
    if (this.search) return `Planning a route to ${this.dest.label}… (${this.search.expanded} steps searched)`;
    if (!this.routeInfo) return `Route to ${this.dest.label}`;
    const left = this.remaining();
    return `Route to ${this.dest.label}: ${fmtDist(left)} to walk${this.routeInfo.wadeM ? `, wading ${this.routeInfo.wadeM} m (${this.routeInfo.fords} ford${this.routeInfo.fords === 1 ? '' : 's'}, at most 1 m deep)` : ''}. The trail shows the next ${TRAIL_AHEAD} m.`;
  }

  // ---------- routes ----------
  setDestination(d: Destination | null): void {
    this.dest = d;
    this.route = []; this.coarse = []; this.routeInfo = null; this.refusal = null; this.search = null;
    this.trail.clear(); this.trailKey = ''; this.routeVersion++;
    if (d) this.plan();
    this.mapDirty = true;
    if (this.isOpen) this.renderStatus();
  }

  private plan(): void {
    const p = this.o.player();
    if (!p || !this.dest) return;
    this.searchFrom = { x: p.x, z: p.z };
    this.search = new RouteSearch(routeGround(this.world), this.searchFrom, { x: this.dest.x, z: this.dest.z });
    this.searchT0 = performance.now();
    this.searchCpu = 0;
  }

  private stepRoute(p: { x: number; z: number } | null): void {
    if (this.search) {
      const t0 = performance.now();
      while (performance.now() - t0 < 6) if (this.search.step(150)) break;
      this.searchCpu += performance.now() - t0;
      const r = this.search.result;
      if (!r) { if (this.isOpen) this.renderStatus(); return; }
      this.search = null;
      this.stats.routeMs = Math.round(performance.now() - this.searchT0);
      this.stats.routeCpuMs = Math.round(this.searchCpu);
      this.stats.routeExpanded = r.expanded;
      this.stats.routes++;
      if (!r.ok) {
        this.refusal = r.reason;
        this.o.toast(`No route to ${this.dest?.label}: ${r.reason}`, 'warn');
      } else {
        this.routeInfo = r;
        this.coarse = r.points;
        this.route = r.points;
        this.lastRefine.at = 0;
      }
      this.routeVersion++; this.mapDirty = true;
      if (this.isOpen) this.renderStatus();
    }
    if (!p || !this.dest || !this.coarse.length) return;
    const now = performance.now();
    if (Math.hypot(p.x - this.dest.x, p.z - this.dest.z) <= ARRIVED) {
      this.o.toast(`You have arrived at ${this.dest.label}`, 'good');
      this.setDestination(null);
      return;
    }
    // Strayed from the route: plan again from here.
    if (now - this.lastStrayCheck > 500) {
      this.lastStrayCheck = now;
      if (distanceToRoute(this.route, p.x, p.z).d > STRAY) { this.stats.replans++; this.plan(); return; }
    }
    // Refine the first stretch on the live 1 m grid (every 12 m walked, at most once a second).
    if (now - this.lastRefine.at > 1000 && (!(this.lastRefine.x === this.lastRefine.x) || Math.hypot(p.x - this.lastRefine.x, p.z - this.lastRefine.z) > 12 || this.lastRefine.at === 0)) {
      const t0 = performance.now();
      const along = distanceToRoute(this.coarse, p.x, p.z);
      const rest = [{ x: p.x, z: p.z }, ...this.coarse.slice(pointAlong(this.coarse, along.s).index)];
      const loc = refineStart(this.world, { x: p.x, z: p.z }, rest);
      this.route = loc ? [...loc.path, ...rest.slice(loc.joinIndex + 1)] : rest;
      this.stats.refineMs = Math.round((performance.now() - t0) * 10) / 10;
      this.lastRefine = { at: now, x: p.x, z: p.z };
      this.routeVersion++; this.mapDirty = true;
    }
    // The trail: the next stretch from where the player is.
    const s = distanceToRoute(this.route, p.x, p.z).s;
    const key = `${this.routeVersion}:${Math.round(s / 2)}`;
    if (key !== this.trailKey) {
      this.trailKey = key;
      const start = pointAlong(this.route, s), end = pointAlong(this.route, s + TRAIL_AHEAD);
      const pts = [start.p, ...this.route.slice(start.index, end.index), end.p];
      this.trail.set(pts, this.o.groundY);
    }
  }

  private remaining(): number {
    const p = this.o.player();
    if (!p || this.route.length < 2) return 0;
    const s = distanceToRoute(this.route, p.x, p.z).s;
    let total = 0;
    for (let k = 1; k < this.route.length; k++) total += Math.hypot(this.route[k].x - this.route[k - 1].x, this.route[k].z - this.route[k - 1].z);
    return Math.max(0, total - s);
  }

  private updatePill(p: { x: number; z: number } | null): void {
    if (!this.dest || !p) { this.pill.hidden = true; return; }
    this.pill.hidden = false;
    let text: string, angle = 0;
    if (this.refusal) text = `No route: ${this.dest.label}`;
    else if (this.search || !this.route.length) text = 'Planning route…';
    else {
      const s = distanceToRoute(this.route, p.x, p.z).s;
      const ahead = pointAlong(this.route, s + 8).p;
      const f = this.o.cameraForward();
      const tx = ahead.x - p.x, tz = ahead.z - p.z;
      if (f) angle = Math.atan2(tx * -f.z + tz * f.x, tx * f.x + tz * f.z);
      text = `${fmtDist(this.remaining())} · ${this.dest.label}`;
    }
    const html = `<i style="transform:rotate(${angle.toFixed(2)}rad)">↑</i><span>${esc(text)}</span>`;
    if (this.pill.innerHTML !== html) this.pill.innerHTML = html;
    this.pill.classList.toggle('bad', !!this.refusal);
    this.pill.setAttribute('aria-label', `${this.routeText()} Tap to open the map.`);
  }

  metrics(): Record<string, unknown> {
    const m = this.map;
    const b = this.canvas.getBoundingClientRect();
    return {
      explored: m ? exploredCount(m) : 0, places: m ? [...m.places] : [], deposits: m ? m.deposits.size : 0,
      waypoints: m ? [...m.waypoints.values()].map((w) => ({ ...w })) : [], last: m?.last ?? null, queued: this.queue.length,
      minimap: this.miniShown && !this.mini.hidden, open: this.isOpen,
      view: { ...this.view, left: b.left, top: b.top },
      dest: this.dest, refusal: this.refusal, planning: !!this.search,
      route: this.routeInfo ? { length: this.routeInfo.length, fords: this.routeInfo.fords, wadeM: this.routeInfo.wadeM, points: this.route.length, remaining: Math.round(this.remaining()) } : null,
      routeText: this.routeText(), trailTriangles: this.trail.triangles, trailEnds: this.trail.ends, routePts: this.route.slice(0, 64).map((q) => [Math.round(q.x * 10) / 10, Math.round(q.z * 10) / 10]), trailVisible: this.trail.mesh.visible,
      stats: { ...this.stats, minimapMs: Math.round(this.stats.minimapMs * 100) / 100, minimapMaxMs: Math.round(this.stats.minimapMaxMs * 100) / 100, mapDrawMs: Math.round(this.stats.mapDrawMs * 10) / 10, tilesMs: Math.round(this.stats.tilesMs) },
    };
  }
}
