/**
 * Small rigid-geometry toolkit for weapons, shields and props. Builds with the avatar SkinBuilder
 * (so the vertex format — color + surf — matches the shared avatar material), then strips the skin
 * attributes. Everything here is cached: one BufferGeometry per model, shared by every holder.
 */
import * as THREE from 'three';
import { SkinBuilder, type Surf, type V } from '../avatar/SkinBuilder';

export type Vec3 = [number, number, number];

export class RigidBuilder {
  readonly b = new SkinBuilder();
  private v: V = { x: 0, y: 0, z: 0, r: 1, g: 1, b: 1, w: [0, 1], s: { rough: 1, metal: 0, pattern: 0, emissive: 0 } };

  vert(p: Vec3, c: THREE.Color, s: Surf): number {
    const v = this.v;
    v.x = p[0];
    v.y = p[1];
    v.z = p[2];
    v.r = c.r;
    v.g = c.g;
    v.b = c.b;
    v.s = s;
    return this.b.vertex(v);
  }

  /** Tube along +Y through rings; each ring is [y, rx, rz, (cx), (cz)]. Caps both ends. */
  lathe(rings: number[][], seg: number, c: THREE.Color | ((y: number, th: number) => THREE.Color), s: Surf | ((y: number) => Surf), opts: { capTop?: boolean; capBottom?: boolean; shape?: (th: number) => [number, number] } = {}) {
    const col = typeof c === 'function' ? c : () => c;
    const surf = typeof s === 'function' ? s : () => s;
    const shape = opts.shape ?? ((th: number) => [Math.cos(th), Math.sin(th)] as [number, number]);
    const g = this.b.grid(
      seg,
      rings.length,
      true,
      (i, j, v) => {
        const [y, rx, rz, cx = 0, cz = 0] = rings[j];
        const th = (i / seg) * Math.PI * 2;
        const [sx, sz] = shape(th);
        v.x = cx + sx * rx;
        v.y = y;
        v.z = cz + sz * rz;
        const cc = col(y, th);
        v.r = cc.r;
        v.g = cc.g;
        v.b = cc.b;
        v.s = surf(y);
        v.w = [0, 1];
      },
      'auto',
      (j) => [rings[j][3] ?? 0, rings[j][0], rings[j][4] ?? 0],
    );
    const ends: [number, number][] = [];
    if (opts.capBottom !== false) ends.push([0, -1]);
    if (opts.capTop !== false) ends.push([rings.length - 1, 1]);
    for (const [j, dir] of ends) {
      const [y, , , cx = 0, cz = 0] = rings[j];
      const cc = col(y, 0);
      this.b.capAuto(g, seg, j, { x: cx, y: y + dir * 0.0005, z: cz, r: cc.r, g: cc.g, b: cc.b, w: [0, 1], s: surf(y) }, [0, dir, 0]);
    }
    return g;
  }

  /** Box centered at c with half-sizes h (axis aligned), flat shaded (separate vertices per face). */
  box(c: Vec3, h: Vec3, col: THREE.Color, s: Surf, m?: THREE.Matrix4) {
    const geo = new THREE.BoxGeometry(h[0] * 2, h[1] * 2, h[2] * 2);
    const mat = new THREE.Matrix4().makeTranslation(c[0], c[1], c[2]);
    if (m) mat.premultiply(m);
    this.b.addGeometry(geo, mat, col, [0, 1], s);
  }

  /** Sphere/ellipsoid. */
  ellipsoid(c: Vec3, r: Vec3, col: THREE.Color, s: Surf, seg = 10, rows = 6) {
    const geo = new THREE.SphereGeometry(1, seg, rows);
    const m = new THREE.Matrix4().makeScale(r[0], r[1], r[2]).setPosition(c[0], c[1], c[2]);
    this.b.addGeometry(geo, m, col, [0, 1], s);
  }

  /** Flat-ish quad strip polygon from a 2D outline (convex fan) at depth z, facing +z (or -z). */
  fan(points: [number, number][], z: number, col: THREE.Color, s: Surf, facing: 1 | -1, map?: (x: number, y: number, z: number) => Vec3) {
    const P = map ?? ((x: number, y: number, zz: number) => [x, y, zz] as Vec3);
    let cx = 0;
    let cy = 0;
    for (const [x, y] of points) {
      cx += x / points.length;
      cy += y / points.length;
    }
    const c = this.vert(P(cx, cy, z), col, s);
    const ids = points.map(([x, y]) => this.vert(P(x, y, z), col, s));
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i];
      const b = ids[(i + 1) % ids.length];
      if (facing > 0) this.b.tri(c, a, b);
      else this.b.tri(c, b, a);
    }
  }

  build(name: string): THREE.BufferGeometry {
    const g = this.b.build();
    g.deleteAttribute('skinIndex');
    g.deleteAttribute('skinWeight');
    g.name = name;
    g.computeBoundingSphere();
    return g;
  }
}

/** Ensure triangles of a fan face +z by checking winding against the given facing; helper for 2D shapes. */
export function polyArea(points: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}
