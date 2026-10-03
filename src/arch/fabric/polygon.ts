/**
 * Pure 2D geometry in the ground plane ([x, z] pairs). No three.js scene objects — unit-tested.
 *
 * Orientation: a polygon with positive `signedArea` is "counter-clockwise" in the (x, z) plane and
 * the inward normal of its edge a→b is (−dz, dx).
 */
import { ShapeUtils, Vector2 } from 'three';
import type { Polygon, Vec2 } from './types';

export function signedArea(poly: Polygon): number {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Copy with positive signed area (inward normal = left normal of each edge). */
export function ensurePositive(poly: Polygon): Polygon {
  const c = poly.map((p) => [p[0], p[1]] as Vec2);
  return signedArea(c) < 0 ? c.reverse() : c;
}

export function pointInPolygon(p: Vec2, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from p to segment ab. */
export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t));
}

export function distToPolygonEdge(p: Vec2, poly: Polygon): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distToSegment(p, poly[i], poly[(i + 1) % poly.length]));
  return d;
}

/** Offset every edge inward by `d` (positive-area polygons) and re-intersect neighbours. Fine for convex / mildly concave blocks. */
export function insetPolygon(poly0: Polygon, d: number): Polygon {
  const poly = ensurePositive(poly0);
  const n = poly.length;
  const lines: { p: Vec2; dir: Vec2 }[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;
    lines.push({ p: [a[0] + nx * d, a[1] + nz * d], dir: [dx / len, dz / len] });
  }
  const out: Polygon = [];
  for (let i = 0; i < n; i++) {
    const l0 = lines[(i + n - 1) % n], l1 = lines[i];
    const hit = lineIntersect(l0.p, l0.dir, l1.p, l1.dir);
    out.push(hit ?? l1.p);
  }
  return out;
}

/** Intersection of two infinite lines (point + direction); null when parallel. */
export function lineIntersect(p: Vec2, r: Vec2, q: Vec2, s: Vec2): Vec2 | null {
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den;
  return [p[0] + r[0] * t, p[1] + r[1] * t];
}

/** Proper segment intersection test (touching endpoints count as intersecting). */
export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 !== o2 && o3 !== o4;
}

/** Smallest positive distance along a ray (origin, unit dir) to the polygon boundary, or Infinity. */
export function rayToPolygon(o: Vec2, dir: Vec2, poly: Polygon): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const sx = b[0] - a[0], sz = b[1] - a[1];
    const den = dir[0] * sz - dir[1] * sx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a[0] - o[0]) * sz - (a[1] - o[1]) * sx) / den;
    const u = ((a[0] - o[0]) * dir[1] - (a[1] - o[1]) * dir[0]) / den;
    if (t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t);
  }
  return best;
}

export function polygonBounds(poly: Polygon) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of poly) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return { minX, minZ, maxX, maxZ };
}

export function polygonCentroid(poly: Polygon): Vec2 {
  let cx = 0, cz = 0, a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f;
    cz += (p[1] + q[1]) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) return [poly[0][0], poly[0][1]];
  return [cx / (3 * a), cz / (3 * a)];
}

// ---------------------------------------------------------------- oriented boxes (lots)

/**
 * Oriented rectangle in the ground plane. `u` is the unit frontage direction, `v` the unit inward
 * (depth) direction; the rectangle spans center ± u·hu ± v·hv.
 */
export interface OBB {
  c: Vec2;
  u: Vec2;
  v: Vec2;
  hu: number;
  hv: number;
}

export function obbCorners(b: OBB): Vec2[] {
  const out: Vec2[] = [];
  for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    out.push([b.c[0] + b.u[0] * b.hu * su + b.v[0] * b.hv * sv, b.c[1] + b.u[1] * b.hu * su + b.v[1] * b.hv * sv]);
  }
  return out;
}

/** True when the two rectangles overlap by more than `margin` (touching is allowed). */
export function obbOverlap(a: OBB, b: OBB, margin = 0.01): boolean {
  const axes: Vec2[] = [a.u, a.v, b.u, b.v];
  const ca = obbCorners(a), cb = obbCorners(b);
  for (const ax of axes) {
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const p of ca) { const d = p[0] * ax[0] + p[1] * ax[1]; amin = Math.min(amin, d); amax = Math.max(amax, d); }
    for (const p of cb) { const d = p[0] * ax[0] + p[1] * ax[1]; bmin = Math.min(bmin, d); bmax = Math.max(bmax, d); }
    if (amax - margin <= bmin || bmax - margin <= amin) return false;
  }
  return true;
}

export function pointInOBB(p: Vec2, b: OBB, pad = 0): boolean {
  const dx = p[0] - b.c[0], dz = p[1] - b.c[1];
  return Math.abs(dx * b.u[0] + dz * b.u[1]) <= b.hu + pad && Math.abs(dx * b.v[0] + dz * b.v[1]) <= b.hv + pad;
}

/** Rectangle fully inside the polygon (corners inside and no edge crossings). */
export function polygonContainsOBB(poly: Polygon, b: OBB, eps = 0.02): boolean {
  const shrunk: OBB = { ...b, hu: Math.max(0, b.hu - eps), hv: Math.max(0, b.hv - eps) };
  const cs = obbCorners(shrunk);
  for (const p of cs) if (!pointInPolygon(p, poly)) return false;
  for (let i = 0; i < 4; i++) {
    const a = cs[i], c = cs[(i + 1) % 4];
    for (let j = 0; j < poly.length; j++) if (segmentsIntersect(a, c, poly[j], poly[(j + 1) % poly.length])) return false;
  }
  return true;
}

/** Does the rectangle intersect the polygon at all (any corner inside, polygon vertex inside, or edges cross)? */
export function obbIntersectsPolygon(b: OBB, poly: Polygon): boolean {
  const cs = obbCorners(b);
  for (const p of cs) if (pointInPolygon(p, poly)) return true;
  for (const p of poly) if (pointInOBB(p, b)) return true;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < poly.length; j++) if (segmentsIntersect(cs[i], cs[(i + 1) % 4], poly[j], poly[(j + 1) % poly.length])) return true;
  return false;
}

/** Resample a polyline at roughly `step` spacing (keeps the original vertices). */
export function resamplePolyline(pts: Vec2[], step: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  return out;
}

export function polylineLength(pts: Vec2[]): number {
  let l = 0;
  for (let i = 0; i < pts.length - 1; i++) l += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return l;
}

// ---------------------------------------------------------------- clipping / difference

/** The part of `subject` on the left of the directed line a→b (`keepLeft`), or on its right. */
export function clipHalfPlane(subject: Polygon, a: Vec2, b: Vec2, keepLeft = true): Polygon {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const side = (p: Vec2) => (dx * (p[1] - a[1]) - dz * (p[0] - a[0])) * (keepLeft ? 1 : -1);
  const out: Polygon = [];
  for (let i = 0; i < subject.length; i++) {
    const cur = subject[i], prev = subject[(i + subject.length - 1) % subject.length];
    const sc = side(cur), sp = side(prev);
    if (sc >= 0) {
      if (sp < 0) out.push(lerp2(prev, cur, sp / (sp - sc)));
      out.push(cur);
    } else if (sp >= 0) out.push(lerp2(prev, cur, sp / (sp - sc)));
  }
  return out;
}

function lerp2(a: Vec2, b: Vec2, t: number): Vec2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function isConvex(poly: Polygon): boolean {
  let sign = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], c = poly[(i + 2) % n];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-12) continue;
    if (sign === 0) sign = Math.sign(cr);
    else if (Math.sign(cr) !== sign) return false;
  }
  return true;
}

/** `subject` minus a convex polygon: disjoint pieces (convex when the subject is). */
export function subtractConvex(subject: Polygon, convex: Polygon): Polygon[] {
  const c = ensurePositive(convex);
  const out: Polygon[] = [];
  let rest = subject;
  for (let i = 0; i < c.length && rest.length >= 3; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    // Outside a positive convex polygon = right of one of its edges.
    const outside = clipHalfPlane(rest, a, b, false);
    if (outside.length >= 3 && Math.abs(signedArea(outside)) > 1e-7) out.push(outside);
    rest = clipHalfPlane(rest, a, b, true);
  }
  return out;
}

/** Convex pieces of a simple polygon (itself when convex, else its triangulation). */
export function convexParts(poly: Polygon): Polygon[] {
  if (isConvex(poly)) return [poly];
  const tris = ShapeUtils.triangulateShape(poly.map((p) => new Vector2(p[0], p[1])), []);
  return tris.map((t) => t.map((i) => poly[i]) as Polygon);
}

/** `subject` minus every polygon in `holes` (any simple polygons): a list of disjoint pieces. */
export function subtractPolygons(subject: Polygon, holes: Polygon[]): Polygon[] {
  let pieces: Polygon[] = [subject];
  for (const h of holes) {
    const hb = polygonBounds(h);
    for (const part of convexParts(h)) {
      const next: Polygon[] = [];
      for (const p of pieces) {
        const pb = polygonBounds(p);
        if (pb.maxX <= hb.minX || pb.minX >= hb.maxX || pb.maxZ <= hb.minZ || pb.minZ >= hb.maxZ) next.push(p);
        else next.push(...subtractConvex(p, part));
      }
      pieces = next;
    }
  }
  return pieces;
}

/** Is p inside `poly` or closer than `r` to its boundary? */
export function nearPolygon(p: Vec2, poly: Polygon, r = 0): boolean {
  return pointInPolygon(p, poly) || (r > 0 && distToPolygonEdge(p, poly) < r);
}
