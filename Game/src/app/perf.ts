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
  windowFrames: number;
  heapMB: number | null;
}

export class FrameStats {
  private samples: Float32Array;
  private next = 0;
  private filled = 0;
  private total = 0;

  constructor(private readonly windowSize = 600) {
    this.samples = new Float32Array(windowSize);
  }

  record(frameMs: number): void {
    this.samples[this.next] = frameMs;
    this.next = (this.next + 1) % this.windowSize;
    this.filled = Math.min(this.filled + 1, this.windowSize);
    this.total++;
  }

  reset(): void {
    this.next = 0;
    this.filled = 0;
  }

  report(): FrameStatsReport {
    const values = Array.from(this.samples.subarray(0, this.filled)).sort((a, b) => a - b);
    const at = (q: number) => values.length === 0 ? 0
      : Math.round(values[Math.min(values.length - 1, Math.floor(q * (values.length - 1)))] * 10) / 10;
    let longFrames = 0, hitches = 0;
    for (const v of values) {
      if (v > 33) longFrames++;
      if (v > 100) hitches++;
    }
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return {
      frames: this.total,
      p50Ms: at(0.5), p95Ms: at(0.95), p99Ms: at(0.99), maxMs: at(1),
      longFrames, hitches, windowFrames: values.length,
      heapMB: memory ? Math.round(memory.usedJSHeapSize / 1048576) : null,
    };
  }
}
