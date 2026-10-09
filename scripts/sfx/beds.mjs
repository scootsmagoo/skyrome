// node scripts/sfx/beds.mjs: how steady each built bed is (RMS per half second, dB, over the loop) and its loop seam.
import { readFileSync } from 'node:fs';
import { decode, db, rmsOf } from './lib.mjs';

const dir = new URL('../../public/audio/sfx/', import.meta.url).pathname;
const m = JSON.parse(readFileSync(dir + 'manifest.json', 'utf8'));
for (const [id, e] of Object.entries(m.sounds)) {
  if (e.kind !== 'bed') continue;
  const g = m.groups[e.group];
  const a = decode(dir + g.m4a, g.rate);
  const [s, t] = e.clips[0];
  const b = a.slice(Math.round(s * g.rate), Math.round(t * g.rate));
  const w = Math.round(0.5 * g.rate);
  const levels = [];
  for (let i = 0; i + w <= b.length; i += w) levels.push(db(rmsOf(b, i, i + w)));
  const seam = Math.abs(b[0] - b[b.length - 1]);
  console.log(`${id.padEnd(14)} ${(b.length / g.rate).toFixed(1)}s  rms/0.5s min ${Math.min(...levels).toFixed(1)} max ${Math.max(...levels).toFixed(1)} dB  seam step ${seam.toFixed(3)}`);
}
