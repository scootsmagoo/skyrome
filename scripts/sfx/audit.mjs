#!/usr/bin/env node
/**
 * Audit of every shipped sample, measured the way the engine plays it.
 *
 *   node --experimental-strip-types scripts/sfx/audit.mjs [--md docs/research/audio-audit.md] [--json out.json]
 *
 * Each clip is cut from its strip (public/audio/sfx), then finished with the same rules as
 * src/audio/samples.ts finishSample (peak 0.9, 50 ms loudness 0.2, fades). Reported per sound:
 *   LUFS   K-weighted (ITU-R BS.1770) loudest 200 ms of a finished one-shot (400 ms for a bed; clips
 *          shorter than the window are averaged over it), mean over the variants
 *   eff    LUFS plus the sound's gainDb: the level it actually has in the mix
 *   cen    spectral centroid (Hz, power-weighted, 60 Hz - 16 kHz), mean of the variants
 *   hf     share of energy above 5 kHz (harshness), mean of the variants
 *   peak   sample peak after finishing (dBFS); true pk the 4x-oversampled true peak
 *   edge   worst start/end discontinuity in the strip clip as a fraction of its peak (click risk)
 *   clip   number of strip samples at or above 0.999
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, lufsMax, peakOf, spectrum, truePeak } from './dsp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const dir = resolve(root, 'public/audio/sfx');
const man = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
const { applyTone } = await import('../../src/audio/sampleTone.ts');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';

// ---- gainDb per sound, read from the sound definitions
const gain = {};
{
  const fs = readFileSync(resolve(root, 'src/audio/sounds/footsteps.ts'), 'utf8');
  const table = (name) => {
    const o = {};
    for (const m of fs.match(new RegExp(name + '[^=]*=\\s*\\{([^}]*)\\}'))[1].matchAll(/(\w+):\s*(-?\d+(?:\.\d+)?)/g)) o[m[1]] = +m[2];
    return o;
  };
  const SG = table('SURFACE_GAIN');
  const GG = table('GAIT_GAIN');
  const base = +fs.match(/gainDb: (-?\d+) \+ SURFACE_GAIN\[surface\] \+ GAIT_GAIN/)[1];
  const land = +fs.match(/gainDb: (-?\d+) \+ SURFACE_GAIN\[surface\],/)[1];
  for (const s of Object.keys(SG)) {
    for (const g of Object.keys(GG)) gain[`step.${s}.${g}`] = base + SG[s] + GG[g];
    gain[`land.${s}`] = land + SG[s];
  }
}
for (const f of readdirSync(resolve(root, 'src/audio/sounds'))) {
  const t = readFileSync(resolve(root, 'src/audio/sounds', f), 'utf8');
  for (const line of t.split('\n')) {
    const m = line.match(/id: '([\w.]+)'.*?gainDb: (-?\d+(?:\.\d+)?)/);
    if (m) gain[m[1]] = +m[2];
  }
}

// ---- DSP
function decode(path, rate) {
  const b = execFileSync(FFMPEG, ['-v', 'error', '-i', path, '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], { maxBuffer: 1 << 29 });
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}
/** Same rules as samples.ts finishSample (one-shots). */
function finish(buf, rate) {
  let pk = peakOf(buf);
  const th = pk * Math.pow(10, -50 / 20);
  let s = 0;
  while (s < buf.length && Math.abs(buf[s]) < th) s++;
  let out = Float32Array.from(buf.subarray(Math.max(0, s - Math.round(0.002 * rate))));
  const r = Math.exp((-2 * Math.PI * 18) / rate);
  let px = 0, py = 0;
  for (let i = 0; i < out.length; i++) {
    const x = out[i];
    py = x - px + r * py;
    px = x;
    out[i] = py;
  }
  pk = peakOf(out);
  for (let i = 0; i < out.length; i++) out[i] *= 0.9 / (pk || 1);
  let e = out.length - 1;
  while (e > 0 && Math.abs(out[e]) < 2e-4) e--;
  out = out.slice(0, Math.min(out.length, e + 1 + Math.round(0.01 * rate)));
  const n = Math.max(1, Math.round(0.05 * rate));
  let acc = 0, best = 0;
  for (let i = 0; i < out.length; i++) {
    acc += out[i] * out[i];
    if (i >= n) acc -= out[i - n] * out[i - n];
    if (acc > best) best = acc;
  }
  const rms = Math.sqrt(best / Math.min(n, out.length));
  let g = rms > 1e-9 ? 0.2 / rms : 1;
  pk = peakOf(out);
  if (pk * g > 0.95) g = 0.95 / pk;
  for (let i = 0; i < out.length; i++) out[i] *= g;
  const fi = Math.round(0.0003 * rate), fo = Math.round(0.008 * rate);
  for (let i = 0; i < Math.min(fi, out.length); i++) out[i] *= i / fi;
  for (let i = 0; i < Math.min(fo, out.length); i++) out[out.length - 1 - i] *= i / fo;
  return out;
}

// ---- run
const strips = {};
const rows = [];
const mean = (x) => x.reduce((q, v) => q + v, 0) / x.length;
for (const [id, e0] of Object.entries(man.sounds)) {
  const e = e0.alias ? man.sounds[e0.alias] : e0;
  if (!e?.clips) continue;
  const grp = man.groups[e.group];
  strips[e.group] ??= decode(resolve(dir, grp.m4a), grp.rate);
  const strip = strips[e.group];
  const rate = grp.rate;
  const L = [], C = [], H = [], P = [], T = [], D = [];
  let edge = 0, clip = 0;
  for (const [a, b] of e.clips) {
    const s = Math.max(0, Math.floor((a - 0.04) * rate));
    const t = Math.min(strip.length, Math.ceil((b + 0.04) * rate));
    const raw = strip.slice(s, t);
    const core = strip.slice(Math.floor(a * rate), Math.ceil(b * rate));
    const pk = peakOf(core) || 1;
    edge = Math.max(edge, Math.abs(core[0] ?? 0) / pk, Math.abs(core[core.length - 1] ?? 0) / pk);
    for (let i = 0; i < core.length; i++) if (Math.abs(core[i]) >= 0.999) clip++;
    if (e.kind === 'bed') {
      const sp = spectrum(core, rate);
      L.push(lufsMax(core, rate)); C.push(sp.cen); H.push(sp.hf); P.push(db(pk)); T.push(db(pk)); D.push(core.length / rate);
      continue;
    }
    const f = finish(applyTone(raw, rate, id), rate);
    const sp = spectrum(f, rate);
    L.push(lufsMax(f, rate, 0.2)); C.push(sp.cen); H.push(sp.hf); P.push(db(peakOf(f))); T.push(db(truePeak(f))); D.push(f.length / rate);
  }
  const g = e.kind === 'bed' ? undefined : gain[id];
  rows.push({
    id, alias: e0.alias, group: e.group, n: e.clips.length, kind: e.kind, dMin: Math.min(...D), dMax: Math.max(...D),
    lufs: mean(L), lufsMin: Math.min(...L), lufsMax: Math.max(...L), gain: g, eff: g === undefined ? undefined : mean(L) + g,
    cen: mean(C), cenMin: Math.min(...C), cenMax: Math.max(...C), hf: mean(H), hfMax: Math.max(...H),
    pk: Math.max(...P), tp: Math.max(...T), edge, clip,
  });
}
if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(rows, null, 1));

// ---- markdown
const f1 = (x) => (x === undefined ? '-' : x.toFixed(1));
let md = '';
for (const g of [...new Set(rows.map((r) => r.group))]) {
  md += `\n### ${g}\n\n| sound | n | dur s | LUFS (min..max) | gain | eff | centroid Hz (min..max) | HF>5k % (max) | peak | true pk | edge | clip |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of rows.filter((r) => r.group === g && !r.alias)) {
    md += `| ${r.id} | ${r.n} | ${r.dMin.toFixed(2)}-${r.dMax.toFixed(2)} | ${f1(r.lufs)} (${f1(r.lufsMin)}..${f1(r.lufsMax)}) | ${f1(r.gain)} | ${f1(r.eff)} | ${r.cen.toFixed(0)} (${r.cenMin.toFixed(0)}..${r.cenMax.toFixed(0)}) | ${(r.hf * 100).toFixed(1)} (${(r.hfMax * 100).toFixed(1)}) | ${f1(r.pk)} | ${f1(r.tp)} | ${r.edge.toFixed(3)} | ${r.clip} |\n`;
  }
}
if (opt('--md')) writeFileSync(opt('--md'), md);
else console.log(md);
