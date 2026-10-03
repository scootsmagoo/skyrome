/**
 * Armor: body-armor rules for the torso/arm/leg lofts (lorica segmentata hoops, hamata mail,
 * squamata scales, leather and padded linen, manicae, greaves) and rigid pieces built as extra
 * geometry (segmentata shoulder lames, mail shoulder doubling, the retiarius' galerus, the
 * provocator's cardiophylax) and every helmet type, weighted to the head bone.
 */
import * as THREE from 'three';
import type { HelmetKind } from '../../appearance';
import { B } from '../rig';
import { SURF, mixW, type Surf, type V, type Weights } from '../SkinBuilder';
import { clamp01, gauss, lerp, shade, smooth, srgb, type Ctx, type Paint } from './common';
import type { Levels, TorsoProfile } from './body';
import { torsoPoint } from './body';
import type { HeadFrame } from './head';
import { FEAT } from './head';

export interface EdgePaint extends Paint {
  edges?: number[];
}

const IRON = srgb('#8a9098');
const IRON_DARK = srgb('#4d5258');
const BRASS = srgb('#b89a55');
const BRONZE_C = srgb('#a8823f');
const LEATHER = srgb('#5d4029');
const LINEN = srgb('#d9cfb8');
const GOLD = srgb('#d8b45a');

function metalColor(ctx: Ctx) {
  return ctx.outfit.armor.body?.metal === 'bronze' ? BRONZE_C : IRON;
}
function metalSurf(ctx: Ctx): Surf {
  return ctx.outfit.armor.body?.metal === 'bronze' ? SURF.bronze : SURF.iron;
}

const isGladiator = (ctx: Ctx) => !ctx.outfit.armor.body && !!ctx.outfit.subligaculum;

// ------------------------------------------------------------------ torso

/** Segmentata girth hoops: [bottom, top] and the number of bands. */
function segBands(L: Levels) {
  return { bottom: L.waist - 0.035 * L.s, top: L.chest - 0.01 * L.s, n: 6 };
}

export function armorTorsoEdges(ctx: Ctx, L: Levels): number[] {
  const body = ctx.outfit.armor.body;
  if (!body) return [];
  const s = L.s;
  if (body.kind === 'lorica-segmentata') {
    const { bottom, top, n } = segBands(L);
    const e: number[] = [];
    for (let i = 0; i <= n; i++) {
      const y = bottom + ((top - bottom) * i) / n;
      e.push(y - 0.004 * s, y + 0.003 * s);
    }
    for (let y = top + 0.045 * s; y < L.trap; y += 0.045 * s) e.push(y - 0.003 * s);
    e.push(L.trap - 0.002 * s);
    return e;
  }
  if (body.kind === 'leather' || body.kind === 'padded') return [L.waist - 0.03 * s, L.trap - 0.002 * s];
  return [L.trap - 0.002 * s, L.chest + 0.05 * s];
}

export function armorTorsoPaint(ctx: Ctx, L: Levels, x: number, y: number, z: number, th: number): Paint | null {
  const body = ctx.outfit.armor.body;
  if (!body || body.kind === 'manica-only') return null;
  const s = L.s;
  const neck = L.trap - 0.002 * s;
  if (y > neck) return null;
  const metal = metalColor(ctx);
  const ms = metalSurf(ctx);
  switch (body.kind) {
    case 'lorica-segmentata': {
      const { bottom, top, n } = segBands(L);
      if (y < bottom) return null;
      if (y <= top) {
        // Overlapping hoops: each band is thickest at its lower edge.
        const f = (y - bottom) / ((top - bottom) / n);
        const frac = f - Math.floor(f);
        const edge = frac < 0.14;
        const c = edge ? shade(IRON_DARK, 0.55) : shade(metal, 0.8 + 0.3 * (1 - frac));
        // Front closure: a vertical seam with brass buckles.
        if (Math.abs(x) < 0.008 * s && z > 0) return { color: frac > 0.4 && frac < 0.7 ? BRASS : IRON_DARK, surf: frac > 0.4 && frac < 0.7 ? SURF.bronze : ms, t: 0.02 * s };
        return { color: c, surf: ms, t: 0.012 * s + 0.011 * s * (1 - frac) };
      }
      // Breast and back plates up to the neck, with brass hinges and a rolled neck edge.
      const nearNeck = y > neck - 0.012 * s;
      const plateRow = ((y - top) / (0.045 * s)) % 1;
      let c = shade(metal, nearNeck ? 0.6 : plateRow < 0.12 ? 0.55 : 0.95 + 0.12 * (1 - plateRow));
      const hinge = Math.abs(Math.abs(x) - 0.06 * s) < 0.01 * s && Math.abs(y - (L.chest + 0.04 * s)) < 0.012 * s;
      if (hinge) c = BRASS;
      if (Math.abs(y - (L.chest + 0.065 * s)) < 0.003 * s) c = IRON_DARK;
      return { color: c, surf: hinge ? SURF.bronze : ms, t: 0.016 * s };
    }
    case 'lorica-hamata':
    case 'lorica-squamata': {
      // Down to the hips. Below the waist the skirt overlay shows the mail; the body under it is
      // painted the same (thin), so wherever the hips press through the skirt it is still mail.
      if (y < L.crotch - 0.02 * s) return null;
      const scale = body.kind === 'lorica-squamata';
      const c = scale ? shade(metal, 1.0) : shade(metal, 0.85);
      if (y < L.waist - 0.03 * s) return { color: c, surf: scale ? SURF.scale : SURF.mail, t: 0.004 * s };
      // Shoulder doubling (humeralia): a heavier band over the shoulders and upper chest.
      const doubling = y > L.chest + 0.05 * s;
      if (doubling && Math.abs(y - (L.chest + 0.05 * s)) < 0.004 * s) return { color: IRON_DARK, surf: ms, t: 0.018 * s };
      if (doubling && z > 0 && Math.abs(x) < 0.03 * s && y < L.chest + 0.09 * s) return { color: BRASS, surf: SURF.bronze, t: 0.022 * s };
      return { color: c, surf: scale ? SURF.scale : SURF.mail, t: (doubling ? 0.018 : 0.011) * s };
    }
    case 'leather': {
      if (y < L.waist - 0.03 * s) return null;
      const c = shade(LEATHER, 0.92 + 0.1 * Math.sin(th * 3));
      if (Math.abs(y - (L.waist - 0.02 * s)) < 0.006 * s) return { color: shade(LEATHER, 0.6), surf: SURF.leather, t: 0.016 * s };
      return { color: c, surf: SURF.leather, t: 0.014 * s };
    }
    case 'padded': {
      if (y < L.waist - 0.04 * s) return null;
      const quilt = Math.abs(Math.sin((y / s) * 110)) < 0.12 || Math.abs(Math.sin(th * 9)) < 0.08;
      return { color: shade(LINEN, quilt ? 0.82 : 1), surf: SURF.linen, t: 0.016 * s };
    }
  }
  return null;
}

/** Armor below the waist that lies over the skirt (mail/scale to the hips, leather pteruges). */
export function armorSkirtOverlay(ctx: Ctx, L: Levels): { bottom: number; paint: (y: number, th: number) => { color: THREE.Color; surf: Surf } } | null {
  const body = ctx.outfit.armor.body;
  if (!body) return null;
  const s = L.s;
  const metal = metalColor(ctx);
  if (body.kind === 'lorica-hamata' || body.kind === 'lorica-squamata') {
    const scale = body.kind === 'lorica-squamata';
    const bottom = L.crotch - 0.02 * s;
    return {
      bottom,
      paint: (y) => ({ color: y < bottom + 0.008 * s ? IRON_DARK : scale ? metal : shade(metal, 0.85), surf: scale ? SURF.scale : SURF.mail }),
    };
  }
  if (body.kind === 'padded') return { bottom: L.hip - 0.02 * s, paint: () => ({ color: LINEN, surf: SURF.linen }) };
  return null;
}

// ------------------------------------------------------------------ arms

export function armorArmPaint(ctx: Ctx, L: Levels, side: 'L' | 'R', y: number, th: number, query: boolean): EdgePaint | null {
  const a = ctx.outfit.armor;
  const s = L.s;
  const edges: number[] = [];
  // Mail/scale short sleeves.
  const body = a.body;
  const sleeveEnd = body && (body.kind === 'lorica-hamata' || body.kind === 'lorica-squamata') ? L.shoulder - 0.13 * s : body && body.kind === 'leather' ? L.shoulder - 0.06 * s : -Infinity;
  const manica = a.manica === (side === 'L' ? 'left' : 'right');
  const manTop = L.shoulder + 0.0 * s;
  const manBottom = L.wrist - 0.005 * s;
  if (query) {
    if (sleeveEnd > -Infinity) edges.push(sleeveEnd - 0.004 * s, sleeveEnd + 0.002 * s);
    if (manica) for (let yy = manBottom; yy < manTop; yy += 0.032 * s) edges.push(yy + 0.004 * s);
    return { color: ctx.skin, surf: SURF.skin, t: -1, edges };
  }
  if (manica && y > manBottom && y < manTop) {
    // Military manicae were articulated iron; gladiators' were quilted linen bound with straps.
    const band = ((y - manBottom) / (0.032 * s)) % 1;
    if (isGladiator(ctx) || !body) {
      const strap = band < 0.12;
      return { color: strap ? shade(LEATHER, 0.9) : shade(LINEN, 0.92 + 0.08 * Math.sin(th * 6)), surf: strap ? SURF.leather : SURF.linen, t: 0.013 * s + (band < 0.5 ? 0.003 * s : 0) };
    }
    return { color: band < 0.12 ? IRON_DARK : shade(IRON, 0.95 + 0.1 * (1 - band)), surf: SURF.iron, t: 0.01 * s + 0.004 * s * (1 - band) };
  }
  if (body && y > sleeveEnd && body.kind !== 'lorica-segmentata' && body.kind !== 'manica-only') {
    const scale = body.kind === 'lorica-squamata';
    if (body.kind === 'leather') return { color: LEATHER, surf: SURF.leather, t: 0.012 * s };
    if (body.kind === 'padded') return { color: LINEN, surf: SURF.linen, t: 0.012 * s };
    const edge = y < sleeveEnd + 0.008 * s;
    return { color: edge ? IRON_DARK : scale ? metalColor(ctx) : shade(metalColor(ctx), 0.85), surf: scale ? SURF.scale : SURF.mail, t: 0.01 * s };
  }
  return null;
}

// ------------------------------------------------------------------ legs

export function armorLegPaint(ctx: Ctx, L: Levels, side: 'L' | 'R', y: number, th: number, query: boolean): EdgePaint | null {
  const a = ctx.outfit.armor;
  const s = L.s;
  const g = a.greaves;
  const has = g === 'both' || (g === 'left' && side === 'L') || (g === 'right' && side === 'R');
  // Thraex and hoplomachus wore tall greaves over quilted leg wraps (fasciae).
  const helm = a.helmet?.kind;
  const tall = helm === 'thraex' || helm === 'hoplomachus';
  const top = L.knee + (tall ? 0.09 : 0.035) * s;
  const bottom = L.ankle + 0.03 * s;
  const wrapTop = L.hip - 0.07 * s;
  if (query) {
    const e: number[] = [];
    if (has) e.push(top, top + 0.006 * s, bottom, bottom + 0.005 * s);
    if (has && tall) e.push(wrapTop, wrapTop + 0.005 * s);
    return { color: ctx.skin, surf: SURF.skin, t: -1, edges: e };
  }
  if (!has) return null;
  const front = Math.sin(th) > -0.45;
  if (y > bottom && y < top && front) {
    const knee = gauss((y - L.knee - 0.01 * s) / s, 0.03);
    const metal = isGladiator(ctx) ? BRONZE_C : IRON;
    const c = y > top - 0.008 * s || y < bottom + 0.008 * s ? shade(metal, 0.7) : shade(metal, 1 + 0.15 * knee);
    return { color: c, surf: isGladiator(ctx) ? SURF.bronze : SURF.iron, t: 0.008 * s + 0.006 * s * knee };
  }
  if (y > bottom && y < top) return { color: shade(LINEN, 0.85), surf: SURF.linen, t: 0.006 * s };
  if (tall && y >= top && y < wrapTop) {
    const quilt = Math.abs(Math.sin((y / s) * 160)) < 0.15;
    return { color: shade(LINEN, quilt ? 0.8 : 0.98), surf: SURF.linen, t: 0.01 * s };
  }
  return null;
}

// ------------------------------------------------------------------ rigid pieces

const HEAD: Weights = [B.head, 1];

function V3(x: number, y: number, z: number) {
  return new THREE.Vector3(x, y, z);
}

/**
 * A two-sided plate from a param function p(u, v) (u, v in [0, 1]); front faces point along
 * `outward(u, v)`. Thickness via a back layer; edges darker.
 */
export function plate(
  ctx: Ctx,
  nu: number,
  nv: number,
  p: (u: number, v: number) => THREE.Vector3,
  normal: (u: number, v: number) => THREE.Vector3,
  color: (u: number, v: number) => THREE.Color,
  surf: Surf,
  weights: (u: number, v: number) => Weights,
  thick = 0.003,
) {
  const { b } = ctx;
  if (!ctx.hi) {
    nu = Math.max(1, Math.round(nu / 2));
    nv = Math.max(1, Math.round(nv / 2));
  }
  for (const side of [1, -1]) {
    const base = b.vertexCount;
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        const v = j / nv;
        const q = p(u, v);
        const n = normal(u, v);
        if (side < 0) q.addScaledVector(n, -thick);
        const c = side > 0 ? color(u, v) : shade(color(u, v), 0.55);
        b.vertex({ x: q.x, y: q.y, z: q.z, r: c.r, g: c.g, b: c.b, w: weights(u, v), s: surf });
      }
    // Orient by the normal at the plate's center.
    const n0 = normal(0.5, 0.5);
    const a = p(0, 0), bu = p(1, 0), bv = p(0, 1);
    const fn = new THREE.Vector3().subVectors(bu, a).cross(new THREE.Vector3().subVectors(bv, a));
    let flip = fn.dot(n0) < 0;
    if (side < 0) flip = !flip;
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const k = base + j * (nu + 1) + i;
        const k1 = k + 1;
        const k2 = k + nu + 1;
        const k3 = k2 + 1;
        if (!flip) {
          b.tri(k, k1, k3);
          b.tri(k, k3, k2);
        } else {
          b.tri(k, k3, k1);
          b.tri(k, k2, k3);
        }
      }
  }
}

/** Segmentata shoulder guards: curved lames over each shoulder. */
function shoulderLames(ctx: Ctx, L: Levels) {
  const s = L.s;
  const metal = metalColor(ctx);
  const ms = metalSurf(ctx);
  for (const side of [1, -1]) {
    const k = side > 0 ? 'L' : 'R';
    const n = ctx.hi ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x0 = side * lerp(0.09, 0.2, t) * s * ctx.rig.g.shoulders;
      const halfW = 0.024 * s;
      const r = lerp(0.075, 0.068, t) * s;
      const cy = L.shoulder - lerp(0.0, 0.02, t) * s;
      const cz = -0.016 * s;
      const span = lerp(1.25, 1.55, t);
      const drop = lerp(0.0, 0.035, t) * s;
      const w: Weights = mixW(mixW([B.chest, 1], [B[`shoulder${k}`], 1], smooth(0, 0.35, t)), [B[`upperArm${k}`], 1], smooth(0.4, 1, t) * 0.75);
      plate(
        ctx,
        1,
        ctx.hi ? 6 : 3,
        (u, v) => {
          const a = lerp(-span, span, v);
          const x = x0 + side * (u - 0.5) * 2 * halfW + side * Math.abs(Math.sin(a)) * 0.006 * s;
          return V3(x, cy + Math.cos(a) * r - drop * Math.abs(Math.sin(a)), cz + Math.sin(a) * r);
        },
        (u, v) => {
          const a = lerp(-span, span, v);
          return V3(side * 0.25, Math.cos(a), Math.sin(a)).normalize();
        },
        (u) => (u > 0.82 ? IRON_DARK : shade(metal, 0.95 + 0.1 * u)),
        ms,
        () => w,
        0.003 * s,
      );
    }
  }
}

/** The retiarius' galerus: a tall curved shoulder guard on the left shoulder. */
function galerus(ctx: Ctx, L: Levels) {
  const s = L.s;
  plate(
    ctx,
    6,
    5,
    (u, v) => {
      const a = lerp(-1.1, 1.1, u);
      const x = 0.16 * s + Math.cos(a) * 0.025 * s - v * 0.03 * s;
      const y = L.shoulder - 0.03 * s + v * 0.16 * s;
      const z = -0.01 * s + Math.sin(a) * 0.085 * s;
      return V3(x, y, z);
    },
    (u) => {
      const a = lerp(-1.1, 1.1, u);
      return V3(Math.cos(a), 0.1, Math.sin(a) * 0.4).normalize();
    },
    (u, v) => (v > 0.92 || u < 0.05 || u > 0.95 ? shade(BRONZE_C, 0.7) : shade(BRONZE_C, 1.02 - 0.08 * v)),
    SURF.bronze,
    (u, v) => (v < 0.3 ? [B.shoulderL, 0.6, B.upperArmL, 0.4] : [B.shoulderL, 0.8, B.chest, 0.2]),
    0.004 * s,
  );
}

/** Provocator's cardiophylax: a crescent-topped breastplate. */
function cardiophylax(ctx: Ctx, L: Levels, prof: TorsoProfile) {
  const s = L.s;
  plate(
    ctx,
    6,
    5,
    (u, v) => {
      const y = lerp(L.chest - 0.06 * s, L.chest + 0.08 * s, v);
      const halfW = 0.1 * s * (1 - 0.25 * Math.pow(v, 3)) - (v > 0.8 ? Math.abs(u - 0.5) * 0 : 0);
      const xx = (u - 0.5) * 2 * halfW;
      const th = Math.PI / 2 - Math.asin(Math.max(-0.95, Math.min(0.95, xx / (0.16 * s))));
      const [px, pz] = torsoPoint(ctx, prof, L, y, th);
      const yTop = v > 0.85 ? -Math.cos((u - 0.5) * Math.PI) * 0.025 * s * (v - 0.85) / 0.15 : 0;
      return V3(px, y + yTop, pz + 0.014 * s);
    },
    () => V3(0, 0, 1),
    (u, v) => (v > 0.94 || v < 0.06 ? shade(BRONZE_C, 0.7) : shade(BRONZE_C, 1.05 - 0.1 * Math.abs(u - 0.5))),
    SURF.bronze,
    () => [B.chest, 1],
    0.004 * s,
  );
}

export function buildArmorPieces(ctx: Ctx, L: Levels, prof: TorsoProfile, head: HeadFrame) {
  const a = ctx.outfit.armor;
  if (a.body?.kind === 'lorica-segmentata') shoulderLames(ctx, L);
  if (ctx.outfit.galerus) galerus(ctx, L);
  if (a.helmet?.kind === 'provocator') cardiophylax(ctx, L, prof);
  if (ctx.outfit.focale) focale(ctx, L, prof);
  if (a.helmet) buildHelmet(ctx, head, a.helmet.kind, a.helmet.crest, a.helmet.metal);
}

/** Military neck scarf. */
function focale(ctx: Ctx, L: Levels, prof: TorsoProfile) {
  const { b } = ctx;
  const s = L.s;
  const c = ctx.outfit.focale!;
  const seg = ctx.hi ? 16 : 8;
  const ys = [L.trap - 0.006 * s, L.trap + 0.012 * s, L.neckBase + 0.012 * s];
  b.grid(
    seg,
    ys.length,
    true,
    (i, j, v) => {
      const th = (i / seg) * Math.PI * 2;
      const y = ys[j];
      const [x, z] = torsoPoint(ctx, prof, L, y, th);
      const zc = prof.at(y).zc;
      const r = Math.hypot(x, z - zc);
      const k = (r + (j === 1 ? 0.022 : 0.012) * s) / r;
      v.x = x * k;
      v.y = y + (Math.sin(th) > 0.6 ? -0.01 * s : 0);
      v.z = zc + (z - zc) * k;
      const cc = shade(c, 0.9 + 0.1 * Math.sin(th * 7));
      v.r = cc.r;
      v.g = cc.g;
      v.b = cc.b;
      v.s = SURF.wool;
      v.w = j === 2 ? [B.neck, 0.6, B.chest, 0.4] : [B.chest, 1];
    },
    'auto',
    (j) => [0, ys[j], prof.at(ys[j]).zc],
  );
}

// ------------------------------------------------------------------ helmets

interface HelmetParts {
  /** Rim height fraction around the head (bowl covers yf above it). */
  rim: (th: number) => number;
  gap: number;
  color: THREE.Color;
  surf: Surf;
  /**
   * Below this height fraction the bowl stops following the head (which narrows into the jaw and
   * neck) and drops as a slightly flaring skirt, like the closed back of a gladiator's helmet.
   */
  skirt?: number;
}

/** Push a point away from the head center (flattened vertically), as the bowl surface does. */
function outFromHead(H: HeadFrame, p: THREE.Vector3, d: number) {
  const n = p.clone().sub(H.c);
  n.y *= 0.55;
  return p.addScaledVector(n.normalize(), d);
}

/** A point of the bowl surface at height fraction yf: the head surface pushed out by d, or the skirt. */
function bowlPoint(H: HeadFrame, skirt: number | undefined, yf: number, th: number, d: number): THREE.Vector3 {
  if (skirt !== undefined && yf < skirt) {
    const p = outFromHead(H, H.at(skirt, th, new THREE.Vector3(), true), d);
    const drop = (skirt - yf) * H.H;
    p.y -= drop;
    p.x += Math.sin(th) * drop * 0.18;
    p.z += Math.cos(th) * drop * 0.18;
    return p;
  }
  return outFromHead(H, H.at(yf, th, new THREE.Vector3(), true), d);
}

/** The rolled lip at the bowl's rim (row 0 of bowl()): attachments weld to it. */
function lipPoint(H: HeadFrame, parts: HelmetParts, th: number): THREE.Vector3 {
  return bowlPoint(H, parts.skirt, parts.rim(th) - 0.012, th, parts.gap * H.hs * 1.15);
}

function vtx(p: THREE.Vector3, c: THREE.Color, s: Surf, w: Weights = HEAD): V {
  return { x: p.x, y: p.y, z: p.z, r: c.r, g: c.g, b: c.b, w, s };
}

/** Bowl following the head surface above rim(θ), offset by `gap`, with a rolled edge. */
function bowl(ctx: Ctx, H: HeadFrame, parts: HelmetParts, deco?: (th: number, yf: number, c: THREE.Color) => THREE.Color, bulge?: (th: number, yf: number) => number) {
  const { b } = ctx;
  const cols = ctx.hi ? 18 : 10;
  const rows = (ctx.hi ? 7 : 4) + (parts.skirt !== undefined ? (ctx.hi ? 3 : 1) : 0);
  const out = (p: THREE.Vector3, d: number) => outFromHead(H, p, d);
  const g = b.grid(
    cols,
    rows + 1,
    true,
    (i, j, v) => {
      const th = (i / cols) * Math.PI * 2;
      const r0 = parts.rim(th);
      // j = 0 is the rolled lip (slightly lower and further out), then up to the crown.
      const t = j === 0 ? 0 : (j - 1) / (rows - 1);
      const yf = j === 0 ? r0 - 0.012 : lerp(r0, 0.995, Math.pow(t, 0.85));
      const p = bowlPoint(H, parts.skirt, yf, th, parts.gap * H.hs * (j === 0 ? 1.15 : 1) + (bulge ? bulge(th, yf) * H.hs : 0));
      let c = parts.color.clone().multiplyScalar(j === 0 ? 0.75 : 0.92 + 0.12 * t);
      if (deco) c = deco(th, yf, c);
      v.x = p.x;
      v.y = p.y;
      v.z = p.z;
      v.r = c.r;
      v.g = c.g;
      v.b = c.b;
      v.s = parts.surf;
      v.w = HEAD;
    },
    'auto',
    () => [H.c.x, H.c.y - 0.02, H.c.z],
  );
  const top = out(H.at(1, 0, new THREE.Vector3(), true), parts.gap * H.hs);
  b.capAuto(g, cols, rows, vtx(top, parts.color, parts.surf), [0, 1, 0]);
  // Inner lip so the rim has thickness when seen from below.
  b.grid(
    cols,
    2,
    true,
    (i, j, v) => {
      const th = (i / cols) * Math.PI * 2;
      const r0 = parts.rim(th);
      const p = bowlPoint(H, parts.skirt, r0 - (j === 0 ? 0.012 : -0.01), th, parts.gap * H.hs * (j === 0 ? 1.15 : 0.6));
      const c = shade(parts.color, 0.45);
      v.x = p.x;
      v.y = p.y;
      v.z = p.z;
      v.r = c.r;
      v.g = c.g;
      v.b = c.b;
      v.s = parts.surf;
      v.w = HEAD;
    },
    'auto',
    () => [H.c.x, H.c.y, H.c.z],
  );
  b.flipTail(cols * 2);
}

/** Flat crest/plume fin along a path over the head: profile (t → height), with bristle stripes. */
function crest(ctx: Ctx, H: HeadFrame, path: (t: number) => THREE.Vector3, up: (t: number) => THREE.Vector3, height: (t: number) => number, side: THREE.Vector3 | ((t: number) => THREE.Vector3), color: THREE.Color, n = 10, halfThick = 0.012, surf: Surf = SURF.wool, bristles = true) {
  const { b } = ctx;
  const sideAt = typeof side === 'function' ? side : () => side;
  for (const sgn of [1, -1]) {
    const base = b.vertexCount;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = path(t);
      const u = up(t);
      const sd = sideAt(t);
      const h = height(t);
      for (let j = 0; j <= 2; j++) {
        const k = j / 2;
        const q = p.clone().addScaledVector(u, h * k).addScaledVector(sd, sgn * halfThick * H.hs * (1 - k * 0.5));
        const stripe = bristles ? 0.8 + 0.25 * Math.sin(t * 90 + k * 3) : 1;
        const c = shade(color, (0.75 + 0.3 * k) * stripe);
        b.vertex(vtx(q, c, surf));
      }
    }
    for (let i = 0; i < n; i++)
      for (let j = 0; j < 2; j++) {
        const a = base + i * 3 + j;
        const c = a + 3;
        if (sgn > 0) b.quad(a, c, c + 1, a + 1);
        else b.quad(a, a + 1, c + 1, c);
      }
  }
}

function buildHelmet(ctx: Ctx, H: HeadFrame, kind: HelmetKind, crestColor?: string, metal?: 'iron' | 'bronze' | 'gilded') {
  const hs = H.hs;
  const base = metal === 'bronze' ? BRONZE_C : metal === 'gilded' ? GOLD : IRON;
  const surf: Surf = metal === 'iron' || (!metal && (kind === 'imperial-gallic' || kind === 'provocator')) ? SURF.iron : metal === 'gilded' ? SURF.gilded : SURF.bronze;
  const col = !metal && (kind === 'imperial-gallic' || kind === 'provocator') ? IRON : !metal ? BRONZE_C : base;
  const crestC = crestColor ? srgb(crestColor) : null;
  const cheekGuards = (c: THREE.Color, s: Surf) => {
    for (const side of [1, -1]) {
      plate(
        ctx,
        4,
        6,
        (u, v) => {
          // From the temple down the side of the face; the front edge curves back around the eye/mouth.
          const yf = lerp(0.64, 0.2, v);
          const frontTh = side * lerp(0.95, 0.85, Math.sin(v * Math.PI)) * (v < 0.25 ? 1.12 : 1);
          const backTh = side * 1.75;
          const th = lerp(frontTh, backTh, u);
          const p = H.at(yf, th, new THREE.Vector3(), true);
          const n = p.clone().sub(H.c);
          n.y = 0;
          return p.addScaledVector(n.normalize(), (0.011 + 0.006 * Math.sin(v * Math.PI)) * hs);
        },
        (u, v) => {
          const th = side * lerp(1.0, 1.75, u);
          return V3(Math.sin(th), 0, Math.cos(th));
        },
        (u, v) => (u < 0.08 || u > 0.92 || v > 0.94 || v < 0.06 ? shade(c, 0.7) : shade(c, 1.02 - 0.1 * v)),
        s,
        () => HEAD,
        0.0025 * hs,
      );
    }
  };
  /**
   * Neck guard welded to the bowl's rolled lip, flaring back and down. Depth and drop taper to
   * nothing at the ends so it melts into the rim instead of ending in points; the outer edge is
   * turned down like a rolled bead.
   */
  const neckGuard = (parts: HelmetParts, depth: number, drop: number, width = 1.3) => {
    const c = parts.color;
    plate(
      ctx,
      12,
      4,
      (u, v) => {
        const th = Math.PI + lerp(-width, width, u);
        const taper = Math.pow(Math.sin(u * Math.PI), 0.6);
        const p = lipPoint(H, parts, th);
        const n = V3(Math.sin(th), 0, Math.cos(th));
        const vf = Math.min(1, v / 0.75);
        p.addScaledVector(n, depth * vf * taper * hs);
        p.y -= (drop * vf + (v > 0.75 ? 0.008 * (v - 0.75) / 0.25 : 0)) * taper * hs;
        return p;
      },
      (u) => {
        const th = Math.PI + lerp(-width, width, u);
        return V3(Math.sin(th) * 0.45, 1, Math.cos(th) * 0.45).normalize();
      },
      (u, v) => (v > 0.7 ? shade(c, 0.72) : shade(c, 0.96 + 0.06 * Math.sin(u * 12))),
      parts.surf,
      () => HEAD,
      0.004 * hs,
    );
  };
  /** Broad brim at height fraction yf, drooping at the sides and back (less over the visor). */
  const brim = (c: THREE.Color, s: Surf, width: number, droop: number, yf = 0.66) => {
    plate(
      ctx,
      24,
      2,
      (u, v) => {
        const th = u * Math.PI * 2;
        const p = H.at(yf, th, new THREE.Vector3(), true);
        const n = V3(Math.sin(th), 0, Math.cos(th));
        p.addScaledVector(n, (0.018 + width * v) * hs);
        p.y -= droop * v * hs * (1 - 0.7 * Math.max(0, Math.cos(th)));
        return p;
      },
      () => V3(0, 1, 0),
      (u, v) => (v > 0.8 ? shade(c, 0.75) : c),
      s,
      () => HEAD,
      0.003 * hs,
    );
  };
  /**
   * Face plate from the brow to the chin with two round grilled eye openings (Pompeii type): dark
   * openings, a raised bead around each and crossed bars, all real geometry so they read at any
   * distance and LOD. A low ridge runs down the middle of the face.
   */
  // The visor wraps the face from ear to ear and, below the cheekbones, drops straight like the
  // closed back of the bowl (the same skirt), so visor and bowl meet without gaps.
  const VISOR_W = 1.45;
  const VISOR_TOP = 0.7;
  const GLADIATOR_SKIRT = 0.42;
  const visorPoint = (yf: number, th: number, d = 0) => bowlPoint(H, GLADIATOR_SKIRT, yf, th, (0.026 + d) * hs);
  /** A round eye opening on a surface: dark hole, raised bead and (optionally) crossed grille bars. */
  const eyeOpening = (surface: (yf: number, th: number, d: number) => THREE.Vector3, th0: number, y0: number, R: number, c: THREE.Color, s: Surf, bars: boolean) => {
    const center = surface(y0, th0, 0.001);
    const n = center.clone().sub(surface(y0, th0, -0.01)).normalize();
    const up = V3(0, 1, 0).addScaledVector(n, -n.y).normalize();
    const right = V3(0, 0, 0).crossVectors(up, n);
    const at = (x: number, y: number, d: number) => center.clone().addScaledVector(right, x * hs).addScaledVector(up, y * hs).addScaledVector(n, d * hs);
    // Opening: a dark disc just proud of the plate.
    plate(ctx, ctx.hi ? 12 : 8, 1, (u, v) => at(Math.cos(u * Math.PI * 2) * R * v, Math.sin(u * Math.PI * 2) * R * v, 0.0012), () => n.clone(), () => srgb('#120e0b'), SURF.leather, () => HEAD, 0.001 * hs);
    // Far away a dark opening is all that reads.
    if (!ctx.hi) return;
    // Raised bead around it.
    plate(
      ctx,
      12,
      2,
      (u, v) => {
        const a = u * Math.PI * 2;
        const r = R * (1 + v * 0.22) + 0.001;
        return at(Math.cos(a) * r, Math.sin(a) * r, 0.002 + 0.0035 * Math.sin(v * Math.PI));
      },
      () => n.clone(),
      (u, v) => shade(c, 0.9 + 0.2 * Math.sin(v * Math.PI)),
      s,
      () => HEAD,
      0.0015 * hs,
    );
    if (!bars) return;
    // Crossed bars (three each way), standing off the opening.
    for (const k of [-0.5, 0, 0.5]) {
      const half = R * Math.sqrt(1 - k * k);
      for (const vert of [true, false]) {
        plate(
          ctx,
          1,
          1,
          (u, v) => {
            const along = lerp(-half, half, v);
            const across = k * R + (u - 0.5) * 0.0042;
            return vert ? at(across, along, 0.0028) : at(along, across, 0.0034);
          },
          () => n.clone(),
          () => shade(c, 0.85),
          s,
          () => HEAD,
          0.0012 * hs,
        );
      }
    }
  };
  /**
   * Face plate from the brow to below the chin with two round grilled eye openings (Pompeii type):
   * real geometry, so the grilles read at any distance and LOD. A low ridge runs down the middle.
   */
  const grilleVisor = (c: THREE.Color, s: Surf) => {
    plate(
      ctx,
      10,
      8,
      (u, v) => visorPoint(lerp(0.04, VISOR_TOP, v), lerp(-VISOR_W, VISOR_W, u)),
      (u) => {
        const th = lerp(-VISOR_W, VISOR_W, u);
        return V3(Math.sin(th), 0, Math.cos(th));
      },
      (u, v) => (u < 0.04 || u > 0.96 || v < 0.06 ? shade(c, 0.72) : shade(c, 1.04 - 0.1 * Math.abs(u - 0.5))),
      s,
      () => HEAD,
      0.003 * hs,
    );
    // Central ridge.
    plate(
      ctx,
      1,
      6,
      (u, v) => visorPoint(lerp(0.08, VISOR_TOP - 0.03, v), lerp(-0.035, 0.035, u), 0.004 * Math.sin(u * Math.PI)),
      () => V3(0, 0, 1),
      () => shade(c, 1.08),
      s,
      () => HEAD,
      0.002 * hs,
    );
    for (const side of [1, -1]) eyeOpening(visorPoint, side * 0.42, FEAT.eye, 0.023, c, s, true);
  };
  const knob = (c: THREE.Color, s: Surf) => {
    const p = H.at(1, 0, new THREE.Vector3(), true);
    p.y += 0.016 * hs;
    ellipsoidRigid(ctx, p, 0.012 * hs, 0.012 * hs, 0.012 * hs, c, s);
  };
  const midCrest = (c: THREE.Color, h: number, from = 0.05, to = 0.95, curl = 0) =>
    crest(
      ctx,
      H,
      (t) => {
        // Front-to-back over the crown: param angle along the sagittal plane.
        const a = lerp(0.45, -0.6, t) * Math.PI;
        const yf = 0.6 + 0.4 * Math.cos(a);
        const p = H.at(Math.min(1, yf), a > 0 ? 0 : Math.PI, new THREE.Vector3(), true);
        p.y += 0.014 * hs + (curl ? Math.max(0, 0.3 - t) * curl * hs : 0);
        return p;
      },
      (t) => {
        const a = lerp(0.45, -0.6, t) * Math.PI;
        return V3(0, Math.cos(a) * 0.9 + 0.1, Math.sin(a)).normalize();
      },
      (t) => h * hs * Math.sin(Math.min(1, t * 1.15) * Math.PI) ** 0.6,
      V3(1, 0, 0),
      c,
    );

  switch (kind) {
    case 'imperial-gallic':
    case 'imperial-italic': {
      const gallic = kind === 'imperial-gallic';
      const c = gallic ? (metal === 'bronze' ? BRONZE_C : IRON) : metal === 'iron' ? IRON : BRONZE_C;
      const s = c === IRON ? SURF.iron : SURF.bronze;
      const parts: HelmetParts = { rim: (th) => lerp(0.68, 0.5, smooth(0.3, 1, Math.abs(Math.sin(th / 2)))) - (Math.abs(Math.sin(th)) > 0.9 ? 0.02 : 0), gap: 0.017, color: c, surf: s };
      bowl(
        ctx,
        H,
        parts,
        (th, yf, cc) => {
          // Embossed "eyebrows" and the Dacian-war cross bars.
          const front = Math.cos(th) > 0.6 && Math.abs(yf - 0.75) < 0.02 && Math.abs(Math.sin(th)) > 0.08;
          const bar = Math.abs(Math.sin(th)) < 0.07 || Math.abs(Math.cos(th)) < 0.06;
          if (gallic && (front || (bar && yf > 0.72))) return shade(BRASS, 0.95);
          return cc;
        },
        (th, yf) => (gallic && Math.cos(th) > 0.6 && Math.abs(yf - 0.75) < 0.025 ? 0.003 : 0),
      );
      // Brow peak.
      plate(
        ctx,
        10,
        1,
        (u, v) => {
          const th = lerp(-1.0, 1.0, u);
          const p = H.at(0.69, th, new THREE.Vector3(), true);
          const n = V3(Math.sin(th), 0, Math.cos(th));
          return p.addScaledVector(n, (0.018 + 0.022 * v) * hs);
        },
        () => V3(0, 1, 0),
        () => shade(gallic ? BRASS : c, 0.9),
        gallic ? SURF.bronze : s,
        () => HEAD,
        0.002 * hs,
      );
      neckGuard(parts, gallic ? 0.065 : 0.05, gallic ? 0.03 : 0.026);
      cheekGuards(c, s);
      knob(gallic ? BRASS : c, SURF.bronze);
      if (crestC) {
        // Centurion: transverse crest (side to side) on the knob.
        crest(
          ctx,
          H,
          (t) => {
            const a = lerp(-0.42, 0.42, t) * Math.PI;
            const p = H.at(0.72 + 0.28 * Math.cos(a), a > 0 ? Math.PI / 2 : -Math.PI / 2, new THREE.Vector3(), true);
            p.y += 0.02 * hs;
            return p;
          },
          (t) => {
            const a = lerp(-0.42, 0.42, t) * Math.PI;
            return V3(Math.sin(a), Math.cos(a), 0).normalize();
          },
          (t) => 0.07 * hs * Math.sin(t * Math.PI) ** 0.5,
          V3(0, 0, 1),
          crestC,
        );
      }
      break;
    }
    case 'praetorian-attic': {
      const c = metal === 'gilded' ? GOLD : BRONZE_C;
      const s = metal === 'gilded' ? SURF.gilded : SURF.bronze;
      const parts: HelmetParts = { rim: (th) => lerp(0.66, 0.46, smooth(0.3, 1, Math.abs(Math.sin(th / 2)))), gap: 0.017, color: c, surf: s };
      bowl(ctx, H, parts);
      // Frontal diadem (stephane) rising to a peak.
      plate(
        ctx,
        10,
        3,
        (u, v) => {
          const th = lerp(-1.3, 1.3, u);
          const p = H.at(0.67, th, new THREE.Vector3(), true);
          const n = V3(Math.sin(th), 0, Math.cos(th));
          const h = 0.05 * Math.pow(Math.cos((u - 0.5) * Math.PI), 1.5);
          p.addScaledVector(n, 0.02 * hs);
          p.y += v * h * hs;
          p.addScaledVector(n, -v * 0.012 * hs);
          return p;
        },
        (u) => {
          const th = lerp(-1.3, 1.3, u);
          return V3(Math.sin(th), 0.2, Math.cos(th)).normalize();
        },
        (u, v) => (v > 0.85 ? shade(GOLD, 0.8) : shade(GOLD, 1.05 - 0.1 * Math.abs(u - 0.5))),
        SURF.gilded,
        () => HEAD,
        0.002 * hs,
      );
      neckGuard(parts, 0.035, 0.02, 1.1);
      cheekGuards(c, s);
      midCrest(crestC ?? srgb('#b3261e'), 0.11);
      break;
    }
    case 'vigiles-cap':
    case 'leather-cap': {
      const c = shade(LEATHER, kind === 'vigiles-cap' ? 1.05 : 0.95);
      const parts: HelmetParts = { rim: (th) => lerp(0.7, 0.55, smooth(0.3, 1, Math.abs(Math.sin(th / 2)))), gap: 0.012, color: c, surf: SURF.leather };
      bowl(ctx, H, parts);
      if (kind === 'vigiles-cap') {
        // A short leather peak turned down all round the rim (a flat disc would read as needles
        // edge-on), thick enough to show its edge.
        plate(
          ctx,
          ctx.hi ? 20 : 10,
          2,
          (u, v) => {
            const th = u * Math.PI * 2;
            const p = lipPoint(H, parts, th);
            const n = V3(Math.sin(th), 0, Math.cos(th));
            const w = 0.016 * (0.7 + 0.3 * Math.max(0, Math.cos(th)));
            p.addScaledVector(n, w * v * hs);
            p.y -= 0.012 * v * v * hs;
            return p;
          },
          (u) => {
            const th = u * Math.PI * 2;
            return V3(Math.sin(th) * 0.6, 1, Math.cos(th) * 0.6).normalize();
          },
          (u, v) => (v > 0.7 ? shade(c, 0.78) : c),
          SURF.leather,
          () => HEAD,
          0.004 * hs,
        );
      }
      break;
    }
    case 'pileus': {
      // Felt cap of liberty: a soft rounded cone.
      const c = srgb(ctx.app.garments.find((g) => g.kind === 'lacerna')?.color ?? '#d6cbb2');
      bowl(ctx, H, { rim: (th) => lerp(0.74, 0.62, smooth(0.3, 1, Math.abs(Math.sin(th / 2)))), gap: 0.01, color: shade(c, 0.95), surf: SURF.wool }, undefined, (th, yf) => smooth(0.8, 1, yf) * 0.02 + Math.max(0, Math.cos(th)) * smooth(0.85, 1, yf) * 0.012);
      break;
    }
    case 'murmillo':
    case 'thraex':
    case 'hoplomachus': {
      const c = metal === 'iron' ? IRON : BRONZE_C;
      const s = metal === 'iron' ? SURF.iron : SURF.bronze;
      // The bowl comes down behind the visor and closes over the back of the head and the nape.
      bowl(ctx, H, { rim: (th) => lerp(VISOR_TOP - 0.03, 0.1, smooth(1.0, 1.4, Math.abs(wrapPi(th)))), gap: 0.02, color: c, surf: s, skirt: GLADIATOR_SKIRT });
      brim(c, s, kind === 'murmillo' ? 0.05 : 0.035, kind === 'murmillo' ? 0.022 : 0.012, VISOR_TOP);
      grilleVisor(c, s);
      if (kind === 'murmillo') {
        // Tall fish-fin crest with a plume.
        midCrest(c, 0.1, 0.05, 0.95);
        if (crestC) midCrest(crestC, 0.15, 0.1, 0.9);
      } else if (kind === 'thraex') {
        // Griffin crest: a curved crest sweeping forward to a beaked head.
        midCrest(c, 0.09, 0.05, 0.95, 0.06);
        const p = H.at(0.97, 0, new THREE.Vector3(), true);
        p.y += 0.1 * hs;
        p.z += 0.045 * hs;
        ellipsoidRigid(ctx, p, 0.016 * hs, 0.02 * hs, 0.03 * hs, c, s);
        ellipsoidRigid(ctx, p.clone().add(V3(0, -0.012 * hs, 0.03 * hs)), 0.008 * hs, 0.008 * hs, 0.016 * hs, shade(c, 0.9), s);
        if (crestC) for (const sd of [1, -1]) feather(ctx, H, sd, crestC);
      } else {
        midCrest(crestC ?? srgb('#e8e2d2'), 0.1);
        for (const sd of [1, -1]) feather(ctx, H, sd, crestC ?? srgb('#e8e2d2'));
      }
      break;
    }
    case 'secutor': {
      const c = metal === 'iron' ? IRON : BRONZE_C;
      const s = metal === 'iron' ? SURF.iron : SURF.bronze;
      // Smooth egg enclosing the whole head with tiny eye holes and a low fin.
      const parts: HelmetParts = { rim: () => 0.02, gap: 0.026, color: c, surf: s, skirt: 0.36 };
      const secBulge = (th: number, yf: number) => 0.006 * Math.max(0, Math.cos(th)) * gauss((yf - 0.35) / 0.25, 1);
      bowl(
        ctx,
        H,
        parts,
        undefined,
        (th, yf) => secBulge(th, yf),
      );
      // Two small round eye holes (the secutor's only openings).
      const shell = (yf: number, th: number, d: number) => bowlPoint(H, parts.skirt, yf, th, (parts.gap + secBulge(th, yf) + d) * hs);
      for (const side of [1, -1]) eyeOpening(shell, side * 0.4, FEAT.eye, 0.0095, c, s, false);
      midCrest(c, 0.045);
      neckGuard(parts, 0.03, 0.015, 1.2);
      break;
    }
    case 'provocator': {
      const c = metal === 'bronze' ? BRONZE_C : IRON;
      const s = c === IRON ? SURF.iron : SURF.bronze;
      // Legionary-style bowl closed down the sides and back behind the visor, with a neck guard.
      const parts: HelmetParts = { rim: (th) => lerp(VISOR_TOP - 0.03, 0.2, smooth(1.0, 1.4, Math.abs(wrapPi(th)))), gap: 0.02, color: c, surf: s, skirt: GLADIATOR_SKIRT };
      bowl(ctx, H, parts);
      grilleVisor(c, s);
      neckGuard(parts, 0.05, 0.026, 1.1);
      knob(c, s);
      break;
    }
  }
}

/** Angle wrapped to (-π, π]. */
function wrapPi(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function feather(ctx: Ctx, H: HeadFrame, side: number, color: THREE.Color) {
  const hs = H.hs;
  const base = H.at(0.82, side * 1.5, new THREE.Vector3(), true);
  crest(
    ctx,
    H,
    (t) => base.clone().add(V3(side * 0.025 * hs * t, 0.18 * hs * t, -0.02 * hs * t)),
    () => V3(0, 0, 1),
    (t) => 0.02 * hs * Math.sin(t * Math.PI),
    V3(1, 0, 0),
    color,
    6,
    0.004,
  );
}

function ellipsoidRigid(ctx: Ctx, c: THREE.Vector3, rx: number, ry: number, rz: number, col: THREE.Color, s: Surf) {
  const { b } = ctx;
  const seg = ctx.hi ? 8 : 5;
  const rows = ctx.hi ? 5 : 3;
  const g = b.grid(
    seg,
    rows,
    true,
    (i, j, v) => {
      const a = ((j + 1) / (rows + 1)) * Math.PI;
      const th = (i / seg) * Math.PI * 2;
      v.x = c.x + Math.sin(a) * Math.cos(th) * rx;
      v.y = c.y + Math.cos(a) * ry;
      v.z = c.z + Math.sin(a) * Math.sin(th) * rz;
      const cc = shade(col, 0.85 + 0.15 * Math.cos(a - 0.6));
      v.r = cc.r;
      v.g = cc.g;
      v.b = cc.b;
      v.s = s;
      v.w = HEAD;
    },
    'auto',
    () => [c.x, c.y, c.z],
  );
  b.capAuto(g, seg, 0, vtx(c.clone().add(V3(0, ry, 0)), col, s), [0, 1, 0]);
  b.capAuto(g, seg, rows - 1, vtx(c.clone().add(V3(0, -ry, 0)), shade(col, 0.8), s), [0, -1, 0]);
}

