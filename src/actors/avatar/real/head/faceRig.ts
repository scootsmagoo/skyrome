/**
 * The moving parts of a realistic face, measured once per body template (reference bind pose, pure maths):
 *
 *   - the jaw: which vertices follow the lower jaw (below the mouth line, the chin, the jaw line and the
 *     lower half of the mouth's inside; the cheeks above the jaw line and the throat stay), and its hinge
 *     just in front of the ears;
 *   - the lids: for each eye, the opening seen from the eye's centre (the elevation of the upper and lower
 *     lid edges across the eye, found by casting rays from the eye centre through the head's triangles),
 *     so the eye shader can close a lid over the eyeball exactly where the real lid edge is.
 */
import { B } from '../../rig';
import type { BodyArrays } from '../morph';
import { MOUTH } from './beard';
import type { HeadMeasure } from './frame';

export interface JawRig {
  /** Hinge (x = 0): the jaw turns about the x axis through it. */
  hinge: [number, number, number];
  /** Per-vertex weight (only vertices that move), vertex index -> 0..1. */
  weights: Map<number, number>;
  mouthY: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function headWeight(body: BodyArrays, v: number) {
  let w = 0;
  for (let k = 0; k < 4; k++) if (body.skinIndex[v * 4 + k] === B.head) w += body.skinWeight[v * 4 + k];
  return w;
}

/** The jaw's hinge: in front of the ear canal, a little below it (x = 0; `k` scales the offsets with the head). */
export function jawHinge(earY: number, eyeY: number, cz: number, k = 1): [number, number, number] {
  return [0, Math.min(earY, eyeY - 0.02 * k) - 0.012 * k, cz + 0.004 * k];
}

/**
 * A beard follows the jaw: per-vertex jaw weights for hair/beard geometry (everything below the mouth line
 * in front of the ears; the moustache and the scalp stay), as the deformation attributes of real/deform.ts.
 */
export function beardJawAttributes(position: ArrayLike<number>, mouthY: number, cz: number, hinge: readonly number[], k = 1): { a0: Float32Array; a1: Float32Array } | null {
  const n = position.length / 3;
  const a0 = new Float32Array(n * 4);
  const a1 = new Float32Array(n * 4);
  let any = false;
  for (let v = 0; v < n; v++) {
    const y = position[v * 3 + 1];
    const z = position[v * 3 + 2];
    const w = smooth(mouthY + 0.002 * k, mouthY - 0.01 * k, y) * smooth(cz - 0.01 * k, cz + 0.03 * k, z);
    if (w <= 0.01) continue;
    a0[v * 4] = hinge[0];
    a0[v * 4 + 1] = hinge[1];
    a0[v * 4 + 2] = hinge[2];
    a0[v * 4 + 3] = -(7 + Math.min(0.99, w * 0.99));
    any = true;
  }
  return any ? { a0, a1 } : null;
}

/** The lower jaw of a head (reference pose). `m`: the head's measurement on the same body. */
export function measureJaw(body: BodyArrays, m: HeadMeasure): JawRig {
  const H = m.crown - m.chin;
  const mouthY = m.chin + MOUTH.line * H;
  const half = m.sex === 'female' ? 0.0238 : 0.0252;
  const hinge = jawHinge(m.earY, m.eyeY, m.cz);
  const lipZ = m.noseTip.z - 0.012;
  const weights = new Map<number, number>();
  const pos = body.position;
  for (let v = 0; v < pos.length / 3; v++) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    if (y > mouthY + 0.004 || y < m.chin - 0.05) continue;
    const hw = headWeight(body, v);
    if (hw < 0.2) continue;
    const ax = Math.abs(x);
    // Beside the mouth the line the jaw parts along drops toward the jaw line (the cheeks stay).
    const drop = 0.022 * smooth(half + 0.002, half + 0.03, ax);
    const below = smooth(mouthY + 0.0012 - drop, mouthY - 0.006 - drop, y);
    // Inside the mouth, the lower half moves too; behind the hinge (the ears, the nape) nothing does.
    const inside = z < lipZ - 0.006 && ax < half ? 1 : 0;
    const front = smooth(m.cz - 0.03, m.cz + 0.0, z);
    // The throat under the chin: the jaw's underside follows, the neck below it does not.
    const throat = smooth(m.chin - 0.035, m.chin - 0.005, y) + inside;
    const w = below * front * Math.min(1, throat) * Math.min(1, hw * 1.3);
    if (w > 0.01) weights.set(v, Math.min(1, w));
  }
  return { hinge, weights, mouthY };
}

/** One eye's opening: elevation (rad) of the upper and lower lid edges at azimuths `az` (rad, + = outward). */
export interface LidTable {
  az: number[];
  upper: number[];
  lower: number[];
}

/** Azimuths the lid tables are sampled at (degrees, + toward the temple). */
export const LID_AZ = [-70, -60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60, 70];

/** Ray-triangle distance (Moller-Trumbore), or Infinity. */
function rayTri(o: number[], d: number[], a: number[], b: number[], c: number[]): number {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-12) return Infinity;
  const inv = 1 / det;
  const t0 = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
  const u = (t0[0] * p[0] + t0[1] * p[1] + t0[2] * p[2]) * inv;
  if (u < 0 || u > 1) return Infinity;
  const q = [t0[1] * e1[2] - t0[2] * e1[1], t0[2] * e1[0] - t0[0] * e1[2], t0[0] * e1[1] - t0[1] * e1[0]];
  const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv;
  if (v < 0 || u + v > 1) return Infinity;
  const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
  return t > 0 ? t : Infinity;
}

/**
 * The opening of the eye centred at `c` (radius `r`): along each azimuth, the elevations where the
 * eyeball is not covered by the face (the body surface lies inside the eyeball or not at all).
 * `side` 1 for the figure's left eye (outward = +x), -1 for the right.
 */
export function measureLids(body: BodyArrays, index: ArrayLike<number>, c: number[], r: number, side: 1 | -1): LidTable {
  const pos = body.position;
  const tris: number[][][] = [];
  for (let t = 0; t + 2 < index.length; t += 3) {
    const vs = [index[t], index[t + 1], index[t + 2]].map((v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]);
    if (vs.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) < r * 2.2)) tris.push(vs);
  }
  const D = Math.PI / 180;
  const covered = (az: number, el: number) => {
    const d = [side * Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
    // Covered when skin lies in front of the eyeball's surface along this ray (the socket's lining
    // inside the ball does not count).
    for (const tr of tris) {
      const t = rayTri(c, d, tr[0], tr[1], tr[2]);
      if (t > r * 0.98 && t < r * 2.0) return true;
    }
    return false;
  };
  const upper: number[] = [];
  const lower: number[] = [];
  for (const a of LID_AZ) {
    let up = 0;
    let lo = 0;
    // Walk out from the middle of the opening (a little above the eye's axis) until skin covers the ball.
    for (let el = 2; el <= 60; el += 0.5) {
      if (covered(a * D, el * D)) break;
      up = el;
    }
    for (let el = 2; el >= -60; el -= 0.5) {
      if (covered(a * D, el * D)) break;
      lo = el;
    }
    upper.push(up * D);
    lower.push(lo * D);
  }
  // From the middle outward, a corner that has closed stays closed (rays past the corners can slip
  // between the lids and the brow or the nose).
  const mid = LID_AZ.indexOf(0);
  for (const dir of [-1, 1]) {
    let closed = false;
    let meet = 0;
    for (let i = mid; i >= 0 && i < LID_AZ.length; i += dir) {
      if (!closed && upper[i] - lower[i] < 2 * D) {
        closed = true;
        meet = i === mid ? 0 : (upper[i - dir] + lower[i - dir]) / 2;
      }
      if (closed) upper[i] = lower[i] = meet;
    }
  }
  return { az: LID_AZ.map((a) => a * D), upper, lower };
}
