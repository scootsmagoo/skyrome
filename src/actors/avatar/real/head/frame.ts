/**
 * The head of a realistic body, measured: a polar table of the skull's radius around a vertical axis,
 * from the LOD's head-weighted vertices in the reference pose, then carried to the appearance's rig
 * exactly as morph.ts moves the head bone's vertices (uniform scale `rig.headH / ref.headH` around the
 * head joint, plus the joint's own move).
 *
 * Everything that sits on the head (hair cards, beards, helmets, veils) asks this surface for points:
 * `at(yf, th)` is the old procedural HeadFrame's contract (yf 0 = chin ... 1 = crown, th 0 = front,
 * +pi/2 = the figure's left), so build/armor.ts can fit its helmets through `toLegacyFrame`.
 *
 * The ears are removed from the table (an ellipse fitted to the rest of each row stands in for them),
 * so a bowl or a cap does not bulge sideways at ear height; `ears` and `earOut` still say where they are.
 * Pure maths apart from three's vectors: unit-tested with a synthetic head.
 */
import * as THREE from 'three';
import { B } from '../../rig';
import type { Rig } from '../../rig';
import type { BodyArrays } from '../morph';
import { refRig } from '../refs';
import type { RealHeadFrame } from '../types';

/** Rows (chin ... crown) and azimuth bins (front, going to the figure's left) of the radius table. */
const NR = 26;
const NA = 36;

/** Landmarks of the two baked heads that the vertices cannot give (eye centres, from the GLB's eye mesh). */
const REF_EYES = {
  male: { x: 0.0357, y: 1.6361, z: 0.0855 },
  female: { x: 0.0338, y: 1.5126, z: 0.0779 },
} as const;

/** Measurements in the reference pose (metres, character space). */
export interface HeadMeasure {
  sex: 'male' | 'female';
  chin: number;
  crown: number;
  /** Axis of the polar table (x is 0). */
  cz: number;
  /** r[j * NA + k]: radius at row j (yf = j / (NR - 1)) and azimuth k * 2 pi / NA. */
  r: Float32Array;
  noseTip: THREE.Vector3;
  earY: number;
  /** Top and bottom of the ears (y). */
  earTop: number;
  earBottom: number;
  /** How far the ears stand out of the skull on each side (m). */
  earOut: number;
  eyeY: number;
  eyeX: number;
  eyeZ: number;
}

const smooth01 = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Where the reference eye centres land on a body morphed to `rig` (the head bone's morph: a uniform scale
 * `rig.headH / ref.headH` about the head joint plus the joint's move). Without a rig: the reference eyes.
 */
export function eyeCentreIn(sex: 'male' | 'female', rig?: Rig): { x: number; y: number; z: number } {
  const e = REF_EYES[sex];
  if (!rig) return e;
  const ref = refRig(sex);
  const k = ref.headH > 1e-6 ? rig.headH / ref.headH : 1;
  const J = (r: Rig, c: number) => r.joints[B.head * 3 + c];
  return { x: e.x * k, y: J(rig, 1) + k * (e.y - J(ref, 1)), z: J(rig, 2) + k * (e.z - J(ref, 2)) };
}

/**
 * Measure a body's head from its head-weighted vertices (weight on the head bone >= 0.5). `rig`: the body is
 * already morphed to this rig (RealBody's context), so the reference landmarks (eyes) are carried into it too;
 * without it the body is the reference pose.
 */
export function measureHead(body: BodyArrays, sex: 'male' | 'female', rig?: Rig): HeadMeasure {
  const n = body.position.length / 3;
  const pos = body.position;
  const head: number[] = [];
  for (let i = 0; i < n; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (body.skinIndex[i * 4 + k] === B.head) w += body.skinWeight[i * 4 + k];
    if (w >= 0.5) head.push(i);
  }
  // Crown, and the depth range of the skull at mid height (the axis sits halfway).
  let crown = -Infinity;
  let yMin = Infinity;
  for (const i of head) {
    crown = Math.max(crown, pos[i * 3 + 1]);
    yMin = Math.min(yMin, pos[i * 3 + 1]);
  }
  const midY = yMin + (crown - yMin) * 0.7;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const i of head) {
    if (Math.abs(pos[i * 3 + 1] - midY) < 0.012) {
      zMin = Math.min(zMin, pos[i * 3 + 2]);
      zMax = Math.max(zMax, pos[i * 3 + 2]);
    }
  }
  const cz = zMin <= zMax ? (zMin + zMax) / 2 : 0;
  // Chin: the lowest point of the front of the jaw (the throat below it is not the head).
  let chin = Infinity;
  const noseTip = new THREE.Vector3(0, 0, -Infinity);
  const eye = eyeCentreIn(sex, rig);
  const ks = rig ? rig.headH / refRig(sex).headH : 1;
  for (const i of head) {
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    if (z > cz + 0.03 && Math.abs(x) < 0.03) chin = Math.min(chin, y);
    if (Math.abs(x) < 0.02 * ks && y < eye.y + 0.01 * ks && y > eye.y - 0.075 * ks && z > noseTip.z) noseTip.set(x, y, z);
  }
  if (!isFinite(chin)) chin = yMin;
  const H = Math.max(1e-3, crown - chin);

  // Radius per (row, bin): the farthest head vertex in a window a little wider than the cell.
  const r = new Float32Array(NR * NA);
  const dRow = 0.85 / (NR - 1);
  for (const i of head) {
    const yf = (pos[i * 3 + 1] - chin) / H;
    if (yf < -dRow) continue;
    const dx = pos[i * 3];
    const dz = pos[i * 3 + 2] - cz;
    const rr = Math.hypot(dx, dz);
    let th = Math.atan2(dx, dz);
    if (th < 0) th += Math.PI * 2;
    const kf = (th / (Math.PI * 2)) * NA;
    const j0 = Math.max(0, Math.ceil((yf - dRow) * (NR - 1)));
    const j1 = Math.min(NR - 1, Math.floor((yf + dRow) * (NR - 1)));
    for (let j = j0; j <= j1; j++)
      for (let d = -1; d <= 1; d++) {
        const k = ((Math.round(kf) + d) % NA + NA) % NA;
        if (rr > r[j * NA + k]) r[j * NA + k] = rr;
      }
  }
  // Fill empty cells from their neighbours.
  for (let pass = 0; pass < 6; pass++) {
    const src = r.slice();
    for (let j = 0; j < NR; j++)
      for (let k = 0; k < NA; k++) {
        if (src[j * NA + k] > 0) continue;
        let s = 0;
        let c = 0;
        for (const [dj, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const jj = j + dj;
          if (jj < 0 || jj >= NR) continue;
          const v = src[jj * NA + ((k + dk + NA) % NA)];
          if (v > 0) {
            s += v;
            c++;
          }
        }
        if (c) r[j * NA + k] = s / c;
      }
  }
  // Ears: per row an ellipse 1/r^2 = sin^2/a^2 + cos^2/b^2 fitted to the cheeks and the back, standing in at the sides.
  let earSum = 0;
  let earW = 0;
  let earOut = 0;
  const earCells: [number, number][] = [];
  for (let j = 0; j < NR; j++) {
    const yf = j / (NR - 1);
    if (yf < 0.3 || yf > 0.7) continue;
    let sss = 0, scs = 0, ccc = 0, sy = 0, cy = 0, m = 0;
    for (let k = 0; k < NA; k++) {
      const deg = Math.abs(((k * 360) / NA + 180) % 360 - 180);
      if (!((deg >= 25 && deg <= 52) || (deg >= 128 && deg <= 155))) continue;
      const th = (k / NA) * Math.PI * 2;
      const s2 = Math.sin(th) ** 2;
      const c2 = Math.cos(th) ** 2;
      const y = 1 / (r[j * NA + k] ** 2);
      sss += s2 * s2;
      scs += s2 * c2;
      ccc += c2 * c2;
      sy += s2 * y;
      cy += c2 * y;
      m++;
    }
    const det = sss * ccc - scs * scs;
    if (m < 4 || Math.abs(det) < 1e-9) continue;
    const A = (sy * ccc - cy * scs) / det;
    const Bc = (cy * sss - sy * scs) / det;
    if (A <= 0 || Bc <= 0) continue;
    for (let k = 0; k < NA; k++) {
      const deg = Math.abs(((k * 360) / NA + 180) % 360 - 180);
      const w = smooth01(72, 86, deg) * smooth01(118, 104, deg);
      if (w <= 0) continue;
      const th = (k / NA) * Math.PI * 2;
      const fit = 1 / Math.sqrt(A * Math.sin(th) ** 2 + Bc * Math.cos(th) ** 2);
      const cur = r[j * NA + k];
      if (cur > fit) {
        const e = (cur - fit) * w;
        earSum += e * (chin + yf * H);
        earW += e;
        earOut = Math.max(earOut, cur - fit);
        earCells.push([chin + yf * H, cur - fit]);
        r[j * NA + k] = cur - e;
      }
    }
  }
  // Mirror-average (the heads are symmetric) and smooth a little.
  for (let j = 0; j < NR; j++)
    for (let k = 1; k < NA / 2; k++) {
      const a = j * NA + k;
      const b = j * NA + (NA - k);
      const v = (r[a] + r[b]) / 2;
      r[a] = r[b] = v;
    }
  const hull = r.slice();
  for (let pass = 0; pass < 2; pass++) {
    const src = r.slice();
    for (let j = 0; j < NR; j++)
      for (let k = 0; k < NA; k++) {
        const up = src[Math.min(NR - 1, j + 1) * NA + k];
        const dn = src[Math.max(0, j - 1) * NA + k];
        const l = src[j * NA + ((k + NA - 1) % NA)];
        const rt = src[j * NA + ((k + 1) % NA)];
        r[j * NA + k] = src[j * NA + k] * 0.5 + (up + dn + l + rt) * 0.125;
      }
  }
  // Smoothing must not dip below the measured hull (a cap would then sink into the nose or the chin) ...
  for (let i = 0; i < r.length; i++) r[i] = Math.max(r[i], hull[i] * 0.99);
  // ... and the crown closes in a dome (the last rows of the hull are a flat disc).
  const j0 = Math.round(0.88 * (NR - 1));
  for (let j = j0 + 1; j < NR; j++) {
    const t = (j - j0) / (NR - 1 - j0);
    const arc = Math.sqrt(Math.max(0, 1 - t * t));
    for (let k = 0; k < NA; k++) r[j * NA + k] = Math.min(r[j * NA + k], r[j0 * NA + k] * arc);
  }
  let earTop = chin + 0.6 * H;
  let earBottom = chin + 0.4 * H;
  for (const [y, e] of earCells) {
    if (e < 0.3 * earOut) continue;
    earTop = Math.max(earTop, y);
    earBottom = Math.min(earBottom, y);
  }
  return {
    sex,
    chin,
    crown,
    cz,
    r,
    noseTip,
    earY: earW > 0 ? earSum / earW : chin + 0.5 * H,
    earTop,
    earBottom,
    earOut,
    eyeY: eye.y,
    eyeX: eye.x,
    eyeZ: eye.z,
  };
}

const measures = new WeakMap<BodyArrays, HeadMeasure>();

/** `measureHead` cached per body arrays object (a morphed body always belongs to the same rig). */
export function headMeasureOf(body: BodyArrays, sex: 'male' | 'female', rig?: Rig): HeadMeasure {
  let m = measures.get(body);
  if (!m) {
    m = measureHead(body, sex, rig);
    measures.set(body, m);
  }
  return m;
}

/**
 * The head of one appearance: the measured table carried to its rig. Also a `RealHeadFrame`.
 * `hs` is the head size relative to the 0.232 m head the old procedural helmets were drawn for.
 */
export class HeadSurface implements RealHeadFrame {
  readonly centre: THREE.Vector3;
  readonly radii: THREE.Vector3;
  readonly brow: number;
  readonly ears: number;
  readonly crown: number;
  readonly chin: number;
  /** Chin-to-crown (m) and the scale against the old procedural head. */
  readonly H: number;
  readonly hs: number;
  /** Scale applied to the measurement (1 when it was taken on a body already morphed to the rig). */
  readonly k: number;
  /** Scale of the REFERENCE head to this one (rig.headH / ref.headH), whatever the measurement was taken on. */
  readonly kRef: number;
  /** Axis of the table: x is 0, z is `cz`. */
  readonly cz: number;
  readonly earOut: number;
  readonly earTop: number;
  readonly earBottom: number;
  /** Eye centres (left = +x, right), nose tip and the mouth line height (y). */
  readonly eyes: THREE.Vector3[];
  readonly noseTip: THREE.Vector3;
  readonly mouthY: number;
  private readonly r: Float32Array;
  /** The reference-pose measurement this surface was carried from. */
  readonly measure: HeadMeasure;

  /**
   * `m` measured on the reference-pose body is carried to `rig` (scaled about the head joint). With
   * `inRig` the measured body was already morphed to `rig` (RealBody's context), so it is used as is.
   */
  constructor(m: HeadMeasure, rig: Rig, inRig = false) {
    this.measure = m;
    const ref = inRig ? rig : refRig(m.sex);
    const k = ref.headH > 1e-6 ? rig.headH / ref.headH : 1;
    this.k = k;
    const r0 = refRig(m.sex);
    this.kRef = r0.headH > 1e-6 ? rig.headH / r0.headH : 1;
    const jr = (c: number) => ref.joints[B.head * 3 + c];
    const jt = (c: number) => rig.joints[B.head * 3 + c];
    const Y = (y: number) => jt(1) + k * (y - jr(1));
    const Z = (z: number) => jt(2) + k * (z - jr(2));
    this.chin = Y(m.chin);
    this.crown = Y(m.crown);
    this.H = this.crown - this.chin;
    this.hs = this.H / 0.232;
    this.cz = Z(m.cz);
    this.r = m.r.map((v) => v * k);
    this.earOut = m.earOut * k;
    this.ears = Y(m.earY);
    this.earTop = Y(m.earTop);
    this.earBottom = Y(m.earBottom);
    this.eyes = [new THREE.Vector3(m.eyeX * k, Y(m.eyeY), Z(m.eyeZ)), new THREE.Vector3(-m.eyeX * k, Y(m.eyeY), Z(m.eyeZ))];
    this.noseTip = new THREE.Vector3(m.noseTip.x * k, Y(m.noseTip.y), Z(m.noseTip.z));
    this.brow = Y(m.eyeY) + 0.075 * this.H;
    this.mouthY = this.chin + 0.245 * this.H;
    this.centre = new THREE.Vector3(0, this.chin + 0.6 * this.H, this.cz);
    this.radii = new THREE.Vector3(this.radius(0.6, Math.PI / 2), 0.5 * this.H, (this.radius(0.6, 0) + this.radius(0.6, Math.PI)) / 2);
  }

  /** Skull radius at height fraction yf (0 chin ... 1 crown) and azimuth th (0 front, +pi/2 left). */
  radius(yf: number, th: number): number {
    const f = Math.min(1, Math.max(0, yf)) * (NR - 1);
    const j = Math.min(NR - 2, Math.floor(f));
    const fj = f - j;
    let a = (th / (Math.PI * 2)) * NA;
    a = ((a % NA) + NA) % NA;
    const k = Math.floor(a);
    const fk = a - k;
    const k2 = (k + 1) % NA;
    const r = this.r;
    const lo = r[j * NA + k] * (1 - fk) + r[j * NA + k2] * fk;
    const hi = r[(j + 1) * NA + k] * (1 - fk) + r[(j + 1) * NA + k2] * fk;
    return lo * (1 - fj) + hi * fj;
  }

  /** The old HeadFrame's `at`: surface point at height fraction yf and azimuth th. */
  at(yf: number, th: number, out = new THREE.Vector3(), _raw = false): THREE.Vector3 {
    const y = Math.min(1, Math.max(0, yf));
    const r = Math.max(0.002, this.radius(y, th));
    return out.set(r * Math.sin(th), this.chin + y * this.H, this.cz + r * Math.cos(th));
  }

  /** Outward unit normal of the surface at (yf, th) (finite differences of `at`). */
  normalAt(yf: number, th: number, out = new THREE.Vector3()): THREE.Vector3 {
    const e = 0.02;
    const y0 = Math.min(1 - e, Math.max(e, yf));
    const a = this.at(y0 + e, th);
    const b = this.at(y0 - e, th);
    const c = this.at(y0, th + e);
    const d = this.at(y0, th - e);
    const du = a.sub(b);
    const dv = c.sub(d);
    // th increases toward +x at the front, so (dv x du) points outward.
    out.crossVectors(dv, du).normalize();
    // Make sure it points away from the axis.
    const p = this.at(y0, th);
    if (out.x * p.x + out.z * (p.z - this.cz) < 0) out.negate();
    return out;
  }
}

/** Head of one appearance from a context's body arrays (cached measurement). */
export function headSurface(body: BodyArrays, rig: Rig, sex: 'male' | 'female', inRig = false): HeadSurface {
  return new HeadSurface(headMeasureOf(body, sex, inRig ? rig : undefined), rig, inRig);
}
