#!/usr/bin/env node
/**
 * Builds the game's sound-effect files from the CC0 sources in .cache/sfx (see spec.mjs).
 *
 *   node scripts/sfx/build.mjs [--only steps,combat] [--out public/audio/sfx]
 *
 * For each group it renders every clip (mono, the group's rate, trimmed, peak-normalised), lays them
 * end to end with silence between, and encodes the strip to AAC (.m4a, the first choice) and MP3
 * (the fallback). manifest.json says where each sound's clips sit in the strip; the game cuts them
 * out after decoding. Beds are one clip each, with the ends crossfaded so the loop has no seam.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FFMPEG, decode, fade, peakOf, scale, trim } from './lib.mjs';
import { GROUPS } from './spec.mjs';

const root = new URL('../../.cache/sfx/', import.meta.url).pathname;
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const only = opt('--only', '')?.split(',').filter(Boolean);
const outDir = resolve(opt('--out', new URL('../../public/audio/sfx/', import.meta.url).pathname));
mkdirSync(outDir, { recursive: true });

const PAD = 0.15;

/** Linear-interpolation resample: ratio > 1 is faster and higher. */
function resample(a, ratio) {
  if (ratio === 1) return a;
  const n = Math.floor((a.length - 1) / ratio);
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * ratio;
    const k = Math.floor(p);
    const f = p - k;
    o[i] = a[k] * (1 - f) + a[k + 1] * f;
  }
  return o;
}

/** One clip (with its layers) as mono float samples, peak = gain * 0.9. */
function render(spec, rate) {
  const raw = (s) => {
    let a = decode(root + s.src, rate, s.fx ?? '');
    if (s.from != null || s.to != null) a = a.slice(Math.max(0, Math.round((s.from ?? 0) * rate)), s.to != null ? Math.round(s.to * rate) : undefined);
    return resample(a, s.pitch ?? 1);
  };
  let a = s0(raw(spec), rate, spec);
  for (const m of spec.mix ?? []) {
    const b = s0(raw(m), rate, m);
    const off = Math.round((m.delay ?? 0) * rate);
    const out = new Float32Array(Math.max(a.length, off + b.length));
    out.set(a);
    const g = (m.gain ?? 1) / Math.max(1e-6, peakOf(b));
    for (let i = 0; i < b.length; i++) out[off + i] += b[i] * g * peakOf(a);
    a = out;
  }
  if (spec.max) a = a.slice(0, Math.round(spec.max * rate));
  const pk = peakOf(a);
  if (pk === 0) throw new Error(`silent clip: ${spec.src}`);
  scale(a, (0.9 * (spec.gain ?? 1)) / pk);
  return fade(a, rate, 0.0008, spec.max ? 0.02 : 0.008);
}

/** Trim a source's silence (one-shots only; beds keep their length). */
function s0(a, rate, spec) {
  return spec.bed ? a : trim(a, rate);
}

/** Make a loop: crossfade the last `xf` seconds into the first `xf` (equal power) and drop the overlap. */
function loopify(a, rate, xf) {
  const n = Math.min(Math.round(xf * rate), Math.floor(a.length / 3));
  const len = a.length - n;
  const o = a.slice(0, len);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const wIn = Math.sin((t * Math.PI) / 2);
    const wOut = Math.cos((t * Math.PI) / 2);
    o[i] = a[i] * wIn + a[len + i] * wOut;
  }
  return o;
}

function writeWav(path, data, rate) {
  const buf = Buffer.alloc(44 + data.length * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + data.length * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); // IEEE float
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(32, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(data.length * 4, 40);
  Buffer.from(data.buffer, data.byteOffset, data.byteLength).copy(buf, 44);
  writeFileSync(path, buf);
}

const manifest = { version: 1, groups: {}, sounds: {} };
const tmp = join(outDir, '.tmp.wav');

for (const [name, g] of Object.entries(GROUPS)) {
  if (only?.length && !only.includes(name)) continue;
  const rate = g.rate;
  const pad = Math.round(PAD * rate);
  const pieces = [new Float32Array(pad)];
  let pos = pad;
  const cache = new Map();
  const place = (clip) => {
    const key = JSON.stringify(clip);
    if (cache.has(key)) return cache.get(key);
    let a;
    if (g.kind === 'bed') {
      a = decode(root + clip.src, rate, clip.fx ?? '');
      if (clip.from) a = a.slice(Math.round(clip.from * rate));
      a = resample(a, clip.pitch ?? 1);
      a = loopify(a, rate, g.loopFade);
      const pk = peakOf(a);
      scale(a, 0.8 / pk);
    } else a = render(clip, rate);
    const rec = [+(pos / rate).toFixed(4), +((pos + a.length) / rate).toFixed(4)];
    pieces.push(a, new Float32Array(pad));
    pos += a.length + pad;
    cache.set(key, rec);
    return rec;
  };
  const sounds = {};
  for (const [id, s] of Object.entries(g.sounds)) {
    if (s.alias) sounds[id] = { alias: s.alias };
    else sounds[id] = { kind: g.kind, clips: s.clips.map(place) };
  }
  const strip = new Float32Array(pos);
  let o = 0;
  for (const p of pieces) {
    strip.set(p, o);
    o += p.length;
  }
  writeWav(tmp, strip, rate);
  const m4a = `${name}.m4a`;
  const mp3 = `${name}.mp3`;
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', tmp, '-c:a', 'aac', '-b:a', `${g.bitrate}k`, '-movflags', '+faststart', join(outDir, m4a)]);
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', tmp, '-c:a', 'libmp3lame', '-b:a', `${g.bitrate}k`, join(outDir, mp3)]);
  manifest.groups[name] = { rate, m4a, mp3, seconds: +(pos / rate).toFixed(2), bytes: statSync(join(outDir, m4a)).size };
  for (const [id, s] of Object.entries(sounds)) {
    if (manifest.sounds[id]) throw new Error(`duplicate sound ${id}`);
    manifest.sounds[id] = { group: name, ...s };
  }
  console.log(`${name.padEnd(14)} ${Object.keys(sounds).length} sounds, ${cache.size} clips, ${(pos / rate).toFixed(1)} s, m4a ${(manifest.groups[name].bytes / 1024).toFixed(0)} KB, mp3 ${(statSync(join(outDir, mp3)).size / 1024).toFixed(0)} KB`);
}
try {
  unlinkSync(tmp);
} catch {}

// Merge with an existing manifest when building a subset.
import { readFileSync, existsSync } from 'node:fs';
const mpath = join(outDir, 'manifest.json');
if (only?.length && existsSync(mpath)) {
  const old = JSON.parse(readFileSync(mpath, 'utf8'));
  for (const k of Object.keys(old.groups)) if (!manifest.groups[k]) manifest.groups[k] = old.groups[k];
  for (const k of Object.keys(old.sounds)) if (!manifest.sounds[k] && !only.includes(old.sounds[k].group)) manifest.sounds[k] = old.sounds[k];
}
writeFileSync(mpath, JSON.stringify(manifest));
console.log(`manifest: ${Object.keys(manifest.sounds).length} sounds in ${Object.keys(manifest.groups).length} groups`);
