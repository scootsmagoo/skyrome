/**
 * Small cascade formant synthesizer (after Klatt 1980): a Rosenberg glottal pulse with jitter,
 * shimmer and optional creak, plus aspiration noise, through four cascaded formant resonators,
 * with a parallel frication branch for consonants. Parameters are functions of time evaluated at
 * a control rate, so contours (pitch falls, vowel glides) are cheap.
 *
 * Used for grunts, pain and death cries, crowd babble, vendor calls and (with dog-like formants)
 * barking. Kept deliberately breathy and short: synthetic voices get silly when held too long.
 */
import { Biquad, OnePole, Rand, TWO_PI, alloc } from './core';

export type Formants = readonly [number, number, number, number?];

/** Average formant frequencies (Hz). Adult male (Hillenbrand et al. 1995, rounded) and female. */
export const VOWELS = {
  m: {
    a: [730, 1090, 2440, 3400],
    uh: [640, 1190, 2390, 3400],
    schwa: [500, 1500, 2500, 3400],
    e: [530, 1840, 2480, 3400],
    i: [280, 2250, 2950, 3500],
    o: [570, 840, 2410, 3400],
    u: [310, 870, 2240, 3300],
    ae: [660, 1720, 2410, 3400],
    m: [260, 1000, 2300, 3300],
  },
  f: {
    a: [850, 1220, 2810, 3900],
    uh: [760, 1400, 2780, 3900],
    schwa: [580, 1700, 2850, 3900],
    e: [610, 2330, 2990, 3900],
    i: [310, 2790, 3310, 4000],
    o: [590, 920, 2710, 3900],
    u: [370, 950, 2670, 3800],
    ae: [860, 2050, 2850, 3900],
    m: [300, 1150, 2650, 3800],
  },
} as const satisfies Record<'m' | 'f', Record<string, Formants>>;

export type Vowel = keyof typeof VOWELS.m;
export type Sex = 'm' | 'f';

export interface VoiceParams {
  dur: number;
  /** Fundamental (Hz) over time. */
  f0: (t: number) => number;
  /** Voicing amplitude 0..1 over time. */
  amp: (t: number) => number;
  /** Aspiration (breath) noise amplitude 0..1 over time, shaped by the formants. */
  asp?: (t: number) => number;
  /** Frication noise amplitude over time (s / sh / f), parallel branch. */
  fric?: (t: number) => number;
  /** Centre of the frication band (Hz): ~6000 's', ~3000 'sh', ~1500 'h'-ish. */
  fricFreq?: (t: number) => number;
  /** Formant frequencies F1..F4 over time. */
  formants: (t: number) => Formants;
  /** Formant bandwidth multiplier (1 = normal; >1 = duller / more distant). */
  bwScale?: number;
  /** Cycle-to-cycle pitch jitter (fraction, 0.005..0.05). */
  jitter?: number;
  /** Cycle-to-cycle amplitude jitter (fraction). */
  shimmer?: number;
  /** Glottal open quotient 0.4 (pressed) .. 0.8 (breathy). */
  openQuotient?: number;
  /** Vocal fry 0..1 over time (very low, irregular pulses). */
  creak?: (t: number) => number;
  /** Source tilt low-pass (Hz). Lower = softer, darker phonation. */
  tilt?: number;
  /** Output low-pass (Hz). */
  lowpass?: number;
}

const CONTROL = 32;

/** Interpolate between two formant sets. */
export function mixFormants(a: Formants, b: Formants, u: number): Formants {
  return [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u,
    (a[3] ?? 3500) + ((b[3] ?? 3500) - (a[3] ?? 3500)) * u,
  ];
}

/** Formant contour gliding through vowels at given times: [[t, vowel], ...]. */
export function vowelPath(sex: Sex, path: readonly (readonly [number, Vowel])[], shift = 1): (t: number) => Formants {
  const table = VOWELS[sex];
  return (t) => {
    let f: Formants;
    if (t <= path[0][0]) f = table[path[0][1]];
    else if (t >= path[path.length - 1][0]) f = table[path[path.length - 1][1]];
    else {
      let i = 1;
      while (path[i][0] < t) i++;
      const [t0, v0] = path[i - 1];
      const [t1, v1] = path[i];
      f = mixFormants(table[v0], table[v1], (t - t0) / Math.max(1e-6, t1 - t0));
    }
    return shift === 1 ? f : [f[0] * shift, f[1] * shift, f[2] * shift, (f[3] ?? 3500) * shift];
  };
}

class Resonator {
  private a = 0;
  private b = 0;
  private c = 0;
  private y1 = 0;
  private y2 = 0;
  set(f: number, bw: number, rate: number) {
    const T = 1 / rate;
    const fc = Math.min(f, rate * 0.45);
    this.c = -Math.exp(-TWO_PI * bw * T);
    this.b = 2 * Math.exp(-Math.PI * bw * T) * Math.cos(TWO_PI * fc * T);
    this.a = 1 - this.b - this.c;
  }
  process(x: number): number {
    const y = this.a * x + this.b * this.y1 + this.c * this.y2;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

const BASE_BW = [80, 110, 160, 250];

/** Synthesize a vocalization into a new buffer (not normalized). */
export function synthVoice(p: VoiceParams, rate: number, rnd: Rand): Float32Array {
  // Extra room for the resonators to ring out after the voicing stops.
  const out = alloc(p.dur + 0.08, rate);
  const res = [new Resonator(), new Resonator(), new Resonator(), new Resonator()];
  const fricBp = new Biquad();
  const tilt = new OnePole(p.tilt ?? 2800, rate);
  const asp = p.asp ?? (() => 0.08);
  const jitter = p.jitter ?? 0.012;
  const shimmer = p.shimmer ?? 0.08;
  const oq = p.openQuotient ?? 0.6;
  const bwScale = p.bwScale ?? 1;

  let phase = 0;
  let periodF0Mul = 1;
  let periodAmp = 1;
  let prevG = 0;
  let f0a = p.f0(0);
  let f0b = f0a;
  let ampA = p.amp(0);
  let ampB = ampA;
  let aspV = 0;
  let fricV = 0;
  let creakV = 0;

  for (let n = 0; n < out.length; n++) {
    if (n % CONTROL === 0) {
      const t = n / rate;
      const tn = (n + CONTROL) / rate;
      f0a = f0b;
      f0b = p.f0(tn);
      ampA = ampB;
      ampB = p.amp(tn);
      aspV = asp(t);
      fricV = p.fric ? p.fric(t) : 0;
      creakV = p.creak ? p.creak(t) : 0;
      const F = p.formants(t);
      for (let k = 0; k < 4; k++) res[k].set(F[k] ?? 3500, BASE_BW[k] * bwScale * (1 + creakV * 0.5), rate);
      if (p.fric) fricBp.bandpass(p.fricFreq ? p.fricFreq(t) : 5000, 2.2, rate);
    }
    const u = (n % CONTROL) / CONTROL;
    let f0 = f0a + (f0b - f0a) * u;
    const past = n / rate > p.dur;
    const amp = past ? 0 : ampA + (ampB - ampA) * u;
    if (past) aspV = fricV = 0;
    if (creakV > 0) f0 = f0 * (1 - creakV) + 48 * creakV;

    // Glottal pulse (Rosenberg) and its derivative (lip radiation).
    phase += (f0 * periodF0Mul) / rate;
    if (phase >= 1) {
      phase -= 1;
      const j = jitter + creakV * 0.25;
      periodF0Mul = 1 + rnd.bi() * j;
      periodAmp = 1 + rnd.bi() * (shimmer + creakV * 0.5);
    }
    const tp = oq * 0.62;
    const tc = oq * 0.38;
    let g = 0;
    if (phase < tp) g = 0.5 - 0.5 * Math.cos((Math.PI * phase) / tp);
    else if (phase < tp + tc) g = Math.cos((Math.PI * (phase - tp)) / (2 * tc));
    const dg = (g - prevG) * (rate / Math.max(60, f0)) * 0.12;
    prevG = g;
    // Aspiration is modulated by the glottal opening (breathy voice), plus a steady part.
    const noise = rnd.bi();
    const breath = noise * aspV * (0.35 + 0.65 * g);
    let x = tilt.process(dg * amp * periodAmp) + breath * 0.5;
    for (let k = 0; k < 4; k++) x = res[k].process(x);
    if (fricV > 0) x += fricBp.process(rnd.bi()) * fricV * 0.5;
    out[n] = x;
  }

  const hp = new Biquad().highpass(70, 0.7, rate);
  const lp = new Biquad().lowpass(p.lowpass ?? 5200, 0.7, rate);
  for (let n = 0; n < out.length; n++) out[n] = lp.process(hp.process(out[n]));
  return out;
}
