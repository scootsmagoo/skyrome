/**
 * Authored pose vocabulary (semantic degrees, see pose.ts for the channel meanings):
 * the relaxed standing pose, combat-ready stances per weapon class, blocks and carries.
 *
 * Reminders: upperArm = [flex (+ fwd/up), abduct (+ out), yaw (+ outward sweep), twist];
 * forearm = [flex, supinate]; center bones = [bend fwd, turn left, lean right];
 * feet = [dx (+ left), dz (+ fwd), lift, pitch (+ toes up), yaw (+ toes to the left)].
 */
import type { Stance } from '../../Actor';
import type { FootKey } from './clip';
import type { PoseSpec } from './pose';

export type WeaponClass = 'unarmed' | 'blade' | 'twoHand' | 'spear' | 'bow';

export function weaponClass(stance: Stance): WeaponClass {
  switch (stance) {
    case 'oneHand':
    case 'oneHandShield':
      return 'blade';
    case 'twoHand':
      return 'twoHand';
    case 'spear':
    case 'spearShield':
      return 'spear';
    case 'bow':
      return 'bow';
    default:
      return 'unarmed';
  }
}

export const hasShield = (s: Stance) => s === 'oneHandShield' || s === 'spearShield';

export type Feet = { L: FootKey; R: FootKey };

/** Relaxed standing feet, toes turned a little out. */
export const FEET_REST: Feet = { L: [0.005, 0.01, 0, 0, 8], R: [-0.005, -0.01, 0, 0, -8] };
/** Combat stance: left foot forward, rear foot turned out. */
export const FEET_READY: Feet = { L: [0.015, 0.13, 0, 0, 2], R: [-0.025, -0.14, 0, 0, -38] };
export const FEET_SHIELD: Feet = { L: [0.02, 0.16, 0, 0, 0], R: [-0.035, -0.16, 0, 0, -42] };

export const ARMS_REST: PoseSpec = {
  shoulderL: [0, 0],
  shoulderR: [0, 0],
  upperArmL: [5, 7, 0, 10],
  upperArmR: [5, 7, 0, 10],
  forearmL: [14, 14],
  forearmR: [14, 14],
  handL: [6, 0, 0],
  handR: [6, 0, 0],
  fingersL: 22,
  fingersR: 22,
  indexL: 14,
  indexR: 14,
};

export const REST: PoseSpec = {
  hipsPos: [0, -0.008, 0],
  hips: [0, 0, 0],
  spine: [2, 0, 0],
  chest: [-1, 0, 0],
  neck: [7, 0, 0],
  head: [-5, 0, 0],
  ...ARMS_REST,
};

/** Combat-ready torso (pairs with FEET_READY). */
export const READY_BODY: PoseSpec = {
  hipsPos: [0, -0.05, -0.005],
  hips: [4, -16, 0],
  spine: [5, 6, 0],
  chest: [4, 8, 0],
  neck: [1, 1, 0],
  head: [-5, 1, 0],
};

export const SHIELD_BODY: PoseSpec = {
  hipsPos: [0, -0.07, -0.01],
  hips: [6, -22, 0],
  spine: [6, 9, 0],
  chest: [5, 11, 0],
  neck: [2, 1, 0],
  head: [-6, 1, 0],
};

// ---- arm sets (drawn) -------------------------------------------------------

export const ARM_FISTS: PoseSpec = {
  shoulderL: [6, 6],
  shoulderR: [6, 6],
  upperArmL: [48, 18, -16, 10],
  forearmL: [120, 35],
  handL: [4, 0, 0],
  fingersL: 95,
  indexL: 92,
  upperArmR: [40, 22, -16, 10],
  forearmR: [128, 35],
  handR: [4, 0, 0],
  fingersR: 95,
  indexR: 92,
};

/** Sword hand at the hip, blade forward and up. */
export const ARM_R_BLADE: PoseSpec = {
  shoulderR: [2, 2],
  upperArmR: [28, 14, -6, 8],
  forearmR: [70, 0],
  handR: [-6, -22, 0],
  fingersR: 82,
  indexR: 76,
};

/** Free left hand guarding forward. */
export const ARM_L_GUARD: PoseSpec = {
  shoulderL: [2, 4],
  upperArmL: [38, 16, 18, 0],
  forearmL: [72, 45],
  handL: [10, 0, 0],
  fingersL: 18,
  indexL: 10,
};

/** Shield arm: fist on the horizontal grip, forearm forward, palm down: the shield faces forward. */
export const ARM_L_SHIELD: PoseSpec = {
  shoulderL: [2, 2],
  upperArmL: [16, 12, 4, 0],
  forearmL: [84, -90],
  handL: [0, 0, 0],
  fingersL: 88,
  indexL: 88,
};

export const ARM_L_SHIELD_BLOCK: PoseSpec = {
  shoulderL: [10, 8],
  upperArmL: [56, 12, -4, 0],
  forearmL: [84, -90],
  handL: [0, 0, 0],
  fingersL: 88,
  indexL: 88,
};

/** Legionary sword arm: low at the right hip, ready to stab past the shield. */
export const ARM_R_STAB: PoseSpec = {
  shoulderR: [0, 2],
  upperArmR: [20, 20, -2, 10],
  forearmR: [76, 0],
  handR: [-6, -26, 0],
  fingersR: 82,
  indexR: 76,
};

/** Haft held diagonally across the body: right fist low at the hip, the head up by the left shoulder. */
export const ARM_R_TWOHAND: PoseSpec = {
  shoulderR: [2, 4],
  upperArmR: [22, 14, -16, 4],
  forearmR: [70, -42],
  handR: [0, 8, 0],
  fingersR: 85,
  indexR: 80,
};

export const ARM_L_TWOHAND: PoseSpec = {
  shoulderL: [4, 8],
  upperArmL: [50, 8, -32, 0],
  forearmL: [70, 55],
  handL: [0, 0, 0],
  fingersL: 85,
  indexL: 80,
};

/** Spear at the hip: the arm nearly hangs with the thumb forward, so the shaft points ahead. */
export const ARM_R_SPEAR: PoseSpec = {
  shoulderR: [0, 4],
  upperArmR: [18, 8, -10, 4],
  forearmR: [68, -10],
  handR: [0, -30, 0],
  fingersR: 85,
  indexR: 80,
};

export const ARM_L_SPEAR: PoseSpec = {
  shoulderL: [2, 8],
  upperArmL: [44, 6, -18, 0],
  forearmL: [38, 75],
  handL: [0, 0, 0],
  fingersL: 85,
  indexL: 80,
};

/** Spear carried upright in the right hand (sheathed / on guard). */
export const ARM_R_SPEAR_CARRY: PoseSpec = {
  shoulderR: [0, 0],
  upperArmR: [6, 12, 0, 0],
  forearmR: [84, 0],
  handR: [0, 0, 0],
  fingersR: 88,
  indexR: 84,
};

export const ARM_L_BOW: PoseSpec = {
  shoulderL: [0, 2],
  upperArmL: [18, 12, 10, 0],
  forearmL: [70, 0],
  handL: [0, 0, 0],
  fingersL: 88,
  indexL: 84,
};

/** Torch held up in the left hand, flame clear of the head. */
export const ARM_L_TORCH: PoseSpec = {
  shoulderL: [4, 2],
  upperArmL: [36, 20, 16, 0],
  forearmL: [62, 0],
  handL: [0, 0, 0],
  fingersL: 88,
  indexL: 84,
};

/** Retiarius: the gathered net held low and out to the left, ready to cast. */
export const ARM_L_NET: PoseSpec = {
  shoulderL: [2, 6],
  upperArmL: [26, 24, 8, 0],
  forearmL: [46, 20],
  handL: [8, 0, 0],
  fingersL: 90,
  indexL: 86,
};

// ---- blocks ------------------------------------------------------------------

export const BLOCK: Record<WeaponClass | 'shield', PoseSpec> = {
  shield: {
    ...ARM_L_SHIELD_BLOCK,
    chest: [9, 10, 0],
    neck: [8, 0, 0],
    head: [2, 0, 0],
    shoulderR: [6, 4],
    upperArmR: [42, 28, -4, 12],
    forearmR: [96, 0],
    handR: [-6, -26, 0],
  },
  blade: {
    chest: [4, 10, 0],
    shoulderR: [10, 10],
    upperArmR: [88, 30, -22, -20],
    forearmR: [86, -72],
    handR: [0, 18, 0],
    upperArmL: [48, 14, 12, 0],
    forearmL: [92, 40],
    fingersL: 20,
  },
  unarmed: {
    chest: [8, 8, 0],
    neck: [10, 0, 0],
    upperArmL: [68, 14, -24, 0],
    forearmL: [132, 60],
    upperArmR: [64, 16, -24, 0],
    forearmR: [134, 60],
    fingersL: 95,
    fingersR: 95,
  },
  twoHand: {
    chest: [4, 12, 0],
    upperArmR: [74, 22, 26, 0],
    forearmR: [96, -30],
    handR: [0, 20, 0],
    upperArmL: [76, 18, 24, 0],
    forearmL: [92, -10],
  },
  spear: {
    chest: [4, 10, 0],
    upperArmR: [50, 26, 12, 0],
    forearmR: [92, -40],
    handR: [0, 25, 0],
    upperArmL: [64, 10, -10, 0],
    forearmL: [70, 60],
  },
  bow: {
    chest: [6, 6, 0],
    upperArmL: [62, 10, -20, 0],
    forearmL: [96, -20],
    upperArmR: [50, 18, -20, 0],
    forearmR: [110, 30],
  },
};

// ---- stance poses --------------------------------------------------------------

export interface StancePose {
  pose: PoseSpec;
  feet: Feet;
}

/** Togate: the bent left forearm carries the sinus of the toga (the classic statue pose). */
export const ARM_L_TOGA: PoseSpec = {
  shoulderL: [2, 2],
  upperArmL: [10, 10, 4, 4],
  forearmL: [82, 72],
  handL: [12, 0, 0],
  fingersL: 55,
  indexL: 40,
};

/** Full-body standing pose for a stance (drawn or sheathed). */
export function stancePose(stance: Stance, drawn: boolean, togate = false): StancePose {
  if (!drawn) {
    const pose: PoseSpec = { ...REST };
    if (stance === 'spear' || stance === 'spearShield') Object.assign(pose, ARM_R_SPEAR_CARRY);
    if (togate) Object.assign(pose, ARM_L_TOGA);
    return { pose, feet: FEET_REST };
  }
  switch (stance) {
    case 'unarmed':
      return { pose: { ...REST, ...READY_BODY, ...ARM_FISTS, chest: [7, 9, 0], neck: [5, 1, 0] }, feet: FEET_READY };
    case 'oneHand':
      return { pose: { ...REST, ...READY_BODY, ...ARM_R_BLADE, ...ARM_L_GUARD }, feet: FEET_READY };
    case 'oneHandShield':
      return { pose: { ...REST, ...SHIELD_BODY, ...ARM_R_STAB, ...ARM_L_SHIELD }, feet: FEET_SHIELD };
    case 'twoHand':
      return { pose: { ...REST, ...READY_BODY, ...ARM_R_TWOHAND, ...ARM_L_TWOHAND, hips: [5, -24, 0], chest: [4, 12, 0] }, feet: FEET_READY };
    case 'spear':
      return { pose: { ...REST, ...READY_BODY, ...ARM_R_SPEAR, ...ARM_L_SPEAR, hipsPos: [0, -0.07, -0.01], hips: [8, -26, 0], spine: [9, 4, 0], chest: [6, 4, 0], shoulderL: [0, 18] }, feet: FEET_READY };
    case 'spearShield':
      return { pose: { ...REST, ...SHIELD_BODY, ...ARM_R_SPEAR, ...ARM_L_SHIELD }, feet: FEET_SHIELD };
    case 'bow':
      return { pose: { ...REST, ...ARM_L_BOW }, feet: FEET_REST };
  }
}

/** Bones the stance's arms own while walking (the rest of the body follows the gait). */
export function stanceArmMask(stance: Stance, drawn: boolean, torch: boolean, togate = false): { L: number; R: number; chest: number } {
  let L = 0;
  let R = 0;
  let chest = 0;
  if (drawn) {
    switch (stance) {
      case 'unarmed':
        L = R = 1;
        chest = 0.3;
        break;
      case 'oneHand':
        R = 1;
        L = 0.5;
        break;
      case 'oneHandShield':
      case 'spearShield':
        L = R = 1;
        chest = 0.25;
        break;
      case 'twoHand':
      case 'spear':
        L = R = 1;
        chest = 0.35;
        break;
      case 'bow':
        L = 1;
        break;
    }
  } else if (stance === 'spear' || stance === 'spearShield') R = 1;
  if (togate && !drawn) L = 1;
  if (torch && !(drawn && hasShield(stance))) L = 1;
  return { L, R, chest };
}

// ---- first person ---------------------------------------------------------------
//
// The first-person camera sits at eye height, 0.12 m forward, FOV 70. Hands must be ~0.45 m
// forward and no more than ~0.3 m below the eye to be on screen, so the view poses reach further
// forward than the third-person stances. Applied only to the arms, only in first person.

export const FP_ARMS: Record<WeaponClass | 'shield' | 'torch' | 'net', PoseSpec> = {
  blade: { shoulderR: [6, 16], upperArmR: [76, 12, -22, 0], forearmR: [34, -40], handR: [-12, -28, 0], fingersR: 82, indexR: 76, upperArmL: [34, 22, 24, 0], forearmL: [70, 40] },
  shield: { shoulderL: [0, -8], upperArmL: [30, 34, 46, 0], forearmL: [84, -90], handL: [0, 0, 0] },
  spear: { shoulderR: [6, 12], upperArmR: [32, 20, -8, 14], forearmR: [64, 0], handR: [0, -30, 0], shoulderL: [6, 18], upperArmL: [64, 6, -26, 0], forearmL: [34, 70] },
  twoHand: { shoulderR: [6, 14], upperArmR: [58, 16, -22, 0], forearmR: [62, 20], handR: [0, 10, 0], shoulderL: [6, 18], upperArmL: [72, 8, -36, 0], forearmL: [52, 55] },
  unarmed: { shoulderL: [8, 14], shoulderR: [8, 14], upperArmL: [66, 20, -16, 10], forearmL: [104, 35], upperArmR: [62, 22, -16, 10], forearmR: [108, 35] },
  bow: { shoulderL: [4, 10], upperArmL: [72, 10, 22, 0], forearmL: [22, 0] },
  torch: { shoulderL: [2, 8], upperArmL: [36, 24, 24, 0], forearmL: [58, 0], handL: [0, 0, 0] },
  net: { shoulderL: [4, 10], upperArmL: [48, 26, 20, 0], forearmL: [50, 20], handL: [6, 0, 0] },
};
