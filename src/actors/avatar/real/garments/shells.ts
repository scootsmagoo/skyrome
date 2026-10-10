/**
 * Shell garments for the realistic bodies (C2d): everything that stands off the body as cloth with its
 * own volume. Tunic and stola skirts, apron, pteruges, the toga (skirt, balteus, umbo, sinus, lacinia),
 * the palla wrap, belts, and the cloaks (paenula, sagum, lacerna). One skinned mesh in the avatar
 * material's contract (position, normal, color, surf, skinIndex, skinWeight), built in the bind pose
 * of the morphed body and weighted to the same 25-bone skeleton.
 *
 * The designs are the procedural avatar's (build/garments.ts, build/cloak.ts): the skirts are refitted
 * lofts (skirt.ts) and the drapery and cloaks run the original builders on a TorsoProfile whose surface
 * is sampled from the real mesh (profile.ts), so the cloth keeps its hems, folds, colours and surf
 * patterns but stands 0.5 to 2 cm off the actual skin instead of off a superellipse.
 *
 * `hide` marks body vertices that sit under a skirt well inside it, so no skin shows through or
 * z-fights; vertices near a hem, on the arms, head and feet are never hidden.
 */
import * as THREE from 'three';
import { B } from '../../rig';
import { SURF } from '../../SkinBuilder';
import { TorsoProfile, levels, type Levels } from '../../build/body';
import { makeCtx, srgb, type Ctx } from '../../build/common';
import { resolveOutfit } from '../../build/outfit';
import { armorSkirtOverlay } from '../../build/armor';
import { buildBelt, type SkirtSpec } from '../../build/garments';
import { BodyProfile, ARM_BONES, HEAD_BONES, boneWeight } from './profile';
import { buildRealSkirt, type SkirtCover } from './skirt';
import { buildTogaDrapery } from './drape';
import { buildRealCloak, buildRealPalla } from './cloaks';
import { bakedPlan, fitBaked, type FittedGarment } from './fit';
import type { BuildShells, RealContext } from '../types';

/** The torso profile of the procedural builders, answering from the real body's silhouette. */
class RealProfile extends TorsoProfile {
  constructor(ctx: Ctx, L: Levels, readonly bp: BodyProfile) {
    super(ctx, L);
    this.sample = (y, th) => bp.point(y, th);
  }
  override at(y: number) {
    return { ...this.bp.section(y), n: 2.5 };
  }
}

const profileCache = new WeakMap<object, { core: BodyProfile; wide?: BodyProfile }>();

function profiles(ctx: RealContext) {
  let p = profileCache.get(ctx.body.position);
  if (!p) {
    p = { core: new BodyProfile(ctx.body, ctx.rig, false) };
    profileCache.set(ctx.body.position, p);
  }
  return p;
}

export const buildShells: BuildShells = (rc) => {
  const outfit = resolveOutfit(rc.app);
  // Garments baked by cloth simulation (fit.ts) replace their procedural shells; the rest stay procedural.
  const plan = bakedPlan(rc, outfit);
  const ctx = makeCtx(rc.rig, rc.app, outfit, rc.lod >= 2 ? 'low' : 'high');
  const L = levels(rc.rig);
  const pr = profiles(rc);
  const bp = pr.core;
  const prof = new RealProfile(ctx, L, bp);
  const covers: SkirtCover[] = [];
  const skirt = (sp: SkirtSpec) => {
    const built = buildRealSkirt(ctx, L, bp, sp);
    covers.push(built.cover);
    return built.surface;
  };
  const o = outfit;
  const s = L.s;
  const legK = { short: 0.7, knee: 0.66, long: 0.64 };
  if (o.toga && !plan.toga) {
    const t = o.toga;
    const built = buildRealSkirt(ctx, L, bp, {
      top: L.waist + 0.02 * s,
      hem: L.ankle + 0.02 * s,
      color: t.color,
      trim: t.trim,
      surf: SURF.wool,
      flare: 0.07 * s,
      legK: 0.92,
      folds: 12,
      foldAmp: 0.05 * s,
      thickness: 0.015 * s,
      hemTilt: (th) => 0.06 * s * Math.max(0, -Math.cos(th)) * Math.max(0, Math.sin(th) + 0.3),
    });
    covers.push(built.cover);
    pr.wide ??= new BodyProfile(rc.body, rc.rig, true);
    buildTogaDrapery({ ctx, L, bp, wide: pr.wide, skirtR: built.radiusAt });
  } else if (o.toga) {
    // Baked toga.
  } else if (o.stola) {
    if (!plan.stola) {
      skirt({
        top: L.waist + 0.04 * s,
        hem: L.ankle + 0.03 * s,
        color: o.stola.color,
        trim: o.stola.trim,
        surf: SURF.wool,
        flare: 0.06 * s,
        legK: 0.94,
        folds: 14,
        foldAmp: 0.016 * s,
        thickness: 0.01 * s,
        under: o.tunic ? { color: o.tunic.color, drop: 0.022 * s } : undefined,
      });
    }
  } else if (o.tunic && !plan.tunic) {
    const hem = o.tunic.hem === 'short' ? L.hemShort : o.tunic.hem === 'knee' ? L.hemKnee : L.hemLong;
    skirt({
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
    skirt({
      top: L.waist,
      hem: L.hip - 0.13 * s,
      color: srgb('#5d4029'),
      surf: SURF.leather,
      flare: 0.03 * s,
      legK: 0.62,
      folds: 0,
      foldAmp: 0,
      thickness: 0.016 * s,
      strips: srgb('#2e2016'),
    });
  }
  if (o.apron && o.tunic) {
    skirt({
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
  let cloakFrom = 0;
  let cloakTo = 0;
  const procPalla = !!o.palla && !o.toga && !plan.palla;
  const procCloak = !!o.cloak && !plan.cloak;
  if (procCloak || procPalla) {
    // Cloaks and the palla hang over the shoulders and the upper arms: they ride the wide silhouette.
    pr.wide ??= new BodyProfile(rc.body, rc.rig, true);
    cloakFrom = ctx.b.vertexCount;
    if (procPalla) buildRealPalla(ctx, L, pr.wide);
    if (procCloak) buildRealCloak(ctx, L, pr.wide);
    cloakTo = ctx.b.vertexCount;
  }
  const baked = plan.ids.length ? fitBaked(rc, plan, outfit) : null;
  if (ctx.b.vertexCount === 0 && !baked?.garments.length) return null;
  const proc = ctx.b.vertexCount ? ctx.b.build() : null;
  if (proc && cloakTo > cloakFrom) {
    keepOutside(proc, pr.wide!, cloakFrom, cloakTo, 0.008 * s);
    proc.computeVertexNormals();
  }
  const geometry = mergeShells(proc, baked?.garments ?? []);
  geometry.name = `real:shells:${rc.sex}:lod${rc.lod}`;
  geometry.computeBoundingSphere();
  const hide = coverMask(rc, bp, covers, s);
  if (baked) for (let v = 0; v < hide.length; v++) hide[v] |= baked.hide[v];
  return { geometry, hide };
};

/**
 * One geometry for the procedural pieces and the fitted baked garments, in the shell material's layout (see
 * fit.ts): the procedural vertices get neutral cloth/trim/clavus/legs values (their patterns ignore them).
 */
export function mergeShells(proc: THREE.BufferGeometry | null, garments: FittedGarment[]): THREE.BufferGeometry {
  const pn = proc ? proc.getAttribute('position').count : 0;
  let n = pn;
  let ni = proc ? proc.index!.count : 0;
  for (const g of garments) {
    n += g.count;
    ni += g.index.length;
  }
  const position = new Float32Array(n * 3);
  const normal = new Float32Array(n * 3);
  const color = new Float32Array(n * 3);
  const surf = new Uint8Array(n * 4);
  const skinIndex = new Uint8Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const cloth = new Float32Array(n * 4);
  const trim = new Float32Array(n * 4);
  const clavus = new Float32Array(n * 4);
  const legs = new Float32Array(n * 4);
  const index = n > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0;
  let io = 0;
  if (proc) {
    position.set(proc.getAttribute('position').array as Float32Array);
    normal.set(proc.getAttribute('normal').array as Float32Array);
    color.set(proc.getAttribute('color').array as Float32Array);
    surf.set(proc.getAttribute('surf').array as Uint8Array);
    skinIndex.set(proc.getAttribute('skinIndex').array as Uint8Array);
    skinWeight.set(proc.getAttribute('skinWeight').array as Float32Array);
    for (let i = 0; i < pn; i++) cloth[i * 4] = 9;
    index.set(proc.index!.array as ArrayLike<number>);
    vo = pn;
    io = proc.index!.count;
    proc.dispose();
  }
  for (const g of garments) {
    position.set(g.position, vo * 3);
    normal.set(g.normal, vo * 3);
    color.set(g.color, vo * 3);
    surf.set(g.surf, vo * 4);
    skinIndex.set(g.skinIndex, vo * 4);
    skinWeight.set(g.skinWeight, vo * 4);
    cloth.set(g.cloth, vo * 4);
    trim.set(g.trim, vo * 4);
    clavus.set(g.clavus, vo * 4);
    legs.set(g.legs, vo * 4);
    for (let k = 0; k < g.index.length; k++) index[io + k] = g.index[k] + vo;
    vo += g.count;
    io += g.index.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geo.setAttribute('surf', new THREE.BufferAttribute(surf, 4, true));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  geo.setAttribute('cloth', new THREE.BufferAttribute(cloth, 4));
  geo.setAttribute('trim', new THREE.BufferAttribute(trim, 4));
  geo.setAttribute('clavus', new THREE.BufferAttribute(clavus, 4));
  geo.setAttribute('legs', new THREE.BufferAttribute(legs, 4));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  return geo;
}

/**
 * Body vertices covered by a skirt: the pelvis (hips and spine weights only) between a hand's breadth above
 * the hem and just under the top edge. Limbs, arms, head and feet are never hidden.
 */
function coverMask(rc: RealContext, bp: BodyProfile, covers: SkirtCover[], s: number): Uint8Array {
  const body = rc.body;
  const n = body.position.length / 3;
  const hide = new Uint8Array(n);
  if (!covers.length) return hide;
  // The shortest skirt decides what is certainly covered: the highest hem, the lowest top.
  // Only the pelvis is hidden: a thigh or shin can swing out of the cloth in a stride, and a hidden limb
  // outside the cloth would simply vanish (a foot floating below the hem).
  const free = [...ARM_BONES, ...HEAD_BONES, B.chest, B.neck, B.thighL, B.thighR, B.shinL, B.shinR, B.footL, B.footR, B.toeL, B.toeR];
  for (let v = 0; v < n; v++) {
    if (boneWeight(body, v, free) > 0.02) continue;
    const x = body.position[v * 3];
    const y = body.position[v * 3 + 1];
    const z = body.position[v * 3 + 2];
    let th = Math.atan2(z - bp.centre(y), x);
    if (th < 0) th += Math.PI * 2;
    for (const c of covers) {
      if (y < c.hem(th) + 0.07 * s || y > c.top - 0.02 * s) continue;
      hide[v] = 1;
      break;
    }
  }
  return hide;
}

/** Push vertices [from, to) out to at least `gap` beyond the body silhouette (cloth never inside the skin). */
function keepOutside(geometry: THREE.BufferGeometry, bp: BodyProfile, from: number, to: number, gap: number) {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const yMax = bp.top - 0.12;
  for (let v = from; v < to; v++) {
    const y = pos.getY(v);
    if (y > yMax) continue;
    const zc = bp.centre(y);
    const x = pos.getX(v);
    const dz = pos.getZ(v) - zc;
    const r = Math.hypot(x, dz);
    if (r < 1e-4) continue;
    const need = bp.radius(y, Math.atan2(dz, x)) + gap;
    if (r < need) pos.setXYZ(v, (x / r) * need, y, zc + (dz / r) * need);
  }
}
