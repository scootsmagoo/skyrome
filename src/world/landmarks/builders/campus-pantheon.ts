/**
 * The Pantheon site in May 113 and the Basilica of Neptune behind it.
 *
 * Agrippa's Pantheon, restored by Domitian, was gutted by lightning-fire in 110 (Orosius 7.12).
 * Brick stamps put the start of the new building c. 114, with the site being cleared since 110
 * (docs/research/architecture.md §3.26). So: the fire-blackened shell of the old porch still stands
 * at the north end — a few charred columns carrying a scrap of architrave, fallen drums, the tall
 * cracked pronaos wall with its empty doorway, and Agrippa's inscription lying in the forecourt —
 * while to the south the great ring foundation of the new rotunda (7.3 m wide) is being cast and
 * the first courses of the brick-faced drum are rising behind scaffolding, with a timber centring
 * over the first relieving arch, two treadwheel cranes, stacks of stamped bricks, marble blocks
 * and the first granite shafts, a lime pit, sand, timber, an ox-cart and a hoarding round it all.
 */
import * as THREE from 'three';
import { column } from '../../../arch/classical/column';
import { diameterForHeight } from '../../../arch/classical/orders';
import { scaffolding, treadwheelCrane } from '../../../arch/fabric/construction';
import type { Draw } from '../../../arch/fabric/draw';
import { placeProp } from '../../../arch/props';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import {
  T, V, arc, dims, draw, farDraw, finish, flight, inscription, mul, piercedWall, plinth, spot, statueOnPedestal, tiledRoof, wallRun, type Detail,
} from './generic-common';
import { liteColumnAt } from './generic-civic-lib';
import { ribbonWall } from './generic-seating';

const AGRIPPA = ['M AGRIPPA L F COS TERTIVM FECIT'];

/** A column shaft lying on the ground along `rot` (yaw), broken into drums with small gaps. */
function fallenShaft(d: Draw, x: number, y: number, z: number, rot: number, len: number, r: number, mat: MaterialId, pieces: number, rng: { range(a: number, b: number): number }) {
  const f = d.at(x, y, z, rot);
  let s = -len / 2;
  const seg = len / pieces;
  for (let i = 0; i < pieces; i++) {
    const l = seg - rng.range(0.05, 0.3);
    const off = rng.range(-0.25, 0.25);
    f.cyl(mat, s + l / 2, r, off, r, l, 12, { rz: Math.PI / 2, ry: rng.range(-0.08, 0.08) });
    f.solid(s, 0, off - r, s + l, 2 * r, off + r);
    s += seg;
  }
}

/** A pallet of stamped bricks: rows of brick cubes on a timber skid. */
function brickStack(d: Draw, x: number, y: number, z: number, rot: number) {
  const f = d.at(x, y, z, rot);
  f.box('wood_dark', 0, 0.06, 0, 1.3, 0.12, 1.0);
  f.box('brick', 0, 0.12 + 0.45, 0, 1.2, 0.9, 0.9, { collide: true });
  f.box('terracotta', 0.3, 1.02 + 0.05, 0, 0.6, 0.1, 0.9);
}

/** A squared marble block with a lewis hole on top. */
function marbleBlock(d: Draw, x: number, y: number, z: number, rot: number, w: number, h: number, l: number, mat: MaterialId = 'marble') {
  const f = d.at(x, y, z, rot);
  f.box('wood_dark', 0, 0.08, 0, w * 0.9, 0.16, 0.3);
  f.box(mat, 0, 0.16 + h / 2, 0, w, h, l, { collide: true });
  f.box('black', 0, 0.16 + h + 0.005, 0, 0.12, 0.01, 0.3);
}

/** Timber centring for an arch of radius r (a half-ring with struts), its springing at y. */
function centring(d: Draw, x: number, y: number, z: number, rot: number, r: number, depth: number) {
  const f = d.at(x, y, z, rot);
  for (const zz of [-depth / 2 + 0.15, depth / 2 - 0.15]) {
    f.geo(new THREE.TorusGeometry(r - 0.15, 0.12, 5, 16, Math.PI), 'wood', 0, 0, zz);
    for (let i = 0; i <= 6; i++) {
      const a = (Math.PI * i) / 6;
      f.rod('wood_dark', V(0, -0.2, zz), V(Math.cos(a) * (r - 0.2), Math.sin(a) * (r - 0.2), zz), 0.06, 4);
    }
    for (const sx of [-1, 1]) f.rod('wood', V(sx * (r - 0.3), -y, zz), V(sx * (r - 0.3), 0, zz), 0.09, 5);
  }
  // Lagging boards across the top of the ribs.
  for (let i = 1; i < 12; i++) {
    const a = (Math.PI * i) / 12;
    f.box('wood', Math.cos(a) * r, Math.sin(a) * r, 0, 0.3, 0.06, depth, { rz: a - Math.PI / 2 });
  }
}

function buildPantheon(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const rng = ctx.rng.fork('site');
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const zN = -dd / 2;
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'travertine');
  // ---- The new rotunda's ring (centre and radii of the Hadrianic building, scaled).
  const S = ctx.S;
  const Rin = (43.3 / 2) * S; // 13 m
  const Rout = Rin + 6.2 * S; // drum 6.2 m thick
  const fw = 7.3 * S; // foundation ring
  const zc = dd / 2 - Rout - 0.4;
  const Rmid = (Rin + Rout) / 2;
  // Foundation: cast concrete flush with the ground round the south 3/4; the trench still open in the north.
  const segs = detail === 'high' ? 48 : 28;
  const ang = (a: number) => (a * Math.PI) / 180;
  // Angles: 90° = +z (south), 270° = −z (north, towards the old porch).
  ribbonWall(d, arc(0, zc, Rmid, ang(-20), ang(200), segs), -fw / 2, fw / 2, -0.6, 0.06, 'concrete');
  for (const [a0, a1] of [[200, 238], [302, 340]]) {
    // Open trench: a dark pit edged with planks, spoil heaps beside it.
    ribbonWall(d, arc(0, zc, Rmid, ang(a0), ang(a1), 8), -fw / 2, fw / 2, -0.25, -0.2, 'mud');
    ribbonWall(d, arc(0, zc, Rmid - fw / 2 - 0.15, ang(a0), ang(a1), 8), -0.15, 0.15, -1.2, 0.25, 'wood', false, true);
    ribbonWall(d, arc(0, zc, Rmid + fw / 2 + 0.15, ang(a0), ang(a1), 8), -0.15, 0.15, -1.2, 0.25, 'wood', false, true);
    const am = ang((a0 + a1) / 2);
    d.ellipsoid('dirt', Math.cos(am) * (Rout + 3), 0, zc + Math.sin(am) * (Rout + 3), 3.2, 1.6, 2.2, { seg: [10, 5] });
  }
  // The drum rising on the foundation: brick-faced concrete in uneven lifts round the south half.
  const lifts: [number, number, number][] = [[-20, 10, 2.2], [10, 40, 3.4], [40, 62, 4.6], [62, 76, 1.2], [104, 118, 1.2], [118, 140, 4.6], [140, 170, 3.0], [170, 200, 1.8]];
  for (const [a0, a1, h] of lifts) {
    ribbonWall(d, arc(0, zc, Rmid, ang(a0), ang(a1), Math.max(2, Math.round((a1 - a0) / 6))), -(Rout - Rin) / 2, (Rout - Rin) / 2, 0, h, 'brick', false, true);
    // A course of bonding tiles along the top of each lift.
    ribbonWall(d, arc(0, zc, Rmid, ang(a0), ang(a1), Math.max(2, Math.round((a1 - a0) / 6))), -(Rout - Rin) / 2 - 0.02, (Rout - Rin) / 2 + 0.02, h - 0.12, h, 'terracotta');
  }
  // The main niche opposite the door: its relieving arch on timber centring over the gap at 90°.
  const archR = 3.0;
  centring(d, 0, 2.6, zc + Rmid, 0, archR, Rout - Rin);
  for (const sx of [-1, 1]) d.span('brick', sx * archR - 0.6, 1.2, zc + Rin, sx * archR + 0.6, 2.6, zc + Rout, { collide: true });
  // Scaffolding against the outer face of the highest lifts.
  for (const a of [50, 128, 25]) {
    const r = ang(a);
    const x = Math.cos(r) * Rout, z = zc + Math.sin(r) * Rout;
    scaffolding(d.at(x, 0, z, Math.atan2(-Math.cos(r), -Math.sin(r))), -3.2, 3.2, 6, rng.fork(`sc${a}`));
  }
  // Survey stakes and a cord round the line of the future porch transition block.
  for (let i = 0; i < 10; i++) {
    const x = -w / 2 + 3 + i * ((w - 6) / 9);
    d.cyl('wood', x, 0.45, zc - Rout - 2.2, 0.035, 0.9, 4);
  }
  d.rod('fabric_white', V(-w / 2 + 3, 0.8, zc - Rout - 2.2), V(w / 2 - 3, 0.8, zc - Rout - 2.2), 0.01, 3);
  // ---- The burned old porch at the north end.
  const P = 1.32; // 6 risers
  const pz0 = zN + 2.5, pz1 = zN + 15;
  d.span('travertine', -w / 2 + 1, 0, pz0 + 2, w / 2 - 1, P, pz1, { collide: true });
  flight(d, 0, pz0 + 2 - 6 * 0.34, w * 0.6, 0, P, 'travertine');
  d.span('paving_travertine', -w / 2 + 0.5, -0.2, zN + 0.2, w / 2 - 0.5, 0.04, pz0 + 2 - 6 * 0.34);
  const colH = 8.4;
  const D = diameterForHeight('corinthian', colH);
  const front = 8;
  const span = w - 4;
  const xs = Array.from({ length: front }, (_, i) => -span / 2 + (span * i) / (front - 1));
  const zCol = pz0 + 3;
  // Standing (blackened), broken stumps, or fallen.
  const fate = ['stand', 'stand', 'stump', 'fallen', 'stand', 'stump', 'fallen', 'stand'];
  xs.forEach((x, i) => {
    const f = fate[i];
    if (f === 'stand') {
      column(d.b, { order: 'corinthian', D, height: colH, material: 'marble_veined', trimMaterial: 'marble', detail: detail === 'high' ? 'high' : 'low' }, mul(d.m, T(x, P, zCol)));
      d.cyl('plaster_dark', x, P + colH * 0.8, zCol, D * 0.46, colH * 0.35, 10, { rTop: D * 0.4 });
    } else if (f === 'stump') {
      const h = rng.range(1.6, 3.4);
      d.cyl('marble_veined', x, P + 0.3 + h / 2, zCol, D * 0.5, h, 12, { collide: true });
      d.cyl('marble', x, P + 0.15, zCol, D * 0.68, 0.3, 12);
      d.cyl('plaster_dark', x, P + 0.3 + h - 0.15, zCol, D * 0.51, 0.3, 12);
    } else {
      d.cyl('marble', x, P + 0.15, zCol, D * 0.68, 0.3, 12);
      fallenShaft(d, x + (i < 4 ? -1.5 : 1.5), 0, zN + 1.6 + (i % 2) * 1.2, i < 4 ? 0.35 : -0.3, colH * 0.8, D * 0.5, i === 3 ? 'marble_veined' : 'plaster_dark', 4, rng);
    }
  });
  // Scrap of architrave still bridging two standing columns (the east pair).
  d.span('marble', xs[0] - D * 0.6, P + colH, zCol - D * 0.6, xs[1] + D * 0.6, P + colH + 1.1, zCol + D * 0.6);
  d.span('plaster_dark', xs[0] - D * 0.6, P + colH + 1.1, zCol - D * 0.6, xs[1] + D * 0.6, P + colH + 1.3, zCol + D * 0.6);
  d.span('marble', xs[4] - D * 0.6, P + colH, zCol - D * 0.6, xs[4] + D * 1.8, P + colH + 1.1, zCol + D * 0.6);
  // Agrippa's inscription, fallen from the frieze, lying in the forecourt.
  const ib = d.at(-w * 0.18, 0.04, zN + 3.2, 0.12);
  ib.box('marble', 0, 0.6, 0, 7.2, 1.2, 1.1, { collide: true });
  inscription(ib, AGRIPPA, 0, 0.6, -0.56, 6.6, 0.8, 0, 'bronze');
  // The pronaos wall: tall, cracked, the bronze doors gone; soot streaks; the cella walls behind
  // half demolished in steps.
  const zW = pz1 - 1.6;
  piercedWall(d, -w / 2 + 1, zW, w / 2 - 1, zW, P, 15, 2.2, 'brick', [{ x: (w - 2) / 2, w: 4.4, h: 8.5 }]);
  for (const sx of [-1, 1]) {
    d.span('marble', sx * 4.2, P, zW - 0.12, sx * (w / 2 - 2), P + 4.5, zW, { collide: false });
    // Soot: a scorched band under the broken top, licks of black running down from it.
    d.span('concrete', sx * 2.2, 12.2, zW - 0.13, sx * (w / 2 - 1), 15, zW - 0.12);
    for (let k = 0; k < 5; k++) {
      const x = sx * rng.range(2.6, w / 2 - 2.5);
      const wd = rng.range(0.6, 2.2);
      d.span('plaster_dark', x - wd / 2, rng.range(6.5, 10.5), zW - 0.14, x + wd / 2, 12.3, zW - 0.13);
    }
  }
  // Ragged top: the wall is being taken down from the outer ends.
  for (let k = 0; k < 5; k++) {
    for (const sx of [-1, 1]) {
      const x0 = sx * (2.2 + k * 2.6);
      d.span('brick', x0, 15, zW, x0 + sx * 2.6, 15 + (4 - k) * 0.55, zW + 2.2, { collide: false });
    }
  }
  for (const sx of [-1, 1]) {
    // Stubs of the old side walls running south, lower and lower.
    for (let k = 0; k < 4; k++) {
      const z0 = zW + 2.2 + k * 2.6;
      if (z0 + 2.6 > zc - Rout - 0.5) break;
      d.span('brick', sx * (w / 2 - 1), 0, z0, sx * (w / 2 - 3), 9 - k * 2.2, z0 + 2.6, { collide: true });
    }
  }
  // Charred roof timbers and rubble heaps inside the old building.
  for (let i = 0; i < 6; i++) {
    const x = rng.range(-w / 2 + 4, w / 2 - 4), z = rng.range(zW + 3, zc - Rout - 1);
    d.box('wood_dark', x, 0.25, z, rng.range(4, 9), 0.4, 0.4, { ry: rng.range(0, Math.PI), rz: rng.range(-0.1, 0.1) });
  }
  for (let i = 0; i < 3; i++) d.ellipsoid('concrete', rng.range(-w / 3, w / 3), 0, rng.range(zW + 3, zc - Rout), rng.range(1.8, 3), rng.range(0.8, 1.4), rng.range(1.5, 2.5), { seg: [8, 4] });
  // ---- The yard: cranes, stockpiles, lime pit, sand, timber, the first granite shafts.
  treadwheelCrane(d.at(-4.5, 0.02, zc - 2, 0.3), 13.5, rng.fork('c1'));
  treadwheelCrane(d.at(7, 0.02, zc + 7, Math.PI + 0.6), 12, rng.fork('c2'));
  for (let i = 0; i < 9; i++) brickStack(d, -w / 2 + 2.2 + (i % 3) * 1.6, 0.02, zc + 2 + Math.floor(i / 3) * 1.4, 0);
  for (let i = 0; i < 6; i++) brickStack(d, w / 2 - 2.2 - (i % 2) * 1.6, 0.02, zc - 6 + Math.floor(i / 2) * 1.4, 0);
  for (let i = 0; i < 5; i++) marbleBlock(d, rng.range(-6, 2), 0.02, zc + 4 + i * 1.7, rng.range(-0.2, 0.2), rng.range(1.6, 2.4), rng.range(0.8, 1.2), rng.range(1.0, 1.4), i % 2 ? 'marble' : 'marble_veined');
  // Two grey granite shafts on sleepers (40 Roman feet: the new porch's columns).
  for (const k of [0, 1]) {
    const z = zc - 8.5 + k * 1.6;
    d.box('wood_dark', -1, 0.12, z, 0.3, 0.24, 1.4);
    d.box('wood_dark', 4, 0.12, z, 0.3, 0.24, 1.4);
    d.cyl('marble_veined', 1.5, 0.24 + 0.45, z, 0.45, 7.1, 14, { rz: Math.PI / 2 });
    d.solid(-2.1, 0, z - 0.45, 5.1, 1.15, z + 0.45);
  }
  // Lime pit, sand heap, timber pile, ox-cart.
  const lp = d.at(w / 2 - 4, 0.02, zc + 6);
  lp.span('plaster_white', -1.6, -0.05, -1.2, 1.6, 0.02, 1.2);
  for (const [x0, z0, x1, z1] of [[-1.7, -1.3, 1.7, -1.2], [-1.7, 1.2, 1.7, 1.3], [-1.7, -1.3, -1.6, 1.3], [1.6, -1.3, 1.7, 1.3]]) lp.span('wood', x0, 0, z0, x1, 0.45, z1, { collide: true });
  d.ellipsoid('sand', w / 2 - 4.5, 0, zc + 10.5, 2.6, 1.3, 2.0, { seg: [10, 5] });
  for (let i = 0; i < 7; i++) d.cyl('wood', -w / 2 + 3.5, 0.15 + (i % 3) * 0.28 + (i > 2 ? 0.1 : 0), zc + 9 + (i % 4) * 0.3, 0.14, 6, 6, { rx: Math.PI / 2 });
  d.solid(-w / 2 + 3.2, 0, zc + 6, -w / 2 + 3.9, 1, zc + 12);
  placeProp(d, 'cart', w / 2 - 4, 0.02, zN + 4, 0.2, { variant: 2 });
  placeProp(d, 'basket', -3, 0.02, zc - 4, 0, { collide: false });
  placeProp(d, 'crate', 2.6, 0.02, zc - 4.2, 0.4);
  // Foreman's shed by the gate.
  const sh = d.at(w / 2 - 3.5, 0.02, zN + 9.5);
  sh.span('wood', -1.8, 0, -1.4, 1.8, 2.5, 1.4, { collide: true });
  sh.span('black', -0.5, 0, -1.42, 0.5, 2.0, -1.38);
  tiledRoof(sh, 'shed', 0, 0, 3.6, 2.8, 2.5, 'low', { pitchDeg: 14 });
  // Hoarding round the yard (gate in the north), boards of grey timber.
  const hz0 = zN + 0.3, hz1 = dd / 2 - 0.2, hx = w / 2 - 0.2;
  wallRun(d, -hx, hz0, -3, hz0, 0, 2.4, 0.1, 'wood');
  wallRun(d, 3, hz0, hx, hz0, 0, 2.4, 0.1, 'wood');
  wallRun(d, hx, hz0, hx, hz1, 0, 2.4, 0.1, 'wood');
  wallRun(d, hx, hz1, -hx, hz1, 0, 2.4, 0.1, 'wood');
  wallRun(d, -hx, hz1, -hx, hz0, 0, 2.4, 0.1, 'wood');
  for (const sx of [-1, 1]) d.cyl('wood_dark', sx * 3, 1.5, hz0, 0.12, 3, 6, { collide: true });
  d.box('wood', 0, 2.9, hz0, 6.4, 0.25, 0.25);
  statueOnPedestal(d, 'togate', -w / 2 + 2, 0.02, zN + 6, 0.4, 1, 'plaster_dark', 'low', 1.2, 'marble');
  spots.push(
    spot(`${lm.id}:gate`, 'door', 0, 0.04, hz0 - 1.2, 0),
    spot(`${lm.id}:inscription`, 'inscription', -w * 0.18, 0.04, zN + 1.6, 0),
    spot(`${lm.id}:foreman`, 'npc', w / 2 - 3.5, 0.04, zN + 7.2, Math.PI),
    spot(`${lm.id}:crane`, 'npc', -4.5, 0.04, zc + 2.5, Math.PI),
    spot(`${lm.id}:bricklayer`, 'npc', Math.cos(ang(50)) * (Rout + 1), 0.04, zc + Math.sin(ang(50)) * (Rout + 1), Math.atan2(-Math.cos(ang(50)), -Math.sin(ang(50)))),
    spot(`${lm.id}:tools`, 'container', w / 2 - 3.5, 0.04, zN + 7.8, Math.PI),
    spot(`${lm.id}:drum`, 'sit', -6, 0.5, zN + 2.2, 0),
    spot(`${lm.id}:porch`, 'vista', 0, P, zCol + 1.5, 0),
  );
  // Far: the pronaos wall, the column stubs, the ring and the cranes as sticks.
  far.span('brick', -w / 2 + 1, 0, zW, w / 2 - 1, 15, zW + 2.2);
  far.span('travertine', -w / 2 + 1, 0, pz0 + 2, w / 2 - 1, P, pz1);
  for (const x of [xs[0], xs[1], xs[4], xs[7]]) far.cyl('marble_veined', x, P + colH / 2, zCol, D / 2, colH, 5);
  far.geo(new THREE.CylinderGeometry(Rout, Rout, 3, 16, 1, true), 'brick', 0, 1.5, zc);
  far.rod('wood', V(-4.5, 0, zc - 2), V(-4.5, 13, zc - 5.5), 0.3, 4);
  far.rod('wood', V(7, 0, zc + 7), V(7, 11.5, zc + 10), 0.3, 4);
  return finish(lm.id, d, spots, far, 2000);
}

/** Dolphin-and-trident frieze along a wall face (−z) from x0 to x1 at height y. */
function neptuneFrieze(d: Draw, x0: number, x1: number, y: number, z: number, detail: Detail) {
  d.span('marble', x0, y, z - 0.18, x1, y + 1.0, z);
  if (detail !== 'high') return;
  const n = Math.floor((x1 - x0) / 1.6);
  for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) * ((x1 - x0) / n);
    if (i % 2) {
      // trident
      d.rod('marble', V(x, y + 0.15, z - 0.22), V(x, y + 0.85, z - 0.22), 0.035, 4);
      for (const sx of [-0.14, 0, 0.14]) d.rod('marble', V(x + sx, y + 0.65, z - 0.22), V(x + sx, y + 0.88, z - 0.22), 0.025, 4);
      d.rod('marble', V(x - 0.15, y + 0.65, z - 0.22), V(x + 0.15, y + 0.65, z - 0.22), 0.025, 4);
    } else {
      // dolphin: an arched body and a tail fluke
      d.ellipsoid('marble', x, y + 0.5, z - 0.22, 0.42, 0.16, 0.08, { rz: (i % 4 === 0 ? 1 : -1) * 0.35, seg: [8, 5] });
      d.ellipsoid('marble', x + (i % 4 === 0 ? -0.4 : 0.4), y + 0.32, z - 0.22, 0.12, 0.1, 0.05, { seg: [6, 4] });
    }
  }
}

function buildBasilicaNeptune(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const rng = ctx.rng.fork('neptune');
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const H = 20 * ctx.S;
  const t = 1.2;
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'travertine');
  // Front (south) wall: a central doorway between deep round-headed niches; side walls with niches.
  const front: { x: number; w: number; h: number; sill?: number; arched?: boolean }[] = [{ x: w / 2, w: 3.2, h: 6, arched: true }];
  for (const k of [-2, -1, 1, 2]) front.push({ x: w / 2 + k * (w * 0.19), w: 2.0, h: 4.4, sill: 1.6, arched: true });
  piercedWall(d, -w / 2, -dd / 2, w / 2, -dd / 2, 0, H, t, 'brick', front);
  piercedWall(d, w / 2, -dd / 2, w / 2, dd / 2, 0, H, t, 'brick', [{ x: dd / 2, w: 2.2, h: 3.6, sill: 7.2, arched: true }]);
  piercedWall(d, w / 2, dd / 2, -w / 2, dd / 2, 0, H, t, 'brick', [0.2, 0.4, 0.6, 0.8].map((f) => ({ x: w * f, w: 2.2, h: 3.6, sill: 7.2, arched: true })));
  piercedWall(d, -w / 2, dd / 2, -w / 2, -dd / 2, 0, H, t, 'brick', [{ x: dd / 2, w: 2.2, h: 3.6, sill: 7.2, arched: true }]);
  // Niches set back into the front: dark backs, statues in the lower ones.
  for (const k of [-2, -1, 1, 2]) {
    const x = k * (w * 0.19);
    d.span('plaster_red', x - 1.0, 1.6, -dd / 2 + t - 0.02, x + 1.0, 6.0, -dd / 2 + t);
    if (detail === 'high') statueOnPedestal(d, 'togate', x, 1.6, -dd / 2 + 0.75, 0, 0.75, 'marble', 'low', 0.1);
  }
  // Marble entablature with the dolphin-and-trident frieze, cornice, and a brick attic.
  neptuneFrieze(d, -w / 2 - 0.2, w / 2 + 0.2, H - 2.2, -dd / 2, detail);
  d.span('marble', -w / 2 - 0.5, H - 1.2, -dd / 2 - 0.5, w / 2 + 0.5, H - 0.7, dd / 2 + 0.5);
  inscription(d, ['NEPTVNO'], 0, 7.4, -dd / 2 - 0.05, 4, 0.8);
  // Roof: tiled, but the west half (local +x: the hall faces south) burned in 110 — charred rafters
  // open to the sky, scaffolding against the north wall.
  const half = w * 0.45;
  const xb = w / 2 - half; // the burned part is x ∈ [xb, w/2]
  tiledRoof(d, 'gable', (-w / 2 + xb) / 2, 0, w / 2 + xb, dd, H - 0.7, detail, { axis: 'x', pitchDeg: 16 });
  for (let i = 0; i < 9; i++) {
    const x = xb + 0.6 + i * ((half - 1.2) / 8);
    if (i % 3 === 1) continue;
    d.box('wood_dark', x, H - 0.7 + dd * 0.07, -dd / 4, 0.3, 0.3, dd * 0.55, { rx: -0.28 });
    d.box('wood_dark', x, H - 0.7 + dd * 0.07, dd / 4, 0.3, 0.3, dd * 0.55, { rx: 0.28 });
  }
  scaffolding(d.at(xb + half / 2, 0, dd / 2, Math.PI), -half / 2, half / 2, H - 1, rng.fork('scaf'));
  // Interior: marble floor, two rows of grey granite columns, Neptune at the west end; fallen
  // timbers and soot under the burned half.
  d.span('marble_veined', -w / 2 + t, -0.1, -dd / 2 + t, w / 2 - t, 0.02, dd / 2 - t);
  const colH = H * 0.55;
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const x = -w / 2 + 3 + i * ((w - 6) / 4);
      liteColumnAt(d, x, 0.02, sz * (dd / 2 - t - 2.4), colH, colH / 9.5, 'marble_veined', 'corinthian', detail);
    }
  }
  statueOnPedestal(d, 'seated', w / 2 - t - 2, 0.02, 0, -Math.PI / 2, 1.6, 'bronze', detail, 1.4);
  for (let i = 0; i < 4; i++) d.box('wood_dark', rng.range(xb + 1, w / 2 - 3), 0.2, rng.range(-dd / 4, dd / 4), rng.range(3, 6), 0.3, 0.3, { ry: rng.range(0, 3) });
  d.span('plaster_dark', w / 2 - t - 0.03, 3, -dd / 2 + t, w / 2 - t - 0.01, H - 2, dd / 2 - t);
  spots.push(
    spot(`${lm.id}:door`, 'door', 0, 0, -dd / 2 - 0.8, 0),
    spot(`${lm.id}:frieze`, 'inscription', w * 0.25, 0, -dd / 2 - 3, 0),
    spot(`${lm.id}:neptune`, 'shrine', w / 2 - t - 4.2, 0.02, 0, Math.PI / 2),
    spot(`${lm.id}:burned`, 'container', xb + half * 0.4, 0.02, 1.2, 0),
  );
  far.span('brick', -w / 2, 0, -dd / 2, w / 2, H, dd / 2);
  return finish(lm.id, d, spots, far);
}

export const builders: LandmarkBuilder[] = [
  { handles: ['pantheon'], build: buildPantheon },
  { handles: ['basilica-neptune'], build: buildBasilicaNeptune },
];
