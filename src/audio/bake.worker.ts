/**
 * Bakes sounds, music samples and reverb impulse responses off the main thread. The engine posts
 * `{ seq, id }` (every variant of a bank sound), `{ seq, sample }` (one lyre pluck / drum / cymbal
 * stroke) or `{ seq, ir }` (a stereo impulse response at the context's rate); the worker bakes with
 * the same deterministic code as the main thread and transfers the PCM back.
 */
import { forget, getVariants } from './bank';
import { REVERBS, impulseResponse, type ReverbPreset } from './dsp/reverb';
import { bakeSample, type SampleSpec } from './music/sampleSpec';

interface Req {
  seq: number;
  id?: string;
  sample?: SampleSpec;
  ir?: { preset: ReverbPreset; rate: number };
}

const scope = self as unknown as { postMessage(m: unknown, transfer: Transferable[]): void; onmessage: ((e: MessageEvent<Req>) => void) | null };

scope.onmessage = (e) => {
  const { seq, id, sample, ir } = e.data;
  const t0 = performance.now();
  try {
    if (ir) {
      const channels = impulseResponse(REVERBS[ir.preset], ir.rate);
      scope.postMessage({ seq, ms: performance.now() - t0, channels }, channels.map((c) => c.buffer as ArrayBuffer));
      return;
    }
    if (sample) {
      const data = bakeSample(sample);
      scope.postMessage({ seq, ms: performance.now() - t0, data }, [data.buffer as ArrayBuffer]);
      return;
    }
    const variants = id ? getVariants(id) : null;
    if (!variants) {
      scope.postMessage({ seq, id, error: `unknown sound ${id}` }, []);
      return;
    }
    forget(id!); // the buffers are transferred; keep nothing here
    scope.postMessage({ seq, id, ms: performance.now() - t0, variants }, variants.map((v) => v.buffer as ArrayBuffer));
  } catch (err) {
    scope.postMessage({ seq, id, error: String(err) }, []);
  }
};
