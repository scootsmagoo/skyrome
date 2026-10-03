import { describe, expect, it } from 'vitest';
import {
  azimuthOf,
  computeEphemeris,
  julianDay,
  obliquity,
  solarDeclination,
  sunriseSunset,
} from '../src/world/sky/astronomy';

describe('sky astronomy', () => {
  it('computes Julian Days in the Julian calendar', () => {
    // Meeus: 4 Oct 1582 (last Julian date) = JD 2299159.5; J2000 = 1 Jan 2000 12h TT is 13 days later in Julian reckoning.
    expect(julianDay(1582, 10, 4)).toBe(2299159.5);
    expect(julianDay(-4712, 1, 1.5)).toBe(0);
    expect(julianDay(113, 5, 13)).toBe(1762463.5);
  });

  it('has the larger ancient obliquity', () => {
    const e = obliquity(julianDay(113, 5, 13));
    expect(e).toBeGreaterThan(23.65);
    expect(e).toBeLessThan(23.72);
  });

  it('puts sunrise near 04:45 and sunset near 19:15 in mid-May AD 113', () => {
    const dec = solarDeclination(julianDay(113, 5, 13));
    expect(dec).toBeGreaterThan(17.5);
    expect(dec).toBeLessThan(19.5);
    const rs = sunriseSunset(dec)!;
    expect(rs.rise).toBeGreaterThan(4.6);
    expect(rs.rise).toBeLessThan(4.95);
    expect(rs.set).toBeGreaterThan(19.05);
    expect(rs.set).toBeLessThan(19.4);
  });

  it('places the sun east at dawn, south at noon, west at dusk', () => {
    const dawn = computeEphemeris(113, 4, 13, 6);
    const noon = computeEphemeris(113, 4, 13, 12);
    const dusk = computeEphemeris(113, 4, 13, 18.5);
    expect(dawn.sun.x).toBeGreaterThan(0.5);
    expect(dusk.sun.x).toBeLessThan(-0.5);
    expect(Math.abs(noon.sun.x)).toBeLessThan(1e-9);
    expect(noon.sun.z).toBeGreaterThan(0); // +z is south
    // Noon altitude = 90 − φ + δ ≈ 66°.
    expect(noon.sunElevation).toBeGreaterThan(65);
    expect(noon.sunElevation).toBeLessThan(67.5);
    // May sunrise is north of east (azimuth < 90°).
    const rise = computeEphemeris(113, 4, 13, 4.8);
    expect(Math.abs(rise.sunElevation)).toBeLessThan(1.5);
    expect(azimuthOf(rise.sun)).toBeGreaterThan(55);
    expect(azimuthOf(rise.sun)).toBeLessThan(70);
    for (const e of [dawn, noon, dusk]) expect(Math.hypot(e.sun.x, e.sun.y, e.sun.z)).toBeCloseTo(1, 9);
  });

  it('gives the real moon phase: a waxing gibbous moon on 13 May AD 113', () => {
    const e = computeEphemeris(113, 4, 13, 23);
    expect(e.moonPhase).toBeGreaterThan(0.25);
    expect(e.moonPhase).toBeLessThan(0.45);
    expect(e.moonIllumination).toBeGreaterThan(0.55);
    expect(e.moonIllumination).toBeLessThan(0.95);
    // A ~10-day moon is up in the late evening, in the south-west.
    expect(e.moonElevation).toBeGreaterThan(5);
    expect(e.moon.x).toBeLessThan(0);
  });

  it('cycles the moon through a synodic month', () => {
    const phases = [] as number[];
    for (let d = 0; d < 30; d++) phases.push(computeEphemeris(113, 4, 1 + (d % 28), 0).moonPhase);
    const full = computeEphemeris(113, 4, 18, 0);
    // Five days after a ~10-day moon is close to full.
    expect(full.moonIllumination).toBeGreaterThan(0.93);
    expect(Math.max(...phases) - Math.min(...phases)).toBeGreaterThan(0.8);
  });

  it('builds an orthonormal star matrix with the pole at the latitude elevation due north', () => {
    const e = computeEphemeris(113, 4, 13, 21.3);
    const m = e.starMatrix;
    const cols = [m.slice(0, 3), m.slice(3, 6), m.slice(6, 9)];
    for (const c of cols) expect(Math.hypot(c[0], c[1], c[2])).toBeCloseTo(1, 9);
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(dot(cols[0], cols[1])).toBeCloseTo(0, 9);
    expect(dot(cols[0], cols[2])).toBeCloseTo(0, 9);
    const pole = cols[2];
    expect(Math.asin(pole[1]) / (Math.PI / 180)).toBeCloseTo(41.89, 6);
    expect(pole[0]).toBeCloseTo(0, 9);
    expect(pole[2]).toBeLessThan(0); // north is -z
  });
});
