/**
 * Builds (and caches) the skinned geometry for an Appearance, plus the matching skeleton.
 * Identical appearances share one BufferGeometry, so a cohort of identically kitted soldiers costs
 * one geometry upload; each avatar still gets its own bones.
 *
 * Avatars hold their geometry with acquire/release (reference counts). An entry nobody holds stays
 * cached for quick reuse (an NPC streaming back in) until more than MAX_IDLE such entries pile up;
 * then the oldest is evicted and its GPU buffers are disposed. Held entries are never evicted.
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
  /** Cache key (LOD + appearance). */
  key: string;
  geometry: THREE.BufferGeometry;
  rig: Rig;
  levels: Levels;
  /** Eye position (bind pose, character space). */
  eye: THREE.Vector3;
  triangles: number;
  /** Triangles per build stage (for budgets and docs). */
  parts: Record<string, number>;
}

interface Entry {
  geo: AvatarGeometry;
  refs: number;
}

const cache = new Map<string, Entry>();
/** Keys of cached entries nobody holds, oldest first. */
const idle = new Set<string>();
/** Unheld geometries kept around for reuse. */
export const MAX_IDLE = 24;

export function appearanceKey(app: Appearance, lod: LOD) {
  return `${lod}|${JSON.stringify(app)}`;
}

/** The geometry for an appearance, held by the caller until `releaseAvatarGeometry`. */
export function acquireAvatarGeometry(app: Appearance, lod: LOD = 'high'): AvatarGeometry {
  const e = entry(app, lod);
  e.refs++;
  idle.delete(e.geo.key);
  return e.geo;
}

/** Drop a hold; geometry nobody holds may be evicted (and disposed) later. */
export function releaseAvatarGeometry(geo: AvatarGeometry) {
  const e = cache.get(geo.key);
  if (!e || e.geo !== geo) return;
  e.refs = Math.max(0, e.refs - 1);
  if (e.refs === 0) {
    idle.add(geo.key);
    trimIdle();
  }
}

function trimIdle() {
  while (idle.size > MAX_IDLE) {
    const key = idle.values().next().value as string;
    idle.delete(key);
    const e = cache.get(key);
    cache.delete(key);
    e?.geo.geometry.dispose();
  }
}

/** Cache statistics (tests, debug overlay). */
export function avatarCacheStats() {
  let held = 0;
  for (const e of cache.values()) if (e.refs > 0) held++;
  return { entries: cache.size, held, idle: idle.size };
}

/** Build (or look up) the geometry without holding it: it may be evicted once unheld entries pile up. */
export function buildAvatarGeometry(app: Appearance, lod: LOD = 'high'): AvatarGeometry {
  return entry(app, lod).geo;
}

function entry(app: Appearance, lod: LOD): Entry {
  const key = appearanceKey(app, lod);
  let e = cache.get(key);
  if (!e) {
    e = { geo: build(app, lod, key), refs: 0 };
    cache.set(key, e);
    // Newest idle entry: trimming evicts older ones first, so it survives to be handed out.
    idle.add(key);
    trimIdle();
  }
  return e;
}

function build(app: Appearance, lod: LOD, key: string): AvatarGeometry {
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
    key,
    geometry,
    rig,
    levels: L,
    eye: new THREE.Vector3(0, eyeY, head.eyes[0]?.z ?? 0.08),
    triangles: ctx.b.triangleCount,
    parts,
  };
  rig.eyeHeight = eyeY;
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

/** Bind-pose inverse matrices for a rig (bones have identity rest rotations: pure translations). */
export function boneInverses(rig: Rig): THREE.Matrix4[] {
  return BONES.map((_, i) => new THREE.Matrix4().makeTranslation(-rig.joints[i * 3], -rig.joints[i * 3 + 1], -rig.joints[i * 3 + 2]));
}

/** Dispose every geometry nobody holds (e.g. on leaving a region). */
export function clearAvatarCache() {
  for (const key of idle) {
    cache.get(key)?.geo.geometry.dispose();
    cache.delete(key);
  }
  idle.clear();
}
