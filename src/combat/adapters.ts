/**
 * Adapters from the game's Actor and avatars to the combat core's CombatBody / CombatView.
 */
import * as THREE from 'three';
import type { ActionClip, Actor, CombatAvatar } from '../actors/Actor';
import { isCombatAvatar } from '../actors/Actor';
import { HumanoidAvatar } from '../actors/avatar/HumanoidAvatar';
import { actionInfo } from '../actors/avatar/anim/library';
import { groups, Layer } from '../core/Physics';
import type { CombatBody, CombatView, PlayClipOptions } from './Combatant';

/** An Actor's capsule as a combat body. */
export class ActorBody implements CombatBody {
  private groupsAlive: number;

  constructor(readonly actor: Actor) {
    this.groupsAlive = actor.body.collider.collisionGroups();
  }

  get id() {
    return this.actor.id;
  }

  get position() {
    return this.actor.position;
  }

  get heading() {
    return this.actor.heading;
  }

  set heading(h: number) {
    this.actor.heading = h;
  }

  get radius() {
    return this.actor.body.radius;
  }

  get height() {
    return (this.actor.body.halfHeight + this.actor.body.radius) * 2;
  }

  move(wish: { x: number; z: number }, dt: number, accel?: number) {
    this.actor.locomote({ x: wish.x, y: 0, z: wish.z }, dt, accel ? { accel } : {});
  }

  /** A corpse or a knocked-out body: only the world collides with it. */
  setGhost(ghost: boolean) {
    if (this.actor.disposed) return;
    this.actor.body.collider.setCollisionGroups(ghost ? groups(Layer.Debris, Layer.World) : this.groupsAlive);
  }

  velocity() {
    return { x: this.actor.velocity.x, z: this.actor.velocity.z };
  }
}

/** Contract name → the avatar library's action name for timing lookups. */
function libName(clip: ActionClip): string {
  return clip;
}

/** A CombatAvatar (the procedural humanoid, or any avatar implementing the contract). */
export class AvatarCombatView implements CombatView {
  private netMeshes: THREE.Object3D[] | null = null;

  constructor(readonly avatar: CombatAvatar) {}

  static from(a: unknown): AvatarCombatView | null {
    return isCombatAvatar(a as CombatAvatar) ? new AvatarCombatView(a as CombatAvatar) : null;
  }

  play(clip: ActionClip, opts?: PlayClipOptions) {
    this.avatar.play(clip, opts);
  }

  clipHit(clip: ActionClip): number | undefined {
    const a = this.avatar;
    if (!(a instanceof HumanoidAvatar)) return undefined;
    return actionInfo(a.equipment.defaultStance(), libName(clip))?.hit;
  }

  clipWindup(clip: ActionClip): number | undefined {
    const a = this.avatar;
    if (!(a instanceof HumanoidAvatar)) return undefined;
    return actionInfo(a.equipment.defaultStance(), libName(clip))?.windup;
  }

  setDrawn(drawn: boolean) {
    this.avatar.setDrawn(drawn);
  }

  setBlocking(on: boolean) {
    this.avatar.setBlocking(on);
  }

  setCharge(c: number) {
    this.avatar.setCharge?.(c);
  }

  setDead(dead: boolean) {
    this.avatar.setDead(dead);
  }

  hand(out: THREE.Vector3): boolean {
    const s = this.avatar.getSocket('handR');
    if (!s) return false;
    s.getWorldPosition(out);
    return Number.isFinite(out.x);
  }

  shoulder(out: THREE.Vector3): boolean {
    const s = this.avatar.getSocket('chest');
    if (!s) return false;
    s.getWorldPosition(out);
    return Number.isFinite(out.x);
  }

  /** The retiarius' net rides in his off hand (Equipment adds a mesh named 'net'). */
  setNet(on: boolean) {
    if (!this.netMeshes) {
      this.netMeshes = [];
      this.avatar.root.traverse((o) => {
        if (o.name === 'net') this.netMeshes!.push(o);
      });
    }
    for (const m of this.netMeshes) m.visible = on;
  }
}
