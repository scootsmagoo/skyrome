/**
 * Looping idles: per-stance breathing idles and the IdleLoop set NPC schedules use.
 *
 * Placement conventions (relative to the actor position = the avatar root):
 *   sit       — seat surface 0.45 m high, its front edge ~0.12 m behind the root; pelvis 0.3 m back.
 *   sitGround — sitting cross-legged on the ground at the root.
 *   lean      — leaning back against a wall ~0.25 m behind the root.
 *   sleep     — lying on the back on the ground, pelvis at the root, head toward -Z (behind).
 *   work      — hammering on a block/anvil ~0.75 m high, 0.5 m in front.
 */
import type { IdleLoop, Stance } from '../../Actor';
import type { ClipDef, Key } from './clip';
import type { PoseSpec } from './pose';
import { ORANS } from './actions';
import { ARM_R_SPEAR_CARRY, FEET_REST, REST, stancePose, type Feet } from './poses';

const k = (t: number, pose: PoseSpec, feet?: Partial<Feet>, hold?: boolean): Key => ({ t, pose, feet: feet as Key['feet'], hold });

/** Breathing + subtle weight shift layered on a stance pose. */
export function stanceIdle(stance: Stance, drawn: boolean, sneak = false, togate = false): ClipDef {
  const sp = stancePose(stance, drawn, togate);
  const p = sp.pose;
  const F = sp.feet;
  const add = (spec: PoseSpec, d: Record<string, number[]>): PoseSpec => {
    const out: PoseSpec = { ...spec };
    for (const [key, delta] of Object.entries(d)) {
      const cur = (spec as Record<string, readonly number[] | number | undefined>)[key];
      const base = Array.isArray(cur) ? cur : typeof cur === 'number' ? [cur] : [0, 0, 0, 0];
      (out as Record<string, unknown>)[key] = base.map((v: number, i: number) => v + (delta[i] ?? 0));
    }
    return out;
  };
  let base = p;
  let feet = F;
  if (sneak) {
    base = { ...p, hipsPos: [0, -0.26, -0.03], hips: [18, (p.hips as number[] | undefined)?.[1] ?? 0, 0], spine: [12, (p.spine as number[] | undefined)?.[1] ?? 0, 0], chest: [8, (p.chest as number[] | undefined)?.[1] ?? 0, 0], neck: [-6, 0, 0], head: [-14, 0, 0] };
    feet = { L: [F.L[0] + 0.03, F.L[1] + 0.06, 0, 0, F.L[4] ?? 0], R: [F.R[0] - 0.03, F.R[1] - 0.06, 0, 0, F.R[4] ?? 0] };
  }
  const D = drawn ? 2.6 : 4.2;
  // Inhale with a slow weight shift onto one foot, exhale, then the other side.
  const breathe = (side: number) =>
    add(base, {
      chest: [-1.4, 0, 0],
      shoulderL: [1.6, 0],
      shoulderR: [1.6, 0],
      neck: [0.6, 0, 0],
      hipsPos: [0.012 * side, 0.001, 0],
      hips: [0, 0, -1.2 * side],
      spine: [0, 0, 0.8 * side],
      head: [0, 2.5 * side, 0],
    });
  return {
    name: `idle:${sneak ? 'sneak:' : ''}${togate ? 'togate:' : ''}${stance}:${drawn ? 'drawn' : 'sheathed'}`,
    duration: D * 2,
    loop: true,
    base,
    keys: [k(0, base, feet), k(D * 0.45, breathe(1)), k(D, base), k(D * 1.45, breathe(-1)), k(D * 2, base)],
  };
}

const SIT: PoseSpec = {
  ...REST,
  hipsPos: [0, -0.37, -0.3],
  hips: [-6, 0, 0],
  spine: [10, 0, 0],
  chest: [6, 0, 0],
  neck: [4, 0, 0],
  head: [-4, 0, 0],
  upperArmL: [24, 6, -6, 0],
  upperArmR: [24, 6, -6, 0],
  forearmL: [50, 60],
  forearmR: [50, 60],
  handL: [16, 0, 0],
  handR: [16, 0, 0],
  fingersL: 30,
  fingersR: 30,
};
const SIT_FEET: Feet = { L: [0.03, 0.12, 0, 0, 8], R: [-0.03, 0.09, 0, 0, -10] };

const SIT_GROUND: PoseSpec = {
  ...REST,
  hipsPos: [0, -0.8, -0.05],
  hips: [-4, 0, 0],
  spine: [12, 0, 0],
  chest: [8, 0, 0],
  neck: [4, 0, 0],
  head: [-6, 0, 0],
  thighL: [70, 38, 44],
  shinL: [138],
  footL: [-20, 20],
  thighR: [74, 36, 46],
  shinR: [140],
  footR: [-20, 20],
  upperArmL: [30, 16, 10, 0],
  upperArmR: [30, 16, 10, 0],
  forearmL: [40, 40],
  forearmR: [40, 40],
  handL: [10, 0, 0],
  handR: [10, 0, 0],
};

const LEAN: PoseSpec = {
  ...REST,
  hipsPos: [0, -0.03, -0.1],
  hips: [-10, 4, 0],
  spine: [-2, 0, 0],
  chest: [4, 0, 0],
  neck: [10, -6, 0],
  head: [-2, -6, 0],
  shoulderL: [4, 6],
  shoulderR: [4, 6],
  upperArmL: [40, 14, -46, 0],
  forearmL: [124, 30],
  upperArmR: [36, 14, -50, 0],
  forearmR: [128, 30],
  fingersL: 50,
  fingersR: 50,
};
const LEAN_FEET: Feet = { L: [0.0, 0.08, 0, 0, 10], R: [0.14, 0.14, 0.02, -40, 10] };

const GUARD: PoseSpec = {
  ...REST,
  hipsPos: [0, -0.003, 0],
  spine: [0, 0, 0],
  chest: [-3, 0, 0],
  neck: [4, 0, 0],
  head: [-4, 0, 0],
  ...ARM_R_SPEAR_CARRY,
  upperArmL: [2, 6, 0, 6],
  forearmL: [10, 10],
};

const SLEEP: PoseSpec = {
  hipsPos: [0, -0.83, 0],
  hips: [-88, 0, 6],
  spine: [-2, 0, 0],
  chest: [-2, 0, 0],
  neck: [12, 0, 0],
  head: [8, 24, 4],
  thighL: [6, 6, 10],
  shinL: [8],
  footL: [-30, 0],
  thighR: [18, 2, -6],
  shinR: [30],
  footR: [-30, 0],
  shoulderL: [0, 0],
  shoulderR: [0, 0],
  // Left arm resting on the ground beside the body, palm up; right hand on the belly.
  upperArmL: [-6, 18, 0, 0],
  forearmL: [6, 70],
  upperArmR: [12, 14, 0, -70],
  forearmR: [100, 30],
  handL: [-8, 0, 0],
  handR: [10, 0, 0],
  fingersL: 30,
  fingersR: 30,
};

/** The IdleLoop set. */
export function idleLoopDefs(): Record<IdleLoop, ClipDef> {
  const R = FEET_REST;
  return {
    stand: {
      name: 'loop:stand',
      duration: 9,
      loop: true,
      base: REST,
      keys: [
        k(0, REST, R),
        k(1.6, { chest: [-2.2, 0, 0], shoulderL: [1.5, 0], shoulderR: [1.5, 0], hipsPos: [0.012, -0.006, 0], hips: [0, 0, -1.4] }),
        k(3.3, { chest: [-1, 0, 0], head: [-5, 22, 0], neck: [7, 10, 0], hipsPos: [0.014, -0.008, 0], hips: [0, 0, -1.6] }, undefined, true),
        k(5.0, { head: [-3, -6, 0], neck: [6, -4, 0], hipsPos: [-0.012, -0.007, 0], hips: [0, 0, 1.5], chest: [-2.2, 0, 0] }),
        k(6.6, { head: [-6, -20, 2], neck: [7, -8, 0], hipsPos: [-0.012, -0.007, 0] }, undefined, true),
        k(9, REST, R),
      ],
    },
    sit: {
      name: 'loop:sit',
      duration: 8,
      loop: true,
      base: SIT,
      keys: [
        k(0, SIT, SIT_FEET),
        k(2, { chest: [4.6, 0, 0], shoulderL: [1.5, 0], shoulderR: [1.5, 0] }),
        k(4, { head: [-6, 18, 0], neck: [6, 8, 0], chest: [6, 2, 0] }, undefined, true),
        k(6, { chest: [4.8, 0, 0], head: [-2, -8, 0], neck: [4, -4, 0] }),
        k(8, SIT, SIT_FEET),
      ],
    },
    sitGround: {
      name: 'loop:sitGround',
      duration: 8,
      loop: true,
      base: SIT_GROUND,
      keys: [k(0, SIT_GROUND), k(2.5, { chest: [6.5, 0, 0], shoulderL: [1.5, 0], shoulderR: [1.5, 0], head: [-4, 10, 0] }), k(5.5, { chest: [8, 0, 0], head: [-6, -10, 0] }), k(8, SIT_GROUND)],
    },
    lean: {
      name: 'loop:lean',
      duration: 7,
      loop: true,
      base: LEAN,
      keys: [k(0, LEAN, LEAN_FEET), k(2.4, { chest: [2.6, 0, 0], head: [-4, -16, 0] }), k(4.8, { chest: [3.6, 0, 0], head: [0, 4, 0], neck: [10, 2, 0] }, undefined, true), k(7, LEAN, LEAN_FEET)],
    },
    work: {
      name: 'loop:work',
      duration: 1.15,
      loop: true,
      base: { ...REST, hipsPos: [0, -0.06, 0], hips: [12, -10, 0], spine: [12, 6, 0], chest: [8, 6, 0], neck: [10, 0, 0], head: [10, 0, 0], upperArmL: [40, 10, -10, 0], forearmL: [60, 0], handL: [10, 0, 0], fingersL: 70 },
      keys: [
        k(0, { upperArmR: [56, 18, -6, 0], forearmR: [40, 0], handR: [-20, 0, 0], fingersR: 85, chest: [10, 6, 0] }, { L: [0.04, 0.12, 0, 0, 10], R: [-0.04, -0.1, 0, 0, -20] }),
        k(0.42, { upperArmR: [120, 26, 6, 10], forearmR: [110, 0], handR: [20, 0, 0], chest: [4, 2, 0], spine: [8, 2, 0] }),
        k(0.62, { upperArmR: [118, 26, 6, 10], forearmR: [104, 0] }, undefined, true),
        k(0.84, { upperArmR: [60, 18, -6, 0], forearmR: [44, 0], handR: [-24, 0, 0], chest: [12, 6, 0] }),
        k(1.15, { upperArmR: [56, 18, -6, 0], forearmR: [40, 0], handR: [-20, 0, 0], fingersR: 85, chest: [10, 6, 0] }),
      ],
    },
    sweep: {
      name: 'loop:sweep',
      duration: 2.2,
      loop: true,
      base: { ...REST, hipsPos: [0, -0.07, 0], hips: [14, 0, 0], spine: [16, 0, 0], chest: [6, 0, 0], neck: [10, 0, 0], head: [12, 0, 0], fingersL: 85, fingersR: 85 },
      keys: [
        k(0, { hips: [14, 18, 0], chest: [6, 14, 0], upperArmR: [30, 6, -40, 0], forearmR: [50, 0], upperArmL: [60, 4, -60, 0], forearmL: [80, 20] }, { L: [0.05, 0.08, 0, 0, 14], R: [-0.05, -0.08, 0, 0, -14] }),
        k(1.1, { hips: [14, -16, 0], chest: [6, -14, 0], upperArmR: [24, 30, 20, 0], forearmR: [40, 0], upperArmL: [64, 0, -30, 0], forearmL: [70, 20] }),
        k(2.2, { hips: [14, 18, 0], chest: [6, 14, 0], upperArmR: [30, 6, -40, 0], forearmR: [50, 0], upperArmL: [60, 4, -60, 0], forearmL: [80, 20] }),
      ],
    },
    talk: {
      name: 'loop:talk',
      duration: 6.4,
      loop: true,
      base: REST,
      keys: [
        k(0, REST, R),
        k(0.8, { upperArmR: [26, 14, 14, 0], forearmR: [84, 90], handR: [-12, 0, 0], fingersR: 6, indexR: 0, head: [-4, -4, 0] }),
        k(1.6, { upperArmR: [30, 14, 6, 0], forearmR: [90, 60], fingersR: 30, head: [2, 2, 0] }),
        k(2.4, { upperArmR: [20, 12, 0, 0], forearmR: [60, 30], head: [-2, 0, 0], neck: [8, 0, 0] }),
        k(3.2, { upperArmL: [30, 14, 18, 0], forearmL: [86, 95], handL: [-12, 0, 0], fingersL: 4, upperArmR: [8, 8, 0, 6], forearmR: [20, 14], head: [-4, 6, 0], hipsPos: [0.01, -0.01, 0] }),
        k(4.2, { upperArmL: [36, 16, 10, 0], forearmL: [92, 70], fingersL: 26, head: [4, 2, 0] }),
        k(5.2, { upperArmL: [8, 8, 0, 6], forearmL: [18, 14], head: [-2, -4, 0], hipsPos: [-0.008, -0.01, 0] }),
        k(6.4, REST, R),
      ],
    },
    pray: {
      name: 'loop:pray',
      duration: 5,
      loop: true,
      base: ORANS,
      keys: [k(0, ORANS, R), k(2.5, { ...ORANS, chest: [-5.5, 0, 0], head: [-15, 0, 0], shoulderL: [7.5, 0], shoulderR: [7.5, 0] }), k(5, ORANS, R)],
    },
    sleep: {
      name: 'loop:sleep',
      duration: 5,
      loop: true,
      base: SLEEP,
      keys: [k(0, SLEEP), k(2.2, { chest: [-4, 0, 0], shoulderL: [2, 0], shoulderR: [2, 0] }), k(5, SLEEP)],
    },
    cheer: {
      name: 'loop:cheer',
      duration: 1.5,
      loop: true,
      base: REST,
      keys: [
        k(0, { chest: [-2, 0, 0], head: [-8, 0, 0], upperArmL: [128, 30, 20, 0], upperArmR: [128, 30, 20, 0], forearmL: [80, 0], forearmR: [80, 0], fingersL: 90, fingersR: 90, hipsPos: [0, -0.03, 0] }, R),
        k(0.35, { chest: [-6, 0, 0], head: [-14, 0, 0], upperArmL: [168, 22, 10, 0], upperArmR: [168, 22, 10, 0], forearmL: [24, 0], forearmR: [24, 0], hipsPos: [0, 0.01, 0] }),
        k(0.75, { chest: [-2, 0, 0], head: [-8, 0, 0], upperArmL: [128, 30, 20, 0], upperArmR: [128, 30, 20, 0], forearmL: [80, 0], forearmR: [80, 0], hipsPos: [0, -0.03, 0] }),
        k(1.1, { chest: [-5, 4, 0], head: [-12, 6, 0], upperArmL: [160, 20, 10, 0], upperArmR: [110, 30, 30, 0], forearmL: [30, 0], forearmR: [90, 0], hipsPos: [0, -0.005, 0] }),
        k(1.5, { chest: [-2, 0, 0], head: [-8, 0, 0], upperArmL: [128, 30, 20, 0], upperArmR: [128, 30, 20, 0], forearmL: [80, 0], forearmR: [80, 0], hipsPos: [0, -0.03, 0] }),
      ],
    },
    guard: {
      name: 'loop:guard',
      duration: 6,
      loop: true,
      base: GUARD,
      keys: [k(0, GUARD, { L: [0.0, 0.0, 0, 0, 6], R: [0.0, 0.0, 0, 0, -6] }), k(3, { chest: [-4.2, 0, 0], shoulderL: [1, 0], shoulderR: [1, 0] }), k(6, GUARD)],
    },
    drunk: {
      name: 'loop:drunk',
      duration: 4.8,
      loop: true,
      base: { ...REST, neck: [14, 0, 0], head: [6, 0, 0], upperArmL: [2, 16, 0, 0], upperArmR: [4, 18, 0, 0], forearmL: [24, 10], forearmR: [30, 10], fingersL: 10, fingersR: 10 },
      keys: [
        k(0, { hips: [2, 0, -5], spine: [4, 0, 6], chest: [2, 4, 4], head: [8, 6, -14], hipsPos: [0.03, -0.03, 0] }, { L: [0.04, 0.03, 0, 0, 14], R: [-0.05, -0.02, 0, 0, -16] }),
        k(1.2, { hips: [4, 4, 2], spine: [8, 0, -2], chest: [4, 0, -4], head: [16, -4, 10], hipsPos: [-0.01, -0.05, 0.03] }),
        k(2.2, { hips: [0, 0, 6], spine: [2, 0, -6], chest: [0, -4, -6], head: [4, -8, 16], hipsPos: [-0.035, -0.03, 0], upperArmL: [10, 34, 10, 0] }, { R: [-0.08, -0.04, 0, 0, -20] }),
        k(3.4, { hips: [-2, -4, 0], spine: [-4, 0, 0], chest: [-6, 0, 0], head: [-10, 4, 0], hipsPos: [0, -0.02, -0.03], upperArmR: [14, 30, 10, 0] }),
        k(4.8, { hips: [2, 0, -5], spine: [4, 0, 6], chest: [2, 4, 4], head: [8, 6, -14], hipsPos: [0.03, -0.03, 0] }, { L: [0.04, 0.03, 0, 0, 14], R: [-0.05, -0.02, 0, 0, -16] }),
      ],
    },
  };
}

/** In-air poses: rising (tucked) and falling (legs reaching, arms out). Static two-frame loops. */
export function airDefs(): { jump: ClipDef; fall: ClipDef } {
  const jump: PoseSpec = {
    ...REST,
    hipsPos: [0, 0, 0],
    spine: [8, 0, 0],
    chest: [2, 0, 0],
    thighL: [64, 4, 6],
    shinL: [96],
    footL: [-20, 0],
    thighR: [22, 4, -6],
    shinR: [70],
    footR: [-30, 0],
    upperArmL: [40, 34, 10, 0],
    upperArmR: [60, 30, 10, 0],
    forearmL: [50, 20],
    forearmR: [40, 20],
  };
  const fall: PoseSpec = {
    ...REST,
    hipsPos: [0, 0, 0],
    spine: [-2, 0, 0],
    chest: [-4, 0, 0],
    head: [4, 0, 0],
    thighL: [30, 8, 6],
    shinL: [40],
    footL: [6, 0],
    thighR: [8, 8, -6],
    shinR: [24],
    footR: [0, 0],
    upperArmL: [60, 56, 20, 0],
    upperArmR: [56, 58, 20, 0],
    forearmL: [30, 30],
    forearmR: [30, 30],
    fingersL: 10,
    fingersR: 10,
  };
  return {
    jump: { name: 'air:jump', duration: 1, loop: true, base: jump, keys: [k(0, jump), k(0.5, { thighL: [70, 4, 6], shinL: [104] }), k(1, jump)] },
    fall: { name: 'air:fall', duration: 1.2, loop: true, base: fall, keys: [k(0, fall), k(0.6, { upperArmL: [66, 60, 20, 0], upperArmR: [62, 62, 20, 0], thighL: [36, 8, 6] }), k(1.2, fall)] },
  };
}
