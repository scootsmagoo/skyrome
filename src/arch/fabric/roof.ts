/**
 * Low-pitched Roman tile roofs (tegulae + imbrices): hip, gable, courtyard "ring" (compluviate)
 * and lean-to (shed). Each roof plane is a thin slab (terracotta top, dark timber underside) with
 * rows of imbrex ridges modelled as low prisms, so the roof reads as tiled even with flat colours.
 *
 * Frame: the wall-line rectangle is centred at the origin (x across, z deep); `y` is the wall-plate
 * height. Roof planes pass through the wall plate, so overhangs dip slightly below it.
 */
import * as THREE from 'three';
import type { MaterialId } from '../../gfx/materialIds';
import type { Draw } from './draw';

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
  /** 'gable' ridge axis; default the long side. */
  axis?: 'x' | 'z';
  /** 'ring': ridge position from the outer walls (0) to the opening (1); default 0.5. */
  ridgeAt?: number;
  topMat?: MaterialId;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const THICK = 0.14;
const RIDGE_SPACING = 0.42;

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
  for (const f of faces) {
    slab(d, f, topMat);
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

/** Thin slab: tiled top, timber underside, fascia edges. */
function slab(d: Draw, f0: THREE.Vector3[], topMat: MaterialId) {
  const f = faceNormal(f0).y < 0 ? [...f0].reverse() : f0;
  const bot = f.map((p) => V(p.x, p.y - THICK, p.z));
  d.poly(topMat, f);
  d.poly('wood_dark', [...bot].reverse(), { shadow: false });
  const edges: number[] = [];
  for (let i = 0; i < f.length; i++) {
    const j = (i + 1) % f.length;
    const a = f[i], b = f[j], c = bot[j], e = bot[i];
    // Outward-facing quad (a, e, c, b) for an up-facing CCW polygon.
    edges.push(a.x, a.y, a.z, e.x, e.y, e.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
  }
  d.tris(topMat, edges, { shadow: false });
}

/** Rows of imbrex ridges running up-slope, clipped to the face polygon. */
function imbrices(f0: THREE.Vector3[], out: number[]) {
  const f = faceNormal(f0).y < 0 ? [...f0].reverse() : f0;
  const n = faceNormal(f);
  // Eave: lowest horizontal edge.
  let ei = 0, best = Infinity;
  for (let i = 0; i < f.length; i++) {
    const a = f[i], b = f[(i + 1) % f.length];
    if (Math.abs(a.y - b.y) < 1e-3 && a.distanceTo(b) > 0.3 && a.y < best) { best = a.y; ei = i; }
  }
  const a = f[ei], b = f[(ei + 1) % f.length];
  const e = b.clone().sub(a).normalize();
  const up = new THREE.Vector3().crossVectors(n, e);
  if (up.y < 0) up.negate();
  const loc = f.map((p) => { const q = p.clone().sub(a); return [q.dot(e), q.dot(up)] as [number, number]; });
  let smin = Infinity, smax = -Infinity;
  for (const [sv] of loc) { smin = Math.min(smin, sv); smax = Math.max(smax, sv); }
  const hw = 0.065, hh = 0.055;
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
    const prof: [number, number][] = [[-hw, 0], [-hw * 0.55, hh], [hw * 0.55, hh], [hw, 0]];
    for (let k = 0; k < 3; k++) {
      const [s0, h0] = prof[k], [s1, h1] = prof[k + 1];
      const p0 = P(sv + s0, ts, h0), p1 = P(sv + s1, ts, h1), p2 = P(sv + s1, te, h1), p3 = P(sv + s0, te, h0);
      out.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
    }
    // Eave end cap (antefix face).
    const c0 = P(sv - hw, ts, 0), c1 = P(sv - hw * 0.55, ts, hh), c2 = P(sv + hw * 0.55, ts, hh), c3 = P(sv + hw, ts, 0);
    out.push(c0.x, c0.y, c0.z, c2.x, c2.y, c2.z, c1.x, c1.y, c1.z, c0.x, c0.y, c0.z, c3.x, c3.y, c3.z, c2.x, c2.y, c2.z);
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
