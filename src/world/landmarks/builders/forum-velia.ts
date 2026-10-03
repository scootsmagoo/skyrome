/**
 * The upper Sacra Via, the Velia and the warehouses round the Forum:
 *  - the Colossus of Sol: Zenodorus' bronze, once Nero, now the Sun with a radiate crown of seven
 *    gilded rays, a rudder on a globe in his left hand, ~30 m on a high moulded pedestal;
 *  - the vestibule of the Golden House on the Velia: a porticoed garden court round the Colossus,
 *    a columnar front on the Sacra Via (Venus and Roma does not exist yet);
 *  - the Horrea Piperataria (Domitian's spice warehouses) and the Horrea Agrippiana (the cloth
 *    dealers' warehouse with the aedicula of its Genius in the court), from the fabric kit's horrea;
 *  - the Porticus Margaritaria: a street colonnade with the pearl-sellers' and jewellers' shops;
 *  - Domitian's vestibule at the foot of the Palatine: a towering brick hall with niches, its great
 *    arched entrance open, the guarded gate to the palace ramp at the back.
 */
import * as THREE from 'three';
import { entablature } from '../../../arch/classical/entablature';
import { columnDims } from '../../../arch/classical/orders';
import { stairs } from '../../../arch/common/stairs';
import { Draw } from '../../../arch/fabric/draw';
import { horrea } from '../../../arch/fabric/horrea';
import { shopInterior, type ShopKind } from '../../../arch/fabric/shops';
import { doorLeaves, plankShutters, wall as fwall, type Opening } from '../../../arch/fabric/wall';
import { placeProp } from '../../../arch/props';
import { LANDMARK_BY_ID } from '../../../data/atlas';
import type { LandmarkBuilder } from '../types';
import { FORUM_INSCRIPTIONS } from './forum-data';
import { figure, nudeMale } from './forum-figures';
import { T, TRS, atlasToLocal, col, foundation, inscription, landmark, pave, plantTrees, rect, type Part } from './forum-kit';
import { gableRoof, shedRoof } from './forum-temple';
import { aediculaShrine } from './forum-vesta';

// ---------------------------------------------------------------- Colossus of Sol

function colossus(p: Part) {
  const { b, d, hi } = p;
  const pw = 7.6;
  const ph = 4.4;
  foundation(p, rect(-pw / 2 - 0.6, -pw / 2 - 0.6, pw / 2 + 0.6, pw / 2 + 0.6), 0);
  // two steps, a moulded pedestal of brick-cored marble
  d.span('travertine', -pw / 2 - 0.6, 0, -pw / 2 - 0.6, pw / 2 + 0.6, 0.22, pw / 2 + 0.6, { collide: true });
  d.span('travertine', -pw / 2 - 0.3, 0.22, -pw / 2 - 0.3, pw / 2 + 0.3, 0.44, pw / 2 + 0.3, { collide: true });
  d.span('marble', -pw / 2 - 0.12, 0.44, -pw / 2 - 0.12, pw / 2 + 0.12, 0.9, pw / 2 + 0.12);
  d.span('marble', -pw / 2, 0.9, -pw / 2, pw / 2, ph - 0.5, pw / 2, { collide: true });
  d.span('marble', -pw / 2 - 0.2, ph - 0.5, -pw / 2 - 0.2, pw / 2 + 0.2, ph - 0.25, pw / 2 + 0.2);
  d.span('marble', -pw / 2 - 0.08, ph - 0.25, -pw / 2 - 0.08, pw / 2 + 0.08, ph, pw / 2 + 0.08);
  if (hi) {
    // panels on the die
    for (const [x, z, ry] of [
      [0, -pw / 2 - 0.02, 0],
      [0, pw / 2 + 0.02, Math.PI],
      [-pw / 2 - 0.02, 0, -Math.PI / 2],
      [pw / 2 + 0.02, 0, Math.PI / 2],
    ] as const) {
      d.box('marble_veined', x, (ph + 0.4) / 2, z, 0.06, ph - 1.8, pw - 1.6, { ry: ry + Math.PI / 2 });
    }
  }
  // the god: nude, the right hand raised, the left on a rudder set on a globe, the radiate crown
  const H = 30 * p.S;
  const k = H / 1.85;
  figure(
    b,
    T(0, ph, 0.3),
    hi,
    'bronze',
    k,
    (s) => nudeMale(s, { right: 'raised', left: 'rudder', plinth: false, cloak: true, attrMat: 'bronze', head: { crown: 'radiate', crownMat: 'gilded_bronze', rays: 7, rayLen: 0.42 } }),
    hi ? 2.2 : 1.4,
  );
  d.solidCyl(0, ph + 2.5, 0.3, 1.6, 5.0);
  p.spot('colossus-sol', 'vista', 0, 0.44, -pw / 2 - 2.2, 0);
  p.spot('colossus-sol-base', 'npc', 2.5, 0, -pw / 2 - 1.2, Math.PI);
}

// ---------------------------------------------------------------- Vestibule of the Golden House

function vestibule(p: Part) {
  const { b, d, hi } = p;
  const W = 100 * p.S;
  const L = 145 * p.S;
  const hw = W / 2 - 2.6; // the Sacra Via runs along the W flank
  const hl = L / 2;
  const fy = 0.25;
  // the court: gravel walks, pavement round the Colossus
  pave(p, rect(-hw, -hl, hw, hl), { material: 'gravel', lift: 0.04, cell: hi ? 4 : 10 });
  // columnar front on the Sacra Via
  const cH = 5.4;
  const D = cH / 10;
  const nF = 12;
  const sp = (2 * hw) / nF;
  const tierF = hi ? 'mid' : 'stub';
  const fz = -hl + 1.0;
  d.span('travertine', -hw, 0, fz - 0.8, hw, fy, fz + 4.2, { collide: true });
  for (let i = 0; i <= nF; i++) col(b, { order: 'corinthian', D, H: cH, tier: tierF, material: 'marble', collide: p.main }, T(-hw + i * sp, fy, fz));
  for (let i = 0; i <= nF; i++) col(b, { order: 'corinthian', D, H: cH, tier: hi ? 'low' : 'stub', material: 'marble', collide: p.main }, T(-hw + i * sp, fy, fz + 3.6));
  const dd = columnDims('corinthian', D, cH).d;
  const fe = entablature(b, [new THREE.Vector3(-hw - 0.3, fy + cH, fz - dd / 2), new THREE.Vector3(hw + 0.3, fy + cH, fz - dd / 2)], { order: 'corinthian', columnHeight: cH, D, material: 'marble', detail: p.detail, axial: sp }, { caps: true });
  entablature(b, [new THREE.Vector3(hw + 0.3, fy + cH, fz + 3.6 + dd / 2), new THREE.Vector3(-hw - 0.3, fy + cH, fz + 3.6 + dd / 2)], { order: 'corinthian', columnHeight: cH, D, material: 'marble', detail: 'low' }, { caps: true });
  const yR = fy + cH + fe.dims.total;
  gableRoof(b, -2.4, 2.4, -hw - 0.4, hw + 0.4, yR - 0.05, (13 * Math.PI) / 180, 'roof_tile', hi, TRS(0, 0, fz + 1.8, 0, Math.PI / 2, 0));
  d.span('wood_dark', -hw, yR - 0.4, fz, hw, yR - 0.25, fz + 3.6, { shadow: false });
  // porticoes round the other three sides of the court: columns, back wall, lean-to roof
  const sH = 4.6;
  const sD = sH / 10;
  const pd = 4.0;
  const runCols = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 5.6));
    for (let i = 0; i <= n; i++) col(b, { order: 'corinthian', D: sD, H: sH, tier: hi ? 'low' : 'stub', material: 'marble', collide: p.main }, T(x0 + ((x1 - x0) * i) / n, fy, z0 + ((z1 - z0) * i) / n));
  };
  const ix = hw - pd;
  const iz1 = hl - pd;
  const iz0 = fz + 4.4 + 0.4;
  runCols(-ix, iz0, -ix, iz1);
  // the flank on the Sacra Via is an open colonnade, so the court and the Colossus show from the street
  runCols(-hw, iz0, -hw, hl);
  d.box('marble', -hw, fy + sH + 0.3, (iz0 + hl) / 2, 0.5, 0.6, hl - iz0);
  runCols(ix, iz0, ix, iz1);
  runCols(-ix, iz1, ix, iz1);
  // outer walls
  for (const [x0, z0, x1, z1] of [
    [hw, fz + 4.2, hw + 0.6, hl],
    [-hw - 0.6, hl, hw + 0.6, hl + 0.6],
  ] as const) d.span('brick', x0, 0, z0, x1, fy + sH + 1.4, z1, { collide: true });
  // portico floors and lean-to roofs
  const yp = fy + sH + 0.6;
  for (const [x0, z0, x1, z1] of [
    [-hw, iz0, -ix, hl],
    [ix, iz0, hw, hl],
    [-ix, iz1, ix, hl],
  ] as const) d.span('paving_travertine', x0, 0, z0, x1, fy, z1, { collide: true, shadow: false });
  d.box('marble', -ix, yp - 0.3, (iz0 + iz1) / 2, 0.5, 0.6, iz1 - iz0).box('marble', ix, yp - 0.3, (iz0 + iz1) / 2, 0.5, 0.6, iz1 - iz0);
  d.box('marble', 0, yp - 0.3, iz1, 2 * ix, 0.6, 0.5);
  shedRoof(b, -hl, -iz0, hw + 0.3, ix - 0.3, yp + 1.2, yp, 'roof_tile', TRS(0, 0, 0, 0, Math.PI / 2, 0));
  shedRoof(b, iz0, hl, hw + 0.3, ix - 0.3, yp + 1.2, yp, 'roof_tile', TRS(0, 0, 0, 0, -Math.PI / 2, 0));
  shedRoof(b, -hw, hw, hl + 0.3, iz1 - 0.3, yp + 1.2, yp, 'roof_tile', new THREE.Matrix4());
  // walks and the paved square round the Colossus' base
  pave(p, rect(-2.5, iz0, 2.5, iz1), { material: 'paving_travertine', lift: 0.07, cell: hi ? 3 : 10 });
  const [kx, kz] = colossusLocal(p);
  pave(p, rect(kx - 9, kz - 9, kx + 9, kz + 9), { material: 'paving_travertine', lift: 0.075, cell: hi ? 3 : 10 });
  // plane trees in rows along the walks, clear of the Colossus
  const trees: { species: 'plane' | 'cypress'; x: number; z: number; scale: number }[] = [];
  for (let z = iz0 + 6; z < iz1 - 4; z += 9) {
    for (const x of [-ix + 4, -5.5, 5.5, ix - 4]) {
      if (Math.hypot(x - kx, z - kz) < 13) continue;
      trees.push({ species: Math.abs(x) < 6 ? 'cypress' : 'plane', x, z, scale: Math.abs(x) < 6 ? 0.8 : 0.85 });
    }
  }
  plantTrees(p, trees);
  p.spot('velia-vestibule-gate', 'door', 0, fy, fz - 1.4, 0);
  p.spot('velia-vista', 'vista', -hw + 2, fy, fz + 1.8, Math.PI);
}

/** The Colossus' position in the vestibule's local frame (game metres). */
function colossusLocal(p: Part): [number, number] {
  const c = LANDMARK_BY_ID['colossus-sol'].center;
  return atlasToLocal(p.ctx, c[0], c[1]);
}

// ---------------------------------------------------------------- horrea

function horreaBuilding(p: Part, w: number, dpt: number, label: string[]) {
  const { b, ctx, hi } = p;
  const out = horrea({ width: w, depth: dpt, seed: ctx.rng.int(1, 9999), groundAt: (x, z) => ctx.groundAt(x, z), detail: hi ? 'full' : 'low' });
  b.append(out.builder);
  if (hi) inscription(b, T(0, 4.2 + 0.7, -dpt / 2 - 0.09), label, 1.75, 0.46, 'carved', { depth: 0.02, sizes: label.map(() => 0.8) });
  for (const s of out.spots) p.spot(`${ctx.lm.id}-${s.id}`, s.kind === 'houseDoor' ? 'door' : 'npc', s.position.x, s.position.y, s.position.z, s.facing);
}

function piperataria(p: Part) {
  const w = 80 * p.S;
  const dp = 40 * p.S;
  horreaBuilding(p, w, dp, ['Horrea', 'Piperataria']);
  const d = p.d;
  // pepper and spice sacks, baskets and a weighing table at the gate
  if (p.hi) {
    const r = p.ctx.rng.fork('spice');
    for (let i = 0; i < 7; i++) placeProp(d, i % 3 === 0 ? 'basket' : 'sack', -4.2 + i * 0.5 + r.range(-0.1, 0.1), 0, -dp / 2 - 1.6 - (i % 2) * 0.5, r.range(0, 6), { collide: false, variant: i % 3 });
    placeProp(d, 'table', 3.6, 0, -dp / 2 - 1.8, 0.1);
    placeProp(d, 'amphora_stack', 5.2, 0, -dp / 2 - 1.2, 0.0);
  }
  p.spot('horrea-piperataria-merchant', 'vendor', 3.6, 0, -dp / 2 - 2.6, 0);
  p.spot('horrea-piperataria-porter', 'npc', -3.5, 0, -dp / 2 - 2.8, 0);
}

function agrippiana(p: Part) {
  const w = 50 * p.S;
  const dp = 60 * p.S;
  horreaBuilding(p, w, dp, ['Horrea', 'Agrippiana']);
  // the aedicula of the warehouse's Genius in the court, facing the gate
  aediculaShrine(p, T(0, 0, 4.5), (s) => nudeMale(s, { right: 'forward', left: 'globe', cloak: true, plinth: false, head: { crown: 'wreath' } }), 'marble', 'bronze');
  if (p.hi) {
    for (const [x, z] of [
      [-2.5, -dp / 2 - 1.5],
      [2.8, -dp / 2 - 1.8],
    ] as const) placeProp(p.d, 'stall_cloth', x, 0, z, 0.1, { variant: 0 });
  }
  p.spot('horrea-agrippiana-genius', 'shrine', 0, 0, 2.6, 0);
  p.spot('horrea-agrippiana-vestiarius', 'vendor', 2.8, 0, -dp / 2 - 2.8, 0);
}

// ---------------------------------------------------------------- Porticus Margaritaria

const PEARL_SHOPS: (ShopKind | 'closed' | 'gate')[] = ['moneychanger', 'textile', 'closed', 'moneychanger', 'general', 'gate', 'moneychanger', 'closed', 'textile', 'moneychanger', 'general'];

function margaritaria(p: Part) {
  const { b, d, hi } = p;
  const W = 66 * p.S;
  const Dp = 50 * p.S;
  const hw = W / 2;
  const hd = Dp / 2;
  const fy = 0.3;
  foundation(p, rect(-hw, -hd, hw, hd), 0, 'brick');
  stairs(b, { width: W, rise: 0.15, run: 0.4, count: 2, material: 'travertine', collider: p.main ? 'steps' : 'none' }, T(0, 0, -hd));
  const z0 = -hd + 0.8;
  d.span('paving_travertine', -hw, -0.2, z0, hw, fy, z0 + 3.6, { collide: true, shadow: false });
  // the street colonnade (brick piers faced with stucco, Tuscan)
  const cH = 4.2;
  const D = cH / 7;
  const n = PEARL_SHOPS.length;
  const bay = (W - 1) / n;
  for (let i = 0; i <= n; i++) col(b, { order: 'tuscan', D, H: cH, tier: hi ? 'mid' : 'stub', material: 'travertine', collide: p.main }, T(-(n * bay) / 2 + i * bay, fy, z0 + 0.5));
  const dd = columnDims('tuscan', D, cH).d;
  const ent = entablature(b, [new THREE.Vector3(-hw, fy + cH, z0 + 0.5 - dd / 2), new THREE.Vector3(hw, fy + cH, z0 + 0.5 - dd / 2)], { order: 'tuscan', columnHeight: cH, D, material: 'travertine', detail: p.detail }, { caps: true });
  const zs = z0 + 3.6;
  shedRoof(b, -hw - 0.2, hw + 0.2, zs + 0.1, z0 + 0.1, fy + cH + ent.dims.total + 0.9, fy + cH + ent.dims.total, 'roof_tile', new THREE.Matrix4());
  d.span('wood_dark', -hw, fy + cH + 0.3, z0 + 0.5, hw, fy + cH + 0.45, zs, { shadow: false });
  // shops of the pearl-sellers and jewellers; a gateway to the court in the middle
  const rng = p.ctx.rng.fork('shops');
  const fd = new Draw(b).at(0, fy, zs);
  const openings: Opening[] = [];
  for (let i = 0; i < n; i++) {
    const cx = -(n * bay) / 2 + (i + 0.5) * bay;
    const w = PEARL_SHOPS[i] === 'gate' ? 2.6 : bay - 1.0;
    openings.push({ x0: cx - w / 2, x1: cx + w / 2, y0: 0, y1: PEARL_SHOPS[i] === 'gate' ? 3.4 : 2.8, arch: PEARL_SHOPS[i] === 'gate' ? 1.3 : 0 });
  }
  const H = 9.0;
  fwall(fd, 'plaster_ochre', -hw, hw, -0.3, H, 0.4, openings);
  const shopD = 4.2;
  for (let i = 0; i < n; i++) {
    const cx = -(n * bay) / 2 + (i + 0.5) * bay;
    const kind = PEARL_SHOPS[i];
    const sd = fd.at(cx, 0, 0).noShadow();
    if (kind === 'gate') {
      doorLeaves(fd, openings[i], 0.4, 0, 'wood_dark', true);
      p.spot('porticus-margaritaria-gate', 'door', cx, fy, zs - 0.8, 0);
      continue;
    }
    if (hi && kind !== 'closed') {
      shopInterior(sd, kind, { w: bay - 0.7, depth: shopD, h: 3.4, t: 0.4, wealth: 1 }, rng.fork(i));
      p.spot(`margaritarius-${i}`, 'vendor', cx, fy, zs + 1.5, Math.PI);
    } else {
      sd.span('black', -bay / 2 + 0.4, 0, 0.7, bay / 2 - 0.4, 3.0, 0.75);
      if (kind === 'closed') plankShutters(fd, openings[i], 0.4, rng);
    }
    if (p.main) sd.solid(-bay / 2, 0, shopD, bay / 2, 3.4, shopD + 0.3);
  }
  if (p.main) {
    let xPrev = -hw;
    for (const o of openings) {
      fd.solid(xPrev, 0, 0, o.x0, H, 0.4);
      xPrev = o.x1;
    }
    fd.solid(xPrev, 0, 0, hw, H, 0.4);
  }
  // the block behind: upper storey windows, tiled hip-like roofs round a court
  const bz0 = zs + 0.4;
  d.span('plaster_ochre', -hw, fy + 3.6, bz0, hw, fy + H, bz0 + shopD, { shadow: true });
  d.span('brick', -hw, 0, bz0 + shopD, -hw + 6, fy + H, hd, { collide: true }).span('brick', hw - 6, 0, bz0 + shopD, hw, fy + H, hd, { collide: true });
  d.span('brick', -hw + 6, 0, hd - 6, hw - 6, fy + H, hd, { collide: true });
  if (hi) for (let i = 0; i < n; i++) d.box('black', -(n * bay) / 2 + (i + 0.5) * bay, fy + 6.4, zs - 0.01, 0.9, 1.2, 0.02);
  pave(p, rect(-hw + 6, bz0 + shopD, hw - 6, hd - 6), { material: 'paving_travertine', lift: fy });
  shedRoof(b, -hw - 0.3, hw + 0.3, bz0 + shopD + 0.3, zs - 0.4, fy + H + 1.4, fy + H, 'roof_tile', new THREE.Matrix4());
  shedRoof(b, -hw - 0.3, hw + 0.3, hd - 6.3, hd + 0.4, fy + H + 1.4, fy + H, 'roof_tile', new THREE.Matrix4());
  if (hi) inscription(b, T(0, fy + cH + ent.dims.total + 1.6, zs - 0.05), FORUM_INSCRIPTIONS['porticus-margaritaria'].latin, 4.2, 0.55, 'painted', { depth: 0.03 });
  p.spot('porticus-margaritaria', 'inscription', 0, fy, z0 - 1.6, 0);
}

// ---------------------------------------------------------------- Domitian's vestibule

function domVestibule(p: Part) {
  const { b, d, hi } = p;
  const W = 32 * p.S;
  // 22 m deep instead of the atlas 25 m: the back keeps clear of the Horrea Agrippiana's corner
  const L = 22 * p.S;
  const hw = W / 2;
  const hl = L / 2;
  const H = 16.0;
  const t = 1.3;
  const fy = 0.3;
  foundation(p, rect(-hw, -hl, hw, hl), 0, 'brick');
  d.span('marble_veined', -hw + t, -0.1, -hl + t, hw - t, fy, hl - t, { collide: true, shadow: false });
  // the great arched entrance on the Forum side
  const fd = new Draw(b).at(0, 0, -hl);
  const gate: Opening = { x0: -2.6, x1: 2.6, y0: 0, y1: 9.0, arch: 2.6 };
  fwall(fd, 'brick', -hw, hw, -0.5, H, t, [gate]);
  fd.solid(-hw, 0, 0, gate.x0, H, t).solid(gate.x1, 0, 0, hw, H, t).solid(gate.x0, 9.0 - 2.6, 0, gate.x1, H, t);
  // facade: brick pilasters, a travertine archivolt round the gate, tall blind niches
  for (const x of [-hw + 0.6, -5.2, 5.2, hw - 0.6]) d.box('brick', x, H / 2, -hl - 0.18, 1.1, H, 0.36);
  if (hi) {
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI - (Math.PI * i) / 12;
      d.box('travertine', Math.cos(a) * 2.85, 6.4 + Math.sin(a) * 2.85, -hl - 0.08, 0.5, 0.5, 0.16, { rz: a - Math.PI / 2 });
    }
    for (const sx of [-1, 1]) {
      d.box('black', sx * 8.0, 5.0, -hl - 0.015, 1.6, 5.0, 0.02);
      d.box('travertine', sx * 8.0, 2.4, -hl - 0.12, 2.0, 0.2, 0.3);
      d.box('black', sx * 8.0, 11.6, -hl - 0.015, 1.4, 2.6, 0.02);
    }
  }
  // the other three walls, with alternating rectangular and apsidal niches inside
  d.span('brick', -hw, -0.5, hl - t, hw, H, hl, { collide: true });
  d.span('brick', -hw, -0.5, -hl + t, -hw + t, H, hl - t, { collide: true });
  d.span('brick', hw - t, -0.5, -hl + t, hw, H, hl - t, { collide: true });
  if (hi) {
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const z = -hl + t + 2.4 + k * ((L - 2 * t - 4.8) / 2);
        d.box('black', sx * (hw - t - 0.01), fy + 2.6, z, 0.02, 3.8, 1.8);
        d.box('travertine', sx * (hw - t - 0.15), fy + 0.7, z, 0.3, 0.12, 2.2);
      }
    }
  }
  // the guarded gate to the palace ramp at the back
  d.span('travertine', -1.7, fy, hl - t - 0.2, 1.7, fy + 4.6, hl - t);
  d.span('bronze', -1.3, fy, hl - t - 0.25, 1.3, fy + 4.0, hl - t - 0.2);
  // timber roof on corbels (seen from inside as a dark coffered ceiling), tiled hip outside
  d.span('wood_dark', -hw + t, H - 0.6, -hl + t, hw - t, H - 0.3, hl - t);
  d.span('brick', -hw, H, -hl, hw, H + 0.6, hl);
  gableRoof(b, -hw - 0.3, hw + 0.3, -hl - 0.3, hl + 0.3, H + 0.55, (12 * Math.PI) / 180, 'roof_tile', hi, new THREE.Matrix4());
  // brick cornice bands
  for (const y of [9.6, H - 0.2]) d.span('travertine', -hw - 0.15, y, -hl - 0.15, hw + 0.15, y + 0.3, hl + 0.15);
  p.spot('palatine-ramp-gate', 'door', 0, fy, hl - t - 1.0, Math.PI);
  p.spot('palatine-guard-1', 'npc', -2.4, fy, hl - t - 0.9, Math.PI);
  p.spot('palatine-guard-2', 'npc', 2.4, fy, hl - t - 0.9, Math.PI);
  p.spot('domitianic-vestibule', 'door', 0, 0, -hl - 1.5, 0);
}

export const builders: LandmarkBuilder[] = [
  { handles: ['colossus-sol'], build: (ctx) => landmark(ctx, colossus, { near: 300 }) },
  { handles: ['velia-vestibule'], build: (ctx) => landmark(ctx, vestibule, { near: 90 }) },
  { handles: ['horrea-piperataria'], build: (ctx) => landmark(ctx, piperataria, { near: 120 }) },
  { handles: ['horrea-agrippiana'], build: (ctx) => landmark(ctx, agrippiana, { near: 120 }) },
  { handles: ['porticus-margaritaria'], build: (ctx) => landmark(ctx, margaritaria, { near: 120 }) },
  { handles: ['domitianic-vestibule'], build: (ctx) => landmark(ctx, domVestibule, { near: 160 }) },
];

