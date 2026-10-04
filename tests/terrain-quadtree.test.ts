import { describe, expect, it } from 'vitest';
import { morphOffset, PATCH_STRIDE, TerrainQuadtree } from '../src/world/terrain/quadtree';

function grid(nx: number, nz: number, spacing = 2) {
  const heights = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) heights[j * nx + i] = Math.sin(i * 0.05) * 10 + Math.cos(j * 0.03) * 8;
  return { minX: -((nx - 1) * spacing) / 2, minZ: -((nz - 1) * spacing) / 2, spacing, nx, nz, heights };
}

/** Rasterise the selected patches onto a leaf-patch-sized cell grid: level per cell, -2 = overlap. */
function coverage(qt: TerrainQuadtree, data: Float32Array, count: number) {
  const g = qt.grid;
  const cell = qt.patchQuads * g.spacing; // a level-0 patch
  const cx = Math.ceil(((g.nx - 1) * g.spacing) / cell);
  const cz = Math.ceil(((g.nz - 1) * g.spacing) / cell);
  const lv = new Int8Array(cx * cz).fill(-1);
  for (let p = 0; p < count; p++) {
    const o = p * PATCH_STRIDE;
    const size = data[o + 2] * qt.patchQuads;
    const i0 = Math.round((data[o] - g.minX) / cell), j0 = Math.round((data[o + 1] - g.minZ) / cell);
    const n = Math.round(size / cell);
    for (let j = j0; j < Math.min(cz, j0 + n); j++) {
      for (let i = i0; i < Math.min(cx, i0 + n); i++) lv[j * cx + i] = lv[j * cx + i] === -1 ? data[o + 3] : -2;
    }
  }
  return { lv, cx, cz };
}

describe('terrain CDLOD quadtree', () => {
  const g = grid(1001, 701);
  const qt = new TerrainQuadtree(g, { patchQuads: 16 });

  it('has increasing ranges and well-ordered morph zones', () => {
    expect(qt.levels).toBeGreaterThan(3);
    for (let L = 1; L < qt.levels; L++) expect(qt.ranges[L]).toBeGreaterThan(qt.ranges[L - 1]);
    for (let L = 0; L < qt.levels - 1; L++) {
      expect(qt.morph[L][0]).toBeLessThan(qt.morph[L][1]);
      expect(qt.morph[L][1]).toBeCloseTo(qt.ranges[L]);
    }
  });

  it('covers the whole grid exactly once, finest under the camera, ≤ 1 level between neighbours', () => {
    for (const cam of [{ x: 0, y: 10, z: 0 }, { x: 700, y: 30, z: -500 }, { x: -200, y: 400, z: 100 }]) {
      const { data, count } = qt.select(cam);
      const { lv, cx, cz } = coverage(qt, data, count);
      for (const v of lv) {
        expect(v).not.toBe(-1); // gap
        expect(v).not.toBe(-2); // overlap
      }
      for (let j = 0; j < cz; j++) {
        for (let i = 0; i < cx; i++) {
          const a = lv[j * cx + i];
          if (i + 1 < cx) expect(Math.abs(a - lv[j * cx + i + 1])).toBeLessThanOrEqual(1);
          if (j + 1 < cz) expect(Math.abs(a - lv[(j + 1) * cx + i])).toBeLessThanOrEqual(1);
        }
      }
      if (cam.y < 50 && Math.abs(cam.x) < 900) {
        const cell = qt.patchQuads * g.spacing;
        const i = Math.floor((cam.x - g.minX) / cell), j = Math.floor((cam.z - g.minZ) / cell);
        expect(lv[j * cx + i]).toBe(0);
      }
    }
  });

  it('frustum culling drops patches', () => {
    const all = qt.select({ x: 0, y: 10, z: 0 }).count;
    const half = qt.select({ x: 0, y: 10, z: 0 }, { intersectsBox: (b) => b.max.x > 0 }).count;
    expect(half).toBeLessThan(all * 0.75);
    expect(half).toBeGreaterThan(0);
  });

  it('a city-sized grid stays within the triangle budget', () => {
    const city = grid(1711, 1321);
    const t = new TerrainQuadtree(city, { patchQuads: 16 });
    const tris = 16 * 16 * 2 + 4 * 16 * 2;
    for (const cam of [{ x: 0, y: 5, z: 0 }, { x: -1100, y: 100, z: 200 }, { x: 0, y: 1500, z: 0 }]) {
      const { count } = t.select(cam);
      expect(count * tris).toBeLessThan(1_500_000);
    }
  });

  it('morphs odd vertices onto their even neighbours', () => {
    expect(morphOffset(4, 1)).toBe(4);
    expect(morphOffset(5, 1)).toBe(4);
    expect(morphOffset(5, 0)).toBe(5);
    expect(morphOffset(7, 0.5)).toBe(6.5);
  });
});
