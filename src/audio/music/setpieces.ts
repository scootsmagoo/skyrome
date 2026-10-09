/**
 * Set pieces: two real tunes from antiquity, performed as fixed blocks by the harp (the lyre's
 * voice) over a soft low string pad.
 *
 * - The Epitaph of Seikilos (1st century AD), the oldest complete musical composition we have.
 * - The First Delphic Hymn to Apollo (c. 128 BC), sung at Delphi.
 *
 * The notes come from public-domain MIDI files on Wikimedia Commons (setpieceData.ts), tuned in
 * Pythagorean ratios from the tonic like the generated music. The first pass is the harp alone
 * (with its root and fifth under the bar); the second adds a flute doubling the tune.
 */
import type { Block, BlockInfo, MusicEvent } from './composer';
import { SEIKILOS_NOTES, DELPHIC_NOTES, type SetPieceNote } from './setpieceData';
import { PYTHAGOREAN } from './theory';
import type { SetPieceId } from './styles';

interface SetPiece {
  notes: readonly SetPieceNote[];
  tonicHz: number;
  /** Seconds per beat. */
  spb: number;
  /** Beats per bar (where the harp's root and fifth sound). */
  bar: number;
  /** A soft frame drum on every `drumEvery` beats (0: none). */
  drumEvery: number;
  meter: number;
  /** Beats of ring-out after the last note. */
  tail: number;
}

export const SET_PIECES: Record<SetPieceId, SetPiece> = {
  seikilos: { notes: SEIKILOS_NOTES, tonicHz: 220, spb: 1.15, bar: 3, drumEvery: 0, meter: 3, tail: 4 },
  delphic: { notes: DELPHIC_NOTES, tonicHz: 246.94, spb: 1, bar: 6.4, drumEvery: 6.4, meter: 4, tail: 5 },
};

/** Pythagorean frequency of `semis` semitones above `tonic`. */
export function pyth(tonic: number, semis: number): number {
  const oct = Math.floor(semis / 12);
  return tonic * PYTHAGOREAN[((semis % 12) + 12) % 12] * Math.pow(2, oct);
}

/** Length of one pass (seconds). */
export function setPieceSeconds(id: SetPieceId): number {
  const p = SET_PIECES[id];
  const last = p.notes[p.notes.length - 1];
  return (last[0] + last[1] + p.tail) * p.spb;
}

/**
 * One pass of a set piece as a block (1 pulse = 1 beat). `pass` 0 is the harp alone, 1 adds the flute.
 * `piece` numbers the block for BlockInfo; no note is louder than `velCap`.
 */
export function setPieceBlock(id: SetPieceId, pass: number, piece: number, velCap = 1): Block {
  const sp = SET_PIECES[id];
  const last = sp.notes[sp.notes.length - 1];
  const pulses = last[0] + last[1] + sp.tail;
  const ev: MusicEvent[] = [];
  const f = (semis: number, oct = 0) => pyth(sp.tonicHz, semis) * Math.pow(2, oct);
  // The pad under the whole piece: the tonic and (by the harp) its fifth.
  ev.push({ t: 0, part: 'drone', freq: f(0, -1), vel: 0.3 });
  ev.push({ t: pulses - 0.5, part: 'drone', vel: 0 });
  sp.notes.forEach(([t, len, semis], i) => {
    const onBeat = Math.abs(t - Math.round(t)) < 1e-6;
    const vel = (onBeat ? 0.52 : 0.42) * (i === sp.notes.length - 1 ? 0.9 : 1);
    ev.push({ t, part: 'lyre', freq: f(semis), dur: Math.max(len, 0.75 / sp.spb), vel, bright: 0.5 });
    if (pass > 0) {
      const prev = i > 0 ? sp.notes[i - 1] : null;
      const slur = !!prev && Math.abs(prev[0] + prev[1] - t) < 0.05 && len <= 1;
      ev.push({ t, part: 'melody', freq: f(semis, 1), dur: len * 0.96, vel: 0.42, legato: slur });
    }
  });
  // The root and fifth under each bar.
  for (let t = 0; t < last[0] + last[1] - 0.5; t += sp.bar) {
    ev.push({ t, part: 'lyre', freq: f(0, -1), dur: sp.bar, vel: 0.32, bright: 0.4 });
    ev.push({ t: t + 0.02 / sp.spb, part: 'lyre', freq: f(7, -1), dur: sp.bar, vel: 0.22, bright: 0.4 });
  }
  if (sp.drumEvery) for (let t = 0; t < last[0] + last[1] - 1; t += sp.drumEvery) ev.push({ t, part: 'drum', stroke: 'doum', vel: 0.3 });
  ev.sort((a, b) => a.t - b.t);
  for (const e of ev) e.vel = Math.min(e.vel, velCap);
  const info: BlockInfo = {
    piece,
    mode: id === 'delphic' ? 'phrygian' : 'dorian',
    final: sp.tonicHz,
    tempo: Math.round(60 / sp.spb),
    meter: sp.meter,
    melody: 'syrinx',
    answer: null,
    phrase: id,
  };
  return { pulses, spp: sp.spb, events: ev, kind: 'phrase', info };
}
