/**
 * Streets that follow the terrain: basalt-paved roadways (selce) between raised curbs and sidewalks
 * (crepidines) with Pompeian stepping stones, plain gravel/dirt lanes, paved plazas of any polygon,
 * and flights of steps for steep links. Everything conforms to `heightAt(x, z)` and is written into
 * a MeshBuilder in world (game) coordinates, with trimesh colliders for the walkable surfaces.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { Rng } from '../../core/Rng';
import { KERB } from '../../core/traversal';
import { castsShadow } from './shadow';
import { ensurePositive, polygonBounds, pointInPolygon, polylineLength, resamplePolyline, subtractPolygons } from './polygon';
import type { HeightFn, Polygon, Vec2 } from './types';

export interface StreetSpec {
  /** Centreline polyline (game x, z). */
  points: Vec2[];
  kind?: 'paved' | 'lane';
  /** Carriageway width (paved) or total lane width. */
  roadWidth?: number;
  /** Sidewalk width on each side (paved). */
  sidewalk?: number;
  curb?: number;
  roadMaterial?: MaterialId;
  sidewalkMaterial?: MaterialId;
  curbMaterial?: MaterialId;
  /** Distances along the street for stepping-stone crossings (paved). Default: every ~45 m. */
  steppingStones?: number[];
  /** Height of the roadway above the terrain (avoids z-fighting with the ground mesh). */
  lift?: number;
  /** Close the sidewalk ends with a vertical face (default true). */
  capStart?: boolean;
  capEnd?: boolean;
  /**
   * Dropped kerbs (paved): where a street or lane meets this road, the sidewalk on `side` (+1 =
   * the left normal's side, -1 = the other) ramps down to the carriageway over `w` m centred on
   * arc length `s` (from the start of `points`), plus RAMP m of slope either side, so a walker
   * crosses from the street to the road without a step.
   */
  dips?: { s: number; side: -1 | 1; w: number }[];
  /** Add trimesh colliders (default true). */
  collide?: boolean;
  seed?: number;
  /**
   * Conform to the ground (the city's streets, phase 4b): the surface is subdivided until it follows
   * `heightAt` within CONFORM_TOL, cut away where a surface that wins the place lies (`cut`), and
   * every open edge gets a skirt down under the ground; the kerb faces follow the ground too and the
   * collider is welded. Without it the street is built as before (landmark builders, demo scenes).
   */
  conform?: ConformOpts;
  /** Material of the outer apron of a lane (default the lane's own): a travertine edge course where an open road meets paving. */
  apronMaterial?: MaterialId;
}

export interface StreetResult {
  length: number;
  /** Outer edge polylines (the property lines on either side). */
  left: Vec2[];
  right: Vec2[];
}

type Expect = 'up' | 'in' | 'out';
interface ProfilePt { off: number; y: number }
interface Strip { mat: MaterialId; expect: Expect }

/** Width (m) of the walkable apron where a paved street's sidewalk meets the ground, and where a lane does. */
export const APRON = 0.9;
export const LANE_APRON = 0.6;
/** An apron ends this far (m) above the ground, not under it or flush: ground within 2 cm of the paving is a flaw the crawl counts (a lip of 2 cm rides over). */
export const APRON_FLUSH = 0.022;

/** Builds a street into `b` (world coordinates). */
export function buildStreet(b: MeshBuilder, spec: StreetSpec, heightAt: HeightFn): StreetResult {
  const paved = (spec.kind ?? 'paved') === 'paved';
  const rw = spec.roadWidth ?? (paved ? 5.0 : 3.2);
  const sw = paved ? spec.sidewalk ?? 1.8 : 0;
  const ch = paved ? spec.curb ?? KERB : 0;
  const lift = spec.lift ?? 0.06;
  const roadMat = spec.roadMaterial ?? (paved ? 'paving_basalt' : 'gravel');
  const sideMat = spec.sidewalkMaterial ?? 'cobbles';
  const curbMat = spec.curbMaterial ?? 'travertine';
  const hw = rw / 2;

  // Cross-section profile, left (negative offset) to right.
  const prof: ProfilePt[] = [];
  const strips: Strip[] = [];
  const push = (off: number, y: number, mat?: MaterialId, expect?: Expect) => {
    if (prof.length && mat) strips.push({ mat, expect: expect! });
    prof.push({ off, y });
  };
  if (paved) {
    const cw = 0.32;
    // The outer edge is an apron sloping down to the ground over APRON m (a vertical 30 cm face stood
    // out as a slab where the street crosses open ground; along houses it runs under their walls).
    // It is walkable: a lip of 15-25 cm between the sidewalk and the ground caught pedestrians.
    push(-hw - sw - APRON, -lift + APRON_FLUSH);
    push(-hw - sw, ch, 'concrete', 'up');
    push(-hw - cw, ch, sideMat, 'up');
    push(-hw, ch, curbMat, 'up');
    push(-hw, 0, curbMat, 'in');
    // The crown (a conformed street keeps its two halves plane: 1 cm less at the quarter points).
    if (!spec.conform) push(-hw * 0.5, 0.045, roadMat, 'up');
    push(0, 0.07, roadMat, 'up');
    if (!spec.conform) push(hw * 0.5, 0.045, roadMat, 'up');
    push(hw, 0, roadMat, 'up');
    push(hw, ch, curbMat, 'in');
    push(hw + cw, ch, curbMat, 'up');
    push(hw + sw, ch, sideMat, 'up');
    push(hw + sw + APRON, -lift + APRON_FLUSH, 'concrete', 'up');
  } else {
    // A lane's edges run out to the ground in a walkable apron too (the old 5 cm edge was a step of the lane's lift).
    const apronMat = spec.apronMaterial ?? roadMat;
    push(-hw - LANE_APRON, -lift + APRON_FLUSH);
    push(-hw, 0.0, apronMat, 'up');
    push(0, 0.05, roadMat, 'up');
    push(hw, 0.0, roadMat, 'up');
    push(hw + LANE_APRON, -lift + APRON_FLUSH, apronMat, 'up');
  }

  // A conformed street is split where the ground folds anyway: it needs cross-sections only every
  // CONFORM_STEP, at its own bends, and where its kerbs ramp (the ends, the dropped kerbs).
  const pts = spec.conform ? conformSamples(spec.points, CONFORM_STEP, rampMarks(spec)) : resamplePolyline(spec.points, 1.6);
  const n = pts.length;
  // Tangents (averaged) and miter-scaled left normals.
  const tan: Vec2[] = [], nor: Vec2[] = [], miter: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)];
    let tx = c[0] - a[0], tz = c[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    tan.push([tx, tz]);
    nor.push([-tz, tx]);
    // Miter: compare with the incoming segment direction.
    if (i > 0 && i < n - 1) {
      const sx = pts[i][0] - pts[i - 1][0], sz = pts[i][1] - pts[i - 1][1];
      const sl = Math.hypot(sx, sz) || 1;
      const cos = (sx / sl) * tx + (sz / sl) * tz;
      miter.push(Math.min(2, 1 / Math.max(0.5, cos)));
    } else miter.push(1);
  }
  // Raised sidewalks ramp down to the roadway over the last metres of a capped end (a kerb
  // ramp), instead of stopping in a 30 cm block that read as a slab floating at junctions.
  const along: number[] = [0];
  for (let i = 1; i < n; i++) along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = along[n - 1] || 1;
  const raise = (i: number, off: number) => {
    let f = 1;
    if (spec.capStart ?? true) f = Math.min(f, along[i] / RAMP);
    if (spec.capEnd ?? true) f = Math.min(f, (total - along[i]) / RAMP);
    if (spec.dips) {
      for (const d of spec.dips) {
        if (d.side !== Math.sign(off)) continue;
        // 0 inside the dip's flat, rising to 1 over RAMP m beyond its edge.
        f = Math.min(f, (Math.abs(along[i] - d.s) - d.w / 2) / RAMP);
      }
    }
    return Math.max(0, Math.min(1, f));
  };
  const P = (i: number, k: number) => {
    const p = prof[k];
    const x = pts[i][0] + nor[i][0] * p.off * miter[i], z = pts[i][1] + nor[i][1] * p.off * miter[i];
    const y = paved && p.y === ch ? ch * raise(i, p.off) : p.y;
    return new THREE.Vector3(x, heightAt(x, z) + lift + y, z);
  };
  const outline = () => ({
    length: polylineLength(spec.points),
    left: pts.map((p, i) => [p[0] + nor[i][0] * (-hw - sw) * miter[i], p[1] + nor[i][1] * (-hw - sw) * miter[i]] as Vec2),
    right: pts.map((p, i) => [p[0] + nor[i][0] * (hw + sw) * miter[i], p[1] + nor[i][1] * (hw + sw) * miter[i]] as Vec2),
  });
  if (spec.conform) {
    // The same cross-section, as a sheet over the ground: every vertex keeps its height above the
    // terrain (lift + profile), the surface is refined until it follows the ground, kerb faces are
    // walls between their two strips, and the end caps give way to the skirts of the open edges.
    const sheet = new Sheet(heightAt);
    const V: SV[][] = [];
    for (let i = 0; i < n; i++) {
      V.push(prof.map((p) => {
        const x = pts[i][0] + nor[i][0] * p.off * miter[i], z = pts[i][1] + nor[i][1] * p.off * miter[i];
        const y = paved && p.y === ch ? ch * raise(i, p.off) : p.y;
        return sheet.v(x, z, lift + y);
      }));
    }
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < strips.length; k++) {
        const s = strips[k];
        if (s.expect === 'up') {
          sheet.tri(V[i][k], V[i][k + 1], V[i + 1][k + 1], s.mat);
          sheet.tri(V[i][k], V[i + 1][k + 1], V[i + 1][k], s.mat);
        } else {
          // A kerb face: from the lower of its two profile points up to the higher, facing the carriageway.
          const lo = prof[k].y <= prof[k + 1].y ? k : k + 1, hi = lo === k ? k + 1 : k;
          const side = Math.sign(prof[k].off) || 1;
          const nx = -(nor[i][0] + nor[i + 1][0]) * 0.5 * side, nz = -(nor[i][1] + nor[i + 1][1]) * 0.5 * side;
          sheet.wall(V[i][lo], V[i + 1][lo], V[i][hi].off, V[i + 1][hi].off, s.mat, nx, nz);
        }
      }
    }
    // Ends that continue in the next piece of the same street are seams, not open edges.
    const endLine = (i: number): [SV, SV] => [V[i][0], V[i][prof.length - 1]];
    const seams: [SV, SV][] = [];
    if (!(spec.capStart ?? true)) seams.push(endLine(0));
    if (!(spec.capEnd ?? true)) seams.push(endLine(n - 1));
    emitSheet(b, sheet, { ...spec.conform, collide: spec.collide ?? spec.conform.collide ?? true, seam: seams.length ? (a, c) => seams.some(([p, q]) => onLine(a, p, q) && onLine(c, p, q)) : spec.conform.seam });
    return outline();
  }
  const grid: THREE.Vector3[][] = [];
  for (let i = 0; i < n; i++) grid.push(prof.map((_, k) => P(i, k)));

  const byMat = new Map<MaterialId, number[]>();
  const col: number[] = [];
  const tri = (arr: number[], a: THREE.Vector3, bb: THREE.Vector3, c: THREE.Vector3) => arr.push(a.x, a.y, a.z, bb.x, bb.y, bb.z, c.x, c.y, c.z);
  const quad = (mat: MaterialId, a: THREE.Vector3, bb: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, expect: Expect, i: number, collide: boolean) => {
    // Orient so the face normal matches the expected direction.
    const nrm = new THREE.Vector3().subVectors(bb, a).cross(new THREE.Vector3().subVectors(d, a));
    let want: THREE.Vector3;
    if (expect === 'up') want = new THREE.Vector3(0, 1, 0);
    else {
      const side = Math.sign((a.x - pts[i][0]) * nor[i][0] + (a.z - pts[i][1]) * nor[i][1]) || 1;
      want = new THREE.Vector3(nor[i][0], 0, nor[i][1]).multiplyScalar(expect === 'out' ? side : -side);
    }
    const arr = byMat.get(mat) ?? [];
    byMat.set(mat, arr);
    if (nrm.dot(want) >= 0) { tri(arr, a, bb, c); tri(arr, a, c, d); }
    else { tri(arr, a, c, bb); tri(arr, a, d, c); }
    if (collide && expect !== 'out') { tri(col, a, bb, c); tri(col, a, c, d); }
  };
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < strips.length; k++) {
      quad(strips[k].mat, grid[i][k], grid[i][k + 1], grid[i + 1][k + 1], grid[i + 1][k], strips[k].expect, i, true);
    }
  }
  // End caps for raised sidewalks.
  if (paved) {
    const cap = (i: number, sgn: number) => {
      for (const [k0, k1] of [[1, 3], [prof.length - 4, prof.length - 2]]) {
        const top0 = grid[i][k0], top1 = grid[i][k1];
        const bot0 = top0.clone().setY(heightAt(top0.x, top0.z) + lift - 0.6), bot1 = top1.clone().setY(heightAt(top1.x, top1.z) + lift - 0.6);
        const nrm = new THREE.Vector3().subVectors(top1, top0).cross(new THREE.Vector3().subVectors(bot0, top0));
        const want = new THREE.Vector3(tan[i][0] * sgn, 0, tan[i][1] * sgn);
        const arr = byMat.get(sideMat)!;
        if (nrm.dot(want) >= 0) { tri(arr, top0, top1, bot0); tri(arr, top1, bot1, bot0); }
        else { tri(arr, top0, bot0, top1); tri(arr, top1, bot0, bot1); }
      }
    };
    if (spec.capStart ?? true) cap(0, -1);
    if (spec.capEnd ?? true) cap(n - 1, 1);
  }
  for (const [mat, arr] of byMat) addTris(b, mat, arr);

  const length = polylineLength(spec.points);
  // Stepping stones across the carriageway.
  if (paved) {
    const rng = new Rng(spec.seed ?? 5);
    const at = spec.steppingStones ?? (length > 30 ? Array.from({ length: Math.floor(length / 45) }, (_, i) => (i + 0.5) * (length / Math.floor(length / 45))) : []);
    for (const s of at) {
      const { p, t } = pointAt(spec.points, s);
      const nx = -t[1], nz = t[0];
      const count = rw > 4.2 ? 3 : 2;
      for (let j = 0; j < count; j++) {
        const off = (j - (count - 1) / 2) * (rw / count);
        const x = p[0] + nx * off, z = p[1] + nz * off;
        const y = heightAt(x, z) + lift;
        const g = new THREE.CylinderGeometry(1, 1, 1, 10);
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(x, y + (ch + 0.02) / 2 - 0.05, z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(t[0], t[1]) + rng.range(-0.08, 0.08)),
          new THREE.Vector3(0.3, ch + 0.12, 0.48),
        );
        b.add(g, 'basalt', m);
        b.collider({ kind: 'box', center: new THREE.Vector3(x, y + (ch - 0.05) / 2, z), half: new THREE.Vector3(0.28, (ch + 0.05) / 2, 0.28) });
      }
    }
  }
  if (spec.collide ?? true) addCollider(b, col);
  return outline();
}

/** Cross-sections of a conformed street are at most this far apart (m). */
const CONFORM_STEP = 3.2;
/** Width (m) of a kerb ramp at a capped end or beside a dropped kerb (buildStreet). */
const RAMP = 1.6;

/** Arc lengths where a street's kerbs start or stop ramping (they need a cross-section there). */
function rampMarks(spec: StreetSpec): number[] {
  const L = polylineLength(spec.points);
  const out: number[] = [];
  if (spec.capStart ?? true) out.push(RAMP);
  if (spec.capEnd ?? true) out.push(L - RAMP);
  for (const d of spec.dips ?? []) out.push(d.s - d.w / 2 - RAMP, d.s - d.w / 2, d.s + d.w / 2, d.s + d.w / 2 + RAMP);
  return out;
}

/** The polyline's own points, points every ≤ `step` between them, and the points at arc lengths `marks`. */
function conformSamples(pts: Vec2[], step: number, marks: number[]): Vec2[] {
  const out: Vec2[] = [];
  const ms = marks.filter((m) => Number.isFinite(m)).sort((a, b) => a - b);
  let acc = 0, mi = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / step));
    const ss: number[] = [];
    for (let k = 0; k < n; k++) ss.push((len * k) / n);
    while (mi < ms.length && ms[mi] < acc + len) {
      const t = ms[mi++] - acc;
      if (t > 0.05 && t < len - 0.05) ss.push(t);
    }
    ss.sort((x, y) => x - y);
    let prev = -1;
    for (const t of ss) {
      if (prev >= 0 && t - prev < 0.05) continue;
      out.push(len > 0 ? [a[0] + ((b[0] - a[0]) * t) / len, a[1] + ((b[1] - a[1]) * t) / len] : [a[0], a[1]]);
      prev = t;
    }
    acc += len;
  }
  out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  return out;
}

/** Point and unit tangent at arc length `s` along a polyline. */
export function pointAt(pts: Vec2[], s: number): { p: Vec2; t: Vec2 } {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], c = pts[i + 1];
    const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (acc + l >= s || i === pts.length - 2) {
      const f = l > 0 ? Math.max(0, Math.min(1, (s - acc) / l)) : 0;
      return { p: [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f], t: [(c[0] - a[0]) / (l || 1), (c[1] - a[1]) / (l || 1)] };
    }
    acc += l;
  }
  return { p: pts[0], t: [1, 0] };
}

function addTris(b: MeshBuilder, mat: MaterialId, arr: number[]) {
  if (!arr.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  g.computeVertexNormals();
  b.add(g, mat, undefined, { castShadow: castsShadow(mat) });
}

function addCollider(b: MeshBuilder, arr: number[]) {
  if (!arr.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  b.collider({ kind: 'trimesh', geometry: g });
}

// ------------------------------------------------------------------ conforming sheets (phase 4b)

/** Largest gap (m) a conformed surface leaves against `heightAt`, along its edges and inside. */
export const CONFORM_TOL = 0.02;
/** Skirts reach this far below the lowest ground under their edge (the drawn terrain drops 9 cm under roads and pads). */
export const SKIRT_DEPTH = 0.1;
/** An open edge standing no higher than this over the ground needs no skirt (an apron's 2.2 cm edge). */
export const SKIRT_MIN = 0.03;
/** Ground cover's rim lies this much under its body, so it meets the ground with no edge to see... */
export const RIM_SINK = 0.05;
/** ...but never under this height over the ground (the terrain would show through, and fight it). */
export const RIM_MIN = 0.005;
/** Edges shorter than this are not split again. */
const MIN_EDGE = 0.03;
/** No split closer than this (m) to an edge's end. */
const MIN_PIECE = 0.005;
/** Deepest refinement of one coarse triangle. */
const MAX_DEPTH = 40;
/** Plane-side tolerance of the convex cut. */
const CUT_EPS = 1e-9;

/**
 * The terrain's lattice when `heightAt` is linear on its triangles (terrain v2: every cell of the
 * grid split on its b–c diagonal, the lines x, z and x + z constant). A surface is then split exactly
 * where the ground folds under it, and nowhere else.
 */
export interface GroundGrid {
  x0: number;
  z0: number;
  s: number;
}

/** A convex polygon (either winding) and its box: a piece of a surface that wins a place. */
export interface Conv {
  pts: readonly Vec2[];
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  /** Outward normal and offset of each edge (filled on first use). */
  n?: Float64Array;
}

export function makeConv(pts: readonly Vec2[]): Conv {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { pts, minX, minZ, maxX, maxZ };
}

function convNormals(c: Conv): Float64Array {
  if (c.n) return c.n;
  const P = c.pts, m = P.length;
  let cx = 0, cz = 0;
  for (const p of P) {
    cx += p[0] / m;
    cz += p[1] / m;
  }
  const n = new Float64Array(3 * m);
  for (let i = 0; i < m; i++) {
    const p = P[i], q = P[(i + 1) % m];
    const ex = q[0] - p[0], ez = q[1] - p[1];
    const L = Math.hypot(ex, ez);
    if (L < 1e-9) {
      // A repeated point: a plane every point is inside of.
      n[3 * i + 2] = 1;
      continue;
    }
    let nx = ez / L, nz = -ex / L;
    if (nx * (cx - p[0]) + nz * (cz - p[1]) > 0) {
      nx = -nx;
      nz = -nz;
    }
    n[3 * i] = nx;
    n[3 * i + 1] = nz;
    n[3 * i + 2] = nx * p[0] + nz * p[1];
  }
  return (c.n = n);
}

/** Is (x, z) inside the convex polygon (its boundary included)? */
export function inConv(c: Conv, x: number, z: number): boolean {
  if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) return false;
  const n = convNormals(c);
  for (let i = 0; i < c.pts.length; i++) if (n[3 * i] * x + n[3 * i + 1] * z - n[3 * i + 2] > CUT_EPS) return false;
  return true;
}

type CutFn = (minX: number, minZ: number, maxX: number, maxZ: number) => readonly Conv[];

/** Is (x, z) inside one of the pieces `cut` gives there? */
export function inCut(cut: CutFn | null | undefined, x: number, z: number): boolean {
  if (!cut) return false;
  for (const c of cut(x - 1e-3, z - 1e-3, x + 1e-3, z + 1e-3)) if (inConv(c, x, z)) return true;
  return false;
}

export interface ConformOpts {
  /** Deviation allowed against heightAt (default CONFORM_TOL). */
  tol?: number;
  /**
   * The terrain's lattice (terrain v2): edges are split at the fold of the ground where the gap is
   * largest, triangles at the lattice point inside them that is furthest off. Without it (v1's
   * bilinear ground) an edge is halved while its midpoint is off, a triangle split at its centroid.
   */
  ground?: GroundGrid | null;
  /** The convex pieces of the surfaces that win this place, near a box: the sheet is cut away inside them. */
  cut?: CutFn | null;
  /** Open edges that get no skirt: seams where the same surface goes on in the next piece or cell. */
  seam?: ((a: SV, b: SV) => boolean) | null;
  /** Skirts under the open edges (default true). */
  skirts?: boolean;
  /** An open edge no higher than this over the ground gets no skirt (default SKIRT_MIN)... */
  skirtMin?: number;
  /** ...except where this says the drawn ground drops away (under the atlas roads and the pads). */
  skirtAlways?: ((x: number, z: number) => boolean) | null;
  /** Height above the ground of every vertex on an open edge (ground cover: its rim sunk); null keeps theirs. */
  rim?: number | null;
  /** A trimesh collider of the top and the walls, welded (default true). */
  collide?: boolean;
}

/** A sheet vertex: plan position, height above the ground (`off`), and the ground there (`h`). */
export interface SV {
  x: number;
  z: number;
  off: number;
  h: number;
}

interface STri {
  a: SV;
  b: SV;
  c: SV;
  mat: MaterialId;
  col: boolean;
}

/** A vertical face along p → q: bottom at the vertices' own heights, top at tp / tq above the ground, looking along (nx, nz). */
interface SWall {
  p: SV;
  q: SV;
  tp: number;
  tq: number;
  mat: MaterialId;
  nx: number;
  nz: number;
  col: boolean;
}

/**
 * A surface before it is laid on the ground: plan triangles whose vertices carry their height above
 * the terrain, and walls (kerb faces) along plan segments with a bottom and a top height. `emitSheet`
 * refines it to the ground, cuts it, skirts it and writes it into a MeshBuilder.
 */
export class Sheet {
  readonly tris: STri[] = [];
  readonly walls: SWall[] = [];
  constructor(readonly H: HeightFn) {}
  v(x: number, z: number, off: number): SV {
    return { x, z, off, h: this.H(x, z) };
  }
  tri(a: SV, b: SV, c: SV, mat: MaterialId, collide = true) {
    this.tris.push({ a, b, c, mat, col: collide });
  }
  wall(p: SV, q: SV, topP: number, topQ: number, mat: MaterialId, nx: number, nz: number, collide = true) {
    if (topP - p.off < 1e-4 && topQ - q.off < 1e-4) return;
    const l = Math.hypot(nx, nz) || 1;
    this.walls.push({ p, q, tp: topP, tq: topQ, mat, nx: nx / l, nz: nz / l, col: collide });
  }
}

/** Is `a` on the plan line through p and q (within 1 mm)? */
export function onLine(a: { x: number; z: number }, p: { x: number; z: number }, q: { x: number; z: number }, eps = 1e-3): boolean {
  const dx = q.x - p.x, dz = q.z - p.z;
  const l = Math.hypot(dx, dz);
  if (l < 1e-9) return Math.hypot(a.x - p.x, a.z - p.z) < eps;
  return Math.abs((a.x - p.x) * dz - (a.z - p.z) * dx) / l < eps;
}

/** Canonical order of an edge's ends (so both triangles of an edge compute it the same way). */
const first = (a: SV, b: SV) => a.x < b.x || (a.x === b.x && a.z <= b.z);
const xzKey = (a: SV, b: SV) => (first(a, b) ? `${a.x},${a.z},${b.x},${b.z}` : `${b.x},${b.z},${a.x},${a.z}`);

/** Calls f(t) for every t in [0, 1] where w0 + dw·t is a whole number. */
function crossings(w0: number, dw: number, f: (t: number) => void) {
  if (Math.abs(dw) < 1e-12) return;
  const lo = Math.min(w0, w0 + dw), hi = Math.max(w0, w0 + dw);
  for (let k = Math.ceil(lo); k <= Math.floor(hi); k++) f((k - w0) / dw);
}

/** A point on u → v at s, everything linear (inside one planar triangle of the sheet). */
const lerpSV = (u: SV, v: SV, s: number): SV => ({ x: u.x + (v.x - u.x) * s, z: u.z + (v.z - u.z) * s, off: u.off + (v.off - u.off) * s, h: u.h + (v.h - u.h) * s });

/** Splits a convex polygon by the line n·p = d into the part outside (n·p > d) and the part inside; points on the line go to both. */
function splitByLine(P: SV[], nx: number, nz: number, d: number): [SV[], SV[]] {
  const m = P.length;
  const s = new Array<number>(m);
  let anyOut = false, anyIn = false;
  for (let i = 0; i < m; i++) {
    const v = (s[i] = nx * P[i].x + nz * P[i].z - d);
    if (v > CUT_EPS) anyOut = true;
    else if (v < -CUT_EPS) anyIn = true;
  }
  if (!anyOut) return [[], P];
  if (!anyIn) return [P, []];
  const A: SV[] = [], B: SV[] = [];
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const su = s[i], sv = s[j];
    if (su >= -CUT_EPS) A.push(P[i]);
    if (su <= CUT_EPS) B.push(P[i]);
    if ((su > CUT_EPS && sv < -CUT_EPS) || (su < -CUT_EPS && sv > CUT_EPS)) {
      const x = lerpSV(P[i], P[j], su / (su - sv));
      A.push(x);
      B.push(x);
    }
  }
  return [A, B];
}

/** P minus the convex c, as convex pieces pushed onto `out`. */
function subtractConv(P: SV[], c: Conv, out: SV[][]) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const v of P) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  }
  if (maxX <= c.minX || minX >= c.maxX || maxZ <= c.minZ || minZ >= c.maxZ) {
    out.push(P);
    return;
  }
  const n = convNormals(c);
  let rem = P;
  for (let i = 0; i < c.pts.length; i++) {
    const nx = n[3 * i], nz = n[3 * i + 1];
    if (nx === 0 && nz === 0) continue;
    const [outside, inside] = splitByLine(rem, nx, nz, n[3 * i + 2]);
    if (outside.length >= 3) out.push(outside);
    if (inside.length < 3) return;
    rem = inside;
  }
  // What is left lies inside c: dropped.
}

function polyArea(P: SV[]): number {
  let a = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length];
    a += p.x * q.z - q.x * p.z;
  }
  return Math.abs(a) / 2;
}

/** Running totals of emitSheet (profiling and the offline cell check; `check` also measures the written top against heightAt at every edge midpoint: the worst in `maxDev`, the edges over tolerance in `over` and their length in `overLen`). */
export const conformStats = { sheets: 0, input: 0, refined: 0, kept: 0, skirts: 0, walls: 0, ms: 0, maxDev: 0, over: 0, overLen: 0, check: false };

export interface SheetStats {
  /** Visible triangles written (top, walls and skirts). */
  tris: number;
  skirts: number;
  /** Largest deviation of the written top from heightAt at its triangles' centroids (m). */
  maxDev: number;
}

interface OpenEdge {
  u: SV;
  v: SV;
  nx: number;
  nz: number;
  mat: MaterialId;
}

/**
 * Lays a sheet on the ground and writes it into `b`:
 *  1. refine: with the terrain's lattice (v2), an edge is split at the crossing of a lattice line
 *     (x, z or x + z constant: where the ground folds) where the ground leaves the edge by most, while
 *     that is more than `tol`; a triangle whose edges fit is split at the lattice point inside it that
 *     is furthest off. Without it, an edge is halved while its midpoint is off and a triangle split at
 *     its centroid. The rule reads only the edge, so the two triangles of an edge (and a wall on it)
 *     split it alike: no cracks.
 *  2. cut: what lies inside a surface that wins the place is cut away exactly (the convex pieces of
 *     `cut`); an edge is open where nothing of this sheet lies beyond it.
 *  3. skirts: every open edge (not a seam) standing more than `skirtMin` over the ground gets a
 *     vertical face down to the lowest ground under it minus SKIRT_DEPTH, in its material, without a
 *     collider; with `rim`, open edges are laid at that height instead (ground cover).
 *  4. the top, the walls and the skirts are written by material; the collider (top and walls) is one
 *     welded (indexed) trimesh.
 */
export function emitSheet(b: MeshBuilder, sheet: Sheet, o: ConformOpts = {}): SheetStats {
  const t0 = performance.now();
  const H = sheet.H;
  const tol = o.tol ?? CONFORM_TOL;
  const grid = o.ground ?? null;
  const splitMemo = new Map<string, number>();
  const splitVerts = new Map<string, SV>();
  /** Where (0..1 from the canonical first end) the edge a–c is split, or −1. */
  const splitT = (a: SV, c: SV): number => {
    const [p, q] = first(a, c) ? [a, c] : [c, a];
    const key = `${p.x},${p.z},${q.x},${q.z}`;
    const m = splitMemo.get(key);
    if (m !== undefined) return m;
    const dx = q.x - p.x, dz = q.z - p.z;
    const L = Math.hypot(dx, dz);
    let best = -1;
    if (L >= MIN_EDGE) {
      const lo = MIN_PIECE / L, hi = 1 - lo;
      let worst = tol;
      const test = (t: number) => {
        if (t <= lo || t >= hi) return;
        const d = Math.abs(H(p.x + dx * t, p.z + dz * t) - (p.h + (q.h - p.h) * t));
        if (d > worst) {
          worst = d;
          best = t;
        }
      };
      if (grid) {
        const u0 = (p.x - grid.x0) / grid.s, v0 = (p.z - grid.z0) / grid.s, du = dx / grid.s, dv = dz / grid.s;
        crossings(u0, du, test);
        crossings(v0, dv, test);
        crossings(u0 + v0, du + dv, test);
      } else test(0.5);
    }
    splitMemo.set(key, best);
    return best;
  };
  /** The vertex splitting a–c (same plan point for every edge on that line, its own height above the ground). */
  const splitV = (a: SV, c: SV): SV => {
    const t = splitT(a, c);
    const [p, q] = first(a, c) ? [a, c] : [c, a];
    const key = `${p.x},${p.z},${p.off},${q.x},${q.z},${q.off}`;
    let v = splitVerts.get(key);
    if (!v) splitVerts.set(key, (v = sheet.v(p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t, p.off + (q.off - p.off) * t)));
    return v;
  };
  /** The point inside a triangle (whose edges fit) where the ground is furthest off its plane, beyond tol; or null. */
  const interior = (a: SV, bb: SV, c: SV): SV | null => {
    const det = (bb.z - c.z) * (a.x - c.x) + (c.x - bb.x) * (a.z - c.z);
    if (Math.abs(det) < 1e-9) return null;
    if (grid) {
      const s = grid.s;
      const i0 = Math.ceil((Math.min(a.x, bb.x, c.x) - grid.x0) / s), i1 = Math.floor((Math.max(a.x, bb.x, c.x) - grid.x0) / s);
      const j0 = Math.ceil((Math.min(a.z, bb.z, c.z) - grid.z0) / s), j1 = Math.floor((Math.max(a.z, bb.z, c.z) - grid.z0) / s);
      let worst = tol, best: SV | null = null;
      for (let j = j0; j <= j1; j++) {
        const z = grid.z0 + j * s;
        for (let i = i0; i <= i1; i++) {
          const x = grid.x0 + i * s;
          const l1 = ((bb.z - c.z) * (x - c.x) + (c.x - bb.x) * (z - c.z)) / det;
          const l2 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / det;
          const l3 = 1 - l1 - l2;
          if (l1 < 1e-3 || l2 < 1e-3 || l3 < 1e-3) continue;
          const h = H(x, z);
          const d = Math.abs(h - (l1 * a.h + l2 * bb.h + l3 * c.h));
          if (d > worst) {
            worst = d;
            best = { x, z, off: l1 * a.off + l2 * bb.off + l3 * c.off, h };
          }
        }
      }
      return best;
    }
    const Lmax = Math.max(Math.hypot(bb.x - a.x, bb.z - a.z), Math.hypot(c.x - bb.x, c.z - bb.z), Math.hypot(a.x - c.x, a.z - c.z));
    if (Lmax <= 2 * MIN_EDGE) return null;
    const cx = (a.x + bb.x + c.x) / 3, cz = (a.z + bb.z + c.z) / 3;
    const hc = H(cx, cz);
    if (Math.abs(hc - (a.h + bb.h + c.h) / 3) <= tol) return null;
    return { x: cx, z: cz, off: (a.off + bb.off + c.off) / 3, h: hc };
  };

  // ---- 1. refine
  const out: STri[] = [];
  /** Slivers under 1 mm tall in plan (a split point on or by the opposite edge): they draw nothing and are not split, but they still join their edges. */
  const flat: STri[] = [];
  const refine = (a: SV, bb: SV, c: SV, mat: MaterialId, col: boolean, depth: number): void => {
    const cr = (bb.x - a.x) * (c.z - a.z) - (bb.z - a.z) * (c.x - a.x);
    const l2 = Math.max((bb.x - a.x) ** 2 + (bb.z - a.z) ** 2, (c.x - bb.x) ** 2 + (c.z - bb.z) ** 2, (a.x - c.x) ** 2 + (a.z - c.z) ** 2);
    if (cr * cr < 1e-6 * l2) {
      flat.push({ a, b: bb, c, mat, col });
      return;
    }
    if (depth >= MAX_DEPTH) {
      out.push({ a, b: bb, c, mat, col });
      return;
    }
    const d = depth + 1;
    // On the lattice the folds meet at its points: a triangle holding one that is off gets it as a
    // vertex first (splitting its edges near a point only ever closes in on it).
    if (grid) {
      const m = interior(a, bb, c);
      if (m) {
        refine(a, bb, m, mat, col, d);
        refine(bb, c, m, mat, col, d);
        refine(c, a, m, mat, col, d);
        return;
      }
    }
    const s0 = splitT(a, bb) >= 0, s1 = splitT(bb, c) >= 0, s2 = splitT(c, a) >= 0;
    const n = (s0 ? 1 : 0) + (s1 ? 1 : 0) + (s2 ? 1 : 0);
    if (n === 0) {
      const m = grid ? null : interior(a, bb, c);
      if (m) {
        refine(a, bb, m, mat, col, d);
        refine(bb, c, m, mat, col, d);
        refine(c, a, m, mat, col, d);
      } else out.push({ a, b: bb, c, mat, col });
      return;
    }
    // Rotate so the split edges come first: (A, B) always, and (B, C) when two are split.
    let A = a, B = bb, C = c, S0 = s0, S1 = s1, S2 = s2;
    for (let r = 0; r < 3 && !(S0 && (n !== 2 || S1)); r++) {
      [A, B, C] = [B, C, A];
      [S0, S1, S2] = [S1, S2, S0];
    }
    if (n === 3) {
      const mab = splitV(A, B), mbc = splitV(B, C), mca = splitV(C, A);
      refine(A, mab, mca, mat, col, d);
      refine(mab, B, mbc, mat, col, d);
      refine(mca, mbc, C, mat, col, d);
      refine(mab, mbc, mca, mat, col, d);
    } else if (n === 2) {
      const mab = splitV(A, B), mbc = splitV(B, C);
      refine(mab, B, mbc, mat, col, d);
      if (Math.hypot(mbc.x - A.x, mbc.z - A.z) <= Math.hypot(C.x - mab.x, C.z - mab.z)) {
        refine(A, mab, mbc, mat, col, d);
        refine(A, mbc, C, mat, col, d);
      } else {
        refine(A, mab, C, mat, col, d);
        refine(mab, mbc, C, mat, col, d);
      }
    } else {
      const mab = splitV(A, B);
      refine(A, mab, C, mat, col, d);
      refine(mab, B, C, mat, col, d);
    }
  };
  for (const t of sheet.tris) {
    // Skip triangles with no area in plan (a vertical strip): walls carry those.
    if (Math.abs((t.b.x - t.a.x) * (t.c.z - t.a.z) - (t.b.z - t.a.z) * (t.c.x - t.a.x)) < 1e-9) continue;
    refine(t.a, t.b, t.c, t.mat, t.col, 0);
  }
  const walls: SWall[] = [];
  const refineWall = (w: SWall, depth: number): void => {
    const t = depth < MAX_DEPTH ? splitT(w.p, w.q) : -1;
    if (t < 0) {
      walls.push(w);
      return;
    }
    const m = splitV(w.p, w.q);
    const tw = first(w.p, w.q) ? t : 1 - t;
    const tm = w.tp + (w.tq - w.tp) * tw;
    refineWall({ ...w, q: m, tq: tm }, depth + 1);
    refineWall({ ...w, p: m, tp: tm }, depth + 1);
  };
  for (const w of sheet.walls) refineWall(w, 0);

  // ---- 2. cut away what another surface covers; find the open edges
  const edgeUse = new Map<string, number>();
  for (const t of out.concat(flat)) {
    for (const k of [xzKey(t.a, t.b), xzKey(t.b, t.c), xzKey(t.c, t.a)]) edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
  }
  const seam = o.seam ?? null;
  const cut = o.cut ?? null;
  const open: OpenEdge[] = [];
  const outward = (u: SV, v: SV, cx: number, cz: number): [number, number] => {
    let nx = v.z - u.z, nz = -(v.x - u.x);
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    return nx * (cx - u.x) + nz * (cz - u.z) > 0 ? [-nx, -nz] : [nx, nz];
  };
  let kept: STri[] = out;
  if (cut) kept = [];
  for (const t of out) {
    const hit = cut ? cut(Math.min(t.a.x, t.b.x, t.c.x) - 0.01, Math.min(t.a.z, t.b.z, t.c.z) - 0.01, Math.max(t.a.x, t.b.x, t.c.x) + 0.01, Math.max(t.a.z, t.b.z, t.c.z) + 0.01) : null;
    if (!hit || !hit.length) {
      if (cut) kept.push(t);
      const cx = (t.a.x + t.b.x + t.c.x) / 3, cz = (t.a.z + t.b.z + t.c.z) / 3;
      for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as const) {
        if (edgeUse.get(xzKey(u, v)) !== 1 || seam?.(u, v)) continue;
        const [nx, nz] = outward(u, v, cx, cz);
        open.push({ u, v, nx, nz, mat: t.mat });
      }
      continue;
    }
    let pieces: SV[][] = [[t.a, t.b, t.c]];
    for (const c of hit) {
      const next: SV[][] = [];
      for (const P of pieces) subtractConv(P, c, next);
      pieces = next;
      if (!pieces.length) break;
    }
    const sides = [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as const;
    for (const P of pieces) {
      if (polyArea(P) < 1e-5) continue;
      for (let k = 1; k + 1 < P.length; k++) kept.push({ a: P[0], b: P[k], c: P[k + 1], mat: t.mat, col: t.col });
      let cx = 0, cz = 0;
      for (const v of P) {
        cx += v.x / P.length;
        cz += v.z / P.length;
      }
      for (let k = 0; k < P.length; k++) {
        const u = P[k], v = P[(k + 1) % P.length];
        if (Math.hypot(v.x - u.x, v.z - u.z) < 1e-6) continue;
        const [nx, nz] = outward(u, v, cx, cz);
        const side = sides.find(([p, q]) => onLine(u, p, q, 1e-4) && onLine(v, p, q, 1e-4));
        let isOpen: boolean;
        if (side && seam?.(side[0], side[1])) isOpen = false;
        else if (side && edgeUse.get(xzKey(side[0], side[1])) === 1) isOpen = true;
        else {
          // Beyond this edge: another piece of the sheet, or the place a winning surface took.
          const px = (u.x + v.x) / 2 + nx * 0.003, pz = (u.z + v.z) / 2 + nz * 0.003;
          isOpen = hit.some((c) => inConv(c, px, pz));
        }
        if (isOpen) open.push({ u, v, nx, nz, mat: t.mat });
      }
    }
  }
  let keptWalls = walls;
  if (cut) {
    keptWalls = [];
    for (const w of walls) {
      const hit = cut(Math.min(w.p.x, w.q.x) - 0.01, Math.min(w.p.z, w.q.z) - 0.01, Math.max(w.p.x, w.q.x) + 0.01, Math.max(w.p.z, w.q.z) + 0.01);
      if (!hit.length) {
        keptWalls.push(w);
        continue;
      }
      // The stretches of p → q outside every piece (Cyrus–Beck per piece).
      let spans: [number, number][] = [[0, 1]];
      const dx = w.q.x - w.p.x, dz = w.q.z - w.p.z;
      for (const c of hit) {
        const n = convNormals(c);
        let e0 = 0, e1 = 1;
        for (let i = 0; i < c.pts.length && e0 < e1; i++) {
          const nx = n[3 * i], nz = n[3 * i + 1];
          if (nx === 0 && nz === 0) continue;
          const s0 = nx * w.p.x + nz * w.p.z - n[3 * i + 2], ds = nx * dx + nz * dz;
          if (Math.abs(ds) < 1e-12) {
            if (s0 > 0) e1 = -1;
            continue;
          }
          const t = -s0 / ds;
          if (ds < 0) e0 = Math.max(e0, t);
          else e1 = Math.min(e1, t);
        }
        if (e1 - e0 < 1e-6) continue;
        const next: [number, number][] = [];
        for (const [a0, a1] of spans) {
          if (e1 <= a0 || e0 >= a1) next.push([a0, a1]);
          else {
            if (e0 > a0) next.push([a0, e0]);
            if (e1 < a1) next.push([e1, a1]);
          }
        }
        spans = next;
      }
      for (const [a0, a1] of spans) {
        if (a1 - a0 < 1e-4) continue;
        keptWalls.push({ ...w, p: lerpSV(w.p, w.q, a0), q: lerpSV(w.p, w.q, a1), tp: w.tp + (w.tq - w.tp) * a0, tq: w.tp + (w.tq - w.tp) * a1 });
      }
    }
  }

  // ---- 3. write: top (facing up), walls (facing their way), skirts on the open edges
  const byMat = new Map<MaterialId, number[]>();
  const arr = (m: MaterialId) => {
    let a = byMat.get(m);
    if (!a) byMat.set(m, (a = []));
    return a;
  };
  const rim = o.rim ?? null;
  const rimSet = rim !== null ? new Set<SV>() : null;
  if (rimSet) for (const e of open) rimSet.add(e.u).add(e.v);
  const Y = (v: SV) => v.h + (rimSet?.has(v) ? rim! : v.off);
  const colVerts: number[] = [];
  const colIdx: number[] = [];
  const colKey = new Map<string, number>();
  const cv = (x: number, y: number, z: number) => {
    const k = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
    let i = colKey.get(k);
    if (i === undefined) {
      colKey.set(k, (i = colVerts.length / 3));
      colVerts.push(x, y, z);
    }
    return i;
  };
  const colTri = (i0: number, i1: number, i2: number) => {
    if (i0 !== i1 && i1 !== i2 && i2 !== i0) colIdx.push(i0, i1, i2);
  };
  const collide = o.collide ?? true;
  let tris = 0, skirts = 0, maxDev = 0;
  for (const t of kept) {
    const ya = Y(t.a), yb = Y(t.b), yc = Y(t.c);
    const ny = (t.c.x - t.a.x) * (t.b.z - t.a.z) - (t.b.x - t.a.x) * (t.c.z - t.a.z);
    const [p1, p2] = ny >= 0 ? [t.b, t.c] : [t.c, t.b];
    const y1 = ny >= 0 ? yb : yc, y2 = ny >= 0 ? yc : yb;
    arr(t.mat).push(t.a.x, ya, t.a.z, p1.x, y1, p1.z, p2.x, y2, p2.z);
    tris++;
    if (collide && t.col) colTri(cv(t.a.x, ya, t.a.z), cv(p1.x, y1, p1.z), cv(p2.x, y2, p2.z));
    const cx = (t.a.x + t.b.x + t.c.x) / 3, cz = (t.a.z + t.b.z + t.c.z) / 3;
    maxDev = Math.max(maxDev, Math.abs(H(cx, cz) - (t.a.h + t.b.h + t.c.h) / 3));
    if (conformStats.check) {
      for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as const) {
        const dv = Math.abs(H((u.x + v.x) / 2, (u.z + v.z) / 2) - (u.h + v.h) / 2);
        if (dv > tol + 5e-4) {
          conformStats.over++;
          conformStats.overLen += Math.hypot(u.x - v.x, u.z - v.z);
        }
        maxDev = Math.max(maxDev, dv);
      }
    }
  }
  if (o.skirts !== false) {
    const skirtMin = o.skirtMin ?? SKIRT_MIN;
    for (const e of open) {
      const { u, v } = e;
      const yu = Y(u), yv = Y(v);
      const mx = (u.x + v.x) / 2, mz = (u.z + v.z) / 2;
      const hu = H(u.x, u.z), hv = H(v.x, v.z), hm = H(mx, mz);
      if (Math.max(yu - hu, yv - hv, (yu + yv) / 2 - hm) <= skirtMin && !o.skirtAlways?.(mx, mz)) continue;
      const g = Math.min(hu, hv, hm) - SKIRT_DEPTH;
      if (yu <= g && yv <= g) continue;
      quadFacing(arr(e.mat), u.x, u.z, v.x, v.z, g, g, yu, yv, e.nx, e.nz);
      skirts += 2;
    }
  }
  for (const w of keptWalls) {
    const yp = Y(w.p), yq = Y(w.q), tp = w.p.h + w.tp, tq = w.q.h + w.tq;
    quadFacing(arr(w.mat), w.p.x, w.p.z, w.q.x, w.q.z, yp, yq, tp, tq, w.nx, w.nz);
    tris += 2;
    if (collide && w.col) {
      const a = cv(w.p.x, yp, w.p.z), bq = cv(w.q.x, yq, w.q.z), c = cv(w.q.x, tq, w.q.z), dd = cv(w.p.x, tp, w.p.z);
      colTri(a, bq, c);
      colTri(a, c, dd);
    }
  }
  for (const [mat, a] of byMat) addTris(b, mat, a);
  if (colIdx.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(colVerts, 3));
    g.setIndex(colIdx);
    b.collider({ kind: 'trimesh', geometry: g });
  }
  conformStats.sheets++;
  conformStats.input += sheet.tris.length;
  conformStats.refined += out.length;
  conformStats.kept += kept.length;
  conformStats.skirts += skirts;
  conformStats.walls += keptWalls.length;
  conformStats.ms += performance.now() - t0;
  conformStats.maxDev = Math.max(conformStats.maxDev, maxDev);
  return { tris: tris + skirts, skirts, maxDev };
}

/** A vertical quad over the plan segment p → q, from (bp, bq) up to (tp, tq), facing (nx, nz). */
function quadFacing(arr: number[], px: number, pz: number, qx: number, qz: number, bp: number, bq: number, tp: number, tq: number, nx: number, nz: number) {
  // (p_b, q_b, q_t) faces left of p → q seen from above when the cross product's plan part points that way.
  const ex = qx - px, ez = qz - pz;
  // Normal of (p_b → q_b) × (p_b → q_t) in plan: (ez·Δy, −ex·Δy)-ish; test with the right normal (ez, −ex).
  const right = ez * nx - ex * nz >= 0;
  if (right) arr.push(px, bp, pz, qx, tq, qz, qx, bq, qz, px, bp, pz, px, tp, pz, qx, tq, qz);
  else arr.push(px, bp, pz, qx, bq, qz, qx, tq, qz, px, bp, pz, qx, tq, qz, px, tp, pz);
}

/**
 * A paved polygon (convex: the city's junction squares and piazzas) laid on the ground as a sheet:
 * a fan from its centre, a walkable bevel out to the ground on the edges that meet it (not where
 * another paved surface goes on), skirts under the open edges, cut where a surface that wins lies.
 */
export interface ConformPlazaOpts extends ConformOpts {
  material?: MaterialId;
  lift?: number;
  /** Width of the bevel (default 0.45 m); its outer edge stands APRON_FLUSH above the ground. */
  bevel?: number;
  /** The bevel joins the collider (default true). */
  bevelCollide?: boolean;
  /** Other paving beside an edge (no bevel there). */
  paved?: ((x: number, z: number) => boolean) | null;
}

export function buildConformPlaza(b: MeshBuilder, poly: Polygon, heightAt: HeightFn, o: ConformPlazaOpts = {}): SheetStats {
  const mat = o.material ?? 'paving_travertine';
  const lift = o.lift ?? 0.07;
  const w = o.bevel ?? 0.45;
  const sheet = new Sheet(heightAt);
  const n = poly.length;
  let cx = 0, cz = 0;
  for (const p of poly) {
    cx += p[0] / n;
    cz += p[1] / n;
  }
  const c = sheet.v(cx, cz, lift);
  const rim = poly.map((p) => sheet.v(p[0], p[1], lift));
  for (let i = 0; i < n; i++) sheet.tri(c, rim[i], rim[(i + 1) % n], mat);
  // Bevels on the edges that meet the ground, and wedges between two bevels.
  const open = (x: number, z: number) => !(o.paved?.(x, z) || inCut(o.cut, x, z));
  const outer: (SV | null)[][] = rim.map(() => [null, null]);
  for (let i = 0; i < n; i++) {
    const a = rim[i], e = rim[(i + 1) % n];
    const L = Math.hypot(e.x - a.x, e.z - a.z);
    if (L < 1e-6) continue;
    let nx = (e.z - a.z) / L, nz = -(e.x - a.x) / L;
    if (nx * (cx - a.x) + nz * (cz - a.z) > 0) {
      nx = -nx;
      nz = -nz;
    }
    const mx = (a.x + e.x) / 2, mz = (a.z + e.z) / 2;
    if (!open(mx + nx * (w * 0.5 + 0.1), mz + nz * (w * 0.5 + 0.1))) continue;
    const a2 = sheet.v(a.x + nx * w, a.z + nz * w, APRON_FLUSH), e2 = sheet.v(e.x + nx * w, e.z + nz * w, APRON_FLUSH);
    const col = o.bevelCollide ?? true;
    sheet.tri(a, a2, e2, mat, col);
    sheet.tri(a, e2, e, mat, col);
    outer[i][1] = a2;
    outer[(i + 1) % n][0] = e2;
  }
  for (let i = 0; i < n; i++) {
    const [p, q] = outer[i];
    if (p && q) sheet.tri(rim[i], p, q, mat, o.bevelCollide ?? true);
  }
  return emitSheet(b, sheet, o);
}

// ------------------------------------------------------------------ plazas

/** Sutherland–Hodgman: clip `subject` (any simple polygon) to an axis-aligned cell. */
function clipToCell(subject: Polygon, x0: number, z0: number, x1: number, z1: number): Polygon {
  let out = subject;
  const edges: [(p: Vec2) => boolean, (a: Vec2, b: Vec2) => Vec2][] = [
    [(p) => p[0] >= x0, (a, c) => [x0, a[1] + ((c[1] - a[1]) * (x0 - a[0])) / (c[0] - a[0])]],
    [(p) => p[0] <= x1, (a, c) => [x1, a[1] + ((c[1] - a[1]) * (x1 - a[0])) / (c[0] - a[0])]],
    [(p) => p[1] >= z0, (a, c) => [a[0] + ((c[0] - a[0]) * (z0 - a[1])) / (c[1] - a[1]), z0]],
    [(p) => p[1] <= z1, (a, c) => [a[0] + ((c[0] - a[0]) * (z1 - a[1])) / (c[1] - a[1]), z1]],
  ];
  for (const [inside, cut] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i], prev = input[(i + input.length - 1) % input.length];
      const ci = inside(cur), pi = inside(prev);
      if (ci) {
        if (!pi) out.push(cut(prev, cur));
        out.push(cur);
      } else if (pi) out.push(cut(prev, cur));
    }
    if (!out.length) break;
  }
  return out;
}

export interface PlazaOpts {
  material?: MaterialId;
  lift?: number;
  cell?: number;
  /** Vertical skirt depth around the edge (hides gaps against the terrain). */
  skirt?: number;
  collide?: boolean;
  /** Also collide with the sloped bevel round the edge, so one walks on and off without a lip (default false: only the city's own plazas ask; landmark builders keep their old colliders). */
  bevelCollide?: boolean;
  /** Holes: areas left unpaved (landmark footprints and other `avoid` areas). Any simple polygons. */
  exclude?: Polygon[];
}

/** A paved (or yard) surface over an arbitrary polygon (minus `exclude` holes), draped on the terrain. */
export function buildPlaza(b: MeshBuilder, poly: Polygon, heightAt: HeightFn, o: PlazaOpts = {}) {
  const mat = o.material ?? 'paving_travertine';
  const lift = o.lift ?? 0.07;
  const cell = o.cell ?? 2.5;
  const holes = (o.exclude ?? []).filter((h) => h.length >= 3);
  const holeBounds = holes.map((h) => polygonBounds(h));
  const { minX, minZ, maxX, maxZ } = polygonBounds(poly);
  const arr: number[] = [];
  const v = (x: number, z: number) => [x, heightAt(x, z) + lift, z];
  const inHole = (p: Vec2) => holes.some((h) => pointInPolygon(p, h));
  for (let x = minX; x < maxX - 1e-6; x += cell)
    for (let z = minZ; z < maxZ - 1e-6; z += cell) {
      const x1 = Math.min(maxX, x + cell), z1 = Math.min(maxZ, z + cell);
      const corners: Vec2[] = [[x, z], [x1, z], [x1, z1], [x, z1]];
      let piece: Polygon;
      if (corners.every((c) => pointInPolygon(c, poly))) piece = corners;
      else piece = clipToCell(poly, x, z, x1, z1);
      if (piece.length < 3) continue;
      // Cut out the holes that touch this cell.
      const near = holes.filter((_, i) => holeBounds[i].maxX > x && holeBounds[i].minX < x1 && holeBounds[i].maxZ > z && holeBounds[i].minZ < z1);
      const pieces = near.length ? subtractPolygons(piece, near) : [piece];
      for (const pc of pieces) {
        if (pc.length < 3) continue;
        const tris = THREE.ShapeUtils.triangulateShape(pc.map((p) => new THREE.Vector2(p[0], p[1])), []);
        for (const t of tris) {
          // Up-facing winding in (x, z): reverse of the 2D CCW order.
          const [a, bb, c] = [pc[t[0]], pc[t[1]], pc[t[2]]];
          const cross = (bb[0] - a[0]) * (c[1] - a[1]) - (bb[1] - a[1]) * (c[0] - a[0]);
          const seq = cross > 0 ? [a, c, bb] : [a, bb, c];
          for (const p of seq) arr.push(...v(p[0], p[1]));
        }
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  g.computeVertexNormals();
  b.add(g, mat, undefined, { castShadow: castsShadow(mat) });
  // Skirt along the outline and around the holes, facing away from the paved surface.
  const skirt = o.skirt ?? 0.4;
  let bevelCol: THREE.BufferGeometry | null = null;
  if (skirt > 0) {
    const s: number[] = [];
    // The bevel is walkable (a paving 7-12 cm proud of the ground was a lip to catch on): it joins the collider.
    const cs: number[] = [];
    const paved = (p: Vec2) => pointInPolygon(p, poly) && !inHole(p);
    const ring = (pts: Polygon, bevel: boolean) => {
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], c = pts[(i + 1) % pts.length];
        const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (len < 1e-6) continue;
        const k = Math.max(1, Math.ceil(len / cell));
        const nx = (c[1] - a[1]) / len, nz = -(c[0] - a[0]) / len; // right normal
        for (let j = 0; j < k; j++) {
          const p0: Vec2 = [a[0] + ((c[0] - a[0]) * j) / k, a[1] + ((c[1] - a[1]) * j) / k];
          const p1: Vec2 = [a[0] + ((c[0] - a[0]) * (j + 1)) / k, a[1] + ((c[1] - a[1]) * (j + 1)) / k];
          const m: Vec2 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
          // Only where paving lies on exactly one side (skips outline stretches inside a hole).
          const right = paved([m[0] + nx * 0.05, m[1] + nz * 0.05]), left = paved([m[0] - nx * 0.05, m[1] - nz * 0.05]);
          if (right === left) continue;
          const t0 = v(p0[0], p0[1]), t1 = v(p1[0], p1[1]);
          // A bevel out and down into the ground on the unpaved side (a vertical skirt left the
          // paving's edge standing proud of the ground like a loose slab).
          // (Around holes the skirt stays vertical: nothing may reach into a hole.)
          const k2 = bevel ? skirt * 1.4 : 0;
          const ox = (right ? -nx : nx) * k2, oz = (right ? -nz : nz) * k2;
          const b0 = [t0[0] + ox, bevel ? heightAt(t0[0] + ox, t0[2] + oz) - 0.1 : t0[1] - skirt, t0[2] + oz];
          const b1 = [t1[0] + ox, bevel ? heightAt(t1[0] + ox, t1[2] + oz) - 0.1 : t1[1] - skirt, t1[2] + oz];
          // Face the unpaved side: (t0, b0, t1) faces left of p0→p1, (t0, t1, b0) faces right.
          if (left) s.push(...t0, ...t1, ...b0, ...t1, ...b1, ...b0);
          else s.push(...t0, ...b0, ...t1, ...t1, ...b0, ...b1);
          if (bevel && o.bevelCollide) cs.push(...t0, ...b0, ...t1, ...t1, ...b0, ...b1);
        }
      }
    };
    ring(poly, true);
    for (const h of holes) ring(ensurePositive(h), false);
    if (s.length) {
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(s, 3));
      sg.computeVertexNormals();
      b.add(sg, mat, undefined, { castShadow: castsShadow(mat) });
    }
    if (cs.length) {
      bevelCol = new THREE.BufferGeometry();
      bevelCol.setAttribute('position', new THREE.Float32BufferAttribute(cs, 3));
    }
  }
  if (o.collide ?? true) {
    b.collider({ kind: 'trimesh', geometry: g });
    if (bevelCol) b.collider({ kind: 'trimesh', geometry: bevelCol });
  }
}

// ------------------------------------------------------------------ stairs

export interface StairOpts {
  material?: MaterialId;
  riser?: number;
  /** Low side walls (parapets) along the flight. */
  parapet?: MaterialId | null;
}

/** A straight flight of steps from `a` to `c` (ground points), `width` wide, with a smooth ramp collider. */
export function buildStairs(b: MeshBuilder, a: Vec2, c: Vec2, width: number, heightAt: HeightFn, o: StairOpts = {}) {
  const mat = o.material ?? 'travertine';
  const ya = heightAt(a[0], a[1]), yc = heightAt(c[0], c[1]);
  const dx = c[0] - a[0], dz = c[1] - a[1];
  const run = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(Math.abs(yc - ya) / (o.riser ?? 0.17)));
  const yaw = Math.atan2(dx, dz);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const base = Math.min(ya, yc) - 0.4;
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const top = ya + (yc - ya) * (yc > ya ? t1 : t0) + 0.02;
    const mid = (t0 + t1) / 2;
    const cx = a[0] + dx * mid, cz = a[1] + dz * mid;
    const h = top - base;
    b.add(box, mat, new THREE.Matrix4().compose(new THREE.Vector3(cx, base + h / 2, cz), q, new THREE.Vector3(width, h, run / n + 0.01)));
  }
  if (o.parapet !== null) {
    const pm = o.parapet ?? 'tufa';
    for (const s of [-1, 1]) {
      const ox = Math.cos(yaw) * (width / 2 + 0.15) * s, oz = -Math.sin(yaw) * (width / 2 + 0.15) * s;
      for (let i = 0; i < n; i++) {
        const mid = (i + 0.5) / n;
        const top = ya + (yc - ya) * mid + 0.9;
        const cx = a[0] + dx * mid + ox, cz = a[1] + dz * mid + oz;
        b.add(box, pm, new THREE.Matrix4().compose(new THREE.Vector3(cx, (top + base) / 2, cz), q, new THREE.Vector3(0.3, top - base, run / n + 0.01)));
      }
      // Pitched with the flight, its top 0.9 m over the treads like the drawn parapet (an upright box
      // reached the high end's top at the low end too: an invisible wall).
      const pitch = Math.atan2(yc - ya, run);
      const pq = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pitch));
      const pu = new THREE.Vector3(0, 1, 0).applyQuaternion(pq);
      const pc = new THREE.Vector3(a[0] + dx / 2 + ox, (ya + yc) / 2, a[1] + dz / 2 + oz).addScaledVector(pu, 0.9 * Math.cos(pitch) - 0.65);
      b.collider({ kind: 'box', center: pc, half: new THREE.Vector3(0.15, 0.65, Math.hypot(run, yc - ya) / 2), rotation: pq });
    }
  }
  // Ramp collider whose top passes through the step noses.
  const pitch = Math.atan2(yc - ya, run);
  const rq = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pitch));
  const thick = 0.3;
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rq);
  const center = new THREE.Vector3(a[0] + dx / 2, (ya + yc) / 2 + 0.02, a[1] + dz / 2).addScaledVector(up, -thick / 2);
  b.collider({ kind: 'box', center, half: new THREE.Vector3(width / 2, thick / 2, Math.hypot(run, yc - ya) / 2), rotation: rq });
}
