/**
 * Porta Capena (palcirc crew): the old Servian gate where the Via Appia enters Rome, obsolete in 113
 * and built round with houses, with the aqueduct striding over it from the Caelian. The channel
 * leaks: "madidam Capenam" (Juvenal 3.11), "Capena grandi porta qua pluit gutta" (Martial 3.47).
 *
 * Local frame: the gate's outer face looks down the Via Appia (−z, bearing 140); the road runs along
 * z, the city is at +z. The aqueduct arcade runs along x just outside the gate, from the Caelian
 * hillside (−x) over the gate to a terminal castellum (+x). mq-01 starts here at night: the spots
 * `spawn-capena`, `courier-ambush` and `night-cart` are for the quest.
 */
import * as THREE from 'three';
import { Draw } from '../../../arch/fabric/draw';
import { lacus } from '../../../arch/fabric/fountain';
import { wall } from '../../../arch/common/walls';
import { inscriptionPanel } from '../../../arch/common/inscription';
import { placeProp } from '../../../arch/props/props';
import { ivy } from '../../../arch/vegetation/decor';
import { Rng } from '../../../core/Rng';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext } from '../types';
import { Drips, animateDrips, requestLamps } from './palcirc/runtime';
import { archBandLite, archDoorWall } from './palcirc/shapes';
import { Spots, drawFor, gableRoof, groundRange, landmarkToWorld, plantTrees, type TreeSpec } from './palcirc/util';
import { relById } from './palcirc/frames';
import { buildAppia, buildGroveCamp, buildQuarter, type Lamp } from './palcirc/capenaParts';
import { ox } from './palcirc/animals';

/** Gate block half sizes, passage. */
const GX = 4.2;
const GZ = 3.3;
const GH = 6.6;
const SPAN = 3.6;
const SPRING = 3.1;
/** Aqueduct arcade: line z, half thickness, pier width, bay, channel base. */
const AZ = -4.5;
const AT = 0.95;
const PIER = 1.5;
const BAY = 4.2;
const CH = 11.6;
const WIDE_PIER_X = 5.0;

export interface ArcadeBay {
  /** Pier centre x positions either side of the bay. */
  x0: number;
  x1: number;
  /** Clear span and springing height. */
  span: number;
  spring: number;
}

/** Arcade bays from x = xa to xb, with the wide arch over the gate (pure, tested). */
export function capenaArcade(xa = -74, xb = 22): ArcadeBay[] {
  const out: ArcadeBay[] = [];
  const wideSpan = 2 * WIDE_PIER_X - PIER;
  out.push({ x0: -WIDE_PIER_X, x1: WIDE_PIER_X, span: wideSpan, spring: CH - 0.55 - wideSpan / 2 });
  const span = BAY - PIER;
  const spring = CH - 0.55 - span / 2 - 0.2;
  for (let x = -WIDE_PIER_X; x - BAY >= xa; x -= BAY) out.unshift({ x0: x - BAY, x1: x, span, spring });
  for (let x = WIDE_PIER_X; x + BAY <= xb; x += BAY) out.push({ x0: x, x1: x + BAY, span, spring });
  return out;
}

function capena(ctx: LandmarkContext) {
  const { b, d } = drawFor(ctx);
  const spots = new Spots();
  const rng = new Rng('porta-capena');
  const hi = ctx.detail === 'high';
  const g = (x: number, z: number) => ctx.groundAt(x, z);

  const lamps: Lamp[] = [];
  const trees: TreeSpec[] = [];

  // ------------------------------------------------------------ the Via Appia: tombs outside, the gate quarter inside
  buildAppia(ctx, b, d, spots, lamps, trees, -GZ);
  buildGroveCamp(ctx, d, spots, lamps);
  buildQuarter(ctx, b, d, spots, lamps, trees, GZ);
  d.span('paving_basalt', -SPAN / 2, -0.4, -GZ - 0.7, SPAN / 2, 0.05, GZ + 0.7, { collide: true });

  // ------------------------------------------------------------ gate block (tufa ashlar, travertine arch)
  const gb = d.at(0, 0, -GZ);
  gb.geo(archDoorWall(2 * GX, GH, SPAN, SPRING, 2 * GZ, hi ? 10 : 6), 'tufa');
  // Footing on the downhill side.
  const gr = groundRange(ctx, -GX, -GZ, GX, GZ);
  if (gr.min < -0.05) d.span('tufa', -GX, gr.min - 0.5, -GZ, GX, 0, GZ);
  // Colliders: the two piers and the solid above the passage.
  d.solid(-GX, gr.min - 0.5, -GZ, -SPAN / 2, GH, GZ);
  d.solid(SPAN / 2, gr.min - 0.5, -GZ, GX, GH, GZ);
  d.solid(-SPAN / 2, SPRING + SPAN / 2, -GZ, SPAN / 2, GH, GZ);
  // Travertine voussoirs and imposts on both faces (a later facing of the old arch), keystones.
  for (const [z, rot] of [[-GZ, 0], [GZ, Math.PI]] as const) {
    const f = d.at(0, 0, z, rot);
    f.geo(archBandLite(SPAN / 2, SPAN / 2 + 0.55, SPRING, 0.08, hi ? 8 : 5), 'travertine');
    f.box('travertine', 0, SPRING + SPAN / 2 + 0.32, -0.1, 0.5, 0.7, 0.2);
    for (const s of [-1, 1]) f.box('travertine', s * (SPAN / 2 + 0.35), SPRING - 0.12, -0.06, 0.8, 0.24, 0.14);
    // Crowning cornice and a low parapet (the gate is no longer manned).
    f.box('travertine', 0, GH - 0.2, -0.12, 2 * GX + 0.3, 0.4, 0.3);
  }
  d.span('tufa', -GX, GH, -GZ + 0.2, GX, GH + 0.7, -GZ + 0.8);
  d.span('tufa', -GX, GH, GZ - 0.8, GX, GH + 0.7, GZ - 0.2);
  // Old door pivots (the leaves are long gone) and wet stains in the passage.
  for (const s of [-1, 1]) d.cyl('iron', s * (SPAN / 2 - 0.05), 0.6, -GZ + 0.9, 0.06, 0.12, 6);

  // ------------------------------------------------------------ tower (−x side)
  const tx0 = -9.6, tx1 = -GX, tz0 = -GZ + 0.3, tz1 = GZ - 0.6;
  const tg = groundRange(ctx, tx0, tz0, tx1, tz1);
  const TH = 9.4;
  d.span('tufa', tx0, Math.min(0, tg.min) - 0.5, tz0, tx1, TH, tz1, { collide: true });
  d.span('travertine', tx0 - 0.1, TH - 0.35, tz0 - 0.1, tx1 + 0.05, TH, tz1 + 0.1);
  gableRoof(d, tx0, tz0, tx1, tz1, TH, { axis: 'x', pitch: 0.42, over: 0.35, gables: 'tufa' });
  for (const z of [tz0 - 0.01, tz1 + 0.01]) {
    for (const x of [tx0 + 1.6, tx1 - 1.6]) d.span('black', x - 0.35, 6.4, z - 0.01, x + 0.35, 7.5, z + 0.01);
  }
  d.span('wood_dark', tx1 - 0.02, 0, -0.6, tx1 + 0.02, 2.3, 0.6);

  // ------------------------------------------------------------ Servian wall stubs
  const WT = 2.4;
  const WH = 6.0;
  const wallRun = (x0: number, x1: number, broken: 'left' | 'right') => {
    const len = Math.abs(x1 - x0);
    const xs = Math.min(x0, x1);
    const wr = groundRange(ctx, xs, -WT / 2, xs + len, WT / 2);
    const base = Math.min(0, wr.min) - 0.6;
    const m = new THREE.Matrix4().makeTranslation(xs, base, 0);
    wall(b, { length: len, height: WH - base, thickness: WT, material: 'tufa', courses: 0.6, collide: true, detail: ctx.detail }, m);
    // Broken, stepped end where houses have eaten into it.
    const xe = broken === 'left' ? xs : xs + len;
    const dir = broken === 'left' ? 1 : -1;
    for (let k = 0; k < 3; k++) d.span('tufa', xe + dir * k * 0.9 - (dir < 0 ? 0.9 : 0), WH, -WT / 2, xe + dir * (k + 1) * 0.9 - (dir < 0 ? 0.9 : 0), WH + 0.6 * (3 - k), WT / 2);
    // Ivy on the outer face.
    if (hi) ivy(new Draw(b, new THREE.Matrix4().makeTranslation(0, 0, -WT / 2 - 0.02)), xs + 1, len - 2, Math.max(0, g(xs + len / 2, -2)), 3.5, rng);
  };
  wallRun(-26, tx0, 'left');
  wallRun(GX, 22, 'right');
  // Houses built against the inner face at both ends (the wall is "built over" in 113).
  house(d, ctx, -27.0, WT / 2, -16.5, WT / 2 + 7.5, 7.2, 'plaster_ochre');
  house(d, ctx, 16.0, WT / 2, 24.0, WT / 2 + 7.0, 6.6, 'plaster_cream');

  // ------------------------------------------------------------ aqueduct arcade
  const bays = capenaArcade();
  const piers = new Set<number>();
  for (const bay of bays) {
    piers.add(+bay.x0.toFixed(3));
    piers.add(+bay.x1.toFixed(3));
  }
  const pierMat: MaterialId = 'peperino';
  for (const px of piers) {
    const pg = groundRange(ctx, px - PIER / 2, AZ - AT, px + PIER / 2, AZ + AT);
    const y0 = Math.min(pg.min, CH) - 0.8;
    d.span(pierMat, px - PIER / 2, y0, AZ - AT, px + PIER / 2, CH - 0.55, AZ + AT, { collide: true });
    // Plinth and impost.
    d.span('travertine', px - PIER / 2 - 0.12, y0, AZ - AT - 0.12, px + PIER / 2 + 0.12, Math.max(y0 + 0.9, pg.max + 0.4), AZ + AT + 0.12);
  }
  for (const bay of bays) {
    const cx = (bay.x0 + bay.x1) / 2;
    const w = bay.x1 - bay.x0 - PIER;
    const top = CH - 0.55;
    // Arch: a slab with an arched opening between the piers (only the part above the springing).
    const ah = top - bay.spring;
    const m = d.at(cx, bay.spring, AZ - AT);
    m.geo(archDoorWall(w + 0.6, ah, bay.span, 0.01, 2 * AT, hi ? 9 : 5), pierMat);
    for (const [z, rot] of [[AZ - AT, 0], [AZ + AT, Math.PI]] as const) {
      d.at(cx, 0, z, rot).geo(archBandLite(bay.span / 2, bay.span / 2 + 0.45, bay.spring, 0.06, hi ? 8 : 5), 'travertine');
    }
    d.solid(cx - w / 2, bay.spring + bay.span / 2 - 0.1, AZ - AT, cx + w / 2, top, AZ + AT);
  }
  // Channel (specus) on top: side walls, cover slabs; string course below.
  const xa = bays[0].x0 - PIER / 2;
  const xb = bays[bays.length - 1].x1 + PIER / 2;
  d.span('travertine', xa, CH - 0.55, AZ - AT - 0.15, xb, CH, AZ + AT + 0.15);
  d.span('reticulatum', xa, CH, AZ - AT, xb, CH + 1.35, AZ - AT + 0.45);
  d.span('reticulatum', xa, CH, AZ + AT - 0.45, xb, CH + 1.35, AZ + AT);
  d.span('concrete', xa, CH, AZ - AT + 0.45, xb, CH + 0.35, AZ + AT - 0.45);
  d.span('water', xa, CH + 0.35, AZ - AT + 0.45, xb, CH + 0.62, AZ + AT - 0.45);
  for (let x = xa; x < xb - 0.1; x += 1.2) d.span('travertine', x + 0.02, CH + 1.35, AZ - AT - 0.05, Math.min(xb, x + 1.18), CH + 1.6, AZ + AT + 0.05);
  // The hillside end: the channel emerges from a masonry abutment cut into the Caelian.
  d.span('reticulatum', xa - 3, Math.min(g(xa - 1.5, AZ), CH) - 1, AZ - AT - 0.3, xa + 0.2, CH + 1.6, AZ + AT + 0.3, { collide: true });
  // Terminal castellum (distribution tank) at the +x end.
  const cx0 = xb - 0.2, cx1 = xb + 6.0, cz0 = AZ - 2.6, cz1 = AZ + 2.6;
  const cgr = groundRange(ctx, cx0, cz0, cx1, cz1);
  d.span('brick', cx0, cgr.min - 0.5, cz0, cx1, CH + 2.0, cz1, { collide: true });
  // Travertine socle, corner quoins and string courses; a cornice and a low tiled roof.
  d.span('travertine', cx0 - 0.12, cgr.min - 0.5, cz0 - 0.12, cx1 + 0.12, cgr.max + 1.2, cz1 + 0.12);
  for (const x of [cx0 - 0.06, cx1 - 0.6]) for (const z of [cz0 - 0.06, cz1 - 0.6]) d.span('travertine', x, cgr.max + 1.2, z, x + 0.66, CH + 1.8, z + 0.66);
  for (const y of [cgr.max + 5.2, CH - 0.55]) d.span('travertine', cx0 - 0.1, y, cz0 - 0.1, cx1 + 0.1, y + 0.3, cz1 + 0.1);
  d.span('travertine', cx0 - 0.15, CH + 1.8, cz0 - 0.15, cx1 + 0.15, CH + 2.15, cz1 + 0.15);
  gableRoof(d, cx0, cz0, cx1, cz1, CH + 2.15, { axis: 'x', pitch: 0.35, over: 0.3, gables: 'brick' });
  for (const z of [cz0 - 0.01]) for (const x of [cx0 + 1.5, cx1 - 1.5]) d.span('black', x - 0.3, cgr.max + 6.4, z - 0.01, x + 0.3, cgr.max + 7.8, z + 0.01);
  // The public outlet on the side toward the road: an arched niche, a spout and a stone basin.
  const nf = d.at(cx0, Math.max(0, g(cx0 - 1, AZ)), AZ, Math.PI / 2);
  nf.span('travertine', -1.2, 0, -0.12, 1.2, 3.4, 0.02);
  nf.span('black', -0.75, 0.9, -0.14, 0.75, 2.6, -0.12);
  nf.cyl('travertine', 0, 2.6, -0.13, 0.75, 0.02, 10, { rx: Math.PI / 2 });
  nf.cyl('bronze', 0, 1.75, -0.35, 0.06, 0.45, 6, { rx: Math.PI / 2 });
  nf.span('travertine', -1.1, 0, -1.4, 1.1, 0.75, -0.25, { collide: true });
  nf.span('water', -0.95, 0.5, -1.27, 0.95, 0.68, -0.38);
  nf.cyl('water', 0, 1.15, -0.62, 0.03, 1.15, 5, { rx: 0.18 });
  // Lead pipes leaving the castellum toward the city.
  for (const z of [cz1 - 1.6, cz1 - 0.9]) d.cyl('lead', cx0 + 2 + (z - cz1) * 0.5, cgr.max + 0.6, z + 1.8, 0.09, 2.6, 6, { rx: Math.PI / 2 });

  // ------------------------------------------------------------ the leak: drips, stains, puddles, moss
  const wide = bays.find((bb) => bb.x0 === -WIDE_PIER_X)!;
  const r = wide.span / 2;
  const emitters: { x: number; y: number; z: number; floor: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const x = -r * 0.85 + ((2 * r * 0.85) * i) / 11 + rng.range(-0.15, 0.15);
    const y = wide.spring + Math.sqrt(Math.max(0, r * r - x * x)) - 0.08;
    const z = AZ + rng.range(-0.7, 0.7);
    emitters.push({ x, y, z, floor: Math.max(0, g(x, z)) + 0.05 });
  }
  // A thin curtain off the outer edge of the channel's cornice, and drips inside the gate passage.
  for (let i = 0; i < 6; i++) {
    const x = rng.range(-3.5, 3.5);
    emitters.push({ x, y: CH - 0.6, z: AZ - AT - 0.2, floor: Math.max(0, g(x, AZ - AT - 0.2)) + 0.05 });
  }
  for (let i = 0; i < 5; i++) {
    const x = rng.range(-1.2, 1.2);
    const z = rng.range(-GZ + 0.5, GZ - 0.5);
    emitters.push({ x, y: SPRING + Math.sqrt(Math.max(0, (SPAN / 2) ** 2 - x * x)) - 0.05, z, floor: 0.06 });
  }
  const drips = new Drips(emitters, 3);
  // Wet streaks down the arch faces and piers, darker stones, moss.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const x = s * (WIDE_PIER_X - 0.4 + rng.range(-0.3, 0.3));
      const h = rng.range(3, 7);
      d.span('mud', x - rng.range(0.1, 0.25), CH - 0.6 - h, AZ - AT - 0.015, x + rng.range(0.1, 0.25), CH - 0.6, AZ - AT - 0.005);
    }
    d.span('grass', s * WIDE_PIER_X - 0.6, CH - 0.7, AZ - AT - 0.03, s * WIDE_PIER_X + 0.6, CH - 0.5, AZ - AT);
  }
  for (let k = 0; k < 7; k++) {
    const x = rng.range(-GX + 0.4, GX - 0.4);
    const h = rng.range(1.5, 4.5);
    d.span('mud', x - 0.12, GH - h, -GZ - 0.012, x + 0.12, GH - 0.3, -GZ - 0.004);
  }
  // Puddles on the road under the arch and in the passage.
  for (const [x, z, rx, rz] of [[0.4, AZ, 1.6, 0.9], [-1.0, AZ + 1.4, 0.8, 0.6], [0.6, -1.0, 0.9, 1.4], [-0.5, 1.6, 0.6, 0.8]] as const) {
    const y = Math.max(0, g(x, z));
    d.ellipsoid('mud', x, y + 0.035, z, rx * 1.25, 0.012, rz * 1.25, { seg: [12, 3] });
    d.ellipsoid('water', x, y + 0.045, z, rx * 0.7, 0.008, rz * 0.7, { seg: [10, 3] });
  }

  // ------------------------------------------------------------ outside: Mercury's spring, customs, cart
  const fz = -13;
  const fx = -8.5;
  const fd = d.at(fx, Math.max(0, g(fx, fz)), fz, Math.PI / 2);
  lacus(fd, new Rng('capena-lacus'), { stone: 'travertine' });
  placeProp(d, 'herm', fx - 1.6, g(fx - 1.6, fz), fz, Math.PI / 2, { variant: 1 });
  // Customs booth (statio of the portitores) on the +x side.
  const bx = 6.6, bz = -11;
  const by = Math.max(0, g(bx, bz));
  const bd = d.at(bx, by, bz, -Math.PI / 2);
  bd.span('wood', -1.6, 0, -1.2, 1.6, 0.06, 1.2, { collide: true });
  bd.span('wood_dark', -1.6, 0, 0.9, 1.6, 2.4, 1.2, { collide: true });
  for (const s of [-1, 1]) bd.span('wood_dark', s * 1.6 - 0.12, 0, -1.2, s * 1.6 + 0.12, 2.4, 1.2, { collide: true });
  bd.span('wood', -1.4, 0, -1.2, 1.4, 1.0, -0.9, { collide: true });
  gableRoof(bd, -1.7, -1.4, 1.7, 1.3, 2.4, { axis: 'x', pitch: 0.4, over: 0.2 });
  placeProp(bd, 'oil_lamp', 0.9, 1.0, -1.05, 0, { collide: false });
  placeProp(bd, 'bench', 0, 0, 1.7, Math.PI, { variant: 0 });
  // The last night cart, loaded with wine, its oxen yoked and facing the gate: in before dawn.
  const cartZ = -11.0, cartX = 1.0;
  const cy = Math.max(0, g(cartX, cartZ - 1.5));
  const cart = d.at(cartX, cy, cartZ, Math.PI);
  placeProp(cart, 'cart', 0, 0, 0, 0, { variant: 0 });
  for (const s of [-1, 1]) ox(cart, s * 0.55, Math.max(0, g(cartX - s * 0.55, cartZ + 2.9)) - cy, -2.9, s * 0.05, s > 0 ? 'wood_dark' : 'bark');
  placeProp(d, 'amphora_stack', cartX + 3.2, Math.max(0, g(cartX + 3.2, cartZ - 3)), cartZ - 3, 0.4, { variant: 1 });
  placeProp(d, 'sack', cartX + 2.1, Math.max(0, g(cartX + 2.1, cartZ - 0.5)), cartZ - 0.5, 0.2);
  // The carter's lantern hung on the cart's side.
  lamps.push({ position: cart.point(0.72, 1.45, -0.6), color: 0xffa54f, intensity: 5, distance: 8, flicker: 0.3, night: true, glow: 0.16 });
  cart.cyl('bronze', 0.72, 1.4, -0.6, 0.07, 0.18, 6);
  // Torches at the gate (both faces) and a lantern on the booth.
  for (const [z, rot] of [[-GZ, 0], [GZ, Math.PI]] as const) {
    for (const s of [-1, 1]) {
      const x = s * (SPAN / 2 + 0.75);
      const fz2 = z === -GZ ? z - 0.02 : z + 0.02;
      placeProp(d.at(x, 2.6, fz2, rot), 'torch_bracket', 0, 0, 0, 0, { collide: false });
      lamps.push({ position: new THREE.Vector3(x, 3.4, z + (z < 0 ? -0.35 : 0.35)), color: 0xff9329, intensity: 16, distance: 13, flicker: 0.45, night: true, glow: 0.35 });
    }
  }
  lamps.push({ position: new THREE.Vector3(bx + 1.05, by + 1.2, bz - 0.9), color: 0xffa54f, intensity: 6, distance: 7, flicker: 0.25, night: true, glow: 0.18 });
  // Inscription on the arcade's outer face over the gate (a marker of the Marcian water).
  inscriptionPanel(b, { lines: ['Aqua Marcia'], width: 2.6, height: 0.55, style: 'carved', border: true }, new THREE.Matrix4().makeTranslation(0, CH - 0.28, AZ - AT - 0.16), { depth: 0.08, bodyMaterial: 'travertine' });
  // Grove of the Camenae outside the gate: cypresses and pines either side of the road.
  for (const [x, z, sp, sc] of [[-14, -20, 'cypress', 1.1], [-17, -14, 'umbrella_pine', 1.0], [-12, -26, 'cypress', 1.0], [14, -20, 'umbrella_pine', 1.05], [11, -27, 'cypress', 0.95], [18, -14, 'cypress', 1.1], [-22, -24, 'laurel', 0.9]] as const) {
    trees.push({ species: sp, x, z, scale: sc, variant: Math.abs(x) % 3 });
  }
  const trunks = plantTrees(ctx, trees);
  for (const t of trunks) b.collider(t);

  // ------------------------------------------------------------ spots
  const vista = relById('porta-capena', 'circus-maximus');
  const head = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
  spots.add('spawn-capena', 'spawn', -0.9, Math.max(0, g(-0.9, -15)), -15, 0);
  spots.add('courier-ambush', 'npc', 1.1, Math.max(0, g(1.1, -5.5)), -5.5, Math.PI * 0.85);
  spots.add('capena-grassator-a', 'npc', -WIDE_PIER_X - 1.4, Math.max(0, g(-6.4, -6.6)), -6.6, head(-6.4, -6.6, 0, -5.5));
  spots.add('capena-grassator-b', 'npc', 2.2, 0, 2.6, head(2.2, 2.6, 0, -2));
  spots.add('night-cart', 'container', cartX - 1.1, Math.max(0, g(cartX - 1.1, cartZ)), cartZ, Math.PI / 2);
  spots.add('night-cart-driver', 'npc', cartX + 1.2, Math.max(0, g(cartX + 1.2, cartZ + 3.4)), cartZ + 3.4, 0);
  spots.add('capena-customs', 'vendor', bx, by, bz, -Math.PI / 2);
  spots.add('capena-mercury-spring', 'shrine', fx + 1.4, Math.max(0, g(fx + 1.4, fz)), fz, -Math.PI / 2);
  spots.add('porta-capena-arch', 'inscription', 0, Math.max(0, g(0, -12)), -12, 0);
  spots.add('capena-vista-city', 'vista', 0, 0, 10, head(0, 10, vista.x, vista.z));
  spots.add('capena-door-tower', 'door', tx1 + 0.05, 0, 0, Math.PI / 2);
  spots.add('capena-castellum-outlet', 'shrine', cx0 - 2.2, Math.max(0, g(cx0 - 2.2, AZ)), AZ, Math.PI / 2);

  const obj = b.build(ctx.lm.id);
  obj.add(drips.mesh);
  animateDrips(ctx.game, drips);
  requestLamps(ctx.game, landmarkToWorld(ctx), lamps);
  return { object: obj, colliders: b.colliders, spots: spots.list, cullDistance: 1200 };
}

/** A small two-storey house built against the wall (plaster, shop front, tile roof). */
function house(d: Draw, ctx: LandmarkContext, x0: number, z0: number, x1: number, z1: number, h: number, mat: MaterialId) {
  const gr = groundRange(ctx, x0, z0, x1, z1);
  const base = Math.min(0, gr.min) - 0.4;
  const fl = gr.max;
  d.span(mat, x0, base, z0, x1, fl + h, z1, { collide: true });
  d.span('plaster_red', x0 - 0.02, base, z1 - 0.01, x1 + 0.02, fl + 1.1, z1 + 0.02);
  gableRoof(d, x0, z0, x1, z1, fl + h, { axis: 'x', pitch: 0.35, over: 0.4, gables: mat });
  // Windows and a shuttered shop on the street side (+z), facing the inside of the city.
  const n = Math.max(2, Math.floor((x1 - x0) / 2.6));
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * (i + 0.5)) / n;
    d.span('black', x - 0.4, fl + 3.6, z1 + 0.01, x + 0.4, fl + 4.6, z1 + 0.03);
    d.span('wood_painted', x - 0.65, fl + 3.55, z1 + 0.02, x - 0.42, fl + 4.65, z1 + 0.06);
  }
  d.span('wood', (x0 + x1) / 2 - 1.4, fl, z1 + 0.01, (x0 + x1) / 2 + 1.4, fl + 2.6, z1 + 0.06);
}

export const builders: LandmarkBuilder[] = [{ handles: ['porta-capena'], build: capena }];
