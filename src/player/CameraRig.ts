/**
 * First/third-person camera (GDD §4.4). V toggles; the mouse wheel zooms the third-person camera
 * and, in the Mouse preset (`zoomToFirstPerson`), scrolling all the way in switches to first person
 * (and back out again), as in Skyrim. The third-person camera sits over the right shoulder (H swaps
 * shoulders) and is pulled in when walls block it.
 *
 * First person rides the avatar's head bone ("true first person"): the eye follows the bone with
 * ~0.05 s of smoothing, while rotation comes only from look input. A probe toward the eye keeps
 * the camera ≥ 0.25 m from walls. Avatars without a head bone fall back to a fixed eye height.
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
  /** First person: smoothing of the head-bone eye (s) and the wall margin (m). */
  headSmoothing: 0.05,
  wallMargin: 0.25,
  /** Shoulder swap duration (s). */
  shoulderTime: 0.25,
};

/** What the rig needs from an avatar with a skeleton (HumanoidAvatar provides it). */
interface HeadBoneAvatar {
  bone?(name: 'head'): THREE.Object3D;
  rig?: { headH: number; s: number };
}

const pivot = new THREE.Vector3();
const offset = new THREE.Vector3();
const desired = new THREE.Vector3();
const dir = new THREE.Vector3();
const eye = new THREE.Vector3();
const fwd = new THREE.Vector3();
const from = new THREE.Vector3();

export class CameraRig implements System {
  readonly name = 'cameraRig';
  readonly priority = 100;
  /** 0 = first person, 1 = fully third person; animated for a smooth switch. */
  private blend: number;
  private currentDist: number;
  /** Extra camera shake offset (combat module writes here). */
  readonly shake = new THREE.Vector3();
  /** +1 over the right shoulder (default), −1 over the left. H swaps (GDD §4.4). */
  shoulderSide: 1 | -1 = 1;
  private shoulderBlend = 1;
  /** Mouse preset: zooming fully in enters first person, out leaves it (off in Trackpad/Keyboard). */
  zoomToFirstPerson = true;
  /** Ride the avatar's head bone in first person when it has one. */
  headBoneCamera = true;
  /** Smoothed eye offset from the feet in first person (world axes). */
  private eyeOffset = new THREE.Vector3();
  private eyeInit = false;

  constructor(
    private readonly game: Game,
    private readonly player: Player,
  ) {
    this.blend = player.viewMode === 'third' ? 1 : 0;
    this.currentDist = player.zoom;
    player.avatar?.setFirstPerson?.(player.viewMode === 'first');
  }

  /** Swap the third-person camera to the other shoulder. */
  swapShoulder() {
    this.shoulderSide = this.shoulderSide === 1 ? -1 : 1;
  }

  update() {
    const { input } = this.game;
    const p = this.player;
    if (input.pressed('toggleView')) p.setViewMode(p.viewMode === 'first' ? 'third' : 'first');
    if (input.pressed('shoulderSwap')) this.swapShoulder();
    if (input.pressed('zoomIn')) {
      if (p.viewMode === 'third') {
        if (p.zoom <= CAMERA.minZoom + 0.01) {
          if (this.zoomToFirstPerson) p.setViewMode('first');
        } else p.zoom = clamp(p.zoom - CAMERA.zoomStep, CAMERA.minZoom, CAMERA.maxZoom);
      }
    }
    if (input.pressed('zoomOut')) {
      if (p.viewMode === 'first') {
        if (this.zoomToFirstPerson) {
          p.zoom = CAMERA.minZoom + 0.6;
          p.setViewMode('third');
        }
      } else p.zoom = clamp(p.zoom + CAMERA.zoomStep, CAMERA.minZoom, CAMERA.maxZoom);
    }
  }

  lateUpdate(dt: number) {
    const { camera, physics, settings } = this.game;
    const p = this.player;
    const target = p.viewMode === 'third' ? 1 : 0;
    this.blend += (target - this.blend) * damp(10, dt);
    if (Math.abs(this.blend - target) < 0.002) this.blend = target;
    const side = this.shoulderSide;
    this.shoulderBlend += clamp(side - this.shoulderBlend, -dt / (CAMERA.shoulderTime / 2), dt / (CAMERA.shoulderTime / 2));

    // Camera orientation straight from yaw/pitch.
    camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');

    const feet = p.root.position; // interpolated
    this.firstPersonEye(feet, dt, eye);
    if (this.blend === 0) {
      camera.position.copy(eye);
    } else {
      // Pivot over the shoulder, blended from the eye so the switch is continuous.
      pivot.set(feet.x, feet.y + CAMERA.pivotHeight, feet.z);
      offset.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw)).multiplyScalar(CAMERA.shoulder * this.shoulderBlend);
      pivot.add(offset).lerp(eye, 1 - this.blend);
      dir.set(0, 0, 1).applyEuler(camera.rotation); // backwards from the camera's view
      const wantDist = p.zoom * this.blend;
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

  /**
   * The first-person eye in world space: on the head bone (eyes ~0.35 head-heights above the atlas
   * joint and a little forward), smoothed relative to the feet so walking doesn't make it trail;
   * pulled back from walls closer than `wallMargin`.
   */
  private firstPersonEye(feet: THREE.Vector3, dt: number, out: THREE.Vector3) {
    const p = this.player;
    fwd.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const av = p.avatar as (HeadBoneAvatar & { root: THREE.Object3D }) | null;
    const bone = this.headBoneCamera ? av?.bone?.('head') : undefined;
    if (bone && av?.rig) {
      bone.updateWorldMatrix(true, false);
      out.setFromMatrixPosition(bone.matrixWorld);
      out.y += av.rig.headH * 0.345;
      out.addScaledVector(fwd, 0.06 + 0.04 * av.rig.s);
      out.sub(feet);
      if (!this.eyeInit || this.blend > 0.5) {
        this.eyeOffset.copy(out);
        this.eyeInit = true;
      } else this.eyeOffset.lerp(out, damp(1 / CAMERA.headSmoothing, dt));
      out.copy(feet).add(this.eyeOffset);
    } else {
      // Eyes slightly in front of the head center so the body doesn't clip the near plane.
      out.set(feet.x, feet.y + p.eyeHeight, feet.z).addScaledVector(fwd, 0.12);
    }
    // Keep the eye off walls: probe from the body's axis toward the eye plus the margin.
    from.set(feet.x, out.y, feet.z);
    dir.subVectors(out, from);
    const len = dir.length();
    if (len > 1e-4) {
      dir.divideScalar(len);
      const hit = this.game.physics.raycast(from, dir, len + CAMERA.wallMargin, Layer.World | Layer.CameraBlock);
      if (hit) out.copy(from).addScaledVector(dir, Math.max(0, hit.distance - CAMERA.wallMargin));
    }
    return out;
  }
}
