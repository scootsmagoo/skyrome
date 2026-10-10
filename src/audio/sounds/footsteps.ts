/**
 * Footsteps by surface and gait. A step is a heel strike and a toe/ball roll (walk), one hard
 * combined contact (run), or a slow careful roll (sneak), with surface-specific texture.
 * Roman footwear is leather (calcei, soleae, hobnailed caligae), so hard floors get a leather
 * slap rather than a heel click.
 */
import { Biquad, adEnv, addMode, addNoiseBurst, alloc } from '../dsp/core';
import type { BakeContext, SoundDef } from './types';
import { bubble, click, grains, thump, whoosh } from './util';

/**
 * stone is plain worked stone (steps, floors, flagstones), marble the bright polished kind
 * (travertine fora, temple floors), cobbles the rough basalt of the roads.
 */
export const SURFACES = ['stone', 'marble', 'cobbles', 'dirt', 'grass', 'wood', 'gravel', 'sand', 'water'] as const;
export type Surface = (typeof SURFACES)[number];
export const GAITS = ['walk', 'run', 'sneak'] as const;
export type Gait = (typeof GAITS)[number];

interface GaitShape {
  amp: number;
  /** Heel → toe gap (s). */
  gap: [number, number];
  /** Toe contact level relative to heel. */
  toe: number;
  /** Extra brightness / scuff. */
  scuff: number;
  /** Low-pass for softness. */
  lp: number;
}

const GAIT: Record<Gait, GaitShape> = {
  walk: { amp: 0.8, gap: [0.045, 0.07], toe: 0.55, scuff: 0.25, lp: 9000 },
  run: { amp: 1, gap: [0.012, 0.022], toe: 0.7, scuff: 0.5, lp: 12000 },
  sneak: { amp: 0.45, gap: [0.08, 0.12], toe: 0.8, scuff: 0.1, lp: 3200 },
};

function stepStone(out: Float32Array, c: BakeContext, g: GaitShape, t: number, level: number) {
  const { rate, rnd } = c;
  // Leather sole slap on stone: a bright-ish contact, a body thud through the leg, a little grit.
  click(out, rate, rnd, t, { bp: rnd.range(1800, 2800), q: 1, amp: 0.8 * level, t60: 0.008 });
  addNoiseBurst(out, rate, rnd, t, { dur: 0.035, amp: 0.6 * level, attack: 0.0005, t60: 0.02, bp: rnd.range(800, 1300), q: 0.8 });
  thump(out, rate, rnd, t, { freq: rnd.range(110, 150), amp: 0.3 * level, t60: 0.03, lp: 350, modeAmp: 0.25 });
  grains(out, rate, rnd, t + 0.002, 0.03 + g.scuff * 0.05, { density: 300, fLo: 3500, fHi: 9000, amp: 0.12 * level * (0.4 + g.scuff), grain: [0.001, 0.003] });
}

function stepDirt(out: Float32Array, c: BakeContext, g: GaitShape, t: number, level: number) {
  const { rate, rnd } = c;
  thump(out, rate, rnd, t, { freq: rnd.range(70, 95), amp: 0.7 * level, t60: 0.05, lp: rnd.range(300, 420), modeAmp: 0.3 });
  addNoiseBurst(out, rate, rnd, t, { dur: 0.05, amp: 0.3 * level, attack: 0.001, t60: 0.03, bp: rnd.range(450, 650), q: 0.9 }); // packed earth 'pat'
  grains(out, rate, rnd, t, 0.05, { density: 500, fLo: 700, fHi: 3000, q: 1.4, amp: 0.35 * level, grain: [0.002, 0.005] });
  if (g.scuff > 0.2) addNoiseBurst(out, rate, rnd, t + 0.01, { dur: 0.07, amp: 0.08 * level * g.scuff, attack: 0.01, t60: 0.05, lp: 2200 });
}

function stepGrass(out: Float32Array, c: BakeContext, g: GaitShape, t: number, level: number) {
  const { rate, rnd } = c;
  thump(out, rate, rnd, t, { freq: rnd.range(60, 80), amp: 0.5 * level, t60: 0.04, lp: 240, modeAmp: 0.25 });
  // Blades brushing and bending: a soft swish plus a dense crinkle.
  whoosh(out, rate, rnd, t - 0.01, 0.16 + g.scuff * 0.06, {
    fc: (u) => 3600 + 1800 * u,
    amp: (u) => adEnv(u * 0.2, 0.025, 0.12) * 0.22 * level,
    q: 0.7,
  });
  grains(out, rate, rnd, t, 0.14, { density: 1300, fLo: 2500, fHi: 8000, q: 1.6, amp: 0.2 * level, grain: [0.001, 0.0035], env: (u) => Math.pow(1 - u, 1.5) });
}

function stepWood(out: Float32Array, c: BakeContext, g: GaitShape, t: number, level: number) {
  const { rate, rnd } = c;
  const f = rnd.range(150, 230);
  // Plank: low hollow modes + a knock.
  addMode(out, rate, t, f, 0.38 * level, 0.08, { attack: 0.001 });
  addMode(out, rate, t, f * 2.32, 0.28 * level, 0.07, { attack: 0.001 });
  addMode(out, rate, t, f * 3.9, 0.12 * level, 0.05, { attack: 0.001 });
  addNoiseBurst(out, rate, rnd, t, { dur: 0.08, amp: 0.4 * level, attack: 0.001, t60: 0.06, bp: rnd.range(280, 360), q: 2.5 });
  addNoiseBurst(out, rate, rnd, t, { dur: 0.03, amp: 0.25 * level, attack: 0.0005, t60: 0.02, bp: rnd.range(900, 1300), q: 1.2 });
  click(out, rate, rnd, t, { bp: rnd.range(1800, 2600), amp: 0.45 * level, t60: 0.006 });
}

function stepGravel(out: Float32Array, c: BakeContext, g: GaitShape, t: number, level: number) {
  const { rate, rnd } = c;
  thump(out, rate, rnd, t, { freq: rnd.range(70, 95), amp: 0.55 * level, t60: 0.04, lp: 300, modeAmp: 0.25 });
  const dur = 0.09 + (1 - g.scuff) * 0.06;
  grains(out, rate, rnd, t, dur, {
    density: 2600 + g.scuff * 1500,
    fLo: 1300,
    fHi: 7500,
    q: 2.2,
    amp: 0.45 * level,
    grain: [0.0015, 0.005],
    env: (u) => (u < 0.12 ? u / 0.12 : Math.pow(1 - (u - 0.12) / 0.88, 1.3)),
    spread: 2,
  });
}

function stepWater(out: Float32Array, c: BakeContext, g: GaitShape, t: number, level: number) {
  const { rate, rnd } = c;
  // Splash body (band-passed noise swelling then decaying), a low plop, and droplets falling back.
  addNoiseBurst(out, rate, rnd, t, { dur: 0.32, amp: 0.55 * level, attack: 0.012, t60: 0.22, bp: rnd.range(900, 1500), q: 0.6 });
  addNoiseBurst(out, rate, rnd, t + 0.005, { dur: 0.2, amp: 0.18 * level, attack: 0.006, t60: 0.14, hp: 3500 });
  addMode(out, rate, t, rnd.range(110, 160), 0.35 * level, 0.06, { attack: 0.004, glide: -1.5 });
  const drops = Math.round(8 + 10 * g.scuff + rnd.range(0, 6));
  for (let i = 0; i < drops; i++) {
    const dt = 0.03 + Math.pow(rnd.next(), 1.4) * 0.32;
    bubble(out, rate, t + dt, rnd.range(700, 2300), rnd.range(0.012, 0.035), rnd.range(0.05, 0.16) * level, rnd.range(1.3, 1.9));
  }
}

// The synthesised steps stand in until the recordings (samples.ts) have loaded, or if they cannot.
const RECIPE: Record<Surface, typeof stepStone> = {
  stone: stepStone,
  marble: stepStone,
  cobbles: stepStone,
  dirt: stepDirt,
  grass: stepGrass,
  wood: stepWood,
  gravel: stepGravel,
  sand: stepGravel,
  water: stepWater,
};

const LENGTH: Record<Surface, number> = { stone: 0.3, marble: 0.3, cobbles: 0.32, dirt: 0.32, grass: 0.38, wood: 0.34, gravel: 0.38, sand: 0.38, water: 0.6 };

function bakeStep(surface: Surface, gait: Gait, c: BakeContext): Float32Array {
  const g = GAIT[gait];
  const out = alloc(LENGTH[surface] + (gait === 'sneak' ? 0.08 : 0), c.rate);
  const t0 = 0.004;
  const level = g.amp * c.rnd.vary(0.08);
  const r = RECIPE[surface];
  // Heel, then toe/ball.
  r(out, c, g, t0, level);
  r(out, c, g, t0 + c.rnd.range(g.gap[0], g.gap[1]), level * g.toe * c.rnd.vary(0.15));
  if (gait === 'run' && surface !== 'water') {
    // Push-off scuff.
    addNoiseBurst(out, c.rate, c.rnd, t0 + 0.05, { dur: 0.06, amp: 0.05 * g.scuff, attack: 0.008, t60: 0.04, hp: 2500 });
  }
  if (g.lp < 10000) new Biquad().lowpass(g.lp, 0.6, c.rate).run(out);
  return out;
}

// Every variant is levelled to the same loudness, so these set how loud a surface is against another.
// Set from the October 2026 audit (scripts/sfx/audit.mjs: K-weighted loudest 200 ms of each toned
// recording plus this gain): walking on every surface lands within 1.5 dB of the street set (stone
// -29.3, basalt -29.5 LUFS effective), the soft ones (grass, sand, dirt, wood) about 1 dB under it.
const SURFACE_GAIN: Record<Surface, number> = { stone: 0, marble: -0.5, cobbles: 0.5, dirt: 2, grass: 5.5, wood: 3.5, gravel: 1, sand: 0.5, water: 0 };
const GAIT_GAIN: Record<Gait, number> = { run: 0, walk: -3, sneak: -8 };
const SURFACE_CENTROID: Record<Surface, [number, number]> = {
  stone: [500, 4000],
  marble: [500, 4000],
  cobbles: [500, 4000],
  dirt: [180, 2200],
  grass: [1200, 7000],
  wood: [180, 2500],
  gravel: [1200, 6500],
  sand: [1200, 6500],
  water: [600, 4500],
};

export const footstepSounds: SoundDef[] = SURFACES.flatMap((surface) =>
  GAITS.map(
    (gait): SoundDef => ({
      id: `step.${surface}.${gait}`,
      label: `${surface} ${gait}`,
      group: 'Footsteps',
      bus: 'sfx',
      kind: 'oneshot',
      variants: 5,
      gainDb: -9 + SURFACE_GAIN[surface] + GAIT_GAIN[gait],
      maxVoices: 8,
      priority: 0.3,
      spatial: { ref: 1.5, max: 35, rolloff: 1.2 },
      reverb: 0.15,
      randomRate: 0.06,
      randomGainDb: 1.5,
      expect: { dur: [0.04, LENGTH[surface] + 0.1], centroid: gait === 'sneak' ? [80, SURFACE_CENTROID[surface][1]] : SURFACE_CENTROID[surface] },
      bake: (c) => bakeStep(surface, gait, c),
    }),
  ),
);

/** Landing after a jump or fall: a heavier double contact. */
export const landingSounds: SoundDef[] = SURFACES.map(
  (surface): SoundDef => ({
    id: `land.${surface}`,
    label: `${surface} land`,
    group: 'Footsteps',
    bus: 'sfx',
    kind: 'oneshot',
    variants: 3,
    gainDb: -6 + SURFACE_GAIN[surface],
    maxVoices: 4,
    priority: 0.5,
    spatial: { ref: 1.5, max: 40, rolloff: 1.2 },
    reverb: 0.2,
    randomRate: 0.05,
    expect: { dur: [0.05, 0.8] },
    bake: (c) => {
      const out = alloc(LENGTH[surface] + 0.1, c.rate);
      const g = GAIT.run;
      const r = RECIPE[surface];
      r(out, c, g, 0.004, 1);
      r(out, c, g, 0.004 + c.rnd.range(0.02, 0.04), 0.8);
      thump(out, c.rate, c.rnd, 0.004, { freq: 70, amp: 0.6, t60: 0.08, lp: 220 });
      return out;
    },
  }),
);
