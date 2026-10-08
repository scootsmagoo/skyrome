/**
 * Ragdolls for the people near the camera (see Ragdoll.ts): who goes limp, when, and how they get
 * up again.
 *
 * - Death (and knockout): the body goes over to physics at the moment the avatar is marked dead,
 *   with the blow that did it as an impulse where it landed. The muscles let go over half a second
 *   (a crumple with some intent, then dead weight); once the body has come to rest it is frozen
 *   as a pose (bodies removed) and the corpse's actor moves to where the body lies.
 * - Knockdown (a heavy blow that floors someone alive): half-limp for about a second — the body
 *   sprawls the way the blow sent it — then the actor stands where it landed, and the pose blends
 *   back into the animation's getting-up over half a second.
 * - A knockout ends (the avatar is no longer dead): the frozen pose blends back the same way.
 *
 * Whoever is first seen already dead (a corpse loaded with the game) keeps the animation's pose.
 * At most `max` bodies simulate at once (the graphics tier sets it): the oldest settle early.
 */
import * as THREE from 'three';
import type { Game, System } from '../../core/Game';
import { Layer } from '../../core/Physics';
import type { Actor } from '../../actors/Actor';
import { HumanoidAvatar } from '../../actors/avatar/HumanoidAvatar';
import { Ragdoll, writeBones } from './Ragdoll';
import { BONE_COUNT } from '../../actors/avatar/rig';

declare module '../../core/Game' {
  interface Game {
    ragdolls?: RagdollSystem;
  }
}

type Mode = 'death' | 'knockdown';

interface Live {
  actor: Actor;
  avatar: HumanoidAvatar;
  rag: Ragdoll;
  mode: Mode;
  t: number;
  still: number;
}

interface Pose {
  /** World transforms of the driven bones, by bone index. */
  bodies: Map<number, { p: THREE.Vector3; q: THREE.Quaternion }>;
}

const poseOf = (rag: Ragdoll): Pose => ({ bodies: new Map(rag.snapshot().map((b) => [b.bone, b])) });

interface Blend {
  actor: Actor;
  avatar: HumanoidAvatar;
  pose: Pose;
  t: number;
  dur: number;
}

/** How long a knockdown stays on the ground (s) before getting up, and the blend back. */
const KNOCK_DOWN = 1.15;
const BLEND = 0.5;
const RANGE = 45;

export class RagdollSystem implements System {
  readonly name = 'ragdolls';
  /** After the actors (50) have animated their bones this frame, before the camera (100). */
  readonly priority = 55;
  /** Bodies simulating at once. */
  max = 6;
  private live = new Map<Actor, Live>();
  private frozen = new Map<Actor, { avatar: HumanoidAvatar; pose: Pose }>();
  private blends = new Map<Actor, Blend>();
  private seenDead = new WeakMap<Actor, boolean>();
  private lastHit = new Map<string, { from: THREE.Vector3; power: boolean; at: number }>();
  private knock = new Set<string>();
  /**
   * Each nearby living avatar's pose at the end of the last frame (local bone rotations and the
   * hips' position): a death jumps the animation straight to the lying pose, so the body falls
   * from the pose it was in a moment before.
   */
  private lastPose = new WeakMap<Actor, Float32Array>();
  private time = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly game: Game) {
    game.ragdolls = this;
    // Fewer bodies at once on the Low graphics tier (integrated GPUs come with modest CPUs).
    const g = game.settings.data;
    const tier = g.graphics && g.graphics !== 'auto' ? g.graphics : g.graphicsApplied?.tier;
    this.max = tier === 'low' ? 3 : tier === 'medium' ? 4 : 6;
    game.events.on('combat:hit', (e) => {
      if (e.blocked || e.parried) return;
      const att = game.actors?.get(e.attackerId);
      if (!att) return;
      this.lastHit.set(e.targetId, { from: att.position.clone(), power: e.power, at: this.time });
      if (e.stagger === 'knockdown') this.knock.add(e.targetId);
    });
  }

  /** A blow from `from` (world) on `targetId`: it sends the body that way if it goes down now. */
  noteHit(targetId: string, from: THREE.Vector3Like, power: boolean, knockdown = false) {
    this.lastHit.set(targetId, { from: new THREE.Vector3(from.x, from.y, from.z), power, at: this.time });
    if (knockdown) this.knock.add(targetId);
  }

  /** Is this actor's body in physics or a held ragdoll pose? */
  has(actor: Actor): boolean {
    return this.live.has(actor) || this.frozen.has(actor) || this.blends.has(actor);
  }

  fixedUpdate(dt: number) {
    for (const l of this.live.values()) {
      l.rag.sample();
      l.rag.drive(dt);
    }
  }

  update(dt: number, alpha: number) {
    this.time += dt;
    const actors = this.game.actors?.all() ?? [];
    const cam = this.game.camera.position;
    for (const a of actors) {
      const av = a.avatar;
      if (!(av instanceof HumanoidAvatar)) continue;
      const near = Math.hypot(a.position.x - cam.x, a.position.z - cam.z) < RANGE;
      const dead = av.isDead;
      const was = this.seenDead.get(a);
      this.seenDead.set(a, dead);
      if (was === undefined) continue; // first sight: a corpse loaded with the game keeps its pose
      if (dead && !was && near && !this.skip(a, av)) this.start(a, av, 'death');
      else if (!dead && was && (this.frozen.has(a) || this.live.has(a))) this.getUp(a, av);
      if (!dead && this.knock.has(a.id)) {
        this.knock.delete(a.id);
        if (near && !this.live.has(a) && !this.skip(a, av)) this.start(a, av, 'knockdown');
      }
    }
    this.knock.clear();
    // Simulating bodies: muscles' targets from this frame's animation, then the pose from physics.
    for (const l of [...this.live.values()]) {
      if (this.gone(l.actor)) {
        l.rag.dispose();
        this.live.delete(l.actor);
        continue;
      }
      l.t += dt;
      if (l.mode !== 'death') l.rag.readTargets();
      if (l.mode === 'death') l.rag.strength = 0.55 * Math.exp(-l.t / 0.22);
      else l.rag.strength = l.t < 0.25 ? 0.25 : 0.4;
      l.rag.write(alpha);
      l.still = l.rag.motion() < 0.12 ? l.still + dt : 0;
      if (l.mode === 'knockdown' && l.t >= KNOCK_DOWN) this.getUp(l.actor, l.avatar);
      else if (l.mode === 'death' && ((l.t > 1.2 && l.still > 0.4) || l.t > 7)) this.freeze(l);
    }
    for (const [a, f] of this.frozen) {
      if (this.gone(a)) {
        this.frozen.delete(a);
        continue;
      }
      writePose(f.avatar, f.pose, 1);
    }
    for (const [a, b] of [...this.blends]) {
      b.t += dt;
      const u = Math.min(1, b.t / b.dur);
      if (u >= 1 || this.gone(a)) {
        this.blends.delete(a);
        continue;
      }
      writePose(b.avatar, b.pose, 1 - u * u * (3 - 2 * u));
    }
    for (const [id, h] of this.lastHit) if (this.time - h.at > 2) this.lastHit.delete(id);
    // Remember the living poses nearby (see lastPose).
    for (const a of actors) {
      const av = a.avatar;
      if (!(av instanceof HumanoidAvatar) || av.isDead || this.has(a)) continue;
      if (Math.hypot(a.position.x - cam.x, a.position.z - cam.z) > RANGE) continue;
      let buf = this.lastPose.get(a);
      if (!buf) this.lastPose.set(a, (buf = new Float32Array(BONE_COUNT * 4 + 3)));
      const bones = av.bones;
      for (let i = 0; i < BONE_COUNT; i++) bones[i].quaternion.toArray(buf, i * 4);
      bones[0].position.toArray(buf, BONE_COUNT * 4);
    }
  }

  private skip(a: Actor, av: HumanoidAvatar): boolean {
    // First person: the camera rides the capsule and the body is hidden anyway.
    return a === this.game.player && av.isFirstPerson;
  }

  private gone(a: Actor): boolean {
    return (a as { disposed?: boolean }).disposed === true || !(a.avatar instanceof HumanoidAvatar);
  }

  private start(a: Actor, av: HumanoidAvatar, mode: Mode) {
    this.blends.delete(a);
    this.frozen.delete(a);
    if (this.live.size >= this.max) {
      // The oldest body settles where it is.
      let old: Live | null = null;
      for (const l of this.live.values()) if (!old || l.t > old.t) old = l;
      if (old) {
        if (old.mode === 'death') this.freeze(old);
        else this.getUp(old.actor, old.avatar);
      }
    }
    const before = mode === 'death' ? this.lastPose.get(a) : undefined;
    if (before) {
      const bones = av.bones;
      for (let i = 0; i < BONE_COUNT; i++) bones[i].quaternion.fromArray(before, i * 4);
      bones[0].position.fromArray(before, BONE_COUNT * 4);
    }
    let rag: Ragdoll;
    try {
      rag = new Ragdoll(this.game.physics, av, a.velocity);
      // A death's muscles hold the last living pose as they let go (the clip's end pose lies flat).
      if (before) rag.readTargets();
    } catch (err) {
      console.warn('[ragdoll] could not build', a.id, err);
      return;
    }
    // The blow that did it: along the line from the attacker, at chest height, a little upward.
    const hit = this.lastHit.get(a.id);
    if (hit && this.time - hit.at < 0.6) {
      const d = this.tmp.set(a.position.x - hit.from.x, 0, a.position.z - hit.from.z);
      if (d.lengthSq() < 1e-6) d.set(Math.sin(a.heading), 0, Math.cos(a.heading)).negate();
      d.normalize();
      d.y = 0.25;
      const chest = rag.segs[2].body.translation();
      const mag = mode === 'death' ? (hit.power ? 24 : 15) : hit.power ? 42 : 26;
      rag.impulse(chest, d, mag);
    }
    this.live.set(a, { actor: a, avatar: av, rag, mode, t: 0, still: 0 });
  }

  /** A body at rest becomes a held pose; a corpse's actor moves to where it lies. */
  private freeze(l: Live) {
    const pose = poseOf(l.rag);
    const pelvis = l.rag.pelvis(new THREE.Vector3());
    l.rag.dispose();
    this.live.delete(l.actor);
    this.frozen.set(l.actor, { avatar: l.avatar, pose });
    if (l.actor !== this.game.player) this.moveTo(l.actor, pelvis, false);
  }

  /** Stand up where the body lies, blending from its pose back into the animation. */
  private getUp(a: Actor, av: HumanoidAvatar) {
    let pose: Pose | null = null;
    const l = this.live.get(a);
    if (l) {
      pose = poseOf(l.rag);
      const pelvis = l.rag.pelvis(new THREE.Vector3());
      // Face the way the chest faces (along its forward axis, flattened).
      const chest = l.rag.segs[2].currQ;
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(chest);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(chest);
      // Lying on the back the chest's up points along the body: get up facing toward the feet.
      const dir = Math.abs(f.y) > 0.6 ? up.multiplyScalar(-Math.sign(f.y)) : f;
      l.rag.dispose();
      this.live.delete(a);
      this.moveTo(a, pelvis, true, Math.atan2(dir.x, dir.z));
    } else {
      pose = this.frozen.get(a)?.pose ?? null;
      this.frozen.delete(a);
    }
    if (pose) this.blends.set(a, { actor: a, avatar: av, pose, t: 0, dur: BLEND });
  }

  /** Put the actor's feet on the ground under the pelvis (and turn it), keeping the visual pose. */
  private moveTo(a: Actor, pelvis: THREE.Vector3, alive: boolean, heading?: number) {
    const ph = this.game.physics;
    const hit = ph.raycast({ x: pelvis.x, y: pelvis.y + 0.5, z: pelvis.z }, { x: 0, y: -1, z: 0 }, 3, Layer.World);
    const y = hit ? hit.point.y : pelvis.y - 0.15;
    if (!alive && Math.hypot(pelvis.x - a.position.x, pelvis.z - a.position.z) < 0.4) return;
    a.teleport({ x: pelvis.x, y: y + (alive ? 0.02 : 0), z: pelvis.z }, heading);
    a.root.position.copy(a.position);
    if (heading !== undefined) a.root.rotation.y = heading;
    a.root.updateMatrixWorld(true);
  }
}

function writePose(av: HumanoidAvatar, pose: Pose, blend: number) {
  writeBones(av, (bi, p, q) => {
    const b = pose.bodies.get(bi);
    if (!b) return false;
    p.copy(b.p);
    q.copy(b.q);
    return true;
  }, blend);
}
