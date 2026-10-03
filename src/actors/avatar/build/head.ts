/**
 * Head and face, built like the torso: horizontal cross-sections over height (chin → crown) with
 * rows placed on the facial features (brow, lids, eyes, nose base, lips, chin) and extra columns
 * across the face. Facial structure is a set of soft displacements on that surface; eyes (with
 * upper lids, for a calm, slightly lidded gaze), the nose and the ears are separate small meshes.
 *
 * Short hair and beards are painted and displaced directly on the head vertices (no z-fighting,
 * no extra triangles); long styles add buns, towers, tails and veils.
 *
 * Everything is weighted 100% to the head bone, so collapsing that bone hides it in first person.
 */
import * as THREE from 'three';
import type { HairStyle, HelmetKind } from '../../appearance';
import { B } from '../rig';
import { SURF, type Surf, type V, type Weights } from '../SkinBuilder';
import { MonotoneCurve } from '../anim/spline';
import { clamp01, gauss, lerp, mixC, shade, smooth, srgb, type Ctx } from './common';
import type { Levels } from './body';

export interface HeadFrame {
  /** Center of the cranium (character space). */
  c: THREE.Vector3;
  /** Chin height and head height (m). */
  chin: number;
  H: number;
  hs: number;
  /** Surface point at height fraction yf (0 chin … 1 crown) and azimuth th (0 = front, +π/2 = left). */
  at(yf: number, th: number, out?: THREE.Vector3, raw?: boolean): THREE.Vector3;
  /** Compatibility: surface point toward a unit direction (u, v, w) from the center. */
  surface(u: number, v: number, w: number, out?: THREE.Vector3): THREE.Vector3;
  /** Hairline height fraction for azimuth th. */
  hairline: (th: number) => number;
  hasHelmet: boolean;
  /** Eye centers (bind pose). */
  eyes: THREE.Vector3[];
  /** Per-person facial variation (multipliers around 1). */
  face: { nose: number; noseW: number; noseProj: number; chin: number; brow: number; lips: number };
}

const HEAD_W: Weights = [B.head, 1];
const INFULA_RED = srgb('#a8352b');
const INFULA_WHITE = srgb('#efe9dc');

/** Helmets that close over the ears (no ears are built under them). */
const ENCLOSING_HELMETS: ReadonlySet<HelmetKind> = new Set<HelmetKind>(['murmillo', 'thraex', 'hoplomachus', 'secutor', 'provocator']);

/** Height fractions of key features (0 = chin, 1 = crown). */
export const FEAT = { eye: 0.555, brow: 0.635, noseBase: 0.39, mouth: 0.245, chin: 0.06, hair: 0.78, ear: 0.47 };

export function headFrame(ctx: Ctx, L: Levels): HeadFrame {
  const rig = ctx.rig;
  const H = rig.headH;
  const hs = H / 0.232;
  const fem = rig.sex === 'female';
  const child = rig.age === 'child';
  // Individual variation, seeded by the appearance (same person, same face).
  const r = ctx.rng.fork('face');
  const v = (amt: number) => 1 + (r.next() * 2 - 1) * amt;
  const face = { nose: v(0.14), noseW: v(0.15), noseProj: v(0.18), chin: v(0.45), brow: v(0.35), lips: v(0.3) };
  const faceW = v(0.05);
  const jawK = (fem ? 0.86 : rig.build === 'heavy' ? 1.08 : rig.build === 'muscular' || rig.build === 'stocky' ? 1.04 : 1) * v(0.07);
  const cheekK = (rig.build === 'heavy' ? 1.06 : rig.age === 'old' ? 0.96 : 1) * v(0.04);
  const longK = v(0.04);
  // Profile rows: [yFraction, halfWidth, frontDepth, backDepth] in reference meters (× hs).
  const rows: [number, number, number, number][] = [
    [0.0, 0.012, 0.03, -0.0],
    [0.04, 0.026 * jawK, 0.06, 0.006],
    [0.1, 0.039 * jawK, 0.074, 0.016],
    [0.18, 0.05 * jawK, 0.08, 0.028],
    [0.28, 0.06 * jawK * cheekK, 0.084, 0.046],
    [0.38, 0.066 * cheekK, 0.087, 0.066],
    [0.48, 0.07, 0.089, 0.083],
    [0.58, 0.073, 0.092, 0.094],
    [0.66, 0.075, 0.093, 0.099],
    [0.76, 0.074, 0.086, 0.1],
    [0.86, 0.067, 0.072, 0.09],
    [0.93, 0.053, 0.054, 0.071],
    [0.975, 0.034, 0.033, 0.046],
    [1.0, 0.004, 0.004, 0.006],
  ];
  if (child) for (const row of rows) if (row[0] > 0.5) row[1] *= 1.04;
  for (const row of rows) {
    row[1] *= faceW;
    if (row[0] < 0.5) row[2] *= longK;
  }
  const ys = rows.map((r) => r[0]);
  const ca = new MonotoneCurve(ys, rows.map((r) => r[1] * hs));
  const cf = new MonotoneCurve(ys, rows.map((r) => r[2] * hs));
  const cb = new MonotoneCurve(ys, rows.map((r) => r[3] * hs));
  const chin = L.chin;
  const cz = 0.004 * hs;
  const c = new THREE.Vector3(0, chin + H * 0.6, cz);
  const nf = fem ? 0.7 : 1;
  const f: HeadFrame = {
    c,
    chin,
    H,
    hs,
    eyes: [],
    face,
    hasHelmet: !!ctx.app.armor?.helmet && ctx.app.armor.helmet.kind !== 'pileus',
    hairline: (th) => hairlineFor(ctx.app.hair.style, th),
    at(yf, th, out = new THREE.Vector3(), raw = false) {
      const y = Math.min(1, Math.max(0, yf));
      const a = ca.eval(y);
      const fd = cf.eval(y);
      const bd = cb.eval(y);
      const s = Math.sin(th);
      const co = Math.cos(th);
      // Cross-section: flatter in front (face), rounder at the back.
      const e = co > 0 ? 0.78 : 0.95;
      let x = a * Math.sign(s) * Math.pow(Math.abs(s), e);
      let z = (co > 0 ? fd : bd) * Math.sign(co) * Math.pow(Math.abs(co), co > 0 ? 0.85 : 1);
      if (!raw && co > 0) {
        const u = x / (0.07 * hs); // −1..1 across the face
        const front = Math.pow(co, 2);
        // Eye sockets, brow ridge, cheekbones, lips, chin, temples.
        z -= gauss(Math.abs(u) - 0.45, 0.2) * gauss((y - FEAT.eye) / 0.05, 1) * 0.0075 * hs * front;
        z += gauss((y - FEAT.brow) / 0.035, 1) * gauss(u, 0.75) * 0.004 * hs * front * nf * face.brow;
        z -= gauss(u, 0.3) * gauss((y - FEAT.eye - 0.01) / 0.03, 1) * 0.002 * hs * front;
        const cheek = gauss(Math.abs(u) - 0.72, 0.18) * gauss((y - 0.45) / 0.06, 1) * 0.004 * hs;
        x += Math.sign(x) * cheek;
        z += cheek * 0.5;
        z += gauss((y - FEAT.mouth) / 0.035, 1) * gauss(u, 0.32) * 0.0035 * hs * front * (fem ? 1.25 : 1) * face.lips;
        z -= gauss((y - FEAT.mouth) / 0.008, 1) * gauss(u, 0.28) * 0.0015 * hs * front;
        z += gauss((y - 0.09) / 0.045, 1) * gauss(u, 0.32) * 0.004 * hs * front * face.chin;
        x -= Math.sign(x) * gauss(Math.abs(u) - 0.95, 0.12) * gauss((y - 0.68) / 0.08, 1) * 0.003 * hs;
        // Philtrum / nose base shadow area slightly recessed under the nose.
        z -= gauss((y - FEAT.noseBase + 0.02) / 0.03, 1) * gauss(Math.abs(u) - 0.3, 0.2) * 0.002 * hs * front;
      }
      return out.set(x, chin + y * H, cz + z);
    },
    surface(u, v, w, out = new THREE.Vector3()) {
      const th = Math.atan2(u, w);
      const yf = v >= 0 ? 0.6 + v * 0.4 : 0.6 + v * 0.6;
      return f.at(yf, th, out);
    },
  };
  return f;
}

/** Hairline height fraction around the head for a style (0 front … π back). */
function hairlineFor(style: HairStyle, th: number): number {
  const a = Math.abs(((th + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
  let front = 0.77;
  let temple = 0.72;
  let side = 0.6;
  let back = 0.3;
  switch (style) {
    case 'cropped':
      // Trajanic comb-forward fringe: low, straight, with jagged locks.
      front = 0.74 + 0.012 * Math.sin(th * 41);
      temple = 0.7;
      side = 0.6;
      back = 0.3;
      break;
    case 'receding':
      front = 0.88;
      temple = 0.84;
      side = 0.62;
      back = 0.32;
      break;
    case 'curly-short':
      front = 0.76;
      temple = 0.7;
      side = 0.58;
      back = 0.3;
      break;
    case 'long-tied':
      front = 0.78;
      temple = 0.72;
      side = 0.45;
      back = 0.2;
      break;
    case 'bun':
    case 'braided-crown':
    case 'trajanic-tower':
      front = 0.78;
      temple = 0.72;
      side = 0.52;
      back = 0.28;
      break;
    case 'bald':
      return 2;
    default:
      break;
  }
  const t = a / Math.PI;
  if (t < 0.18) return lerp(front, temple, t / 0.18);
  if (t < 0.42) return lerp(temple, side, smooth(0, 1, (t - 0.18) / 0.24));
  if (t < 0.55) return side;
  return lerp(side, back, smooth(0, 1, (t - 0.55) / 0.45));
}

const HAIR_THICK: Record<HairStyle, number> = {
  bald: 0,
  cropped: 0.006,
  'curly-short': 0.011,
  receding: 0.0045,
  'long-tied': 0.008,
  bun: 0.007,
  'braided-crown': 0.007,
  'trajanic-tower': 0.008,
  veiled: 0.004,
  vestal: 0.004,
};

/** Row heights (fractions), aligned with features for crisp details. */
const ROWS_HI = [0.0, 0.06, 0.13, 0.2, 0.245, 0.29, 0.34, 0.39, 0.45, 0.51, 0.555, 0.6, 0.635, 0.68, 0.74, 0.78, 0.86, 0.95];
const ROWS_LO = [0.0, 0.12, 0.26, 0.42, 0.555, 0.68, 0.82, 0.95];

export function buildHead(ctx: Ctx, L: Levels): HeadFrame {
  const Hf = headFrame(ctx, L);
  const { b, app, rig } = ctx;
  const hs = Hf.hs;
  // Under a helmet only cropped hair; under a veil the hair (a bun) still shows at the front.
  const style: HairStyle = Hf.hasHelmet ? 'cropped' : app.hair.style;
  const veiled = style === 'veiled' || style === 'vestal';
  const paintStyle: HairStyle = veiled ? 'bun' : style;
  const hairT = HAIR_THICK[paintStyle] * hs;
  const skin = ctx.skin;
  const hair = ctx.hair;
  const fem = rig.sex === 'female';
  const lip = mixC(shade(skin, 0.8), srgb(fem ? '#9a4a44' : '#8a4a40'), fem ? 0.48 : 0.36);
  const brow = mixC(shade(skin, 0.8), hair, rig.age === 'old' ? 0.45 : 0.75);
  const beard = app.beard ?? 'none';
  const male = rig.sex === 'male';
  const blushC = mixC(skin, srgb('#c86a55'), fem ? 0.12 : 0.08);
  const old = rig.age === 'old';

  const cols = ctx.hi ? 24 : 10;
  const rows = ctx.hi ? ROWS_HI : ROWS_LO;
  // Columns concentrated across the face (θ = 0 at the front).
  const thetaAt = (i: number) => {
    const t = i / cols;
    return 2 * Math.PI * (t - (0.38 * Math.sin(2 * Math.PI * t)) / (2 * Math.PI));
  };
  const p = new THREE.Vector3();
  const col = new THREE.Color();
  const g = b.grid(
    cols,
    rows.length,
    true,
    (i, j, v) => {
      const th = thetaAt(i);
      const yf = rows[j];
      Hf.at(yf, th, p);
      const co = Math.cos(th);
      const u = p.x / (0.07 * hs);
      col.copy(skin);
      let surf: Surf = SURF.skin;
      // Face coloring.
      if (co > 0.2) {
        const fr = smooth(0.2, 0.6, co);
        const lipK = gauss((yf - FEAT.mouth) / 0.022, 1) * gauss(u, 0.3) * fr;
        col.lerp(lip, clamp01(lipK * 1.4));
        const browK = gauss((yf - FEAT.brow) / 0.016, 1) * gauss(Math.abs(u) - 0.42, 0.24) * fr;
        col.lerp(brow, clamp01(browK * 1.5));
        const blush = gauss(Math.abs(u) - 0.62, 0.22) * gauss((yf - 0.42) / 0.07, 1);
        col.lerp(blushC, clamp01(blush));
        // Soft shadow in the sockets and under the brow; nose-base and under-lip shading.
        col.multiplyScalar(1 - 0.12 * gauss(Math.abs(u) - 0.44, 0.22) * gauss((yf - FEAT.eye - 0.02) / 0.04, 1) * fr);
        col.multiplyScalar(1 - 0.1 * gauss((yf - 0.19) / 0.02, 1) * gauss(u, 0.4) * fr);
        if (old) col.multiplyScalar(1 - 0.06 * gauss((yf - 0.33) / 0.04, 1) * gauss(Math.abs(u) - 0.45, 0.15));
      }
      // Under-jaw shadow.
      col.multiplyScalar(1 - 0.18 * smooth(0.12, 0.0, yf) * smooth(-0.2, 0.6, -co + 0.4));
      // Hair region.
      const hl = hairlineFor(paintStyle, th);
      let hairK = style === 'bald' ? 0 : smooth(hl - 0.012, hl + 0.012, yf);
      let disp = 0;
      if (hairK > 0) {
        const n = Math.sin(th * 23 + yf * 40) * Math.sin(th * 9 - yf * 25);
        const curl = style === 'curly-short' ? 0.004 * hs * (0.5 + 0.5 * Math.sin(th * 31) * Math.sin(yf * 90)) : 0;
        // Under a veil only the front shows: the rest lies flat beneath the cloth.
        disp = veiled && underVeil(yf, th) ? 0 : hairK * (hairT + curl + 0.0012 * hs * n);
        col.lerp(shade(hair, 0.9 + 0.14 * n), hairK);
        if (hairK > 0.5) surf = SURF.hair;
      }
      // The Vestal's infula: twisted red and white woollen bands across the brow, under the veil's edge.
      if (style === 'vestal' && yf > 0.7 && !underVeil(yf, th)) {
        col.copy((i + j) % 2 ? INFULA_RED : INFULA_WHITE);
        surf = SURF.wool;
        disp = 0.008 * hs * smooth(0.69, 0.73, yf);
      }
      // Beard: jaw, chin, cheeks below the cheekbones and the upper lip.
      if (male && beard !== 'none' && !Hf.hasHelmet) {
        const zone = smooth(0.42, 0.34, yf) * (co > -0.35 ? 1 : 0) * smooth(-0.35, -0.1, co);
        const notLips = 1 - gauss((yf - FEAT.mouth) / 0.02, 1) * gauss(u, 0.3);
        const bk = clamp01(zone * notLips * (co > 0.85 && yf > 0.3 && Math.abs(u) < 0.3 ? 0 : 1));
        if (beard === 'stubble') col.lerp(mixC(skin, hair, 0.5), bk * 0.5);
        else {
          const n = Math.sin(th * 29 + yf * 70);
          const t = (beard === 'full' ? 0.011 : 0.005) * hs * (yf < 0.12 && beard === 'full' ? 1.4 : 1);
          disp = Math.max(disp, bk * (t + 0.0012 * hs * n));
          col.lerp(shade(hair, 0.95 + 0.1 * n), clamp01(bk * 1.3));
          if (bk > 0.5) surf = SURF.hair;
        }
      } else if (male && rig.age !== 'child' && !Hf.hasHelmet) {
        // Clean-shaven shadow.
        const zone = smooth(0.36, 0.26, yf) * smooth(-0.2, 0.3, co);
        col.lerp(mixC(skin, hair, 0.3), zone * 0.14);
      }
      if (disp > 0) {
        const dx = p.x - Hf.c.x, dy = (p.y - Hf.c.y) * 0.6, dz = p.z - Hf.c.z;
        const l = Math.hypot(dx, dy, dz) || 1;
        p.x += (dx / l) * disp;
        p.y += (dy / l) * disp;
        p.z += (dz / l) * disp;
      }
      hairK = 0;
      v.x = p.x;
      v.y = p.y;
      v.z = p.z;
      v.r = col.r;
      v.g = col.g;
      v.b = col.b;
      v.w = HEAD_W;
      v.s = surf;
    },
    'auto',
    (j) => [0, Hf.chin + rows[j] * Hf.H, Hf.c.z],
  );
  const topH = style === 'bald';
  b.capAuto(g, cols, rows.length - 1, vtx(new THREE.Vector3(0, Hf.chin + Hf.H + (topH || veiled ? 0 : hairT), Hf.c.z - 0.004 * hs), topH ? skin : shade(hair, 0.95), HEAD_W, topH ? SURF.skin : SURF.hair), [0, 1, 0]);
  b.capAuto(g, cols, 0, vtx(new THREE.Vector3(0, Hf.chin - 0.002 * hs, Hf.c.z + 0.02 * hs), shade(skin, 0.75), HEAD_W, SURF.skin), [0, -1, 0]);

  buildEyes(ctx, Hf);
  buildNose(ctx, Hf);
  const helmet = app.armor?.helmet?.kind;
  if (ctx.hi && !(helmet && ENCLOSING_HELMETS.has(helmet))) buildEars(ctx, Hf);
  if (!Hf.hasHelmet) buildHairExtras(ctx, Hf, L, style);
  if (male && beard === 'full' && !Hf.hasHelmet) buildMoustache(ctx, Hf);
  return Hf;
}

function vtx(p: THREE.Vector3, c: THREE.Color, w: Weights, s: Surf): V {
  return { x: p.x, y: p.y, z: p.z, r: c.r, g: c.g, b: c.b, w, s };
}

// ------------------------------------------------------------------ eyes

function buildEyes(ctx: Ctx, H: HeadFrame) {
  const { b, rig } = ctx;
  const hs = H.hs;
  const r = 0.0122 * hs;
  const hsl = { h: 0, s: 0, l: 0 };
  const light = ctx.hair.getHSL(hsl).l > 0.3 && ctx.skin.getHSL(hsl).l > 0.55;
  const iris = srgb(light ? '#5d7280' : rig.age === 'old' ? '#4a3a2c' : '#3e2a1c');
  const sclera = mixC(srgb('#e2d9cc'), ctx.skin, 0.25);
  const lid = shade(ctx.skin, 0.95);
  const lash = mixC(shade(ctx.skin, 0.6), srgb('#1d1410'), 0.55);
  const seg = ctx.hi ? 8 : 4;
  const rows = ctx.hi ? 5 : 3;
  const D = Math.PI / 180;
  for (const side of [1, -1]) {
    // Eye center: behind the (un-dented) face surface so the front of the eye sits flush.
    const ex = side * 0.031 * hs;
    const th = Math.asin(Math.max(-1, Math.min(1, ex / (0.072 * hs))));
    const surf = H.at(FEAT.eye, th, new THREE.Vector3(), true);
    const center = new THREE.Vector3(ex, surf.y, surf.z - r * 1.05);
    H.eyes.push(center.clone());
    // Eyes look straight ahead, toed out a touch.
    const yaw = side * 4 * D;
    const g = b.grid(
      seg,
      rows,
      true,
      (i, j, v) => {
        const a = (j / (rows - 1)) * Math.PI; // 0 = front pole
        const t = (i / seg) * Math.PI * 2;
        let dx = Math.sin(a) * Math.cos(t);
        const dy = Math.sin(a) * Math.sin(t);
        let dz = Math.cos(a);
        const rx = dx * Math.cos(yaw) + dz * Math.sin(yaw);
        dz = -dx * Math.sin(yaw) + dz * Math.cos(yaw);
        dx = rx;
        v.x = center.x + dx * r;
        v.y = center.y + dy * r;
        v.z = center.z + dz * r;
        const k = a < 0.25 ? 0 : a < 0.62 ? 1 : 2;
        const cc = k === 0 ? shade(iris, 0.3) : k === 1 ? iris : sclera;
        v.r = cc.r;
        v.g = cc.g;
        v.b = cc.b;
        v.w = HEAD_W;
        v.s = SURF.eye;
      },
      'auto',
      () => [center.x, center.y, center.z],
    );
    b.capAuto(g, seg, 0, vtx(center.clone().add(new THREE.Vector3(Math.sin(yaw) * r, 0, Math.cos(yaw) * r)), shade(iris, 0.25), HEAD_W, SURF.eye), [0, 0, 1]);
    if (!ctx.hi) continue;
    // Upper lid shell over the top of the eye; its edge is the dark lash line.
    const lidR = r * 1.12;
    const lseg = ctx.hi ? 7 : 4;
    const lrows = ctx.hi ? 3 : 2;
    const droop = rig.age === 'old' ? 0.1 : 0;
    b.grid(
      lseg,
      lrows,
      false,
      (i, j, v) => {
        const az = (-1 + (2 * i) / (lseg - 1)) * 1.4;
        const edge = 0.12 - droop + 0.08 * Math.pow(Math.abs(az) / 1.4, 2);
        const el = lerp(edge, 1.3, j / (lrows - 1));
        let dx = Math.sin(az) * Math.cos(el);
        const dy = Math.sin(el);
        let dz = Math.cos(az) * Math.cos(el);
        const rx = dx * Math.cos(yaw) + dz * Math.sin(yaw);
        dz = -dx * Math.sin(yaw) + dz * Math.cos(yaw);
        dx = rx;
        v.x = center.x + dx * lidR;
        v.y = center.y + dy * lidR;
        v.z = center.z + dz * lidR;
        const cc = j === 0 ? lash : lid;
        v.r = cc.r;
        v.g = cc.g;
        v.b = cc.b;
        v.w = HEAD_W;
        v.s = SURF.skin;
      },
      'auto',
      () => [center.x, center.y, center.z],
    );
    // Lower lid: a thin skin rim under the eye.
    if (ctx.hi) b.grid(
      lseg,
      2,
      false,
      (i, j, v) => {
        const az = (-1 + (2 * i) / (lseg - 1)) * 1.3;
        const el = j === 0 ? -0.62 : -1.0;
        let dx = Math.sin(az) * Math.cos(el);
        const dy = Math.sin(el);
        let dz = Math.cos(az) * Math.cos(el);
        const rx = dx * Math.cos(yaw) + dz * Math.sin(yaw);
        dz = -dx * Math.sin(yaw) + dz * Math.cos(yaw);
        dx = rx;
        v.x = center.x + dx * r * 1.08;
        v.y = center.y + dy * r * 1.08;
        v.z = center.z + dz * r * 1.08;
        const cc = shade(ctx.skin, j === 0 ? 0.85 : 0.95);
        v.r = cc.r;
        v.g = cc.g;
        v.b = cc.b;
        v.w = HEAD_W;
        v.s = SURF.skin;
      },
      'auto',
      () => [center.x, center.y, center.z],
    );
  }
}

// ------------------------------------------------------------------ nose

function buildNose(ctx: Ctx, H: HeadFrame) {
  const { b, rig } = ctx;
  const hs = H.hs;
  const k = hs * (rig.age === 'old' ? 1.08 : 1) * (rig.sex === 'female' ? 0.86 : 1) * (rig.age === 'child' ? 0.8 : 1);
  const kw = k * H.face.noseW;
  const surfAt = (yf: number, x = 0) => H.at(yf, Math.asin(Math.max(-1, Math.min(1, x / (0.07 * hs)))), new THREE.Vector3(), true);
  const yTop = FEAT.eye + 0.005;
  const yTip = FEAT.noseBase + 0.03 * H.face.nose;
  const yBase = FEAT.noseBase;
  const top = surfAt(yTop);
  const tipS = surfAt(yTip);
  const baseS = surfAt(yBase);
  const proj = 0.0175 * k * H.face.noseProj;
  // Bridge profile points (center line) from the root to the tip and under to the base.
  const P: THREE.Vector3[] = [];
  const C: THREE.Color[] = [];
  const skin = mixC(ctx.skin, srgb('#c47a62'), 0.05);
  const side = shade(ctx.skin, 0.96);
  const under = shade(ctx.skin, 0.68);
  const add = (p: THREE.Vector3, c: THREE.Color) => {
    P.push(p);
    C.push(c);
    return P.length - 1;
  };
  const root = add(top.clone().add(new THREE.Vector3(0, 0, -0.002 * k)), skin);
  const mid = add(surfAt(lerp(yTop, yTip, 0.5)).add(new THREE.Vector3(0, 0, proj * 0.5)), skin);
  const tip = add(tipS.clone().add(new THREE.Vector3(0, -0.004 * k, proj)), skin);
  const colu = add(baseS.clone().add(new THREE.Vector3(0, 0.002 * k, proj * 0.45)), under);
  const midL = add(surfAt(lerp(yTop, yTip, 0.5), 0.009 * k).add(new THREE.Vector3(0.0, 0, -0.002 * k)), side);
  const midR = add(surfAt(lerp(yTop, yTip, 0.5), -0.009 * k).add(new THREE.Vector3(0.0, 0, -0.002 * k)), side);
  const alaL = add(surfAt(yBase + 0.014, 0.0165 * kw).add(new THREE.Vector3(0, 0, 0.007 * k)), side);
  const alaR = add(surfAt(yBase + 0.014, -0.0165 * kw).add(new THREE.Vector3(0, 0, 0.007 * k)), side);
  const tipL = add(tipS.clone().add(new THREE.Vector3(0.0095 * kw, -0.003 * k, proj * 0.68)), skin);
  const tipR = add(tipS.clone().add(new THREE.Vector3(-0.0095 * kw, -0.003 * k, proj * 0.68)), skin);
  const nosL = add(baseS.clone().add(new THREE.Vector3(0.008 * k, 0.003 * k, proj * 0.35)), under);
  const nosR = add(baseS.clone().add(new THREE.Vector3(-0.008 * k, 0.003 * k, proj * 0.35)), under);
  const ids = P.map((p, i) => b.vertex(vtx(p, C[i], HEAD_W, SURF.skin)));
  const T = (a: number, c: number, d: number) => {
    const pa = P[a], pb = P[c], pc = P[d];
    const n = new THREE.Vector3().subVectors(pb, pa).cross(new THREE.Vector3().subVectors(pc, pa));
    const out = pa.clone().add(pb).add(pc).multiplyScalar(1 / 3).sub(new THREE.Vector3(0, H.chin + FEAT.eye * H.H * 0.8, H.c.z - 0.02));
    if (n.dot(out) >= 0) b.tri(ids[a], ids[c], ids[d]);
    else b.tri(ids[a], ids[d], ids[c]);
  };
  // Bridge.
  T(root, midL, mid);
  T(root, mid, midR);
  T(mid, midL, tipL);
  T(mid, tipL, tip);
  T(mid, tip, tipR);
  T(mid, tipR, midR);
  // Sides down to the alae.
  T(midL, alaL, tipL);
  T(midR, tipR, alaR);
  // Underside: nostrils and columella.
  T(tipL, alaL, nosL);
  T(tipR, nosR, alaR);
  T(tip, tipL, nosL);
  T(tip, nosR, tipR);
  T(tip, nosL, colu);
  T(tip, colu, nosR);
}

// ------------------------------------------------------------------ ears

function buildEars(ctx: Ctx, H: HeadFrame) {
  const { b } = ctx;
  const hs = H.hs;
  const outer = shade(ctx.skin, 0.97);
  const inner = mixC(shade(ctx.skin, 0.72), srgb('#a3483a'), 0.12);
  const seg = ctx.hi ? 8 : 5;
  for (const side of [1, -1]) {
    const anchor = H.at(FEAT.ear, side * (Math.PI / 2 + 0.12), new THREE.Vector3(), true);
    const h = 0.029 * hs;
    const wdt = 0.017 * hs;
    const out = new THREE.Vector3(side, 0, 0.18).normalize();
    const up = new THREE.Vector3(0, 1, -0.25).normalize();
    const fwd = new THREE.Vector3().crossVectors(up, out).multiplyScalar(side).normalize();
    const layers: [number, number, THREE.Color][] = [
      [0.9, -0.004 * hs, outer],
      [1.0, 0.009 * hs, outer],
      [0.62, 0.007 * hs, inner],
    ];
    const g = b.grid(
      seg,
      layers.length,
      true,
      (i, j, v) => {
        const a = (i / seg) * Math.PI * 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const [sc, off, col] = layers[j];
        const wf = s > 0 ? 1 : 0.72;
        const p = anchor
          .clone()
          .addScaledVector(fwd, c * wdt * wf * sc)
          .addScaledVector(up, s * h * sc - (s < 0 ? 0.002 * hs : 0))
          .addScaledVector(out, off + (c < 0 ? 0.002 * hs : 0));
        v.x = p.x;
        v.y = p.y;
        v.z = p.z;
        v.r = col.r;
        v.g = col.g;
        v.b = col.b;
        v.w = HEAD_W;
        v.s = SURF.skin;
      },
      'auto',
      () => {
        const p = anchor.clone().addScaledVector(out, -0.02);
        return [p.x, p.y, p.z];
      },
    );
    const center = anchor.clone().addScaledVector(out, 0.003 * hs);
    b.capAuto(g, seg, layers.length - 1, vtx(center, shade(inner, 0.8), HEAD_W, SURF.skin), [out.x, out.y, out.z]);
  }
}

// ------------------------------------------------------------------ hair extras

function blobAt(ctx: Ctx, center: THREE.Vector3, rx: number, ry: number, rz: number, col: THREE.Color, bumps: number, w: Weights = HEAD_W, surf: Surf = SURF.hair) {
  const { b } = ctx;
  const seg = ctx.hi ? 7 : 5;
  const rows = ctx.hi ? 4 : 3;
  const g = b.grid(
    seg,
    rows,
    true,
    (i, j, v) => {
      const a = ((j + 1) / (rows + 1)) * Math.PI;
      const th = (i / seg) * Math.PI * 2;
      const bump = 1 + bumps * Math.sin(th * 5 + j * 2.1) * Math.sin(a * 3);
      v.x = center.x + Math.sin(a) * Math.cos(th) * rx * bump;
      v.y = center.y + Math.cos(a) * ry * bump;
      v.z = center.z + Math.sin(a) * Math.sin(th) * rz * bump;
      const c = shade(col, 0.88 + 0.16 * Math.sin(th * 7 + j));
      v.r = c.r;
      v.g = c.g;
      v.b = c.b;
      v.w = w;
      v.s = surf;
    },
    'auto',
    () => [center.x, center.y, center.z],
  );
  b.capAuto(g, seg, 0, vtx(center.clone().add(new THREE.Vector3(0, ry, 0)), col, w, surf), [0, 1, 0]);
  b.capAuto(g, seg, rows - 1, vtx(center.clone().add(new THREE.Vector3(0, -ry, 0)), shade(col, 0.8), w, surf), [0, -1, 0]);
}

function buildHairExtras(ctx: Ctx, H: HeadFrame, L: Levels, style: HairStyle) {
  const { b } = ctx;
  const hs = H.hs;
  const hair = ctx.hair;
  const outward = (p: THREE.Vector3, d: number) => {
    const n = p.clone().sub(H.c);
    n.y *= 0.5;
    return p.addScaledVector(n.normalize(), d);
  };
  switch (style) {
    case 'bun': {
      const p = outward(H.at(0.42, Math.PI), 0.022 * hs);
      blobAt(ctx, p, 0.028 * hs, 0.024 * hs, 0.024 * hs, hair, 0.08);
      break;
    }
    case 'trajanic-tower': {
      // Back knot and a frontal crest of curls (orbis comarum) arched from temple to temple.
      blobAt(ctx, outward(H.at(0.62, Math.PI), 0.024 * hs), 0.034 * hs, 0.03 * hs, 0.028 * hs, hair, 0.1);
      const n = ctx.hi ? 7 : 4;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const az = lerp(-1.15, 1.15, t);
        const lift = (1 - Math.pow(Math.abs(t - 0.5) * 2, 2)) * 0.03 * hs;
        const base = outward(H.at(0.86, az), 0.01 * hs);
        base.y += lift + 0.008 * hs;
        blobAt(ctx, base, 0.021 * hs, 0.022 * hs + lift * 0.4, 0.02 * hs, hair, 0.18);
      }
      break;
    }
    case 'braided-crown': {
      const n = ctx.hi ? 11 : 6;
      for (let i = 0; i < n; i++) {
        const az = (i / n) * Math.PI * 2;
        const p = outward(H.at(0.84, az), 0.006 * hs);
        blobAt(ctx, p, 0.016 * hs, 0.013 * hs, 0.016 * hs, shade(hair, 1.05), 0.12);
      }
      break;
    }
    case 'long-tied': {
      const top = outward(H.at(0.3, Math.PI), 0.004 * hs);
      const bottom = new THREE.Vector3(0, L.armpit, top.z - 0.03 * hs);
      const seg = ctx.hi ? 8 : 5;
      const rows = 5;
      const g = b.grid(
        seg,
        rows,
        true,
        (i, j, v) => {
          const t = j / (rows - 1);
          const c = top.clone().lerp(bottom, t);
          c.z -= Math.sin(t * Math.PI) * 0.03 * hs;
          const r = lerp(0.024, 0.013, t) * hs;
          const th = (i / seg) * Math.PI * 2;
          v.x = c.x + Math.cos(th) * r;
          v.y = c.y;
          v.z = c.z + Math.sin(th) * r * 0.8;
          const col = shade(hair, 0.9 + 0.12 * Math.sin(th * 3 + t * 5));
          v.r = col.r;
          v.g = col.g;
          v.b = col.b;
          v.w = t < 0.3 ? HEAD_W : t < 0.6 ? [B.head, 0.4, B.neck, 0.6] : [B.neck, 0.4, B.chest, 0.6];
          v.s = SURF.hair;
        },
        'auto',
        (j) => {
          const c = top.clone().lerp(bottom, j / (rows - 1));
          return [c.x, c.y, c.z];
        },
      );
      b.capAuto(g, seg, rows - 1, vtx(bottom.clone().add(new THREE.Vector3(0, -0.01, 0)), shade(hair, 0.85), [B.chest, 1], SURF.hair), [0, -1, 0]);
      blobAt(ctx, top.clone().add(new THREE.Vector3(0, -0.015 * hs, -0.004 * hs)), 0.017 * hs, 0.008 * hs, 0.015 * hs, srgb('#5a4630'), 0, HEAD_W, SURF.leather);
      break;
    }
    case 'veiled':
    case 'vestal':
      buildVeil(ctx, H, L, style);
      break;
    default:
      break;
  }
}

/**
 * Veil coverage: the cloth wraps the head from the back and is closed over the crown. Its front
 * edge crosses the top of the forehead in a low arch, then runs down beside the face to the cheeks.
 * VEIL_OPENING lists [height fraction, half-width of the face opening (rad)].
 */
const VEIL_OPENING: readonly (readonly [number, number])[] = [
  [0.88, 0],
  [0.84, 0.55],
  [0.78, 0.8],
  [0.68, 0.89],
];
/** Half-span of the cloth around the back of the head (π = all the way round) at height fraction yf. */
function veilHalfSpan(yf: number): number {
  const o = VEIL_OPENING;
  if (yf >= o[0][0]) return Math.PI;
  for (let k = 1; k < o.length; k++) {
    if (yf >= o[k][0]) return Math.PI - lerp(o[k][1], o[k - 1][1], (yf - o[k][0]) / (o[k - 1][0] - o[k][0]));
  }
  return Math.PI - o[o.length - 1][1];
}
/** Is the head surface at (yf, th) under the veil? */
function underVeil(yf: number, th: number): boolean {
  const fromBack = Math.abs(Math.atan2(Math.sin(th - Math.PI), Math.cos(th - Math.PI)));
  return fromBack <= veilHalfSpan(yf) - 0.04;
}
/** Veil rows over the head: the head's own rows (so both surfaces chord alike) from crown to cheek. */
const VEIL_ROWS_HI = [1.0, 0.95, 0.88, 0.84, 0.78, 0.68, 0.6, 0.51, 0.39];
const VEIL_ROWS_LO = [1.0, 0.94, 0.86, 0.78, 0.68, 0.555, 0.42];

/** Palla (or toga) drawn over the head, or the Vestal's white suffibulum over the infula. */
function buildVeil(ctx: Ctx, H: HeadFrame, L: Levels, style: HairStyle) {
  const { b, app } = ctx;
  const hs = H.hs;
  const cloth = app.garments.find((g) => g.kind === 'palla') ?? app.garments.find((g) => g.kind === 'toga');
  const color = style === 'vestal' ? srgb('#f0ece2') : srgb(cloth?.color ?? '#7d6a55');
  const seg = ctx.hi ? 13 : 9;
  const headRows = ctx.hi ? VEIL_ROWS_HI : VEIL_ROWS_LO;
  const drapeRows = 2;
  const rows = headRows.length + drapeRows;
  // Clear of the scalp (the hair under the veil is not displaced) and of chord sag between rows.
  const T = 0.011 * hs;
  const bottom = headRows[headRows.length - 1];
  // Emitted twice: outside, then the inside (flipped) where it can be seen: around the face opening
  // and the hanging ends (over the crown the head fills it).
  const insideFrom = headRows.findIndex((y) => y <= 0.78);
  for (let pass = 0; pass < 2; pass++) {
    const j0 = pass === 0 ? 0 : insideFrom;
    b.grid(
      seg,
      rows - j0,
      false,
      (i, jj, v) => {
        const j = jj + j0;
        const head = j < headRows.length;
        const yf = head ? headRows[j] : bottom;
        const A = veilHalfSpan(yf);
        const az = Math.PI + A * lerp(-1, 1, i / (seg - 1));
        let p: THREE.Vector3;
        let w: Weights;
        if (head) {
          p = H.at(yf, az);
          const n = p.clone().sub(H.c);
          n.y *= 0.4;
          p.addScaledVector(n.normalize(), T + 0.003 * hs * Math.sin(az * 9) * smooth(0.95, 0.7, yf));
          w = HEAD_W;
        } else {
          const k = (j - headRows.length + 1) / drapeRows;
          const edge = H.at(bottom, az);
          const d = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
          p = edge.clone().addScaledVector(d, T + 0.035 * k * hs);
          p.y = lerp(edge.y, L.shoulder + 0.01 * L.s, k);
          p.addScaledVector(d, Math.abs(Math.sin(az)) * 0.08 * k * L.s);
          w = k < 0.5 ? [B.head, 0.5, B.neck, 0.5] : [B.neck, 0.4, B.chest, 0.6];
        }
        v.x = p.x;
        v.y = p.y;
        v.z = p.z;
        let c = shade(color, 0.9 + 0.1 * Math.sin(az * 9 + j * 0.4));
        if (i === 0 || i === seg - 1) c = shade(color, 0.82);
        v.r = c.r;
        v.g = c.g;
        v.b = c.b;
        v.w = w;
        v.s = SURF.wool;
      },
      'auto',
      (jj) => {
        const j = jj + j0;
        return [H.c.x, H.chin + H.H * (j < headRows.length ? headRows[j] * 0.7 : 0.2), H.c.z];
      },
    );
    if (pass === 1) b.flipTail((seg - 1) * (rows - j0 - 1) * 2);
  }
}

function buildMoustache(ctx: Ctx, H: HeadFrame) {
  const { b } = ctx;
  const hs = H.hs;
  const col = shade(ctx.hair, 0.95);
  const n = 5;
  const P: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const x = lerp(-0.024, 0.024, i / (n - 1)) * hs;
    const th = Math.asin(x / (0.07 * hs));
    P.push(H.at(FEAT.mouth + 0.04, th).add(new THREE.Vector3(0, 0, 0.005 * hs)));
    P.push(H.at(FEAT.mouth + 0.012 - Math.abs(x / hs) * 0.6, th * 1.15).add(new THREE.Vector3(0, 0, 0.004 * hs)));
  }
  const ids = P.map((p, i) => b.vertex(vtx(p, i % 2 ? shade(col, 0.8) : col, HEAD_W, SURF.hair)));
  for (let i = 0; i < n - 1; i++) {
    const a = ids[i * 2], c = ids[i * 2 + 1], d = ids[i * 2 + 3], e = ids[i * 2 + 2];
    b.quad(a, c, d, e);
    b.quad(a, e, d, c);
  }
}
