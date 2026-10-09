/**
 * An active ragdoll for one humanoid (after NaturalMotion's Euphoria, as in GTA IV): twelve rigid
 * bodies — pelvis, belly, chest, head, upper and lower arms, thighs and shins — joined at the
 * joints, with simulated muscles that pull each body toward the pose the animation wants, at a
 * strength (`strength`, 0 limp … 1 firm) the owner sets moment to moment. A blow lands as an
 * impulse on the body part it struck; a knockdown goes half limp and the body flails and sprawls;
 * a death goes limp and the body crumples, falls down steps and comes to rest however it lands.
 *
 * Muscles are PD controllers on each joint's RELATIVE rotation (child to parent), applied as equal
 * and opposite torques: they never add spin to the body as a whole (gravity and contacts do that).
 *
 * The rig: every bone has an identity rest rotation (rig.ts), so a body's frame is simply its
 * bone's world frame when the ragdoll starts, and writing a body back to its bone is a change of
 * parent frame. Bones without a body of their own (shoulders, neck, hands, feet, fingers) keep the
 * animation's local rotation and ride along.
 */
import * as THREE from 'three';
import { RAPIER, Layer, groups, type Physics } from '../../core/Physics';
import { B, BONES, BONE_COUNT, PARENT_INDEX, type BoneName } from '../../actors/avatar/rig';
import type { HumanoidAvatar } from '../../actors/avatar/HumanoidAvatar';

/** One body: the bone it drives, the bone at its far end (for its length) and its joint. */
interface SegDef {
  bone: BoneName;
  /** The far end of the capsule (child bone), or a direction for the pelvis/chest (across). */
  tip?: BoneName;
  across?: [BoneName, BoneName];
  /** Radius at the 1.75 m reference body. */
  r: number;
  /** Parent segment, and the bone whose origin is the joint. */
  parent?: BoneName;
  joint?: BoneName;
  /** Hinge (elbow, knee): limits about the bone's X axis (radians). */
  hinge?: [number, number];
  /** Extra length past the tip (hands, feet). */
  extend?: number;
}

const DEG = Math.PI / 180;

export const SEGMENTS: readonly SegDef[] = [
  { bone: 'hips', across: ['thighL', 'thighR'], r: 0.11 },
  { bone: 'spine', tip: 'chest', r: 0.105, parent: 'hips', joint: 'spine' },
  { bone: 'chest', across: ['upperArmL', 'upperArmR'], r: 0.11, parent: 'spine', joint: 'chest' },
  { bone: 'head', r: 0.105, parent: 'chest', joint: 'neck' },
  { bone: 'upperArmL', tip: 'forearmL', r: 0.048, parent: 'chest', joint: 'upperArmL' },
  { bone: 'forearmL', tip: 'handL', r: 0.042, parent: 'upperArmL', joint: 'forearmL', hinge: [-150 * DEG, 0], extend: 0.09 },
  { bone: 'upperArmR', tip: 'forearmR', r: 0.048, parent: 'chest', joint: 'upperArmR' },
  { bone: 'forearmR', tip: 'handR', r: 0.042, parent: 'upperArmR', joint: 'forearmR', hinge: [-150 * DEG, 0], extend: 0.09 },
  { bone: 'thighL', tip: 'shinL', r: 0.07, parent: 'hips', joint: 'thighL' },
  { bone: 'shinL', tip: 'footL', r: 0.052, parent: 'thighL', joint: 'shinL', hinge: [0, 160 * DEG], extend: 0.05 },
  { bone: 'thighR', tip: 'shinR', r: 0.07, parent: 'hips', joint: 'thighR' },
  { bone: 'shinR', tip: 'footR', r: 0.052, parent: 'thighR', joint: 'shinR', hinge: [0, 160 * DEG], extend: 0.05 },
];

interface Seg {
  def: SegDef;
  bone: number;
  /** The joint to the parent (null for the pelvis). */
  joint: RAPIER.ImpulseJoint | null;
  parent: number; // index into segs, -1 for the pelvis
  body: RAPIER.RigidBody;
  /** Scalar inertia (kg m²) for the muscle gains. */
  inertia: number;
  /** Capsule length overall and radius (m), to recompute the inertia when the mass changes. */
  len: number;
  radius: number;
  /** World rotation the animation wants this body at (set each frame). */
  target: THREE.Quaternion;
  /** Transforms at the last two fixed steps (render interpolation). */
  prevP: THREE.Vector3;
  prevQ: THREE.Quaternion;
  currP: THREE.Vector3;
  currQ: THREE.Quaternion;
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);

/** Damping ratio of the muscles (their frequency is set per joint in drive). */
const MUSCLE_ZETA = 0.9;
/** A person's weight (kg) at the 1.75 m reference body. */
export const RAGDOLL_KG = 72;
const ANG_AXES = [RAPIER.JointAxis.AngX, RAPIER.JointAxis.AngY, RAPIER.JointAxis.AngZ];

export class Ragdoll {
  readonly segs: Seg[] = [];
  private joints: RAPIER.ImpulseJoint[] = [];
  private bySegBone = new Int32Array(BONE_COUNT).fill(-1);
  /** 0 limp … 1 firm: how hard the muscles hold the animation's pose. */
  strength = 1;
  /** Muscles stay at least this firm (stops joints folding into impossible shapes when limp). */
  floor = 0.04;
  disposed = false;

  constructor(
    private readonly physics: Physics,
    readonly avatar: HumanoidAvatar,
    velocity: THREE.Vector3Like,
  ) {
    const w = physics.world;
    const scale = avatar.rig.height / 1.75;
    avatar.root.updateMatrixWorld(true);
    const bones = avatar.bones;
    const worldPos = (b: number, out = new THREE.Vector3()) => out.setFromMatrixPosition(bones[b].matrixWorld);
    for (const def of SEGMENTS) {
      const bi = B[def.bone];
      bones[bi].matrixWorld.decompose(_p, _q, _s);
      const body = w.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(_p.x, _p.y, _p.z)
          .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
          .setLinvel(velocity.x, velocity.y, velocity.z)
          .setLinearDamping(0.05)
          .setAngularDamping(0.6)
          .setCcdEnabled(true),
      );
      // The shape in the bone's frame.
      const inv = _m.copy(bones[bi].matrixWorld).invert();
      const r = def.r * scale;
      let half: number, center: THREE.Vector3, dir: THREE.Vector3;
      if (def.across) {
        const a = worldPos(B[def.across[0]]).applyMatrix4(inv);
        const c = worldPos(B[def.across[1]]).applyMatrix4(inv);
        dir = c.clone().sub(a);
        half = Math.max(0.02, dir.length() / 2 - r * 0.6);
        center = a.add(c).multiplyScalar(0.5);
        // The pelvis sits a little above the hip joints, the chest block between armpits and neck.
        center.y = def.bone === 'hips' ? 0.02 * scale : center.y * 0.6;
        center.x = 0;
        dir.normalize();
      } else if (def.tip) {
        const t = worldPos(B[def.tip]).applyMatrix4(inv);
        const len = t.length() + (def.extend ?? 0) * scale;
        dir = t.clone().normalize();
        half = Math.max(0.02, len / 2 - r);
        center = dir.clone().multiplyScalar(len / 2);
      } else {
        // The head: a ball above the head bone's origin.
        dir = UP.clone();
        half = 0.025 * scale;
        center = new THREE.Vector3(0, 0.1 * scale, 0.015 * scale);
      }
      _q2.setFromUnitVectors(UP, dir);
      const col = RAPIER.ColliderDesc.capsule(half, r)
        .setTranslation(center.x, center.y, center.z)
        .setRotation({ x: _q2.x, y: _q2.y, z: _q2.z, w: _q2.w })
        .setDensity(1050)
        .setFriction(0.8)
        .setRestitution(0.05)
        .setCollisionGroups(groups(Layer.Ragdoll, Layer.World | Layer.Debris));
      w.createCollider(col, body);
      const mass = body.mass();
      const len = 2 * (half + r);
      const segIndex = this.segs.length;
      this.bySegBone[bi] = segIndex;
      this.segs.push({
        def,
        bone: bi,
        parent: def.parent ? this.bySegBone[B[def.parent]] : -1,
        joint: null,
        body,
        inertia: mass * (len * len / 12 + r * r / 4),
        len,
        radius: r,
        target: _q.clone(),
        prevP: _p.clone(),
        prevQ: _q.clone(),
        currP: _p.clone(),
        currQ: _q.clone(),
      });
    }
    // Bone-density capsules weigh in light (they are slimmer than a body): bring the whole to a
    // person's weight, ~72 kg for the 1.75 m reference body (mass goes with the cube of the
    // height, a little less).
    const total = this.segs.reduce((m, s) => m + s.body.mass(), 0);
    const k = (RAGDOLL_KG * Math.pow(scale, 2.5)) / total;
    for (const s of this.segs) {
      const col = s.body.collider(0);
      col.setDensity(col.density() * k);
      s.inertia = s.body.mass() * (s.len * s.len / 12 + s.radius * s.radius / 4);
    }
    // Muscle gains see everything a joint carries: the mass of the chain beyond it at the
    // distance of that chain's centre of mass (a spine holds up the chest, head and arms).
    for (let i = this.segs.length - 1; i >= 0; i--) {
      const s = this.segs[i];
      if (s.parent < 0) continue;
      const joint = worldPos(B[s.def.joint!]);
      let m = 0;
      const com = new THREE.Vector3();
      const visit = (k: number) => {
        const b = this.segs[k].body;
        const c = b.worldCom();
        m += b.mass();
        com.x += c.x * b.mass();
        com.y += c.y * b.mass();
        com.z += c.z * b.mass();
        for (let j = 0; j < this.segs.length; j++) if (this.segs[j].parent === k) visit(j);
      };
      visit(i);
      com.multiplyScalar(1 / m);
      const d = Math.max(0.08, com.distanceTo(joint));
      s.inertia = Math.max(s.inertia, m * d * d);
    }
    // Joints at the joint bone's origin.
    for (const s of this.segs) {
      if (s.parent < 0) continue;
      const ps = this.segs[s.parent];
      const anchor = worldPos(B[s.def.joint!]);
      const a1 = anchor.clone().applyMatrix4(_m.copy(bones[ps.bone].matrixWorld).invert());
      const a2 = anchor.clone().applyMatrix4(_m.copy(bones[s.bone].matrixWorld).invert());
      let data: RAPIER.JointData;
      if (s.def.hinge) data = RAPIER.JointData.revolute(a1, a2, AXIS_X);
      else data = RAPIER.JointData.spherical(a1, a2);
      const j = w.createImpulseJoint(data, ps.body, s.body, true);
      j.setContactsEnabled(false);
      if (s.def.hinge) (j as RAPIER.RevoluteImpulseJoint).setLimits(s.def.hinge[0], s.def.hinge[1]);
      for (const ax of s.def.hinge ? [RAPIER.JointAxis.AngX] : ANG_AXES) rawJoint(j).jointConfigureMotorModel(j.handle, ax, RAPIER.MotorModel.ForceBased);
      s.joint = j;
      this.joints.push(j);
    }
  }

  /** Total mass of the bodies (kg). */
  mass(): number {
    return this.segs.reduce((m, s) => m + s.body.mass(), 0);
  }

  /** The pelvis body's position (the body's centre of mass, roughly). */
  pelvis(out = new THREE.Vector3()): THREE.Vector3 {
    const t = this.segs[0].body.translation();
    return out.set(t.x, t.y, t.z);
  }

  /** Total speed of the bodies (m/s, summed): near 0 when the body has come to rest. */
  motion(): number {
    let v = 0;
    for (const s of this.segs) {
      const l = s.body.linvel();
      v += Math.hypot(l.x, l.y, l.z);
    }
    return v / this.segs.length;
  }

  /** A blow: an impulse (N s) on the body part nearest `at`, along `dir`. */
  impulse(at: THREE.Vector3Like, dir: THREE.Vector3Like, magnitude: number) {
    let best: Seg | null = null;
    let bd = Infinity;
    for (const s of this.segs) {
      const t = s.body.translation();
      const d = Math.hypot(t.x - at.x, t.y - at.y, t.z - at.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (!best) return;
    const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
    best.body.applyImpulseAtPoint({ x: (dir.x / l) * magnitude, y: (dir.y / l) * magnitude, z: (dir.z / l) * magnitude }, { x: at.x, y: at.y, z: at.z }, true);
  }

  /** Read the animation's pose as the muscles' targets (call after the avatar updated its bones). */
  readTargets() {
    this.avatar.root.updateMatrixWorld(true);
    for (const s of this.segs) this.avatar.bones[s.bone].matrixWorld.decompose(_p, s.target, _s);
  }

  /**
   * Muscles: joint motors toward the animation's local rotation of each joint (solved inside the
   * physics step, implicitly: stable at any strength). Force-based, scaled by the inertia of all
   * a joint carries, so a spine holding up the chest, head and arms is as firm as an elbow.
   */
  drive(dt: number) {
    void dt;
    const k = Math.max(this.floor, Math.min(1, this.strength));
    for (const s of this.segs) {
      if (s.parent < 0 || !s.joint) continue;
      const p = this.segs[s.parent];
      // Target local rotation (child relative to parent) = tp⁻¹ · tc, as a rotation vector.
      _q3.copy(p.target).invert().multiply(s.target);
      if (_q3.w < 0) _q3.set(-_q3.x, -_q3.y, -_q3.z, -_q3.w);
      const half = Math.acos(Math.min(1, _q3.w));
      const sn = Math.sin(half);
      const f = sn > 1e-6 ? (2 * half) / sn : 2;
      // Stiffer through the trunk (it carries the most), softer in the limbs.
      const hz = s.def.bone === 'spine' || s.def.bone === 'chest' ? 7 : s.def.bone === 'head' ? 6 : 5;
      const wn = 2 * Math.PI * hz;
      // Force-based (N m / rad): scaled by everything the joint carries (s.inertia).
      const stiff = wn * wn * k * s.inertia;
      const damp = 2 * MUSCLE_ZETA * wn * Math.sqrt(k) * s.inertia;
      const raw = rawJoint(s.joint);
      const h = s.joint.handle;
      raw.jointConfigureMotorPosition(h, RAPIER.JointAxis.AngX, _q3.x * f, stiff, damp);
      if (!s.def.hinge) {
        raw.jointConfigureMotorPosition(h, RAPIER.JointAxis.AngY, _q3.y * f, stiff, damp);
        raw.jointConfigureMotorPosition(h, RAPIER.JointAxis.AngZ, _q3.z * f, stiff, damp);
      }
    }
  }

  /** After a physics step: keep the last two transforms for interpolation. */
  sample() {
    for (const s of this.segs) {
      s.prevP.copy(s.currP);
      s.prevQ.copy(s.currQ);
      const t = s.body.translation();
      s.currP.set(t.x, t.y, t.z);
      rq(s.body.rotation(), s.currQ);
    }
  }

  /**
   * Pose the bones from the bodies (interpolated by `alpha` between fixed steps), keeping the
   * animation's local rotation for bones without a body. `blend` < 1 mixes toward the animation.
   */
  write(alpha: number, blend = 1) {
    writeBones(this.avatar, (bi, outP, outQ) => {
      const si = this.bySegBone[bi];
      if (si < 0) return false;
      const s = this.segs[si];
      outP.lerpVectors(s.prevP, s.currP, alpha);
      outQ.slerpQuaternions(s.prevQ, s.currQ, alpha);
      return true;
    }, blend);
  }

  /** World transforms of the bodies now (for a frozen pose). */
  snapshot(): { bone: number; p: THREE.Vector3; q: THREE.Quaternion }[] {
    return this.segs.map((s) => ({ bone: s.bone, p: s.currP.clone(), q: s.currQ.clone() }));
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const w = this.physics.world;
    for (const j of this.joints) w.removeImpulseJoint(j, false);
    for (const s of this.segs) w.removeRigidBody(s.body);
    this.joints.length = 0;
  }
}

/**
 * The joint set behind a joint: rapier.js 0.21 only exposes per-axis motors on typed spherical
 * joints, which createImpulseJoint does not return; the raw set takes the axis for any joint.
 */
interface RawMotors {
  jointConfigureMotorModel(handle: number, axis: number, model: number): void;
  jointConfigureMotorPosition(handle: number, axis: number, target: number, stiffness: number, damping: number): void;
}
function rawJoint(j: RAPIER.ImpulseJoint): RawMotors {
  return (j as unknown as { rawSet: RawMotors }).rawSet;
}

function rq(r: { x: number; y: number; z: number; w: number }, out: THREE.Quaternion): THREE.Quaternion {
  return out.set(r.x, r.y, r.z, r.w);
}

const worldQ: THREE.Quaternion[] = Array.from({ length: BONE_COUNT }, () => new THREE.Quaternion());
const animQ = new THREE.Quaternion();
const meshQ = new THREE.Quaternion();
const meshInv = new THREE.Matrix4();
const bp = new THREE.Vector3();
const bq = new THREE.Quaternion();

/**
 * Write bone rotations from world transforms given by `get` (bones it returns false for keep the
 * animation's local rotation). The hips also take their position. `blend` < 1 slerps each driven
 * bone's local rotation toward the animation's.
 */
export function writeBones(avatar: HumanoidAvatar, get: (bone: number, p: THREE.Vector3, q: THREE.Quaternion) => boolean, blend = 1) {
  const bones = avatar.bones;
  const mesh = avatar.mesh;
  mesh.updateMatrixWorld(false);
  mesh.matrixWorld.decompose(_p, meshQ, _s);
  meshInv.copy(mesh.matrixWorld).invert();
  for (let i = 0; i < BONE_COUNT; i++) {
    const pi = PARENT_INDEX[i];
    const parentQ = pi < 0 ? meshQ : worldQ[pi];
    const bone = bones[i];
    if (get(i, bp, bq)) {
      animQ.copy(bone.quaternion);
      // local = parent⁻¹ · world
      bone.quaternion.copy(parentQ).invert().multiply(bq);
      if (blend < 1) bone.quaternion.slerp(animQ, 1 - blend);
      if (i === 0) {
        const local = bp.applyMatrix4(meshInv);
        bone.position.lerp(local, blend);
      }
    }
    worldQ[i].copy(parentQ).multiply(bone.quaternion);
  }
  void BONES;
}
