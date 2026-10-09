/** Stub (C2b replaces this file): hair, beards, veils and helmets. A crude frame from the rig joints. */
import * as THREE from 'three';
import { B } from '../../rig';
import type { BuildHead } from '../types';

export const buildHead: BuildHead = (ctx) => {
  const J = ctx.rig.joints;
  const h = ctx.rig.headH;
  const y = J[B.head * 3 + 1];
  const chin = y - 0.245 * h;
  return {
    objects: [],
    frame: {
      centre: new THREE.Vector3(J[B.head * 3], chin + 0.55 * h, J[B.head * 3 + 2] + 0.01),
      radii: new THREE.Vector3(0.36 * h, 0.5 * h, 0.42 * h),
      brow: chin + 0.635 * h,
      ears: chin + 0.47 * h,
      crown: chin + h,
      chin,
    },
  };
};
