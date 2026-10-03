/**
 * Semantic poses: animation is authored as anatomical joint angles in DEGREES, then converted to
 * bone quaternions. Right-side values mean the mirrored motion of the same left-side values, so
 * `upperArmL: [60, 10, 0, 0]` and `upperArmR: [60, 10, 0, 0]` raise both arms forward the same way.
 *
 * Channels per bone (all degrees; meters for hipsPos):
 *   hips, spine, chest, neck, head  [bend (+ forward), turn (+ to the character's left), lean (+ to the right)]
 *   shoulderL/R                     [raise (+ shrug up), forward (+ protract)]
 *   upperArmL/R                     [flex (+ forward/up, 180 = overhead), abduct (+ out to the side, applied first),
 *                                    yaw (+ sweep outward horizontally, applied last), twist (+ external rotation)]
 *   forearmL/R                      [flex (+ bend the elbow), supinate (+ palm turns forward/up)]
 *   handL/R                         [flex (+ palm-side bend), deviate (+ toward the thumb), twist]
 *   fingersL/R, indexL/R            curl (+ closes the hand)
 *   thighL/R                        [flex (+ forward), abduct (+ outward), twist (+ toes out)]
 *   shinL/R                         bend (+ knee flexion)
 *   footL/R                         [up (+ toes up), roll (+ sole turns inward)]
 *   toeL/R                          up (+ toes bend up)
 *   hipsPos                         [x, y, z] offset of the hips from the bind pose, meters at the 1.75 m reference body
 *
 * Bind-pose axes (see rig.ts): +X = character's left, +Y = up, +Z = forward. Mirroring a rotation
 * across the YZ plane keeps the X component and negates Y and Z, which is how right-side bones reuse
 * the left-side recipes.
 */
import { BONES, BONE_COUNT, type BoneName } from '../rig';
import { qAxis, qIdentity, qMul } from './quat';

export type Channel = number | readonly number[];
export type PoseSpec = Partial<Record<BoneName, Channel>> & { hipsPos?: readonly number[] };

type Kind = 'center' | 'shoulder' | 'arm' | 'forearm' | 'hand' | 'finger' | 'thigh' | 'shin' | 'foot' | 'toe';

/** [axis (0 X, 1 Y, 2 Z), sign, param index]; quaternions multiply left to right (the last factor applies first). */
type Factor = readonly [number, number, number];

const RECIPES: Record<Kind, readonly Factor[]> = {
  center: [[1, 1, 1], [0, 1, 0], [2, 1, 2]],
  shoulder: [[1, -1, 1], [2, 1, 0]],
  arm: [[1, 1, 2], [0, -1, 0], [2, 1, 1], [1, 1, 3]],
  forearm: [[0, -1, 0], [1, 1, 1]],
  hand: [[0, -1, 1], [2, -1, 0], [1, 1, 2]],
  finger: [[2, -1, 0]],
  thigh: [[0, -1, 0], [2, 1, 1], [1, 1, 2]],
  shin: [[0, 1, 0]],
  foot: [[0, -1, 0], [2, -1, 1]],
  toe: [[0, -1, 0]],
};

/** Number of parameters and joint limits (degrees) per kind. */
export const LIMITS: Record<Kind, readonly (readonly [number, number])[]> = {
  center: [[-100, 100], [-180, 180], [-100, 100]],
  shoulder: [[-15, 40], [-25, 35]],
  arm: [[-70, 190], [-35, 115], [-110, 110], [-95, 95]],
  forearm: [[0, 150], [-95, 120]],
  hand: [[-75, 85], [-42, 30], [-25, 25]],
  finger: [[-25, 110]],
  thigh: [[-50, 135], [-30, 80], [-50, 65]],
  shin: [[0, 160]],
  foot: [[-65, 46], [-35, 35]],
  toe: [[-35, 75]],
};

/** Tighter limits for spine/neck/head than the free-rotating hips root. */
const CENTER_LIMITS: Partial<Record<BoneName, readonly (readonly [number, number])[]>> = {
  spine: [[-30, 60], [-40, 40], [-30, 30]],
  chest: [[-30, 50], [-40, 40], [-30, 30]],
  neck: [[-45, 55], [-55, 55], [-35, 35]],
  head: [[-50, 45], [-55, 55], [-35, 35]],
};

export function boneKind(n: BoneName): Kind {
  if (n === 'hips' || n === 'spine' || n === 'chest' || n === 'neck' || n === 'head') return 'center';
  const base = n.slice(0, -1);
  switch (base) {
    case 'shoulder':
      return 'shoulder';
    case 'upperArm':
      return 'arm';
    case 'forearm':
      return 'forearm';
    case 'hand':
      return 'hand';
    case 'fingers':
    case 'index':
      return 'finger';
    case 'thigh':
      return 'thigh';
    case 'shin':
      return 'shin';
    case 'foot':
      return 'foot';
    default:
      return 'toe';
  }
}

export const BONE_KIND: readonly Kind[] = BONES.map(boneKind);
export const PARAM_COUNT: readonly number[] = BONE_KIND.map((k) => LIMITS[k].length);
export function limitsFor(n: BoneName): readonly (readonly [number, number])[] {
  return CENTER_LIMITS[n] ?? LIMITS[boneKind(n)];
}
const BONE_LIMITS = BONES.map(limitsFor);
const IS_RIGHT = BONES.map((n) => n.endsWith('R'));

/** Offsets of each bone's parameters in a flat semantic vector. */
export const PARAM_OFFSET: readonly number[] = (() => {
  const out: number[] = [];
  let o = 0;
  for (const c of PARAM_COUNT) {
    out.push(o);
    o += c;
  }
  return out;
})();
/** Length of a flat semantic pose vector: every bone's parameters plus hipsPos (3). */
export const SEM_LEN = PARAM_OFFSET[BONE_COUNT - 1] + PARAM_COUNT[BONE_COUNT - 1] + 3;
export const SEM_HIPS_POS = SEM_LEN - 3;

const DEG = Math.PI / 180;
const tq = new Float32Array(4);

/** Writes the quaternion for bone `b` from semantic parameters (degrees) into out[o..o+3]. Clamps to joint limits. */
export function boneQuat(b: number, params: ArrayLike<number>, po: number, out: Float32Array, o: number, clampLimits = true) {
  const recipe = RECIPES[BONE_KIND[b]];
  const lim = BONE_LIMITS[b];
  const right = IS_RIGHT[b];
  qIdentity(out, o);
  for (const [axis, sign, pi] of recipe) {
    let v = params[po + pi] ?? 0;
    if (clampLimits) {
      const [lo, hi] = lim[pi];
      v = v < lo ? lo : v > hi ? hi : v;
    }
    if (v === 0) continue;
    const s = right && axis !== 0 ? -sign : sign;
    qAxis(tq, 0, axis, s * v * DEG);
    qMul(out, o, out, o, tq, 0);
  }
}

/** Flat semantic vector (zeros = bind pose). */
export function semZero(): Float32Array {
  return new Float32Array(SEM_LEN);
}

/** Copies a PoseSpec into a flat semantic vector (only the channels present in the spec). */
export function specToSem(spec: PoseSpec, out: Float32Array): Float32Array {
  for (let b = 0; b < BONE_COUNT; b++) {
    const v = spec[BONES[b]];
    if (v === undefined) continue;
    const o = PARAM_OFFSET[b];
    if (typeof v === 'number') out[o] = v;
    else for (let k = 0; k < PARAM_COUNT[b]; k++) out[o + k] = v[k] ?? 0;
  }
  if (spec.hipsPos) for (let k = 0; k < 3; k++) out[SEM_HIPS_POS + k] = spec.hipsPos[k] ?? 0;
  return out;
}

/** Converts a flat semantic vector into bone quaternions (BONE_COUNT * 4) and a hips offset (3). */
export function semToQuats(sem: ArrayLike<number>, quats: Float32Array, qo = 0, pos?: Float32Array, po = 0) {
  for (let b = 0; b < BONE_COUNT; b++) boneQuat(b, sem, PARAM_OFFSET[b], quats, qo + b * 4);
  if (pos) {
    pos[po] = sem[SEM_HIPS_POS];
    pos[po + 1] = sem[SEM_HIPS_POS + 1];
    pos[po + 2] = sem[SEM_HIPS_POS + 2];
  }
}

/** Merge specs left to right (later wins per bone). */
export function mergePose(...specs: (PoseSpec | undefined)[]): PoseSpec {
  const out: PoseSpec = {};
  for (const s of specs) if (s) Object.assign(out, s);
  return out;
}

/** Swap left and right channels (values are already side-relative, so they carry over as is). */
export function mirrorPose(spec: PoseSpec): PoseSpec {
  const out: PoseSpec = {};
  for (const [k, v] of Object.entries(spec) as [keyof PoseSpec, Channel][]) {
    if (k === 'hipsPos') {
      const p = v as readonly number[];
      out.hipsPos = [-p[0], p[1], p[2]];
      continue;
    }
    const n = k as BoneName;
    if (BONE_KIND[BONES.indexOf(n)] === 'center' && typeof v !== 'number') {
      // Turning and leaning flip sides; bending forward does not.
      out[n] = [v[0], -(v[1] ?? 0), -(v[2] ?? 0)];
    } else {
      const m = n.endsWith('L') ? n.slice(0, -1) + 'R' : n.endsWith('R') ? n.slice(0, -1) + 'L' : n;
      out[m as BoneName] = v;
    }
  }
  return out;
}

/** Returns a list of channels in `sem` outside the joint limits (for tests). */
export function limitViolations(sem: ArrayLike<number>, slack = 0.5): string[] {
  const out: string[] = [];
  for (let b = 0; b < BONE_COUNT; b++) {
    const lim = BONE_LIMITS[b];
    for (let k = 0; k < lim.length; k++) {
      const v = sem[PARAM_OFFSET[b] + k];
      if (v < lim[k][0] - slack || v > lim[k][1] + slack) out.push(`${BONES[b]}[${k}]=${v.toFixed(1)}`);
    }
  }
  return out;
}
