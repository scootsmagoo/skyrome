/**
 * Puts gameplay spots where a person can actually stand (palcirc crew). Builders place spots by
 * arithmetic (the pad height, `max(ground, 0)`, a storey height), which leaves some floating over
 * a slope, sunk under a paved square or buried in a pier. After a landmark is built, every spot
 * is dropped onto the real walking surface below it — the highest exposed top of the landmark's
 * own colliders or the terrain (`ctx.groundAt`) — and a spot whose body would be inside masonry
 * is moved to the nearest clear point on the same level.
 *
 * Pure geometry on ColliderSpecs (boxes with any rotation, vertical cylinders; trimeshes are not
 * used by these builders and are ignored), all in the landmark's LOCAL frame.
 */
import * as THREE from 'three';
import type { ColliderSpec } from '../../../../gfx/MeshBuilder';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../../types';
import { palcircLife } from './life';

const inv = new THREE.Quaternion();
const lp = new THREE.Vector3();
const ld = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Vertical extent [bottom, top] of a collider along the vertical line through (x, z), or null. */
export function spanAt(c: ColliderSpec, x: number, z: number): [number, number] | null {
  if (c.kind === 'cylinder') {
    if (Math.hypot(x - c.center.x, z - c.center.z) > c.radius) return null;
    return [c.center.y - c.halfHeight, c.center.y + c.halfHeight];
  }
  if (c.kind !== 'box') return null;
  // The line p(t) = (x, t, z) in the box frame: slab intersection on each axis.
  inv.copy(c.rotation ?? new THREE.Quaternion()).invert();
  lp.set(x - c.center.x, -c.center.y, z - c.center.z).applyQuaternion(inv);
  ld.copy(UP).applyQuaternion(inv);
  let t0 = -Infinity;
  let t1 = Infinity;
  for (const k of ['x', 'y', 'z'] as const) {
    const h = c.half[k];
    if (Math.abs(ld[k]) < 1e-9) {
      if (Math.abs(lp[k]) > h) return null;
      continue;
    }
    let a = (-h - lp[k]) / ld[k];
    let b = (h - lp[k]) / ld[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

/** Distance from a point to a collider (0 inside). */
export function distanceTo(c: ColliderSpec, p: THREE.Vector3): number {
  if (c.kind === 'cylinder') {
    const dr = Math.max(0, Math.hypot(p.x - c.center.x, p.z - c.center.z) - c.radius);
    const dy = Math.max(0, Math.abs(p.y - c.center.y) - c.halfHeight);
    return Math.hypot(dr, dy);
  }
  if (c.kind !== 'box') return Infinity;
  inv.copy(c.rotation ?? new THREE.Quaternion()).invert();
  lp.copy(p).sub(c.center).applyQuaternion(inv);
  const dx = Math.max(0, Math.abs(lp.x) - c.half.x);
  const dy = Math.max(0, Math.abs(lp.y) - c.half.y);
  const dz = Math.max(0, Math.abs(lp.z) - c.half.z);
  return Math.hypot(dx, dy, dz);
}

/** Bounding radius (xz) of a collider about its centre, for a cheap broad phase. */
function reach(c: ColliderSpec): number {
  if (c.kind === 'cylinder') return c.radius;
  if (c.kind !== 'box') return 0;
  return Math.hypot(c.half.x, c.half.y, c.half.z);
}

const CELL = 8;
const key = (gx: number, gz: number) => (gx + 32768) * 65536 + (gz + 32768);

/** Uniform xz grid of item indices. */
class Grid {
  private readonly cells = new Map<number, number[]>();

  insert(i: number, x0: number, z0: number, x1: number, z1: number) {
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
        const k = key(gx, gz);
        const list = this.cells.get(k);
        if (list) list.push(i);
        else this.cells.set(k, [i]);
      }
    }
  }

  query(x: number, z: number, r: number, out: Set<number>) {
    for (let gx = Math.floor((x - r) / CELL); gx <= Math.floor((x + r) / CELL); gx++) {
      for (let gz = Math.floor((z - r) / CELL); gz <= Math.floor((z + r) / CELL); gz++) {
        for (const i of this.cells.get(key(gx, gz)) ?? []) out.add(i);
      }
    }
  }
}

const ta = new THREE.Vector3();
const tb = new THREE.Vector3();
const tc = new THREE.Vector3();
const tq = new THREE.Vector3();
const tri = new THREE.Triangle();

/**
 * Colliders near a point: boxes and cylinders (xz within `r` plus their own size) and the
 * triangles of trimesh colliders (streets, plazas), each on a uniform grid.
 */
export class ColliderIndex {
  private readonly items: { c: ColliderSpec; x: number; z: number; r: number }[];
  private readonly grid = new Grid();
  /** Trimesh triangles in the landmark frame, 9 floats each. */
  private readonly tris: number[] = [];
  private readonly triGrid = new Grid();

  constructor(colliders: readonly ColliderSpec[]) {
    this.items = [];
    for (const c of colliders) {
      if (c.kind === 'trimesh') this.addTrimesh(c.geometry, c.matrix);
      else this.items.push({ c, x: c.center.x, z: c.center.z, r: reach(c) });
    }
    this.items.forEach((it, i) => this.grid.insert(i, it.x - it.r, it.z - it.r, it.x + it.r, it.z + it.r));
  }

  private addTrimesh(g: THREE.BufferGeometry, m?: THREE.Matrix4) {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const idx = g.index;
    const n = idx ? idx.count : pos.count;
    for (let k = 0; k + 2 < n; k += 3) {
      const v = [0, 1, 2].map((j) => {
        const p = new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(k + j) : k + j);
        return m ? p.applyMatrix4(m) : p;
      });
      const i = this.tris.length / 9;
      for (const p of v) this.tris.push(p.x, p.y, p.z);
      this.triGrid.insert(i, Math.min(v[0].x, v[1].x, v[2].x), Math.min(v[0].z, v[1].z, v[2].z), Math.max(v[0].x, v[1].x, v[2].x), Math.max(v[0].z, v[1].z, v[2].z));
    }
  }

  near(x: number, z: number, r: number): ColliderSpec[] {
    const ids = new Set<number>();
    this.grid.query(x, z, r, ids);
    const out: ColliderSpec[] = [];
    for (const i of ids) {
      const it = this.items[i];
      if (Math.hypot(it.x - x, it.z - z) <= it.r + r) out.push(it.c);
    }
    return out;
  }

  /** Heights where the vertical line through (x, z) crosses a (non-vertical) trimesh triangle. */
  surfacesAt(x: number, z: number): number[] {
    const ids = new Set<number>();
    this.triGrid.query(x, z, 0, ids);
    const out: number[] = [];
    const t = this.tris;
    for (const i of ids) {
      const o = i * 9;
      const ax = t[o], ay = t[o + 1], az = t[o + 2], bx = t[o + 3], by = t[o + 4], bz = t[o + 5], cx = t[o + 6], cy = t[o + 7], cz = t[o + 8];
      const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(den) < 1e-9) continue;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den;
      const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den;
      const w = 1 - u - v;
      if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
      out.push(u * ay + v * by + w * cy);
    }
    return out;
  }

  /** Whether any trimesh triangle passes within `r` of `p`. */
  trisWithin(p: THREE.Vector3, r: number): boolean {
    const ids = new Set<number>();
    this.triGrid.query(p.x, p.z, r, ids);
    const t = this.tris;
    for (const i of ids) {
      const o = i * 9;
      tri.set(ta.set(t[o], t[o + 1], t[o + 2]), tb.set(t[o + 3], t[o + 4], t[o + 5]), tc.set(t[o + 6], t[o + 7], t[o + 8]));
      if (tri.closestPointToPoint(p, tq).distanceTo(p) < r) return true;
    }
    return false;
  }
}

const probe = new THREE.Vector3();

/**
 * The walking surface at (x, z) at or below `yMax`: the highest top of a collider or trimesh
 * surface (or the terrain) with nothing solid just above it. Below the terrain nothing counts.
 */
export function floorAt(idx: ColliderIndex, ground: (x: number, z: number) => number, x: number, z: number, yMax: number): number {
  const g = ground(x, z);
  const cols = idx.near(x, z, 0.05);
  const tops: number[] = [];
  for (const c of cols) {
    const s = spanAt(c, x, z);
    if (s && s[1] <= yMax + 1e-4 && s[1] > g) tops.push(s[1]);
  }
  for (const y of idx.surfacesAt(x, z)) if (y <= yMax + 1e-4 && y > g) tops.push(y);
  tops.sort((a, b) => b - a);
  for (const t of tops) {
    probe.set(x, t + 0.05, z);
    if (!cols.some((c) => distanceTo(c, probe) === 0)) return t;
  }
  return g;
}

/** Whether a standing (or seated) person at `p` would overlap a collider. */
export function blocked(idx: ColliderIndex, p: THREE.Vector3, sit = false): boolean {
  const cols = idx.near(p.x, p.z, 0.4);
  const r = sit ? 0.2 : 0.28;
  for (const h of sit ? [0.5] : [0.45, 1.0, 1.5]) {
    probe.set(p.x, p.y + h, p.z);
    if (cols.some((c) => distanceTo(c, probe) < r)) return true;
    if (idx.trisWithin(probe, r)) return true;
  }
  return false;
}

/**
 * Drops every spot onto the walking surface below it (searching from 0.6 m above) and moves any
 * spot whose body would be inside a collider to the nearest clear point on about the same level
 * (within 4 m, preferring the side it is approached from). Mutates the spots; returns the ids it
 * could not clear.
 */
export function settleSpots(spots: Spot[] | undefined, colliders: readonly ColliderSpec[], ground: (x: number, z: number) => number): string[] {
  if (!spots?.length) return [];
  const idx = new ColliderIndex(colliders);
  const stuck: string[] = [];
  for (const s of spots) {
    const p = s.position;
    const sit = s.kind === 'sit';
    p.y = floorAt(idx, ground, p.x, p.z, p.y + 0.6);
    if (!blocked(idx, p, sit)) continue;
    const y0 = p.y;
    const back = (s.heading ?? 0) + Math.PI;
    let best: THREE.Vector3 | null = null;
    search: for (const r of [0.35, 0.6, 0.9, 1.25, 1.7, 2.2, 2.8, 3.4, 4.0]) {
      let bestCost = Infinity;
      for (let k = 0; k < 16; k++) {
        const a = back + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
        const x = p.x + Math.sin(a) * r;
        const z = p.z + Math.cos(a) * r;
        const y = floorAt(idx, ground, x, z, y0 + 0.6);
        if (Math.abs(y - y0) > 0.6) continue;
        const q = new THREE.Vector3(x, y, z);
        if (blocked(idx, q, sit)) continue;
        const cost = Math.ceil(k / 2) + Math.abs(y - y0);
        if (cost < bestCost) {
          bestCost = cost;
          best = q;
        }
      }
      if (best) break search;
    }
    if (best) p.copy(best);
    else stuck.push(s.id);
  }
  return stuck;
}

/**
 * Wraps builders so their spots are settled on the built colliders and the terrain (unless
 * `settle` is false: landmarks standing on another's colliders), then made interactive.
 */
export function settled(list: LandmarkBuilder[], opts: { settle?: boolean } = {}): LandmarkBuilder[] {
  return list.map((b) => ({
    handles: b.handles,
    build(ctx: LandmarkContext): LandmarkBuild {
      const out = b.build(ctx);
      if (opts.settle ?? true) {
        const stuck = settleSpots(out.spots, out.colliders, (x, z) => ctx.groundAt(x, z));
        if (stuck.length && typeof document !== 'undefined') console.warn(`[palcirc] ${ctx.lm.id}: spots without a clear standing place: ${stuck.join(', ')}`);
      }
      palcircLife(ctx, out.spots);
      return out;
    },
  }));
}
