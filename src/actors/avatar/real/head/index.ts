/**
 * C2b: the head of a realistic body. `buildHead(ctx)` measures the head of the body (frame.ts), then builds:
 *
 *   - hair cards for every HairStyle, and beards (hair.ts, beard.ts): one SkinnedMesh on the shared hair
 *     material (hairMaterial.ts), skinned to the head bone (a tail blends down the neck);
 *   - helmets, veils and the Vestal's infula (gear.ts): the existing build/armor.ts and build/head.ts code,
 *     fitted through the measured surface, as one avatarMaterial SkinnedMesh;
 *   - the painted face (paint.ts + real/skin.ts): brows, lips, lids, nostrils, stubble, age, ear and nose
 *     back-light, as a `SkinPaint` for `skinMaterial(..., paint)`.
 *
 * The objects are SkinnedMeshes in the bind pose: add them to the avatar root and `bindHead(objects,
 * avatar.skeleton)` (collapsing the head bone in first person hides them with the head). `frame` is the
 * measured head (a HeadSurface: `at(yf, th)`, `normalAt`, radii, brow, ears, crown, chin ...).
 * Geometry is cached per look and reference-counted: call `dispose()` when the avatar lets go of the head.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng, hashString } from '../../../../core/Rng';
import type { Appearance } from '../../../appearance';
import { srgb } from '../../build/common';
import { buildBeard } from './beard';
import { buildGear, ENCLOSING, gearMesh } from './gear';
import { buildHair } from './hair';
import { hairMaterial } from './hairMaterial';
import { headSurface, type HeadSurface } from './frame';
import { makeSkinPaint } from './paint';
import type { RealContext, RealHeadFrame } from '../types';
import type { SkinPaint } from '../skin';

export { setHairAlphaToCoverage } from './hairMaterial';
export { buildGear, gearMesh, legacyFrame } from './gear';
export { HeadSurface } from './frame';
export type { SkinPaint } from '../skin';

export interface RealHead {
  objects: THREE.Object3D[];
  frame: RealHeadFrame & HeadSurface;
  skinPaint: SkinPaint;
  /** Swap the hair/beard detail for a body LOD (0 full, 1 about half the cards, 2 cap only). */
  setLod(lod: 0 | 1 | 2): void;
  /** Let go of the cached geometry. */
  dispose(): void;
}

// ---------------------------------------------------------------- caches

interface Entry<T> {
  value: T;
  refs: number;
}
class Cache<T extends { geometry: THREE.BufferGeometry }> {
  private map = new Map<string, Entry<T>>();
  constructor(private readonly max: number) {}
  acquire(key: string, make: () => T): { key: string; value: T } {
    let e = this.map.get(key);
    if (!e) {
      e = { value: make(), refs: 0 };
      this.map.set(key, e);
      this.trim();
    }
    e.refs++;
    return { key, value: e.value };
  }
  release(key: string) {
    const e = this.map.get(key);
    if (e) e.refs = Math.max(0, e.refs - 1);
  }
  private trim() {
    if (this.map.size <= this.max) return;
    for (const [k, e] of this.map) {
      if (e.refs === 0) {
        e.value.geometry.dispose();
        this.map.delete(k);
        if (this.map.size <= this.max * 0.8) break;
      }
    }
  }
}

type Geo = { geometry: THREE.BufferGeometry; triangles: number } | null;
const hairCache = new Cache<{ geometry: THREE.BufferGeometry; triangles: number }>(96);
const gearCache = new Cache<{ geometry: THREE.BufferGeometry; triangles: number }>(48);
// Cached for a look with no hair/gear. Its geometry is a throwaway per entry (never a shared object), so a trim can dispose it.
const empty = () => ({ geometry: new THREE.BufferGeometry(), triangles: 0 });

const lerpOf = (n: number) => Math.round(n * 1000);

export function buildHead(ctx: RealContext): RealHead {
  const { app, rig, sex } = ctx;
  const H = headSurface(ctx.body, rig, sex);
  const helmet = app.armor?.helmet;
  const open = !!helmet && helmet.kind !== 'pileus' && !ENCLOSING.has(helmet.kind);
  const enclosed = !!helmet && ENCLOSING.has(helmet.kind);
  const veiled = app.hair.style === 'veiled' || app.hair.style === 'vestal';
  const male = sex === 'male';
  const beardStyle = male && app.age !== 'child' && !enclosed ? app.beard ?? 'none' : 'none';
  const color = srgb(app.hair.color);
  const hairKey = (lod: number) => [sex, app.hair.style, app.hair.color, beardStyle, app.age, lerpOf(rig.headH), open || enclosed ? 'h' : '', lerpOf(rig.height), lod].join('|');
  const gearKey = [sex, helmet ? `${helmet.kind}:${helmet.crest ?? ''}:${helmet.metal ?? ''}` : '', veiled ? app.hair.style + ':' + (app.garments.find((g) => g.kind === 'palla' || g.kind === 'toga')?.color ?? '') : '', lerpOf(rig.headH), lerpOf(rig.height), ctx.lod > 1 ? 'low' : 'high'].join('|');

  const makeHair = (lod: 0 | 1 | 2): Geo => {
    if (enclosed) return null;
    const rng = new Rng(hashString(hairKey(lod)));
    const hair = buildHair({ H, style: app.hair.style, color, rng, lod, helmet: open, age: app.age });
    const beard = buildBeard(H, beardStyle, color, rng.fork('beard'), lod);
    const parts = [hair?.geometry, beard?.geometry].filter((g): g is THREE.BufferGeometry => !!g);
    if (!parts.length) return null;
    const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts, false)!;
    if (parts.length > 1) parts.forEach((p) => p.dispose());
    const h = rig.height;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, h * 0.5, 0), h * 1.15);
    return { geometry, triangles: (hair?.triangles ?? 0) + (beard?.triangles ?? 0) };
  };

  const held: { cache: Cache<{ geometry: THREE.BufferGeometry; triangles: number }>; key: string }[] = [];
  const objects: THREE.Object3D[] = [];

  // Hair and beard.
  let hairMesh: THREE.SkinnedMesh | null = null;
  const setHairLod = (lod: 0 | 1 | 2) => {
    const key = hairKey(lod);
    const got = hairCache.acquire(key, () => makeHair(lod) ?? empty());
    const prev = held.findIndex((h) => h.cache === hairCache);
    if (prev >= 0) hairCache.release(held[prev].key);
    if (prev >= 0) held[prev] = { cache: hairCache, key };
    else held.push({ cache: hairCache, key });
    if (!got.value.triangles) {
      if (hairMesh) hairMesh.visible = false;
      return;
    }
    if (!hairMesh) {
      hairMesh = new THREE.SkinnedMesh(got.value.geometry, hairMaterial());
      hairMesh.name = 'real:hair';
      hairMesh.castShadow = false;
      hairMesh.receiveShadow = true;
      hairMesh.frustumCulled = true;
      objects.push(hairMesh);
    } else hairMesh.geometry = got.value.geometry;
    hairMesh.visible = true;
  };
  setHairLod(ctx.lod);

  // Helmet, veil, infula.
  if (helmet || veiled) {
    const got = gearCache.acquire(gearKey, () => {
      const g = buildGear(app, rig, H, ctx.lod);
      return g ?? empty();
    });
    held.push({ cache: gearCache, key: gearKey });
    if (got.value.triangles) {
      const m = gearMesh(got.value);
      m.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, rig.height * 0.5, 0), rig.height * 1.15);
      objects.push(m);
    }
  }

  const skinPaint = makeSkinPaint(app, H, rig, open || enclosed);
  let disposed = false;
  return {
    objects,
    frame: H as RealHeadFrame & HeadSurface,
    skinPaint,
    setLod(lod) {
      if (!disposed) setHairLod(lod);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const h of held) h.cache.release(h.key);
      held.length = 0;
    },
  };
}

/** Bind head objects to the avatar's skeleton (bind-pose identity, like the eyes). */
export function bindHead(objects: readonly THREE.Object3D[], skeleton: THREE.Skeleton, parent: THREE.Object3D) {
  for (const o of objects) {
    parent.add(o);
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
      o.updateMatrixWorld(true);
      (o as THREE.SkinnedMesh).bind(skeleton, new THREE.Matrix4());
    }
  }
}

/** Convenience for callers that only have an appearance in hand: is this look wearing anything on its head? */
export function wearsHeadgear(app: Appearance): boolean {
  return !!app.armor?.helmet || app.hair.style === 'veiled' || app.hair.style === 'vestal';
}
