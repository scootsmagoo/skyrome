/**
 * Runtime foot IK: plants the feet on stairs, kerbs and slopes.
 *
 * The clips are baked for flat ground. After the pose is blended, this reads the ground under each
 * foot (a ray per foot through a `GroundProbe`, a few times a second), then
 *  - lowers the pelvis so the lower foot can reach (never raises it: the baked hip curve already
 *    sits at the legs' reach, so raising it would fight that limit),
 *  - moves each planted ankle by the height difference of its ground, and lifts a swinging foot
 *    just enough to clear a riser,
 *  - tilts a planted foot to the ground's slope.
 * The legs are re-solved analytically (two-bone, the knee keeps its bend plane), so a flat floor
 * leaves the pose untouched. Ground samples are kept in world height, so a foot that stays put
 * while the body climbs keeps its height; no rays are cast for a standing figure whose ground is
 * level. Allocation-free.
 */
import { B, PARENT_INDEX, type Rig } from '../rig';
import type { Pose } from './clip';
import { fk, forwardKinematics } from './armIK';
import { qFromUnitVectors, qInvert, qMul, qNlerp, qRotate } from './quat';

/** The ground under a point: world height and surface normal in the character's frame. */
export interface GroundSample {
  y: number;
  nx: number;
  ny: number;
  nz: number;
}

/** Looks up the ground at a point in the character's frame (x to the left, z forward). False = none in reach. */
export type GroundProbe = (lx: number, lz: number, out: GroundSample) => boolean;

/** Largest ground step the IK follows (m): stairs and kerbs, not ledges. */
const MAX_OFFSET = 0.4;
/** Share of the lowest planted foot's drop that the pelvis takes (the rest is leg stretch). */
const PELVIS_SHARE = 0.9;
/** Ground steeper than this (normal.y below it) is a wall edge, not a slope to match. */
const MIN_NORMAL_Y = 0.72;
/** How far ahead of a foot the ground is read (s of travel): a swinging foot needs to know what it lands on. */
const LOOKAHEAD = 0.06;
/** Climbing: a step is shortened so the feet land about this far apart in height (m), but never below MIN_STRIDE of the baked stride. */
const STEP_RISE = 0.3;
const MIN_STRIDE = 0.62;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

interface Foot {
  /** Ground height (world) under the foot, and its normal; valid after the first sample. */
  gy: number;
  nx: number;
  ny: number;
  nz: number;
  valid: boolean;
  /** Smoothed ground offset from the actor's feet plane (m) and smoothed contact. */
  off: number;
  /** Effective offset this update (offset × planted × weight). */
  eff: number;
  planted: number;
}

const newFoot = (): Foot => ({ gy: 0, nx: 0, ny: 1, nz: 0, valid: false, off: 0, eff: 0, planted: 0 });

// Scratch (module level: one avatar solves at a time).
const sample: GroundSample = { y: 0, nx: 0, ny: 1, nz: 0 };
const qa = new Float32Array(4);
const qb = new Float32Array(4);
const qc = new Float32Array(4);
const qd = new Float32Array(4);
const qe = new Float32Array(4);
const qid = new Float32Array([0, 0, 0, 1]);
const gq = new Float32Array(4);
const vv = new Float32Array(3);

export class FootIk {
  /** Smoothed overall weight (0..1). */
  weight = 0;
  /** Rays cast so far (tests and the perf report). */
  rays = 0;
  /** Current pelvis drop (m, <= 0). */
  drop = 0;
  /** True while the last update changed the pose. */
  active = false;
  private readonly feet = [newFoot(), newFoot()];
  /** Share of the baked stride in use (1 on the flat; less up and down a staircase). The controller scales its phase rate by it. */
  stride = 1;
  private strideGoal = 1;
  private since = Math.random() * 0.05;
  private level = true;
  /** Ankle targets in the character's horizontal plane (the stride-scaled feet). */
  private readonly tx = new Float32Array(2);
  private readonly tz = new Float32Array(2);

  /** Forget the ground (a teleport, a long pause). */
  reset() {
    for (const f of this.feet) Object.assign(f, newFoot());
    this.drop = 0;
    this.weight = 0;
    this.since = 0.05;
    this.active = false;
    this.stride = 1;
  }

  /** Ground offsets (m, relative to the feet plane) of the left and right foot, for tests. */
  offsets(): [number, number] {
    return [this.feet[0].off, this.feet[1].off];
  }

  /**
   * Adjust `p` (the final blended pose) in place.
   * @param want       target weight (0 = off: airborne, seated, falling)
   * @param interval   seconds between ground samples (0 = every call)
   * @param rootY      world height of the actor's feet plane
   * @param vx,vz      character-frame velocity (m/s, x left, z forward) for looking ahead
   */
  apply(p: Pose, rig: Rig, legScale: number, dt: number, want: number, interval: number, probe: GroundProbe | null, rootY: number, vx: number, vz: number) {
    this.active = false;
    this.weight += (want - this.weight) * damp(want > this.weight ? 9 : 14, dt);
    if (want <= 0 && this.weight < 0.01) {
      this.weight = 0;
      this.drop = 0;
      this.stride = 1;
      return;
    }
    if (!probe) return;
    const W = this.weight;
    const J = rig.joints;
    // A figure standing on level ground needs no per-frame work, only the occasional re-check.
    const still = vx * vx + vz * vz < 0.0025;
    this.since += dt;
    const due = this.since >= (still && this.level ? Math.max(interval, 0.25) : interval);
    if (!due && still && this.level && Math.abs(this.drop) < 0.002) return;
    forwardKinematics(p, rig, legScale);
    // Steps shorten on a staircase: the ankles' travel along the way of walking is scaled about the hips.
    const speed = Math.hypot(vx, vz);
    const mx = speed > 0.4 ? vx / speed : 0;
    const mz = speed > 0.4 ? vz / speed : 0;
    const hcx = (fk.p[B.thighL * 3] + fk.p[B.thighR * 3]) / 2;
    const hcz = (fk.p[B.thighL * 3 + 2] + fk.p[B.thighR * 3 + 2]) / 2;
    const cut = (1 - this.stride) * W;
    for (let i = 0; i < 2; i++) {
      const fb = i === 0 ? B.footL : B.footR;
      const ax = fk.p[fb * 3];
      const az = fk.p[fb * 3 + 2];
      const c = (ax - hcx) * mx + (az - hcz) * mz;
      this.tx[i] = ax - cut * c * mx;
      this.tz[i] = az - cut * c * mz;
    }
    if (due) {
      this.since = interval > 0 ? this.since % Math.max(interval, 1e-3) : 0;
      let level = true;
      for (let i = 0; i < 2; i++) {
        const f = this.feet[i];
        const fb = i === 0 ? B.footL : B.footR;
        // A surface more than a step away is a ledge or a wall, not ground to stand on.
        if (probe(this.tx[i] + vx * LOOKAHEAD, this.tz[i] + vz * LOOKAHEAD, sample) && Math.abs(sample.y - rootY) <= MAX_OFFSET + 0.06) {
          f.gy = sample.y;
          f.nx = sample.nx;
          f.ny = sample.ny;
          f.nz = sample.nz;
          const first = !f.valid;
          f.valid = true;
          const target = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, sample.y - rootY));
          if (first) f.off = target;
        } else f.valid = false;
        this.rays++;
        if (f.valid && (Math.abs(f.gy - rootY) > 0.004 || f.ny < 0.995)) level = false;
      }
      this.level = level;
      // Steep ground between the feet: the natural height gap at the baked stride says how far to shorten.
      const f0 = this.feet[0];
      const f1 = this.feet[1];
      const span = Math.abs((this.tx[0] - this.tx[1]) * mx + (this.tz[0] - this.tz[1]) * mz);
      if (speed > 0.4 && f0.valid && f1.valid) {
        if (span > 0.3) this.strideGoal = Math.max(MIN_STRIDE, Math.min(1, STEP_RISE / Math.max(1e-3, Math.abs(f0.gy - f1.gy) / this.stride)));
      } else this.strideGoal = 1;
    }
    this.stride += (this.strideGoal - this.stride) * damp(5, dt);
    // Per foot: where the ground is now, and how planted the foot is.
    const rest = [J[B.footL * 3 + 1], J[B.footR * 3 + 1]];
    let lowest = 0;
    let any = false;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      const fb = i === 0 ? B.footL : B.footR;
      const target = f.valid ? Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, f.gy - rootY)) : 0;
      f.off += (target - f.off) * damp(f.valid ? 26 : 8, dt);
      // The lower of heel and ball above the flat floor tells whether the foot is on the ground (a heel
      // strike, flat, or a toe-off on the ball) or swinging.
      const q = fk.q;
      qRotate(vv, 0, q, fb * 4, 0, -rig.ankleH, -rig.footBack);
      const heel = fk.p[fb * 3 + 1] + vv[1];
      qRotate(vv, 0, q, fb * 4, 0, -rig.ankleH, rig.footFwd);
      const ball = fk.p[fb * 3 + 1] + vv[1];
      f.planted = 1 - smooth(0.02, 0.1, Math.min(heel, ball));
      f.eff = f.off * W;
      const pe = f.eff * f.planted;
      if (pe < lowest) lowest = pe;
      if (Math.abs(f.eff) > 0.003 || f.ny < 0.995) any = true;
    }
    if (this.stride < 0.99) any = true;
    const dropTarget = lowest * PELVIS_SHARE;
    this.drop += (dropTarget - this.drop) * damp(16, dt);
    if (!any && Math.abs(this.drop) < 0.0015) {
      this.drop = 0;
      return;
    }
    this.active = true;
    const D = this.drop;
    p.p[1] += D / legScale;
    for (let i = 0; i < 2; i++) this.solveLeg(p, rig, i === 0, rest[i], D);
  }

  private solveLeg(p: Pose, rig: Rig, left: boolean, restY: number, D: number) {
    const side = left ? 0 : 1;
    const f = this.feet[left ? 0 : 1];
    const J = rig.joints;
    const thigh = left ? B.thighL : B.thighR;
    const shin = left ? B.shinL : B.shinR;
    const foot = left ? B.footL : B.footR;
    const P = fk.p;
    const Q = fk.q;
    const hx = P[thigh * 3], hy = P[thigh * 3 + 1] + D, hz = P[thigh * 3 + 2];
    const kx = P[shin * 3], ky = P[shin * 3 + 1] + D, kz = P[shin * 3 + 2];
    const ax = this.tx[side], ay = P[foot * 3 + 1], az = this.tz[side];
    const oax = P[foot * 3], oaz = P[foot * 3 + 2];
    // Target ankle (world-fixed, so the pelvis drop does not shift it).
    const e = f.eff;
    let ty = ay + e * f.planted;
    if (e > 0) ty = Math.max(ty, restY + e);
    const l1 = Math.hypot(kx - hx, ky - hy, kz - hz);
    const l2 = Math.hypot(oax - kx, (ay + D) - ky, oaz - kz);
    // Reach: no further than the straightened leg, no closer than a deep fold.
    let dx = ax - hx, dy = ty - hy, dz = az - hz;
    let d = Math.hypot(dx, dy, dz);
    const maxD = (l1 + l2) * 0.9995;
    const minD = Math.abs(l1 - l2) + 0.05;
    const dc = Math.min(maxD, Math.max(minD, d));
    dx *= dc / d;
    dy *= dc / d;
    dz *= dc / d;
    d = dc;
    const ux = dx / d, uy = dy / d, uz = dz / d;
    // The knee keeps bending the way it did: pole = the old knee offset, made perpendicular to the new axis.
    let ox = oax - hx, oy = ay + D - hy, oz = oaz - hz;
    const ol = Math.hypot(ox, oy, oz) || 1;
    ox /= ol;
    oy /= ol;
    oz /= ol;
    let px = kx - hx, py = ky - hy, pz = kz - hz;
    const along0 = px * ox + py * oy + pz * oz;
    px -= ox * along0;
    py -= oy * along0;
    pz -= oz * along0;
    let pl = Math.hypot(px, py, pz);
    if (pl < 1e-3) {
      // A straight leg: the knee bends forward of the hips.
      gq[0] = Q[B.hips * 4];
      gq[1] = Q[B.hips * 4 + 1];
      gq[2] = Q[B.hips * 4 + 2];
      gq[3] = Q[B.hips * 4 + 3];
      qRotate(vv, 0, gq, 0, 0, 0, 1);
      px = vv[0];
      py = vv[1];
      pz = vv[2];
    }
    // Make it perpendicular to the new axis.
    const dot = px * ux + py * uy + pz * uz;
    px -= ux * dot;
    py -= uy * dot;
    pz -= uz * dot;
    pl = Math.hypot(px, py, pz) || 1;
    px /= pl;
    py /= pl;
    pz /= pl;
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const nkx = hx + ux * a + px * h;
    const nky = hy + uy * a + py * h;
    const nkz = hz + uz * a + pz * h;
    // Thigh: swing the old thigh direction onto the new one.
    const t0x = (kx - hx) / l1, t0y = (ky - hy) / l1, t0z = (kz - hz) / l1;
    const t1x = (nkx - hx) / l1, t1y = (nky - hy) / l1, t1z = (nkz - hz) / l1;
    qFromUnitVectors(qa, 0, t0x, t0y, t0z, t1x, t1y, t1z);
    // New world thigh = Rt * old; local = inv(hips world) * that.
    qMul(qb, 0, qa, 0, Q, thigh * 4);
    const hips = PARENT_INDEX[thigh];
    qInvert(qc, 0, Q, hips * 4);
    qMul(qd, 0, qc, 0, qb, 0);
    p.q.set(qd, thigh * 4);
    // Shin: the old lower-leg direction (carried by the thigh swing) onto knee -> target.
    qRotate(vv, 0, qa, 0, oax - kx, ay + D - ky, oaz - kz);
    const s0l = Math.hypot(vv[0], vv[1], vv[2]) || 1;
    const sx = (hx + dx) - nkx, sy = (hy + dy) - nky, sz = (hz + dz) - nkz;
    const s1l = Math.hypot(sx, sy, sz) || 1;
    qFromUnitVectors(qd, 0, vv[0] / s0l, vv[1] / s0l, vv[2] / s0l, sx / s1l, sy / s1l, sz / s1l);
    // World shin = Rs * Rt * old; local = inv(new world thigh) * that.
    qMul(qe, 0, qd, 0, qa, 0);
    qMul(qe, 0, qe, 0, Q, shin * 4);
    qInvert(qc, 0, qb, 0);
    qMul(qc, 0, qc, 0, qe, 0);
    p.q.set(qc, shin * 4);
    // Foot: its world orientation as authored, tilted to the ground by how planted it is.
    const tilt = f.planted * this.weight;
    qb.set(Q.subarray(foot * 4, foot * 4 + 4));
    if (tilt > 0.01 && f.valid && f.ny >= MIN_NORMAL_Y && f.ny < 0.9995) {
      qFromUnitVectors(qd, 0, 0, 1, 0, f.nx, f.ny, f.nz);
      qNlerp(qd, 0, qid, 0, qd, 0, tilt);
      qMul(qb, 0, qd, 0, qb, 0);
    }
    qInvert(qc, 0, qe, 0);
    qMul(qc, 0, qc, 0, qb, 0);
    p.q.set(qc, foot * 4);
  }
}
