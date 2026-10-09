import { describe, expect, it } from 'vitest';
import { computeEphemeris } from '../src/world/sky/astronomy';
import { computeLighting } from '../src/world/sky/lighting';
import { CAP_WEIGHT, HORIZON_WEIGHT, RING_WEIGHT, irradianceSH, projectSH, type RadianceSample } from '../src/world/sky/skySH';
import { luminance, type RGB } from '../src/world/sky/skyModel';
import { WEATHER_PRESETS } from '../src/world/sky/weather';

const light = (hour: number, weather: keyof typeof WEATHER_PRESETS = 'clear', day = 13) => {
  const e = computeEphemeris(113, 4, day, hour);
  return computeLighting({ sun: e.sun, moon: e.moon, moonIllumination: e.moonIllumination, hour, weather: WEATHER_PRESETS[weather] });
};
const lean = (a: RGB, b: RGB) => Math.abs(luminance(a) - luminance(b)) / (luminance(a) + luminance(b) + 1e-9);

describe('sky spherical harmonics', () => {
  it('the sample weights tile the sphere', () => {
    expect(2 * CAP_WEIGHT + 8 * RING_WEIGHT + 4 * HORIZON_WEIGHT).toBeCloseTo(1, 6);
  });

  it('a uniform radiance has irradiance pi * L everywhere', () => {
    const dirs = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
    const samples: RadianceSample[] = dirs.map(([x, y, z]) => ({ dir: { x, y, z }, color: [0.5, 0.25, 1], weight: 1 / 6 }));
    const sh = projectSH(samples);
    for (const n of [{ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0.6, y: 0, z: 0.8 }]) {
      const e = irradianceSH(sh, n);
      expect(e[0]).toBeCloseTo(Math.PI * 0.5, 2);
      expect(e[1]).toBeCloseTo(Math.PI * 0.25, 2);
      expect(e[2]).toBeCloseTo(Math.PI, 2);
    }
  });

  it('a bright upper hemisphere lights up-facing normals more than down-facing ones', () => {
    const samples: RadianceSample[] = [
      { dir: { x: 0, y: 1, z: 0 }, color: [1, 1, 1], weight: 0.5 },
      { dir: { x: 0, y: -1, z: 0 }, color: [0.1, 0.1, 0.1], weight: 0.5 },
    ];
    const sh = projectSH(samples);
    expect(irradianceSH(sh, { x: 0, y: 1, z: 0 })[0]).toBeGreaterThan(irradianceSH(sh, { x: 0, y: -1, z: 0 })[0] * 2);
  });

  it('the day fill is about what the hemisphere light gave, lighter above than below, with a sunward lean', () => {
    const l = light(10);
    const up = irradianceSH(l.sh, { x: 0, y: 1, z: 0 });
    const down = irradianceSH(l.sh, { x: 0, y: -1, z: 0 });
    // The hemisphere light put hemiIntensity x its colour's luminance on up-facing surfaces; the probe matches that.
    const lumUp = luminance(up);
    const lumDown = luminance(down);
    expect(lumUp).toBeGreaterThan(l.hemiIntensity * 0.5);
    expect(lumUp).toBeLessThan(l.hemiIntensity * 1.01);
    // (a normalised blue sky is dimmer than the ground-bounce colour, as with the old hemisphere light)
    expect(lumDown).toBeGreaterThan(l.hemiIntensity * 0.4);
    expect(lumDown).toBeLessThan(l.hemiIntensity * 1.2);
    const e = computeEphemeris(113, 4, 13, 10);
    const az = Math.atan2(e.sun.x, -e.sun.z);
    const toward = irradianceSH(l.sh, { x: Math.sin(az), y: 0, z: -Math.cos(az) });
    const away = irradianceSH(l.sh, { x: -Math.sin(az), y: 0, z: Math.cos(az) });
    expect(lean(toward, away)).toBeGreaterThan(1e-4);
  });

  it('night fill is blue-grey and never negative; overcast flattens the lean', () => {
    const n = light(23, 'clear', 33);
    const up = irradianceSH(n.sh, { x: 0, y: 1, z: 0 });
    expect(up[2]).toBeGreaterThan(up[0]);
    for (const v of n.sh) expect(Number.isFinite(v)).toBe(true);
    for (const dir of [{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 }]) for (const v of irradianceSH(n.sh, dir)) expect(v).toBeGreaterThanOrEqual(-1e-6);
    const o = light(11, 'overcast');
    const c = light(11, 'clear');
    const east = { x: 1, y: 0, z: 0 }, west = { x: -1, y: 0, z: 0 };
    expect(lean(irradianceSH(o.sh, east), irradianceSH(o.sh, west))).toBeLessThanOrEqual(lean(irradianceSH(c.sh, east), irradianceSH(c.sh, west)) + 1e-6);
  });
});
