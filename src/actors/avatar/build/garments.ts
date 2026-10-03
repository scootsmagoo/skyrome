/**
 * Garment rules and garment geometry.
 *
 * paint*() decide, for a point on the body surface, which layer is outermost there (armor, toga,
 * palla, stola, tunic, loincloth, trousers, skin), returning its color, surface and thickness. The
 * body builders call them per vertex. Geometry that stands away from the body — skirts, belts,
 * the toga's folds, cloaks — is built here too.
 */
import * as THREE from 'three';
import { B } from '../rig';
import { PATTERN, SURF, mixW, type Surf, type Weights } from '../SkinBuilder';
import { clamp01, gauss, lerp, mixC, noise1, shade, smooth, srgb, type Ctx, type Paint } from './common';
import type { Levels, TorsoProfile } from './body';
import { torsoPoint } from './body';
import type { Cloth } from './outfit';
import { armorArmPaint, armorLegPaint, armorSkirtOverlay, armorTorsoEdges, armorTorsoPaint, plate } from './armor';

const tmp = new THREE.Color();

export function skinPaint(ctx: Ctx, k = 1): Paint {
  return { color: k === 1 ? ctx.skin : shade(ctx.skin, k), surf: SURF.skin, t: 0 };
}

function clothSurf(c: Cloth, linen = false): Surf {
  return linen ? SURF.linen : SURF.wool;
}

/** Diagonal band of the toga/palla across the chest: from the left shoulder to the right hip. Returns signed distance (m) from the band's centerline (positive = above/right side). */
function sashDist(L: Levels, x: number, y: number) {
  // Line from (0.12, shoulder) to (-0.17, waist)
  const x0 = 0.11 * L.s, y0 = L.shoulder + 0.01 * L.s;
  const x1 = -0.17 * L.s, y1 = L.waist - 0.02 * L.s;
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  return ((x - x0) * dy - (y - y0) * dx) / len;
}

/** Toga region on the torso: everything except the right shoulder/upper chest above the sash. */
function inToga(L: Levels, x: number, y: number, z: number): boolean {
  if (y < L.armpit - 0.02 * L.s) return true;
  const d = sashDist(L, x, y);
  // Front: the right upper chest (x < 0, above the sash) shows the tunic.
  if (z > -0.02 * L.s) return d > -0.035 * L.s || x > 0.04 * L.s;
  // Back: the toga comes up from the right hip to the left shoulder; the right shoulder blade is free.
  return x > -0.06 * L.s || y < L.chest - 0.02 * L.s;
}

export function paintTorso(ctx: Ctx, L: Levels, x: number, y: number, z: number, th: number): Paint {
  const o = ctx.outfit;
  const s = L.s;
  if (o.armor.body) {
    const p = armorTorsoPaint(ctx, L, x, y, z, th);
    if (p) return p;
  }
  if (o.cloak?.kind === 'paenula' && y > L.armpit - 0.02 * s && y < L.neckBase) {
    // The paenula's shoulders show as a hood collar over the tunic.
    if (y > L.shTop - 0.005 * s || Math.abs(x) > 0.1 * s) return { color: shade(o.cloak.color, 0.97), surf: SURF.wool, t: 0.018 * s };
  }
  if (o.toga && inToga(L, x, y, z) && y < L.neckBase - 0.01 * s && y > L.crotch) {
    const d = sashDist(L, x, y);
    // Folds radiate along the sash.
    const fold = Math.sin(d * 140 + x * 30) * 0.5 + 0.5;
    const c = shade(o.toga.color, 0.9 + 0.12 * fold);
    if (o.toga.trim && Math.abs(d + 0.0) < 0.012 * s && z > 0) c.copy(o.toga.trim);
    return { color: c, surf: SURF.wool, t: 0.02 * s + 0.006 * s * fold };
  }
  if (o.palla && !o.toga && y < L.chest - 0.02 * s && y > L.crotch) {
    const d = sashDist(L, x, y + 0.05 * s);
    if (y < L.waist + 0.02 * s || d > 0.0) {
      const fold = Math.sin(d * 120 + x * 25) * 0.5 + 0.5;
      return { color: shade(o.palla.color, 0.9 + 0.12 * fold), surf: SURF.wool, t: 0.016 * s + 0.005 * s * fold };
    }
  }
  const neckline = necklineAt(L, th);
  if (o.stola && y < L.armpit + 0.03 * s && y > L.crotch) {
    // Thin straps over the shoulders are part of the tunic area above.
    const c = shade(o.stola.color, 0.95 + 0.06 * Math.sin(th * 14));
    if (o.stola.trim && y > L.armpit + 0.02 * s) c.copy(o.stola.trim);
    return { color: c, surf: SURF.wool, t: 0.009 * s };
  }
  if (o.stola && y >= L.armpit + 0.03 * s && y < neckline) {
    const strap = gauss((Math.abs(x) - 0.09 * s) / s, 0.012) > 0.5;
    if (strap) return { color: shade(o.stola.color, 0.9), surf: SURF.wool, t: 0.009 * s };
  }
  if (o.tunic && y < neckline) {
    const t = o.tunic;
    let c = t.color;
    if (t.clavi) {
      const w = (t.clavi === 'wide' ? 0.04 : 0.014) * s;
      if (Math.abs(Math.abs(x) - 0.07 * s) < w / 2 && y > L.crotch) c = t.trim ?? srgb('#4f1838');
    }
    // Blousing over the belt (kolpos) and a soft shadow under it.
    let thick = 0.006 * s;
    let k = 1;
    if (o.belt && !o.belt.high) {
      const dy = y - L.belt;
      thick += 0.01 * s * gauss((dy - 0.03 * s) / s, 0.025);
      k *= 1 - 0.18 * gauss((dy + 0.012 * s) / s, 0.012);
    }
    if (o.belt?.high) {
      const dy = y - (L.chest - 0.04 * s);
      thick += 0.006 * s * gauss((dy - 0.02 * s) / s, 0.02);
    }
    // Folds: vertical ripples, stronger lower down.
    const fold = Math.sin(th * 11 + noise1(th * 3, 3) * 2);
    thick += 0.002 * s * fold;
    k *= 0.95 + 0.06 * fold;
    // Armpit shade.
    k *= 1 - 0.15 * gauss((Math.abs(x) - 0.15 * s) / s, 0.03) * gauss((y - L.armpit) / s, 0.03);
    return { color: shade(c, k), surf: clothSurf(t), t: thick };
  }
  if (o.braccae && y < L.iliac) return { color: o.braccae.color, surf: SURF.wool, t: 0.006 * s };
  if (o.subligaculum && y < L.iliac + 0.015 * s) {
    const k = 0.94 + 0.08 * Math.sin(th * 9);
    return { color: shade(o.subligaculum.color, k), surf: SURF.linen, t: 0.006 * s };
  }
  // Bare skin: muscle definition for bare chests.
  let k = 1;
  if (z > 0) {
    const ab = Math.abs(x) / s;
    k *= 1 - 0.08 * gauss(ab, 0.008) * smooth(L.waist - 0.05 * s, L.chest - 0.03 * s, y) * (1 - smooth(L.chest - 0.03 * s, L.chest, y));
    k *= 1 - 0.1 * gauss((y - L.chest + 0.045 * s) / s, 0.012) * smooth(0.01, 0.04, ab) * (1 - smooth(0.1, 0.13, ab));
  }
  k *= 1 - 0.18 * gauss((Math.abs(x) - 0.155 * s) / s, 0.025) * gauss((y - L.armpit) / s, 0.025);
  return skinPaint(ctx, k);
}

/** Tunic neckline: high at the back and sides, a shallow scoop in front. */
export function necklineAt(L: Levels, _th: number): number {
  return L.trap + 0.004 * L.s;
}

/** Heights where torso garments change color (for extra loft rings). */
export function torsoEdges(ctx: Ctx, L: Levels): number[] {
  const o = ctx.outfit;
  const s = L.s;
  const e: number[] = [];
  if (o.tunic || o.stola) e.push(L.trap + 0.001 * s, L.trap + 0.007 * s);
  if (o.belt && !o.belt.high) e.push(L.belt - 0.012 * s, L.belt + 0.03 * s);
  if (o.stola) e.push(L.armpit + 0.03 * s, L.armpit + 0.02 * s);
  if (o.subligaculum && !o.tunic) e.push(L.iliac + 0.015 * s);
  e.push(...armorTorsoEdges(ctx, L));
  return e;
}

export interface ArmPaint extends Paint {
  edges?: number[];
  /** Hand color override (gloves / wrapped hands). */
  hand?: THREE.Color;
}

export function paintArm(ctx: Ctx, L: Levels, side: 'L' | 'R', y: number, th: number, r: number, query: boolean): ArmPaint {
  const o = ctx.outfit;
  const s = L.s;
  const edges: number[] = [];
  // Sleeve end per garment.
  let sleeveEnd = Infinity;
  let sleeve: Cloth | null = null;
  let sleeveT = 0.005 * s;
  const tun = o.tunic;
  if (tun) {
    sleeve = tun;
    sleeveEnd =
      tun.sleeve === 'none' ? L.shoulder + 0.03 * s : tun.sleeve === 'short' ? L.shoulder - 0.12 * s : tun.sleeve === 'elbow' ? L.elbow + 0.01 * s : L.wrist + 0.035 * s;
  }
  const togaArm = !!o.toga && side === 'L';
  const pallaArm = !!o.palla && !o.toga && side === 'L';
  if (togaArm || pallaArm) {
    sleeve = (o.toga ?? o.palla)!;
    sleeveEnd = L.elbow - 0.09 * s;
    sleeveT = 0.022 * s;
  }
  if (o.cloak?.kind === 'paenula') {
    // The paenula covers the shoulders like a cape.
    if (sleeveEnd > L.shoulder - 0.07 * s) {
      sleeve = o.cloak;
      sleeveEnd = L.shoulder - 0.07 * s;
      sleeveT = 0.016 * s;
    }
  }
  const armor = armorArmPaint(ctx, L, side, y, th, query);
  if (query) {
    if (sleeveEnd < Infinity) edges.push(sleeveEnd - 0.006 * s, sleeveEnd + 0.002 * s);
    if (armor?.edges) edges.push(...armor.edges);
    return { color: ctx.skin, surf: SURF.skin, t: 0, edges };
  }
  if (armor && armor.t >= 0) return armor;
  if (sleeve && y > sleeveEnd) {
    const nearHem = smooth(sleeveEnd + 0.03 * s, sleeveEnd, y);
    const fold = Math.sin(th * 5 + y * 60);
    let c = shade(sleeve.color, 0.94 + 0.06 * fold);
    if ((togaArm || pallaArm) && sleeve.trim && y < sleeveEnd + 0.012 * s) c = sleeve.trim.clone();
    return { color: c, surf: SURF.wool, t: sleeveT + 0.003 * s * nearHem + 0.0015 * s * fold };
  }
  // Skin with a soft elbow crease shade.
  const k = 1 - 0.08 * gauss((y - L.elbow) / s, 0.015) * Math.max(0, Math.sin(th));
  return { ...skinPaint(ctx, k), hand: undefined };
}

export interface LegPaint extends Paint {
  edges?: number[];
}

export function paintLeg(ctx: Ctx, L: Levels, side: 'L' | 'R', y: number, th: number, query: boolean): LegPaint {
  const o = ctx.outfit;
  const s = L.s;
  const shoeTop = o.footwear === 'caligae' ? L.ankle + 0.07 * s : o.footwear === 'calcei' ? L.ankle + 0.05 * s : -1;
  const armor = armorLegPaint(ctx, L, side, y, th, query);
  if (query) {
    const e: number[] = [];
    if (shoeTop > 0) e.push(shoeTop - 0.004 * s, shoeTop + 0.002 * s);
    if (armor?.edges) e.push(...armor.edges);
    return { color: ctx.skin, surf: SURF.skin, t: 0, edges: e };
  }
  if (armor && armor.t >= 0) return armor;
  // Mail or scale over the hips: the thigh tops under it wear it too, so a leg pressing through the
  // skirt still reads as armor (not as tunic cloth showing through).
  const ov = o.tunic && !o.toga && !o.stola ? armorSkirtOverlay(ctx, L) : null;
  if (ov && y > ov.bottom) {
    const p = ov.paint(y, th);
    return { color: p.color, surf: p.surf, t: 0.016 * s };
  }
  // Under a skirt the leg takes the skirt's (shaded) color, so a bent knee pressing through reads as cloth.
  const under = skirtOver(o, L, y);
  if (under) return { color: under, surf: SURF.wool, t: 0.016 * s };
  if (o.braccae && y > L.ankle + 0.01 * s) {
    const fold = Math.sin(th * 4 + y * 40);
    return { color: shade(o.braccae.color, 0.93 + 0.07 * fold), surf: SURF.wool, t: 0.008 * s + 0.003 * s * fold };
  }
  if (y < shoeTop) {
    const leather = srgb(o.footwear === 'caligae' ? '#6b4a2f' : '#4a3426');
    if (o.footwear === 'caligae') {
      // Open strapwork: alternate leather and skin.
      const strap = Math.sin(y * 260) > 0.1 || Math.abs(Math.cos(th)) > 0.92;
      return strap ? { color: leather, surf: SURF.leather, t: 0.004 * s } : skinPaint(ctx, 0.9);
    }
    return { color: leather, surf: SURF.leather, t: 0.004 * s };
  }
  if (o.subligaculum && !o.tunic && y > L.hip - 0.06 * s) {
    return { color: o.subligaculum.color, surf: SURF.linen, t: 0.005 * s };
  }
  const k = 1 - 0.07 * gauss((y - L.knee) / s, 0.02) * Math.max(0, -Math.sin(th));
  return skinPaint(ctx, k);
}

function skirtOver(o: Ctx['outfit'], L: Levels, y: number): THREE.Color | null {
  if (o.braccae || !o.hem || o.hem === 'short') return null;
  const hemY = o.hem === 'long' ? L.hemLong : L.hemKnee;
  if (y < hemY + 0.06 * L.s) return null;
  const c = (o.toga ?? o.stola ?? o.tunic)?.color;
  return c ? shade(c, 0.8) : null;
}

export interface FootPaint extends Paint {
  sole: number;
}

export function paintFoot(ctx: Ctx, x: number, y: number, z: number, th: number, query: boolean): FootPaint {
  const fw = ctx.outfit.footwear;
  const s = ctx.rig.s;
  const sole = fw === 'caligae' ? 0.016 : fw === 'calcei' ? 0.012 : fw === 'soleae' ? 0.01 : 0;
  if (query) return { color: ctx.skin, surf: SURF.skin, t: 0, sole };
  const soleC = srgb(fw === 'caligae' ? '#3b2a1e' : '#4f3a29');
  if (fw !== 'barefoot' && y < sole * s * 1.05) return { color: soleC, surf: SURF.leather, t: 0, sole };
  if (fw === 'calcei') return { color: srgb('#5a3b28'), surf: SURF.leather, t: 0, sole };
  if (fw === 'caligae') {
    const strap = Math.sin(z * 180 + x * 90) > 0.0 || Math.sin(z * 180 - x * 90) > 0.4 || z < -0.02;
    return strap ? { color: srgb('#6b4a2f'), surf: SURF.leather, t: 0, sole } : { color: shade(ctx.skin, 0.92), surf: SURF.skin, t: 0, sole };
  }
  if (fw === 'soleae') {
    const strap = (z > 0.03 * s && z < 0.06 * s) || (z > 0.11 * s && z < 0.125 * s && y > 0.02 * s);
    return strap ? { color: srgb('#7a5638'), surf: SURF.leather, t: 0, sole } : skinPaint(ctx, 0.97) as FootPaint;
  }
  return { ...skinPaint(ctx, 0.97), sole };
}

// ------------------------------------------------------------------ skirts

export interface SkirtSpec {
  top: number;
  hem: number;
  color: THREE.Color;
  trim?: THREE.Color;
  surf: Surf;
  /** Extra half-width / depth at the hem. */
  flare: number;
  /** How much the hem follows the thighs (0..0.8). */
  legK: number;
  folds: number;
  foldAmp: number;
  /** Hem lower at the back/sides (m) or diagonal (toga). */
  hemTilt?: (th: number) => number;
  /** Second, inner hem peeking below (e.g. tunica under a stola). */
  under?: { color: THREE.Color; drop: number };
  /** Vertical stripes (pteruges) */
  strips?: THREE.Color;
  thickness: number;
  /** Armor lying over the upper part of the skirt (mail to the hips). */
  overlay?: { bottom: number; paint: (y: number, th: number) => { color: THREE.Color; surf: Surf } } | null;
}

/** Outer surface of a built skirt: front-facing z at (x, y), for drapery laid over it. */
export type SkirtSurface = (x: number, y: number) => number;

export function buildSkirt(ctx: Ctx, L: Levels, prof: TorsoProfile, sp: SkirtSpec): SkirtSurface {
  const { b } = ctx;
  const s = L.s;
  const seg = ctx.hi ? 22 : 10;
  const rowsN = ctx.hi ? (sp.overlay ? 11 : 7) : 4;
  const seed = ctx.rng.next() * 10;
  const thighR = 0.09 * s * ctx.rig.g.leg;
  // Envelope that contains the body/legs at height y.
  const envelope = (y: number) => {
    const yy = Math.max(y, L.crotch + 0.01 * s);
    const sec = prof.at(Math.min(yy, L.waist + 0.06 * s));
    let a = sec.a;
    let bf = sec.bf;
    let bb = sec.bb;
    if (y < L.hip) {
      const legA = L.hipX + thighR + 0.012 * s;
      a = Math.max(a * smooth(L.crotch - 0.15 * s, L.hip, y), legA);
      bf = Math.max(bf * 0.95, thighR + 0.018 * s);
      bb = Math.max(bb * 0.95, thighR + 0.03 * s);
    }
    return { a, bf, bb, zc: sec.zc };
  };
  const hemAt = (th: number) => sp.hem + (sp.hemTilt ? sp.hemTilt(th) : 0) + 0.006 * s * noise1(th * 4, seed);
  const ringPoint = (th: number, t: number, inner: boolean) => {
    const y = lerp(sp.top, hemAt(th), t);
    const env = envelope(y);
    const flareK = Math.pow(t, 1.3);
    const a = env.a + sp.thickness + sp.flare * flareK;
    // Long skirts carry extra fullness in front so striding or bent knees stay covered.
    const bf = env.bf + sp.thickness + sp.flare * 1.15 * flareK + (sp.hem < L.knee ? 0.04 * L.s * Math.sin(Math.PI * Math.min(1, t * 1.3)) : 0);
    const bb = env.bb + sp.thickness + sp.flare * 1.25 * flareK;
    const c = Math.cos(th);
    const sn = Math.sin(th);
    const e = 2 / 2.3;
    let x = a * Math.sign(c) * Math.pow(Math.abs(c), e);
    let z = (sn >= 0 ? bf : bb) * Math.sign(sn) * Math.pow(Math.abs(sn), e);
    // Folds grow downward.
    const fold = Math.sin(th * sp.folds + seed + noise1(th * 2.3, seed) * 1.6);
    const amp = sp.foldAmp * (0.25 + 0.75 * t);
    const r = Math.hypot(x, z) || 1;
    const k = (r + amp * fold - (inner ? 0.004 * s : 0)) / r;
    x *= k;
    z *= k;
    return { x, y, z: z + env.zc, fold };
  };
  const weights = (x: number, t: number, a: number): Weights => {
    // Thigh influence ramps in over the upper skirt so knees stay covered when they bend forward.
    const wt = smooth(0.05, 0.65, t) * sp.legK;
    const lat = x / Math.max(a, 1e-3);
    // A wide blend across the front/back center keeps the cloth closed between the legs.
    const wl = smooth(-0.75, 0.75, lat);
    const w: Weights = [B.hips, 1 - wt, B.thighL, wt * wl, B.thighR, wt * (1 - wl)];
    if (t < 0.2) return mixW([B.spine, 0.3, B.hips, 0.7], w, smooth(0, 0.2, t));
    return w;
  };
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
  // Outer skirt: rows go from the hem (j = 0) up to the waist. An armor overlay (mail to the hips)
  // gets a pair of rows hugging its lower edge, so the edge is a clean ring, not a saw-tooth of
  // vertex colors across the rows.
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
      v.x = p.x * (over ? 1.03 : 1);
      v.y = p.y;
      v.z = p.z * (over ? 1.03 : 1);
      v.r = c.r;
      v.g = c.g;
      v.b = c.b;
      v.s = over ? sp.overlay!.paint(p.y, th).surf : sp.surf;
      v.w = weights(p.x, t, envelope(p.y).a + sp.flare * t);
    },
    'auto',
    (j) => {
      const t = rowT(j, 0);
      const y = lerp(sp.top, sp.hem, t);
      return [0, y, envelope(y).zc];
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
      v.w = weights(p.x, t, envelope(p.y).a + sp.flare * t);
    },
    // Inside-out: faces point toward the axis.
    'auto',
    (j) => {
      const t = 1 - (j / (innerRows - 1)) * 0.45;
      const y = lerp(sp.top, sp.hem, t);
      // A point far outside makes 'auto' pick the inward-facing winding.
      return [0, y, envelope(y).zc];
    },
  );
  flipLast(b, seg, innerRows);
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
        v.x = p.x * 0.97;
        v.z = p.z * 0.97;
        v.y = hemAt(th) - (j === 0 ? sp.under!.drop : -0.02 * s);
        const c = shade(uc, 0.9 + 0.1 * p.fold);
        v.r = c.r;
        v.g = c.g;
        v.b = c.b;
        v.s = sp.surf;
        v.w = weights(p.x, 1, envelope(p.y).a + sp.flare);
      },
      'auto',
      (j) => [0, sp.hem - j * 0.01, 0],
    );
  }
  return surface;
}

/** Reverse the winding of the last grid's quads (the most recent rows × cols × 2 triangles). */
function flipLast(b: { flipTail(n: number): void }, cols: number, rows: number) {
  b.flipTail(cols * (rows - 1) * 2);
}

// ------------------------------------------------------------------ belts

export function buildBelt(ctx: Ctx, L: Levels, prof: TorsoProfile) {
  const o = ctx.outfit;
  if (!o.belt) return;
  const { b } = ctx;
  const s = L.s;
  const y0 = o.belt.high ? L.chest - 0.045 * s : L.belt;
  const h = (o.belt.military ? 0.05 : o.belt.high ? 0.012 : 0.02) * s;
  const seg = ctx.hi ? 16 : 10;
  const extraT = (o.armor.body ? 0.03 : o.toga ? 0.03 : 0.012) * s;
  const metalStuds = o.belt.military;
  b.grid(
    seg,
    4,
    true,
    (i, j, v) => {
      const th = (i / seg) * Math.PI * 2;
      const yy = y0 + (j === 0 ? -h / 2 : j === 3 ? h / 2 : j === 1 ? -h / 2 + 0.002 * s : h / 2 - 0.002 * s);
      const [bx, bz] = torsoPoint(ctx, prof, L, y0, th);
      const zc = prof.at(y0).zc;
      const r = Math.hypot(bx, bz - zc);
      const out = extraT + (j === 1 || j === 2 ? 0.004 * s : 0);
      const k = (r + out) / r;
      v.x = bx * k;
      v.y = yy;
      v.z = zc + (bz - zc) * k;
      let c = o.belt!.color;
      let surf: Surf = SURF.leather;
      if (metalStuds && (j === 1 || j === 2) && i % 2 === 0) {
        c = srgb('#b08d4a');
        surf = SURF.bronze;
      }
      v.r = c.r;
      v.g = c.g;
      v.b = c.b;
      v.s = surf;
      v.w = [B.hips, 0.5, B.spine, 0.5];
    },
    'auto',
    () => [0, y0, prof.at(y0).zc],
  );
  if (o.belt.military && !o.toga) buildApron(ctx, L, prof, y0 - h / 2, extraT);
}

/** The military belt's apron of studded straps hanging in front. */
function buildApron(ctx: Ctx, L: Levels, prof: TorsoProfile, yTop: number, out: number) {
  const { b } = ctx;
  const s = L.s;
  const n = 5;
  const len = 0.2 * s;
  for (let k = 0; k < n; k++) {
    const th = Math.PI / 2 + (k - (n - 1) / 2) * 0.13;
    const [bx, bz] = torsoPoint(ctx, prof, L, yTop, th);
    const zc = prof.at(yTop).zc;
    const r = Math.hypot(bx, bz - zc);
    const kk = (r + out + 0.006 * s) / r;
    const x0 = bx * kk;
    const z0 = zc + (bz - zc) * kk;
    const hw = 0.009 * s;
    const ids: number[] = [];
    const rows = 5;
    for (let j = 0; j < rows; j++) {
      const t = j / (rows - 1);
      const y = yTop - t * len;
      const z = z0 + 0.012 * s * t;
      const stud = j > 0 && j < rows - 1 && j % 2 === 0;
      const c = stud ? srgb('#b89a55') : srgb('#3a281a');
      const surf = stud ? SURF.bronze : SURF.leather;
      const w: Weights = [B.hips, 1 - t * 0.6, B.thighL, t * 0.3, B.thighR, t * 0.3];
      ids.push(b.vertex({ x: x0 - hw, y, z, r: c.r, g: c.g, b: c.b, w, s: surf }));
      ids.push(b.vertex({ x: x0 + hw, y, z, r: c.r, g: c.g, b: c.b, w, s: surf }));
    }
    for (let j = 0; j < rows - 1; j++) {
      const a = ids[j * 2], c = ids[j * 2 + 1], d = ids[j * 2 + 3], e = ids[j * 2 + 2];
      // Front-facing (+z): (a, c, d) where a=left-top, c=right-top...
      b.quad(a, e, d, c);
    }
  }
}

// ------------------------------------------------------------------ assemble lower garments

export function buildLowerGarments(ctx: Ctx, L: Levels, prof: TorsoProfile) {
  const o = ctx.outfit;
  const s = L.s;
  const legK = { short: 0.7, knee: 0.66, long: 0.64 };
  if (o.toga) {
    const t = o.toga;
    const skirt = buildSkirt(ctx, L, prof, {
      top: L.waist + 0.02 * s,
      hem: L.ankle + 0.02 * s,
      color: t.color,
      trim: t.trim,
      surf: SURF.wool,
      flare: 0.07 * s,
      legK: 0.5,
      folds: 9,
      foldAmp: 0.012 * s,
      thickness: 0.025 * s,
      hemTilt: (th) => 0.06 * s * Math.max(0, -Math.cos(th)) * Math.max(0, Math.sin(th) + 0.3),
    });
    buildTogaDrape(ctx, L, prof, skirt);
  } else if (o.stola) {
    buildSkirt(ctx, L, prof, {
      top: L.waist + 0.04 * s,
      hem: L.ankle + 0.03 * s,
      color: o.stola.color,
      trim: o.stola.trim,
      surf: SURF.wool,
      flare: 0.06 * s,
      legK: 0.55,
      folds: 12,
      foldAmp: 0.008 * s,
      thickness: 0.012 * s,
      under: o.tunic ? { color: o.tunic.color, drop: 0.022 * s } : undefined,
    });
  } else if (o.tunic) {
    const hem = o.tunic.hem === 'short' ? L.hemShort : o.tunic.hem === 'knee' ? L.hemKnee : L.hemLong;
    buildSkirt(ctx, L, prof, {
      overlay: armorSkirtOverlay(ctx, L),
      top: L.waist,
      hem,
      color: o.tunic.color,
      trim: o.tunic.trim && !o.tunic.clavi ? o.tunic.trim : undefined,
      surf: SURF.wool,
      flare: (o.tunic.hem === 'long' ? 0.05 : 0.035) * s,
      legK: legK[o.tunic.hem],
      folds: 10,
      foldAmp: 0.007 * s,
      thickness: 0.008 * s,
    });
  }
  if (o.armor.body?.kind === 'leather') {
    // Pteruges: hanging leather strips below the cuirass.
    buildSkirt(ctx, L, prof, {
      top: L.waist,
      hem: L.hip - 0.13 * s,
      color: srgb('#5d4029'),
      surf: SURF.leather,
      flare: 0.03 * s,
      legK: 0.62,
      folds: 0,
      foldAmp: 0,
      thickness: 0.02 * s,
      strips: srgb('#2e2016'),
    });
  }
  if (o.palla && !o.toga) buildPallaWrap(ctx, L, prof, o.palla);
  if (o.apron && o.tunic) {
    buildSkirt(ctx, L, prof, {
      top: L.waist,
      hem: L.knee + 0.08 * s,
      color: o.apron.color,
      surf: SURF.linen,
      flare: 0.04 * s,
      legK: 0.6,
      folds: 7,
      foldAmp: 0.005 * s,
      thickness: 0.016 * s,
      hemTilt: (th) => (Math.sin(th) < -0.1 ? 0.3 * s : 0),
    });
  }
  buildBelt(ctx, L, prof);
}

// ------------------------------------------------------------------ toga / palla drapery

/**
 * Toga drapery over the long white body: the balteus (a gathered band from the left shoulder across
 * the chest to the right hip), the umbo (a pouch pulled up over it), the sinus (the great curved fold
 * hanging across the front from the right hip to the left forearm) and the lacinia (the end hanging
 * from the left shoulder). Togate figures hold the sinus on the bent left forearm (see poses.ts).
 */
function buildTogaDrape(ctx: Ctx, L: Levels, prof: TorsoProfile, skirt: SkirtSurface) {
  const o = ctx.outfit;
  const t = o.toga!;
  const s = L.s;
  const onBody = (x: number, y: number, out: number) => {
    const th = Math.PI / 2 - Math.asin(Math.max(-0.98, Math.min(0.98, x / (prof.at(y).a + 0.01 * s))));
    const [bx, bz] = torsoPoint(ctx, prof, L, y, th);
    const zc = prof.at(y).zc;
    const r = Math.hypot(bx, bz - zc);
    const k = (r + out) / r;
    return new THREE.Vector3(bx * k, y, zc + (bz - zc) * k);
  };
  // Balteus: a flat, gathered band.
  const pts: { p: THREE.Vector3; w: Weights }[] = [];
  pts.push({ p: new THREE.Vector3(0.11 * s, L.shTop + 0.012 * s, -0.07 * s), w: [B.chest, 0.6, B.shoulderL, 0.4] });
  pts.push({ p: new THREE.Vector3(0.125 * s, L.shTop + 0.022 * s, 0.0), w: [B.chest, 0.6, B.shoulderL, 0.4] });
  const N = ctx.hi ? 9 : 5;
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);
    const x = lerp(0.115 * s, -0.17 * s, k);
    const y = lerp(L.shoulder + 0.01 * s, L.waist - 0.02 * s, k);
    const w: Weights = y > L.chest ? [B.chest, 1] : y > L.waist ? [B.chest, 0.4, B.spine, 0.6] : [B.spine, 0.4, B.hips, 0.6];
    pts.push({ p: onBody(x, y, 0.03 * s), w });
  }
  tubeAlong(ctx, pts, 0.04 * s, t.color, t.trim, 0.34, 0.25);
  // Umbo: a soft pouch over the balteus, left of the sternum.
  const um = onBody(0.04 * s, L.chest - 0.02 * s, 0.05 * s);
  ellipsoid(ctx, um, 0.05 * s, 0.03 * s, 0.022 * s, shade(t.color, 0.97), [B.chest, 0.5, B.spine, 0.5], SURF.wool, 0.06);
  // Sinus: a hanging sheet from an upper attachment line to a sagging lower edge.
  const top = (u: number) => {
    const x = lerp(-0.17 * s, 0.215 * s, u);
    const y = lerp(L.waist - 0.04 * s, L.elbow - 0.03 * s, u);
    const p = u < 0.85 ? onBody(x, Math.max(y, L.crotch + 0.02 * s), 0.035 * s) : new THREE.Vector3(x, y, 0.06 * s + (u - 0.85) * 0.5 * s);
    if (u >= 0.85) {
      const q = onBody(0.85 * 0.215 * s + (1 - 0.85) * -0.17 * s, L.waist, 0.035 * s);
      p.z = Math.max(p.z, q.z + 0.03 * s * (u - 0.85) / 0.15);
    }
    return p;
  };
  const bottom = (u: number) => {
    const p = top(u);
    const sag = 0.3 * s * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 0.85);
    const y = p.y - sag - 0.04 * s;
    const z = Math.max(p.z + 0.03 * s, skirt(p.x, y) + 0.03 * s + 0.02 * s * Math.sin(Math.PI * u));
    return new THREE.Vector3(p.x, y, z);
  };
  const sinusW = (u: number, v: number): Weights => {
    const wt = smooth(0.2, 1, v) * 0.35;
    let w: Weights = [B.hips, 1 - wt, B.thighL, wt * u, B.thighR, wt * (1 - u)];
    if (u > 0.7) w = mixW(w, [B.forearmL, 1], smooth(0.7, 1, u) * lerp(1, 0.6, v));
    return w;
  };
  plate(
    ctx,
    ctx.hi ? 12 : 6,
    ctx.hi ? 4 : 2,
    (u, v) => {
      const a = top(u);
      const b2 = bottom(u);
      const p = a.clone().lerp(b2, v);
      p.z = Math.max(p.z, skirt(p.x, p.y) + 0.018 * s) + Math.sin(Math.PI * v) * 0.015 * s + Math.sin(u * 22) * 0.004 * s * v;
      return p;
    },
    () => new THREE.Vector3(0, 0.2, 1).normalize(),
    (u, v) => shade(t.color, 0.84 + 0.14 * (0.5 + 0.5 * Math.sin(u * 22)) - 0.06 * v),
    SURF.wool,
    sinusW,
    0.004 * s,
  );
  // Rolled lower edge of the sinus.
  const edge: { p: THREE.Vector3; w: Weights }[] = [];
  const M = ctx.hi ? 12 : 6;
  for (let i = 0; i <= M; i++) {
    const u = i / M;
    edge.push({ p: bottom(u).add(new THREE.Vector3(0, 0.008 * s, 0.004 * s)), w: sinusW(u, 1) });
  }
  tubeAlong(ctx, edge, 0.017 * s, shade(t.color, 0.95), t.trim, 0.7, 0.1);
  // Lacinia: the toga end hanging from the left shoulder down the front to mid-shin.
  plate(
    ctx,
    3,
    ctx.hi ? 6 : 3,
    (u, v) => {
      const y = lerp(L.shoulder + 0.005 * s, L.knee - 0.14 * s, v);
      const x = lerp(0.075 * s, 0.17 * s, u) + v * 0.02 * s;
      const yy = Math.max(y, L.crotch + 0.02 * s);
      const base = onBody(x, yy, 0.04 * s);
      const z = Math.max(base.z, y < L.waist ? skirt(x, y) + 0.012 * s : base.z) + 0.006 * s * v;
      return new THREE.Vector3(x, y, z + Math.sin(u * Math.PI * 3) * 0.006 * s);
    },
    () => new THREE.Vector3(0, 0, 1),
    (u) => (t.trim && u > 0.85 ? t.trim.clone() : shade(t.color, 0.86 + 0.12 * Math.sin(u * Math.PI * 3))),
    SURF.wool,
    (u, v) => (v < 0.25 ? [B.chest, 1] : v < 0.55 ? [B.chest, 0.3, B.hips, 0.7] : [B.hips, 0.6, B.thighL, 0.4]),
    0.005 * s,
  );
}

/** The palla wrapped around the hips and over the left shoulder (matrons). */
function buildPallaWrap(ctx: Ctx, L: Levels, prof: TorsoProfile, p: Cloth) {
  const s = L.s;
  buildSkirt(ctx, L, prof, {
    top: L.waist + 0.03 * s,
    hem: L.knee - 0.06 * s,
    color: p.color,
    trim: p.trim,
    surf: SURF.wool,
    flare: 0.075 * s,
    legK: 0.45,
    folds: 8,
    foldAmp: 0.012 * s,
    thickness: 0.03 * s,
    hemTilt: (th) => 0.1 * s * (0.5 + 0.5 * Math.cos(th)),
  });
  const pts: { p: THREE.Vector3; w: Weights }[] = [];
  const N = ctx.hi ? 8 : 5;
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);
    const x = lerp(0.13 * s, -0.17 * s, k);
    const y = lerp(L.shoulder + 0.01 * s, L.waist + 0.02 * s, k);
    const th2 = Math.PI / 2 - Math.asin(Math.max(-0.98, Math.min(0.98, x / (0.17 * s))));
    const [bx, bz] = torsoPoint(ctx, prof, L, y, th2);
    const zc = prof.at(y).zc;
    const r = Math.hypot(bx, bz - zc);
    const out = (r + 0.03 * s) / r;
    pts.push({ p: new THREE.Vector3(bx * out, y, zc + (bz - zc) * out), w: y > L.chest ? [B.chest, 1] : [B.spine, 0.6, B.chest, 0.4] });
  }
  pts.unshift({ p: new THREE.Vector3(0.14 * s, L.shTop + 0.02 * s, -0.03 * s), w: [B.chest, 0.6, B.shoulderL, 0.4] });
  tubeAlong(ctx, pts, 0.03 * s, p.color, p.trim);
}

/** A soft rolled cloth tube along points (skinned per point). */
export function tubeAlong(ctx: Ctx, pts: { p: THREE.Vector3; w: Weights }[], radius: number, color: THREE.Color, trim?: THREE.Color, flat = 0.7, gather = 0.15) {
  const { b } = ctx;
  const seg = ctx.hi ? 7 : 5;
  const tang = new THREE.Vector3();
  const n1 = new THREE.Vector3();
  const n2 = new THREE.Vector3();
  const up = new THREE.Vector3(0, 0, 1);
  const g = b.grid(
    seg,
    pts.length,
    true,
    (i, j, v) => {
      const a = pts[Math.max(0, j - 1)].p;
      const c = pts[Math.min(pts.length - 1, j + 1)].p;
      tang.subVectors(c, a).normalize();
      n1.crossVectors(tang, up).normalize();
      if (n1.lengthSq() < 1e-6) n1.set(1, 0, 0);
      n2.crossVectors(n1, tang).normalize();
      const th = (i / seg) * Math.PI * 2;
      const r = radius * (1 + gather * Math.sin(th * 3 + j * 1.7) + gather * 0.6 * Math.sin(j * 2.9));
      const p = pts[j].p;
      v.x = p.x + (Math.cos(th) * n1.x * r + Math.sin(th) * n2.x * r * flat);
      v.y = p.y + (Math.cos(th) * n1.y * r + Math.sin(th) * n2.y * r * flat);
      v.z = p.z + (Math.cos(th) * n1.z * r + Math.sin(th) * n2.z * r * flat);
      let col = shade(color, 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(th + 1.2)));
      if (trim && Math.sin(th) < -0.6) col = trim.clone();
      v.r = col.r;
      v.g = col.g;
      v.b = col.b;
      v.s = SURF.wool;
      v.w = pts[j].w;
    },
    'auto',
    (j) => [pts[j].p.x, pts[j].p.y, pts[j].p.z],
  );
  const first = pts[0];
  const last = pts[pts.length - 1];
  const d0 = first.p.clone().sub(pts[1].p).normalize();
  const d1 = last.p.clone().sub(pts[pts.length - 2].p).normalize();
  b.capAuto(g, seg, 0, { x: first.p.x, y: first.p.y, z: first.p.z, r: color.r, g: color.g, b: color.b, w: first.w, s: SURF.wool }, [d0.x, d0.y, d0.z]);
  b.capAuto(g, seg, pts.length - 1, { x: last.p.x, y: last.p.y, z: last.p.z, r: color.r, g: color.g, b: color.b, w: last.w, s: SURF.wool }, [d1.x, d1.y, d1.z]);
}

/** Small closed ellipsoid (rigid, one weight set). */
export function ellipsoid(ctx: Ctx, c: THREE.Vector3, rx: number, ry: number, rz: number, color: THREE.Color, w: Weights, surf: Surf = SURF.wool, bumps = 0) {
  const { b } = ctx;
  const seg = ctx.hi ? 10 : 6;
  const rows = ctx.hi ? 6 : 4;
  const g = b.grid(
    seg,
    rows,
    true,
    (i, j, v) => {
      const a = ((j + 1) / (rows + 1)) * Math.PI;
      const th = (i / seg) * Math.PI * 2;
      const k = 1 + bumps * Math.sin(th * 4 + j * 1.7);
      v.x = c.x + Math.sin(a) * Math.cos(th) * rx * k;
      v.y = c.y + Math.cos(a) * ry * k;
      v.z = c.z + Math.sin(a) * Math.sin(th) * rz * k;
      const col = shade(color, 0.85 + 0.15 * Math.cos(a - 0.6));
      v.r = col.r;
      v.g = col.g;
      v.b = col.b;
      v.s = surf;
      v.w = w;
    },
    'auto',
    () => [c.x, c.y, c.z],
  );
  b.capAuto(g, seg, 0, { x: c.x, y: c.y + ry, z: c.z, r: color.r, g: color.g, b: color.b, w, s: surf }, [0, 1, 0]);
  b.capAuto(g, seg, rows - 1, { x: c.x, y: c.y - ry, z: c.z, r: color.r * 0.8, g: color.g * 0.8, b: color.b * 0.8, w, s: surf }, [0, -1, 0]);
}

