import { describe, expect, it } from 'vitest';
import { aoDefault, TIER_SETTINGS } from '../src/core/graphics';
import { computeEphemeris } from '../src/world/sky/astronomy';
import { computeLighting } from '../src/world/sky/lighting';
import { WEATHER_PRESETS } from '../src/world/sky/weather';

describe('R1 light', () => {
  it('ambient occlusion runs on High and Medium, not Low', () => {
    expect(TIER_SETTINGS.medium.ao).toBe(true);
    expect(TIER_SETTINGS.low.ao).toBeFalsy();
    expect(aoDefault({ graphicsApplied: { tier: 'medium' } })).toBe(true);
    expect(aoDefault({ graphicsApplied: { tier: 'low' } })).toBe(false);
    expect(aoDefault({ graphics: 'low', ao: true })).toBe(true);
  });

  it('the fog looks up into the sky colour on a clear day and gives way under overcast', () => {
    const e = computeEphemeris(113, 6, 21, 12);
    const input = { sun: e.sun, moon: e.moon, moonIllumination: e.moonIllumination, hour: 12 };
    const clear = computeLighting({ ...input, weather: WEATHER_PRESETS.clear });
    expect(clear.fogUpWeight).toBeGreaterThan(0.3);
    // The air overhead is bluer than the haze band at the horizon.
    const blueness = (c: number[]) => c[2] / Math.max(1e-6, c[0]);
    expect(blueness(clear.fogUp)).toBeGreaterThan(blueness(clear.fogColor));
    const grey = computeLighting({ ...input, weather: WEATHER_PRESETS.overcast });
    expect(grey.fogUpWeight).toBeLessThan(clear.fogUpWeight);
    for (const v of clear.fogUp) expect(Number.isFinite(v) && v >= 0).toBe(true);
  });
});
