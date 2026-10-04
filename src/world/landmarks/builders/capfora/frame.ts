/**
 * Coordinate helpers shared by the Capitoline / Imperial Fora builders (prefix `capfora-`).
 *
 * Every landmark builder works in its own LOCAL frame (origin on the pad at the atlas centre,
 * facade towards −z, game metres). Several of our landmarks are parts of one composition (the
 * Forum of Caesar and its temple, the Forum of Augustus and Mars Ultor, the Area Capitolina and
 * the temples on it), so a builder sometimes needs to know where a sibling stands: `relMatrix()`
 * maps a sibling's local frame into ours, exactly as `buildLandmarks()` will place both.
 */
import * as THREE from 'three';
import * as atlas from '../../../../data/atlas';
import type { Game } from '../../../../core/Game';
import { WORLD_SCALE } from '../../../coords';
import type { LandmarkContext, LandmarkData, Spot } from '../../types';

export const S = WORLD_SCALE;

export interface LmFrame {
  gx: number;
  gz: number;
  /** Pad height (game y of the local origin). */
  y: number;
  rotY: number;
  /** Local → world. */
  matrix: THREE.Matrix4;
}

/** The world placement `buildLandmarks()` gives a landmark (same formula). */
export function frameOf(game: Game | null | undefined, lm: Pick<LandmarkData, 'center' | 'rotation' | 'baseElevation'>): LmFrame {
  const gx = lm.center[0] * S;
  const gz = lm.center[1] * S;
  const hm = game?.heightmap;
  const y = hm ? hm.heightAt(gx, gz) : (lm.baseElevation ?? 0) * S;
  const rotY = (-lm.rotation * Math.PI) / 180;
  const matrix = new THREE.Matrix4().makeRotationY(rotY).setPosition(gx, y, gz);
  return { gx, gz, y, rotY, matrix };
}

export function landmark(id: string): LandmarkData {
  const lm = atlas.LANDMARK_BY_ID[id] as unknown as LandmarkData | undefined;
  if (!lm) throw new Error(`[capfora] unknown landmark ${id}`);
  return lm;
}

/** Matrix mapping the local frame of landmark `otherId` into the local frame of `ctx.lm`. */
export function relMatrix(ctx: Pick<LandmarkContext, 'game' | 'lm'>, otherId: string): THREE.Matrix4 {
  const me = frameOf(ctx.game, ctx.lm);
  const other = frameOf(ctx.game, landmark(otherId));
  return me.matrix.clone().invert().multiply(other.matrix);
}

/** An atlas point (REAL metres) in our local frame (game metres); y is the local terrain height if known. */
export function atlasToLocal(ctx: Pick<LandmarkContext, 'game' | 'lm'>, x: number, z: number): THREE.Vector3 {
  const me = frameOf(ctx.game, ctx.lm);
  const inv = me.matrix.clone().invert();
  const hm = ctx.game?.heightmap;
  const wy = hm ? hm.heightAt(x * S, z * S) : me.y;
  return new THREE.Vector3(x * S, wy, z * S).applyMatrix4(inv);
}

/** Pure: real-metre offset of a point from a landmark centre, rotated into its local frame (real metres). */
export function realLocal(lm: Pick<LandmarkData, 'center' | 'rotation'>, x: number, z: number): [number, number] {
  const th = (lm.rotation * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const dx = x - lm.center[0];
  const dz = z - lm.center[1];
  return [dx * c + dz * s, -dx * s + dz * c];
}

/** Spot with optional reading text (inscriptions) and a short label for the gameplay team. */
export interface CapSpot extends Spot {
  label?: string;
  /** Latin text of an inscription (as carved), then an English gloss. */
  text?: string;
  gloss?: string;
}

/** A spot at local (x, y, z) facing towards (tx, tz) (heading in the +Z model convention). */
export function spotAt(id: string, kind: string, x: number, y: number, z: number, tx: number, tz: number, extra: Partial<CapSpot> = {}): CapSpot {
  return { id, kind, position: new THREE.Vector3(x, y, z), heading: Math.atan2(tx - x, tz - z), ...extra };
}

/** Local translation + Y rotation. */
export function TR(x: number, y: number, z: number, ry = 0): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeRotationY(ry);
  m.setPosition(x, y, z);
  return m;
}

/** Minimum and maximum of `groundAt` over a local rectangle (sampled every `step`). */
export function groundRange(groundAt: (x: number, z: number) => number, x0: number, z0: number, x1: number, z1: number, step = 2): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  const nx = Math.max(1, Math.ceil(Math.abs(x1 - x0) / step));
  const nz = Math.max(1, Math.ceil(Math.abs(z1 - z0) / step));
  for (let i = 0; i <= nx; i++)
    for (let j = 0; j <= nz; j++) {
      const h = groundAt(x0 + ((x1 - x0) * i) / nx, z0 + ((z1 - z0) * j) / nz);
      if (h < min) min = h;
      if (h > max) max = h;
    }
  return { min, max };
}

/** Game y of a landmark's local origin (its pad), as `buildLandmarks()` places it. */
export function padY(ctx: Pick<LandmarkContext, 'game'>, id: string): number {
  return frameOf(ctx.game, landmark(id)).y;
}

/**
 * Local y (in `ctx.lm`'s frame) of a floor level given as an offset above another landmark's pad —
 * so neighbouring builders (a forum, its temple, its basilica) agree on one absolute floor.
 */
export function sharedFloor(ctx: Pick<LandmarkContext, 'game' | 'lm'>, ownerId: string, aboveOwnerPad: number): number {
  return padY(ctx, ownerId) + aboveOwnerPad - frameOf(ctx.game, ctx.lm).y;
}
