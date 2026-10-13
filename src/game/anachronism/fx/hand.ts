/**
 * The gun in the player's hands: the model on the right-hand grip socket and the arms posed round it.
 *
 * The arms are placed by the animation controller's pose hook (`AnimationController.poseHook`, run
 * after the grip IK): the right fist goes to a spot in front of the shoulder (third person) or in
 * the camera's frame (first person), a wrist correction turns the gun exactly onto the aim, and for
 * two-handed guns the left fist goes to the handguard or the foregrip. Character space, no
 * allocation. While a gun is out the melee weapon and shield are hidden (they show again, in the
 * state the equipment keeps, when it is put away).
 */
import * as THREE from 'three';
import type { Game } from '../../../core/Game';
import { HumanoidAvatar } from '../../../actors/avatar/HumanoidAvatar';
import { avatarMaterial } from '../../../actors/avatar/material';
import { ARM_LEFT, ARM_RIGHT, fistTo, forwardKinematics, fk } from '../../../actors/avatar/anim/armIK';
import { B } from '../../../actors/avatar/rig';
import type { Pose } from '../../../actors/avatar/anim/clip';
import { qInvert, qMul, qRotate } from '../../../actors/avatar/anim/quat';
import type { GunId } from '../types';
import { gunModel, type GunModel } from './models';

/** The elbow pole in the chest frame: [-X is the right side]. */
const POLE_R_TP: readonly [number, number, number] = [-0.7, -1, -0.15];
const POLE_R_FP: readonly [number, number, number] = [-1, -0.45, 0];
const POLE_L: readonly [number, number, number] = [0.55, -1, -0.2];
/** First person: the camera sits this far in front of the eyes' base point (as the animation controller has it). */
const FP_EYE_FORWARD = 0.12;
const MAX_WRIST = 1.2;

const q4 = new Float32Array(4);
const q4b = new Float32Array(4);
const q4c = new Float32Array(4);
const v3 = new Float32Array(3);
const v3b = new Float32Array(3);

/** Quaternion of a turn of `ang` about a unit axis. */
function qAxisAngle(out: Float32Array, x: number, y: number, z: number, ang: number) {
  const s = Math.sin(ang * 0.5);
  out[0] = x * s;
  out[1] = y * s;
  out[2] = z * s;
  out[3] = Math.cos(ang * 0.5);
}

export class GunHand {
  /** The gun in hand (null: none, or on its way down). */
  gun: GunId | null = null;
  /** 0 = arms as animated, 1 = arms on the gun. */
  w = 0;
  /** 0 = at the hip, 1 = to the shoulder / the eye. */
  aimK = 0;
  /** Debug: hold the aim blend at this value whatever the logic says (null: follow `game.guns.aiming`). */
  aimOverride: number | null = null;
  /** Recoil, 1 right after a shot and falling. */
  private recoil = 0;
  private avatar: HumanoidAvatar | null = null;
  private readonly meshes = new Map<GunId, THREE.Mesh>();
  private mesh: THREE.Mesh | null = null;
  /** The model still in the hands (while the arms ease back, `gun` is already null). */
  private shown: GunId | null = null;
  private hidMelee = false;

  constructor(private readonly game: Game) {}

  /** Take the gun out (or, null, put it away). */
  equip(gun: GunId | null) {
    if (gun) this.attach();
    if (this.mesh && this.mesh !== this.meshes.get(gun ?? 'pistol')) this.mesh.visible = false;
    this.gun = gun;
    if (gun) this.shown = gun;
    if (gun && this.avatar) {
      this.mesh = this.meshFor(gun);
      this.mesh.visible = true;
      this.avatar.getSocket('gripR').add(this.mesh);
    }
    if (!gun && this.mesh) this.mesh.visible = false;
  }

  /** One shot's kick through the arms. */
  kick(strength = 1) {
    this.recoil = Math.min(1.2, this.recoil + strength);
  }

  get model(): GunModel | null {
    return this.gun ? gunModel(this.gun) : null;
  }

  /** A point of the gun's frame in world space (the gun must be out). */
  toWorld(p: readonly [number, number, number], out: THREE.Vector3): THREE.Vector3 | null {
    const mesh = this.mesh;
    if (!mesh || !this.gun || !this.avatar) return null;
    this.avatar.root.updateMatrixWorld(true);
    this.avatar.syncWorld();
    mesh.updateWorldMatrix(true, false);
    return out.set(p[0], p[1], p[2]).applyMatrix4(mesh.matrixWorld);
  }

  private meshFor(gun: GunId): THREE.Mesh {
    let m = this.meshes.get(gun);
    if (!m) {
      m = new THREE.Mesh(gunModel(gun).geometry, avatarMaterial());
      m.name = `gun:${gun}`;
      // The grip's handle runs along the socket's Y (the fist's axis); the barrel leans from the socket's Z by the rake.
      m.rotation.x = -gunModel(gun).rake;
      m.castShadow = true;
      m.receiveShadow = true;
      this.meshes.set(gun, m);
    }
    return m;
  }

  /** Bind to the player's current avatar (it can be replaced: character creation, appearance changes). */
  private attach() {
    const av = this.game.player?.avatar;
    const humanoid = av instanceof HumanoidAvatar ? av : null;
    if (humanoid === this.avatar) return;
    if (this.avatar) {
      this.avatar.anim.poseHook = null;
      for (const m of this.meshes.values()) m.removeFromParent();
    }
    this.avatar = humanoid;
    if (humanoid) {
      humanoid.anim.poseHook = (p, dt, ls) => this.pose(p, dt, ls);
      if (this.gun) this.equip(this.gun);
    }
  }

  /** Every frame (after the animation, before the render): the blend, the recoil, and the melee gear out of sight. */
  update(dt: number) {
    if (this.gun || this.w > 0.001) this.attach();
    const av = this.avatar;
    if (!av) return;
    const target = this.gun ? 1 : 0;
    this.w += Math.max(-1, Math.min(1, (target - this.w) * 1)) * Math.min(1, dt * 7);
    if (Math.abs(this.w - target) < 0.01) this.w = target;
    const aim = this.aimOverride ?? (this.game.guns?.aiming ? 1 : 0);
    this.aimK += (aim - this.aimK) * Math.min(1, dt * 9);
    this.recoil = Math.max(0, this.recoil - dt * 7);
    const eq = av.equipment;
    if (this.gun) {
      const w = eq.weaponObject;
      const s = eq.shieldObject;
      if (w) w.visible = false;
      if (s && eq.inHand) s.visible = false;
      this.hidMelee = true;
    } else if (this.hidMelee && this.w < 0.05) {
      // Back to however the equipment keeps its gear.
      this.hidMelee = false;
      eq.setVisualDrawn(eq.inHand);
      if (this.mesh) this.mesh.visible = false;
    }
    if (this.w <= 0.001 && !this.gun) {
      this.shown = null;
      if (av.anim.poseHook) av.anim.poseHook = null;
    }
    if ((this.gun || this.w > 0.001) && !av.anim.poseHook) av.anim.poseHook = (p, d, ls) => this.pose(p, d, ls);
  }

  /** The pose hook: the arms onto the gun. */
  private pose(p: Pose, _dt: number, ls: number) {
    const av = this.avatar;
    const shown = this.shown;
    if (!av || !shown || this.w <= 0.003) return;
    const m = gunModel(shown);
    const rig = av.rig;
    const s = rig.s;
    const player = this.game.player;
    const first = player.viewMode === 'first';
    // The aim, in the character's frame.
    const cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
    const wx = -Math.sin(player.yaw) * cp, wy = sp, wz = -Math.cos(player.yaw) * cp;
    const e = av.root.matrixWorld.elements;
    const hl = Math.hypot(e[8], e[10]) || 1;
    const sn = e[8] / hl, cs = e[10] / hl;
    let ax = cs * wx - sn * wz;
    let ay = wy + this.recoil * 0.1; // the recoil lifts the muzzle
    let az = sn * wx + cs * wz;
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    // Right = aim x up, up = right x aim (character space: right is -X).
    let rx = -az;
    const ry = 0;
    let rz = ax;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    const ux = ry * az - rz * ay;
    const uy = rz * ax - rx * az;
    const uz = rx * ay - ry * ax;
    // Where the right fist goes: from the shoulder (third person) or the eye (first person).
    forwardKinematics(p, rig, ls);
    const k = this.aimK;
    const a = first ? m.fp : m.tp;
    const ox = (a.hip[0] + (a.aim[0] - a.hip[0]) * k) * s;
    const oy = (a.hip[1] + (a.aim[1] - a.hip[1]) * k) * s;
    const back = this.recoil * 0.055 * s;
    const oz = (a.hip[2] + (a.aim[2] - a.hip[2]) * k) * s - back;
    let tx: number, ty: number, tz: number;
    if (first) {
      tx = 0; ty = av.eyeHeight; tz = FP_EYE_FORWARD;
    } else {
      const ua = B.upperArmR;
      tx = fk.p[ua * 3]; ty = fk.p[ua * 3 + 1]; tz = fk.p[ua * 3 + 2];
    }
    tx += rx * ox + ux * oy + ax * oz;
    ty += ry * ox + uy * oy + ay * oz;
    tz += rz * ox + uz * oy + az * oz;
    // The grip's handle (the hand's +Z) leans forward at the top by the grip's rake from the gun's up.
    const cr = Math.cos(m.rake), sr = Math.sin(m.rake);
    fistTo(p, rig, ls, ARM_RIGHT, tx, ty, tz, ux * cr + ax * sr, uy * cr + ay * sr, uz * cr + az * sr, first ? POLE_R_FP : POLE_R_TP, this.w, 80);
    // The wrist: turn the gun exactly onto the aim. In the hand's frame the barrel is (0, -cos, sin)
    // and the gun's up (0, sin, cos), since the mesh is turned by the rake about the socket's X.
    forwardKinematics(p, rig, ls);
    const hand = B.handR;
    qRotate(v3, 0, fk.q, hand * 4, 0, -cr, sr);
    const bx = v3[0], by = v3[1], bz = v3[2];
    let cx = by * az - bz * ay, cy = bz * ax - bx * az, cz = bx * ay - by * ax;
    const sl = Math.hypot(cx, cy, cz);
    let swing = Math.atan2(sl, bx * ax + by * ay + bz * az);
    if (sl > 1e-5) { cx /= sl; cy /= sl; cz /= sl; } else { cx = 0; cy = 1; cz = 0; swing = 0; }
    swing = Math.min(MAX_WRIST, swing) * this.w;
    qAxisAngle(q4, cx, cy, cz, swing);
    // The gun's up after that swing, against the wanted up, about the aim.
    qRotate(v3b, 0, fk.q, hand * 4, 0, sr, cr);
    qRotate(v3, 0, q4, 0, v3b[0], v3b[1], v3b[2]);
    let hx = v3[0], hy = v3[1], hz = v3[2];
    const d = hx * ax + hy * ay + hz * az;
    hx -= d * ax; hy -= d * ay; hz -= d * az;
    const crx = hy * uz - hz * uy, cry = hz * ux - hx * uz, crz = hx * uy - hy * ux;
    let roll = Math.atan2(crx * ax + cry * ay + crz * az, hx * ux + hy * uy + hz * uz);
    roll = Math.max(-MAX_WRIST, Math.min(MAX_WRIST, roll)) * this.w;
    qAxisAngle(q4b, ax, ay, az, roll);
    qMul(q4c, 0, q4b, 0, q4, 0); // delta = roll * swing, in character space
    // local' = parent^-1 * delta * parent * local
    qInvert(q4, 0, fk.q, B.forearmR * 4);
    qMul(q4b, 0, q4c, 0, fk.q, B.forearmR * 4);
    qMul(q4c, 0, q4, 0, q4b, 0);
    qMul(q4, 0, q4c, 0, p.q, hand * 4);
    p.q.set(q4, hand * 4);
    // The left fist, on the handguard or the foregrip.
    const sup = m.support;
    if (sup) {
      forwardKinematics(p, rig, ls);
      const sx = sup.pos[0] * s, sy = sup.pos[1] * s, sz = sup.pos[2] * s;
      const lx = tx + rx * sx + ux * sy + ax * sz;
      const ly = ty + ry * sx + uy * sy + ay * sz;
      const lz = tz + rz * sx + uz * sy + az * sz;
      if (sup.axis === 'barrel') fistTo(p, rig, ls, ARM_LEFT, lx, ly, lz, ax, ay, az, POLE_L, this.w, 80);
      else fistTo(p, rig, ls, ARM_LEFT, lx, ly, lz, ux, uy, uz, POLE_L, this.w, 80);
    }
  }

  dispose() {
    if (this.avatar) this.avatar.anim.poseHook = null;
    for (const m of this.meshes.values()) m.removeFromParent();
    this.meshes.clear();
  }
}
