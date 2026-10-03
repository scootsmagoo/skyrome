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
import type { Appearance, ArmorLook, Garment, ShieldModel, WeaponModel } from '../appearance';
import { B, BONES, localOffset, type BoneName, type Rig } from './rig';
import { acquireAvatarGeometry, appearanceKey, boneInverses, createBones, releaseAvatarGeometry, type AvatarGeometry } from './buildAvatar';
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

/** Beyond this distance (m) the body stops casting shadows (a full shadow-pass mesh for a few pixels). */
const SHADOW_FAR = 40;
/** Lazy low-LOD builds are spread out: at most one per this many milliseconds (all avatars). */
const LOD_BUILD_INTERVAL_MS = 6;
let lastLodBuild = -Infinity;

export class HumanoidAvatar implements CombatAvatar {
  readonly root = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly bones: THREE.Bone[];
  readonly skeleton: THREE.Skeleton;
  readonly anim: AnimationController;
  readonly equipment: Equipment;
  /** Body proportions (changes only through setAppearance). */
  rig: Rig;
  eyeHeight: number;
  private app: Appearance;
  /** Geometry at the primary LOD ('high', or 'low' for lod: 'low'), held from the cache. */
  private geoHigh: AvatarGeometry;
  /** Far geometry for lod: 'auto', built on the first switch. */
  private geoLow: AvatarGeometry | null = null;
  private far = false;
  private lodMode: LOD | 'auto';
  private sockets = new Map<ExtraSocket, THREE.Object3D>();
  private socketBase = new Map<ExtraSocket, readonly [number, number, number]>();
  private firstPerson = false;
  private dead = false;
  private disposed = false;
  /** Whether the body casts shadows at all (it stops beyond SHADOW_FAR). */
  private readonly castsShadow: boolean;

  constructor(app: Appearance, opts: HumanoidOptions = {}) {
    this.app = app;
    this.lodMode = opts.lod ?? 'high';
    this.geoHigh = acquireAvatarGeometry(app, this.lodMode === 'low' ? 'low' : 'high');
    this.rig = this.geoHigh.rig;
    this.eyeHeight = this.rig.eyeHeight;
    this.bones = createBones(this.rig);
    this.root.name = 'humanoid';
    this.mesh = new THREE.SkinnedMesh(this.geoHigh.geometry, avatarMaterial());
    this.mesh.name = 'humanoid:body';
    this.mesh.add(this.bones[0]);
    this.mesh.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones, boneInverses(this.rig));
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    this.castsShadow = opts.castShadow ?? true;
    this.mesh.castShadow = this.castsShadow;
    this.mesh.receiveShadow = true;
    this.setBounds();
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

  /** The appearance this avatar was built from (see setAppearance). */
  get appearance(): Appearance {
    return this.app;
  }

  private setBounds() {
    // Generous fixed bounds (covers lying down and reaching overhead) — cheaper than recomputing.
    const h = this.rig.height;
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, h * 0.5, 0), h * 1.15);
  }

  /**
   * Rebuild the body for a new appearance (armor or clothes equipped, a disguise, aging...). The
   * skeleton, animation state, equipment and first-person state carry over; if the proportions
   * changed (height, build, sex, age) the joints move and the mesh is re-bound to them.
   * The carried weapon and shield are not taken from the new appearance (use setWeapon/setShield).
   */
  setAppearance(app: Appearance) {
    if (this.disposed || appearanceKey(app, 'high') === appearanceKey(this.app, 'high')) return;
    const oldHigh = this.geoHigh;
    const oldLow = this.geoLow;
    this.app = app;
    this.geoHigh = acquireAvatarGeometry(app, this.lodMode === 'low' ? 'low' : 'high');
    this.geoLow = null;
    releaseAvatarGeometry(oldHigh);
    if (oldLow) releaseAvatarGeometry(oldLow);
    const rig = this.geoHigh.rig;
    const moved = rig.joints.some((v, i) => Math.abs(v - this.rig.joints[i]) > 1e-6);
    this.rig = rig;
    this.eyeHeight = rig.eyeHeight;
    if (moved) {
      BONES.forEach((n, i) => {
        const [x, y, z] = localOffset(rig, n);
        this.bones[i].position.set(x, y, z);
      });
      const inv = boneInverses(rig);
      this.skeleton.boneInverses.forEach((m, i) => m.copy(inv[i]));
      for (const [name, p] of this.socketBase) this.sockets.get(name)!.position.set(p[0] * rig.s, p[1] * rig.s, p[2] * rig.s);
      this.setBounds();
    }
    this.mesh.geometry = this.geoHigh.geometry;
    this.far = false;
    this.anim.refreshAppearance();
    this.equipment.refreshAppearance();
  }

  /** Change the armor look (helmet, body armor, manica, greaves); undefined removes it all. */
  setArmor(armor: ArmorLook | undefined) {
    this.setAppearance({ ...this.app, armor });
  }

  /** Change the clothes (and optionally the footwear). */
  setGarments(garments: Garment[], footwear?: Appearance['footwear']) {
    this.setAppearance({ ...this.app, garments, ...(footwear ? { footwear } : {}) });
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
      this.socketBase.set(name, pos);
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
    // Slung on the back: the shield's top edge at the shoulder blades (it hangs below this point,
    // see Equipment), leaning a little toward the left shoulder strap, the bottom off the calves.
    add('backShield', 'chest', [0, 0.18, -0.17], [5 * D, Math.PI, 9 * D]);
    // Bow on the back, the upper limb over the left shoulder where the bow hand reaches for it.
    add('backWeapon', 'chest', [-0.02, 0.1, -0.12], [0, 0, -40 * D]);
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
    // Action clocks and their events run every frame; only the pose sampling is throttled.
    this.anim.advance(dt);
    if (step > 0) {
      this.anim.update(step, state);
      this.updateLod();
    }
    this.equipment.update(dt);
  }

  private updateLod() {
    const d = avatarLod.distance(this);
    if (this.castsShadow) this.mesh.castShadow = this.mesh.castShadow ? d < SHADOW_FAR + 2 : d < SHADOW_FAR;
    if (this.lodMode !== 'auto') return;
    // Switch beyond 36 m, back within 34 m (no flicker for someone loitering at the boundary).
    const far = this.far ? d > 34 : d > 36;
    if (far && !this.geoLow) {
      // Build the far mesh on first need, spread over frames when a crowd crosses at once.
      const now = performance.now();
      if (now - lastLodBuild < LOD_BUILD_INTERVAL_MS) return;
      lastLodBuild = now;
      this.geoLow = acquireAvatarGeometry(this.app, 'low');
    }
    this.far = far;
    const g = far ? this.geoLow!.geometry : this.geoHigh.geometry;
    if (this.mesh.geometry !== g) this.mesh.geometry = g;
  }

  setFirstPerson(on: boolean) {
    this.firstPerson = on;
    this.anim.firstPerson = on;
    // The neck and head bones collapse (neck, head, hair, helmet vanish into the base of the neck,
    // below and behind the camera); the body stays for looking down.
    this.bones[B.neck].scale.setScalar(on ? 0.001 : 1);
    this.bones[B.head].scale.setScalar(on ? 0.001 : 1);
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
  }

  /** THREE.AnimationClip for a named clip, for use with THREE.AnimationMixer if preferred. */
  getAnimationClip(name: string): THREE.AnimationClip | null {
    return this.anim.getAnimationClip(name);
  }

  get triangles() {
    return this.geoHigh.triangles;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.equipment.dispose();
    this.root.removeFromParent();
    // Materials are shared; geometry is cached per appearance and released here (the cache disposes
    // it once nobody holds it and it ages out). The bone texture is ours.
    this.skeleton.dispose();
    releaseAvatarGeometry(this.geoHigh);
    if (this.geoLow) releaseAvatarGeometry(this.geoLow);
    this.geoLow = null;
  }
}

export function createHumanoid(app: Appearance, opts?: HumanoidOptions): HumanoidAvatar {
  return new HumanoidAvatar(app, opts);
}

