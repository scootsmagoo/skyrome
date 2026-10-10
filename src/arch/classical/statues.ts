/**
 * Statues: simplified sculptural forms with life-size proportions (a 1.85 m figure is "life
 * size"; Roman honorific statues were often a little over, cult statues far more). Bodies are
 * LOFTED: smooth closed sections swept along a spine or limb (torso, limbs, hands, toga, horse),
 * so silhouettes read as carved stone or cast bronze rather than stacked blobs. Detail that would
 * have been painted (eyes, lips) is left out: at street distance a smooth face with a nose, brow
 * and hair cap reads right; dark cavities read as a mask.
 *
 *  - togate(): a citizen/magistrate in the toga (sinus, umbo, balteus), a scroll in each hand.
 *  - armoredEmperor(): the cuirassed emperor in the adlocutio pose (Augustus of Prima Porta,
 *    Trajan's statues): one-piece muscle cuirass with low pectoral and abdominal relief, belt,
 *    lappets and pteruges over a tunic, paludamentum over the left arm.
 *  - equestrian(): the emperor on horseback, right foreleg raised (Equus Traiani, AD 112).
 *  - seatedDeity(): enthroned god with sceptre (Jupiter Optimus Maximus type).
 *  - quadriga(): four horses abreast with a chariot and driver (arch and temple crowns).
 *
 * Frame: origin at the base centre on the ground, the figure FACES −z (the facade convention of
 * the architecture kit), so its right hand is at +x. `scale` multiplies everything.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { gridSurface, linspace, mul, tube } from '../common/geom';
import type { Detail } from './orders';

export interface StatueOptions {
  material?: MaterialId;
  scale?: number;
  detail?: Detail;
  /** Add a plinth under the feet (default true). */
  plinth?: boolean;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Catmull-Rom interpolation of a value list at fractional index s. */
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

/** Catmull-Rom interpolation of a point list (crValue per axis, without building arrays: the boot calls it millions of times). */
function crPoint(pts: THREE.Vector3[], s: number, out: THREE.Vector3): THREE.Vector3 {
  const n = pts.length;
  const i = Math.min(n - 2, Math.max(0, Math.floor(s)));
  const t = s - i;
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(n - 1, i + 2)];
  const t2 = t * t;
  const t3 = t2 * t;
  const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return out.set(cr(p0.x, p1.x, p2.x, p3.x), cr(p0.y, p1.y, p2.y, p3.y), cr(p0.z, p1.z, p2.z, p3.z));
}

export interface LoftOptions {
  /** Direction the section's second radius (rz) points along; default −z (the figure's front). May vary along the path. */
  front?: THREE.Vector3 | ((p: THREE.Vector3) => THREE.Vector3);
  /** Radius multiplier per angle (θ = π/2 is `front`, θ = 0 the figure's left for a vertical spine) and position u ∈ [0, 1]. */
  shape?: (theta: number, u: number) => number;
  /** Samples round the section and per path segment. */
  seg?: number;
  sub?: number;
  /** Angular range (default full). */
  theta0?: number;
  theta1?: number;
}

/** Collects geometry for one statue, then adds it to the builder in one go. */
class Sculpt {
  readonly parts: THREE.BufferGeometry[] = [];
  constructor(readonly hi: boolean) {}

  /**
   * Smooth tube through `path` with elliptical sections (rx across, rz towards `front`),
   * radii interpolated along the path. The outward side is detected automatically.
   */
  loft(path: THREE.Vector3[], radii: [number, number][], o: LoftOptions = {}) {
    const n = path.length;
    const seg = o.seg ?? (this.hi ? 12 : 6);
    const sub = o.sub ?? (this.hi ? 3 : 1);
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
        // `front` runs along the spine here: any perpendicular will do.
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
    // Orientation: ∂θ × ∂s must point away from the spine.
    const p0 = P(0.3, (n - 1) / 2, new THREE.Vector3());
    const pa = P(0.3 + 1e-3, (n - 1) / 2, new THREE.Vector3()).sub(p0);
    const pb = P(0.3, (n - 1) / 2 + 1e-3, new THREE.Vector3()).sub(p0);
    crPoint(path, (n - 1) / 2, c2);
    const flip = new THREE.Vector3().crossVectors(pa, pb).dot(p0.clone().sub(c2)) < 0;
    this.parts.push(gridSurface(ths, ss, P, { flip }));
    return this;
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

  tube(path: THREE.Vector3[], r: number | ((i: number) => number), radial = 7) {
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

// ---------------------------------------------------------------- body parts

/** Head sections relative to the head centre: [y, z offset of the section centre, rx, rz]. */
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
      // smoothstep blend keeps the profile rounded between the sections
      const u = t * t * (3 - 2 * t) * 0.5 + t * 0.5;
      return a[col] + (b[col] - a[col]) * u;
    }
  }
  return HEAD[HEAD.length - 1][col];
}

const g = (x: number, sd: number) => Math.exp(-((x / sd) ** 2));

/** A point on the head surface at angle θ (θ = π/2 faces −z) and height y (head-centre frame). */
function headPoint(th: number, y: number, out: THREE.Vector3, push = 0): THREE.Vector3 {
  const cz = lerpTable(y, 1);
  const rx = lerpTable(y, 2);
  let rz = lerpTable(y, 3);
  const f = Math.max(0, Math.sin(th));
  // Faces are flatter than ellipses across the front.
  rz *= 1 - 0.08 * f ** 3;
  // Carved features as shallow relief on the front (no dark cavities): brow, eye sockets,
  // cheekbones, lips and chin.
  const x = -Math.cos(th) * rx;
  const ff = f ** 2;
  const relief =
    ff *
    (0.0045 * g(y - 0.045, 0.014) * g(x, 0.05) -
      0.0075 * g(y - 0.018, 0.012) * (g(x - 0.032, 0.016) + g(x + 0.032, 0.016)) +
      0.004 * g(y + 0.012, 0.016) * (g(x - 0.05, 0.018) + g(x + 0.05, 0.018)) +
      0.0035 * g(y + 0.055, 0.008) * g(x, 0.022) -
      0.0025 * g(y + 0.064, 0.003) * g(x, 0.02) +
      0.005 * g(y + 0.094, 0.012) * g(x, 0.024));
  rz += relief;
  return out.set(-Math.cos(th) * (rx + push), y, cz - Math.sin(th) * (rz + push));
}

/**
 * Bare head with a hair cap of short combed-forward locks (Trajanic) or, for gods, a fuller mass
 * of hair and a beard. Neck from `neck` (base) up into the head; returns the head centre.
 */
function head(s: Sculpt, neck: THREE.Vector3, o: { beard?: boolean; fullHair?: boolean; turn?: number } = {}) {
  const C = neck.clone().add(V(0, 0.155, -0.012));
  const rot = new THREE.Matrix4().makeRotationY(o.turn ?? 0).setPosition(C);
  const part = (g: THREE.BufferGeometry) => s.parts.push(g.applyMatrix4(rot));
  s.loft([neck.clone().add(V(0, -0.03, 0.004)), neck.clone().add(V(0, 0.05, 0.0)), neck.clone().add(V(0, 0.11, 0.004))], [[0.052, 0.056], [0.05, 0.052], [0.046, 0.05]], { seg: s.hi ? 10 : 6, sub: 1 });
  const nTh = s.hi ? 32 : 8;
  const ths = linspace(0, Math.PI * 2, nTh);
  const ys = s.hi ? linspace(HEAD[0][0], HEAD[HEAD.length - 1][0], 30) : HEAD.map((h) => h[0]).filter((_, i) => i % 2 === 0 || i === HEAD.length - 1);
  // P(θ, y) = (−cos θ · rx, y, z − sin θ · rz): ∂θ × ∂y points inward, hence the flips.
  part(gridSurface(ths, ys, (th, y, out) => headPoint(th, y, out), { flip: true }));
  // Nose: a wedge from the bridge to the tip, standing off the face.
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
  // Ears.
  if (s.hi) for (const sx of [-1, 1]) part(new THREE.SphereGeometry(1, 8, 6).scale(0.011, 0.03, 0.02).translate(sx * 0.074, 0.0, 0.016));
  // Hair: a shell over the skull, from a fringe low on the forehead to the nape, lifted at the
  // top so its edge melts into the skin; ripples suggest locks.
  const hairTop = HEAD[HEAD.length - 1][0];
  const hairTs = linspace(0, 1, s.hi ? 7 : 3);
  const low = (th: number) => {
    const f = Math.max(0, Math.sin(th));
    const bk = Math.max(0, -Math.sin(th));
    return (o.fullHair ? 0.0 : 0.03) + 0.05 * f ** 1.5 - (o.fullHair ? 0.11 : 0.075) * bk;
  };
  const thick = o.fullHair ? 0.02 : 0.009;
  part(
    gridSurface(ths, hairTs, (th, t, out) => {
      const y = low(th) + (hairTop - low(th)) * t;
      const lock = s.hi ? 0.0035 * Math.sin(th * 15 + t * 9) * (1 - t) : 0;
      return headPoint(th, y, out, thick * smooth(0, 0.25, t) * (1 - 0.6 * t * t) + lock);
    }, { flip: true }),
  );
  if (o.beard) {
    // Beard and moustache over the jaw: the lower face only (front half).
    const bt = linspace(0, 1, s.hi ? 5 : 2);
    part(
      gridSurface(linspace(Math.PI * 0.08, Math.PI * 0.92, s.hi ? 14 : 6), bt, (th, t, out) => {
        const y = -0.118 + t * 0.1;
        const curl = s.hi ? 0.004 * Math.sin(th * 13 + t * 7) : 0;
        return headPoint(th, y, out, 0.02 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + curl + 0.004);
      }, { flip: true }),
    );
  }
  return C;
}

/** A hand from the wrist along `dir`; `open` = flat palm, otherwise a loose fist. */
function hand(s: Sculpt, wrist: THREE.Vector3, dir: THREE.Vector3, palm: THREE.Vector3, open = false) {
  const d = dir.clone().normalize();
  const len = open ? 0.17 : 0.11;
  const p = (k: number) => wrist.clone().addScaledVector(d, k * len);
  s.loft([p(-0.05), p(0.35), p(0.7), p(1)], [[0.03, 0.02], [0.044, 0.022], [0.043, 0.021], open ? [0.03, 0.012] : [0.035, 0.026]], { front: palm, seg: s.hi ? 8 : 5, sub: s.hi ? 2 : 1 });
  // thumb
  const side = new THREE.Vector3().crossVectors(d, palm).normalize();
  s.loft([p(0.15).addScaledVector(side, 0.025), p(0.5).addScaledVector(side, 0.045).addScaledVector(palm, 0.012), p(0.75).addScaledVector(side, 0.045).addScaledVector(palm, 0.02)], [[0.014, 0.012], [0.012, 0.011], [0.009, 0.008]], { seg: 5, sub: 1 });
}

/** An arm through shoulder, elbow and wrist; optional tunic sleeve. */
function arm(s: Sculpt, sh: THREE.Vector3, el: THREE.Vector3, wr: THREE.Vector3, sleeve = true) {
  const mid1 = sh.clone().lerp(el, 0.5);
  const mid2 = el.clone().lerp(wr, 0.45);
  s.loft([sh.clone().lerp(el, -0.15), mid1, el, mid2, wr], [[0.055, 0.058], [0.047, 0.05], [0.04, 0.042], [0.039, 0.037], [0.029, 0.023]], { front: V(0, 1, 0).addScaledVector(el.clone().sub(sh).normalize(), 0) });
  if (sleeve) s.loft([sh.clone().lerp(el, -0.1), sh.clone().lerp(el, 0.45)], [[0.068, 0.07], [0.058, 0.06]], { sub: 1 });
}

/** A leg through hip, knee and ankle, with a booted foot pointing along `toe`. */
function leg(s: Sculpt, hip: THREE.Vector3, knee: THREE.Vector3, ankle: THREE.Vector3, toe: THREE.Vector3, boot = true) {
  const thigh = hip.clone().lerp(knee, 0.45);
  const calf = knee.clone().lerp(ankle, 0.3);
  const shin = knee.clone().lerp(ankle, 0.72);
  s.loft([hip.clone().lerp(knee, -0.1), thigh, knee, calf, shin, ankle], [[0.095, 0.097], [0.08, 0.082], [0.054, 0.056], [0.06, 0.064], boot ? [0.046, 0.047] : [0.042, 0.042], [0.035, 0.037]]);
  // foot: heel → instep → toes
  const f = toe.clone().normalize();
  const a = ankle.clone().add(V(0, -0.045, 0));
  s.loft([a.clone().addScaledVector(f, -0.07), a.clone().addScaledVector(f, 0.02).add(V(0, 0.01, 0)), a.clone().addScaledVector(f, 0.12).add(V(0, -0.012, 0)), a.clone().addScaledVector(f, 0.19).add(V(0, -0.022, 0))], [[0.036, 0.04], [0.042, 0.05], [0.042, 0.03], [0.03, 0.016]], { front: V(0, 1, 0), seg: s.hi ? 8 : 5, sub: s.hi ? 2 : 1 });
}

function plinth(s: Sculpt, w: number, d: number, h = 0.14) {
  s.box(V(0, h / 2, 0), w, h, d);
  return h;
}

/**
 * One-piece muscle cuirass from the hips to the neck: broad pectoral plates with a crisp lower
 * edge, the arch of the ribs and a shallow linea alba — a few centimetres of relief.
 */
function cuirassTorso(s: Sculpt, y0: number, opts: { bare?: boolean; sway?: number; dz?: number } = {}) {
  const sw = opts.sway ?? 0.012;
  const ys = [0.86, 0.96, 1.06, 1.16, 1.26, 1.34, 1.42, 1.48, 1.53];
  const cx = [sw, sw * 0.8, sw * 0.5, sw * 0.2, 0, 0, 0, 0, 0];
  const cz = [0.004, 0, 0, 0, 0, 0.005, 0.012, 0.02, 0.022];
  const r: [number, number][] = [[0.172, 0.122], [0.165, 0.116], [0.152, 0.108], [0.157, 0.112], [0.168, 0.12], [0.178, 0.123], [0.19, 0.113], [0.165, 0.09], [0.07, 0.058]];
  const amp = opts.bare ? 0.7 : 1;
  const yAt = (u: number) => {
    const sIdx = u * (ys.length - 1);
    return crValue(ys, sIdx);
  };
  s.loft(
    ys.map((y, i) => V(cx[i], y0 + y, cz[i] + (opts.dz ?? 0))),
    r,
    {
      front: V(0, 0, -1),
      seg: s.hi ? 20 : 8,
      sub: s.hi ? 3 : 1,
      shape: (th, u) => {
        const y = yAt(u);
        const f = Math.max(0, Math.sin(th));
        const lat = Math.cos(th);
        // pectorals: slow rise above, a sharp edge below (a shadow line, not a round bulge)
        const dy = y - 1.335;
        const pv = dy > 0 ? Math.exp(-((dy / 0.075) ** 2)) : Math.exp(-((dy / 0.03) ** 2));
        const pl = Math.exp(-(((lat - 0.42) / 0.3) ** 2)) + Math.exp(-(((lat + 0.42) / 0.3) ** 2));
        const pecs = 0.085 * pv * Math.min(1, pl) * f * f;
        // rib arch (an inverted V) and the abdominal groove
        const rib = 0.035 * Math.exp(-(((y - 1.215 - 0.06 * Math.abs(lat)) / 0.022) ** 2)) * f;
        const groove = -0.03 * Math.exp(-((lat / 0.07) ** 2)) * f * smooth(1.06, 1.12, y) * smooth(1.32, 1.24, y);
        return 1 + amp * (pecs + rib + groove);
      },
    },
  );
}

// ---------------------------------------------------------------- statues

/** A citizen in the toga: broad-shouldered, weight on the right leg, scrolls in both hands. */
export function togate(b: MeshBuilder, at: THREE.Matrix4, opts: StatueOptions = {}) {
  const s = new Sculpt((opts.detail ?? 'high') === 'high');
  const y0 = opts.plinth === false ? 0 : plinth(s, 0.66, 0.56);
  const Y = (y: number) => y + y0;
  // Shoe toes under the hem.
  for (const [x, z, a] of [[0.1, -0.13, 0.1], [-0.12, -0.16, -0.25]] as const) s.loft([V(x, Y(0.03), z + 0.08), V(x - a * 0.05, Y(0.035), z - 0.04)], [[0.04, 0.035], [0.03, 0.02]], { front: V(0, 1, 0), seg: 6, sub: 1 });
  // The toga's main mass: hem to shoulders, broad at the shoulders, with vertical folds that
  // deepen towards the hem and the relaxed left knee pressing through.
  const ys = [0.03, 0.25, 0.55, 0.85, 1.05, 1.25, 1.38, 1.46, 1.52, 1.57];
  const cx = [0, 0, -0.005, 0.008, 0.008, 0, 0, 0, 0, 0];
  const cz = [0.01, 0.0, -0.01, 0, 0, 0, 0.004, 0.01, 0.015, 0.018];
  const rr: [number, number][] = [[0.255, 0.19], [0.235, 0.172], [0.222, 0.162], [0.212, 0.152], [0.21, 0.15], [0.218, 0.152], [0.238, 0.146], [0.236, 0.122], [0.13, 0.088], [0.058, 0.052]];
  s.loft(
    ys.map((y, i) => V(cx[i], Y(y), cz[i])),
    rr,
    {
      seg: s.hi ? 28 : 10,
      sub: s.hi ? 3 : 1,
      shape: (th, u) => {
        const y = crValue(ys, u * (ys.length - 1));
        const folds = s.hi ? (0.035 * (1 - smooth(0.1, 1.2, y)) + 0.008) * Math.sin(th * 11 + y * 3) : 0;
        const knee = 0.09 * Math.exp(-(((y - 0.56) / 0.14) ** 2)) * Math.exp(-(((th - Math.PI * 0.32) / 0.45) ** 2));
        return 1 + folds + knee;
      },
    },
  );
  // Sinus: the heavy curved swag from the left shoulder across the front to the right knee and
  // back up under the right arm; a second, smaller fold inside it.
  const out = (p: THREE.Vector3) => V(p.x, 0, p.z + 0.01).normalize();
  s.loft([V(-0.17, Y(1.49), -0.06), V(-0.08, Y(1.37), -0.15), V(0.04, Y(1.14), -0.18), V(0.15, Y(0.88), -0.19), V(0.22, Y(0.72), -0.15), V(0.27, Y(0.78), -0.03), V(0.25, Y(1.0), 0.06)], [[0.05, 0.03], [0.07, 0.035], [0.085, 0.04], [0.09, 0.045], [0.085, 0.045], [0.07, 0.04], [0.05, 0.03]], { front: out, seg: s.hi ? 10 : 6, shape: (th) => 1 + (s.hi ? 0.1 * Math.sin(th * 3) : 0) });
  if (s.hi) s.loft([V(-0.1, Y(1.42), -0.12), V(0.0, Y(1.25), -0.165), V(0.12, Y(1.02), -0.17), V(0.2, Y(0.9), -0.12)], [[0.03, 0.018], [0.045, 0.022], [0.045, 0.022], [0.03, 0.015]], { front: out, seg: 8 });
  // Balteus: the band across the chest from the left shoulder to the right hip.
  s.tube([V(-0.13, Y(1.5), -0.09), V(-0.05, Y(1.4), -0.15), V(0.06, Y(1.25), -0.165), V(0.17, Y(1.1), -0.13)], 0.022, 6);
  // Umbo: the pouch of cloth pulled out over the balteus.
  s.blob(V(-0.03, Y(1.2), -0.165), 0.075, 0.06, 0.045);
  // Left arm wrapped in the toga, forearm forward; the toga's end hangs from it to the shin.
  const shL = V(-0.24, Y(1.43), 0.0);
  const elL = V(-0.27, Y(1.13), 0.0);
  const wrL = V(-0.22, Y(1.07), -0.25);
  s.loft([shL, shL.clone().lerp(elL, 0.5), elL, elL.clone().lerp(wrL, 0.5), wrL], [[0.075, 0.075], [0.07, 0.07], [0.066, 0.066], [0.062, 0.058], [0.05, 0.045]]);
  s.loft([V(-0.24, Y(1.07), -0.18), V(-0.25, Y(0.85), -0.17), V(-0.255, Y(0.62), -0.15), V(-0.25, Y(0.45), -0.14)], [[0.08, 0.04], [0.085, 0.045], [0.08, 0.04], [0.07, 0.03]], { front: V(-1, 0, 0), shape: (th, u) => 1 + (s.hi ? 0.12 * Math.sin(th * 5 + u * 4) * u : 0) });
  hand(s, wrL.clone().add(V(0, 0, -0.02)), V(0.05, -0.05, -1), V(1, 0, 0));
  s.loft([V(-0.2, Y(1.1), -0.31), V(-0.2, Y(0.97), -0.31)], [[0.024, 0.024], [0.024, 0.024]], { front: V(0, 0, -1), seg: 8, sub: 1 });
  // Right arm: the tunic sleeve emerging from the sinus, forearm forward, a scroll in the hand.
  const shR = V(0.23, Y(1.43), 0.01);
  const elR = V(0.27, Y(1.15), 0.03);
  const wrR = V(0.26, Y(1.04), -0.22);
  arm(s, shR, elR, wrR, true);
  hand(s, wrR, V(0, -0.15, -1), V(-1, 0, 0));
  s.loft([V(0.205, Y(1.0), -0.29), V(0.33, Y(1.0), -0.29)], [[0.023, 0.023], [0.023, 0.023]], { front: V(0, 1, 0), seg: 8, sub: 1 });
  head(s, V(0, Y(1.545), 0.012), { turn: 0.12 });
  s.emit(b, opts.material ?? 'marble', at, opts.scale ?? 1);
}

/** Tunic skirt, belt, lappets and pteruges of a cuirassed figure (around the hips at y0). */
function cuirassSkirt(s: Sculpt, y0: number) {
  const Y = (y: number) => y + y0;
  s.loft([V(0.01, Y(0.98), 0), V(0.008, Y(0.84), 0), V(0.005, Y(0.7), 0)], [[0.18, 0.13], [0.2, 0.15], [0.215, 0.162]], { sub: 1, seg: s.hi ? 24 : 10, shape: (th, u) => 1 + (s.hi ? 0.03 * u * Math.sin(th * 9) : 0) });
  // belt (cingulum)
  const ring = (rx: number, rz: number, y: number) => linspace(0, Math.PI * 2, s.hi ? 32 : 12).map((a) => V(Math.sin(a) * rx + 0.006, Y(y), Math.cos(a) * rz));
  s.tube(ring(0.162, 0.118, 1.05), 0.016, 6);
  // lappets at the cuirass's lower edge, then two rows of leather strips
  const n = s.hi ? 18 : 10;
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < n; i++) {
      const a = ((i + row * 0.5) / n) * Math.PI * 2;
      const rx = 0.178 + row * 0.012;
      const rz = 0.128 + row * 0.012;
      const p = V(Math.sin(a) * rx + 0.008, Y(row === 0 ? 0.955 : 0.87), Math.cos(a) * rz);
      s.box(p, row === 0 ? 0.055 : 0.05, row === 0 ? 0.075 : 0.17, 0.014, new THREE.Euler(0.12 * Math.cos(a), a, -0.12 * Math.sin(a), 'YXZ'));
    }
}

/** Cuirassed emperor, right arm raised in address, sceptre/spear in the left. */
export function armoredEmperor(b: MeshBuilder, at: THREE.Matrix4, opts: StatueOptions & { spear?: boolean } = {}) {
  const s = new Sculpt((opts.detail ?? 'high') === 'high');
  const y0 = opts.plinth === false ? 0 : plinth(s, 0.62, 0.56);
  const Y = (y: number) => y + y0;
  // Legs: weight on the right (+x), left knee relaxed forward and the foot drawn back.
  leg(s, V(0.09, Y(0.9), 0), V(0.1, Y(0.5), -0.015), V(0.1, Y(0.09), 0.01), V(0.05, 0, -1));
  leg(s, V(-0.09, Y(0.9), 0), V(-0.13, Y(0.51), -0.08), V(-0.15, Y(0.11), 0.07), V(-0.25, 0, -1));
  cuirassSkirt(s, y0);
  cuirassTorso(s, y0);
  // Shoulder guards.
  for (const sx of [-1, 1]) s.blob(V(sx * 0.19, Y(1.45), 0.008), 0.068, 0.06, 0.07);
  // Paludamentum: knotted on the left shoulder, wound round the hips and over the left forearm.
  const outE = (p: THREE.Vector3) => V(p.x, 0, p.z).normalize();
  s.loft([V(-0.17, Y(1.51), -0.02), V(-0.2, Y(1.38), 0.1), V(0.04, Y(1.1), 0.16), V(0.2, Y(0.99), 0.05), V(0.12, Y(0.88), -0.16), V(-0.08, Y(0.91), -0.2), V(-0.22, Y(1.04), -0.18)], [[0.05, 0.022], [0.08, 0.028], [0.09, 0.03], [0.085, 0.03], [0.1, 0.03], [0.09, 0.03], [0.06, 0.028]], { front: outE, seg: s.hi ? 10 : 6, shape: (th) => 1 + (s.hi ? 0.12 * Math.sin(th * 3) : 0) });
  s.loft([V(-0.25, Y(1.06), -0.13), V(-0.26, Y(0.85), -0.12), V(-0.26, Y(0.62), -0.1)], [[0.075, 0.035], [0.085, 0.04], [0.075, 0.03]], { front: V(-1, 0, 0), shape: (th, u) => 1 + (s.hi ? 0.14 * Math.sin(th * 5 + u * 5) * u : 0) });
  // Right arm raised (adlocutio): upper arm forward and out, forearm up, open hand.
  const shR = V(0.2, Y(1.45), 0);
  const elR = V(0.33, Y(1.48), -0.2);
  const wrR = V(0.37, Y(1.72), -0.27);
  arm(s, shR, elR, wrR);
  hand(s, wrR, V(0.05, 1, -0.15), V(0, 0.15, -1), true);
  // Left arm bent, holding a spear upright.
  const shL = V(-0.2, Y(1.45), 0);
  const elL = V(-0.25, Y(1.17), 0.02);
  const wrL = V(-0.25, Y(1.1), -0.2);
  arm(s, shL, elL, wrL);
  hand(s, wrL, V(0, -0.1, -1), V(1, 0, 0));
  if (opts.spear ?? true) s.loft([V(-0.25, Y(0.12), -0.27), V(-0.25, Y(2.05), -0.27)], [[0.016, 0.016], [0.014, 0.014]], { seg: 6, sub: 1 });
  head(s, V(0, Y(1.515), 0.02), { turn: 0.25 });
  s.emit(b, opts.material ?? 'marble', at, opts.scale ?? 1);
}

/** Horse in a walking pose (or rearing), built from lofts. Origin on the ground under the barrel. */
function horse(s: Sculpt, o: THREE.Vector3, pose: 'walk' | 'rear' = 'walk') {
  const P = (x: number, y: number, z: number) => V(o.x + x, o.y + y, o.z + z);
  const L = pose === 'rear' ? 0.22 : 0;
  // Body along the spine, chest to rump: deep chest, round barrel and quarters.
  s.loft([P(0, 1.2 + L * 0.6, -0.72), P(0, 1.22 + L * 0.5, -0.5), P(0, 1.2 + L * 0.3, -0.15), P(0, 1.22, 0.25), P(0, 1.26, 0.55), P(0, 1.22, 0.78)], [[0.12, 0.17], [0.22, 0.3], [0.26, 0.33], [0.26, 0.31], [0.27, 0.31], [0.13, 0.15]], { front: V(0, 1, 0), seg: s.hi ? 16 : 8, sub: s.hi ? 3 : 1 });
  // Neck, arched, from the withers to the poll; mane along its crest.
  const neck = [P(0, 1.36 + L * 0.7, -0.58), P(0, 1.58 + L, -0.84), P(0, 1.78 + L, -1.03), P(0, 1.9 + L, -1.13)];
  s.loft(neck, [[0.13, 0.25], [0.11, 0.18], [0.09, 0.13], [0.072, 0.09]], { front: V(0, 0.4, -1), seg: s.hi ? 12 : 6, sub: s.hi ? 3 : 1 });
  s.loft([P(0, 1.56 + L * 0.7, -0.5), P(0, 1.78 + L, -0.8), P(0, 1.95 + L, -1.06)], [[0.035, 0.05], [0.03, 0.045], [0.02, 0.03]], { front: V(0, 1, 0.5), seg: 6, sub: s.hi ? 2 : 1 });
  // Head: a long tapering wedge from the poll down to the muzzle.
  s.loft([P(0, 1.93 + L, -1.1), P(0, 1.82 + L, -1.24), P(0, 1.64 + L, -1.37), P(0, 1.54 + L, -1.44), P(0, 1.51 + L, -1.46)], [[0.07, 0.09], [0.068, 0.085], [0.054, 0.064], [0.047, 0.054], [0.03, 0.035]], { front: V(0, 0.7, -1), seg: s.hi ? 12 : 6, sub: s.hi ? 2 : 1 });
  for (const x of [-0.042, 0.042]) s.loft([P(x, 1.95 + L, -1.1), P(x * 1.4, 2.06 + L, -1.07)], [[0.022, 0.016], [0.004, 0.004]], { front: V(0, 0, -1), seg: 5, sub: 1 });
  // Tail.
  s.tube([P(0, 1.42, 0.86), P(0, 1.3, 1.02), P(0, 1.0, 1.1), P(0, 0.72, 1.07)], (i) => 0.065 - i * 0.012, 6);
  // Legs: [shoulder/hip, elbow/stifle, knee/hock, fetlock, hoof]
  const legs: THREE.Vector3[][] =
    pose === 'rear'
      ? [
          [P(0.15, 1.1 + L, -0.62), P(0.17, 0.95 + L, -0.72), P(0.17, 0.82 + L, -0.92), P(0.17, 0.66 + L, -0.8), P(0.17, 0.6 + L, -0.72)],
          [P(-0.15, 1.1 + L, -0.6), P(-0.17, 0.92 + L, -0.66), P(-0.17, 0.78 + L, -0.86), P(-0.17, 0.62 + L, -0.76), P(-0.17, 0.56 + L, -0.7)],
          [P(0.16, 1.12, 0.6), P(0.18, 0.82, 0.72), P(0.18, 0.5, 0.82), P(0.18, 0.16, 0.66), P(0.18, 0.04, 0.6)],
          [P(-0.16, 1.12, 0.58), P(-0.18, 0.82, 0.68), P(-0.18, 0.5, 0.74), P(-0.18, 0.16, 0.56), P(-0.18, 0.04, 0.5)],
        ]
      : [
          // front right: raised
          [P(0.15, 1.08, -0.6), P(0.17, 0.86, -0.66), P(0.17, 0.66, -0.86), P(0.17, 0.5, -0.74), P(0.17, 0.44, -0.66)],
          [P(-0.15, 1.08, -0.6), P(-0.17, 0.84, -0.62), P(-0.17, 0.5, -0.62), P(-0.17, 0.16, -0.6), P(-0.17, 0.04, -0.62)],
          [P(0.16, 1.12, 0.6), P(0.18, 0.82, 0.72), P(0.18, 0.5, 0.78), P(0.18, 0.16, 0.66), P(0.18, 0.04, 0.68)],
          [P(-0.16, 1.12, 0.58), P(-0.18, 0.82, 0.66), P(-0.18, 0.5, 0.64), P(-0.18, 0.16, 0.5), P(-0.18, 0.04, 0.5)],
        ];
  for (const l of legs) {
    s.loft(l, [[0.1, 0.12], [0.075, 0.085], [0.045, 0.05], [0.038, 0.045], [0.048, 0.05]], { front: V(0, 0, -1), seg: s.hi ? 9 : 5, sub: s.hi ? 2 : 1 });
  }
}

/** Seated rider in cuirass and cloak, right arm extended. `seat` = saddle point. */
function rider(s: Sculpt, seat: THREE.Vector3) {
  const P = (x: number, y: number, z: number) => V(seat.x + x, seat.y + y, seat.z + z);
  for (const sx of [-1, 1]) {
    const hip = P(0.1 * sx, 0.06, 0);
    const knee = P(0.3 * sx, -0.22, -0.24);
    const ankle = P(0.31 * sx, -0.64, -0.1);
    leg(s, hip, knee, ankle, V(0.1 * sx, -0.2, -1));
  }
  // torso: the cuirass a seat-height above the saddle
  cuirassTorso(s, seat.y - 0.88, { sway: 0, dz: seat.z });
  // pteruges over the thighs and the cloak flowing back over the rump
  const y0 = seat.y - 0.88;
  s.tube(linspace(0, Math.PI * 2, s.hi ? 28 : 10).map((a) => V(seat.x + Math.sin(a) * 0.162 + 0.006, y0 + 1.05, seat.z + Math.cos(a) * 0.118)), 0.016, 6);
  s.tube([P(-0.15, 0.62, 0.06), P(-0.05, 0.45, 0.28), P(0.0, 0.2, 0.42), P(0.05, -0.1, 0.48)], (i) => 0.06 + i * 0.012, 7);
  for (const sx of [-1, 1]) s.blob(P(sx * 0.19, 0.57, 0.008), 0.068, 0.06, 0.07);
  // right arm extended forward (the gesture of clementia), left holding the reins
  arm(s, P(0.2, 0.57, 0), P(0.36, 0.55, -0.24), P(0.43, 0.62, -0.48));
  hand(s, P(0.43, 0.62, -0.48), V(0.2, 0.25, -1), V(0, 0.3, -1), true);
  arm(s, P(-0.2, 0.57, 0), P(-0.24, 0.32, -0.1), P(-0.1, 0.25, -0.36));
  hand(s, P(-0.1, 0.25, -0.36), V(0.4, 0, -1), V(0, 1, 0));
  head(s, P(0, 0.65, 0.02), { turn: 0.2 });
}

/** Emperor on horseback (Equus Traiani). */
export function equestrian(b: MeshBuilder, at: THREE.Matrix4, opts: StatueOptions & { pedestal?: number } = {}) {
  const s = new Sculpt((opts.detail ?? 'high') === 'high');
  const y0 = opts.plinth === false ? 0 : plinth(s, 0.9, 2.6, 0.12);
  horse(s, V(0, y0, 0));
  // saddle cloth
  s.loft([V(0, y0 + 1.5, -0.3), V(0, y0 + 1.53, 0.0), V(0, y0 + 1.5, 0.25)], [[0.3, 0.05], [0.31, 0.05], [0.29, 0.05]], { front: V(0, 1, 0), seg: s.hi ? 12 : 6, sub: 1 });
  rider(s, V(0, y0 + 1.58, -0.05));
  s.emit(b, opts.material ?? 'gilded_bronze', at, opts.scale ?? 1);
}

/** Enthroned deity with sceptre, a small Victory on the left palm. */
export function seatedDeity(b: MeshBuilder, at: THREE.Matrix4, opts: StatueOptions & { throneMaterial?: MaterialId } = {}) {
  const s = new Sculpt((opts.detail ?? 'high') === 'high');
  const t = new Sculpt(s.hi);
  const y0 = opts.plinth === false ? 0 : plinth(t, 1.1, 1.0, 0.18);
  const Y = (y: number) => y + y0;
  // Throne: seat block, high back, arm rests on lion-legged supports, footstool.
  t.box(V(0, Y(0.25), 0.05), 0.82, 0.5, 0.7);
  t.box(V(0, Y(0.95), 0.38), 0.82, 1.4, 0.1);
  t.box(V(0, Y(1.66), 0.38), 0.9, 0.08, 0.14);
  for (const sx of [-1, 1]) {
    t.box(V(0.38 * sx, Y(0.7), 0.05), 0.08, 0.06, 0.66);
    t.box(V(0.38 * sx, Y(0.6), -0.26), 0.08, 0.2, 0.08);
  }
  t.box(V(0, Y(0.05), -0.4), 0.6, 0.1, 0.3);
  // Legs under the himation: thighs along the seat, shins down to the footstool.
  for (const sx of [-1, 1]) {
    const hip = V(0.11 * sx, Y(0.6), 0.12);
    const knee = V(0.13 * sx, Y(0.62), -0.34);
    const ankle = V(0.14 * sx, Y(0.17), -0.38 - (sx > 0 ? 0 : 0.06));
    leg(s, hip, knee, ankle, V(0.05 * sx, 0, -1), false);
  }
  // Himation: over the lap and down to the ankles, deep folds between the knees.
  s.loft([V(0, Y(0.66), 0.14), V(0, Y(0.68), -0.12), V(0, Y(0.66), -0.36), V(0, Y(0.42), -0.43), V(0, Y(0.18), -0.45)], [[0.25, 0.06], [0.26, 0.07], [0.26, 0.08], [0.27, 0.07], [0.28, 0.06]], { front: V(0, 1, -0.4), seg: s.hi ? 18 : 8, shape: (th, u) => 1 + (s.hi ? 0.1 * Math.sin(th * 7 + u * 3) * u : 0) });
  // Bare torso (heroic nudity), seated.
  cuirassTorso(s, y0 - 0.25, { bare: true, sway: 0, dz: 0.06 });
  for (const sx of [-1, 1]) s.blob(V(sx * 0.19, Y(1.2), 0.008), 0.065, 0.065, 0.068);
  // Cloak over the left shoulder and down the back to the seat.
  s.loft([V(-0.17, Y(1.24), 0.02), V(-0.24, Y(1.0), 0.07), V(-0.25, Y(0.75), 0.05)], [[0.07, 0.09], [0.08, 0.1], [0.08, 0.09]], { front: V(0, 0, 1) });
  // Right arm raised holding the sceptre; left forearm forward with a small Victory.
  const shR = V(0.2, Y(1.2), 0.01);
  const elR = V(0.34, Y(1.28), -0.04);
  const wrR = V(0.37, Y(1.5), -0.08);
  arm(s, shR, elR, wrR, false);
  hand(s, wrR, V(0, 1, -0.1), V(-1, 0, 0));
  s.loft([V(0.38, Y(0.12), -0.12), V(0.38, Y(2.0), -0.07)], [[0.02, 0.02], [0.018, 0.018]], { seg: 6, sub: 1 });
  s.blob(V(0.38, Y(2.03), -0.07), 0.04, 0.06, 0.04);
  const shL = V(-0.2, Y(1.2), 0.01);
  const elL = V(-0.25, Y(0.93), 0.04);
  const wrL = V(-0.23, Y(0.9), -0.21);
  arm(s, shL, elL, wrL, false);
  hand(s, wrL, V(0, 0, -1), V(0, 1, 0), true);
  // a little winged Victory on the palm
  s.loft([V(-0.23, Y(0.93), -0.3), V(-0.23, Y(1.02), -0.3), V(-0.23, Y(1.08), -0.3)], [[0.025, 0.02], [0.02, 0.016], [0.012, 0.012]], { seg: 6, sub: 1 });
  s.blob(V(-0.23, Y(1.1), -0.3), 0.013, 0.015, 0.013);
  head(s, V(0, Y(1.28), 0.02), { beard: true, fullHair: true });
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
  s.loft([V(-1.2, y0 + 1.72, -1.5), V(1.2, y0 + 1.72, -1.5)], [[0.035, 0.035], [0.035, 0.035]], { front: V(0, 1, 0), seg: 6, sub: 1 });
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
      s.loft([V(0.72 * sx, y0 + 0.5 + Math.cos(a) * 0.48, 1.15 + Math.sin(a) * 0.48), V(0.72 * sx, y0 + 0.5 - Math.cos(a) * 0.48, 1.15 - Math.sin(a) * 0.48)], [[0.018, 0.018], [0.018, 0.018]], { front: V(1, 0, 0), seg: 4, sub: 1 });
    }
  }
  s.loft([V(-0.8, y0 + 0.5, 1.15), V(0.8, y0 + 0.5, 1.15)], [[0.03, 0.03], [0.03, 0.03]], { front: V(0, 1, 0), seg: 5, sub: 1 });
  s.loft([V(0, y0 + 0.55, 0.6), V(0, y0 + 1.5, -1.5)], [[0.035, 0.035], [0.035, 0.035]], { front: V(1, 0, 0), seg: 5, sub: 1 }); // pole
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
