/**
 * Runtime behaviour of the audio module that the QA review flagged: zone hysteresis and the probe,
 * music request priorities and crossfade revival, performers waiting for baked samples, the music
 * sample budget, bounded modulation, and the output soft clipper.
 */
import { describe, expect, it } from 'vitest';
import { AmbienceDirector } from '../src/audio/Ambience';
import { ZoneLatch, zoneWeight } from '../src/audio/ambienceCurves';
import { SOFT_CLIP_RANGE, softClipCurve } from '../src/audio/mix';
import { Composer } from '../src/audio/music/composer';
import { MusicDirector, Performer, type Rack } from '../src/audio/music/MusicDirector';
import { brightnessFor, sampleKey } from '../src/audio/music/sampleSpec';
import { SampleStore } from '../src/audio/music/samples';
import { MODES, finalsFor, fourthOrFifthApart } from '../src/audio/music/theory';

// ---------------------------------------------------------------- zones

describe('ZoneLatch', () => {
  const opt = (key: string, weight: number, radius = 10) => ({ key, weight, radius });

  it('enters above 0.6, holds for a second, and leaves only below 0.4', () => {
    const l = new ZoneLatch<string>();
    expect(l.update([opt('temple', 0.55)], 0.2)).toBe(null); // not yet in
    for (let i = 0; i < 4; i++) expect(l.update([opt('temple', 0.8)], 0.2)).toBe(null); // 0.8 s: still holding
    expect(l.update([opt('temple', 0.8)], 0.2)).toBe('temple');
    // Wobbling around the edge never lets go…
    for (const w of [0.5, 0.45, 0.62, 0.41, 0.58]) expect(l.update([opt('temple', w)], 0.2)).toBe('temple');
    // …a brief dip below 0.4 doesn't either (the hold)…
    expect(l.update([opt('temple', 0.3)], 0.2)).toBe('temple');
    expect(l.update([opt('temple', 0.5)], 0.2)).toBe('temple');
    // …but staying out does.
    for (let i = 0; i < 4; i++) l.update([opt('temple', 0.2)], 0.2);
    expect(l.update([opt('temple', 0.2)], 0.2)).toBe(null);
  });

  it('prefers a nested zone, and lets go of a removed zone at once', () => {
    const l = new ZoneLatch<string>(0.6, 0.4, 0);
    expect(l.update([opt('forum', 1, 30)], 0.2)).toBe('forum');
    expect(l.update([opt('forum', 1, 30), opt('taberna', 1, 5)], 0.2)).toBe('taberna');
    const held = new ZoneLatch<string>(0.6, 0.4, 5);
    for (let i = 0; i < 30; i++) held.update([opt('cave', 1)], 0.2);
    expect(held.current).toBe('cave');
    expect(held.update([], 0.2)).toBe(null);
  });
});

/** A stand-in engine that records what the director asks of it. */
function fakeEngine(player: { x: number; y: number; z: number } | null, listener: { x: number; y: number; z: number }) {
  const log = { env: [] as string[], music: [] as (string | null)[] };
  const engine = {
    game: { time: { hour: 10, date: () => ({ month: 4 }) }, player: player ? { position: player } : undefined },
    listener,
    loop: () => ({ setVolume() {}, stop() {} }),
    setEnvironment: (p: string) => log.env.push(p),
    prepareEnvironment: () => {},
    music: { setOverride: (_k: string, s: string | null) => log.music.push(s) },
  };
  return { engine: engine as any, log };
}

describe('AmbienceDirector zones', () => {
  it('measures zones at the player, not at the swinging third-person camera', () => {
    // Player on the temple's top step (weight ≈ 0.83); the camera 3.4 m behind, outside the zone.
    const player = { x: 0, y: 1.35, z: -17.2 };
    const camera = { x: 0.4, y: 2.9, z: -13.8 };
    const { engine, log } = fakeEngine(player, camera);
    const d = new AmbienceDirector(engine);
    d.defaultReverb = 'street';
    const zone = d.addZone({ name: 'temple', center: { x: 0, y: 0, z: -24 }, radius: 5.5, fade: 5, layers: [], reverb: 'temple', music: 'temple' });
    expect(zoneWeight(Math.hypot(camera.x, camera.z + 24), 5.5, 5)).toBeLessThan(0.05);
    for (let i = 0; i < 8; i++) d.update(0.2);
    expect(zone.weight).toBeGreaterThan(0.8);
    expect(log.env.at(-1)).toBe('temple');
    expect(log.music.at(-1)).toBe('temple');
    // Turning the camera around changes nothing.
    camera.z = -20.6;
    for (let i = 0; i < 8; i++) d.update(0.2);
    camera.z = -13.8;
    for (let i = 0; i < 8; i++) d.update(0.2);
    expect(log.env.every((e, i) => i < 4 || e === 'temple')).toBe(true);
    expect(log.music).toEqual(['temple']);
  });

  it('falls back to the listener without a player', () => {
    const { engine } = fakeEngine(null, { x: 0, y: 0, z: -24 });
    const d = new AmbienceDirector(engine);
    const zone = d.addZone({ center: { x: 0, y: 0, z: -24 }, radius: 5, layers: [], reverb: 'temple' });
    d.update(0.2);
    expect(zone.weight).toBe(1);
  });
});

// ---------------------------------------------------------------- music requests

interface Rec {
  kind: string;
  when: number;
  state: string;
}

function recordingRack(state: string, log: Rec[], ready: () => boolean = () => true): Rack {
  const rec = (kind: string) => (when: number) => log.push({ kind, when, state });
  return {
    melody: (inst, when) => log.push({ kind: inst, when, state }),
    lyre: rec('lyre'),
    drum: rec('drum'),
    cymbal: rec('cymbal'),
    drone: rec('drone'),
    level: (when, gain) => log.push({ kind: `level:${gain}`, when, state }),
    prepare: () => ready(),
    dispose: rec('dispose'),
  };
}

function director() {
  const log: Rec[] = [];
  const out = { ctx: { currentTime: 0, state: 'running' } as unknown as BaseAudioContext, dry: {} as AudioNode, rev: {} as AudioNode };
  const m = new MusicDirector();
  let racks = 0;
  m.makeRack = (_o, s) => (racks++, recordingRack(s, log));
  m.attach(out, { offline: true });
  return { m, log, out, racks: () => racks };
}

describe('music request priorities', () => {
  it('a combat base state is not swallowed by a temple or tavern zone', () => {
    const { m } = director();
    m.setOverride('ambience-zone', 'temple', 1);
    m.setState('combat');
    expect(m.state).toBe('combat');
    m.setOverride('ambience-zone', 'tavern', 1);
    expect(m.state).toBe('combat');
    m.setState('tension');
    expect(m.state).toBe('tension');
  });

  it('explore and silence yield to zones; overrides outrank everything', () => {
    const { m } = director();
    m.setState('explore');
    m.setOverride('ambience-zone', 'temple', 1);
    expect(m.state).toBe('temple');
    m.setState('silence');
    expect(m.state).toBe('temple');
    m.setState('tavern');
    m.setOverride('ambience-zone', 'temple', 1);
    expect(m.state).toBe('tavern');
    m.setOverride('combat', 'combat', 10);
    expect(m.state).toBe('combat');
    m.setOverride('combat', null);
    expect(m.state).toBe('tavern');
    m.setState('explore');
    expect(m.state).toBe('temple');
    m.setOverride('ambience-zone', null);
    expect(m.state).toBe('explore-day');
  });

  it('returning to a state that is still fading out revives it instead of restarting', () => {
    const { m, out, racks } = director();
    m.setState('explore');
    m.pump(10);
    expect(racks()).toBe(1);
    (out.ctx as any).currentTime = 10;
    m.setOverride('ambience-zone', 'temple', 1); // into the temple: explore fades over 4 s
    expect(racks()).toBe(2);
    (out.ctx as any).currentTime = 11.5;
    m.pump(11.8, 11.5);
    m.setOverride('ambience-zone', null); // straight back out
    expect(m.state).toBe('explore-day');
    expect(racks()).toBe(2); // the explore performance came back; no new piece
    // Long after a fade has finished, a new performance starts.
    (out.ctx as any).currentTime = 30;
    m.pump(30.3, 30);
    m.setOverride('ambience-zone', 'temple', 1);
    expect(racks()).toBe(3);
  });
});

describe('Performer and baked samples', () => {
  it('waits for a block’s samples instead of playing it with missing notes', () => {
    const log: Rec[] = [];
    let ready = false;
    let asked = 0;
    const rack = recordingRack('combat', log, () => (asked++, ready));
    const p = new Performer('combat', rack, 0.05, 1);
    p.pump(0.35, 0.05);
    p.pump(0.4, 0.1);
    expect(log.length).toBe(0);
    expect(asked).toBeGreaterThan(0);
    ready = true;
    const before = asked;
    p.pump(0.45, 0.15);
    expect(log.length).toBeGreaterThan(0);
    // The music starts when the samples arrived (no burst of late notes)…
    expect(Math.min(...log.map((r) => r.when))).toBeGreaterThanOrEqual(0.15);
    // …and the following block was requested at the same time, a whole block ahead.
    expect(asked - before).toBe(2);
  });
});

// ---------------------------------------------------------------- memory

function fakeCtx() {
  return {
    createBuffer: (_c: number, length: number) => ({ length, getChannelData: () => new Float32Array(length) }),
  } as unknown as BaseAudioContext;
}

describe('SampleStore', () => {
  it('evicts least-recently-used samples beyond its budget, never recently used ones', () => {
    let now = 0;
    const store = new SampleStore(() => now);
    const ctx = fakeCtx();
    const kb = (freq: number) => ({ kind: 'pluck' as const, body: 'lyre' as const, freq, bright: 'soft' as const });
    store.budgetBytes = 1048576; // a 110 Hz pluck is ≈ 0.47 MB
    store.keepSeconds = 30;
    const a = kb(110);
    const b = kb(220);
    const c = kb(330);
    store.get(ctx, a, true);
    now = 10;
    store.get(ctx, b, true);
    now = 20;
    store.get(ctx, c, true); // over budget, but everything was used within 30 s
    expect(store.size).toBe(3);
    now = 45;
    store.get(ctx, a); // touch a (now the most recent)
    store.get(ctx, kb(440), true); // over budget: b (last used at 10 s, stale) goes; c (20 s) is recent
    expect(store.has(b)).toBe(false);
    expect(store.has(c)).toBe(true);
    expect(store.has(a)).toBe(true);
    expect(store.evicted).toBe(1);
    now = 100;
    store.get(ctx, kb(550), true); // now everything older than 70 s may go, oldest first
    expect(store.bytes).toBeLessThanOrEqual(store.budgetBytes);
    expect(store.has(kb(550))).toBe(true);
  });

  it('keys plucks by pitch and one of two brightnesses', () => {
    expect(brightnessFor(0.35)).toEqual({ bucket: 'soft', dark: true });
    expect(brightnessFor(0.55)).toEqual({ bucket: 'soft', dark: false });
    expect(brightnessFor(0.75)).toEqual({ bucket: 'bright', dark: false });
    expect(sampleKey({ kind: 'pluck', body: 'kithara', freq: 146.83, bright: 'bright' })).toBe('kithara:146.8:bright');
  });
});

describe('composer modulation', () => {
  it('only ever uses a finite set of finals, however long it plays', () => {
    for (const state of ['combat', 'tension', 'temple', 'tavern'] as const) {
      const c = new Composer(state, 7);
      const finals = new Set<string>();
      const keys = new Set<string>();
      let t = 0;
      let at1h = 0;
      while (t < 3 * 3600) {
        const b = c.next();
        if (b.kind !== 'silence') finals.add(b.info.final.toFixed(2));
        for (const e of b.events) if (e.part === 'lyre') keys.add(e.freq!.toFixed(1));
        t += b.pulses * b.spp;
        if (!at1h && t > 3600) at1h = keys.size;
      }
      expect(finals.size).toBeLessThanOrEqual(12);
      // The set of lyre pitches saturates (it no longer grows after the first hour or so).
      expect(keys.size - at1h).toBeLessThanOrEqual(8);
    }
  });

  it('knows its finals and their fourth/fifth relations', () => {
    const d = finalsFor(MODES.dorian);
    expect(d.length).toBe(4);
    for (const f of d) {
      expect(f).toBeGreaterThanOrEqual(180);
      expect(f).toBeLessThan(360);
    }
    expect(fourthOrFifthApart(d[0], d[1])).toBe(true); // up a fourth
    expect(fourthOrFifthApart(200, 300)).toBe(true);
    expect(fourthOrFifthApart(200, 225)).toBe(false);
  });
});

// ---------------------------------------------------------------- output stage

describe('soft clipper', () => {
  it('is linear below -3 dBFS, monotonic, and never reaches full scale', () => {
    const n = 4096;
    const c = softClipCurve(n);
    const x = (i: number) => ((2 * i) / (n - 1) - 1) * SOFT_CLIP_RANGE;
    let max = 0;
    for (let i = 0; i < n; i++) {
      if (Math.abs(x(i)) <= 0.7) expect(c[i]).toBeCloseTo(x(i), 6);
      if (i) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]);
      max = Math.max(max, Math.abs(c[i]));
    }
    expect(max).toBeLessThan(0.98);
    expect(max).toBeGreaterThan(0.95);
    expect(c[0]).toBeCloseTo(-c[n - 1], 6);
  });
});
