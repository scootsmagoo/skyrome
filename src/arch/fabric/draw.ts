/**
 * `Draw`: a MeshBuilder plus a local frame (matrix), so generators can be written in their own
 * coordinates ("front faces −z, floor at y = 0") and nested (`d.at(x, y, z, rotY)`).
 *
 * Every primitive is merged per material by the MeshBuilder (one draw call per material) and gets
 * world-scale box-projected UVs, so textured PBR materials tile at real size. Colliders are boxes /
 * vertical cylinders in the same frame.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { castsShadow } from './shadow';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const cylCache = new Map<string, THREE.BufferGeometry>();
const sphereCache = new Map<string, THREE.BufferGeometry>();

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

export interface PartOpts {
  /** Extra rotation (radians, Euler XYZ) about the part's centre. */
  rx?: number;
  ry?: number;
  rz?: number;
  /** Also add a matching box collider. */
  collide?: boolean;
  /** Ignored: shadow casting is decided per material (see shadow.ts) so each material merges into one mesh. */
  shadow?: boolean;
  /** Meters per texture repeat (default 2). */
  uvScale?: number;
}

/** Unit cylinder (radius 1 at the bottom, `k` at the top, height 1, centred). Cached. */
function unitCylinder(seg: number, k: number, open = false): THREE.BufferGeometry {
  const key = `${seg}|${k.toFixed(3)}|${open ? 1 : 0}`;
  let g = cylCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(k, 1, 1, seg, 1, open).toNonIndexed();
    cylCache.set(key, g);
  }
  return g;
}

function unitSphere(w: number, h: number): THREE.BufferGeometry {
  const key = `${w}|${h}`;
  let g = sphereCache.get(key);
  if (!g) {
    g = new THREE.SphereGeometry(1, w, h).toNonIndexed();
    sphereCache.set(key, g);
  }
  return g;
}

/** Per-frame drawing flags, inherited by child frames. */
export interface DrawFlags {
  /** false: nothing drawn through this frame casts shadows (shop interiors, props behind openings). */
  cast: boolean;
  /**
   * Far-LOD walls: `wall()` draws a plain slab with flat "painted" opening quads instead of cutting
   * holes (an extruded wall with holes costs ~10× the triangles and is invisible at that range).
   */
  flat: boolean;
}

export class Draw {
  readonly flags: DrawFlags;

  constructor(
    readonly b: MeshBuilder,
    readonly m: THREE.Matrix4 = new THREE.Matrix4(),
    flags: Partial<DrawFlags> = {},
  ) {
    this.flags = { cast: flags.cast ?? true, flat: flags.flat ?? false };
  }

  /** Child frame: translate by (x, y, z) then rotate about the new Y axis. */
  at(x: number, y: number, z: number, rotY = 0): Draw {
    const m = this.m.clone().multiply(_m.makeTranslation(x, y, z));
    if (rotY) m.multiply(_m.makeRotationY(rotY));
    return new Draw(this.b, m, this.flags);
  }

  /** Child frame with an arbitrary local matrix. */
  sub(local: THREE.Matrix4): Draw {
    return new Draw(this.b, this.m.clone().multiply(local), this.flags);
  }

  /** Same frame, but nothing drawn through it casts shadows (interiors: they sit in the building's own shadow). */
  noShadow(): Draw {
    return new Draw(this.b, this.m.clone(), { ...this.flags, cast: false });
  }

  /** Same frame with far-LOD flat walls (see `DrawFlags.flat`). */
  flatWalls(): Draw {
    return new Draw(this.b, this.m.clone(), { ...this.flags, flat: true });
  }

  /** Shadow flag for a part of material `mat` drawn through this frame. */
  casts(mat: MaterialId): boolean {
    return this.flags.cast && castsShadow(mat);
  }

  /** Box centred at (cx, cy, cz) with size (w, h, d). */
  box(mat: MaterialId, cx: number, cy: number, cz: number, w: number, h: number, d: number, o: PartOpts = {}): this {
    if (w <= 0 || h <= 0 || d <= 0) return this;
    _q.setFromEuler(_e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0));
    const local = new THREE.Matrix4().compose(_p.set(cx, cy, cz), _q, _s.set(w, h, d));
    this.b.add(UNIT_BOX, mat, this.m.clone().multiply(local), { castShadow: this.casts(mat), uvScale: o.uvScale });
    if (o.collide) this.solidRot(cx, cy, cz, w, h, d, _q.clone());
    return this;
  }

  /** Axis-aligned box from (x0, y0, z0) to (x1, y1, z1) in this frame. */
  span(mat: MaterialId, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: PartOpts = {}): this {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1), by = Math.max(y0, y1);
    const az = Math.min(z0, z1), bz = Math.max(z0, z1);
    return this.box(mat, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, bx - ax, by - ay, bz - az, o);
  }

  /** Vertical (by default) cylinder: base radius `r`, top radius `rTop`, height `h`, centred at (cx, cy, cz). */
  cyl(mat: MaterialId, cx: number, cy: number, cz: number, r: number, h: number, seg = 10, o: PartOpts & { rTop?: number; open?: boolean } = {}): this {
    if (r <= 0 || h <= 0) return this;
    const k = (o.rTop ?? r) / r;
    _q.setFromEuler(_e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0));
    const local = new THREE.Matrix4().compose(_p.set(cx, cy, cz), _q, _s.set(r, h, r));
    this.b.add(unitCylinder(seg, k, o.open), mat, this.m.clone().multiply(local), { castShadow: this.casts(mat), uvScale: o.uvScale });
    if (o.collide) this.solidCyl(cx, cy, cz, Math.max(r, o.rTop ?? r), h);
    return this;
  }

  /** Cylinder between two points (beams, poles, ropes). */
  rod(mat: MaterialId, a: THREE.Vector3Like, b: THREE.Vector3Like, r: number, seg = 6, o: PartOpts & { rTop?: number; open?: boolean } = {}): this {
    const dir = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
    const len = dir.length();
    if (len < 1e-4) return this;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const k = (o.rTop ?? r) / r;
    const local = new THREE.Matrix4().compose(new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), q, _s.set(r, len, r));
    this.b.add(unitCylinder(seg, k, o.open), mat, this.m.clone().multiply(local), { castShadow: this.casts(mat), uvScale: o.uvScale });
    return this;
  }

  /** Ellipsoid centred at (cx, cy, cz) with radii (rx, ry, rz). */
  ellipsoid(mat: MaterialId, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, o: PartOpts & { seg?: [number, number] } = {}): this {
    const [w, h] = o.seg ?? [10, 7];
    _q.setFromEuler(_e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0));
    const local = new THREE.Matrix4().compose(_p.set(cx, cy, cz), _q, _s.set(rx, ry, rz));
    this.b.add(unitSphere(w, h), mat, this.m.clone().multiply(local), { castShadow: this.casts(mat), uvScale: o.uvScale });
    return this;
  }

  /** Arbitrary geometry placed at (cx, cy, cz) with optional rotation/scale. */
  geo(g: THREE.BufferGeometry, mat: MaterialId, cx = 0, cy = 0, cz = 0, o: PartOpts & { sx?: number; sy?: number; sz?: number; keepUV?: boolean } = {}): this {
    _q.setFromEuler(_e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0));
    const local = new THREE.Matrix4().compose(_p.set(cx, cy, cz), _q, _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
    this.b.add(g, mat, this.m.clone().multiply(local), { castShadow: this.casts(mat), uvScale: o.uvScale, uv: o.keepUV ? 'keep' : 'box' });
    return this;
  }

  /**
   * Raw triangles (flat array of xyz triples, counter-clockwise = front) in this frame. `uvs` (one
   * uv pair per vertex) keeps hand-made UVs, e.g. roof planes whose tile rows must follow the eaves.
   */
  tris(mat: MaterialId, positions: number[], o: PartOpts & { uvs?: number[] } = {}): this {
    if (positions.length < 9) return this;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (o.uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uvs, 2));
    g.computeVertexNormals();
    this.b.add(g, mat, this.m, { castShadow: this.casts(mat), uvScale: o.uvScale, uv: o.uvs ? 'keep' : 'box' });
    return this;
  }

  /** Planar convex polygon (fan-triangulated) given in this frame; `doubleSided` adds the back face. */
  poly(mat: MaterialId, pts: THREE.Vector3Like[], o: PartOpts & { doubleSided?: boolean } = {}): this {
    const arr: number[] = [];
    for (let i = 1; i < pts.length - 1; i++) {
      arr.push(pts[0].x, pts[0].y, pts[0].z, pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
      if (o.doubleSided) arr.push(pts[0].x, pts[0].y, pts[0].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z, pts[i].x, pts[i].y, pts[i].z);
    }
    return this.tris(mat, arr, o);
  }

  // ------------------------------------------------------------- colliders only

  /** Box collider from (x0, y0, z0) to (x1, y1, z1) in this frame (no geometry). */
  solid(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): this {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1), by = Math.max(y0, y1);
    const az = Math.min(z0, z1), bz = Math.max(z0, z1);
    if (bx - ax < 1e-3 || by - ay < 1e-3 || bz - az < 1e-3) return this;
    return this.solidRot((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, bx - ax, by - ay, bz - az, new THREE.Quaternion());
  }

  private solidRot(cx: number, cy: number, cz: number, w: number, h: number, d: number, q: THREE.Quaternion): this {
    const pos = new THREE.Vector3(), rot = new THREE.Quaternion(), scl = new THREE.Vector3();
    this.m.decompose(pos, rot, scl);
    this.b.collider({
      kind: 'box',
      center: new THREE.Vector3(cx, cy, cz).applyMatrix4(this.m),
      half: new THREE.Vector3(w / 2, h / 2, d / 2),
      rotation: rot.multiply(q),
    });
    return this;
  }

  /** Vertical cylinder collider (assumes this frame only yaws). */
  solidCyl(cx: number, cy: number, cz: number, r: number, h: number): this {
    this.b.collider({ kind: 'cylinder', center: new THREE.Vector3(cx, cy, cz).applyMatrix4(this.m), halfHeight: h / 2, radius: r });
    return this;
  }

  /** Transform a local point of this frame to builder space. */
  point(x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(x, y, z).applyMatrix4(this.m);
  }

  /** Yaw of this frame (radians) — for spot headings. */
  get yaw(): number {
    const e = new THREE.Vector3(1, 0, 0).transformDirection(this.m);
    return Math.atan2(-e.z, e.x);
  }
}
