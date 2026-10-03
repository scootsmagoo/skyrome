/** Shared types for the city-fabric generators. */
import type * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';

/** Terrain height (game y) at a game-space (x, z). */
export type HeightFn = (x: number, z: number) => number;

/** A 2D point in the ground plane: [x, z] (game meters, +x east, +z south). */
export type Vec2 = [number, number];
export type Polygon = Vec2[];

/**
 * Places where NPCs and gameplay hook into the fabric.
 * - `position` is on the walkable ground (sidewalk / threshold / plaza).
 * - `facing` is a heading (model +Z convention, see core/math.ts) pointing OUT of the feature toward
 *   the street — the way a shopkeeper at the counter, a worshipper's back, or a bench sitter looks.
 *   A customer approaching should face `facing + π`.
 */
export type SpotKind = 'shopDoor' | 'houseDoor' | 'fountain' | 'shrine' | 'bench' | 'stall' | 'tree' | 'well' | 'workshop';

export interface Spot {
  id: string;
  kind: SpotKind;
  position: THREE.Vector3;
  facing: number;
  /** Extra info, e.g. the shop kind ('thermopolium') or 'domus'. */
  tag?: string;
}

/** Result of a single building generator, in the building's LOCAL frame (front faces −z, floor at y = 0). */
export interface BuildingOutput {
  builder: MeshBuilder;
  spots: Spot[];
  /** Height of the eaves above the floor level (m). */
  height: number;
}

/**
 * Ground height relative to the building's floor level, in the building's local frame.
 * Negative where the terrain falls away (the generator then adds a plinth / stepped foundation).
 */
export type LocalGround = (x: number, z: number) => number;

export const flatGround: LocalGround = () => 0;
