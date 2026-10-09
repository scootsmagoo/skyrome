/**
 * Test-bed hook for the avatars scene (?scene=avatars&avatar=real&heads=1): puts `buildHead` on real bodies
 * without waiting for the integration (C2a). Loads LOD 0 of both bodies itself, so it does not depend on
 * RealBody's private templates. `rebuild(i, patch)` changes hair, beard, helmet or veil of slot i for close-ups.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Appearance } from '../../../appearance';
import type { HumanoidAvatar } from '../../HumanoidAvatar';
import { B } from '../../rig';
import type { BodyArrays } from '../morph';
import { skinMaterial } from '../skin';
import type { RealContext } from '../types';
import { bindHead, buildHead, type RealHead } from './index';

const baseUrl = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const bodies = new Map<'male' | 'female', BodyArrays>();

async function loadBody(sex: 'male' | 'female'): Promise<BodyArrays> {
  const cached = bodies.get(sex);
  if (cached) return cached;
  const g = await new GLTFLoader().loadAsync(`${baseUrl}models/people/${sex}.glb`);
  let mesh: THREE.SkinnedMesh | null = null;
  g.scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && o.name.endsWith('lod0')) mesh = o as THREE.SkinnedMesh;
  });
  const m = mesh as THREE.SkinnedMesh | null;
  if (!m) throw new Error('head dev: lod0 missing');
  const map = m.skeleton.bones.map((b) => (b.name in B ? B[b.name as keyof typeof B] : 0));
  const si = m.geometry.getAttribute('skinIndex');
  const sw = m.geometry.getAttribute('skinWeight');
  const idx = new Uint8Array(si.count * 4);
  const wt = new Float32Array(si.count * 4);
  for (let i = 0; i < si.count; i++)
    for (let k = 0; k < 4; k++) {
      idx[i * 4 + k] = map[si.getComponent(i, k)];
      wt[i * 4 + k] = sw.getComponent(i, k);
    }
  const arr: BodyArrays = {
    position: Float32Array.from(m.geometry.getAttribute('position').array as ArrayLike<number>),
    normal: Float32Array.from(m.geometry.getAttribute('normal').array as ArrayLike<number>),
    skinIndex: idx,
    skinWeight: wt,
  };
  bodies.set(sex, arr);
  return arr;
}

export interface HeadDev {
  heads: (RealHead | null)[];
  /** Rebuild avatar i's head with a patched appearance (hair, beard, armor, garments ...). */
  rebuild(i: number, patch: Partial<Appearance>): string;
}

export async function attachHeads(avatars: (HumanoidAvatar | null)[]): Promise<HeadDev> {
  await Promise.all([loadBody('male'), loadBody('female')]);
  const heads: (RealHead | null)[] = avatars.map(() => null);
  const apps = avatars.map((a) => (a ? { ...a.appearance } : null));
  const maps = avatars.map((a) => {
    const m = a?.mesh.material as THREE.MeshStandardMaterial | undefined;
    return m && m.normalMap ? { normal: m.normalMap, ao: m.aoMap! } : null;
  });
  const build = (i: number) => {
    const av = avatars[i];
    const app = apps[i];
    const mp = maps[i];
    if (!av || !app || !mp) return;
    heads[i]?.dispose();
    heads[i]?.objects.forEach((o) => o.removeFromParent());
    const ctx: RealContext = { app, rig: av.rig, sex: app.sex, lod: 0, body: bodies.get(app.sex)! };
    const head = buildHead(ctx);
    bindHead(head.objects, av.skeleton, av.root);
    av.mesh.material = skinMaterial(`${app.sex}:0`, app.skin, mp, head.skinPaint);
    heads[i] = head;
  };
  avatars.forEach((_, i) => build(i));
  return {
    heads,
    rebuild(i, patch) {
      const app = apps[i];
      if (!app) return 'no avatar';
      Object.assign(app, patch);
      build(i);
      return `${app.hair.style}/${app.beard ?? '-'}/${app.armor?.helmet?.kind ?? '-'}`;
    },
  };
}
