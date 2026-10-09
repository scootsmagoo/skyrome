/**
 * The reference bodies the realistic meshes are baked at (must match tools/characters/dump-rig.mjs):
 * an average adult man of 1.75 m (the animation reference height) and an average adult woman of 1.62 m.
 */
import type { Appearance, Sex } from '../../appearance';
import { computeRig, type Rig } from '../rig';

export const REAL_REFS = {
  male: { sex: 'male', age: 'adult', build: 'average', height: 1.75 },
  female: { sex: 'female', age: 'adult', build: 'average', height: 1.62 },
} as const satisfies Record<Sex, Pick<Appearance, 'sex' | 'age' | 'build' | 'height'>>;

const cache = new Map<Sex, Rig>();

/** The rig the baked mesh of `sex` was posed to. */
export function refRig(sex: Sex): Rig {
  let r = cache.get(sex);
  if (!r) {
    r = computeRig(REAL_REFS[sex]);
    cache.set(sex, r);
  }
  return r;
}
