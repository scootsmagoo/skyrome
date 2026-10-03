/**
 * Web Audio instruments for the music engine.
 *
 * - Lyre / kithara: Karplus–Strong plucks baked once per pitch (cached), played as buffers.
 * - Aulos, syrinx and the drone: one persistent oscillator voice each, driven by parameter
 *   automation (legato glides, tonguing, delayed vibrato) — almost free on the audio thread.
 * - Tympanum and cymbala: baked strokes (three variants each), played as buffers.
 *
 * Everything works on any BaseAudioContext, so the same code renders offline for verification.
 */
import { Rand, normalizePeak } from '../dsp/core';
import { cymbal, drumStroke, type DrumStroke } from '../dsp/instruments';
import { pluck } from '../dsp/pluck';

export interface MusicOutput {
  ctx: BaseAudioContext;
  /** Dry destination. */
  dry: AudioNode;
  /** Reverb send destination. */
  rev: AudioNode;
}

const BAKE_RATE = 32000;
const pcm = new Map<string, Float32Array>();
const buffers = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/** Baked sample data → AudioBuffer for this context (both cached). */
export function cachedBuffer(ctx: BaseAudioContext, key: string, rate: number, make: () => Float32Array): AudioBuffer {
  let m = buffers.get(ctx);
  if (!m) buffers.set(ctx, (m = new Map()));
  const hit = m.get(key);
  if (hit) return hit;
  let data = pcm.get(key);
  if (!data) pcm.set(key, (data = make()));
  const b = ctx.createBuffer(1, data.length, rate);
  b.getChannelData(0).set(data);
  m.set(key, b);
  return b;
}

/** Looping white noise for breath (1 s, shared per context). */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  return cachedBuffer(ctx, 'noise:1s', BAKE_RATE, () => {
    const r = new Rand('breath');
    const d = new Float32Array(BAKE_RATE);
    for (let i = 0; i < d.length; i++) d[i] = r.bi();
    return d;
  });
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

export class Lyre extends Instrument {
  constructor(
    out: MusicOutput,
    private readonly body: 'lyre' | 'kithara',
    opts = { gain: 0.5, pan: -0.25, reverb: 0.5 },
  ) {
    super(out, opts);
  }

  private buffer(freq: number, bright: number): AudioBuffer {
    const b = bright < 0.45 ? 0.35 : bright < 0.7 ? 0.6 : 0.85;
    const key = `${this.body}:${freq.toFixed(1)}:${b}`;
    return cachedBuffer(this.ctx, key, BAKE_RATE, () => {
      const t60 = Math.max(1.2, Math.min(4.5, 5 - freq / 150));
      const d = pluck(freq, BAKE_RATE, new Rand(key), { seconds: t60 * 0.85 + 0.1, t60, brightness: b, pluckPos: 0.12 + (1 - b) * 0.1, damping: 0.45, body: this.body });
      return normalizePeak(d, 0.6);
    });
  }

  /** Bake the notes of a scale ahead of time (avoids a hitch on the first pluck). */
  prepare(freqs: readonly number[], bright = 0.55) {
    for (const f of freqs) this.buffer(f, bright);
  }

  play(when: number, freq: number, vel: number, dur?: number, bright = 0.55) {
    // Notes shorter than ~0.6 s are damped by the hand (ostinati, dance strums); longer ones ring.
    const stop = dur !== undefined && dur < 0.6 ? when + dur : undefined;
    oneShot(this.ctx, this.buffer(freq, bright), this.input, when, vel, 1, stop, 0.08);
  }
}

// ---------------------------------------------------------------- aulos

export class Aulos extends Instrument {
  private readonly a: OscillatorNode;
  private readonly b: OscillatorNode;
  private readonly env: GainNode;
  private readonly vib: OscillatorNode;
  private readonly vibDepth: GainNode;
  private readonly breath: AudioBufferSourceNode;
  private lastEnd = -1;

  constructor(out: MusicOutput, opts = { gain: 0.32, pan: 0.15, reverb: 0.5 }) {
    super(out, opts);
    const ctx = this.ctx;
    this.a = ctx.createOscillator();
    this.b = ctx.createOscillator();
    this.a.type = this.b.type = 'sawtooth';
    this.b.detune.value = 6; // the two pipes are never perfectly matched
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 280;
    const reed = ctx.createBiquadFilter();
    reed.type = 'peaking';
    reed.frequency.value = 1150;
    reed.Q.value = 2.2;
    reed.gain.value = 9;
    const bore = ctx.createBiquadFilter();
    bore.type = 'peaking';
    bore.frequency.value = 2700;
    bore.Q.value = 2.5;
    bore.gain.value = 6;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4200;
    this.env = ctx.createGain();
    this.env.gain.value = 0;
    this.a.connect(mix);
    this.b.connect(mix);
    mix.connect(hp);
    hp.connect(reed);
    reed.connect(bore);
    bore.connect(lp);
    lp.connect(this.env);
    this.env.connect(this.input);
    // Breath noise through the same envelope.
    this.breath = ctx.createBufferSource();
    this.breath.buffer = noiseBuffer(ctx);
    this.breath.loop = true;
    const bbp = ctx.createBiquadFilter();
    bbp.type = 'bandpass';
    bbp.frequency.value = 2300;
    bbp.Q.value = 1;
    const bg = ctx.createGain();
    bg.gain.value = 0.06;
    this.breath.connect(bbp);
    bbp.connect(bg);
    bg.connect(this.env);
    // Vibrato in cents on both pipes.
    this.vib = ctx.createOscillator();
    this.vib.frequency.value = 5.3;
    this.vibDepth = ctx.createGain();
    this.vibDepth.gain.value = 0;
    this.vib.connect(this.vibDepth);
    this.vibDepth.connect(this.a.detune);
    this.vibDepth.connect(this.b.detune);
    const t = ctx.currentTime;
    this.a.start(t);
    this.b.start(t);
    this.vib.start(t);
    this.breath.start(t);
  }

  note(when: number, freq: number, dur: number, vel: number, legato: boolean, release: boolean) {
    const fa = this.a.frequency;
    const fb = this.b.frequency;
    const g = this.env.gain;
    const slur = legato && when - this.lastEnd < 0.08;
    if (slur) {
      fa.setTargetAtTime(freq, when, 0.012);
      fb.setTargetAtTime(freq, when, 0.012);
    } else {
      // Tongued attack: a breath of silence, then a quick rise with a little pitch scoop.
      g.setTargetAtTime(0, Math.max(this.lastEnd, when - 0.03), 0.006);
      fa.setValueAtTime(freq * 0.985, when);
      fb.setValueAtTime(freq * 0.985, when);
      fa.setTargetAtTime(freq, when, 0.02);
      fb.setTargetAtTime(freq, when, 0.02);
    }
    g.setTargetAtTime(vel, when, slur ? 0.02 : 0.012);
    const v = this.vibDepth.gain;
    v.setTargetAtTime(0, when, 0.04);
    if (dur > 0.45) v.setTargetAtTime(10 + 12 * vel, when + 0.3, 0.12);
    if (release) g.setTargetAtTime(0, when + dur, 0.045);
    this.lastEnd = when + dur;
  }

  override dispose(when: number) {
    this.env.gain.setTargetAtTime(0, when, 0.05);
    for (const o of [this.a, this.b, this.vib, this.breath]) o.stop(when + 0.4);
    super.dispose(when + 0.4);
  }
}

// ---------------------------------------------------------------- syrinx

export class Syrinx extends Instrument {
  private readonly osc: OscillatorNode;
  private readonly env: GainNode;
  private readonly noiseEnv: GainNode;
  private readonly bp: BiquadFilterNode;
  private readonly noise: AudioBufferSourceNode;
  private readonly h2: OscillatorNode;
  private lastEnd = -1;

  constructor(out: MusicOutput, opts = { gain: 0.45, pan: -0.1, reverb: 0.6 }) {
    super(out, opts);
    const ctx = this.ctx;
    this.osc = ctx.createOscillator();
    this.osc.type = 'sine';
    this.h2 = ctx.createOscillator();
    this.h2.type = 'sine';
    const h2g = ctx.createGain();
    h2g.gain.value = 0.1;
    this.env = ctx.createGain();
    this.env.gain.value = 0;
    this.osc.connect(this.env);
    this.h2.connect(h2g);
    h2g.connect(this.env);
    this.env.connect(this.input);
    this.noise = ctx.createBufferSource();
    this.noise.buffer = noiseBuffer(ctx);
    this.noise.loop = true;
    this.bp = ctx.createBiquadFilter();
    this.bp.type = 'bandpass';
    this.bp.Q.value = 7;
    this.noiseEnv = ctx.createGain();
    this.noiseEnv.gain.value = 0;
    this.noise.connect(this.bp);
    this.bp.connect(this.noiseEnv);
    this.noiseEnv.connect(this.input);
    const t = ctx.currentTime;
    this.osc.start(t);
    this.h2.start(t);
    this.noise.start(t);
  }

  note(when: number, freq: number, dur: number, vel: number, legato: boolean, release: boolean) {
    const slur = legato && when - this.lastEnd < 0.08;
    const f = this.osc.frequency;
    const f2 = this.h2.frequency;
    if (slur) {
      f.setTargetAtTime(freq, when, 0.025);
      f2.setTargetAtTime(freq * 2, when, 0.025);
    } else {
      this.env.gain.setTargetAtTime(0, Math.max(this.lastEnd, when - 0.03), 0.008);
      f.setValueAtTime(freq * 0.98, when);
      f2.setValueAtTime(freq * 1.96, when);
      f.setTargetAtTime(freq, when, 0.025);
      f2.setTargetAtTime(freq * 2, when, 0.025);
    }
    this.bp.frequency.setValueAtTime(freq, when);
    this.env.gain.setTargetAtTime(vel * 0.7, when, 0.035);
    // Breathy "chiff" on the attack, then a softer breath that stays with the tone.
    this.noiseEnv.gain.setTargetAtTime(vel * (slur ? 0.25 : 0.9), when, 0.006);
    this.noiseEnv.gain.setTargetAtTime(vel * 0.22, when + 0.05, 0.04);
    if (release) {
      this.env.gain.setTargetAtTime(0, when + dur, 0.06);
      this.noiseEnv.gain.setTargetAtTime(0, when + dur, 0.05);
    }
    this.lastEnd = when + dur;
  }

  override dispose(when: number) {
    this.env.gain.setTargetAtTime(0, when, 0.05);
    this.noiseEnv.gain.setTargetAtTime(0, when, 0.05);
    for (const o of [this.osc, this.h2, this.noise]) o.stop(when + 0.4);
    super.dispose(when + 0.4);
  }
}

// ---------------------------------------------------------------- drone

/** The aulos' second pipe holding the final (or a low reed drone). */
export class Drone extends Instrument {
  private readonly a: OscillatorNode;
  private readonly b: OscillatorNode;
  private readonly env: GainNode;

  constructor(out: MusicOutput, opts = { gain: 0.22, pan: 0.05, reverb: 0.6 }) {
    super(out, opts);
    const ctx = this.ctx;
    this.a = ctx.createOscillator();
    this.b = ctx.createOscillator();
    this.a.type = 'sawtooth';
    this.b.type = 'sawtooth';
    this.b.detune.value = -5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.Q.value = 0.8;
    const reed = ctx.createBiquadFilter();
    reed.type = 'peaking';
    reed.frequency.value = 700;
    reed.Q.value = 1.5;
    reed.gain.value = 5;
    this.env = ctx.createGain();
    this.env.gain.value = 0;
    this.a.connect(lp);
    this.b.connect(lp);
    lp.connect(reed);
    reed.connect(this.env);
    this.env.connect(this.input);
    const t = ctx.currentTime;
    this.a.start(t);
    this.b.start(t);
  }

  set(when: number, freq: number | null, vel: number) {
    if (freq) {
      this.a.frequency.setTargetAtTime(freq, when, 0.05);
      this.b.frequency.setTargetAtTime(freq * 1.5, when, 0.05); // and its fifth, quietly
    }
    this.env.gain.setTargetAtTime(freq ? vel : 0, when, freq ? 0.6 : 0.8);
  }

  override dispose(when: number) {
    this.env.gain.setTargetAtTime(0, when, 0.1);
    this.a.stop(when + 0.6);
    this.b.stop(when + 0.6);
    super.dispose(when + 0.6);
  }
}

// ---------------------------------------------------------------- percussion

export class Tympanum extends Instrument {
  private rnd = new Rand('tympanum');
  constructor(out: MusicOutput, opts = { gain: 0.7, pan: 0.2, reverb: 0.35 }) {
    super(out, opts);
  }
  hit(when: number, stroke: DrumStroke, vel: number) {
    const v = this.rnd.int(0, 2);
    const key = `drum:${stroke}:${v}`;
    const buf = cachedBuffer(this.ctx, key, BAKE_RATE, () => normalizePeak(drumStroke(stroke, BAKE_RATE, new Rand(key), { f0: 92 }), 0.8));
    oneShot(this.ctx, buf, this.input, when, vel, 1 + (this.rnd.next() - 0.5) * 0.02);
  }
}

export class Cymbala extends Instrument {
  private rnd = new Rand('cymbala');
  constructor(out: MusicOutput, opts = { gain: 0.2, pan: 0.35, reverb: 0.5 }) {
    super(out, opts);
  }
  hit(when: number, kind: 'ring' | 'choke', vel: number) {
    const v = this.rnd.int(0, 2);
    const key = `cym:${kind}:${v}`;
    const buf = cachedBuffer(this.ctx, key, BAKE_RATE, () => normalizePeak(cymbal(kind, BAKE_RATE, new Rand(key)), 0.8));
    oneShot(this.ctx, buf, this.input, when, vel);
  }
}
