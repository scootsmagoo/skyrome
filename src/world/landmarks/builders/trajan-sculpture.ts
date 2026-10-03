/**
 * Sculpture for the Forum of Trajan, in the classical kit's statue idiom (lathes, ellipsoids and
 * tapered limbs at real proportions; a 1.85 m figure is life size; figures FACE −z, origin at the
 * feet; `scale` multiplies everything):
 *
 *  - dacianCaptive(): the standing Dacian prisoners of the portico attics — trousers, belted
 *    long-sleeved tunic, cloak, hands crossed at the wrists, head bowed, bearded, some with the
 *    felt cap (pileus) of the nobles. Pavonazzetto bodies with white-marble heads and hands.
 *  - horseFigure() / chariotTeam(): a gilded horse, and teams of 2 (biga) to 6 (seiugis) abreast
 *    pulling a chariot with a cuirassed emperor (the gateway's six-horse group, the bigae of the
 *    Basilica Ulpia).
 *  - victory(): winged Victory holding out a wreath.
 *  - tropaeum(), signum(), aquila(), clipeus(): trophies of Dacian arms, legionary standards,
 *    eagles, and round shield portraits (imagines clipeatae).
 */
import * as THREE from 'three';
import { armoredEmperor } from '../../../arch/classical/statues';
import { cylinderBetween, extrudePolygon, gridSurface, linspace, mul, T, tube, type V2 } from '../../../arch/common/geom';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import type { Mat } from './trajan-kit';

export type Detail = 'high' | 'low';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Collects the parts of one figure, then emits them into a builder with one transform. */
class Sculpt {
  readonly parts: THREE.BufferGeometry[] = [];
  constructor(readonly hi: boolean) {}
  blob(c: THREE.Vector3, rx: number, ry: number, rz: number, rot?: THREE.Euler) {
    const g = new THREE.SphereGeometry(1, this.hi ? 10 : 6, this.hi ? 7 : 4);
    g.scale(rx, ry, rz);
    if (rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(rot));
    g.translate(c.x, c.y, c.z);
    this.parts.push(g);
    return this;
  }
  /** Ellipsoid whose long axis runs from a to b. */
  along(a: THREE.Vector3, b: THREE.Vector3, rx: number, rz: number) {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const g = new THREE.SphereGeometry(1, this.hi ? 10 : 6, this.hi ? 7 : 4);
    g.scale(rx, len / 2, rz);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize()));
    const m = a.clone().add(b).multiplyScalar(0.5);
    g.translate(m.x, m.y, m.z);
    this.parts.push(g);
    return this;
  }
  limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, joints = true) {
    this.parts.push(cylinderBetween(a, b, ra, rb, this.hi ? 8 : 5, false));
    if (joints) {
      this.blob(a, ra, ra, ra);
      this.blob(b, rb, rb, rb);
    }
    return this;
  }
  /** Draped lathe with folds: profile (r, y), section squashed by sx, sz, angular range θ0..θ1 (0 = +z, the back). */
  drape(profile: V2[], folds: number, amp: number, sx = 1, sz = 1, t0 = 0, t1 = Math.PI * 2, centre = V(0, 0, 0)) {
    const y0 = profile[0][1];
    const y1 = profile[profile.length - 1][1];
    const rAt = (y: number) => {
      for (let i = 0; i < profile.length - 1; i++) {
        const [ra, ya] = profile[i];
        const [rb, yb] = profile[i + 1];
        if (y >= Math.min(ya, yb) && y <= Math.max(ya, yb)) return ra + ((rb - ra) * (y - ya)) / (yb - ya || 1);
      }
      return profile[profile.length - 1][0];
    };
    const ths = linspace(t0, t1, this.hi ? 22 : 10);
    const rows = linspace(0, 1, this.hi ? Math.max(5, profile.length + 1) : Math.max(2, profile.length - 2));
    this.parts.push(
      gridSurface(ths, rows, (a, t, o) => {
        const y = y0 + (y1 - y0) * t;
        const fold = this.hi ? amp * (1 - 0.7 * t) * Math.sin(a * folds + Math.sin(t * 5) * 0.6) : 0;
        const r = rAt(y) + fold;
        return o.set(centre.x + Math.sin(a) * r * sx, y, centre.z + Math.cos(a) * r * sz);
      }),
    );
    return this;
  }
  tube(path: THREE.Vector3[], r: number | ((i: number) => number), radial = 5) {
    this.parts.push(tube(path, r, this.hi ? radial : 3));
    return this;
  }
  box(c: THREE.Vector3, w: number, h: number, d: number, rot?: THREE.Euler) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(rot));
    g.translate(c.x, c.y, c.z);
    this.parts.push(g);
    return this;
  }
  emit(b: MeshBuilder, mat: Mat, at: THREE.Matrix4, scale = 1) {
    const m = scale === 1 ? at : mul(at, new THREE.Matrix4().makeScale(scale, scale, scale));
    for (const g of this.parts) b.add(g, mat, m);
  }
}

// ---------------------------------------------------------------- Dacian captive

export interface FigureOptions {
  scale?: number;
  detail?: Detail;
  material?: Mat;
  /** Heads and hands (the Dacians' were often white marble set into coloured bodies). */
  fleshMaterial?: Mat;
  /** 0, 1, 2…: varies cap, cloak and stance. */
  variant?: number;
}

/** Standing Dacian prisoner, hands crossed at the wrists, head bowed (Forum of Trajan attics). */
export function dacianCaptive(b: MeshBuilder, at: THREE.Matrix4, o: FigureOptions = {}) {
  const hi = (o.detail ?? 'high') === 'high';
  const body = new Sculpt(hi);
  const flesh = new Sculpt(hi);
  const vnt = o.variant ?? 0;
  const lean = vnt % 2 === 0 ? 1 : -1;
  // Trousered legs (bracae), the weight on one leg.
  for (const sx of [-1, 1]) {
    const hip = V(0.1 * sx, 0.92, 0);
    const knee = V(0.11 * sx + (sx === lean ? 0 : 0.01), 0.5, sx === lean ? 0 : -0.06);
    const ank = V(0.11 * sx, 0.09, sx === lean ? 0 : 0.03);
    body.limb(hip, knee, 0.095, 0.078).limb(knee, ank, 0.078, 0.06);
    body.box(V(0.11 * sx, 0.04, -0.06), 0.11, 0.08, 0.26);
  }
  // Belted tunic to the knees, long sleeves.
  body.drape(
    [
      [0.26, 0.55],
      [0.24, 0.72],
      [0.205, 0.96],
      [0.2, 1.04],
      [0.215, 1.24],
      [0.222, 1.36],
      [0.19, 1.46],
      [0.1, 1.54],
      [0.06, 1.56],
    ],
    11,
    0.012,
    1.1,
    0.78,
  );
  const belt = new THREE.TorusGeometry(0.208, 0.018, 4, hi ? 18 : 10);
  belt.rotateX(Math.PI / 2);
  belt.scale(1.1, 1, 0.8);
  belt.translate(0, 1.0, 0);
  body.parts.push(belt);
  // Cloak (sagum) over the shoulders and down the back, fastened at the right shoulder.
  body.drape(
    [
      [0.275, 0.6],
      [0.265, 0.9],
      [0.255, 1.2],
      [0.24, 1.42],
      [0.15, 1.53],
    ],
    7,
    0.018,
    1.1,
    0.82,
    -Math.PI * 0.62,
    Math.PI * 0.62,
  );
  body.blob(V(0.17, 1.48, -0.06), 0.035, 0.035, 0.02); // brooch
  // Arms down, forearms crossed in front of the belly.
  const shR = V(0.22, 1.44, 0);
  const shL = V(-0.22, 1.44, 0);
  const elR = V(0.25, 1.15, -0.04);
  const elL = V(-0.25, 1.15, -0.04);
  body.limb(shR, elR, 0.064, 0.054).limb(shL, elL, 0.064, 0.054);
  body.limb(elR, V(-0.03, 1.03, -0.2), 0.052, 0.042).limb(elL, V(0.03, 1.01, -0.21), 0.052, 0.042);
  flesh.blob(V(-0.06, 1.03, -0.22), 0.04, 0.045, 0.05).blob(V(0.06, 1.01, -0.23), 0.04, 0.045, 0.05);
  // Head bowed: long hair, full beard, and (variants 0, 2) the pileus.
  const c = V(0, 1.72, -0.05);
  flesh.limb(V(0, 1.53, -0.01), V(0, 1.62, -0.04), 0.058, 0.052, false);
  flesh.blob(c, 0.094, 0.116, 0.106, new THREE.Euler(0.25, 0, 0));
  flesh.box(c.clone().add(V(0, -0.02, -0.105)), 0.024, 0.05, 0.03, new THREE.Euler(0.45, 0, 0));
  flesh.blob(c.clone().add(V(0, -0.085, -0.045)), 0.085, 0.085, 0.07); // beard
  flesh.blob(c.clone().add(V(0, 0.0, 0.035)), 0.108, 0.12, 0.1); // hair
  if (vnt % 3 !== 1) {
    flesh.blob(c.clone().add(V(0, 0.07, 0.0)), 0.104, 0.075, 0.112);
    flesh.blob(c.clone().add(V(0, 0.13, -0.04)), 0.05, 0.05, 0.06, new THREE.Euler(0.6, 0, 0));
  }
  const sc = o.scale ?? 1;
  body.emit(b, o.material ?? 'marble_pavonazzetto', at, sc);
  flesh.emit(b, o.fleshMaterial ?? 'marble', at, sc);
}

// ---------------------------------------------------------------- horses and chariots

export type HorsePose = 'walk' | 'prance' | 'stand';

/** A horse (no rider), head towards −z, hooves on y = 0. About 1.6 m to the withers at scale 1. */
export function horseFigure(s: Sculpt, o: THREE.Vector3, pose: HorsePose = 'walk') {
  const P = (x: number, y: number, z: number) => V(o.x + x, o.y + y, o.z + z);
  const lift = pose === 'prance' ? 0.22 : 0;
  s.blob(P(0, 1.22, 0.02), 0.3, 0.33, 0.74);
  s.blob(P(0, 1.2 + lift * 0.5, -0.5), 0.27, 0.33, 0.3);
  s.blob(P(0, 1.28, 0.55), 0.31, 0.35, 0.34);
  const withers = P(0, 1.42 + lift * 0.7, -0.6);
  const poll = P(0, 2.0 + lift, -1.0);
  s.along(withers, poll, 0.12, 0.2);
  s.tube([P(0, 1.58 + lift * 0.7, -0.52), P(0, 1.9 + lift, -0.82), P(0, 2.08 + lift, -0.98)], (i) => 0.05 - i * 0.008, 4);
  const muzzle = P(0, 1.6 + lift, -1.38);
  s.along(poll.clone().add(V(0, 0.02, -0.02)), muzzle, 0.095, 0.12);
  s.blob(P(0, 1.84 + lift, -1.06), 0.1, 0.1, 0.11);
  for (const x of [-0.055, 0.055]) s.limb(P(x, 2.08 + lift, -1.01), P(x * 1.5, 2.22 + lift, -0.98), 0.024, 0.006, false);
  s.tube([P(0, 1.45, 0.92), P(0, 1.3, 1.08), P(0, 0.95, 1.14), P(0, 0.72, 1.1)], (i) => 0.07 - i * 0.012, 4);
  const raised = pose !== 'stand';
  const legs: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
    raised
      ? [P(0.17, 1.05 + lift, -0.62), P(0.2, 0.78 + lift, -0.86), P(0.2, 0.6 + lift, -0.72), P(0.2, 0.52 + lift, -0.66)]
      : [P(0.17, 1.02, -0.6), P(0.18, 0.55, -0.62), P(0.18, 0.18, -0.6), P(0.18, 0.04, -0.62)],
    [P(-0.17, 1.02 + lift * 0.5, -0.6), P(-0.18, 0.55, -0.62), P(-0.18, 0.18, -0.6), P(-0.18, 0.04, -0.62)],
    [P(0.18, 1.05, 0.62), P(0.2, 0.6, 0.78), P(0.19, 0.2, 0.66), P(0.19, 0.04, 0.68)],
    [P(-0.18, 1.05, 0.6), P(-0.19, 0.6, 0.68), P(-0.18, 0.2, 0.52), P(-0.18, 0.04, 0.5)],
  ];
  for (const [a, k, f, h] of legs) {
    s.limb(a, k, 0.11, 0.065, false).limb(k, f, 0.05, 0.042, false).limb(f, h, 0.042, 0.05, false);
    s.blob(h.clone().add(V(0, -0.01, -0.02)), 0.055, 0.04, 0.062);
  }
}

/** A single gilded horse statue (the gilded horses along the forum roofs). */
export function horseStatue(b: MeshBuilder, at: THREE.Matrix4, o: FigureOptions & { pose?: HorsePose } = {}) {
  const s = new Sculpt((o.detail ?? 'high') === 'high');
  horseFigure(s, V(0, 0, 0), o.pose ?? 'walk');
  s.emit(b, o.material ?? 'gilded_bronze', at, o.scale ?? 1);
}

/** Team of `horses` abreast pulling a chariot with a cuirassed driver (biga, quadriga, seiugis). */
export function chariotTeam(b: MeshBuilder, at: THREE.Matrix4, o: FigureOptions & { horses?: number; driver?: boolean; driverMaterial?: MaterialId } = {}) {
  const hi = (o.detail ?? 'high') === 'high';
  const n = o.horses ?? 2;
  const s = new Sculpt(hi);
  const spacing = 0.66;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * spacing;
    const outer = i === 0 || i === n - 1;
    horseFigure(s, V(x, 0, -0.9), outer && n > 2 ? 'prance' : 'walk');
  }
  // Yoke, pole, car and wheels.
  const half = ((n - 1) / 2) * spacing + 0.2;
  s.limb(V(-half, 1.75, -1.55), V(half, 1.75, -1.55), 0.035, 0.035, false);
  s.limb(V(0, 0.55, 0.6), V(0, 1.5, -1.5), 0.035, 0.035, false);
  const car = new THREE.CylinderGeometry(0.62, 0.62, 1.0, hi ? 14 : 8, 1, true, -Math.PI / 2, Math.PI);
  car.translate(0, 1.0, 0.9);
  s.parts.push(car);
  s.box(V(0, 0.52, 1.1), 1.3, 0.06, 0.65);
  for (const sx of [-1, 1]) {
    const w = new THREE.TorusGeometry(0.5, 0.045, 4, hi ? 16 : 8);
    w.rotateY(Math.PI / 2);
    w.translate(0.72 * sx, 0.5, 1.15);
    s.parts.push(w);
    s.limb(V(0.72 * sx, 0.04, 1.15), V(0.72 * sx, 0.96, 1.15), 0.02, 0.02, false);
    s.limb(V(0.72 * sx, 0.5, 0.69), V(0.72 * sx, 0.5, 1.61), 0.02, 0.02, false);
  }
  s.limb(V(-0.8, 0.5, 1.15), V(0.8, 0.5, 1.15), 0.03, 0.03, false);
  const sc = o.scale ?? 1;
  s.emit(b, o.material ?? 'gilded_bronze', at, sc);
  if (o.driver ?? true) {
    armoredEmperor(b, mul(at, new THREE.Matrix4().makeScale(sc, sc, sc).setPosition(new THREE.Vector3(0, 0.55 * sc, 1.05 * sc))), {
      material: o.driverMaterial ?? 'gilded_bronze',
      detail: o.detail,
      plinth: false,
      spear: false,
      scale: sc * 0.95,
    });
  }
}

// ---------------------------------------------------------------- Victory

/** Winged Victory in a long chiton, stepping forward with a wreath held out. */
export function victory(b: MeshBuilder, at: THREE.Matrix4, o: FigureOptions = {}) {
  const hi = (o.detail ?? 'high') === 'high';
  const s = new Sculpt(hi);
  s.drape(
    [
      [0.3, 0.02],
      [0.26, 0.4],
      [0.22, 0.85],
      [0.2, 1.0],
      [0.215, 1.25],
      [0.2, 1.42],
      [0.1, 1.52],
      [0.06, 1.54],
    ],
    12,
    0.016,
    1.05,
    0.8,
  );
  s.blob(V(0.07, 1.3, -0.13), 0.075, 0.07, 0.05).blob(V(-0.07, 1.3, -0.13), 0.075, 0.07, 0.05);
  // Right arm forward and up with a wreath; left arm down holding a palm.
  s.limb(V(0.2, 1.42, 0), V(0.3, 1.5, -0.24), 0.05, 0.04).limb(V(0.3, 1.5, -0.24), V(0.32, 1.7, -0.42), 0.04, 0.032);
  const wr = new THREE.TorusGeometry(0.11, 0.022, 4, hi ? 12 : 8);
  wr.translate(0.32, 1.82, -0.46);
  s.parts.push(wr);
  s.limb(V(-0.2, 1.42, 0), V(-0.25, 1.15, -0.06), 0.05, 0.042).limb(V(-0.25, 1.15, -0.06), V(-0.24, 0.98, -0.2), 0.04, 0.032);
  s.limb(V(-0.24, 0.6, -0.24), V(-0.24, 1.6, -0.18), 0.012, 0.012, false);
  // Head with the hair knotted up.
  const c = V(0, 1.69, -0.02);
  s.limb(V(0, 1.52, 0), V(0, 1.6, -0.01), 0.05, 0.046, false);
  s.blob(c, 0.088, 0.11, 0.1).blob(c.clone().add(V(0, 0.04, 0.06)), 0.07, 0.06, 0.07);
  // Wings: two feathered blades swept up and back.
  for (const sx of [-1, 1]) {
    const wing: V2[] = [
      [0, 0],
      [0.18, 0.25],
      [0.42, 0.68],
      [0.6, 1.05],
      [0.52, 0.95],
      [0.5, 0.78],
      [0.4, 0.62],
      [0.36, 0.42],
      [0.24, 0.22],
      [0.1, 0.06],
    ];
    const g = extrudePolygon(
      wing.map(([x, y]) => [x * sx, y] as V2),
      0.04,
    );
    g.rotateY(sx * 0.55);
    g.translate(0.08 * sx, 1.18, 0.14);
    s.parts.push(g);
  }
  s.emit(b, o.material ?? 'gilded_bronze', at, o.scale ?? 1);
}

// ---------------------------------------------------------------- trophies, standards, eagles

/** Tropaeum: a post dressed with a captured Dacian cuirass, helmet, oval shields and spears. */
export function tropaeum(b: MeshBuilder, at: THREE.Matrix4, o: FigureOptions = {}) {
  const hi = (o.detail ?? 'high') === 'high';
  const s = new Sculpt(hi);
  s.limb(V(0, 0, 0), V(0, 2.2, 0), 0.06, 0.05, false);
  s.limb(V(-0.55, 1.62, 0), V(0.55, 1.62, 0), 0.04, 0.04, false);
  s.drape(
    [
      [0.2, 0.95],
      [0.22, 1.2],
      [0.24, 1.45],
      [0.2, 1.62],
      [0.08, 1.7],
    ],
    2,
    0,
    1.15,
    0.7,
  );
  s.blob(V(0, 1.95, 0), 0.13, 0.14, 0.14);
  s.limb(V(0, 2.05, 0.02), V(0, 2.18, -0.06), 0.03, 0.01, false);
  for (const sx of [-1, 1]) {
    const sh = new THREE.CylinderGeometry(0.32, 0.32, 0.05, hi ? 14 : 8);
    sh.scale(0.75, 1, 1);
    sh.rotateX(Math.PI / 2);
    sh.rotateY(sx * 0.4);
    sh.translate(0.55 * sx, 1.35, -0.05);
    s.parts.push(sh);
    s.limb(V(0.4 * sx, 0.2, 0.1), V(-0.2 * sx, 2.3, -0.1), 0.012, 0.012, false);
  }
  s.emit(b, o.material ?? 'gilded_bronze', at, o.scale ?? 1);
}

/** Legionary standard (signum): pole with phalerae discs, a crossbar with streamers, a hand or eagle on top. */
export function signum(b: MeshBuilder, at: THREE.Matrix4, o: FigureOptions & { eagle?: boolean } = {}) {
  const hi = (o.detail ?? 'high') === 'high';
  const s = new Sculpt(hi);
  s.limb(V(0, 0, 0), V(0, 2.9, 0), 0.025, 0.022, false);
  for (let i = 0; i < 5; i++) {
    const d = new THREE.CylinderGeometry(0.11, 0.11, 0.03, hi ? 12 : 8);
    d.rotateX(Math.PI / 2);
    d.translate(0, 1.15 + i * 0.27, -0.03);
    s.parts.push(d);
  }
  s.limb(V(-0.22, 2.55, 0), V(0.22, 2.55, 0), 0.015, 0.015, false);
  for (const sx of [-1, 1]) s.limb(V(0.22 * sx, 2.55, 0), V(0.22 * sx, 2.25, 0), 0.012, 0.02, false);
  if (o.eagle) aquilaInto(s, V(0, 2.9, 0), 0.35);
  else s.blob(V(0, 3.0, 0), 0.05, 0.1, 0.03);
  s.emit(b, o.material ?? 'gilded_bronze', at, o.scale ?? 1);
}

function aquilaInto(s: Sculpt, o: THREE.Vector3, k: number) {
  s.blob(o.clone().add(V(0, 0.18 * k, 0)), 0.1 * k, 0.18 * k, 0.12 * k);
  s.blob(o.clone().add(V(0, 0.38 * k, -0.04 * k)), 0.065 * k, 0.07 * k, 0.075 * k);
  s.blob(o.clone().add(V(0, 0.36 * k, -0.12 * k)), 0.02 * k, 0.02 * k, 0.04 * k);
  for (const sx of [-1, 1]) {
    const wing: V2[] = [
      [0, 0],
      [0.5, 0.05],
      [0.62, 0.32],
      [0.48, 0.42],
      [0.3, 0.3],
      [0.1, 0.22],
    ];
    const g = extrudePolygon(
      wing.map(([x, y]) => [x * sx * k, y * k] as V2),
      0.03 * k,
    );
    g.translate(o.x + 0.06 * sx * k, o.y + 0.16 * k, o.z + 0.03 * k);
    s.parts.push(g);
  }
}

/** Spread eagle (corners of the Column's pedestal; standards). Faces −z. */
export function aquila(b: MeshBuilder, at: THREE.Matrix4, o: FigureOptions = {}) {
  const s = new Sculpt((o.detail ?? 'high') === 'high');
  aquilaInto(s, V(0, 0, 0), 1);
  s.emit(b, o.material ?? 'marble', at, o.scale ?? 1);
}

/** Round shield portrait (imago clipeata): a framed disc with a bust, facing −z, centred on the origin. */
export function clipeus(b: MeshBuilder, at: THREE.Matrix4, r: number, o: FigureOptions & { frameMaterial?: Mat } = {}) {
  const hi = (o.detail ?? 'high') === 'high';
  const disc = new THREE.CylinderGeometry(r, r, 0.08 * r, hi ? 18 : 10);
  disc.rotateX(Math.PI / 2);
  b.add(disc, o.frameMaterial ?? 'marble', at);
  const rim = new THREE.TorusGeometry(r * 0.94, r * 0.07, 4, hi ? 18 : 10);
  rim.translate(0, 0, -0.05 * r);
  b.add(rim, o.frameMaterial ?? 'marble', at);
  if (!hi) return;
  const s = new Sculpt(false);
  s.blob(V(0, -0.35, -0.08), 0.42, 0.22, 0.12);
  s.limb(V(0, -0.2, -0.1), V(0, -0.05, -0.12), 0.09, 0.08, false);
  s.blob(V(0, 0.1, -0.14), 0.15, 0.19, 0.15);
  s.emit(b, o.material ?? 'marble', at, r);
}

/** Bronze statue raised on a moulded pedestal is common enough to want a one-liner: see trajan-props. */
export { Sculpt };

/** Statue base offsets used by placement code (pedestal top for a plinth of height h). */
export function standOn(at: THREE.Matrix4, h: number): THREE.Matrix4 {
  return mul(at, T(0, h, 0));
}
