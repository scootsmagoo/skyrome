/**
 * Baths of the Campus Martius and the Aventine:
 * - baths-agrippa (25–19 BC, restored after 80): Rome's first great public baths. The great domed
 *   rotunda (Ø 25 m; the "Arco della Ciambella" survives) stands in the E half; a brick frigidarium
 *   hall to its W, the natatio court at the front (N) where Lysippus' Apoxyomenos stands again by
 *   the entrance — Tiberius had to give it back — and a garden palaestra behind.
 * - stagnum-agrippae: the ornamental lake beside them, a stone-kerbed basin with pavilions, boats,
 *   and the sluice where the Euripus leaves it for the river.
 * - baths-nero (62–64): compass-aligned, fronting N, the caldarium at the S end, huge red granite
 *   basins (as labra) — "What is better than Nero's baths?" (Martial).
 * - thermae-suranae (c. 110): small modern baths on the Aventine, by Sura's house.
 */
import { rotunda } from '../../../arch/classical/vaults';
import { placeProp } from '../../../arch/props';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import {
  T, V, broadTree, clearOf, cornice, cypress, dims, draw, farDraw, finish, groundRange, hedge, inscription, mul, obstacles, piercedWall, plinth, pool,
  roundBasin, spot, statueOnPedestal, tiledRoof, wallRun, type WallOpening, liftAll,
} from './generic-common';
import { tree } from './generic-world';
import { liteColonnade, liteColumnAt } from './generic-civic-lib';
import { porch, thermae } from './generic-civic';
import { tholos } from '../../../arch/classical/tholos';

// ---------------------------------------------------------------- Baths of Agrippa

function buildBathsAgrippa(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const S = ctx.S;
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'travertine');
  // The rotunda at the Arco della Ciambella (−612, −481): local (+25, −11) m.
  const rx = 25 * S, rz = -11 * S;
  const R = 12.5 * S;
  const H = lm.height * S;
  rotunda(d.b, { radius: R - 1.2, drumHeight: H * 0.62, wallThickness: 1.2, oculus: 1.4, material: 'brick', interiorMaterial: 'plaster_white', floorMaterial: 'marble_veined', niches: 6, doorWidth: 3, detail }, mul(d.m, T(rx, 0.02, rz)));
  // Frigidarium hall W of the rotunda (enterable through its N door), with cold pools.
  const hx0 = -w / 2 + 1.5, hx1 = rx - R - 0.5, hz0 = -dd * 0.28, hz1 = dd * 0.14;
  const Hh = H * 0.7;
  const lun = (len: number) => [0.25, 0.5, 0.75].map((f) => ({ x: len * f, w: 4.2, h: 2.4, sill: Hh * 0.62, arched: true }));
  piercedWall(d, hx0, hz0, hx1, hz0, 0.02, Hh, 1.1, 'brick', [{ x: (hx1 - hx0) / 2, w: 3.2, h: 4.6, arched: true }, ...lun(hx1 - hx0).filter((o) => Math.abs(o.x - (hx1 - hx0) / 2) > 3)]);
  piercedWall(d, hx1, hz0, hx1, hz1, 0.02, Hh, 1.1, 'brick', [{ x: (hz1 - hz0) * 0.5, w: 2.6, h: 4, arched: true }]);
  piercedWall(d, hx1, hz1, hx0, hz1, 0.02, Hh, 1.1, 'brick', [{ x: (hx1 - hx0) / 2, w: 3, h: 4.2, arched: true }, ...lun(hx1 - hx0).filter((o) => Math.abs(o.x - (hx1 - hx0) / 2) > 3)]);
  piercedWall(d, hx0, hz1, hx0, hz0, 0.02, Hh, 1.1, 'brick', lun(hz1 - hz0));
  d.span('concrete', hx0, Hh - 0.4, hz0, hx1, Hh, hz1, { collide: true });
  cornice(d, hx0, hz0, hx1, hz1, Hh - 0.6, 0.6, 0.35, 'travertine');
  tiledRoof(d, 'gable', (hx0 + hx1) / 2, (hz0 + hz1) / 2, hx1 - hx0, hz1 - hz0, Hh, detail, { axis: 'x', pitchDeg: 12 });
  d.span('mosaic', hx0 + 1.1, -0.1, hz0 + 1.1, hx1 - 1.1, 0.03, hz1 - 1.1);
  pool(d, (hx0 + hx1) / 2 - 5, 0.03, (hz0 + hz1) / 2, 6, (hz1 - hz0) * 0.5, 'marble', 0.55, 1.0);
  pool(d, (hx0 + hx1) / 2 + 5, 0.03, (hz0 + hz1) / 2, 6, (hz1 - hz0) * 0.5, 'marble', 0.55, 1.0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) liteColumnAt(d, (hx0 + hx1) / 2 + sx * 1.6, 0.03, (hz0 + hz1) / 2 + sz * (hz1 - hz0) * 0.33, Hh * 0.62, 0.7, 'marble_veined', 'corinthian', detail);
  // Natatio court at the front (N), entered through a columned porch; the Apoxyomenos by the door.
  const nz0 = -dd / 2 + 1, nz1 = hz0 - 0.5;
  pool(d, (hx0 + hx1) / 2, 0.02, (nz0 + nz1) / 2 + 1, (hx1 - hx0) * 0.75, (nz1 - nz0) * 0.5, 'marble', 0.5, 1.2);
  const frontOps: WallOpening[] = [{ x: w * 0.5 + rx, w: 3.2, h: 4.4, arched: true }, { x: w * 0.25, w: 3.2, h: 4.4, arched: true }];
  for (let i = 0; i < 9; i++) {
    const x = ((i + 0.5) * w) / 9;
    if (frontOps.some((o) => Math.abs(o.x - x) < 3.5)) continue;
    frontOps.push({ x, w: 1.6, h: 2.0, sill: 3.4, arched: true });
  }
  piercedWall(d, -w / 2, -dd / 2, w / 2, -dd / 2, 0.02, 7.2, 0.9, 'brick', frontOps);
  cornice(d, -w / 2, -dd / 2, w / 2, -dd / 2 + 0.9, 6.7, 0.5, 0.3, 'travertine');
  d.span('travertine', -w / 2, 0, -dd / 2 - 0.12, w / 2, 0.6, -dd / 2);
  porch(d, w * 0.25 - w / 2 - 4, w * 0.25 - w / 2 + 4, -dd / 2 - 1.6, 0.02, 6.2, 4, 'corinthian', 'marble', detail, 1.4);
  statueOnPedestal(d, 'togate', w * 0.25 - w / 2 + 3.6, 0.02, -dd / 2 - 3.4, 0, 1.05, 'bronze', detail, 1.3);
  inscription(d, ['M AGRIPPA L F COS III', 'THERMAS FECIT'], w * 0.25 - w / 2, 7.4, -dd / 2 - 1.62, 6.6, 0.8);
  // Garden palaestra at the back with a colonnade and plane trees.
  const gz0 = hz1 + 1, gz1 = dd / 2 - 1;
  const gx0 = -w / 2 + 1, gx1 = w / 2 - 1;
  d.span('sand', gx0, -0.2, gz0, gx1, 0.03, gz1);
  liteColonnade(d.at((gx0 + gx1) / 2, 0, (gz0 + gz1) / 2), [V(-(gx1 - gx0) / 2 + 3, 0, -(gz1 - gz0) / 2 + 3), V(-(gx1 - gx0) / 2 + 3, 0, (gz1 - gz0) / 2 - 3), V((gx1 - gx0) / 2 - 3, 0, (gz1 - gz0) / 2 - 3), V((gx1 - gx0) / 2 - 3, 0, -(gz1 - gz0) / 2 + 3)], { columnHeight: 5, spacing: 2.8, depth: 2.6, back: 'none', closed: true, material: 'marble', detail, order: 'ionic' });
  for (const [ax, az, bx, bz] of [[gx1, gz0, gx1, gz1], [gx1, gz1, gx0, gz1], [gx0, gz1, gx0, gz0]] as const) wallRun(d, ax, az, bx, bz, 0, 5.4, 0.8, 'brick');
  for (let i = 0; i < 6; i++) broadTree(d, gx0 + 8 + i * ((gx1 - gx0 - 16) / 5), 0.03, (gz0 + gz1) / 2, 11, detail, 'plane');
  spots.push(
    spot(`${lm.id}:apoxyomenos`, 'inscription', w * 0.25 - w / 2 + 3.6, 0.02, -dd / 2 - 5.2, 0),
    spot(`${lm.id}:entrance`, 'door', w * 0.25 - w / 2, 0.02, -dd / 2 - 3.5, 0),
    spot(`${lm.id}:rotunda`, 'vista', rx, 0.02, rz, 0),
    spot(`${lm.id}:bather`, 'sit', (hx0 + hx1) / 2 - 5, 0.55, hz0 + 2, 0),
    spot(`${lm.id}:palaestra`, 'npc', 0, 0.03, (gz0 + gz1) / 2 - 3, 0),
  );
  far.cyl('brick', rx, H * 0.31, rz, R, H * 0.62, 12);
  far.ellipsoid('lead', rx, H * 0.62, rz, R, R * 0.6, R, { seg: [10, 5] });
  far.span('brick', hx0, 0, hz0, hx1, Hh, hz1);
  return finish(lm.id, d, spots, far, 900);
}

// ---------------------------------------------------------------- Stagnum Agrippae

function buildStagnum(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const rng = ctx.rng.fork('stagnum');
  const d = draw(ctx);
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const free = clearOf(obstacles(ctx, 2));
  const g = (x: number, z: number) => ctx.groundAt(x, z);
  // The basin: water a little below the kerb; the kerb stepped down to the water on the S side.
  const bw = w - 10, bd = dd - 12;
  // The terrain is not dug out (open site, no pad): the water stands just above the highest ground
  // in the basin, held by the kerb, as a shallow ornamental sheet.
  const gr = groundRange(ctx, -bw / 2, -bd / 2, bw / 2, bd / 2, 6);
  const y = gr.max + 0.1;
  d.span('water', -bw / 2, gr.min - 0.3, -bd / 2, bw / 2, y, bd / 2);
  const k = 0.6;
  for (const [ax, az, bx, bz] of [[-bw / 2, -bd / 2, bw / 2, -bd / 2], [bw / 2, -bd / 2, bw / 2, bd / 2], [bw / 2, bd / 2, -bw / 2, bd / 2], [-bw / 2, bd / 2, -bw / 2, -bd / 2]] as const) {
    wallRun(d, ax, az, bx, bz, gr.min - 0.8, y + 0.45, k, 'travertine');
  }
  // A paved walk round it; steps to the water on the south side for the boats.
  for (const [x0, z0, x1, z1] of [[-w / 2, -dd / 2, w / 2, -bd / 2 - k / 2], [-w / 2, bd / 2 + k / 2, w / 2, dd / 2], [-w / 2, -bd / 2, -bw / 2 - k / 2, bd / 2], [bw / 2 + k / 2, -bd / 2, w / 2, bd / 2]] as const) {
    d.span('paving_travertine', x0, gr.min - 0.8, z0, x1, y + 0.05, z1);
  }
  // A small island with a round pavilion (the banqueting place) and boats moored about.
  roundBasin(d, bw * 0.15, gr.min - 0.5, -bd * 0.05, 6, 'travertine', y + 0.5 - gr.min + 0.5, detail);
  tholos(d.b, { radius: 3.6, columns: 8, order: 'ionic', base: 'steps', material: 'marble', cellaMaterial: 'marble', podiumMaterial: 'travertine', detail: 'low' }, mul(d.m, T(bw * 0.15, y + 0.5, -bd * 0.05)));
  for (let i = 0; i < 5; i++) {
    const bx = rng.range(-bw / 2 + 6, bw / 2 - 6), bz = rng.range(-bd / 2 + 4, bd / 2 - 4);
    if (Math.hypot(bx - bw * 0.15, bz + bd * 0.05) < 9) continue;
    const f = d.at(bx, y - 0.1, bz, rng.range(0, Math.PI));
    f.box('wood_dark', 0, 0.15, 0, 4.4, 0.5, 1.4);
    f.box('wood', 0, 0.42, 0, 3.8, 0.05, 1.1);
    if (i % 2) f.box('fabric_red', 0, 1.4, 0, 2.4, 0.05, 1.3);
  }
  // Pavilions and statues on the shores; plane trees by the walk.
  for (const [x, z, r] of [[-w * 0.3, -dd / 2 + 2.5, 0], [w * 0.3, -dd / 2 + 2.5, 0], [-w / 2 + 2.5, 0, Math.PI / 2]] as const) {
    if (!free(x, z, 4)) continue;
    const f = d.at(x, g(x, z), z, r);
    f.span('marble', -3, 0, -1.5, 3, 0.4, 1.5, { collide: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.cyl('marble', sx * 2.6, 2, sz * 1.1, 0.18, 3.2, 8, { collide: true });
    tiledRoof(f, 'hip', 0, 0, 6.2, 3.2, 3.6, 'low', { pitchDeg: 22 });
  }
  for (let i = 0; i < 8; i++) {
    const x = -w / 2 + 6 + i * ((w - 12) / 7), z = dd / 2 - 2.5;
    if (!free(x, z, 2)) continue;
    if (i % 2) tree(ctx, d, 'plane', x, g(x, z), z, 11);
    else statueOnPedestal(d, 'togate', x, g(x, z), z, Math.PI, 1, 'bronze', 'low', 1.2);
  }
  for (const z of [-bd * 0.3, bd * 0.3]) tree(ctx, d, 'cypress', w / 2 - 2.5, g(w / 2 - 2.5, z), z, 11);
  // The Euripus outlet: a sluice in the W kerb feeding a stone channel (the canal runs on to the river).
  const ex = -w / 2;
  d.span('travertine', ex, gr.min - 0.8, -1.8, -bw / 2 - k / 2, y + 0.5, -1.4, { collide: true });
  d.span('travertine', ex, gr.min - 0.8, 1.4, -bw / 2 - k / 2, y + 0.5, 1.8, { collide: true });
  d.span('water', ex, gr.min - 0.3, -1.4, -bw / 2, y - 0.05, 1.4);
  d.span('wood_dark', -bw / 2 - 0.5, y - 0.4, -1.5, -bw / 2 - 0.3, y + 0.9, 1.5);
  spots.push(
    spot(`${lm.id}:boats`, 'npc', 0, y + 0.05, bd / 2 + 1.5, Math.PI),
    spot(`${lm.id}:island`, 'vista', bw * 0.15, y + 0.5, -bd * 0.05 - 5, 0),
    spot(`${lm.id}:sluice`, 'container', ex + 1, y, 2.6, -Math.PI / 2),
    spot(`${lm.id}:shore`, 'sit', -w * 0.3, y + 0.4, -dd / 2 + 2.5, Math.PI),
  );
  return finish(lm.id, d, spots, undefined, 700);
}

// ---------------------------------------------------------------- Baths of Nero

function buildBathsNero(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const H = lm.height * ctx.S;
  const z = thermae(d, ctx, w, dd, H, spots, far, { rotunda: false, enterable: true, natatio: true, palaestrae: true, title: 'THERMAE NERONIANAE' });
  // Huge red granite basins in the palaestrae.
  for (const sx of [-1, 1]) roundBasin(d, sx * (z.fw / 2 + (w / 2 - z.fw / 2) / 2), 0.03, (z.zN1 + z.zT1) / 2, 2.4, 'porphyry', 1.0, detail);
  return finish(lm.id, d, spots, far, 900);
}

// ---------------------------------------------------------------- Baths of Sura

function buildThermaeSuranae(ctx: LandmarkContext): LandmarkBuild {
  const { lm } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const H = Math.max(7, lm.height * ctx.S);
  thermae(d, ctx, w, dd, H, spots, far, { rotunda: true, enterable: false, natatio: true, palaestrae: false, title: 'THERMAE SVRANAE' });
  placeProp(d, 'bench_masonry', -w / 2 + 2, 0.02, -dd / 2 - 1.2, 0);
  hedge(d, w / 2 - 4, -dd / 2 - 1.6, w / 2, -dd / 2 - 0.9, 0, 0.8);
  return finish(lm.id, d, spots, far);
}

export const builders: LandmarkBuilder[] = liftAll([
  { handles: ['baths-agrippa'], build: buildBathsAgrippa },
  { handles: ['stagnum-agrippae'], build: buildStagnum },
  { handles: ['baths-nero'], build: buildBathsNero },
  { handles: ['thermae-suranae'], build: buildThermaeSuranae },
]);
