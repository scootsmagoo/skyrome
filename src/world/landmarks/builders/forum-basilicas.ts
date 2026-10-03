/**
 * The two basilicas that close the long sides of the Forum.
 *
 * Basilica Iulia (S side): raised on seven steps (gaming boards scratched into them), a two-storey
 * marble arcade on three sides with Doric and Ionic half-columns, an enterable ground floor of
 * five aisles on piers (nave of coloured marble, aisles of white), the four tribunals of the
 * centumviral court in the nave divided by curtains, galleries over the aisles, a clerestory and
 * tiled roofs.
 *
 * Basilica Paulli / Aemilia (N side): the two-storey Porticus of Gaius and Lucius with the
 * Tabernae Novae of the money-changers behind it (walk-in shops), the dedication to Lucius
 * Caesar, and the tall hall behind with its clerestory (the hall itself is not enterable).
 */
import * as THREE from 'three';
import { archway } from '../../../arch/classical/arch';
import { T, TRS, mul } from '../../../arch/common/geom';
import { stairs } from '../../../arch/common/stairs';
import { Draw } from '../../../arch/fabric/draw';
import { shopInterior, type ShopKind } from '../../../arch/fabric/shops';
import { doorLeaves, plankShutters, wall as fwall, type Opening } from '../../../arch/fabric/wall';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder } from '../types';
import { FORUM_INSCRIPTIONS } from './forum-data';
import { foundation, gameBoard, inscription, landmark, rect, type Part } from './forum-kit';
import { arcadeRow, gableRoof, shedRoof } from './forum-temple';

const text = (id: string) => FORUM_INSCRIPTIONS[id].latin;

// ---------------------------------------------------------------- Basilica Iulia

function basilicaIulia(p: Part) {
  const { b, d, hi } = p;
  const W = 101 * p.S;
  const Dp = 49 * p.S;
  const hw = W / 2;
  const hd = Dp / 2;
  // platform raised on seven steps on the front and both ends
  const nSteps = 7;
  const rise = 0.2;
  const run = 0.4;
  const Y = nSteps * rise;
  const sd = nSteps * run;
  const st = { width: W, rise, run, count: nSteps, material: 'marble' as MaterialId, collider: (p.main ? 'steps' : 'none') as 'steps' | 'none' };
  stairs(b, st, T(0, 0, -hd));
  stairs(b, { ...st, width: Dp - sd }, TRS(hw, 0, -hd + sd + (Dp - sd) / 2, 0, -Math.PI / 2, 0));
  stairs(b, { ...st, width: Dp - sd }, TRS(-hw, 0, -hd + sd + (Dp - sd) / 2, 0, Math.PI / 2, 0));
  const x0 = -hw + sd;
  const z0 = -hd + sd;
  b.box('concrete', 2 * (hw - sd), Y, hd * 2 - sd, T(0, Y / 2 - 0.02, (z0 + hd) / 2), { collide: p.main, castShadow: false });
  foundation(p, rect(-hw, -hd, hw, hd), 0);
  // arcade geometry
  const bay = 3.05;
  const nx = 18;
  const nz = 8;
  const ax0 = -(nx * bay) / 2;
  const ax1 = -ax0;
  const az0 = z0;
  const az1 = az0 + nz * bay;
  const depth = 0.95;
  const storeys = [
    { order: 'doric' as const, height: 6.0 },
    { order: 'ionic' as const, height: 4.8, pedestal: 0.95, tier: 'low' as const },
  ];
  const H = 10.8;
  const row = { bay, pier: 0.95, depth, storeys, material: 'marble' as MaterialId, collide: true, archDetail: 'low' as const };
  arcadeRow(p, { ...row, bays: nx }, T(ax0, Y, az0 + depth / 2));
  arcadeRow(p, { ...row, bays: nz }, TRS(ax1 - depth / 2, Y, az0, 0, -Math.PI / 2, 0));
  arcadeRow(p, { ...row, bays: nz }, TRS(ax0 + depth / 2, Y, az1, 0, Math.PI / 2, 0));
  // back wall (shops open on the street behind)
  d.span('brick', ax0, Y, az1, ax1, Y + H, hd, { collide: true });
  // floors: white marble aisles, the nave in coloured slabs
  const nz0 = az0 + 6.8;
  const nz1 = az1 - 6.8;
  const nx0 = ax0 + 2 * bay;
  const nx1 = ax1 - 2 * bay;
  d.span('marble', ax0, Y - 0.02, az0, ax1, Y + 0.02, az1, { shadow: false });
  if (hi) {
    const cols: MaterialId[] = ['marble_giallo', 'marble_pavonazzetto', 'marble_veined'];
    const n = 14;
    const m = 4;
    const cw = (nx1 - nx0) / n;
    const cd = (nz1 - nz0) / m;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < m; j++) {
        const x = nx0 + (i + 0.5) * cw;
        const z = nz0 + (j + 0.5) * cd;
        d.box(cols[(i + j) % 3], x, Y + 0.03, z, cw - 0.06, 0.02, cd - 0.06);
        if ((i + j) % 2 === 0) d.cyl('porphyry', x, Y + 0.045, z, Math.min(cw, cd) * 0.3, 0.012, 16);
      }
  }
  // interior piers and arches: two aisles all round the nave (near version only)
  const pier = 0.9;
  if (hi) {
  const yA = Y;
  const top = 6.0 - 0.96;
  const rowsZ = [az0 + 3.4, nz0, nz1, az1 - 3.4];
  const piers: [number, number][] = [];
  for (const z of rowsZ) {
    const nave = z === nz0 || z === nz1;
    for (let i = 1; i < nx; i++) {
      const x = ax0 + i * bay;
      if (nave && (x < nx0 - 0.01 || x > nx1 + 0.01)) continue;
      piers.push([x, z]);
    }
  }
  for (const x of [nx0, nx1, ax0 + bay, ax1 - bay]) {
    for (const z of [nz0 + (nz1 - nz0) / 3, nz0 + (2 * (nz1 - nz0)) / 3]) piers.push([x, z]);
  }
  for (const [x, z] of piers) {
    d.box('marble', x, yA + top / 2, z, pier, top, pier, { collide: true });
    if (hi) d.box('marble', x, yA + top - 0.1, z, pier + 0.16, 0.2, pier + 0.16);
  }
  // arches along the rows, at low detail (they sit in shade under the ceiling)
  const spring = top - 2.2;
  for (const z of rowsZ) {
    const nave = z === nz0 || z === nz1;
    for (let i = 0; i < nx; i++) {
      const x = ax0 + (i + 0.5) * bay;
      if (nave && (x < nx0 || x > nx1)) continue;
      archway(b, { span: bay - pier, springing: spring, pier: 0, depth: pier, top, material: 'marble', detail: 'low', leftPier: false, rightPier: false, archivolt: false, impost: false, keystone: false, collide: false }, T(x, yA, z));
    }
  }
  }
  // aisle ceilings / gallery floors
  const yG = Y + 6.0;
  const ceil: [number, number, number, number][] = [
    [ax0, az0 + depth, ax1, nz0 + pier / 2],
    [ax0, nz1 - pier / 2, ax1, az1],
    [ax0, nz0 + pier / 2, nx0 + pier / 2, nz1 - pier / 2],
    [nx1 - pier / 2, nz0 + pier / 2, ax1, nz1 - pier / 2],
  ];
  for (const [xa, za, xb, zb] of ceil) {
    d.span('wood_dark', xa, yG - 0.95, za, xb, yG - 0.65, zb, { shadow: false });
    d.span('concrete', xa, yG - 0.65, za, xb, yG, zb);
  }
  // the nave's upper arcade, clerestory and roofs
  const upTop = H - 0.8;
  for (const z of [nz0, nz1]) {
    for (let i = 2; i <= nx - 2; i++) d.box('marble', ax0 + i * bay, yG + upTop / 2 - 0.4, z, pier * 0.8, upTop - 0.8, pier * 0.8);
    d.span('marble', nx0 - 0.4, Y + H - 1.2, z - 0.45, nx1 + 0.4, Y + H, z + 0.45);
  }
  for (const x of [nx0, nx1]) d.span('marble', x - 0.45, Y + 6.0, nz0, x + 0.45, Y + H, nz1);
  const yC = Y + H;
  const clH = 2.4;
  const clere = (len: number): Opening[] => {
    const out: Opening[] = [];
    const n = Math.floor(len / bay);
    for (let i = 0; i < n; i++) {
      const c = -len / 2 + (i + 0.5) * (len / n);
      out.push({ x0: c - 0.55, x1: c + 0.55, y0: 0.5, y1: clH - 0.3, arch: 0.55 });
    }
    return out;
  };
  const yR = yC + 1.25;
  const cdw = new Draw(b);
  fwall(cdw.at(0, yR, nz0 - 0.25), 'brick', nx0 - 0.25, nx1 + 0.25, 0, clH, 0.5, clere(nx1 - nx0));
  fwall(cdw.at(0, yR, nz1 + 0.25, Math.PI), 'brick', nx0 - 0.25, nx1 + 0.25, 0, clH, 0.5, clere(nx1 - nx0));
  d.span('brick', nx0 - 0.25, yR, nz0 - 0.25, nx0 + 0.25, yR + clH, nz1 + 0.25);
  d.span('brick', nx1 - 0.25, yR, nz0 - 0.25, nx1 + 0.25, yR + clH, nz1 + 0.25);
  d.span('plaster_white', nx0, yC, nz0 - 0.3, nx1, yR, nz0 + 0.2).span('plaster_white', nx0, yC, nz1 - 0.2, nx1, yR, nz1 + 0.3);
  d.span('wood_dark', nx0, yR + clH - 0.3, nz0, nx1, yR + clH, nz1, { shadow: false });
  const pitch = (14 * Math.PI) / 180;
  const zcN = (nz0 + nz1) / 2;
  gableRoof(b, nz0 - 0.9 - zcN, nz1 + 0.9 - zcN, nx0 - 0.9, nx1 + 0.9, yR + clH, pitch, 'roof_tile', hi, TRS(0, 0, zcN, 0, Math.PI / 2, 0));
  // lean-to roofs over the galleries, from the clerestory foot down to the facades
  const eave = yC + 0.15;
  shedRoof(b, ax0 - 0.4, ax1 + 0.4, nz0 - 0.2, az0 - 0.5, yR + 0.1, eave, 'roof_tile', new THREE.Matrix4());
  shedRoof(b, ax0 - 0.4, ax1 + 0.4, nz1 + 0.2, az1 + 0.5, yR + 0.1, eave, 'roof_tile', new THREE.Matrix4());
  for (const sx of [-1, 1]) {
    const xa = sx < 0 ? nx0 - 0.2 : nx1 + 0.2;
    const xb = sx < 0 ? ax0 - 0.5 : ax1 + 0.5;
    // rotated frame: roof-local z runs along world x, roof-local x along world −z
    shedRoof(b, -(nz1 + 0.2), -(nz0 - 0.2), xa, xb, yR + 0.1, eave, 'roof_tile', TRS(0, 0, 0, 0, Math.PI / 2, 0));
  }
  d.span('concrete', ax0, yC, az0 + depth, ax1, yC + 0.2, nz0).span('concrete', ax0, yC, nz1, ax1, yC + 0.2, az1);
  // the centumviral court: four tribunals in the nave, curtains between them
  const courts = 4;
  const cl = (nx1 - nx0) / courts;
  for (let k = 0; k < (hi ? courts : 0); k++) {
    const cx = nx0 + (k + 0.5) * cl;
    const tz = nz1 - 2.0;
    d.span('wood_dark', cx - 1.6, Y, tz - 1.1, cx + 1.6, Y + 0.6, tz + 1.1, { collide: true });
    d.box('wood', cx, Y + 0.85, tz + 0.5, 0.6, 0.5, 0.5);
    for (const sx of [-1, 1]) d.span('wood', cx + sx * 2.6 - 1.0, Y, nz0 + 3.0, cx + sx * 2.6 + 1.0, Y + 0.45, nz0 + 3.4, { collide: true });
    p.spot(`basilica-iulia-judge-${k + 1}`, 'npc', cx, Y + 0.6, tz, Math.PI);
    p.spot(`basilica-iulia-advocate-${k + 1}`, 'npc', cx, Y, nz0 + 4.6, 0);
    if (k > 0) {
      const x = nx0 + k * cl;
      for (const [za, zb] of [
        [nz0 + 0.5, (nz0 + nz1) / 2 - 1.0],
        [(nz0 + nz1) / 2 + 1.0, nz1 - 0.5],
      ]) {
        d.span(k % 2 ? 'fabric_red' : 'fabric_white', x - 0.03, Y + 0.3, za, x + 0.03, Y + 5.2, zb, { shadow: false });
      }
      d.rod('wood_dark', { x, y: Y + 5.25, z: nz0 }, { x, y: Y + 5.25, z: nz1 }, 0.05, 5);
    }
  }
  // gaming boards scratched into the top step and the platform edge
  if (hi) {
    const boards: [number, 'mill' | 'rota' | 'scripta'][] = [
      [-14, 'mill'],
      [-9.5, 'scripta'],
      [-3.2, 'rota'],
      [2.0, 'mill'],
      [7.5, 'scripta'],
      [13.0, 'rota'],
      [19.0, 'mill'],
    ];
    boards.forEach(([x, kind], i) => {
      const k = i % 2 ? 2 : 1;
      const z = -hd + (nSteps - k) * run + run / 2;
      gameBoard(d, x, Y - (k - 1) * rise, z, kind);
      if (i % 2 === 0) p.spot(`basilica-iulia-gamers-${i}`, 'sit', x + 0.55, Y - 2 * rise, z - run, Math.PI);
    });
    p.spot('basilica-iulia-tabula-lusoria', 'inscription', -9.5, Y - 2 * rise, -hd + (nSteps - 3) * run, 0);
  }
  p.spot('basilica-iulia-steps', 'sit', -20, Y - 2 * rise, -hd + (nSteps - 2.5) * run, Math.PI);
  p.spot('basilica-iulia-steps-2', 'sit', 22, Y - 3 * rise, -hd + (nSteps - 3.5) * run, Math.PI);
  p.spot('basilica-iulia-entrance', 'door', 0, Y, z0 + 1.0, 0);
}

// ---------------------------------------------------------------- Basilica Paulli (Aemilia)

const AEMILIA_SHOPS: (ShopKind | 'door' | 'closed')[] = ['moneychanger', 'closed', 'moneychanger', 'textile', 'door', 'moneychanger', 'general', 'moneychanger', 'door', 'moneychanger', 'closed', 'moneychanger', 'door', 'textile', 'moneychanger', 'closed'];

function basilicaAemilia(p: Part) {
  const { b, d, hi } = p;
  const W = 100 * p.S;
  const Dp = 36 * p.S;
  const hw = W / 2;
  const hd = Dp / 2;
  const fy = 0.4;
  // two steps along the portico front, a raised floor behind
  stairs(b, { width: W, rise: 0.2, run: 0.38, count: 2, material: 'travertine', collider: p.main ? 'steps' : 'none' }, T(0, 0, -hd));
  const z0 = -hd + 0.76;
  d.span('paving_travertine', -hw, fy - 0.3, z0, hw, fy, hd, { collide: true, shadow: false });
  foundation(p, rect(-hw, -hd, hw, hd), 0);
  // the two-storey porticus of Gaius and Lucius
  const bays = AEMILIA_SHOPS.length;
  const bay = (W - 1.2) / bays;
  const depth = 0.9;
  const pz = 3.0;
  const storeys = [
    { order: 'doric' as const, height: 5.2 },
    { order: 'ionic' as const, height: 4.0, pedestal: 0.9, tier: 'low' as const },
  ];
  const hP = arcadeRow(p, { bays, bay, pier: 0.85, depth, storeys, material: 'marble', collide: true, archDetail: 'low' }, T(-(bays * bay) / 2, fy, z0 + depth / 2));
  // portico ceiling, upper floor and roof
  const zb = z0 + depth + pz;
  d.span('wood_dark', -hw + 0.6, fy + 5.2 - 0.9, z0 + depth, hw - 0.6, fy + 5.2 - 0.6, zb, { shadow: false });
  d.span('concrete', -hw + 0.6, fy + 5.2 - 0.6, z0 + depth, hw - 0.6, fy + 5.2, zb);
  shedRoof(b, -hw + 0.3, hw - 0.3, zb + 0.3, z0 - 0.35, fy + hP + 1.4, fy + hP + 0.1, 'roof_tile', new THREE.Matrix4());
  // the Tabernae Novae behind the portico: one shop per bay, a few bays are passages into the hall
  const rng = p.ctx.rng.fork('shops');
  const shopD = 3.4;
  const sh = 3.6;
  const fd = new Draw(b).at(0, fy, zb);
  const openings: Opening[] = [];
  for (let i = 0; i < bays; i++) {
    const cx = -(bays * bay) / 2 + (i + 0.5) * bay;
    const kind = AEMILIA_SHOPS[i];
    const w = kind === 'door' ? 2.0 : bay - 0.9;
    openings.push({ x0: cx - w / 2, x1: cx + w / 2, y0: 0, y1: kind === 'door' ? 3.4 : 2.9 });
  }
  const cut = fwall(fd, 'marble', -hw + 0.6, hw - 0.6, -0.3, 5.2 - 0.9, 0.35, openings);
  if (p.main) {
    let xPrev = -hw + 0.6;
    for (const o of [...cut].sort((a, c) => a.x0 - c.x0)) {
      fd.solid(xPrev, 0, 0, o.x0, 5, 0.35);
      xPrev = o.x1;
    }
    fd.solid(xPrev, 0, 0, hw - 0.6, 5, 0.35);
  }
  for (let i = 0; i < bays; i++) {
    const cx = -(bays * bay) / 2 + (i + 0.5) * bay;
    const kind = AEMILIA_SHOPS[i];
    const o = openings[i];
    const sd = fd.at(cx, 0, 0).noShadow();
    if (kind === 'door') {
      // passage to the hall, its bronze doors standing ajar
      doorLeaves(fd, o, 0.35, 0.25, 'bronze', true);
      sd.span('black', -1.2, 0, shopD - 0.2, 1.2, 3.6, shopD);
      sd.span('marble', -1.3, 0, 0.35, -1.0, 3.6, shopD, { collide: true }).span('marble', 1.0, 0, 0.35, 1.3, 3.6, shopD, { collide: true });
      sd.span('marble_veined', -1.0, -0.02, 0.35, 1.0, 0.01, shopD);
      if (i === 4) p.spot('basilica-paulli-hall-door', 'door', cx, fy, zb - 0.8, 0);
      continue;
    }
    if (hi && kind !== 'closed') {
      shopInterior(sd, kind, { w: bay - 0.6, depth: shopD, h: sh, t: 0.35, wealth: 0.9 }, rng.fork(i));
      if (kind === 'moneychanger') p.spot(`basilica-paulli-argentarius-${i}`, 'vendor', cx, fy, zb + 1.4, Math.PI);
    } else {
      sd.span('black', -bay / 2 + 0.3, 0, 0.6, bay / 2 - 0.3, sh, 0.65);
      if (kind === 'closed') plankShutters(fd, o, 0.35, rng);
    }
    if (p.main) sd.solid(-bay / 2 + 0.1, 0, shopD, bay / 2 - 0.1, sh, shopD + 0.3);
  }
  // the hall behind: tall walls, clerestory and roofs (not enterable)
  const hz0 = zb + shopD + 0.3;
  const hz1 = hd;
  const hH = 11.6;
  const hallMat: MaterialId = 'travertine';
  d.span(hallMat, -hw, fy, hz0, hw, fy + hH, hz1, { collide: true });
  if (hi) {
    for (let i = 0; i < 14; i++) {
      const x = -hw + 2.2 + i * ((W - 4.4) / 13);
      d.box('black', x, fy + hH - 2.4, hz1 + 0.01, 1.1, 1.8, 0.02);
    }
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) d.box('black', sx * (hw + 0.01), fy + hH - 2.4, hz0 + 1.6 + k * ((hz1 - hz0 - 3.2) / 2), 0.02, 1.8, 1.1);
  }
  const nz0 = hz0 + 3.2;
  const nz1 = hz1 - 3.2;
  const clH = 3.4;
  d.span(hallMat, -hw + 1.5, fy + hH, nz0, hw - 1.5, fy + hH + clH, nz1);
  for (let i = 0; i < 16; i++) {
    const x = -hw + 3 + i * ((W - 6) / 15);
    d.box('black', x, fy + hH + clH * 0.55, nz0 - 0.01, 1.0, 1.6, 0.02).box('black', x, fy + hH + clH * 0.55, nz1 + 0.01, 1.0, 1.6, 0.02);
  }
  const pitch = (14 * Math.PI) / 180;
  const zc = (nz0 + nz1) / 2;
  gableRoof(b, nz0 - 0.8 - zc, nz1 + 0.8 - zc, -hw + 1.0, hw - 1.0, fy + hH + clH, pitch, 'roof_tile', hi, TRS(0, 0, zc, 0, Math.PI / 2, 0));
  shedRoof(b, -hw, hw, nz0, hz0 - 0.4, fy + hH + 0.4, fy + hH - 0.3, 'roof_tile', new THREE.Matrix4());
  shedRoof(b, -hw, hw, nz1, hz1 + 0.4, fy + hH + 0.4, fy + hH - 0.3, 'roof_tile', new THREE.Matrix4());
  // the dedication to Lucius Caesar on the portico's upper storey, at the centre
  if (hi) inscription(b, T(0, fy + 5.2 + 2.0, z0 - 0.06), text('basilica-aemilia-lucius'), 5.0, 1.5, 'carved', { depth: 0.05 });
  p.spot('basilica-aemilia-lucius', 'inscription', 0, fy, z0 - 2.5, 0);
}

export const builders: LandmarkBuilder[] = [
  { handles: ['basilica-julia'], build: (ctx) => landmark(ctx, basilicaIulia, { near: 160 }) },
  { handles: ['basilica-aemilia'], build: (ctx) => landmark(ctx, basilicaAemilia, { near: 160 }) },
];
