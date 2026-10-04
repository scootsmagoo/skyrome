/**
 * Arm IK, applied after the pose is blended:
 *
 * - Two-handed grips: the left hand rides the weapon's shaft (leftHandOnShaft).
 * - fistTo: put either fist's grip point at a character-space target with its grip axis along a
 *   direction (the bow hand hooking the string at the jaw, the first-person weapon hand in view).
 *
 * Forward kinematics of the blended pose gives joint positions, a two-bone solve (elbow toward a
 * pole) rewrites upperArm/forearm, and the forearm twists so the fist's grip axis (+Z of the hand)
 * lines up with the wanted direction. Character space, rig-scaled; allocation-free.
 */
import { B, BONE_COUNT, PARENT_INDEX, type Rig } from '../rig';
import type { Pose } from './clip';
import { qInvert, qMul, qRotate, qAxis, qNlerp } from './quat';

const gq = new Float32Array(BONE_COUNT * 4);
const gp = new Float32Array(BONE_COUNT * 3);
const t4 = new Float32Array(4);
const t4b = new Float32Array(4);
const t4c = new Float32Array(4);
const inv = new Float32Array(4);
const v3 = new Float32Array(3);
const tgt = new Float32Array(4);
const savedQ = new Float32Array(20);
const armBones = new Int32Array(5);

/** Global (character-space) rotations and joint positions for a pose. */
export function forwardKinematics(p: Pose, rig: Rig, legScale: number) {
  const J = rig.joints;
  for (let b = 0; b < BONE_COUNT; b++) {
    const par = PARENT_INDEX[b];
    if (par < 0) {
      gq.set(p.q.subarray(0, 4), 0);
      gp[0] = J[0] + p.p[0] * legScale;
      gp[1] = J[1] + p.p[1] * legScale;
      gp[2] = J[2] + p.p[2] * legScale;
      continue;
    }
    qMul(gq, b * 4, gq, par * 4, p.q, b * 4);
    qRotate(v3, 0, gq, par * 4, J[b * 3] - J[par * 3], J[b * 3 + 1] - J[par * 3 + 1], J[b * 3 + 2] - J[par * 3 + 2]);
    gp[b * 3] = gp[par * 3] + v3[0];
    gp[b * 3 + 1] = gp[par * 3 + 1] + v3[1];
    gp[b * 3 + 2] = gp[par * 3 + 2] + v3[2];
  }
}

/** Results of the last forwardKinematics(): global rotation (xyzw) and position of a bone. */
export const fk = {
  q: gq as Readonly<Float32Array>,
  p: gp as Readonly<Float32Array>,
  /** A point given in a bone's frame (meters), to character space. */
  point(bone: number, x: number, y: number, z: number, out: Float32Array | number[]) {
    qRotate(v3, 0, gq, bone * 4, x, y, z);
    out[0] = gp[bone * 3] + v3[0];
    out[1] = gp[bone * 3 + 1] + v3[1];
    out[2] = gp[bone * 3 + 2] + v3[2];
    return out;
  },
  /** A direction given in a bone's frame, to character space. */
  dir(bone: number, x: number, y: number, z: number, out: Float32Array | number[]) {
    qRotate(v3, 0, gq, bone * 4, x, y, z);
    out[0] = v3[0];
    out[1] = v3[1];
    out[2] = v3[2];
    return out;
  },
};

/** One arm: its bones, its fist's grip point (hand frame, reference meters) and finger-curl sign. */
export interface ArmSide {
  shoulder: number;
  upperArm: number;
  forearm: number;
  hand: number;
  fingers: number;
  index: number;
  grip: readonly [number, number, number];
  /** Sign of a finger curl about the hand's Z axis (mirrored between the sides). */
  curl: number;
}

/** Grip points match the gripL/gripR sockets (HumanoidAvatar). */
export const ARM_LEFT: ArmSide = { shoulder: B.shoulderL, upperArm: B.upperArmL, forearm: B.forearmL, hand: B.handL, fingers: B.fingersL, index: B.indexL, grip: [-0.026, -0.08, 0.002], curl: -1 };
export const ARM_RIGHT: ArmSide = { shoulder: B.shoulderR, upperArm: B.upperArmR, forearm: B.forearmR, hand: B.handR, fingers: B.fingersR, index: B.indexR, grip: [0.026, -0.08, 0.002], curl: 1 };

export interface GripSpec {
  /** Grip offset in the right hand's frame (m) and the weapon's +Y direction in that frame. */
  gripPos: [number, number, number];
  gripDir: [number, number, number];
  /** Where the left wrist goes along the shaft from the right grip (m, + toward the head). */
  offset: number;
}

/** Elbow pole for the left hand on a shaft: down, out and a little back (chest frame). */
const SHAFT_POLE: readonly [number, number, number] = [0.45, -1, -0.25];

/**
 * Pull the left hand onto the shaft with weight w (0..1). Runs forwardKinematics itself.
 */
export function leftHandOnShaft(p: Pose, rig: Rig, legScale: number, spec: GripSpec, w: number) {
  if (w <= 0.001) return;
  forwardKinematics(p, rig, legScale);
  const s = rig.s;
  // Right grip and shaft direction in character space.
  const hR = B.handR;
  qRotate(v3, 0, gq, hR * 4, spec.gripPos[0] * s, spec.gripPos[1] * s, spec.gripPos[2] * s);
  const gx = gp[hR * 3] + v3[0];
  const gy = gp[hR * 3 + 1] + v3[1];
  const gz = gp[hR * 3 + 2] + v3[2];
  qRotate(v3, 0, gq, hR * 4, spec.gripDir[0], spec.gripDir[1], spec.gripDir[2]);
  const dx = v3[0], dy = v3[1], dz = v3[2];
  // The left grip point on the shaft: as far along as `offset`, but no further than the left arm
  // can reach (the point of the shaft nearest the shoulder, plus a little).
  const ua0 = B.upperArmL;
  const near = (gp[ua0 * 3] - gx) * dx + (gp[ua0 * 3 + 1] - gy) * dy + (gp[ua0 * 3 + 2] - gz) * dz;
  const reach = (rig.upperArm + rig.forearm + 0.07 * s) * 0.97;
  let off = spec.offset * s;
  for (let k = 0; k < 8; k++) {
    const px = gx + dx * off - gp[ua0 * 3], py = gy + dy * off - gp[ua0 * 3 + 1], pz = gz + dz * off - gp[ua0 * 3 + 2];
    if (Math.hypot(px, py, pz) <= reach || off <= Math.max(0.16 * s, near)) break;
    off = Math.max(Math.max(0.16 * s, near), off - 0.03 * s);
  }
  solveFist(p, rig, legScale, ARM_LEFT, gx + dx * off, gy + dy * off, gz + dz * off, dx, dy, dz, SHAFT_POLE, w, 85);
}

/**
 * Put `arm`'s grip point at (tx, ty, tz) (character space) with the fist's grip axis along
 * (ax, ay, az), the elbow bending toward `pole` (a direction in the chest's frame), blended with
 * weight w. The fingers close by `curlDeg`. Runs forwardKinematics itself.
 */
export function fistTo(
  p: Pose,
  rig: Rig,
  legScale: number,
  arm: ArmSide,
  tx: number,
  ty: number,
  tz: number,
  ax: number,
  ay: number,
  az: number,
  pole: readonly [number, number, number],
  w: number,
  curlDeg = 85,
) {
  if (w <= 0.001) return;
  forwardKinematics(p, rig, legScale);
  solveFist(p, rig, legScale, arm, tx, ty, tz, ax, ay, az, pole, w, curlDeg);
}

/** Shared by leftHandOnShaft and fistTo; expects forwardKinematics() to be current. */
function solveFist(
  p: Pose,
  rig: Rig,
  legScale: number,
  arm: ArmSide,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  pole: readonly [number, number, number],
  w: number,
  curlDeg: number,
) {
  const s = rig.s;
  const bones = armBones;
  bones[0] = arm.upperArm;
  bones[1] = arm.forearm;
  bones[2] = arm.hand;
  bones[3] = arm.fingers;
  bones[4] = arm.index;
  for (let k = 0; k < 5; k++) savedQ.set(p.q.subarray(bones[k] * 4, bones[k] * 4 + 4), k * 4);
  // First guess: aim the wrist a hand's length short of the grip along the forearm.
  const res = solve(arm, ox, oy + 0.07 * s, oz, rig, s, pole);
  let tx = ox - res[0] * 0.075 * s;
  let ty = oy - res[1] * 0.075 * s;
  let tz = oz - res[2] * 0.075 * s;
  // Solve, measure where the fist actually lands (FK), shift the wrist target by the error, repeat.
  const g = arm.grip;
  for (let pass = 0; pass < 3; pass++) {
    solve(arm, tx, ty, tz, rig, s, pole);
    finish(arm, p, dx, dy, dz, curlDeg);
    forwardKinematics(p, rig, legScale);
    qRotate(v3, 0, gq, arm.hand * 4, g[0] * s, g[1] * s, g[2] * s);
    const ex = ox - (gp[arm.hand * 3] + v3[0]);
    const ey = oy - (gp[arm.hand * 3 + 1] + v3[1]);
    const ez = oz - (gp[arm.hand * 3 + 2] + v3[2]);
    if (ex * ex + ey * ey + ez * ez < 1e-5) break;
    tx += ex;
    ty += ey;
    tz += ez;
  }
  if (w < 0.999) {
    // Blend the solved arm with the authored one.
    for (let k = 0; k < 5; k++) {
      const bone = bones[k];
      t4.set(p.q.subarray(bone * 4, bone * 4 + 4));
      p.q.set(savedQ.subarray(k * 4, k * 4 + 4), bone * 4);
      qNlerp(p.q, bone * 4, p.q, bone * 4, t4, 0, w);
    }
  }
}

let u1x = 0, u1y = -1, u1z = 0, u2x = 0, u2y = -1, u2z = 0;
const solved: [number, number, number] = [0, 0, 0];

/** Two-bone solve from the shoulder joint toward the wrist target; returns the forearm direction. */
function solve(arm: ArmSide, tx: number, ty: number, tz: number, rig: Rig, s: number, pole: readonly [number, number, number]): [number, number, number] {
  const ua = arm.upperArm;
  const sx = gp[ua * 3], sy = gp[ua * 3 + 1], sz = gp[ua * 3 + 2];
  const L1 = rig.upperArm;
  const L2 = rig.forearm + 0.02 * s;
  let ex = tx - sx, ey = ty - sy, ez = tz - sz;
  let d = Math.hypot(ex, ey, ez) || 1e-4;
  ex /= d;
  ey /= d;
  ez /= d;
  d = Math.min(d, (L1 + L2) * 0.999);
  // The pole is given in the chest's frame, so it turns with the torso.
  qRotate(v3, 0, gq, B.chest * 4, pole[0], pole[1], pole[2]);
  let px = v3[0], py = v3[1], pz = v3[2];
  const pd = px * ex + py * ey + pz * ez;
  px -= pd * ex;
  py -= pd * ey;
  pz -= pd * ez;
  const pl = Math.hypot(px, py, pz) || 1;
  px /= pl;
  py /= pl;
  pz /= pl;
  const a = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  u1x = Math.cos(a) * ex + Math.sin(a) * px;
  u1y = Math.cos(a) * ey + Math.sin(a) * py;
  u1z = Math.cos(a) * ez + Math.sin(a) * pz;
  const elx = sx + u1x * L1, ely = sy + u1y * L1, elz = sz + u1z * L1;
  u2x = tx - elx;
  u2y = ty - ely;
  u2z = tz - elz;
  const l2 = Math.hypot(u2x, u2y, u2z) || 1;
  u2x /= l2;
  u2y /= l2;
  u2z /= l2;
  solved[0] = u2x;
  solved[1] = u2y;
  solved[2] = u2z;
  return solved;
}

/** Write the solved arm into the pose: upper arm, forearm (flex + twist), neutral wrist, closed fist. */
function finish(arm: ArmSide, p: Pose, dx: number, dy: number, dz: number, curlDeg: number) {
  const ua = arm.upperArm;
  // Hinge K = u2 × u1 (bind: arm down, forearm forward → +X).
  let kx = u2y * u1z - u2z * u1y;
  let ky = u2z * u1x - u2x * u1z;
  let kz = u2x * u1y - u2y * u1x;
  const kl = Math.hypot(kx, ky, kz);
  if (kl < 1e-4) {
    kx = 1;
    ky = 0;
    kz = 0;
  } else {
    kx /= kl;
    ky /= kl;
    kz /= kl;
  }
  // Upper arm global rotation: bind -Y → u1, bind +X → K.
  basisQuat(kx, ky, kz, -u1x, -u1y, -u1z, tgt);
  // Local = parent(shoulder)^-1 * global.
  qInvert(inv, 0, gq, arm.shoulder * 4);
  qMul(t4, 0, inv, 0, tgt, 0);
  // Forearm: flex about the upper arm's local X by the angle between u1 and u2.
  const flex = Math.acos(Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y + u1z * u2z)));
  qAxis(t4b, 0, 0, -flex);
  // Twist the forearm so the fist's grip axis (+Z of the hand) lines up with the wanted direction.
  qMul(t4c, 0, tgt, 0, t4b, 0); // forearm global (without twist)
  qRotate(v3, 0, t4c, 0, 0, 0, 1);
  let zx = v3[0], zy = v3[1], zz = v3[2];
  // Project the direction onto the plane ⟂ forearm.
  const sd = dx * u2x + dy * u2y + dz * u2z;
  let qx = dx - sd * u2x, qy = dy - sd * u2y, qz = dz - sd * u2z;
  const ql = Math.hypot(qx, qy, qz) || 1;
  qx /= ql;
  qy /= ql;
  qz /= ql;
  const zd = zx * u2x + zy * u2y + zz * u2z;
  zx -= zd * u2x;
  zy -= zd * u2y;
  zz -= zd * u2z;
  const cross = (zy * qz - zz * qy) * -u2x + (zz * qx - zx * qz) * -u2y + (zx * qy - zy * qx) * -u2z;
  const twist = Math.atan2(cross, zx * qx + zy * qy + zz * qz);
  const tw = Math.max(-1.6, Math.min(1.6, twist));
  qAxis(t4c, 0, 1, tw);
  qMul(t4b, 0, t4b, 0, t4c, 0);
  p.q.set(t4, ua * 4);
  p.q.set(t4b, arm.forearm * 4);
  // Neutral wrist, closed fist.
  p.q[arm.hand * 4] = 0;
  p.q[arm.hand * 4 + 1] = 0;
  p.q[arm.hand * 4 + 2] = 0;
  p.q[arm.hand * 4 + 3] = 1;
  qAxis(t4, 0, 2, (arm.curl * curlDeg * Math.PI) / 180);
  p.q.set(t4, arm.fingers * 4);
  p.q.set(t4, arm.index * 4);
}

/** Quaternion from the images of the X and Y axes (Z = X × Y). */
function basisQuat(xx: number, xy: number, xz: number, yx: number, yy: number, yz: number, out: Float32Array) {
  const zx = xy * yz - xz * yy;
  const zy = xz * yx - xx * yz;
  const zz = xx * yy - xy * yx;
  const m00 = xx, m01 = yx, m02 = zx;
  const m10 = xy, m11 = yy, m12 = zy;
  const m20 = xz, m21 = yz, m22 = zz;
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
