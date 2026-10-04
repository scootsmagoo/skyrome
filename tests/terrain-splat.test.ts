import { describe, expect, it } from 'vitest';
import { L, LAYER_COUNT, SPLAT_GLSL, splatWeights, type SplatInput } from '../src/world/terrain/splat';
import { footstepSound, surfaceForWeights } from '../src/world/terrain/surface';

const base: SplatInput = { x: 10, z: 20, ny: 1, nz: 0, hw: 8, roadSd: 8, padSd: 8, padKind: 0, urban: 0, lush: 0 };
const top = (w: Float32Array) => w.indexOf(Math.max(...w));

describe('terrain splat', () => {
  it('weights are non-negative and sum to 1', () => {
    let seed = 1;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 500; i++) {
      const w = splatWeights({ x: r() * 2000, z: r() * 2000, ny: 0.5 + r() * 0.5, nz: r() - 0.5, hw: r() * 20 - 2, roadSd: r() * 16 - 8, padSd: r() * 16 - 8, padKind: r(), urban: r(), lush: r() });
      expect(w.length).toBe(LAYER_COUNT);
      let s = 0;
      for (const v of w) {
        expect(v).toBeGreaterThanOrEqual(-1e-6);
        s += v;
      }
      expect(s).toBeCloseTo(1, 5);
    }
  });

  it('puts the right layer on roads, fora, gravel yards, cliffs and the river bed', () => {
    expect(top(splatWeights({ ...base, roadSd: -1.5 }))).toBe(L.basalt);
    expect(top(splatWeights({ ...base, padSd: -3, padKind: 1 }))).toBe(L.travertine);
    expect(top(splatWeights({ ...base, padSd: -3, padKind: 0.5 }))).toBe(L.gravel);
    expect(top(splatWeights({ ...base, padSd: -3, padKind: 0 }))).toBe(L.dirt);
    expect(top(splatWeights({ ...base, ny: 0.6 }))).toBe(L.rock);
    expect(top(splatWeights({ ...base, hw: -0.6 }))).toBe(L.mud);
    const open = splatWeights({ ...base, lush: 0.3 });
    expect(open[L.grass] + open[L.dry]).toBeGreaterThan(0.5);
  });

  it('gardens are greener than sun-baked south slopes', () => {
    let g = 0, d = 0;
    for (let i = 0; i < 200; i++) {
      g += splatWeights({ ...base, x: i * 37, lush: 1 })[L.grass];
      d += splatWeights({ ...base, x: i * 37, nz: 0.4, ny: 0.92 })[L.grass];
    }
    expect(g).toBeGreaterThan(d);
  });

  it('reports footstep surfaces', () => {
    expect(surfaceForWeights(splatWeights({ ...base, roadSd: -1.5 }))).toBe('paved');
    expect(surfaceForWeights(splatWeights({ ...base, padSd: -3, padKind: 0.5 }))).toBe('gravel');
    expect(surfaceForWeights(splatWeights({ ...base, ny: 0.6 }))).toBe('rock');
    expect(['grass', 'dirt']).toContain(surfaceForWeights(splatWeights({ ...base, lush: 1 })));
    expect(footstepSound('paved')).toBe('stone');
    expect(footstepSound('gravel')).toBe('gravel');
    expect(footstepSound('mud')).toBe('dirt');
    expect(footstepSound('water')).toBe('water');
  });

  it('the GLSL twin takes the same inputs', () => {
    expect(SPLAT_GLSL).toContain('void splatWeights( vec2 p, float ny, float nz, float hw, float roadSd, float padSd, float padKind, float urban, float lush, float fine');
    // Same constants as the TS rules (spot checks).
    expect(SPLAT_GLSL).toContain('0.5 + ( n.x - 0.5 ) * 1.7');
    expect(SPLAT_GLSL).toContain('smoothstep( 31.0, 41.0');
  });
});
