/**
 * Everyday life on the paved Forum (built by the miliarium-aureum builder, whose local frame is the
 * atlas frame × 0.6): the things a visitor walking in from the Vicus Tuscus at dawn bumps into
 * between the monuments.
 *
 *  - the bronze Vortumnus at the Forum end of the Vicus Tuscus (CONTENT.md signum-vortumni);
 *  - the whitewashed board of the Acta Diurna by the Comitium, announcing tomorrow's dedication;
 *  - the litter stand by the Lacus Curtius (lectica-statio-forum), the drain grate of the Cloaca by
 *    the Basilica Paulli (cloaca-grate-aemiliae), the post of the Urban Cohorts beside the Carcer
 *    (statio-cohortium-urbanarum);
 *  - a garland seller before the Temple of Divus Iulius, a bookseller at the mouth of the
 *    Argiletum, a scribe for hire below the Basilica Iulia;
 *  - lamps lit at dusk, and spots where the NPC module can put idlers, talkers and criers.
 *
 * Positions are atlas real metres; `bearing` is the compass direction a thing faces.
 */
import * as THREE from 'three';
import { stripedAwning, placeProp } from '../../../arch/props';
import { paintedSign } from '../../../arch/common/inscription';
import type { MaterialId } from '../../../gfx/materialIds';
import { FORUM_INSCRIPTIONS, type P2 } from './forum-data';
import { togate } from '../../../arch/classical/statues';
import { column } from '../../../arch/classical/column';
import { stairs } from '../../../arch/common/stairs';
import { T, TRS, addFire, atlasToLocal, mul, pedestal, type Part } from './forum-kit';

/** Local rotation (TRS / placeProp, model −z forward) for a world bearing. */
export function bearingRot(p: Part, bearing: number): number {
  return -((bearing - p.ctx.lm.rotation) * Math.PI) / 180;
}

/** Local spot heading (model +Z forward convention) for a world bearing. */
export function bearingHeading(p: Part, bearing: number): number {
  return Math.PI - ((bearing - p.ctx.lm.rotation) * Math.PI) / 180;
}

/** Local position of an atlas point on the paving (y = terrain + paving lift). */
function onPaving(p: Part, at: P2, lift = 0.06): THREE.Vector3 {
  const [x, z] = atlasToLocal(p.ctx, at[0], at[1]);
  return new THREE.Vector3(x, p.ctx.groundAt(x, z) + lift, z);
}

/** Offset `d` metres from a local point along a world bearing. */
function ahead(p: Part, v: THREE.Vector3, bearing: number, d: number): THREE.Vector3 {
  const r = bearingRot(p, bearing);
  return new THREE.Vector3(v.x - Math.sin(r) * d, v.y, v.z - Math.cos(r) * d);
}

/** A bronze lampstand with its lamp lit from dusk to dawn. */
export function lampstand(p: Part, v: THREE.Vector3) {
  if (!p.hi) return;
  placeProp(p.d, 'lampstand', v.x, v.y, v.z, 0, { collide: true });
  addFire(p, v.x, v.y + 1.45, v.z, { night: true, intensity: 6, distance: 8, glow: 0.3 });
}

// ---------------------------------------------------------------- pieces

function vortumnus(p: Part) {
  const v = onPaving(p, [93.5, 62.2]);
  const rot = bearingRot(p, 300);
  const at = TRS(v.x, v.y, v.z, 0, rot, 0);
  const h = pedestal(p.b, at, 0.85, 0.75, 1.15, 'travertine');
  // the god of the turning year and of exchange, a draped bronze youth (the kit's draped statue)
  togate(p.b, mul(at, T(0, h, 0)), { material: 'bronze', scale: 1.05, detail: p.hi ? 'high' : 'low' });
  if (p.hi) {
    // a garland of fresh flowers hung on the base, as the shopkeepers of the street do
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const x = -0.42 + 0.84 * t;
      const y = h - 0.25 - Math.sin(t * Math.PI) * 0.22;
      p.b.box(i % 2 ? 'fabric_red' : 'fabric_ochre', 0.12, 0.1, 0.08, mul(at, T(x, y, -0.42)), { castShadow: false });
    }
  }
  const s = ahead(p, v, 300, 1.5);
  p.spot('signum-vortumni', 'shrine', s.x, v.y, s.z, bearingHeading(p, 120));
  const lamp = ahead(p, v, 210, 1.1);
  lampstand(p, lamp);
}

function actaDiurna(p: Part) {
  const v = onPaving(p, [37, -27]);
  const B = 206;
  const at = TRS(v.x, v.y, v.z, 0, bearingRot(p, B), 0);
  const w = 2.6;
  const h = 1.5;
  const y0 = 0.85;
  // two posts, a whitewashed board under a little gable of planks
  for (const sx of [-1, 1]) p.b.box('wood_dark', 0.14, y0 + h + 0.35, 0.14, mul(at, T(sx * (w / 2 + 0.05), (y0 + h + 0.35) / 2, 0.06)), { collide: p.main });
  p.b.box('wood_dark', w + 0.5, 0.08, 0.5, mul(at, TRS(0, y0 + h + 0.38, 0.05, 0.12, 0, 0)));
  p.b.box('wood', w + 0.14, h + 0.14, 0.05, mul(at, T(0, y0 + h / 2, 0.06)));
  if (p.hi) {
    const t = FORUM_INSCRIPTIONS['acta-diurna'].latin;
    paintedSign(p.b, t, w, h, mul(at, T(0, y0 + h / 2, 0.02)), { ink: '#1f1d1b' });
  }
  const s = ahead(p, v, B, 1.6);
  p.spot('acta-diurna', 'inscription', s.x, v.y, s.z, bearingHeading(p, B + 180));
  p.spot('acta-diurna-reader', 'npc', s.x + 1.2, v.y, s.z, bearingHeading(p, B + 180));
}

function litterStand(p: Part) {
  const B = 116;
  const a = onPaving(p, [65.5, 34]);
  const c = onPaving(p, [69, 36]);
  if (p.hi) {
    placeProp(p.d, 'litter', a.x, a.y, a.z, bearingRot(p, B), { variant: 0, collide: true });
    placeProp(p.d, 'litter', c.x, c.y, c.z, bearingRot(p, B), { variant: 2, collide: true });
  }
  const bench = onPaving(p, [64.5, 39]);
  placeProp(p.d, 'bench_masonry', bench.x, bench.y, bench.z, bearingRot(p, 26), { variant: 0, collide: p.main });
  p.spot('lectica-statio-forum', 'npc', (a.x + c.x) / 2, a.y, (a.z + c.z) / 2 - 1.2, bearingHeading(p, B));
  p.spot('lectica-bearers', 'sit', bench.x, bench.y + 0.45, bench.z - 0.3, bearingHeading(p, 26));
}

function cloacaGrate(p: Part) {
  const v = onPaving(p, [118, 22], 0.0);
  const at = TRS(v.x, v.y, v.z, 0, bearingRot(p, 213), 0);
  p.b.box('travertine', 1.6, 0.14, 1.25, mul(at, T(0, 0.05, 0)), { castShadow: false });
  p.b.box('black', 1.15, 0.02, 0.85, mul(at, T(0, 0.125, 0)), { castShadow: false });
  if (p.hi) for (let i = 0; i < 7; i++) p.b.box('iron', 0.045, 0.04, 0.88, mul(at, T(-0.48 + i * 0.16, 0.14, 0)), { castShadow: false });
  p.b.box('iron', 1.18, 0.04, 0.05, mul(at, T(0, 0.14, -0.3)), { castShadow: false });
  p.b.box('iron', 1.18, 0.04, 0.05, mul(at, T(0, 0.14, 0.3)), { castShadow: false });
  p.spot('cloaca-grate-aemiliae', 'door', v.x, v.y + 0.12, v.z + 0.9, 0);
}

/** A market stall under a striped awning on four poles, in a Draw frame facing −z. */
function awningStall(p: Part, f: ReturnType<Part['d']['at']>, kind: 'stall_cloth' | 'stall_fruit' | 'stall_pottery', mats: [MaterialId, MaterialId]) {
  if (!p.hi) {
    f.box('wood', 0, 0.45, 0, 2.0, 0.9, 0.9);
    f.box(mats[1], 0, 2.25, -0.25, 2.8, 0.1, 2.1);
    return;
  }
  placeProp(f, kind, 0, 0, 0, 0, { variant: 1, collide: true });
  stripedAwning(f, -1.4, 1.4, -1.3, 0.8, 2.05, 2.45, mats);
  for (const sx of [-1, 1]) {
    f.cyl('wood', sx * 1.35, 1.025, -1.25, 0.035, 2.05, 5, { collide: true });
    f.cyl('wood', sx * 1.35, 1.225, 0.75, 0.035, 2.45, 5, { collide: true });
  }
}

function garlandSeller(p: Part) {
  const v = onPaving(p, [110, 51]);
  const B = 121;
  const f = p.d.at(v.x, v.y, v.z, bearingRot(p, B));
  awningStall(p, f, 'stall_cloth', ['fabric_white', 'fabric_red']);
  if (p.hi) {
    // baskets of roses and violets, garlands hung from the awning poles
    for (const [x, c] of [
      [-0.9, 'fabric_red'],
      [0.9, 'fabric_purple'],
    ] as const) {
      placeProp(f, 'basket', x, 0, -1.0, 0.3, { variant: 1, collide: false });
      f.ellipsoid(c, x, 0.36, -1.0, 0.2, 0.08, 0.2, { seg: [8, 4] });
    }
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      f.ellipsoid(i % 2 ? 'fabric_red' : 'foliage_broad', -1.3 + 2.6 * t, 1.95 - Math.sin(t * Math.PI) * 0.35, -1.27, 0.1, 0.08, 0.08, { seg: [6, 4], shadow: false });
    }
  }
  const s = ahead(p, v, B + 180, 0.9);
  p.spot('coronarius', 'vendor', s.x, v.y, s.z, bearingHeading(p, B));
  p.spot('coronarius-stall', 'stall', v.x, v.y, v.z, bearingHeading(p, B));
}

function bookseller(p: Part) {
  const v = onPaving(p, [79, -15]);
  const B = 210;
  const f = p.d.at(v.x, v.y, v.z, bearingRot(p, B));
  // a trestle table of rolls and a rack of pigeon-holes with the stock, under an awning
  placeProp(f, 'table', 0, 0, 0, 0, { variant: 0, collide: p.main });
  placeProp(f, 'shelf', 0, 0, 0.95, Math.PI, { variant: 1, collide: p.main });
  if (p.hi) {
    stripedAwning(f, -1.3, 1.3, -1.0, 1.1, 2.1, 2.5, ['fabric_white', 'fabric_ochre']);
    for (const sx of [-1, 1]) {
      f.cyl('wood', sx * 1.25, 1.05, -0.95, 0.035, 2.1, 5, { collide: true });
      f.cyl('wood', sx * 1.25, 1.25, 1.05, 0.035, 2.5, 5, { collide: true });
    }
    for (let i = 0; i < 9; i++) {
      const x = -0.5 + (i % 5) * 0.24;
      const z = -0.12 + Math.floor(i / 5) * 0.2;
      f.cyl(i % 3 ? 'fabric_white' : 'plaster_cream', x, 0.82, z, 0.035, 0.32, 6, { rz: Math.PI / 2 });
      f.cyl('wood_dark', x - 0.17, 0.82, z, 0.012, 0.05, 5, { rz: Math.PI / 2 });
    }
    // a cylindrical book box (capsa) on the ground
    f.cyl('wood_painted', 0.9, 0.22, -0.4, 0.2, 0.44, 10);
    // the title list painted on a board
    paintedSign(p.b, ['Libri Venales', 'Martialis Plinius'], 0.9, 0.42, mul(TRS(v.x, v.y, v.z, 0, bearingRot(p, B), 0), T(-0.9, 1.25, -0.42)), { ink: '#9A3A24' });
  }
  const s = ahead(p, v, B + 180, 0.9);
  p.spot('librarius', 'vendor', s.x, v.y, s.z, bearingHeading(p, B));
  p.spot('librarius-reader', 'npc', ahead(p, v, B, 1.4).x, v.y, ahead(p, v, B, 1.4).z, bearingHeading(p, B + 180));
}

function scribe(p: Part) {
  const v = onPaving(p, [31, 30]);
  const B = 26;
  const f = p.d.at(v.x, v.y, v.z, bearingRot(p, B));
  placeProp(f, 'table', 0, 0, 0, 0, { variant: 2, collide: p.main });
  placeProp(f, 'stool', 0, 0, 0.7, 0, { variant: 2, collide: false });
  placeProp(f, 'stool', 0, 0, -0.75, Math.PI, { variant: 0, collide: false });
  if (p.hi) {
    // wax tablets, an inkpot and a pen
    f.box('wood_dark', -0.25, 0.79, 0, 0.3, 0.02, 0.22).box('wood_dark', 0.15, 0.79, 0.05, 0.3, 0.02, 0.22);
    f.cyl('bronze', 0.4, 0.82, -0.1, 0.035, 0.07, 8);
    // a parasol pole against the morning sun
    f.cyl('wood', 0.62, 1.1, 0.45, 0.025, 2.2, 5);
    f.cyl('fabric_ochre', 0.62, 2.18, 0.45, 0.85, 0.06, 10, { rTop: 0.05 });
  }
  p.spot('scriba', 'vendor', ahead(p, v, B + 180, 0.7).x, v.y, ahead(p, v, B + 180, 0.7).z, bearingHeading(p, B));
  p.spot('scriba-client', 'sit', ahead(p, v, B, 0.75).x, v.y + 0.45, ahead(p, v, B, 0.75).z, bearingHeading(p, B + 180));
}

function urbanCohortPost(p: Part) {
  const v = onPaving(p, [31, -64]);
  const B = 200;
  const rot = bearingRot(p, B);
  const f = p.d.at(v.x, v.y, v.z, rot);
  const w = 4.2;
  const dp = 3.2;
  const h = 3.2;
  // a small brick guardroom with a tiled lean-to roof, an open door and a bench in front
  f.span('brick', -w / 2, -0.4, 0, -0.55, h, 0.35, { collide: p.main });
  f.span('brick', 0.55, -0.4, 0, w / 2, h, 0.35, { collide: p.main });
  f.span('brick', -w / 2, 2.4, 0, w / 2, h, 0.35);
  f.span('brick', -w / 2, -0.4, dp - 0.35, w / 2, h + 0.5, dp, { collide: p.main });
  f.span('brick', -w / 2, -0.4, 0, -w / 2 + 0.35, h + 0.5, dp, { collide: p.main });
  f.span('brick', w / 2 - 0.35, -0.4, 0, w / 2, h + 0.5, dp, { collide: p.main });
  f.span('black', -0.55, 0, 0.3, 0.55, 2.4, 0.33, { shadow: false });
  f.span('roof_tile', -w / 2 - 0.25, h + 0.05, -0.3, w / 2 + 0.25, h + 0.2, dp + 0.2, { rx: -0.14 });
  f.span('travertine', -0.65, 2.4, -0.06, 0.65, 2.55, 0.4);
  placeProp(f, 'bench', 1.5, 0, -0.55, 0, { variant: 0, collide: p.main });
  if (p.hi) {
    paintedSign(p.b, ['Statio', 'Cohortium Urbanarum'], 1.5, 0.5, mul(TRS(v.x, v.y, v.z, 0, rot, 0), T(-1.35, 2.75, -0.01)), { ink: '#A3271F' });
    // spears racked against the wall and a shield
    for (let i = 0; i < 4; i++) f.rod('wood_dark', { x: -1.75 + i * 0.16, y: 0, z: -0.25 }, { x: -1.6 + i * 0.16, y: 2.35, z: -0.04 }, 0.02, 4);
    for (let i = 0; i < 4; i++) f.cyl('iron', -1.6 + i * 0.16, 2.45, -0.04, 0.03, 0.2, 4, { rTop: 0.004 });
    f.box('wood_painted', -1.0, 0.65, -0.12, 0.62, 1.05, 0.06, { rx: -0.08 });
    placeProp(f, 'brazier', 2.6, 0, -1.4, 0, { collide: true });
  }
  const br = new THREE.Vector3(2.6, 0, -1.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot).add(v);
  addFire(p, br.x, br.y + 0.85, br.z, { night: true, intensity: 9, distance: 10, glow: 0.45 });
  p.spot('statio-cohortium-urbanarum', 'door', ahead(p, v, B, 1.2).x, v.y, ahead(p, v, B, 1.2).z, bearingHeading(p, B + 180));
  const g = new THREE.Vector3(-0.9, 0, -0.8).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot).add(v);
  p.spot('statio-guard', 'npc', g.x, v.y, g.z, bearingHeading(p, B));
  const bs = new THREE.Vector3(1.5, 0.45, -0.75).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot).add(v);
  p.spot('statio-bench', 'sit', bs.x, bs.y, bs.z, bearingHeading(p, B));
}

/** The Columna Maenia by the Comitium, where the tresviri capitales sat in judgement on thieves. */
function columnaMaenia(p: Part) {
  const v = onPaving(p, [24, -48]);
  const at = TRS(v.x, v.y, v.z, 0, bearingRot(p, 160), 0);
  const h = pedestal(p.b, at, 1.2, 1.2, 1.4, 'travertine');
  column(p.b, { order: 'tuscan', D: 0.6, height: 5.2, fluted: false, material: 'peperino', trimMaterial: 'travertine', detail: p.detail, collide: false }, mul(at, T(0, h, 0)));
  togate(p.b, mul(at, T(0, h + 5.2, 0)), { material: 'bronze', scale: 1.0, detail: 'low' });
  p.d.solidCyl(v.x, v.y + (h + 5.2) / 2, v.z, 0.75, h + 5.2);
  const s = ahead(p, v, 160, 2.0);
  p.spot('tresviri-capitales', 'npc', s.x, v.y, s.z, bearingHeading(p, 340));
}

/**
 * The Puteal Libonis (Scribonianum) in the lower Forum: the marble well-head over a spot struck by
 * lightning, garlanded and set with lyres as on Libo's coins, where the money-lenders met; beside
 * it the praetor's tribunal, a stone platform with his curule chair (the court sat in the open).
 */
function putealAndTribunal(p: Part) {
  const v = onPaving(p, [106, 56]);
  const seg = p.hi ? 32 : 12;
  p.d.cyl('travertine', v.x, v.y + 0.08, v.z, 1.05, 0.16, seg, { collide: true });
  p.d.cyl('marble', v.x, v.y + 0.62, v.z, 0.78, 0.92, seg, { collide: true });
  p.d.cyl('marble', v.x, v.y + 1.12, v.z, 0.84, 0.08, seg);
  p.d.cyl('black', v.x, v.y + 1.165, v.z, 0.6, 0.01, seg);
  if (p.hi) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = v.x + Math.sin(a) * 0.79;
      const z = v.z + Math.cos(a) * 0.79;
      // a garland swag and, between them, a bronze lyre
      p.d.ellipsoid(i % 2 ? 'foliage_broad' : 'fabric_red', x, v.y + 0.82, z, 0.16, 0.06, 0.05, { seg: [8, 4], shadow: false });
      if (i % 2 === 0) p.d.box('bronze', x * 1.0 + Math.sin(a) * 0.02, v.y + 0.55, z + Math.cos(a) * 0.02, 0.14, 0.22, 0.02, { ry: a });
    }
  }
  p.spot('puteal-libonis', 'shrine', ahead(p, v, 300, 1.8).x, v.y, ahead(p, v, 300, 1.8).z, bearingHeading(p, 120));
  p.spot('faenerator', 'vendor', ahead(p, v, 30, 1.6).x, v.y, ahead(p, v, 30, 1.6).z, bearingHeading(p, 210));
  // the tribunal
  const t = onPaving(p, [99, 47]);
  const B = 300;
  const f = p.d.at(t.x, t.y, t.z, bearingRot(p, B));
  const w = 4.2;
  const dp = 3.0;
  const H = 1.2;
  f.span('travertine', -w / 2, -0.3, -dp / 2, w / 2, H, dp / 2, { collide: p.main });
  f.span('marble', -w / 2 - 0.08, H - 0.12, -dp / 2 - 0.08, w / 2 + 0.08, H, dp / 2 + 0.08);
  stairs(p.b, { width: 1.6, rise: H / 6, run: 0.3, count: 6, material: 'travertine', collider: p.main ? 'steps' : 'none' }, mul(TRS(t.x, t.y, t.z, 0, bearingRot(p, B), 0), TRS(w / 2 - 1.0, 0, dp / 2 + 6 * 0.3, 0, Math.PI, 0)));
  placeProp(f, 'stool', 0, H, 0.3, 0, { variant: 2, collide: false });
  placeProp(f, 'bench', -1.4, H, 0.9, 0, { variant: 1, collide: false });
  // the spear planted beside the court (hasta), the sign of a Roman court
  f.cyl('wood_dark', 1.6, H + 1.4, -0.9, 0.025, 2.8, 5);
  f.cyl('iron', 1.6, H + 2.9, -0.9, 0.04, 0.25, 4, { rTop: 0.004 });
  p.spot('praetor-tribunal', 'sit', t.x, t.y + H + 0.45, t.z, bearingHeading(p, B));
  const fr = ahead(p, t, B, 3.0);
  p.spot('tribunal-litigants', 'npc', fr.x, t.y, fr.z, bearingHeading(p, B + 180));
}

/** Where the crowd stands about: idlers, talkers, clients waiting for their patrons (real m, bearing). */
const CROWD: [number, number, number][] = [
  [40, 12, 300],
  [47, 14, 120],
  [58, 2, 210],
  [72, 16, 30],
  [86, 30, 250],
  [101, 40, 200],
  [108, 22, 40],
  [124, 33, 300],
  [139, 47, 210],
  [28, 20, 116],
  [63, -12, 160],
  [44, 31, 24],
  [92, 8, 300],
  [23, -34, 200],
  [150, 70, 300],
  [165, 100, 20],
  [118, 120, 300],
  [92, 128, 200],
  [-14, 40, 30],
  [52, 140, 120],
];

// ---------------------------------------------------------------- entry

/** Everyday life on the paved Forum (call from the miliarium-aureum builder). */
export function forumLife(p: Part) {
  vortumnus(p);
  actaDiurna(p);
  litterStand(p);
  cloacaGrate(p);
  garlandSeller(p);
  bookseller(p);
  scribe(p);
  urbanCohortPost(p);
  columnaMaenia(p);
  putealAndTribunal(p);
  CROWD.forEach(([x, z, b], i) => {
    const v = onPaving(p, [x, z]);
    p.spot(`forum-crowd-${i + 1}`, 'npc', v.x, v.y, v.z, bearingHeading(p, b));
  });
  // lamps along the Sacra Via through the square
  for (const at of [
    [40, 4],
    [88, 15],
    [108, 28],
    [150, 61],
  ] as P2[]) lampstand(p, onPaving(p, at));
}
