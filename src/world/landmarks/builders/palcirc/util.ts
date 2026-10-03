/**
 * Shared helpers for the Palatine / Circus Maximus / Porta Capena builders (palcirc-*.ts).
 *
 * Everything works in the landmark's LOCAL frame (game metres, facade toward −z, y = 0 on the
 * pad). `ctx.groundAt` gives the terrain relative to the pad, so platforms get foundations that
 * reach below the lowest ground they cover and nothing floats on a slope.
 */
import * as THREE from 'three';
import { Draw } from '../../../../arch/fabric/draw';
import { Forest } from '../../../../arch/vegetation/Forest';
import { vegetation } from '../../../../arch/vegetation/system';
import type { TreeSpecies } from '../../../../arch/vegetation/species';
import type { ColliderSpec, MeshBuilder } from '../../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../../gfx/materialIds';
import { bearingToRotationY } from '../../../../core/math';
import { WORLD_SCALE, toGame } from '../../../coords';
import type { LandmarkContext, LandmarkData, Spot } from '../../types';

export const S = WORLD_SCALE;

export type SpotKind = 'inscription' | 'vista' | 'shrine' | 'container' | 'door' | 'npc' | 'vendor' | 'spawn' | 'sit' | 'stall';

/** Collects gameplay spots in local space. `heading`: model +Z convention (π = looking toward −z). */
export class Spots {
  readonly list: Spot[] = [];
  add(id: string, kind: SpotKind, x: number, y: number, z: number, heading = 0): this {
    this.list.push({ id, kind, position: new THREE.Vector3(x, y, z), heading });
    return this;
  }
}

/** Heading (model +Z convention) looking from (x0, z0) toward (x1, z1). */
export const headingTo = (x0: number, z0: number, x1: number, z1: number) => Math.atan2(x1 - x0, z1 - z0);

/** Lowest and highest terrain (relative to the pad) over a local rectangle, sampled on a grid. */
export function groundRange(ctx: LandmarkContext, x0: number, z0: number, x1: number, z1: number, step = 3): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  const nx = Math.max(1, Math.ceil(Math.abs(x1 - x0) / step));
  const nz = Math.max(1, Math.ceil(Math.abs(z1 - z0) / step));
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      const g = ctx.groundAt(x0 + ((x1 - x0) * i) / nx, z0 + ((z1 - z0) * j) / nz);
      if (g < min) min = g;
      if (g > max) max = g;
    }
  }
  return { min, max };
}

/**
 * A solid masonry block under a platform, from below the lowest ground of its rectangle up to
 * `top`; skipped when the ground is already at (or above) the top. Returns the bottom used.
 */
export function footing(d: Draw, mat: MaterialId, ctx: LandmarkContext, x0: number, z0: number, x1: number, z1: number, top: number, collide = true): number {
  const g = groundRange(ctx, x0, z0, x1, z1);
  const bottom = Math.min(top - 0.3, g.min - 0.6);
  if (g.min > top - 0.02) return top;
  d.span(mat, x0, bottom, z0, x1, top, z1, { collide });
  return bottom;
}

/** Local → world transform of a landmark exactly as buildLandmarks places it. */
export function landmarkToWorld(ctx: LandmarkContext): THREE.Matrix4 {
  return landmarkMatrix(ctx.lm, ctx.game.heightmap ? (x, z) => ctx.game.heightmap.heightAt(x, z) : () => 0);
}

export function landmarkMatrix(lm: Pick<LandmarkData, 'center' | 'rotation'>, heightAt: (x: number, z: number) => number): THREE.Matrix4 {
  const [gx, gz] = toGame(lm.center[0], lm.center[1]);
  const m = new THREE.Matrix4().makeRotationY(bearingToRotationY(lm.rotation));
  m.setPosition(gx, heightAt(gx, gz), gz);
  return m;
}

/**
 * Transform from another landmark's local frame into this one's (both placed by their atlas
 * centre/rotation on the same heightmap): lets nested landmarks (the pulvinar in the Circus) line
 * up with their host exactly.
 */
export function frameFrom(ctx: LandmarkContext, other: Pick<LandmarkData, 'center' | 'rotation'>): THREE.Matrix4 {
  const h = ctx.game.heightmap ? (x: number, z: number) => ctx.game.heightmap.heightAt(x, z) : () => 0;
  const mine = landmarkMatrix(ctx.lm, h);
  const theirs = landmarkMatrix(other, h);
  return mine.invert().multiply(theirs);
}

export interface TreeSpec {
  species: TreeSpecies;
  x: number;
  z: number;
  /** Local y (default: the terrain). */
  y?: number;
  scale?: number;
  variant?: number;
}

/**
 * Plants instanced, wind-swayed trees for a landmark (a Forest in world space, registered with
 * the vegetation system) and returns trunk colliders in LOCAL space for the landmark's builder.
 */
export function plantTrees(ctx: LandmarkContext, trees: TreeSpec[], opts: { near?: number; far?: number } = {}): ColliderSpec[] {
  if (!trees.length || typeof document === 'undefined') return [];
  const toWorld = landmarkToWorld(ctx);
  const forest = new Forest({ near: opts.near ?? 140, far: opts.far ?? 1400, seed: trees.length * 31 + ctx.lm.id.length });
  const cols: ColliderSpec[] = [];
  const rot = bearingToRotationY(ctx.lm.rotation);
  for (const t of trees) {
    const y = t.y ?? ctx.groundAt(t.x, t.z);
    const p = new THREE.Vector3(t.x, y, t.z).applyMatrix4(toWorld);
    forest.add(t.species, p.x, p.y, p.z, { scale: t.scale, variant: t.variant ?? 0, rotationY: rot + (t.x * 1.7 + t.z) });
    if (t.species !== 'oleander' && t.species !== 'reeds') {
      const s = t.scale ?? 1;
      cols.push({ kind: 'cylinder', center: new THREE.Vector3(t.x, y + 1.4 * s, t.z), halfHeight: 1.4 * s, radius: 0.22 * s });
    }
  }
  const g = forest.build();
  g.name = `forest:${ctx.lm.id}`;
  ctx.game.scene.add(g);
  vegetation(ctx.game).addForest(forest);
  return cols;
}

/** New Draw on a fresh builder from the context. */
export function drawFor(ctx: LandmarkContext): { b: MeshBuilder; d: Draw } {
  const b = ctx.builder();
  return { b, d: new Draw(b) };
}

/**
 * Cheap engaged half-column (8-sided half shaft, square base and a block capital) standing
 * against a wall face at z = 0 and projecting toward −z. For long arcades where the kit's
 * carved columns would cost too much.
 */
export function halfColumn(d: Draw, mat: MaterialId, x: number, y0: number, D: number, H: number, cap: 'tuscan' | 'ionic' | 'corinthian' = 'tuscan') {
  const r = D / 2;
  const shaftH = H - D * 0.5 - (cap === 'corinthian' ? D * 1.1 : D * 0.45);
  const shaft = halfShaft(r, r * 0.86, shaftH);
  d.geo(shaft, mat, x, y0 + D * 0.5, 0);
  d.box(mat, x, y0 + D * 0.25, -r * 0.55, D * 1.25, D * 0.5, r * 1.1);
  if (cap === 'corinthian') {
    // Bell and abacus.
    d.geo(halfShaft(r * 0.9, r * 1.12, D * 0.9), mat, x, y0 + D * 0.5 + shaftH, 0);
    d.box(mat, x, y0 + H - D * 0.1, -r * 0.62, D * 1.32, D * 0.2, r * 1.25);
  } else if (cap === 'ionic') {
    d.box(mat, x, y0 + D * 0.5 + shaftH + D * 0.16, -r * 0.6, D * 1.35, D * 0.3, r * 1.2);
    for (const s of [-1, 1]) d.cyl(mat, x + s * D * 0.55, y0 + D * 0.5 + shaftH + D * 0.16, -r * 1.0, D * 0.16, D * 0.3, 6, { rx: Math.PI / 2 });
  } else {
    d.box(mat, x, y0 + H - D * 0.22, -r * 0.6, D * 1.2, D * 0.44, r * 1.2);
  }
}

const halfCache = new Map<string, THREE.BufferGeometry>();
/** Half (front) shaft: an open 8-sided half cylinder from y = 0 to h, facing −z. Cached. */
export function halfShaft(r0: number, r1: number, h: number): THREE.BufferGeometry {
  const key = `${r0.toFixed(3)}|${r1.toFixed(3)}|${h.toFixed(3)}`;
  let g = halfCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(r1, r0, h, 8, 1, true, Math.PI / 2, Math.PI).toNonIndexed();
    g.translate(0, h / 2, 0);
    halfCache.set(key, g);
  }
  return g;
}

/** Full low-poly column (8-sided shaft with entasis-free taper, base and capital blocks). */
export function lowColumn(d: Draw, mat: MaterialId, x: number, y0: number, z: number, D: number, H: number, opts: { cap?: 'tuscan' | 'ionic' | 'corinthian'; capMat?: MaterialId; collide?: boolean; seg?: number } = {}) {
  const cap = opts.cap ?? 'tuscan';
  const capMat = opts.capMat ?? mat;
  const capH = cap === 'corinthian' ? D * 1.15 : D * 0.5;
  const baseH = D * 0.5;
  const shaftH = H - capH - baseH;
  d.cyl(mat, x, y0 + baseH + shaftH / 2, z, D / 2, shaftH, opts.seg ?? 8, { rTop: D * 0.43 });
  d.box(capMat, x, y0 + baseH * 0.35, z, D * 1.3, baseH * 0.7, D * 1.3);
  d.cyl(capMat, x, y0 + baseH * 0.82, z, D * 0.6, baseH * 0.36, 8);
  if (cap === 'corinthian') {
    d.cyl(capMat, x, y0 + baseH + shaftH + capH * 0.42, z, D * 0.46, capH * 0.84, 8, { rTop: D * 0.62 });
    d.box(capMat, x, y0 + H - capH * 0.08, z, D * 1.4, capH * 0.16, D * 1.4);
  } else if (cap === 'ionic') {
    d.box(capMat, x, y0 + H - capH * 0.4, z, D * 1.45, capH * 0.5, D * 1.0);
    d.box(capMat, x, y0 + H - capH * 0.08, z, D * 1.2, capH * 0.16, D * 1.2);
  } else {
    d.cyl(capMat, x, y0 + H - capH * 0.6, z, D * 0.52, capH * 0.35, 8, { rTop: D * 0.62 });
    d.box(capMat, x, y0 + H - capH * 0.2, z, D * 1.25, capH * 0.4, D * 1.25);
  }
  if (opts.collide) d.solid(x - D * 0.45, y0, z - D * 0.45, x + D * 0.45, y0 + H, z + D * 0.45);
}

/** Simple low gable roof over a rectangle (ridge along `axis`), tile top and a wood underside; eaves at `y`. */
export function gableRoof(d: Draw, x0: number, z0: number, x1: number, z1: number, y: number, opts: { axis?: 'x' | 'z'; pitch?: number; mat?: MaterialId; over?: number; gables?: MaterialId } = {}) {
  const over = opts.over ?? 0.5;
  const axis = opts.axis ?? (Math.abs(x1 - x0) >= Math.abs(z1 - z0) ? 'x' : 'z');
  const pitch = opts.pitch ?? (20 * Math.PI) / 180;
  const mat = opts.mat ?? 'roof_tile';
  const ax0 = Math.min(x0, x1) - over, ax1 = Math.max(x0, x1) + over;
  const az0 = Math.min(z0, z1) - over, az1 = Math.max(z0, z1) + over;
  const pts: number[] = [];
  if (axis === 'x') {
    const zm = (az0 + az1) / 2;
    const h = y + ((az1 - az0) / 2) * Math.tan(pitch);
    // Two slopes (CCW from above-outside).
    pts.push(ax0, y, az0, ax0, h, zm, ax1, h, zm, ax0, y, az0, ax1, h, zm, ax1, y, az0);
    pts.push(ax0, h, zm, ax0, y, az1, ax1, y, az1, ax0, h, zm, ax1, y, az1, ax1, h, zm);
    d.tris(mat, pts, { uvScale: 2 });
    if (opts.gables) {
      const gx0 = Math.min(x0, x1), gx1 = Math.max(x0, x1);
      const gz0 = Math.min(z0, z1), gz1 = Math.max(z0, z1);
      const hg = y + ((gz1 - gz0) / 2) * Math.tan(pitch);
      d.tris(opts.gables, [gx0, y, gz0, gx0, y, gz1, gx0, hg, (gz0 + gz1) / 2, gx1, y, gz1, gx1, y, gz0, gx1, hg, (gz0 + gz1) / 2]);
    }
    return h;
  }
  const xm = (ax0 + ax1) / 2;
  const h = y + ((ax1 - ax0) / 2) * Math.tan(pitch);
  pts.push(ax0, y, az1, xm, h, az1, xm, h, az0, ax0, y, az1, xm, h, az0, ax0, y, az0);
  pts.push(xm, h, az1, ax1, y, az1, ax1, y, az0, xm, h, az1, ax1, y, az0, xm, h, az0);
  d.tris(mat, pts, { uvScale: 2 });
  if (opts.gables) {
    const gx0 = Math.min(x0, x1), gx1 = Math.max(x0, x1);
    const gz0 = Math.min(z0, z1), gz1 = Math.max(z0, z1);
    const hg = y + ((gx1 - gx0) / 2) * Math.tan(pitch);
    d.tris(opts.gables, [gx1, y, gz0, gx0, y, gz0, (gx0 + gx1) / 2, hg, gz0, gx0, y, gz1, gx1, y, gz1, (gx0 + gx1) / 2, hg, gz1]);
  }
  return h;
}

/** Lean-to (shed) roof: high edge along z = zHigh at yHigh, falling to z = zLow at yLow, from x0 to x1. */
export function shedRoof(d: Draw, x0: number, x1: number, zHigh: number, yHigh: number, zLow: number, yLow: number, mat: MaterialId = 'roof_tile') {
  const up = zLow > zHigh;
  // Winding so the face points up.
  const quad = up
    ? [x0, yHigh, zHigh, x0, yLow, zLow, x1, yLow, zLow, x0, yHigh, zHigh, x1, yLow, zLow, x1, yHigh, zHigh]
    : [x1, yHigh, zHigh, x1, yLow, zLow, x0, yLow, zLow, x1, yHigh, zHigh, x0, yLow, zLow, x0, yHigh, zHigh];
  d.tris(mat, quad, { uvScale: 2 });
  // Underside.
  const under = up
    ? [x0, yHigh - 0.15, zHigh, x1, yLow - 0.15, zLow, x0, yLow - 0.15, zLow, x0, yHigh - 0.15, zHigh, x1, yHigh - 0.15, zHigh, x1, yLow - 0.15, zLow]
    : [x1, yHigh - 0.15, zHigh, x0, yLow - 0.15, zLow, x1, yLow - 0.15, zLow, x1, yHigh - 0.15, zHigh, x0, yHigh - 0.15, zHigh, x0, yLow - 0.15, zLow];
  d.tris('wood_dark', under);
}

/** Straight flight of steps climbing toward +z in the Draw frame (origin = bottom front centre), one box collider per step. */
export function flight(d: Draw, mat: MaterialId, width: number, rise: number, count: number, run = 0.32, collide = true) {
  for (let i = 0; i < count; i++) {
    d.span(mat, -width / 2, i * rise, i * run, width / 2, (i + 1) * rise, count * run, { collide });
  }
  return { height: rise * count, depth: run * count };
}

/** Number of steps (≤ 0.2 m risers) for a height. */
export const stepsFor = (h: number, maxRise = 0.2) => Math.max(1, Math.ceil(Math.abs(h) / maxRise - 1e-6));
