/**
 * Painted garments for the realistic bodies.
 *
 * The procedural avatar dresses its lofted body through paintTorso / paintArm / paintLeg /
 * paintFoot (build/garments.ts, build/armor.ts): for a point on the surface they return the
 * outermost layer's colour, material (surf) and thickness. This module evaluates the very same
 * rules at every vertex of a real body, in the coordinates those rules expect:
 *   - torso: x, y, z of the vertex, th = the loft's angle (0 = left, +pi/2 = front), from the
 *     torso's centre line at that height (measured from the body itself);
 *   - arms and legs: height y, th = angle around the limb axis (+x = outward), r = distance from it;
 *   - feet: x across the foot, y, z relative to the ankle.
 * Which rule applies is decided by the vertex's dominant bone. The result is per-vertex colour,
 * surf (avatarMaterial's contract: roughness, metalness, pattern id, emissive) and thickness
 * (baked as an offset along the normal when the geometry is assembled, see assemble.ts).
 *
 * Hems and garment borders are placed more finely than the mesh: where a vertex and a neighbour
 * disagree about being cloth, the rule is sampled a few centimetres around the vertex and the share
 * of cloth becomes the vertex's `cover`, a smooth field whose 0.5 contour follows the true border.
 */
import { B, type BoneName, type Rig } from '../../rig';
import { SURF, type Surf } from '../../SkinBuilder';
import { levels, type Levels } from '../../build/body';
import { makeCtx, type Ctx, type Paint } from '../../build/common';
import { paintArm, paintFoot, paintLeg, paintTorso } from '../../build/garments';
import { resolveOutfit } from '../../build/outfit';
import type { Appearance } from '../../../appearance';
import type { BodyArrays } from '../morph';

export interface BodyPaint {
  /** Linear RGB per vertex. */
  color: Float32Array;
  /** roughness, metalness, pattern id / 255, emissive: four normalized bytes per vertex. */
  surf: Uint8Array;
  /** Thickness (m) of the layer over the skin; only meaningful where `cloth` is 1. */
  thick: Float32Array;
  /** 1 where the outermost layer is not bare skin. */
  cloth: Uint8Array;
  /** Smooth cloth coverage per vertex (0 skin ... 1 cloth); present when the triangle index was given. */
  cover?: Float32Array;
  /** The torso as measured on this body (garment lofts are fitted to it). */
  torso: TorsoMeasure;
}

/** Torso extents by height, measured from the torso-bone vertices of a morphed body. */
export interface TorsoMeasure {
  /** Height range with measurements. */
  y0: number;
  y1: number;
  /** Half-width, centre line z, depth in front of and behind the centre, at height y. */
  at(y: number): { a: number; zc: number; bf: number; bb: number };
}

type Region = 'torso' | 'armL' | 'armR' | 'legL' | 'legR' | 'footL' | 'footR' | 'skin';

const REGION: Region[] = [];
for (const [name, idx] of Object.entries(B) as [BoneName, number][]) {
  const side = name.endsWith('L') ? 'L' : name.endsWith('R') ? 'R' : '';
  let r: Region = 'skin';
  if (name === 'hips' || name === 'spine' || name === 'chest' || name === 'neck') r = 'torso';
  else if (/^(shoulder|upperArm|forearm)/.test(name)) r = `arm${side}` as Region;
  else if (/^(thigh|shin)/.test(name)) r = `leg${side}` as Region;
  else if (/^(foot|toe)/.test(name)) r = `foot${side}` as Region;
  REGION[idx] = r;
}

const BIN = 0.01;

/** Piecewise-linear axis through a chain of joints, evaluated at height y (the limbs hang vertically). */
function axisAt(J: Float32Array, chain: number[], y: number, out: [number, number]) {
  let a = chain[0];
  for (let i = 1; i < chain.length; i++) {
    const b = chain[i];
    const ya = J[a * 3 + 1];
    const yb = J[b * 3 + 1];
    if (y >= yb || i === chain.length - 1) {
      const t = ya - yb > 1e-6 ? Math.min(1, Math.max(0, (ya - y) / (ya - yb))) : 0;
      out[0] = J[a * 3] + (J[b * 3] - J[a * 3]) * t;
      out[1] = J[a * 3 + 2] + (J[b * 3 + 2] - J[a * 3 + 2]) * t;
      return;
    }
    a = b;
  }
}

function measureTorso(body: BodyArrays, torso: Uint8Array, rig: Rig): TorsoMeasure {
  const nb = Math.ceil(rig.height / BIN) + 2;
  const zmin = new Float32Array(nb).fill(Infinity);
  const zmax = new Float32Array(nb).fill(-Infinity);
  const xmax = new Float32Array(nb).fill(-Infinity);
  const n = body.position.length / 3;
  for (let v = 0; v < n; v++) {
    if (!torso[v]) continue;
    const k = Math.max(0, Math.min(nb - 1, Math.round(body.position[v * 3 + 1] / BIN)));
    const x = Math.abs(body.position[v * 3]);
    const z = body.position[v * 3 + 2];
    if (z < zmin[k]) zmin[k] = z;
    if (z > zmax[k]) zmax[k] = z;
    if (x > xmax[k]) xmax[k] = x;
  }
  let y0 = -1;
  let y1 = -1;
  for (let k = 0; k < nb; k++) if (zmax[k] >= zmin[k]) {
    if (y0 < 0) y0 = k * BIN;
    y1 = k * BIN;
  }
  // Fill gaps from the nearest measured bin, then average over five bins (a single stray vertex must not show).
  const fillArr = (arr: Float32Array, bad: (x: number) => boolean) => {
    let last = NaN;
    for (let k = 0; k < nb; k++) if (bad(arr[k])) arr[k] = last; else last = arr[k];
    last = NaN;
    for (let k = nb - 1; k >= 0; k--) if (bad(arr[k]) || Number.isNaN(arr[k])) arr[k] = Number.isNaN(last) ? 0 : last; else last = arr[k];
    const src = arr.slice();
    for (let k = 0; k < nb; k++) {
      let s = 0;
      let c = 0;
      for (let d = -2; d <= 2; d++) {
        const j = k + d;
        if (j >= 0 && j < nb) {
          s += src[j];
          c++;
        }
      }
      arr[k] = s / c;
    }
  };
  fillArr(zmin, (x) => !Number.isFinite(x));
  fillArr(zmax, (x) => !Number.isFinite(x));
  fillArr(xmax, (x) => !Number.isFinite(x));
  return {
    y0,
    y1,
    at(y) {
      const k = Math.max(0, Math.min(nb - 1, Math.round(y / BIN)));
      const zc = (zmin[k] + zmax[k]) / 2;
      return { a: xmax[k], zc, bf: zmax[k] - zc, bb: zc - zmin[k] };
    },
  };
}

/** The cloth indicator smoothed over the mesh edges, so its contour runs smoothly across triangles. */
function smoothField(field: Float32Array, index: ArrayLike<number>, adj: Adjacency): Float32Array {
  const n = field.length;
  const out = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const a = adj.start[v];
    const b = adj.start[v + 1];
    if (a === b) {
      out[v] = field[v];
      continue;
    }
    let sum = 0;
    for (let j = a; j < b; j++) sum += field[adj.list[j]];
    out[v] = 0.5 * field[v] + (0.5 * sum) / (b - a);
  }
  return out;
}

interface Adjacency {
  start: Uint32Array;
  list: Uint32Array;
}

function adjacency(n: number, index: ArrayLike<number>): Adjacency {
  const start = new Uint32Array(n + 1);
  for (let i = 0; i < index.length; i += 3) for (let k = 0; k < 3; k++) start[index[i + k] + 1] += 2;
  for (let v = 0; v < n; v++) start[v + 1] += start[v];
  const list = new Uint32Array(start[n]);
  const fill = start.slice(0, n);
  for (let i = 0; i < index.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = index[i + k];
      list[fill[a]++] = index[i + ((k + 1) % 3)];
      list[fill[a]++] = index[i + ((k + 2) % 3)];
    }
  }
  return { start, list };
}

export interface PaintOptions {
  app: Appearance;
  rig: Rig;
  /** The morphed body (positions and normals in the rig's bind pose). */
  body: BodyArrays;
  /** Triangle index of the body: with it the smooth `cover` field is computed. */
  index?: ArrayLike<number>;
}

export function paintBody({ app, rig, body, index }: PaintOptions): BodyPaint {
  const outfit = resolveOutfit(app);
  const ctx: Ctx = makeCtx(rig, app, outfit, 'high');
  const L = levels(rig);
  const J = rig.joints;
  const n = body.position.length / 3;
  const reg: Region[] = new Array(n);
  const isTorso = new Uint8Array(n);
  const torsoBone = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    let best = 0;
    let bw = -1;
    for (let k = 0; k < 4; k++) {
      const w = body.skinWeight[v * 4 + k];
      if (w > bw) {
        bw = w;
        best = body.skinIndex[v * 4 + k];
      }
    }
    let r = REGION[best];
    // Collar and deltoid vertices that the shoulder bone owns but that sit over the ribs belong to the torso.
    if ((best === B.shoulderL || best === B.shoulderR) && Math.abs(body.position[v * 3]) < L.armX * 0.55) r = 'torso';
    // The neck and the jaw (head bone) below the chin line take the torso rules too: the garments' necklines are
    // heights, and the dominant bone changes raggedly across the neck.
    if (best === B.head && body.position[v * 3 + 1] < L.chin) r = 'torso';
    reg[v] = r;
    if (r === 'torso') torsoBone[v] = 1;
    if (r === 'torso' && best !== B.neck) isTorso[v] = 1;
  }
  const torso = measureTorso(body, torsoBone, rig);
  const axis: [number, number] = [0, 0];
  const chains: Record<string, number[]> = {
    armL: [B.upperArmL, B.forearmL, B.handL],
    armR: [B.upperArmR, B.forearmR, B.handR],
    legL: [B.thighL, B.shinL, B.footL],
    legR: [B.thighR, B.shinR, B.footR],
  };
  // The garment rule for a point of region r: x across, y up, z forward (limbs: lateral and forward offsets are
  // taken from the limb axis at height y).
  const ruleAt = (r: Region, x: number, y: number, z: number): Paint | null => {
    if (r === 'torso') {
      const zc = torso.at(y).zc;
      return paintTorso(ctx, L, x, y, z, Math.atan2((z - zc) * 1.6, x));
    }
    if (r === 'armL' || r === 'armR' || r === 'legL' || r === 'legR') {
      const sign = r.endsWith('L') ? 1 : -1;
      const side = sign > 0 ? 'L' : 'R';
      axisAt(J, chains[r], y, axis);
      const lat = (x - axis[0]) * sign;
      const fz = z - axis[1];
      const th = Math.atan2(fz, lat);
      return r.startsWith('arm') ? paintArm(ctx, L, side, y, th, Math.hypot(lat, fz), false) : paintLeg(ctx, L, side, y, th, false);
    }
    if (r === 'footL' || r === 'footR') {
      const sign = r.endsWith('L') ? 1 : -1;
      const fb = sign > 0 ? B.footL : B.footR;
      return paintFoot(ctx, (x - J[fb * 3]) * sign, y, z - J[fb * 3 + 2], 0, false);
    }
    return null;
  };
  const isCloth = (p: Paint | null) => !!p && p.surf !== SURF.skin && p.t >= 0;

  const out: BodyPaint = { color: new Float32Array(n * 3), surf: new Uint8Array(n * 4), thick: new Float32Array(n), cloth: new Uint8Array(n), torso };
  for (let v = 0; v < n; v++) {
    const paint = ruleAt(reg[v], body.position[v * 3], body.position[v * 3 + 1], body.position[v * 3 + 2]);
    const cloth = isCloth(paint);
    const color = paint ? paint.color : ctx.skin;
    const surf: Surf = paint ? paint.surf : SURF.skin;
    out.color[v * 3] = color.r;
    out.color[v * 3 + 1] = color.g;
    out.color[v * 3 + 2] = color.b;
    out.surf[v * 4] = Math.round(surf.rough * 255);
    out.surf[v * 4 + 1] = Math.round(surf.metal * 255);
    out.surf[v * 4 + 2] = surf.pattern;
    out.surf[v * 4 + 3] = Math.round(surf.emissive * 255);
    out.thick[v] = cloth ? paint!.t : 0;
    out.cloth[v] = cloth ? 1 : 0;
  }
  if (!index) return out;

  // Cover: the cloth indicator, refined at the borders by sampling the rule around each border vertex.
  const adj = adjacency(n, index);
  const field = Float32Array.from(out.cloth);
  const s = rig.s;
  // Wide enough to reach across a mesh edge (2 to 3 cm): the share of cloth ramps with the distance to the border.
  const offs = [-0.03, -0.015, -0.006, 0.006, 0.015, 0.03];
  for (let v = 0; v < n; v++) {
    const a = adj.start[v];
    const b = adj.start[v + 1];
    let border = false;
    for (let j = a; j < b; j++) if (out.cloth[adj.list[j]] !== out.cloth[v]) { border = true; break; }
    if (!border || reg[v] === 'skin') continue;
    const x = body.position[v * 3];
    const y = body.position[v * 3 + 1];
    const z = body.position[v * 3 + 2];
    let c = out.cloth[v];
    for (const d of offs) {
      c += isCloth(ruleAt(reg[v], x, y + d * s, z)) ? 1 : 0;
      c += isCloth(ruleAt(reg[v], x + d * s, y, z)) ? 1 : 0;
    }
    field[v] = c / (1 + offs.length * 2);
  }
  const cover = smoothField(field, index, adj);
  // A painted cloth vertex never drops below the cut: thin straps and sleeve ends must not erode away.
  for (let v = 0; v < n; v++) if (out.cloth[v] && cover[v] < 0.55) cover[v] = 0.55;
  out.cover = cover;
  void isTorso;
  return out;
}
