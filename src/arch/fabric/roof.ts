/**
 * Low-pitched Roman tile roofs (tegulae + imbrices): hip, gable, courtyard "ring" (compluviate)
 * and lean-to (shed). Each roof plane is a thin slab (terracotta top, dark timber underside). Its
 * top is stepped into courses of tegulae (~0.5 m, each lower edge standing a few cm proud of the
 * course below), with rows of imbrex ridges running up-slope over them, so the roof reads as tiled
 * even with flat colours.
 *
 * UVs: every roof plane gets its own planar UVs, U along its eave and V up the slope (2 m per
 * repeat), so a directional roof_tile texture keeps its rows parallel to the eaves on all four
 * faces of a hip roof and on buildings at any angle.
 *
 * Frame: the wall-line rectangle is centred at the origin (x across, z deep); `y` is the wall-plate
 * height. Roof planes pass through the wall plate, so overhangs dip slightly below it.
 */
import * as THREE from 'three';
import type { MaterialId } from '../../gfx/materialIds';
import type { Draw } from './draw';
import { clipHalfPlane } from './polygon';
import type { Vec2 } from './types';

export interface RoofSpec {
  kind: 'hip' | 'gable' | 'ring' | 'shed';
  /** Wall-line rectangle (centred). */
  w: number;
  d: number;
  /** Wall-plate height. */
  y: number;
  /** Radians; Roman roofs are low, ~18–25°. */
  pitch?: number;
  overhang?: number;
  /** 'ring': the courtyard / compluvium opening (wall line, centred). */
  inner?: { w: number; d: number; overhang?: number };
  /** Gable end walls. */
  wallMat?: MaterialId;
  wallT?: number;
  /** Tile ridges (imbrices); off for small or far roofs. */
  ridges?: boolean;
  /** Stepped tegula courses on the roof planes (default: same as `ridges`). */
  courses?: boolean;
  /** 'gable' ridge axis; default the long side. */
  axis?: 'x' | 'z';
  /** 'ring': ridge position from the outer walls (0) to the opening (1); default 0.5. */
  ridgeAt?: number;
  topMat?: MaterialId;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const THICK = 0.14;
const RIDGE_SPACING = 0.42;
/** Tegula course length up the slope, and the step at each course's lower edge. */
const COURSE = 0.5;
const STEP = 0.035;
/** Meters per texture repeat on the roof planes. */
const ROOF_UV = 2;

/** Builds the roof; returns the ridge height and (ring roofs) the height of the inner eave. */
export function roof(d: Draw, s: RoofSpec): { top: number; innerEave: number } {
  const p = s.pitch ?? (21 * Math.PI) / 180;
  const tp = Math.tan(p);
  const o = s.overhang ?? 0.45;
  const hw = s.w / 2 + o, hd = s.d / 2 + o;
  const ye = s.y - o * tp;
  const faces: THREE.Vector3[][] = [];
  const caps: [THREE.Vector3, THREE.Vector3][] = [];
  let top = s.y;
  let innerEave = s.y;

  const outer = [V(-hw, ye, -hd), V(hw, ye, -hd), V(hw, ye, hd), V(-hw, ye, hd)];
  if (s.kind === 'hip') {
    const h = s.y + Math.min(s.w, s.d) / 2 * tp;
    const rx = Math.max(0, hw - hd), rz = Math.max(0, hd - hw);
    const ridge = [V(-rx, h, -rz), V(rx, h, -rz), V(rx, h, rz), V(-rx, h, rz)];
    loopFaces(outer, ridge, faces);
    if (rx > 0 || rz > 0) caps.push([ridge[0], ridge[2]]);
    for (let i = 0; i < 4; i++) caps.push([outer[i], ridge[i]]);
    top = h;
  } else if (s.kind === 'gable') {
    const alongX = (s.axis ?? (s.w >= s.d ? 'x' : 'z')) === 'x';
    const run = (alongX ? s.d : s.w) / 2;
    const h = s.y + run * tp;
    if (alongX) {
      faces.push([V(-hw, ye, -hd), V(hw, ye, -hd), V(hw, h, 0), V(-hw, h, 0)]);
      faces.push([V(hw, ye, hd), V(-hw, ye, hd), V(-hw, h, 0), V(hw, h, 0)]);
      caps.push([V(-hw, h, 0), V(hw, h, 0)]);
    } else {
      faces.push([V(-hw, ye, hd), V(-hw, ye, -hd), V(0, h, -hd), V(0, h, hd)]);
      faces.push([V(hw, ye, -hd), V(hw, ye, hd), V(0, h, hd), V(0, h, -hd)]);
      caps.push([V(0, h, -hd), V(0, h, hd)]);
    }
    if (s.wallMat) gableEnds(d, s, alongX, run, h);
    top = h;
  } else if (s.kind === 'shed') {
    const h = s.y + s.d * tp;
    faces.push([V(-hw, ye, -hd), V(hw, ye, -hd), V(hw, h + o * tp, hd), V(-hw, h + o * tp, hd)]);
    top = h;
  } else {
    const inner = s.inner ?? { w: s.w / 3, d: s.d / 3 };
    const oi = inner.overhang ?? 0.35;
    // The ridge sits a fraction `ridgeAt` of the way from the outer walls to the opening; the
    // inner slope keeps the pitch, so a ridge near the walls gives a compluviate (inward) roof.
    const f = s.ridgeAt ?? 0.5;
    const rx = s.w / 2 - (s.w / 2 - inner.w / 2) * f, rz = s.d / 2 - (s.d / 2 - inner.d / 2) * f;
    const runOut = Math.min(s.w / 2 - rx, s.d / 2 - rz);
    const runIn = Math.min(rx - inner.w / 2, rz - inner.d / 2);
    const h = s.y + runOut * tp;
    const ridge = [V(-rx, h, -rz), V(rx, h, -rz), V(rx, h, rz), V(-rx, h, rz)];
    const ix = inner.w / 2 - oi, iz = inner.d / 2 - oi;
    const yi = h - (runIn + oi) * tp;
    const inn = [V(-ix, yi, -iz), V(ix, yi, -iz), V(ix, yi, iz), V(-ix, yi, iz)];
    if (runOut > 0.01) loopFaces(outer, ridge, faces);
    else loopFaces(outer, [V(-s.w / 2, s.y, -s.d / 2), V(s.w / 2, s.y, -s.d / 2), V(s.w / 2, s.y, s.d / 2), V(-s.w / 2, s.y, s.d / 2)], faces);
    loopFaces(inn, ridge, faces);
    for (let i = 0; i < 4; i++) {
      if (runOut > 0.01) caps.push([ridge[i], ridge[(i + 1) % 4]], [outer[i], ridge[i]]);
      caps.push([inn[i], ridge[i]]);
    }
    innerEave = yi;
    top = h;
  }

  const topMat = s.topMat ?? 'roof_tile';
  const ridgeTris: number[] = [];
  const courses = s.courses ?? s.ridges !== false;
  for (const f of faces) {
    slab(d, f, topMat, courses);
    if (s.ridges !== false) imbrices(f, ridgeTris);
  }
  if (ridgeTris.length) d.tris(topMat, ridgeTris, { shadow: false });
  for (const [a, b] of caps) if (a.distanceTo(b) > 0.05) d.rod(topMat, V(a.x, a.y + 0.03, a.z), V(b.x, b.y + 0.03, b.z), 0.1, 6, { shadow: false });
  return { top, innerEave };
}

/** Faces between two concentric rectangles (outer eave → ridge, or inner eave → ridge). Degenerate edges become triangles. */
function loopFaces(a: THREE.Vector3[], b: THREE.Vector3[], out: THREE.Vector3[][]) {
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const f = [a[i], a[j], b[j], b[i]];
    const dedup: THREE.Vector3[] = [];
    for (const p of f) if (!dedup.some((q) => q.distanceToSquared(p) < 1e-6)) dedup.push(p);
    if (dedup.length >= 3) out.push(dedup);
  }
}

function faceNormal(f: THREE.Vector3[]): THREE.Vector3 {
  const n = new THREE.Vector3();
  for (let i = 0; i < f.length; i++) {
    const a = f[i], b = f[(i + 1) % f.length];
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  return n.normalize();
}

/** In-plane frame of a roof face: eave start `a`, eave direction `e`, up-slope `up`, normal `n`. */
function faceFrame(f: THREE.Vector3[]) {
  const n = faceNormal(f);
  // Eave: the lowest horizontal edge.
  let ei = 0, best = Infinity;
  for (let i = 0; i < f.length; i++) {
    const a = f[i], b = f[(i + 1) % f.length];
    if (Math.abs(a.y - b.y) < 1e-3 && a.distanceTo(b) > 0.3 && a.y < best) { best = a.y; ei = i; }
  }
  const a = f[ei], b = f[(ei + 1) % f.length];
  const e = b.clone().sub(a).normalize();
  const up = new THREE.Vector3().crossVectors(n, e);
  if (up.y < 0) up.negate();
  const loc = f.map((p) => { const q = p.clone().sub(a); return [q.dot(e), q.dot(up)] as Vec2; });
  return { a, e, up, n, loc };
}

/**
 * Thin slab: tiled top, timber underside, fascia edges. With `courses` the top is a run of tegula
 * courses, each tilted so its lower edge stands STEP proud of the course below (a riser facing
 * down-slope), closed at the verges by small cheeks.
 */
function slab(d: Draw, f0: THREE.Vector3[], topMat: MaterialId, courses: boolean) {
  const f = faceNormal(f0).y < 0 ? [...f0].reverse() : f0;
  const bot = f.map((p) => V(p.x, p.y - THICK, p.z));
  const { a, e, up, n, loc } = faceFrame(f);
  const P = (sv: number, t: number, h: number) => a.clone().addScaledVector(e, sv).addScaledVector(up, t).addScaledVector(n, h);
  const pos: number[] = [], uv: number[] = [];
  const vert = (sv: number, t: number, h: number) => {
    const p = P(sv, t, h);
    pos.push(p.x, p.y, p.z);
    uv.push(sv / ROOF_UV, (t + h) / ROOF_UV);
  };
  /** Triangle (s, t, h) ×3, flipped if needed so it faces `want`. */
  const tri = (p: [number, number, number][], want: THREE.Vector3) => {
    const [A, B, C] = p.map(([sv, t, h]) => P(sv, t, h));
    const nn = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A));
    if (nn.lengthSq() < 1e-12) return;
    for (const q of nn.dot(want) >= 0 ? p : [p[0], p[2], p[1]]) vert(q[0], q[1], q[2]);
  };
  let tmin = Infinity, tmax = -Infinity;
  for (const [, t] of loc) { tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); }
  const nC = courses ? Math.max(1, Math.round((tmax - tmin) / COURSE)) : 1;
  const ct = (tmax - tmin) / nC;
  const down = up.clone().negate();
  for (let k = 0; k < nC; k++) {
    const t0 = tmin + k * ct, t1 = t0 + ct;
    let strip = loc;
    if (nC > 1) {
      strip = clipHalfPlane(strip, [0, t0], [1, t0], true);
      strip = clipHalfPlane(strip, [0, t1], [1, t1], false);
    }
    if (strip.length < 3) continue;
    const hOf = (t: number) => (nC > 1 ? STEP * Math.max(0, Math.min(1, (t1 - t) / ct)) : 0);
    for (let i = 1; i < strip.length - 1; i++) {
      tri([[strip[0][0], strip[0][1], hOf(strip[0][1])], [strip[i][0], strip[i][1], hOf(strip[i][1])], [strip[i + 1][0], strip[i + 1][1], hOf(strip[i + 1][1])]], n);
    }
    if (nC === 1) continue;
    // Riser along the course's lower edge, and cheeks where the strip meets the face outline.
    const low = strip.filter((p) => Math.abs(p[1] - t0) < 1e-6).map((p) => p[0]);
    if (low.length >= 2) {
      const sL = Math.min(...low), sR = Math.max(...low);
      if (sR - sL > 0.01) {
        tri([[sL, t0, 0], [sR, t0, 0], [sR, t0, STEP]], down);
        tri([[sL, t0, 0], [sR, t0, STEP], [sL, t0, STEP]], down);
      }
    }
    // Centre of the strip, to orient the cheeks outward.
    let cs = 0, ctt = 0;
    for (const [sv, t] of strip) { cs += sv; ctt += t; }
    cs /= strip.length; ctt /= strip.length;
    for (let i = 0; i < strip.length; i++) {
      const [s1, u1] = strip[i], [s2, u2] = strip[(i + 1) % strip.length];
      if (Math.abs(u1 - u2) < 1e-6) continue; // course lines (t = t0 / t1), not outline
      const h1 = hOf(u1), h2 = hOf(u2);
      if (h1 < 1e-5 && h2 < 1e-5) continue;
      const mid = P((s1 + s2) / 2, (u1 + u2) / 2, 0), c = P(cs, ctt, 0);
      const out = mid.sub(c);
      tri([[s1, u1, 0], [s2, u2, 0], [s2, u2, h2]], out);
      if (h1 > 1e-5) tri([[s1, u1, 0], [s2, u2, h2], [s1, u1, h1]], out);
    }
  }
  d.tris(topMat, pos, { uvs: uv });
  d.poly('wood_dark', [...bot].reverse(), { shadow: false });
  const edges: number[] = [];
  for (let i = 0; i < f.length; i++) {
    const j = (i + 1) % f.length;
    const a2 = f[i], b = f[j], c = bot[j], e2 = bot[i];
    // Outward-facing quad (a, e, c, b) for an up-facing CCW polygon.
    edges.push(a2.x, a2.y, a2.z, e2.x, e2.y, e2.z, c.x, c.y, c.z, a2.x, a2.y, a2.z, c.x, c.y, c.z, b.x, b.y, b.z);
  }
  d.tris(topMat, edges, { shadow: false });
}

/**
 * Rows of imbrex ridges running up-slope over the tegula courses, clipped to the face polygon. Each
 * rib is a low triangular prism (two lit faces + an antefix triangle at the eave: 5 triangles).
 */
function imbrices(f0: THREE.Vector3[], out: number[]) {
  const f = faceNormal(f0).y < 0 ? [...f0].reverse() : f0;
  const { a, e, up, n, loc } = faceFrame(f);
  let smin = Infinity, smax = -Infinity;
  for (const [sv] of loc) { smin = Math.min(smin, sv); smax = Math.max(smax, sv); }
  const hw = 0.075, hh = 0.075;
  for (let sv = smin + RIDGE_SPACING / 2; sv < smax - 0.1; sv += RIDGE_SPACING) {
    let t0 = Infinity, t1 = -Infinity;
    for (let i = 0; i < loc.length; i++) {
      const [s0, u0] = loc[i], [s1, u1] = loc[(i + 1) % loc.length];
      if ((sv - s0) * (sv - s1) > 0 || s0 === s1) continue;
      const t = u0 + ((sv - s0) / (s1 - s0)) * (u1 - u0);
      t0 = Math.min(t0, t); t1 = Math.max(t1, t);
    }
    if (!(t1 - t0 > 0.25)) continue;
    // Keep the ridge inside the face near hips: shrink by half a tile width.
    const P = (s: number, t: number, h: number) => a.clone().addScaledVector(e, s).addScaledVector(up, t).addScaledVector(n, h);
    const ts = t0 + 0.02, te = t1 - 0.06;
    const l0 = P(sv - hw, ts, 0), l1 = P(sv - hw, te, 0), r0 = P(sv + hw, ts, 0), r1 = P(sv + hw, te, 0);
    const c0 = P(sv, ts, hh), c1 = P(sv, te, hh);
    out.push(l0.x, l0.y, l0.z, c0.x, c0.y, c0.z, c1.x, c1.y, c1.z, l0.x, l0.y, l0.z, c1.x, c1.y, c1.z, l1.x, l1.y, l1.z);
    out.push(c0.x, c0.y, c0.z, r0.x, r0.y, r0.z, r1.x, r1.y, r1.z, c0.x, c0.y, c0.z, r1.x, r1.y, r1.z, c1.x, c1.y, c1.z);
    // Eave end (antefix face).
    out.push(l0.x, l0.y, l0.z, r0.x, r0.y, r0.z, c0.x, c0.y, c0.z);
  }
}

/** Triangular gable walls closing a gable roof. */
function gableEnds(d: Draw, s: RoofSpec, alongX: boolean, run: number, h: number) {
  const t = s.wallT ?? 0.5;
  const rise = h - s.y;
  const shape = new THREE.Shape([new THREE.Vector2(-run, 0), new THREE.Vector2(run, 0), new THREE.Vector2(0, rise - 0.05)]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 1 });
  const half = (alongX ? s.w : s.d) / 2;
  for (const side of [-1, 1]) {
    // Wall frame: outer face at local z = 0 facing outward.
    const ry = alongX ? (side < 0 ? Math.PI / 2 : -Math.PI / 2) : side < 0 ? 0 : Math.PI;
    const fx = alongX ? side * half : 0, fz = alongX ? 0 : side * half;
    d.at(fx, s.y, fz, ry).geo(g, s.wallMat!);
  }
  g.dispose();
}
