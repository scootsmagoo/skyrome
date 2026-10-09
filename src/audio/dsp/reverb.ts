/**
 * Procedural impulse responses for the convolution reverbs: decorrelated stereo noise with an
 * exponential decay that darkens over time (air and soft surfaces eat the highs), plus discrete
 * early reflections (street walls, colonnades). No samples needed.
 */
import { Biquad, Rand } from './core';

export type ReverbPreset = 'open' | 'street' | 'forum' | 'room' | 'hall' | 'temple' | 'cave' | 'music' | 'arena' | 'baths' | 'stair';

export interface ReverbSpec {
  /** Seconds to -60 dB. */
  t60: number;
  predelay: number;
  /** Low-pass at the start and end of the tail (Hz). */
  brightStart: number;
  brightEnd: number;
  /** Early reflection delays (s) and gains. */
  early: readonly (readonly [number, number])[];
  /** Overall wet level for this space (applied by the engine's return gain). */
  wet: number;
  /** How much longer the low end rings than the highs (a stone room keeps its bass). Default 1.5. */
  lowMult?: number;
  /** Seconds for the tail to fill in from sparse reflections to a dense wash. Default 0.05. */
  density?: number;
  /** Late discrete echoes (flutter between far walls): [delay s, gain]. */
  echoes?: readonly (readonly [number, number])[];
}

export const REVERBS: Record<ReverbPreset, ReverbSpec> = {
  // Open ground: a little ground bounce, almost no tail.
  open: { t60: 0.7, predelay: 0.008, brightStart: 6000, brightEnd: 1500, early: [[0.011, 0.5], [0.045, 0.2]], wet: 0.35 },
  // A narrow street between insulae: strong slap-back between facing walls.
  street: { t60: 1.1, predelay: 0.006, brightStart: 7000, brightEnd: 1800, early: [[0.018, 0.6], [0.036, 0.45], [0.054, 0.3], [0.072, 0.2], [0.09, 0.12]], wet: 0.6 },
  // A forum: a big square ringed with colonnades and temple fronts.
  forum: { t60: 1.7, predelay: 0.02, brightStart: 7000, brightEnd: 1600, early: [[0.04, 0.4], [0.075, 0.35], [0.12, 0.25], [0.16, 0.15]], wet: 0.6 },
  // A taberna / popina: small, dense, wooden.
  room: { t60: 0.55, predelay: 0.003, brightStart: 5000, brightEnd: 2000, early: [[0.006, 0.5], [0.011, 0.4], [0.017, 0.3]], wet: 0.55 },
  // A basilica or bath hall: long and bright-ish.
  hall: { t60: 2.6, predelay: 0.025, brightStart: 8000, brightEnd: 2200, early: [[0.03, 0.35], [0.05, 0.3], [0.08, 0.2]], wet: 0.8 },
  // A temple cella: stone, tall, dark and long.
  temple: { t60: 3.3, predelay: 0.03, brightStart: 6000, brightEnd: 1200, early: [[0.035, 0.3], [0.06, 0.25], [0.1, 0.15]], wet: 0.9 },
  // Cloaca, crypt, mithraeum: damp and dark.
  cave: { t60: 2.2, predelay: 0.012, brightStart: 3500, brightEnd: 800, early: [[0.012, 0.5], [0.025, 0.4], [0.04, 0.3]], wet: 0.85 },
  // The Colosseum's bowl: open to the sky, so a short low tail, but the far side of the cavea throws
  // back a distinct slap and the tiers flutter.
  arena: { t60: 2.0, predelay: 0.02, brightStart: 6500, brightEnd: 1400, early: [[0.05, 0.35], [0.11, 0.3], [0.17, 0.22]], echoes: [[0.19, 0.5], [0.23, 0.3], [0.38, 0.22]], lowMult: 1.1, density: 0.1, wet: 0.65 },
  // Thermae: tiled and plastered vaults over water, very bright and long.
  baths: { t60: 3.0, predelay: 0.02, brightStart: 9000, brightEnd: 2800, early: [[0.02, 0.4], [0.037, 0.35], [0.06, 0.3], [0.09, 0.2]], lowMult: 1.2, density: 0.03, wet: 0.85 },
  // A spiral stair in a column drum: a narrow stone tube, short and ringing, with a flutter.
  stair: { t60: 1.5, predelay: 0.004, brightStart: 5500, brightEnd: 1500, early: [[0.007, 0.6], [0.014, 0.5], [0.021, 0.4], [0.034, 0.3]], echoes: [[0.052, 0.25], [0.088, 0.15]], lowMult: 1.3, density: 0.02, wet: 0.7 },
  // The non-diegetic music space: a warm, generous hall.
  music: { t60: 2.4, predelay: 0.02, brightStart: 7500, brightEnd: 2500, early: [[0.021, 0.3], [0.037, 0.25], [0.058, 0.18]], wet: 1 },
};

/** Render a stereo impulse response [left, right] at `rate`. */
export function impulseResponse(spec: ReverbSpec, rate: number, seed = 7): [Float32Array, Float32Array] {
  const len = Math.ceil((spec.predelay + spec.t60 * 1.05) * rate);
  const out: [Float32Array, Float32Array] = [new Float32Array(len), new Float32Array(len)];
  for (let ch = 0; ch < 2; ch++) {
    const rnd = new Rand(seed * 31 + ch * 977);
    const buf = out[ch];
    const lp = new Biquad();
    const p0 = Math.round(spec.predelay * rate);
    const n = len - p0;
    // The low end: a slower-decaying, low-passed layer (stone rooms keep their bass).
    const lowMult = spec.lowMult ?? 1.5;
    const lowLp = new Biquad().lowpass(320, 0.7, rate);
    const dens = spec.density ?? 0.05;
    // The low layer and the sparse start change the measured decay: shorten the tail so a preset's
    // t60 is what the room measures (checked with a backward-integrated decay).
    const tMain = spec.t60 / (0.8 + 0.95 * (lowMult - 1));
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      if ((i & 63) === 0) {
        const u = Math.min(1, t / spec.t60);
        lp.lowpass(spec.brightStart * Math.pow(spec.brightEnd / spec.brightStart, u), 0.6, rate);
      }
      // Build-up over the first few ms so the diffuse tail blooms rather than clicks.
      const env = Math.pow(10, (-3 * t) / tMain) * Math.min(1, t / 0.012 + 0.15);
      // Reflections arrive sparsely at first and fill in (a room's echo density grows with t²): a
      // random gate, scaled to keep the energy, instead of noise that is dense from the first ms.
      const p = Math.min(1, 0.12 + 0.88 * (t / dens) * (t / dens));
      const gate = p >= 1 || rnd.next() < p ? 1 / Math.sqrt(p) : 0;
      const low = lowLp.process(rnd.bi()) * Math.pow(10, (-3 * t) / (tMain * lowMult)) * 2.2;
      buf[p0 + i] = lp.process(rnd.bi() * gate) * env + low * Math.min(1, t / 0.02);
    }
    // Early reflections, slightly different per ear: short smeared bursts (a wall is not a
    // perfect mirror) that stand clearly above the young diffuse tail.
    for (const [d, g] of spec.early) {
      const di = Math.round(d * (ch ? 1.07 : 0.94) * rate);
      const bl = Math.round(0.003 * rate);
      const blp = new Biquad().lowpass(spec.brightStart * 0.8, 0.7, rate);
      for (let i = 0; i < bl && di + i < len; i++) buf[di + i] += blp.process(rnd.bi()) * g * 3 * (1 - i / bl);
    }
    // Late discrete echoes (arena, stair): a smeared burst per echo.
    for (const [d, g] of spec.echoes ?? []) {
      const di = Math.round(d * (ch ? 1.05 : 0.96) * rate);
      const bl = Math.round(0.012 * rate);
      const elp = new Biquad().lowpass(3200, 0.7, rate);
      for (let i = 0; i < bl && di + i < len; i++) buf[di + i] += elp.process(rnd.bi()) * g * 3 * Math.sin((Math.PI * i) / bl);
    }
    // Normalize energy (Σh² = 0.3) so presets differ in length and colour, not raw level:
    // a broadband input comes back at roughly half its level.
    let e = 0;
    for (let i = 0; i < len; i++) e += buf[i] * buf[i];
    const g = Math.sqrt(0.3 / (e + 1e-12));
    for (let i = 0; i < len; i++) buf[i] *= g;
  }
  return out;
}
