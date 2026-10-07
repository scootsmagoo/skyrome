/**
 * The Janiculum crest: the terminal of the Aqua Traiana (dedicated AD 109) and the mill race down
 * its east slope into Transtiberim.
 * - aqua-traiana-terminus: the castellum, a brick-faced distribution tank under a tiled roof, with
 *   Trajan's dedication (CIL VI 1260: "aquam Traianam pecunia sua in urbem perduxit", TR POT XIII
 *   = 109) over the outfall. The channel (specus) arrives from the west on a low arched wall; the
 *   water leaves eastward into the mill race.
 * - The mill race (atlas AQUEDUCTS 'janiculum-mill-race', which the city fabric leaves to this
 *   builder): an open stone channel stepping down the slope; at each drop a mill house turns a
 *   water wheel. FLAG (atlas): most excavated mills are later; some milling from the start is
 *   plausible.
 */
import * as THREE from 'three';
import { AQUEDUCTS } from '../../../data/atlas';
import type { Draw } from '../../../arch/fabric/draw';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { dims, draw, farDraw, finish, inscription, liftAll, piercedWall, spot, tiledRoof, type Detail } from './generic-common';
import { tree } from './generic-world';
import { localOf } from './generic-venues';

/** A water wheel standing in a channel: rim, spokes and paddles, axle across the race. */
function waterWheel(d: Draw, r: number, width: number, detail: Detail) {
  const spokes = detail === 'high' ? 8 : 6;
  const paddles = detail === 'high' ? 16 : 10;
  // The wheel turns in the local x–y plane (its axle along x, across the race).
  for (const side of [-1, 1]) {
    const rim = new THREE.TorusGeometry(r, 0.07, 4, detail === 'high' ? 24 : 14);
    rim.rotateY(Math.PI / 2);
    d.geo(rim, 'wood_dark', (side * width) / 2, 0, 0);
  }
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI;
    for (const side of [-1, 1]) d.rod('wood', { x: (side * width) / 2, y: -Math.sin(a) * r, z: -Math.cos(a) * r }, { x: (side * width) / 2, y: Math.sin(a) * r, z: Math.cos(a) * r }, 0.05, 4);
  }
  for (let i = 0; i < paddles; i++) {
    const a = (i / paddles) * Math.PI * 2;
    d.sub(new THREE.Matrix4().makeTranslation(0, Math.sin(a) * r, Math.cos(a) * r).multiply(new THREE.Matrix4().makeRotationX(-a))).box('wood', 0, 0, 0, width, 0.04, 0.32);
  }
  d.rod('iron', { x: -width / 2 - 0.5, y: 0, z: 0 }, { x: width / 2 + 0.5, y: 0, z: 0 }, 0.09, 6);
}

/** A small mill house: brick walls, a door to the lane side, a tiled roof (local frame: race along z). */
function millHouse(d: Draw, side: 1 | -1, y: number, detail: Detail) {
  const w = 4.2, l = 5.2, h = 3.4;
  const x0 = side > 0 ? 1.4 : -1.4 - w;
  const x1 = x0 + w;
  d.span('brick', x0, y - 0.6, -l / 2, x1, y + h, l / 2, { collide: true });
  const door = side > 0 ? x1 + 0.01 : x0 - 0.01;
  d.box('wood_dark', door, y + 1.0, 0, 0.06, 2.0, 1.1);
  tiledRoof(d, 'gable', (x0 + x1) / 2, 0, w, l, y + h, detail, { axis: 'z', overhang: 0.35 });
}

function buildAquaTraiana(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const rng = ctx.rng.fork('janiculum');
  const spots: Spot[] = [];
  const g = (x: number, z: number) => ctx.groundAt(x, z);
  const { w, d: dd } = dims(ctx);
  // Local frame: the facade (east, toward the city) faces −z; the channel arrives from +z.
  const y0 = Math.min(g(-w / 2, -dd / 2), g(w / 2, -dd / 2), g(-w / 2, dd / 2), g(w / 2, dd / 2));
  const H = Math.max(5, lm.height * ctx.S);
  // ---- the castellum
  d.span('concrete', -w / 2, y0 - 1.5, -dd / 2, w / 2, y0 + 0.4, dd / 2, { collide: true });
  d.span('brick', -w / 2 + 0.3, y0 + 0.4, -dd / 2 + 0.3, w / 2 - 0.3, y0 + H, dd / 2 - 0.3, { collide: true });
  // Pilasters and a cornice in travertine.
  for (const x of [-w / 2 + 0.3, -w / 6, w / 6, w / 2 - 0.3]) for (const z of [-dd / 2 + 0.25, dd / 2 - 0.25]) d.box('travertine', x, y0 + 0.4 + (H - 0.4) / 2, z, 0.7, H - 0.4, 0.3);
  d.span('travertine', -w / 2, y0 + H, -dd / 2, w / 2, y0 + H + 0.45, dd / 2);
  tiledRoof(d, 'hip', 0, 0, w + 0.6, dd + 0.6, y0 + H + 0.45, detail, { overhang: 0.3 });
  // The dedication over the outfall (east face).
  inscription(d, ['IMP CAESAR DIVI NERVAE F NERVA TRAIANVS', 'AVG GERM DACICVS PONTIF MAX TRIB POTEST XIII', 'IMP VI COS V P P AQVAM TRAIANAM', 'PECVNIA SVA IN VRBEM PERDVXIT'], 0, y0 + H - 1.6, -dd / 2 + 0.28, Math.min(w - 2, 8), 1.7, Math.PI);
  // The outfall: water pours from an arched mouth into the head of the race.
  d.span('travertine', -0.9, y0 + 0.4, -dd / 2 - 0.05, 0.9, y0 + 1.9, -dd / 2 + 0.2);
  d.span('water', -0.6, y0 + 0.5, -dd / 2 - 0.12, 0.6, y0 + 1.6, -dd / 2 - 0.06);
  // ---- the arriving channel: a covered specus on a low arched wall from the west (+z).
  const runLen = Math.min(40, 30 + dd);
  const chY = y0 + H * 0.6;
  for (let z = dd / 2; z < dd / 2 + runLen; z += 4) {
    const gy = Math.min(g(0, z), g(0, z + 4));
    // An arch through the wall where it stands high enough above the slope.
    const openings = chY - gy > 2.6 ? [{ x: 2, w: 2.2, h: chY - gy - 1.0, sill: 0.8, arched: true }] : [];
    piercedWall(d, 0, z, 0, z + 4, gy - 0.8, chY, 1.6, 'brick', openings, true);
    d.span('concrete', -1.0, chY, z, 1.0, chY + 0.9, z + 4);
  }
  // ---- the mill race down the east slope (atlas 'janiculum-mill-race')
  const race = AQUEDUCTS.find((a) => a.id === 'janiculum-mill-race');
  const pts = race ? race.points.map((p) => localOf(ctx, { center: p })) : [];
  // The race starts at the outfall.
  if (pts.length) pts[0] = { x: 0, z: -dd / 2 - 0.2 };
  let mills = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const L = Math.hypot(dx, dz);
    const rot = Math.atan2(dx, dz);
    const n = Math.max(2, Math.ceil(L / 3));
    // Short level reaches following the ground, a small drop between them.
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const x0 = a.x + dx * t0, z0 = a.z + dz * t0, x1 = a.x + dx * t1, z1 = a.z + dz * t1;
      // Each reach follows the slope (tilted), set a little into the ground.
      const ya = g(x0, z0), yb = g(x1, z1);
      const len = L / n + 0.05;
      const pitch = Math.atan2(yb - ya, L / n);
      const seg = d.at((x0 + x1) / 2, (ya + yb) / 2 + 0.15, (z0 + z1) / 2, rot).sub(new THREE.Matrix4().makeRotationX(-pitch));
      // Channel: two stone walls and a floor, water a little under the brim.
      seg.box('tufa', 0, -0.35, 0, 2.0, 0.3, len);
      for (const s of [-1, 1]) seg.box('tufa', s * 0.85, 0.05, 0, 0.3, 0.8, len, { collide: true });
      seg.box('water', 0, 0.2, 0, 1.4, 0.04, len);
    }
    // At the end of each reach but the last, a drop that turns a mill.
    if (k + 1 < pts.length - 1 || pts.length === 2) {
      const y = g(b.x, b.z);
      const m = d.at(b.x, y, b.z, rot);
      m.box('water', 0, 0.4, 0, 1.3, 1.6, 0.08);
      const wheel = m.sub(new THREE.Matrix4().makeTranslation(0, 1.2, 0.6));
      waterWheel(wheel, 1.5, 0.9, detail);
      millHouse(m, mills % 2 ? -1 : 1, y, detail);
      spots.push(spot(`${lm.id}:mill-${mills}`, 'npc', b.x + (mills % 2 ? -2 : 2), y, b.z, rot));
      mills++;
    }
  }
  // Pines and cypresses on the crest round the castellum.
  for (let i = 0; i < 6; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(w * 0.9, w * 1.6);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 3 && z > 0) continue; // not on the channel
    tree(ctx, d, i % 2 ? 'cypress' : 'umbrella_pine', x, g(x, z), z, rng.range(9, 13));
  }
  spots.push(
    spot(`${lm.id}:outfall`, 'vista', 2.5, y0 + 0.5, -dd / 2 - 3, Math.PI),
    spot(`${lm.id}:crest`, 'vista', -w / 2 - 4, g(-w / 2 - 4, 0), 0, Math.PI),
  );
  far.span('brick', -w / 2, y0, -dd / 2, w / 2, y0 + H + 1.2, dd / 2);
  return finish(lm.id, d, spots, far, 700);
}

export const builders: LandmarkBuilder[] = liftAll([{ handles: ['aqua-traiana-terminus'], build: buildAquaTraiana }]);
