/**
 * Layers that go with a footfall: the hobnails of a legionary's caligae on hard ground, the creak
 * and scuff of plain leather soles, and the push-off of a jump. The recordings come from
 * scripts/sfx/spec.mjs; the bakes below are only the stand-ins used before they load.
 */
import { Biquad, addNoiseBurst, alloc } from '../dsp/core';
import type { BakeContext, SoundDef } from './types';
import { click, grains, thump } from './util';

function bakeHobnail(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(0.22, rate);
  // A cluster of iron heads biting the ground: a few bright ticks a hair apart, over a short ring.
  for (let i = 0; i < 5; i++) click(out, rate, rnd, 0.003 + i * rnd.range(0.002, 0.006), { bp: rnd.range(3200, 5200), q: 2, amp: rnd.range(0.3, 0.6), t60: 0.012 });
  addNoiseBurst(out, rate, rnd, 0.004, { dur: 0.08, amp: 0.25, attack: 0.0005, t60: 0.04, bp: 2400, q: 3 });
  return out;
}

function bakeLeather(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(0.25, rate);
  thump(out, rate, rnd, 0.004, { freq: rnd.range(90, 130), amp: 0.5, t60: 0.04, lp: 400 });
  grains(out, rate, rnd, 0.004, 0.06, { density: 400, fLo: 1500, fHi: 5000, amp: 0.2, grain: [0.001, 0.003] });
  new Biquad().lowpass(5000, 0.7, rate).run(out);
  return out;
}

const base = { bus: 'sfx' as const, kind: 'oneshot' as const, group: 'Footsteps', spatial: { ref: 1.5, max: 30, rolloff: 1.2 }, reverb: 0.15, priority: 0.2 };

export const gearSounds: SoundDef[] = [
  { ...base, id: 'gear.hobnail', label: 'hobnails (caligae)', variants: 4, gainDb: -14, maxVoices: 4, randomRate: 0.05, expect: { dur: [0.02, 0.4] }, bake: bakeHobnail },
  { ...base, id: 'gear.leather', label: 'leather sole', variants: 4, gainDb: -16, maxVoices: 4, randomRate: 0.06, expect: { dur: [0.05, 0.5] }, bake: bakeLeather },
  { ...base, id: 'jump.push', label: 'jump push-off', variants: 3, gainDb: -10, maxVoices: 2, randomRate: 0.05, expect: { dur: [0.04, 0.5] }, bake: bakeLeather },
];
