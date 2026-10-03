import { describe, expect, it } from 'vitest';
import { analyze, detectPitch, dominantFrequency, seamRatio, spectralCentroid } from '../src/audio/dsp/analysis';
import { Biquad, Rand, addMode, alloc, makeSeamless, normalizeLoudness, rmsOf } from '../src/audio/dsp/core';
import { brass, cymbal, drumStroke } from '../src/audio/dsp/instruments';
import { pluck, sine } from '../src/audio/dsp/pluck';
import { REVERBS, impulseResponse } from '../src/audio/dsp/reverb';
import { VOWELS, synthVoice } from '../src/audio/dsp/voice';

const RATE = 32000;

describe('analysis', () => {
  it('measures a sine', () => {
    const s = sine(440, 1, RATE, 0.5);
    const a = analyze(s, RATE);
    expect(a.peak).toBeCloseTo(0.5, 2);
    expect(a.rms).toBeCloseTo(0.5 / Math.SQRT2, 2);
    expect(a.nan).toBe(0);
    expect(detectPitch(s, RATE, 50, 2000)).toBeCloseTo(440, 0);
    expect(dominantFrequency(s, RATE)).toBeCloseTo(440, 0);
    expect(spectralCentroid(s, RATE)).toBeGreaterThan(400);
    expect(spectralCentroid(s, RATE)).toBeLessThan(480);
  });
});

describe('filters and generators', () => {
  it('low-pass attenuates highs, band-pass keeps its band', () => {
    const hi = sine(8000, 0.5, RATE);
    const lo = sine(200, 0.5, RATE);
    const lp = () => new Biquad().lowpass(1000, 0.707, RATE);
    expect(rmsOf(lp().run(hi.slice()))).toBeLessThan(rmsOf(hi) * 0.05);
    expect(rmsOf(lp().run(lo.slice()))).toBeGreaterThan(rmsOf(lo) * 0.9);
    const bp = new Biquad().bandpass(1000, 2, RATE);
    const mid = sine(1000, 0.5, RATE);
    expect(rmsOf(bp.run(mid.slice()))).toBeGreaterThan(rmsOf(mid) * 0.9);
  });

  it('modes decay to -60 dB at t60', () => {
    const out = alloc(1.2, RATE);
    addMode(out, RATE, 0, 1000, 1, 1);
    const early = rmsOf(out, 0, 1600);
    const late = rmsOf(out, Math.round(0.95 * RATE), Math.round(1.0 * RATE));
    expect(20 * Math.log10(late / early)).toBeLessThan(-50);
    expect(dominantFrequency(out, RATE)).toBeCloseTo(1000, 0);
  });

  it('Karplus–Strong plucks are in tune', () => {
    for (const f of [110, 220, 293.66, 440]) {
      const s = pluck(f, RATE, new Rand(1), { seconds: 1, t60: 2, body: null });
      const p = detectPitch(s, RATE, 50, 1000, 3200, 8192);
      expect(Math.abs(1200 * Math.log2(p / f))).toBeLessThan(8); // cents
    }
  });

  it('formant voice holds its pitch and has vowel-dependent brightness', () => {
    const v = (vowel: 'a' | 'u') =>
      synthVoice({ dur: 0.6, f0: () => 120, amp: () => 1, formants: () => VOWELS.m[vowel], jitter: 0, shimmer: 0 }, RATE, new Rand(3));
    const a = v('a');
    const u = v('u');
    expect(detectPitch(a, RATE, 60, 400, 4000, 4096)).toBeCloseTo(120, -1);
    expect(spectralCentroid(a, RATE)).toBeGreaterThan(spectralCentroid(u, RATE));
  });

  it('seamless loops have no seam', () => {
    const r = new Rand(5);
    const raw = alloc(3, RATE);
    const bp = new Biquad().bandpass(800, 1, RATE);
    for (let i = 0; i < raw.length; i++) raw[i] = bp.process(r.bi());
    const loop = makeSeamless(raw, RATE, 0.3);
    expect(loop.length).toBe(raw.length - Math.round(0.3 * RATE));
    expect(seamRatio(loop)).toBeLessThan(3);
    // Equal-power crossfade: no level dip in the faded head.
    const head = rmsOf(loop, 0, Math.round(0.3 * RATE));
    const body = rmsOf(loop, Math.round(0.5 * RATE), loop.length);
    expect(Math.abs(20 * Math.log10(head / body))).toBeLessThan(2);
  });

  it('loudness normalization equalizes sustained and spiky sounds within the peak cap', () => {
    const tone = sine(500, 0.5, RATE, 0.9);
    normalizeLoudness(tone, RATE, 0.2, 0.05, 0.95);
    expect(rmsOf(tone)).toBeCloseTo(0.2, 2);
    const click = alloc(0.5, RATE);
    click[100] = 1;
    normalizeLoudness(click, RATE, 0.2, 0.05, 0.95);
    expect(Math.max(...click)).toBeLessThanOrEqual(0.95 + 1e-6);
  });

  it('instruments produce sane buffers', () => {
    for (const b of [drumStroke('doum', RATE, new Rand(1)), drumStroke('tek', RATE, new Rand(2)), cymbal('ring', RATE, new Rand(3))]) {
      const a = analyze(b, RATE);
      expect(a.nan).toBe(0);
      expect(a.rms).toBeGreaterThan(0.001);
    }
    // The tympanum's doum sits low, the tek high.
    expect(spectralCentroid(drumStroke('doum', RATE, new Rand(1)), RATE)).toBeLessThan(spectralCentroid(drumStroke('tek', RATE, new Rand(1)), RATE));
    const horn = alloc(1, RATE);
    brass(horn, RATE, new Rand(4), { t: 0, freq: 233, dur: 0.8, dyn: 0.9 });
    expect(detectPitch(horn, RATE, 60, 1000, 8000, 4096)).toBeCloseTo(233, -1);
  });
});

describe('reverb impulse responses', () => {
  for (const [name, spec] of Object.entries(REVERBS)) {
    it(`${name}: decays, normalized, finite`, () => {
      const [l, r] = impulseResponse(spec, 24000);
      expect(l.length).toBe(r.length);
      expect(l.length / 24000).toBeGreaterThan(spec.t60 * 0.95);
      let e = 0;
      for (const x of l) e += x * x;
      expect(e).toBeCloseTo(0.3, 2);
      const head = rmsOf(l, 0, Math.round(0.2 * 24000));
      const tail = rmsOf(l, l.length - 2400, l.length);
      expect(tail).toBeLessThan(head * 0.05);
      expect(analyze(l, 24000).nan).toBe(0);
    });
  }
});
