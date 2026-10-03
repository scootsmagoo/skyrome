/**
 * Landmark builders. Every atlas landmark is built by either a custom builder for its id
 * (src/world/landmarks/builders/<anything>.ts exporting `builders: LandmarkBuilder[]`, discovered
 * by glob) or, failing that, the generic builder for its category — so every landmark in the atlas
 * appears in the world at least approximately, and hand-crafted builders replace the generic ones
 * one by one.
 *
 * Builders work in LOCAL space: origin at the landmark center on its building pad (y = 0 is the pad
 * height), main facade facing -z, width along x. Dimensions from the atlas are REAL meters — multiply
 * by ctx.S (WORLD_SCALE) for monumental parts; keep human-scale details (step risers ~0.18–0.22 m,
 * doors ≥ 2.2 m) at 1:1.
 */
import type * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Rng } from '../../core/Rng';
import type { ColliderSpec, MeshBuilder } from '../../gfx/MeshBuilder';

/** Structural subset of the atlas Landmark (src/data/atlas.ts) that builders rely on. */
export interface LandmarkData {
  id: string;
  name: string;
  latin: string;
  category: string;
  center: readonly [number, number];
  rotation: number;
  footprint:
    | { kind: 'rect'; w: number; d: number }
    | { kind: 'ellipse'; rx: number; rz: number }
    | { kind: 'circle'; r: number }
    | { kind: 'poly'; points: readonly (readonly [number, number])[] };
  height: number;
  baseElevation?: number;
  status113: string;
  description: string;
  builderNotes: string;
  priority: number;
}

export interface LandmarkContext {
  game: Game;
  lm: LandmarkData;
  /** WORLD_SCALE. */
  S: number;
  /** Deterministic RNG for this landmark. */
  rng: Rng;
  /** Terrain height at a LOCAL (x, z) offset from the landmark center, relative to the pad (0 = pad). */
  groundAt(localX: number, localZ: number): number;
  /** Fresh MeshBuilder. */
  builder(): MeshBuilder;
  /** 'high' near the core; 'low' for distant/outer landmarks. */
  detail: 'high' | 'low';
}

/** A named point inside a landmark for NPC schedules, quests, spawns (local space). */
export interface Spot {
  id: string;
  kind: string;
  position: THREE.Vector3;
  /** Heading (radians, model +Z convention) an NPC should face at this spot. */
  heading?: number;
}

export interface LandmarkBuild {
  object: THREE.Object3D;
  colliders: ColliderSpec[];
  spots?: Spot[];
  /** Optional far stand-in (cheap massing) shown beyond the cull distance. */
  far?: THREE.Object3D;
  /** Override default cull distance (m). */
  cullDistance?: number;
}

export interface LandmarkBuilder {
  /** Atlas landmark ids this builder handles, or `category:<name>` for generic builders. */
  handles: string[];
  build(ctx: LandmarkContext): LandmarkBuild;
}
