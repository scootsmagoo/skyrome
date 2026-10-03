/**
 * Body surface: torso + neck loft, arms, hands, legs and feet, built in the bind pose.
 *
 * Only the OUTERMOST visible layer is generated: the torso loft is colored and inflated by the
 * garment rules in garments.ts (paintTorso / paintArm / paintLeg), so a tunic costs no extra
 * triangles. Joints blend weights between parent and child bones over a few centimeters so elbows,
 * knees, shoulders and hips bend smoothly instead of cracking.
 */
import * as THREE from 'three';
import { B, type Rig } from '../rig';
import { SURF, mixW, type V, type Weights } from '../SkinBuilder';
import { MonotoneCurve } from '../anim/spline';
import { clamp01, gauss, lerp, smooth, superellipse, type Ctx } from './common';
import { paintArm, paintFoot, paintLeg, paintTorso, torsoEdges } from './garments';

/** Characteristic heights (bind pose, meters) used by all builders. */
export interface Levels {
  s: number;
  crotch: number;
  hip: number;
  iliac: number;
  waist: number;
  ribs: number;
  chest: number;
  armpit: number;
  shoulder: number;
  shTop: number;
  trap: number;
  neckBase: number;
  neckMid: number;
  neckTop: number;
  chin: number;
  top: number;
  knee: number;
  ankle: number;
  elbow: number;
  wrist: number;
  /** Arm joint x (positive). */
  armX: number;
  armZ: number;
  hipX: number;
  belt: number;
  hemShort: number;
  hemKnee: number;
  hemLong: number;
}

export function levels(rig: Rig): Levels {
  const J = rig.joints;
  const y = (b: number) => J[b * 3 + 1];
  const s = rig.s;
  const hip = y(B.thighL);
  const shoulder = y(B.upperArmL);
  const neck = y(B.neck);
  const head = y(B.head);
  const chest = y(B.chest);
  const knee = y(B.shinL);
  const ankle = y(B.footL);
  const waist = hip + (shoulder - hip) * 0.31;
  return {
    s,
    crotch: hip - 0.075 * s,
    hip,
    iliac: hip + (waist - hip) * 0.55,
    waist,
    ribs: chest - 0.035 * s,
    chest: chest + 0.07 * s,
    armpit: shoulder - 0.085 * s,
    shoulder,
    shTop: shoulder + 0.02 * s,
    trap: Math.max(shoulder + 0.05 * s, rig.height - rig.headH - 0.05 * s),
    neckBase: Math.max(shoulder + 0.075 * s, rig.height - rig.headH - 0.022 * s),
    neckMid: (Math.max(shoulder + 0.075 * s, rig.height - rig.headH - 0.022 * s) + rig.height - rig.headH * 0.64) / 2,
    neckTop: rig.height - rig.headH * 0.64,
    chin: rig.height - rig.headH,
    top: rig.height,
    knee,
    ankle,
    elbow: y(B.forearmL),
    wrist: y(B.handL),
    armX: J[B.upperArmL * 3],
    armZ: J[B.upperArmL * 3 + 2],
    hipX: J[B.thighL * 3],
    belt: waist + 0.005 * s,
    hemShort: hip - 0.2 * s,
    hemKnee: knee + 0.05 * s,
    hemLong: ankle + 0.035 * s,
  };
}

// ------------------------------------------------------------------ torso

interface Section {
  a: number;
  bf: number;
  bb: number;
  zc: number;
  n: number;
}

type Curve = { eval(x: number): number };

/** Torso profile as curves over height. */
export class TorsoProfile {
  private ca: Curve;
  private cbf: Curve;
  private cbb: Curve;
  private czc: Curve;
  private cn: Curve;
  readonly ys: number[];
  constructor(readonly ctx: Ctx, readonly L: Levels) {
    const { s } = L;
    const g = ctx.rig.g;
    const fem = ctx.rig.sex === 'female';
    // [y, a, bf, bb, zc, n] reference-male meters (scaled by s and girth below).
    const rows: [number, number, number, number, number, number][] = [
      [L.crotch, 0.09 * g.hips, 0.052, 0.06 * g.hips, -0.012, 2.2],
      [L.hip - 0.035 * s, 0.152 * g.hips, 0.075, 0.098 * g.hips, -0.014, 2.5],
      [L.hip + 0.012 * s, 0.168 * g.hips, 0.086 * lerp(1, g.belly, 0.3), 0.11 * g.hips, -0.014, 2.6],
      [L.iliac, 0.156 * lerp(g.hips, g.waist, 0.5), 0.09 * lerp(1, g.belly, 0.7), 0.094 * g.hips, -0.01, 2.6],
      [L.waist, 0.138 * g.waist, 0.092 * g.belly, 0.085 * g.waist, -0.004, 2.5],
      [L.ribs, 0.148 * g.torso, 0.098 * lerp(g.belly, g.torso, 0.6), 0.09 * g.torso, 0, 2.5],
      [L.chest, 0.158 * g.torso, 0.106 * g.torso, 0.095 * g.torso, 0, 2.5],
      [L.armpit, 0.163 * lerp(g.torso, g.shoulders, 0.5), 0.098 * g.torso, 0.097 * g.torso, -0.006, 2.6],
      [L.shoulder - 0.024 * s, 0.168 * g.shoulders, 0.08, 0.086, -0.012, 2.8],
      [L.shTop, 0.15 * g.shoulders, 0.064, 0.076, -0.018, 2.6],
      [L.trap, 0.112 * lerp(g.neck, g.shoulders, 0.5), 0.062 * g.neck, 0.074 * g.neck, -0.022, 2.3],
      [L.neckBase, 0.064 * g.neck, 0.058 * g.neck, 0.06 * g.neck, -0.02, 2.0],
      [L.neckMid, 0.057 * g.neck, 0.052 * g.neck, 0.056 * g.neck, -0.016, 2.0],
      [L.neckTop, 0.052 * g.neck, 0.04 * g.neck, 0.052 * g.neck, -0.012, 2.0],
    ];
    if (fem) {
      // Narrower ribcage and shoulders are in the girths; soften the shoulder squareness.
      for (const r of rows) r[5] = Math.max(2, r[5] - 0.2);
    }
    const ys = rows.map((r) => r[0]);
    this.ys = ys;
    const k = (i: number, f: number) => rows.map((r) => r[i] * f);
    this.ca = new MonotoneCurve(ys, k(1, s));
    this.cbf = new MonotoneCurve(ys, k(2, s));
    this.cbb = new MonotoneCurve(ys, k(3, s));
    this.czc = new MonotoneCurve(ys, k(4, s));
    this.cn = new MonotoneCurve(ys, k(5, 1));
  }
  at(y: number): Section {
    return { a: this.ca.eval(y), bf: this.cbf.eval(y), bb: this.cbb.eval(y), zc: this.czc.eval(y), n: this.cn.eval(y) };
  }
}

/** Surface point of the bare torso (before garments) at height y and angle theta (0 = +X, π/2 = front). */
export function torsoPoint(ctx: Ctx, prof: TorsoProfile, L: Levels, y: number, theta: number): [number, number] {
  const sec = prof.at(y);
  let [x, z] = superellipse(theta, sec.a, sec.bf, sec.bb, sec.n);
  const s = L.s;
  const g = ctx.rig.g;
  // Bust (women) and pectorals (men), shoulder blades, buttocks cleft.
  if (z > 0) {
    const chestK = gauss((y - L.chest) / s, 0.055);
    if (ctx.rig.sex === 'female') {
      const bx = 0.068 * s;
      const bump = (gauss((Math.abs(x) - bx) / s, 0.045) * chestK) * 0.038 * g.bust * s;
      z += bump;
    } else {
      z += gauss((Math.abs(x) - 0.06 * s) / s, 0.06) * gauss((y - L.chest - 0.02 * s) / s, 0.05) * 0.01 * g.torso * s;
    }
    // Belly for heavy builds.
    z += gauss((y - L.waist) / s, 0.08) * gauss(x / s, 0.12) * 0.03 * Math.max(0, g.belly - 1) * s;
  } else {
    z -= gauss((Math.abs(x) - 0.075 * s) / s, 0.04) * gauss((y - L.chest - 0.03 * s) / s, 0.06) * 0.008 * s;
    // Gluteal cleft.
    z += gauss(x / s, 0.012) * gauss((y - L.hip + 0.02 * s) / s, 0.06) * 0.012 * s;
  }
  return [x, z + sec.zc];
}

function torsoWeights(ctx: Ctx, L: Levels, x: number, y: number): Weights {
  const s = L.s;
  const ax = Math.abs(x) / s;
  const side = x >= 0 ? 'L' : 'R';
  const w: Weights = [];
  const tHipsSpine = smooth(L.iliac - 0.02 * s, L.waist + 0.03 * s, y);
  const tSpineChest = smooth(L.ribs - 0.03 * s, L.chest - 0.0 * s, y);
  const tNeck = smooth(L.shTop - 0.005 * s, L.neckBase + 0.01 * s, y);
  const tHead = smooth(L.neckMid, L.neckTop + 0.01 * s, y) * 0.6;
  let hips = 1 - tHipsSpine;
  const spine = tHipsSpine * (1 - tSpineChest);
  let chest = tSpineChest * (1 - tNeck);
  const neck = tNeck * (1 - tHead);
  const head = tNeck * tHead;
  // Pelvis bottom follows the thighs a little so the hip crease bends with the leg.
  const tThigh = smooth(L.hip + 0.03 * s, L.crotch, y) * smooth(0.02, 0.11, ax) * 0.5;
  const thigh = hips * tThigh;
  hips -= thigh;
  // Shoulder region rides the clavicle; the armpit stretches with the upper arm.
  const tSh = smooth(L.armpit - 0.03 * s, L.armpit + 0.04 * s, y) * smooth(0.075, 0.16, ax) * (1 - tNeck);
  const sh = chest * tSh * 0.75;
  const ua = chest * smooth(0.13, 0.17, ax) * gauss((y - L.armpit - 0.02 * s) / s, 0.035) * 0.3;
  chest -= sh + ua;
  w.push(B.hips, hips, B.spine, spine, B.chest, chest, B.neck, neck, B.head, head);
  w.push(B[`thigh${side}`], thigh, B[`shoulder${side}`], sh, B[`upperArm${side}`], ua);
  return w;
}

export function buildTorso(ctx: Ctx, L: Levels, prof: TorsoProfile) {
  const { b } = ctx;
  const seg = ctx.hi ? 18 : 10;
  // Ring heights: profile keys plus fillers for smooth curvature.
  const ys: number[] = [];
  const keys = prof.ys;
  for (let i = 0; i < keys.length - 1; i++) {
    const y0 = keys[i];
    const y1 = keys[i + 1];
    const n = ctx.hi ? (y1 - y0 > 0.09 * L.s ? 2 : 1) : 1;
    for (let k = 0; k < n; k++) ys.push(lerp(y0, y1, k / n));
  }
  ys.push(keys[keys.length - 1]);
  if (ctx.hi) {
    // Extra rings at garment edges (necklines, hems, armor bands) keep color borders crisp.
    const edges = torsoEdges(ctx, L);
    // Plenty of edge rings already add resolution: drop the in-between fillers where they cluster.
    if (edges.length > 8) for (let i = ys.length - 1; i >= 0; i--) if (!keys.includes(ys[i]) && edges.some((e) => Math.abs(e - ys[i]) < 0.03 * L.s)) ys.splice(i, 1);
    for (const e of edges) if (e > keys[0] && e < keys[keys.length - 1]) ys.push(e);
    ys.sort((a, b) => a - b);
    for (let i = ys.length - 1; i > 0; i--) if (ys[i] - ys[i - 1] < 0.006 * L.s) ys.splice(i, 1);
  }
  if (!ctx.hi) {
    // Thin out: keep every other ring except the ends.
    const thin = ys.filter((_, i) => i % 2 === 0 || i === ys.length - 1);
    ys.length = 0;
    ys.push(...thin);
  }
  const rows = ys.length;
  const base = b.grid(
    seg,
    rows,
    true,
    (i, j, v) => {
      const y = ys[j];
      const th = (i / seg) * Math.PI * 2;
      const [bx, bz] = torsoPoint(ctx, prof, L, y, th);
      const paint = paintTorso(ctx, L, bx, y, bz, th);
      const zc = prof.at(y).zc;
      const r = Math.hypot(bx, bz - zc) || 1e-4;
      const k = (r + paint.t) / r;
      v.x = bx * k;
      v.z = zc + (bz - zc) * k;
      v.y = y;
      v.r = paint.color.r;
      v.g = paint.color.g;
      v.b = paint.color.b;
      v.s = paint.surf;
      v.w = torsoWeights(ctx, L, v.x, y);
    },
    'auto',
    (j) => [0, ys[j], prof.at(ys[j]).zc],
  );
  // Close the crotch (bottom) — it sits between the thigh tops.
  const p0 = paintTorso(ctx, L, 0, ys[0], 0, -Math.PI / 2);
  b.capAuto(base, seg, 0, { x: 0, y: ys[0] - 0.012 * L.s, z: prof.at(ys[0]).zc, r: p0.color.r, g: p0.color.g, b: p0.color.b, w: [B.hips, 1], s: p0.surf }, [0, -1, 0]);
  const pt = paintTorso(ctx, L, 0, ys[rows - 1], 0, Math.PI / 2);
  b.capAuto(base, seg, rows - 1, { x: 0, y: ys[rows - 1] + 0.01, z: prof.at(ys[rows - 1]).zc, r: pt.color.r, g: pt.color.g, b: pt.color.b, w: [B.head, 1], s: SURF.skin }, [0, 1, 0]);
}

// ------------------------------------------------------------------ arms

/** [y offset from joint ref, lateral, medial, front, back] (reference male meters). */
type ArmRow = [number, number, number, number, number];

function armRows(L: Levels, rig: Rig): { y: number; r: [number, number, number, number] }[] {
  const s = L.s;
  const g = rig.g.arm;
  const yA = L.shoulder;
  const yE = L.elbow;
  const yW = L.wrist;
  const fem = rig.sex === 'female';
  const m = (v: number) => v * s * g;
  const tw = fem ? 0.9 : 1;
  const rows: ArmRow[] = [
    [yW - 0.014 * s, 0.021, 0.021, 0.026, 0.024],
    [yW + 0.012 * s, 0.023 * tw, 0.023 * tw, 0.028 * tw, 0.025 * tw],
    [yW + 0.06 * s, 0.027, 0.025, 0.031, 0.029],
    [yE - 0.11 * s, 0.032, 0.029, 0.035, 0.033],
    [yE - 0.05 * s, 0.038, 0.034, 0.039, 0.038],
    [yE - 0.012 * s, 0.037, 0.033, 0.035, 0.037],
    [yE + 0.02 * s, 0.036, 0.033, 0.034, 0.039],
    [yE + 0.07 * s, 0.039, 0.035, 0.042, 0.039],
    [yA - 0.14 * s, 0.044, 0.037, 0.047, 0.043],
    [yA - 0.08 * s, 0.05, 0.039, 0.046, 0.046],
    [yA - 0.03 * s, 0.05, 0.04, 0.047, 0.047],
    [yA + 0.006 * s, 0.043, 0.033, 0.043, 0.043],
    [yA + 0.026 * s, 0.027, 0.02, 0.028, 0.028],
    [yA + 0.034 * s, 0.01, 0.007, 0.01, 0.01],
  ];
  return rows.map(([y, a, b, c, d]) => ({ y, r: [m(a), m(b), m(c), m(d)] as [number, number, number, number] }));
}

function armWeights(L: Levels, side: 'L' | 'R', y: number): Weights {
  const s = L.s;
  const sh = B[`shoulder${side}`];
  const ua = B[`upperArm${side}`];
  const fa = B[`forearm${side}`];
  const ha = B[`hand${side}`];
  const tTop = smooth(L.shoulder - 0.035 * s, L.shoulder + 0.05 * s, y) * 0.6;
  const tElbow = smooth(L.elbow + 0.035 * s, L.elbow - 0.035 * s, y);
  const tWrist = smooth(L.wrist + 0.018 * s, L.wrist - 0.01 * s, y);
  let w: Weights = mixW([ua, 1], [sh, 1], tTop);
  if (tElbow > 0) w = mixW(w, [fa, 1], tElbow);
  if (tWrist > 0) w = mixW(w, [ha, 1], tWrist);
  return w;
}

export function buildArm(ctx: Ctx, L: Levels, sideSign: 1 | -1) {
  const { b, rig } = ctx;
  const side = sideSign > 0 ? 'L' : 'R';
  const seg = ctx.hi ? 10 : 6;
  const base = armRows(L, rig);
  // Insert garment boundary rings (sleeve hems, manica bands) for crisp edges.
  const extra = ctx.hi ? paintArm(ctx, L, side, 0, 0, 0, true).edges ?? [] : [];
  const anat = ctx.hi ? base.map((r) => r.y) : base.map((r) => r.y).filter((_, i, a) => i % 2 === 0 || i >= a.length - 3);
  const ys = [...anat, ...extra].sort((a, b) => a - b);
  const uniq = ys.filter((y, i) => i === 0 || y - ys[i - 1] > 0.002 * L.s);
  const radiusAt = (y: number): [number, number, number, number] => {
    if (y <= base[0].y) return base[0].r;
    for (let i = 0; i < base.length - 1; i++) {
      const a = base[i];
      const c = base[i + 1];
      if (y <= c.y) {
        const t = (y - a.y) / (c.y - a.y);
        return [0, 1, 2, 3].map((k) => lerp(a.r[k], c.r[k], t)) as [number, number, number, number];
      }
    }
    return base[base.length - 1].r;
  };
  const cx = sideSign * L.armX;
  const cz = L.armZ;
  const topY = uniq[uniq.length - 1];
  // Dome: the top rings shift toward the body so the deltoid rounds over the shoulder.
  const domeIn = (y: number) => smooth(L.shoulder - 0.01 * L.s, topY, y) * 0.012 * L.s;
  const g = b.grid(
    seg,
    uniq.length,
    true,
    (i, j, v) => {
      const y = uniq[j];
      const th = (i / seg) * Math.PI * 2;
      const [rl, rm, rf, rb] = radiusAt(y);
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const lat = (c >= 0 ? rl : rm) * c;
      const fz = (sn >= 0 ? rf : rb) * sn;
      const paint = paintArm(ctx, L, side, y, th, Math.hypot(lat, fz), false);
      const r = Math.hypot(lat, fz) || 1e-4;
      const k = (r + paint.t) / r;
      v.x = cx + sideSign * (lat * k - domeIn(y));
      v.y = y;
      v.z = cz + fz * k;
      v.r = paint.color.r;
      v.g = paint.color.g;
      v.b = paint.color.b;
      v.s = paint.surf;
      v.w = armWeights(L, side, y);
    },
    'auto',
    (j) => [cx - sideSign * domeIn(uniq[j]), uniq[j], cz],
  );
  const pTop = paintArm(ctx, L, side, topY, 0, 0, false);
  b.capAuto(g, seg, uniq.length - 1, { x: cx - sideSign * 0.012 * L.s, y: topY + 0.004 * L.s, z: cz, r: pTop.color.r, g: pTop.color.g, b: pTop.color.b, w: armWeights(L, side, topY), s: pTop.surf }, [0, 1, 0]);
}

// ------------------------------------------------------------------ hands

/**
 * A hand in its bone frame: wrist at the origin, fingers down (-Y), palm facing the body.
 * Index finger is separate (its own bone, for pointing and the gladiator's raised finger);
 * the other three fingers are one pre-curled block on the fingers bone; the thumb is on the hand.
 */
export function buildHand(ctx: Ctx, L: Levels, sideSign: 1 | -1) {
  const { b, rig } = ctx;
  const side = sideSign > 0 ? 'L' : 'R';
  const s = rig.s * (rig.sex === 'female' ? 0.92 : 1) * (0.9 + 0.1 * rig.g.arm);
  const J = rig.joints;
  const hb = B[`hand${side}`];
  const wx = J[hb * 3];
  const wy = J[hb * 3 + 1];
  const wz = J[hb * 3 + 2];
  const fingersY = J[B[`fingers${side}`] * 3 + 1] - wy;
  const skin = ctx.skin;
  const handPaint = paintArm(ctx, L, side, wy - 0.05 * s, 0, 0, false);
  const glove = handPaint.hand;
  const col = glove ?? skin;
  const surf = glove ? handPaint.surf : SURF.skin;
  const hand: Weights = [hb, 1];
  const fing: Weights = [B[`fingers${side}`], 1];
  const idx: Weights = [B[`index${side}`], 1];
  // Local → bind position. lat = toward the back of the hand (outward), fwd = toward the thumb.
  const P = (lat: number, y: number, fwd: number) => [wx + sideSign * lat, wy + y, wz + fwd] as const;
  const seg = ctx.hi ? 6 : 4;

  // Palm: rounded box from wrist to knuckles.
  const palmRows: [number, number, number, number][] = [
    // y, half-thickness (lat), half-width (fwd), fwd center
    [0.008 * s, 0.017 * s, 0.026 * s, 0.0],
    [-0.025 * s, 0.017 * s, 0.037 * s, 0.002 * s],
    [-0.06 * s, 0.015 * s, 0.041 * s, -0.001 * s],
    [fingersY + 0.004 * s, 0.013 * s, 0.04 * s, -0.003 * s],
  ];
  if (!ctx.hi) palmRows.splice(1, 2);
  const palm = b.grid(
    seg,
    palmRows.length,
    true,
    (i, j, v) => {
      const [y, ht, hw, fc] = palmRows[j];
      const th = (i / seg) * Math.PI * 2;
      const [lat, fw] = superellipse(th, ht, hw, hw, 3.2);
      // The palm is a little hollow, the back slightly domed.
      const p = P(lat + (lat < 0 ? 0.003 * s * Math.cos((fw / hw) * 1.5) : 0), y, fw + fc);
      v.x = p[0];
      v.y = p[1];
      v.z = p[2];
      const c = lat < 0 ? col : col.clone().multiplyScalar(0.96);
      v.r = c.r;
      v.g = c.g;
      v.b = c.b;
      v.s = surf;
      v.w = j === 0 ? [B[`forearm${side}`], 0.3, hb, 0.7] : hand;
    },
    'auto',
    (j) => [...P(0, palmRows[j][0], palmRows[j][3])] as [number, number, number],
  );
  b.capAuto(palm, seg, palmRows.length - 1, { ...vtx(P(0, fingersY - 0.002 * s, -0.003 * s), col, hand, surf) }, [0, -1, 0]);

  // Finger tube along a polyline (pre-curled toward the palm: -lat).
  const finger = (fwd: number, len: number, rad: number, w: Weights, curl: number[]) => {
    const pts: [number, number, number][] = [];
    let ang = 0;
    let lat = 0.002 * s;
    let y = fingersY + 0.006 * s;
    const segs = [0.47, 0.31, 0.22];
    pts.push([lat, y, fwd]);
    for (let k = 0; k < 3; k++) {
      ang += curl[k];
      const l = len * segs[k];
      lat -= Math.sin(ang) * l;
      y -= Math.cos(ang) * l;
      pts.push([lat, y, fwd]);
    }
    const fs = ctx.hi ? 5 : 4;
    const radii = [rad, rad * 0.95, rad * 0.88, rad * 0.75];
    const tube = b.grid(
      fs,
      pts.length,
      true,
      (i, j, v) => {
        const th = (i / fs) * Math.PI * 2;
        // Ring plane perpendicular to the local segment direction (in the lat/y plane).
        const a0 = j === 0 ? 0 : j === pts.length - 1 ? curl.reduce((x, c) => x + c, 0) : curl.slice(0, j).reduce((x, c) => x + c, 0) + curl[j] / 2;
        const nLat = Math.cos(a0);
        const nY = -Math.sin(a0);
        const r = radii[j];
        const p = pts[j];
        const q = P(p[0] + Math.cos(th) * r * nLat * 0.85, p[1] + Math.cos(th) * r * nY * 0.85, p[2] + Math.sin(th) * r);
        v.x = q[0];
        v.y = q[1];
        v.z = q[2];
        v.r = col.r;
        v.g = col.g;
        v.b = col.b;
        v.s = surf;
        v.w = w;
      },
      'auto',
      (j) => [...P(pts[j][0], pts[j][1], pts[j][2])] as [number, number, number],
    );
    const tip = pts[pts.length - 1];
    const dirA = curl.reduce((x, c) => x + c, 0);
    b.capAuto(tube, fs, pts.length - 1, vtx(P(tip[0] - Math.sin(dirA) * rad * 0.6, tip[1] - Math.cos(dirA) * rad * 0.6, tip[2]), col, w, surf), [-Math.sin(dirA) * sideSign, -Math.cos(dirA), 0]);
  };
  const D = Math.PI / 180;
  if (ctx.hi) {
    finger(0.026 * s, 0.078 * s, 0.0095 * s, idx, [10 * D, 30 * D, 20 * D]);
    finger(0.008 * s, 0.086 * s, 0.0098 * s, fing, [12 * D, 34 * D, 22 * D]);
    finger(-0.011 * s, 0.081 * s, 0.0093 * s, fing, [14 * D, 36 * D, 22 * D]);
    finger(-0.028 * s, 0.064 * s, 0.0082 * s, fing, [16 * D, 36 * D, 22 * D]);
  } else {
    finger(0.024 * s, 0.075 * s, 0.011 * s, idx, [10 * D, 32 * D, 20 * D]);
    finger(-0.012 * s, 0.08 * s, 0.022 * s, fing, [14 * D, 36 * D, 22 * D]);
  }
  // Thumb: from the base of the palm, forward and down along the index.
  {
    const ts = ctx.hi ? 6 : 4;
    const pts: [number, number, number][] = [
      [-0.004 * s, -0.012 * s, 0.022 * s],
      [-0.012 * s, -0.035 * s, 0.042 * s],
      [-0.02 * s, -0.058 * s, 0.05 * s],
      [-0.026 * s, -0.075 * s, 0.052 * s],
    ];
    const radii = [0.014 * s, 0.012 * s, 0.0105 * s, 0.009 * s];
    const tube = b.grid(
      ts,
      pts.length,
      true,
      (i, j, v) => {
        const th = (i / ts) * Math.PI * 2;
        const p = pts[j];
        const q = P(p[0] + Math.cos(th) * radii[j], p[1], p[2] + Math.sin(th) * radii[j] * 0.85);
        v.x = q[0];
        v.y = q[1];
        v.z = q[2];
        v.r = col.r;
        v.g = col.g;
        v.b = col.b;
        v.s = surf;
        v.w = hand;
      },
      'auto',
      (j) => [...P(pts[j][0], pts[j][1], pts[j][2])] as [number, number, number],
    );
    const tip = pts[pts.length - 1];
    b.capAuto(tube, ts, pts.length - 1, vtx(P(tip[0] - 0.004 * s, tip[1] - 0.008 * s, tip[2]), col, hand, surf), [0, -1, 0]);
  }
}

function vtx(p: readonly [number, number, number], c: THREE.Color, w: Weights, s: V['s']): V {
  return { x: p[0], y: p[1], z: p[2], r: c.r, g: c.g, b: c.b, w, s };
}

// ------------------------------------------------------------------ legs

function legRows(L: Levels, rig: Rig) {
  const s = L.s;
  const g = rig.g.leg;
  const m = (v: number) => v * s * g;
  const yH = L.hip;
  const yK = L.knee;
  const yA = L.ankle;
  const fem = rig.sex === 'female';
  const th = fem ? 1.06 : 1;
  // [y, lateral, medial, front, back]
  const rows: [number, number, number, number, number][] = [
    [yA - 0.03 * s, 0.026, 0.026, 0.03, 0.03],
    [yA + 0.005 * s, 0.031, 0.031, 0.032, 0.03],
    [yA + 0.05 * s, 0.03, 0.03, 0.03, 0.03],
    [yK - 0.24 * s, 0.037, 0.037, 0.035, 0.039],
    [yK - 0.14 * s, 0.044, 0.045, 0.036, 0.055],
    [yK - 0.075 * s, 0.047, 0.047, 0.04, 0.057],
    [yK - 0.03 * s, 0.045, 0.045, 0.045, 0.048],
    [yK + 0.015 * s, 0.047, 0.048, 0.052, 0.046],
    [yK + 0.08 * s, 0.055 * th, 0.054 * th, 0.06, 0.055],
    [yK + 0.19 * s, 0.066 * th, 0.065 * th, 0.072, 0.07],
    [yH - 0.06 * s, 0.078 * th, 0.072 * th, 0.08, 0.085],
    [yH + 0.0 * s, 0.083 * th, 0.06 * th, 0.078, 0.088],
    [yH + 0.045 * s, 0.07 * th, 0.04 * th, 0.06, 0.07],
  ];
  return rows.map(([y, a, b, c, d]) => ({ y, r: [m(a), m(b), m(c), m(d)] as [number, number, number, number] }));
}

function legWeights(L: Levels, side: 'L' | 'R', y: number): Weights {
  const s = L.s;
  const th = B[`thigh${side}`];
  const sh = B[`shin${side}`];
  const ft = B[`foot${side}`];
  const tTop = smooth(L.hip - 0.04 * s, L.hip + 0.05 * s, y) * 0.55;
  const tKnee = smooth(L.knee + 0.04 * s, L.knee - 0.045 * s, y);
  const tAnkle = smooth(L.ankle + 0.025 * s, L.ankle - 0.01 * s, y);
  let w: Weights = mixW([th, 1], [B.hips, 1], tTop);
  if (tKnee > 0) w = mixW(w, [sh, 1], tKnee);
  if (tAnkle > 0) w = mixW(w, [ft, 1], tAnkle);
  return w;
}

export function buildLeg(ctx: Ctx, L: Levels, sideSign: 1 | -1) {
  const { b, rig } = ctx;
  const side = sideSign > 0 ? 'L' : 'R';
  const seg = ctx.hi ? 10 : 6;
  const base = legRows(L, rig);
  const extra = ctx.hi ? paintLeg(ctx, L, side, 0, 0, true).edges ?? [] : [];
  // Skip the hidden thigh under long skirts: start the tube just above the hem.
  const hidden = ctx.outfit.hem === 'long' && !ctx.outfit.braccae ? L.knee + 0.1 * L.s : Infinity;
  let ys = [...(ctx.hi ? base.map((r) => r.y) : base.map((r) => r.y).filter((_, i, a) => i % 2 === 0 || i === a.length - 1)), ...extra].sort((a, b) => a - b);
  ys = ys.filter((y, i) => i === 0 || y - ys[i - 1] > 0.002 * L.s);
  if (hidden < Infinity) ys = ys.filter((y) => y <= hidden);
  const radiusAt = (y: number): [number, number, number, number] => {
    if (y <= base[0].y) return base[0].r;
    for (let i = 0; i < base.length - 1; i++) {
      const a = base[i];
      const c = base[i + 1];
      if (y <= c.y) {
        const t = (y - a.y) / (c.y - a.y);
        return [0, 1, 2, 3].map((k) => lerp(a.r[k], c.r[k], t)) as [number, number, number, number];
      }
    }
    return base[base.length - 1].r;
  };
  const J = rig.joints;
  const cx = sideSign * L.hipX;
  const kz = J[B.shinL * 3 + 2];
  const az = J[B.footL * 3 + 2];
  // Leg axis z drifts slightly from hip to ankle.
  const czAt = (y: number) => (y > L.knee ? lerp(kz, 0, clamp01((y - L.knee) / (L.hip - L.knee))) : lerp(az, kz, clamp01((y - L.ankle) / (L.knee - L.ankle))));
  // Thighs angle inward from the hip joint toward the knee (knees closer together than hips).
  const cxAt = (y: number) => cx - sideSign * 0.012 * L.s * clamp01((L.hip - y) / (L.hip - L.knee)) + sideSign * 0.004 * L.s * clamp01((L.knee - y) / (L.knee - L.ankle));
  const g = b.grid(
    seg,
    ys.length,
    true,
    (i, j, v) => {
      const y = ys[j];
      const th = (i / seg) * Math.PI * 2;
      const [rl, rm, rf, rb] = radiusAt(y);
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const lat = (c >= 0 ? rl : rm) * c;
      let fz = (sn >= 0 ? rf : rb) * sn;
      // Kneecap and shin ridge.
      if (sn > 0) fz += gauss((y - L.knee - 0.01 * L.s) / L.s, 0.025) * Math.pow(sn, 4) * 0.008 * L.s;
      const paint = paintLeg(ctx, L, side, y, th, false);
      const r = Math.hypot(lat, fz) || 1e-4;
      const k = (r + paint.t) / r;
      v.x = cxAt(y) + sideSign * lat * k;
      v.y = y;
      v.z = czAt(y) + fz * k;
      v.r = paint.color.r;
      v.g = paint.color.g;
      v.b = paint.color.b;
      v.s = paint.surf;
      v.w = legWeights(L, side, y);
    },
    'auto',
    (j) => [cxAt(ys[j]), ys[j], czAt(ys[j])],
  );
  const topY = ys[ys.length - 1];
  const pTop = paintLeg(ctx, L, side, topY, 0, false);
  b.capAuto(g, seg, ys.length - 1, { x: cxAt(topY), y: topY + 0.01 * L.s, z: czAt(topY), r: pTop.color.r, g: pTop.color.g, b: pTop.color.b, w: legWeights(L, side, topY), s: pTop.surf }, [0, 1, 0]);
}

// ------------------------------------------------------------------ feet

export function buildFoot(ctx: Ctx, L: Levels, sideSign: 1 | -1) {
  const { b, rig } = ctx;
  const side = sideSign > 0 ? 'L' : 'R';
  const s = rig.s * (rig.sex === 'female' ? 0.93 : 1);
  const J = rig.joints;
  const fb = B[`foot${side}`];
  const tb = B[`toe${side}`];
  const ax = J[fb * 3];
  const az = J[fb * 3 + 2];
  const ballZ = J[tb * 3 + 2];
  const shoe = paintFoot(ctx, 0, 0, 0, 0, true);
  const sole = shoe.sole * s;
  // [z (relative to ankle), half-width, top height, medial bulge]
  const rows: [number, number, number][] = [
    [-0.068 * s, 0.022 * s, 0.05 * s],
    [-0.05 * s, 0.031 * s, 0.07 * s],
    [-0.012 * s, 0.036 * s, 0.088 * s],
    [0.035 * s, 0.041 * s, 0.072 * s],
    [0.085 * s, 0.045 * s, 0.052 * s],
    [ballZ - az, 0.047 * s, 0.036 * s],
    [0.175 * s, 0.043 * s, 0.03 * s],
    [0.2 * s, 0.032 * s, 0.024 * s],
    [0.212 * s, 0.017 * s, 0.017 * s],
  ];
  if (!ctx.hi) for (const i of [7, 4, 1]) rows.splice(i, 1);
  const seg = ctx.hi ? 8 : 5;
  const footW = (z: number): Weights => {
    const t = smooth(ballZ - az - 0.025 * s, ballZ - az + 0.02 * s, z);
    return mixW([fb, 1], [tb, 1], t);
  };
  const g = b.grid(
    seg,
    rows.length,
    true,
    (i, j, v) => {
      const [z, hw, top] = rows[j];
      const th = (i / seg) * Math.PI * 2;
      // Cross-section in the x/y plane: flat sole, rounded top. Big toe side (medial) is fuller.
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const lateral = c * sideSign; // +1 outer side
      const w = hw * (lateral < 0 ? 1.05 : 0.95);
      const half = (top + sole) / 2;
      const yy = half + Math.sign(sn) * Math.pow(Math.abs(sn), 0.6) * half;
      const x = Math.sign(c) * Math.pow(Math.abs(c), 0.75) * w;
      const yv = sn < 0 ? Math.max(0, yy - half * 0.15 * Math.abs(sn)) : yy;
      const paint = paintFoot(ctx, x * sideSign, yv, z, th, false);
      v.x = ax + x;
      v.y = Math.max(0, yv);
      v.z = az + z;
      v.r = paint.color.r;
      v.g = paint.color.g;
      v.b = paint.color.b;
      v.s = paint.surf;
      v.w = footW(z);
    },
    'auto',
    (j) => [ax, (rows[j][2] + sole) / 2, az + rows[j][0]],
  );
  const last = rows[rows.length - 1];
  const pt = paintFoot(ctx, 0, last[2] / 2, last[0], 0, false);
  b.capAuto(g, seg, rows.length - 1, { x: ax, y: (last[2] + sole) / 2, z: az + last[0] + 0.004 * s, r: pt.color.r, g: pt.color.g, b: pt.color.b, w: [tb, 1], s: pt.surf }, [0, 0, 1]);
  const first = rows[0];
  const pf = paintFoot(ctx, 0, first[2] / 2, first[0], 0, false);
  b.capAuto(g, seg, 0, { x: ax, y: (first[2] + sole) / 2, z: az + first[0] - 0.006 * s, r: pf.color.r, g: pf.color.g, b: pf.color.b, w: [fb, 1], s: pf.surf }, [0, 0, -1]);
}
