/**
 * basilica-ulpia: the largest basilica in Rome (dedicated 112), closing the NW side of the Forum of
 * Trajan.
 *
 *  - Hall 117 × 58.5 m: a nave 25 m wide ringed on all four sides by two rings of grey granite
 *    Corinthian columns (94 in all: five aisles across), galleries over the aisles carried by the
 *    entablatures, a second order of cipollino columns over the inner ring, a clerestory with
 *    arched windows and a gilded coffered ceiling.
 *  - Gilded bronze roof tiles (Pausanias 5.12.6) on the nave gable and the lean-to aisle roofs.
 *  - Apses at both short ends; the NE one is the Atrium Libertatis, where slaves are freed before
 *    the praetor.
 *  - The facade on the square: steps of giallo antico, three projecting porches of giallo columns
 *    (10 in the central one), attics with Dacian captives and shield portraits, a gilded quadriga
 *    escorted by Victories over the central porch and bigae over the side porches, the frieze
 *    naming the legions and the attic EX MANVBIIS.
 *  - A door in the back wall opens on the court of the Column.
 *
 * Built in the forum frame (trajan-layout) and mapped into the landmark frame with forumToLocal().
 * Interior colonnades and the porches live in LOD chunks; the interior hides beyond 140 m.
 */
import * as THREE from 'three';
import { entablature } from '../../../arch/classical/entablature';
import { columnDims, diameterForHeight } from '../../../arch/classical/orders';
import { togate, armoredEmperor } from '../../../arch/classical/statues';
import { T, TRS, mul } from '../../../arch/common/geom';
import { inscriptionPanel } from '../../../arch/common/inscription';
import { wall, type Opening } from '../../../arch/common/walls';
import type { ColliderSpec, MeshBuilder } from '../../../gfx/MeshBuilder';
import type { LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { LodChunks, UP, arcColliders, arcFloor, arcWall, boxMinMax, colonnadeColumn, facing, farColumn, quad, solidBox, type Mat } from './trajan-kit';
import { PLAN, S, TRAJAN_INSCRIPTIONS, divide, forumToLocal } from './trajan-layout';
import { cipollinoMaterial, coffersMaterial, gildedTilesMaterial, graniteMaterial, sectileMaterial } from './trajan-materials';
import { garland, statueBase, tribunal } from './trajan-props';
import { chariotTeam, clipeus, dacianCaptive, figureBlock, victory } from './trajan-sculpture';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Plan of the basilica in forum-local game metres (x = u·S along the hall, z = −v·S). */
export const BAS = (() => {
  const front = -PLAN.basilica.front * S; // 37.8 outer face of the facade wall
  const back = -PLAN.basilica.back * S; // 72.9
  const t = 0.9;
  const half = PLAN.basilica.halfLength * S; // 35.1
  const zc = (front + back) / 2;
  const yF = 0.72; // floor: four risers of 0.18 m
  const Hg = 6.3;
  const Dg = diameterForHeight('corinthian', Hg);
  const entG = Hg * 0.235;
  const yGal = yF + Hg + entG; // gallery floor level ≈ 8.5
  const Hu = 4.5;
  const Du = diameterForHeight('corinthian', Hu);
  const entU = Hu * 0.235;
  const yClere = yGal + Hu + entU; // ≈ 14.04
  const clereH = 3.0;
  const yEaves = yClere + clereH;
  const innerZ = 7.5; // half of the 25 m nave
  const innerX = half - t - 9.15; // short sides of the inner ring
  const outerZ = innerZ + 4.1;
  const outerX = innerX + 4.1;
  const yOuter = yClere + 0.3 - (zc - innerZ - front) * Math.tan((16.5 * Math.PI) / 180);
  const apseR = 13.5;
  const apseT = 1.3;
  return { front, back, t, half, zc, yF, Hg, Dg, entG, yGal, Hu, Du, entU, yClere, clereH, yEaves, innerZ, innerX, outerZ, outerX, yOuter, apseR, apseT };
})();

/**
 * Axis of the side doors and porches: the intercolumniation of the outer colonnade nearest 17 m
 * (game) from the centre, so the doors open between columns.
 */
export const SIDE_X = (() => {
  const n0 = Math.round((2 * BAS.outerX) / 3.1);
  const n = n0 % 2 === 0 ? n0 + ((2 * BAS.outerX) / n0 > 3.1 ? 1 : -1) : n0;
  const sp = (2 * BAS.outerX) / n;
  let best = 17;
  let err = Infinity;
  for (let k = 0; k < n; k++) {
    const x = Math.abs(-BAS.outerX + (k + 0.5) * sp);
    if (Math.abs(x - 17) < err) {
      err = Math.abs(x - 17);
      best = x;
    }
  }
  return best;
})();

/** Closed rectangle path (x ±hx, z zc ± hz) at height y; inward = profile faces the centre. */
function ring(hx: number, hz: number, y: number, inward: boolean): THREE.Vector3[] {
  const z0 = BAS.zc - hz;
  const z1 = BAS.zc + hz;
  const p = [V(-hx, y, z0), V(hx, y, z0), V(hx, y, z1), V(-hx, y, z1)];
  return inward ? p.reverse() : p;
}

/** `divide` with an odd number of bays, so the axis (x = 0) falls in an intercolumniation. */
function divideOdd(a: number, b: number, target: number): number[] {
  let n = Math.max(1, Math.round(Math.abs(b - a) / target));
  if (n % 2 === 0) n += Math.abs(b - a) / n > target ? 1 : -1;
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}

/** Column positions round a ring (corners once); the long sides leave the axis open. */
function ringColumns(hx: number, hz: number, sp: number): { x: number; z: number; key: number }[] {
  const out: { x: number; z: number; key: number }[] = [];
  for (const x of divideOdd(-hx, hx, sp)) {
    out.push({ x, z: BAS.zc - hz, key: x });
    out.push({ x, z: BAS.zc + hz, key: x });
  }
  const zs = divide(BAS.zc - hz, BAS.zc + hz, sp);
  for (const z of zs.slice(1, -1)) {
    out.push({ x: -hx, z, key: -hx });
    out.push({ x: hx, z, key: hx });
  }
  return out;
}

/** A tiled roof quad a→b (eaves or ridge line) and d (down-slope), with UVs: u across, v down. */
function roofQuad(b: MeshBuilder, m: THREE.Matrix4, mat: Mat, a: THREE.Vector3, bb: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) {
  const L = a.distanceTo(bb) / 2;
  const W = a.distanceTo(d) / 2;
  const g = new THREE.BufferGeometry();
  const P = [a, bb, c, d];
  const uv = [
    [0, 0],
    [L, 0],
    [L, W],
    [0, W],
  ];
  const idx = [0, 3, 2, 0, 2, 1];
  g.setAttribute('position', new THREE.Float32BufferAttribute(idx.flatMap((k) => [P[k].x, P[k].y, P[k].z]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(idx.flatMap((k) => uv[k]), 2));
  g.computeVertexNormals();
  // Make sure it faces up.
  const n = g.getAttribute('normal');
  if (n.getY(0) < 0) {
    const idx2 = [0, 2, 3, 0, 1, 2];
    g.setAttribute('position', new THREE.Float32BufferAttribute(idx2.flatMap((k) => [P[k].x, P[k].y, P[k].z]), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(idx2.flatMap((k) => uv[k]), 2));
    g.computeVertexNormals();
  }
  b.add(g, mat, m, { uv: 'keep' });
}

// ---------------------------------------------------------------- shell

function shell(ctx: LandmarkContext, b: MeshBuilder, F: THREE.Matrix4, spots: Spot[]) {
  const B = BAS;
  const hi = ctx.detail === 'high';
  const gilt = gildedTilesMaterial();
  const sect = sectileMaterial(3.0);
  // Floor platform (concrete core, sectile top) and the walkable floor collider.
  boxMinMax(b, 'marble', F, -B.half, -0.3, B.front, B.half, B.yF - 0.02, B.back);
  boxMinMax(b, sect, F, -B.half + B.t, B.yF - 0.02, B.front + B.t, B.half - B.t, B.yF, B.back - B.t, { castShadow: false });
  solidBox(b, F, 0, (B.yF - 0.3) / 2, B.zc, 2 * B.half, B.yF + 0.3, B.back - B.front);
  // Nave field in coloured marble squares (granite bands round it).
  boxMinMax(b, 'marble_giallo', F, -B.innerX + 0.6, B.yF, B.zc - B.innerZ + 0.6, B.innerX - 0.6, B.yF + 0.006, B.zc + B.innerZ - 0.6, { castShadow: false });
  boxMinMax(b, sect, F, -B.innerX + 1.4, B.yF + 0.006, B.zc - B.innerZ + 1.4, B.innerX - 1.4, B.yF + 0.012, B.zc + B.innerZ - 1.4, { castShadow: false });

  // Outer walls: facade with three doors and gallery windows; back wall with the court door;
  // end walls opening into the apses through three arches.
  const len = 2 * B.half;
  const gw = (x: number): Opening => ({ kind: 'window', x, width: 1.6, height: 2.2, sill: B.yGal + 0.6, arched: true, frame: false });
  const frontOps: Opening[] = [
    { kind: 'door', x: B.half, width: 3.4, height: 6.2, sill: B.yF, leaves: 'open', leafMaterial: 'bronze' },
    { kind: 'door', x: B.half - SIDE_X, width: 2.8, height: 5.4, sill: B.yF, leaves: 'open', leafMaterial: 'bronze' },
    { kind: 'door', x: B.half + SIDE_X, width: 2.8, height: 5.4, sill: B.yF, leaves: 'open', leafMaterial: 'bronze' },
  ];
  // (The kit's wall cannot stack a window over a door, so windows keep clear of the doors.)
  const clear = (x: number, ops: Opening[]) => ops.every((o) => o.kind !== 'door' || Math.abs(o.x - x) > o.width / 2 + 1.0);
  for (const x of divide(3, len - 3, 4.2)) if (clear(x, frontOps)) frontOps.push(gw(x));
  const backOps: Opening[] = [{ kind: 'door', x: B.half, width: 2.6, height: 4.6, sill: B.yF, leaves: 'open', leafMaterial: 'bronze' }];
  for (const x of divide(3, len - 3, 4.2)) {
    if (!clear(x, backOps)) continue;
    backOps.push(gw(x));
    if (Math.abs(x - B.half) > 3) backOps.push({ kind: 'window', x, width: 1.4, height: 2.4, sill: B.yF + 3.4, arched: true, frame: false });
  }
  const W = { height: B.yOuter, thickness: B.t, detail: ctx.detail, collide: true } as const;
  wall(b, { ...W, length: len, material: 'marble', openings: frontOps, courses: 0.8 }, mul(F, T(-B.half, 0, B.front + B.t / 2)));
  wall(b, { ...W, length: len, material: 'marble', openings: backOps, courses: 0.8 }, mul(F, TRS(B.half, 0, B.back - B.t / 2, 0, Math.PI, 0)));
  const endLen = B.back - B.front - 2 * B.t;
  const endOps: Opening[] = [-7.7, 0, 7.7].map((dz) => ({ kind: 'arch' as const, x: endLen / 2 + dz, width: dz === 0 ? 6.0 : 5.0, height: dz === 0 ? 8.0 : 7.0, sill: B.yF, frame: false }));
  for (const sx of [-1, 1]) {
    const x = sx * (B.half - B.t / 2);
    wall(b, { ...W, length: endLen, material: 'marble', openings: endOps }, mul(F, TRS(x, 0, sx < 0 ? B.front + B.t : B.back - B.t, 0, sx < 0 ? -Math.PI / 2 : Math.PI / 2, 0)));
  }
  // Cornice round the outer walls.
  const corn = (hx: number, z0: number, z1: number, y: number) => [V(-hx, y, z0), V(hx, y, z0), V(hx, y, z1), V(-hx, y, z1)];
  entablature(b, corn(B.half, B.front, B.back, B.yOuter - 0.9), { order: 'corinthian', columnHeight: 4, D: 0.5, material: 'marble', detail: 'low', depth: 0.6, dims: { architrave: 0.25, frieze: 0.3, cornice: 0.35 } }, { closed: true, at: F });
  // Facade attic band (behind the porch attics).
  boxMinMax(b, 'marble', F, -B.half, B.yOuter, B.front, B.half, B.yOuter + 1.1, B.front + 0.7);

  // Clerestory on the inner ring, with arched windows.
  const cl = 0.6;
  const winOps = (l: number): Opening[] => divide(1.6, l - 1.6, 3.1).map((x) => ({ kind: 'window' as const, x, width: 1.5, height: B.clereH * 0.66, sill: B.clereH * 0.16, arched: true, frame: false }));
  const lx = 2 * B.innerX + cl;
  const lz = 2 * B.innerZ;
  const cw = (l: number, m: THREE.Matrix4) => wall(b, { length: l, height: B.clereH, thickness: cl, material: 'marble', openings: winOps(l), detail: ctx.detail, collide: false }, m);
  cw(lx, mul(F, T(-B.innerX - cl / 2, B.yClere, B.zc - B.innerZ)));
  cw(lx, mul(F, TRS(B.innerX + cl / 2, B.yClere, B.zc + B.innerZ, 0, Math.PI, 0)));
  cw(lz, mul(F, TRS(B.innerX, B.yClere, B.zc - B.innerZ, 0, -Math.PI / 2, 0)));
  cw(lz, mul(F, TRS(-B.innerX, B.yClere, B.zc + B.innerZ, 0, Math.PI / 2, 0)));
  // Gilded coffered nave ceiling and the gable roof in gilded bronze tiles.
  boxMinMax(b, coffersMaterial(2.2), F, -B.innerX - 0.3, B.yEaves, B.zc - B.innerZ - 0.3, B.innerX + 0.3, B.yEaves + 0.25, B.zc + B.innerZ + 0.3, { castShadow: false });
  const ov = 1.1;
  const rise = (B.innerZ + ov) * Math.tan((14 * Math.PI) / 180);
  const yr = B.yEaves + 0.25;
  for (const sz of [-1, 1]) {
    const e = B.zc + sz * (B.innerZ + ov);
    roofQuad(b, F, gilt, V(-B.innerX - ov, yr + rise, B.zc), V(B.innerX + ov, yr + rise, B.zc), V(B.innerX + ov, yr - 0.15, e), V(-B.innerX - ov, yr - 0.15, e));
  }
  for (const sx of [-1, 1]) {
    const x = sx * (B.innerX + cl / 2);
    const tri = new THREE.BufferGeometry();
    const p = [x, yr - 0.15, B.zc - B.innerZ - ov, x, yr + rise, B.zc, x, yr - 0.15, B.zc + B.innerZ + ov];
    if (sx < 0) p.splice(0, 9, x, yr - 0.15, B.zc + B.innerZ + ov, x, yr + rise, B.zc, x, yr - 0.15, B.zc - B.innerZ - ov);
    tri.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    tri.computeVertexNormals();
    b.add(tri, 'marble', F);
  }
  // Lean-to aisle roofs (gilded) on all four sides, from the clerestory foot to the outer walls,
  // with dark undersides seen from the galleries.
  const yHi = B.yClere + 0.3;
  const yLo = B.yOuter + 0.15;
  const o = B.t + 0.5;
  const ix = B.innerX;
  const iz = B.innerZ;
  const zc = B.zc;
  const hz = (B.back - B.front) / 2;
  const aisles: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
    [V(-ix, yHi, zc - iz), V(ix, yHi, zc - iz), V(B.half + o, yLo, zc - hz - o), V(-B.half - o, yLo, zc - hz - o)],
    [V(ix, yHi, zc + iz), V(-ix, yHi, zc + iz), V(-B.half - o, yLo, zc + hz + o), V(B.half + o, yLo, zc + hz + o)],
    [V(ix, yHi, zc - iz), V(ix, yHi, zc + iz), V(B.half + o, yLo, zc + hz + o), V(B.half + o, yLo, zc - hz - o)],
    [V(-ix, yHi, zc + iz), V(-ix, yHi, zc - iz), V(-B.half - o, yLo, zc - hz - o), V(-B.half - o, yLo, zc + hz + o)],
  ];
  for (const [a, bb, c, d] of aisles) {
    roofQuad(b, F, gilt, a, bb, c, d);
    if (hi) quad(b, 'plaster_cream', F, d.clone().setY(d.y - 0.12), c.clone().setY(c.y - 0.12), bb.clone().setY(bb.y - 0.12), a.clone().setY(a.y - 0.12), 'world', false);
  }
  // Gallery floors over the aisles (coffered undersides seen from the aisles).
  const yS = B.yGal - 0.02;
  const frame: [number, number, number, number][] = [
    [-B.half + B.t, B.half - B.t, B.front + B.t, zc - iz - 0.45],
    [-B.half + B.t, B.half - B.t, zc + iz + 0.45, B.back - B.t],
    [-B.half + B.t, -ix - 0.45, zc - iz - 0.45, zc + iz + 0.45],
    [ix + 0.45, B.half - B.t, zc - iz - 0.45, zc + iz + 0.45],
  ];
  for (const [x0, x1, z0, z1] of frame) {
    boxMinMax(b, coffersMaterial(1.7), F, x0, yS - 0.3, z0, x1, yS - 0.02, z1, { castShadow: false });
    boxMinMax(b, 'mosaic', F, x0, yS - 0.02, z0, x1, yS, z1, { castShadow: false });
  }
  // Gallery parapet between the upper columns.
  for (const [x0, x1, z0, z1] of [
    [-ix, ix, zc - iz - 0.12, zc - iz + 0.12],
    [-ix, ix, zc + iz - 0.12, zc + iz + 0.12],
    [-ix - 0.12, -ix + 0.12, zc - iz, zc + iz],
    [ix - 0.12, ix + 0.12, zc - iz, zc + iz],
  ]) {
    boxMinMax(b, 'marble', F, x0, B.yGal, z0, x1, B.yGal + 1.0, z1);
  }

  // Apses: semicircular halls beyond the end walls, half-cone roofs in gilded tiles.
  const R = B.apseR;
  const segs = hi ? 36 : 14;
  for (const sx of [-1, 1]) {
    const cx = sx * (B.half - B.t / 2);
    const a0 = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
    const a1 = a0 + Math.PI;
    arcWall(b, 'marble', F, cx, zc, R, R + B.apseT, a0, a1, -0.3, B.yOuter, segs);
    arcColliders(b, F, cx, zc, R, R + B.apseT, a0, a1, 0, B.yOuter, 12);
    arcFloor(b, sect, F, cx, zc, 0.001, R, a0, a1, B.yF, segs, B.yF + 0.3);
    for (let k = 0; k < 6; k++) {
      const zA = zc - R + (2 * R * k) / 6;
      const zB = zA + (2 * R) / 6;
      const zFar = Math.abs(zA - zc) > Math.abs(zB - zc) ? zA : zB;
      const reach = Math.sqrt(Math.max(0, R * R - (zFar - zc) ** 2)) - 0.05;
      solidBox(b, F, cx + (sx * reach) / 2, (B.yF - 0.3) / 2, (zA + zB) / 2, reach, B.yF + 0.3, zB - zA);
    }
    entablature(b, Array.from({ length: segs + 1 }, (_, i) => {
      const a = sx > 0 ? a0 + (Math.PI * i) / segs : a1 - (Math.PI * i) / segs;
      return V(cx + Math.cos(a) * (R + B.apseT), B.yOuter - 0.9, zc + Math.sin(a) * (R + B.apseT));
    }), { order: 'corinthian', columnHeight: 4, D: 0.5, material: 'marble', detail: 'low', depth: 0.6, dims: { architrave: 0.25, frieze: 0.3, cornice: 0.35 } }, { at: F });
    // Half-cone roof.
    const apex = V(cx, B.yOuter + 3.2, zc);
    const rr = R + B.apseT + 0.5;
    const g: number[] = [];
    const uvs: number[] = [];
    for (let i = 0; i < segs; i++) {
      const aa = a0 + (Math.PI * i) / segs;
      const ab = a0 + (Math.PI * (i + 1)) / segs;
      const pa = V(cx + Math.cos(aa) * rr, B.yOuter - 0.1, zc + Math.sin(aa) * rr);
      const pb = V(cx + Math.cos(ab) * rr, B.yOuter - 0.1, zc + Math.sin(ab) * rr);
      const tri = sx > 0 ? [apex, pa, pb] : [apex, pb, pa];
      for (const p of tri) g.push(p.x, p.y, p.z);
      const u0 = (i * rr * Math.PI) / segs / 2;
      const u1 = ((i + 1) * rr * Math.PI) / segs / 2;
      const w = rr / 2;
      uvs.push(...(sx > 0 ? [(u0 + u1) / 2, 0, u0, w, u1, w] : [(u0 + u1) / 2, 0, u1, w, u0, w]));
    }
    const cone = new THREE.BufferGeometry();
    cone.setAttribute('position', new THREE.Float32BufferAttribute(g, 3));
    cone.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    cone.computeVertexNormals();
    b.add(cone, gilt, F, { uv: 'keep' });
    // Plastered semi-dome ceiling inside (flat disc reads fine from below at this height).
    arcFloor(b, 'plaster_white', F, cx, zc, 0.001, R, a0, a1, B.yOuter - 0.2, segs, 0.2);
  }

  // Back steps down to the Column court (4 risers) and the court door spot.
  for (let k = 0; k < 4; k++) {
    boxMinMax(b, 'marble_giallo', F, -1.8, -0.2, B.back, 1.8, B.yF - 0.18 * k, B.back + 0.4 * (k + 1), { collide: true });
  }
  spots.push({ id: 'basilica-door-court', kind: 'door', position: V(0, B.yF, B.back - B.t / 2).applyMatrix4(F), heading: 0 });
}

// ---------------------------------------------------------------- facade: steps and porches

interface Porch {
  x: number;
  cols: number;
  depth: number;
}

/** The three porches; the side ones stay inside the square, clear of the forum's porticoes. */
export const PORCHES: Porch[] = [
  { x: 0, cols: 8, depth: 4.2 },
  { x: -SIDE_X, cols: 4, depth: 3.2 },
  { x: SIDE_X, cols: 4, depth: 3.2 },
];

/** Half-width of the square at the foot of the forum porticoes' steps (forum-local game m). */
const SQUARE_HALF = PLAN.colU * S - 1.18 - 0.8;

function steps(b: MeshBuilder, F: THREE.Matrix4, x0: number, x1: number, zFront: number, zBack: number, sides: boolean) {
  const B = BAS;
  boxMinMax(b, 'marble', F, x0, -0.3, zFront, x1, B.yF, zBack, { collide: true });
  for (let k = 0; k < 3; k++) {
    const g = 0.4 * (3 - k);
    const top = 0.18 * (k + 1);
    boxMinMax(b, 'marble_giallo', F, sides ? x0 - g : x0, -0.25, zFront - g, sides ? x1 + g : x1, top, zBack, { collide: true });
  }
  boxMinMax(b, 'marble_giallo', F, x0, B.yF - 0.1, zFront, x1, B.yF + 0.005, zFront + 0.4);
}

function porches(ctx: LandmarkContext, chunks: LodChunks, F: THREE.Matrix4, main: MeshBuilder, spots: Spot[]) {
  const B = BAS;
  const hi = ctx.detail === 'high';
  const D = B.Dg;
  const d = columnDims('corinthian', D, B.Hg).d;
  const yE = B.yF + B.Hg;
  const yA = yE + B.entG;
  const atticH = 2.3;
  // Facade stylobate across the width of the square (the forum porticoes run up to the wall
  // beyond it), then the porch platforms.
  steps(main, F, -SQUARE_HALF, SQUARE_HALF, B.front - 1.2, B.front + 0.01, false);
  for (const P of PORCHES) {
    const hw = ((P.cols - 1) * 2.4) / 2;
    const zCol = B.front - P.depth;
    steps(main, F, P.x - hw - 0.9, P.x + hw + 0.9, zCol - 0.9, B.front - 1.1, true);
    const c = chunks.chunk(`porch${P.x}`, V(P.x, 6, zCol).applyMatrix4(F));
    const xs = divide(P.x - hw, P.x + hw, 2.4);
    const cols: { x: number; z: number; front: boolean }[] = xs.map((x) => ({ x, z: zCol, front: true }));
    for (const sx of [-1, 1]) cols.push({ x: P.x + sx * hw, z: (zCol + B.front) / 2, front: false });
    for (const q of cols) {
      colonnadeColumn(c.near, hi ? 'mid' : 'low', { order: 'corinthian', D, height: B.Hg, shaft: 'marble_giallo', trim: 'marble' }, mul(F, T(q.x, B.yF, q.z)));
      farColumn(c.far, { D, height: B.Hg, shaft: 'marble_giallo' }, mul(F, T(q.x, B.yF, q.z)));
    }
    // Entablature round the porch (returns die into the wall).
    const ex = hw + d / 2;
    const ez = zCol - d / 2;
    const path = [V(P.x - ex, yE, B.front), V(P.x - ex, yE, ez), V(P.x + ex, yE, ez), V(P.x + ex, yE, B.front)];
    entablature(c.near, path, { order: 'corinthian', columnHeight: B.Hg, D, material: 'marble', detail: hi ? 'high' : 'low', depth: d + 0.4, sima: false, axial: 2.4 }, { at: F });
    entablature(c.far, path, { order: 'corinthian', columnHeight: B.Hg, D, material: 'marble', detail: 'low', depth: d + 0.4, sima: false }, { at: F });
    // Porch ceiling (coffers) and the attic block above.
    boxMinMax(main, coffersMaterial(1.7), F, P.x - hw, yA - 0.14, ez + 0.3, P.x + hw, yA, B.front, { castShadow: false });
    for (const bb of [c.near, c.far]) boxMinMax(bb, 'marble', F, P.x - ex + 0.05, yA, ez + 0.05, P.x + ex - 0.05, yA + atticH, B.front + 0.3);
    boxMinMax(c.near, 'marble', F, P.x - ex - 0.1, yA + atticH - 0.25, ez - 0.1, P.x + ex + 0.1, yA + atticH, B.front);
    // Dacian captives over the front columns, shield portraits between them.
    xs.forEach((x, i) => {
      const at = mul(F, T(x, yA + 0.2, ez - 0.32));
      c.near.box('marble', 0.66, 0.2, 0.6, mul(at, T(0, -0.1, 0.1)));
      dacianCaptive(c.near, at, { detail: 'low', variant: i + P.cols, castShadow: false });
      figureBlock(c.far, at);
      if (i < xs.length - 1) clipeus(c.near, mul(F, T((x + xs[i + 1]) / 2, yA + atticH * 0.5, ez - 0.02)), 0.5, { detail: 'low', castShadow: false });
    });
    // Festival garlands between the porch columns.
    for (let i = 0; i < xs.length - 1; i++) garland(c.near, F, V(xs[i] + 0.3, yE - 0.25, zCol - D / 2 - 0.1), V(xs[i + 1] - 0.3, yE - 0.25, zCol - D / 2 - 0.1), 0.7, 0.085, true, 7);
    // Crowning groups: gilded quadriga with Victories (centre), bigae (sides).
    const top = mul(F, T(P.x, yA + atticH, (ez + B.front) / 2));
    if (P.x === 0) {
      chariotTeam(c.near, top, { horses: 4, scale: 1.25, detail: 'low', material: 'gilded_bronze' });
      chariotTeam(c.far, top, { horses: 4, scale: 1.25, detail: 'low', material: 'gilded_bronze' });
      for (const sx of [-1, 1]) {
        victory(c.near, mul(top, TRS(sx * 3.2, 0, 0.3, 0, sx * -0.3, 0)), { scale: 1.2, detail: 'low', material: 'gilded_bronze' });
        armoredEmperor(c.near, mul(top, T(sx * 6.4, 0, 0.3)), { material: 'gilded_bronze', scale: 1.2, detail: 'low', plinth: true, spear: true });
      }
      // The attic legend and the frieze of the legions.
      const lines = TRAJAN_INSCRIPTIONS['basilica-attic-inscription'].latin;
      inscriptionPanel(main, { lines, width: 2 * ex - 3.6, height: 1.3, style: 'bronze', ground: '#ebe6da' }, mul(F, T(P.x, yA + atticH * 0.5, ez - 0.03)), { depth: 0.03 });
      spots.push({ id: 'basilica-attic-inscription', kind: 'inscription', position: V(P.x, yA + atticH * 0.5, ez - 0.05).applyMatrix4(F), heading: 0 });
      const leg = TRAJAN_INSCRIPTIONS['basilica-frieze-legions'].latin;
      inscriptionPanel(main, { lines: leg, width: 2 * ex - 1.0, height: 0.42, style: 'carved', sizes: [1] }, mul(F, T(P.x, yE + B.entG * 0.5, ez - 0.26)), { depth: 0.02 });
      spots.push({ id: 'basilica-frieze-legions', kind: 'inscription', position: V(P.x, yE + B.entG * 0.5, ez - 0.3).applyMatrix4(F), heading: 0 });
    } else {
      chariotTeam(c.near, top, { horses: 2, scale: 1.15, detail: 'low', material: 'gilded_bronze' });
      chariotTeam(c.far, top, { horses: 2, scale: 1.15, detail: 'low', material: 'gilded_bronze' });
    }
  }
  // Pilasters and Dacian statues along the facade wall between the porches.
  const fc = chunks.chunk('facade-wall', V(0, 8, B.front).applyMatrix4(F));
  for (const x of divide(-SQUARE_HALF + 0.6, SQUARE_HALF - 0.6, 3.0)) {
    if (PORCHES.some((P) => Math.abs(x - P.x) < ((P.cols - 1) * 2.4) / 2 + 1.6)) continue;
    boxMinMax(main, 'marble', F, x - 0.35, B.yF, B.front - 0.16, x + 0.35, B.yOuter - 0.9, B.front);
    const at = mul(F, T(x, B.yOuter + 0.05, B.front - 0.35));
    dacianCaptive(fc.near, at, { detail: 'low', variant: Math.round(x), castShadow: false });
    figureBlock(fc.far, at);
  }
}

// ---------------------------------------------------------------- interior

function interior(ctx: LandmarkContext, chunks: LodChunks, F: THREE.Matrix4, main: MeshBuilder, spots: Spot[]) {
  const B = BAS;
  const hi = ctx.detail === 'high';
  const granite = graniteMaterial();
  const cip = cipollinoMaterial();
  const nC = 2;
  const keyOf = (x: number) => Math.min(nC - 1, Math.max(0, Math.floor(((x + B.outerX) / (2 * B.outerX)) * nC)));
  const C = Array.from({ length: nC }, (_, k) => chunks.chunk(`nave${k}`, V(-B.outerX + ((k + 0.5) * 2 * B.outerX) / nC, 6, B.zc).applyMatrix4(F)));
  // Ground order: the nave ring in grey granite, the outer ring between the aisles in giallo
  // antico (the outer ring, seen past the nave columns, gets the economical column).
  for (const [hx, hz, shaft, det] of [
    [B.innerX, B.innerZ, granite, hi ? 'mid' : 'low'],
    [B.outerX, B.outerZ, 'marble_giallo', 'low'],
  ] as const) {
    for (const p of ringColumns(hx, hz, 3.1)) {
      const c = C[keyOf(p.x)];
      colonnadeColumn(c.near, det, { order: 'corinthian', D: B.Dg, height: B.Hg, shaft, trim: 'marble' }, mul(F, T(p.x, B.yF, p.z)));
      farColumn(c.far, { D: B.Dg, height: B.Hg, shaft }, mul(F, T(p.x, B.yF, p.z)));
    }
  }
  // Gallery order over the inner ring in cipollino.
  for (const p of ringColumns(B.innerX, B.innerZ, 3.1)) {
    const c = C[keyOf(p.x)];
    colonnadeColumn(c.near, 'low', { order: 'corinthian', D: B.Du, height: B.Hu, shaft: cip, trim: 'marble', collide: false }, mul(F, T(p.x, B.yGal, p.z)));
    farColumn(c.far, { D: B.Du, height: B.Hu, shaft: cip }, mul(F, T(p.x, B.yGal, p.z)));
  }
  // Entablatures (facing the nave) on both rings and the gallery order.
  const ent = chunks.chunk('entablatures', V(0, 9, B.zc).applyMatrix4(F));
  const dG = columnDims('corinthian', B.Dg, B.Hg).d;
  const dU = columnDims('corinthian', B.Du, B.Hu).d;
  for (const [bb, det] of [
    [ent.near, hi ? 'high' : 'low'],
    [ent.far, 'low'],
  ] as const) {
    entablature(bb, ring(B.innerX - dG / 2, B.innerZ - dG / 2, B.yF + B.Hg, true), { order: 'corinthian', columnHeight: B.Hg, D: B.Dg, material: 'marble', detail: det, depth: dG + 0.5, sima: false, axial: 3.1 }, { closed: true, at: F });
    entablature(bb, ring(B.outerX - dG / 2, B.outerZ - dG / 2, B.yF + B.Hg, true), { order: 'corinthian', columnHeight: B.Hg, D: B.Dg, material: 'marble', detail: 'low', depth: dG + 0.5, sima: false }, { closed: true, at: F });
    entablature(bb, ring(B.innerX - dU / 2, B.innerZ - dU / 2, B.yGal + B.Hu, true), { order: 'corinthian', columnHeight: B.Hu, D: B.Du, material: 'marble', detail: 'low', depth: dU + 0.4, sima: false }, { closed: true, at: F });
  }

  // Furniture: two judges' tribunals in the nave with benches, scribes' tables in the aisles.
  const furn = C[0].near;
  const furn2 = C[nC - 1].near;
  for (const [sx, bb] of [
    [-1, furn],
    [1, furn2],
  ] as const) {
    const x = sx * 12;
    const at = mul(F, TRS(x, B.yF, B.zc + 4.2, 0, Math.PI, 0));
    const t = tribunal(bb, at, { w: 5, d: 3, h: 0.8, detail: 'low' });
    t.places.forEach((p, i) => spots.push({ id: `basilica-court${sx < 0 ? 'ne' : 'sw'}-${['judge', 'assessor', 'clerk'][i]}`, kind: 'npc', position: p.clone().applyMatrix4(at), heading: 0 }));
    for (let r = 0; r < 3; r++) {
      const z = B.zc - 1.0 - r * 1.3;
      boxMinMax(bb, 'wood', F, x - 2.8, B.yF, z - 0.2, x + 2.8, B.yF + 0.45, z + 0.2, { collide: true });
      spots.push({ id: `basilica-court${sx < 0 ? 'ne' : 'sw'}-bench${r}`, kind: 'sit', position: V(x, B.yF + 0.45, z).applyMatrix4(F), heading: Math.PI });
    }
    spots.push({ id: `basilica-court${sx < 0 ? 'ne' : 'sw'}-advocate`, kind: 'npc', position: V(x - 1.5, B.yF, B.zc + 1.0).applyMatrix4(F), heading: Math.PI });
  }
  for (const [k, x] of [-26, -7.5, 7.5, 26].entries()) {
    const z = B.zc - B.outerZ - 2.2;
    const at = mul(F, T(x, B.yF, z));
    for (const bb of [C[keyOf(x)].near]) {
      bb.box('wood', 1.6, 0.06, 0.8, mul(at, T(0, 0.85, 0)));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) bb.box('wood_dark', 0.06, 0.82, 0.06, mul(at, T(sx * 0.7, 0.41, sz * 0.32)));
      bb.box('fabric_white', 0.4, 0.02, 0.3, mul(at, T(-0.3, 0.89, 0)));
    }
    solidBox(main, at, 0, 0.45, 0, 1.6, 0.9, 0.8);
    spots.push({ id: `basilica-scribe${k}`, kind: 'stall', position: V(x, B.yF, z + 0.9).applyMatrix4(F), heading: Math.PI });
  }
  spots.push({ id: 'basilica-spawn-nave', kind: 'spawn', position: V(0, B.yF, B.zc - 4).applyMatrix4(F), heading: 0 });
  spots.push({ id: 'basilica-vista-nave', kind: 'vista', position: V(-B.innerX + 3, B.yF, B.zc).applyMatrix4(F), heading: -Math.PI / 2 });

  // Apses: NE = Atrium Libertatis (the praetor's tribunal for manumissions, statue of Libertas);
  // SW = statues of the imperial family on a curved base.
  for (const sx of [-1, 1]) {
    const cx = sx * (B.half - B.t / 2);
    const ck = chunks.chunk(`apse${sx}`, V(cx + sx * 6, 4, B.zc).applyMatrix4(F));
    const back = cx + sx * (B.apseR - 1.6);
    const face = sx < 0 ? -Math.PI / 2 : Math.PI / 2; // turns a figure's −z front towards the hall
    if (sx < 0) {
      const at = mul(F, TRS(back + 3.6, B.yF, B.zc, 0, face, 0));
      const t = tribunal(ck.near, at, { w: 6, d: 3.2, h: 1.0, detail: 'low' });
      spots.push({ id: 'basilica-libertatis-praetor', kind: 'npc', position: t.places[0].clone().applyMatrix4(at), heading: 0 });
      spots.push({ id: 'basilica-libertatis-lictor', kind: 'npc', position: V(back + 6.5, B.yF, B.zc + 2.4).applyMatrix4(F), heading: Math.PI / 2 });
      spots.push({ id: 'basilica-libertatis-manumission', kind: 'shrine', position: V(back + 7.2, B.yF, B.zc).applyMatrix4(F), heading: -Math.PI / 2 });
      statueBase(ck.near, mul(F, TRS(back, B.yF, B.zc, 0, face, 0)), { w: 1.6, d: 1.2, h: 1.4, detail: 'low' });
      togate(ck.near, mul(F, TRS(back, B.yF + 1.4, B.zc, 0, face, 0)), { material: 'marble', scale: 1.9, detail: hi ? 'high' : 'low', plinth: false });
    } else {
      for (const dz of [-4, 0, 4]) {
        const at = mul(F, TRS(back - sx * (dz === 0 ? 0 : 0.8), B.yF, B.zc + dz, 0, face, 0));
        statueBase(ck.near, at, { w: 1.4, d: 1.1, h: 1.3, detail: 'low' });
        (dz === 0 ? armoredEmperor : togate)(ck.near, mul(at, T(0, 1.3, 0)), { material: dz === 0 ? 'gilded_bronze' : 'marble', scale: 1.6, detail: 'low', plinth: false });
      }
    }
    for (const k of [-2, -1, 1, 2]) {
      const a = (k / 3) * (Math.PI / 2);
      const px = cx + sx * Math.cos(a) * (B.apseR - 0.05);
      const pz = B.zc + Math.sin(a) * (B.apseR - 0.05);
      const rot = Math.atan2(sx * Math.cos(a), Math.sin(a));
      ck.near.box('marble_veined', 1.4, 3.4, 0.05, mul(F, TRS(px, B.yF + 2.6, pz, 0, rot, 0)));
      ck.near.box('marble_giallo', 1.8, 0.2, 0.25, mul(F, TRS(px, B.yF + 4.4, pz, 0, rot, 0)));
    }
  }
}

function farMassing(ctx: LandmarkContext, F: THREE.Matrix4): THREE.Object3D {
  const B = BAS;
  const b = ctx.builder();
  const gilt: Mat = gildedTilesMaterial();
  boxMinMax(b, 'marble', F, -B.half, 0, B.front, B.half, B.yOuter + 1.1, B.back);
  boxMinMax(b, 'marble', F, -B.innerX, B.yOuter, B.zc - B.innerZ, B.innerX, B.yEaves, B.zc + B.innerZ);
  // Gilded gable over the nave and hipped aisle roofs: the gold must read from across the city.
  const rise = (B.innerZ + 1) * Math.tan((14 * Math.PI) / 180);
  for (const sz of [-1, 1]) {
    const e = B.zc + sz * (B.innerZ + 1);
    facing(b, gilt, F, [V(-B.innerX - 1, B.yEaves + rise, B.zc), V(B.innerX + 1, B.yEaves + rise, B.zc), V(B.innerX + 1, B.yEaves, e), V(-B.innerX - 1, B.yEaves, e)], UP);
    const o = sz * ((B.back - B.front) / 2 + 0.5);
    facing(b, gilt, F, [V(-B.innerX, B.yClere, B.zc + sz * B.innerZ), V(B.innerX, B.yClere, B.zc + sz * B.innerZ), V(B.half + 0.5, B.yOuter + 1.1, B.zc + o), V(-B.half - 0.5, B.yOuter + 1.1, B.zc + o)], UP);
  }
  for (const sx of [-1, 1]) {
    facing(b, 'marble', F, [V(sx * B.innerX, B.yEaves, B.zc - B.innerZ - 1), V(sx * B.innerX, B.yEaves + rise, B.zc), V(sx * B.innerX, B.yEaves, B.zc + B.innerZ + 1)], V(sx, 0, 0));
    facing(b, gilt, F, [V(sx * B.innerX, B.yClere, B.zc - B.innerZ), V(sx * B.innerX, B.yClere, B.zc + B.innerZ), V(sx * (B.half + 0.5), B.yOuter + 1.1, B.zc + (B.back - B.front) / 2 + 0.5), V(sx * (B.half + 0.5), B.yOuter + 1.1, B.zc - (B.back - B.front) / 2 - 0.5)], UP);
  }
  for (const sx of [-1, 1]) arcWall(b, 'marble', F, sx * (B.half - B.t / 2), B.zc, 0, B.apseR + B.apseT, sx > 0 ? -Math.PI / 2 : Math.PI / 2, sx > 0 ? Math.PI / 2 : Math.PI * 1.5, 0, B.yOuter, 8);
  for (const P of PORCHES) {
    const hw = ((P.cols - 1) * 2.4) / 2;
    boxMinMax(b, 'marble', F, P.x - hw - 0.4, 0, B.front - P.depth - 0.4, P.x + hw + 0.4, B.yF + B.Hg + B.entG + 2.3, B.front);
  }
  return b.build('basilica-ulpia:far');
}

export const builders: LandmarkBuilder[] = [
  {
    handles: ['basilica-ulpia'],
    build(ctx) {
      const F = forumToLocal(ctx.lm);
      const main = ctx.builder();
      const spots: Spot[] = [];
      const outside = new LodChunks(ctx.detail === 'high' ? 70 : 45);
      const inside = new LodChunks(ctx.detail === 'high' ? 34 : 24, 150, false);
      shell(ctx, main, F, spots);
      porches(ctx, outside, F, main, spots);
      interior(ctx, inside, F, main, spots);
      const colliders: ColliderSpec[] = [...main.colliders];
      const group = new THREE.Group();
      group.add(main.build('basilica-ulpia'));
      group.add(outside.build('basilica-ulpia:porches', colliders));
      group.add(inside.build('basilica-ulpia:nave', colliders));
      return { object: group, colliders, spots, far: farMassing(ctx, F), cullDistance: 1100 };
    },
  },
];
