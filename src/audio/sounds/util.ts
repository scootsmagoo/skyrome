/** Higher-level synthesis gestures shared by the sound recipes (impacts, grains, whooshes, creaks). */
import { Biquad, OnePole, Rand, TWO_PI, adEnv, addMode, addNoiseBurst } from '../dsp/core';

/** Low body impact: low-passed noise thud plus a low mode (feet, bodies, doors). */
export function thump(
  out: Float32Array,
  rate: number,
  rnd: Rand,
  t: number,
  o: { freq?: number; amp?: number; t60?: number; lp?: number; modeAmp?: number; glide?: number },
) {
  const amp = o.amp ?? 1;
  const t60 = o.t60 ?? 0.06;
  addNoiseBurst(out, rate, rnd, t, { dur: t60 * 1.4, amp: amp * 1.6, attack: 0.002, t60, lp: o.lp ?? 260 });
  addMode(out, rate, t, o.freq ?? 90, amp * (o.modeAmp ?? 0.45), t60 * 1.2, { attack: 0.002, glide: o.glide ?? 0.8 });
}

/** Sharp contact click (hard surfaces, latches, tiny metal). */
export function click(out: Float32Array, rate: number, rnd: Rand, t: number, o: { bp?: number; q?: number; amp?: number; t60?: number }) {
  const t60 = o.t60 ?? 0.006;
  addNoiseBurst(out, rate, rnd, t, { dur: t60 * 1.5, amp: o.amp ?? 0.6, attack: 0.0003, t60, bp: o.bp ?? 2800, q: o.q ?? 1.2 });
}

/**
 * Granular texture: many tiny filtered noise grains (gravel crunch, grass crinkle, fire crackle,
 * mail rattle). `env(u)` shapes density/level over the duration (u in 0..1).
 */
export function grains(
  out: Float32Array,
  rate: number,
  rnd: Rand,
  start: number,
  dur: number,
  o: {
    density: number;
    fLo: number;
    fHi: number;
    q?: number;
    amp: number;
    grain?: [number, number];
    env?: (u: number) => number;
    /** Exponent applied to grain amplitudes (higher = sparser loud grains). */
    spread?: number;
  },
) {
  const count = Math.round(o.density * dur);
  const [g0, g1] = o.grain ?? [0.002, 0.006];
  const env = o.env ?? ((u: number) => Math.sin(Math.PI * Math.min(1, u)));
  for (let i = 0; i < count; i++) {
    const u = rnd.next();
    const t = start + u * dur;
    const e = env(u);
    if (e <= 0.001) continue;
    const f = o.fLo * Math.pow(o.fHi / o.fLo, rnd.next());
    const gd = rnd.range(g0, g1);
    const a = o.amp * e * Math.pow(rnd.next(), o.spread ?? 1.5);
    addNoiseBurst(out, rate, rnd, t, { dur: gd, amp: a, attack: 0.0002, t60: gd * 0.7, bp: f, q: o.q ?? 2 });
  }
}

/**
 * Whoosh: noise through a band-pass whose centre and level follow curves over `dur`
 * (sword swings, arrows, menu swishes). `fc(u)`/`amp(u)` take u in 0..1.
 */
export function whoosh(
  out: Float32Array,
  rate: number,
  rnd: Rand,
  start: number,
  dur: number,
  o: { fc: (u: number) => number; amp: (u: number) => number; q?: number; gain?: number; pink?: boolean },
) {
  const s0 = Math.round(start * rate);
  const n = Math.min(out.length - s0, Math.round(dur * rate));
  const bp = new Biquad();
  const bp2 = new Biquad();
  const q = o.q ?? 1.5;
  const gain = o.gain ?? 1;
  let b0 = 0;
  let b1 = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if ((i & 15) === 0) {
      const f = o.fc(u);
      bp.bandpass(f, q, rate);
      bp2.bandpass(f, q, rate);
    }
    let w = rnd.bi();
    if (o.pink) {
      b0 = 0.97 * b0 + w * 0.3;
      b1 = 0.6 * b1 + w * 0.6;
      w = b0 + b1 + w * 0.2;
    }
    out[s0 + i] += bp2.process(bp.process(w)) * o.amp(u) * gain * 2.5;
  }
}

/**
 * Creak: stick-slip friction (an irregular pulse train whose rate glides) through wooden
 * resonances. Doors, hinges, ships, carts.
 */
export function creak(
  out: Float32Array,
  rate: number,
  rnd: Rand,
  start: number,
  dur: number,
  o: { pulseHz: (u: number) => number; amp: (u: number) => number; formants: [number, number][]; jitter?: number },
) {
  const s0 = Math.round(start * rate);
  const n = Math.min(out.length - s0, Math.round(dur * rate));
  const res = o.formants.map(([f, q]) => new Biquad().bandpass(f, q, rate));
  const lp = new OnePole(5000, rate);
  let phase = 0;
  let mul = 1;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    phase += (o.pulseHz(u) * mul) / rate;
    let x = 0;
    if (phase >= 1) {
      phase -= 1;
      mul = 1 + rnd.bi() * (o.jitter ?? 0.12);
      x = 0.6 + 0.4 * rnd.next();
    }
    x = lp.process(x);
    let y = 0;
    for (const r of res) y += r.process(x);
    out[s0 + i] += y * o.amp(u) * 3;
  }
}

/** Water drop / bubble (Minnaert): a sine whose pitch rises as it decays. */
export function bubble(out: Float32Array, rate: number, start: number, f0: number, dur: number, amp: number, rise = 1.4) {
  const s0 = Math.round(start * rate);
  const n = Math.min(out.length - s0, Math.round(dur * rate));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const f = f0 * (1 + (rise - 1) * u);
    ph += (TWO_PI * f) / rate;
    const e = u < 0.08 ? u / 0.08 : Math.pow(1 - (u - 0.08) / 0.92, 2);
    out[s0 + i] += Math.sin(ph) * e * amp;
  }
}

/** Set of decaying modes (a struck object). `ratios` relative to `f`; amps and t60s per mode. */
export function strike(
  out: Float32Array,
  rate: number,
  rnd: Rand,
  t: number,
  f: number,
  modes: readonly (readonly [ratio: number, amp: number, t60: number])[],
  o: { amp?: number; detune?: number; noise?: number; noiseBp?: number } = {},
) {
  const amp = o.amp ?? 1;
  for (const [r, a, t60] of modes) {
    const fr = f * r * (1 + rnd.bi() * (o.detune ?? 0.01));
    addMode(out, rate, t, fr, a * amp, t60 * rnd.vary(0.15), { phase: rnd.next() * TWO_PI });
  }
  if (o.noise) addNoiseBurst(out, rate, rnd, t, { dur: 0.012, amp: o.noise * amp, attack: 0.0002, t60: 0.006, bp: o.noiseBp ?? 3500, q: 0.9 });
}

/** Free-free bar partial ratios (sword blades, metal bars). */
export const BAR_RATIOS = [1, 2.756, 5.404, 8.933] as const;

/** A smooth hump 0→1→0 with the peak at `peak` (0..1). */
export function hump(u: number, peak = 0.4, sharp = 1.5): number {
  if (u <= 0 || u >= 1) return 0;
  const v = u < peak ? u / peak : (1 - u) / (1 - peak);
  return Math.pow(Math.sin((v * Math.PI) / 2), sharp);
}

/** Attack/decay helper re-exported for recipes. */
export { adEnv };
