/**
 * Builds (and caches) the skinned geometry for an Appearance, plus the matching skeleton.
 * Identical appearances share one BufferGeometry, so a cohort of identically kitted soldiers costs
 * one geometry upload; each avatar still gets its own bones.
 */
import * as THREE from 'three';
import type { Appearance } from '../appearance';
import { BONES, PARENT, computeRig, localOffset, type Rig } from './rig';
import { buildArm, buildFoot, buildHand, buildLeg, buildTorso, levels, TorsoProfile, type Levels } from './build/body';
import { buildHead, type HeadFrame } from './build/head';
import { buildLowerGarments } from './build/garments';
import { buildArmorPieces } from './build/armor';
import { buildCloak } from './build/cloak';
import { makeCtx, type LOD } from './build/common';
import { resolveOutfit } from './build/outfit';

export interface AvatarGeometry {
  geometry: THREE.BufferGeometry;
  rig: Rig;
  levels: Levels;
  /** Eye position (bind pose, character space). */
  eye: THREE.Vector3;
  triangles: number;
  /** Triangles per build stage (for budgets and docs). */
  parts: Record<string, number>;
}

const cache = new Map<string, AvatarGeometry>();

export function appearanceKey(app: Appearance, lod: LOD) {
  return `${lod}|${JSON.stringify(app)}`;
}

export function buildAvatarGeometry(app: Appearance, lod: LOD = 'high'): AvatarGeometry {
  const key = appearanceKey(app, lod);
  const hit = cache.get(key);
  if (hit) return hit;
  const rig = computeRig(app);
  const outfit = resolveOutfit(app);
  const ctx = makeCtx(rig, app, outfit, lod);
  const L = levels(rig);
  const prof = new TorsoProfile(ctx, L);
  const parts: Record<string, number> = {};
  let last = 0;
  const mark = (name: string) => {
    parts[name] = ctx.b.triangleCount - last;
    last = ctx.b.triangleCount;
  };
  buildTorso(ctx, L, prof);
  mark('torso');
  for (const side of [1, -1] as const) buildArm(ctx, L, side);
  mark('arms');
  for (const side of [1, -1] as const) buildHand(ctx, L, side);
  mark('hands');
  for (const side of [1, -1] as const) buildLeg(ctx, L, side);
  mark('legs');
  for (const side of [1, -1] as const) buildFoot(ctx, L, side);
  mark('feet');
  const head: HeadFrame = buildHead(ctx, L);
  mark('head');
  buildLowerGarments(ctx, L, prof);
  mark('garments');
  buildCloak(ctx, L, prof);
  mark('cloak');
  buildArmorPieces(ctx, L, prof, head);
  mark('armor');
  const geometry = ctx.b.build();
  geometry.name = `avatar:${app.sex}:${app.build}:${lod}`;
  const eyeY = head.eyes[0]?.y ?? rig.eyeHeight;
  const out: AvatarGeometry = {
    geometry,
    rig,
    levels: L,
    eye: new THREE.Vector3(0, eyeY, head.eyes[0]?.z ?? 0.08),
    triangles: ctx.b.triangleCount,
    parts,
  };
  rig.eyeHeight = eyeY;
  cache.set(key, out);
  // Keep the cache bounded (crowds of random citizens are mostly unique).
  if (cache.size > 400) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  return out;
}

/** Bone hierarchy in the bind pose (identity rotations; positions are local offsets). */
export function createBones(rig: Rig): THREE.Bone[] {
  const bones = BONES.map((name) => {
    const b = new THREE.Bone();
    b.name = name;
    const [x, y, z] = localOffset(rig, name);
    b.position.set(x, y, z);
    return b;
  });
  BONES.forEach((name, i) => {
    const p = PARENT[name];
    if (p) bones[BONES.indexOf(p)].add(bones[i]);
  });
  return bones;
}

export function clearAvatarCache() {
  cache.clear();
}
