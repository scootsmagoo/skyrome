/**
 * Actor: anything that walks — the player, citizens, guards, enemies, animals.
 *
 * Owns a kinematic capsule (Rapier character controller) and a visual root positioned at the
 * FEET and rotated to `heading` (models face +Z locally; see core/math.ts). Locomotion runs in
 * fixed steps; `syncVisual(alpha)` interpolates the visual between the last two physics states.
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Layer, type CharacterBody } from '../core/Physics';
import { approachAngle, damp } from '../core/math';

export interface LocomotionState {
  /** Horizontal speed, m/s. */
  speed: number;
  /** Speed along the actor's facing (negative = backpedal). */
  forwardSpeed: number;
  /** Speed to the actor's right. */
  strafeSpeed: number;
  verticalSpeed: number;
  grounded: boolean;
  sprinting: boolean;
  sneaking: boolean;
  /** rad/s, positive = turning left (counter-clockwise from above). */
  turnRate: number;
}

/** The visual side of an actor (procedural avatar, glTF model, or a placeholder). */
export interface AvatarView {
  /** Positioned at the feet, facing +Z. Added under Actor.root. */
  readonly root: THREE.Object3D;
  update(dt: number, state: LocomotionState): void;
  /** Hide head/hair/helmet for the first-person camera. */
  setFirstPerson?(on: boolean): void;
  /** Eye height above the feet in meters (default 1.62). */
  eyeHeight?: number;
  dispose?(): void;
}

export interface ActorOptions {
  id: string;
  position: THREE.Vector3Like;
  heading?: number;
  layer?: number;
  radius?: number;
  halfHeight?: number;
  avatar?: AvatarView | null;
}

const GRAVITY = -20;
const tmp = new THREE.Vector3();
/** Highest ledge the step-up assist takes in stride (m): curbs, doorsteps, stairs. Not the 0.4 m seat rows of a cavea (its aisles are the way up) nor a plinth (clamber, Climb.ts). */
const STEP_MAX = 0.3;
const DOWN = { x: 0, y: -1, z: 0 };
const UP = { x: 0, y: 1, z: 0 };

export class Actor {
  readonly id: string;
  readonly root = new THREE.Group();
  readonly body: CharacterBody;
  heading: number;
  /** Current velocity (m/s); x/z horizontal, y vertical. */
  readonly velocity = new THREE.Vector3();
  grounded = false;
  sprinting = false;
  sneaking = false;
  avatar: AvatarView | null = null;
  /** Set false to freeze locomotion (dead, in dialogue, scripted). */
  canMove = true;
  /**
   * Removed from the world: its physics body is gone, so nothing may move it again (a fallen
   * fighter the crowd has cleared away can still be held by the combat module for a moment).
   */
  disposed = false;

  readonly prevPos = new THREE.Vector3();
  readonly currPos = new THREE.Vector3();
  private turnRate = 0;
  private lastHeading: number;
  /** Consecutive fixed steps in which horizontal movement was blocked on the ground. */
  private blockedSteps = 0;
  /** Consecutive grounded steps the move was stalled (the step-up assist waits for Rapier first). */
  private stepStalls = 0;

  constructor(
    protected readonly game: Game,
    opts: ActorOptions,
  ) {
    this.id = opts.id;
    this.heading = opts.heading ?? 0;
    this.lastHeading = this.heading;
    this.body = game.physics.createCharacter(opts.position, {
      layer: opts.layer ?? Layer.Npc,
      radius: opts.radius,
      halfHeight: opts.halfHeight,
      owner: this,
    });
    this.currPos.copy(opts.position as THREE.Vector3);
    this.prevPos.copy(this.currPos);
    this.root.name = `actor:${this.id}`;
    this.root.position.copy(this.currPos);
    this.root.rotation.y = this.heading;
    if (opts.avatar) this.setAvatar(opts.avatar);
    game.scene.add(this.root);
  }

  /** Feet position at the latest physics step. */
  get position(): THREE.Vector3 {
    return this.currPos;
  }

  setAvatar(view: AvatarView | null) {
    if (this.avatar) {
      this.root.remove(this.avatar.root);
      this.avatar.dispose?.();
    }
    this.avatar = view;
    if (view) this.root.add(view.root);
  }

  /**
   * Fixed-step locomotion. `wish` is the desired horizontal velocity (m/s, y ignored).
   * Accelerates toward it, applies gravity/jump, and resolves collisions with the KCC.
   */
  locomote(wish: THREE.Vector3Like, dt: number, opts: { jump?: number; accel?: number; airAccel?: number } = {}) {
    if (this.disposed) return;
    const v = this.velocity;
    if (!this.canMove) {
      wish = { x: 0, y: 0, z: 0 };
    }
    const accel = this.grounded ? (opts.accel ?? 14) : (opts.airAccel ?? 2.5);
    const k = damp(accel, dt);
    v.x += (wish.x - v.x) * k;
    v.z += (wish.z - v.z) * k;

    if (this.grounded && opts.jump && this.canMove) {
      v.y = opts.jump;
      this.grounded = false;
    } else if (this.grounded) {
      v.y = -2; // keep pressed into the ground so slopes/steps snap
    } else {
      v.y = Math.max(v.y + GRAVITY * dt, -55);
    }

    const desired = tmp.set(v.x * dt, v.y * dt, v.z * dt);
    const { controller, collider, body } = this.body;
    // Respect collision groups, so a crowd NPC whose capsule ignores the player never blocks the
    // player's controller (GDD §14.7b: the player shoulders through crowds).
    controller.computeColliderMovement(collider, desired, undefined, collider.collisionGroups());
    let mv: THREE.Vector3Like = controller.computedMovement();
    const wasRising = v.y > 0;
    const wasGrounded = this.grounded;
    this.grounded = controller.computedGrounded();
    // Rapier's own autostep often stalls a capsule at a curb (its round bottom meets the edge
    // first): step up ourselves when pushing on the ground and blocked by a low ledge.
    // Rapier gets the first frames (it steps stair risers smoothly a frame after contact).
    if (wasGrounded && !wasRising && dt > 0) {
      const want = Math.hypot(desired.x, desired.z);
      const stalled = want > 0.004 && Math.hypot(mv.x, mv.z) < want * 0.6;
      this.stepStalls = stalled ? this.stepStalls + 1 : 0;
      const up = this.stepStalls >= 3 ? this.stepUp(desired) : null;
      if (up) {
        mv = up;
        this.grounded = true;
        this.stepStalls = 0;
      }
    } else this.stepStalls = 0;
    // Bumped the ceiling while rising.
    if (wasRising && mv.y < desired.y * 0.5) v.y = 0;
    // Hit a wall: bleed the blocked component so we don't keep pushing into it (and so
    // locomotionState() reports the speed we really move at). In the air at once; on the ground
    // only once the block has lasted a few steps and the KCC isn't lifting us: on the first
    // contact with a stair riser it returns almost no movement and steps up a frame later, and
    // bleeding then would stall the character at the riser (tests/arch.stairs.test.ts drives
    // this exact code). Never flip the direction: depenetration can report a small backward move.
    if (dt > 0) {
      const ax = mv.x / dt;
      const az = mv.z / dt;
      const bx = Math.abs(ax) < Math.abs(v.x) * 0.5;
      const bz = Math.abs(az) < Math.abs(v.z) * 0.5;
      const lifted = this.grounded && mv.y > 1e-4;
      this.blockedSteps = (bx || bz) && !lifted ? this.blockedSteps + 1 : 0;
      if (!this.grounded || this.blockedSteps >= 3) {
        if (bx) v.x = Math.sign(v.x) * Math.max(0, ax * Math.sign(v.x));
        if (bz) v.z = Math.sign(v.z) * Math.max(0, az * Math.sign(v.z));
      }
    }

    const t = body.translation();
    const nx = t.x + mv.x;
    const ny = t.y + mv.y;
    const nz = t.z + mv.z;
    body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    this.prevPos.copy(this.currPos);
    this.currPos.set(nx, ny - this.body.halfHeight - this.body.radius, nz);

    this.turnRate = (this.heading - this.lastHeading) / Math.max(dt, 1e-4);
    this.lastHeading = this.heading;
  }

  /**
   * Step-up assist: the horizontal move has been mostly blocked for a few steps, and just ahead at
   * foot level there is a flat top 9–30 cm up with headroom over it (a curb, a doorstep, a low stair): the move that
   * lands on it, or null. Anything taller is a wall (climb or jump).
   */
  private stepUp(desired: THREE.Vector3Like): THREE.Vector3Like | null {
    const want = Math.hypot(desired.x, desired.z);
    const ph = this.game.physics;
    const r = this.body.radius;
    const dx = desired.x / want;
    const dz = desired.z / want;
    const feet = this.currPos;
    const px = feet.x + dx * (r + 0.12);
    const pz = feet.z + dz * (r + 0.12);
    const from = feet.y + STEP_MAX + 0.06;
    // From inside something taller the ray hits at once: rise > STEP_MAX, rejected below.
    const top = ph.raycast({ x: px, y: from, z: pz }, DOWN, STEP_MAX + 0.12, Layer.World);
    if (!top || top.normal.y < 0.75) return null;
    const rise = top.point.y - feet.y;
    // Under 9 cm the capsule's round bottom rides over by itself (and a wall's moulding is no step).
    if (rise < 0.09 || rise > STEP_MAX) return null;
    // Room for the whole body on top, and nothing low just past the edge.
    const height = 2 * (this.body.halfHeight + r);
    if (ph.raycast({ x: px, y: top.point.y + 0.03, z: pz }, UP, height, Layer.World)) return null;
    if (ph.raycast({ x: feet.x, y: top.point.y + 0.1, z: feet.z }, { x: dx, y: 0, z: dz }, r + 0.2, Layer.World)) return null;
    return { x: desired.x, y: rise + 0.01, z: desired.z };
  }

  /** Turn toward a heading at a maximum angular speed (rad/s). */
  turnToward(targetHeading: number, rate: number, dt: number) {
    this.heading = approachAngle(this.heading, targetHeading, rate * dt);
  }

  teleport(pos: THREE.Vector3Like, heading?: number) {
    if (this.disposed) return;
    this.body.body.setTranslation(
      { x: pos.x, y: pos.y + this.body.halfHeight + this.body.radius, z: pos.z },
      true,
    );
    this.body.body.setNextKinematicTranslation({
      x: pos.x,
      y: pos.y + this.body.halfHeight + this.body.radius,
      z: pos.z,
    });
    this.currPos.set(pos.x, pos.y, pos.z);
    this.prevPos.copy(this.currPos);
    this.velocity.set(0, 0, 0);
    if (heading !== undefined) this.heading = this.lastHeading = heading;
    this.root.position.copy(this.currPos);
  }

  /**
   * Move by `v` × `dt` straight through everything (no collisions, no gravity): the console's
   * no-clip. The kinematic body follows, so the city still streams in around the actor.
   */
  fly(v: THREE.Vector3Like, dt: number) {
    if (this.disposed) return;
    this.prevPos.copy(this.currPos);
    this.currPos.set(this.currPos.x + v.x * dt, this.currPos.y + v.y * dt, this.currPos.z + v.z * dt);
    this.velocity.set(v.x, 0, v.z);
    this.grounded = true;
    this.body.body.setNextKinematicTranslation({ x: this.currPos.x, y: this.currPos.y + this.body.halfHeight + this.body.radius, z: this.currPos.z });
  }

  /** Interpolate the visual root and drive the avatar. Call once per frame. */
  syncVisual(alpha: number, dt: number) {
    this.root.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.root.rotation.y = this.heading;
    if (this.avatar) this.avatar.update(dt, this.locomotionState());
  }

  locomotionState(): LocomotionState {
    const v = this.velocity;
    const sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);
    return {
      speed: Math.hypot(v.x, v.z),
      forwardSpeed: v.x * sin + v.z * cos,
      strafeSpeed: v.x * -cos + v.z * sin,
      verticalSpeed: v.y,
      grounded: this.grounded,
      sprinting: this.sprinting,
      sneaking: this.sneaking,
      turnRate: this.turnRate,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.game.scene.remove(this.root);
    this.avatar?.dispose?.();
    this.game.physics.removeCharacter(this.body);
  }
}

// ---------------------------------------------------------------- combat-capable avatars

/** Weapon handling style; drives idle/locomotion/attack animation sets. */
export type Stance = 'unarmed' | 'oneHand' | 'oneHandShield' | 'twoHand' | 'spear' | 'spearShield' | 'bow';

/** One-shot animation actions an avatar can play. */
export type ActionClip =
  | 'attackLight1'
  | 'attackLight2'
  | 'attackLight3'
  | 'attackPower'
  | 'bash'
  | 'blockHit'
  | 'hitFront'
  | 'hitBack'
  | 'stagger'
  | 'knockdown'
  | 'death'
  | 'drawWeapon'
  | 'sheathWeapon'
  | 'bowDraw'
  | 'bowRelease'
  | 'throw'
  | 'interact'
  | 'pickup'
  | 'drink'
  | 'pray'
  | 'cheer'
  | 'wave'
  | 'talk'
  | 'yield'
  /** A civilian giving up: down on both knees, arms over the head. */
  | 'cower';

/** Loops an NPC can idle in (schedules). */
export type IdleLoop = 'stand' | 'sit' | 'sitGround' | 'lean' | 'work' | 'sweep' | 'talk' | 'pray' | 'sleep' | 'cheer' | 'guard' | 'drunk' | 'drill';

export interface PlayOptions {
  speed?: number;
  /** Fired at the impact frame of attacks (combat applies damage then). */
  onHit?: () => void;
  /** Fired when the clip finishes or is interrupted. */
  onEnd?: (interrupted: boolean) => void;
}

/** What a combat-capable avatar adds on top of AvatarView. */
export interface CombatAvatar extends AvatarView {
  setStance(stance: Stance): void;
  /** Weapon drawn (in hand) vs sheathed. */
  setDrawn(drawn: boolean): void;
  setBlocking(blocking: boolean): void;
  /** Hold a charged power-attack wind-up pose (0..1 charge). */
  setCharge?(charge: number): void;
  play(clip: ActionClip, opts?: PlayOptions): void;
  /** True while a one-shot action that blocks other actions is playing. */
  isBusy(): boolean;
  setIdleLoop?(loop: IdleLoop | null): void;
  /** Dead pose (stays down). */
  setDead(dead: boolean): void;
  /** Bone/socket objects for attachments and hit tests. */
  getSocket(name: 'handR' | 'handL' | 'head' | 'chest' | 'hips' | 'back'): THREE.Object3D;
  /** Look-at target for the head (dialogue), or null. */
  lookAt?(worldPoint: THREE.Vector3 | null): void;
}

export function isCombatAvatar(v: AvatarView | null | undefined): v is CombatAvatar {
  return !!v && typeof (v as CombatAvatar).play === 'function';
}
