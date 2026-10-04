/**
 * The Senate House and the state prison at the foot of the Capitol.
 *
 * Curia Iulia (Domitian's restoration of AD 94, on the plan the Diocletianic rebuild kept): a tall
 * brick hall, marble-revetted below and stuccoed to imitate ashlar above, three great windows in
 * the gable front, corner pilasters, a pediment with Victory on a globe at the apex and a low
 * columned porch (the Chalcidicum, as Octavian's coins show it). Inside, enterable through the
 * open bronze doors: three broad steps for the senators' chairs along both long walls, an opus
 * sectile floor of giallo, pavonazzetto, porphyry and serpentine, statues in aediculae, the
 * presiding magistrates' tribunal and, behind it, the Altar and Statue of Victory with incense
 * burning on the altar.
 *
 * Carcer Tullianum: the trapezoidal block of peperino with its travertine front naming the
 * consuls Vibius Rufinus and Cocceius Nerva, and a barred door.
 */
import * as THREE from 'three';
import { corniceOnlyProfile, entablature, pediment } from '../../../arch/classical/entablature';
import { columnDims, diameterForHeight } from '../../../arch/classical/orders';
import { togate } from '../../../arch/classical/statues';
import { sweep } from '../../../arch/common/geom';
import { stairs } from '../../../arch/common/stairs';
import { wall } from '../../../arch/common/walls';
import { doorFrame, doorLeaves, wall as fwall, type Opening as FOpening } from '../../../arch/fabric/wall';
import { placeProp } from '../../../arch/props';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder } from '../types';
import { FORUM_INSCRIPTIONS } from './forum-data';
import { drapedFemale, figure } from './forum-figures';
import { T, TRS, addFire, altar, col, foundation, groundRange, inscription, landmark, pedestal, rect, type Part } from './forum-kit';
import { gableRoof, shedRoof } from './forum-temple';
import { lampAt } from './forum-street';

const text = (id: string) => FORUM_INSCRIPTIONS[id].latin;

// ---------------------------------------------------------------- Curia Iulia

function curia(p: Part) {
  const { b, d, hi, ctx } = p;
  const W = 18 * p.S;
  const L = 27 * p.S;
  const hw = W / 2;
  const hl = L / 2;
  const t = 0.9;
  // floor level: clear of the ground that rises under the back of the hall, the front steps make up the rest
  const Y = Math.max(0.4, groundRange(ctx, rect(-hw, -hl, hw, hl)).max + 0.2);
  const H = 11.0; // wall top
  const ix = hw - t;
  const iz0 = -hl + t;
  const iz1 = hl - t;
  // foundation down to the lowest ground, a raised floor slab
  foundation(p, rect(-hw, -hl, hw, hl), 0, 'brick');
  d.span('concrete', -hw, -0.6, -hl, hw, Y - 0.04, hl, { collide: true, shadow: false });
  // walls: the front with the door and three high windows, the back with three windows
  const doorW = 2.6;
  const doorH = 5.2;
  // the gable walls: stucco imitating ashlar, real window openings that light the hall
  const wins: FOpening[] = [-1, 0, 1].map((k) => ({ x0: k * 2.9 - 0.85, x1: k * 2.9 + 0.85, y0: 7.0, y1: 9.6 }));
  const door: FOpening = { x0: -doorW / 2, x1: doorW / 2, y0: 0, y1: doorH };
  const fd = d.at(0, Y, -hl);
  fwall(fd, 'plaster_white', -hw, hw, -0.3, H, t, [door, ...wins]);
  fwall(d.at(0, Y, hl, Math.PI), 'plaster_white', -hw, hw, -0.3, H, t, wins);
  if (hi) for (const y of [5.6, 6.8, 8.0, 9.2, 10.2]) d.span('plaster_cream', -hw + 0.6, Y + y, -hl - 0.012, hw - 0.6, Y + y + 0.025, -hl);
  doorFrame(fd, door, 'marble', { cornice: true });
  doorLeaves(fd, door, t, 0.85, 'bronze', true);
  for (const w of wins) for (const z of [-hl, hl - 0.12]) d.span('marble', w.x0 - 0.12, Y + w.y0 - 0.14, z - 0.04, w.x1 + 0.12, Y + w.y0, z + 0.16);
  const wo = { height: H, thickness: t, detail: p.detail, collide: false } as const;
  wall(b, { ...wo, length: L - 2 * t, material: 'brick' }, TRS(hw - t / 2, Y, -hl + t, 0, -Math.PI / 2, 0));
  wall(b, { ...wo, length: L - 2 * t, material: 'brick' }, TRS(-hw + t / 2, Y, hl - t, 0, Math.PI / 2, 0));
  // marble revetment of the lower front, on either side of the door
  for (const sx of [-1, 1]) d.span('marble', sx * (doorW / 2 + 0.25), Y, -hl - 0.06, sx * (hw + 0.3), Y + 4.6, -hl + 0.02);
  d.span('marble', -hw - 0.3, Y + 4.6, -hl - 0.1, hw + 0.3, Y + 5.0, -hl + 0.02);
  // corner pilasters (buttresses)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) d.box('brick', sx * (hw - 0.2), Y + H / 2, sz * (hl - 0.2), 1.0, H, 1.0);
  // colliders: walls with the door gap
  d.solid(-hw, Y, -hl, -doorW / 2, Y + H, -hl + t).solid(doorW / 2, Y, -hl, hw, Y + H, -hl + t);
  d.solid(-hw, Y, hl - t, hw, Y + H, hl).solid(-hw, Y, -hl, -hw + t, Y + H, hl).solid(hw - t, Y, -hl, hw, Y + H, hl);
  // cornice and pediments, tiled roof
  const crown = corniceOnlyProfile('corinthian', 0.7, p.detail, 0.6, true);
  const path = [new THREE.Vector3(-hw - 0.1, Y + H - 0.7, -hl - 0.1), new THREE.Vector3(hw + 0.1, Y + H - 0.7, -hl - 0.1), new THREE.Vector3(hw + 0.1, Y + H - 0.7, hl + 0.1), new THREE.Vector3(-hw - 0.1, Y + H - 0.7, hl + 0.1)];
  b.add(sweep(crown.profile, path, { closed: true, back: true }), 'marble');
  const pitchDeg = 17;
  const pf = pediment(b, { order: 'corinthian', span: W + 0.2, cornice: 0.7, depth: 0.7, material: 'marble', detail: p.detail, D: 0.7, pitchDeg, relief: false }, T(0, Y + H, -hl - 0.1));
  pediment(b, { order: 'corinthian', span: W + 0.2, cornice: 0.7, depth: 0.7, material: 'marble', detail: p.detail, D: 0.7, pitchDeg }, TRS(0, Y + H, hl + 0.1, 0, Math.PI, 0));
  gableRoof(b, -hw - 0.6, hw + 0.6, -hl + 0.3, hl - 0.3, Y + H - 0.05, (pitchDeg * Math.PI) / 180, 'roof_tile', hi, new THREE.Matrix4());
  // Victory on a globe at the apex
  d.ellipsoid('gilded_bronze', 0, Y + H + pf.apex + 0.35, -hl + 0.2, 0.42, 0.42, 0.42);
  figure(b, T(0, Y + H + pf.apex + 0.7, -hl + 0.2), hi, 'gilded_bronze', 1.4, (s) => drapedFemale(s, { right: 'wreath', left: 'palm', wings: true, stride: true, plinth: false }));
  // the porch (Chalcidicum): six Ionic columns on the top step, a lean-to roof against the facade
  const pz = -hl - 2.7;
  const steps = Math.max(3, Math.ceil((Y - groundRange(ctx, rect(-hw - 0.5, pz - 2, hw + 0.5, pz)).min) / 0.2));
  const rise = (Y - Math.min(0, groundRange(ctx, rect(-hw - 0.5, pz - 2, hw + 0.5, pz)).min)) / steps;
  const run = 0.34;
  const y0 = Y - steps * rise;
  stairs(b, { width: W + 0.8, rise, run, count: steps, material: 'marble', collider: p.main ? 'steps' : 'none' }, T(0, y0, pz - steps * run));
  d.span('marble', -hw - 0.4, y0, pz, hw + 0.4, Y, -hl, { collide: true });
  foundation(p, rect(-hw - 0.4, pz - steps * run, hw + 0.4, -hl), y0, 'marble');
  // Where the senators and lictors wait for the doors to open: on the Comitium's paving at the foot of
  // the stair, 1.6 m off its lowest tread, in the street (the content's `curia-julia:front` follows it).
  p.spot('curia-forecourt', 'npc', 0, p.ctx.groundAt(0, pz - steps * run - 1.6), pz - steps * run - 1.6, 0);
  const cH = 4.6;
  const D = diameterForHeight('ionic', cH);
  const xs = [-hw + 0.5, -hw + 0.5 + (W - 1) / 5, -hw + 0.5 + (2 * (W - 1)) / 5, hw - 0.5 - (2 * (W - 1)) / 5, hw - 0.5 - (W - 1) / 5, hw - 0.5];
  for (const x of xs) col(b, { order: 'ionic', D, H: cH, tier: hi ? 'mid' : 'stub', material: 'marble', collide: p.main }, T(x, Y, pz + 0.5));
  const dd = columnDims('ionic', D, cH).d;
  const pe = entablature(b, [new THREE.Vector3(-hw - 0.2, Y + cH, -hl), new THREE.Vector3(-hw - 0.2, Y + cH, pz + 0.5 - dd / 2), new THREE.Vector3(hw + 0.2, Y + cH, pz + 0.5 - dd / 2), new THREE.Vector3(hw + 0.2, Y + cH, -hl)], { order: 'ionic', columnHeight: cH, D, material: 'marble', detail: p.detail }, { caps: false });
  shedRoof(b, -hw - 0.5, hw + 0.5, -hl + 0.02, pz - 0.2, Y + cH + pe.dims.total + 1.0, Y + cH + pe.dims.total, 'roof_tile', new THREE.Matrix4());
  d.span('wood_dark', -hw, Y + cH + pe.dims.architrave, pz + 0.5, hw, Y + cH + pe.dims.architrave + 0.2, -hl, { shadow: false });

  // ---- interior (near version only)
  if (!hi) return;
  const di = d.noShadow();
  // opus sectile floor: giallo field, pavonazzetto squares with porphyry and serpentine roundels
  di.span('marble_giallo', -ix, Y - 0.02, iz0, ix, Y + 0.01, iz1);
  if (hi) {
    const n = 4;
    const m = 9;
    const cw = 3.4 / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < m; j++) {
        const x = -1.7 + (i + 0.5) * cw;
        const z = iz0 + 1.6 + j * 1.25;
        di.box('marble_pavonazzetto', x, Y + 0.018, z, cw * 0.82, 0.016, cw * 0.82);
        di.cyl((i + j) % 2 ? 'porphyry' : 'rock', x, Y + 0.028, z, cw * 0.3, 0.012, 16);
      }
  }
  // the senators' three broad steps along both long walls
  const tierZ0 = iz0 + 1.6;
  const tierZ1 = iz1 - 2.4;
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const w = (3 - k) * 0.9;
      const xa = sx > 0 ? ix - w : -ix;
      const xb = sx > 0 ? ix : -ix + w;
      d.span('marble', xa, Y, tierZ0, xb, Y + (k + 1) * 0.2, tierZ1, { collide: true });
    }
    // chairs (subsellia) on the steps
    if (hi) {
      for (let j = 0; j < 6; j++) {
        const z = tierZ0 + 0.8 + j * ((tierZ1 - tierZ0 - 1.6) / 5);
        placeProp(di, 'stool', sx * (ix - 2.25), Y + 0.2, z, sx < 0 ? Math.PI / 2 : -Math.PI / 2, { variant: 2, collide: false });
        if (j % 2 === 0) p.spot(`curia-senator-${sx < 0 ? 'w' : 'e'}${j}`, 'sit', sx * (ix - 1.35), Y + 0.4, z, sx < 0 ? Math.PI / 2 : -Math.PI / 2);
      }
    }
  }
  // marble veneer up to about two thirds of the walls, with three aediculae per side
  for (const sx of [-1, 1]) {
    di.span('marble_veined', sx * ix - (sx > 0 ? 0.02 : -0.02), Y, iz0, sx * ix, Y + 7.0, iz1);
    if (hi) {
      for (let k = 0; k < 3; k++) {
        const z = iz0 + 3.6 + k * 3.6;
        const x = sx * (ix - 0.25);
        di.box('marble', x, Y + 4.2, z, 0.5, 0.25, 1.5);
        di.box('black', sx * (ix - 0.03), Y + 5.4, z, 0.04, 2.2, 1.0);
        di.box('marble', x, Y + 6.6, z, 0.5, 0.3, 1.6);
        for (const dz of [-0.6, 0.6]) di.cyl('porphyry', x, Y + 5.4, z + dz, 0.08, 2.2, 8);
        togate(b, TRS(sx * (ix - 0.35), Y + 4.3, z, 0, sx < 0 ? -Math.PI / 2 : Math.PI / 2, 0), { material: 'marble', scale: 1.0, detail: 'low' });
      }
    }
  }
  for (const zz of [iz0, iz1]) di.span('marble_veined', -ix, Y, zz - (zz > 0 ? 0.02 : -0.02), ix, Y + 7.0, zz);
  // coffered ceiling
  di.span('wood_dark', -hw, Y + H - 0.6, -hl, hw, Y + H - 0.3, hl);
  if (hi) {
    for (let i = -4; i <= 4; i++) di.box('wood', i * (ix / 4.5), Y + H - 0.72, 0, 0.18, 0.24, 2 * iz1);
    for (let j = -8; j <= 8; j++) di.box('wood', 0, Y + H - 0.72, j * (iz1 / 8.5), 2 * ix, 0.24, 0.18);
  }
  // the presiding magistrates' tribunal
  const tz0 = iz1 - 2.4;
  for (let k = 0; k < 3; k++) d.span('marble', -3.0 + k * 0.0, Y, tz0 + k * 0.34, 3.0, Y + (k + 1) * 0.2, iz1, { collide: true });
  const yT = Y + 0.6;
  if (hi) {
    placeProp(di, 'stool', -0.8, yT, tz0 + 1.5, Math.PI, { variant: 2, collide: false });
    placeProp(di, 'stool', 0.8, yT, tz0 + 1.5, Math.PI, { variant: 2, collide: false });
  }
  // the presiding consul sits on the right-hand stool (the curule chair)
  // lamps at the foot of the stair
  for (const sx of [-1, 1]) lampAt(p, sx * (hw + 1.0), pz - steps * run - 0.8);
  p.spot('curia-consul', 'sit', 0.8, yT + 0.45, tz0 + 1.5, Math.PI);
  // the Statue of Victory on her globe, and before it the Altar of Victory with incense burning
  {
    const at = T(0, yT, iz1 - 0.6);
    const h = pedestal(b, at, 0.9, 0.9, 1.5, 'marble');
    d.ellipsoid('gilded_bronze', 0, yT + h + 0.32, iz1 - 0.6, 0.34, 0.34, 0.34);
    figure(b, T(0, yT + h + 0.6, iz1 - 0.6), hi, 'gilded_bronze', 1.15, (s) => drapedFemale(s, { right: 'wreath', left: 'palm', wings: true, plinth: false }));
    altar(d, 0, Y, tz0 - 1.0, { w: 1.0, h: 1.05, fire: true });
    addFire(p, 0, Y + 1.25, tz0 - 1.0, { intensity: 6, distance: 7, dayScale: 1, glow: 0.3 });
  }
  p.spot('curia-victory-altar', 'shrine', 0, Y, tz0 - 2.1, 0);
  p.spot('curia-julia', 'door', 0, Y, -hl - 1.4, 0);
  p.spot('curia-chalcidicum', 'npc', -3.5, Y, pz + 1.6, Math.PI);
}

// ---------------------------------------------------------------- Carcer Tullianum

function carcer(p: Part) {
  const { b, d, hi } = p;
  const wf = 12 * p.S;
  const wb = 9 * p.S;
  const dp = 11 * p.S;
  const H = 4.4;
  const hd = dp / 2;
  foundation(p, [[-wf / 2, -hd], [wf / 2, -hd], [wb / 2, hd], [-wb / 2, hd]], 0, 'peperino');
  // peperino block walls on a trapezoid
  const side = Math.hypot((wf - wb) / 2, dp);
  for (const sx of [-1, 1]) {
    const a = Math.atan2((-sx * (wf - wb)) / 2, dp);
    d.box('peperino', (sx * (wf + wb)) / 4 - sx * 0.35, H / 2, 0, 0.7, H, side, { ry: a });
  }
  wall(b, { height: H, thickness: 0.7, material: 'peperino' as MaterialId, courses: hi ? 0.55 : 0, detail: p.detail, collide: false, length: wb }, TRS(wb / 2, 0, hd - 0.35, 0, Math.PI, 0));
  d.solid(-wb / 2, 0, -hd, wb / 2, H, hd);
  // travertine front with the consuls' inscription and a barred door
  wall(b, { length: wf, height: H + 0.4, thickness: 0.7, material: 'travertine', courses: hi ? 0.6 : 0, detail: p.detail, openings: [{ kind: 'door', x: wf / 2 + 1.4, width: 1.1, height: 2.1, leaves: 'none', frame: true }], collide: false }, T(-wf / 2, 0, -hd + 0.35));
  d.solid(-wf / 2, 0, -hd, wf / 2, H + 0.4, -hd + 0.7);
  d.span('black', 0.9, 0, -hd + 0.6, 1.9, 2.1, -hd + 0.65);
  for (let i = 0; i < 5; i++) d.box('iron', 0.95 + i * 0.225, 1.05, -hd + 0.12, 0.04, 2.1, 0.04);
  for (const y of [0.4, 1.1, 1.8]) d.box('iron', 1.4, y, -hd + 0.12, 1.1, 0.05, 0.05);
  if (hi) inscription(b, T(0, H - 0.55, -hd - 0.035), text('carcer-tullianum'), wf * 0.9, 0.75, 'carved', { depth: 0.04, body: 'travertine', sizes: [0.9, 0.8] });
  b.box('travertine', wf + 0.3, 0.22, 0.9, T(0, H + 0.51, -hd + 0.35));
  // low tiled roof
  shedRoof(b, -wf / 2, wf / 2, hd + 0.3, -hd + 0.6, H + 0.4, H + 1.1, 'roof_tile', new THREE.Matrix4());
  lampAt(p, -wf / 2 - 0.2, -hd - 1.1);
  p.spot('carcer-door', 'door', 1.4, 0, -hd - 1.2, 0);
  p.spot('carcer-tullianum', 'inscription', -1.0, 0, -hd - 2.4, 0);
  p.spot('carcer-guard', 'npc', 2.9, 0, -hd - 0.8, Math.PI);
}

export const builders: LandmarkBuilder[] = [
  { handles: ['curia-julia'], build: (ctx) => landmark(ctx, curia, { near: 150 }) },
  { handles: ['carcer-tullianum'], build: (ctx) => landmark(ctx, carcer, { cull: 300 }) },
];
