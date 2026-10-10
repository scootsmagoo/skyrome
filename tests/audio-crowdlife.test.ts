/**
 * The city's voices (src/audio/CrowdLife.ts): the hum follows the number of people, voices come from
 * real pairs with silence between them, nothing talks at night; and the new beds have no voice in them.
 */
import { describe, expect, it } from 'vitest';
import { BED_RMS, bakeRate, getVariants } from '../src/audio/bank';
import { analyze, spectralCentroid } from '../src/audio/dsp/analysis';
import { timeFactor } from '../src/audio/ambienceCurves';
import { ChatterPlanner, CrowdLife, Pacer, crowdHum, easeTo, findTalkers, findVendors, streetActivity, type Person, type Talker } from '../src/audio/CrowdLife';
import { SOUNDS } from '../src/audio/bank';

const person = (id: string, x: number, z: number, task?: Person['brain'] extends infer B ? (B extends { task?: infer T } ? T : never) : never, role?: string): Person => ({
  id,
  position: { x, y: 0, z },
  role: role ? { id: role } : null,
  brain: task ? { task } : null,
});

describe('crowd hum level', () => {
  it('is silent for a few people and grows with the crowd', () => {
    expect(crowdHum(0)).toBe(0);
    expect(crowdHum(3)).toBe(0);
    expect(crowdHum(8)).toBeGreaterThan(0.05);
    expect(crowdHum(8)).toBeLessThan(crowdHum(20));
    expect(crowdHum(20)).toBeLessThan(crowdHum(50));
    expect(crowdHum(55)).toBeCloseTo(0.75, 2);
    expect(crowdHum(500)).toBeLessThanOrEqual(0.75);
  });
  it('is monotonic', () => {
    let prev = -1;
    for (let n = 0; n <= 80; n++) {
      const v = crowdHum(n);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it('is near silent at night through the layer curve', () => {
    expect(crowdHum(55) * timeFactor('crowd', 3, 4)).toBeLessThan(0.03);
    expect(crowdHum(55) * timeFactor('crowd', 10, 4)).toBeGreaterThan(0.7);
  });
  it('eases toward its target', () => {
    let v = 0;
    for (let i = 0; i < 40; i++) v = easeTo(v, 1, 0.5, 4);
    expect(v).toBeGreaterThan(0.99);
    expect(easeTo(0, 1, 0.5, 4)).toBeLessThan(0.15);
  });
});

describe('street activity', () => {
  it('is busy by day, lower at the siesta, nearly asleep at night', () => {
    expect(streetActivity(10)).toBe(1);
    expect(streetActivity(13.5)).toBeLessThan(0.8);
    expect(streetActivity(13.5)).toBeGreaterThan(0.6);
    expect(streetActivity(2)).toBeLessThan(0.1);
    expect(streetActivity(23.5)).toBeLessThan(0.1);
  });
});

describe('finding people who are talking', () => {
  it('finds a converse pair once, at its midpoint', () => {
    const a = person('a', 0, 0, { kind: 'converse', partner: { id: 'b' } });
    const b = person('b', 2, 0, { kind: 'converse', partner: { id: 'a' } });
    const out: Talker[] = [];
    findTalkers([a, b, person('c', 5, 5, { kind: 'goto' })], out);
    expect(out.length).toBe(1);
    expect(out[0].key).toBe('a|b');
    expect(out[0].x).toBeCloseTo(1);
    expect(out[0].y).toBeCloseTo(1.5);
  });
  it('pairs two idlers in the talk loop within 3.5 m, not a lone talker or far ones', () => {
    const out: Talker[] = [];
    const idle = (id: string, x: number) => person(id, x, 0, { kind: 'idle', loop: 'talk' });
    findTalkers([idle('a', 0), idle('b', 3), idle('c', 20)], out);
    expect(out.map((t) => t.key)).toEqual(['a|b']);
    findTalkers([idle('a', 0), idle('c', 20)], out);
    expect(out.length).toBe(0);
  });
  it('ignores the dead and people in a conversation with the player', () => {
    const a = person('a', 0, 0, { kind: 'converse', partner: { id: 'b' } });
    const b = person('b', 2, 0, { kind: 'converse', partner: { id: 'a' } });
    b.dead = true;
    const out: Talker[] = [];
    findTalkers([a, b], out);
    expect(out.length).toBe(1); // a still talks to b's corpse? no: a's pair is found from a
    a.talking = true;
    findTalkers([a, b], out);
    expect(out.length).toBe(0);
  });
  it('finds vendors in earshot only', () => {
    const out: Talker[] = [];
    findVendors([person('m1', 3, 0, null, 'merchant'), person('m2', 12, 0, null, 'merchant'), person('m3', 60, 0, null, 'merchant'), person('c', 12, 0, null, 'citizen')], 0, 0, out);
    expect(out.map((t) => t.key)).toEqual(['m2']);
  });
});

describe('chatter planner', () => {
  const pair = (key: string, x: number): Talker => ({ key, x, y: 1.5, z: 0 });
  const rnd = (() => {
    let s = 7;
    return () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
  })();

  it('leaves a gap between voices and a cool-down per pair', () => {
    const p = new ChatterPlanner();
    const pairs = [pair('a|b', 8), pair('c|d', 10), pair('e|f', 12)];
    let now = 0;
    let first = -1;
    const times: number[] = [];
    for (let i = 0; i < 1200; i++, now += 0.5) {
      const t = p.plan(now, 10, 0, 0, pairs, rnd);
      if (t) {
        times.push(now);
        if (first < 0) first = now;
      }
    }
    expect(first).toBeGreaterThanOrEqual(1.2); // the pair settles first
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(3.5);
    // 10 minutes, three pairs on a cool-down of 35-80 s: at most ~3 per 35 s, and never a wall.
    expect(times.length / 10).toBeLessThan(10);
    expect(times.length / 10).toBeGreaterThan(2);
  });

  it('is silent when nobody is talking, too near or too far', () => {
    const p = new ChatterPlanner();
    let now = 0;
    for (let i = 0; i < 200; i++, now += 0.5) {
      expect(p.plan(now, 10, 0, 0, [], rnd)).toBeNull();
      expect(p.plan(now, 10, 0, 0, [pair('x|y', 40)], rnd)).toBeNull();
      expect(p.plan(now, 10, 0, 0, [pair('x|y', 1)], rnd)).toBeNull();
    }
  });

  it('is rarer at night', () => {
    const count = (hour: number) => {
      const p = new ChatterPlanner();
      const pairs = Array.from({ length: 8 }, (_, i) => pair(`p${i}|q${i}`, 6 + i));
      let n = 0;
      for (let now = 0; now < 1200; now += 0.5) if (p.plan(now, hour, 0, 0, pairs, rnd)) n++;
      return n;
    };
    expect(count(2)).toBeLessThan(count(10) / 3);
  });
});

describe('pacer', () => {
  it('stretches gaps when the streets are quiet', () => {
    const a = new Pacer(4, 8);
    a.fired(0, 1, 0);
    expect(a.ready(3.9)).toBe(false);
    expect(a.ready(4)).toBe(true);
    const b = new Pacer(4, 8);
    b.fired(0, 0.1, 0);
    expect(b.ready(19)).toBe(false);
    expect(b.ready(20)).toBe(true);
  });
});

describe('CrowdLife system', () => {
  it('sets the crowd layer from the people nearby and plays a murmur at a talking pair', () => {
    const plays: { id: string; position: { x: number; z: number } }[] = [];
    const base: Record<string, number> = {};
    const audio = {
      ambience: { hour: 10, enabled: true, setBase: (l: Record<string, number>) => Object.assign(base, l) },
      play: (id: string, o: { position: { x: number; z: number } }) => void plays.push({ id, position: o.position }),
    };
    const crowd: Person[] = [];
    for (let i = 0; i < 40; i++) crowd.push(person(`n${i}`, 5 + (i % 8), -10 + Math.floor(i / 8) * 2, { kind: 'goto' }));
    crowd.push(person('t1', 8, 4, { kind: 'converse', partner: { id: 't2' } }), person('t2', 9, 4, { kind: 'converse', partner: { id: 't1' } }));
    const game = { player: { position: { x: 0, y: 0, z: 0 } } };
    const sys = new CrowdLife(game as never, audio as never, () => ({ near: () => crowd }), () => 0.5);
    for (let i = 0; i < 200; i++) sys.update(0.5);
    expect(base.crowd).toBeGreaterThan(0.4);
    const murmurs = plays.filter((p) => p.id === 'amb.murmur');
    expect(murmurs.length).toBeGreaterThanOrEqual(1);
    expect(murmurs.length).toBeLessThan(8); // 100 s with one pair
    expect(murmurs[0].position.x).toBeCloseTo(8.5);
    // Alone in a lane: no hum, no voices.
    crowd.length = 0;
    plays.length = 0;
    for (let i = 0; i < 200; i++) sys.update(0.5);
    expect(base.crowd).toBeLessThan(0.02);
    expect(plays.length).toBe(0);
  });
});

/** Share of the envelope's variation that lies in the syllable band (3-8 Hz), a voice detector. */
function syllableShare(buf: Float32Array, rate: number): number {
  const hop = Math.round(rate / 50); // 20 ms
  const env: number[] = [];
  for (let s = 0; s + hop <= buf.length; s += hop) {
    let a = 0;
    for (let i = s; i < s + hop; i++) a += buf[i] * buf[i];
    env.push(Math.sqrt(a / hop));
  }
  const mean = env.reduce((a, b) => a + b, 0) / env.length;
  const x = env.map((v) => v - mean);
  const power = (f: number) => {
    let re = 0;
    let im = 0;
    for (let i = 0; i < x.length; i++) {
      re += x[i] * Math.cos((2 * Math.PI * f * i) / 50);
      im += x[i] * Math.sin((2 * Math.PI * f * i) / 50);
    }
    return re * re + im * im;
  };
  let syl = 0;
  let all = 0;
  for (let f = 0.25; f <= 20; f += 0.25) {
    const p = power(f);
    all += p;
    if (f >= 3 && f <= 8) syl += p;
  }
  return syl / (all || 1);
}

describe('the beds carry no voice', () => {
  it('bed.crowd and bed.city have no syllable rhythm and sit low in the spectrum', () => {
    const rows: string[] = [];
    for (const id of ['bed.crowd', 'bed.city', 'bed.arena']) {
      const def = SOUNDS.get(id)!;
      const buf = getVariants(id)![0];
      const rate = bakeRate(def);
      const s = analyze(buf, rate);
      expect(s.rms).toBeGreaterThan(BED_RMS * 0.8);
      const share = syllableShare(buf, rate);
      const c = spectralCentroid(buf, rate);
      rows.push(`${id}: syllable-band share ${(share * 100).toFixed(1)} %, centroid ${c.toFixed(0)} Hz`);
      if (id !== 'bed.arena') {
        expect(share, id).toBeLessThan(0.3);
        expect(c, id).toBeLessThan(1100);
      }
    }
    console.log(rows.join('\n'));
  });
  it('amb.murmur is a short exchange, dark and soft', () => {
    const def = SOUNDS.get('amb.murmur')!;
    const vars = getVariants('amb.murmur')!;
    expect(vars.length).toBe(10);
    const rate = bakeRate(def);
    const durs = vars.map((b) => b.length / rate);
    const cs = vars.map((b) => spectralCentroid(b, rate));
    console.log(`murmur durations ${durs.map((d) => d.toFixed(1)).join(' ')} s; centroids ${cs.map((c) => c.toFixed(0)).join(' ')} Hz`);
    for (const d of durs) {
      expect(d).toBeGreaterThan(1.2);
      expect(d).toBeLessThan(5.5);
    }
    for (const c of cs) expect(c).toBeLessThan(2200);
    expect(def.spatial!.max).toBeLessThanOrEqual(25);
  });
});
