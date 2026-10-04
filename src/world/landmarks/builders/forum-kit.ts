/**
 * Shared helpers for the Forum Romanum and Velia landmark builders (forum-*.ts).
 *
 * - `landmark()` wraps a build function and produces the LandmarkBuild: the near version at the
 *   context detail plus, for big landmarks, a cheap 'low' far stand-in, collecting spots once.
 * - Ground helpers: foundations that reach the lowest terrain under an outline (nothing floats),
 *   human-scale flights of steps (riser ≤ 0.2 m, tread 0.33 m) with per-step box colliders,
 *   paving draped on the terrain.
 * - `col()`: columns in three tiers. 'hero' is the kit's full column, 'low' the kit's far column,
 *   'mid' a cheaper composition (fluted shaft, simple base, kit capital) for long colonnades.
 * - Small furniture of the Forum: bronze ship rams, balustrades (plutei), altars, statue bases,
 *   painted materials for polychromy, trees, and fires (light-pool requests deferred until the
 *   sky module is installed).
 *
 * Local frames follow the landmark contract: origin at the landmark centre on its pad, facade
 * towards −z, y = 0 is the pad. Monumental sizes come in real metres × S; human-scale parts are 1:1.
 */
import * as THREE from 'three';
import type { Game } from '../../../core/Game';
import { Draw } from '../../../arch/fabric/draw';
import { buildPlaza } from '../../../arch/fabric/streets';
import type { Polygon } from '../../../arch/fabric/types';
import { capitalPieces } from '../../../arch/classical/capitals';
import { column } from '../../../arch/classical/column';
import { ORDER_PROPORTIONS, columnDims, entasisRadius, type Order } from '../../../arch/classical/orders';
import { ProfileBuilder, T, TRS, gridSurface, lathe, makeGeometry, mul, type V2 } from '../../../arch/common/geom';
import { inscriptionPanel, type InscriptionStyle } from '../../../arch/common/inscription';
import { stairs } from '../../../arch/common/stairs';
import { prism } from '../../../arch/common/walls';
import { Forest } from '../../../arch/vegetation/Forest';
import type { TreeSpecies } from '../../../arch/vegetation/species';
import { vegetation } from '../../../arch/vegetation/system';
import { UV_METERS } from '../../../gfx/textures/catalog';
import { MeshBuilder, type ColliderSpec } from '../../../gfx/MeshBuilder';
import { placeProp } from '../../../arch/props';
import type { MaterialId } from '../../../gfx/materialIds';
import { ROADS } from '../../../data/atlas';
import { toGame } from '../../coords';
import type { LandmarkBuild, LandmarkContext, Spot } from '../types';
import { forumInteractions } from './forum-interactions';

export type Detail = 'high' | 'low';
export type { V2 };

// ---------------------------------------------------------------- build wrapper

/** What a forum build function receives. */
export interface Part {
  ctx: LandmarkContext;
  b: MeshBuilder;
  d: Draw;
  detail: Detail;
  hi: boolean;
  /** WORLD_SCALE. */
  S: number;
  /** Spots are only collected on the first (near) pass. */
  spot(id: string, kind: string, x: number, y: number, z: number, heading?: number): void;
  /** True on the near pass (colliders and spots count); false while building the far stand-in. */
  main: boolean;
  /** Paved patches laid on the terrain by `pave()` (near pass): spots on them stand on the paving. */
  paved: PavedPatch[];
}

export interface PavedPatch {
  poly: V2[];
  holes: V2[][];
  lift: number;
}

export interface LandmarkOpts {
  /** Build a 'low' far stand-in and show the near version only within this distance (m). */
  near?: number;
  /** Override cull distance when there is no far stand-in. */
  cull?: number;
}

/** Runs `fn` for the near version (and the far stand-in when `near` is set) and packages the result. */
export function landmark(ctx: LandmarkContext, fn: (p: Part) => void, o: LandmarkOpts = {}): LandmarkBuild {
  const spots: Spot[] = [];
  const paved: PavedPatch[] = [];
  const make = (detail: Detail, main: boolean) => {
    const b = ctx.builder();
    const p: Part = {
      ctx,
      b,
      d: new Draw(b),
      detail,
      hi: detail === 'high',
      S: ctx.S,
      main,
      paved,
      spot(id, kind, x, y, z, heading) {
        if (main) spots.push({ id, kind, position: new THREE.Vector3(x, y, z), heading });
      },
    };
    fn(p);
    return b;
  };
  const near = make(ctx.detail, true);
  settleSpots(ctx, near.colliders, spots, paved);
  forumInteractions(ctx, spots);
  const out: LandmarkBuild = { object: near.build(ctx.lm.id), colliders: near.colliders, spots };
  if (o.near && ctx.detail === 'high') {
    const far = make('low', false);
    out.far = far.build(`${ctx.lm.id}:far`);
    out.cullDistance = o.near;
  } else if (o.cull) out.cullDistance = o.cull;
  return out;
}

/**
 * Build part of a landmark in a frame turned by `angle` (radians about y) and moved by `offset`
 * (x, z) in the landmark's own frame: `fn` draws in the turned frame (its groundAt, spots and
 * colliders are carried over), e.g. an arch whose passage must lie along a street, not along the
 * atlas bearing.
 */
export function turned(p: Part, angle: number, offset: V2, fn: (q: Part) => void) {
  const b = p.ctx.builder();
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // frame → landmark: x' = x c + z s + ox, z' = −x s + z c + oz
  const ctx: LandmarkContext = { ...p.ctx, groundAt: (x, z) => p.ctx.groundAt(x * c + z * s + offset[0], -x * s + z * c + offset[1]) };
  const q: Part = {
    ...p,
    ctx,
    b,
    d: new Draw(b),
    spot: (id, kind, x, y, z, heading) => p.spot(id, kind, x * c + z * s + offset[0], y, -x * s + z * c + offset[1], (heading ?? 0) + angle),
  };
  fn(q);
  p.b.append(b, new THREE.Matrix4().makeRotationY(angle).setPosition(offset[0], 0, offset[1]));
}

// ---------------------------------------------------------------- spot settling

/** Spot kinds where a person (or the player) stands: they must be clear of every collider. */
const STANDING = new Set(['npc', 'vendor', 'stall', 'spawn', 'door', 'shrine', 'inscription', 'vista', 'container']);
/** How far (m) a spot may be nudged to get clear, per kind: shopkeepers and idlers move freely, doors hardly. */
const NUDGE: Record<string, number> = { npc: 2.2, vendor: 2.2, stall: 2.2, spawn: 1.5, door: 1.2, shrine: 1.2, inscription: 1.2, vista: 1.2, container: 1.2 };

interface Solid {
  cx: number;
  cz: number;
  bottom: number;
  top: number;
  hx: number;
  hz: number;
  r: number;
  /** Inverse yaw of a box (xz test in box space); null for a cylinder. */
  inv: THREE.Quaternion | null;
  tilted: boolean;
}

function solidsOf(cols: readonly ColliderSpec[]): Solid[] {
  const out: Solid[] = [];
  for (const c of cols) {
    if (c.kind === 'box') {
      const q = c.rotation ?? new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      out.push({ cx: c.center.x, cz: c.center.z, bottom: c.center.y - c.half.y, top: c.center.y + c.half.y, hx: c.half.x, hz: c.half.z, r: 0, inv: q.clone().invert(), tilted: Math.abs(up.y) < 0.999 });
    } else if (c.kind === 'cylinder') {
      out.push({ cx: c.center.x, cz: c.center.z, bottom: c.center.y - c.halfHeight, top: c.center.y + c.halfHeight, hx: 0, hz: 0, r: c.radius, inv: null, tilted: false });
    }
  }
  return out;
}

const _sv = new THREE.Vector3();

function inPoly(x: number, z: number, poly: readonly V2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Does a solid's xz footprint, grown by `pad`, contain (x, z)? */
function inFootprint(s: Solid, x: number, z: number, pad: number): boolean {
  if (!s.inv) return Math.hypot(x - s.cx, z - s.cz) <= s.r + pad;
  _sv.set(x - s.cx, 0, z - s.cz).applyQuaternion(s.inv);
  const grow = s.tilted ? s.hx * 0 + 0.2 : 0;
  return Math.abs(_sv.x) <= s.hx + pad + grow && Math.abs(_sv.z) <= s.hz + pad + grow;
}

/**
 * Put every standing spot (an NPC, a vendor, a door, a reading place…) on a floor and clear of the
 * colliders: its height snaps to the walking surface under it (a box top within a step, else the
 * terrain, where the paving lies a few centimetres above), and a spot that stands inside furniture,
 * a pier or a counter moves to the nearest free point within `NUDGE[kind]` metres. Seats ('sit')
 * are left alone: they sit in their furniture on purpose. Builders then place spots where they
 * mean them and this pass keeps them honest on the real terrain.
 */
export function settleSpots(ctx: LandmarkContext, cols: readonly ColliderSpec[], spots: Spot[], paved: readonly PavedPatch[] = []) {
  const solids = solidsOf(cols);
  const R = 0.34;
  const near = (x: number, z: number, pad: number) => solids.filter((s) => inFootprint(s, x, z, pad));
  /** The walking surface under (x, z) at about height y: a box top within a step, else the terrain + paving. */
  const floorAt = (x: number, z: number, y: number): number => {
    let best = -Infinity;
    for (const s of near(x, z, 0.05)) if (!s.tilted && s.top >= y - 0.5 && s.top <= y + 0.25 && s.top > best) best = s.top;
    if (best > -Infinity) return best;
    const g = ctx.groundAt(x, z);
    // paving laid on the terrain here (the highest patch wins)
    let lift = 0.07;
    for (const pv of paved) if (pv.lift > lift - 0.01 && inPoly(x, z, pv.poly) && !pv.holes.some((h) => inPoly(x, z, h))) lift = Math.max(lift, pv.lift + 0.01);
    return Math.abs(g - y) < 0.7 + lift ? g + lift : y;
  };
  const blocked = (x: number, z: number, y: number) => near(x, z, R).some((s) => s.top > y + 0.12 && s.bottom < y + 1.75);
  for (const sp of spots) {
    if (!STANDING.has(sp.kind)) continue;
    const { x, z } = sp.position;
    const y0 = floorAt(x, z, sp.position.y);
    let y = y0;
    if (!blocked(x, z, y)) {
      sp.position.y = y;
      continue;
    }
    const maxR = NUDGE[sp.kind] ?? 1.2;
    let found = false;
    for (let r = 0.15; r <= maxR && !found; r += 0.15) {
      const n = Math.max(8, Math.round((Math.PI * 2 * r) / 0.15));
      for (let k = 0; k < n && !found; k++) {
        const a = (k / n) * Math.PI * 2 + 0.7;
        const nx = x + Math.cos(a) * r;
        const nz = z + Math.sin(a) * r;
        y = floorAt(nx, nz, sp.position.y);
        if (blocked(nx, nz, y)) continue;
        // keep the floor level of the spot (no hopping onto a counter or a podium, or down a flight)
        if (y > y0 + 0.2 || y < y0 - 0.3) continue;
        sp.position.set(nx, y, nz);
        found = true;
      }
    }
  }
}

// ---------------------------------------------------------------- ground

/** Terrain under the outline (sampled along edges every ~2 m and at the centroid), min and max, relative to the pad. */
export function groundRange(ctx: LandmarkContext, pts: readonly V2[], step = 2): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    cx += ax;
    cz += az;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) {
      const g = ctx.groundAt(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
      min = Math.min(min, g);
      max = Math.max(max, g);
    }
  }
  const g = ctx.groundAt(cx / pts.length, cz / pts.length);
  return { min: Math.min(min, g), max: Math.max(max, g) };
}

/** Rectangle outline [x0,z0]-[x1,z1]. */
export function rect(x0: number, z0: number, x1: number, z1: number): V2[] {
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
}

/**
 * Solid masonry from `yTop` down below the lowest terrain under `pts` (so a building on a slope or
 * an uneven pad never floats). Adds nothing when the ground is everywhere at or above yTop.
 */
export function foundation(p: Part, pts: V2[], yTop: number, mat: MaterialId = 'travertine', collide = false): number {
  const { min } = groundRange(p.ctx, pts);
  if (min >= yTop - 0.02) return yTop;
  const y0 = min - 0.4;
  p.b.add(prism(pts, y0, yTop), mat);
  if (collide) {
    const xs = pts.map((q) => q[0]);
    const zs = pts.map((q) => q[1]);
    p.d.solid(Math.min(...xs), y0, Math.min(...zs), Math.max(...xs), yTop, Math.max(...zs));
  }
  return y0;
}

/** Steps (riser ≤ `maxRise`, tread `run`) from y = 0 up to `height`, climbing toward +z of `at`, centred on x = 0. */
export function flight(b: MeshBuilder, at: THREE.Matrix4, width: number, height: number, mat: MaterialId = 'travertine', run = 0.33, maxRise = 0.2): { depth: number; count: number; rise: number } {
  if (height <= 0.02) return { depth: 0, count: 0, rise: 0 };
  const count = Math.max(1, Math.ceil(height / maxRise));
  const rise = height / count;
  stairs(b, { width, rise, run, count, material: mat }, at);
  return { depth: count * run, count, rise };
}

/** Pave a local polygon over the terrain (lift above the ground), optional holes. Collider: trimesh. */
export function pave(p: Part, poly: V2[], o: { material?: MaterialId; lift?: number; exclude?: V2[][]; cell?: number; skirt?: number; collide?: boolean } = {}) {
  if (p.main) p.paved.push({ poly, holes: o.exclude ?? [], lift: o.lift ?? 0.06 });
  buildPlaza(p.b, poly as Polygon, (x, z) => p.ctx.groundAt(x, z), {
    material: o.material ?? 'paving_travertine',
    lift: o.lift ?? 0.06,
    exclude: o.exclude as Polygon[] | undefined,
    cell: o.cell ?? (p.hi ? 2.5 : 6),
    skirt: o.skirt ?? 0.35,
    collide: p.main && (o.collide ?? true),
  });
}

/** Thin paved slab of fixed height (local floor), e.g. a raised enclosure floor. */
export function slab(p: Part, pts: V2[], y0: number, y1: number, mat: MaterialId, collide = true) {
  p.b.add(prism(pts, y0, y1), mat, undefined, { castShadow: false });
  if (collide) {
    const xs = pts.map((q) => q[0]);
    const zs = pts.map((q) => q[1]);
    p.d.solid(Math.min(...xs), y0, Math.min(...zs), Math.max(...xs), y1, Math.max(...zs));
  }
}

// ---------------------------------------------------------------- world transforms

/** Local → world matrix of a landmark (the same transform buildLandmarks applies). */
export function localToWorld(ctx: LandmarkContext): THREE.Matrix4 {
  const [gx, gz] = toGame(ctx.lm.center[0], ctx.lm.center[1]);
  const hm = ctx.game.heightmap;
  const y = hm ? hm.heightAt(gx, gz) : 0;
  return new THREE.Matrix4().makeRotationY(-ctx.lm.rotation * (Math.PI / 180)).setPosition(gx, y, gz);
}

/** Atlas real-metre point → this landmark's local frame (x, z in game metres). */
export function atlasToLocal(ctx: LandmarkContext, x: number, z: number): V2 {
  const th = (ctx.lm.rotation * Math.PI) / 180;
  const dx = (x - ctx.lm.center[0]) * ctx.S;
  const dz = (z - ctx.lm.center[1]) * ctx.S;
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [dx * c + dz * s, -dx * s + dz * c];
}

/** This landmark's local frame (game metres) → atlas real metres (inverse of atlasToLocal). */
export function localToAtlas(ctx: LandmarkContext, lx: number, lz: number): [number, number] {
  const th = (ctx.lm.rotation * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const dx = lx * c - lz * s;
  const dz = lx * s + lz * c;
  return [ctx.lm.center[0] + dx / ctx.S, ctx.lm.center[1] + dz / ctx.S];
}

/** An atlas road in this landmark's local frame: centreline points (game metres) and half width. */
export function roadLocal(ctx: LandmarkContext, id: string): { pts: V2[]; hw: number } | null {
  const r = ROADS.find((x) => x.id === id);
  if (!r) return null;
  return { pts: r.points.map(([x, z]) => atlasToLocal(ctx, x, z)), hw: (r.width / 2) * ctx.S };
}

/** Local x where a polyline crosses the line z = const (the first crossing), or null. */
export function crossingX(pts: readonly V2[], z: number): number | null {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    if ((az - z) * (bz - z) > 0 || az === bz) continue;
    const t = (z - az) / (bz - az);
    return ax + (bx - ax) * t;
  }
  return null;
}

/** Arc-length position (real metres from the first point) of the point of a polyline nearest to `q`. */
export function projectOnPolyline(pts: readonly (readonly [number, number])[], q: readonly [number, number]): number {
  let best = Infinity;
  let bestS = 0;
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const l = Math.sqrt(l2);
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((q[0] - ax) * dx + (q[1] - az) * dz) / l2)) : 0;
    const d = Math.hypot(ax + dx * t - q[0], az + dz * t - q[1]);
    if (d < best) {
      best = d;
      bestS = s + t * l;
    }
    s += l;
  }
  return bestS;
}

/** Point and unit direction of a polyline at arc length `s` (real metres). */
export function pointOnPolyline(pts: readonly (readonly [number, number])[], s: number): { p: [number, number]; d: [number, number] } {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const l = Math.hypot(bx - ax, bz - az);
    if (s <= acc + l || i === pts.length - 2) {
      const t = l > 0 ? Math.max(0, Math.min(1, (s - acc) / l)) : 0;
      return { p: [ax + (bx - ax) * t, az + (bz - az) * t], d: l > 0 ? [(bx - ax) / l, (bz - az) / l] : [1, 0] };
    }
    acc += l;
  }
  return { p: [pts[0][0], pts[0][1]], d: [1, 0] };
}

/**
 * The edge of a street between two atlas points (real metres) on one side of an atlas road: a
 * raised sidewalk (crepido) of travertine slabs behind a kerb, level across with the roadway, and
 * where the ground behind stands higher (the street cut into a slope) a retaining wall of opus
 * reticulatum with a travertine coping, so the banks along the street read as built terraces.
 * `side` +1 is the left of the road as its points are listed, −1 the right.
 */
export function streetEdge(p: Part, roadId: string, side: 1 | -1, from: readonly [number, number], to: readonly [number, number], o: { walk?: number; step?: number; minWall?: number; gaps?: (readonly [number, number])[] } = {}) {
  const road = ROADS.find((r) => r.id === roadId);
  if (!road) return;
  const { ctx, b } = p;
  const s0 = projectOnPolyline(road.points, from);
  const s1 = projectOnPolyline(road.points, to);
  const [sa, sb] = s0 < s1 ? [s0, s1] : [s1, s0];
  const step = o.step ?? 2.5;
  const n = Math.max(1, Math.ceil((sb - sa) / step));
  const hwr = road.width / 2;
  const walk = o.walk ?? 2.2;
  const kerb = 0.15;
  const minWall = o.minWall ?? 0.35;
  type Row = { e0: V2; e1: V2; w1: V2; y: number; top: number; s: number };
  const rows: Row[] = [];
  const gapS = (o.gaps ?? []).map((g) => projectOnPolyline(road.points, g));
  const inGap = (s: number) => gapS.some((g) => Math.abs(s - g) < 2.6);
  for (let i = 0; i <= n; i++) {
    const s = sa + ((sb - sa) * i) / n;
    const { p: c, d } = pointOnPolyline(road.points, s);
    const nx = d[1] * side;
    const nz = -d[0] * side;
    const at = (k: number) => atlasToLocal(ctx, c[0] + nx * k, c[1] + nz * k);
    const cl = atlasToLocal(ctx, c[0], c[1]);
    const y = ctx.groundAt(cl[0], cl[1]);
    const w1 = at(hwr + walk + 0.5);
    const behind = Math.max(ctx.groundAt(w1[0], w1[1]), ctx.groundAt(...at(hwr + walk + 2.0)));
    rows.push({ e0: at(hwr), e1: at(hwr + walk), w1, y, top: behind + 0.2, s });
  }
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const quad = (a: number[], bb: number[], c: number[], d: number[], ua: number, ub: number, va: number, vb: number) => {
    // a-b-c-d counter-clockwise seen from the front; flat normal
    const e1 = new THREE.Vector3(bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]);
    const e2 = new THREE.Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
    const nn = e1.cross(e2).normalize();
    for (const [v, u, w] of [
      [a, ua, va],
      [bb, ub, va],
      [c, ub, vb],
      [a, ua, va],
      [c, ub, vb],
      [d, ua, vb],
    ] as [number[], number, number][]) {
      pos.push(v[0], v[1], v[2]);
      nor.push(nn.x, nn.y, nn.z);
      uv.push(u, w);
    }
  };
  const wpos: number[] = [];
  const wnor: number[] = [];
  const wuv: number[] = [];
  const quadW = (a: number[], bb: number[], c: number[], d: number[], ua: number, ub: number, va: number, vb: number) => {
    const n0 = pos.length;
    quad(a, bb, c, d, ua, ub, va, vb);
    wpos.push(...pos.splice(n0));
    wnor.push(...nor.splice((n0 / 3) * 3));
    wuv.push(...uv.splice((n0 / 3) * 2));
  };
  const U = UV_METERS;
  let along = 0;
  for (let i = 0; i < rows.length - 1; i++) {
    const r0 = rows[i];
    const r1 = rows[i + 1];
    const len = Math.hypot(r1.e1[0] - r0.e1[0], r1.e1[1] - r0.e1[1]);
    const y0 = r0.y + kerb;
    const y1 = r1.y + kerb;
    // orientation: make the walk surface face up whichever side the street edge is on
    const up = (a: V2, bb: V2, c: V2) => (bb[0] - a[0]) * (c[1] - a[1]) - (bb[1] - a[1]) * (c[0] - a[0]) < 0;
    const flip = !up(r0.e0, r1.e0, r1.e1);
    const A = [r0.e0[0], y0, r0.e0[1]];
    const B = [r1.e0[0], y1, r1.e0[1]];
    const C = [r1.e1[0], y1, r1.e1[1]];
    const D = [r0.e1[0], y0, r0.e1[1]];
    if (flip) quad(B, A, D, C, (along + len) / U, along / U, 0, walk * ctx.S / U);
    else quad(A, B, C, D, along / U, (along + len) / U, 0, walk * ctx.S / U);
    // kerb face toward the roadway
    const Ak = [r0.e0[0], r0.y - 0.1, r0.e0[1]];
    const Bk = [r1.e0[0], r1.y - 0.1, r1.e0[1]];
    if (flip) quad(Bk, Ak, A, B, (along + len) / U, along / U, 0, 0.25 / U);
    else quad(Ak, Bk, B, A, along / U, (along + len) / U, 0, 0.25 / U);
    if (p.main) {
      // collider of the walk slab (an oriented box following the street's grade)
      const ux = (r1.e0[0] - r0.e0[0]) / (len || 1);
      const uz = (r1.e0[1] - r0.e0[1]) / (len || 1);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.atan2(y1 - y0, len || 1), Math.atan2(ux, uz), 0, 'YXZ'));
      p.b.collider({ kind: 'box', center: new THREE.Vector3((r0.e0[0] + r1.e1[0]) / 2, (y0 + y1) / 2 - 0.2, (r0.e0[1] + r1.e1[1]) / 2), half: new THREE.Vector3((walk * ctx.S) / 2, 0.2, len / 2 + 0.05), rotation: q });
    }
    // retaining wall at the back of the walk, up to the ground behind (open at the gaps)
    if (inGap((r0.s + r1.s) / 2)) {
      along += len;
      continue;
    }
    const t0 = Math.max(y0 + minWall, r0.top);
    const t1 = Math.max(y1 + minWall, r1.top);
    const Dw = [r0.e1[0], t0, r0.e1[1]];
    const Cw = [r1.e1[0], t1, r1.e1[1]];
    const Db = [r0.e1[0], y0 - 0.05, r0.e1[1]];
    const Cb = [r1.e1[0], y1 - 0.05, r1.e1[1]];
    if (flip) quadW(Cb, Db, Dw, Cw, (along + len) / U, along / U, (y0 - 0.05) / U, t0 / U);
    else quadW(Db, Cb, Cw, Dw, along / U, (along + len) / U, (y0 - 0.05) / U, t0 / U);
    if (p.main) {
      // collider of the wall as an oriented box along the segment
      const ux = (r1.e0[0] - r0.e0[0]) / (len || 1);
      const uz = (r1.e0[1] - r0.e0[1]) / (len || 1);
      const yaw = Math.atan2(ux, uz);
      const top = Math.max(t0, t1);
      const bot = Math.min(y0, y1);
      const wx = (r0.e1[0] + r1.e1[0]) / 2;
      const wz = (r0.e1[1] + r1.e1[1]) / 2;
      const nxl = r0.w1[0] - r0.e1[0];
      const nzl = r0.w1[1] - r0.e1[1];
      const nl = Math.hypot(nxl, nzl) || 1;
      p.b.collider({ kind: 'box', center: new THREE.Vector3(wx + (nxl / nl) * 0.3, (top + bot) / 2, wz + (nzl / nl) * 0.3), half: new THREE.Vector3(0.3, (top - bot) / 2, len / 2 + 0.05), rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)) });
    }
    // coping along the wall top
    const cy = (t0 + t1) / 2;
    const cm = new THREE.Matrix4().compose(new THREE.Vector3((r0.e1[0] + r1.e1[0]) / 2, cy + 0.06, (r0.e1[1] + r1.e1[1]) / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.atan2(t1 - t0, len || 1), Math.atan2(r1.e1[0] - r0.e1[0], r1.e1[1] - r0.e1[1]), 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
    b.box('travertine', 0.5, 0.14, Math.hypot(len, t1 - t0) + 0.04, cm);
    along += len;
  }
  b.add(makeGeometry(pos, nor, uv), 'paving_travertine', undefined, { uv: 'keep', castShadow: false });
  b.add(makeGeometry(wpos, wnor, wuv), 'reticulatum', undefined, { uv: 'keep' });
  // at each gap a flight of steps from the walk up to the ground behind
  for (const g of gapS) {
    if (g < sa || g > sb) continue;
    const { p: c, d } = pointOnPolyline(road.points, g);
    const nx = d[1] * side;
    const nz = -d[0] * side;
    const e1 = atlasToLocal(ctx, c[0] + nx * (hwr + walk), c[1] + nz * (hwr + walk));
    const cl = atlasToLocal(ctx, c[0], c[1]);
    const out = atlasToLocal(ctx, c[0] + nx * (hwr + walk + 1), c[1] + nz * (hwr + walk + 1));
    const y = ctx.groundAt(cl[0], cl[1]) + kerb;
    const count = Math.ceil(Math.max(0, ctx.groundAt(out[0], out[1]) - y + 0.05) / 0.2);
    if (count < 1) continue;
    const top = ctx.groundAt(out[0], out[1]) + 0.05;
    const yaw = Math.atan2(out[0] - e1[0], out[1] - e1[1]);
    stairs(b, { width: 3.6, rise: (top - y) / count, run: 0.33, count, material: 'travertine', collider: p.main ? 'steps' : 'none' }, TRS(e1[0], y, e1[1], 0, yaw, 0));
  }
}

// ---------------------------------------------------------------- vegetation and fire

/** Plant trees (local positions, on the terrain) as a small instanced Forest. */
export function plantTrees(p: Part, trees: { species: TreeSpecies; x: number; z: number; y?: number; scale?: number; variant?: number }[]) {
  if (!p.main || !trees.length) return;
  const m = localToWorld(p.ctx);
  const f = new Forest({ seed: p.ctx.rng.int(1, 1e6), near: 140 });
  const v = new THREE.Vector3();
  for (const t of trees) {
    v.set(t.x, t.y ?? p.ctx.groundAt(t.x, t.z), t.z).applyMatrix4(m);
    f.add(t.species, v.x, v.y, v.z, { scale: t.scale, variant: t.variant });
  }
  p.ctx.game.scene.add(f.build());
  vegetation(p.ctx.game).addForest(f);
}

interface FireRequest {
  position: THREE.Vector3;
  /** Lit at dusk and put out at dawn (lamps, braziers) instead of burning all day (altars, hearths). */
  night?: boolean;
  intensity?: number;
  distance?: number;
  glow?: number;
  dayScale?: number;
  flicker?: number;
}

/**
 * Ask the light pool for a fire (a flame glow by day, real light at night). The landmarks are
 * built before the sky (and its light pool) is installed, so requests wait for `game.lights`.
 */
export function addFire(p: Part, x: number, y: number, z: number, o: Omit<FireRequest, 'position'> = {}) {
  if (!p.main) return;
  const pos = new THREE.Vector3(x, y, z).applyMatrix4(localToWorld(p.ctx));
  queueFire(p.ctx.game, { position: pos, ...o });
}

const pendingFires = new WeakMap<Game, FireRequest[]>();

type LightPool = { request(o: object): unknown };

function requestFire(lights: LightPool, f: FireRequest) {
  lights.request({ position: f.position, color: 0xff9a45, intensity: f.intensity ?? 10, distance: f.distance ?? 9, flicker: f.flicker ?? 0.45, glow: f.glow ?? 0.45, dayScale: f.dayScale ?? 0, night: f.night });
}

function queueFire(game: Game, r: FireRequest) {
  // The light pool already exists (a landmark built late): ask for the fire right away.
  const live = (game as unknown as { lights?: LightPool }).lights;
  if (live) {
    requestFire(live, r);
    return;
  }
  let q = pendingFires.get(game);
  if (!q) {
    const list: FireRequest[] = [];
    pendingFires.set(game, list);
    q = list;
    let tries = 0;
    const sys = {
      name: 'forumFires',
      priority: 200,
      update() {
        const lights = (game as unknown as { lights?: LightPool }).lights;
        if (lights) {
          for (const f of list) requestFire(lights, f);
          // the queue is spent: a later addFire goes straight to the pool, not into a dead list
          list.length = 0;
          pendingFires.delete(game);
          game.removeSystem(sys);
        } else if (++tries > 6000) {
          pendingFires.delete(game);
          game.removeSystem(sys);
        }
      },
    };
    game.addSystem(sys);
  }
  q.push(r);
}

// ---------------------------------------------------------------- materials

const paints = new Map<string, THREE.MeshStandardMaterial>();

/** A shared painted / special material (polychromy, inscriptions grounds…), cached by colour. */
export function paint(hex: string, roughness = 0.75, metalness = 0, emissive?: string): THREE.MeshStandardMaterial {
  const key = `${hex}|${roughness}|${metalness}|${emissive ?? ''}`;
  let m = paints.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness, metalness });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = 1.6;
    }
    m.name = `forum-paint:${hex}`;
    paints.set(key, m);
  }
  return m;
}

/** Palette (GDD §16.1). */
export const PAINT = {
  cinnabar: '#A3271F',
  redOchre: '#9A3A24',
  yellowOchre: '#CC9A35',
  egyptianBlue: '#2D5DA1',
  greenEarth: '#6F8656',
  black: '#1F1D1B',
} as const;

// ---------------------------------------------------------------- columns

/** 'hero' kit column, 'mid' cheaper composition, 'low' kit far column, 'stub' a 6-sided prism for far stand-ins. */
export type Tier = 'hero' | 'mid' | 'low' | 'stub';

export interface ColSpec {
  order: Order;
  D: number;
  /** Total column height (base + shaft + capital). */
  H: number;
  tier: Tier;
  material?: MaterialId;
  trim?: MaterialId;
  kind?: 'free' | 'engaged';
  fluted?: boolean;
  collide?: boolean;
}

interface Piece {
  g: THREE.BufferGeometry;
  trim: boolean;
}

const midCache = new Map<string, Piece[]>();

/** Fluted (or plain) shaft from y0 to y1 with entasis; 'engaged' keeps the front half (z < 0). */
function midShaft(D: number, top: number, y0: number, y1: number, fluted: boolean, half: boolean, arris: boolean): THREE.BufferGeometry {
  const t0 = half ? Math.PI / 2 - 0.25 : 0;
  const t1 = half ? Math.PI * 1.5 + 0.25 : Math.PI * 2;
  const n = 24;
  const P = (Math.PI * 2) / n;
  const angles: number[] = [];
  if (fluted) {
    for (let k = 0; k <= n; k++) {
      const base = k * P;
      for (const f of arris ? [0, 0.5] : [0, 0.14, 0.5, 0.86]) {
        const a = base + f * P;
        if (a >= t0 - 1e-9 && a <= t1 + 1e-9) angles.push(a);
      }
    }
    if (angles[0] > t0) angles.unshift(t0);
    if (angles[angles.length - 1] < t1) angles.push(t1);
  } else for (let i = 0; i <= (half ? 10 : 18); i++) angles.push(t0 + ((t1 - t0) * i) / (half ? 10 : 18));
  const L = y1 - y0;
  const depth = 0.045 * D;
  const groove = (a: number) => {
    let s = a / P;
    s -= Math.floor(s);
    if (arris) return 1 - Math.abs(2 * s - 1) < 0.02 ? 0 : 1;
    return s > 0.13 && s < 0.87 ? 1 : 0;
  };
  const rows = [0, 0.06, 1 / 3, 0.66, 0.94, 1];
  return gridSurface(
    angles,
    rows,
    (a, t, out) => {
      const fade = Math.min(1, t / 0.06, (1 - t) / 0.06);
      const r = entasisRadius(D, top, t) - (fluted ? depth * groove(a) * fade : 0);
      return out.set(r * Math.sin(a), y0 + t * L, r * Math.cos(a));
    },
    { uv: (a, t) => [(a * D * 0.5) / UV_METERS, (y0 + t * L) / UV_METERS] },
  );
}

function midParts(order: Order, D: number, H: number, half: boolean, fluted: boolean): Piece[] {
  const key = `${order}|${D.toFixed(3)}|${H.toFixed(3)}|${half}|${fluted}`;
  const hit = midCache.get(key);
  if (hit) return hit;
  const dims = columnDims(order, D, H);
  const p = ORDER_PROPORTIONS[order];
  const out: Piece[] = [];
  const segs = 16;
  const range = half ? { theta0: Math.PI / 2 - 0.25, theta1: Math.PI * 1.5 + 0.25 } : {};
  const plinthH = order === 'tuscan' ? 0.25 * D : D / 6;
  const w = dims.plinth;
  const pl = new THREE.BoxGeometry(w, plinthH, half ? w / 2 : w);
  pl.translate(0, plinthH / 2, half ? -w / 4 : 0);
  out.push({ g: pl, trim: true });
  const base =
    order === 'tuscan' || order === 'doric'
      ? new ProfileBuilder(0.6 * D, plinthH).torus(0.18 * D, 0.1 * D, 3).in(0.08 * D).to(0.5 * D, plinthH + 0.25 * D).build()
      : new ProfileBuilder(0.6 * D, plinthH).torus(0.11 * D, 0.08 * D, 3).in(0.05 * D).up(0.02 * D).scotia(0.06 * D, 0.04 * D, 2).up(0.02 * D).torus(0.075 * D, 0.06 * D, 3).to(0.5 * D, plinthH + 0.34 * D).build();
  out.push({ g: lathe(base, { segments: segs, ...range }), trim: true });
  const y0 = dims.base - 0.01 * D;
  const y1 = dims.height - dims.capital;
  out.push({ g: midShaft(D, p.topRatio, y0, y1 - 0.08 * D, fluted && p.flutes > 0, half, order === 'doric'), trim: false });
  const r1 = (entasisRadius(D, p.topRatio, 1) * 2) / 2;
  const astr = new ProfileBuilder(r1, y1 - 0.1 * D).up(0.03 * D).torus(0.06 * D, 0.03 * D, 2).to(r1 * 0.98, y1 + 0.002).build();
  out.push({ g: lathe(astr, { segments: segs, ...range }), trim: false });
  for (const pc of capitalPieces(order, { D, d: dims.d, height: dims.capital, detail: 'low', half })) {
    const g = pc.geometry.clone();
    g.translate(0, y1, 0);
    out.push({ g, trim: true });
  }
  midCache.set(key, out);
  return out;
}

/** A column at the given tier (origin on the ground at the axis). */
export function col(b: MeshBuilder, s: ColSpec, at: THREE.Matrix4) {
  const mat = s.material ?? 'marble';
  const fluted = s.fluted ?? s.order !== 'tuscan';
  const kind = s.kind ?? 'free';
  if (s.tier === 'stub') {
    // far stand-in: a tapered hexagonal prism with a plinth and an abacus block
    const half = kind === 'engaged';
    const shaft = new THREE.CylinderGeometry(s.D * 0.43, s.D * 0.5, s.H * 0.9, 6, 1, half, half ? Math.PI / 2 : 0, half ? Math.PI : Math.PI * 2);
    shaft.translate(0, s.H * 0.47, 0);
    b.add(shaft, mat, at);
    const cap = new THREE.BoxGeometry(s.D * 1.25, s.H * 0.08, half ? s.D * 0.62 : s.D * 1.25);
    cap.translate(0, s.H * 0.96, half ? -s.D * 0.31 : 0);
    b.add(cap, s.trim ?? mat, at);
    if (s.collide ?? kind === 'free') {
      const c = new THREE.Vector3(0, s.H / 2, 0).applyMatrix4(at);
      b.collider({ kind: 'cylinder', center: c, halfHeight: s.H / 2, radius: s.D * 0.52 });
    }
    return;
  }
  if (s.tier !== 'mid') {
    column(b, { order: s.order, D: s.D, height: s.H, fluted, material: mat, trimMaterial: s.trim ?? mat, detail: s.tier === 'hero' ? 'high' : 'low', kind, collide: s.collide ?? kind === 'free' }, at);
    return;
  }
  for (const pc of midParts(s.order, s.D, s.H, kind === 'engaged', fluted)) b.add(pc.g, pc.trim ? (s.trim ?? mat) : mat, at);
  if (s.collide ?? kind === 'free') {
    const c = new THREE.Vector3(0, s.H / 2, 0).applyMatrix4(at);
    b.collider({ kind: 'cylinder', center: c, halfHeight: s.H / 2, radius: s.D * 0.52 });
  }
}

// ---------------------------------------------------------------- furniture

/**
 * A bronze warship ram (rostrum), after the Athlit ram: a long socket that wrapped the keel and the
 * stem, tapering to a blunt head of three horizontal blades crossed by a vertical plate, with the
 * fore-deck cap sloping back to the wall. Origin at the mount on a wall face (z = 0), pointing
 * toward −z, `len` long. Dark patinated bronze, so the beaks read against the marble.
 */
export function shipRam(b: MeshBuilder, at: THREE.Matrix4, len = 1.4, mat: MaterialId | THREE.Material = ramBronze()) {
  const w = len * 0.4;
  const h = len * 0.5;
  // socket: a four-sided frustum from the wall to the head, its section a rounded diamond
  const sock = new THREE.CylinderGeometry(0.26, 0.5, 1, 6, 1);
  sock.rotateY(Math.PI / 6);
  sock.rotateX(-Math.PI / 2);
  sock.scale(w, h, len * 0.82);
  sock.translate(0, 0, -len * 0.41);
  b.add(sock, mat, at);
  // the flange where the socket met the hull
  const fl = new THREE.BoxGeometry(w * 1.05, h * 0.95, len * 0.05);
  fl.translate(0, 0, -len * 0.025);
  b.add(fl, mat, at);
  // the fore-deck cap: a wedge rising back to the wall
  const cap = new THREE.BoxGeometry(w * 0.55, h * 0.16, len * 0.62);
  cap.rotateX(-0.22);
  cap.translate(0, h * 0.36, -len * 0.33);
  b.add(cap, mat, at);
  // the head: three blades and the vertical plate
  for (const y of [-0.26, 0, 0.26]) {
    const fin = new THREE.BoxGeometry(w * 0.82, h * 0.09, len * 0.2);
    fin.translate(0, y * h, -len * 0.9);
    b.add(fin, mat, at);
  }
  const plate = new THREE.BoxGeometry(w * 0.14, h * 0.74, len * 0.22);
  plate.translate(0, 0, -len * 0.91);
  b.add(plate, mat, at);
}

let ramMat: THREE.MeshStandardMaterial | null = null;
/** Dark patinated bronze for the rams. */
export function ramBronze(): THREE.MeshStandardMaterial {
  if (!ramMat) {
    ramMat = new THREE.MeshStandardMaterial({ color: '#6b5b3c', roughness: 0.45, metalness: 0.7 });
    ramMat.name = 'forum:ram-bronze';
  }
  return ramMat;
}

let brightMat: THREE.MeshStandardMaterial | null = null;
/** Polished, golden-brown bronze for grilles, door leaves and railings (contrasts with `ramBronze`). */
export function brightBronze(): THREE.MeshStandardMaterial {
  if (!brightMat) {
    brightMat = new THREE.MeshStandardMaterial({ color: '#b48a46', roughness: 0.3, metalness: 0.8 });
    brightMat.name = 'forum:bright-bronze';
  }
  return brightMat;
}

/**
 * Balustrade of marble plutei between square posts along a straight line (a→b) in the Draw frame:
 * height `h`, panels slightly recessed, a moulded top rail. Box collider along the run.
 */
export function balustrade(d: Draw, ax: number, az: number, bx: number, bz: number, o: { h?: number; y?: number; mat?: MaterialId; post?: number; collide?: boolean; lattice?: boolean } = {}) {
  const h = o.h ?? 1.05;
  const y = o.y ?? 0;
  const mat = o.mat ?? 'marble';
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.05) return;
  const rot = Math.atan2(-(bz - az), bx - ax);
  const f = d.at(ax, y, az, rot);
  const t = 0.18;
  const nPost = Math.max(1, Math.round(len / (o.post ?? 1.6)));
  for (let i = 0; i <= nPost; i++) f.box(mat, (len * i) / nPost, h / 2, 0, 0.24, h, 0.24);
  f.box(mat, len / 2, h - 0.06, 0, len, 0.12, t + 0.08);
  f.box(mat, len / 2, 0.08, 0, len, 0.16, t + 0.06);
  if (o.lattice) {
    for (let i = 0; i < nPost; i++) {
      const x0 = (len * i) / nPost + 0.12;
      const x1 = (len * (i + 1)) / nPost - 0.12;
      const n = 3;
      for (let k = 0; k <= n; k++) {
        const xa = x0 + ((x1 - x0) * k) / n;
        f.rod('bronze', { x: xa, y: 0.16, z: 0 }, { x: Math.min(x1, xa + (x1 - x0) / n), y: h - 0.12, z: 0 }, 0.025, 4);
        f.rod('bronze', { x: Math.min(x1, xa + (x1 - x0) / n), y: 0.16, z: 0 }, { x: xa, y: h - 0.12, z: 0 }, 0.025, 4);
      }
    }
  } else f.box(mat, len / 2, h / 2, 0, len, h - 0.2, t * 0.6);
  if (o.collide ?? true) f.solid(0, 0, -t / 2 - 0.05, len, h, t / 2 + 0.05);
}

/** Moulded altar (ara) centred at (x, z) in the Draw frame: plinth, die, crowning with bolsters. */
export function altar(d: Draw, x: number, y: number, z: number, o: { w?: number; h?: number; rot?: number; mat?: MaterialId; fire?: boolean } = {}) {
  const w = o.w ?? 1.0;
  const h = o.h ?? 1.0;
  const mat = o.mat ?? 'marble';
  const f = d.at(x, y, z, o.rot ?? 0);
  f.box(mat, 0, 0.08, 0, w * 1.18, 0.16, w * 0.9);
  f.box(mat, 0, 0.16 + (h - 0.4) / 2, 0, w, h - 0.4, w * 0.72);
  f.box(mat, 0, h - 0.17, 0, w * 1.12, 0.12, w * 0.84);
  f.box(mat, 0, h - 0.06, 0, w * 1.0, 0.1, w * 0.74);
  for (const sx of [-1, 1]) f.cyl(mat, sx * w * 0.42, h + 0.04, 0, 0.09, w * 0.72, 8, { rx: Math.PI / 2 });
  // garland band on the die
  f.box('stucco_painted', 0, h * 0.62, -w * 0.36 - 0.01, w * 0.8, 0.06, 0.02);
  f.solid(-w * 0.6, 0, -w * 0.45, w * 0.6, h, w * 0.45);
  if (o.fire) f.cyl('glow_fire', 0, h + 0.12, 0, 0.18, 0.18, 6, { rTop: 0.02 });
}

/** Statue base: moulded die with an optional inscription panel on the −z face. Returns the top y. */
export function pedestal(b: MeshBuilder, at: THREE.Matrix4, w: number, dpt: number, h: number, mat: MaterialId = 'marble', lines?: string[], style: InscriptionStyle = 'carved'): number {
  const d = new Draw(b, at);
  d.box(mat, 0, 0.1, 0, w + 0.16, 0.2, dpt + 0.16);
  d.box(mat, 0, 0.2 + (h - 0.4) / 2, 0, w, h - 0.4, dpt);
  d.box(mat, 0, h - 0.13, 0, w + 0.14, 0.14, dpt + 0.14);
  d.box(mat, 0, h - 0.03, 0, w + 0.06, 0.06, dpt + 0.06);
  d.solid(-w / 2 - 0.08, 0, -dpt / 2 - 0.08, w / 2 + 0.08, h, dpt / 2 + 0.08);
  if (lines?.length) {
    inscriptionPanel(b, { lines, width: w * 0.86, height: Math.min(h * 0.55, 0.22 * lines.length + 0.2), style, sizes: lines.map((_, i) => (i === 0 ? 1 : 0.8)) }, mul(at, T(0, 0.2 + (h - 0.4) * 0.55, -dpt / 2 - 0.005)), { depth: 0.02, bodyMaterial: mat });
  }
  return h;
}

/** Inscription panel helper (front face at z = 0 of `at`, facing −z). */
export function inscription(b: MeshBuilder, at: THREE.Matrix4, lines: string[], w: number, h: number, style: InscriptionStyle = 'carved', o: { depth?: number; body?: MaterialId; sizes?: number[]; ground?: string; ink?: string; interpunct?: boolean } = {}) {
  inscriptionPanel(
    b,
    { lines, width: w, height: h, style, sizes: o.sizes ?? lines.map((_, i) => (i === 0 ? 1 : 0.82)), ground: o.ground, ink: o.ink, interpunct: o.interpunct, border: true },
    at,
    { depth: o.depth ?? 0.04, bodyMaterial: o.body },
  );
}

/**
 * A gaming board scratched into a marble step (tabula lusoria), lying flat at (x, y, z) in the Draw
 * frame: 'mill' (three nested squares), 'rota' (a wheel of eight spokes) or 'scripta' (the three
 * rows of twelve of duodecim scripta).
 */
export function gameBoard(d: Draw, x: number, y: number, z: number, kind: 'mill' | 'rota' | 'scripta') {
  const f = d.at(x, y, z);
  const t = 0.004;
  const w = 0.018;
  const mat: MaterialId = 'plaster_dark';
  const line = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    f.box(mat, (x0 + x1) / 2, t / 2, (z0 + z1) / 2, len + w, t, w, { ry: -Math.atan2(z1 - z0, x1 - x0) });
  };
  if (kind === 'mill') {
    for (const r of [0.28, 0.19, 0.1]) {
      line(-r, -r, r, -r);
      line(r, -r, r, r);
      line(r, r, -r, r);
      line(-r, r, -r, -r);
    }
    line(-0.28, 0, -0.1, 0);
    line(0.1, 0, 0.28, 0);
    line(0, -0.28, 0, -0.1);
    line(0, 0.1, 0, 0.28);
  } else if (kind === 'rota') {
    const r = 0.26;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      line(Math.cos(a0) * r, Math.sin(a0) * r, Math.cos(a1) * r, Math.sin(a1) * r);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI;
      line(-Math.cos(a) * r, -Math.sin(a) * r, Math.cos(a) * r, Math.sin(a) * r);
    }
  } else {
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 12; i++) {
        const xx = -0.42 + i * 0.07 + (i >= 6 ? 0.06 : 0);
        f.box(mat, xx, t / 2, -0.1 + row * 0.1, 0.04, t, 0.04);
      }
  }
}

/** Ring of `n` points (radius r) for round plans; angle 0 = −z (front). */
export function ring(r: number, n: number, phase = 0): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    out.push([Math.sin(a) * r, -Math.cos(a) * r]);
  }
  return out;
}

/** A bronze tripod brazier on the ground at (x, y, z) of the Draw frame, lit at dusk. */
export function brazier(p: Part, x: number, y: number, z: number) {
  if (!p.hi) return;
  placeProp(p.d, 'brazier', x, y, z, 0, { collide: true });
  p.d.cyl('glow_fire', x, y + 0.86, z, 0.16, 0.22, 6, { rTop: 0.02 });
  addFire(p, x, y + 1.0, z, { night: true, intensity: 9, distance: 10, glow: 0.5 });
}

/** Shorthand matrices. */
export { T, TRS, mul };
