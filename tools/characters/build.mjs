#!/usr/bin/env node
/**
 * Rebuilds the realistic character assets:  npm run characters  [-- male|female] [--no-bake]
 *   1. dump the game's reference rigs (rigs.json)
 *   2. Blender: build_body.py per sex -> public/models/people/<sex>.glb + baked PNG maps in .cache/characters
 *   3. basisu: the maps -> public/textures/people/<sex>_{n,ao}{0,1,2}.ktx2
 * Needs the Human Base Meshes bundle in .cache/hbm (unzip .cache/hbm.zip, see tools/characters/README in
 * docs/modules/avatar-real.md), Blender 5.1 and basisu.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BLENDER = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const argv = process.argv.slice(2);
const sexes = argv.includes('male') ? ['male'] : argv.includes('female') ? ['female'] : ['male', 'female'];
const noBake = argv.includes('--no-bake');
const work = join(root, '.cache', 'characters');
const out = join(root, 'public', 'textures', 'people');
mkdirSync(out, { recursive: true });

execFileSync('node', ['--experimental-strip-types', '--no-warnings', join(root, 'tools/characters/dump-rig.mjs')], { stdio: 'inherit', cwd: root });
for (const sex of sexes) {
  execFileSync(BLENDER, ['-b', '--python', join(root, 'tools/characters/build_body.py'), '--', sex, ...(noBake ? ['--no-bake'] : [])], { stdio: ['ignore', 'inherit', 'inherit'], cwd: root });
  if (noBake) continue;
  const basisu = (...a) => execFileSync('basisu', a, { stdio: ['ignore', 'ignore', 'inherit'] });
  const sizes = [2048, 1024, 512];
  for (let i = 0; i < 3; i++) {
    const n = join(work, `${sex}_lod${i}_normal.png`);
    // Normals: UASTC (ETC1S smears the fine detail). No y-flip: the GLB's UVs already use glTF's top-left origin.
    basisu('-ktx2', '-uastc', '-uastc_level', '1', '-linear', '-mipmap', '-normal_map', n, '-output_file', join(out, `${sex}_n${i}.ktx2`));
    const ao = join(work, `${sex}_ao_${sizes[i]}.png`);
    basisu('-ktx2', '-etc1s', '-quality', '110', '-linear', '-mipmap', ao, '-output_file', join(out, `${sex}_ao${i}.ktx2`));
  }
  for (const f of ['n0', 'n1', 'n2', 'ao0', 'ao1', 'ao2']) {
    const p = join(out, `${sex}_${f}.ktx2`);
    if (existsSync(p)) console.log(`${sex}_${f}.ktx2`.padEnd(20), Math.round(statSync(p).size / 1024), 'KB');
  }
}
