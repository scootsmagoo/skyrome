/**
 * Building blocks shared by the Trajanic landmark builders that the classical kit does not
 * provide (kept local to this crew; candidates for upstreaming into src/arch/):
 *
 *  - `LodChunks`: splits a big landmark into cells, each a THREE.LOD with a near and a far
 *    MeshBuilder, so long colonnades and statue rows only cost full triangles near the camera.
 *  - `midColumn()`: an unfluted coloured-marble column at ~1.3k triangles (the kit's 'high'
 *    Corinthian is ~6k, its 'low' ~0.7k): Attic base, entasis shaft, a two-row acanthus capital
 *    with corner volutes and a concave abacus. It accepts THREE.Material shafts (granite, cipollino).
 *  - `colonnadeColumn()`: picks kit-high / mid / kit-low.
 *  - small helpers: oriented box colliders, quads, arcs.
 */
import * as THREE from 'three';
import { column } from '../../../arch/classical/column';
import { columnDims, entasisRadius, ORDER_PROPORTIONS, type Order } from '../../../arch/classical/orders';
import { ProfileBuilder, cylinderBetween, extrudePolygon, gridSurface, lathe, linspace, mul, T, tube, type V2 } from '../../../arch/common/geom';
import { MeshBuilder, type ColliderSpec } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import { UV_METERS } from '../../../gfx/textures/catalog';

/** A library material id or a one-off shared material. */
export type Mat = MaterialId | THREE.Material;

// ---------------------------------------------------------------- LOD chunks

export interface Chunk {
  near: MeshBuilder;
  far: MeshBuilder;
  /** Chunk centre in the landmark's local frame (LOD distance is measured from here). */
  center: THREE.Vector3;
}

/**
 * Cells of near/far geometry. Colliders always come from the near builders (they are the same
 * for both levels), and are copied into the landmark's collider list by `build()`.
 */
export class LodChunks {
  readonly chunks = new Map<string, Chunk>();
  constructor(
    /** Camera distance (m) at which a chunk switches to its far level. */
    readonly distance: number,
    /** Optional distance at which the far level disappears too (0 = never). */
    readonly hideBeyond = 0,
    /** Interiors under a roof gain nothing from casting sun shadows: pass false to skip them. */
    readonly castShadow = true,
  ) {}

  chunk(key: string, center: THREE.Vector3): Chunk {
    let c = this.chunks.get(key);
    if (!c) {
      c = { near: new MeshBuilder(), far: new MeshBuilder(), center: center.clone() };
      this.chunks.set(key, c);
    }
    return c;
  }

  /** One THREE.LOD per chunk; returns the group and appends the colliders to `colliders`. */
  build(name: string, colliders: ColliderSpec[]): THREE.Group {
    const g = new THREE.Group();
    g.name = name;
    for (const [key, c] of this.chunks) {
      const lod = new THREE.LOD();
      lod.name = `${name}:${key}`;
      lod.position.copy(c.center);
      const near = recentre(c.near.build(`${name}:${key}:near`), c.center);
      lod.addLevel(near, 0, 0.08);
      if (!c.far.isEmpty) lod.addLevel(recentre(c.far.build(`${name}:${key}:far`), c.center), this.distance, 0.08);
      else lod.addLevel(new THREE.Group(), this.distance, 0.08);
      if (this.hideBeyond > 0) lod.addLevel(new THREE.Group(), this.hideBeyond, 0.05);
      if (!this.castShadow) lod.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = false) : undefined));
      g.add(lod);
      for (const s of c.near.colliders) colliders.push(s);
    }
    return g;
  }
}

/**
 * Re-origin a built group on `center` (the LOD sits there, so its distance test is measured from
 * the chunk). The group is offset rather than its geometry translated: instanced parts (the kit's
 * columns) share one geometry across the whole program and must never be modified in place.
 */
function recentre(group: THREE.Group, c: THREE.Vector3): THREE.Group {
  group.position.set(-c.x, -c.y, -c.z);
  return group;
}

// ---------------------------------------------------------------- colliders & small geometry

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/**
 * Box collider of full size (w, h, d) centred at local (x, y, z) of matrix `m` (no geometry).
 * Degenerate or negative sizes (a clipped strip that came out empty) build nothing: Rapier must
 * never see a negative half-extent.
 */
export function solidBox(b: MeshBuilder, m: THREE.Matrix4, x: number, y: number, z: number, w: number, h: number, d: number) {
  if (!(w > 0.01 && h > 0.01 && d > 0.01)) return;
  mul(m, T(x, y, z)).decompose(_p, _q, _s);
  b.collider({ kind: 'box', center: _p.clone(), half: new THREE.Vector3(w / 2, h / 2, d / 2), rotation: _q.clone() });
}

/**
 * Solid annular sector (a floor deck over a curved plan) as oriented boxes, one per angular step
 * of at most `seg` metres of arc at the outer radius. Each box spans the full chord at r1, so the
 * outer rim is covered exactly; the inner corners miss r0·(1 − cos(step/2)) (millimetres at these
 * steps) and the boxes overshoot the end angles by (r1 − r0)·sin(step/2) at the inner radius.
 */
export function arcSlab(b: MeshBuilder, m: THREE.Matrix4, cx: number, cz: number, r0: number, r1: number, a0: number, a1: number, y0: number, y1: number, seg = 0.8) {
  const n = Math.max(1, Math.ceil((Math.abs(a1 - a0) * r1) / seg));
  const half = Math.abs(a1 - a0) / n / 2;
  for (let i = 0; i < n; i++) {
    const am = a0 + ((a1 - a0) * (i + 0.5)) / n;
    const rm = (r0 + r1) / 2;
    // Frame with +z running radially out at angle am (the same convention as arcColliders).
    const local = new THREE.Matrix4().makeRotationY(-am + Math.PI / 2).setPosition(cx + Math.cos(am) * rm, (y0 + y1) / 2, cz + Math.sin(am) * rm);
    solidBox(b, mul(m, local), 0, 0, 0, 2 * r1 * Math.sin(half) + 0.02, y1 - y0, r1 - r0);
  }
}

/**
 * Floor colliders for a half-disc of radius R (centre (cx, cz), opening along z, bulging towards
 * `side`·x) as strips along z no wider than `w`. Each strip reaches the circle at its NEAR edge
 * (the larger chord), so the disc is covered to the curve; the far corner overshoots the circle by
 * less than `w`, which stays inside a wall thicker than that. `back` extends every strip behind the
 * diameter (under the opening, to meet the floor in front).
 */
export function halfDiscFloor(b: MeshBuilder, m: THREE.Matrix4, cx: number, cz: number, R: number, side: -1 | 1, yBottom: number, yTop: number, back: number, w = 0.8) {
  const n = Math.max(2, Math.ceil((2 * R) / w));
  const dz = (2 * R) / n;
  for (let k = 0; k < n; k++) {
    const zA = cz - R + k * dz;
    const zB = zA + dz;
    const near = zA <= cz && zB >= cz ? 0 : Math.min(Math.abs(zA - cz), Math.abs(zB - cz));
    const reach = Math.max(0.1, Math.sqrt(Math.max(0, R * R - near * near)));
    solidBox(b, m, cx + (side * (reach - back)) / 2, (yBottom + yTop) / 2, (zA + zB) / 2, reach + back, yTop - yBottom, dz + 0.01);
  }
}

/** Cylinder collider (vertical) at local (x, y, z) of `m`. */
export function solidCyl(b: MeshBuilder, m: THREE.Matrix4, x: number, y: number, z: number, r: number, h: number) {
  const c = new THREE.Vector3(x, y, z).applyMatrix4(m);
  b.collider({ kind: 'cylinder', center: c, halfHeight: h / 2, radius: r });
}

/** Box from min/max corners in the frame `m`. */
export function boxMinMax(b: MeshBuilder, mat: Mat, m: THREE.Matrix4, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, opts: { collide?: boolean; castShadow?: boolean; uvScale?: number } = {}) {
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  const d = Math.abs(z1 - z0);
  if (w < 1e-4 || h < 1e-4 || d < 1e-4) return;
  b.box(mat, w, h, d, mul(m, T((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)), opts);
}

/** A flat quad with explicit corners (a→b→c→d counter-clockwise seen from the front) and 0..1 UVs (or world UVs). */
export function quad(b: MeshBuilder, mat: Mat, m: THREE.Matrix4, a: THREE.Vector3, bb: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, uv: 'unit' | 'world' = 'world', castShadow = true) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([a, bb, c, a, c, d].flatMap((p) => [p.x, p.y, p.z]), 3));
  g.computeVertexNormals();
  if (uv === 'unit') {
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    b.add(g, mat, m, { uv: 'keep', castShadow });
  } else {
    b.add(g, mat, m, { castShadow });
  }
}

/**
 * Convex polygon (fan from the first point) wound so its face normal points along `toward`
 * (e.g. up for roofs, outward for gables). World-scale box UVs unless `uvs` are given.
 */
export function facing(b: MeshBuilder, mat: Mat, m: THREE.Matrix4, pts: THREE.Vector3[], toward: THREE.Vector3, opts: { castShadow?: boolean; uvs?: [number, number][] } = {}) {
  const n = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[2], pts[0]));
  const flip = n.dot(toward) < 0;
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const tri = flip ? [0, i + 1, i] : [0, i, i + 1];
    for (const k of tri) {
      pos.push(pts[k].x, pts[k].y, pts[k].z);
      if (opts.uvs) uv.push(...opts.uvs[k]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (opts.uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  b.add(g, mat, m, { uv: opts.uvs ? 'keep' : 'box', castShadow: opts.castShadow });
}

export const UP = new THREE.Vector3(0, 1, 0);

/** Vertical arc band (annular sector wall) centred on (cx, cz), angles measured from +x towards +z. */
export function arcWall(b: MeshBuilder, mat: Mat, m: THREE.Matrix4, cx: number, cz: number, r0: number, r1: number, a0: number, a1: number, y0: number, y1: number, segs: number, opts: { castShadow?: boolean } = {}) {
  const pts: V2[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs;
    pts.push([cx + Math.cos(a) * r1, cz + Math.sin(a) * r1]);
  }
  for (let i = segs; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / segs;
    pts.push([cx + Math.cos(a) * r0, cz + Math.sin(a) * r0]);
  }
  // extrudePolygon works in XY extruding along −Z; map (x, z) → (x, −z) and rotate −Z → +Y.
  const g = extrudePolygon(
    pts.map(([x, z]) => [x, -z] as V2),
    y1 - y0,
  );
  g.rotateX(-Math.PI / 2);
  g.translate(0, y1, 0);
  b.add(g, mat, m, { castShadow: opts.castShadow });
}

/** Box colliders approximating an arc wall (one per `n` segments). */
export function arcColliders(b: MeshBuilder, m: THREE.Matrix4, cx: number, cz: number, r0: number, r1: number, a0: number, a1: number, y0: number, y1: number, n: number) {
  const rm = (r0 + r1) / 2;
  const t = r1 - r0;
  for (let i = 0; i < n; i++) {
    const aa = a0 + ((a1 - a0) * i) / n;
    const ab = a0 + ((a1 - a0) * (i + 1)) / n;
    const am = (aa + ab) / 2;
    const len = 2 * rm * Math.sin(Math.abs(ab - aa) / 2) + t * 0.6;
    const local = new THREE.Matrix4().makeRotationY(-am + Math.PI / 2).setPosition(cx + Math.cos(am) * rm, (y0 + y1) / 2, cz + Math.sin(am) * rm);
    mul(m, local).decompose(_p, _q, _s);
    b.collider({ kind: 'box', center: _p.clone(), half: new THREE.Vector3(len / 2, (y1 - y0) / 2, t / 2), rotation: _q.clone() });
  }
}

/** Horizontal annular sector (floor/paving ring) at height y, facing up. */
export function arcFloor(b: MeshBuilder, mat: Mat, m: THREE.Matrix4, cx: number, cz: number, r0: number, r1: number, a0: number, a1: number, y: number, segs: number, thickness = 0.1, opts: { castShadow?: boolean } = {}) {
  arcWall(b, mat, m, cx, cz, r0, r1, a0, a1, y - thickness, y, segs, opts);
}

/**
 * Conical roof over a circular sector (angles a0 → a1 from +x towards +z): eaves at radius `r` and
 * height `y0`, apex over the centre at `apexY`. Every facet faces up; UVs run in metres (/UV_METERS)
 * along the eaves (u) and down the slope (v), so tile textures keep their real size.
 */
export function coneRoof(b: MeshBuilder, mat: Mat, m: THREE.Matrix4, cx: number, cz: number, r: number, a0: number, a1: number, y0: number, apexY: number, segs: number, opts: { castShadow?: boolean } = {}) {
  const apex = new THREE.Vector3(cx, apexY, cz);
  const slope = Math.hypot(r, apexY - y0) / UV_METERS;
  const pos: number[] = [];
  const uv: number[] = [];
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  for (let i = 0; i < segs; i++) {
    const aa = a0 + ((a1 - a0) * i) / segs;
    const ab = a0 + ((a1 - a0) * (i + 1)) / segs;
    pa.set(cx + Math.cos(aa) * r, y0, cz + Math.sin(aa) * r);
    pb.set(cx + Math.cos(ab) * r, y0, cz + Math.sin(ab) * r);
    const u0 = (Math.abs(aa - a0) * r) / UV_METERS;
    const u1 = (Math.abs(ab - a0) * r) / UV_METERS;
    const up = e1.subVectors(pa, apex).cross(e2.subVectors(pb, apex)).y > 0;
    const [p, q, uq, up2] = up ? [pa, pb, u0, u1] : [pb, pa, u1, u0];
    pos.push(apex.x, apex.y, apex.z, p.x, p.y, p.z, q.x, q.y, q.z);
    uv.push((u0 + u1) / 2, 0, uq, slope, up2, slope);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  b.add(g, mat, m, { uv: 'keep', castShadow: opts.castShadow });
}

/**
 * Hipped tile roof over a w × d rectangle centred on (cx, cz), wall plate at height y. Every facet
 * is one planar polygon with its own UVs (u along its eave, v up its slope, in metres/UV_METERS),
 * so the tile rows run true on all four faces and nothing is wrapped round the hips; the hips and
 * the ridge get plain terracotta cap beams, the overhang a timber underside and fascia.
 */
export function hipRoof(b: MeshBuilder, m: THREE.Matrix4, cx: number, cz: number, w: number, d: number, y: number, pitch: number, overhang = 0.5, mat: Mat = 'roof_tile') {
  const tp = Math.tan(pitch);
  const hw = w / 2 + overhang;
  const hd = d / 2 + overhang;
  const ye = y - overhang * tp;
  const h = y + (Math.min(w, d) / 2) * tp;
  const rx = Math.max(0, hw - hd);
  const rz = Math.max(0, hd - hw);
  const P = (x: number, yy: number, z: number) => new THREE.Vector3(cx + x, yy, cz + z);
  const O = [P(-hw, ye, -hd), P(hw, ye, -hd), P(hw, ye, hd), P(-hw, ye, hd)];
  const R = [P(-rx, h, -rz), P(rx, h, -rz), P(rx, h, rz), P(-rx, h, rz)];
  const T = 0.12;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const pts: THREE.Vector3[] = [];
    for (const p of [O[i], O[j], R[j], R[i]]) if (!pts.some((q) => q.distanceToSquared(p) < 1e-8)) pts.push(p);
    if (pts.length < 3) continue;
    const e = new THREE.Vector3().subVectors(O[j], O[i]).normalize();
    const n = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[2], pts[0])).normalize();
    if (n.y < 0) n.negate();
    const up = new THREE.Vector3().crossVectors(n, e).normalize();
    if (up.y < 0) up.negate();
    const uvs = pts.map((p): [number, number] => {
      const q = new THREE.Vector3().subVectors(p, O[i]);
      return [q.dot(e) / UV_METERS, q.dot(up) / UV_METERS];
    });
    facing(b, mat, m, pts, UP, { uvs });
    facing(b, 'wood_dark', m, pts.map((p) => p.clone().setY(p.y - T)), new THREE.Vector3(0, -1, 0), { castShadow: false });
    // Fascia along the eave.
    quad(b, 'wood_dark', m, O[j].clone().setY(ye - T), O[i].clone().setY(ye - T), O[i], O[j], 'world', false);
  }
  for (let i = 0; i < 4; i++) beam(b, 'terracotta', m, O[i].clone().setY(O[i].y + 0.04), R[i].clone().setY(R[i].y + 0.04), 0.22, 0.12, { castShadow: false });
  if (rx > 0 || rz > 0) beam(b, 'terracotta', m, R[0].clone().setY(h + 0.05), R[2].clone().setY(h + 0.05), 0.24, 0.14, { castShadow: false });
  return h;
}

/** A rectangular beam of section w × h from `a` to `b` (its h axis kept as close to world up as possible). */
export function beam(bld: MeshBuilder, mat: Mat, m: THREE.Matrix4, a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, opts: { castShadow?: boolean } = {}) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 1e-4) return;
  dir.divideScalar(len);
  const side = new THREE.Vector3().crossVectors(dir, UP);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  const up = new THREE.Vector3().crossVectors(side, dir).normalize();
  const basis = new THREE.Matrix4().makeBasis(side, up, dir.clone().negate());
  basis.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  bld.box(mat, w, h, len, mul(m, basis), { castShadow: opts.castShadow });
}

// ---------------------------------------------------------------- columns

export interface MidColumnSpec {
  order: Order;
  D: number;
  height: number;
  shaft: Mat;
  trim?: Mat;
  plinth?: boolean;
  collide?: boolean;
}

interface MidParts {
  shaft: THREE.BufferGeometry[];
  trim: THREE.BufferGeometry[];
}

const midCache = new Map<string, MidParts>();

/** The two leaf rows, volutes and abacus of a Corinthian capital at modest resolution. */
function midCapital(D: number, d: number, C: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const r1 = d / 2;
  const abH = C / 7;
  const bellH = C - abH;
  const rTop = 0.56 * D;
  const bellR = (y: number) => r1 + (rTop - r1) * Math.min(1, Math.max(0, y / bellH)) ** 1.8;
  const bell = new ProfileBuilder(r1 * 0.98, 0).to(bellR(0.5 * bellH), 0.5 * bellH).to(bellR(0.95 * bellH), 0.95 * bellH).out(0.025 * D).up(0.05 * bellH).in(0.025 * D + rTop * 0.4).build();
  out.push(lathe(bell, { segments: 10 }));
  // Leaves: individual tongues with a curled tip, 8 per row.
  const rows = [
    { h: bellH * 0.44, phase: Math.PI / 8, curl: 0.15 * D, t: 0.03 * D },
    { h: bellH * 0.74, phase: 0, curl: 0.17 * D, t: 0.02 * D },
  ];
  // (Leaves are 12 + 4 triangles each: enough for the silhouette at portico distances.)
  const period = (Math.PI * 2) / 8;
  for (const row of rows) {
    for (let k = 0; k < 8; k++) {
      const ac = row.phase + k * period;
      const P = (s: number, t: number, o: THREE.Vector3) => {
        const a = ac + s * period * 0.62;
        const tc = 0.62;
        const len = row.h * (0.8 + 0.2 * (1 - 4 * s * s));
        let y: number;
        let r: number;
        if (t <= tc) {
          y = len * t;
          r = bellR(y) + row.t + 0.3 * row.curl * t * t;
        } else {
          const e = (t - tc) / (1 - tc);
          const al = e * 2.0;
          const rho = (len * (1 - tc)) / 2.0;
          y = len * tc + rho * Math.sin(al);
          r = bellR(len * tc) + row.t + 0.3 * row.curl * tc * tc + row.curl * 0.8 * (1 - Math.cos(al));
        }
        r -= 0.5 * row.curl * 4 * s * s * t;
        return o.set(r * Math.sin(a), y, r * Math.cos(a));
      };
      out.push(gridSurface([-0.5, 0, 0.5], [0, 0.4, 0.75, 1], P));
      out.push(gridSurface([-0.5, 0, 0.5], [0.75, 1], P, { flip: true }));
    }
  }
  // Corner volutes (stalk + one and a half turns) under the abacus horns.
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const R = 0.085 * D;
    const centre = dir.clone().multiplyScalar(0.72 * D).add(new THREE.Vector3(0, bellH - 0.1 * D, 0));
    const path: THREE.Vector3[] = [dir.clone().multiplyScalar(bellR(bellH * 0.6)).add(new THREE.Vector3(0, bellH * 0.6, 0)), dir.clone().multiplyScalar(0.5 * D).add(new THREE.Vector3(0, bellH - 0.02 * D, 0))];
    for (let i = 0; i <= 4; i++) {
      const th = Math.PI / 2 - (i / 4) * Math.PI * 1.5;
      const rr = R * (1 - i / 7);
      path.push(centre.clone().addScaledVector(dir, Math.cos(th) * rr).add(new THREE.Vector3(0, Math.sin(th) * rr, 0)));
    }
    out.push(tube(path, (i) => 0.042 * D * (1 - (0.5 * i) / path.length), 3, true));
  }
  // Concave abacus with cut corners, and a fleuron on each face.
  const w = 1.42 * D;
  const h = w / 2;
  const cut = 0.07 * D;
  const pts: V2[] = [];
  const corners: V2[] = [
    [h, h],
    [-h, h],
    [-h, -h],
    [h, -h],
  ];
  for (let k = 0; k < 4; k++) {
    const a = corners[k];
    const c = corners[(k + 1) % 4];
    const dir: V2 = [(c[0] - a[0]) / w, (c[1] - a[1]) / w];
    const inv: V2 = [-(a[0] + c[0]) / w, -(a[1] + c[1]) / w];
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      const bulge = Math.sin(t * Math.PI) * 0.1 * D;
      const p0: V2 = [a[0] + dir[0] * cut, a[1] + dir[1] * cut];
      const p1: V2 = [c[0] - dir[0] * cut, c[1] - dir[1] * cut];
      pts.push([p0[0] + (p1[0] - p0[0]) * t + inv[0] * bulge, p0[1] + (p1[1] - p0[1]) * t + inv[1] * bulge]);
    }
  }
  const ab = extrudePolygon(
    pts.map(([x, z]) => [x, -z] as V2),
    abH,
  );
  ab.rotateX(-Math.PI / 2);
  ab.translate(0, bellH + abH, 0);
  out.push(ab);
  for (const f of [0, Math.PI / 2, Math.PI, 1.5 * Math.PI]) {
    const fl = new THREE.SphereGeometry(0.065 * D, 4, 2);
    fl.scale(1, 1, 0.6);
    fl.translate(Math.sin(f) * 0.64 * D, bellH + abH * 0.5, Math.cos(f) * 0.64 * D);
    out.push(fl);
  }
  return out;
}

function midParts(order: Order, D: number, H: number, plinth: boolean): MidParts {
  const key = [order, D.toFixed(3), H.toFixed(3), plinth].join('|');
  let p = midCache.get(key);
  if (p) return p;
  const props = ORDER_PROPORTIONS[order];
  const dims = columnDims(order, D, H);
  const trim: THREE.BufferGeometry[] = [];
  const shaft: THREE.BufferGeometry[] = [];
  const plinthH = plinth ? D / 6 : 0;
  if (plinth) {
    const g = new THREE.BoxGeometry(dims.plinth, plinthH, dims.plinth);
    g.translate(0, plinthH / 2, 0);
    trim.push(g);
  }
  // Attic base: torus, scotia, torus.
  const base = new ProfileBuilder(0.6 * D, plinthH).torus(0.11 * D, 0.08 * D, 3).in(0.04 * D).scotia(0.06 * D, 0.03 * D, 2).torus(0.075 * D, 0.06 * D, 3).to(0.5 * D, plinthH + 0.34 * D).build();
  trim.push(lathe(base, { segments: 10 }));
  const y0 = dims.base - 0.01 * D;
  const y1 = H - dims.capital;
  const sh = gridSurface(
    linspace(0, Math.PI * 2, 12),
    [0, 1 / 3, 1],
    (a, t, o) => {
      const r = entasisRadius(D, props.topRatio, t);
      return o.set(r * Math.sin(a), y0 + t * (y1 - 0.1 * D - y0), r * Math.cos(a));
    },
    { uv: (a, t) => [(a * D * 0.5) / UV_METERS, (y0 + t * (y1 - y0)) / UV_METERS] },
  );
  shaft.push(sh);
  const rTopShaft = entasisRadius(D, props.topRatio, 1);
  const astr = new ProfileBuilder(rTopShaft, y1 - 0.1 * D).up(0.03 * D).torus(0.06 * D, 0.03 * D, 2).to(rTopShaft * 0.98, y1 + 0.002 * D).build();
  trim.push(lathe(astr, { segments: 10 }));
  if (order === 'corinthian' || order === 'composite') {
    for (const g of midCapital(D, dims.d, dims.capital)) {
      g.translate(0, y1, 0);
      trim.push(g);
    }
  } else {
    // Tuscan/Doric/Ionic stand-in: echinus and abacus.
    const ech = new ProfileBuilder(dims.d / 2, y1).up(0.12 * D).ovolo(0.12 * D, 0.14 * D, 3).in(0.6 * D).build();
    trim.push(lathe(ech, { segments: 14 }));
    const ab = new THREE.BoxGeometry(1.2 * D, 0.14 * D, 1.2 * D);
    ab.translate(0, y1 + 0.33 * D, 0);
    trim.push(ab);
  }
  p = { shaft, trim };
  midCache.set(key, p);
  return p;
}

/** Unfluted column at moderate detail (≈1.3k triangles), any shaft material. Origin on the ground at the axis. */
export function midColumn(b: MeshBuilder, spec: MidColumnSpec, at: THREE.Matrix4) {
  const parts = midParts(spec.order, spec.D, spec.height, spec.plinth ?? true);
  for (const g of parts.shaft) b.add(g, spec.shaft, at, { uv: 'keep' });
  for (const g of parts.trim) b.add(g, spec.trim ?? 'marble', at);
  if (spec.collide ?? true) {
    const c = new THREE.Vector3(0, spec.height / 2, 0).applyMatrix4(at);
    b.collider({ kind: 'cylinder', center: c, halfHeight: spec.height / 2, radius: spec.D * 0.52 });
  }
}

export type ColumnDetail = 'high' | 'mid' | 'low';

/** Kit column at 'high'/'low', or `midColumn`. Coloured shafts (THREE.Material) are supported at every level. */
export function colonnadeColumn(b: MeshBuilder, detail: ColumnDetail, spec: MidColumnSpec, at: THREE.Matrix4) {
  if (detail === 'mid') return midColumn(b, spec, at);
  // The kit types its material as a library id, but MeshBuilder.add accepts shared THREE materials too.
  column(
    b,
    {
      order: spec.order,
      D: spec.D,
      height: spec.height,
      fluted: false,
      material: spec.shaft as MaterialId,
      trimMaterial: (spec.trim ?? 'marble') as MaterialId,
      detail,
      plinth: spec.plinth ?? true,
      collide: spec.collide ?? true,
    },
    at,
  );
}

/**
 * Distant column (≈ 40 triangles): octagonal tapered shaft, a square plinth and a flared block for
 * the capital. For LOD levels seen from beyond ~60 m.
 */
export function farColumn(b: MeshBuilder, spec: { D: number; height: number; shaft: Mat; trim?: Mat }, at: THREE.Matrix4) {
  const { D, height: H } = spec;
  const capH = 1.1 * D;
  const shaft = new THREE.CylinderGeometry(0.43 * D, 0.5 * D, H - capH - 0.4 * D, 8, 1, true);
  shaft.translate(0, 0.4 * D + (H - capH - 0.4 * D) / 2, 0);
  b.add(shaft, spec.shaft, at);
  const plinth = new THREE.BoxGeometry(1.3 * D, 0.4 * D, 1.3 * D);
  plinth.translate(0, 0.2 * D, 0);
  b.add(plinth, spec.trim ?? 'marble', at);
  const cap = new THREE.CylinderGeometry(0.72 * D, 0.45 * D, capH, 4, 1);
  cap.rotateY(Math.PI / 4);
  cap.translate(0, H - capH / 2, 0);
  b.add(cap, spec.trim ?? 'marble', at);
}

/** Simple vertical cylinder between two heights (posts, poles), optional collider. */
export function post(b: MeshBuilder, mat: Mat, m: THREE.Matrix4, x: number, z: number, y0: number, y1: number, r: number, seg = 6, collide = false) {
  b.add(cylinderBetween(new THREE.Vector3(x, y0, z), new THREE.Vector3(x, y1, z), r, r, seg), mat, m);
  if (collide) solidCyl(b, m, x, (y0 + y1) / 2, z, r, y1 - y0);
}
