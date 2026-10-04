/**
 * The gladiator schools of the Third and Second Regions.
 *
 * - ludus-magnus (H): the imperial school, freshly rebuilt by Trajan in brick. Two storeys of cells
 *   round a porticoed court that is almost filled by the practice arena (≈ 63 × 42 m real) with
 *   five rows of seats for spectators; triangular fountains in the four leftover corners, a tunnel
 *   stair towards the amphitheatre in the corner facing it. The v0.0 PLAYABLE ARENA: a clean sand
 *   ellipse inside a 2.8 m podium wall plus balustrade (unclimbable), two gates on the long axis,
 *   external stairs up to the stands. Spots: ludus-arena-center, ludus-gate, lanista, armory,
 *   medicus, spectator-1…16 and more.
 * - ludus-dacicus, ludus-gallicus: cells round a sanded practice yard with pali and weapon racks.
 * - ludus-matutinus: the beast-fighters' school, with cages and pens in the yard.
 */
import * as THREE from 'three';
import { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import { Draw } from '../../../arch/fabric';
import { ProfileBuilder, extrudePolygon } from '../../../arch/common/geom';
import { inscriptionPanel } from '../../../arch/common/inscription';
import { placeProp } from '../../../arch/props';
import { Rng } from '../../../core/Rng';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { Oval, type ReadableSpec, addReadables, flight, frontSteps, ovalBand, ovalSweep, risers, solid, span, statueGeometry } from './colos-kit';
import { column } from '../../../arch/classical/column';
import { complementRanges } from './colos-colosseum';
import { courtyardBuilding, palus, weaponRack, type CourtSpec } from './colos-court';

// ---------------------------------------------------------------- arena section (pure)

export const LUDUS_ARENA = {
  /** Sand ellipse semi-axes (x across, z along the long axis), game metres. */
  a: 11.9,
  b: 19.4,
  podium: 2.8,
  rail: 0.95,
  walk: 1.3,
  rows: 5,
  rise: 0.4,
  depth: 0.72,
  topWalk: 1.1,
  wallT: 0.4,
  gateW: 2.4,
  gateH: 2.5,
};

/** Radial extent of the stands (podium face → outer face of the back wall). */
export function ludusReach(A = LUDUS_ARENA): number {
  return A.walk + A.rows * A.depth + A.topWalk + A.wallT;
}

/** Height of the top walk. */
export function ludusTop(A = LUDUS_ARENA): number {
  return A.podium + A.rows * A.rise;
}

// ---------------------------------------------------------------- the arena with its stands

function ludusArena(ctx: LandmarkContext, b: MeshBuilder, spots: Spot[], readables: ReadableSpec[], high: boolean) {
  const A = LUDUS_ARENA;
  const oval = new Oval(A.a, A.b);
  const two = Math.PI * 2;
  const I = new THREE.Matrix4();
  const P = A.podium;
  const top = ludusTop();
  const xTop0 = A.walk + A.rows * A.depth; // start of the top walk
  const xOut = xTop0 + A.topWalk; // inner face of the back wall
  const xWall = xOut + A.wallT; // outer face
  const gates = [Math.PI / 2, (3 * Math.PI) / 2]; // +z (back) and −z (front, towards the amphitheatre)
  const speed = (t: number, x: number) => {
    const e = 1e-3;
    const p = oval.point(t - e, x);
    const q = oval.point(t + e, x);
    return Math.hypot(q[0] - p[0], q[1] - p[1]) / (2 * e);
  };
  const cutsAt = (x: number, hw: number, ts: number[]) => complementRanges(ts.map((t) => ({ t0: t - hw / speed(t, x), t1: t + hw / speed(t, x) })));
  const sweepRanges = (prof: ReturnType<ProfileBuilder['build']>, x: number, ranges: { t0: number; t1: number }[] | null, mat: MaterialId, collect?: THREE.BufferGeometry[]) => {
    const per = oval.perimeter(x, 256);
    if (!ranges) {
      const g = ovalSweep(oval, prof, 0, two, Math.max(48, Math.round(per / 1.2)), { closed: true });
      b.add(g, mat, I);
      collect?.push(g);
      return;
    }
    for (const r of ranges) {
      const n = Math.max(2, Math.round((((r.t1 - r.t0) / two) * per) / 1.2));
      const g = ovalSweep(oval, prof, r.t0, r.t1, n, { caps: false });
      b.add(g, mat, I);
      collect?.push(g);
    }
  };
  const col: THREE.BufferGeometry[] = [];
  // Podium face (cut at the two gates): marble revetment over a red dado, a painted frieze of
  // hunting scenes under a moulded marble cornice, veined pilaster strips.
  const gateCut = cutsAt(0, A.gateW / 2, gates);
  sweepRanges(new ProfileBuilder(0, P).to(0, 0).build(), 0, gateCut, 'marble', col);
  sweepRanges(new ProfileBuilder(-0.02, 0.9).to(-0.02, 0.02).build(), 0, gateCut, 'plaster_red');
  if (high) {
    sweepRanges(new ProfileBuilder(-0.015, P - 0.28).to(-0.015, P - 0.78).build(), 0, gateCut, 'stucco_painted');
    const cornice = new ProfileBuilder(-0.02, P - 0.28).to(-0.08, P - 0.22).to(-0.08, P - 0.14).to(-0.16, P - 0.06).to(-0.16, P).build();
    cornice.pts.reverse();
    sweepRanges(cornice, 0, gateCut, 'marble');
    for (const t of oval.equalArc(28, 0, 0.5)) {
      if (gates.some((g) => Math.abs(Math.atan2(Math.sin(t - g), Math.cos(t - g))) < 0.16)) continue;
      const fr = oval.radialFrame(t, 0);
      span(b, 'marble_veined', fr, -0.24, 0.9, -0.01, 0.24, P - 0.78, 0.035, false, false);
    }
  }
  // Terrace, rows, top walk.
  sweepRanges(new ProfileBuilder(A.walk, P).to(0, P).build(), A.walk / 2, null, 'travertine', col);
  let y = P;
  for (let r = 0; r < A.rows; r++) {
    const x0 = A.walk + r * A.depth;
    sweepRanges(new ProfileBuilder(x0, y + A.rise).to(x0, y).build(), x0, null, 'travertine', col);
    y += A.rise;
    sweepRanges(new ProfileBuilder(x0 + A.depth, y).to(x0, y).build(), x0 + A.depth / 2, null, r % 2 ? 'marble' : 'travertine', col);
  }
  sweepRanges(new ProfileBuilder(xOut, top).to(xTop0, top).build(), xTop0, null, 'paving_travertine', col);
  // Back wall (outer face of the stands) down to the court, cut at the gates (to 2.5 m) and the
  // parapet above the top walk cut at the four stair landings.
  const stairT = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
  const backCut = cutsAt(xWall, A.gateW / 2 + 0.1, gates);
  sweepRanges(new ProfileBuilder(xWall, 0).to(xWall, top).build(), xWall, backCut, 'brick');
  for (const t of gates) {
    // Masonry over the gate in the back wall.
    const fr = oval.radialFrame(t, xWall);
    span(b, 'brick', fr, -A.gateW / 2 - 0.15, A.gateH, 0, A.gateW / 2 + 0.15, top, A.wallT + 0.02);
    span(b, 'travertine', fr, -A.gateW / 2 - 0.3, A.gateH, -0.06, A.gateW / 2 + 0.3, A.gateH + 0.25, 0.02);
  }
  const parCut = cutsAt(xOut + A.wallT / 2, 0.75, stairT);
  for (const r of parCut ?? []) {
    const n = Math.max(2, Math.round(((r.t1 - r.t0) / two) * 48));
    b.add(ovalBand(oval, xOut, xWall, top, top + 1.0, r.t0, r.t1, n), 'brick', I);
    b.add(ovalBand(oval, xOut - 0.04, xWall + 0.04, top + 1.0, top + 1.08, r.t0, r.t1, n), 'travertine', I);
    for (let i = 0; i < n; i++) {
      const t0 = r.t0 + ((r.t1 - r.t0) * i) / n;
      const t1 = r.t0 + ((r.t1 - r.t0) * (i + 1)) / n;
      const { m, len } = oval.chordFrame(t0, t1, xOut + A.wallT / 2);
      solid(b, m, -0.02, top, -A.wallT / 2, len + 0.02, top + 1.08, A.wallT / 2);
    }
  }
  // Podium balustrade (unclimbable from the sand: 2.8 m wall + 0.95 m rail) with colliders,
  // continuous over the gates.
  {
    const n = 96;
    b.add(ovalBand(oval, 0.05, 0.3, P, P + A.rail, 0, two, n, true), 'travertine', I);
    b.add(ovalBand(oval, 0.0, 0.35, P + A.rail, P + A.rail + 0.08, 0, two, n, true), 'marble', I);
    for (let i = 0; i < n; i++) {
      const t0 = (two * i) / n;
      const t1 = (two * (i + 1)) / n;
      const { m, len } = oval.chordFrame(t0, t1, 0.15);
      solid(b, m, -0.02, P - 0.1, -0.2, len + 0.02, P + A.rail + 0.1, 0.12);
    }
  }
  // One trimesh for the stands' surfaces (podium face, terrace, rows, top walk).
  {
    let total = 0;
    for (const g of col) total += g.getAttribute('position').count;
    const arr = new Float32Array(total * 3);
    let o = 0;
    for (const g of col) {
      const p = g.getAttribute('position').array as Float32Array;
      arr.set(p, o);
      o += p.length;
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    b.collider({ kind: 'trimesh', geometry: cg });
  }
  // Back wall colliders (chord boxes), open at the gates.
  for (const r of backCut ?? []) {
    const n = Math.max(2, Math.round(((r.t1 - r.t0) / two) * 64));
    for (let i = 0; i < n; i++) {
      const t0 = r.t0 + ((r.t1 - r.t0) * i) / n;
      const t1 = r.t0 + ((r.t1 - r.t0) * (i + 1)) / n;
      const { m, len } = oval.chordFrame(t0, t1, xWall - 0.6);
      solid(b, m, -0.02, 0, -0.6, len + 0.02, top, 0.6);
    }
  }
  // Gate passages under the stands, with timber gate leaves swung open against the walls.
  gates.forEach((t, gi) => {
    const fr = oval.radialFrame(t, 0); // +z inward (into the arena), outward is −z
    const hw = A.gateW / 2;
    for (const sx of [-1, 1]) span(b, 'brick', fr, sx * hw, 0, -xWall, sx * (hw + 0.35), A.gateH + 0.3, 0.02, true);
    span(b, 'concrete', fr, -hw - 0.35, A.gateH, -xWall, hw + 0.35, P - 0.02, 0.02, true, false);
    span(b, 'sand', fr, -hw, 0, -xWall - 0.3, hw, 0.05, 0.3, false, false);
    span(b, 'travertine', fr, -hw - 0.2, A.gateH, -0.12, hw + 0.2, P, 0.03, false, false);
    for (const sx of [-1, 1]) {
      const leaf = fr.clone().multiply(new THREE.Matrix4().makeTranslation(sx * (hw - 0.08), 0, -0.9)).multiply(new THREE.Matrix4().makeRotationY(sx * 0.12));
      span(b, 'wood_dark', leaf, -0.04, 0.05, -0.6, 0.04, A.gateH - 0.05, 0.6);
      for (const yy of [0.4, 1.2, 2.0]) span(b, 'iron', leaf, -0.06, yy, -0.6, 0.06, yy + 0.08, 0.6, false, false);
    }
    const p = new THREE.Vector3().setFromMatrixPosition(fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.05, 0.8)));
    spots.push({ id: gi === 1 ? 'ludus-gate' : 'ludus-gate-back', kind: 'door', position: p, heading: Math.atan2(-oval.normal(t)[0], -oval.normal(t)[1]) });
  });
  // Aisles: half steps on each row at 8 places, so spectators can climb from the top walk.
  const aisleT = [0, Math.PI / 4 + 0.35, (3 * Math.PI) / 4 - 0.35, Math.PI, (5 * Math.PI) / 4 + 0.35, (7 * Math.PI) / 4 - 0.35, Math.PI / 2 + 0.6, (3 * Math.PI) / 2 + 0.6];
  for (const t of aisleT) {
    const fr = oval.radialFrame(t, 0);
    let yy = P;
    for (let r = 0; r < A.rows; r++) {
      const x0 = A.walk + r * A.depth;
      span(b, 'travertine', fr, -0.5, yy, -x0, 0.5, yy + A.rise / 2, -(x0 - A.depth / 2), true, false);
      yy += A.rise;
    }
  }
  // External stairs up the back wall to the top walk (as at Pompeii), tangential, at the diagonals.
  const { count, rise } = risers(top, 0.2);
  const run = 0.32;
  const L = count * run;
  stairT.forEach((t) => {
    const [px, pz] = oval.point(t, xWall);
    const [nx, nz] = oval.normal(t);
    // Climb so that the foot lies towards the end of the long axis (clear of the court corners).
    const tx = -nz;
    const tz = nx;
    const dir = -Math.sign(pz * tz) || 1;
    const ux = tx * dir;
    const uz = tz * dir;
    const W = 1.4;
    const off = W / 2 + 0.05;
    // Stair frame: +z along the climb; origin at the foot centre; the landing is centred on t.
    const cx = px + nx * off - ux * (L + 0.75);
    const cz = pz + nz * off - uz * (L + 0.75);
    const yaw = Math.atan2(ux, uz);
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(cx, 0, cz);
    flight(b, 'travertine', m, 0, W, 0, 0, rise, run, count, true);
    // Landing joining the top walk through the gap in the parapet (−x or +x is towards the wall).
    const inward = dir > 0 ? -1 : 1;
    span(b, 'travertine', m, inward < 0 ? -W / 2 - 1.0 : -W / 2, 0, L, inward < 0 ? W / 2 : W / 2 + 1.0, top, L + 1.5, true);
    // Low parapet on the open side of the flight and landing.
    const ang = Math.atan2(top, L);
    const ox = -inward * (W / 2 + 0.08);
    const pm = m.clone().multiply(new THREE.Matrix4().makeTranslation(ox, top / 2 + 0.45, L / 2)).multiply(new THREE.Matrix4().makeRotationX(-ang));
    b.box('brick', 0.16, 0.9, Math.hypot(top, L), pm, { collide: true });
  });
  // Arena floor.
  {
    const shape = new THREE.Shape();
    const nA = 96;
    for (let i = 0; i < nA; i++) {
      const tt = (i / nA) * two;
      const [x, z] = oval.point(tt, 0.02);
      if (i === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    }
    const floor = new THREE.ShapeGeometry(shape, 1);
    floor.rotateX(-Math.PI / 2);
    floor.translate(0, 0.06, 0);
    b.add(floor, 'sand', I, { castShadow: false });
  }
  // The sand stays clear for the bouts: the doctor's drill posts (pali) stand in the court.
  spots.push({ id: 'ludus-arena-center', kind: 'spawn', position: new THREE.Vector3(0, 0.06, 0), heading: Math.PI });
  spots.push({ id: 'ludus-fighter-a', kind: 'spawn', position: new THREE.Vector3(0, 0.06, -7), heading: 0 });
  spots.push({ id: 'ludus-fighter-b', kind: 'spawn', position: new THREE.Vector3(0, 0.06, 7), heading: Math.PI });
  spots.push({ id: 'ludus-doctor', kind: 'npc', position: new THREE.Vector3(-A.a + 1.5, 0.06, -3), heading: Math.PI / 2 });
  // Spectators: seats on every other row 2.5 m apart (≈ 110 sitters, the "80–120" of a practice
  // day) and standing places along the top walk, clear of the gates, the tribunal and the aisles.
  const angDist = (t: number, c: number) => Math.abs(Math.atan2(Math.sin(t - c), Math.cos(t - c)));
  const blocked = (t: number) => gates.some((g) => angDist(t, g) < 0.3) || angDist(t, 0) < 0.36 || aisleT.some((a) => angDist(t, a) < 0.06);
  let si = 0;
  for (const r of [0, 2, 4]) {
    const x = A.walk + r * A.depth + A.depth / 2;
    const yy = P + (r + 1) * A.rise;
    const n = Math.round(oval.perimeter(x, 256) / 2.5);
    for (const t of oval.equalArc(n, x, r * 0.17)) {
      if (blocked(t)) continue;
      const [px, pz] = oval.point(t, x);
      const [nx, nz] = oval.normal(t);
      spots.push({ id: `spectator-${++si}`, kind: 'sit', position: new THREE.Vector3(px, yy + 0.02, pz), heading: Math.atan2(-nx, -nz) });
    }
  }
  {
    const x = xTop0 + A.topWalk / 2;
    const n = Math.round(oval.perimeter(x, 256) / 6);
    let k = 0;
    for (const t of oval.equalArc(n, x, 0.5)) {
      if (blocked(t) || stairT.some((st) => angDist(t, st) < 0.12)) continue;
      const [px, pz] = oval.point(t, x);
      const [nx, nz] = oval.normal(t);
      spots.push({ id: `spectator-standing-${++k}`, kind: 'npc', position: new THREE.Vector3(px, top + 0.02, pz), heading: Math.atan2(-nx, -nz) });
    }
  }
  // ---- the tribunal on the east long side (t = 0): the procurator's box, a level extension of the
  //      top walk out over the rows to the terrace, under a tiled roof with a pediment.
  {
    const fr = oval.radialFrame(0, 0); // +z towards the sand; outward is −z
    const hw = 3.3;
    const zF = -A.walk; // front face over the terrace
    const zB = -xTop0;
    span(b, 'marble', fr, -hw, P - 0.02, zB, hw, top, zF, true);
    span(b, 'marble_veined', fr, -hw + 0.1, top, zB + 0.1, hw - 0.1, top + 0.02, zF - 0.1, false, false);
    // Front parapet (marble, painted panel, bronze rail) and side parapets.
    span(b, 'marble', fr, -hw, top, zF - 0.3, hw, top + 1.0, zF, true);
    if (high) {
      span(b, 'plaster_red', fr, -hw + 0.25, P + 0.35, zF - 0.01, hw - 0.25, top - 0.25, zF + 0.01, false, false);
      span(b, 'gilded_bronze', fr, -hw + 0.1, top + 1.0, zF - 0.24, hw - 0.1, top + 1.06, zF - 0.06, false, false);
    }
    for (const sx of [-1, 1]) span(b, 'marble', fr, sx * hw - (sx > 0 ? 0.25 : 0), top, zB, sx * hw + (sx < 0 ? 0.25 : 0), top + 1.0, zF - 0.3, true);
    // Columns at the front and piers in the back wall carry the roof over the box and the walk.
    const ch = 3.2;
    const D = 0.3;
    for (const x of [-hw + 0.3, -1.1, 1.1, hw - 0.3]) {
      column(b, { order: 'corinthian', D, height: ch, material: 'marble', detail: high ? 'low' : 'far', kind: 'free', collide: true }, fr.clone().multiply(new THREE.Matrix4().makeTranslation(x, top, zF - 0.55)));
    }
    for (const sx of [-1, 1]) span(b, 'brick', fr, sx * hw - 0.25, top, -xWall, sx * hw + 0.25, top + ch, -xOut, true);
    const yE = top + ch;
    span(b, 'marble', fr, -hw - 0.2, yE, -xWall - 0.1, hw + 0.2, yE + 0.45, zF - 0.25);
    if (high) span(b, 'gilded_bronze', fr, -hw - 0.2, yE + 0.12, zF - 0.27, hw + 0.2, yE + 0.3, zF - 0.24, false, false);
    const ped = extrudePolygon([[-hw - 0.3, 0], [hw + 0.3, 0], [0, 1.1]], 0.5);
    b.add(ped, 'marble', fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, yE + 0.45, zF - 0.25)));
    const roofLen = xWall - A.walk + 0.4;
    const roofG = extrudePolygon([[-hw - 0.45, -0.05], [hw + 0.45, -0.05], [0, 1.2]], roofLen);
    b.add(roofG, 'roof_tile', fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, yE + 0.47, zF - 0.3)));
    span(b, 'wood_dark', fr, -hw, yE - 0.06, -xWall, hw, yE, zF - 0.3, false, false);
    // Seats: two curule chairs and a cushioned bench for the guests.
    if (high) {
      for (const x of [-0.7, 0.7]) {
        span(b, 'gilded_bronze', fr, x - 0.3, top, -2.9, x + 0.3, top + 0.48, -2.4);
        span(b, 'fabric_purple', fr, x - 0.28, top + 0.48, -2.9, x + 0.28, top + 0.55, -2.4, false, false);
      }
      span(b, 'wood_dark', fr, -hw + 0.4, top, -4.6, hw - 0.4, top + 0.45, -4.1);
      span(b, 'fabric_red', fr, -hw + 0.45, top + 0.45, -4.6, hw - 0.45, top + 0.52, -4.1, false, false);
    }
    spots.push({ id: 'ludus-editor', kind: 'vista', position: new THREE.Vector3().setFromMatrixPosition(fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, top + 0.02, zF - 1.0))), heading: -Math.PI / 2 });
    spots.push({ id: 'ludus-procurator', kind: 'sit', position: new THREE.Vector3().setFromMatrixPosition(fr.clone().multiply(new THREE.Matrix4().makeTranslation(0.7, top + 0.5, -2.65))), heading: -Math.PI / 2 });
  }

  // ---- the gladiators' statue of Trajan on the west side, facing the tribunal (t = π)
  {
    const fr = oval.radialFrame(Math.PI, 0);
    const bw = 1.1;
    const bd = 0.85;
    const bh = 1.55;
    span(b, 'marble', fr, -bw / 2 - 0.08, 0, 0, bw / 2 + 0.08, 0.22, bd + 0.08, true);
    span(b, 'marble', fr, -bw / 2, 0.22, 0, bw / 2, bh, bd, true);
    span(b, 'marble', fr, -bw / 2 - 0.06, bh, 0, bw / 2 + 0.06, bh + 0.12, bd + 0.06);
    statueGeometry(b, fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, bh + 0.12, bd / 2)).multiply(new THREE.Matrix4().makeRotationY(Math.PI)), { level: high ? 'near' : 'mid', variant: 1, body: 'bronze', plinth: 'marble', scale: 1.15 });
    if (high && typeof document !== 'undefined') {
      inscriptionPanel(
        b,
        { lines: ['Imp Caesari Nervae', 'Traiano Aug Germ Dacico', 'Familia Gladiatoria', 'Ludi Magni'], width: bw - 0.16, height: 0.85, style: 'carved', sizes: [1, 0.9, 0.9, 0.9] },
        fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.95, bd + 0.012)).multiply(new THREE.Matrix4().makeRotationY(Math.PI)),
        { depth: 0.01 },
      );
    }
    const at = new THREE.Vector3().setFromMatrixPosition(fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.95, bd + 0.02)));
    const sp = new THREE.Vector3().setFromMatrixPosition(fr.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.06, bd + 1.6)));
    spots.push({ id: 'ludus-trajan-base', kind: 'inscription', position: sp, heading: Math.atan2(-oval.normal(Math.PI)[0], -oval.normal(Math.PI)[1]) + Math.PI });
    readables.push({
      id: 'ludus-trajan-base',
      at,
      reach: 3.5,
      title: 'Statue base of Trajan',
      text: 'IMP · CAESARI · NERVAE / TRAIANO · AVG · GERM · DACICO / FAMILIA · GLADIATORIA / LVDI · MAGNI\n\n*To the Emperor Caesar Nerva Trajan Augustus, conqueror of the Germans and the Dacians: the gladiator troupe of the Great School.*\n\nThe bronze emperor watches the sand from the west side, facing the procurator\'s box. Fresh wreaths are tied round his ankles; someone has left a wooden practice sword on the base.',
    });
  }

  // ---- awnings on masts along the back wall, shading the long sides of the stands
  if (high) {
    const xm = xOut + A.wallT / 2;
    const masts: number[] = [];
    for (const t of oval.equalArc(26, xm, 0.5)) {
      const near = (c: number, w: number) => Math.abs(Math.atan2(Math.sin(t - c), Math.cos(t - c))) < w;
      if (near(0, 0.32) || gates.some((g) => near(g, 0.42)) || stairT.some((s) => near(s, 0.14))) {
        masts.push(NaN);
        continue;
      }
      masts.push(t);
    }
    const ym = top + 3.6;
    const pos: number[] = [];
    const pos2: number[] = [];
    for (let i = 0; i < masts.length; i++) {
      const t = masts[i];
      if (Number.isNaN(t)) continue;
      const [px, pz] = oval.point(t, xm);
      const d = new Draw(b);
      d.cyl('wood', px, top + (ym - top) / 2, pz, 0.075, ym - top + 0.3, 6);
      const t2 = masts[(i + 1) % masts.length];
      if (Number.isNaN(t2)) continue;
      const P0 = (tt: number, f: number): [number, number, number] => {
        const x = xm - (xm - A.walk * 0.6) * f;
        const [qx, qz] = oval.point(tt, x);
        return [qx, ym - 0.25 - 1.5 * f - 0.3 * Math.sin(Math.PI * f), qz];
      };
      const target = i % 2 ? pos : pos2;
      for (let j = 0; j < 3; j++) {
        const f0 = j / 3;
        const f1 = (j + 1) / 3;
        const a = P0(t, f0), c = P0(t2, f0), dd = P0(t2, f1), e = P0(t, f1);
        target.push(...a, ...e, ...c, ...c, ...e, ...dd);
        target.push(...a, ...c, ...e, ...c, ...dd, ...e);
      }
    }
    for (const [arr, mat] of [[pos, 'fabric_white'], [pos2, 'fabric_red']] as const) {
      if (!arr.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      g.computeVertexNormals();
      b.add(g, mat, undefined);
    }
  }

  // ---- hangings on the podium face, rakes and the referee's staff by the back gate
  if (high) {
    const d = new Draw(b);
    oval.equalArc(12, 0, 0.5).forEach((t, i) => {
      if (gates.some((g) => Math.abs(Math.atan2(Math.sin(t - g), Math.cos(t - g))) < 0.3)) return;
      if (Math.abs(Math.atan2(Math.sin(t), Math.cos(t))) < 0.3 || Math.abs(Math.atan2(Math.sin(t - Math.PI), Math.cos(t - Math.PI))) < 0.3) return;
      const fr = oval.radialFrame(t, 0);
      span(b, i % 2 ? 'fabric_ochre' : 'fabric_red', fr, -0.36, P - 1.25, 0.03, 0.36, P - 0.12, 0.05, false, false);
      span(b, 'gilded_bronze', fr, -0.42, P - 0.16, 0.02, 0.42, P - 0.1, 0.08, false, false);
    });
    const gb = oval.radialFrame(Math.PI / 2 + 0.22, 0);
    for (const [x, lean] of [[-0.4, 0.18], [0.0, 0.22]] as const) {
      const a = new THREE.Vector3(x, 0.06, 0.45).applyMatrix4(gb);
      const c = new THREE.Vector3(x + 0.05, 2.0, 0.45 - lean * 2).applyMatrix4(gb);
      d.rod('wood', a, c, 0.025, 5);
      const head = new THREE.Vector3(x, 0.12, 0.47).applyMatrix4(gb);
      d.box('wood_dark', head.x, head.y, head.z, 0.5, 0.06, 0.06);
    }
    const st0 = new THREE.Vector3(0.7, 0.06, 0.3).applyMatrix4(gb);
    const st1 = new THREE.Vector3(0.72, 2.1, 0.06).applyMatrix4(gb);
    d.rod('wood_dark', st0, st1, 0.022, 5);
  }
  return { oval, xWall, top };
}

// ---------------------------------------------------------------- triangular corner fountains

function cornerFountain(b: MeshBuilder, x: number, z: number, sx: number, sz: number) {
  // Right triangle with the right angle in the court corner, legs 4.2 (x) and 4.2 (z).
  const leg = 4.2;
  const pts: [number, number][] = [[x, z], [x - sx * leg, z], [x, z - sz * leg]];
  const shape = new THREE.Shape(pts.map(([px, pz]) => new THREE.Vector2(px, -pz)));
  const rim = new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false });
  rim.rotateX(-Math.PI / 2);
  b.add(rim, 'travertine', undefined);
  const inset = 0.28;
  const ins: [number, number][] = [[x - sx * inset, z - sz * inset], [x - sx * (leg - inset * 2.4), z - sz * inset], [x - sx * inset, z - sz * (leg - inset * 2.4)]];
  const ws = new THREE.Shape(ins.map(([px, pz]) => new THREE.Vector2(px, -pz)));
  const water = new THREE.ShapeGeometry(ws);
  water.rotateX(-Math.PI / 2);
  water.translate(0, 0.57, 0);
  b.add(water, 'water', undefined, { castShadow: false });
  // Spout pillar in the corner.
  span(b, 'marble', new THREE.Matrix4(), x - sx * 0.05, 0, z - sz * 0.05, x - sx * 0.6, 1.4, z - sz * 0.6, true);
  b.collider({ kind: 'box', center: new THREE.Vector3(x - sx * leg / 3, 0.3, z - sz * leg / 3), half: new THREE.Vector3(leg / 3, 0.3, leg / 3) });
}

// ---------------------------------------------------------------- builders

function floorLevel(ctx: LandmarkContext, w: number, d: number): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= 6; i++)
    for (let j = 0; j <= 6; j++) {
      const g = ctx.groundAt(-w / 2 + (w * i) / 6, -d / 2 + (d * j) / 6);
      lo = Math.min(lo, g);
      hi = Math.max(hi, g);
    }
  return hi - lo < 0.25 ? 0 : Math.max(0, hi) + 0.05;
}

function buildLudusMagnus(ctx: LandmarkContext): LandmarkBuild {
  const S = ctx.S;
  const high = ctx.detail === 'high';
  const W = 85 * S;
  const D = 110 * S;
  const spec: CourtSpec = {
    prefix: 'ludus-',
    w: W,
    d: D,
    range: 4.2,
    storeys: 3,
    wallMat: 'brick',
    courtWallMat: 'plaster_cream',
    portico: { depth: 2.6, posts: 'columns', material: 'travertine', spacing: 3.3, gallery: true },
    gates: [
      { side: 'front', at: 0, width: 3.2, height: 2.6, arch: true, spot: 'entrance' },
      { side: 'back', at: 0, width: 2.6, height: 2.4, arch: true, spot: 'back-gate' },
    ],
    shops: [
      { side: 'front', from: -W / 2 + 2, to: -3.5 },
      { side: 'front', from: 3.5, to: W / 2 - 2 },
    ],
    rooms: [
      { id: 'armory', spotId: 'armory', side: 'front', at: -8.2, width: 6.2, kind: 'armory' },
      { id: 'lanista', spotId: 'lanista', side: 'front', at: 8.2, width: 6.2, kind: 'office' },
      { id: 'medicus', spotId: 'medicus', side: 'right', at: -12, width: 6.2, kind: 'medicus' },
      { id: 'ludus-mess', side: 'back', at: 7, width: 6.2, kind: 'mess' },
      { id: 'ludus-shrine-nemesis', side: 'left', at: 0, width: 3.4, kind: 'shrine' },
      { id: 'ludus-smithy', side: 'left', at: 12, width: 5.2, kind: 'forge' },
    ],
    floor: 'gravel',
    floorY: floorLevel(ctx, W, D),
    groundAt: ctx.groundAt,
    detail: ctx.detail,
    seed: 'ludus-magnus',
  };
  const res = courtyardBuilding(spec);
  const b = res.b;
  const spots = [...res.spots];
  const readables: ReadableSpec[] = [];
  const y0 = res.court.y;
  // The arena + stands sit on the court floor.
  const ab = new MeshBuilder();
  const arenaSpots: Spot[] = [];
  const arenaReadables: ReadableSpec[] = [];
  const arena = ludusArena(ctx, ab, arenaSpots, arenaReadables, high);
  b.append(ab, new THREE.Matrix4().makeTranslation(0, y0, 0));
  for (const s of arenaSpots) s.position.y += y0;
  for (const r of arenaReadables) r.at.y += y0;
  spots.push(...arenaSpots);
  readables.push(...arenaReadables);
  // Triangular fountains in the court corners.
  const cx = res.court.w / 2 - 0.1;
  const cz = res.court.d / 2 - 0.1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const fb = new MeshBuilder();
    cornerFountain(fb, sx * cx, sz * cz, sx, sz);
    b.append(fb, new THREE.Matrix4().makeTranslation(0, y0, 0));
    spots.push({ id: `ludus-fountain-${sx < 0 ? 'w' : 'e'}${sz < 0 ? 'n' : 's'}`, kind: 'shrine', position: new THREE.Vector3(sx * (cx - 2.4), y0 + 0.05, sz * (cz - 2.4)), heading: Math.atan2(sx, sz) });
  }
  // Weapon racks under the front portico, benches along the long sides, and by the front arena
  // gate the fighters' corner: a trough, a bench, water jars and a rack of practice weapons.
  const d = new Draw(b).at(0, y0, 0);
  if (high) {
    const rng = new Rng('ludus-court');
    weaponRack(d, -4.5, 0, -res.inner.d / 2 + 0.9, 0);
    weaponRack(d, 4.5, 0, -res.inner.d / 2 + 0.9, 0);
    for (const sx of [-1, 1]) placeProp(d, 'bench', sx * (res.court.w / 2 - 1.2), 0, 0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, { rng });
    const zg = -(LUDUS_ARENA.b + ludusReach()) - 1.6;
    placeProp(d, 'trough', -3.2, 0, zg, Math.PI / 2, { rng });
    placeProp(d, 'bench', 3.0, 0, zg + 0.2, -Math.PI / 2, { rng });
    placeProp(d, 'amphora_tall', -3.0, 0, zg - 1.3, 0.4, { rng });
    placeProp(d, 'amphora_tall', -2.6, 0, zg - 1.5, 1.6, { rng });
    weaponRack(d, 3.6, 0, zg - 1.6, Math.PI / 2);
    // Pali in the court's free corners for the tirones' drill.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) palus(d, sx * (res.court.w / 2 - 6.5), 0, sz * (res.court.d / 2 - 2.2));
  }
  spots.push({ id: 'ludus-fighters-corner', kind: 'sit', position: d.point(3.0, 0.5, -(LUDUS_ARENA.b + ludusReach()) - 1.4), heading: -Math.PI / 2 });
  // Tunnel stair down towards the amphitheatre in the front-left court corner (portico).
  {
    const tx = -res.inner.w / 2 + 1.4;
    const tz = -res.inner.d / 2 + 0.8;
    const f = d.at(tx, 0, tz, 0);
    f.span('brick', -1.2, 0, -0.2, -0.85, 1.1, 3.6, { collide: true });
    f.span('brick', 0.85, 0, -0.2, 1.2, 1.1, 3.6, { collide: true });
    f.span('black', -0.85, -2.6, 0.2, 0.85, 0.0, 3.6);
    for (let i = 0; i < 6; i++) f.span('travertine', -0.85, -0.2 * (i + 1), 0.4 + i * 0.5, 0.85, -0.2 * i, 0.4 + (i + 1) * 0.5);
    f.solid(-0.85, 0, 0.2, 0.85, 1.1, 3.6);
    spots.push({ id: 'ludus-tunnel', kind: 'door', position: d.point(tx, 0.05, tz - 0.6), heading: 0 });
  }
  // The street front: LVDVS · MAGNVS carved over the gate, torches either side, and a painted
  // programme (Pompeian formula) on the plaster panel right of the gate.
  const zFront = -D / 2;
  const gateTop = 2.6 + 1.6;
  if (high) {
    const fd = new Draw(b);
    for (const sx of [-1, 1]) placeProp(fd, 'torch_bracket', sx * 2.35, y0 + 2.9, zFront - 0.01, 0, { rng: new Rng('lt' + sx), collide: false });
    fd.span('plaster_cream', 3.75, y0 + 3.36, zFront - 0.025, 6.65, y0 + 4.12, zFront);
    if (typeof document !== 'undefined') {
      inscriptionPanel(b, { lines: ['Ludus Magnus'], width: 3.6, height: 0.62, style: 'carved' }, new THREE.Matrix4().makeTranslation(0, y0 + gateTop + 0.85, zFront - 0.04), { depth: 0.04 });
      inscriptionPanel(b, { lines: ['Familia Gladiatoria Pugnabit', 'Venatio Vela Erunt'], width: 2.7, height: 0.62, style: 'painted' }, new THREE.Matrix4().makeTranslation(5.2, y0 + 3.74, zFront - 0.03), { depth: 0.005 });
    }
  }
  spots.push({ id: 'ludus-gate-inscription', kind: 'inscription', position: new THREE.Vector3(0, y0 + 0.05, zFront - 4.0), heading: 0 });
  spots.push({ id: 'ludus-notice', kind: 'inscription', position: new THREE.Vector3(5.2, y0 + 0.05, zFront - 2.0), heading: 0 });
  readables.push(
    {
      id: 'ludus-gate-inscription',
      at: new THREE.Vector3(0, y0 + gateTop + 0.85, zFront - 0.05),
      reach: 7,
      title: 'Ludus Magnus',
      text: 'LVDVS · MAGNVS\n\n*The Great School.*\n\nCaesar\'s own school of gladiators, begun by Domitian and rebuilt in fresh brick by Trajan. Wooden swords clack beyond the gate from the first hour; the doctor, a Thracian called Glaucus, takes paid guests on the practice sand.',
    },
    {
      id: 'ludus-notice',
      at: new THREE.Vector3(5.2, y0 + 3.74, zFront - 0.04),
      reach: 5,
      title: 'Painted notice',
      text: 'FAMILIA · GLADIATORIA · PVGNABIT / VENATIO · VELA · ERVNT\n\n*The gladiator troupe will fight. A beast hunt. There will be awnings.*\n\nRed letters on fresh whitewash, the formula every Roman knows from a hundred walls. The date has been left blank, to be painted in when the games are announced.',
    },
  );
  // Gladiators' graffiti scratched into the plaster of the back portico (content T4).
  {
    const gx = -9.5;
    const gz = res.inner.d / 2;
    if (high) {
      const rng = new Rng('ludus-graffiti');
      // Five scratched 'lines' of short strokes, letter height ~6 cm, plus a net and a fish.
      for (let row = 0; row < 5; row++) {
        const y = y0 + 1.85 - row * 0.15;
        const n = 10 + Math.floor(rng.next() * 8);
        let x = gx - 0.6 + rng.next() * 0.15;
        for (let i = 0; i < n; i++) {
          const len = 0.03 + rng.next() * 0.05;
          const m = new THREE.Matrix4().makeTranslation(x, y + (rng.next() - 0.5) * 0.02, gz - 0.004).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2 + (rng.next() - 0.5) * 1.6));
          b.box('plaster_dark', len, 0.005, 0.004, m, { castShadow: false });
          x += 0.035 + rng.next() * 0.03;
        }
      }
      for (let i = 0; i < 4; i++) {
        b.box('plaster_dark', 0.22, 0.005, 0.004, new THREE.Matrix4().makeTranslation(gx + 0.45, y0 + 1.62 + i * 0.05, gz - 0.004), { castShadow: false });
        b.box('plaster_dark', 0.005, 0.18, 0.004, new THREE.Matrix4().makeTranslation(gx + 0.36 + i * 0.06, y0 + 1.7, gz - 0.004), { castShadow: false });
      }
    }
    spots.push({ id: 'ludus-graffiti', kind: 'inscription', position: new THREE.Vector3(gx, y0 + 0.05, gz - 1.1), heading: 0 });
    readables.push({
      id: 'ludus-graffiti',
      at: new THREE.Vector3(gx, y0 + 1.55, gz - 0.02),
      reach: 3,
      title: 'Graffiti in the barracks',
      text: 'NEREVS · RET · V · XXXI\n\n*"Nereus, retiarius: 31 wins."* Beside it, a net drawn with a fish caught in it.\n\nAVCTVS · THR · XXX · V · XVIII · M · XI · ST · I\n\n*"Auctus, thraex: 30 bouts, 18 won, 11 spared, 1 draw."*\n\nPVLLVS · MATRI · SALVTEM · PISTOR · SVM\n\n*"Pullus to his mother, greetings: I\'m a baker."*\n\nDIZAS · MVS · FVR · EST\n\n*"Dizas the Mouse is a thief."* Someone has scratched a cloak next to it, and then scratched it out.\n\nTIRO · HODIE · CRAS · HEROS · POSTRIDIE · CINIS\n\n*"Today a recruit, tomorrow a hero, the day after, ash."*',
    });
  }
  // Aliases under the location ids the content bible uses for NPC schedules (CONTENT §1.1):
  // the practice arena, the armoury, the infirmary and the barracks.
  const alias = (id: string, from: string, kind = 'npc') => {
    const s = spots.find((x) => x.id === from);
    if (s) spots.push({ id, kind, position: s.position.clone(), heading: s.heading });
  };
  alias('ludus-cavea', 'ludus-arena-center');
  alias('ludus-armamentarium', 'armory');
  alias('ludus-saniarium', 'medicus');
  spots.push({ id: 'ludus-cellae', kind: 'npc', position: new THREE.Vector3(-6.5, y0 + 0.05, res.inner.d / 2 - 1.2), heading: 0 });
  const object = b.build('ludus-magnus');
  addReadables(ctx.game, object, readables);
  const far = farCourt(W, D, res.height, y0, 'brick', arena.top);
  return { object, colliders: b.colliders, spots, far, cullDistance: 900 };
}

/** Cheap far stand-in: outer box, ring roof as a hip, a light court. */
export function farCourt(W: number, D: number, H: number, y0: number, mat: MaterialId, inner = 0): THREE.Object3D {
  const b = new MeshBuilder();
  const d = new Draw(b);
  d.span(mat, -W / 2, y0 - 0.5, -D / 2, W / 2, y0 + H, D / 2);
  d.span('roof_tile', -W / 2 - 0.3, y0 + H, -D / 2 - 0.3, W / 2 + 0.3, y0 + H + 0.9, D / 2 + 0.3);
  if (inner > 0) d.span('sand', -W / 2 + 7, y0 + H + 0.92, -D / 2 + 7, W / 2 - 7, y0 + H + 0.95, D / 2 - 7);
  const g = b.build('far');
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false;
  });
  return g;
}

interface SchoolOpts {
  id: string;
  prefix: string;
  w: number;
  d: number;
  storeys: number;
  yard: 'pali' | 'beasts';
  wallMat?: MaterialId;
}

function buildSchool(ctx: LandmarkContext, o: SchoolOpts): LandmarkBuild {
  const W = o.w * ctx.S;
  const D = o.d * ctx.S;
  const y0 = floorLevel(ctx, W, D);
  const res = courtyardBuilding({
    prefix: o.prefix,
    w: W,
    d: D,
    range: 4.0,
    storeys: o.storeys,
    wallMat: o.wallMat ?? 'brick',
    courtWallMat: 'plaster_cream',
    portico: { depth: 2.4, posts: o.yard === 'beasts' ? 'timber' : 'piers', material: 'brick', spacing: 3.2, gallery: o.storeys > 1 },
    gates: [{ side: 'front', at: 0, width: o.yard === 'beasts' ? 3.6 : 3.0, height: 2.5, arch: true, spot: 'gate' }],
    shops: [{ side: 'front', from: -W / 2 + 1.5, to: -3 }, { side: 'front', from: 3, to: W / 2 - 1.5 }],
    rooms: [
      { id: 'armory', side: 'left', at: 0, width: 5, kind: 'armory' },
      { id: 'doctor', side: 'right', at: 0, width: 5, kind: o.yard === 'beasts' ? 'store' : 'medicus', spotKind: 'npc' },
    ],
    floor: 'sand',
    floorY: y0,
    groundAt: ctx.groundAt,
    detail: ctx.detail,
    seed: o.id,
  });
  const b = res.b;
  const spots = [...res.spots];
  frontSteps(b, ctx.groundAt, 0, -D / 2, y0, o.yard === 'beasts' ? 4.2 : 3.6);
  const d = new Draw(b).at(0, y0, 0);
  const cw = res.court.w;
  const cd = res.court.d;
  if (o.yard === 'pali') {
    for (let i = 0; i < 4; i++) palus(d, -cw / 2 + 3 + ((cw - 6) * i) / 3, 0, -cd / 4);
    for (let i = 0; i < 3; i++) palus(d, -cw / 2 + 4 + ((cw - 8) * i) / 2, 0, cd / 5);
    weaponRack(d, 0, 0, cd / 2 - 1.2, Math.PI);
    spots.push({ id: `${o.prefix}trainer`, kind: 'npc', position: d.point(0, 0.05, 0), heading: Math.PI });
  } else {
    // Beast cages (iron-barred timber crates) and a fenced pen with a feeding trough.
    for (let i = 0; i < 4; i++) {
      const x = -cw / 2 + 2.2 + i * 2.8;
      const f = d.at(x, 0, cd / 2 - 1.6, 0);
      f.span('wood_dark', -1.1, 0, -1.0, 1.1, 0.25, 1.0, { collide: true });
      f.span('wood_dark', -1.1, 1.75, -1.0, 1.1, 1.9, 1.0);
      for (const sx of [-1.05, 1.05]) f.span('wood_dark', sx - 0.06, 0.25, -1.0, sx + 0.06, 1.75, 1.0);
      f.span('wood_dark', -1.1, 0.25, 0.9, 1.1, 1.75, 1.0);
      for (let k = 0; k < 9; k++) f.span('iron', -1.0 + k * 0.25 - 0.02, 0.25, -1.0, -1.0 + k * 0.25 + 0.02, 1.75, -0.96);
      f.solid(-1.1, 0, -1.0, 1.1, 1.9, 1.0);
    }
    const pen = d.at(cw / 4, 0, -cd / 6, 0);
    const pw = Math.min(8, cw / 2 - 1.5);
    for (const [x0, z0, x1, z1] of [[-pw / 2, -3, pw / 2, -2.9], [-pw / 2, 2.9, pw / 2, 3], [-pw / 2, -3, -pw / 2 + 0.1, 3], [pw / 2 - 0.1, -3, pw / 2, 3]] as const) {
      pen.span('wood', x0, 0, z0, x1, 1.6, z1, { collide: true });
    }
    placeProp(pen, 'trough', 0, 0, 1.5, 0, { rng: new Rng(o.id) });
    spots.push({ id: `${o.prefix}keeper`, kind: 'npc', position: d.point(-cw / 4, 0.05, 0), heading: 0 });
    spots.push({ id: `${o.prefix}cages`, kind: 'container', position: d.point(-cw / 2 + 4, 0.05, cd / 2 - 3.2), heading: 0 });
  }
  const object = b.build(o.id);
  return { object, colliders: b.colliders, spots, far: farCourt(W, D, res.height, y0, o.wallMat ?? 'brick'), cullDistance: 700 };
}

export const builders: LandmarkBuilder[] = [
  { handles: ['ludus-magnus'], build: buildLudusMagnus },
  { handles: ['ludus-dacicus'], build: (ctx) => buildSchool(ctx, { id: 'ludus-dacicus', prefix: 'dacicus-', w: 80, d: 60, storeys: 2, yard: 'pali' }) },
  { handles: ['ludus-gallicus'], build: (ctx) => buildSchool(ctx, { id: 'ludus-gallicus', prefix: 'gallicus-', w: 70, d: 50, storeys: 2, yard: 'pali' }) },
  { handles: ['ludus-matutinus'], build: (ctx) => buildSchool(ctx, { id: 'ludus-matutinus', prefix: 'matutinus-', w: 80, d: 60, storeys: 2, yard: 'beasts' }) },
];
