/**
 * The silhouette of a (morphed) realistic body as a polar table: for every height slab, the largest
 * distance from the body's vertical axis in each direction. Shell garments (skirts, togas, cloaks) ride
 * this envelope so the cloth stands a few millimetres off the real skin, never inside it.
 *
 * Pure maths (no three.js). Angle convention is the procedural lofts': 0 = +x (the figure's left),
 * PI/2 = front (+z), so a point is (r cos th, zc + r sin th).
 *
 * Two flavours: the core (torso, pelvis and legs: arms, hands and head left out, because skirts must not
 * bell out to the swinging arms) and the wide one (the same plus the upper arms, for cloaks that cover
 * the shoulders and hang over the arms).
 */
import { B, type Rig } from '../../rig';
import type { BodyArrays } from '../morph';

/** Angular resolution of the table (bins around the full circle). */
export const PROFILE_BINS = 72;

const ARMS = [B.upperArmL, B.forearmL, B.handL, B.fingersL, B.indexL, B.upperArmR, B.forearmR, B.handR, B.fingersR, B.indexR];
const LOWER_ARMS = [B.forearmL, B.handL, B.fingersL, B.indexL, B.forearmR, B.handR, B.fingersR, B.indexR];

/** Sum of a vertex's skin weight on a set of bones. */
export function boneWeight(body: Pick<BodyArrays, 'skinIndex' | 'skinWeight'>, v: number, bones: readonly number[]): number {
  let t = 0;
  for (let k = 0; k < 4; k++) if (bones.includes(body.skinIndex[v * 4 + k])) t += body.skinWeight[v * 4 + k];
  return t;
}

export const ARM_BONES = ARMS;
export const HEAD_BONES = [B.head];

export class BodyProfile {
  /** Height step between slabs (m). */
  readonly dy: number;
  /** Number of slabs; slab i is at height i * dy. */
  readonly n: number;
  private readonly zcs: Float32Array;
  private readonly rad: Float32Array;
  private readonly valid: number;

  constructor(body: BodyArrays, rig: Rig, wide: boolean) {
    const s = rig.s;
    this.dy = 0.01 * s;
    this.n = Math.ceil(rig.height / this.dy) + 1;
    const n = this.n;
    const NB = PROFILE_BINS;
    const half = 1.4 * this.dy;
    const exclude = wide ? LOWER_ARMS : ARMS;
    const count = body.position.length / 3;
    const keep = new Uint8Array(count);
    for (let v = 0; v < count; v++) keep[v] = boneWeight(body, v, exclude) < 0.5 && boneWeight(body, v, HEAD_BONES) < 0.5 ? 1 : 0;
    // Pass 1: the centre of each slab in z (mid-range of the extremes).
    const zmin = new Float32Array(n).fill(Infinity);
    const zmax = new Float32Array(n).fill(-Infinity);
    const span = (y: number): [number, number] => [Math.max(0, Math.ceil((y - half) / this.dy)), Math.min(n - 1, Math.floor((y + half) / this.dy))];
    for (let v = 0; v < count; v++) {
      if (!keep[v]) continue;
      const y = body.position[v * 3 + 1];
      const z = body.position[v * 3 + 2];
      const [a, b] = span(y);
      for (let i = a; i <= b; i++) {
        if (z < zmin[i]) zmin[i] = z;
        if (z > zmax[i]) zmax[i] = z;
      }
    }
    this.zcs = new Float32Array(n);
    let valid = 0;
    for (let i = 0; i < n; i++) {
      if (zmax[i] >= zmin[i]) {
        this.zcs[i] = (zmin[i] + zmax[i]) / 2;
        valid = i;
      } else this.zcs[i] = i > 0 ? this.zcs[i - 1] : 0;
    }
    this.valid = valid;
    // Smooth the centre so rings do not wobble from slab to slab.
    for (let pass = 0; pass < 3; pass++) {
      const c = this.zcs.slice();
      for (let i = 1; i < n - 1; i++) this.zcs[i] = (c[i - 1] + 2 * c[i] + c[i + 1]) / 4;
    }
    // Pass 2: the largest radius per direction bin.
    const r = new Float32Array(n * NB);
    for (let v = 0; v < count; v++) {
      if (!keep[v]) continue;
      const x = body.position[v * 3];
      const y = body.position[v * 3 + 1];
      const z = body.position[v * 3 + 2];
      const [a, b] = span(y);
      for (let i = a; i <= b; i++) {
        const dz = z - this.zcs[i];
        const rr = Math.hypot(x, dz);
        let th = Math.atan2(dz, x);
        if (th < 0) th += Math.PI * 2;
        const bin = Math.round((th / (Math.PI * 2)) * NB) % NB;
        if (rr > r[i * NB + bin]) r[i * NB + bin] = rr;
      }
    }
    // Fill empty bins by circular interpolation; empty slabs copy the nearest filled one.
    for (let i = 0; i < n; i++) fillRing(r, i * NB, NB);
    for (let i = 1; i < n; i++) if (r[i * NB] === 0) r.copyWithin(i * NB, (i - 1) * NB, i * NB);
    for (let i = n - 2; i >= 0; i--) if (r[i * NB] === 0) r.copyWithin(i * NB, (i + 1) * NB, (i + 2) * NB);
    // Dilate (cloth must stay outside) and soften: max over the neighbouring bins and slabs, then a light blur.
    const tmp = new Float32Array(NB);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < NB; k++) tmp[k] = Math.max(r[i * NB + (k + NB - 1) % NB], r[i * NB + k], r[i * NB + (k + 1) % NB]);
      for (let k = 0; k < NB; k++) r[i * NB + k] = (tmp[(k + NB - 1) % NB] + 2 * tmp[k] + tmp[(k + 1) % NB]) / 4;
    }
    const up = r.slice();
    for (let i = 0; i < n; i++) {
      const lo = Math.max(0, i - 1) * NB;
      const hi = Math.min(n - 1, i + 1) * NB;
      for (let k = 0; k < NB; k++) r[i * NB + k] = Math.max(up[i * NB + k], up[lo + k] * 0.985, up[hi + k] * 0.985);
    }
    this.rad = r;
  }

  /** Highest slab with body data (the neck's top for the core flavour). */
  get top(): number {
    return this.valid * this.dy;
  }

  /** z of the vertical axis at height y. */
  centre(y: number): number {
    const f = this.slab(y);
    const i = Math.floor(f);
    const t = f - i;
    return this.zcs[i] * (1 - t) + this.zcs[Math.min(this.n - 1, i + 1)] * t;
  }

  /** Distance from the axis to the body surface at height y in direction th. */
  radius(y: number, th: number): number {
    const NB = PROFILE_BINS;
    const f = this.slab(y);
    const i = Math.floor(f);
    const t = f - i;
    let u = (th / (Math.PI * 2)) * NB;
    u -= Math.floor(u / NB) * NB;
    const k = Math.floor(u);
    const e = u - k;
    const k1 = (k + 1) % NB;
    const i1 = Math.min(this.n - 1, i + 1);
    const R = this.rad;
    const a = R[i * NB + k] * (1 - e) + R[i * NB + k1] * e;
    const b = R[i1 * NB + k] * (1 - e) + R[i1 * NB + k1] * e;
    return a * (1 - t) + b * t;
  }

  /** The surface point (x, z) at height y in direction th. */
  point(y: number, th: number): [number, number] {
    const r = this.radius(y, th);
    return [r * Math.cos(th), this.centre(y) + r * Math.sin(th)];
  }

  /** Half-width, front depth and back depth about the axis (the procedural TorsoProfile's a, bf, bb). */
  section(y: number) {
    const a = Math.max(this.radius(y, 0), this.radius(y, Math.PI));
    return { a, bf: this.radius(y, Math.PI / 2), bb: this.radius(y, -Math.PI / 2), zc: this.centre(y) };
  }

  private slab(y: number): number {
    return Math.min(this.n - 1.001, Math.max(0, y / this.dy));
  }
}

/** Fill the zero bins of one ring by linear interpolation around the circle. */
function fillRing(r: Float32Array, o: number, NB: number) {
  let any = -1;
  for (let k = 0; k < NB; k++) if (r[o + k] > 0) any = k;
  if (any < 0) return;
  // Walk from a filled bin so the wrap is handled once.
  let prev = any;
  let prevV = r[o + any];
  for (let step = 1; step <= NB; step++) {
    const k = (any + step) % NB;
    if (r[o + k] > 0) {
      // Interpolate between prev and k.
      const gap = (k - prev + NB) % NB || NB;
      for (let g = 1; g < gap; g++) r[o + (prev + g) % NB] = prevV + ((r[o + k] - prevV) * g) / gap;
      prev = k;
      prevV = r[o + k];
    }
  }
}
