/** Per-state musical styles: tempo, metre, modes, instrumentation, texture and pacing. */
import type { ModeName } from './theory';

export type MusicState = 'silence' | 'explore-day' | 'explore-night' | 'tension' | 'combat' | 'tavern' | 'temple';
export const MUSIC_STATES: readonly MusicState[] = ['silence', 'explore-day', 'explore-night', 'tension', 'combat', 'tavern', 'temple'];

export type LyreTexture = 'sparse' | 'arp' | 'strum' | 'ostinato' | 'drone' | 'heterophony';
export type DrumStyle = 'none' | 'soft' | 'heartbeat' | 'drive' | 'dance' | 'processional';
export type MelodyInstrument = 'aulos' | 'syrinx';

export interface Style {
  state: MusicState;
  /** Tempo range in beats per minute (a quarter note; a dotted quarter in 6/8). */
  tempo: [number, number];
  /** Pulses per bar, with weights. 6 = 6/8 (eighth-note pulses). */
  meters: readonly (readonly [number, number])[];
  modes: readonly ModeName[];
  /** Melody instrument weights. */
  melody: readonly (readonly [MelodyInstrument, number])[];
  /** Second melodic voice answering the first (call and response). */
  answer: boolean;
  /** Melody octave offset relative to the mode's final in octave 4. */
  melodyOctave: { aulos: number; syrinx: number };
  lyre: readonly (readonly [LyreTexture, number])[];
  drums: readonly (readonly [DrumStyle, number])[];
  /** Probability of cymbal accents at phrase starts. */
  cymbals: number;
  drone: boolean;
  /** Bars per phrase. */
  phraseBars: readonly number[];
  /** Phrases per piece [min, max]; Infinity-like large values for continuous states. */
  pieceLength: [number, number];
  /** Silence between pieces (seconds) — explore music comes and goes, as in Skyrim. */
  silence: [number, number] | null;
  /** Chance that a melodic phrase is left to the accompaniment (breathing space). */
  melodyRest: number;
  /** Fast-note tendency 0..1 (picks busier rhythm cells). */
  energy: number;
  /** Ornament probability on long notes. */
  ornament: number;
  /** Overall velocity scale. */
  dynamics: number;
  /** Reverb send. */
  reverb: number;
  /** Fade times when entering / leaving (s). */
  fadeIn: number;
  fadeOut: number;
}

export const STYLES: Record<Exclude<MusicState, 'silence'>, Style> = {
  'explore-day': {
    state: 'explore-day',
    tempo: [68, 84],
    meters: [[4, 0.65], [3, 0.35]],
    modes: ['dorian', 'mixolydian', 'hypolydian', 'dorian'],
    melody: [['aulos', 0.5], ['syrinx', 0.5]],
    answer: false,
    melodyOctave: { aulos: 0, syrinx: 1 },
    lyre: [['arp', 0.5], ['sparse', 0.3], ['heterophony', 0.2]],
    drums: [['none', 0.6], ['soft', 0.4]],
    cymbals: 0.05,
    drone: false,
    phraseBars: [4],
    pieceLength: [5, 8],
    silence: [14, 38],
    melodyRest: 0.2,
    energy: 0.35,
    ornament: 0.3,
    dynamics: 0.8,
    reverb: 0.45,
    fadeIn: 4,
    fadeOut: 4,
  },
  'explore-night': {
    state: 'explore-night',
    tempo: [54, 66],
    meters: [[3, 0.5], [4, 0.5]],
    modes: ['dorian', 'phrygian', 'hypolydian'],
    melody: [['syrinx', 0.7], ['aulos', 0.3]],
    answer: false,
    melodyOctave: { aulos: 0, syrinx: 1 },
    lyre: [['sparse', 0.8], ['drone', 0.2]],
    drums: [['none', 1]],
    cymbals: 0,
    drone: false,
    phraseBars: [4],
    pieceLength: [4, 6],
    silence: [22, 55],
    melodyRest: 0.4,
    energy: 0.1,
    ornament: 0.15,
    dynamics: 0.55,
    reverb: 0.6,
    fadeIn: 5,
    fadeOut: 5,
  },
  tension: {
    state: 'tension',
    tempo: [60, 72],
    meters: [[4, 1]],
    modes: ['phrygian', 'chromatic'],
    melody: [['aulos', 1]],
    answer: false,
    melodyOctave: { aulos: 0, syrinx: 1 },
    lyre: [['ostinato', 1]],
    drums: [['heartbeat', 1]],
    cymbals: 0.08,
    drone: true,
    phraseBars: [2, 4],
    pieceLength: [1000, 1000],
    silence: null,
    melodyRest: 0.55,
    energy: 0.2,
    ornament: 0.25,
    dynamics: 0.7,
    reverb: 0.5,
    fadeIn: 2.5,
    fadeOut: 3,
  },
  combat: {
    state: 'combat',
    tempo: [124, 138],
    meters: [[4, 1]],
    modes: ['phrygian', 'chromatic', 'dorian'],
    melody: [['aulos', 1]],
    answer: false,
    melodyOctave: { aulos: 0, syrinx: 1 },
    lyre: [['strum', 1]],
    drums: [['drive', 1]],
    cymbals: 0.6,
    drone: true,
    phraseBars: [2, 4],
    pieceLength: [1000, 1000],
    silence: null,
    melodyRest: 0.12,
    energy: 0.9,
    ornament: 0.45,
    dynamics: 1,
    reverb: 0.3,
    fadeIn: 0.6,
    fadeOut: 3.5,
  },
  tavern: {
    state: 'tavern',
    tempo: [104, 116],
    meters: [[6, 0.7], [4, 0.3]],
    modes: ['mixolydian', 'hypolydian', 'dorian'],
    melody: [['aulos', 0.6], ['syrinx', 0.4]],
    answer: true,
    melodyOctave: { aulos: 0, syrinx: 1 },
    lyre: [['strum', 0.7], ['arp', 0.3]],
    drums: [['dance', 1]],
    cymbals: 0.5,
    drone: false,
    phraseBars: [2, 4],
    pieceLength: [6, 9],
    silence: [1.5, 4],
    melodyRest: 0.05,
    energy: 0.75,
    ornament: 0.3,
    dynamics: 0.9,
    reverb: 0.25,
    fadeIn: 2,
    fadeOut: 2,
  },
  temple: {
    state: 'temple',
    tempo: [48, 56],
    meters: [[4, 1]],
    modes: ['dorian', 'phrygian'],
    melody: [['aulos', 1]],
    answer: false,
    melodyOctave: { aulos: 0, syrinx: 1 },
    lyre: [['drone', 0.6], ['heterophony', 0.4]],
    drums: [['processional', 1]],
    cymbals: 0.35,
    drone: true,
    phraseBars: [4],
    pieceLength: [1000, 1000],
    silence: null,
    melodyRest: 0.4,
    energy: 0.05,
    ornament: 0.35,
    dynamics: 0.7,
    reverb: 0.75,
    fadeIn: 4,
    fadeOut: 4,
  },
};
