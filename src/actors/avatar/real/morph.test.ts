import { describe, expect, it } from 'vitest';
import { BONES, computeRig } from '../rig';
import { morphBody } from './morph';
import { refRig } from './refs';

/** One vertex per bone, sitting on its joint, rigid to that bone. */
function jointCloud(joints: Float32Array) {
  const n = BONES.length;
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const normal = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    skinIndex[i * 4] = i;
    skinWeight[i * 4] = 1;
    normal[i * 3 + 2] = 1;
  }
  return { position: Float32Array.from(joints), normal, skinIndex, skinWeight };
}

describe('real body morph', () => {
  it('is the identity for the reference rig', () => {
    const ref = refRig('male');
    const src = jointCloud(ref.joints);
    const out = { position: new Float32Array(src.position.length), normal: new Float32Array(src.normal.length) };
    morphBody(src, ref, ref, out);
    for (let i = 0; i < out.position.length; i++) expect(out.position[i]).toBeCloseTo(ref.joints[i], 6);
    expect(out.normal[2]).toBeCloseTo(1, 6);
  });

  it('puts joint vertices exactly on the target joints for any appearance', () => {
    const ref = refRig('female');
    for (const app of [
      { sex: 'female', age: 'adult', build: 'heavy', height: 1.5 },
      { sex: 'female', age: 'old', build: 'slight', height: 1.72 },
      { sex: 'female', age: 'child', build: 'average', height: 1.1 },
    ] as const) {
      const tgt = computeRig(app);
      const src = jointCloud(ref.joints);
      const out = { position: new Float32Array(src.position.length), normal: new Float32Array(src.normal.length) };
      morphBody(src, ref, tgt, out);
      for (let i = 0; i < out.position.length; i++) expect(out.position[i]).toBeCloseTo(tgt.joints[i], 5);
    }
  });

  it('keeps normals unit length and widens a heavy body', () => {
    const ref = refRig('male');
    const tgt = computeRig({ sex: 'male', age: 'adult', build: 'heavy', height: 1.75 });
    const src = jointCloud(ref.joints);
    // A point 10 cm in front of the spine joint moves further out.
    const i = BONES.indexOf('spine');
    src.position[i * 3 + 2] += 0.1;
    const out = { position: new Float32Array(src.position.length), normal: new Float32Array(src.normal.length) };
    morphBody(src, ref, tgt, out);
    expect(out.position[i * 3 + 2] - tgt.joints[i * 3 + 2]).toBeGreaterThan(0.12);
    expect(Math.hypot(out.normal[i * 3], out.normal[i * 3 + 1], out.normal[i * 3 + 2])).toBeCloseTo(1, 5);
  });
});
