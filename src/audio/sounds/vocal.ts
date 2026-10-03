/**
 * Vocalizations: attack grunts, pain, effort and (subtle) death cries for men and women, plus the
 * speech-like babble used by crowds, vendors' calls and dog barks. All from the formant synth.
 *
 * Kept short, breathy and low in the mix: they should read as a body making effort, not as a
 * robot talking.
 */
import { Rand, curve, alloc, mixInto } from '../dsp/core';
import { synthVoice, vowelPath, VOWELS, mixFormants, type Formants, type Sex, type Vowel } from '../dsp/voice';
import type { BakeContext, SoundDef } from './types';

const F0 = { m: 112, f: 215 } as const;

type Kind = 'grunt' | 'pain' | 'effort' | 'death';

function bakeVocal(kind: Kind, sex: Sex, c: BakeContext): Float32Array {
  const { rate, rnd } = c;
  const base = F0[sex] * rnd.vary(0.1);
  const shift = rnd.vary(0.05) * (sex === 'f' ? 1 : rnd.range(0.95, 1.02));
  const k = rnd.vary(0.15);
  switch (kind) {
    case 'grunt': {
      // "hh-UH!" — a pressed, short effort on a neutral vowel.
      const dur = 0.24 * k;
      return synthVoice(
        {
          dur,
          f0: curve([[0, base * 0.9], [0.04, base * 1.08], [dur, base * 0.86]]),
          amp: curve([[0, 0], [0.025, 0.9], [dur * 0.55, 1], [dur * 0.85, 0.3], [dur, 0]]),
          asp: curve([[0, 0.5], [0.03, 0.12], [dur * 0.7, 0.18], [dur, 0.5]]),
          creak: curve([[0, 0.5], [0.04, 0]]),
          formants: vowelPath(sex, [[0, rnd.pick(['uh', 'schwa'] as const)], [dur, 'schwa']], shift),
          openQuotient: 0.45,
          jitter: 0.02,
          shimmer: 0.12,
          tilt: 3000,
          lowpass: 4800,
        },
        rate,
        rnd,
      );
    }
    case 'pain': {
      // "AH-gh" with a quick upward break, then falling and roughening.
      const dur = 0.42 * k;
      const peak = base * rnd.range(1.35, 1.6);
      return synthVoice(
        {
          dur,
          f0: curve([[0, base * 1.1], [0.07, peak], [dur * 0.55, base * 1.15], [dur, base * 0.85]]),
          amp: curve([[0, 0], [0.02, 1], [dur * 0.5, 0.75], [dur * 0.85, 0.25], [dur, 0]]),
          asp: curve([[0, 0.35], [0.05, 0.18], [dur * 0.6, 0.3], [dur, 0.6]]),
          creak: curve([[0, 0], [dur * 0.6, 0], [dur, 0.45]]),
          formants: vowelPath(sex, [[0, rnd.pick(['a', 'ae'] as const)], [dur * 0.6, 'uh'], [dur, 'schwa']], shift),
          openQuotient: 0.5,
          jitter: 0.03,
          shimmer: 0.2,
          tilt: 2600,
          lowpass: 4500,
        },
        rate,
        rnd,
      );
    }
    case 'effort': {
      // "hn-HUP": nasal onset, a short push, breath release (jumps, power attacks).
      const dur = 0.3 * k;
      return synthVoice(
        {
          dur,
          f0: curve([[0, base * 0.95], [0.06, base], [0.1, base * 1.15], [dur, base * 0.9]]),
          amp: curve([[0, 0], [0.02, 0.35], [0.07, 0.4], [0.1, 1], [dur * 0.75, 0.6], [dur, 0]]),
          asp: curve([[0, 0.05], [0.08, 0.1], [0.1, 0.25], [dur * 0.7, 0.2], [dur, 0.55]]),
          formants: vowelPath(sex, [[0, 'm'], [0.075, 'm'], [0.11, 'uh'], [dur, 'schwa']], shift),
          openQuotient: 0.5,
          jitter: 0.015,
          shimmer: 0.1,
          tilt: 2600,
          lowpass: 4500,
        },
        rate,
        rnd,
      );
    }
    case 'death': {
      // A falling, failing exhale. Subtle: no wail, mostly breath by the end.
      const dur = rnd.range(0.75, 1.05);
      const voiced = dur * 0.7;
      return synthVoice(
        {
          dur,
          f0: curve([[0, base * 1.2], [0.08, base * 1.3], [voiced, base * 0.7], [dur, base * 0.6]]),
          amp: curve([[0, 0], [0.03, 0.85], [0.2, 0.7], [voiced, 0.15], [dur, 0]]),
          asp: curve([[0, 0.3], [0.1, 0.2], [voiced, 0.45], [dur * 0.9, 0.35], [dur, 0]]),
          creak: curve([[0, 0], [voiced * 0.5, 0.1], [voiced, 0.6]]),
          formants: vowelPath(sex, [[0, 'a'], [voiced * 0.5, 'uh'], [voiced, 'o'], [dur, 'u']], shift),
          bwScale: 1.3,
          openQuotient: 0.65,
          jitter: 0.03,
          shimmer: 0.2,
          tilt: 1900,
          lowpass: 3800,
        },
        rate,
        rnd,
      );
    }
  }
}

const KINDS: Kind[] = ['grunt', 'pain', 'effort', 'death'];
const DUR: Record<Kind, [number, number]> = { grunt: [0.12, 0.35], pain: [0.25, 0.6], effort: [0.15, 0.4], death: [0.5, 1.1] };

export const vocalSounds: SoundDef[] = KINDS.flatMap((kind) =>
  (['m', 'f'] as const).map(
    (sex): SoundDef => ({
      id: `vox.${kind}.${sex}`,
      label: `${kind} (${sex === 'm' ? 'male' : 'female'})`,
      group: 'Voice',
      bus: 'voice',
      kind: 'oneshot',
      variants: 5,
      gainDb: kind === 'death' ? -12 : kind === 'grunt' ? -11 : -10,
      maxVoices: 3,
      priority: kind === 'death' ? 0.9 : 0.6,
      spatial: { ref: 2, max: 40, rolloff: 1 },
      reverb: 0.25,
      randomRate: 0.03,
      expect: { dur: DUR[kind], centroid: [200, 3000] },
      bake: (c) => bakeVocal(kind, sex, c),
    }),
  ),
);

// ---------------------------------------------------------------- speech-like babble

const SPEECH_VOWELS: Vowel[] = ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'uh', 'schwa'];

export interface UtteranceOpts {
  sex: Sex;
  dur: number;
  /** Mean pitch (Hz). */
  f0?: number;
  /** Syllables per second. */
  syllableRate?: number;
  /** Pitch movement (fraction) for intonation. */
  liveliness?: number;
  /** Distance-ish dulling: wider bandwidths, lower low-pass. */
  dull?: number;
}

/**
 * Gibberish speech with plausible prosody: syllables (consonant onset + vowel) at ~5/s, phrase
 * declination, stressed syllables raised in pitch and level. Reads as people talking when
 * distant or layered — which is exactly what crowd beds need.
 */
export function utterance(o: UtteranceOpts, rate: number, rnd: Rand): Float32Array {
  const sex = o.sex;
  const table = VOWELS[sex];
  const f0m = o.f0 ?? F0[sex] * rnd.vary(0.12);
  const sylRate = o.syllableRate ?? rnd.range(4.2, 5.8);
  const live = o.liveliness ?? 0.18;
  // Build a timeline of syllables.
  type Syl = { t0: number; t1: number; v: Formants; stress: number; fric: number; fricF: number; plosive: boolean };
  const syl: Syl[] = [];
  let t = 0.02;
  while (t < o.dur - 0.12) {
    const len = (1 / sylRate) * rnd.range(0.7, 1.35);
    const v = mixFormants(table[rnd.pick(SPEECH_VOWELS)], table[rnd.pick(SPEECH_VOWELS)], rnd.next() * 0.3);
    const onset = rnd.next();
    syl.push({
      t0: t,
      t1: Math.min(o.dur - 0.05, t + len),
      v,
      stress: rnd.chance(0.3) ? 1 : 0,
      fric: onset < 0.25 ? rnd.range(0.4, 0.8) : 0,
      fricF: rnd.pick([6000, 4200, 2800, 1800]),
      plosive: onset >= 0.25 && onset < 0.6,
    });
    t += len;
    // Occasional short pause between words.
    if (rnd.chance(0.15)) t += rnd.range(0.08, 0.2);
  }
  const find = (tt: number) => {
    for (const s of syl) if (tt < s.t1) return tt >= s.t0 ? s : null;
    return null;
  };
  const neutral = table.schwa;
  return synthVoice(
    {
      dur: o.dur,
      f0: (tt) => {
        const decl = 1 + live * 0.6 - (live * 1.2 * tt) / o.dur;
        const s = find(tt);
        const bump = s && s.stress ? live * Math.sin((Math.PI * (tt - s.t0)) / (s.t1 - s.t0)) : 0;
        return f0m * (decl + bump);
      },
      amp: (tt) => {
        const s = find(tt);
        if (!s) return 0;
        const u = (tt - s.t0) / (s.t1 - s.t0);
        const cons = s.fric ? 0.3 : s.plosive ? 0.12 : 0.05;
        if (u < cons) return 0;
        const v = (u - cons) / (1 - cons);
        return Math.sin(Math.PI * Math.min(1, v * 1.1)) * (0.65 + 0.35 * s.stress);
      },
      asp: (tt) => {
        const s = find(tt);
        if (!s) return 0.02;
        const u = (tt - s.t0) / (s.t1 - s.t0);
        return s.plosive && u < 0.12 ? 0.5 : 0.08;
      },
      fric: (tt) => {
        const s = find(tt);
        if (!s || !s.fric) return 0;
        const u = (tt - s.t0) / (s.t1 - s.t0);
        return u < 0.3 ? s.fric * Math.sin((Math.PI * u) / 0.3) : 0;
      },
      fricFreq: (tt) => find(tt)?.fricF ?? 5000,
      formants: (tt) => {
        const s = find(tt);
        if (!s) return neutral;
        const u = (tt - s.t0) / (s.t1 - s.t0);
        // Glide from a neutral-ish consonant locus into the vowel.
        return mixFormants(neutral, s.v, Math.min(1, u * 3));
      },
      bwScale: 1 + (o.dull ?? 0) * 1.2,
      jitter: 0.012,
      shimmer: 0.08,
      openQuotient: 0.6,
      tilt: 2600 - (o.dull ?? 0) * 1200,
      lowpass: 5000 - (o.dull ?? 0) * 3000,
    },
    rate,
    rnd,
  );
}

/** A vendor's shout: two or three long, sung-out syllables ("Ca-li-DAA!"). */
export function vendorCall(sex: Sex, rate: number, rnd: Rand): Float32Array {
  const base = (sex === 'm' ? 190 : 300) * rnd.vary(0.1);
  const n = rnd.int(2, 3);
  const segs: { t0: number; t1: number; v: Vowel; f: number }[] = [];
  let t = 0.03;
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const len = last ? rnd.range(0.45, 0.75) : rnd.range(0.14, 0.24);
    segs.push({ t0: t, t1: t + len, v: rnd.pick(['a', 'e', 'o', 'i', 'a'] as const), f: base * (last ? rnd.range(1.05, 1.2) : rnd.range(0.92, 1.12)) });
    t += len + rnd.range(0.02, 0.05);
  }
  const dur = t + 0.12;
  const at = (tt: number) => segs.find((s) => tt >= s.t0 - 0.03 && tt < s.t1 + 0.03) ?? null;
  const out = synthVoice(
    {
      dur,
      f0: (tt) => {
        const s = at(tt) ?? segs[segs.length - 1];
        const last = s === segs[segs.length - 1];
        const u = Math.max(0, Math.min(1, (tt - s.t0) / (s.t1 - s.t0)));
        return s.f * (last ? 1 - 0.18 * u * u : 1);
      },
      amp: (tt) => {
        const s = at(tt);
        if (!s) return 0;
        const u = (tt - s.t0) / (s.t1 - s.t0);
        if (u < 0) return Math.max(0, 1 + u * 8);
        if (u > 1) return Math.max(0, 1 - (u - 1) * 8);
        return s === segs[segs.length - 1] ? Math.min(1, u * 8) * (1 - 0.6 * u * u) : Math.min(1, u * 10);
      },
      asp: () => 0.1,
      fric: (tt) => {
        const s = at(tt);
        return s && tt < s.t0 && s !== segs[0] ? 0.4 : 0;
      },
      fricFreq: () => 4500,
      formants: (tt) => VOWELS[sex][(at(tt) ?? segs[segs.length - 1]).v],
      openQuotient: 0.42,
      jitter: 0.012,
      shimmer: 0.06,
      tilt: 3600,
      lowpass: 5200,
    },
    rate,
    rnd,
  );
  return out;
}

/** Dog bark sequence: 2–4 rough, falling barks. */
export function dogBarks(rate: number, rnd: Rand): Float32Array {
  const count = rnd.int(2, 4);
  const big = rnd.next();
  const f0 = 260 + big * 260;
  const shift = 1.25 - big * 0.4;
  const out = alloc(count * 0.42 + 0.3, rate);
  let t = 0.01;
  for (let i = 0; i < count; i++) {
    const dur = rnd.range(0.12, 0.2);
    const b = synthVoice(
      {
        dur,
        f0: curve([[0, f0 * 1.15], [0.03, f0 * 1.25], [dur, f0 * 0.7]]),
        amp: curve([[0, 0], [0.012, 1], [dur * 0.5, 0.6], [dur, 0]]),
        asp: () => 0.55,
        formants: () => [700 * shift, 1350 * shift, 2500 * shift, 3600],
        bwScale: 1.4,
        openQuotient: 0.4,
        jitter: 0.06,
        shimmer: 0.3,
        tilt: 3200,
        lowpass: 4500,
      },
      rate,
      rnd,
    );
    mixInto(out, b, t * rate, rnd.range(0.7, 1));
    t += dur + rnd.range(0.18, 0.32);
  }
  return out;
}
