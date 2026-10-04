/**
 * Giant reeds (Arundo donax) along the natural banks: clumps on the muddy margin just above and
 * below the waterline, thinned by noise so they grow in stands, kept off the stone quays, the
 * bridges, roads, building pads and Tiber Island. Pure placement (unit-tested); `index.ts` plants
 * the result with the vegetation kit's instanced Forest.
 */
import type { Heightmap, P2 } from '../terrain/heightmap';
import { signedDistance } from '../terrain/heightmap';
import type { WaterBody } from './bodies';

export interface ReedSpot {
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
}

export interface ReedOptions {
  /** Game-space chainage intervals per body id and side (+1 left, -1 right) to skip (quays). */
  skip?: { body: string; side: number; s0: number; s1: number }[];
  /** Game-space points (bridge ends etc.) to keep clear within `clear` m. */
  avoid?: readonly (readonly [number, number])[];
  clear?: number;
  /** Polygons (game m) to keep clear (islands). */
  avoidPolys?: readonly (readonly P2[])[];
  /** Spacing along the bank (game m). */
  step?: number;
  seed?: number;
}

function hash(a: number, b: number, seed: number): number {
  let n = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(seed, 2246822519)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, seed: number): number {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i, 0, seed) * (1 - u) + hash(i + 1, 0, seed) * u;
}

export function placeReeds(bodies: readonly WaterBody[], hm: Heightmap, opts: ReedOptions = {}): ReedSpot[] {
  const out: ReedSpot[] = [];
  const step = opts.step ?? 2.0;
  const seed = opts.seed ?? 31;
  const clear2 = (opts.clear ?? 22) ** 2;
  for (const body of bodies) {
    if (body.kind !== 'river') continue;
    const { pts, cum } = body.line;
    const total = cum[cum.length - 1];
    let seg = 0;
    for (const side of [1, -1]) {
      seg = 0;
      for (let s = 0, k = 0; s < total; s += step, k++) {
        while (seg < pts.length - 2 && cum[seg + 1] < s) seg++;
        if (opts.skip?.some((q) => q.body === body.id && q.side === side && s > q.s0 - 6 && s < q.s1 + 6)) continue;
        // Stands: a slow noise along the bank decides where reeds grow at all.
        const stand = vnoise(s / 38, seed + (side > 0 ? 0 : 7)) * 0.7 + vnoise(s / 11, seed + 3) * 0.3;
        if (stand < 0.5) continue;
        const L = cum[seg + 1] - cum[seg] || 1;
        const t = Math.min(1, (s - cum[seg]) / L);
        const ax = pts[seg][0], az = pts[seg][1];
        const tx = (pts[seg + 1][0] - ax) / L, tz = (pts[seg + 1][1] - az) / L;
        const cx = ax + tx * L * t, cz = az + tz * L * t;
        const w0 = body.width[seg], w1 = body.width[seg + 1] ?? w0;
        const half = (w0 + (w1 - w0) * t) / 2;
        const bx = side * tz, bz = side * -tx;
        const clumps = 1 + Math.floor(hash(k, side, seed) * 4 * (stand - 0.4) * 2);
        for (let c = 0; c < clumps; c++) {
          const r1 = hash(k * 7 + c, side * 3, seed + 11), r2 = hash(k * 13 + c, side * 5, seed + 17);
          const off = -2.2 + r1 * 6.5;
          const along = (r2 - 0.5) * step;
          const x = cx + bx * (half + off) + tx * along, z = cz + bz * (half + off) + tz * along;
          if (x < hm.minX || z < hm.minZ || x > hm.maxX || z > hm.maxZ) continue;
          const y = hm.heightAt(x, z);
          const hw = y - body.level;
          if (hw < -0.35 || hw > 0.9) continue;
          if (hm.sampleMask(hm.roadMask, x, z) > 0.05 || hm.sampleMask(hm.padMask, x, z) > 0.05) continue;
          if (hm.slopeAt(x, z) > 30) continue;
          if (opts.avoid?.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < clear2)) continue;
          if (opts.avoidPolys?.some((poly) => signedDistance(x, z, poly) < 4)) continue;
          out.push({ x, y: y - 0.1, z, scale: 1.0 + hash(k, c + 9, seed) * 0.65, rot: hash(c, k, seed + 5) * Math.PI * 2 });
        }
      }
    }
  }
  return out;
}
