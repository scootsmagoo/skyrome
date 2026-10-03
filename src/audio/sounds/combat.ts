/** Weapons and bodies: swings, clashes, blocks, hits, bows, slings, falls, draw/sheathe. */
import { Biquad, TWO_PI, adEnv, addMode, addNoiseBurst, alloc } from '../dsp/core';
import { pluck } from '../dsp/pluck';
import type { BakeContext, SoundDef } from './types';
import { BAR_RATIOS, click, grains, hump, strike, thump, whoosh } from './util';

// ---------------------------------------------------------------- swings

const SWING = {
  slow: { dur: 0.46, f0: 260, fp: 700, f1: 300, q: 1.1, whistle: 0 },
  medium: { dur: 0.34, f0: 380, fp: 1150, f1: 420, q: 1.5, whistle: 0.25 },
  fast: { dur: 0.26, f0: 520, fp: 1700, f1: 600, q: 2.2, whistle: 0.45 },
} as const;
export type SwingSpeed = keyof typeof SWING;

function bakeSwing(speed: SwingSpeed, c: BakeContext) {
  const s = SWING[speed];
  const { rate, rnd } = c;
  const dur = s.dur * rnd.vary(0.12);
  const out = alloc(dur + 0.05, rate);
  const peak = rnd.range(0.38, 0.55);
  const fp = s.fp * rnd.vary(0.15);
  const fc = (u: number) => (u < peak ? s.f0 + (fp - s.f0) * Math.pow(u / peak, 1.4) : fp + (s.f1 - fp) * Math.pow((u - peak) / (1 - peak), 0.8));
  whoosh(out, rate, rnd, 0, dur, { fc, amp: (u) => hump(u, peak, 1.8), q: s.q, pink: true });
  // Blade edge whistle: a narrow band an octave-ish up.
  if (s.whistle) whoosh(out, rate, rnd, 0, dur, { fc: (u) => fc(u) * 2.3, amp: (u) => hump(u, peak, 3) * s.whistle, q: 7 });
  return out;
}

// ---------------------------------------------------------------- metal

function bakeClash(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(1.6, rate);
  const f = rnd.range(620, 980);
  // Blade on blade: bar modes with beating pairs, a hard transient and a scrape.
  strike(out, rate, rnd, 0.002, f, [
    [BAR_RATIOS[0], 0.6, 1.2],
    [BAR_RATIOS[1], 0.55, 0.9],
    [BAR_RATIOS[2], 0.4, 0.55],
    [BAR_RATIOS[3], 0.22, 0.35],
  ]);
  strike(out, rate, rnd, 0.002, f * 1.004, [
    [BAR_RATIOS[0], 0.35, 1.1],
    [BAR_RATIOS[1], 0.3, 0.8],
  ]);
  // Second blade, slightly different.
  const f2 = f * rnd.range(1.12, 1.35);
  strike(out, rate, rnd, 0.003, f2, [
    [BAR_RATIOS[0], 0.4, 0.9],
    [BAR_RATIOS[1], 0.35, 0.6],
    [BAR_RATIOS[2], 0.2, 0.4],
  ]);
  for (let i = 0; i < 4; i++) addMode(out, rate, 0.002, rnd.range(3000, 7500), rnd.range(0.05, 0.14), rnd.range(0.15, 0.4));
  addNoiseBurst(out, rate, rnd, 0, { dur: 0.03, amp: 1.2, attack: 0.0002, t60: 0.012, hp: 1800 });
  if (rnd.chance(0.6)) {
    const len = rnd.range(0.06, 0.14);
    addNoiseBurst(out, rate, rnd, 0.01, { dur: len, amp: 0.25, attack: 0.004, t60: len, bp: rnd.range(3500, 5500), q: 5 });
  }
  return out;
}

function bakeBlockShield(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(0.6, rate);
  // Gladius on a scutum: laminated wood with leather facing and a bronze rim.
  thump(out, rate, rnd, 0.002, { freq: rnd.range(110, 150), amp: 1, t60: 0.08, lp: 520, modeAmp: 0.4 });
  strike(out, rate, rnd, 0.002, rnd.range(140, 190), [
    [1, 0.45, 0.12],
    [2.2, 0.3, 0.09],
    [3.6, 0.18, 0.06],
  ]);
  addNoiseBurst(out, rate, rnd, 0.001, { dur: 0.04, amp: 0.5, attack: 0.0003, t60: 0.02, bp: 1300, q: 0.9 });
  // The blade itself rings briefly.
  const f = rnd.range(1500, 2300);
  strike(out, rate, rnd, 0.003, f, [
    [1, 0.12, 0.2],
    [BAR_RATIOS[1], 0.08, 0.12],
  ]);
  if (rnd.chance(0.5)) strike(out, rate, rnd, 0.004, rnd.range(700, 950), [[1, 0.12, 0.18], [2.4, 0.08, 0.1]]); // rim
  return out;
}

function bakeBlockMetal(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(0.9, rate);
  // Sword on the shield boss / armour: a duller, heavier clank than blade-on-blade.
  const f = rnd.range(380, 560);
  strike(out, rate, rnd, 0.002, f, [
    [1, 0.6, 0.45],
    [1.59, 0.45, 0.35],
    [2.14, 0.35, 0.28],
    [2.65, 0.25, 0.2],
    [3.9, 0.12, 0.15],
  ]);
  thump(out, rate, rnd, 0.002, { freq: 120, amp: 0.6, t60: 0.06, lp: 500 });
  addNoiseBurst(out, rate, rnd, 0, { dur: 0.02, amp: 0.8, attack: 0.0002, t60: 0.008, hp: 2000 });
  return out;
}

// ---------------------------------------------------------------- bodies

function bakeFlesh(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(0.32, rate);
  thump(out, rate, rnd, 0.002, { freq: rnd.range(75, 100), amp: 0.8, t60: 0.07, lp: 350, modeAmp: 0.45 });
  // Muffled wet slap (kept short and low so it reads as impact, not gore).
  addNoiseBurst(out, rate, rnd, 0.003, { dur: 0.06, amp: 0.8, attack: 0.002, t60: 0.035, bp: rnd.range(550, 900), q: 1.1 });
  addNoiseBurst(out, rate, rnd, 0.002, { dur: 0.02, amp: 0.35, attack: 0.0005, t60: 0.01, bp: rnd.range(1800, 2600), q: 1 });
  grains(out, rate, rnd, 0.004, 0.05, { density: 250, fLo: 1500, fHi: 4000, amp: 0.12, grain: [0.002, 0.005] }); // cloth
  return out;
}

function bakePunch(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(0.25, rate);
  addNoiseBurst(out, rate, rnd, 0.001, { dur: 0.02, amp: 1.4, attack: 0.0002, t60: 0.009, hp: 1200 });
  thump(out, rate, rnd, 0.002, { freq: rnd.range(85, 110), amp: 0.7, t60: 0.05, lp: 320, modeAmp: 0.4 });
  addNoiseBurst(out, rate, rnd, 0.002, { dur: 0.04, amp: 0.6, attack: 0.001, t60: 0.025, bp: rnd.range(600, 900), q: 1 });
  return out;
}

function bakeBodyFall(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(0.95, rate);
  // Knees/hip, then torso and shoulders, then gear settling.
  thump(out, rate, rnd, 0.004, { freq: rnd.range(55, 70), amp: 0.7, t60: 0.12, lp: 200, modeAmp: 0.6 });
  const t2 = rnd.range(0.13, 0.22);
  thump(out, rate, rnd, t2, { freq: rnd.range(50, 65), amp: 0.9, t60: 0.16, lp: 200, modeAmp: 0.6 });
  addNoiseBurst(out, rate, rnd, t2, { dur: 0.12, amp: 0.7, attack: 0.003, t60: 0.08, bp: rnd.range(380, 520), q: 0.8 }); // the body's mid 'thud'
  addNoiseBurst(out, rate, rnd, 0.004, { dur: 0.06, amp: 0.4, attack: 0.002, t60: 0.04, bp: 600, q: 0.8 });
  grains(out, rate, rnd, t2, 0.22, { density: 160, fLo: 2500, fHi: 7000, amp: 0.15, grain: [0.003, 0.012], env: (u) => 1 - u }); // gear rattle
  addNoiseBurst(out, rate, rnd, t2 + 0.08, { dur: 0.25, amp: 0.06, attack: 0.05, t60: 0.2, lp: 1200 }); // settle scrape
  return out;
}

// ---------------------------------------------------------------- missiles

function bakeBowTwang(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(0.6, rate);
  const s = pluck(rnd.range(95, 140), rate, rnd, { seconds: 0.55, t60: 0.28, brightness: 0.55, pluckPos: 0.5, damping: 0.8, body: 'bow' });
  for (let i = 0; i < s.length; i++) out[i] += s[i] * 0.9;
  addNoiseBurst(out, rate, rnd, 0, { dur: 0.02, amp: 0.4, attack: 0.0003, t60: 0.008, bp: 2200, q: 1 }); // string slap on the bracer
  addMode(out, rate, 0, rnd.range(260, 340), 0.25, 0.05); // limb knock
  return out;
}

function bakeArrowWhoosh(c: BakeContext) {
  const { rate, rnd } = c;
  const dur = rnd.range(0.2, 0.3);
  const out = alloc(dur + 0.02, rate);
  const peak = rnd.range(0.4, 0.55);
  // Doppler pass: rising then dropping, plus fletching flutter.
  whoosh(out, rate, rnd, 0, dur, {
    fc: (u) => (u < peak ? 2200 + 2600 * (u / peak) : 4800 - 3200 * ((u - peak) / (1 - peak))),
    amp: (u) => hump(u, peak, 2) * (0.75 + 0.25 * Math.sin(TWO_PI * 70 * u * dur)),
    q: 2.5,
  });
  return out;
}

function bakeArrowImpact(kind: 'wood' | 'flesh' | 'stone', c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(kind === 'wood' ? 0.55 : 0.4, rate);
  if (kind === 'wood') {
    addMode(out, rate, 0.001, rnd.range(180, 250), 0.6, 0.12);
    thump(out, rate, rnd, 0.001, { freq: 110, amp: 0.5, t60: 0.05, lp: 600 });
    click(out, rate, rnd, 0, { bp: 2500, amp: 0.6, t60: 0.004 });
    // Shaft quiver: a band of noise amplitude-modulated by the shaft's vibration.
    const fq = rnd.range(38, 55);
    const s0 = Math.round(0.01 * rate);
    const bp = new Biquad().bandpass(rnd.range(800, 1100), 4, rate);
    for (let i = 0; i < out.length - s0; i++) {
      const t = i / rate;
      out[s0 + i] += bp.process(rnd.bi()) * Math.abs(Math.sin(TWO_PI * fq * t)) * adEnv(t, 0.002, 0.35) * 0.35;
    }
  } else if (kind === 'flesh') {
    thump(out, rate, rnd, 0.001, { freq: 80, amp: 1, t60: 0.05, lp: 350 });
    addNoiseBurst(out, rate, rnd, 0.001, { dur: 0.03, amp: 0.35, attack: 0.001, t60: 0.015, bp: 900, q: 1.2 });
  } else {
    click(out, rate, rnd, 0, { bp: 3200, amp: 0.9, t60: 0.008 });
    strike(out, rate, rnd, 0, rnd.range(1600, 2200), [[1, 0.25, 0.05], [1.7, 0.18, 0.04], [2.9, 0.1, 0.03]]);
    let t = rnd.range(0.05, 0.09);
    for (let i = 0; i < 3; i++) {
      click(out, rate, rnd, t, { bp: rnd.range(2000, 4000), amp: 0.3 / (i + 1), t60: 0.005 }); // skitter
      t += rnd.range(0.04, 0.09);
    }
  }
  return out;
}

function bakeSlingWhirl(c: BakeContext) {
  const { rate, rnd } = c;
  const dur = rnd.range(1.1, 1.4);
  const out = alloc(dur + 0.05, rate);
  // Rotations accelerate from ~2.5 to ~5 per second; each pass is a whoosh peak.
  const n = Math.round(dur * rate);
  const bp = new Biquad();
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const rot = 2.5 + 2.6 * u;
    phase += rot / rate;
    // Each pass of the sling is a swell; a little air keeps moving in between.
    const w = 0.12 + 0.88 * Math.pow(Math.max(0, Math.sin(TWO_PI * phase)), 3);
    if ((i & 15) === 0) bp.bandpass(450 + 700 * w + 300 * u, 1.6, rate);
    const env = Math.min(1, u * 4) * (0.5 + 0.5 * u) * (u > 0.94 ? (1 - u) / 0.06 : 1);
    out[i] += bp.process(rnd.bi()) * w * env * 2.2;
  }
  return out;
}

function bakeSlingRelease(c: BakeContext) {
  const { rate, rnd } = c;
  const out = alloc(0.45, rate);
  addNoiseBurst(out, rate, rnd, 0, { dur: 0.012, amp: 0.7, attack: 0.0002, t60: 0.005, hp: 2000 }); // cord snap
  // A lead glans whizzing away: narrow band with a falling pitch.
  whoosh(out, rate, rnd, 0.005, 0.38, { fc: (u) => 3400 - 1500 * u, amp: (u) => Math.pow(1 - u, 1.6) * Math.min(1, u * 20), q: 7 });
  return out;
}

function bakeDraw(c: BakeContext, sheathe: boolean) {
  const { rate, rnd } = c;
  const dur = sheathe ? rnd.range(0.35, 0.45) : rnd.range(0.4, 0.5);
  const out = alloc(dur + 0.6, rate);
  // Blade sliding against the scabbard throat: a narrow resonant scrape that sweeps.
  whoosh(out, rate, rnd, 0, dur, {
    fc: (u) => (sheathe ? 5200 - 2600 * u : 2400 + 3200 * u),
    amp: (u) => hump(u, sheathe ? 0.3 : 0.6, 1) * 0.6,
    q: 6,
  });
  whoosh(out, rate, rnd, 0, dur, { fc: (u) => (sheathe ? 2600 - 1200 * u : 1200 + 1500 * u), amp: (u) => hump(u, 0.5, 1) * 0.3, q: 3 });
  if (sheathe) {
    thump(out, rate, rnd, dur - 0.01, { freq: 380, amp: 0.4, t60: 0.03, lp: 1200, modeAmp: 0.4 }); // hilt meets the locket
  } else {
    strike(out, rate, rnd, dur - 0.02, rnd.range(1300, 1700), [
      [BAR_RATIOS[0], 0.18, 0.6],
      [BAR_RATIOS[1], 0.12, 0.4],
      [BAR_RATIOS[2], 0.06, 0.25],
    ]); // free blade rings
  }
  return out;
}

// ---------------------------------------------------------------- defs

const base = { bus: 'sfx' as const, kind: 'oneshot' as const, group: 'Combat', spatial: { ref: 2, max: 45, rolloff: 1 }, reverb: 0.25 };

export const combatSounds: SoundDef[] = [
  ...(Object.keys(SWING) as SwingSpeed[]).map(
    (speed): SoundDef => ({
      ...base,
      id: `swing.${speed}`,
      label: `swing ${speed}`,
      variants: 4,
      gainDb: speed === 'slow' ? -7 : speed === 'medium' ? -6 : -6,
      maxVoices: 6,
      priority: 0.6,
      randomRate: 0.06,
      reverb: 0.15,
      expect: { dur: [0.15, 0.55], centroid: [250, 4000] },
      bake: (c) => bakeSwing(speed, c),
    }),
  ),
  { ...base, id: 'clash.metal', label: 'metal clash', variants: 5, gainDb: -6, maxVoices: 4, priority: 0.8, randomRate: 0.04, reverb: 0.35, expect: { dur: [0.4, 1.6], centroid: [900, 7000] }, bake: bakeClash },
  { ...base, id: 'block.shield', label: 'shield block (wood)', variants: 4, gainDb: -4, maxVoices: 4, priority: 0.8, randomRate: 0.05, expect: { dur: [0.08, 0.6] }, bake: bakeBlockShield },
  { ...base, id: 'block.metal', label: 'block (metal boss)', variants: 3, gainDb: -6, maxVoices: 4, priority: 0.8, randomRate: 0.05, reverb: 0.3, expect: { dur: [0.2, 0.9] }, bake: bakeBlockMetal },
  { ...base, id: 'hit.flesh', label: 'flesh hit', variants: 5, gainDb: -4, maxVoices: 4, priority: 0.8, randomRate: 0.07, expect: { dur: [0.05, 0.32], centroid: [60, 1600] }, bake: bakeFlesh },
  { ...base, id: 'hit.punch', label: 'punch', variants: 4, gainDb: -5, maxVoices: 4, priority: 0.7, randomRate: 0.07, expect: { dur: [0.04, 0.25] }, bake: bakePunch },
  { ...base, id: 'body.fall', label: 'body fall', variants: 3, gainDb: -3, maxVoices: 3, priority: 0.7, randomRate: 0.05, expect: { dur: [0.25, 0.95], centroid: [40, 1200] }, bake: bakeBodyFall },
  { ...base, id: 'bow.twang', label: 'bow release', variants: 3, gainDb: -6, maxVoices: 3, priority: 0.7, randomRate: 0.04, expect: { dur: [0.1, 0.6] }, bake: bakeBowTwang },
  { ...base, id: 'arrow.whoosh', label: 'arrow fly-by', variants: 4, gainDb: -8, maxVoices: 4, priority: 0.6, randomRate: 0.05, expect: { dur: [0.12, 0.33], centroid: [1500, 6000] }, bake: bakeArrowWhoosh },
  { ...base, id: 'arrow.impact.wood', label: 'arrow → wood', variants: 3, gainDb: -6, maxVoices: 4, priority: 0.6, expect: { dur: [0.1, 0.55] }, bake: (c) => bakeArrowImpact('wood', c) },
  { ...base, id: 'arrow.impact.flesh', label: 'arrow → flesh', variants: 3, gainDb: -6, maxVoices: 4, priority: 0.7, expect: { dur: [0.03, 0.4] }, bake: (c) => bakeArrowImpact('flesh', c) },
  { ...base, id: 'arrow.impact.stone', label: 'arrow → stone', variants: 3, gainDb: -8, maxVoices: 4, priority: 0.6, expect: { dur: [0.05, 0.4] }, bake: (c) => bakeArrowImpact('stone', c) },
  { ...base, id: 'sling.whirl', label: 'sling whirl', variants: 3, gainDb: -10, maxVoices: 2, priority: 0.6, expect: { dur: [0.9, 1.5], centroid: [250, 2500] }, bake: bakeSlingWhirl },
  { ...base, id: 'sling.release', label: 'sling release', variants: 3, gainDb: -9, maxVoices: 3, priority: 0.6, expect: { dur: [0.1, 0.45] }, bake: bakeSlingRelease },
  { ...base, id: 'weapon.draw', label: 'draw gladius', variants: 3, gainDb: -10, maxVoices: 2, priority: 0.7, randomRate: 0.03, expect: { dur: [0.3, 1.1] }, bake: (c) => bakeDraw(c, false) },
  { ...base, id: 'weapon.sheathe', label: 'sheathe gladius', variants: 3, gainDb: -10, maxVoices: 2, priority: 0.7, randomRate: 0.03, expect: { dur: [0.25, 0.7] }, bake: (c) => bakeDraw(c, true) },
];

/** Pick the swing sound for a weapon speed in m/s at the tip (≈ 8 slow … 25 fast). */
export function swingIdForSpeed(tipSpeed: number): string {
  return tipSpeed < 11 ? 'swing.slow' : tipSpeed < 18 ? 'swing.medium' : 'swing.fast';
}

