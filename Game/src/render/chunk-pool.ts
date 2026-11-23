// A small pool of chunk workers with promise-style callbacks. Results arrive
// asynchronously; callers decide on the main thread whether they still apply.
import type { BaseChunk, BaseColumns } from '../sim/world';
import type { MeshArrays } from './mesher';

export interface GenerateResult { base: BaseChunk; columns: BaseColumns; ms: number; }
export interface MeshResultMsg { arrays: MeshArrays; ms: number; }

type Pending = { resolve: (value: unknown) => void; worker: number };

export class ChunkWorkerPool {
  private workers: Worker[] = [];
  private busy: number[] = [];
  private pending = new Map<number, Pending>();
  private nextId = 1;
  failed = false;

  constructor(size: number) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL('./chunk-worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id: number }>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        this.busy[p.worker]--;
        p.resolve(e.data);
      };
      w.onerror = () => { this.failed = true; };
      this.workers.push(w);
      this.busy.push(0);
    }
  }

  get inFlight(): number { return this.pending.size; }
  get size(): number { return this.workers.length; }

  private post<T>(message: Record<string, unknown>, transfer: Transferable[]): Promise<T> {
    let wi = 0;
    for (let i = 1; i < this.workers.length; i++) if (this.busy[i] < this.busy[wi]) wi = i;
    const id = this.nextId++;
    this.busy[wi]++;
    return new Promise<T>((resolve) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, worker: wi });
      this.workers[wi].postMessage({ ...message, id }, transfer);
    });
  }

  generate(seed: number, version: number, cx: number, cz: number): Promise<GenerateResult> {
    return this.post({ kind: 'generate', seed, version, cx, cz }, []);
  }

  mesh(padded: Uint8Array, heights: Uint8Array, ox: number, oz: number, seed: number): Promise<MeshResultMsg> {
    const h = heights.slice();
    return this.post({ kind: 'mesh', padded, heights: h, ox, oz, seed }, [padded.buffer, h.buffer]);
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.pending.clear();
  }
}
