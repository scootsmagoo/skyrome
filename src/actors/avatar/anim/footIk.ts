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
 * leaves the pose untouched. On a staircase (found by scanning the treads ahead) the gait changes:
 * the step is a whole number of treads, and each planted foot is latched to the middle of a tread
 * and carried back with the ground, so the feet land one to a tread, not on a riser's edge and
 * not sliding. Ground samples are kept in world height, so a foot that stays put
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
/** Staircase scan: ground heights read along the way of walking from the hips, SCAN_N points SCAN_DC apart from SCAN_C0. */
const SCAN_N = 10;
const SCAN_C0 = -0.3;
const SCAN_DC = 0.1;
/** A height jump between two scan points at least this big is a riser. */
const RISER_MIN = 0.07;
/** Treads shorter or longer than this are not a staircase's (m). */
const TREAD_MIN = 0.2;
const TREAD_MAX = 0.55;
/** Shortest stride on stairs, as a share of the baked step. */
const STAIR_MIN_STRIDE = 0.4;

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
  /** Stairs: the foot is latched to a tread, at this coordinate along the way of walking (from the hips, carried back with the ground), and how much of the latch is applied. */
  latched: boolean;
  lat: number;
  snap: number;
}

const newFoot = (): Foot => ({ gy: 0, nx: 0, ny: 1, nz: 0, valid: false, off: 0, eff: 0, planted: 0, latched: false, lat: 0, snap: 0 });

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
  /** Length of one baked step (m): the controller sets it, so a stair step can be sized in treads. */
  baseStep = 0.75;
  /** Staircase under the walker: 0..1 (smoothed), and its tread depth (m). */
  stairs = 0;
  tread = 0.3;
  /** Treads per step chosen last (tests). */
  treadsPerStep = 1;
  /** The staircase gait on (off: the old shortened stride, for comparison). */
  stairGait = true;
  /** Riser position along the way of walking (from the hips, m), carried back as the body moves. */
  private edge0 = 0;
  private stairsFound = false;
  private scans = 0;
  private readonly scanH = new Float32Array(SCAN_N);
  private since = Math.random() * 0.05;
  private level = true;
  /** Seconds since the last tread scan while no stairs are known (a slope would otherwise scan every tick). */
  private scanIdle = 1;
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
    this.stairs = 0;
    this.stairsFound = false;
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
    const onStairs = this.stairs > 0.01 && speed > 0.4;
    for (let i = 0; i < 2; i++) {
      const fb = i === 0 ? B.footL : B.footR;
      const ax = fk.p[fb * 3];
      const az = fk.p[fb * 3 + 2];
      const c = (ax - hcx) * mx + (az - hcz) * mz;
      const cs = c * (1 - cut);
      let shift = 0;
      const f = this.feet[i];
      if (onStairs) {
        // A foot that comes down takes the middle of the nearest tread and stays there while the body passes.
        if (f.planted > 0.5 && !f.latched) {
          f.latched = true;
          f.lat = this.nearestTread(cs);
          const o = this.feet[1 - i];
          // The other foot has this tread: this one takes the next one on its side of it.
          if (o.latched && Math.abs(o.lat - f.lat) < this.tread * 0.5) f.lat += cs >= o.lat ? this.tread : -this.tread;
        } else if (f.planted < 0.25) f.latched = false;
        if (f.latched) f.lat -= speed * dt;
        shift = Math.max(-0.22, Math.min(0.22, f.lat - cs)) * f.planted * f.snap * this.stairs;
      } else f.latched = false;
      f.snap += ((f.latched ? 1 : 0) - f.snap) * damp(f.latched ? 12 : 20, dt);
      this.tx[i] = ax - cut * c * mx + shift * mx;
      this.tz[i] = az - cut * c * mz + shift * mz;
    }
    // The risers move back with the ground as the body goes forward.
    this.edge0 -= speed * dt;
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
      // A staircase: find the treads ahead, and size the step in treads.
      // Cheap pre-test: known stairs rescan every tick; otherwise only when the feet stand at different heights
      // (risers between them), and at most every 0.25 s so a plain slope costs nothing extra.
      this.scanIdle += interval;
      const uneven = this.feet[0].valid && this.feet[1].valid && Math.abs(this.feet[0].gy - this.feet[1].gy) > RISER_MIN * 0.7;
      let doScan = false;
      if (speed > 0.4 && this.stairGait && !level) {
        if (this.stairsFound) doScan = true;
        else if (uneven && this.scanIdle >= 0.25) doScan = true;
      }
      if (doScan) this.scanIdle = 0;
      const stairsNow = doScan && this.scanTreads(probe, hcx, hcz, mx, mz, rootY);
      this.stairsFound = stairsNow;
      const f0 = this.feet[0];
      const f1 = this.feet[1];
      if (stairsNow) {
        // One tread per step at any pace: the stride is cut to the tread depth, which also quickens the cadence.
        this.treadsPerStep = 1;
        this.strideGoal = Math.max(STAIR_MIN_STRIDE, Math.min(1, this.tread / this.baseStep));
      } else if (speed > 0.4 && f0.valid && f1.valid) {
        // Steep ground between the feet: the natural height gap at the baked stride says how far to shorten.
        const span = Math.abs((this.tx[0] - this.tx[1]) * mx + (this.tz[0] - this.tz[1]) * mz);
        if (span > 0.3) this.strideGoal = Math.max(MIN_STRIDE, Math.min(1, STEP_RISE / Math.max(1e-3, Math.abs(f0.gy - f1.gy) / this.stride)));
      } else this.strideGoal = 1;
    }
    this.stairs += ((this.stairsFound && speed > 0.4 ? 1 : 0) - this.stairs) * damp(6, dt);
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

  /** The middle of the tread nearest to a position along the way of walking. */
  private nearestTread(x: number): number {
    const k = Math.round((x - this.edge0) / this.tread - 0.5);
    return this.edge0 + (k + 0.5) * this.tread;
  }

  /**
   * Read the ground ahead along the way of walking and look for evenly spaced risers (a flight of
   * stairs). Sets `tread` and the risers' phase; false when there are fewer than two or they are uneven.
   */
  private scanTreads(probe: GroundProbe, hcx: number, hcz: number, mx: number, mz: number, rootY: number): boolean {
    const H = this.scanH;
    for (let i = 0; i < SCAN_N; i++) {
      const c = SCAN_C0 + i * SCAN_DC;
      H[i] = probe(hcx + c * mx, hcz + c * mz, sample) && Math.abs(sample.y - rootY) <= MAX_OFFSET + 0.3 ? sample.y : NaN;
    }
    this.rays += SCAN_N;
    let n = 0;
    let first = 0;
    let last = 0;
    let sign = 0;
    for (let i = 0; i + 1 < SCAN_N; i++) {
      const d = H[i + 1] - H[i];
      if (!(Math.abs(d) >= RISER_MIN)) continue;
      // Risers all go the same way, or it is a kerb, a ledge or a wall.
      if (sign !== 0 && Math.sign(d) !== sign) return false;
      sign = Math.sign(d);
      const e = SCAN_C0 + (i + 0.5) * SCAN_DC;
      if (n === 0) first = e;
      else if (e - last < TREAD_MIN - SCAN_DC * 0.6) return false;
      last = e;
      n++;
    }
    if (n < 2) return false;
    const tread = (last - first) / (n - 1);
    if (tread < TREAD_MIN || tread > TREAD_MAX) return false;
    // The first and the last riser are pinned down to a few cm by halving the interval they were seen in.
    const e0 = this.refineEdge(probe, hcx, hcz, mx, mz, first);
    const e1 = n > 2 ? this.refineEdge(probe, hcx, hcz, mx, mz, last) : last;
    const t = (e1 - e0) / (n - 1);
    if (t < TREAD_MIN || t > TREAD_MAX) return false;
    const was = this.stairs > 0.3;
    if (!was) this.tread = t;
    else this.tread += (t - this.tread) * 0.4;
    // Phase: the riser nearest to the old one, eased.
    const d = e0 - this.edge0;
    const wrap = d - Math.round(d / this.tread) * this.tread;
    this.edge0 = was ? this.edge0 + wrap * 0.5 : e0;
    this.scans++;
    return true;
  }

  /** Bisect a riser seen between two scan points: a few rays, SCAN_DC / 16 resolution. */
  private refineEdge(probe: GroundProbe, hcx: number, hcz: number, mx: number, mz: number, e: number): number {
    let lo = e - SCAN_DC * 0.5;
    let hi = e + SCAN_DC * 0.5;
    const ylo = readAt(probe, hcx, hcz, mx, mz, lo);
    const yhi = readAt(probe, hcx, hcz, mx, mz, hi);
    this.rays += 2;
    if (!(Math.abs(yhi - ylo) >= RISER_MIN)) return e;
    for (let i = 0; i < 3; i++) {
      const mid = (lo + hi) / 2;
      const ym = readAt(probe, hcx, hcz, mx, mz, mid);
      this.rays++;
      // The riser is on the side whose height differs from the far end's.
      if (Math.abs(ym - ylo) < Math.abs(ym - yhi)) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
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

function readAt(probe: GroundProbe, hcx: number, hcz: number, mx: number, mz: number, c: number): number {
  return probe(hcx + c * mx, hcz + c * mz, sample) ? sample.y : NaN;
}
