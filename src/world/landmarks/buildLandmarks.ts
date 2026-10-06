/** Places every atlas landmark in the world using its builder (custom → category → fallback). */
import * as THREE from 'three';
import type { Game } from '../../core/Game';
import { Rng } from '../../core/Rng';
import { bearingToRotationY } from '../../core/math';
import { MeshBuilder, registerColliders } from '../../gfx/MeshBuilder';
import { WORLD_SCALE, toGame } from '../coords';
import type { Heightmap } from '../terrain/heightmap';
import { LANDMARK_DETAIL_DISTANCE, bakeLandmarkFar } from './farBake';
import { builderFor } from './registry';
import type { LandmarkData, Spot } from './types';

export interface PlacedLandmark {
  lm: LandmarkData;
  object: THREE.Object3D;
  /** Game-space position of the local origin. */
  position: THREE.Vector3;
  rotationY: number;
  /** Spots transformed to world space. */
  spots: Spot[];
  builder: string;
}

declare module '../../core/Game' {
  interface Game {
    landmarks: Map<string, PlacedLandmark>;
  }
}

export interface BuildLandmarksOptions {
  /** Only these ids (viewer scenes). */
  only?: string[];
  /** Skip landmarks whose center lies outside these REAL-meter bounds. */
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Landmarks with priority > maxPriority are built at 'low' detail. */
  highDetailPriority?: number;
  onProgress?: (done: number, total: number, name: string) => void;
}

export async function buildLandmarks(
  game: Game,
  landmarks: readonly LandmarkData[],
  hm: Heightmap | null,
  opts: BuildLandmarksOptions = {},
): Promise<Map<string, PlacedLandmark>> {
  const placed = new Map<string, PlacedLandmark>();
  game.landmarks = placed;
  const list = landmarks.filter((lm) => {
    if (opts.only && !opts.only.includes(lm.id)) return false;
    const b = opts.bounds;
    if (b && (lm.center[0] < b.minX || lm.center[0] > b.maxX || lm.center[1] < b.minZ || lm.center[1] > b.maxZ)) return false;
    return true;
  });
  let i = 0;
  for (const lm of list) {
    i++;
    const builder = builderFor(lm);
    if (!builder) continue;
    const [gx, gz] = toGame(lm.center[0], lm.center[1]);
    const baseY = hm ? hm.heightAt(gx, gz) : 0;
    const rotY = bearingToRotationY(lm.rotation);
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const detail = (lm.priority ?? 3) <= (opts.highDetailPriority ?? 2) ? 'high' : 'low';
    try {
      const built = builder.build({
        game,
        lm,
        S: WORLD_SCALE,
        rng: new Rng(`landmark:${lm.id}`),
        detail,
        builder: () => new MeshBuilder(),
        groundAt: (lx, lz) => {
          if (!hm) return 0;
          // local → world (rotation.y = rotY): x' = x cos + z sin, z' = -x sin + z cos
          const wx = gx + lx * cos + lz * sin;
          const wz = gz - lx * sin + lz * cos;
          return hm.heightAt(wx, wz) - baseY;
        },
      });
      const obj = built.object;
      obj.name = `landmark:${lm.id}`;
      obj.position.set(gx, baseY, gz);
      obj.rotation.y = rotY;
      obj.updateMatrixWorld(true);
      registerColliders(game, built.colliders, obj.matrixWorld, { landmarkId: lm.id });
      const cull = built.cullDistance ?? (lm.height * WORLD_SCALE > 20 ? 1600 : 700);
      // Tree groves keep their own range (they have their own near/far LOD); the landmark itself
      // switches to a one-draw baked stand-in beyond LANDMARK_DETAIL_DISTANCE (see farBake.ts).
      const groves: THREE.Object3D[] = [];
      obj.traverse((o) => { if (o !== obj && isGrove(o)) groves.push(o); });
      const bake = cull > LANDMARK_DETAIL_DISTANCE ? bakeLandmarkFar(built.far ?? obj, isGrove) : null;
      let far = built.far;
      if (bake) {
        if (built.far) built.far.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        far = bake.mesh;
        far.name = `landmark:${lm.id}:far`;
        for (const [i, g] of groves.entries()) {
          game.scene.attach(g);
          game.world.add(`landmark:${lm.id}:grove:${i}`, g, { cullDistance: cull });
        }
      }
      if (far) {
        far.position.copy(obj.position);
        far.rotation.y = rotY;
      }
      game.world.add(`landmark:${lm.id}`, obj, {
        cullDistance: bake ? LANDMARK_DETAIL_DISTANCE : cull,
        far,
        farDistance: built.far ? 3000 : bake ? cull : undefined,
        // A baked landmark counts half its radius: the far end of a big complex goes simple.
        radiusWeight: bake ? 0.5 : undefined,
      });
      const spots = (built.spots ?? []).map((s) => ({ ...s, position: s.position.clone().applyMatrix4(obj.matrixWorld), heading: (s.heading ?? 0) + rotY }));
      placed.set(lm.id, { lm, object: obj, position: obj.position.clone(), rotationY: rotY, spots, builder: builder.handles[0] });
    } catch (err) {
      console.error(`[landmarks] failed to build ${lm.id}`, err);
    }
    opts.onProgress?.(i, list.length, lm.name);
    // Yield to the browser now and then so the loading screen can paint.
    if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return placed;
}

/** A vegetation Forest's group (arch/vegetation/Forest.ts names it 'forest'). */
function isGrove(o: THREE.Object3D): boolean {
  return o.name === 'forest';
}
