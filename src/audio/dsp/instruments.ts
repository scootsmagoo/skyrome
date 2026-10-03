/**
 * Baked (pure JS) ancient instruments: cornu/tuba brass calls, syrinx (panpipes), aulos (double
 * reed pipe), tympanum (frame drum) strokes and cymbala (small cymbals). The music engine plays
 * drums and cymbals from these buffers; stingers and distant temple music are baked whole.
 */
import { Biquad, OnePole, Rand, SawOsc, TWO_PI, addMode, addNoiseBurst, alloc } from './core';

// ---------------------------------------------------------------- brass (cornu / tuba)

export interface BrassNote {
  t: number;
  freq: number;
  dur: number;
  /** 0..1 loudness → brightness. */
  dyn?: number;
}

/**
 * Natural-trumpet / horn tone by additive synthesis. Brightness rises with loudness (the brass
 * "blare"), the attack scoops up into pitch (lip buzz) and sustained notes get a late vibrato.
 */
export function brass(out: Float32Array, rate: number, rnd: Rand, n: BrassNote, opts: { detuneCents?: number; amp?: number } = {}) {
  const s0 = Math.round(n.t * rate);
  const rel = 0.12;
  const len = Math.min(out.length - s0, Math.round((n.dur + rel) * rate));
  const dyn = n.dyn ?? 0.8;
  const f = n.freq * Math.pow(2, (opts.detuneCents ?? 0) / 1200);
  const K = Math.min(18, Math.floor((rate * 0.42) / f));
  const amps = new Float64Array(K + 1);
  const amp = opts.amp ?? 1;
  const att = 0.045;
  const vibStart = 0.35;
  let phase = rnd.next() * TWO_PI;
  let env = 0;
  for (let i = 0; i < len; i++) {
    const t = i / rate;
    if ((i & 15) === 0) {
      if (t < att) env = Math.pow(t / att, 1.5);
      else if (t < n.dur) env = 1 - 0.12 * Math.min(1, (t - att) / 0.3);
      else env = 0.88 * Math.pow(Math.max(0, 1 - (t - n.dur) / rel), 2);
      const bright = Math.pow(env, 0.7) * dyn;
      const slope = 2.6 - 1.5 * bright;
      for (let k = 1; k <= K; k++) amps[k] = Math.pow(k, -slope);
    }
    const scoop = t < 0.05 ? -0.035 * Math.pow(1 - t / 0.05, 2) : 0;
    const vib = t > vibStart && n.dur > 0.5 ? 0.004 * Math.sin(TWO_PI * 5.2 * t) * Math.min(1, (t - vibStart) / 0.3) : 0;
    phase += (TWO_PI * f * (1 + scoop + vib)) / rate;
    if (phase > TWO_PI) phase -= TWO_PI;
    // sin(kφ) by the Chebyshev recurrence: one multiply-add per harmonic.
    const s1 = Math.sin(phase);
    const c2 = 2 * Math.cos(phase);
    let sPrev = 0;
    let sCur = s1;
    let y = amps[1] * s1;
    for (let k = 2; k <= K; k++) {
      const sNext = c2 * sCur - sPrev;
      sPrev = sCur;
      sCur = sNext;
      y += amps[k] * sCur;
    }
    out[s0 + i] += y * env * amp * 0.5;
  }
}

/** Bell / bore colouring for brass (a nasal blare around 1–1.5 kHz). */
export function brassBody(buf: Float32Array, rate: number) {
  new Biquad().peaking(1250, 1.2, 4, rate).run(buf);
  new Biquad().highpass(90, 0.7, rate).run(buf);
  new Biquad().lowpass(6500, 0.7, rate).run(buf);
  return buf;
}

// ---------------------------------------------------------------- syrinx

/** Panpipe note: a near-sine with a breathy band of noise and a chiff on the attack. */
export function syrinx(out: Float32Array, rate: number, rnd: Rand, t: number, freq: number, dur: number, amp = 1) {
  const s0 = Math.round(t * rate);
  const rel = 0.09;
  const len = Math.min(out.length - s0, Math.round((dur + rel) * rate));
  const bp = new Biquad().bandpass(freq, 9, rate);
  const bp2 = new Biquad().bandpass(freq * 2, 6, rate);
  let ph = rnd.next() * TWO_PI;
  for (let i = 0; i < len; i++) {
    const tt = i / rate;
    const env = tt < 0.06 ? tt / 0.06 : tt < dur ? 1 - 0.15 * ((tt - 0.06) / Math.max(0.01, dur)) : 0.85 * (1 - (tt - dur) / rel);
    const rise = tt < 0.05 ? -0.02 * (1 - tt / 0.05) : 0;
    const vib = tt > 0.25 ? 0.003 * Math.sin(TWO_PI * 4.6 * tt) : 0;
    ph += (TWO_PI * freq * (1 + rise + vib)) / rate;
    const tone = Math.sin(ph) + 0.12 * Math.sin(2 * ph) + 0.05 * Math.sin(3 * ph);
    const n = rnd.bi();
    const breath = bp.process(n) * 1.8 + bp2.process(n) * 0.5;
    const chiff = tt < 0.04 ? (1 - tt / 0.04) * 0.6 : 0.18;
    out[s0 + i] += (tone * 0.8 + breath * chiff * 2) * env * amp;
  }
}

// ---------------------------------------------------------------- aulos

/**
 * Aulos: a double-reed pipe (two band-limited saws, slightly apart), coloured by reed/bore
 * resonances, with a late vibrato. Optional `drone` frequency for the second pipe.
 */
export function aulos(
  out: Float32Array,
  rate: number,
  rnd: Rand,
  notes: readonly { t: number; freq: number; dur: number; amp?: number }[],
  opts: { drone?: number; droneAmp?: number; amp?: number } = {},
) {
  const end = notes.reduce((m, n) => Math.max(m, n.t + n.dur), 0) + 0.2;
  const len = Math.min(out.length, Math.round(end * rate));
  const a = new SawOsc(rnd.next());
  const b = new SawOsc(rnd.next());
  const d = new SawOsc(rnd.next());
  const tone: Biquad[] = [
    new Biquad().highpass(260, 0.7, rate),
    new Biquad().peaking(1150, 2.2, 9, rate),
    new Biquad().peaking(2700, 2.5, 6, rate),
    new Biquad().lowpass(4800, 0.8, rate),
  ];
  const breath = new Biquad().bandpass(2200, 1.2, rate);
  let freq = notes[0]?.freq ?? 440;
  let ni = 0;
  let level = 0;
  const amp = opts.amp ?? 1;
  for (let i = 0; i < len; i++) {
    const t = i / rate;
    while (ni < notes.length - 1 && t >= notes[ni + 1].t) ni++;
    const n = notes[ni];
    const inNote = t >= n.t && t < n.t + n.dur;
    const target = inNote ? (n.amp ?? 1) : 0;
    // Tongued attack: quick rise; legato pitch glide between notes.
    level += (target - level) * (target > level ? 0.004 : 0.0015);
    freq += (n.freq - freq) * 0.006;
    const age = t - n.t;
    const vib = age > 0.3 ? 0.006 * Math.sin(TWO_PI * 5.4 * t) * Math.min(1, (age - 0.3) / 0.25) : 0;
    const f = freq * (1 + vib);
    let x = a.next(f, rate) + 0.8 * b.next(f * 1.003, rate);
    if (opts.drone) x += (opts.droneAmp ?? 0.5) * d.next(opts.drone, rate);
    x = x * level + breath.process(rnd.bi()) * level * 0.25;
    for (const fl of tone) x = fl.process(x);
    out[i] += x * amp * 0.35;
  }
}

// ---------------------------------------------------------------- tympanum (frame drum)

/** Circular membrane mode ratios (Bessel zeros) – (0,1), (1,1), (2,1), (0,2), (3,1), (1,2), (4,1). */
const MEMBRANE = [1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156] as const;

export type DrumStroke = 'doum' | 'tek' | 'ka' | 'slap';

/**
 * Frame-drum stroke. 'doum' = open centre (deep, pitch drops), 'tek' = rim (dry, bright),
 * 'ka' = other-hand rim (softer tek), 'slap' = flat palm (noisy, mid).
 */
export function drumStroke(stroke: DrumStroke, rate: number, rnd: Rand, opts: { f0?: number } = {}): Float32Array {
  const f0 = (opts.f0 ?? 96) * rnd.vary(0.03);
  const out = alloc(stroke === 'doum' ? 0.9 : 0.35, rate);
  if (stroke === 'doum') {
    addMode(out, rate, 0, f0, 1, 0.55, { attack: 0.002, glide: 0.18 });
    addMode(out, rate, 0, f0 * MEMBRANE[3], 0.35, 0.25, { attack: 0.002, glide: 0.1 });
    addMode(out, rate, 0, f0 * MEMBRANE[1], 0.15, 0.18, { attack: 0.002 });
    addNoiseBurst(out, rate, rnd, 0, { dur: 0.04, amp: 0.4, attack: 0.001, t60: 0.025, lp: 900 });
  } else if (stroke === 'tek' || stroke === 'ka') {
    const a = stroke === 'tek' ? 1 : 0.6;
    for (let k = 1; k < MEMBRANE.length; k++) addMode(out, rate, 0, f0 * 2.2 * MEMBRANE[k], (0.5 / k) * a, rnd.range(0.06, 0.12));
    addNoiseBurst(out, rate, rnd, 0, { dur: 0.03, amp: 0.9 * a, attack: 0.0003, t60: 0.012, bp: rnd.range(2200, 3200), q: 1.2 });
    addMode(out, rate, 0, rnd.range(600, 800), 0.3 * a, 0.03); // wooden frame knock
  } else {
    addNoiseBurst(out, rate, rnd, 0, { dur: 0.08, amp: 1, attack: 0.0005, t60: 0.05, bp: 900, q: 0.7 });
    for (let k = 0; k < 4; k++) addMode(out, rate, 0, f0 * MEMBRANE[k] * 1.5, 0.3 / (k + 1), 0.1);
  }
  return out;
}

// ---------------------------------------------------------------- cymbala

/** Small bronze cymbals. 'ring' = struck and left to ring; 'choke' = struck and damped. */
export function cymbal(kind: 'ring' | 'choke', rate: number, rnd: Rand): Float32Array {
  const out = alloc(kind === 'ring' ? 2.6 : 0.3, rate);
  const f = rnd.range(1050, 1350);
  const ratios = [1, 1.42, 2.09, 2.68, 3.13, 3.81, 4.62, 5.33, 6.41, 7.12];
  for (let pair = 0; pair < 2; pair++) {
    const fp = f * (pair ? rnd.range(1.03, 1.07) : 1); // two cymbals → beating
    ratios.forEach((r, k) => {
      const t60 = kind === 'ring' ? 2.4 / (1 + k * 0.25) : 0.12;
      addMode(out, rate, 0.001, fp * r * rnd.vary(0.01), (0.35 / (1 + k * 0.35)) * rnd.vary(0.3), t60, { phase: rnd.next() * TWO_PI });
    });
  }
  addNoiseBurst(out, rate, rnd, 0, { dur: 0.02, amp: 0.4, attack: 0.0002, t60: 0.008, hp: 4000 });
  new OnePole(9000, rate).run(out);
  return out;
}
