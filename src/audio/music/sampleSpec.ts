/**
 * The music engine's baked samples: lyre / kithara plucks, tympanum strokes and cymbal strokes.
 * Pure (no Web Audio), so the bake worker and the main thread render identical data. The store in
 * samples.ts turns them into AudioBuffers under a memory budget.
 */
import { Rand, normalizePeak } from '../dsp/core';
import { cymbal, drumStroke, type DrumStroke } from '../dsp/instruments';
import { pluck } from '../dsp/pluck';

export const MUSIC_RATE = 32000;

/** Two excitation brightnesses are baked; darker notes are filtered at playback. */
export const BRIGHTNESS = { soft: 0.6, bright: 0.85 } as const;
export type Brightness = keyof typeof BRIGHTNESS;
/** Variants per percussion stroke. */
export const STROKE_VARIANTS = 3;
export const DRUM_STROKES: readonly DrumStroke[] = ['doum', 'tek', 'ka'];
export const CYMBAL_STROKES = ['ring', 'choke'] as const;

export type SampleSpec =
  | { kind: 'pluck'; body: 'lyre' | 'kithara'; freq: number; bright: Brightness }
  | { kind: 'drum'; stroke: DrumStroke; v: number }
  | { kind: 'cymbal'; stroke: 'ring' | 'choke'; v: number };

/** Which baked brightness a note uses (and whether it needs the dark playback filter). */
export function brightnessFor(bright: number): { bucket: Brightness; dark: boolean } {
  return { bucket: bright >= 0.65 ? 'bright' : 'soft', dark: bright < 0.45 };
}

/** Stable cache key. Plucks are keyed to 0.1 Hz (finals come from a finite set, so keys do too). */
export function sampleKey(s: SampleSpec): string {
  switch (s.kind) {
    case 'pluck':
      return `${s.body}:${s.freq.toFixed(1)}:${s.bright}`;
    case 'drum':
      return `drum:${s.stroke}:${s.v}`;
    case 'cymbal':
      return `cym:${s.stroke}:${s.v}`;
  }
}

/** Ring time of a lyre string: low strings ring longer. */
export function pluckSeconds(freq: number): { t60: number; seconds: number } {
  const t60 = Math.max(1.2, Math.min(4.5, 5 - freq / 150));
  return { t60, seconds: t60 * 0.85 + 0.1 };
}

/** Render one sample (deterministic per key). */
export function bakeSample(s: SampleSpec): Float32Array {
  const key = sampleKey(s);
  const rnd = new Rand(key);
  switch (s.kind) {
    case 'pluck': {
      const b = BRIGHTNESS[s.bright];
      const { t60, seconds } = pluckSeconds(s.freq);
      const d = pluck(s.freq, MUSIC_RATE, rnd, { seconds, t60, brightness: b, pluckPos: 0.12 + (1 - b) * 0.1, damping: 0.45, body: s.body });
      return normalizePeak(d, 0.6);
    }
    case 'drum':
      return normalizePeak(drumStroke(s.stroke, MUSIC_RATE, rnd, { f0: 92 }), 0.8);
    case 'cymbal':
      return normalizePeak(cymbal(s.stroke, MUSIC_RATE, rnd), 0.8);
  }
}

/** Every percussion sample (small: about 2 MB in all); baked up front. */
export function percussionSpecs(): SampleSpec[] {
  const out: SampleSpec[] = [];
  for (let v = 0; v < STROKE_VARIANTS; v++) {
    for (const stroke of DRUM_STROKES) out.push({ kind: 'drum', stroke, v });
    for (const stroke of CYMBAL_STROKES) out.push({ kind: 'cymbal', stroke, v });
  }
  return out;
}
