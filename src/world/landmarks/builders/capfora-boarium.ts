/**
 * Below the Capitol's SW cliff — capfora crew: the twin temples of Fortuna and Mater Matuta
 * (Sant'Omobono) on their common platform, and the Porta Carmentalis, the obsolete double gate of
 * the Servian wall whose right-hand passage, the Porta Scelerata, is shunned because the 306 Fabii
 * marched out through it to their deaths (Livy 2.49; Ovid, Fasti 2.201).
 */
import * as THREE from 'three';
import { archway } from '../../../arch/classical/arch';
import { templeLayout } from '../../../arch/classical/temple';
import { T, TRS, mul } from '../../../arch/common/geom';
import { stairs, stepCount } from '../../../arch/common/stairs';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext } from '../types';
import { makeLandmark, type Detail } from './capfora/build';
import { templeFar } from './capfora/far';
import { S, spotAt, type CapSpot } from './capfora/frame';
import { altar, box, figure, footing, groundMin, inscription, post, span } from './capfora/ornament';
import { PAINT, paint } from './capfora/paint';
import { capTemple } from './capfora/temple';
import { addLamp, lampstand, plantTrees, torch } from './capfora/life';

// ------------------------------------------------------------------ the twin temples

const TWIN_SPEC = {
  order: 'tuscan' as const,
  plan: 'prostyle' as const,
  front: 4,
  sides: 4,
  width: 11.5 * S,
  intercolumniation: 'araeostyle' as const,
  podiumHeight: 2.2 * S,
  material: 'plaster_white' as MaterialId,
  podiumMaterial: 'tufa' as MaterialId,
  cellaMaterial: 'plaster_white' as MaterialId,
  pitchDeg: 18,
};

function buildTwins(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const g = ctx.groundAt;
  const I = new THREE.Matrix4();
  const h = (47 * S) / 2;
  const y = 0.25;
  // The common platform (the area sacra), paved in slabs, a step above the street, inside a low
  // precinct wall with the entrance on the front (towards the Vicus Iugarius).
  footing(b, 'tufa', g, -h, -h, h, h, y, I, true);
  span(b, 'paving_travertine', -h + 0.3, y - 0.02, -h + 0.3, h - 0.3, y + 0.005, h - 0.3, I);
  const { count, rise } = stepCount(y - Math.min(0, groundMin(g, -h, -h - 2, h, -h)), 0.19);
  if (count > 1) stairs(b, { width: 2 * h - 2, rise, run: 0.34, count, material: 'tufa' }, T(0, y - count * rise, -h - count * 0.34));
  {
    const wy = y;
    const wt = 0.55;
    const wh = 1.25;
    // Sides and back; the front has a 9 m opening in the middle.
    span(b, 'tufa', -h, wy, h - wt, h, wy + wh, h, I, true);
    for (const sx of [-1, 1]) {
      span(b, 'tufa', sx > 0 ? h - wt : -h, wy, -h, sx > 0 ? h : -h + wt, wy + wh, h, I, true);
      span(b, 'tufa', sx > 0 ? 4.5 : -h, wy, -h, sx > 0 ? h : -4.5, wy + wh, -h + wt, I, true);
      // Gate posts with lamps.
      span(b, 'travertine', sx * 4.5 - 0.45, wy, -h - 0.05, sx * 4.5 + 0.45, wy + 2.3, -h + wt + 0.05, I, true);
      lampstand(ctx, b, sx * 3.6, wy, -h + 1.0);
    }
    // Coping.
    span(b, 'travertine', -h - 0.05, wy + wh, h - wt - 0.05, h + 0.05, wy + wh + 0.1, h + 0.05, I);
    for (const sx of [-1, 1]) span(b, 'travertine', sx > 0 ? h - wt - 0.05 : -h - 0.05, wy + wh, -h - 0.05, sx > 0 ? h + 0.05 : -h + wt + 0.05, wy + wh + 0.1, h + 0.05, I);
  }
  // Old trees in the precinct: a fig by the back wall, laurels at the corners.
  plantTrees(ctx, b, [
    { sp: 'fig', x: 0, z: h - 3.2, y, s: 1.1 },
    { sp: 'laurel', x: -h + 2.4, z: -h + 3.0, y, s: 0.9 },
    { sp: 'laurel', x: h - 2.4, z: -h + 3.0, y, s: 0.95 },
    { sp: 'cypress', x: -h + 1.8, z: h - 1.8, y },
    { sp: 'cypress', x: h - 1.8, z: h - 1.8, y },
  ]);
  // Votive statues between the temples and a honorific column with a gilded Fortuna.
  for (const z of [-2, 4]) figure(b, z < 0 ? 'draped' : 'togate', TRS(0, y + 1.2, z, 0, 0, 0), { scale: 1.0, material: 'bronze', detail: 'low' });
  for (const z of [-2, 4]) span(b, 'marble', -0.5, y, z - 0.45, 0.5, y + 1.2, z + 0.45, I, true);
  spots.push(spotAt('cake-seller', 'stall', -h + 3.2, y, -h + 5.5, 0, 0, { label: 'Woman selling honey cakes (liba) and garlands for the goddesses' }));
  const L = templeLayout({ ...TWIN_SPEC, detail });
  const dz = 3 - L.stylobate.z1 + (L.stylobate.z1 - L.stairs.z0) / 2;
  const names = [
    { id: 'fortuna', x: -7.2, label: 'Temple of Fortuna (the veiled statue of King Servius)', statue: 'togate' as const },
    { id: 'mater-matuta', x: 7.2, label: 'Temple of Mater Matuta, the Dawn mother', statue: 'draped' as const },
  ];
  for (const n of names) {
    const at = T(n.x, y, dz);
    const res = capTemple(b, { ...TWIN_SPEC, detail, roofMaterial: 'roof_tile', antefix: 'terracotta', tympanum: paint(PAINT.redOchre, 0.85), interior: true, fluted: false, apse: 0, furnish: (bb, info) => {
      const zc = info.z1 - 1.4;
      span(bb, 'tufa', -0.8, info.y, zc - 0.7, 0.8, info.y + 0.8, zc + 0.7, info.at, true);
      // Fortuna's ancient gilded wooden statue, veiled under two togas; Mater Matuta's terracotta.
      figure(bb, n.statue, mul(info.at, TRS(0, info.y + 0.8, zc, 0, 0, 0)), { scale: 1.35, material: n.id === 'fortuna' ? 'gilded_bronze' : 'terracotta', detail: info.detail });
      if (n.id === 'fortuna') box(bb, 'fabric_white', 0, info.y + 0.8 + 1.65, zc, 0.62, 1.1, 0.5, info.at);
    } }, at);
    // An altar before each temple.
    const az = res.stairFoot.z + dz - 3.0;
    altar(b, 2.2, 1.4, 1.0, T(n.x, y, az), { detail, material: 'tufa', fire: n.id === 'fortuna' });
    if (n.id === 'fortuna') addLamp(ctx, n.x, y + 1.35, az, 'brazier');
    spots.push(spotAt(n.id, 'shrine', n.x, y, az - 1.6, n.x, az, { label: n.label }));
  }
  spots.push(spotAt('matron', 'npc', 0, y, -h + 4, 7.2, 0, { label: 'A matron, married once, bringing cakes for the Matralia' }));
  spots.push(spotAt('area-sacra', 'spawn', 0, y, -h + 2, 0, 0, { label: 'The twin temples' }));
  const text = inscription(b, ['FORTVNAE ET MATRI MATVTAE'], 4.4, 0.5, T(-(4.5 + h) / 2, y + 0.65, -h - 0.02), 'carved', { depth: 0.04 });
  spots.push(spotAt('boundary', 'inscription', -(4.5 + h) / 2, y, -h - 1.8, -(4.5 + h) / 2, -h, { label: 'Fortuna and Mater Matuta', text, gloss: 'Servius Tullius founded both temples, they say; women married only once may enter the temple of Mater Matuta at the Matralia (11 June).' }));
}

function twinsFar(b: MeshBuilder) {
  const L = templeLayout(TWIN_SPEC);
  const dz = 3 - L.stylobate.z1 + (L.stylobate.z1 - L.stairs.z0) / 2;
  for (const x of [-7.2, 7.2]) templeFar(b, L, T(x, 0.25, dz), { podium: 'tufa', mat: 'plaster_white' });
}

// ------------------------------------------------------------------ the Porta Carmentalis

function buildCarmentalis(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const g = ctx.groundAt;
  const I = new THREE.Matrix4();
  // Twin arched passages of tufa ashlar (Grotta Oscura) with travertine voussoirs in a stub of the
  // Servian wall. The outer face looks −z (towards the Campus). Leaving the city, the Porta
  // Scelerata is the passage on the right: +x.
  const pass = 2.8;
  const pier = 1.1;
  const mid = 1.3;
  const depth = 3.6;
  const springing = 2.9;
  const top = 5.6;
  const yb = Math.min(-0.4, groundMin(g, -8, -depth, 8, depth) - 0.4);
  const xL = -(mid / 2 + pass / 2);
  const xR = mid / 2 + pass / 2;
  for (const [x, left, right] of [
    [xL, true, false],
    [xR, false, true],
  ] as const) {
    archway(b, { span: pass, springing, pier, depth, top, material: 'tufa', trim: 'travertine', detail, leftPier: left, rightPier: right }, T(x, 0, 0));
  }
  // The pier between the passages.
  span(b, 'tufa', -mid / 2, 0, -depth / 2, mid / 2, top, depth / 2, I, true);
  // Footing below the gate down to the ground.
  footing(b, 'tufa', g, -(mid / 2 + pass + pier), -depth / 2, mid / 2 + pass + pier, depth / 2, 0, I, false);
  span(b, 'paving_basalt', -(mid / 2 + pass), -0.02, -depth / 2 - 0.5, mid / 2 + pass, 0.03, depth / 2 + 0.5, I);
  // Stubs of the Servian wall either side (Grotta Oscura tufa in courses of headers and
  // stretchers): long out of use, broken down in uneven steps where houses have quarried it.
  const ww = 3.6;
  for (const sx of [-1, 1]) {
    const x0 = sx * (mid / 2 + pass + pier);
    const len = sx < 0 ? 9.5 : 7.0;
    const tops = sx < 0 ? [4.9, 4.9, 4.3, 3.8, 3.8, 2.9, 2.2, 1.4] : [4.9, 4.6, 4.6, 4.0, 3.2, 2.6, 2.0, 1.6];
    const n = tops.length;
    for (let i = 0; i < n; i++) {
      const xa = x0 + (sx * len * i) / n;
      const xb = x0 + (sx * len * (i + 1)) / n;
      const gb = Math.min(-0.4, groundMin(g, Math.min(xa, xb), -ww / 2, Math.max(xa, xb), ww / 2) - 0.4);
      const top = Math.max(tops[i], (sx > 0 ? g((xa + xb) / 2, 0) : 0) + 1.2);
      span(b, 'tufa', Math.min(xa, xb), gb, -ww / 2 + (i % 2) * 0.12, Math.max(xa, xb), top, ww / 2 - (i % 3) * 0.1, I, true);
    }
  }
  // A crowning band over the gate.
  span(b, 'travertine', -(mid / 2 + pass + pier) - 0.1, top, -depth / 2 - 0.1, mid / 2 + pass + pier + 0.1, top + 0.35, depth / 2 + 0.1, I);
  const text = inscription(b, ['PORTA CARMENTALIS'], 3.6, 0.45, T(0, top - 0.6, -depth / 2 - 0.02), 'carved', { depth: 0.03 });
  // Carmenta's shrine against the inner face (+z) of the left stub: altar, lamp and niche.
  const sx0 = -(mid / 2 + pass + pier) - 3.0;
  span(b, 'plaster_white', sx0 - 0.8, 0.9, ww / 2, sx0 + 0.8, 2.6, ww / 2 + 0.25, I);
  span(b, 'plaster_red', sx0 - 0.6, 1.05, ww / 2 + 0.26, sx0 + 0.6, 2.4, ww / 2 + 0.27, I);
  altar(b, 0.9, 0.6, 0.85, T(sx0, 0, ww / 2 + 0.9), { detail, material: 'tufa', fire: true });
  addLamp(ctx, sx0, 1.2, ww / 2 + 0.9, 'brazier');
  post(b, 'bronze', sx0 + 0.6, 0.85, ww / 2 + 0.9, 0.5, 0.03, I, 5);
  spots.push(spotAt('carmenta', 'shrine', sx0, 0, ww / 2 + 2.3, sx0, ww / 2, { label: 'Shrine of Carmenta, the prophetess' }));
  // Torches on the city face of the gate, a traveller who will not use the right-hand arch.
  for (const x of [-(mid / 2 + pass + pier) + 0.55, mid / 2 + pass + pier - 0.55]) torch(ctx, b, x, 2.6, depth / 2, Math.PI);
  spots.push(spotAt('superstitious', 'npc', xR + 1.8, 0, depth / 2 + 3.5, xL, -depth, { label: 'A traveller who goes the long way round rather than through the Porta Scelerata' }));
  spots.push(spotAt('greens-seller', 'stall', xL - 4.2, 0, -depth / 2 - 4.5, xL, 0, { label: 'Greengrocer from the Forum Holitorium' }));
  spots.push(spotAt('gate-left', 'door', xL, 0, depth / 2 + 1.2, xL, -depth, { label: 'Porta Carmentalis', text }));
  spots.push(spotAt('gate-scelerata', 'door', xR, 0, depth / 2 + 1.2, xR, -depth, { label: 'Porta Scelerata — the wicked gate (superstitious people avoid it)' }));
}

export const builders: LandmarkBuilder[] = [
  {
    handles: ['sant-omobono-temples'],
    build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildTwins(ctx, b, d, spots), { far: ctx.detail === 'high' && twinsFar, cull: 300 }),
  },
  {
    handles: ['porta-carmentalis'],
    build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildCarmentalis(ctx, b, d, spots), { far: ctx.detail === 'high', cull: 300 }),
  },
];
