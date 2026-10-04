/**
 * The water surface as a grid-aligned mesh: every grid cell over a body's channel where the ground
 * dips below the water level becomes a flat quad at that level. Unlike a ribbon along the
 * centerline it never overlaps itself at bends (no double-blended alpha) and it simply leaves out
 * Tiber Island. Each vertex carries the downstream current (m/s) for the flow-mapped normals.
 * Pure arrays; `index.ts` wraps them in a BufferGeometry.
 */
import { BODY_MARGIN, currentOf, type WaterBody } from './bodies';
import { footOn, nearSegments } from '../terrain/riverbanks';

export interface WaterSurfaceData {
  positions: Float32Array;
  /** Current (m/s) per vertex: x, z. */
  flow: Float32Array;
  index: Uint32Array;
  /** Quads per body id. */
  cells: Record<string, number>;
}

export interface Bounds2 {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function buildWaterSurface(bodies: readonly WaterBody[], heightAt: (x: number, z: number) => number, bounds: Bounds2, cell = 4): WaterSurfaceData {
  const pos: number[] = [];
  const flow: number[] = [];
  const idx: number[] = [];
  const cells: Record<string, number> = {};
  const cur = { x: 0, z: 0 };
  const lower = bodies;
  const inChannel = (o: WaterBody, x: number, z: number) => {
    const segs = nearSegments(o.index, x, z);
    if (!segs) return false;
    const f = footOn(o.line, x, z, segs);
    const w0 = o.width[f.i], w1 = o.width[f.i + 1] ?? w0;
    return f.d < (w0 + (w1 - w0) * f.t) / 2 + BODY_MARGIN;
  };
  for (const body of bodies) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of body.line.pts) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
    const r = body.maxHalf + BODY_MARGIN;
    const i0 = Math.max(0, Math.floor((x0 - r - bounds.minX) / cell));
    const i1 = Math.min(Math.floor((bounds.maxX - bounds.minX) / cell) - 1, Math.ceil((x1 + r - bounds.minX) / cell));
    const j0 = Math.max(0, Math.floor((z0 - r - bounds.minZ) / cell));
    const j1 = Math.min(Math.floor((bounds.maxZ - bounds.minZ) / cell) - 1, Math.ceil((z1 + r - bounds.minZ) / cell));
    if (i0 > i1 || j0 > j1) continue;
    const W = i1 - i0 + 2;
    const vmap = new Int32Array(W * (j1 - j0 + 2)).fill(-1);
    const vert = (i: number, j: number) => {
      const k = (j - j0) * W + (i - i0);
      if (vmap[k] >= 0) return vmap[k];
      const x = bounds.minX + i * cell, z = bounds.minZ + j * cell;
      const v = pos.length / 3;
      pos.push(x, body.level, z);
      const segs = nearSegments(body.index, x, z);
      if (segs) {
        const f = footOn(body.line, x, z, segs);
        const w0 = body.width[f.i], w1 = body.width[f.i + 1] ?? w0;
        currentOf({ body, foot: f, half: (w0 + (w1 - w0) * f.t) / 2 }, cur);
      } else {
        cur.x = cur.z = 0;
      }
      flow.push(cur.x, cur.z);
      vmap[k] = v;
      return v;
    };
    let n = 0;
    for (let j = j0; j <= j1; j++) {
      const z = bounds.minZ + (j + 0.5) * cell;
      for (let i = i0; i <= i1; i++) {
        const x = bounds.minX + (i + 0.5) * cell;
        const segs = nearSegments(body.index, x, z);
        if (!segs) continue;
        const f = footOn(body.line, x, z, segs);
        const w0 = body.width[f.i], w1 = body.width[f.i + 1] ?? w0;
        if (f.d > (w0 + (w1 - w0) * f.t) / 2 + BODY_MARGIN) continue;
        // Where a canal meets a lower river, the river's surface wins.
        if (lower.some((o) => o.level < body.level && inChannel(o, x, z))) continue;
        const xa = bounds.minX + i * cell, za = bounds.minZ + j * cell;
        const lo = Math.min(heightAt(xa, za), heightAt(xa + cell, za), heightAt(xa, za + cell), heightAt(xa + cell, za + cell), heightAt(x, z));
        if (lo > body.level + 0.02) continue;
        const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
        idx.push(a, c, d, a, d, b);
        n++;
      }
    }
    cells[body.id] = n;
  }
  return { positions: new Float32Array(pos), flow: new Float32Array(flow), index: new Uint32Array(idx), cells };
}
