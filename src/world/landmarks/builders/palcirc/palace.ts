/**
 * Building blocks for the Palatine palaces and houses (palcirc crew): massing blocks with windows,
 * peristyle porticoes, arcaded substructures, stairs, roofs and garden courts. Everything is drawn
 * into a Draw frame in the landmark's local space (or a sub-frame).
 */
import * as THREE from 'three';
import type { Draw } from '../../../../arch/fabric/draw';
import type { MaterialId } from '../../../../gfx/materialIds';
import type { LandmarkContext } from '../../types';
import { archDoorWall } from './shapes';
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
      if (o.back ?? true) d.span(o.backMat ?? 'plaster_red', x0 - dp, y, z0 - dp - 0.4, x1 + dp, top + eH, z0 - dp);
      shedTiles(d, x0 - dp, x1 + dp, z0 - dp, top + eH + 1.0, z0 + 0.3, top + eH);
      if (o.floor) d.span(o.floor, x0 - dp, y - 0.05, z0 - dp, x1 + dp, y + 0.02, z0 + 0.4);
    }],
    ['s', () => {
      cols(x0, z1, x1, z1);
      d.span(mat, x0 - 0.3, top, z1 - 0.3, x1 + 0.3, top + eH, z1 + 0.3);
      if (o.back ?? true) d.span(o.backMat ?? 'plaster_red', x0 - dp, y, z1 + dp, x1 + dp, top + eH, z1 + dp + 0.4);
      shedTiles(d, x0 - dp, x1 + dp, z1 + dp, top + eH + 1.0, z1 - 0.3, top + eH);
      if (o.floor) d.span(o.floor, x0 - dp, y - 0.05, z1 - 0.4, x1 + dp, y + 0.02, z1 + dp);
    }],
    ['w', () => {
      cols(x0, z0, x0, z1);
      d.span(mat, x0 - 0.3, top, z0 - 0.3, x0 + 0.3, top + eH, z1 + 0.3);
      if (o.back ?? true) d.span(o.backMat ?? 'plaster_red', x0 - dp - 0.4, y, z0 - dp, x0 - dp, top + eH, z1 + dp);
      shedTilesX(d, z0 - dp, z1 + dp, x0 - dp, top + eH + 1.0, x0 + 0.3, top + eH);
      if (o.floor) d.span(o.floor, x0 - dp, y - 0.05, z0, x0 + 0.4, y + 0.02, z1);
    }],
    ['e', () => {
      cols(x1, z0, x1, z1);
      d.span(mat, x1 - 0.3, top, z0 - 0.3, x1 + 0.3, top + eH, z1 + 0.3);
      if (o.back ?? true) d.span(o.backMat ?? 'plaster_red', x1 + dp, y, z0 - dp, x1 + dp + 0.4, top + eH, z1 + dp);
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
  const g = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
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
