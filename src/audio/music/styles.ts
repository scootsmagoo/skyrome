/** Per-state musical styles: tempo, metre, modes, instrumentation, texture and pacing. */
import type { ModeName } from './theory';

export type MusicState = 'silence' | 'explore-day' | 'explore-night' | 'tension' | 'combat' | 'tavern' | 'temple' | 'seikilos' | 'delphic';
export const MUSIC_STATES: readonly MusicState[] = ['silence', 'explore-day', 'explore-night', 'tension', 'combat', 'tavern', 'temple', 'seikilos', 'delphic'];

/** The two public-domain tunes the composer can perform as set pieces (setpieces.ts). */
export type SetPieceId = 'seikilos' | 'delphic';

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
  /** No note is played louder than this (0..1): the music stays a bed, never a blare. */
  velCap: number;
  /** The state's output level (linear), to balance the states against each other. */
  level: number;
  /**
   * Set pieces this state may perform: `start` is the chance that a new piece (or, in the continuous
   * states, the first section) is a set piece, `refresh` the chance at each later section break.
   * A state whose id is a set piece performs only that tune, again and again with silences between.
   */
  setPieces?: { ids: readonly SetPieceId[]; start: number; refresh: number };
  /** Reverb send. */
  reverb: number;
  /** Fade times when entering / leaving (s). */
  fadeIn: number;
  fadeOut: number;
}

/*
 * Levels and pacing (October 2026 rework): the music is a bed under the world, not a performance.
 * Dynamics and velCap are low, phrases leave rests, explore music is silent most of the time, and
 * even combat is a steady hand-drum with a soft harp and oboe, not a charge.
 */
export const STYLES: Record<Exclude<MusicState, 'silence'>, Style> = {
  'explore-day': {
    state: 'explore-day',
    tempo: [64, 78],
    meters: [[4, 0.6], [3, 0.4]],
    modes: ['dorian', 'mixolydian', 'hypolydian', 'dorian'],
    melody: [['aulos', 0.45], ['syrinx', 0.55]],
    answer: false,
    melodyOctave: { aulos: 0, syrinx: 0 },
    lyre: [['sparse', 0.5], ['arp', 0.2], ['heterophony', 0.3]],
    drums: [['none', 0.75], ['soft', 0.25]],
    cymbals: 0.03,
    drone: false,
    phraseBars: [4],
    pieceLength: [4, 6],
    silence: [35, 90],
    melodyRest: 0.4,
    energy: 0.25,
    ornament: 0.15,
    dynamics: 0.6,
    velCap: 0.62,
    level: 1,
    reverb: 0.5,
    fadeIn: 6,
    fadeOut: 6,
  },
  'explore-night': {
    state: 'explore-night',
    tempo: [50, 62],
    meters: [[3, 0.5], [4, 0.5]],
    modes: ['dorian', 'phrygian', 'hypolydian'],
    melody: [['syrinx', 0.6], ['aulos', 0.4]],
    answer: false,
    melodyOctave: { aulos: 0, syrinx: 0 },
    lyre: [['sparse', 0.8], ['drone', 0.2]],
    drums: [['none', 1]],
    cymbals: 0,
    drone: false,
    phraseBars: [4],
    pieceLength: [3, 5],
    silence: [50, 120],
    melodyRest: 0.55,
    energy: 0.08,
    ornament: 0.1,
    dynamics: 0.45,
    velCap: 0.5,
    level: 0.68,
    reverb: 0.65,
    fadeIn: 7,
    fadeOut: 5,
    setPieces: { ids: ['seikilos'], start: 0.18, refresh: 0 },
  },
  tension: {
    state: 'tension',
    tempo: [58, 68],
    meters: [[4, 1]],
    modes: ['phrygian', 'chromatic'],
    melody: [['aulos', 1]],
    answer: false,
    melodyOctave: { aulos: 0, syrinx: 1 },
    lyre: [['ostinato', 1]],
    drums: [['heartbeat', 1]],
    cymbals: 0.04,
    drone: true,
    phraseBars: [2, 4],
    pieceLength: [1000, 1000],
    silence: null,
    melodyRest: 0.65,
    energy: 0.15,
    ornament: 0.15,
    dynamics: 0.55,
    velCap: 0.55,
    level: 1,
    reverb: 0.5,
    fadeIn: 3,
    fadeOut: 4,
  },
  combat: {
    state: 'combat',
    tempo: [100, 114],
    meters: [[4, 1]],
    modes: ['phrygian', 'chromatic', 'dorian'],
    melody: [['aulos', 1]],
    answer: false,
    melodyOctave: { aulos: 0, syrinx: 1 },
    lyre: [['strum', 1]],
    drums: [['drive', 1]],
    cymbals: 0.35,
    drone: true,
    phraseBars: [2, 4],
    pieceLength: [1000, 1000],
    silence: null,
    melodyRest: 0.3,
    energy: 0.7,
    ornament: 0.25,
    dynamics: 0.72,
    velCap: 0.72,
    level: 0.76,
    reverb: 0.3,
    fadeIn: 2.6,
    fadeOut: 4,
  },
  tavern: {
    state: 'tavern',
    tempo: [100, 112],
    meters: [[6, 0.7], [4, 0.3]],
    modes: ['mixolydian', 'hypolydian', 'dorian'],
    melody: [['aulos', 0.6], ['syrinx', 0.4]],
    answer: true,
    melodyOctave: { aulos: 0, syrinx: 1 },
    lyre: [['strum', 0.7], ['arp', 0.3]],
    drums: [['dance', 1]],
    cymbals: 0.3,
    drone: false,
    phraseBars: [2, 4],
    pieceLength: [6, 9],
    silence: [3, 8],
    melodyRest: 0.15,
    energy: 0.6,
    ornament: 0.2,
    dynamics: 0.7,
    velCap: 0.68,
    level: 0.68,
    reverb: 0.25,
    fadeIn: 2.5,
    fadeOut: 2.5,
  },
  temple: {
    state: 'temple',
    tempo: [46, 54],
    meters: [[4, 1]],
    modes: ['dorian', 'phrygian'],
    melody: [['aulos', 1]],
    answer: false,
    melodyOctave: { aulos: 0, syrinx: 1 },
    lyre: [['drone', 0.6], ['heterophony', 0.4]],
    drums: [['processional', 1]],
    cymbals: 0.2,
    drone: true,
    phraseBars: [4],
    pieceLength: [1000, 1000],
    silence: null,
    melodyRest: 0.75,
    energy: 0.05,
    ornament: 0.2,
    dynamics: 0.55,
    velCap: 0.55,
    level: 0.92,
    reverb: 0.75,
    fadeIn: 5,
    fadeOut: 5,
    setPieces: { ids: ['delphic', 'seikilos'], start: 0.6, refresh: 0.3 },
  },
  // The set pieces on their own (the Lemuria night, the title, a ceremony): the tune, a long
  // silence, the tune again with a flute doubling it.
  seikilos: {
    state: 'seikilos',
    tempo: [60, 60],
    meters: [[3, 1]],
    modes: ['dorian'],
    melody: [['syrinx', 1]],
    answer: false,
    melodyOctave: { aulos: 0, syrinx: 1 },
    lyre: [['sparse', 1]],
    drums: [['none', 1]],
    cymbals: 0,
    drone: true,
    phraseBars: [4],
    pieceLength: [2, 2],
    silence: [40, 80],
    melodyRest: 0,
    energy: 0,
    ornament: 0,
    dynamics: 0.55,
    velCap: 0.55,
    level: 0.62,
    reverb: 0.7,
    fadeIn: 4,
    fadeOut: 5,
    setPieces: { ids: ['seikilos'], start: 1, refresh: 1 },
  },
  delphic: {
    state: 'delphic',
    tempo: [60, 60],
    meters: [[4, 1]],
    modes: ['phrygian'],
    melody: [['syrinx', 1]],
    answer: false,
    melodyOctave: { aulos: 0, syrinx: 1 },
    lyre: [['sparse', 1]],
    drums: [['processional', 1]],
    cymbals: 0,
    drone: true,
    phraseBars: [4],
    pieceLength: [2, 2],
    silence: [40, 80],
    melodyRest: 0,
    energy: 0,
    ornament: 0,
    dynamics: 0.55,
    velCap: 0.55,
    level: 0.75,
    reverb: 0.75,
    fadeIn: 4,
    fadeOut: 5,
    setPieces: { ids: ['delphic'], start: 1, refresh: 1 },
  },
};
