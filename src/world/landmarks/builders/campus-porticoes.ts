/**
 * The great porticoes of the Campus Martius and the Iseum:
 * - saepta-julia: the vast voting enclosure turned luxury market — two-storey porticoes round a long
 *   court, shops behind (slaves, bronzes, citrus-wood tables), the Argonauts painted along the W side
 *   (Porticus Argonautarum) and Meleager on the E; low voting barriers (pontes) still in the court.
 * - diribitorium: once the largest hall under one roof; roofless since the fire of 80 (Dio), its
 *   great larch beams fallen inside.
 * - porticus-minucia-frumentaria: the grain-dole hall — numbered doorways (ostia) round a portico
 *   court with the Temple of the Nymphs, clerks' tables, sacks and tokens.
 * - porticus-philippi: the portico round the round temple of Hercules of the Muses, with the nine
 *   Muses from Ambracia; poets give readings here.
 * - porticus-vipsania: the colonnade on the Via Lata with Agrippa's painted map of the world.
 * - iseum-campense: the Egyptian sanctuary — a pylon gate, an avenue of small obelisks and
 *   sphinxes, the temple of Isis, the Nile and the Tiber reclining by a pool, Serapis in the hemicycle.
 */
import * as THREE from 'three';
import { obelisk } from '../../../arch/classical/monuments';
import { seatedDeity, togate } from '../../../arch/classical/statues';
import { tholos } from '../../../arch/classical/tholos';
import { apse } from '../../../arch/classical/vaults';
import { inscriptionPanel } from '../../../arch/common/inscription';
import type { Draw } from '../../../arch/fabric/draw';
import { placeProp, type PropKind } from '../../../arch/props';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import {
  T, TRS, V, altar, broadTree, clearOf, cornice, obstacles, dims, draw, farDraw, finish, hedge, inscription, mul, piercedWall, plinth, pool, ringRoof, roundBasin, spot,
  statueOnPedestal, tiledRoof, wallRun, type Detail, type WallOpening,
} from './generic-common';
import { tree } from './generic-world';
import { liteColonnade, tabernae } from './generic-civic-lib';
import { porch, quadriporticusGarden } from './generic-civic';
import { fittedTemple } from './generic-sacred';

// ---------------------------------------------------------------- Saepta Julia

/**
 * A range of shops round the inside of a w × dd enclosure, `depth` deep, opening inward, with a
 * gateway through the middle of each side whose width is in `gates` [back, front, right, left].
 */
function shopRing(d: Draw, ctx: LandmarkContext, w: number, dd: number, depth: number, H: number, gates: [number, number, number, number]) {
  const sides: [number, number, number, number][] = [
    // frame origin (x, z), rotY, length — each frame faces inward (−z of the frame = into the court)
    [0, dd / 2 - depth, 0, w - 2 * depth],
    [0, -dd / 2 + depth, Math.PI, w - 2 * depth],
    [w / 2 - depth, 0, Math.PI / 2, dd],
    [-w / 2 + depth, 0, -Math.PI / 2, dd],
  ];
  sides.forEach(([x, z, r, len], i) => {
    const f = d.at(x, 0, z, r);
    const gate = gates[i];
    if (gate > 0) {
      tabernae(f, -len / 2, -gate / 2, 0, depth, H, 'brick', ctx.detail, ctx.rng.fork(`s${i}a`));
      tabernae(f, gate / 2, len / 2, 0, depth, H, 'brick', ctx.detail, ctx.rng.fork(`s${i}b`));
      f.span('brick', -gate / 2, 5.2, 0, gate / 2, H, depth);
      f.span('paving_travertine', -gate / 2, -0.2, 0, gate / 2, 0.05, depth);
    } else {
      tabernae(f, -len / 2, len / 2, 0, depth, H, 'brick', ctx.detail, ctx.rng.fork(`s${i}`));
    }
    // Back (outer) wall and a flat roof terrace over the shops; the gate stays open.
    const back = (a: number, b: number) => f.span('brick', a, -0.4, depth - 0.6, b, H + 0.6, depth, { collide: true });
    if (gate > 0) {
      back(-len / 2, -gate / 2);
      back(gate / 2, len / 2);
      f.span('brick', -gate / 2, 5.2, depth - 0.6, gate / 2, H + 0.6, depth);
    } else back(-len / 2, len / 2);
    f.span('concrete', -len / 2, H, 0, len / 2, H + 0.3, depth);
  });
}

function buildSaepta(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const rng = ctx.rng.fork('saepta');
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'travertine');
  const shopD = 5.5, porD = 6;
  const H = 9;
  const gate = 8;
  // Gates: the main one on the south front (into the Diribitorium's hall), others mid-way along the
  // long sides — towards the Pantheon (W) and the Iseum (E) — and at the north end.
  shopRing(d, ctx, w, dd, shopD, H, [6, gate, 6, 6]);
  // Two-storey travertine porticoes in front of the shops, facing the court.
  const hw = w / 2 - shopD - porD, hd = dd / 2 - shopD - porD;
  liteColonnade(d, [V(-hw, 0, -hd), V(-hw, 0, hd), V(hw, 0, hd), V(hw, 0, -hd)], { columnHeight: 5.6, spacing: 3.4, depth: porD, back: 'none', closed: true, material: 'travertine', detail, order: 'tuscan' });
  liteColonnade(d, [V(-hw, 0, -hd), V(-hw, 0, hd), V(hw, 0, hd), V(hw, 0, -hd)], { columnHeight: 4.2, spacing: 3.4, depth: porD, back: 'none', closed: true, material: 'marble', detail, order: 'ionic', y: 7.0, stylobate: 0.3 });
  // The paintings: the Argonauts along the W portico (local +x: the enclosure faces S), Meleager on the E.
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - shopD) - sx * 0.02;
    d.span('stucco_painted', Math.min(x, x - sx * 0.04), 3.2, -dd / 2 + shopD + 3, Math.max(x, x - sx * 0.04), 5.0, dd / 2 - shopD - 3);
  }
  // Court: travertine paving, the old voting barriers (pontes) in lanes, statues, stalls.
  d.span('paving_travertine', -hw, -0.2, -hd, hw, 0.04, hd);
  const lanes = 6;
  for (let i = 1; i < lanes; i++) {
    const x = -hw + (i * 2 * hw) / lanes;
    for (let k = 0; k < 8; k++) {
      const z0 = -hd + 12 + k * ((2 * hd - 24) / 8);
      d.span('travertine', x - 0.15, 0.04, z0, x + 0.15, 1.0, z0 + (2 * hd - 24) / 8 - 2.5, { collide: true });
    }
  }
  const goods: PropKind[] = ['table_marble', 'stall_pottery', 'stall_cloth', 'statue_pedestal', 'amphora_rack', 'table'];
  for (let i = 0; i < (detail === 'high' ? 14 : 6); i++) {
    const sx = i % 2 ? 1 : -1;
    const z = -hd + 6 + (i >> 1) * ((2 * hd - 12) / 7);
    const x = sx * (hw + porD * 0.55);
    placeProp(d, goods[i % goods.length], x, 0.3, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2, { rng: rng.fork(`g${i}`) });
    if (i % 3 === 0) spots.push(spot(`${lm.id}:dealer${i}`, 'vendor', x - sx * 1.2, 0.3, z, sx > 0 ? Math.PI / 2 : -Math.PI / 2));
  }
  for (const z of [-hd * 0.5, hd * 0.5]) statueOnPedestal(d, 'equestrian', 0, 0.04, z, 0, 1.1, 'gilded_bronze', detail, 2.2);
  // Entrance from the south with an inscribed attic.
  d.span('travertine', -gate / 2 - 1, 5.2, -dd / 2 - 0.4, gate / 2 + 1, H + 1.2, -dd / 2 + 0.6);
  inscription(d, ['SAEPTA IVLIA'], 0, 7.6, -dd / 2 - 0.42, 6, 1.0);
  spots.push(
    spot(`${lm.id}:gate`, 'door', 0, 0.04, -dd / 2 - 1.5, 0),
    spot(`${lm.id}:gateW`, 'door', w / 2 + 1.5, 0.04, 0, -Math.PI / 2),
    spot(`${lm.id}:gateE`, 'door', -w / 2 - 1.5, 0.04, 0, Math.PI / 2),
    spot(`${lm.id}:argonauts`, 'inscription', w / 2 - shopD - 2.5, 0.3, 0, -Math.PI / 2),
    spot(`${lm.id}:meleager`, 'inscription', -w / 2 + shopD + 2.5, 0.3, 0, Math.PI / 2),
    spot(`${lm.id}:slaver`, 'vendor', -hw - 2, 0.3, hd * 0.6, Math.PI / 2),
    spot(`${lm.id}:court`, 'vista', 0, 0.04, -hd + 4, 0),
  );
  far.span('brick', -w / 2, 0, -dd / 2, w / 2, H, -dd / 2 + shopD);
  far.span('brick', -w / 2, 0, dd / 2 - shopD, w / 2, H, dd / 2);
  far.span('brick', -w / 2, 0, -dd / 2, -w / 2 + shopD, H, dd / 2);
  far.span('brick', w / 2 - shopD, 0, -dd / 2, w / 2, H, dd / 2);
  return finish(lm.id, d, spots, far, 900);
}

// ---------------------------------------------------------------- Diribitorium

function buildDiribitorium(ctx: LandmarkContext): LandmarkBuild {
  const { lm } = ctx;
  const rng = ctx.rng.fork('dir');
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const H = lm.height * ctx.S;
  const t = 1.6;
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'travertine');
  const bays = Math.round(w / 6);
  const long = (len: number): WallOpening[] => Array.from({ length: bays }, (_, i) => ({ x: ((i + 0.5) * len) / bays, w: 2.6, h: i % 3 === 1 ? 5.6 : 4.2, sill: i % 3 === 1 ? 0 : 3.4, arched: true }));
  piercedWall(d, -w / 2, -dd / 2, w / 2, -dd / 2, 0, H, t, 'tufa', long(w));
  // The back (N) wall opens on the axis into the Saepta's south gate (the votes came through here).
  piercedWall(d, w / 2, dd / 2, -w / 2, dd / 2, 0, H, t, 'tufa', [...long(w).filter((o) => Math.abs(o.x - w / 2) > 5), { x: w / 2, w: 6, h: 7, arched: true }]);
  piercedWall(d, w / 2, -dd / 2, w / 2, dd / 2, 0, H, t, 'tufa', [{ x: dd / 2, w: 4, h: 6, arched: true }]);
  piercedWall(d, -w / 2, dd / 2, -w / 2, -dd / 2, 0, H, t, 'tufa', [{ x: dd / 2, w: 4, h: 6, arched: true }]);
  // Travertine string courses and a ragged, fire-scarred top; no roof.
  cornice(d, -w / 2, -dd / 2, w / 2, dd / 2, H * 0.55, 0.4, 0.2, 'travertine');
  // Fire-scarred crown: a grey scorched band with a ragged top (the roof timbers burned in 80).
  d.span('concrete', -w / 2, H - 1.4, -dd / 2 - 0.02, w / 2, H, -dd / 2 - 0.01);
  for (let i = 0; i < 18; i++) {
    const x = -w / 2 + rng.range(1, w - 1), wd = rng.range(1.5, 4);
    d.span('tufa', x - wd / 2, H, -dd / 2, x + wd / 2, H + rng.range(0.4, 1.4), -dd / 2 + t);
  }
  // Inside: weeds, the stumps of the piers that carried the roof, and fallen larch beams.
  d.span('dry_grass', -w / 2 + t, -0.1, -dd / 2 + t, w / 2 - t, 0.05, dd / 2 - t);
  for (let i = 0; i < 6; i++) {
    const x = -w / 2 + (i + 1) * (w / 7);
    d.span('tufa', x - 0.8, 0, -0.8, x + 0.8, rng.range(1.5, 5), 0.8, { collide: true });
  }
  for (let i = 0; i < 5; i++) {
    const len = rng.range(14, 26);
    d.box('wood_dark', rng.range(-w / 3, w / 3), 0.4, rng.range(-dd / 4, dd / 4), len, 0.75, 0.75, { ry: rng.range(-0.3, 0.3), rz: rng.range(-0.05, 0.05), collide: true });
  }
  spots.push(
    spot(`${lm.id}:door`, 'door', -w / 2 + (1.5 * w) / bays, 0, -dd / 2 - 0.8, 0),
    spot(`${lm.id}:beam`, 'container', 0, 0.05, 2, 0),
    spot(`${lm.id}:squatter`, 'npc', w * 0.3, 0.05, -1, Math.PI),
    spot(`${lm.id}:inside`, 'vista', -w * 0.3, 0.05, 0, Math.PI / 2),
  );
  far.span('tufa', -w / 2, 0, -dd / 2, w / 2, H, -dd / 2 + t);
  far.span('tufa', -w / 2, 0, dd / 2 - t, w / 2, H, dd / 2);
  return finish(lm.id, d, spots, far, 900);
}

// ---------------------------------------------------------------- Porticus Minucia Frumentaria

const ROMAN = ['I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'VIIII', 'X', 'XI', 'XII', 'XIII', 'XIIII', 'XV', 'XVI', 'XVII', 'XVIII', 'XVIIII', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIIII', 'XXV', 'XXVI', 'XXVII', 'XXVIII', 'XXVIIII', 'XXX', 'XXXI', 'XXXII', 'XXXIII', 'XXXIIII', 'XXXV', 'XXXVI', 'XXXVII', 'XXXVIII', 'XXXVIIII', 'XXXX', 'XXXXI', 'XXXXII', 'XXXXIII', 'XXXXIIII', 'XXXXV'];

function buildMinucia(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const rng = ctx.rng.fork('minucia');
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'travertine');
  // Portico court, walls pierced by the numbered doorways (ostia) all round.
  const gate = 5;
  const q = quadriporticusGarden(d, ctx, w, dd, 7.2, spots, { order: 'tuscan', material: 'travertine', wallMat: 'plaster_cream', columnHeight: 5.2, depth: 5, gates: [gate, 0, 0, 0], propylon: false, garden: 'paved' });
  // The ostia: framed doorways all round the outside, each with its number painted above (the
  // distribution ran through them by tribe and day; the main gate on the front is walkable).
  // Clerks' tables stand outside only where the street is clear of the neighbours.
  const free = clearOf(obstacles(ctx, 0.5));
  let n = 0;
  const sides: [number, number, number, number, number][] = [[-w / 2, -dd / 2, w / 2, -dd / 2, w], [w / 2, -dd / 2, w / 2, dd / 2, dd], [w / 2, dd / 2, -w / 2, dd / 2, w], [-w / 2, dd / 2, -w / 2, -dd / 2, dd]];
  for (const [ax, az, bx, bz, len] of sides) {
    const k = Math.floor(len / 6.2);
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    const rot = Math.atan2(-uz, ux);
    for (let i = 0; i < k; i++) {
      const s = ((i + 0.5) * len) / k;
      if (az === -dd / 2 && bz === -dd / 2 && Math.abs(s - len / 2) < gate / 2 + 1.4) continue;
      const f = d.at(ax + ux * s, 0, az + uz * s, rot);
      // Doorway frame in travertine, a dark opening, and the painted number above.
      f.span('travertine', -1.15, 0, -0.14, -0.9, 2.9, 0.02);
      f.span('travertine', 0.9, 0, -0.14, 1.15, 2.9, 0.02);
      f.span('travertine', -1.2, 2.7, -0.16, 1.2, 3.05, 0.02);
      f.span('wood_dark', -0.9, 0, -0.04, 0.9, 2.7, 0.0);
      if (detail === 'high' && n < 45 && (n < 12 || n % 4 === 0)) inscriptionPanel(d.b, { lines: [`OSTIVM ${ROMAN[n]}`], width: 1.5, height: 0.36, style: 'painted', interpunct: false }, mul(f.m, T(0, 3.35, -0.05)), { depth: 0.03 });
      const out = f.point(0, 0, -2.2);
      if (i % 3 === 1 && free(out.x, out.z, 1)) {
        placeProp(f, 'table', 0, 0, -1.4, 0, { rng: rng.fork(`t${n}`) });
        for (let j = 0; j < 3; j++) placeProp(f, 'sack', -1.6 + j * 0.5, 0, -0.6, j, { collide: false });
        spots.push({ ...spot(`${lm.id}:ostium${n}`, 'npc', 0, 0, 0, 0), position: f.point(0, 0, -2.2), heading: rot });
      }
      n++;
    }
  }
  // The Temple of the Nymphs in the court (FLAG: Coarelli), off-centre to the S.
  const tx = -22.8 * (ctx.S / 0.6), tz = 8.4 * (ctx.S / 0.6);
  const tw = Math.min(2 * q.hw - 4, 12), td = Math.min(2 * q.hd - 4, 18);
  const cx = Math.max(-q.hw + tw / 2 + 1, Math.min(q.hw - tw / 2 - 1, tx)), cz = Math.max(-q.hd + td / 2 + 1, Math.min(q.hd - td / 2 - 1, tz));
  const t = fittedTemple(d.at(cx, 0.03, cz), tw, td, { order: 'ionic', plan: 'prostyle', front: 4, material: 'marble', podiumMaterial: 'tufa', cellaMaterial: 'plaster_white', detail }, `${lm.id}:nymphs`);
  spots.push(...t.spots.map((s) => ({ ...s, position: s.position.clone().add(V(cx, 0.03, cz)) })));
  // The mensa ponderaria (measuring table) and grain heaps in the court.
  const mx = q.hw * 0.4, mz = -q.hd * 0.4;
  d.span('marble', mx - 1.2, 0.03, mz - 0.5, mx + 1.2, 0.95, mz + 0.5, { collide: true });
  for (let j = 0; j < 3; j++) d.cyl('black', mx - 0.7 + j * 0.7, 0.96, mz, 0.22, 0.02, 10);
  for (let j = 0; j < 8; j++) placeProp(d, 'sack', mx - 2 + (j % 4) * 1.2, 0.03, mz + 1.6 + Math.floor(j / 4) * 0.9, j);
  inscription(d, ['PORTICVS MINVCIA FRVMENTARIA'], 0, 5.8, -dd / 2 - 0.05, 9, 0.8);
  spots.push(spot(`${lm.id}:mensa`, 'npc', mx, 0.03, mz - 1.4, 0), spot(`${lm.id}:tokens`, 'container', mx + 0.8, 0.95, mz, 0), spot(`${lm.id}:crowd`, 'spawn', 0, 0.03, -q.hd + 3, 0));
  ringRoof(far, 0, 0, w, dd, 2 * q.hw, 2 * q.hd, q.wallTop, 'low');
  return finish(lm.id, d, spots, far, 900);
}

// ---------------------------------------------------------------- Porticus Philippi

function buildPhilippi(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'travertine');
  const q = quadriporticusGarden(d, ctx, w, dd, 7.2, spots, { order: 'corinthian', material: 'marble', columnHeight: 5.6, depth: 4.4, garden: 'none', courtMat: 'paving_travertine' });
  // The round temple of Hercules of the Muses, on a podium, facing the gate.
  const R = Math.min(q.hw, q.hd) * 0.42;
  const tz = q.hd * 0.18;
  const res = tholos(d.b, { radius: R * 0.82, columns: 12, order: 'ionic', base: 'podium', material: 'marble', cellaMaterial: 'tufa', podiumMaterial: 'travertine', detail: 'low' }, mul(d.m, T(0, 0.03, tz)));
  // Hercules playing the lyre before it, the nine Muses in an arc round the court.
  statueOnPedestal(d, 'togate', 0, 0.03, tz - R - 3.4, 0, 1.15, 'bronze', detail, 1.4);
  d.geo(new THREE.TorusGeometry(0.28, 0.04, 4, 10, Math.PI), 'gilded_bronze', 0.35, 0.03 + 1.4 + 1.25, tz - R - 3.55, { rz: Math.PI / 2 });
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.12 + (0.76 * i) / 8);
    const r = Math.min(q.hw, q.hd) * 0.82;
    const x = Math.cos(a) * r, z = tz - Math.sin(a) * r * 0.75;
    statueOnPedestal(d, i % 3 === 2 ? 'seated' : 'togate', x, 0.03, z, Math.atan2(x, z - tz), 0.95, 'marble', 'low', 1.2);
  }
  for (let k = 0; k < 4; k++) placeProp(d, 'bench_masonry', -6 + k * 4, 0.03, -q.hd + 2.2, 0);
  spots.push(
    spot(`${lm.id}:hercules`, 'inscription', 0, 0.03, tz - R - 5.2, 0),
    spot(`${lm.id}:poet`, 'npc', 0, 0.03, -q.hd + 4.4, Math.PI),
    spot(`${lm.id}:audience`, 'sit', -2, 0.48, -q.hd + 2.2, 0),
    spot(`${lm.id}:temple`, 'door', 0, res.baseHeight, tz - R * 0.6, 0),
  );
  far.span('plaster_cream', -w / 2, 0, -dd / 2, w / 2, q.wallTop, -dd / 2 + 1);
  far.span('plaster_cream', -w / 2, 0, dd / 2 - 1, w / 2, q.wallTop, dd / 2);
  far.cyl('marble', 0, 4, tz, R, 8, 10);
  return finish(lm.id, d, spots, far);
}

// ---------------------------------------------------------------- Porticus Vipsania (Agrippa's map)

let mapMaterial: THREE.MeshStandardMaterial | null = null;

type LL = [number, number];
const MARE: LL[] = [[-5.5, 36.1], [-2, 36.7], [0, 38.7], [0.5, 40.5], [3.2, 41.9], [3, 43.2], [4.8, 43.4], [7.5, 43.8], [8.9, 44.4], [10.2, 43.9], [11, 42.4], [12.5, 41.4], [14.2, 40.8], [15.6, 40.1], [16, 38.9], [15.6, 38], [16.6, 38.4], [17.2, 39], [16.5, 39.7], [17.1, 40.5], [18.5, 40.1], [18, 40.6], [16, 41.9], [14, 42.6], [13.6, 43.5], [12.3, 44.6], [12.4, 45.4], [13.8, 45.6], [14.5, 45.2], [16, 43.5], [18.5, 42.4], [19.5, 41.8], [19.4, 40.4], [20.2, 39.4], [21.1, 38.3], [21.6, 36.9], [22.5, 36.4], [23.1, 37.6], [24, 38.2], [22.8, 39.3], [23.5, 40], [24.4, 40.9], [26, 40.7], [26.4, 40], [27, 39], [27.4, 37.6], [28, 36.7], [29.6, 36.2], [30.6, 36.8], [32, 36.5], [34, 36.3], [36, 36.9], [36, 35.5], [35.9, 34.6], [35, 33], [34.5, 31.6], [32.5, 31.1], [31, 31.6], [29.9, 31.2], [27, 31.2], [25, 31.6], [23, 32.6], [21, 32.8], [20, 31], [19, 30.3], [15.2, 32.3], [13, 32.9], [11.1, 33.3], [10.5, 35.5], [11, 36.9], [10.2, 37.2], [8.6, 36.9], [5, 36.8], [3, 36.8], [0, 35.9], [-2, 35.2], [-5.3, 35.9]];
const PONTUS: LL[] = [[28, 41.2], [29.2, 41.2], [31.5, 41.2], [33.5, 42], [36, 41.7], [38.5, 40.9], [41.5, 41.5], [41.6, 42.5], [39.8, 43.4], [38, 44.4], [36.6, 45.2], [33.5, 44.5], [32.5, 45.5], [30.6, 46.5], [29.6, 45.3], [28.6, 44.2], [27.9, 42.5]];
const RUBRUM: LL[] = [[32.5, 30], [34, 28], [38, 22], [43, 13], [43.4, 13.5], [39, 22], [35, 28], [33.5, 30]];
const PERSICUS: LL[] = [[48, 30], [51, 27.5], [56, 26.5], [56.5, 24], [52, 24], [49, 28]];
const LABELS: [string, number, number, number][] = [
  ['ROMA', 12.5, 42.3, 1.2], ['ITALIA', 14.5, 44.2, 1], ['HISPANIA', -4, 40, 1.3], ['GALLIA', 2.5, 46.8, 1.3], ['BRITANNIA', -2, 53, 1], ['GERMANIA', 10, 51.5, 1.2],
  ['DACIA', 24.5, 46.5, 1], ['THRACIA', 25.5, 42.2, 0.8], ['GRAECIA', 22, 39.2, 0.9], ['ASIA', 30, 38.8, 1.1], ['SYRIA', 38, 35, 1], ['IVDAEA', 35.4, 31.8, 0.7],
  ['ARABIA', 38, 27, 1], ['AEGYPTVS', 30.5, 26.5, 1.1], ['AFRICA', 9.5, 31.5, 1.2], ['MAVRETANIA', -4, 33, 1], ['CYRENAICA', 21.5, 30.5, 0.8], ['ARMENIA', 43, 39.8, 0.9],
  ['PARTHIA', 53, 34, 1.2], ['INDIA', 74, 25, 1.3], ['SCYTHIA', 45, 50, 1.2], ['AETHIOPIA', 33, 15, 1.1], ['OCEANVS', 60, 13, 1.4], ['MARE INTERNVM', 18, 34.6, 0.9],
];

/** Agrippa's map as a painted canvas: the inhabited world inside the Ocean, provinces lettered in red. */
function agrippaMap(): THREE.MeshStandardMaterial {
  if (mapMaterial) return mapMaterial;
  mapMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  mapMaterial.name = 'agrippa-map';
  if (typeof document === 'undefined') return mapMaterial;
  const W = 2048, H = 640;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return mapMaterial;
  const P = ([lon, lat]: LL): [number, number] => [((lon + 14) / 98) * W, ((60 - lat) / 52) * H];
  // Ocean ground, the land as a great rounded island, framed with a painted border.
  g.fillStyle = '#3f6f86';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#c8a86a';
  g.beginPath();
  g.ellipse(W * 0.47, H * 0.5, W * 0.46, H * 0.44, 0, 0, Math.PI * 2);
  g.fill();
  const poly = (pts: LL[], fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(...P(p)) : g.moveTo(...P(p))));
    g.closePath();
    g.fill();
  };
  const sea = '#4c86a0';
  poly(MARE, sea);
  poly(PONTUS, sea);
  poly(RUBRUM, sea);
  poly(PERSICUS, sea);
  g.beginPath();
  g.fillStyle = sea;
  g.ellipse(...P([51, 42]), W * 0.025, H * 0.09, 0, 0, Math.PI * 2);
  g.fill();
  // Rivers (Nile, Danube, Rhine, Euphrates and Tigris) and the great roads in red.
  const line = (pts: LL[], color: string, width: number) => {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(...P(p)) : g.moveTo(...P(p))));
    g.stroke();
  };
  line([[31.2, 31.3], [31, 28], [32.8, 24], [32.5, 19], [33, 14]], sea, 4);
  line([[8.5, 48], [12, 48.5], [17, 48], [19, 47], [21, 44.6], [25, 43.8], [28.8, 45.2]], sea, 4);
  line([[8.5, 47.5], [7.5, 49], [6.8, 51], [4.5, 52]], sea, 3);
  line([[38.5, 39], [40, 36], [43, 33.5], [47.5, 30.5]], sea, 3);
  line([[42, 37.5], [44.5, 34], [47.5, 30.5]], sea, 3);
  line([[12.5, 42], [14, 41], [16.9, 40.6]], '#8a2a20', 2);
  line([[12.5, 42], [11.4, 44.2], [9, 45.5], [7, 44], [4.4, 43.8], [1, 41.4], [-0.4, 39.5], [-3.7, 40.4]], '#8a2a20', 2);
  // Provinces lettered in red, Rome marked in gold.
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const [name, lon, lat, k] of LABELS) {
    g.fillStyle = name === 'OCEANVS' || name === 'MARE INTERNVM' ? '#dfe8ea' : '#7d1d14';
    g.font = `${Math.round(22 * k)}px Cinzel, 'Times New Roman', serif`;
    g.fillText(name, ...P([lon, lat]));
  }
  g.fillStyle = '#d6ae45';
  g.beginPath();
  g.arc(...P([12.5, 41.9]), 7, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1f1d1b';
  g.lineWidth = 14;
  g.strokeRect(7, 7, W - 14, H - 14);
  g.fillStyle = '#1f1d1b';
  g.font = `34px Cinzel, 'Times New Roman', serif`;
  g.fillText('ORBIS TERRARVM', W * 0.5, 36);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  mapMaterial.map = tex;
  mapMaterial.needsUpdate = true;
  return mapMaterial;
}

function buildVipsania(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'travertine');
  // The gallery along the Via Lata: a double colonnade before a long back wall that carries the map.
  const colH = 6.2;
  const gd = 9.5; // gallery depth to the map wall
  const zb = -dd / 2 + gd;
  liteColonnade(d, [V(w / 2 - 1, 0, -dd / 2 + 1.2), V(-w / 2 + 1, 0, -dd / 2 + 1.2)].reverse().reverse(), { columnHeight: colH, spacing: 3.2, depth: gd - 1.2, back: 'none', material: 'marble', detail, order: 'ionic' });
  liteColonnade(d, [V(w / 2 - 1, 0, -dd / 2 + 1.2 + gd / 2), V(-w / 2 + 1, 0, -dd / 2 + 1.2 + gd / 2)], { columnHeight: colH, spacing: 3.6, depth: 0.5, back: 'none', material: 'marble', detail, order: 'ionic' });
  piercedWall(d, -w / 2, zb, w / 2, zb, 0, colH + 3, 0.8, 'plaster_white', [{ x: w / 2, w: 3, h: 4, arched: true }]);
  for (const sx of [-1, 1]) wallRun(d, sx * (w / 2 - 0.4), -dd / 2 + 1, sx * (w / 2 - 0.4), zb, 0, colH + 3, 0.8, 'plaster_white');
  // The map: painted on the wall's front face (towards the street), a frame round it.
  const mw = w - 8, mh = mw / 3.2;
  const mapY = 0.9;
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -w / 2 + 2 : 1.8, x1 = sx < 0 ? -1.8 : w / 2 - 2;
    const g = new THREE.PlaneGeometry(x1 - x0, Math.min(mh, colH + 1.6));
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    // Facing −z, the viewer's left is +x: the map runs from x = w/2 − 2 (u = 0) to −w/2 + 2 (u = 1),
    // and each half of the wall (the door is in the middle) shows its own part of it.
    for (let i = 0; i < uv.count; i++) uv.setX(i, (w / 2 - 2 - x1 + uv.getX(i) * (x1 - x0)) / (w - 4));
    g.rotateY(Math.PI);
    g.translate((x0 + x1) / 2, mapY + Math.min(mh, colH + 1.6) / 2, zb - 0.02);
    d.b.add(g, agrippaMap(), d.m, { uv: 'keep', castShadow: false });
    d.span('wood_dark', x0 - 0.12, mapY - 0.12, zb - 0.06, x1 + 0.12, mapY, zb);
  }
  // Behind: a garden court with hedges and benches.
  const cz0 = zb + 0.8;
  d.span('gravel', -w / 2 + 1, -0.2, cz0, w / 2 - 1, 0.03, dd / 2 - 1);
  for (const [ax, az, bx, bz] of [[w / 2, cz0, w / 2, dd / 2], [w / 2, dd / 2, -w / 2, dd / 2], [-w / 2, dd / 2, -w / 2, cz0]] as const) wallRun(d, ax, az, bx, bz, 0, 4, 0.6, 'plaster_cream');
  for (let i = 0; i < 5; i++) tree(ctx, d, i % 2 ? 'plane' : 'umbrella_pine', -w / 2 + 6 + i * ((w - 12) / 4), 0.03, (cz0 + dd / 2) / 2, 10);
  hedge(d, -w / 2 + 2, cz0 + 2, w / 2 - 2, cz0 + 2.6, 0.03, 0.8);
  inscription(d, ['PORTICVS VIPSANIA'], 0, colH + 1.2, -dd / 2 + 0.4, 6, 0.6);
  spots.push(
    spot(`${lm.id}:map`, 'inscription', -w * 0.2, 0, zb - 3.2, 0),
    spot(`${lm.id}:map2`, 'vista', w * 0.25, 0, zb - 4.5, 0),
    spot(`${lm.id}:geographer`, 'npc', 0, 0, zb - 2, Math.PI),
    spot(`${lm.id}:street`, 'door', 0, 0, -dd / 2 - 1, 0),
  );
  far.span('plaster_white', -w / 2, 0, zb, w / 2, colH + 3, zb + 0.8);
  far.span('roof_tile', -w / 2, colH, -dd / 2 + 1, w / 2, colH + 1, zb);
  return finish(lm.id, d, spots, far);
}

// ---------------------------------------------------------------- Iseum Campense

/** A sphinx: lion body couchant on a plinth, human head with a nemes, facing −z. */
function sphinx(d: Draw, x: number, y: number, z: number, rot: number, s: number, mat: MaterialId, detail: Detail) {
  const f = d.at(x, y, z, rot);
  f.box('travertine', 0, 0.25 * s, 0, 0.9 * s, 0.5 * s, 2.6 * s, { collide: true });
  f.ellipsoid(mat, 0, 0.5 * s + 0.35 * s, 0.25 * s, 0.38 * s, 0.32 * s, 1.0 * s, { seg: detail === 'high' ? [10, 6] : [6, 4] });
  for (const sx of [-1, 1]) f.box(mat, sx * 0.2 * s, 0.6 * s, -0.75 * s, 0.14 * s, 0.14 * s, 0.7 * s);
  f.ellipsoid(mat, 0, 1.2 * s, -0.55 * s, 0.22 * s, 0.28 * s, 0.24 * s, { seg: [8, 6] });
  f.box(mat, 0, 1.05 * s, -0.45 * s, 0.5 * s, 0.32 * s, 0.22 * s);
}

/** A reclining river god (the Nile, the Tiber): a long draped body on a plinth, an urn under the arm. */
function riverGod(d: Draw, x: number, y: number, z: number, rot: number, s: number, mat: MaterialId) {
  const f = d.at(x, y, z, rot);
  f.box('marble', 0, 0.35 * s, 0, 3.4 * s, 0.7 * s, 1.4 * s, { collide: true });
  f.ellipsoid(mat, 0.2 * s, 0.9 * s, 0, 1.4 * s, 0.32 * s, 0.5 * s, { rz: 0.12, seg: [10, 6] });
  f.ellipsoid(mat, -1.0 * s, 1.35 * s, 0.05 * s, 0.4 * s, 0.6 * s, 0.4 * s, { rz: -0.5, seg: [8, 6] });
  f.ellipsoid(mat, -1.15 * s, 1.95 * s, 0, 0.2 * s, 0.24 * s, 0.2 * s, { seg: [8, 6] });
  f.cyl('terracotta', -1.45 * s, 1.0 * s, 0.35 * s, 0.22 * s, 0.5 * s, 8, { rz: 1.2 });
}

/** An Egyptian pylon: two battered towers with a cavetto cornice either side of a gate. */
function pylon(d: Draw, w: number, H: number, depth: number, gate: number, detail: Detail) {
  const tw = (w - gate) / 2;
  for (const sx of [-1, 1]) {
    const cx = sx * (gate / 2 + tw / 2);
    // Battered tower: a box tapering inward as it rises (built as a frustum).
    const geo = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).toNonIndexed();
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const top = pos.getY(i) > 0;
      pos.setXYZ(i, pos.getX(i) * (top ? tw * 0.86 : tw), pos.getY(i) * H + H / 2, pos.getZ(i) * (top ? depth * 0.8 : depth));
    }
    geo.computeVertexNormals();
    d.geo(geo, 'plaster_ochre', cx, 0, 0);
    d.solid(cx - tw / 2, 0, -depth / 2, cx + tw / 2, H, depth / 2);
    // Cavetto cornice and a torus moulding, painted bands, flag-pole slots with pennants.
    d.span('plaster_white', cx - tw * 0.45, H, -depth * 0.42, cx + tw * 0.45, H + 0.9, depth * 0.42);
    d.span('fabric_blue', cx - tw * 0.43, H - 0.5, -depth * 0.4 - 0.01, cx + tw * 0.43, H - 0.1, -depth * 0.4);
    d.span('fabric_red', cx - tw * 0.43, H - 0.9, -depth * 0.4 - 0.01, cx + tw * 0.43, H - 0.5, -depth * 0.4);
    // Painted relief fields (the pharaoh smiting, offering scenes) framed by torus mouldings.
    const zf = -depth * 0.5 + (depth - depth * 0.8) * 0.25 - 0.04;
    d.span('plaster_red', cx - tw * 0.32, H * 0.2, zf - 0.02, cx + tw * 0.32, H * 0.48, zf);
    d.span('fabric_blue', cx - tw * 0.3, H * 0.52, zf - 0.02, cx + tw * 0.3, H * 0.78, zf);
    for (const ex of [-1, 1]) d.cyl('plaster_white', cx + ex * tw * 0.45, H / 2, -depth * 0.42, 0.18, H, 6);
    for (const px of [-tw * 0.25, tw * 0.25]) {
      d.cyl('wood', cx + px, H + 3, -depth * 0.5 - 0.3, 0.12, H + 6, 6);
      d.box(detail === 'high' ? 'fabric_white' : 'fabric_red', cx + px + 0.7, H + 5, -depth * 0.5 - 0.3, 1.2, 0.8, 0.02);
    }
  }
  // The gate between: lintel with the winged sun disc.
  d.span('plaster_white', -gate / 2, H * 0.62, -depth * 0.4, gate / 2, H * 0.78, depth * 0.4, { collide: true });
  d.ellipsoid('gilded_bronze', 0, H * 0.7, -depth * 0.4 - 0.05, 0.4, 0.4, 0.05);
  d.box('gilded_bronze', 0, H * 0.7, -depth * 0.4 - 0.06, 2.6, 0.2, 0.02);
}

function buildIseum(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'travertine');
  const H = Math.max(9, lm.height * ctx.S);
  // Enclosure walls (the long sides with colonnades inside), the pylon at the N end.
  const t = 0.8;
  for (const [ax, az, bx, bz] of [[w / 2, -dd / 2, w / 2, dd / 2], [-w / 2, dd / 2, -w / 2, -dd / 2]] as const) piercedWall(d, ax, az, bx, bz, 0, 6.5, t, 'plaster_cream', [{ x: dd * 0.45, w: 2.6, h: 3.4 }]);
  liteColonnade(d, [V(-w / 2 + t + 4, 0, dd / 2 - 30), V(-w / 2 + t + 4, 0, -dd / 2 + 10)].reverse(), { columnHeight: 5, spacing: 3, depth: 4, back: 'none', material: 'marble_veined', detail, order: 'corinthian' });
  liteColonnade(d, [V(w / 2 - t - 4, 0, -dd / 2 + 10), V(w / 2 - t - 4, 0, dd / 2 - 30)].reverse(), { columnHeight: 5, spacing: 3, depth: 4, back: 'none', material: 'marble_veined', detail, order: 'corinthian' });
  const pz = -dd / 2 + 2.5;
  pylon(d.at(0, 0, pz), w - 2, H, 5, 5, detail);
  // Dromos: pairs of small obelisks and sphinxes down to the temple.
  const tz0 = -dd / 2 + 52;
  for (let k = 0; k < 6; k++) {
    const z = pz + 8 + k * ((tz0 - pz - 14) / 5);
    for (const sx of [-1, 1]) {
      if (k % 2 === 0) obelisk(d.b, { height: 6, hieroglyphs: true, detail: k === 0 ? detail : 'low', pedestal: 1.2 }, mul(d.m, T(sx * 5.2, 0, z)));
      else sphinx(d, sx * 4.6, 0, z, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 1.3, 'basalt', detail);
    }
  }
  d.span('paving_travertine', -3, -0.2, pz + 3, 3, 0.04, tz0);
  // The temple of Isis: a Roman temple on a podium, dressed with Egyptian cornices and statues.
  const tw = Math.min(w * 0.55, 20), td = 28;
  const tt = fittedTemple(d.at(0, 0, tz0 + td / 2), tw, td, { order: 'corinthian', plan: 'prostyle', front: 6, material: 'marble', podiumMaterial: 'basalt', cellaMaterial: 'plaster_white', roofMaterial: 'gilded_bronze', detail, maxHighColumns: 6 }, `${lm.id}:isis`);
  spots.push(...tt.spots.map((s) => ({ ...s, position: s.position.clone().add(V(0, 0, tz0 + td / 2)) })));
  for (const sx of [-1, 1]) {
    // Baboons of Thoth and a falcon on posts before the steps.
    d.box('basalt', sx * (tw / 2 + 1.6), 0.6, tz0 - 1, 1.0, 1.2, 1.0, { collide: true });
    d.ellipsoid('basalt', sx * (tw / 2 + 1.6), 1.6, tz0 - 1, 0.4, 0.5, 0.35, { seg: [8, 6] });
  }
  // The pool of the Nile with the reclining Nile and Tiber colossi.
  const nz = tz0 + td + 12;
  pool(d, 0, 0.03, nz, 18, 7, 'marble', 0.5, 0.6);
  riverGod(d, -5, 0.03, nz + 5.4, Math.PI, 1.4, 'marble_veined');
  riverGod(d, 5, 0.03, nz + 5.4, 0, 1.4, 'marble');
  // The Serapeum: a great hemicycle at the S end with Serapis enthroned.
  const R = Math.min(w / 2 - 2, 16);
  apse(d.b, { radius: R, height: H * 0.8, thickness: 1.4, material: 'brick', domeMaterial: 'plaster_white', semidome: false, niches: detail === 'high' ? 9 : 5, colonnade: { order: 'corinthian', count: 8 }, detail: 'low', collide: true }, mul(d.m, T(0, 0.03, dd / 2 - R - 2)));
  seatedDeity(d.b, mul(d.m, TRS(0, 0.03, dd / 2 - 4.5, 0, 0, 0, 2.2)), { material: 'basalt', detail, throneMaterial: 'marble' });
  altar(d, 0, 0.03, dd / 2 - R - 4, 1.4, 1.0, 0.95, 'marble');
  // Linen-robed priests' gear: sistra stands, a water jar on a stand.
  placeProp(d, 'lampstand', -2.2, 0.03, tz0 - 2.4, 0);
  placeProp(d, 'lampstand', 2.2, 0.03, tz0 - 2.4, 0);
  placeProp(d, 'dolium', 3.2, 0.03, nz - 4.5, 0);
  togate(d.b, mul(d.m, TRS(-1.6, 0.03, tz0 - 3.4, 0, 0, 0, 1)), { material: 'plaster_white', detail: 'low' });
  inscriptionPanel(d.b, { lines: ['ISIDI ET SERAPI'], width: 5, height: 0.8, style: 'painted', ground: '#e8d9a8', ink: '#2d5da1', interpunct: false }, mul(d.m, T(0, H * 0.7 - 0.1, pz - 2.62)), { depth: 0.04 });
  spots.push(
    spot(`${lm.id}:pylon`, 'door', 0, 0.04, pz - 4, 0),
    spot(`${lm.id}:priest`, 'npc', 1.2, 0.04, tz0 - 4, Math.PI),
    spot(`${lm.id}:obelisk`, 'inscription', 4, 0.04, pz + 8, -Math.PI / 2),
    spot(`${lm.id}:nile`, 'vista', 0, 0.03, nz - 5, 0),
    spot(`${lm.id}:serapis`, 'shrine', 0, 0.03, dd / 2 - R - 6, 0),
    spot(`${lm.id}:sistrum`, 'npc', -3, 0.03, nz - 4.6, 0),
  );
  far.span('plaster_ochre', -w / 2 + 1, 0, pz - 2.5, w / 2 - 1, H, pz + 2.5);
  far.span('plaster_cream', -w / 2, 0, -dd / 2, -w / 2 + 1, 6.5, dd / 2);
  far.span('plaster_cream', w / 2 - 1, 0, -dd / 2, w / 2, 6.5, dd / 2);
  far.span('marble', -tw / 2, 0, tz0, tw / 2, 12, tz0 + td);
  return finish(lm.id, d, spots, far, 900);
}

export const builders: LandmarkBuilder[] = [
  { handles: ['saepta-julia'], build: buildSaepta },
  { handles: ['diribitorium'], build: buildDiribitorium },
  { handles: ['porticus-minucia-frumentaria'], build: buildMinucia },
  { handles: ['porticus-philippi'], build: buildPhilippi },
  { handles: ['porticus-vipsania'], build: buildVipsania },
  { handles: ['iseum-campense'], build: buildIseum },
];

export { porch, roundBasin, tiledRoof };
