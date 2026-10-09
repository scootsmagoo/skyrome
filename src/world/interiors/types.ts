/**
 * Interior cells: small built spaces that are "bigger on the inside" (GDD §12.4). A cell is built
 * in its own local frame (metres, 1:1) and placed in the world at `origin`; the player moves
 * between the world and a cell through doors (interactions) and the fade in UIManager.fade.
 */
import type * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { ColliderSpec, MeshBuilder } from '../../gfx/MeshBuilder';
import type { Spot } from '../landmarks/types';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A point, or one worked out when needed (a world door on a landmark placed after install). */
export type Where = Vec3 | ((game: Game) => Vec3 | null);

export interface InteriorDoor {
  /** Unique, e.g. 'dun-columna:out'. */
  id: string;
  /** "The bronze door". */
  label: string;
  /** "Go out", "Enter the stair". */
  verb: string;
  /** Where the prompt sits: local to `from` (or world when from === null). */
  at: Where;
  /** The interior id the door is in; null = the outside world. */
  from: string | null;
  /** Reach in metres. Default 1.8. */
  reach?: number;
  /** Destination: interior id (local position, heading local) or null (world position, heading world). */
  to: { interior: string | null; position: Where; heading: number | ((game: Game) => number) };
  /** null = usable; a string = refused, shown as a notice. */
  locked?: (game: Game) => string | null;
}

export interface InteriorBuild {
  object: THREE.Object3D;
  /** Colliders in the cell's local frame. */
  colliders: ColliderSpec[];
  /** Spots in the cell's local frame. */
  spots: Spot[];
}

export interface InteriorOrigin {
  x: number;
  y: number;
  z: number;
  rotY: number;
}

export interface InteriorDef {
  id: string;
  name: string;
  latin?: string;
  /** World placement of the local origin (null until the world can say: e.g. the landmark is not placed yet). */
  origin(game: Game): InteriorOrigin | null;
  build(ctx: { game: Game; builder(): MeshBuilder }): InteriorBuild;
  /** Local axis-aligned box: "the player is inside" (3D). */
  bounds: { min: Vec3; max: Vec3 };
  doors?: InteriorDoor[];
  /** Ordered local waypoints from the entrance to the far end (bots, tests, NPC helpers). */
  route?: Vec3[] | (() => Vec3[]);
  /** Hidden unless the player is inside (default true: cells live under or over the world). */
  hiddenOutside?: boolean;
  /** sky.indoor while inside (default 1; 0 for open-air cells such as the platform). */
  indoor?: number;
  onEnter?(game: Game): void;
  onExit?(game: Game): void;
}
