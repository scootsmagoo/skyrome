/**
 * Main-thread side of the bake worker (callers fall back to synchronous baking if workers fail).
 *
 * Urgent jobs (a sound someone is about to play, a loop's bed, music samples) are posted at once.
 * Background jobs (pre-baking the bank) are held here and fed to the worker at most
 * `BACKGROUND_IN_FLIGHT` at a time, so an urgent job never waits behind more than that.
 */
import type { Baker } from './bank';
import type { ReverbPreset } from './dsp/reverb';
import type { SampleSpec } from './music/sampleSpec';

interface Reply {
  seq: number;
  id?: string;
  ms?: number;
  variants?: Float32Array[];
  data?: Float32Array;
  channels?: Float32Array[];
  error?: string;
}

interface Body {
  id?: string;
  sample?: SampleSpec;
  ir?: { preset: ReverbPreset; rate: number };
}

interface Job {
  seq: number;
  msg: { seq: number } & Body;
  resolve: (r: Reply) => void;
  reject: (e: Error) => void;
}

const BACKGROUND_IN_FLIGHT = 1;

/** Jobs dropped because the baker was disposed (callers must not fall back to a synchronous bake). */
function cancelled(): Error {
  const e = new Error('bake cancelled');
  e.name = 'BakeCancelled';
  return e;
}

export class WorkerBaker implements Baker {
  private seq = 0;
  private waiting = new Map<number, Job>();
  /** Background jobs not yet posted. */
  private background: Job[] = [];
  private backgroundInFlight = new Set<number>();
  private broken = false;

  private constructor(private readonly worker: Worker) {
    worker.onmessage = (e: MessageEvent<Reply>) => {
      const job = this.waiting.get(e.data.seq);
      if (!job) return;
      this.waiting.delete(e.data.seq);
      if (this.backgroundInFlight.delete(e.data.seq)) this.feed();
      if (e.data.error) job.reject(new Error(e.data.error));
      else job.resolve(e.data);
    };
    worker.onerror = (e) => {
      // A worker that can't load (CSP, old browser): fail everything; callers bake synchronously.
      e.preventDefault?.();
      this.broken = true;
      for (const j of [...this.waiting.values(), ...this.background]) j.reject(new Error('bake worker failed'));
      this.waiting.clear();
      this.background = [];
    };
  }

  static create(): WorkerBaker | null {
    try {
      return new WorkerBaker(new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' }));
    } catch {
      return null;
    }
  }

  /** Jobs waiting to be posted (background) plus jobs in the worker. */
  get queued(): number {
    return this.background.length + this.waiting.size;
  }

  bake(id: string, urgent = true): Promise<{ variants: Float32Array[]; ms: number }> {
    return this.submit({ id }, urgent).then((r) => {
      if (!r.variants) throw new Error('bake failed');
      return { variants: r.variants, ms: r.ms ?? 0 };
    });
  }

  bakeSample(spec: SampleSpec): Promise<{ data: Float32Array; ms: number }> {
    return this.submit({ sample: spec }, true).then((r) => {
      if (!r.data) throw new Error('bake failed');
      return { data: r.data, ms: r.ms ?? 0 };
    });
  }

  /** A stereo impulse response for a reverb space, at the context's sample rate. */
  bakeIr(preset: ReverbPreset, rate: number, urgent = true): Promise<{ channels: Float32Array[]; ms: number }> {
    return this.submit({ ir: { preset, rate } }, urgent).then((r) => {
      if (!r.channels) throw new Error('bake failed');
      return { channels: r.channels, ms: r.ms ?? 0 };
    });
  }

  /** Move a queued background bake of this sound to the front. */
  promote(id: string) {
    this.promoteWhere((m) => m.id === id);
  }

  /** Move a queued background impulse response to the front. */
  promoteIr(preset: ReverbPreset) {
    this.promoteWhere((m) => m.ir?.preset === preset);
  }

  private promoteWhere(match: (m: Body) => boolean) {
    const i = this.background.findIndex((j) => match(j.msg));
    if (i < 0) return;
    const [job] = this.background.splice(i, 1);
    this.post(job);
  }

  private submit(body: Body, urgent: boolean): Promise<Reply> {
    if (this.broken) return Promise.reject(new Error('bake worker unavailable'));
    const seq = ++this.seq;
    return new Promise<Reply>((resolve, reject) => {
      const job: Job = { seq, msg: { seq, ...body }, resolve, reject };
      if (urgent) this.post(job);
      else {
        this.background.push(job);
        this.feed();
      }
    });
  }

  private post(job: Job) {
    this.waiting.set(job.seq, job);
    this.worker.postMessage(job.msg);
  }

  private feed() {
    while (this.backgroundInFlight.size < BACKGROUND_IN_FLIGHT && this.background.length) {
      const job = this.background.shift()!;
      this.backgroundInFlight.add(job.seq);
      this.post(job);
    }
  }

  dispose() {
    this.worker.terminate();
    for (const j of [...this.waiting.values(), ...this.background]) j.reject(cancelled());
    this.waiting.clear();
    this.background = [];
  }
}
