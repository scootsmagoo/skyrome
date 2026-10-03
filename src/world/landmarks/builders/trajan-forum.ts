/**
 * forum-trajan: the square of the Forum of Trajan (dedicated 1 Jan 112) as it looks on the eve of
 * the Column's dedication, 12 May 113.
 *
 *  - The square: white Luna-marble slabs, 89 × 125 m between the steps.
 *  - The NE and SW porticoes: three giallo antico steps, a single row of pavonazzetto Corinthian
 *    columns, an attic with a standing Dacian captive over every column and shield portraits
 *    (imagines clipeatae) between them, and gilded horses and standards along the roofline with
 *    the EX MANVBIIS legend (Gellius 13.25).
 *  - Behind each portico a hemicycle exedra (≈ 42 m across) opening through a screen of columns,
 *    with statues in niches; the NE one is wrapped by the Markets' street.
 *  - The SE enclosure wall with the opening for the gateway (built by forum-trajan-gateway).
 *  - Bronze honorific statues on inscribed bases along the steps.
 *  - The preparations for the dedication: laurel garlands on every bay, two timber grandstands, the
 *    tribunal with its awning, an altar with incense tripods, banners, ladders and work clutter.
 *
 * Geometry is designed in the FORUM FRAME of trajan-layout.ts (here identical to the landmark's
 * local frame). Long colonnades sit in LOD chunks (trajan-kit LodChunks).
 */
import * as THREE from 'three';
import { entablature, corniceOnlyProfile } from '../../../arch/classical/entablature';
import { columnDims, diameterForHeight } from '../../../arch/classical/orders';
import { togate, armoredEmperor } from '../../../arch/classical/statues';
import { ProfileBuilder, T, TRS, mul, sweep } from '../../../arch/common/geom';
import { inscriptionPanel } from '../../../arch/common/inscription';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { LodChunks, arcColliders, arcFloor, arcWall, boxMinMax, colonnadeColumn, farColumn, solidBox, type ColumnDetail } from './trajan-kit';
import { PLAN, S, TRAJAN_INSCRIPTIONS, divide } from './trajan-layout';
import { coffersMaterial, sectileMaterial, slabPavingMaterial } from './trajan-materials';
import { altar, banner, carpet, garland, grandstand, honorificStatue, ladder, statueBase, tribunal, tripod, workClutter } from './trajan-props';
import { clipeus, dacianCaptive, figureBlock, horseStatue, signum } from './trajan-sculpture';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Vertical scheme of the lateral porticoes (game metres). */
export const FORUM_Y = (() => {
  const styl = 0.54; // three giallo steps of 0.18 m
  const colH = PLAN.colH * S; // 5.7
  const D = diameterForHeight('corinthian', colH);
  const ent = colH * 0.235;
  const yEnt = styl + colH;
  const yEntTop = yEnt + ent;
  const atticH = 2.3;
  const yAtticTop = yEntTop + atticH;
  const wall = 12.6;
  return { styl, colH, D, ent, yEnt, yEntTop, atticH, yAtticTop, wall };
})();

/** Plan positions (game metres, forum-local) shared with the other Trajanic builders. */
export const FORUM_X = {
  col: PLAN.colU * S,
  stylEdge: PLAN.colU * S - 1.18,
  stepFoot: PLAN.colU * S - 1.18 - 2 * 0.4,
  wallIn: PLAN.wallInner * S,
  wallOut: PLAN.wallOuter * S,
  zGate: -PLAN.vGate * S, // −37.5 (SE)
  zBasilica: -PLAN.basilica.front * S, // +37.8 (NW): the porticoes run up to the basilica's facade wall
  gateHalf: 9, // half-width of the opening left for the gateway (15 m real)
  exedraZ: -PLAN.exedra.v * S,
  exedraR: PLAN.exedra.r * S,
  exedraT: PLAN.exedra.wall * S,
};

const SPACING = 2.5;

function portico(ctx: LandmarkContext, main: MeshBuilder, chunks: LodChunks, s: -1 | 1, spots: Spot[]) {
  const Y = FORUM_Y;
  const X = FORUM_X;
  const hiAll = ctx.detail === 'high';
  const D = Y.D;
  const dims = columnDims('corinthian', D, Y.colH);
  const d = dims.d;
  const xCol = s * X.col;
  const xFace = xCol - s * (d / 2); // architrave face (towards the square)
  const z0 = X.zGate + 1.2;
  const z1 = X.zBasilica - 1.2;
  const zs = divide(z0, z1, SPACING);
  const I = new THREE.Matrix4();
  // Facing the square: rotation about y that turns −z into −s·x̂.
  const face = s * (Math.PI / 2);

  // ---- stylobate, steps, floor (static)
  const xa = s * X.stylEdge;
  boxMinMax(main, 'marble', I, Math.min(xa, s * X.wallIn), -0.25, X.zGate, Math.max(xa, s * X.wallIn), Y.styl - 0.02, X.zBasilica, { collide: true });
  boxMinMax(main, sectileMaterial(3.0), I, Math.min(xa, s * X.wallIn), Y.styl - 0.02, X.zGate, Math.max(xa, s * X.wallIn), Y.styl, X.zBasilica);
  // Two giallo antico steps (0.18 m risers, 0.4 m treads) below the stylobate edge.
  for (let k = 0; k < 2; k++) {
    const top = 0.18 * (k + 1);
    const xFront = s * (X.stylEdge - 0.4 * (2 - k));
    boxMinMax(main, 'marble_giallo', I, Math.min(xFront, xa), -0.2, X.zGate, Math.max(xFront, xa), top, X.zBasilica, { collide: true });
  }
  // nosing line of the stylobate in giallo too
  boxMinMax(main, 'marble_giallo', I, Math.min(xa, xa + s * 0.4), Y.styl - 0.12, X.zGate, Math.max(xa, xa + s * 0.4), Y.styl - 0.01, X.zBasilica);

  // ---- colonnade, entablature, attic in LOD chunks along z
  const nChunks = 2;
  const chunkOf = (z: number) => Math.min(nChunks - 1, Math.max(0, Math.floor(((z - X.zGate) / (X.zBasilica - X.zGate)) * nChunks)));
  const chunkZ = (k: number) => X.zGate + ((k + 0.5) * (X.zBasilica - X.zGate)) / nChunks;
  const C = Array.from({ length: nChunks }, (_, k) => chunks.chunk(`portico${s}:${k}`, V(s * 31, 6, chunkZ(k))));
  const pav = 'marble_pavonazzetto' as const;
  const colDetail: ColumnDetail = hiAll ? 'mid' : 'low';
  zs.forEach((z, i) => {
    const c = C[chunkOf(z)];
    colonnadeColumn(c.near, colDetail, { order: 'corinthian', D, height: Y.colH, shaft: pav, trim: 'marble' }, T(xCol, Y.styl, z));
    farColumn(c.far, { D, height: Y.colH, shaft: pav }, T(xCol, Y.styl, z));
    // Dacian captive on a ressaut over the column, in front of an attic pilaster. They stand
    // 8 m up, so the near level uses the economical figure and the far level a block.
    const atDac = TRS(xFace - s * 0.36, Y.yEntTop + 0.22, z, 0, face, 0);
    for (const bb of [c.near, c.far]) bb.box('marble', 0.66, 0.22, 0.62, mul(atDac, T(0, -0.11, 0.08)));
    dacianCaptive(c.near, atDac, { detail: 'low', variant: i, scale: 1.0, castShadow: false });
    figureBlock(c.far, atDac);
    c.near.box('marble', 0.52, Y.atticH, 0.1, TRS(xFace - s * 0.04, Y.yEntTop + Y.atticH / 2, z, 0, face, 0));
    // Shield portrait mid-bay (between this column and the next).
    if (i < zs.length - 1) {
      const zm = (z + zs[i + 1]) / 2;
      const cm = C[chunkOf(zm)];
      const atC = TRS(xFace - s * 0.07, Y.yEntTop + Y.atticH * 0.52, zm, 0, face, 0);
      clipeus(cm.near, atC, 0.52, { detail: 'low', material: 'marble', frameMaterial: 'marble', castShadow: false });
      // Festive laurel swag between the columns, below the architrave.
      const xs = xCol - s * (D / 2 + 0.1);
      garland(cm.near, I, V(xs, Y.yEnt - 0.25, z + 0.3), V(xs, Y.yEnt - 0.25, zs[i + 1] - 0.3), 0.75, 0.085, true, hiAll ? 7 : 5);
    }
    // Roofline: gilded horses over every fourth column, standards over the others in between.
    const atTop = TRS(xFace + s * 0.3, Y.yAtticTop + 0.25, z, 0, face, 0);
    if (i % 4 === 2) {
      c.near.box('marble', 0.7, 0.25, 1.6, mul(atTop, T(0, -0.125, 0)));
      horseStatue(c.near, mul(atTop, TRS(0, 0, 0, 0, Math.PI / 2, 0)), { detail: 'low', scale: 0.75, pose: 'prance', castShadow: false });
    } else if (i % 2 === 0) {
      signum(c.near, atTop, { detail: 'low', eagle: i % 4 === 0, scale: 0.8, castShadow: false });
    }
  });
  // Entablature and attic per chunk (straight runs).
  const pathFor = (za: number, zb: number, y: number, x: number) => (s < 0 ? [V(x, y, za), V(x, y, zb)] : [V(x, y, zb), V(x, y, za)]);
  for (let k = 0; k < nChunks; k++) {
    const za = Math.max(X.zGate, X.zGate + (k * (X.zBasilica - X.zGate)) / nChunks);
    const zb = X.zGate + ((k + 1) * (X.zBasilica - X.zGate)) / nChunks;
    const c = C[k];
    for (const [bb, det] of [
      [c.near, hiAll ? 'high' : 'low'],
      [c.far, 'low'],
    ] as const) {
      entablature(bb, pathFor(za, zb, Y.yEnt, xFace), { order: 'corinthian', columnHeight: Y.colH, D, material: 'marble', detail: det, depth: d + 0.35, sima: false, axial: SPACING }, { caps: false });
      // Attic body (marble), set back a little from the architrave face.
      boxMinMax(bb, 'marble', I, Math.min(xFace, xFace + s * 0.9), Y.yEntTop, za, Math.max(xFace, xFace + s * 0.9), Y.yAtticTop, zb);
    }
    const crown = corniceOnlyProfile('tuscan', 0.32, hiAll ? 'high' : 'low', 0.25, true);
    c.near.add(sweep(crown.profile, pathFor(za, zb, Y.yAtticTop - 0.32, xFace), { back: true }), 'marble', I);
    const base = new ProfileBuilder(-0.02, 0).to(0.08, 0).up(0.12).cymaReversa(-0.06, 0.12, 2).to(-0.02, 0.24).build();
    c.near.add(sweep(base, pathFor(za, zb, Y.yEntTop, xFace)), 'marble', I);
  }
  // EX MANVBIIS in gilded bronze letters on the attic at the middle of the portico.
  const exText = TRAJAN_INSCRIPTIONS['forum-ex-manubiis'].latin;
  const zMid = (zs[14] + zs[15]) / 2;
  inscriptionPanel(main, { lines: exText, width: 2.0, height: 0.5, style: 'bronze', ground: '#e9e4d8' }, TRS(xFace - s * 0.09, Y.yEntTop + Y.atticH * 0.84, zMid, 0, face, 0), { depth: 0.04 });
  spots.push({ id: `forum-ex-manubiis${s < 0 ? '-ne' : '-sw'}`, kind: 'inscription', position: V(xFace - s * 0.1, Y.yEntTop + Y.atticH * 0.84, zMid), heading: face + Math.PI });

  // ---- roof, ceiling (static)
  const xAtticBack = xFace + s * 0.9;
  const yLow = Y.yAtticTop - 0.25;
  const yHigh = Y.wall - 0.35;
  const xw = s * X.wallIn;
  const roof = new THREE.BufferGeometry();
  const za = X.zGate;
  const zb = X.zBasilica;
  const pts = [V(xAtticBack, yLow, za), V(xAtticBack, yLow, zb), V(xw, yHigh, zb), V(xw, yHigh, za)];
  const tri = s > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  roof.setAttribute('position', new THREE.Float32BufferAttribute(tri.flatMap((k) => [pts[k].x, pts[k].y, pts[k].z]), 3));
  roof.computeVertexNormals();
  main.add(roof, 'roof_tile', I, { uvScale: 2 });
  // Coffered ceiling over the walk.
  boxMinMax(main, coffersMaterial(), I, Math.min(xFace + s * 0.2, xw), Y.yEntTop - 0.12, za, Math.max(xFace + s * 0.2, xw), Y.yEntTop, zb, { castShadow: false });
  // The hidden roof space (between the ceiling and the tiles) is closed by the attic and the wall.
  boxMinMax(main, 'wood_dark', I, Math.min(xAtticBack, xw), Y.yEntTop, za, Math.max(xAtticBack, xw), Y.yEntTop + 0.05, zb, { castShadow: false });

  // Stall and vendor spots in the portico (sellers of garlands and dedication souvenirs).
  [-24, 6].forEach((z, i) => spots.push({ id: `forum-portico-${s < 0 ? 'ne' : 'sw'}-stall${i}`, kind: 'stall', position: V(s * (X.col + 3.5), Y.styl, z), heading: -face }));
}

/** Lateral back wall with the exedra opening and the exedra itself. */
function backWallAndExedra(ctx: LandmarkContext, main: MeshBuilder, chunks: LodChunks, s: -1 | 1, spots: Spot[]) {
  const Y = FORUM_Y;
  const X = FORUM_X;
  const hi = ctx.detail === 'high';
  const I = new THREE.Matrix4();
  const xi = s * X.wallIn;
  const xo = s * X.wallOut;
  const ze0 = X.exedraZ - X.exedraR; // exedra mouth (SE end)
  const ze1 = X.exedraZ + X.exedraR; // (NW end)
  const yFoot = Math.min(-0.4, ctx.groundAt(xo + s * 2, 0) - 0.4);
  // Wall pieces either side of the mouth, and the lintel wall above it.
  for (const [za, zb] of [
    [X.zGate - 0.9, ze0],
    [ze1, X.zBasilica],
  ]) {
    boxMinMax(main, 'peperino', I, Math.min(xi, xo), yFoot, za, Math.max(xi, xo), Y.wall, zb, { collide: true });
    boxMinMax(main, 'marble', I, Math.min(xi, xi - s * 0.04), Y.styl, Math.max(za, X.zGate), Math.max(xi, xi - s * 0.04), Y.yEntTop, zb);
  }
  boxMinMax(main, 'peperino', I, Math.min(xi, xo), Y.yEnt, ze0, Math.max(xi, xo), Y.wall, ze1);
  boxMinMax(main, 'marble', I, Math.min(xi, xo) - 0.03, Y.yEnt, ze0, Math.max(xi, xo) + 0.03, Y.yEntTop, ze1);
  // Travertine string course on the outside.
  boxMinMax(main, 'travertine', I, Math.min(xo, xo + s * 0.08), Y.yEntTop - 0.3, X.zGate - 0.9, Math.max(xo, xo + s * 0.08), Y.yEntTop, X.zBasilica);
  // Inner pilasters opposite the columns (outside the exedra mouth).
  const zs = divide(X.zGate + 1.2, X.zBasilica - 1.2, SPACING);
  for (const z of zs) {
    if (z > ze0 - 0.3 && z < ze1 + 0.3) continue;
    boxMinMax(main, 'marble_pavonazzetto', I, Math.min(xi, xi - s * 0.12), Y.styl, z - 0.28, Math.max(xi, xi - s * 0.12), Y.yEntTop - 0.12, z + 0.28);
  }

  // ---- the exedra: semicircle centred on the wall line
  const cx = s * (X.wallIn + X.wallOut) / 2;
  const cz = X.exedraZ;
  const R = X.exedraR;
  const tW = X.exedraT;
  const a0 = s > 0 ? -Math.PI / 2 : Math.PI / 2;
  const a1 = a0 + Math.PI;
  const segs = hi ? 40 : 16;
  arcWall(main, 'peperino', I, cx, cz, R, R + tW, a0, a1, yFoot, Y.wall, segs);
  arcWall(main, 'marble', I, cx, cz, R - 0.04, R, a0, a1, Y.styl, Y.yEntTop + 0.4, segs);
  arcColliders(main, I, cx, cz, R, R + tW, a0, a1, 0, Y.wall, 14);
  arcFloor(main, sectileMaterial(3.0), I, cx, cz, 0.001, R, a0, a1, Y.styl, segs, 0.02);
  arcFloor(main, 'marble', I, cx, cz, 0.001, R, a0, a1, Y.styl - 0.02, segs, Y.styl + 0.23);
  // Walkable floor colliders: strips clipped inside the semicircle, reaching back under the wall
  // opening to meet the portico's stylobate.
  const strips = 7;
  const back = Math.abs(cx) - X.wallIn + 0.05;
  for (let k = 0; k < strips; k++) {
    const zA = cz - R + (2 * R * k) / strips;
    const zB = zA + (2 * R) / strips;
    const zFar = Math.abs(zA - cz) > Math.abs(zB - cz) ? zA : zB;
    const reach = Math.sqrt(Math.max(0, R * R - (zFar - cz) ** 2)) - 0.05;
    solidBox(main, I, cx + (s * (reach - back)) / 2, (Y.styl - 0.25) / 2, (zA + zB) / 2, reach + back, Y.styl + 0.25, zB - zA);
  }
  // Coping on the exedra wall.
  arcWall(main, 'travertine', I, cx, cz, R - 0.05, R + tW + 0.05, a0, a1, Y.wall, Y.wall + 0.18, segs);
  // Screen of columns across the mouth.
  const D = FORUM_Y.D;
  const screen = divide(ze0 + 1.3, ze1 - 1.3, 3.1);
  const ck = chunks.chunk(`exedra${s}`, V(cx, 6, cz));
  for (const z of screen) {
    colonnadeColumn(ck.near, 'low', { order: 'corinthian', D, height: Y.colH, shaft: 'marble_giallo', trim: 'marble' }, T(cx, Y.styl, z));
    farColumn(ck.far, { D, height: Y.colH, shaft: 'marble_giallo' }, T(cx, Y.styl, z));
  }
  // Niches round the curve: two tiers of aediculae with statues of Trajan's generals and the
  // great men of the Dacian wars (lower) and trophies (upper).
  const nN = 5;
  for (let k = 0; k < nN; k++) {
    const a = a0 + ((k + 0.5) / nN) * Math.PI;
    const nx = Math.cos(a);
    const nz = Math.sin(a);
    const px = cx + nx * (R - 0.02);
    const pz = cz + nz * (R - 0.02);
    // Facing the centre: rotation turning −z into (−nx, −nz).
    const rot = Math.atan2(nx, nz);
    const at = TRS(px, Y.styl, pz, 0, rot, 0);
    // dark recess panel + frame
    ck.near.box('marble_veined', 1.5, 3.1, 0.06, mul(at, T(0, 1.75, -0.03)));
    ck.near.box('marble', 1.75, 0.18, 0.3, mul(at, T(0, 3.35, -0.12)));
    for (const sx of [-1, 1]) ck.near.box('marble_giallo', 0.18, 3.1, 0.2, mul(at, T(sx * 0.82, 1.65, -0.1)));
    statueBase(ck.near, mul(at, T(0, 0, -0.75)), { w: 0.9, d: 0.7, h: 0.9, detail: 'low' });
    (k % 2 ? togate : armoredEmperor)(ck.near, mul(at, T(0, 0.9, -0.75)), { material: 'bronze', scale: 1.05, detail: 'low', plinth: false });
    // upper tier: shield portrait
    clipeus(ck.near, mul(at, T(0, 5.6, -0.08)), 0.5, { detail: 'low' });
    ck.far.box('marble_veined', 1.5, 3.1, 0.06, mul(at, T(0, 1.75, -0.03)));
  }
  // Benches round the curve and the teacher's chair: the exedrae double as lecture halls.
  for (let k = 0; k < 5; k++) {
    const a = a0 + ((k + 0.5) / 5) * Math.PI;
    const r = R - 3.4;
    const px = cx + Math.cos(a) * r;
    const pz = cz + Math.sin(a) * r;
    const rot = Math.atan2(Math.cos(a), Math.sin(a));
    const at = TRS(px, Y.styl, pz, 0, rot, 0);
    main.box('marble', 2.6, 0.45, 0.55, mul(at, T(0, 0.225, 0)), { collide: true });
    spots.push({ id: `forum-exedra${s < 0 ? 'ne' : 'sw'}-bench${k}`, kind: 'sit', position: V(px, Y.styl + 0.45, pz), heading: rot + Math.PI });
  }
  spots.push({ id: `forum-exedra${s < 0 ? 'ne' : 'sw'}-teacher`, kind: 'npc', position: V(cx + s * (R - 1.5), Y.styl, cz), heading: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
}

/** SE enclosure wall either side of the gateway opening. */
function gateWall(ctx: LandmarkContext, main: MeshBuilder, spots: Spot[]) {
  const Y = FORUM_Y;
  const X = FORUM_X;
  const I = new THREE.Matrix4();
  const zi = X.zGate; // inner face (towards +z)
  const zo = X.zGate - 0.9;
  const yFoot = Math.min(-0.4, ctx.groundAt(0, zo - 3) - 0.4);
  for (const sx of [-1, 1]) {
    const xa = sx * X.gateHalf;
    const xb = sx * X.wallOut;
    boxMinMax(main, 'peperino', I, Math.min(xa, xb), yFoot, zo, Math.max(xa, xb), Y.wall, zi, { collide: true });
    // Inner face: marble revetment, pilasters, cornice at the portico entablature line.
    const x0 = Math.min(xa, sx * X.stylEdge);
    const x1 = Math.max(xa, sx * X.stylEdge);
    boxMinMax(main, 'marble', I, x0, 0, zi, x1, Y.wall - 0.6, zi + 0.04);
    for (const x of divide(x0 + 1.2, x1 - 1.2, 3.2)) boxMinMax(main, 'marble_pavonazzetto', I, x - 0.3, 0, zi, x + 0.3, Y.yEntTop - 0.1, zi + 0.14);
    boxMinMax(main, 'marble', I, x0, Y.yEnt, zi, x1, Y.yEntTop, zi + 0.35);
    boxMinMax(main, 'marble', I, x0, Y.wall - 0.6, zi, x1, Y.wall, zi + 0.3);
    // Two statue niches in each half, with bronze statues of the Dacian war generals.
    for (const k of [0.33, 0.7]) {
      const x = x0 + (x1 - x0) * k;
      const at = TRS(x, 0, zi + 0.02, 0, Math.PI, 0);
      main.box('marble_veined', 1.6, 3.2, 0.05, mul(at, T(0, 2.4, 0)));
      main.box('marble', 2.0, 0.2, 0.35, mul(at, T(0, 4.1, -0.15)));
      statueBase(main, mul(at, T(0, 0, -0.6)), { w: 1.0, d: 0.8, h: 1.1, detail: 'low' });
      armoredEmperor(main, mul(at, T(0, 1.1, -0.6)), { material: 'bronze', scale: 1.1, detail: 'low', plinth: false });
    }
    // Outer face: travertine string course.
    boxMinMax(main, 'travertine', I, Math.min(xa, xb), Y.yEntTop - 0.3, zo - 0.08, Math.max(xa, xb), Y.yEntTop, zo);
  }
  // Garland along the inner face, either side of the opening.
  for (const sx of [-1, 1]) {
    const xs = divide(sx * (X.gateHalf + 1), sx * (X.stylEdge - 1), 3.2);
    for (let i = 0; i < xs.length - 1; i++) garland(main, I, V(xs[i], Y.yEnt - 0.2, X.zGate + 0.3), V(xs[i + 1], Y.yEnt - 0.2, X.zGate + 0.3), 0.8, 0.09, true, 7);
  }
  spots.push({ id: 'forum-spawn-gateway', kind: 'spawn', position: V(0, 0, X.zGate + 5), heading: 0 });
}

/** Square paving, honorific statues and the festive preparations. */
function square(ctx: LandmarkContext, main: MeshBuilder, spots: Spot[]) {
  const X = FORUM_X;
  const I = new THREE.Matrix4();
  const hi = ctx.detail === 'high';
  const xEdge = X.stepFoot;
  boxMinMax(main, slabPavingMaterial(), I, -xEdge, -0.25, X.zGate, xEdge, 0.03, X.zBasilica, { collide: true });
  // Drain channel along the foot of the steps (a thin dark line reads well from above).
  for (const sx of [-1, 1]) boxMinMax(main, 'basalt', I, sx * (xEdge - 0.25), 0.0, X.zGate, sx * (xEdge - 0.05), 0.032, X.zBasilica, { castShadow: false });

  // Honorific statues along the steps: generals of the Dacian wars on inscribed bases.
  const names = [TRAJAN_INSCRIPTIONS['forum-statue-senecio'], TRAJAN_INSCRIPTIONS['forum-statue-palma']];
  const zs = [-24, -10, 14];
  for (const sx of [-1, 1]) {
    zs.forEach((z, i) => {
      const at = TRS(sx * (xEdge - 1.8), 0.03, z, 0, sx * (Math.PI / 2), 0);
      const named = i === 1 ? names[sx < 0 ? 0 : 1] : undefined;
      honorificStatue(main, at, i % 2 ? 'togate' : 'armored', {
        scale: 1.2,
        detail: 'low',
        base: { w: 1.2, d: 1.0, h: 1.7, lines: named?.latin, detail: hi ? 'high' : 'low' },
      });
      if (named) spots.push({ id: sx < 0 ? 'forum-statue-senecio' : 'forum-statue-palma', kind: 'inscription', position: V(sx * (xEdge - 1.8) + sx * -0.5, 0.95, z), heading: sx * (Math.PI / 2) + Math.PI });
    });
  }

  // ---- the dedication: tribunal, altar, tripods, carpet, grandstands, banners
  const zT = 25; // tribunal centre, in front of the basilica's central porch
  const trib = tribunal(main, T(0, 0.03, zT), { w: 8, d: 5, h: 1.6, detail: ctx.detail });
  trib.places.forEach((p, i) => spots.push({ id: `forum-tribunal-${['consul', 'praetor', 'herald'][i]}`, kind: 'npc', position: p.clone().add(V(0, 0.03, zT)), heading: Math.PI }));
  altar(main, T(0, 0.03, zT - 9));
  spots.push({ id: 'forum-altar', kind: 'shrine', position: V(0, 0.03, zT - 10.2), heading: 0 });
  for (const sx of [-1, 1]) tripod(main, T(sx * 2.2, 0.03, zT - 8.4));
  carpet(main, T(0, 0.03, zT - 5.8), 2.4, 5.2, 'fabric_red');
  const standLen = 15;
  for (const sx of [-1, 1]) {
    const at = TRS(sx * 17.5, 0.03, 15, 0, sx * (Math.PI / 2), 0);
    const g = grandstand(main, at, { length: standLen, tiers: 5, detail: ctx.detail });
    const tmp = new THREE.Vector3();
    g.seats.forEach((p, i) => {
      if (i % 3) return;
      tmp.copy(p).applyMatrix4(at);
      spots.push({ id: `forum-stand${sx < 0 ? 'ne' : 'sw'}-seat${i}`, kind: 'sit', position: tmp.clone(), heading: sx * (Math.PI / 2) + Math.PI });
    });
  }
  for (const z of [-30, -18, -6, 6]) for (const sx of [-1, 1]) banner(main, T(sx * 4.5, 0.03, z), 5.5, z % 12 === 0 ? 'fabric_purple' : 'fabric_red');
  for (const sx of [-1, 1]) banner(main, T(sx * 4.6, 0.03, zT - 2.2), 6.5, 'fabric_purple');
  // Last-minute work: ladders against the SW portico, crates and marble offcuts by the NE one.
  ladder(main, TRS(X.stylEdge - 0.2, FORUM_Y.styl, -12.5, 0, -Math.PI / 2, 0), 5.2, 0.9);
  ladder(main, TRS(-X.stylEdge + 0.2, FORUM_Y.styl, 18.7, 0, Math.PI / 2, 0), 5.2, 0.9);
  workClutter(main, TRS(-(xEdge - 4.5), 0.03, -31, 0, 0.4, 0), 3);
  spots.push({ id: 'forum-work-chest', kind: 'container', position: V(-(xEdge - 4.5), 0.03, -31), heading: 0 });
  // Vendors of garlands and incense just inside the gateway; guards at the opening.
  spots.push({ id: 'forum-vendor-garlands', kind: 'vendor', position: V(-6.5, 0.03, X.zGate + 6), heading: Math.PI / 2 });
  spots.push({ id: 'forum-vendor-incense', kind: 'vendor', position: V(6.5, 0.03, X.zGate + 6), heading: -Math.PI / 2 });
  for (const sx of [-1, 1]) spots.push({ id: `forum-guard-gate${sx < 0 ? 'ne' : 'sw'}`, kind: 'npc', position: V(sx * 6, 0.03, X.zGate + 1.8), heading: 0 });
  spots.push({ id: 'forum-vista-square', kind: 'vista', position: V(0, 0.03, -20), heading: 0 });
}

/** Cheap massing for distances beyond the cull distance. */
function farMassing(ctx: LandmarkContext): THREE.Object3D {
  const Y = FORUM_Y;
  const X = FORUM_X;
  const b = ctx.builder();
  const I = new THREE.Matrix4();
  b.box('paving_travertine', 2 * X.wallOut, 0.1, X.zBasilica - X.zGate, T(0, 0.05, 0));
  for (const s of [-1, 1]) {
    boxMinMax(b, 'peperino', I, Math.min(s * X.wallIn, s * X.wallOut), 0, X.zGate, Math.max(s * X.wallIn, s * X.wallOut), Y.wall, X.zBasilica);
    boxMinMax(b, 'marble', I, Math.min(s * X.stylEdge, s * X.wallIn), 0, X.zGate, Math.max(s * X.stylEdge, s * X.wallIn), Y.yAtticTop, X.zBasilica);
    boxMinMax(b, 'roof_tile', I, Math.min(s * (X.col + 1), s * X.wallIn), Y.yAtticTop, X.zGate, Math.max(s * (X.col + 1), s * X.wallIn), Y.yAtticTop + 1.5, X.zBasilica);
    const cx = (s * (X.wallIn + X.wallOut)) / 2;
    const a0 = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    arcWall(b, 'peperino', I, cx, X.exedraZ, X.exedraR, X.exedraR + X.exedraT, a0, a0 + Math.PI, 0, Y.wall, 8);
  }
  for (const sx of [-1, 1]) boxMinMax(b, 'peperino', I, Math.min(sx * X.gateHalf, sx * X.wallOut), 0, X.zGate - 0.9, Math.max(sx * X.gateHalf, sx * X.wallOut), Y.wall, X.zGate);
  return b.build('forum-trajan:far');
}

export const builders: LandmarkBuilder[] = [
  {
    handles: ['forum-trajan'],
    build(ctx) {
      const main = ctx.builder();
      const chunks = new LodChunks(ctx.detail === 'high' ? 60 : 40);
      const spots: Spot[] = [];
      for (const s of [-1, 1] as const) {
        portico(ctx, main, chunks, s, spots);
        backWallAndExedra(ctx, main, chunks, s, spots);
      }
      gateWall(ctx, main, spots);
      square(ctx, main, spots);
      const colliders = [...main.colliders];
      const group = new THREE.Group();
      group.add(main.build('forum-trajan'));
      group.add(chunks.build('forum-trajan:lod', colliders));
      return { object: group, colliders, spots, far: farMassing(ctx), cullDistance: 900 };
    },
  },
];
