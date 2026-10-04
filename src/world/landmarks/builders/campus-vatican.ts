/**
 * Across the river: the Vatican circus and the two naumachiae.
 * - circus-vaticanus: Caligula's private racecourse in the Vatican gardens, used by Nero; largely
 *   disused in 113 (FLAG) — stone lower seats with timber stands above, weeds in the track, the
 *   carceres at the E end (FLAG), the spina leaving room for the obelisk (its own landmark).
 * - vatican-obelisk: the uninscribed red granite obelisk from Alexandria on the spina, with its
 *   bronze ball, re-dedicated by Caligula to the deified Augustus and Tiberius.
 * - naumachia-augusti (2 BC): the old sea-battle lake, in 113 mostly dry (FLAG: perhaps filled with
 *   rubble after 80) — broken kerbs, marshy pools, the island with its ruined pavilion, and the
 *   Nemus Caesarum grove round about.
 * - naumachia-traiani (dedicated Nov 109): brand new — a rectangular basin with rounded ends ringed
 *   by brick grandstands, full of water from the new aqueduct, two war galleys moored.
 */
import * as THREE from 'three';
import { obelisk } from '../../../arch/classical/monuments';
import { tholos } from '../../../arch/classical/tholos';
import { inscriptionPanel } from '../../../arch/common/inscription';
import type { Draw } from '../../../arch/fabric/draw';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import {
  T, V, broadTree, clearOf, cypress, dims, draw, farDraw, finish, groundRange, inscription, mul, obstacles, plinth, spot, wallRun, type Detail,
} from './generic-common';
import { tree } from './generic-world';
import { liteArcade, ribbonSlab, seating } from './generic-seating';
import { arcadeStoreys, bowl, carceres, curvedPlinth, cutPath, localOf, spina } from './generic-venues';
import { children, offsetLine, pathLength, type V3 } from './generic-common';

// ---------------------------------------------------------------- Circus of Gaius and Nero

function buildCircusVaticanus(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const rng = ctx.rng.fork('cv');
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const H = lm.height * ctx.S;
  const reach = Math.min(12, w * 0.2);
  const aw = w - 2 * (reach + 4.4);
  const zs = dd / 2 - aw / 2 - reach - 4.4;
  const z0 = -dd / 2 + 9;
  curvedPlinth(d, ctx, w / 2, -dd / 2, zs, w / 2, zs, 1);
  bowl(d, ctx, { aw, z0, zs, H, storeys: 2, reach, timberTop: true, gaps: [z0 + (zs - z0) * 0.55], bay: 4.6 }, spots, far);
  carceres(d, ctx, aw + 2 * reach, z0 - 2.5, Math.min(H * 0.7, 7), 12, spots);
  const gaps: [number, number][] = [];
  for (const c of children(lm)) {
    const p = localOf(ctx, c);
    if (Math.abs(p.x) < 8) gaps.push([p.z - 3.2, p.z + 3.2]);
  }
  spina(d, ctx, z0 + (zs - z0) * 0.12, zs - 4, spots, gaps, false);
  // Disuse: weeds in the sand, a collapsed run of the timber stands, a shrine-niche of old offerings.
  for (let i = 0; i < (detail === 'high' ? 24 : 10); i++) {
    const x = rng.range(-aw / 2 + 2, aw / 2 - 2), z = rng.range(z0 + 6, zs);
    if (Math.abs(x) < 3) continue;
    d.ellipsoid('dry_grass', x, 0.04, z, rng.range(1.5, 4), 0.12, rng.range(1.5, 5), { seg: [8, 3] });
  }
  for (let i = 0; i < 6; i++) d.box('wood_dark', aw / 2 + 3 + rng.range(0, reach - 4), 0.4 + rng.range(0, 0.5), zs - 30 + i * 2.2, rng.range(3, 5), 0.25, 0.3, { ry: rng.range(-0.6, 0.6), rz: rng.range(-0.3, 0.3) });
  spots.push(spot(`${lm.id}:torches`, 'vista', -aw / 2 + 3, 0.04, (z0 + zs) / 2, Math.PI / 2));
  return finish(lm.id, d, spots, far, 1000);
}

function buildVaticanObelisk(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const spots: Spot[] = [];
  const S = ctx.S;
  const shaft = 25.5 * S;
  const ped = Math.max(1.6, lm.height * S - shaft - 1.2);
  plinth(d, ctx, -2, -2, 2, 2, 0.02, 'marble');
  // The spina top is ~1.1 m up: the base block rises from the track through it.
  d.span('marble', -1.9, 0, -1.9, 1.9, 1.1, 1.9, { collide: true });
  obelisk(d.b, { height: shaft, hieroglyphs: false, pedestal: ped, pedestalMaterial: 'marble', detail, gildedTip: false }, mul(d.m, T(0, 1.1, 0)));
  d.ellipsoid('gilded_bronze', 0, 1.1 + ped + shaft + 0.55, 0, 0.55, 0.55, 0.55, { seg: [14, 9] });
  d.cyl('gilded_bronze', 0, 1.1 + ped + shaft + 0.05, 0, 0.08, 0.3, 6);
  const bw = shaft / 9.5;
  inscriptionPanel(d.b, { lines: ['DIVO CAESARI DIVI IVLII F AVGVSTO', 'TI CAESARI DIVI AVGVSTI F AVGVSTO', 'SACRVM'], width: bw * 0.9, height: 1.3, style: 'carved', ground: '#b07466', ink: '#3a2420' }, mul(d.m, T(0, 1.1 + ped + 1.4, -bw / 2 - 0.02)), { depth: 0.02, bodyMaterial: 'plaster_ochre' });
  spots.push(spot(`${lm.id}:dedication`, 'inscription', 0, 0.04, -3.5, 0));
  far.cyl('plaster_ochre', 0, 1.1 + ped + shaft / 2, 0, bw * 0.6, shaft, 4, { rTop: bw * 0.4 });
  return finish(lm.id, d, spots, far, 1000);
}

// ---------------------------------------------------------------- Naumachiae

/** A small war galley (bireme): hull, deck, a ram, oars along both sides, mast with a furled sail. */
function galley(d: Draw, x: number, y: number, z: number, rot: number, L: number, detail: Detail) {
  const f = d.at(x, y, z, rot);
  f.ellipsoid('wood_dark', 0, 0, 0, L / 2, 0.9, 1.6, { seg: [12, 6] });
  f.box('wood', 0, 0.75, 0, L * 0.82, 0.12, 2.6);
  f.box('bronze', L / 2 + 0.6, -0.2, 0, 1.4, 0.35, 0.35);
  f.ellipsoid('wood_painted', -L / 2 + 0.6, 1.0, 0, 1.0, 0.8, 0.9, { seg: [8, 5] });
  f.cyl('wood', 0, 4, 0, 0.12, 6.5, 6);
  f.box('fabric_white', 0, 6.3, 0, 0.3, 0.4, 3.6);
  if (detail === 'high') {
    for (const sz of [-1, 1]) for (let k = 0; k < 10; k++) f.rod('wood', V(-L * 0.35 + k * L * 0.07, 0.6, sz * 1.5), V(-L * 0.35 + k * L * 0.07 - 0.4, -0.5, sz * 3.6), 0.04, 4);
  }
}

function buildNaumachiaTraiani(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const H = Math.max(6, lm.height * ctx.S);
  const gr = groundRange(ctx, -w / 2, -dd / 2, w / 2, dd / 2, 6);
  const y0 = gr.max;
  d.span('brick', -w / 2, gr.min - 1, -dd / 2, w / 2, y0 + 0.02, dd / 2, { collide: true });
  const F = d.at(0, y0, 0);
  // Basin with rounded ends: a racetrack loop for the podium foot, the stands outside it.
  const reach = 10, fd = 1.6, c = 2.2;
  const bw = w - 2 * (reach + c + fd) - 2;
  const r = bw / 2;
  const straight = dd - 2 * (reach + c + fd) - 2 * r - 2;
  const n = detail === 'high' ? 16 : 10;
  const loop: V3[] = [];
  for (let i = 0; i <= n; i++) loop.push(V(r * Math.cos(Math.PI - (Math.PI * i) / n), 0, -straight / 2 - r * Math.sin((Math.PI * i) / n)));
  for (let i = 1; i <= n; i++) loop.push(V(r * Math.cos((Math.PI * i) / n), 0, straight / 2 + r * Math.sin((Math.PI * i) / n)));
  loop.push(loop[0].clone());
  const L = pathLength(loop);
  // Entrances through the stands on both long sides.
  const sides = [L * 0.25, L * 0.75];
  const cuts = sides.map((s) => [s - 3, s + 3] as [number, number]);
  for (const piece of cutPath(loop, cuts)) {
    seating(F, { path: piece, podium: 1.6, height: H - 1.2, reach, walkways: 1, aisles: Math.max(2, Math.round(pathLength(piece) / 14)), topWalk: 1.8, detail, colliderChord: 8, seat: 'wood', riser: 'brick', podiumMat: 'brick', ends: true });
  }
  const fpath = offsetLine(loop, reach + c + fd);
  liteArcade(F, fpath, { storeys: arcadeStoreys(H, 2, false), bay: 4.4, depth: fd, material: 'brick', detail });
  ribbonSlab(F, fpath, -fd - c - 0.2, -fd, 0.03, 0.25, 'paving_basalt');
  ribbonSlab(F, fpath, -fd - c - 0.2, -fd, H - 1.4, 0.4, 'concrete');
  // Water: a full basin (the new Aqua Traiana fills it) just under the podium top.
  const shape = new THREE.Shape(loop.slice(0, -1).map((p) => new THREE.Vector2(p.x, -p.z)));
  const water = new THREE.ShapeGeometry(shape, 2);
  water.rotateX(-Math.PI / 2);
  F.geo(water, 'water', 0, 0.9, 0);
  galley(F, -r * 0.3, 0.6, -straight * 0.2, Math.PI / 2, 16, detail);
  galley(F, r * 0.35, 0.6, straight * 0.25, -Math.PI / 2 + 0.3, 14, detail);
  inscription(F, ['IMP CAESAR NERVA TRAIANVS AVG', 'NAVMACHIAM FECIT'], 0, H - 2.2, -dd / 2 + 0.3, 9, 1.2);
  spots.push(
    spot(`${lm.id}:entrance`, 'door', -(w / 2) + 1, y0, 0, Math.PI / 2),
    spot(`${lm.id}:galley`, 'npc', -r * 0.3, y0 + 1.4, -straight * 0.2, 0),
    spot(`${lm.id}:stands`, 'vista', r + 5, y0 + 4, 0, -Math.PI / 2),
  );
  far.span('brick', -w / 2, 0, -dd / 2, w / 2, H, dd / 2);
  return finish(lm.id, d, spots, far, 1000);
}

function buildNaumachiaAugusti(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const rng = ctx.rng.fork('naum');
  const d = draw(ctx);
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const free = clearOf(obstacles(ctx, 3));
  const g = (x: number, z: number) => ctx.groundAt(x, z);
  const rx = w / 2 - 12, rz = dd / 2 - 12;
  // Broken kerb of the old basin: stretches of travertine with gaps, following the ground.
  const n = 64;
  for (let i = 0; i < n; i++) {
    if (rng.chance(0.35)) continue;
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const x0 = Math.cos(a0) * rx, z0 = Math.sin(a0) * rz, x1 = Math.cos(a1) * rx, z1 = Math.sin(a1) * rz;
    if (!free((x0 + x1) / 2, (z0 + z1) / 2, 2)) continue;
    const y = Math.min(g(x0, z0), g(x1, z1));
    wallRun(d, x0, z0, x1, z1, y - 0.6, y + rng.range(0.3, 0.9), 1.0, 'travertine', true);
  }
  // Marshy pools where water still stands, reeds and mud round them.
  for (let i = 0; i < 6; i++) {
    const x = rng.range(-rx * 0.6, rx * 0.6), z = rng.range(-rz * 0.6, rz * 0.6);
    if (!free(x, z, 12) || Math.hypot(x, z) < 22) continue;
    const y = g(x, z);
    const sx = rng.range(8, 18), sz = rng.range(6, 12);
    d.ellipsoid('mud', x, y, z, sx + 1.5, 0.12, sz + 1.5, { seg: [12, 3] });
    d.ellipsoid('water', x, y + 0.05, z, sx, 0.08, sz, { seg: [12, 3] });
    for (let k = 0; k < 8; k++) {
      const a = rng.range(0, Math.PI * 2);
      d.cyl('dry_grass', x + Math.cos(a) * sx, y + 0.8, z + Math.sin(a) * sz, 0.3, 1.6, 4, { rTop: 0.05 });
    }
  }
  // The island (where the fleets fought round it) with the stump of its pavilion and a bridge pier.
  if (free(0, 0, 14)) {
    const y = g(0, 0);
    d.cyl('travertine', 0, y + 0.4, 0, 12, 1.4, detail === 'high' ? 24 : 14, { collide: true });
    d.cyl('grass', 0, y + 1.12, 0, 11.5, 0.05, detail === 'high' ? 24 : 14);
    tholos(d.b, { radius: 3.6, columns: 8, order: 'tuscan', base: 'steps', material: 'travertine', cellaMaterial: 'tufa', podiumMaterial: 'travertine', detail: 'low' }, mul(d.m, T(0, y + 1.1, 0)));
    for (let k = 0; k < 3; k++) d.box('travertine', 13 + k * 6, y + 0.9, 0, 2, 2.4 - k * 0.5, 3, { collide: true });
    spots.push(spot(`${lm.id}:island`, 'vista', 0, y + 1.15, -5.4, 0));
  }
  // The Nemus Caesarum: the grove of the Caesars round the old basin.
  const trees = detail === 'high' ? 40 : 20;
  for (let i = 0; i < trees; i++) {
    const a = (i / trees) * Math.PI * 2 + rng.range(-0.05, 0.05);
    const x = Math.cos(a) * (rx + 7), z = Math.sin(a) * (rz + 7);
    if (!free(x, z, 3)) continue;
    if (i % 3 === 0) tree(ctx, d, 'cypress', x, g(x, z), z, 12);
    else tree(ctx, d, (i % 3 === 1 ? 'pine' : 'plane') === 'pine' ? 'umbrella_pine' : 'plane', x, g(x, z), z, rng.range(10, 14));
  }
  spots.push(spot(`${lm.id}:kerb`, 'vista', 0, g(0, -rz - 3), -rz - 3, 0), spot(`${lm.id}:grove`, 'shrine', rx + 7, g(rx + 7, 0), 0, -Math.PI / 2));
  return finish(lm.id, d, spots, undefined, 800);
}

export const builders: LandmarkBuilder[] = [
  { handles: ['circus-vaticanus'], build: buildCircusVaticanus },
  { handles: ['vatican-obelisk'], build: buildVaticanObelisk },
  { handles: ['naumachia-traiani'], build: buildNaumachiaTraiani },
  { handles: ['naumachia-augusti'], build: buildNaumachiaAugusti },
];

export { farDraw };
