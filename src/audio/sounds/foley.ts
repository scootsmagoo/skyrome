/** Foley: cloth, armour, coins, doors, chests, locks, item handling. */
import { addMode, addNoiseBurst, alloc } from '../dsp/core';
import type { BakeContext, SoundDef } from './types';
import { click, creak, grains, hump, strike, thump, whoosh } from './util';

function bakeCloth(c: BakeContext) {
  const { rate, rnd } = c;
  const dur = rnd.range(0.28, 0.42);
  const out = alloc(dur + 0.03, rate);
  const peak = rnd.range(0.3, 0.5);
  // Wool tunic / cloak: a soft band of noise with a crinkly grain on top.
  whoosh(out, rate, rnd, 0, dur, { fc: (u) => 1800 + 1500 * u, amp: (u) => hump(u, peak, 1.2) * 0.35, q: 0.6, pink: true });
  grains(out, rate, rnd, 0, dur, { density: 600, fLo: 2000, fHi: 6500, amp: 0.12, grain: [0.002, 0.006], env: (u) => hump(u, peak, 1) });
  return out;
}

function bakeArmor(c: BakeContext) {
  const { rate, rnd } = c;
  const dur = rnd.range(0.18, 0.3);
  const out = alloc(dur + 0.25, rate);
  // Mail rings and plate edges knocking: many tiny metal ticks, a few lower plate clanks.
  const ticks = rnd.int(14, 26);
  for (let i = 0; i < ticks; i++) {
    const t = Math.pow(rnd.next(), 0.8) * dur;
    const f = rnd.range(2600, 7800);
    const a = rnd.range(0.04, 0.16);
    addMode(out, rate, t, f, a, rnd.range(0.03, 0.08));
    addMode(out, rate, t, f * rnd.range(1.4, 1.9), a * 0.5, rnd.range(0.02, 0.05));
  }
  const clanks = rnd.int(1, 3);
  for (let i = 0; i < clanks; i++) {
    strike(out, rate, rnd, rnd.next() * dur * 0.8, rnd.range(850, 1500), [[1, 0.18, 0.12], [1.83, 0.1, 0.08], [2.6, 0.06, 0.06]], { noise: 0.1 });
  }
  return out;
}

function bakeCoins(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(0.85, rate);
  // A few denarii dropped into a leather purse: a muffled purse thump and bright clinks.
  thump(out, rate, rnd, 0.005, { freq: 160, amp: 0.25, t60: 0.04, lp: 600 });
  let t = 0.01;
  const n = rnd.int(3, 6);
  for (let i = 0; i < n; i++) {
    const f = rnd.range(2600, 4200);
    strike(out, rate, rnd, t, f, [[1, 0.5, 0.35], [1.47, 0.35, 0.25], [2.09, 0.22, 0.18], [2.76, 0.12, 0.12]], { amp: rnd.range(0.4, 1) * (i === 0 ? 1 : 0.8), noise: 0.15, noiseBp: 6000 });
    t += rnd.range(0.025, 0.09);
  }
  return out;
}

function bakeDoor(c: BakeContext, open: boolean) {
  const { rate, rnd } = c;
  const out = alloc(open ? 1.35 : 0.85, rate);
  const latch = () => strike(out, rate, rnd, open ? 0.01 : 0.4, rnd.range(1300, 1700), [[1, 0.3, 0.05], [1.9, 0.2, 0.04], [3.1, 0.1, 0.03]], { noise: 0.4, noiseBp: 3000 });
  const wood: [number, number][] = [
    [rnd.range(380, 480), 3],
    [rnd.range(1000, 1250), 4],
    [rnd.range(2300, 2800), 5],
  ];
  if (open) {
    latch();
    const d = rnd.range(0.75, 1.05);
    const r0 = rnd.range(22, 34);
    creak(out, rate, rnd, 0.12, d, {
      pulseHz: (u) => r0 + 45 * Math.sin(Math.PI * Math.min(1, u * 1.2)) * rnd.range(0.9, 1.1),
      amp: (u) => hump(u, 0.35, 0.8) * 0.5,
      formants: wood,
    });
    whoosh(out, rate, rnd, 0.12, d, { fc: () => 300, amp: (u) => hump(u, 0.5, 1) * 0.12, q: 0.7, pink: true }); // air moved by the leaf
  } else {
    creak(out, rate, rnd, 0, 0.3, { pulseHz: (u) => 60 + 40 * u, amp: (u) => hump(u, 0.5, 1) * 0.35, formants: wood });
    const t = 0.36;
    thump(out, rate, rnd, t, { freq: rnd.range(85, 110), amp: 1, t60: 0.15, lp: 300, modeAmp: 0.5 });
    strike(out, rate, rnd, t, rnd.range(150, 200), [[1, 0.35, 0.22], [1.8, 0.2, 0.15], [2.7, 0.12, 0.1]]);
    latch();
    grains(out, rate, rnd, t + 0.02, 0.1, { density: 120, fLo: 1500, fHi: 4000, amp: 0.08, env: (u) => 1 - u }); // rattle in the frame
  }
  return out;
}

function bakeChest(c: BakeContext, open: boolean) {
  const { rate, rnd } = c;
  const out = alloc(open ? 0.85 : 0.5, rate);
  if (open) {
    strike(out, rate, rnd, 0.01, rnd.range(800, 1000), [[1, 0.3, 0.08], [2.1, 0.18, 0.05]], { noise: 0.3 }); // hasp
    creak(out, rate, rnd, 0.1, rnd.range(0.4, 0.55), {
      pulseHz: (u) => 55 + 70 * u,
      amp: (u) => hump(u, 0.4, 1) * 0.4,
      formants: [
        [rnd.range(800, 1000), 4],
        [rnd.range(2000, 2400), 5],
        [rnd.range(3300, 3800), 6],
      ],
    });
  } else {
    thump(out, rate, rnd, 0.01, { freq: rnd.range(120, 150), amp: 1, t60: 0.1, lp: 450 });
    strike(out, rate, rnd, 0.01, rnd.range(200, 260), [[1, 0.3, 0.12], [2.3, 0.15, 0.08]]);
    strike(out, rate, rnd, 0.05, rnd.range(800, 1000), [[1, 0.15, 0.06], [2.1, 0.08, 0.04]]); // hasp rattle
  }
  return out;
}

function bakeLock(kind: 'click' | 'turn' | 'break' | 'open', c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(kind === 'turn' ? 0.45 : kind === 'break' ? 0.6 : 0.3, rate);
  if (kind === 'click') {
    strike(out, rate, rnd, 0.002, rnd.range(3800, 6200), [[1, 0.4, 0.03], [1.6, 0.2, 0.02]], { noise: 0.5, noiseBp: 6500 });
  } else if (kind === 'turn') {
    let t = 0.005;
    const n = rnd.int(3, 5);
    for (let i = 0; i < n; i++) {
      addNoiseBurst(out, rate, rnd, t, { dur: 0.04, amp: 0.12, attack: 0.005, t60: 0.03, bp: rnd.range(3500, 5500), q: 3 });
      strike(out, rate, rnd, t + 0.03, rnd.range(4000, 6000), [[1, 0.25, 0.025]], { noise: 0.25, noiseBp: 6000 });
      t += rnd.range(0.06, 0.1);
    }
  } else if (kind === 'break') {
    addNoiseBurst(out, rate, rnd, 0, { dur: 0.01, amp: 0.8, attack: 0.0002, t60: 0.004, hp: 3000 });
    strike(out, rate, rnd, 0.002, rnd.range(3200, 4400), [[1, 0.4, 0.3], [2.7, 0.15, 0.18]]); // the pick's ping
    click(out, rate, rnd, rnd.range(0.15, 0.25), { bp: 4000, amp: 0.2 }); // tip falling
  } else {
    strike(out, rate, rnd, 0.005, rnd.range(700, 900), [[1, 0.5, 0.1], [2.3, 0.3, 0.07], [3.9, 0.15, 0.05]], { noise: 0.6, noiseBp: 2500 });
    addNoiseBurst(out, rate, rnd, 0.03, { dur: 0.08, amp: 0.12, attack: 0.01, t60: 0.06, bp: 1800, q: 2 }); // bolt sliding
  }
  return out;
}

function bakePickup(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(0.25, rate);
  whoosh(out, rate, rnd, 0, 0.16, { fc: (u) => 1500 + 1500 * u, amp: (u) => hump(u, 0.4, 1) * 0.3, q: 0.8, pink: true });
  thump(out, rate, rnd, 0.12, { freq: 200, amp: 0.2, t60: 0.03, lp: 900 });
  return out;
}

const base = { bus: 'sfx' as const, kind: 'oneshot' as const, group: 'Foley', spatial: { ref: 1.5, max: 30, rolloff: 1.2 }, reverb: 0.2 };

export const foleySounds: SoundDef[] = [
  { ...base, id: 'cloth.rustle', label: 'cloth rustle', variants: 5, gainDb: -16, maxVoices: 4, priority: 0.2, randomRate: 0.08, expect: { dur: [0.15, 0.45], centroid: [1200, 6000] }, bake: bakeCloth },
  { ...base, id: 'armor.jingle', label: 'armour jingle', variants: 5, gainDb: -13, maxVoices: 4, priority: 0.25, randomRate: 0.05, expect: { dur: [0.1, 0.6], centroid: [1500, 8000] }, bake: bakeArmor },
  { ...base, id: 'coin.clink', label: 'coins (purse)', variants: 4, gainDb: -10, maxVoices: 3, priority: 0.6, expect: { dur: [0.1, 0.85], centroid: [1800, 8000] }, bake: bakeCoins },
  { ...base, id: 'door.open', label: 'door open', variants: 3, gainDb: -6, maxVoices: 3, priority: 0.7, reverb: 0.3, expect: { dur: [0.6, 1.35] }, bake: (c) => bakeDoor(c, true) },
  { ...base, id: 'door.close', label: 'door close', variants: 3, gainDb: -5, maxVoices: 3, priority: 0.7, reverb: 0.3, expect: { dur: [0.4, 0.85] }, bake: (c) => bakeDoor(c, false) },
  { ...base, id: 'chest.open', label: 'chest open', variants: 3, gainDb: -7, maxVoices: 2, priority: 0.7, expect: { dur: [0.3, 0.85] }, bake: (c) => bakeChest(c, true) },
  { ...base, id: 'chest.close', label: 'chest close', variants: 3, gainDb: -6, maxVoices: 2, priority: 0.7, expect: { dur: [0.1, 0.5] }, bake: (c) => bakeChest(c, false) },
  { ...base, id: 'lock.click', label: 'lockpick click', variants: 6, gainDb: -9, maxVoices: 4, priority: 0.8, spatial: undefined, expect: { dur: [0.005, 0.15], centroid: [2500, 9000] }, bake: (c) => bakeLock('click', c) },
  { ...base, id: 'lock.turn', label: 'lockpick turn', variants: 3, gainDb: -12, maxVoices: 2, priority: 0.8, spatial: undefined, expect: { dur: [0.1, 0.45] }, bake: (c) => bakeLock('turn', c) },
  { ...base, id: 'lock.break', label: 'lockpick break', variants: 3, gainDb: -10, maxVoices: 2, priority: 0.8, spatial: undefined, expect: { dur: [0.1, 0.6] }, bake: (c) => bakeLock('break', c) },
  { ...base, id: 'lock.open', label: 'lock opens', variants: 2, gainDb: -8, maxVoices: 2, priority: 0.8, spatial: undefined, expect: { dur: [0.05, 0.3] }, bake: (c) => bakeLock('open', c) },
  { ...base, id: 'item.pickup', label: 'pick up item', variants: 3, gainDb: -12, maxVoices: 3, priority: 0.5, spatial: undefined, expect: { dur: [0.08, 0.25] }, bake: bakePickup },
];
