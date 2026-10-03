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
import { B, BONE_COUNT, BONES, type BoneName } from '../rig';
import { Pose, REF_LEG, bakeClip, blendMasked, blendPose, makeMask, sampleClip, samplePhase, toAnimationClip, type BoneMask, type CompiledClip } from './clip';
import { GAITS, type GaitName } from './gait';
import { actionInfo, airClips, blockClip, gaitClip, idleLoopClip, stanceIdleClip, type ActionInfo } from './library';
import { qAxis, qMul } from './quat';
import { leftHandOnShaft } from './armIK';
import { FP_ARMS, hasShield, stanceArmMask, stancePose, weaponClass } from './poses';
import type { HumanoidAvatar } from '../HumanoidAvatar';

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
const fpCache = new Map<string, CompiledClip>();
/** Static first-person arm pose for a stance (drawn) or a torch. */
function fpClip(stance: Stance, drawn: boolean, torch: boolean): CompiledClip {
  const key = `${stance}:${drawn}:${torch}`;
  let c = fpCache.get(key);
  if (!c) {
    const cls = weaponClass(stance);
    const pose = { ...stancePose(stance, drawn).pose };
    if (drawn) Object.assign(pose, FP_ARMS[cls]);
    if (drawn && hasShield(stance)) Object.assign(pose, FP_ARMS.shield);
    if (torch && !(drawn && hasShield(stance))) Object.assign(pose, FP_ARMS.torch);
    c = bakeClip({ name: `fp:${key}`, duration: 1, loop: true, base: pose, keys: [{ t: 0, pose }] });
    fpCache.set(key, c);
  }
  return c;
}
const ARM_L: BoneName[] = ['shoulderL', 'upperArmL', 'forearmL', 'handL', 'fingersL', 'indexL'];
const NOT_ARM_L = makeMask({ hipsPos: 1, shoulderL: 0, upperArmL: 0, forearmL: 0, handL: 0, fingersL: 0, indexL: 0 }, 1);
const ARM_R: BoneName[] = ['shoulderR', 'upperArmR', 'forearmR', 'handR', 'fingersR', 'indexR'];

/** Speed ladder (reference body, m/s). Between `walkTop` and `runAt` walk blends into run, etc. */
export const SPEEDS = { walkAt: 1.1, walkTop: 2.2, runAt: 3.2, runTop: 4.8, sprintAt: 6.4 };

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
  torch = false;
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
  private lookTarget: THREE.Vector3 | null = null;
  private lookYaw = 0;
  private lookPitch = 0;
  private aimSm = 0;
  private fpW = 0;
  private stoopW: number;
  private rng = Math.random;

  // Pose buffers.
  private out = new Pose();
  private tmpA = new Pose();
  private tmpB = new Pose();
  private tmpC = new Pose();
  private tmpD = new Pose();
  private loco = new Pose();
  private stanceP = new Pose();
  private armMask: BoneMask = makeMask({});
  private autoMask: BoneMask = makeMask({});
  private keepMask: BoneMask = makeMask({});
  private readonly legScale: number;
  private readonly restHips = new THREE.Vector3();
  private readonly dq = new Float32Array(4);
  private readonly sw = [1, 0, 0, 0];
  private readonly tmpV = new THREE.Vector3();

  /** Wears a toga or himation: the left forearm carries the drape when the hands are free. */
  readonly togate: boolean;

  constructor(private readonly avatar: HumanoidAvatar) {
    const rig = avatar.rig;
    const g = avatar.appearance.garments;
    this.togate = g.some((x) => x.kind === 'toga') || (avatar.appearance.sex === 'male' && g.some((x) => x.kind === 'palla'));
    this.legScale = (rig.thigh + rig.shin) / REF_LEG;
    this.restHips.copy(avatar.bones[B.hips].position);
    this.stoopW = rig.stoop;
    this.out.identity();
  }

  // ------------------------------------------------------------------ commands

  setStance(stance: Stance) {
    if (stance === this.stance) return;
    this.prevStanceClip = this.currentStanceClip();
    this.stance = stance;
    this.stanceFade = 0;
  }

  setDrawn(drawn: boolean) {
    if (drawn === this.drawn) return;
    this.prevStanceClip = this.currentStanceClip();
    this.drawn = drawn;
    this.stanceFade = 0;
    // Without a draw/sheath clip running, the weapon changes hands immediately.
    const drawing = this.actions.some((a) => !a.fading && (a.name.startsWith('drawWeapon') || a.name.startsWith('sheathWeapon')) && !a.grabFired);
    if (!drawing) this.avatar.equipment.setVisualDrawn(drawn);
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
    this.avatar.equipment.setLoopProp(loop === 'work' ? 'hammer' : loop === 'sweep' ? 'broom' : null);
  }

  setDead(dead: boolean) {
    if (dead === this.dead) return;
    this.dead = dead;
    if (dead) {
      if (!this.actions.some((a) => a.name.startsWith('death') && !a.fading)) {
        this.play('death');
        const a = this.actions[this.actions.length - 1];
        if (a) {
          a.t = a.info.clip.duration;
          a.w = 1;
          a.hitFired = true;
          if (a.info.drop) {
            a.dropFired = true;
            this.avatar.equipment.drop(a.info.drop.what);
          }
        }
      }
    } else {
      for (const a of this.actions) this.endAction(a, true);
      this.actions.length = 0;
    }
  }

  lookAt(p: THREE.Vector3 | null) {
    this.lookTarget = p ? (this.lookTarget ?? new THREE.Vector3()).copy(p) : null;
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

    // First person: the stance arms become the view poses (weapon low-right in view, shield edge left).
    this.fpW = approach(this.fpW, this.firstPerson && (this.drawn || this.torch) && !this.dead ? 1 : 0, 10, dt);
    if (this.fpW > 0.01) {
      sampleClip(fpClip(this.stance, this.drawn, this.torch), 0, this.tmpA);
      blendMasked(this.stanceP, this.stanceP, this.tmpA, this.fpW, ARMS_MASK);
    }

    // --- 2. locomotion
    const w = speedWeights(this.speedSm, this.sw);
    const moveW = 1 - w[0];
    const gaits: [GaitName, number, number][] = [];
    if (w[1] > 0) {
      if (this.sneakW < 0.99) gaits.push(['walk', w[1] * (1 - this.sneakW), GAITS.walk.speed * GAITS.walk.cycle]);
      if (this.sneakW > 0.01) gaits.push(['sneak', w[1] * this.sneakW, GAITS.sneak.speed * GAITS.sneak.cycle]);
    }
    if (w[2] > 0) gaits.push(['run', w[2], GAITS.run.speed * GAITS.run.cycle]);
    if (w[3] > 0) gaits.push(['sprint', w[3], GAITS.sprint.speed * GAITS.sprint.cycle]);
    if (gaits.length) {
      let sEff = 0;
      for (const [, gw, S] of gaits) sEff += gw * S;
      const rate = sEff > 0.05 ? this.speedSm / sEff : 1 / GAITS.walk.cycle;
      this.phase = (this.phase + rate * dt) % 1;
      let total = 0;
      for (const [g, gw] of gaits) {
        this.sampleGait(g, this.tmpC);
        total += gw;
        if (total === gw) this.loco.copy(this.tmpC);
        else blendPose(this.loco, this.loco, this.tmpC, gw / total);
      }
    }
    const base = this.out;
    if (moveW > 0 && gaits.length) blendPose(base, this.stanceP, this.loco, moveW);
    else base.copy(this.stanceP);

    // Turn in place: small steps while rotating without moving.
    const turning = Math.abs(s.turnRate) > 0.9 && this.speedSm < 0.3 && s.grounded;
    this.turnW = approach(this.turnW, turning ? 1 : 0, 8, dt);
    if (this.turnW > 0.01) {
      this.turnPhase = (this.turnPhase + dt * Math.min(1.6, 0.6 + Math.abs(s.turnRate) * 0.25) / GAITS.turn.cycle) % 1;
      samplePhase(gaitClip('turn', 0), this.turnPhase, this.tmpA);
      blendMasked(base, base, this.tmpA, this.turnW * (1 - moveW), LOWER);
    }

    // --- 3. stance arms while moving
    const am = stanceArmMask(this.stance, this.drawn, this.torch, this.togate);
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
      blendMasked(base, base, this.tmpA, this.blockW, UPPER);
    }
    const attackActive = this.actions.some((a) => !a.fading && a.info.windup !== undefined);
    this.chargeW = approach(this.chargeW, attackActive ? 0 : Math.min(1, this.charge * 1.4), this.charge > 0 ? 7 : 12, dt);
    if (this.chargeW > 0.01) {
      const p = actionInfo(this.stance, 'attackPower');
      if (p && p.windup !== undefined) {
        sampleClip(p.clip, p.windup * this.chargeW, this.tmpA);
        // Strain: a slight tremble at full charge.
        this.buildAutoMask(moveW);
        blendMasked(base, base, this.tmpA, Math.min(1, this.chargeW * 1.5), this.autoMask);
      }
    }

    // --- 7. actions
    this.updateActions(dt, base, moveW);

    // --- 8. procedural
    this.procedural(dt, base, s);
    this.write(base);
  }

  private sampleGait(g: GaitName, out: Pose) {
    const dir = g === 'sprint' || g === 'turn' ? 0 : this.dirSm;
    if (g === 'sprint') {
      samplePhase(gaitClip('sprint', 0), this.phase, out);
      return;
    }
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

  private updateActions(dt: number, base: Pose, moveW: number) {
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
        this.avatar.equipment.drop(a.info.drop.what);
      }
      if (!a.grabFired && a.info.grab !== undefined && a.t >= a.info.grab) {
        a.grabFired = true;
        this.avatar.equipment.setVisualDrawn(a.name.startsWith('drawWeapon'));
      }
      if (!a.fading && !a.info.hold && a.t >= clip.duration - a.fadeOut * 0.5) {
        if (a.name.startsWith('drawWeapon') && !this.drawn) this.setDrawn(true);
        if (a.name.startsWith('sheathWeapon') && this.drawn) this.setDrawn(false);
        this.endAction(a, false);
      }
      a.w = a.fading ? Math.max(0, a.w - dt / a.fadeOut) : Math.min(1, a.w + dt / Math.max(0.01, a.fadeIn));
    }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].fading && list[i].w <= 0) list.splice(i, 1);
    for (const a of list) {
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
      if (a.info.keepShield && this.drawn && hasShield(this.stance)) {
        // Gestures leave a drawn shield where the stance holds it.
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

  private fullDeathW(): number {
    let w = 0;
    for (const a of this.actions) if (a.name.startsWith('death') || a.name === 'knockdown' || a.name === 'yield') w = Math.max(w, a.w);
    return w;
  }

  private fullOverride(): number {
    let w = 0;
    for (const a of this.actions) if (a.info.mask === 'full' || a.name.startsWith('death') || a.name === 'yield') w = Math.max(w, a.w);
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

    // Aim pitch: first person (weapon drawn) and while holding a bow draw.
    const bowAim = this.actions.some((a) => a.name === 'bowDraw' && !a.fading);
    const aimOn = (this.firstPerson && (this.drawn || this.torch)) || bowAim ? 1 : 0;
    this.aimSm = approach(this.aimSm, aimOn * this.aimPitch, 14, dt);
    if (Math.abs(this.aimSm) > 1e-3) {
      const deg = -this.aimSm / DEG;
      this.addParent(p, B.spine, 0, deg * 0.35 * free);
      this.addParent(p, B.chest, 0, deg * 0.45 * free);
    }
    // First person during actions: lift the swing so strikes cross the view.
    if (this.fpW > 0.01) {
      let act = 0;
      for (const a of this.actions) if (!a.fading && a.info.mask !== 'full') act = Math.max(act, a.w);
      const k = this.fpW * free * act;
      if (k > 0.01 && this.drawn) {
        this.addParent(p, B.shoulderR, 1, 6 * k);
        this.add(p, B.upperArmR, 0, -18 * k);
        if (!hasShield(this.stance) && weaponClass(this.stance) !== 'blade') this.add(p, B.upperArmL, 0, -14 * k);
      }
    }
    // Two-handed weapons: the left hand rides the shaft (unless it carries a net/torch or gestures).
    const grip = this.avatar.equipment.twoHandGrip();
    let gw = grip && this.drawn && !this.torch ? 1 - this.fullDeathW() : 0;
    for (const a of this.actions) if (a.info.keepShield) gw *= 1 - a.w;
    gw *= 1 - this.blockW * 0.5;
    this.gripW = approach(this.gripW, gw, 12, dt);
    if (grip && this.gripW > 0.01) leftHandOnShaft(p, this.avatar.rig, this.legScale, grip, this.gripW);

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
  }

  private write(p: Pose) {
    const bones = this.avatar.bones;
    const q = p.q;
    for (let i = 0; i < BONE_COUNT; i++) bones[i].quaternion.set(q[i * 4], q[i * 4 + 1], q[i * 4 + 2], q[i * 4 + 3]);
    const ls = this.legScale;
    bones[0].position.set(this.restHips.x + p.p[0] * ls, this.restHips.y + p.p[1] * ls, this.restHips.z + p.p[2] * ls);
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

export { BONES };
