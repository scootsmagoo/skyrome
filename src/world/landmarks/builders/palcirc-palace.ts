/**
 * The imperial palace on the Palatine (palcirc crew): Domus Augustana (the private palace with the
 * great curved facade over the Circus Maximus and the sunken peristyle), Domus Flavia (the state
 * palace), Domus Tiberiana, the Palatine "stadium" garden and the Paedagogium.
 *
 * Levels: the atlas pads put every palace at its upper level (Augustana 46 m, Flavia 48 m), so the
 * Augustana's lower peristyle is the pad and its upper palace level stands one storey higher on the
 * rooms round the sunken court (see the report: the pipeline flattens 'slope' landmarks).
 */
import * as THREE from 'three';
import { Draw } from '../../../arch/fabric/draw';
import { column } from '../../../arch/classical/column';
import { entablature, pediment } from '../../../arch/classical/entablature';
import { armoredEmperor, togate } from '../../../arch/classical/statues';
import { inscriptionPanel, paintedSign } from '../../../arch/common/inscription';
import { placeProp } from '../../../arch/props/props';
import { Rng } from '../../../core/Rng';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext } from '../types';
import { arcadeFace, block, gardenBed, openings, peristyle, pool, roofOver, shedTiles, stair, wallRing } from './palcirc/palace';
import { ringSector } from './palcirc/shapes';
import { Spots, drawFor, gableRoof, groundRange, lowColumn, plantTrees, type TreeSpec } from './palcirc/util';

// ---------------------------------------------------------------- Domus Augustana

/** Augustana levels and plan (local game m; facade toward −z over the Circus). */
export const AUG = {
  hw: 21.6,
  /** Front face of the substructure (where the ground has fallen to the Circus street). */
  front: -70.5,
  /** Exedra radius (centre on the front line). */
  R: 13.5,
  /** Lower (sunken) peristyle level and the upper palace level. */
  low: 0,
  up: 4.8,
  /** Street level below the facade. */
  street: -20,
} as const;

function augustana(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  const hi = ctx.detail === 'high';
  const { hw, front, R, low, up } = AUG;
  const rng = new Rng('domus-augustana');
  const street = Math.min(AUG.street, groundRange(ctx, -hw, front - 2, hw, front).min) - 0.6;

  // ---------------------------------------------------------- substructure over the Circus
  // Solid core from the street up to the lower level, the full width, from the front to z = −60.
  d.span('concrete', -hw, street, front + 1.2, hw, low - 0.27, -58, { collide: true });
  d.solid(-hw, low - 0.3, front + 1.2, hw, low, -58);
  // Arcaded front (three tiers of blind arches with dark vaults), travertine string courses.
  arcadeFace(d, -hw, hw, front, street, low - 0.2, { dir: -1, bay: 4.3, tier: 6.6, mat: 'brick', trim: 'travertine', depth: 1.3 });
  // Side faces of the substructure.
  for (const sx of [-1, 1]) {
    const x = sx * hw;
    d.span('brick', sx < 0 ? x - 0.2 : x, street, front, sx < 0 ? x : x + 0.2, low, -58);
  }
  // Base plinth along the street.
  d.span('travertine', -hw - 0.3, street, front - 0.35, hw + 0.3, street + 1.2, front + 0.4);

  // ---------------------------------------------------------- exedra: terrace and two-storey colonnade
  const cz = front;
  const ex = new Draw(b, new THREE.Matrix4().makeTranslation(0, 0, cz));
  // Terrace floor (the semicircle behind the chord) and the chord balustrade over the Circus.
  ex.geo(ringSector(0, R + 3.2, 0, Math.PI, 0.25, 24), 'marble_giallo', 0, low - 0.25, 0);
  ex.span('marble', -hw, low, -0.4, hw, low + 1.05, 0.0, { collide: true });
  for (let i = 0; i <= 16; i++) ex.box('marble', -hw + (2 * hw * i) / 16, low + 1.12, -0.2, 0.32, 0.14, 0.5);
  // Colonnade on the arc (two storeys), the curved back wall of the rooms behind.
  const nCol = 16;
  const H1 = 4.4, H2 = 4.0;
  for (let i = 0; i <= nCol; i++) {
    const a = (Math.PI * i) / nCol;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    lowColumn(ex, 'marble_giallo', x, low, z, 0.56, H1, { cap: 'corinthian', capMat: 'marble', collide: true, seg: hi ? 10 : 6 });
    lowColumn(ex, 'marble', x, up, z, 0.48, H2, { cap: 'corinthian', collide: false, seg: hi ? 8 : 6 });
  }
  // Curved entablatures and balcony floor (ring sectors), back wall with doors and windows.
  ex.geo(ringSector(R - 0.45, R + 3.2, 0, Math.PI, up - low - H1, 24), 'marble', 0, low + H1, 0);
  ex.geo(ringSector(R - 0.4, R + 0.4, 0, Math.PI, 1.0, 24), 'marble', 0, up, 0);
  ex.geo(ringSector(R - 0.45, R + 3.2, 0, Math.PI, 0.7, 24), 'marble', 0, up + H2, 0);
  ex.geo(ringSector(R + 3.0, R + 3.6, 0, Math.PI, up + H2 + 3.2, 24), 'plaster_white', 0, low, 0);
  // Lean-to roof over the upper gallery: from the back wall down to the colonnade.
  const nSeg = 24;
  const roofPts: number[] = [];
  const rr = (r: number, a: number, y: number) => [Math.cos(a) * r, y, Math.sin(a) * r];
  for (let i = 0; i < nSeg; i++) {
    const a0 = (Math.PI * i) / nSeg, a1 = (Math.PI * (i + 1)) / nSeg;
    const yo = up + H2 + 0.7, yi = up + H2 + 2.4;
    roofPts.push(...rr(R - 0.6, a0, yo), ...rr(R + 3.3, a1, yi), ...rr(R - 0.6, a1, yo));
    roofPts.push(...rr(R - 0.6, a0, yo), ...rr(R + 3.3, a0, yi), ...rr(R + 3.3, a1, yi));
  }
  ex.tris('roof_tile', roofPts);
  // Doors and windows on the curved wall (rooms looking out over the Circus).
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * (i + 0.5)) / 8;
    const m = ex.at(Math.cos(a) * (R + 2.88), 0, Math.sin(a) * (R + 2.88), -a + Math.PI / 2 + Math.PI);
    m.span('black', -0.75, low, -0.02, 0.75, low + 3.2, 0);
    m.span('black', -0.6, up + 0.9, -0.02, 0.6, up + 2.8, 0);
  }
  // Colliders round the back wall (segments).
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * (i + 0.5)) / 12;
    const m = ex.at(Math.cos(a) * (R + 3.3), 0, Math.sin(a) * (R + 3.3), -a + Math.PI / 2);
    m.solid(-1.9, low, -0.3, 1.9, up + H2 + 3.2, 0.3);
  }
  // Straight wings either side of the exedra, two storeys over the substructure, windows on the Circus.
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -hw : R + 3.6, x1 = sx < 0 ? -(R + 3.6) : hw;
    const top = up + H2 + 3.2;
    d.span('plaster_white', x0, low, front, x1, top, -54, { collide: true });
    d.span('marble', x0 - 0.15, top - 0.45, front - 0.2, x1 + 0.15, top, -54 + 0.15);
    d.span('marble', x0 - 0.1, up - 0.3, front - 0.15, x1 + 0.1, up, -54);
    openings(d, x0, front, x1, -54, 'n', low + 1.2, 1.1, 2.4, 2.4, { frame: 'marble' });
    openings(d, x0, front, x1, -54, 'n', up + 1.0, 1.0, 2.2, 2.4, { frame: 'marble' });
    roofOver(d, x0, front, x1, -54, top, 0.32, 'roof_tile', 'plaster_white');
  }

  // ---------------------------------------------------------- lower (sunken) peristyle
  const cx0 = -12, cx1 = 12, cz0 = -48, cz1 = -18;
  // Ground-floor rooms round the court; their roofs are the upper level's terraces.
  const ring = (x0: number, z0: number, x1: number, z1: number) => {
    block(d, ctx, x0, z0, x1, z1, up, 'brick', { cornice: 'travertine' });
    d.span('marble', x0, up, z0, x1, up + 0.05, z1);
  };
  ring(-hw, -54, cx0 - 3.2, cz1 + 3.2);
  ring(cx1 + 3.2, -54, hw, cz1 + 3.2);
  ring(cx0 - 3.2, -54, cx1 + 3.2, cz0 - 3.2);
  // Back block, split round the stair well that climbs to the upper level.
  ring(cx0 - 3.2, cz1 + 3.2, -1.6, -8);
  ring(1.6, cz1 + 3.2, cx1 + 3.2, -8);
  // Rooms behind the exedra's curved wall (between the arc and the lower court's front block).
  const Rw = R + 3.6;
  for (let i = 0; i < 10; i++) {
    const xa = (Rw * i) / 10, xb = (Rw * (i + 1)) / 10;
    const zc = front + Math.sqrt(Math.max(0, Rw * Rw - xb * xb));
    if (zc >= -54) continue;
    for (const sx of [-1, 1]) {
      const x0 = sx < 0 ? -xb : xa, x1 = sx < 0 ? -xa : xb;
      d.span('plaster_white', x0, low, zc, x1, up + 4.0 + 3.2, -54, { collide: true });
      d.span('roof_tile', x0, up + 7.2, zc, x1, up + 7.35, -54);
    }
  }
  // Plastered inner faces of the court walls (red dado, cream above) and doors into the rooms.
  for (const [x0, z0, x1, z1, face] of [
    [cx0 - 3.2, cz0 - 3.2, cx1 + 3.2, cz0 - 3.2, 's'],
    [cx0 - 3.2, cz1 + 3.2, cx1 + 3.2, cz1 + 3.2, 'n'],
    [cx0 - 3.2, cz0 - 3.2, cx0 - 3.2, cz1 + 3.2, 'e'],
    [cx1 + 3.2, cz0 - 3.2, cx1 + 3.2, cz1 + 3.2, 'w'],
  ] as const) {
    const e = 0.02;
    const xa = face === 'e' ? x0 + e : face === 'w' ? x0 - 0.05 : x0;
    const xb = face === 'e' ? x0 + 0.05 : face === 'w' ? x0 - e : x1;
    const za = face === 's' ? z0 + e : face === 'n' ? z0 - 0.05 : z0;
    const zb = face === 's' ? z0 + 0.05 : face === 'n' ? z0 - e : z1;
    d.span('plaster_red', Math.min(xa, xb), low, Math.min(za, zb), Math.max(xa, xb), low + 1.3, Math.max(za, zb));
    d.span('plaster_cream', Math.min(xa, xb), low + 1.3, Math.min(za, zb), Math.max(xa, xb), up - 0.35, Math.max(za, zb));
  }
  openings(d, cx0 - 3.2, cz0 - 3.2, cx1 + 3.2, cz1 + 3.2, 's', low, 1.4, 2.8, 5.0, { margin: 3 });
  openings(d, cx0 - 3.2, cz0 - 3.2, cx1 + 3.2, cz1 + 3.2, 'n', low, 1.4, 2.8, 5.0, { margin: 3 });
  // The court: porticoes, pavement, the pool with its four pelta-shaped (crescent) islands.
  peristyle(d, cx0, cz0, cx1, cz1, low, { D: 0.5, H: 3.9, spacing: 3.0, depth: 3.0, mat: 'marble', cap: 'ionic', back: false, floor: 'mosaic', lite: !hi });
  d.span('paving_travertine', cx0 + 0.4, low - 0.1, cz0 + 0.4, cx1 - 0.4, low + 0.02, cz1 - 0.4);
  pool(d, cx0 + 3, cz0 + 4, cx1 - 3, cz1 - 4, low);
  for (const [px, pz, rot] of [[-3.2, -37, 0], [3.2, -37, Math.PI], [-3.2, -29, 0], [3.2, -29, Math.PI]] as const) {
    d.geo(ringSector(1.2, 2.1, -Math.PI / 2 + rot, Math.PI / 2 + rot, 0.5, 10), 'marble', px, low - 0.15, pz);
    d.geo(ringSector(0, 1.2, -Math.PI / 2 + rot, Math.PI / 2 + rot, 0.42, 8), 'grass', px, low - 0.15, pz);
  }
  d.cyl('marble', 0, low + 0.7, -33, 0.4, 1.4, 10);
  // Balustrades round the upper terraces looking down into the court.
  for (const [x0, z0, x1, z1] of [
    [cx0 - 3.2, cz0 - 3.4, cx1 + 3.2, cz0 - 3.2],
    [cx0 - 3.2, cz1 + 3.2, cx1 + 3.2, cz1 + 3.4],
    [cx0 - 3.4, cz0 - 3.2, cx0 - 3.2, cz1 + 3.2],
    [cx1 + 3.2, cz0 - 3.2, cx1 + 3.4, cz1 + 3.2],
  ] as const) d.span('marble', x0, up, z0, x1, up + 1.0, z1, { collide: true });
  // Stair from the upper level down into the court (along the court's back portico).
  stair(d.at(0, low, cz1 + 2.9), 3.0, up - low, 'marble', 0.32);
  for (const sx of [-1, 1]) d.span('marble', sx * 1.5, up, cz1 + 3.2, sx * 1.6, up + 1.0, -8, { collide: true });

  // ---------------------------------------------------------- upper level: platform, peristyle, island temple
  const pz0 = -8, pz1 = 60;
  block(d, ctx, -hw, pz0, hw, pz1, up, 'brick', { cornice: 'travertine' });
  const ux0 = -15, ux1 = 15, uz0 = 6, uz1 = 50;
  d.span('paving_travertine', ux0 - 3, up - 0.05, uz0 - 3, ux1 + 3, up + 0.03, uz1 + 3);
  peristyle(d, ux0, uz0, ux1, uz1, up, { D: 0.55, H: 4.4, spacing: 3.2, depth: 3.0, mat: 'marble', cap: 'corinthian', backMat: 'plaster_red', lite: !hi });
  // Great pool with the temple island and its bridge.
  pool(d, ux0 + 3.5, uz0 + 5, ux1 - 3.5, uz1 - 5, up);
  const tz = (uz0 + uz1) / 2;
  d.span('marble', -4.2, up - 0.2, tz - 4.0, 4.2, up + 0.5, tz + 4.0, { collide: true });
  d.span('marble', -1.0, up - 0.2, uz0 + 5, 1.0, up + 0.5, tz - 4.0, { collide: true });
  const tm = d.at(0, up + 0.5, tz);
  tm.span('marble', -3.2, 0, -3.0, 3.2, 0.6, 3.0, { collide: true });
  for (const x of [-2.5, -0.85, 0.85, 2.5]) lowColumn(tm, 'marble', x, 0.6, -2.4, 0.42, 3.6, { cap: 'corinthian', collide: true, seg: hi ? 10 : 6 });
  tm.span('plaster_white', -2.6, 0.6, -1.0, 2.6, 4.2, 2.6, { collide: true });
  tm.span('bronze', -0.7, 0.6, -1.02, 0.7, 2.9, -1.0);
  tm.span('marble', -3.0, 4.2, -2.8, 3.0, 4.75, 2.8);
  gableRoof(tm, -3.0, -2.8, 3.0, 2.8, 4.75, { axis: 'z', pitch: 0.26, over: 0.25, gables: 'marble' });
  // Wings round the upper peristyle (two storeys), and the back block with the entrance.
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -hw : ux1 + 3.4, x1 = sx < 0 ? ux0 - 3.4 : hw;
    d.span('plaster_white', x0, up, pz0, x1, up + 8.4, pz1, { collide: true });
    d.span('travertine', x0 - 0.1, up + 4.1, pz0 - 0.1, x1 + 0.1, up + 4.4, pz1 + 0.1);
    openings(d, x0, pz0, x1, pz1, sx < 0 ? 'w' : 'e', up + 5.4, 1.0, 1.8, 3.0);
    roofOver(d, x0, pz0, x1, pz1, up + 8.4, 0.34, 'roof_tile', 'plaster_white');
  }
  d.span('plaster_white', ux0 - 3.4, up, uz1 + 3.4, ux1 + 3.4, up + 8.4, pz1, { collide: true });
  roofOver(d, ux0 - 3.4, uz1 + 3.4, ux1 + 3.4, pz1, up + 8.4, 0.34, 'roof_tile', 'plaster_white');
  // Front hall of the upper level (between the two courts).
  // (split by the passage from the court stair to the upper peristyle)
  d.span('plaster_white', ux0 - 3.4, up, pz0, -1.6, up + 6.0, uz0 - 3.4, { collide: true });
  d.span('plaster_white', 1.6, up, pz0, ux1 + 3.4, up + 6.0, uz0 - 3.4, { collide: true });
  d.span('plaster_white', -1.6, up + 3.6, pz0, 1.6, up + 6.0, uz0 - 3.4, { collide: true });
  d.span('marble', -1.6, up - 0.02, pz0, 1.6, up + 0.03, uz0 - 3.4);
  for (const z of [pz0 - 0.02, uz0 - 3.4]) d.span('marble', -2.0, up + 3.6, z - 0.1, 2.0, up + 4.0, z + 0.12);
  roofOver(d, ux0 - 3.4, pz0, ux1 + 3.4, uz0 - 3.4, up + 6.0, 0.3, 'roof_tile', 'plaster_white');
  // Main entrance from the Area Palatina side (back, +z), with guards and bronze doors.
  d.span('marble', -3.0, up, pz1 - 0.05, 3.0, up + 5.2, pz1 + 0.25);
  d.span('bronze', -1.3, up, pz1 + 0.26, 1.3, up + 3.8, pz1 + 0.32);
  const back = groundRange(ctx, -4, pz1, 4, pz1 + 6);
  const bst = d.at(0, back.min, pz1 + 0.3 + Math.ceil((up - back.min) / 0.2) * 0.32, Math.PI);
  stair(bst, 5.0, up - back.min, 'marble');
  // Trees in the upper peristyle garden beds (box, laurel).
  const trees: TreeSpec[] = [];
  for (const [x, z] of [[-11, 12], [11, 12], [-11, 44], [11, 44]]) trees.push({ species: 'laurel', x, z, y: up, scale: 0.9, variant: (x > 0 ? 1 : 0) + (z > 30 ? 1 : 0) });
  for (const [x, z] of [[-9, -44], [9, -22]]) trees.push({ species: 'oleander', x, z, y: low, scale: 1.0 });
  for (const t of plantTrees(ctx, trees)) b.collider(t);

  // ---------------------------------------------------------- spots
  spots.add('augustana-vista-circus', 'vista', 0, low, front + 3.5, Math.PI);
  spots.add('augustana-exedra-seat', 'sit', -6, low, front + 7, Math.PI);
  spots.add('augustana-lower-peristyle', 'vista', 0, up, cz1 + 3.6, Math.PI);
  spots.add('augustana-island-shrine', 'shrine', 0, up + 0.5, tz - 4.6, 0);
  spots.add('augustana-entrance', 'door', 0, back.min, pz1 + 6, Math.PI);
  spots.add('augustana-guard-a', 'npc', -3.4, back.min, pz1 + 6.5, 0);
  spots.add('augustana-guard-b', 'npc', 3.4, back.min, pz1 + 6.5, 0);
  spots.add('augustana-garden-bench', 'sit', 12.5, up, tz, -Math.PI / 2);
  void rng;
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: 2500 };
}

// ---------------------------------------------------------------- Domus Flavia (state palace)

function flavia(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  const hi = ctx.detail === 'high';
  const HW = 30, HD = 45.6;
  const fl = 0.6; // palace floor, three steps above the Area Palatina
  // Platform with footing (the SE strip dips toward the Augustana).
  block(d, ctx, -HW, -HD + 3.6, HW, HD, fl, 'brick', { cornice: 'travertine' });
  // Front portico across the whole facade: giallo antico columns on a stylobate with steps.
  const pz = -HD + 3.6; // portico back line
  d.span('marble', -HW, 0, -HD, HW, fl, pz, { collide: true });
  for (let i = 0; i < 3; i++) d.span('marble', -HW, 0, -HD - 0.32 * (3 - i), HW, (fl / 3) * (i + 1), -HD, { collide: true });
  const colH = 6.6, D = 0.72;
  const nCols = 16;
  for (let i = 0; i <= nCols; i++) {
    const x = -HW + 0.8 + ((2 * HW - 1.6) * i) / nCols;
    lowColumn(d, 'marble_giallo', x, fl, -HD + 0.7, D, colH, { cap: 'corinthian', capMat: 'marble', collide: true, seg: hi ? 12 : 6 });
  }
  d.span('marble', -HW, fl + colH, -HD + 0.2, HW, fl + colH + 1.1, pz);
  d.span('marble', -HW - 0.2, fl + colH + 1.1, -HD, HW + 0.2, fl + colH + 1.45, pz);
  shedTiles(d, -HW, HW, pz, fl + colH + 2.6, -HD - 0.3, fl + colH + 1.45);
  d.span('mosaic', -HW, fl - 0.02, -HD + 0.4, HW, fl + 0.01, pz);
  // Aula Regia: the throne hall, 30 m high, with its great doorway into the portico.
  const ax = 9.6, az0 = pz, az1 = -18, aH = 18;
  d.span('plaster_white', -ax, fl, az0, ax, aH, az1, { collide: true });
  d.span('marble', -ax - 0.25, aH - 0.8, az0 - 0.25, ax + 0.25, aH, az1 + 0.25);
  gableRoof(d, -ax, az0, ax, az1, aH, { axis: 'z', pitch: 0.36, over: 0.6, gables: 'plaster_white' });
  // Pilaster strips and high windows on the flanks.
  for (const sx of [-1, 1]) {
    for (let k = 0; k <= 5; k++) d.span('marble', sx * ax - (sx < 0 ? 0.3 : 0), fl + colH + 1.5, az0 + ((az1 - az0) * k) / 5 - 0.4, sx * ax + (sx > 0 ? 0.3 : 0), aH - 0.8, az0 + ((az1 - az0) * k) / 5 + 0.4);
    openings(d, -ax, az0, ax, az1, sx < 0 ? 'w' : 'e', aH - 6.2, 1.8, 3.6, 4.6, { margin: 2.4 });
  }
  // The doorway: a marble frame 4 × 8 m with bronze valves, pediment over it, guards' bases.
  const door = d.at(0, fl, az0);
  door.span('marble', -3.2, 0, -0.35, 3.2, 9.4, 0.0);
  door.span('black', -2.0, 0, -0.38, 2.0, 7.8, -0.36);
  door.span('bronze', -2.0, 0, -0.42, -0.05, 7.8, -0.38);
  door.span('bronze', 0.05, 0, -0.42, 2.0, 7.8, -0.38);
  for (let k = 0; k < 4; k++) for (const sx of [-1, 1]) door.span('gilded_bronze', sx * 1.0 - 0.6, 1.4 + k * 1.7, -0.44, sx * 1.0 + 0.6, 2.2 + k * 1.7, -0.42);
  door.span('marble', -3.6, 9.4, -0.6, 3.6, 10.0, 0.0);
  gableRoof(door, -3.6, -0.7, 3.6, 0.0, 10.0, { axis: 'x', pitch: 0.3, over: 0.1, gables: 'marble' });
  // Lararium (W) and Basilica (E) either side, lower; the basilica ends in an apse.
  d.span('plaster_white', -HW, fl, az0, -ax - 1.2, 11, -26, { collide: true });
  roofOver(d, -HW, az0, -ax - 1.2, -26, 11, 0.34, 'roof_tile', 'plaster_white');
  d.span('plaster_white', ax + 1.2, fl, az0, HW, 13, az1, { collide: true });
  roofOver(d, ax + 1.2, az0, HW, az1, 13, 0.34, 'roof_tile', 'plaster_white');
  for (const [x0, x1, top] of [[-HW, -ax - 1.2, 11], [ax + 1.2, HW, 13]] as const) {
    openings(d, x0, az0, x1, az1, 'n', 1.2 + fl, 1.1, 2.6, 3.2, { mat: 'black' });
    openings(d, x0, az0, x1, az1, 'n', top - 4.0, 1.4, 2.0, 3.2);
  }
  d.cyl('plaster_white', (ax + 1.2 + HW) / 2, fl + 5.5, az1, 7.0, 11, 14, { collide: false });
  // Peristyle with the octagonal maze fountain.
  const px0 = -24, px1 = 24, pz0 = -14, pz1 = 12;
  d.span('paving_travertine', px0 - 3, fl - 0.05, pz0 - 3, px1 + 3, fl + 0.03, pz1 + 3);
  peristyle(d, px0, pz0, px1, pz1, fl, { D: 0.6, H: 5.2, spacing: 3.4, depth: 3.0, mat: 'marble_giallo', capMat: 'marble', cap: 'corinthian', backMat: 'plaster_red', lite: !hi });
  const oct = 9;
  const octPts = (r: number) => Array.from({ length: 8 }, (_, i) => new THREE.Vector3(Math.cos((i + 0.5) * Math.PI / 4) * r, 0, Math.sin((i + 0.5) * Math.PI / 4) * r));
  const of = d.at(0, fl, -1);
  const outer = octPts(oct);
  for (let i = 0; i < 8; i++) {
    const a = outer[i], c = outer[(i + 1) % 8];
    const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
    const len = Math.hypot(c.x - a.x, c.z - a.z);
    of.box('marble', mx, 0.25, mz, len + 0.4, 0.5, 0.45, { ry: -Math.atan2(c.z - a.z, c.x - a.x), collide: true });
  }
  of.poly('water', octPts(oct - 0.2).map((p) => ({ x: p.x, y: 0.3, z: p.z })).reverse());
  // The maze: concentric octagonal channels' walls broken by gaps.
  for (const r of [6.6, 4.4, 2.2]) {
    const pts = octPts(r);
    for (let i = 0; i < 8; i++) {
      if ((i + Math.round(r)) % 3 === 0) continue;
      const a = pts[i], c = pts[(i + 1) % 8];
      of.box('marble', (a.x + c.x) / 2, 0.35, (a.z + c.z) / 2, Math.hypot(c.x - a.x, c.z - a.z) + 0.25, 0.4, 0.3, { ry: -Math.atan2(c.z - a.z, c.x - a.x) });
    }
  }
  of.cyl('marble', 0, 0.9, 0, 0.5, 1.2, 10);
  // Cenatio Iovis (the great triclinium) at the back, flanked by courts with oval fountains.
  const tx = 10, tz0 = 16, tz1 = HD - 3;
  d.span('plaster_white', -tx, fl, tz0, tx, 14, tz1, { collide: true });
  gableRoof(d, -tx, tz0, tx, tz1, 14, { axis: 'z', pitch: 0.34, over: 0.5, gables: 'plaster_white' });
  d.span('marble', -3, fl, tz0 - 0.4, 3, 7, tz0);
  d.span('black', -2, fl, tz0 - 0.42, 2, 6, tz0 - 0.38);
  for (const sx of [-1, 1]) {
    const cxa = sx * 12, cxb = sx * (HW - 1.5);
    const x0 = Math.min(cxa, cxb), x1 = Math.max(cxa, cxb);
    wallRing(d, x0, tz0, x1, tz1, fl, 7.5, 0.6, 'plaster_white');
    const mx = (x0 + x1) / 2, mz = (tz0 + tz1) / 2;
    d.ellipsoid('marble', mx, fl + 0.05, mz, 5.0, 0.5, 9.0, { seg: [20, 4] });
    d.ellipsoid('water', mx, fl + 0.38, mz, 4.6, 0.12, 8.6, { seg: [20, 3] });
    d.cyl('marble', mx, fl + 0.9, mz, 0.6, 1.2, 10);
    roofOver(d, x0, tz0, x1, tz0 + 2.5, 7.5, 0.3, 'roof_tile', 'plaster_white');
  }
  // Rooms closing the sides of the peristyle.
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -HW : px1 + 3.4, x1 = sx < 0 ? px0 - 3.4 : HW;
    d.span('plaster_white', x0, fl, -26, x1, 9, tz0, { collide: true });
    roofOver(d, x0, -26, x1, tz0, 9, 0.34, 'roof_tile', 'plaster_white');
  }
  d.span('plaster_white', px0 - 3.4, fl, pz1 + 3.4, px1 + 3.4, 8, tz0, { collide: true });
  // Trajan's statue before the portico with the honorific base.
  const sx0 = -14;
  d.span('marble', sx0 - 1.0, 0, -HD - 4.0, sx0 + 1.0, 2.0, -HD - 2.2, { collide: true });
  armoredEmperor(b, new THREE.Matrix4().makeTranslation(sx0, 2.0, -HD - 3.1).multiply(new THREE.Matrix4().makeRotationY(0)), { material: 'bronze', scale: 1.15, detail: hi ? 'high' : 'low' });
  inscriptionPanel(b, { lines: ['Imp Caesari Divi Nervae F', 'Nervae Traiano Aug Germ', 'Dacico Pont Max Trib Pot XVII', 'Imp VI Cos VI P P'], width: 1.8, height: 1.2, style: 'carved', border: true }, new THREE.Matrix4().makeTranslation(sx0, 1.05, -HD - 4.02), { depth: 0.04 });
  // Spots.
  spots.add('domus-flavia-inscription', 'inscription', sx0, 0, -HD - 6.0, 0);
  spots.add('flavia-aula-regia-door', 'door', 0, fl, az0 - 1.0, Math.PI);
  spots.add('flavia-guard-a', 'npc', -3.8, fl, az0 - 1.2, Math.PI);
  spots.add('flavia-guard-b', 'npc', 3.8, fl, az0 - 1.2, Math.PI);
  spots.add('flavia-petitioners', 'npc', 6, 0, -HD - 4, Math.PI * 0.9);
  spots.add('flavia-portico-steps', 'sit', -20, 0.4, -HD - 0.4, Math.PI);
  spots.add('flavia-vista-area-palatina', 'vista', 0, fl, -HD + 1.5, Math.PI);
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: 2500 };
}

// ---------------------------------------------------------------- Domus Tiberiana

function tiberiana(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  const hi = ctx.detail === 'high';
  const HW = 33, HD = 42;
  // Arcaded substructures on the NW flank and the front (toward the Forum and the Clivus Victoriae).
  const gW = groundRange(ctx, -HW - 3, -HD, -HW, HD);
  const gF = groundRange(ctx, -HW, -HD - 3, HW, -HD);
  const yW = Math.min(-2, gW.min - 0.5);
  const yF = Math.min(-2, gF.min - 0.5);
  d.span('concrete', -HW, Math.min(yW, yF), -HD, HW, -0.3, HD, { collide: true });
  d.solid(-HW, -0.3, -HD, HW, 0, HD);
  arcadeFace(new Draw(b, new THREE.Matrix4().makeRotationY(-Math.PI / 2)), -HD, HD, HW, yW, 0, { dir: -1, bay: 4.4, tier: 6.4, mat: 'brick', trim: 'travertine', depth: 1.3 });
  arcadeFace(d, -HW, HW, -HD, yF, 0, { dir: -1, bay: 4.4, tier: 6.4, mat: 'brick', trim: 'travertine', depth: 1.3 });
  // Terrace parapets on the substructures.
  d.span('travertine', -HW, 0, -HD, HW, 1.0, -HD + 0.5, { collide: true });
  d.span('travertine', -HW, 0, -HD, -HW + 0.5, 1.0, HD, { collide: true });
  d.span('paving_travertine', -HW, -0.05, -HD + 0.5, HW, 0.03, HD);
  // Buildings round the great peristyle: two storeys of offices and quarters.
  const cx0 = -18, cx1 = 18, cz0 = -20, cz1 = 22;
  const wing = (x0: number, z0: number, x1: number, z1: number, h: number, mat: MaterialId) => {
    d.span(mat, x0, 0, z0, x1, h, z1, { collide: true });
    d.span('travertine', x0 - 0.1, h * 0.5 - 0.15, z0 - 0.1, x1 + 0.1, h * 0.5 + 0.1, z1 + 0.1);
    roofOver(d, x0, z0, x1, z1, h, 0.34, 'roof_tile', mat);
    for (const f of ['n', 's', 'e', 'w'] as const) {
      openings(d, x0, z0, x1, z1, f, h * 0.5 + 1.0, 0.9, 1.6, 2.8);
      openings(d, x0, z0, x1, z1, f, 1.0, 0.9, 1.6, 4.2);
    }
  };
  wing(-HW + 4, -HD + 4, HW - 4, cz0 - 3.4, 8.4, 'plaster_ochre');
  wing(-HW + 4, cz1 + 3.4, HW - 4, HD - 2, 8.4, 'plaster_ochre');
  wing(-HW + 4, cz0 - 3.4, cx0 - 3.4, cz1 + 3.4, 7.6, 'plaster_cream');
  wing(cx1 + 3.4, cz0 - 3.4, HW - 4, cz1 + 3.4, 7.6, 'plaster_cream');
  peristyle(d, cx0, cz0, cx1, cz1, 0, { D: 0.5, H: 4.4, spacing: 3.2, depth: 3.0, mat: 'marble', cap: 'ionic', back: false, lite: true });
  pool(d, -2.7, -7.8, 2.7, 7.8, 0);
  gardenBed(d, -14, -16, -5, 18, 0);
  gardenBed(d, 5, -16, 14, 18, 0);
  // Gate on the SE side toward the Area Palatina, the cryptoporticus stair house beyond it.
  d.span('marble', HW - 4.3, 0, -3, HW - 3.9, 5.2, 3);
  d.span('black', HW - 4.32, 0, -1.4, HW - 4.28, 3.6, 1.4);
  const gx = HW - 2.0, gz = -21;
  d.span('brick', gx - 2.2, 0, gz - 2.6, gx + 2.2, 3.4, gz + 2.6, { collide: true });
  d.span('black', gx + 2.22, 0, gz - 0.9, gx + 2.24, 2.4, gz + 0.9);
  gableRoof(d, gx - 2.2, gz - 2.6, gx + 2.2, gz + 2.6, 3.4, { axis: 'z', pitch: 0.4, over: 0.2, gables: 'brick' });
  // Trees in the garden.
  const trees: TreeSpec[] = [[-10, -12], [10, -12], [-10, 14], [10, 14], [-22, 30], [22, 30]].map(([x, z], i) => ({ species: i < 4 ? 'laurel' : 'umbrella_pine', x, z, y: 0, scale: i < 4 ? 0.9 : 1.1, variant: i % 3 }) as TreeSpec);
  for (const t of plantTrees(ctx, trees)) b.collider(t);
  spots.add('tiberiana-cryptoporticus', 'door', gx + 3.0, 0, gz, Math.PI / 2);
  spots.add('tiberiana-gate', 'door', HW - 3.0, 0, 0, Math.PI / 2);
  spots.add('tiberiana-vista-forum', 'vista', -HW + 2, 0, -HD + 2, Math.atan2(-1, -1));
  spots.add('tiberiana-clerk', 'npc', 0, 0, cz0 - 1.5, 0);
  spots.add('tiberiana-guard', 'npc', HW - 2.0, 0, 3.5, Math.PI / 2);
  spots.add('tiberiana-bench', 'sit', -12, 0, 0, Math.PI / 2);
  void hi;
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: 2500 };
}

// ---------------------------------------------------------------- Palatine Stadium (garden hippodrome)

function stadium(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  const hi = ctx.detail === 'high';
  const HW = 15, HD = 48;
  const R = HW; // curved SW end (+z), centre at zc
  const zc = HD - R;
  const H1 = 4.8, H2 = 3.8;
  const depth = 4.0; // portico depth (column line → back wall)
  const ix = HW - depth; // column line x
  // Outer walls: the NW wall retains the palace level, the SE wall and the curved end stand on tall
  // substructures over the falling ground.
  const g = groundRange(ctx, -HW - 1, -HD - 1, HW + 1, HD + 1);
  const bottom = Math.min(-2, g.min - 0.8);
  const top = H1 + H2 + 0.6;
  d.span('brick', -HW - 1.0, bottom, -HD, -HW, top, zc, { collide: true });
  d.span('brick', HW, bottom, -HD, HW + 1.0, top, zc, { collide: true });
  d.span('brick', -HW - 1.0, bottom, -HD - 1.0, HW + 1.0, top, -HD, { collide: true });
  // Curved end wall (segments) and its substructure.
  const nC = 16;
  for (let i = 0; i < nC; i++) {
    const a0 = (Math.PI * i) / nC, a1 = (Math.PI * (i + 1)) / nC;
    const am = (a0 + a1) / 2;
    const r = R + 0.5;
    const len = 2 * r * Math.sin((a1 - a0) / 2) + 0.1;
    d.box('brick', Math.cos(am) * r, (bottom + top) / 2, zc + Math.sin(am) * r, len, top - bottom, 1.0, { ry: -am + Math.PI / 2, collide: true });
  }
  // Blind arcades on the SE substructure's outer face (it stands over the falling ground).
  arcadeFace(new Draw(b, new THREE.Matrix4().makeRotationY(Math.PI / 2)), -zc, HD, HW + 1.3, bottom, top, { dir: 1, bay: 4.0, tier: 5.2, mat: 'brick', trim: 'travertine', depth: 0.3, collide: false });
  // Buttresses on the SE substructure.
  for (let k = -4; k <= 4; k++) {
    const z = (k * (HD + zc)) / 9 + (zc - HD) / 2;
    const gz = groundRange(ctx, HW + 1, z - 1, HW + 3, z + 1);
    if (gz.min < -1) d.span('brick', HW + 1, gz.min - 0.5, z - 0.9, HW + 2.6, Math.min(top - 1, H1), z + 0.9, { collide: true });
  }
  // Inner faces: plaster with a red dado; the two-storey portico of piers with half-columns.
  const portico = (x0: number, z0: number, x1: number, z1: number, faceX: number) => {
    // piers along a straight side (x = faceX), facing the garden.
    const n = Math.round((z1 - z0) / 4.0);
    for (let i = 0; i <= n; i++) {
      const z = z0 + ((z1 - z0) * i) / n;
      d.span('brick', faceX - 0.45, 0, z - 0.45, faceX + 0.45, H1 + H2, z + 0.45, { collide: true });
      const sgn = faceX > 0 ? -1 : 1;
      lowColumn(d, 'marble', faceX + sgn * 0.5, 0, z, 0.42, H1 - 0.5, { cap: 'ionic', seg: hi ? 8 : 6, lite: !hi });
      lowColumn(d, 'marble', faceX + sgn * 0.5, H1 + 0.4, z, 0.36, H2 - 0.6, { cap: 'corinthian', seg: hi ? 8 : 6, lite: !hi });
    }
    void x0;
    void x1;
  };
  portico(-HW, -HD + 2, -HW, zc, -ix);
  portico(HW, -HD + 2, HW, zc, ix);
  for (const sx of [-1, 1]) {
    const xi = sx * ix, xo = sx * HW;
    const a = Math.min(xi, xo), c = Math.max(xi, xo);
    d.span('plaster_red', sx < 0 ? -HW : HW - 0.03, 0, -HD, sx < 0 ? -HW + 0.03 : HW, 1.2, zc);
    d.span('plaster_cream', sx < 0 ? -HW : HW - 0.03, 1.2, -HD, sx < 0 ? -HW + 0.03 : HW, H1 + H2, zc);
    d.span('mosaic', a, -0.02, -HD, c, 0.03, zc);
    // Gallery floor of the upper storey and the lean-to roof.
    d.span('wood_dark', a, H1, -HD, c, H1 + 0.3, zc);
    d.span('marble', a, H1 + 0.3, -HD, c + 0.0, H1 + 0.4, zc);
    d.span('marble', xi - 0.5, H1 + 0.4, -HD, xi + 0.5, H1 + 1.4, zc);
    d.span('marble', xi - 0.5, H1 + H2 - 0.1, -HD, xi + 0.5, H1 + H2 + 0.4, zc);
  }
  // Roofs as lean-to along x on both long sides.
  for (const sx of [-1, 1]) {
    const xo = sx * HW, xi = sx * (ix - 0.5);
    const q = sx < 0
      ? [xo, top + 0.8, -HD, xi, H1 + H2 + 0.4, -HD, xi, H1 + H2 + 0.4, zc, xo, top + 0.8, -HD, xi, H1 + H2 + 0.4, zc, xo, top + 0.8, zc]
      : [xo, top + 0.8, zc, xi, H1 + H2 + 0.4, zc, xi, H1 + H2 + 0.4, -HD, xo, top + 0.8, zc, xi, H1 + H2 + 0.4, -HD, xo, top + 0.8, -HD];
    d.tris('roof_tile', q);
  }
  // Garden floor: lawn, gravel walks, hedges, two semicircular fountains and a central line of beds.
  d.span('gravel', -ix + 0.5, -0.04, -HD + 1, ix - 0.5, 0.02, zc);
  gardenBed(d, -ix + 2.0, -HD + 6, -2.0, zc - 4, 0);
  gardenBed(d, 2.0, -HD + 6, ix - 2.0, zc - 4, 0);
  for (const zf of [-HD + 4.5, zc - 1.5]) {
    d.geo(ringSector(2.4, 3.0, 0, Math.PI, 0.6, 12), 'marble', 0, 0, zf);
    d.geo(ringSector(0, 2.4, 0, Math.PI, 0.45, 12), 'water', 0, 0, zf);
  }
  // The curved end: a semicircular portico (columns on the arc).
  for (let i = 0; i <= 10; i++) {
    const a = (Math.PI * i) / 10;
    lowColumn(d, 'marble', Math.cos(a) * (R - depth), 0, zc + Math.sin(a) * (R - depth), 0.42, H1 - 0.5, { cap: 'ionic', collide: true, seg: 6, lite: true });
  }
  d.geo(ringSector(R - depth - 0.4, R, 0, Math.PI, 0.3, 16), 'wood_dark', 0, H1, zc);
  d.geo(ringSector(R - depth - 0.5, R + 0.5, 0, Math.PI, 0.5, 16), 'roof_tile', 0, top - 0.2, zc);
  // Imperial box: a great exedra on the SE side, projecting over the slope, two storeys.
  const bz = 0;
  const box = d.at(HW + 1.0, 0, bz, -Math.PI / 2);
  box.span('brick', -6.2, bottom, 0, 6.2, top + 2.4, 7.0, { collide: true });
  box.span('black', -3.2, 0, -0.02, 3.2, 4.2, 0.0);
  box.span('marble', -4.4, H1, -2.2, 4.4, H1 + 0.45, 0.2, { collide: true });
  box.span('marble', -4.4, H1 + 0.45, -2.2, 4.4, H1 + 1.4, -1.95, { collide: true });
  for (const x of [-4.0, -1.3, 1.3, 4.0]) lowColumn(box, 'marble', x, H1 + 0.45, -1.8, 0.4, 3.6, { cap: 'corinthian', seg: 8 });
  box.span('marble', -4.4, H1 + 4.05, -2.2, 4.4, H1 + 4.6, 0.2);
  gableRoof(box, -4.4, -2.2, 4.4, 0.2, H1 + 4.6, { axis: 'x', pitch: 0.3, over: 0.2, gables: 'marble' });
  box.span('fabric_purple', -4.2, H1 + 0.45, -0.02, 4.2, H1 + 3.8, 0.0);
  // Stairs at the NE end from the palace level down to the garden (both corners).
  for (const sx of [-1, 1]) {
    const gtop = groundRange(ctx, sx * (ix - 1.5) - 1, -HD - 3, sx * (ix - 1.5) + 1, -HD - 1).max;
    stair(d.at(sx * (ix - 1.6), 0, -HD + 0.5), 1.8, Math.max(0.4, Math.min(gtop, 6)), 'travertine');
  }
  // Trees: plane trees and laurels along the walks, roses and oleander.
  const trees: TreeSpec[] = [];
  for (let k = 0; k < 7; k++) {
    const z = -HD + 10 + k * ((zc - 4 - (-HD + 10)) / 6);
    trees.push({ species: k % 2 ? 'laurel' : 'plane', x: -ix + 1.3, z, y: 0, scale: k % 2 ? 0.8 : 0.75, variant: k % 3 });
    trees.push({ species: k % 2 ? 'plane' : 'laurel', x: ix - 1.3, z, y: 0, scale: k % 2 ? 0.75 : 0.8, variant: (k + 1) % 3 });
  }
  for (let k = 0; k < 6; k++) trees.push({ species: 'oleander', x: k % 2 ? 1.0 : -1.0, z: -HD + 12 + k * 12, y: 0, scale: 0.9 });
  for (const t of plantTrees(ctx, trees)) b.collider(t);
  // Spots.
  spots.add('stadium-imperial-box', 'vista', HW - 1.2, H1 + 0.45, bz, -Math.PI / 2);
  spots.add('stadium-bench-a', 'sit', -ix + 0.8, 0, -10, Math.PI / 2);
  spots.add('stadium-bench-b', 'sit', ix - 0.8, 0, 14, -Math.PI / 2);
  spots.add('stadium-gardener', 'npc', 0, 0, 0, 0);
  spots.add('stadium-fountain', 'shrine', 0, 0, zc - 4.5, Math.PI);
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: 1600 };
}

// ---------------------------------------------------------------- Paedagogium

function paedagogium(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  const HW = 13.8, HD = 9;
  // Terrace platform levelled into the slope at y = 0.2; the back rooms are built against the hill.
  const fl = 0.2;
  block(d, ctx, -HW, -HD, HW, HD, fl, 'tufa', {});
  const H1 = 3.8, H2 = 3.4;
  // Back range (two storeys) against the slope, side wings, front wall with the entrance.
  const back0 = 2.5;
  d.span('plaster_cream', -HW, fl, back0, HW, fl + H1 + H2, HD, { collide: true });
  roofOver(d, -HW, back0, HW, HD, fl + H1 + H2, 0.32, 'roof_tile', 'plaster_cream');
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -HW : HW - 4.2, x1 = sx < 0 ? -HW + 4.2 : HW;
    d.span('plaster_cream', x0, fl, -HD, x1, fl + H1, back0, { collide: true });
    roofOver(d, x0, -HD, x1, back0, fl + H1, 0.34, 'roof_tile', 'plaster_cream');
  }
  d.span('plaster_cream', -HW + 4.2, fl, -HD, -1.4, fl + 3.2, -HD + 0.5, { collide: true });
  d.span('plaster_cream', 1.4, fl, -HD, HW - 4.2, fl + 3.2, -HD + 0.5, { collide: true });
  d.span('plaster_cream', -1.4, fl + 2.6, -HD, 1.4, fl + 3.2, -HD + 0.5);
  d.span('plaster_red', -HW, fl, -HD - 0.02, HW, fl + 1.1, -HD);
  // Small court with a portico on three sides.
  peristyle(d, -HW + 5.6, -HD + 1.8, HW - 5.6, back0 - 1.6, fl, { D: 0.3, H: 2.9, spacing: 2.4, depth: 1.3, mat: 'plaster_white', cap: 'tuscan', back: false, lite: true, skip: ['n'] });
  d.span('cobbles', -HW + 4.2, fl - 0.02, -HD + 0.5, HW - 4.2, fl + 0.02, back0);
  openings(d, -HW + 4.2, -HD, HW - 4.2, back0, 's', fl, 1.0, 2.3, 2.6, { margin: 1.4 });
  openings(d, -HW, back0, HW, HD, 'n', fl + H1 + 0.9, 0.8, 1.3, 2.4);
  openings(d, -HW, -HD, HW, HD, 'n', fl + 1.4, 0.7, 1.0, 5.6, { margin: 6.5 });
  // Graffiti scratched into the plaster by the pages (texts composed for the game).
  const g1 = ['Hic Fuimus', 'Eutyches · Libanus · Hermes'];
  const g2 = ['Valete Pueri', 'Felix Prasina'];
  paintedSign(b, g1, 2.2, 0.8, new THREE.Matrix4().makeTranslation(-4.0, fl + 1.5, back0 - 0.02), { ink: '#4a4038', ground: '#e2d6bd' });
  paintedSign(b, g2, 2.0, 0.7, new THREE.Matrix4().makeTranslation(4.2, fl + 1.6, back0 - 0.02), { ink: '#5a3a30', ground: '#e2d6bd' });
  // The approach: a short stair from the street up to the entrance.
  const gs = groundRange(ctx, -1.4, -HD - 2.5, 1.4, -HD);
  if (fl - gs.min > 0.15) stair(d.at(0, gs.min, -HD - Math.ceil((fl - gs.min) / 0.2) * 0.32), 2.4, fl - gs.min, 'travertine');
  spots.add('paedagogium-graffiti', 'inscription', -4.0, fl, back0 - 1.6, Math.PI);
  spots.add('paedagogium-door', 'door', 0, fl, -HD - 0.6, Math.PI);
  spots.add('paedagogium-teacher', 'npc', 0, fl, 0, Math.PI);
  spots.add('paedagogium-pages', 'npc', -2.5, fl, -3, 0.4);
  return { object: b.build(ctx.lm.id), colliders: b.colliders, spots: spots.list, cullDistance: 1200 };
}

export const builders: LandmarkBuilder[] = [
  { handles: ['domus-augustana'], build: augustana },
  { handles: ['domus-flavia'], build: flavia },
  { handles: ['domus-tiberiana'], build: tiberiana },
  { handles: ['palatine-stadium'], build: stadium },
  { handles: ['paedagogium'], build: paedagogium },
];

void column;
void entablature;
void pediment;
void togate;
void placeProp;
void Rng;
