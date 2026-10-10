/**
 * Skirt shells over a realistic body: the procedural skirt loft (build/garments.ts buildSkirt: hem tilt,
 * trims, pteruges strips, under-hem, lining, hips/thigh weights) refitted so every ring stands off the body's
 * measured silhouette (BodyProfile) instead of a superellipse, with
 *   - cloth that hangs: a ring never falls inside the body shape a hand's breadth above it, so the cloth drops
 *     from the belly and the hips instead of hugging the crotch;
 *   - coherent folds (folds.ts): rounded pillars between creases that lean, deepen toward the hem, and make the
 *     hem scalloped (the cloth is longest on a crest);
 *   - a clean hem: a rolled edge of real thickness, closed to the lining, and a trim band whose edge is a
 *     crisp colour step (two rows a few millimetres apart).
 */
import { B } from '../../rig';
import { SURF, mixW, type Weights } from '../../SkinBuilder';
import { lerp, shade, smooth, type Ctx } from '../../build/common';
import type { Levels } from '../../build/body';
import type { SkirtSpec, SkirtSurface } from '../../build/garments';
import { foldDepth, foldPhase, ridge, vnoise } from './folds';
import type { BodyProfile } from './profile';

/** What a skirt covers: the hide mask is computed from these. */
export interface SkirtCover {
  top: number;
  hem: (th: number) => number;
}

export interface BuiltSkirt {
  surface: SkirtSurface;
  /** Back surface (z) at (x, y), for drapery laid over the back. */
  back: SkirtSurface;
  cover: SkirtCover;
}

export function buildRealSkirt(ctx: Ctx, L: Levels, bp: BodyProfile, sp: SkirtSpec): BuiltSkirt {
  const { b } = ctx;
  const s = L.s;
  const folded = sp.folds > 0 && sp.foldAmp > 0;
  const seg = ctx.hi ? Math.min(34, Math.max(24, Math.round(sp.folds * 4))) : 12;
  const seed = ctx.rng.next() * 10;
  const yTop = bp.top - 0.2 * s;
  const H = Math.max(0.05, sp.top - sp.hem);
  /** Fold ridge height (0 crease .. 1 crest) at angle th and depth t down the hang. */
  const ridgeAt = (th: number, t: number) => (folded ? ridge(foldPhase(th, t, sp.folds, seed)) : 0);
  const hemAt = (th: number) =>
    sp.hem + (sp.hemTilt ? sp.hemTilt(th) : 0) + 0.006 * s * vnoise(th * 4, seed) - (folded ? 0.014 * s * (1 - ridgeAt(th, 1)) * foldDepth(th, 1, seed) : 0);
  /** The body's radius for cloth that hangs from above: the largest of a few samples up the body, slightly relaxed. */
  const hangRadius = (y: number, th: number) => {
    let r = bp.radius(Math.min(y, yTop), th);
    if (sp.strips) return r;
    for (let k = 1; k <= 3; k++) {
      const yy = y + 0.09 * s * k;
      if (yy > sp.top) break;
      r = Math.max(r, bp.radius(Math.min(yy, yTop), th) * (1 - 0.012 * k));
    }
    return r;
  };
  /** Radius of the cloth surface at height y in direction th (t = 0 at the waist, 1 at the hem). */
  const ringRadius = (th: number, y: number, t: number, inner: boolean) => {
    const sn = Math.sin(th);
    const flareK = Math.pow(t, 1.3);
    // The cloth's own fullness: more at the back, and in front of long skirts so strides stay covered.
    const front = sp.hem < L.knee ? 0.04 * s * Math.sin(Math.PI * Math.min(1, t * 1.3)) * Math.max(0, sn) : 0;
    const rh = ridgeAt(th, t);
    let r = hangRadius(y, th) + sp.thickness + sp.flare * (sn < 0 ? 1.25 : sn > 0 ? 1.1 : 1) * flareK + front;
    // Folds only ever push outwards from the base radius, and the hem rolls.
    if (folded) r += sp.foldAmp * foldDepth(th, t, seed) * rh * 1.5;
    if (!sp.strips) r += 0.006 * s * smooth(0.975, 1, t);
    if (inner) r -= 0.0055 * s;
    return { r, fold: rh * 2 - 1 };
  };
  const ringPoint = (th: number, t: number, inner: boolean) => {
    const y = lerp(sp.top, hemAt(th), t);
    const { r, fold } = ringRadius(th, y, t, inner);
    return { x: r * Math.cos(th), y, z: bp.centre(Math.min(y, yTop)) + r * Math.sin(th), fold };
  };
  const weights = (x: number, t: number, a: number): Weights => {
    // Thigh influence ramps in over the upper skirt so knees stay covered when they bend forward.
    const wt = smooth(0.05, sp.legK > 0.85 ? 0.4 : 0.65, t) * sp.legK;
    const lat = x / Math.max(a, 1e-3);
    // A wide blend across the front/back centre keeps the cloth closed between the legs.
    const wl = smooth(-0.75, 0.75, lat);
    const w: Weights = [B.hips, 1 - wt, B.thighL, wt * wl, B.thighR, wt * (1 - wl)];
    if (t < 0.2) return mixW([B.spine, 0.3, B.hips, 0.7], w, smooth(0, 0.2, t));
    return w;
  };
  const halfWidth = (y: number) => bp.section(Math.min(y, yTop)).a + sp.flare;
  const trimH = sp.trim ? Math.min(0.05 * s, H * 0.2) : 0;
  const colorAt = (th: number, t: number, ridgeK: number, y: number) => {
    if (sp.overlay && y > sp.overlay.bottom) return sp.overlay.paint(y, th).color.clone();
    // Creases are in shade, crests catch the light; the hem edge a touch darker with wear.
    let c = shade(sp.color, 0.64 + 0.36 * (ridgeK * 0.5 + 0.5) - 0.05 * smooth(0.9, 1, t));
    if (sp.trim && y < hemAt(th) + trimH) c = shade(sp.trim, 0.9 + 0.1 * (ridgeK * 0.5 + 0.5));
    if (sp.strips) {
      const k = Math.sin(th * 22);
      if (k > 0.75) c = shade(sp.strips, 0.6);
    }
    return c;
  };
  // Rows run from the hem (j = 0) up to the waist, as t from 1 down to 0. An armour overlay gets a pair of rows
  // hugging its lower edge so the edge is a clean ring, not a saw-tooth of vertex colours across the rows.
  const ov = sp.overlay && sp.overlay.bottom > sp.hem + 0.02 * s && sp.overlay.bottom < sp.top - 0.02 * s ? sp.overlay.bottom : null;
  const tl: number[] = [1];
  if (ctx.hi && !sp.strips) {
    tl.push(0.989);
    if (trimH > 0) {
      // A crisp trim edge: one row just inside the band, one just outside.
      const te = trimH / H;
      tl.push(1 - te + 0.0025 / H, 1 - te - 0.0025 / H);
    } else tl.push(0.95);
    for (const t of [0.86, 0.72, 0.52, 0.27, 0]) if (t < tl[tl.length - 1] - 0.04) tl.push(t);
    if (tl[tl.length - 1] !== 0) tl.push(0);
  } else {
    const n = ctx.hi ? 7 : 4;
    for (let j = 1; j < n; j++) tl.push(1 - j / (n - 1));
  }
  const rowsN = ov === null ? tl.length : ctx.hi ? 11 : 4;
  const below = ov === null ? 0 : Math.max(2, Math.min(rowsN - 2, Math.round((rowsN * (ov - sp.hem)) / (sp.top - sp.hem))));
  const edgeGap = 0.003 * s;
  const rowT = (j: number, th: number) => {
    if (ov === null) return tl[j];
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
  // Inner lining for the lower part so the hem never looks hollow from below. Its first row sits at the hem's
  // height, a cloth-thickness inside the outer edge.
  const innerRows = 2;
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
      v.y = p.y;
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
  const back: SkirtSurface = (x, y) => {
    let best = Infinity;
    let bestD = Infinity;
    for (let k = 0; k <= 24; k++) {
      const th = Math.PI + (k / 24) * Math.PI;
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
  return { surface, back, cover: { top: sp.top, hem: hemAt } };
}
