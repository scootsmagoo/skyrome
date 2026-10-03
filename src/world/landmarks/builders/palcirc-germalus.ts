/**
 * The Germalus and the Palatine's older sanctuaries (palcirc crew): Temple of Palatine Apollo with
 * its terrace, the Houses of Augustus and Livia, the Temples of Magna Mater and Victoria, the Hut of
 * Romulus, the Lupercal at the hill foot and the Adonaea gardens on the NE corner.
 */
import * as THREE from 'three';
import { Draw } from '../../../arch/fabric/draw';
import { temple, type TempleLayout } from '../../../arch/classical/temple';
import { quadriga, seatedDeity } from '../../../arch/classical/statues';
import { inscriptionPanel, paintedSign } from '../../../arch/common/inscription';
import { placeProp } from '../../../arch/props/props';
import { Rng } from '../../../core/Rng';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext } from '../types';
import { block, boulder as rockBoulder, gardenBed, openings, peristyle, pool, rockPlinth, roofOver, stair } from './palcirc/palace';
import { lion, mergeAll } from './palcirc/shapes';
import { Spots, drawFor, gableRoof, groundRange, lowColumn, plantTrees, type TreeSpec } from './palcirc/util';
import { requestLamps } from './palcirc/runtime';
import { landmarkToWorld } from './palcirc/util';

const T4 = (x: number, y: number, z: number, ry = 0) => new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(ry));

/** Masonry footing under a temple layout (podium + stairs) wherever the ground dips. */
function templeFooting(ctx: LandmarkContext, d: Draw, L: TempleLayout, mat: MaterialId) {
  const x0 = L.stylobate.x0, x1 = L.stylobate.x1;
  const z0 = L.podiumFront, z1 = L.stylobate.z1;
  const g = groundRange(ctx, x0, z0, x1, z1, 2);
  if (g.min < -0.05) d.span(mat, x0, g.min - 0.6, z0, x1, 0.02, z1, { collide: true });
}

/** Simple draped standing figure (Danaids, votive statues): cheap, ~60 triangles. */
function figure(d: Draw, x: number, y: number, z: number, h: number, mat: MaterialId) {
  d.cyl(mat, x, y + h * 0.36, z, h * 0.12, h * 0.72, 7, { rTop: h * 0.085 });
  d.ellipsoid(mat, x, y + h * 0.78, z, h * 0.1, h * 0.09, h * 0.07, { seg: [7, 5] });
  d.ellipsoid(mat, x, y + h * 0.9, z, h * 0.065, h * 0.08, h * 0.07, { seg: [7, 5] });
}

/** Bull (Myron's cattle round Apollo's altar), facing −z, ~1.9 long. */
function bull(d: Draw, x: number, y: number, z: number, ry: number, mat: MaterialId) {
  const f = d.at(x, y, z, ry);
  f.ellipsoid(mat, 0, 1.0, 0.1, 0.42, 0.45, 0.95, { seg: [8, 6] });
  f.ellipsoid(mat, 0, 1.15, -0.85, 0.24, 0.27, 0.34, { seg: [7, 5] });
  for (const [sx, sz] of [[-0.24, -0.5], [0.24, -0.5], [-0.24, 0.65], [0.24, 0.65]]) f.cyl(mat, sx, 0.3, sz, 0.08, 0.62, 6, { rTop: 0.07 });
  for (const s of [-1, 1]) f.cyl(mat, s * 0.2, 1.38, -0.92, 0.04, 0.3, 4, { rTop: 0.015, rz: s * 0.9 });
}

// ---------------------------------------------------------------- Temple of Palatine Apollo

function apollo(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  const hi = ctx.detail === 'high';
  const W = 19.2 * ctx.S * 0.95;
  // Terrace (area Apollinis) paved in marble, with footing where the ground falls away.
  const tx = 12.5, tz0 = -16, tz1 = 11.5;
  const gT = groundRange(ctx, -tx, tz0, tx, tz1, 3);
  if (gT.min < -0.05) d.span('travertine', -tx, gT.min - 0.6, tz0, tx, -0.02, tz1, { collide: true });
  d.span('paving_travertine', -tx, -0.06, tz0, tx, 0.03, tz1, { collide: true });
  // The temple: Luna marble, Corinthian, hexastyle pseudoperipteral, high podium, ivory doors.
  const L = temple(b, {
    order: 'corinthian',
    plan: 'pseudoperipteral',
    front: 6,
    width: W,
    podiumHeight: 3.0,
    material: 'marble',
    podiumMaterial: 'marble',
    cellaMaterial: 'marble',
    roofMaterial: 'roof_tile',
    doorMaterial: 'marble',
    fluted: true,
    detail: ctx.detail,
  }).layout;
  // The gilded chariot of the Sun on the apex of the pediment.
  const apexZ = L.entablature.z0 + 0.6;
  quadriga(b, T4(0, L.totalHeight - 0.4, apexZ + 0.9), { material: 'gilded_bronze', driverMaterial: 'gilded_bronze', scale: 0.85, detail: hi ? 'low' : 'low' });
  // Dedication on the podium front, between the stair wings.
  inscriptionPanel(b, { lines: ['Apollini Palatino', 'Imp Caesar Divi F'], width: 3.4, height: 0.8, style: 'bronze', border: true }, T4(L.stylobate.x0 + 1.8, L.podiumHeight * 0.55, L.stylobate.z0 - 0.02 - (L.stylobate.z0 - L.podiumFront)), { depth: 0.04, bodyMaterial: 'marble' });
  // Altar with Myron's four bronze cattle, before the stairs.
  const az = L.podiumFront - 3.2;
  d.span('marble', -1.3, 0, az - 0.9, 1.3, 1.2, az + 0.9, { collide: true });
  d.span('marble', -1.5, 1.2, az - 1.1, 1.5, 1.4, az + 1.1);
  d.box('glow_fire', 0, 1.44, az, 0.7, 0.06, 0.5);
  for (const [x, z, ry] of [[-2.8, az - 1.6, 0.3], [2.8, az - 1.6, -0.3], [-2.8, az + 1.6, Math.PI - 0.3], [2.8, az + 1.6, Math.PI + 0.3]] as const) {
    d.span('marble', x - 0.6, 0, z - 1.1, x + 0.6, 0.4, z + 1.1, { collide: true });
    bull(d, x, 0.4, z, ry, 'bronze');
  }
  // Portico of the Danaids along both flanks: giallo antico columns with statues between them.
  for (const sx of [-1, 1]) {
    const xc = sx * (tx - 2.2);
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const z = tz0 + 2 + ((tz1 - 2 - (tz0 + 2)) * i) / n;
      lowColumn(d, 'marble_giallo', xc, 0, z, 0.42, 4.2, { cap: 'ionic', capMat: 'marble', collide: true, seg: hi ? 8 : 6 });
      if (i < n) {
        const zz = z + (tz1 - tz0 - 4) / n / 2;
        d.span('marble', xc + sx * 0.9 - 0.35, 0, zz - 0.35, xc + sx * 0.9 + 0.35, 0.5, zz + 0.35, { collide: true });
        figure(d, xc + sx * 0.9, 0.5, zz, 1.75, 'basalt');
      }
    }
    d.span('marble', xc - 0.4, 4.2, tz0 + 1.6, xc + 0.4, 4.75, tz1 - 1.6);
    const xo = sx * tx;
    d.span('plaster_red', Math.min(xo, xo - sx * 0.4), 0, tz0 + 1.6, Math.max(xo, xo - sx * 0.4), 4.75, tz1 - 1.6, { collide: true });
    const q = sx < 0
      ? [xo, 5.6, tz0 + 1.6, xc, 4.75, tz0 + 1.6, xc, 4.75, tz1 - 1.6, xo, 5.6, tz0 + 1.6, xc, 4.75, tz1 - 1.6, xo, 5.6, tz1 - 1.6]
      : [xo, 5.6, tz1 - 1.6, xc, 4.75, tz1 - 1.6, xc, 4.75, tz0 + 1.6, xo, 5.6, tz1 - 1.6, xc, 4.75, tz0 + 1.6, xo, 5.6, tz0 + 1.6];
    d.tris('roof_tile', q);
  }
  // Steps down from the terrace front to the lower ground.
  const gs = groundRange(ctx, -3, tz0 - 4, 3, tz0 - 1);
  if (gs.min < -0.25) stair(d.at(0, gs.min, tz0 - Math.ceil(-gs.min / 0.2) * 0.32, 0), 5.0, -gs.min, 'marble');
  spots.add('temple-apollo-inscription', 'inscription', L.stylobate.x0 + 1.8, 0, L.podiumFront - 1.5, 0);
  spots.add('apollo-altar', 'shrine', 0, 0, az - 2.4, 0);
  spots.add('apollo-temple-door', 'door', 0, L.podiumHeight, L.cella.z0 - 1.0, Math.PI);
  spots.add('apollo-vista-terrace', 'vista', 0, 0, tz0 + 0.8, Math.PI);
  spots.add('apollo-librarian', 'npc', sx(1) * (tx - 3.6), 0, 4, -Math.PI / 2);
  spots.add('apollo-portico-bench', 'sit', -(tx - 3.4), 0, -6, Math.PI / 2);
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: 2000 };
}
const sx = (s: number) => s;

// ---------------------------------------------------------------- House of Augustus

function houseAugustus(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  const HW = 11.4, HD = 9.3;
  const fl = 0.3;
  block(d, ctx, -HW, -HD, HW, HD, fl, 'tufa', { cornice: 'travertine' });
  // Basement storey exposed on the falling front, with small windows.
  openings(d, -HW, -HD, HW, HD, 'n', -2.4, 0.6, 0.9, 3.0);
  // Two-storey ranges round a small peristyle.
  const H = 7.0;
  const cx0 = -4.2, cx1 = 4.2, cz0 = -2.4, cz1 = 4.6;
  for (const [x0, z0, x1, z1] of [[-HW, -HD, HW, cz0 - 1.6], [-HW, cz1 + 1.6, HW, HD], [-HW, cz0 - 1.6, cx0 - 1.6, cz1 + 1.6], [cx1 + 1.6, cz0 - 1.6, HW, cz1 + 1.6]] as const) {
    d.span('plaster_cream', x0, fl, z0, x1, fl + H, z1, { collide: true });
    roofOver(d, x0, z0, x1, z1, fl + H, 0.36, 'roof_tile', 'plaster_cream');
  }
  d.span('plaster_red', -HW, fl, -HD - 0.02, HW, fl + 1.1, -HD);
  openings(d, -HW, -HD, HW, HD, 'n', fl + 4.2, 0.8, 1.2, 2.6, { margin: 2 });
  peristyle(d, cx0, cz0, cx1, cz1, fl, { D: 0.3, H: 3.0, spacing: 2.1, depth: 1.5, mat: 'plaster_white', cap: 'ionic', back: false, lite: true });
  gardenBed(d, cx0 + 0.6, cz0 + 0.6, cx1 - 0.6, cz1 - 0.6, fl, true);
  // The door with the two laurels and the oak-leaf civic crown voted by the Senate (Res Gestae 34).
  const door = d.at(0, fl, -HD);
  door.span('travertine', -1.5, 0, -0.25, 1.5, 3.6, 0.02);
  door.span('wood_dark', -0.85, 0, -0.3, 0.85, 2.9, -0.24);
  door.cyl('foliage_broad', 0, 3.95, -0.32, 0.55, 0.14, 14, { rx: Math.PI / 2, open: true });
  door.cyl('foliage_olive', 0, 3.95, -0.3, 0.42, 0.14, 14, { rx: Math.PI / 2, open: true });
  const gf = groundRange(ctx, -2, -HD - 3, 2, -HD).min;
  if (fl - gf > 0.15) stair(d.at(0, gf, -HD - Math.ceil((fl - gf) / 0.2) * 0.32), 2.2, fl - gf, 'travertine');
  const trees: TreeSpec[] = [{ species: 'laurel', x: -2.3, z: -HD - 0.9, scale: 0.75, variant: 0 }, { species: 'laurel', x: 2.3, z: -HD - 0.9, scale: 0.75, variant: 1 }];
  for (const t of plantTrees(ctx, trees)) b.collider(t);
  spots.add('house-augustus-door', 'door', 0, Math.max(gf, 0), -HD - 2.8, 0);
  spots.add('house-augustus-laurels', 'shrine', 0, Math.max(gf, 0), -HD - 3.6, 0);
  spots.add('house-augustus-custodian', 'npc', 1.6, Math.max(gf, 0), -HD - 2.2, Math.PI);
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: 1200 };
}

// ---------------------------------------------------------------- House of Livia

function houseLivia(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  const HW = 7.2, HD = 12;
  const fl = 0.3;
  block(d, ctx, -HW, -HD, HW, HD, fl, 'tufa', {});
  const H = 5.6;
  // Atrium (compluviate roof over an impluvium) at the front, tablinum and painted rooms behind.
  const ax0 = -4.0, ax1 = 4.0, az0 = -HD + 3.2, az1 = -HD + 11.2;
  for (const [x0, z0, x1, z1] of [[-HW, -HD, HW, az0], [-HW, az0, ax0, az1], [ax1, az0, HW, az1], [-HW, az1, HW, HD]] as const) {
    d.span('plaster_cream', x0, fl, z0, x1, fl + H, z1, { collide: true });
  }
  // Roofs: four planes sloping into the compluvium opening.
  const y0 = fl + H, rise = 1.6;
  const ix0 = -1.6, ix1 = 1.6, iz0 = az0 + 2.2, iz1 = az1 - 2.2;
  const q = (a: number[], c: number[], e: number[], f: number[]) => d.tris('roof_tile', [...a, ...c, ...e, ...a, ...e, ...f]);
  q([-HW - 0.3, y0 + rise, -HD - 0.3], [ix0, y0 + 0.3, iz0], [ix1, y0 + 0.3, iz0], [HW + 0.3, y0 + rise, -HD - 0.3]);
  q([HW + 0.3, y0 + rise, -HD - 0.3], [ix1, y0 + 0.3, iz0], [ix1, y0 + 0.3, iz1], [HW + 0.3, y0 + rise, HD + 0.3]);
  q([HW + 0.3, y0 + rise, HD + 0.3], [ix1, y0 + 0.3, iz1], [ix0, y0 + 0.3, iz1], [-HW - 0.3, y0 + rise, HD + 0.3]);
  q([-HW - 0.3, y0 + rise, HD + 0.3], [ix0, y0 + 0.3, iz1], [ix0, y0 + 0.3, iz0], [-HW - 0.3, y0 + rise, -HD - 0.3]);
  // Impluvium and the atrium floor.
  d.span('mosaic', ax0, fl - 0.02, az0, ax1, fl + 0.02, az1);
  pool(d, ix0, iz0, ix1, iz1, fl, 0.25, 0.2);
  // Door on the NW front.
  d.span('travertine', -1.2, fl, -HD - 0.2, 1.2, fl + 3.1, -HD + 0.02);
  d.span('wood_dark', -0.7, fl, -HD - 0.24, 0.7, fl + 2.6, -HD - 0.2);
  openings(d, -HW, -HD, HW, HD, 'w', fl + 3.4, 0.6, 0.8, 3.0);
  openings(d, -HW, -HD, HW, HD, 'e', fl + 3.4, 0.6, 0.8, 3.0);
  // The lead pipe stamped IVLIA AVG (Livia's name after 14) running along the wall.
  d.cyl('lead', HW + 0.12, fl + 0.25, 0, 0.08, 2 * HD - 1, 6, { rx: Math.PI / 2 });
  paintedSign(b, ['Iulia Aug'], 0.5, 0.12, T4(HW + 0.21, fl + 0.25, 0, -Math.PI / 2), { ink: '#3a3a3a', ground: '#8a8e94' });
  const gf = groundRange(ctx, -1.5, -HD - 3, 1.5, -HD).min;
  if (fl - gf > 0.15) stair(d.at(0, gf, -HD - Math.ceil((fl - gf) / 0.2) * 0.32), 2.0, fl - gf, 'travertine');
  spots.add('house-livia-door', 'door', 0, fl, -HD - 1.5, 0);
  spots.add('house-livia-pipe', 'inscription', HW + 1.2, 0, 0, -Math.PI / 2);
  spots.add('house-livia-atrium', 'vista', 0, fl, az0 + 1.2, 0);
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: 1200 };
}

// ---------------------------------------------------------------- Temple of the Great Mother

function magnaMater(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  const hi = ctx.detail === 'high';
  const L = temple(b, {
    order: 'corinthian',
    plan: 'prostyle',
    front: 6,
    width: 17 * ctx.S * 0.95,
    podiumHeight: 3.4,
    material: 'plaster_white',
    podiumMaterial: 'tufa',
    cellaMaterial: 'plaster_white',
    roofMaterial: 'roof_tile',
    detail: ctx.detail,
    riser: 0.2,
  }).layout;
  templeFooting(ctx, d, L, 'tufa');
  // The great flight is the cavea of the Megalesian plays (the kit's frontal stair).
  const f = L.flights[0];
  const gfront = Math.min(0, groundRange(ctx, f.x0, f.z0 - 2, f.x1, f.z0).min);
  // Cybele's lions flanking the stair.
  for (const s of [-1, 1]) {
    const x = s * ((L.stylobate.x1 - L.stylobate.x0) / 2 - 0.6);
    d.span('tufa', x - 0.6, L.podiumHeight - 0.05, f.z0 - 0.2, x + 0.6, L.podiumHeight + 0.2, f.z0 + 1.6);
    d.geo(lion(), 'bronze', x, L.podiumHeight + 0.2, f.z0 + 0.7, { sx: 0.9, sy: 0.9, sz: 0.9 });
  }
  inscriptionPanel(b, { lines: ['Matri Deum Magnae Idaeae'], width: 3.6, height: 0.5, style: 'carved', border: true }, T4(0, L.podiumHeight + L.H + L.entablature.height * 0.45, L.entablature.z0 - 0.06), { depth: 0.04, bodyMaterial: 'plaster_white' });
  // Altar at the foot of the steps; tympana (drums) hung on the cella.
  const az = f.z0 - 1.2;
  const ax = L.stylobate.x1 + 1.6;
  d.span('tufa', ax - 0.7, Math.min(0, gfront), az - 0.7, ax + 0.7, Math.min(0, gfront) + 1.1, az + 0.7, { collide: true });
  void hi;
  spots.add('magna-mater-inscription', 'inscription', 0, Math.min(0, gfront), f.z0 - 4.0, 0);
  spots.add('magna-mater-altar', 'shrine', ax, Math.min(0, gfront), az - 1.4, 0);
  spots.add('magna-mater-gallus-a', 'npc', -2.2, L.podiumHeight, L.stylobate.z0 + 0.8, Math.PI);
  spots.add('magna-mater-gallus-b', 'npc', 2.2, L.podiumHeight, L.stylobate.z0 + 0.8, Math.PI);
  spots.add('magna-mater-steps', 'sit', -1.5, L.podiumHeight * 0.5, (f.z0 + f.z1) / 2, Math.PI);
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: 1600 };
}

// ---------------------------------------------------------------- Temple of Victory

function victoria(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  const L = temple(b, {
    order: 'corinthian',
    plan: 'prostyle',
    front: 4,
    width: 19 * ctx.S * 0.85,
    podiumHeight: 2.6,
    material: 'plaster_white',
    podiumMaterial: 'tufa',
    cellaMaterial: 'plaster_cream',
    roofMaterial: 'roof_tile',
    detail: ctx.detail,
    pedimentRelief: false,
  }).layout;
  templeFooting(ctx, d, L, 'tufa');
  const f = L.flights[0];
  const gfront = groundRange(ctx, f.x0, f.z0 - 3, f.x1, f.z0).min;
  if (gfront < -0.2) {
    const n = Math.ceil(-gfront / 0.2);
    for (let i = 0; i < n; i++) d.span('tufa', f.x0, gfront + i * (-gfront / n), f.z0 - (n - i) * 0.32, f.x1, gfront + (i + 1) * (-gfront / n), f.z0, { collide: true });
  }
  // A gilded Victory on the apex acroterion.
  const ap = L.totalHeight;
  d.cyl('gilded_bronze', 0, ap + 0.6, L.entablature.z0 + 0.3, 0.18, 1.2, 8, { rTop: 0.08 });
  for (const s of [-1, 1]) d.box('gilded_bronze', s * 0.3, ap + 0.9, L.entablature.z0 + 0.4, 0.45, 0.7, 0.04, { rz: s * 0.5 });
  const az = f.z0 - 2.0;
  d.span('tufa', -0.8, Math.min(0, gfront), az - 0.6, 0.8, Math.min(0, gfront) + 1.0, az + 0.6, { collide: true });
  spots.add('victoria-altar', 'shrine', 0, Math.min(0, gfront), az - 1.2, 0);
  spots.add('victoria-door', 'door', 0, L.podiumHeight, L.cella.z0 - 0.8, Math.PI);
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: 1400 };
}

// ---------------------------------------------------------------- Hut of Romulus

/**
 * Casa Romuli at 1:1 (it is a dwelling): an oval wattle-and-daub hut 4.9 × 3.6 m on postholes cut
 * into the tufa, a steep reed thatch with crossed ridge timbers, a porch over the door, a sacred
 * fence. Rebuilt exactly whenever it burns; tended by the pontiffs.
 */
export function hutGeometry(d: Draw, rng: Rng, hi: boolean) {
  const rx = 2.45, rz = 1.8;
  const wallH = 1.75;
  const n = hi ? 20 : 12;
  // Wattle-and-daub wall ring (segments), with a doorway on the −z side.
  const doorA0 = -Math.PI / 2 - 0.3, doorA1 = -Math.PI / 2 + 0.3;
  for (let i = 0; i < n; i++) {
    const a0 = (2 * Math.PI * i) / n - Math.PI, a1 = (2 * Math.PI * (i + 1)) / n - Math.PI;
    const am = (a0 + a1) / 2;
    if (am > doorA0 && am < doorA1) continue;
    const p0 = [Math.cos(a0) * rx, Math.sin(a0) * rz], p1 = [Math.cos(a1) * rx, Math.sin(a1) * rz];
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + 0.04;
    d.box('dirt', (p0[0] + p1[0]) / 2, wallH / 2, (p0[1] + p1[1]) / 2, len, wallH, 0.16, { ry: -Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) });
    // Posts in the postholes.
    d.cyl('wood_dark', p0[0] * 1.02, wallH / 2 + 0.05, p0[1] * 1.02, 0.07, wallH + 0.1, 6);
  }
  // Door frame (posts and lintel) and a reed mat hung in the doorway.
  const dz = -rz;
  for (const s of [-1, 1]) d.cyl('wood_dark', s * 0.62, 1.05, dz, 0.08, 2.1, 6);
  d.span('wood_dark', -0.7, 2.05, dz - 0.08, 0.7, 2.15, dz + 0.08);
  // Thatch: an oval cone with a smoke hole, the eaves low over the walls.
  const pos: number[] = [];
  const ringR = (k: number) => 1 + 0.25 - k * 1.05; // radius scale from eaves (1.25) to the top (0.2)
  const levels = hi ? 5 : 3;
  const yAt = (k: number) => wallH - 0.25 + k * 2.35;
  for (let l = 0; l < levels; l++) {
    const k0 = l / levels, k1 = (l + 1) / levels;
    for (let i = 0; i < n; i++) {
      const a0 = (2 * Math.PI * i) / n, a1 = (2 * Math.PI * (i + 1)) / n;
      const P = (k: number, a: number) => [Math.cos(a) * rx * ringR(k) + (rng.next() - 0.5) * 0.02, yAt(k), Math.sin(a) * rz * ringR(k)];
      const A = P(k0, a0), B = P(k0, a1), C = P(k1, a1), D = P(k1, a0);
      pos.push(...A, ...D, ...C, ...A, ...C, ...B);
    }
  }
  d.tris('dry_grass', pos, { uvScale: 1.0 });
  // Thatch underside (dark), seen from inside.
  const under: number[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (2 * Math.PI * i) / n, a1 = (2 * Math.PI * (i + 1)) / n;
    const P = (k: number, a: number) => [Math.cos(a) * rx * ringR(k), yAt(k) - 0.12, Math.sin(a) * rz * ringR(k)];
    const A = P(0, a0), B = P(0, a1), C = P(1, a1), D = P(1, a0);
    under.push(...A, ...B, ...C, ...A, ...C, ...D);
  }
  d.tris('wood_dark', under);
  // Ridge timbers crossed at the top ("horns" seen on the hut urns).
  const yt = yAt(1);
  for (const s of [-1, 1]) d.rod('wood_dark', { x: -0.55, y: yt - 0.2, z: s * 0.05 }, { x: 0.55, y: yt + 0.45, z: -s * 0.05 }, 0.05, 5);
  d.rod('wood_dark', { x: -rx * 0.35, y: yt - 0.05, z: 0 }, { x: rx * 0.35, y: yt - 0.05, z: 0 }, 0.06, 5);
  // Porch roof over the door on two forked posts.
  for (const s of [-1, 1]) d.cyl('wood_dark', s * 0.75, 1.0, dz - 1.0, 0.07, 2.0, 6);
  const pp = [-1.0, 2.15, dz - 1.25, 1.0, 2.15, dz - 1.25, 1.0, 2.7, dz + 0.2, -1.0, 2.15, dz - 1.25, 1.0, 2.7, dz + 0.2, -1.0, 2.7, dz + 0.2];
  d.tris('dry_grass', pp);
  d.tris('dry_grass', [-1.0, 2.15, dz - 1.25, 1.0, 2.7, dz + 0.2, 1.0, 2.15, dz - 1.25, -1.0, 2.15, dz - 1.25, -1.0, 2.7, dz + 0.2, 1.0, 2.7, dz + 0.2]);
  // Inside: a hearth with embers, storage jars, a bench.
  d.cyl('rock', 0.4, 0.08, 0.3, 0.45, 0.16, 8);
  d.cyl('black', 0.4, 0.17, 0.3, 0.3, 0.03, 8);
  d.box('glow_fire', 0.4, 0.19, 0.3, 0.16, 0.05, 0.12, { ry: 0.5 });
  for (const [x, z] of [[-1.6, 0.6], [-1.3, 0.95], [1.7, 0.5]]) d.cyl('terracotta', x, 0.3, z, 0.2, 0.6, 7, { rTop: 0.14 });
  d.span('wood', 0.9, 0, 0.9, 1.9, 0.45, 1.3);
  return { rx, rz, wallH, doorZ: dz };
}

function casaRomuli(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  const rng = new Rng('casa-romuli');
  const hi = ctx.detail === 'high';
  // Levelled tufa bedrock platform (the postholes are cut into it), with a footing to the slope.
  const g = groundRange(ctx, -3.6, -3.9, 3.6, 3.4, 1);
  const top = Math.max(0.15, g.max * 0.4 + 0.15);
  rockPlinth(d, -3.6, -3.9, 3.6, 3.4, Math.min(g.min, 0) - 0.8, top, 1.6, 'rock');
  d.span('tufa', -3.4, top - 0.02, -3.7, 3.4, top + 0.03, 3.2);
  // Tufa outcrops on the cliff side (W and S) where the plateau breaks away.
  rockBoulder(d, -4.4, g.min + 0.4, 0.5, 2.0, 2.4, 2.6, 7);
  rockBoulder(d, -1.5, g.min + 0.3, 4.4, 2.4, 2.0, 1.8, 8);
  const hut = d.at(0, top + 0.03, 0);
  const H = hutGeometry(hut, rng, hi);
  // Colliders: wall ring as eight boxes leaving the doorway open.
  for (let i = 0; i < 8; i++) {
    const a = (2 * Math.PI * (i + 0.5)) / 8 - Math.PI;
    if (Math.abs(a + Math.PI / 2) < 0.4) continue;
    const x = Math.cos(a) * H.rx, z = Math.sin(a) * H.rz;
    hut.box('mud', x, 0.9, z, 0.05, 0.05, 0.05);
    hut.solidCyl(x, 0.9, z, 0.55, 1.8);
  }
  // Sacred fence (stone kerb and a timber paling) with a gate before the door.
  const fr = 3.05;
  for (let i = 0; i < 24; i++) {
    const a = (2 * Math.PI * i) / 24 - Math.PI / 2;
    if (Math.abs(a + Math.PI / 2) < 0.2) continue;
    const x = Math.cos(a) * fr * 1.1, z = Math.sin(a) * fr * 0.95;
    d.cyl('wood', x, top + 0.55, z, 0.06, 1.1, 5);
    d.box('tufa', x, top + 0.1, z, 0.5, 0.2, 0.5);
  }
  for (const y of [0.45, 0.95]) {
    for (let i = 0; i < 24; i++) {
      const a0 = (2 * Math.PI * i) / 24 - Math.PI / 2, a1 = (2 * Math.PI * (i + 1)) / 24 - Math.PI / 2;
      if (Math.abs(a0 + Math.PI / 2) < 0.2 || Math.abs(a1 + Math.PI / 2 - 2 * Math.PI) < 0.2 || Math.abs(a1 + Math.PI / 2) < 0.2) continue;
      d.rod('wood', { x: Math.cos(a0) * fr * 1.1, y: top + y, z: Math.sin(a0) * fr * 0.95 }, { x: Math.cos(a1) * fr * 1.1, y: top + y, z: Math.sin(a1) * fr * 0.95 }, 0.035, 4);
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = (2 * Math.PI * (i + 0.5)) / 12 - Math.PI / 2;
    if (Math.abs(a + Math.PI / 2) < 0.3 || Math.abs(a - 1.5 * Math.PI) < 0.3) continue;
    d.solidCyl(Math.cos(a) * fr * 1.1, top + 0.6, Math.sin(a) * fr * 0.95, 0.9, 1.2);
  }
  // Marker stone and a small altar before the gate.
  d.span('travertine', 1.2, top, -fr - 0.75, 2.0, top + 0.9, -fr - 0.45, { collide: true });
  inscriptionPanel(b, { lines: ['Casa Romuli'], width: 0.75, height: 0.28, style: 'carved' }, T4(1.6, top + 0.6, -fr - 0.77), { depth: 0.02, bodyMaterial: 'travertine' });
  d.span('tufa', -2.0, top, -fr - 0.8, -1.3, top + 0.85, -fr - 0.2, { collide: true });
  d.box('glow_fire', -1.65, top + 0.88, -fr - 0.5, 0.3, 0.04, 0.3);
  // Lamps for the night (the hearth fire never goes out).
  requestLamps(ctx.game, landmarkToWorld(ctx), [{ position: new THREE.Vector3(0.4, top + 0.5, 0.3), color: 0xff8a3a, intensity: 4, distance: 5, flicker: 0.5, night: false, dayScale: 0, glow: 0.12 }]);
  spots.add('casa-romuli-titulus', 'inscription', 1.6, top, -fr - 1.6, 0);
  spots.add('casa-romuli-door', 'door', 0, top, H.doorZ - 1.4, 0);
  spots.add('casa-romuli-hut', 'shrine', 0, top, -fr - 0.6, 0);
  spots.add('casa-romuli-custodian', 'npc', -2.6, top, -fr - 2.2, 0.4);
  spots.add('casa-romuli-vista', 'vista', -6.0, Math.max(g.min, -1), 2.0, -Math.PI / 2 - 0.5);
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: 900 };
}

// ---------------------------------------------------------------- Lupercal

function lupercal(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  const rng = new Rng('lupercal');
  const hi = ctx.detail === 'high';
  // A tufa crag at the foot of the Palatine (local +z is the hill): the cave opens in its face.
  const face = 4.5;
  const caveW = 3.2, caveH = 3.6, caveD = 4.2;
  const back = face + caveD;
  const boulder = (x: number, y: number, z: number, sx: number, sy: number, sz: number, seed: number, solid = true) => rockBoulder(d, x, y, z, sx, sy, sz, seed, solid);
  const gAt = (x: number, z: number) => ctx.groundAt(x, z);
  let seed = 1;
  for (const [x, z, sx2, sy2, sz2] of [
    [-6.0, face + 3.2, 4.4, 5.6, 3.6], [6.2, face + 3.2, 4.6, 5.2, 3.6], [-12.0, face + 5.0, 3.8, 4.2, 3.8], [12.0, face + 5.5, 3.8, 3.8, 4.0],
    [0, face + 7.5, 5.0, 4.0, 4.4], [-5.0, face + 10.5, 5.6, 5.2, 4.6], [5.0, face + 11.0, 5.6, 5.4, 4.6], [0, face + 14.5, 6.0, 4.6, 4.4],
    [-11.0, face + 13.0, 4.6, 4.4, 4.6], [11.0, face + 13.5, 4.4, 4.0, 4.4],
  ] as const) {
    boulder(x, Math.max(0, gAt(x, z)) + sy2 * 0.5, z, sx2, sy2, sz2, seed++);
  }
  // The lintel crag over the cave mouth and the grotto chamber walls behind it.
  boulder(0, caveH + 1.9, face + 1.8, 3.2, 2.4, 2.4, 41, false);
  d.solid(-caveW / 2 - 0.3, caveH, face, caveW / 2 + 0.3, caveH + 3.5, face + 3.5);
  for (const sx2 of [-1, 1]) d.span('rock', sx2 * (caveW / 2), -0.1, face - 0.2, sx2 * (caveW / 2 + 1.6), caveH + 0.4, back + 0.3, { collide: true });
  d.span('rock', -caveW / 2 - 0.2, caveH, face + 0.4, caveW / 2 + 0.2, caveH + 0.8, back + 0.3);
  d.span('rock', -caveW / 2 - 0.2, -0.1, back, caveW / 2 + 0.2, caveH + 0.4, back + 0.6, { collide: true });
  // Grotto lining (dark rock) and floor; spring basin; the bronze she-wolf with the twins.
  d.span('rock', -caveW / 2, -0.1, face, caveW / 2, 0.05, back, { collide: true });
  d.span('black', -caveW / 2 + 0.02, 0.05, back - 0.05, caveW / 2 - 0.02, caveH, back - 0.02);
  d.span('marble', -1.2, 0, back - 1.4, 1.2, 0.5, back - 0.3, { collide: true });
  d.span('water', -1.05, 0.38, back - 1.25, 1.05, 0.46, back - 0.45);
  const wolfY = 0.0;
  d.span('marble', -0.7, wolfY, face + 1.0, 0.7, 0.8, face + 2.4, { collide: true });
  d.geo(lion(), 'bronze', 0, 0.8, face + 1.7, { sx: 0.75, sy: 0.82, sz: 0.85, ry: Math.PI / 2 });
  for (const s of [-1, 1]) d.ellipsoid('bronze', s * 0.18, 1.05, face + 1.6 + s * 0.15, 0.1, 0.12, 0.18, { seg: [6, 5] });
  // Augustan aedicula framing the mouth: two columns, entablature, pediment.
  const af = d.at(0, 0, face - 0.3);
  af.span('marble', -2.6, -0.05, -1.5, 2.6, 0.35, 0.3, { collide: true });
  for (const x of [-2.1, 2.1]) lowColumn(af, 'marble', x, 0.35, -0.6, 0.42, 3.8, { cap: 'corinthian', collide: true, seg: hi ? 10 : 6 });
  af.span('marble', -2.6, 4.15, -1.1, 2.6, 4.75, 0.2);
  gableRoof(af, -2.6, -1.1, 2.6, 0.2, 4.75, { axis: 'z', pitch: 0.28, over: 0.15, gables: 'marble' });
  inscriptionPanel(b, { lines: ['Lupercal'], width: 1.6, height: 0.42, style: 'bronze' }, T4(0, 4.45, face - 1.42), { depth: 0.03, bodyMaterial: 'marble' });
  // The Ruminal fig before the cave, votive lamps.
  const trees: TreeSpec[] = [{ species: 'fig', x: -4.2, z: face - 3.5, scale: 1.1, variant: 1 }];
  for (const t of plantTrees(ctx, trees)) b.collider(t);
  for (const x of [-0.9, 0.9]) placeProp(d, 'oil_lamp', x, 0.5, back - 0.9, 0, { collide: false });
  requestLamps(ctx.game, landmarkToWorld(ctx), [{ position: new THREE.Vector3(0, 1.2, back - 1.0), color: 0xffa54f, intensity: 3, distance: 5, flicker: 0.3, night: false, dayScale: 1, glow: 0.1 }]);
  void rng;
  spots.add('lupercal-inscription', 'inscription', 0, 0, face - 3.0, 0);
  spots.add('lupercal-shrine', 'shrine', 0, 0, back - 2.0, 0);
  spots.add('lupercal-cave', 'door', 0, 0, face - 0.8, 0);
  spots.add('lupercal-lupercus', 'npc', 2.6, 0, face - 2.5, -0.4);
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: 1200 };
}

// ---------------------------------------------------------------- Adonaea (gardens)

function adonaea(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  const hi = ctx.detail === 'high';
  // Main terrace (the upper garden) on the NW part of the area, a lower terrace toward the SE slope.
  const x0 = -42, x1 = 6, z0 = -28, z1 = 30;
  const gU = groundRange(ctx, x0, z0, x1, z1, 4);
  const y = Math.max(0, Math.min(1.0, gU.max));
  d.span('tufa', x0, Math.min(gU.min, y) - 0.6, z0, x1, y - 0.04, z1, { collide: true });
  d.span('gravel', x0, y - 0.05, z0, x1, y + 0.02, z1);
  // Porticoes on three sides (NW, NE, SW), a retaining wall with a balustrade on the SE edge.
  peristyle(d, x0 + 4, z0 + 4, x1 + 2, z1 - 4, y, { D: 0.42, H: 3.8, spacing: 3.4, depth: 3.2, mat: 'marble', cap: 'corinthian', backMat: 'plaster_cream', lite: !hi, skip: ['e'] });
  d.span('marble', x1 - 0.4, y, z0, x1, y + 1.0, z1, { collide: true });
  // Beds of the "gardens of Adonis" (pots of quick seedlings), hedges, a long pool and fountains.
  gardenBed(d, x0 + 7, z0 + 7, -22, -2, y);
  gardenBed(d, x0 + 7, 2, -22, z1 - 7, y);
  gardenBed(d, -18, z0 + 7, x1 - 3, -2, y);
  gardenBed(d, -18, 2, x1 - 3, z1 - 7, y);
  pool(d, -20, -1.4, -1, 1.4, y);
  for (let i = 0; i < 18; i++) {
    const px = x0 + 8 + (i % 9) * 3.4, pz = i < 9 ? -1.0 : 1.0;
    d.cyl('terracotta', px, y + 0.18 + 0.1, pz + (i < 9 ? -1.9 : 1.9), 0.22, 0.36, 7, { rTop: 0.28 });
    d.cyl('grass', px, y + 0.47, pz + (i < 9 ? -1.9 : 1.9), 0.24, 0.06, 7);
  }
  // A small shrine of Venus and Adonis at the NE end.
  const sh = d.at(x0 + 6, y, 0, Math.PI / 2);
  sh.span('marble', -1.6, 0, -1.4, 1.6, 0.5, 1.4, { collide: true });
  for (const x of [-1.2, 1.2]) lowColumn(sh, 'marble', x, 0.5, -1.0, 0.28, 2.6, { cap: 'corinthian', collide: true, seg: 8 });
  sh.span('marble', -1.6, 3.1, -1.4, 1.6, 3.5, 1.4);
  gableRoof(sh, -1.6, -1.4, 1.6, 1.4, 3.5, { axis: 'z', pitch: 0.3, over: 0.15, gables: 'marble' });
  seatedDeity(b, sh.m.clone().multiply(T4(0, 0.5, 0.4)), { material: 'marble', scale: 0.5, detail: 'low' });
  // Trees: cypresses along the walks, planes and pines for shade, laurels.
  const trees: TreeSpec[] = [];
  for (let k = 0; k < 6; k++) {
    trees.push({ species: 'cypress', x: x0 + 9 + k * 6.6, z: z0 + 5.5, scale: 1.0, variant: k % 3 });
    trees.push({ species: 'cypress', x: x0 + 9 + k * 6.6, z: z1 - 5.5, scale: 1.0, variant: (k + 1) % 3 });
  }
  for (const [x, z, s] of [[-30, -10, 'plane'], [-30, 12, 'plane'], [-8, -12, 'umbrella_pine'], [-8, 14, 'laurel'], [16, -14, 'umbrella_pine'], [22, 10, 'umbrella_pine'], [30, -2, 'cypress']] as const) {
    trees.push({ species: s, x, z, scale: s === 'umbrella_pine' ? 1.15 : 1.0, variant: Math.abs(x) % 3, y: x > x1 ? undefined : y });
  }
  for (const t of plantTrees(ctx, trees)) b.collider(t);
  spots.add('adonaea-vista', 'vista', x1 - 1.2, y, 0, Math.PI / 2);
  spots.add('adonaea-shrine', 'shrine', x0 + 9, y, 0, -Math.PI / 2);
  spots.add('adonaea-gardener', 'npc', -26, y, 5, 0);
  spots.add('adonaea-bench', 'sit', -12, y, z0 + 6.5, 0);
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: 1600 };
}

export const builders: LandmarkBuilder[] = [
  { handles: ['temple-apollo-palatinus'], build: apollo },
  { handles: ['house-augustus'], build: houseAugustus },
  { handles: ['house-livia'], build: houseLivia },
  { handles: ['temple-magna-mater'], build: magnaMater },
  { handles: ['temple-victoria'], build: victoria },
  { handles: ['casa-romuli'], build: casaRomuli },
  { handles: ['lupercal'], build: lupercal },
  { handles: ['adonaea'], build: adonaea },
];

void mergeAll;
