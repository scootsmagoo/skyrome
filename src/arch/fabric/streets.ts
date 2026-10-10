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
const APRON = 0.9;
const LANE_APRON = 0.6;
/** An apron ends this far (m) above the ground, not under it or flush: ground within 2 cm of the paving is a flaw the crawl counts (a lip of 2 cm rides over). */
const APRON_FLUSH = 0.022;

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
    push(-hw * 0.5, 0.045, roadMat, 'up');
    push(0, 0.07, roadMat, 'up');
    push(hw * 0.5, 0.045, roadMat, 'up');
    push(hw, 0, roadMat, 'up');
    push(hw, ch, curbMat, 'in');
    push(hw + cw, ch, curbMat, 'up');
    push(hw + sw, ch, sideMat, 'up');
    push(hw + sw + APRON, -lift + APRON_FLUSH, 'concrete', 'up');
  } else {
    // A lane's edges run out to the ground in a walkable apron too (the old 5 cm edge was a step of the lane's lift).
    push(-hw - LANE_APRON, -lift + APRON_FLUSH);
    push(-hw, 0.0, roadMat, 'up');
    push(0, 0.05, roadMat, 'up');
    push(hw, 0.0, roadMat, 'up');
    push(hw + LANE_APRON, -lift + APRON_FLUSH, roadMat, 'up');
  }

  const pts = resamplePolyline(spec.points, 1.6);
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
  const RAMP = 1.6;
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

  const left = pts.map((p, i) => [p[0] + nor[i][0] * (-hw - sw) * miter[i], p[1] + nor[i][1] * (-hw - sw) * miter[i]] as Vec2);
  const right = pts.map((p, i) => [p[0] + nor[i][0] * (hw + sw) * miter[i], p[1] + nor[i][1] * (hw + sw) * miter[i]] as Vec2);
  return { length, left, right };
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
          if (bevel) cs.push(...t0, ...b0, ...t1, ...t1, ...b0, ...b1);
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
      const cx = a[0] + dx / 2 + ox, cz = a[1] + dz / 2 + oz;
      b.collider({ kind: 'box', center: new THREE.Vector3(cx, (ya + yc) / 2 + 0.5, cz), half: new THREE.Vector3(0.15, Math.abs(yc - ya) / 2 + 1, run / 2), rotation: q.clone() });
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
