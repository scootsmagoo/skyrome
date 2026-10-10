import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { B, BONES, computeRig } from '../rig';
import { refRig } from './refs';
import { DEFORM_CHANNEL, deformAttributes, deformPoint, deformTable, paramsOf, PARAM_SLOT, PRM } from './deform';
import { handParts, measureHand, reshapeHand } from './handShape';
import { measureJaw } from './head/faceRig';
import { headMeasureOf } from './head/frame';
import { loadBody, loadIndex } from './head/testBody';
import type { BodyArrays } from './morph';

function template(sex: 'male' | 'female') {
  const src = loadBody(sex);
  const body: BodyArrays = { position: src.position.slice(), normal: src.normal.slice(), skinIndex: Uint8Array.from(src.skinIndex as ArrayLike<number>), skinWeight: Float32Array.from(src.skinWeight as ArrayLike<number>) };
  const hands = [measureHand(src, loadIndex(sex), refRig(sex), 1), measureHand(src, loadIndex(sex), refRig(sex), -1)];
  const parts = handParts(body.position.length / 3);
  for (const h of hands) reshapeHand(body, h!, refRig(sex), parts);
  const jaw = measureJaw(body, headMeasureOf(src, sex));
  return { body, table: deformTable(hands, parts, jaw), jaw };
}

describe('the parameter slot', () => {
  it('is a free matrix in the bone texture, after the 25 bones', () => {
    const bones = BONES.map(() => new THREE.Bone());
    const sk = new THREE.Skeleton(bones);
    const p = paramsOf(sk)!;
    expect(p).not.toBeNull();
    expect(p.length).toBe(16);
    p[PRM.jaw] = 0.5;
    expect(sk.boneMatrices![PARAM_SLOT * 16]).toBe(0.5);
    // three's own update leaves it alone.
    sk.update();
    expect(sk.boneMatrices![PARAM_SLOT * 16]).toBe(0.5);
    expect(paramsOf(sk)).toBe(p);
  });
});

describe('deformation table and attributes', () => {
  for (const sex of ['male', 'female'] as const) {
    it(`${sex}: fingers, thumbs and the jaw are in, on their channels`, () => {
      const { table } = template(sex);
      const count = new Map<number, number>();
      for (const d of table.values()) count.set(d.ch, (count.get(d.ch) ?? 0) + 1);
      for (const ch of Object.values(DEFORM_CHANNEL)) expect(count.get(ch) ?? 0, `channel ${ch}`).toBeGreaterThan(8);
    });
    it(`${sex}: the attributes encode a still vertex as no deformation, also without the attribute`, () => {
      const { body, table } = template(sex);
      const rig = computeRig({ sex, age: 'adult', build: 'stocky', height: sex === 'male' ? 1.82 : 1.55 });
      const n = body.position.length / 3;
      const { a0, a1 } = deformAttributes(table, n, refRig(sex), rig);
      const prm = new Float32Array(16).fill(0.6);
      let still = 0;
      for (let v = 0; v < n; v++) {
        if (table.has(v)) continue;
        const p = [1, 2, 3];
        const q = deformPoint(p, a0.subarray(v * 4, v * 4 + 4), a1.subarray(v * 4, v * 4 + 4), prm);
        expect(q).toEqual(p);
        still++;
      }
      expect(still).toBeGreaterThan(n * 0.8);
      // A geometry without the attribute reads (0, 0, 0, 1): nothing moves.
      expect(deformPoint([1, 2, 3], [0, 0, 0, 1], [0, 0, 0, 1], prm)).toEqual([1, 2, 3]);
    });
    it(`${sex}: the middle joints curl the fingertips toward the palm; the jaw lowers the chin`, () => {
      const { body, table, jaw } = template(sex);
      const rig = refRig(sex);
      const n = body.position.length / 3;
      const { a0, a1 } = deformAttributes(table, n, rig, rig);
      const prm = new Float32Array(16);
      prm[PRM.hand[0]] = prm[PRM.hand[1]] = 60 * (Math.PI / 180);
      prm[PRM.jaw] = 0.1;
      let tips = 0;
      let chin = 0;
      let palmward = 0;
      let up = 0;
      let moved = 0;
      for (const [v, d] of table) {
        const p = [body.position[v * 3], body.position[v * 3 + 1], body.position[v * 3 + 2]];
        const q = deformPoint(p, a0.subarray(v * 4, v * 4 + 4), a1.subarray(v * 4, v * 4 + 4), prm);
        if ((d.ch === DEFORM_CHANNEL.fingersL || d.ch === DEFORM_CHANNEL.fingersR) && d.w1 > 0.99 && (d.w2 ?? 0) > 0.99) {
          // The left palm faces -x, the right +x: the tips swing up and that way, centimetres far.
          const side = d.ch === DEFORM_CHANNEL.fingersL ? 1 : -1;
          palmward += (q[0] - p[0]) * -side;
          up += q[1] - p[1];
          moved += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
          tips++;
        }
        if (d.ch === DEFORM_CHANNEL.jaw && d.w1 > 0.99 && p[1] < jaw.mouthY - 0.03) {
          expect(q[1]).toBeLessThan(p[1]);
          chin++;
        }
      }
      expect(tips).toBeGreaterThan(10);
      expect(palmward / tips).toBeGreaterThan(0.004);
      expect(up / tips).toBeGreaterThan(0.015);
      expect(moved / tips).toBeGreaterThan(0.02);
      expect(chin).toBeGreaterThan(5);
      expect(B.head).toBeGreaterThan(0);
    });
  }
});
