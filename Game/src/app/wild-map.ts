// W5: the wilderness minimap, full map, waypoints, routes and the in-world
// trail. Presentation and input only:
//  - exploration: as the player walks, a journaled `explore` report is sent
//    every EXPLORE_STEP metres when it would discover something (new fog
//    cells, a place, an ore outcrop); the simulation reveals and records;
//  - waypoints: journaled `set_waypoint` / `remove_waypoint`;
//  - routes: derived (sim/route.ts), planned in time slices, refined near the
//    player on the live 1 m grid, replanned when the player strays; never saved.
// FINAL-MAP (owner decision 4, full-world visibility): the maps draw the whole
// generated world from the start: all terrain (no fog), every generated named
// place and every generated deposit with its real type (app/map-survey.ts,
// computed off the main thread from the pure generation functions), the
// player, the waypoints and the route. Discovery records are kept and
// reported exactly as before; they only mark places visited and deposits
// found. A tap on the full map navigates there (app/map-nav.ts): it plans a
// route, replaces the single navigation waypoint and lays the yellow trail;
// an impossible spot shows why and keeps the previous route.
import * as THREE from 'three';
import type { World } from '../sim/world';
import { CHUNKS_PER_SIDE, HALF } from '../sim/world';
import { EXPLORE_STEP, MAX_WAYPOINTS, WAYPOINT_NAME, exploreGain } from '../sim/map';
import { DEPOSIT_LABEL, DEPOSIT_TYPES, DepositType, depositOf } from '../sim/deposits';
import { MINE_REACH, depositLeft } from '../sim/mining';
import type { Place } from '../sim/places';
import { placeById } from '../sim/places';
import { RoutePoint, TILE, distanceToRoute, pointAlong } from '../sim/route';
import { TrailView } from '../render/trail';
import {
  MapSurvey, OVERVIEW_PX, STRIP_ROWS, SurveyDeposit, SurveyJob, SurveyReply, SurveyRunner, TILE_PX, clusterDeposits, surveyCacheKey, tileColours,
} from './map-survey';
import { Destination, MapNavigator, NAV_WAYPOINT, Receipt, TRAIL_AHEAD } from './map-nav';

/** Map colours of the deposit types. */
export const DEPOSIT_COLOR: Record<DepositType, string> = { iron: '#c0643a', copper: '#3fae9a', coal: '#2b2b2b', clay: '#b0704a', sand: '#e8d79a', gravel: '#9a968c' };
const DEPOSIT_GLYPH: Record<DepositType, string> = { iron: 'Fe', copper: 'Cu', coal: 'C', clay: 'Cl', sand: 'S', gravel: 'G' };

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
interface Shown extends SurveyDeposit { left: number; found: boolean; sx: number; sy: number }

const TILES = 2048 / TILE;
const UNSURVEYED = '#55654c';
const MINIMAP_KEY = 'astrix:minimap:v1';
/** Below this scale (px a metre) the map draws the 4 m overview; above, the 2 m tiles over it. */
const TILE_SCALE = 0.75;
/** Below this scale deposits are drawn as clusters. */
const CLUSTER_SCALE = 0.6;

const compass = (dx: number, dz: number) => {
  const a = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(a / 45) % 8];
};
const fmtDist = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const r1 = (v: number) => Math.round(v * 10) / 10;

/** A small pool of survey workers (app/map-survey.worker.ts). */
class SurveyPool implements SurveyRunner {
  private readonly workers: Worker[] = [];
  private readonly busy: number[] = [];
  private readonly pending = new Map<number, { resolve: (r: SurveyReply) => void; reject: (e: unknown) => void; worker: number }>();
  private nextId = 1;
  failed = false;
  constructor(n: number) {
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./map-survey.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<SurveyReply & { id: number }>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id); this.busy[p.worker]--;
        p.resolve(e.data);
      };
      w.onerror = () => {
        this.failed = true;
        for (const [id, p] of this.pending) if (p.worker === i) { this.pending.delete(id); p.reject(new Error('survey worker failed')); }
      };
      this.workers.push(w); this.busy.push(0);
    }
  }
  get size(): number { return this.workers.length; }
  get inFlight(): number { return this.pending.size; }
  post(job: SurveyJob): Promise<SurveyReply> {
    if (this.failed) return Promise.reject(new Error('survey workers failed'));
    let wi = 0;
    for (let i = 1; i < this.workers.length; i++) if (this.busy[i] < this.busy[wi]) wi = i;
    const id = this.nextId++;
    this.busy[wi]++;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject, worker: wi }); this.workers[wi].postMessage({ ...job, id }); });
  }
}

export class WildMap {
  readonly trail = new TrailView();
  readonly nav: MapNavigator;
  private readonly mini: HTMLButtonElement;
  private readonly miniCanvas: HTMLCanvasElement;
  private readonly pill: HTMLButtonElement;
  private readonly sheet: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly status: HTMLElement;
  private readonly lists: HTMLElement;
  private readonly popup: HTMLElement;
  private readonly count: HTMLElement;
  private readonly tiles = new Map<number, HTMLCanvasElement>();
  private readonly pending = new Set<number>();
  private readonly tileAsked = new Set<number>();
  private survey: MapSurvey | null = null;
  private surveyKey = '';
  private pool: SurveyPool | null = null;
  private poolTried = false;
  private overviewCanvas: HTMLCanvasElement | null = null;
  private surveySaved = false;
  private surveySeen = -1;
  private view: View = { cx: 0, cz: 0, s: 1, w: 0, h: 0 };
  private miniShown = true;
  private miniDrawn = { x: NaN, z: NaN, h: NaN, key: '', at: 0 };
  private mapDirty = true;
  private listsAt = 0;
  // exploration reporting
  private lastQueued: RoutePoint | null = null;
  private readonly queue: RoutePoint[] = [];
  private refusedTick = -1;
  private navSeen = -1;
  private popupFor: string | null = null;
  private drag: { id: number; x: number; y: number; cx: number; cz: number; moved: boolean } | null = null;
  private pinch: { d: number; s: number } | null = null;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private openT0 = 0;
  readonly stats = {
    reports: 0, refused: 0, exploreMaxMs: 0, exploreLastMs: 0, lastRefusal: '', minimapMs: 0, minimapMaxMs: 0, minimapDraws: 0, mapDrawMs: 0, mapDrawMaxMs: 0, mapOpenMs: null as number | null,
    tilesMs: 0, tilesBuilt: 0, tilesFromWorkers: 0, drawnDeposits: 0, drawnClusters: 0, drawnPlaces: 0, surveyPumpMaxMs: 0,
  };

  constructor(private readonly o: WildMapOptions) {
    o.scene.add(this.trail.mesh);
    this.nav = new MapNavigator({
      world: o.world, dispatch: o.dispatch, toast: o.toast, player: o.player,
      trail: (pts) => { if (pts) this.trail.set(pts, o.groundY); else this.trail.clear(); },
    });
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
    this.count = this.sheet.querySelector('[data-map-count]')!;
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
  get dest(): Destination | null { return this.nav.dest; }
  get route(): RoutePoint[] { return this.nav.route; }
  get refusal(): string | null { return this.nav.refusal; }
  /** v6 worlds have untyped ore outcrops only; typed deposits from content v7. */
  private get typed(): boolean { return (this.world.wild?.content ?? 0) >= 7; }

  setMinimap(on: boolean): void {
    this.miniShown = on;
    try { this.o.storage?.setItem(MINIMAP_KEY, on ? '1' : '0'); } catch { /* private mode */ }
    this.applyMiniShown();
  }
  private applyMiniShown(): void { this.mini.hidden = !this.miniShown || !this.map; document.body.classList.toggle('has-minimap', !this.mini.hidden); }

  // ---------- the survey ----------
  private ensureSurvey(): MapSurvey {
    const w = this.world, gen = w.params.generatorVersion;
    const key = surveyCacheKey(w.seed, gen, w.wild?.content ?? 0);
    if (this.survey && this.surveyKey === key) return this.survey;
    if (!this.poolTried) {
      this.poolTried = true;
      const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
      if (typeof Worker !== 'undefined' && params?.get('workers') !== '0') {
        const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 2));
        try { this.pool = new SurveyPool(n); } catch { this.pool = null; }
      }
    }
    const s = new MapSurvey(w.seed, gen, this.pool);
    try { s.restore(this.o.storage?.getItem(key) ?? null); } catch { /* storage unavailable */ }
    this.surveySaved = s.stats.fromCache;
    const oc = document.createElement('canvas');
    oc.width = OVERVIEW_PX; oc.height = OVERVIEW_PX;
    const octx = oc.getContext('2d')!;
    octx.fillStyle = UNSURVEYED; octx.fillRect(0, 0, OVERVIEW_PX, OVERVIEW_PX);
    s.onStrip = (strip, rgba) => { octx.putImageData(new ImageData(new Uint8ClampedArray(rgba), OVERVIEW_PX, STRIP_ROWS), 0, strip * STRIP_ROWS); this.miniDrawn.key = ''; };
    this.overviewCanvas = oc;
    this.survey = s; this.surveyKey = key;
    this.tiles.clear(); this.pending.clear(); this.tileAsked.clear();
    return s;
  }

  private pumpSurvey(p: { x: number; z: number } | null): void {
    const s = this.ensureSurvey();
    if (this.pool?.failed && s.runner) s.runner = null;
    const t0 = performance.now();
    const focus = this.isOpen ? { x: this.view.cx, z: this.view.cz } : p ?? { x: 0, z: 0 };
    s.pump(focus, 4);
    this.stats.surveyPumpMaxMs = Math.max(this.stats.surveyPumpMaxMs, r1(performance.now() - t0));
    if (s.version !== this.surveySeen) {
      this.surveySeen = s.version;
      this.mapDirty = true; this.miniDrawn.key = '';
      if (this.isOpen && (performance.now() - this.listsAt > 1500 || s.depositsComplete)) this.renderLists();
    }
    if (!this.surveySaved && s.depositsComplete && s.places) {
      this.surveySaved = true;
      const text = s.serialize();
      try {
        const st = this.o.storage;
        if (st && text) {
          // One cached survey at a time (a few tens of kB).
          for (let i = st.length - 1; i >= 0; i--) { const k = st.key(i); if (k && k.startsWith('astrix:mapsurvey:') && k !== this.surveyKey) st.removeItem(k); }
          st.setItem(this.surveyKey, text);
        }
      } catch { /* quota or private mode: it is only a cache */ }
    }
  }

  // ---------- per frame ----------
  update(): void {
    const m = this.map;
    if (!m) { this.mini.hidden = true; return; }
    if (this.mini.hidden === this.miniShown) this.applyMiniShown();
    const p = this.o.player();
    if (p) this.reportExploration(p);
    this.pumpSurvey(p);
    this.nav.step(p);
    if (this.nav.version !== this.navSeen) { this.navSeen = this.nav.version; this.mapDirty = true; this.miniDrawn.key = ''; if (this.isOpen) { this.renderStatus(); this.refreshPopup(); } }
    else if (this.isOpen && this.nav.search) this.renderStatus();
    this.buildTiles();
    if (p && this.miniShown) this.drawMini(p);
    if (this.isOpen && this.mapDirty) this.drawMap();
    this.updatePill(p);
  }

  /**
   * W6: report the player's position now when it would discover something (a deposit within sight that the
   * map does not have yet), ahead of the walking queue. Returns true when nothing is left to discover there.
   */
  reportNow(p: { x: number; z: number }): boolean {
    const m = this.map;
    if (!m) return false;
    const g = exploreGain(this.world, m, p.x, p.z);
    if (!g.deposits.length && !g.places.length && !g.cells.length) return true;
    this.queue.unshift({ x: p.x, z: p.z });
    this.refusedTick = -1;
    this.reportExploration(p);
    return exploreGain(this.world, m, p.x, p.z).deposits.length === 0;
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
    this.stats.exploreMaxMs = Math.max(this.stats.exploreMaxMs, r1(dt)); this.stats.exploreLastMs = r1(dt);
    if (!r.ok) {
      this.stats.refused++; this.stats.lastRefusal = r.reasons.join('; ');
      if (r.code === 'implausible') { this.refusedTick = tick; return; }
      this.queue.shift();
      return;
    }
    this.queue.shift();
    this.stats.reports++;
    this.mapDirty = true; this.miniDrawn.key = '';
    const o = r.outcome as unknown as { places: string[]; deposits: string[] };
    const names = o.places.map((id) => placeById(this.world.seed, this.world.params.generatorVersion, id)?.name).filter(Boolean);
    if (names.length) this.o.toast(`You reach ${names.join(', ')}`, 'good');
    else if (o.deposits.length && this.typed) {
      const ds = o.deposits.map((id) => depositOf(this.world.seed, this.world.params.generatorVersion, id)).filter((d): d is NonNullable<typeof d> => !!d);
      this.o.toast(`You find ${ds.map((d) => `a ${DEPOSIT_LABEL[d.type]} deposit (${depositLeft(this.world, d)} units)`).join(', ')}`, 'good');
    } else if (o.deposits.length) this.o.toast(`You find ${o.deposits.length === 1 ? 'an ore outcrop' : `${o.deposits.length} ore outcrops`}`, 'good');
  }

  // ---------- terrain tiles ----------
  private tileKey(tx: number, tz: number) { return tz * TILES + tx; }
  /** Zoomed-in 2 m tiles: in the survey workers when there are any, else here (at most 6 ms a frame). */
  private buildTiles(): void {
    const w = this.world;
    if (this.pool && !this.pool.failed) {
      for (const k of this.pending) {
        if (this.tileAsked.size >= 8) break;
        this.pending.delete(k);
        if (this.tiles.has(k) || this.tileAsked.has(k)) continue;
        this.tileAsked.add(k);
        const key = this.surveyKey;
        this.pool.post({ kind: 'tile', seed: w.seed, gen: w.params.generatorVersion, tx: k % TILES, tz: Math.floor(k / TILES) }).then((r) => {
          this.tileAsked.delete(k);
          if (r.kind !== 'tile' || key !== this.surveyKey) return;
          this.tiles.set(k, this.tileCanvas(r.rgba));
          this.stats.tilesBuilt++; this.stats.tilesFromWorkers++; this.stats.tilesMs += r.ms;
          this.mapDirty = true; this.miniDrawn.key = '';
        }, () => { this.tileAsked.delete(k); });
      }
      return;
    }
    const t0 = performance.now();
    let n = 0;
    for (const k of this.pending) {
      if (n >= 4 || performance.now() - t0 > 6) break;
      this.pending.delete(k);
      if (this.tiles.has(k)) continue;
      this.tiles.set(k, this.tileCanvas(tileColours(w.seed, w.params.generatorVersion, k % TILES, Math.floor(k / TILES))));
      n++;
    }
    if (n) { this.stats.tilesBuilt += n; this.stats.tilesMs += performance.now() - t0; this.mapDirty = true; this.miniDrawn.key = ''; }
  }
  private tileCanvas(rgba: Uint8ClampedArray): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = TILE_PX; c.height = TILE_PX;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), TILE_PX, TILE_PX), 0, 0);
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

  /** The whole generated terrain: the 4 m overview, and the 2 m tiles over it when zoomed in. Outside the world: dark. */
  private drawGround(ctx: CanvasRenderingContext2D, v: View): void {
    ctx.fillStyle = '#10151b';
    ctx.fillRect(0, 0, v.w, v.h);
    const [wx0, wz0] = this.toScreen(v, -HALF, -HALF);
    ctx.imageSmoothingEnabled = v.s < 1;
    if (this.overviewCanvas) ctx.drawImage(this.overviewCanvas, wx0, wz0, 2 * HALF * v.s, 2 * HALF * v.s);
    else { ctx.fillStyle = UNSURVEYED; ctx.fillRect(wx0, wz0, 2 * HALF * v.s, 2 * HALF * v.s); }
    if (v.s < TILE_SCALE) return;
    ctx.imageSmoothingEnabled = v.s < 2;
    const a = this.toWorld(v, 0, 0), b = this.toWorld(v, v.w, v.h);
    const t0x = Math.max(0, Math.floor((a.x + HALF) / TILE)), t1x = Math.min(TILES - 1, Math.floor((b.x + HALF) / TILE));
    const t0z = Math.max(0, Math.floor((a.z + HALF) / TILE)), t1z = Math.min(TILES - 1, Math.floor((b.z + HALF) / TILE));
    const size = TILE * v.s;
    for (let tz = t0z; tz <= t1z; tz++) for (let tx = t0x; tx <= t1x; tx++) {
      const k = this.tileKey(tx, tz);
      const tile = this.tiles.get(k);
      const [sx, sy] = this.toScreen(v, -HALF + tx * TILE, -HALF + tz * TILE);
      if (tile) ctx.drawImage(tile, sx, sy, size + 0.6, size + 0.6);
      else this.pending.add(k);
    }
  }

  /** The deposits shown in a view: every generated one (removed ore outcrops excepted), worked out ones marked. */
  private shownDeposits(v: View, margin: number): Shown[] {
    const s = this.survey, w = this.world, m = this.map;
    if (!s || !m) return [];
    const a = this.toWorld(v, -margin, -margin), b = this.toWorld(v, v.w + margin, v.h + margin);
    const out: Shown[] = [];
    for (const d of s.depositsIn(a.x, a.z, b.x, b.z)) {
      if (d.id.startsWith('e:') && w.entityRemovals.has(d.id)) continue;
      if (!this.typed && !d.id.startsWith('e:')) continue;
      const [sx, sy] = this.toScreen(v, d.x, d.z);
      out.push({ ...d, left: this.typed ? depositLeft(w, d as never) : d.qty, found: m.deposits.has(d.id), sx, sy });
    }
    return out;
  }

  private depositIcon(ctx: CanvasRenderingContext2D, x: number, y: number, type: DepositType | null, r: number, out: boolean, found: boolean): void {
    ctx.fillStyle = type ? DEPOSIT_COLOR[type] : '#e0904a';
    ctx.strokeStyle = found ? '#ffffff' : type === 'coal' ? '#d8d8d8' : '#3a2410';
    ctx.lineWidth = found ? 1.6 : 1;
    ctx.beginPath();
    if (type && type !== 'iron' && type !== 'copper') ctx.rect(x - r, y - r, r * 2, r * 2); else ctx.arc(x, y, r, 0, Math.PI * 2);
    if (out) { ctx.strokeStyle = ctx.fillStyle as string; ctx.lineWidth = 2; ctx.stroke(); } else { ctx.fill(); ctx.stroke(); }
  }

  private drawOverlays(ctx: CanvasRenderingContext2D, v: View, full: boolean, p: { x: number; z: number; heading: number } | null): void {
    const m = this.map!, s = this.survey;
    const route = this.nav.route;
    if (route.length >= 2) {
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      route.forEach((q, i) => { const [x, y] = this.toScreen(v, q.x, q.z); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.strokeStyle = 'rgba(30,20,0,0.65)'; ctx.lineWidth = full ? 6 : 5; ctx.stroke();
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = full ? 3 : 2.5; ctx.stroke();
      ctx.restore();
    }
    // Every generated deposit: clustered when zoomed out.
    const shown = this.shownDeposits(v, 10);
    let clusters = 0;
    if (full && v.s < CLUSTER_SCALE) {
      const cs = clusterDeposits(shown, 26);
      clusters = cs.length;
      ctx.font = 'bold 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const c of cs) {
        const r = c.n > 1 ? 5.5 : 4;
        this.depositIcon(ctx, c.sx, c.sy, this.typed ? c.type : null, r, false, false);
        if (c.n > 1) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#10151b'; ctx.lineWidth = 3; const t = String(c.n); ctx.strokeText(t, c.sx + 9, c.sy - 6); ctx.fillText(t, c.sx + 9, c.sy - 6); }
      }
      ctx.textBaseline = 'alphabetic';
    } else {
      const r = full ? (v.s >= 2 ? 6 : 4.5) : 3;
      ctx.font = 'bold 8px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const d of shown) {
        this.depositIcon(ctx, d.sx, d.sy, this.typed ? d.type : null, r, d.left <= 0, d.found);
        if (full && v.s >= 2 && this.typed) { ctx.fillStyle = d.type === 'coal' || d.type === 'iron' ? '#fff' : '#111'; ctx.fillText(DEPOSIT_GLYPH[d.type], d.sx, d.sy + 0.5); }
      }
      ctx.textBaseline = 'alphabetic';
    }
    // Every generated place (a hollow diamond until visited).
    let placesDrawn = 0;
    ctx.font = `${full ? 13 : 10}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    for (const pl of s?.places ?? []) {
      const [x, y] = this.toScreen(v, pl.x, pl.z);
      if (x < -60 || y < -20 || x > v.w + 60 || y > v.h + 20) continue;
      placesDrawn++;
      const visited = m.places.has(pl.id);
      ctx.fillStyle = visited ? '#fff3d6' : '#f2d68a'; ctx.strokeStyle = '#2a2116'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.fill(); ctx.stroke();
      if ((full && v.s >= 0.3) || v.s >= 1.2) { ctx.fillStyle = '#fff3d6'; ctx.lineWidth = 3; ctx.strokeText(pl.name, x, y - 9); ctx.fillText(pl.name, x, y - 9); }
    }
    // Waypoints: the saved ones blue; the navigation waypoint is the yellow destination flag.
    for (const wp of m.waypoints.values()) {
      const [x, y] = this.toScreen(v, wp.x, wp.z);
      if (x < -40 || y < -40 || x > v.w + 40 || y > v.h + 40) continue;
      const navWp = wp.name === NAV_WAYPOINT;
      ctx.fillStyle = navWp ? '#ffd34d' : '#5ec8ff'; ctx.strokeStyle = navWp ? '#3a2a00' : '#06263a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y - 7, 5, 0, Math.PI * 2); ctx.moveTo(x - 3, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + 3, y - 4); ctx.fill(); ctx.stroke();
      if (full && !navWp) { ctx.fillStyle = '#d8f2ff'; ctx.strokeStyle = '#06263a'; ctx.lineWidth = 3; ctx.strokeText(wp.name, x, y - 15); ctx.fillText(wp.name, x, y - 15); }
    }
    const dest = this.nav.dest;
    if (dest && !dest.waypointId) {
      const [x, y] = this.toScreen(v, dest.x, dest.z);
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke();
    }
    // A tapped spot being planned (dashed ring) or refused (red cross).
    const cand = this.nav.search?.kind === 'candidate' ? this.nav.search.target : null;
    const rej = this.nav.rejected?.target ?? null;
    for (const [t, bad] of [[cand, false], [rej, true]] as const) {
      if (!t) continue;
      const [x, y] = this.toScreen(v, t.x, t.z);
      ctx.strokeStyle = bad ? '#ff6b5e' : '#ffd34d'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      if (bad) { ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7); ctx.moveTo(x + 7, y - 7); ctx.lineTo(x - 7, y + 7); } else { ctx.setLineDash([3, 3]); ctx.arc(x, y, 9, 0, Math.PI * 2); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    // The player: always drawn; pinned to the edge (with a ring) when out of view.
    if (p) {
      let [x, y] = this.toScreen(v, p.x, p.z);
      const off = x < 8 || y < 8 || x > v.w - 8 || y > v.h - 8;
      if (off) { x = Math.max(10, Math.min(v.w - 10, x)); y = Math.max(10, Math.min(v.h - 10, y)); }
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      ctx.save(); ctx.translate(x, y);
      if (off) { ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.strokeStyle = '#ff4f3a'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.rotate(Math.atan2(fz, fx) - Math.PI / 2);
      const r = full ? 9 : 7;
      ctx.beginPath(); ctx.moveTo(0, r); ctx.lineTo(r * 0.7, -r * 0.7); ctx.lineTo(0, -r * 0.3); ctx.lineTo(-r * 0.7, -r * 0.7); ctx.closePath();
      ctx.fillStyle = '#ff4f3a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    if (full) { this.stats.drawnDeposits = shown.length; this.stats.drawnClusters = clusters; this.stats.drawnPlaces = placesDrawn; }
  }

  private drawMini(p: { x: number; z: number; heading: number }): void {
    const now = performance.now();
    const m = this.map!;
    const key = `${this.nav.version}:${m.places.size}:${m.deposits.size}:${m.waypoints.size}:${this.stats.reports}:${this.survey?.version ?? 0}`;
    const moved = Math.hypot(p.x - this.miniDrawn.x, p.z - this.miniDrawn.z) > 0.5 || Math.abs(p.heading - this.miniDrawn.h) > 0.05;
    if ((!moved && key === this.miniDrawn.key) || now - this.miniDrawn.at < 120) return;
    const t0 = performance.now();
    const b = this.mini.getBoundingClientRect();
    const size = Math.max(40, Math.round(b.width - 4));
    const v: View = { cx: p.x, cz: p.z, s: size / 130, w: size, h: size };
    const ctx = this.prepare(this.miniCanvas, size, size);
    this.drawGround(ctx, v);
    this.drawOverlays(ctx, v, false, p);
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
    this.drawGround(ctx, this.view);
    this.drawOverlays(ctx, this.view, true, this.o.player());
    // Scale bar.
    const metres = [10, 25, 50, 100, 250, 500, 1000].find((mm) => mm * this.view.s >= 60) ?? 1000;
    ctx.fillStyle = '#fff3d6'; ctx.fillRect(12, b.height - 18, metres * this.view.s, 3);
    ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(fmtDist(metres), 12, b.height - 24);
    this.mapDirty = this.pending.size > 0 || this.tileAsked.size > 0;
    const ms = performance.now() - t0;
    this.stats.mapDrawMs = ms; this.stats.mapDrawMaxMs = Math.max(this.stats.mapDrawMaxMs, ms);
    if (this.openT0) { this.stats.mapOpenMs = r1(performance.now() - this.openT0); this.openT0 = 0; }
    this.renderCount();
  }

  private renderCount(): void {
    const s = this.survey;
    if (!s) return;
    const n = s.depositCount, pl = s.places?.length ?? 0;
    const pct = Math.floor((s.chunksDone / (CHUNKS_PER_SIDE * CHUNKS_PER_SIDE)) * 100);
    const text = s.depositsComplete ? `${n.toLocaleString('en')} deposits · ${pl} places` : `surveying deposits ${pct}% · ${n.toLocaleString('en')} so far · ${pl} places`;
    if (this.count.textContent !== text) this.count.textContent = text;
  }

  // ---------- the full map ----------
  open(): void {
    if (!this.map) return;
    this.openT0 = performance.now();
    this.ensureSurvey();
    this.sheet.hidden = false;
    document.body.classList.add('map-open');
    const p = this.o.player();
    const b = this.canvas.getBoundingClientRect();
    this.view = { cx: p?.x ?? 0, cz: p?.z ?? 0, s: Math.max(0.3, Math.min(3, Math.min(b.width, b.height) / 360)), w: b.width, h: b.height };
    this.popup.hidden = true; this.popupFor = null;
    this.renderLists();
    this.mapDirty = true;
    this.drawMap();
  }
  close(): void { this.sheet.hidden = true; this.popup.hidden = true; this.popupFor = null; document.body.classList.remove('map-open'); }
  toggle(): void { if (this.isOpen) this.close(); else this.open(); }

  private zoom(f: number, sx = this.view.w / 2, sy = this.view.h / 2): void {
    const before = this.toWorld(this.view, sx, sy);
    this.view.s = Math.max(0.12, Math.min(4, this.view.s * f));
    const after = this.toWorld(this.view, sx, sy);
    this.view.cx += before.x - after.x; this.view.cz += before.z - after.z;
    this.popup.hidden = true; this.popupFor = null;
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
    if (d.moved) { this.view.cx = d.cx - dx / this.view.s; this.view.cz = d.cz - dy / this.view.s; this.mapDirty = true; this.popup.hidden = true; this.popupFor = null; }
  }
  private onUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const d = this.drag;
    this.drag = null;
    if (d && d.id === e.pointerId && !d.moved) this.tap(e.offsetX, e.offsetY);
  }

  /** What is under a tap: a waypoint, a place, a deposit (zoomed in), or the spot itself. */
  private hitAt(sx: number, sy: number): { dest: Destination; kind: 'waypoint' | 'place' | 'deposit' | 'spot'; place?: Place; deposit?: Shown } {
    const m = this.map!, v = this.view;
    const near = (x: number, z: number, r = 18) => { const [a, b] = this.toScreen(v, x, z); return Math.hypot(a - sx, b - sy) <= r; };
    const wp = [...m.waypoints.values()].find((q) => near(q.x, q.z - 7 / v.s));
    if (wp) return { kind: 'waypoint', dest: { x: wp.x, z: wp.z, label: wp.name === NAV_WAYPOINT ? 'your destination' : wp.name, waypointId: wp.id } };
    const pl = (this.survey?.places ?? []).find((q) => near(q.x, q.z, 14));
    if (pl) return { kind: 'place', place: pl, dest: { x: pl.x, z: pl.z, label: pl.name } };
    if (v.s >= CLUSTER_SCALE) {
      let best: Shown | null = null, bd = 14;
      for (const d of this.shownDeposits(v, 20)) { const dd = Math.hypot(d.sx - sx, d.sy - sy); if (dd <= bd) { bd = dd; best = d; } }
      if (best) return { kind: 'deposit', deposit: best, dest: { x: best.x, z: best.z, label: `the ${this.typed ? DEPOSIT_LABEL[best.type] : 'ore'} deposit` } };
    }
    const at = this.toWorld(v, sx, sy);
    return { kind: 'spot', dest: { x: Math.round(at.x), z: Math.round(at.z), label: 'the marked spot' } };
  }

  /** A tap on the map: navigate there (a route, the navigation waypoint, the trail) and show what is there. */
  tap(sx: number, sy: number): void {
    const hit = this.hitAt(sx, sy);
    this.nav.go(hit.dest);
    const p = this.o.player(), d = hit.dest;
    const info = p ? `${fmtDist(Math.hypot(d.x - p.x, d.z - p.z))} ${compass(d.x - p.x, d.z - p.z)} of you` : '';
    let html: string;
    if (hit.kind === 'waypoint') {
      html = `<b>${esc(d.label)}</b><span class="dim">waypoint · ${info}</span>${d.label === 'your destination' ? '' : `<button type="button" data-remove="${d.waypointId}">Remove waypoint</button>`}`;
    } else if (hit.kind === 'place') {
      const pl = hit.place!;
      html = `<b>${esc(pl.name)}</b><span class="dim">${esc(pl.note)} · ${info}${this.map!.places.has(pl.id) ? ' · visited' : ''}</span><button type="button" data-add="${pl.x},${pl.z}" data-label="${esc(pl.name)}">Save as waypoint</button>`;
    } else if (hit.kind === 'deposit') {
      const q = hit.deposit!;
      const what = this.typed ? DEPOSIT_LABEL[q.type] : 'ore outcrop';
      html = `<b>${esc(what[0].toUpperCase() + what.slice(1))} deposit</b><span class="dim">${q.left > 0 ? `${q.left}/${q.qty} units` : 'worked out'} · ${info}${q.found ? ' · found' : ''}</span>`
        + `<span class="dim">To mine it, walk to it (within ${MINE_REACH} m) with a stone pickaxe in hand.</span><button type="button" data-add="${Math.round(q.x)},${Math.round(q.z)}" data-label="">Save as waypoint</button>`;
    } else html = `<b>This spot</b><span class="dim">${info}</span><button type="button" data-add="${d.x},${d.z}" data-label="">Save as waypoint</button>`;
    this.popupFor = `${d.x},${d.z}`;
    this.popup.innerHTML = `${html}<span class="dim" data-popup-route>${esc(this.routeText())}</span><button type="button" data-popup-close aria-label="Close">×</button>`;
    this.popup.hidden = false;
    const b = this.canvas.getBoundingClientRect(), sb = this.sheet.getBoundingClientRect(), pw = this.popup.offsetWidth, ph = this.popup.offsetHeight;
    if (b.width < 520) {
      // Phones: along the bottom edge of the map, so the next tap above it reaches the map (not the popup).
      this.popup.style.left = `${b.left - sb.left + 6}px`;
      this.popup.style.top = `${b.top - sb.top + b.height - ph - 6}px`;
    } else {
      this.popup.style.left = `${b.left - sb.left + Math.max(6, Math.min(b.width - pw - 6, sx - pw / 2))}px`;
      this.popup.style.top = `${b.top - sb.top + Math.max(6, Math.min(b.height - ph - 6, sy + 16))}px`;
    }
    this.mapDirty = true;
    this.renderStatus();
  }
  private refreshPopup(): void {
    if (this.popup.hidden || !this.popupFor) return;
    const el = this.popup.querySelector('[data-popup-route]');
    if (el) el.textContent = this.routeText();
  }

  private onSheetClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest('button');
    if (!t) return;
    if (t.matches('[data-close]')) { this.close(); return; }
    if (t.matches('[data-popup-close]')) { this.popup.hidden = true; this.popupFor = null; return; }
    if (t.matches('[data-mapzoom]')) { this.zoom(t.dataset.mapzoom === 'in' ? 1.5 : 1 / 1.5); return; }
    if (t.matches('[data-centre]')) { const p = this.o.player(); if (p) { this.view.cx = p.x; this.view.cz = p.z; this.mapDirty = true; } return; }
    if (t.matches('[data-stop]')) { this.nav.stop(); this.renderLists(); return; }
    if (t.dataset.routeTo) {
      const [x, z] = t.dataset.routeTo.split(',').map(Number);
      this.nav.go({ x, z, label: t.dataset.label || 'the marked spot', ...(t.dataset.wp ? { waypointId: t.dataset.wp } : {}) });
      this.popup.hidden = true; this.popupFor = null;
      return;
    }
    if (t.dataset.add) {
      const [x, z] = t.dataset.add.split(',').map(Number);
      this.addWaypoint(x, z, t.dataset.label ?? '');
      this.popup.hidden = true; this.popupFor = null;
      return;
    }
    if (t.dataset.remove) { this.removeWaypoint(t.dataset.remove); this.popup.hidden = true; this.popupFor = null; return; }
    if (t.dataset.focus) { const [x, z] = t.dataset.focus.split(',').map(Number); this.view.cx = x; this.view.cz = z; this.view.s = Math.max(this.view.s, 1); this.mapDirty = true; this.popup.hidden = true; this.popupFor = null; }
  }

  /** A saved (journaled) waypoint; the name is the place's, or "Waypoint N". */
  addWaypoint(x: number, z: number, label: string): string | null {
    const m = this.map!;
    if (m.waypoints.size >= MAX_WAYPOINTS) { this.o.toast(`You already have ${MAX_WAYPOINTS} waypoints: remove one first`, 'warn'); return null; }
    let name = label.replace(/[^A-Za-z0-9 '.,()-]/g, '').trim().slice(0, 24).trim();
    if (!WAYPOINT_NAME.test(name) || name === NAV_WAYPOINT) name = `Waypoint ${m.nextWaypoint}`;
    const r = this.o.dispatch({ type: 'set_waypoint', x: Math.max(-1022, Math.min(1022, Math.round(x))), z: Math.max(-1022, Math.min(1022, Math.round(z))), name }, name);
    if (!r.ok) { this.o.toast(`Cannot add the waypoint: ${r.reasons.join('; ')}`, 'warn'); return null; }
    this.o.toast(`Waypoint "${name}" saved`, 'good');
    this.mapDirty = true; this.renderLists();
    return String(r.outcome.waypointId);
  }
  removeWaypoint(id: string): boolean {
    const name = this.map!.waypoints.get(id)?.name ?? id;
    const r = this.o.dispatch({ type: 'remove_waypoint', waypointId: id }, id);
    if (!r.ok) { this.o.toast(`Cannot remove it: ${r.reasons.join('; ')}`, 'warn'); return false; }
    this.nav.forget(id);
    this.o.toast(`Waypoint "${name}" removed`, 'good');
    this.mapDirty = true; this.renderLists();
    return true;
  }

  private renderLists(): void {
    const m = this.map;
    if (!m) return;
    this.listsAt = performance.now();
    const p = this.o.player();
    const far = (x: number, z: number) => p ? ` · ${fmtDist(Math.hypot(x - p.x, z - p.z))} ${compass(x - p.x, z - p.z)}` : '';
    const dist = (x: number, z: number) => p ? Math.hypot(x - p.x, z - p.z) : 0;
    const places = [...(this.survey?.places ?? [])].sort((a, b) => dist(a.x, a.z) - dist(b.x, b.z) || a.name.localeCompare(b.name));
    const wps = [...m.waypoints.values()].filter((q) => q.name !== NAV_WAYPOINT);
    this.renderCount();
    const legendDeposits = this.typed
      ? (Object.keys(DEPOSIT_COLOR) as DepositType[]).map((t) => `<li><i class="lg-dep" style="background:${DEPOSIT_COLOR[t]}${t === 'iron' || t === 'copper' ? ';border-radius:50%' : ''}"></i>${DEPOSIT_LABEL[t]} deposit</li>`).join('')
        + '<li><i class="lg-dep lg-found"></i>white outline: a deposit you have found (been near)</li><li><i class="lg-dep lg-out"></i>worked out (hollow)</li><li><i class="lg-cluster">3</i>zoomed out: several deposits (most common type)</li>'
      : '<li><i class="lg-ore"></i>ore outcrop</li>';
    this.lists.innerHTML = `<details open><summary>Saved waypoints (${wps.length})</summary><ul>${wps.length ? wps.map((q) => `<li><button type="button" data-focus="${q.x},${q.z}">${esc(q.name)}<span class="dim">${far(q.x, q.z)}</span></button>`
      + `<button type="button" data-route-to="${q.x},${q.z}" data-label="${esc(q.name)}" data-wp="${q.id}" aria-label="Route to ${esc(q.name)}">Go</button><button type="button" data-remove="${q.id}" aria-label="Remove ${esc(q.name)}">×</button></li>`).join('')
      : '<li class="dim">none: tap the map to go somewhere, then Save as waypoint to keep it</li>'}</ul></details>`
      + `<details><summary>Places (${places.length})</summary><ul>${places.length ? places.map((q) => `<li><button type="button" data-focus="${q.x},${q.z}">${esc(q.name)}${m.places.has(q.id) ? ' ✓' : ''}<span class="dim">${far(q.x, q.z)}</span></button>`
      + `<button type="button" data-route-to="${q.x},${q.z}" data-label="${esc(q.name)}" aria-label="Route to ${esc(q.name)}">Go</button></li>`).join('')
      : '<li class="dim">surveying…</li>'}</ul></details>`
      + this.depositList(far)
      + `<details><summary>Legend</summary><ul class="legend"><li><i class="lg-you"></i>you (the arrow points where you face)</li><li><i class="lg-route"></i>your route (also the yellow trail on the ground)</li>`
      + `<li><i class="lg-dest"></i>destination (navigation waypoint)</li><li><i class="lg-wp"></i>saved waypoint</li><li><i class="lg-place"></i>named place (✓ visited)</li>${legendDeposits}`
      + '<li><i class="lg-deep"></i>lake, deep river: not walkable</li><li><i class="lg-shallow"></i>shallow water, ford: wadeable (up to 1 m)</li><li><i class="lg-beach"></i>beach, river bank</li>'
      + '<li><i class="lg-grass"></i>grassland</li><li><i class="lg-forest"></i>forest</li><li><i class="lg-rock"></i>rock, cliffs, mountains</li><li><i class="lg-snow"></i>high peaks</li></ul></details>';
    this.renderStatus();
  }

  /** The deposits nearest the player (every generated one; found ones marked). */
  private depositList(far: (x: number, z: number) => string): string {
    const w = this.world, m = this.map!, s = this.survey, p = this.o.player();
    if (!s) return '';
    const all: SurveyDeposit[] = [];
    for (const d of s.deposits()) if (!(d.id.startsWith('e:') && w.entityRemovals.has(d.id)) && (this.typed || d.id.startsWith('e:'))) all.push(d);
    const dd = (d: SurveyDeposit) => p ? Math.hypot(d.x - p.x, d.z - p.z) : 0;
    all.sort((a, b) => dd(a) - dd(b) || a.id.localeCompare(b.id));
    const counts = this.typed ? DEPOSIT_TYPES.map((t) => `${all.filter((d) => d.type === t).length} ${DEPOSIT_LABEL[t]}`).join(', ') : `${all.length} ore outcrops`;
    return `<details><summary>Deposits (${all.length}${s.depositsComplete ? '' : ', surveying…'})</summary><p class="dim">${esc(counts)}. Nearest first:</p><ul data-deposits>${all.slice(0, 40).map((d) => {
      const left = this.typed ? depositLeft(w, d as never) : d.qty;
      const label = this.typed ? DEPOSIT_LABEL[d.type] : 'ore outcrop';
      return `<li><button type="button" data-focus="${Math.round(d.x)},${Math.round(d.z)}">${label}${m.deposits.has(d.id) ? ' ✓' : ''} <span class="dim">${left ? `${left}/${d.qty} left` : 'worked out'}${far(d.x, d.z)}</span></button>`
        + `<button type="button" data-route-to="${Math.round(d.x)},${Math.round(d.z)}" data-label="the ${label} deposit" aria-label="Route to the ${label} deposit">Go</button></li>`;
    }).join('')}</ul></details>`;
  }

  private renderStatus(): void {
    const t = this.routeText();
    const html = `${esc(t)}${this.nav.dest ? ' <button type="button" data-stop>Stop route</button>' : ''}`;
    if (this.status.innerHTML !== html) this.status.innerHTML = html;
    this.status.classList.toggle('bad', !!this.nav.refusal || (!!this.nav.rejected && !this.nav.search));
  }

  routeText(): string {
    const n = this.nav, d = n.dest;
    if (n.search?.kind === 'candidate') return `Planning a route to ${n.search.target.label}… (${n.search.rs.expanded} steps searched)`;
    const rej = n.rejected ? `No route to ${n.rejected.target.label}: ${n.rejected.reason}.${d ? ' ' : ''}` : '';
    if (!d) return rej ? `${rej} Tap another spot.` : 'Tap the map to go there: a route, a waypoint and a trail on the ground.';
    if (n.refusal) return `${rej}No route to ${d.label}: ${n.refusal}`;
    if (n.search) return `${rej}Planning a route to ${d.label}… (${n.search.rs.expanded} steps searched)`;
    if (!n.routeInfo) return `${rej}Route to ${d.label}`;
    const left = n.remaining();
    return `${rej}${rej ? 'Still heading to' : 'Route to'} ${d.label}: ${fmtDist(left)} to walk${n.routeInfo.wadeM ? `, wading ${n.routeInfo.wadeM} m (${n.routeInfo.fords} ford${n.routeInfo.fords === 1 ? '' : 's'}, at most 1 m deep)` : ''}. The trail shows the next ${TRAIL_AHEAD} m.`;
  }

  // ---------- the route pill ----------
  private updatePill(p: { x: number; z: number } | null): void {
    const n = this.nav, d = n.dest;
    if (!d || !p) { this.pill.hidden = true; return; }
    this.pill.hidden = false;
    let text: string, angle = 0;
    if (n.refusal) text = `No route: ${d.label}`;
    else if ((n.search && n.search.kind === 'replan') || !n.route.length) text = 'Planning route…';
    else {
      const s = distanceToRouteS(n.route, p);
      const ahead = pointAlongP(n.route, s + 8);
      const f = this.o.cameraForward();
      const tx = ahead.x - p.x, tz = ahead.z - p.z;
      if (f) angle = Math.atan2(tx * -f.z + tz * f.x, tx * f.x + tz * f.z);
      text = `${fmtDist(n.remaining())} · ${d.label}`;
    }
    const html = `<i style="transform:rotate(${angle.toFixed(2)}rad)">↑</i><span>${esc(text)}</span>`;
    if (this.pill.innerHTML !== html) this.pill.innerHTML = html;
    this.pill.classList.toggle('bad', !!n.refusal);
    this.pill.setAttribute('aria-label', `${this.routeText()} Tap to open the map.`);
  }

  metrics(): Record<string, unknown> {
    const m = this.map, s = this.survey, n = this.nav;
    const b = this.canvas.getBoundingClientRect();
    return {
      // Discovery records (unchanged by the map): explored cells, visited places, found deposits.
      explored: m ? m.explored.reduce((a, v) => a + v, 0) : 0, places: m ? [...m.places] : [], deposits: m ? m.deposits.size : 0,
      waypoints: m ? [...m.waypoints.values()].map((w) => ({ ...w })) : [], navWaypoint: n.navWaypoint(), last: m?.last ?? null, queued: this.queue.length,
      survey: s ? {
        deposits: s.depositCount, chunksDone: s.chunksDone, places: s.places?.length ?? null, overview: s.overviewComplete, workers: this.pool?.size ?? 0, workersFailed: !!this.pool?.failed,
        ...s.stats, chunkMsTotal: Math.round(s.stats.chunkMsTotal), chunkMsMax: r1(s.stats.chunkMsMax), stripMsTotal: Math.round(s.stats.stripMsTotal), syncMsMax: r1(s.stats.syncMsMax),
      } : null,
      nearestDeposits: (() => {
        const p = this.o.player();
        if (!s || !p || !m) return [];
        return s.depositsIn(p.x - 400, p.z - 400, p.x + 400, p.z + 400).map((d) => ({ id: d.id, type: d.type, x: d.x, z: d.z, d: Math.round(Math.hypot(d.x - p.x, d.z - p.z)), found: m.deposits.has(d.id) }))
          .sort((a, c) => a.d - c.d).slice(0, 8);
      })(),
      minimap: this.miniShown && !this.mini.hidden, open: this.isOpen,
      view: { ...this.view, left: b.left, top: b.top },
      dest: n.dest, refusal: n.refusal, rejected: n.rejected, planning: !!n.search, planningKind: n.search?.kind ?? null,
      route: n.routeInfo ? { length: n.routeInfo.length, fords: n.routeInfo.fords, wadeM: n.routeInfo.wadeM, points: n.route.length, remaining: Math.round(n.remaining()) } : null,
      routeText: this.routeText(), trailTriangles: this.trail.triangles, trailEnds: this.trail.ends, routePts: n.route.slice(0, 64).map((q) => [r1(q.x), r1(q.z)]), trailVisible: this.trail.mesh.visible,
      stats: {
        ...this.stats, ...n.stats, minimapMs: Math.round(this.stats.minimapMs * 100) / 100, minimapMaxMs: Math.round(this.stats.minimapMaxMs * 100) / 100,
        mapDrawMs: r1(this.stats.mapDrawMs), mapDrawMaxMs: r1(this.stats.mapDrawMaxMs), tilesMs: Math.round(this.stats.tilesMs),
      },
    };
  }
}

const distanceToRouteS = (pts: RoutePoint[], p: { x: number; z: number }) => distanceToRoute(pts, p.x, p.z).s;
const pointAlongP = (pts: RoutePoint[], d: number) => pointAlong(pts, d).p;
