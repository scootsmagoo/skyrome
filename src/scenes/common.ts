/** Helpers shared by scenes. */
import * as THREE from 'three';
import { ActorSystem } from '../actors/ActorSystem';
import type { AvatarView } from '../actors/Actor';
import { PlaceholderAvatar } from '../actors/PlaceholderAvatar';
import type { Game } from '../core/Game';
import { CameraRig } from '../player/CameraRig';
import { Player } from '../player/Player';
import { PlayerController } from '../player/PlayerController';

/** Adds the actor registry, the player, its controller and camera. */
export function setupPlayer(
  game: Game,
  position: THREE.Vector3Like,
  heading = 0,
  avatar: AvatarView = new PlaceholderAvatar(),
): Player {
  if (!game.actors) game.actors = game.addSystem(new ActorSystem(game));
  const player = new Player(game, position, heading, avatar);
  game.player = player;
  game.actors.add(player);
  game.addSystem(new PlayerController(game, player));
  game.addSystem(new CameraRig(game, player));
  return player;
}

/** Simple sun + sky light rig whose shadow camera follows a target. */
export function basicLights(game: Game, follow?: () => THREE.Vector3) {
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x8a6f4d, 1.1);
  game.scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.position.set(-60, 120, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -60;
  cam.right = cam.top = 60;
  cam.near = 1;
  cam.far = 400;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  game.scene.add(sun, sun.target);
  const offset = sun.position.clone();
  if (follow) {
    game.addSystem({
      name: 'sunFollow',
      priority: 90,
      lateUpdate() {
        const p = follow();
        // Snap to texel-ish grid to reduce shimmering.
        const sx = Math.round(p.x / 2) * 2;
        const sz = Math.round(p.z / 2) * 2;
        sun.target.position.set(sx, p.y, sz);
        sun.position.set(sx + offset.x, p.y + offset.y, sz + offset.z);
      },
    });
  }
  return { hemi, sun };
}
