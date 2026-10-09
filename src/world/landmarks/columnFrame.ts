/**
 * Trajan's Column in the world, for the content that stages scenes on and in it (mq-04: the
 * dedication, the stair cell, the platform). Positions are given in the column landmark's local
 * frame, the frame trajan-column.ts builds its spots in (the forum frame shares its rotation and
 * pad height, so the builder's `at` frame differs from it by a translation only): x/z metres from
 * the atlas centre, y up from the terrain under it, the door on the −z side (facing SE in the world).
 *
 * Numbers are from trajan-column.ts (PED_H, columnBody) and its spots; they are game metres.
 */
import * as THREE from 'three';
import type { Game } from '../../core/Game';

export interface Local {
  x: number;
  y: number;
  z: number;
}

export const COLUMN_ID = 'column-trajan';

/** Landmark-local points and heights of the Column (see trajan-column.ts). */
export const COLUMN_LOCAL = {
  /** The column's axis at the foot of the pedestal (the pedestal centre). */
  axis: { x: -1.035, y: 0, z: 0.004 },
  /** In front of the bronze door (the `column-door` spot), facing the door at local heading 0. */
  door: { x: -1.04, y: 0.03, z: -2.55 },
  /** The face of the pedestal with the door (local z of the door's outer face). */
  doorFaceZ: -1.65,
  /** The viewing platform: the top of the capital's abacus (above the landmark origin). */
  abacusTop: 21.77,
  /** Half the abacus side (the exterior railing runs along it). */
  abacusHalf: 1.46,
  /** The altar in the court (the `column-altar` spot) and the priest's place beside it. */
  altar: { x: 2.37, y: 0.03, z: -3.25 },
  priest: { x: 2.47, y: 0.03, z: -2.25 },
  /** The basilica's back door onto the court (`basilica-door-court`, on its back steps, y 0.72). */
  basilicaDoor: { x: -1.04, y: 0.72, z: -7.53 },
  /** The NW upper gallery (`column-vista-gallery`), 4.72 up, facing the column. */
  gallery: { x: -1.04, y: 4.72, z: 9.12 },
};

export function columnPlaced(game: Game) {
  return game.landmarks?.get(COLUMN_ID) ?? null;
}

const UP = new THREE.Vector3(0, 1, 0);

/** A landmark-local point of the Column in the world, or null until the landmark is placed. */
export function columnLocalToWorld(game: Game, local: Local, out = new THREE.Vector3()): THREE.Vector3 | null {
  const lm = columnPlaced(game);
  if (!lm) return null;
  return out.set(local.x, local.y, local.z).applyAxisAngle(UP, lm.rotationY).add(lm.position);
}

/** A world point in the Column's local frame, or null until the landmark is placed. */
export function columnWorldToLocal(game: Game, world: Local, out = new THREE.Vector3()): THREE.Vector3 | null {
  const lm = columnPlaced(game);
  if (!lm) return null;
  return out.set(world.x - lm.position.x, world.y - lm.position.y, world.z - lm.position.z).applyAxisAngle(UP, -lm.rotationY);
}

/** A heading in the Column's local frame (0 = facing +z local, toward the door from outside) in the world. */
export function columnHeading(game: Game, local: number): number | null {
  const lm = columnPlaced(game);
  return lm ? local + lm.rotationY : null;
}

/** The Column's rotation (world rotation.y of its local frame), or null until placed. */
export function columnRotation(game: Game): number | null {
  return columnPlaced(game)?.rotationY ?? null;
}
