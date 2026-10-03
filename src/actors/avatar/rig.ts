/**
 * Humanoid skeleton definition and body proportions (pure data, no three.js scene objects).
 *
 * Bind pose: standing straight, feet at y = 0, facing +Z, arms hanging straight down with the
 * palms toward the thighs and the thumbs forward. Every bone has an IDENTITY rest rotation, so
 * each bone's local axes line up with the character's axes in the bind pose (+X = the
 * character's left, +Y = up, +Z = forward). That keeps procedural meshes simple (all limb tubes
 * are vertical) and makes poses easy to author (see anim/pose.ts).
 *
 * Bone names are camelCase with an L/R suffix (`upperArmL`) rather than `upperArm.L`, because
 * three.js PropertyBinding treats dots in track names as separators.
 */
import type { AgeGroup, Appearance, Build, Sex } from '../appearance';

export const BONES = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'shoulderL',
  'upperArmL',
  'forearmL',
  'handL',
  'fingersL',
  'indexL',
  'shoulderR',
  'upperArmR',
  'forearmR',
  'handR',
  'fingersR',
  'indexR',
  'thighL',
  'shinL',
  'footL',
  'toeL',
  'thighR',
  'shinR',
  'footR',
  'toeR',
] as const;

export type BoneName = (typeof BONES)[number];
export const BONE_COUNT = BONES.length;

/** Bone index by name (B.hips === 0 ...). */
export const B = Object.fromEntries(BONES.map((n, i) => [n, i])) as { readonly [K in BoneName]: number };

export const PARENT: Readonly<Record<BoneName, BoneName | null>> = {
  hips: null,
  spine: 'hips',
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  shoulderL: 'chest',
  upperArmL: 'shoulderL',
  forearmL: 'upperArmL',
  handL: 'forearmL',
  fingersL: 'handL',
  indexL: 'handL',
  shoulderR: 'chest',
  upperArmR: 'shoulderR',
  forearmR: 'upperArmR',
  handR: 'forearmR',
  fingersR: 'handR',
  indexR: 'handR',
  thighL: 'hips',
  shinL: 'thighL',
  footL: 'shinL',
  toeL: 'footL',
  thighR: 'hips',
  shinR: 'thighR',
  footR: 'shinR',
  toeR: 'footR',
};

export const PARENT_INDEX: readonly number[] = BONES.map((n) => (PARENT[n] ? B[PARENT[n]!] : -1));

/** Bones on the right side (mirrored from their L twin). */
export const RIGHT_SIDE = new Set<BoneName>(BONES.filter((n) => n.endsWith('R')));
export const mirrorName = (n: BoneName): BoneName =>
  (n.endsWith('L') ? n.slice(0, -1) + 'R' : n.endsWith('R') ? n.slice(0, -1) + 'L' : n) as BoneName;

/** Girth multipliers derived from build/sex/age (1 = average adult man). */
export interface Girth {
  torso: number;
  shoulders: number;
  waist: number;
  hips: number;
  belly: number;
  bust: number;
  arm: number;
  leg: number;
  neck: number;
}

export interface Rig {
  height: number;
  /** Length scale relative to the 1.75 m reference body. */
  s: number;
  sex: Sex;
  build: Build;
  age: AgeGroup;
  g: Girth;
  /** Chin-to-crown head height (m). */
  headH: number;
  /** Bind-pose joint positions in character space (feet at y = 0), xyz per bone. */
  joints: Float32Array;
  /** Bone lengths. */
  upperArm: number;
  forearm: number;
  thigh: number;
  shin: number;
  /** Ankle joint height above the sole. */
  ankleH: number;
  /** Foot: ankle → ball of the foot (forward) and ankle → heel (back). */
  footFwd: number;
  footBack: number;
  /** Eye height above the feet. */
  eyeHeight: number;
  /** Forward stoop for the elderly (0..1), used by the animation layer. */
  stoop: number;
}

/** Reference height the animation clips are authored for. */
export const REF_HEIGHT = 1.75;

const BUILD_GIRTH: Record<Build, Girth> = {
  slight: { torso: 0.9, shoulders: 0.95, waist: 0.9, hips: 0.95, belly: 0.9, bust: 0.9, arm: 0.86, leg: 0.88, neck: 0.9 },
  average: { torso: 1, shoulders: 1, waist: 1, hips: 1, belly: 1, bust: 1, arm: 1, leg: 1, neck: 1 },
  stocky: { torso: 1.08, shoulders: 1.04, waist: 1.1, hips: 1.06, belly: 1.08, bust: 1.05, arm: 1.08, leg: 1.1, neck: 1.12 },
  muscular: { torso: 1.06, shoulders: 1.1, waist: 1.0, hips: 1.0, belly: 0.94, bust: 1.0, arm: 1.2, leg: 1.12, neck: 1.18 },
  heavy: { torso: 1.14, shoulders: 1.05, waist: 1.32, hips: 1.16, belly: 1.5, bust: 1.2, arm: 1.16, leg: 1.16, neck: 1.2 },
};

export type RigInput = Pick<Appearance, 'height' | 'sex' | 'build' | 'age'>;

/** Computes joint positions and girths for an appearance. Pure and deterministic. */
export function computeRig(app: RigInput): Rig {
  const child = app.age === 'child';
  const H = Math.max(0.9, Math.min(2.1, app.height || 1.7));
  const s = H / REF_HEIGHT;
  const female = app.sex === 'female';
  const g: Girth = { ...BUILD_GIRTH[app.build] };
  if (female) {
    g.shoulders *= 0.89;
    g.waist *= 0.84;
    g.hips *= 1.1;
    g.arm *= 0.84;
    g.leg *= 0.96;
    g.neck *= 0.82;
    g.torso *= 0.94;
  } else {
    g.bust = 0;
  }
  if (app.age === 'old') {
    g.arm *= 0.92;
    g.leg *= 0.9;
    g.belly *= 1.08;
  }
  if (child) {
    g.shoulders *= 0.92;
    g.waist *= 1.05;
    g.belly *= 1.05;
    g.bust = 0;
  }

  // Head height grows less than proportionally with stature; children have big heads.
  // Slightly larger than life (≈ +5 %) reads friendlier and keeps faces legible at distance.
  let headH = 0.244 * (0.5 + 0.5 * s) * (female ? 0.95 : 1);
  if (child) headH = Math.max(headH, 0.18 + 0.05 * (H - 1.0));

  const top = H;
  const chinY = top - headH;
  const headY = top - headH * 0.8; // atlas joint, about mouth level
  const neckY = chinY - (child ? 0.05 : 0.085) * s;
  const shoulderY = neckY - 0.022 * s;
  const hipJointY = (child ? 0.49 : 0.515) * H;
  const kneeY = (child ? 0.265 : 0.278) * H;
  const ankleH = 0.075 * s;
  const spineY = hipJointY + (shoulderY - hipJointY) * 0.27;
  const chestY = hipJointY + (shoulderY - hipJointY) * 0.6;
  const hipsY = hipJointY + 0.04 * s;
  const armLen = shoulderY - (child ? 0.43 : 0.47) * H; // shoulder → wrist
  const upperArm = armLen * 0.56;
  const forearm = armLen * 0.44;
  const hipHalf = 0.088 * s * (female ? 1.08 : 1) * (0.75 + 0.25 * g.hips);
  const shoulderHalf = 0.176 * s * g.shoulders;

  const j = new Float32Array(BONES.length * 3);
  const set = (n: BoneName, x: number, y: number, z: number) => {
    const i = B[n] * 3;
    j[i] = x;
    j[i + 1] = y;
    j[i + 2] = z;
  };
  set('hips', 0, hipsY, 0);
  set('spine', 0, spineY, -0.012 * s);
  set('chest', 0, chestY, -0.018 * s);
  set('neck', 0, neckY, -0.022 * s);
  set('head', 0, headY, -0.005 * s);
  for (const side of [1, -1]) {
    const L = side > 0;
    const sh = (L ? 'shoulderL' : 'shoulderR') as BoneName;
    set(sh, side * 0.025 * s, shoulderY - 0.02 * s, -0.01 * s);
    set((L ? 'upperArmL' : 'upperArmR') as BoneName, side * shoulderHalf, shoulderY - 0.012 * s, -0.018 * s);
    const elbowY = shoulderY - 0.012 * s - upperArm;
    set((L ? 'forearmL' : 'forearmR') as BoneName, side * shoulderHalf, elbowY, -0.018 * s);
    const wristY = elbowY - forearm;
    set((L ? 'handL' : 'handR') as BoneName, side * shoulderHalf, wristY, -0.018 * s);
    // Knuckles: fingers bone. The index finger shares the knuckle line, toward the thumb (+Z).
    set((L ? 'fingersL' : 'fingersR') as BoneName, side * (shoulderHalf - 0.004 * s), wristY - 0.088 * s * (female ? 0.92 : 1), -0.024 * s);
    set((L ? 'indexL' : 'indexR') as BoneName, side * (shoulderHalf - 0.004 * s), wristY - 0.086 * s * (female ? 0.92 : 1), 0.004 * s);
    set((L ? 'thighL' : 'thighR') as BoneName, side * hipHalf, hipJointY, 0);
    set((L ? 'shinL' : 'shinR') as BoneName, side * hipHalf, kneeY, 0.004 * s);
    set((L ? 'footL' : 'footR') as BoneName, side * hipHalf, ankleH, -0.006 * s);
    set((L ? 'toeL' : 'toeR') as BoneName, side * hipHalf, 0.022 * s, 0.135 * s);
  }

  return {
    height: H,
    s,
    sex: app.sex,
    build: app.build,
    age: app.age,
    g,
    headH,
    joints: j,
    upperArm,
    forearm,
    thigh: hipJointY - kneeY,
    shin: kneeY - ankleH,
    ankleH,
    footFwd: 0.135 * s,
    footBack: 0.06 * s,
    eyeHeight: top - headH * 0.455,
    stoop: app.age === 'old' ? 1 : app.age === 'middle' ? 0.25 : 0,
  };
}

/** Joint position (character space) of a bone. */
export function jointPos(rig: Rig, bone: BoneName | number, out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }) {
  const i = (typeof bone === 'number' ? bone : B[bone]) * 3;
  out.x = rig.joints[i];
  out.y = rig.joints[i + 1];
  out.z = rig.joints[i + 2];
  return out;
}

/** Bone offset from its parent joint (the local position of the bone in the bind pose). */
export function localOffset(rig: Rig, bone: BoneName): [number, number, number] {
  const i = B[bone] * 3;
  const p = PARENT[bone];
  if (!p) return [rig.joints[i], rig.joints[i + 1], rig.joints[i + 2]];
  const k = B[p] * 3;
  return [rig.joints[i] - rig.joints[k], rig.joints[i + 1] - rig.joints[k + 1], rig.joints[i + 2] - rig.joints[k + 2]];
}
