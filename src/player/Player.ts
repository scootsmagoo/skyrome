/**
 * The player: an Actor plus look angles and view mode. Movement is in PlayerController; the camera
 * in CameraRig. Other modules (combat, stats, inventory) attach their state here via declaration
 * merging:  declare module '../player/Player' { interface Player { stats: Stats } }
 */
import * as THREE from 'three';
import { Actor, type AvatarView } from '../actors/Actor';
import type { Game } from '../core/Game';
import { Layer } from '../core/Physics';

export type ViewMode = 'first' | 'third';

declare module '../core/Game' {
  interface Game {
    player: Player;
  }
}

export class Player extends Actor {
  /** Camera yaw (radians, three.js: 0 looks toward -Z / north). */
  yaw = 0;
  /** Camera pitch (radians, + looks up). */
  pitch = -0.1;
  viewMode: ViewMode = 'third';
  /** Third-person camera distance (m). */
  zoom = 3.4;
  /** Walk instead of run (Caps Lock). */
  walkMode = false;
  /** While true the character faces the camera direction (weapon drawn, aiming, blocking). */
  combatStance = false;

  constructor(game: Game, position: THREE.Vector3Like, heading = 0, avatar: AvatarView | null = null) {
    super(game, { id: 'player', position, heading, layer: Layer.Player, avatar });
    this.yaw = heading + Math.PI;
  }

  get eyeHeight() {
    return this.avatar?.eyeHeight ?? 1.62;
  }

  /** Unit vector the camera looks along, flattened to the ground plane. */
  lookForward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  setViewMode(mode: ViewMode) {
    if (mode === this.viewMode) return;
    this.viewMode = mode;
    this.avatar?.setFirstPerson?.(mode === 'first');
    this.game.events.emit('view:changed', { mode });
  }
}
