/**
 * Porta Capena surroundings (palcirc crew), in the gate's local frame (outer face toward −z down
 * the Via Appia, the city at +z, y = 0 on the gate's pad):
 *
 * - the tombs lining the Via Appia outside the gate, fading into the night behind the spawn
 *   (altar, aedicula, drum, tower and house tombs, a schola bench, a plot of stelae), with grave
 *   lamps lit for the Lemuria and cypresses;
 * - the grove of the Camenae, "now let to Jews whose furniture is a basket and some hay"
 *   (Juvenal 3.13–16): a few makeshift shelters among the trees;
 * - the gate quarter just inside: a small square where the carts wait for the night, the compitum
 *   shrine of the crossroads, a fountain, the vigiles' brazier, a popina with its lamp, and
 *   apartment blocks with shops along the urban Via Appia, which runs on to the streets by the
 *   Circus (the atlas has no road there; see the crew report).
 */
import * as THREE from 'three';
import { Draw as DrawCls, type Draw } from '../../../../arch/fabric/draw';
import { buildStreet } from '../../../../arch/fabric/streets';
import { lacus } from '../../../../arch/fabric/fountain';
import { compitalShrine } from '../../../../arch/fabric/shrines';
import { insula, type BayKind } from '../../../../arch/fabric/insula';
import { velum } from '../../../../arch/fabric/awnings';
import { inscriptionPanel, paintedSign } from '../../../../arch/common/inscription';
import { placeProp, statueFigure } from '../../../../arch/props/props';
import { Rng } from '../../../../core/Rng';
import type { MeshBuilder } from '../../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../../gfx/materialIds';
import type { LightRequest } from '../../../lights/LightPool';
import type { LandmarkContext } from '../../types';
import { mule, sleepingDog } from './animals';
import { Spots, gableRoof, groundRange, lowColumn, type TreeSpec } from './util';

export type Lamp = LightRequest & { position: THREE.Vector3 };

/** Half width of the urban Via Appia's roadway and its sidewalks (property line at ±PL). */
export const ROAD_HW = 2.5;
export const SIDEWALK = 1.6;
export const PL = ROAD_HW + SIDEWALK;

// ---------------------------------------------------------------- tombs

export type TombKind = 'altar' | 'aedicula' | 'drum' | 'columbarium' | 'tower' | 'schola' | 'stelae';

export interface TombSite {
  kind: TombKind;
  /** Centre z on the road, side (+1 = +x), setback of the front from the property line. */
  z: number;
  side: 1 | -1;
  setback: number;
  /** Inscription lines (carved), if any. */
  text?: string[];
  lamp?: boolean;
}

/** Plan of the tombs outside the gate (pure, tested): nothing overlaps the road or each other. */
export function appiaTombs(): TombSite[] {
  return [
    { kind: 'schola', z: -36, side: 1, setback: 0.6, text: ['Siste Viator', 'Et Lege'] },
    { kind: 'altar', z: -41, side: -1, setback: 0.8, text: ['D M', 'C Iulio Felici', 'Vix Ann LXII', 'Iulia Prima Coniugi'], lamp: true },
    { kind: 'aedicula', z: -50, side: 1, setback: 1.2, text: ['M Licinius Eros', 'Pistor', 'Sibi Et Suis'] },
    { kind: 'columbarium', z: -57, side: -1, setback: 1.0, text: ['Libertorum', 'Familiae Statiliae'] },
    { kind: 'drum', z: -67, side: 1, setback: 1.5, text: ['Claudiae Secundae', 'H M H N S'], lamp: true },
    { kind: 'tower', z: -73, side: -1, setback: 1.2, text: ['L Valerius L F', 'Pal Rufus'] },
    { kind: 'altar', z: -83, side: 1, setback: 0.8, text: ['Dis Manibus', 'Antoniae Helpidi', 'Vix Ann XXIV'] },
    { kind: 'stelae', z: -89, side: -1, setback: 0.6 },
    { kind: 'columbarium', z: -98, side: 1, setback: 1.0, text: ['Collegium', 'Fabrum Tignariorum'] },
    { kind: 'drum', z: -106, side: -1, setback: 1.5, lamp: true },
    { kind: 'tower', z: -117, side: 1, setback: 1.2 },
    { kind: 'aedicula', z: -124, side: -1, setback: 1.2 },
    { kind: 'stelae', z: -134, side: 1, setback: 0.6 },
    { kind: 'altar', z: -140, side: -1, setback: 0.8 },
    { kind: 'drum', z: -150, side: 1, setback: 1.5 },
  ];
}

/** Half extents (along the road, away from it) of each tomb kind's footprint. */
export function tombHalf(kind: TombKind): [number, number] {
  switch (kind) {
    case 'altar': return [1.9, 1.9];
    case 'aedicula': return [1.8, 1.8];
    case 'drum': return [3.7, 3.7];
    case 'columbarium': return [2.6, 2.2];
    case 'tower': return [1.9, 1.9];
    case 'schola': return [2.8, 1.8];
    case 'stelae': return [2.2, 1.6];
  }
}

/** Builds the tombs and the road outside the gate. */
export function buildAppia(ctx: LandmarkContext, b: MeshBuilder, d: Draw, spots: Spots, lamps: Lamp[], trees: TreeSpec[], zGate: number) {
  const hi = ctx.detail === 'high';
  const g = (x: number, z: number) => ctx.groundAt(x, z);
  buildStreet(b, { points: [[0, -158], [0, zGate - 0.6]], kind: 'paved', roadWidth: 2 * ROAD_HW, sidewalk: SIDEWALK, curb: 0.25, capEnd: true, seed: 3, steppingStones: [] }, g);
  const rng = new Rng('appia-tombs');
  for (const [i, t] of appiaTombs().entries()) {
    const [ha, hd] = tombHalf(t.kind);
    // Tomb frame: front toward the road. +x side → front faces −x (rotY = +π/2).
    const cx = t.side * (PL + t.setback + hd);
    const rot = t.side > 0 ? Math.PI / 2 : -Math.PI / 2;
    const gr = groundRange(ctx, cx - hd, t.z - ha, cx + hd, t.z + ha, 1.2);
    const y = gr.min;
    const f = d.at(cx, y, t.z, rot);
    const rise = gr.max - gr.min;
    tomb(b, f, t, rng.fork(i), hi, rise);
    // A grave lamp on the step (Lemuria: the dead walk these nights).
    if (t.lamp) {
      const p = f.point(0.45, 0.62 + rise, -hd - 0.05);
      placeProp(f, 'oil_lamp', 0.45, 0.6 + rise, -hd + 0.05, 0, { collide: false });
      lamps.push({ position: p.add(new THREE.Vector3(0, 0.15, 0)), color: 0xffa54f, intensity: 3.2, distance: 6, flicker: 0.45, night: true, glow: 0.24, glowIntensity: 1.7 });
    }
    // Cypresses behind most tombs, an occasional stone pine in a tomb garden.
    const tz = t.z + (rng.chance(0.5) ? 1 : -1) * (ha * 0.6);
    const tx = t.side * (PL + t.setback + 2 * hd + 1.6 + rng.range(0, 1.5));
    if (i % 4 !== 3) trees.push({ species: 'cypress', x: tx, z: tz, scale: rng.range(0.85, 1.15), variant: i % 3 });
    else trees.push({ species: 'umbrella_pine', x: tx + t.side * 2, z: tz, scale: rng.range(0.9, 1.05), variant: i % 3 });
    if (t.text) spots.add(`appia-tomb-${i}`, 'inscription', t.side * (PL - 0.4), g(t.side * (PL - 0.4), t.z) + 0.3, t.z, t.side > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  // Milestone at the first mile's start (the Miliarium Aureum count begins at the gate) [G].
  placeProp(d, 'milestone', -(PL + 0.5), g(-(PL + 0.5), -31), -31, -Math.PI / 2, { variant: 0 });
  spots.add('appia-schola-seat', 'sit', PL + 1.6, g(PL + 1.6, -36) + 0.45, -36, -Math.PI / 2);
}

/** One tomb in its frame (front −z at z = −hd, origin on the lowest ground under it). */
function tomb(b: MeshBuilder, f: Draw, t: TombSite, rng: Rng, hi: boolean, rise: number) {
  const [ha, hd] = tombHalf(t.kind);
  const stone: MaterialId = rng.chance(0.6) ? 'travertine' : 'peperino';
  const base = rise; // ground at the high side of the footprint
  // Rough foundation course from below the ground up to the footprint's highest point.
  f.span('tufa', -ha, -0.6, -hd, ha, base + 0.05, hd, { collide: true });
  const text = (lines: string[], w: number, h: number, y: number, z: number, mat: MaterialId = 'marble') =>
    inscriptionPanel(b, { lines, width: w, height: h, style: 'carved', border: true, sizes: lines.map((_, k) => (k === 0 ? 1 : 0.8)) }, f.m.clone().multiply(new THREE.Matrix4().makeTranslation(0, y, z)), { depth: 0.04, bodyMaterial: mat });
  const y0 = base;
  switch (t.kind) {
    case 'altar': {
      f.span(stone, -1.7, y0, -1.7, 1.7, y0 + 0.35, 1.7, { collide: true });
      f.span(stone, -1.45, y0 + 0.35, -1.45, 1.45, y0 + 0.6, 1.45, { collide: true });
      f.span('marble', -1.15, y0 + 0.6, -1.15, 1.15, y0 + 2.6, 1.15, { collide: true });
      f.span('marble', -1.32, y0 + 2.6, -1.32, 1.32, y0 + 2.88, 1.32);
      f.span('marble', -1.25, y0 + 0.6, -1.25, 1.25, y0 + 0.78, 1.25);
      // Bolsters (pulvini) and a small fronton between them.
      for (const s of [-1, 1]) f.cyl('marble', s * 0.95, y0 + 3.1, 0, 0.24, 2.5, hi ? 10 : 6, { rx: Math.PI / 2 });
      f.tris('marble', [-0.7, y0 + 2.88, -1.2, 0.7, y0 + 2.88, -1.2, 0, y0 + 3.3, -1.2]);
      // Garland in relief and the inscription.
      if (hi) f.cyl('foliage_olive', 0, y0 + 2.2, -1.17, 0.55, 0.12, 10, { rx: Math.PI / 2, open: true });
      if (t.text) text(t.text, 1.7, 1.0, y0 + 1.45, -1.17);
      break;
    }
    case 'aedicula': {
      f.span(stone, -1.7, y0, -1.7, 1.7, y0 + 2.4, 1.7, { collide: true });
      f.span(stone, -1.8, y0 + 2.4, -1.8, 1.8, y0 + 2.62, 1.8);
      if (t.text) text(t.text, 2.4, 1.1, y0 + 1.3, -1.72, stone);
      const top = y0 + 2.62;
      for (const x of [-1.35, 1.35]) for (const z of [-1.35, 1.35]) lowColumn(f, 'marble', x, top, z, 0.3, 2.6, { cap: 'corinthian', seg: hi ? 8 : 6, collide: true });
      f.span('marble', -1.62, top + 2.6, -1.62, 1.62, top + 3.0, 1.62);
      gableRoof(f, -1.62, -1.62, 1.62, 1.62, top + 3.0, { axis: 'z', pitch: 0.32, over: 0.12, gables: 'marble' });
      // The couple, togate, inside.
      const r = new Rng(`aed-${t.z}`);
      for (const s of [-1, 1]) statueFigure(f.at(s * 0.45, top, 0.3, 0), 'marble', r);
      break;
    }
    case 'drum': {
      f.span(stone, -3.6, y0, -3.6, 3.6, y0 + 0.6, 3.6, { collide: true });
      f.cyl(stone, 0, y0 + 0.6 + 1.4, 0, 3.2, 2.8, hi ? 28 : 16, { collide: true });
      f.cyl('marble', 0, y0 + 3.5, 0, 3.32, 0.25, hi ? 28 : 16);
      // Earth mound planted with grass (a cypress grows on many of them).
      f.ellipsoid('grass', 0, y0 + 3.55, 0, 3.05, 1.7, 3.05, { seg: hi ? [16, 6] : [10, 4] });
      if (t.text) text(t.text, 2.4, 0.8, y0 + 1.9, -3.21, stone);
      break;
    }
    case 'columbarium': {
      f.span('brick', -2.5, y0, -2.1, 2.5, y0 + 3.6, 2.1, { collide: true });
      f.span('travertine', -2.55, y0, -2.15, 2.55, y0 + 0.4, 2.15);
      f.span('travertine', -2.6, y0 + 3.45, -2.2, 2.6, y0 + 3.7, 2.2);
      gableRoof(f, -2.6, -2.2, 2.6, 2.2, y0 + 3.7, { axis: 'z', pitch: 0.36, over: 0.15, gables: 'brick' });
      // Door with a travertine frame, small windows, the name panel over the door.
      f.span('travertine', -0.75, y0 + 0.4, -2.14, 0.75, y0 + 2.5, -2.11);
      f.span('wood_dark', -0.55, y0 + 0.4, -2.17, 0.55, y0 + 2.3, -2.13);
      for (const x of [-1.7, 1.7]) f.span('black', x - 0.18, y0 + 2.4, -2.13, x + 0.18, y0 + 2.9, -2.11);
      if (t.text) text(t.text, 1.6, 0.5, y0 + 2.95, -2.13, 'travertine');
      break;
    }
    case 'tower': {
      f.span(stone, -1.8, y0, -1.8, 1.8, y0 + 3.2, 1.8, { collide: true });
      f.span(stone, -1.9, y0 + 3.2, -1.9, 1.9, y0 + 3.45, 1.9);
      // False door on the base: the threshold between the living and the dead.
      f.span('marble', -0.6, y0 + 0.3, -1.82, 0.6, y0 + 2.3, -1.79);
      f.span('black', -0.42, y0 + 0.3, -1.84, 0.42, y0 + 2.1, -1.81);
      if (t.text) text(t.text, 1.9, 0.5, y0 + 2.75, -1.82, stone);
      const u = y0 + 3.45;
      f.span('plaster_white', -1.25, u, -1.25, 1.25, u + 2.8, 1.25, { collide: true });
      for (const x of [-1.45, 1.45]) for (const z of [-1.45, 1.45]) lowColumn(f, 'marble', x, u, z, 0.3, 2.8, { cap: 'ionic', seg: hi ? 8 : 6 });
      f.span('marble', -1.7, u + 2.8, -1.7, 1.7, u + 3.15, 1.7);
      // Pyramidal cap with a pine-cone finial.
      const a = u + 3.15, h = 2.0;
      f.tris('marble', [
        -1.7, a, -1.7, 0, a + h, 0, 1.7, a, -1.7,
        1.7, a, -1.7, 0, a + h, 0, 1.7, a, 1.7,
        1.7, a, 1.7, 0, a + h, 0, -1.7, a, 1.7,
        -1.7, a, 1.7, 0, a + h, 0, -1.7, a, -1.7,
      ]);
      f.ellipsoid('bronze', 0, a + h + 0.2, 0, 0.16, 0.3, 0.16, { seg: [7, 5] });
      break;
    }
    case 'schola': {
      // Semicircular bench (the tomb of Mamia at Pompeii), open to the road, with lion's feet ends.
      const n = hi ? 12 : 8;
      for (let i = 0; i < n; i++) {
        const a0 = (Math.PI * i) / n, a1 = (Math.PI * (i + 1)) / n;
        const am = (a0 + a1) / 2;
        const r = 2.2;
        const len = 2 * r * Math.sin((a1 - a0) / 2) + 0.05;
        const x = Math.cos(am) * r, z = Math.sin(am) * r * 0.75 - 0.3;
        f.box('tufa', x, y0 + 0.24, z, len, 0.48, 0.55, { ry: -Math.atan2(Math.sin(am) * 0.75, Math.cos(am)) + Math.PI / 2, collide: true });
        f.box('travertine', x * 1.07, y0 + 0.8, z * 1.07 + 0.05, len, 0.7, 0.18, { ry: -Math.atan2(Math.sin(am) * 0.75, Math.cos(am)) + Math.PI / 2, collide: true });
      }
      for (const s of [-1, 1]) f.span('travertine', s * 2.5 - 0.22, y0, -0.55, s * 2.5 + 0.22, y0 + 0.62, -0.05, { collide: true });
      // Column with the funerary urn at the back.
      lowColumn(f, 'marble', 0, y0, 1.35, 0.32, 2.2, { cap: 'ionic', seg: hi ? 8 : 6, collide: true });
      f.cyl('marble', 0, y0 + 2.45, 1.35, 0.22, 0.5, 8, { rTop: 0.12 });
      if (t.text) text(t.text, 1.2, 0.45, y0 + 0.75, -0.62, 'travertine');
      break;
    }
    case 'stelae': {
      // A walled plot with grave stelae and an urn on a pillar.
      f.span('tufa', -2.2, y0, -1.6, 2.2, y0 + 0.6, -1.35, { collide: true });
      f.span('tufa', -2.2, y0, 1.35, 2.2, y0 + 0.6, 1.6, { collide: true });
      for (const s of [-1, 1]) f.span('tufa', s * 2.2 - 0.25 * s, y0, -1.35, s * 2.2, y0 + 0.6, 1.35, { collide: true });
      for (const [x, z, h] of [[-1.3, 0.4, 1.2], [-0.4, 0.6, 1.0], [0.5, 0.3, 1.35], [1.3, 0.7, 0.9]] as const) {
        f.span(stone, x - 0.28, y0, z - 0.07, x + 0.28, y0 + h, z + 0.07);
        f.cyl(stone, x, y0 + h, z, 0.28, 0.14, 8, { rx: Math.PI / 2 });
      }
      f.span('marble', -0.2, y0, -0.6, 0.2, y0 + 1.1, -0.2);
      f.cyl('terracotta', 0, y0 + 1.3, -0.4, 0.17, 0.4, 8, { rTop: 0.1 });
      break;
    }
  }
}

// ---------------------------------------------------------------- grove of the Camenae

/** Makeshift shelters of poles and reed mats among the grove's trees (outside the gate, −x side). */
export function buildGroveCamp(ctx: LandmarkContext, d: Draw, spots: Spots, lamps: Lamp[]) {
  const g = (x: number, z: number) => ctx.groundAt(x, z);
  const sites: [number, number, number][] = [[-18.5, -19.5, 0.4], [-25.0, -16.0, -0.3], [-16.5, -29.5, 0.9]];
  for (const [i, [x, z, ry]] of sites.entries()) {
    const f = d.at(x, g(x, z), z, ry);
    // Lean-to: two forked poles, a ridge pole, a sloping mat of reeds and straw.
    for (const s of [-1, 1]) f.cyl('wood', s * 1.3, 0.85, -0.7, 0.05, 1.7, 5);
    f.rod('wood', { x: -1.4, y: 1.7, z: -0.7 }, { x: 1.4, y: 1.7, z: -0.7 }, 0.045, 5);
    f.tris('dry_grass', [-1.5, 1.72, -0.75, -1.5, 0.05, 1.0, 1.5, 0.05, 1.0, -1.5, 1.72, -0.75, 1.5, 0.05, 1.0, 1.5, 1.72, -0.75]);
    f.tris('dry_grass', [-1.5, 1.72, -0.75, 1.5, 0.05, 1.0, -1.5, 0.05, 1.0, -1.5, 1.72, -0.75, 1.5, 1.72, -0.75, 1.5, 0.05, 1.0]);
    f.solid(-1.5, 0, -0.2, 1.5, 1.2, 1.0);
    // A heap of hay to sleep on, baskets, a cooking fire's ashes.
    f.ellipsoid('dry_grass', 0.2, 0.08, 0.3, 0.9, 0.18, 0.5, { seg: [8, 4] });
    placeProp(f, 'basket', -0.9, 0, -1.1, 0.3, { variant: i % 3, collide: false });
    placeProp(f, 'basket', 1.0, 0, -1.3, 1.2, { variant: (i + 1) % 3, collide: false });
    if (i === 0) {
      f.cyl('rock', 0.3, 0.06, -2.0, 0.42, 0.12, 8);
      f.box('glow_fire', 0.3, 0.14, -2.0, 0.28, 0.05, 0.22, { ry: 0.4 });
      const p = f.point(0.3, 0.4, -2.0);
      lamps.push({ position: p, color: 0xff7a30, intensity: 3.5, distance: 6, flicker: 0.6, night: false, dayScale: 0, glow: 0.22 });
    }
  }
  spots.add('capena-grove-family', 'npc', -18.0, g(-18, -22.3), -22.3, 0.4);
  // Egeria's spring: a rock-cut basin in the grove (the nymph's grotto, now plain).
  const sx = -24.5, sz = -21.5;
  const sf = d.at(sx, g(sx, sz), sz, Math.PI / 2);
  sf.span('rock', -1.4, -0.3, 0.2, 1.4, 1.6, 1.0, { collide: true });
  sf.span('travertine', -1.0, -0.2, -0.9, 1.0, 0.45, 0.25, { collide: true });
  sf.span('water', -0.85, 0.2, -0.75, 0.85, 0.4, 0.15);
  spots.add('capena-egeria-spring', 'shrine', sx + 1.6, g(sx + 1.6, sz), sz, -Math.PI / 2);
}

// ---------------------------------------------------------------- the gate quarter (inside)

interface Lot {
  /** Street side (+1 = +x), frontage z range, depth, storeys, finish, explicit bays. */
  side: 1 | -1;
  z0: number;
  z1: number;
  depth: number;
  storeys: number;
  finish: 'brick' | 'plaster';
  plaster?: MaterialId;
  portico?: boolean;
  bays?: BayKind[];
}

/** The apartment blocks along the urban Via Appia inside the gate (pure, tested). */
export function quarterLots(): Lot[] {
  return [
    { side: -1, z0: 13, z1: 26, depth: 12, storeys: 3, finish: 'plaster', plaster: 'plaster_ochre', bays: ['thermopolium', 'stair', 'wine', 'closed', 'bakery'] },
    { side: -1, z0: 28, z1: 41, depth: 12, storeys: 4, finish: 'brick', bays: ['general', 'pottery', 'stair', 'cobbler', 'textile'] },
    { side: 1, z0: 13, z1: 25, depth: 11, storeys: 3, finish: 'plaster', plaster: 'plaster_cream', portico: true, bays: ['barber', 'stair', 'moneychanger', 'wine'] },
    { side: 1, z0: 27, z1: 41, depth: 12, storeys: 4, finish: 'brick', bays: ['smithy', 'closed', 'stair', 'general', 'butcher'] },
  ];
}

/** The square inside the gate: from the gate's inner face to the first blocks. */
export const SQUARE = { z0: 3.6, z1: 12.5 };

export function buildQuarter(ctx: LandmarkContext, b: MeshBuilder, d: Draw, spots: Spots, lamps: Lamp[], trees: TreeSpec[], zGate: number) {
  const g = (x: number, z: number) => ctx.groundAt(x, z);
  const hi = ctx.detail === 'high';
  // The urban Via Appia: through the square and between the blocks to the streets by the Circus.
  buildStreet(b, { points: [[0, zGate + 0.6], [0, 60], [0.6, 96]], kind: 'paved', roadWidth: 2 * ROAD_HW, sidewalk: SIDEWALK, curb: 0.25, capStart: true, seed: 4, steppingStones: [24, 52] }, g);
  // Paved square either side of the street (travertine flags), from the gate to the first blocks.
  for (const s of [-1, 1]) {
    const x0 = s * PL, x1 = s * 13.5;
    const pts: number[] = [];
    const nz = 6, nx = 6;
    const P = (i: number, j: number) => {
      const x = x0 + ((x1 - x0) * i) / nx, z = SQUARE.z0 + ((SQUARE.z1 - SQUARE.z0) * j) / nz;
      return [x, g(x, z) + 0.28, z];
    };
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = P(i, j), c = P(i + 1, j), e = P(i + 1, j + 1), f = P(i, j + 1);
        if (s > 0) pts.push(...a, ...f, ...e, ...a, ...e, ...c);
        else pts.push(...a, ...e, ...f, ...a, ...c, ...e);
      }
    }
    d.tris('paving_travertine', pts, { uvScale: 2.4 });
    const gr = groundRange(ctx, Math.min(x0, x1), SQUARE.z0, Math.max(x0, x1), SQUARE.z1, 1.5);
    d.solid(Math.min(x0, x1), gr.min - 0.5, SQUARE.z0, Math.max(x0, x1), gr.max + 0.28, SQUARE.z1);
  }
  // Apartment blocks with shops.
  for (const [i, lot] of quarterLots().entries()) {
    const width = lot.z1 - lot.z0;
    const cz = (lot.z0 + lot.z1) / 2;
    const cx = lot.side * (PL + 0.05 + lot.depth / 2);
    // Local insula frame: front (−z) faces the street.
    const rot = lot.side > 0 ? Math.PI / 2 : -Math.PI / 2;
    const c = Math.cos(rot), sn = Math.sin(rot);
    const toLocal = (ix: number, iz: number) => [cx + ix * c + iz * sn, cz - ix * sn + iz * c] as const;
    // Floor at the highest sidewalk point of the frontage.
    let floor = -Infinity;
    for (let k = 0; k <= 6; k++) {
      const z = lot.z0 + (width * k) / 6;
      floor = Math.max(floor, g(lot.side * PL, z) + 0.06 + 0.25);
    }
    const out = insula({
      width,
      depth: lot.depth,
      storeys: lot.storeys,
      seed: 113 + i * 17,
      wealth: 0.35,
      finish: lot.finish,
      plaster: lot.plaster,
      portico: lot.portico,
      bays: lot.bays,
      balcony: i % 2 ? 'partial' : 'none',
      openShopChance: 0.5,
      roof: 'hip',
      sides: { left: true, right: true, back: false },
      groundAt: (ix, iz) => {
        const [x, z] = toLocal(ix, iz);
        return g(x, z) - floor;
      },
      detail: hi ? 'full' : 'mid',
    });
    const m = new THREE.Matrix4().makeTranslation(cx, floor, cz).multiply(new THREE.Matrix4().makeRotationY(rot));
    b.append(out.builder, m);
    // The fabric's 'mid' detail has no colliders: give the block a solid footprint instead.
    if (!hi) new DrawCls(b, m).solid(-width / 2, -1.5, -lot.depth / 2, width / 2, out.height, lot.depth / 2);
    for (const s of out.spots) {
      const p = s.position.clone().applyMatrix4(m);
      const heading = s.facing + rot;
      if (s.kind === 'shopDoor' && s.tag && s.tag !== 'stair') spots.add(`capena-shop-${i}-${s.tag}`, s.tag === 'thermopolium' ? 'vendor' : 'stall', p.x, p.y, p.z, heading);
      else if (s.kind === 'houseDoor' || s.tag === 'stair') spots.add(`capena-door-${i}`, 'door', p.x, p.y, p.z, heading);
    }
    // A lamp over every other shop door, lit at dusk (the shops shut, the popinae stay open).
    for (let k = 0; k < 2; k++) {
      const z = lot.z0 + width * (k === 0 ? 0.22 : 0.72);
      const x = lot.side * (PL + 0.05);
      lamps.push({ position: new THREE.Vector3(x - lot.side * 0.35, floor + 2.75, z), color: 0xffa54f, intensity: k === 0 && i === 0 ? 9 : 5, distance: k === 0 && i === 0 ? 10 : 7, flicker: 0.25, night: true, glow: 0.14 });
    }
  }
  // The popina at the corner of the square (block 0's first bay): sign, awning, benches outside.
  const pop = quarterLots()[0];
  const popZ = pop.z0 + 1.6;
  const popX = -(PL + 0.05);
  paintedSign(b, ['Popina', 'Ad Portam'], 1.6, 0.5, new THREE.Matrix4().makeTranslation(popX + 0.08, g(popX, popZ) + 3.25, popZ + 1.3).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)));
  velum(d.at(popX, g(popX, popZ + 1.3) + 0.3, popZ + 1.3, Math.PI / 2), 2.8, 1.3, 2.9, ['fabric_white', 'fabric_red']);
  placeProp(d, 'bench', -(PL - 0.55), g(-(PL - 0.55), popZ - 1.4) + 0.3, popZ - 1.4, Math.PI / 2, { variant: 1 });
  placeProp(d, 'table', -(PL - 0.6), g(-(PL - 0.6), popZ + 3.5) + 0.3, popZ + 3.5, 0.2, { variant: 0 });
  sleepingDog(d, -(PL - 0.4), g(-(PL - 0.4), popZ + 1.6) + 0.3, popZ + 1.6, 0.8);
  spots.add('capena-popina-patron', 'sit', -(PL - 0.85), g(-(PL - 0.85), popZ - 1.4) + 0.3, popZ - 1.4, Math.PI / 2);
  // The compitum shrine on the square (+x corner), with its lamp burning for the Lares.
  const csx = 8.5, csz = 9.5;
  const cs = d.at(csx, g(csx, csz) + 0.28, csz, Math.PI / 2 + 0.3);
  compitalShrine(cs, new Rng('capena-compitum'));
  const cl = cs.point(0, 1.6, 1.2);
  lamps.push({ position: cl, color: 0xffb060, intensity: 4.5, distance: 6, flicker: 0.3, night: false, dayScale: 0, glow: 0.12 });
  const cp = cs.point(0, 0, -2.0);
  spots.add('capena-compitum', 'shrine', cp.x, cp.y, cp.z, Math.PI / 2 + 0.3);
  // A fountain on the −x side of the square, and the vigiles' night post (brazier, bench, buckets).
  const fx = -9.0, fz = 8.0;
  lacus(d.at(fx, g(fx, fz) + 0.28, fz, -Math.PI / 2), new Rng('capena-lacus-in'), { stone: 'travertine' });
  spots.add('capena-fountain', 'shrine', fx + 1.6, g(fx + 1.6, fz) + 0.28, fz, -Math.PI / 2);
  const vx = 6.0, vz = 5.2;
  placeProp(d, 'brazier', vx, g(vx, vz) + 0.28, vz, 0, { variant: 1 });
  placeProp(d, 'bench', vx + 1.4, g(vx + 1.4, vz) + 0.28, vz + 0.4, -Math.PI / 2, { variant: 0 });
  for (const k of [0, 1, 2]) placeProp(d, 'basket', vx + 2.3, g(vx + 2.3, vz) + 0.28, vz - 0.6 + k * 0.5, 0, { variant: 2, collide: false });
  lamps.push({ position: new THREE.Vector3(vx, g(vx, vz) + 1.2, vz), color: 0xff8a3a, intensity: 10, distance: 11, flicker: 0.55, night: false, dayScale: 0, glow: 0.3 });
  spots.add('capena-vigil', 'npc', vx + 0.9, g(vx + 0.9, vz) + 0.28, vz + 1.2, Math.PI);
  spots.add('capena-vigil-b', 'npc', vx - 1.0, g(vx - 1.0, vz) + 0.28, vz + 0.6, Math.PI * 0.75);
  // Carts waiting their turn to unload before dawn, and a mule standing patient in the traces.
  const cx2 = -10.0, cz2 = 5.0;
  const cf = d.at(cx2, g(cx2, cz2) + 0.28, cz2, -Math.PI / 2 - 0.15);
  placeProp(cf, 'cart', 0, 0, 0, 0, { variant: 1 });
  mule(cf, 0, 0, -2.7, 0);
  placeProp(d, 'amphora_stack', -12.0, g(-12, 10.5) + 0.28, 10.5, 0.3, { variant: 2 });
  placeProp(d, 'sack', -11.2, g(-11.2, 6.2) + 0.28, 6.2, 0.6);
  placeProp(d, 'crate', 11.2, g(11.2, 6.0) + 0.28, 6.0, 0.2, { variant: 1 });
  spots.add('capena-carter', 'npc', cx2 + 1.0, g(cx2 + 1.0, cz2 + 1.2) + 0.28, cz2 + 1.2, -Math.PI / 2);
  // Plane trees shading the square.
  trees.push({ species: 'plane', x: -11.5, z: 4.2, y: g(-11.5, 4.2) + 0.28, scale: 0.75, variant: 1 });
  trees.push({ species: 'plane', x: 11.8, z: 11.2, y: g(11.8, 11.2) + 0.28, scale: 0.7, variant: 2 });
}
