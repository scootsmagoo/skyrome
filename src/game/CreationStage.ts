/**
 * The character-creation "stage": while the creation panel is open the player's own avatar turns
 * slowly on the spot (a turntable) and the camera frames it on the right of the screen, lit from
 * the front by the sun, with the live city behind. Runs after the CameraRig (and the title orbit).
 */
import * as THREE from 'three';
import type { Game, System } from '../core/Game';
import { Layer } from '../core/Physics';

const target = new THREE.Vector3();
const toCam = new THREE.Vector3();
const side = new THREE.Vector3();
const look = new THREE.Vector3();

export class CreationStage implements System {
  readonly name = 'creationStage';
  readonly priority = 102;
  /** Radians per second of turntable spin. */
  spin = 0.32;
  /** Where the avatar stands across the screen, in NDC (−1 left … 1 right): right of the panel. */
  screenX: () => number = () => 0.45;
  private dir = new THREE.Vector3(0.95, 0, -0.3).normalize();

  constructor(private readonly game: Game) {
    // Face the camera toward the sun (a lit face), from a little to one side for some modelling.
    const sky = (game as Game & { sky?: { sunDir?: THREE.Vector3 } }).sky;
    const sun = sky?.sunDir;
    if (sun && sun.y > 0.02) this.dir.set(sun.x, 0, sun.z).normalize();
    this.dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.35);
    const p = game.player;
    if (p) p.heading = Math.atan2(this.dir.x, this.dir.z); // start facing the camera
  }

  update(dt: number) {
    const p = this.game.player;
    if (p) p.heading += this.spin * dt;
  }

  lateUpdate(dt: number) {
    const p = this.game.player;
    if (!p) return;
    const real = dt > 0 ? dt : 1 / 60;
    // Paused frames don't run update(): keep turning here then.
    if (this.game.paused) p.heading += this.spin * real;
    p.root.rotation.y = p.heading;
    const cam = this.game.camera;
    const feet = p.root.position;
    target.set(feet.x, feet.y + 1.05, feet.z);
    // Keep the camera out of walls: shorten the distance if something is in the way.
    let dist = 3.2;
    const hit = this.game.physics.raycast(target, this.dir, dist + 0.3, Layer.World);
    if (hit) dist = Math.max(1.2, hit.distance - 0.3);
    toCam.copy(this.dir).multiplyScalar(dist);
    cam.position.copy(target).add(toCam);
    cam.position.y += 0.15;
    // Aim to the left of the avatar so it stands in the free space right of the panel.
    side.set(-this.dir.z, 0, this.dir.x); // camera's left when looking back along -dir
    const halfW = Math.tan((cam.fov * Math.PI) / 360) * cam.aspect;
    look.copy(target).addScaledVector(side, this.screenX() * halfW * dist);
    look.y -= 0.05;
    cam.lookAt(look);
  }
}
