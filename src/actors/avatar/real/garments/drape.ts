/**
 * Draped cloth for the realistic bodies: the toga as one continuous mantle (cloth sheet with thickness and long
 * coherent folds, hung on the real body's surface, BodyProfile), and the `slab` sheet builder the cloaks share.
 *
 * A `slab` is a cloth sheet: a grid of surface points (u across, v along), a front face, an optional back
 * face (for cloth that hangs free) and a rim round the border that gives the edge its thickness. Rows
 * and columns may be spaced unevenly, so a trim band can end in a crisp colour step.
 */
import * as THREE from 'three';
import { B } from '../../rig';
import { SURF, mixW, type Surf, type V as Vtx, type Weights } from '../../SkinBuilder';
import { lerp, shade, smooth, type Ctx } from '../../build/common';
import type { Levels } from '../../build/body';
import { foldDepth, foldPhase, ridge } from './folds';
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
  let vote = 0;
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
      vote += n.dot(hintAt(P[j * nu + i], o.us[i], o.vs[j]));
      N.push(n);
    }
  // One sign for the whole sheet (by a vote against the hint): a per-point choice flips wherever the cloth turns
  // edge-on to the hint (a hem that tucks under), which tears holes in the winding.
  if (vote < 0) for (const n of N) n.negate();
  const centre = new THREE.Vector3();
  for (const p of P) centre.add(p);
  centre.multiplyScalar(1 / P.length);
  const hint0 = fixedHint ?? hintAt(centre, 0.5, 0.5);
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const nq = new THREE.Vector3();
  /** One face of the sheet. Each quad is wound to look along the surface normal (`dir` 1) or against it (-1): a
   * single winding for the whole grid would leave culled holes wherever the cloth folds over itself. */
  const face = (offset: number, dir: 1 | -1) => {
    const base = b.vertexCount;
    const V: Vtx = { x: 0, y: 0, z: 0, r: 1, g: 1, b: 1, w: [B.hips, 1], s: surf };
    const at = (k: number) => P[k].clone().addScaledVector(N[k], -offset);
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const k = j * nu + i;
        const u = o.us[i];
        const w = o.vs[j];
        const q = at(k);
        V.x = q.x;
        V.y = q.y;
        V.z = q.z;
        const c = o.color(u, w);
        // Shade where cloth meets what lies under it: a soft contact shadow round the border.
        const d = Math.min(u, 1 - u, w, 1 - w);
        c.multiplyScalar(1 - 0.22 * Math.exp(-d / 0.06));
        V.r = c.r;
        V.g = c.g;
        V.b = c.b;
        V.w = o.weights(u, w, P[k]);
        b.vertex(V);
      }
    for (let j = 0; j < nv - 1; j++)
      for (let i = 0; i < nu - 1; i++) {
        const k = j * nu + i;
        const a = base + k;
        const bb = a + 1;
        const d = a + nu;
        const c = d + 1;
        // Normal of (a, d, c) against the surface normals at the quad's corners.
        e1.subVectors(P[k + nu], P[k]);
        e2.subVectors(P[k + nu + 1], P[k]);
        nq.crossVectors(e1, e2);
        const sn = nq.dot(N[k]) + nq.dot(N[k + 1]) + nq.dot(N[k + nu]) + nq.dot(N[k + nu + 1]);
        if (sn * dir >= 0) b.quad(a, d, c, bb);
        else b.quad(a, bb, c, d);
      }
  };
  face(0, 1);
  if (o.back) face(o.thick, -1);
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

/** Radius of the cloth that hangs from the shoulders: the largest body radius between y and the shoulders (relaxing). */
export function hangFrom(bp: BodyProfile, y: number, top: number, th: number, yMax: number): number {
  let r = bp.radius(Math.min(y, yMax), th);
  for (let k = 1; k <= 6; k++) {
    const yy = lerp(y, top, k / 6);
    if (yy > top) break;
    r = Math.max(r, bp.radius(Math.min(yy, yMax), th) * (1 - 0.01 * k));
  }
  return r;
}

export interface TogaParts {
  ctx: Ctx;
  L: Levels;
  /** The body's own silhouette, and the wide one (with the upper arms) for the cloth over the left arm. */
  bp: BodyProfile;
  wide: BodyProfile;
  /** Radius of the skirt's outer surface at height y in direction th: the mantle stays outside it. */
  skirtR: (th: number, y: number) => number;
}

/**
 * The toga above the skirt, as ONE sheet wrapped round the torso (a closed ring, slit under the right arm). Its top
 * edge is the toga's line: over the left shoulder and the whole back (down to the right armpit), and in front the
 * diagonal of the balteus from the left shoulder across the chest to the right hip. Its hem hangs lowest in front
 * (the sinus, with the praetexta border along it) and a little at the back (the tail of the cloth). The cloth
 * hangs from the shoulders over the left arm, rides over the chest in pillar folds, and swells along the diagonal
 * (the umbo).
 */
export function buildTogaDrapery({ ctx, L, bp, wide, skirtR }: TogaParts) {
  const t = ctx.outfit.toga!;
  const s = L.s;
  const seed = ctx.rng.next() * 10;
  const trim = t.trim ?? null;
  const yMax = wide.top - 0.05 * s;
  const folds = 9;
  const GAP = 0.2;
  const topNeck = L.neckBase - 0.012 * s;
  const th0 = Math.PI + GAP / 2;
  const thAt = (u: number) => th0 + u * (Math.PI * 2 - GAP);
  const topY = (c: number, sn: number) => {
    // c = cos th (+1 left side, -1 right), sn = sin th (+1 front, -1 back).
    const front = lerp(topNeck, L.waist - 0.01 * s, Math.min(1, Math.max(0, (0.5 - c) / 1.4)));
    const back = lerp(topNeck, L.armpit - 0.02 * s, smooth(-0.15, -0.95, c));
    const w = smooth(-0.25, 0.25, sn);
    return lerp(back, front, w);
  };
  const hemY = (c: number, sn: number) => {
    const swag = smooth(-0.1, 0.75, sn) * (0.45 + 0.55 * smooth(-0.9, 0.35, c));
    const tail = smooth(-0.2, -0.9, sn) * 0.5;
    return L.waist - 0.02 * s - 0.27 * s * swag - 0.14 * s * tail;
  };
  const trimV = trim ? 0.05 * s / (0.22 * s) : 2;
  const pt = (u: number, v: number) => {
    const th = thAt(u);
    const c = Math.cos(th);
    const sn = Math.sin(th);
    const top = topY(c, sn);
    const hem = hemY(c, sn);
    const y = lerp(top, Math.min(hem, top - 0.05 * s), v) - (v > 0.97 ? 0.012 * s * (1 - ridge(foldPhase(th, 1, folds, seed))) : 0);
    const k = smooth(-0.1, -0.75, c);
    const hang = lerp(hangFrom(wide, y, top, th, yMax), bp.radius(Math.min(y, yMax), th), k);
    const gap = 0.02 * s + 0.05 * s * Math.pow(v, 1.1);
    let r = hang + gap;
    // Pillar folds that lean as they fall; the front chest gets the umbo's swell along the diagonal edge.
    r += 0.052 * s * foldDepth(th, v, seed) * ridge(foldPhase(th, v, folds, seed)) * smooth(0.02, 0.2, v);
    r += 0.022 * s * smooth(0, 0.25, sn) * Math.exp(-Math.pow((v - 0.14) / 0.1, 2));
    // The rolled top lip of the diagonal edge.
    r += 0.01 * s * smooth(-0.1, 0.4, sn) * Math.exp(-Math.pow(v / 0.035, 2));
    // Never inside the skirt below the waist (a fold of it must not poke through).
    // (a crest of the skirt between two columns must not poke through either: sample a little to both sides.)
    const sr = Math.max(skirtR(th, y), skirtR(th - 0.1, y), skirtR(th + 0.1, y));
    r = lerp(r, Math.max(r, sr + 0.026 * s), smooth(0.05, 0.3, v));
    const zc = bp.centre(Math.min(y, yMax));
    const p = new THREE.Vector3(r * c, y, zc + r * sn);
    return p;
  };
  const weights = (u: number, v: number, p: THREE.Vector3): Weights => {
    const y = p.y;
    let w: Weights = y > L.chest ? [B.chest, 1] : y > L.waist ? mixW([B.chest, 1], [B.spine, 1], smooth(L.chest, L.waist, y)) : mixW([B.spine, 1], [B.hips, 1], smooth(L.waist, L.waist - 0.12 * s, y));
    const c = Math.cos(thAt(u));
    // Below the waist the cloth lies on the skirt: it takes the skirt's thigh weights, or a stride (or the idle
    // stance) would move the skirt through it.
    const hang = Math.min(1, Math.max(0, (L.waist + 0.02 * s - y) / (L.waist - L.ankle)));
    const wt = smooth(0.05, 0.4, hang) * 0.92;
    if (wt > 0) {
      const wl = smooth(-0.75, 0.75, p.x / (0.17 * s));
      w = mixW(w, [B.thighL, wl, B.thighR, 1 - wl], wt);
    }
    // Over the left arm the cloth rides the shoulder and the upper arm, so a swing lifts it instead of piercing it.
    if (c > 0.35) w = mixW(w, [v < 0.25 ? B.shoulderL : B.upperArmL, 1], smooth(0.35, 0.95, c) * 0.55);
    return w;
  };
  slab(ctx, {
    us: ticks(ctx.hi ? 30 : 12),
    vs: ticks(ctx.hi ? 10 : 5, [0.04, 0.12, ...(trim ? [1 - trimV - 0.004, 1 - trimV + 0.004] : [])]),
    thick: 0.006 * s,
    // The mantle lies on the body: its inside is never seen (the rim closes the edge), so no back face.
    hint: (p) => new THREE.Vector3(p.x, 0, p.z - bp.centre(Math.min(p.y, yMax))).normalize(),
    axis: (v) => {
      const y = lerp(L.shoulder, L.waist - 0.1 * s, v);
      return [0, y, bp.centre(Math.min(y, yMax))];
    },
    surf: SURF.wool,
    color: (u, v) => {
      const th = thAt(u);
      const sn = Math.sin(th);
      const c = Math.cos(th);
      if (trim && ((v > 1 - trimV && sn > -0.1) || (v < 0.03 && sn > 0.2 && c < 0.5))) return shade(trim, 0.8 + 0.2 * ridge(foldPhase(th, v, folds, seed)));
      return shade(t.color, 0.5 + 0.5 * ridge(foldPhase(th, v, folds, seed)) - 0.05 * smooth(0.9, 1, v));
    },
    at: pt,
    weights,
  });
}
