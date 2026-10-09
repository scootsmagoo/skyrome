/**
 * Verification without ears: renders every sound (all variants) and every music state through
 * real Web Audio in an OfflineAudioContext, then measures them. Run in the page, e.g.
 *
 *   node scripts/shot.mjs --scene audio --verbose --steps '[{"eval":"return game.audio.verify().then(r => { console.log(r.table); return r.summary; })"}]'
 *
 * Checks: no NaN, no clipping (peak < 0 dBFS), not silent, expected length, clean end, seamless
 * beds; music produces notes for 30 s with sane levels. Also measures HRTF vs equal-power cost.
 */
import { BED_RMS, SOUNDS, bakeRate, bakeTimes, getVariants } from '../bank';
import { dbToGain } from '../dsp/core';
import { analyze, rmsEnvelope, seamRatio, toDb } from '../dsp/analysis';
import { REVERBS, impulseResponse } from '../dsp/reverb';
import { MusicDirector, WebAudioRack, type Rack } from '../music/MusicDirector';
import { vsco } from '../music/vsco';
import { MUSIC_STATES, type MusicState } from '../music/styles';
import type { SoundDef } from '../sounds/types';

const RATE = 48000;

function offline(channels: number, seconds: number): OfflineAudioContext {
  const Ctor: typeof OfflineAudioContext = window.OfflineAudioContext ?? (window as any).webkitOfflineAudioContext;
  return new Ctor(channels, Math.max(1, Math.ceil(seconds * RATE)), RATE);
}

function toBuffer(ctx: BaseAudioContext, data: Float32Array, rate: number) {
  const b = ctx.createBuffer(1, data.length, rate);
  b.getChannelData(0).set(data);
  return b;
}

/** Mixdown of a rendered stereo buffer to mono (for analysis). */
function mono(b: AudioBuffer): Float32Array {
  const out = new Float32Array(b.length);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) out[i] += d[i] / b.numberOfChannels;
  }
  return out;
}

function stereoPeak(b: AudioBuffer): { peak: number; nan: number } {
  let peak = 0;
  let nan = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const x = d[i];
      if (!Number.isFinite(x)) nan++;
      else if (Math.abs(x) > peak) peak = Math.abs(x);
    }
  }
  return { peak, nan };
}

export interface SoundRow {
  id: string;
  variants: number;
  seconds: number;
  audible: number;
  peakDb: number;
  rmsDb: number;
  issues: string[];
}

/** Render one sound variant through a spatial chain (panner at 3 m, front-right) and measure it. */
export async function renderSound(def: SoundDef, variant: number): Promise<{ buf: AudioBuffer; data: Float32Array }> {
  const data = getVariants(def.id)![variant];
  const rate = bakeRate(def);
  const isBed = def.kind === 'bed';
  const seconds = isBed ? (data.length / rate) * 2 : data.length / rate + 0.05;
  const ctx = offline(2, seconds);
  const src = ctx.createBufferSource();
  src.buffer = toBuffer(ctx, data, rate);
  src.loop = isBed;
  const g = ctx.createGain();
  g.gain.value = 1; // measure the baked level; mix gains are checked separately
  src.connect(g);
  const p = ctx.createPanner();
  p.panningModel = 'equalpower';
  p.distanceModel = 'inverse';
  p.refDistance = 4;
  if (p.positionX) {
    p.positionX.value = 2;
    p.positionZ.value = -2.2;
  } else (p as any).setPosition(2, 0, -2.2);
  g.connect(p);
  p.connect(ctx.destination);
  src.start(0);
  const buf = await ctx.startRendering();
  return { buf, data };
}

export async function verifySounds(): Promise<{ rows: SoundRow[]; failures: string[] }> {
  const rows: SoundRow[] = [];
  const failures: string[] = [];
  for (const def of SOUNDS.values()) {
    const vars = getVariants(def.id)!;
    const rate = bakeRate(def);
    let worst: SoundRow | null = null;
    for (let v = 0; v < vars.length; v++) {
      const { buf, data } = await renderSound(def, v);
      const m = mono(buf);
      const sp = stereoPeak(buf);
      const s = analyze(m, RATE);
      const issues: string[] = [];
      if (sp.nan) issues.push(`${sp.nan} NaN`);
      if (sp.peak >= 1) issues.push(`clips (${toDb(sp.peak).toFixed(1)} dB)`);
      if (s.rms < (def.kind === 'bed' ? BED_RMS * 0.25 : 0.002)) issues.push('silent');
      if (def.kind === 'oneshot') {
        const a = analyze(data, rate);
        if (a.tail > 0.01) issues.push(`click at end (${a.tail.toFixed(3)})`);
        if (def.expect?.dur && (a.audible < def.expect.dur[0] || a.audible > def.expect.dur[1] + 0.02)) issues.push(`length ${a.audible.toFixed(2)}s ∉ [${def.expect.dur}]`);
      } else {
        // Seam: the jump from the last sample back to the first vs the typical step (≈1 is seamless).
        const r = seamRatio(data);
        if (r > 8) issues.push(`loop seam ×${r.toFixed(1)}`);
      }
      const row: SoundRow = { id: def.id, variants: vars.length, seconds: s.seconds, audible: s.audible, peakDb: toDb(sp.peak), rmsDb: s.rmsDb, issues };
      if (!worst || issues.length > worst.issues.length || row.peakDb > worst.peakDb) worst = row;
      if (issues.length) failures.push(`${def.id}#${v}: ${issues.join(', ')}`);
    }
    rows.push(worst!);
  }
  return { rows, failures };
}

export interface MusicRow {
  state: MusicState;
  seconds: number;
  events: number;
  byPart: Record<string, number>;
  peakDb: number;
  rmsDb: number;
  /** Fraction of 1 s windows below -50 dBFS. */
  silent: number;
  renderMs: number;
  issues: string[];
}

/** Render `seconds` of one music state offline through the real instruments and music reverb. */
export async function renderMusic(state: Exclude<MusicState, 'silence'>, seconds = 30): Promise<{ row: MusicRow; buf: AudioBuffer }> {
  const ctx = offline(2, seconds);
  const dry = ctx.createGain();
  const rev = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.normalize = false;
  const [l, r] = impulseResponse(REVERBS.music, RATE);
  const ir = ctx.createBuffer(2, l.length, RATE);
  ir.getChannelData(0).set(l);
  ir.getChannelData(1).set(r);
  conv.buffer = ir;
  rev.connect(conv);
  conv.connect(dry);
  dry.connect(ctx.destination);
  const byPart: Record<string, number> = {};
  const director = new MusicDirector();
  director.makeRack = (out, s) => {
    const real = new WebAudioRack(out, s, { sync: true }); // offline: nothing can wait for the worker
    const count = (k: string) => (byPart[k] = (byPart[k] ?? 0) + 1);
    const rack: Rack = {
      melody: (inst, ...a) => (count(inst), real.melody(inst, ...a)),
      lyre: (...a) => (count('lyre'), real.lyre(...a)),
      drum: (...a) => (count('drum'), real.drum(...a)),
      cymbal: (...a) => (count('cymbal'), real.cymbal(...a)),
      drone: (...a) => (count('drone'), real.drone(...a)),
      level: (...a) => real.level(...a),
      prepare: (...a) => real.prepare(...a),
      dispose: (...a) => real.dispose(...a),
    };
    return rack;
  };
  director.attach({ ctx, dry, rev }, { offline: true });
  await vsco.loadAll(); // offline: the performer cannot wait for the recordings to arrive
  director.setState(state);
  director.pump(seconds);
  const t0 = performance.now();
  const buf = await ctx.startRendering();
  const renderMs = performance.now() - t0;
  const m = mono(buf);
  const sp = stereoPeak(buf);
  const env = rmsEnvelope(m, RATE, 1);
  const silent = env.filter((x) => x < dbToGain(-50)).length / env.length;
  const s = analyze(m, RATE);
  const events = Object.values(byPart).reduce((a, b) => a + b, 0);
  const issues: string[] = [];
  if (sp.nan) issues.push(`${sp.nan} NaN`);
  if (sp.peak >= 1) issues.push('clips');
  if (events < (state === 'explore-night' ? 8 : 20)) issues.push(`only ${events} events`);
  if ((state === 'combat' || state === 'tavern' || state === 'tension' || state === 'temple') && silent > 0.1) issues.push(`${(silent * 100).toFixed(0)}% silent`);
  director.dispose();
  return { row: { state, seconds, events, byPart, peakDb: toDb(sp.peak), rmsDb: s.rmsDb, silent, renderMs, issues }, buf };
}

export async function verifyMusic(seconds = 30): Promise<MusicRow[]> {
  const rows: MusicRow[] = [];
  for (const s of MUSIC_STATES) if (s !== 'silence') rows.push((await renderMusic(s, seconds)).row);
  return rows;
}

/** CPU cost of panning models: render 32 moving-free noise voices for 10 s offline. */
export async function measurePanning(voices = 32, seconds = 10) {
  const out: Record<string, number> = {};
  for (const model of ['equalpower', 'HRTF'] as const) {
    const ctx = offline(2, seconds);
    const noise = ctx.createBuffer(1, RATE, RATE);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (let k = 0; k < voices; k++) {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0.02;
      const p = ctx.createPanner();
      p.panningModel = model;
      const a = (k / voices) * Math.PI * 2;
      if (p.positionX) {
        p.positionX.value = Math.cos(a) * 5;
        p.positionZ.value = Math.sin(a) * 5;
      } else (p as any).setPosition(Math.cos(a) * 5, 0, Math.sin(a) * 5);
      s.connect(g);
      g.connect(p);
      p.connect(ctx.destination);
      s.start(0);
    }
    const t0 = performance.now();
    await ctx.startRendering();
    out[model] = performance.now() - t0;
  }
  return {
    voices,
    seconds,
    equalpowerMs: Math.round(out.equalpower),
    hrtfMs: Math.round(out.HRTF),
    /** % of one core per voice in real time (render ms / audio ms / voices). */
    equalpowerPctPerVoice: +((out.equalpower / (seconds * 1000) / voices) * 100).toFixed(3),
    hrtfPctPerVoice: +((out.HRTF / (seconds * 1000) / voices) * 100).toFixed(3),
  };
}

export async function verifyAll(opts: { music?: boolean; seconds?: number; sounds?: boolean } = {}) {
  const t0 = performance.now();
  const sounds = opts.sounds === false ? { rows: [], failures: [] } : await verifySounds();
  const music = opts.music === false ? [] : await verifyMusic(opts.seconds ?? 30);
  const panning = await measurePanning();
  let bakeMs = 0;
  for (const t of bakeTimes.values()) bakeMs += t;
  const lines: string[] = [];
  lines.push('id                        var  len(s)  audible  peak dB   rms dB   issues');
  for (const r of sounds.rows)
    lines.push(`${r.id.padEnd(24)} ${String(r.variants).padStart(4)} ${r.seconds.toFixed(2).padStart(7)} ${r.audible.toFixed(2).padStart(8)} ${r.peakDb.toFixed(1).padStart(8)} ${r.rmsDb.toFixed(1).padStart(8)}   ${r.issues.join('; ') || 'ok'}`);
  lines.push('');
  lines.push('music state     events  aulos syrinx  lyre  drum  cymb  drone   peak dB  rms dB  silent  render ms  issues');
  for (const m of music) {
    const b = m.byPart;
    lines.push(
      `${m.state.padEnd(14)} ${String(m.events).padStart(7)} ${String(b.aulos ?? 0).padStart(6)} ${String(b.syrinx ?? 0).padStart(6)} ${String(b.lyre ?? 0).padStart(5)} ${String(b.drum ?? 0).padStart(5)} ${String(b.cymbal ?? 0).padStart(5)} ${String(b.drone ?? 0).padStart(6)} ${m.peakDb.toFixed(1).padStart(9)} ${m.rmsDb.toFixed(1).padStart(7)} ${(m.silent * 100).toFixed(0).padStart(6)}% ${m.renderMs.toFixed(0).padStart(9)}   ${m.issues.join('; ') || 'ok'}`,
    );
  }
  lines.push('');
  lines.push(`panning (${panning.voices} voices × ${panning.seconds}s offline): equalpower ${panning.equalpowerMs} ms, HRTF ${panning.hrtfMs} ms → per voice ${panning.equalpowerPctPerVoice}% vs ${panning.hrtfPctPerVoice}% of a core`);
  lines.push(`bake total ${bakeMs.toFixed(0)} ms for ${SOUNDS.size} sounds`);
  const failures = [...sounds.failures, ...music.flatMap((m) => m.issues.map((i) => `music ${m.state}: ${i}`))];
  const summary = {
    sounds: sounds.rows.length,
    variants: sounds.rows.reduce((a, r) => a + r.variants, 0),
    music: music.map((m) => `${m.state}:${m.events}ev/${m.rmsDb.toFixed(0)}dB`),
    failures,
    panning,
    bakeMs: Math.round(bakeMs),
    totalMs: Math.round(performance.now() - t0),
  };
  return { table: lines.join('\n'), summary, sounds: sounds.rows, music };
}
