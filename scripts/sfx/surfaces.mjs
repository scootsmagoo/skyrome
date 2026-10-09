// node scripts/sfx/surfaces.mjs [group]: brightness (proxy for spectral centroid, Hz) of every clip in a built group.
import { readFileSync } from 'node:fs';
import { decode, centroid } from './lib.mjs';

const dir = new URL('../../public/audio/sfx/', import.meta.url).pathname;
const m = JSON.parse(readFileSync(dir + 'manifest.json', 'utf8'));
const name = process.argv[2] ?? 'steps';
const g = m.groups[name];
const a = decode(dir + g.m4a, g.rate);
for (const [id, e] of Object.entries(m.sounds)) {
  if (e.group !== name || e.alias) continue;
  const cs = e.clips.map(([s, t]) => centroid(a.slice(Math.round(s * g.rate), Math.round(t * g.rate)), g.rate));
  console.log(id.padEnd(22), cs.map((x) => x.toFixed(0)).join(' '));
}
