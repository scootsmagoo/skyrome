import { describe, expect, it } from 'vitest';
import { compose, type TimedEvent } from '../src/audio/music/composer';
import { MUSIC_STATES, STYLES, type MusicState } from '../src/audio/music/styles';
import { MODES, PYTHAGOREAN, degreeToFreq, degreeToSemitone, hzToMidi, inMode } from '../src/audio/music/theory';

type Playable = Exclude<MusicState, 'silence'>;
const PLAYABLE = MUSIC_STATES.filter((s) => s !== 'silence') as Playable[];

describe('theory', () => {
  it('builds modes and Pythagorean tuning', () => {
    expect(degreeToSemitone(MODES.dorian, 0)).toBe(0);
    expect(degreeToSemitone(MODES.dorian, 2)).toBe(3);
    expect(degreeToSemitone(MODES.dorian, 7)).toBe(12);
    expect(degreeToSemitone(MODES.dorian, -1)).toBe(-2);
    expect(degreeToSemitone(MODES.phrygian, 1)).toBe(1);
    expect(degreeToSemitone(MODES.hypolydian, 3)).toBe(6);
    // Pure fifth and fourth.
    expect(degreeToFreq(MODES.dorian, 4, 200) / 200).toBeCloseTo(1.5, 10);
    expect(degreeToFreq(MODES.dorian, 3, 200) / 200).toBeCloseTo(4 / 3, 10);
    expect(degreeToFreq(MODES.dorian, -3, 200)).toBeCloseTo((200 * 1.5) / 2, 8); // a fourth below the final = the fifth, an octave down
    expect(PYTHAGOREAN[7]).toBe(1.5);
    expect(inMode(MODES.mixolydian, 10)).toBe(true);
    expect(inMode(MODES.mixolydian, 11)).toBe(false);
  });
});

function noteStats(events: TimedEvent[], seconds: number) {
  const mel = events.filter((e) => (e.part === 'melody' || e.part === 'answer') && !e.orn);
  const all = events.filter((e) => e.part !== 'drone');
  return { mel, perSec: all.length / seconds, melPerSec: mel.length / seconds };
}

describe('composer', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = compose('explore-day', 60, 5).events.map((e) => `${e.part}${e.time.toFixed(3)}${e.freq?.toFixed(1)}`);
    const b = compose('explore-day', 60, 5).events.map((e) => `${e.part}${e.time.toFixed(3)}${e.freq?.toFixed(1)}`);
    const c = compose('explore-day', 60, 6).events.map((e) => `${e.part}${e.time.toFixed(3)}${e.freq?.toFixed(1)}`);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  for (const state of PLAYABLE) {
    it(`${state}: valid, in-mode, well-formed for 5 minutes`, () => {
      const { events, blocks } = compose(state, 300, 11);
      expect(events.length).toBeGreaterThan(20);
      let last = -1;
      for (const e of events) {
        expect(Number.isFinite(e.time)).toBe(true);
        expect(e.time).toBeGreaterThanOrEqual(last - 1e-9);
        last = e.time;
        expect(e.vel).toBeGreaterThanOrEqual(0);
        expect(e.vel).toBeLessThanOrEqual(1);
        if (e.freq !== undefined) {
          expect(e.freq).toBeGreaterThan(55);
          expect(e.freq).toBeLessThan(2200);
        }
      }
      // Every structural melody note belongs to its block's mode.
      for (const b of blocks)
        for (const e of b.events)
          if ((e.part === 'melody' || e.part === 'answer' || e.part === 'lyre') && e.deg !== undefined)
            expect(inMode(MODES[b.info.mode], degreeToSemitone(MODES[b.info.mode], e.deg))).toBe(true);
      // Full cadences land on the final.
      for (const b of blocks) {
        if (b.kind !== 'phrase' || b.cadence !== 'full') continue;
        const mel = b.events.filter((e) => e.part === 'melody' || e.part === 'answer');
        if (!mel.length) continue;
        expect(((mel[mel.length - 1].deg! % 7) + 7) % 7).toBe(0);
      }
    });
  }

  it('has the right energy per state', () => {
    const rate = (s: Playable) => noteStats(compose(s, 240, 3).events, 240).perSec;
    const combat = rate('combat');
    const day = rate('explore-day');
    const night = rate('explore-night');
    const temple = rate('temple');
    expect(combat).toBeGreaterThan(day * 1.8);
    expect(day).toBeGreaterThan(night);
    expect(night).toBeLessThan(2.5);
    expect(temple).toBeLessThan(day);
  });

  it('explore music comes and goes; combat and tension never stop', () => {
    for (const s of ['explore-day', 'explore-night'] as const) {
      const { blocks } = compose(s, 600, 2);
      const silences = blocks.filter((b) => b.kind === 'silence');
      expect(silences.length).toBeGreaterThanOrEqual(2);
      const pieces = new Set(blocks.map((b) => `${b.info.piece}`));
      expect(pieces.size).toBeGreaterThanOrEqual(3);
    }
    for (const s of ['combat', 'tension', 'temple'] as const) {
      const { blocks } = compose(s, 300, 2);
      expect(blocks.some((b) => b.kind === 'silence')).toBe(false);
    }
  });

  it('is not repetitive: varied pieces and melodic material', () => {
    const { blocks, events } = compose('explore-day', 900, 9);
    const sigs = new Set(blocks.filter((b) => b.kind === 'phrase').map((b) => `${b.info.mode}/${b.info.final.toFixed(0)}/${b.info.tempo}`));
    expect(sigs.size).toBeGreaterThanOrEqual(3);
    // Distinct 4-note melodic shapes (intervals + rhythm) over 15 minutes.
    const mel = events.filter((e) => e.part === 'melody' && !e.orn);
    const grams = new Set<string>();
    let total = 0;
    for (let i = 3; i < mel.length; i++) {
      const g = [mel[i - 3], mel[i - 2], mel[i - 1], mel[i]];
      grams.add(g.map((e, k) => (k ? `${e.deg! - g[k - 1].deg!}:${(e.time - g[k - 1].time).toFixed(2)}` : '')).join('|'));
      total++;
    }
    expect(grams.size / total).toBeGreaterThan(0.35);
    // Melodies move mostly by step.
    let steps = 0;
    let moves = 0;
    for (let i = 1; i < mel.length; i++) {
      if (mel[i].block !== mel[i - 1].block) continue;
      const d = Math.abs(mel[i].deg! - mel[i - 1].deg!);
      moves++;
      if (d <= 1) steps++;
    }
    expect(steps / moves).toBeGreaterThan(0.55);
  });

  it('prints a summary', () => {
    if (!process.env.AUDIO_TABLE) return;
    for (const s of PLAYABLE) {
      const { events, blocks } = compose(s, 120, 4);
      const st = noteStats(events, 120);
      const kinds = blocks.map((b) => b.kind[0]).join('');
      const m = st.mel.slice(0, 16).map((e) => Math.round(hzToMidi(e.freq!))).join(' ');
      console.log(`${s.padEnd(14)} ${st.perSec.toFixed(2)} ev/s, melody ${st.melPerSec.toFixed(2)}/s, blocks ${kinds}, first notes ${m}, style tempo ${STYLES[s].tempo}`);
    }
  });
});
