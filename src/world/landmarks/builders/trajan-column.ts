/**
 * column-trajan: Trajan's Column (dedicated 12 May 113) and its court between the libraries.
 *
 *  - Pedestal of Luna marble carved with heaped Dacian arms, eagles at the corners holding a
 *    garland, the bronze door to the inner stair (spot 'column-door'; the stair is a v0.2
 *    dungeon) under the dedication (CIL VI 960) held by two Victories.
 *  - The column: laurel torus, 23 turns of the helical frieze of the Dacian wars, Doric capital
 *    whose abacus is the viewing platform with a bronze railing, and the gilded statue of Trajan.
 *  - The court: marble paving, an altar for tomorrow's dedication with incense tripods, the last
 *    scaffold of the carvers, and on the NW side a two-storey colonnade whose upper gallery (stair
 *    of 0.2 m risers) is the viewing gallery for the frieze.
 *
 * bibliotheca-ulpia-east / -west: the twin libraries facing each other across the court. Porch of
 * pavonazzetto columns, a hall with book cupboards (armaria) in niches on two levels behind a
 * gallery on columns, a statue niche in the end wall, reading tables; interior visible through the
 * wide door and windows.
 */
import * as THREE from 'three';
import { doricCapital } from '../../../arch/classical/capitals';
import { entablature } from '../../../arch/classical/entablature';
import { columnDims, diameterForHeight, entasisRadius } from '../../../arch/classical/orders';
import { armoredEmperor, togate } from '../../../arch/classical/statues';
import { ProfileBuilder, T, TRS, cylinderBetween, gridSurface, lathe, linspace, mul, sweep } from '../../../arch/common/geom';
import { inscriptionPanel } from '../../../arch/common/inscription';
import { friezeBand, reliefMaterial } from '../../../arch/common/relief';
import { wall, type Opening } from '../../../arch/common/walls';
import { Draw } from '../../../arch/fabric/draw';
import { placeProp } from '../../../arch/props/props';
import type { ColliderSpec, MeshBuilder } from '../../../gfx/MeshBuilder';
import type { LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { LodChunks, boxMinMax, colonnadeColumn, farColumn, quad, solidBox, solidCyl } from './trajan-kit';
import { PLAN, S, TRAJAN_INSCRIPTIONS, divide, forumToLocal } from './trajan-layout';
import { dacianArmsMaterial, libraryFloorMaterial, scrollsMaterial, slabPavingMaterial } from './trajan-materials';
import { Lamps } from './trajan-lights';
import { altar, candelabrum, garland, ladder, statueBase, torchPole, tripod } from './trajan-props';
import { aquila, victory } from './trajan-sculpture';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Court and libraries in forum-local game metres. */
export const COURT = {
  x: PLAN.court.u1 * S, // 7.08: half-width between the library porches
  z0: -PLAN.court.v0 * S, // 72.9: basilica back wall
  z1: -PLAN.court.v1 * S, // 88.5: NW colonnade
  colZ: -PLAN.column.v * S, // 79.98
  libZ0: -PLAN.library.v0 * S, // 73.56
  libZ1: -PLAN.library.v1 * S, // 88.2
  libDepth: PLAN.library.depth * S, // 11.7
};

// ---------------------------------------------------------------- the column

let friezeMat: THREE.MeshStandardMaterial | null = null;
function frieze(): THREE.MeshStandardMaterial {
  if (!friezeMat) {
    friezeMat = reliefMaterial(friezeBand(1024, 112, 113), { ground: [192, 184, 168], relief: [242, 236, 224], noise: 0.06, strength: 6, roughness: 0.55, repeat: true });
    friezeMat.name = 'trajan:column-frieze';
  }
  return friezeMat;
}

/** Pedestal height (game): taller than 0.6 × 5.3 m so the door can be a walkable 2.2 m. */
const PED_H = 3.9;
const PED_W = 3.3;

function pedestal(b: MeshBuilder, at: THREE.Matrix4, hi: boolean, spots: Spot[] | null) {
  const w = PED_W;
  const plinth = 0.3;
  const crownH = 0.45;
  const dieTop = PED_H - crownH;
  const n = hi ? 3 : 1;
  b.box('marble', w + 0.6, plinth, w + 0.6, mul(at, T(0, plinth / 2, 0)));
  // Hollow die: the front (SE, −z) face has the door; a chamber behind (the future tomb).
  const doorW = 1.1;
  const doorH = 2.25;
  const t = 0.45;
  const sides: [number, number, number, number][] = [
    [-w / 2, w / 2, w / 2 - t, w / 2], // back
    [-w / 2, -w / 2 + t, -w / 2, w / 2], // left
    [w / 2 - t, w / 2, -w / 2, w / 2], // right
  ];
  for (const [x0, x1, z0, z1] of sides) boxMinMax(b, 'marble', at, x0, plinth, z0, x1, dieTop, z1, { collide: true });
  boxMinMax(b, 'marble', at, -w / 2, plinth, -w / 2, -doorW / 2, dieTop, -w / 2 + t, { collide: true });
  boxMinMax(b, 'marble', at, doorW / 2, plinth, -w / 2, w / 2, dieTop, -w / 2 + t, { collide: true });
  boxMinMax(b, 'marble', at, -doorW / 2, plinth + doorH, -w / 2, doorW / 2, dieTop, -w / 2 + t);
  boxMinMax(b, 'marble', at, -w / 2, dieTop - 0.2, -w / 2, w / 2, dieTop, w / 2);
  // Closed bronze door leaves with a frame; dark chamber behind.
  boxMinMax(b, 'bronze', at, -doorW / 2, plinth, -w / 2 + 0.2, doorW / 2, plinth + doorH, -w / 2 + 0.26, { collide: true });
  b.box('bronze', 0.04, doorH, 0.03, mul(at, T(0, plinth + doorH / 2, -w / 2 + 0.185)));
  for (const sx of [-1, 1]) b.box('marble', 0.14, doorH + 0.12, 0.08, mul(at, T(sx * (doorW / 2 + 0.07), plinth + doorH / 2 + 0.06, -w / 2 - 0.03)));
  b.box('marble', doorW + 0.28, 0.14, 0.08, mul(at, T(0, plinth + doorH + 0.07, -w / 2 - 0.03)));
  // Base and crown mouldings.
  const sq = (hw: number, y: number) => [V(-hw, y, -hw), V(hw, y, -hw), V(hw, y, hw), V(-hw, y, hw)];
  const base = new ProfileBuilder(-0.02, 0).to(0.12, 0).up(0.1).torus(0.12, 0.05, n).in(0.05).cymaReversa(-0.06, 0.1, n).to(-0.02, 0.34).build();
  // The door face is broken by the frame, so the base moulding runs on the other three sides.
  b.add(sweep(base, [V(-w / 2, plinth, -w / 2), V(-w / 2, plinth, w / 2), V(w / 2, plinth, w / 2), V(w / 2, plinth, -w / 2)].reverse(), { caps: true }), 'marble', at);
  const crown = new ProfileBuilder(-0.02, -crownH).to(0, -crownH).cymaReversa(0.07, 0.12, n).up(0.05).out(0.1).up(0.18).ovolo(0.06, 0.08, n).to(-0.02, 0).build();
  b.add(sweep(crown, sq(w / 2, PED_H), { closed: true }), 'marble', at);
  // Heaped Dacian arms in relief on the three plain faces and either side of the door.
  if (hi) {
    const arms = dacianArmsMaterial();
    const rh = dieTop - plinth - 0.6;
    const yc = plinth + 0.38 + rh / 2;
    const face = (rot: number, pw: number, dx = 0) => {
      const m = mul(at, TRS(0, yc, 0, 0, rot, 0));
      const z = -w / 2 - 0.012;
      // a→d→c→b winds the quad to face −z (outward) in the rotated frame.
      quad(b, arms, m, V(dx - pw / 2, -rh / 2, z), V(dx - pw / 2, rh / 2, z), V(dx + pw / 2, rh / 2, z), V(dx + pw / 2, -rh / 2, z), 'unit', false);
    };
    for (const rot of [Math.PI, Math.PI / 2, -Math.PI / 2]) face(rot, w - 0.5);
  }
  // The dedication above the door, held by two Victories in relief.
  const lines = TRAJAN_INSCRIPTIONS['column-inscription'].latin;
  const i0 = plinth + doorH + 0.17;
  const ih = dieTop - 0.07 - i0;
  const iy = i0 + ih / 2;
  inscriptionPanel(b, { lines, width: 2.2, height: ih, style: 'carved', border: true, sizes: [1, 0.85, 0.85, 0.85, 0.85, 0.85] }, mul(at, T(0, iy, -w / 2 - 0.02)), { depth: 0.04 });
  for (const sx of [-1, 1]) victory(b, mul(at, TRS(sx * 1.38, iy - 0.75, -w / 2 - 0.12, 0, sx * 0.2, 0)), { scale: 0.62, detail: hi ? 'high' : 'low', material: 'marble' });
  // Eagles at the corners holding a laurel garland round the crown.
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    aquila(b, mul(at, TRS(sx * (w / 2 - 0.1), dieTop - 0.75, sz * (w / 2 - 0.1), 0, Math.atan2(sx, sz) + Math.PI, 0)), { scale: 1.3, detail: hi ? 'high' : 'low', material: 'marble' });
  }
  // (No garland on the door face: the dedication fills its upper part.)
  for (const [a, c] of [
    [V(w / 2 + 0.08, dieTop - 0.45, -w / 2 + 0.2), V(w / 2 + 0.08, dieTop - 0.45, w / 2 - 0.2)],
    [V(w / 2 - 0.2, dieTop - 0.45, w / 2 + 0.08), V(-w / 2 + 0.2, dieTop - 0.45, w / 2 + 0.08)],
    [V(-w / 2 - 0.08, dieTop - 0.45, w / 2 - 0.2), V(-w / 2 - 0.08, dieTop - 0.45, -w / 2 + 0.2)],
  ]) {
    garland(b, at, a, c, 0.45, 0.1, true, hi ? 9 : 5);
  }
  if (spots) {
    spots.push({ id: 'column-door', kind: 'door', position: V(0, 0.03, -w / 2 - 0.9).applyMatrix4(at), heading: 0 });
    spots.push({ id: 'column-inscription', kind: 'inscription', position: V(0, iy, -w / 2 - 0.05).applyMatrix4(at), heading: 0 });
  }
}

/** The column proper on top of the pedestal; returns the height of the statue's head. */
function columnBody(b: MeshBuilder, at: THREE.Matrix4, hi: boolean): number {
  const Hc = 29.78 * S;
  const D = 3.69 * S;
  const segs = hi ? 48 : 16;
  const y0 = PED_H;
  // Laurel torus on a low plinth.
  const baseH = 0.36 * D;
  const tp = new ProfileBuilder(0.68 * D, y0).up(0.08 * D).torus(0.2 * D, 0.12 * D, hi ? 8 : 3).in(0.06 * D).up(0.03 * D).to(0.5 * D, y0 + baseH).build();
  b.add(lathe(tp, { segments: segs }), 'marble', at);
  if (hi) {
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      const l = new THREE.SphereGeometry(0.07 * D, 5, 3);
      l.scale(0.5, 1, 0.35);
      l.rotateZ(0.6);
      l.rotateY(a);
      l.translate(Math.sin(a) * 0.79 * D, y0 + 0.19 * D, Math.cos(a) * 0.79 * D);
      b.add(l, 'marble', at);
    }
  }
  // Shaft with the helical frieze (23 turns, the band one turn high).
  const capH = 0.42 * D;
  const ys = y0 + baseH;
  const shaftH = Hc - baseH - capH;
  const turns = 23;
  const topRatio = 0.87;
  const shaft = gridSurface(
    linspace(0, Math.PI * 2, hi ? 64 : 20),
    linspace(0, 1, hi ? 48 : 8),
    (a, t, out) => {
      const r = entasisRadius(D, topRatio, t);
      return out.set(r * Math.sin(a), ys + t * shaftH, r * Math.cos(a));
    },
    { uv: (a, t) => [a / (Math.PI * 2), t * turns - a / (Math.PI * 2)] },
  );
  b.add(shaft, typeof document !== 'undefined' ? frieze() : 'marble', at, { uv: 'keep' });
  // Doric capital (egg-and-dart echinus) whose abacus is the viewing platform, with a railing.
  const yc = ys + shaftH;
  for (const p of doricCapital({ D, d: D * topRatio, height: capH, detail: hi ? 'high' : 'low' })) {
    p.geometry.translate(0, yc, 0);
    b.add(p.geometry, 'marble', at);
  }
  const yTop = yc + capH;
  const hw = 0.66 * D;
  const railY = yTop + 1.0;
  const posts = hi ? 5 : 2;
  for (const [ax, az, cx, cz] of [
    [-hw, -hw, hw, -hw],
    [hw, -hw, hw, hw],
    [hw, hw, -hw, hw],
    [-hw, hw, -hw, -hw],
  ]) {
    b.add(cylinderBetween(V(ax, railY, az), V(cx, railY, cz), 0.025, 0.025, 4), 'bronze', at);
    for (let k = 0; k < posts; k++) {
      const t = k / posts;
      const x = ax + (cx - ax) * t;
      const z = az + (cz - az) * t;
      b.add(cylinderBetween(V(x, yTop, z), V(x, railY, z), 0.02, 0.02, 4), 'bronze', at);
    }
  }
  // Drum-shaped statue base with its little dome, and the gilded emperor (≈ 4 m real).
  const sb = new ProfileBuilder(0.4 * D, yTop).up(0.08 * D).in(0.05 * D).up(0.28 * D).out(0.05 * D).up(0.06 * D).ovolo(0.04 * D, 0.06 * D, 3).to(0, yTop + 0.48 * D).build();
  b.add(lathe(sb, { segments: segs }), 'marble', at);
  const yS = yTop + 0.48 * D;
  const sc = (4 * S) / 1.85;
  armoredEmperor(b, mul(at, T(0, yS, 0)), { material: 'gilded_bronze', scale: sc, detail: hi ? 'high' : 'low', plinth: false, spear: true });
  solidCyl(b, at, 0, ys + shaftH / 2, 0, D / 2, shaftH);
  return yS + 1.85 * sc;
}

// ---------------------------------------------------------------- the court

function court(ctx: LandmarkContext, b: MeshBuilder, chunks: LodChunks, F: THREE.Matrix4, spots: Spot[], lamps: Lamps) {
  const C = COURT;
  const hi = ctx.detail === 'high';
  // Paving between the basilica's back steps, the library porches and the NW colonnade.
  boxMinMax(b, slabPavingMaterial(), F, -C.x, -0.25, C.z0, C.x, 0.03, C.z1 + 3.6, { collide: true });
  // Two-storey colonnade on the NW side; the upper gallery is the viewing gallery for the frieze.
  const zc = C.z1; // column line
  const zb = C.z1 + 3.5; // back wall inner face
  const H1 = 3.8;
  const D1 = diameterForHeight('corinthian', H1);
  const yG = 0.03 + H1 + H1 * 0.235; // gallery floor
  const H2 = 3.0;
  const D2 = diameterForHeight('corinthian', H2);
  const yRoof = yG + 0.3 + H2 + H2 * 0.235;
  const xs = divide(-C.x + 0.5, C.x - 0.5, 2.3);
  const ck = chunks.chunk('nw-portico', V(0, 4, zc).applyMatrix4(F));
  for (const x of xs) {
    colonnadeColumn(ck.near, hi ? 'mid' : 'low', { order: 'corinthian', D: D1, height: H1, shaft: 'marble_pavonazzetto', trim: 'marble' }, mul(F, T(x, 0.03, zc)));
    colonnadeColumn(ck.near, 'low', { order: 'corinthian', D: D2, height: H2, shaft: 'marble_pavonazzetto', trim: 'marble', collide: false }, mul(F, T(x, yG + 0.3, zc)));
    farColumn(ck.far, { D: D1, height: H1, shaft: 'marble_pavonazzetto' }, mul(F, T(x, 0.03, zc)));
    farColumn(ck.far, { D: D2, height: H2, shaft: 'marble_pavonazzetto' }, mul(F, T(x, yG + 0.3, zc)));
  }
  const d1 = columnDims('corinthian', D1, H1).d;
  // Entablatures face the court (−z): walking +x gives the outward normal −z.
  const path = (y: number, d: number) => [V(-C.x, y, zc - d / 2), V(C.x, y, zc - d / 2)];
  entablature(ck.near, path(0.03 + H1, d1), { order: 'corinthian', columnHeight: H1, D: D1, material: 'marble', detail: hi ? 'high' : 'low', depth: d1 + 0.3, sima: false }, { at: F });
  entablature(ck.far, path(0.03 + H1, d1), { order: 'corinthian', columnHeight: H1, D: D1, material: 'marble', detail: 'low', depth: d1 + 0.3, sima: false }, { at: F });
  entablature(b, path(yG + 0.3 + H2, D2 * 0.85), { order: 'corinthian', columnHeight: H2, D: D2, material: 'marble', detail: 'low', depth: 0.6, sima: true }, { at: F });
  // Back wall (with a door through to the NW), gallery floor, stair, balustrade and roof.
  const wl = 2 * C.x + 1.0;
  wall(b, { length: wl, height: yRoof, thickness: 0.6, material: 'marble', openings: [{ kind: 'door', x: wl / 2, width: 2.0, height: 3.0, leaves: 'open', leafMaterial: 'bronze' }], detail: ctx.detail, collide: true }, mul(F, TRS(C.x + 0.5, 0, zb + 0.3, 0, Math.PI, 0)));
  for (const sx of [-1, 1]) boxMinMax(b, 'marble', F, Math.min(sx * C.x, sx * (C.x + 0.5)), 0, zc - 0.3, Math.max(sx * C.x, sx * (C.x + 0.5)), yRoof, zb + 0.6, { collide: true });
  // Outer (NW) face: pilasters in pairs either side of the door, a socle, a band at the
  // gallery floor and a cornice under the eaves, with a pedimented frame round the door.
  {
    const zo = zb + 0.6;
    boxMinMax(b, 'marble_veined', F, -C.x - 0.5, 0, zo, C.x + 0.5, 0.45, zo + 0.08, { castShadow: false });
    boxMinMax(b, 'marble', F, -C.x - 0.5, yG - 0.2, zo, C.x + 0.5, yG + 0.05, zo + 0.14, { castShadow: false });
    boxMinMax(b, 'marble', F, -C.x - 0.7, yRoof - 0.45, zo, C.x + 0.7, yRoof - 0.1, zo + 0.32);
    for (const x of divide(-C.x, C.x, 2.3)) {
      if (Math.abs(x) < 1.6) continue;
      boxMinMax(b, 'marble', F, x - 0.28, 0.45, zo, x + 0.28, yRoof - 0.45, zo + 0.12);
    }
    for (const sx of [-1, 1]) boxMinMax(b, 'marble_giallo', F, sx * 1.0 - 0.14, 0, zo, sx * 1.0 + 0.14, 3.15, zo + 0.1, { castShadow: false });
    boxMinMax(b, 'marble_giallo', F, -1.3, 3.0, zo, 1.3, 3.3, zo + 0.14, { castShadow: false });
    for (const sx of [-1, 1]) b.box('marble', 1.45, 0.14, 0.3, mul(F, TRS(sx * 0.62, 3.55, zo + 0.15, 0, 0, -sx * 0.32)));
    lamps.add('torch', V(0, 0.53, -0.3), mul(F, TRS(1.7, 2.6, zo + 0.01, 0, Math.PI, 0)));
    placeProp(new Draw(b, mul(F, TRS(1.7, 2.6, zo + 0.01, 0, Math.PI, 0))), 'torch_bracket', 0, 0, 0, 0);
  }
  // Stair along the back wall from x = +stairX0 up to the landing near x = 0 (risers ≤ 0.2 m).
  const rise = yG;
  const nSteps = Math.ceil(rise / 0.2 - 1e-6);
  const r = rise / nSteps;
  const tread = 0.3;
  const sw = 1.3;
  const zS0 = zb - sw;
  const xTop = -1.4; // top of the flight (the landing is at x < xTop); a 1.2 m clear foot at +x
  for (let k = 0; k < nSteps; k++) {
    const x1 = xTop + (nSteps - k) * tread;
    const x0 = x1 - tread;
    boxMinMax(b, 'marble', F, x0, 0, zS0, x1, (k + 1) * r, zb, { collide: true });
  }
  // Gallery floor (coffered underside) round the stairwell; the stairwell edge has a rail.
  const xStairEnd = xTop + nSteps * tread;
  const slabs: [number, number, number, number][] = [
    [-C.x, C.x, zc - 0.4, zS0],
    [-C.x, xTop, zS0, zb],
    [Math.min(C.x, xStairEnd), C.x, zS0, zb],
  ];
  for (const [x0, x1, z0, z1] of slabs) {
    if (x1 - x0 < 0.3) continue;
    boxMinMax(b, 'marble', F, x0, yG - 0.25, z0, x1, yG, z1, { collide: true });
  }
  boxMinMax(b, 'bronze', F, xTop, yG + 0.95, zS0 - 0.04, C.x, yG + 1.0, zS0 + 0.04, { collide: false });
  solidBox(b, F, (xTop + C.x) / 2, yG + 0.5, zS0, C.x - xTop, 1.0, 0.1);
  // Balustrade along the gallery front, between the upper columns.
  boxMinMax(b, 'marble', F, -C.x, yG, zc - 0.12, C.x, yG + 1.0, zc + 0.12, { collide: true });
  boxMinMax(b, 'marble', F, -C.x, yG + 0.95, zc - 0.18, C.x, yG + 1.05, zc + 0.18);
  // Ceiling over the gallery and a lean-to roof.
  boxMinMax(b, 'wood_dark', F, -C.x - 0.5, yRoof - 0.15, zc - 0.3, C.x + 0.5, yRoof, zb + 0.6, { castShadow: false });
  const roof = new THREE.BufferGeometry();
  const p = [V(-C.x - 0.6, yRoof + 0.05, zc - 0.6), V(C.x + 0.6, yRoof + 0.05, zc - 0.6), V(C.x + 0.6, yRoof + 1.2, zb + 0.7), V(-C.x - 0.6, yRoof + 1.2, zb + 0.7)];
  roof.setAttribute('position', new THREE.Float32BufferAttribute([0, 2, 1, 0, 3, 2].flatMap((k) => [p[k].x, p[k].y, p[k].z]), 3));
  roof.computeVertexNormals();
  b.add(roof, 'roof_tile', F);
  spots.push({ id: 'column-vista-gallery', kind: 'vista', position: V(0, yG, zc + 0.6).applyMatrix4(F), heading: Math.PI });
  spots.push({ id: 'column-gallery-stair', kind: 'door', position: V(Math.min(xStairEnd + 0.5, C.x - 0.45), 0.03, zb - sw / 2).applyMatrix4(F), heading: -Math.PI / 2 });

  // The dedication: altar and tripods in front of the door, garlands, the last scaffold.
  // (The altar stands to the SW of the door, clear of the way from the basilica's back door.)
  const xA = 4.6;
  const zA = C.colZ - PED_W / 2 - 1.6;
  const yAltar = altar(b, mul(F, TRS(xA, 0.03, zA, 0, -Math.PI / 2, 0)), { w: 1.4, d: 0.9, h: 1.0 });
  lamps.add('altar', V(xA, 0.03 + yAltar + 0.35, zA), F, { intensity: 18, distance: 12 });
  for (const dz of [-1.5, 1.5]) {
    tripod(b, mul(F, T(xA + 0.3, 0.03, zA + dz)));
    lamps.add('brazier', V(xA + 0.3, 0.03 + 1.4, zA + dz), F, { intensity: 8, distance: 8, glow: 0.28, priority: 0.8 });
  }
  // Torches either side of the Column's door.
  for (const sx of [-1, 1]) {
    const at = mul(F, T(sx * 2.4, 0.03, C.colZ - PED_W / 2 - 0.5));
    lamps.add('torch', V(0, torchPole(b, at, 2.6), 0), at);
  }
  spots.push({ id: 'column-altar', kind: 'shrine', position: V(xA - 1.2, 0.03, zA).applyMatrix4(F), heading: Math.PI / 2 });
  spots.push({ id: 'column-priest', kind: 'npc', position: V(xA - 1.1, 0.03, zA + 1.0).applyMatrix4(F), heading: Math.PI / 2 });
  spots.push({ id: 'column-guard', kind: 'npc', position: V(-1.2, 0.03, C.colZ - PED_W / 2 - 0.8).applyMatrix4(F), heading: 0 });
  // Scaffold tower at the NE side of the column, being taken down: four poles, platforms, ladder.
  const sxs = -C.x + 1.0;
  const sz = C.colZ + 3.2;
  const sH = 9.5;
  for (const [dx, dz] of [
    [0, 0],
    [1.6, 0],
    [0, 1.6],
    [1.6, 1.6],
  ]) {
    b.add(cylinderBetween(V(sxs + dx, 0, sz + dz), V(sxs + dx, sH, sz + dz), 0.07, 0.06, 5), 'wood', F);
    solidCyl(b, F, sxs + dx, sH / 2, sz + dz, 0.08, sH);
  }
  for (const y of [3.2, 6.4, 9.2]) b.box('wood', 2.0, 0.08, 2.0, mul(F, T(sxs + 0.8, y, sz + 0.8)));
  for (const y of [1.6, 4.8, 7.8]) {
    b.add(cylinderBetween(V(sxs, y - 1.2, sz), V(sxs + 1.6, y + 1.2, sz), 0.04, 0.04, 4), 'wood', F);
    b.add(cylinderBetween(V(sxs, y - 1.2, sz + 1.6), V(sxs + 1.6, y + 1.2, sz + 1.6), 0.04, 0.04, 4), 'wood', F);
  }
  ladder(b, mul(F, TRS(sxs + 0.8, 0, sz - 0.4, 0, 0, 0)), 3.3, 0.35);
  spots.push({ id: 'column-carver', kind: 'npc', position: V(sxs + 0.8, 3.24, sz + 0.8).applyMatrix4(F), heading: Math.PI / 2 });
  // Garlands along the NW colonnade.
  for (let i = 0; i < xs.length - 1; i++) garland(ck.near, F, V(xs[i] + 0.25, 0.03 + H1 - 0.2, zc - 0.35), V(xs[i + 1] - 0.25, 0.03 + H1 - 0.2, zc - 0.35), 0.5, 0.07, true, 6);
}

// ---------------------------------------------------------------- libraries

/**
 * One library in its own frame: facade (porch) towards −z on the court, hall centred on the
 * origin, x along the facade. `sign` picks the label.
 */
function library(ctx: LandmarkContext, b: MeshBuilder, chunks: LodChunks, M: THREE.Matrix4, which: 'east' | 'west', spots: Spot[], lamps: Lamps) {
  const hi = ctx.detail === 'high';
  const W = (PLAN.library.v0 - PLAN.library.v1) * S; // 14.64 along the facade
  const Dp = COURT.libDepth; // 11.7 deep
  const hw = W / 2;
  const zFront = -Dp / 2; // porch column line (court edge)
  const zWall = zFront + 2.4; // front wall
  const zBack = Dp / 2;
  const t = 0.7;
  const yF = 0.36; // two steps
  const H = 12.0; // walls
  const colH = 6.0;
  const D = diameterForHeight('corinthian', colH);
  // Platform and floor.
  boxMinMax(b, 'marble', M, -hw, -0.3, zFront - 0.9, hw, yF - 0.02, zBack, { collide: true });
  boxMinMax(b, libraryFloorMaterial(), M, -hw + t, yF - 0.02, zWall + t, hw - t, yF, zBack - t, { castShadow: false });
  boxMinMax(b, 'marble_giallo', M, -hw, yF - 0.02, zFront - 0.9, hw, yF, zWall, { castShadow: false });
  boxMinMax(b, 'marble_giallo', M, -hw, -0.2, zFront - 1.3, hw, 0.18, zFront - 0.9, { collide: true });
  // Porch: six pavonazzetto columns, entablature, coffered ceiling.
  const ck = chunks.chunk(`porch-${which}`, V(0, 4, zFront).applyMatrix4(M));
  const xs = divide(-hw + 0.8, hw - 0.8, 2.6);
  for (const x of xs) {
    colonnadeColumn(ck.near, hi ? 'mid' : 'low', { order: 'corinthian', D, height: colH, shaft: 'marble_pavonazzetto', trim: 'marble' }, mul(M, T(x, yF, zFront)));
    farColumn(ck.far, { D, height: colH, shaft: 'marble_pavonazzetto' }, mul(M, T(x, yF, zFront)));
  }
  const d = columnDims('corinthian', D, colH).d;
  const ep = [V(-hw, yF + colH, zFront - d / 2), V(hw, yF + colH, zFront - d / 2)];
  entablature(ck.near, ep, { order: 'corinthian', columnHeight: colH, D, material: 'marble', detail: hi ? 'high' : 'low', depth: d + 0.3, sima: true }, { at: M });
  entablature(ck.far, ep, { order: 'corinthian', columnHeight: colH, D, material: 'marble', detail: 'low', depth: d + 0.3, sima: true }, { at: M });
  const yE = yF + colH + colH * 0.235;
  boxMinMax(b, 'wood_dark', M, -hw, yE - 0.15, zFront, hw, yE, zWall, { castShadow: false });
  // Porch attic band and a lean-to tiled roof up to the front wall, which shows a row of
  // windows above it.
  boxMinMax(b, 'marble', M, -hw, yE, zFront - 0.2, hw, yE + 0.7, zFront + 0.5);
  {
    const g = new THREE.BufferGeometry();
    const p = [V(-hw, yE + 0.7, zFront - 0.25), V(hw, yE + 0.7, zFront - 0.25), V(hw, yE + 2.0, zWall + 0.05), V(-hw, yE + 2.0, zWall + 0.05)];
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 2, 1, 0, 3, 2].flatMap((k) => [p[k].x, p[k].y, p[k].z]), 3));
    g.computeVertexNormals();
    b.add(g, 'roof_tile', M);
    boxMinMax(b, 'marble', M, -hw, yE, zFront + 0.5, hw, yE + 2.0, zWall);
  }
  // Walls: front with a wide door and two big windows, sides and back with high windows.
  const front: Opening[] = [
    { kind: 'door', x: hw, width: 3.0, height: 5.0, sill: yF, leaves: 'open', leafMaterial: 'bronze' },
    { kind: 'window', x: hw - 4.6, width: 2.0, height: 3.4, sill: yF + 1.2, arched: true },
    { kind: 'window', x: hw + 4.6, width: 2.0, height: 3.4, sill: yF + 1.2, arched: true },
    ...[-4.5, -1.5, 1.5, 4.5].map((dx) => ({ kind: 'window' as const, x: hw + dx, width: 1.3, height: 1.5, sill: yF + colH + colH * 0.235 + 2.2, arched: true, frame: false })),
  ];
  wall(b, { length: W, height: H, thickness: t, material: 'marble', openings: front, detail: ctx.detail, collide: true }, mul(M, T(-hw, 0, zWall + t / 2)));
  const hi2: Opening[] = divide(1.5, Dp - 1.5, 3).map((x) => ({ kind: 'window' as const, x, width: 1.2, height: 1.8, sill: 8.6, arched: true, frame: false }));
  const sideLen = zBack - zWall;
  wall(b, { length: sideLen, height: H, thickness: t, material: 'brick', openings: hi2.filter((o) => o.x < sideLen - 1), detail: ctx.detail, collide: true }, mul(M, TRS(-hw + t / 2, 0, zWall, 0, -Math.PI / 2, 0)));
  wall(b, { length: sideLen, height: H, thickness: t, material: 'brick', openings: hi2.filter((o) => o.x < sideLen - 1), detail: ctx.detail, collide: true }, mul(M, TRS(hw - t / 2, 0, zBack, 0, Math.PI / 2, 0)));
  wall(b, { length: W, height: H, thickness: t, material: 'brick', detail: ctx.detail, collide: true }, mul(M, TRS(hw, 0, zBack - t / 2, 0, Math.PI, 0)));
  // Outside, the brick is articulated like the Markets' facades: a travertine socle, pilasters,
  // string courses at the gallery and window levels, and a corbelled cornice under the eaves.
  for (const side of [-1, 1]) {
    const xo = side * hw;
    const xa = Math.min(xo, xo + side * 0.18);
    const xb = Math.max(xo, xo + side * 0.18);
    boxMinMax(b, 'travertine', M, Math.min(xo, xo + side * 0.06), 0, zWall, Math.max(xo, xo + side * 0.06), 0.5, zBack + 0.06, { castShadow: false });
    for (const y of [yF + 4.4, 8.3]) boxMinMax(b, 'travertine', M, xa, y - 0.1, zWall, xb, y + 0.08, zBack + 0.18, { castShadow: false });
    boxMinMax(b, 'brick', M, Math.min(xo, xo + side * 0.16), H - 0.6, zWall, Math.max(xo, xo + side * 0.16), H - 0.4, zBack + 0.16);
    boxMinMax(b, 'travertine', M, Math.min(xo, xo + side * 0.3), H - 0.4, zWall, Math.max(xo, xo + side * 0.3), H - 0.1, zBack + 0.3);
    for (const z of divide(zWall + 0.6, zBack - 0.4, 2.6)) boxMinMax(b, 'brick', M, Math.min(xo, xo + side * 0.12), 0.5, z - 0.3, Math.max(xo, xo + side * 0.12), H - 0.6, z + 0.3);
  }
  boxMinMax(b, 'travertine', M, -hw, 0, zBack, hw, 0.5, zBack + 0.06, { castShadow: false });
  for (const y of [yF + 4.4, 8.3]) boxMinMax(b, 'travertine', M, -hw - 0.18, y - 0.1, zBack, hw + 0.18, y + 0.08, zBack + 0.18, { castShadow: false });
  boxMinMax(b, 'brick', M, -hw, H - 0.6, zBack, hw, H - 0.4, zBack + 0.16);
  boxMinMax(b, 'travertine', M, -hw - 0.3, H - 0.4, zBack, hw + 0.3, H - 0.1, zBack + 0.3);
  for (const x of divide(-hw + 0.6, hw - 0.6, 2.9)) boxMinMax(b, 'brick', M, x - 0.3, 0.5, zBack, x + 0.3, H - 0.6, zBack + 0.12);
  // Marble revetment inside (the brick shows only outside).
  for (const [x0, z0, x1, z1] of [
    [-hw + t, zWall + t, -hw + t + 0.03, zBack - t],
    [hw - t - 0.03, zWall + t, hw - t, zBack - t],
    [-hw + t, zBack - t - 0.03, hw - t, zBack - t],
  ]) {
    boxMinMax(b, 'marble', M, x0, yF, z0, x1, 8.4, z1, { castShadow: false });
  }
  // Above it a stucco band round the high windows (left clear so they open into the hall).
  boxMinMax(b, 'plaster_white', M, -hw + t, 8.4, zBack - t - 0.03, hw - t, H - 1.4, zBack - t, { castShadow: false });
  for (const side of [-1, 1]) {
    const zs = hi2.filter((o) => o.x < sideLen - 1).map((o) => (side < 0 ? zWall + o.x : zBack - o.x)).sort((a, c) => a - c);
    let z = zWall + t;
    const xi = side * (hw - t);
    for (const zc of [...zs, zBack - t + 0.6]) {
      const za = z;
      const zb = Math.min(zBack - t, zc - 0.6);
      if (zb > za + 0.01) boxMinMax(b, 'plaster_white', M, Math.min(xi, xi - side * 0.03), 8.4, za, Math.max(xi, xi - side * 0.03), H - 1.4, zb, { castShadow: false });
      z = zc + 0.6;
    }
  }
  // Coffered ceiling and gable roof (ridge along the depth).
  boxMinMax(b, 'wood_dark', M, -hw, H - 1.4, zWall, hw, H - 1.2, zBack, { castShadow: false });
  const rise = hw * Math.tan((15 * Math.PI) / 180);
  for (const sx of [-1, 1]) {
    const g = new THREE.BufferGeometry();
    const p = [V(0, H + rise, zFront - 0.4), V(0, H + rise, zBack + 0.4), V(sx * (hw + 0.4), H - 0.1, zBack + 0.4), V(sx * (hw + 0.4), H - 0.1, zFront - 0.4)];
    const idx = sx > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    g.setAttribute('position', new THREE.Float32BufferAttribute(idx.flatMap((k) => [p[k].x, p[k].y, p[k].z]), 3));
    g.computeVertexNormals();
    b.add(g, 'roof_tile', M);
  }
  for (const z of [zFront - 0.4, zBack + 0.4]) {
    const g = new THREE.BufferGeometry();
    const p = z < 0 ? [-hw - 0.4, H - 0.1, z, hw + 0.4, H - 0.1, z, 0, H + rise, z] : [hw + 0.4, H - 0.1, z, -hw - 0.4, H - 0.1, z, 0, H + rise, z];
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.computeVertexNormals();
    b.add(g, 'marble', M);
  }
  // Interior: cupboard niches on two levels along the side and back walls, a gallery on
  // columns in front of the upper level, the statue niche in the back wall, reading tables.
  const ik = chunks.chunk(`hall-${which}`, V(0, 4, 0).applyMatrix4(M));
  const scrolls = scrollsMaterial();
  const yGal = yF + 4.4;
  const niche = (at: THREE.Matrix4, y: number, w: number, h: number) => {
    ik.near.box('wood_dark', w + 0.2, h + 0.2, 0.08, mul(at, T(0, y + h / 2, 0.04)));
    if (hi) {
      const g = new THREE.PlaneGeometry(w, h);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 2, (uv.getY(i) * h) / 2);
      g.translate(0, y + h / 2, 0.085);
      ik.near.add(g, scrolls, at, { uv: 'keep', castShadow: false });
    } else ik.near.box('wood', w, h, 0.02, mul(at, T(0, y + h / 2, 0.09)));
    // open cupboard doors
    for (const sx of [-1, 1]) ik.near.box('wood', 0.04, h, w / 2, mul(at, TRS(sx * (w / 2 + 0.05), y + h / 2, 0.09 + w / 4, 0, sx * 0.4, 0)));
  };
  const runs: { at: (s: number) => THREE.Matrix4; len: number }[] = [
    { at: (s) => mul(M, TRS(-hw + t + 0.03, 0, zWall + t + s, 0, Math.PI / 2, 0)), len: zBack - zWall - 2 * t },
    { at: (s) => mul(M, TRS(hw - t - 0.03, 0, zBack - t - s, 0, -Math.PI / 2, 0)), len: zBack - zWall - 2 * t },
  ];
  let cab = 0;
  for (const r of runs) {
    for (const s of divide(1.2, r.len - 1.2, 2.0)) {
      niche(r.at(s), yF + 0.6, 1.3, 2.4);
      niche(r.at(s), yGal + 0.5, 1.2, 2.2);
      if (cab++ % 3 === 0) spots.push({ id: `library-${which}-cupboard${cab}`, kind: 'container', position: V(0, yF, 0.6).applyMatrix4(r.at(s)), heading: Math.PI });
    }
  }
  // Gallery: walkway on columns along the sides, with a bronze rail (not reachable; it carries
  // the upper cupboards' readers in the fiction).
  for (const sx of [-1, 1]) {
    const xg = sx * (hw - t - 1.5);
    for (const z of divide(zWall + t + 0.8, zBack - t - 0.8, 2.4)) {
      colonnadeColumn(ik.near, 'low', { order: 'corinthian', D: 0.36, height: yGal - yF - 0.25, shaft: 'marble_pavonazzetto', trim: 'marble' }, mul(M, T(xg, yF, z)));
      farColumn(ik.far, { D: 0.36, height: yGal - yF - 0.25, shaft: 'marble_pavonazzetto' }, mul(M, T(xg, yF, z)));
    }
    boxMinMax(ik.near, 'marble', M, Math.min(xg - sx * 0.25, sx * (hw - t)), yGal - 0.25, zWall + t, Math.max(xg - sx * 0.25, sx * (hw - t)), yGal, zBack - t);
    boxMinMax(ik.near, 'bronze', M, xg - 0.03, yGal + 0.95, zWall + t, xg + 0.03, yGal + 1.0, zBack - t);
    for (const z of divide(zWall + t + 0.3, zBack - t - 0.3, 1.2)) boxMinMax(ik.near, 'bronze', M, xg - 0.02, yGal, z - 0.02, xg + 0.02, yGal + 0.95, z + 0.02);
  }
  // Statue niche (apse-like) in the back wall: a colossal marble statue of the emperor in a toga.
  boxMinMax(ik.near, 'marble_veined', M, -1.7, yF, zBack - t - 0.06, 1.7, yF + 7.2, zBack - t - 0.02);
  for (const sx of [-1, 1]) boxMinMax(ik.near, 'marble_giallo', M, sx * 1.8 - 0.2, yF, zBack - t - 0.4, sx * 1.8 + 0.2, yF + 7.2, zBack - t - 0.02);
  statueBase(ik.near, mul(M, TRS(0, yF, zBack - t - 1.0, 0, 0, 0)), { w: 1.6, d: 1.2, h: 1.2, detail: 'low' });
  togate(ik.near, mul(M, T(0, yF + 1.2, zBack - t - 1.0)), { material: 'marble', scale: 2.5, detail: hi ? 'high' : 'low', plinth: false });
  // Reading tables with benches and scroll baskets (capsae).
  let seat = 0;
  for (const z of [-0.5, 2.5]) {
    const at = mul(M, T(0, yF, z));
    ik.near.box('wood', 4.0, 0.08, 1.0, mul(at, T(0, 0.8, 0)));
    for (const sx of [-1, 1]) ik.near.box('wood_dark', 0.12, 0.76, 0.8, mul(at, T(sx * 1.8, 0.38, 0)));
    solidBox(b, at, 0, 0.42, 0, 4.0, 0.84, 1.0);
    for (const sz of [-1, 1]) {
      boxMinMax(ik.near, 'wood', at, -1.9, 0, sz * 0.85 - 0.18, 1.9, 0.45, sz * 0.85 + 0.18, { collide: true });
      spots.push({ id: `library-${which}-reader${seat++}`, kind: 'sit', position: V(sz * 0.8, 0.45, sz * 0.85).applyMatrix4(at), heading: sz < 0 ? 0 : Math.PI });
    }
    const basket = new THREE.CylinderGeometry(0.22, 0.2, 0.42, 8);
    basket.translate(1.3, 0.21, -1.4);
    ik.near.add(basket, 'wood_dark', at);
  }
  // Candelabra by the reading tables.
  for (const sx of [-1, 1]) {
    const at = mul(M, T(sx * 2.7, yF, 1.0));
    lamps.add('interior', V(0, candelabrum(b, at, 2.1) + 0.12, 0), at);
  }
  spots.push({ id: `library-${which}-librarian`, kind: 'npc', position: V(-2.5, yF, zWall + t + 1.4).applyMatrix4(M), heading: 0 });
  spots.push({ id: `library-${which}-entrance`, kind: 'spawn', position: V(0, yF, zWall - 1.2).applyMatrix4(M), heading: 0 });
  // Label over the door (which library held the Greek and which the Latin books is unknown;
  // the game puts the Greek books in the NE hall).
  const key = which === 'east' ? 'library-east-label' : 'library-west-label';
  inscriptionPanel(b, { lines: TRAJAN_INSCRIPTIONS[key].latin, width: 3.2, height: 0.55, style: 'bronze', ground: '#ece7dc' }, mul(M, T(0, yF + 5.5, zWall - 0.02)), { depth: 0.03 });
  spots.push({ id: key, kind: 'inscription', position: V(0, yF + 5.5, zWall - 0.05).applyMatrix4(M), heading: 0 });
  // Festival garland across the porch.
  for (let i = 0; i < xs.length - 1; i++) garland(ck.near, M, V(xs[i] + 0.25, yF + colH - 0.2, zFront - D / 2 - 0.1), V(xs[i + 1] - 0.25, yF + colH - 0.2, zFront - D / 2 - 0.1), 0.55, 0.075, true, 6);
}

function libraryBuild(ctx: LandmarkContext, which: 'east' | 'west') {
  const F = forumToLocal(ctx.lm);
  const s = which === 'east' ? -1 : 1;
  const cx = s * (COURT.x + COURT.libDepth / 2);
  const cz = (COURT.libZ0 + COURT.libZ1) / 2;
  // Library frame: −z (porch) turned to face the column (−s·x̂).
  const M = mul(F, TRS(cx, 0, cz, 0, s < 0 ? -Math.PI / 2 : Math.PI / 2, 0));
  const b = ctx.builder();
  const chunks = new LodChunks(ctx.detail === 'high' ? 45 : 30, 220);
  const spots: Spot[] = [];
  const lamps = new Lamps();
  library(ctx, b, chunks, M, which, spots, lamps);
  const colliders: ColliderSpec[] = [...b.colliders];
  const group = new THREE.Group();
  group.add(b.build(`bibliotheca-ulpia-${which}`));
  group.add(chunks.build(`bibliotheca-ulpia-${which}:lod`, colliders));
  lamps.attach(ctx.game, group);
  return { object: group, colliders, spots, cullDistance: 800 };
}

export const builders: LandmarkBuilder[] = [
  {
    handles: ['column-trajan'],
    build(ctx) {
      const F = forumToLocal(ctx.lm);
      const hi = ctx.detail === 'high';
      const spots: Spot[] = [];
      const b = ctx.builder();
      const chunks = new LodChunks(hi ? 55 : 35);
      // The column itself: near (full frieze, carved pedestal) / far (low) as one LOD.
      const at = mul(F, T(0, 0, COURT.colZ));
      const col = chunks.chunk('column', V(0, 10, COURT.colZ).applyMatrix4(F));
      pedestal(col.near, at, hi, spots);
      columnBody(col.near, at, hi);
      pedestal(col.far, at, false, null);
      columnBody(col.far, at, false);
      const lamps = new Lamps();
      court(ctx, b, chunks, F, spots, lamps);
      const colliders: ColliderSpec[] = [...b.colliders];
      const group = new THREE.Group();
      group.add(b.build('column-trajan'));
      group.add(chunks.build('column-trajan:lod', colliders));
      lamps.attach(ctx.game, group);
      // The column must stay on the skyline from anywhere in the centre.
      const far = ctx.builder();
      pedestal(far, at, false, null);
      columnBody(far, at, false);
      return { object: group, colliders, spots, far: far.build('column-trajan:far'), cullDistance: 1200 };
    },
  },
  { handles: ['bibliotheca-ulpia-east'], build: (ctx) => libraryBuild(ctx, 'east') },
  { handles: ['bibliotheca-ulpia-west'], build: (ctx) => libraryBuild(ctx, 'west') },
];
