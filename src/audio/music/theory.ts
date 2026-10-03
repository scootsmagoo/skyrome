/**
 * Modes and tuning.
 *
 * Mode names follow the later (Glarean / church) convention because that is what the names mean
 * to most listeners today: Dorian = D–D, Phrygian = E–E, Mixolydian = G–G, Hypolydian = the
 * plagal Lydian (final F, range C–C). The ancient Greek names pointed at different octave species
 * (Greek "Dorian" ≈ our E-mode), which docs/modules/audio.md explains.
 *
 * Tuning is Pythagorean (pure fifths, 3:2), which Greek and Roman theorists described, and which
 * gives drones and open fifths their clean, archaic ring.
 */

export type ModeName = 'dorian' | 'phrygian' | 'mixolydian' | 'hypolydian' | 'chromatic';

export interface Mode {
  name: ModeName;
  /** Semitone offsets of the seven (or more) degrees above the final. */
  steps: readonly number[];
  /** Range of the melody in scale degrees relative to the final (plagal modes sit lower). */
  range: readonly [number, number];
  /** Degree (0-based, relative to the final) of the co-final / reciting tone used for half cadences. */
  cofinal: number;
  /** Final pitch class name, for reference. */
  final: string;
}

export const MODES: Record<ModeName, Mode> = {
  dorian: { name: 'dorian', steps: [0, 2, 3, 5, 7, 9, 10], range: [-1, 8], cofinal: 4, final: 'D' },
  phrygian: { name: 'phrygian', steps: [0, 1, 3, 5, 7, 8, 10], range: [-1, 8], cofinal: 3, final: 'E' },
  mixolydian: { name: 'mixolydian', steps: [0, 2, 4, 5, 7, 9, 10], range: [-1, 8], cofinal: 4, final: 'G' },
  hypolydian: { name: 'hypolydian', steps: [0, 2, 4, 6, 7, 9, 11], range: [-4, 5], cofinal: 2, final: 'F' },
  /** Greek chromatic genus on E (two semitones then a minor third, in each tetrachord). */
  chromatic: { name: 'chromatic', steps: [0, 1, 2, 5, 7, 8, 9], range: [-2, 7], cofinal: 3, final: 'E' },
};

/** Pythagorean ratios for the 12 chromatic positions above the final. */
export const PYTHAGOREAN = [1, 256 / 243, 9 / 8, 32 / 27, 81 / 64, 4 / 3, 729 / 512, 3 / 2, 128 / 81, 27 / 16, 16 / 9, 243 / 128] as const;

/** Semitone offset of a (possibly negative or > 7) scale degree in a mode. */
export function degreeToSemitone(mode: Mode, degree: number): number {
  const n = mode.steps.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return mode.steps[idx] + 12 * oct;
}

/** Frequency (Hz) of a scale degree, Pythagorean-tuned from `finalHz`. */
export function degreeToFreq(mode: Mode, degree: number, finalHz: number): number {
  const semis = degreeToSemitone(mode, degree);
  const oct = Math.floor(semis / 12);
  const pc = ((semis % 12) + 12) % 12;
  return finalHz * PYTHAGOREAN[pc] * Math.pow(2, oct);
}

export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const hzToMidi = (f: number) => 69 + 12 * Math.log2(f / 440);

/** Useful finals (Hz) near the natural register of lyre and aulos. */
export const FINALS: Record<string, number> = {
  C: midiToHz(60),
  D: midiToHz(62),
  E: midiToHz(64),
  F: midiToHz(65),
  G: midiToHz(55),
  A: midiToHz(57),
};

/** Is `semitone` (relative to the final) a member of the mode? */
export function inMode(mode: Mode, semitone: number): boolean {
  const pc = ((semitone % 12) + 12) % 12;
  return mode.steps.includes(pc);
}
