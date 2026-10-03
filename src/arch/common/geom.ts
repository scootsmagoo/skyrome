/**
 * Geometry toolkit for procedural architecture.
 *
 * - `ProfileBuilder` draws classical moulding profiles (fillet, torus, scotia, ovolo, cavetto,
 *   cyma recta/reversa) as a 2D polyline in (x = outward, y = up), from bottom-inside to top.
 * - `lathe()` spins a profile around the Y axis (column bases, shafts, capitals, domes) with
 *   world-scale cylindrical UVs; optional angular range for engaged (half) columns.
 * - `sweep()` extrudes a profile along a 3D polyline with mitred corners (entablatures, podium
 *   mouldings, raking cornices, arch rings).
 * - Small transform helpers (`T`, `TRS`) used everywhere.
 *
 * All generated geometry is non-indexed with explicit normals, so MeshBuilder keeps the normals
 * and only (re)computes UVs.
 */
import * as THREE from 'three';
import { UV_METERS } from '../../gfx/textures/catalog';

export type V2 = [number, number];

export interface Profile {
  pts: V2[];
  /** smooth[i]: vertex i shares one normal between its two segments (curves); false = crease. */
  smooth: boolean[];
}

// ---------------------------------------------------------------- transforms

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Translation matrix. */
export function T(x: number, y: number, z: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(x, y, z);
}

/** Translation + Euler rotation (radians, XYZ order) + scale. */
export function TRS(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

/** parent × child (apply `child` first). */
export function mul(parent: THREE.Matrix4 | undefined, child: THREE.Matrix4): THREE.Matrix4 {
  return parent ? parent.clone().multiply(child) : child.clone();
}

// ---------------------------------------------------------------- profiles

export class ProfileBuilder {
  readonly pts: V2[] = [];
  readonly smooth: boolean[] = [];

  constructor(x: number, y: number) {
    this.pts.push([x, y]);
    this.smooth.push(false);
  }

  get x() {
    return this.pts[this.pts.length - 1][0];
  }
  get y() {
    return this.pts[this.pts.length - 1][1];
  }

  /** Straight segment to an absolute point (creased corner). */
  to(x: number, y: number): this {
    this.pts.push([x, y]);
    this.smooth.push(false);
    return this;
  }
  up(h: number) {
    return this.to(this.x, this.y + h);
  }
  out(w: number) {
    return this.to(this.x + w, this.y);
  }
  in(w: number) {
    return this.to(this.x - w, this.y);
  }
  /** Straight relative segment. */
  by(dx: number, dy: number) {
    return this.to(this.x + dx, this.y + dy);
  }

  /** Elliptical arc around (cx, cy) from angle a0 to a1 (radians, 0 = +x, CCW), n segments. */
  arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): this {
    // The first point coincides with the current pen position; mark it smooth only if tangent-continuous.
    for (let i = 1; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      this.pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
      this.smooth.push(i < n);
    }
    return this;
  }

  /** Half-round bulging outward by `w` over height `h`. */
  torus(h: number, w = h / 2, n = 8): this {
    return this.arc(this.x, this.y + h / 2, w, h / 2, -Math.PI / 2, Math.PI / 2, n);
  }
  /** Half-round hollow cut inward by `d` over height `h`. */
  scotia(h: number, d = h / 2, n = 8): this {
    return this.arc(this.x, this.y + h / 2, d, h / 2, -Math.PI / 2, -Math.PI * 1.5, n);
  }
  /** Convex quarter-round projecting `w` over height `h` (echinus, bed mouldings). */
  ovolo(w: number, h: number, n = 6): this {
    return this.arc(this.x, this.y + h, w, h, -Math.PI / 2, 0, n);
  }
  /** Concave quarter-round projecting `w` over height `h`. */
  cavetto(w: number, h: number, n = 6): this {
    return this.arc(this.x + w, this.y, w, h, Math.PI, Math.PI / 2, n);
  }
  /** Ogee, convex below / concave above, ending horizontal (crowning sima). */
  cymaRecta(w: number, h: number, n = 4): this {
    this.arc(this.x, this.y + h / 2, w / 2, h / 2, -Math.PI / 2, 0, n);
    this.smooth[this.smooth.length - 1] = true;
    return this.arc(this.x + w / 2, this.y, w / 2, h / 2, Math.PI, Math.PI / 2, n);
  }
  /** Ogee, concave below / convex above, ending vertical (bed moulding, base of podium). */
  cymaReversa(w: number, h: number, n = 4): this {
    this.arc(this.x + w / 2, this.y, w / 2, h / 2, Math.PI, Math.PI / 2, n);
    this.smooth[this.smooth.length - 1] = true;
    return this.arc(this.x, this.y + h / 2, w / 2, h / 2, -Math.PI / 2, 0, n);
  }

  build(): Profile {
    return { pts: this.pts.map((p) => [p[0], p[1]] as V2), smooth: [...this.smooth] };
  }
}

/** Scale/offset a profile. */
export function transformProfile(p: Profile, sx: number, sy: number, dx = 0, dy = 0): Profile {
  return { pts: p.pts.map(([x, y]) => [x * sx + dx, y * sy + dy] as V2), smooth: [...p.smooth] };
}

/** Per-segment 2D outward normals (rotate tangent clockwise: going up → +x). */
function segmentNormals(pts: V2[]): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0];
    const dy = pts[i + 1][1] - pts[i][1];
    const l = Math.hypot(dx, dy) || 1;
    out.push([dy / l, -dx / l]);
  }
  return out;
}

/** For each segment, the normals at its start and end vertex (respecting smooth flags). */
function profileVertexNormals(p: Profile): { a: V2; b: V2 }[] {
  const sn = segmentNormals(p.pts);
  const avg = (i: number): V2 => {
    const a = sn[i - 1];
    const b = sn[i];
    const x = a[0] + b[0];
    const y = a[1] + b[1];
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  return sn.map((n, i) => ({
    a: i > 0 && p.smooth[i] ? avg(i) : n,
    b: i + 1 < p.pts.length - 1 && p.smooth[i + 1] ? avg(i + 1) : n,
  }));
}

// ---------------------------------------------------------------- lathe

export interface LatheOptions {
  segments?: number;
  /** Angular range in radians (θ measured from +z towards +x). Default full circle. */
  theta0?: number;
  theta1?: number;
  /** Close the top/bottom with discs where the profile ends off-axis. */
  capTop?: boolean;
  capBottom?: boolean;
}

/**
 * Revolve a profile (x = radius, y = height) around the Y axis. Vertex at angle θ is
 * (r sin θ, y, r cos θ). UVs: u = arc length / UV_METERS, v = profile length / UV_METERS.
 */
export function lathe(profile: Profile, opts: LatheOptions = {}): THREE.BufferGeometry {
  const seg = opts.segments ?? 24;
  const t0 = opts.theta0 ?? 0;
  const t1 = opts.theta1 ?? Math.PI * 2;
  const pts = profile.pts;
  const vn = profileVertexNormals(profile);
  // cumulative profile length for v
  const plen = [0];
  for (let i = 1; i < pts.length; i++) plen.push(plen[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const push = (r: number, y: number, th: number, n: V2, v: number) => {
    const s = Math.sin(th);
    const c = Math.cos(th);
    pos.push(r * s, y, r * c);
    nor.push(n[0] * s, n[1], n[0] * c);
    uv.push((th * Math.max(r, 0.05)) / UV_METERS, v / UV_METERS);
  };
  for (let k = 0; k < pts.length - 1; k++) {
    const [ra, ya] = pts[k];
    const [rb, yb] = pts[k + 1];
    if (ra < 1e-6 && rb < 1e-6) continue;
    const { a: na, b: nb } = vn[k];
    for (let i = 0; i < seg; i++) {
      const th0 = t0 + ((t1 - t0) * i) / seg;
      const th1 = t0 + ((t1 - t0) * (i + 1)) / seg;
      // quad A(th0,k) B(th0,k+1) C(th1,k+1) D(th1,k), wound so faces point outward
      push(ra, ya, th0, na, plen[k]);
      push(rb, yb, th1, nb, plen[k + 1]);
      push(rb, yb, th0, nb, plen[k + 1]);
      push(ra, ya, th0, na, plen[k]);
      push(ra, ya, th1, na, plen[k]);
      push(rb, yb, th1, nb, plen[k + 1]);
    }
  }
  const disc = (r: number, y: number, up: boolean) => {
    if (r < 1e-6) return;
    for (let i = 0; i < seg; i++) {
      const th0 = t0 + ((t1 - t0) * i) / seg;
      const th1 = t0 + ((t1 - t0) * (i + 1)) / seg;
      const a: [number, number, number] = [r * Math.sin(th0), y, r * Math.cos(th0)];
      const b: [number, number, number] = [r * Math.sin(th1), y, r * Math.cos(th1)];
      const tri = up ? [[0, y, 0], a, b] : [[0, y, 0], b, a];
      for (const p of tri) {
        pos.push(p[0], p[1], p[2]);
        nor.push(0, up ? 1 : -1, 0);
        uv.push(p[0] / UV_METERS, p[2] / UV_METERS);
      }
    }
  };
  if (opts.capBottom) disc(pts[0][0], pts[0][1], false);
  if (opts.capTop) disc(pts[pts.length - 1][0], pts[pts.length - 1][1], true);
  return makeGeometry(pos, nor, uv);
}

// ---------------------------------------------------------------- sweep

export interface SweepOptions {
  /** Path is a closed loop. */
  closed?: boolean;
  /**
   * Constant outward direction for the profile's +x (e.g. a raking cornice in a facade plane).
   * Default: horizontal right-hand normal of each segment, (dz, 0, −dx).
   */
  outward?: THREE.Vector3;
  /** Close the profile with a straight back face (last point → first point). */
  back?: boolean;
  /** Cap the two ends of an open path. */
  caps?: boolean;
}

interface Frame {
  t: THREE.Vector3;
  n: THREE.Vector3;
  u: THREE.Vector3;
}

function miterVec(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  const m = a.clone().add(b);
  if (m.lengthSq() < 1e-10) return a.clone();
  m.normalize();
  const c = m.dot(a);
  return m.divideScalar(Math.max(0.2, c));
}

/**
 * Extrude `profile` (x = outward, y = "up" of the frame) along `path`. UVs: u = distance along
 * the path, v = distance along the profile (world scale, see UV_METERS). For a horizontal path the
 * frame is: outward = right-hand normal (dz, 0, −dx), up = +y, so walking a rectangle
 * (−x,−z) → (+x,−z) → (+x,+z) → (−x,+z) puts the profile on the OUTSIDE.
 */
export function sweep(profile: Profile, path: THREE.Vector3[], opts: SweepOptions = {}): THREE.BufferGeometry {
  const closed = !!opts.closed;
  const prof: Profile = opts.back ? { pts: [...profile.pts, profile.pts[0]], smooth: [...profile.smooth, false] } : profile;
  const pts = prof.pts;
  const vn = profileVertexNormals(prof);
  const nSeg = closed ? path.length : path.length - 1;
  const frames: Frame[] = [];
  for (let i = 0; i < nSeg; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    const t = b.clone().sub(a).normalize();
    const n = opts.outward ? opts.outward.clone().normalize() : new THREE.Vector3(t.z, 0, -t.x).normalize();
    const u = new THREE.Vector3().crossVectors(t, n).normalize();
    frames.push({ t, n, u });
  }
  // Mitred offset axes at every path vertex.
  const axes: { n: THREE.Vector3; u: THREE.Vector3 }[] = [];
  for (let i = 0; i < path.length; i++) {
    const prev = closed ? frames[(i - 1 + nSeg) % nSeg] : frames[i - 1];
    const next = closed ? frames[i % nSeg] : frames[i];
    if (prev && next) axes.push({ n: miterVec(prev.n, next.n), u: miterVec(prev.u, next.u) });
    else {
      const f = (prev ?? next)!;
      axes.push({ n: f.n.clone(), u: f.u.clone() });
    }
  }
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const P = (i: number, k: number) => {
    const ax = axes[i % path.length];
    return path[i % path.length].clone().addScaledVector(ax.n, pts[k][0]).addScaledVector(ax.u, pts[k][1]);
  };
  // v: cumulative profile length (so 'keep' UVs tile at world scale across the profile too)
  const plen = [0];
  for (let k = 1; k < pts.length; k++) plen.push(plen[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  let along = 0;
  for (let s = 0; s < nSeg; s++) {
    const f = frames[s];
    const len = path[(s + 1) % path.length].distanceTo(path[s]);
    for (let k = 0; k < pts.length - 1; k++) {
      const { a: na, b: nb } = vn[k];
      const NA = f.n.clone().multiplyScalar(na[0]).addScaledVector(f.u, na[1]);
      const NB = f.n.clone().multiplyScalar(nb[0]).addScaledVector(f.u, nb[1]);
      const A = P(s, k);
      const B = P(s, k + 1);
      const C = P(s + 1, k + 1);
      const D = P(s + 1, k);
      const u0 = along / UV_METERS;
      const u1 = (along + len) / UV_METERS;
      const v0 = plen[k] / UV_METERS;
      const v1 = plen[k + 1] / UV_METERS;
      const quad: [THREE.Vector3, THREE.Vector3, number, number][] = [
        [A, NA, u0, v0],
        [B, NB, u0, v1],
        [C, NB, u1, v1],
        [A, NA, u0, v0],
        [C, NB, u1, v1],
        [D, NA, u1, v0],
      ];
      for (const [p, n, u, v] of quad) {
        pos.push(p.x, p.y, p.z);
        nor.push(n.x, n.y, n.z);
        uv.push(u, v);
      }
    }
    along += len;
  }
  if (opts.caps && !closed) {
    // A CCW contour in profile space faces n × u = +t, so the start cap is reversed.
    const cap = (i: number, end: boolean) => {
      const contour = pts.map((p) => new THREE.Vector2(p[0], p[1]));
      if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      const f = frames[Math.min(i, nSeg - 1)];
      const nrm = f.t.clone().multiplyScalar(end ? 1 : -1);
      const ax = axes[i];
      for (const tri of tris) {
        const order = end ? tri : [tri[0], tri[2], tri[1]];
        for (const k of order) {
          const c = contour[k];
          const p = path[i].clone().addScaledVector(ax.n, c.x).addScaledVector(ax.u, c.y);
          pos.push(p.x, p.y, p.z);
          nor.push(nrm.x, nrm.y, nrm.z);
          uv.push(0, 0);
        }
      }
    };
    cap(0, false);
    cap(path.length - 1, true);
  }
  return makeGeometry(pos, nor, uv);
}

// ---------------------------------------------------------------- misc builders

export function makeGeometry(pos: number[], nor: number[], uv?: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Sample n+1 points on a circular arc in the XY plane (for arch intrados etc.). */
export function arcPoints2(cx: number, cy: number, r: number, a0: number, a1: number, n: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/**
 * A flat polygon (XY, facing +Z) extruded by `depth` along −Z, i.e. occupying z ∈ [−depth, 0]
 * (plus the bevel round the front). Holes allowed. Use for tympana, spandrel reliefs, frames.
 */
export function extrudePolygon(outer: V2[], depth: number, holes: V2[][] = [], bevel = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  // A bevel rounds the front edges so low reliefs catch the light (a flat face parallel to the
  // wall would shade exactly like the wall and vanish).
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-3, depth - bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 3,
    curveSegments: 12,
  });
  if (bevel > 0) g.translate(0, 0, bevel);
  g.translate(0, 0, -depth);
  const ng = g.index ? g.toNonIndexed() : g;
  ng.computeVertexNormals();
  return ng;
}

/** Cylinder (or cone frustum) between two points. */
export function cylinderBetween(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, seg = 8, capped = true): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(rb, ra, len, seg, 1, !capped);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyQuaternion(q);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/** Points of an ellipse (rx along x, rz along z) at parameter t: (rx cos t, 0, rz sin t). */
export function ellipsePoint(rx: number, rz: number, t: number, y = 0): THREE.Vector3 {
  return new THREE.Vector3(rx * Math.cos(t), y, rz * Math.sin(t));
}

// ---------------------------------------------------------------- parametric grids

/**
 * Surface from a position function P(a, b) sampled on the grids `as` × `bs`. Normals come from
 * one-sided finite differences taken towards the inside of each quad, so kinks in P (flute
 * edges, leaf boundaries) stay crisp while smooth regions shade smoothly. The face normal is
 * ∂P/∂a × ∂P/∂b (for P = (r sin a, b, r cos a) that points outward). `flip` reverses it.
 */
export function gridSurface(
  as: readonly number[],
  bs: readonly number[],
  P: (a: number, b: number, out: THREE.Vector3) => THREE.Vector3,
  opts: { flip?: boolean; uv?: (a: number, b: number) => V2 } = {},
): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const p0 = new THREE.Vector3();
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const da = new THREE.Vector3();
  const db = new THREE.Vector3();
  const n = new THREE.Vector3();
  const epsA = Math.abs(as[as.length - 1] - as[0]) * 1e-4 || 1e-4;
  const epsB = Math.abs(bs[bs.length - 1] - bs[0]) * 1e-4 || 1e-4;
  // Normal at (a, b): one-sided differences taken towards the quad interior (ta, tb are the
  // neighbouring samples), each oriented along the sample order so the result matches the winding.
  const normalAt = (a: number, b: number, ta: number, tb: number, oa: number, ob: number) => {
    P(a, b, p0);
    P(a + Math.sign(ta - a) * epsA, b, pa);
    P(a, b + Math.sign(tb - b) * epsB, pb);
    da.subVectors(pa, p0).multiplyScalar(oa);
    db.subVectors(pb, p0).multiplyScalar(ob);
    n.crossVectors(da, db);
    if (opts.flip) n.negate();
    const l = n.length();
    if (l < 1e-12) n.set(0, 1, 0);
    else n.divideScalar(l);
    return n;
  };
  const emit = (a: number, b: number, ta: number, tb: number, oa: number, ob: number) => {
    P(a, b, p0);
    pos.push(p0.x, p0.y, p0.z);
    const nn = normalAt(a, b, ta, tb, oa, ob);
    nor.push(nn.x, nn.y, nn.z);
    const t = opts.uv ? opts.uv(a, b) : ([a / UV_METERS, b / UV_METERS] as V2);
    uv.push(t[0], t[1]);
  };
  for (let j = 0; j < bs.length - 1; j++) {
    const b0 = bs[j];
    const b1 = bs[j + 1];
    for (let i = 0; i < as.length - 1; i++) {
      const a0 = as[i];
      const a1 = as[i + 1];
      // A(a0,b0) B(a0,b1) C(a1,b1) D(a1,b0); the face normal is (towards a1) × (towards b1),
      // which matches triangles (A,D,C) and (A,C,B).
      const tri = (pa0: number, pb0: number) => {
        const nearA = pa0 === a0;
        const nearB = pb0 === b0;
        emit(pa0, pb0, nearA ? a1 : a0, nearB ? b1 : b0, nearA ? 1 : -1, nearB ? 1 : -1);
      };
      if (!opts.flip) {
        tri(a0, b0), tri(a1, b0), tri(a1, b1);
        tri(a0, b0), tri(a1, b1), tri(a0, b1);
      } else {
        tri(a0, b0), tri(a0, b1), tri(a1, b1);
        tri(a0, b0), tri(a1, b1), tri(a1, b0);
      }
    }
  }
  return makeGeometry(pos, nor, uv);
}

/** n+1 evenly spaced values from a to b. */
export function linspace(a: number, b: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
  return out;
}

/**
 * Tube along a 3D polyline (volutes, tendrils, garlands). Radius may vary per point.
 * Uses parallel-transport frames so the tube doesn't twist.
 */
export function tube(path: THREE.Vector3[], radius: number | ((i: number) => number), radial = 6, capped = true): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const rad = typeof radius === 'number' ? () => radius : radius;
  const N = path.length;
  const tangents = path.map((p, i) => {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(N - 1, i + 1)];
    return b.clone().sub(a).normalize();
  });
  // initial normal: any vector perpendicular to the first tangent
  const t0 = tangents[0];
  let nrm = Math.abs(t0.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  nrm = nrm.sub(t0.clone().multiplyScalar(nrm.dot(t0))).normalize();
  const normals: THREE.Vector3[] = [nrm.clone()];
  for (let i = 1; i < N; i++) {
    const prev = normals[i - 1].clone();
    const t = tangents[i];
    prev.sub(t.clone().multiplyScalar(prev.dot(t))).normalize();
    normals.push(prev);
  }
  const ring = (i: number, k: number) => {
    const a = (k / radial) * Math.PI * 2;
    const n = normals[i];
    const bn = new THREE.Vector3().crossVectors(tangents[i], n);
    const dir = n.clone().multiplyScalar(Math.cos(a)).addScaledVector(bn, Math.sin(a));
    return { p: path[i].clone().addScaledVector(dir, rad(i)), n: dir };
  };
  for (let i = 0; i < N - 1; i++)
    for (let k = 0; k < radial; k++) {
      const A = ring(i, k);
      const B = ring(i, k + 1);
      const C = ring(i + 1, k + 1);
      const D = ring(i + 1, k);
      for (const v of [A, B, C, A, C, D]) {
        pos.push(v.p.x, v.p.y, v.p.z);
        nor.push(v.n.x, v.n.y, v.n.z);
      }
    }
  if (capped) {
    for (const [i, s] of [
      [0, -1],
      [N - 1, 1],
    ] as const) {
      const c = path[i];
      const tn = tangents[i].clone().multiplyScalar(s);
      for (let k = 0; k < radial; k++) {
        const A = ring(i, k).p;
        const B = ring(i, k + 1).p;
        const tri = s > 0 ? [c, A, B] : [c, B, A];
        for (const p of tri) {
          pos.push(p.x, p.y, p.z);
          nor.push(tn.x, tn.y, tn.z);
        }
      }
    }
  }
  return makeGeometry(pos, nor);
}

/**
 * Offset a horizontal polyline sideways by `dist` (positive = towards the sweep's outward side,
 * the right-hand normal (dz, 0, −dx)), with mitred corners.
 */
export function offsetPath(path: THREE.Vector3[], dist: number, closed = false): THREE.Vector3[] {
  const n = path.length;
  const segN = (i: number) => {
    const a = path[i];
    const b = path[(i + 1) % n];
    const t = b.clone().sub(a).normalize();
    return new THREE.Vector3(t.z, 0, -t.x);
  };
  return path.map((p, i) => {
    const prev = i > 0 ? segN(i - 1) : closed ? segN(n - 1) : null;
    const next = i < n - 1 ? segN(i) : closed ? segN(i) : null;
    const nn = prev && next ? miterVec(prev, next) : (prev ?? next)!;
    return p.clone().addScaledVector(nn, dist);
  });
}
