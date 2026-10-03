/**
 * Generative composer (pure, seeded). Produces music one phrase-sized block at a time:
 *
 *   piece   = mode + final + tempo + metre + instrumentation + two motifs (A, B)
 *   plan    = intro · A (antecedent → half cadence) · A' (consequent → full cadence) · B · A'' · outro
 *   phrase  = motif · varied motif (sequence / rhythm / inversion) · continuation · cadence
 *
 * Melodies move mostly by step, leap rarely and fill leaps back in; phrases arch in pitch and
 * dynamics; cadences approach the final (or the co-final for half cadences) by step; long notes
 * get ancient-style ornaments. Accompaniment uses the consonances Greek theory allowed (octave,
 * fifth, fourth) as drones, arpeggios, strums or heterophonic doubling. Explore music comes and
 * goes with silences between pieces; every new piece re-rolls mode, final, tempo and motifs.
 */
import { Rand } from '../dsp/core';
import type { DrumStroke } from '../dsp/instruments';
import { FINALS, MODES, degreeToFreq, type Mode, type ModeName } from './theory';
import { STYLES, type DrumStyle, type LyreTexture, type MelodyInstrument, type MusicState, type Style } from './styles';

export type Part = 'melody' | 'answer' | 'lyre' | 'drum' | 'cymbal' | 'drone';

export interface MusicEvent {
  /** Offset from the block start, in pulses. */
  t: number;
  part: Part;
  /** Scale degree relative to the final (melodic parts). */
  deg?: number;
  freq?: number;
  /** Duration in pulses. */
  dur?: number;
  /** 0..1 (drone: 0 = off). */
  vel: number;
  /** Slurred into from the previous note (no new articulation). */
  legato?: boolean;
  /** Ornament note (grace, turn) — not structural. */
  orn?: boolean;
  stroke?: DrumStroke;
  cymbal?: 'ring' | 'choke';
  /** Lyre brightness 0..1. */
  bright?: number;
}

export interface BlockInfo {
  piece: number;
  mode: ModeName;
  final: number;
  tempo: number;
  meter: number;
  melody: MelodyInstrument | null;
  answer: MelodyInstrument | null;
  phrase: string;
}

export interface Block {
  /** Length in pulses. */
  pulses: number;
  /** Seconds per pulse. */
  spp: number;
  events: MusicEvent[];
  kind: 'phrase' | 'intro' | 'outro' | 'rest' | 'silence' | 'fill';
  /** For phrases: 'full' (ends on the final) or 'half' (ends on the co-final). */
  cadence?: 'full' | 'half';
  info: BlockInfo;
}

interface Note {
  deg: number;
  dur: number;
}

interface Motif {
  rhythm: number[];
  degs: number[];
}

type PhraseKind = 'intro' | 'A' | 'A2' | 'A3' | 'B' | 'rest' | 'outro' | 'fill';

interface Piece {
  index: number;
  mode: Mode;
  final: number;
  tempo: number;
  meter: number;
  spp: number;
  melody: MelodyInstrument;
  answer: MelodyInstrument | null;
  lyre: LyreTexture;
  drums: DrumStyle;
  motifs: { A: Motif; B: Motif };
  plan: PhraseKind[];
  pos: number;
  phrasesSinceRefresh: number;
}

// ---------------------------------------------------------------- rhythm cells (in pulses)

const CELLS: Record<number, { calm: number[][]; busy: number[][]; cadence: number[][] }> = {
  4: {
    calm: [[1, 1, 2], [2, 1, 1], [1, 1, 1, 1], [1.5, 0.5, 2], [3, 1], [2, 2], [1.5, 0.5, 1, 1], [1, 2, 1]],
    busy: [
      [0.5, 0.5, 1, 1, 1],
      [1, 0.5, 0.5, 1, 1],
      [0.5, 0.5, 0.5, 0.5, 1, 1],
      [0.75, 0.25, 0.5, 0.5, 1, 1],
      [0.25, 0.25, 0.5, 1, 0.5, 0.5, 1],
      [1, 0.5, 0.5, 0.5, 0.5, 1],
      [0.5, 0.25, 0.25, 0.5, 0.5, 2],
    ],
    cadence: [[1, 1, 2], [0.5, 0.5, 1, 2], [1, 3], [1.5, 0.5, 2]],
  },
  3: {
    calm: [[1, 1, 1], [2, 1], [1, 2], [1.5, 0.5, 1], [3]],
    busy: [[0.5, 0.5, 1, 1], [1, 0.5, 0.5, 1], [0.5, 0.5, 0.5, 0.5, 1]],
    cadence: [[1, 2], [0.5, 0.5, 2], [2, 1]],
  },
  6: {
    calm: [[3, 3], [2, 1, 3], [3, 2, 1], [2, 1, 2, 1], [3, 1, 1, 1]],
    busy: [[1, 1, 1, 2, 1], [2, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1], [2, 1, 2, 1], [1, 1, 1, 3]],
    cadence: [[2, 1, 3], [1, 1, 1, 3], [3, 3]],
  },
};

const MODE_FINAL: Record<ModeName, keyof typeof FINALS> = { dorian: 'D', phrygian: 'E', mixolydian: 'G', hypolydian: 'F', chromatic: 'E' };

/** Weighted pick from [value, weight] pairs. */
function weighted<T>(rnd: Rand, items: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, w] of items) total += w;
  let r = rnd.next() * total;
  for (const [v, w] of items) if ((r -= w) <= 0) return v;
  return items[items.length - 1][0];
}

const clampDeg = (d: number, mode: Mode) => Math.max(mode.range[0], Math.min(mode.range[1], d));

// ---------------------------------------------------------------- melody construction

function pickRhythm(rnd: Rand, meter: number, energy: number): number[] {
  const c = CELLS[meter] ?? CELLS[4];
  return [...(rnd.chance(energy) ? rnd.pick(c.busy) : rnd.pick(c.calm))];
}

/** Stepwise-leaning melodic walk with leap compensation and a pull toward the middle of the range. */
function walk(rnd: Rand, mode: Mode, start: number, n: number, opts: { target?: number; leap?: number } = {}): number[] {
  const out: number[] = [];
  let d = clampDeg(start, mode);
  let lastLeap = 0;
  const mid = (mode.range[0] + mode.range[1]) / 2;
  for (let i = 0; i < n; i++) {
    out.push(d);
    let step: number;
    if (lastLeap) {
      step = -Math.sign(lastLeap); // fill the gap back in by step
      lastLeap = 0;
    } else {
      const r = rnd.next();
      const leapP = opts.leap ?? 0.18;
      if (r < leapP) {
        step = rnd.pick([2, 3, 4, -2, -3, -4]);
        lastLeap = Math.abs(step) >= 3 ? step : 0;
      } else if (r < leapP + 0.1) step = 0;
      else step = rnd.chance(0.5) ? 1 : -1;
      // Gravity toward the middle (and the target, if any).
      const pull = (opts.target ?? mid) - d;
      if (Math.abs(pull) > 3 && Math.sign(step) !== Math.sign(pull) && rnd.chance(0.6)) step = -step;
    }
    const next = d + step;
    d = next < mode.range[0] || next > mode.range[1] ? d - step : next;
  }
  return out;
}

function makeMotif(rnd: Rand, mode: Mode, meter: number, style: Style, start: number): Motif {
  const rhythm = pickRhythm(rnd, meter, style.energy);
  return { rhythm, degs: walk(rnd, mode, start, rhythm.length) };
}

function transpose(m: Motif, k: number, mode: Mode): Motif {
  const degs = m.degs.map((d) => d + k);
  const lo = Math.min(...degs);
  const hi = Math.max(...degs);
  const shift = lo < mode.range[0] ? mode.range[0] - lo : hi > mode.range[1] ? mode.range[1] - hi : 0;
  return { rhythm: m.rhythm, degs: degs.map((d) => d + shift) };
}

function vary(rnd: Rand, m: Motif, mode: Mode, how: 'sequence' | 'rhythm' | 'invert'): Motif {
  if (how === 'sequence') return transpose(m, rnd.pick([1, -1, 2, -2]), mode);
  if (how === 'invert') {
    const pivot = m.degs[0];
    return { rhythm: m.rhythm, degs: m.degs.map((d) => clampDeg(2 * pivot - d, mode)) };
  }
  // Rhythmic variation: split the longest note into a pair (the second a neighbour), or merge.
  const r = [...m.rhythm];
  const d = [...m.degs];
  let li = 0;
  for (let i = 1; i < r.length; i++) if (r[i] > r[li]) li = i;
  if (r[li] >= 1 && rnd.chance(0.7)) {
    const half = r[li] / 2;
    r.splice(li, 1, half, half);
    d.splice(li + 1, 0, clampDeg(d[li] + rnd.pick([1, -1]), mode));
  } else if (r.length > 2) {
    let si = 0;
    for (let i = 1; i < r.length - 1; i++) if (r[i] + r[i + 1] < r[si] + r[si + 1]) si = i;
    r.splice(si, 2, r[si] + r[si + 1]);
    d.splice(si + 1, 1);
  }
  return { rhythm: r, degs: d };
}

function cadenceBar(rnd: Rand, mode: Mode, meter: number, target: number, from: number): Note[] {
  const rhythm = [...rnd.pick((CELLS[meter] ?? CELLS[4]).cadence)];
  const n = rhythm.length;
  // Approach the target by step from above (common) or from below (via the step under it).
  const above = from > target || rnd.chance(0.6);
  const degs: number[] = [];
  for (let i = 0; i < n; i++) {
    const k = n - 1 - i;
    degs.push(clampDeg(above ? target + k : target - Math.min(1, k) + (k > 1 ? k - 1 : 0), mode));
  }
  degs[n - 1] = target;
  return rhythm.map((dur, i) => ({ deg: degs[i], dur }));
}

function continuation(rnd: Rand, mode: Mode, meter: number, style: Style, from: number): Note[] {
  const rhythm = pickRhythm(rnd, meter, style.energy);
  // Head for the phrase's high point, a little above the middle of the range.
  const peak = Math.round(mode.range[1] - 2);
  const degs = walk(rnd, mode, from + 1, rhythm.length, { target: peak, leap: 0.12 });
  return rhythm.map((dur, i) => ({ deg: degs[i], dur }));
}

const toNotes = (m: Motif): Note[] => m.rhythm.map((dur, i) => ({ deg: m.degs[i], dur }));

function phraseNotes(rnd: Rand, p: Piece, style: Style, kind: PhraseKind, bars: number): { notes: Note[]; cadence: 'full' | 'half' } {
  const { mode, meter } = p;
  const A = p.motifs.A;
  const B = p.motifs.B;
  const half = kind === 'A' || kind === 'B';
  const target = half ? mode.cofinal : 0;
  const first = kind === 'B' ? B : kind === 'A3' ? vary(rnd, A, mode, 'rhythm') : A;
  const notes: Note[] = [...toNotes(first)];
  if (bars >= 4) {
    const how = kind === 'B' ? rnd.pick(['sequence', 'invert'] as const) : kind === 'A2' ? 'rhythm' : 'sequence';
    notes.push(...toNotes(vary(rnd, first, mode, how)));
    notes.push(...continuation(rnd, mode, meter, style, notes[notes.length - 1].deg));
  }
  notes.push(...cadenceBar(rnd, mode, meter, target, notes[notes.length - 1].deg));
  return { notes, cadence: half ? 'half' : 'full' };
}

// ---------------------------------------------------------------- the generator

export class Composer {
  readonly style: Style;
  private rnd: Rand;
  private piece: Piece | null = null;
  private pieceCount = 0;
  private pendingSilence = false;

  constructor(
    readonly state: Exclude<MusicState, 'silence'>,
    seed: number | string = 1,
  ) {
    this.style = STYLES[state];
    this.rnd = new Rand(`${state}:${seed}`);
  }

  /** The next block of music (a phrase, an intro/outro, or a silence between pieces). */
  next(): Block {
    if (this.pendingSilence && this.style.silence) {
      this.pendingSilence = false;
      const p = this.piece!;
      const secs = this.rnd.range(this.style.silence[0], this.style.silence[1]);
      this.piece = null;
      return { pulses: secs / p.spp, spp: p.spp, events: [{ t: 0, part: 'drone', vel: 0 }], kind: 'silence', info: this.info(p, 'silence') };
    }
    if (!this.piece) this.piece = this.newPiece();
    const p = this.piece;
    if (p.pos >= p.plan.length) {
      if (this.style.silence) {
        // Piece over: next call returns silence, then a new piece.
        this.pendingSilence = true;
        return this.next();
      }
      // Continuous styles: new motifs (and every few rounds a new mode/final), no gap.
      this.refresh(p);
    }
    const kind = p.plan[p.pos++];
    return this.render(p, kind);
  }

  private info(p: Piece, phrase: string): BlockInfo {
    return { piece: p.index, mode: p.mode.name, final: p.final, tempo: p.tempo, meter: p.meter, melody: p.melody, answer: p.answer, phrase };
  }

  private newPiece(): Piece {
    const s = this.style;
    const rnd = this.rnd;
    const meter = weighted(rnd, s.meters);
    const mode = MODES[rnd.pick(s.modes)];
    // Finals vary between pieces: the mode's own final, or transposed by a fourth/fifth.
    const base = FINALS[MODE_FINAL[mode.name]];
    const final = base * rnd.pick([1, 1, 1, 4 / 3, 3 / 4, 9 / 8]);
    // Tempo is in beats per minute; a 6/8 beat (dotted quarter) holds three eighth-note pulses.
    const tempo = Math.round(rnd.range(s.tempo[0], s.tempo[1]) * (meter === 6 ? 3 : 1));
    const melody = weighted(rnd, s.melody);
    const p: Piece = {
      index: this.pieceCount++,
      mode,
      final: final > 360 ? final / 2 : final < 180 ? final * 2 : final,
      tempo,
      meter,
      spp: 60 / tempo,
      melody,
      answer: s.answer ? (melody === 'aulos' ? 'syrinx' : 'aulos') : null,
      lyre: weighted(rnd, s.lyre),
      drums: weighted(rnd, s.drums),
      motifs: { A: makeMotif(rnd, mode, meter, s, rnd.pick([0, 2, 4])), B: makeMotif(rnd, mode, meter, s, rnd.pick([3, 4, 5])) },
      plan: [],
      pos: 0,
      phrasesSinceRefresh: 0,
    };
    p.plan = this.plan(p);
    return p;
  }

  private plan(p: Piece): PhraseKind[] {
    const s = this.style;
    const rnd = this.rnd;
    if (s.silence === null) {
      // Continuous: a section of four phrases (combat sometimes breaks for a drum fill).
      const sec: PhraseKind[] = ['A', 'A2', 'B', 'A3'];
      if (s.state === 'combat' && rnd.chance(0.4)) sec.splice(2, 0, 'fill');
      return p.index === 0 && (s.state === 'combat' || s.state === 'tension') ? ['intro', ...sec] : sec;
    }
    const len = rnd.int(s.pieceLength[0], s.pieceLength[1]);
    const core: PhraseKind[] = ['A', 'A2', 'B', 'A3', 'A', 'A2', 'B', 'A3'];
    const body = core.slice(0, Math.max(2, len - 2));
    // The last sung phrase closes on the final.
    if (body[body.length - 1] === 'A' || body[body.length - 1] === 'B') body.push('A2');
    // Breathing space: replace a middle phrase by accompaniment only.
    if (body.length > 3 && rnd.chance(0.5)) body.splice(rnd.int(2, body.length - 1), 0, 'rest');
    return ['intro', ...body, 'outro'];
  }

  private refresh(p: Piece) {
    const rnd = this.rnd;
    const s = this.style;
    p.phrasesSinceRefresh++;
    if (p.phrasesSinceRefresh % 3 === 0) {
      // Move to a related final (up a fourth or down a fifth) and/or another mode of the style.
      p.mode = MODES[rnd.pick(s.modes)];
      p.final = p.final * rnd.pick([4 / 3, 3 / 4, 9 / 8, 8 / 9]);
      if (p.final > 360) p.final /= 2;
      if (p.final < 180) p.final *= 2;
    }
    p.motifs = { A: makeMotif(rnd, p.mode, p.meter, s, rnd.pick([0, 2, 4])), B: rnd.chance(0.5) ? p.motifs.A : makeMotif(rnd, p.mode, p.meter, s, rnd.pick([3, 4, 5])) };
    p.plan = this.plan(p);
    p.pos = 0;
  }

  // ---------------------------------------------------------------- rendering a block

  private render(p: Piece, kind: PhraseKind): Block {
    const s = this.style;
    const rnd = this.rnd;
    const bars = kind === 'fill' ? 1 : kind === 'intro' ? (s.state === 'combat' ? 1 : 2) : kind === 'outro' ? 2 : rnd.pick(s.phraseBars);
    const pulses = bars * p.meter;
    const ev: MusicEvent[] = [];
    const melFinal = p.final * Math.pow(2, s.melodyOctave[p.melody]);
    const lyreFinal = p.final / 2;
    let cadence: 'full' | 'half' | undefined;

    // Drone (sustained second pipe) for styles that use it.
    if (s.drone && (kind === 'intro' || kind === 'A' || p.pos === 1)) ev.push({ t: 0, part: 'drone', freq: p.final / 2, vel: s.state === 'combat' ? 0.25 : 0.35 });

    // Melody (and the answering voice in call-and-response styles).
    const melodic = kind === 'A' || kind === 'A2' || kind === 'A3' || kind === 'B';
    const rests = melodic && kind !== 'A' && rnd.chance(s.melodyRest);
    const barRoots: number[] = new Array(bars).fill(0);
    if (melodic) {
      const ph = phraseNotes(rnd, p, s, kind, bars);
      cadence = ph.cadence;
      let t = 0;
      ph.notes.forEach((n, i) => {
        const bar = Math.min(bars - 1, Math.floor(t / p.meter + 1e-6));
        if (Math.abs(t - bar * p.meter) < 1e-6) barRoots[bar] = rootOf(n.deg);
        if (!rests) {
          const answer = p.answer && bars >= 2 && bar >= bars / 2;
          const part: Part = answer ? 'answer' : 'melody';
          const inst = answer ? p.answer! : p.melody;
          const f0 = p.final * Math.pow(2, s.melodyOctave[inst]);
          const arch = Math.sin(Math.PI * Math.min(1, (t + n.dur / 2) / pulses));
          const accent = Math.abs(t % p.meter) < 1e-6 ? 0.08 : 0;
          const vel = Math.min(1, s.dynamics * (0.72 + 0.2 * arch + accent) * rnd.vary(0.05));
          const legato = i > 0 && n.dur <= 1 && rnd.chance(inst === 'aulos' ? 0.55 : 0.3);
          // Ornament long notes: an upper grace note, or a turn (aulos), squeezed in before the beat.
          const graceSec = 0.07;
          const g = graceSec / p.spp;
          if (n.dur >= 1.5 && i > 0 && rnd.chance(s.ornament) && t > g * 3) {
            if (inst === 'aulos' && rnd.chance(0.4)) {
              [1, 0, -1].forEach((k, j) => ev.push({ t: t - g * (3 - j), part, deg: n.deg + k, freq: degreeToFreq(p.mode, n.deg + k, f0), dur: g, vel: vel * 0.8, legato: j > 0, orn: true }));
            } else ev.push({ t: t - g, part, deg: n.deg + 1, freq: degreeToFreq(p.mode, n.deg + 1, f0), dur: g, vel: vel * 0.8, orn: true });
            ev.push({ t, part, deg: n.deg, freq: degreeToFreq(p.mode, n.deg, f0), dur: n.dur * 0.96, vel, legato: true });
          } else {
            ev.push({ t, part, deg: n.deg, freq: degreeToFreq(p.mode, n.deg, f0), dur: n.dur * (legato ? 1 : 0.9), vel, legato });
          }
        }
        t += n.dur;
      });
    } else if (kind === 'outro') {
      barRoots[0] = p.mode.cofinal % 7;
      barRoots[1] = 0;
    }

    // Accompaniment.
    this.lyre(ev, p, kind, bars, barRoots, lyreFinal, melodic ? ev.filter((e) => e.part === 'melody' && !e.orn) : []);
    this.drums(ev, p, kind, bars);
    if (rnd.chance(s.cymbals) && kind !== 'outro') ev.push({ t: 0, part: 'cymbal', cymbal: s.state === 'combat' && p.pos === 1 ? 'ring' : s.state === 'temple' ? 'ring' : 'choke', vel: 0.5 * s.dynamics });
    if (kind === 'outro' && s.drone) ev.push({ t: pulses - 0.01, part: 'drone', vel: 0 });

    ev.sort((a, b) => a.t - b.t);
    for (const e of ev) e.t = Math.max(0, e.t);
    return { pulses, spp: p.spp, events: ev, kind: kind === 'A' || kind === 'A2' || kind === 'A3' || kind === 'B' ? 'phrase' : kind === 'rest' ? 'rest' : kind, cadence, info: this.info(p, kind) };
  }

  private lyre(ev: MusicEvent[], p: Piece, kind: PhraseKind, bars: number, roots: number[], f0: number, melody: MusicEvent[]) {
    const s = this.style;
    const rnd = this.rnd;
    const m = p.meter;
    const dyn = s.dynamics;
    const pl = (t: number, deg: number, vel: number, dur: number, bright = 0.55) =>
      ev.push({ t, part: 'lyre', deg, freq: degreeToFreq(p.mode, deg, f0), dur, vel: vel * dyn * rnd.vary(0.06), bright });
    if (kind === 'fill') return;
    const texture: LyreTexture = kind === 'intro' && p.lyre === 'heterophony' ? 'arp' : p.lyre;
    for (let b = 0; b < bars; b++) {
      const t0 = b * m;
      const r = roots[b] ?? 0;
      const last = kind === 'outro' && b === bars - 1;
      if (last) {
        [0, 4, 7].forEach((d, i) => pl(t0 + i * (0.02 / p.spp), d, 0.6, m * 1.5, 0.5));
        continue;
      }
      switch (texture) {
        case 'sparse': {
          // Root on the downbeat, a consonance (fifth / octave / fourth) later in the bar, and
          // now and then a soft passing string.
          pl(t0, r, 0.55, m);
          pl(t0 + (m === 3 ? 2 : m / 2), r + rnd.pick([4, 7, 3]), 0.4, m / 2);
          if (rnd.chance(0.45)) pl(t0 + (m === 3 ? 1 : rnd.pick([1, 3])), r + rnd.pick([2, 4, 5, 7]), 0.28, 1);
          break;
        }
        case 'arp': {
          const shape = rnd.pick([[0, 4, 7, 4], [0, 7, 4, 7], [0, 4, 9, 7], [0, 3, 7, 3]]);
          const step = m === 6 ? 1 : 0.5;
          for (let k = 0, t = 0; t < m - 1e-6; k++, t += step) pl(t0 + t, r + shape[k % shape.length], k % 2 ? 0.32 : 0.45, step * 2);
          break;
        }
        case 'strum': {
          const hits = m === 6 ? [0, 3] : m === 3 ? [0, 2] : [0, 1.5, 3];
          for (const h of hits) [0, 4, 7].forEach((d, i) => pl(t0 + h + i * (0.018 / p.spp), r + d, h === 0 ? 0.55 : 0.4, m === 6 ? 2.5 : 1.2, 0.75));
          break;
        }
        case 'ostinato': {
          const fig = rnd.chance(0.7) ? [0, 1, 0, -1, 0, 1, 0, -2] : [0, 0, 1, 0, 0, 0, 1, -1];
          for (let k = 0; k < m * 2; k++) pl(t0 + k * 0.5, fig[k % fig.length], k % 4 === 0 ? 0.5 : 0.32, 0.45, 0.35);
          break;
        }
        case 'drone':
          if (b % 2 === 0) {
            pl(t0, 0, 0.5, m * 2, 0.4);
            pl(t0 + 0.02 / p.spp, 4, 0.35, m * 2, 0.4);
          }
          break;
        case 'heterophony': {
          const inBar = melody.filter((e) => e.t >= t0 - 1e-6 && e.t < t0 + m - 1e-6 && (Math.abs(e.t % 1) < 1e-6 || (e.dur ?? 0) >= 1));
          if (!inBar.length) pl(t0, r, 0.5, m);
          for (const e of inBar) pl(e.t, e.deg ?? 0, 0.42, Math.max(1, e.dur ?? 1));
          break;
        }
      }
    }
  }

  private drums(ev: MusicEvent[], p: Piece, kind: PhraseKind, bars: number) {
    const s = this.style;
    const rnd = this.rnd;
    const m = p.meter;
    const style = kind === 'intro' && s.state === 'tension' ? 'heartbeat' : p.drums;
    if (style === 'none') return;
    if (kind === 'outro' && s.silence) {
      ev.push({ t: 0, part: 'drum', stroke: 'doum', vel: 0.4 * s.dynamics });
      return;
    }
    const d = (t: number, stroke: DrumStroke, vel: number) => ev.push({ t, part: 'drum', stroke, vel: Math.min(1, vel * s.dynamics * rnd.vary(0.08)) });
    for (let b = 0; b < bars; b++) {
      const t0 = b * m;
      const lastBar = b === bars - 1;
      switch (style) {
        case 'soft':
          if (b % 2 === 1 && rnd.chance(0.5)) break;
          d(t0, 'doum', 0.5);
          if (m >= 4) d(t0 + 2, 'tek', 0.28);
          else d(t0 + 2, 'ka', 0.22);
          if (lastBar && rnd.chance(0.4)) d(t0 + m - 0.5, 'ka', 0.2);
          break;
        case 'heartbeat':
          d(t0, 'doum', 0.6);
          d(t0 + 0.6, 'doum', 0.38);
          if (b % 2 === 1 && rnd.chance(0.4)) d(t0 + 2.5, 'ka', 0.15);
          break;
        case 'drive': {
          const fill = (kind === 'fill' || kind === 'intro' || (lastBar && rnd.chance(0.45))) && m === 4;
          if (fill) {
            d(t0, 'doum', 0.9);
            d(t0 + 1, 'tek', 0.55);
            for (let k = 0; k < 8; k++) d(t0 + 2 + k * 0.25, k % 2 ? 'ka' : 'tek', 0.45 + 0.07 * k);
          } else if (rnd.chance(0.5)) {
            // Maqsum-like: D T . T D . T k
            d(t0, 'doum', 0.9);
            d(t0 + 0.5, 'tek', 0.5);
            d(t0 + 1.5, 'tek', 0.6);
            d(t0 + 2, 'doum', 0.85);
            d(t0 + 3, 'tek', 0.6);
            d(t0 + 3.5, 'ka', 0.4);
          } else {
            // Driving eighths.
            for (let k = 0; k < 8; k++) d(t0 + k * 0.5, k % 4 === 0 ? 'doum' : k % 2 === 0 ? 'tek' : 'ka', k % 4 === 0 ? 0.9 : k % 2 === 0 ? 0.6 : 0.35);
          }
          break;
        }
        case 'dance':
          if (m === 6) {
            d(t0, 'doum', 0.8);
            d(t0 + 2, 'tek', 0.5);
            d(t0 + 3, 'doum', 0.65);
            d(t0 + 4, 'ka', 0.3);
            d(t0 + 5, 'tek', 0.5);
          } else {
            d(t0, 'doum', 0.8);
            d(t0 + 1, 'tek', 0.5);
            d(t0 + 1.5, 'ka', 0.3);
            d(t0 + 2, 'doum', 0.7);
            d(t0 + 3, 'tek', 0.5);
            d(t0 + 3.5, 'tek', 0.4);
          }
          if (rnd.chance(0.3)) ev.push({ t: t0 + (m === 6 ? 3 : 2), part: 'cymbal', cymbal: 'choke', vel: 0.3 });
          break;
        case 'processional':
          d(t0, 'doum', 0.45);
          if (b % 4 === 3) d(t0 + 2, 'doum', 0.3);
          break;
      }
    }
  }
}

/** Accompaniment root for a melody note: the nearest of final, fourth or fifth. */
function rootOf(deg: number): number {
  const d = ((deg % 7) + 7) % 7;
  return d <= 1 || d >= 6 ? 0 : d <= 3 ? 3 : 4;
}

/** Absolute-time event, for offline rendering and tests. */
export interface TimedEvent extends MusicEvent {
  time: number;
  seconds: number;
  block: Block;
}

/** Generate `seconds` of music for a state (pure). */
export function compose(state: Exclude<MusicState, 'silence'>, seconds: number, seed: number | string = 1): { events: TimedEvent[]; blocks: Block[] } {
  const c = new Composer(state, seed);
  const events: TimedEvent[] = [];
  const blocks: Block[] = [];
  let t = 0;
  while (t < seconds) {
    const b = c.next();
    blocks.push(b);
    for (const e of b.events) events.push({ ...e, time: t + e.t * b.spp, seconds: (e.dur ?? 0) * b.spp, block: b });
    t += b.pulses * b.spp;
  }
  return { events: events.filter((e) => e.time < seconds), blocks };
}
