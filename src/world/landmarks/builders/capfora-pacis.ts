/**
 * Templum Pacis (Vespasian, AD 71–75) — capfora crew.
 *
 * Not a temple on a podium but a walled garden-forum and museum: porticoes of unfluted red Aswan
 * granite on three sides; a court of six long raised beds of roses with water channels (euripi)
 * along the central walk; and on the SE side, behind a line of six taller columns, the aedes — a
 * broad apsed hall with the statue of Peace and the spoils of Jerusalem (the golden menorah and the
 * table of the showbread) — flanked by the library (Bibliotheca Pacis) and a hall with a marble
 * plan of the city (Flavian; the Severan Forma Urbis does not exist yet).
 *
 * Local frame: the aedes faces −z (NW, towards the Forum of Nerva); x runs NE (+) / SW (−).
 */
import * as THREE from 'three';
import { column } from '../../../arch/classical/column';
import { entablature, pediment } from '../../../arch/classical/entablature';
import { seatedDeity } from '../../../arch/classical/statues';
import { T, TRS, mul } from '../../../arch/common/geom';
import { apse } from '../../../arch/classical/vaults';
import { stairs, stepCount } from '../../../arch/common/stairs';
import { wall } from '../../../arch/common/walls';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext } from '../types';
import { makeLandmark, type Detail } from './capfora/build';
import { farColonnade, farWall, leanTo } from './capfora/far';
import { S, spotAt, type CapSpot } from './capfora/frame';
import { basin, box, coffers, figure, footing, groundMin, inscription, post, sectileFloor, span } from './capfora/ornament';
import { PAINT, cityPlanRelief, paint, redGranite } from './capfora/paint';
import { forumPortico } from './capfora/portico';

const Y0 = 0.12;

/** Plan in REAL metres. */
const PACIS = {
  hx: 55,
  hz: 67.5,
  wallT: 1.5,
  porticoDepth: 10,
  /** z of the SE portico line / front of the halls. */
  zHalls: 45.5,
  /** Aedes half-width. */
  aedesHW: 17,
  colH: 8.5,
  bigH: 14,
};

function buildPacis(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const g = ctx.groundAt;
  const I = new THREE.Matrix4();
  const P = PACIS;
  const hx = P.hx * S;
  const hz = P.hz * S;
  const t = P.wallT * S;
  const dep = P.porticoDepth * S;
  const zH = P.zHalls * S;
  const gWide = groundMin(g, -hx - 3, -hz - 3, hx + 3, hz + 3);
  const yb = Math.min(-0.6, gWide - 0.4);

  // ---- ground: the court is a garden (earth and gravel walks), the porticoes paved
  span(b, 'travertine', -hx + dep - 0.5, Math.min(-0.3, gWide - 0.3), -hz + dep - 0.5, hx - dep + 0.5, Y0 - 0.06, zH, I, true);
  span(b, 'gravel', -hx + dep - 0.5, Y0 - 0.06, -hz + dep - 0.5, hx - dep + 0.5, Y0, zH, I);

  // ---- porticoes on three sides (red granite, unfluted)
  const granite = redGranite();
  const pSpec = {
    depth: dep,
    order: 'corinthian' as const,
    H: P.colH * S,
    spacing: 5.4 * S,
    material: granite,
    trimMaterial: 'marble' as MaterialId,
    fluted: false,
    detail: 'low' as Detail,
    columnDetail: 'low' as Detail,
    floorY: 0.4,
    groundMin: gWide,
    wallMaterial: 'marble' as MaterialId,
    wallThickness: t,
    ceiling: 'plain' as const,
  };
  const nwDoor = 0; // x of the doors through to the Forum of Nerva (centre of the NW side)
  // NW side: runs +x at z = −hz + dep (faces +z: rotate by π).
  const nwL = 2 * (hx - dep);
  const nw = forumPortico(
    b,
    { ...pSpec, length: nwL, openings: [{ kind: 'door', x: nwL / 2 + nwDoor, width: 4.0, height: 4.4, leaves: 'none' }], endWalls: [false, false] },
    mul(I, TRS(hx - dep, Y0, -hz + dep, 0, Math.PI, 0)),
  );
  // NE (+x, faces −x) and SW (−x, faces +x) sides, from the NW colonnade line to the halls; the
  // corner columns stand where the colonnade lines meet.
  const sideL = zH - (-hz + dep);
  const zd = -hz + dep + sideL / 2; // the SW door (towards the Sacra Via)
  forumPortico(b, { ...pSpec, length: sideL, openings: [], endColumns: true, endWalls: [false, false] }, mul(I, TRS(hx - dep, Y0, zH, 0, Math.PI / 2, 0)));
  forumPortico(
    b,
    { ...pSpec, length: sideL, openings: [{ kind: 'door', x: sideL / 2, width: 4.0, height: 4.4, leaves: 'none' }], endColumns: true, endWalls: [false, false] },
    mul(I, TRS(-hx + dep, Y0, -hz + dep, 0, -Math.PI / 2, 0)),
  );
  const pTop = Y0 + nw.wallTop;
  // The two NW corner bays: floor, back walls, ceiling and roof.
  for (const sx of [-1, 1]) {
    const xa = sx > 0 ? hx - dep : -hx;
    const xb = sx > 0 ? hx : -hx + dep;
    span(b, 'paving_travertine', xa, Math.min(-0.3, gWide - 0.3), -hz, xb, Y0 + 0.4, -hz + dep, I, true);
    span(b, 'marble', xa - (sx < 0 ? t : 0), yb, -hz - t, xb + (sx > 0 ? t : 0), pTop, -hz, I, true);
    span(b, 'marble', sx > 0 ? hx : -hx - t, yb, -hz, sx > 0 ? hx + t : -hx, pTop, -hz + dep, I, true);
    span(b, 'wood_dark', xa, pTop - 2.6, -hz, xb, pTop - 2.4, -hz + dep, I);
    span(b, 'roof_tile', xa, pTop - 1.4, -hz, xb, pTop - 1.2, -hz + dep, I);
  }
  spots.push(spotAt('entrance-sw', 'spawn', -hx - 2.5, Y0, zd, 0, zd, { label: 'Templum Pacis' }));
  spots.push(spotAt('door-nerva', 'door', 0, Y0 + 0.4, -hz + 1.5, 0, -hz - 2, { label: 'Passage to the Forum of Nerva' }));
  // Steps down outside the SW door if the ground falls away.
  {
    const gOut = Math.min(0, groundMin(g, -hx - 5, zd - 2, -hx - 0.5, zd + 2));
    if (Y0 + 0.4 - gOut > 0.15) {
      const { count, rise } = stepCount(Y0 + 0.4 - gOut, 0.19);
      stairs(b, { width: 4.0, rise, run: 0.36, count, material: 'travertine' }, TRS(-hx - t - count * 0.36, gOut, zd, 0, Math.PI / 2, 0));
    }
  }

  // ---- the SE range: library (NE), aedes (centre), plan hall (SW), behind the portico line
  const aw = P.aedesHW * S;
  const hallTop = pTop + 2.5;
  // Back wall of the whole range and the party walls.
  span(b, 'peperino', -hx - t, yb, hz - t, hx + t, hallTop, hz, I, true);
  span(b, 'marble', -hx, Y0, hz - t - 0.04, hx, hallTop - 0.4, hz - t, I);
  for (const sx of [-1, 1]) {
    // Outer end walls of the range.
    span(b, 'peperino', sx > 0 ? hx : -hx - t, yb, zH, sx > 0 ? hx + t : -hx, hallTop, hz, I, true);
    // Walls between the aedes and the side halls, with a door.
    const x = sx * (aw + t / 2);
    span(b, 'marble', x - t / 2, Y0, zH + 0.6, x + t / 2, hallTop, zH + (hz - zH) * 0.35, I, true);
    span(b, 'marble', x - t / 2, Y0, zH + (hz - zH) * 0.35 + 2.4, x + t / 2, hallTop, hz - t, I, true);
    span(b, 'marble', x - t / 2, Y0 + 3.6, zH + (hz - zH) * 0.35, x + t / 2, hallTop, zH + (hz - zH) * 0.35 + 2.4, I);
  }
  // Floors and ceilings of the range.
  // The side halls lie at the porticoes' level; the aedes two steps higher (its platform runs out
  // under the six columns).
  span(b, 'travertine', -hx, Math.min(-0.3, gWide - 0.3), zH, hx, Y0 + 0.36, hz - t, I, true);
  span(b, 'marble', -aw, Y0 + 0.36, zH, aw, Y0 + 0.76, hz - t, I, true);
  sectileFloor(b, -aw, aw, zH + 0.6, hz - t, Y0 + 0.76, 2.2, I, detail);
  span(b, 'marble_giallo', -hx, Y0 + 0.36, zH, -aw - t, Y0 + 0.4, hz - t, I);
  span(b, 'marble_giallo', aw + t, Y0 + 0.36, zH, hx, Y0 + 0.4, hz - t, I);
  coffers(b, -aw, aw, zH + 0.6, hz - t, hallTop - 0.2, 2.4, I, detail);
  span(b, 'wood_dark', -hx, hallTop - 0.8, zH + 1.0, -aw - t, hallTop - 0.6, hz - t, I);
  span(b, 'wood_dark', aw + t, hallTop - 0.8, zH + 1.0, hx, hallTop - 0.6, hz - t, I);
  // Lean-to roofs over the side halls (and the portico in front of them); the aedes rises above
  // them under its own gable roof.
  leanTo(b, 'roof_tile', -hx - t - 0.4, -aw + 0.2, zH - dep - 0.6, hallTop - 0.4, hz + 0.4, hallTop + 2.4, I);
  leanTo(b, 'roof_tile', aw - 0.2, hx + t + 0.4, zH - dep - 0.6, hallTop - 0.4, hz + 0.4, hallTop + 2.4, I);

  // The side halls' fronts: the portico runs on in front of them (columns), with wide doors.
  for (const sx of [-1, 1]) {
    const x0 = sx > 0 ? aw + t : -hx + dep;
    const x1 = sx > 0 ? hx - dep : -aw - t;
    forumPortico(b, { ...pSpec, length: x1 - x0, depth: 0.6, wallMaterial: 'none', roofMaterial: 'none', endWalls: [false, false], floorY: 0.4 }, mul(I, TRS(x0, Y0, zH - dep, 0, 0, 0)));
    // Hall front wall with three doors; the portico's roof is the range's roof.
    const len = x1 - x0;
    wall(b, { length: len, height: hallTop - Y0 - 0.4, thickness: 0.8, material: 'marble', detail, openings: [0.2, 0.5, 0.8].map((k) => ({ kind: 'door' as const, x: len * k, width: 3.0, height: 4.6, leaves: 'none' as const })), collide: true }, T(x0, Y0 + 0.4, zH + 0.4));
    span(b, 'paving_travertine', x0, Y0, zH - dep, x1, Y0 + 0.4, zH, I, true);
    span(b, 'wood_dark', x0, Y0 + 0.4 + P.colH * S + 1.0, zH - dep, x1, Y0 + 0.4 + P.colH * S + 1.2, zH, I);
  }

  // ---- the aedes: six taller columns, an entablature and a pediment over the central hall
  {
    const H = P.bigH * S;
    const D = H / 10;
    const zc = zH - 0.2;
    const yS = Y0 + 0.4;
    // Steps up to the hall across its width.
    const { count, rise } = stepCount(0.36 + 0.4 - 0.0, 0.19);
    stairs(b, { width: 2 * aw, rise, run: 0.36, count, material: 'marble' }, T(0, Y0, zc - D - count * 0.36));
    span(b, 'marble', -aw, Y0, zc - D, aw, yS + 0.36, zH + 0.6, I, true);
    for (let k = 0; k < 6; k++) {
      const x = -aw + (2 * aw * (k + 0.5)) / 6;
      column(b, { order: 'corinthian', D, height: H, fluted: false, material: granite as unknown as MaterialId, trimMaterial: 'marble', detail: detail === 'high' && (k === 2 || k === 3) ? 'high' : 'low' }, T(x, yS + 0.36, zc));
    }
    const yE = yS + 0.36 + H;
    const ent = entablature(b, [new THREE.Vector3(-aw - 0.3, yE, zc - D * 0.45), new THREE.Vector3(aw + 0.3, yE, zc - D * 0.45)], { order: 'corinthian', columnHeight: H, D, material: 'marble', detail, depth: hz - zc }, { caps: true });
    pediment(b, { order: 'corinthian', span: 2 * aw + 0.6, cornice: ent.dims.cornice, depth: 0.9 * D, friezeX: ent.friezeX, pitchDeg: 13, material: 'marble', detail, D, relief: detail === 'high' }, T(0, yE + ent.dims.total, zc - D * 0.45));
    // Roof of the aedes over the pediment's span.
    const rise2 = (aw + 0.3) * Math.tan((13 * Math.PI) / 180);
    const yR = yE + ent.dims.total;
    for (const sx of [-1, 1]) {
      const g2 = new THREE.BoxGeometry(Math.hypot(aw + 0.6, rise2), 0.2, hz - zc + 1.0);
      g2.rotateZ(sx * -Math.atan2(rise2, aw + 0.6));
      g2.translate((sx * (aw + 0.6)) / 2, yR + rise2 / 2 + 0.1, (zc + hz) / 2 + 0.2);
      b.add(g2, 'roof_tile', I);
    }
    // Hall walls from the column line up to the entablature (the hall is taller than the range),
    // the back wall up to the roof, and the back gable.
    for (const sx of [-1, 1]) span(b, 'marble', sx * aw - t / 2, yS, zH + 0.6, sx * aw + t / 2, yE + ent.dims.total, hz, I);
    span(b, 'marble', -aw, yS, hz - t, aw, yE + ent.dims.total, hz, I);
    {
      const shape = new THREE.Shape([new THREE.Vector2(-aw - 0.3, 0), new THREE.Vector2(aw + 0.3, 0), new THREE.Vector2(0, (aw + 0.3) * Math.tan((13 * Math.PI) / 180))]);
      const gg = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
      gg.translate(0, yE + ent.dims.total, hz - t);
      b.add(gg, 'marble', I);
    }
    // Apse in the back wall with Peace enthroned, the menorah and the table of the showbread.
    const R = aw * 0.42;
    apse(b, { radius: R, height: H * 0.62, thickness: 0.6, material: 'marble', domeMaterial: 'plaster_white', detail, collide: false }, T(0, yS + 0.36, hz - t - R - 0.1));
    const ys = yS + 0.36;
    span(b, 'marble', -R + 0.2, ys, hz - t - R - 0.6, R - 0.2, ys + 1.0, hz - t - 0.4, I, true);
    seatedDeity(b, TRS(0, ys + 1.0, hz - t - R * 0.55, 0, 0, 0, 2.4), { material: 'marble', detail: detail === 'high' ? 'high' : 'low', throneMaterial: 'gilded_bronze' });
    const mz = zH + (hz - zH) * 0.55;
    // The golden lampstand.
    span(b, 'marble', -3.6, ys, mz - 0.7, -2.2, ys + 1.0, mz + 0.7, I, true);
    menorah(b, T(-2.9, ys + 1.0, mz), detail);
    // The table of the showbread, with the silver trumpets laid on it.
    span(b, 'marble', 2.2, ys, mz - 0.7, 3.6, ys + 1.0, mz + 0.7, I, true);
    box(b, 'gilded_bronze', 2.9, ys + 1.0 + 0.45, mz, 1.0, 0.06, 0.5, I);
    for (const dx of [-0.42, 0.42]) for (const dz of [-0.2, 0.2]) box(b, 'gilded_bronze', 2.9 + dx, ys + 1.0 + 0.21, mz + dz, 0.05, 0.42, 0.05, I);
    for (const dz of [-0.12, 0.12]) {
      const tr = new THREE.CylinderGeometry(0.015, 0.06, 1.1, 8);
      tr.rotateZ(Math.PI / 2);
      tr.translate(2.9, ys + 1.52, mz + dz);
      b.add(tr, 'lead', I);
    }
    spots.push(spotAt('spoils', 'shrine', 0, ys, mz - 3.2, 0, mz, { label: 'The spoils of Jerusalem: the golden lampstand and the table' }));
    spots.push(spotAt('pax', 'shrine', 0, ys, hz - t - R - 2.6, 0, hz - t, { label: 'Pax, enthroned' }));
    const text = inscription(b, ['PACI AETERNAE', 'IMP CAESAR VESPASIANVS AVG'], 4.2, 1.0, T(0, yE + ent.dims.architrave * 0.5, zc - D * 0.45 - 0.05), 'bronze');
    spots.push(
      spotAt('dedication', 'inscription', 0, Y0, zc - 8, 0, zc, {
        label: 'The Temple of Peace',
        text,
        gloss: 'To eternal Peace — the Emperor Caesar Vespasian Augustus, after the Jewish war (dedicated AD 75). (Reconstructed text.)',
      }),
    );
  }

  // ---- the library (NE hall): book cupboards (armaria) and reading tables
  {
    const x0 = aw + t;
    const x1 = hx;
    const ys = Y0 + 0.4;
    const zb = hz - t - 0.35;
    for (let x = x0 + 1.2; x < x1 - 1.2; x += 2.2) {
      box(b, 'wood_dark', x, ys + 1.2, zb, 1.8, 2.4, 0.6, I, true);
      if (detail === 'high') for (let r = 0; r < 4; r++) box(b, 'fabric_ochre', x, ys + 0.35 + r * 0.55, zb - 0.31, 1.6, 0.3, 0.02, I);
    }
    for (const x of [x0 + (x1 - x0) * 0.3, x0 + (x1 - x0) * 0.7]) {
      span(b, 'wood', x - 1.4, ys + 0.75, zH + 4.0, x + 1.4, ys + 0.85, zH + 5.2, I);
      for (const dx of [-1.2, 1.2]) post(b, 'wood_dark', x + dx, ys, zH + 4.6, 0.75, 0.05, I, 6);
    }
    const lx = (x0 + x1) / 2;
    spots.push(spotAt('library-scrolls', 'container', lx, ys, zb - 1.5, lx, zb, { label: 'Book cupboards of the Bibliotheca Pacis' }));
    spots.push(spotAt('librarian', 'npc', lx + 2, ys, zH + 3, lx, zH + 4.6, { label: 'Librarian of the Temple of Peace' }));
  }

  // ---- the plan hall (SW): a marble plan of the city on the back wall
  {
    const x0 = -hx;
    const x1 = -aw - t;
    const ys = Y0 + 0.4;
    const pw = Math.min(x1 - x0 - 2, 16);
    const ph = Math.min(hallTop - ys - 2.0, pw * 0.72);
    const geo = new THREE.PlaneGeometry(pw, ph);
    geo.rotateY(Math.PI);
    geo.translate((x0 + x1) / 2, ys + 1.2 + ph / 2, hz - t - 0.06);
    b.add(geo, cityPlanRelief(), I, { uv: 'keep', castShadow: false });
    spots.push(
      spotAt('forma-urbis', 'inscription', (x0 + x1) / 2, ys, hz - t - 6, (x0 + x1) / 2, hz - t, {
        label: 'A marble plan of the city',
        text: 'FORMA VRBIS',
        gloss: 'A plan of Rome incised on marble slabs, ward by ward, every house and colonnade drawn in red. (Hypothetical Flavian predecessor of the Severan plan that will hang here after 203.)',
      }),
    );
  }

  // ---- the garden: six raised beds of roses, two water channels along the central walk
  {
    const zg0 = (-hz + dep) + 4.5;
    const zg1 = zH - 4.0;
    const beds = [-37.5, -22.5, -7.5, 7.5, 22.5, 37.5].map((x) => x * S);
    const bw = 6 * S;
    for (const x of beds) {
      const k = 0.16;
      span(b, 'marble', x - bw / 2, Y0, zg0, x + bw / 2, Y0 + 0.45, zg0 + k, I, true);
      span(b, 'marble', x - bw / 2, Y0, zg1 - k, x + bw / 2, Y0 + 0.45, zg1, I, true);
      span(b, 'marble', x - bw / 2, Y0, zg0, x - bw / 2 + k, Y0 + 0.45, zg1, I, true);
      span(b, 'marble', x + bw / 2 - k, Y0, zg0, x + bw / 2, Y0 + 0.45, zg1, I, true);
      span(b, 'grass', x - bw / 2 + k, Y0, zg0 + k, x + bw / 2 - k, Y0 + 0.38, zg1 - k, I);
    }
    // Euripi beside the central walk.
    for (const sx of [-1, 1]) {
      const x = sx * 2.4 * S * 1.6;
      basin(b, 1.0, zg1 - zg0, 0.4, T(x, Y0, (zg0 + zg1) / 2), { rim: 0.15, material: 'marble' });
    }
    // Statues of the Greek masterpieces along the walks.
    const kinds = ['nude', 'draped', 'togate', 'nude', 'draped', 'armored'] as const;
    let i = 0;
    for (const x of [-15, 15].map((v) => v * S)) {
      for (let z = zg0 + 6; z < zg1 - 4; z += 12) {
        span(b, 'marble', x - 0.5, Y0, z - 0.5, x + 0.5, Y0 + 1.3, z + 0.5, I, true);
        figure(b, kinds[i++ % kinds.length], TRS(x, Y0 + 1.3, z, 0, x < 0 ? Math.PI / 2 : -Math.PI / 2, 0), { scale: 1.1, material: i % 2 ? 'bronze' : 'marble', detail });
      }
    }
    // Rose beds (the garden was famous for them).
    if (detail === 'high') plantRoses(b, ctx.rng, beds, bw, zg0, zg1);
    spots.push(spotAt('garden', 'sit', 0, Y0, (zg0 + zg1) / 2, 4, (zg0 + zg1) / 2, { label: 'Bench by the water channels' }));
  }

  // ---- outer walls above the portico walls where the hall range is higher (NE/SW ends)
  void pTop;
  void wall;
}

/** The menorah: base, stem, three pairs of branches and seven lamps. 1:1 (≈ 1.5 m). */
function menorah(b: MeshBuilder, at: THREE.Matrix4, detail: Detail) {
  const seg = detail === 'high' ? 12 : 6;
  // Stepped base.
  for (let k = 0; k < 3; k++) {
    const g = new THREE.CylinderGeometry(0.42 - k * 0.1, 0.46 - k * 0.1, 0.14, 6);
    g.translate(0, 0.07 + k * 0.14, 0);
    b.add(g, 'gilded_bronze', at);
  }
  const stem = new THREE.CylinderGeometry(0.04, 0.05, 1.1, seg);
  stem.translate(0, 0.42 + 0.55, 0);
  b.add(stem, 'gilded_bronze', at);
  const top = 1.52;
  for (const r of [0.18, 0.32, 0.46]) {
    const arc = new THREE.TorusGeometry(r, 0.025, 5, seg, Math.PI);
    arc.rotateZ(Math.PI);
    arc.translate(0, top, 0);
    b.add(arc, 'gilded_bronze', at);
    for (const sx of [-1, 1]) {
      const lamp = new THREE.CylinderGeometry(0.05, 0.03, 0.06, 8);
      lamp.translate(sx * r, top + 0.03, 0);
      b.add(lamp, 'gilded_bronze', at);
    }
  }
  const lamp = new THREE.CylinderGeometry(0.05, 0.03, 0.06, 8);
  lamp.translate(0, top + 0.03, 0);
  b.add(lamp, 'gilded_bronze', at);
}

/**
 * Rose bushes along the beds: cheap merged blobs (≈ 100 triangles each) with flower heads, so
 * several hundred cost one or two draw calls (the vegetation module's oleander is ~1.6k each).
 */
function plantRoses(b: MeshBuilder, rng: LandmarkContext['rng'], beds: number[], bw: number, z0: number, z1: number) {
  const bush = new THREE.IcosahedronGeometry(0.5, 1);
  bush.scale(1, 0.75, 1);
  const flower = new THREE.OctahedronGeometry(0.07);
  const colours = [paint(PAINT.rose, 0.8), paint('#E8A0B4', 0.8), paint('#F4EEE6', 0.8)];
  for (const x of beds) {
    for (let z = z0 + 0.9; z < z1 - 0.7; z += 2.0) {
      for (const dx of [-bw * 0.24, bw * 0.24]) {
        const px = x + dx + rng.range(-0.2, 0.2);
        const pz = z + rng.range(-0.25, 0.25);
        const sc = rng.range(0.8, 1.15);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(px, Y0 + 0.38 + 0.32 * sc, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.range(0, 6.28), 0)), new THREE.Vector3(sc, sc, sc));
        b.add(bush, 'foliage_broad', m, { uvScale: 1.2 });
        const col = colours[rng.int(0, colours.length - 1)];
        for (let k = 0; k < 4; k++) {
          const a = rng.range(0, Math.PI * 2);
          const e = rng.range(0.15, 1.2);
          const r = 0.5 * sc;
          b.add(flower, col, T(px + Math.cos(a) * Math.cos(e) * r, Y0 + 0.38 + 0.32 * sc + Math.sin(e) * r * 0.75, pz + Math.sin(a) * Math.cos(e) * r), { castShadow: false });
        }
      }
    }
  }
}

function pacisFar(b: MeshBuilder) {
  const P = PACIS;
  const hx = P.hx * S;
  const hz = P.hz * S;
  const dep = P.porticoDepth * S;
  const top = Y0 + 9.0;
  span(b, 'grass', -hx + dep, -0.4, -hz + dep, hx - dep, Y0, P.zHalls * S, undefined);
  const corners: [number, number][] = [
    [-hx, -hz],
    [hx, -hz],
    [hx, hz],
    [-hx, hz],
  ];
  for (let i = 0; i < 4; i++) farWall(b, 'marble', corners[i][0], corners[i][1], corners[(i + 1) % 4][0], corners[(i + 1) % 4][1], 0.9, -0.5, top);
  leanTo(b, 'roof_tile', -hx, hx, -hz, top, -hz + dep, top - 1.2, undefined);
  leanTo(b, 'roof_tile', -hx, hx, P.zHalls * S - dep, top, hz, top + 2.5, undefined);
  farColonnade(b, 'porphyry', -hx + dep, hx - dep, -hz + dep, Y0, P.colH * S, 18, 0.5, undefined);
  span(b, 'marble', -P.aedesHW * S, Y0, P.zHalls * S, P.aedesHW * S, Y0 + 13.5, hz, undefined);
}

export const builders: LandmarkBuilder[] = [
  {
    handles: ['templum-pacis'],
    build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildPacis(ctx, b, d, spots), { far: ctx.detail === 'high' && pacisFar, cull: 340 }),
  },
];
