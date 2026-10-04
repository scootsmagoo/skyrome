/**
 * The temples of the Forum and the Velia:
 *  - Saturn (Ionic hexastyle prostyle on a very high travertine podium, the state treasury's door
 *    in its flank, Plancus' dedication on the frieze);
 *  - Vespasian and Titus (Corinthian hexastyle squeezed against the Tabularium, the stair running
 *    up between the front columns, a frieze of sacrificial instruments);
 *  - Concord (the transverse cella with a projecting hexastyle porch, statues on the roof);
 *  - Divus Augustus (Ionic hexastyle with a quadriga on the apex, behind the Basilica Iulia);
 *  - Divus Iulius (Corinthian hexastyle on the speakers' platform with the Actian rams, the round
 *    altar in its niche on the spot of Caesar's pyre, the star of Julius in the pediment);
 *  - Castor and Pollux (Corinthian octastyle peripteral on a 7 m podium with a speakers' tribunal,
 *    lateral stairs and the barred strongrooms in the podium);
 *  - Jupiter Stator on the slope at the top of the Sacra Via.
 */
import * as THREE from 'three';
import { entablature, pediment } from '../../../arch/classical/entablature';
import { ORDER_PROPORTIONS, axialSpacing, columnDims, diameterForHeight } from '../../../arch/classical/orders';
import { podium } from '../../../arch/classical/podium';
import { templeLayout } from '../../../arch/classical/temple';
import { extrudePolygon, type V2 } from '../../../arch/common/geom';
import { stairs } from '../../../arch/common/stairs';
import { wall } from '../../../arch/common/walls';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder } from '../types';
import { FORUM_INSCRIPTIONS } from './forum-data';
import { drapedFemale, figure, nudeMale } from './forum-figures';
import { T, TRS, addFire, atlasToLocal, balustrade, col, foundation, inscription, landmark, mul, shipRam, type Part } from './forum-kit';
import { placeProp } from '../../../arch/props';
import { Draw } from '../../../arch/fabric/draw';
import { sacrificeFriezeMaterial } from './forum-reliefs';
import { forumTemple, gableRoof, type ForumTempleSpec } from './forum-temple';
import { lampstand } from './forum-life';
import { CREPIDO, court, lampAt, sidewalk } from './forum-street';

const text = (id: string) => FORUM_INSCRIPTIONS[id].latin;

/** Shift that centres the whole temple (stairs included) on the landmark origin. */
function centreShift(spec: ForumTempleSpec): number {
  const L = templeLayout(spec);
  const front = Math.min(L.podiumFront, ...L.flights.map((f) => f.z0));
  return -(front + L.stylobate.z1) / 2;
}

/** Steps from the terrain in front of a flight up to its foot (y = 0), when the ground falls away. */
function approach(p: Part, x: number, z: number, width: number) {
  const g = p.ctx.groundAt(x, z - 0.6);
  if (g > -0.12) return;
  const count = Math.ceil(-g / 0.2);
  const run = 0.33;
  stairs(p.b, { width, rise: -g / count, run, count, material: 'travertine', collider: p.main ? 'steps' : 'none' }, T(x, g, z - count * run));
}

/** A doorway in a podium face: travertine frame, dark opening and a bronze or iron grille (faces −z in `at`). */
function podiumDoor(p: Part, at: THREE.Matrix4, w = 1.2, h = 2.25, grille: MaterialId = 'iron') {
  const { b } = p;
  b.box('black', w, h, 0.04, mul(at, T(0, h / 2, -0.02)), { castShadow: false });
  b.box('travertine', 0.18, h + 0.1, 0.12, mul(at, T(-w / 2 - 0.09, (h + 0.1) / 2, -0.06)));
  b.box('travertine', 0.18, h + 0.1, 0.12, mul(at, T(w / 2 + 0.09, (h + 0.1) / 2, -0.06)));
  b.box('travertine', w + 0.56, 0.26, 0.16, mul(at, T(0, h + 0.13, -0.08)));
  b.box('travertine', w + 0.2, 0.06, 0.4, mul(at, T(0, 0.03, -0.2)));
  if (p.hi) {
    for (let i = 0; i <= 5; i++) b.box(grille, 0.035, h - 0.05, 0.035, mul(at, T(-w / 2 + (i * w) / 5, h / 2, -0.07)));
    for (const y of [0.35, h * 0.5, h - 0.3]) b.box(grille, w, 0.05, 0.04, mul(at, T(0, y, -0.07)));
  } else b.box(grille, w, h, 0.02, mul(at, T(0, h / 2, -0.05)), { castShadow: false });
}

/**
 * The open door of the deposit vaults in a podium flank (faces −z in `at`): a travertine frame, the
 * dark passage, the iron grille swung open against the wall, the carved plaque LOCVLI · DEPOSITORVM
 * above and an oil lamp on a bracket that burns day and night.
 */
function strongroomDoor(p: Part, at: THREE.Matrix4) {
  const { b } = p;
  const w = 1.3;
  const h = 2.35;
  b.box('black', w, h, 0.05, mul(at, T(0, h / 2, -0.02)), { castShadow: false });
  b.box('travertine', 0.22, h + 0.12, 0.16, mul(at, T(-w / 2 - 0.11, (h + 0.12) / 2, -0.08)));
  b.box('travertine', 0.22, h + 0.12, 0.16, mul(at, T(w / 2 + 0.11, (h + 0.12) / 2, -0.08)));
  b.box('travertine', w + 0.7, 0.3, 0.2, mul(at, T(0, h + 0.15, -0.1)));
  b.box('travertine', w + 0.3, 0.08, 0.5, mul(at, T(0, 0.04, -0.25)));
  // a worn threshold and the grille leaf standing open, hinged on the left jamb
  b.box('marble_veined', w, 0.03, 0.34, mul(at, T(0, 0.095, -0.2)), { castShadow: false });
  const leaf = mul(at, TRS(-w / 2, 0, -0.1, 0, 1.75, 0));
  if (p.hi) {
    for (let i = 0; i <= 5; i++) b.box('iron', 0.035, h - 0.08, 0.035, mul(leaf, T((i * w) / 5, h / 2, 0)));
    for (const y of [0.3, h * 0.5, h - 0.25]) b.box('iron', w, 0.05, 0.04, mul(leaf, T(w / 2, y, 0)));
  } else b.box('iron', w, h - 0.08, 0.03, mul(leaf, T(w / 2, h / 2, 0)));
  inscription(b, mul(at, T(0, h + 0.62, -0.03)), FORUM_INSCRIPTIONS['castor-loculi-plaque'].latin, 1.9, 0.42, 'carved', { depth: 0.04, body: 'marble' });
  // lamp on a bracket beside the door, and its glow inside the passage
  const lamp = new THREE.Vector3(w / 2 + 0.55, 2.0, -0.02).applyMatrix4(at);
  placeProp(new Draw(b, mul(at, T(w / 2 + 0.55, 1.75, -0.02))), 'torch_bracket', 0, 0, 0, 0, { collide: false });
  addFire(p, lamp.x, lamp.y, lamp.z, { intensity: 7, distance: 8, dayScale: 0.35, glow: 0.35 });
  const inner = new THREE.Vector3(0, 1.6, -0.3).applyMatrix4(at);
  addFire(p, inner.x, inner.y, inner.z, { intensity: 3, distance: 4, dayScale: 1, glow: 0.6, flicker: 0.25 });
}

/** A flat many-pointed star (the sidus Iulium), facing −z. */
function star(points: number, r0: number, r1: number, depth: number): THREE.BufferGeometry {
  const pts: V2[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2;
    const r = i % 2 ? r1 : r0;
    pts.push([Math.sin(a) * r, Math.cos(a) * r]);
  }
  return extrudePolygon(pts, depth);
}

// ---------------------------------------------------------------- Saturn

function saturn(p: Part) {
  const spec: ForumTempleSpec = {
    order: 'ionic',
    plan: 'prostyle',
    front: 6,
    sides: 7,
    width: 13.2,
    podiumHeight: 4.2,
    material: 'marble',
    podiumMaterial: 'travertine',
    cellaMaterial: 'plaster_white',
    frieze: text('temple-saturn'),
    crown: 'figures',
  };
  const zs = centreShift(spec);
  const at = T(0, 0, zs);
  const r = forumTemple(p, spec, at);
  const s = r.L.stylobate;
  foundation(p, [[s.x0, r.L.stairs.z0 + zs], [s.x1, r.L.stairs.z0 + zs], [s.x1, s.z1 + zs], [s.x0, s.z1 + zs]], 0);
  // the aerarium: the treasury's door in the flank facing the Forum
  const dz = s.z0 + zs + 3.2;
  podiumDoor(p, TRS(s.x1 + 0.005, 0, dz, 0, -Math.PI / 2, 0), 1.5, 2.5, 'bronze');
  if (p.hi) inscription(p.b, TRS(s.x1 + 0.02, 3.0, dz, 0, -Math.PI / 2, 0), ['Aerarium'], 1.6, 0.4, 'carved', { depth: 0.03 });
  for (const sx of [-1, 1]) lampAt(p, sx * (s.x1 + 1.0), r.L.stairs.z0 + zs - 1.2);
  p.spot('aerarium-door', 'door', s.x1 + 1.2, 0, dz, -Math.PI / 2);
  p.spot('aerarium-scribe', 'npc', s.x1 + 1.6, 0, dz + 2.0, Math.PI / 2);
  p.spot('temple-saturn', 'inscription', 0, 0, r.L.stairs.z0 + zs - 3.0, 0);
}

// ---------------------------------------------------------------- Vespasian and Titus

function vespasian(p: Part) {
  const spec: ForumTempleSpec = {
    order: 'corinthian',
    plan: 'prostyle',
    front: 6,
    sides: 6,
    width: 13.0,
    intercolumniation: 'pycnostyle',
    podiumHeight: 2.7,
    material: 'marble',
    podiumMaterial: 'travertine',
    frontTier: 'mid',
    entDetail: 'high',
    ownStairs: true,
    friezeMaterial: p.hi ? sacrificeFriezeMaterial() : undefined,
    crown: 'palmette',
  };
  const L = templeLayout(spec);
  const s = L.stylobate;
  const zf = -L.spanZ / 2;
  // the stair runs up between the front columns, which stand on piers rising from the steps
  const count = Math.round(L.podiumHeight / 0.2);
  const rise = L.podiumHeight / count;
  const run = 0.33;
  const top = zf + 1.1;
  const z0 = top - count * run;
  const sx0 = s.x0 + 0.55;
  const sx1 = s.x1 - 0.55;
  spec.podiumOutline = [
    [s.x0, z0],
    [sx0, z0],
    [sx0, top],
    [sx1, top],
    [sx1, z0],
    [s.x1, z0],
    [s.x1, s.z1],
    [s.x0, s.z1],
  ];
  spec.podiumColliders = [
    [s.x0, top, s.x1, s.z1],
    [s.x0, z0, sx0, top],
    [sx1, z0, s.x1, top],
  ];
  const zs = -(z0 + s.z1) / 2;
  const at = T(0, 0, zs);
  const r = forumTemple(p, spec, at);
  stairs(p.b, { width: sx1 - sx0, rise, run, count, material: 'travertine', collider: p.main ? 'steps' : 'none' }, mul(at, T(0, 0, z0)));
  const plinth = columnDims('corinthian', L.D, L.H).plinth + 0.08;
  for (let i = 0; i < 6; i++) {
    const x = -L.spanX / 2 + i * L.axial;
    p.b.box('marble', plinth, L.podiumHeight, plinth, mul(at, T(x, L.podiumHeight / 2, zf)), { collide: p.main });
  }
  foundation(p, (spec.podiumOutline as V2[]).map(([x, z]) => [x, z + zs] as V2), 0);
  // dedication on the architrave
  if (p.hi) inscription(p.b, mul(at, T(0, r.yE + r.architrave * 0.5, r.e.z0 - 0.03)), text('temple-vespasian-titus'), (r.e.x1 - r.e.x0) * 0.8, r.architrave * 0.7, 'bronze', { depth: 0.01, sizes: [1] });
  for (const sx of [-1, 1]) lampAt(p, sx * (s.x1 + 0.9), z0 + zs - 1.2);
  p.spot('temple-vespasian-titus', 'inscription', 0, 0, z0 + zs - 2.5, 0);
}

// ---------------------------------------------------------------- Concord

function concord(p: Part) {
  const { b, hi } = p;
  const S = p.S;
  const mat: MaterialId = 'marble';
  const P = 3.0;
  const W = 45 * S;
  // transverse cella at the back, hexastyle porch projecting from its long front
  const cz1 = 12.0;
  const cz0 = -1.4;
  const H = 8.4;
  const D = diameterForHeight('corinthian', H);
  const axial = axialSpacing(D, 'eustyle');
  const spanX = 5 * axial;
  const plinth = columnDims('corinthian', D, H).plinth;
  const px = spanX / 2 + plinth / 2 + 0.5;
  const pz0 = cz0 - 2 * axial - plinth / 2 - 0.5;
  const count = Math.round(P / 0.2);
  const run = 0.33;
  const sz0 = pz0 - count * run;
  podium(b, { outline: [[-W / 2, cz0], [W / 2, cz0], [W / 2, cz1], [-W / 2, cz1]], height: P, material: 'travertine', topMaterial: 'paving_travertine', detail: p.detail, colliders: [[-W / 2, cz0, W / 2, cz1]] });
  podium(b, { outline: [[-px, sz0], [-px + 0.7, sz0], [-px + 0.7, pz0], [px - 0.7, pz0], [px - 0.7, sz0], [px, sz0], [px, cz0 + 0.02], [-px, cz0 + 0.02]], height: P, material: 'travertine', topMaterial: 'paving_travertine', detail: p.detail, colliders: [[-px, pz0, px, cz0], [-px, sz0, -px + 0.7, pz0], [px - 0.7, sz0, px, pz0]] });
  stairs(b, { width: 2 * px - 1.4, rise: P / count, run, count, material: 'travertine', collider: p.main ? 'steps' : 'none' }, T(0, 0, sz0));
  // the polychrome threshold
  b.box('marble_giallo', 2.6, 0.05, 1.2, T(0, P + 0.025, cz0 - 0.6), { castShadow: false });
  b.box('porphyry', 1.6, 0.052, 0.5, T(0, P + 0.026, cz0 - 0.6), { castShadow: false });
  // porch columns: six across and one return each side
  const zc = pz0 + plinth / 2 + 0.5;
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 6; i++) {
      if (j === 1 && i > 0 && i < 5) continue;
      const x = -spanX / 2 + i * axial;
      const tier = !hi ? 'stub' : 'mid';
      col(b, { order: 'corinthian', D, H, tier, material: mat, collide: p.main }, T(x, P, zc + j * axial));
    }
  // cella walls with the door behind the porch
  const t = 1.0;
  const ent = ORDER_PROPORTIONS.corinthian.entablatureRatio * H;
  const wallH = H + ent * 0.55;
  const cw = W - 1.2;
  const x0 = -cw / 2;
  const wz0 = cz0 + 0.6;
  const wz1 = cz1 - 0.6;
  const cd = wz1 - wz0;
  const wo = { height: wallH, thickness: t, material: mat, courses: hi ? 0.55 : 0, detail: p.detail, collide: false } as const;
  wall(b, { ...wo, length: cw, openings: [{ kind: 'door', x: cw / 2, width: 2.6, height: 5.2, leafMaterial: 'bronze' }] }, T(x0, P, wz0 + t / 2));
  wall(b, { ...wo, length: cw }, TRS(-x0, P, wz1 - t / 2, 0, Math.PI, 0));
  wall(b, { ...wo, length: cd - 2 * t }, TRS(-x0 - t / 2, P, wz0 + t, 0, -Math.PI / 2, 0));
  wall(b, { ...wo, length: cd - 2 * t }, TRS(x0 + t / 2, P, wz1 - t, 0, Math.PI / 2, 0));
  if (p.main) p.d.solid(x0, P, wz0, -x0, P + wallH, wz1);
  // entablature round the cella, and round the porch
  const yE = P + H;
  const d = columnDims('corinthian', D, H).d;
  const cellaEnt = entablature(b, [new THREE.Vector3(x0 - 0.3, yE, wz0 - 0.3), new THREE.Vector3(-x0 + 0.3, yE, wz0 - 0.3), new THREE.Vector3(-x0 + 0.3, yE, wz1 + 0.3), new THREE.Vector3(x0 - 0.3, yE, wz1 + 0.3)], { order: 'corinthian', columnHeight: H, D, material: mat, detail: 'low' }, { closed: true });
  const ex = spanX / 2 + d / 2;
  const ez0 = zc - d / 2;
  const pe = entablature(b, [new THREE.Vector3(-ex, yE, wz0 - 0.2), new THREE.Vector3(-ex, yE, ez0), new THREE.Vector3(ex, yE, ez0), new THREE.Vector3(ex, yE, wz0 - 0.2)], { order: 'corinthian', columnHeight: H, D, material: mat, detail: p.detail, axial }, { closed: false, caps: false });
  const yTop = yE + pe.dims.total;
  b.box('marble', 2 * ex - 0.2, 0.25, wz0 - ez0, T(0, yE + pe.dims.architrave + pe.dims.frieze - 0.1, (ez0 + wz0) / 2), { castShadow: false });
  if (hi) inscription(b, T(0, yE + pe.dims.architrave + pe.dims.frieze / 2, ez0 - pe.friezeX - 0.012), text('temple-concord'), 2 * ex * 0.7, pe.dims.frieze * 0.8, 'bronze', { depth: 0.01, sizes: [1] });
  // porch pediment and roof; the cella's own roof with its ridge across the temple
  const pitch = (14 * Math.PI) / 180;
  const pf = pediment(b, { order: 'corinthian', span: 2 * ex, cornice: pe.dims.cornice, depth: 0.9 * D, friezeX: pe.friezeX, material: mat, detail: p.detail, D, relief: hi }, T(0, yTop, ez0));
  gableRoof(b, -ex - pe.projection, ex + pe.projection, ez0 + 0.3, wz0 + 1.0, yTop - 0.05, pitch, 'roof_tile', hi, new THREE.Matrix4());
  const cTop = yE + cellaEnt.dims.total;
  const cmid = (wz0 + wz1) / 2;
  const hd = (wz1 - wz0) / 2 + 0.3 + cellaEnt.projection;
  gableRoof(b, -hd, hd, x0 - 0.3 + 0.4 * D, -x0 + 0.3 - 0.4 * D, cTop - 0.05, pitch, 'roof_tile', hi, TRS(0, 0, cmid, 0, Math.PI / 2, 0));
  for (const sx of [-1, 1]) {
    pediment(b, { order: 'corinthian', span: wz1 - wz0 + 0.6, cornice: cellaEnt.dims.cornice, depth: 0.9 * D, friezeX: cellaEnt.friezeX, material: mat, detail: 'low', D }, TRS(sx * (-x0 + 0.3), cTop, cmid, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0));
  }
  // statues on the porch roof: a central group and Victories at the corners
  if (hi) figure(b, T(0, yTop + pf.apex - 0.1, ez0 + 0.5), false, 'gilded_bronze', 1.3, (s) => drapedFemale(s, { right: 'patera', left: 'sceptre', head: { crown: 'diadem' } }));
  for (const sx of hi ? [-1, 1] : []) figure(b, T(sx * (ex - 0.4), yTop + 0.05, ez0 + 0.4), false, 'gilded_bronze', 1.1, (s) => drapedFemale(s, { right: 'wreath', left: 'palm', wings: true, stride: true }));
  for (const sx of hi ? [-1, 1] : []) figure(b, T(sx * (W / 2 - 1.0), cTop + 0.05, wz0 + 0.2), false, 'gilded_bronze', 1.1, (s) => nudeMale(s, { right: 'spear', left: 'down', cloak: true }));
  foundation(p, [[-W / 2, sz0], [W / 2, sz0], [W / 2, cz1], [-W / 2, cz1]], 0);
  for (const sx of [-1, 1]) lampAt(p, sx * (px + 1.2), sz0 - 1.2);
  p.spot('temple-concord', 'inscription', 0, 0, sz0 - 2.5, 0);
}

// ---------------------------------------------------------------- Divus Augustus

function divusAugustus(p: Part) {
  const spec: ForumTempleSpec = {
    order: 'ionic',
    plan: 'prostyle',
    front: 6,
    sides: 8,
    width: 14.4,
    podiumHeight: 3.0,
    material: 'marble',
    podiumMaterial: 'travertine',
    frontTier: 'mid',
    frieze: text('temple-divus-augustus'),
    crown: 'quadriga',
  };
  const zs = centreShift(spec);
  const r = forumTemple(p, spec, T(0, 0, zs));
  const s = r.L.stylobate;
  foundation(p, [[s.x0, r.L.stairs.z0 + zs], [s.x1, r.L.stairs.z0 + zs], [s.x1, s.z1 + zs], [s.x0, s.z1 + zs]], 0);
  // The precinct: a travertine court before the stair (the plaza's own paving stops at its corner),
  // lamps either side of the stair, and the walk along the Vicus Tuscus beside the temple.
  const zf = r.L.stairs.z0 + zs;
  court(p, [[-13, zf - 15], [13, zf - 15], [13, zf + 0.3], [-13, zf + 0.3]]);
  sidewalk(p, 'vicus-tuscus', -1, [62, 133], [8, 218], 3.4);
  if (p.hi) {
    for (const [x, z] of [[-6.5, zf - 3], [6.5, zf - 3], [-6.5, zf - 12], [6.5, zf - 12]] as const) lampstand(p, new THREE.Vector3(x, p.ctx.groundAt(x, z) + CREPIDO, z));
  }
  p.spot('temple-divus-augustus', 'inscription', 0, 0, zf - 2.5, 0);
  p.spot('bibliotheca-divi-augusti', 'door', s.x1 + 1.5, 0, s.z1 + zs - 4, -Math.PI / 2);
  p.spot('divus-augustus-priest', 'npc', 4.5, 0.06, zf - 4.5, 0);
  p.spot('divus-augustus-petitioner', 'npc', -3.5, 0.06, zf - 8, Math.PI);
}

// ---------------------------------------------------------------- Divus Iulius

function divusIulius(p: Part) {
  const { b, d, hi } = p;
  const spec: ForumTempleSpec = {
    order: 'corinthian',
    plan: 'prostyle',
    front: 6,
    sides: 6,
    width: 13.0,
    intercolumniation: 'pycnostyle',
    columnHeight: 7.0,
    podiumHeight: 3.0,
    stairs: 'sides',
    material: 'marble',
    podiumMaterial: 'travertine',
    frontTier: 'mid',
    frieze: text('temple-divus-julius'),
    crown: 'palmette',
  };
  const L = templeLayout(spec);
  const s = L.stylobate;
  // the speakers' platform in front, with the semicircular niche of the altar in the middle
  const front = L.podiumFront - 1.2;
  const nr = 1.7;
  const outline: V2[] = [[s.x0, front], [-nr, front]];
  for (let i = 1; i < 12; i++) {
    const a = Math.PI - (Math.PI * i) / 12;
    outline.push([Math.cos(a) * nr, front + Math.sin(a) * nr]);
  }
  outline.push([nr, front], [s.x1, front], [s.x1, s.z1], [s.x0, s.z1]);
  spec.podiumOutline = outline;
  spec.podiumColliders = [
    [s.x0, front + nr, s.x1, s.z1],
    [s.x0, front, -nr, front + nr],
    [nr, front, s.x1, front + nr],
  ];
  spec.ownStairs = true;
  const zs = -(front + s.z1) / 2;
  const at = T(0, 0, zs);
  forumTemple(p, spec, at);
  for (const f of L.flights) stairs(b, { width: f.x1 - f.x0, rise: f.rise, run: f.run, count: f.count, material: 'travertine', collider: p.main ? 'steps' : 'none' }, mul(at, T((f.x0 + f.x1) / 2, 0, front)));
  // the Actian rams on the platform front, either side of the niche
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const x = sx * (nr + 0.9 + i * ((s.x1 - nr - 1.4) / 3));
      shipRam(b, mul(at, T(x, 1.45, front - 0.02)), 1.0);
    }
  }
  // the round altar on the spot of the pyre, with flowers and offerings
  const az = front + nr * 0.55;
  d.at(0, 0, zs).cyl('travertine', 0, 0.55, az, 0.75, 1.1, hi ? 24 : 10, { collide: true });
  d.at(0, 0, zs).cyl('marble', 0, 1.14, az, 0.82, 0.08, hi ? 24 : 10);
  if (hi) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      d.at(0, 0, zs).ellipsoid(i % 3 ? 'fabric_red' : 'fabric_ochre', Math.sin(a) * 0.5, 1.22, az + Math.cos(a) * 0.5, 0.12, 0.06, 0.12);
    }
  }
  // the star of the deified Julius in the pediment
  const r = templeLayout(spec);
  const ent = ORDER_PROPORTIONS.corinthian.entablatureRatio * r.H;
  const yTop = r.podiumHeight + r.H + ent;
  const span = r.entablature.x1 - r.entablature.x0;
  const rise = (span / 2) * Math.tan((14 * Math.PI) / 180);
  b.add(star(8, 0.7, 0.25, 0.08), 'gilded_bronze', mul(at, T(0, yTop + rise * 0.42, r.entablature.z0 + 0.25)));
  foundation(p, [[s.x0, front + zs], [s.x1, front + zs], [s.x1, s.z1 + zs], [s.x0, s.z1 + zs]], 0);
  p.spot('divus-iulius-altar', 'shrine', 0, 0, front + zs - 1.4, 0);
  p.spot('rostra-divi-iulii', 'npc', 3.5, L.podiumHeight, front + zs + 1.0, Math.PI);
  p.spot('temple-divus-julius', 'inscription', -4, 0, front + zs - 3, 0);
}

// ---------------------------------------------------------------- Castor and Pollux

function castor(p: Part) {
  const spec: ForumTempleSpec = {
    order: 'corinthian',
    plan: 'peripteral',
    front: 8,
    sides: 11,
    D: 0.82,
    columnHeight: 8.88,
    podiumHeight: 4.2,
    stairs: 'sides',
    material: 'marble',
    podiumMaterial: 'travertine',
    frieze: text('temple-castor-pollux'),
    crown: 'figures',
    frontCount: 4,
  };
  const zs = centreShift(spec);
  const at0 = T(0, 0, zs);
  const r = forumTemple(p, spec, at0);
  const L = r.L;
  const s = L.stylobate;
  // marble pilasters articulating the travertine front of the tribunal
  if (p.hi) {
    const zf = L.podiumFront + zs;
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const x = s.x0 + 0.5 + (i * (s.x1 - s.x0 - 1.0)) / n;
      p.d.box('marble', x, L.podiumHeight / 2, zf - 0.06, 0.55, L.podiumHeight - 1.1, 0.14);
    }
    p.d.box('marble', 0, L.podiumHeight - 0.62, zf - 0.08, s.x1 - s.x0 - 0.4, 0.22, 0.18);
  }
  // marble balustrade along the front of the speakers' tribunal
  balustrade(p.d, s.x0 + 0.3, L.podiumFront + zs + 0.25, s.x1 - 0.3, L.podiumFront + zs + 0.25, { y: L.podiumHeight, h: 1.0 });
  // Strongrooms and offices in the podium: barred doors along both flanks behind the flights. The
  // deposit vaults (loculi) open on the W flank toward the Vicus Tuscus (CONTENT.md castor-loculi,
  // real 88, 98): that door stands open, lamp-lit, under its plaque, since the vaults are the
  // bankers' and not the god's and stay open on the Lemuria.
  const zStart = L.podiumFront + L.flights[0].count * L.flights[0].run + 1.6;
  const n = 4;
  const step = (s.z1 - 1.2 - zStart) / (n - 1);
  const [, lzLoc] = atlasToLocal(p.ctx, 88, 98);
  let loc = 0;
  for (let i = 1; i < n; i++) if (Math.abs(zStart + i * step + zs - lzLoc) < Math.abs(zStart + loc * step + zs - lzLoc)) loc = i;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const z = zStart + i * step;
      const x = sx < 0 ? s.x0 - 0.005 : s.x1 + 0.005;
      const at = mul(at0, TRS(x, 0, z, 0, sx < 0 ? Math.PI / 2 : -Math.PI / 2, 0));
      if (sx < 0 && i === loc) {
        strongroomDoor(p, at);
        p.spot('castor-strongroom', 'door', x - 1.2, 0, z + zs, Math.PI / 2);
        p.spot('castor-loculi-plaque', 'inscription', x - 2.4, 0, z + zs + 0.6, Math.PI / 2);
        p.spot('castor-chrysippus', 'npc', x - 0.9, 0, z + zs + 1.5, -Math.PI / 2);
        continue;
      }
      podiumDoor(p, at, 1.2, 2.2, 'iron');
      if (sx > 0 && i === 0) p.spot('castor-weights-office', 'door', x + 1.2, 0, z + zs, -Math.PI / 2);
    }
  }
  // The cella doors are shut for the Lemuria: the aedituus has hung a black wool fillet across them.
  {
    const cl = L.cella;
    const dw = Math.min((cl.x1 - cl.x0) * 0.42, L.H * 0.36);
    const dh = Math.min(L.H * 0.72, dw * 2.1);
    const zf = cl.z0 + zs - 0.06;
    const wool = 'black' as const;
    const y = L.podiumHeight + dh * 0.45;
    const sag = 0.35;
    const pts = [-1, -0.5, 0, 0.5, 1].map((t) => new THREE.Vector3((t * (dw + 0.5)) / 2, y - sag * (1 - t * t), zf));
    for (let i = 0; i < pts.length - 1; i++) p.d.rod(wool, pts[i], pts[i + 1], 0.05, 5);
    for (const t of [-1, 1]) p.d.rod(wool, pts[t < 0 ? 0 : 4], new THREE.Vector3(pts[t < 0 ? 0 : 4].x, y - 0.8, zf - 0.02), 0.035, 4);
    p.spot('castor-aedituus', 'npc', 0.9, L.podiumHeight, cl.z0 + zs - 1.4, Math.PI);
  }
  // Fortunata's tray of honey cakes at the foot of the W flight (CONTENT.md vig-libaria).
  {
    const f = L.flights[0];
    const x = (f.x0 + f.x1) / 2 - 0.4;
    const z = f.z0 + zs - 1.6;
    if (p.hi) {
      placeProp(p.d, 'table', x, 0, z, 0.2, { variant: 1, collide: true });
      placeProp(p.d, 'basket', x - 0.25, 0.78, z, 0, { variant: 0, collide: false, scale: 0.8 });
      placeProp(p.d, 'basket', x + 0.85, 0, z + 0.2, 0.4, { variant: 2, collide: false });
      for (let k = 0; k < 6; k++) p.d.cyl('terracotta', x + 0.05 + (k % 3) * 0.16, 0.8, z - 0.1 + Math.floor(k / 3) * 0.16, 0.06, 0.04, 8);
    }
    p.spot('castor-libaria', 'vendor', x, 0, z + 0.7, Math.PI);
  }
  foundation(p, [[s.x0, L.podiumFront + zs], [s.x1, L.podiumFront + zs], [s.x1, s.z1 + zs], [s.x0, s.z1 + zs]], 0);
  p.spot('castor-tribunal', 'npc', 0, L.podiumHeight, L.podiumFront + zs + 1.2, Math.PI);
  p.spot('castor-tribunal-vista', 'vista', 2.5, L.podiumHeight, L.podiumFront + zs + 1.0, Math.PI);
  p.spot('temple-castor-pollux', 'inscription', 0, 0, L.podiumFront + zs - 3, 0);
}

// ---------------------------------------------------------------- Jupiter Stator

function jupiterStator(p: Part) {
  const spec: ForumTempleSpec = {
    order: 'ionic',
    plan: 'prostyle',
    front: 6,
    sides: 8,
    width: 11.0,
    columnHeight: 5.4,
    podiumHeight: 1.8,
    material: 'marble',
    podiumMaterial: 'tufa',
    stairMaterial: 'travertine',
    cellaMaterial: 'plaster_white',
    frontTier: 'mid',
    tier: 'low',
    crown: 'palmette',
  };
  const zs = centreShift(spec);
  const r = forumTemple(p, spec, T(0, 0, zs));
  const s = r.L.stylobate;
  const st = r.L.stairs;
  const out: V2[] = [[s.x0, st.z0 + zs], [s.x1, st.z0 + zs], [s.x1, s.z1 + zs], [s.x0, s.z1 + zs]];
  foundation(p, out, 0, 'tufa');
  approach(p, 0, st.z0 + zs, st.x1 - st.x0);
  p.spot('temple-jupiter-stator', 'shrine', 0, 0, st.z0 + zs - 1.5, 0);
}

// ---------------------------------------------------------------- builders

export const builders: LandmarkBuilder[] = [
  { handles: ['temple-saturn'], build: (ctx) => landmark(ctx, saturn, { near: 150 }) },
  { handles: ['temple-vespasian-titus'], build: (ctx) => landmark(ctx, vespasian, { near: 120 }) },
  { handles: ['temple-concord'], build: (ctx) => landmark(ctx, concord, { near: 130 }) },
  { handles: ['temple-divus-augustus'], build: (ctx) => landmark(ctx, divusAugustus, { near: 110 }) },
  { handles: ['temple-divus-julius'], build: (ctx) => landmark(ctx, divusIulius, { near: 120 }) },
  { handles: ['temple-castor-pollux'], build: (ctx) => landmark(ctx, castor, { near: 150 }) },
  { handles: ['temple-jupiter-stator'], build: (ctx) => landmark(ctx, jupiterStator, { near: 100 }) },
];
