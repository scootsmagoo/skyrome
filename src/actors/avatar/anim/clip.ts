/**
 * Clip baking and sampling.
 *
 * Clips are authored as key poses (anim/pose.ts semantics) or as functions of time (procedural
 * gaits), then baked at a fixed frame rate into flat quaternion arrays. Uniform sampling makes
 * runtime evaluation O(1) per bone: two frames and an nlerp. `toAnimationClip` converts a baked clip
 * into a standard THREE.AnimationClip (QuaternionKeyframeTrack per bone, VectorKeyframeTrack for
 * the hips position) for anyone who prefers THREE.AnimationMixer.
 */
import * as THREE from 'three';
import { BONES, BONE_COUNT, B, type Rig } from '../rig';
import { MonotoneCurve } from './spline';
import { SEM_HIPS_POS, SEM_LEN, semToQuats, specToSem, type PoseSpec } from './pose';
import { qNlerp } from './quat';
import { REF_RIG, restAnkle, solveLeg } from './ik';

/**
 * Foot placement for IK keys: [dx, dz, lift, pitch, yaw] relative to the rest ankle (reference
 * meters / degrees). dx + = toward the character's left, dz + = forward, pitch + = toes up,
 * yaw + = toes turned toward the character's left. Missing entries default to 0.
 */
export type FootKey = readonly number[];

export interface Key {
  /** Seconds from the clip start. */
  t: number;
  pose: PoseSpec;
  /** Planted feet (solved with IK every baked frame); inherited from the previous key. */
  feet?: { L?: FootKey; R?: FootKey };
  /** Zero velocity at this key (a held accent). */
  hold?: boolean;
}

export interface ClipDef {
  name: string;
  duration: number;
  loop?: boolean;
  /** Channels not set by any key come from here (defaults to the bind pose). */
  base?: PoseSpec;
  keys: Key[];
  fps?: number;
}

export interface CompiledClip {
  name: string;
  duration: number;
  fps: number;
  frames: number;
  loop: boolean;
  /** frames × BONE_COUNT × 4 */
  q: Float32Array;
  /** frames × 3 (hips offset from bind pose, reference-body meters) */
  p: Float32Array;
  /** frames × SEM_LEN semantic values (kept for tests and pose queries). */
  sem: Float32Array;
}

export const DEFAULT_FPS = 30;

/** Extra channels per key for IK feet: 5 per foot. */
const FOOT_CH = 10;

/** Bake a keyframed clip. Keys inherit unspecified channels from the previous key (or the base). */
export function bakeClip(def: ClipDef): CompiledClip {
  const keys = [...def.keys].sort((a, b) => a.t - b.t);
  if (!keys.length) keys.push({ t: 0, pose: {} });
  const useIK = keys.some((k) => k.feet);
  const N = SEM_LEN + (useIK ? FOOT_CH : 0);
  const keySem: Float32Array[] = [];
  let prev = new Float32Array(N);
  specToSem(def.base ?? {}, prev);
  for (const k of keys) {
    const s = Float32Array.from(prev);
    specToSem(k.pose, s);
    if (useIK && k.feet) {
      for (const [side, off] of [['L', SEM_LEN], ['R', SEM_LEN + 5]] as const) {
        const f = k.feet[side];
        if (f) for (let i = 0; i < 5; i++) s[off + i] = f[i] ?? 0;
      }
    }
    keySem.push(s);
    prev = s;
  }
  const times = keys.map((k) => k.t);
  const holds = new Set<number>();
  keys.forEach((k, i) => k.hold && holds.add(i));
  const curves: (MonotoneCurve | number)[] = [];
  for (let c = 0; c < N; c++) {
    const vals = keySem.map((s) => s[c]);
    const first = vals[0];
    if (vals.every((v) => Math.abs(v - first) < 1e-6)) curves.push(first);
    else curves.push(new MonotoneCurve(times, vals, { period: def.loop ? def.duration : undefined, holds }));
  }
  const ext = new Float32Array(N);
  const rl = restAnkle('L');
  const rr = restAnkle('R');
  return bakeFunction(def.name, def.duration, !!def.loop, (t, out) => {
    for (let c = 0; c < N; c++) {
      const cv = curves[c];
      ext[c] = typeof cv === 'number' ? cv : cv.eval(t);
    }
    out.set(ext.subarray(0, SEM_LEN));
    if (useIK) {
      for (const [side, off, r] of [['L', SEM_LEN, rl], ['R', SEM_LEN + 5, rr]] as const) {
        const lift = ext[off + 2];
        const pitch = ext[off + 3];
        const yaw = ext[off + 4];
        // Rock about the heel (toes up) or the ball (heel up) so the contact point stays put.
        const g = (pitch * Math.PI) / 180;
        const fx = Math.sin((yaw * Math.PI) / 180);
        const fz = Math.cos((yaw * Math.PI) / 180);
        const { ankleH: h, footFwd: fw, footBack: bk } = REF_RIG;
        let along: number, dy: number;
        if (g >= 0) {
          along = bk * Math.cos(g) - h * Math.sin(g) - bk;
          dy = h * Math.cos(g) + bk * Math.sin(g) - h;
        } else {
          along = h * Math.sin(-g) - fw * Math.cos(-g) + fw;
          dy = h * Math.cos(-g) + fw * Math.sin(-g) - h;
        }
        const grounded = lift < 0.02;
        solveLeg(
          out,
          side,
          { x: r[0] + ext[off] + fx * along, y: r[1] + lift + dy, z: r[2] + ext[off + 1] + fz * along, pitch, yaw },
          REF_RIG,
          grounded ? Math.max(0, -pitch) : 0,
        );
      }
    }
  }, def.fps);
}

/** Bake a clip from a function that writes a semantic vector for time t. */
export function bakeFunction(
  name: string,
  duration: number,
  loop: boolean,
  fn: (t: number, out: Float32Array) => void,
  fps = DEFAULT_FPS,
): CompiledClip {
  const frames = Math.max(2, Math.round(duration * fps) + 1);
  const q = new Float32Array(frames * BONE_COUNT * 4);
  const p = new Float32Array(frames * 3);
  const sem = new Float32Array(frames * SEM_LEN);
  const cur = new Float32Array(SEM_LEN);
  for (let f = 0; f < frames; f++) {
    const t = Math.min(duration, (f / (frames - 1)) * duration);
    cur.fill(0);
    fn(loop && f === frames - 1 ? 0 : t, cur);
    sem.set(cur, f * SEM_LEN);
    semToQuats(cur, q, f * BONE_COUNT * 4, p, f * 3);
  }
  return { name, duration, fps: (frames - 1) / duration, frames, loop, q, p, sem };
}

/** A pose: bone quaternions plus the hips offset. */
export class Pose {
  readonly q = new Float32Array(BONE_COUNT * 4);
  readonly p = new Float32Array(3);
  constructor() {
    for (let b = 0; b < BONE_COUNT; b++) this.q[b * 4 + 3] = 1;
  }
  copy(o: Pose): this {
    this.q.set(o.q);
    this.p.set(o.p);
    return this;
  }
  identity(): this {
    this.q.fill(0);
    for (let b = 0; b < BONE_COUNT; b++) this.q[b * 4 + 3] = 1;
    this.p.fill(0);
    return this;
  }
}

/** Wrap or clamp a time into a clip's range. */
export function clipTime(clip: CompiledClip, t: number): number {
  if (clip.loop) {
    const d = clip.duration;
    return ((t % d) + d) % d;
  }
  return t < 0 ? 0 : t > clip.duration ? clip.duration : t;
}

/** Sample a baked clip at time t into `out`. */
export function sampleClip(clip: CompiledClip, t: number, out: Pose) {
  const tt = clipTime(clip, t);
  const f = tt * clip.fps;
  let i = Math.floor(f);
  if (i >= clip.frames - 1) i = clip.frames - 2;
  const a = f - i;
  const qa = i * BONE_COUNT * 4;
  const qb = qa + BONE_COUNT * 4;
  const q = clip.q;
  for (let b = 0; b < BONE_COUNT; b++) qNlerp(out.q, b * 4, q, qa + b * 4, q, qb + b * 4, a);
  const p = clip.p;
  const pa = i * 3;
  out.p[0] = p[pa] + (p[pa + 3] - p[pa]) * a;
  out.p[1] = p[pa + 1] + (p[pa + 4] - p[pa + 1]) * a;
  out.p[2] = p[pa + 2] + (p[pa + 5] - p[pa + 2]) * a;
}

/** Sample a clip at a normalized phase (0..1) of its duration. */
export function samplePhase(clip: CompiledClip, phase: number, out: Pose) {
  sampleClip(clip, phase * clip.duration, out);
}

/** Semantic values of a clip at time t (nearest frame); used by tests and pose queries. */
export function semAt(clip: CompiledClip, t: number, out = new Float32Array(SEM_LEN)): Float32Array {
  const f = Math.round(clipTime(clip, t) * clip.fps);
  out.set(clip.sem.subarray(f * SEM_LEN, (f + 1) * SEM_LEN));
  return out;
}

/** out = lerp(a, b, w) for every bone. `out` may alias `a`. */
export function blendPose(out: Pose, a: Pose, b: Pose, w: number) {
  if (w <= 0) {
    if (out !== a) out.copy(a);
    return;
  }
  if (w >= 1) {
    if (out !== b) out.copy(b);
    return;
  }
  for (let i = 0; i < BONE_COUNT; i++) qNlerp(out.q, i * 4, a.q, i * 4, b.q, i * 4, w);
  for (let k = 0; k < 3; k++) out.p[k] = a.p[k] + (b.p[k] - a.p[k]) * w;
}

/** Per-bone weights. Index BONE_COUNT holds the weight for the hips position. */
export type BoneMask = Float32Array;

export function makeMask(weights: Partial<Record<(typeof BONES)[number] | 'hipsPos', number>>, fallback = 0): BoneMask {
  const m = new Float32Array(BONE_COUNT + 1).fill(fallback);
  for (const [k, v] of Object.entries(weights)) {
    if (k === 'hipsPos') m[BONE_COUNT] = v!;
    else m[B[k as (typeof BONES)[number]]] = v!;
  }
  return m;
}

/** out = lerp(a, b, w * mask[bone]). `out` may alias `a`. */
export function blendMasked(out: Pose, a: Pose, b: Pose, w: number, mask: BoneMask) {
  if (w <= 0) {
    if (out !== a) out.copy(a);
    return;
  }
  for (let i = 0; i < BONE_COUNT; i++) {
    const k = w * mask[i];
    if (k <= 0) {
      if (out !== a) {
        out.q[i * 4] = a.q[i * 4];
        out.q[i * 4 + 1] = a.q[i * 4 + 1];
        out.q[i * 4 + 2] = a.q[i * 4 + 2];
        out.q[i * 4 + 3] = a.q[i * 4 + 3];
      }
    } else qNlerp(out.q, i * 4, a.q, i * 4, b.q, i * 4, k >= 1 ? 1 : k);
  }
  const kp = w * mask[BONE_COUNT];
  for (let k = 0; k < 3; k++) out.p[k] = a.p[k] + (b.p[k] - a.p[k]) * kp;
}

/** THREE.AnimationClip version of a baked clip for a specific rig (hips track in that rig's meters). */
export function toAnimationClip(clip: CompiledClip, rig: Rig): THREE.AnimationClip {
  const times = new Float32Array(clip.frames);
  for (let f = 0; f < clip.frames; f++) times[f] = Math.min(clip.duration, f / clip.fps);
  const tracks: THREE.KeyframeTrack[] = [];
  for (let b = 0; b < BONE_COUNT; b++) {
    const vals = new Float32Array(clip.frames * 4);
    for (let f = 0; f < clip.frames; f++) vals.set(clip.q.subarray((f * BONE_COUNT + b) * 4, (f * BONE_COUNT + b) * 4 + 4), f * 4);
    tracks.push(new THREE.QuaternionKeyframeTrack(`${BONES[b]}.quaternion`, times, vals));
  }
  const pos = new Float32Array(clip.frames * 3);
  const legScale = (rig.thigh + rig.shin) / REF_LEG;
  for (let f = 0; f < clip.frames; f++) {
    pos[f * 3] = rig.joints[0] + clip.p[f * 3] * legScale;
    pos[f * 3 + 1] = rig.joints[1] + clip.p[f * 3 + 1] * legScale;
    pos[f * 3 + 2] = rig.joints[2] + clip.p[f * 3 + 2] * legScale;
  }
  tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, pos));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/** Leg length (thigh + shin) of the 1.75 m reference body; hips offsets scale by legLength / REF_LEG. */
export const REF_LEG = 1.75 * (0.515 - 0.278) + (1.75 * 0.278 - 0.075);

