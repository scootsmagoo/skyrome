import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { B } from '../rig';
import { refRig } from './refs';
import { handParts, measureHand, reshapeHand, type V3 } from './handShape';
import { loadBody, loadIndex } from './head/testBody';
import type { BodyArrays } from './morph';

const copy = (b: BodyArrays): BodyArrays => ({
  position: b.position.slice(),
  normal: b.normal.slice(),
  skinIndex: Uint8Array.from(b.skinIndex as ArrayLike<number>),
  skinWeight: Float32Array.from(b.skinWeight as ArrayLike<number>),
});

/** Spread of the fingertips along z (the fan's width) of the left hand (`src`: the weights before the reshape). */
function tipSpread(body: BodyArrays, src: BodyArrays, below: number) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let v = 0; v < body.position.length / 3; v++) {
    let hw = 0;
    for (let k = 0; k < 4; k++) if ([B.handL, B.fingersL, B.indexL].includes(src.skinIndex[v * 4 + k])) hw += src.skinWeight[v * 4 + k];
    if (hw < 0.5 || body.position[v * 3] < 0.05 || body.position[v * 3 + 1] > below) continue;
    lo = Math.min(lo, body.position[v * 3 + 2]);
    hi = Math.max(hi, body.position[v * 3 + 2]);
  }
  return hi - lo;
}

describe('realistic hands', () => {
  for (const sex of ['male', 'female'] as const) {
    for (const side of [1, -1] as const) {
      it(`${sex} ${side > 0 ? 'left' : 'right'}: four fingers and a thumb measured on the mesh`, () => {
        const body = loadBody(sex);
        const rig = refRig(sex);
        const m = measureHand(body, loadIndex(sex), rig, side)!;
        expect(m).not.toBeNull();
        expect(m.fingers).toHaveLength(4);
        for (const f of m.fingers) {
          expect(f.length).toBeGreaterThan(0.045);
          expect(f.length).toBeLessThan(0.11);
          expect(f.dir[1]).toBeLessThan(-0.6);
        }
        // Index in front (thumb side), little finger behind.
        expect(m.fingers[0].knuckle[2]).toBeGreaterThan(m.fingers[3].knuckle[2] + 0.02);
        // The middle finger is the longest of the four.
        expect(m.fingers[1].length).toBeGreaterThanOrEqual(Math.max(m.fingers[0].length, m.fingers[3].length));
        expect(m.thumb.tip[2]).toBeGreaterThan(m.fingers[0].knuckle[2]);
        expect(m.thumb.length).toBeGreaterThan(0.05);
      });
    }
    it(`${sex}: reshaped hands close the fan, keep weights normalised and give each finger its own bone`, () => {
      const src = loadBody(sex);
      const body = copy(src);
      const rig = refRig(sex);
      const mcpY = rig.joints[B.fingersL * 3 + 1];
      const before = tipSpread(body, src, mcpY - 0.03);
      const nv = src.position.length / 3;
      const parts = handParts(nv);
      for (const side of [1, -1] as const) reshapeHand(body, measureHand(src, loadIndex(sex), rig, side)!, rig, parts);
      if (process.env.DUMP_HANDS) writeFileSync(`.cache/probe/reshaped-${sex}.json`, JSON.stringify({ part: Array.from(parts.part), pw: Array.from(parts.w), position: Array.from(body.position), skinIndex: Array.from(body.skinIndex as ArrayLike<number>), skinWeight: Array.from(body.skinWeight) }));
      const after = tipSpread(body, src, mcpY - 0.03);
      console.log(sex, 'fingertip spread', before.toFixed(3), '->', after.toFixed(3));
      expect(after).toBeLessThan(before * 0.85);
      const n = body.position.length / 3;
      let moved = 0;
      for (let v = 0; v < n; v++) {
        let w = 0;
        for (let k = 0; k < 4; k++) w += body.skinWeight[v * 4 + k];
        expect(w).toBeCloseTo(1, 4);
        const d = Math.hypot(body.position[v * 3] - src.position[v * 3], body.position[v * 3 + 1] - src.position[v * 3 + 1], body.position[v * 3 + 2] - src.position[v * 3 + 2]);
        if (d > 1e-4) {
          moved++;
          // Only the hands move.
          expect(Math.abs(src.position[v * 3])).toBeGreaterThan(0.05);
          expect(src.position[v * 3 + 1]).toBeLessThan(rig.joints[B.handL * 3 + 1] + 0.03);
        }
        const nl = Math.hypot(body.normal[v * 3], body.normal[v * 3 + 1], body.normal[v * 3 + 2]);
        expect(nl).toBeCloseTo(1, 3);
      }
      expect(moved).toBeGreaterThan(100);
      // Fingertips well below the knuckles are on a finger bone, never the wrong one.
      const m = measureHand(src, loadIndex(sex), rig, 1)!;
      for (let v = 0; v < n; v++) {
        const p: V3 = [src.position[v * 3], src.position[v * 3 + 1], src.position[v * 3 + 2]];
        let hw = 0;
        for (let k = 0; k < 4; k++) if ([B.handL, B.fingersL, B.indexL].includes(src.skinIndex[v * 4 + k])) hw += src.skinWeight[v * 4 + k];
        if (hw < 0.5 || p[0] < 0.05 || p[1] > mcpY - 0.035) continue;
        const near = m.fingers.map((f) => Math.hypot(p[0] - f.knuckle[0] - f.dir[0] * (p[1] - f.knuckle[1]) / f.dir[1], p[2] - f.knuckle[2] - f.dir[2] * (p[1] - f.knuckle[1]) / f.dir[1]));
        const fi = near.indexOf(Math.min(...near));
        let wi = 0;
        let wf = 0;
        for (let k = 0; k < 4; k++) {
          if (body.skinIndex[v * 4 + k] === B.indexL) wi += body.skinWeight[v * 4 + k];
          if (body.skinIndex[v * 4 + k] === B.fingersL) wf += body.skinWeight[v * 4 + k];
        }
        if (fi === 0) expect(wi).toBeGreaterThan(0.7);
        else expect(wf).toBeGreaterThan(0.7);
      }
    });
  }
});
