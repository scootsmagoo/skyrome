/**
 * The sound bank: every sound and loop definition, and a lazy cache of baked variants.
 *
 * Baking is pure JS (no Web Audio) and deterministic per (id, variant). In the browser the engine
 * bakes in a Web Worker (`requestBake`, see bake.worker.ts) so beds that take ~100 ms never stall a
 * frame; the engine pre-bakes every one-shot there in the background at start-up, and only a few
 * critical sounds may still bake synchronously on first use (`getVariants`). The engine copies the
 * result into AudioBuffers and then `forget`s the PCM here, so audio is held once.
 */
import { Rand, fadeEdges, normalizeLoudness, normalizePeak, normalizeRms, peakOf, removeDc, trimTail } from './dsp/core';
import { ambienceLoops, ambienceSounds } from './sounds/ambience';
import { combatSounds } from './sounds/combat';
import { foleySounds } from './sounds/foley';
import { footstepSounds, landingSounds } from './sounds/footsteps';
import type { LoopDef, SoundDef } from './sounds/types';
import type { SampleSpec } from './music/sampleSpec';
import { uiSounds } from './sounds/ui';
import { vocalSounds } from './sounds/vocal';

export const DEFAULT_BAKE_RATE = 32000;
/** RMS that beds are normalized to before their mix gain. */
export const BED_RMS = 0.16;
/** Short-term (50 ms) RMS that one-shots are normalized to before their mix gain (≈ -14 dBFS). */
export const ONESHOT_LOUDNESS = 0.2;
/** Highest peak a baked one-shot may have. */
export const ONESHOT_PEAK = 0.95;

export const SOUNDS = new Map<string, SoundDef>();
export const LOOPS = new Map<string, LoopDef>();

for (const d of [...footstepSounds, ...landingSounds, ...combatSounds, ...vocalSounds, ...foleySounds, ...uiSounds, ...ambienceSounds]) {
  if (SOUNDS.has(d.id)) throw new Error(`[audio] duplicate sound id ${d.id}`);
  SOUNDS.set(d.id, d);
}
for (const l of ambienceLoops) {
  if (LOOPS.has(l.id)) throw new Error(`[audio] duplicate loop id ${l.id}`);
  LOOPS.set(l.id, l);
}

export function bakeRate(def: SoundDef): number {
  return def.rate ?? DEFAULT_BAKE_RATE;
}

const cache = new Map<string, Float32Array[]>();
/** Milliseconds spent baking each sound (all variants), for the perf report. */
export const bakeTimes = new Map<string, number>();

/** Bake one variant (uncached). Applies the bank's level conventions. */
export function bakeVariant(def: SoundDef, variant: number): Float32Array {
  const rate = bakeRate(def);
  const rnd = new Rand(`${def.id}#${variant}`);
  let buf = def.bake({ rate, rnd, variant });
  let bad = 0;
  for (let i = 0; i < buf.length; i++)
    if (!Number.isFinite(buf[i])) {
      buf[i] = 0;
      bad++;
    }
  if (bad) console.warn(`[audio] ${def.id}#${variant}: ${bad} non-finite samples zeroed`);
  if (def.kind === 'oneshot') {
    removeDc(buf, rate, 18);
    normalizePeak(buf, 0.9);
    buf = trimTail(buf, rate, 2e-4, 0.01);
    normalizeLoudness(buf, rate, ONESHOT_LOUDNESS, 0.05, ONESHOT_PEAK);
    fadeEdges(buf, rate, 0.0003, 0.008);
  } else {
    removeDcLoop(buf);
    normalizeRms(buf, BED_RMS, 0.95);
  }
  if (peakOf(buf) > 1) normalizePeak(buf, ONESHOT_PEAK);
  return buf;
}

/** Subtract the mean (a high-pass would break the loop seam). */
function removeDcLoop(buf: Float32Array) {
  let m = 0;
  for (let i = 0; i < buf.length; i++) m += buf[i];
  m /= buf.length;
  for (let i = 0; i < buf.length; i++) buf[i] -= m;
}

/** All baked variants of a sound (baked on first request). */
export function getVariants(id: string): Float32Array[] | null {
  const hit = cache.get(id);
  if (hit) return hit;
  const def = SOUNDS.get(id);
  if (!def) return null;
  const t0 = now();
  const list: Float32Array[] = [];
  for (let v = 0; v < def.variants; v++) list.push(bakeVariant(def, v));
  bakeTimes.set(id, now() - t0);
  cache.set(id, list);
  return list;
}

export function isBaked(id: string): boolean {
  return cache.has(id);
}

/** Bytes held by baked sample data. */
export function bakedBytes(): number {
  let n = 0;
  for (const list of cache.values()) for (const b of list) n += b.byteLength;
  return n;
}

/** Drop baked data (tests / memory pressure). */
export function clearBank() {
  cache.clear();
  bakeTimes.clear();
}

/** Release one sound's PCM (it re-bakes deterministically if anyone asks again). */
export function forget(id: string) {
  cache.delete(id);
}

/** An off-main-thread baker (the engine installs a Web Worker one). */
export interface Baker {
  /** Bake every variant of a sound. Background (non-urgent) jobs yield to urgent ones. */
  bake(id: string, urgent?: boolean): Promise<{ variants: Float32Array[]; ms: number }>;
  /** Move a queued background bake to the front (someone needs it now). */
  promote?(id: string): void;
  /** Bake one music sample (always urgent: a performer is waiting for it). */
  bakeSample?(spec: SampleSpec): Promise<{ data: Float32Array; ms: number }>;
}

let baker: Baker | null = null;
const pending = new Map<string, Promise<Float32Array[] | null>>();

export function setBaker(b: Baker | null) {
  baker = b;
}

export function currentBaker(): Baker | null {
  return baker;
}

/**
 * Bake asynchronously (in the worker when one is installed, otherwise on a later tick).
 * Resolves with the cached variants; concurrent requests share one bake. `urgent: false` queues it
 * behind anything urgent (used to pre-bake the whole bank in the background).
 */
export function requestBake(id: string, urgent = true): Promise<Float32Array[] | null> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  if (!SOUNDS.has(id)) return Promise.resolve(null);
  const inFlight = pending.get(id);
  if (inFlight) {
    if (urgent) baker?.promote?.(id);
    return inFlight;
  }
  const job: Promise<Float32Array[] | null> = (baker
    ? baker.bake(id, urgent).then((r) => {
        bakeTimes.set(id, r.ms);
        return r.variants;
      })
    : new Promise<Float32Array[] | null>((res) => setTimeout(() => res(getVariants(id)), 0))
  )
    // A broken worker falls back to baking here, but only for urgent requests (a failed background
    // pre-bake must not turn into a burst of main-thread bakes); a disposed one just gives up.
    .catch((e: Error) => (e?.name === 'BakeCancelled' || !urgent ? null : getVariants(id)))
    .then((list) => {
      pending.delete(id);
      if (list && !cache.has(id)) cache.set(id, list);
      return cache.get(id) ?? list;
    });
  pending.set(id, job);
  return job;
}

/**
 * Bake sounds in small slices during idle time so the first footstep or swing doesn't hitch.
 * Returns a cancel function.
 */
export function warm(ids: readonly string[], budgetMs = 6): () => void {
  let i = 0;
  let cancelled = false;
  const ric: (cb: () => void) => void =
    typeof (globalThis as any).requestIdleCallback === 'function'
      ? (cb) => (globalThis as any).requestIdleCallback(cb, { timeout: 500 })
      : (cb) => setTimeout(cb, 16);
  const step = () => {
    if (cancelled) return;
    const t0 = now();
    while (i < ids.length && now() - t0 < budgetMs) getVariants(ids[i++]);
    if (i < ids.length) ric(step);
  };
  ric(step);
  return () => (cancelled = true);
}

/** Every sound id referenced by a loop (beds and events). */
export function loopSoundIds(def: LoopDef): string[] {
  const ids: string[] = [];
  if (def.bed) ids.push(def.bed);
  for (const e of def.events ?? []) ids.push(e.sound);
  return ids;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
