import { describe, expect, it } from 'vitest';
import type { LocomotionState } from '../src/actors/Actor';
import { AmbienceDirector } from '../src/audio/Ambience';
import { altitudeFactors, timeFactor, trapezoid, zoneWeight } from '../src/audio/ambienceCurves';
import { FootstepDriver, cadence } from '../src/audio/FootstepDriver';
import { distanceGain, pickVariant, planVoice, sliderToGain, airCutoff, type VoiceSlot } from '../src/audio/mix';
import { MusicDirector, Performer, type Rack } from '../src/audio/music/MusicDirector';

describe('mix rules', () => {
  it('maps sliders to gain', () => {
    expect(sliderToGain(0)).toBe(0);
    expect(sliderToGain(1)).toBe(1);
    expect(20 * Math.log10(sliderToGain(0.5))).toBeCloseTo(-12, 0);
    expect(sliderToGain(2)).toBe(1);
  });

  it('attenuates with distance like Web Audio inverse, fading to zero at max', () => {
    const s = { ref: 2, max: 50, rolloff: 1 };
    expect(distanceGain(1, s)).toBe(1);
    expect(distanceGain(4, s)).toBeCloseTo(0.5, 6);
    expect(distanceGain(50, s)).toBe(0);
    let last = 2;
    for (let d = 0; d <= 50; d += 0.5) {
      const g = distanceGain(d, s);
      expect(g).toBeLessThanOrEqual(last + 1e-12);
      last = g;
    }
    expect(airCutoff(100)).toBeLessThan(airCutoff(10));
  });

  it('steals the oldest voice of the same sound', () => {
    const active: VoiceSlot[] = [0, 1, 2].map((i) => ({ id: 'step', start: i, priority: 0.3, gain: 0.5 }));
    const p = planVoice(active, { id: 'step', priority: 0.3, gain: 0.5 }, 3, 40);
    expect(p.allow).toBe(true);
    expect(p.steal).toEqual([active[0]]);
  });

  it('globally steals the least important voice, or drops the newcomer', () => {
    const active: VoiceSlot[] = [
      { id: 'a', start: 0, priority: 0.9, gain: 0.5 },
      { id: 'b', start: 1, priority: 0.1, gain: 0.05 },
      { id: 'c', start: 2, priority: 0.5, gain: 0.5 },
    ];
    const strong = planVoice(active, { id: 'd', priority: 0.8, gain: 0.6 }, 4, 3);
    expect(strong).toEqual({ allow: true, steal: [active[1]] });
    const weak = planVoice(active, { id: 'd', priority: 0.1, gain: 0.01 }, 4, 3);
    expect(weak.allow).toBe(false);
  });

  it('never repeats a variant twice in a row', () => {
    let last = -1;
    for (let i = 0; i < 200; i++) {
      const v = pickVariant(4, last, Math.random());
      expect(v).not.toBe(last);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(4);
      last = v;
    }
    expect(pickVariant(1, 0, 0.5)).toBe(0);
  });
});

describe('ambience curves', () => {
  it('trapezoids wrap around midnight', () => {
    expect(trapezoid(12, 6, 8, 16, 18)).toBe(1);
    expect(trapezoid(7, 6, 8, 16, 18)).toBeCloseTo(0.5);
    expect(trapezoid(20, 6, 8, 16, 18)).toBe(0);
    expect(trapezoid(23, 19.5, 21, 4, 5.5)).toBe(1);
    expect(trapezoid(2, 19.5, 21, 4, 5.5)).toBe(1);
    expect(trapezoid(12, 19.5, 21, 4, 5.5)).toBe(0);
  });

  it('knows when things are heard in Rome', () => {
    const MAY = 4;
    const JUL = 6;
    const JAN = 0;
    expect(timeFactor('cicadas', 14, JUL)).toBe(1);
    expect(timeFactor('cicadas', 14, MAY)).toBeLessThan(0.5); // the first ones
    expect(timeFactor('cicadas', 2, JUL)).toBe(0);
    expect(timeFactor('cicadas', 14, JAN)).toBe(0);
    expect(timeFactor('crickets', 23, MAY)).toBeGreaterThan(0.5);
    expect(timeFactor('crickets', 12, MAY)).toBe(0);
    expect(timeFactor('swifts', 19.5, MAY)).toBe(1);
    expect(timeFactor('swifts', 19.5, JAN)).toBe(0);
    expect(timeFactor('carts', 23, MAY)).toBe(1); // night traffic (Lex Iulia)
    expect(timeFactor('carts', 11, MAY)).toBe(0);
    expect(timeFactor('owl', 1, MAY)).toBe(1);
    expect(timeFactor('crowd', 10, MAY)).toBe(1);
    expect(timeFactor('crowd', 3, MAY)).toBeLessThan(0.2);
    expect(timeFactor('fountain', 3, MAY)).toBe(1);
  });

  it('thins the city and raises the wind with altitude', () => {
    const low = altitudeFactors(5);
    const high = altitudeFactors(40);
    expect(low.city).toBe(1);
    expect(high.city).toBeCloseTo(0.3);
    expect(high.wind).toBe(1);
    expect(low.wind).toBeCloseTo(0.3);
    expect(zoneWeight(5, 10, 5)).toBe(1);
    expect(zoneWeight(15, 10, 5)).toBe(0);
    expect(zoneWeight(12.5, 10, 5)).toBeCloseTo(0.5);
  });

  it('director blends base levels, zones, time and altitude', () => {
    const fakeEngine = { game: { time: { hour: 10, date: () => ({ month: 4 }) } } } as any;
    const d = new AmbienceDirector(fakeEngine);
    d.setBase({ city: 0.8, wind: 0.5, birds: 0.4 });
    d.addZone({ center: { x: 0, y: 0, z: 0 }, radius: 10, fade: 10, layers: [{ id: 'crowd', volume: 1 }, { id: 'birds', volume: 0.2 }] });
    d.addZone({ center: { x: 100, y: 0, z: 0 }, radius: 10, layers: [{ id: 'fire', volume: 1 }], timeless: true });
    const inForum = d.computeLevels({ x: 0, y: 0, z: 0 }, 10, 4);
    expect(inForum.get('crowd')).toBe(1);
    expect(inForum.get('birds')).toBeCloseTo(0.4 * timeFactor('birds', 10, 4)); // base beats the weaker zone
    expect(inForum.get('fire')).toBeUndefined();
    const edge = d.computeLevels({ x: 15, y: 0, z: 0 }, 10, 4);
    expect(edge.get('crowd')!).toBeGreaterThan(0);
    expect(edge.get('crowd')!).toBeLessThan(1);
    const night = d.computeLevels({ x: 0, y: 0, z: 0 }, 3, 4);
    expect(night.get('crowd')!).toBeLessThan(0.2);
    const hill = d.computeLevels({ x: 0, y: 40, z: 0 }, 10, 4);
    expect(hill.get('crowd')!).toBeCloseTo(0.3);
    expect(hill.get('wind')!).toBeGreaterThan(inForum.get('wind')!);
    const hearth = d.computeLevels({ x: 100, y: 0, z: 0 }, 3, 4);
    expect(hearth.get('fire')).toBe(1);
  });
});

// ---------------------------------------------------------------- footsteps

function locomotion(over: Partial<LocomotionState>): LocomotionState {
  return { speed: 0, forwardSpeed: 0, strafeSpeed: 0, verticalSpeed: 0, grounded: true, sprinting: false, sneaking: false, turnRate: 0, ...over };
}

function runDriver(states: { s: Partial<LocomotionState>; seconds: number }[], surface = 'stone' as const) {
  const played: string[] = [];
  let cur = locomotion({});
  const src = { locomotionState: () => cur, position: { x: 0, y: 0, z: 0 } };
  const d = new FootstepDriver(src, (id) => played.push(id), { surfaceAt: () => surface, voice: 'm', gear: 'none' });
  for (const st of states) {
    cur = locomotion(st.s);
    for (let t = 0; t < st.seconds; t += 1 / 60) d.update(1 / 60);
  }
  return played;
}

describe('FootstepDriver', () => {
  it('steps at a natural cadence for each gait', () => {
    expect(cadence(1.9)).toBeGreaterThan(1.8);
    expect(cadence(1.9)).toBeLessThan(2.3);
    expect(cadence(7)).toBeLessThanOrEqual(3.4);
    const walk = runDriver([{ s: { speed: 1.9 }, seconds: 10 }]);
    expect(walk.length).toBeGreaterThanOrEqual(Math.floor(cadence(1.9) * 10) - 1);
    expect(walk.length).toBeLessThanOrEqual(Math.ceil(cadence(1.9) * 10) + 1);
    expect(walk.every((id) => id === 'step.stone.walk')).toBe(true);
    const run = runDriver([{ s: { speed: 4.4 }, seconds: 10 }]);
    expect(run.length).toBeGreaterThan(walk.length);
    expect(run[0]).toBe('step.stone.run');
    const sneak = runDriver([{ s: { speed: 1.5, sneaking: true }, seconds: 4 }], 'wood' as never);
    expect(sneak[0]).toBe('step.wood.sneak');
  });

  it('is silent standing still or in the air, and lands with a thud', () => {
    expect(runDriver([{ s: { speed: 0 }, seconds: 5 }])).toEqual([]);
    const jump = runDriver([
      { s: { speed: 0 }, seconds: 0.5 },
      { s: { speed: 0, grounded: false, verticalSpeed: 5.6 }, seconds: 0.05 },
      { s: { speed: 0, grounded: false, verticalSpeed: -7 }, seconds: 0.6 },
      { s: { speed: 0 }, seconds: 0.5 },
    ]);
    expect(jump[0]).toBe('step.stone.run'); // push-off
    expect(jump).toContain('land.stone');
    expect(jump.filter((id) => id.startsWith('step.')).length).toBe(1);
  });

  it('puts the trailing foot down once when stopping', () => {
    const steps = runDriver([
      { s: { speed: 1.9 }, seconds: 0.8 },
      { s: { speed: 0 }, seconds: 2 },
    ]);
    const moving = runDriver([{ s: { speed: 1.9 }, seconds: 0.8 }]);
    expect(steps.length - moving.length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------- music scheduling

interface Rec {
  kind: string;
  when: number;
  state: string;
}

function fakeRack(state: string, log: Rec[]): Rack {
  const rec = (kind: string) => (when: number) => log.push({ kind, when, state });
  return {
    melody: (inst, when) => log.push({ kind: inst, when, state }),
    lyre: rec('lyre'),
    drum: rec('drum'),
    cymbal: rec('cymbal'),
    drone: rec('drone'),
    level: (when, gain) => log.push({ kind: `level:${gain}`, when, state }),
    dispose: rec('dispose'),
  };
}

function fakeOut(t = 0) {
  return { ctx: { currentTime: t, state: 'running' } as unknown as BaseAudioContext, dry: {} as AudioNode, rev: {} as AudioNode };
}

describe('music scheduler', () => {
  it('schedules notes in order on the audio clock, only up to the horizon', () => {
    const log: Rec[] = [];
    const p = new Performer('combat', fakeRack('combat', log), 0, 1);
    p.pump(5);
    const n5 = log.length;
    expect(n5).toBeGreaterThan(20);
    expect(log.every((r) => r.when < 5.01)).toBe(true);
    p.pump(30);
    expect(log.length).toBeGreaterThan(n5 * 3);
    for (let i = 1; i < log.length; i++) expect(log[i].when).toBeGreaterThanOrEqual(log[i - 1].when - 0.012);
    expect(log.every((r) => r.when <= 30.01)).toBe(true);
  });

  it('skips events that are already late instead of bursting them', () => {
    const log: Rec[] = [];
    const p = new Performer('tavern', fakeRack('tavern', log), 0, 2);
    p.pump(10, 8); // the engine was frozen for 8 s
    expect(log.filter((r) => r.kind !== 'drone' && r.when < 7.9).length).toBe(0);
  });

  it('crossfades between states and resolves the explore alias by time', () => {
    const log: Rec[] = [];
    const out = fakeOut(0);
    const m = new MusicDirector();
    m.makeRack = (_o, s) => fakeRack(s, log);
    let night = false;
    m.isNight = () => night;
    m.attach(out, { offline: true });
    m.setState('explore');
    expect(m.state).toBe('explore-day');
    m.pump(20);
    expect(log.some((r) => r.state === 'explore-day' && r.kind !== 'level:0' && !r.kind.startsWith('level'))).toBe(true);
    (out.ctx as any).currentTime = 20;
    m.setOverride('combat', 'combat', 10);
    expect(m.state).toBe('combat');
    m.pump(40);
    const lastDay = Math.max(...log.filter((r) => r.state === 'explore-day' && !r.kind.startsWith('level') && r.kind !== 'dispose').map((r) => r.when));
    expect(lastDay).toBeLessThan(20 + 1.3); // fades out in 1.2 s
    const firstCombat = Math.min(...log.filter((r) => r.state === 'combat' && !r.kind.startsWith('level')).map((r) => r.when));
    expect(firstCombat).toBeGreaterThanOrEqual(20);
    expect(firstCombat).toBeLessThan(21);
    // Combat over at night: back to explore, which now resolves to night music.
    night = true;
    (out.ctx as any).currentTime = 40;
    m.setOverride('combat', null);
    expect(m.state).toBe('explore-night');
    m.pump(70);
    expect(log.some((r) => r.state === 'explore-night' && r.when >= 41.8)).toBe(true);
    // Silence stops everything new.
    (out.ctx as any).currentTime = 70;
    m.setState('silence');
    expect(m.state).toBe('silence');
    const before = log.length;
    m.pump(100);
    expect(log.slice(before).filter((r) => r.when > 75 && !r.kind.startsWith('level') && r.kind !== 'dispose').length).toBe(0);
  });

  it('higher-priority overrides win', () => {
    const m = new MusicDirector();
    m.makeRack = (_o, s) => fakeRack(s, []);
    m.attach(fakeOut(), { offline: true });
    m.setState('explore-day');
    m.setOverride('zone', 'temple', 1);
    expect(m.state).toBe('temple');
    m.setOverride('combat', 'combat', 5);
    expect(m.state).toBe('combat');
    m.setOverride('combat', null);
    expect(m.state).toBe('temple');
    m.setOverride('zone', null);
    expect(m.state).toBe('explore-day');
  });
});
