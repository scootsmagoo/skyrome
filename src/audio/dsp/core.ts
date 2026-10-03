/**
 * Pure DSP building blocks used to bake every sound in the game into Float32Arrays.
 *
 * Nothing here touches Web Audio or the DOM, so all of it runs (and is unit tested) in Node.
 * Conventions: `rate` is the sample rate in Hz, times are seconds, buffers are mono Float32Array
 * in [-1, 1]. Generators *add* into an output buffer at a start sample so layers mix naturally.
 */
import { hashString } from '../../core/Rng';

export const TWO_PI = Math.PI * 2;

// ---------------------------------------------------------------- random

/** Fast xorshift32 RNG for per-sample noise (the core mulberry32 is fine too, this is ~2x faster). */
export class Rand {
  private s: number;
  constructor(seed: number | string = 1) {
    const n = typeof seed === 'string' ? hashString(seed) : seed;
    this.s = n >>> 0 || 0x9e3779b9;
    // Warm up so nearby seeds diverge.
    for (let i = 0; i < 4; i++) this.next();
  }
  /** [0, 1) */
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  }
  /** [-1, 1) white noise sample. */
  bi(): number {
    return this.next() * 2 - 1;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, bInclusive: number): number {
    return Math.floor(this.range(a, bInclusive + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
  /** Approximately normal, mean 0, sd ~1. */
  gauss(): number {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 1.732;
  }
  /** Multiplicative jitter: 1 ± amount (uniform). */
  vary(amount: number): number {
    return 1 + (this.next() * 2 - 1) * amount;
  }
  fork(salt: string | number): Rand {
    return new Rand((this.s ^ (typeof salt === 'string' ? hashString(salt) : Math.imul(salt + 1, 0x9e3779b1))) >>> 0);
  }
}

// ---------------------------------------------------------------- buffers

export function alloc(seconds: number, rate: number): Float32Array {
  return new Float32Array(Math.max(1, Math.ceil(seconds * rate)));
}

/** dst[offset + i] += src[i] * gain (clipped to dst length). */
export function mixInto(dst: Float32Array, src: Float32Array, offset = 0, gain = 1) {
  const o = Math.round(offset);
  const n = Math.min(src.length, dst.length - o);
  for (let i = Math.max(0, -o); i < n; i++) dst[o + i] += src[i] * gain;
}

export function scale(buf: Float32Array, g: number) {
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}

export function peakOf(buf: Float32Array): number {
  let p = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > p) p = a;
  }
  return p;
}

export function rmsOf(buf: Float32Array, start = 0, end = buf.length): number {
  let s = 0;
  const n = Math.max(1, end - start);
  for (let i = start; i < end; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / n);
}

/** Scale so the absolute peak equals `target` (no-op on silence). */
export function normalizePeak(buf: Float32Array, target = 0.9) {
  const p = peakOf(buf);
  if (p > 1e-9) scale(buf, target / p);
  return buf;
}

/** Scale so the RMS equals `target`, then soft-limit any peaks above `ceiling`. */
export function normalizeRms(buf: Float32Array, target = 0.1, ceiling = 0.95) {
  const r = rmsOf(buf);
  if (r > 1e-9) scale(buf, target / r);
  if (peakOf(buf) > ceiling) softLimit(buf, ceiling);
  return buf;
}

/**
 * Loudness-style normalization for one-shots: scale so the loudest `window`-second stretch has
 * RMS `target`, but never let the peak exceed `peakCap`. Sustained and spiky sounds then sit at
 * comparable perceived levels, so mix gains (dB) mean what they say.
 */
export function normalizeLoudness(buf: Float32Array, rate: number, target = 0.2, window = 0.05, peakCap = 0.95) {
  const n = Math.max(1, Math.round(window * rate));
  let acc = 0;
  let best = 0;
  for (let i = 0; i < buf.length; i++) {
    acc += buf[i] * buf[i];
    if (i >= n) acc -= buf[i - n] * buf[i - n];
    if (acc > best) best = acc;
  }
  const r = Math.sqrt(best / Math.min(n, buf.length));
  if (r < 1e-9) return buf;
  let g = target / r;
  const p = peakOf(buf);
  if (p * g > peakCap) g = peakCap / p;
  return scale(buf, g);
}

/** Smooth tanh-style limiter that leaves quiet samples untouched. */
export function softLimit(buf: Float32Array, ceiling = 0.95) {
  const knee = ceiling * 0.7;
  const room = ceiling - knee;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const a = Math.abs(x);
    if (a > knee) buf[i] = Math.sign(x) * (knee + room * Math.tanh((a - knee) / room));
  }
  return buf;
}

/** Raised-cosine fades at both ends (removes clicks from hard starts/stops). */
export function fadeEdges(buf: Float32Array, rate: number, inSec = 0.002, outSec = 0.01) {
  const ni = Math.min(buf.length, Math.round(inSec * rate));
  const no = Math.min(buf.length, Math.round(outSec * rate));
  for (let i = 0; i < ni; i++) buf[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / ni);
  for (let i = 0; i < no; i++) buf[buf.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / no);
  return buf;
}

/** Remove DC with a gentle one-pole high-pass (≈ `hz`). */
export function removeDc(buf: Float32Array, rate: number, hz = 20) {
  const r = Math.exp((-TWO_PI * hz) / rate);
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = x - x1 + r * y1;
    x1 = x;
    y1 = y;
    buf[i] = y;
  }
  return buf;
}

/** Trim trailing near-silence (keeps a short tail). */
export function trimTail(buf: Float32Array, rate: number, threshold = 1e-4, keepSec = 0.01): Float32Array {
  let end = buf.length;
  while (end > 1 && Math.abs(buf[end - 1]) < threshold) end--;
  end = Math.min(buf.length, end + Math.round(keepSec * rate));
  return end < buf.length ? buf.slice(0, end) : buf;
}

/**
 * Make a seamless loop: renders are generated `xf` seconds longer than the loop; the extra tail is
 * cross-faded (equal power) over the head, so sample N-1 flows into sample 0.
 */
export function makeSeamless(buf: Float32Array, rate: number, xfSec: number): Float32Array {
  const xf = Math.min(Math.floor(buf.length / 3), Math.round(xfSec * rate));
  const n = buf.length - xf;
  const out = buf.slice(0, n);
  for (let i = 0; i < xf; i++) {
    const t = (i + 0.5) / xf;
    const a = Math.sin((t * Math.PI) / 2); // head fades in
    const b = Math.cos((t * Math.PI) / 2); // tail fades out
    out[i] = buf[i] * a + buf[n + i] * b;
  }
  return out;
}

// ---------------------------------------------------------------- envelopes & curves

/** Exponential decay that reaches -60 dB after `t60` seconds. */
export function decay60(t: number, t60: number): number {
  return Math.pow(10, (-3 * t) / Math.max(1e-4, t60));
}

/** Attack (linear-ish, raised cosine) then exponential decay to -60 dB at attack + t60. */
export function adEnv(t: number, attack: number, t60: number): number {
  if (t < 0) return 0;
  if (t < attack) return 0.5 - 0.5 * Math.cos((Math.PI * t) / attack);
  return decay60(t - attack, t60);
}

/** Piecewise-linear curve through [time, value] points (clamped at the ends). */
export function curve(points: readonly (readonly [number, number])[]): (t: number) => number {
  return (t: number) => {
    if (t <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [t1, v1] = points[i];
      if (t <= t1) {
        const [t0, v0] = points[i - 1];
        const u = (t - t0) / Math.max(1e-9, t1 - t0);
        return v0 + (v1 - v0) * u;
      }
    }
    return points[points.length - 1][1];
  };
}

/** Smooth value noise in [−1, 1] (for slow modulation: gusts, crowd swells). */
export class SmoothNoise {
  private a: number;
  private b: number;
  private phase = 0;
  constructor(
    private readonly rnd: Rand,
    private readonly hz: number,
  ) {
    this.a = rnd.bi();
    this.b = rnd.bi();
  }
  /** Advance by `dt` seconds and return the current value. */
  step(dt: number): number {
    this.phase += dt * this.hz;
    while (this.phase >= 1) {
      this.phase -= 1;
      this.a = this.b;
      this.b = this.rnd.bi();
    }
    const u = this.phase;
    const s = u * u * (3 - 2 * u);
    return this.a + (this.b - this.a) * s;
  }
}

// ---------------------------------------------------------------- filters

/** RBJ biquad, transposed direct form II. Coefficients can be changed while running. */
export class Biquad {
  b0 = 1;
  b1 = 0;
  b2 = 0;
  a1 = 0;
  a2 = 0;
  z1 = 0;
  z2 = 0;

  private set(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number) {
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
    return this;
  }

  private static w(f: number, rate: number) {
    const fc = Math.min(Math.max(f, 5), rate * 0.49);
    return (TWO_PI * fc) / rate;
  }

  lowpass(f: number, q: number, rate: number) {
    const w = Biquad.w(f, rate);
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    return this.set((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al);
  }

  highpass(f: number, q: number, rate: number) {
    const w = Biquad.w(f, rate);
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    return this.set((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al);
  }

  /** Band-pass with 0 dB peak gain. */
  bandpass(f: number, q: number, rate: number) {
    const w = Biquad.w(f, rate);
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    return this.set(al, 0, -al, 1 + al, -2 * c, 1 - al);
  }

  peaking(f: number, q: number, gainDb: number, rate: number) {
    const w = Biquad.w(f, rate);
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    const A = Math.pow(10, gainDb / 40);
    return this.set(1 + al * A, -2 * c, 1 - al * A, 1 + al / A, -2 * c, 1 - al / A);
  }

  highshelf(f: number, gainDb: number, rate: number) {
    const w = Biquad.w(f, rate);
    const c = Math.cos(w);
    const A = Math.pow(10, gainDb / 40);
    const al = (Math.sin(w) / 2) * Math.SQRT2;
    const sa = 2 * Math.sqrt(A) * al;
    return this.set(
      A * (A + 1 + (A - 1) * c + sa),
      -2 * A * (A - 1 + (A + 1) * c),
      A * (A + 1 + (A - 1) * c - sa),
      A + 1 - (A - 1) * c + sa,
      2 * (A - 1 - (A + 1) * c),
      A + 1 - (A - 1) * c - sa,
    );
  }

  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }

  run(buf: Float32Array, start = 0, end = buf.length) {
    for (let i = start; i < end; i++) buf[i] = this.process(buf[i]);
    return buf;
  }

  reset() {
    this.z1 = this.z2 = 0;
    return this;
  }
}

/** One-pole low-pass (6 dB/oct). */
export class OnePole {
  private a = 0;
  private y = 0;
  constructor(hz = 1000, rate = 48000) {
    this.set(hz, rate);
  }
  set(hz: number, rate: number) {
    this.a = Math.exp((-TWO_PI * Math.min(hz, rate * 0.49)) / rate);
    return this;
  }
  process(x: number): number {
    this.y = x + this.a * (this.y - x);
    return this.y;
  }
  run(buf: Float32Array) {
    for (let i = 0; i < buf.length; i++) buf[i] = this.process(buf[i]);
    return buf;
  }
}

/** Pink noise (Paul Kellet's economy filter), roughly unit RMS ~0.3. */
export class Pink {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  constructor(private readonly rnd: Rand) {}
  next(): number {
    const w = this.rnd.bi();
    this.b0 = 0.99765 * this.b0 + w * 0.099046;
    this.b1 = 0.963 * this.b1 + w * 0.2965164;
    this.b2 = 0.57 * this.b2 + w * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + w * 0.1848) * 0.25;
  }
}

/** Brown (red) noise by leaky integration. */
export class Brown {
  private y = 0;
  constructor(private readonly rnd: Rand) {}
  next(): number {
    this.y = this.y * 0.995 + this.rnd.bi() * 0.06;
    return this.y;
  }
}

// ---------------------------------------------------------------- generators

/**
 * Add an exponentially decaying sinusoid (one vibration mode) into `out` from `start` seconds.
 * Uses a rotating phasor (4 multiplies per sample). `t60` is the time to decay by 60 dB.
 */
export function addMode(
  out: Float32Array,
  rate: number,
  start: number,
  freq: number,
  amp: number,
  t60: number,
  opts: { phase?: number; attack?: number; glide?: number } = {},
) {
  if (freq >= rate * 0.48 || amp === 0) return;
  const s0 = Math.max(0, Math.round(start * rate));
  const len = Math.min(out.length - s0, Math.ceil(t60 * 1.05 * rate));
  if (len <= 0) return;
  const r = Math.pow(10, -3 / (t60 * rate));
  let w = (TWO_PI * freq) / rate;
  let c = Math.cos(w) * r;
  let s = Math.sin(w) * r;
  const ph = opts.phase ?? 0;
  let re = Math.cos(ph) * amp;
  let im = Math.sin(ph) * amp;
  const att = Math.max(1, Math.round((opts.attack ?? 0) * rate));
  // Optional pitch glide (fraction of freq lost per second, e.g. drums dropping in pitch).
  const glide = opts.glide ?? 0;
  for (let i = 0; i < len; i++) {
    const g = i < att ? i / att : 1;
    out[s0 + i] += im * g;
    const nre = re * c - im * s;
    im = re * s + im * c;
    re = nre;
    if (glide && (i & 31) === 0) {
      const f = freq * Math.max(0.3, 1 - glide * (i / rate));
      w = (TWO_PI * f) / rate;
      c = Math.cos(w) * r;
      s = Math.sin(w) * r;
    }
  }
}

/** Short filtered noise burst (clicks, scrapes, crackles). */
export function addNoiseBurst(
  out: Float32Array,
  rate: number,
  rnd: Rand,
  start: number,
  opts: { dur: number; amp: number; attack?: number; t60?: number; lp?: number; hp?: number; bp?: number; q?: number },
) {
  const s0 = Math.max(0, Math.round(start * rate));
  const len = Math.min(out.length - s0, Math.ceil(opts.dur * rate));
  if (len <= 0) return;
  const filters: Biquad[] = [];
  if (opts.bp) filters.push(new Biquad().bandpass(opts.bp, opts.q ?? 1.5, rate));
  if (opts.lp) filters.push(new Biquad().lowpass(opts.lp, 0.707, rate));
  if (opts.hp) filters.push(new Biquad().highpass(opts.hp, 0.707, rate));
  const att = opts.attack ?? 0.0005;
  const t60 = opts.t60 ?? opts.dur;
  for (let i = 0; i < len; i++) {
    const t = i / rate;
    let x = rnd.bi() * adEnv(t, att, t60);
    for (const f of filters) x = f.process(x);
    out[s0 + i] += x * opts.amp;
  }
}

/** Band-limited sawtooth via PolyBLEP (for reed and brass tones). */
export class SawOsc {
  phase = 0;
  constructor(phase = 0) {
    this.phase = phase;
  }
  next(freq: number, rate: number): number {
    const dt = freq / rate;
    this.phase += dt;
    if (this.phase >= 1) this.phase -= 1;
    let y = 2 * this.phase - 1;
    y -= polyBlep(this.phase, dt);
    return y;
  }
}

function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

/** dB → linear gain. */
export const dbToGain = (db: number) => Math.pow(10, db / 20);
/** linear gain → dB (−Infinity for 0). */
export const gainToDb = (g: number) => 20 * Math.log10(Math.max(g, 1e-12));
