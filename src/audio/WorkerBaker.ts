/** Main-thread side of the bake worker (falls back to synchronous baking if workers fail). */
import type { Baker } from './bank';

interface Reply {
  seq: number;
  id: string;
  ms?: number;
  variants?: Float32Array[];
  error?: string;
}

export class WorkerBaker implements Baker {
  private seq = 0;
  private waiting = new Map<number, { resolve: (r: { variants: Float32Array[]; ms: number }) => void; reject: (e: Error) => void }>();
  private broken = false;

  private constructor(private readonly worker: Worker) {
    worker.onmessage = (e: MessageEvent<Reply>) => {
      const w = this.waiting.get(e.data.seq);
      if (!w) return;
      this.waiting.delete(e.data.seq);
      if (e.data.error || !e.data.variants) w.reject(new Error(e.data.error ?? 'bake failed'));
      else w.resolve({ variants: e.data.variants, ms: e.data.ms ?? 0 });
    };
    worker.onerror = (e) => {
      // A worker that can't load (CSP, old browser): fail everything; callers bake synchronously.
      e.preventDefault?.();
      this.broken = true;
      for (const w of this.waiting.values()) w.reject(new Error('bake worker failed'));
      this.waiting.clear();
    };
  }

  static create(): WorkerBaker | null {
    try {
      return new WorkerBaker(new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' }));
    } catch {
      return null;
    }
  }

  bake(id: string): Promise<{ variants: Float32Array[]; ms: number }> {
    if (this.broken) return Promise.reject(new Error('bake worker unavailable'));
    const seq = ++this.seq;
    return new Promise((resolve, reject) => {
      this.waiting.set(seq, { resolve, reject });
      this.worker.postMessage({ seq, id });
    });
  }

  dispose() {
    this.worker.terminate();
  }
}
