/**
 * The existing helmets (build/armor.ts buildHelmet), veils (build/head.ts buildVeil) and the Vestal's
 * infula, fitted to a realistic head. Their code asks an old-style HeadFrame (`at`, `c`, `hs`, `H`, ...);
 * `legacyFrame` answers from the measured HeadSurface, with the ears pushed back in so bowls and cloth clear
 * them. The geometry comes out as one avatarMaterial mesh skinned to the head bone (and the neck/chest for
 * the veil's hanging ends), like the procedural avatar's own helmet.
 */
import * as THREE from 'three';
import type { Appearance } from '../../../appearance';
import type { Rig } from '../../rig';
import { B } from '../../rig';
import { buildHelmet } from '../../build/armor';
import { levels } from '../../build/body';
import { makeCtx, mixC, shade, smooth, srgb, lerp } from '../../build/common';
import { buildVeil, type HeadFrame } from '../../build/head';
import { resolveOutfit } from '../../build/outfit';
import { SURF } from '../../SkinBuilder';
import { avatarMaterial } from '../../material';
import type { HeadSurface } from './frame';
import { hasBaked } from '../garments/baked';

const smooth01 = (a: number, b: number, x: number) => smooth(a, b, x);

/** Helmets that close over the ears (no hair or face under them). */
export const ENCLOSING = new Set(['murmillo', 'thraex', 'hoplomachus', 'secutor', 'provocator']);

/** Adapt a HeadSurface to the old procedural HeadFrame contract. */
export function legacyFrame(H: HeadSurface, app: Appearance): HeadFrame {
  const hasHelmet = !!app.armor?.helmet && app.armor.helmet.kind !== 'pileus';
  const earBottomYf = (H.earBottom - H.chin) / H.H;
  const earTopYf = (H.earTop - H.chin) / H.H;
  const tmp = new THREE.Vector3();
  const f: HeadFrame = {
    c: H.centre.clone(),
    chin: H.chin,
    H: H.H,
    hs: H.hs,
    eyes: H.eyes.map((e) => e.clone()),
    face: { nose: 1, noseW: 1, noseProj: 1, chin: 1, brow: 1, lips: 1 },
    hasHelmet,
    sculptNose: false,
    hairline: () => 0.75,
    at(yf, th, out = new THREE.Vector3()) {
      H.at(yf, th, out);
      // The ears stand out of the skull: keep cloth and bowls clear of them.
      const y = Math.min(1, Math.max(0, yf));
      const a = Math.abs(Math.atan2(Math.sin(th), Math.cos(th)));
      const e = smooth01(earBottomYf - 0.04, earBottomYf + 0.04, y) * smooth01(earTopYf + 0.04, earTopYf - 0.04, y) * smooth01(0.75, 1.1, a) * smooth01(2.2, 1.9, a);
      if (e > 0) {
        const r = Math.hypot(out.x, out.z - H.cz);
        const k = (r + 0.8 * H.earOut * e) / r;
        out.x *= k;
        out.z = H.cz + (out.z - H.cz) * k;
      }
      return out;
    },
    surface(u, v, w, out = new THREE.Vector3()) {
      const th = Math.atan2(u, w);
      const yf = v >= 0 ? 0.6 + v * 0.4 : 0.6 + v * 0.6;
      return f.at(yf, th, out);
    },
  };
  void tmp;
  return f;
}

export interface GearResult {
  geometry: THREE.BufferGeometry;
  triangles: number;
}

/** Build the helmet / veil / infula of an appearance on a real head, or null if it wears none. */
export function buildGear(app: Appearance, rig: Rig, H: HeadSurface, lod: 0 | 1 | 2): GearResult | null {
  const helmet = app.armor?.helmet;
  const style = app.hair.style;
  const veiled = style === 'veiled' || style === 'vestal';
  if (!helmet && !veiled) return null;
  const outfit = resolveOutfit(app);
  const ctx = makeCtx(rig, app, outfit, lod === 0 ? 'high' : 'low');
  const frame = legacyFrame(H, app);
  const L = levels(rig);
  if (helmet) buildHelmet(ctx, frame, helmet.kind, helmet.crest, helmet.metal);
  else if (veiled) {
    // A priest's veil is his toga drawn over the head: the baked toga velata (garments/fit.ts) when it exists.
    if (style === 'veiled' && outfit.toga && hasBaked(app.sex, 'toga_velata', lod)) return null;
    buildVeil(ctx, frame, L, style);
    if (style === 'vestal') infula(ctx, H);
  }
  if (ctx.b.vertexCount === 0) return null;
  const geometry = ctx.b.build();
  geometry.name = `real:headgear:${helmet ? helmet.kind : style}`;
  return { geometry, triangles: ctx.b.triangleCount };
}

const RED = srgb('#a8352b');
const WHITE = srgb('#efe9dc');

/** The Vestal's infula: twisted red and white woollen bands across the brow, with two fillets hanging at the sides. */
function infula(ctx: ReturnType<typeof makeCtx>, H: HeadSurface) {
  const { b } = ctx;
  const hs = H.hs;
  const cols = 30;
  const rows = 3;
  const frame = legacyFrame(H, ctx.app);
  const p = new THREE.Vector3();
  const A = 1.95;
  b.grid(
    cols,
    rows,
    false,
    (i, j, v) => {
      const th = lerp(-A, A, i / (cols - 1));
      const yf = 0.7 + j * 0.032;
      frame.at(yf, th, p);
      const n = p.clone().sub(H.centre);
      n.y *= 0.5;
      n.normalize();
      p.addScaledVector(n, 0.0072 * hs + 0.0012 * hs * Math.sin(th * 14));
      v.x = p.x;
      v.y = p.y;
      v.z = p.z;
      const c = (i + (j > 0 ? 1 : 0)) % 2 ? RED : WHITE;
      const cc = shade(c, 0.9 + 0.1 * Math.sin(i * 1.7 + j));
      v.r = cc.r;
      v.g = cc.g;
      v.b = cc.b;
      v.w = [B.head, 1];
      v.s = SURF.wool;
    },
    'auto',
    () => [H.centre.x, H.centre.y, H.centre.z],
  );
  // Two fillets (vittae) hanging from above the ears onto the shoulders.
  for (const side of [1, -1]) {
    const seg = 6;
    const start = frame.at(0.64, side * 1.75, new THREE.Vector3());
    start.x += side * 0.004 * hs;
    b.grid(
      2,
      seg,
      false,
      (i, j, v) => {
        const t = j / (seg - 1);
        v.x = start.x + side * (0.012 * hs + 0.02 * hs * t) + (i - 0.5) * 0.012 * hs;
        v.y = start.y - t * 0.3 * hs;
        v.z = start.z - 0.02 * hs * t + 0.012 * hs * (1 - t);
        const c = mixC(WHITE, RED, (j % 2) * 0.9);
        v.r = c.r;
        v.g = c.g;
        v.b = c.b;
        v.w = t < 0.4 ? [B.head, 1] : [B.head, 1 - t, B.neck, t];
        v.s = SURF.wool;
      },
      'auto',
      () => [start.x, start.y - 0.1, start.z - 0.03],
    );
  }
}

/** The mesh for gear geometry (the caller binds it to the avatar's skeleton). */
export function gearMesh(g: GearResult): THREE.SkinnedMesh {
  const m = new THREE.SkinnedMesh(g.geometry, avatarMaterial());
  m.name = 'real:headgear';
  m.castShadow = true;
  m.receiveShadow = true;
  m.frustumCulled = false;
  return m;
}
