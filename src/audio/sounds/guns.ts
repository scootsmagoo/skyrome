/**
 * The anachronism cheat's guns (src/game/anachronism): pistol, rifle and shotgun shots, the pump,
 * the RPG's launch, the blast, a ricochet and a dry click. Synthesised like the rest of the bank:
 * a hard crack (high noise), a body (low-passed noise plus a falling low mode) and a room tail.
 * The bank normalises every one-shot, so `gainDb` and the shape (not the amplitudes here) set how
 * loud each one sits against the others.
 */
import { Biquad, TWO_PI, addMode, addNoiseBurst, alloc } from '../dsp/core';
import type { BakeContext, SoundDef } from './types';
import { click, grains, hump, strike, thump, whoosh } from './util';

/** A shot: crack + body + the report's tail. All amplitudes relative; the bank normalises. */
function shot(c: BakeContext, o: { dur: number; crack: number; body: number; bodyHz: number; bodyT60: number; low: number; lowHz: number; tail: number; tailBp: number; tailT60: number; snap?: number }) {
  const { rate, rnd } = c;
  const out = alloc(o.dur, rate);
  const hz = rnd.vary(0.06);
  // The crack: a very short, very bright burst, the hammer-blow of the muzzle blast.
  addNoiseBurst(out, rate, rnd, 0, { dur: 0.03, amp: o.crack * 2, attack: 0.00015, t60: 0.011, hp: 1800 });
  addNoiseBurst(out, rate, rnd, 0, { dur: 0.05, amp: o.crack, attack: 0.0002, t60: 0.02, bp: 3200 * hz, q: 0.8 });
  // The body: the gas pressure, low-passed noise with a low mode falling under it.
  addNoiseBurst(out, rate, rnd, 0.0008, { dur: o.bodyT60 * 1.5, amp: o.body * 2.2, attack: 0.0008, t60: o.bodyT60, lp: o.bodyHz * hz });
  addMode(out, rate, 0.0008, o.lowHz * hz, o.low, o.bodyT60 * 1.7, { attack: 0.001, glide: 1.1 });
  // A bullet's supersonic snap (a short mid-band ring right behind the crack).
  if (o.snap) addNoiseBurst(out, rate, rnd, 0.002, { dur: 0.05, amp: o.snap, attack: 0.0005, t60: 0.02, bp: 1500 * hz, q: 2.2 });
  // The tail: the shot thrown back by walls and streets (a dense, decaying wash).
  grains(out, rate, rnd, 0.01, o.dur - 0.02, { density: 900, fLo: o.tailBp * 0.45, fHi: o.tailBp * 2.2, amp: o.tail, grain: [0.004, 0.012], env: (u) => Math.pow(1 - u, 2.4) * (u < 0.04 ? u / 0.04 : 1), q: 1.2 });
  void o.tailT60;
  return squash(out, 2.6);
}

/**
 * Saturate toward a flat top: a gunshot is all crack and pressure, and a clean sum of them is a
 * needle of a peak with little weight behind it. This keeps the transient and fattens what follows.
 */
function squash(out: Float32Array, drive: number) {
  let p = 0;
  for (let i = 0; i < out.length; i++) p = Math.max(p, Math.abs(out[i]));
  if (p < 1e-9) return out;
  const k = drive / p;
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * k);
  return out;
}

function bakePistol(c: BakeContext) {
  return shot(c, { dur: 0.55, crack: 1.5, body: 0.35, bodyHz: 900, bodyT60: 0.05, low: 0.25, lowHz: 230, tail: 0.1, tailBp: 1400, tailT60: 0.4, snap: 0.5 });
}

function bakeRifle(c: BakeContext) {
  // Punchier and lower than the pistol, and short enough to stack ten a second.
  return shot(c, { dur: 0.42, crack: 1.6, body: 0.6, bodyHz: 800, bodyT60: 0.06, low: 0.4, lowHz: 170, tail: 0.1, tailBp: 1100, tailT60: 0.3, snap: 0.45 });
}

function bakeShotgun(c: BakeContext) {
  const { rate, rnd } = c;
  const out = shot(c, { dur: 1.05, crack: 0.9, body: 1.1, bodyHz: 420, bodyT60: 0.16, low: 1.2, lowHz: 95, tail: 0.16, tailBp: 800, tailT60: 0.7 });
  // A heavy second thump: the load of shot tearing out of the barrel.
  thump(out, rate, rnd, 0.004, { freq: 70, amp: 0.8, t60: 0.2, lp: 300, modeAmp: 0.6 });
  return squash(out, 2);
}

function bakePump(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(0.6, rate);
  // The slide back, a rasp of steel on steel, and the slide forward, with a heavy clack at each end.
  const clack = (t: number, f: number, a: number) => {
    strike(out, rate, rnd, t, f, [[1, 0.5, 0.05], [2.4, 0.3, 0.035], [4.1, 0.16, 0.025]], { amp: a, noise: 0.8, noiseBp: 2600 });
    thump(out, rate, rnd, t, { freq: 140, amp: 0.35 * a, t60: 0.04, lp: 700 });
  };
  clack(0.01, rnd.range(1500, 1800), 0.8);
  grains(out, rate, rnd, 0.03, 0.14, { density: 500, fLo: 1500, fHi: 5500, amp: 0.1, env: (u) => hump(u, 0.5, 1) });
  clack(0.2, rnd.range(1100, 1400), 1);
  grains(out, rate, rnd, 0.22, 0.12, { density: 400, fLo: 1500, fHi: 5000, amp: 0.08, env: (u) => hump(u, 0.4, 1) });
  return out;
}

function bakeRpgLaunch(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(1.6, rate);
  // The pop of the booster, then the sustainer's roar: noise rising through a band as the rocket
  // gathers speed and clears the tube, thinning into a hiss.
  addNoiseBurst(out, rate, rnd, 0, { dur: 0.05, amp: 1.4, attack: 0.0005, t60: 0.02, hp: 1200 });
  thump(out, rate, rnd, 0.001, { freq: 90, amp: 1.2, t60: 0.22, lp: 380, modeAmp: 0.7 });
  whoosh(out, rate, rnd, 0.02, 1.4, { fc: (u) => 260 + 1900 * Math.pow(u, 0.8), amp: (u) => hump(u, 0.18, 0.7) * 0.9, q: 0.55, pink: true });
  whoosh(out, rate, rnd, 0.05, 1.2, { fc: (u) => 2600 + 1800 * u, amp: (u) => hump(u, 0.25, 1.2) * 0.35, q: 1.2 });
  // Rumble underneath.
  const lp = new Biquad().lowpass(180, 0.7, rate);
  const n = Math.round(1.0 * rate);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    out[i] += lp.process(rnd.bi()) * hump(u, 0.12, 0.8) * 3.2;
  }
  return out;
}

function bakeExplosion(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(4.2, rate);
  // The blast front: a crack and a wall of mid noise.
  addNoiseBurst(out, rate, rnd, 0, { dur: 0.06, amp: 1.5, attack: 0.0004, t60: 0.025, hp: 1500 });
  addNoiseBurst(out, rate, rnd, 0.001, { dur: 0.5, amp: 2.4, attack: 0.002, t60: 0.28, bp: 1100, q: 0.6 });
  // The boom: low noise and a deep mode falling away, the thing you feel.
  addNoiseBurst(out, rate, rnd, 0.002, { dur: 1.6, amp: 3.6, attack: 0.004, t60: 1.0, lp: 380 });
  addMode(out, rate, 0.002, 62 * rnd.vary(0.05), 2.6, 1.9, { attack: 0.005, glide: 0.45 });
  addMode(out, rate, 0.002, 38 * rnd.vary(0.05), 2.2, 2.4, { attack: 0.008, glide: 0.3 });
  addMode(out, rate, 0.01, 110, 1.0, 0.9, { attack: 0.004, glide: 0.5 });
  // Debris pattering down, and the city throwing the sound back: a slow, dark wash.
  grains(out, rate, rnd, 0.15, 3.6, { density: 520, fLo: 180, fHi: 2400, amp: 0.34, grain: [0.006, 0.03], env: (u) => Math.pow(1 - u, 2.2) * (u < 0.05 ? u / 0.05 : 1), q: 0.9 });
  const lp = new Biquad().lowpass(520, 0.7, rate);
  const n = Math.round(3.8 * rate);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    out[i] += lp.process(rnd.bi()) * Math.pow(1 - u, 2.6) * 1.1 * Math.min(1, u * 20);
  }
  return squash(out, 1.6);
}

function bakeRicochet(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(0.5, rate);
  // A bullet off stone: the strike's ping and a falling whine.
  addNoiseBurst(out, rate, rnd, 0, { dur: 0.01, amp: 0.8, attack: 0.0002, t60: 0.004, hp: 3000 });
  const f0 = rnd.range(2600, 4000);
  const dur = rnd.range(0.25, 0.4);
  const n = Math.round(dur * rate);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    ph += (TWO_PI * f0 * (1 - 0.55 * u * u)) / rate;
    out[i] += Math.sin(ph) * Math.pow(1 - u, 2.2) * 0.22 * Math.min(1, i / 40) + rnd.bi() * 0.02 * (1 - u);
  }
  return out;
}

function bakeDryfire(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(0.16, rate);
  click(out, rate, rnd, 0, { bp: 3800, amp: 0.7, t60: 0.005 });
  strike(out, rate, rnd, 0.0015, rnd.range(2200, 2800), [[1, 0.35, 0.035], [2.3, 0.2, 0.025]], { noise: 0.4, noiseBp: 5000 });
  return out;
}

const base = { bus: 'sfx' as const, kind: 'oneshot' as const, group: 'Guns', reverb: 0.3 };
/** A gun is heard from far off: its report carries across the city. */
const loud = { ref: 3, max: 420, rolloff: 0.8 };

export const gunSounds: SoundDef[] = [
  { ...base, id: 'gun.pistol', label: 'pistol shot', variants: 4, gainDb: -4, maxVoices: 4, priority: 0.8, randomRate: 0.03, spatial: loud, rate: 44100, expect: { dur: [0.15, 0.6], centroid: [600, 6000] }, bake: bakePistol },
  { ...base, id: 'gun.rifle', label: 'assault rifle shot', variants: 5, gainDb: -5, maxVoices: 6, priority: 0.8, randomRate: 0.04, spatial: loud, rate: 44100, expect: { dur: [0.1, 0.45] }, bake: bakeRifle },
  { ...base, id: 'gun.shotgun', label: 'shotgun blast', variants: 3, gainDb: -2, maxVoices: 3, priority: 0.85, randomRate: 0.03, spatial: loud, rate: 44100, reverb: 0.4, expect: { dur: [0.3, 1.1] }, bake: bakeShotgun },
  { ...base, id: 'gun.pump', label: 'shotgun pump', variants: 3, gainDb: -8, maxVoices: 2, priority: 0.6, spatial: { ref: 2, max: 60, rolloff: 1.2 }, reverb: 0.15, expect: { dur: [0.2, 0.6], centroid: [1200, 7000] }, bake: bakePump },
  { ...base, id: 'gun.rpg.launch', label: 'RPG launch', variants: 3, gainDb: -3, maxVoices: 2, priority: 0.85, spatial: loud, reverb: 0.35, expect: { dur: [0.8, 1.7] }, bake: bakeRpgLaunch },
  { ...base, id: 'gun.explosion', label: 'explosion', variants: 3, gainDb: 0, maxVoices: 3, priority: 0.95, spatial: { ref: 12, max: 700, rolloff: 0.7 }, reverb: 0.5, expect: { dur: [1.5, 4.3] }, bake: bakeExplosion },
  { ...base, id: 'gun.ricochet', label: 'bullet ricochet', variants: 4, gainDb: -10, maxVoices: 3, priority: 0.4, randomRate: 0.1, spatial: { ref: 2, max: 80, rolloff: 1.2 }, reverb: 0.25, expect: { dur: [0.1, 0.5] }, bake: bakeRicochet },
  { ...base, id: 'gun.dryfire', label: 'dry fire click', variants: 2, gainDb: -10, maxVoices: 2, priority: 0.5, spatial: { ref: 1.5, max: 25, rolloff: 1.2 }, reverb: 0.1, expect: { dur: [0.01, 0.17] }, bake: bakeDryfire },
];
