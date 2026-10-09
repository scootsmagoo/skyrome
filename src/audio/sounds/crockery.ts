/** Crockery and spills: an amphora breaking on stone, wine splashing out of it. */
import { addMode, addNoiseBurst, alloc } from '../dsp/core';
import type { BakeContext, SoundDef } from './types';
import { bubble, click, grains, hump, strike, thump, whoosh } from './util';

function bakePotBreak(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(1.15, rate);
  // The crack: a hard burst of high noise, the clay's dull ring, and the belly's thud on the stones.
  addNoiseBurst(out, rate, rnd, 0, { dur: 0.02, amp: 0.9, attack: 0.0002, t60: 0.008, hp: 1800 });
  const ring = rnd.range(900, 1300);
  strike(out, rate, rnd, 0.001, ring, [[1, 0.5, 0.09], [1.58, 0.32, 0.07], [2.31, 0.22, 0.05], [3.4, 0.12, 0.04]], { noise: 0.5, noiseBp: 3200 });
  thump(out, rate, rnd, 0.004, { freq: rnd.range(110, 150), amp: 0.35, t60: 0.07, lp: 700 });
  // The pieces: shards ticking and skittering over the stones, fewer and quieter as they settle.
  const n = rnd.int(14, 24);
  for (let i = 0; i < n; i++) {
    const t = 0.03 + Math.pow(rnd.next(), 1.6) * 0.8;
    const a = 0.5 * Math.pow(1 - t / 0.9, 1.4) * rnd.range(0.4, 1);
    if (a < 0.02) continue;
    addMode(out, rate, t, rnd.range(1600, 4600), a * 0.5, rnd.range(0.015, 0.045));
    click(out, rate, rnd, t, { bp: rnd.range(2500, 6000), amp: a * 0.5 });
  }
  grains(out, rate, rnd, 0.04, 0.5, { density: 260, fLo: 1800, fHi: 6500, amp: 0.1, grain: [0.002, 0.007], env: (u) => hump(u, 0.15, 1.2) });
  return out;
}

function bakeWineSplash(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(0.9, rate);
  // A heavy slap of liquid on stone, a spreading hiss, then glugs and drips.
  whoosh(out, rate, rnd, 0, 0.5, { fc: (u) => 2400 - 1500 * u, amp: (u) => hump(u, 0.12, 1.1) * 0.5, q: 0.7, pink: true });
  thump(out, rate, rnd, 0.002, { freq: 95, amp: 0.2, t60: 0.05, lp: 500 });
  const glugs = rnd.int(3, 6);
  let t = 0.12;
  for (let i = 0; i < glugs; i++) {
    bubble(out, rate, t, rnd.range(260, 520), rnd.range(0.05, 0.1), 0.2 * (1 - i / (glugs + 1)));
    t += rnd.range(0.05, 0.14);
  }
  for (let i = 0; i < 4; i++) bubble(out, rate, 0.45 + rnd.next() * 0.35, rnd.range(900, 1800), 0.04, 0.08, 1.8);
  return out;
}

const base = { bus: 'sfx' as const, kind: 'oneshot' as const, group: 'Foley', spatial: { ref: 2, max: 40, rolloff: 1.2 }, reverb: 0.3 };

export const crockerySounds: SoundDef[] = [
  { ...base, id: 'pot.break', label: 'amphora breaks', variants: 4, gainDb: -6, maxVoices: 2, priority: 0.8, randomRate: 0.06, expect: { dur: [0.3, 1.15], centroid: [1200, 7000] }, bake: bakePotBreak },
  { ...base, id: 'wine.splash', label: 'wine splashes', variants: 3, gainDb: -10, maxVoices: 2, priority: 0.6, randomRate: 0.05, expect: { dur: [0.2, 0.9], centroid: [400, 4000] }, bake: bakeWineSplash },
];
