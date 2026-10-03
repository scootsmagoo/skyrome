/**
 * The river port below the Aventine and the Via Ostiensis:
 * - emporium: the half-kilometre stepped travertine quay facing the Tiber (NW), with ramps, pierced
 *   mooring blocks, treadwheel cranes, barges from Ostia, amphora stacks and the marble landing
 *   (blocks of coloured stone waiting for the imperial works), the harbour office, sheds behind.
 * - porticus-aemilia: the colossal warehouse of fifty vaulted aisles (8.3 m wide) in four stepped
 *   rows climbing from the river, its stepped vaults marching along the bank (opus incertum).
 * - horrea-galbana: the imperial warehouses round three great courtyards (Galba's tomb in front is
 *   its own landmark); horrea-lolliana: a smaller pair of courtyard warehouses near the quay.
 * - monte-testaccio: in 113 only a modest, growing terraced heap of broken Baetican oil amphorae,
 *   sprinkled with lime, with ramps for the donkeys (FLAG: its size in 113 is unknown).
 * - pyramid-cestius: the white marble pyramid of Gaius Cestius on its travertine base, inscribed on
 *   both main faces, in a small walled enclosure with columns at its corners — no city wall yet.
 */
import * as THREE from 'three';
import { inscriptionPanel } from '../../../arch/common/inscription';
import { treadwheelCrane } from '../../../arch/fabric/construction';
import { placeProp } from '../../../arch/props';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import {
  T, TRS, V, cornice, dims, draw, farDraw, finish, groundRange, groundWall, inscription, mul, plinth, spot, statueOnPedestal, tiledRoof,
} from './generic-common';
import { hall, tabernae, vaultedAisle } from './generic-civic-lib';
import { horreaBlocks, quay } from './generic-civic';
import { pyramidTomb } from './generic-sacred';

// ---------------------------------------------------------------- Emporium

function buildEmporium(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const rng = ctx.rng.fork('emporium');
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const edge = Math.min(...[-0.35, -0.15, 0, 0.15, 0.35].map((f) => ctx.groundAt(w * f, -dd / 2 - 4)));
  const drop = Math.min(4, Math.max(2.2, -edge + 0.8));
  quay(d, ctx, w, dd, spots, far, { drop, cranes: 5, sheds: true, depth: dd * 0.58 });
  // Ramps for carts at both ends, from the water's edge up to the wharf.
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 4);
    const len = drop / Math.tan(0.2);
    d.box('travertine', x, -drop / 2 - 0.2, -dd / 2 + len / 2 * Math.cos(0.2) - 1, 5, 0.6, len, { rx: 0.2, collide: true });
  }
  // The marble landing: big blocks and column shafts of coloured stone on timber sleepers.
  const marbles: MaterialId[] = ['marble', 'marble_giallo', 'marble_pavonazzetto', 'marble_veined', 'porphyry'];
  const mz0 = -dd / 2 + 9, mz1 = -dd / 2 + dd * 0.55;
  for (let i = 0; i < (detail === 'high' ? 26 : 10); i++) {
    const x = -w * 0.18 + rng.range(-w * 0.12, w * 0.12), z = rng.range(mz0, mz1);
    const m = marbles[i % marbles.length];
    if (i % 4 === 0) {
      d.box('wood_dark', x - 1.6, 0.12, z, 0.3, 0.24, 1.2);
      d.box('wood_dark', x + 1.6, 0.12, z, 0.3, 0.24, 1.2);
      d.cyl(m, x, 0.24 + 0.4, z, 0.4, rng.range(4.5, 7), 12, { rz: Math.PI / 2, collide: false });
      d.solid(x - 3, 0, z - 0.45, x + 3, 1.05, z + 0.45);
    } else {
      const bw = rng.range(1.2, 2.4), bh = rng.range(0.8, 1.4), bl = rng.range(1, 1.6);
      d.box(m, x, bh / 2 + 0.02, z, bw, bh, bl, { ry: rng.range(-0.3, 0.3), collide: true });
    }
  }
  spots.push(spot(`${lm.id}:marble`, 'npc', -w * 0.18, 0.02, mz0 - 1.5, 0));
  // The harbour office (statio) with the tariff board.
  const sx0 = w * 0.12;
  const f = d.at(sx0, 0.02, -dd / 2 + dd * 0.4);
  hall(f, -5, -3, 5, 3, { mat: 'brick', height: 4.6, roof: 'hip', doors: 1, detail, windowRows: 0, dado: 'plaster_red' });
  inscriptionPanel(f.b, { lines: ['STATIO PORTVS', 'VECTIGAL QVADRAGESIMAE'], width: 3.4, height: 0.9, style: 'painted', interpunct: false }, mul(f.m, T(0, 3.6, -3.06)), { depth: 0.04 });
  spots.push(
    spot(`${lm.id}:statio`, 'npc', sx0 + 1.2, 0.02, -dd / 2 + dd * 0.4 - 4, Math.PI),
    spot(`${lm.id}:tariff`, 'inscription', sx0, 0.02, -dd / 2 + dd * 0.4 - 4.5, 0),
  );
  return finish(lm.id, d, spots, far, 2400);
}

// ---------------------------------------------------------------- Porticus Aemilia

function buildPorticusAemilia(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const rng = ctx.rng.fork('aemilia');
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const S = ctx.S;
  const aisles = 50;
  const aw = w / aisles; // ≈ 5 m game (8.3 m real)
  const rows = 4;
  const rd = dd / rows;
  const spring = 4.6; // springing of the vaults above each row's floor
  const pier = 1.1;
  const mat: MaterialId = 'tufa';
  // Row floors step up from the river (−z) to the back, following the ground where it rises more.
  const floors: number[] = [];
  for (let r = 0; r < rows; r++) {
    const z0 = -dd / 2 + r * rd;
    const gr = groundRange(ctx, -w / 2, z0, w / 2, z0 + rd, 6);
    floors.push(Math.max(r * 1.1, Math.min(gr.max, r * 1.1 + 1.5)));
  }
  for (let r = 0; r < rows; r++) {
    const z0 = -dd / 2 + r * rd, z1 = z0 + rd;
    const y = floors[r];
    plinth(d, ctx, -w / 2, z0, w / 2, z1, y, 'tufa');
    const f = d.at(0, y, 0);
    for (let i = 0; i < aisles; i++) {
      const cx = -w / 2 + (i + 0.5) * aw;
      if (detail === 'high' || i % 2 === 0 || true) vaultedAisle(f, cx, z0, z1, aw - pier, spring, 'concrete', detail === 'high' && r === 0 ? 'high' : 'low');
    }
    // Pier walls between the aisles, pierced by arches (rows of pillars), and the cross walls.
    for (let i = 0; i <= aisles; i++) {
      const x = -w / 2 + i * aw;
      const n = 2;
      for (let k = 0; k < n; k++) {
        const za = z0 + (k * rd) / n, zb = za + rd / n;
        f.span(mat, x - pier / 2, -0.2, za, x + pier / 2, spring + aw * 0.5, za + 1.4, { collide: true });
        f.span(mat, x - pier / 2, spring - 0.6, za, x + pier / 2, spring + aw * 0.5, zb);
      }
    }
    // The back wall of each row stands up past the next row's step (the stepped roofline).
    f.span(mat, -w / 2, -0.4, z1 - 0.8, w / 2, spring + aw * 0.55, z1, { collide: r === rows - 1 });
    // Goods inside the first aisles.
    if (r === 0 && detail === 'high') {
      for (let i = 0; i < 12; i++) {
        const cx = -w / 2 + (rng.int(0, aisles - 1) + 0.5) * aw;
        placeProp(f, i % 3 ? 'amphora_stack' : 'sack', cx + rng.range(-1, 1), 0, z0 + rng.range(3, rd - 2), rng.range(0, 6));
      }
    }
    far.span(mat, -w / 2, y - 1, z0, w / 2, y + spring + aw * 0.5, z1);
  }
  // River front: the open arches of the first row with a travertine string course; end walls.
  d.span('travertine', -w / 2, floors[0] + spring - 0.3, -dd / 2 - 0.15, w / 2, floors[0] + spring, -dd / 2 + 0.2);
  for (const sx of [-1, 1]) d.span(mat, sx * w / 2 - 0.6, -0.5, -dd / 2, sx * w / 2 + 0.6, floors[rows - 1] + spring + aw * 0.6, dd / 2, { collide: true });
  inscription(d, ['PORTICVS AEMILIA'], -w / 2 + aw * 2.5, floors[0] + spring + 0.8, -dd / 2 - 0.1, 5, 0.6);
  spots.push(
    spot(`${lm.id}:aisle`, 'door', -w / 2 + aw * 10.5, floors[0], -dd / 2 - 1.2, 0),
    spot(`${lm.id}:clerk`, 'npc', -w / 2 + aw * 3.5, floors[0], -dd / 2 + 3, Math.PI),
    spot(`${lm.id}:stores`, 'container', -w / 2 + aw * 20.5, floors[0], -dd / 2 + rd * 0.6, Math.PI),
    spot(`${lm.id}:inscription`, 'inscription', -w / 2 + aw * 2.5, floors[0], -dd / 2 - 3, 0),
  );
  void S;
  return finish(lm.id, d, spots, far, 2400);
}

// ---------------------------------------------------------------- Horrea Galbana / Lolliana

function horreaComplex(ctx: LandmarkContext, courts: number, title: string): LandmarkBuild {
  const { lm } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'brick');
  const bw = w / courts;
  for (let i = 0; i < courts; i++) {
    const sub = { ...ctx, groundAt: (x: number, z: number) => ctx.groundAt(x, z) };
    horreaBlocks(d, sub, bw, dd, spots, far, -w / 2 + i * bw, -dd / 2, `c${i}`);
  }
  inscription(d, [title], 0, 7.6, -dd / 2 - 0.05, Math.min(10, bw * 0.7), 0.7);
  spots.push(spot(`${lm.id}:inscription`, 'inscription', 0, 0.02, -dd / 2 - 3, 0));
  return finish(lm.id, d, spots, far, 1800);
}

// ---------------------------------------------------------------- Monte Testaccio

function buildTestaccio(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const rng = ctx.rng.fork('testaccio');
  const d = draw(ctx);
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const rx = w / 2, rz = dd / 2;
  const g0 = groundRange(ctx, -rx, -rz, rx, rz, 6);
  // FLAG: its size in 113 is unknown; the research guesses 10–20 m, the atlas 8 m. ~10 m here.
  const H = Math.max(6, lm.height * ctx.S);
  const terraces = 5;
  const segs = detail === 'high' ? 36 : 20;
  // Irregular outline: a lumpy ellipse shared by all terraces (shrinking upward, drifting a little).
  const lump = Array.from({ length: segs }, () => 1 + rng.range(-0.08, 0.08));
  for (let k = 0; k < terraces; k++) {
    const f = 1 - k * 0.17;
    const y0 = g0.min - 0.8 + (k * H) / terraces;
    const y1 = g0.min + ((k + 1) * H) / terraces;
    const ox = rng.range(-1.5, 1.5) * k, oz = rng.range(-1, 1) * k;
    const geo = new THREE.CylinderGeometry(1, 1, 1, segs, 1, false).toNonIndexed();
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
      const a = Math.atan2(z, x);
      const j = Math.round(((a + Math.PI) / (Math.PI * 2)) * segs) % segs;
      const top = y > 0;
      const rr = Math.hypot(x, z) * lump[j] * (top ? 0.94 : 1);
      pos.setXYZ(i, ox + Math.cos(a) * rr * rx * f, top ? y1 : y0, oz + Math.sin(a) * rr * rz * f);
    }
    geo.computeVertexNormals();
    d.geo(geo, 'terracotta');
    // Lime sprinkled on the treads in irregular sheets, sherd ridges where loads were tipped.
    for (let i = 0; i < 4; i++) {
      const a = rng.range(0, Math.PI * 2), r = f * rng.range(0.55, 0.85);
      d.ellipsoid(i % 2 ? 'plaster_white' : 'concrete', ox + Math.cos(a) * rx * r, y1 + 0.02, oz + Math.sin(a) * rz * r, rng.range(2, 5), 0.06, rng.range(1.5, 3), { ry: rng.range(0, 3), seg: [8, 3] });
    }
    // Retaining courses of whole amphorae along the terrace edge (a dotted rim of necks).
    if (detail === 'high') {
      const n = Math.round((Math.PI * (rx * f + rz * f)) / 1.4);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI;
        const j = Math.round(((a + Math.PI) / (Math.PI * 2)) * segs) % segs;
        const x = ox + Math.cos(a) * rx * f * lump[j] * 0.97, z = oz + Math.sin(a) * rz * f * lump[j] * 0.97;
        d.cyl('terracotta', x, y1 - 0.25, z, 0.17, 0.6, 5, { rx: Math.PI / 2, ry: -a + Math.PI / 2 });
      }
    }
    for (const [sx, sz] of [[0.92, 0.5], [0.66, 0.82], [0.38, 0.95]]) d.solid(ox - rx * f * sx, y0, oz - rz * f * sz, ox + rx * f * sx, y1, oz + rz * f * sz);
  }
  // A donkey ramp up the S face, fresh loads tipped at the top.
  const top = g0.min + H;
  // (from the foot at the E edge up westward along the S flank)
  const run = rx * 0.7;
  const rampL = Math.hypot(run, H);
  d.box('dirt', rx * 0.55, g0.min + H / 2 - 0.2, rz * 0.72, rampL, 0.5, 3, { rz: -Math.atan2(H, run), collide: true });
  for (let i = 0; i < 6; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0, 0.35);
    d.ellipsoid('terracotta', Math.cos(a) * rx * r, top, Math.sin(a) * rz * r, rng.range(1.2, 2.4), rng.range(0.5, 0.9), rng.range(1, 2), { seg: [8, 4] });
  }
  // At the foot: carts of empty amphorae come up from the Emporium; a lime pit.
  const fz = rz + 3;
  placeProp(d, 'cart', -rx * 0.3, ctx.groundAt(-rx * 0.3, fz), fz, 0.3, { variant: 0 });
  placeProp(d, 'amphora_stack', rx * 0.1, ctx.groundAt(rx * 0.1, fz), fz, 0);
  placeProp(d, 'amphora_stack', rx * 0.1 + 2, ctx.groundAt(rx * 0.1 + 2, fz), fz + 0.5, 1);
  d.span('plaster_white', -rx * 0.6 - 1.5, ctx.groundAt(-rx * 0.6, fz) - 0.2, fz - 1, -rx * 0.6 + 1.5, ctx.groundAt(-rx * 0.6, fz) + 0.05, fz + 1);
  spots.push(
    spot(`${lm.id}:ramp`, 'npc', rx * 0.95, ctx.groundAt(rx * 0.95, rz * 0.72), rz * 0.72, -Math.PI / 2),
    spot(`${lm.id}:top`, 'vista', 0, top + 0.5, 0, 0),
    spot(`${lm.id}:sherds`, 'container', rx * 0.1, ctx.groundAt(rx * 0.1, fz - 1.5), fz - 1.5, 0),
  );
  return finish(lm.id, d, spots, undefined, 1600);
}

// ---------------------------------------------------------------- Pyramid of Cestius

const CESTIUS = ['C CESTIVS L F POB EPVLO PR TR PL', 'VII VIR EPVLONVM'];

function buildCestius(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const H = lm.height * ctx.S;
  const g = (x: number, z: number) => ctx.groundAt(x, z);
  // Travertine base over the lowest ground, then the marble-faced pyramid.
  const gr = groundRange(ctx, -w / 2, -dd / 2, w / 2, dd / 2, 4);
  const y0 = gr.max + 0.3;
  d.span('travertine', -w / 2, gr.min - 0.8, -dd / 2, w / 2, y0, dd / 2, { collide: true });
  const side = Math.min(w, dd) * 0.97;
  pyramidTomb(d, side, H - (y0 - 0), 'marble', y0);
  // Inscriptions high on the WNW (front, −z) and ESE (back) faces, set into the slope.
  const slope = Math.atan2(H, side / 2);
  const onFace = (lines: string[], y: number, width: number, height: number, back: boolean) => {
    const r = (side / 2) * (1 - (y - y0) / (H - y0));
    const m = mul(d.m, TRS(0, y, back ? r + 0.03 : -r - 0.03, 0, back ? Math.PI : 0, 0));
    // Lean the panel back into the face (its top towards the apex).
    inscriptionPanel(d.b, { lines, width, height, style: 'carved' }, mul(m, TRS(0, 0, 0, Math.PI / 2 - slope, 0, 0)), { depth: 0.04 });
  };
  for (const back of [false, true]) onFace(CESTIUS, y0 + (H - y0) * 0.62, side * 0.3, 1.0, back);
  onFace(['OPVS APSOLVTVM EX TESTAMENTO DIEBVS CCCXXX', 'ARBITRATV PONTI P F CLA MELAE HEREDIS ET POTHI L'], y0 + 2.4, side * 0.5, 0.6, false);
  // The little enclosure: a low wall round it with columns at the corners and bronze statues.
  const e = w / 2 + 3.6;
  const corners: [number, number][] = [[-e, -e], [e, -e], [e, e], [-e, e]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    const gaps: [number, number][] = i === 0 ? [[e - 1.4, e + 1.4]] : [];
    groundWall(d, ctx, ax, az, bx, bz, 1.2, 0.5, 'travertine', 5, gaps);
    d.cyl('marble', ax, g(ax, az) + 3, az, 0.42, 6, 12, { collide: true });
    d.box('marble', ax, g(ax, az) + 6.2, az, 1.1, 0.4, 1.1);
  }
  for (const sx of [-1, 1]) statueOnPedestal(d, 'togate', sx * (w / 2 + 1.6), g(sx * (w / 2 + 1.6), -e + 1.4), -e + 1.4, 0, 1.0, 'bronze', detail, 1.5);
  spots.push(
    spot(`${lm.id}:inscription`, 'inscription', 0, g(0, -e - 2), -e - 2, 0),
    spot(`${lm.id}:gate`, 'door', 0, g(0, -e - 0.5), -e - 0.5, 0),
    spot(`${lm.id}:road`, 'vista', 0, g(0, -e - 12), -e - 12, 0),
  );
  pyramidTomb(far, side, H - y0, 'marble', y0);
  far.span('travertine', -w / 2, gr.min - 0.8, -dd / 2, w / 2, y0, dd / 2);
  return finish(lm.id, d, spots, far, 2400);
}

export const builders: LandmarkBuilder[] = [
  { handles: ['emporium'], build: buildEmporium },
  { handles: ['porticus-aemilia'], build: buildPorticusAemilia },
  { handles: ['horrea-galbana'], build: (ctx) => horreaComplex(ctx, 3, 'HORREA GALBIANA') },
  { handles: ['horrea-lolliana'], build: (ctx) => horreaComplex(ctx, 2, 'HORREA LOLLIANA') },
  { handles: ['monte-testaccio'], build: buildTestaccio },
  { handles: ['pyramid-cestius'], build: buildCestius },
];

export { V, cornice, tabernae, tiledRoof, treadwheelCrane };
