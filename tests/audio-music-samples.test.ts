/**
 * The recorded instruments and the gentle voicing: the sample manifest against the files on disk and the
 * memory budget, the bank's pitch lookup, the set pieces, and the velocity caps.
 */
import { existsSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compose } from '../src/audio/music/composer';
import { DELPHIC_NOTES, SEIKILOS_NOTES } from '../src/audio/music/setpieceData';
import { SET_PIECES, pyth, setPieceBlock, setPieceSeconds } from '../src/audio/music/setpieces';
import { MUSIC_STATES, STYLES, type MusicState } from '../src/audio/music/styles';
import { PYTHAGOREAN } from '../src/audio/music/theory';
import { VscoBank, VSCO_RATE, freqToMidi, midiToFreq } from '../src/audio/music/vsco';
import { VSCO } from '../src/audio/music/vscoManifest';

type Playable = Exclude<MusicState, 'silence'>;
const PLAYABLE = MUSIC_STATES.filter((s) => s !== 'silence') as Playable[];

describe('sample manifest', () => {
  it('lists files that exist in both formats, with sane loops', () => {
    for (const [group, rows] of Object.entries(VSCO)) {
      expect(rows.length).toBeGreaterThan(0);
      for (const s of rows) {
        for (const ext of ['m4a', 'mp3']) {
          const f = `public/audio/music/${s.id}.${ext}`;
          expect(existsSync(f), f).toBe(true);
          expect(statSync(f).size, f).toBeGreaterThan(1000);
        }
        if (s.loop) {
          expect(s.loop[0], s.id).toBeGreaterThan(0.3);
          expect(s.loop[1] - s.loop[0], s.id).toBeGreaterThan(1);
          expect(s.loop[1], s.id).toBeLessThanOrEqual(s.dur + 0.01);
        }
        if (['harp', 'oboe', 'flute', 'cello'].includes(group)) expect(s.midi, s.id).toBeDefined();
      }
    }
  });

  it('keeps everything decoded within the 16 MB music budget', () => {
    let bytes = 0;
    for (const rows of Object.values(VSCO)) for (const s of rows) bytes += Math.ceil(s.dur * VSCO_RATE) * 4;
    expect(bytes / 1048576).toBeLessThan(16);
  });

  it('covers the melody and accompaniment ranges within a few semitones of a recording', () => {
    const roots = (g: string) => VSCO[g].map((s) => s.midi!).sort((a, b) => a - b);
    const maxGap = (g: string) => roots(g).reduce((m, r, i, a) => (i ? Math.max(m, r - a[i - 1]) : m), 0);
    expect(maxGap('harp')).toBeLessThanOrEqual(4);
    expect(maxGap('oboe')).toBeLessThanOrEqual(5);
    expect(maxGap('flute')).toBeLessThanOrEqual(5);
    // Harp: the lyre's reach from the lowest heterophony notes to a couple of octaves above the final.
    expect(roots('harp')[0]).toBeLessThanOrEqual(38);
    expect(roots('harp').at(-1)!).toBeGreaterThanOrEqual(78);
    // Oboe: the melody never asks for a note below B-flat 3 (the rack folds those up).
    expect(midiToFreq(roots('oboe')[0])).toBeCloseTo(233, 0);
  });
});

describe('VscoBank', () => {
  const fake = () => ({ length: 1000 }) as unknown as AudioBuffer;
  const bank = new VscoBank();
  for (const rows of Object.values(VSCO)) for (const s of rows) (bank as unknown as { bufs: Map<string, AudioBuffer> }).bufs.set(s.id, fake());

  it('finds the nearest recorded pitch', () => {
    expect(bank.nearest('harp', 47.6)!.sample.midi).toBe(48);
    expect(bank.nearest('harp', 52.9)!.sample.midi).toBe(52);
    expect(bank.nearest('harp', freqToMidi(440))!.sample.midi).toBe(69);
    expect(bank.nearest('oboe', freqToMidi(300))!.sample.midi).toBe(62);
    // Every pitch a Pythagorean-tuned harp can ask for in its range is within 2 semitones of a recording.
    for (let m = 38; m <= 79; m += 0.5) expect(Math.abs(bank.nearest('harp', m)!.sample.midi! - m)).toBeLessThanOrEqual(2);
  });

  it('picks percussion by dynamic layer', () => {
    for (let pick = 0; pick < 1; pick += 0.2) {
      expect(bank.hit('doum', 0, pick)!.sample.layer).toBe(0);
      expect(bank.hit('doum', 1, pick)!.sample.layer).toBe(1);
    }
    expect(bank.hit('ka', 1, 0.5)).not.toBeNull(); // no such layer: any hit of the group
  });

  it('is idle until asked, and a group that cannot load settles as failed (the synthesised fallback)', async () => {
    const b = new VscoBank();
    expect(b.state('harp')).toBe('idle');
    // No fetch / OfflineAudioContext in the test environment: the load fails, and the bank says so.
    expect(b.request('harp')).toBe(false);
    expect(b.state('harp')).toBe('loading');
    await b.load('harp');
    expect(b.state('harp')).toBe('failed');
    expect(b.request('harp')).toBe(true);
    expect(b.failures.length).toBe(1);
  });
});

describe('set pieces', () => {
  it('carry the real tunes', () => {
    expect(SEIKILOS_NOTES.length).toBe(37);
    expect(DELPHIC_NOTES.length).toBe(110);
    // Notes are in order and do not overlap (single voices).
    for (const notes of [SEIKILOS_NOTES, DELPHIC_NOTES])
      for (let i = 1; i < notes.length; i++) expect(notes[i][0]).toBeGreaterThanOrEqual(notes[i - 1][0] + notes[i - 1][1] - 1e-6);
    // The Seikilos tune lies within a tenth, around its tonic; it closes on the fifth below... as transcribed.
    const semis = SEIKILOS_NOTES.map((n) => n[2]);
    expect(Math.min(...semis)).toBe(-5);
    expect(Math.max(...semis)).toBe(7);
    expect(SEIKILOS_NOTES.at(-1)![2]).toBe(-5);
  });

  it('tunes by Pythagorean ratios from the tonic', () => {
    expect(pyth(220, 7) / 220).toBeCloseTo(1.5, 10);
    expect(pyth(220, -5) / 220).toBeCloseTo(PYTHAGOREAN[7] / 2, 10);
    expect(pyth(220, 12) / 220).toBeCloseTo(2, 10);
    expect(pyth(220, -2) / 220).toBeCloseTo(PYTHAGOREAN[10] / 2, 10);
  });

  it('render as blocks the harp can play: in range, harp alone first and a flute added second', () => {
    for (const id of ['seikilos', 'delphic'] as const) {
      const a = setPieceBlock(id, 0, 1);
      const b = setPieceBlock(id, 1, 2);
      expect(a.events.some((e) => e.part === 'melody')).toBe(false);
      expect(b.events.some((e) => e.part === 'melody')).toBe(true);
      for (const e of b.events) {
        expect(e.vel).toBeLessThanOrEqual(0.6);
        if (e.freq !== undefined) {
          expect(e.freq).toBeGreaterThan(95);
          expect(e.freq).toBeLessThan(900);
        }
        expect(e.t).toBeGreaterThanOrEqual(0);
        expect(e.t).toBeLessThan(b.pulses);
      }
      // The pad starts with the piece and lets go before it ends.
      const drones = b.events.filter((e) => e.part === 'drone');
      expect(drones[0].vel).toBeGreaterThan(0);
      expect(drones.at(-1)!.vel).toBe(0);
      expect(setPieceSeconds(id)).toBeCloseTo(b.pulses * b.spp, 6);
      expect(b.info.phrase).toBe(id);
    }
    // Roughly 28 s and 108 s: slow, as sung.
    expect(setPieceSeconds('seikilos')).toBeGreaterThan(25);
    expect(setPieceSeconds('delphic')).toBeGreaterThan(95);
    expect(SET_PIECES.delphic.drumEvery).toBeGreaterThan(0);
  });

  it('are played by the temple and the night, and by their own states in a cycle', () => {
    const phrases = (state: Playable, seed: number, secs: number) => new Set(compose(state, secs, seed).blocks.map((b) => b.info.phrase));
    let temple = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const p = phrases('temple', seed, 900);
      if (p.has('delphic') || p.has('seikilos')) temple++;
    }
    expect(temple).toBeGreaterThanOrEqual(4); // most temple visits include a set piece
    let night = 0;
    for (let seed = 1; seed <= 12; seed++) if (phrases('explore-night', seed, 3600).has('seikilos')) night++;
    expect(night).toBeGreaterThanOrEqual(3);
    expect(night).toBeLessThanOrEqual(12);
    // A set piece in the night is followed by silence, and never by a second set piece straight away.
    const { blocks } = compose('explore-night', 7200, 4);
    blocks.forEach((b, i) => {
      if (b.info.phrase === 'seikilos' && blocks[i + 1]) expect(blocks[i + 1].kind).toBe('silence');
    });
    // The dedicated states: tune, tune with flute, silence.
    for (const id of ['seikilos', 'delphic'] as const) {
      const kinds = compose(id, 900, 1).blocks.map((b) => (b.kind === 'silence' ? 'silence' : b.events.some((e) => e.part === 'melody') ? 'with flute' : 'harp'));
      expect(kinds.slice(0, 6)).toEqual(['harp', 'with flute', 'silence', 'harp', 'with flute', 'silence']);
    }
  });
});

describe('gentle voicing', () => {
  it('no event is louder than the state allows', () => {
    for (const state of PLAYABLE) {
      const cap = STYLES[state].velCap;
      expect(cap).toBeLessThanOrEqual(0.72);
      for (const e of compose(state, 600, 5).events) expect(e.vel, `${state} ${e.part}`).toBeLessThanOrEqual(cap + 1e-9);
    }
  });

  it('keeps the states ordered by loudness cap and the explore states sparse', () => {
    expect(STYLES.combat.velCap).toBeGreaterThan(STYLES['explore-day'].velCap);
    expect(STYLES['explore-night'].velCap).toBeLessThanOrEqual(STYLES['explore-day'].velCap);
    for (const s of ['explore-day', 'explore-night'] as const) expect(STYLES[s].silence![0]).toBeGreaterThanOrEqual(35);
    for (const s of PLAYABLE) expect(STYLES[s].level).toBeLessThanOrEqual(1.1);
  });

  it('plays the explore states for a minority of the time', () => {
    for (const state of ['explore-day', 'explore-night'] as const) {
      const { blocks } = compose(state, 3600, 3);
      let silent = 0;
      let total = 0;
      for (const b of blocks) {
        total += b.pulses * b.spp;
        if (b.kind === 'silence') silent += b.pulses * b.spp;
      }
      expect(silent / total, state).toBeGreaterThan(0.3);
    }
  });
});
