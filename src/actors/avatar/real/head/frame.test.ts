import { describe, expect, it } from 'vitest';
import { computeRig, B } from '../../rig';
import type { Appearance } from '../../../appearance';
import type { BodyArrays } from '../morph';
import { headMeasureOf, HeadSurface, measureHead } from './frame';
import { REAL_REFS, refRig } from '../refs';
import { loadBody } from './testBody';

describe('real head frame', () => {
  for (const sex of ['male', 'female'] as const) {
    it(`${sex}: measured from the baked head, scaled with the rig`, () => {
      const body = loadBody(sex);
      const m = headMeasureOf(body, sex);
      // A believable head: 22 to 29 cm chin to crown, 15 to 20 cm wide skull, nose in front of the face.
      expect(m.crown - m.chin).toBeGreaterThan(0.22);
      expect(m.crown - m.chin).toBeLessThan(0.29);
      expect(m.noseTip.z).toBeGreaterThan(m.cz + 0.09);
      const ref = new HeadSurface(m, refRig(sex));
      expect(ref.radii.x).toBeGreaterThan(0.065);
      expect(ref.radii.x).toBeLessThan(0.1);
      expect(ref.radii.z).toBeGreaterThan(0.07);
      expect(ref.earOut).toBeGreaterThan(0.004);
      // Radii are positive everywhere above the jaw and the surface is smooth.
      const p = ref.at(0.7, 0.3);
      expect(p.y).toBeGreaterThan(ref.chin);
      for (let yf = 0.1; yf < 0.95; yf += 0.05) for (let th = 0; th < 6.3; th += 0.2) expect(ref.radius(yf, th)).toBeGreaterThan(0.02);
      // Ear removal: the side radius at ear height is the skull's, not the ear's.
      expect(ref.radius(0.55, Math.PI / 2)).toBeLessThan(ref.radii.x + 0.02);
      // A taller person with a bigger head scales every dimension by headH ratio.
      const app: Appearance = { ...REAL_REFS[sex], skin: '#c89a78', hair: { style: 'bald', color: '#222' }, garments: [] };
      const big = new HeadSurface(m, computeRig({ ...app, height: REAL_REFS[sex].height * 1.1 }));
      const k = big.H / ref.H;
      expect(k).toBeGreaterThan(1.0);
      expect(big.radii.x / ref.radii.x).toBeCloseTo(k, 2);
    });
  }
  it('measureHead ignores non-head vertices', () => {
    const n = 4;
    const body: BodyArrays = {
      position: new Float32Array([0, 1, 0, 0.1, 1.1, 0, 0, 1.2, 0.1, 0, 0.5, 0]),
      normal: new Float32Array(n * 3),
      skinIndex: new Uint8Array([B.head, 0, 0, 0, B.head, 0, 0, 0, B.head, 0, 0, 0, B.hips, 0, 0, 0]),
      skinWeight: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
    };
    const m = measureHead(body, 'male');
    expect(m.crown).toBeCloseTo(1.2, 5);
  });
});
