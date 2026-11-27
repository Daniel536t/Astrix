// M015 opt-in performance monitor (`?perf=1`). Presentation only: it reads
// frame timings and renderer counters and never touches simulation state,
// the journal or the settlement save. Off by default; with the flag absent
// none of this runs.
//
// The session log has one bucket per 10 s of play: fps (mean and 5th
// percentile), frame time p50/p95, frames over 50 ms, JS heap, battery,
// page visibility, the scene (mode, 48 m map cell, zoom band) and draw
// calls / triangles. A thermal indicator compares later buckets with the
// first two minutes in the same scene. The log survives a reload in the same
// tab (sessionStorage) so an Android reload under memory pressure shows up as
// an event instead of losing the run.

export const BUCKET_MS = 10_000;
/** Frames longer than this count as long frames. */
export const LONG_FRAME_MS = 50;
/** Thermal baseline: buckets in the first two minutes (after the first 20 s of loading). */
export const BASELINE_FROM_S = 20;
export const BASELINE_UNTIL_S = 120;
export const REPORT_VERSION = 1;
export const PERF_SESSION_KEY = 'astrix:perf:session:v1';
/** Frame-time histogram: 1 ms bins up to 1 s. */
export const HISTOGRAM_BINS = 1001;

export interface FrameSummary {
  frames: number;
  /** Frames per second over the summed frame intervals. */
  fps: number;
  /** 5th percentile of per-frame fps (= 1000 / p95 frame time). */
  fpsP5: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  long50: number;
}

const round = (v: number, d = 1) => { const k = 10 ** d; return Math.round(v * k) / k; };

/** Nearest-rank percentile of an ascending array. */
export function percentile(sorted: ArrayLike<number>, q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}

/** Summary of frame intervals (ms). */
export function summarizeFrames(intervals: ArrayLike<number>): FrameSummary {
  const n = intervals.length;
  if (n === 0) return { frames: 0, fps: 0, fpsP5: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, long50: 0 };
  const s = Float64Array.from(intervals as ArrayLike<number>).sort();
  let sum = 0, long = 0;
  for (let i = 0; i < n; i++) { sum += s[i]; if (s[i] > LONG_FRAME_MS) long++; }
  const p95 = percentile(s, 0.95);
  return { frames: n, fps: round(sum > 0 ? (n * 1000) / sum : 0), fpsP5: round(p95 > 0 ? 1000 / p95 : 0),
    p50Ms: round(percentile(s, 0.5)), p95Ms: round(p95), maxMs: round(s[n - 1]), long50: long };
}

export interface SceneInfo {
  mode: 'walk' | 'builder' | 'other';
  /** Camera target position (m). */
  x: number;
  z: number;
  /** Camera distance (m). */
  distance: number;
}

/** A coarse scene key: same mode, same 48 m map cell, same zoom band. */
export function sceneKey(s: SceneInfo): string {
  const band = s.distance < 15 ? 'close' : s.distance < 90 ? 'mid' : 'far';
  return `${s.mode}:${Math.floor(s.x / 48)},${Math.floor(s.z / 48)}:${band}`;
}

export interface BucketContext {
  scene: string;
  calls: number;
  triangles: number;
  heapMB: number | null;
  battery: { level: number; charging: boolean } | null;
  quality: string;
  path: 'multi-draw' | 'fallback';
  /** Frame-rate cap in force (fps; 0 = unlimited). */
  cap?: number;
}

export interface PerfBucket extends FrameSummary {
  /** Index in the session. */
  i: number;
  /** Seconds since the session started, at the start of the bucket. */
  t: number;
  /** Wall-clock length (s). */
  dur: number;
  /** Fraction of the bucket the page was visible. */
  visible: number;
  scene: string;
  calls: number;
  triangles: number;
  heapMB: number | null;
  battery: number | null;
  charging: boolean | null;
  quality: string;
  path: string;
  /** Frame-rate cap in force at the end of the bucket (fps; 0 = unlimited). Absent in reports before M015 fix 1. */
  cap?: number;
}

/**
 * Collects frame intervals into 10 s buckets. Pure (no DOM, no clocks): the
 * caller passes timestamps, so tests can drive it with synthetic frames.
 */
export class BucketRecorder {
  readonly buckets: PerfBucket[] = [];
  private intervals: number[] = [];
  private bucketStart: number;
  private hiddenMs = 0;
  private hiddenSince: number | null = null;
  /** Whole-session histogram of frame intervals, 1 ms bins (the last bin holds 1000 ms and over). */
  readonly histogram = new Uint32Array(HISTOGRAM_BINS);

  /**
   * `elapsedS`: a restored session's clock when it was saved (a reload loses the open bucket, so the
   * clock continues from whichever is later, the last bucket's end or the saved time).
   */
  constructor(readonly startMs: number, buckets: PerfBucket[] = [], elapsedS = 0) {
    this.buckets.push(...buckets);
    const last = buckets.at(-1);
    this.bucketStart = startMs;
    this.offsetS = Math.max(last ? last.t + last.dur : 0, elapsedS);
  }

  /** Seconds already recorded before this recorder started (a restored session). */
  private offsetS = 0;

  /** Seconds since the session started (including a restored session's earlier buckets). */
  sessionSeconds(nowMs: number): number { return this.offsetS + (nowMs - this.startMs) / 1000; }

  /** One frame interval (ms). Intervals that span a hidden period are not frames and are skipped. */
  frame(intervalMs: number): void {
    if (!(intervalMs > 0) || intervalMs > 5000) return;
    this.intervals.push(intervalMs);
    this.histogram[Math.min(HISTOGRAM_BINS - 1, Math.floor(intervalMs))]++;
  }

  visibility(visible: boolean, nowMs: number): void {
    if (!visible && this.hiddenSince === null) this.hiddenSince = nowMs;
    if (visible && this.hiddenSince !== null) { this.hiddenMs += nowMs - this.hiddenSince; this.hiddenSince = null; }
  }

  /** Close the bucket when 10 s have passed. Returns the closed bucket, if any. */
  poll(nowMs: number, ctx: () => BucketContext): PerfBucket | null {
    if (nowMs - this.bucketStart < BUCKET_MS) return null;
    return this.close(nowMs, ctx());
  }

  close(nowMs: number, c: BucketContext): PerfBucket {
    const dur = Math.max(1, nowMs - this.bucketStart);
    const hidden = this.hiddenMs + (this.hiddenSince !== null ? nowMs - this.hiddenSince : 0);
    const b: PerfBucket = {
      i: this.buckets.length, t: round(this.offsetS + (this.bucketStart - this.startMs) / 1000), dur: round(dur / 1000),
      visible: round(Math.max(0, 1 - hidden / dur), 2), ...summarizeFrames(this.intervals),
      scene: c.scene, calls: c.calls, triangles: c.triangles, heapMB: c.heapMB,
      battery: c.battery ? round(c.battery.level, 2) : null, charging: c.battery ? c.battery.charging : null, quality: c.quality, path: c.path,
      ...(c.cap !== undefined ? { cap: c.cap } : {}),
    };
    this.buckets.push(b);
    this.intervals = [];
    this.bucketStart = nowMs;
    this.hiddenMs = 0;
    if (this.hiddenSince !== null) this.hiddenSince = nowMs;
    return b;
  }

  /** Session percentile of frame time from the histogram (ms, 1 ms resolution). */
  sessionPercentile(q: number): number {
    let total = 0;
    for (const n of this.histogram) total += n;
    if (!total) return 0;
    const want = Math.ceil(q * total);
    let acc = 0;
    for (let i = 0; i < this.histogram.length; i++) { acc += this.histogram[i]; if (acc >= want) return i + 1; }
    return HISTOGRAM_BINS;
  }
}

export interface ThermalResult {
  status: 'unknown' | 'ok' | 'warming' | 'throttling';
  /** Scene compared (the baseline scene with the most later buckets). */
  scene: string | null;
  baselineFps: number | null;
  laterFps: number | null;
  /** Fps lost relative to the baseline, percent (positive = slower). */
  driftPct: number | null;
  baselineBuckets: number;
  laterBuckets: number;
  note: string;
}

/**
 * Thermal-throttling indicator from fps drift: the mean fps of visible
 * buckets in the first two minutes (from 20 s, after loading) against the
 * most recent (up to 6) visible buckets after two minutes in the same scene.
 * Under 10 % is ok, 10-25 % warming, over 25 % throttling. A scene that was
 * never revisited gives "unknown".
 */
export function thermalDrift(buckets: readonly PerfBucket[]): ThermalResult {
  const usable = buckets.filter((b) => b.visible >= 0.9 && b.frames > 0);
  const base = usable.filter((b) => b.t >= BASELINE_FROM_S && b.t < BASELINE_UNTIL_S);
  const later = usable.filter((b) => b.t >= BASELINE_UNTIL_S);
  const none = (note: string): ThermalResult => ({ status: 'unknown', scene: null, baselineFps: null, laterFps: null, driftPct: null, baselineBuckets: base.length, laterBuckets: later.length, note });
  if (!base.length) return none('no baseline yet: the first two minutes are the baseline');
  let best: { scene: string; b: PerfBucket[]; l: PerfBucket[] } | null = null;
  for (const scene of new Set(base.map((b) => b.scene))) {
    const l = later.filter((x) => x.scene === scene);
    if (l.length && (!best || l.length > best.l.length)) best = { scene, b: base.filter((x) => x.scene === scene), l };
  }
  if (!best) return none('the baseline scene has not been revisited after two minutes (go back to where you started and stand still for a minute)');
  const mean = (xs: PerfBucket[]) => xs.reduce((a, x) => a + x.fps, 0) / xs.length;
  const recent = best.l.slice(-6);
  const bf = mean(best.b), lf = mean(recent);
  const drift = bf > 0 ? ((bf - lf) / bf) * 100 : 0;
  const status = drift > 25 ? 'throttling' : drift >= 10 ? 'warming' : 'ok';
  return { status, scene: best.scene, baselineFps: round(bf), laterFps: round(lf), driftPct: round(drift), baselineBuckets: best.b.length, laterBuckets: recent.length,
    note: `${recent.length} recent bucket(s) at ${best.scene} against ${best.b.length} in the first two minutes` };
}

export interface DeviceInfo {
  userAgent: string;
  platform: string | null;
  screen: { width: number; height: number; availWidth: number; availHeight: number; orientation: string | null };
  viewport: { width: number; height: number };
  dpr: number;
  hardwareConcurrency: number | null;
  deviceMemory: number | null;
  gpu: string | null;
  gpuVendor: string | null;
  webgl2: boolean;
  multiDrawSupported: boolean;
  maxTextureSize: number | null;
  touch: boolean;
  /** navigator.maxTouchPoints and any-pointer: coarse (M015: the quality heuristic reads them). */
  maxTouchPoints?: number;
  anyCoarse?: boolean;
}

export interface PerfEvent { t: number; kind: string; detail?: string }

export interface PerfReport {
  kind: 'astrix-perf-report';
  version: number;
  build: { commit: string; dirty: boolean; bundle: string | null; url: string };
  createdAt: string;
  startedAt: string;
  durationS: number;
  device: DeviceInfo;
  render: { path: 'multi-draw' | 'fallback'; quality: string; qualitySource: string; qualityReasons: string[]; pixelRatio: number; canvas: { width: number; height: number };
    /** Frame-rate cap in force when the report was made (fps; 0 = unlimited) and where it came from. */
    frameCap?: number; frameCapSource?: string };
  summary: {
    buckets: number;
    visibleBuckets: number;
    medianFps: number;
    minBucketFps: number;
    fpsP5Median: number;
    frameP50Ms: number;
    frameP95Ms: number;
    longFrames50: number;
    maxCalls: number;
    maxTriangles: number;
    heapMB: { first: number | null; last: number | null; max: number | null };
    battery: { first: number | null; last: number | null; charging: boolean | null; dropPctPerHour: number | null };
  };
  thermal: ThermalResult;
  checks: Record<string, { ok: boolean | null; value: number | string | null; threshold: string }>;
  events: PerfEvent[];
  buckets: PerfBucket[];
}

/** Proposed pass thresholds (DEVICE_TEST_PLAN.md). */
export const THRESHOLDS = { medianFps: 30, frameP95Ms: 50, maxDriftPct: 25 } as const;

/** The median-fps pass mark: 30 fps, or 95 % of a lower frame cap. */
export function medianFpsThreshold(cap: number): number {
  return cap > 0 ? Math.min(THRESHOLDS.medianFps, round(cap * 0.95)) : THRESHOLDS.medianFps;
}

const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function buildReport(o: {
  build: PerfReport['build']; device: DeviceInfo; render: PerfReport['render'];
  startedAt: string; createdAt: string; buckets: readonly PerfBucket[]; events: readonly PerfEvent[];
  /** Session frame-time p50/p95 from the histogram; defaults to the bucket medians. */
  sessionP50?: number; sessionP95?: number;
}): PerfReport {
  const b = o.buckets;
  const vis = b.filter((x) => x.visible >= 0.9 && x.frames > 0);
  const last = b.at(-1);
  const heaps = b.map((x) => x.heapMB).filter((x): x is number => x !== null);
  const bats = b.filter((x) => x.battery !== null);
  const durationS = last ? round(last.t + last.dur) : 0;
  const batFirst = bats[0]?.battery ?? null, batLast = bats.at(-1)?.battery ?? null;
  const batSpan = bats.length > 1 ? (bats.at(-1)!.t - bats[0].t) / 3600 : 0;
  const discharging = bats.length > 1 && bats.every((x) => x.charging === false);
  const thermal = thermalDrift(b);
  const medianFps = round(median(vis.map((x) => x.fps)));
  const p95 = o.sessionP95 ?? round(median(vis.map((x) => x.p95Ms)));
  const summary: PerfReport['summary'] = {
    buckets: b.length, visibleBuckets: vis.length, medianFps, minBucketFps: vis.length ? Math.min(...vis.map((x) => x.fps)) : 0,
    fpsP5Median: round(median(vis.map((x) => x.fpsP5))), frameP50Ms: o.sessionP50 ?? round(median(vis.map((x) => x.p50Ms))), frameP95Ms: p95,
    longFrames50: b.reduce((a, x) => a + x.long50, 0), maxCalls: Math.max(0, ...b.map((x) => x.calls)), maxTriangles: Math.max(0, ...b.map((x) => x.triangles)),
    heapMB: { first: heaps[0] ?? null, last: heaps.at(-1) ?? null, max: heaps.length ? Math.max(...heaps) : null },
    battery: { first: batFirst, last: batLast, charging: bats.at(-1)?.charging ?? null,
      dropPctPerHour: discharging && batSpan > 0.05 && batFirst !== null && batLast !== null ? round(((batFirst - batLast) * 100) / batSpan) : null },
  };
  // A 30 fps cap ("battery saver") cannot reach 30.0 exactly: the check then allows 5 % under the cap.
  const fpsFloor = medianFpsThreshold(o.render.frameCap ?? 0);
  const checks: PerfReport['checks'] = {
    medianFps: { ok: vis.length ? medianFps >= fpsFloor : null, value: medianFps, threshold: `>= ${fpsFloor} fps${fpsFloor < THRESHOLDS.medianFps ? ` (frame cap ${o.render.frameCap})` : ''}` },
    frameP95: { ok: vis.length ? p95 <= THRESHOLDS.frameP95Ms : null, value: p95, threshold: `<= ${THRESHOLDS.frameP95Ms} ms` },
    thermalDrift: { ok: thermal.driftPct === null ? null : thermal.driftPct <= THRESHOLDS.maxDriftPct, value: thermal.driftPct, threshold: `<= ${THRESHOLDS.maxDriftPct} % fps loss vs the first 2 min (same scene)` },
    sessionLength: { ok: durationS >= 20 * 60, value: round(durationS / 60), threshold: '>= 20 min for the thermal check' },
  };
  return { kind: 'astrix-perf-report', version: REPORT_VERSION, build: o.build, createdAt: o.createdAt, startedAt: o.startedAt, durationS,
    device: o.device, render: o.render, summary, thermal, checks, events: [...o.events], buckets: [...b] };
}

const ms = (v: number) => v >= HISTOGRAM_BINS ? `>= ${HISTOGRAM_BINS - 1} ms` : `${v} ms`;
const fmt = (v: number | null | undefined, unit = '') => v === null || v === undefined ? '–' : `${v}${unit}`;

/** A short text summary to paste into chat (the JSON carries the buckets). */
export function reportText(r: PerfReport): string {
  const s = r.summary, d = r.device, t = r.thermal;
  const ok = (c: { ok: boolean | null }) => c.ok === null ? 'n/a' : c.ok ? 'PASS' : 'FAIL';
  const lines = [
    `ASTrix perf report v${r.version} · build ${r.build.commit}${r.build.dirty ? '+dirty' : ''}${r.build.bundle ? ` (${r.build.bundle})` : ''}`,
    `Device: ${d.userAgent}`,
    `GPU: ${d.gpu ?? 'not exposed'} · cores ${fmt(d.hardwareConcurrency)} · memory ${fmt(d.deviceMemory, ' GB')} · screen ${d.screen.width}x${d.screen.height} @${d.dpr}x · viewport ${d.viewport.width}x${d.viewport.height}`,
    `Render: ${r.render.path} · quality ${r.render.quality} (${r.render.qualitySource}: ${r.render.qualityReasons.join(', ')}) · pixel ratio ${r.render.pixelRatio} · canvas ${r.render.canvas.width}x${r.render.canvas.height}`
      + (r.render.frameCap !== undefined ? ` · frame cap ${r.render.frameCap ? `${r.render.frameCap} fps` : 'unlimited'}${r.render.frameCapSource ? ` (${r.render.frameCapSource})` : ''}` : ''),
    `Session: ${fmt(Math.round(r.durationS / 6) / 10, ' min')} · ${s.buckets} buckets (${s.visibleBuckets} visible)`,
    `FPS: median ${s.medianFps} · worst bucket ${s.minBucketFps} · p5 ${s.fpsP5Median} · frame p50 ${ms(s.frameP50Ms)} · p95 ${ms(s.frameP95Ms)} · frames > 50 ms: ${s.longFrames50}`,
    `Draw calls max ${s.maxCalls} · triangles max ${s.maxTriangles}`,
    `Heap MB first/last/max: ${fmt(s.heapMB.first)}/${fmt(s.heapMB.last)}/${fmt(s.heapMB.max)} · battery ${s.battery.first === null ? 'not exposed' : `${Math.round(s.battery.first * 100)}% → ${Math.round((s.battery.last ?? 0) * 100)}%${s.battery.charging ? ' (charging)' : ''}${s.battery.dropPctPerHour !== null ? `, ${s.battery.dropPctPerHour}%/h` : ''}`}`,
    `Thermal: ${t.status}${t.driftPct !== null ? ` · ${t.baselineFps} → ${t.laterFps} fps (${t.driftPct}% drift)` : ''} · ${t.note}`,
    `Checks: median fps ${ok(r.checks.medianFps)} · p95 frame ${ok(r.checks.frameP95)} · drift ${ok(r.checks.thermalDrift)} · length ${ok(r.checks.sessionLength)}`,
    r.events.length ? `Events: ${r.events.slice(-8).map((e) => `${Math.round(e.t)}s ${e.kind}${e.detail ? ` ${e.detail}` : ''}`).join(' · ')}` : 'Events: none',
  ];
  return lines.join('\n');
}

/** Size budget of the chat paste (characters; the M015 device report 1 paste was cut after about 17 KB). */
export const COMPACT_REPORT_MAX = 8000;

/**
 * The chat form of the report (Copy report): the text summary, every event,
 * and a bucket table of one short line per 10 s bucket. Long sessions are
 * grouped into 1, 5, 10... minute lines so the whole paste stays under
 * COMPACT_REPORT_MAX characters. Download and Share keep the full JSON.
 */
export function compactReport(r: PerfReport, maxChars = COMPACT_REPORT_MAX): string {
  const head = reportText(r);
  const evAll = r.events.map((e) => `${Math.round(e.t)}s ${e.kind}${e.detail ? ` ${e.detail}` : ''}`);
  let events = evAll.length > 8 ? `All events: ${evAll.join(' · ')}` : '';
  if (events.length > 1500) events = `All events (last 40 of ${evAll.length}): ${evAll.slice(-40).join(' · ')}`.slice(0, 1500);
  const q = (x: string) => x === 'high' ? 'H' : x === 'medium' ? 'M' : x === 'low' ? 'L' : x.slice(0, 1).toUpperCase();
  const b = r.buckets;
  const table = (group: number): string[] => {
    const rows: string[] = [];
    let prevScene = '';
    for (let i = 0; i < b.length; i += group) {
      const g = b.slice(i, i + group);
      const vis = g.filter((x) => x.frames > 0);
      const frames = vis.reduce((a, x) => a + x.frames, 0);
      const fps = frames ? round(vis.reduce((a, x) => a + x.fps * x.frames, 0) / frames) : 0;
      const p5 = vis.length ? Math.min(...vis.map((x) => x.fpsP5)) : 0;
      const p95 = vis.length ? Math.max(...vis.map((x) => x.p95Ms)) : 0;
      const long = g.reduce((a, x) => a + x.long50, 0);
      const calls = Math.max(...g.map((x) => x.calls));
      const tris = Math.round(Math.max(...g.map((x) => x.triangles)) / 1000);
      const visible = Math.min(...g.map((x) => x.visible));
      // The scene most of the group was in; "=" when it repeats the previous line.
      const counts = new Map<string, number>();
      for (const x of g) counts.set(x.scene, (counts.get(x.scene) ?? 0) + 1);
      const scene = [...counts.entries()].sort((a2, c) => c[1] - a2[1])[0][0];
      const last = g.at(-1)!;
      const bat = last.battery === null ? '-' : `${Math.round(last.battery * 100)}${last.charging ? 'c' : ''}`;
      const flags = `${q(last.quality)}${last.path === 'fallback' ? 'f' : ''}${last.cap ? last.cap : ''}`;
      rows.push([g[0].i, Math.round(g[0].t), `${fps}/${round(p5, 0)}`, Math.round(p95), long, calls, tris, visible < 0.9 ? `v${visible}` : '', bat, flags, scene === prevScene ? '=' : scene].filter((x) => x !== '').join(' '));
      prevScene = scene;
    }
    return rows;
  };
  const header = (group: number) => `Buckets (${group === 1 ? 'one line per 10 s' : `one line per ${group / 6} min`}): i t(s) fps/p5 p95ms >50ms calls ktris [v<visible] bat% quality(H/M/L, f=fallback, cap) scene ("=" same)`;
  for (const group of [1, 6, 30, 60, 180, 360]) {
    const text = [head, events, '', header(group), ...table(group)].filter((x, k) => x !== '' || k === 2).join('\n');
    if (text.length <= maxChars) return text;
  }
  return `${head}\n(bucket table omitted: the session is too long for a chat paste; use Download report)`.slice(0, maxChars);
}

/** Saved state so a reload in the same tab continues the session. */
export interface SavedSession { version: number; startedAt: string; buckets: PerfBucket[]; events: PerfEvent[]; histogram: number[]; elapsedS?: number }

export function parseSavedSession(text: string | null): SavedSession | null {
  if (!text) return null;
  try {
    const s = JSON.parse(text) as SavedSession;
    if (s.version !== REPORT_VERSION || !Array.isArray(s.buckets) || typeof s.startedAt !== 'string') return null;
    return { ...s, events: Array.isArray(s.events) ? s.events : [], histogram: Array.isArray(s.histogram) ? s.histogram : [], elapsedS: Number.isFinite(s.elapsedS) ? s.elapsedS : 0 };
  } catch { return null; }
}
