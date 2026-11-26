// FINAL-MAP: the full-world map survey. Presentation only (no DOM, no three.js).
//
// The owner's map decision: the whole generated world is visible on the map
// from the start, with every generated named place and every generated
// deposit (its real type and position), whatever the player has discovered.
// Discovery records (sim/map.ts) are not read to hide anything: they stay in
// the save and the journal as before, and only mark what the player has
// visited / found. Seeing a deposit on the map gives nothing: mining is still
// validated by the simulation (the deposit within MINE_REACH of the player, a
// pickaxe in hand, the deposit discovered by an explore report made there).
//
// Everything here is derived from the pure generation functions:
//  - deposits: sim/deposits.ts depositsInChunk for each of the 64 x 64 chunks
//    (about 15 ms a chunk, so the survey runs off the main thread in workers,
//    nearest the focus first, and the finished list is cached per seed);
//  - places: sim/places.ts allPlaces;
//  - terrain: a 512 x 512 overview image (4 m a pixel) of the base terrain
//    (water, height, slope, forest) computed in strips, and the 2 m a pixel
//    32 m tiles (tileColours) the map draws when zoomed in.
import { CHUNKS_PER_SIDE, GENERATOR_V2, HALF, WORLD_SIZE, baseHeightAt, baseWaterLevelAt, forestScore, terrainV2 } from '../sim/world';
import { DEPOSIT_TYPES, DepositType, ANY_DEPOSIT_ID, depositsInChunk } from '../sim/deposits';
import { Place, allPlaces } from '../sim/places';
import { TILE, terrainCache } from '../sim/route';

export interface SurveyDeposit { id: string; type: DepositType; x: number; z: number; qty: number }

export const SURVEY_CHUNKS = CHUNKS_PER_SIDE * CHUNKS_PER_SIDE;
/** Overview image: OVERVIEW_PX square, OVERVIEW_M metres a pixel. */
export const OVERVIEW_M = 4;
export const OVERVIEW_PX = WORLD_SIZE / OVERVIEW_M;
export const STRIP_ROWS = 32;
export const STRIPS = OVERVIEW_PX / STRIP_ROWS;
export const TILE_PX = TILE / 2;
/** Bump when the deposit or place rules change (the cache key also holds the seed, generator and content). */
export const SURVEY_CACHE_VERSION = 1;
export const surveyCacheKey = (seed: number, gen: number, content: number) => `astrix:mapsurvey:v${SURVEY_CACHE_VERSION}:seed:${seed}:gen:${gen}:c:${content}`;

// ---------- pure computations (run in a worker, or here as a fallback) ----------

export function surveyChunk(seed: number, gen: number, index: number): SurveyDeposit[] {
  const cx = index % CHUNKS_PER_SIDE, cz = Math.floor(index / CHUNKS_PER_SIDE);
  return depositsInChunk(seed, gen, cx, cz).map((d) => ({ id: d.id, type: d.type, x: d.x, z: d.z, qty: d.qty }));
}

export function surveyPlaces(seed: number, gen: number): Place[] { return allPlaces(seed, gen).map((p) => ({ ...p })); }

/** The map colour of ground of height h (top solid + 1), water depth d, local slope and forest score. */
export function groundColour(h: number, d: number, slope: number, forest: number): [number, number, number] {
  if (d > 1) { const f = Math.min(1, d / 8); return [40 - 20 * f, 92 - 40 * f, 140 - 30 * f]; }
  if (d > 0) return [96, 158, 190];
  if (h < 2) return [206, 196, 150];
  if (h >= 74) return [236, 238, 240];
  if (slope >= 3) return [128, 122, 114];
  const hi = Math.min(1, Math.max(0, (h - 20) / 50));
  let r = 100 + 40 * hi, g = 152 - 20 * hi, b = 72 + 30 * hi;
  if (forest > 0.5) { r *= 0.62; g *= 0.78; b *= 0.62; } else if (forest > 0.3) { r *= 0.82; g *= 0.9; b *= 0.82; }
  return [r, g, b];
}

/** One 32 m terrain tile at 2 m a pixel (TILE_PX square RGBA), as the W5 map drew explored tiles. */
export function tileColours(seed: number, gen: number, tx: number, tz: number): Uint8ClampedArray {
  const t = terrainCache(seed, gen).tile(tx, tz);
  const out = new Uint8ClampedArray(TILE_PX * TILE_PX * 4);
  const ox = -HALF + tx * TILE, oz = -HALF + tz * TILE;
  for (let j = 0; j < TILE_PX; j++) for (let i = 0; i < TILE_PX; i++) {
    const x = i * 2, z = j * 2, k = z * TILE + x;
    const h = t.h[k], d = t.d[k];
    const hx = t.h[z * TILE + Math.min(TILE - 1, x + 1)], hz = t.h[Math.min(TILE - 1, z + 1) * TILE + x];
    const hxm = t.h[z * TILE + Math.max(0, x - 1)], hzm = t.h[Math.max(0, z - 1) * TILE + x];
    const slope = Math.max(Math.abs(hx - h), Math.abs(hz - h), Math.abs(hxm - h), Math.abs(hzm - h));
    const [r, g, b] = groundColour(h, d, slope, d > 0 || slope >= 3 ? 0 : forestScore(ox + x, oz + z, seed));
    // Hillshade, light from the north-west.
    const shade = d > 0 ? 1 : Math.max(0.72, Math.min(1.25, 1 + ((hxm - hx) + (hzm - hz)) * 0.07));
    const p = (j * TILE_PX + i) * 4;
    out[p] = r * shade; out[p + 1] = g * shade; out[p + 2] = b * shade; out[p + 3] = 255;
  }
  return out;
}

/** Rows [s * STRIP_ROWS, (s + 1) * STRIP_ROWS) of the overview image (RGBA, OVERVIEW_PX wide). */
export function overviewStrip(seed: number, gen: number, s: number): Uint8ClampedArray {
  const v2 = gen >= GENERATOR_V2 ? terrainV2(seed) : null;
  const col = (x: number, z: number): [number, number] => {
    if (v2) { const c = v2.column(x, z); return [c.h, Math.max(0, c.level - c.h)]; }
    const h = baseHeightAt(seed, gen, x, z);
    return [h, Math.max(0, baseWaterLevelAt(seed, gen, x, z) - h)];
  };
  const W = OVERVIEW_PX, r0 = s * STRIP_ROWS;
  const rows = STRIP_ROWS + 2;
  const H = new Float32Array(rows * W), D = new Float32Array(rows * W);
  for (let j = 0; j < rows; j++) {
    const pz = Math.max(0, Math.min(OVERVIEW_PX - 1, r0 + j - 1));
    const z = -HALF + pz * OVERVIEW_M + OVERVIEW_M / 2;
    for (let i = 0; i < W; i++) { const [h, d] = col(-HALF + i * OVERVIEW_M + OVERVIEW_M / 2, z); H[j * W + i] = h; D[j * W + i] = d; }
  }
  const out = new Uint8ClampedArray(STRIP_ROWS * W * 4);
  for (let j = 0; j < STRIP_ROWS; j++) for (let i = 0; i < W; i++) {
    const k = (j + 1) * W + i;
    const h = H[k], d = D[k];
    const hx = H[k + (i < W - 1 ? 1 : 0)], hxm = H[k - (i > 0 ? 1 : 0)], hz = H[k + W], hzm = H[k - W];
    // Neighbours are 4 m apart: a 1 m cliff step (3 m) shows as about 8 m over 4 m.
    const slope = Math.max(Math.abs(hx - h), Math.abs(hz - h), Math.abs(hxm - h), Math.abs(hzm - h)) * 3 / 8;
    const x = -HALF + i * OVERVIEW_M + OVERVIEW_M / 2, z = -HALF + (r0 + j) * OVERVIEW_M + OVERVIEW_M / 2;
    const [r, g, b] = groundColour(h, d, slope, d > 0 || slope >= 3 ? 0 : forestScore(x, z, seed));
    const shade = d > 0 ? 1 : Math.max(0.72, Math.min(1.25, 1 + ((hxm - hx) + (hzm - hz)) * 0.07 / 4));
    const p = (j * W + i) * 4;
    out[p] = r * shade; out[p + 1] = g * shade; out[p + 2] = b * shade; out[p + 3] = 255;
  }
  return out;
}

// ---------- the survey worker's column memo ----------

/**
 * Survey workers only: memoize the v2 generator's `column(x, z)` of this seed in this JavaScript realm (a
 * worker has its own copy of the modules; the simulation on the main thread is never touched). `column` is a
 * pure function of (seed, x, z) and every caller only reads its result, so every value computed through it is
 * identical; the deposit rules sample the same columns many times over (neighbours, water within a few metres),
 * so this saves most of their cost. Bounded: forgotten wholesale past `cap` entries. Returns the hit counters.
 */
export function memoizeColumns(seed: number, cap = 400_000): { hits: number; misses: number } {
  const stats = { hits: 0, misses: 0 };
  const t = terrainV2(seed) as unknown as { column: (x: number, z: number) => unknown; __memo?: { hits: number; misses: number } };
  if (t.__memo) return t.__memo;
  const orig = t.column.bind(t);
  let cache = new Map<number, unknown>();
  t.column = (x: number, z: number) => {
    const k = (x + 8192) * 16384 + (z + 8192);
    let c = cache.get(k);
    if (c === undefined) {
      stats.misses++;
      c = orig(x, z);
      if (cache.size >= cap) cache = new Map();
      cache.set(k, c);
    } else stats.hits++;
    return c;
  };
  // Its v1 height input too (also pure; called again by the neighbours' columns).
  const tv = t as unknown as { v1: (s: number, x: number, z: number) => number };
  const v1 = tv.v1;
  let hcache = new Map<number, number>();
  tv.v1 = (s: number, x: number, z: number) => {
    if (s !== seed || !Number.isInteger(x) || !Number.isInteger(z)) return v1(s, x, z);
    const k = (x + 8192) * 16384 + (z + 8192);
    let h = hcache.get(k);
    if (h === undefined) { h = v1(s, x, z); if (hcache.size >= cap) hcache = new Map(); hcache.set(k, h); }
    return h;
  };
  t.__memo = stats;
  return stats;
}

// ---------- jobs (worker protocol) ----------

export type SurveyJob =
  | { kind: 'deposits'; seed: number; gen: number; chunks: number[] }
  | { kind: 'strip'; seed: number; gen: number; strip: number }
  | { kind: 'places'; seed: number; gen: number }
  | { kind: 'tile'; seed: number; gen: number; tx: number; tz: number };
export type SurveyReply =
  | { kind: 'deposits'; chunks: number[]; deposits: SurveyDeposit[][]; ms: number[] }
  | { kind: 'strip'; strip: number; rgba: Uint8ClampedArray; ms: number }
  | { kind: 'places'; places: Place[]; ms: number }
  | { kind: 'tile'; tx: number; tz: number; rgba: Uint8ClampedArray; ms: number };

export function runSurveyJob(job: SurveyJob): SurveyReply {
  const t0 = performance.now();
  switch (job.kind) {
    case 'deposits': {
      const ms: number[] = [];
      const deposits = job.chunks.map((c) => { const a = performance.now(); const r = surveyChunk(job.seed, job.gen, c); ms.push(performance.now() - a); return r; });
      return { kind: 'deposits', chunks: job.chunks, deposits, ms };
    }
    case 'strip': return { kind: 'strip', strip: job.strip, rgba: overviewStrip(job.seed, job.gen, job.strip), ms: performance.now() - t0 };
    case 'places': return { kind: 'places', places: surveyPlaces(job.seed, job.gen), ms: performance.now() - t0 };
    case 'tile': return { kind: 'tile', tx: job.tx, tz: job.tz, rgba: tileColours(job.seed, job.gen, job.tx, job.tz), ms: performance.now() - t0 };
  }
}

/** Runs jobs somewhere (a worker pool); null = run them here, one at a time, within the frame budget. */
export interface SurveyRunner { readonly size: number; post(job: SurveyJob): Promise<SurveyReply> }

// ---------- the survey ----------

/** Deposits within this distance of the focus come before the rest of the overview. */
export const NEAR_M = 200;
const chunkCentre = (i: number) => ({ x: -HALF + (i % CHUNKS_PER_SIDE) * 32 + 16, z: -HALF + Math.floor(i / CHUNKS_PER_SIDE) * 32 + 16 });

/**
 * The world's generated deposits, places and overview terrain, filled in
 * progressively (nearest the focus first). `version` changes whenever
 * something new arrived, so views know when to redraw.
 */
export class MapSurvey {
  readonly chunks: Array<SurveyDeposit[] | undefined> = new Array(SURVEY_CHUNKS);
  places: Place[] | null = null;
  readonly overview = new Uint8ClampedArray(OVERVIEW_PX * OVERVIEW_PX * 4);
  readonly strips = new Uint8Array(STRIPS);
  version = 0;
  chunksDone = 0;
  depositCount = 0;
  private readonly asked = new Uint8Array(SURVEY_CHUNKS);
  private readonly stripAsked = new Uint8Array(STRIPS);
  private placesAsked = false;
  private inFlight = 0;
  readonly t0 = performance.now();
  readonly stats = { chunkMsTotal: 0, chunkMsMax: 0, stripMsTotal: 0, placesMs: 0, overviewDoneMs: null as number | null, depositsDoneMs: null as number | null, nearDoneMs: null as number | null, fromCache: false, syncMsMax: 0 };
  /** Called with each strip as it arrives (to paint it into a canvas). */
  onStrip: ((strip: number, rgba: Uint8ClampedArray) => void) | null = null;
  private nearFocus: { x: number; z: number } | null = null;

  constructor(readonly seed: number, readonly gen: number, public runner: SurveyRunner | null = null) {}

  get depositsComplete(): boolean { return this.chunksDone === SURVEY_CHUNKS; }
  get overviewComplete(): boolean { return this.stats.overviewDoneMs !== null; }
  get complete(): boolean { return this.depositsComplete && this.overviewComplete && !!this.places; }

  /** Every surveyed deposit so far. */
  *deposits(): Iterable<SurveyDeposit> { for (const c of this.chunks) if (c) yield* c; }

  /** Surveyed deposits inside a world rectangle (metres). */
  depositsIn(x0: number, z0: number, x1: number, z1: number): SurveyDeposit[] {
    const out: SurveyDeposit[] = [];
    const c0x = Math.max(0, Math.floor((x0 + HALF) / 32)), c1x = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((x1 + HALF) / 32));
    const c0z = Math.max(0, Math.floor((z0 + HALF) / 32)), c1z = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((z1 + HALF) / 32));
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const c = this.chunks[cz * CHUNKS_PER_SIDE + cx];
      if (c) for (const d of c) if (d.x >= x0 && d.x <= x1 && d.z >= z0 && d.z <= z1) out.push(d);
    }
    return out;
  }

  private acceptChunk(i: number, list: SurveyDeposit[], ms: number): void {
    if (this.chunks[i]) return;
    this.chunks[i] = list;
    this.chunksDone++;
    this.depositCount += list.length;
    this.stats.chunkMsTotal += ms; this.stats.chunkMsMax = Math.max(this.stats.chunkMsMax, ms);
    if (this.depositsComplete) this.stats.depositsDoneMs = Math.round(performance.now() - this.t0);
    this.version++;
  }
  private acceptStrip(s: number, rgba: Uint8ClampedArray, ms: number): void {
    if (this.strips[s]) return;
    this.overview.set(rgba, s * STRIP_ROWS * OVERVIEW_PX * 4);
    this.strips[s] = 1;
    this.stats.stripMsTotal += ms;
    if (this.strips.every((v) => v === 1)) this.stats.overviewDoneMs = Math.round(performance.now() - this.t0);
    this.onStrip?.(s, rgba);
    this.version++;
  }
  private acceptPlaces(p: Place[], ms: number): void { if (!this.places) { this.places = p; this.stats.placesMs = Math.round(ms); this.version++; } }

  private accept(r: SurveyReply): void {
    if (r.kind === 'deposits') r.chunks.forEach((c, k) => this.acceptChunk(c, r.deposits[k], r.ms[k]));
    else if (r.kind === 'strip') this.acceptStrip(r.strip, r.rgba, r.ms);
    else if (r.kind === 'places') this.acceptPlaces(r.places, r.ms);
  }

  /**
   * The next job: the places; the overview strip under the focus; the deposits within NEAR_M of the focus
   * (nearest first); the rest of the overview; then every other deposit chunk, nearest first.
   */
  private nextJob(focus: { x: number; z: number }, nearBatch: number, farBatch = nearBatch): SurveyJob | null {
    const base = { seed: this.seed, gen: this.gen };
    if (!this.placesAsked) { this.placesAsked = true; return { kind: 'places', ...base }; }
    const fz = (focus.z + HALF) / OVERVIEW_M;
    const strip = (within: number): SurveyJob | null => {
      let bs = -1, bd = Infinity;
      for (let s = 0; s < STRIPS; s++) {
        if (this.stripAsked[s]) continue;
        const d = Math.abs((s + 0.5) * STRIP_ROWS - fz);
        if (d < bd && d <= within) { bd = d; bs = s; }
      }
      if (bs < 0) return null;
      this.stripAsked[bs] = 1;
      return { kind: 'strip', ...base, strip: bs };
    };
    const chunks = (within: number, batch: number): SurveyJob | null => {
      const picks: Array<{ i: number; d: number }> = [];
      const w2 = within * within;
      for (let i = 0; i < SURVEY_CHUNKS; i++) {
        if (this.asked[i]) continue;
        const c = chunkCentre(i), d = (c.x - focus.x) ** 2 + (c.z - focus.z) ** 2;
        if (d > w2) continue;
        if (picks.length < batch) { picks.push({ i, d }); picks.sort((a, b) => a.d - b.d); }
        else if (d < picks[batch - 1].d) { picks[batch - 1] = { i, d }; picks.sort((a, b) => a.d - b.d); }
      }
      if (!picks.length) return null;
      for (const p of picks) this.asked[p.i] = 1;
      return { kind: 'deposits', ...base, chunks: picks.map((p) => p.i) };
    };
    return strip(STRIP_ROWS) ?? chunks(NEAR_M, nearBatch) ?? strip(Infinity) ?? chunks(Infinity, farBatch);
  }

  /**
   * Keep the survey going (call every frame). With workers: keeps each one busy. Without: computes here
   * for at most `budgetMs` (one chunk can exceed it; only tests and Worker-less browsers take this path).
   */
  pump(focus: { x: number; z: number }, budgetMs = 4): void {
    if (this.complete) return;
    this.noteNear(focus);
    if (this.runner) { this.focus = focus; this.feed(); return; }
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      const job = this.nextJob(focus, 1);
      if (!job) break;
      const a = performance.now();
      this.accept(runSurveyJob(job));
      this.stats.syncMsMax = Math.max(this.stats.syncMsMax, performance.now() - a);
    }
  }
  private focus = { x: 0, z: 0 };
  /** Keep every worker busy: a finished job posts the next one at once (not on the next frame). */
  private feed(): void {
    const runner = this.runner;
    if (!runner) return;
    // Small jobs near the focus (they arrive first), bigger ones farther out: fewer round trips through a
    // busy main thread (a reply is handled between frames).
    while (this.inFlight < runner.size * 3) {
      const job = this.nextJob(this.focus, 4, 24);
      if (!job) break;
      this.inFlight++;
      runner.post(job).then((r) => { this.inFlight--; this.accept(r); this.noteNear(this.focus); this.feed(); }, () => { this.inFlight--; this.unask(job); });
    }
  }
  private unask(job: SurveyJob): void {
    if (job.kind === 'deposits') for (const c of job.chunks) this.asked[c] = this.chunks[c] ? 1 : 0;
    else if (job.kind === 'strip') this.stripAsked[job.strip] = this.strips[job.strip];
    else if (job.kind === 'places') this.placesAsked = !!this.places;
  }
  /** When the 300 m around the first focus are surveyed (the minimap's and the opening map's neighbourhood). */
  private noteNear(focus: { x: number; z: number }): void {
    if (this.stats.nearDoneMs !== null) return;
    this.nearFocus ??= { ...focus };
    const f = this.nearFocus;
    const c0x = Math.max(0, Math.floor((f.x - 300 + HALF) / 32)), c1x = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((f.x + 300 + HALF) / 32));
    const c0z = Math.max(0, Math.floor((f.z - 300 + HALF) / 32)), c1z = Math.min(CHUNKS_PER_SIDE - 1, Math.floor((f.z + 300 + HALF) / 32));
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) if (!this.chunks[cz * CHUNKS_PER_SIDE + cx]) return;
    this.stats.nearDoneMs = Math.round(performance.now() - this.t0);
  }

  /** Run everything to completion here (tests and tools). */
  runAll(): void {
    for (;;) {
      const job = this.nextJob({ x: 0, z: 0 }, 16);
      if (!job) break;
      this.accept(runSurveyJob(job));
    }
  }

  // ---------- the per-seed cache of the finished deposit and place lists ----------

  /** The finished deposit and place lists as a compact string, or null while incomplete. */
  serialize(): string | null {
    if (!this.depositsComplete || !this.places) return null;
    const d: Array<[string, number, number, number, number]> = [];
    for (const x of this.deposits()) d.push([x.id, DEPOSIT_TYPES.indexOf(x.type), x.x, x.z, x.qty]);
    return JSON.stringify({ v: SURVEY_CACHE_VERSION, seed: this.seed, gen: this.gen, d, p: this.places });
  }

  /** Adopt a cached list (strictly checked; anything odd and it is ignored). Returns whether it was used. */
  restore(text: string | null): boolean {
    if (!text || this.chunksDone) return false;
    try {
      const o = JSON.parse(text) as { v: number; seed: number; gen: number; d: unknown[]; p: unknown[] };
      if (o.v !== SURVEY_CACHE_VERSION || o.seed !== this.seed || o.gen !== this.gen || !Array.isArray(o.d) || !Array.isArray(o.p)) return false;
      const chunks: SurveyDeposit[][] = Array.from({ length: SURVEY_CHUNKS }, () => []);
      for (const e of o.d) {
        if (!Array.isArray(e) || e.length !== 5) return false;
        const [id, t, x, z, q] = e as [unknown, unknown, unknown, unknown, unknown];
        if (typeof id !== 'string' || !ANY_DEPOSIT_ID.test(id) || typeof t !== 'number' || !DEPOSIT_TYPES[t] || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isSafeInteger(q)) return false;
        const m = /^[ek]:(\d+),(\d+):/.exec(id)!;
        const ci = Number(m[2]) * CHUNKS_PER_SIDE + Number(m[1]);
        if (ci >= SURVEY_CHUNKS) return false;
        chunks[ci].push({ id, type: DEPOSIT_TYPES[t], x: x as number, z: z as number, qty: q as number });
      }
      const places: Place[] = [];
      for (const p of o.p as Array<Record<string, unknown>>) {
        if (!p || typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.kind !== 'string' || typeof p.note !== 'string' || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return false;
        places.push({ id: p.id, kind: p.kind as Place['kind'], name: p.name, note: p.note, x: p.x as number, z: p.z as number });
      }
      for (let i = 0; i < SURVEY_CHUNKS; i++) { this.chunks[i] = chunks[i]; this.asked[i] = 1; this.depositCount += chunks[i].length; }
      this.chunksDone = SURVEY_CHUNKS;
      this.places = places; this.placesAsked = true;
      this.stats.fromCache = true;
      this.stats.depositsDoneMs = Math.round(performance.now() - this.t0);
      this.version++;
      return true;
    } catch { return false; }
  }
}

/** Deposits as the map shows them: every generated one; discovery only marks "found", working marks "worked out". */
export interface MapDeposit extends SurveyDeposit { left: number; found: boolean }

/**
 * Screen-space clusters of deposits (low zoom): one icon per `cell` px square, its most common type and the count.
 * Points are given in screen pixels already.
 */
export function clusterDeposits<T extends { type: DepositType; sx: number; sy: number }>(pts: T[], cell: number): Array<{ sx: number; sy: number; type: DepositType; n: number; types: Partial<Record<DepositType, number>> }> {
  const bins = new Map<number, { sx: number; sy: number; n: number; types: Partial<Record<DepositType, number>> }>();
  for (const p of pts) {
    const k = Math.floor(p.sy / cell) * 100000 + Math.floor(p.sx / cell);
    let b = bins.get(k);
    if (!b) { b = { sx: 0, sy: 0, n: 0, types: {} }; bins.set(k, b); }
    b.sx += p.sx; b.sy += p.sy; b.n++; b.types[p.type] = (b.types[p.type] ?? 0) + 1;
  }
  return [...bins.values()].map((b) => {
    let type: DepositType = 'iron', best = -1;
    for (const t of DEPOSIT_TYPES) if ((b.types[t] ?? 0) > best) { best = b.types[t] ?? 0; type = t; }
    return { sx: b.sx / b.n, sy: b.sy / b.n, type, n: b.n, types: b.types };
  });
}
