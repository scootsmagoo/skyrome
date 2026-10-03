/**
 * HumanoidAvatar: a procedural skinned character implementing CombatAvatar.
 *
 *   const avatar = createHumanoid(appearance);          // or { lod: 'low' | 'auto' }
 *   const actor = new Actor(game, { id, position, avatar });
 *   avatar.setStance('oneHandShield'); avatar.setDrawn(true);
 *   avatar.play('attackLight1', { onHit: () => combat.resolve(), onEnd: (interrupted) => {} });
 *
 * One SkinnedMesh (one draw call), plus attached weapon/shield meshes. Animation runs in
 * AnimationController (anim/controller.ts); distant avatars update less often (see lod.ts).
 */
import * as THREE from 'three';
import type { ActionClip, CombatAvatar, IdleLoop, LocomotionState, PlayOptions, Stance } from '../Actor';
import type { Appearance, ShieldModel, WeaponModel } from '../appearance';
import { BONES, B, BONE_COUNT, type BoneName, type Rig } from './rig';
import { buildAvatarGeometry, createBones, type AvatarGeometry } from './buildAvatar';
import { avatarMaterial } from './material';
import { AnimationController } from './anim/controller';
import { avatarLod } from './lod';
import { Equipment } from '../equipment/Equipment';
import type { LOD } from './build/common';

export type SocketName = 'handR' | 'handL' | 'head' | 'chest' | 'hips' | 'back';
export type ExtraSocket = SocketName | 'gripR' | 'gripL' | 'shieldL' | 'sheathR' | 'sheathL' | 'backShield' | 'backWeapon';

export interface HumanoidOptions {
  /** 'auto' keeps a low-detail mesh for distances beyond ~35 m. Default 'high'. */
  lod?: LOD | 'auto';
  castShadow?: boolean;
  /** Override the appearance's weapon/shield. */
  weapon?: WeaponModel;
  shield?: ShieldModel;
}

export class HumanoidAvatar implements CombatAvatar {
  readonly root = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly bones: THREE.Bone[];
  readonly skeleton: THREE.Skeleton;
  readonly rig: Rig;
  readonly appearance: Appearance;
  readonly anim: AnimationController;
  readonly equipment: Equipment;
  eyeHeight: number;
  private geoHigh: AvatarGeometry;
  private geoLow: AvatarGeometry | null = null;
  private lodMode: LOD | 'auto';
  private sockets = new Map<ExtraSocket, THREE.Object3D>();
  private firstPerson = false;
  private dead = false;
  private disposed = false;

  constructor(app: Appearance, opts: HumanoidOptions = {}) {
    this.appearance = app;
    this.lodMode = opts.lod ?? 'high';
    const initial: LOD = this.lodMode === 'low' ? 'low' : 'high';
    this.geoHigh = buildAvatarGeometry(app, initial);
    if (this.lodMode === 'auto') this.geoLow = buildAvatarGeometry(app, 'low');
    this.rig = this.geoHigh.rig;
    this.eyeHeight = this.rig.eyeHeight;
    this.bones = createBones(this.rig);
    this.root.name = 'humanoid';
    this.mesh = new THREE.SkinnedMesh(this.geoHigh.geometry, avatarMaterial());
    this.mesh.name = 'humanoid:body';
    this.mesh.add(this.bones[0]);
    this.mesh.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    this.mesh.castShadow = opts.castShadow ?? true;
    this.mesh.receiveShadow = true;
    // Generous fixed bounds (covers lying down and reaching overhead) — cheaper than recomputing.
    const h = this.rig.height;
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, h * 0.5, 0), h * 1.15);
    this.root.add(this.mesh);
    this.createSockets();
    this.anim = new AnimationController(this);
    this.equipment = new Equipment(this, {
      weapon: opts.weapon ?? app.weapon ?? 'none',
      shield: opts.shield ?? app.shield?.model ?? 'none',
      shieldColor: app.shield?.color,
      emblem: app.shield?.emblem,
      appearance: app,
    });
    this.anim.setStance(this.equipment.defaultStance());
  }

  // ------------------------------------------------------------------ sockets

  private createSockets() {
    const s = this.rig.s;
    const add = (name: ExtraSocket, bone: BoneName, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]) => {
      const o = new THREE.Object3D();
      o.name = `socket:${name}`;
      o.position.set(pos[0] * s, pos[1] * s, pos[2] * s);
      o.rotation.set(rot[0], rot[1], rot[2]);
      this.bones[B[bone]].add(o);
      this.sockets.set(name, o);
      return o;
    };
    const D = Math.PI / 180;
    // Grip: center of the fist; weapon +Y points out of the thumb side (forward in the bind pose).
    add('handR', 'handR', [0.006, -0.06, 0.012]);
    add('handL', 'handL', [-0.006, -0.06, 0.012]);
    // The handle runs through the curled fingers on the palm side of the hand (+X for the right hand).
    add('gripR', 'handR', [0.026, -0.08, 0.002], [90 * D, 0, 0]);
    add('gripL', 'handL', [-0.026, -0.08, 0.002], [90 * D, 0, 0]);
    // Shield: handle axis along the grip; the face points the way the knuckles point.
    add('shieldL', 'handL', [-0.026, -0.08, 0.002], [90 * D, 0, -90 * D]);
    add('head', 'head', [0, 0.1, 0.01]);
    add('chest', 'chest', [0, 0.1, 0.09]);
    add('hips', 'hips', [0, 0, 0]);
    add('back', 'chest', [0, 0.08, -0.13]);
    add('backShield', 'chest', [0, 0.02, -0.16], [0, Math.PI, 0]);
    add('backWeapon', 'chest', [0.02, 0.1, -0.12], [0, 0, 40 * D]);
    // Scabbard mouths at the belt; items hang along -Y, the bottom swung slightly back.
    add('sheathR', 'hips', [-0.185, 0.07, 0.03], [14 * D, 0, -6 * D]);
    add('sheathL', 'hips', [0.185, 0.07, 0.03], [14 * D, 0, 6 * D]);
  }

  getSocket(name: SocketName): THREE.Object3D;
  getSocket(name: ExtraSocket): THREE.Object3D;
  getSocket(name: ExtraSocket): THREE.Object3D {
    return this.sockets.get(name)!;
  }

  bone(name: BoneName): THREE.Bone {
    return this.bones[B[name]];
  }

  // ------------------------------------------------------------------ AvatarView

  update(dt: number, state: LocomotionState) {
    if (this.disposed) return;
    const step = avatarLod.step(this, dt);
    if (step > 0) {
      this.anim.update(step, state);
      this.updateLod();
    }
    this.equipment.update(dt);
  }

  private updateLod() {
    if (this.lodMode !== 'auto' || !this.geoLow) return;
    const far = avatarLod.distance(this) > 35;
    const g = far ? this.geoLow.geometry : this.geoHigh.geometry;
    if (this.mesh.geometry !== g) this.mesh.geometry = g;
  }

  setFirstPerson(on: boolean) {
    this.firstPerson = on;
    this.anim.firstPerson = on;
    // The head bone collapses (head, hair, helmet vanish); the body stays for looking down.
    const hb = this.bones[B.head];
    hb.scale.setScalar(on ? 0.001 : 1);
    this.equipment.setFirstPerson(on);
  }

  get isFirstPerson() {
    return this.firstPerson;
  }

  // ------------------------------------------------------------------ CombatAvatar

  setStance(stance: Stance) {
    this.anim.setStance(stance);
  }

  setDrawn(drawn: boolean) {
    this.anim.setDrawn(drawn);
  }

  setBlocking(blocking: boolean) {
    this.anim.setBlocking(blocking);
  }

  setCharge(charge: number) {
    this.anim.setCharge(charge);
  }

  play(clip: ActionClip, opts?: PlayOptions) {
    this.anim.play(clip, opts);
  }

  isBusy(): boolean {
    return this.dead || this.anim.isBusy();
  }

  setIdleLoop(loop: IdleLoop | null) {
    this.anim.setIdleLoop(loop);
  }

  setDead(dead: boolean) {
    this.dead = dead;
    this.anim.setDead(dead);
  }

  lookAt(p: THREE.Vector3 | null) {
    this.anim.lookAt(p);
  }

  /** Camera pitch (radians, + up) for first-person arms and aiming. */
  setAimPitch(pitch: number) {
    this.anim.aimPitch = pitch;
  }

  // ------------------------------------------------------------------ equipment helpers

  setWeapon(model: WeaponModel) {
    this.equipment.setWeapon(model);
    this.anim.setStance(this.equipment.defaultStance());
  }

  setShield(model: ShieldModel, color?: string, emblem?: string) {
    this.equipment.setShield(model, color, emblem);
    this.anim.setStance(this.equipment.defaultStance());
  }

  /** Carry a lit torch in the off hand. */
  setTorch(on: boolean) {
    this.equipment.setTorch(on);
    this.anim.torch = on;
  }

  /** THREE.AnimationClip for a named clip, for use with THREE.AnimationMixer if preferred. */
  getAnimationClip(name: string): THREE.AnimationClip | null {
    return this.anim.getAnimationClip(name);
  }

  get triangles() {
    return this.geoHigh.triangles;
  }

  dispose() {
    this.disposed = true;
    this.equipment.dispose();
    this.root.removeFromParent();
    // Geometry is cached/shared; materials are shared. Only the bone texture is ours.
    this.skeleton.dispose();
  }
}

export function createHumanoid(app: Appearance, opts?: HumanoidOptions): HumanoidAvatar {
  return new HumanoidAvatar(app, opts);
}

export { BONES, BONE_COUNT };
