// node scripts/sfx/calls.mjs [--write]: cut the birdsong bed into separate calls.
//
// The recorded bed ("bed.birds") is 29 s of a woodland dawn chorus. Played as a loop it is a wall of
// birds; the game wants single calls, placed around the listener. This finds the calls in the strip
// (a 10 ms RMS envelope in the 1.5-9 kHz band, gaps of at least 0.12 s between calls, phrases kept
// whole up to 2.5 s), and with --write adds them to the manifest as the one-shot "amb.birdcall"
// (they live in the same strip, so no new audio file).
import { readFileSync, writeFileSync } from 'node:fs';
import { decode, db, rmsOf } from './lib.mjs';

const dir = new URL('../../public/audio/sfx/', import.meta.url).pathname;
const mf = dir + 'manifest.json';
const m = JSON.parse(readFileSync(mf, 'utf8'));
const g = m.groups['bed-birds'];
const rate = g.rate;
const a = decode(dir + g.m4a, rate, 'highpass=f=1500,lowpass=f=9000');
const [bs, be] = m.sounds['bed.birds'].clips[0];
const hop = Math.round(0.01 * rate);
const env = [];
for (let i = Math.round(bs * rate); i + hop <= Math.round(be * rate); i += hop) env.push(db(rmsOf(a, i, i + hop)));
const sorted = [...env].sort((x, y) => x - y);
const floor = sorted[Math.floor(sorted.length * 0.2)];
const peak = sorted[Math.floor(sorted.length * 0.99)];
const thr = Math.max(floor + 9, peak - 22);
console.log(`env floor ${floor.toFixed(1)} dB, p99 ${peak.toFixed(1)} dB, threshold ${thr.toFixed(1)} dB`);

// Active frames, merged across short gaps, then kept if a usable length.
const GAP = 12; // 0.12 s
const regions = [];
let cur = null;
let quiet = 0;
env.forEach((v, i) => {
  if (v > thr) {
    if (!cur) cur = { s: i, e: i, pk: v };
    cur.e = i;
    cur.pk = Math.max(cur.pk, v);
    quiet = 0;
  } else if (cur && ++quiet > GAP) {
    regions.push(cur);
    cur = null;
  }
});
if (cur) regions.push(cur);
const calls = regions
  .map((r) => ({ from: bs + Math.max(0, r.s - 3) * 0.01, to: bs + (r.e + 6) * 0.01, pk: r.pk }))
  // (the first and last 2 s of the strip are the loop's crossfade: half a bird at half volume)
  .filter((r) => r.to - r.from >= 0.2 && r.to - r.from <= 2.5 && r.from >= bs + 2.1 && r.to <= be - 2.1)
  .sort((x, y) => y.pk - x.pk)
  .slice(0, 24)
  .sort((x, y) => x.from - y.from);
console.log(`${regions.length} regions, ${calls.length} kept`);
for (const c of calls) console.log(`${c.from.toFixed(2)}-${c.to.toFixed(2)} (${(c.to - c.from).toFixed(2)} s) peak ${c.pk.toFixed(1)} dB`);
if (process.argv.includes('--write')) {
  m.sounds['amb.birdcall'] = { group: 'bed-birds', kind: 'oneshot', clips: calls.map((c) => [+c.from.toFixed(3), +c.to.toFixed(3)]) };
  writeFileSync(mf, JSON.stringify(m));
  console.log(`wrote ${calls.length} clips to amb.birdcall`);
}
