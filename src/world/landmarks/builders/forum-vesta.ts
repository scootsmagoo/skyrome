/**
 * The sanctuary of Vesta at the SE end of the Forum and its neighbours:
 *  - the round Temple of Vesta (rebuilt after 64): 20 slender Corinthian columns on a round podium,
 *    bronze lattice screens between them, a conical bronze roof with the smoke vent, the open door
 *    behind a bronze grille through which the eternal fire glows on its hearth;
 *  - the Regia, the pontifex maximus' office: an irregular marble-faced building with the
 *    sacrarium of Mars (the ancilia and spears seen through a grille), a court with an altar,
 *    sacred laurels at the door and the consular Fasti carved on its front;
 *  - the Atrium Vestae: the Vestals' two-storey brick house round a long garden court with three
 *    pools and the statues of Chief Vestals;
 *  - the Spring of Juturna: the marble basin with the Dioscuri watering their horses, the
 *    aedicula of Juturna, her altar and the inscribed well-head.
 */
import * as THREE from 'three';
import { entablature, pediment } from '../../../arch/classical/entablature';
import { columnDims } from '../../../arch/classical/orders';
import { ProfileBuilder, lathe } from '../../../arch/common/geom';
import { stairs } from '../../../arch/common/stairs';
import { wall, type Opening } from '../../../arch/common/walls';
import { hedge } from '../../../arch/vegetation/decor';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder } from '../types';
import { FORUM_INSCRIPTIONS } from './forum-data';
import { drapedFemale, figure, horse, nudeMale, Sculpt } from './forum-figures';
import { T, TRS, addFire, altar, balustrade, col, crossingX, foundation, inscription, landmark, mul, pave, pedestal, plantTrees, rect, roadLocal, type Part, type V2 } from './forum-kit';
import { gableRoof, shedRoof } from './forum-temple';
import { lampAt } from './forum-street';
import { shopInterior, type ShopKind } from '../../../arch/fabric/shops';
import { placeProp } from '../../../arch/props';

const text = (id: string) => FORUM_INSCRIPTIONS[id].latin;

/** Circle path (y) walked so the sweep's outward normal points away from the centre. */
function circle(r: number, n: number, y: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)));
  }
  return out;
}

/** A small free-standing aedicula: podium, two columns, pediment, back wall and a statue (faces −z). */
export function aediculaShrine(p: Part, at: THREE.Matrix4, statue: (s: Sculpt) => void, mat: MaterialId = 'marble', statueMat: MaterialId = 'marble') {
  const { b, hi } = p;
  const w = 1.8;
  const dp = 1.5;
  const ph = 0.8;
  b.box('travertine', w, ph, dp, mul(at, T(0, ph / 2, 0)), { collide: p.main });
  b.box(mat, w + 0.12, 0.1, dp + 0.12, mul(at, T(0, ph + 0.05, 0)));
  b.box(mat, w, 2.4, 0.25, mul(at, T(0, ph + 1.3, dp / 2 - 0.125)));
  const cH = 2.2;
  const D = cH / 10;
  for (const sx of [-1, 1]) col(b, { order: 'corinthian', D, H: cH, tier: hi ? 'mid' : 'stub', material: mat, collide: false }, mul(at, T(sx * (w / 2 - 0.2), ph + 0.1, -dp / 2 + 0.25)));
  b.box(mat, w + 0.1, 0.32, dp, mul(at, T(0, ph + 0.1 + cH + 0.16, 0)));
  pediment(b, { order: 'corinthian', span: w + 0.1, cornice: 0.14, depth: 0.2, material: mat, detail: p.detail, D: 0.3 }, mul(at, T(0, ph + 0.1 + cH + 0.32, -dp / 2)));
  b.box('roof_tile', w + 0.2, 0.06, dp + 0.1, mul(at, T(0, ph + 0.1 + cH + 0.5, 0.05)));
  figure(b, mul(at, T(0, ph + 0.1, 0.1)), hi, statueMat, 0.85, statue);
}

// ---------------------------------------------------------------- Temple of Vesta

function vesta(p: Part) {
  const { b, d, hi } = p;
  const R = 6.2 * p.S;
  const n = 20;
  const H = 3.6;
  const D = 0.34;
  const dims = columnDims('corinthian', D, H);
  const P = 1.8;
  const outerR = R + dims.plinth / 2 + 0.35;
  const segs = hi ? 64 : 24;
  // round podium with base and crown mouldings
  const s = 0.6;
  const prof = new ProfileBuilder(outerR + 0.16 * s, 0)
    .up(0.22 * s)
    .torus(0.14 * s, 0.05 * s, 3)
    .in(0.05 * s)
    .cymaReversa(-0.08 * s, 0.14 * s, 3)
    .to(outerR, P - 0.42 * s)
    .cymaReversa(0.07 * s, 0.12 * s, 3)
    .up(0.04 * s)
    .out(0.03 * s)
    .up(0.13 * s)
    .ovolo(0.06 * s, 0.08 * s, 3)
    .up(0.05 * s)
    .to(outerR, P)
    .to(outerR - 0.1, P - 0.03)
    .build();
  b.add(lathe(prof, { segments: segs, capTop: false }), 'travertine');
  b.add(lathe(new ProfileBuilder(outerR + 0.02, P).to(0, P).build(), { segments: segs }), 'paving_travertine', undefined, { castShadow: false });
  d.solidCyl(0, P / 2, 0, outerR, P);
  // steps on the east (−z) between cheek walls
  const count = 9;
  const rise = P / count;
  const run = 0.33;
  const sw = 2.2;
  const z0 = -outerR - count * run + 0.7;
  stairs(b, { width: sw, rise, run, count, material: 'travertine', collider: p.main ? 'steps' : 'none' }, T(0, 0, z0));
  for (const sx of [-1, 1]) d.box('travertine', sx * (sw / 2 + 0.22), P / 2, z0 + (count * run) / 2, 0.44, P, count * run, { collide: true });
  // 20 slender Corinthian columns, oriented radially; bronze lattice screens between them
  const ang = (i: number) => (i / n) * Math.PI * 2 + Math.PI / n;
  for (let i = 0; i < n; i++) {
    const a = ang(i);
    col(b, { order: 'corinthian', D, H, tier: hi ? 'mid' : 'stub', material: 'marble', collide: p.main }, TRS(R * Math.sin(a), P, R * Math.cos(a), 0, a, 0));
  }
  if (hi) {
    for (let i = 0; i < n; i++) {
      const a0 = ang(i);
      const a1 = ang(i + 1);
      const mid = (a0 + a1) / 2;
      // the door side (−z, a ≈ π) stays open
      if (Math.abs(mid - Math.PI) < 0.2) continue;
      const k = (R - 0.02) / R;
      balustrade(d, Math.sin(a0) * R * k + Math.cos(a0) * 0.2, Math.cos(a0) * R * k - Math.sin(a0) * 0.2, Math.sin(a1) * R * k - Math.cos(a1) * 0.2, Math.cos(a1) * R * k + Math.sin(a1) * 0.2, { y: P, h: 1.3, mat: 'bronze', lattice: true, post: 0.5 });
    }
  }
  // round entablature
  const yE = P + H;
  const ent = entablature(b, circle(R + dims.d / 2, segs, yE), { order: 'corinthian', columnHeight: H, D, material: 'marble', detail: p.detail, axial: (2 * Math.PI * R) / n }, { closed: true });
  const yTop = yE + ent.dims.total;
  // cella: a cylinder with the door to the east, leaves open behind a bronze grille
  const cellaR = 2.6;
  const wallT = 0.42;
  const wallH = H + ent.dims.architrave + ent.dims.frieze;
  const doorW = 1.35;
  const doorH = 2.7;
  const half = Math.asin(doorW / 2 / cellaR);
  const wallProf = new ProfileBuilder(cellaR, 0).up(wallH).in(wallT).to(cellaR - wallT, 0).build();
  b.add(lathe(wallProf, { segments: segs, theta0: Math.PI + half, theta1: Math.PI * 3 - half }), 'marble_veined', T(0, P, 0));
  b.add(lathe(new ProfileBuilder(cellaR, doorH).up(wallH - doorH).in(wallT).to(cellaR - wallT, doorH).build(), { segments: 4, theta0: Math.PI - half, theta1: Math.PI + half }), 'marble_veined', T(0, P, 0));
  const dz = -(cellaR - wallT / 2) * Math.cos(half);
  for (const sx of [-1, 1]) {
    d.box('marble', sx * (doorW / 2 + 0.08), P + doorH / 2, dz - 0.04, 0.16, doorH, wallT + 0.1);
    // bronze leaves standing open against the inner wall
    d.box('bronze', sx * (doorW / 2 + 0.05), P + doorH / 2, dz + wallT / 2 + 0.35, 0.05, doorH - 0.05, 0.62);
  }
  d.box('marble', 0, P + doorH + 0.12, dz - 0.06, doorW + 0.5, 0.24, wallT + 0.14);
  for (let i = 0; i <= 6; i++) d.box('bronze', -doorW / 2 + (i * doorW) / 6, P + doorH / 2, dz - wallT / 2 - 0.02, 0.04, doorH, 0.04);
  for (const y of [0.3, 1.3, 2.3]) d.box('bronze', 0, P + y, dz - wallT / 2 - 0.02, doorW, 0.05, 0.05);
  d.solidCyl(0, P + wallH / 2, 0, cellaR, wallH);
  // inside: the hearth with the eternal fire, the curtained penus at the back
  const di = d.noShadow();
  di.cyl('marble_veined', 0, P + 0.02, 0, cellaR - wallT, 0.04, 24);
  di.cyl('travertine', 0, P + 0.3, 0.2, 0.55, 0.6, 16);
  di.cyl('black', 0, P + 0.61, 0.2, 0.45, 0.02, 16);
  di.cyl('glow_fire', 0, P + 0.85, 0.2, 0.3, 0.5, 8, { rTop: 0.02 });
  di.cyl('glow_fire', 0.12, P + 0.75, 0.3, 0.16, 0.32, 6, { rTop: 0.01 });
  di.span('fabric_white', -1.6, P, cellaR - wallT - 0.95, 1.6, P + 3.0, cellaR - wallT - 0.9);
  addFire(p, 0, P + 1.0, 0.2, { intensity: 9, distance: 7, dayScale: 1, glow: 0.55, flicker: 0.6 });
  // ceiling ring, conical bronze roof with the smoke vent
  const yc = yE + ent.dims.architrave + ent.dims.frieze;
  b.add(lathe({ pts: [...new ProfileBuilder(R + dims.d / 2 + 0.05, yc).to(0, yc).build().pts].reverse(), smooth: [false, false] }, { segments: segs }), 'wood_dark', undefined, { castShadow: false });
  const pitch = (26 * Math.PI) / 180;
  const roofR = R + ent.projection + 0.15;
  const rise2 = roofR * Math.tan(pitch);
  const ventR = 0.45;
  const roofProf = new ProfileBuilder(ventR, yTop + rise2 - ventR * Math.tan(pitch)).to(roofR, yTop - 0.05).build();
  b.add(lathe({ pts: [...roofProf.pts].reverse(), smooth: roofProf.smooth }, { segments: segs }), 'bronze', undefined, { uv: 'keep' });
  const under = new ProfileBuilder(roofR, yTop - 0.15).to(ventR, yTop + rise2 - ventR * Math.tan(pitch) - 0.15).build();
  b.add(lathe({ pts: [...under.pts].reverse(), smooth: under.smooth }, { segments: segs }), 'wood_dark');
  // the vent: a little lantern of posts under a cap, smoke-blackened
  const yv = yTop + rise2 - ventR * Math.tan(pitch);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    d.box('bronze', Math.sin(a) * ventR * 0.9, yv + 0.25, Math.cos(a) * ventR * 0.9, 0.06, 0.5, 0.06);
  }
  d.cyl('black', 0, yv + 0.02, 0, ventR * 0.85, 0.04, 12);
  d.cyl('bronze', 0, yv + 0.55, 0, ventR + 0.1, 0.12, 12, { rTop: 0.1 });
  d.cyl('gilded_bronze', 0, yv + 0.8, 0, 0.12, 0.4, 8, { rTop: 0.02 });
  p.spot('temple-vesta-fire', 'shrine', 0, P, dz - 1.0, 0);
  p.spot('temple-vesta-vestal', 'npc', 0.8, P, dz - 0.6, Math.PI);
  p.spot('temple-vesta-steps', 'npc', -1.6, 0, z0 - 0.8, 0);
}

// ---------------------------------------------------------------- Regia

function regia(p: Part) {
  const { b, d, hi } = p;
  const wf = 30 * p.S;
  const wb = 22 * p.S;
  const dp = 25 * p.S;
  const hd = dp / 2;
  const H = 4.8;
  const t = 0.6;
  const out: [number, number][] = [
    [-wf / 2, -hd],
    [wf / 2, -hd],
    [wb / 2, hd],
    [-wb / 2, hd],
  ];
  foundation(p, out, 0, 'tufa');
  pave(p, out, { material: 'paving_travertine', lift: 0.05, collide: true });
  // front range of rooms: z from −hd to −hd + 5.5; the court behind
  const zr = -hd + 5.5;
  const wo = { height: H, thickness: t, material: 'marble' as MaterialId, courses: hi ? 0.5 : 0, detail: p.detail, collide: false };
  // front wall with the door
  wall(b, { ...wo, length: wf, openings: [{ kind: 'door', x: wf / 2, width: 1.7, height: 3.0, leaves: 'open', leafMaterial: 'bronze' }] }, T(-wf / 2, 0, -hd + t / 2));
  d.solid(-wf / 2, 0, -hd, -0.85, H, -hd + t).solid(0.85, 0, -hd, wf / 2, H, -hd + t);
  // trapezoid flanks and the back wall: marble ashlar (Domitius Calvinus' rebuilding of 36 BC)
  const side = Math.hypot((wf - wb) / 2, dp);
  for (const sx of [-1, 1]) {
    const a = Math.atan2((-sx * (wf - wb)) / 2, dp);
    const cx = (sx * (wf + wb)) / 4 - sx * (t / 2);
    // wall frame: runs along +x from one end, outer face toward −z (turned outward)
    const ry = sx > 0 ? -Math.PI / 2 + a : Math.PI / 2 + a;
    const at = TRS(cx, 0, 0, 0, ry, 0);
    wall(b, { ...wo, length: side }, mul(at, T(-side / 2, 0, 0)));
    d.at(cx, 0, 0, a).solid(-t / 2, 0, -side / 2, t / 2, H, side / 2);
  }
  wall(b, { ...wo, length: wb }, TRS(wb / 2, 0, hd - t / 2, 0, Math.PI, 0));
  d.solid(-wb / 2, 0, hd - t, wb / 2, H, hd);
  // a moulded cornice round the top and corner pilasters
  if (hi) {
    for (const sx of [-1, 1]) {
      const a = Math.atan2((-sx * (wf - wb)) / 2, dp);
      d.box('marble', (sx * (wf + wb)) / 4 - sx * (t / 2) + sx * 0.08, H - 0.12, 0, t + 0.3, 0.24, side + 0.3, { ry: a });
      for (const z of [-hd + 0.3, hd - 0.3]) {
        const x = (z < 0 ? wf / 2 : wb / 2) - 0.1;
        d.box('marble', sx * x, H / 2, z, 0.6, H, 0.6);
      }
    }
    d.box('marble', 0, H - 0.12, hd + 0.08, wb + 0.3, 0.24, 0.3);
    d.box('marble', 0, H - 0.12, -hd - 0.08, wf + 0.3, 0.24, 0.3);
  }
  // the cross wall of the front range with a door into the court, and partition walls
  const xr = (wf / 2) * 0.96 - ((wf - wb) / 2) * (5.5 / dp);
  wall(b, { ...wo, height: H + 1.25, material: 'plaster_white', courses: 0, length: 2 * xr, openings: [{ kind: 'door', x: xr, width: 1.6, height: 2.8, leaves: 'none' }] }, T(-xr, 0, zr));
  d.solid(-xr, 0, zr - t / 2, -0.8, H, zr + t / 2).solid(0.8, 0, zr - t / 2, xr, H, zr + t / 2);
  for (const sx of [-1, 1]) d.span('plaster_white', sx * 1.4 - 0.25, 0, -hd + t, sx * 1.4 + 0.25, H, zr - t / 2, { collide: true });
  // roof over the front range, falling to the street front
  shedRoof(b, -wf / 2 - 0.2, wf / 2 + 0.2, zr + 0.35, -hd - 0.45, H + 1.25, H + 0.1, 'roof_tile', new THREE.Matrix4());
  d.span('wood_dark', -wf / 2 + t, H - 0.3, -hd + t, wf / 2 - t, H, zr, { shadow: false });
  // the sacrarium of Mars (W room): the twelve ancilia and the spears, seen through a bronze grille
  {
    const x0 = -wf / 2 + t + 0.4;
    const x1 = -1.65;
    const di = d.noShadow();
    for (let i = 0; i < 6; i++) {
      for (const row of [0, 1]) {
        const x = x0 + 0.5 + i * ((x1 - x0 - 1.0) / 5);
        const y = 1.6 + row * 1.0;
        const z = -hd + t + 0.05;
        di.ellipsoid('bronze', x, y + 0.18, z + 0.04, 0.22, 0.2, 0.04);
        di.ellipsoid('bronze', x, y - 0.18, z + 0.04, 0.22, 0.2, 0.04);
      }
    }
    for (let i = 0; i < 4; i++) di.rod('wood_dark', { x: x1 - 0.3 - i * 0.25, y: 0, z: zr - 0.6 }, { x: x1 - 0.3 - i * 0.25, y: 3.0, z: zr - 0.55 }, 0.025, 5);
    for (let i = 0; i < 4; i++) di.cyl('iron', x1 - 0.3 - i * 0.25, 3.05, zr - 0.55, 0.05, 0.25, 4, { rTop: 0.005 });
    // the grille in the partition wall facing the vestibule
    d.span('black', -1.2, 0.6, -hd + t + 1.0, -1.16, 2.6, -hd + t + 3.4);
    for (let i = 0; i <= 8; i++) d.box('bronze', -1.12, 1.6, -hd + t + 1.0 + i * 0.3, 0.04, 2.0, 0.04);
  }
  // the court: an altar, a well-head, the laurels at the door
  altar(d, 0, 0.05, (zr + hd) / 2, { w: 1.1, h: 1.0, mat: 'marble' });
  d.cyl('marble', 2.6, 0.45, hd - 2.5, 0.42, 0.8, hi ? 20 : 8, { collide: true });
  plantTrees(p, [
    { species: 'laurel', x: -1.5, z: -hd - 0.9, scale: 0.42 },
    { species: 'laurel', x: 1.5, z: -hd - 0.9, scale: 0.42 },
  ]);
  // the Fasti on the front wall, either side of the door
  if (hi) {
    for (const sx of [-1, 1]) inscription(b, T(sx * 4.6, 2.5, -hd - 0.035), text('regia-fasti'), 5.0, 2.2, 'carved', { depth: 0.04, sizes: [1, 0.6, 0.6, 0.6] });
  }
  for (const sx of [-1, 1]) lampAt(p, sx * 2.4, -hd - 1.2);
  p.spot('regia-door', 'door', 0, 0, -hd - 1.0, 0);
  p.spot('regia-fasti', 'inscription', 4.6, 0, -hd - 2.0, 0);
  p.spot('regia-ancilia', 'shrine', -0.6, 0, -hd + t + 2.2, -Math.PI / 2);
  p.spot('regia-court', 'npc', 1.5, 0, (zr + hd) / 2 - 1.2, 0);
}

// ---------------------------------------------------------------- Atrium Vestae

function atriumVestae(p: Part) {
  const { b, d, hi } = p;
  const W = 52 * p.S;
  const L = 105 * p.S;
  const hw = W / 2;
  const hl = L / 2;
  // the W end is set back from the atlas outline so the front wall clears the Temple of Vesta's steps
  const zF = -hl + 5.0;
  const H = 8.4;
  const t = 0.7;
  const fy = 0.3;
  foundation(p, rect(-hw, zF, hw, hl), 0, 'brick');
  d.span('concrete', -hw, -0.2, zF, hw, fy - 0.02, hl, { collide: true, shadow: false });
  // court and portico rectangle
  const cx = 6.0;
  const cz0 = zF + 8.0;
  const cz1 = hl - 11.5;
  const pd = 2.6;
  // outer brick walls, two storeys with small windows above; the entrance at the W (−z) end
  const winRow = (len: number) => {
    const o = [];
    const k = Math.floor(len / 3.2);
    for (let i = 0; i < k; i++) o.push({ kind: 'window' as const, x: (len * (i + 0.5)) / k, width: 0.8, height: 1.2, sill: 5.6, frame: false });
    return o;
  };
  const wo = { height: H, thickness: t, material: 'brick' as MaterialId, detail: p.detail, collide: false };
  wall(b, { ...wo, length: W, openings: [{ kind: 'door', x: hw, width: 2.0, height: 3.2, leaves: 'open', leafMaterial: 'wood_dark', frame: true }] }, T(-hw, fy, zF + t / 2));
  wall(b, { ...wo, length: W, openings: winRow(W) }, TRS(hw, fy, hl - t / 2, 0, Math.PI, 0));
  // the N side on the Sacra Via: a row of shops let into the outer wall (see sacraViaShops)
  const sideL = hl - zF - 2 * t;
  const shops = sacraViaBays(sideL);
  const shopOpenings: Opening[] = shops.map((sb) => (sb.kind === 'closed' ? { kind: 'door' as const, x: sb.x, width: 2.7, height: 2.9, leaves: 'closed' as const, leafMaterial: 'wood_dark' as MaterialId } : { kind: 'door' as const, x: sb.x, width: 2.7, height: 2.9, leaves: 'none' as const }));
  wall(b, { ...wo, length: sideL, openings: [...winRow(sideL), ...shopOpenings] }, TRS(hw - t / 2, fy, zF + t, 0, -Math.PI / 2, 0));
  wall(b, { ...wo, length: sideL, openings: winRow(sideL) }, TRS(-hw + t / 2, fy, hl - t, 0, Math.PI / 2, 0));
  d.solid(-hw, 0, zF, -1.0, H, zF + t).solid(1.0, 0, zF, hw, H, zF + t);
  d.solid(-hw, 0, hl - t, hw, H, hl).solid(-hw, 0, zF, -hw + t, H, hl);
  {
    let zPrev = zF;
    for (const sb of shops) {
      const zc = zF + t + sb.x;
      d.solid(hw - t, 0, zPrev, hw, H, zc - 1.35);
      d.solid(hw - t, fy + 2.9, zc - 1.35, hw, H, zc + 1.35);
      zPrev = zc + 1.35;
    }
    d.solid(hw - t, 0, zPrev, hw, H, hl);
  }
  sacraViaShops(p, hw, zF + t, shops, fy);
  entrancePorch(p, zF, fy);
  // the vestibule passage from the door to the court
  for (const sx of [-1, 1]) d.span('plaster_white', sx * 1.0, fy, zF + t, sx * 1.4, fy + 4.0, cz0 - pd, { collide: true });
  // ranges of rooms round the court: inner walls with doors, two storeys under tiled roofs
  const rx = cx + pd;
  const rz0 = cz0 - pd;
  const rz1 = cz1 + pd;
  const doors = (len: number) => {
    const k = Math.max(1, Math.floor(len / 4.2));
    const o: Opening[] = [];
    for (let i = 0; i < k; i++) o.push({ kind: 'door', x: (len * (i + 0.5)) / k, width: 1.1, height: 2.3, leaves: 'closed', leafMaterial: 'wood_dark' });
    // the upper storey's windows, between the doors (above the portico roofs)
    for (let i = 1; i < k; i++) o.push({ kind: 'window', x: (len * i) / k, width: 0.9, height: 1.3, sill: 6.2, frame: false });
    return o;
  };
  const iwo = { height: H + 1.2, thickness: 0.5, material: 'plaster_white' as MaterialId, detail: p.detail, collide: false };
  wall(b, { ...iwo, length: rz1 - rz0, openings: doors(rz1 - rz0) }, TRS(rx, fy, rz0, 0, -Math.PI / 2, 0));
  wall(b, { ...iwo, length: rz1 - rz0, openings: doors(rz1 - rz0) }, TRS(-rx, fy, rz1, 0, Math.PI / 2, 0));
  wall(b, { ...iwo, length: 2 * rx, openings: [{ kind: 'arch', x: rx, width: 2.2, height: 3.4 }] }, TRS(rx, fy, rz0, 0, Math.PI, 0));
  d.solid(rx - 0.25, 0, rz0, rx + 0.25, H, rz1).solid(-rx - 0.25, 0, rz0, -rx + 0.25, H, rz1);
  d.solid(-rx, 0, rz0 - 0.25, -1.1, H, rz0 + 0.25).solid(1.1, 0, rz0 - 0.25, rx, H, rz0 + 0.25);
  // the tablinum at the E end: a wide hall open to the court
  wall(b, { ...iwo, length: 2 * rx, openings: [{ kind: 'arch', x: rx, width: 5.0, height: 5.2 }] }, T(-rx, fy, rz1));
  d.solid(-rx, 0, rz1 - 0.25, -2.5, H, rz1 + 0.25).solid(2.5, 0, rz1 - 0.25, rx, H, rz1 + 0.25);
  // a shallow tablinum: the back of the house is cut into the Palatine slope
  const tb = rz1 + 3.2;
  d.span('black', -2.4, fy, tb, 2.4, fy + 4.4, tb + 0.05);
  d.span('plaster_white', -rx, fy, tb + 0.05, rx, fy + H - 0.4, hl - t, { collide: true });
  d.span('mosaic', -rx, fy - 0.01, rz1, rx, fy + 0.01, tb, { shadow: false });
  // roofs: lean-to roofs over the room ranges, falling from the court walls to the street walls
  const eave = fy + H - 0.4;
  // (rotated frames: Ry(+π/2) maps roof-local z to world x and x to world −z; Ry(−π/2) the mirror)
  shedRoof(b, -rz1, -rz0, rx - 0.2, hw + 0.4, eave + 1.6, eave, 'roof_tile', TRS(0, 0, 0, 0, Math.PI / 2, 0));
  shedRoof(b, rz0, rz1, rx - 0.2, hw + 0.4, eave + 1.6, eave, 'roof_tile', TRS(0, 0, 0, 0, -Math.PI / 2, 0));
  shedRoof(b, -hw - 0.4, hw + 0.4, rz0 + 0.2, zF - 0.4, eave + 1.6, eave, 'roof_tile', new THREE.Matrix4());
  shedRoof(b, -hw - 0.4, hw + 0.4, rz1 - 0.2, hl + 0.4, eave + 1.6, eave, 'roof_tile', new THREE.Matrix4());
  // the court portico: Ionic columns all round, a lean-to roof against the ranges
  const cH = 3.8;
  const D = cH / 9;
  const ring: [number, number][] = [];
  const nx = 4;
  const nz = Math.round((cz1 - cz0) / 3.2);
  for (let i = 0; i <= nx; i++) ring.push([-cx + (2 * cx * i) / nx, cz0], [-cx + (2 * cx * i) / nx, cz1]);
  for (let j = 1; j < nz; j++) ring.push([-cx, cz0 + ((cz1 - cz0) * j) / nz], [cx, cz0 + ((cz1 - cz0) * j) / nz]);
  // (kit 'low' columns: the court is only seen from inside it, and there are thirty-two of them)
  for (const [x, z] of ring) col(b, { order: 'ionic', D, H: cH, tier: hi ? 'low' : 'stub', material: 'marble', fluted: false, collide: p.main }, T(x, fy, z));
  const dd = columnDims('ionic', D, cH).d;
  // the entablature faces into the court (path reversed so the profile's face points inward)
  entablature(b, [new THREE.Vector3(-cx + dd / 2, fy + cH, cz0 + dd / 2), new THREE.Vector3(cx - dd / 2, fy + cH, cz0 + dd / 2), new THREE.Vector3(cx - dd / 2, fy + cH, cz1 - dd / 2), new THREE.Vector3(-cx + dd / 2, fy + cH, cz1 - dd / 2)].reverse(), { order: 'ionic', columnHeight: cH, D, material: 'marble', detail: p.detail }, { closed: true });
  const yp = fy + cH + cH * 0.2;
  shedRoof(b, -(cz1 + 0.3), -(cz0 - 0.3), rx, cx - 0.3, yp + 1.0, yp, 'roof_tile', TRS(0, 0, 0, 0, Math.PI / 2, 0));
  shedRoof(b, cz0 - 0.3, cz1 + 0.3, rx, cx - 0.3, yp + 1.0, yp, 'roof_tile', TRS(0, 0, 0, 0, -Math.PI / 2, 0));
  shedRoof(b, -rx, rx, rz0, cz0 + 0.3, yp + 1.0, yp, 'roof_tile', new THREE.Matrix4());
  shedRoof(b, -rx, rx, rz1, cz1 - 0.3, yp + 1.0, yp, 'roof_tile', new THREE.Matrix4());
  d.span('wood_dark', -rx, yp - 0.2, rz0, rx, yp, rz0 + pd, { shadow: false });
  d.span('wood_dark', -rx, yp - 0.2, rz1 - pd, rx, yp, rz1, { shadow: false });
  d.span('wood_dark', cx, yp - 0.2, rz0, rx, yp, rz1, { shadow: false }).span('wood_dark', -rx, yp - 0.2, rz0, -cx, yp, rz1, { shadow: false });
  // portico floors, the garden and the three pools
  d.span('marble', -rx, fy - 0.01, rz0, rx, fy + 0.02, cz0, { shadow: false }).span('marble', -rx, fy - 0.01, cz1, rx, fy + 0.02, rz1, { shadow: false });
  d.span('marble', cx, fy - 0.01, cz0, rx, fy + 0.02, cz1, { shadow: false }).span('marble', -rx, fy - 0.01, cz0, -cx, fy + 0.02, cz1, { shadow: false });
  d.span('gravel', -cx, fy - 0.03, cz0, cx, fy + 0.0, cz1, { shadow: false });
  const pools: [number, number, number][] = [
    [(cz0 + cz1) / 2, 3.0, 13.0],
    [cz0 + 4.0, 2.6, 2.6],
    [cz1 - 4.0, 2.6, 2.6],
  ];
  for (const [z, w, l] of pools) {
    d.span('marble', -w / 2 - 0.25, fy, z - l / 2 - 0.25, w / 2 + 0.25, fy + 0.35, z + l / 2 + 0.25, { collide: true });
    d.span('water', -w / 2, fy + 0.25, z - l / 2, w / 2, fy + 0.36, z + l / 2, { shadow: false });
  }
  if (hi) {
    hedge(d, -cx + 1.0, cz0 + 7.0, -cx + 1.5, cz1 - 7.0, 0.7, 3);
    hedge(d, cx - 1.5, cz0 + 7.0, cx - 1.0, cz1 - 7.0, 0.7, 4);
  }
  plantTrees(p, [
    { species: 'laurel', x: -3.4, z: cz0 + 7.5, scale: 0.55 },
    { species: 'laurel', x: 3.4, z: cz1 - 7.5, scale: 0.55 },
    { species: 'oleander', x: 3.4, z: cz0 + 9.0, scale: 0.8, y: fy },
    { species: 'oleander', x: -3.4, z: cz1 - 9.0, scale: 0.8, y: fy },
  ]);
  // statues of Chief Vestals on inscribed bases along the court
  const vz = [cz0 + 9.5, (cz0 + cz1) / 2, cz1 - 9.5];
  vz.forEach((z, i) => {
    for (const sx of hi ? [-1, 1] : []) {
      if (i === 1 && sx > 0) continue;
      const at = TRS(sx * (cx - 0.9), fy, z, 0, sx < 0 ? -Math.PI / 2 : Math.PI / 2, 0);
      const h = pedestal(b, at, 0.75, 0.65, 1.2, 'marble', hi && i === 0 && sx < 0 ? text('atrium-vestae-statue') : undefined);
      figure(b, mul(at, T(0, h, 0)), false, 'marble', 1.0, (s) => drapedFemale(s, { right: 'patera', left: 'mantle', head: { crown: 'veil' } }));
    }
  });
  p.spot('atrium-vestae-door', 'door', 0, fy, zF - 1.2, 0);
  p.spot('atrium-vestae-statue', 'inscription', -(cx - 0.9) + 1.3, fy, vz[0], -Math.PI / 2);
  p.spot('atrium-vestae-vestal-1', 'npc', 0.0, fy, cz0 + 2.5, 0);
  p.spot('atrium-vestae-vestal-2', 'npc', -2.0, fy, cz1 - 1.5, Math.PI);
  p.spot('atrium-vestae-tablinum', 'npc', 0, fy, rz1 + 2.0, Math.PI);
}

// ---------------------------------------------------------------- Atrium Vestae: porch and shops

type SacraBay = { x: number; kind: ShopKind | 'closed' };

/** Shops along the Atrium's N wall (wall length `len`), by centre along the wall. */
function sacraViaBays(len: number): SacraBay[] {
  const kinds: (ShopKind | 'closed')[] = ['moneychanger', 'textile', 'general', 'closed', 'moneychanger', 'pottery', 'thermopolium', 'general', 'closed', 'textile', 'moneychanger'];
  const bay = 4.4;
  const n = Math.min(kinds.length, Math.floor((len - 6) / bay));
  const x0 = (len - n * bay) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + (i + 0.5) * bay, kind: kinds[i] }));
}

/**
 * The Sacra Via front of the Atrium Vestae (local +x side): Nero rebuilt the street after the fire
 * of 64 as a porticoed avenue up to his vestibule, so the shops let into the house's outer wall open
 * under a travertine colonnade with a tiled lean-to roof; steps take up the fall of the street.
 * Jewellers, money-changers, cloth and pottery dealers and a hot-food bar, lamps lit at dusk.
 */
function sacraViaShops(p: Part, hw: number, zWall: number, bays: SacraBay[], fy: number) {
  const { b, d, hi } = p;
  if (!bays.length) return;
  const bay = 4.4;
  const zA = zWall + bays[0].x - bay / 2 - 0.4;
  const zB = zWall + bays[bays.length - 1].x + bay / 2 + 0.4;
  const pd = 3.0;
  const xf = hw + pd;
  // portico floor on a foundation down to the street
  foundation(p, rect(hw, zA, xf, zB), fy - 0.02, 'travertine');
  d.span('paving_travertine', hw, fy - 0.3, zA, xf, fy, zB, { collide: true, shadow: false });
  // Tuscan columns of travertine at the bay divisions, a timber-cased beam, the lean-to roof
  const cH = 3.6;
  const D = cH / 7;
  for (let i = 0; i <= bays.length; i++) {
    const z = i === 0 ? zA + 0.4 : i === bays.length ? zB - 0.4 : zWall + bays[i - 1].x + bay / 2;
    col(b, { order: 'tuscan', D, H: cH, tier: hi ? 'mid' : 'stub', material: 'travertine', collide: p.main }, T(xf - 0.4, fy, z));
  }
  d.span('travertine', xf - 0.75, fy + cH, zA, xf - 0.05, fy + cH + 0.5, zB);
  d.span('wood_dark', hw, fy + cH + 0.2, zA, xf - 0.75, fy + cH + 0.32, zB, { shadow: false });
  shedRoof(b, -zB - 0.2, -zA + 0.2, hw - 0.05, xf + 0.3, fy + cH + 1.5, fy + cH + 0.5, 'roof_tile', TRS(0, 0, 0, 0, Math.PI / 2, 0));
  // steps down to the street where it falls away, bay by bay
  const run = 0.33;
  const segs: [number, number][] = [[zA, zWall + bays[0].x + bay / 2]];
  for (let i = 1; i < bays.length - 1; i++) segs.push([zWall + bays[i].x - bay / 2, zWall + bays[i].x + bay / 2]);
  segs.push([zWall + bays[bays.length - 1].x - bay / 2, zB]);
  for (const [z0, z1] of segs) {
    let g = Infinity;
    for (let k = 0; k <= 4; k++) g = Math.min(g, p.ctx.groundAt(xf + 0.6, z0 + ((z1 - z0) * k) / 4));
    const hgt = fy - g;
    if (hgt < 0.08) continue;
    const count = Math.ceil(hgt / 0.2);
    stairs(b, { width: z1 - z0 - 0.5, rise: hgt / count, run, count, material: 'travertine', collider: p.main ? 'steps' : 'none' }, TRS(xf + count * run, g, (z0 + z1) / 2, 0, -Math.PI / 2, 0));
  }
  // the sidewalk from the portico steps out to the kerb of the Sacra Via
  const road = roadLocal(p.ctx, 'via-sacra');
  if (road) {
    const edge: V2[] = [];
    for (let k = 0; k <= 8; k++) {
      const z = zA + ((zB - zA) * k) / 8;
      const xr = crossingX(road.pts, z);
      if (xr !== null && xr > xf) edge.push([Math.max(xf + 0.6, xr - road.hw - 0.1), z]);
    }
    if (edge.length >= 2) pave(p, [[xf - 0.05, edge[0][1]], ...edge, [xf - 0.05, edge[edge.length - 1][1]]].reverse() as V2[], { material: 'paving_travertine', lift: 0.05 });
  }
  // the shops (frame: front at the wall face, room toward −x)
  const rng = p.ctx.rng.fork('sacra-shops');
  const depth = 4.0;
  bays.forEach((sb, i) => {
    const zc = zWall + sb.x;
    const sd = d.at(hw, fy, zc, -Math.PI / 2).noShadow();
    if (sb.kind !== 'closed') {
      if (hi) {
        shopInterior(sd, sb.kind, { w: 3.6, depth, h: 3.3, t: 0.7, wealth: 0.8 }, rng.fork(i));
        // a jeweller's touch on the money-changers' counters: gold rings and pearls on a tray
        if (sb.kind === 'moneychanger') for (let k = 0; k < 6; k++) sd.cyl(k % 2 ? 'gilded_bronze' : 'marble', -0.9 + k * 0.12, 0.95, 1.2, 0.03, 0.02, 8);
      } else sd.span('black', -1.4, 0, 0.75, 1.4, 2.9, 0.8);
      p.spot(`sacra-via-taberna-${i}`, 'vendor', hw - 1.6, fy, zc, -Math.PI / 2);
    }
    if (p.main) {
      sd.solid(-1.9, 0, depth, 1.9, 3.3, depth + 0.2);
      sd.solid(-1.95, 0, 0.7, -1.8, 3.3, depth);
      sd.solid(1.8, 0, 0.7, 1.95, 3.3, depth);
    }
  });
  // lamps under the portico, crowd spots on the street front
  for (const k of [1, Math.floor(bays.length / 2), bays.length - 2]) {
    const z = zWall + bays[k].x + bay / 2;
    if (hi) placeProp(d, 'lampstand', xf - 1.0, fy, z, 0, { collide: p.main });
    addFire(p, xf - 1.0, fy + 1.45, z, { night: true, intensity: 6, distance: 8, glow: 0.3 });
  }
  for (const k of [0, 3, 6, 9]) {
    if (k >= bays.length) continue;
    p.spot(`sacra-via-porticus-${k}`, 'npc', xf - 1.4, fy, zWall + bays[k].x + 0.8, Math.PI / 2);
  }
}

/** A small Ionic porch (prothyron) before the Atrium's door on its W front (outer face at z = zF). */
function entrancePorch(p: Part, zF: number, fy: number) {
  const { b, d, hi } = p;
  const H = 4.4;
  const D = H / 9;
  const dims = columnDims('ionic', D, H);
  const zc = zF - 2.3;
  const hwp = 3.6;
  foundation(p, rect(-hwp, zc - 0.6, hwp, zF), fy - 0.02, 'travertine');
  d.span('travertine', -hwp, fy - 0.3, zc - 0.6, hwp, fy, zF, { collide: true, shadow: false });
  {
    const g = Math.min(p.ctx.groundAt(-2, zc - 1.2), p.ctx.groundAt(2, zc - 1.2), p.ctx.groundAt(0, zc - 1.2));
    const hgt = fy - g;
    if (hgt > 0.05) {
      const count = Math.max(1, Math.ceil(hgt / 0.2));
      stairs(b, { width: 2 * hwp - 0.4, rise: hgt / count, run: 0.33, count, material: 'travertine', collider: p.main ? 'steps' : 'none' }, T(0, g, zc - 0.6 - count * 0.33));
    }
  }
  for (const x of [-3.0, -1.25, 1.25, 3.0]) col(b, { order: 'ionic', D, H, tier: hi ? 'mid' : 'stub', material: 'marble', collide: p.main }, T(x, fy, zc));
  const ez = zc - dims.d / 2;
  const ent = entablature(b, [new THREE.Vector3(-3.4, fy + H, zF), new THREE.Vector3(-3.4, fy + H, ez), new THREE.Vector3(3.4, fy + H, ez), new THREE.Vector3(3.4, fy + H, zF)], { order: 'ionic', columnHeight: H, D, material: 'marble', detail: p.detail }, { caps: false });
  const yTop = fy + H + ent.dims.total;
  pediment(b, { order: 'ionic', span: 6.8, cornice: ent.dims.cornice, depth: 0.5, material: 'marble', detail: p.detail, D, relief: false }, T(0, yTop, ez));
  gableRoof(b, -3.5 - ent.projection, 3.5 + ent.projection, ez + 0.2, zF + 0.3, yTop - 0.05, (14 * Math.PI) / 180, 'roof_tile', hi, new THREE.Matrix4());
  d.span('wood_dark', -3.3, fy + H + ent.dims.architrave, ez, 3.3, fy + H + ent.dims.architrave + 0.15, zF, { shadow: false });
  addFire(p, 1.6, fy + 2.2, zF - 0.3, { night: true, intensity: 5, distance: 7, glow: 0.3 });
}

// ---------------------------------------------------------------- Lacus Iuturnae

function juturna(p: Part) {
  const { b, d, hi } = p;
  const s = 4.4;
  const h = s / 2;
  const t = 0.26;
  // marble-lined basin
  d.span('marble', -h, 0, -h, h, 0.95, -h + t, { collide: true }).span('marble', -h, 0, h - t, h, 0.95, h, { collide: true });
  d.span('marble', -h, 0, -h, -h + t, 0.95, h, { collide: true }).span('marble', h - t, 0, -h, h, 0.95, h, { collide: true });
  d.span('marble', -h + t, 0, -h + t, h - t, 0.15, h - t);
  d.span('water', -h + t, 0.62, -h + t, h - t, 0.72, h - t, { shadow: false });
  // central plinth with the Dioscuri watering their horses
  d.span('marble', -0.85, 0, -1.15, 0.85, 1.0, 1.15, { collide: true });
  for (const sx of [-1, 1]) {
    const sc = new Sculpt(hi, 'marble');
    horse(sc, new THREE.Vector3(0, 0, 0), sx > 0);
    sc.emit(b, TRS(sx * 0.42, 1.0, 0.15, 0, sx * 0.25, 0), 0.62);
    figure(b, TRS(sx * 0.62, 1.0, -0.65, 0, sx * -0.3, 0), hi, 'marble', 0.68, (f) => nudeMale(f, { right: sx > 0 ? 'down' : 'spear', left: sx > 0 ? 'spear' : 'down', cloak: true, plinth: false, head: { crown: 'pileus' } }));
  }
  // the aedicula of Juturna beside the basin, her altar and the inscribed well-head
  aediculaShrine(p, TRS(h + 2.3, 0, 1.0, 0, 0, 0), (f) => drapedFemale(f, { right: 'patera', left: 'sceptre', plinth: false, head: { crown: 'diadem' } }));
  altar(d, h + 2.3, 0, -1.3, { w: 0.8, h: 0.9 });
  d.cyl('marble', h + 0.9, 0.42, -1.9, 0.45, 0.84, hi ? 20 : 8, { collide: true });
  d.cyl('black', h + 0.9, 0.845, -1.9, 0.32, 0.01, 12);
  if (hi) inscription(b, TRS(h + 0.9, 0.5, -1.9 - 0.47, 0, 0, 0), text('lacus-juturnae-puteal'), 0.7, 0.32, 'carved', { depth: 0.02, sizes: [0.8, 0.8] });
  p.spot('lacus-juturnae', 'shrine', 0, 0, -h - 1.0, 0);
  p.spot('lacus-juturnae-puteal', 'inscription', h + 0.9, 0, -2.9, 0);
  p.spot('lacus-juturnae-water', 'npc', -h - 0.6, 0, 0, Math.PI / 2);
}

export const builders: LandmarkBuilder[] = [
  { handles: ['temple-vesta'], build: (ctx) => landmark(ctx, vesta, { near: 130 }) },
  { handles: ['regia'], build: (ctx) => landmark(ctx, regia, { near: 110 }) },
  { handles: ['atrium-vestae'], build: (ctx) => landmark(ctx, atriumVestae, { near: 110 }) },
  { handles: ['lacus-juturnae'], build: (ctx) => landmark(ctx, juturna, { cull: 240 }) },
];

