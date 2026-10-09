/**
 * Ambience: seamless beds (fire, water, wind, crowd, city, insects) and the recurring events that
 * play over them (birds, owls, dogs, workshops, vendors, night carts, temple music).
 *
 * Rome in May AD 113: swifts screaming over the rooftops, sparrows in every portico, the first
 * cicadas in the gardens at midday, scops owls and tree crickets at night, and — because wheeled
 * traffic was banned by day (Lex Iulia Municipalis) — carts rumbling through the streets after dark.
 */
import { Biquad, Brown, OnePole, Pink, Rand, SmoothNoise, TWO_PI, addMode, addNoiseBurst, alloc, makeSeamless, mixInto } from '../dsp/core';
import { aulos, brass, brassBody, drumStroke } from '../dsp/instruments';
import { MODES, degreeToFreq, FINALS } from '../music/theory';
import type { BakeContext, LoopDef, SoundDef } from './types';
import { bubble, creak, grains, hump, strike, thump } from './util';
import { dogBarks, utterance, vendorCall } from './vocal';

/** Poisson event times over [0, dur). */
function poisson(rnd: Rand, ratePerSec: number, dur: number): number[] {
  const out: number[] = [];
  let t = -Math.log(1 - rnd.next()) / ratePerSec;
  while (t < dur) {
    out.push(t);
    t += -Math.log(1 - rnd.next()) / ratePerSec;
  }
  return out;
}

// ---------------------------------------------------------------- beds

function bakeFire(c: BakeContext) {
  const { rate, rnd } = c;
  const L = 6;
  const X = 0.5;
  const out = alloc(L + X, rate);
  const br = new Brown(rnd);
  const lp = new Biquad().lowpass(380, 0.7, rate);
  const breathe = new Biquad().bandpass(900, 0.6, rate);
  const roar = new SmoothNoise(rnd, 1.3);
  const flick = new SmoothNoise(rnd, 7);
  const hp = new Biquad().highpass(3200, 0.7, rate);
  for (let i = 0; i < out.length; i++) {
    const r = 0.6 + 0.4 * roar.step(1 / rate);
    const f = 0.5 + 0.5 * flick.step(1 / rate);
    // Low roar, the flames' breathy whoosh, and a faint hiss.
    out[i] += lp.process(br.next()) * r * 0.3 + breathe.process(rnd.bi()) * 0.12 * (0.4 + 0.6 * f) * r + hp.process(rnd.bi()) * 0.03 * f;
  }
  // Crackles: mostly tiny, a few loud; pops: resin and moisture bursting.
  for (const t of poisson(rnd, 18, L + X)) {
    const a = 0.7 * Math.pow(rnd.next(), 3);
    const d = rnd.range(0.002, 0.008);
    addNoiseBurst(out, rate, rnd, t, { dur: d, amp: a, attack: 0.0002, t60: d * 0.7, bp: rnd.range(1500, 6500), q: 1.2 });
  }
  for (const t of poisson(rnd, 0.8, L + X)) {
    addNoiseBurst(out, rate, rnd, t, { dur: 0.015, amp: rnd.range(0.3, 0.7), attack: 0.0002, t60: 0.008, lp: 2500 });
    addMode(out, rate, t, rnd.range(350, 900), 0.15, 0.02);
  }
  return makeSeamless(out, rate, X);
}

function bakeWater(c: BakeContext, kind: 'fountain' | 'river') {
  const { rate, rnd } = c;
  const L = kind === 'fountain' ? 6 : 8;
  const X = 0.6;
  const out = alloc(L + X, rate);
  const bp = new Biquad().bandpass(kind === 'fountain' ? 2400 : 900, 0.5, rate);
  const hp = new Biquad().highpass(5000, 0.7, rate);
  const turb = new SmoothNoise(rnd, kind === 'fountain' ? 28 : 9);
  const slow = new SmoothNoise(rnd, 0.6);
  const br = new Brown(rnd);
  const glp = new Biquad().lowpass(kind === 'fountain' ? 420 : 300, 0.7, rate);
  const isF = kind === 'fountain';
  for (let i = 0; i < out.length; i++) {
    const tb = 0.55 + 0.45 * turb.step(1 / rate);
    const s = 0.75 + 0.25 * slow.step(1 / rate);
    const w = rnd.bi();
    out[i] += bp.process(w) * tb * (isF ? 0.5 : 0.45) * s + hp.process(rnd.bi()) * (isF ? 0.06 : 0.03) + glp.process(br.next()) * 0.6 * s;
  }
  // Bubbles and droplets (Minnaert resonances) — what makes noise read as water.
  const [lo, hi] = isF ? [450, 3600] : [220, 1500];
  for (const t of poisson(rnd, isF ? 170 : 90, L + X)) {
    const f = lo * Math.pow(hi / lo, rnd.next());
    bubble(out, rate, t, f, rnd.range(0.008, 0.03), Math.pow(rnd.next(), 2) * (isF ? 0.16 : 0.2), rnd.range(1.15, 1.5));
  }
  return makeSeamless(out, rate, X);
}

function bakeWind(c: BakeContext) {
  const { rate, rnd } = c;
  const L = 10;
  const X = 1;
  const out = alloc(L + X, rate);
  const pink = new Pink(rnd);
  const br = new Brown(rnd);
  const bp = new Biquad();
  const wh = new Biquad();
  const lp = new Biquad().lowpass(130, 0.7, rate);
  const gust = new SmoothNoise(rnd, 0.13);
  const flutter = new SmoothNoise(rnd, 0.9);
  const tone = new SmoothNoise(rnd, 0.07);
  for (let i = 0; i < out.length; i++) {
    const g = Math.max(0, Math.min(1, 0.5 + 0.45 * gust.step(1 / rate) + 0.12 * flutter.step(1 / rate)));
    const tn = 0.5 + 0.5 * tone.step(1 / rate);
    if ((i & 63) === 0) {
      bp.bandpass(260 + 520 * g, 0.7, rate);
      wh.bandpass(650 + 700 * tn + 250 * g, 11, rate);
    }
    const p = pink.next();
    out[i] += bp.process(p) * (0.25 + 0.75 * g) * 1.6 + wh.process(rnd.bi()) * g * g * g * 0.5 + lp.process(br.next()) * (0.4 + 0.6 * g) * 1.2;
  }
  return makeSeamless(out, rate, X);
}

function babble(out: Float32Array, rate: number, rnd: Rand, talkers: number, dist: [number, number], dur: number, lowpass: number) {
  for (let k = 0; k < talkers; k++) {
    const sex = rnd.chance(0.58) ? 'm' : 'f';
    const d = dist[0] + (dist[1] - dist[0]) * Math.pow(rnd.next(), 0.8);
    const gain = 4 / d;
    const dull = Math.min(1, (d - dist[0]) / (dist[1] - dist[0] + 1e-6));
    let t = rnd.next() * 1.5;
    while (t < dur) {
      const ud = rnd.range(0.7, 2.6);
      const u = utterance({ sex, dur: ud, dull }, rate, rnd);
      mixInto(out, u, Math.round(t * rate), gain);
      t += ud + rnd.range(0.25, 2.2);
    }
  }
  new Biquad().lowpass(lowpass, 0.6, rate).run(out);
}

function bakeCrowd(c: BakeContext) {
  const { rate, rnd } = c;
  const L = 12;
  const X = 0.8;
  const out = alloc(L + X, rate);
  babble(out, rate, rnd, 18, [8, 45], L + X, 3600);
  // A low murmur that fills the gaps between voices, and shuffling feet.
  const pink = new Pink(rnd);
  const bp = new Biquad().bandpass(420, 0.8, rate);
  const sw = new SmoothNoise(rnd, 0.4);
  let r = 0;
  for (let i = 0; i < out.length; i++) r += out[i] * out[i];
  const level = Math.sqrt(r / out.length);
  for (let i = 0; i < out.length; i++) out[i] += bp.process(pink.next()) * level * 1.2 * (0.7 + 0.3 * sw.step(1 / rate));
  grains(out, rate, rnd, 0, L + X, { density: 60, fLo: 1500, fHi: 5000, amp: level * 0.5, grain: [0.004, 0.012], env: () => 1 });
  return makeSeamless(out, rate, X);
}

/** The amphitheatre's stands: tens of thousands talking at once, a constant surf of voices. */
function bakeArena(c: BakeContext) {
  const { rate, rnd } = c;
  const L = 12;
  const X = 0.8;
  const out = alloc(L + X, rate);
  babble(out, rate, rnd, 46, [10, 90], L + X, 2600);
  const pink = new Pink(rnd);
  const bp = new Biquad().bandpass(360, 0.7, rate);
  const sw = new SmoothNoise(rnd, 0.25);
  let r = 0;
  for (let i = 0; i < out.length; i++) r += out[i] * out[i];
  const level = Math.sqrt(r / out.length);
  for (let i = 0; i < out.length; i++) out[i] += bp.process(pink.next()) * level * 2.2 * (0.6 + 0.4 * sw.step(1 / rate));
  return makeSeamless(out, rate, X);
}

/** A crowd roar: a swell of open-vowel shouts over a surge of noise, then dying away. */
function bakeRoar(c: BakeContext) {
  const { rate, rnd } = c;
  const dur = rnd.range(2.6, 3.6);
  const out = alloc(dur, rate);
  for (let k = 0; k < 26; k++) {
    const t = rnd.range(0, 0.35);
    const ud = rnd.range(0.8, dur - t - 0.3);
    const sex = rnd.chance(0.65) ? 'm' : 'f';
    // Shouts: raised pitch, long open vowels.
    const u = utterance({ sex, dur: ud, dull: rnd.range(0.2, 0.9), f0: (sex === 'm' ? 165 : 290) * rnd.range(0.85, 1.2), syllableRate: rnd.range(1.2, 2.2), liveliness: 0.3 }, rate, rnd);
    mixInto(out, u, Math.round(t * rate), rnd.range(0.3, 0.8));
  }
  const pink = new Pink(rnd);
  const bp = new Biquad().bandpass(700, 0.6, rate);
  for (let i = 0; i < out.length; i++) out[i] += bp.process(pink.next()) * 0.5;
  new Biquad().lowpass(3000, 0.6, rate).run(out);
  const rise = 0.35 * rate;
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    out[i] *= Math.min(1, i / rise) * Math.pow(Math.max(0, 1 - Math.max(0, t - 0.6) / (dur - 0.6)), 1.6);
  }
  return out;
}

/** The cornu sounds for the next pair: a natural-horn call climbing the harmonics. */
function bakeCornu(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(3.2, rate);
  const f0 = rnd.range(92, 104);
  const calls = [
    [3, 4, 5, 6],
    [4, 5, 6, 8],
    [3, 5, 6, 5, 8],
  ];
  const h = rnd.pick(calls);
  let t = 0.05;
  h.forEach((n, i) => {
    const last = i === h.length - 1;
    const d = last ? 1.25 : rnd.pick([0.22, 0.3, 0.42]);
    brass(out, rate, rnd, { t, freq: f0 * n, dur: d, dyn: last ? 1 : 0.85 }, { amp: 0.8 });
    t += d + 0.05;
  });
  brassBody(out, rate);
  for (let i = 0; i < out.length; i++) out[i] *= Math.min(1, (out.length - i) / (0.25 * rate));
  return out;
}

function bakeCity(c: BakeContext) {
  const { rate, rnd } = c;
  const L = 10;
  const X = 0.8;
  const out = alloc(L + X, rate);
  babble(out, rate, rnd, 9, [35, 90], L + X, 1300);
  let r = 0;
  for (let i = 0; i < out.length; i++) r += out[i] * out[i];
  const level = Math.sqrt(r / out.length) || 0.01;
  const br = new Brown(rnd);
  const lp = new Biquad().lowpass(160, 0.7, rate);
  const sw = new SmoothNoise(rnd, 0.2);
  for (let i = 0; i < out.length; i++) out[i] += lp.process(br.next()) * level * 2 * (0.7 + 0.3 * sw.step(1 / rate));
  // Distant clatter: pots, tools, shutters.
  for (const t of poisson(rnd, 1.5, L + X)) {
    addNoiseBurst(out, rate, rnd, t, { dur: 0.02, amp: level * rnd.range(0.5, 2), attack: 0.0005, t60: 0.012, bp: rnd.range(900, 2500), q: 1.5 });
  }
  return makeSeamless(out, rate, X);
}

function bakeCicadas(c: BakeContext) {
  const { rate, rnd } = c;
  const L = 8;
  const X = 0.5;
  const out = alloc(L + X, rate);
  const n = 5;
  for (let k = 0; k < n; k++) {
    const fc = rnd.range(4300, 7000);
    const pulsed = k % 2 === 0; // Cicada orni-like echemes vs Lyristes-like continuous swells
    const gain = rnd.range(0.3, 1);
    const pr = rnd.range(170, 280);
    const bp = new Biquad().bandpass(fc, 3.5, rate);
    const bp2 = new Biquad().bandpass(fc * 1.45, 4, rate);
    const smooth = new OnePole(2500, rate);
    const swellP = rnd.range(3, 6);
    const swellPh = rnd.next();
    const ech = rnd.range(0.09, 0.14);
    const gap = rnd.range(0.07, 0.12);
    let ph = rnd.next();
    let tph = 0;
    const offset = rnd.next() * 2;
    for (let i = 0; i < out.length; i++) {
      const t = i / rate + offset;
      ph += pr / rate;
      if (ph >= 1) ph -= 1;
      tph += (TWO_PI * fc) / rate;
      const gate = smooth.process(ph < 0.32 ? 1 : 0);
      let phrase: number;
      if (pulsed) {
        const cyc = t % (ech + gap);
        phrase = cyc < ech ? Math.sin((Math.PI * cyc) / ech) : 0;
      } else {
        const s = ((t / swellP + swellPh) % 1 + 1) % 1;
        // Swell, a quick collapse, silence, then a soft restart (Lyristes-style).
        phrase = s < 0.8 ? 0.35 + 0.65 * Math.pow(s / 0.8, 1.5) : s < 0.86 ? 1 - (s - 0.8) / 0.06 : 0.35 * Math.max(0, (s - 0.9) / 0.1);
      }
      const w = rnd.bi();
      const x = (bp.process(w) * 2.2 + bp2.process(w) * 0.8 + Math.sin(tph) * 0.15) * gate;
      out[i] += x * phrase * gain;
    }
  }
  return makeSeamless(out, rate, X);
}

function bakeCrickets(c: BakeContext) {
  const { rate, rnd } = c;
  const L = 8;
  const X = 0.5;
  const out = alloc(L + X, rate);
  // Field crickets: regular chirps of 3–4 pulses.
  for (let k = 0; k < 3; k++) {
    const f = rnd.range(4300, 5000);
    const period = rnd.range(0.38, 0.62);
    const pulses = rnd.int(3, 4);
    const gain = rnd.range(0.25, 0.8);
    for (let t = rnd.next() * period; t < L + X; t += period * rnd.vary(0.03)) {
      for (let p = 0; p < pulses; p++) {
        const s0 = Math.round((t + p * 0.032) * rate);
        const len = Math.round(0.018 * rate);
        for (let i = 0; i < len && s0 + i < out.length; i++) {
          const u = i / len;
          const ph = (TWO_PI * f * i) / rate;
          out[s0 + i] += (Math.sin(ph) + 0.15 * Math.sin(2 * ph)) * Math.sin(Math.PI * u) * gain * 0.5;
        }
      }
    }
  }
  // Tree crickets (Oecanthus): long soft trills around 2.7 kHz.
  for (let k = 0; k < 2; k++) {
    const f = rnd.range(2550, 3000);
    const pr = rnd.range(40, 52);
    const gain = rnd.range(0.2, 0.45);
    let t = rnd.next() * 2;
    while (t < L + X) {
      const trill = rnd.range(2.5, 6);
      const s0 = Math.round(t * rate);
      const len = Math.round(trill * rate);
      for (let i = 0; i < len && s0 + i < out.length; i++) {
        const tt = i / rate;
        const pulse = (tt * pr) % 1;
        const g = pulse < 0.6 ? Math.sin((Math.PI * pulse) / 0.6) : 0;
        const env = Math.min(1, tt / 0.2, (trill - tt) / 0.2);
        out[s0 + i] += Math.sin(TWO_PI * f * tt) * g * env * gain * 0.4;
      }
      t += trill + rnd.range(0.4, 1.8);
    }
  }
  const hp = new Biquad().highpass(2500, 0.7, rate);
  for (let i = 0; i < out.length; i++) out[i] += hp.process(rnd.bi()) * 0.006;
  return makeSeamless(out, rate, X);
}

// ---------------------------------------------------------------- events

function bakeSwifts(c: BakeContext) {
  const { rate, rnd } = c;
  const dur = 2.6;
  const out = alloc(dur, rate);
  const birds = rnd.int(3, 6);
  for (let b = 0; b < birds; b++) {
    const screams = rnd.int(1, 3);
    let t = rnd.range(0, 0.9);
    for (let s = 0; s < screams && t < dur - 0.4; s++) {
      const sd = rnd.range(0.35, 0.75);
      const fc = rnd.range(4800, 6800);
      const fm = rnd.range(45, 75);
      const depth = rnd.range(450, 950);
      const harsh = new Biquad().bandpass(fc, 3, rate);
      const rough = new SmoothNoise(rnd, 160);
      const s0 = Math.round(t * rate);
      const len = Math.min(out.length - s0, Math.round(sd * rate));
      let ph = 0;
      const amp = rnd.range(0.4, 1);
      for (let i = 0; i < len; i++) {
        const tt = i / rate;
        const u = tt / sd;
        const saw = ((tt * fm) % 1) * 2 - 1;
        const f = (fc + depth * saw) * (1 - 0.07 * u); // a passing bird drops in pitch
        ph += (TWO_PI * f) / rate;
        const env = Math.min(1, tt / 0.03) * Math.min(1, (sd - tt) / 0.08);
        const r = 0.7 + 0.3 * rough.step(1 / rate);
        out[s0 + i] += (Math.sin(ph) * 0.7 + Math.sin(2 * ph) * 0.12 + harsh.process(rnd.bi()) * 0.6) * env * r * amp;
      }
      t += sd + rnd.range(0.05, 0.4);
    }
  }
  // The party sweeps past (and the buffer fades out cleanly).
  const fade = 0.25 * rate;
  for (let i = 0; i < out.length; i++) out[i] *= (0.25 + 0.75 * hump(i / out.length, 0.45, 1)) * Math.min(1, (out.length - i) / fade);
  return out;
}

function bakeSparrow(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(1.6, rate);
  const notes = rnd.int(3, 7);
  let t = 0.01;
  const f0 = rnd.range(3000, 3700);
  for (let n = 0; n < notes && t < 1.45; n++) {
    const d = rnd.range(0.05, 0.1);
    const fn = f0 * rnd.vary(0.08);
    const s0 = Math.round(t * rate);
    const len = Math.min(out.length - s0, Math.round(d * rate));
    let ph = 0;
    const amp = rnd.range(0.5, 1);
    const shape = rnd.next();
    for (let i = 0; i < len; i++) {
      const u = i / len;
      const contour = shape < 0.5 ? 1 + 0.3 * Math.sin(Math.PI * u) - 0.25 * u : 1 + 0.35 * u - 0.5 * Math.max(0, u - 0.6);
      ph += (TWO_PI * fn * contour) / rate;
      const env = Math.pow(Math.sin(Math.PI * u), 0.6);
      out[s0 + i] += (Math.sin(ph) + 0.3 * Math.sin(2 * ph) + 0.08 * Math.sin(3 * ph)) * env * amp * 0.6;
    }
    t += d + rnd.range(0.06, 0.24);
  }
  return out;
}

function bakeOwl(c: BakeContext, little: boolean) {
  const { rate, rnd } = c;
  const out = alloc(little ? 0.6 : 0.4, rate);
  const d = little ? rnd.range(0.32, 0.42) : rnd.range(0.16, 0.22);
  const f = little ? rnd.range(1350, 1500) : rnd.range(1150, 1300);
  const len = Math.round(d * rate);
  const bp = new Biquad().bandpass(f, 8, rate);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const u = i / len;
    const contour = little ? 1 + 0.45 * Math.sin(Math.PI * Math.min(1, u * 1.4)) - 0.2 * u : 1 - 0.03 * u;
    ph += (TWO_PI * f * contour) / rate;
    const env = little ? Math.pow(Math.sin(Math.PI * u), 0.8) : Math.min(1, u / 0.25) * Math.min(1, (1 - u) / 0.3);
    out[i] += (Math.sin(ph) + 0.05 * Math.sin(2 * ph) + (little ? 0.2 * Math.sin(3 * ph) : 0) + bp.process(rnd.bi()) * 0.15) * env * 0.7;
  }
  return out;
}

function bakeHammer(c: BakeContext) {
  const { rate, rnd } = c;
  const smith = c.variant % 2 === 0;
  const out = alloc(3.6, rate);
  const n = rnd.int(4, 7);
  const f = rnd.range(950, 1350);
  const hot = rnd.chance(0.35);
  let t = 0.02;
  for (let i = 0; i < n && t < 2.9; i++) {
    if (smith) {
      const ring = hot ? 0.25 : 1;
      strike(out, rate, rnd, t, f, [[1, 0.5, 0.7 * ring], [2.4, 0.4, 0.45 * ring], [3.9, 0.25, 0.3 * ring], [5.6, 0.15, 0.2 * ring]], { noise: 0.5, noiseBp: 3000 });
      if (hot) thump(out, rate, rnd, t, { freq: 160, amp: 0.4, t60: 0.05, lp: 600 });
      if (rnd.chance(0.35)) strike(out, rate, rnd, t + 0.13, f * 1.02, [[1, 0.2, 0.4], [2.4, 0.15, 0.3]], { noise: 0.15 }); // rebound tap on the anvil
      t += rnd.range(0.42, 0.62);
    } else {
      // Stone mason: chisel clicks and dull stone thunks.
      addNoiseBurst(out, rate, rnd, t, { dur: 0.015, amp: 0.7, attack: 0.0002, t60: 0.006, bp: rnd.range(2800, 4200), q: 1.4 });
      addMode(out, rate, t, rnd.range(600, 900), 0.4, 0.035);
      strike(out, rate, rnd, t, rnd.range(2200, 2800), [[1, 0.15, 0.08]]);
      t += rnd.range(0.28, 0.5);
    }
  }
  return out;
}

function bakeCart(c: BakeContext) {
  const { rate, rnd } = c;
  const dur = rnd.range(6.5, 8);
  const out = alloc(dur, rate);
  const pass = (t: number) => (0.15 + 0.85 * hump(t / dur, 0.5, 1.3)) * Math.min(1, t / 0.4, Math.max(0, dur - 0.05 - t) / 0.6);
  // Iron-tyred wheels on basalt: rumble plus a knock at every paving joint.
  const br = new Brown(rnd);
  const lp = new Biquad();
  for (let i = 0; i < out.length; i++) {
    const p = pass(i / rate);
    if ((i & 127) === 0) lp.lowpass(180 + 450 * p, 0.7, rate);
    out[i] += lp.process(br.next()) * p * 0.6;
  }
  for (let t = 0.05; t < dur; t += rnd.range(0.12, 0.34)) {
    const p = pass(t);
    thump(out, rate, rnd, t, { freq: rnd.range(70, 100), amp: 0.2 * p, t60: 0.05, lp: 500 });
    addNoiseBurst(out, rate, rnd, t, { dur: 0.03, amp: 0.25 * p, attack: 0.001, t60: 0.02, bp: rnd.range(500, 800), q: 1 }); // wooden wheel knock
    addNoiseBurst(out, rate, rnd, t, { dur: 0.01, amp: 0.15 * p * p, attack: 0.0003, t60: 0.005, bp: rnd.range(1500, 2600), q: 1.5 });
  }
  // Axle squeak once per wheel turn.
  if (rnd.chance(0.6)) {
    const turn = rnd.range(0.7, 0.95);
    for (let t = rnd.next() * turn; t < dur - 0.1; t += turn) {
      creak(out, rate, rnd, t, 0.08, { pulseHz: () => rnd.range(480, 620), amp: () => 0.12 * pass(t), formants: [[900, 6], [1800, 6]] });
    }
  }
  // A mule walking: four clip-clops per stride.
  const stride = rnd.range(0.85, 1.0);
  for (let t = 0.1; t < dur - 0.1; t += stride) {
    for (const off of [0, 0.23, 0.48, 0.7]) {
      const tt = t + off * stride + rnd.range(-0.015, 0.015);
      const p = pass(tt);
      strike(out, rate, rnd, tt, rnd.range(520, 780), [[1, 0.35 * p, 0.03], [2.3, 0.2 * p, 0.02]], { noise: 0.3 * p, noiseBp: 2200 });
    }
  }
  return out;
}

function bakeTemple(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(8.5, rate);
  const mode = rnd.chance(0.5) ? MODES.dorian : MODES.phrygian;
  const fin = (mode.name === 'dorian' ? FINALS.D : FINALS.E) / 2;
  const notes: { t: number; freq: number; dur: number }[] = [];
  let t = 0.2;
  let deg = rnd.int(2, 4);
  while (t < 7) {
    const d = rnd.pick([0.4, 0.6, 0.8, 1.2]);
    notes.push({ t, freq: degreeToFreq(mode, deg, fin * 2), dur: d * 0.95 });
    t += d;
    deg = Math.max(-1, Math.min(6, deg + rnd.pick([-1, -1, 1, 1, -2, 2, 0])));
  }
  notes.push({ t, freq: degreeToFreq(mode, 0, fin * 2), dur: 1.2 });
  aulos(out, rate, rnd, notes, { drone: fin, droneAmp: 0.45, amp: 0.8 });
  for (let tt = 0.2; tt < 8; tt += 1.6) mixInto(out, drumStroke('doum', rate, rnd, { f0: 85 }), Math.round(tt * rate), 0.4);
  // Heard through walls and colonnades: dull and soft.
  new Biquad().lowpass(2200, 0.7, rate).run(out);
  for (let i = 0; i < out.length; i++) out[i] *= Math.min(1, i / (0.3 * rate), (out.length - i) / (0.6 * rate));
  return out;
}

/** Stand-in for the recorded birdsong bed: sparrow chirps scattered over a loop. */
function bakeBirdsBed(c: BakeContext) {
  const { rate, rnd } = c;
  const xf = 1;
  const out = alloc(8 + xf, rate);
  for (let i = 0; i < 16; i++) {
    const chirp = bakeSparrow({ ...c, rnd: rnd.fork(`b${i}`) });
    mixInto(out, chirp, Math.round(rnd.range(0, 8) * rate), rnd.range(0.2, 0.5));
  }
  return makeSeamless(out, rate, xf);
}

// ---------------------------------------------------------------- defs

const bed = { bus: 'ambience' as const, kind: 'bed' as const, group: 'Ambience beds', variants: 1, maxVoices: 4 };
const ev = { bus: 'ambience' as const, kind: 'oneshot' as const, group: 'Ambience events', reverb: 0.3, randomRate: 0.04 };

export const ambienceSounds: SoundDef[] = [
  { ...bed, id: 'bed.fire', label: 'fire bed', rate: 32000, expect: { centroid: [100, 3000] }, bake: bakeFire },
  { ...bed, id: 'bed.fountain', label: 'fountain bed', rate: 32000, expect: { centroid: [200, 4500] }, bake: (c) => bakeWater(c, 'fountain') },
  { ...bed, id: 'bed.river', label: 'river bed', rate: 24000, expect: { centroid: [60, 2500] }, bake: (c) => bakeWater(c, 'river') },
  { ...bed, id: 'bed.wind', label: 'wind bed', rate: 22050, expect: { centroid: [60, 1500] }, bake: bakeWind },
  { ...bed, id: 'bed.crowd', label: 'crowd murmur bed', rate: 16000, expect: { centroid: [200, 2200] }, bake: bakeCrowd },
  { ...bed, id: 'bed.arena', label: 'amphitheatre crowd bed', rate: 16000, expect: { centroid: [200, 2000] }, bake: bakeArena },
  { ...bed, id: 'bed.city', label: 'distant city bed', rate: 16000, expect: { centroid: [40, 1200] }, bake: bakeCity },
  { ...bed, id: 'bed.birds', label: 'birdsong bed', rate: 32000, expect: { centroid: [2500, 9000] }, bake: bakeBirdsBed },
  { ...bed, id: 'bed.cicadas', label: 'cicadas bed', rate: 32000, expect: { centroid: [3500, 9000] }, bake: bakeCicadas },
  { ...bed, id: 'bed.crickets', label: 'crickets bed', rate: 32000, expect: { centroid: [2000, 6000] }, bake: bakeCrickets },

  { ...ev, id: 'amb.swifts', label: 'swifts screaming past', variants: 4, gainDb: -12, maxVoices: 3, priority: 0.3, spatial: { ref: 10, max: 90, rolloff: 1 }, expect: { dur: [1, 2.6], centroid: [3500, 9000] }, bake: bakeSwifts },
  // The recorded birdsong cut into single calls (scripts/sfx/calls.mjs); the stand-in is a sparrow.
  { ...ev, id: 'amb.birdcall', label: 'bird calls (cut from the dawn chorus)', variants: 5, gainDb: -13, maxVoices: 5, priority: 0.2, spatial: { ref: 5, max: 70, rolloff: 1 }, expect: { dur: [0.15, 2.6], centroid: [2000, 8000] }, bake: bakeSparrow },
  { ...ev, id: 'amb.sparrow', label: 'sparrow chirps', variants: 5, gainDb: -14, maxVoices: 4, priority: 0.2, spatial: { ref: 4, max: 50, rolloff: 1 }, expect: { dur: [0.15, 1.6], centroid: [2500, 8000] }, bake: bakeSparrow },
  { ...ev, id: 'amb.owl', label: 'scops owl', variants: 3, gainDb: -14, maxVoices: 2, priority: 0.3, rate: 24000, spatial: { ref: 8, max: 120, rolloff: 1 }, expect: { dur: [0.12, 0.4], centroid: [900, 1700] }, bake: (c) => bakeOwl(c, false) },
  { ...ev, id: 'amb.owl.little', label: 'little owl', variants: 2, gainDb: -14, maxVoices: 2, priority: 0.3, rate: 24000, spatial: { ref: 8, max: 120, rolloff: 1 }, expect: { dur: [0.25, 0.6] }, bake: (c) => bakeOwl(c, true) },
  { ...ev, id: 'amb.dog', label: 'dog barking (distant)', variants: 4, gainDb: -10, maxVoices: 2, priority: 0.3, rate: 22050, spatial: { ref: 15, max: 160, rolloff: 1 }, expect: { dur: [0.3, 2] }, bake: (c) => dogBarks(c.rate, c.rnd) },
  { ...ev, id: 'amb.hammer', label: 'workshop hammering', variants: 4, gainDb: -12, maxVoices: 3, priority: 0.3, spatial: { ref: 6, max: 120, rolloff: 1 }, expect: { dur: [1, 3.6] }, bake: bakeHammer },
  { ...ev, id: 'amb.calls', label: 'market call', variants: 6, gainDb: -12, maxVoices: 2, priority: 0.4, rate: 22050, spatial: { ref: 8, max: 120, rolloff: 1 }, expect: { dur: [0.4, 2.2], centroid: [300, 3000] }, bake: (c) => vendorCall(c.rnd.chance(0.75) ? 'm' : 'f', c.rate, c.rnd) },
  {
    ...ev,
    id: 'amb.chatter',
    label: 'nearby chatter',
    variants: 8,
    gainDb: -15,
    maxVoices: 4,
    priority: 0.2,
    rate: 22050,
    spatial: { ref: 3, max: 50, rolloff: 1 },
    expect: { dur: [0.5, 2.4], centroid: [200, 3000] },
    bake: (c) => utterance({ sex: c.variant % 3 === 0 ? 'f' : 'm', dur: c.rnd.range(0.9, 2.2) }, c.rate, c.rnd),
  },
  { ...ev, id: 'amb.cart', label: 'cart passing (night)', variants: 3, gainDb: -10, maxVoices: 2, priority: 0.3, rate: 16000, spatial: { ref: 8, max: 100, rolloff: 1 }, expect: { dur: [5, 8] }, bake: bakeCart },
  { ...ev, id: 'amb.roar', label: 'arena crowd roar', variants: 4, gainDb: -4, maxVoices: 2, priority: 0.7, rate: 16000, spatial: { ref: 30, max: 400, rolloff: 0.6 }, expect: { dur: [2.2, 3.6] }, bake: bakeRoar },
  { ...ev, id: 'amb.cornu', label: 'cornu call (arena)', variants: 3, gainDb: -6, maxVoices: 1, priority: 0.7, rate: 22050, spatial: { ref: 25, max: 400, rolloff: 0.6 }, expect: { dur: [1.4, 3.2] }, bake: bakeCornu },
  { ...ev, id: 'amb.temple', label: 'temple music (distant)', variants: 3, gainDb: -12, maxVoices: 1, priority: 0.4, rate: 16000, spatial: { ref: 10, max: 120, rolloff: 1 }, expect: { dur: [6, 8.5] }, bake: bakeTemple },
];

export const ambienceLoops: LoopDef[] = [
  { id: 'fire', label: 'fire (brazier / hearth)', group: 'Loops', bus: 'ambience', bed: 'bed.fire', gainDb: -10, spatial: { ref: 1.5, max: 25, rolloff: 1.2 }, reverb: 0.15 },
  { id: 'fountain', label: 'fountain', group: 'Loops', bus: 'ambience', bed: 'bed.fountain', gainDb: -9, spatial: { ref: 2.5, max: 45, rolloff: 1 }, reverb: 0.2 },
  { id: 'river', label: 'river (Tiber)', group: 'Loops', bus: 'ambience', bed: 'bed.river', stereoBed: true, gainDb: -10 },
  { id: 'wind', label: 'wind (hills)', group: 'Loops', bus: 'ambience', bed: 'bed.wind', stereoBed: true, gainDb: -12 },
  { id: 'arena', label: 'amphitheatre crowd', group: 'Loops', bus: 'ambience', bed: 'bed.arena', stereoBed: true, gainDb: -8, events: [{ sound: 'amb.chatter', rate: 0.3, dist: [2, 8] }] },
  {
    id: 'crowd',
    label: 'forum crowd',
    group: 'Loops',
    bus: 'ambience',
    bed: 'bed.crowd',
    stereoBed: true,
    gainDb: -11,
    events: [
      { sound: 'amb.chatter', rate: 0.55, dist: [3, 12] },
      { sound: 'amb.calls', rate: 0.05, dist: [12, 35] },
    ],
  },
  {
    id: 'market',
    label: 'market (calls, coins)',
    group: 'Loops',
    bus: 'ambience',
    gainDb: 0,
    events: [
      { sound: 'amb.calls', rate: 0.14, dist: [6, 28] },
      { sound: 'coin.clink', rate: 0.06, dist: [3, 10], gainDb: -6 },
      { sound: 'amb.chatter', rate: 0.3, dist: [3, 10] },
    ],
  },
  {
    id: 'city',
    label: 'distant city',
    group: 'Loops',
    bus: 'ambience',
    bed: 'bed.city',
    stereoBed: true,
    gainDb: -12,
    events: [
      { sound: 'amb.dog', rate: 0.012, dist: [40, 120] },
      { sound: 'amb.hammer', rate: 0.02, dist: [30, 90] },
      { sound: 'amb.calls', rate: 0.015, dist: [40, 100] },
    ],
  },
  { id: 'cicadas', label: 'cicadas (summer midday)', group: 'Loops', bus: 'ambience', bed: 'bed.cicadas', stereoBed: true, gainDb: -16 },
  { id: 'crickets', label: 'crickets (night)', group: 'Loops', bus: 'ambience', bed: 'bed.crickets', stereoBed: true, gainDb: -16 },
  {
    id: 'birds',
    label: 'birds (birdsong, sparrows, swifts)',
    group: 'Loops',
    bus: 'ambience',
    // Single calls placed around the listener (a continuous recorded bed was a wall of birds).
    events: [
      { sound: 'amb.birdcall', rate: 0.32, dist: [9, 48], height: [1.5, 14] },
      { sound: 'amb.sparrow', rate: 0.35, dist: [6, 25], height: [2, 8] },
      { sound: 'amb.swifts', rate: 0.05, dist: [20, 45], height: [15, 35], move: 14 },
    ],
  },
  { id: 'swifts', label: 'swifts (dusk)', group: 'Loops', bus: 'ambience', gainDb: 0, events: [{ sound: 'amb.swifts', rate: 0.14, dist: [15, 45], height: [12, 35], move: 16 }] },
  {
    id: 'owl',
    label: 'owls (night)',
    group: 'Loops',
    bus: 'ambience',
    gainDb: 0,
    events: [
      { sound: 'amb.owl', rate: 0.04, dist: [30, 80], height: [6, 15], bout: { count: [4, 10], interval: [2.4, 2.8] } },
      { sound: 'amb.owl.little', rate: 0.012, dist: [30, 80], height: [3, 10], bout: { count: [1, 3], interval: [1.6, 3] } },
    ],
  },
  { id: 'dogs', label: 'dogs (distant)', group: 'Loops', bus: 'ambience', gainDb: 0, events: [{ sound: 'amb.dog', rate: 0.03, dist: [30, 110] }] },
  { id: 'workshop', label: 'workshop (positional)', group: 'Loops', bus: 'ambience', gainDb: 0, spatial: { ref: 6, max: 90, rolloff: 1 }, events: [{ sound: 'amb.hammer', rate: 0.22, jitter: 1 }] },
  { id: 'carts', label: 'night carts', group: 'Loops', bus: 'ambience', gainDb: 0, events: [{ sound: 'amb.cart', rate: 0.03, dist: [12, 45], move: 2.5 }] },
  { id: 'temple-music', label: 'temple music (positional)', group: 'Loops', bus: 'ambience', gainDb: 0, spatial: { ref: 10, max: 120, rolloff: 1 }, events: [{ sound: 'amb.temple', rate: 0.09, jitter: 2 }] },
];
