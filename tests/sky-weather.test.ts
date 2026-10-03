import { describe, expect, it } from 'vitest';
import { CLIMATE, WEATHER_PRESETS, WEATHER_STATES, WeatherController, blendWeather } from '../src/world/sky/weather';

describe('sky weather', () => {
  it('has a preset and a climate row for every state, with probabilities summing to 1', () => {
    for (const s of WEATHER_STATES) {
      expect(WEATHER_PRESETS[s]).toBeTruthy();
      const total = CLIMATE[s].reduce((a, [, p]) => a + p, 0);
      expect(total).toBeCloseTo(1, 6);
    }
  });

  it('blends parameters (fog geometrically) and hits the endpoints exactly', () => {
    const a = WEATHER_PRESETS.clear, b = WEATHER_PRESETS.rain;
    const m = blendWeather(a, b, 0.5);
    expect(m.cloudCover).toBeCloseTo((a.cloudCover + b.cloudCover) / 2, 9);
    expect(m.fog).toBeCloseTo(Math.sqrt(a.fog * b.fog), 9);
    expect(blendWeather(a, b, 0).fog).toBeCloseTo(a.fog, 12);
    expect(blendWeather(a, b, 1).rain).toBe(b.rain);
  });

  it('transitions smoothly over the requested time', () => {
    const w = new WeatherController('clear');
    w.set('overcast', 10);
    expect(w.transitioning).toBe(true);
    const covers: number[] = [];
    for (let i = 0; i < 12; i++) {
      w.update(1);
      covers.push(w.params.cloudCover);
    }
    for (let i = 1; i < covers.length; i++) expect(covers[i]).toBeGreaterThanOrEqual(covers[i - 1] - 1e-12);
    expect(w.transitioning).toBe(false);
    expect(w.params.cloudCover).toBeCloseTo(WEATHER_PRESETS.overcast.cloudCover, 9);
  });

  it('starts a new transition from the current blended look (no jumps)', () => {
    const w = new WeatherController('clear');
    w.set('rain', 10);
    w.update(5);
    const mid = w.params.cloudCover;
    w.set('clear', 10);
    expect(w.params.cloudCover).toBeCloseTo(mid, 12);
  });

  it('wets quickly in rain and dries slowly afterwards', () => {
    const w = new WeatherController('rain');
    for (let i = 0; i < 60; i++) w.update(1);
    expect(w.wetness).toBeGreaterThan(0.99);
    w.set('clear', 0);
    w.update(60);
    expect(w.wetness).toBeGreaterThan(0.6);
    for (let i = 0; i < 300; i++) w.update(1);
    expect(w.wetness).toBe(0);
  });

  it('auto climate changes state over game hours and is deterministic per seed', () => {
    const run = (seed: number) => {
      const w = new WeatherController('clear', seed);
      w.auto = true;
      const seen: string[] = [];
      for (let i = 0; i < 2000; i++) {
        const c = w.update(1, 0.05);
        if (c) seen.push(c);
      }
      return seen;
    };
    const a = run(7), b = run(7);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(3);
    for (const s of a) expect(WEATHER_STATES).toContain(s);
  });
});
