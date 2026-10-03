/**
 * Theatre of Marcellus (Augustus, 13/11 BC; stage restored by Vespasian). Travertine facade of
 * 41 arched bays on a semicircle in two arcaded orders (Doric, Ionic) under an attic with
 * Corinthian pilasters and velarium masts; behind it a vaulted ambulatory, the stepped cavea
 * (1:1 seats, walkable aisles), the orchestra, a raised stage (pulpitum) and the two-storey
 * columnar scaenae frons with three doors, the side halls and the stage building toward the river.
 *
 * Local frame: facade (the curve) faces −z, stage at +z (toward the river and the island).
 * The orchestra centre sits on the axis, behind the footprint centre (atlas note: (−425, 92)).
 * Entry: through any facade arch into the ambulatory, which leads at both ends into the vaulted
 * side passages (aditus maximi) and on into the orchestra; the aisles climb the cavea.
 */
import * as THREE from 'three';
import { T, ProfileBuilder, sweep, extrudePolygon, mul, type V2 } from '../../../arch/common/geom';
import { inscriptionPanel, paintedSign } from '../../../arch/common/inscription';
import { stairs, stepCount } from '../../../arch/common/stairs';
import { wall } from '../../../arch/common/walls';
import { ellipticalArcade, caveaSection, type CaveaSpec } from '../../../arch/classical/amphitheatre';
import { column } from '../../../arch/classical/column';
import { entablature } from '../../../arch/classical/entablature';
import { entablatureDims } from '../../../arch/classical/orders';
import { porticus } from '../../../arch/classical/porticus';
import type { ArcadeStorey } from '../../../arch/classical/arch';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { draw, farBoxes, riverEnv, simpleColonnade, spot } from './river-kit';

/** Atlas: orchestra centre (real metres). */
const ORCHESTRA: [number, number] = [-425, 92];

function theatreMarcellus(ctx: LandmarkContext) {
  const { S, lm } = ctx;
  const hi = ctx.detail === 'high';
  const b = ctx.builder();
  const env = riverEnv(ctx);
  const fp = lm.footprint as { w: number; d: number };
  const z0 = env.local(ORCHESTRA[0], ORCHESTRA[1])[1];
  const O = T(0, 0, z0);
  const d = draw(b, O);

  // ---- dimensions (game metres)
  const R = (fp.w / 2) * S; // outer face of the facade
  const wallD = 1.4;
  const amb = 3.2;
  const innerT = 0.9;
  const Htot = lm.height * S; // 32.6 m real
  const storeys: ArcadeStorey[] = [
    { order: 'doric', height: 11.4 * S },
    { order: 'ionic', height: 10.6 * S, pedestal: 1.0 * S },
    { order: 'corinthian', height: 10.6 * S, kind: 'attic', pedestal: 0.6 * S, windows: 'alternate' },
  ];
  const yS1 = storeys[0].height;
  const yS2 = yS1 + storeys[1].height;
  const back = (fp.d / 2) * S - z0; // back wall, relative to the orchestra centre
  const rb = R - wallD - amb - innerT; // cavea back face

  // ---- cavea section: 1:1 seats (0.44 × 0.7), two tiers, a top walk under a portico
  const caveaSpec: CaveaSpec = {
    arenaRx: 1,
    arenaRz: 1,
    podium: 0.9,
    tiers: [
      { rows: hi ? 11 : 11, rise: 0.44, depth: 0.7, walk: 2.0 },
      { rows: 9, rise: 0.44, depth: 0.7, wall: 1.4 },
    ],
    topWalk: 1.6,
    material: 'travertine',
    seatMaterial: 'marble',
    riserMaterial: 'tufa',
  };
  const sec = caveaSection(caveaSpec);
  const ro = rb - sec.reach; // orchestra radius
  const caveaTop = sec.height;

  // ---- facade: 41 bays on the front semicircle (82 round a full circle), split so the ground
  // storey (seen up close) keeps the full arch mouldings and keystones; the upper ones are simpler.
  const facadeMat: MaterialId = 'travertine';
  const arc = { rx: R, rz: R, bays: 82, from: 41, to: 82, depth: wallD, material: facadeMat, pier: (Math.PI * (R - wallD / 2) / 41) * 0.34 };
  ellipticalArcade(b, { ...arc, storeys: [storeys[0]], detail: 'low', columnDetail: 'low' }, O);
  ellipticalArcade(b, { ...arc, storeys: [storeys[1], storeys[2]], detail: 'low', columnDetail: 'low', masts: true }, mul(O, T(0, yS1, 0)));

  // ---- ambulatory: floors / vaults behind the facade, the inner ring wall, the roof
  const N = hi ? 48 : 24;
  const ring = (r: number, a0 = Math.PI, a1 = Math.PI * 2, n = N) => {
    const out: THREE.Vector3[] = [];
    for (let k = 0; k <= n; k++) {
      const a = a0 + ((a1 - a0) * k) / n;
      out.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    return out;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number) => new ProfileBuilder(x0, y0).to(x1, y0).to(x1, y1).to(x0, y1).build();
  const ambIn = rb;
  const ambOut = R - wallD + 0.15;
  for (const y of [yS1, yS2]) b.add(sweep(rect(0, y - 0.45, ambOut - ambIn, y), ring(ambIn), { back: true, caps: true }), 'concrete', O, { castShadow: false });
  b.add(sweep(rect(0, Htot - 0.5, ambOut - ambIn + 0.2, Htot - 0.2), ring(ambIn), { back: true, caps: true }), 'roof_tile', O);
  // Inner ring wall (cavea back) full height, travertine/tufa, with dark stair mouths toward the ambulatory.
  b.add(sweep(rect(0, 0, innerT, Htot), ring(rb), { back: true, caps: true }), 'reticulatum', O);
  // Its colliders (one box per segment) keep people on the top walk from falling into the ambulatory.
  for (let k = 0; k < N; k++) {
    const a0 = Math.PI + (Math.PI * k) / N;
    const a1 = Math.PI + (Math.PI * (k + 1)) / N;
    const am = (a0 + a1) / 2;
    const rr = rb + innerT / 2;
    const len = 2 * rr * Math.sin((a1 - a0) / 2) + 0.1;
    const w = mul(O, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(am) * rr, Htot / 2, Math.sin(am) * rr), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -am - Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1)));
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    w.decompose(pos, q, new THREE.Vector3());
    b.collider({ kind: 'box', center: pos, half: new THREE.Vector3(len / 2, Htot / 2, innerT / 2), rotation: q });
  }
  if (hi) {
    for (let k = 0; k < 12; k++) {
      const a = Math.PI + (Math.PI * (k + 0.5)) / 12;
      const r = rb + innerT + 0.02;
      const g = new THREE.BoxGeometry(1.5, 2.7, 0.04);
      const m = new THREE.Matrix4().makeRotationY(-a + Math.PI / 2).setPosition(Math.cos(a) * r, 1.35, Math.sin(a) * r);
      b.add(g, 'black', mul(O, m), { castShadow: false });
    }
  }
  // Ambulatory floor (paving) so the corridor reads as built.
  b.add(sweep(rect(0, 0.02, ambOut - ambIn - 0.1, 0.08), ring(ambIn + innerT), { back: true }), 'paving_travertine', O, { castShadow: false });

  // ---- cavea seating (semicircle), aisles, colliders
  semicircleCavea(b, caveaSpec, ro, { segments: N, aisles: 6, detail: ctx.detail }, O);
  // Porticus in summa cavea: a colonnade on the top walk facing the stage.
  const portR = rb - 0.9;
  simpleColonnade(d, ring(portR, Math.PI * 2, Math.PI, hi ? 24 : 12).map((p) => [p.x, p.z] as V2), {
    y: caveaTop, height: 4.6, D: 0.46, spacing: 2.9, mat: 'marble', roofDepth: 1.3, seg: hi ? 8 : 6, collide: true,
  });

  // ---- orchestra floor (semicircle + strip to the stage), marble
  const pulpFront = 3.2; // z of the stage front (relative to O)
  const orch: V2[] = [];
  for (let k = 0; k <= 32; k++) {
    const a = Math.PI + (Math.PI * k) / 32;
    orch.push([Math.cos(a) * ro, -Math.sin(a) * ro]);
  }
  orch.push([ro, -pulpFront], [-ro, -pulpFront]);
  const floor = new THREE.ShapeGeometry(new THREE.Shape(orch.map(([x, y]) => new THREE.Vector2(x, y))));
  floor.rotateX(-Math.PI / 2);
  floor.translate(0, 0.05, 0);
  b.add(floor, 'marble_veined', O, { castShadow: false });
  // Aditus strip floors (paved passages along the diameter, both sides).
  for (const sx of [-1, 1]) d.span('paving_travertine', sx * ro, 0, 0, sx * (R + 0.2), 0.05, pulpFront, { shadow: false });

  // ---- stage (pulpitum): 1:1 height, niche-decorated front, side steps from the orchestra
  const Ws = Math.min(R - 12.5, ro * 2.1); // half-width of the stage between the side halls
  const stageD = 6.2;
  const stageH = 1.25;
  const sfZ = pulpFront + stageD; // scaenae frons face
  d.span('marble', -Ws, 0, pulpFront, Ws, stageH, sfZ, { collide: true });
  d.span('wood', -Ws + 0.05, stageH, pulpFront + 0.05, Ws - 0.05, stageH + 0.03, sfZ, { shadow: false });
  if (hi) {
    // Alternating rectangular and curved niches on the pulpitum front (dark recesses).
    for (let k = -5; k <= 5; k++) {
      const x = k * (Ws / 5.5);
      d.span('black', x - 0.45, 0.25, pulpFront - 0.005, x + 0.45, stageH - 0.25, pulpFront + 0.01, { shadow: false });
    }
  }
  for (const sx of [-1, 1]) {
    // Steps up onto the stage front at each end (1:1).
    const { count, rise } = stepCount(stageH, 0.2);
    stairs(b, { width: 1.8, rise, run: 0.32, count, material: 'marble' }, mul(O, T(sx * (ro - 1.8), 0, pulpFront - count * 0.32)));
  }

  // ---- scaenae frons: wall with three doors (regia + two hospitalia) and two storeys of columns
  const sfH = Math.min(Htot - 2.5, 17.5);
  const sfT = 1.2;
  const doorW = 2.6;
  wall(b, {
    length: Ws * 2,
    height: sfH - stageH,
    thickness: sfT,
    material: 'marble',
    frameMaterial: 'marble_giallo',
    openings: [
      { kind: 'door', x: Ws - Ws * 0.45, width: doorW * 0.85, height: 3.4, leaves: 'closed', leafMaterial: 'wood_dark' },
      { kind: 'door', x: Ws, width: doorW, height: 4.2, leaves: 'open', leafMaterial: 'bronze' },
      { kind: 'door', x: Ws + Ws * 0.45, width: doorW * 0.85, height: 3.4, leaves: 'closed', leafMaterial: 'wood_dark' },
      { kind: 'niche', x: Ws * 0.3, width: 1.6, height: 3.2, sill: 4.6 },
      { kind: 'niche', x: Ws * 1.7, width: 1.6, height: 3.2, sill: 4.6 },
    ],
    collide: true,
    detail: ctx.detail,
  }, mul(O, T(-Ws, stageH, sfZ + sfT / 2)));
  d.span('black', -doorW / 2 + 0.05, stageH, sfZ + sfT - 0.1, doorW / 2 - 0.05, stageH + 4.1, sfZ + sfT + 0.4, { shadow: false });
  // Columns: lower storey on the stage, upper storey on a projecting podium line.
  const colMats: MaterialId[] = ['marble_pavonazzetto', 'marble_giallo', 'porphyry', 'marble_giallo', 'marble_pavonazzetto'];
  const lowH = (sfH - stageH) * 0.5;
  const upH = (sfH - stageH) * 0.32;
  const lowE = entablatureDims('corinthian', lowH).total;
  const upY = stageH + lowH + lowE;
  const Dl = lowH / 10;
  const Du = upH / 10;
  const nCol = hi ? 14 : 8;
  const colXs: number[] = [];
  for (let k = 0; k < nCol; k++) colXs.push(-Ws + 1.2 + ((2 * Ws - 2.4) * k) / (nCol - 1));
  colXs.forEach((x, k) => {
    if (Math.abs(x) < doorW * 0.9) return; // keep the royal door clear
    const mat = colMats[k % colMats.length];
    column(b, { order: 'corinthian', D: Dl, height: lowH, material: mat, trimMaterial: 'marble', detail: hi && Math.abs(x) < 5 ? 'high' : 'low', collide: true }, mul(O, T(x, stageH, sfZ - Dl * 1.2)));
    column(b, { order: 'corinthian', D: Du, height: upH, material: colMats[(k + 2) % colMats.length], trimMaterial: 'marble', detail: 'low', collide: false }, mul(O, T(x, upY, sfZ - Du * 1.2)));
  });
  // Entablatures over each storey of columns (straight runs across the frons).
  const entPath = (y: number, z: number) => [new THREE.Vector3(-Ws + 0.3, y, z), new THREE.Vector3(Ws - 0.3, y, z)];
  entablature(b, entPath(stageH + lowH, sfZ - Dl * 1.2 - Dl * 0.5), { order: 'corinthian', columnHeight: lowH, D: Dl, material: 'marble', detail: ctx.detail, depth: Dl * 1.8 }, { at: O, caps: true });
  entablature(b, entPath(upY + upH, sfZ - Du * 1.2 - Du * 0.5), { order: 'corinthian', columnHeight: upH, D: Du, material: 'marble', detail: 'low', depth: Du * 1.8 }, { at: O, caps: true });
  // Restoration inscription over the royal door [C: Suetonius, Vesp. 19 — Vespasian restored the stage].
  inscriptionPanel(b, { lines: ['IMP·CAESAR·VESPASIANVS·AVG', 'SCAENAM·RESTITVIT'], width: 4.4, height: 0.9, style: 'bronze', ground: '#d8d2c6' }, mul(O, T(0, stageH + 5.0, sfZ - 0.04)), { depth: 0.04 });
  // Stage roof, sloping down toward the audience.
  const roofY0 = sfH + 0.3;
  const roofG = new THREE.BoxGeometry(Ws * 2 + 0.6, 0.25, stageD + 0.8);
  roofG.rotateX(-0.09);
  roofG.translate(0, roofY0 - 0.3, pulpFront + (stageD + 0.8) / 2 - 0.2);
  b.add(roofG, 'wood_dark', O);
  const roofT = new THREE.BoxGeometry(Ws * 2 + 0.8, 0.12, stageD + 1.0);
  roofT.rotateX(-0.09);
  roofT.translate(0, roofY0 - 0.12, pulpFront + (stageD + 0.8) / 2 - 0.2);
  b.add(roofT, 'roof_tile', O);

  // ---- side halls (basilicae / versurae) and the aditus maximi between them and the cavea
  const hallZ0 = pulpFront;
  const hallZ1 = Math.min(back, pulpFront + 9);
  const aditH = 4.6;
  for (const sx of [-1, 1]) {
    const xIn = sx * Ws;
    const xOut = sx * R;
    // Hall block (travertine faces, tiled roof hidden behind the parapet).
    d.span('travertine', Math.min(xIn, xOut), 0, hallZ0, Math.max(xIn, xOut), Htot - 1.5, hallZ1, { collide: true });
    // Door into the hall from the stage end (dark) and a high window row.
    d.span('black', xIn - sx * 0.02, stageH, hallZ0 + 1.5, xIn + sx * 0.02, stageH + 3.0, hallZ0 + 3.2, { shadow: false });
    // Vault over the aditus with the tribunal (box seats) above, balustrade toward the orchestra.
    const ax0 = sx * (ro + 5.5);
    d.span('concrete', Math.min(ax0, xOut), aditH, 0, Math.max(ax0, xOut), aditH + 0.6, hallZ0, { collide: true });
    d.span('travertine', Math.min(ax0, xOut), aditH + 0.6, hallZ0 - 0.4, Math.max(ax0, xOut), aditH + 1.6, hallZ0);
    d.span('marble', ax0 - sx * 0.3, aditH + 0.6, 0, ax0, aditH + 1.7, hallZ0, { collide: false });
    d.span('marble', Math.min(ax0, xOut), aditH + 0.6, 0, Math.max(ax0, xOut), aditH + 1.7, 0.3);
    // Side wall of the stage building with the arched aditus portal (opening toward the street).
    wall(b, {
      length: back + 0.2,
      height: Htot - 1.5,
      thickness: 1.2,
      material: 'travertine',
      openings: [{ kind: 'arch', x: 0.2 + pulpFront / 2, width: pulpFront - 0.3, height: aditH - 0.1, frame: false }],
      courses: hi ? 0.6 : undefined,
      collide: true,
      detail: ctx.detail,
    }, mul(O, new THREE.Matrix4().makeRotationY(sx > 0 ? -Math.PI / 2 : Math.PI / 2).setPosition(sx * (R + 0.6), 0, sx > 0 ? -0.2 : back)));
  }

  // ---- stage building behind the frons: full width to the back wall, facing the river
  d.span('tufa', -R, 0, sfZ + sfT, R, Htot - 1.5, back - 0.6, { collide: true });
  d.span('roof_tile', -R + 0.4, Htot - 1.5, Math.min(hallZ1, sfZ + sfT), R - 0.4, Htot - 1.1, back - 0.6);
  // Back facade toward the Tiber: travertine with pilasters, doors and a cornice.
  wall(b, {
    length: 2 * R,
    height: Htot - 1.5,
    thickness: 1.2,
    material: 'travertine',
    openings: [-0.6, -0.2, 0.2, 0.6].map((f, i) => ({ kind: 'door' as const, x: R + f * R, width: i === 1 || i === 2 ? 2.6 : 2.2, height: 3.6, leaves: 'closed' as const, leafMaterial: 'wood_dark' as MaterialId })),
    courses: hi ? 0.6 : undefined,
    collide: true,
    detail: ctx.detail,
  }, mul(O, new THREE.Matrix4().makeRotationY(Math.PI).setPosition(R, 0, back)));
  for (let k = -6; k <= 6; k++) d.span('travertine', k * (R / 6.5) - 0.35, 6.4, back + 0.6, k * (R / 6.5) + 0.35, Htot - 2.2, back + 0.9);
  d.span('travertine', -R - 0.2, Htot - 2.2, back + 0.5, R + 0.2, Htot - 1.5, back + 1.1);
  d.span('travertine', -R - 0.1, 12.3, back + 0.5, R + 0.1, 12.7, back + 0.95);
  // Upper windows lighting the stage building.
  for (let k = -6; k < 6; k++) {
    const x = (k + 0.5) * (R / 6.5);
    d.span('black', x - 0.55, 13.6, back + 0.6, x + 0.55, 15.6, back + 0.64, { shadow: false });
    d.span('black', x - 0.45, 8.2, back + 0.6, x + 0.45, 9.8, back + 0.64, { shadow: false });
  }
  // Portico along the river side of the stage building (porticus post scaenam).
  porticus(b, [new THREE.Vector3(R - 0.8, 0, back + 4.2), new THREE.Vector3(-R + 0.8, 0, back + 4.2)], {
    order: 'tuscan', columnHeight: 5.6, depth: 3.6, back: 'none', stylobate: 0.3, material: 'travertine', roofMaterial: 'roof_tile',
    detail: 'low', columnDetail: 'low', spacing: 3.6,
  }, O);

  // ---- notices and dedications
  // Playbill for the Ludi Apollinares (6–13 July), painted by the main axis arch.
  paintedSign(b, ['LVDI APOLLINARES', 'PRIDIE NONAS IVLIAS', 'IN THEATRO MARCELLI'], 2.2, 1.0, mul(O, T(1.9, 1.9, -R - 0.04)));

  // ---- spots
  const spots: Spot[] = [
    spot('theatre-marcellus:entrance', 'door', 0, 0, z0 - R - 1.5, 0),
    spot('theatre-marcellus:playbill', 'inscription', 1.9, 0, z0 - R - 1.6, 0),
    spot('theatre-marcellus:dedication', 'inscription', 0, stageH, z0 + sfZ - 2.5, Math.PI),
    spot('theatre-marcellus:stage', 'npc', 0, stageH, z0 + pulpFront + 2.5, Math.PI),
    spot('theatre-marcellus:orchestra', 'spawn', 0, 0, z0 - ro * 0.4, 0),
    spot('theatre-marcellus:summa-cavea', 'vista', 0, caveaTop, z0 - rb + 1.2, 0),
  ];
  // A few seats for NPC audiences (on the rows near the aisles).
  for (const [k, row] of [[0, 2], [1, 6], [2, 9], [3, 14], [4, 18]] as const) {
    const r = sec.rows[Math.min(row, sec.rows.length - 1)];
    const a = Math.PI + (Math.PI * (k + 0.8)) / 5.5;
    const rr = ro + (r.x0 + r.x1) / 2;
    spots.push(spot(`theatre-marcellus:seat-${k}`, 'sit', Math.cos(a) * rr, r.y, z0 + Math.sin(a) * rr, Math.atan2(-Math.cos(a), -Math.sin(a))));
  }

  // ---- far stand-in: half ring of facade, block of the stage building
  const far = theatreFar(R, wallD, Htot, back, z0);
  return { object: b.build(lm.id), colliders: b.colliders, spots, far, cullDistance: 1100 };
}

/** Cheap far massing: the facade as a faceted half ring, the stage block. */
function theatreFar(R: number, wallD: number, H: number, back: number, z0: number): THREE.Object3D {
  const boxes: Parameters<typeof farBoxes>[0] = [];
  const n = 14;
  for (let k = 0; k < n; k++) {
    const a = Math.PI + (Math.PI * (k + 0.5)) / n;
    const len = (Math.PI * R) / n + 0.4;
    boxes.push({ mat: 'travertine', c: [Math.cos(a) * (R - wallD), H / 2, z0 + Math.sin(a) * (R - wallD)], s: [len, H, wallD * 2.5], ry: -a - Math.PI / 2 });
  }
  boxes.push({ mat: 'tufa', c: [0, (H - 1.5) / 2, z0 + (3 + back) / 2], s: [2 * R, H - 1.5, back - 3] });
  boxes.push({ mat: 'travertine', c: [0, H * 0.3, z0 - R * 0.35], s: [R * 1.6, H * 0.6, R * 0.6] });
  return farBoxes(boxes, 'theatre-marcellus:far');
}

/**
 * Semicircular cavea (theatre): the kit's cavea section swept round the orchestra from θ = π to
 * 2π (the −z half), with end caps on the diameter line, aisle half-steps (walkable 0.22 m) and box
 * colliders per row and segment.
 */
function semicircleCavea(b: MeshBuilder, spec: CaveaSpec, ro: number, o: { segments: number; aisles: number; detail: 'high' | 'low' }, at: THREE.Matrix4) {
  const { profile, rows, walls } = caveaSection(spec);
  const mat = spec.material ?? 'travertine';
  const seat = spec.seatMaterial ?? 'marble';
  const n = o.segments;
  const path: THREE.Vector3[] = [];
  for (let k = 0; k <= n; k++) {
    const a = Math.PI + (Math.PI * k) / n;
    path.push(new THREE.Vector3(Math.cos(a) * ro, 0, Math.sin(a) * ro));
  }
  const toProfile = (pts: V2[]) => ({ pts: [...pts].reverse(), smooth: pts.map(() => false) });
  b.add(sweep(toProfile(profile.slice(0, 3)), path), 'marble', at);
  const seatPts = profile.slice(2);
  for (let i = 0; i < seatPts.length - 1; i++) {
    const horizontal = Math.abs(seatPts[i + 1][1] - seatPts[i][1]) < 1e-6;
    b.add(sweep(toProfile([seatPts[i], seatPts[i + 1]]), path), horizontal ? seat : (spec.riserMaterial ?? mat), at);
  }
  // Balustrade on the podium edge, open where each aisle comes down to the orchestra.
  const W = 1.1;
  const aisleAngles: number[] = [];
  for (let k = 0; k < o.aisles; k++) aisleAngles.push(Math.PI + (Math.PI * (k + 0.5)) / o.aisles);
  const gapAt = (seg: number) => {
    const a0 = Math.PI + (Math.PI * seg) / n;
    const a1 = Math.PI + (Math.PI * (seg + 1)) / n;
    const half = (W / 2 + 0.25) / ro;
    return aisleAngles.some((a) => a1 > a - half && a0 < a + half);
  };
  const bal = new ProfileBuilder(0.35, spec.podium).to(0.35, spec.podium + 0.95).to(0.05, spec.podium + 0.95).to(0.05, spec.podium).build();
  let run: THREE.Vector3[] = [];
  for (let k = 0; k < n; k++) {
    if (gapAt(k)) {
      if (run.length > 1) b.add(sweep(bal, run, { caps: true }), mat, at);
      run = [];
      continue;
    }
    if (run.length === 0) run.push(path[k]);
    run.push(path[k + 1]);
  }
  if (run.length > 1) b.add(sweep(bal, run, { caps: true }), mat, at);
  // End caps on the diameter line (both ends face +z, toward the stage).
  const outline: V2[] = profile.map(([x, y]) => [x, y] as V2);
  for (const sx of [-1, 1]) {
    const cap = extrudePolygon(outline.map(([x, y]) => [sx * (ro + x), y] as V2), 0.3);
    b.add(cap, mat, at);
  }
  // Aisles: half-steps up every row, flights over the praecinctio walls.
  for (let k = 0; k < o.aisles; k++) {
    const a = Math.PI + (Math.PI * (k + 0.5)) / o.aisles;
    const nx = Math.cos(a);
    const nz = Math.sin(a);
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(nz, 0, -nx), new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, nz));
    const step = (d0: number, d1: number, y0: number, y1: number) => {
      const local = basis.clone().setPosition(nx * (ro + (d0 + d1) / 2), (y0 + y1) / 2, nz * (ro + (d0 + d1) / 2));
      const g = new THREE.BoxGeometry(W, y1 - y0, d1 - d0);
      b.add(g, mat, mul(at, local), { castShadow: false });
      const w = mul(at, local);
      const pos = new THREE.Vector3();
      const q = new THREE.Quaternion();
      w.decompose(pos, q, new THREE.Vector3());
      b.collider({ kind: 'box', center: pos, half: new THREE.Vector3(W / 2, (y1 - y0) / 2, (d1 - d0) / 2), rotation: q });
    };
    for (const r of rows) {
      const prev = r.prevY ?? r.y - 0.44;
      const dd = (r.x1 - r.x0) * 0.5;
      step(r.x0 - dd, r.x0 + 0.01, prev, (prev + r.y) / 2);
    }
    for (const w of walls) {
      const cnt = Math.ceil((w.y1 - w.y0) / 0.2);
      const run = 0.34;
      for (let j = 1; j <= cnt; j++) step(w.x - (cnt - j + 1) * run, w.x + 0.01, w.y0, w.y0 + ((w.y1 - w.y0) * j) / cnt);
    }
    // Steps from the orchestra up the podium in front of each aisle.
    const pc = Math.ceil(spec.podium / 0.2);
    for (let j = 1; j <= pc; j++) step(-(pc - j + 1) * 0.34, 0.4, 0, (spec.podium * j) / pc);
  }
  // Colliders: every tread band (walkways and rows) as boxes per segment from the ground.
  const addSeg = (d0: number, d1: number, y1: number, skipGaps = false) => {
    const r0 = ro + (d0 + d1) / 2;
    for (let k = 0; k < n; k++) {
      if (skipGaps && gapAt(k)) continue;
      const a0 = Math.PI + (Math.PI * k) / n;
      const a1 = Math.PI + (Math.PI * (k + 1)) / n;
      const am = (a0 + a1) / 2;
      const len = 2 * r0 * Math.sin((a1 - a0) / 2) + 0.06;
      const local = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(am) * r0, y1 / 2, Math.sin(am) * r0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -am - Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1));
      const w = mul(at, local);
      const pos = new THREE.Vector3();
      const q = new THREE.Quaternion();
      w.decompose(pos, q, new THREE.Vector3());
      b.collider({ kind: 'box', center: pos, half: new THREE.Vector3(len / 2, y1 / 2, (d1 - d0) / 2), rotation: q });
    }
  };
  addSeg(-0.05, 0.4, spec.podium + 0.95, true);
  for (let i = 1; i < profile.length - 1; i++) {
    const [x0, y0] = profile[i];
    const [x1, y1] = profile[i + 1];
    if (Math.abs(y1 - y0) < 1e-6 && x1 > x0 + 1e-6) addSeg(Math.max(0.4, x0) - 0.01, x1 + 0.01, y0);
  }
}

export const builders: LandmarkBuilder[] = [{ handles: ['theatre-marcellus'], build: theatreMarcellus }];
