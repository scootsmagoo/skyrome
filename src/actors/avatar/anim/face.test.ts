import { describe, expect, it } from 'vitest';
import { BLINK_CLOSE, BLINK_HOLD, BLINK_TIME, blinkCurve, FaceDriver, jawAt, JAW_OPEN, syllables } from './face';
import { PRM } from '../real/deform';
import { Rng } from '../../../core/Rng';

const rnd = (seed: number) => {
  const r = new Rng(seed);
  return () => r.next();
};

describe('face: blinks', () => {
  it('a blink shuts fast, holds, and opens within about 150 ms', () => {
    expect(blinkCurve(0)).toBe(0);
    expect(blinkCurve(0.05)).toBeCloseTo(1, 5);
    expect(blinkCurve(0.06)).toBe(1);
    expect(blinkCurve(BLINK_TIME)).toBe(0);
    expect(BLINK_TIME).toBeGreaterThan(0.1);
    expect(BLINK_TIME).toBeLessThan(0.18);
    // Opening is slower than closing: 25 ms into each, the lid has gone further on the way down.
    expect(blinkCurve(0.025)).toBeGreaterThan(1 - blinkCurve(BLINK_CLOSE + BLINK_HOLD + 0.025));
  });

  it('blinks every 2 to 6 s, and two faces do not blink together', () => {
    const run = (seed: number) => {
      const f = new FaceDriver(rnd(seed));
      const p = new Float32Array(16);
      const starts: number[] = [];
      let was = 0;
      for (let i = 0; i < 60 * 60; i++) {
        f.update(1 / 60, p);
        if (p[PRM.blinkL] > 0 && was === 0) starts.push(i / 60);
        was = p[PRM.blinkL];
      }
      return starts;
    };
    const a = run(1);
    const b = run(2);
    // About 10 to 30 blinks a minute (gaze jumps and double blinks add a few).
    expect(a.length).toBeGreaterThan(9);
    expect(a.length).toBeLessThan(40);
    const gaps = a.slice(1).map((t, i) => t - a[i]);
    expect(Math.max(...gaps)).toBeLessThan(6.5);
    const together = a.filter((t) => b.some((u) => Math.abs(u - t) < 0.05)).length;
    expect(together).toBeLessThan(a.length / 3);
  });

  it('a held blink stays shut (screenshots)', () => {
    const f = new FaceDriver(rnd(3));
    const p = new Float32Array(16);
    f.debugBlink = 1;
    f.update(0.016, p);
    expect(p[PRM.blinkL]).toBe(1);
    expect(p[PRM.blinkR]).toBe(1);
  });
});

describe('face: speech', () => {
  it('turns a line into syllables with pauses at words and punctuation', () => {
    const b = syllables('Salve, amice! Quid agis?', 4.5, () => 0.5);
    // sal-ve a-mi-ce quid a-gis: 8 vowel groups.
    expect(b.length).toBe(8);
    for (let i = 1; i < b.length; i++) expect(b[i][0]).toBeGreaterThanOrEqual(b[i - 1][0] + b[i - 1][1] - 1e-9);
    // The pause after "amice!" is longer than the gap inside a word.
    const gapInWord = b[1][0] - (b[0][0] + b[0][1]);
    const gapSentence = b[5][0] - (b[4][0] + b[4][1]);
    expect(gapSentence).toBeGreaterThan(gapInWord + 0.2);
    const end = b[b.length - 1][0] + b[b.length - 1][1];
    expect(end).toBeGreaterThan(1.5);
    expect(end).toBeLessThan(3.5);
  });

  it('the jaw opens and shuts with the syllables, and rests after the line', () => {
    const f = new FaceDriver(rnd(4));
    const p = new Float32Array(16);
    f.speak('Ave, civis. Emptor es?');
    let max = 0;
    let shut = 0;
    let t = 0;
    while (f.speechLeft > 0 && t < 10) {
      f.update(1 / 60, p);
      t += 1 / 60;
      max = Math.max(max, p[PRM.jaw]);
      if (p[PRM.jaw] < 0.15 * JAW_OPEN) shut++;
    }
    expect(max).toBeGreaterThan(0.5 * JAW_OPEN);
    expect(max).toBeLessThanOrEqual(JAW_OPEN + 1e-6);
    // Not just open: it closes between syllables.
    expect(shut).toBeGreaterThan(5);
    for (let i = 0; i < 30; i++) f.update(1 / 60, p);
    expect(p[PRM.jaw]).toBeLessThan(0.01);
    expect(jawAt([[0, 0.2, 1]], 0.1)).toBeCloseTo(Math.sin(Math.PI * Math.pow(0.5, 0.8)), 6);
  });

  it('an empty line stops the jaw', () => {
    const f = new FaceDriver(rnd(5));
    f.speak('Longissima oratio de rebus omnibus.');
    f.speak('');
    expect(f.speechLeft).toBe(0);
  });
});

describe('face: gaze', () => {
  it('the eyes go to the target quickly, within limits', () => {
    const f = new FaceDriver(rnd(6));
    const p = new Float32Array(16);
    f.lookAt(0.3, -0.1);
    for (let i = 0; i < 20; i++) f.update(1 / 60, p);
    expect(p[PRM.gazeYaw]).toBeCloseTo(0.3, 2);
    expect(p[PRM.gazePitch]).toBeCloseTo(-0.1, 2);
    f.lookAt(2, 2);
    for (let i = 0; i < 30; i++) f.update(1 / 60, p);
    expect(p[PRM.gazeYaw]).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(p[PRM.gazePitch]).toBeLessThanOrEqual(0.35 + 1e-6);
  });
  it('without a target the eyes glance about near straight ahead', () => {
    const f = new FaceDriver(rnd(7));
    const p = new Float32Array(16);
    let maxYaw = 0;
    for (let i = 0; i < 600; i++) {
      f.update(1 / 60, p);
      maxYaw = Math.max(maxYaw, Math.abs(p[PRM.gazeYaw]));
    }
    expect(maxYaw).toBeGreaterThan(0.01);
    expect(maxYaw).toBeLessThanOrEqual(0.3 + 1e-6);
  });
});
