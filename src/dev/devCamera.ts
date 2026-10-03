/** Detach the camera from the player for surveys/screenshots: devCamera(game).look(from, to). */
import * as THREE from 'three';
import type { Game } from '../core/Game';

export function devCamera(game: Game) {
  const rig = game.getSystem('cameraRig');
  if (rig) game.removeSystem(rig);
  return {
    look(from: THREE.Vector3Like, to: THREE.Vector3Like) {
      game.camera.position.set(from.x, from.y, from.z);
      game.camera.lookAt(to.x, to.y, to.z);
      game.world?.refreshAll();
    },
  };
}
