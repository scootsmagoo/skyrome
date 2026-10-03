/**
 * Statues: simplified sculptural forms built from lathes, ellipsoids and tapered limbs with
 * real proportions (a 1.85 m figure is "life size"; Roman honorific statues were often a little
 * over life size, colossal cult statues far more). Silhouette first, detail second.
 *
 *  - togate(): a citizen/magistrate in the toga, right hand holding a scroll.
 *  - armoredEmperor(): cuirassed emperor in the adlocutio pose (Augustus of Prima Porta).
 *  - equestrian(): emperor on horseback, right foreleg raised (Equus Traiani, AD 112).
 *  - seatedDeity(): enthroned god with sceptre (Jupiter Optimus Maximus type).
 *  - quadriga(): four horses abreast with a chariot and driver (arch and temple crowns).
 *
 * Frame: origin at the base centre on the ground, the figure FACES −z (the facade convention of
 * the architecture kit), so its right hand is at +x. `scale` multiplies everything.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { ProfileBuilder, cylinderBetween, gridSurface, lathe, linspace, mul, tube, type V2 } from '../common/geom';
import type { Detail } from './orders';

export interface StatueOptions {
  material?: MaterialId;
  scale?: number;
  detail?: Detail;
  /** Add a plinth under the feet (default true). */
  plinth?: boolean;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Collects geometry for one statue, then adds it to the builder in one go. */
class Sculpt {
  readonly parts: THREE.BufferGeometry[] = [];
  constructor(readonly hi: boolean) {}
  get seg() {
    return this.hi ? 12 : 6;
  }
  /** Ellipsoid. */
  blob(c: THREE.Vector3, rx: number, ry: number, rz: number, rot?: THREE.Euler) {
    const g = new THREE.SphereGeometry(1, this.hi ? 14 : 8, this.hi ? 10 : 6);
    g.scale(rx, ry, rz);
    if (rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(rot));
    g.translate(c.x, c.y, c.z);
    this.parts.push(g);
    return this;
  }
  /** Tapered limb between two joints, with rounded joints. */
  limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, joints = true) {
    this.parts.push(cylinderBetween(a, b, ra, rb, this.seg, false));
    if (joints) {
      this.blob(a, ra, ra, ra);
      this.blob(b, rb, rb, rb);
    }
    return this;
  }
  /** Draped lathe with vertical folds: profile (r, y), cross-section squashed by `sx, sz`. */
  drape(profile: V2[], folds: number, amp: number, sx = 1, sz = 1, theta0 = 0, theta1 = Math.PI * 2, center = V(0, 0, 0)) {
    const ys = profile.map((p) => p[1]);
    const rAt = (y: number) => {
      for (let i = 0; i < profile.length - 1; i++) {
        const [r0, y0] = profile[i];
        const [r1, y1] = profile[i + 1];
        if (y >= Math.min(y0, y1) && y <= Math.max(y0, y1)) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
      }
      return profile[profile.length - 1][0];
    };
    const ths = linspace(theta0, theta1, this.hi ? 40 : 14);
    const y0 = ys[0];
    const y1 = ys[ys.length - 1];
    const rows = linspace(0, 1, this.hi ? Math.max(6, profile.length * 2) : profile.length);
    const g = gridSurface(ths, rows, (a, t, out) => {
      const y = y0 + (y1 - y0) * t;
      const fold = this.hi ? amp * (1 - t * 0.7) * Math.sin(a * folds + Math.sin(t * 5) * 0.6) : 0;
      const r = rAt(y) + fold;
      return out.set(center.x + Math.sin(a) * r * sx, y, center.z + Math.cos(a) * r * sz);
    });
    this.parts.push(g);
    return this;
  }
  tube(path: THREE.Vector3[], r: number | ((i: number) => number), radial = 6) {
    this.parts.push(tube(path, r, this.hi ? radial : 4));
    return this;
  }
  box(c: THREE.Vector3, w: number, h: number, d: number, rot?: THREE.Euler) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(rot));
    g.translate(c.x, c.y, c.z);
    this.parts.push(g);
    return this;
  }
  emit(b: MeshBuilder, mat: MaterialId, at: THREE.Matrix4, scale: number) {
    const m = at.clone().multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
    for (const g of this.parts) b.add(g, mat, m);
  }
}

/** Head with hair cap and nose; optional laurel wreath. Neck base at `neck`. */
function head(s: Sculpt, neck: THREE.Vector3, opts: { wreath?: boolean; beard?: boolean; tilt?: number } = {}) {
  const c = neck.clone().add(V(0, 0.17, 0));
  s.limb(neck.clone().add(V(0, -0.02, 0)), neck.clone().add(V(0, 0.08, -0.01)), 0.058, 0.052, false);
  s.blob(c, 0.094, 0.118, 0.108);
  // hair cap, slightly larger at the back/top
  s.blob(c.clone().add(V(0, 0.028, 0.012)), 0.1, 0.1, 0.108);
  // nose and brow
  s.box(c.clone().add(V(0, -0.012, -0.108)), 0.024, 0.05, 0.03, new THREE.Euler(0.25, 0, 0));
  s.box(c.clone().add(V(0, 0.03, -0.095)), 0.1, 0.02, 0.025);
  // chin/jaw
  s.blob(c.clone().add(V(0, -0.07, -0.05)), 0.06, 0.05, 0.06);
  if (opts.beard) s.blob(c.clone().add(V(0, -0.08, -0.05)), 0.08, 0.08, 0.07);
  if (opts.wreath) {
    const t = new THREE.TorusGeometry(0.105, 0.016, 5, s.hi ? 18 : 10);
    t.rotateX(Math.PI / 2 - 0.15);
    t.translate(c.x, c.y + 0.045, c.z + 0.01);
    s.parts.push(t);
  }
  return c;
}

function plinth(s: Sculpt, w: number, d: number, h = 0.14) {
  s.box(V(0, h / 2, 0), w, h, d);
  return h;
}

/** A citizen in the toga: weight on the right leg, right hand forward with a scroll. */
export function togate(b: MeshBuilder, at: THREE.Matrix4, opts: StatueOptions = {}) {
  const s = new Sculpt((opts.detail ?? 'high') === 'high');
  const y0 = opts.plinth === false ? 0 : plinth(s, 0.62, 0.52);
  const Y = (y: number) => y + y0;
  // Feet (calcei) peeping out under the hem.
  s.box(V(0.1, Y(0.04), -0.1), 0.1, 0.08, 0.26).box(V(-0.12, Y(0.04), -0.06), 0.1, 0.08, 0.26, new THREE.Euler(0, 0.25, 0));
  // The toga: a long draped bell from the hem to the shoulders, elliptical in section.
  s.drape(
    [
      [0.27, Y(0.05)],
      [0.25, Y(0.35)],
      [0.23, Y(0.8)],
      [0.235, Y(1.05)],
      [0.24, Y(1.3)],
      [0.22, Y(1.45)],
      [0.13, Y(1.54)],
      [0.06, Y(1.57)],
    ],
    13,
    0.014,
    1.08,
    0.78,
  );
  // Sinus: the heavy fold from the left shoulder across the body to the right hip and round.
  s.tube([V(-0.17, Y(1.48), -0.04), V(-0.05, Y(1.3), -0.19), V(0.12, Y(1.05), -0.2), V(0.24, Y(0.9), -0.08), V(0.22, Y(0.85), 0.12)], 0.05);
  // Umbo (pouch of cloth pulled over the balteus).
  s.blob(V(-0.02, Y(1.18), -0.19), 0.09, 0.07, 0.05);
  // Left arm wrapped in the toga: shoulder → elbow at the side → forearm forward, drapery hanging.
  s.limb(V(-0.21, Y(1.45), 0), V(-0.25, Y(1.15), -0.02), 0.075, 0.07);
  s.limb(V(-0.25, Y(1.15), -0.02), V(-0.2, Y(1.08), -0.27), 0.068, 0.055);
  s.drape(
    [
      [0.08, Y(0.45)],
      [0.1, Y(0.8)],
      [0.07, Y(1.08)],
    ],
    5,
    0.01,
    1.1,
    0.6,
    0,
    Math.PI * 2,
    V(-0.2, 0, -0.24),
  );
  // Right arm: tunic sleeve, bare forearm, hand with a rolled scroll.
  s.limb(V(0.21, Y(1.45), 0), V(0.25, Y(1.17), 0.02), 0.06, 0.05);
  s.limb(V(0.25, Y(1.17), 0.02), V(0.24, Y(1.06), -0.24), 0.045, 0.035);
  s.blob(V(0.24, Y(1.05), -0.29), 0.04, 0.045, 0.05);
  s.limb(V(0.24, Y(1.0), -0.29), V(0.24, Y(1.13), -0.31), 0.022, 0.022);
  head(s, V(0, Y(1.56), -0.01));
  s.emit(b, opts.material ?? 'marble', at, opts.scale ?? 1);
}

/** Cuirassed emperor, right arm raised in address, sceptre/spear in the left. */
export function armoredEmperor(b: MeshBuilder, at: THREE.Matrix4, opts: StatueOptions & { spear?: boolean } = {}) {
  const s = new Sculpt((opts.detail ?? 'high') === 'high');
  const y0 = opts.plinth === false ? 0 : plinth(s, 0.62, 0.55);
  const Y = (y: number) => y + y0;
  // Legs: weight on the right (+x) leg, left knee relaxed forward. Boots to mid-shin.
  const hipR = V(0.1, Y(0.9), 0);
  const hipL = V(-0.1, Y(0.9), 0);
  const kneeR = V(0.11, Y(0.5), -0.02);
  const kneeL = V(-0.13, Y(0.51), -0.1);
  const ankR = V(0.11, Y(0.08), 0.0);
  const ankL = V(-0.16, Y(0.1), 0.08);
  s.limb(hipR, kneeR, 0.085, 0.058).limb(kneeR, ankR, 0.058, 0.04);
  s.limb(hipL, kneeL, 0.085, 0.058).limb(kneeL, ankL, 0.058, 0.04);
  s.box(V(0.11, Y(0.04), -0.07), 0.1, 0.08, 0.24).box(V(-0.16, Y(0.05), 0.0), 0.1, 0.08, 0.24, new THREE.Euler(0.15, 0, 0));
  // Tunic skirt and pteruges (leather strips) round the hips.
  s.drape(
    [
      [0.22, Y(0.66)],
      [0.21, Y(0.8)],
      [0.19, Y(0.98)],
    ],
    16,
    0.012,
    1.05,
    0.8,
  );
  if (s.hi) {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const p = V(Math.sin(a) * 0.215, Y(0.86), Math.cos(a) * 0.17);
      s.box(p, 0.06, 0.16, 0.02, new THREE.Euler(0, a, 0));
    }
  }
  // Muscle cuirass.
  s.drape(
    [
      [0.2, Y(0.94)],
      [0.185, Y(1.05)],
      [0.21, Y(1.22)],
      [0.225, Y(1.35)],
      [0.2, Y(1.46)],
      [0.1, Y(1.54)],
      [0.06, Y(1.56)],
    ],
    2,
    0,
    1.1,
    0.75,
  );
  s.blob(V(0.08, Y(1.32), -0.13), 0.09, 0.08, 0.05).blob(V(-0.08, Y(1.32), -0.13), 0.09, 0.08, 0.05);
  // Paludamentum: cloak round the hips and over the left forearm.
  s.drape(
    [
      [0.25, Y(0.55)],
      [0.24, Y(0.85)],
      [0.21, Y(1.0)],
    ],
    9,
    0.015,
    1.1,
    0.85,
    Math.PI * 0.55,
    Math.PI * 1.75,
  );
  s.tube([V(-0.2, Y(1.47), 0.05), V(-0.24, Y(1.2), 0.08), V(-0.26, Y(1.05), -0.12), V(-0.18, Y(0.95), -0.2), V(0.1, Y(0.98), -0.22), V(0.24, Y(0.95), -0.06)], 0.05);
  // Right arm raised (adlocutio): upper arm forward and out, forearm up, open hand.
  const shR = V(0.22, Y(1.46), 0);
  const elR = V(0.36, Y(1.5), -0.25);
  const wrR = V(0.4, Y(1.78), -0.32);
  s.limb(shR, elR, 0.06, 0.048).limb(elR, wrR, 0.045, 0.035);
  s.blob(V(0.41, Y(1.86), -0.34), 0.035, 0.065, 0.02, new THREE.Euler(-0.3, 0, 0));
  // Left arm bent, holding a spear upright.
  const shL = V(-0.22, Y(1.46), 0);
  const elL = V(-0.27, Y(1.18), 0.02);
  const wrL = V(-0.27, Y(1.1), -0.2);
  s.limb(shL, elL, 0.06, 0.05).limb(elL, wrL, 0.046, 0.036);
  s.blob(wrL.clone().add(V(0, 0, -0.04)), 0.04, 0.045, 0.045);
  if (opts.spear ?? true) s.limb(V(-0.27, Y(0.12), -0.24), V(-0.27, Y(2.05), -0.24), 0.016, 0.016, false);
  head(s, V(0, Y(1.56), -0.01), { wreath: true });
  s.emit(b, opts.material ?? 'marble', at, opts.scale ?? 1);
}

/** Horse body in a walking pose, right foreleg raised. Origin on the ground under the barrel. */
function horse(s: Sculpt, o: THREE.Vector3, pose: 'walk' | 'rear' = 'walk') {
  const P = (x: number, y: number, z: number) => V(o.x + x, o.y + y, o.z + z);
  const lift = pose === 'rear' ? 0.25 : 0;
  /** Ellipsoid whose long axis (ry) runs from a to b. */
  const along = (a: THREE.Vector3, c: THREE.Vector3, rx: number, rz: number) => {
    const dir = c.clone().sub(a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize());
    const g = new THREE.SphereGeometry(1, s.hi ? 14 : 8, s.hi ? 10 : 6);
    g.scale(rx, len / 2, rz);
    g.applyQuaternion(q);
    const m = a.clone().add(c).multiplyScalar(0.5);
    g.translate(m.x, m.y, m.z);
    s.parts.push(g);
  };
  // barrel, chest, haunches: one long body with a deeper chest and rounder quarters
  s.blob(P(0, 1.22, 0.02), 0.3, 0.33, 0.74);
  s.blob(P(0, 1.2 + lift * 0.5, -0.5), 0.27, 0.33, 0.3);
  s.blob(P(0, 1.28, 0.55), 0.31, 0.35, 0.34);
  s.blob(P(0, 1.47, -0.2), 0.16, 0.08, 0.4); // back line / withers
  // neck: flattened sideways, from the withers to the poll
  const withers = P(0, 1.42 + lift * 0.7, -0.6);
  const poll = P(0, 2.0 + lift, -1.0);
  along(withers, poll, 0.12, 0.2);
  s.tube([P(0, 1.58 + lift * 0.7, -0.52), P(0, 1.9 + lift, -0.82), P(0, 2.08 + lift, -0.98)], (i) => 0.05 - i * 0.008, 4); // crest/mane
  // head: a long wedge from the poll down to the muzzle, with jaw and muzzle
  const muzzle = P(0, 1.6 + lift, -1.38);
  along(poll.clone().add(V(0, 0.02, -0.02)), muzzle, 0.095, 0.12);
  s.blob(muzzle.clone().add(V(0, -0.01, 0.0)), 0.075, 0.07, 0.085);
  s.blob(P(0, 1.84 + lift, -1.06), 0.1, 0.1, 0.11); // jowl
  for (const x of [-0.055, 0.055]) s.limb(P(x, 2.08 + lift, -1.01), P(x * 1.5, 2.22 + lift, -0.98), 0.024, 0.006, false);
  // tail
  s.tube([P(0, 1.45, 0.92), P(0, 1.3, 1.08), P(0, 0.95, 1.14), P(0, 0.72, 1.1)], (i) => 0.07 - i * 0.012);
  // legs: [hip/shoulder, knee/hock, fetlock, hoof]
  const legs: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
    // front right: raised
    [P(0.17, 1.05 + lift, -0.62), P(0.2, 0.78 + lift, -0.86), P(0.2, 0.62 + lift, -0.72), P(0.2, 0.55 + lift, -0.66)],
    // front left
    [P(-0.17, 1.02 + lift * 0.5, -0.6), P(-0.18, 0.55, -0.62), P(-0.18, 0.18, -0.6), P(-0.18, 0.04, -0.62)],
    // hind right
    [P(0.18, 1.05, 0.62), P(0.2, 0.6, 0.78), P(0.19, 0.2, 0.66), P(0.19, 0.04, 0.68)],
    // hind left
    [P(-0.18, 1.05, 0.6), P(-0.19, 0.6, 0.68), P(-0.18, 0.2, 0.52), P(-0.18, 0.04, 0.5)],
  ];
  for (const [a, k, f, h] of legs) {
    s.limb(a, k, 0.11, 0.065).limb(k, f, 0.05, 0.042).limb(f, h, 0.042, 0.055, false);
    s.blob(h.clone().add(V(0, -0.01, -0.02)), 0.058, 0.04, 0.065);
  }
}

/** Seated rider in cuirass and cloak, right arm extended. `seat` = saddle point. */
function rider(s: Sculpt, seat: THREE.Vector3) {
  const P = (x: number, y: number, z: number) => V(seat.x + x, seat.y + y, seat.z + z);
  for (const sx of [-1, 1]) {
    const hip = P(0.11 * sx, 0.08, 0);
    const knee = P(0.33 * sx, -0.25, -0.24);
    const ankle = P(0.34 * sx, -0.66, -0.1);
    s.limb(hip, knee, 0.09, 0.06).limb(knee, ankle, 0.055, 0.04);
    s.box(ankle.clone().add(V(0, -0.03, -0.07)), 0.09, 0.07, 0.22);
  }
  s.drape(
    [
      [0.19, seat.y + 0.02],
      [0.2, seat.y + 0.3],
      [0.22, seat.y + 0.45],
      [0.19, seat.y + 0.58],
      [0.09, seat.y + 0.66],
      [0.06, seat.y + 0.68],
    ].map(([r, y]) => [r, y] as V2),
    2,
    0,
    1.1,
    0.75,
    0,
    Math.PI * 2,
    V(seat.x, 0, seat.z),
  );
  // cloak flowing back over the horse's rump
  s.tube([P(-0.15, 0.6, 0.06), P(-0.05, 0.45, 0.3), P(0.0, 0.2, 0.45), P(0.05, -0.1, 0.5)], (i) => 0.06 + i * 0.01);
  // right arm extended forward (the gesture of clementia)
  s.limb(P(0.22, 0.58, 0), P(0.38, 0.55, -0.24), 0.06, 0.048).limb(P(0.38, 0.55, -0.24), P(0.45, 0.62, -0.5), 0.045, 0.034);
  s.blob(P(0.46, 0.63, -0.55), 0.035, 0.06, 0.02, new THREE.Euler(0.4, 0, 0));
  // left arm holding the reins
  s.limb(P(-0.22, 0.58, 0), P(-0.24, 0.32, -0.12), 0.06, 0.048).limb(P(-0.24, 0.32, -0.12), P(-0.1, 0.25, -0.38), 0.045, 0.034);
  head(s, P(0, 0.67, -0.01), { wreath: true });
}

/** Emperor on horseback on a tall pedestal (Equus Traiani). */
export function equestrian(b: MeshBuilder, at: THREE.Matrix4, opts: StatueOptions & { pedestal?: number } = {}) {
  const s = new Sculpt((opts.detail ?? 'high') === 'high');
  const y0 = opts.plinth === false ? 0 : plinth(s, 0.9, 2.6, 0.12);
  horse(s, V(0, y0, 0));
  rider(s, V(0, y0 + 1.58, -0.05));
  s.emit(b, opts.material ?? 'gilded_bronze', at, opts.scale ?? 1);
}

/** Enthroned deity with sceptre, holding a small Victory (orb) on the left palm. */
export function seatedDeity(b: MeshBuilder, at: THREE.Matrix4, opts: StatueOptions & { throneMaterial?: MaterialId } = {}) {
  const s = new Sculpt((opts.detail ?? 'high') === 'high');
  const t = new Sculpt(s.hi);
  const y0 = opts.plinth === false ? 0 : plinth(t, 1.1, 1.0, 0.18);
  const Y = (y: number) => y + y0;
  // Throne: seat block, high back, arm rests with sphinx-like blocks.
  t.box(V(0, Y(0.25), 0.05), 0.82, 0.5, 0.7);
  t.box(V(0, Y(0.95), 0.38), 0.82, 1.4, 0.1);
  for (const sx of [-1, 1]) {
    t.box(V(0.38 * sx, Y(0.68), 0.05), 0.08, 0.36, 0.66);
    t.box(V(0.38 * sx, Y(0.55), -0.32), 0.1, 0.22, 0.12);
  }
  // Seated figure: thighs horizontal, shins vertical, himation over the lap and legs.
  for (const sx of [-1, 1]) {
    const hip = V(0.12 * sx, Y(0.62), 0.12);
    const knee = V(0.14 * sx, Y(0.64), -0.36);
    const ankle = V(0.15 * sx, Y(0.08), -0.38 - (sx > 0 ? 0 : 0.08));
    s.limb(hip, knee, 0.1, 0.075).limb(knee, ankle, 0.07, 0.045);
    s.box(ankle.clone().add(V(0, -0.03, -0.08)), 0.1, 0.07, 0.24);
  }
  s.box(V(0, Y(0.62), -0.14), 0.44, 0.12, 0.56);
  s.drape(
    [
      [0.2, Y(0.06)],
      [0.22, Y(0.4)],
      [0.22, Y(0.62)],
    ],
    9,
    0.014,
    1.25,
    0.5,
    Math.PI * 0.6,
    Math.PI * 1.4,
    V(0, 0, -0.32),
  );
  // Bare torso (heroic nudity), cloak over the left shoulder.
  s.drape(
    [
      [0.2, Y(0.66)],
      [0.2, Y(0.85)],
      [0.235, Y(1.05)],
      [0.22, Y(1.18)],
      [0.1, Y(1.27)],
      [0.06, Y(1.29)],
    ],
    2,
    0,
    1.12,
    0.75,
    0,
    Math.PI * 2,
    V(0, 0, 0.12),
  );
  s.blob(V(0.085, Y(1.05), -0.03), 0.09, 0.08, 0.05).blob(V(-0.085, Y(1.05), -0.03), 0.09, 0.08, 0.05);
  s.tube([V(-0.22, Y(1.2), 0.1), V(-0.27, Y(0.95), 0.1), V(-0.28, Y(0.7), 0.02)], 0.06);
  // Right arm raised holding the sceptre; left forearm forward with an orb/Victory.
  const shR = V(0.23, Y(1.18), 0.12);
  const elR = V(0.36, Y(1.32), 0.0);
  const hR = V(0.38, Y(1.58), -0.08);
  s.limb(shR, elR, 0.065, 0.05).limb(elR, hR, 0.048, 0.038);
  s.limb(V(0.38, Y(0.12), -0.1), V(0.38, Y(2.0), -0.06), 0.02, 0.02, false);
  s.blob(V(0.38, Y(2.04), -0.06), 0.045, 0.06, 0.045);
  const shL = V(-0.23, Y(1.18), 0.12);
  const elL = V(-0.27, Y(0.9), 0.05);
  const hL = V(-0.24, Y(0.88), -0.24);
  s.limb(shL, elL, 0.065, 0.05).limb(elL, hL, 0.048, 0.038);
  s.blob(V(-0.24, Y(0.94), -0.27), 0.05, 0.05, 0.05);
  head(s, V(0, Y(1.28), 0.11), { beard: true, wreath: true });
  const scale = opts.scale ?? 1;
  s.emit(b, opts.material ?? 'marble', at, scale);
  t.emit(b, opts.throneMaterial ?? 'marble', at, scale);
}

/** Four horses abreast with a chariot and a standing driver (crown of an arch). */
export function quadriga(b: MeshBuilder, at: THREE.Matrix4, opts: StatueOptions & { driverMaterial?: MaterialId } = {}) {
  const hi = (opts.detail ?? 'high') === 'high';
  const s = new Sculpt(hi);
  const y0 = opts.plinth === false ? 0 : plinth(s, 2.9, 4.4, 0.12);
  const xs = [-1.05, -0.35, 0.35, 1.05];
  xs.forEach((x, i) => horse(s, V(x, y0, -0.9), i === 1 || i === 2 ? 'walk' : 'rear'));
  // Yoke across the necks.
  s.limb(V(-1.2, y0 + 1.75, -1.55), V(1.2, y0 + 1.75, -1.55), 0.035, 0.035, false);
  // Chariot: car with a curved breastwork, axle and wheels.
  const car = new THREE.CylinderGeometry(0.62, 0.62, 1.0, hi ? 16 : 8, 1, true, -Math.PI / 2, Math.PI);
  car.translate(0, y0 + 1.0, 0.9);
  s.parts.push(car);
  s.box(V(0, y0 + 0.52, 1.1), 1.3, 0.06, 0.65);
  for (const sx of [-1, 1]) {
    const w = new THREE.TorusGeometry(0.5, 0.045, 5, hi ? 18 : 10);
    w.rotateY(Math.PI / 2);
    w.translate(0.72 * sx, y0 + 0.5, 1.15);
    s.parts.push(w);
    for (let k = 0; k < (hi ? 6 : 3); k++) {
      const a = (k / (hi ? 6 : 3)) * Math.PI;
      s.limb(V(0.72 * sx, y0 + 0.5 + Math.cos(a) * 0.48, 1.15 + Math.sin(a) * 0.48), V(0.72 * sx, y0 + 0.5 - Math.cos(a) * 0.48, 1.15 - Math.sin(a) * 0.48), 0.018, 0.018, false);
    }
  }
  s.limb(V(-0.8, y0 + 0.5, 1.15), V(0.8, y0 + 0.5, 1.15), 0.03, 0.03, false);
  s.limb(V(0, y0 + 0.55, 0.6), V(0, y0 + 1.5, -1.5), 0.035, 0.035, false); // pole
  const scale = opts.scale ?? 1;
  s.emit(b, opts.material ?? 'gilded_bronze', at, scale);
  armoredEmperor(b, mul(at, new THREE.Matrix4().makeScale(scale, scale, scale).setPosition(new THREE.Vector3(0, (y0 + 0.55) * scale, 1.1 * scale))), {
    material: opts.driverMaterial ?? opts.material ?? 'gilded_bronze',
    detail: opts.detail,
    plinth: false,
    spear: false,
    scale: scale * 0.95,
  });
}

/** Low-relief strip of standing figures (procession panels on arches). Faces −z, in the XY plane. */
export function reliefProcession(b: MeshBuilder, at: THREE.Matrix4, width: number, height: number, opts: StatueOptions & { count?: number; depth?: number } = {}) {
  const n = opts.count ?? Math.max(3, Math.round(width / (height * 0.42)));
  const figH = height * 0.86;
  const sc = figH / 1.85;
  const flat = new THREE.Matrix4().makeScale(1, 1, (opts.depth ?? 0.12) / (0.5 * sc));
  for (let i = 0; i < n; i++) {
    const x = -width / 2 + ((i + 0.5) * width) / n;
    const m = at.clone().multiply(new THREE.Matrix4().makeTranslation(x, height * 0.06, 0)).multiply(flat).multiply(new THREE.Matrix4().makeRotationY(i % 3 === 0 ? -0.5 : -0.25));
    const fn = i % 4 === 1 ? armoredEmperor : togate;
    fn(b, m, { ...opts, plinth: false, scale: sc, detail: 'low' });
  }
}
