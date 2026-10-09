import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BONES } from '../rig';

/** Reads the JSON chunk of a GLB. */
function glbJson(path: string) {
  const b = readFileSync(path);
  const n = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + n).toString('utf8'));
}

describe('realistic body assets (public/models/people)', () => {
  for (const sex of ['male', 'female']) {
    it(`${sex}.glb: three LODs and eyes skinned to exactly the game's bones`, () => {
      const j = glbJson(new URL(`../../../../public/models/people/${sex}.glb`, import.meta.url).pathname);
      const names = new Set(j.nodes.map((n: { name: string }) => n.name));
      for (const bone of BONES) expect(names.has(bone), bone).toBe(true);
      expect(j.skins[0].joints.length).toBe(BONES.length);
      const tris = (lod: number) => {
        const node = j.nodes.find((n: { name: string }) => n.name === `${sex}_lod${lod}`);
        const prim = j.meshes[node.mesh].primitives[0];
        expect(Object.keys(prim.attributes)).toEqual(expect.arrayContaining(['POSITION', 'NORMAL', 'TANGENT', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']));
        return j.accessors[prim.indices].count / 3;
      };
      expect(tris(0)).toBeGreaterThan(9000);
      expect(tris(0)).toBeLessThan(13000);
      expect(tris(1)).toBeGreaterThan(3000);
      expect(tris(1)).toBeLessThan(5000);
      expect(tris(2)).toBeGreaterThan(900);
      expect(tris(2)).toBeLessThan(1600);
    });
  }
});
