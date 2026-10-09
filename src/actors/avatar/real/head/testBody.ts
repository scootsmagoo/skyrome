/** Test helper: LOD 0 of a baked body read straight from its GLB (no three.js loader), as the head code sees it. */
import { readFileSync } from 'node:fs';
import { B } from '../../rig';
import type { BodyArrays } from '../morph';

type TypedCtor = (new (b: ArrayBuffer) => ArrayLike<number>) & { BYTES_PER_ELEMENT: number };
const cache = new Map<string, BodyArrays>();

export function loadBody(sex: 'male' | 'female'): BodyArrays {
  const hit = cache.get(sex);
  if (hit) return hit;
  const b = readFileSync(new URL(`../../../../../public/models/people/${sex}.glb`, import.meta.url).pathname);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bin = b.subarray(20 + jl + 8);
  const acc = (i: number) => {
    const a = json.accessors[i];
    const v = json.bufferViews[a.bufferView];
    const nc = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type];
    const T = ({ 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array } as unknown as Record<number, TypedCtor>)[a.componentType];
    const off = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return new T(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * nc * T.BYTES_PER_ELEMENT));
  };
  const node = json.nodes.find((n: { name: string; mesh?: number }) => n.mesh !== undefined && n.name === `${sex}_lod0`);
  const at = json.meshes[node.mesh].primitives[0].attributes;
  const names: string[] = json.skins[0].joints.map((j: number) => json.nodes[j].name);
  const map = names.map((n) => (n in B ? B[n as keyof typeof B] : 0));
  const J = acc(at.JOINTS_0);
  const W = acc(at.WEIGHTS_0);
  const idx = new Uint8Array(J.length);
  for (let i = 0; i < J.length; i++) idx[i] = map[J[i]];
  const out: BodyArrays = { position: Float32Array.from(acc(at.POSITION)), normal: Float32Array.from(acc(at.NORMAL)), skinIndex: idx, skinWeight: Float32Array.from(W) };
  cache.set(sex, out);
  return out;
}
