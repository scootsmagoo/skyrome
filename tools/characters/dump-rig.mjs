#!/usr/bin/env node
/**
 * Dumps the game's reference rigs (computeRig) for the Blender pipeline.
 *   node --experimental-strip-types tools/characters/dump-rig.mjs   (writes tools/characters/rigs.json)
 * The reference bodies are an average adult man (1.75 m, the animation reference height) and an
 * average adult woman (1.62 m). The real meshes are posed into exactly these bind poses.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BONES, PARENT, computeRig } from '../../src/actors/avatar/rig.ts';

const here = dirname(fileURLToPath(import.meta.url));
const REFS = {
  male: { sex: 'male', age: 'adult', build: 'average', height: 1.75 },
  female: { sex: 'female', age: 'adult', build: 'average', height: 1.62 },
};
const out = { bones: BONES, parent: PARENT, rigs: {} };
for (const [k, app] of Object.entries(REFS)) {
  const r = computeRig(app);
  const joints = {};
  BONES.forEach((n, i) => (joints[n] = [r.joints[i * 3], r.joints[i * 3 + 1], r.joints[i * 3 + 2]].map((v) => +v.toFixed(5))));
  out.rigs[k] = { app, height: r.height, s: r.s, headH: r.headH, ankleH: r.ankleH, eyeHeight: r.eyeHeight, g: r.g, joints };
}
writeFileSync(join(here, 'rigs.json'), JSON.stringify(out, null, 1) + '\n');
console.log('wrote rigs.json');
