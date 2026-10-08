/**
 * Test support: drive the REAL Actor (src/actors/Actor.ts) through Rapier against the colliders
 * of a MeshBuilder, so walkability tests catch regressions in both the kit and the locomotion.
 */
import * as THREE from 'three';
import { Actor } from '../src/actors/Actor';
import type { Game } from '../src/core/Game';
import { Layer, Physics } from '../src/core/Physics';
import type { MeshBuilder } from '../src/gfx/MeshBuilder';

export interface TestWorld {
  physics: Physics;
  game: Game;
}

/** A physics world with a large ground slab (top at y = 0) and a stub Game for Actor. */
export function makeWorld(ground = true): TestWorld {
  const physics = new Physics();
  if (ground) physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 400, y: 0.5, z: 400 });
  const game = { physics, scene: new THREE.Scene() } as unknown as Game;
  return { physics, game };
}

export function addColliders(p: Physics, b: MeshBuilder) {
  for (const c of b.colliders) {
    if (c.kind === 'box') p.addOrientedBox(c.center, c.half, c.rotation ?? new THREE.Quaternion());
    else if (c.kind === 'cylinder') p.addCylinder(c.center, c.halfHeight, c.radius);
    else p.addTrimesh(c.geometry, c.matrix);
  }
}

export interface Leg {
  /** Walk towards this point (x, z); the leg ends within `reach` of it or after `seconds`. */
  to?: [number, number];
  /** Or walk along a fixed direction for `seconds`. */
  dir?: [number, number];
  seconds: number;
  speed?: number;
  reach?: number;
}

export interface WalkResult {
  x: number;
  y: number;
  z: number;
  maxY: number;
  /** Per-leg end positions. */
  ends: THREE.Vector3[];
  actor: Actor;
  /** Last locomotion state (to check reported speed while blocked). */
  speed: number;
}

/** Walk an Actor (the player's capsule unless `body` says otherwise) along `legs`, stepping physics at 60 Hz exactly like the game. */
export function walk(world: TestWorld, start: THREE.Vector3Like, legs: Leg[], body: { radius?: number; layer?: number } = {}): WalkResult {
  const { physics, game } = world;
  const actor = new Actor(game, { id: 'walker', position: start, layer: body.layer ?? Layer.Player, radius: body.radius });
  physics.step(1 / 60);
  const dt = 1 / 60;
  const wish = new THREE.Vector3();
  let maxY = -Infinity;
  const ends: THREE.Vector3[] = [];
  for (const leg of legs) {
    const speed = leg.speed ?? 4.4;
    for (let i = 0; i < leg.seconds * 60; i++) {
      const p = actor.position;
      if (leg.to) {
        wish.set(leg.to[0] - p.x, 0, leg.to[1] - p.z);
        if (wish.length() < (leg.reach ?? 0.3)) break;
      } else wish.set(leg.dir![0], 0, leg.dir![1]);
      wish.normalize().multiplyScalar(speed);
      actor.heading = Math.atan2(wish.x, wish.z);
      actor.locomote(wish, dt);
      physics.step(dt);
      maxY = Math.max(maxY, actor.position.y);
    }
    ends.push(actor.position.clone());
  }
  const p = actor.position;
  return { x: p.x, y: p.y, z: p.z, maxY, ends, actor, speed: actor.locomotionState().speed };
}
