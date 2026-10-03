/**
 * markets-trajan: the brick Markets of Trajan (c. 100–112) built against the cut face of the
 * Quirinal behind the forum's NE exedra.
 *
 *  - The basalt street ringing the forum's exedra, and the Great Hemicycle concentric with it:
 *    eleven tabernae with travertine door frames and mezzanine windows (walkable, stocked, with
 *    stall spots), a second storey of arched windows between brick pilasters under alternating
 *    triangular and segmental pediments, and a set-back third storey with a parapet terrace.
 *  - The upper street (the "Via Biberatica", a medieval name) at the third level, concentric with
 *    the hemicycle: shops on both sides, two storeys on the outer side. A stair street climbs to it
 *    from the south end of the hemicycle (risers 0.2 m).
 *  - The Great Hall (aula) at the north: a nave under six groin vaults on travertine corbels, with
 *    two levels of rooms along its sides; it opens off the north end of the upper street.
 *  - Behind, brick blocks climbing towards the cut hillside.
 *
 * Geometry is built in the landmark's own frame; the hemicycle uses polar coordinates about the
 * forum exedra's centre (shared with trajan-forum through trajan-layout).
 */
import * as THREE from 'three';
import { T, TRS, gridSurface, linspace, mul } from '../../../arch/common/geom';
import { paintedSign } from '../../../arch/common/inscription';
import { wall, type Opening } from '../../../arch/common/walls';
import { Draw } from '../../../arch/fabric/draw';
import { placeProp, type PropKind } from '../../../arch/props/props';
import type { ColliderSpec, MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { FORUM_X } from './trajan-forum';
import { LodChunks, UP, arcFloor, arcWall, boxMinMax, facing, solidBox } from './trajan-kit';
import { PLAN, S, TRAJAN_INSCRIPTIONS, uvToLocal, type Sited } from './trajan-layout';
import { garland } from './trajan-props';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;

/** Radii (game m) about the exedra centre, and storey levels. */
export const MK = {
  rStreet: FORUM_X.exedraR + FORUM_X.exedraT + 0.1, // 13.66: inner edge of the ring street
  rF: PLAN.hemicycle.r * S, // 17.7: hemicycle facade
  rB: 21.7, // ground-floor shops: back wall inner face
  rT: 19.6, // third storey front wall
  rV0: 25.2, // upper street
  rV1: 29.2,
  rO: 33.4, // outer shops: back wall inner face
  y1: 4.4, // second storey floor
  y2: 8.4, // upper street level / third storey floor
  y3: 12.2, // third storey roof
  y4: 15.4, // outer shops' upper storey roof
  half: PLAN.hemicycle.halfAngle, // 74°
  shops: 11,
};

/** The polar layout about the exedra centre in the markets' local frame. */
export function marketsPolar(lm: Sited) {
  const cu = -(PLAN.wallInner + PLAN.wallOuter) / 2;
  const [cx, cz] = uvToLocal(lm, cu, PLAN.exedra.v);
  // Direction of the bulge (away from the forum, −u) in this frame.
  const [bx, bz] = uvToLocal(lm, cu - 10, PLAN.exedra.v);
  const bulge = Math.atan2(bz - cz, bx - cx);
  return { c: V(cx, 0, cz), bulge };
}

/** Frame whose +z runs radially out at angle a (from +x towards +z) and whose origin is the centre. */
function polar(c: THREE.Vector3, a: number): THREE.Matrix4 {
  return TRS(c.x, 0, c.z, 0, Math.atan2(Math.cos(a), Math.sin(a)), 0);
}

/** Heading (model +Z forward) that faces the centre from angle a. */
const inward = (a: number) => Math.atan2(-Math.cos(a), -Math.sin(a));

/** Tiled roof over an annular sector, from radius r0 at height y0 to r1 at y1, facing up. */
function arcRoof(b: MeshBuilder, c: THREE.Vector3, r0: number, y0: number, r1: number, y1: number, A0: number, A1: number, n: number, mat: MaterialId = 'roof_tile') {
  const I = new THREE.Matrix4();
  const p = (r: number, t: number, y: number) => V(c.x + Math.cos(t) * r, y, c.z + Math.sin(t) * r);
  for (let i = 0; i < n; i++) {
    const ta = A0 + ((A1 - A0) * i) / n;
    const tb = A0 + ((A1 - A0) * (i + 1)) / n;
    facing(b, mat, I, [p(r0, ta, y0), p(r1, ta, y1), p(r1, tb, y1), p(r0, tb, y0)], UP);
  }
}

const SHOP_GOODS: PropKind[][] = [
  ['amphora_rack', 'amphora_tall', 'dolium'],
  ['stall_fruit', 'basket', 'sack'],
  ['shelf', 'stall_pottery', 'table'],
  ['stall_cloth', 'table', 'stool'],
  ['dolium', 'dolium', 'amphora_globular'],
  ['stall_fish', 'table', 'basket'],
  ['sack', 'sack', 'basket'],
];

/** One taberna in its bay frame (front on z = zf facing −z, width 2·hw, depth to zb). */
function taberna(main: MeshBuilder, det: MeshBuilder, m: THREE.Matrix4, o: { zf: number; zb: number; hw: number; y0: number; h: number; door: number; seed: number; hi: boolean; counter: boolean; frame: MaterialId }) {
  const { zf, zb, hw, y0, h, door, seed } = o;
  const dh = 2.9;
  // Front piers either side of the opening, lintel with a mezzanine window above.
  boxMinMax(main, 'brick', m, -hw - 0.3, y0, zf, -door / 2, y0 + h, zf + 0.6, { collide: true });
  boxMinMax(main, 'brick', m, door / 2, y0, zf, hw + 0.3, y0 + h, zf + 0.6, { collide: true });
  boxMinMax(main, 'brick', m, -door / 2, y0 + dh + 0.3, zf, door / 2, y0 + h, zf + 0.6);
  boxMinMax(main, 'black', m, -0.55, y0 + dh + 0.55, zf - 0.01, 0.55, y0 + Math.min(h - 0.25, dh + 1.2), zf + 0.3);
  // Travertine frame: jambs, lintel, threshold with the shutter groove.
  for (const sx of [-1, 1]) boxMinMax(main, o.frame, m, sx * door / 2 - (sx > 0 ? 0 : 0.18), y0, zf - 0.05, sx * door / 2 + (sx > 0 ? 0.18 : 0), y0 + dh, zf + 0.12);
  boxMinMax(main, o.frame, m, -door / 2 - 0.25, y0 + dh, zf - 0.06, door / 2 + 0.25, y0 + dh + 0.3, zf + 0.15);
  boxMinMax(main, o.frame, m, -door / 2, y0 - 0.05, zf - 0.1, door / 2, y0 + 0.05, zf + 0.6);
  // Interior: plastered walls (as separate skins), signinum floor, flat ceiling, back wall.
  boxMinMax(main, 'brick', m, -hw - 0.3, y0, zb, hw + 0.3, y0 + h, zb + 0.6, { collide: true });
  boxMinMax(main, 'plaster_cream', m, -hw + 0.3, y0 + 0.02, zb - 0.02, hw - 0.3, y0 + h - 0.3, zb, { castShadow: false });
  boxMinMax(main, 'terracotta', m, -hw, y0 + 0.01, zf + 0.6, hw, y0 + 0.04, zb, { castShadow: false });
  boxMinMax(main, 'wood_dark', m, -hw, y0 + h - 0.35, zf + 0.6, hw, y0 + h - 0.25, zb, { castShadow: false });
  // Goods and the counter.
  if (o.counter) {
    boxMinMax(det, 'brick', m, -door / 2 + 0.1, y0, zf + 0.9, -0.45, y0 + 0.95, zf + 1.5, { collide: true });
    boxMinMax(det, 'marble', m, -door / 2 + 0.05, y0 + 0.95, zf + 0.85, -0.4, y0 + 1.0, zf + 1.55);
  }
  if (o.hi) {
    const d = new Draw(det, m);
    const goods = SHOP_GOODS[seed % SHOP_GOODS.length];
    const depth = zb - zf - 0.6;
    goods.forEach((k, i) => {
      const x = (i - 1) * Math.min(1.1, hw * 0.55);
      placeProp(d, k, x, y0 + 0.04, zb - Math.min(0.7, depth * 0.25) - (i === 1 ? 0.3 : 0), 0, { variant: seed + i, collide: i !== 1 });
    });
  }
}

function hemicycle(ctx: LandmarkContext, main: MeshBuilder, chunks: LodChunks, P: ReturnType<typeof marketsPolar>, spots: Spot[]) {
  const hi = ctx.detail === 'high';
  const c = P.c;
  const a0 = P.bulge - MK.half;
  const a1 = P.bulge + MK.half;
  const n = MK.shops;
  const da = (a1 - a0) / n;
  const h = da / 2;
  const zf = MK.rF * Math.cos(h);
  const hw = MK.rF * Math.sin(h);
  const segs = hi ? 48 : 20;
  // Ring street: basalt paving with a travertine kerb along the exedra wall.
  const s0 = P.bulge - 86 * DEG;
  const s1 = P.bulge + 86 * DEG;
  const I = new THREE.Matrix4();
  arcFloor(main, 'paving_basalt', I, c.x, c.z, MK.rStreet, MK.rF + 0.3, s0, s1, 0.04, segs, 0.3);
  arcFloor(main, 'travertine', I, c.x, c.z, MK.rStreet, MK.rStreet + 0.35, s0, s1, 0.18, segs, 0.4);
  const det = Array.from({ length: 3 }, (_, k) => chunks.chunk(`shops${k}`, (() => {
    const a = a0 + ((k + 0.5) * (a1 - a0)) / 3;
    return V(c.x + Math.cos(a) * MK.rB, 2, c.z + Math.sin(a) * MK.rB);
  })()));
  for (let k = 0; k < n; k++) {
    const a = a0 + (k + 0.5) * da;
    const m = polar(c, a);
    const ck = det[Math.min(2, Math.floor((k * 3) / n))];
    taberna(main, ck.near, m, { zf, zb: MK.rB, hw, y0: 0, h: MK.y1, door: 2.6, seed: k, hi, counter: k % 3 !== 1, frame: 'travertine' });
    // Second storey: brick wall with an arched window, pilasters at the bay edges, pediment.
    const len = 2 * (hw + 0.3);
    wall(main, { length: len, height: MK.y2 - MK.y1, thickness: 0.6, material: 'brick', openings: [{ kind: 'window', x: len / 2, width: 1.4, height: 2.2, sill: 0.8, arched: true, frame: false }], detail: ctx.detail, collide: false }, mul(m, T(-len / 2, MK.y1, zf + 0.3)));
    boxMinMax(main, 'black', m, -0.8, MK.y1 + 0.5, zf + 1.1, 0.8, MK.y2 - 0.4, zf + 1.2);
    for (const sx of [-1, 1]) boxMinMax(main, 'brick', m, sx * hw - 0.24, MK.y1 + 0.2, zf - 0.14, sx * hw + 0.24, MK.y2 - 0.45, zf);
    const yP = MK.y1 + 0.8 + 2.2 + 0.25;
    if (k % 2 === 0) {
      for (const sx of [-1, 1]) main.box('brick', 1.15, 0.16, 0.22, mul(m, TRS(sx * 0.48, yP + 0.25, zf - 0.08, 0, 0, -sx * 0.42)));
    } else {
      // Segmental pediment: an arc band in the facade plane (arcWall in a frame turned about x).
      arcWall(main, 'brick', mul(m, TRS(0, 0, zf - 0.08, -Math.PI / 2, 0, 0)), 0, yP - 0.85, 0.95, 1.12, Math.PI * 0.15, Math.PI * 0.85, -0.11, 0.11, 6);
    }
    main.box('brick', 1.9, 0.12, 0.25, mul(m, T(0, yP, zf - 0.08)));
    // Travertine string courses and the third-storey terrace parapet.
    boxMinMax(main, 'travertine', m, -hw - 0.05, MK.y1 - 0.2, zf - 0.2, hw + 0.05, MK.y1, zf + 0.6);
    boxMinMax(main, 'travertine', m, -hw - 0.05, MK.y2 - 0.35, zf - 0.25, hw + 0.05, MK.y2, zf + 0.6);
    boxMinMax(main, 'brick', m, -hw, MK.y2, zf, hw, MK.y2 + 1.0, zf + 0.35);
    // Radial wall at the bay's start edge (and the last edge).
    for (const e of k === n - 1 ? [a - h, a + h] : [a - h]) {
      boxMinMax(main, 'brick', polar(c, e), -0.3, 0, MK.rF, 0.3, MK.y2, MK.rB + 0.6, { collide: true });
    }
    // Spots: the shopkeeper behind the counter, a stall at the door.
    const sh = inward(a);
    const at = (t: number, y: number, r: number) => V(t, y, r).applyMatrix4(m);
    spots.push({ id: `markets-taberna${k}-vendor`, kind: 'vendor', position: at(-0.6, 0.04, zf + 2.0), heading: sh });
    spots.push({ id: `markets-taberna${k}-stall`, kind: 'stall', position: at(0.45, 0.04, zf - 1.0), heading: sh + Math.PI });
    if (k === 4) spots.push({ id: 'markets-taberna-strongbox', kind: 'container', position: at(0.8, 0.04, MK.rB - 0.5), heading: sh + Math.PI });
    // Festival garland over the door.
    if (k % 2 === 1) garland(ck.near, m, V(-1.2, MK.y1 - 0.35, zf - 0.25), V(1.2, MK.y1 - 0.35, zf - 0.25), 0.4, 0.07, true, 6);
  }
  // Solid mass behind the second storey, and the third-storey floor slab over the terrace.
  arcWall(main, 'brick', I, c.x, c.z, zf + 1.2, MK.rB + 0.6, a0, a1, MK.y1, MK.y2, segs);
  arcWall(main, 'terracotta', I, c.x, c.z, zf, MK.rT, a0, a1, MK.y2 - 0.02, MK.y2 + 0.02, segs);
  // Third storey: front wall with small windows, roof sloping to the parapet terrace.
  for (let k = 0; k < 16; k++) {
    const aa = a0 + ((k + 0.5) * (a1 - a0)) / 16;
    const h2 = (a1 - a0) / 32;
    const m = polar(c, aa);
    const zf3 = MK.rT * Math.cos(h2);
    const hw3 = MK.rT * Math.sin(h2) + 0.3;
    wall(main, { length: 2 * hw3, height: MK.y3 - MK.y2, thickness: 0.6, material: 'brick', openings: [{ kind: 'window', x: hw3, width: 0.9, height: 1.3, sill: 1.4, arched: true, frame: false }], detail: 'low', collide: true }, mul(m, T(-hw3, MK.y2, zf3 + 0.3)));
  }
  arcRoof(main, c, MK.rT - 0.3, MK.y3, MK.rV0 + 0.3, MK.y3 + 1.0, a0, a1, segs);
  // The small halls at the ends of the hemicycle (north one with its semi-domed niche).
  const ends: [number, number][] = [
    [a0 - 6 * DEG, a0],
    [a1, a1 + 3 * DEG],
  ];
  for (const [e0, e1] of ends) {
    arcWall(main, 'brick', I, c.x, c.z, MK.rF - 1.2, MK.rB + 0.6, e0, e1, 0, MK.y3, 4);
    const mid = (e0 + e1) / 2;
    const m = polar(c, mid);
    boxMinMax(main, 'black', m, -0.9, 0, MK.rF - 1.25, 0.9, 3.6, MK.rF - 0.4);
    boxMinMax(main, 'travertine', m, -1.2, 3.6, MK.rF - 1.3, 1.2, 3.9, MK.rF - 1.0);
    solidBox(main, m, 0, MK.y3 / 2, (MK.rF - 1.2 + MK.rB + 0.6) / 2, 2 * MK.rF * Math.sin((e1 - e0) / 2), MK.y3, MK.rB + 1.8 - MK.rF);
  }
  // A shrine of the Lares at the street (compital altar), a bench, a painted sign.
  {
    const a = P.bulge + 2 * da;
    const m = polar(c, a);
    const at = mul(m, T(0, 0.04, MK.rStreet + 1.0));
    boxMinMax(main, 'plaster_white', at, -0.5, 0, -0.35, 0.5, 1.1, 0.35, { collide: true });
    boxMinMax(main, 'plaster_red', at, -0.55, 1.1, -0.4, 0.55, 1.2, 0.4);
    spots.push({ id: 'markets-lares-shrine', kind: 'shrine', position: V(0, 0.04, MK.rStreet + 1.9).applyMatrix4(m), heading: inward(a) + Math.PI });
    const sign = TRAJAN_INSCRIPTIONS['markets-sign-wine'].latin;
    const ms = polar(c, a0 + 3.5 * da);
    paintedSign(main, sign, 2.2, 0.6, mul(ms, T(0, 3.55, zf - 0.08)));
    spots.push({ id: 'markets-sign-wine', kind: 'inscription', position: V(0, 3.55, zf - 0.1).applyMatrix4(ms), heading: inward(a0 + 3.5 * da) + Math.PI });
    for (const k of [1, 6]) {
      const mb = polar(c, a0 + (k + 0.5) * da);
      boxMinMax(main, 'travertine', mb, -1.0, 0.04, MK.rStreet + 0.5, 1.0, 0.48, MK.rStreet + 0.9, { collide: true });
      spots.push({ id: `markets-street-bench${k}`, kind: 'sit', position: V(0, 0.48, MK.rStreet + 0.7).applyMatrix4(mb), heading: inward(a0 + (k + 0.5) * da) + Math.PI });
    }
    spots.push({ id: 'markets-spawn-street', kind: 'spawn', position: V(0, 0.04, (MK.rStreet + MK.rF) / 2).applyMatrix4(polar(c, P.bulge)), heading: inward(P.bulge) + Math.PI / 2 });
  }
}

/** Upper street, its shops, the stair from the ring street and the landing. */
function upperLevel(ctx: LandmarkContext, main: MeshBuilder, chunks: LodChunks, P: ReturnType<typeof marketsPolar>, spots: Spot[]) {
  const hi = ctx.detail === 'high';
  const c = P.c;
  const I = new THREE.Matrix4();
  const a0 = P.bulge - MK.half;
  const a1 = P.bulge + MK.half;
  const segs = hi ? 48 : 20;
  const vS = a1 - 8 * DEG; // south end of the street (opens on the landing)
  const vN = P.bulge - 36 * DEG; // north end (turns into the passage to the hall)
  // The stair street from the ring street to the landing cuts a slot through the landing.
  const aS = a1 + 7 * DEG;
  const ms = polar(c, aS);
  const sw = 1.0; // half-width of the flight
  const slot = Math.asin((sw + 0.55) / MK.rT); // angular half-width of the slot at its inner end
  const nSteps = Math.ceil(MK.y2 / 0.2 - 1e-6);
  const tread = 0.3;
  const rStart = MK.rF - 0.4;
  const rTop = rStart + nSteps * tread;
  const aE = a1 + 14 * DEG; // far edge of the landing
  // Mass under the upper level (behind the hemicycle) and under the landing (either side of the
  // slot), the street and landing floors.
  arcWall(main, 'brick', I, c.x, c.z, MK.rB + 0.6, MK.rO + 0.6, a0, a1, 0, MK.y2 - 0.05, segs);
  for (const [e0, e1] of [
    [a1, aS - slot],
    [aS + slot, aE],
  ]) {
    arcWall(main, 'brick', I, c.x, c.z, MK.rT, MK.rO + 0.6, e0, e1, 0, MK.y2 - 0.05, 6);
    arcFloor(main, 'terracotta', I, c.x, c.z, MK.rT, MK.rV0, e0, e1, MK.y2, 4, 0.05);
    arcFloor(main, 'paving_basalt', I, c.x, c.z, MK.rV0, MK.rV1, e0, e1, MK.y2, 4, 0.1);
    arcFloor(main, 'terracotta', I, c.x, c.z, MK.rV1, MK.rO + 0.6, e0, e1, MK.y2, 4, 0.05);
    for (let i = 0; i < 3; i++) {
      const ta = e0 + ((e1 - e0) * i) / 3;
      const tb = e0 + ((e1 - e0) * (i + 1)) / 3;
      const r1 = MK.rO + 0.6;
      solidBox(main, polar(c, (ta + tb) / 2), 0, MK.y2 / 2, (MK.rT + r1) / 2, 2 * MK.rT * Math.sin((tb - ta) / 2), MK.y2, r1 - MK.rT);
    }
  }
  // Fill between the slot's wedge edges and the flight's side walls; floor beyond the stair head.
  for (const sx of [-1, 1]) {
    const xa = sx * (sw + 0.5);
    const xb = sx * (sw + 0.5 + 2.4);
    boxMinMax(main, 'brick', ms, Math.min(xa, xb), 0, MK.rT, Math.max(xa, xb), MK.y2 - 0.05, MK.rO + 0.6);
    solidBox(main, ms, (xa + xb) / 2, MK.y2 / 2, (MK.rT + MK.rO + 0.6) / 2, Math.abs(xb - xa), MK.y2, MK.rO + 0.6 - MK.rT);
    boxMinMax(main, 'terracotta', ms, Math.min(xa, xb), MK.y2 - 0.05, MK.rT, Math.max(xa, xb), MK.y2, MK.rO + 0.6, { castShadow: false });
  }
  boxMinMax(main, 'brick', ms, -sw - 0.5, 0, rTop, sw + 0.5, MK.y2 - 0.05, MK.rO + 0.6);
  solidBox(main, ms, 0, MK.y2 / 2, (rTop + MK.rO + 0.6) / 2, 2 * sw + 1.0, MK.y2, MK.rO + 0.6 - rTop);
  boxMinMax(main, 'paving_basalt', ms, -sw - 0.5, MK.y2 - 0.05, rTop, sw + 0.5, MK.y2, MK.rO + 0.6, { castShadow: false });
  // The street floor along the hemicycle.
  arcFloor(main, 'paving_basalt', I, c.x, c.z, MK.rV0, MK.rV1, vN - 8 * DEG, a1, MK.y2, segs, 0.1);
  arcFloor(main, 'terracotta', I, c.x, c.z, MK.rV0, MK.rO + 0.6, a0, vN - 8 * DEG, MK.y2, 8, 0.05);
  arcFloor(main, 'terracotta', I, c.x, c.z, MK.rV1, MK.rO + 0.6, vN - 8 * DEG, P.bulge - 30 * DEG, MK.y2, 6, 0.05);
  arcFloor(main, 'terracotta', I, c.x, c.z, MK.rV1, MK.rO + 0.6, vS, a1, MK.y2, 6, 0.05);
  // Walkable floor colliders along the street (oriented boxes per segment).
  const nC = 14;
  for (let i = 0; i < nC; i++) {
    const ta = vN - 8 * DEG + ((a1 - (vN - 8 * DEG)) * i) / nC;
    const tb = vN - 8 * DEG + ((a1 - (vN - 8 * DEG)) * (i + 1)) / nC;
    const r0 = MK.rV0 - 0.3;
    const r1 = MK.rV1 + 0.3;
    solidBox(main, polar(c, (ta + tb) / 2), 0, MK.y2 / 2, (r0 + r1) / 2, 2 * r1 * Math.sin((tb - ta) / 2) + 0.4, MK.y2, r1 - r0);
  }
  // Inner row (third storey rooms) opening onto the street; closed bays beyond the street.
  const nI = 16;
  const ck = chunks.chunk('upper', V(c.x + Math.cos(P.bulge) * MK.rV1, MK.y2 + 2, c.z + Math.sin(P.bulge) * MK.rV1));
  for (let k = 0; k < nI; k++) {
    const a = a0 + ((k + 0.5) * (a1 - a0)) / nI;
    const h = (a1 - a0) / nI / 2;
    const m = polar(c, a);
    const zfo = MK.rV0 * Math.cos(h);
    const hwI = MK.rV0 * Math.sin(h);
    // In this frame the shop faces +z (outwards): mirror with a 180° turn about the bay centre.
    const mo = mul(m, TRS(0, 0, zfo, 0, Math.PI, 0));
    const open = a > vN && a < vS;
    if (open) {
      taberna(main, ck.near, mo, { zf: 0, zb: zfo - (MK.rT + 0.6), hw: hwI, y0: MK.y2, h: MK.y3 - MK.y2, door: 2.4, seed: k + 3, hi, counter: k % 2 === 0, frame: 'travertine' });
      spots.push({ id: `markets-upper-inner${k}-stall`, kind: 'stall', position: V(0, MK.y2, -0.9).applyMatrix4(mo), heading: inward(a) + Math.PI });
    } else {
      boxMinMax(main, 'brick', mo, -hwI - 0.3, MK.y2, 0, hwI + 0.3, MK.y3, 0.6, { collide: true });
    }
    boxMinMax(main, 'brick', polar(c, a - h), -0.3, MK.y2, MK.rT + 0.6, 0.3, MK.y3, MK.rV0, { collide: true });
  }
  // Outer row: two storeys of shops facing the street (inwards).
  const oA0 = P.bulge - 30 * DEG;
  const oA1 = vS;
  const nO = 12;
  for (let k = 0; k < nO; k++) {
    const a = oA0 + ((k + 0.5) * (oA1 - oA0)) / nO;
    const h = (oA1 - oA0) / nO / 2;
    const m = polar(c, a);
    const zf = MK.rV1 * Math.cos(h);
    const hwO = MK.rV1 * Math.sin(h);
    taberna(main, ck.near, m, { zf, zb: MK.rO, hw: hwO, y0: MK.y2, h: 3.6, door: 2.4, seed: k + 7, hi, counter: k % 2 === 1, frame: 'travertine' });
    spots.push({ id: `markets-upper-outer${k}-stall`, kind: 'stall', position: V(0, MK.y2, zf - 0.9).applyMatrix4(m), heading: inward(a) + Math.PI });
    if (k % 4 === 2) spots.push({ id: `markets-upper-outer${k}-vendor`, kind: 'vendor', position: V(0.6, MK.y2, zf + 1.8).applyMatrix4(m), heading: inward(a) });
    // Upper storey: windows and a timber balcony on brackets.
    const yU = MK.y2 + 3.6;
    const len = 2 * (hwO + 0.3);
    wall(main, { length: len, height: MK.y4 - yU, thickness: 0.6, material: 'brick', openings: [{ kind: 'window', x: len / 2, width: 1.0, height: 1.5, sill: 0.6, arched: false, frame: false, leaves: 'none' }], detail: 'low', collide: false }, mul(m, T(-len / 2, yU, zf + 0.3)));
    if (k % 2 === 0) {
      boxMinMax(ck.near, 'wood', m, -1.3, yU + 0.05, zf - 0.9, 1.3, yU + 0.15, zf);
      boxMinMax(ck.near, 'wood_painted', m, -1.3, yU + 0.15, zf - 0.92, 1.3, yU + 1.05, zf - 0.86);
    }
    boxMinMax(main, 'brick', polar(c, a - h), -0.3, MK.y2, MK.rV1, 0.3, MK.y4, MK.rO + 0.6, { collide: true });
    if (k === nO - 1) boxMinMax(main, 'brick', polar(c, a + h), -0.3, MK.y2, MK.rV1, 0.3, MK.y4, MK.rO + 0.6, { collide: true });
    boxMinMax(main, 'brick', m, -hwO - 0.3, yU, zf + 0.6, hwO + 0.3, MK.y4, MK.rO + 0.6);
  }
  arcRoof(main, c, MK.rV1 - 0.5, MK.y4, MK.rO + 1.0, MK.y4 + 1.2, oA0, oA1, 24);
  // Closing walls: north of the outer row (to the hall passage) and parapets on the landing.
  boxMinMax(main, 'brick', polar(c, oA0), -0.3, MK.y2, MK.rV1, 0.3, MK.y4, MK.rO + 0.6, { collide: true });
  boxMinMax(main, 'brick', polar(c, a1 + 14 * DEG), -0.3, MK.y2, MK.rT, 0.3, MK.y2 + 1.1, MK.rO + 0.6, { collide: true });
  arcWall(main, 'brick', I, c.x, c.z, MK.rT - 0.3, MK.rT + 0.3, a1, a1 + 14 * DEG, MK.y2, MK.y2 + 1.1, 4);
  solidBox(main, polar(c, a1 + 7 * DEG), 0, MK.y2 + 0.55, MK.rT, 2 * MK.rT * Math.sin(7 * DEG), 1.1, 0.6);
  arcWall(main, 'brick', I, c.x, c.z, MK.rO, MK.rO + 0.6, vS, a1 + 14 * DEG, MK.y2, MK.y2 + 1.1, 4);
  solidBox(main, polar(c, (vS + a1 + 14 * DEG) / 2), 0, MK.y2 + 0.55, MK.rO + 0.3, 2 * MK.rO * Math.sin((a1 + 14 * DEG - vS) / 2), 1.1, 0.6);
  spots.push({ id: 'markets-vista-landing', kind: 'vista', position: V(0, MK.y2, MK.rT + 0.8).applyMatrix4(polar(c, (aS + slot + aE) / 2)), heading: inward((aS + slot + aE) / 2) });

  // The flight itself (radial, risers 0.2 m, treads 0.3 m) between brick walls that rise to
  // parapet height round the stairwell.
  const r = MK.y2 / nSteps;
  for (let k = 0; k < nSteps; k++) {
    const z0 = rStart + k * tread;
    boxMinMax(main, 'travertine', ms, -sw, 0, z0, sw, (k + 1) * r, z0 + tread, { collide: true });
  }
  for (const sx of [-1, 1]) {
    boxMinMax(main, 'brick', ms, sx * sw + (sx > 0 ? 0 : -0.5), 0, rStart, sx * sw + (sx > 0 ? 0.5 : 0), MK.y2 + 1.1, rTop, { collide: true });
  }
  spots.push({ id: 'markets-stair-foot', kind: 'door', position: V(0, 0.04, rStart - 0.8).applyMatrix4(ms), heading: inward(aS) + Math.PI });
}

/** Groin-vault ceiling over a w × l bay (x × z) springing at y, rise = w/2 (cross-vault). */
function groinVault(b: MeshBuilder, m: THREE.Matrix4, w: number, l: number, y: number, n: number) {
  const rx = w / 2;
  const rz = l / 2;
  const f = (x: number, z: number) => {
    const ux = Math.min(1, Math.abs(x) / rx);
    const uz = Math.min(1, Math.abs(z) / rz);
    return y + rx * Math.max(Math.sqrt(Math.max(0, 1 - ux * ux)), Math.sqrt(Math.max(0, 1 - uz * uz)));
  };
  b.add(gridSurface(linspace(-rx, rx, n), linspace(-rz, rz, n), (x, z, o) => o.set(x, f(x, z), z), { flip: false }), 'plaster_white', m, { castShadow: false });
}

/** The Great Hall and the passage to it from the north end of the upper street. */
function greatHall(ctx: LandmarkContext, main: MeshBuilder, chunks: LodChunks, P: ReturnType<typeof marketsPolar>, spots: Spot[]) {
  const hi = ctx.detail === 'high';
  const c = P.c;
  // Hall rectangle in the markets frame: long axis along x (towards the NNW).
  const x0 = 23;
  const x1 = 40.5;
  const zA = -15.5;
  const zB = -1.5;
  const zc = (zA + zB) / 2;
  const nave = 6.0;
  const y0 = MK.y2;
  const yS = y0 + 6.2; // springing of the vaults
  const yTop = yS + nave / 2 + 0.6;
  const I = new THREE.Matrix4();
  const ck = chunks.chunk('hall', V((x0 + x1) / 2, y0 + 4, zc));
  // Passage from the street's north end to the hall's door (a straight paved lane with walls).
  const vN = P.bulge - 36 * DEG;
  const pA = V(c.x + Math.cos(vN) * (MK.rV0 + MK.rV1) / 2, y0, c.z + Math.sin(vN) * (MK.rV0 + MK.rV1) / 2);
  const pB = V(x0, y0, zc);
  const dir = pB.clone().sub(pA);
  const L = dir.length();
  const ang = Math.atan2(dir.x, dir.z);
  const mp = TRS(pA.x, 0, pA.z, 0, ang, 0);
  boxMinMax(main, 'paving_basalt', mp, -2.0, y0 - 0.1, -2.0, 2.0, y0, L + 0.4, { collide: true });
  boxMinMax(main, 'brick', mp, -2.6, 0, -2.0, 2.6, y0 - 0.1, L);
  for (const sx of [-1, 1]) boxMinMax(main, 'brick', mp, sx * 2.0 + (sx > 0 ? 0 : -0.5), y0, 1.0, sx * 2.0 + (sx > 0 ? 0.5 : 0), y0 + 4.2, L, { collide: true });
  // Base mass under the hall.
  boxMinMax(main, 'brick', I, x0, 0, zA, x1, y0, zB, { collide: true });
  // Side rooms on two levels along the long walls, opening onto the nave.
  const zN0 = zc - nave / 2;
  const zN1 = zc + nave / 2;
  boxMinMax(main, 'terracotta', I, x0 + 0.6, y0, zN0, x1 - 0.6, y0 + 0.04, zN1, { castShadow: false });
  const nB = 6;
  for (const side of [-1, 1]) {
    const zFace = side < 0 ? zN0 : zN1;
    const zOut = side < 0 ? zA : zB;
    // outer wall of the hall block
    boxMinMax(main, 'brick', I, x0, y0, Math.min(zOut, zOut - side * 0.6), x1, yTop, Math.max(zOut, zOut - side * 0.6), { collide: true });
    for (let k = 0; k < nB; k++) {
      const xa = x0 + 0.6 + (k * (x1 - x0 - 1.2)) / nB;
      const xb = x0 + 0.6 + ((k + 1) * (x1 - x0 - 1.2)) / nB;
      const xm = (xa + xb) / 2;
      // Lower room: front piers and lintel; floor; dividing wall.
      boxMinMax(main, 'brick', I, xa, y0, Math.min(zFace, zFace + side * 0.5), xa + 0.4, yS, Math.max(zFace, zFace + side * 0.5), { collide: true });
      boxMinMax(main, 'brick', I, xa, y0 + 3.0, Math.min(zFace, zFace + side * 0.5), xb, y0 + 3.6, Math.max(zFace, zFace + side * 0.5));
      boxMinMax(main, 'travertine', I, xm - 1.05, y0 + 2.8, Math.min(zFace, zFace - side * 0.08), xm + 1.05, y0 + 3.05, Math.max(zFace, zFace - side * 0.08));
      boxMinMax(main, 'brick', I, xa, y0, Math.min(zFace + side * 0.5, zOut - side * 0.6), xa + 0.3, y0 + 3.6, Math.max(zFace + side * 0.5, zOut - side * 0.6), { collide: true });
      // Upper gallery rooms behind a balcony rail.
      boxMinMax(main, 'brick', I, xa + 0.4, y0 + 3.6, Math.min(zFace, zOut - side * 0.6), xb, y0 + 3.75, Math.max(zFace, zOut - side * 0.6));
      boxMinMax(main, 'brick', I, xa + 0.4, y0 + 3.75, Math.min(zFace + side * 1.4, zFace + side * 1.9), xb, yS - 0.3, Math.max(zFace + side * 1.4, zFace + side * 1.9));
      boxMinMax(main, 'black', I, xm - 0.7, y0 + 3.9, Math.min(zFace + side * 1.38, zFace + side * 1.35), xm + 0.7, y0 + 5.9, Math.max(zFace + side * 1.38, zFace + side * 1.35));
      boxMinMax(ck.near, 'wood', I, xa + 0.4, y0 + 4.6, Math.min(zFace, zFace + side * 0.06), xb, y0 + 4.7, Math.max(zFace, zFace + side * 0.06));
      // Travertine corbels carrying the vault ribs.
      boxMinMax(main, 'travertine', I, xa - 0.1, yS - 0.4, Math.min(zFace, zFace - side * 0.5), xa + 0.5, yS, Math.max(zFace, zFace - side * 0.5));
      if (k % 2 === 0) spots.push({ id: `markets-hall-office${side < 0 ? 's' : 'n'}${k}`, kind: 'stall', position: V(xm, y0, zFace - side * 0.8).applyMatrix4(I), heading: side < 0 ? 0 : Math.PI });
    }
  }
  // End walls (door at the passage end).
  wall(main, { length: zB - zA, height: yTop - y0, thickness: 0.6, material: 'brick', openings: [{ kind: 'door', x: zc - zA, width: 3.0, height: 4.0, leaves: 'open', leafMaterial: 'wood_dark' }], detail: ctx.detail, collide: true }, mul(I, TRS(x0 + 0.3, y0, zB, 0, Math.PI / 2, 0)));
  boxMinMax(main, 'brick', I, x1 - 0.6, y0, zA, x1, yTop, zB, { collide: true });
  // Six groin vaults over the nave, with clerestory lunettes; tiled roof above.
  const bay = (x1 - x0 - 1.2) / 6;
  for (let k = 0; k < 6; k++) {
    const xm = x0 + 0.6 + (k + 0.5) * bay;
    groinVault(main, T(xm, 0, zc), bay, nave, yS, hi ? 10 : 6);
  }
  boxMinMax(main, 'brick', I, x0, yS, Math.min(zN0, zA), x1, yTop, zN0 - 0.01);
  boxMinMax(main, 'brick', I, x0, yS, zN1 + 0.01, x1, yTop, Math.max(zN1, zB));
  for (const sz of [-1, 1]) {
    const e = sz < 0 ? zA - 0.5 : zB + 0.5;
    facing(main, 'roof_tile', I, [V(x0 - 0.5, yTop + 2.2, zc), V(x1 + 0.5, yTop + 2.2, zc), V(x1 + 0.5, yTop, e), V(x0 - 0.5, yTop, e)], UP);
  }
  for (const x of [x0 - 0.5, x1 + 0.5]) facing(main, 'brick', I, [V(x, yTop, zB + 0.5), V(x, yTop + 2.2, zc), V(x, yTop, zA - 0.5)], V(x < x1 ? -1 : 1, 0, 0));
  // The official weights-and-measures table (mensa ponderaria) and the clerk.
  const mt = T(x0 + 4, y0, zc + 1.2);
  boxMinMax(main, 'marble', mt, -1.0, 0, -0.35, 1.0, 0.95, 0.35, { collide: true });
  for (const dx of [-0.6, 0, 0.6]) {
    const cup = new THREE.CylinderGeometry(0.16 - Math.abs(dx) * 0.1, 0.1, 0.06, 10);
    cup.translate(dx, 0.93, 0);
    main.add(cup, 'black', mt);
  }
  spots.push({ id: 'markets-mensa-ponderaria', kind: 'inscription', position: V(x0 + 4, y0 + 0.95, zc + 0.8), heading: 0 });
  spots.push({ id: 'markets-hall-clerk', kind: 'npc', position: V(x0 + 4, y0, zc + 1.9), heading: Math.PI });
  spots.push({ id: 'markets-hall-entrance', kind: 'spawn', position: V(x0 + 1.6, y0, zc), heading: Math.PI / 2 });
}

/** Brick blocks filling the rest of the site behind the upper street. */
function backBlocks(ctx: LandmarkContext, main: MeshBuilder, P: ReturnType<typeof marketsPolar>) {
  const I = new THREE.Matrix4();
  const c = P.c;
  const fp = ctx.lm.footprint;
  const hw = fp.kind === 'rect' ? (fp.w * S) / 2 : 41.1;
  const back = fp.kind === 'rect' ? (fp.d * S) / 2 : 18;
  const rClear = MK.rO + 0.7;
  // Lower fill (0..y2) as boxes outside the clearance circle.
  const strips: [number, number][] = [
    [4.8, back],
    [-4, 4.8],
    [-12, -4],
    [-18, -12],
  ];
  for (const [za, zb] of strips) {
    const dz = Math.max(0, Math.min(Math.abs(za - c.z), Math.abs(zb - c.z)));
    const reach = dz >= rClear ? 0 : Math.sqrt(rClear * rClear - dz * dz);
    if (reach === 0) {
      boxMinMax(main, 'brick', I, -hw, 0, za, hw, MK.y2, zb, { collide: true });
      continue;
    }
    const xl = c.x - reach;
    const xr = c.x + reach;
    if (xl > -hw) boxMinMax(main, 'brick', I, -hw, 0, za, xl, MK.y2, zb, { collide: true });
    if (xr < hw) boxMinMax(main, 'brick', I, xr, 0, za, hw, MK.y2, zb, { collide: true });
  }
  // Roof terraces in signinum over the fill.
  boxMinMax(main, 'terracotta', I, -hw, MK.y2, 4.8, hw, MK.y2 + 0.04, back, { castShadow: false });
  // Upper blocks with windows and tiled roofs, climbing towards the cut hillside.
  const blocks: [number, number, number, number, number][] = [
    [-hw, -16, 6.5, back, MK.y2 + 6.2],
    [-16, 9, 7.5, back, MK.y2 + 9.0],
    [9, hw, 2.5, back, MK.y2 + 5.0],
  ];
  for (const [xa, xb, za, zb, top] of blocks) {
    const len = xb - xa;
    const ops: Opening[] = [];
    for (let x = 1.6; x < len - 1.2; x += 2.6) {
      for (let y = 1.2; y < top - MK.y2 - 1.4; y += 3.1) ops.push({ kind: 'window', x, width: 0.9, height: 1.3, sill: y, arched: y > 4, frame: false, leaves: 'none' });
    }
    wall(main, { length: len, height: top - MK.y2, thickness: 0.6, material: 'brick', openings: ops, detail: 'low', collide: true }, mul(I, T(xa, MK.y2, za + 0.3)));
    boxMinMax(main, 'brick', I, xa, MK.y2, za + 0.6, xb, top, zb, { collide: true });
    const rise = Math.min(2.4, (zb - za) * 0.2);
    facing(main, 'roof_tile', I, [V(xa - 0.3, top, za - 0.3), V(xb + 0.3, top, za - 0.3), V(xb + 0.3, top + rise, zb + 0.3), V(xa - 0.3, top + rise, zb + 0.3)], UP);
    for (const x of [xa - 0.3, xb + 0.3]) facing(main, 'brick', I, [V(x, top, za - 0.3), V(x, top, zb + 0.3), V(x, top + rise, zb + 0.3)], V(x < 0 ? -1 : 1, 0, 0));
  }
  // Back wall towards the cut hillside: storeys of windows, a travertine band at each floor.
  const gBack = Math.max(0, ctx.groundAt(0, back + 6));
  const topBack = Math.max(MK.y2 + 9.0, gBack + 1);
  boxMinMax(main, 'brick', I, -hw, 0, back - 0.6, hw, topBack, back + 0.6, { collide: true });
  windowGrid(main, I, -hw + 1.5, hw - 1.5, 1.4, topBack - 1.0, back + 0.6, 1);
  // Flanks of the block (towards the NNW and the SSE): windows over the lower fill.
  for (const sx of [-1, 1]) windowGrid(main, TRS(sx * hw, 0, 0, 0, sx * (Math.PI / 2), 0), -back + 1.5, back - 1.5, 1.4, MK.y2 - 0.8, 0, 1);
}

/**
 * Rows of windows on a flat brick face (the plane z = zFace of frame m, facing +z·dir): dark
 * openings with travertine sills, one storey every 3.1 m.
 */
function windowGrid(b: MeshBuilder, m: THREE.Matrix4, x0: number, x1: number, y0: number, y1: number, zFace: number, dir: 1 | -1) {
  const n = Math.max(1, Math.floor((x1 - x0) / 2.8));
  for (let y = y0; y + 1.5 <= y1; y += 3.1) {
    for (let i = 0; i < n; i++) {
      const x = x0 + ((i + 0.5) * (x1 - x0)) / n;
      boxMinMax(b, 'black', m, x - 0.45, y, Math.min(zFace, zFace + dir * 0.03), x + 0.45, y + 1.35, Math.max(zFace, zFace + dir * 0.03), { castShadow: false });
      boxMinMax(b, 'travertine', m, x - 0.6, y - 0.12, Math.min(zFace, zFace + dir * 0.12), x + 0.6, y, Math.max(zFace, zFace + dir * 0.12), { castShadow: false });
    }
    boxMinMax(b, 'travertine', m, x0 - 1.2, y - 0.5, Math.min(zFace, zFace + dir * 0.06), x1 + 1.2, y - 0.38, Math.max(zFace, zFace + dir * 0.06), { castShadow: false });
  }
}

function farMassing(ctx: LandmarkContext, P: ReturnType<typeof marketsPolar>): THREE.Object3D {
  const b = ctx.builder();
  const I = new THREE.Matrix4();
  const c = P.c;
  const a0 = P.bulge - MK.half;
  const a1 = P.bulge + MK.half;
  arcWall(b, 'brick', I, c.x, c.z, MK.rF, MK.rO + 0.6, a0, a1 + 14 * DEG, 0, MK.y2, 12);
  arcWall(b, 'brick', I, c.x, c.z, MK.rT, MK.rV0, a0, a1, MK.y2, MK.y3, 12);
  arcWall(b, 'roof_tile', I, c.x, c.z, MK.rV1, MK.rO + 0.6, P.bulge - 30 * DEG, a1 - 8 * DEG, MK.y2, MK.y4, 12);
  boxMinMax(b, 'brick', I, -41.1, 0, -4, 41.1, MK.y2 + 6, 18);
  boxMinMax(b, 'brick', I, 23, 0, -15.5, 40.5, MK.y2 + 10, -1.5);
  return b.build('markets-trajan:far');
}

export const builders: LandmarkBuilder[] = [
  {
    handles: ['markets-trajan'],
    build(ctx) {
      const P = marketsPolar(ctx.lm);
      const main = ctx.builder();
      const spots: Spot[] = [];
      const chunks = new LodChunks(ctx.detail === 'high' ? 45 : 30, 260);
      hemicycle(ctx, main, chunks, P, spots);
      upperLevel(ctx, main, chunks, P, spots);
      greatHall(ctx, main, chunks, P, spots);
      backBlocks(ctx, main, P);
      const colliders: ColliderSpec[] = [...main.colliders];
      const group = new THREE.Group();
      group.add(main.build('markets-trajan'));
      group.add(chunks.build('markets-trajan:lod', colliders));
      return { object: group, colliders, spots, far: farMassing(ctx, P), cullDistance: 1000 };
    },
  },
];
