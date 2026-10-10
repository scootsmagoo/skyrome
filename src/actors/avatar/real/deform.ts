/**
 * Faces and hands that move: a per-avatar parameter channel and the vertex deformation that reads it.
 *
 * Parameters. three.js sizes a skeleton's bone texture to a square: 12 x 12 texels hold 36 matrices for
 * the game's 25 bones, so slot 25 is free. RealBody writes 16 floats there every frame (`paramsOf`), and
 * every skinned material on the avatar's skeleton reads them with `getBoneMatrix(25.0)`: the skin (jaw,
 * fingers) and the eyes (blinks, gaze). No uniforms per object, no morph textures, nothing per frame on
 * the GPU but the bone texture three uploads anyway.
 *
 *   floats 0..3    jaw (rad), blink left, blink right (0..1), gaze yaw (rad, + to the figure's left)
 *   floats 4..7    gaze pitch (rad, + up), left hand: fingers' middle joint, index's middle joint (rad, + curls)
 *   floats 8..11   left hand: thumb swing, thumb end joint; right hand: fingers, index
 *   floats 12..15  right hand: thumb swing, thumb end joint; two spare
 *
 * Deformation (the skin material at LOD 0): two vertex attributes say which joint chain a vertex follows,
 * with the pivots in the bind pose and the weights (`aDef0` = pivot 1 and -(channel + 0.99 weight), stored
 * negative so a geometry without the attribute (read as w = 1) stays still; `aDef1` = pivot 2 and weight 2). Channels: 1 to 3 the left fingers, index and thumb, 4 to 6 the right, 7 the jaw. A finger
 * bends at its middle joint (pivot 1) and its end joint (pivot 2, 0.7 of the middle's angle); the thumb
 * swings about its base (pivot 1) toward the palm and bends at its end joint (pivot 2); the jaw turns
 * about its hinge (pivot 1) around the x axis. The knuckles stay with the bones (anim/hands.ts).
 */
import * as THREE from 'three';
import { B, BONE_COUNT, type Rig } from '../rig';
import { boneScales, type BoneScale } from './morph';
import { DIP_AT, handPlans, PIP_AT, THUMB_IP_AT, type HandMeasure, type HandParts } from './handShape';
import type { JawRig } from './head/faceRig';

/** The free bone-texture slot that carries the parameters. */
export const PARAM_SLOT = BONE_COUNT;
/** Float offsets in the parameter slot. */
export const PRM = {
  jaw: 0,
  blinkL: 1,
  blinkR: 2,
  gazeYaw: 3,
  gazePitch: 4,
  /** Per hand (left, right): fingers' middle joint, index's middle joint, thumb swing, thumb end joint. */
  hand: [5, 9] as const,
} as const;
export const DEFORM_CHANNEL = { fingersL: 1, indexL: 2, thumbL: 3, fingersR: 4, indexR: 5, thumbR: 6, jaw: 7 } as const;

const views = new WeakMap<THREE.Skeleton, { arr: Float32Array; view: Float32Array }>();

/**
 * The 16 parameter floats of a skeleton (a view into its bone matrices), or null if its bone texture
 * has no room. Creates the bone texture if three has not yet (it would only copy the matrices over).
 */
export function paramsOf(skeleton: THREE.Skeleton): Float32Array | null {
  if (!skeleton.boneTexture) skeleton.computeBoneTexture();
  const arr = skeleton.boneMatrices;
  const o = PARAM_SLOT * 16;
  if (!arr || arr.length < o + 16 || skeleton.bones.length > PARAM_SLOT) return null;
  let v = views.get(skeleton);
  if (!v || v.arr !== arr) {
    v = { arr, view: arr.subarray(o, o + 16) };
    views.set(skeleton, v);
  }
  return v.view;
}

// ---------------------------------------------------------------- GLSL

/** Declarations for the vertex shader (needs three's skinning pars: getBoneMatrix). */
export const DEFORM_VERTEX_PARS = /* glsl */ `
attribute vec4 aDef0;
attribute vec4 aDef1;
vec3 rdRot( vec3 v, vec3 k, float a ) {
  float c = cos( a );
  float s = sin( a );
  return v * c + cross( k, v ) * s + k * dot( k, v ) * ( 1.0 - c );
}
// Bends a bind-pose position, normal and tangent by the avatar's face and hand parameters.
void rdDeform( inout vec3 p, inout vec3 n, inout vec3 t ) {
  // The code is stored negative (-(channel + weight)): a geometry without the attribute reads (0, 0, 0, 1)
  // and must not move.
  if ( aDef0.w > -0.5 ) return;
  mat4 prm = getBoneMatrix( ${PARAM_SLOT}.0 );
  float code = - aDef0.w;
  float ch = floor( code + 1e-4 );
  float w1 = clamp( ( code - ch ) / 0.99, 0.0, 1.0 );
  vec3 P1 = aDef0.xyz;
  vec3 P2 = aDef1.xyz;
  float w2 = aDef1.w;
  if ( ch > 6.5 ) {
    float a = prm[0].x * w1;
    vec3 k = vec3( 1.0, 0.0, 0.0 );
    p = P1 + rdRot( p - P1, k, a );
    n = rdRot( n, k, a );
    t = rdRot( t, k, a );
    return;
  }
  float side = ch < 3.5 ? 1.0 : -1.0;
  float c = ch < 3.5 ? ch : ch - 3.0;
  vec4 h = ch < 3.5 ? vec4( prm[1].yzw, prm[2].x ) : vec4( prm[2].yzw, prm[3].x );
  vec3 palm = vec3( -side, 0.0, 0.0 );
  if ( c < 2.5 ) {
    // A finger: end joint first, then the middle joint (pivots in the bind pose, distal to proximal).
    float pip = c < 1.5 ? h.x : h.y;
    vec3 k = normalize( cross( P2 - P1, palm ) );
    float a2 = pip * 0.75 * w2;
    p = P2 + rdRot( p - P2, k, a2 );
    n = rdRot( n, k, a2 );
    t = rdRot( t, k, a2 );
    float a1 = pip * w1;
    p = P1 + rdRot( p - P1, k, a1 );
    n = rdRot( n, k, a1 );
    t = rdRot( t, k, a1 );
  } else {
    // The thumb: its end joint, then the whole thumb swung about its base toward the palm.
    vec3 k = normalize( cross( normalize( P2 - P1 ), normalize( palm + vec3( 0.0, 0.0, -0.8 ) ) ) );
    float a2 = h.w * w2;
    p = P2 + rdRot( p - P2, k, a2 );
    n = rdRot( n, k, a2 );
    t = rdRot( t, k, a2 );
    vec3 ks = vec3( 0.0, -side, 0.0 );
    float a1 = h.z * w1;
    p = P1 + rdRot( p - P1, ks, a1 );
    n = rdRot( n, ks, a1 );
    t = rdRot( t, ks, a1 );
  }
}
`;

/** Patch a skinned standard material's vertex shader with the deformation (call from onBeforeCompile). */
export function patchDeform(vertexShader: string): string {
  return vertexShader
    .replace('#include <skinning_pars_vertex>', '#include <skinning_pars_vertex>\n#ifdef USE_SKINNING\n' + DEFORM_VERTEX_PARS + '\n#endif')
    .replace(
      '#include <morphnormal_vertex>',
      `#include <morphnormal_vertex>
      vec3 rdPos = vec3( position );
      #ifdef USE_SKINNING
      {
        #ifdef USE_TANGENT
          vec3 rdTan = objectTangent;
          rdDeform( rdPos, objectNormal, rdTan );
          objectTangent = rdTan;
        #else
          vec3 rdTan = vec3( 0.0 );
          rdDeform( rdPos, objectNormal, rdTan );
        #endif
      }
      #endif`,
    )
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = rdPos;');
}

// ---------------------------------------------------------------- attributes

/** A point that rides one bone, carried from the reference rig to `rig` as morph.ts carries that bone's vertices. */
export function morphPoint(p: ArrayLike<number>, bone: number, ref: Rig, rig: Rig, scales?: BoneScale[]): [number, number, number] {
  const s = (scales ?? boneScales(ref, rig))[bone];
  const rj = ref.joints;
  const tj = rig.joints;
  const dz = p[2] - rj[bone * 3 + 2];
  return [tj[bone * 3] + s.sx * (p[0] - rj[bone * 3]), tj[bone * 3 + 1] + s.sy * (p[1] - rj[bone * 3 + 1]), tj[bone * 3 + 2] + (dz > 0 ? s.szFront : s.szBack) * dz];
}

/** One vertex's deformation: channel, pivots (reference bind pose) and the bone each pivot rides, weights. */
export interface DeformVertex {
  ch: number;
  p1: ArrayLike<number>;
  bone1: number;
  w1: number;
  p2?: ArrayLike<number>;
  bone2?: number;
  w2?: number;
}

/**
 * The two attributes for `count` vertices (template order) of one appearance: pivots carried to its rig.
 * `table` lists the vertices that move (all others get zeros, i.e. no deformation).
 */
export function deformAttributes(table: ReadonlyMap<number, DeformVertex>, count: number, ref: Rig, rig: Rig): { a0: Float32Array; a1: Float32Array } {
  const a0 = new Float32Array(count * 4);
  const a1 = new Float32Array(count * 4);
  const scales = boneScales(ref, rig);
  // Pivots are shared by many vertices: carry each once.
  const carried = new Map<ArrayLike<number>, [number, number, number]>();
  const carry = (p: ArrayLike<number>, bone: number) => {
    let c = carried.get(p);
    if (!c) carried.set(p, (c = morphPoint(p, bone, ref, rig, scales)));
    return c;
  };
  for (const [v, d] of table) {
    if (v >= count) continue;
    const p1 = carry(d.p1, d.bone1);
    a0[v * 4] = p1[0];
    a0[v * 4 + 1] = p1[1];
    a0[v * 4 + 2] = p1[2];
    // Stored negative: a missing attribute reads w = 1 and must mean "no deformation".
    a0[v * 4 + 3] = -(d.ch + Math.min(0.99, Math.max(0, d.w1) * 0.99));
    if (d.p2 && d.bone2 !== undefined) {
      const p2 = carry(d.p2, d.bone2);
      a1[v * 4] = p2[0];
      a1[v * 4 + 1] = p2[1];
      a1[v * 4 + 2] = p2[2];
      a1[v * 4 + 3] = d.w2 ?? 0;
    }
  }
  return { a0, a1 };
}

/** The bones the hand pivots ride (finger joints on their finger bone, the thumb on the hand). */
export const HAND_BONES = {
  L: { fingers: B.fingersL, index: B.indexL, hand: B.handL },
  R: { fingers: B.fingersR, index: B.indexR, hand: B.handR },
} as const;

// ---------------------------------------------------------------- the table of moving vertices

/**
 * Which vertices of a template LOD move, and how: the fingers and thumbs (from the reshaped hands' parts,
 * pivots at their placed joints) and the jaw. Indices are template vertex order.
 */
export function deformTable(hands: readonly (HandMeasure | null)[], parts: HandParts, jaw: JawRig | null): Map<number, DeformVertex> {
  const out = new Map<number, DeformVertex>();
  const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (const m of hands) {
    if (!m) continue;
    const L = m.side > 0;
    const bones = L ? HAND_BONES.L : HAND_BONES.R;
    const plans = handPlans(m);
    for (let v = 0; v < parts.part.length; v++) {
      const p = parts.part[v];
      if (p < 0 || parts.side[v] !== m.side || parts.w[v] <= 0.02) continue;
      const j = p < 4 ? plans.fingers[p].joints : plans.thumb.joints;
      const u = parts.u[v];
      const w = parts.w[v];
      if (p < 4) {
        const bone = p === 0 ? bones.index : bones.fingers;
        out.set(v, {
          ch: L ? (p === 0 ? DEFORM_CHANNEL.indexL : DEFORM_CHANNEL.fingersL) : p === 0 ? DEFORM_CHANNEL.indexR : DEFORM_CHANNEL.fingersR,
          p1: j[1],
          bone1: bone,
          w1: w * smooth(-0.055, 0.04, u - PIP_AT),
          p2: j[2],
          bone2: bone,
          w2: w * smooth(-0.05, 0.035, u - DIP_AT),
        });
      } else {
        out.set(v, {
          ch: L ? DEFORM_CHANNEL.thumbL : DEFORM_CHANNEL.thumbR,
          p1: j[0],
          bone1: bones.hand,
          w1: w,
          p2: j[2],
          bone2: bones.hand,
          w2: w * smooth(-0.06, 0.05, u - THUMB_IP_AT),
        });
      }
    }
  }
  if (jaw) for (const [v, w] of jaw.weights) if (!out.has(v)) out.set(v, { ch: DEFORM_CHANNEL.jaw, p1: jaw.hinge, bone1: B.head, w1: w });
  return out;
}

/**
 * The shader's deformation on the CPU (the reference for tests; keep in step with DEFORM_VERTEX_PARS).
 * `a0`, `a1`: the vertex's two attributes; `prm`: the 16 parameter floats. Returns the moved point.
 */
export function deformPoint(p: ArrayLike<number>, a0: ArrayLike<number>, a1: ArrayLike<number>, prm: ArrayLike<number>): [number, number, number] {
  let q: [number, number, number] = [p[0], p[1], p[2]];
  if (a0[3] > -0.5) return q;
  const code = -a0[3];
  const ch = Math.floor(code + 1e-4);
  const w1 = Math.min(1, Math.max(0, (code - ch) / 0.99));
  const P1 = [a0[0], a0[1], a0[2]];
  const P2 = [a1[0], a1[1], a1[2]];
  const w2 = a1[3];
  const rot = (c: number[], k: number[], a: number) => {
    const v = [q[0] - c[0], q[1] - c[1], q[2] - c[2]];
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    const kv = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
    const d = (k[0] * v[0] + k[1] * v[1] + k[2] * v[2]) * (1 - cs);
    q = [c[0] + v[0] * cs + kv[0] * sn + k[0] * d, c[1] + v[1] * cs + kv[1] * sn + k[1] * d, c[2] + v[2] * cs + kv[2] * sn + k[2] * d];
  };
  const unit = (v: number[]) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  if (ch > 6.5) {
    rot(P1, [1, 0, 0], prm[PRM.jaw] * w1);
    return q;
  }
  const side = ch < 3.5 ? 1 : -1;
  const c = ch < 3.5 ? ch : ch - 3;
  const h = PRM.hand[side > 0 ? 0 : 1];
  const palm = [-side, 0, 0];
  if (c < 2.5) {
    const pip = prm[h + (c < 1.5 ? 0 : 1)];
    const k = unit(cross([P2[0] - P1[0], P2[1] - P1[1], P2[2] - P1[2]], palm));
    rot(P2, k, pip * 0.75 * w2);
    rot(P1, k, pip * w1);
  } else {
    const k = unit(cross(unit([P2[0] - P1[0], P2[1] - P1[1], P2[2] - P1[2]]), unit([palm[0], palm[1], palm[2] - 0.8])));
    rot(P2, k, prm[h + 3] * w2);
    rot(P1, [0, -side, 0], prm[h + 2] * w1);
  }
  return q;
}
