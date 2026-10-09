/**
 * Coarser twins of landmark geometry, made by vertex clustering (gfx/simplify.ts). Until now a
 * landmark was full detail up to 220 m and then a flat-coloured stand-in (farBake.ts): the Forum's
 * temples at 100-200 m drew Corinthian columns of 7.7 k triangles each. The twins keep textures,
 * normals and UVs; only the geometry thins out. landmarkBatch.ts swaps them in by distance (and
 * the shadow pass uses them from much nearer).
 *
 * Instanced shapes (columns, statues) get two levels, made once per source geometry:
 *   level 1 from LEVEL1_FROM m: 6 × 16 × 6 grid over the shape's box (a column keeps a round
 *            section, capital and base: 7.7 k → ~0.5 k triangles)
 *   level 2 from LEVEL2_FROM m: 3 × 8 × 3 (a few rings; ~0.1 k)
 * Plain pieces (a wall mesh, a roof) get one: a 0.4 m grid its points snap to, so neighbouring
 * pieces, chunks and materials still meet without cracks.
 */
import * as THREE from 'three';
import { cellForBox, simplifyByGrid } from '../../gfx/simplify';

/** Camera distance (m) from an instanced shape's sphere where each coarser level takes over. */
export const LEVEL1_FROM = 48;
export const LEVEL2_FROM = 130;
/** Plain pieces switch to their twin from here (m from the piece's sphere). */
export const PIECE_FROM = 90;
/** Grid (m) of a plain piece's twin. */
export const PIECE_CELL = 0.4;
/** A piece, or an instanced shape, casts its twin's shadow from this far (m). */
export const SHADOW_TWIN_FROM = 20;
/** Shapes and pieces under this many triangles are not worth a twin. */
const MIN_SHAPE_TRIANGLES = 150;
const MIN_PIECE_TRIANGLES = 700;

export interface Twin {
  geometry: THREE.BufferGeometry;
  from: number;
}

const shapeCache = new WeakMap<THREE.BufferGeometry, Twin[]>();
const pieceCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry | null>();
const stats = { shapes: 0, shapeBefore: 0, shapeAfter1: 0, shapeAfter2: 0, pieces: 0, pieceBefore: 0, pieceAfter: 0 };

/** What was prepared so far (tests, the build log). */
export function landmarkLodStats() {
  return { ...stats };
}

const trianglesOf = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

/** Coarser twins (level 1, then 2 when it is worth it) of an instanced shape; [] when none. */
export function shapeTwins(g: THREE.BufferGeometry): Twin[] {
  let t = shapeCache.get(g);
  if (t) return t;
  t = [];
  const tris = trianglesOf(g);
  if (tris >= MIN_SHAPE_TRIANGLES) {
    if (!g.boundingBox) g.computeBoundingBox();
    const box = g.boundingBox!;
    const one = simplifyByGrid(g, cellForBox(box, [6, 16, 6], [0.1, 0.2, 0.1]), { maxRatio: 0.6 });
    if (one) {
      t.push({ geometry: one, from: LEVEL1_FROM });
      const oneTris = trianglesOf(one);
      const two = simplifyByGrid(g, cellForBox(box, [3, 8, 3], [0.2, 0.4, 0.2]), { maxRatio: Math.min(0.6, (0.5 * oneTris) / tris + 0.1) });
      if (two) t.push({ geometry: two, from: LEVEL2_FROM });
    }
    stats.shapes++;
    stats.shapeBefore += tris;
    stats.shapeAfter1 += t[0] ? trianglesOf(t[0].geometry) : tris;
    stats.shapeAfter2 += t[1] ? trianglesOf(t[1].geometry) : t[0] ? trianglesOf(t[0].geometry) : tris;
  }
  shapeCache.set(g, t);
  return t;
}

/** The simplified twin of a plain piece, or null (small, or not worth it). */
export function pieceTwin(g: THREE.BufferGeometry): THREE.BufferGeometry | null {
  if (pieceCache.has(g)) return pieceCache.get(g)!;
  const tris = trianglesOf(g);
  let t: THREE.BufferGeometry | null = null;
  if (tris >= MIN_PIECE_TRIANGLES) {
    t = simplifyByGrid(g, [PIECE_CELL, PIECE_CELL, PIECE_CELL], { maxRatio: 0.7, snap: true });
    if (t) {
      stats.pieces++;
      stats.pieceBefore += tris;
      stats.pieceAfter += trianglesOf(t);
    }
  }
  pieceCache.set(g, t);
  return t;
}
