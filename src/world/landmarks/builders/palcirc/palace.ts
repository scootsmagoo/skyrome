/**
 * Building blocks for the Palatine palaces and houses (palcirc crew): massing blocks with windows,
 * peristyle porticoes, arcaded substructures, stairs, roofs and garden courts. Everything is drawn
 * into a Draw frame in the landmark's local space (or a sub-frame).
 */
import * as THREE from 'three';
import { Draw } from '../../../../arch/fabric/draw';
import type { MeshBuilder } from '../../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../../gfx/materialIds';
import type { LandmarkContext } from '../../types';
import { archDoorWall, archWindowWall } from './shapes';
import { gableRoof, groundRange, lowColumn } from './util';

export type Face = 'n' | 's' | 'e' | 'w'; // n = −z, s = +z, w = −x, e = +x

/** Dark window / door openings on one face of a box (x0..x1, z0..z1). */
export function openings(d: Draw, x0: number, z0: number, x1: number, z1: number, face: Face, y: number, w: number, h: number, spacing: number, opts: { margin?: number; mat?: MaterialId; frame?: MaterialId } = {}) {
  const mat = opts.mat ?? 'black';
  const m = opts.margin ?? spacing * 0.5;
  const along = face === 'n' || face === 's' ? [x0, x1] : [z0, z1];
  const len = along[1] - along[0] - 2 * m;
  const n = Math.max(1, Math.floor(len / spacing) + 1);
  const step = n > 1 ? len / (n - 1) : 0;
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? along[0] + m + step * i : (along[0] + along[1]) / 2;
    const e = 0.02;
    if (face === 'n') d.span(mat, t - w / 2, y, z0 - e, t + w / 2, y + h, z0 - e / 2);
    else if (face === 's') d.span(mat, t - w / 2, y, z1 + e / 2, t + w / 2, y + h, z1 + e);
    else if (face === 'w') d.span(mat, x0 - e, y, t - w / 2, x0 - e / 2, y + h, t + w / 2);
    else d.span(mat, x1 + e / 2, y, t - w / 2, x1 + e, y + h, t + w / 2);
    if (opts.frame) {
      const f = 0.12;
      if (face === 'n') d.span(opts.frame, t - w / 2 - f, y - f, z0 - 0.06, t + w / 2 + f, y, z0);
      else if (face === 's') d.span(opts.frame, t - w / 2 - f, y - f, z1, t + w / 2 + f, y, z1 + 0.06);
      else if (face === 'w') d.span(opts.frame, x0 - 0.06, y - f, t - w / 2 - f, x0, y, t + w / 2 + f);
      else d.span(opts.frame, x1, y - f, t - w / 2 - f, x1 + 0.06, y, t + w / 2 + f);
    }
  }
}

/**
 * A massing block from below the lowest ground under it up to `top`, with a collider, plus a
 * string course and cornice. Returns the bottom used.
 */
export function block(d: Draw, ctx: LandmarkContext | null, x0: number, z0: number, x1: number, z1: number, top: number, mat: MaterialId, opts: { bottom?: number; collide?: boolean; cornice?: MaterialId; frame?: THREE.Matrix4 } = {}): number {
  let bottom = opts.bottom ?? 0;
  if (ctx && opts.bottom === undefined) {
    const g = groundRange(ctx, x0, z0, x1, z1);
    bottom = Math.min(0, g.min) - 0.5;
  }
  d.span(mat, x0, bottom, z0, x1, top, z1, { collide: opts.collide ?? true });
  if (opts.cornice) d.span(opts.cornice, x0 - 0.15, top - 0.35, z0 - 0.15, x1 + 0.15, top, z1 + 0.15);
  return bottom;
}

/** Hollow rectangle of walls (thickness t) from y0 to y1. */
export function wallRing(d: Draw, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, t: number, mat: MaterialId, collide = true) {
  d.span(mat, x0, y0, z0, x1, y1, z0 + t, { collide });
  d.span(mat, x0, y0, z1 - t, x1, y1, z1, { collide });
  d.span(mat, x0, y0, z0 + t, x0 + t, y1, z1 - t, { collide });
  d.span(mat, x1 - t, y0, z0 + t, x1, y1, z1 - t, { collide });
}

/** Hip-ish roof: a gable along the long side with tiled slopes. */
export function roofOver(d: Draw, x0: number, z0: number, x1: number, z1: number, y: number, pitch = 0.36, mat: MaterialId = 'roof_tile', gables: MaterialId = 'plaster_cream') {
  return gableRoof(d, x0, z0, x1, z1, y, { pitch, over: 0.35, mat, gables });
}

export interface PorticoOpts {
  /** Column diameter and height. */
  D: number;
  H: number;
  spacing: number;
  /** Depth from the column axis to the back wall. */
  depth: number;
  mat?: MaterialId;
  capMat?: MaterialId;
  cap?: 'tuscan' | 'ionic' | 'corinthian';
  /** Draw the back wall (default true). */
  back?: boolean;
  backMat?: MaterialId;
  floor?: MaterialId;
  lite?: boolean;
  collide?: boolean;
  /** Skip the portico on these sides. */
  skip?: Face[];
  /** Doorways (2.4 m wide) through the back walls: centres along each wall (x for n/s, z for e/w). */
  doors?: Partial<Record<Face, number[]>>;
}

/**
 * A straight wall from `a` to `b` along one axis (thickness spanning `c0..c1` on the other), from y0
 * to y1, solid, with doorways (`w` wide, `h` high) centred at `doors` along it.
 */
function wallWithDoors(d: Draw, mat: MaterialId, axis: 'x' | 'z', a: number, b: number, c0: number, c1: number, y0: number, y1: number, doors: number[], collide: boolean, w = 2.4, h = 3.2) {
  const cuts = doors.map((m) => [m - w / 2, m + w / 2] as const).filter(([u0, u1]) => u1 > a && u0 < b).sort((p, q) => p[0] - q[0]);
  const piece = (u0: number, u1: number, v0: number, v1: number) => {
    if (u1 - u0 < 1e-3 || v1 - v0 < 1e-3) return;
    if (axis === 'x') d.span(mat, u0, v0, c0, u1, v1, c1, { collide });
    else d.span(mat, c0, v0, u0, c1, v1, u1, { collide });
  };
  let u = a;
  for (const [u0, u1] of cuts) {
    piece(u, Math.max(u, u0), y0, y1);
    piece(Math.max(a, u0), Math.min(b, u1), Math.min(y1, y0 + h), y1);
    u = Math.min(b, u1);
  }
  piece(u, b, y0, y1);
}

/**
 * Peristyle: porticoes on the four sides of a court (column axes on the rectangle x0..x1, z0..z1),
 * facing inward, at floor height y, with lean-to tiled roofs and a ceiling. Returns column count.
 */
export function peristyle(d: Draw, x0: number, z0: number, x1: number, z1: number, y: number, o: PorticoOpts): number {
  const mat = o.mat ?? 'marble';
  const capMat = o.capMat ?? mat;
  const cap = o.cap ?? 'corinthian';
  const skip = new Set(o.skip ?? []);
  let count = 0;
  const cols = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / o.spacing));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      lowColumn(d, mat, ax + (bx - ax) * t, y, az + (bz - az) * t, o.D, o.H, { cap, capMat, collide: o.collide ?? true, seg: o.lite ? 6 : 8, lite: o.lite });
      count++;
    }
  };
  const top = y + o.H;
  const eH = Math.max(0.35, o.D * 0.9);
  const dp = o.depth;
  const sides: [Face, () => void][] = [
    ['n', () => {
      cols(x0, z0, x1, z0);
      d.span(mat, x0 - 0.3, top, z0 - 0.3, x1 + 0.3, top + eH, z0 + 0.3);
      if (o.back ?? true) wallWithDoors(d, o.backMat ?? 'plaster_red', 'x', x0 - dp, x1 + dp, z0 - dp - 0.4, z0 - dp, y, top + eH, o.doors?.n ?? [], o.collide ?? true);
      shedTiles(d, x0 - dp, x1 + dp, z0 - dp, top + eH + 1.0, z0 + 0.3, top + eH);
      if (o.floor) d.span(o.floor, x0 - dp, y - 0.05, z0 - dp, x1 + dp, y + 0.02, z0 + 0.4);
    }],
    ['s', () => {
      cols(x0, z1, x1, z1);
      d.span(mat, x0 - 0.3, top, z1 - 0.3, x1 + 0.3, top + eH, z1 + 0.3);
      if (o.back ?? true) wallWithDoors(d, o.backMat ?? 'plaster_red', 'x', x0 - dp, x1 + dp, z1 + dp, z1 + dp + 0.4, y, top + eH, o.doors?.s ?? [], o.collide ?? true);
      shedTiles(d, x0 - dp, x1 + dp, z1 + dp, top + eH + 1.0, z1 - 0.3, top + eH);
      if (o.floor) d.span(o.floor, x0 - dp, y - 0.05, z1 - 0.4, x1 + dp, y + 0.02, z1 + dp);
    }],
    ['w', () => {
      cols(x0, z0, x0, z1);
      d.span(mat, x0 - 0.3, top, z0 - 0.3, x0 + 0.3, top + eH, z1 + 0.3);
      if (o.back ?? true) wallWithDoors(d, o.backMat ?? 'plaster_red', 'z', z0 - dp, z1 + dp, x0 - dp - 0.4, x0 - dp, y, top + eH, o.doors?.w ?? [], o.collide ?? true);
      shedTilesX(d, z0 - dp, z1 + dp, x0 - dp, top + eH + 1.0, x0 + 0.3, top + eH);
      if (o.floor) d.span(o.floor, x0 - dp, y - 0.05, z0, x0 + 0.4, y + 0.02, z1);
    }],
    ['e', () => {
      cols(x1, z0, x1, z1);
      d.span(mat, x1 - 0.3, top, z0 - 0.3, x1 + 0.3, top + eH, z1 + 0.3);
      if (o.back ?? true) wallWithDoors(d, o.backMat ?? 'plaster_red', 'z', z0 - dp, z1 + dp, x1 + dp, x1 + dp + 0.4, y, top + eH, o.doors?.e ?? [], o.collide ?? true);
      shedTilesX(d, z0 - dp, z1 + dp, x1 + dp, top + eH + 1.0, x1 - 0.3, top + eH);
      if (o.floor) d.span(o.floor, x1 - 0.4, y - 0.05, z0, x1 + dp, y + 0.02, z1);
    }],
  ];
  for (const [f, fn] of sides) if (!skip.has(f)) fn();
  return count;
}

/** Lean-to roof falling along z (from zHigh at yHigh to zLow at yLow), x0..x1, tiles on top. */
export function shedTiles(d: Draw, x0: number, x1: number, zHigh: number, yHigh: number, zLow: number, yLow: number, mat: MaterialId = 'roof_tile') {
  const up = zLow > zHigh;
  const q = up
    ? [x0, yHigh, zHigh, x0, yLow, zLow, x1, yLow, zLow, x0, yHigh, zHigh, x1, yLow, zLow, x1, yHigh, zHigh]
    : [x1, yHigh, zHigh, x1, yLow, zLow, x0, yLow, zLow, x1, yHigh, zHigh, x0, yLow, zLow, x0, yHigh, zHigh];
  d.tris(mat, q, { uvScale: 2 });
  const u = up
    ? [x0, yHigh - 0.12, zHigh, x1, yLow - 0.12, zLow, x0, yLow - 0.12, zLow, x0, yHigh - 0.12, zHigh, x1, yHigh - 0.12, zHigh, x1, yLow - 0.12, zLow]
    : [x1, yHigh - 0.12, zHigh, x0, yLow - 0.12, zLow, x1, yLow - 0.12, zLow, x1, yHigh - 0.12, zHigh, x0, yHigh - 0.12, zHigh, x0, yLow - 0.12, zLow];
  d.tris('wood_dark', u);
}

/** Lean-to roof falling along x (from xHigh at yHigh to xLow at yLow), z0..z1. */
export function shedTilesX(d: Draw, z0: number, z1: number, xHigh: number, yHigh: number, xLow: number, yLow: number, mat: MaterialId = 'roof_tile') {
  const right = xLow > xHigh;
  const q = right
    ? [xHigh, yHigh, z1, xLow, yLow, z1, xLow, yLow, z0, xHigh, yHigh, z1, xLow, yLow, z0, xHigh, yHigh, z0]
    : [xHigh, yHigh, z0, xLow, yLow, z0, xLow, yLow, z1, xHigh, yHigh, z0, xLow, yLow, z1, xHigh, yHigh, z1];
  d.tris(mat, q, { uvScale: 2 });
  const u = right
    ? [xHigh, yHigh - 0.12, z1, xLow, yLow - 0.12, z0, xLow, yLow - 0.12, z1, xHigh, yHigh - 0.12, z1, xHigh, yHigh - 0.12, z0, xLow, yLow - 0.12, z0]
    : [xHigh, yHigh - 0.12, z0, xLow, yLow - 0.12, z1, xLow, yLow - 0.12, z0, xHigh, yHigh - 0.12, z0, xHigh, yHigh - 0.12, z1, xLow, yLow - 0.12, z1];
  d.tris('wood_dark', u);
}

/**
 * Arcaded substructure face along x (from x0 to x1) at z (front face, facing −z when `dir` = −1,
 * +z when 1), from y0 to y1: piers and arched recesses in tiers (blind or open to dark vaults).
 */
export function arcadeFace(d: Draw, x0: number, x1: number, z: number, y0: number, y1: number, opts: { dir?: -1 | 1; bay?: number; tier?: number; mat?: MaterialId; trim?: MaterialId; depth?: number; collide?: boolean } = {}) {
  const dir = opts.dir ?? -1;
  const bay = opts.bay ?? 4.2;
  const tierH = opts.tier ?? 6;
  const mat = opts.mat ?? 'brick';
  const depth = opts.depth ?? 1.2;
  const len = x1 - x0;
  const n = Math.max(1, Math.round(len / bay));
  const w = len / n;
  const span = w * 0.62;
  const tiers = Math.max(1, Math.round((y1 - y0) / tierH));
  const th = (y1 - y0) / tiers;
  const rot = dir < 0 ? 0 : Math.PI;
  for (let t = 0; t < tiers; t++) {
    const yb = y0 + t * th;
    for (let i = 0; i < n; i++) {
      const cx = x0 + (i + 0.5) * w;
      const f = d.at(cx, yb, z, rot);
      const spring = Math.min(th * 0.62, th - span / 2 - 0.5);
      f.geo(archDoorWall(w, th, span, spring, depth, 6), mat);
      f.span('black', -span / 2, 0, depth * 0.7, span / 2, spring + span / 2, depth * 0.75);
    }
    if (opts.trim) d.span(opts.trim, x0, yb + th - 0.25, dir < 0 ? z - 0.12 : z - 0.1, x1, yb + th, dir < 0 ? z + 0.1 : z + 0.12);
  }
  if (opts.collide ?? true) {
    const za = dir < 0 ? z : z - depth;
    d.solid(x0, y0, za, x1, y1, za + depth);
  }
}

/** Straight stair climbing along +z in the frame (origin bottom front centre), risers ≤ 0.2 m. */
export function stair(d: Draw, width: number, height: number, mat: MaterialId = 'travertine', run = 0.32): { depth: number; n: number } {
  const n = Math.max(1, Math.ceil(Math.abs(height) / 0.2 - 1e-6));
  const rise = height / n;
  for (let i = 0; i < n; i++) d.span(mat, -width / 2, i * rise, i * run, width / 2, (i + 1) * rise, n * run, { collide: true });
  return { depth: n * run, n };
}

/** Garden bed (grass) with a low hedge border and gravel paths round it. */
export function gardenBed(d: Draw, x0: number, z0: number, x1: number, z1: number, y: number, hedge = true) {
  d.span('grass', x0, y - 0.1, z0, x1, y + 0.08, z1);
  if (hedge) {
    const h = 0.55;
    d.span('foliage_broad', x0, y, z0, x1, y + h, z0 + 0.35);
    d.span('foliage_broad', x0, y, z1 - 0.35, x1, y + h, z1);
    d.span('foliage_broad', x0, y, z0 + 0.35, x0 + 0.35, y + h, z1 - 0.35);
    d.span('foliage_broad', x1 - 0.35, y, z0 + 0.35, x1, y + h, z1 - 0.35);
  }
}

/** Rectangular pool with a marble rim (and water), inner floor at y − depth. */
export function pool(d: Draw, x0: number, z0: number, x1: number, z1: number, y: number, rim = 0.35, rimH = 0.35) {
  d.span('marble', x0, y - 0.2, z0, x1, y + rimH, z0 + rim, { collide: true });
  d.span('marble', x0, y - 0.2, z1 - rim, x1, y + rimH, z1, { collide: true });
  d.span('marble', x0, y - 0.2, z0 + rim, x0 + rim, y + rimH, z1 - rim, { collide: true });
  d.span('marble', x1 - rim, y - 0.2, z0 + rim, x1, y + rimH, z1 - rim, { collide: true });
  d.span('water', x0 + rim, y - 0.15, z0 + rim, x1 - rim, y + rimH * 0.5, z1 - rim);
  d.solid(x0 + rim, y - 0.2, z0 + rim, x1 - rim, y + 0.05, z1 - rim);
}

/** Stand-in matrix helper. */
export const at = (x: number, y: number, z: number, ry = 0) => new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(ry));

/** A rough rock boulder (jittered icosahedron, flattened underneath) with an optional box collider. */
export function boulder(d: Draw, x: number, y: number, z: number, sx: number, sy: number, sz: number, seed: number, solid = true, mat: MaterialId = 'rock') {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const key = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    const k = `${vx.toFixed(3)}|${vy.toFixed(3)}|${vz.toFixed(3)}`;
    let j = key.get(k);
    if (j === undefined) {
      j = 0.82 + 0.3 * Math.abs(Math.sin(vx * 3.1 + vy * 5.7 + vz * 2.3 + seed * 1.7));
      key.set(k, j);
    }
    const fy = vy < -0.3 ? -0.3 - (vy + 0.3) * 0.2 : vy;
    p.setXYZ(i, vx * j * sx, fy * j * sy, vz * j * sz);
  }
  g.computeVertexNormals();
  d.geo(g, mat, x, y, z);
  if (solid) d.solid(x - sx * 0.75, y - sy * 0.35, z - sz * 0.75, x + sx * 0.75, y + sy * 0.85, z + sz * 0.75);
}

/** Truncated pyramid (frustum) of rock: top rectangle at yTop, flaring by `flare` down to yBot. */
export function rockPlinth(d: Draw, x0: number, z0: number, x1: number, z1: number, yBot: number, yTop: number, flare: number, mat: MaterialId = 'rock') {
  const t = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const bt = [[x0 - flare, z0 - flare], [x1 + flare, z0 - flare], [x1 + flare, z1 + flare], [x0 - flare, z1 + flare]];
  const pos: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = t[i], c = t[(i + 1) % 4], e = bt[(i + 1) % 4], f = bt[i];
    // Outward faces.
    pos.push(a[0], yTop, a[1], e[0], yBot, e[1], f[0], yBot, f[1], a[0], yTop, a[1], c[0], yTop, c[1], e[0], yBot, e[1]);
  }
  pos.push(x0, yTop, z0, x0, yTop, z1, x1, yTop, z1, x0, yTop, z0, x1, yTop, z1, x1, yTop, z0);
  d.tris(mat, pos, { uvScale: 2.5 });
  d.solid(x0, yBot, z0, x1, yTop, z1);
}

/**
 * Substructure facade for terraces over the Palatine slopes: a run of `len` metres centred on x = 0
 * with its face on z = 0 toward −z, from y0 (below the ground) up to the terrace at y1. A travertine
 * arcade storey with dark vaults, a plastered upper storey with arched windows when it is tall, a
 * marble cornice and a balustrade on the terrace edge. Geometry only (colliders are the caller's).
 */
export function substructureFace(d: Draw, len: number, y0: number, y1: number, opts: { ground?: number; hi?: boolean; bay?: number } = {}) {
  const hi = opts.hi ?? true;
  const g = Math.max(y0, opts.ground ?? y0);
  const H = y1 - g;
  const n = Math.max(1, Math.round(len / (opts.bay ?? 4.4)));
  const w = len / n;
  const two = H > 8.5;
  const h1 = two ? Math.min(7, H * 0.52) : H - 0.9;
  // Base course down to the foundation, tall enough that the banked earth of the hillside and the
  // road's shoulder lean on solid masonry rather than showing inside the arches.
  d.span('travertine', -len / 2, y0, -0.14, len / 2, g + 1.3, 1.0);
  d.span('travertine', -len / 2 - 0.02, g + 1.2, -0.22, len / 2 + 0.02, g + 1.45, 0.2);
  for (let i = 0; i < n; i++) {
    const cx = -len / 2 + (i + 0.5) * w;
    const f = d.at(cx, g, 0);
    const span = Math.min(3.0, w * 0.6);
    const spring = Math.min(h1 - span / 2 - 0.8, 3.0);
    f.geo(archDoorWall(w, h1, span, spring, 1.0, hi ? 7 : 5), 'travertine');
    f.span('black', -span / 2, 0, 0.75, span / 2, spring + span / 2, 0.8);
    if (hi) f.box('travertine', 0, spring + span / 2 + 0.25, -0.08, 0.45, 0.6, 0.16);
    f.box('travertine', -w / 2, h1 / 2, -0.1, 0.7, h1, 0.2);
    if (two) {
      const h2 = H - h1 - 0.9;
      const sp2 = Math.min(1.8, w * 0.42);
      f.geo(archWindowWall(w, h2, sp2, 0.9, Math.max(1.2, h2 - sp2 / 2 - 0.9), 1.0, hi ? 7 : 5), 'plaster_cream', 0, h1, 0);
      f.span('black', -sp2 / 2, h1 + 0.9, 0.75, sp2 / 2, h1 + h2 - 0.8, 0.8);
      f.box('plaster_white', -w / 2, h1 + h2 / 2, -0.07, 0.6, h2, 0.14);
    }
  }
  d.span('travertine', -len / 2, g + h1 - 0.35, -0.18, len / 2, g + h1, 0.2);
  d.span('marble', -len / 2, y1 - 0.9, -0.3, len / 2, y1 - 0.5, 0.3);
  d.span(two ? 'plaster_cream' : 'travertine', -len / 2, two ? g + h1 : g + h1, 0, len / 2, y1 - 0.9, 1.0);
  d.span('marble', -len / 2, y1 - 0.5, -0.12, len / 2, y1, 1.0);
  // Balustrade.
  d.span('marble', -len / 2, y1, -0.1, len / 2, y1 + 0.1, 0.3);
  d.span('marble', -len / 2, y1 + 0.85, -0.12, len / 2, y1 + 0.98, 0.32);
  if (hi) for (let x = -len / 2 + 0.2; x < len / 2 - 0.1; x += 0.34) d.cyl('marble', x, y1 + 0.48, 0.1, 0.07, 0.75, 5, { rTop: 0.05 });
  else d.span('marble', -len / 2, y1 + 0.1, 0.04, len / 2, y1 + 0.85, 0.16);
}

/**
 * A terrace's outer retaining wall from (x0, z0) to (x1, z1) (face to the right of the direction,
 * looking outward), split into pieces of about `piece` metres, each with a substructure facade from
 * its own lowest ground up to the terrace at `top`, plus colliders (the wall and the balustrade).
 * Pieces whose ground is already near the terrace are skipped. Returns how many were built.
 */
export function terraceWall(ctx: LandmarkContext, b: MeshBuilder, x0: number, z0: number, x1: number, z1: number, top = 0, opts: { hi?: boolean; piece?: number; minDrop?: number } = {}): number {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(L / (opts.piece ?? 4.4)));
  let built = 0;
  for (let i = 0; i < n; i++) {
    const ax = x0 + ((x1 - x0) * i) / n, az = z0 + ((z1 - z0) * i) / n;
    const bx = x0 + ((x1 - x0) * (i + 1)) / n, bz = z0 + ((z1 - z0) * (i + 1)) / n;
    const len = Math.hypot(bx - ax, bz - az);
    const tx = (bx - ax) / len, tz = (bz - az) / len;
    const nx = tz, nz = -tx;
    const g = groundRange(ctx, Math.min(ax, bx) - 0.4 + nx * 0.6, Math.min(az, bz) - 0.4 + nz * 0.6, Math.max(ax, bx) + 0.4 + nx * 0.6, Math.max(az, bz) + 0.4 + nz * 0.6, 1.2);
    if (g.min > top - (opts.minDrop ?? 1.0)) continue;
    const f = new Draw(b, facingMatrix((ax + bx) / 2, 0, (az + bz) / 2, nx, nz));
    // Arches start at the piece's uphill ground (a road climbing along the wall would bury them);
    // the base course steps down to the downhill end.
    substructureFace(f, len + 0.02, g.min - 0.8, top, { ground: Math.min(g.max, top - 2.5), hi: opts.hi ?? true, bay: 4.2 });
    f.solid(-len / 2, g.min - 0.8, 0, len / 2, top, 1.0);
    f.solid(-len / 2, top, -0.1, len / 2, top + 1.0, 0.3);
    built++;
  }
  return built;
}

/** Matrix whose local −z faces (nx, nz), placed at (x, y, z) (same as runtime.facing, no scale). */
function facingMatrix(x: number, y: number, z: number, nx: number, nz: number): THREE.Matrix4 {
  const zAxis = new THREE.Vector3(-nx, 0, -nz).normalize();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
  return new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis).setPosition(x, y, z);
}
