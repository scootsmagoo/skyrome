#!/usr/bin/env node
/**
 * Writes public/audio/sfx/CREDITS.md: the sources with their licences, and for every recorded sound
 * the group it lives in and the files it is cut from (the listening checklist).
 *
 *   node scripts/sfx/credits.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { GROUPS, SOURCES } from './spec.mjs';

const dir = new URL('../../public/audio/sfx/', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(dir + 'manifest.json', 'utf8'));

const short = (p) => p.replace(/^.*\//, '').replace(/\.(ogg|wav|flac|mp3)$/, '');
const files = (clips) => {
  const seen = [];
  const add = (c) => {
    const f = short(c.src) + (c.from != null || c.to != null ? '*' : '');
    if (!seen.includes(f)) seen.push(f);
    for (const m of c.mix ?? []) add(m);
  };
  clips.forEach(add);
  return seen;
};

const lines = [];
lines.push('# Sound effects: sources and credits', '');
lines.push('Every recording in this folder is public domain (CC0). They were cut, filtered, pitched, layered and packed into the strips here by `scripts/sfx/build.mjs` (what goes into each sound is in `scripts/sfx/spec.mjs`); the originals are not shipped. Licences were read on each source page on 2026-10-09 and are quoted below.', '');
lines.push('| Source | Page | Licence as stated |', '|---|---|---|');
for (const s of SOURCES) lines.push(`| ${s.name}${s.author ? ` (${s.author})` : ''} | ${s.url} | ${s.licence} |`);
lines.push('', 'Notes on the licences:', '');
lines.push('- Kenney packs: the pack\'s `License.txt` reads "License: (Creative Commons Zero, CC0) http://creativecommons.org/publicdomain/zero/1.0/ ... free to use in personal, educational and commercial projects. Support us by crediting Kenney or www.kenney.nl (this is not mandatory)".');
lines.push('- Fantasy Weapons and Apparel: `readme.txt` reads "Distributed under Creative Commons Zero: https://creativecommons.org/publicdomain/zero/1.0/" (WolfTech / vehiclemusic.eu).');
lines.push('- 3 Melee sounds: `melee.txt` reads "Free for *any* use. This means that the files are in the public domain, Gemeindegut, cc0-licensed or WTFPL-licensed" (original by qubodup / Iwan Gabovitch, edited by remaxim); the page lists CC0.');
lines.push('- Footsteps (leather, cloth, armor): the page lists two licences, "OGA-BY 3.0" and "CC0"; the files are used under CC0.');
lines.push("- Fantozzi's Footsteps: the page says the steps were taken from freesound.org/people/Fantozzi under CC0.");
lines.push('- The other OpenGameArt pages list "License(s): CC0".', '');
lines.push('## Groups', '', '| Strip | Rate | Length | m4a | mp3 |', '|---|---|---|---|---|');
for (const [n, g] of Object.entries(manifest.groups)) lines.push(`| ${n} | ${g.rate} Hz | ${g.seconds} s | ${n}.m4a (${Math.round(g.bytes / 1024)} KB) | ${n}.mp3 |`);
lines.push('', '## What each sound is made of (listening checklist)', '');
lines.push('`*` marks a source used in part (a range cut from a longer recording). Variants are the clips the game rotates through; walk and run share their footfalls.', '');
lines.push('| Sound id | Strip | Variants | Source files |', '|---|---|---|---|');
for (const [gname, g] of Object.entries(GROUPS)) {
  for (const [id, s] of Object.entries(g.sounds)) {
    if (s.alias) lines.push(`| ${id} | ${gname} | = ${s.alias} | (same recordings) |`);
    else lines.push(`| ${id} | ${gname} | ${s.clips.length} | ${files(s.clips).join(', ')} |`);
  }
}
lines.push('', '## Still synthesised (no recording fits)', '');
lines.push('`vox.*` (grunts, cries, effort), `bow.twang`, `sling.whirl`, `sling.release`, the three instrument stingers (`stinger.*`: cornu, kithara, syrinx, which suit Rome better than any UI chime), and the ambience events (`amb.*`) and beds for fire, wind, city, cicadas and crickets. These are baked in code (`src/audio/sounds/`), as are the stand-ins used while a recording loads or if it cannot.', '');
writeFileSync(dir + 'CREDITS.md', lines.join('\n'));
console.log(`CREDITS.md: ${lines.length} lines`);
