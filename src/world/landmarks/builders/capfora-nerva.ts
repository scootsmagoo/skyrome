/**
 * Forum of Nerva (Forum Transitorium), its Temple of Minerva and the Subura district anchor —
 * capfora crew.
 *
 * The forum is a long, narrow passage-forum laid over the Argiletum, squeezed between the Forum of
 * Augustus (whose SE portico wall is its NW wall, and whose SE exedra bulges into it) and the
 * Templum Pacis. It has no free colonnade: Corinthian columns stand 1.75 m in front of the
 * peperino walls (the "colonnacce"), each carrying a block of entablature that breaks forward over
 * it; the frieze shows women's crafts and Minerva punishing Arachne, the attic Minerva in panels.
 * Its SW end follows the back of the Basilica Paulli and opens to the Argiletum; its NE end is
 * closed by the Temple of Minerva and the horseshoe court (porticus absidata) through which the
 * Argiletum leaves for the Subura.
 */
import * as THREE from 'three';
import { column } from '../../../arch/classical/column';
import { entablature } from '../../../arch/classical/entablature';
import { columnDims } from '../../../arch/classical/orders';
import { plainArch } from '../../../arch/classical/arch';
import { templeLayout } from '../../../arch/classical/temple';
import { T, TRS, mul } from '../../../arch/common/geom';
import { stairs, stepCount } from '../../../arch/common/stairs';
import { Draw } from '../../../arch/fabric/draw';
import { compitalShrine } from '../../../arch/fabric/shrines';
import { lacus } from '../../../arch/fabric/fountain';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext } from '../types';
import { AUGUSTUS } from './capfora-augustus';
import { makeLandmark, type Detail } from './capfora/build';
import { exedraWall } from './capfora/exedra';
import { farColonnade, farWall, templeFar } from './capfora/far';
import { S, landmark, relMatrix, sharedFloor, spotAt, type CapSpot } from './capfora/frame';
import { box, figure, footing, friezeStrip, groundMin, inscription, span } from './capfora/ornament';
import { PAINT, friezeRelief, minervaRelief, paint } from './capfora/paint';
import { capTemple } from './capfora/temple';

const FLOOR_ABOVE_PAD = 0.7; // clears the Templum Pacis pad that rises 0.6 m along the SE wall
const floorY = (ctx: LandmarkContext) => sharedFloor(ctx, 'forum-nerva', FLOOR_ABOVE_PAD);

/** Plan of the Forum of Nerva in REAL metres (local frame, facade −z = SW). */
const NERVA = {
  /** Inner faces of the long walls: SE (own wall) and NW (the Forum of Augustus' wall). */
  xSE: -21.3,
  xNW: 18.1,
  wallT: 1.2,
  /** Colonnacce stand this far in front of the walls (axes). */
  off: 1.75,
  /** NE end (chord of the horseshoe court, behind the temple). */
  zNE: 80.5,
  /** The back of the Basilica Paulli: z = a + k (x − x0), kept 1.5 m clear. */
  sw: { a: -73.7, k: -0.305, x0: 17.9 },
  /** Opening of the SW end for the Argiletum (x range). */
  swOpen: [2, 18.1] as [number, number],
  /** Horseshoe court. */
  horseshoe: { cx: -2.3, R: 15.2, t: 1.2 },
  colH: 10,
  colD: 1.0,
  axial: 5.8,
};

const zSW = (x: number) => NERVA.sw.a + NERVA.sw.k * (x - NERVA.sw.x0);

// ------------------------------------------------------------------ the forum

function buildForum(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const g = ctx.groundAt;
  const I = new THREE.Matrix4();
  const Y0 = floorY(ctx);
  const N = NERVA;
  const xSE = N.xSE * S;
  const xNW = N.xNW * S;
  const zNE = N.zNE * S;
  const t = N.wallT * S;
  const swz = (x: number) => zSW(x / S) * S;
  const gWide = groundMin(g, xSE - 4, swz(xSE) - 4, xNW + 4, zNE + 4);

  // ---- floor: white marble over a foundation, polygon with the oblique SW end
  {
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      // The oblique SW end is approximated by slabs stepped across the width.
      const x0 = xSE + ((xNW - xSE) * i) / steps;
      const x1 = xSE + ((xNW - xSE) * (i + 1)) / steps;
      const z0 = Math.max(swz(x0), swz(x1));
      span(b, 'travertine', x0, Math.min(-0.3, gWide - 0.3), z0, x1, Y0 - 0.04, zNE, I, true);
      span(b, 'paving_travertine', x0, Y0 - 0.04, z0, x1, Y0, zNE, I);
    }
  }

  // ---- the Forum of Augustus next door: its SE exedra (bulging into this forum) and the door.
  const aug = relMatrix(ctx, 'forum-augustus');
  const exC = new THREE.Vector3(-AUGUSTUS.exedra.cx * S, 0, AUGUSTUS.exedra.cz * S).applyMatrix4(aug);
  const exR = (AUGUSTUS.exedra.R + AUGUSTUS.exedra.t) * S + 0.6;
  const augDoor = new THREE.Vector3(-AUGUSTUS.halfW * S, 0, AUGUSTUS.nervaDoorZ * S).applyMatrix4(aug);
  const augFront = new THREE.Vector3(-AUGUSTUS.halfW * S, 0, -AUGUSTUS.halfD * S).applyMatrix4(aug);
  // Opening towards the SE end of the Forum of Caesar (on its axis).
  const cae = relMatrix(ctx, 'forum-caesar');
  const caeAxis = new THREE.Vector3().setFromMatrixPosition(relMatrix({ game: ctx.game, lm: landmark('forum-caesar') }, 'temple-venus-genetrix'));
  const caeDoor = new THREE.Vector3(caeAxis.x, 0, -80 * S).applyMatrix4(cae);

  // ---- walls: SE (own, peperino with a marble skin), NW (own only SW of the Forum of Augustus)
  const wallTop = Y0 + 10.6;
  const yb = Math.min(-0.6, gWide - 0.4);
  const zS = swz(xSE);
  // SE wall, with a door through to the Templum Pacis.
  const pacis = relMatrix(ctx, 'templum-pacis');
  const pDoor = new THREE.Vector3(0, 0, -67.5 * S).applyMatrix4(pacis);
  const pacisDoorZ = Math.min(zNE - 4, Math.max(zS + 4, pDoor.z));
  const seSegs: [number, number][] = [
    [zS, pacisDoorZ - 2.0],
    [pacisDoorZ + 2.0, zNE],
  ];
  for (const [a, c] of seSegs) {
    span(b, 'peperino', xSE - t, yb, a, xSE, wallTop, c, I, true);
    span(b, 'marble_veined', xSE - 0.02, Y0, a, xSE + 0.03, wallTop - 0.3, c, I);
  }
  span(b, 'peperino', xSE - t, Y0 + 4.2, pacisDoorZ - 2.0, xSE, wallTop, pacisDoorZ + 2.0, I);
  for (const dz of [-1.45, 1.45]) span(b, 'travertine', xSE - 0.02, Y0, pacisDoorZ + dz - 0.12, xSE + 0.12, Y0 + 4.3, pacisDoorZ + dz + 0.12, I);
  spots.push(spotAt('door-pacis', 'door', xSE + 1.6, Y0, pacisDoorZ, xSE - 2, pacisDoorZ, { label: 'Passage to the Templum Pacis' }));
  // NW wall where the Forum of Augustus does not reach (SW of its front wall), with the opening to
  // the Forum of Caesar.
  const zAug = Math.min(zNE, augFront.z + 0.6);
  const zc = Math.min(zAug - 3, Math.max(swz(xNW) + 3, caeDoor.z));
  const nwSegs: [number, number][] = [
    [swz(xNW), zc - 2.8],
    [zc + 2.8, zAug],
  ];
  for (const [a, c] of nwSegs) {
    if (c - a < 0.2) continue;
    span(b, 'peperino', xNW, yb, a, xNW + t, wallTop, c, I, true);
    span(b, 'marble_veined', xNW - 0.03, Y0, a, xNW + 0.02, wallTop - 0.3, c, I);
  }
  span(b, 'peperino', xNW, Y0 + 5.0, zc - 2.8, xNW + t, wallTop, zc + 2.8, I);
  spots.push(spotAt('door-caesar', 'door', xNW - 1.6, Y0, zc, xNW + 2, zc, { label: 'Steps up to the Forum of Caesar' }));
  spots.push(spotAt('door-augustus', 'door', xNW - 1.6, Y0, augDoor.z, xNW + 2, augDoor.z, { label: 'Door to the Forum of Augustus' }));

  // ---- the colonnacce
  const H = N.colH * S;
  const D = N.colD * S;
  const dims = columnDims('corinthian', D, H);
  const off = N.off * S;
  const relief = friezeRelief('arachne');
  const yE = Y0 + H;
  let entTop = yE;
  const runs: { x: number; dir: 1 | -1; skip: [number, number][] }[] = [
    { x: xSE, dir: 1, skip: [[pacisDoorZ - 2.2, pacisDoorZ + 2.2]] },
    { x: xNW, dir: -1, skip: [] },
  ];
  // NW side: keep clear of the exedra and of the doors.
  {
    const cx = xNW - off;
    const dx = Math.abs(cx - exC.x);
    if (dx < exR) {
      const h = Math.sqrt(exR * exR - dx * dx);
      runs[1].skip.push([exC.z - h, exC.z + h]);
    }
    runs[1].skip.push([augDoor.z - 2.0, augDoor.z + 2.0]);
  }
  const zMin = (x: number) => swz(x) + 1.2;
  const minerva = minervaRelief();
  for (const r of runs) {
    const colX = r.x + r.dir * off;
    const z0 = zMin(r.x);
    const z1 = zNE - 1.0;
    const n = Math.max(1, Math.round((z1 - z0) / (N.axial * S)));
    const ax = (z1 - z0) / n;
    // Continuous entablature along the wall face, its frieze carved with the crafts and Arachne.
    const pathDir = r.dir > 0 ? 1 : -1; // travel +z for an interior towards +x
    const wallFace = r.x + r.dir * 0.02;
    const pts = pathDir > 0 ? [new THREE.Vector3(wallFace, yE, z0), new THREE.Vector3(wallFace, yE, z1)] : [new THREE.Vector3(wallFace, yE, z1), new THREE.Vector3(wallFace, yE, z0)];
    // The stretch behind the exedra has no colonnade: the wall entablature skips it too.
    const pieces = splitRange(z0, z1, r.skip);
    for (const [pa, pb] of pieces) {
      const p = pathDir > 0 ? [new THREE.Vector3(wallFace, yE, pa), new THREE.Vector3(wallFace, yE, pb)] : [new THREE.Vector3(wallFace, yE, pb), new THREE.Vector3(wallFace, yE, pa)];
      const ent = entablature(b, p, { order: 'corinthian', columnHeight: H, D, material: 'marble', detail, depth: 0.3, axial: ax }, { caps: true });
      entTop = yE + ent.dims.total;
      // Frieze relief strip on the wall entablature.
      const fh = ent.dims.frieze * 0.9;
      const fy = yE + ent.dims.architrave + ent.dims.frieze * 0.05;
      const fx = wallFace + r.dir * (ent.friezeX + 0.015);
      const at = mul(I, TRS(fx, 0, 0, 0, r.dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0));
      // The strip's local x runs along +z when it faces +x, along −z when it faces −x.
      if (r.dir > 0) friezeStrip(b, relief, pa, pb, fy, fh, fh * 8, at);
      else friezeStrip(b, relief, -pb, -pa, fy, fh, fh * 8, at);
    }
    void pts;
    for (let k = 0; k <= n; k++) {
      const z = z0 + k * ax;
      if (r.skip.some(([a, c]) => z > a - 0.8 && z < c + 0.8)) continue;
      column(b, { order: 'corinthian', D, height: H, fluted: true, material: 'marble', detail: 'low' }, T(colX, Y0, z));
      // Ressaut: a block of entablature breaking forward over the column, back to the wall.
      const w = dims.plinth * 1.05;
      const front = colX + r.dir * (dims.d / 2);
      const depth = Math.abs(front - r.x) + 0.1;
      const p = pathDir > 0 ? [new THREE.Vector3(front, yE, z - w / 2), new THREE.Vector3(front, yE, z + w / 2)] : [new THREE.Vector3(front, yE, z + w / 2), new THREE.Vector3(front, yE, z - w / 2)];
      const ent = entablature(b, p, { order: 'corinthian', columnHeight: H, D, material: 'marble', detail, depth, axial: ax }, { caps: true });
      const fh = ent.dims.frieze * 0.9;
      const fy = yE + ent.dims.architrave + ent.dims.frieze * 0.05;
      const fx = front + r.dir * (ent.friezeX + 0.015);
      const at = mul(I, TRS(fx, 0, z, 0, r.dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0));
      friezeStrip(b, relief, -w / 2 + 0.05, w / 2 - 0.05, fy, fh, fh * 8, at);
      // Attic pedestal above the ressaut with a relief panel of Minerva.
      const ah = 2.4;
      const ay = yE + ent.dims.total;
      const pz = z;
      box(b, 'marble', (r.x + front) / 2 + r.dir * 0.05, ay + ah / 2, pz, Math.abs(front - r.x) + 0.1, ah, w * 0.92, I);
      box(b, 'marble', (r.x + front) / 2 + r.dir * 0.1, ay + ah + 0.12, pz, Math.abs(front - r.x) + 0.3, 0.24, w * 1.02, I);
      if (detail === 'high') {
        const pw = w * 0.78;
        const ph = ah * 0.8;
        const geo = new THREE.PlaneGeometry(pw, ph);
        geo.rotateY(r.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        geo.translate(front + r.dir * 0.11, ay + ah / 2, pz);
        b.add(geo, minerva, I, { uv: 'keep', castShadow: false });
      }
    }
    // Attic wall between the pedestals.
    span(b, 'marble', r.dir > 0 ? r.x : r.x - 0.5, entTop - 0.1, z0, r.dir > 0 ? r.x + 0.5 : r.x, entTop + 2.0, z1, I);
  }

  // ---- SW end: wall along the back of the Basilica Paulli, open to the Argiletum on the right
  {
    const xo0 = N.swOpen[0] * S;
    const segX: [number, number] = [xSE - t, xo0];
    const a = new THREE.Vector3(segX[0], 0, swz(segX[0]) - 0.6);
    const c = new THREE.Vector3(segX[1], 0, swz(segX[1]) - 0.6);
    const len = a.distanceTo(c);
    const ry = Math.atan2(-(c.z - a.z), c.x - a.x);
    const m = mul(I, TRS((a.x + c.x) / 2, (yb + wallTop) / 2, (a.z + c.z) / 2, 0, ry, 0));
    b.box('peperino', len, wallTop - yb, t, m, { collide: true });
    // Steps down to the Argiletum outside the opening.
    const gOut = Math.min(0, groundMin(g, xo0, swz(xNW) - 6, xNW, swz(xo0) - 2));
    if (Y0 - gOut > 0.15) {
      const { count, rise } = stepCount(Y0 - gOut, 0.19);
      const w = xNW - xo0 - 0.4;
      const zf = Math.min(swz(xo0), swz(xNW));
      stairs(b, { width: w, rise, run: 0.36, count, material: 'travertine' }, T((xo0 + xNW) / 2, gOut, zf - count * 0.36));
      footing(b, 'travertine', g, xo0, zf - count * 0.36, xNW, zf, gOut, I, false);
    }
    spots.push(spotAt('entrance-argiletum', 'spawn', (xo0 + xNW) / 2, Y0, swz((xo0 + xNW) / 2) + 2, (xo0 + xNW) / 2, 20, { label: 'Forum Transitorium (from the Argiletum)' }));
    spots.push(spotAt('bookseller', 'vendor', xNW - 1.5, Y0, swz(xNW) + 5, xNW - 6, swz(xNW) + 5, { label: 'Bookseller of the Argiletum (Martial in stock)' }));
  }

  // ---- NE end: chord wall behind the temple with passages either side, and the horseshoe court
  {
    const hs = N.horseshoe;
    const cx = hs.cx * S;
    const R = hs.R * S;
    const tw = (21 * S) / 2; // temple half-width
    const tmp = relMatrix(ctx, 'temple-minerva-nerva');
    const tx = new THREE.Vector3().setFromMatrixPosition(tmp).x;
    // Chord wall behind the temple only.
    span(b, 'peperino', tx - tw, yb, zNE - 0.2, tx + tw, wallTop, zNE + t * 0.6, I, true);
    // Short returns from the long walls to the horseshoe.
    span(b, 'peperino', xSE - t, yb, zNE - 0.2, cx - R - 0.1, wallTop, zNE + t * 0.6, I, true);
    span(b, 'peperino', cx + R + 0.1, yb, zNE - 0.2, xNW + t, wallTop, zNE + t * 0.6, I, true);
    // Court floor and walls with the gate at the apex.
    const at = mul(I, T(cx, Y0, zNE));
    const gate = Math.asin(Math.min(0.9, 2.0 / R));
    exedraWall(b, { R, thickness: hs.t * S, height: wallTop - Y0, chord: 0, floorY: 0, material: 'peperino', innerMaterial: 'marble', detail, roof: false, gaps: [[-gate, gate]], base: yb - Y0, niches: detail === 'high' ? { count: 8, rows: [{ sill: 0.9, height: 2.6, width: 1.1 }] } : undefined }, at);
    // The gate arch towards the Subura.
    const gAt = mul(at, TRS(0, 0, R + (hs.t * S) / 2, 0, 0, 0));
    plainArch(b, { span: 3.6, height: 5.6, pier: 1.0, depth: hs.t * S + 0.4, material: 'travertine', detail, cornice: true }, gAt);
    spots.push(spotAt('gate-subura', 'door', cx, Y0, zNE + R - 1.5, cx, zNE + R + 3, { label: 'The Argiletum, on into the Subura' }));
    spots.push(spotAt('porticus-absidata', 'npc', cx - 4, Y0, zNE + R * 0.5, cx, zNE + R * 0.5, { label: 'Porticus Absidata: porters resting' }));
  }

  // ---- things to look at
  spots.push(
    spotAt('arachne-frieze', 'inscription', xSE + 4, Y0, 0, xSE, 0, {
      label: 'The frieze of Arachne',
      text: 'MINERVA · ARACHNE',
      gloss: "Women spin, weave and card wool under Minerva's eye; in one panel the goddess punishes Arachne, the Lydian weaver who dared to challenge her (Ovid, Met. 6). Domitian's favourite goddess presides over his forum, finished by Nerva.",
    }),
  );
  spots.push(spotAt('passers-by', 'npc', 0, Y0, -20, 0, 20, { label: 'Traffic of the Argiletum crossing the forum' }));
}

function splitRange(a: number, b: number, skip: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let x = a;
  for (const [s0, s1] of [...skip].sort((p, q) => p[0] - q[0])) {
    if (s1 < x || s0 > b) continue;
    if (s0 > x + 0.5) out.push([x, s0]);
    x = Math.max(x, s1);
  }
  if (b > x + 0.5) out.push([x, b]);
  return out;
}

// ------------------------------------------------------------------ the Temple of Minerva

const MIN_SPEC = {
  order: 'corinthian' as const,
  plan: 'prostyle' as const,
  front: 6,
  sides: 7,
  width: 21 * S,
  intercolumniation: 'systyle' as const,
  podiumHeight: 4 * S,
  material: 'marble' as MaterialId,
  podiumMaterial: 'marble' as MaterialId,
  pitchDeg: 13.5,
};

function buildMinerva(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const Y0 = floorY(ctx);
  const spec = { ...MIN_SPEC, detail };
  const L = templeLayout(spec);
  // Back of the cella against the horseshoe's chord (forum z 80.5 ↔ +17.1 here).
  const dz = 16.6 * S - L.stylobate.z1;
  const at = T(0, Y0, dz);
  footing(b, 'travertine', ctx.groundAt, L.stylobate.x0, L.stairs.z0 + dz, L.stylobate.x1, L.stylobate.z1 + dz, Y0, undefined, false);
  const res = capTemple(
    b,
    {
      ...spec,
      roofMaterial: 'roof_tile',
      tympanum: paint(PAINT.blue, 0.85),
      frieze: friezeRelief('garland'),
      interior: true,
      hiColumns: 'front',
      apse: 0.7,
      furnish: (bb, info) => {
        const zc = info.z1 - ((info.x1 - info.x0) / 2) * 0.7 - 0.05;
        const y = info.y + 0.9;
        // Minerva: helmeted, aegis, spear and shield, owl at her feet.
        figure(bb, 'draped', mul(info.at, TRS(0, y, zc + 0.6, 0, 0, 0)), { scale: 2.4, material: 'marble', detail: info.detail });
        box(bb, 'marble', 0, y + 4.0, zc + 0.55, 0.32, 0.22, 0.32, info.at);
        box(bb, 'gilded_bronze', 0.85, y + 2.5, zc + 0.5, 0.05, 5.0, 0.05, info.at);
        const sh = new THREE.CylinderGeometry(0.75, 0.75, 0.08, 16);
        sh.rotateX(Math.PI / 2);
        sh.translate(-0.85, y + 1.0, zc + 0.3);
        bb.add(sh, 'gilded_bronze', info.at);
        box(bb, 'bronze', 0.5, y + 0.2, zc - 0.4, 0.25, 0.4, 0.25, info.at);
      },
    },
    at,
  );
  // Nerva's dedication on the architrave (CIL VI 953, copied before the temple was pulled down in 1606).
  const archY = Y0 + L.podiumHeight + L.H + 0.3;
  const text = inscription(b, ['IMP NERVA CAESAR AVG PONT MAX TRIB POTEST II IMP II PROCOS COS III P P AEDEM MINERVAE FECIT'], L.spanX * 0.92, 0.36, mul(at, T(0, archY, L.entablature.z0 - 0.03)), 'bronze');
  const sf = res.stairFoot.clone().add(new THREE.Vector3(0, Y0, dz));
  spots.push(
    spotAt('dedication', 'inscription', 0, Y0, sf.z - 5, 0, sf.z, {
      label: 'Dedication of the Temple of Minerva',
      text,
      gloss: 'The Emperor Nerva Caesar Augustus, pontifex maximus, in his second year of tribunician power, twice hailed imperator, proconsul, three times consul, father of his country, built the temple of Minerva (AD 97).',
    }),
  );
  spots.push(spotAt('altar', 'shrine', 0, Y0, sf.z - 1.5, 0, sf.z + 5, { label: 'Altar of Minerva' }));
  if (res.interior) spots.push(spotAt('cult-statue', 'shrine', 0, res.interior.y + Y0, res.interior.z1 + dz - 5, 0, res.interior.z1 + dz, { label: 'Minerva, patron of crafts' }));
}

// ------------------------------------------------------------------ the Subura (district anchor)

function buildSubura(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  // Nothing big: the Subura is filled by the city fabric. Its anchor is a crossroads with the
  // compitum of the Lares (a vicus shrine), a public basin and a painted notice.
  const rng = ctx.rng;
  const d = new Draw(b);
  footing(b, 'basalt', ctx.groundAt, -3.5, -3.5, 3.5, 3.5, 0.02, undefined, true);
  compitalShrine(d.at(0, 0.02, 1.4, 0), rng.fork('compitum'));
  const fills = lacus(d.at(-3.0, 0.02, -1.0, Math.PI / 2), rng.fork('lacus'));
  void fills;
  // A notice board on two posts beside the shrine.
  for (const x of [1.9, 3.3]) box(b, 'wood_dark', x, 1.0, -0.2, 0.12, 2.0, 0.12, undefined, true);
  const text = inscription(b, ['VICVS · SVBVRANVS', 'MAG · VICI · LARIBVS · AVGVSTIS'], 1.6, 0.6, T(2.6, 1.55, -0.3), 'painted', { ground: '#efe6d2', ink: '#a3271f' });
  spots.push(spotAt('compitum', 'shrine', 0, 0.02, -1.2, 0, 1.4, { label: 'Compitum of the Lares (vicus shrine)' }));
  spots.push(spotAt('vicomagister', 'npc', 1.4, 0.02, -1.6, 0, 0, { label: 'The vicomagister of the Subura' }));
  spots.push(spotAt('lacus', 'shrine', -3.0, 0.02, -2.6, -3.0, -1.0, { label: 'Public basin' }));
  spots.push(spotAt('notice', 'inscription', 2.6, 0.02, -1.6, 2.6, -0.3, { label: 'Painted notice of the vicus', text, gloss: 'The magistri of the vicus to the Augustan Lares.' }));
  spots.push(spotAt('subura', 'spawn', 0, 0.02, -3.0, 0, 0, { label: 'The Subura' }));
  void detail;
}

// ------------------------------------------------------------------ far stand-ins

function forumFar(ctx: LandmarkContext) {
  const Y0 = floorY(ctx);
  return (b: MeshBuilder) => {
    const N = NERVA;
    const xSE = N.xSE * S;
    const xNW = N.xNW * S;
    const zNE = N.zNE * S;
    const z0 = zSW(0) * S;
    span(b, 'paving_travertine', xSE, -0.5, z0, xNW, Y0, zNE, undefined);
    farWall(b, 'peperino', xSE - 0.6, z0, xSE - 0.6, zNE, 1.2, -0.6, Y0 + 10.6);
    farColonnade(b, 'marble', z0, zNE, 0, Y0, N.colH * S, 24, N.colD * S, TRS(xSE + N.off * S, 0, 0, 0, -Math.PI / 2, 0));
    farColonnade(b, 'marble', z0, zNE, 0, Y0, N.colH * S, 24, N.colD * S, TRS(xNW - N.off * S, 0, 0, 0, -Math.PI / 2, 0));
    const g = new THREE.CylinderGeometry((N.horseshoe.R + 1.2) * S, (N.horseshoe.R + 1.2) * S, 10, 10, 1, true, -Math.PI / 2, Math.PI);
    g.translate(N.horseshoe.cx * S, 5 + Y0, zNE);
    b.add(g, 'peperino');
  };
}

function minervaFar(ctx: LandmarkContext) {
  const Y0 = floorY(ctx);
  return (b: MeshBuilder) => {
    const L = templeLayout(MIN_SPEC);
    templeFar(b, L, T(0, Y0, 16.6 * S - L.stylobate.z1), { podium: 'marble' });
  };
}

export const builders: LandmarkBuilder[] = [
  {
    handles: ['forum-nerva'],
    build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildForum(ctx, b, d, spots), { far: ctx.detail === 'high' && forumFar(ctx), cull: 320 }),
  },
  {
    handles: ['temple-minerva-nerva'],
    build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildMinerva(ctx, b, d, spots), { far: ctx.detail === 'high' && minervaFar(ctx), cull: 320 }),
  },
  {
    handles: ['subura'],
    build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildSubura(ctx, b, d, spots), { cull: 300 }),
  },
];
