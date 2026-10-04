/**
 * The Capitoline end of the Forum:
 *  - the Tabularium (78 BC), the great record office whose blank peperino substructure closes the
 *    Forum below the Capitol: small windows, the Forum-level door with Catulus' dedication, the
 *    Doric arcaded gallery at the level of the saddle (a vista over the whole Forum, reached through
 *    a passage from the Capitol side) and a blind upper storey under a tiled roof;
 *  - the Portico of the Twelve Gods on the Clivus Capitolinus: small vaulted rooms at street level,
 *    a terrace above with two angled wings of Corinthian columns and the twelve gilded gods in pairs.
 */
import * as THREE from 'three';
import { entablature } from '../../../arch/classical/entablature';
import { columnDims } from '../../../arch/classical/orders';
import { extrudePolygon } from '../../../arch/common/geom';
import { stairs } from '../../../arch/common/stairs';
import { wall } from '../../../arch/common/walls';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder } from '../types';
import { FORUM_INSCRIPTIONS } from './forum-data';
import { drapedFemale, figure, nudeMale } from './forum-figures';
import { T, TRS, col, inscription, landmark, mul, type Part } from './forum-kit';
import { arcadeRow, gableRoof, shedRoof } from './forum-temple';
import { lampAt } from './forum-street';

const text = (id: string) => FORUM_INSCRIPTIONS[id].latin;

// ---------------------------------------------------------------- Tabularium

function tabularium(p: Part) {
  const { b, d, hi, ctx } = p;
  const W = 72 * p.S;
  const Dp = 40 * p.S;
  const hw = W / 2;
  const hd = Dp / 2;
  const yG = 0.6;
  // the ground falls away along the facade: find the Forum-level foot
  let gmin = 0;
  let xLow = 0;
  for (let x = -hw; x <= hw; x += 1.5) {
    const g = Math.min(ctx.groundAt(x, -hd - 0.8), ctx.groundAt(x, -hd + 0.6));
    if (g < gmin) {
      gmin = g;
      xLow = x;
    }
  }
  const yMin = gmin - 0.5;
  const ft = 1.4;
  // substructure: coursed peperino front with small windows and the Forum-level door
  const sh = yG - yMin;
  const openings: { kind: 'door' | 'window'; x: number; width: number; height: number; sill: number; leaves?: 'closed'; leafMaterial?: MaterialId; frame?: boolean }[] = [];
  const nW = 11;
  const bay = 3.6;
  // the door opens on the flat Forum-level foot, a little beside where the cliff starts to climb
  const dx = Math.max(-hw + 3, Math.min(hw - 3, xLow - 2));
  const gDoor = ctx.groundAt(dx, -hd - 0.8);
  openings.push({ kind: 'door', x: dx + hw, width: 1.8, height: 3.0, sill: gDoor - yMin + 0.02, leaves: 'closed', leafMaterial: 'bronze', frame: true });
  for (let i = 0; i < nW; i++) {
    const x = -((nW - 1) * bay) / 2 + i * bay;
    if (Math.abs(x - dx) < 2.2) continue;
    for (const y of [-3.5, -8.5]) {
      if (ctx.groundAt(x, -hd - 0.8) > y - 1.0) continue;
      openings.push({ kind: 'window', x: x + hw, width: 0.7, height: 1.3, sill: y - yMin, frame: false });
    }
  }
  wall(b, { length: W, height: sh, thickness: ft, material: 'peperino', courses: hi ? 0.62 : 0, detail: p.detail, openings, collide: false }, T(-hw, yMin, -hd + ft / 2));
  d.solid(-hw, yMin, -hd, hw, yG, -hd + ft);
  d.span('tufa', -hw, yMin, -hd + ft, hw, yG, hd, { collide: true, shadow: false });
  // Catulus' dedication over the door
  if (hi) inscription(b, T(dx, gDoor + 4.0, -hd - 0.04), text('tabularium'), 4.6, 1.2, 'carved', { depth: 0.05, body: 'travertine', sizes: [0.9, 0.9, 0.8] });
  // the gallery: a Doric arcade of travertine along the front
  const gx0 = -(nW * bay) / 2;
  const gH = 5.4;
  arcadeRow(p, { bays: nW, bay, pier: 1.0, depth: 1.0, storeys: [{ order: 'doric', height: gH }], material: 'travertine', collide: true, archDetail: 'low' }, T(gx0, yG, -hd + 0.5));
  // a parapet in every arch: the gallery looks out over the Forum from twenty metres up
  d.span('travertine', gx0, yG, -hd + 0.15, -gx0, yG + 1.05, -hd + 0.85, { collide: true });
  for (const sx of [-1, 1]) d.span('peperino', sx > 0 ? -gx0 : -hw, yG, -hd, sx > 0 ? hw : gx0, yG + gH, -hd + 4.5, { collide: true });
  d.span('paving_travertine', gx0, yG - 0.05, -hd + 1.0, -gx0, yG + 0.02, -hd + 4.5, { shadow: false });
  // the upper storey set back behind the gallery, with a passage through it from the Capitol side
  const uz0 = -hd + 4.5;
  const uH = gH + 4.2;
  for (const [x0, x1] of [
    [-hw + 0.5, -1.3],
    [1.3, hw - 0.5],
  ]) d.span('peperino', x0, yG, uz0, x1, yG + uH, hd, { collide: true });
  d.span('peperino', -1.3, yG + 3.4, uz0, 1.3, yG + uH, hd);
  // steps from the Capitol saddle up to the passage
  {
    const g = ctx.groundAt(0, hd + 1.2);
    if (g < yG - 0.05) {
      const n = Math.max(1, Math.ceil((yG - g) / 0.2));
      stairs(b, { width: 2.6, rise: (yG - g) / n, run: 0.33, count: n, material: 'travertine', collider: p.main ? 'steps' : 'none' }, TRS(0, g, hd + n * 0.33, 0, Math.PI, 0));
    }
  }
  // the face towards the Capitol (the back, seen from the saddle): a warm tufa skin, travertine
  // pilasters on bases, two string-courses, framed windows, a portal with a pediment where the
  // passage comes out, and a heavy cornice on modillions
  if (hi) {
    d.span('tufa', -hw, yG, hd, hw, yG + uH, hd + 0.05, { shadow: false });
    const n = 12;
    const bayW = (W - 1.6) / n;
    for (let i = 0; i <= n; i++) {
      const x = -hw + 0.8 + i * bayW;
      d.box('travertine', x, yG + uH / 2, hd + 0.12, 0.7, uH, 0.24);
      d.box('travertine', x, yG + 0.3, hd + 0.17, 0.9, 0.6, 0.34);
      d.box('travertine', x, yG + uH - 0.55, hd + 0.17, 0.9, 0.22, 0.34);
      if (i < n && Math.abs(x + bayW / 2) > 2.2) {
        const xc = x + bayW / 2;
        for (const y of [2.6, 6.6]) {
          d.box('black', xc, yG + y, hd + 0.06, 0.8, 1.2, 0.02);
          d.box('travertine', xc, yG + y + 0.7, hd + 0.1, 1.1, 0.16, 0.14);
          d.box('travertine', xc, yG + y - 0.66, hd + 0.1, 1.05, 0.1, 0.18);
          for (const sx of [-1, 1]) d.box('travertine', xc + sx * 0.46, yG + y, hd + 0.08, 0.12, 1.2, 0.1);
        }
      }
    }
    for (const y of [4.4, uH - 1.9]) d.span('travertine', -hw, yG + y, hd + 0.03, hw, yG + y + 0.22, hd + 0.17);
    // the portal at the passage: pilasters, lintel and a little pediment
    for (const sx of [-1, 1]) d.box('travertine', sx * 1.7, yG + 1.8, hd + 0.3, 0.36, 3.6, 0.36);
    d.box('travertine', 0, yG + 3.75, hd + 0.3, 4.1, 0.34, 0.42);
    b.add(extrudePolygon([[-2.2, 0], [2.2, 0], [0, 0.85]], 0.3), 'travertine', T(0, yG + 3.92, hd + 0.18));
    // modillions under the cornice
    for (let x = -hw; x <= hw; x += 1.3) d.box('travertine', x, yG + uH - 0.62, hd + 0.3, 0.3, 0.26, 0.4);
  }
  d.span('travertine', -hw - 0.2, yG + uH - 0.5, hd - 0.1, hw + 0.2, yG + uH, hd + 0.5);
  d.span('travertine', -hw - 0.25, yG + uH - 0.05, hd - 0.1, hw + 0.25, yG + uH + 0.12, hd + 0.62);
  arcadeRow(p, { bays: 9, bay: (W - 1) / 9, pier: 1.0, depth: 0.6, storeys: [{ order: 'corinthian', height: uH - gH, blind: true, windows: true }], material: 'travertine', collide: false }, T(-(W - 1) / 2, yG + gH, uz0 - 0.3));
  shedRoof(b, gx0 - 0.3, -gx0 + 0.3, uz0 + 0.05, -hd - 0.4, yG + gH + 1.4, yG + gH + 0.05, 'roof_tile', new THREE.Matrix4());
  const pitch = (15 * Math.PI) / 180;
  gableRoof(b, -(hd - uz0) / 2 - 0.4, (hd - uz0) / 2 + 0.4, -hw - 0.2, hw + 0.2, yG + uH, pitch, 'roof_tile', hi, TRS(0, 0, (uz0 + hd) / 2, 0, Math.PI / 2, 0));
  for (const sx of [-1, 1]) lampAt(p, dx + sx * 2.1, -hd - 1.1);
  p.spot('tabularium-door', 'door', dx, ctx.groundAt(dx, -hd - 1.0) + 0.06, -hd - 1.0, 0);
  p.spot('tabularium', 'inscription', dx, ctx.groundAt(dx, -hd - 1.9) + 0.06, -hd - 1.9, 0);
  // the best view down the Forum is from the S end of the gallery, past the Temple of Vespasian's roof
  p.spot('tabularium-gallery-vista', 'vista', 15, yG, -hd + 1.6, Math.atan2(0.3, -1));
  p.spot('tabularium-back-door', 'door', 0, yG, hd + 1.0, Math.PI);
}

// ---------------------------------------------------------------- Porticus Deorum Consentium

/** The twelve gods, by pairs (six gods and six goddesses, gilded). */
const GODS: ('m' | 'f')[] = ['m', 'f', 'm', 'f', 'm', 'f', 'm', 'f', 'm', 'f', 'm', 'f'];

function deiConsentes(p: Part) {
  const { b, d, hi } = p;
  const W = 30 * p.S;
  const hw = W / 2;
  const Y = 2.6;
  // the vaulted rooms at street level, a terrace on top
  const front = -1.4;
  const back = 5.4;
  const doors = [];
  for (let i = 0; i < 7; i++) doors.push({ kind: 'arch' as const, x: hw + (i - 3) * 2.3, width: 1.4, height: 2.2 });
  wall(b, { length: W, height: Y, thickness: 0.6, material: 'brick', openings: doors, detail: p.detail, collide: false }, T(-hw, 0, front + 0.3));
  for (const dd of doors) d.box('black', dd.x - hw, 1.0, front + 0.62, 1.38, 2.0, 0.04);
  d.span('brick', -hw, 0, front + 0.6, hw, Y, back, { collide: true, shadow: false });
  d.solid(-hw, 0, front, hw, Y, front + 0.6);
  d.span('travertine', -hw - 0.1, Y - 0.15, front - 0.1, hw + 0.1, Y, back);
  // central stair up to the terrace
  const n = 13;
  stairs(b, { width: 2.6, rise: Y / n, run: 0.3, count: n, material: 'travertine', collider: p.main ? 'steps' : 'none' }, T(0, 0, front - n * 0.3));
  for (const sx of [-1, 1]) d.box('travertine', sx * 1.5, Y / 2, front - (n * 0.3) / 2, 0.4, Y, n * 0.3, { collide: true });
  // two angled wings of Corinthian columns
  const cH = 3.6;
  const D = cH / 10;
  const dims = columnDims('corinthian', D, cH);
  const ang = (10 * Math.PI) / 180;
  const nc = 6;
  const span = hw - 0.4;
  const step = span / nc;
  let god = 0;
  for (const sx of [-1, 1]) {
    const wm = TRS(0, Y, front + 0.6, 0, sx * ang, 0);
    const x = (i: number) => sx * i * step;
    for (let i = sx < 0 ? 0 : 1; i <= nc; i++) col(b, { order: 'corinthian', D, H: cH, tier: hi ? 'mid' : 'stub', material: 'marble', collide: p.main }, mul(wm, T(x(i), 0, 0)));
    // back wall, roof and entablature
    const bz = 3.4;
    b.box('plaster_white', span + 0.4, cH + 0.9, 0.4, mul(wm, T((sx * (span + 0.4)) / 2, (cH + 0.9) / 2, bz)), { collide: p.main });
    const a = sx < 0 ? x(nc) - 0.3 : -0.3;
    const c = sx < 0 ? 0.3 : x(nc) + 0.3;
    const pth = [new THREE.Vector3(a, cH, -dims.d / 2), new THREE.Vector3(c, cH, -dims.d / 2)];
    const e = entablature(b, pth, { order: 'corinthian', columnHeight: cH, D, material: 'marble', detail: p.detail, axial: step }, { at: wm, caps: true });
    shedRoof(b, Math.min(a, c), Math.max(a, c), bz + 0.3, -dims.d / 2 - 0.3, cH + e.dims.total + 0.9, cH + e.dims.total, 'roof_tile', wm);
    b.box('wood_dark', span, 0.15, bz, mul(wm, T((sx * span) / 2, cH + e.dims.architrave + e.dims.frieze - 0.1, bz / 2)), { castShadow: false });
    // the gods in pairs, between the columns, against the back wall
    for (let i = 0; i < (hi ? 3 : 0); i++) {
      const cx = sx * (i * 2 + 1) * step;
      for (const k of [-1, 1]) {
        const gx = cx + k * step * 0.28;
        const g = GODS[god++ % GODS.length];
        const at = mul(wm, T(gx, 0, bz - 0.6));
        b.box('marble', 0.6, 0.5, 0.5, mul(at, T(0, 0.25, 0)));
        figure(b, mul(at, T(0, 0.5, 0)), false, 'gilded_bronze', 0.95, (s) => (g === 'm' ? nudeMale(s, { right: i === 0 ? 'spear' : 'raised', left: 'down', cloak: true, plinth: false, head: { beard: i !== 2 } }) : drapedFemale(s, { right: i === 1 ? 'patera' : 'down', left: 'sceptre', plinth: false, head: { crown: 'diadem' } })));
      }
    }
  }
  p.spot('porticus-dei-consentes', 'shrine', 0, Y, 1.4, Math.PI);
  p.spot('dei-consentes-steps', 'npc', 2.2, 0, front - 4.6, 0);
  p.spot('dei-consentes-vista', 'vista', -3.5, Y, front + 1.0, Math.PI);
}

export const builders: LandmarkBuilder[] = [
  { handles: ['tabularium'], build: (ctx) => landmark(ctx, tabularium, { near: 160 }) },
  { handles: ['porticus-dei-consentes'], build: (ctx) => landmark(ctx, deiConsentes, { near: 110 }) },
];
