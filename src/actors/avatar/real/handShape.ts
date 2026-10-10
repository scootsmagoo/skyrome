/**
 * The hands of the realistic bodies: measured on the baked mesh and re-posed at load (pure maths).
 *
 * The sculpt's hands come out of the pipeline splayed like a fan, straight, with the thumb standing
 * 45 degrees off the palm, and with the middle and ring fingers weighted to the `index` bone. The rig
 * has only two finger bones per hand (`fingers` for the middle, ring and little finger, `index`), so
 * the hand is re-made here, once per template LOD, in the reference bind pose:
 *
 *   measureHand   finds the four fingers (components of the mesh below the knuckles, welded across UV
 *                 seams: an axis per finger by PCA, its knuckle on the rig's knuckle line, its length)
 *                 and the thumb (tip = the farthest forward point, base at the wrist's thumb side);
 *   reshapeHand   unsplays the fingers into a gentle fan, bakes a relaxed cascade (each finger a little
 *                 more curled than the last, at the knuckle, the middle and the end joint), lays the thumb
 *                 along the index finger and re-weights the fingers to their own bones;
 *   handPlans     where the joints end up (the pivots of the grip in the shader, real/deform.ts); the
 *                 reshape also records which digit each vertex belongs to (HandParts).
 *
 * Coordinates: character space of the reference rig (+x = the figure's left, +y up, +z forward). The
 * palms face the thighs (left palm -x) and the thumbs point forward (+z) in the bind pose.
 */
import { B, type Rig } from '../rig';
import type { BodyArrays } from './morph';

export type V3 = [number, number, number];

export const FINGER_NAMES = ['index', 'middle', 'ring', 'pinky'] as const;

export interface FingerAxis {
  /** Point on the finger's axis at the knuckle line. */
  knuckle: V3;
  /** Unit direction toward the tip. */
  dir: V3;
  /** Knuckle to tip (m). */
  length: number;
  /** Farthest the finger's surface lies from its axis (m). */
  radius: number;
}

export interface ThumbAxis {
  /** Pivot at the base of the thumb (carpometacarpal joint, by the wrist). */
  base: V3;
  tip: V3;
  dir: V3;
  length: number;
}

export interface HandMeasure {
  side: 1 | -1;
  /** index, middle, ring, pinky. */
  fingers: FingerAxis[];
  thumb: ThumbAxis;
  /** Unit vector the palm faces (the way the fingers curl). */
  palm: V3;
  wrist: V3;
  mcpY: number;
}

// ---------------------------------------------------------------- small vector helpers

const sub = (a: ArrayLike<number>, b: ArrayLike<number>): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: ArrayLike<number>, b: ArrayLike<number>): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: ArrayLike<number>) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: ArrayLike<number>): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Rotate v about the unit axis k by angle a (Rodrigues). */
export function rotate(v: ArrayLike<number>, k: ArrayLike<number>, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const kv = cross(k, v);
  const d = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * d, v[1] * c + kv[1] * s + k[1] * d, v[2] * c + kv[2] * s + k[2] * d];
}

/** Rotate point p about the axis k through pivot c by angle a. */
export function rotateAbout(p: ArrayLike<number>, c: ArrayLike<number>, k: ArrayLike<number>, a: number): V3 {
  const r = rotate(sub(p, c), k, a);
  return [r[0] + c[0], r[1] + c[1], r[2] + c[2]];
}

/** The rotation axis and angle taking unit vector a to unit vector b. */
function between(a: V3, b: V3): { axis: V3; angle: number } {
  const ax = cross(a, b);
  const l = len(ax);
  const angle = Math.atan2(l, dot(a, b));
  return { axis: l > 1e-9 ? [ax[0] / l, ax[1] / l, ax[2] / l] : [1, 0, 0], angle };
}

/** Largest principal axis of a point set (power iteration on the covariance). */
function principal(pts: V3[]): { mean: V3; dir: V3 } {
  const m: V3 = [0, 0, 0];
  for (const p of pts) for (let k = 0; k < 3; k++) m[k] += p[k] / pts.length;
  const c = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of pts) {
    const d = sub(p, m);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c[i * 3 + j] += d[i] * d[j];
  }
  let v: V3 = [0, -1, 0];
  for (let it = 0; it < 40; it++) v = norm([c[0] * v[0] + c[1] * v[1] + c[2] * v[2], c[3] * v[0] + c[4] * v[1] + c[5] * v[2], c[6] * v[0] + c[7] * v[1] + c[8] * v[2]]);
  return { mean: m, dir: v };
}

const J = (rig: Rig, b: number): V3 => [rig.joints[b * 3], rig.joints[b * 3 + 1], rig.joints[b * 3 + 2]];
const boneOf = (side: 1 | -1) => (side > 0 ? { hand: B.handL, fingers: B.fingersL, index: B.indexL, forearm: B.forearmL } : { hand: B.handR, fingers: B.fingersR, index: B.indexR, forearm: B.forearmR });

function handWeight(body: BodyArrays, v: number, bones: ReturnType<typeof boneOf>) {
  let w = 0;
  for (let k = 0; k < 4; k++) {
    const b = body.skinIndex[v * 4 + k];
    if (b === bones.hand || b === bones.fingers || b === bones.index) w += body.skinWeight[v * 4 + k];
  }
  return w;
}

// ---------------------------------------------------------------- measuring

/**
 * Measure one hand of a body in the reference bind pose (`rig` = the reference rig it was baked for).
 * Returns null when the mesh does not show four separate fingers (then the hand is left alone).
 */
export function measureHand(body: BodyArrays, index: ArrayLike<number>, rig: Rig, side: 1 | -1): HandMeasure | null {
  const bones = boneOf(side);
  const pos = body.position;
  const n = pos.length / 3;
  const P = (v: number): V3 => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
  const wrist = J(rig, bones.hand);
  const mcpY = rig.joints[bones.fingers * 3 + 1];
  const inHand = new Uint8Array(n);
  for (let v = 0; v < n; v++) if (pos[v * 3] * side > 0.04 && pos[v * 3 + 1] < wrist[1] + 0.02 && handWeight(body, v, bones) >= 0.5) inHand[v] = 1;
  // Weld vertices split along UV seams (same position), so a finger is one piece.
  const weld = new Int32Array(n);
  const keyed = new Map<string, number>();
  for (let v = 0; v < n; v++) {
    if (!inHand[v]) continue;
    const k = `${Math.round(pos[v * 3] * 1e5)},${Math.round(pos[v * 3 + 1] * 1e5)},${Math.round(pos[v * 3 + 2] * 1e5)}`;
    const w = keyed.get(k);
    weld[v] = w ?? v;
    if (w === undefined) keyed.set(k, v);
  }
  let comps: number[][] | null = null;
  for (const cut of [0.012, 0.016, 0.02, 0.025, 0.03]) {
    const parent = new Int32Array(n);
    for (let v = 0; v < n; v++) parent[v] = v;
    const find = (a: number) => {
      while (parent[a] !== a) a = parent[a] = parent[parent[a]];
      return a;
    };
    const below = (v: number) => inHand[v] === 1 && pos[v * 3 + 1] < mcpY - cut;
    for (let v = 0; v < n; v++) if (below(v)) parent[find(v)] = find(weld[v]);
    for (let t = 0; t + 2 < index.length; t += 3) {
      const a = index[t], b = index[t + 1], c = index[t + 2];
      if (below(a) && below(b)) parent[find(a)] = find(b);
      if (below(b) && below(c)) parent[find(b)] = find(c);
      if (below(c) && below(a)) parent[find(c)] = find(a);
    }
    const groups = new Map<number, number[]>();
    for (let v = 0; v < n; v++) if (below(v)) {
      const r = find(v);
      let g = groups.get(r);
      if (!g) groups.set(r, (g = []));
      g.push(v);
    }
    const big = [...groups.values()].filter((g) => new Set(g.map((v) => weld[v])).size >= 4);
    if (big.length === 4) {
      comps = big;
      break;
    }
  }
  if (!comps) return null;
  const s = rig.s;
  const fingers: FingerAxis[] = comps.map((g) => {
    const pts = g.map(P);
    const { dir } = principal(pts);
    const d: V3 = dir[1] > 0 ? [-dir[0], -dir[1], -dir[2]] : dir;
    // The knuckle: the centre of the finger where it leaves the palm (its top band), a little up the axis.
    let top = -Infinity;
    for (const p of pts) top = Math.max(top, p[1]);
    const base: V3 = [0, 0, 0];
    let nb = 0;
    for (const p of pts)
      if (p[1] > top - 0.008 * s) {
        for (let k = 0; k < 3; k++) base[k] += p[k];
        nb++;
      }
    const up = 0.012 * s;
    const knuckle: V3 = [base[0] / nb - d[0] * up, base[1] / nb - d[1] * up, base[2] / nb - d[2] * up];
    let length = 0;
    let radius = 0;
    for (const p of pts) {
      const q = sub(p, knuckle);
      const t = dot(q, d);
      length = Math.max(length, t);
      radius = Math.max(radius, len([q[0] - d[0] * t, q[1] - d[1] * t, q[2] - d[2] * t]));
    }
    return { knuckle, dir: d, length, radius };
  });
  // Front (thumb side, +z) first: index, middle, ring, pinky.
  fingers.sort((a, b) => b.knuckle[2] - a.knuckle[2]);
  // Thumb: the hand's farthest-forward point above the knuckle line, pivoting at the thumb side of the wrist.
  const base: V3 = [wrist[0] - side * 0.008 * s, wrist[1] - 0.022 * s, wrist[2] + 0.026 * s];
  let tip: V3 | null = null;
  for (let v = 0; v < n; v++) {
    if (!inHand[v] || pos[v * 3 + 1] < mcpY - 0.035 * s) continue;
    const p = P(v);
    if (!tip || p[2] > tip[2]) tip = p;
  }
  if (!tip || tip[2] < fingers[0].knuckle[2] + 0.01) return null;
  const td = sub(tip, base);
  const thumb: ThumbAxis = { base, tip, dir: norm(td), length: len(td) };
  return { side, fingers, thumb, palm: [-side, 0, 0], wrist, mcpY };
}

// ---------------------------------------------------------------- the relaxed hand

/** Fan of the relaxed fingers (degrees toward the thumb, from the hand's own line). */
const FAN = [5, 1, -3, -7];
/** Baked relaxed curl per finger: extra knuckle, middle joint, end joint (degrees). The animation adds its knuckle curl. */
const RELAX = [
  [0, 20, 10],
  [3, 25, 13],
  [6, 29, 15],
  [10, 33, 17],
];
/** Middle and end joints as fractions of the knuckle-to-tip length. */
export const PIP_AT = 0.45;
export const DIP_AT = 0.73;
/** Spacing of the knuckles across the hand, as a fraction of the index-to-little-finger distance (even). */
const KNUCKLE_SPREAD = [0, 1 / 3, 2 / 3, 1];
/** Thumb: angle to the index finger once laid along it, its turn in front of the palm (degrees), joints, rest flex. */
const THUMB_TO_INDEX = 22;
const THUMB_OPPOSE = 18;
export const THUMB_MCP_AT = 0.5;
export const THUMB_IP_AT = 0.76;
const THUMB_REST_FLEX = [8, 16];

interface Op {
  c: V3;
  axis: V3;
  angle: number;
  /** Weight as a function of the vertex's position along the finger (t / L) or thumb. */
  at: (u: number) => number;
}

/** The complete re-pose of one finger (or the thumb): weighted rotations about pivots in the ORIGINAL frame, then a shift. */
interface Plan {
  ops: Op[];
  shift: V3;
  /** Flex axis of the joints after the re-pose. */
  flex: V3;
  /** Placed joints: knuckle (or the thumb's base), middle and end joint (or the thumb's MCP and IP), tip. */
  joints: V3[];
  length: number;
}

const D = Math.PI / 180;

/**
 * The finger vertex p belongs to (the nearest axis), its position along it (t, m) and how fully (w: blends
 * into the palm above the knuckle and beside the finger). Each vertex follows one finger only, so the
 * fingers part cleanly at the webs.
 */
function nearestFinger(m: HandMeasure, p: V3, s: number): { i: number; t: number; w: number } {
  let best = -1;
  let bt = 0;
  let br = Infinity;
  for (let i = 0; i < 4; i++) {
    const f = m.fingers[i];
    const d = sub(p, f.knuckle);
    const t = dot(d, f.dir);
    if (t < -0.025 * s) continue;
    const r = len([d[0] - f.dir[0] * t, d[1] - f.dir[1] * t, d[2] - f.dir[2] * t]) - f.radius;
    if (r < br) {
      br = r;
      best = i;
      bt = t;
    }
  }
  if (best < 0) return { i: -1, t: 0, w: 0 };
  return { i: best, t: bt, w: smooth(-0.022 * s, 0.004 * s, bt) * smooth(0.007 * s, 0.001 * s, br) };
}

function thumbWeight(m: HandMeasure, p: V3, s: number) {
  const th = m.thumb;
  const d = sub(p, th.base);
  const t = dot(d, th.dir);
  const r = len([d[0] - th.dir[0] * t, d[1] - th.dir[1] * t, d[2] - th.dir[2] * t]);
  return { t, w: smooth(0.22, 0.5, t / th.length) * smooth(0.024 * s, 0.013 * s, r) };
}

/** Flex axis of a finger along `dir`: curling it turns the tip toward the palm. */
function flexAxis(dir: V3, palm: V3): V3 {
  return norm(cross(dir, palm));
}

/** The thumb's flexion axis for a thumb along `dir`: it bends across the palm toward the little finger. */
export function thumbFlexAxis(dir: V3, palm: V3): V3 {
  return norm(cross(dir, norm([palm[0], palm[1], palm[2] - 0.8])));
}

/** Apply a plan to a point that belongs to the finger at position u (t / L) with membership weight 1. */
function applyPlan(plan: Plan, p: V3, u: number): V3 {
  let q = p;
  for (const o of plan.ops) {
    const w = o.at(u);
    if (w > 0) q = rotateAbout(q, o.c, o.axis, o.angle * w);
  }
  return [q[0] + plan.shift[0], q[1] + plan.shift[1], q[2] + plan.shift[2]];
}

/** The hand's own line (wrist to the middle of the knuckles), as an angle toward the thumb from straight down. */
function handLine(m: HandMeasure) {
  const kz = m.fingers.reduce((a, f) => a + f.knuckle[2], 0) / 4;
  const ky = m.fingers.reduce((a, f) => a + f.knuckle[1], 0) / 4;
  return Math.atan2(kz - m.wrist[2], m.wrist[1] - ky);
}

/** Plans for the four fingers and the thumb of a measured hand. */
export function handPlans(m: HandMeasure): { fingers: Plan[]; thumb: Plan } {
  const phi0 = handLine(m);
  // A common tilt toward the palm (the measured ones are noisy), the fan about the hand's line.
  const tiltX = m.fingers.reduce((a, f) => a + f.dir[0], 0) / 4;
  const i0 = m.fingers[0].knuckle;
  const i3 = m.fingers[3].knuckle;
  const fingers = m.fingers.map((f, i): Plan => {
    const L = f.length;
    const k0 = flexAxis(f.dir, m.palm);
    const pt = (u: number): V3 => [f.knuckle[0] + f.dir[0] * u * L, f.knuckle[1] + f.dir[1] * u * L, f.knuckle[2] + f.dir[2] * u * L];
    const phi = phi0 + FAN[i] * D;
    const h = Math.sqrt(Math.max(0, 1 - tiltX * tiltX));
    const want = norm([tiltX, -Math.cos(phi) * h, Math.sin(phi) * h]);
    const fan = between(f.dir, want);
    const ops: Op[] = [
      // Distal to proximal, pivots in the original frame: end joint, middle joint, knuckle, then the fan.
      { c: pt(DIP_AT), axis: k0, angle: RELAX[i][2] * D, at: (u) => smooth(-0.07, 0.05, u - DIP_AT) },
      { c: pt(PIP_AT), axis: k0, angle: RELAX[i][1] * D, at: (u) => smooth(-0.08, 0.06, u - PIP_AT) },
      { c: f.knuckle, axis: k0, angle: RELAX[i][0] * D, at: (u) => smooth(-0.1, 0.08, u) },
      { c: f.knuckle, axis: fan.axis, angle: fan.angle, at: () => 1 },
    ];
    // Knuckles evenly across the hand between the index and the little finger.
    const tz = i0[2] + (i3[2] - i0[2]) * KNUCKLE_SPREAD[i];
    const ty = i0[1] + (i3[1] - i0[1]) * KNUCKLE_SPREAD[i];
    const shift: V3 = [0, ty - f.knuckle[1], tz - f.knuckle[2]];
    const plan: Plan = { ops, shift, flex: rotate(k0, fan.axis, fan.angle), joints: [], length: L };
    plan.joints = [applyPlan(plan, f.knuckle, 0), applyPlan(plan, pt(PIP_AT), PIP_AT), applyPlan(plan, pt(DIP_AT), DIP_AT), applyPlan(plan, pt(1), 1)];
    return plan;
  });
  // The thumb: own joints (original frame), then swung toward the (placed) index finger and turned in front of the palm.
  const th = m.thumb;
  const L = th.length;
  const ix = norm(sub(fingers[0].joints[3], fingers[0].joints[0]));
  const b = between(ix, th.dir);
  const want = rotate(ix, b.axis, THUMB_TO_INDEX * D);
  const swing = between(th.dir, want);
  const toPalm = dot(cross(ix, want), m.palm) > 0 ? 1 : -1;
  const k0 = thumbFlexAxis(th.dir, m.palm);
  const pt = (u: number): V3 => [th.base[0] + th.dir[0] * u * L, th.base[1] + th.dir[1] * u * L, th.base[2] + th.dir[2] * u * L];
  const ops: Op[] = [
    { c: pt(THUMB_IP_AT), axis: k0, angle: THUMB_REST_FLEX[1] * D, at: (u) => smooth(-0.06, 0.05, u - THUMB_IP_AT) },
    { c: pt(THUMB_MCP_AT), axis: k0, angle: THUMB_REST_FLEX[0] * D, at: (u) => smooth(-0.08, 0.06, u - THUMB_MCP_AT) },
    { c: th.base, axis: swing.axis, angle: swing.angle, at: () => 1 },
    { c: th.base, axis: ix, angle: toPalm * THUMB_OPPOSE * D, at: () => 1 },
  ];
  const thumb: Plan = { ops, shift: [0, 0, 0], flex: rotate(rotate(k0, swing.axis, swing.angle), ix, toPalm * THUMB_OPPOSE * D), joints: [], length: L };
  thumb.joints = [th.base, applyPlan(thumb, pt(THUMB_MCP_AT), THUMB_MCP_AT), applyPlan(thumb, pt(THUMB_IP_AT), THUMB_IP_AT), applyPlan(thumb, pt(1), 1)];
  return { fingers, thumb };
}

/**
 * Which part of the hand each vertex of a LOD belongs to, from its ORIGINAL (measured) position:
 * `part` -1 none, 0..3 the fingers (index ... little), 4 the thumb; `u` its position along that digit
 * (0 knuckle or thumb base, 1 tip); `w` how fully it belongs (blends into the palm).
 */
export interface HandParts {
  part: Int8Array;
  /** The hand (1 left, -1 right). */
  side: Int8Array;
  u: Float32Array;
  w: Float32Array;
}

/** Empty parts for `n` vertices. */
export function handParts(n: number): HandParts {
  return { part: new Int8Array(n).fill(-1), side: new Int8Array(n), u: new Float32Array(n), w: new Float32Array(n) };
}

/**
 * Re-pose one hand of a template LOD in place (positions, normals, tangents, skin weights): the
 * relaxed hand. `m` is the measurement of this hand (from LOD 0: the LODs share the bind pose).
 * Writes which digit each vertex belongs to into `parts` (for the grip in the shader).
 */
export function reshapeHand(body: BodyArrays, m: HandMeasure, rig: Rig, parts?: HandParts): void {
  const bones = boneOf(m.side);
  const pos = body.position;
  const nor = body.normal;
  const tan = body.tangent;
  const n = pos.length / 3;
  const s = rig.s;
  const plans = handPlans(m);
  for (let v = 0; v < n; v++) {
    if (pos[v * 3] * m.side < 0.04 || pos[v * 3 + 1] > m.wrist[1] + 0.02 || handWeight(body, v, bones) < 0.3) continue;
    const p0: V3 = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const dp: V3 = [0, 0, 0];
    let wsum = 0;
    let best = -1;
    let bestW = 0;
    let bestU = 0;
    let bestT = 0;
    const nf = nearestFinger(m, p0, s);
    if (nf.w > 0) {
      const f = m.fingers[nf.i];
      const q = applyPlan(plans.fingers[nf.i], p0, nf.t / f.length);
      for (let k = 0; k < 3; k++) dp[k] += nf.w * (q[k] - p0[k]);
      wsum = nf.w;
      bestW = nf.w;
      best = nf.i;
      bestU = nf.t / f.length;
      bestT = nf.t;
    }
    // The thumb (never a finger's vertex).
    const tw = thumbWeight(m, p0, s);
    const thumbW = tw.w * (1 - Math.min(1, wsum));
    if (thumbW > 0) {
      const q = applyPlan(plans.thumb, p0, tw.t / m.thumb.length);
      for (let k = 0; k < 3; k++) dp[k] += thumbW * (q[k] - p0[k]);
      if (thumbW > bestW) {
        bestW = thumbW;
        best = 4;
        bestU = tw.t / m.thumb.length;
      }
    }
    if (best < 0) continue;
    pos[v * 3] = p0[0] + dp[0];
    pos[v * 3 + 1] = p0[1] + dp[1];
    pos[v * 3 + 2] = p0[2] + dp[2];
    // Normals and tangents turn with the digit the vertex belongs to most, by that much.
    const plan = best < 4 ? plans.fingers[best] : plans.thumb;
    const turn = (x: V3): V3 => {
      let r = x;
      for (const o of plan.ops) {
        const w = o.at(bestU) * bestW;
        if (w > 0) r = rotate(r, o.axis, o.angle * w);
      }
      return norm(r);
    };
    const nn = turn([nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]]);
    nor.set(nn, v * 3);
    if (tan) {
      const tt = turn([tan[v * 4], tan[v * 4 + 1], tan[v * 4 + 2]]);
      tan[v * 4] = tt[0];
      tan[v * 4 + 1] = tt[1];
      tan[v * 4 + 2] = tt[2];
    }
    if (parts) {
      parts.part[v] = best;
      parts.side[v] = m.side;
      parts.u[v] = bestU;
      parts.w[v] = bestW;
    }
    // Re-weight: a finger's vertices go to its own bone (index finger: index; the others: fingers), blending
    // into the hand over the knuckle; the thumb and the palm are the hand's (the thumb has no bone).
    if (best < 4 && bestW > 0.5) setHandWeights(body, v, bones, best === 0 ? bones.index : bones.fingers, smooth(-0.012 * s, 0.008 * s, bestT));
    else if (best === 4 && bestW > 0.3) setHandWeights(body, v, bones, bones.index, 0);
  }
}

/** Replace the hand/finger part of a vertex's weights with hand (1 - wf) and `own` (wf); other bones stay. */
function setHandWeights(body: BodyArrays, v: number, bones: ReturnType<typeof boneOf>, own: number, wf: number) {
  const si = body.skinIndex as unknown as { [i: number]: number };
  const sw = body.skinWeight as unknown as { [i: number]: number };
  let handPart = 0;
  const other: [number, number][] = [];
  for (let k = 0; k < 4; k++) {
    const b = si[v * 4 + k];
    const w = sw[v * 4 + k];
    if (w <= 0) continue;
    if (b === bones.hand || b === bones.fingers || b === bones.index) handPart += w;
    else other.push([b, w]);
  }
  if (handPart <= 0) return;
  const list: [number, number][] = [...other];
  if (1 - wf > 1e-4) list.push([bones.hand, handPart * (1 - wf)]);
  if (wf > 1e-4) list.push([own, handPart * wf]);
  list.sort((a, b) => b[1] - a[1]);
  list.length = Math.min(4, list.length);
  let sum = 0;
  for (const [, w] of list) sum += w;
  for (let k = 0; k < 4; k++) {
    si[v * 4 + k] = k < list.length ? list[k][0] : 0;
    sw[v * 4 + k] = k < list.length ? list[k][1] / sum : 0;
  }
}
