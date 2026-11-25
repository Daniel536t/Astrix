// M015 performance monitor overlay (`?perf=1` only). A small pill at the
// bottom centre (fps and frame time); tap it for the details, the session
// log and Copy / Download / Share report. Reads renderer counters and frame
// timings only; it never touches simulation state.
import type * as THREE from 'three';
import {
  BucketRecorder, BucketContext, DeviceInfo, PERF_SESSION_KEY, PerfEvent, PerfReport, REPORT_VERSION, SceneInfo,
  buildReport, parseSavedSession, reportText, sceneKey, summarizeFrames, thermalDrift,
} from './perf-monitor';
import { gpuStrings } from './quality';

export interface PerfOverlayOptions {
  renderer: THREE.WebGLRenderer;
  multiDraw: boolean;
  multiDrawSupported: boolean;
  quality: { level: string; source: string; reasons: string[] };
  build: { commit: string; dirty: boolean };
  scene: () => SceneInfo;
  /** Draw calls and triangles of the last frame (renderer.info, main + shadow passes). */
  counters: () => { calls: number; triangles: number };
}

type BatteryManagerLike = { level: number; charging: boolean; addEventListener?: (t: string, f: () => void) => void };

export class PerfOverlay {
  private readonly root: HTMLElement;
  private readonly pill: HTMLButtonElement;
  private readonly body: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly status: HTMLElement;
  private recorder: BucketRecorder;
  private startedAt: string;
  private events: PerfEvent[] = [];
  private readonly ring = new Float32Array(240);
  private ringN = 0;
  private ringI = 0;
  private lastFrame = 0;
  private lastUi = 0;
  private battery: BatteryManagerLike | null = null;
  private readonly device: DeviceInfo;
  private readonly t0 = performance.now();

  constructor(private readonly o: PerfOverlayOptions) {
    const gl = o.renderer.getContext();
    const g = gpuStrings(gl);
    const nav = navigator as Navigator & { deviceMemory?: number };
    this.device = {
      userAgent: navigator.userAgent, platform: (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? null,
      screen: { width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight, orientation: screen.orientation?.type ?? null },
      viewport: { width: innerWidth, height: innerHeight }, dpr: devicePixelRatio,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null, deviceMemory: nav.deviceMemory ?? null,
      gpu: g.gpu, gpuVendor: g.vendor, webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
      multiDrawSupported: o.multiDrawSupported, maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || null,
      touch: matchMedia('(pointer: coarse)').matches,
    };
    // Continue a session from this tab after a reload (Android may reload a tab under memory pressure).
    let saved = null;
    try { saved = parseSavedSession(sessionStorage.getItem(PERF_SESSION_KEY)); } catch { saved = null; }
    const now = performance.now();
    this.recorder = new BucketRecorder(now, saved?.buckets ?? [], saved?.elapsedS ?? 0);
    if (saved?.histogram.length === this.recorder.histogram.length) this.recorder.histogram.set(saved.histogram);
    this.startedAt = saved?.startedAt ?? new Date().toISOString();
    this.events = saved?.events ?? [];
    this.event(saved ? 'reload' : 'start', `quality ${o.quality.level} · ${o.multiDraw ? 'multi-draw' : 'fallback'}`);

    this.root = document.createElement('section');
    this.root.id = 'perf-overlay';
    this.root.setAttribute('aria-label', 'Performance monitor');
    this.pill = document.createElement('button');
    this.pill.type = 'button';
    this.pill.className = 'perf-pill';
    this.pill.setAttribute('aria-expanded', 'false');
    this.pill.textContent = 'perf …';
    this.body = document.createElement('div');
    this.body.className = 'perf-body';
    this.body.hidden = true;
    this.stats = document.createElement('pre');
    this.stats.className = 'perf-stats';
    this.status = document.createElement('div');
    this.status.className = 'perf-status';
    this.status.setAttribute('aria-live', 'polite');
    const actions = document.createElement('div');
    actions.className = 'perf-actions';
    const share = typeof navigator.share === 'function';
    actions.innerHTML = '<button type="button" data-perf="copy">Copy report</button><button type="button" data-perf="download">Download report</button>'
      + (share ? '<button type="button" data-perf="share">Share…</button>' : '')
      + '<button type="button" data-perf="mark">Mark</button><button type="button" data-perf="reset">New session</button><button type="button" data-perf="close">Close</button>';
    this.body.append(this.stats, actions, this.status);
    this.root.append(this.body, this.pill);
    document.body.appendChild(this.root);
    this.pill.addEventListener('click', () => this.toggle());
    actions.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.perf;
      if (act === 'copy') void this.copy();
      if (act === 'download') this.download();
      if (act === 'share') void this.share();
      if (act === 'mark') { this.event('mark', 'owner mark'); this.say('Marked the log at this moment.'); }
      if (act === 'reset') this.reset();
      if (act === 'close') this.toggle(false);
    });

    document.addEventListener('visibilitychange', () => {
      const visible = document.visibilityState === 'visible';
      this.recorder.visibility(visible, performance.now());
      this.event(visible ? 'visible' : 'hidden');
      this.lastFrame = 0;
      if (!visible) this.save();
    });
    window.addEventListener('pagehide', () => this.save());
    window.addEventListener('orientationchange', () => this.event('orientation', screen.orientation?.type ?? ''));
    const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> }).getBattery;
    if (typeof getBattery === 'function') {
      getBattery.call(navigator).then((b) => {
        this.battery = b;
        b.addEventListener?.('chargingchange', () => this.event(b.charging ? 'charging' : 'unplugged'));
      }).catch(() => { this.battery = null; });
    }
  }

  private event(kind: string, detail?: string): void {
    this.events.push({ t: Math.round(this.recorder.sessionSeconds(performance.now()) * 10) / 10, kind, ...(detail ? { detail } : {}) });
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }

  /** Once per rendered frame, after the render. */
  frame(nowMs: number): void {
    if (this.lastFrame > 0 && document.visibilityState === 'visible') {
      const dt = nowMs - this.lastFrame;
      this.recorder.frame(dt);
      this.ring[this.ringI] = dt; this.ringI = (this.ringI + 1) % this.ring.length; this.ringN = Math.min(this.ringN + 1, this.ring.length);
    }
    this.lastFrame = nowMs;
    const closed = this.recorder.poll(nowMs, () => this.context());
    if (closed) this.save();
    if (nowMs - this.lastUi > 500) { this.lastUi = nowMs; this.render(); }
  }

  private context(): BucketContext {
    const c = this.o.counters();
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return { scene: sceneKey(this.o.scene()), calls: c.calls, triangles: c.triangles,
      heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
      battery: this.battery ? { level: this.battery.level, charging: this.battery.charging } : null,
      quality: this.o.quality.level, path: this.o.multiDraw ? 'multi-draw' : 'fallback' };
  }

  private canvasSize(): { width: number; height: number } {
    const c = this.o.renderer.domElement;
    return { width: c.width, height: c.height };
  }

  report(): PerfReport {
    const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
    return buildReport({
      build: { ...this.o.build, bundle: script ? script.src.split('/').pop() ?? null : null, url: location.href },
      device: { ...this.device, viewport: { width: innerWidth, height: innerHeight }, screen: { ...this.device.screen, orientation: screen.orientation?.type ?? null } },
      render: { path: this.o.multiDraw ? 'multi-draw' : 'fallback', quality: this.o.quality.level, qualitySource: this.o.quality.source, qualityReasons: this.o.quality.reasons,
        pixelRatio: this.o.renderer.getPixelRatio(), canvas: this.canvasSize() },
      startedAt: this.startedAt, createdAt: new Date().toISOString(), buckets: this.recorder.buckets, events: this.events,
      sessionP50: this.recorder.sessionPercentile(0.5), sessionP95: this.recorder.sessionPercentile(0.95),
    });
  }

  private render(): void {
    const ring = this.ring.subarray(0, this.ringN);
    const s = summarizeFrames(ring);
    const c = this.o.counters();
    this.pill.textContent = `${Math.round(s.fps)} fps · ${s.p95Ms} ms`;
    this.pill.classList.toggle('slow', s.fps > 0 && s.fps < 30);
    if (this.body.hidden) return;
    const b = this.recorder.buckets;
    const t = thermalDrift(b);
    const el = (performance.now() - this.t0) / 1000;
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const cs = this.canvasSize();
    const last = b.at(-1);
    this.stats.textContent = [
      `fps ${s.fps} (p5 ${s.fpsP5}) · frame p50 ${s.p50Ms} / p95 ${s.p95Ms} ms (last ${s.frames} frames)`,
      `draw calls ${c.calls} · triangles ${c.triangles.toLocaleString('en')}`,
      `path ${this.o.multiDraw ? 'multi-draw' : 'fallback (no WEBGL_multi_draw' + (this.o.multiDrawSupported ? ', forced by ?multidraw=0)' : ')')} · quality ${this.o.quality.level} (${this.o.quality.source})`,
      `GPU ${this.device.gpu ?? 'not exposed'}`,
      `dpr ${devicePixelRatio} → pixel ratio ${this.o.renderer.getPixelRatio()} · canvas ${cs.width}×${cs.height} · viewport ${innerWidth}×${innerHeight}`,
      `cores ${this.device.hardwareConcurrency ?? '–'} · memory ${this.device.deviceMemory ?? '–'} GB · heap ${mem ? Math.round(mem.usedJSHeapSize / 1048576) + ' MB' : '–'} · battery ${this.battery ? `${Math.round(this.battery.level * 100)}%${this.battery.charging ? ' charging' : ''}` : 'not exposed'}`,
      `session ${b.length} × 10 s buckets${last ? ` · last ${last.fps} fps, p95 ${last.p95Ms} ms, ${last.long50} > 50 ms` : ''} · this load ${Math.round(el)} s`,
      `thermal ${t.status}${t.driftPct !== null ? ` · ${t.baselineFps} → ${t.laterFps} fps (${t.driftPct}%)` : ''}`,
      t.status === 'unknown' ? t.note : '',
    ].filter(Boolean).join('\n');
  }

  private toggle(open = this.body.hidden): void {
    this.body.hidden = !open;
    this.pill.setAttribute('aria-expanded', String(open));
    this.root.classList.toggle('open', open);
    this.lastUi = 0;
    this.render();
  }

  private say(m: string): void { this.status.textContent = m; }

  private files(): { name: string; json: string; text: string } {
    const r = this.report();
    const text = reportText(r);
    const stamp = r.createdAt.replace(/[:.]/g, '-').slice(0, 19);
    return { name: `astrix-perf-${stamp}.json`, json: JSON.stringify({ summaryText: text, ...r }, null, 1), text };
  }

  private async copy(): Promise<void> {
    const f = this.files();
    const payload = `${f.text}\n\n--- JSON ---\n${JSON.stringify(JSON.parse(f.json))}`;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(payload);
      else throw new Error('no clipboard API');
      this.say(`Copied the report (${Math.round(payload.length / 1024)} KB): paste it into the chat.`);
    } catch {
      // Fallback: a selected textarea the owner can copy by hand.
      const ta = document.createElement('textarea');
      ta.value = payload; ta.className = 'perf-copy'; ta.readOnly = true;
      this.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      this.say(ok ? 'Copied the report: paste it into the chat.' : 'Copy was blocked: select the text below and copy it.');
      if (ok) setTimeout(() => ta.remove(), 1500);
    }
  }

  private download(): void {
    const f = this.files();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([f.json], { type: 'application/json' }));
    a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    this.say(`Downloaded ${f.name}.`);
  }

  private async share(): Promise<void> {
    const f = this.files();
    try {
      const file = typeof File === 'function' ? new File([f.json], f.name, { type: 'application/json' }) : null;
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ title: 'ASTrix perf report', text: f.text, files: [file] });
      else await navigator.share({ title: 'ASTrix perf report', text: f.text });
      this.say('Shared.');
    } catch (e) { this.say(`Share cancelled or unavailable (${(e as Error).name}). Use Copy or Download.`); }
  }

  private reset(): void {
    try { sessionStorage.removeItem(PERF_SESSION_KEY); } catch { /* ignore */ }
    this.recorder = new BucketRecorder(performance.now());
    this.events = [];
    this.startedAt = new Date().toISOString();
    this.event('start', 'new session');
    this.say('Started a new session log.');
  }

  private save(): void {
    try {
      sessionStorage.setItem(PERF_SESSION_KEY, JSON.stringify({ version: REPORT_VERSION, startedAt: this.startedAt, buckets: this.recorder.buckets, elapsedS: this.recorder.sessionSeconds(performance.now()),
        events: this.events, histogram: Array.from(this.recorder.histogram) }));
    } catch { /* storage full: the in-memory log still works */ }
  }

  metrics(): Record<string, unknown> {
    const b = this.recorder.buckets;
    return { buckets: b.length, last: b.at(-1) ?? null, thermal: thermalDrift(b).status, events: this.events.length };
  }
}
