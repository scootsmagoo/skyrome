/**
 * Skirt shells over a realistic body: the procedural skirt loft (build/garments.ts buildSkirt: hem tilt,
 * fold noise, trims, pteruges strips, under-hem, lining, hips/thigh weights) refitted so every ring
 * stands off the body's measured silhouette (BodyProfile) instead of a superellipse.
 */
import { B } from '../../rig';
import { SURF, mixW, type Weights } from '../../SkinBuilder';
import { lerp, noise1, shade, smooth, type Ctx } from '../../build/common';
import type { Levels } from '../../build/body';
import type { SkirtSpec, SkirtSurface } from '../../build/garments';
import type { BodyProfile } from './profile';

/** What a skirt covers: the hide mask is computed from these. */
export interface SkirtCover {
  top: number;
  hem: (th: number) => number;
}

export interface BuiltSkirt {
  surface: SkirtSurface;
  cover: SkirtCover;
}

export function buildRealSkirt(ctx: Ctx, L: Levels, bp: BodyProfile, sp: SkirtSpec): BuiltSkirt {
  const { b } = ctx;
  const s = L.s;
  const seg = ctx.hi ? 28 : 12;
  const rowsN = ctx.hi ? (sp.overlay ? 11 : 8) : 4;
  const seed = ctx.rng.next() * 10;
  const yTop = bp.top - 0.2 * s;
  const hemAt = (th: number) => sp.hem + (sp.hemTilt ? sp.hemTilt(th) : 0) + 0.006 * s * noise1(th * 4, seed);
  /** Radius of the cloth surface at height y in direction th (t = 0 at the waist, 1 at the hem). */
  const ringRadius = (th: number, y: number, t: number, inner: boolean) => {
    const sn = Math.sin(th);
    const flareK = Math.pow(t, 1.3);
    const yy = Math.min(y, yTop);
    // The cloth's own fullness: more at the back, and in front of long skirts so strides stay covered.
    const front = sp.hem < L.knee ? 0.04 * s * Math.sin(Math.PI * Math.min(1, t * 1.3)) * Math.max(0, sn) : 0;
    let r = bp.radius(yy, th) + sp.thickness + sp.flare * (sn < 0 ? 1.25 : sn > 0 ? 1.1 : 1) * flareK + front;
    // Folds grow downward; they only ever push outwards from the base radius.
    const fold = Math.sin(th * sp.folds + seed + noise1(th * 2.3, seed) * 1.6);
    r += sp.foldAmp * (0.25 + 0.75 * t) * (0.5 + 0.5 * fold) * 1.4;
    if (inner) r -= 0.004 * s;
    return { r, fold };
  };
  const ringPoint = (th: number, t: number, inner: boolean) => {
    const y = lerp(sp.top, hemAt(th), t);
    const { r, fold } = ringRadius(th, y, t, inner);
    return { x: r * Math.cos(th), y, z: bp.centre(Math.min(y, yTop)) + r * Math.sin(th), fold };
  };
  const weights = (x: number, t: number, a: number): Weights => {
    // Thigh influence ramps in over the upper skirt so knees stay covered when they bend forward.
    const wt = smooth(0.05, 0.65, t) * sp.legK;
    const lat = x / Math.max(a, 1e-3);
    // A wide blend across the front/back centre keeps the cloth closed between the legs.
    const wl = smooth(-0.75, 0.75, lat);
    const w: Weights = [B.hips, 1 - wt, B.thighL, wt * wl, B.thighR, wt * (1 - wl)];
    if (t < 0.2) return mixW([B.spine, 0.3, B.hips, 0.7], w, smooth(0, 0.2, t));
    return w;
  };
  const halfWidth = (y: number) => bp.section(Math.min(y, yTop)).a + sp.flare;
  const colorAt = (th: number, t: number, fold: number, y: number) => {
    if (sp.overlay && y > sp.overlay.bottom) return sp.overlay.paint(y, th).color.clone();
    let c = shade(sp.color, 0.88 + 0.12 * (fold * 0.5 + 0.5) - 0.08 * t * (fold < -0.3 ? 1 : 0));
    if (sp.trim && y < hemAt(th) + 0.03 * s) c = sp.trim.clone();
    if (sp.strips) {
      const k = Math.sin(th * 22);
      if (k > 0.75) c = shade(sp.strips, 0.6);
    }
    return c;
  };
  // Rows run from the hem (j = 0) up to the waist. An armour overlay gets a pair of rows hugging its
  // lower edge so the edge is a clean ring, not a saw-tooth of vertex colours across the rows.
  const ov = sp.overlay && sp.overlay.bottom > sp.hem + 0.02 * s && sp.overlay.bottom < sp.top - 0.02 * s ? sp.overlay.bottom : null;
  const below = ov === null ? 0 : Math.max(2, Math.min(rowsN - 2, Math.round((rowsN * (ov - sp.hem)) / (sp.top - sp.hem))));
  const edgeGap = 0.003 * s;
  const rowT = (j: number, th: number) => {
    if (ov === null) return 1 - j / (rowsN - 1);
    const hem = hemAt(th);
    const y = j < below ? lerp(hem, ov - edgeGap, j / (below - 1)) : lerp(ov + edgeGap, sp.top, (j - below) / (rowsN - 1 - below));
    return Math.min(1, Math.max(0, (sp.top - y) / Math.max(1e-3, sp.top - hem)));
  };
  b.grid(
    seg,
    rowsN,
    true,
    (i, j, v) => {
      const th = (i / seg) * Math.PI * 2;
      const t = rowT(j, th);
      const p = ringPoint(th, t, false);
      const c = colorAt(th, t, p.fold, p.y);
      const over = sp.overlay && p.y > sp.overlay.bottom;
      const k = over ? 1.03 : 1;
      v.x = p.x * k;
      v.y = p.y;
      v.z = bp.centre(Math.min(p.y, yTop)) + (p.z - bp.centre(Math.min(p.y, yTop))) * k;
      v.r = c.r;
      v.g = c.g;
      v.b = c.b;
      v.s = over ? sp.overlay!.paint(p.y, th).surf : sp.surf;
      v.w = weights(p.x, t, halfWidth(p.y) + sp.flare * t);
    },
    'auto',
    (j) => {
      const y = lerp(sp.top, sp.hem, rowT(j, 0));
      return [0, y, bp.centre(Math.min(y, yTop))];
    },
  );
  // Inner lining for the lower part so the hem never looks hollow from below.
  const innerRows = ctx.hi ? 3 : 2;
  const inner = shade(sp.color, 0.55);
  b.grid(
    seg,
    innerRows,
    true,
    (i, j, v) => {
      const th = (i / seg) * Math.PI * 2;
      const t = 1 - (j / (innerRows - 1)) * 0.45;
      const p = ringPoint(th, t, true);
      v.x = p.x;
      v.y = p.y + (j === 0 ? 0.002 * s : 0);
      v.z = p.z;
      v.r = inner.r;
      v.g = inner.g;
      v.b = inner.b;
      v.s = sp.surf;
      v.w = weights(p.x, t, halfWidth(p.y) + sp.flare * t);
    },
    'auto',
    (j) => {
      const y = lerp(sp.top, sp.hem, 1 - (j / (innerRows - 1)) * 0.45);
      return [0, y, bp.centre(Math.min(y, yTop))];
    },
  );
  b.flipTail(seg * (innerRows - 1) * 2);
  if (sp.under) {
    // A band of the under-garment peeking below the hem.
    const uc = sp.under.color;
    b.grid(
      seg,
      2,
      true,
      (i, j, v) => {
        const th = (i / seg) * Math.PI * 2;
        const p = ringPoint(th, 1, true);
        const c0 = bp.centre(Math.min(p.y, yTop));
        v.x = p.x * 0.97;
        v.z = c0 + (p.z - c0) * 0.97;
        v.y = hemAt(th) - (j === 0 ? sp.under!.drop : -0.02 * s);
        const c = shade(uc, 0.9 + 0.1 * p.fold);
        v.r = c.r;
        v.g = c.g;
        v.b = c.b;
        v.s = sp.surf;
        v.w = weights(p.x, 1, halfWidth(p.y) + sp.flare);
      },
      'auto',
      (j) => [0, sp.hem - j * 0.01, 0],
    );
  }
  const surface: SkirtSurface = (x, y) => {
    // Search the front half for the ring point closest in x at this height.
    let best = -Infinity;
    let bestD = Infinity;
    for (let k = 0; k <= 24; k++) {
      const th = (k / 24) * Math.PI;
      const t = Math.min(1, Math.max(0, (sp.top - y) / Math.max(1e-3, sp.top - hemAt(th))));
      const p = ringPoint(th, t, false);
      const d = Math.abs(p.x - x);
      if (d < bestD) {
        bestD = d;
        best = p.z;
      }
    }
    return best;
  };
  return { surface, cover: { top: sp.top, hem: hemAt } };
}
