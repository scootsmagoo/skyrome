/**
 * Karplus–Strong plucked string (extended: pluck position, brightness, fractional-delay tuning,
 * loss calibrated to a T60) plus a small wooden-body resonance. Used for the lyre / kithara and
 * the bow string.
 */
import { Biquad, OnePole, Rand, TWO_PI, alloc } from './core';

export interface PluckOptions {
  /** Seconds of output. */
  seconds: number;
  /** Time for the fundamental to decay by 60 dB. */
  t60?: number;
  /** 0..1: excitation brightness (plectrum ≈ 0.8, finger ≈ 0.4). */
  brightness?: number;
  /** 0..0.5: where along the string it is plucked (0.5 = middle, hollow; 0.1 = near the bridge, bright). */
  pluckPos?: number;
  /** 0..1: how fast upper harmonics die relative to the fundamental (loop low-pass blend). */
  damping?: number;
  amp?: number;
  /** Apply the wooden soundbox resonance (lyre / kithara). */
  body?: 'lyre' | 'kithara' | 'bow' | null;
}

/**
 * Render a single plucked note into a new buffer.
 * Pitch accuracy: loop delay = rate/freq including the averaging filter's half-sample delay and a
 * first-order all-pass for the fractional part (Jaffe & Smith), so tuning is within a few cents.
 */
export function pluck(freq: number, rate: number, rnd: Rand, o: PluckOptions): Float32Array {
  const out = alloc(o.seconds, rate);
  const P = rate / freq;
  const damping = o.damping ?? 0.5;
  // Loop low-pass: y = (1-s)·x[n] + s·x[n-1]; delay ≈ s samples; s = 0.5 is the classic average.
  const s = 0.1 + 0.4 * damping;
  let N = Math.floor(P - s - 0.1);
  if (N < 2) N = 2;
  const d = P - s - N; // fractional part handled by the all-pass, in [0.1, 1.1)
  const apC = (1 - d) / (1 + d);
  // Per-period loss so the fundamental hits -60 dB at t60 (the low-pass adds extra HF loss).
  const t60 = o.t60 ?? 3;
  const g = Math.pow(10, -3 / (freq * t60));

  // Excitation: noise burst, low-passed for brightness, comb-filtered for pluck position.
  const exc = new Float32Array(N);
  const lp = new OnePole(800 + 9000 * (o.brightness ?? 0.6), rate);
  for (let i = 0; i < N; i++) exc[i] = lp.process(rnd.bi());
  const pp = Math.max(1, Math.round((o.pluckPos ?? 0.18) * N));
  const comb = new Float32Array(N);
  for (let i = 0; i < N; i++) comb[i] = exc[i] - (i >= pp ? exc[i - pp] : 0);
  // Remove the excitation's DC so the string doesn't drift.
  let mean = 0;
  for (let i = 0; i < N; i++) mean += comb[i];
  mean /= N;
  for (let i = 0; i < N; i++) comb[i] -= mean;

  const line = new Float32Array(N);
  let w = 0;
  let prev = 0;
  let apX1 = 0;
  let apY1 = 0;
  const amp = o.amp ?? 1;
  for (let n = 0; n < out.length; n++) {
    const x = line[w];
    const lpOut = (1 - s) * x + s * prev;
    prev = x;
    const ap = apC * lpOut + apX1 - apC * apY1;
    apX1 = lpOut;
    apY1 = ap;
    const v = (n < N ? comb[n] : 0) + g * ap;
    line[w] = v;
    w = w + 1 === N ? 0 : w + 1;
    out[n] = v * amp;
  }

  if (o.body) applyBody(out, rate, o.body);
  // Plectrum / finger click on top.
  const clickLen = Math.min(out.length, Math.round(0.004 * rate));
  const hp = new Biquad().highpass(2500, 0.7, rate);
  const clickAmp = 0.06 * amp * (o.brightness ?? 0.6);
  for (let i = 0; i < clickLen; i++) out[i] += hp.process(rnd.bi()) * clickAmp * (1 - i / clickLen);
  // Release fade so the buffer never ends abruptly.
  const fade = Math.min(out.length, Math.round(0.05 * rate));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  return out;
}

/** Wooden / shell soundbox: a few broad resonances and a gentle low cut. */
export function applyBody(buf: Float32Array, rate: number, kind: 'lyre' | 'kithara' | 'bow') {
  const chain: Biquad[] =
    kind === 'kithara'
      ? [
          new Biquad().highpass(85, 0.7, rate),
          new Biquad().peaking(210, 1.6, 5, rate),
          new Biquad().peaking(560, 1.4, 3, rate),
          new Biquad().peaking(2400, 1.2, 2, rate),
        ]
      : kind === 'lyre'
        ? [
            new Biquad().highpass(110, 0.7, rate),
            new Biquad().peaking(320, 1.8, 5, rate), // tortoiseshell box, small and nasal
            new Biquad().peaking(1150, 2, 3, rate),
            new Biquad().highshelf(5000, -6, rate),
          ]
        : [new Biquad().highpass(70, 0.7, rate), new Biquad().peaking(180, 2.5, 6, rate)];
  for (const f of chain) f.run(buf);
  return buf;
}

/** Utility for tests: an ideal sine (used to validate analysis code). */
export function sine(freq: number, seconds: number, rate: number, amp = 1): Float32Array {
  const out = alloc(seconds, rate);
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((TWO_PI * freq * i) / rate) * amp;
  return out;
}
