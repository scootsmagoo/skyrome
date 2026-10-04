/**
 * Pompey's complex (55 BC) and the Republican temples beside it (§3.27):
 * - theatre-pompey: Rome's first stone theatre — a cavea ≈ 156 m across curving to the W, a
 *   travertine arcade of three storeys, a scaenae frons of coloured marble columns (restored by
 *   Domitian), the stage building opening E through three doors onto the porticus.
 * - temple-venus-victrix: at the top centre of the cavea, whose seats are "steps up to the temple";
 *   the shrines of Honos, Virtus and Felicitas (FLAG) beside it.
 * - porticus-pompeiana: the four-sided portico garden behind the stage — double rows of plane trees
 *   in groves, fountains on the axis, statues, the Hecatostylon (Hall of a Hundred Columns) on the
 *   N side, and the marble arch where Augustus set up Pompey's statue.
 * - curia-pompey: the hall where Caesar fell, walled up by Augustus as a locus sceleratus.
 * - largo-argentina-temples: the four Republican temples A–D in a row facing E on Domitian's
 *   travertine paving, B being the round temple of Fortuna Huiusce Diei.
 */
import * as THREE from 'three';
import { plainArch } from '../../../arch/classical/arch';
import { tholos } from '../../../arch/classical/tholos';
import { placeProp } from '../../../arch/props';
import { LANDMARK_BY_ID } from '../../../data/atlas';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import {
  T, V, altar, broadTree, cornice, dims, draw, farDraw, finish, flight, flightLength, hedge, inscription, mul, piercedWall, plinth, roundBasin, spot,
  statueOnPedestal, tiledRoof, liftAll,
} from './generic-common';
import { tree } from './generic-world';
import { liteColonnade } from './generic-civic-lib';
import { curiaHall, gable, porch } from './generic-civic';
import { aedicula, fittedTemple, fitTemple, templeMaterials } from './generic-sacred';
import { curvedPlinth, halfCircle, localOf, profileHeightAt, theatre, theatreProfile } from './generic-venues';
import { temple } from '../../../arch/classical/temple';

// ---------------------------------------------------------------- shared layout

/** The theatre's cavea in its own frame (game m), shared with the temple at its top. */
function pompeyTheatre(S: number) {
  const w = 156 * S, dd = 113 * S;
  // Orchestra centre ~(−867, −297): 21 m E of the footprint centre, i.e. local z = +21 m.
  const zc = 21 * S;
  const Ro = Math.min(w / 2, zc + dd / 2);
  const r0 = 23 * S;
  const H = 35 * S;
  const storeys = 3;
  return { w, dd, zc, Ro, r0, H, storeys, prof: theatreProfile({ Ro, r0, H, storeys }) };
}

// ---------------------------------------------------------------- theatre

function buildTheatrePompey(ctx: LandmarkContext): LandmarkBuild {
  const { lm } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const spots: Spot[] = [];
  const L = pompeyTheatre(ctx.S);
  curvedPlinth(d, ctx, L.w / 2, L.zc, L.dd / 2, L.Ro, L.zc, -1);
  // Where the temple sits on the axis at the top of the cavea, no aisle is cut.
  const vv = LANDMARK_BY_ID['temple-venus-victrix'];
  const tp = vv ? localOf(ctx, vv) : { x: 0, z: -28 };
  const rT = L.zc - tp.z; // radius of the temple centre from the orchestra
  const half = Math.atan2(15 * ctx.S + 2, rT) / Math.PI;
  const res = theatre(d, ctx, {
    zc: L.zc, Ro: L.Ro, r0: L.r0, H: L.H, storeys: L.storeys, bays: 48,
    stageW: 95 * ctx.S, stageD: 6.5, zBack: L.dd / 2, sceneW: L.w, frons: 3, backDoors: true, masts: true,
    skip: [[0.5 - half, 0.5 + half]],
  }, spots, far);
  // Shrines of Honos, Virtus and Felicitas on the top walk either side of the temple (FLAG).
  const top = halfCircle(L.r0 + res.reach - 1.1, L.zc, 40, 0);
  for (const i of [13, 27]) {
    const p = top[i];
    // Face the orchestra: local −z towards the centre.
    aedicula(d.at(p.x, res.seatTop, p.z, Math.atan2(p.x, p.z - L.zc)), 0, 0, 0, 2.6, 'marble', ctx.detail);
  }
  inscription(d, ['CN POMPEIVS CN F MAGNVS COS III'], 0, L.H * 0.36, L.zc - L.Ro - 0.05, 9, 0.9);
  spots.push(spot(`${lm.id}:inscription`, 'inscription', 0, 0, L.zc - L.Ro - 3, 0));
  return finish(lm.id, d, spots, far, 1000);
}

// ---------------------------------------------------------------- temple of Venus Victrix

function buildVenusVictrix(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const L = pompeyTheatre(ctx.S);
  // This temple faces E (local −z), the theatre W: our z runs opposite to the theatre's.
  const th = LANDMARK_BY_ID['theatre-pompey'];
  const S = ctx.S;
  // Theatre-local z of our centre (the theatre's rotation is 270°, so its local z = world dx).
  const tz = th ? (lm.center[0] - th.center[0]) * S : -28;
  // Radius from the orchestra centre of a point at our local z (on the axis).
  const radiusAt = (z: number) => L.zc - (tz - z);
  const seatAt = (z: number) => profileHeightAt(L.prof.profile, radiusAt(z) - L.r0);
  const floorY = L.prof.height + 0.88;
  // The podium-substructure: from the ground to the temple floor over the whole footprint.
  const zFront = -dd / 2;
  d.span('travertine', -w / 2, -0.5, zFront, w / 2, floorY, dd / 2, { collide: true });
  cornice(d, -w / 2, zFront, w / 2, dd / 2, floorY - 0.4, 0.4, 0.25, 'marble');
  // The back of the substructure projects beyond the cavea: dress it like the facade, three storeys
  // of blind arches between pilasters with a cornice at each floor.
  const storeyH = floorY / 3;
  for (let k = 0; k < 3; k++) {
    const y = k * storeyH;
    for (const f of [d.at(0, 0, dd / 2, Math.PI), d.at(w / 2, 0, dd / 4, -Math.PI / 2), d.at(-w / 2, 0, dd / 4, Math.PI / 2)]) {
      const len = f === undefined ? 0 : Math.abs(f.yaw) > 3 ? w : dd / 2;
      const n = Math.max(2, Math.round(len / 4.2));
      for (let i = 0; i < n; i++) {
        const x = -len / 2 + (i + 0.5) * (len / n);
        f.span('tufa', x - 1.0, y + 0.6, -0.04, x + 1.0, y + storeyH * 0.78, 0);
        f.cyl('tufa', x, y + storeyH * 0.78, -0.02, 1.0, 0.04, 10, { rx: Math.PI / 2 });
        f.span('travertine', x - len / n / 2, y, -0.25, x - len / n / 2 + 0.5, y + storeyH - 0.4, 0);
      }
      f.span('travertine', -len / 2, y + storeyH - 0.5, -0.4, len / 2, y + storeyH - 0.1, 0);
    }
  }
  // The great stair: from the seats in front of the podium up to the temple floor, along the axis.
  const stairW = w * 0.55;
  let zs = zFront;
  for (let i = 0; i < 60; i++) {
    const need = (floorY - seatAt(zs)) / 0.2 * 0.34;
    if (zs + need <= zFront + 0.05) break;
    zs -= 0.5;
  }
  const y0 = seatAt(zs);
  const zTop = flight(d, 0, zs, stairW, y0, floorY, 'marble');
  // Sloping marble parapets either side of the flight (the seats run up beside them), ending in
  // pedestals at the foot and against the podium at the top.
  const run = zTop - zs, rise = floorY - y0;
  const len = Math.hypot(run, rise), pitch = Math.atan2(rise, run);
  for (const sx of [-1, 1]) {
    const x = sx * (stairW / 2 + 0.3);
    d.box('marble', x, (y0 + floorY) / 2 + 0.55, (zs + zTop) / 2, 0.6, 1.1, len, { rx: -pitch, collide: true });
    d.box('marble', x, (y0 + floorY) / 2 - 0.2, (zs + zTop) / 2, 0.5, 0.6, len, { rx: -pitch });
    d.box('marble', x, y0 + 0.75, zs + 0.3, 0.9, 1.5, 0.9, { collide: true });
    if (detail === 'high') statueOnPedestal(d, 'togate', x, y0 + 1.5, zs + 0.3, 0, 0.8, 'bronze', 'low', 0.05);
  }
  // The temple: hexastyle prostyle Corinthian in marble, on a low podium of its own.
  const fit = fitTemple(w * 0.96, dd * 0.92, { order: 'corinthian', plan: 'prostyle', front: 6, material: 'marble', podiumMaterial: 'marble', cellaMaterial: 'marble', roofMaterial: 'gilded_bronze', podiumHeight: 0.66, detail, maxHighColumns: 10 });
  temple(d.b, fit.spec, mul(d.m, T(0, floorY, fit.offsetZ)));
  const Lt = fit.layout;
  statueOnPedestal(d, 'seated', 0, floorY + Lt.podiumHeight, fit.offsetZ + (Lt.cella.z0 + Lt.cella.z1) / 2 + 1, 0, 1.6, 'gilded_bronze', detail, 1.2);
  altar(d, 0, floorY, fit.offsetZ + Lt.podiumFront - 1.6, 1.4, 0.9, 0.9, 'marble');
  spots.push(
    spot(`${lm.id}:door`, 'door', 0, floorY + Lt.podiumHeight, fit.offsetZ + Lt.cella.z0 - 0.6, 0),
    spot(`${lm.id}:altar`, 'shrine', 0, floorY, fit.offsetZ + Lt.podiumFront - 3.2, 0),
    spot(`${lm.id}:vista`, 'vista', w * 0.3, floorY, zFront + 1, Math.PI),
    spot(`${lm.id}:stair`, 'sit', -stairW / 4, y0 + 1, zs + 1.6, Math.PI),
  );
  far.span('travertine', -w / 2, 0, zFront, w / 2, floorY, dd / 2);
  far.span('marble', -w * 0.4, floorY, -dd * 0.35, w * 0.4, floorY + Lt.H, dd * 0.45);
  tiledRoof(far, 'gable', 0, dd * 0.05, w * 0.8, dd * 0.8, floorY + Lt.H, 'low', { axis: 'z', pitchDeg: 14 });
  return finish(lm.id, d, spots, far, 1000);
}

// ---------------------------------------------------------------- porticus Pompeiana

function buildPorticusPompeiana(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const rng = ctx.rng.fork('pp');
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  // Local frame: −z = E (the Curia end), +z = W (the theatre's stage), −x = N (the Hecatostylon).
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'travertine');
  const colH = 7.2;
  const depth = 5.2;
  const t = 0.8;
  const wallTop = colH + 3.2;
  const hw = w / 2 - t - depth, hd = dd / 2 - t - depth;
  // Colonnades round the garden (the W side backs onto the theatre's stage building: no wall).
  const P = (x: number, z: number) => V(x, 0, z);
  liteColonnade(d, [P(-hw, -hd), P(-hw, hd), P(hw, hd), P(hw, -hd)], { columnHeight: colH, spacing: 3.2, depth, back: 'none', closed: true, material: 'marble', detail, order: 'corinthian' });
  // Hecatostylon: a second, outer row on the N side (a hall of a hundred columns).
  liteColonnade(d, [P(-hw - depth * 0.5, hd), P(-hw - depth * 0.5, -hd)].reverse(), { columnHeight: colH, spacing: 3.2, depth: depth * 0.5, back: 'none', material: 'marble_veined', detail, order: 'corinthian' });
  // Walls on N, S and E (the E wall opens on the axis into the Curia Pompeia).
  const curiaGap = 4.2;
  piercedWall(d, -w / 2, -dd / 2, w / 2, -dd / 2, 0, wallTop, t, 'plaster_cream', [{ x: w / 2, w: curiaGap, h: 6, arched: true }, { x: w * 0.15, w: 3, h: 4.4 }, { x: w * 0.85, w: 3, h: 4.4 }]);
  piercedWall(d, w / 2, -dd / 2, w / 2, dd / 2, 0, wallTop, t, 'plaster_cream', [{ x: dd * 0.3, w: 3, h: 4.4 }, { x: dd * 0.7, w: 3, h: 4.4 }]);
  piercedWall(d, -w / 2, dd / 2, -w / 2, -dd / 2, 0, wallTop, t, 'plaster_cream', [{ x: dd * 0.3, w: 3, h: 4.4 }, { x: dd * 0.7, w: 3, h: 4.4 }]);
  cornice(d, -w / 2, -dd / 2, w / 2, dd / 2, wallTop - 0.4, 0.4, 0.15, 'travertine');
  // Lean-to roofs over the colonnades, a shed roof over the stage end too.
  // Garden: gravel walks, four groves of plane trees in double rows, fountains along the axis.
  const gx = hw - 1.6, gz = hd - 1.6;
  d.span('gravel', -gx, -0.2, -gz, gx, 0.03, gz);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x0 = sx * 4.5, x1 = sx * (gx - 2), z0 = sz * 4, z1 = sz * (gz - 2);
      d.span('grass', Math.min(x0, x1), 0.03, Math.min(z0, z1), Math.max(x0, x1), 0.07, Math.max(z0, z1));
      hedge(d, Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.min(z0, z1) + 0.6, 0.03, 0.8);
      hedge(d, Math.min(x0, x1), Math.max(z0, z1) - 0.6, Math.max(x0, x1), Math.max(z0, z1), 0.03, 0.8);
      // Double rows of planes in each grove.
      const rows = [0.3, 0.7];
      const nz = detail === 'high' ? 6 : 4;
      for (const f of rows) {
        for (let k = 0; k < nz; k++) {
          const x = x0 + (x1 - x0) * f;
          const z = z0 + ((z1 - z0) * (k + 0.5)) / nz;
          tree(ctx, d, 'plane', x, 0.05, z, 12 + rng.range(-1.5, 2));
        }
      }
    }
  }
  // Fountains on the E–W axis, a canal between them, statues (the fourteen nations) along the walks.
  for (const z of [-gz * 0.6, 0, gz * 0.6]) {
    roundBasin(d, 0, 0.03, z, z === 0 ? 2.8 : 2.0, 'marble', 0.55, detail);
    if (z === 0) statueOnPedestal(d, 'seated', 0, 0.58, 0, Math.PI, 0.8, 'bronze', detail, 0.6);
  }
  for (let k = 0; k < 7; k++) {
    for (const sx of [-1, 1]) {
      const z = -gz + 3 + k * ((2 * gz - 6) / 6);
      if (Math.abs(z) < 4) continue;
      statueOnPedestal(d, k % 3 === 1 ? 'seated' : 'togate', sx * 3.2, 0.03, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 1.0, k % 2 ? 'bronze' : 'marble', 'low', 1.3);
    }
  }
  for (let k = 0; k < 8; k++) placeProp(d, 'bench_masonry', (k % 2 ? 1 : -1) * 2.0, 0.03, -gz + 5 + Math.floor(k / 2) * ((2 * gz - 10) / 3), k % 2 ? -Math.PI / 2 : Math.PI / 2);
  // Pompey's statue on its marble arch, set up by Augustus opposite the theatre's royal door.
  const az = hd - 3;
  plainArch(d.b, { span: 3.2, height: 4.8, pier: 1.0, depth: 1.6, material: 'marble', detail }, mul(d.m, T(0, 0.03, az)));
  statueOnPedestal(d, 'togate', 0, 0.03 + 4.8 + 3.2 * 0.35 + 0.1, az, 0, 1.25, 'bronze', detail, 0.5);
  inscription(d, ['CN POMPEIVS MAGNVS'], 0, 4.3, az - 0.82, 2.6, 0.45);
  // The Curia's doorway framed in the E wall: steps up, a pair of columns.
  for (const sx of [-1, 1]) d.cyl('marble', sx * (curiaGap / 2 + 0.5), colH / 2, -dd / 2 + t + 0.6, 0.4, colH, 12, { collide: true });
  spots.push(
    spot(`${lm.id}:pompey`, 'inscription', 0, 0.03, az - 3, 0),
    spot(`${lm.id}:fountain`, 'shrine', 0, 0.03, -3.6, 0),
    spot(`${lm.id}:bench`, 'sit', -2, 0.03, -gz + 5, Math.PI / 2),
    spot(`${lm.id}:lovers`, 'npc', 2.5, 0.03, gz * 0.3, -Math.PI / 2),
    spot(`${lm.id}:poet`, 'npc', -hw + 0.8, 0.3, 0, Math.PI / 2),
    spot(`${lm.id}:hecatostylon`, 'vista', -hw - 2, 0.3, -hd + 4, Math.PI),
    spot(`${lm.id}:curia`, 'door', 0, 0.03, -dd / 2 + t + 2.4, Math.PI),
  );
  far.span('plaster_cream', -w / 2, 0, -dd / 2, w / 2, wallTop, -dd / 2 + 1);
  far.span('plaster_cream', -w / 2, 0, -dd / 2, -w / 2 + 1, wallTop, dd / 2);
  far.span('plaster_cream', w / 2 - 1, 0, -dd / 2, w / 2, wallTop, dd / 2);
  return finish(lm.id, d, spots, far, 800);
}

// ---------------------------------------------------------------- Curia Pompeia

function buildCuriaPompey(ctx: LandmarkContext): LandmarkBuild {
  const { lm } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const H = Math.max(7.5, lm.height * ctx.S + 1.2);
  const r = curiaHall(d, ctx, w, dd, H, lm.id, spots, { walledUp: true, wallMat: 'tufa', statue: false });
  // Votive lamps and wilted wreaths at the bricked-up door; the empty base where Pompey's statue stood.
  for (let i = 0; i < 4; i++) placeProp(d, 'oil_lamp', -0.9 + i * 0.6, r.floor, r.z0 - 0.4, i, { collide: false });
  d.geo(new THREE.TorusGeometry(0.28, 0.05, 4, 10), 'foliage_olive', 0.7, r.floor + 1.1, r.z0 + 0.05);
  d.span('marble', -1.0, r.floor, r.z1 - 3.2, 1.0, r.floor + 1.6, r.z1 - 1.8, { collide: true });
  spots.push(spot(`${lm.id}:ghost`, 'npc', 1.8, 0, r.z0 - 2.4, 0), spot(`${lm.id}:lamps`, 'shrine', 0, r.floor, r.z0 - 0.9, 0));
  far.span('tufa', -w / 2, 0, r.z0, w / 2, H, r.z1);
  return finish(lm.id, d, spots, far);
}

// ---------------------------------------------------------------- Largo Argentina

function buildLargoArgentina(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const S = ctx.S;
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'travertine');
  d.span('paving_travertine', -w / 2, -0.2, -dd / 2, w / 2, 0.05, dd / 2);
  // Local positions (atlas notes): N→S along local x (rot 90 → lx = dz, lz = −dx).
  const C = lm.center;
  const loc = (x: number, z: number) => ({ x: (z - C[1]) * S, z: -(x - C[0]) * S });
  const A = loc(-629, -339), B = loc(-623, -308), Cc = loc(-630, -284), D = loc(-634, -262);
  const rep = { podiumMaterial: 'tufa' as const, cellaMaterial: 'plaster_white' as const, roofMaterial: 'roof_tile' as const };
  // Temple A (Juturna?): peripteral, rebuilt with tufa columns stuccoed white.
  const ta = fittedTemple(d.at(A.x, 0.05, A.z), 9.6, Math.min(16.5, 2 * (dd / 2 - A.z) - 0.6), { order: 'ionic', plan: 'peripteral', front: 6, material: 'plaster_white', ...rep, detail }, `${lm.id}:A`);
  // Temple B (Fortuna Huiusce Diei): round, on a podium with a frontal stair; the colossal acrolith inside.
  const RB = 9.5 * S;
  const tb = tholos(d.b, { radius: RB * 0.8, columns: 18, order: 'corinthian', base: 'podium', material: 'plaster_white', cellaMaterial: 'tufa', podiumMaterial: 'tufa', detail: 'low' }, mul(d.m, T(B.x, 0.05, B.z)));
  // Temple C (Feronia, the oldest): small prostyle on a high tufa podium.
  const tc = fittedTemple(d.at(Cc.x, 0.05, Cc.z), 9.8, Math.min(15, 2 * (dd / 2 - Cc.z) - 0.6), { order: 'tuscan', plan: 'prostyle', front: 4, material: 'plaster_white', ...rep, podiumHeight: 2.6, detail }, `${lm.id}:C`);
  // Temple D (Lares Permarini?): the largest, prostyle hexastyle, running back past the paving.
  const td = fittedTemple(d.at(D.x, 0.05, D.z + 2), 12.4, 21, { order: 'ionic', plan: 'prostyle', front: 6, material: 'travertine', ...rep, detail, maxHighColumns: 4 }, `${lm.id}:D`);
  for (const [k, t] of [['A', ta], ['C', tc], ['D', td]] as const) spots.push(...t.spots.map((s) => ({ ...s, id: s.id + k, position: s.position.clone().add(V(k === 'A' ? A.x : k === 'C' ? Cc.x : D.x, 0.05, k === 'A' ? A.z : k === 'C' ? Cc.z : D.z + 2)) })));
  altar(d, B.x, 0.05, B.z - RB - 3.2, 1.6, 1.0, 1.0, 'travertine');
  spots.push(
    spot(`${lm.id}:fortuna`, 'shrine', B.x, 0.05, B.z - RB - 5, 0),
    spot(`${lm.id}:fortunaDoor`, 'door', B.x, tb.baseHeight, B.z - RB * 0.6, 0),
    spot(`${lm.id}:square`, 'vista', 0, 0.05, -dd / 2 + 2, 0),
  );
  for (const p of [A, Cc, D]) far.span('plaster_white', p.x - 5, 0, p.z - 7, p.x + 5, 9, p.z + 7);
  far.cyl('plaster_white', B.x, 4.5, B.z, RB * 0.85, 9, 10);
  return finish(lm.id, d, spots, far);
}

export const builders: LandmarkBuilder[] = liftAll([
  { handles: ['theatre-pompey'], build: buildTheatrePompey },
  { handles: ['temple-venus-victrix'], build: buildVenusVictrix },
  { handles: ['porticus-pompeiana'], build: buildPorticusPompeiana },
  { handles: ['curia-pompey'], build: buildCuriaPompey },
  { handles: ['largo-argentina-temples'], build: buildLargoArgentina },
]);

export { flightLength, gable, porch, templeMaterials };
