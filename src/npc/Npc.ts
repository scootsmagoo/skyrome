/**
 * Npc: a living person in the streets — an Actor with a procedural humanoid, a brain slot, a
 * "Talk" interactable and the bookkeeping the population manager needs (simulation tier, steering
 * state, carried prop, lantern light).
 *
 * Collision: crowd NPCs are kinematic agents, never hard walls (GDD §14.7b). Their capsule only
 * collides with the world, so the player shoulders through and NPCs never wedge against each
 * other; steering keeps them apart. Hostile or fighting NPCs are made solid (`setSolid(true)`).
 */
import * as THREE from 'three';
import { Actor } from '../actors/Actor';
import type { IdleLoop } from '../actors/Actor';
import type { Appearance } from '../actors/appearance';
import { createHumanoid, type HumanoidAvatar } from '../actors/avatar/HumanoidAvatar';
import type { Game } from '../core/Game';
import { damp } from '../core/math';
import { groups, Layer } from '../core/Physics';
import type { Interactable } from '../interaction/Interactions';
import { Mover } from '../ai/life/mover';
import type { Positioned } from '../ai/life/spatialHash';
import type { CarriedProp } from './props';
import type { CrowdRole } from './crowd/roles';
import type { NpcDef } from './types';
import type { NpcBrain } from './brain';
import { combatOf } from './hooks';

export interface NpcOptions {
  id: string;
  /** Prompt label: the name for named NPCs, the role ("Citizen") for the crowd. */
  name: string;
  title?: string;
  appearance: Appearance;
  position: THREE.Vector3Like;
  heading?: number;
  def?: NpcDef;
  role?: CrowdRole;
  /** Part of the ambient crowd (despawned when far). */
  ambient: boolean;
  essential?: boolean;
  /** Walking speed (m/s). */
  speed?: number;
  /** Bark table key (barks.ts). */
  barks?: string;
  /** Avatar mesh detail (default 'auto': low mesh beyond 35 m). */
  lod?: 'high' | 'low' | 'auto';
}

/** Light handle shape from the sky module's light pool (kept structural to avoid a hard import). */
export interface CarriedLight {
  setPosition(p: THREE.Vector3Like): void;
  remove(): void;
}

const tmp = new THREE.Vector3();

export class Npc extends Actor implements Positioned {
  readonly humanoid: HumanoidAvatar;
  readonly def?: NpcDef;
  readonly role?: CrowdRole;
  readonly ambient: boolean;
  name: string;
  title?: string;
  essential: boolean;
  barkTable: string;
  walkSpeed: number;
  /** Behaviour; assigned by the population manager. */
  brain: NpcBrain | null = null;
  readonly mover = new Mover();
  /**
   * Simulation tier: 'full' = character controller + steering (near the player); 'mid' = steering +
   * kinematic gliding on the nav-grid floor; 'cheap' = kinematic path following only (far away).
   */
  sim: 'full' | 'mid' | 'cheap' = 'full';
  /** Horizontal distance to the player at the last check. */
  distToPlayer = 0;
  /** Inside the camera frustum at the last check. */
  inView = true;
  /** Seconds out of view (despawn decisions). */
  unseenFor = 0;
  prop: CarriedProp | null = null;
  light: CarriedLight | null = null;
  /** In a conversation with the player. */
  talking = false;
  dead = false;
  /** Turned on the player (dialogue attack, crimes); not interactable. */
  hostile = false;
  /** Controlled by a vignette script. */
  scripted = false;
  /** Followers (escorts) and the leader this one follows. */
  leader: Npc | null = null;
  followers: Npc[] = [];
  /** Spatial-hash coordinates (set every fixed step). */
  hx = 0;
  hz = 0;
  /** Steering wish from the last step (debug/tests). */
  readonly wish = new THREE.Vector3();
  readonly interactable: Interactable;
  /** null until the first setSolid() so the constructor always applies the groups. */
  private solid: boolean | null = null;
  private groundY: number | null = null;
  private groundT = 0;
  private lookTarget: THREE.Vector3 | null = null;
  private readonly lookPoint = new THREE.Vector3();
  private shadowFar = false;

  constructor(game: Game, opts: NpcOptions) {
    const humanoid = createHumanoid(opts.appearance, { lod: opts.lod ?? 'auto' });
    super(game, { id: opts.id, position: opts.position, heading: opts.heading ?? 0, layer: Layer.Npc, avatar: humanoid, radius: 0.3, halfHeight: 0.55 });
    this.humanoid = humanoid;
    this.def = opts.def;
    this.role = opts.role;
    this.ambient = opts.ambient;
    this.name = opts.name;
    this.title = opts.title;
    this.essential = opts.essential ?? opts.def?.essential ?? false;
    this.barkTable = opts.barks ?? opts.role?.barks ?? 'citizen';
    this.walkSpeed = opts.speed ?? 1.3;
    this.setSolid(opts.def?.disposition === 'hostile');
    this.hx = opts.position.x;
    this.hz = opts.position.z;
    const head = new THREE.Vector3();
    this.interactable = {
      id: `npc:${this.id}`,
      reach: 2.6,
      position: () => head.copy(this.root.position).setY(this.root.position.y + (this.humanoid.eyeHeight ?? 1.55) - 0.1),
      verb: () => 'Talk',
      label: () => this.name,
      detail: () => this.title ?? null,
      enabled: () => !this.dead && !this.hostile && !this.scripted && !this.isFighting(),
      interact: () => this.game.population?.talkTo(this),
    };
  }

  /** In combat according to the combat module (if installed). */
  isFighting(): boolean {
    return !!combatOf(this.game)?.isInCombat?.(this);
  }

  /** Solid NPCs block the player (hostiles, fighters); crowd NPCs are soft. */
  setSolid(on: boolean) {
    if (on === this.solid) return;
    this.solid = on;
    const filter = on ? Layer.World | Layer.Player | Layer.Npc : Layer.World;
    this.body.collider.setCollisionGroups(groups(Layer.Npc, filter));
  }

  get isSolid() {
    return !!this.solid;
  }

  /** Set the idle loop (or null to stand). */
  setLoop(loop: IdleLoop | null) {
    this.humanoid.setIdleLoop(loop);
  }

  /** Track a world point with the head (null to stop). Cheap to call every frame. */
  lookAtPoint(p: THREE.Vector3 | null) {
    if (!p) {
      if (this.lookTarget) {
        this.lookTarget = null;
        this.humanoid.lookAt(null);
      }
      return;
    }
    this.lookPoint.copy(p);
    if (!this.lookTarget) {
      this.lookTarget = this.lookPoint;
      this.humanoid.lookAt(this.lookPoint);
    }
  }

  /**
   * Cheap far-away movement: no character controller, no gravity. Follows the floor height given
   * by `floor(x, z)` (nav grid), refreshing it with a ray at most every 0.3 s otherwise.
   */
  glide(wish: THREE.Vector3Like, dt: number, floor: (x: number, z: number) => number | null) {
    const v = this.velocity;
    const k = damp(8, dt);
    v.x += (wish.x - v.x) * k;
    v.z += (wish.z - v.z) * k;
    v.y = 0;
    const nx = this.currPos.x + v.x * dt;
    const nz = this.currPos.z + v.z * dt;
    let y = floor(nx, nz);
    if (y === null) {
      this.groundT -= dt;
      if (this.groundT <= 0 || this.groundY === null) {
        this.groundT = 0.3;
        this.groundY = this.game.physics.groundHeight(nx, nz, this.currPos.y + 2.5, 8);
      }
      y = this.groundY ?? this.currPos.y;
    }
    const ny = this.currPos.y + (y - this.currPos.y) * damp(12, dt);
    this.prevPos.copy(this.currPos);
    this.currPos.set(nx, ny, nz);
    this.grounded = true;
    this.body.body.setNextKinematicTranslation({ x: nx, y: ny + this.body.halfHeight + this.body.radius, z: nz });
  }

  /** Turn shadows off far away (tech.md §5.6: no shadows beyond ~50 m). */
  updateShadow(dist: number) {
    const far = dist > 50;
    if (far === this.shadowFar) return;
    this.shadowFar = far;
    this.humanoid.mesh.castShadow = !far;
    if (this.prop?.object) this.prop.object.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = !far) : null));
  }

  /** Follow carried light and keep hanging props plumb (once per frame, after animation). */
  updateCarried() {
    this.prop?.update?.();
    if (this.light && this.prop?.lightPoint) {
      this.prop.lightPoint.getWorldPosition(tmp);
      this.light.setPosition(tmp);
    }
  }

  /** Heading toward a point. */
  headingTo(x: number, z: number) {
    return Math.atan2(x - this.position.x, z - this.position.z);
  }

  override dispose() {
    this.prop?.dispose();
    this.prop = null;
    this.light?.remove();
    this.light = null;
    super.dispose();
  }
}
