/**
 * Surface query over geometry: "what does a thing standing at (x, z) about height y stand on?".
 *
 * The one answer shared by every placer of props (MeshBuilder.settleProps drops props onto it at
 * build time; builders can ask `MeshBuilder.surfaceAt` while they build): the highest up-facing face
 * of the geometry near the height asked for, or the terrain where it is higher than the face (a floor
 * sunk below a rising bank is not what is walked on), never the terrain under a floor or a podium.
 * Pure geometry, no scene; the geometry must be non-indexed (MeshBuilder.add makes it so).
 */
import * as THREE from 'three';

/** Faces flatter than this (cosine of the angle to up) are walls and bevels, not surfaces. */
const MIN_UP = 0.7;

/** How far under the height asked for a surface still counts (m). */
export const SURFACE_BELOW = 0.5;
/** How far over it (a kerb, the lip of a plinth the prop was set against). */
export const SURFACE_ABOVE = 0.35;
/** Terrain over a face: up to this much higher than the face, and within this of the height asked, it wins (m). */
export const TERRAIN_OVER = 0.7;

interface Tri {
  g: THREE.BufferGeometry;
  i: number;
}

export interface SurfaceBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export class SurfaceIndex {
  private readonly cells = new Map<number, Tri[]>();

  /** `bounds` keeps only faces within a metre of the box (the part of a big build that is asked about). */
  constructor(geoms: readonly THREE.BufferGeometry[], bounds?: SurfaceBounds) {
    for (const g of geoms) {
      const a = (g.getAttribute('position') as THREE.BufferAttribute | undefined)?.array as Float32Array | undefined;
      if (!a) continue;
      for (let i = 0; i + 8 < a.length; i += 9) {
        const minX = Math.min(a[i], a[i + 3], a[i + 6]), maxX = Math.max(a[i], a[i + 3], a[i + 6]);
        const minZ = Math.min(a[i + 2], a[i + 5], a[i + 8]), maxZ = Math.max(a[i + 2], a[i + 5], a[i + 8]);
        if (bounds && (maxX < bounds.minX - 1 || minX > bounds.maxX + 1 || maxZ < bounds.minZ - 1 || minZ > bounds.maxZ + 1)) continue;
        const ux = a[i + 3] - a[i], uy = a[i + 4] - a[i + 1], uz = a[i + 5] - a[i + 2];
        const vx = a[i + 6] - a[i], vy = a[i + 7] - a[i + 1], vz = a[i + 8] - a[i + 2];
        const ny = uz * vx - ux * vz;
        const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx;
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz); // not Math.hypot: it allocates
        if (l < 1e-6 || ny / l < MIN_UP) continue;
        for (let ix = Math.floor(minX); ix <= Math.floor(maxX); ix++) {
          for (let iz = Math.floor(minZ); iz <= Math.floor(maxZ); iz++) {
            const k = key(ix, iz);
            let list = this.cells.get(k);
            if (!list) this.cells.set(k, (list = []));
            list.push({ g, i });
          }
        }
      }
    }
  }

  /**
   * Height of the highest face over (x, z) within [y − below, y + above], or null. Faces of the
   * geometries in `skip` (a prop's own) do not count.
   */
  heightAt(x: number, z: number, y: number, below = SURFACE_BELOW, above = SURFACE_ABOVE, skip?: ReadonlySet<THREE.BufferGeometry>): number | null {
    let best = -Infinity;
    for (const { g, i } of this.cells.get(key(Math.floor(x), Math.floor(z))) ?? []) {
      if (skip?.has(g)) continue;
      const a = (g.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      const ax = a[i], az = a[i + 2], bx = a[i + 3], bz = a[i + 5], cx = a[i + 6], cz = a[i + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-9) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
      const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
      const sy = l1 * a[i + 1] + l2 * a[i + 4] + l3 * a[i + 7];
      if (sy >= y - below && sy <= y + above && sy > best) best = sy;
    }
    return best === -Infinity ? null : best;
  }
}

/**
 * What stands at (x, z) about height y: the highest face near it, or the terrain (`ground`) where
 * that is the surface in sight (no face at all, or the terrain up to TERRAIN_OVER over the face and
 * within TERRAIN_OVER of y). Null when neither is near (a prop on an upper floor with nothing
 * recorded under it keeps its height).
 */
export function standingHeight(
  index: SurfaceIndex,
  ground: ((x: number, z: number) => number) | null,
  x: number,
  z: number,
  y: number,
  skip?: ReadonlySet<THREE.BufferGeometry>,
): number | null {
  let best = index.heightAt(x, z, y, SURFACE_BELOW, SURFACE_ABOVE, skip);
  if (ground) {
    const gy = ground(x, z);
    if (best === null ? gy >= y - SURFACE_BELOW && gy <= y + 0.6 : gy > best && gy <= best + TERRAIN_OVER && gy <= y + TERRAIN_OVER) best = gy;
  }
  return best;
}

function key(ix: number, iz: number): number {
  return ix * 100003 + iz;
}
