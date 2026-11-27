// Rolling frame-time and memory instrumentation for the browser build.
// Presentation-only: nothing here affects simulation state.

export interface FrameStatsReport {
  frames: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  /** Frames slower than 33 ms (below 30 fps) in the rolling window. */
  longFrames: number;
  /** Frames slower than 100 ms (visible hitch) in the rolling window. */
  hitches: number;
  /** Frames slower than 50 ms in the rolling window (the perf monitor's long frame). */
  over50: number;
  /** Frames slower than 50 ms since the start (not windowed). */
  over50Total: number;
  /** Sum of all recorded frame times since the start (ms, not windowed). */
  totalMs: number;
  windowFrames: number;
  heapMB: number | null;
}

export class FrameStats {
  private samples: Float32Array;
  private next = 0;
  private filled = 0;
  private total = 0;
  private over50Total = 0;
  private sumMs = 0;

  constructor(private readonly windowSize = 600) {
    this.samples = new Float32Array(windowSize);
  }

  record(frameMs: number): void {
    this.samples[this.next] = frameMs;
    this.next = (this.next + 1) % this.windowSize;
    this.filled = Math.min(this.filled + 1, this.windowSize);
    this.total++;
    if (frameMs > 50) this.over50Total++;
    this.sumMs += frameMs;
  }

  reset(): void {
    this.next = 0;
    this.filled = 0;
    this.over50Total = 0;
    this.sumMs = 0;
  }

  report(): FrameStatsReport {
    const values = Array.from(this.samples.subarray(0, this.filled)).sort((a, b) => a - b);
    const at = (q: number) => values.length === 0 ? 0
      : Math.round(values[Math.min(values.length - 1, Math.floor(q * (values.length - 1)))] * 10) / 10;
    let longFrames = 0, hitches = 0, over50 = 0;
    for (const v of values) {
      if (v > 33) longFrames++;
      if (v > 50) over50++;
      if (v > 100) hitches++;
    }
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return {
      frames: this.total,
      p50Ms: at(0.5), p95Ms: at(0.95), p99Ms: at(0.99), maxMs: at(1),
      longFrames, hitches, over50, over50Total: this.over50Total, totalMs: Math.round(this.sumMs), windowFrames: values.length,
      heapMB: memory ? Math.round(memory.usedJSHeapSize / 1048576) : null,
    };
  }
}

/** Per-section CPU cost of the frame loop (presentation only). Reports mean and worst milliseconds. */
export class SectionStats {
  private readonly sections = new Map<string, { sum: number; n: number; max: number; samples: Float32Array; i: number }>();
  constructor(private readonly windowSize = 300) {}
  record(name: string, ms: number): void {
    let s = this.sections.get(name);
    if (!s) { s = { sum: 0, n: 0, max: 0, samples: new Float32Array(this.windowSize), i: 0 }; this.sections.set(name, s); }
    s.sum += ms; s.n++;
    s.samples[s.i++ % this.windowSize] = ms;
    if (ms > s.max) s.max = ms;
  }
  report(): Record<string, { meanMs: number; p95Ms: number; maxMs: number; n: number }> {
    const r = (v: number) => Math.round(v * 100) / 100;
    const out: Record<string, { meanMs: number; p95Ms: number; maxMs: number; n: number }> = {};
    for (const [name, s] of this.sections) {
      const w = Array.from(s.samples.subarray(0, Math.min(s.n, this.windowSize))).sort((a, b) => a - b);
      out[name] = { meanMs: r(s.sum / s.n), p95Ms: r(w[Math.floor(0.95 * (w.length - 1))] ?? 0), maxMs: r(s.max), n: s.n };
    }
    return out;
  }
  reset(): void { this.sections.clear(); }
}
