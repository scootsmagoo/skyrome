/**
 * Two-bone leg IK on the reference body, producing semantic leg angles (anim/pose.ts).
 *
 * Clips are baked against the 1.75 m reference rig; joint angles transfer to other bodies and
 * foot travel scales with leg length (the controller scales the hips offset and playback rate to
 * match). Feet authored as ground positions therefore stay planted for every body size.
 */
import { B, computeRig, type Rig } from '../rig';
import { PARAM_OFFSET, SEM_HIPS_POS, boneQuat } from './pose';
import { qInvert, qMul, qRotate } from './quat';

export const REF_RIG: Rig = computeRig({ height: 1.75, sex: 'male', build: 'average', age: 'adult' });

const DEG = 180 / Math.PI;
const qh = new Float32Array(4);
const qhi = new Float32Array(4);
const qt = new Float32Array(4);
const qs = new Float32Array(4);
const qacc = new Float32Array(4);
const qtmp = new Float32Array(4);
const v = new Float32Array(3);

export interface FootTarget {
  /** Ankle position in character space (m). */
  x: number;
  y: number;
  z: number;
  /** World pitch of the foot, degrees (+ toes up). */
  pitch: number;
  /** World yaw of the foot, degrees (+ toward the character's left). */
  yaw: number;
}

/** Rest ankle position of a leg in character space (reference body). */
export function restAnkle(side: 'L' | 'R', rig: Rig = REF_RIG): [number, number, number] {
  const i = B[side === 'L' ? 'footL' : 'footR'] * 3;
  return [rig.joints[i], rig.joints[i + 1], rig.joints[i + 2]];
}

/**
 * Solve one leg so the ankle reaches `t`, writing thigh/shin/foot/toe semantic values into `sem`.
 * Uses the hips rotation and offset already present in `sem`. Returns the reach ratio (>1 = clamped).
 */
export function solveLeg(sem: Float32Array, side: 'L' | 'R', t: FootTarget, rig: Rig = REF_RIG, toeUp = 0): number {
  const J = rig.joints;
  const L1 = rig.thigh;
  const L2 = rig.shin;
  const right = side === 'R';
  const thighB = B[right ? 'thighR' : 'thighL'];
  // Hips orientation.
  boneQuat(B.hips, sem, PARAM_OFFSET[B.hips], qh, 0);
  qInvert(qhi, 0, qh, 0);
  const hx = J[0] + sem[SEM_HIPS_POS];
  const hy = J[1] + sem[SEM_HIPS_POS + 1];
  const hz = J[2] + sem[SEM_HIPS_POS + 2];
  qRotate(v, 0, qh, 0, J[thighB * 3] - J[0], J[thighB * 3 + 1] - J[1], J[thighB * 3 + 2] - J[2]);
  const jx = hx + v[0];
  const jy = hy + v[1];
  const jz = hz + v[2];
  // Hip→ankle in the hips frame; mirror the right leg into left-leg space.
  qRotate(v, 0, qhi, 0, t.x - jx, t.y - jy, t.z - jz);
  let dx = v[0];
  const dy = v[1];
  const dz = v[2];
  if (right) dx = -dx;
  let d = Math.hypot(dx, dy, dz);
  const maxD = (L1 + L2) * 0.9995;
  const minD = Math.abs(L1 - L2) + 0.05;
  const ratio = d / maxD;
  const dd = Math.min(maxD, Math.max(minD, d));
  const e1x = dx / d, e1y = dy / d, e1z = dz / d;
  d = dd;
  // Knee faces the foot direction (yaw relative to the hips).
  const hipsTurn = sem[PARAM_OFFSET[B.hips] + 1];
  let fyaw = (t.yaw - hipsTurn) / DEG;
  if (right) fyaw = -fyaw;
  let fx = Math.sin(fyaw), fz = Math.cos(fyaw), fy = 0;
  const fd = fx * e1x + fy * e1y + fz * e1z;
  fx -= fd * e1x;
  fy -= fd * e1y;
  fz -= fd * e1z;
  const fl = Math.hypot(fx, fy, fz) || 1;
  const e2x = fx / fl, e2y = fy / fl, e2z = fz / fl;
  const cosA = Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
  const a = Math.acos(cosA);
  const tx = Math.cos(a) * e1x + Math.sin(a) * e2x;
  const ty = Math.cos(a) * e1y + Math.sin(a) * e2y;
  const tz = Math.cos(a) * e1z + Math.sin(a) * e2z;
  const cosK = Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2)));
  const knee = Math.PI - Math.acos(cosK);
  // Thigh rotation: maps bind -Y to the thigh direction and bind +X to the knee hinge K = e2 × dir.
  let kx = e2y * tz - e2z * ty;
  let ky = e2z * tx - e2x * tz;
  let kz = e2x * ty - e2y * tx;
  const kl = Math.hypot(kx, ky, kz) || 1;
  kx /= kl;
  ky /= kl;
  kz /= kl;
  // Basis columns: X = K, Y = -dir, Z = K × Y
  const Yx = -tx, Yy = -ty, Yz = -tz;
  const Zx = ky * Yz - kz * Yy;
  const Zy = kz * Yx - kx * Yz;
  const Zz = kx * Yy - ky * Yx;
  matToQuat(kx, Yx, Zx, ky, Yy, Zy, kz, Yz, Zz, qt);
  // Decompose into the thigh recipe: q = Rx(-flex) Rz(abd) Ry(twist).
  // Respect the hip's range: crossing legs (strafes) stop at the adduction limit.
  const abd = Math.max(-29 / DEG, Math.min(78 / DEG, Math.asin(Math.max(-1, Math.min(1, tx)))));
  const flex = Math.max(-48 / DEG, Math.min(133 / DEG, Math.atan2(tz, -ty)));
  const o = PARAM_OFFSET[thighB];
  sem[o] = flex * DEG;
  sem[o + 1] = abd * DEG;
  sem[o + 2] = 0;
  // Twist residual: (Rx(-flex) Rz(abd))^-1 * qt
  sem[o + 2] = 0;
  boneQuat(B.thighL, sem, o, qacc, 0, false);
  qInvert(qtmp, 0, qacc, 0);
  qMul(qtmp, 0, qtmp, 0, qt, 0);
  const twist = 2 * Math.atan2(qtmp[1], qtmp[3]);
  // Beyond the hip's rotation range the foot turns with the knee instead (it pivots).
  sem[o + 2] = Math.max(-48, Math.min(62, wrapDeg(twist * DEG)));
  const shinB = B[right ? 'shinR' : 'shinL'];
  sem[PARAM_OFFSET[shinB]] = knee * DEG;
  // Foot: desired world orientation (yaw, pitch) relative to the shin's world orientation.
  // Shin world quat = hips * thigh(mirrored) * shin. Compute in left-leg space for the mirrored case.
  const footB = B[right ? 'footR' : 'footL'];
  boneQuat(thighB, sem, o, qacc, 0);
  boneQuat(shinB, sem, PARAM_OFFSET[shinB], qs, 0);
  qMul(qacc, 0, qh, 0, qacc, 0);
  qMul(qacc, 0, qacc, 0, qs, 0);
  qInvert(qtmp, 0, qacc, 0);
  // Desired foot forward in character space.
  const p = t.pitch / DEG;
  const y = t.yaw / DEG;
  const wx = Math.sin(y) * Math.cos(p);
  const wy = Math.sin(p);
  const wz = Math.cos(y) * Math.cos(p);
  qRotate(v, 0, qtmp, 0, wx, wy, wz);
  // In the shin frame the foot recipe is Rx(-up) (Rz(-roll) ignored): forward = (0, sin up, cos up).
  const up = Math.atan2(v[1], Math.hypot(v[2], v[0]) * Math.sign(v[2] || 1));
  sem[PARAM_OFFSET[footB]] = up * DEG;
  sem[PARAM_OFFSET[footB] + 1] = 0;
  sem[PARAM_OFFSET[B[right ? 'toeR' : 'toeL']]] = toeUp;
  return ratio;
}

function wrapDeg(a: number) {
  a = ((a + 180) % 360 + 360) % 360 - 180;
  return a;
}

/** Rotation matrix (row-major m00..m22) → quaternion. */
function matToQuat(m00: number, m01: number, m02: number, m10: number, m11: number, m12: number, m20: number, m21: number, m22: number, out: Float32Array) {
  const tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    w = 0.25 / s;
    x = (m21 - m12) * s;
    y = (m02 - m20) * s;
    z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  out[0] = x;
  out[1] = y;
  out[2] = z;
  out[3] = w;
}

/**
 * Forward kinematics on the reference body: world (character-space) position of a bone joint
 * for a semantic pose. Used by tests (foot planting) and pose queries.
 */
export function jointWorld(sem: Float32Array, bone: number, rig: Rig = REF_RIG): [number, number, number] {
  const chain: number[] = [];
  const parents = PARENTS;
  for (let b = bone; b >= 0; b = parents[b]) chain.unshift(b);
  const J = rig.joints;
  let px = J[0] + sem[SEM_HIPS_POS];
  let py = J[1] + sem[SEM_HIPS_POS + 1];
  let pz = J[2] + sem[SEM_HIPS_POS + 2];
  const q = new Float32Array([0, 0, 0, 1]);
  const ql = new Float32Array(4);
  for (let k = 0; k < chain.length; k++) {
    const b = chain[k];
    if (k > 0) {
      const p = chain[k - 1];
      qRotate(v, 0, q, 0, J[b * 3] - J[p * 3], J[b * 3 + 1] - J[p * 3 + 1], J[b * 3 + 2] - J[p * 3 + 2]);
      px += v[0];
      py += v[1];
      pz += v[2];
    }
    boneQuat(b, sem, PARAM_OFFSET[b], ql, 0);
    qMul(q, 0, q, 0, ql, 0);
  }
  return [px, py, pz];
}

import { PARENT_INDEX } from '../rig';
const PARENTS = PARENT_INDEX;
