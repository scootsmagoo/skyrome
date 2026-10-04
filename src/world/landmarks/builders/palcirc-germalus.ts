/**
 * The Germalus and the Palatine's older sanctuaries (palcirc crew): Temple of Palatine Apollo with
 * its terrace, the Houses of Augustus and Livia, the Temples of Magna Mater and Victoria, the Hut of
 * Romulus, the Lupercal at the hill foot and the Adonaea gardens on the NE corner.
 */
import * as THREE from 'three';
import { Draw } from '../../../arch/fabric/draw';
import { temple, type TempleLayout, type TempleSpec } from '../../../arch/classical/temple';
import { MeshBuilder } from '../../../gfx/MeshBuilder';
import { quadriga, seatedDeity } from '../../../arch/classical/statues';
import { inscriptionPanel, paintedSign } from '../../../arch/common/inscription';
import { placeProp } from '../../../arch/props/props';
import { Rng } from '../../../core/Rng';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext } from '../types';
import { block, boulder as rockBoulder, gardenBed, openings, peristyle, pool, rockPlinth, roofOver, stair } from './palcirc/palace';
import { lion } from './palcirc/shapes';
import { Spots, drawFor, gableRoof, groundRange, lowColumn, plantTrees, type TreeSpec } from './palcirc/util';
import { requestLamps } from './palcirc/runtime';
import { streetRow, type PlacedLot } from './palcirc/streetRow';
import type { Lamp } from './palcirc/capenaParts';
import { fromHost, relLocal } from './palcirc/frames';
import { CIRCUS } from './palcirc/circusLayout';
import { compitalShrine } from '../../../arch/fabric/shrines';
import { lacus } from '../../../arch/fabric/fountain';
import { LANDMARK_BY_ID, ROADS } from '../../../data/atlas';
import type { LandmarkData } from '../types';
import { landmarkToWorld } from './palcirc/util';
import { settled } from './palcirc/settle';

/** Near range (m) of the high-detail temples; beyond it their low-detail stand-in is shown. */
const NEAR = 320;

/** Low-detail copy of a kit temple (plus extras) as a far stand-in (no colliders). */
export function templeFar(ctx: LandmarkContext, spec: TempleSpec, extra?: (b: MeshBuilder, d: Draw, L: TempleLayout) => void): THREE.Object3D {
  const fb = new MeshBuilder();
  const fd = new Draw(fb);
  const L = temple(fb, { ...spec, detail: 'low', pedimentRelief: false }).layout;
  extra?.(fb, fd, L);
  return fb.build(`${ctx.lm.id}:far`);
}

const T4 = (x: number, y: number, z: number, ry = 0) => new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(ry));

/** Masonry footing under a temple layout (podium + stairs) wherever the ground dips. */
function templeFooting(ctx: LandmarkContext, d: Draw, L: TempleLayout, mat: MaterialId) {
  const x0 = L.stylobate.x0, x1 = L.stylobate.x1;
  const z0 = L.podiumFront, z1 = L.stylobate.z1;
  const g = groundRange(ctx, x0, z0, x1, z1, 2);
  if (g.min < -0.05) d.span(mat, x0, g.min - 0.6, z0, x1, 0.02, z1, { collide: true });
}

/**
 * Footing steps (≤ 0.2 m risers, 0.32 m treads) in front of a temple's frontal flight, from the
 * lowest ground before it up to the pad (y = 0), wherever the pad's edge falls away. Returns the
 * ground level at the foot (≤ 0).
 */
function footSteps(ctx: LandmarkContext, d: Draw, f: TempleLayout['flights'][number], mat: MaterialId): number {
  const probe = groundRange(ctx, f.x0, f.z0 - 3, f.x1, f.z0, 0.5).min;
  if (probe >= -0.12) return Math.min(0, probe);
  const n = Math.ceil(-probe / 0.2 - 1e-6);
  const r = -probe / n;
  for (let i = 0; i < n; i++) d.span(mat, f.x0, probe + i * r, f.z0 - (n - i) * 0.32, f.x1, probe + (i + 1) * r, f.z0, { collide: true });
  return probe;
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
  const spec: TempleSpec = {
    order: 'corinthian',
    // Prostyle with a deep porch (the triangle budget of a full pseudoperipteral order is ~2×).
    plan: 'prostyle',
    front: 6,
    sides: 8,
    pronaos: 3,
    width: W,
    podiumHeight: 3.0,
    material: 'marble',
    podiumMaterial: 'marble',
    cellaMaterial: 'marble',
    roofMaterial: 'roof_tile',
    doorMaterial: 'marble',
    fluted: true,
    detail: ctx.detail,
  };
  const L = temple(b, spec).layout;
  // The gilded chariot of the Sun on the apex of the pediment.
  const apexZ = L.entablature.z0 + 0.6;
  quadriga(b, T4(0, L.totalHeight - 0.4, apexZ + 0.9), { material: 'gilded_bronze', driverMaterial: 'gilded_bronze', scale: 0.85, detail: 'low' });
  // Dedication on the podium front, between the stair wings.
  inscriptionPanel(b, { lines: ['Apollini Palatino', 'Imp Caesar Divi F'], width: 3.4, height: 0.8, style: 'bronze', border: true }, T4(L.stylobate.x0 + 1.8, L.podiumHeight * 0.55, L.stylobate.z0 - 0.02 - (L.stylobate.z0 - L.podiumFront)), { depth: 0.04, bodyMaterial: 'marble' });
  // Altar before the stairs with Myron's four bronze cattle, two either side facing it (the
  // terrace is shallow in front: the House of Augustus is just below).
  const az = L.podiumFront - 1.9;
  d.span('marble', -1.3, 0, az - 0.9, 1.3, 1.2, az + 0.9, { collide: true });
  d.span('marble', -1.5, 1.2, az - 1.1, 1.5, 1.4, az + 1.1);
  d.box('glow_fire', 0, 1.44, az, 0.7, 0.06, 0.5);
  for (const sx of [-1, 1]) {
    for (const k of [0, 1]) {
      const x = sx * (2.75 + k * 2.2);
      d.span('marble', x - 1.0, 0, az - 0.5, x + 1.0, 0.4, az + 0.5, { collide: true });
      bull(d, x, 0.4, az, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 'bronze');
    }
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
  // The terrace front looks down over the House of Augustus, built close below it (the atlas
  // puts the house just in front): a marble balustrade, no stair (the way in is from the Area
  // Palatina behind and at the corners).
  d.span('marble', -tx, 0, tz0, tx, 1.05, tz0 + 0.3, { collide: true });
  d.span('marble', -tx - 0.05, 1.0, tz0 - 0.03, tx + 0.05, 1.12, tz0 + 0.33);
  spots.add('temple-apollo-inscription', 'inscription', L.stylobate.x0 + 1.8, 0, L.podiumFront - 1.5, 0);
  spots.add('apollo-altar', 'shrine', 0, 0, az + 1.55, Math.PI);
  spots.add('apollo-temple-door', 'door', 0, L.podiumHeight, L.cella.z0 - 1.0, Math.PI);
  spots.add('apollo-vista-terrace', 'vista', 8.0, 0, tz0 + 0.9, Math.PI);
  spots.add('apollo-librarian', 'npc', sx(1) * (tx - 3.6), 0, 4, -Math.PI / 2);
  spots.add('apollo-portico-bench', 'sit', -(tx - 3.4), 0, -6, Math.PI / 2);
  // Far stand-in: the same temple at low detail with the chariot, on its terrace.
  const far = templeFar(ctx, spec, (fb, fd, FL) => {
    fd.span('paving_travertine', -tx, -0.06, tz0, tx, 0.03, tz1);
    quadriga(fb, T4(0, FL.totalHeight - 0.4, FL.entablature.z0 + 1.5), { material: 'gilded_bronze', scale: 0.85, detail: 'low' });
  });
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: NEAR, far };
}
const sx = (s: number) => s;

// ---------------------------------------------------------------- House of Augustus

function houseAugustus(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  // 38 × 31 m in the atlas; the back is cut 2.5 m short so the house stands clear of the Temple of
  // Apollo's terrace, which the atlas puts right behind it (HB is the back line).
  const HW = 11.4, HD = 9.3, HB = HD - 2.5;
  const fl = 0.3;
  block(d, ctx, -HW, -HD, HW, HB, fl, 'tufa', { cornice: 'travertine' });
  // Basement storey exposed on the falling front, with small windows.
  openings(d, -HW, -HD, HW, HB, 'n', -2.4, 0.6, 0.9, 3.0);
  // Two-storey ranges round a small peristyle.
  const H = 7.0;
  const cx0 = -4.2, cx1 = 4.2, cz0 = -4.2, cz1 = 2.4;
  for (const [x0, z0, x1, z1] of [[-HW, -HD, HW, cz0 - 1.6], [-HW, cz1 + 1.6, HW, HB], [-HW, cz0 - 1.6, cx0 - 1.6, cz1 + 1.6], [cx1 + 1.6, cz0 - 1.6, HW, cz1 + 1.6]] as const) {
    d.span('plaster_cream', x0, fl, z0, x1, fl + H, z1, { collide: true });
    roofOver(d, x0, z0, x1, z1, fl + H, 0.36, 'roof_tile', 'plaster_cream');
  }
  d.span('plaster_red', -HW, fl, -HD - 0.02, HW, fl + 1.1, -HD);
  openings(d, -HW, -HD, HW, HB, 'n', fl + 4.2, 0.8, 1.2, 2.6, { margin: 2 });
  peristyle(d, cx0, cz0, cx1, cz1, fl, { D: 0.3, H: 3.0, spacing: 2.1, depth: 1.5, mat: 'plaster_white', cap: 'ionic', back: false, lite: true });
  gardenBed(d, cx0 + 0.6, cz0 + 0.6, cx1 - 0.6, cz1 - 0.6, fl, true);
  // The door with the two laurels and the oak-leaf civic crown voted by the Senate (Res Gestae 34).
  const door = d.at(0, fl, -HD);
  door.span('travertine', -1.5, 0, -0.25, 1.5, 3.6, 0.02);
  door.span('wood_dark', -0.85, 0, -0.3, 0.85, 2.9, -0.24);
  door.cyl('foliage_broad', 0, 3.95, -0.32, 0.55, 0.14, 14, { rx: Math.PI / 2, open: true });
  door.cyl('foliage_olive', 0, 3.95, -0.3, 0.42, 0.14, 14, { rx: Math.PI / 2, open: true });
  // A landing before the door (the laurels stand on it), and the stair down the slope from it.
  const LD = 2.6;
  const gl = groundRange(ctx, -3, -HD - LD, 3, -HD);
  if (gl.min < fl - 0.05) d.span('tufa', -3, gl.min - 0.5, -HD - LD, 3, fl - 0.02, -HD, { collide: true });
  d.span('travertine', -3, fl - 0.04, -HD - LD, 3, fl + 0.02, -HD, { collide: true });
  const gf = groundRange(ctx, -1.2, -HD - LD - 3, 1.2, -HD - LD).min;
  if (fl - gf > 0.15) stair(d.at(0, gf, -HD - LD - Math.ceil((fl - gf) / 0.2) * 0.32), 2.2, fl - gf, 'travertine');
  const trees: TreeSpec[] = [{ species: 'laurel', x: -2.2, z: -HD - 0.8, y: fl, scale: 0.75, variant: 0 }, { species: 'laurel', x: 2.2, z: -HD - 0.8, y: fl, scale: 0.75, variant: 1 }];
  for (const t of plantTrees(ctx, trees)) b.collider(t);
  spots.add('house-augustus-door', 'door', 0, fl, -HD - 1.2, 0);
  spots.add('house-augustus-laurels', 'shrine', -0.9, fl, -HD - 1.9, 0.3);
  spots.add('house-augustus-custodian', 'npc', 1.0, fl, -HD - 1.6, Math.PI);
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
  // The lead pipe stamped IVLIAE AVG (Livia's name after 14) running along the wall.
  d.cyl('lead', HW + 0.12, fl + 0.25, 0, 0.08, 2 * HD - 1, 6, { rx: Math.PI / 2 });
  paintedSign(b, ['Iuliae Aug'], 0.5, 0.12, T4(HW + 0.21, fl + 0.25, 0, -Math.PI / 2), { ink: '#3a3a3a', ground: '#8a8e94' });
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
  const spec: TempleSpec = {
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
  };
  const L = temple(b, spec).layout;
  templeFooting(ctx, d, L, 'tufa');
  // The great flight is the cavea of the Megalesian plays (the kit's frontal stair); footing steps
  // carry it down to the ground where the pad's edge falls away in front of it.
  const f = L.flights[0];
  const gfront = footSteps(ctx, d, f, 'tufa');
  // Cybele's lions flanking the stair.
  for (const s of [-1, 1]) {
    const x = s * ((L.stylobate.x1 - L.stylobate.x0) / 2 - 0.6);
    d.span('tufa', x - 0.6, L.podiumHeight - 0.05, f.z0 - 0.2, x + 0.6, L.podiumHeight + 0.2, f.z0 + 1.6);
    d.geo(lion(), 'bronze', x, L.podiumHeight + 0.2, f.z0 + 0.7, { sx: 0.9, sy: 0.9, sz: 0.9 });
  }
  inscriptionPanel(b, { lines: ['Matri Deum Magnae Idaeae'], width: 3.6, height: 0.5, style: 'carved', border: true }, T4(0, L.podiumHeight + L.H + L.entablature.height * 0.45, L.entablature.z0 - 0.06), { depth: 0.04, bodyMaterial: 'plaster_white' });
  // Altar beside the foot of the steps, on its own plinth down to the falling ground.
  const az = f.z0 - 1.2;
  const ax = L.stylobate.x1 + 1.6;
  const ga = groundRange(ctx, ax - 1.6, az - 2.4, ax + 1.6, az + 1.6, 0.8);
  d.span('tufa', ax - 1.6, ga.min - 0.4, az - 2.4, ax + 1.6, ga.max + 0.12, az + 1.6, { collide: true });
  d.span('tufa', ax - 0.7, ga.max + 0.12, az - 0.7, ax + 0.7, ga.max + 1.22, az + 0.7, { collide: true });
  d.box('glow_fire', ax, ga.max + 1.25, az, 0.5, 0.05, 0.4);
  spots.add('magna-mater-inscription', 'inscription', 0, gfront, f.z0 - 4.0, 0);
  spots.add('magna-mater-altar', 'shrine', ax, ga.max + 0.12, az - 1.6, 0);
  spots.add('magna-mater-gallus-a', 'npc', -1.2, L.podiumHeight, L.stylobate.z0 + 2.2, Math.PI);
  spots.add('magna-mater-gallus-b', 'npc', 1.2, L.podiumHeight, L.stylobate.z0 + 2.2, Math.PI);
  spots.add('magna-mater-steps', 'sit', -1.5, L.podiumHeight * 0.5, (f.z0 + f.z1) / 2, Math.PI);
  spots.add('magna-mater-door', 'door', 0, L.podiumHeight, L.cella.z0 - 1.0, Math.PI);
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: NEAR, far: templeFar(ctx, spec) };
}

// ---------------------------------------------------------------- Temple of Victory

function victoria(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  const spec: TempleSpec = {
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
  };
  const L = temple(b, spec).layout;
  templeFooting(ctx, d, L, 'tufa');
  const f = L.flights[0];
  const gfront = footSteps(ctx, d, f, 'tufa');
  // A gilded Victory on the apex acroterion.
  const ap = L.totalHeight;
  d.cyl('gilded_bronze', 0, ap + 0.6, L.entablature.z0 + 0.3, 0.18, 1.2, 8, { rTop: 0.08 });
  for (const s of [-1, 1]) d.box('gilded_bronze', s * 0.3, ap + 0.9, L.entablature.z0 + 0.4, 0.45, 0.7, 0.04, { rz: s * 0.5 });
  const az = f.z0 - 2.0;
  d.span('tufa', -0.8, Math.min(0, gfront), az - 0.6, 0.8, Math.min(0, gfront) + 1.0, az + 0.6, { collide: true });
  spots.add('victoria-altar', 'shrine', 0, Math.min(0, gfront), az - 1.2, 0);
  spots.add('victoria-door', 'door', 0, L.podiumHeight, L.cella.z0 - 0.8, Math.PI);
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: NEAR, far: templeFar(ctx, spec) };
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

/** Offset (local m) of the hut from the atlas point, clear of the Magna Mater's stair. */
export const CASA_OFFSET: [number, number] = [9.5, 4.5];

function casaRomuli(ctx0: LandmarkContext) {
  const { b, d: d0 } = drawFor(ctx0);
  const spots0 = new Spots();
  // The atlas point lies on the axis at the foot of the Magna Mater's great stair: the hut stands
  // a few metres aside, on the level ground by the cliff edge (see the crew report).
  const OX = CASA_OFFSET[0], OZ = CASA_OFFSET[1];
  const d = d0.at(OX, 0, OZ);
  const ctx: LandmarkContext = { ...ctx0, groundAt: (x, z) => ctx0.groundAt(x + OX, z + OZ) };
  const spots = { add: (id: string, kind: Parameters<Spots['add']>[1], x: number, y: number, z: number, h = 0) => spots0.add(id, kind, x + OX, y, z + OZ, h) };
  const rng = new Rng('casa-romuli');
  const hi = ctx.detail === 'high';
  // Levelled tufa bedrock platform (the postholes are cut into it), with a footing to the slope.
  const g = groundRange(ctx, -3.6, -3.9, 3.6, 3.4, 1);
  const top = Math.max(0.15, g.max * 0.4 + 0.15);
  rockPlinth(d, -3.6, -3.9, 3.6, 3.4, Math.min(g.min, 0) - 0.8, top, 1.6, 'rock');
  d.span('tufa', -3.4, top - 0.02, -3.7, 3.4, top + 0.03, 3.2);
  // Tufa outcrops on the cliff side (W and S) where the plateau breaks away.
  // Tufa outcrops down the cliff to the west and south, where the plateau breaks away.
  for (const [x, z, sx, sy, sz, seed] of [[-9.5, 0.5, 2.0, 2.4, 2.6, 7], [-7.0, 7.5, 2.4, 2.0, 1.8, 8], [-11.5, 5.5, 1.8, 1.6, 2.2, 9]] as const) {
    rockBoulder(d0, x, ctx0.groundAt(x, z) + sy * 0.25, z, sx, sy, sz, seed);
  }
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
  inscriptionPanel(b, { lines: ['Casa Romuli'], width: 0.75, height: 0.28, style: 'carved' }, T4(1.6 + OX, top + 0.6, -fr - 0.77 + OZ), { depth: 0.02, bodyMaterial: 'travertine' });
  d.span('tufa', -2.0, top, -fr - 0.8, -1.3, top + 0.85, -fr - 0.2, { collide: true });
  d.box('glow_fire', -1.65, top + 0.88, -fr - 0.5, 0.3, 0.04, 0.3);
  // Lamps for the night (the hearth fire never goes out).
  requestLamps(ctx0.game, landmarkToWorld(ctx0), [{ position: new THREE.Vector3(0.4 + OX, top + 0.5, 0.3 + OZ), color: 0xff8a3a, intensity: 4, distance: 5, flicker: 0.5, night: false, dayScale: 0, glow: 0.12 }]);
  spots.add('casa-romuli-titulus', 'inscription', 1.6, top, -fr - 1.6, 0);
  spots.add('casa-romuli-door', 'door', 0, top, H.doorZ - 1.4, 0);
  spots.add('casa-romuli-hut', 'shrine', 0, top, -fr - 0.6, 0);
  spots.add('casa-romuli-custodian', 'npc', -2.6, top, -fr - 2.2, 0.4);
  spots.add('casa-romuli-vista', 'vista', -6.0, Math.max(g.min, -1), 2.0, -Math.PI / 2 - 0.5);
  return { object: b.build(ctx0.lm.id), colliders: b.colliders, spots: spots0.list, cullDistance: 900 };
}

// ---------------------------------------------------------------- Lupercal

function lupercal(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  const hi = ctx.detail === 'high';
  // A tufa crag at the foot of the Palatine (local +z is the hill): the grotto opens in its face, a
  // walkable chamber 3.2 m wide and 4.2 m deep with the spring along one side and the bronze
  // she-wolf with the twins against the back wall.
  const face = 4.5;
  const caveW = 3.2, caveH = 3.6, caveD = 4.2;
  const back = face + caveD;
  const boulder = (x: number, y: number, z: number, sx: number, sy: number, sz: number, seed: number, solid = true) => rockBoulder(d, x, y, z, sx, sy, sz, seed, solid);
  const gAt = (x: number, z: number) => ctx.groundAt(x, z);
  // The crag round the chamber (the boulders stand clear of its walls so none bulges into it).
  let seed = 1;
  for (const [x, z, sx2, sy2, sz2] of [
    [-7.6, face + 3.4, 4.0, 5.6, 3.6], [7.8, face + 3.4, 4.2, 5.2, 3.6], [-13.0, face + 5.0, 3.8, 4.2, 3.8], [13.2, face + 5.5, 3.8, 3.8, 4.0],
    [0, back + 5.4, 5.0, 4.0, 4.4], [-5.6, face + 11.5, 5.6, 5.2, 4.6], [5.6, face + 12.0, 5.6, 5.4, 4.6], [0, face + 16.0, 6.0, 4.6, 4.4],
    [-11.5, face + 13.0, 4.6, 4.4, 4.6], [11.5, face + 13.5, 4.4, 4.0, 4.4],
  ] as const) {
    boulder(x, Math.max(0, gAt(x, z)) + sy2 * 0.5, z, sx2, sy2, sz2, seed++);
  }
  // The lintel crag over the mouth and the chamber: side walls, rock roof, back wall, floor.
  boulder(0, caveH + 1.9, face + 1.8, 3.2, 2.4, 2.4, 41, false);
  d.solid(-caveW / 2 - 0.3, caveH, face, caveW / 2 + 0.3, caveH + 3.5, face + 3.5);
  for (const sx2 of [-1, 1]) d.span('rock', sx2 * (caveW / 2), -0.1, face - 0.2, sx2 * (caveW / 2 + 1.6), caveH + 0.4, back + 0.3, { collide: true });
  d.span('rock', -caveW / 2 - 0.2, caveH, face + 0.4, caveW / 2 + 0.2, caveH + 0.8, back + 0.3, { collide: true });
  d.span('rock', -caveW / 2 - 0.2, -0.1, back, caveW / 2 + 0.2, caveH + 0.4, back + 0.6, { collide: true });
  d.span('rock', -caveW / 2, -0.1, face, caveW / 2, 0.05, back, { collide: true });
  // Grotto lining (smoke-dark), the spring in a marble basin along the east side.
  for (const sx2 of [-1, 1]) d.span('black', sx2 * (caveW / 2) - (sx2 > 0 ? 0.02 : 0), 0.05, face + 0.3, sx2 * (caveW / 2) + (sx2 < 0 ? 0.02 : 0), caveH, back);
  d.span('black', -caveW / 2 + 0.02, 0.05, back - 0.05, caveW / 2 - 0.02, caveH, back - 0.02);
  d.span('marble', 0.55, 0.05, face + 0.8, caveW / 2 - 0.02, 0.6, face + 2.5, { collide: true });
  d.span('water', 0.7, 0.4, face + 0.95, caveW / 2 - 0.15, 0.52, face + 2.35);
  d.cyl('bronze', caveW / 2 - 0.08, 1.05, face + 1.65, 0.05, 0.3, 6, { rz: Math.PI / 2 });
  d.cyl('water', caveW / 2 - 0.35, 0.8, face + 1.65, 0.025, 0.5, 5);
  // The bronze she-wolf suckling the twins, on a marble base against the back wall.
  d.span('marble', -0.75, 0.05, back - 1.6, 0.75, 0.85, back - 0.15, { collide: true });
  d.geo(lion(), 'bronze', 0, 0.85, back - 0.9, { sx: 0.75, sy: 0.82, sz: 0.85, ry: Math.PI / 2 });
  for (const s of [-1, 1]) d.ellipsoid('bronze', s * 0.18, 1.1, back - 1.0 + s * 0.15, 0.1, 0.12, 0.18, { seg: [6, 5] });
  for (const x of [-0.55, 0.55]) placeProp(d, 'oil_lamp', x, 0.85, back - 1.5, 0, { collide: false });
  // Augustan aedicula framing the mouth: two columns, entablature, pediment.
  const af = d.at(0, 0, face - 0.3);
  af.span('marble', -2.6, -0.05, -1.5, 2.6, 0.3, 0.3, { collide: true });
  for (const x of [-2.1, 2.1]) lowColumn(af, 'marble', x, 0.3, -0.6, 0.42, 3.8, { cap: 'corinthian', collide: true, seg: hi ? 10 : 6 });
  af.span('marble', -2.6, 4.1, -1.1, 2.6, 4.7, 0.2);
  gableRoof(af, -2.6, -1.1, 2.6, 0.2, 4.7, { axis: 'z', pitch: 0.28, over: 0.15, gables: 'marble' });
  inscriptionPanel(b, { lines: ['Lupercal'], width: 1.6, height: 0.42, style: 'bronze' }, T4(0, 4.4, face - 1.42), { depth: 0.03, bodyMaterial: 'marble' });
  // Steps down to the ground in front of the aedicula's platform where it falls away.
  const ga = groundRange(ctx, -2.6, face - 3.2, 2.6, face - 1.8, 0.5).min;
  if (ga < 0.1) {
    const n = Math.ceil((0.3 - ga) / 0.2 - 1e-6), r = (0.3 - ga) / n;
    for (let i = 0; i < n - 1; i++) d.span('marble', -2.0, ga + i * r - 0.05, face - 1.8 - (n - 1 - i) * 0.32, 2.0, ga + (i + 1) * r, face - 1.8, { collide: true });
  }
  // The Ruminal fig before the cave.
  const trees: TreeSpec[] = [{ species: 'fig', x: -4.4, z: face - 3.5, scale: 1.1, variant: 1 }];
  const lamps: Lamp[] = [{ position: new THREE.Vector3(0, 1.3, back - 1.4), color: 0xffa54f, intensity: 3, distance: 5, flicker: 0.3, night: false, dayScale: 1, glow: 0.1 }];
  // The street corner below: shops along the Vicus Tuscus at the foot of the hill, a crossroads
  // shrine and a fountain where it meets the street along the Circus (the walk from the Circus to
  // the Velabrum passes here).
  vicusTuscusCorner(ctx, b, d, spots, lamps, trees);
  for (const t of plantTrees(ctx, trees)) b.collider(t);
  requestLamps(ctx.game, landmarkToWorld(ctx), lamps);
  spots.add('lupercal-inscription', 'inscription', 0, 0, face - 3.0, 0);
  spots.add('lupercal-shrine', 'shrine', -0.5, 0.05, back - 2.3, 0);
  spots.add('lupercal-cave', 'door', -0.4, 0.3, face - 0.8, 0);
  spots.add('lupercal-lupercus', 'npc', 2.9, 0, face - 2.6, -0.4);
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: 1200 };
}

/**
 * The Vicus Tuscus at the Lupercal (its local frame): a row of four blocks with shops on the hill
 * side of the street, from just past the corner with the street along the Circus northward, and a
 * compitum and a lacus on the corner.
 *
 * Two of the blocks are places of the content module (`src/content/places.ts` mirrors these spots
 * over its fallbacks): the southern one is Tuccius the cooper's insula (`insula-tuccii`, the stair
 * where Florus hammers his hoops and the Lemuria watch is kept), the northern one, a cracked and
 * propped four-storey block of plaster over rubble, is the Leaning Insula (`insula-nutans` and its
 * `-taberna`, `-scalae`, `-tectum`, `-cenaculum`). All of them are street-level spots on the
 * sidewalk or at the doors: the upper floors have no way in, so the top floor's and Prima's flat's
 * evidence is read from the street, under the crack that runs up the front.
 */
export const TUCCII_LOT = 0;
export const NUTANS_LOT = 3;

function vicusTuscusCorner(ctx: LandmarkContext, b: MeshBuilder, d: Draw, spots: Spots, lamps: Lamp[], trees: TreeSpec[]) {
  const host = LANDMARK_BY_ID['lupercal'] as LandmarkData;
  const road = ROADS.find((r) => r.id === 'vicus-tuscus');
  if (!road) return;
  const pts = road.points.map((p) => {
    const r = relLocal(host, { center: p, rotation: 0 });
    return [r.x, r.z] as [number, number];
  });
  // The segment nearest the Lupercal that runs clear of the Circus (the street turns along the
  // carceres south of the corner).
  const circ = relLocal(host, LANDMARK_BY_ID['circus-maximus'] as LandmarkData);
  const inCircus = (x: number, z: number) => {
    const [cx, cz] = fromHost(circ, x, z);
    return Math.abs(cx) < CIRCUS.halfW + 6 && Math.abs(cz) < CIRCUS.halfLen + 6;
  };
  let best = -1, bestD = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
    if (inCircus(m[0], m[1]) || inCircus(...pts[i]) || inCircus(...pts[i + 1])) continue;
    const dd = Math.hypot(m[0], m[1]);
    if (dd < bestD) { bestD = dd; best = i; }
  }
  if (best < 0) return;
  let [A, C] = [pts[best], pts[best + 1]];
  if (A[1] > C[1]) [A, C] = [C, A];
  const L = Math.hypot(C[0] - A[0], C[1] - A[1]);
  const t: [number, number] = [(C[0] - A[0]) / L, (C[1] - A[1]) / L];
  let n: [number, number] = [-t[1], t[0]];
  // The hill (and the Lupercal) side.
  if (n[0] * -A[0] + n[1] * -A[1] < 0) n = [-n[0], -n[1]];
  // Property line just past the road's kerb (its basalt is 3 m wide) and a 1.6 m sidewalk.
  const off = 3.4;
  const start = 9;
  const row = streetRow(ctx, b, spots, lamps, {
    a: [A[0] + n[0] * off + t[0] * start, A[1] + n[1] * off + t[1] * start],
    c: [C[0] + n[0] * off, C[1] + n[1] * off],
    n,
    sidewalk: 1.6,
    seed: 4950,
    idPrefix: 'lupercal',
    lots: [
      { len: 12, depth: 10, storeys: 3, finish: 'plaster', plaster: 'plaster_ochre', bays: ['thermopolium', 'stair', 'wine', 'bakery'], gap: 3 },
      { len: 14, depth: 11, storeys: 4, finish: 'brick', bays: ['general', 'textile', 'stair', 'cobbler', 'pottery'], gap: 2.5 },
      { len: 12, depth: 10, storeys: 3, finish: 'plaster', plaster: 'plaster_cream', portico: true, bays: ['barber', 'stair', 'moneychanger', 'butcher'], gap: 3 },
      { len: 13, depth: 10, storeys: 4, finish: 'plaster', plaster: 'plaster_white', bays: ['cobbler', 'stair', 'general', 'fullonica'], open: true },
    ],
  });
  for (const lot of row.lots) {
    if (lot.index === TUCCII_LOT) tucciiHouse(spots, lot, row.rot);
    else if (lot.index === NUTANS_LOT) leaningInsula(ctx, b, spots, lot, row.rot);
  }
  // The corner: the compitum facing the street along the Circus, the lacus beside it.
  const ca: [number, number] = [A[0] + n[0] * (off + 2.5) + t[0] * 1.0, A[1] + n[1] * (off + 2.5) + t[1] * 1.0];
  const face = Math.atan2(n[0], n[1]); // frame −z (the front) toward the street (−n)
  const cs = d.at(ca[0], ctx.groundAt(ca[0], ca[1]) + 0.05, ca[1], face);
  compitalShrine(cs, new Rng('lupercal-compitum'));
  const cl = cs.point(0, 1.6, 1.2);
  lamps.push({ position: cl, color: 0xffb060, intensity: 4.5, distance: 6, flicker: 0.3, night: false, dayScale: 0, glow: 0.12 });
  const cp = cs.point(0, 0, -2.0);
  spots.add('lupercal-compitum', 'shrine', cp.x, cp.y, cp.z, face);
  const la: [number, number] = [ca[0] - t[0] * 6.5, ca[1] - t[1] * 6.5];
  const lf = d.at(la[0], ctx.groundAt(la[0], la[1]) + 0.05, la[1], face);
  lacus(lf, new Rng('lupercal-lacus'), { stone: 'travertine' });
  const lp = lf.point(0, 0, -1.6);
  spots.add('lupercal-lacus', 'shrine', lp.x, lp.y, lp.z, face);
  trees.push({ species: 'plane', x: la[0] - t[0] * 5 + n[0] * 2, z: la[1] - t[1] * 5 + n[1] * 2, scale: 0.8, variant: 2 });
}

/** Tuccius the cooper's house: the street in front of its stair door, where Florus hammers his hoops. */
function tucciiHouse(spots: Spots, lot: PlacedLot, rot: number) {
  const door = lot.stair?.p ?? lot.front(0.5, 0.6);
  spots.add('insula-tuccii', 'door', door.x, door.y, door.z, lot.stair?.heading ?? rot + Math.PI);
}

/**
 * The Leaning Insula: plaster over rubble, a crack climbing the front between the cobbler's shop and
 * the stair, two oak props under the stair's lintel, and the five places the quest uses on the
 * sidewalk in front of it (the street is the only way in).
 */
function leaningInsula(ctx: LandmarkContext, b: MeshBuilder, spots: Spots, lot: PlacedLot, rot: number) {
  const face = rot + Math.PI; // heading toward the street
  const stair = lot.stair?.p ?? lot.front(0.5, 0.6);
  const shop = lot.shops.find((s) => s.tag === 'cobbler') ?? lot.shops[0];
  const at = (u: number, off: number) => lot.front(u, off);
  const put = (id: string, kind: 'npc' | 'door', p: THREE.Vector3, heading = face) => spots.add(id, kind, p.x, p.y, p.z, heading);
  // The crack climbs the front between the shop and the stair: its foot is the top floor's place (the
  // evidence is read from the street), the far end of the frontage Prima's floor, the middle the house's.
  const foot = shop ? stair.clone().add(shop.p).multiplyScalar(0.5) : stair.clone();
  foot.add(new THREE.Vector3(Math.sin(face), 0, Math.cos(face)).multiplyScalar(0.6));
  put('insula-nutans', 'npc', at(0.64, 1.15));
  put('insula-nutans-scalae', 'door', stair, lot.stair?.heading ?? face);
  put('insula-nutans-taberna', 'npc', shop?.p ?? at(0.2, 0.7), shop?.heading ?? face);
  put('insula-nutans-tectum', 'npc', foot);
  put('insula-nutans-cenaculum', 'npc', at(0.9, 1.1));

  // Dressing, in the block's own frame (−z toward the street, y = 0 at its floor).
  const d = new Draw(b, lot.m);
  const inv = lot.m.clone().invert();
  const rng = new Rng('insula-nutans');
  const floor = lot.m.elements[13];
  const zf = -lot.depth / 2;
  const sx = stair.clone().applyMatrix4(inv).x;
  const cx = shop ? shop.p.clone().applyMatrix4(inv).x : sx - 3.6;
  // The crack: between the shop and the stair, from the sill of the shop to under the eaves, in short
  // jags with a few spurs (the string courses, 7 cm proud, hide it where it crosses them).
  const xb = (sx + cx) / 2;
  const yTop = lot.height - 0.9;
  let x = xb, y = 0.25;
  while (y < yTop) {
    const ny = Math.min(yTop, y + rng.range(0.55, 1.25));
    const nx = xb + rng.range(-0.3, 0.3);
    d.rod('black', { x, y, z: zf - 0.04 }, { x: nx, y: ny, z: zf - 0.04 }, 0.04, 4, { shadow: false });
    if (rng.chance(0.45)) {
      const sd = rng.chance(0.5) ? 1 : -1;
      d.rod('black', { x: nx, y: ny, z: zf - 0.04 }, { x: nx + sd * rng.range(0.25, 0.55), y: ny + rng.range(0.2, 0.5), z: zf - 0.04 }, 0.025, 4, { shadow: false });
    }
    x = nx;
    y = ny;
  }
  // Two oak props from the sidewalk to the lintel of the stair door, one bowed (a second beam across it).
  for (const s of [-1, 1]) {
    const px = sx + s * 1.05;
    const foot = new THREE.Vector3(px, 0, zf - 1.35).applyMatrix4(lot.m);
    const g0 = ctx.groundAt(foot.x, foot.z) - floor;
    d.rod('wood', { x: px, y: g0, z: zf - 1.35 }, { x: px, y: 2.55, z: zf - 0.06 }, 0.085, 6);
  }
  d.rod('wood', { x: sx - 1.05, y: 1.3, z: zf - 0.72 }, { x: sx + 1.05, y: 1.5, z: zf - 0.72 }, 0.05, 5);
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
  // The way in: a gateway in the NE portico's back wall, on the garden's long axis, with a flight
  // of steps down to the street below the terrace.
  const ex = -20;
  peristyle(d, x0 + 4, z0 + 4, x1 + 2, z1 - 4, y, { D: 0.42, H: 3.8, spacing: 3.4, depth: 3.2, mat: 'marble', cap: 'corinthian', backMat: 'plaster_cream', lite: !hi, skip: ['e'], doors: { n: [ex] } });
  const wz = z0 + 4 - 3.2 - 0.4;
  for (const sx of [-1, 1]) d.span('marble', ex + sx * 1.2 - (sx < 0 ? 0.45 : 0), y, wz - 0.12, ex + sx * 1.2 + (sx > 0 ? 0.45 : 0), y + 3.6, wz);
  d.span('marble', ex - 1.75, y + 3.2, wz - 0.16, ex + 1.75, y + 3.75, wz);
  gableRoof(d, ex - 1.8, wz - 0.7, ex + 1.8, wz, y + 3.75, { axis: 'x', pitch: 0.3, over: 0.1, gables: 'marble' });
  d.span('paving_travertine', ex - 1.6, y - 0.05, z0, ex + 1.6, y + 0.02, wz, { collide: true });
  const ge = groundRange(ctx, ex - 1.6, z0 - 5, ex + 1.6, z0, 0.8).min;
  const nE = Math.max(1, Math.ceil((y - ge) / 0.2 - 1e-6));
  if (y - ge > 0.15) {
    stair(d.at(ex, ge, z0 - nE * 0.32), 3.0, y - ge, 'travertine');
    for (const sx of [-1, 1]) d.span('travertine', ex + sx * 1.5 - (sx < 0 ? 0.35 : 0), Math.min(ge, y) - 0.4, z0 - nE * 0.32, ex + sx * 1.5 + (sx > 0 ? 0.35 : 0), y + 0.9, z0, { collide: true });
  }
  spots.add('adonaea-entrance', 'door', ex, ge, z0 - nE * 0.32 - 1.0, 0);
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

export const builders: LandmarkBuilder[] = settled([
  { handles: ['temple-apollo-palatinus'], build: apollo },
  { handles: ['house-augustus'], build: houseAugustus },
  { handles: ['house-livia'], build: houseLivia },
  { handles: ['temple-magna-mater'], build: magnaMater },
  { handles: ['temple-victoria'], build: victoria },
  { handles: ['casa-romuli'], build: casaRomuli },
  { handles: ['lupercal'], build: lupercal },
  { handles: ['adonaea'], build: adonaea },
]);

