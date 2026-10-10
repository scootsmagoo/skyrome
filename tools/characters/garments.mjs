#!/usr/bin/env node
/**
 * Rebuilds the baked garments:  node tools/characters/garments.mjs [male|female] [--only=toga,stola] [--preview]
 *
 * Runs tools/characters/garments.py in Blender, one process per garment in parallel: first the garments worn next
 * to the body, then the ones simulated over them (a cloak over the tunic, the palla over the stola; garments.py's
 * UNDER table), then merges each sex into public/models/garments/<sex>.glb. About 10 minutes on an M4 Max (the toga
 * and the toga velata take the longest). Results and Blender logs are kept in .cache/garments; with --preview each
 * garment also gets workbench renders there (<sex>_<id>_{hi_,}{front,side,back,q}.png).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BLENDER = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const argv = process.argv.slice(2);
const only = argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const preview = argv.includes('--preview');
const sexes = argv.includes('male') ? ['male'] : argv.includes('female') ? ['female'] : ['male', 'female'];
const work = join(root, '.cache', 'garments');
mkdirSync(work, { recursive: true });

// Keep in step with GARMENTS and UNDER in garments.py.
const PHASES = {
  male: [['toga', 'toga_velata', 'tunic_short', 'tunic_knee', 'tunic_long'], ['paenula', 'sagum', 'lacerna', 'palla']],
  female: [['tunic_long', 'stola'], ['palla']],
};

function blender(args, log) {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(join(work, log));
    const p = spawn(BLENDER, ['-b', '--python', join(root, 'tools/characters/garments.py'), '--', ...args], { cwd: root });
    p.stdout.pipe(out);
    p.stderr.pipe(out);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${args.join(' ')} failed (see .cache/garments/${log})`))));
  });
}

for (const phase of [0, 1]) {
  const jobs = [];
  for (const sex of sexes)
    for (const g of PHASES[sex][phase]) {
      if (only && !only.includes(g)) continue;
      jobs.push(blender([sex, `--only=${g}`, '--keep', ...(preview ? ['--preview'] : [])], `${sex}_${g}.log`).then(() => console.log(`${sex} ${g} done`)));
    }
  await Promise.all(jobs);
}
for (const sex of sexes) await blender([sex, '--export-only'], `export_${sex}.log`);
console.log('exported public/models/garments/' + sexes.map((s) => `${s}.glb`).join(', '));
