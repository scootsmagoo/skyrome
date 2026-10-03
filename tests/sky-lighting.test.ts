import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { computeEphemeris } from '../src/world/sky/astronomy';
import { fogFactor } from '../src/world/sky/fog';
import { EXPOSURE, computeLighting } from '../src/world/sky/lighting';
import { snapToTexels } from '../src/world/sky/shadows';
import { lightTransmittance, luminance, transmittanceToSpace } from '../src/world/sky/skyModel';
import { BRIGHT_STARS, galacticFrame, precessToAD113 } from '../src/world/sky/stars';
import { WEATHER_PRESETS, type WeatherState } from '../src/world/sky/weather';

const light = (hour: number, weather: WeatherState = 'clear', day = 13) => {
  const e = computeEphemeris(113, 4, day, hour);
  return computeLighting({ sun: e.sun, moon: e.moon, moonIllumination: e.moonIllumination, hour, weather: WEATHER_PRESETS[weather] });
};

describe('sky model', () => {
  it('reddens and dims the sun toward the horizon; haze dims it further', () => {
    const noon = lightTransmittance({ x: 0, y: 0.9, z: 0.43 }, 3.5);
    const low = lightTransmittance({ x: 0, y: 0.07, z: 0.99 }, 3.5);
    expect(luminance(low)).toBeLessThan(luminance(noon) * 0.5);
    expect(low[2] / low[0]).toBeLessThan(noon[2] / noon[0] * 0.3);
    expect(luminance(lightTransmittance({ x: 0, y: 0.07, z: 0.99 }, 16))).toBeLessThan(luminance(low));
    // Below the horizon the ground blocks the sun.
    expect(transmittanceToSpace(0.05, -0.2, 3.5)).toEqual([0, 0, 0]);
  });
});

describe('sky lighting', () => {
  it('noon is the brightest, shadows are on, lamps are out, exposure is near 1', () => {
    const l = light(13);
    expect(l.keyIsMoon).toBe(false);
    expect(l.keyIntensity).toBeGreaterThan(2.5);
    expect(l.shadowIntensity).toBeGreaterThan(0.9);
    expect(l.lampFactor).toBe(0);
    expect(l.exposure).toBeGreaterThan(0.85);
    expect(l.exposure).toBeLessThan(1.2);
  });

  it('golden hour light is warm', () => {
    const l = light(18.7);
    expect(l.keyColor[0]).toBe(1);
    expect(l.keyColor[2]).toBeLessThan(0.3);
  });

  it('night is moonlit, cool, darker but playable (exposure capped), lamps lit', () => {
    const n = light(23);
    expect(n.keyIsMoon).toBe(true);
    expect(n.keyColor[2]).toBeGreaterThanOrEqual(n.keyColor[0]);
    expect(n.keyIntensity).toBeLessThan(light(13).keyIntensity * 0.15);
    expect(n.keyIntensity).toBeGreaterThan(0.05);
    expect(n.lampFactor).toBe(1);
    expect(n.exposure).toBeLessThanOrEqual(EXPOSURE.max);
    expect(n.stars).toBeGreaterThan(0.8);
    // A moonless night (2 June) still has some fill.
    const dark = light(23, 'clear', 33);
    expect(dark.hemiIntensity).toBeGreaterThan(0.05);
  });

  it('rain darkens, hides shadows and lights the lamps early', () => {
    const r = light(11, 'rain');
    const c = light(11);
    expect(r.keyIntensity).toBeLessThan(c.keyIntensity * 0.2);
    expect(r.shadowIntensity).toBeLessThan(0.15);
    expect(r.fogDensity).toBeGreaterThan(c.fogDensity * 3);
    expect(light(18.9, 'rain').lampFactor).toBeGreaterThan(light(18.9).lampFactor);
  });

  it('every output is finite through a whole day in every weather', () => {
    for (const w of ['clear', 'hazy', 'overcast', 'rain', 'storm'] as WeatherState[]) {
      for (let h = 0; h < 24; h += 0.5) {
        const l = light(h, w);
        const nums = [l.keyIntensity, l.hemiIntensity, l.fogDensity, l.exposure, ...l.fogColor, ...l.fogSunColor, ...l.keyColor, ...l.sunDisc, ...l.cloudSun];
        for (const v of nums) expect(Number.isFinite(v)).toBe(true);
        for (const v of nums) expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('fog', () => {
  it('matches plain exponential fog with no falloff and thins with height', () => {
    expect(fogFactor(0.002, 0, 0, 10, { x: 500, y: 0, z: 0 })).toBeCloseTo(1 - Math.exp(-1), 9);
    const level = fogFactor(0.002, 0.02, 0, 0, { x: 500, y: 0, z: 0 });
    const up = fogFactor(0.002, 0.02, 0, 0, { x: 500, y: 100, z: 0 });
    const high = fogFactor(0.002, 0.02, 0, 80, { x: 500, y: 0, z: 0 });
    expect(up).toBeLessThan(level);
    expect(high).toBeLessThan(level);
    expect(fogFactor(0.002, 0.02, 0, 0, { x: 0, y: 0, z: 0 })).toBe(0);
  });
});

describe('shadow texel snapping', () => {
  it('is stable under sub-texel motion and moves in whole texels', () => {
    const dir = new THREE.Vector3(-0.4, 0.8, 0.3).normalize();
    const texel = 150 / 2048;
    const z = dir.clone();
    const x = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), z).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    const a = snapToTexels(new THREE.Vector3(10.01, 3, -4.02), dir, texel);
    const b = snapToTexels(new THREE.Vector3(10.01 + texel * 0.02, 3, -4.02), dir, texel);
    // The texel grid (light-space x/y) doesn't move; only depth along the light may.
    expect(Math.abs(a.dot(x) - b.dot(x))).toBeLessThan(1e-9);
    expect(Math.abs(a.dot(y) - b.dot(y))).toBeLessThan(1e-9);
    // Light-space x/y of a snapped point are integer multiples of the texel.
    for (const p of [a, snapToTexels(new THREE.Vector3(-37.3, 12, 88.8), dir, texel)]) {
      const fx = p.dot(x) / texel, fy = p.dot(y) / texel;
      expect(Math.abs(fx - Math.round(fx))).toBeLessThan(1e-6);
      expect(Math.abs(fy - Math.round(fy))).toBeLessThan(1e-6);
    }
    // Snapping never moves the point by more than a texel diagonal.
    const p = new THREE.Vector3(5.5, 1, 2.25);
    expect(snapToTexels(p, dir, texel).distanceTo(p)).toBeLessThan(texel);
  });
});

describe('stars', () => {
  it('precesses Polaris away from the pole in AD 113 (it was ~12° off)', () => {
    const v = precessToAD113(2.5303, 89.264);
    const dec = Math.asin(v.z) / (Math.PI / 180);
    expect(dec).toBeGreaterThan(75);
    expect(dec).toBeLessThan(80);
  });
  it('keeps the galactic frame orthogonal and the catalog valid', () => {
    const g = galacticFrame();
    expect(Math.abs(g.pole.dot(g.center))).toBeLessThan(0.01);
    for (const [name, ra, dec, mag] of BRIGHT_STARS) {
      expect(name.length).toBeGreaterThan(0);
      expect(ra).toBeGreaterThanOrEqual(0);
      expect(ra).toBeLessThan(24);
      expect(Math.abs(dec)).toBeLessThanOrEqual(90);
      expect(mag).toBeLessThan(4.5);
    }
  });
});
