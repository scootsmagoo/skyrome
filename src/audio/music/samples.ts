/**
 * Music sample store: AudioBuffers for lyre / kithara plucks and percussion strokes.
 *
 * Samples are baked in the engine's worker (synchronously only for offline renders), copied into an
 * AudioBuffer and the PCM is dropped, so each sample is held once. AudioBuffers are not tied to a
 * context, so one store serves the live context and offline verification alike.
 *
 * Memory is bounded: beyond `budgetBytes` the least recently used samples are evicted, except any
 * used in the last `keepSeconds` (a performer touches the samples of its current and next block,
 * so nothing it is about to play is ever evicted). An evicted sample simply bakes again on demand.
 */
import { currentBaker } from '../bank';
import { MUSIC_RATE, bakeSample, sampleKey, type SampleSpec } from './sampleSpec';

interface Entry {
  buf: AudioBuffer;
  bytes: number;
  /** Last use (store clock, seconds). */
  used: number;
}

export class SampleStore {
  budgetBytes = 16 * 1048576;
  keepSeconds = 30;
  /** Samples baked so far, and evicted (for stats and tests). */
  baked = 0;
  evicted = 0;
  /** In least-recently-used order (a hit moves its entry to the end). */
  private entries = new Map<string, Entry>();
  private pending = new Set<string>();
  private total = 0;
  private generation = 0;

  constructor(private readonly clock: () => number = () => performance.now() / 1000) {}

  get bytes(): number {
    return this.total;
  }

  get size(): number {
    return this.entries.size;
  }

  get baking(): number {
    return this.pending.size;
  }

  has(spec: SampleSpec): boolean {
    return this.entries.has(sampleKey(spec));
  }

  /**
   * The buffer for a sample, or null while it bakes (the bake is started here). `sync` bakes on
   * the spot instead (offline rendering, where nothing can wait).
   */
  get(ctx: BaseAudioContext, spec: SampleSpec, sync = false): AudioBuffer | null {
    const key = sampleKey(spec);
    const hit = this.entries.get(key);
    if (hit) {
      hit.used = this.clock();
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit.buf;
    }
    if (sync) return this.insert(ctx, key, bakeSample(spec));
    this.request(ctx, key, spec);
    return null;
  }

  private request(ctx: BaseAudioContext, key: string, spec: SampleSpec) {
    if (this.pending.has(key)) return;
    this.pending.add(key);
    const gen = this.generation;
    const baker = currentBaker();
    const job: Promise<Float32Array | null> = baker?.bakeSample
      ? baker.bakeSample(spec).then((r) => r.data)
      : new Promise((res) => setTimeout(() => res(bakeSample(spec)), 0));
    void job
      .catch((e: Error) => (e?.name === 'BakeCancelled' ? null : bakeSample(spec)))
      .then((data) => {
        if (gen !== this.generation) return;
        this.pending.delete(key);
        if (data && !this.entries.has(key)) this.insert(ctx, key, data);
      });
  }

  private insert(ctx: BaseAudioContext, key: string, data: Float32Array): AudioBuffer {
    let buf: AudioBuffer;
    try {
      buf = ctx.createBuffer(1, data.length, MUSIC_RATE);
    } catch {
      buf = new AudioBuffer({ length: data.length, sampleRate: MUSIC_RATE, numberOfChannels: 1 });
    }
    buf.getChannelData(0).set(data);
    this.entries.set(key, { buf, bytes: data.byteLength, used: this.clock() });
    this.total += data.byteLength;
    this.baked++;
    this.evict();
    return buf;
  }

  private evict() {
    const keepAfter = this.clock() - this.keepSeconds;
    for (const [key, e] of this.entries) {
      if (this.total <= this.budgetBytes || e.used > keepAfter) break; // the rest are newer still
      this.entries.delete(key);
      this.total -= e.bytes;
      this.evicted++;
    }
  }

  /** Drop everything (tests, or memory pressure). In-flight bakes are ignored when they land. */
  clear() {
    this.entries.clear();
    this.pending.clear();
    this.total = 0;
    this.generation++;
  }
}

/** The shared store used by every music rack. */
export const musicSamples = new SampleStore();
