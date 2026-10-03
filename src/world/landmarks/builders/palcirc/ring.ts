/**
 * Ring geometry for the Circus Maximus stands: surfaces swept round the stadium-shaped ring
 * (two straights and a semicircle) between stations, with gaps (entrance tunnels, the pulvinar and
 * the Temple of Sol, the Arch of Titus passage), plus their box colliders.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../../gfx/materialIds';
import { CIRCUS, ringPoint, ringPolyline, stations, subtractIntervals, totalStations, type Interval } from './circusLayout';

export interface RingGap {
  kind: 'tunnel' | 'temple' | 'open';
  /** Station interval at offset u. */
  at(u: number): Interval;
  /** Offsets (inclusive) whose surfaces are cut. */
  uMin: number;
  uMax: number;
}

const EPS = 1e-3;

/** Gaps that remove a surface spanning offsets [ua, ub]. */
export function cutting(gaps: RingGap[], ua: number, ub: number): RingGap[] {
  return gaps.filter((g) => ua >= g.uMin - EPS && ub <= g.uMax + EPS);
}

/** Remaining station pieces of the ring at offset u once the given gaps are cut. */
export function pieces(gaps: RingGap[], u: number): Interval[] {
  return subtractIntervals(0, totalStations(), gaps.map((g) => g.at(u)));
}

export type Hint = 'up' | 'down' | 'in' | 'out' | 'auto';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();

/**
 * A strip between two ring edges A (offset ua, height ya) and B (ub, yb), over matched station
 * pieces (`pa[k]` on edge A corresponds to `pb[k]` on edge B; their ends may differ slightly where a
 * gap's cut is slanted). `hint` orients the faces.
 */
export function ringStrip(b: MeshBuilder, mat: MaterialId, ua: number, ya: number, ub: number, yb: number, pa: Interval[], pb: Interval[], hint: Hint, dPhi = Math.PI / 48) {
  const pos: number[] = [];
  const nor: number[] = [];
  const P = (s: number, u: number, y: number, out: THREE.Vector3) => {
    const p = ringPoint(s, u);
    return out.set(p.x, y, p.z);
  };
  const hintAt = (s: number, out: THREE.Vector3) => {
    const p = ringPoint(s, 0);
    if (hint === 'up') return out.set(0, 1, 0);
    if (hint === 'down') return out.set(0, -1, 0);
    if (hint === 'in') return out.set(-p.nx, 0, -p.nz);
    if (hint === 'out') return out.set(p.nx, 0, p.nz);
    return out.set(0, 0, 0);
  };
  const tri = (A: THREE.Vector3, B: THREE.Vector3, C: THREE.Vector3, want: THREE.Vector3) => {
    const n = _n.subVectors(B, A).cross(_c.subVectors(C, A));
    if (n.lengthSq() < 1e-12) return;
    n.normalize();
    let a = A, bb = B, c = C;
    if (want.lengthSq() > 0 && n.dot(want) < 0) {
      bb = C;
      c = B;
      n.negate();
    }
    const nn = want.lengthSq() > 0 && hint !== 'auto' && Math.abs(n.dot(want)) > 0.2 && hint !== 'up' && hint !== 'down' ? want : n;
    for (const v of [a, bb, c]) {
      pos.push(v.x, v.y, v.z);
      nor.push(nn.x, nn.y, nn.z);
    }
  };
  const want = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < pa.length; k++) {
    const [a0, a1] = pa[k];
    const [b0, b1] = pb[k] ?? pa[k];
    const c0 = Math.max(a0, b0);
    const c1 = Math.min(a1, b1);
    if (c1 - c0 < EPS) continue;
    const ss = ringPolyline(c0, c1, (ua + ub) / 2, dPhi).map((v) => v.s);
    for (let i = 0; i < ss.length - 1; i++) {
      const s0 = ss[i], s1 = ss[i + 1];
      const A0 = P(s0, ua, ya, new THREE.Vector3());
      const A1 = P(s1, ua, ya, new THREE.Vector3());
      const B0 = P(s0, ub, yb, new THREE.Vector3());
      const B1 = P(s1, ub, yb, new THREE.Vector3());
      hintAt((s0 + s1) / 2, want);
      if (hint === 'auto') want.copy(up);
      tri(A0, A1, B1, want);
      tri(A0, B1, B0, want);
    }
    // Slanted ends: fill the sliver between the common core and each edge's own end.
    hintAt(c0, want);
    if (hint === 'auto') want.copy(up);
    if (a0 < c0 - EPS) tri(P(a0, ua, ya, _a), P(c0, ua, ya, _b), P(c0, ub, yb, _c.clone()), want);
    if (b0 < c0 - EPS) tri(P(b0, ub, yb, _a), P(c0, ua, ya, _b), P(c0, ub, yb, _c.clone()), want);
    hintAt(c1, want);
    if (hint === 'auto') want.copy(up);
    if (a1 > c1 + EPS) tri(P(c1, ua, ya, _a), P(a1, ua, ya, _b), P(c1, ub, yb, _c.clone()), want);
    if (b1 > c1 + EPS) tri(P(c1, ua, ya, _a), P(b1, ub, yb, _b), P(c1, ub, yb, _c.clone()), want);
  }
  if (!pos.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  b.add(g, mat);
}

/** Convenience: a horizontal tread from ua to ub at height y, cut by the gaps that span it. */
export function tread(b: MeshBuilder, mat: MaterialId, gaps: RingGap[], ua: number, ub: number, y: number, hint: Hint = 'up') {
  const g = cutting(gaps, ua, ub);
  ringStrip(b, mat, ua, y, ub, y, pieces(g, ua), pieces(g, ub), hint);
}

/** A vertical face at offset u from y0 to y1 facing the track ('in') or away ('out'). */
export function riser(b: MeshBuilder, mat: MaterialId, gaps: RingGap[], u: number, y0: number, y1: number, hint: Hint = 'in') {
  const g = cutting(gaps, u, u);
  const p = pieces(g, u);
  ringStrip(b, mat, u, y0, u, y1, p, p, hint);
}

/**
 * Box colliders for a solid band [u0, u1] from `bottom` up to `top`, along the ring pieces, with the
 * bottom raised to `lift.y` inside the lift intervals (tunnels under the stands).
 */
export function bandColliders(b: MeshBuilder, gaps: RingGap[], u0: number, u1: number, top: number, bottom: number, lifts: { at: Interval; y: number }[] = [], dPhi = Math.PI / 36) {
  const um = (u0 + u1) / 2;
  const cut = cutting(gaps, u0, u1);
  const ps = pieces(cut, um);
  const q = new THREE.Quaternion();
  const ax = new THREE.Vector3(0, 1, 0);
  const box = (s0: number, s1: number, y0: number) => {
    if (top - y0 < 0.02 || s1 - s0 < 0.02) return;
    const a = ringPoint(s0, um);
    const c = ringPoint(s1, um);
    const dx = c.x - a.x;
    const dz = c.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.02) return;
    // Local box x along the chord, z across the band.
    q.setFromAxisAngle(ax, Math.atan2(-dz, dx));
    b.collider({
      kind: 'box',
      center: new THREE.Vector3((a.x + c.x) / 2, (y0 + top) / 2, (a.z + c.z) / 2),
      half: new THREE.Vector3(len / 2 + 0.04, (top - y0) / 2, (u1 - u0) / 2 + 0.01),
      rotation: q.clone(),
    });
  };
  for (const [p0, p1] of ps) {
    // Split by lifts, then by the curve sampling.
    const cuts = new Set<number>([p0, p1]);
    for (const l of lifts) {
      if (l.at[1] > p0 && l.at[0] < p1) {
        cuts.add(Math.max(p0, l.at[0]));
        cuts.add(Math.min(p1, l.at[1]));
      }
    }
    const st = stations();
    if (p0 < st.curveStart && p1 > st.curveStart) cuts.add(st.curveStart);
    if (p0 < st.curveEnd && p1 > st.curveEnd) cuts.add(st.curveEnd);
    const sorted = [...cuts].sort((x, y) => x - y);
    for (let i = 0; i < sorted.length - 1; i++) {
      const s0 = sorted[i], s1 = sorted[i + 1];
      const mid = (s0 + s1) / 2;
      const lift = lifts.find((l) => mid > l.at[0] && mid < l.at[1]);
      const y0 = lift ? Math.max(bottom, lift.y) : bottom;
      const onCurve = mid > st.curveStart && mid < st.curveEnd;
      if (!onCurve) box(s0, s1, y0);
      else {
        const n = Math.max(1, Math.ceil((s1 - s0) / (dPhi * CIRCUS.track)));
        for (let k = 0; k < n; k++) box(s0 + ((s1 - s0) * k) / n, s0 + ((s1 - s0) * (k + 1)) / n, y0);
      }
    }
  }
}

/**
 * Closing face of the stands at a gap edge: the section outline between uMin and uMax (closed down
 * to `floor`) mapped onto the cut, facing into the gap.
 */
export function cutFace(b: MeshBuilder, mat: MaterialId, outline: [number, number][], gap: RingGap, edge: 0 | 1, floor = 0) {
  const pts = outline.filter(([u]) => u >= gap.uMin - EPS && u <= gap.uMax + EPS);
  if (pts.length < 2) return;
  const poly: [number, number][] = [[pts[0][0], floor], ...pts, [pts[pts.length - 1][0], floor]];
  const contour = poly.map(([u, y]) => new THREE.Vector2(u, y));
  if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const map = (v: THREE.Vector2) => {
    const s = gap.at(v.x)[edge];
    const p = ringPoint(s, v.x);
    return new THREE.Vector3(p.x, v.y, p.z);
  };
  // Into the gap: +tangent at the start edge, −tangent at the end edge.
  const sMid = gap.at((gap.uMin + gap.uMax) / 2)[edge];
  const t = ringPoint(sMid, 0);
  const want = new THREE.Vector3(t.tx, 0, t.tz).multiplyScalar(edge === 0 ? 1 : -1);
  const pos: number[] = [];
  for (const [i, j, k] of tris) {
    const A = map(contour[i]);
    let B = map(contour[j]);
    let C = map(contour[k]);
    const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A));
    if (n.dot(want) < 0) [B, C] = [C, B];
    pos.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  b.add(g, mat);
}

/** Frame (matrix) at a ring station: origin on the ring at offset u and height y, local +z outward, +x along the tangent. */
export function ringFrame(s: number, u: number, y = 0): THREE.Matrix4 {
  const p = ringPoint(s, u);
  // Right-handed with +z outward: x = −tangent (since (−t) × up = n).
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(-p.tx, 0, -p.tz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(p.nx, 0, p.nz));
  m.setPosition(p.x, y, p.z);
  return m;
}
