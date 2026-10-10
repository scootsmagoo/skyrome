/**
 * AnimationController: turns locomotion state + combat/NPC commands into a skeleton pose.
 *
 * Layers, evaluated every update (all blends are per-bone nlerps on shared baked clips):
 *   1. Stance idle (breathing; combat-ready when drawn; crouched when sneaking).
 *   2. Locomotion: idle/walk/run/sprint (or sneak) cycles in 8 directions, phase-synced and played
 *      at a rate matched to the actual speed so feet don't slide. Turn-in-place steps.
 *   3. Stance arms while moving (weapon/shield/torch stay in hand while the legs walk).
 *   4. Air (jump/fall) and a landing dip.
 *   5. Idle loop (sit, work, pray...) when standing still.
 *   6. Blocking and power-attack charge (upper body).
 *   7. One-shot actions with crossfades: upper-body while moving, full-body when standing.
 *   8. Procedural: elderly stoop, aim pitch, first-person arm raise, head look-at.
 */
import * as THREE from 'three';
import type { ActionClip, IdleLoop, LocomotionState, PlayOptions, Stance } from '../../Actor';
import { B, BONE_COUNT, type BoneName } from '../rig';
import { Pose, REF_LEG, bakeClip, blendMasked, blendPose, makeMask, sampleClip, samplePhase, toAnimationClip, type BoneMask, type CompiledClip } from './clip';
import { GAITS, type GaitName } from './gait';
import { FootIk } from './footIk';
import { PART, SecondaryMotion, type Drive } from './secondary';
import { actionInfo, airClips, blockClip, gaitClip, idleLoopClip, stanceIdleClip, type ActionInfo } from './library';
import { qAxis, qMul } from './quat';
import { ARM_LEFT, ARM_RIGHT, fistTo, fk, forwardKinematics, leftHandOnShaft } from './armIK';
import { BOW } from '../../equipment/weapons';
import { ARM_L_NET, ARM_L_TORCH, FP_ARMS, hasShield, stanceArmMask, stancePose, weaponClass, type ArmMask } from './poses';
import type { HumanoidAvatar } from '../HumanoidAvatar';
import type { DropBody, OffHand } from '../../equipment/Equipment';

/** Within this distance (m) of the viewer the avatar plants its feet on the ground and moves loosely (shared with lod.ts). */
const NEAR_IK = 40;
/** Seconds between ground samples for the feet by distance (m): close figures are watched, far ones are not. */
const probeInterval = (d: number) => (d < 15 ? 1 / 30 : d < 28 ? 1 / 20 : 1 / 10);
/** Foot-contact strength by gait (a heavy stride lands harder). */
const CONTACT_STRENGTH: Record<string, number> = { sneak: 0.25, walk: 0.5, run: 0.8, sprint: 1 };
/** Share of the loose-part springs by gait: a stride shakes the limbs more than standing. */
const LOOSE_BY_GAIT = { idle: 0.55, walk: 0.7, run: 1, sprint: 1.25, sneak: 0.45 };

interface Playing {
  name: string;
  info: ActionInfo;
  dropFired?: boolean;
  t: number;
  speed: number;
  w: number;
  fadeIn: number;
  fadeOut: number;
  fading: boolean;
  opts?: PlayOptions;
  hitFired: boolean;
  grabFired: boolean;
  ended: boolean;
}

const UPPER = makeMask({ spine: 0.55, chest: 1, neck: 1, head: 1, shoulderL: 1, upperArmL: 1, forearmL: 1, handL: 1, fingersL: 1, indexL: 1, shoulderR: 1, upperArmR: 1, forearmR: 1, handR: 1, fingersR: 1, indexR: 1 });
const FULL = makeMask({ hipsPos: 1 }, 1);
const LOWER = makeMask({ hips: 0.6, hipsPos: 1, thighL: 1, shinL: 1, footL: 1, toeL: 1, thighR: 1, shinR: 1, footR: 1, toeR: 1 });
const AIR = makeMask({ hips: 0.7, spine: 0.4, chest: 0.3, thighL: 1, shinL: 1, footL: 1, toeL: 1, thighR: 1, shinR: 1, footR: 1, toeR: 1, upperArmL: 0.5, forearmL: 0.4, upperArmR: 0.5, forearmR: 0.4 });

const ARMS_MASK = makeMask({ shoulderL: 1, upperArmL: 1, forearmL: 1, handL: 1, fingersL: 1, indexL: 1, shoulderR: 1, upperArmR: 1, forearmR: 1, handR: 1, fingersR: 1, indexR: 1 });
const ARM_L_MASK = makeMask({ shoulderL: 1, upperArmL: 1, forearmL: 1, handL: 1, fingersL: 1, indexL: 1 });
const offArmClips = new Map<OffHand, CompiledClip>();
/** Static pose of the left arm holding a torch up, or a gathered net ready to cast. */
function offArmClip(kind: OffHand): CompiledClip {
  let c = offArmClips.get(kind);
  if (!c) {
    const pose = { ...stancePose('unarmed', false).pose, ...(kind === 'torch' ? ARM_L_TORCH : ARM_L_NET) };
    c = bakeClip({ name: `offhand:${kind}`, duration: 1, loop: true, base: pose, keys: [{ t: 0, pose }] });
    offArmClips.set(kind, c);
  }
  return c;
}
const fpCache = new Map<string, CompiledClip>();
/** Static first-person arm pose for a stance (drawn) and what the off hand holds. */
function fpClip(stance: Stance, drawn: boolean, off: OffHand | null): CompiledClip {
  const key = `${stance}:${drawn}:${off}`;
  let c = fpCache.get(key);
  if (!c) {
    const cls = weaponClass(stance);
    const pose = { ...stancePose(stance, drawn).pose };
    if (drawn) Object.assign(pose, FP_ARMS[cls]);
    if (drawn && hasShield(stance)) Object.assign(pose, FP_ARMS.shield);
    else if (off) Object.assign(pose, FP_ARMS[off]);
    c = bakeClip({ name: `fp:${key}`, duration: 1, loop: true, base: pose, keys: [{ t: 0, pose }] });
    fpCache.set(key, c);
  }
  return c;
}
const ARM_L: BoneName[] = ['shoulderL', 'upperArmL', 'forearmL', 'handL', 'fingersL', 'indexL'];
const NOT_ARM_L = makeMask({ hipsPos: 1, shoulderL: 0, upperArmL: 0, forearmL: 0, handL: 0, fingersL: 0, indexL: 0 }, 1);
const UPPER_NOT_ARM_L = (() => {
  const m = makeMask({});
  m.set(UPPER);
  for (const n of ARM_L) m[B[n]] = 0;
  return m;
})();
const ARM_R: BoneName[] = ['shoulderR', 'upperArmR', 'forearmR', 'handR', 'fingersR', 'indexR'];

/** +1 for a draw clip, -1 for a sheath clip, 0 otherwise. */
function drawDirection(name: string): -1 | 0 | 1 {
  return name.startsWith('drawWeapon') ? 1 : name.startsWith('sheathWeapon') ? -1 : 0;
}
/** How the body lies at the end of a clip that drops the kit. */
const dropBody = (name: string): DropBody => (name === 'death:forward' ? 'front' : name === 'yield' || name === 'cower' ? 'kneel' : 'back');
/** Clips that take the whole body down (they also move a busy off hand). */
const isFall = (name: string) => name.startsWith('death') || name === 'knockdown' || name === 'yield' || name === 'cower';

/** Elbow poles (chest frame) for the bow hand at full draw (back, out, a little up) and the first-person weapon arm (down and out). */
const BOW_POLE: readonly [number, number, number] = [-1, 0.1, -0.15];
const FP_POLE: readonly [number, number, number] = [-1, -0.35, 0];
/** First person: the camera sits this far in front of the eyes' base point (CameraRig). */
const FP_EYE_FORWARD = 0.12;
/**
 * First-person weapon hand: the fist in the camera frame (m: right, up, forward) and the direction
 * of the fist's grip axis (left, up, forward; the weapon leans from it by its grip tilt).
 */
interface FpView {
  fist: readonly [number, number, number];
  dir: readonly [number, number, number];
}
const FP_SWORD: FpView = { fist: [0.3, -0.21, 0.42], dir: [0.5, 0.75, 0.45] };

/** Speed ladder (reference body, m/s). Between `walkTop` and `runAt` walk blends into run, etc. */
export const SPEEDS = { walkAt: 1.1, walkTop: 2.2, runAt: 3.2, runTop: 4.8, sprintAt: 6.4 };

/** The sprint cycle is baked for straight ahead and 45° either side. */
const SPRINT_ARC = 45;
const qEuler = new THREE.Euler();
const qSwing = new THREE.Quaternion();
const DEG = Math.PI / 180;
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const approach = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * damp(rate, dt);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Locomotion weights for a speed (reference m/s): [idle, walk, run, sprint]. */
export function speedWeights(v: number, out: number[] = [0, 0, 0, 0]): number[] {
  const S = SPEEDS;
  out[0] = out[1] = out[2] = out[3] = 0;
  if (v <= 0.04) out[0] = 1;
  else if (v < S.walkAt) {
    const t = smooth(0, S.walkAt, v) * 0.6 + (v / S.walkAt) * 0.4;
    out[0] = 1 - t;
    out[1] = t;
  } else if (v < S.walkTop) out[1] = 1;
  else if (v < S.runAt) {
    const t = (v - S.walkTop) / (S.runAt - S.walkTop);
    out[1] = 1 - t;
    out[2] = t;
  } else if (v < S.runTop) out[2] = 1;
  else if (v < S.sprintAt) {
    const t = (v - S.runTop) / (S.sprintAt - S.runTop);
    out[2] = 1 - t;
    out[3] = t;
  } else out[3] = 1;
  return out;
}

export class AnimationController {
  stance: Stance = 'unarmed';
  drawn = false;
  firstPerson = false;
  /** Camera pitch (rad, + up) — arms follow it in first person; archers aim with it. */
  aimPitch = 0;

  private blocking = false;
  private blockW = 0;
  private charge = 0;
  private chargeW = 0;
  private idleLoop: IdleLoop | null = null;
  private loopClip: CompiledClip | null = null;
  private prevLoopClip: CompiledClip | null = null;
  private loopW = 0;
  private prevLoopW = 0;
  private loopT = 0;
  private dead = false;

  private phase = 0;
  private turnPhase = 0;
  private turnW = 0;
  private speedSm = 0;
  private dirSm = 0;
  private sneakW = 0;
  private airW = 0;
  private airTime = 0;
  private rising = 0;
  private landT = 1;
  private landK = 0;
  private idleT = Math.random() * 10;
  private prevStanceClip: CompiledClip | null = null;
  private stanceFade = 1;

  private actions: Playing[] = [];
  /** A corpse struck again jolts a little (1 → 0). */
  private twitch = 0;
  private twitchDir = 1;
  /** What the left hand carries this update (torch or net), if anything. */
  private off: OffHand | null = null;
  private offKind: OffHand = 'torch';
  private offW = 0;
  private lookTarget: THREE.Vector3 | null = null;
  private lookYaw = 0;
  private lookPitch = 0;
  private aimSm = 0;
  /** First person: how far the upper body leans back while looking down (rad, smoothed). */
  private fpLean = 0;
  private fpW = 0;
  private stoopW = 0;
  private rng = Math.random;

  /** Set by the avatar each update: within NEAR_IK of the viewer (feet planted, loose parts springing). */
  near = false;
  /** Distance to the viewer (m), for the foot-probe rate. */
  viewDistance = 0;
  /** Foot IK and the secondary motion run only when these are on (tests and tools can switch them off). */
  footIkEnabled = true;
  secondaryEnabled = true;
  readonly footIk = new FootIk();
  readonly secondary = new SecondaryMotion();
  /** Foot contacts fired so far (tests). */
  contacts = 0;
  private secW = 0;
  private readonly drive: Drive = { af: 0, al: 0, au: 0, turn: 0 };
  private prevVf = 0;
  private prevVl = 0;
  private prevVu = 0;
  private haveVel = false;
  private lastStrength = 0.5;
  /** Social share of loose motion this update (gait-weighted, before the first-person cut). */
  private looseGait = 0.55;
  private socketBase = new Map<THREE.Object3D, THREE.Quaternion>();
  private socketsMoved = false;

  // Pose buffers.
  private out = new Pose();
  private tmpA = new Pose();
  private tmpB = new Pose();
  private tmpC = new Pose();
  private tmpD = new Pose();
  private loco = new Pose();
  private stanceP = new Pose();
  private armMask: BoneMask = makeMask({});
  private readonly armSides: ArmMask = { L: 0, R: 0, chest: 0 };
  /** Locomotion cycles blended this update: gait, weight, stride length (reused, no per-frame arrays). */
  private readonly gaitName: GaitName[] = ['walk', 'walk', 'walk', 'walk'];
  private readonly gaitW = [0, 0, 0, 0];
  private readonly gaitS = [0, 0, 0, 0];
  private gaitCount = 0;
  private autoMask: BoneMask = makeMask({});
  private keepMask: BoneMask = makeMask({});
  private legScale = 1;
  private readonly restHips = new THREE.Vector3();
  private readonly dq = new Float32Array(4);
  private readonly sw = [1, 0, 0, 0];
  private readonly tmpV = new THREE.Vector3();

  /** Wears a toga or himation: the left forearm carries the drape when the hands are free. */
  togate = false;

  constructor(private readonly avatar: HumanoidAvatar) {
    this.refreshAppearance(true);
    this.out.identity();
  }

  /** Re-read proportions and dress from the avatar (after HumanoidAvatar.setAppearance). */
  refreshAppearance(initial = false) {
    const rig = this.avatar.rig;
    const app = this.avatar.appearance;
    const g = app.garments;
    const togate = g.some((x) => x.kind === 'toga') || (app.sex === 'male' && g.some((x) => x.kind === 'palla'));
    if (!initial && togate !== this.togate) {
      this.prevStanceClip = this.currentStanceClip();
      this.stanceFade = 0;
    }
    this.togate = togate;
    this.legScale = (rig.thigh + rig.shin) / REF_LEG;
    this.restHips.set(rig.joints[B.hips * 3], rig.joints[B.hips * 3 + 1], rig.joints[B.hips * 3 + 2]);
    this.stoopW = rig.stoop;
  }

  // ------------------------------------------------------------------ commands

  setStance(stance: Stance) {
    if (stance === this.stance) return;
    this.prevStanceClip = this.currentStanceClip();
    this.stance = stance;
    this.stanceFade = 0;
  }

  /**
   * Logical drawn state. A running draw or sheath clip that goes the other way is cancelled (an AI
   * changing its mind, dialogue starting); if the weapon already changed hands, the opposite clip
   * puts it back. Otherwise, without a clip on the way, the weapon changes hands immediately.
   */
  setDrawn(drawn: boolean) {
    const dir = drawn ? 1 : -1;
    let reverse = false;
    for (const a of this.actions) {
      if (a.fading || drawDirection(a.name) !== -dir) continue;
      reverse ||= a.grabFired;
      // Commit first: interrupting before the grab settles the weapon by the logical state.
      this.commitDrawn(drawn);
      this.endAction(a, true);
    }
    this.commitDrawn(drawn);
    if (reverse && !this.dead) {
      this.play(drawn ? 'drawWeapon' : 'sheathWeapon');
      return;
    }
    const pending = this.actions.some((a) => !a.fading && drawDirection(a.name) === dir && !a.grabFired);
    if (!pending) this.avatar.equipment.setVisualDrawn(drawn);
  }

  private commitDrawn(drawn: boolean) {
    if (drawn === this.drawn) return;
    this.prevStanceClip = this.currentStanceClip();
    this.drawn = drawn;
    this.stanceFade = 0;
  }

  setBlocking(on: boolean) {
    this.blocking = on;
  }

  setCharge(c: number) {
    this.charge = Math.max(0, Math.min(1, c));
  }

  setIdleLoop(loop: IdleLoop | null) {
    if (loop === this.idleLoop) return;
    if (this.loopClip && this.loopW > 0.01) {
      this.prevLoopClip = this.loopClip;
      this.prevLoopW = this.loopW;
    }
    this.idleLoop = loop;
    this.loopClip = loop ? idleLoopClip(loop) : null;
    this.loopW = 0;
    this.loopT = 0;
    this.avatar.equipment.setLoopProp(loop === 'work' ? 'hammer' : loop === 'sweep' ? 'broom' : loop === 'drill' ? 'rudis' : null);
  }

  setDead(dead: boolean) {
    if (dead === this.dead && (!dead || this.holdingDeath())) return;
    this.dead = dead;
    if (dead) {
      if (!this.holdingDeath()) {
        this.startDeath();
        const a = this.actions[this.actions.length - 1];
        if (a) {
          a.t = a.info.clip.duration;
          a.w = 1;
          a.hitFired = true;
          if (a.info.drop) {
            a.dropFired = true;
            this.avatar.equipment.drop(a.info.drop.what, dropBody(a.name));
          }
        }
      }
    } else {
      for (const a of this.actions) this.endAction(a, true);
      this.actions.length = 0;
    }
  }

  private holdingDeath(): boolean {
    for (const a of this.actions) if (!a.fading && a.name.startsWith('death')) return true;
    return false;
  }

  private startDeath() {
    this.dead = false;
    this.play('death');
    this.dead = true;
  }

  lookAt(p: THREE.Vector3 | null) {
    // Kept by reference: callers (Npc.lookAtPoint) move the point every frame and the head follows it.
    this.lookTarget = p;
  }

  /** Resolve a contract clip name to a concrete variant for the current stance/state. */
  private resolve(clip: ActionClip): string {
    switch (clip) {
      case 'attackPower': {
        if (this.speedSm > 0.8 * this.legScale) {
          const a = Math.abs(this.dirSm);
          return a < 50 ? 'attackPower:lunge' : a < 130 ? 'attackPower:sweep' : 'attackPower:back';
        }
        return 'attackPower';
      }
      case 'death':
        return this.rng() < 0.4 ? 'death:forward' : 'death';
      case 'drawWeapon':
      case 'sheathWeapon':
        return `${clip}:${this.avatar.equipment.sheathLocation()}`;
      default:
        return clip;
    }
  }

  play(clip: ActionClip, opts?: PlayOptions) {
    // A corpse stays down: nothing replaces the held death pose (a blow only jolts the body).
    if (this.dead && (this.holdingDeath() || clip !== 'death')) {
      if (clip === 'hitFront' || clip === 'hitBack' || clip === 'hitLeft' || clip === 'hitRight' || clip === 'stagger' || clip === 'knockdown' || clip === 'blockHit') {
        this.twitch = 1;
        this.twitchDir = clip === 'hitBack' || clip === 'hitRight' ? -1 : 1;
      }
      opts?.onEnd?.(true);
      return;
    }
    const name = this.resolve(clip);
    const info = actionInfo(this.stance, name) ?? actionInfo(this.stance, clip);
    if (!info) {
      opts?.onEnd?.(true);
      return;
    }
    // Interrupt whatever is playing.
    for (const a of this.actions) if (!a.fading) this.endAction(a, true);
    let t = 0;
    if (info.windup !== undefined && this.chargeW > 0.15) {
      // Resume from the held wind-up instead of winding up again.
      t = info.windup * Math.min(1, this.chargeW + 0.1);
      this.charge = 0;
    }
    const fadeIn = info.fadeIn ?? 0.12;
    this.actions.push({
      name,
      info,
      t,
      speed: opts?.speed ?? 1,
      w: 0,
      fadeIn,
      fadeOut: info.fadeOut ?? 0.18,
      fading: false,
      opts,
      hitFired: info.hit === undefined || t > info.hit,
      grabFired: info.grab === undefined,
      ended: false,
    });
    if (info.prop) this.avatar.equipment.showProp(info.prop, true);
    const dir = drawDirection(name);
    if (dir !== 0) {
      // Playing a draw (sheath) clip means drawn (sheathed). The clip owns the weapon until its grab
      // frame, so it starts on the other side (a no-op unless setDrawn ran just before).
      this.commitDrawn(dir > 0);
      this.avatar.equipment.setVisualDrawn(dir < 0);
    }
  }

  /**
   * Must the avatar animate at the full rate whatever its distance (lod.ts)? Dead bodies, drawn
   * weapons, blocking, any action playing or fading, and someone looking at a target (talking).
   */
  get wantsFullRate(): boolean {
    return this.dead || this.drawn || this.blocking || this.actions.length > 0 || this.lookTarget !== null;
  }

  isBusy(): boolean {
    for (const a of this.actions) if (!a.fading && a.info.busy) return true;
    return false;
  }

  /** Progress (0..1) of the current action, or 1 if none. */
  progress(): number {
    const a = this.actions.find((x) => !x.fading);
    return a ? Math.min(1, a.t / a.info.clip.duration) : 1;
  }

  /** Debug/screenshots: hold the current action at time t (seconds). */
  debugFreeze(t: number) {
    const a = this.actions.find((x) => !x.fading);
    if (!a) return;
    a.t = t;
    a.speed = 0;
    a.w = 1;
    a.hitFired = true;
  }

  /** Debug/screenshots: hold the idle loop at time t (seconds), fully faded in. */
  debugFreezeLoop(t: number) {
    this.loopT = t;
    this.loopW = 1;
    this.loopFrozen = true;
  }
  private loopFrozen = false;

  /** Name of the action currently playing (for debugging/UI). */
  get current(): string | null {
    const a = this.actions.find((x) => !x.fading);
    return a ? a.name : null;
  }

  private endAction(a: Playing, interrupted: boolean) {
    if (a.fading) return;
    a.fading = true;
    if (!a.ended) {
      a.ended = true;
      if (a.info.prop) this.avatar.equipment.showProp(a.info.prop, false);
      if (a.dropFired) this.avatar.equipment.drop(null);
      if (!a.grabFired) {
        // Interrupted mid-draw: settle the weapon where the logical state says.
        a.grabFired = true;
        this.avatar.equipment.setVisualDrawn(this.drawn);
      }
      a.opts?.onEnd?.(interrupted);
    }
  }

  // ------------------------------------------------------------------ update

  private currentStanceClip(): CompiledClip {
    return stanceIdleClip(this.stance, this.drawn, false, this.togate);
  }

  update(dt: number, s: LocomotionState) {
    const ls = this.legScale;
    // --- smooth inputs
    const rawSpeed = s.grounded ? s.speed / ls : this.speedSm;
    this.speedSm = approach(this.speedSm, rawSpeed, 10, dt);
    if (s.speed > 0.25) {
      const dir = Math.atan2(-s.strafeSpeed, s.forwardSpeed) / DEG;
      let d = dir - this.dirSm;
      d = ((d + 540) % 360) - 180;
      this.dirSm += d * damp(10, dt);
      this.dirSm = ((this.dirSm + 540) % 360) - 180;
    }
    this.sneakW = approach(this.sneakW, s.sneaking ? 1 : 0, 6, dt);
    if (!s.grounded) {
      this.airTime += dt;
      this.rising = s.verticalSpeed > 0.5 ? 1 : s.verticalSpeed < -1 ? 0 : this.rising;
    } else {
      if (this.airTime > 0.25) {
        this.landT = 0;
        this.landK = Math.min(1, this.airTime / 0.8);
      }
      this.airTime = 0;
    }
    this.airW = approach(this.airW, this.airTime > 0.08 ? 1 : 0, this.airTime > 0 ? 8 : 14, dt);
    this.landT = Math.min(1, this.landT + dt / 0.38);
    this.idleT += dt;
    this.stanceFade = Math.min(1, this.stanceFade + dt / 0.25);
    this.updateDrive(dt, s);

    // --- 1. stance idle (with a crossfade on stance/drawn changes, and the sneak crouch)
    const stanceClip = this.currentStanceClip();
    sampleClip(stanceClip, this.idleT, this.stanceP);
    if (this.sneakW > 0.01) {
      sampleClip(stanceIdleClip(this.stance, this.drawn, true), this.idleT, this.tmpA);
      blendPose(this.stanceP, this.stanceP, this.tmpA, this.sneakW);
    }
    if (this.stanceFade < 1 && this.prevStanceClip) {
      sampleClip(this.prevStanceClip, this.idleT, this.tmpA);
      blendPose(this.stanceP, this.tmpA, this.stanceP, smooth(0, 1, this.stanceFade));
    }

    // A busy off hand: the left arm holds a torch up and clear of the head (unless a shield is
    // drawn), or a retiarius holds his gathered net low and ready to cast.
    const off = this.avatar.equipment.offHand();
    this.off = off && !(off === 'torch' && this.drawn && hasShield(this.stance)) ? off : null;
    if (this.off) this.offKind = this.off;
    const offPose = this.off === 'torch' || (this.off === 'net' && this.drawn);
    this.offW = approach(this.offW, offPose ? 1 : 0, 8, dt);
    if (this.offW > 0.01) {
      sampleClip(offArmClip(this.offKind), 0, this.tmpA);
      blendMasked(this.stanceP, this.stanceP, this.tmpA, this.offW, ARM_L_MASK);
    }

    // First person: the stance arms become the view poses (weapon low-right in view, shield edge left).
    const torch = this.off === 'torch';
    this.fpW = approach(this.fpW, this.firstPerson && (this.drawn || torch) && !this.dead ? 1 : 0, 10, dt);
    if (this.fpW > 0.01) {
      sampleClip(fpClip(this.stance, this.drawn, this.off), 0, this.tmpA);
      blendMasked(this.stanceP, this.stanceP, this.tmpA, this.fpW, ARMS_MASK);
    }

    // --- 2. locomotion
    const w = speedWeights(this.speedSm, this.sw);
    // A sprint only runs straight ahead (the cycle has no sideways or backward versions): moving
    // off the line of the body hands the weight to the run, which has all eight directions.
    if (w[3] > 0) {
      const keep = 1 - smooth(25, 60, Math.abs(this.dirSm));
      w[2] += w[3] * (1 - keep);
      w[3] *= keep;
    }
    const moveW = 1 - w[0];
    this.looseGait = w[0] * LOOSE_BY_GAIT.idle + w[1] * (LOOSE_BY_GAIT.walk + (LOOSE_BY_GAIT.sneak - LOOSE_BY_GAIT.walk) * this.sneakW) + w[2] * LOOSE_BY_GAIT.run + w[3] * LOOSE_BY_GAIT.sprint;
    let nGaits = 0;
    if (w[1] > 0) {
      if (this.sneakW < 0.99) nGaits = this.addGait(nGaits, 'walk', w[1] * (1 - this.sneakW));
      if (this.sneakW > 0.01) nGaits = this.addGait(nGaits, 'sneak', w[1] * this.sneakW);
    }
    if (w[2] > 0) nGaits = this.addGait(nGaits, 'run', w[2]);
    if (w[3] > 0) nGaits = this.addGait(nGaits, 'sprint', w[3]);
    this.gaitCount = nGaits;
    if (nGaits) {
      let sEff = 0;
      for (let i = 0; i < nGaits; i++) sEff += this.gaitW[i] * this.gaitS[i];
      // On a staircase the stride is shortened (footIk.ts), so the cycle runs quicker to keep the feet still.
      const stride = 1 + (this.footIk.stride - 1) * this.footIk.weight;
      this.footIk.baseStep = Math.max(0.3, sEff * 0.5);
      const rate = sEff > 0.05 ? this.speedSm / (sEff * stride) : 1 / GAITS.walk.cycle;
      const p0 = this.phase;
      this.phase = (p0 + rate * dt) % 1;
      if (s.grounded && moveW > 0.3 && !this.dead) this.footContacts(p0, this.phase, nGaits);
      let total = 0;
      for (let i = 0; i < nGaits; i++) {
        const gw = this.gaitW[i];
        this.sampleGait(this.gaitName[i], this.tmpC);
        total += gw;
        if (total === gw) this.loco.copy(this.tmpC);
        else blendPose(this.loco, this.loco, this.tmpC, gw / total);
      }
    }
    const base = this.out;
    if (moveW > 0 && nGaits) blendPose(base, this.stanceP, this.loco, moveW);
    else base.copy(this.stanceP);

    // Turn in place: small steps while rotating without moving.
    const turning = Math.abs(s.turnRate) > 0.9 && this.speedSm < 0.3 && s.grounded;
    this.turnW = approach(this.turnW, turning ? 1 : 0, 8, dt);
    if (this.turnW > 0.01) {
      const t0 = this.turnPhase;
      this.turnPhase = (t0 + dt * Math.min(1.6, 0.6 + Math.abs(s.turnRate) * 0.25) / GAITS.turn.cycle) % 1;
      if (this.turnW > 0.5 && !this.dead) this.stepEdges(t0, this.turnPhase, 'walk', 0.18);
      samplePhase(gaitClip('turn', 0), this.turnPhase, this.tmpA);
      blendMasked(base, base, this.tmpA, this.turnW * (1 - moveW), LOWER);
    }

    // --- 3. stance arms while moving
    const am = stanceArmMask(this.stance, this.drawn, offPose, this.togate, this.armSides);
    this.buildArmMask(am.L, am.R, am.chest);
    if (moveW > 0.01) blendMasked(base, base, this.stanceP, moveW, this.armMask);

    // --- 4. air / landing
    if (this.airW > 0.01) {
      const air = airClips();
      sampleClip(this.rising ? air.jump : air.fall, this.idleT, this.tmpA);
      blendMasked(base, base, this.tmpA, this.airW, AIR);
    }
    if (this.landT < 1) {
      const k = Math.sin(this.landT * Math.PI) * this.landK;
      sampleClip(stanceIdleClip(this.stance, this.drawn, true), this.idleT, this.tmpA);
      blendMasked(base, base, this.tmpA, k * 0.8, LOWER);
    }

    // --- 5. idle loop
    // Idle loops are for calm moments: not while moving, airborne, dead, or with a weapon drawn.
    const loopWant = this.loopClip && this.speedSm < 0.35 && s.grounded && !this.dead && (!this.drawn || this.idleLoop === 'guard') ? 1 : 0;
    this.loopW = approach(this.loopW, loopWant, loopWant ? 2.6 : 6, dt);
    this.prevLoopW = approach(this.prevLoopW, 0, 5, dt);
    if (!this.loopFrozen) this.loopT += dt;
    if (this.prevLoopClip && this.prevLoopW > 0.01) {
      sampleClip(this.prevLoopClip, this.loopT, this.tmpA);
      blendPose(base, base, this.tmpA, this.prevLoopW);
    }
    if (this.loopClip && this.loopW > 0.01) {
      sampleClip(this.loopClip, this.loopT, this.tmpA);
      // Togate figures keep the drape on the left forearm through calm loops.
      if (this.togate && !this.drawn && (this.idleLoop === 'stand' || this.idleLoop === 'talk' || this.idleLoop === 'guard')) blendMasked(base, base, this.tmpA, smooth(0, 1, this.loopW), NOT_ARM_L);
      else blendPose(base, base, this.tmpA, smooth(0, 1, this.loopW));
    }

    // --- 6. block and charge
    this.blockW = approach(this.blockW, this.blocking && !this.dead ? 1 : 0, this.blocking ? 16 : 10, dt);
    if (this.blockW > 0.01) {
      sampleClip(blockClip(this.stance), 0, this.tmpA);
      blendMasked(base, base, this.tmpA, this.blockW, this.off ? UPPER_NOT_ARM_L : UPPER);
    }
    let attackActive = false;
    for (const a of this.actions) if (!a.fading && a.info.windup !== undefined) attackActive = true;
    this.chargeW = approach(this.chargeW, attackActive ? 0 : Math.min(1, this.charge * 1.4), this.charge > 0 ? 7 : 12, dt);
    if (this.chargeW > 0.01) {
      const p = actionInfo(this.stance, 'attackPower');
      if (p && p.windup !== undefined) {
        sampleClip(p.clip, p.windup * this.chargeW, this.tmpA);
        this.buildAutoMask(moveW);
        // A busy off hand keeps its pose; in first person a shield stays low at the edge of the view.
        if (this.off || (this.firstPerson && hasShield(this.stance))) for (const n of ARM_L) this.autoMask[B[n]] = 0;
        blendMasked(base, base, this.tmpA, Math.min(1, this.chargeW * 1.5), this.autoMask);
      }
    }

    // --- 7. actions (their clocks run in advance())
    this.blendActions(base, moveW);
    // The bowstring follows the right hand once it has hooked the string.
    let bow = 0;
    this.bowHookW = 0;
    this.bowPull = 1;
    for (const a of this.actions) {
      if (a.name === 'bowDraw') {
        // The hand hooks the string at the bow (0.2–0.32 s), then pulls it to the jaw.
        if (!a.fading) bow = smooth(0.24, 0.36, a.t);
        this.bowHookW = Math.max(this.bowHookW, smooth(0.2, 0.32, a.t) * smooth(0, 1, a.w));
        this.bowPull = smooth(0.3, 0.72, a.t);
      }
      // Releasing: the hand leaves the jaw as the string slips (the clip then carries it back).
      else if (a.name === 'bowRelease') this.bowHookW = Math.max(this.bowHookW, (1 - smooth(0.02, 0.12, a.t)) * smooth(0, 1, a.w));
    }
    this.avatar.equipment.setBowDraw(bow);

    // --- 8. procedural
    this.procedural(dt, base, s);
    this.groundFeet(dt, base, s);
    this.write(base);
  }

  // ------------------------------------------------------------------ foot contacts

  /** Fire the foot contacts a gait phase passes between two updates (0 = left foot lands, 0.5 = right). */
  private footContacts(p0: number, p1: number, nGaits: number) {
    let best = 0;
    let sum = 0;
    let str = 0;
    for (let i = 0; i < nGaits; i++) {
      sum += this.gaitW[i];
      str += this.gaitW[i] * CONTACT_STRENGTH[this.gaitName[i]];
      if (this.gaitW[i] > this.gaitW[best]) best = i;
    }
    this.lastStrength = sum > 0 ? str / sum : 0.5;
    this.stepEdges(p0, p1, this.gaitName[best], this.lastStrength);
  }

  /** The contacts between phases p0 and p1 (a forward step shorter than a cycle), earliest first. */
  private stepEdges(p0: number, p1: number, gait: string, strength: number) {
    const adv = (p1 - p0 + 1) % 1;
    if (adv <= 0) return;
    let tL = (1 - p0) % 1;
    let tR = (0.5 - p0 + 1) % 1;
    if (tL === 0) tL = 1;
    if (tR === 0) tR = 1;
    const l = tL <= adv;
    const r = tR <= adv;
    if (l && r) {
      if (tL <= tR) {
        this.contact('L', gait, strength);
        this.contact('R', gait, strength);
      } else {
        this.contact('R', gait, strength);
        this.contact('L', gait, strength);
      }
    } else if (l) this.contact('L', gait, strength);
    else if (r) this.contact('R', gait, strength);
  }

  private contact(side: 'L' | 'R', gait: string, strength: number) {
    this.contacts++;
    if (this.near) this.secondary.footfall(strength, side === 'L' ? 1 : -1);
    this.avatar.onFootContact?.(side, gait, strength);
  }

  // ------------------------------------------------------------------ secondary motion

  /** The body's acceleration in its own frame (m/s², low-passed) and its turn rate: what loose parts trail. */
  private updateDrive(dt: number, s: LocomotionState) {
    const vf = s.forwardSpeed;
    const vl = -s.strafeSpeed;
    const vu = s.grounded ? 0 : Math.max(-10, Math.min(10, s.verticalSpeed));
    const d = this.drive;
    if (!this.haveVel || dt > 0.3 || dt <= 0) {
      d.af = d.al = d.au = 0;
    } else {
      // A frame turning at w: a = dv/dt + w x v, so a circle at a steady speed still pulls sideways.
      const af = (vf - this.prevVf) / dt - s.turnRate * vl;
      const al = (vl - this.prevVl) / dt + s.turnRate * vf;
      const au = (vu - this.prevVu) / dt;
      // Physics steps at 60 Hz while frames may run faster: smooth, so the spikes between steps don't ring.
      const k = damp(22, dt);
      d.af += (Math.max(-30, Math.min(30, af)) - d.af) * k;
      d.al += (Math.max(-30, Math.min(30, al)) - d.al) * k;
      d.au += (Math.max(-30, Math.min(30, au)) - d.au) * k;
    }
    d.turn = s.turnRate;
    this.prevVf = vf;
    this.prevVl = vl;
    this.prevVu = vu;
    this.haveVel = true;
  }

  /** A blow at the avatar: `lf`/`ll` = the direction it travels in the avatar's frame (forward, left), strength 0..1. */
  hitImpulse(lf: number, ll: number, strength: number) {
    if (this.dead) return;
    this.secondary.hit(lf, ll, strength);
  }

  private applySecondary(dt: number, p: Pose, free: number) {
    const sec = this.secondary;
    const want = this.near && this.secondaryEnabled && !this.firstPerson && !this.dead ? 1 : 0;
    this.secW += (want - this.secW) * damp(want ? 6 : 12, dt);
    if (this.secW < 0.003 && !want && sec.energy < 0.02) {
      if (this.socketsMoved) this.restoreSockets();
      return;
    }
    if (dt > 0.3) sec.reset();
    sec.step(dt, this.drive, this.looseGait * this.secW);
    // How much of the action clips owns the arms right now.
    let act = 0;
    for (const a of this.actions) if (a.info.mask !== 'full') act = Math.max(act, smooth(0, 1, a.w));
    const arms = free * (1 - 0.85 * act);
    // Hands that hold something flop less than free ones.
    const offHolds = this.off || (this.drawn && hasShield(this.stance)) || this.avatar.equipment.twoHandGrip();
    const kR = arms * (this.drawn ? 0.3 : 1);
    const kL = arms * (offHolds ? 0.3 : this.togate && !this.drawn ? 0.4 : 1);
    const pi = sec.pitch;
    const ro = sec.roll;
    const ya = sec.yaw;
    const H = PART.head;
    const hk = free * (1 - 0.5 * act);
    this.addParent(p, B.head, 0, pi[H].x * hk);
    this.addParent(p, B.head, 2, ro[H].x * hk);
    this.addParent(p, B.head, 1, ya[H].x * hk);
    // The neck takes a share, so the head does not hinge in the air.
    this.addParent(p, B.neck, 0, pi[H].x * hk * 0.35);
    this.addParent(p, B.neck, 1, ya[H].x * hk * 0.3);
    this.add(p, B.forearmL, 0, pi[PART.forearmL].x * kL);
    this.add(p, B.forearmR, 0, pi[PART.forearmR].x * kR);
    this.add(p, B.handL, 0, pi[PART.handL].x * kL);
    this.add(p, B.handR, 0, pi[PART.handR].x * kR);
    this.addParent(p, B.upperArmL, 2, ro[PART.forearmL].x * kL * 0.5);
    this.addParent(p, B.upperArmR, 2, ro[PART.forearmR].x * kR * 0.5);
    this.addParent(p, B.handL, 2, ro[PART.handL].x * kL);
    this.addParent(p, B.handR, 2, ro[PART.handR].x * kR);
    // A blow rocks the torso, then it settles.
    const hp = sec.hitPitch.x * free;
    const hr = sec.hitRoll.x * free;
    if (Math.abs(hp) > 0.01 || Math.abs(hr) > 0.01) {
      this.addParent(p, B.hips, 0, hp * 0.2);
      this.addParent(p, B.spine, 0, hp * 0.35);
      this.addParent(p, B.chest, 0, hp * 0.4);
      this.addParent(p, B.hips, 2, hr * 0.2);
      this.addParent(p, B.spine, 2, hr * 0.35);
      this.addParent(p, B.chest, 2, hr * 0.4);
    }
    const hh = sec.hitHead.x * free;
    if (Math.abs(hh) > 0.01 || Math.abs(hr) > 0.01) {
      this.addParent(p, B.neck, 0, hh * 0.5);
      this.addParent(p, B.head, 0, hh * 0.5);
      this.addParent(p, B.head, 2, hr * 0.25);
    }
    this.moveSockets(this.secW * free);
  }

  /** The carried kit swings about its grip: the sockets turn a little on top of their base orientation. */
  private moveSockets(kitW: number) {
    const av = this.avatar;
    this.swingSocket(av.getSocket('gripR'), PART.kitR, kitW);
    this.swingSocket(av.getSocket('gripL'), PART.kitL, kitW);
    this.swingSocket(av.getSocket('shieldL'), PART.kitL, kitW);
    for (const n of ['sheathR', 'sheathL', 'backShield', 'backWeapon'] as const) this.swingSocket(av.getSocket(n), PART.hang, kitW * 0.7);
    this.socketsMoved = true;
  }

  private swingSocket(o: THREE.Object3D, part: number, w: number) {
    let base = this.socketBase.get(o);
    if (!base) {
      base = o.quaternion.clone();
      this.socketBase.set(o, base);
    }
    const sec = this.secondary;
    qEuler.set(sec.pitch[part].x * w * DEG, sec.yaw[part].x * w * DEG, sec.roll[part].x * w * DEG);
    qSwing.setFromEuler(qEuler);
    o.quaternion.copy(qSwing).multiply(base);
  }

  private restoreSockets() {
    for (const [o, q] of this.socketBase) o.quaternion.copy(q);
    this.socketsMoved = false;
  }

  // ------------------------------------------------------------------ foot IK

  /** Plant the feet on stairs, kerbs and slopes (see footIk.ts); only near the viewer, only where the avatar can probe. */
  private groundFeet(dt: number, p: Pose, s: LocomotionState) {
    const probe = this.avatar.groundProbe ?? null;
    let want = 0;
    if (this.footIkEnabled && this.near && probe && s.grounded && !this.dead && this.airW < 0.3) {
      // Seated, sleeping or leaning figures, and falls, keep their authored feet.
      want = 1;
      if (this.idleLoop === 'sit' || this.idleLoop === 'sitGround' || this.idleLoop === 'sleep' || this.idleLoop === 'lean') want = 1 - smooth(0, 1, this.loopW);
      want *= 1 - this.fullDeathW();
    }
    if (want <= 0 && this.footIk.weight <= 0.003) return;
    const root = this.avatar.root;
    root.updateWorldMatrix(true, false);
    const rootY = root.matrixWorld.elements[13];
    this.footIk.apply(p, this.avatar.rig, this.legScale, dt, want, probeInterval(this.viewDistance), probe, rootY, -s.strafeSpeed, s.forwardSpeed);
  }

  private addGait(n: number, g: GaitName, gw: number): number {
    this.gaitName[n] = g;
    this.gaitW[n] = gw;
    this.gaitS[n] = GAITS[g].speed * GAITS[g].cycle;
    return n + 1;
  }

  private sampleGait(g: GaitName, out: Pose) {
    // The turn steps have one direction; a sprint covers only the forward arc (45° each way).
    const dir = g === 'turn' ? 0 : g === 'sprint' ? Math.max(-SPRINT_ARC, Math.min(SPRINT_ARC, this.dirSm)) : this.dirSm;
    // Neighbouring directions on the 45° wheel (DIRECTIONS[i] is i * 45° mod 360).
    const a = ((dir % 360) + 360) % 360;
    const i = Math.floor(a / 45) % 8;
    const f = a / 45 - Math.floor(a / 45);
    samplePhase(gaitClip(g, i), this.phase, out);
    if (f > 0.01) {
      samplePhase(gaitClip(g, (i + 1) % 8), this.phase, this.tmpD);
      blendPose(out, out, this.tmpD, f);
    }
  }

  private buildArmMask(L: number, R: number, chest: number) {
    const m = this.armMask;
    m.fill(0);
    for (const n of ARM_L) m[B[n]] = L;
    for (const n of ARM_R) m[B[n]] = R;
    m[B.chest] = chest;
  }

  private buildAutoMask(moveW: number) {
    const m = this.autoMask;
    for (let i = 0; i <= BONE_COUNT; i++) m[i] = FULL[i] + (UPPER[i] - FULL[i]) * moveW;
  }

  /**
   * Advance the action clocks and fire their events (impact, grab, drop, end) and fades. The avatar
   * calls this every frame, also when its pose updates are throttled by distance (lod.ts), so
   * gameplay timing never depends on the camera.
   */
  advance(dt: number) {
    const list = this.actions;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const clip = a.info.clip;
      const prevT = a.t;
      if (!a.fading || !a.info.hold) a.t += dt * a.speed;
      if (a.info.hold && a.t > clip.duration) a.t = clip.duration;
      // Events.
      if (!a.hitFired && a.info.hit !== undefined && a.t >= a.info.hit && prevT <= a.info.hit + 1e-6) {
        a.hitFired = true;
        if (!a.fading) a.opts?.onHit?.();
      }
      if (a.info.drop && !a.dropFired && a.t >= a.info.drop.t && !a.fading) {
        a.dropFired = true;
        this.avatar.equipment.drop(a.info.drop.what, dropBody(a.name));
      }
      if (!a.grabFired && a.info.grab !== undefined && a.t >= a.info.grab) {
        a.grabFired = true;
        this.avatar.equipment.setVisualDrawn(a.name.startsWith('drawWeapon'), true);
      }
      if (!a.fading && !a.info.hold && a.t >= clip.duration - a.fadeOut * 0.5) this.endAction(a, false);
      a.w = a.fading ? Math.max(0, a.w - dt / a.fadeOut) : Math.min(1, a.w + dt / Math.max(0.01, a.fadeIn));
    }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].fading && list[i].w <= 0) list.splice(i, 1);
  }

  /** Blend the playing actions into the pose. */
  private blendActions(base: Pose, moveW: number) {
    for (const a of this.actions) {
      if (a.w <= 0) continue;
      sampleClip(a.info.clip, a.t, this.tmpA);
      const mode = this.dead ? 'full' : a.info.mask;
      let mask: BoneMask;
      if (mode === 'full') mask = FULL;
      else if (mode === 'upper') mask = UPPER;
      else {
        this.buildAutoMask(moveW);
        mask = this.autoMask;
      }
      // Gestures leave a drawn shield where the stance holds it; a torch or net in the off hand stays
      // put through everything but a fall (one-handed swings with the weapon hand).
      if ((a.info.keepShield && this.drawn && hasShield(this.stance)) || (this.off && !isFall(a.name))) {
        this.keepMask.set(mask);
        for (const n of ARM_L) this.keepMask[B[n]] = 0;
        mask = this.keepMask;
      }
      blendMasked(base, base, this.tmpA, smooth(0, 1, a.w), mask);
    }
  }

  /** Additive rotation on a bone: q = q * axisAngle (in the bone's current frame). */
  private add(p: Pose, bone: number, axis: number, deg: number) {
    if (Math.abs(deg) < 1e-3) return;
    qAxis(this.dq, 0, axis, deg * DEG);
    qMul(p.q, bone * 4, p.q, bone * 4, this.dq, 0);
  }

  /** Pre-multiplied rotation (in the parent frame): q = axisAngle * q. */
  private addParent(p: Pose, bone: number, axis: number, deg: number) {
    if (Math.abs(deg) < 1e-3) return;
    qAxis(this.dq, 0, axis, deg * DEG);
    qMul(p.q, bone * 4, this.dq, 0, p.q, bone * 4);
  }

  private gripW = 0;
  /** Bow at full draw: weight of the string hand hooked at the jaw (set each update). */
  private bowHookW = 0;
  /** How far the string hand has pulled from the bow toward the jaw (0..1). */
  private bowPull = 1;
  /** First person: weight of the weapon hand placed in view (smoothed on/off). */
  private fpHandW = 0;
  private readonly v0 = new Float32Array(3);
  private readonly v1 = new Float32Array(3);
  private readonly v2 = new Float32Array(3);
  private readonly v3 = new Float32Array(3);

  private fullDeathW(): number {
    let w = 0;
    for (const a of this.actions) if (a.name.startsWith('death') || a.name === 'knockdown' || a.name === 'yield' || a.name === 'cower') w = Math.max(w, a.w);
    return w;
  }

  private fullOverride(): number {
    let w = 0;
    for (const a of this.actions) if (a.info.mask === 'full' || a.name.startsWith('death') || a.name === 'yield' || a.name === 'cower') w = Math.max(w, a.w);
    return Math.max(w, this.loopW * (this.idleLoop && this.idleLoop !== 'talk' && this.idleLoop !== 'cheer' && this.idleLoop !== 'drunk' ? 1 : 0));
  }

  private procedural(dt: number, p: Pose, s: LocomotionState) {
    const free = 1 - this.fullOverride();
    // Elderly stoop.
    if (this.stoopW > 0 && free > 0) {
      const k = this.stoopW * free;
      this.addParent(p, B.spine, 0, 7 * k);
      this.addParent(p, B.chest, 0, 6 * k);
      this.addParent(p, B.neck, 0, 8 * k);
      this.addParent(p, B.head, 0, -12 * k);
    }
    // Lean into turns while running (bank), proportional to speed × turn rate.
    const bank = Math.max(-10, Math.min(10, s.turnRate * this.speedSm * 1.6)) * free;
    this.addParent(p, B.hips, 2, -bank * 0.5);
    this.addParent(p, B.spine, 2, bank * 0.2);

    // Aim pitch: first person (weapon drawn or a torch) and while holding a bow draw.
    let bowAim = false;
    for (const a of this.actions) if (a.name === 'bowDraw' && !a.fading) bowAim = true;
    const torch = this.off === 'torch';
    const aimOn = (this.firstPerson && (this.drawn || torch)) || bowAim ? 1 : 0;
    this.aimSm = approach(this.aimSm, aimOn * this.aimPitch, 14, dt);
    // First person looking down: the camera stands in for the head, 0.12 m in front of the neck, so
    // the shoulders and collar would sit right under it (where a real chin hides them). The upper
    // body leans back out of the view instead; nobody else sees the player in first person.
    const leanWant = this.firstPerson && !this.dead ? Math.max(0, -this.aimPitch - 0.3) * 0.75 : 0;
    this.fpLean = approach(this.fpLean, leanWant, 14, dt);
    const lean = (this.fpLean / DEG) * free;
    if (lean > 0.01) {
      this.addParent(p, B.spine, 0, -lean * 0.45);
      this.addParent(p, B.chest, 0, -lean * 0.55);
    }
    if (Math.abs(this.aimSm) > 1e-3 || lean > 0.01) {
      const deg = -this.aimSm / DEG;
      if (this.firstPerson) {
        // The first-person camera pivots at the eyes over the feet, so bending the spine would push
        // the shoulders (and the neck) into view. Only the presented arms follow the view (and
        // make up for the lean).
        if (this.drawn || torch) this.addParent(p, B.upperArmL, 0, (deg + lean) * free);
        if (this.drawn) this.addParent(p, B.upperArmR, 0, (deg + lean) * free);
      } else {
        this.addParent(p, B.spine, 0, deg * 0.35 * free);
        this.addParent(p, B.chest, 0, deg * 0.45 * free);
      }
    }
    // First person during actions: lift the swing so strikes cross the view.
    if (this.fpW > 0.01) {
      let act = 0;
      for (const a of this.actions) if (!a.fading && a.info.mask !== 'full') act = Math.max(act, a.w);
      const k = this.fpW * free * act;
      if (k > 0.01 && this.drawn) {
        this.addParent(p, B.shoulderR, 1, 6 * k);
        this.add(p, B.upperArmR, 0, -18 * k);
        if (!hasShield(this.stance) && weaponClass(this.stance) !== 'blade' && !this.off) this.add(p, B.upperArmL, 0, -14 * k);
      }
    }
    // First person with a blade ready: the fist low right in view, the blade angled toward the
    // center. Attacks, blocks and the power wind-up take the arm over. (Spears and two-handers keep
    // their FP_ARMS view poses: their shafts run along the forearm, which a neutral-wrist fist
    // placement cannot give.)
    const fpReady = this.firstPerson && this.drawn && !this.dead && weaponClass(this.stance) === 'blade';
    this.fpHandW = approach(this.fpHandW, fpReady ? 1 : 0, 10, dt);
    if (this.fpHandW > 0.01) {
      let act = 0;
      for (const a of this.actions) act = Math.max(act, smooth(0, 1, a.w));
      const k = this.fpHandW * this.fpW * (1 - act) * (1 - Math.min(1, this.chargeW * 1.5)) * (hasShield(this.stance) ? 1 : 1 - this.blockW);
      if (k > 0.01) this.fpHand(p, k, FP_SWORD);
    }

    // Loose parts lag the body; the grip IK below then pulls a held weapon's hands back to it.
    this.applySecondary(dt, p, free);

    // Two-handed weapons: the left hand rides the shaft (unless it carries a net/torch or gestures).
    const grip = this.avatar.equipment.twoHandGrip();
    let gw = grip && this.drawn && !this.off ? 1 - this.fullDeathW() : 0;
    for (const a of this.actions) if (a.info.keepShield) gw *= 1 - a.w;
    gw *= 1 - this.blockW * 0.5;
    this.gripW = approach(this.gripW, gw, 12, dt);
    if (grip && this.gripW > 0.01) leftHandOnShaft(p, this.avatar.rig, this.legScale, grip, this.gripW);

    // A corpse struck again: a short jolt through the torso.
    if (this.twitch > 0) {
      this.twitch = Math.max(0, this.twitch - dt / 0.35);
      const k = Math.sin((1 - this.twitch) * Math.PI) * this.twitchDir;
      this.add(p, B.spine, 0, 4 * k);
      this.add(p, B.chest, 0, 5 * k);
      this.add(p, B.head, 0, -6 * k);
      this.add(p, B.upperArmL, 1, 5 * k);
      this.add(p, B.upperArmR, 1, -5 * k);
    }

    // Head look-at.
    let ty = 0;
    let tp = 0;
    if (this.lookTarget && free > 0.2) {
      const root = this.avatar.root;
      const local = root.worldToLocal(this.tmpV.copy(this.lookTarget));
      const eye = this.avatar.eyeHeight;
      const yaw = Math.atan2(local.x, local.z) / DEG;
      const pitch = Math.atan2(local.y - eye, Math.hypot(local.x, local.z)) / DEG;
      if (Math.abs(yaw) < 110) {
        ty = Math.max(-70, Math.min(70, yaw));
        tp = Math.max(-35, Math.min(30, pitch));
      }
    }
    this.lookYaw = approach(this.lookYaw, ty, 6, dt);
    this.lookPitch = approach(this.lookPitch, tp, 6, dt);
    if (Math.abs(this.lookYaw) > 0.05 || Math.abs(this.lookPitch) > 0.05) {
      this.addParent(p, B.chest, 1, this.lookYaw * 0.15);
      this.addParent(p, B.neck, 1, this.lookYaw * 0.35);
      this.addParent(p, B.head, 1, this.lookYaw * 0.5);
      this.addParent(p, B.neck, 0, -this.lookPitch * 0.4);
      this.addParent(p, B.head, 0, -this.lookPitch * 0.6);
    }

    // Bow at full draw: the string hand hooks the string at the corner of the jaw.
    if (this.bowHookW > 0.01 && this.avatar.equipment.weapon === 'bow' && this.avatar.equipment.inHand) this.bowHand(p, this.bowHookW);

  }

  /**
   * The bow hand at full draw: the fingers hooked round the string at the corner of the jaw (the
   * string follows the hand, see Equipment), no further from the bow than a full draw.
   */
  private bowHand(p: Pose, w: number) {
    const rig = this.avatar.rig;
    const s = rig.s;
    forwardKinematics(p, rig, this.legScale);
    const g = ARM_LEFT.grip;
    const o = fk.point(B.handL, g[0] * s, g[1] * s, g[2] * s, this.v0);
    // The bow's +Z (toward the target) and +Y (the string's direction) are the left hand's -Y and +Z.
    const d = fk.dir(B.handL, 0, -1, 0, this.v1);
    const u = fk.dir(B.handL, 0, 0, 1, this.v2);
    const a = fk.point(B.head, -0.035 * s, -0.012 * s, 0.07 * s, this.v3);
    // From the braced string toward the anchor, no further than a full draw from the bow.
    const pull = this.bowPull;
    const rx = d[0] * BOW.stringZ, ry = d[1] * BOW.stringZ, rz = d[2] * BOW.stringZ;
    let dx = rx + (a[0] - o[0] - rx) * pull;
    let dy = ry + (a[1] - o[1] - ry) * pull;
    let dz = rz + (a[2] - o[2] - rz) * pull;
    const len = Math.hypot(dx, dy, dz);
    if (len > BOW.maxDraw) {
      dx *= BOW.maxDraw / len;
      dy *= BOW.maxDraw / len;
      dz *= BOW.maxDraw / len;
    }
    fistTo(p, rig, this.legScale, ARM_RIGHT, o[0] + dx, o[1] + dy, o[2] + dz, u[0], u[1], u[2], BOW_POLE, w, 70);
  }

  /** First-person weapon hand: a fixed spot in the camera's frame (the camera pitches about the eyes). */
  private fpHand(p: Pose, w: number, view: FpView) {
    const rig = this.avatar.rig;
    const cp = Math.cos(this.aimSm);
    const sp = Math.sin(this.aimSm);
    // Camera frame in character space: forward (0, sp, cp), up (0, cp, -sp), right (-1, 0, 0).
    const f = view.fist;
    const d = view.dir;
    const ty = this.avatar.eyeHeight + f[1] * cp + f[2] * sp;
    const tz = FP_EYE_FORWARD - f[1] * sp + f[2] * cp;
    fistTo(p, rig, this.legScale, ARM_RIGHT, -f[0], ty, tz, d[0], d[1] * cp + d[2] * sp, -d[1] * sp + d[2] * cp, FP_POLE, w, 85);
  }

  private write(p: Pose) {
    const bones = this.avatar.bones;
    const q = p.q;
    for (let i = 0; i < BONE_COUNT; i++) bones[i].quaternion.set(q[i * 4], q[i * 4 + 1], q[i * 4 + 2], q[i * 4 + 3]);
    const ls = this.legScale;
    bones[0].position.set(this.restHips.x + p.p[0] * ls, this.restHips.y + p.p[1] * ls, this.restHips.z + p.p[2] * ls);
  }

  /** The locomotion cycles blended in the last update, with their weights (tests and debugging). */
  gaitMix(): { gait: GaitName; w: number }[] {
    const out: { gait: GaitName; w: number }[] = [];
    for (let i = 0; i < this.gaitCount; i++) out.push({ gait: this.gaitName[i], w: this.gaitW[i] });
    return out;
  }

  /** THREE.AnimationClip by name: an action ('attackLight1'), 'idle', a gait ('walk:0'), or a loop ('loop:sit'). */
  getAnimationClip(name: string): THREE.AnimationClip | null {
    let c: CompiledClip | undefined;
    if (name.startsWith('loop:')) c = idleLoopClip(name.slice(5) as IdleLoop);
    else if (name === 'idle') c = this.currentStanceClip();
    else if (/^(walk|run|sprint|sneak|turn):\d$/.test(name)) {
      const [g, d] = name.split(':');
      c = gaitClip(g as GaitName, Number(d));
    } else c = actionInfo(this.stance, name)?.clip;
    return c ? toAnimationClip(c, this.avatar.rig) : null;
  }
}

