// node scripts/sfx/probe.mjs <glob-ish substring...>: peak, rms, brightness and onsets of cached sources.
import { readFileSync } from 'node:fs';
import { decode, peakOf, rmsOf, centroid, onsets, db, trim } from './lib.mjs';

const root = new URL('../../.cache/sfx/', import.meta.url).pathname;
const inv = readFileSync(process.argv[2], 'utf8').split('\n').map((l) => l.split('\t')[0]);
const pats = process.argv.slice(3);
for (const f of inv) {
  if (!pats.some((p) => f.includes(p))) continue;
  const a = trim(decode(root + f, 32000), 32000);
  const on = onsets(a, 32000);
  console.log(`${f.slice(-52).padEnd(52)} ${(a.length / 32000).toFixed(2)}s pk ${db(peakOf(a)).toFixed(0)} rms ${db(rmsOf(a)).toFixed(0)} bright ${centroid(a, 32000).toFixed(0)} on ${on.length}`);
}
