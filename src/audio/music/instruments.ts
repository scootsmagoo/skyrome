/**
 * Web Audio instruments for the music engine.
 *
 * - Lyre / kithara: a recorded harp (VSCO 2 CE), one sample per minor third, pitch-shifted a little
 *   to each note and darkened by a low-pass for soft notes. The old Karplus–Strong plucks remain as
 *   the fallback if the recordings cannot be loaded.
 * - Aulos and syrinx: a recorded oboe (played softly) and flute, looping their sustained part under an
 *   envelope with a delayed vibrato. If the recordings cannot be loaded the reed stays silent (the
 *   sine "syrinx" stand-in is gone: nothing in the music is an oscillator any more).
 * - The drone: a looping low string pad (the aulos' second pipe, reimagined as a soft bowed drone).
 * - Tympanum and cymbala: a recorded hand drum, congas and tambourine hits (VSCO 1/2 CE); the old
 *   baked strokes are the fallback.
 *
 * Recordings come from the shared bank (vsco.ts). An instrument asked to play a sample that isn't
 * loaded drops the note; racks avoid that by preparing each block before scheduling it
 * (`WebAudioRack.prepare`), which also starts the loading.
 *
 * Everything works on any BaseAudioContext, so the same code renders offline for verification.
 */
import { Rand } from '../dsp/core';
import type { DrumStroke } from '../dsp/instruments';
import { MUSIC_RATE, STROKE_VARIANTS, brightnessFor } from './sampleSpec';
import { musicSamples } from './samples';
import { freqToMidi, midiToFreq, vsco, type VscoGroup } from './vsco';

export interface MusicOutput {
  ctx: BaseAudioContext;
  /** Dry destination. */
  dry: AudioNode;
  /** Reverb send destination. */
  rev: AudioNode;
}

const WAVE_N = 512;
let wave: AudioBuffer | null = null;

/**
 * One cycle of a sine (512 samples, shared by every context: AudioBuffers aren't tied to one), looped
 * by a buffer source at the vibrato rate. This is the only periodic wave in the music and it is
 * never heard: it moves the pitch of recorded notes by a few cents. No OscillatorNode is created
 * anywhere in the music (tests/audio-music-nosynth.test.ts checks the source).
 */
function vibratoWave(ctx: BaseAudioContext): AudioBuffer {
  if (wave) return wave;
  wave = ctx.createBuffer(1, WAVE_N, MUSIC_RATE);
  const d = wave.getChannelData(0);
  for (let i = 0; i < WAVE_N; i++) d[i] = Math.sin((2 * Math.PI * i) / WAVE_N);
  return wave;
}

function makePanner(ctx: BaseAudioContext, pan: number): AudioNode {
  if (typeof (ctx as AudioContext).createStereoPanner === 'function') {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    return p;
  }
  return ctx.createGain(); // very old Safari: no panning
}

abstract class Instrument {
  readonly input: GainNode;
  protected readonly ctx: BaseAudioContext;
  private readonly pan: AudioNode;
  private readonly send: GainNode;

  constructor(out: MusicOutput, opts: { gain: number; pan: number; reverb: number }) {
    this.ctx = out.ctx;
    this.input = out.ctx.createGain();
    this.input.gain.value = opts.gain;
    this.pan = makePanner(out.ctx, opts.pan);
    this.send = out.ctx.createGain();
    this.send.gain.value = opts.reverb;
    this.input.connect(this.pan);
    this.pan.connect(out.dry);
    this.pan.connect(this.send);
    this.send.connect(out.rev);
  }

  /** Stop persistent sources at `when` and disconnect shortly after. */
  dispose(when: number) {
    const ms = Math.max(0, (when - this.ctx.currentTime) * 1000) + 200;
    setTimeout(() => {
      this.input.disconnect();
      this.pan.disconnect();
      this.send.disconnect();
    }, ms);
  }
}

function oneShot(ctx: BaseAudioContext, buf: AudioBuffer, dest: AudioNode, when: number, vel: number, rate = 1, stopAt?: number, damp = 0.06) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = vel;
  src.connect(g);
  g.connect(dest);
  if (stopAt !== undefined) {
    g.gain.setValueAtTime(vel, stopAt);
    g.gain.setTargetAtTime(0, stopAt, damp);
    src.start(when);
    src.stop(stopAt + damp * 6);
  } else src.start(when);
  src.onended = () => {
    src.disconnect();
    g.disconnect();
  };
}

// ---------------------------------------------------------------- lyre / kithara

/**
 * The rack's instrument gains are set for the recordings; the synthesised fallbacks (used only if the
 * recordings cannot be loaded) are scaled down to the level they had before.
 */
const FALLBACK_SCALE = { harp: 0.26, drum: 0.27, cymbal: 0.2 };

/** Level of the recorded harp relative to its sample level (the rack sets the instrument's gain). */
const HARP_GAIN = 0.9;

export class Lyre extends Instrument {
  /** Darker notes (ostinati, drones) go through a gentle low-pass instead of a third sample set. */
  private readonly dark: BiquadFilterNode;
  /** The recorded harp's tone: three low-passes, from soft and dark to open. */
  private readonly tones: BiquadFilterNode[];

  constructor(
    out: MusicOutput,
    private readonly body: 'lyre' | 'kithara',
    opts = { gain: 0.5, pan: -0.25, reverb: 0.5 },
    private readonly sync = false,
  ) {
    super(out, opts);
    this.dark = this.ctx.createBiquadFilter();
    this.dark.type = 'lowpass';
    this.dark.frequency.value = 2600;
    this.dark.Q.value = 0.6;
    this.dark.connect(this.input);
    this.tones = [1500, 2300, 3200].map((f) => {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = f;
      lp.Q.value = 0.5;
      lp.connect(this.input);
      return lp;
    });
  }

  private buffer(freq: number, bright: number): AudioBuffer | null {
    return musicSamples.get(this.ctx, { kind: 'pluck', body: this.body, freq, bright: brightnessFor(bright).bucket }, this.sync);
  }

  /** Request a note's sample; true if it is ready to play. */
  ready(freq: number, bright = 0.55): boolean {
    if (!vsco.request('harp')) return false; // still loading
    return vsco.state('harp') === 'ready' || this.buffer(freq, bright) !== null;
  }

  play(when: number, freq: number, vel: number, dur?: number, bright = 0.55) {
    // Notes shorter than ~0.6 s are damped by the hand (ostinati, dance strums); longer ones ring.
    const stop = dur !== undefined && dur < 0.6 ? when + dur : undefined;
    if (vsco.state('harp') === 'ready') {
      const hit = vsco.nearest('harp', freqToMidi(freq));
      if (!hit) return;
      // Soft notes are darker as well as quieter.
      const b = bright * (0.55 + 0.6 * vel);
      const tone = this.tones[b < 0.38 ? 0 : b < 0.58 ? 1 : 2];
      oneShot(this.ctx, hit.buf, tone, when, vel * HARP_GAIN, freq / midiToFreq(hit.sample.midi!), stop, 0.09);
      return;
    }
    const buf = this.buffer(freq, bright);
    if (!buf) return; // still baking (the performer normally waits for it)
    oneShot(this.ctx, buf, brightnessFor(bright).dark ? this.dark : this.input, when, vel * FALLBACK_SCALE.harp, 1, stop, 0.08);
  }

  override dispose(when: number) {
    super.dispose(when);
    const ms = Math.max(0, (when - this.ctx.currentTime) * 1000) + 200;
    setTimeout(() => {
      this.dark.disconnect();
      for (const t of this.tones) t.disconnect();
    }, ms);
  }
}

// ---------------------------------------------------------------- aulos (oboe) and syrinx (flute)

export interface ReedSpec {
  group: VscoGroup;
  /** Attack time as [articulated, slurred] seconds. */
  attack: [number, number];
  /** Release as [phrase end, into a slurred note] seconds. */
  release: [number, number];
  /** A cut [Hz, dB, Q] where the recording is most pointed, and a low-pass (Hz): the 1-4 kHz bite is the first thing to go. */
  cut: [number, number, number];
  lowpass: number;
  /** Vibrato: rate (Hz), depth (cents) and delay before it comes in (s). */
  vibrato: [number, number, number];
  /** Level of the recording relative to its normalised level. */
  gain: number;
}

export const OBOE: ReedSpec = { group: 'oboe', attack: [0.09, 0.05], release: [0.2, 0.09], cut: [1100, -5, 0.9], lowpass: 2200, vibrato: [5.1, 9, 0.5], gain: 1 };
export const FLUTE: ReedSpec = { group: 'flute', attack: [0.13, 0.07], release: [0.22, 0.1], cut: [1900, -3, 0.8], lowpass: 2800, vibrato: [4.8, 7, 0.6], gain: 1.1 };

/** A recorded sustained instrument: each note loops the steady part of the nearest recorded pitch. */
export class Reed extends Instrument {
  private readonly eq: BiquadFilterNode;
  private readonly lp: BiquadFilterNode;
  private readonly lfo: AudioBufferSourceNode;
  private lastEnd = -1;

  constructor(
    out: MusicOutput,
    private readonly spec: ReedSpec,
    opts = { gain: 0.5, pan: 0.15, reverb: 0.5 },
  ) {
    super(out, opts);
    // A cut where a soft oboe's third harmonic sits (it is the bite in the sound), then a low-pass.
    this.eq = this.ctx.createBiquadFilter();
    this.eq.type = 'peaking';
    this.eq.frequency.value = spec.cut[0];
    this.eq.gain.value = spec.cut[1];
    this.eq.Q.value = spec.cut[2];
    this.lp = this.ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = spec.lowpass;
    this.lp.Q.value = 0.55;
    this.eq.connect(this.lp);
    this.lp.connect(this.input);
    this.lfo = this.ctx.createBufferSource();
    this.lfo.buffer = vibratoWave(this.ctx);
    this.lfo.loop = true;
    this.lfo.playbackRate.value = (spec.vibrato[0] * WAVE_N) / MUSIC_RATE;
    this.lfo.start(this.ctx.currentTime);
  }

  /** Start loading the recordings; true once they are loaded or given up on. */
  settled(): boolean {
    return vsco.request(this.spec.group);
  }

  /** Loaded and ready to play (otherwise the rack uses its fallback voice). */
  get loaded(): boolean {
    return vsco.state(this.spec.group) === 'ready';
  }

  note(when: number, freq: number, dur: number, vel: number, legato: boolean, release: boolean) {
    const hit = vsco.nearest(this.spec.group, freqToMidi(freq));
    if (!hit?.sample.loop) return;
    const ctx = this.ctx;
    const sp = this.spec;
    const slur = legato && when - this.lastEnd < 0.08;
    const src = ctx.createBufferSource();
    src.buffer = hit.buf;
    src.loop = true;
    src.loopStart = hit.sample.loop[0];
    src.loopEnd = hit.sample.loop[1];
    src.playbackRate.value = freq / midiToFreq(hit.sample.midi!);
    const g = ctx.createGain();
    const atk = Math.min(slur ? sp.attack[1] : sp.attack[0], dur * 0.4);
    const rel = release ? sp.release[0] : sp.release[1];
    const end = when + dur;
    g.gain.setValueAtTime(0, when);
    g.gain.setTargetAtTime(Math.pow(vel, 1.15) * sp.gain, when, atk / 3);
    g.gain.setTargetAtTime(0, end, rel / 3);
    // Vibrato comes in after a held note has settled, as a player's does.
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, when);
    if (dur > sp.vibrato[2] + 0.3) {
      vg.gain.setValueAtTime(0, when + sp.vibrato[2]);
      vg.gain.linearRampToValueAtTime(sp.vibrato[1] * (0.6 + 0.4 * vel), when + sp.vibrato[2] + 0.5);
    }
    this.lfo.connect(vg);
    vg.connect(src.detune);
    src.connect(g);
    g.connect(this.eq);
    src.start(when);
    src.stop(end + rel * 2.5);
    src.onended = () => {
      this.lfo.disconnect(vg);
      vg.disconnect();
      src.disconnect();
      g.disconnect();
    };
    this.lastEnd = end;
  }

  override dispose(when: number) {
    this.lfo.stop(when + 0.5);
    super.dispose(when + 0.5);
    const ms = Math.max(0, (when - this.ctx.currentTime) * 1000) + 800;
    setTimeout(() => {
      this.eq.disconnect();
      this.lp.disconnect();
    }, ms);
  }
}

// ---------------------------------------------------------------- drone (string pad)

/** The aulos' second pipe holding the final: a soft low string pad that swells in and out. */
export class Pad extends Instrument {
  private voices: { src: AudioBufferSourceNode; g: GainNode }[] = [];
  private freq: number | null = null;

  constructor(out: MusicOutput, opts = { gain: 0.3, pan: 0.05, reverb: 0.6 }) {
    super(out, opts);
  }

  /** Start loading the recordings; true once they are loaded or given up on. */
  settled(): boolean {
    return vsco.request('cello');
  }

  /** Hold `freq` (and its fifth, quietly) from `when`, or let go of the pad when `freq` is null. */
  set(when: number, freq: number | null, vel: number) {
    if (vsco.state('cello') !== 'ready') return;
    if (freq && this.freq && this.voices.length && Math.abs(this.freq / freq - 1) < 0.002) return;
    for (const v of this.voices) {
      v.g.gain.cancelScheduledValues(when);
      v.g.gain.setTargetAtTime(0, when, freq ? 0.6 : 0.9);
      v.src.stop(when + 6);
    }
    this.voices = [];
    this.freq = freq;
    if (!freq) return;
    for (const [mult, level] of [[1, 1], [1.5, 0.4]] as const) {
      const hit = vsco.nearest('cello', freqToMidi(freq * mult));
      if (!hit?.sample.loop) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = hit.buf;
      src.loop = true;
      src.loopStart = hit.sample.loop[0];
      src.loopEnd = hit.sample.loop[1];
      src.playbackRate.value = (freq * mult) / midiToFreq(hit.sample.midi!);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.setTargetAtTime(vel * level, when, 0.7);
      src.connect(g);
      g.connect(this.input);
      src.start(when);
      const v = { src, g };
      src.onended = () => {
        src.disconnect();
        g.disconnect();
        this.voices = this.voices.filter((x) => x !== v);
      };
      this.voices.push(v);
    }
  }

  override dispose(when: number) {
    for (const v of this.voices) {
      v.g.gain.setTargetAtTime(0, when, 0.15);
      v.src.stop(when + 1);
    }
    super.dispose(when + 1);
  }
}

// ---------------------------------------------------------------- percussion

/** Recorded group for each drum stroke: a large hand drum (the tympanum), a muted conga slap, a tambourine tap. */
const STROKE_GROUP: Record<DrumStroke, VscoGroup> = { doum: 'doum', tek: 'tek', ka: 'ka', slap: 'tek' };
/** Level of each group relative to its normalised level (the hand drum is the loudest, the tambourine the lightest). */
const STROKE_GAIN: Record<DrumStroke, number> = { doum: 1, tek: 0.8, ka: 0.6, slap: 0.8 };

export class Tympanum extends Instrument {
  private rnd = new Rand('tympanum');
  constructor(
    out: MusicOutput,
    opts = { gain: 0.7, pan: 0.2, reverb: 0.35 },
    private readonly sync = false,
  ) {
    super(out, opts);
  }
  /** Request a stroke (the recording, or every baked variant if the recording failed); true if it is ready. */
  ready(stroke: DrumStroke): boolean {
    if (!vsco.request(STROKE_GROUP[stroke])) return false;
    if (vsco.state(STROKE_GROUP[stroke]) === 'ready') return true;
    let ok = true;
    for (let v = 0; v < STROKE_VARIANTS; v++) ok = musicSamples.get(this.ctx, { kind: 'drum', stroke, v }, this.sync) !== null && ok;
    return ok;
  }
  hit(when: number, stroke: DrumStroke, vel: number) {
    if (vsco.state(STROKE_GROUP[stroke]) === 'ready') {
      const h = vsco.hit(STROKE_GROUP[stroke], vel < 0.5 ? 0 : 1, this.rnd.next());
      if (h) oneShot(this.ctx, h.buf, this.input, when, (0.25 + 0.75 * vel) * STROKE_GAIN[stroke], 1 + (this.rnd.next() - 0.5) * 0.03);
      return;
    }
    const buf = musicSamples.get(this.ctx, { kind: 'drum', stroke, v: this.rnd.int(0, STROKE_VARIANTS - 1) }, this.sync);
    if (buf) oneShot(this.ctx, buf, this.input, when, vel * FALLBACK_SCALE.drum, 1 + (this.rnd.next() - 0.5) * 0.02);
  }
}

/** The cymbala's accents are a tambourine now: a soft shake (ring) or a single hit (choke). */
export class Cymbala extends Instrument {
  private rnd = new Rand('cymbala');
  constructor(
    out: MusicOutput,
    opts = { gain: 0.2, pan: 0.35, reverb: 0.5 },
    private readonly sync = false,
  ) {
    super(out, opts);
  }
  private static group(kind: 'ring' | 'choke'): VscoGroup {
    return kind === 'ring' ? 'tambShake' : 'tambHit';
  }
  ready(kind: 'ring' | 'choke'): boolean {
    if (!vsco.request(Cymbala.group(kind))) return false;
    if (vsco.state(Cymbala.group(kind)) === 'ready') return true;
    let ok = true;
    for (let v = 0; v < STROKE_VARIANTS; v++) ok = musicSamples.get(this.ctx, { kind: 'cymbal', stroke: kind, v }, this.sync) !== null && ok;
    return ok;
  }
  hit(when: number, kind: 'ring' | 'choke', vel: number) {
    if (vsco.state(Cymbala.group(kind)) === 'ready') {
      const h = vsco.hit(Cymbala.group(kind), 0, this.rnd.next());
      if (h) oneShot(this.ctx, h.buf, this.input, when, 0.4 + 0.6 * vel, 1 + (this.rnd.next() - 0.5) * 0.04);
      return;
    }
    const buf = musicSamples.get(this.ctx, { kind: 'cymbal', stroke: kind, v: this.rnd.int(0, STROKE_VARIANTS - 1) }, this.sync);
    if (buf) oneShot(this.ctx, buf, this.input, when, vel * FALLBACK_SCALE.cymbal);
  }
}
