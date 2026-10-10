/**
 * The baked garment assets (public/models/garments/<sex>.glb) against the body assets: every garment binds to its
 * reference body, keeps to its triangle budget, gets normalised weights on the bones it may follow, hides skin, and
 * fits a heavy, a tall and a child's body without tearing or sinking into it.
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Appearance, Sex } from '../../../appearance';
import { B, computeRig } from '../../rig';
import { morphBody, type BodyArrays } from '../morph';
import { refRig } from '../refs';
import { TriGrid, fitGarment } from './bind';
import { boundGarment, coveredVertices, hasBaked, loadBakedGarments, type BakedId } from './baked';
import { bakedPlan, fitBaked, rulesFor } from './fit';

const root = new URL('../../../../../', import.meta.url).pathname;

function parse(path: string): Promise<THREE.Object3D> {
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((res, rej) => new GLTFLoader().parse(ab as ArrayBuffer, '', (g) => res(g.scene), rej));
}

const bodies = new Map<Sex, { lods: BodyArrays[]; index: ArrayLike<number>[] }>();

beforeAll(async () => {
  for (const sex of ['male', 'female'] as const) {
    const scene = await parse(`${root}public/models/people/${sex}.glb`);
    const lods: BodyArrays[] = [];
    const index: ArrayLike<number>[] = [];
    for (let k = 0; k < 3; k++) {
      let mesh: THREE.SkinnedMesh | null = null;
      scene.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh && o.name.endsWith(`lod${k}`)) mesh = o as THREE.SkinnedMesh;
      });
      const m = mesh! as THREE.SkinnedMesh;
      const g = m.geometry;
      const names = m.skeleton.bones.map((b) => b.name);
      const si = g.getAttribute('skinIndex');
      const sw = g.getAttribute('skinWeight');
      const idx = new Uint8Array(si.count * 4);
      const wt = new Float32Array(si.count * 4);
      for (let i = 0; i < si.count; i++)
        for (let q = 0; q < 4; q++) {
          idx[i * 4 + q] = (B as Record<string, number>)[names[si.getComponent(i, q)]] ?? 0;
          wt[i * 4 + q] = sw.getComponent(i, q);
        }
      lods.push({
        position: Float32Array.from(g.getAttribute('position').array as ArrayLike<number>),
        normal: Float32Array.from(g.getAttribute('normal').array as ArrayLike<number>),
        tangent: g.getAttribute('tangent') ? Float32Array.from(g.getAttribute('tangent').array as ArrayLike<number>) : undefined,
        skinIndex: idx,
        skinWeight: wt,
      });
      index.push(g.index!.array as ArrayLike<number>);
    }
    bodies.set(sex, { lods, index });
  }
  const loader = { loadAsync: async (url: string) => ({ scene: await parse(`${root}public/${url.replace(/^\//, '')}`) }) } as unknown as GLTFLoader;
  await loadBakedGarments(loader, '/', (sex, lod) => (lod < 3 ? { body: bodies.get(sex)!.lods[lod], index: bodies.get(sex)!.index[lod] } : null));
}, 60000);

const GARMENTS: Record<Sex, BakedId[]> = {
  male: ['toga', 'toga_velata', 'tunic_short', 'tunic_knee', 'tunic_long', 'paenula', 'sagum', 'lacerna', 'palla'],
  female: ['tunic_long', 'stola', 'palla'],
};
const BUDGET = [4500, 2400, 520];
const FREE = new Set(['shoulderL', 'upperArmL', 'forearmL', 'handL', 'shoulderR', 'upperArmR', 'forearmR', 'handR', 'head'].map((b) => B[b as keyof typeof B]));

describe('baked garments (public/models/garments)', () => {
  for (const sex of ['male', 'female'] as const)
    for (const id of GARMENTS[sex])
      it(`${sex} ${id}: binds, keeps its budget, weights and hides skin`, () => {
        for (let lod = 0; lod < 3; lod++) {
          expect(hasBaked(sex, id, lod), `lod ${lod}`).toBe(true);
          const bg = boundGarment(sex, id, lod, rulesFor(id, sex))!;
          expect(bg.triangles).toBeLessThan(BUDGET[lod]);
          expect(bg.triangles).toBeGreaterThan(BUDGET[lod] / 6);
          const n = bg.mesh.position.length / 3;
          for (let v = 0; v < n; v++) {
            let t = 0;
            for (let k = 0; k < 4; k++) t += bg.skinWeight[v * 4 + k];
            expect(Math.abs(t - 1)).toBeLessThan(1e-4);
          }
          // Draped garments that lie on the torso hide some of it; cloaks hide nothing (limbs swing out from under them).
          const hidden = bg.hide.reduce((a, x) => a + x, 0);
          if (/tunic|toga|stola/.test(id)) expect(hidden, `lod ${lod}`).toBeGreaterThan(20);
        }
      });
});

describe('fitting baked garments to people', () => {
  const people: (Partial<Appearance> & { label: string })[] = [
    { label: 'heavy man', sex: 'male', build: 'heavy', height: 1.7 },
    { label: 'tall thin man', sex: 'male', build: 'slight', height: 1.93 },
    { label: 'boy', sex: 'male', age: 'child', build: 'slight', height: 1.3 },
    { label: 'woman', sex: 'female', build: 'heavy', height: 1.55 },
  ];
  for (const p of people)
    it(`${p.label}: the cloth follows, never inside the body`, () => {
      const sex = p.sex as Sex;
      const app = {
        sex,
        age: p.age ?? 'adult',
        build: p.build,
        height: p.height,
        skin: '#c08060',
        hair: { style: 'cropped', color: '#222' },
        garments:
          sex === 'male'
            ? [{ kind: 'tunica', color: '#eee' }, { kind: 'toga', color: '#e8e1cf', trim: '#5b1f3b' }]
            : [{ kind: 'tunica-long', color: '#eee' }, { kind: 'stola', color: '#c33' }, { kind: 'palla', color: '#336' }],
      } as Appearance;
      const rig = computeRig(app);
      const tpl = bodies.get(sex)!;
      const src = tpl.lods[0];
      const out = { position: new Float32Array(src.position.length), normal: new Float32Array(src.normal.length) };
      morphBody(src, refRig(sex), rig, out);
      const body: BodyArrays = { ...src, position: out.position, normal: out.normal };
      const rc = { app, rig, sex, lod: 0 as const, body };
      const plan = bakedPlan(rc);
      expect(plan.ids.length).toBe(sex === 'male' ? 1 : 2);
      const { garments, hide } = fitBaked(rc, plan);
      expect(hide.reduce((a, x) => a + x, 0)).toBeGreaterThan(50);
      // Distance of each garment vertex to the morphed body: outside it (the binding keeps the offset along the
      // normal), within the person's height, no NaN.
      const grid = new TriGrid(body.position, tpl.index[0], 0.04);
      const hit = { tri: 0, u: 0, v: 0, d2: 0 };
      for (const g of garments) {
        let inside = 0;
        for (let i = 0; i < g.count; i++) {
          const x = g.position[i * 3], y = g.position[i * 3 + 1], z = g.position[i * 3 + 2];
          expect(Number.isFinite(x + y + z)).toBe(true);
          expect(y).toBeGreaterThan(-0.05);
          expect(y).toBeLessThan(rig.height + 0.05);
          grid.nearest(x, y, z, 0.5, hit);
          const t = hit.tri;
          const a = tpl.index[0][t * 3], b = tpl.index[0][t * 3 + 1], c = tpl.index[0][t * 3 + 2];
          const w = 1 - hit.u - hit.v;
          const px = body.position[a * 3] * w + body.position[b * 3] * hit.u + body.position[c * 3] * hit.v;
          const py = body.position[a * 3 + 1] * w + body.position[b * 3 + 1] * hit.u + body.position[c * 3 + 1] * hit.v;
          const pz = body.position[a * 3 + 2] * w + body.position[b * 3 + 2] * hit.u + body.position[c * 3 + 2] * hit.v;
          const nx = body.normal[a * 3] * w + body.normal[b * 3] * hit.u + body.normal[c * 3] * hit.v;
          const ny = body.normal[a * 3 + 1] * w + body.normal[b * 3 + 1] * hit.u + body.normal[c * 3 + 1] * hit.v;
          const nz = body.normal[a * 3 + 2] * w + body.normal[b * 3 + 2] * hit.u + body.normal[c * 3 + 2] * hit.v;
          // Cloth under an arm lies inside it in the bind pose (the arms rest against the ribs; the simulation swung
          // them out of the way): only the torso and legs count.
          if (FREE.has(body.skinIndex[a * 4])) continue;
          if ((x - px) * nx + (y - py) * ny + (z - pz) * nz < -0.004) inside++;
        }
        // The skin under hems and in the armpits is a few millimetres from the cloth; allow a sliver.
        expect(inside / g.count, `${g.id} vertices inside the body`).toBeLessThan(0.03);
      }
    });

  it('inner layers lose only what lies close under an outer one', () => {
    for (const [sex, id, outer, parts] of [
      ['male', 'toga', [], 1],
      ['male', 'tunic_knee', ['paenula'], undefined],
      ['female', 'stola', ['palla'], undefined],
    ] as const) {
      const c = coveredVertices(sex, id, 0, [...outer], parts)!;
      const n = c.reduce((a, x) => a + x, 0);
      expect(n, `${sex} ${id}`).toBeGreaterThan(0);
      // Never the outer parts themselves, and never most of the garment.
      expect(n, `${sex} ${id}`).toBeLessThan(c.length * 0.6);
    }
  });

  it('a binding fitted back onto its own reference body returns the baked cloth', () => {
    const tpl = bodies.get('male')!;
    const bg = boundGarment('male', 'toga', 1, rulesFor('toga', 'male'))!;
    const out = { position: new Float32Array(bg.mesh.position.length), normal: new Float32Array(bg.mesh.normal.length) };
    fitGarment(bg.binding, tpl.lods[1], tpl.index[1], out);
    let worst = 0;
    for (let i = 0; i < out.position.length; i++) worst = Math.max(worst, Math.abs(out.position[i] - bg.mesh.position[i]));
    expect(worst).toBeLessThan(1e-4);
  });
});
