import { describe, expect, it } from 'vitest';
import { SAMPLE_TONE, applyTone, toneCoef } from '../src/audio/sampleTone';

const RATE = 32000;
/** RMS of a sine of `f` Hz after a sound's tone, relative to before. */
function gainAt(id: string, f: number): number {
  const n = RATE;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * f * i) / RATE);
  const y = applyTone(Float32Array.from(x), RATE, id);
  let a = 0;
  let b = 0;
  for (let i = n / 2; i < n; i++) {
    a += x[i] * x[i];
    b += y[i] * y[i];
  }
  return Math.sqrt(b / a);
}

describe('sample tone', () => {
  it('leaves a sound with no entry untouched', () => {
    const x = Float32Array.from([0.1, -0.2, 0.3]);
    expect(Array.from(applyTone(Float32Array.from(x), RATE, 'no.such.sound'))).toEqual(Array.from(x));
  });
  it('takes the hiss off grass but keeps its body', () => {
    expect(gainAt('step.grass.walk', 9000)).toBeLessThan(0.2);
    expect(gainAt('step.grass.walk', 600)).toBeGreaterThan(0.85);
  });
  it('tames the clash ring above 5 kHz', () => {
    expect(gainAt('clash.metal', 7500)).toBeLessThan(0.15);
  });
  it('every filter is stable (poles inside the unit circle)', () => {
    for (const stages of Object.values(SAMPLE_TONE)) {
      for (const s of stages) {
        for (const rate of [16000, 24000, 32000]) {
          const c = toneCoef(s, rate);
          expect(Math.abs(c.a2)).toBeLessThan(1);
          expect(Math.abs(c.a1)).toBeLessThan(1 + c.a2);
        }
      }
    }
  });
  it('covers every walkable surface with all three footfall kinds', () => {
    for (const s of ['stone', 'marble', 'cobbles', 'grass', 'gravel', 'sand', 'water']) {
      for (const id of [`step.${s}.walk`, `step.${s}.sneak`, `land.${s}`]) expect(SAMPLE_TONE[id]).toBeDefined();
    }
  });
});
