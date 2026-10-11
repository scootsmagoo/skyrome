/**
 * Collision-against-visuals audit (dev tool, `?audit=1`, driven by `scripts/audit/collision.mjs`).
 *
 * Where the player walks, what Rapier stops them on must be what three.js draws. This module
 * measures the difference in the running game, around one spot at a time:
 *
 *  - `sweep(cx, cz)` indexes every drawn triangle near the spot (plain meshes, instanced meshes
 *    and the city's and landmarks' BatchedMeshes, by instance; the terrain as the GPU triangulates
 *    it) into an XZ grid, then
 *      · drops a vertical probe every `spacing` m: every collider surface the ray crosses against
 *        every drawn surface (`compareColumn`): the player floats on an invisible ledge, sinks
 *        into a drawn kerb, passes through a drawn solid, follows a ramp under drawn steps, or
 *        falls through (a fall-through is re-checked with a real capsule cast, so a crack narrower
 *        than the body is not one);
 *      · at each probe where a player could stand, checks the standing capsule for colliders
 *        intruding at body (`embedded`) and head (`headroom`) height;
 *      · along every street-graph edge near the spot, casts horizontal rays at knee and chest
 *        height across and along the street: a collider in front of the drawn wall is an
 *        invisible wall, a drawn wall with nothing behind it a ghost (`compareWall`);
 *      · walks lines along and across those streets every 0.1 m, following the level a walker
 *        would follow, for seams: a step in the collider where the picture is smooth (a lip that
 *        catches the foot), a crack between collider pieces, a drawn riser over a smooth collider
 *        (`findSeams`);
 *      · on bare terrain, compares the physics ground with the drawn triangulation and with the
 *        bilinear `heightAt` (which diagonal does Rapier's heightfield use?).
 *    Every finding names the collider (shape, centre, size) or drawn piece (batch and instance)
 *    behind it, so the driver can group the probes of one defect.
 *  - `walkInto(...)` / `walkOver(...)` confirm a finding with the real player controller (the W
 *    key held), counting game frames rather than wall time (the GPU is shared), and report how far
 *    from the drawn wall the body stops or how far the feet stand from the drawn ground.
 *
 * Reading the drawn triangles needs their CPU copies, which `gfx/release.ts` keeps while `?audit`
 * is set. Nothing here runs in a normal game.
 */
import * as THREE from 'three';
import type { Game } from '../../core/Game';
import { ALL_LAYERS, Layer, RAPIER, groups } from '../../core/Physics';
import { flushPhysicsQueries } from '../../world/safeGround';
import { COLUMN, compareColumn, compareWall, findSeams, isOverhead, terrainBilinear, terrainDrawnHeight, terrainOtherHeight, type ColumnFinding, type SeamFinding, type Surf, type WallFinding } from './collisionRules';

// ---------------------------------------------------------------- drawn triangles

/** Objects that are not scenery, or never collide on purpose (by object or parent name): characters and what they carry, crowds of stand-ins, effects, cloth, water. */
const SKIP_OBJ = /^sky|cloud|humanoid|actor|avatar|real:|hair|eyes|gore|blood|marker|trail|route|debug|helper|^terrain|blobShadows|awning|velum|banner|garland|wreath|rope|wash|chevron|sprite|reed|water|glow|flame|fire|smoke|crowd|drip|socket|rain/i;
/** Materials that never collide on purpose: foliage (tree trunks, `bark`, stay), cloth, water, light, decals of blood. */
const SKIP_MAT = /leaf|foliage|canopy|Lbaked|reed|water|glow|flame|fire|smoke|shadow|blob|sprite|blood|wash|velum|rope|chevron|marker|trail|route|debug|fabric/i;
/** Grass: a lawn (`grass`, `dry_grass` in a batch or a plain mesh) is a floor; instanced grass is blades. */
const GRASS = /grass/i;

interface Piece {
  tag: string;
  /** Which piece exactly: batch or instanced mesh and instance index, or mesh name and centre. */
  key: string;
  /** Material side: 0 front, 1 back, 2 double. */
  side: number;
}

interface VisualIndex {
  /** World-space triangles, 9 floats each. */
  tri: Float32Array;
  /** Piece per triangle. */
  owner: Uint32Array;
  pieces: Piece[];
  /** Grid of triangle indices per cell. */
  cells: Int32Array[];
  x0: number;
  z0: number;
  n: number;
  cell: number;
  stats: { pieces: number; triangles: number; released: number; skipped: number; far: number; ms: number };
}

interface BatchInternals {
  _instanceInfo: { visible: boolean; active: boolean; geometryIndex: number }[];
  _geometryInfo: { start: number; count: number; boundingSphere: THREE.Sphere | null }[];
  getMatrixAt(i: number, m: THREE.Matrix4): THREE.Matrix4;
  getBoundingSphereAt(i: number, s: THREE.Sphere): THREE.Sphere | null;
}

const _m = new THREE.Matrix4();
const _s = new THREE.Sphere();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

const firstMat = (mat: THREE.Material | THREE.Material[]) => (Array.isArray(mat) ? mat[0] : mat);
function skipMaterial(mat: THREE.Material | THREE.Material[]): boolean {
  const m = firstMat(mat);
  if (!m || m.visible === false) return true;
  if (m.transparent && m.opacity < 0.95) return true;
  return SKIP_MAT.test(m.name);
}

/** Index every drawn triangle within `radius` of (cx, cz), by 2 m XZ cell. */
export function buildVisualIndex(game: Game, cx: number, cz: number, radius: number): VisualIndex {
  const t0 = performance.now();
  const cell = 2;
  const n = Math.ceil((radius * 2) / cell) + 2;
  const x0 = cx - (n * cell) / 2, z0 = cz - (n * cell) / 2;
  const tris: number[] = [];
  const owner: number[] = [];
  const pieces: Piece[] = [];
  const stats = { pieces: 0, triangles: 0, released: 0, skipped: 0, far: 0, ms: 0 };
  const rr = radius + cell;

  /** Add the triangles of `geometry[start, start+count)` (index units, or vertex units when unindexed) transformed by `mw`. */
  const addRange = (g: THREE.BufferGeometry, mw: THREE.Matrix4, start: number, count: number, piece: Piece) => {
    const pos = g.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos || !pos.array) {
      stats.released++;
      return;
    }
    const idx = g.index;
    if (idx && !idx.array) {
      stats.released++;
      return;
    }
    const pid = pieces.length;
    pieces.push(piece);
    stats.pieces++;
    const end = Math.min(start + count, idx ? idx.count : pos.count);
    let added = 0;
    for (let i = start; i + 2 < end; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      _a.fromBufferAttribute(pos, ia).applyMatrix4(mw);
      _b.fromBufferAttribute(pos, ib).applyMatrix4(mw);
      _c.fromBufferAttribute(pos, ic).applyMatrix4(mw);
      const minX = Math.min(_a.x, _b.x, _c.x), maxX = Math.max(_a.x, _b.x, _c.x);
      const minZ = Math.min(_a.z, _b.z, _c.z), maxZ = Math.max(_a.z, _b.z, _c.z);
      if (maxX < cx - rr || minX > cx + rr || maxZ < cz - rr || minZ > cz + rr) continue;
      tris.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z);
      owner.push(pid);
      added++;
    }
    if (!added) {
      pieces.pop();
      stats.pieces--;
    }
  };

  const visible = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  const sphereNear = (s: THREE.Sphere) => {
    const dx = s.center.x - cx, dz = s.center.z - cz;
    return Math.hypot(dx, dz) <= rr + s.radius;
  };
  const r1 = (v: number) => Math.round(v * 10) / 10;

  game.scene.updateMatrixWorld(true);
  game.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (!visible(o)) return;
    if (SKIP_OBJ.test(o.name) || skipMaterial(mesh.material) || ((mesh as THREE.InstancedMesh).isInstancedMesh && GRASS.test(`${o.name} ${firstMat(mesh.material)?.name}`))) {
      stats.skipped++;
      return;
    }
    for (let p: THREE.Object3D | null = o.parent; p; p = p.parent) {
      if (SKIP_OBJ.test(p.name)) {
        stats.skipped++;
        return;
      }
    }
    const g = mesh.geometry;
    const side = firstMat(mesh.material)?.side ?? 0;
    const name = o.name || mesh.parent?.name || 'mesh';
    const tag = `${name}:${firstMat(mesh.material)?.name || firstMat(mesh.material)?.type || ''}`;
    const far = /:far\b/.test(name);
    const batched = mesh as unknown as THREE.BatchedMesh & BatchInternals & { isBatchedMesh?: boolean };
    const instanced = mesh as THREE.InstancedMesh;
    if (batched.isBatchedMesh) {
      const infos = batched._instanceInfo, geos = batched._geometryInfo;
      for (let i = 0; i < infos.length; i++) {
        const inf = infos[i];
        if (!inf.visible || !inf.active) continue;
        const gi = geos[inf.geometryIndex];
        if (!gi) continue;
        batched.getMatrixAt(i, _m).premultiply(mesh.matrixWorld);
        const bs = batched.getBoundingSphereAt(inf.geometryIndex, _s);
        if (bs) {
          _s.applyMatrix4(_m);
          if (!sphereNear(_s)) continue;
        }
        addRange(g, _m, gi.start, gi.count, { tag, key: `${name}#${i}`, side });
      }
      return;
    }
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (instanced.isInstancedMesh) {
      for (let i = 0; i < instanced.count; i++) {
        instanced.getMatrixAt(i, _m);
        _m.premultiply(mesh.matrixWorld);
        if (g.boundingSphere) {
          _s.copy(g.boundingSphere).applyMatrix4(_m);
          if (!sphereNear(_s)) continue;
        }
        if (far) stats.far++;
        addRange(g, _m, 0, g.index ? g.index.count : g.getAttribute('position')?.count ?? 0, { tag, key: `${name}#${i}`, side });
      }
      return;
    }
    if (g.boundingSphere) {
      _s.copy(g.boundingSphere).applyMatrix4(mesh.matrixWorld);
      if (!sphereNear(_s)) return;
    }
    if (far) stats.far++;
    const dr = g.drawRange;
    const total = g.index ? g.index.count : g.getAttribute('position')?.count ?? 0;
    const c = _s.center;
    addRange(g, mesh.matrixWorld, dr.start, Math.min(dr.count, total - dr.start), { tag, key: `${name}@${r1(c.x)},${r1(c.y)},${r1(c.z)}`, side });
  });

  // Bucket by cell (a triangle goes into every cell its XZ box covers).
  const counts = new Int32Array(n * n);
  const tri = new Float32Array(tris);
  const T = owner.length;
  const cellOf = (x: number, z: number) => [Math.min(n - 1, Math.max(0, Math.floor((x - x0) / cell))), Math.min(n - 1, Math.max(0, Math.floor((z - z0) / cell)))];
  const boxes = new Int32Array(T * 4);
  for (let t = 0; t < T; t++) {
    const o = t * 9;
    const minX = Math.min(tri[o], tri[o + 3], tri[o + 6]), maxX = Math.max(tri[o], tri[o + 3], tri[o + 6]);
    const minZ = Math.min(tri[o + 2], tri[o + 5], tri[o + 8]), maxZ = Math.max(tri[o + 2], tri[o + 5], tri[o + 8]);
    const [i0, j0] = cellOf(minX, minZ), [i1, j1] = cellOf(maxX, maxZ);
    boxes.set([i0, j0, i1, j1], t * 4);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) counts[j * n + i]++;
  }
  const cells: Int32Array[] = new Array(n * n);
  for (let k = 0; k < n * n; k++) cells[k] = new Int32Array(counts[k]);
  counts.fill(0);
  for (let t = 0; t < T; t++) {
    const i0 = boxes[t * 4], j0 = boxes[t * 4 + 1], i1 = boxes[t * 4 + 2], j1 = boxes[t * 4 + 3];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cells[j * n + i][counts[j * n + i]++] = t;
  }
  stats.triangles = T;
  stats.ms = Math.round(performance.now() - t0);
  return { tri, owner: new Uint32Array(owner), pieces, cells, x0, z0, n, cell, stats };
}

export interface VisHit {
  t: number;
  y: number;
  /** Normal facing the ray's origin (x, y, z). */
  nx: number;
  ny: number;
  nz: number;
  /** Up component of the surface's own facing (its winding; reversed for back-sided materials): below 0 for an underside. */
  facingY: number;
  tag: string;
  key: string;
}

interface TriHit {
  n: [number, number, number];
  facingY: number;
}

/**
 * Möller–Trumbore against triangle `t` of the index; returns the hit distance or −1. Front-sided
 * materials are seen from the side their normal points to, so a horizontal ray from behind passes
 * (as the player's eye would); `bothSides` takes every crossing (vertical probes: a floor seen from
 * below is still a floor, and an underside tells a slab from a solid).
 */
function hitTriangle(ix: VisualIndex, t: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out: TriHit, bothSides = false): number {
  const a = ix.tri, o = t * 9;
  const e1x = a[o + 3] - a[o], e1y = a[o + 4] - a[o + 1], e1z = a[o + 5] - a[o + 2];
  const e2x = a[o + 6] - a[o], e2y = a[o + 7] - a[o + 1], e2z = a[o + 8] - a[o + 2];
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return -1;
  const side = ix.pieces[ix.owner[t]].side;
  // det = −d · (e1 × e2): positive when the ray meets the triangle's front (counter-clockwise) face.
  if (!bothSides) {
    if (side === THREE.FrontSide && det < 0) return -1;
    if (side === THREE.BackSide && det > 0) return -1;
  }
  const inv = 1 / det;
  const tx = ox - a[o], ty = oy - a[o + 1], tz = oz - a[o + 2];
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < -1e-6 || u > 1 + 1e-6) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -1e-6 || u + v > 1 + 1e-6) return -1;
  const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
  if (tt < 1e-6 || tt > maxT) return -1;
  let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  out.facingY = side === THREE.BackSide ? -ny : ny;
  if (nx * dx + ny * dy + nz * dz > 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  out.n = [nx, ny, nz];
  return tt;
}

const _n: TriHit = { n: [0, 1, 0], facingY: 1 };

/** Every drawn surface a vertical ray down from (x, yTop, z) crosses before yBottom, highest first. */
export function visDown(ix: VisualIndex, x: number, z: number, yTop: number, yBottom: number): VisHit[] {
  const i = Math.floor((x - ix.x0) / ix.cell), j = Math.floor((z - ix.z0) / ix.cell);
  if (i < 0 || j < 0 || i >= ix.n || j >= ix.n) return [];
  const list = ix.cells[j * ix.n + i];
  const out: VisHit[] = [];
  const maxT = yTop - yBottom;
  for (let k = 0; k < list.length; k++) {
    const t = list[k];
    const tt = hitTriangle(ix, t, x, yTop, z, 0, -1, 0, maxT, _n, true);
    if (tt < 0) continue;
    const p = ix.pieces[ix.owner[t]];
    out.push({ t: tt, y: yTop - tt, nx: _n.n[0], ny: _n.n[1], nz: _n.n[2], facingY: _n.facingY, tag: p.tag, key: p.key });
  }
  return out.sort((p, q) => q.y - p.y);
}

/** First drawn surface along a ray (any direction), or null. */
export function visFirst(ix: VisualIndex, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, reach: number, bothSides = false): VisHit | null {
  let best: VisHit | null = null;
  const seen = new Set<number>();
  // Walk the cells the ray's XZ footprint crosses (steps of half a cell).
  const steps = Math.ceil((reach / ix.cell) * 2) + 1;
  for (let s = 0; s <= steps; s++) {
    const f = Math.min(reach, (s * ix.cell) / 2);
    const i = Math.floor((ox + dx * f - ix.x0) / ix.cell), j = Math.floor((oz + dz * f - ix.z0) / ix.cell);
    if (i < 0 || j < 0 || i >= ix.n || j >= ix.n) continue;
    const key = j * ix.n + i;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = ix.cells[key];
    for (let k = 0; k < list.length; k++) {
      const t = list[k];
      const tt = hitTriangle(ix, t, ox, oy, oz, dx, dy, dz, best ? best.t : reach, _n, bothSides);
      if (tt < 0) continue;
      const p = ix.pieces[ix.owner[t]];
      best = { t: tt, y: oy + dy * tt, nx: _n.n[0], ny: _n.n[1], nz: _n.n[2], facingY: _n.facingY, tag: p.tag, key: p.key };
    }
    if (best && best.t < f - ix.cell) break;
  }
  return best;
}

/** The drawn walking surface under (x, z) between yTop and yBottom that a player standing at `floorY` sees (not overhead), or null. */
function visGround(ix: VisualIndex, x: number, z: number, yTop: number, yBottom: number, floorY: number): VisHit | null {
  const all = visDown(ix, x, z, yTop, yBottom);
  const surfs: Surf[] = all.map((h) => ({ y: h.y, ny: h.facingY, tag: h.tag }));
  for (let k = 0; k < all.length; k++) {
    if (all[k].facingY < COLUMN.upNy) continue;
    if (isOverhead(surfs[k], surfs, floorY)) continue;
    return all[k];
  }
  return null;
}

// ---------------------------------------------------------------- physics surfaces

const SHAPE: Record<number, string> = { 0: 'ball', 1: 'box', 2: 'capsule', 5: 'triangle', 6: 'trimesh', 7: 'heightfield', 8: 'compound', 9: 'convex', 10: 'cylinder', 12: 'roundbox', 14: 'roundcylinder' };

/** A collider's owner as a short label (who built it). */
export function describeOwner(game: Game, c: RAPIER.Collider): string {
  const o = game.physics.ownerOf(c) as unknown;
  const shape = SHAPE[c.shapeType()] ?? `shape${c.shapeType()}`;
  if (o === undefined || o === null) return `?:${shape}`;
  if (o === (game as Game & { terrain?: unknown }).terrain) return `terrain:${shape}`;
  if (typeof o === 'string') return `${o}:${shape}`;
  const r = o as { landmarkId?: string; city?: string; id?: string; name?: string; constructor?: { name?: string } };
  if (r.landmarkId) return `landmark:${r.landmarkId}:${shape}`;
  if (r.city) return `city:${r.city}:${shape}`;
  if (r.id) return `${String(r.id)}:${shape}`;
  if (r.name) return `${String(r.name)}:${shape}`;
  return `${r.constructor?.name ?? 'object'}:${shape}`;
}

export interface ColliderInfo {
  tag: string;
  shape: string;
  /** Centre (m). */
  at: [number, number, number];
  /** Box half extents, or [radius, halfHeight, 0] for cylinders and capsules (m). */
  size: [number, number, number] | null;
  /** Yaw (rad) when the rotation is about y only, else null. */
  yaw: number | null;
  /** Top of the shape (m), for boxes and cylinders. */
  top: number | null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
/** Small stable ids for collider handles (Rapier's handles print as denormal floats). */
const handleIds = new Map<number, number>();
const handleId = (h: number) => {
  let id = handleIds.get(h);
  if (id === undefined) handleIds.set(h, (id = handleIds.size + 1));
  return id;
};

/** A stable key for a collider (its shape and centre; a trimesh or heightfield also its handle) and its description. */
export function colliderInfo(game: Game, c: RAPIER.Collider): { key: string; info: ColliderInfo } {
  const t = c.translation(), q = c.rotation();
  const st = c.shapeType();
  const shape = SHAPE[st] ?? `shape${st}`;
  let size: ColliderInfo['size'] = null;
  let top: number | null = null;
  if (st === 1 || st === 12) {
    const h = c.halfExtents()!;
    size = [r2(h.x), r2(h.y), r2(h.z)];
    // Only exact for yaw-only rotations (the city's and landmarks' boxes).
    top = Math.abs(q.x) < 1e-4 && Math.abs(q.z) < 1e-4 ? t.y + h.y : null;
  } else if (st === 10 || st === 14 || st === 2) {
    size = [r2(c.radius()), r2(c.halfHeight()), 0];
    top = t.y + c.halfHeight() + (st === 2 ? c.radius() : 0);
  }
  const yaw = Math.abs(q.x) < 1e-4 && Math.abs(q.z) < 1e-4 ? r2(2 * Math.atan2(q.y, q.w)) : null;
  const at: [number, number, number] = [r2(t.x), r2(t.y), r2(t.z)];
  const key = st === 6 || st === 7 ? `${shape}#${handleId(c.handle)}` : `${shape}@${at[0]},${at[1]},${at[2]}`;
  return { key, info: { tag: describeOwner(game, c), shape, at, size, yaw, top: top === null ? null : r2(top) } };
}

export interface PhysHit {
  y: number;
  ny: number;
  tag: string;
  key: string;
  terrain: boolean;
}

/**
 * The tallest solid collider (box or cylinder) that contains the point, as [label, height], or null.
 * Trimeshes are hollow to Rapier and never contain anything.
 */
export function solidAround(game: Game, x: number, y: number, z: number): [string, number] | null {
  let bestH = -1, bestTag = '';
  game.physics.world.intersectionsWithPoint({ x, y, z }, (c) => {
    const t = c.shapeType();
    let h = 0;
    if (t === 1 || t === 12) h = c.halfExtents()!.y * 2;
    else if (t === 10 || t === 14) h = c.halfHeight() * 2;
    else return true;
    if (h > bestH) {
      bestH = h;
      bestTag = describeOwner(game, c);
    }
    return true;
  }, undefined, groups(ALL_LAYERS, Layer.World));
  return bestH < 0 ? null : [bestTag, bestH];
}

/**
 * Every World collider surface a vertical ray down from (x, yTop, z) crosses before yBottom, highest
 * first. Each solid (box, cylinder…) gives only its top: once hit it is excluded and the ray is
 * cast again from the same origin, so the inside of a solid (its bottom face, met on the way out)
 * never counts as a floor. Hollow shapes (trimesh, heightfield) are followed down surface by surface.
 */
export function physDown(game: Game, x: number, z: number, yTop: number, yBottom: number, colliders?: Map<string, ColliderInfo>): PhysHit[] {
  const out: PhysHit[] = [];
  const terrain = (game as Game & { terrain?: unknown }).terrain;
  const seen = new Set<number>();
  const keep = (c: RAPIER.Collider) => !seen.has(c.handle);
  let y = yTop;
  const dir = { x: 0, y: -1, z: 0 };
  for (let k = 0; k < 24 && y > yBottom; k++) {
    const ray = new RAPIER.Ray({ x, y, z }, dir);
    const hit = game.physics.world.castRayAndGetNormal(ray, y - yBottom, true, undefined, groups(ALL_LAYERS, Layer.World), undefined, undefined, keep);
    if (!hit) break;
    const st = hit.collider.shapeType();
    const hollow = st === 6 || st === 7;
    if (!hollow) seen.add(hit.collider.handle);
    // Starting inside a solid: its top is above the ray, so it is no floor here.
    if (hit.timeOfImpact <= 1e-5 && !hollow) continue;
    const hy = y - hit.timeOfImpact;
    const { key, info } = colliderInfo(game, hit.collider);
    if (colliders && !colliders.has(key)) colliders.set(key, info);
    out.push({ y: hy, ny: hit.normal.y, tag: info.tag, key, terrain: game.physics.ownerOf(hit.collider) === terrain });
    if (hollow) y = hy - 0.012;
  }
  return out;
}

/** Where a player capsule dropped from `fromY` at (x, z) comes to rest (feet height), or null if it falls past `minY`. */
export function capsuleDrop(game: Game, x: number, z: number, fromY: number, minY: number): number | null {
  const halfHeight = 0.55, radius = 0.35;
  const shape = new RAPIER.Capsule(halfHeight, radius);
  const cy = fromY + halfHeight + radius;
  const hit = game.physics.world.castShape({ x, y: cy, z }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 }, shape, 0, cy - minY, true, undefined, groups(ALL_LAYERS, Layer.World));
  if (!hit) return null;
  return fromY - hit.time_of_impact;
}

// ---------------------------------------------------------------- the sweep

export interface SweepOptions {
  /** Probe radius (m). The city's colliders exist only within ~30 m of the player's block, so stay under that. */
  radius?: number;
  /** Vertical probe spacing (m). */
  spacing?: number;
  /** Street samples every this many metres along an edge (wall rays). */
  edgeStep?: number;
  /** Skip the street (horizontal) probes. */
  noWalls?: boolean;
  /** Skip the seam lines. */
  noSeams?: boolean;
  /** Seam sample spacing (m). */
  seamStep?: number;
}

export interface Probe {
  x: number;
  y: number;
  z: number;
  /** Plan class at the probe (raster K), or −1. */
  cls: number;
}

export interface ColumnRecord extends Probe, ColumnFinding {}
export interface StandRecord extends Probe {
  kind: 'embedded' | 'headroom';
  /** Colliders intruding, as owner labels. */
  phys: string;
  physKey: string;
}
export interface WallRecord extends WallFinding, Probe {
  /** Ray direction (unit, XZ) and height above the ground. */
  dx: number;
  dz: number;
  h: number;
  reach: number;
}
export interface SeamRecord extends Probe, SeamFinding {
  /** Walking direction (unit, XZ). */
  dx: number;
  dz: number;
  phys: string;
  vis: string;
  physKey: string;
  visKey: string;
}

export interface SweepResult {
  columns: ColumnRecord[];
  stands: StandRecord[];
  walls: WallRecord[];
  seams: SeamRecord[];
  colliders: Record<string, ColliderInfo>;
  terrain: { samples: number; maxAbs: number; meanAbs: number; drawnMatches: number; otherMatches: number; neither: number; worst: [number, number, number, number] | null };
  counts: { probes: number; walkable: number; indoor: number; edges: number; rays: number; pinholes: number; seamSamples: number };
  index: VisualIndex['stats'];
  ms: number;
}

function cityClass(game: Game, x: number, z: number): number {
  const c = (game as Game & { city?: { classAt?: (x: number, z: number) => number } }).city;
  return c?.classAt ? c.classAt(x, z) : -1;
}

/** Terrain: the heights of the cell under (x, z) and the fractions across it. */
function terrainCell(game: Game, x: number, z: number): { h00: number; h10: number; h01: number; h11: number; tx: number; tz: number } | null {
  const hm = (game as Game & { heightmap?: { minX: number; minZ: number; spacing: number; nx: number; nz: number; heights: Float32Array } }).heightmap;
  if (!hm) return null;
  const fx = (x - hm.minX) / hm.spacing, fz = (z - hm.minZ) / hm.spacing;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  if (ix < 0 || iz < 0 || ix >= hm.nx - 1 || iz >= hm.nz - 1) return null;
  const i = iz * hm.nx + ix;
  return { h00: hm.heights[i], h10: hm.heights[i + 1], h01: hm.heights[i + hm.nx], h11: hm.heights[i + hm.nx + 1], tx: fx - ix, tz: fz - iz };
}

export function terrainDrawnAt(game: Game, x: number, z: number): number {
  const c = terrainCell(game, x, z);
  const hm = (game as Game & { heightmap?: { heightAt(x: number, z: number): number } }).heightmap;
  if (!c) return hm ? hm.heightAt(x, z) : 0;
  return terrainDrawnHeight(c.h00, c.h10, c.h01, c.h11, c.tx, c.tz);
}

const K_WATER = 7, K_OUTSIDE = 12;
/** A capsule that drops further than this below a drawn floor has fallen through it. */
const FALL = 1.5;
/** A solid taller than this around a drawn floor is a building the player is "inside" of (massing), not a mismatch. */
const INDOOR_HEIGHT = 2.2;

/** Audit the ground, the standing room, the street walls and seams around (cx, cz). The city must be primed there. */
export function sweep(game: Game, cx: number, cz: number, opts: SweepOptions = {}): SweepResult {
  const t0 = performance.now();
  const radius = opts.radius ?? 24;
  const spacing = opts.spacing ?? 1.25;
  flushPhysicsQueries(game);
  const ix = buildVisualIndex(game, cx, cz, radius + 4);
  const columns: ColumnRecord[] = [];
  const stands: StandRecord[] = [];
  const walls: WallRecord[] = [];
  const seams: SeamRecord[] = [];
  const colliders = new Map<string, ColliderInfo>();
  const used = new Set<string>();
  const counts = { probes: 0, walkable: 0, indoor: 0, edges: 0, rays: 0, pinholes: 0, seamSamples: 0 };
  const terr = { samples: 0, maxAbs: 0, sumAbs: 0, drawnMatches: 0, otherMatches: 0, neither: 0, worst: null as [number, number, number, number] | null };
  const terrainSvc = (game as Game & { terrain?: unknown }).terrain;
  const keyOf = (c: RAPIER.Collider) => {
    const { key, info } = colliderInfo(game, c);
    if (!colliders.has(key)) colliders.set(key, info);
    return key;
  };

  // ---- vertical probes
  const n = Math.ceil((radius * 2) / spacing);
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = cx - radius + i * spacing, z = cz - radius + j * spacing;
      if (Math.hypot(x - cx, z - cz) > radius) continue;
      const cls = cityClass(game, x, z);
      if (cls === K_WATER || cls === K_OUTSIDE) continue;
      const tDrawn = terrainDrawnAt(game, x, z);
      const yTop = tDrawn + 40, yBottom = tDrawn - 30;
      counts.probes++;
      const vis = visDown(ix, x, z, yTop, yBottom);
      const phys = physDown(game, x, z, yTop, yBottom, colliders);
      counts.rays += 2;
      const vSurf: Surf[] = vis.map((h) => ({ y: h.y, ny: h.facingY, tag: h.tag, key: h.key }));
      vSurf.push({ y: tDrawn, ny: 1, tag: 'terrain', key: 'terrain' });
      const pSurf: Surf[] = phys.map((h) => ({ y: h.y, ny: h.ny, tag: h.tag, key: h.key }));
      let f = compareColumn(vSurf, pSurf, tDrawn);
      // Indoors in a solid: the drawn floor lies inside a building-sized box or cylinder collider
      // (a lot's massing, a landmark's podium): the player can never be there, so it is not a
      // mismatch. A short solid around the drawn surface (a kerb or plinth box taller than its
      // picture) still counts.
      const visTopY = f ? f.visY : null;
      const inside = visTopY === null ? null : solidAround(game, x, visTopY + 0.1, z);
      if (inside && inside[1] > INDOOR_HEIGHT) {
        counts.indoor++;
        continue;
      }
      // A ray can slip through a crack between two collider pieces that a body cannot: a
      // fall-through counts only if a player's capsule dropped there falls too, and more than a
      // storey (`FALL`); a shorter drop is a drawn thing without a collider (a ghost or a sink).
      if (f && f.kind === 'fallthrough') {
        const rest = capsuleDrop(game, x, z, f.visY + 2, f.visY - 40);
        if (rest !== null && rest >= f.visY - 0.3) {
          counts.pinholes++;
          f = null;
        } else if (rest !== null && rest >= f.visY - FALL) {
          const d = rest - f.visY;
          f = { ...f, kind: -d > COLUMN.step ? 'ghost' : 'sink', delta: d, physY: rest, phys: 'capsule rest' };
        } else f = { ...f, delta: rest === null ? -40 : rest - f.visY, physY: rest ?? f.visY - 40 };
      }
      if (f) {
        columns.push({ x: +x.toFixed(2), y: +f.physY.toFixed(2), z: +z.toFixed(2), cls, ...f, delta: +f.delta.toFixed(3), physY: +f.physY.toFixed(3), visY: +f.visY.toFixed(3) });
        if (f.physKey) used.add(f.physKey);
      }
      // Standing room on the surface the player would stand on: a collider inside the capsule
      // with nothing drawn around it is an invisible block (next to a drawn wall it is only a
      // probe that landed within a body's width of the wall).
      const top = pSurf.filter((s) => s.ny >= COLUMN.upNy && s.y <= tDrawn + COLUMN.above + COLUMN.edge && s.y >= tDrawn - COLUMN.below - COLUMN.edge)[0];
      if (top && top.ny >= 0.7) {
        const tall = solidAround(game, x, top.y + 0.3, z);
        if (tall && tall[1] > INDOOR_HEIGHT) {
          counts.indoor++;
          continue;
        }
        counts.walkable++;
        for (const [h, kind] of [[0.5, 'embedded'], [0.95, 'embedded'], [1.45, 'headroom']] as const) {
          const hit = intruders(game, x, top.y + 0.05, z, h, 0.33, keyOf);
          if (!hit.length) continue;
          if (drawnNear(ix, x, top.y + 0.05 + h, z, 0.48)) continue; // not the floor itself (0.55 below the lowest sphere)
          stands.push({ x: +x.toFixed(2), y: +top.y.toFixed(2), z: +z.toFixed(2), cls, kind, phys: hit.map((k) => colliders.get(k)?.tag ?? k).join(', '), physKey: hit[0] });
          for (const k of hit) used.add(k);
          break;
        }
      }
      // Bare terrain: physics against the drawn triangulation and the bilinear height.
      if (top && top.tag.startsWith('terrain') && phys.length && vis.length === 0) {
        const c = terrainCell(game, x, z);
        if (c) {
          const d = top.y - tDrawn;
          terr.samples++;
          terr.sumAbs += Math.abs(d);
          if (Math.abs(d) > terr.maxAbs) {
            terr.maxAbs = Math.abs(d);
            terr.worst = [+x.toFixed(1), +top.y.toFixed(3), +z.toFixed(1), +d.toFixed(3)];
          }
          // Which diagonal: only where the two triangulations differ enough here to tell.
          const other = terrainOtherHeight(c.h00, c.h10, c.h01, c.h11, c.tx, c.tz);
          if (Math.abs(other - tDrawn) > 0.02) {
            if (Math.abs(d) < 0.01) terr.drawnMatches++;
            else if (Math.abs(top.y - other) < 0.01) terr.otherMatches++;
            else terr.neither++;
          }
        }
      }
    }
  }

  // ---- street walls and seams
  const streets = (game as Game & { streets?: { nodes: { x: number; z: number }[]; edges: [number, number, number][] } }).streets;
  if (streets && !(opts.noWalls && opts.noSeams)) {
    const step = opts.edgeStep ?? 1.5;
    const seamStep = opts.seamStep ?? 0.1;
    for (const [a, b, w] of streets.edges) {
      const A = streets.nodes[a], B = streets.nodes[b];
      if (!A || !B) continue;
      const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
      const L = Math.hypot(B.x - A.x, B.z - A.z);
      if (Math.hypot(mx - cx, mz - cz) > radius + L / 2 || L < 1e-3) continue;
      counts.edges++;
      const ex = (B.x - A.x) / L, ez = (B.z - A.z) / L;
      const across = Math.max(3, (w || 4) / 2 + 3);
      if (!opts.noWalls) {
        for (let s = step / 2; s < L; s += step) {
          const x = A.x + ex * s, z = A.z + ez * s;
          if (Math.hypot(x - cx, z - cz) > radius) continue;
          const g = game.physics.raycast({ x, y: terrainDrawnAt(game, x, z) + 6, z }, { x: 0, y: -1, z: 0 }, 12, Layer.World);
          if (!g || g.normal.y < 0.6) continue;
          const gy = g.point.y;
          const dirs: [number, number, number][] = [[-ez, ex, across], [ez, -ex, across], [ex, ez, 3], [-ex, -ez, 3]];
          for (const [dx, dz, reach] of dirs) {
            for (const h of [0.4, 1.2]) {
              counts.rays += 2;
              const ph = game.physics.raycast({ x, y: gy + h, z }, { x: dx, y: 0, z: dz }, reach, Layer.World);
              if (ph && ph.distance < 0.05) continue; // starts inside something: the column probes report it
              const ownerIsTerrain = ph ? game.physics.ownerOf(ph.collider) === terrainSvc : false;
              if (ownerIsTerrain) continue; // a bank: the terrain lens
              if (ph && ph.normal.y > 0.5) continue; // rising ground or a ramp ahead, not a wall (the column probes compare it)
              const vh = visFirst(ix, x, gy + h, z, dx, 0, dz, reach);
              if (vh && vh.ny > 0.5) continue; // the drawn ground rising ahead, likewise
              const pk = ph ? keyOf(ph.collider) : undefined;
              const f = compareWall(ph ? { dist: ph.distance, tag: describeOwner(game, ph.collider), key: pk } : null, vh ? { dist: vh.t, tag: vh.tag, key: vh.key } : null, reach);
              if (!f) continue;
              if (pk) used.add(pk);
              walls.push({ x: +x.toFixed(2), y: +gy.toFixed(2), z: +z.toFixed(2), cls: cityClass(game, x, z), dx: +dx.toFixed(3), dz: +dz.toFixed(3), h, reach, ...f, gap: f.gap === Infinity ? 99 : +f.gap.toFixed(2), physDist: f.physDist === null ? null : +f.physDist.toFixed(2), visDist: f.visDist === null ? null : +f.visDist.toFixed(2) });
            }
          }
        }
      }
      if (!opts.noSeams) {
        // The street's centre line, and lines across it every 8 m (kerbs, sidewalks and thresholds).
        const lines: [number, number, number, number, number][] = [[A.x, A.z, ex, ez, L]];
        for (let s = 4; s < L; s += 8) lines.push([A.x + ex * s + ez * across, A.z + ez * s - ex * across, -ez, ex, across * 2]);
        for (const [sx, sz, dx, dz, len] of lines) seamLine(game, ix, sx, sz, dx, dz, len, seamStep, cx, cz, radius, seams, counts, keyOf, used);
      }
    }
  }

  const colliderTable: Record<string, ColliderInfo> = {};
  for (const k of used) {
    const c = colliders.get(k);
    if (c) colliderTable[k] = c;
  }
  return {
    columns,
    stands,
    walls,
    seams,
    colliders: colliderTable,
    terrain: { samples: terr.samples, maxAbs: +terr.maxAbs.toFixed(3), meanAbs: terr.samples ? +(terr.sumAbs / terr.samples).toFixed(4) : 0, drawnMatches: terr.drawnMatches, otherMatches: terr.otherMatches, neither: terr.neither, worst: terr.worst },
    counts,
    index: ix.stats,
    ms: Math.round(performance.now() - t0),
  };
}

/**
 * Walk one line every `step` m, following the level a walker would (the surface nearest the last
 * one, within a step up or down), in the physics and in the picture, and record the seams.
 */
function seamLine(game: Game, ix: VisualIndex, sx: number, sz: number, dx: number, dz: number, len: number, step: number, cx: number, cz: number, radius: number, out: SeamRecord[], counts: SweepResult['counts'], keyOf: (c: RAPIER.Collider) => string, used: Set<string>) {
  const N = Math.floor(len / step) + 1;
  const ph: (number | null)[] = new Array(N).fill(null);
  const vh: (number | null)[] = new Array(N).fill(null);
  const pk: (string | null)[] = new Array(N).fill(null);
  const vk: (string | null)[] = new Array(N).fill(null);
  const pt: string[] = new Array(N).fill('');
  const vt: string[] = new Array(N).fill('');
  let pLevel: number | null = null, vLevel: number | null = null;
  for (let k = 0; k < N; k++) {
    const x = sx + dx * k * step, z = sz + dz * k * step;
    if (Math.hypot(x - cx, z - cz) > radius) {
      pLevel = vLevel = null;
      continue;
    }
    const cls = cityClass(game, x, z);
    if (cls === K_WATER || cls === K_OUTSIDE) {
      pLevel = vLevel = null;
      continue;
    }
    counts.seamSamples++;
    if (pLevel === null) {
      const g = game.physics.raycast({ x, y: terrainDrawnAt(game, x, z) + 3, z }, { x: 0, y: -1, z: 0 }, 6, Layer.World);
      if (!g || g.normal.y < 0.6) continue;
      pLevel = g.point.y;
    }
    const g = game.physics.raycast({ x, y: pLevel + 0.7, z }, { x: 0, y: -1, z: 0 }, 1.4, Layer.World);
    if (g && g.distance > 0.001 && g.normal.y >= 0.6) {
      ph[k] = g.point.y;
      pk[k] = keyOf(g.collider);
      pt[k] = describeOwner(game, g.collider);
      pLevel = g.point.y;
    } else pLevel = null;
    if (vLevel === null) vLevel = ph[k] ?? terrainDrawnAt(game, x, z);
    const v = visGround(ix, x, z, vLevel + 0.7, vLevel - 0.7, ph[k] ?? vLevel);
    const tY = terrainDrawnAt(game, x, z);
    const vy: number | null = v ? v.y : tY >= vLevel - 0.7 && tY <= vLevel + 0.7 ? tY : null;
    if (vy !== null) {
      vh[k] = vy;
      vk[k] = v ? v.key : 'terrain';
      vt[k] = v ? v.tag : 'terrain';
      vLevel = vy;
    } else vLevel = null;
  }
  counts.rays += 2 * N;
  for (const s of findSeams(ph, vh)) {
    const k = s.at;
    const x = sx + dx * k * step, z = sz + dz * k * step;
    // The piece on the side the seam belongs to: the higher one.
    const hi = (ph[k] ?? 0) >= (ph[k - 1] ?? 0) ? k : k - 1;
    const vhi = (vh[k] ?? 0) >= (vh[k - 1] ?? 0) ? k : k - 1;
    const physKey = pk[hi] ?? pk[k] ?? '';
    if (physKey) used.add(physKey);
    out.push({ ...s, x: +x.toFixed(2), y: +(ph[k] ?? 0).toFixed(3), z: +z.toFixed(2), cls: cityClass(game, x, z), dx: +dx.toFixed(3), dz: +dz.toFixed(3), phys: pt[hi] || pt[k], vis: vt[vhi] || vt[k], physKey, visKey: vk[vhi] ?? vk[k] ?? '' });
  }
}

/** Is any drawn triangle within `r` of the point (exact point-to-triangle distance)? */
function drawnNear(ix: VisualIndex, x: number, y: number, z: number, r: number): boolean {
  const i0 = Math.max(0, Math.floor((x - r - ix.x0) / ix.cell)), i1 = Math.min(ix.n - 1, Math.floor((x + r - ix.x0) / ix.cell));
  const j0 = Math.max(0, Math.floor((z - r - ix.z0) / ix.cell)), j1 = Math.min(ix.n - 1, Math.floor((z + r - ix.z0) / ix.cell));
  const r2 = r * r;
  const P = new THREE.Vector3(x, y, z), Q = new THREE.Vector3();
  const tri = new THREE.Triangle();
  const a = ix.tri;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const list = ix.cells[j * ix.n + i];
      for (let k = 0; k < list.length; k++) {
        const o = list[k] * 9;
        if (Math.min(a[o + 1], a[o + 4], a[o + 7]) > y + r || Math.max(a[o + 1], a[o + 4], a[o + 7]) < y - r) continue;
        tri.a.set(a[o], a[o + 1], a[o + 2]);
        tri.b.set(a[o + 3], a[o + 4], a[o + 5]);
        tri.c.set(a[o + 6], a[o + 7], a[o + 8]);
        tri.closestPointToPoint(P, Q);
        if (Q.distanceToSquared(P) <= r2) return true;
      }
    }
  }
  return false;
}

/** World colliders (not the terrain) overlapping a sphere of `r` at `h` above the feet, as collider keys. */
function intruders(game: Game, x: number, feetY: number, z: number, h: number, r: number, keyOf: (c: RAPIER.Collider) => string): string[] {
  const terrain = (game as Game & { terrain?: unknown }).terrain;
  const out = new Set<string>();
  for (const o of game.physics.overlapSphere({ x, y: feetY + h, z }, r, Layer.World)) {
    if (o.owner === terrain) continue;
    out.add(keyOf(o.collider));
  }
  return [...out];
}

// ---------------------------------------------------------------- confirming with the real player

/** Wait `n` rendered frames, or `maxMs`, whichever comes first. */
function frames(n: number, maxMs = 8000): Promise<void> {
  return new Promise((res) => {
    let k = 0;
    const t0 = performance.now();
    const tick = () => {
      if (++k >= n || performance.now() - t0 > maxMs) res();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * After a teleport, wait until what is drawn around (cx, cz) has settled: the far stand-ins and
 * coarse levels switch to near over a few frames, and in the first frames whole batches can be
 * missing. At least `minFrames`, then until two indexes in a row agree and no far piece is near.
 */
export async function settleView(game: Game, cx: number, cz: number, radius: number, minFrames = 4, maxMs = 12000) {
  const t0 = performance.now();
  await frames(minFrames, maxMs);
  let prev = -1, n = minFrames;
  for (;;) {
    const ix = buildVisualIndex(game, cx, cz, radius);
    const tris = ix.stats.triangles;
    if (tris === prev && ix.stats.far === 0) return { frames: n, ms: Math.round(performance.now() - t0), triangles: tris, far: 0, settled: true };
    if (performance.now() - t0 > maxMs) return { frames: n, ms: Math.round(performance.now() - t0), triangles: tris, far: ix.stats.far, settled: false };
    prev = tris;
    await frames(2, maxMs);
    n += 2;
  }
}

/**
 * Make sure the player can move: close any screen or dialogue the sweep ran into (a guard's arrest
 * talk, a quest scene: they pause the game and turn the input off), clear a bounty. Returns what
 * was open, for the record.
 */
export function unblock(game: Game): string | null {
  // UIManager keeps its stack and blockers private: read them as data (a dev tool).
  const ui = (game as unknown as { ui?: { stack?: { constructor?: { name?: string } }[]; blockers?: Set<string>; closeAll?: () => void; block?: (r: string, on: boolean) => void } }).ui;
  const open = [...(ui?.stack ?? []).map((m) => m.constructor?.name ?? 'modal'), ...(ui?.blockers ? [...ui.blockers] : [])];
  const was = open.length || game.paused || !game.input.enabled ? `${open.join(',') || '-'}${game.paused ? ' paused' : ''}${game.input.enabled ? '' : ' input-off'}` : null;
  try {
    ui?.closeAll?.();
    for (const b of [...(ui?.blockers ?? [])]) ui?.block?.(b, false);
  } catch {
    /* best effort */
  }
  game.paused = false;
  game.input.enabled = true;
  try {
    (game as Game & { console?: { exec?: (c: string) => unknown } }).console?.exec?.('clearbounty');
  } catch {
    /* optional */
  }
  return was;
}

export interface WalkIntoResult {
  /** Progress along the push (m) when the body stopped. */
  progress: number;
  /** Where the body stopped (feet). */
  at: [number, number, number];
  /** Clear space from the body's edge (radius 0.35) to the drawn wall along the push, or null without a drawn wall. */
  standoff: number | null;
  /** The collider the body rests against, if any within 0.6 m at knee and chest height. */
  against: string | null;
  frames: number;
  seconds: number;
  /** A screen or dialogue that had to be closed first. */
  unblocked?: string;
}

/**
 * Put the player at (x, z) on the ground, face (dx, dz) and hold W (walk speed) until the body
 * stops (under 4 cm in 40 frames) or `reach` m are covered; report where it stopped relative to
 * the drawn wall `visDist` m away.
 */
export async function walkInto(game: Game, x: number, z: number, dx: number, dz: number, reach: number, visDist: number | null): Promise<WalkIntoResult> {
  const blocked = unblock(game);
  const p = game.player;
  const inp = game.input;
  const gy = game.physics.raycast({ x, y: terrainDrawnAt(game, x, z) + 6, z }, { x: 0, y: -1, z: 0 }, 12, Layer.World)?.point.y ?? terrainDrawnAt(game, x, z);
  p.teleport({ x, y: gy + 0.05, z }, Math.atan2(dx, dz));
  p.yaw = Math.atan2(-dx, -dz);
  p.walkMode = true;
  p.sneaking = false;
  await frames(20, 4000);
  const sx = p.position.x, sz = p.position.z;
  const t0 = performance.now();
  inp.simulate('KeyW', true);
  let last = { x: p.position.x, z: p.position.z, f: 0 };
  let progress = 0, f = 0;
  for (;;) {
    await frames(1, 1000);
    f++;
    progress = (p.position.x - sx) * dx + (p.position.z - sz) * dz;
    if (progress >= reach) break;
    if (f - last.f >= 40) {
      if (Math.hypot(p.position.x - last.x, p.position.z - last.z) < 0.04) break;
      last = { x: p.position.x, z: p.position.z, f };
    }
    if (f > 600 || performance.now() - t0 > 30000) break;
  }
  inp.simulate('KeyW', false);
  let against: string | null = null;
  for (const h of [0.4, 1.2]) {
    const hit = game.physics.raycast({ x: p.position.x, y: p.position.y + h, z: p.position.z }, { x: dx, y: 0, z: dz }, 0.6, Layer.World);
    if (hit) {
      against = describeOwner(game, hit.collider);
      break;
    }
  }
  p.walkMode = false;
  const offset = (sx - x) * dx + (sz - z) * dz;
  return {
    progress: +progress.toFixed(2),
    at: [+p.position.x.toFixed(2), +p.position.y.toFixed(2), +p.position.z.toFixed(2)],
    standoff: visDist === null ? null : +(visDist - offset - progress - 0.35).toFixed(2),
    against,
    frames: f,
    seconds: +((performance.now() - t0) / 1000).toFixed(1),
    ...(blocked ? { unblocked: blocked } : {}),
  };
}

export interface WalkOverResult {
  /** Did the body pass within 0.4 m of the point? */
  reached: boolean;
  /** Feet height minus the drawn ground at the nearest pass (m): + floats, − sinks. */
  feetAboveDrawn: number | null;
  /** The drawn ground height at the point and the feet height at the nearest pass. */
  drawnY: number;
  feetY: number | null;
  nearest: number;
  at: [number, number, number];
  frames: number;
  seconds: number;
  unblocked?: string;
}

/**
 * Walk the player through (x, z) from `back` m before it along (dx, dz) to `back` m past it and
 * report the feet height when the body was nearest the point, against the drawn ground there.
 */
export async function walkOver(game: Game, x: number, z: number, dx: number, dz: number, back: number, drawnY: number): Promise<WalkOverResult> {
  const blocked = unblock(game);
  const p = game.player;
  const inp = game.input;
  const sx = x - dx * back, sz = z - dz * back;
  const gy = game.physics.raycast({ x: sx, y: terrainDrawnAt(game, sx, sz) + 6, z: sz }, { x: 0, y: -1, z: 0 }, 12, Layer.World)?.point.y ?? terrainDrawnAt(game, sx, sz);
  p.teleport({ x: sx, y: gy + 0.05, z: sz }, Math.atan2(dx, dz));
  p.yaw = Math.atan2(-dx, -dz);
  p.walkMode = true;
  p.sneaking = false;
  await frames(20, 4000);
  const t0 = performance.now();
  inp.simulate('KeyW', true);
  let nearest = Infinity, feetY: number | null = null;
  let last = { x: p.position.x, z: p.position.z, f: 0 };
  let at: [number, number, number] = [0, 0, 0];
  let f = 0;
  for (;;) {
    await frames(1, 1000);
    f++;
    const d = Math.hypot(p.position.x - x, p.position.z - z);
    if (d < nearest) {
      nearest = d;
      feetY = p.position.y;
      at = [+p.position.x.toFixed(2), +p.position.y.toFixed(2), +p.position.z.toFixed(2)];
    }
    const progress = (p.position.x - sx) * dx + (p.position.z - sz) * dz;
    if (progress >= 2 * back) break;
    if (f - last.f >= 50) {
      if (Math.hypot(p.position.x - last.x, p.position.z - last.z) < 0.05) break;
      last = { x: p.position.x, z: p.position.z, f };
    }
    if (f > 600 || performance.now() - t0 > 30000) break;
  }
  inp.simulate('KeyW', false);
  p.walkMode = false;
  const reached = nearest <= 0.4;
  return { reached, feetAboveDrawn: reached && feetY !== null ? +(feetY - drawnY).toFixed(3) : null, drawnY: +drawnY.toFixed(3), feetY: feetY === null ? null : +feetY.toFixed(3), nearest: +nearest.toFixed(2), at, frames: f, seconds: +((performance.now() - t0) / 1000).toFixed(1), ...(blocked ? { unblocked: blocked } : {}) };
}

/** A direction from (x, z) along which the ground is level and the way is open for `len` m, or null. */
export function openApproach(game: Game, x: number, z: number, y: number, len: number): [number, number] | null {
  let best: [number, number] | null = null, bestScore = -1;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const dx = Math.cos(a), dz = Math.sin(a);
    let ok = true, score = 0;
    for (let s = 0.5; s <= len; s += 0.5) {
      const px = x + dx * s, pz = z + dz * s;
      const g = game.physics.raycast({ x: px, y: y + 3, z: pz }, { x: 0, y: -1, z: 0 }, 6, Layer.World);
      if (!g || Math.abs(g.point.y - y) > 0.35) {
        ok = false;
        break;
      }
      score += 1;
    }
    if (!ok) continue;
    if (game.physics.raycast({ x, y: y + 0.6, z }, { x: dx, y: 0, z: dz }, len + 0.5, Layer.World)) continue;
    if (game.physics.raycast({ x, y: y + 1.3, z }, { x: dx, y: 0, z: dz }, len + 0.5, Layer.World)) continue;
    if (score > bestScore) {
      bestScore = score;
      best = [dx, dz];
    }
  }
  return best;
}

/** The surfaces under a point, for digging into one finding from the console (`__collision.at(x, z)`). */
export function surfacesAt(game: Game, x: number, z: number) {
  const tDrawn = terrainDrawnAt(game, x, z);
  const ix = buildVisualIndex(game, x, z, 3);
  const hm = (game as Game & { heightmap?: { heightAt(x: number, z: number): number } }).heightmap;
  const colliders = new Map<string, ColliderInfo>();
  return {
    terrainDrawn: tDrawn,
    terrainBilinear: hm?.heightAt(x, z),
    drawn: visDown(ix, x, z, tDrawn + 40, tDrawn - 30).map((h) => ({ y: +h.y.toFixed(3), facing: +h.facingY.toFixed(2), tag: h.tag, key: h.key })),
    physics: physDown(game, x, z, tDrawn + 40, tDrawn - 30, colliders).map((h) => ({ y: +h.y.toFixed(3), ny: +h.ny.toFixed(2), tag: h.tag, key: h.key, info: colliders.get(h.key) })),
    cls: cityClass(game, x, z),
  };
}

/** Every collider within `r` of a point (the console's `__collision.near(x, y, z)`). */
export function collidersNear(game: Game, x: number, y: number, z: number, r: number) {
  return game.physics.overlapSphere({ x, y, z }, r, Layer.World).map((o) => colliderInfo(game, o.collider));
}

/**
 * A camera `dist` m from (x, y, z) and `h` m above it, looking at `lookH` above it, from the
 * direction with the clearest view (three parallel lines of sight, physics and picture, both
 * sides of every triangle): [camX, camY, camZ, targetX, targetY, targetZ].
 */
export function cameraFor(game: Game, x: number, y: number, z: number, dist: number, h: number, lookH: number): number[] {
  const ix = buildVisualIndex(game, x, z, dist + 3);
  let best: { free: number; cam: number[] } | null = null;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2;
    const dx = Math.cos(a), dz = Math.sin(a);
    let free = 1;
    for (const off of [0, -0.6, 0.6]) {
      const ox = x - dz * off, oz = z + dx * off;
      const from = { x: ox, y: y + lookH, z: oz };
      const to = { x: ox + dx * dist, y: y + h, z: oz + dz * dist };
      const L = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
      const d = { x: (to.x - from.x) / L, y: (to.y - from.y) / L, z: (to.z - from.z) / L };
      const ph = game.physics.raycast(from, d, L + 0.4, Layer.World);
      const vh = visFirst(ix, from.x, from.y, from.z, d.x, d.y, d.z, L + 0.4, true);
      free = Math.min(free, Math.min(ph ? ph.distance : L + 0.4, vh ? vh.t : L + 0.4) / (L + 0.4));
    }
    if (!best || free > best.free) best = { free, cam: [x + dx * dist, y + h, z + dz * dist, x, y + lookH, z] };
    if (free >= 1) break;
  }
  return best!.cam;
}

/** Install the hooks `scripts/audit/collision.mjs` calls (`window.__collision`). */
export function installCollisionAudit(getGame: () => Game) {
  (window as unknown as { __collision: unknown }).__collision = {
    sweep: (cx: number, cz: number, opts?: SweepOptions) => sweep(getGame(), cx, cz, opts),
    walkInto: (x: number, z: number, dx: number, dz: number, reach: number, visDist: number | null) => walkInto(getGame(), x, z, dx, dz, reach, visDist),
    walkOver: (x: number, z: number, dx: number, dz: number, back: number, drawnY: number) => walkOver(getGame(), x, z, dx, dz, back, drawnY),
    openApproach: (x: number, z: number, y: number, len: number) => openApproach(getGame(), x, z, y, len),
    at: (x: number, z: number) => surfacesAt(getGame(), x, z),
    near: (x: number, y: number, z: number, r = 1) => collidersNear(getGame(), x, y, z, r),
    drop: (x: number, z: number, fromY: number) => capsuleDrop(getGame(), x, z, fromY, fromY - 40),
    cameraFor: (x: number, y: number, z: number, dist = 4.5, h = 2.2, lookH = 0.6) => cameraFor(getGame(), x, y, z, dist, h, lookH),
    frames,
    unblock: () => unblock(getGame()),
    settleView: (cx: number, cz: number, radius: number, minFrames?: number, maxMs?: number) => settleView(getGame(), cx, cz, radius, minFrames, maxMs),
    terrainDrawnAt: (x: number, z: number) => terrainDrawnAt(getGame(), x, z),
    bilinear: terrainBilinear,
  };
}
