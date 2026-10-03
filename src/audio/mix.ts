/** Pure mixing rules shared by the engine and its tests: volume curves, distance, voice stealing. */
import type { SpatialSpec } from './sounds/types';

export const DEFAULT_SPATIAL: SpatialSpec = { ref: 2, max: 60, rolloff: 1 };

/** Settings slider (0..1) → linear gain. Squared, so 0.5 ≈ -12 dB, which feels like "half". */
export function sliderToGain(v: number): number {
  const c = Math.min(1, Math.max(0, v));
  return c * c;
}

/**
 * Distance attenuation as Web Audio's 'inverse' model computes it, times a fade to zero over the
 * last 20% before `max` (so culled sounds don't pop out).
 */
export function distanceGain(d: number, s: SpatialSpec): number {
  if (d >= s.max) return 0;
  const inv = s.ref / (s.ref + s.rolloff * (Math.max(d, s.ref) - s.ref));
  const fadeStart = s.max * 0.8;
  const fade = d <= fadeStart ? 1 : 1 - (d - fadeStart) / (s.max - fadeStart);
  return inv * fade;
}

/** Low-pass cutoff (Hz) for air absorption and the dulling of distant sounds in a city. */
export function airCutoff(d: number): number {
  return Math.min(20000, 18000 / (1 + Math.max(0, d) / 25));
}

/** Reverb send multiplier by distance: far sounds are wetter. */
export function distanceWetness(d: number): number {
  return 0.6 + 0.8 * Math.min(1, d / 40);
}

export interface VoiceSlot {
  /** Sound id. */
  id: string;
  /** Start time (s). */
  start: number;
  /** 0..1 importance. */
  priority: number;
  /** Estimated gain at the listener. */
  gain: number;
}

export interface VoicePlan<T extends VoiceSlot> {
  allow: boolean;
  /** Voices to fade out to make room. */
  steal: T[];
}

/**
 * Voice limiting. Per sound: at most `perSound` voices; the oldest of the same sound is stolen
 * (newest wins — a new footstep matters more than the tail of an old one). Globally: at most
 * `globalMax`; when full, the least important audible voice (priority × gain) is stolen if the new
 * one matters more, otherwise the new one is dropped.
 */
export function planVoice<T extends VoiceSlot>(active: readonly T[], incoming: Omit<VoiceSlot, 'start'>, perSound: number, globalMax: number): VoicePlan<T> {
  const steal: T[] = [];
  const same = active.filter((v) => v.id === incoming.id).sort((a, b) => a.start - b.start);
  while (same.length - steal.length >= perSound && steal.length < same.length) steal.push(same[steal.length]);
  if (active.length - steal.length >= globalMax) {
    let victim: T | null = null;
    let worst = Infinity;
    for (const v of active) {
      if (steal.includes(v)) continue;
      const score = v.priority * v.gain;
      if (score < worst) {
        worst = score;
        victim = v;
      }
    }
    if (!victim || incoming.priority * incoming.gain <= worst) return { allow: false, steal: [] };
    steal.push(victim);
  }
  return { allow: true, steal };
}

/** Pick a variant index at random, avoiding an immediate repeat. */
export function pickVariant(count: number, last: number, r: number): number {
  if (count <= 1) return 0;
  let v = Math.floor(r * (count - 1));
  if (v >= last && last >= 0) v++;
  return Math.min(count - 1, v);
}
