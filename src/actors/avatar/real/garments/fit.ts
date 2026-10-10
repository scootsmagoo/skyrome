/**
 * Baked garments on a person: which baked garments an outfit wears (`bakedPlan`), the rules each follows
 * (bones its cloth may follow, the skirt rule below the hips, the skin it hides), and the fit to the person's
 * morphed body with colours, borders, clavi and the leg data the cloth material uses to keep legs inside skirts.
 *
 * Output per garment: plain typed arrays in the shell geometry's layout (shells.ts merges them with the
 * procedural pieces that remain: belts, armour skirts, aprons):
 *   position, normal, color, surf (u8: roughness, occlusion, pattern 12 wool / 13 linen, rim flag),
 *   skinIndex (u8), skinWeight, index, and
 *   cloth  (vec4: distance to the bordered edge (m), 0, pattern u, pattern v)
 *   trim   (vec4: border colour (linear), band width (m); 0 = no band)
 *   clavus (vec4: distance to the nearest clavus centre along the cloth (m), 0, half width, 2 = draw)
 *   legs   (vec4: leg axis |x| and z at the vertex's height, leg radius + clearance, 1 thigh / 2 shin / 0 none)
 */
import type { Sex } from '../../../appearance';
import { B, PARENT_INDEX, type BoneName, type Rig } from '../../rig';
import { levels, type Levels } from '../../build/body';
import { resolveOutfit, type Outfit } from '../../build/outfit';
import { srgb } from '../../build/common';
import { refRig } from '../refs';
import type { BodyArrays } from '../morph';
import type { RealContext } from '../types';
import { fitGarment, type WeightPolicy } from './bind';
import { boundGarment, coveredVertices, hasBaked, registerGarmentRules, type BakedId, type BakedMesh, type GarmentRules } from './baked';

/** Pattern ids of the baked cloth in the avatar material's surf contract (see clothMaterial.ts). */
export const PATTERN_BAKED_WOOL = 12;
export const PATTERN_BAKED_LINEN = 13;

export interface FittedGarment {
  id: BakedId;
  count: number;
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  surf: Uint8Array;
  skinIndex: Uint8Array;
  skinWeight: Float32Array;
  cloth: Float32Array;
  trim: Float32Array;
  clavus: Float32Array;
  legs: Float32Array;
  index: Uint32Array;
}

/** Which garments of an outfit come from the baked library (the rest stay procedural). */
export interface BakedPlan {
  ids: BakedId[];
  toga: boolean;
  stola: boolean;
  tunic: boolean;
  palla: boolean;
  cloak: boolean;
}

interface Spec {
  fabric: 'wool' | 'linen';
  rough: number;
  /** Bones the cloth may follow. */
  bones: BoneName[];
  /** Weight smoothing passes over the garment. */
  passes: number;
  /** Skirt rule: from `top` down the weights blend to hips + thighs (+ shins) by the side of the body. */
  skirt?: (L: Levels, sex: Sex) => { top: number; hem: number; legK: number; shinK: number; parts?: number[]; below?: number; strength: number };
  /** Bones whose skin may be hidden under the cloth, and how far above the hem hiding stops. */
  hide: BoneName[];
  hideMax: number;
  hideAboveHem?: (L: Levels, sex: Sex) => number;
  /** Legs push the cloth (vertices below the crotch). */
  legs: boolean;
  /**
   * Clearance (m at s = 1) the legs keep from this cloth, by part: outer layers (a toga's mantle over its
   * wrap, a cloak over a tunic) keep more, so a leg pushing both never presses them into one surface.
   */
  clear?: (part: number) => number;
  /** Border band width (m at s = 1). */
  band: number;
}

const LEG_BONES: BoneName[] = ['thighL', 'thighR', 'shinL', 'shinR'];
const TORSO: BoneName[] = ['hips', 'spine', 'chest'];

function tunicTop(L: Levels, sex: Sex) {
  return sex === 'female' ? L.chest - 0.045 * L.s : L.belt;
}

const skirtSpec = (hem: 'short' | 'knee' | 'long'): Spec => ({
  fabric: 'wool',
  rough: 0.93,
  bones: [...TORSO, ...LEG_BONES],
  passes: 4,
  skirt: (L, sex) => ({
    top: tunicTop(L, sex),
    hem: hem === 'short' ? L.hemShort : hem === 'knee' ? L.hemKnee : L.hemLong,
    legK: hem === 'long' ? 0.62 : 0.6,
    shinK: hem === 'long' ? 0.4 : 0,
    strength: 1,
  }),
  // Under a long skirt the knees and shins are hidden too (down to a hand above the hem): the leg push keeps
  // them under the cloth, and where it cannot (a knee driven through the cloth in a sprint) a dent shows, not skin.
  hide: hem === 'long' ? ['hips', 'spine', 'thighL', 'thighR', 'shinL', 'shinR'] : ['hips', 'spine', 'thighL', 'thighR'],
  hideMax: hem === 'long' ? 0.12 : 0.09,
  hideAboveHem: (L) => (hem === 'short' ? 0.1 : 0.16) * L.s,
  legs: true,
  band: 0.025,
});

const SPECS: Record<BakedId, Spec> = {
  tunic_short: skirtSpec('short'),
  tunic_knee: skirtSpec('knee'),
  tunic_long: skirtSpec('long'),
  stola: {
    fabric: 'linen',
    rough: 0.86,
    bones: [...TORSO, 'neck', 'shoulderL', 'shoulderR', ...LEG_BONES],
    passes: 4,
    skirt: (L) => ({ top: L.chest - 0.045 * L.s, hem: L.hemLong, legK: 0.62, shinK: 0.4, strength: 1 }),
    hide: ['hips', 'spine', 'chest', 'thighL', 'thighR', 'shinL', 'shinR'],
    hideMax: 0.12,
    hideAboveHem: (L) => 0.16 * L.s,
    legs: true,
    band: 0.03,
  },
  toga: {
    fabric: 'wool',
    rough: 0.95,
    bones: [...TORSO, 'neck', 'shoulderL', 'upperArmL', ...LEG_BONES],
    passes: 6,
    // Part 0 is the lower wrap (a skirt from the waist); every other part hangs free below the crotch.
    skirt: (L) => ({ top: L.waist, hem: L.hemLong, legK: 0.58, shinK: 0.35, parts: [0], below: L.crotch, strength: 1 }),
    hide: ['hips', 'spine', 'chest', 'shoulderL', 'upperArmL', 'thighL', 'thighR', 'shinL', 'shinR'],
    hideMax: 0.12,
    hideAboveHem: (L) => 0.16 * L.s,
    legs: true,
    clear: (part) => (part === 0 ? 0.012 : 0.032),
    band: 0.06,
  },
  toga_velata: {
    fabric: 'wool',
    rough: 0.95,
    // The drape from the head also covers the right shoulder and upper arm.
    bones: [...TORSO, 'neck', 'head', 'shoulderL', 'upperArmL', 'shoulderR', 'upperArmR', ...LEG_BONES],
    passes: 6,
    skirt: (L) => ({ top: L.waist, hem: L.hemLong, legK: 0.58, shinK: 0.35, parts: [0], below: L.crotch, strength: 1 }),
    hide: ['hips', 'spine', 'chest', 'shoulderL', 'upperArmL', 'thighL', 'thighR', 'shinL', 'shinR'],
    hideMax: 0.12,
    hideAboveHem: (L) => 0.16 * L.s,
    legs: true,
    clear: (part) => (part === 0 ? 0.012 : 0.032),
    band: 0.06,
  },
  palla: {
    fabric: 'wool',
    rough: 0.94,
    bones: [...TORSO, 'neck', 'shoulderL', 'shoulderR', 'upperArmL', 'upperArmR', 'forearmL', ...LEG_BONES],
    passes: 6,
    // Below the hips an outer layer moves exactly like the skirt it hangs over (the stola's rule for a woman, the
    // tunic's for a man): with weaker leg weights the skirt underneath strode through it.
    skirt: (L, sex) => (sex === 'female' ? { top: L.chest - 0.045 * L.s, hem: L.hemLong, legK: 0.62, shinK: 0.4, below: L.crotch, strength: 1 } : { top: L.belt, hem: L.hemKnee, legK: 0.6, shinK: 0, below: L.crotch, strength: 1 }),
    hide: ['spine', 'chest'],
    hideMax: 0.1,
    legs: true,
    clear: () => 0.035,
    band: 0.03,
  },
  paenula: {
    fabric: 'wool',
    rough: 0.95,
    bones: [...TORSO, 'neck', 'shoulderL', 'shoulderR', 'upperArmL', 'upperArmR', ...LEG_BONES],
    passes: 8,
    skirt: (L) => ({ top: L.belt, hem: L.hemKnee, legK: 0.6, shinK: 0, below: L.crotch, strength: 1 }),
    hide: ['spine', 'chest'],
    hideMax: 0.12,
    legs: true,
    clear: () => 0.035,
    band: 0,
  },
  sagum: {
    fabric: 'wool',
    rough: 0.95,
    bones: [...TORSO, 'neck', 'shoulderL', 'shoulderR', 'upperArmL', 'upperArmR', ...LEG_BONES],
    passes: 8,
    skirt: (L) => ({ top: L.belt, hem: L.hemKnee, legK: 0.6, shinK: 0, below: L.crotch, strength: 1 }),
    hide: [],
    hideMax: 0.1,
    legs: true,
    clear: () => 0.035,
    band: 0,
  },
  lacerna: {
    fabric: 'wool',
    rough: 0.92,
    bones: [...TORSO, 'neck', 'shoulderL', 'shoulderR', 'upperArmL', 'upperArmR', ...LEG_BONES],
    passes: 8,
    skirt: (L) => ({ top: L.belt, hem: L.hemKnee, legK: 0.6, shinK: 0, below: L.crotch, strength: 1 }),
    hide: [],
    hideMax: 0.1,
    legs: true,
    clear: () => 0.035,
    band: 0,
  },
};

function smooth(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * The skirt rule (as the procedural skirts, skirt.ts): hips at the top, the thighs ramping in down the skirt,
 * blended across the front and back centre by the side of the body; long skirts also follow the shins near
 * the hem. Writes 25 weights into `w`.
 */
export function skirtRule(x: number, y: number, top: number, hem: number, halfWidth: number, legK: number, shinK: number, w: Float32Array) {
  w.fill(0);
  const t = Math.min(1, Math.max(0, (top - y) / Math.max(1e-3, top - hem)));
  const long = shinK > 0;
  const wt = smooth(0.05, long ? 0.4 : 0.65, t) * legK;
  const wl = smooth(-0.75, 0.75, x / Math.max(halfWidth, 1e-3));
  const ws = shinK * smooth(0.35, 0.95, t);
  const hipsW = 1 - wt;
  const sp = t < 0.2 ? 0.3 * (1 - smooth(0, 0.2, t)) : 0;
  w[B.spine] = hipsW * sp;
  w[B.hips] = hipsW * (1 - sp);
  w[B.thighL] = wt * wl * (1 - ws);
  w[B.thighR] = wt * (1 - wl) * (1 - ws);
  w[B.shinL] = wt * wl * ws;
  w[B.shinR] = wt * (1 - wl) * ws;
}

const ruleCache = new Map<string, GarmentRules>();

export function rulesFor(id: BakedId, sex: Sex): GarmentRules {
  const k = `${sex}:${id}`;
  let r = ruleCache.get(k);
  if (r) return r;
  const spec = SPECS[id];
  const L = levels(refRig(sex));
  const allowed = new Set(spec.bones.map((b) => B[b]));
  const hideBones = spec.hide.map((b) => B[b]);
  const rule = new Float32Array(25);
  const half = 0.17 * L.s;
  r = {
    weights: (_body: BodyArrays, mesh: BakedMesh): WeightPolicy => ({
      allowed: (b) => allowed.has(b),
      parent: PARENT_INDEX,
      passes: spec.passes,
      adjust: (i, x, y, _z, w) => {
        const sk = spec.skirt?.(L, sex);
        if (!sk) return;
        const own = !sk.parts || sk.parts.includes(mesh.part[i]);
        // A skirt part follows the rule from its top down; any other part only where it hangs below `below`.
        const k = own ? smooth(sk.top + 0.02 * L.s, sk.top - 0.08 * L.s, y) : sk.below !== undefined ? smooth(sk.below + 0.04 * L.s, sk.below - 0.14 * L.s, y) * sk.strength : 0;
        if (k <= 0) return;
        skirtRule(x, y, sk.top, sk.hem, half, sk.legK, sk.shinK, rule);
        for (let b = 0; b < 25; b++) w[b] = w[b] * (1 - k) + rule[b] * k;
      },
    }),
    cover: (body: BodyArrays) => {
      const low = spec.hideAboveHem ? (spec.skirt?.(L, sex).hem ?? 0) + spec.hideAboveHem(L, sex) : -Infinity;
      return {
        maxDist: spec.hideMax,
        eligible: (v: number) => {
          if (!hideBones.length) return false;
          if (body.position[v * 3 + 1] < low) return false;
          let t = 0;
          for (let q = 0; q < 4; q++) if (hideBones.includes(body.skinIndex[v * 4 + q])) t += body.skinWeight[v * 4 + q];
          return t > 0.97;
        },
      };
    },
  };
  ruleCache.set(k, r);
  return r;
}

registerGarmentRules((sex, id) => rulesFor(id, sex));

/** The baked garments an appearance wears (those available for its sex and LOD), and what they replace. */
export function bakedPlan(rc: RealContext, outfit: Outfit = resolveOutfit(rc.app)): BakedPlan {
  const plan: BakedPlan = { ids: [], toga: false, stola: false, tunic: false, palla: false, cloak: false };
  const has = (id: BakedId) => hasBaked(rc.sex, id, rc.lod);
  if (outfit.toga) {
    const velata = rc.app.hair.style === 'veiled' && has('toga_velata');
    if (velata || has('toga')) {
      plan.ids.push(velata ? 'toga_velata' : 'toga');
      plan.toga = true;
    }
  } else if (outfit.stola) {
    if (has('stola')) {
      plan.ids.push('stola');
      plan.stola = true;
    }
  } else if (outfit.tunic) {
    const id = `tunic_${outfit.tunic.hem}` as BakedId;
    // Armour hangs its own skirt overlay over the tunic: keep the procedural skirt there.
    if (has(id) && !outfit.armor.body) {
      plan.ids.push(id);
      plan.tunic = true;
    }
  }
  if (outfit.palla && !outfit.toga && has('palla')) {
    plan.ids.push('palla');
    plan.palla = true;
  }
  if (outfit.cloak && has(outfit.cloak.kind)) {
    plan.ids.push(outfit.cloak.kind);
    plan.cloak = true;
  }
  return plan;
}

const axisTmp = new Float32Array(2);

/** Leg radius per height (2 cm slabs), measured on the morphed body (cached per body). */
const legCache = new WeakMap<Float32Array, ReturnType<typeof measureLegs>>();
function legRadii(body: BodyArrays, rig: Rig) {
  let r = legCache.get(body.position);
  if (!r) {
    r = measureLegs(body, rig);
    legCache.set(body.position, r);
  }
  return r;
}

function measureLegs(body: BodyArrays, rig: Rig) {
  const J = rig.joints;
  const top = J[B.thighL * 3 + 1];
  const dy = 0.02;
  const n = Math.ceil(top / dy) + 2;
  const r = new Float32Array(n);
  const count = body.position.length / 3;
  for (let v = 0; v < count; v++) {
    let w = 0;
    for (let q = 0; q < 4; q++) {
      const b = body.skinIndex[v * 4 + q];
      if (b === B.thighL || b === B.shinL || b === B.thighR || b === B.shinR || b === B.footL || b === B.footR) w += body.skinWeight[v * 4 + q];
    }
    if (w < 0.5) continue;
    const x = body.position[v * 3];
    const y = body.position[v * 3 + 1];
    const z = body.position[v * 3 + 2];
    legAxis(rig, y, axisTmp);
    const d = Math.hypot(Math.abs(x) - axisTmp[0], z - axisTmp[1]);
    const i = Math.min(n - 1, Math.max(0, Math.round(y / dy)));
    if (d > r[i]) r[i] = d;
  }
  // Fill gaps and take the max of each slab and its neighbours (cloth must clear the widest point near it).
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.max(r[Math.max(0, i - 1)], r[i], r[Math.min(n - 1, i + 1)]);
  return { dy, r: out };
}

/** The leg axis (|x|, z) at height y (hip joint to knee to ankle, averaged over both legs), written into out. */
function legAxis(rig: Rig, y: number, out: Float32Array) {
  const J = rig.joints;
  const kneeY = J[B.shinL * 3 + 1];
  const a = y > kneeY ? B.shinL : B.footL;
  const b = y > kneeY ? B.thighL : B.shinL;
  const ya = J[a * 3 + 1];
  const t = Math.min(1, Math.max(0, (y - ya) / Math.max(1e-3, J[b * 3 + 1] - ya)));
  out[0] = Math.abs(J[a * 3]) + (Math.abs(J[b * 3]) - Math.abs(J[a * 3])) * t;
  out[1] = J[a * 3 + 2] + (J[b * 3 + 2] - J[a * 3 + 2]) * t;
}

const tmpColor = { r: 0, g: 0, b: 0 };

/** Fit the plan's garments to the person (ctx.body is already morphed to their rig). */
export function fitBaked(rc: RealContext, plan: BakedPlan, outfit: Outfit = resolveOutfit(rc.app)): { garments: FittedGarment[]; hide: Uint8Array } {
  const n = rc.body.position.length / 3;
  const hide = new Uint8Array(n);
  const garments: FittedGarment[] = [];
  const L = levels(rc.rig);
  const s = rc.rig.s;
  let legs: ReturnType<typeof legRadii> | null = null;
  for (const id of plan.ids) {
    const bg = boundGarment(rc.sex, id, rc.lod, rulesFor(id, rc.sex));
    if (!bg) continue;
    const spec = SPECS[id];
    const m = bg.mesh;
    const count = m.position.length / 3;
    const position = new Float32Array(count * 3);
    const normal = new Float32Array(count * 3);
    // A cloak worn over body armour stands off it: the armour's plates sit a few centimetres out from the skin.
    let extra: Float32Array | undefined;
    if (outfit.armor.body && (id === 'sagum' || id === 'lacerna' || id === 'paenula' || id === 'palla')) {
      extra = new Float32Array(count);
      const lo = L.hip - 0.06 * s;
      for (let i = 0; i < count; i++) {
        const y = m.position[i * 3 + 1] * (rc.rig.height / refRig(rc.sex).height);
        extra[i] = 0.035 * s * Math.min(1, Math.max(0, (y - lo) / (0.12 * s)));
      }
    }
    fitGarment(bg.binding, rc.body, bg.bodyIndex, { position, normal }, undefined, extra);
    for (let v = 0; v < n; v++) if (bg.hide[v]) hide[v] = 1;
    // Colours.
    const cloth = id.startsWith('tunic') ? outfit.tunic : id.startsWith('toga') ? outfit.toga : id === 'stola' ? outfit.stola : id === 'palla' ? outfit.palla : outfit.cloak;
    const base = cloth?.color ?? srgb('#cfc6b4');
    const trimC = cloth?.trim && !(id.startsWith('tunic') && outfit.tunic?.clavi) ? cloth.trim : null;
    const color = new Float32Array(count * 3);
    const surf = new Uint8Array(count * 4);
    const pat = spec.fabric === 'linen' ? PATTERN_BAKED_LINEN : PATTERN_BAKED_WOOL;
    tmpColor.r = base.r;
    tmpColor.g = base.g;
    tmpColor.b = base.b;
    const clothA = new Float32Array(count * 4);
    const trim = new Float32Array(count * 4);
    const clavus = new Float32Array(count * 4);
    const legsA = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      color[i * 3] = tmpColor.r;
      color[i * 3 + 1] = tmpColor.g;
      color[i * 3 + 2] = tmpColor.b;
      surf[i * 4] = Math.round(spec.rough * 255);
      surf[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, m.ao[i])) * 255);
      surf[i * 4 + 2] = pat;
      surf[i * 4 + 3] = m.rim[i] ? 255 : 0;
      clothA[i * 4] = m.border[i] * s;
      clothA[i * 4 + 2] = m.pattern[i * 2];
      clothA[i * 4 + 3] = m.pattern[i * 2 + 1];
      if (trimC && spec.band > 0) {
        trim[i * 4] = trimC.r;
        trim[i * 4 + 1] = trimC.g;
        trim[i * 4 + 2] = trimC.b;
        trim[i * 4 + 3] = spec.band * s;
      }
    }
    // Clavi down the tunic skirt: the stripes at |x| = 0.07 s where the cloth leaves the belt, followed down the
    // cloth by its pattern u (a stripe woven into the cloth runs into the folds).
    if (id.startsWith('tunic') && outfit.tunic?.clavi && !outfit.armor.body) clavi(m, position, count, s, outfit.tunic.clavi, clavus);
    if (spec.legs) {
      legs ??= legRadii(rc.body, rc.rig);
      for (let i = 0; i < count; i++) {
        const y = position[i * 3 + 1];
        if (y > L.crotch) continue;
        legAxis(rc.rig, y, axisTmp);
        const k = Math.min(legs.r.length - 1, Math.max(0, Math.round(y / legs.dy)));
        legsA[i * 4] = axisTmp[0];
        legsA[i * 4 + 1] = axisTmp[1];
        legsA[i * 4 + 2] = legs.r[k] * 1.08 + (spec.clear ? spec.clear(m.part[i]) : 0.016) * s;
        legsA[i * 4 + 3] = y > L.knee + 0.04 * s ? 1 : 2;
      }
    }
    garments.push({
      id,
      count,
      position,
      normal,
      color,
      surf,
      skinIndex: bg.skinIndex,
      skinWeight: bg.skinWeight,
      cloth: clothA,
      trim,
      clavus,
      legs: legsA,
      index: visibleTriangles(m.index, layerMask(rc, plan, id)),
    });
  }
  return { garments, hide };
}

/** The layers worn over a garment of the plan (garments.py's UNDER table), or its own outer parts. */
function layerMask(rc: RealContext, plan: BakedPlan, id: BakedId): Uint8Array | null {
  if (id === 'toga' || id === 'toga_velata') return coveredVertices(rc.sex, id, rc.lod, [], 1);
  const over = plan.ids.filter((o) => (id.startsWith('tunic') && o !== id && (o === 'paenula' || o === 'sagum' || o === 'lacerna' || o === 'palla')) || (id === 'stola' && o === 'palla'));
  return over.length ? coveredVertices(rc.sex, id, rc.lod, over) : null;
}

/** The triangles not wholly under another layer. */
function visibleTriangles(index: ArrayLike<number>, covered: Uint8Array | null): Uint32Array {
  if (!covered) return Uint32Array.from(index);
  const out: number[] = [];
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    if (covered[a] && covered[b] && covered[c]) continue;
    out.push(a, b, c);
  }
  return Uint32Array.from(out);
}

/** Per vertex: distance along the cloth (pattern u) to the nearest of the four clavi. */
function clavi(m: BakedMesh, position: Float32Array, count: number, s: number, kind: 'wide' | 'narrow', out: Float32Array) {
  const cx = 0.07 * s;
  const half = ((kind === 'wide' ? 0.05 : 0.026) * s) / 2;
  let W = 0;
  for (let i = 0; i < count; i++) W = Math.max(W, m.pattern[i * 2]);
  // The stripe centres: the pattern u of the top-row vertex closest to x = +-cx, front and back.
  const centres: number[] = [];
  for (const sx of [1, -1])
    for (const front of [true, false]) {
      let best = Infinity;
      let u = 0;
      for (let i = 0; i < count; i++) {
        if (m.pattern[i * 2 + 1] > 0.16) continue;
        if (position[i * 3 + 2] > 0 !== front) continue;
        const d = Math.abs(position[i * 3] - sx * cx);
        if (d < best) {
          best = d;
          u = m.pattern[i * 2];
        }
      }
      centres.push(u);
    }
  for (let i = 0; i < count; i++) {
    const u = m.pattern[i * 2];
    let d = Infinity;
    for (const c of centres) {
      let du = Math.abs(u - c);
      if (W > 0) du = Math.min(du, W - du);
      d = Math.min(d, du);
    }
    out[i * 4] = d;
    out[i * 4 + 2] = half;
    out[i * 4 + 3] = 2;
  }
}
