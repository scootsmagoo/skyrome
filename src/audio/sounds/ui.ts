/**
 * Interface sounds and stingers. UI sounds are wooden and papery (wax tablets, scrolls), never
 * electronic. Stingers: a cornu/tuba call for quests (Roman military brass played natural
 * harmonics only), a kithara arpeggio for level-ups, a syrinx phrase for discoveries.
 */
import { addMode, addNoiseBurst, alloc, mixInto } from '../dsp/core';
import { brass, brassBody, cymbal, drumStroke, syrinx } from '../dsp/instruments';
import { pluck } from '../dsp/pluck';
import { MODES, degreeToFreq, FINALS } from '../music/theory';
import type { BakeContext, SoundDef } from './types';
import { grains, hump, strike, whoosh } from './util';

function bakeHover(c: BakeContext) {
  const out = alloc(0.05, c.rate);
  addMode(out, c.rate, 0.001, c.rnd.range(1700, 1900), 0.4, 0.018);
  addMode(out, c.rate, 0.001, 3400, 0.12, 0.01);
  return out;
}

function bakeClick(c: BakeContext) {
  const out = alloc(0.12, c.rate);
  strike(out, c.rate, c.rnd, 0.001, c.rnd.range(720, 780), [[1, 0.5, 0.05], [2.3, 0.25, 0.03], [3.9, 0.08, 0.02]], { noise: 0.25, noiseBp: 3000 });
  return out;
}

function bakeSwish(c: BakeContext, rising: boolean) {
  const { rate, rnd } = c;
  const dur = rising ? 0.3 : 0.24;
  const out = alloc(dur + 0.25, rate);
  // A scroll being unrolled / rolled up.
  whoosh(out, rate, rnd, 0, dur, { fc: (u) => (rising ? 700 + 2600 * u : 3200 - 2400 * u), amp: (u) => hump(u, rising ? 0.6 : 0.35, 1.2) * 0.5, q: 0.9, pink: true });
  grains(out, rate, rnd, 0, dur, { density: 250, fLo: 2500, fHi: 7000, amp: 0.06, env: (u) => hump(u, 0.5, 1) });
  if (rising) {
    const s = pluck(FINALS.D * 2, rate, rnd, { seconds: 0.4, t60: 0.6, brightness: 0.4, body: 'lyre' });
    mixInto(out, s, Math.round((dur - 0.06) * rate), 0.12);
  }
  return out;
}

function bakeError(c: BakeContext) {
  const out = alloc(0.25, c.rate);
  // Two muted taps on a wax tablet frame — "no", politely.
  strike(out, c.rate, c.rnd, 0.002, 290, [[1, 0.5, 0.06], [2.1, 0.2, 0.04]], { noise: 0.2, noiseBp: 1500 });
  strike(out, c.rate, c.rnd, 0.1, 255, [[1, 0.5, 0.07], [2.1, 0.2, 0.05]], { noise: 0.2, noiseBp: 1500 });
  return out;
}

function bakePage(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(0.42, rate);
  grains(out, rate, rnd, 0, 0.32, { density: 900, fLo: 1500, fHi: 7000, amp: 0.2, grain: [0.002, 0.008], env: (u) => hump(u, 0.3, 1) });
  whoosh(out, rate, rnd, 0, 0.32, { fc: (u) => 1500 + 1500 * u, amp: (u) => hump(u, 0.4, 1) * 0.25, q: 0.7 });
  return out;
}

// ---------------------------------------------------------------- stingers

/** The cornu's fundamental: B♭1. Calls use harmonics 3–8 (F3 … B♭4). */
const CORNU_F = 58.27;

function bakeCornu(c: BakeContext, kind: 'start' | 'complete' | 'fail') {
  const { rate, rnd } = c;
  const out = alloc(kind === 'complete' ? 3.4 : 2.8, rate);
  const h = (k: number) => CORNU_F * k;
  type N = [number, number, number, number]; // t, harmonic, dur, dyn
  const call: N[] =
    kind === 'start'
      ? [[0.05, 4, 0.14, 0.7], [0.22, 4, 0.1, 0.6], [0.35, 5, 0.14, 0.75], [0.52, 6, 1.0, 0.95]]
      : kind === 'complete'
        ? [[0.05, 6, 0.16, 0.8], [0.24, 5, 0.12, 0.7], [0.39, 6, 0.14, 0.8], [0.56, 8, 1.3, 1]]
        : [[0.05, 6, 0.4, 0.55], [0.5, 5, 0.4, 0.5], [0.95, 4, 0.45, 0.45], [1.45, 3, 0.9, 0.4]];
  // Two players (cornicines), a hair apart in time and tuning.
  for (const [t, k, d, dyn] of call) {
    brass(out, rate, rnd, { t, freq: h(k), dur: d, dyn }, { detuneCents: -4 });
    brass(out, rate, rnd, { t: t + 0.012, freq: h(k), dur: d, dyn: dyn * 0.9 }, { detuneCents: 5, amp: 0.8 });
  }
  if (kind === 'complete') {
    // The last note opens into a triad of natural harmonics (5, 6, 8) with a third horn.
    brass(out, rate, rnd, { t: 0.58, freq: h(5), dur: 1.25, dyn: 0.75 }, { amp: 0.6 });
    brass(out, rate, rnd, { t: 0.6, freq: h(4), dur: 1.2, dyn: 0.7 }, { amp: 0.5 });
  }
  brassBody(out, rate);
  // Tympanum underneath.
  const d = drumStroke('doum', rate, rnd, { f0: 78 });
  mixInto(out, d, Math.round(0.05 * rate), kind === 'fail' ? 0.25 : 0.45);
  if (kind === 'complete') {
    mixInto(out, drumStroke('doum', rate, rnd, { f0: 78 }), Math.round(0.56 * rate), 0.5);
    mixInto(out, cymbal('ring', rate, rnd), Math.round(0.56 * rate), 0.18);
  }
  return out;
}

function bakeLevelUp(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(3.2, rate);
  const mode = MODES.dorian;
  const D = FINALS.D / 2;
  // Rising arpeggio across the lyre's strings, then a strummed final chord (final, fifth, octave).
  const degs = [0, 4, 7, 9, 11];
  degs.forEach((dg, i) => {
    const s = pluck(degreeToFreq(mode, dg, D), rate, rnd, { seconds: 2.2, t60: 2.2, brightness: 0.75, body: 'kithara' });
    mixInto(out, s, Math.round((0.02 + i * 0.085) * rate), 0.5);
  });
  const chordT = 0.02 + degs.length * 0.085 + 0.18;
  [0, 4, 7, 11].forEach((dg, i) => {
    const s = pluck(degreeToFreq(mode, dg, D), rate, rnd, { seconds: 2.6, t60: 2.6, brightness: 0.85, body: 'kithara' });
    mixInto(out, s, Math.round((chordT + i * 0.018) * rate), 0.55);
  });
  mixInto(out, cymbal('ring', rate, rnd), Math.round(chordT * rate), 0.12);
  return out;
}

function bakeDiscover(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(3.4, rate);
  const mode = MODES.mixolydian;
  const G = FINALS.G * 2;
  const motif: [number, number, number][] = [[0.05, 4, 0.3], [0.38, 5, 0.18], [0.58, 4, 0.18], [0.78, 2, 0.35], [1.18, 4, 1.3]];
  for (const [t, dg, d] of motif) syrinx(out, rate, rnd, t, degreeToFreq(mode, dg, G), d, 0.45);
  const s = pluck(degreeToFreq(mode, 0, G / 2), rate, rnd, { seconds: 2.8, t60: 2.8, brightness: 0.5, body: 'lyre' });
  mixInto(out, s, Math.round(1.16 * rate), 0.35);
  const s2 = pluck(degreeToFreq(mode, 4, G / 2), rate, rnd, { seconds: 2.4, t60: 2.4, brightness: 0.5, body: 'lyre' });
  mixInto(out, s2, Math.round(1.2 * rate), 0.25);
  return out;
}

function bakeSkill(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(1.4, rate);
  const D = FINALS.D;
  mixInto(out, pluck(D, rate, rnd, { seconds: 1.3, t60: 1.3, brightness: 0.6, body: 'lyre' }), 0, 0.5);
  mixInto(out, pluck(D * 1.5, rate, rnd, { seconds: 1.2, t60: 1.2, brightness: 0.6, body: 'lyre' }), Math.round(0.07 * rate), 0.45);
  return out;
}

const ui = { bus: 'ui' as const, kind: 'oneshot' as const, group: 'UI', reverb: 0.05 };
const sting = { bus: 'ui' as const, kind: 'oneshot' as const, group: 'Stingers', reverb: 0.35, maxVoices: 1, priority: 1 };

export const uiSounds: SoundDef[] = [
  { ...ui, id: 'ui.hover', label: 'hover tick', variants: 3, gainDb: -26, maxVoices: 2, priority: 0.2, expect: { dur: [0.005, 0.05] }, bake: bakeHover },
  { ...ui, id: 'ui.click', label: 'click', variants: 3, gainDb: -18, maxVoices: 3, priority: 0.4, expect: { dur: [0.02, 0.12] }, bake: bakeClick },
  { ...ui, id: 'ui.open', label: 'menu open', variants: 2, gainDb: -16, maxVoices: 2, priority: 0.5, expect: { dur: [0.15, 0.55] }, bake: (c) => bakeSwish(c, true) },
  { ...ui, id: 'ui.close', label: 'menu close', variants: 2, gainDb: -17, maxVoices: 2, priority: 0.5, expect: { dur: [0.1, 0.5] }, bake: (c) => bakeSwish(c, false) },
  { ...ui, id: 'ui.error', label: 'error', variants: 1, gainDb: -14, maxVoices: 1, priority: 0.5, expect: { dur: [0.1, 0.25] }, bake: bakeError },
  { ...ui, id: 'ui.page', label: 'page turn', variants: 3, gainDb: -16, maxVoices: 2, priority: 0.4, expect: { dur: [0.15, 0.42] }, bake: bakePage },
  { ...sting, id: 'stinger.questStart', label: 'quest started (cornu)', variants: 2, gainDb: -9, expect: { dur: [1.2, 2.8], centroid: [200, 2500] }, bake: (c) => bakeCornu(c, 'start') },
  { ...sting, id: 'stinger.questComplete', label: 'quest complete (cornu)', variants: 2, gainDb: -9, expect: { dur: [1.6, 3.4], centroid: [200, 2500] }, bake: (c) => bakeCornu(c, 'complete') },
  { ...sting, id: 'stinger.questFail', label: 'quest failed', variants: 1, gainDb: -11, expect: { dur: [1.6, 2.8] }, bake: (c) => bakeCornu(c, 'fail') },
  { ...sting, id: 'stinger.levelUp', label: 'level up (kithara)', variants: 2, gainDb: -8, expect: { dur: [1.5, 3.2] }, bake: bakeLevelUp },
  { ...sting, id: 'stinger.discover', label: 'location discovered (syrinx)', variants: 2, gainDb: -10, expect: { dur: [1.5, 3.4] }, bake: bakeDiscover },
  { ...sting, id: 'stinger.skill', label: 'skill increase', variants: 1, gainDb: -14, expect: { dur: [0.5, 1.4] }, bake: bakeSkill },
];
