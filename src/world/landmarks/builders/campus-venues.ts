/**
 * Places of spectacle in the Campus Martius:
 * - stadium-domitian (AD 86): ≈ 275 × 106 m, arena 250 × 54 m, curved end at the N, two storeys of
 *   travertine arcades, the main entrances in the middle of the long sides under the officials'
 *   tribunals, the straight S end closed by an arcaded front with a monumental gate; ≈ 30,000 seats.
 *   The Greek-style starting sill (balbis) is set across the S end of the track.
 * - odeum-domitian: the roofed concert hall, curved facade to the S, completed in 106 by Apollodorus.
 * - theatre-balbus (13 BC): the smallest stone theatre, curved facade W, with its four small onyx
 *   columns in the scaenae frons; the stage building backs onto the Crypta.
 * - crypta-balbi: the covered portico court behind the stage, with its exedra and a public latrine.
 */
import { column } from '../../../arch/classical/column';
import { diameterForHeight } from '../../../arch/classical/orders';
import { apse } from '../../../arch/classical/vaults';
import { placeProp } from '../../../arch/props';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import {
  T, V, dims, draw, farDraw, finish, inscription, mul, piercedWall, plinth, ringRoof, roundBasin, spot, statueOnPedestal,
} from './generic-common';
import { quadriporticusGarden } from './generic-civic';
import { liteArcade } from './generic-seating';
import { arcadeStoreys, bowl, curvedPlinth, theatre } from './generic-venues';

// ---------------------------------------------------------------- Stadium of Domitian

function buildStadiumDomitian(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const S = ctx.S;
  const H = lm.height * S;
  const aw = 54 * S;
  const fd = 1.8, c = 2.6;
  const reach = (w - aw) / 2 - c - fd;
  const z0 = -dd / 2 + 7;
  const zs = dd / 2 - aw / 2 - reach - c - fd;
  curvedPlinth(d, ctx, w / 2, -dd / 2, zs, w / 2, zs, 1);
  const res = bowl(d, ctx, { aw, z0, zs, H, storeys: 2, reach, gaps: [(z0 + zs) / 2], gapW: 6, bay: 4.2 }, spots, far);
  // The straight S end: an arcaded front of two storeys closing the bowl, a monumental central gate.
  const fz = z0 - 1.2;
  liteArcade(d, [V(-res.outer, 0, fz), V(res.outer, 0, fz)], { storeys: arcadeStoreys(H, 2, false), bay: 4.2, depth: fd, material: 'travertine', detail, solid: (i, n) => i < n / 2 - 1.5 || i > n / 2 + 0.5 ? (i % 4 !== 1) : false });
  d.span('paving_travertine', -aw / 2, -0.2, fz, aw / 2, 0.04, z0);
  // Gate attic with the dedication.
  d.span('travertine', -5, H * 0.5, fz - 0.4, 5, H + 1.2, fz + 0.6);
  inscription(d, ['IMP CAESAR DIVI VESPASIANI F', 'DOMITIANVS AVG GERMANICVS'], 0, H * 0.5 + 2.4, fz - 0.42, 9, 1.6);
  // Starting sill (balbis) across the track near the S end, with grooves; a judges' box above it.
  for (let i = 0; i < 2; i++) d.span('travertine', -aw / 2 + 0.5, 0.04, z0 + 6 + i * 0.6, aw / 2 - 0.5, 0.1, z0 + 6.35 + i * 0.6);
  for (let k = 1; k < 10; k++) d.box('wood', -aw / 2 + 0.5 + k * (aw - 1) / 10, 0.7, z0 + 6.6, 0.12, 1.2, 0.12);
  // Statues of victors along the track's edge; a herm at each turning point.
  for (const z of [z0 + 4, zs]) placeProp(d, 'herm', 0, 0.04, z, 0);
  spots.push(
    spot(`${lm.id}:gate`, 'door', 0, 0.04, fz - 1.5, 0),
    spot(`${lm.id}:inscription`, 'inscription', 0, 0.04, fz - 4, 0),
    spot(`${lm.id}:balbis`, 'npc', 0, 0.04, z0 + 7.5, 0),
    spot(`${lm.id}:runner`, 'npc', 3, 0.04, (z0 + zs) / 2, Math.PI),
  );
  far.span('travertine', -res.outer, 0, fz - fd, res.outer, H, fz);
  return finish(lm.id, d, spots, far, 1000);
}

// ---------------------------------------------------------------- Odeum of Domitian

function buildOdeumDomitian(ctx: LandmarkContext): LandmarkBuild {
  const { lm } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const S = ctx.S;
  const H = lm.height * S;
  // Orchestra ~(−890, −505): 10 m S of the footprint centre (local +z, the facade facing S).
  const zc = 10 * S;
  const Ro = Math.min(w / 2, zc + dd / 2);
  curvedPlinth(d, ctx, w / 2, zc, dd / 2, Ro, zc, -1);
  theatre(d, ctx, { zc, Ro, r0: Ro * 0.3, H, storeys: 2, bays: 32, stageW: Ro * 1.25, stageD: 5, zBack: dd / 2, sceneW: w, roof: true, frons: 2, material: 'travertine' }, spots, far);
  inscription(d, ['IMP CAESAR NERVA TRAIANVS AVG GER DACICVS', 'ODEVM PERFECIT'], 0, H * 0.45, zc - Ro - 0.05, 10, 1.2);
  spots.push(spot(`${lm.id}:inscription`, 'inscription', 0, 0, zc - Ro - 3, 0), spot(`${lm.id}:citharode`, 'npc', 0, 1.2, zc + 3.4 + 2, Math.PI));
  return finish(lm.id, d, spots, far, 900);
}

// ---------------------------------------------------------------- Theatre and Crypta of Balbus

function buildTheatreBalbus(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const S = ctx.S;
  const H = lm.height * S;
  // Orchestra ~(−515, −180): ≈ 7 m behind the footprint centre (local +z).
  const zc = 7 * S;
  const Ro = Math.min(w / 2, zc + dd / 2);
  curvedPlinth(d, ctx, w / 2, zc, dd / 2, Ro, zc, -1);
  const res = theatre(d, ctx, { zc, Ro, r0: Ro * 0.3, H, storeys: 3, bays: 36, stageW: Ro * 1.3, stageD: 4.6, zBack: dd / 2, sceneW: w, frons: 2, backDoors: true, masts: true }, spots, far);
  // The four little onyx columns before the royal door, famous in Rome.
  const colH = 3.2;
  for (const x of [-2.4, -1.2, 1.2, 2.4]) column(d.b, { order: 'corinthian', D: diameterForHeight('corinthian', colH), height: colH, material: 'marble_giallo', trimMaterial: 'gilded_bronze', detail }, mul(d.m, T(x, 1.2, res.zf - 2.2)));
  d.span('marble_giallo', -3, 1.2 + colH, res.zf - 2.5, 3, 1.2 + colH + 0.35, res.zf - 1.6);
  inscription(d, ['L CORNELIVS P F BALBVS', 'PROCOS EX MANVBIIS'], 0, H * 0.4, zc - Ro - 0.05, 7, 1.1);
  spots.push(spot(`${lm.id}:onyx`, 'vista', 0, 1.2, res.zf - 4.5, 0), spot(`${lm.id}:inscription`, 'inscription', 0, 0, zc - Ro - 3, 0));
  return finish(lm.id, d, spots, far, 900);
}

function buildCryptaBalbi(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const H = Math.max(6, lm.height * ctx.S);
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'travertine');
  const q = quadriporticusGarden(d, ctx, w, dd, H, spots, {
    order: 'doric', material: 'travertine', wallMat: 'reticulatum', columnHeight: 4.6, depth: 5,
    gates: [4, 3, 3, 3], propylon: false, garden: 'paved', courtMat: 'paving_travertine',
  });
  // The exedra: a semicircular niche at the back of the court with a statue and a basin.
  const R = 4.5;
  apse(d.b, { radius: R, height: 5, thickness: 0.8, material: 'reticulatum', domeMaterial: 'plaster_white', niches: 3, detail, collide: true }, mul(d.m, T(0, 0.03, q.hd - 1.8 - R)));
  statueOnPedestal(d, 'seated', 0, 0.03, q.hd - 1.8 - R + R * 0.55, Math.PI, 1.3, 'marble', detail, 1.0);
  roundBasin(d, 0, 0.03, q.hd - 1.8 - R - 2.6, 1.4, 'marble', 0.5, detail);
  // Public latrine (forica) in the SE corner of the court: a room with a marble bench along three
  // walls over the sewer channel, a water gutter at the feet.
  const lx0 = q.hw - 9, lx1 = q.hw - 0.6, lz0 = -q.hd + 0.6, lz1 = -q.hd + 7;
  piercedWall(d, lx0, lz0, lx1, lz0, 0.03, 3.6, 0.35, 'plaster_cream');
  piercedWall(d, lx1, lz1, lx0, lz1, 0.03, 3.6, 0.35, 'plaster_cream', [{ x: (lx1 - lx0) / 2, w: 1.2, h: 2.3 }]);
  piercedWall(d, lx0, lz1, lx0, lz0, 0.03, 3.6, 0.35, 'plaster_cream');
  piercedWall(d, lx1, lz0, lx1, lz1, 0.03, 3.6, 0.35, 'plaster_cream');
  d.span('wood', lx0, 3.6, lz0, lx1, 3.75, lz1);
  const bench = (x0: number, z0: number, x1: number, z1: number) => {
    d.span('marble', x0, 0.03, z0, x1, 0.48, z1, { collide: true });
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = along ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    for (let k = 0; k < Math.floor(len / 0.62); k++) {
      const f = (k + 0.5) / Math.floor(len / 0.62);
      d.span('black', (along ? x0 + (x1 - x0) * f : (x0 + x1) / 2) - 0.12, 0.481, (along ? (z0 + z1) / 2 : z0 + (z1 - z0) * f) - 0.12, (along ? x0 + (x1 - x0) * f : (x0 + x1) / 2) + 0.12, 0.49, (along ? (z0 + z1) / 2 : z0 + (z1 - z0) * f) + 0.12);
    }
  };
  bench(lx0 + 0.35, lz0 + 0.35, lx1 - 0.35, lz0 + 0.95);
  bench(lx0 + 0.35, lz0 + 0.95, lx0 + 0.95, lz1 - 1.4);
  bench(lx1 - 0.95, lz0 + 0.95, lx1 - 0.35, lz1 - 1.4);
  d.span('water', lx0 + 1.0, 0.03, lz0 + 1.0, lx1 - 1.0, 0.06, lz0 + 1.25);
  roundBasin(d, (lx0 + lx1) / 2, 0.03, (lz0 + lz1) / 2 + 0.6, 0.6, 'marble', 0.8, detail);
  // Shops (tabernae) let into the outer wall along the street side.
  for (let k = 0; k < 4; k++) placeProp(d, 'amphora_stack', -q.hw + 2 + k * 3, 0.03, -q.hd + 1.4, k);
  spots.push(
    spot(`${lm.id}:latrine`, 'sit', (lx0 + lx1) / 2, 0.48, lz0 + 0.7, Math.PI),
    spot(`${lm.id}:latrineDoor`, 'door', (lx0 + lx1) / 2, 0.03, lz1 + 0.8, Math.PI),
    spot(`${lm.id}:exedra`, 'shrine', 0, 0.03, q.hd - 1.8 - R - 4.4, 0),
  );
  ringRoof(far, 0, 0, w, dd, 2 * q.hw, 2 * q.hd, q.wallTop, 'low');
  return finish(lm.id, d, spots, far);
}

export const builders: LandmarkBuilder[] = [
  { handles: ['stadium-domitian'], build: buildStadiumDomitian },
  { handles: ['odeum-domitian'], build: buildOdeumDomitian },
  { handles: ['theatre-balbus'], build: buildTheatreBalbus },
  { handles: ['crypta-balbi'], build: buildCryptaBalbi },
];
