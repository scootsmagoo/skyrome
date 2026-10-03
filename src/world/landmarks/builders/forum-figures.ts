/**
 * Statuary of the Forum that the kit's statues.ts does not cover: the heroic nude (Sol, the
 * Dioscuri, Marsyas), draped women (Vestals, Juturna, Venus Cloacina), a winged Victory on a globe,
 * a two-faced Janus and the horses of the Dioscuri. Built like the kit's figures: ellipsoids,
 * tapered limbs and draped lathes with folds, real proportions (1.85 m at scale 1), facing −z,
 * origin at the feet. Silhouette first; detail scales with `hi`.
 */
import * as THREE from 'three';
import { cylinderBetween, extrudePolygon, gridSurface, linspace, tube, type V2 } from '../../../arch/common/geom';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Collects the parts of one figure and adds them to a builder in one go (per material). */
export class Sculpt {
  readonly parts = new Map<MaterialId | THREE.Material, THREE.BufferGeometry[]>();
  mat: MaterialId | THREE.Material;
  constructor(
    readonly hi: boolean,
    mat: MaterialId | THREE.Material = 'bronze',
    /** Tessellation multiplier for colossal figures seen up close (the Colossus). */
    readonly q = 1,
  ) {
    this.mat = mat;
  }
  get seg() {
    return Math.round((this.hi ? 10 : 5) * this.q);
  }
  private push(g: THREE.BufferGeometry, mat?: MaterialId | THREE.Material) {
    const k = mat ?? this.mat;
    const l = this.parts.get(k) ?? [];
    l.push(g);
    this.parts.set(k, l);
  }
  blob(c: THREE.Vector3, rx: number, ry: number, rz: number, rot?: THREE.Euler, mat?: MaterialId | THREE.Material) {
    const g = new THREE.SphereGeometry(1, Math.round((this.hi ? 12 : 6) * this.q), Math.round((this.hi ? 9 : 4) * this.q));
    g.scale(rx, ry, rz);
    if (rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(rot));
    g.translate(c.x, c.y, c.z);
    this.push(g, mat);
    return this;
  }
  limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, joints = true, mat?: MaterialId | THREE.Material) {
    this.push(cylinderBetween(a, b, ra, rb, this.seg, false), mat);
    if (joints) {
      this.blob(a, ra, ra, ra, undefined, mat);
      this.blob(b, rb, rb, rb, undefined, mat);
    }
    return this;
  }
  /** Draped lathe: profile (r, y), folds, squashed by sx/sz, over [theta0, theta1], centred at `center`. */
  drape(profile: V2[], folds: number, amp: number, sx = 1, sz = 1, theta0 = 0, theta1 = Math.PI * 2, center = V(0, 0, 0), mat?: MaterialId | THREE.Material) {
    const ys = profile.map((p) => p[1]);
    const rAt = (y: number) => {
      for (let i = 0; i < profile.length - 1; i++) {
        const [r0, y0] = profile[i];
        const [r1, y1] = profile[i + 1];
        if (y >= Math.min(y0, y1) && y <= Math.max(y0, y1)) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
      }
      return profile[profile.length - 1][0];
    };
    const ths = linspace(theta0, theta1, Math.round((this.hi ? 32 : 12) * this.q));
    const y0 = ys[0];
    const y1 = ys[ys.length - 1];
    const rows = linspace(0, 1, Math.round((this.hi ? Math.max(5, profile.length * 2) : profile.length) * this.q));
    const g = gridSurface(ths, rows, (a, t, out) => {
      const y = y0 + (y1 - y0) * t;
      const fold = this.hi ? amp * (1 - t * 0.6) * Math.sin(a * folds + Math.sin(t * 5) * 0.6) : 0;
      const r = rAt(y) + fold;
      return out.set(center.x + Math.sin(a) * r * sx, y, center.z + Math.cos(a) * r * sz);
    });
    this.push(g, mat);
    return this;
  }
  tube(path: THREE.Vector3[], r: number | ((i: number) => number), radial = 6, mat?: MaterialId | THREE.Material) {
    this.push(tube(path, r, this.hi ? radial : 4), mat);
    return this;
  }
  box(c: THREE.Vector3, w: number, h: number, d: number, rot?: THREE.Euler, mat?: MaterialId | THREE.Material) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(rot));
    g.translate(c.x, c.y, c.z);
    this.push(g, mat);
    return this;
  }
  geo(g: THREE.BufferGeometry, mat?: MaterialId | THREE.Material) {
    this.push(g, mat);
    return this;
  }
  /** Add everything to `b` at `at`, scaled uniformly. */
  emit(b: MeshBuilder, at: THREE.Matrix4, scale = 1) {
    const m = at.clone().multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
    for (const [mat, list] of this.parts) for (const g of list) b.add(g, mat, m);
  }
}

// ---------------------------------------------------------------- heads

export interface HeadOpts {
  crown?: 'radiate' | 'wreath' | 'pileus' | 'veil' | 'diadem' | 'none';
  beard?: boolean;
  /** Second face on the back (Janus). */
  janus?: boolean;
  /** Material for the crown / rays. */
  crownMat?: MaterialId | THREE.Material;
  rays?: number;
  /** Ray length relative to the figure (1.85 m tall). */
  rayLen?: number;
}

/** Head on the neck base `neck`, facing −z. Returns the head centre. */
export function head(s: Sculpt, neck: THREE.Vector3, o: HeadOpts = {}) {
  const c = neck.clone().add(V(0, 0.17, 0));
  s.limb(neck.clone().add(V(0, -0.03, 0)), neck.clone().add(V(0, 0.08, -0.01)), 0.06, 0.054, false);
  s.blob(c, 0.094, 0.118, 0.106);
  const face = (dir: 1 | -1) => {
    // nose, brow ridge, chin
    s.box(c.clone().add(V(0, -0.012, dir * -0.106)), 0.024, 0.05, 0.03, new THREE.Euler(dir * 0.25, 0, 0));
    s.box(c.clone().add(V(0, 0.03, dir * -0.094)), 0.1, 0.02, 0.025);
    s.blob(c.clone().add(V(0, -0.07, dir * -0.048)), 0.06, 0.05, 0.06);
    if (o.beard) s.blob(c.clone().add(V(0, -0.085, dir * -0.05)), 0.085, 0.085, 0.07);
  };
  face(1);
  if (o.janus) face(-1);
  // hair cap (curly locks: a slightly bigger cap)
  s.blob(c.clone().add(V(0, 0.03, o.janus ? 0 : 0.012)), 0.102, 0.1, o.janus ? 0.1 : 0.11);
  const cm = o.crownMat;
  switch (o.crown) {
    case 'wreath': {
      const t = new THREE.TorusGeometry(0.105, 0.016, 5, s.hi ? 18 : 10);
      t.rotateX(Math.PI / 2 - 0.12);
      t.translate(c.x, c.y + 0.045, c.z + 0.01);
      s.geo(t, cm);
      break;
    }
    case 'diadem': {
      const t = new THREE.TorusGeometry(0.104, 0.012, 4, s.hi ? 18 : 10);
      t.rotateX(Math.PI / 2);
      t.translate(c.x, c.y + 0.05, c.z);
      s.geo(t, cm);
      break;
    }
    case 'pileus': {
      // egg-shaped felt cap of the Dioscuri, with a star above
      s.blob(c.clone().add(V(0, 0.09, 0.01)), 0.1, 0.12, 0.1, undefined, cm);
      s.blob(c.clone().add(V(0, 0.27, 0.01)), 0.03, 0.03, 0.03, undefined, cm ?? 'gilded_bronze');
      break;
    }
    case 'veil': {
      // Vestal: infulae band and the suffibulum veil falling to the shoulders
      const t = new THREE.TorusGeometry(0.1, 0.018, 4, s.hi ? 16 : 8);
      t.rotateX(Math.PI / 2);
      t.translate(c.x, c.y + 0.05, c.z);
      s.geo(t, cm);
      s.drape(
        [
          [0.11, c.y - 0.2],
          [0.125, c.y - 0.05],
          [0.112, c.y + 0.08],
          [0.06, c.y + 0.12],
        ],
        6,
        0.006,
        1,
        1,
        Math.PI * 0.55,
        Math.PI * 1.45,
        V(c.x, 0, c.z + 0.015),
        cm,
      );
      break;
    }
    case 'radiate': {
      // Sol: a band with seven rays fanning up and out
      const t = new THREE.TorusGeometry(0.105, 0.014, 4, s.hi ? 18 : 10);
      t.rotateX(Math.PI / 2 - 0.1);
      t.translate(c.x, c.y + 0.05, c.z + 0.005);
      s.geo(t, cm);
      const n = o.rays ?? 7;
      const L = o.rayLen ?? 0.3;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI * 0.42 + (Math.PI * 0.84 * i) / (n - 1);
        const base = c.clone().add(V(Math.sin(a) * 0.1, 0.07 + Math.cos(a) * 0.02, -0.02));
        const tip = c.clone().add(V(Math.sin(a) * (0.1 + L * 0.95), 0.07 + Math.cos(a) * L, -0.04));
        // a flat tapering blade
        const dir = tip.clone().sub(base);
        const len = dir.length();
        const blade = extrudePolygon(
          [
            [-0.022, 0],
            [0.022, 0],
            [0.004, len],
            [-0.004, len],
          ],
          0.012,
        );
        blade.translate(0, 0, 0.006);
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize());
        blade.applyQuaternion(q);
        blade.translate(base.x, base.y, base.z);
        s.geo(blade, cm);
      }
      break;
    }
    default:
      break;
  }
  return c;
}

// ---------------------------------------------------------------- nude male

export interface NudeOpts {
  /** 'raised' (Sol's greeting), 'brow' (hand to the brow), 'down', 'forward' (adlocutio), 'spear' (holding a tall spear). */
  right?: 'raised' | 'brow' | 'down' | 'forward' | 'spear';
  /** 'rudder' (Sol: on a rudder on a globe), 'reins', 'down', 'wineskin' (Marsyas), 'spear'. */
  left?: 'rudder' | 'reins' | 'down' | 'wineskin' | 'spear' | 'globe';
  cloak?: boolean;
  belly?: boolean;
  /** Satyr ears and tail (Marsyas). */
  satyr?: boolean;
  head?: HeadOpts;
  /** Material for the attributes (rudder, globe, spear). */
  attrMat?: MaterialId | THREE.Material;
  plinth?: boolean;
}

/** A standing nude male in contrapposto (weight on the right leg), 1.85 m. */
export function nudeMale(s: Sculpt, o: NudeOpts = {}) {
  const y0 = o.plinth === false ? 0 : (s.box(V(0, 0.07, 0.02), 0.6, 0.14, 0.5), 0.14);
  const Y = (y: number) => y + y0;
  // legs: right (+x) straight and weight-bearing, left relaxed and set back
  const hipR = V(0.095, Y(0.93), 0.0);
  const kneeR = V(0.1, Y(0.5), -0.02);
  const ankR = V(0.1, Y(0.07), 0.0);
  const hipL = V(-0.095, Y(0.91), 0.0);
  const kneeL = V(-0.13, Y(0.49), -0.06);
  const ankL = V(-0.16, Y(0.08), 0.1);
  s.limb(hipR, kneeR, 0.085, 0.055).limb(kneeR, ankR, 0.052, 0.035);
  s.limb(hipL, kneeL, 0.082, 0.054).limb(kneeL, ankL, 0.05, 0.034);
  s.box(ankR.clone().add(V(0, -0.035, -0.07)), 0.09, 0.06, 0.24);
  s.box(ankL.clone().add(V(0, -0.03, -0.06)), 0.09, 0.06, 0.23, new THREE.Euler(0.2, 0.15, 0));
  // calves
  s.blob(V(0.1, Y(0.33), 0.02), 0.055, 0.12, 0.055).blob(V(-0.14, Y(0.32), -0.02), 0.052, 0.11, 0.052);
  // pelvis tilted (contrapposto), torso, pectorals, abdomen
  s.blob(V(0, Y(0.96), 0.0), 0.17, 0.12, 0.12, new THREE.Euler(0, 0, 0.06));
  s.blob(V(0, Y(1.16), 0.0), 0.15, 0.17, 0.11, new THREE.Euler(0, 0, -0.04));
  s.blob(V(0, Y(1.33), 0.0), 0.19, 0.15, 0.125, new THREE.Euler(0, 0, -0.05));
  if (s.hi) {
    s.blob(V(0.075, Y(1.33), -0.075), 0.085, 0.06, 0.05).blob(V(-0.075, Y(1.32), -0.075), 0.085, 0.06, 0.05);
    s.blob(V(0, Y(1.13), -0.08), 0.08, 0.1, 0.04);
  }
  if (o.belly) s.blob(V(0, Y(1.08), -0.06), 0.15, 0.14, 0.13);
  // shoulders
  const shR = V(0.205, Y(1.44), 0.0);
  const shL = V(-0.205, Y(1.45), 0.0);
  s.blob(shR, 0.075, 0.07, 0.075).blob(shL, 0.075, 0.07, 0.075);
  // right arm
  const r = o.right ?? 'down';
  let elR: THREE.Vector3;
  let haR: THREE.Vector3;
  if (r === 'raised') {
    elR = V(0.36, Y(1.62), -0.06);
    haR = V(0.42, Y(1.86), -0.14);
  } else if (r === 'brow') {
    elR = V(0.33, Y(1.5), -0.16);
    haR = V(0.12, Y(1.66), -0.16);
  } else if (r === 'forward') {
    elR = V(0.3, Y(1.3), -0.2);
    haR = V(0.36, Y(1.42), -0.46);
  } else if (r === 'spear') {
    elR = V(0.33, Y(1.25), -0.04);
    haR = V(0.34, Y(1.25), -0.28);
  } else {
    elR = V(0.25, Y(1.17), 0.03);
    haR = V(0.27, Y(0.92), -0.02);
  }
  s.limb(shR, elR, 0.058, 0.044).limb(elR, haR, 0.042, 0.032);
  s.blob(haR.clone().add(V(0, r === 'down' ? -0.05 : 0.03, 0)), 0.035, 0.06, 0.025);
  if (r === 'spear') s.limb(V(0.34, Y(0.04), -0.3), V(0.34, Y(2.35), -0.27), 0.017, 0.017, false, o.attrMat);
  // left arm
  const l = o.left ?? 'down';
  let elL: THREE.Vector3;
  let haL: THREE.Vector3;
  if (l === 'rudder' || l === 'globe') {
    elL = V(-0.3, Y(1.18), -0.1);
    haL = V(-0.4, Y(1.05), -0.28);
  } else if (l === 'reins') {
    elL = V(-0.3, Y(1.2), -0.12);
    haL = V(-0.42, Y(1.22), -0.36);
  } else if (l === 'wineskin') {
    elL = V(-0.3, Y(1.38), 0.06);
    haL = V(-0.22, Y(1.56), 0.12);
  } else if (l === 'spear') {
    elL = V(-0.31, Y(1.22), -0.03);
    haL = V(-0.33, Y(1.18), -0.25);
  } else {
    elL = V(-0.25, Y(1.17), 0.03);
    haL = V(-0.27, Y(0.92), 0.0);
  }
  s.limb(shL, elL, 0.058, 0.044).limb(elL, haL, 0.042, 0.032);
  s.blob(haL, 0.035, 0.05, 0.03);
  if (l === 'rudder') {
    // steering oar standing on a globe beside the left foot
    s.blob(V(-0.42, Y(0.17), -0.3), 0.17, 0.17, 0.17, undefined, o.attrMat);
    s.limb(V(-0.42, Y(0.32), -0.3), V(-0.4, Y(1.12), -0.28), 0.022, 0.02, false, o.attrMat);
    s.box(V(-0.42, Y(0.45), -0.3), 0.05, 0.3, 0.13, undefined, o.attrMat);
  } else if (l === 'globe') {
    s.blob(haL.clone().add(V(0, 0.09, 0)), 0.09, 0.09, 0.09, undefined, o.attrMat);
  } else if (l === 'spear') {
    s.limb(V(-0.33, Y(0.04), -0.27), V(-0.33, Y(2.3), -0.24), 0.017, 0.017, false, o.attrMat);
  } else if (l === 'wineskin') {
    // the wineskin slung over the left shoulder
    s.blob(V(-0.16, Y(1.55), 0.15), 0.14, 0.1, 0.09, new THREE.Euler(0.3, 0, 0.5));
  }
  if (o.cloak) {
    // chlamys pinned on the right shoulder, falling down the back and over the left arm
    s.drape(
      [
        [0.06, Y(0.62)],
        [0.17, Y(0.95)],
        [0.22, Y(1.3)],
        [0.2, Y(1.47)],
      ],
      7,
      0.02,
      1.1,
      0.75,
      Math.PI * 0.62,
      Math.PI * 1.55,
      V(-0.02, 0, 0.04),
    );
  }
  if (o.satyr) {
    s.blob(V(0, Y(0.95), 0.12), 0.03, 0.03, 0.08, new THREE.Euler(0.6, 0, 0));
  }
  head(s, V(0, Y(1.55), 0.0), o.head ?? {});
  if (o.satyr) {
    for (const sx of [-1, 1]) s.blob(V(sx * 0.1, Y(1.78), 0.0), 0.02, 0.045, 0.02, new THREE.Euler(0, 0, sx * -0.5));
  }
}

// ---------------------------------------------------------------- draped woman

export interface DrapedOpts {
  /** 'patera' (libation bowl forward), 'torch', 'down', 'wreath' (raised), 'breast' (hand on the breast). */
  right?: 'patera' | 'torch' | 'down' | 'wreath' | 'breast';
  left?: 'down' | 'palm' | 'mantle' | 'sceptre';
  head?: HeadOpts;
  /** Wings (Victory). */
  wings?: boolean;
  /** Material of the drapery (the body uses the sculpt material). */
  dressMat?: MaterialId | THREE.Material;
  attrMat?: MaterialId | THREE.Material;
  plinth?: boolean;
  /** Stride (Victory alighting): the left knee forward through the drapery. */
  stride?: boolean;
}

/** A standing woman in stola and palla (1.75 m), facing −z. */
export function drapedFemale(s: Sculpt, o: DrapedOpts = {}) {
  const y0 = o.plinth === false ? 0 : (s.box(V(0, 0.07, 0.02), 0.56, 0.14, 0.46), 0.14);
  const Y = (y: number) => y + y0;
  const dm = o.dressMat;
  // feet peeping out
  s.box(V(0.08, Y(0.03), -0.12), 0.08, 0.06, 0.18).box(V(-0.08, Y(0.03), -0.1), 0.08, 0.06, 0.18);
  // stola: a long skirt with many folds from the feet to the chest
  s.drape(
    [
      [0.25, Y(0.0)],
      [0.21, Y(0.3)],
      [0.18, Y(0.7)],
      [0.17, Y(0.95)],
      [0.16, Y(1.12)],
      [0.17, Y(1.26)],
      [0.13, Y(1.38)],
    ],
    14,
    0.018,
    1.05,
    0.82,
    0,
    Math.PI * 2,
    V(0, 0, 0),
    dm,
  );
  if (o.stride) s.blob(V(-0.07, Y(0.55), -0.12), 0.08, 0.22, 0.08, new THREE.Euler(0.4, 0, 0), dm);
  // palla: the mantle wrapped round the hips and over the left shoulder
  s.drape(
    [
      [0.21, Y(0.58)],
      [0.22, Y(0.82)],
      [0.2, Y(1.05)],
    ],
    9,
    0.014,
    1.12,
    0.88,
    0,
    Math.PI * 2,
    V(0, 0, 0),
    dm,
  );
  s.blob(V(-0.13, Y(1.3), 0.0), 0.1, 0.13, 0.11, new THREE.Euler(0, 0, 0.25), dm);
  // bust and shoulders
  s.blob(V(0, Y(1.28), -0.02), 0.15, 0.12, 0.1, undefined, dm);
  const shR = V(0.17, Y(1.38), 0.0);
  const shL = V(-0.17, Y(1.38), 0.0);
  s.blob(shR, 0.06, 0.055, 0.06, undefined, dm).blob(shL, 0.065, 0.06, 0.065, undefined, dm);
  // arms
  const r = o.right ?? 'down';
  const elR = r === 'wreath' ? V(0.3, Y(1.55), -0.05) : r === 'breast' ? V(0.2, Y(1.1), -0.1) : r === 'down' ? V(0.21, Y(1.1), 0.02) : V(0.23, Y(1.12), -0.1);
  const haR = r === 'wreath' ? V(0.36, Y(1.82), -0.12) : r === 'breast' ? V(0.05, Y(1.27), -0.12) : r === 'down' ? V(0.22, Y(0.86), -0.02) : V(0.25, Y(1.12), -0.38);
  s.limb(shR, elR, 0.05, 0.04).limb(elR, haR, 0.037, 0.028);
  if (r === 'patera') {
    const bowl = new THREE.CylinderGeometry(0.09, 0.05, 0.03, s.hi ? 12 : 6);
    bowl.translate(haR.x, haR.y + 0.03, haR.z - 0.02);
    s.geo(bowl, o.attrMat);
  } else if (r === 'torch') {
    s.limb(haR.clone().add(V(0, -0.25, 0)), haR.clone().add(V(0, 0.35, 0)), 0.02, 0.03, false, o.attrMat);
  } else if (r === 'wreath') {
    const w = new THREE.TorusGeometry(0.09, 0.015, 4, s.hi ? 14 : 8);
    w.translate(haR.x, haR.y + 0.08, haR.z);
    s.geo(w, o.attrMat ?? 'gilded_bronze');
  }
  const l = o.left ?? 'mantle';
  const elL = l === 'palm' || l === 'sceptre' ? V(-0.26, Y(1.15), -0.08) : V(-0.21, Y(1.1), 0.02);
  const haL = l === 'palm' || l === 'sceptre' ? V(-0.3, Y(1.2), -0.3) : l === 'mantle' ? V(-0.12, Y(1.0), -0.12) : V(-0.22, Y(0.86), -0.02);
  s.limb(shL, elL, 0.05, 0.04).limb(elL, haL, 0.037, 0.028);
  if (l === 'palm') s.limb(haL.clone().add(V(0, -0.3, 0)), haL.clone().add(V(-0.05, 0.55, 0.04)), 0.012, 0.02, false, o.attrMat ?? 'gilded_bronze');
  if (l === 'sceptre') s.limb(V(-0.3, Y(0.05), -0.32), V(-0.3, Y(1.9), -0.3), 0.015, 0.015, false, o.attrMat);
  if (o.wings) {
    for (const sx of [-1, 1]) {
      const pts: V2[] = [
        [0, 0],
        [0.12, 0.25],
        [0.28, 0.62],
        [0.36, 0.95],
        [0.3, 1.0],
        [0.22, 0.72],
        [0.12, 0.42],
        [0.04, 0.2],
      ];
      // THREE.Shape fixes the winding of the mirrored outline itself.
      const g = extrudePolygon(
        pts.map(([x, y]) => [x * sx, y] as V2),
        0.03,
      );
      g.rotateY(sx * 0.5);
      g.translate(sx * 0.06, Y(1.18), 0.12);
      s.geo(g);
    }
  }
  head(s, V(0, Y(1.43), 0.0), o.head ?? {});
  // hair knot at the back
  if (o.head?.crown !== 'veil') s.blob(V(0, Y(1.66), 0.1), 0.06, 0.05, 0.05);
}

// ---------------------------------------------------------------- horse

/** A standing horse (withers 1.55 m at scale 1) facing −z, origin under the barrel. `lift` raises the near foreleg. */
export function horse(s: Sculpt, at: THREE.Vector3, lift = false) {
  const P = (x: number, y: number, z: number) => at.clone().add(V(x, y, z));
  s.blob(P(0, 1.28, 0.0), 0.27, 0.32, 0.72);
  s.blob(P(0, 1.3, -0.48), 0.28, 0.34, 0.3);
  s.blob(P(0, 1.3, 0.5), 0.29, 0.31, 0.32);
  // neck and head
  s.limb(P(0, 1.45, -0.62), P(0, 1.98, -0.92), 0.2, 0.12);
  s.blob(P(0, 2.02, -1.08), 0.1, 0.13, 0.26, new THREE.Euler(0.65, 0, 0));
  for (const sx of [-1, 1]) s.blob(P(sx * 0.05, 2.17, -0.96), 0.025, 0.07, 0.025);
  s.box(P(0, 1.9, -0.75), 0.04, 0.42, 0.3, new THREE.Euler(-0.6, 0, 0));
  // legs
  const legs: [number, number, boolean][] = [
    [0.15, -0.55, lift],
    [-0.15, -0.55, false],
    [0.15, 0.55, false],
    [-0.15, 0.55, false],
  ];
  for (const [x, z, up] of legs) {
    const top = P(x, 1.12, z);
    const knee = up ? P(x, 0.82, z - 0.25) : P(x, 0.55, z + (z > 0 ? 0.05 : 0));
    const foot = up ? P(x, 0.62, z - 0.1) : P(x, 0.06, z + (z > 0 ? -0.02 : 0));
    s.limb(top, knee, 0.085, 0.05).limb(knee, foot, 0.045, 0.04);
    s.blob(foot.clone().add(V(0, -0.02, -0.02)), 0.055, 0.05, 0.06);
  }
  // tail
  s.tube([P(0, 1.35, 0.78), P(0, 1.1, 0.95), P(0, 0.7, 1.0)], (i) => 0.06 - i * 0.015, 5);
}

// ---------------------------------------------------------------- convenience

/** Build a figure function into `b` at `at` (scale), one sculpt per call. `q` multiplies the tessellation. */
export function figure(b: MeshBuilder, at: THREE.Matrix4, hi: boolean, mat: MaterialId | THREE.Material, scale: number, draw: (s: Sculpt) => void, q = 1) {
  const s = new Sculpt(hi, mat, q);
  draw(s);
  s.emit(b, at, scale);
}
