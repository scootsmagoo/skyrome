/**
 * A lofted heroic nude for the Forum's colossal bronze (the Colossus of Sol) and other gods: the
 * kit's statues.ts builds its bodies from smooth lofted sections (torso, limbs, head with carved
 * relief), which read as cast bronze where forum-figures' ellipsoids and cylinders read as a
 * jointed mannequin. The kit keeps those body parts private, so the loft and the parts used here
 * are a local copy of statues.ts (candidate for upstreaming as an exported `heroicNude()`), with a
 * bare torso, a chlamys and Sol's attributes added.
 *
 * Frame as the kit: origin at the feet, the figure faces −z (right hand at +x), 1.85 m at scale 1.
 */
import * as THREE from 'three';
import { extrudePolygon, gridSurface, linspace } from '../../../arch/common/geom';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function crValue(vals: number[], s: number): number {
  const n = vals.length;
  const i = Math.min(n - 2, Math.max(0, Math.floor(s)));
  const t = s - i;
  const p0 = vals[Math.max(0, i - 1)];
  const p1 = vals[i];
  const p2 = vals[i + 1];
  const p3 = vals[Math.min(n - 1, i + 2)];
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function crPoint(pts: THREE.Vector3[], s: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(
    crValue(pts.map((p) => p.x), s),
    crValue(pts.map((p) => p.y), s),
    crValue(pts.map((p) => p.z), s),
  );
}

interface LoftOptions {
  front?: THREE.Vector3 | ((p: THREE.Vector3) => THREE.Vector3);
  shape?: (theta: number, u: number) => number;
  seg?: number;
  sub?: number;
  theta0?: number;
  theta1?: number;
  mat?: MaterialId;
}

/** Lofted statue parts per material (after the kit's Sculpt), with a tessellation multiplier. */
class Body {
  readonly parts = new Map<MaterialId, THREE.BufferGeometry[]>();
  constructor(
    readonly hi: boolean,
    readonly mat: MaterialId,
    readonly q = 1,
  ) {}
  private push(g: THREE.BufferGeometry, mat?: MaterialId) {
    const k = mat ?? this.mat;
    const l = this.parts.get(k) ?? [];
    l.push(g);
    this.parts.set(k, l);
  }
  n(k: number) {
    return Math.max(3, Math.round(k * this.q));
  }
  loft(path: THREE.Vector3[], radii: [number, number][], o: LoftOptions = {}) {
    const n = path.length;
    const seg = this.n(o.seg ?? (this.hi ? 12 : 6));
    const sub = Math.max(1, Math.round((o.sub ?? (this.hi ? 3 : 1)) * Math.min(this.q, 2)));
    const fixedFront = o.front instanceof THREE.Vector3 ? o.front.clone().normalize() : o.front ? null : V(0, 0, -1);
    const frontFn = typeof o.front === 'function' ? o.front : null;
    const rxs = radii.map((r) => r[0]);
    const rzs = radii.map((r) => r[1]);
    const c = new THREE.Vector3();
    const c2 = new THREE.Vector3();
    const t = new THREE.Vector3();
    const az = new THREE.Vector3();
    const ax = new THREE.Vector3();
    const P = (th: number, s: number, out: THREE.Vector3) => {
      crPoint(path, s, c);
      const e = 1e-3;
      crPoint(path, Math.min(n - 1, s + e), c2);
      t.copy(c2);
      crPoint(path, Math.max(0, s - e), c2);
      t.sub(c2).normalize();
      const front = fixedFront ?? frontFn!(c).clone().normalize();
      az.copy(front).addScaledVector(t, -front.dot(t));
      if (az.lengthSq() < 1e-6) {
        az.set(Math.abs(t.x) < 0.9 ? 1 : 0, 0, Math.abs(t.x) < 0.9 ? 0 : 1);
        az.addScaledVector(t, -az.dot(t));
      }
      az.normalize();
      ax.crossVectors(t, az).normalize();
      const k = o.shape ? o.shape(th, s / (n - 1)) : 1;
      const rx = Math.max(1e-4, crValue(rxs, s)) * k;
      const rz = Math.max(1e-4, crValue(rzs, s)) * k;
      return out.copy(c).addScaledVector(ax, Math.cos(th) * rx).addScaledVector(az, Math.sin(th) * rz);
    };
    const ths = linspace(o.theta0 ?? 0, o.theta1 ?? Math.PI * 2, seg);
    const ss = linspace(0, n - 1, (n - 1) * sub);
    const p0 = P(0.3, (n - 1) / 2, new THREE.Vector3());
    const pa = P(0.3 + 1e-3, (n - 1) / 2, new THREE.Vector3()).sub(p0);
    const pb = P(0.3, (n - 1) / 2 + 1e-3, new THREE.Vector3()).sub(p0);
    crPoint(path, (n - 1) / 2, c2);
    const flip = new THREE.Vector3().crossVectors(pa, pb).dot(p0.clone().sub(c2)) < 0;
    this.push(gridSurface(ths, ss, P, { flip }), o.mat);
    return this;
  }
  blob(c: THREE.Vector3, rx: number, ry: number, rz: number, rot?: THREE.Euler, mat?: MaterialId) {
    const g = new THREE.SphereGeometry(1, this.n(this.hi ? 14 : 8), this.n(this.hi ? 10 : 6));
    g.scale(rx, ry, rz);
    if (rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(rot));
    g.translate(c.x, c.y, c.z);
    this.push(g, mat);
    return this;
  }
  geo(g: THREE.BufferGeometry, mat?: MaterialId) {
    this.push(g, mat);
    return this;
  }
  emit(b: MeshBuilder, at: THREE.Matrix4, scale: number) {
    const m = at.clone().multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
    for (const [mat, list] of this.parts) for (const g of list) b.add(g, mat, m);
  }
}

// ---------------------------------------------------------------- head (as statues.ts)

const HEAD: [number, number, number, number][] = [
  [-0.114, -0.064, 0.012, 0.01],
  [-0.1, -0.046, 0.046, 0.036],
  [-0.07, -0.024, 0.063, 0.068],
  [-0.03, -0.008, 0.071, 0.088],
  [0.01, 0.004, 0.074, 0.099],
  [0.05, 0.01, 0.077, 0.102],
  [0.085, 0.013, 0.071, 0.094],
  [0.11, 0.014, 0.05, 0.068],
  [0.124, 0.014, 0.018, 0.024],
  [0.127, 0.014, 0.002, 0.002],
];

function lerpTable(y: number, col: number): number {
  if (y <= HEAD[0][0]) return HEAD[0][col];
  for (let i = 0; i < HEAD.length - 1; i++) {
    const a = HEAD[i];
    const b = HEAD[i + 1];
    if (y <= b[0]) {
      const t = (y - a[0]) / (b[0] - a[0]);
      const u = t * t * (3 - 2 * t) * 0.5 + t * 0.5;
      return a[col] + (b[col] - a[col]) * u;
    }
  }
  return HEAD[HEAD.length - 1][col];
}

const gs = (x: number, sd: number) => Math.exp(-((x / sd) ** 2));

function headPoint(th: number, y: number, out: THREE.Vector3, push = 0): THREE.Vector3 {
  const cz = lerpTable(y, 1);
  const rx = lerpTable(y, 2);
  let rz = lerpTable(y, 3);
  const f = Math.max(0, Math.sin(th));
  rz *= 1 - 0.08 * f ** 3;
  const x = -Math.cos(th) * rx;
  const ff = f ** 2;
  const relief =
    ff *
    (0.0045 * gs(y - 0.045, 0.014) * gs(x, 0.05) -
      0.0075 * gs(y - 0.018, 0.012) * (gs(x - 0.032, 0.016) + gs(x + 0.032, 0.016)) +
      0.004 * gs(y + 0.012, 0.016) * (gs(x - 0.05, 0.018) + gs(x + 0.05, 0.018)) +
      0.0035 * gs(y + 0.055, 0.008) * gs(x, 0.022) -
      0.0025 * gs(y + 0.064, 0.003) * gs(x, 0.02) +
      0.005 * gs(y + 0.094, 0.012) * gs(x, 0.024));
  rz += relief;
  return out.set(-Math.cos(th) * (rx + push), y, cz - Math.sin(th) * (rz + push));
}

/** Head with a full mass of curly hair (a god's), neck from `neck`; returns the head centre. */
function head(s: Body, neck: THREE.Vector3, turn = 0): THREE.Vector3 {
  const C = neck.clone().add(V(0, 0.155, -0.012));
  const rot = new THREE.Matrix4().makeRotationY(turn).setPosition(C);
  const part = (g: THREE.BufferGeometry) => s.geo(g.applyMatrix4(rot));
  s.loft([neck.clone().add(V(0, -0.03, 0.004)), neck.clone().add(V(0, 0.05, 0.0)), neck.clone().add(V(0, 0.11, 0.004))], [[0.056, 0.058], [0.053, 0.054], [0.048, 0.052]], { seg: s.hi ? 10 : 6, sub: 1 });
  const ths = linspace(0, Math.PI * 2, s.n(s.hi ? 32 : 8));
  const ys = s.hi ? linspace(HEAD[0][0], HEAD[HEAD.length - 1][0], s.n(30)) : HEAD.map((h) => h[0]).filter((_, i) => i % 2 === 0 || i === HEAD.length - 1);
  part(gridSurface(ths, ys, (th, y, out) => headPoint(th, y, out), { flip: true }));
  const nose = new THREE.BufferGeometry();
  const fz = (y: number) => lerpTable(y, 1) - lerpTable(y, 3) * 0.92;
  const top = V(0, 0.038, fz(0.038) + 0.006);
  const tip = V(0, -0.022, fz(-0.022) - 0.024);
  const wl = V(-0.017, -0.03, fz(-0.03) + 0.004);
  const wr = V(0.017, -0.03, fz(-0.03) + 0.004);
  const bot = V(0, -0.034, fz(-0.034) - 0.006);
  const tris = [top, tip, wl, top, wr, tip, wl, tip, bot, tip, wr, bot];
  nose.setAttribute('position', new THREE.Float32BufferAttribute(tris.flatMap((p) => [p.x, p.y, p.z]), 3));
  nose.computeVertexNormals();
  part(nose);
  if (s.hi) for (const sx of [-1, 1]) part(new THREE.SphereGeometry(1, 8, 6).scale(0.011, 0.03, 0.02).translate(sx * 0.074, 0.0, 0.016));
  // a god's hair: thick locks from low on the brow down to the nape
  const hairTop = HEAD[HEAD.length - 1][0];
  const hairTs = linspace(0, 1, s.n(s.hi ? 7 : 3));
  const low = (th: number) => 0.04 * Math.max(0, Math.sin(th)) ** 1.5 - 0.11 * Math.max(0, -Math.sin(th));
  part(
    gridSurface(ths, hairTs, (th, t, out) => {
      const y = low(th) + (hairTop - low(th)) * t;
      const lock = s.hi ? 0.005 * Math.sin(th * 13 + t * 9) * (1 - t) : 0;
      return headPoint(th, y, out, 0.022 * smooth(0, 0.25, t) * (1 - 0.6 * t * t) + lock);
    }, { flip: true }),
  );
  return C;
}

// ---------------------------------------------------------------- limbs (as statues.ts, bare)

function hand(s: Body, wrist: THREE.Vector3, dir: THREE.Vector3, palm: THREE.Vector3, open = false) {
  const d = dir.clone().normalize();
  const len = open ? 0.17 : 0.11;
  const p = (k: number) => wrist.clone().addScaledVector(d, k * len);
  s.loft([p(-0.05), p(0.35), p(0.7), p(1)], [[0.03, 0.02], [0.044, 0.022], [0.043, 0.021], open ? [0.03, 0.012] : [0.035, 0.026]], { front: palm, seg: s.hi ? 8 : 5, sub: s.hi ? 2 : 1 });
  const side = new THREE.Vector3().crossVectors(d, palm).normalize();
  s.loft([p(0.15).addScaledVector(side, 0.025), p(0.5).addScaledVector(side, 0.045).addScaledVector(palm, 0.012), p(0.75).addScaledVector(side, 0.045).addScaledVector(palm, 0.02)], [[0.014, 0.012], [0.012, 0.011], [0.009, 0.008]], { seg: 5, sub: 1 });
}

/** A bare arm with the biceps and forearm swell. */
function arm(s: Body, sh: THREE.Vector3, el: THREE.Vector3, wr: THREE.Vector3) {
  const a1 = sh.clone().lerp(el, 0.4);
  const a2 = sh.clone().lerp(el, 0.75);
  const f1 = el.clone().lerp(wr, 0.3);
  const f2 = el.clone().lerp(wr, 0.7);
  s.loft([sh.clone().lerp(el, -0.18), a1, a2, el, f1, f2, wr], [[0.062, 0.066], [0.054, 0.058], [0.047, 0.05], [0.04, 0.041], [0.043, 0.04], [0.035, 0.03], [0.028, 0.022]], { front: V(0, 1, 0) });
}

/** A bare leg with thigh, knee and calf, and a sandalled foot pointing along `toe`. */
function leg(s: Body, hip: THREE.Vector3, knee: THREE.Vector3, ankle: THREE.Vector3, toe: THREE.Vector3) {
  const thigh = hip.clone().lerp(knee, 0.4);
  const thigh2 = hip.clone().lerp(knee, 0.78);
  const calf = knee.clone().lerp(ankle, 0.3);
  const shin = knee.clone().lerp(ankle, 0.72);
  s.loft([hip.clone().lerp(knee, -0.12), thigh, thigh2, knee, calf, shin, ankle], [[0.1, 0.1], [0.085, 0.088], [0.066, 0.068], [0.052, 0.054], [0.062, 0.066], [0.04, 0.041], [0.034, 0.036]]);
  const f = toe.clone().normalize();
  const a = ankle.clone().add(V(0, -0.045, 0));
  s.loft([a.clone().addScaledVector(f, -0.07), a.clone().addScaledVector(f, 0.02).add(V(0, 0.01, 0)), a.clone().addScaledVector(f, 0.12).add(V(0, -0.012, 0)), a.clone().addScaledVector(f, 0.19).add(V(0, -0.022, 0))], [[0.036, 0.04], [0.042, 0.05], [0.042, 0.03], [0.03, 0.016]], { front: V(0, 1, 0), seg: s.hi ? 8 : 5, sub: s.hi ? 2 : 1 });
}

/** Bare torso from the hips to the neck: pectorals, rib arch, linea alba (statues.ts cuirass, bare). */
function torso(s: Body, y0: number) {
  const sw = 0.012;
  const ys = [0.84, 0.94, 1.04, 1.14, 1.24, 1.32, 1.4, 1.47, 1.53];
  const cx = [sw, sw * 0.8, sw * 0.5, sw * 0.2, 0, 0, 0, 0, 0];
  const cz = [0.004, 0, 0, 0, 0, 0.005, 0.012, 0.02, 0.022];
  const r: [number, number][] = [[0.17, 0.12], [0.16, 0.112], [0.142, 0.1], [0.148, 0.104], [0.162, 0.112], [0.174, 0.118], [0.19, 0.11], [0.168, 0.09], [0.07, 0.058]];
  const yAt = (u: number) => crValue(ys, u * (ys.length - 1));
  s.loft(
    ys.map((y, i) => V(cx[i], y0 + y, cz[i])),
    r,
    {
      front: V(0, 0, -1),
      seg: s.hi ? 20 : 8,
      sub: s.hi ? 3 : 1,
      shape: (th, u) => {
        const y = yAt(u);
        const f = Math.max(0, Math.sin(th));
        const lat = Math.cos(th);
        const dy = y - 1.335;
        const pv = dy > 0 ? Math.exp(-((dy / 0.075) ** 2)) : Math.exp(-((dy / 0.035) ** 2));
        const pl = Math.exp(-(((lat - 0.42) / 0.3) ** 2)) + Math.exp(-(((lat + 0.42) / 0.3) ** 2));
        const pecs = 0.07 * pv * Math.min(1, pl) * f * f;
        const rib = 0.028 * Math.exp(-(((y - 1.215 - 0.06 * Math.abs(lat)) / 0.022) ** 2)) * f;
        const groove = -0.025 * Math.exp(-((lat / 0.07) ** 2)) * f * smooth(1.04, 1.1, y) * smooth(1.32, 1.24, y);
        // the iliac furrow (the "girdle of Apollo") above the hips
        const iliac = -0.02 * Math.exp(-(((y - 0.95 - 0.05 * (1 - Math.abs(lat))) / 0.02) ** 2)) * f * Math.min(1, Math.abs(lat) * 2);
        return 1 + pecs + rib + groove + iliac;
      },
    },
  );
  // hips and buttocks under the torso
  s.loft([V(sw, y0 + 0.78, 0.01), V(sw, y0 + 0.84, 0.012), V(sw, y0 + 0.9, 0.006)], [[0.165, 0.12], [0.175, 0.13], [0.17, 0.12]], { front: V(0, 0, -1), seg: s.hi ? 16 : 8, sub: 1, shape: (th) => 1 + 0.06 * Math.max(0, -Math.sin(th)) ** 2 });
}

// ---------------------------------------------------------------- the figure

export interface HeroicNudeOptions {
  material?: MaterialId;
  /** Material of the radiate crown (gilded). */
  crownMat?: MaterialId;
  scale?: number;
  hi?: boolean;
  /** Tessellation multiplier (colossal figures seen from close by). */
  q?: number;
  /** Sol's radiate crown (seven rays). */
  radiate?: boolean;
  /** Left hand on a steering oar standing on a globe (Sol as ruler of the world). */
  rudder?: boolean;
  /** A chlamys over the left shoulder and forearm (default true unless `wineskin`). */
  chlamys?: boolean;
  /** Marsyas: the wineskin slung over the left shoulder, held by the raised left hand; satyr's tail. */
  wineskin?: boolean;
}

/**
 * A standing heroic nude in contrapposto, the right hand raised, a chlamys over the left shoulder
 * and forearm: the Colossus as Sol (after the coins of the rededicated statue).
 */
export function heroicNude(b: MeshBuilder, at: THREE.Matrix4, o: HeroicNudeOptions = {}) {
  const s = new Body(o.hi ?? true, o.material ?? 'bronze', o.q ?? 1);
  const y0 = 0;
  const Y = (y: number) => y + y0;
  // weight on the right leg, the left relaxed, knee forward, foot drawn back and out
  leg(s, V(0.09, Y(0.88), 0), V(0.1, Y(0.49), -0.015), V(0.1, Y(0.09), 0.01), V(0.05, 0, -1));
  leg(s, V(-0.09, Y(0.87), 0), V(-0.13, Y(0.5), -0.08), V(-0.16, Y(0.11), 0.08), V(-0.25, 0, -1));
  torso(s, y0);
  // shoulders (deltoids)
  for (const sx of [-1, 1]) s.blob(V(sx * 0.19, Y(1.45), 0.008), 0.072, 0.066, 0.074);
  // the right arm raised in greeting, the open palm forward
  const shR = V(0.2, Y(1.45), 0);
  const elR = V(0.35, Y(1.63), -0.06);
  const wrR = V(0.41, Y(1.86), -0.12);
  arm(s, shR, elR, wrR);
  hand(s, wrR, V(0.15, 1, -0.2), V(0, 0.2, -1), true);
  const shL = V(-0.2, Y(1.45), 0);
  if (o.wineskin) {
    // the left hand up at the shoulder, holding the neck of the wineskin slung behind it
    const elL = V(-0.31, Y(1.3), 0.05);
    const wrL = V(-0.25, Y(1.55), 0.08);
    arm(s, shL, elL, wrL);
    hand(s, wrL, V(0.1, 1, 0.2), V(1, 0, 0));
    s.blob(V(-0.15, Y(1.52), 0.17), 0.15, 0.11, 0.1, new THREE.Euler(0.3, 0, 0.5));
    s.blob(V(0, Y(0.98), 0.14), 0.025, 0.025, 0.07, new THREE.Euler(0.7, 0, 0));
  } else {
    // the left arm lowered and forward, the hand on the oar
    const elL = V(-0.29, Y(1.17), -0.06);
    const wrL = V(-0.37, Y(1.05), -0.24);
    arm(s, shL, elL, wrL);
    hand(s, wrL, V(-0.25, -0.2, -1), V(1, 0, 0));
  }
  // chlamys: pinned on the left shoulder, down the back and wound over the left forearm
  const out = (p: THREE.Vector3) => V(p.x + 0.05, 0, p.z - 0.02).normalize();
  if (o.chlamys ?? !o.wineskin) s.loft([V(-0.16, Y(1.52), -0.02), V(-0.22, Y(1.4), 0.1), V(-0.2, Y(1.15), 0.14), V(-0.24, Y(0.98), 0.1), V(-0.31, Y(1.06), -0.06), V(-0.33, Y(1.1), -0.2)], [[0.05, 0.02], [0.09, 0.026], [0.1, 0.028], [0.09, 0.028], [0.08, 0.03], [0.06, 0.028]], { front: out, seg: s.hi ? 12 : 6, shape: (th) => 1 + (s.hi ? 0.12 * Math.sin(th * 3) : 0) });
  // the end hanging from the forearm: a heavy fall of cloth, round in section with deep folds
  if (o.chlamys ?? !o.wineskin) s.loft([V(-0.34, Y(1.1), -0.17), V(-0.35, Y(0.95), -0.15), V(-0.35, Y(0.78), -0.14), V(-0.34, Y(0.6), -0.13), V(-0.33, Y(0.52), -0.13)], [[0.06, 0.05], [0.075, 0.06], [0.085, 0.062], [0.08, 0.058], [0.05, 0.04]], { front: V(-1, 0, 0), seg: s.hi ? 16 : 8, shape: (th, u) => 1 + (s.hi ? 0.2 * Math.sin(th * 6 + u * 4) * (0.3 + u) : 0) });
  const C = head(s, V(0, Y(1.515), 0.02), 0.12);
  if (o.radiate ?? !o.wineskin) {
    const cm = o.crownMat ?? 'gilded_bronze';
    const band = new THREE.TorusGeometry(0.098, 0.012, 5, s.n(s.hi ? 20 : 10));
    band.rotateX(Math.PI / 2 - 0.12);
    band.applyMatrix4(new THREE.Matrix4().makeRotationY(0.12));
    band.translate(C.x, C.y + 0.055, C.z + 0.01);
    s.geo(band, cm);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * 0.42 + (Math.PI * 0.84 * i) / (n - 1);
      const base = C.clone().add(V(Math.sin(a) * 0.095, 0.075 + Math.cos(a) * 0.02, -0.02 + Math.abs(Math.sin(a)) * 0.03));
      const L = 0.36;
      const tip = C.clone().add(V(Math.sin(a) * (0.1 + L * 0.9), 0.075 + Math.cos(a) * L, -0.03 + Math.abs(Math.sin(a)) * 0.06));
      const dir = tip.clone().sub(base);
      const len = dir.length();
      const blade = extrudePolygon(
        [
          [-0.024, 0],
          [0.024, 0],
          [0.005, len],
          [-0.005, len],
        ],
        0.012,
      );
      blade.translate(0, 0, -0.006);
      blade.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize()));
      blade.translate(base.x, base.y, base.z);
      s.geo(blade, cm);
    }
  }
  if (o.rudder ?? !o.wineskin) {
    // the steering oar standing on a globe beside the left foot
    s.blob(V(-0.44, Y(0.17), -0.3), 0.17, 0.17, 0.17);
    s.loft([V(-0.43, Y(0.32), -0.3), V(-0.41, Y(0.75), -0.29), V(-0.39, Y(1.12), -0.27)], [[0.022, 0.022], [0.02, 0.02], [0.018, 0.018]], { seg: 8, sub: 1 });
    s.loft([V(-0.43, Y(0.33), -0.3), V(-0.43, Y(0.48), -0.3), V(-0.42, Y(0.62), -0.3)], [[0.03, 0.075], [0.026, 0.07], [0.02, 0.02]], { front: V(0, 0, -1), seg: 8, sub: 1 });
  }
  s.emit(b, at, o.scale ?? 1);
}
