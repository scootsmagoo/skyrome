/**
 * One-shot action clips (the ActionClip list in Actor.ts), authored as key poses.
 *
 * Attacks follow the classic weight curve: anticipation (wind-up, hips coil away), the hips lead
 * the strike, the arm whips through the impact (~40–50 % of the clip, where `hit` fires), then a
 * follow-through and a settle back into the stance. Feet are IK-planted; steps lift and plant.
 */
import type { Stance } from '../../Actor';
import type { ClipDef, FootKey, Key } from './clip';
import { mirrorPose, type PoseSpec } from './pose';
import {
  ARM_L_SHIELD,
  BLOCK,
  FEET_READY,
  FEET_REST,
  REST,
  hasShield,
  stancePose,
  weaponClass,
  type Feet,
  type WeaponClass,
} from './poses';

export type ActionMask = 'upper' | 'full' | 'auto';

export interface ActionDef {
  def: ClipDef;
  /** upper: arms/torso only; full: whole body; auto: full when standing, upper while moving. */
  mask: ActionMask;
  busy: boolean;
  /** Impact time (s) — PlayOptions.onHit fires here. */
  hit?: number;
  /** Weapon changes hands here (draw/sheath). */
  grab?: number;
  /** Hold the last frame until something else plays (death, yield, bow draw). */
  hold?: boolean;
  /** Wind-up apex for setCharge(): the attack can be held here and resumed. */
  windup?: number;
  fadeIn?: number;
  fadeOut?: number;
  /** Temporary prop in the right hand. */
  prop?: 'cup';
  /** Everyday gesture: a drawn shield stays on the left arm instead of following the clip. */
  keepShield?: boolean;
  /** Drop carried items at this time (death: everything; yield: the shield). */
  drop?: { t: number; what: 'all' | 'shield' };
}

const k = (t: number, pose: PoseSpec, feet?: Partial<Feet>, hold?: boolean): Key => ({ t, pose, feet: feet as Key['feet'], hold });

/** Merge the shield arm into every key (the shield stays up while the sword works). */
function withShield(keys: Key[], shieldArm: PoseSpec = ARM_L_SHIELD): Key[] {
  return keys.map((key) => ({ ...key, pose: { ...key.pose, ...shieldArm } }));
}

const lerpFoot = (a: FootKey, b: FootKey, t: number): number[] => a.map((v, i) => v + ((b[i] ?? 0) - v) * t);

// ------------------------------------------------------------------ blade

function bladeAttacks(stance: Stance): Record<string, ActionDef> {
  const shield = hasShield(stance);
  const sp = stancePose(stance, true);
  const base = sp.pose;
  const F = sp.feet;
  const step = (dz: number, lift = 0, pitch = 0): FootKey => [F.L[0], F.L[1] + dz, lift, pitch, F.L[4]];
  const rearUp = (pitch: number): FootKey => [F.R[0], F.R[1], 0, pitch, F.R[4]];
  const S = (keys: Key[]) => (shield ? withShield(keys) : keys);

  const light1: ClipDef = {
    name: 'attackLight1',
    duration: 0.82,
    base,
    keys: S([
      k(0, {}, F),
      k(0.15, {
        hips: [5, -34, 0], spine: [4, -10, 0], chest: [2, -15, 0], neck: [0, 18, 0], head: [-4, 30, 0],
        hipsPos: [0, -0.06, -0.025],
        shoulderR: [8, -6], upperArmR: [96, 30, 66, 25], forearmR: [86, 60], handR: [12, -12, 0],
        ...(shield ? {} : { upperArmL: [52, 10, 30, 0], forearmL: [55, 40] }),
      }, {}, true),
      k(0.27, {
        hips: [6, -8, 0], spine: [6, 0, 0], chest: [6, 3, 0], neck: [0, 6, 0], head: [-4, 2, 0],
        hipsPos: [0, -0.075, 0.03],
        shoulderR: [4, 6], upperArmR: [92, 16, 30, 15], forearmR: [42, -40], handR: [0, -20, 0],
      }),
      k(0.34, {
        hips: [8, 12, 0], spine: [8, 8, 0], chest: [8, 12, 0], neck: [0, -10, 0], head: [-4, -12, 0],
        hipsPos: [0, -0.085, 0.06],
        shoulderR: [2, 12], upperArmR: [88, 8, -16, 5], forearmR: [16, -85], handR: [0, -25, 0],
        ...(shield ? {} : { upperArmL: [20, 22, 10, 0], forearmL: [60, 30] }),
      }),
      k(0.47, {
        hips: [8, 24, 0], spine: [8, 12, 0], chest: [6, 18, 0], neck: [0, -18, 0], head: [-2, -24, 0],
        hipsPos: [0, -0.08, 0.05],
        shoulderR: [0, 14], upperArmR: [72, 4, -62, -10], forearmR: [30, -85], handR: [5, -10, 0],
      }, {}, true),
      k(0.82, {}),
    ]),
  };

  const light2: ClipDef = {
    name: 'attackLight2',
    duration: 0.8,
    base,
    keys: S([
      k(0, {}, F),
      k(0.15, {
        hips: [5, 18, 0], spine: [5, 10, 0], chest: [4, 20, 0], neck: [0, -14, 0], head: [-4, -18, 0],
        hipsPos: [0, -0.06, 0],
        shoulderR: [6, 14], upperArmR: [86, 6, -70, -25], forearmR: [112, 40], handR: [12, -10, 0],
      }, {}, true),
      k(0.27, {
        hips: [6, 0, 0], spine: [6, 0, 0], chest: [6, -2, 0], neck: [0, 0, 0], head: [-4, 0, 0],
        hipsPos: [0, -0.07, 0.02],
        shoulderR: [4, 6], upperArmR: [90, 12, -12, -10], forearmR: [56, 80], handR: [0, -20, 0],
      }),
      k(0.34, {
        hips: [7, -22, 0], spine: [7, -8, 0], chest: [7, -12, 0], neck: [0, 14, 0], head: [-4, 16, 0],
        hipsPos: [0, -0.08, 0.04],
        shoulderR: [2, -4], upperArmR: [86, 18, 32, 0], forearmR: [20, 100], handR: [0, -25, 0],
      }),
      k(0.47, {
        hips: [6, -34, 0], spine: [6, -12, 0], chest: [6, -16, 0], neck: [0, 22, 0], head: [-4, 26, 0],
        hipsPos: [0, -0.075, 0.03],
        shoulderR: [0, -8], upperArmR: [78, 24, 70, 10], forearmR: [26, 100], handR: [0, -26, 0],
      }, {}, true),
      k(0.8, pick(base), F),
    ]),
  };

  const light3: ClipDef = {
    name: 'attackLight3',
    duration: 0.86,
    base,
    keys: S([
      k(0, {}, F),
      k(0.16, {
        hips: [4, -30, 0], spine: [3, -8, 0], chest: [2, -10, 0], neck: [0, 16, 0], head: [-4, 22, 0],
        hipsPos: [0, -0.065, -0.05],
        shoulderR: [0, -10], upperArmR: [8, 24, 16, 15], forearmR: [114, 0], handR: [-10, -30, 0],
        ...(shield ? {} : { upperArmL: [58, 10, 14, 0], forearmL: [58, 40] }),
      }, { L: step(0), R: rearUp(0) }, true),
      k(0.25, {}, { L: step(0.1, 0.05, 6) }),
      k(0.34, {
        hips: [10, -6, 0], spine: [10, 4, 0], chest: [10, 6, 0], neck: [0, 0, 0], head: [-8, 0, 0],
        hipsPos: [0, -0.115, 0.15],
        shoulderR: [6, 18], upperArmR: [86, 6, -4, 0], forearmR: [6, 0], handR: [-4, -28, 0],
        ...(shield ? {} : { upperArmL: [-12, 20, 0, 0], forearmL: [40, 0] }),
      }, { L: step(0.2, 0, 4), R: rearUp(-16) }),
      k(0.46, { hipsPos: [0, -0.11, 0.14] }, {}, true),
      k(0.62, { hipsPos: [0, -0.08, 0.06], upperArmR: [50, 14, -4, 6], forearmR: [60, 0] }, { L: step(0.1, 0.04, 0), R: rearUp(0) }),
      k(0.86, pick(base), F),
    ]),
  };

  const power: ClipDef = {
    name: 'attackPower',
    duration: 1.16,
    base,
    keys: S([
      k(0, {}, F),
      k(0.38, {
        hips: [-3, -20, 0], spine: [-6, -8, 0], chest: [-8, -8, 0], neck: [-4, 10, 0], head: [-6, 10, 0],
        hipsPos: [0, -0.055, -0.05],
        shoulderR: [14, -8], upperArmR: [166, 26, 12, 25], forearmR: [116, 10], handR: [22, 0, 0],
        ...(shield ? {} : { upperArmL: [72, 10, 16, 0], forearmL: [30, 30], fingersL: 10 }),
      }, F, true),
      k(0.47, {}, { L: step(0.1, 0.06, 6) }),
      k(0.56, {
        hips: [12, 0, 0], spine: [16, 4, 0], chest: [14, 6, 0], neck: [-6, 0, 0], head: [-10, 0, 0],
        hipsPos: [0, -0.15, 0.13],
        shoulderR: [0, 12], upperArmR: [80, 8, -8, 0], forearmR: [8, 0], handR: [-15, 0, 0],
        ...(shield ? {} : { upperArmL: [10, 25, 0, 0], forearmL: [40, 0] }),
      }, { L: step(0.24, 0, 0), R: rearUp(-20) }),
      k(0.7, {
        hips: [14, 0, 0], spine: [22, 4, 0], chest: [16, 4, 0],
        upperArmR: [30, 10, -15, 0], forearmR: [12, 0],
      }, {}, true),
      k(0.92, { hipsPos: [0, -0.09, 0.06] }, { L: step(0.12, 0.04, 0), R: rearUp(0) }),
      k(1.16, pick(base), F),
    ]),
  };

  // Directional power variants (GDD: forward = lunge, sideways = sweep, back = step-back cut).
  const lunge: ClipDef = {
    name: 'attackPower:lunge',
    duration: 1.1,
    base,
    keys: S([
      k(0, {}, F),
      k(0.34, {
        hips: [4, -34, 0], spine: [2, -10, 0], chest: [0, -12, 0], neck: [0, 18, 0], head: [-4, 26, 0],
        hipsPos: [0, -0.09, -0.08],
        upperArmR: [4, 26, 20, 18], forearmR: [118, 0], handR: [-10, -30, 0],
        ...(shield ? {} : { upperArmL: [70, 6, 10, 0], forearmL: [40, 40] }),
      }, { L: step(0, 0, 0), R: rearUp(0) }, true),
      k(0.44, {}, { L: step(0.2, 0.07, 8) }),
      k(0.54, {
        hips: [14, -4, 0], spine: [14, 4, 0], chest: [12, 6, 0], neck: [-4, 0, 0], head: [-10, 0, 0],
        hipsPos: [0, -0.2, 0.32],
        shoulderR: [8, 22], upperArmR: [88, 4, -4, 0], forearmR: [2, 0], handR: [-4, -30, 0],
        ...(shield ? {} : { upperArmL: [-20, 25, 0, 0], forearmL: [30, 0] }),
      }, { L: step(0.45, 0, 2), R: rearUp(-30) }),
      k(0.66, {}, {}, true),
      k(0.86, { hipsPos: [0, -0.1, 0.12] }, { L: step(0.2, 0.05, 0), R: rearUp(0) }),
      k(1.1, pick(base), F),
    ]),
  };

  const sweep: ClipDef = {
    name: 'attackPower:sweep',
    duration: 1.2,
    base,
    keys: S([
      k(0, {}, F),
      k(0.36, {
        hips: [6, -48, 0], spine: [6, -16, 0], chest: [4, -20, 0], neck: [0, 24, 0], head: [-4, 34, 0],
        hipsPos: [0, -0.1, -0.03],
        shoulderR: [8, -12], upperArmR: [84, 34, 84, 30], forearmR: [70, 30], handR: [10, -20, 0],
      }, F, true),
      k(0.5, {
        hips: [8, -10, 0], spine: [8, 0, 0], chest: [8, 0, 0], neck: [0, 4, 0], head: [-4, 4, 0],
        hipsPos: [0, -0.12, 0.03],
        upperArmR: [86, 14, 34, 10], forearmR: [20, 15], handR: [0, -10, 0],
      }),
      k(0.58, {
        hips: [8, 22, 0], spine: [8, 14, 0], chest: [8, 18, 0], neck: [0, -16, 0], head: [-4, -20, 0],
        hipsPos: [0, -0.12, 0.04],
        shoulderR: [0, 16], upperArmR: [84, 6, -40, 0], forearmR: [10, -85], handR: [0, -20, 0],
      }, { R: [F.R[0], F.R[1], 0, -14, -6] }),
      k(0.72, {
        hips: [8, 40, 0], spine: [8, 18, 0], chest: [6, 22, 0], neck: [0, -24, 0], head: [-2, -30, 0],
        upperArmR: [70, 4, -80, -15], forearmR: [30, -85], handR: [5, -10, 0],
      }, { R: [F.R[0], F.R[1], 0, -18, 12] }, true),
      k(1.2, pick(base), F),
    ]),
  };

  const backCut: ClipDef = {
    name: 'attackPower:back',
    duration: 1.15,
    base,
    keys: S([
      k(0, {}, F),
      k(0.28, {
        hips: [10, -10, 0], spine: [10, -4, 0], chest: [8, -4, 0],
        hipsPos: [0, -0.12, -0.02],
        upperArmR: [-10, 30, 30, 40], forearmR: [40, 30], handR: [10, 0, 0],
      }, { L: step(0, 0.06, 0) }, true),
      k(0.42, { hipsPos: [0, -0.1, -0.16] }, { L: [F.L[0], F.L[1] - 0.24, 0, 0, F.L[4]], R: [F.R[0], F.R[1] - 0.12, 0, 0, F.R[4]] }),
      k(0.55, {
        hips: [-2, 8, 0], spine: [-4, 6, 0], chest: [-6, 10, 0], neck: [4, -6, 0], head: [0, -8, 0],
        hipsPos: [0, -0.06, -0.14],
        shoulderR: [10, 10], upperArmR: [150, 10, -30, 0], forearmR: [20, 0], handR: [0, 10, 0],
      }),
      k(0.7, {}, {}, true),
      k(1.15, pick(base), { L: [F.L[0], F.L[1] - 0.24, 0, 0, F.L[4]], R: [F.R[0], F.R[1] - 0.12, 0, 0, F.R[4]] }),
    ]),
  };

  const bash: ClipDef = shield
    ? {
        name: 'bash',
        duration: 0.72,
        base,
        keys: [
          k(0, {}, F),
          k(0.13, { hips: [6, -32, 0], chest: [4, 6, 0], hipsPos: [0, -0.08, -0.05], upperArmL: [8, 12, 6, 0], forearmL: [104, -90] }, F, true),
          k(0.2, {}, { L: step(0.08, 0.05, 4) }),
          k(0.27, { hips: [10, -6, 0], spine: [10, 6, 0], chest: [10, 10, 0], hipsPos: [0, -0.1, 0.12], upperArmL: [48, 12, 6, 0], forearmL: [46, -90], shoulderL: [6, 18] }, { L: step(0.2, 0, 0), R: rearUp(-14) }),
          k(0.38, {}, {}, true),
          k(0.72, pick(base), F),
        ],
      }
    : {
        name: 'bash',
        duration: 0.7,
        base,
        keys: [
          k(0, {}, F),
          k(0.14, { hips: [6, -28, 0], hipsPos: [0, -0.07, -0.04], upperArmL: [30, 20, 10, 0], forearmL: [110, 0], fingersL: 90, upperArmR: [40, 22, 0, 0], forearmR: [100, 0] }, F, true),
          k(0.27, { hips: [10, 0, 0], spine: [10, 6, 0], chest: [10, 8, 0], hipsPos: [0, -0.09, 0.1], upperArmL: [80, 10, -10, 0], forearmL: [10, 0], fingersL: 5, shoulderL: [4, 18] }, { L: step(0.16, 0, 0), R: rearUp(-12) }),
          k(0.38, {}, {}, true),
          k(0.7, pick(base), F),
        ],
      };

  if (shield) {
    // Shield fighters keep the scutum square to the enemy: a cut around its right edge, an overhand
    // stab over the rim, and an underhand thrust past the edge. Little torso twist.
    const SA = (keys: Key[], push = 0) =>
      keys.map((key) => ({ ...key, pose: { ...key.pose, ...ARM_L_SHIELD, ...(push && key.t > 0.2 && key.t < 0.5 ? { upperArmL: [24, 12, 4, 0], forearmL: [74, -90] } : {}) } }));
    light1.keys = SA([
      k(0, {}, F),
      k(0.16, {
        hips: [6, -30, 0], spine: [6, 4, 0], chest: [5, 6, 0], neck: [1, 8, 0], head: [-6, 10, 0], hipsPos: [0, -0.075, -0.02],
        shoulderR: [8, -8], upperArmR: [70, 34, 52, 20], forearmR: [80, 50], handR: [10, -20, 0],
      }, F, true),
      k(0.3, {
        hips: [8, -12, 0], spine: [8, 8, 0], chest: [8, 12, 0], neck: [1, -2, 0], head: [-6, -2, 0], hipsPos: [0, -0.09, 0.05],
        shoulderR: [4, 14], upperArmR: [84, 12, -14, 5], forearmR: [20, -85], handR: [0, -25, 0],
      }, { L: step(0.06), R: rearUp(-10) }),
      k(0.42, {
        hips: [8, -6, 0], spine: [8, 10, 0], chest: [8, 14, 0], hipsPos: [0, -0.09, 0.05],
        shoulderR: [2, 14], upperArmR: [76, 8, -42, -5], forearmR: [28, -88], handR: [0, -15, 0],
      }, {}, true),
      k(0.8, pick(base), F),
    ], 1);
    light2.keys = SA([
      k(0, {}, F),
      k(0.18, {
        hips: [4, -14, 0], spine: [4, 8, 0], chest: [4, 14, 0], neck: [-2, -6, 0], head: [-6, -6, 0], hipsPos: [0, -0.07, -0.02],
        shoulderR: [10, 16], upperArmR: [96, 8, -64, -20], forearmR: [110, 40], handR: [10, -10, 0],
      }, F, true),
      k(0.3, {
        hips: [8, -26, 0], spine: [8, 0, 0], chest: [8, 0, 0], neck: [-2, 6, 0], head: [-6, 8, 0], hipsPos: [0, -0.09, 0.05],
        shoulderR: [8, 10], upperArmR: [100, 14, -4, -10], forearmR: [30, 95], handR: [0, -25, 0],
      }, { L: step(0.06), R: rearUp(-12) }),
      k(0.42, { upperArmR: [94, 20, 34, 0], forearmR: [24, 100], hips: [8, -32, 0] }, {}, true),
      k(0.8, pick(base), F),
    ], 1);
    light3.keys = SA([
      k(0, {}, F),
      k(0.16, {
        hips: [5, -32, 0], spine: [4, 2, 0], chest: [3, 4, 0], hipsPos: [0, -0.075, -0.05],
        shoulderR: [0, -10], upperArmR: [-6, 26, 14, 15], forearmR: [104, 0], handR: [-12, -30, 0],
      }, { L: step(0), R: rearUp(0) }, true),
      k(0.25, {}, { L: step(0.1, 0.05, 6) }),
      k(0.34, {
        hips: [10, -14, 0], spine: [10, 6, 0], chest: [10, 10, 0], hipsPos: [0, -0.12, 0.15],
        shoulderR: [6, 18], upperArmR: [74, 10, -6, 0], forearmR: [8, 0], handR: [-4, -30, 0],
      }, { L: step(0.2, 0, 4), R: rearUp(-16) }),
      k(0.46, {}, {}, true),
      k(0.62, { hipsPos: [0, -0.09, 0.06], upperArmR: [40, 18, -4, 6], forearmR: [70, 0] }, { L: step(0.1, 0.04, 0), R: rearUp(0) }),
      k(0.86, pick(base), F),
    ], 1);
    power.keys = SA([
      k(0, {}, F),
      k(0.38, {
        hips: [0, -26, 0], spine: [-4, 4, 0], chest: [-6, 6, 0], neck: [-4, 6, 0], head: [-6, 6, 0], hipsPos: [0, -0.06, -0.05],
        shoulderR: [16, -8], upperArmR: [160, 26, 14, 25], forearmR: [116, 10], handR: [22, 0, 0],
      }, F, true),
      k(0.47, {}, { L: step(0.1, 0.06, 6) }),
      k(0.56, {
        hips: [12, -8, 0], spine: [14, 8, 0], chest: [12, 10, 0], neck: [-6, 0, 0], head: [-10, 0, 0], hipsPos: [0, -0.15, 0.13],
        shoulderR: [2, 14], upperArmR: [82, 8, -10, 0], forearmR: [8, 0], handR: [-10, 0, 0],
      }, { L: step(0.24, 0, 0), R: rearUp(-20) }),
      k(0.7, { spine: [18, 8, 0], upperArmR: [40, 10, -15, 0], forearmR: [12, 0] }, {}, true),
      k(0.92, { hipsPos: [0, -0.1, 0.06] }, { L: step(0.12, 0.04, 0), R: rearUp(0) }),
      k(1.16, pick(base), F),
    ], 1);
  }

  return {
    attackLight1: { def: light1, mask: 'auto', busy: true, hit: shield ? 0.31 : 0.33, fadeIn: 0.08 },
    attackLight2: { def: light2, mask: 'auto', busy: true, hit: shield ? 0.3 : 0.33, fadeIn: 0.08 },
    attackLight3: { def: light3, mask: 'auto', busy: true, hit: 0.34, fadeIn: 0.08 },
    attackPower: { def: power, mask: 'auto', busy: true, hit: 0.56, windup: 0.38, fadeIn: 0.1 },
    'attackPower:lunge': { def: lunge, mask: 'full', busy: true, hit: 0.53, windup: 0.34, fadeIn: 0.1 },
    'attackPower:sweep': { def: sweep, mask: 'auto', busy: true, hit: 0.56, windup: 0.36, fadeIn: 0.1 },
    'attackPower:back': { def: backCut, mask: 'full', busy: true, hit: 0.55, windup: 0.28, fadeIn: 0.1 },
    bash: { def: bash, mask: 'auto', busy: true, hit: 0.27, fadeIn: 0.06 },
  };
}

/** Keep only the channels a key needs to return to (all of base). */
function pick(p: PoseSpec): PoseSpec {
  return { ...p };
}

// ------------------------------------------------------------------ spear

function spearAttacks(stance: Stance): Record<string, ActionDef> {
  const shield = hasShield(stance);
  const sp = stancePose(stance, true);
  const base = sp.pose;
  const F = sp.feet;
  const step = (dz: number, lift = 0, pitch = 0): FootKey => [F.L[0], F.L[1] + dz, lift, pitch, F.L[4]];
  const rearUp = (pitch: number): FootKey => [F.R[0], F.R[1], 0, pitch, F.R[4]];
  const S = (keys: Key[]) => (shield ? withShield(keys) : keys);
  const jab = (name: string, high: boolean, stepDz: number, dur: number): ClipDef => ({
    name,
    duration: dur,
    base,
    keys: S([
      k(0, {}, F),
      k(dur * 0.2, {
        hips: [4, -34, 0], chest: [2, 4, 0], hipsPos: [0, -0.06, -0.05],
        upperArmR: [-14, 26, 12, 16], forearmR: [76, 0], handR: [0, -32, 0],
      }, { L: step(0), R: rearUp(0) }, true),
      ...(stepDz > 0 ? [k(dur * 0.3, {}, { L: step(stepDz * 0.5, 0.05, 6) })] : []),
      k(dur * 0.4, {
        hips: [8, -14, 0], spine: [8, 4, 0], chest: [8, 8, 0], hipsPos: [0, -0.09, 0.08 + stepDz * 0.5],
        shoulderR: [4, 18], upperArmR: high ? [96, 10, -8, 0] : [62, 10, -6, 0], forearmR: [12, 0], handR: high ? [0, -40, 0] : [0, -30, 0],
      }, stepDz > 0 ? { L: step(stepDz), R: rearUp(-14) } : {}),
      k(dur * 0.54, {}, {}, true),
      k(dur, pick(base), F),
    ]),
  });
  const power: ClipDef = {
    name: 'attackPower',
    duration: 1.2,
    base,
    keys: S([
      k(0, {}, F),
      k(0.4, {
        hips: [2, -40, 0], spine: [0, -8, 0], chest: [-2, -8, 0], neck: [0, 20, 0], head: [-4, 26, 0],
        hipsPos: [0, -0.08, -0.1],
        upperArmR: [-24, 30, 16, 16], forearmR: [80, 0], handR: [0, -32, 0],
      }, { L: step(0), R: rearUp(0) }, true),
      k(0.5, {}, { L: step(0.22, 0.07, 8) }),
      k(0.6, {
        hips: [14, -10, 0], spine: [14, 4, 0], chest: [12, 8, 0], neck: [-4, 0, 0], head: [-10, 0, 0],
        hipsPos: [0, -0.19, 0.3],
        shoulderR: [8, 22], upperArmR: [72, 8, -6, 0], forearmR: [4, 0], handR: [0, -30, 0],
      }, { L: step(0.44, 0, 2), R: rearUp(-28) }),
      k(0.72, {}, {}, true),
      k(0.95, { hipsPos: [0, -0.1, 0.1] }, { L: step(0.2, 0.05, 0), R: rearUp(0) }),
      k(1.2, pick(base), F),
    ]),
  };
  const blade = bladeAttacks(stance === 'spearShield' ? 'oneHandShield' : 'oneHand');
  return {
    attackLight1: { def: jab('attackLight1', false, 0, 0.7), mask: 'auto', busy: true, hit: 0.28, fadeIn: 0.08 },
    attackLight2: { def: jab('attackLight2', true, 0, 0.72), mask: 'auto', busy: true, hit: 0.29, fadeIn: 0.08 },
    attackLight3: { def: jab('attackLight3', false, 0.18, 0.86), mask: 'auto', busy: true, hit: 0.35, fadeIn: 0.08 },
    attackPower: { def: power, mask: 'auto', busy: true, hit: 0.6, windup: 0.4, fadeIn: 0.1 },
    'attackPower:lunge': { def: { ...power, name: 'attackPower:lunge' }, mask: 'full', busy: true, hit: 0.6, windup: 0.4 },
    'attackPower:sweep': { def: { ...blade['attackPower:sweep'].def, base }, mask: 'auto', busy: true, hit: 0.56, windup: 0.36 },
    'attackPower:back': { def: { ...blade['attackPower:back'].def, base }, mask: 'full', busy: true, hit: 0.55, windup: 0.28 },
    bash: { ...blade.bash, def: { ...blade.bash.def, base } },
  };
}

// ------------------------------------------------------------------ two-handed

function twoHandAttacks(): Record<string, ActionDef> {
  const sp = stancePose('twoHand', true);
  const base = sp.pose;
  const F = sp.feet;
  const step = (dz: number, lift = 0, pitch = 0): FootKey => [F.L[0], F.L[1] + dz, lift, pitch, F.L[4]];
  const rearUp = (pitch: number): FootKey => [F.R[0], F.R[1], 0, pitch, F.R[4]];
  const chop = (name: string, dur: number, wind: PoseSpec, strike: PoseSpec, follow: PoseSpec, hitFrac: number): ClipDef => ({
    name,
    duration: dur,
    base,
    keys: [k(0, {}, F), k(dur * 0.32, wind, F, true), k(dur * hitFrac, strike, { L: step(0.06), R: rearUp(-10) }), k(dur * 0.62, follow, {}, true), k(dur, pick(base), F)],
  });
  const light1 = chop(
    'attackLight1',
    0.95,
    { hips: [0, -36, 0], spine: [-2, -10, 0], chest: [-4, -10, 0], neck: [0, 20, 0], head: [-4, 26, 0], hipsPos: [0, -0.05, -0.04], shoulderR: [16, -6], upperArmR: [150, 30, 30, 20], forearmR: [90, 0], handR: [10, 20, 0] },
    { hips: [10, 6, 0], spine: [12, 6, 0], chest: [12, 8, 0], neck: [-4, -6, 0], head: [-8, -6, 0], hipsPos: [0, -0.11, 0.08], shoulderR: [2, 12], upperArmR: [70, 10, -30, 0], forearmR: [10, 0], handR: [-10, 0, 0] },
    { hips: [12, 20, 0], spine: [16, 10, 0], chest: [14, 12, 0], upperArmR: [30, 6, -40, 0], forearmR: [16, 0] },
    0.45,
  );
  const light2 = chop(
    'attackLight2',
    0.95,
    { hips: [8, 22, 0], spine: [8, 10, 0], chest: [6, 14, 0], hipsPos: [0, -0.09, 0], upperArmR: [24, 6, -50, -20], forearmR: [60, -20], handR: [0, 20, 0] },
    { hips: [4, -10, 0], spine: [2, -6, 0], chest: [0, -8, 0], hipsPos: [0, -0.07, 0.06], upperArmR: [110, 20, 20, 0], forearmR: [20, 0], handR: [0, -10, 0] },
    { hips: [0, -28, 0], spine: [-2, -10, 0], chest: [-4, -10, 0], upperArmR: [150, 24, 40, 10], forearmR: [40, 0] },
    0.45,
  );
  const light3 = chop(
    'attackLight3',
    1.0,
    { hips: [4, -44, 0], spine: [4, -14, 0], chest: [2, -18, 0], neck: [0, 22, 0], head: [-4, 30, 0], hipsPos: [0, -0.08, -0.03], upperArmR: [86, 34, 76, 20], forearmR: [60, 20], handR: [10, -20, 0] },
    { hips: [8, 10, 0], spine: [8, 8, 0], chest: [8, 12, 0], neck: [0, -8, 0], head: [-4, -10, 0], hipsPos: [0, -0.1, 0.05], upperArmR: [86, 8, -20, 0], forearmR: [10, 0], handR: [0, 0, 0] },
    { hips: [8, 34, 0], spine: [8, 16, 0], chest: [6, 22, 0], upperArmR: [70, 4, -70, -10], forearmR: [24, 0], handR: [0, 24, 0] },
    0.46,
  );
  const power: ClipDef = {
    name: 'attackPower',
    duration: 1.3,
    base,
    keys: [
      k(0, {}, F),
      k(0.44, { hips: [-4, -18, 0], spine: [-8, -6, 0], chest: [-10, -6, 0], neck: [-4, 10, 0], head: [-6, 10, 0], hipsPos: [0, -0.04, -0.06], shoulderR: [16, -4], shoulderL: [16, -4], upperArmR: [172, 20, 10, 20], forearmR: [100, 0], handR: [20, 20, 0] }, F, true),
      k(0.54, {}, { L: step(0.12, 0.06, 6) }),
      k(0.64, { hips: [16, 0, 0], spine: [20, 4, 0], chest: [16, 6, 0], neck: [-8, 0, 0], head: [-10, 0, 0], hipsPos: [0, -0.18, 0.14], shoulderR: [0, 10], shoulderL: [0, 10], upperArmR: [70, 10, -14, 0], forearmR: [6, 0], handR: [-20, 0, 0] }, { L: step(0.26), R: rearUp(-20) }),
      k(0.8, { spine: [26, 4, 0], upperArmR: [36, 10, -14, 0] }, {}, true),
      k(1.04, { hipsPos: [0, -0.1, 0.06] }, { L: step(0.12, 0.05, 0), R: rearUp(0) }),
      k(1.3, pick(base), F),
    ],
  };
  const blade = bladeAttacks('oneHand');
  return {
    attackLight1: { def: light1, mask: 'auto', busy: true, hit: 0.43, fadeIn: 0.1 },
    attackLight2: { def: light2, mask: 'auto', busy: true, hit: 0.43, fadeIn: 0.1 },
    attackLight3: { def: light3, mask: 'auto', busy: true, hit: 0.46, fadeIn: 0.1 },
    attackPower: { def: power, mask: 'auto', busy: true, hit: 0.64, windup: 0.44, fadeIn: 0.1 },
    'attackPower:lunge': { def: { ...power, name: 'attackPower:lunge' }, mask: 'full', busy: true, hit: 0.64, windup: 0.44 },
    'attackPower:sweep': { def: { ...blade['attackPower:sweep'].def, base }, mask: 'auto', busy: true, hit: 0.56, windup: 0.36 },
    'attackPower:back': { def: { ...blade['attackPower:back'].def, base }, mask: 'full', busy: true, hit: 0.55, windup: 0.28 },
    bash: { def: { ...blade.bash.def, base }, mask: 'auto', busy: true, hit: 0.27 },
  };
}

// ------------------------------------------------------------------ unarmed

function unarmedAttacks(): Record<string, ActionDef> {
  const sp = stancePose('unarmed', true);
  const base = sp.pose;
  const F = sp.feet;
  const step = (dz: number, lift = 0, pitch = 0): FootKey => [F.L[0], F.L[1] + dz, lift, pitch, F.L[4]];
  const rearUp = (pitch: number): FootKey => [F.R[0], F.R[1], 0, pitch, F.R[4]];
  const jab: ClipDef = {
    name: 'attackLight1',
    duration: 0.5,
    base,
    keys: [
      k(0, {}, F),
      k(0.08, { hips: [4, -20, 0], upperArmL: [40, 18, -10, 10], forearmL: [130, 30] }, F, true),
      k(0.18, { hips: [6, -8, 0], chest: [8, 14, 0], hipsPos: [0, -0.06, 0.05], shoulderL: [4, 16], upperArmL: [88, 6, -6, -20], forearmL: [6, -60], handL: [0, 0, 0] }, { L: step(0.05) }),
      k(0.26, {}, {}, true),
      k(0.5, pick(base), F),
    ],
  };
  const cross: ClipDef = {
    name: 'attackLight2',
    duration: 0.6,
    base,
    keys: [
      k(0, {}, F),
      k(0.1, { hips: [4, -26, 0], chest: [4, 2, 0] }, F, true),
      k(0.24, { hips: [8, 14, 0], spine: [8, 8, 0], chest: [8, 14, 0], hipsPos: [0, -0.07, 0.06], shoulderR: [4, 20], upperArmR: [88, 4, -12, -20], forearmR: [6, -60], handR: [0, 0, 0], upperArmL: [50, 20, -10, 10], forearmL: [130, 35] }, { L: step(0.05), R: rearUp(-20) }),
      k(0.32, {}, {}, true),
      k(0.6, pick(base), F),
    ],
  };
  const upper: ClipDef = {
    name: 'attackLight3',
    duration: 0.72,
    base,
    keys: [
      k(0, {}, F),
      k(0.16, { hips: [10, -30, 0], spine: [8, -6, 0], hipsPos: [0, -0.1, -0.01], upperArmL: [20, 20, 0, 0], forearmL: [110, 60] }, F, true),
      k(0.3, { hips: [-2, 6, 0], spine: [-4, 6, 0], chest: [-4, 10, 0], hipsPos: [0, -0.03, 0.05], upperArmL: [96, 10, -22, 0], forearmL: [86, 80], shoulderL: [10, 8] }, { L: step(0.06), R: rearUp(-14) }),
      k(0.4, {}, {}, true),
      k(0.72, pick(base), F),
    ],
  };
  const power: ClipDef = {
    name: 'attackPower',
    duration: 1.0,
    base,
    keys: [
      k(0, {}, F),
      k(0.36, { hips: [6, -42, 0], spine: [4, -12, 0], chest: [2, -14, 0], neck: [0, 22, 0], head: [-4, 30, 0], hipsPos: [0, -0.08, -0.05], shoulderR: [6, -10], upperArmR: [60, 40, 70, 0], forearmR: [90, 0] }, F, true),
      k(0.5, { hips: [10, 16, 0], spine: [10, 12, 0], chest: [10, 16, 0], neck: [0, -10, 0], head: [-6, -12, 0], hipsPos: [0, -0.11, 0.1], shoulderR: [4, 20], upperArmR: [88, 10, -30, 0], forearmR: [40, 0] }, { L: step(0.14), R: rearUp(-22) }),
      k(0.62, { upperArmR: [70, 10, -60, 0], forearmR: [60, 0], hips: [10, 28, 0] }, {}, true),
      k(1.0, pick(base), F),
    ],
  };
  const blade = bladeAttacks('oneHand');
  return {
    attackLight1: { def: jab, mask: 'auto', busy: true, hit: 0.18, fadeIn: 0.06 },
    attackLight2: { def: cross, mask: 'auto', busy: true, hit: 0.24, fadeIn: 0.06 },
    attackLight3: { def: upper, mask: 'auto', busy: true, hit: 0.3, fadeIn: 0.06 },
    attackPower: { def: power, mask: 'auto', busy: true, hit: 0.5, windup: 0.36, fadeIn: 0.1 },
    'attackPower:lunge': { def: { ...power, name: 'attackPower:lunge' }, mask: 'full', busy: true, hit: 0.5, windup: 0.36 },
    'attackPower:sweep': { def: { ...power, name: 'attackPower:sweep' }, mask: 'auto', busy: true, hit: 0.5, windup: 0.36 },
    'attackPower:back': { def: { ...blade['attackPower:back'].def, base }, mask: 'full', busy: true, hit: 0.55, windup: 0.28 },
    bash: { def: { ...blade.bash.def, base }, mask: 'auto', busy: true, hit: 0.27 },
  };
}

// ------------------------------------------------------------------ shared actions

function reactions(cls: WeaponClass, stance: Stance): Record<string, ActionDef> {
  const sp = stancePose(stance, true);
  const base = sp.pose;
  const F = sp.feet;
  const blockPose = hasShield(stance) ? BLOCK.shield : BLOCK[cls];
  const blockHit: ClipDef = {
    name: 'blockHit',
    duration: 0.4,
    base: { ...base, ...blockPose },
    keys: [
      k(0, {}),
      k(0.07, { chest: [-6, 14, 0], spine: [-2, 0, 0], neck: [-4, 0, 0], hipsPos: [0, -0.07, -0.04], upperArmL: hasShield(stance) ? [50, 14, -4, 0] : undefined, forearmL: hasShield(stance) ? [100, -90] : undefined }),
      k(0.4, {}),
    ].map((key) => ({ ...key, pose: Object.fromEntries(Object.entries(key.pose).filter(([, v]) => v !== undefined)) })),
  };
  const hitFront: ClipDef = {
    name: 'hitFront',
    duration: 0.55,
    base,
    keys: [
      k(0, {}, F),
      k(0.08, { chest: [-14, 4, 6], spine: [-8, 0, 0], neck: [-8, 0, 0], head: [-14, 8, 4], hipsPos: [0, -0.07, -0.06], shoulderL: [10, -10], shoulderR: [10, -10], upperArmL: [30, 34, 20, 0], upperArmR: [24, 34, 20, 0] }, F, true),
      k(0.2, { chest: [-6, 2, 2], head: [-6, 4, 0] }, { L: [F.L[0], F.L[1] - 0.06, 0, 0, F.L[4]] }),
      k(0.55, pick(base), F),
    ],
  };
  const hitBack: ClipDef = {
    name: 'hitBack',
    duration: 0.55,
    base,
    keys: [
      k(0, {}, F),
      k(0.08, { chest: [18, -4, -4], spine: [10, 0, 0], neck: [12, 0, 0], head: [12, -6, 0], hipsPos: [0, -0.08, 0.06], shoulderL: [10, 10], shoulderR: [10, 10], upperArmL: [-14, 30, 0, 0], upperArmR: [-14, 30, 0, 0] }, F, true),
      k(0.2, { chest: [8, 0, 0] }, { R: [F.R[0], F.R[1] + 0.08, 0, 0, F.R[4]] }),
      k(0.55, pick(base), F),
    ],
  };
  const stagger: ClipDef = {
    name: 'stagger',
    duration: 1.15,
    base,
    keys: [
      k(0, {}, F),
      k(0.1, { chest: [-16, 8, 6], spine: [-8, 4, 0], neck: [-6, 0, 0], head: [-12, 10, 6], hipsPos: [0, -0.06, -0.1], shoulderL: [14, -8], shoulderR: [14, -8], upperArmL: [50, 50, 30, 0], forearmL: [30, 0], upperArmR: [40, 50, 30, 0], forearmR: [30, 0] }, F),
      k(0.24, { hipsPos: [0.02, -0.07, -0.18] }, { R: [F.R[0], F.R[1] - 0.12, 0.08, 0, F.R[4]] }),
      k(0.38, { hipsPos: [0.02, -0.1, -0.26], chest: [-6, 4, -4] }, { R: [F.R[0], F.R[1] - 0.24, 0, 0, F.R[4]] }),
      k(0.52, { hipsPos: [-0.02, -0.09, -0.3] }, { L: [F.L[0], F.L[1] - 0.18, 0.07, 0, F.L[4]] }),
      k(0.66, { hipsPos: [0, -0.08, -0.32], chest: [2, 4, 0], head: [-4, 0, 0] }, { L: [F.L[0], F.L[1] - 0.3, 0, 0, F.L[4]] }),
      k(1.15, pick(base), { L: [F.L[0], F.L[1] - 0.3, 0, 0, F.L[4]], R: [F.R[0], F.R[1] - 0.24, 0, 0, F.R[4]] }),
    ],
  };
  return {
    blockHit: { def: blockHit, mask: 'upper', busy: true, fadeIn: 0.04, fadeOut: 0.1 },
    hitFront: { def: hitFront, mask: 'auto', busy: true, fadeIn: 0.04 },
    hitBack: { def: hitBack, mask: 'auto', busy: true, fadeIn: 0.04 },
    stagger: { def: stagger, mask: 'full', busy: true, fadeIn: 0.06 },
  };
}

/** Falls (knockdown, death): forward kinematics; the body lies along -Z behind the feet. */
function falls(): Record<string, ActionDef> {
  const lying: PoseSpec = {
    hipsPos: [0, -0.84, -0.42],
    hips: [-86, 6, 0],
    spine: [-4, 0, 0],
    chest: [-2, 0, 0],
    neck: [8, 0, 0],
    head: [6, 18, 0],
    thighL: [10, 8, 10],
    shinL: [12],
    footL: [-30, 0],
    thighR: [26, 4, -4],
    shinR: [40],
    footR: [-24, 0],
    upperArmL: [30, 40, 20, 0],
    forearmL: [30, 40],
    upperArmR: [80, 30, 40, 0],
    forearmR: [70, 60],
    fingersL: 30,
    fingersR: 40,
  };
  const kneelFall: PoseSpec = {
    hipsPos: [0, -0.5, -0.05],
    hips: [8, 0, 4],
    spine: [14, 0, 0],
    chest: [10, 0, 0],
    neck: [14, 0, 0],
    head: [10, 0, 0],
    thighL: [10, 4, 0],
    shinL: [118],
    footL: [-40, 0],
    thighR: [6, 6, 0],
    shinR: [112],
    footR: [-40, 0],
    upperArmL: [10, 16, 0, 0],
    forearmL: [20, 0],
    upperArmR: [16, 20, 0, 0],
    forearmR: [20, 0],
  };
  const faceDown: PoseSpec = {
    hipsPos: [0, -0.83, 0.32],
    hips: [92, -4, 0],
    spine: [2, 0, 0],
    chest: [0, 0, 0],
    neck: [-20, 0, 0],
    head: [-14, -40, 0],
    thighL: [-6, 6, 0],
    shinL: [14],
    footL: [-40, 0],
    thighR: [-2, 2, 0],
    shinR: [30],
    footR: [-40, 0],
    upperArmL: [120, 30, 30, 0],
    forearmL: [40, 0],
    upperArmR: [20, 30, -10, 60],
    forearmR: [20, 0],
  };
  const backFall = (name: string, getUp: boolean): ClipDef => {
    const keys: Key[] = [
      k(0, {}),
      k(0.18, { hipsPos: [0, -0.12, -0.1], hips: [-12, 4, 0], spine: [-10, 0, 0], chest: [-8, 0, 0], neck: [-6, 0, 0], head: [-10, 8, 0], thighL: [20, 6, 0], shinL: [30], thighR: [8, 6, 0], shinR: [20], upperArmL: [60, 40, 30, 0], upperArmR: [60, 40, 30, 0], forearmL: [20, 0], forearmR: [20, 0] }),
      k(0.42, { hipsPos: [0, -0.5, -0.32], hips: [-50, 6, 0], spine: [-8, 0, 0], neck: [14, 0, 0], head: [10, 10, 0], thighL: [50, 8, 6], shinL: [60], thighR: [40, 6, 0], shinR: [70], upperArmL: [70, 50, 40, 0], upperArmR: [80, 46, 40, 0] }),
      k(0.62, { ...lying, hipsPos: [0, -0.82, -0.42], neck: [20, 0, 0] }),
      k(0.8, lying, undefined, true),
    ];
    if (getUp) {
      keys.push(
        k(1.5, lying),
        // Sit up, draw the knees in.
        k(1.85, { hipsPos: [0, -0.8, -0.3], hips: [-40, 0, 0], spine: [20, 0, 0], chest: [16, 0, 0], neck: [10, 0, 0], head: [0, 0, 0], thighL: [100, 10, 0], shinL: [130], footL: [10, 0], thighR: [90, 6, 0], shinR: [125], footR: [10, 0], upperArmL: [-30, 20, 0, 0], forearmL: [10, 0], upperArmR: [-30, 20, 0, 0], forearmR: [10, 0] }),
        // Crouch over the feet.
        k(2.2, { hipsPos: [0, -0.48, -0.08], hips: [35, 0, 0], spine: [20, 0, 0], chest: [10, 0, 0], neck: [-10, 0, 0], head: [-10, 0, 0], thighL: [110, 8, 0], shinL: [120], footL: [-5, 0], thighR: [100, 6, 0], shinR: [125], footR: [-10, 0], upperArmL: [30, 20, 0, 0], forearmL: [30, 0], upperArmR: [30, 20, 0, 0], forearmR: [30, 0] }),
        k(2.75, { ...REST, thighL: [2, 3, 8], shinL: [3], footL: [1, 0], thighR: [2, 3, -8], shinR: [3], footR: [1, 0], toeL: 0, toeR: 0 }),
      );
    }
    return { name, duration: getUp ? 2.75 : 1.4, base: REST, keys };
  };
  const forwardDeath: ClipDef = {
    name: 'death:forward',
    duration: 1.6,
    base: REST,
    keys: [
      k(0, {}),
      k(0.15, { chest: [14, 0, 0], spine: [8, 0, 0], neck: [10, 0, 0], hipsPos: [0, -0.05, 0.02], upperArmL: [20, 20, 0, 0], upperArmR: [24, 20, 0, 0] }),
      k(0.5, kneelFall),
      k(0.7, { ...kneelFall, spine: [30, 0, 0], chest: [20, 0, 0], hips: [30, 0, 4], hipsPos: [0, -0.56, 0.05] }),
      k(1.0, { ...faceDown, hipsPos: [0, -0.8, 0.3], neck: [-10, 0, 0] }),
      k(1.2, faceDown, undefined, true),
      k(1.6, faceDown),
    ],
  };
  return {
    knockdown: { def: backFall('knockdown', true), mask: 'full', busy: true, fadeIn: 0.06, fadeOut: 0.25 },
    death: { def: backFall('death', false), mask: 'full', busy: true, hold: true, fadeIn: 0.06, drop: { t: 0.5, what: 'all' } },
    'death:forward': { def: forwardDeath, mask: 'full', busy: true, hold: true, fadeIn: 0.06, drop: { t: 0.7, what: 'all' } },
  };
}

/** Drawing and sheathing per scabbard location. */
function drawSheath(stance: Stance): Record<string, ActionDef> {
  const drawn = stancePose(stance, true);
  const rest = stancePose(stance, false);
  const out: Record<string, ActionDef> = {};
  const reach: Record<string, PoseSpec> = {
    hipR: { chest: [4, -8, 0], shoulderR: [-4, 6], upperArmR: [-6, 30, 6, -30], forearmR: [52, -40], handR: [12, 0, 0], fingersR: 70, indexR: 60, head: [-2, -10, 6] },
    hipL: { chest: [6, 14, 0], spine: [4, 6, 0], shoulderR: [2, 16], upperArmR: [22, -10, -48, -20], forearmR: [96, -30], handR: [10, 0, 0], fingersR: 70, indexR: 60, head: [6, 10, 0] },
    back: { chest: [-2, -6, 0], shoulderR: [16, -10], upperArmR: [150, 24, 24, 10], forearmR: [140, 0], handR: [0, 0, 0], fingersR: 70, indexR: 60 },
    fists: { upperArmL: [30, 14, -10, 10], forearmL: [100, 30], fingersL: 90, upperArmR: [30, 16, -10, 10], forearmR: [100, 30], fingersR: 90 },
  };
  // The bow hangs on the back with its upper limb over the left shoulder: the bow hand reaches for it.
  if (stance === 'bow') reach.back = mirrorPose(reach.back);
  // A shield slung on the back: the left hand reaches back to its rim by the left hip and swings it
  // round onto the arm (the shield travels with the hand from the grab frame, see Equipment).
  const shieldReach: PoseSpec = { shoulderL: [-6, -14], upperArmL: [-30, 24, 6, 6], forearmL: [26, 30], handL: [14, 0, 0], fingersL: 75, indexL: 70 };
  for (const loc of ['hipR', 'hipL', 'back', 'fists'] as const) {
    const r = { ...reach[loc], ...(hasShield(stance) && loc !== 'fists' ? shieldReach : {}) };
    out[`drawWeapon:${loc}`] = {
      def: {
        name: `drawWeapon:${loc}`,
        duration: 0.78,
        base: rest.pose,
        keys: [
          k(0, rest.pose, rest.feet),
          k(0.3, r, rest.feet, true),
          k(0.48, { ...interpolate(r, drawn.pose, 0.5) }, interpolateFeet(rest.feet, drawn.feet, 0.5)),
          k(0.78, drawn.pose, drawn.feet),
        ],
      },
      mask: 'auto',
      busy: true,
      grab: 0.3,
      fadeIn: 0.1,
    };
    out[`sheathWeapon:${loc}`] = {
      def: {
        name: `sheathWeapon:${loc}`,
        duration: 0.82,
        base: drawn.pose,
        keys: [
          k(0, drawn.pose, drawn.feet),
          k(0.22, { ...interpolate(drawn.pose, r, 0.6) }, interpolateFeet(drawn.feet, rest.feet, 0.5)),
          k(0.42, r, rest.feet, true),
          k(0.82, rest.pose, rest.feet),
        ],
      },
      mask: 'auto',
      busy: true,
      grab: 0.42,
      fadeIn: 0.1,
    };
  }
  return out;
}

function interpolate(a: PoseSpec, b: PoseSpec, t: number): PoseSpec {
  const out: PoseSpec = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof PoseSpec>;
  for (const key of keys) {
    const va = a[key] as number | readonly number[] | undefined;
    const vb = b[key] as number | readonly number[] | undefined;
    if (va === undefined || vb === undefined) {
      (out as Record<string, unknown>)[key] = vb ?? va;
      continue;
    }
    if (typeof va === 'number' && typeof vb === 'number') (out as Record<string, unknown>)[key] = va + (vb - va) * t;
    else {
      const aa = va as readonly number[];
      const bb = vb as readonly number[];
      (out as Record<string, unknown>)[key] = aa.map((x, i) => x + ((bb[i] ?? 0) - x) * t);
    }
  }
  return out;
}

function interpolateFeet(a: Feet, b: Feet, t: number): Feet {
  return { L: lerpFoot(a.L, b.L, t), R: lerpFoot(a.R, b.R, t) };
}

/** Bow, throwing, everyday gestures, prayer and the gladiator's plea. */
function gestures(stance: Stance): Record<string, ActionDef> {
  const R = FEET_REST;
  const rest = stancePose(stance, false).pose;
  const bowAim: PoseSpec = {
    hips: [2, -52, 0], spine: [2, 14, 0], chest: [0, 16, -4], neck: [0, 10, 0], head: [-4, 14, 4],
    hipsPos: [0, -0.03, 0],
    shoulderL: [4, -4], upperArmL: [94, 0, 34, -6], forearmL: [4, 0], handL: [0, 0, 0], fingersL: 90, indexL: 88,
    // Full draw: the drawing elbow out at shoulder height behind the shoulder line, the forearm in
    // line with the arrow, three fingers hooked on the string (Mediterranean draw) at the jaw.
    shoulderR: [8, -10], upperArmR: [0, 96, 52, 0], forearmR: [142, -40], handR: [-6, 0, 0], fingersR: 68, indexR: 58,
  };
  const bowFeet: Feet = { L: [0.06, 0.08, 0, 0, -30], R: [-0.06, -0.08, 0, 0, -70] };
  const out: Record<string, ActionDef> = {
    bowDraw: {
      def: {
        name: 'bowDraw',
        duration: 0.9,
        base: rest,
        keys: [
          k(0, { ...rest, upperArmL: [20, 12, 10, 0], forearmL: [70, 0] }, R),
          k(0.32, { ...bowAim, upperArmR: [80, 10, -10, 0], forearmR: [120, 0], fingersR: 50 }, bowFeet),
          k(0.9, bowAim, bowFeet, true),
        ],
      },
      mask: 'auto',
      busy: true,
      hold: true,
      fadeIn: 0.12,
    },
    bowRelease: {
      def: {
        name: 'bowRelease',
        duration: 0.5,
        base: bowAim,
        keys: [
          k(0, bowAim, bowFeet),
          // Release: the string hand flies straight back past the jaw (follow-through).
          k(0.06, { upperArmR: [2, 86, 34, 0], forearmR: [122, -40], fingersR: -10, indexR: -10, chest: [-2, 18, -4] }),
          k(0.22, { upperArmR: [4, 80, 30, 0], forearmR: [116, -30] }, undefined, true),
          k(0.5, { ...rest, upperArmL: [20, 12, 10, 0], forearmL: [70, 0] }, R),
        ],
      },
      mask: 'auto',
      busy: true,
      hit: 0.04,
      fadeIn: 0.02,
    },
    throw: {
      def: {
        name: 'throw',
        duration: 1.0,
        base: rest,
        keys: [
          k(0, rest, FEET_READY),
          k(0.36, { hips: [-4, -40, 0], spine: [-6, -10, 0], chest: [-8, -12, 0], neck: [0, 22, 0], head: [-4, 28, 0], hipsPos: [0, -0.05, -0.06], shoulderR: [10, -12], upperArmR: [150, 36, 50, 40], forearmR: [80, 0], handR: [10, 0, 0], fingersR: 85, upperArmL: [90, 0, 10, 0], forearmL: [10, 0], fingersL: 0 }, FEET_READY, true),
          k(0.44, {}, { L: [0.015, 0.25, 0.06, 6, 2] }),
          k(0.5, { hips: [8, 10, 0], spine: [10, 6, 0], chest: [12, 8, 0], neck: [-4, -6, 0], head: [-8, -8, 0], hipsPos: [0, -0.1, 0.12], shoulderR: [6, 14], upperArmR: [120, 10, -10, 0], forearmR: [20, 0], handR: [-10, 0, 0], fingersR: 20, upperArmL: [10, 20, 0, 0], forearmL: [40, 0] }, { L: [0.015, 0.36, 0, 0, 2], R: [-0.025, -0.14, 0, -20, -38] }),
          k(0.66, { spine: [18, 8, 0], upperArmR: [40, 6, -40, 0], forearmR: [20, 0] }, {}, true),
          k(1.0, rest, FEET_REST),
        ],
      },
      mask: 'auto',
      keepShield: true,
      busy: true,
      hit: 0.5,
      fadeIn: 0.1,
    },
    interact: {
      def: {
        name: 'interact',
        duration: 0.9,
        base: rest,
        keys: [
          k(0, rest, R),
          k(0.35, { spine: [8, 4, 0], chest: [6, 4, 0], neck: [6, 0, 0], head: [6, 0, 0], hipsPos: [0, -0.02, 0.03], shoulderR: [4, 14], upperArmR: [62, 6, -8, 0], forearmR: [22, 50], handR: [-10, 0, 0], fingersR: 10, indexR: 0 }, R, true),
          k(0.5, { fingersR: 60, indexR: 50 }),
          k(0.9, rest, R),
        ],
      },
      mask: 'auto',
      keepShield: true,
      busy: true,
      hit: 0.45,
      fadeIn: 0.12,
    },
    pickup: {
      def: {
        name: 'pickup',
        duration: 1.3,
        base: rest,
        keys: [
          k(0, rest, R),
          k(0.5, { hipsPos: [0, -0.34, -0.12], hips: [48, 0, 0], spine: [22, 0, 0], chest: [12, 0, 0], neck: [2, 0, 0], head: [-4, 0, 0], shoulderR: [0, 12], upperArmR: [48, 4, -4, 0], forearmR: [8, 50], handR: [0, 0, 0], fingersR: 10, upperArmL: [24, 16, 0, 0], forearmL: [30, 0] }, { L: [0.03, 0.1, 0, 0, 10], R: [-0.03, -0.08, 0, -24, -12] }, true),
          k(0.62, { fingersR: 75, indexR: 70 }),
          k(1.3, rest, R),
        ],
      },
      mask: 'full',
      keepShield: true,
      busy: true,
      hit: 0.58,
      fadeIn: 0.15,
    },
    drink: {
      def: {
        name: 'drink',
        duration: 1.9,
        base: rest,
        keys: [
          k(0, rest, R),
          k(0.5, { shoulderR: [4, 8], upperArmR: [48, 20, -32, 0], forearmR: [132, 40], handR: [10, 0, 0], fingersR: 70 }),
          k(0.8, { neck: [-12, 0, 0], head: [-20, 0, 0], chest: [-4, 0, 0], upperArmR: [70, 22, -30, 0], forearmR: [138, 60], handR: [20, 0, 0] }, undefined, true),
          k(1.2, { neck: [-14, 0, 0], head: [-22, 0, 0] }, undefined, true),
          k(1.45, { neck: [6, 0, 0], head: [-4, 0, 0], upperArmR: [30, 16, -20, 0], forearmR: [100, 40] }),
          k(1.9, rest, R),
        ],
      },
      mask: 'auto',
      keepShield: true,
      busy: true,
      hit: 1.0,
      prop: 'cup',
      fadeIn: 0.15,
    },
    pray: {
      def: {
        name: 'pray',
        duration: 2.8,
        base: rest,
        keys: [
          k(0, rest, R),
          k(0.7, ORANS, R, true),
          k(2.1, { ...ORANS, head: [-16, 0, 0] }, R, true),
          k(2.8, rest, R),
        ],
      },
      mask: 'full',
      keepShield: true,
      busy: false,
      fadeIn: 0.2,
    },
    cheer: {
      def: {
        name: 'cheer',
        duration: 1.6,
        base: rest,
        keys: [
          k(0, rest, R),
          k(0.3, CHEER_UP, R),
          k(0.55, CHEER_MID, R),
          k(0.8, CHEER_UP, R),
          k(1.05, CHEER_MID, R),
          k(1.6, rest, R),
        ],
      },
      mask: 'auto',
      keepShield: true,
      busy: false,
      fadeIn: 0.12,
    },
    wave: {
      def: {
        name: 'wave',
        duration: 1.7,
        base: rest,
        keys: [
          k(0, rest, R),
          k(0.35, { shoulderR: [10, 6], upperArmR: [124, 36, 30, -10], forearmR: [62, 80], handR: [-10, 0, 0], fingersR: -8, indexR: -8, head: [-6, -6, 0] }),
          k(0.55, { upperArmR: [124, 36, 30, 22] }),
          k(0.75, { upperArmR: [124, 36, 30, -14] }),
          k(0.95, { upperArmR: [124, 36, 30, 22] }),
          k(1.15, { upperArmR: [124, 36, 30, -6] }, undefined, true),
          k(1.7, rest, R),
        ],
      },
      mask: 'upper',
      keepShield: true,
      busy: false,
      fadeIn: 0.15,
    },
    talk: {
      def: {
        name: 'talk',
        duration: 2.2,
        base: rest,
        keys: [
          k(0, rest, R),
          k(0.4, { shoulderR: [4, 6], upperArmR: [28, 16, 16, 0], forearmR: [82, 95], handR: [-14, 0, 0], fingersR: 4, indexR: 0, head: [-2, -4, 0] }),
          k(0.9, { upperArmR: [34, 14, 6, 0], forearmR: [90, 70], fingersR: 30, head: [2, 2, 0] }),
          k(1.25, { upperArmR: [40, 18, -4, 0], forearmR: [100, 10], fingersR: 95, indexR: 0, handR: [0, 0, 0], head: [6, 0, 0] }),
          k(1.45, { upperArmR: [36, 18, -4, 0], forearmR: [80, 10], head: [-2, 0, 0] }),
          k(2.2, rest, R),
        ],
      },
      mask: 'upper',
      keepShield: true,
      busy: false,
      fadeIn: 0.2,
    },
    yield: {
      def: {
        name: 'yield',
        duration: 1.6,
        base: rest,
        keys: [
          k(0, rest),
          k(0.4, { hipsPos: [0, -0.2, 0.02], hips: [10, 0, 0], spine: [8, 0, 0], thighL: [50, 6, 4], shinL: [56], footL: [6, 0], thighR: [20, 4, 0], shinR: [50], footR: [-30, 0], upperArmR: [10, 18, 0, 0], forearmR: [20, 0] }),
          k(0.85, YIELD, undefined, true),
          k(1.6, { ...YIELD, head: [18, 0, 0] }, undefined, true),
        ],
      },
      mask: 'full',
      drop: { t: 0.35, what: 'shield' },
      busy: true,
      hold: true,
      fadeIn: 0.15,
    },
  };
  return out;
}

/** Roman orans: arms raised forward and out, elbows bent, palms up; gaze lifted. */
export const ORANS: PoseSpec = {
  ...REST,
  spine: [-2, 0, 0],
  chest: [-4, 0, 0],
  neck: [-4, 0, 0],
  head: [-12, 0, 0],
  shoulderL: [6, 0],
  shoulderR: [6, 0],
  upperArmL: [62, 30, 30, -36],
  upperArmR: [62, 30, 30, -36],
  forearmL: [60, 115],
  forearmR: [60, 115],
  handL: [-22, 0, 0],
  handR: [-22, 0, 0],
  fingersL: -6,
  fingersR: -6,
  indexL: -6,
  indexR: -6,
};

const CHEER_UP: PoseSpec = {
  chest: [-6, 0, 0],
  head: [-14, 0, 0],
  hipsPos: [0, 0.01, 0],
  shoulderL: [16, 0],
  shoulderR: [16, 0],
  upperArmL: [168, 22, 10, 0],
  upperArmR: [168, 22, 10, 0],
  forearmL: [24, 0],
  forearmR: [24, 0],
  fingersL: 90,
  fingersR: 90,
  indexL: 88,
  indexR: 88,
};
const CHEER_MID: PoseSpec = {
  chest: [-2, 0, 0],
  head: [-8, 0, 0],
  hipsPos: [0, -0.03, 0],
  shoulderL: [6, 0],
  shoulderR: [6, 0],
  upperArmL: [128, 30, 20, 0],
  upperArmR: [128, 30, 20, 0],
  forearmL: [80, 0],
  forearmR: [80, 0],
};

/** Ad digitum: kneeling on the right knee, left index finger raised, head bowed. */
export const YIELD: PoseSpec = {
  hipsPos: [0, -0.41, -0.02],
  hips: [4, -6, 0],
  spine: [6, 2, 0],
  chest: [6, 2, 0],
  neck: [12, 0, 0],
  head: [10, 4, 0],
  thighL: [88, 6, 4],
  shinL: [92],
  footL: [2, 0],
  toeL: 0,
  thighR: [2, 4, 0],
  shinR: [100],
  footR: [-46, 0],
  toeR: 50,
  shoulderL: [10, 0],
  upperArmL: [150, 20, 12, 0],
  forearmL: [22, 20],
  handL: [0, 0, 0],
  fingersL: 96,
  indexL: -4,
  shoulderR: [0, 0],
  upperArmR: [8, 20, 0, 0],
  forearmR: [24, 0],
  handR: [0, 0, 0],
};

// ------------------------------------------------------------------ registry

/** All action defs for a stance (attacks by weapon class + the shared set). */
export function actionDefs(stance: Stance): Record<string, ActionDef> {
  const cls = weaponClass(stance);
  const attacks =
    cls === 'blade' ? bladeAttacks(stance) : cls === 'spear' ? spearAttacks(stance) : cls === 'twoHand' ? twoHandAttacks() : unarmedAttacks();
  return { ...attacks, ...reactions(cls, stance), ...falls(), ...drawSheath(stance), ...gestures(stance) };
}

