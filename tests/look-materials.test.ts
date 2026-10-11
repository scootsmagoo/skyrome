import { describe, expect, it } from 'vitest';
import { MATERIAL_RECIPES } from '../src/gfx/textures/catalog';
import { LEVEL_HYSTERESIS } from '../src/world/city/streamer';
import { SINGLE_BIAS } from '../src/world/sky/shadows';
import { SHADOW_TWIN_FROM } from '../src/world/landmarks/landmarkLod';

const tile = (id: keyof typeof MATERIAL_RECIPES) => {
  const t = MATERIAL_RECIPES[id].tile ?? 1;
  return typeof t === 'number' ? t : t[0];
};

describe('LOOK: one look per material (phase 4b)', () => {
  it('lays basalt paving and cobbles at one scale (repeat ratio 1.3 or less; it was 2)', () => {
    const a = tile('paving_basalt'), b = tile('cobbles');
    expect(Math.max(a, b) / Math.min(a, b)).toBeLessThanOrEqual(1.3);
  });

  it('paves travertine from the slab set at 6 m (the terrain layer packs the same pixels at the same tile)', () => {
    expect(MATERIAL_RECIPES.paving_travertine.proc).toBe('slabs');
    expect(tile('paving_travertine')).toBe(6);
  });

  it('tones the street stains down', () => {
    expect(MATERIAL_RECIPES.paving_basalt.puddle).toBeLessThan(1);
    expect(MATERIAL_RECIPES.cobbles.puddle).toBeLessThan(1);
  });

  it('keeps 8 m of hysteresis on the block levels, a lifting shadow bias, and full-detail shadows under 30 m', () => {
    expect(LEVEL_HYSTERESIS).toBe(8);
    expect(SINGLE_BIAS).toBeGreaterThan(0);
    expect(SHADOW_TWIN_FROM).toBeGreaterThanOrEqual(30);
  });
});
