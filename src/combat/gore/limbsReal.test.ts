import { describe, expect, it } from 'vitest';
import { PARENT, computeRig } from '../../actors/avatar/rig';
import { REAL_REFS } from '../../actors/avatar/real/refs';
import { CUT_BONE, REAL_CUT, subtree, type Part } from './limbs';

describe('REAL_CUT (where realistic bodies are cut)', () => {
  const parts = Object.keys(CUT_BONE) as Part[];

  it('cuts through a bone whose child bone is the next joint, inside the cut bone subtree', () => {
    for (const p of parts) {
      const { bone, child, t } = REAL_CUT[p];
      expect(PARENT[child], p).toBe(bone);
      expect(t).toBeGreaterThan(0.2);
      expect(t).toBeLessThan(0.8);
      // everything the procedural cut takes (the CUT_BONE subtree) lies beyond the plane or in the cut bone's subtree
      expect(subtree(bone).size, p).toBeGreaterThanOrEqual(subtree(CUT_BONE[p]).size);
    }
  });

  it('puts the cut plane between the two joints, so the piece is longer than nothing', () => {
    const rig = computeRig(REAL_REFS.male);
    for (const p of parts) {
      const { bone, child } = REAL_CUT[p];
      const i = Object.keys(PARENT).indexOf(bone) * 3;
      const j = Object.keys(PARENT).indexOf(child) * 3;
      const len = Math.hypot(rig.joints[j] - rig.joints[i], rig.joints[j + 1] - rig.joints[i + 1], rig.joints[j + 2] - rig.joints[i + 2]);
      expect(len, p).toBeGreaterThan(0.05);
    }
  });
});
