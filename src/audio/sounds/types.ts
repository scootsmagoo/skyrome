/** Sound and loop definitions: what the bank bakes and what the engine plays. */
import type { Rand } from '../dsp/core';

export type BusName = 'music' | 'sfx' | 'ambience' | 'voice' | 'ui';

/** Distance model for spatial playback (Web Audio 'inverse' model). */
export interface SpatialSpec {
  /** Distance (m) at which the sound plays at full volume. */
  ref: number;
  /** Beyond this distance the sound is culled. */
  max: number;
  rolloff: number;
}

export interface BakeContext {
  rate: number;
  rnd: Rand;
  variant: number;
}

export interface SoundDef {
  id: string;
  /** Sound-board label. */
  label: string;
  /** Sound-board group. */
  group: string;
  bus: BusName;
  /** 'oneshot' plays once; 'bed' is a seamless loop buffer used by loops. */
  kind: 'oneshot' | 'bed';
  /** Number of baked variants (picked at random, never the same twice in a row). */
  variants: number;
  /** Bake sample rate (Hz). Default 32000; beds with little high end use less. */
  rate?: number;
  /** Mix level in dB applied at playback. */
  gainDb?: number;
  /** Max simultaneous voices of this sound (oldest is stolen). Default 6. */
  maxVoices?: number;
  /** 0..1: importance when the global voice cap is reached. Default 0.5. */
  priority?: number;
  spatial?: Partial<SpatialSpec>;
  /** Reverb send 0..1. Default 0.25. */
  reverb?: number;
  /** Random playback-rate spread (fraction, e.g. 0.05 = ±5%). */
  randomRate?: number;
  /** Random gain spread (dB, ±). */
  randomGainDb?: number;
  /** Verification expectations (checked by tests and the offline report). */
  expect?: {
    /** Audible duration (to -60 dB) in seconds. */
    dur?: [number, number];
    /** Spectral centroid in Hz. */
    centroid?: [number, number];
  };
  /** Produce one variant. One-shots are normalized by the bank; beds must be seamless. */
  bake(ctx: BakeContext): Float32Array;
}

/** A recurring one-shot inside a loop: birds in a 'birds' loop, syllables over a crowd bed. */
export interface LoopEvent {
  sound: string;
  /** Mean events per second at full layer volume (Poisson). */
  rate: number;
  /** Optional bout: the event repeats `count` times at `interval` seconds (owls, dogs). */
  bout?: { count: [number, number]; interval: [number, number] };
  /** For non-positional loops: distance range (m) of the event around the listener. */
  dist?: [number, number];
  /** Height range (m) above the listener (birds overhead). */
  height?: [number, number];
  /** For positional loops: random offset radius around the loop's position. */
  jitter?: number;
  /** Relative level (dB). */
  gainDb?: number;
  /** Fly-by speed (m/s): the voice moves across the listener while it plays. */
  move?: number;
}

export interface LoopDef {
  id: string;
  label: string;
  group: string;
  bus: BusName;
  gainDb?: number;
  /** Bed sound id (kind 'bed'). */
  bed?: string;
  /** Play the mono bed twice at different offsets, panned apart, for a wide stereo image. */
  stereoBed?: boolean;
  events?: LoopEvent[];
  spatial?: Partial<SpatialSpec>;
  reverb?: number;
}
