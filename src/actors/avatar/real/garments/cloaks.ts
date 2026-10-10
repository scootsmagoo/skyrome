/**
 * Cloaks for the realistic bodies: the lacerna and sagum (a cape pinned at the right shoulder, hanging down the
 * back) and the paenula (a closed bell with a hood, falling from the shoulders over the arms).
 *
 * Both hang from the shoulders over the body's wide silhouette (BodyProfile with the upper arms): a ring never
 * falls inside the shape a hand's breadth above it, so the cloth drops clear of the shoulder blades and the
 * hips; its folds are pillars (folds.ts) that deepen toward the hem; the lower edge is scalloped and a finger
 * thick (drape.slab). Triangle budget: about 900 for a cape, 1000 for a paenula.
 */
import * as THREE from 'three';
import { B } from '../../rig';
import { SURF, mixW, type Weights } from '../../SkinBuilder';
import { lerp, shade, smooth, srgb, type Ctx } from '../../build/common';
import type { Levels } from '../../build/body';
import { ellipsoid } from '../../build/garments';
import { slab, ticks } from './drape';
import { foldDepth, foldPhase, ridge } from './folds';
import type { BodyProfile } from './profile';

/** Radius of the cloth that hangs from the shoulders: the largest body radius between y and the shoulders (relaxing). */
function hangFrom(bp: BodyProfile, y: number, top: number, th: number, yMax: number): number {
  let r = bp.radius(Math.min(y, yMax), th);
  for (let k = 1; k <= 6; k++) {
    const yy = lerp(y, top, k / 6);
    if (yy > top) break;
    r = Math.max(r, bp.radius(Math.min(yy, yMax), th) * (1 - 0.01 * k));
  }
  return r;
}

export function buildRealCloak(ctx: Ctx, L: Levels, wide: BodyProfile) {
  const c = ctx.outfit.cloak;
  if (!c) return;
  if (c.kind === 'paenula') paenula(ctx, L, wide, c.color);
  else cape(ctx, L, wide, c.color, c.kind === 'sagum');
}

function cape(ctx: Ctx, L: Levels, bp: BodyProfile, color: THREE.Color, sagum: boolean) {
  const s = L.s;
  const seed = ctx.rng.next() * 10;
  const top = L.neckBase - 0.012 * s;
  const hem = sagum ? L.knee + 0.14 * s : L.knee - 0.04 * s;
  const yMax = bp.top - 0.05 * s;
  const folds = sagum ? 11 : 13;
  const amp = (sagum ? 0.026 : 0.02) * s;
  const T = (sagum ? 0.012 : 0.008) * s;
  // Columns sweep from the left shoulder, round the back, to the right shoulder: th = -PI/2 - a * span.
  const span = (v: number) => lerp(1.95, 1.2 + 0.1 * (sagum ? 1 : 0), smooth(0.05, 0.4, v));
  const pt = (u: number, v: number) => {
    const a = 2 * u - 1;
    const th = -Math.PI / 2 - a * span(v);
    const y = lerp(top, hem, v) - (v > 0.97 ? 0.012 * s * (1 - ridge(foldPhase(th, 1, folds, seed))) : 0);
    // Over the shoulders it hugs the body; lower down it hangs behind, flaring toward the hem.
    const gap = 0.012 * s + 0.085 * s * Math.pow(v, 1.15);
    let r = hangFrom(bp, y, top, th, yMax) + gap;
    r += amp * foldDepth(th, v, seed) * ridge(foldPhase(th, v, folds, seed)) * smooth(0.06, 0.3, v);
    return new THREE.Vector3(r * Math.cos(th), y, bp.centre(Math.min(y, yMax)) + r * Math.sin(th));
  };
  const weights = (u: number, v: number, p: THREE.Vector3): Weights => {
    const a = 2 * u - 1;
    let w: Weights = [B.chest, 1];
    if (v < 0.15) {
      const sideK = smooth(0.45, 0.95, Math.abs(a));
      w = mixW(w, [B[a > 0 ? 'shoulderR' : 'shoulderL'], 1], sideK * 0.7);
    } else {
      w = mixW([B.chest, 1], [B.spine, 1], smooth(0.15, 0.45, v));
      w = mixW(w, [B.hips, 1], smooth(0.4, 0.75, v));
      const legK = smooth(0.55, 1, v) * 0.35;
      if (legK > 0) w = mixW(w, p.x > 0 ? [B.thighL, 1] : [B.thighR, 1], legK);
    }
    return w;
  };
  slab(ctx, {
    us: ticks(ctx.hi ? 25 : 11),
    vs: ticks(ctx.hi ? 9 : 5, ctx.hi ? [0.03, 0.07, 0.11, 0.97] : [0.04]),
    thick: T * 0.5,
    back: ctx.hi,
    hint: (p) => new THREE.Vector3(p.x, 0, p.z - bp.centre(Math.min(p.y, yMax))).normalize(),
    axis: (v) => {
      const y = lerp(top, hem, v);
      return [0, y, bp.centre(Math.min(y, yMax))];
    },
    surf: SURF.wool,
    color: (u, v) => {
      const th = -Math.PI / 2 - (2 * u - 1) * span(v);
      return shade(color, 0.62 + 0.38 * ridge(foldPhase(th, v, folds, seed)) - 0.06 * smooth(0.9, 1, v));
    },
    at: pt,
    weights,
  });
  // Fibula on the right shoulder.
  const th = Math.PI / 2 + 0.75;
  const y = L.shTop - 0.005 * s;
  const r = bp.radius(y, th) + 0.01 * s;
  ellipsoid(ctx, new THREE.Vector3(r * Math.cos(th) - 0.01 * s, L.shTop - 0.01 * s, bp.centre(y) + r * Math.sin(th) + 0.02 * s), 0.016 * s, 0.016 * s, 0.008 * s, srgb('#c9a24f'), [B.chest, 0.6, B.shoulderR, 0.4], SURF.bronze);
}

function paenula(ctx: Ctx, L: Levels, bp: BodyProfile, color: THREE.Color) {
  const { b } = ctx;
  const s = L.s;
  const seed = ctx.rng.next() * 10;
  const yN = L.neckBase - 0.012 * s;
  const hem = L.hip - 0.14 * s;
  const yMax = bp.top - 0.05 * s;
  const seg = ctx.hi ? 40 : 12;
  const folds = 10;
  const amp = 0.03 * s;
  const tl = ctx.hi ? [0, 0.05, 0.11, 0.2, 0.33, 0.48, 0.63, 0.78, 0.9, 0.97, 1] : [0, 0.12, 0.45, 0.8, 1];
  const yAt = (t: number) => lerp(yN, hem, t);
  const radius = (th: number, t: number, inner: boolean) => {
    const y = yAt(t);
    let r = hangFrom(bp, y, yN, th, yMax) + 0.014 * s + 0.07 * s * Math.pow(t, 1.2);
    r += amp * foldDepth(th, t, seed) * ridge(foldPhase(th, t, folds, seed)) * smooth(0.12, 0.5, t);
    if (t > 0.975) r += 0.005 * s;
    return inner ? r - 0.0055 * s : r;
  };
  const ringPt = (th: number, t: number, inner = false) => {
    const y = yAt(t) - (t > 0.97 ? 0.013 * s * (1 - ridge(foldPhase(th, 1, folds, seed))) : 0);
    const r = radius(th, t, inner);
    return new THREE.Vector3(r * Math.cos(th), y, bp.centre(Math.min(y, yMax)) + r * Math.sin(th));
  };
  const weights = (th: number, t: number): Weights => {
    // Sides ride the upper arms so arm swings lift the cloak instead of piercing it.
    const side = Math.abs(Math.cos(th));
    let w: Weights = mixW([B.chest, 1], [B.spine, 1], smooth(0.3, 1, t) * 0.6);
    if (side > 0.5) w = mixW(w, [B[Math.cos(th) > 0 ? 'upperArmL' : 'upperArmR'], 1], smooth(0.5, 0.95, side) * lerp(0.15, 0.6, t));
    return w;
  };
  b.grid(
    seg,
    tl.length,
    true,
    (i, j, v) => {
      const th = (i / seg) * Math.PI * 2;
      const t = tl[j];
      const p = ringPt(th, t);
      // The front seam: a darker line down the middle.
      const seam = Math.abs(Math.cos(th)) < 0.05 && Math.sin(th) > 0;
      const cc = seam ? shade(color, 0.55) : shade(color, 0.62 + 0.38 * ridge(foldPhase(th, t, folds, seed)) - 0.08 * smooth(0.92, 1, t));
      v.x = p.x;
      v.y = p.y;
      v.z = p.z;
      v.r = cc.r;
      v.g = cc.g;
      v.b = cc.b;
      v.s = SURF.wool;
      v.w = weights(th, t);
    },
    'auto',
    (j) => {
      const y = yAt(tl[j]);
      return [0, y, bp.centre(Math.min(y, yMax))];
    },
  );
  // Inner lining at the hem, so the bell is not hollow from below.
  b.grid(
    seg,
    2,
    true,
    (i, j, v) => {
      const th = (i / seg) * Math.PI * 2;
      const p = ringPt(th, j === 0 ? 1 : 0.8, true);
      const cc = shade(color, 0.5);
      v.x = p.x;
      v.y = p.y;
      v.z = p.z;
      v.r = cc.r;
      v.g = cc.g;
      v.b = cc.b;
      v.s = SURF.wool;
      v.w = [B.chest, 0.4, B.spine, 0.6];
    },
    'auto',
    (j) => [0, lerp(hem, hem + 0.1, j), bp.centre(hem)],
  );
  b.flipTail(seg * 2);
  // Hood bunched behind the neck.
  ellipsoid(ctx, new THREE.Vector3(0, L.trap + 0.012 * s, bp.centre(L.trap) - bp.radius(L.trap, -Math.PI / 2) - 0.03 * s), 0.075 * s, 0.05 * s, 0.045 * s, shade(color, 0.9), [B.chest, 0.6, B.neck, 0.4], SURF.wool, 0.08);
}
