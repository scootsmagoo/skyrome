import { describe, expect, it } from 'vitest';
import { headMeasureOf } from './frame';
import { measureJaw, measureLids } from './faceRig';
import { loadBody, loadEyes, loadIndex } from './testBody';

/** Centre and radius of the left eye (x > 0) of the baked eye mesh. */
function leftEye(sex: 'male' | 'female') {
  const e = loadEyes(sex).body.position;
  const c = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < e.length / 3; i++) if (e[i * 3] > 0) {
    for (let k = 0; k < 3; k++) c[k] += e[i * 3 + k];
    n++;
  }
  for (let k = 0; k < 3; k++) c[k] /= n;
  let r = 0;
  for (let i = 0; i < e.length / 3; i++) if (e[i * 3] > 0) r = Math.max(r, Math.hypot(e[i * 3] - c[0], e[i * 3 + 1] - c[1], e[i * 3 + 2] - c[2]));
  return { c, r };
}

describe('face rig', () => {
  for (const sex of ['male', 'female'] as const) {
    it(`${sex}: the jaw moves the chin and lower lip, not the upper lip, the cheeks or the neck`, () => {
      const body = loadBody(sex);
      const m = headMeasureOf(body, sex);
      const jaw = measureJaw(body, m);
      expect(jaw.hinge[1]).toBeGreaterThan(jaw.mouthY + 0.02);
      expect(jaw.hinge[1]).toBeLessThan(m.eyeY);
      let chin = 0;
      let upper = 0;
      for (const [v, w] of jaw.weights) {
        const x = body.position[v * 3];
        const y = body.position[v * 3 + 1];
        const z = body.position[v * 3 + 2];
        if (Math.abs(x) < 0.01 && y < jaw.mouthY - 0.02 && z > m.cz + 0.06) chin = Math.max(chin, w);
        if (y > jaw.mouthY + 0.004) upper++;
        // Nothing below the jaw's underside (the neck).
        expect(y).toBeGreaterThan(m.chin - 0.05);
      }
      expect(chin).toBeGreaterThan(0.95);
      expect(upper).toBe(0);
      expect(jaw.weights.size).toBeGreaterThan(80);
    });
    it(`${sex}: the lids open around the eye's axis, wider in the middle than at the corners`, () => {
      const { c, r } = leftEye(sex);
      const lids = measureLids(loadBody(sex), loadIndex(sex), c, r, 1);
      const mid = lids.az.findIndex((a) => Math.abs(a) < 1e-6);
      const D = 180 / Math.PI;
      if (process.env.LOG_LIDS) console.log(sex, 'r', r.toFixed(4), 'upper', lids.upper.map((x) => (x * D).toFixed(0)).join(' '), 'lower', lids.lower.map((x) => (x * D).toFixed(0)).join(' '));
      expect(lids.upper[mid] * D).toBeGreaterThan(8);
      expect(lids.upper[mid] * D).toBeLessThan(45);
      expect(lids.lower[mid] * D).toBeLessThan(-8);
      expect(lids.lower[mid] * D).toBeGreaterThan(-45);
      // Closed at both corners (the inner one nearer the nose), open across the middle.
      const open = lids.upper.map((u, i) => u - lids.lower[i]);
      expect(open[0]).toBeLessThan(0.01);
      expect(open[open.length - 1]).toBeLessThan(0.01);
      expect(open[mid] * D).toBeGreaterThan(35);
    });
  }
});
