/**
 * Draped cloth for the realistic bodies: the toga's balteus, umbo, sinus and lacinias, as cloth sheets with
 * thickness and long coherent folds, laid on the real body's surface (BodyProfile) instead of rolled tubes.
 *
 * A `slab` is a cloth sheet: a grid of surface points (u across, v along), a front face, an optional back
 * face (for cloth that hangs free) and a rim round the border that gives the edge its thickness. Rows
 * and columns may be spaced unevenly, so a trim band can end in a crisp colour step.
 */
import * as THREE from 'three';
import { B } from '../../rig';
import { SURF, mixW, type Surf, type Weights } from '../../SkinBuilder';
import { lerp, shade, smooth, type Ctx } from '../../build/common';
import type { Levels } from '../../build/body';
import { ridge, vnoise } from './folds';
import type { BodyProfile } from './profile';

export interface SlabOpts {
  /** Column and row positions in 0..1 (u across, v along). */
  us: number[];
  vs: number[];
  /** Surface point of the front face. */
  at: (u: number, v: number) => THREE.Vector3;
  /** Direction the front face looks (roughly; the real normals come from the surface), or per point. */
  hint: THREE.Vector3 | ((p: THREE.Vector3, u: number, v: number) => THREE.Vector3);
  /** For wrapped cloth: a point inside it at each row (v), so faces are wound away from the body. Default: behind the hint. */
  axis?: (v: number) => [number, number, number];
  /** Cloth thickness (m): the rim's width, and the back face's distance. */
  thick: number;
  /** Also build the back face (cloth that hangs free of the body). */
  back?: boolean;
  color: (u: number, v: number) => THREE.Color;
  surf?: Surf;
  weights: (u: number, v: number, p: THREE.Vector3) => Weights;
}

/** Cloth sheet: front face, optional back face, thickness rim. */
export function slab(ctx: Ctx, o: SlabOpts) {
  const { b } = ctx;
  const nu = o.us.length;
  const nv = o.vs.length;
  const surf = o.surf ?? SURF.wool;
  const fixedHint = o.hint instanceof THREE.Vector3 ? o.hint : null;
  const hintAt = (p: THREE.Vector3, u: number, v: number) => (fixedHint ?? (o.hint as (p: THREE.Vector3, u: number, v: number) => THREE.Vector3)(p, u, v));
  const P: THREE.Vector3[] = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) P.push(o.at(o.us[i], o.vs[j]));
  // Surface normals from the grid, turned to face the hint.
  const N: THREE.Vector3[] = [];
  const du = new THREE.Vector3();
  const dv = new THREE.Vector3();
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = P[j * nu + Math.max(0, i - 1)];
      const c = P[j * nu + Math.min(nu - 1, i + 1)];
      const d = P[Math.max(0, j - 1) * nu + i];
      const e = P[Math.min(nv - 1, j + 1) * nu + i];
      du.subVectors(c, a);
      dv.subVectors(e, d);
      const n = new THREE.Vector3().crossVectors(du, dv).normalize();
      if (n.dot(hintAt(P[j * nu + i], o.us[i], o.vs[j])) < 0) n.negate();
      N.push(n);
    }
  const centre = new THREE.Vector3();
  for (const p of P) centre.add(p);
  centre.multiplyScalar(1 / P.length);
  const hint0 = fixedHint ?? hintAt(centre, 0.5, 0.5);
  const behind = () => [centre.x - hint0.x, centre.y - hint0.y, centre.z - hint0.z] as [number, number, number];
  const face = (offset: number, flipWinding: boolean) => {
    b.grid(
      nu,
      nv,
      false,
      (i, j, v) => {
        const k = j * nu + i;
        const u = o.us[i];
        const w = o.vs[j];
        v.x = P[k].x - N[k].x * offset;
        v.y = P[k].y - N[k].y * offset;
        v.z = P[k].z - N[k].z * offset;
        const c = o.color(u, w);
        // Shade where cloth meets what lies under it: a soft contact shadow round the border.
        const d = Math.min(u, 1 - u, w, 1 - w);
        c.multiplyScalar(1 - 0.22 * Math.exp(-d / 0.06));
        v.r = c.r;
        v.g = c.g;
        v.b = c.b;
        v.s = surf;
        v.w = o.weights(u, w, P[k]);
      },
      'auto',
      (j) => {
        if (o.axis) return o.axis(o.vs[j]);
        return flipWinding ? ([centre.x + hint0.x, centre.y + hint0.y, centre.z + hint0.z] as [number, number, number]) : behind();
      },
    );
    // Wrapped cloth is wound away from its axis by the vote; the back face looks the other way.
    if (flipWinding && o.axis) b.flipTail((nu - 1) * (nv - 1) * 2);
  };
  face(0, false);
  if (o.back) face(o.thick, true);
  // The rim: the border path, a row at the front face and a row at the back face.
  const border: number[] = [];
  for (let i = 0; i < nu; i++) border.push(i);
  for (let j = 1; j < nv; j++) border.push(j * nu + nu - 1);
  for (let i = nu - 2; i >= 0; i--) border.push((nv - 1) * nu + i);
  for (let j = nv - 2; j >= 1; j--) border.push(j * nu);
  const ij = (k: number) => [k % nu, Math.floor(k / nu)] as const;
  b.grid(
    border.length,
    2,
    true,
    (c, r, v) => {
      const k = border[c];
      const [i, j] = ij(k);
      const off = r === 0 ? 0 : o.thick;
      v.x = P[k].x - N[k].x * off;
      v.y = P[k].y - N[k].y * off;
      v.z = P[k].z - N[k].z * off;
      // The rim is a shade darker: cloth edges catch less light.
      const col = shade(o.color(o.us[i], o.vs[j]), 0.9);
      v.r = col.r;
      v.g = col.g;
      v.b = col.b;
      v.s = surf;
      v.w = o.weights(o.us[i], o.vs[j], P[k]);
    },
    'auto',
    () => [centre.x, centre.y, centre.z],
  );
}

/** Rows or columns spaced evenly, plus extra ticks (e.g. either side of a trim edge, a few millimetres apart). */
export function ticks(n: number, extra: number[] = []): number[] {
  const t: number[] = [];
  for (let i = 0; i < n; i++) t.push(i / (n - 1));
  for (const e of extra) if (e > 0 && e < 1) t.push(e);
  t.sort((a, c) => a - c);
  return t.filter((x, i) => i === 0 || x - t[i - 1] > 1e-4);
}

export interface TogaParts {
  ctx: Ctx;
  L: Levels;
  bp: BodyProfile;
  /** Front surface (z) of the skirt at (x, y): drapery stays outside it. */
  skirt: (x: number, y: number) => number;
  /** Back surface (z) of the skirt. */
  skirtBack: (x: number, y: number) => number;
  /** A palla (matron's shawl) instead of the toga: the same drapery, shorter, over a stola or tunic skirt. */
  palla?: boolean;
}

/** The toga's drapery over the long body: balteus with umbo, sinus, front and back lacinia. */
export function buildTogaDrapery({ ctx, L, bp, skirt, skirtBack, palla }: TogaParts) {
  const t = (palla ? ctx.outfit.palla : ctx.outfit.toga)!;
  const s = L.s;
  const seed = ctx.rng.next() * 10;
  const trim = t.trim ?? null;
  const col = (k: number, edge?: boolean) => (edge && trim ? shade(trim, 0.92 + 0.08 * k) : shade(t.color, 0.5 + 0.5 * k));
  /** Point on the body's front (side = 1) or back (-1) at (x, y), `out` metres off the skin. */
  const onBody = (x: number, y: number, out: number, side = 1) => {
    // The angle whose surface point lies at this x: a few fixed-point steps of th = acos(x / r(th)).
    const a = bp.section(y).a + 0.01 * s;
    let th0 = Math.PI / 2 - Math.asin(Math.max(-0.98, Math.min(0.98, x / a)));
    for (let k = 0; k < 3; k++) {
      const rr = bp.radius(y, side > 0 ? th0 : -th0);
      th0 = Math.acos(Math.max(-0.98, Math.min(0.98, x / Math.max(rr, 1e-3))));
    }
    const th = side > 0 ? th0 : -th0;
    const [bx, bz] = bp.point(y, th);
    const zc = bp.centre(y);
    const r = Math.hypot(bx, bz - zc) || 1;
    const k = (r + out) / r;
    return new THREE.Vector3(bx * k, y, zc + (bz - zc) * k);
  };
  const front = new THREE.Vector3(0, 0.15, 1).normalize();
  const backDir = new THREE.Vector3(0, 0.1, -1).normalize();

  // ---- Balteus: the gathered band from the left shoulder across the chest to the right hip, pleated along its
  // length, with the umbo (a pouch of cloth pulled up over it) as a swelling at the chest.
  const bx0 = 0.105 * s;
  const by0 = L.shoulder + 0.012 * s;
  const bx1 = -0.17 * s;
  const by1 = L.waist - 0.02 * s;
  const bdx = bx1 - bx0;
  const bdy = by1 - by0;
  const blen = Math.hypot(bdx, bdy);
  const ax = -bdy / blen; // across the band, in the plane of the chest
  const ay = bdx / blen;
  const bw = (u: number) => 0.058 * s * (0.62 + 0.38 * smooth(0, 0.3, u)) * (1 + 0.5 * Math.exp(-Math.pow((u - 0.5) / 0.16, 2))) + 0.012 * s * smooth(0.7, 1, u);
  const chestW = (y: number): Weights => (y > L.chest ? [B.chest, 1] : y > L.waist ? [B.chest, 0.4, B.spine, 0.6] : [B.spine, 0.4, B.hips, 0.6]);
  slab(ctx, {
    us: ticks(ctx.hi ? 13 : 6),
    vs: ticks(ctx.hi ? 6 : 3),
    thick: 0.007 * s,
    hint: front,
    at: (u, v) => {
      const w = (v - 0.5) * 2 * bw(u);
      // The band wanders a little; the pouch pulls the lower edge down.
      const wander = 0.006 * s * vnoise(u * 4, seed);
      const x = bx0 + bdx * u + ax * w + wander;
      const y = by0 + bdy * u + ay * w - 0.02 * s * Math.exp(-Math.pow((u - 0.5) / 0.16, 2)) * (1 - v);
      const pleat = 0.012 * s * ridge(v * 2.5 * Math.PI + u * 3 + seed) * smooth(0, 0.2, u);
      const umbo = 0.026 * s * Math.exp(-Math.pow((u - 0.5) / 0.15, 2)) * Math.sin(Math.PI * Math.min(1, v * 0.9 + 0.1));
      return onBody(x, Math.min(y, bp.top - 0.15 * s), 0.046 * s + pleat + umbo);
    },
    color: (u, v) => {
      const trimEdge = !!trim && v > 0.92 && false;
      return col(0.55 + 0.45 * ridge(v * 2.5 * Math.PI + u * 3 + seed) - 0.12 * Math.exp(-Math.pow((u - 0.5) / 0.2, 2)) * (1 - v), trimEdge);
    },
    weights: (u, v, p) => (u < 0.12 ? mixW([B.chest, 0.6, B.shoulderL, 0.4], chestW(p.y), smooth(0, 0.12, u)) : chestW(p.y)),
  });

  // ---- Sinus: the great curve of cloth from the right hip across the belly, hanging free, up to the left forearm.
  const top = (u: number) => {
    const x = lerp(-0.17 * s, 0.215 * s, u);
    const y = lerp(L.waist - 0.04 * s, L.elbow - 0.03 * s, u);
    if (u < 0.85) return onBody(x, Math.max(y, L.crotch + 0.02 * s), 0.046 * s);
    const p = new THREE.Vector3(x, y, 0.06 * s + (u - 0.85) * 0.5 * s);
    const q = onBody(0.85 * 0.215 * s + 0.15 * -0.17 * s, L.waist, 0.046 * s);
    p.z = Math.max(p.z, q.z + (0.03 * s * (u - 0.85)) / 0.15);
    return p;
  };
  const sagK = palla ? 0.2 : 0.3;
  const sag = (u: number) => sagK * s * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 0.85);
  const sinusW = (u: number, v: number): Weights => {
    const wt = smooth(0.2, 1, v) * 0.35;
    let w: Weights = [B.hips, 1 - wt, B.thighL, wt * u, B.thighR, wt * (1 - u)];
    if (u > 0.7) w = mixW(w, [B.forearmL, 1], smooth(0.7, 1, u) * lerp(1, 0.6, v));
    return w;
  };
  const trimV = trim ? (0.045 * s) / (sagK * s + 0.04 * s) : 0;
  const sinusFolds = 5;
  slab(ctx, {
    us: ticks(ctx.hi ? 15 : 7),
    vs: ticks(ctx.hi ? 6 : 3, [0.05, 0.11, ...(trim ? [1 - trimV - 0.004, 1 - trimV + 0.004] : [])]),
    thick: 0.007 * s,
    back: ctx.hi,
    hint: front,
    at: (u, v) => {
      const a = top(u);
      const y = a.y - v * (sag(u) + 0.04 * s);
      let z = Math.max(a.z + 0.01 * s, skirt(a.x, y) + 0.03 * s) ;
      // The hanging sheet: belly out in the middle, long pillar folds that deepen toward the lower edge.
      // The top edge is folded over on itself: a rolled lip along the attachment line.
      z += 0.026 * s * Math.sin(Math.PI * v) + 0.034 * s * v * ridge(u * sinusFolds * Math.PI + v * 0.5 + seed) * smooth(0, 0.15, u) * (1 - smooth(0.88, 1, u));
      z += 0.016 * s * Math.exp(-Math.pow((v - 0.07) / 0.05, 2));
      return new THREE.Vector3(a.x, y, z);
    },
    color: (u, v) => {
      const edge = !!trim && v > 1 - trimV;
      return col(0.55 + 0.45 * ridge(u * sinusFolds * Math.PI + v * 0.5 + seed) * v + 0.45 * (1 - v) * 0.7 - 0.05 * v, edge);
    },
    weights: sinusW,
  });

  // ---- Lacinia: the end of the toga hanging from the left shoulder down the front to mid-shin,
  // and the matching fall down the back, each with its own pillar folds and the border down the outer edge.
  const laciniaW = (v: number): Weights => (v < 0.25 ? [B.chest, 1] : v < 0.55 ? [B.chest, 0.3, B.hips, 0.7] : [B.hips, 0.6, B.thighL, 0.4]);
  const colEdge = trim ? [0.76, 0.78] : [];
  slab(ctx, {
    us: ticks(ctx.hi ? 13 : 4, colEdge),
    vs: ticks(ctx.hi ? 10 : 4),
    thick: 0.007 * s,
    hint: front,
    at: (u, v) => {
      // The end of the cloth: a long strip whose hem hangs on the slant and whose edges wander a little.
      const yEnd = L.knee - (palla ? 0.02 : 0.14) * s - 0.07 * s * u + 0.02 * s * vnoise(u * 3, seed);
      const y = lerp(L.shoulder + 0.005 * s, yEnd, v);
      const x = lerp(0.05 * s, 0.2 * s, u) + v * 0.02 * s + 0.008 * s * v * vnoise(v * 3 + u * 2, seed + 1);
      const yy = Math.max(y, L.crotch + 0.02 * s);
      const base = onBody(x, yy, 0.052 * s);
      let z = base.z;
      if (y < L.waist) z = Math.max(z, skirt(x, y) + 0.026 * s);
      z += 0.032 * s * v * ridge(u * 3 * Math.PI + v * 1.2 + seed * 2) + 0.006 * s * v;
      return new THREE.Vector3(x, y, z);
    },
    color: (u, v) => col(0.4 + 0.6 * ridge(u * 3 * Math.PI + v * 1.2 + seed * 2), !!trim && u > 0.77),
    weights: (u, v) => laciniaW(v),
  });
  slab(ctx, {
    us: ticks(ctx.hi ? 13 : 4),
    vs: ticks(ctx.hi ? 11 : 4),
    thick: 0.007 * s,
    hint: backDir,
    at: (u, v) => {
      const yEnd = L.knee - (palla ? 0.22 : 0.12) * s + 0.06 * s * u + 0.02 * s * vnoise(u * 3 + 5, seed);
      const y = lerp(L.shTop - 0.01 * s, yEnd, v);
      const x = lerp(0.0, 0.2 * s, u) - v * 0.03 * s + 0.01 * s * v * vnoise(v * 3 + u * 2, seed + 2);
      const yy = Math.max(y, L.crotch + 0.02 * s);
      const base = onBody(x, yy, 0.046 * s, -1);
      let z = base.z;
      if (y < L.waist) z = Math.min(z, skirtBack(x, y) - 0.022 * s);
      z -= 0.034 * s * v * ridge(u * 3.5 * Math.PI + v * 0.8 + seed * 3) + 0.006 * s * v;
      return new THREE.Vector3(x, y, z);
    },
    color: (u, v) => col(0.4 + 0.6 * ridge(u * 3.5 * Math.PI + v * 0.8 + seed * 3)),
    weights: (u, v) => (v < 0.3 ? [B.chest, 0.7, B.spine, 0.3] : v < 0.55 ? [B.spine, 0.4, B.hips, 0.6] : [B.hips, 0.75, B.thighL, 0.125, B.thighR, 0.125]),
  });
}
