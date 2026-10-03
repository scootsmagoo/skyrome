/**
 * First/third-person camera. V toggles; the mouse wheel zooms the third-person camera and
 * scrolling all the way in switches to first person (and back out again), as in Skyrim.
 * The third-person camera sits over the right shoulder and is pulled in when walls block it.
 */
import * as THREE from 'three';
import type { Game, System } from '../core/Game';
import { Layer } from '../core/Physics';
import { clamp, damp } from '../core/math';
import type { Player } from './Player';

export const CAMERA = {
  minZoom: 1.4,
  maxZoom: 7,
  zoomStep: 0.6,
  shoulder: 0.42,
  pivotHeight: 1.55,
  collisionPadding: 0.22,
  fovSprintBoost: 6,
};

const pivot = new THREE.Vector3();
const offset = new THREE.Vector3();
const desired = new THREE.Vector3();
const dir = new THREE.Vector3();

export class CameraRig implements System {
  readonly name = 'cameraRig';
  readonly priority = 100;
  /** 0 = first person, 1 = fully third person; animated for a smooth switch. */
  private blend: number;
  private currentDist: number;
  /** Extra camera shake offset (combat module writes here). */
  readonly shake = new THREE.Vector3();
  /** Lock-on framing (combat): the third-person camera pulls back to at least this distance (m); 0 = off. */
  framingDistance = 0;

  constructor(
    private readonly game: Game,
    private readonly player: Player,
  ) {
    this.blend = player.viewMode === 'third' ? 1 : 0;
    this.currentDist = player.zoom;
    player.avatar?.setFirstPerson?.(player.viewMode === 'first');
  }

  update() {
    const { input } = this.game;
    const p = this.player;
    if (input.pressed('toggleView')) p.setViewMode(p.viewMode === 'first' ? 'third' : 'first');
    if (input.pressed('zoomIn')) {
      if (p.viewMode === 'third') {
        if (p.zoom <= CAMERA.minZoom + 0.01) p.setViewMode('first');
        else p.zoom = clamp(p.zoom - CAMERA.zoomStep, CAMERA.minZoom, CAMERA.maxZoom);
      }
    }
    if (input.pressed('zoomOut')) {
      if (p.viewMode === 'first') {
        p.zoom = CAMERA.minZoom + 0.6;
        p.setViewMode('third');
      } else p.zoom = clamp(p.zoom + CAMERA.zoomStep, CAMERA.minZoom, CAMERA.maxZoom);
    }
  }

  lateUpdate(dt: number) {
    const { camera, physics, settings } = this.game;
    const p = this.player;
    const target = p.viewMode === 'third' ? 1 : 0;
    this.blend += (target - this.blend) * damp(10, dt);
    if (Math.abs(this.blend - target) < 0.002) this.blend = target;

    // Camera orientation straight from yaw/pitch.
    camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');

    const feet = p.root.position; // interpolated
    const eye = p.eyeHeight;
    if (this.blend === 0) {
      // Eyes slightly in front of the head center so the body doesn't clip the near plane.
      camera.position.set(feet.x, feet.y + eye, feet.z);
      dir.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      camera.position.addScaledVector(dir, 0.12);
    } else {
      pivot.set(feet.x, feet.y + lerp(eye, CAMERA.pivotHeight, this.blend), feet.z);
      // Shoulder offset to the camera's right.
      offset.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw)).multiplyScalar(CAMERA.shoulder * this.blend);
      pivot.add(offset);
      dir.set(0, 0, 1).applyEuler(camera.rotation); // backwards from the camera's view
      const wantDist = Math.max(p.zoom, this.framingDistance) * this.blend;
      // Collision: pull in if geometry is between pivot and camera.
      const hit = physics.raycast(pivot, dir, wantDist + CAMERA.collisionPadding, Layer.World | Layer.CameraBlock);
      let dist = wantDist;
      if (hit) dist = Math.max(0.1, hit.distance - CAMERA.collisionPadding);
      // Snap in fast, ease out slowly.
      this.currentDist = dist < this.currentDist ? dist : this.currentDist + (dist - this.currentDist) * damp(4, dt);
      desired.copy(pivot).addScaledVector(dir, this.currentDist);
      camera.position.copy(desired);
    }
    camera.position.add(this.shake);

    const fovTarget = settings.data.fov + (p.sprinting ? CAMERA.fovSprintBoost : 0);
    if (Math.abs(camera.fov - fovTarget) > 0.01) {
      camera.fov = camera.fov + (fovTarget - camera.fov) * damp(6, dt);
      camera.updateProjectionMatrix();
    }

    // Hide the avatar when the camera is inside it.
    // Avatars that support first person stay visible (headless body); placeholders hide.
    if (p.avatar) p.avatar.root.visible = this.blend > 0.15 || (p.viewMode === 'first' && !!p.avatar.setFirstPerson);
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
