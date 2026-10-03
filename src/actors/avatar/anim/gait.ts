/**
 * Parametric locomotion cycles.
 *
 * Each cycle is generated from foot trajectories, not joint curves: the stance foot's contact
 * point (heel → flat → ball) moves backward at exactly the body speed, so it never slides; the
 * swing foot follows a Hermite arc with a lift. Two-bone IK turns that into leg angles. The pelvis
 * height comes from the legs' reach (natural bob: low at double support, high at mid-stance),
 * plus a compression dip when running. Pelvis yaw/roll, counter-rotating shoulders, arm swing and a
 * level head complete the cycle.
 *
 * Phase convention for every cycle: 0 = left foot contact, 0.5 = right foot contact. Cycles of
 * different gaits and directions can therefore be blended at the same phase without the feet
 * fighting each other.
 */
import { B } from '../rig';
import { bakeFunction, type CompiledClip } from './clip';
import { REF_RIG, restAnkle, solveLeg, type FootTarget } from './ik';
import { PARAM_OFFSET, SEM_HIPS_POS, semZero } from './pose';

export interface GaitParams {
  /** Nominal speed (m/s) for the 1.75 m reference body. */
  speed: number;
  /** Seconds per cycle (two steps) at the nominal speed. */
  cycle: number;
  /** Stance fraction of the cycle per foot (walk ~0.6, run ~0.35). */
  duty: number;
  /** Peak ankle lift during swing (m). */
  lift: number;
  /** Swing progress (0..1) at which the lift peaks. */
  liftPeak: number;
  /** Pelvis lowered (m). */
  crouch: number;
  /** Extra compression dip at mid-stance (m, running). */
  bob: number;
  /** Forward lean of the torso (deg). */
  lean: number;
  pelvisYaw: number;
  pelvisRoll: number;
  sway: number;
  shoulderYaw: number;
  /** Arm swing amplitude (deg) and forward offset. */
  armSwing: number;
  armOffset: number;
  armOut: number;
  elbow: number;
  elbowSwing: number;
  /** Hands toward the midline on the forward swing (deg). */
  armCross: number;
  fist: number;
  heelStrike: number;
  toeOff: number;
  /** Step width between the feet (m, ankle centers). */
  width: number;
}

export const GAITS = {
  walk: {
    speed: 1.5, cycle: 1.02, duty: 0.6, lift: 0.1, liftPeak: 0.32, crouch: 0.01, bob: 0, lean: 3,
    pelvisYaw: 6, pelvisRoll: 4, sway: 0.02, shoulderYaw: 5, armSwing: 17, armOffset: 4, armOut: 7,
    elbow: 14, elbowSwing: 16, armCross: 4, fist: 28, heelStrike: 14, toeOff: 30, width: 0.17,
  },
  run: {
    speed: 4.0, cycle: 0.72, duty: 0.36, lift: 0.3, liftPeak: 0.34, crouch: 0.05, bob: 0.035, lean: 9,
    pelvisYaw: 10, pelvisRoll: 3, sway: 0.008, shoulderYaw: 9, armSwing: 38, armOffset: 12, armOut: 10,
    elbow: 80, elbowSwing: 18, armCross: 14, fist: 60, heelStrike: 6, toeOff: 38, width: 0.13,
  },
  sprint: {
    speed: 6.6, cycle: 0.62, duty: 0.3, lift: 0.42, liftPeak: 0.3, crouch: 0.065, bob: 0.04, lean: 15,
    pelvisYaw: 12, pelvisRoll: 3, sway: 0.004, shoulderYaw: 11, armSwing: 52, armOffset: 14, armOut: 10,
    elbow: 86, elbowSwing: 24, armCross: 16, fist: 70, heelStrike: 0, toeOff: 44, width: 0.11,
  },
  sneak: {
    speed: 1.3, cycle: 1.15, duty: 0.66, lift: 0.075, liftPeak: 0.4, crouch: 0.25, bob: 0, lean: 24,
    pelvisYaw: 4, pelvisRoll: 2, sway: 0.025, shoulderYaw: 3, armSwing: 8, armOffset: 22, armOut: 14,
    elbow: 45, elbowSwing: 8, armCross: 6, fist: 35, heelStrike: 6, toeOff: 22, width: 0.2,
  },
  turn: {
    speed: 0, cycle: 0.82, duty: 0.6, lift: 0.07, liftPeak: 0.45, crouch: 0.01, bob: 0, lean: 2,
    pelvisYaw: 3, pelvisRoll: 3, sway: 0.03, shoulderYaw: 0, armSwing: 4, armOffset: 4, armOut: 7,
    elbow: 14, elbowSwing: 4, armCross: 0, fist: 28, heelStrike: 0, toeOff: 8, width: 0.18,
  },
} satisfies Record<string, GaitParams>;

export type GaitName = keyof typeof GAITS;

/** The 8 directions (deg, + = toward the character's left): F, FL, L, BL, B, BR, R, FR. */
export const DIRECTIONS = [0, 45, 90, 135, 180, -135, -90, -45] as const;

const DEG = Math.PI / 180;

/** Hips yaw toward the movement direction (deg) for a direction angle. */
export function hipTurnFor(dirDeg: number): number {
  const a = ((dirDeg + 180) % 360 + 360) % 360 - 180;
  if (Math.abs(a) <= 90) return Math.max(-40, Math.min(40, a * 0.45));
  // Backward diagonals: the pelvis turns so its back faces the movement.
  const back = a > 0 ? a - 180 : a + 180;
  return Math.max(-40, Math.min(40, back * 0.6));
}

const hermite = (p0: number, p1: number, m0: number, m1: number, u: number) => {
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
};
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Foot pitch (deg, + toes up) during stance progress u for a forward gait. */
function stancePitch(g: GaitParams, u: number) {
  const flatAt = 0.16;
  const heelOff = 0.62;
  if (u < flatAt) return g.heelStrike * (1 - smooth(0, flatAt, u));
  if (u < heelOff) return 0;
  return -g.toeOff * smooth(heelOff, 1, u);
}

interface FootState {
  /** Ankle target (character space). */
  ax: number;
  ay: number;
  az: number;
  pitch: number;
  toe: number;
}

/**
 * Generate the foot state for a leg at phase phi (0 = this foot's contact).
 * `m` is the movement direction in character space, `f` the foot's facing (unit vectors in xz).
 */
function footAt(g: GaitParams, phi: number, side: 1 | -1, mx: number, mz: number, fx: number, fz: number, backward: boolean): FootState {
  const R = REF_RIG;
  const S = g.speed * g.cycle;
  const beta = g.duty;
  const ankleH = R.ankleH;
  const fwd = R.footFwd;
  const back = R.footBack;
  // Stance contact travel along m: strike ahead, toe-off behind.
  const strike = (beta * S) / 2 - 0.05 * S;
  const off = strike - beta * S;
  // Sideways travel widens the stance (more for longer strides) so the legs don't cross.
  const across = Math.abs(mx * fz - mz * fx);
  const lateral = side * (g.width / 2 + (S > 0 ? across * (0.05 + 0.035 * S) : 0));
  // Base point under the hip, offset sideways perpendicular to the facing.
  const bx = fz * lateral;
  const bz = -fx * lateral;
  const pitchAt = (u: number) => (backward ? -stancePitch(g, 1 - u) * 0.6 : stancePitch(g, u)) * (S > 0 ? 1 : 0);
  const contact = (u: number, out: FootState) => {
    const d = strike + (off - strike) * u;
    const gx = bx + mx * d;
    const gz = bz + mz * d;
    const gamma = pitchAt(u);
    const gr = gamma * DEG;
    let ax: number, ay: number, az: number;
    if (gamma >= 0) {
      // Heel pivot.
      const cx = gx - fx * back;
      const cz = gz - fz * back;
      const along = back * Math.cos(gr) - ankleH * Math.sin(gr);
      ay = ankleH * Math.cos(gr) + back * Math.sin(gr);
      ax = cx + fx * along;
      az = cz + fz * along;
    } else {
      const a = -gr;
      const cx = gx + fx * fwd;
      const cz = gz + fz * fwd;
      const along = ankleH * Math.sin(a) - fwd * Math.cos(a);
      ay = ankleH * Math.cos(a) + fwd * Math.sin(a);
      ax = cx + fx * along;
      az = cz + fz * along;
    }
    out.ax = ax;
    out.ay = ay;
    out.az = az;
    out.pitch = gamma;
    out.toe = gamma < 0 ? -gamma : 0;
    return out;
  };
  const st: FootState = { ax: 0, ay: 0, az: 0, pitch: 0, toe: 0 };
  phi = ((phi % 1) + 1) % 1;
  if (phi < beta) return contact(phi / beta, st);
  // Swing.
  const u = (phi - beta) / (1 - beta);
  const a0 = contact(1, { ax: 0, ay: 0, az: 0, pitch: 0, toe: 0 });
  const a1 = contact(0, { ax: 0, ay: 0, az: 0, pitch: 0, toe: 0 });
  const vRel = -(S / g.cycle) * (1 - beta) * g.cycle * 0.5;
  // Project the swing onto m for the Hermite, keep the lateral part linear.
  const p0 = a0.ax * mx + a0.az * mz;
  const p1 = a1.ax * mx + a1.az * mz;
  const along = S > 0 ? hermite(p0, p1, vRel, vRel, u) : p0;
  const l0x = a0.ax - p0 * mx, l0z = a0.az - p0 * mz;
  const l1x = a1.ax - p1 * mx, l1z = a1.az - p1 * mz;
  const lx = l0x + (l1x - l0x) * u;
  const lz = l0z + (l1z - l0z) * u;
  const gamma = Math.log(0.5) / Math.log(g.liftPeak);
  const bump = Math.sin(Math.PI * Math.pow(u, gamma));
  st.ax = lx + mx * along;
  st.az = lz + mz * along;
  st.ay = a0.ay + (a1.ay - a0.ay) * u + g.lift * bump;
  // Toes trail after push-off, then come up for the heel strike.
  const pm = backward ? -g.toeOff * 0.3 : -g.toeOff * 0.25;
  st.pitch = u < 0.5 ? a0.pitch + (pm - a0.pitch) * smooth(0, 0.5, u) : pm + (a1.pitch - pm) * smooth(0.5, 1, u);
  st.toe = Math.max(0, a0.toe * (1 - smooth(0, 0.3, u)));
  return st;
}

/** Writes the full-body semantic pose of a gait at phase p. */
export function gaitPose(g: GaitParams, dirDeg: number, p: number, out: Float32Array, hipsY?: number) {
  out.fill(0);
  const backward = Math.abs(dirDeg) > 90;
  const turn = hipTurnFor(dirDeg);
  const mx = Math.sin(dirDeg * DEG);
  const mz = Math.cos(dirDeg * DEG);
  const fx = Math.sin(turn * DEG);
  const fz = Math.cos(turn * DEG);
  const c = Math.cos(2 * Math.PI * p);
  const s = Math.sin(2 * Math.PI * p);
  // Pelvis.
  const yaw = -g.pelvisYaw * c * (backward ? -1 : 1);
  const roll = g.pelvisRoll * s;
  const H = PARAM_OFFSET[B.hips];
  out[H] = g.lean * 0.35 * (backward ? -0.4 : 1);
  out[H + 1] = turn + yaw;
  out[H + 2] = roll;
  out[SEM_HIPS_POS] = g.sway * s;
  out[SEM_HIPS_POS + 1] = hipsY ?? -g.crouch;
  out[SEM_HIPS_POS + 2] = g.crouch * 0.15;
  // Legs.
  const l = footAt(g, p, 1, mx, mz, fx, fz, backward);
  const r = footAt(g, p + 0.5, -1, mx, mz, fx, fz, backward);
  const lz0 = restAnkle('L')[2];
  const rz0 = restAnkle('R')[2];
  const target = (st: FootState): FootTarget => ({ x: st.ax, y: st.ay, z: st.az + (lz0 + rz0) / 2, pitch: st.pitch, yaw: turn });
  solveLeg(out, 'L', target(l), REF_RIG, l.toe);
  solveLeg(out, 'R', target(r), REF_RIG, r.toe);
  // In the air the ankle relaxes: soft-clamp extreme foot angles (the kicked-back shin of a run).
  for (const fb of [B.footL, B.footR]) {
    const o = PARAM_OFFSET[fb];
    const up = out[o];
    if (up > 28) out[o] = 28 + (up - 28) * 0.15;
    else if (up < -55) out[o] = -55 + (up + 55) * 0.15;
  }
  // Torso: counter-rotate shoulders, keep the head level and facing forward.
  const shoulderYaw = g.shoulderYaw * c * (backward ? -1 : 1);
  const torsoTurn = shoulderYaw - (turn + yaw);
  const SP = PARAM_OFFSET[B.spine];
  const CH = PARAM_OFFSET[B.chest];
  const NK = PARAM_OFFSET[B.neck];
  const HD = PARAM_OFFSET[B.head];
  const lean = g.lean * (backward ? -0.3 : 1);
  out[SP] = lean * 0.45 - out[H] * 0.5;
  out[SP + 1] = torsoTurn * 0.45;
  out[SP + 2] = -roll * 0.6;
  out[CH] = lean * 0.35;
  out[CH + 1] = torsoTurn * 0.55;
  out[CH + 2] = -roll * 0.35;
  out[NK] = -lean * 0.35 + 4;
  out[NK + 1] = -shoulderYaw * 0.5;
  out[HD] = -lean * 0.45 - 2 + 1.5 * Math.cos(4 * Math.PI * p);
  out[HD + 1] = -shoulderYaw * 0.5;
  out[HD + 2] = -out[SP + 2] * 0.3;
  // Arms swing opposite the legs.
  for (const side of [1, -1]) {
    const k = side > 0 ? 'L' : 'R';
    const sw = -side * c * (backward ? -1 : 1);
    const ua = PARAM_OFFSET[B[`upperArm${k}`]];
    const fa = PARAM_OFFSET[B[`forearm${k}`]];
    const ha = PARAM_OFFSET[B[`hand${k}`]];
    const sh = PARAM_OFFSET[B[`shoulder${k}`]];
    const fwdK = Math.max(0, sw);
    out[ua] = g.armOffset + g.armSwing * sw;
    out[ua + 1] = g.armOut;
    out[ua + 2] = -g.armCross * fwdK;
    out[ua + 3] = 12;
    out[fa] = g.elbow + g.elbowSwing * fwdK;
    out[fa + 1] = 15;
    out[ha] = 8;
    out[sh] = 0;
    out[sh + 1] = 3 * sw;
    out[PARAM_OFFSET[B[`fingers${k}`]]] = g.fist;
    out[PARAM_OFFSET[B[`index${k}`]]] = g.fist * 0.8;
  }
}

/** Pelvis height curve for a gait: limited by leg reach, smoothed, plus a running dip. */
function hipsCurve(g: GaitParams, dirDeg: number, n: number): Float32Array {
  const sem = semZero();
  const out = new Float32Array(n);
  const L = (REF_RIG.thigh + REF_RIG.shin) * 0.985;
  const maxY = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i / n;
    gaitPose(g, dirDeg, p, sem, -g.crouch);
    // Highest pelvis offset that keeps both ankles within reach (iterate a little).
    let y = -g.crouch;
    for (let it = 0; it < 4; it++) {
      let worst = Infinity;
      for (const side of ['L', 'R'] as const) {
        const st = side === 'L' ? footAtPhase(g, dirDeg, p, 1) : footAtPhase(g, dirDeg, p + 0.5, -1);
        const J = REF_RIG.joints;
        const tb = B[side === 'L' ? 'thighL' : 'thighR'];
        const hipX = J[tb * 3] + sem[SEM_HIPS_POS];
        const hipZ = J[tb * 3 + 2] + sem[SEM_HIPS_POS + 2];
        const dx = st.ax - hipX;
        const dz = st.az + REF_RIG.joints[B.footL * 3 + 2] - hipZ;
        const h2 = L * L - dx * dx - dz * dz;
        const hipJointY = st.ay + Math.sqrt(Math.max(0.01, h2));
        const allowed = hipJointY - J[tb * 3 + 1];
        worst = Math.min(worst, allowed);
      }
      y = Math.min(-g.crouch, worst);
    }
    maxY[i] = y;
  }
  // Cyclic smoothing (twice), then never exceed the reach limit.
  let cur = Float32Array.from(maxY);
  for (let pass = 0; pass < 3; pass++) {
    const nxt = new Float32Array(n);
    for (let i = 0; i < n; i++) nxt[i] = (cur[(i - 2 + n) % n] + 2 * cur[(i - 1 + n) % n] + 3 * cur[i] + 2 * cur[(i + 1) % n] + cur[(i + 2) % n]) / 9;
    cur = nxt;
  }
  for (let i = 0; i < n; i++) {
    const p = i / n;
    // Running: compress at mid-stance of each foot.
    const dip = g.bob * 0.5 * (1 + Math.cos(4 * Math.PI * (p - g.duty / 2)));
    out[i] = Math.min(cur[i] - dip, maxY[i] - 0.004);
  }
  return out;
}

function footAtPhase(g: GaitParams, dirDeg: number, p: number, side: 1 | -1) {
  const turn = hipTurnFor(dirDeg);
  return footAt(g, p, side, Math.sin(dirDeg * DEG), Math.cos(dirDeg * DEG), Math.sin(turn * DEG), Math.cos(turn * DEG), Math.abs(dirDeg) > 90);
}

/** Bake a gait cycle for a direction into a looping clip. */
export function bakeGait(name: string, g: GaitParams, dirDeg: number): CompiledClip {
  const N = 48;
  const hy = hipsCurve(g, dirDeg, N);
  return bakeFunction(name, g.cycle, true, (t, out) => {
    const p = t / g.cycle;
    const f = p * N;
    const i = Math.floor(f) % N;
    const a = f - Math.floor(f);
    const y = hy[i] + (hy[(i + 1) % N] - hy[i]) * a;
    gaitPose(g, dirDeg, p, out, y);
  }, 40);
}

