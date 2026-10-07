/**
 * Category builders for civic and everyday landmarks: basilicas, curiae, libraries, the prison,
 * palaces, houses (domus, insulae, huts), markets (open squares, macella, terraced markets),
 * warehouses (horrea), porticoes (quadriporticus gardens), baths, camps (forts, gladiator schools,
 * fire stations), harbours (stepped quays), gardens and the rest ('other': halls, districts,
 * fields, cisterns, sewer outlets…).
 *
 * The parts that the Campus Martius heroes reuse are exported: `curiaHall`, `quadriporticusGarden`,
 * `thermae`, `fort`, `quay`, `gardenLayout`.
 */
import * as THREE from 'three';
import { arcade } from '../../../arch/classical/arch';
import { basilica } from '../../../arch/classical/basilica';
import { column } from '../../../arch/classical/column';
import { diameterForHeight, type Order } from '../../../arch/classical/orders';
import { quadriga } from '../../../arch/classical/statues';
import { tholos } from '../../../arch/classical/tholos';
import { dome } from '../../../arch/classical/vaults';
import { pergola, velum } from '../../../arch/fabric/awnings';
import { treadwheelCrane } from '../../../arch/fabric/construction';
import { domus } from '../../../arch/fabric/domus';
import type { Draw } from '../../../arch/fabric/draw';
import { horrea } from '../../../arch/fabric/horrea';
import { insula } from '../../../arch/fabric/insula';
import type { BuildingOutput } from '../../../arch/fabric/types';
import { placeProp, type PropKind } from '../../../arch/props';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import {
  T, TRS, V, altar, broadTree, clearOf, cornice, crenellations, cypress, dims, draw, farDraw, finish, flight, flightLength, groundRange,
  groundWall, hedge, heightG, hintsOf, inscription, mul, sitingOf, obstacles, piercedWall, plinth, pool, railing, roundBasin, spot, statueOnPedestal,
  tiledRoof, wallRun, type Detail, type Hints, type V3, type WallOpening, liftAll,
} from './generic-common';
import { courtyardRanges, hall, liteColonnade, liteColumnAt, tabernae, vaultedAisle } from './generic-civic-lib';
import { liteArcade } from './generic-seating';
import { wallTorch, tree } from './generic-world';
import { aedicula, fittedTemple, templeMaterials } from './generic-sacred';
import { sacredGrove } from './generic-groves';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------- small shared parts

/** A gable (pediment) prism: triangle `w` wide and `rise` high on y, from z0 to z0 + depth. */
export function gable(d: Draw, mat: MaterialId, cx: number, y: number, z0: number, w: number, rise: number, depth: number) {
  const tri = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rise)]);
  d.geo(new THREE.ExtrudeGeometry(tri, { depth, bevelEnabled: false }), mat, cx, y, z0);
}

/**
 * A columnar porch (prostyle front) across x ∈ [x0, x1] at z = zc: `n` columns of height `colH` on a
 * floor at y, an architrave band, and a pediment if `pedimentDepth` > 0. Returns the top of the cornice.
 */
export function porch(d: Draw, x0: number, x1: number, zc: number, y: number, colH: number, n: number, order: Order, mat: MaterialId, detail: Detail, pedimentDepth = 0, trim: MaterialId = mat): number {
  const D = diameterForHeight(order, colH);
  for (let i = 0; i < n; i++) {
    const x = x0 + D * 0.6 + ((x1 - x0 - D * 1.2) * i) / Math.max(1, n - 1);
    column(d.b, { order, D, height: colH, material: mat, detail: detail === 'high' && n <= 8 ? 'high' : 'low', fluted: false }, mul(d.m, T(x, y, zc)));
  }
  const eh = colH * 0.22;
  const zb = zc - D * 0.7, zf = pedimentDepth > 0 ? zc + pedimentDepth : zc + D * 0.7;
  d.span(trim, x0, y + colH, zb, x1, y + colH + eh * 0.6, zf);
  d.span(trim, x0 - 0.2, y + colH + eh * 0.6, zb - 0.25, x1 + 0.2, y + colH + eh, zf);
  if (pedimentDepth > 0) gable(d, trim, (x0 + x1) / 2, y + colH + eh, zb - 0.25, x1 - x0 + 0.4, (x1 - x0) * 0.13, zf - zb + 0.25);
  return y + colH + eh;
}

/** Convert fabric spots to landmark spots (fabric `facing` points out; our heading faces the feature). */
function fabricSpots(out: BuildingOutput, prefix: string, m: THREE.Matrix4, yaw: number): Spot[] {
  const kind: Record<string, string> = { shopDoor: 'vendor', houseDoor: 'door', fountain: 'shrine', shrine: 'shrine', bench: 'sit', stall: 'stall', well: 'container', workshop: 'npc', tree: 'vista' };
  return out.spots.filter((s) => s.kind !== 'tree').map((s, i) => ({
    id: `${prefix}:${s.kind}${i}`,
    kind: kind[s.kind] ?? 'npc',
    position: s.position.clone().applyMatrix4(m),
    heading: s.facing + yaw,
  }));
}

/** Append a fabric building (generated in its own frame) into this landmark at (x, y, z, rotY). */
export function appendBuilding(d: Draw, out: BuildingOutput, x: number, y: number, z: number, rotY: number, spots: Spot[], prefix: string) {
  const m = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(rotY));
  d.b.append(out.builder, mul(d.m, m));
  spots.push(...fabricSpots(out, prefix, m, rotY));
}

const fabricDetail = (detail: Detail) => (detail === 'high' ? 'full' : 'low') as 'full' | 'low';

// ---------------------------------------------------------------- basilica

function buildBasilica(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const h = hintsOf(lm);
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const H = heightG(ctx);
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'travertine');
  const t = 1.0;
  const front = 1.4; // steps in front of the doors
  // Republican/Augustan basilicas on the Forum open onto it through two storeys of arcades (Julia's
  // piers with Tuscan half-columns, the Porticus of Gaius and Lucius before the Aemilia's shops).
  const arcaded = h.has('arcade', 'arcades', 'arcaded', 'porticus of', 'two-storey portico');
  const portD = arcaded ? clamp(dd * 0.15, 4, 7) : 0;
  const hallD = dd - portD;
  const Wa = clamp(hallD * 0.17, 3, 9);
  const Wn = Math.max(6, hallD - front - 2 * Wa - 2 * t);
  const apses = h.has('apse') ? 'both' : 'none';
  const apseR = Math.min(Wn / 2, 8);
  const L = Math.max(10, w - 2 * t - (apses === 'both' ? 2 * (apseR + t) : 0));
  const colH = clamp(H * 0.3, 4, 9);
  const zc = front / 2 + portD / 2;
  const res = basilica(d.b, {
    length: L, naveWidth: Wn, aisleWidth: Wa, columnHeight: colH, apses,
    wallMaterial: h.has('marble') ? 'marble' : 'brick', columnMaterial: h.has('granite') ? 'marble_veined' : h.has('african marble', 'giallo') ? 'marble_giallo' : 'marble',
    roofMaterial: h.has('gilded bronze tiles', 'gilded roof') ? 'gilded_bronze' : undefined,
    // Two superimposed colonnades of kit columns are heavy: the category keeps them at 'low'.
    detail: 'low', upperDetail: 'low', doors: 3,
  }, mul(d.m, T(0, 0, zc)));
  const zFront = zc - res.depth / 2 - portD; // the line of the steps' top
  if (arcaded) {
    const sh = clamp(H * 0.27, 4.6, 7.5);
    const bay = clamp(sh * 0.78, 3.6, 5.2);
    const len = res.width;
    const bays = Math.max(3, Math.floor(len / bay));
    const depthW = 1.1;
    const storeys = [
      { order: 'tuscan' as const, height: sh },
      { order: h.has('ionic') ? 'ionic' as const : 'tuscan' as const, height: sh * 0.92, pedestal: 0.9 },
    ];
    arcade(d.b, { bays, bay: len / bays, pier: (len / bays) * 0.34, depth: depthW, storeys, material: h.has('travertine') ? 'travertine' : 'marble', detail: 'low', columnDetail: detail === 'high' ? 'low' : 'far', corridor: portD - depthW / 2 }, mul(d.m, T(-len / 2, 0, zFront + depthW / 2)));
    // Lean-to roof of the upper gallery against the hall's front wall.
    tiledRoof(d, 'shed', 0, zFront + portD / 2, len, portD, sh * 1.92, 'low', { axis: 'x', pitchDeg: 14 });
    d.span('paving_travertine', -len / 2, -0.1, zFront, len / 2, 0.03, zFront + portD);
    // Shops at the back of the portico (Tabernae Novae) or gaming boards on the floor and steps.
    if (h.has('shops', 'tabernae')) {
      const n = Math.floor(len / 4.4);
      for (let i = 0; i < n; i++) d.span('black', -len / 2 + (i + 0.5) * (len / n) - 1.1, 0.03, zc - res.depth / 2 - 0.06, -len / 2 + (i + 0.5) * (len / n) + 1.1, 2.8, zc - res.depth / 2 - 0.02);
    }
    far.span('marble', -len / 2, 0, zFront, len / 2, sh * 1.92, zFront + depthW);
    // The other three sides: lighter arcades (lite geometry) round the hall, dark behind the arches.
    if (!h.has('shops', 'tabernae')) {
      // The arcade stands clear of the hall's walls (its 0.9 m depth plus a 1 m gallery behind).
      const x1 = res.width / 2 + 2.0, zb = zc + res.depth / 2 + 2.0, zf = zFront + depthW;
      const runs: V3[][] = [[V(x1, 0, zb), V(-x1, 0, zb)], [V(-x1, 0, zb), V(-x1, 0, zf)], [V(x1, 0, zf), V(x1, 0, zb)]];
      for (const run of runs) {
        liteArcade(d, run, { storeys: [{ height: sh, columns: true }, { height: sh * 0.92, columns: true, parapet: 1.0 }], bay: len / bays, depth: 0.9, material: h.has('travertine') ? 'travertine' : 'marble', detail });
        const a = run[0], b = run[1];
        const t = b.clone().sub(a).normalize();
        const n = V(t.z, 0, -t.x);
        const mid = a.clone().add(b).multiplyScalar(0.5).addScaledVector(n, -1.6);
        const L = a.distanceTo(b);
        for (const [y0, y1] of [[0.03, sh * 0.66], [sh + 1.0, sh + sh * 0.62]]) d.box('black', mid.x, (y0 + y1) / 2, mid.z, Math.abs(t.x) * L + Math.abs(t.z) * 0.05, y1 - y0, Math.abs(t.z) * L + Math.abs(t.x) * 0.05);
      }
      far.span('marble', -x1, 0, zf, x1, sh * 1.92, zb);
    }
    // The aisles behind the arches read as dim interiors (or shop mouths), not as a lit wall.
    const n = Math.max(3, Math.floor(len / (len / bays)));
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + (i + 0.5) * (len / n);
      d.span('black', x - (len / n) * 0.3, 0.03, zc - res.depth / 2 - 0.06, x + (len / n) * 0.3, sh * 0.62, zc - res.depth / 2 - 0.02);
      d.span('black', x - (len / n) * 0.25, sh + 1.0, zc - res.depth / 2 - 0.06, x + (len / n) * 0.25, sh + sh * 0.6, zc - res.depth / 2 - 0.02);
    }
  }
  // Projecting columnar porches on the facade (Basilica Ulpia: three, the middle one of 10 columns).
  let porchD = 0;
  if (!arcaded && h.has('porches', 'porch')) {
    const ph = clamp(res.height * 0.45, 5, 9.5);
    porchD = clamp(ph * 0.42, 2.5, 4.5);
    const cw = Math.min(res.width * 0.3, 30);
    const pm: MaterialId = h.has('giallo') ? 'marble_giallo' : 'marble';
    const top = porch(d, -cw / 2, cw / 2, zFront - porchD, 0, ph, /\b10 (giallo|columns)|of 10\b/.test(h.text) ? 10 : 8, 'corinthian', pm, 'low', porchD, 'marble');
    for (const sx of [-1, 1]) porch(d, sx * res.width * 0.33 - cw * 0.2, sx * res.width * 0.33 + cw * 0.2, zFront - porchD, 0, ph, 4, 'corinthian', pm, 'low', porchD, 'marble');
    if (h.has('quadriga')) quadriga(d.b, mul(d.m, TRS(0, top + cw * 0.13 + 0.3, zFront - porchD * 0.4, 0, 0, 0, 1.25)), { material: 'gilded_bronze', detail: 'low' });
    if (h.has('statues', 'bigae') && detail === 'high') for (const sx of [-1, 1]) for (let k = 1; k <= 3; k++) statueOnPedestal(d, 'emperor', sx * (cw / 2 + k * res.width * 0.09), res.height * 0.62, zc - res.depth / 2 + 0.4, 0, 1.1, 'gilded_bronze', 'low', 0.6);
  }
  // A three-step crepidoma along the front.
  const zS = zFront - porchD;
  for (let i = 0; i < 3; i++) d.span('travertine', -res.width / 2, i * 0.18 - 0.2, zS - front + i * 0.45, res.width / 2, (i + 1) * 0.18 - 0.2, zS, { collide: true });
  if (porchD) d.span('travertine', -res.width / 2, -0.2, zS, res.width / 2, 0.34, zFront, { collide: true });
  if (h.has('gaming', 'tabula lusoria')) {
    for (let i = 0; i < 6; i++) {
      const x = -res.width * 0.4 + i * res.width * 0.16;
      d.span('black', x - 0.25, 0.341, zFront - 0.42, x + 0.25, 0.345, zFront - 0.12);
    }
  }
  inscription(d, [lm.latin.split('/')[0].trim()], 0, arcaded ? clamp(H * 0.27, 4.6, 7.5) * 1.92 + 1.0 : Math.min(res.height * 0.62, colH * 1.6), arcaded ? zFront - 0.1 : zFront - 0.08, Math.min(res.width * 0.5, 12), 0.9);
  const spots = [
    spot(`${lm.id}:door`, 'door', 0, 0, zS - front - 0.5, 0),
    spot(`${lm.id}:steps`, 'sit', -res.width / 4, 0.36, zFront - 0.5, Math.PI),
    spot(`${lm.id}:steps2`, 'sit', res.width / 5, 0.16, zFront - 0.95, Math.PI),
    spot(`${lm.id}:inside`, 'npc', 0, 0.03, zc, 0),
  ];
  far.span('brick', -res.width / 2, 0, zc - res.depth / 2, res.width / 2, res.height * 0.75, zc + res.depth / 2);
  tiledRoof(far, 'gable', 0, zc, res.width, res.depth, res.height * 0.75, 'low', { axis: 'x' });
  return finish(lm.id, d, spots, far);
}

// ---------------------------------------------------------------- curia

export interface CuriaOpts {
  /** Augustus walled up the Curia of Pompey: the bronze doors are replaced by brick infill. */
  walledUp?: boolean;
  wallMat?: MaterialId;
  statue?: boolean;
}

/**
 * A senate hall (Curia Julia type) filling w × dd: a tall brick-and-stucco hall on a low podium with a
 * front stair, bronze doors, three arched windows over them and a pediment; inside, the marble floor,
 * three low tiers along each flank for the senators' chairs and the Victory on her altar at the back.
 */
export function curiaHall(d: Draw, ctx: LandmarkContext, w: number, dd: number, H: number, id: string, spots: Spot[], o: CuriaOpts = {}) {
  const detail = ctx.detail;
  const P = 0.88; // podium (4 risers of 0.22)
  const stairLen = flightLength(P);
  const z0 = -dd / 2 + stairLen + 0.3;
  const z1 = dd / 2;
  const t = 1.0;
  const wallMat = o.wallMat ?? 'brick';
  plinth(d, ctx, -w / 2, z0, w / 2, z1, P, 'travertine');
  d.span('travertine', -w / 2 + 0.6, 0, -dd / 2, w / 2 - 0.6, 0.02, z0);
  flight(d, 0, z0 - stairLen, w * 0.55, 0, P, 'marble');
  const doorW = 3.0, doorH = Math.min(6.5, H * 0.42);
  const front: WallOpening[] = [{ x: w / 2, w: doorW, h: doorH }];
  const winY = doorH + 1.6;
  for (const k of [-1, 0, 1]) front.push({ x: w / 2 + k * (w * 0.26), w: 2.0, h: 3.6, sill: winY, arched: true });
  const side: WallOpening[] = [];
  const ns = Math.max(2, Math.floor((z1 - z0) / 5));
  for (let i = 0; i < ns; i++) side.push({ x: ((i + 0.5) * (z1 - z0)) / ns, w: 1.8, h: 3.2, sill: winY + 0.5, arched: true });
  piercedWall(d, -w / 2, z0, w / 2, z0, P, H, t, wallMat, front);
  piercedWall(d, w / 2, z0, w / 2, z1, P, H, t, wallMat, side);
  piercedWall(d, w / 2, z1, -w / 2, z1, P, H, t, wallMat);
  piercedWall(d, -w / 2, z1, -w / 2, z0, P, H, t, wallMat, side.map((s) => ({ ...s, x: z1 - z0 - s.x })));
  // Facade dressing: marble revetment on the lower storey, scored stucco above, corner pilasters.
  d.span('marble', -w / 2 - 0.12, P, z0 - 0.1, -doorW / 2 - 0.5, P + doorH + 0.6, z0);
  d.span('marble', doorW / 2 + 0.5, P, z0 - 0.1, w / 2 + 0.12, P + doorH + 0.6, z0);
  d.span('plaster_white', -w / 2 - 0.05, P + doorH + 0.6, z0 - 0.06, w / 2 + 0.05, H - 0.9, z0);
  for (const sx of [-1, 1]) d.span('plaster_white', sx * w / 2 - 0.55, P, z0 - 0.3, sx * w / 2 + 0.55 * sx * 0 + 0.55, H, z0 + 0.6);
  // Door frame and leaves (or the bricked-up opening).
  d.span('marble', -doorW / 2 - 0.45, P, z0 - 0.18, -doorW / 2, P + doorH + 0.45, z0);
  d.span('marble', doorW / 2, P, z0 - 0.18, doorW / 2 + 0.45, P + doorH + 0.45, z0);
  d.span('marble', -doorW / 2 - 0.6, P + doorH, z0 - 0.25, doorW / 2 + 0.6, P + doorH + 0.6, z0);
  if (o.walledUp) {
    d.span('brick', -doorW / 2, P, z0 + 0.2, doorW / 2, P + doorH, z0 + 0.6, { collide: true });
    inscription(d, ['LOCVS SCELERATVS'], 0, P + 1.6, z0 + 0.18, 1.6, 0.35, 0, 'painted');
  } else {
    for (const sx of [-1, 1]) d.box('bronze', sx * doorW * 0.25, P + doorH / 2, z0 + t + 0.05, doorW * 0.5 - 0.04, doorH, 0.12);
  }
  // Cornice, pediment and roof.
  cornice(d, -w / 2, z0, w / 2, z1, H - 0.6, 0.6, 0.35, 'travertine');
  const rise = w * 0.14;
  gable(d, 'plaster_white', 0, H, z0 - 0.3, w + 0.5, rise, 0.6);
  d.span('travertine', -w / 2 - 0.4, H - 0.05, z0 - 0.45, w / 2 + 0.4, H + 0.15, z0 + 0.2);
  tiledRoof(d, 'gable', 0, (z0 + z1) / 2, w, z1 - z0, H, detail, { axis: 'z', pitchDeg: 15, wallMat: 'plaster_white' });
  // Interior: floor, tiers, the Victory at the back.
  const ix0 = -w / 2 + t, ix1 = w / 2 - t, iz0 = z0 + t, iz1 = z1 - t;
  d.span(detail === 'high' ? 'marble_giallo' : 'marble', ix0, P - 0.1, iz0, ix1, P + 0.01, iz1);
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const x0 = sx < 0 ? ix0 : ix1 - (3 - k) * 0.95, x1 = sx < 0 ? ix0 + (3 - k) * 0.95 : ix1;
      d.span('marble_veined', x0, P, iz0 + 1.5, x1, P + (k + 1) * 0.22, iz1 - 2.5, { collide: true });
    }
  }
  d.span('marble_veined', -2.4, P, iz1 - 2.4, 2.4, P + 0.44, iz1, { collide: true });
  if (o.statue ?? true) statueOnPedestal(d, 'togate', 0, P + 0.44, iz1 - 1.1, Math.PI, 1.1, 'gilded_bronze', detail, 1.2);
  altar(d, 0, P, iz1 - 3.3, 1.0, 0.7, 0.9, 'marble');
  spots.push(
    spot(`${id}:door`, 'door', 0, P, z0 - 0.6, 0),
    spot(`${id}:steps`, 'sit', -w * 0.18, P * 0.5, z0 - stairLen * 0.5, Math.PI),
    spot(`${id}:inside`, 'npc', 0, P, (iz0 + iz1) / 2, 0),
    spot(`${id}:altar`, 'shrine', 0, P, iz1 - 4.5, 0),
  );
  return { floor: P, z0, z1 };
}

function buildCuria(ctx: LandmarkContext): LandmarkBuild {
  const { lm } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const H = heightG(ctx, 6);
  const spots: Spot[] = [];
  const r = curiaHall(d, ctx, w, dd, H, lm.id, spots, { walledUp: lm.status113 === 'complete' && /walled up/i.test((lm as { statusNote?: string }).statusNote ?? '') });
  far.span('brick', -w / 2, 0, r.z0, w / 2, H, r.z1);
  tiledRoof(far, 'gable', 0, (r.z0 + r.z1) / 2, w, r.z1 - r.z0, H, 'low', { axis: 'z', pitchDeg: 15 });
  return finish(lm.id, d, spots, far);
}

// ---------------------------------------------------------------- library

function buildLibrary(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const H = heightG(ctx, 6);
  const spots: Spot[] = [];
  const P = 0.66;
  const porchD = Math.min(4, dd * 0.22);
  const z0 = -dd / 2 + porchD + flightLength(P);
  plinth(d, ctx, -w / 2, -dd / 2 + flightLength(P), w / 2, dd / 2, P, 'travertine');
  flight(d, 0, -dd / 2, w * 0.7, 0, P, 'marble');
  const t = 0.9;
  const ops: WallOpening[] = [{ x: w / 2, w: 2.6, h: 4.6 }];
  for (const k of [-1, 1]) ops.push({ x: w / 2 + k * w * 0.28, w: 1.6, h: 2.6, sill: 5.2, arched: true });
  piercedWall(d, -w / 2, z0, w / 2, z0, P, H, t, 'brick', ops);
  piercedWall(d, w / 2, z0, w / 2, dd / 2, P, H, t, 'brick');
  piercedWall(d, w / 2, dd / 2, -w / 2, dd / 2, P, H, t, 'brick');
  piercedWall(d, -w / 2, dd / 2, -w / 2, z0, P, H, t, 'brick');
  const top = porch(d, -w / 2 + 0.3, w / 2 - 0.3, -dd / 2 + flightLength(P) + 0.6, P, Math.min(H * 0.6, 9), 4, 'corinthian', 'marble', detail, porchD - 0.6);
  cornice(d, -w / 2, z0, w / 2, dd / 2, H - 0.5, 0.5, 0.3, 'marble');
  tiledRoof(d, 'gable', 0, (z0 + dd / 2) / 2, w, dd / 2 - z0, Math.max(H, top), detail, { axis: 'z', pitchDeg: 14 });
  // Interior: bookcases (armaria) in niches along the walls, Minerva at the back, reading tables.
  d.span('marble_pavonazzetto', -w / 2 + t, P - 0.1, z0 + t, w / 2 - t, P + 0.01, dd / 2 - t);
  const shelves = Math.max(2, Math.floor((dd / 2 - z0 - 2 * t) / 2.6));
  for (const sx of [-1, 1]) {
    for (let i = 0; i < shelves; i++) {
      const z = z0 + t + 1.3 + i * 2.6;
      d.span('wood_dark', sx * (w / 2 - t) - sx * 0.55, P, z - 0.9, sx * (w / 2 - t), P + 2.6, z + 0.9, { collide: true });
      d.span('black', sx * (w / 2 - t) - sx * 0.56, P + 0.3, z - 0.75, sx * (w / 2 - t) - sx * 0.5, P + 2.4, z + 0.75);
    }
  }
  statueOnPedestal(d, 'togate', 0, P, dd / 2 - t - 1.2, Math.PI, 1.3, 'marble', detail, 1.0);
  placeProp(d, 'table_marble', 0, P, (z0 + dd / 2) / 2, 0);
  spots.push(spot(`${lm.id}:door`, 'door', 0, P, z0 - 0.6, 0), spot(`${lm.id}:reader`, 'sit', 0.8, P, (z0 + dd / 2) / 2, Math.PI / 2), spot(`${lm.id}:scrolls`, 'container', -w / 2 + t + 0.8, P, z0 + t + 1.3, -Math.PI / 2));
  far.span('brick', -w / 2, 0, -dd / 2, w / 2, H, dd / 2);
  tiledRoof(far, 'gable', 0, 0, w, dd, H, 'low', { axis: 'z' });
  return finish(lm.id, d, spots, far);
}

// ---------------------------------------------------------------- prison

function buildPrison(ctx: LandmarkContext): LandmarkBuild {
  const { lm } = ctx;
  const d = draw(ctx);
  const { w, d: dd } = dims(ctx);
  const H = heightG(ctx, 4);
  const spots: Spot[] = [];
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'tufa');
  const t = 1.2;
  piercedWall(d, -w / 2, -dd / 2, w / 2, -dd / 2, 0, H, t, 'tufa', [{ x: w / 2, w: 1.1, h: 2.2 }, { x: w * 0.2, w: 0.5, h: 0.6, sill: 2.4 }]);
  piercedWall(d, w / 2, -dd / 2, w / 2, dd / 2, 0, H, t, 'tufa');
  piercedWall(d, w / 2, dd / 2, -w / 2, dd / 2, 0, H, t, 'tufa');
  piercedWall(d, -w / 2, dd / 2, -w / 2, -dd / 2, 0, H, t, 'tufa');
  d.span('concrete', -w / 2, H - 0.3, -dd / 2, w / 2, H, dd / 2, { collide: true });
  // Travertine facade band with the consuls' restoration inscription.
  d.span('travertine', -w / 2 - 0.1, H * 0.58, -dd / 2 - 0.15, w / 2 + 0.1, H * 0.86, -dd / 2);
  inscription(d, ['C VIBIVS C F RVFINVS M COCCEIVS NERVA', 'COS EX S C'], 0, H * 0.72, -dd / 2 - 0.17, Math.min(w - 0.4, 7), H * 0.2);
  // Inside: the hole down to the Tullianum, under an iron grate.
  d.span('concrete', -w / 2 + t, -0.1, -dd / 2 + t, w / 2 - t, 0.01, dd / 2 - t);
  d.cyl('black', 0, 0.02, 0.4, 0.55, 0.02, 12);
  d.box('iron', 0, 0.05, 0.4, 1.1, 0.04, 0.08);
  d.box('iron', 0, 0.05, 0.4, 0.08, 0.04, 1.1);
  spots.push(spot(`${lm.id}:door`, 'door', 0, 0, -dd / 2 - 0.6, 0), spot(`${lm.id}:inscription`, 'inscription', 0, 0, -dd / 2 - 2.2, 0), spot(`${lm.id}:pit`, 'container', 0, 0, -0.4, 0));
  return finish(lm.id, d, spots);
}

// ---------------------------------------------------------------- palace

/**
 * Arcaded substructures where the ground falls away in front of a hill-top building: in runs of
 * ~10 m along the front edge (z), each run finds where the slope in front reaches (nearly) its
 * foot, pushes a paved terrace out to there and drops a wall of blind arches (storeys of ~7 m,
 * dark galleries behind) from the platform to the ground — the Palatine as seen from the Forum or
 * the Circus. Never reaches into another landmark. Returns whether any was built.
 */
export function substructureFacade(d: Draw, ctx: LandmarkContext, w: number, z: number, detail: Detail, far?: Draw): boolean {
  const runs = Math.max(1, Math.round(w / 10));
  const free = clearOf(obstacles(ctx, 2));
  let built = false;
  for (let i = 0; i < runs; i++) {
    const x0 = -w / 2 + (i * w) / runs, x1 = -w / 2 + ((i + 1) * w) / runs, xm = (x0 + x1) / 2;
    // Ground profile in front of the run (worst of three lines across it).
    const prof: number[] = [];
    for (let k = 0; k <= 12; k++) prof.push(Math.min(ctx.groundAt(x0 + 0.5, z - k * 1.5), ctx.groundAt(xm, z - k * 1.5), ctx.groundAt(x1 - 0.5, z - k * 1.5)));
    const minG = Math.min(...prof);
    if (minG > -3) continue;
    let k = prof.findIndex((g) => g <= minG * 0.82);
    // The whole terrace (all along the run, out to 2 m past its edge) must stay off neighbours and
    // streets (the Clivus Victoriae under the Domus Tiberiana).
    const clearTo = (kk: number) => {
      for (let j = 0; j <= kk * 1.5 + 2; j += 1) for (const x of [x0 + 0.5, xm, x1 - 0.5]) if (!free(x, z - j, 0.5)) return false;
      return true;
    };
    while (k > 0 && !clearTo(k)) k--;
    const zf = z - k * 1.5;
    let lo = 0;
    for (let j = 0; j <= 4; j++) lo = Math.min(lo, ctx.groundAt(x0 + ((x1 - x0) * j) / 4, zf - 1.2));
    if (lo > -2.5) continue;
    built = true;
    const bottom = lo - 0.6;
    const n = Math.max(1, Math.round(-bottom / 7));
    const f = d.at(0, bottom, 0);
    liteArcade(f, [V(x0, 0, zf), V(x1, 0, zf)], { storeys: Array.from({ length: n }, (_, j) => ({ height: -bottom / n, columns: false, parapet: j > 0 ? 0.01 : 0 })), bay: 4.6, depth: 1.8, material: 'brick', detail, open: 0.56 });
    f.span('black', x0, 0, zf + 2.6, x1, -bottom - 0.4, zf + 2.7);
    f.span('brick', x0, 0, zf + 2.7, x1, -bottom, Math.max(zf + 4.2, z), { collide: true });
    f.span('concrete', x0, 0, zf + 1.8, x1, 0.05, zf + 2.6);
    // Terrace out to the new edge, with a parapet.
    if (zf < z - 0.5) d.span('paving_travertine', x0, -0.3, zf, x1, 0.04, z, { collide: true });
    d.span('travertine', x0, 0, zf, x1, 1.05, zf + 0.45, { collide: true });
    far?.span('brick', x0, bottom, zf, x1, 0, Math.max(zf + 4, z));
  }
  return built;
}

/** A plain wall band along a path in this frame (offsets x0..x1 along the right-hand normal). */
function ribbonWallLocal(d: Draw, path: V3[], x0: number, x1: number, y0: number, y1: number, mat: MaterialId) {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const t = b.clone().sub(a).normalize();
    const n = V(t.z, 0, -t.x);
    const mid = a.clone().add(b).multiplyScalar(0.5).addScaledVector(n, (x0 + x1) / 2);
    d.box(mat, mid.x, (y0 + y1) / 2, mid.z, a.distanceTo(b) + 0.05, y1 - y0, Math.abs(x1 - x0), { ry: Math.atan2(-t.z, t.x) });
  }
}

function buildPalace(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const h = hintsOf(lm);
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const H = heightG(ctx, 8);
  const spots: Spot[] = [];
  if (sitingOf(lm) === 'underground' || lm.status113 === 'ruin') {
    // Buried wing: low stubs of brick walls in a scrubby field, a dark vaulted opening.
    const rng = ctx.rng.fork('stubs');
    for (let i = 0; i < 18; i++) {
      const x = rng.range(-w / 2 + 3, w / 2 - 3), z = rng.range(-dd / 2 + 3, dd / 2 - 3);
      const y = ctx.groundAt(x, z);
      const len = rng.range(3, 9);
      const rot = rng.chance(0.5) ? 0 : Math.PI / 2;
      d.at(x, y, z, rot).box('brick', 0, 0.4, 0, len, rng.range(0.6, 1.8), 0.8, { collide: true });
    }
    const y0 = ctx.groundAt(0, -dd / 2 + 4);
    d.span('brick', -3, y0 - 0.5, -dd / 2 + 2, 3, y0 + 3.2, -dd / 2 + 6, { collide: true });
    d.span('black', -1.2, y0, -dd / 2 + 1.98, 1.2, y0 + 2.4, -dd / 2 + 2.02);
    spots.push(spot(`${lm.id}:entrance`, 'door', 0, y0, -dd / 2 + 1.3, 0));
    return finish(lm.id, d, spots);
  }
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'brick');
  const wing = clamp(Math.min(w, dd) * 0.16, 6, 14);
  const rangeH = Math.min(H * 0.55, 13);
  const exR = h.has('exedra') ? Math.min(w * 0.42, 24) : 0;
  const cz = -dd / 2 + 4 + (exR ? exR + 3 : 0);
  courtyardRanges(d, -w / 2, cz, w / 2, dd / 2, wing, rangeH, 'brick', detail, { gate: 6, inner: 'plain', ring: true, courtMat: 'paving_travertine' });
  // Peristyle round the court.
  const cx0 = -w / 2 + wing + 3.2, cx1 = w / 2 - wing - 3.2, cz0 = cz + wing + 3.2, cz1 = dd / 2 - wing - 3.2;
  if (cx1 - cx0 > 6 && cz1 - cz0 > 6) {
    liteColonnade(d, [V(cx0, 0, cz0), V(cx0, 0, cz1), V(cx1, 0, cz1), V(cx1, 0, cz0)], { columnHeight: Math.min(rangeH * 0.55, 6), spacing: 3, depth: 2.8, back: 'none', closed: true, material: 'marble_giallo', detail, order: 'corinthian' });
    hedge(d, -1.5, cz0 + 3, 1.5, cz1 - 3, 0, 0.7);
    roundBasin(d, 0, 0, (cz0 + cz1) / 2, Math.min(3, (cx1 - cx0) / 6), 'marble', 0.5, detail);
  }
  // Audience hall rising at the back of the court.
  const hw = Math.min(w * 0.4, 30), hd = Math.min(dd * 0.28, 26);
  hall(d, -hw / 2, dd / 2 - wing - hd * 0.5, hw / 2, dd / 2 - 0.5, { mat: 'brick', height: H, roof: 'gable', roofAxis: 'z', doors: 1, detail, arched: true, pilasters: 4 });
  // The front: arcaded substructures down the slope (the Palatine seen from the Forum or the
  // Circus), a concave exedra facade, or a plain columned porch.
  const sub = substructureFacade(d, ctx, w, -dd / 2, detail, far);
  if (exR) {
    const R = exR;
    const pts: V3[] = [];
    const n = detail === 'high' ? 16 : 10;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI - (Math.PI * i) / n;
      pts.push(V(R * Math.cos(a), 0, -dd / 2 + 0.5 + R * Math.sin(a)));
    }
    const eh = Math.min(rangeH * 1.25, 16);
    liteArcade(d.at(0, 0.02, 0), pts, { storeys: [{ height: eh * 0.55, columns: true }, { height: eh * 0.45, columns: true, parapet: 1.0 }], bay: 4.2, depth: 1.6, material: 'travertine', detail });
    // The gallery behind the arches (a brick back wall and a floor at mid height), the wings
    // either side of the hemicycle out to the full width, a terrace paving in front.
    ribbonWallLocal(d, pts, -1.6 - 3.4, -1.6 - 2.8, 0, eh, 'brick');
    ribbonWallLocal(d, pts, -1.6 - 2.8, -1.6, eh * 0.55 - 0.3, eh * 0.55, 'concrete');
    for (const sx of [-1, 1]) {
      if (w / 2 - R > 2) hall(d, sx > 0 ? R : -w / 2, -dd / 2 + 0.5, sx > 0 ? w / 2 : -R, cz, { mat: 'brick', height: eh, roof: 'flat', doors: 1, detail, arched: true, windowRows: 2 });
      wallRun(d, sx * R, -dd / 2 + 0.5, sx * R, cz, 0, eh, 0.8, 'brick');
    }
    d.span('paving_travertine', -R - 1, 0.0, -dd / 2, R + 1, 0.06, -dd / 2 + 3);
    spots.push(spot(`${lm.id}:exedra`, 'vista', 0, 0.06, -dd / 2 + 1.5, Math.PI));
    far.geo(new THREE.CylinderGeometry(R, R, eh, 10, 1, true, -Math.PI / 2, Math.PI), 'travertine', 0, eh / 2, -dd / 2 + 0.5);
  } else if (!sub) {
    liteColonnade(d, [V(w / 2 - 2, 0.02, -dd / 2 + 3.2), V(-w / 2 + 2, 0.02, -dd / 2 + 3.2)].reverse(), { columnHeight: Math.min(rangeH * 0.6, 7), spacing: 3.2, depth: 2.6, back: 'none', material: 'marble', detail, order: 'corinthian' });
  }
  // Lamps at the gate: the palace is guarded day and night.
  for (const sx of [-1, 1]) wallTorch(ctx, d, sx * 4.2, 3.2, -dd / 2 + 3.95, 0);
  spots.push(spot(`${lm.id}:gate`, 'door', 0, 0, -dd / 2 + 2, 0), spot(`${lm.id}:guard`, 'npc', 4, 0, -dd / 2 + 2, Math.PI), spot(`${lm.id}:court`, 'vista', 0, 0, (cz0 + cz1) / 2 - 4, 0));
  far.span('brick', -w / 2, 0, -dd / 2 + 4, w / 2, rangeH, dd / 2);
  far.span('brick', -hw / 2, 0, dd / 2 - wing - hd * 0.5, hw / 2, H, dd / 2 - 0.5);
  return finish(lm.id, d, spots, far);
}

// ---------------------------------------------------------------- houses

function buildHouse(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const h = hintsOf(lm);
  const d = draw(ctx);
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const g = (x: number, z: number) => ctx.groundAt(x, z);
  if (lm.footprint.kind === 'ellipse' || lm.footprint.kind === 'circle' || h.has('hut', 'thatch')) {
    // Wattle-and-daub hut with a thatched cone (the Hut of Romulus, kept as a relic).
    const rx = w / 2, rz = dd / 2;
    d.span('tufa', -rx - 0.3, -0.3, -rz - 0.3, rx + 0.3, 0.25, rz + 0.3, { collide: true });
    const wall = new THREE.CylinderGeometry(1, 1, 1.8, 16, 1, true);
    d.geo(wall, 'wood', 0, 1.15, 0, { sx: rx, sz: rz });
    d.geo(new THREE.CylinderGeometry(1, 1, 1.8, 16, 1, true), 'plaster_cream', 0, 1.15, 0, { sx: rx - 0.08, sz: rz - 0.08 });
    d.geo(new THREE.ConeGeometry(1, 2.4, 16, 1, true), 'dry_grass', 0, 3.25, 0, { sx: rx + 0.5, sz: rz + 0.5 });
    d.span('black', -0.45, 0.25, -rz - 0.02, 0.45, 1.95, -rz + 0.3);
    d.solidCyl(0, 1.2, 0, Math.min(rx, rz), 2.4);
    railing(d, Array.from({ length: 12 }, (_, i) => [Math.cos((i / 12) * Math.PI * 2) * (rx + 1.6), Math.sin((i / 12) * Math.PI * 2) * (rz + 1.6)] as [number, number]), 0, 1.0, true);
    spots.push(spot(`${lm.id}:hut`, 'shrine', 0, 0, -rz - 2.2, 0));
    return finish(lm.id, d, spots);
  }
  if (h.has('insula', 'apartment', 'tenement')) {
    const out = insula({ width: w, depth: dd, storeys: clamp(Math.round(heightG(ctx) / 3.2), 3, 6), seed: ctx.rng.int(1, 9999), wealth: 0.35, groundAt: g, detail: fabricDetail(detail), courtyard: w > 18 && dd > 18 });
    appendBuilding(d, out, 0, 0, 0, 0, spots, lm.id);
    return finish(lm.id, d, spots);
  }
  // A town house: the fabric domus, scaled to the footprint (human-scale storeys, as all housing).
  const W = clamp(w, 14, 60), D = clamp(dd, 18, 70);
  const shut = h.has('shut', 'shuttered', 'away');
  const out = domus({ width: W, depth: D, seed: ctx.rng.int(1, 9999), wealth: h.has('wealthy', 'rich', 'senator', 'imperial', 'emperor') ? 0.95 : 0.75, groundAt: g, detail: fabricDetail(detail), shops: !h.has('vestal', 'priest'), streetDressing: !shut });
  appendBuilding(d, out, 0, 0, 0, 0, spots, lm.id);
  spots.push(spot(`${lm.id}:door`, 'door', 0, g(0, -D / 2 - 0.8), -D / 2 - 0.8, 0));
  if (shut) spots.push(spot(`${lm.id}:steward`, 'npc', 1.4, g(1.4, -D / 2 - 0.6), -D / 2 - 0.6, Math.PI));
  return finish(lm.id, d, spots);
}

// ---------------------------------------------------------------- markets

const STALL_GOODS: PropKind[] = ['amphora_stack', 'basket', 'crate', 'sack', 'dolium'];

/** An open market: paving where clear, rows of stalls under awnings, goods, a well-head and a statue. */
export function openMarket(d: Draw, ctx: LandmarkContext, w: number, dd: number, spots: Spot[], o: { paving?: MaterialId; rows?: number; avoid?: (x: number, z: number, r?: number) => boolean } = {}) {
  const rng = ctx.rng.fork('market');
  const free = o.avoid ?? clearOf(obstacles(ctx, 2));
  const g = (x: number, z: number) => ctx.groundAt(x, z);
  const cell = 6;
  const nx = Math.max(1, Math.round(w / cell)), nz = Math.max(1, Math.round(dd / cell));
  const cw = w / nx, cd = dd / nz;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = -w / 2 + (i + 0.5) * cw, z = -dd / 2 + (j + 0.5) * cd;
      if (!free(x, z, cw * 0.4)) continue;
      const y = g(x, z);
      d.span(o.paving ?? 'paving_travertine', x - cw / 2, y - 0.3, z - cd / 2, x + cw / 2, y + 0.04, z + cd / 2);
    }
  }
  // Stall rows along x, with walking lanes between them.
  const rows = o.rows ?? Math.max(1, Math.floor(dd / 9));
  const maxStalls = ctx.detail === 'high' ? 28 : 12;
  let n = 0;
  for (let r = 0; r < rows; r++) {
    const z = -dd / 2 + ((r + 0.5) * dd) / rows;
    const per = Math.max(1, Math.floor((w - 4) / 4.2));
    for (let k = 0; k < per; k++) {
      const x = -w / 2 + 2 + (k + 0.5) * ((w - 4) / per);
      if (!free(x, z, 2.2) || rng.chance(0.3) || n >= maxStalls) continue;
      const y = g(x, z) + 0.04;
      const f = d.at(x, y, z, r % 2 ? Math.PI : 0);
      placeProp(f, 'stall', 0, 0, 0, 0, { rng: rng.fork(`s${r}:${k}`) });
      if (rng.chance(0.5)) velum(f.at(0, 0, -0.3), 3.0, 2.4, 2.5, rng.chance(0.5) ? ['fabric_white', 'fabric_red'] : ['fabric_white', 'fabric_blue']);
      placeProp(f, STALL_GOODS[rng.int(0, STALL_GOODS.length - 1)], 1.6, 0, 0.6, rng.range(0, 6), { collide: false });
      if (n++ % 3 === 0) spots.push(spot(`${ctx.lm.id}:stall${n}`, 'vendor', x, y, z + (r % 2 ? -1.2 : 1.2) * -1, r % 2 ? 0 : Math.PI));
    }
  }
  // A well-head and a statue on a base near the middle.
  for (const [x, z] of [[w * 0.12, 0], [-w * 0.18, dd * 0.05]] as const) {
    if (!free(x, z, 2)) continue;
    if (x > 0) {
      placeProp(d, 'puteal', x, g(x, z), z, 0);
      spots.push(spot(`${ctx.lm.id}:well`, 'container', x, g(x, z), z - 1.2, 0));
    } else {
      statueOnPedestal(d, 'togate', x, g(x, z), z, 0, 1.1, 'bronze', 'low', 1.6);
      spots.push(spot(`${ctx.lm.id}:statue`, 'inscription', x, g(x, z), z - 1.6, 0));
    }
  }
}

/** A macellum: tabernae round a court with a domed tholos fountain (for fish) in the middle. */
export function macellum(d: Draw, ctx: LandmarkContext, w: number, dd: number, H: number, spots: Spot[], far: Draw) {
  const { detail } = ctx;
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'brick');
  const wing = clamp(Math.min(w, dd) * 0.22, 4.5, 9);
  courtyardRanges(d, -w / 2, -dd / 2, w / 2, dd / 2, wing, Math.min(H, 8), 'brick', detail, { gate: 4.5, inner: 'cells', courtMat: 'paving_travertine', street: w <= 16 });
  // Street-front shops along the facade.
  if (w > 16) {
    tabernae(d, -w / 2 + 1, -3.2, -dd / 2 - 0.02, 0.7, Math.min(H, 8) - 0.6, 'brick', detail, ctx.rng.fork('tab'));
    tabernae(d, 3.2, w / 2 - 1, -dd / 2 - 0.02, 0.7, Math.min(H, 8) - 0.6, 'brick', detail, ctx.rng.fork('tab2'));
  }
  const cw = w - 2 * wing, cd = dd - 2 * wing;
  const R = Math.min(cw, cd) * 0.22;
  if (R > 1.5) {
    tholos(d.b, { radius: R, columns: R > 3 ? 12 : 8, order: 'ionic', base: 'steps', material: 'marble', cellaMaterial: 'marble', podiumMaterial: 'travertine', detail: 'low' }, d.m);
    roundBasin(d, 0, 0.3, 0, R * 0.5, 'marble', 0.6, detail);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const x = Math.cos(a) * (R + 3), z = Math.sin(a) * (R + 3);
    if (Math.abs(x) < cw / 2 - 2 && Math.abs(z) < cd / 2 - 2) placeProp(d, 'stall', x, 0.04, z, a + Math.PI / 2, { rng: ctx.rng.fork(`st${i}`) });
  }
  spots.push(
    spot(`${ctx.lm.id}:gate`, 'door', 0, 0, -dd / 2 - 0.6, 0),
    spot(`${ctx.lm.id}:fishmonger`, 'vendor', R + 1.2, 0, 0, -Math.PI / 2),
    spot(`${ctx.lm.id}:butcher`, 'vendor', -cw / 2 + 0.9, 0, 0, Math.PI / 2),
    spot(`${ctx.lm.id}:fountain`, 'shrine', 0, 0, -R - 1.2, 0),
  );
  far.span('brick', -w / 2, 0, -dd / 2, w / 2, Math.min(H, 8), dd / 2);
}

function buildMarket(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const h = hintsOf(lm);
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const H = heightG(ctx, 4);
  const spots: Spot[] = [];
  if (sitingOf(lm) === 'open' || lm.height < 1) {
    openMarket(d, ctx, w, dd, spots, { paving: h.has('cattle', 'boarium') ? 'cobbles' : 'paving_travertine' });
    return finish(lm.id, d, spots);
  }
  if (h.has('hemicycle', 'terraced', 'terrace')) {
    // Terraced brick market climbing the slope: three ranges of tabernae, each set back over the last.
    const levels = 3;
    const step = dd / levels;
    for (let k = 0; k < levels; k++) {
      const z0 = -dd / 2 + k * step;
      const y0 = Math.max(k * 4.2, groundRange(ctx, -w / 2, z0, w / 2, z0 + step).max);
      plinth(d, ctx, -w / 2, z0, w / 2, z0 + step, y0, 'brick');
      const f = d.at(0, y0, 0);
      tabernae(f, -w / 2 + 0.5, w / 2 - 0.5, z0, step * 0.8, 4.4, 'brick', detail, ctx.rng.fork(`m${k}`));
      f.span('concrete', -w / 2, 4.4, z0, w / 2, 4.7, z0 + step);
      f.span('brick', -w / 2, 4.7, z0, w / 2, 5.6, z0 + 0.4);
      spots.push(spot(`${lm.id}:shop${k}`, 'vendor', 0, y0, z0 - 0.8, Math.PI));
    }
    far.span('brick', -w / 2, 0, -dd / 2, w / 2, levels * 4.6, dd / 2);
    return finish(lm.id, d, spots, far);
  }
  macellum(d, ctx, w, dd, H, spots, far);
  return finish(lm.id, d, spots, far);
}

// ---------------------------------------------------------------- warehouses

/** Horrea filling w × dd: one fabric warehouse per ~60 m bay, side by side along x. */
export function horreaBlocks(d: Draw, ctx: LandmarkContext, w: number, dd: number, spots: Spot[], far: Draw, x0 = -w / 2, z0 = -dd / 2, tag = '') {
  const n = Math.max(1, Math.round(w / 60));
  const bw = w / n;
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * bw, cz = z0 + dd / 2;
    const out = horrea({ width: bw - 0.4, depth: dd, seed: ctx.rng.int(1, 9999), groundAt: (x, z) => ctx.groundAt(x + cx, z + cz), detail: fabricDetail(ctx.detail) });
    appendBuilding(d, out, cx, 0, cz, 0, spots, `${ctx.lm.id}:${tag}h${i}`);
    far.span('brick', cx - bw / 2 + 0.2, 0, cz - dd / 2, cx + bw / 2 - 0.2, out.height, cz + dd / 2);
  }
}

function buildWarehouse(ctx: LandmarkContext): LandmarkBuild {
  const { lm } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  horreaBlocks(d, ctx, w, dd, spots, far);
  return finish(lm.id, d, spots, far);
}

// ---------------------------------------------------------------- porticoes

export interface QuadriporticusOpts {
  columnHeight?: number;
  depth?: number;
  order?: Order;
  material?: MaterialId;
  wallMat?: MaterialId;
  /** Gate widths per side [front, right, back, left] (0 = none). */
  gates?: [number, number, number, number];
  propylon?: boolean;
  garden?: 'hedges' | 'trees' | 'paved' | 'none';
  /** Courtyard floor. */
  courtMat?: MaterialId;
  storeys?: number;
  /** Skip the colonnade (and wall) on these sides (another building closes them). */
  openSides?: boolean[];
}

/**
 * A walled court ringed by colonnades facing inward (Porticus Octaviae / Pompeiana type): column
 * axes `depth` in from the walls, pierced walls with gates, an optional columnar propylon on the
 * front gate, and a garden or paving in the middle. Returns the court rectangle (column axes).
 */
export function quadriporticusGarden(d: Draw, ctx: LandmarkContext, w: number, dd: number, H: number, spots: Spot[], o: QuadriporticusOpts = {}) {
  const { detail, lm } = ctx;
  const colH = o.columnHeight ?? clamp(H * 0.5, 3.6, 7.5);
  const depth = o.depth ?? clamp(Math.min(w, dd) * 0.08, 3.5, 7);
  const t = 0.7;
  const hw = w / 2 - t - depth, hd = dd / 2 - t - depth;
  const order = o.order ?? 'ionic';
  const res = liteColonnade(d, [V(-hw, 0, -hd), V(-hw, 0, hd), V(hw, 0, hd), V(hw, 0, -hd)], {
    columnHeight: colH, spacing: colH * 0.45, depth: depth, back: 'none', closed: true, material: o.material ?? 'marble', detail, order, storeys: o.storeys,
  });
  const wallMat = o.wallMat ?? 'plaster_cream';
  const gates = o.gates ?? [Math.min(6, w * 0.12), 0, 0, 0];
  const corners: [number, number][] = [[-w / 2, -dd / 2], [w / 2, -dd / 2], [w / 2, dd / 2], [-w / 2, dd / 2]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az);
    const gw = gates[i];
    piercedWall(d, ax, az, bx, bz, 0, res.wallTop, t, wallMat, gw > 0 ? [{ x: len / 2, w: gw, h: Math.min(colH, gw * 1.4) }] : []);
  }
  // Wall-top coping.
  cornice(d, -w / 2, -dd / 2, w / 2, dd / 2, res.wallTop - 0.4, 0.4, 0.15, 'travertine');
  if (o.propylon ?? true) {
    const gw = gates[0];
    const pw = gw + 4;
    porch(d, -pw / 2, pw / 2, -dd / 2 - 2.6, 0, Math.min(colH + 1.5, 9), 4, order === 'ionic' ? 'corinthian' : order, 'marble', detail, 2.4);
    d.span('marble', -pw / 2, -0.2, -dd / 2 - 3.6, pw / 2, 0.15, -dd / 2, { collide: true });
    inscription(d, [lm.latin.split('/')[0].trim()], 0, Math.min(colH + 1.5, 9) + 0.7, -dd / 2 - 3.1, Math.min(pw - 0.6, 7), 0.6);
  }
  const garden = o.garden ?? 'hedges';
  const cw = 2 * hw - 1.6, cd = 2 * hd - 1.6;
  const court = o.courtMat ?? (garden === 'paved' ? 'paving_travertine' : 'gravel');
  d.span(court, -cw / 2 - 0.8, -0.2, -cd / 2 - 0.8, cw / 2 + 0.8, 0.03, cd / 2 + 0.8);
  if (garden === 'hedges' || garden === 'trees') {
    // Two long beds either side of the axis walk, hedged, with statues at the ends and a basin.
    for (const sx of [-1, 1]) {
      const x0 = sx * 2.2, x1 = sx * (cw / 2 - 1.5);
      d.span('grass', Math.min(x0, x1), 0.03, -cd / 2 + 2, Math.max(x0, x1), 0.08, cd / 2 - 2);
      hedge(d, Math.min(x0, x1), -cd / 2 + 2, Math.max(x0, x1), -cd / 2 + 2.6, 0.03, 0.8);
      hedge(d, Math.min(x0, x1), cd / 2 - 2.6, Math.max(x0, x1), cd / 2 - 2, 0.03, 0.8);
      if (garden === 'trees') {
        const n = Math.max(2, Math.floor((cd - 6) / 7));
        for (let k = 0; k < n; k++) {
          const z = -cd / 2 + 3.5 + ((cd - 7) * k) / Math.max(1, n - 1);
          for (const f of [0.3, 0.7]) tree(ctx, d, 'plane', x0 + (x1 - x0) * f, 0.05, z, 11 + ctx.rng.range(-1.5, 1.5));
        }
      }
    }
    roundBasin(d, 0, 0.03, 0, Math.min(2.6, cw * 0.08), 'marble', 0.5, detail);
    for (const z of [-cd / 2 + 1.2, cd / 2 - 1.2]) statueOnPedestal(d, 'togate', 0, 0.03, z, z < 0 ? 0 : Math.PI, 1.0, 'bronze', 'low', 1.4);
  }
  spots.push(
    spot(`${lm.id}:gate`, 'door', 0, 0, -dd / 2 - 1.2, 0),
    spot(`${lm.id}:walk`, 'sit', -hw - 0.2, 0.3, 0, Math.PI / 2),
    spot(`${lm.id}:fountain`, 'shrine', 0, 0.03, -3.4, 0),
  );
  return { hw, hd, colH, wallTop: res.wallTop, depth };
}

function buildPortico(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const h = hintsOf(lm);
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const H = heightG(ctx, 5);
  const spots: Spot[] = [];
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'travertine');
  if (w < 14 || dd < 10) {
    // A single colonnade with a back wall (a gallery along a street or a hillside).
    liteColonnade(d, [V(w / 2 - 1, 0, -dd / 2 + dd * 0.45), V(-w / 2 + 1, 0, -dd / 2 + dd * 0.45)], { columnHeight: Math.min(H * 0.7, 6), spacing: 2.6, depth: dd * 0.45, material: 'marble', detail, order: h.order ?? 'corinthian' });
    spots.push(spot(`${lm.id}:walk`, 'sit', 0, 0.3, 0, Math.PI));
    return finish(lm.id, d, spots);
  }
  const temples = h.has('twin temples', 'two small temples', 'temples of');
  const arch = h.has('arch entrance', 'triumphal-arch', 'triple arch', 'arch at');
  const q = quadriporticusGarden(d, ctx, w, dd, H, spots, {
    order: h.order ?? (h.republican ? 'ionic' : 'corinthian'),
    garden: h.has('garden', 'plane', 'grove', 'trees') ? 'trees' : 'hedges',
    propylon: !arch,
    gates: [arch ? Math.min(10, w * 0.3) : Math.min(6, w * 0.12), 0, 0, 0],
  });
  if (arch) {
    // Triple arched entrance in the front wall (Divorum).
    const aw = Math.min(10, w * 0.3);
    for (const k of [-1, 0, 1]) {
      const sp = k === 0 ? aw * 0.36 : aw * 0.2;
      const x = k * aw * 0.36;
      d.span('marble', x - sp / 2 - 0.5, 0, -dd / 2 - 0.6, x - sp / 2, q.colH + 3, -dd / 2 + 1.2, { collide: true });
      d.span('marble', x + sp / 2, 0, -dd / 2 - 0.6, x + sp / 2 + 0.5, q.colH + 3, -dd / 2 + 1.2, { collide: true });
    }
    d.span('marble', -aw / 2 - 0.5, q.colH + 1.2, -dd / 2 - 0.6, aw / 2 + 0.5, q.colH + 4.2, -dd / 2 + 1.2);
    inscription(d, ['DIVIS VESPASIANO ET TITO'], 0, q.colH + 2.7, -dd / 2 - 0.62, aw * 0.8, 1.1);
  }
  if (temples) {
    // Twin small temples facing each other across the far end of the court.
    const tw = Math.min(q.hw * 0.8, 10), td = Math.min(q.hd * 0.4, 16);
    for (const sx of [-1, 1]) {
      const f = d.at(sx * (q.hw - td / 2 - 1), 0.03, q.hd - tw / 2 - 2, sx * Math.PI / 2);
      const t = fittedTemple(f, tw, td, { order: 'corinthian', front: 4, plan: 'prostyle', ...templeMaterials(h), detail: 'low' }, `${lm.id}:t${sx}`, false);
      spots.push(...t.spots.map((s) => ({ ...s, position: f.point(s.position.x, s.position.y, s.position.z), heading: (s.heading ?? 0) + sx * Math.PI / 2 })));
    }
  }
  far.span('plaster_cream', -w / 2, 0, -dd / 2, w / 2, q.wallTop, -dd / 2 + 1);
  far.span('plaster_cream', -w / 2, 0, dd / 2 - 1, w / 2, q.wallTop, dd / 2);
  far.span('plaster_cream', -w / 2, 0, -dd / 2, -w / 2 + 1, q.wallTop, dd / 2);
  far.span('plaster_cream', w / 2 - 1, 0, -dd / 2, w / 2, q.wallTop, dd / 2);
  return finish(lm.id, d, spots, far);
}

// ---------------------------------------------------------------- baths

export interface ThermaeOpts {
  /** Caldarium as a domed rotunda (Agrippa) rather than an apsed hall. */
  rotunda?: boolean;
  /** Walkable frigidarium with pools and a granite labrum. */
  enterable?: boolean;
  natatio?: boolean;
  palaestrae?: boolean;
  wallMat?: MaterialId;
  /** Name for the inscription over the entrance. */
  title?: string;
}

/**
 * An imperial bath block in w × dd (axial plan, entrance on −z): an open-air natatio behind the
 * front screen wall, the frigidarium hall with thermal windows, the tepidarium, the caldarium (a
 * domed rotunda or an apsed hall with big south windows) projecting at the back, and porticoed
 * palaestrae either side. Brick-faced; marble and granite inside.
 */
export function thermae(d: Draw, ctx: LandmarkContext, w: number, dd: number, H: number, spots: Spot[], far: Draw, o: ThermaeOpts = {}) {
  const { detail, lm } = ctx;
  const wallMat = o.wallMat ?? 'brick';
  const t = 1.1;
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'brick');
  // Zones along z.
  const zN0 = -dd / 2, zN1 = zN0 + dd * 0.22; // natatio court
  const zF1 = zN1 + dd * 0.26; // frigidarium
  const zT1 = zF1 + dd * 0.14; // tepidarium
  const zC1 = dd / 2; // caldarium
  const fw = Math.min(w * 0.46, 46);
  const Hf = H, Ht = H * 0.78, Hlow = Math.max(5, H * 0.45);
  // Outer ranges (changing rooms, sudatoria) along the flanks at low height.
  const pw = (w - fw) / 2; // palaestra width each side
  const palaestrae = (o.palaestrae ?? true) && pw > 9;
  // Front screen wall with the entrances, niches and the inscription.
  const frontOps: WallOpening[] = [];
  for (const k of [-1, 1]) frontOps.push({ x: w / 2 + k * fw * 0.32, w: 3.0, h: 4.4, arched: true });
  const nn = Math.max(2, Math.floor(w / 9));
  for (let i = 0; i < nn; i++) {
    const x = ((i + 0.5) * w) / nn;
    if (frontOps.some((p) => Math.abs(p.x - x) < 4)) continue;
    frontOps.push({ x, w: 1.8, h: 3.0, sill: 1.6, arched: true, fill: 'plaster_white' });
  }
  piercedWall(d, -w / 2, zN0, w / 2, zN0, 0, Hlow, t, wallMat, frontOps);
  cornice(d, -w / 2, zN0, w / 2, zN0 + t, Hlow - 0.45, 0.45, 0.3, 'travertine');
  inscription(d, [o.title ?? lm.latin.split('/')[0].trim().toUpperCase()], 0, Hlow - 1.4, zN0 - 0.04, Math.min(w * 0.4, 16), 1.0);
  // Side and back walls of the whole block (low ranges).
  for (const [ax, az, bx, bz] of [[w / 2, zN0, w / 2, zT1], [-w / 2, zT1, -w / 2, zN0]] as const) {
    const len = Math.abs(bz - az);
    const ops: WallOpening[] = [];
    for (let i = 0; i < Math.floor(len / 6); i++) ops.push({ x: (i + 0.5) * (len / Math.floor(len / 6)), w: 1.4, h: 2.4, sill: 2.4, arched: true });
    piercedWall(d, ax, az, bx, bz, 0, Hlow, t, wallMat, ops);
  }
  // Natatio: a big open-air pool behind the screen wall.
  if (o.natatio ?? true) {
    const nw = fw * 0.9, nd = (zN1 - zN0) * 0.62;
    pool(d, 0, 0.02, (zN0 + zN1) / 2 + 0.6, nw, nd, 'marble', 0.5, 1.2);
    d.span('paving_travertine', -fw / 2, -0.2, zN0 + t, fw / 2, 0.03, zN1);
    spots.push(spot(`${lm.id}:natatio`, 'sit', nw / 2 + 0.6, 0.03, (zN0 + zN1) / 2, -Math.PI / 2));
  }
  // Frigidarium: tall hall with three big lunette windows each side, low-pitched roof over the vaults.
  const fz0 = zN1, fz1 = zF1;
  const lun = (len: number) => [0.2, 0.5, 0.8].map((f) => ({ x: len * f, w: Math.min(7, len * 0.22), h: Math.min(7, len * 0.22) / 2 + 0.3, sill: Hf * 0.62, arched: true }));
  const enter = o.enterable ?? false;
  piercedWall(d, -fw / 2, fz0, fw / 2, fz0, 0, Hf, t, wallMat, [{ x: fw / 2, w: 4, h: 6, arched: true }, ...lun(fw).filter((p) => Math.abs(p.x - fw / 2) > 4)]);
  piercedWall(d, fw / 2, fz0, fw / 2, fz1, 0, Hf, t, wallMat, [...lun(fz1 - fz0), ...(palaestrae ? [{ x: (fz1 - fz0) / 2, w: 3, h: 4.2, arched: true }] : [])]);
  piercedWall(d, -fw / 2, fz1, -fw / 2, fz0, 0, Hf, t, wallMat, [...lun(fz1 - fz0), ...(palaestrae ? [{ x: (fz1 - fz0) / 2, w: 3, h: 4.2, arched: true }] : [])]);
  d.span('concrete', -fw / 2, Hf - 0.4, fz0, fw / 2, Hf, fz1, { collide: true });
  cornice(d, -fw / 2, fz0, fw / 2, fz1, Hf - 0.6, 0.6, 0.35, 'travertine');
  tiledRoof(d, 'gable', 0, (fz0 + fz1) / 2, fw, fz1 - fz0, Hf, detail, { axis: 'x', pitchDeg: 12 });
  // Interior of the frigidarium.
  d.span('marble_veined', -fw / 2 + t, -0.1, fz0 + t, fw / 2 - t, 0.02, fz1 - t);
  if (enter) {
    const ix = fw / 2 - t, iz0 = fz0 + t, iz1 = fz1 - t;
    for (const sx of [-1, 1]) pool(d, sx * (ix - 3), 0.02, (iz0 + iz1) / 2, 5, (iz1 - iz0) * 0.55, 'marble', 0.55, 1.0);
    const colH = Math.min(Hf * 0.62, 12);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) column(d.b, { order: 'corinthian', D: diameterForHeight('corinthian', colH), height: colH, material: 'porphyry', trimMaterial: 'marble', detail: detail === 'high' ? 'high' : 'low' }, mul(d.m, T(sx * (ix - 6.5), 0.02, (iz0 + iz1) / 2 + sz * (iz1 - iz0) * 0.3)));
    roundBasin(d, 0, 0.02, (iz0 + iz1) / 2, 1.8, 'porphyry', 0.9, detail);
    d.span('plaster_white', -ix, Hf - 1.6, iz0, ix, Hf - 0.4, iz1);
    spots.push(spot(`${lm.id}:labrum`, 'shrine', 0, 0.02, (iz0 + iz1) / 2 - 2.6, 0), spot(`${lm.id}:bather`, 'sit', -(ix - 3), 0.55, iz0 + 1, 0));
  } else {
    d.span('black', -fw / 2 + t, 0.02, fz0 + t, fw / 2 - t, Hf - 0.4, fz1 - t, { collide: false });
  }
  // Tepidarium: lower hall between frigidarium and caldarium.
  const tw = fw * 0.55;
  piercedWall(d, tw / 2, fz1, tw / 2, zT1, 0, Ht, t, wallMat, [{ x: (zT1 - fz1) / 2, w: 2.4, h: 2.4, sill: Ht * 0.55, arched: true }]);
  piercedWall(d, -tw / 2, zT1, -tw / 2, fz1, 0, Ht, t, wallMat, [{ x: (zT1 - fz1) / 2, w: 2.4, h: 2.4, sill: Ht * 0.55, arched: true }]);
  d.span('concrete', -tw / 2, Ht - 0.4, fz1, tw / 2, Ht, zT1, { collide: true });
  d.span('black', -tw / 2 + t, 0.02, fz1, tw / 2 - t, Ht - 0.4, zT1 - 0.01);
  tiledRoof(d, 'hip', 0, (fz1 + zT1) / 2, tw, zT1 - fz1, Ht, 'low', { pitchDeg: 14 });
  // Caldarium.
  const cd = zC1 - zT1;
  if (o.rotunda) {
    const R = Math.min(cd * 0.5, fw * 0.48);
    const cz = zT1 + R;
    const segs = detail === 'high' ? 32 : 18;
    d.cyl(wallMat, 0, Ht * 0.5, cz, R, Ht, segs, { collide: true });
    d.cyl('travertine', 0, Ht - 0.25, cz, R + 0.35, 0.5, segs);
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * (0.15 + (0.7 * i) / 7);
      d.box('black', Math.cos(a) * (R + 0.02), Ht * 0.55, cz + Math.sin(a) * (R + 0.02), 2.2, 3.6, 0.1, { ry: -a + Math.PI / 2 });
    }
    dome(d.b, { radius: R - 0.6, thickness: 1.0, oculus: R * 0.12, coffers: false, steps: 3, material: 'plaster_white', outerMaterial: 'concrete', detail: 'low' }, mul(d.m, T(0, Ht, cz)));
    far.cyl(wallMat, 0, Ht / 2, cz, R, Ht, 10);
    far.ellipsoid('concrete', 0, Ht, cz, R, R * 0.75, R, { seg: [10, 5] });
  } else {
    const cw = fw * 0.9;
    const ops: WallOpening[] = [0.2, 0.4, 0.6, 0.8].map((f) => ({ x: cw * f, w: Math.min(4, cw * 0.14), h: Ht * 0.45, sill: Ht * 0.25, arched: true }));
    piercedWall(d, cw / 2, zC1, -cw / 2, zC1, 0, Ht, t, wallMat, ops);
    piercedWall(d, cw / 2, zT1, cw / 2, zC1, 0, Ht, t, wallMat);
    piercedWall(d, -cw / 2, zC1, -cw / 2, zT1, 0, Ht, t, wallMat);
    d.span('concrete', -cw / 2, Ht - 0.4, zT1, cw / 2, Ht, zC1, { collide: true });
    d.span('black', -cw / 2 + t, 0.02, zT1 + 0.01, cw / 2 - t, Ht - 0.4, zC1 - t);
    tiledRoof(d, 'hip', 0, (zT1 + zC1) / 2, cw, cd, Ht, 'low', { pitchDeg: 14 });
    far.span(wallMat, -cw / 2, 0, zT1, cw / 2, Ht, zC1);
  }
  // Furnace smoke-blackened service yard marker and a praefurnium door at the back.
  d.span('black', -1.2, 0, zC1 + 0.01, 1.2, 2.2, zC1 + 0.05);
  spots.push(spot(`${lm.id}:furnace`, 'npc', 0, 0, zC1 + 1.2, Math.PI));
  // Palaestrae either side: porticoed courts with sand floors.
  if (palaestrae) {
    for (const sx of [-1, 1]) {
      const x0 = sx < 0 ? -w / 2 + t : fw / 2, x1 = sx < 0 ? -fw / 2 : w / 2 - t;
      const z0 = zN1, z1 = zT1;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const hw = (x1 - x0) / 2 - 3.4, hd = (z1 - z0) / 2 - 3.4;
      d.span('sand', x0, -0.2, z0, x1, 0.03, z1);
      if (hw > 2 && hd > 2) liteColonnade(d.at(cx, 0, cz), [V(-hw, 0, -hd), V(-hw, 0, hd), V(hw, 0, hd), V(hw, 0, -hd)], { columnHeight: Math.min(5.5, Hlow - 0.8), spacing: 2.8, depth: 3.0, back: 'none', closed: true, material: 'marble_giallo', detail, order: 'corinthian' });
      // Back wall closing the palaestra behind (the side wall is the block's outer wall).
      piercedWall(d, sx < 0 ? -fw / 2 : w / 2 - t, zT1, sx < 0 ? -w / 2 + t : fw / 2, zT1, 0, Hlow, t, wallMat);
      spots.push(spot(`${lm.id}:palaestra${sx}`, 'npc', cx, 0.03, cz, 0));
    }
  }
  // Wall between the natatio court and the palaestrae.
  for (const sx of [-1, 1]) piercedWall(d, sx * fw / 2, zN0, sx * fw / 2, zN1, 0, Hlow, t * 0.7, wallMat, [{ x: (zN1 - zN0) * 0.5, w: 2.4, h: 3.2, arched: true }]);
  spots.push(spot(`${lm.id}:entrance`, 'door', -fw * 0.32, 0, zN0 - 0.8, 0), spot(`${lm.id}:inscription`, 'inscription', 0, 0, zN0 - 3, 0));
  far.span(wallMat, -w / 2, 0, zN0, w / 2, Hlow, zT1);
  far.span(wallMat, -fw / 2, 0, fz0, fw / 2, Hf, fz1);
  tiledRoof(far, 'gable', 0, (fz0 + fz1) / 2, fw, fz1 - fz0, Hf, 'low', { axis: 'x', pitchDeg: 12 });
  return { zN1, zF1, zT1, fw };
}

function buildBaths(ctx: LandmarkContext): LandmarkBuild {
  const { lm } = ctx;
  const h = hintsOf(lm);
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const H = heightG(ctx, 8);
  const spots: Spot[] = [];
  thermae(d, ctx, w, dd, H, spots, far, { rotunda: h.has('rotunda', 'round'), natatio: w > 24, palaestrae: w > 40 });
  return finish(lm.id, d, spots, far);
}

// ---------------------------------------------------------------- camps

export interface FortOpts {
  wallH?: number;
  wallT?: number;
  wallMat?: MaterialId;
  /** Gate positions per side [front, right, back, left] as a fraction along the side (−1 = none). */
  gates?: [number, number, number, number];
  towers?: boolean;
  /** Rows of barracks blocks inside (each a long low tiled range). */
  barracks?: boolean;
  /** Rounded corner radius (Castra Praetoria). */
  corner?: number;
  /** Cells (vaulted rooms) along the inside of the walls. */
  wallCells?: boolean;
}

/**
 * A walled fort over w × dd: brick walls with merlons that follow the ground, towered gates, a
 * principia with the shrine of the standards in the middle, rows of barracks and a parade ground.
 */
export function fort(d: Draw, ctx: LandmarkContext, w: number, dd: number, spots: Spot[], far: Draw, o: FortOpts = {}) {
  const { detail, lm } = ctx;
  const wallH = o.wallH ?? 4.7;
  const t = o.wallT ?? 1.4;
  const mat = o.wallMat ?? 'brick';
  const gates = o.gates ?? [0.5, 0.5, 0.5, 0.5];
  const gw = 4.4;
  const r = Math.min(o.corner ?? 0, Math.min(w, dd) * 0.1);
  const corners: [number, number][] = [[-w / 2, -dd / 2], [w / 2, -dd / 2], [w / 2, dd / 2], [-w / 2, dd / 2]];
  const g = (x: number, z: number) => ctx.groundAt(x, z);
  const gatePts: { x: number; z: number; rot: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    const f = gates[i];
    const gap: [number, number][] = f >= 0 ? [[f * len - gw / 2 - 2.2, f * len + gw / 2 + 2.2]] : [];
    groundWall(d, ctx, ax + ux * r, az + uz * r, bx - ux * r, bz - uz * r, wallH, t, mat, 8, gap.map(([a, b]) => [a - r, b - r]));
    // Merlons along the parapet (following the ground in steps).
    if (detail === 'high' || len < 200) {
      const n = Math.max(1, Math.round((len - 2 * r) / 10));
      for (let k = 0; k < n; k++) {
        const s0 = r + ((len - 2 * r) * k) / n, s1 = r + ((len - 2 * r) * (k + 1)) / n;
        if (f >= 0 && s1 > f * len - gw / 2 - 2.2 && s0 < f * len + gw / 2 + 2.2) continue;
        const mx0 = ax + ux * s0, mz0 = az + uz * s0, mx1 = ax + ux * s1, mz1 = az + uz * s1;
        const gy = Math.max(g(mx0, mz0), g(mx1, mz1), g((mx0 + mx1) / 2, (mz0 + mz1) / 2));
        crenellations(d, mx0 + uz * (t / 2 - 0.25), mz0 - ux * (t / 2 - 0.25), mx1 + uz * (t / 2 - 0.25), mz1 - ux * (t / 2 - 0.25), gy + wallH, 0.5, mat, 1.1, 0.9, 0.9);
      }
    }
    if (f >= 0) {
      const gx = ax + ux * f * len, gz = az + uz * f * len;
      gatePts.push({ x: gx, z: gz, rot: Math.atan2(-uz, ux) });
    }
    far.span(mat, Math.min(ax, bx) - t / 2, -1, Math.min(az, bz) - t / 2, Math.max(ax, bx) + t / 2, wallH, Math.max(az, bz) + t / 2);
  }
  // Rounded corners: short wall chords round a quarter circle.
  if (r > 0) {
    const cs: [number, number, number][] = [[-w / 2 + r, -dd / 2 + r, Math.PI], [w / 2 - r, -dd / 2 + r, -Math.PI / 2], [w / 2 - r, dd / 2 - r, 0], [-w / 2 + r, dd / 2 - r, Math.PI / 2]];
    for (const [cx, cz, a0] of cs) {
      const n = 4;
      for (let k = 0; k < n; k++) {
        const a = a0 + (Math.PI / 2) * (k / n), b = a0 + (Math.PI / 2) * ((k + 1) / n);
        groundWall(d, ctx, cx + Math.cos(a) * r, cz + Math.sin(a) * r, cx + Math.cos(b) * r, cz + Math.sin(b) * r, wallH, t, mat, 20);
      }
    }
  }
  // Gatehouses: two square towers and an arched passage with a walkway over it.
  for (const [i, gp] of gatePts.entries()) {
    const y = g(gp.x, gp.z);
    const f = d.at(gp.x, y, gp.z, gp.rot);
    const tw = 5.2, th = wallH + 3.2;
    for (const sx of [-1, 1]) {
      const x = sx * (gw / 2 + tw / 2);
      f.span(mat, x - tw / 2, -1.2, -tw / 2 - 0.6, x + tw / 2, th, tw / 2 - 0.6, { collide: true });
      crenellations(f, x - tw / 2, -tw / 2 - 0.4, x + tw / 2, -tw / 2 - 0.4, th, 0.5, mat, 0.9, 0.7, 0.9);
      f.span('black', x - 0.35, th - 2.6, -tw / 2 - 0.62, x + 0.35, th - 1.4, -tw / 2 - 0.58);
    }
    f.span(mat, -gw / 2, wallH - 0.4, -t / 2 - 0.6, gw / 2, wallH + 1.2, t / 2, { collide: true });
    f.span('travertine', -gw / 2 - 0.2, wallH - 0.9, -t / 2 - 0.7, gw / 2 + 0.2, wallH - 0.4, t / 2 + 0.1);
    f.span('cobbles', -gw / 2, -0.3, -tw / 2 - 1, gw / 2, 0.02, tw / 2 + 1);
    if (detail === 'high') {
      for (const sx of [-1, 1]) f.box('wood_dark', sx * gw * 0.38, (wallH - 1) / 2, t / 2 + 0.1, gw * 0.24, wallH - 1, 0.15, { ry: sx * 1.1 });
    }
    spots.push(spot(`${lm.id}:gate${i}`, 'door', 0, 0, 0, 0), spot(`${lm.id}:sentry${i}`, 'npc', 0, 0, 0, 0));
    const sp = spots[spots.length - 2], se = spots[spots.length - 1];
    sp.position.copy(f.point(0, 0, -tw / 2 - 1.6));
    sp.heading = gp.rot;
    se.position.copy(f.point(gw / 2 + 0.9, 0, -tw / 2 - 1.2));
    se.heading = gp.rot + Math.PI;
    far.span(mat, gp.x - gw / 2 - tw, y - 1, gp.z - tw / 2, gp.x + gw / 2 + tw, y + th, gp.z + tw / 2);
  }
  // Cells along the inside of the walls (vaulted rooms ~3 m high, as at the Castra Praetoria).
  if (o.wallCells) {
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i];
      const [bx, bz] = corners[(i + 1) % 4];
      const len = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      const nx = -uz, nz = ux; // inward
      const n = Math.floor((len - 2 * r - 12) / 4.5);
      for (let k = 0; k < n; k += detail === 'high' ? 1 : 2) {
        const s = r + 6 + (k + 0.5) * ((len - 2 * r - 12) / n);
        if (gates[i] >= 0 && Math.abs(s - gates[i] * len) < gw / 2 + 6) continue;
        const cx = ax + ux * s + nx * (t / 2 + 2), cz = az + uz * s + nz * (t / 2 + 2);
        const y = g(cx, cz);
        const f = d.at(cx, y, cz, Math.atan2(-uz, ux));
        f.span(mat, -2.1, -0.6, -2, 2.1, 3.0, 2, { collide: true });
        f.span('black', -0.6, 0, 2.0, 0.6, 2.2, 2.04);
      }
    }
  }
  // Principia in the middle (courtyard building with the aedes of the standards), parade ground in front.
  const pw = Math.min(w * 0.2, 40), pd = Math.min(dd * 0.18, 34);
  const pz = -dd * 0.06;
  const py = groundRange(ctx, -pw / 2, pz - pd / 2, pw / 2, pz + pd / 2).max;
  const P = d.at(0, py, pz);
  plinth(P, { ...ctx, groundAt: (x, z) => ctx.groundAt(x, z + pz) - py }, -pw / 2, -pd / 2, pw / 2, pd / 2, 0.02, 'brick');
  courtyardRanges(P, -pw / 2, -pd / 2, pw / 2, pd / 2, Math.min(6, pw * 0.2), 6, mat, detail, { gate: 4, inner: 'cells', courtMat: 'paving_travertine' });
  const aedes = P.at(0, 0, pd / 2 - 6 - 2.5);
  aedes.span('marble', -3, 0, -2.5, 3, 0.6, 2.5, { collide: true });
  for (let k = 0; k < 5; k++) {
    const x = -2 + k;
    aedes.cyl('wood_dark', x, 0.6 + 1.6, 0.8, 0.04, 3.2, 5);
    aedes.box(k === 2 ? 'gilded_bronze' : 'fabric_red', x, 3.0, 0.75, k === 2 ? 0.35 : 0.6, k === 2 ? 0.5 : 0.8, 0.05);
  }
  spots.push(spot(`${lm.id}:standards`, 'shrine', P.point(0, 0, pd / 2 - 6 - 5.5).x, py, P.point(0, 0, pd / 2 - 6 - 5.5).z, 0));
  far.span(mat, -pw / 2, py - 1, pz - pd / 2, pw / 2, py + 6, pz + pd / 2);
  // Barracks: long, low tiled blocks in rows either side of the via principalis and the via praetoria.
  if (o.barracks ?? true) {
    const bwd = 9;
    const rows: { x: number; z: number; l: number }[] = [];
    const margin = 14 + (o.wallCells ? 5 : 0);
    const via = 5; // half-width of the via praetoria (x = 0)
    const zPrinc = pz - pd / 2 - 12; // via principalis in front of the principia
    for (let z = -dd / 2 + margin + bwd / 2; z < dd / 2 - margin - bwd / 2; z += bwd + 7) {
      if (Math.abs(z - zPrinc) < bwd / 2 + 4) continue;
      for (const sx of [-1, 1]) {
        const a = via, b = w / 2 - margin;
        if (b - a < 12) continue;
        const n = Math.max(1, Math.round((b - a) / 55));
        const l = (b - a) / n;
        for (let k = 0; k < n; k++) {
          const x = sx * (a + (k + 0.5) * l);
          if (Math.abs(x) - l / 2 < pw / 2 + 6 && Math.abs(z - pz) < pd / 2 + bwd / 2 + 6) continue;
          rows.push({ x, z, l: l - 6 });
        }
      }
    }
    const lim = detail === 'high' ? rows.length : Math.min(rows.length, 40);
    for (const [k, r0] of rows.slice(0, lim).entries()) {
      const bl = r0.l;
      const { min, max } = groundRange(ctx, r0.x - bl / 2, r0.z - bwd / 2, r0.x + bl / 2, r0.z + bwd / 2, 2);
      const f = d.at(r0.x, max, r0.z);
      f.span(mat, -bl / 2, min - max - 0.5, -bwd / 2, bl / 2, 3.4, bwd / 2, { collide: true });
      const doors = Math.floor(bl / 4);
      for (let i = 0; i < doors; i++) f.span('black', -bl / 2 + (i + 0.5) * (bl / doors) - 0.5, 0, -bwd / 2 - 0.03, -bl / 2 + (i + 0.5) * (bl / doors) + 0.5, 2.2, -bwd / 2);
      tiledRoof(f, 'gable', 0, 0, bl, bwd, 3.4, 'low', { axis: 'x', pitchDeg: 20 });
      far.span(mat, r0.x - bl / 2, max - 0.5, r0.z - bwd / 2, r0.x + bl / 2, max + 4.5, r0.z + bwd / 2);
      if (k % 6 === 0) spots.push(spot(`${lm.id}:barrack${k}`, 'npc', r0.x, max, r0.z - bwd / 2 - 1.2, 0));
    }
  }
  spots.push(spot(`${lm.id}:parade`, 'vista', 0, g(0, pz - pd / 2 - 20), pz - pd / 2 - 20, 0));
}

function buildCamp(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const h = hintsOf(lm);
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const H = heightG(ctx, 4);
  const spots: Spot[] = [];
  if (h.has('ludus', 'gladiator')) {
    // Gladiator school: cells round a court, a small oval practice arena with a few rows of seats.
    plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'brick');
    const wing = clamp(Math.min(w, dd) * 0.16, 5, 9);
    courtyardRanges(d, -w / 2, -dd / 2, w / 2, dd / 2, wing, Math.min(H, 9), 'brick', detail, { gate: 4, inner: 'cells', courtMat: 'sand' });
    const rx = (w - 2 * wing) * 0.36, rz = (dd - 2 * wing) * 0.34;
    const segs = detail === 'high' ? 40 : 20;
    for (let k = 0; k < 4; k++) {
      const g = new THREE.CylinderGeometry(1, 1, 0.4, segs, 1, true);
      d.geo(g, k === 0 ? 'travertine' : 'marble', 0, 0.2 + k * 0.4 + 1.0, 0, { sx: rx + 0.8 + k * 0.7, sz: rz + 0.8 + k * 0.7 });
    }
    d.geo(new THREE.CylinderGeometry(1, 1, 1.2, segs, 1, true), 'travertine', 0, 0.6, 0, { sx: rx, sz: rz });
    d.span('sand', -rx, 0.03, -rz, rx, 0.05, rz);
    for (let i = 0; i < 4; i++) placeProp(d, 'statue_pedestal', -rx * 0.5 + i * rx * 0.33, 0.05, rz * 0.5, 0, { collide: false });
    spots.push(spot(`${lm.id}:arena`, 'npc', 0, 0.05, 0, 0), spot(`${lm.id}:lanista`, 'npc', 0, 0.05, -rz - 1.5, 0), spot(`${lm.id}:gate`, 'door', 0, 0, -dd / 2 - 0.6, 0));
    far.span('brick', -w / 2, 0, -dd / 2, w / 2, Math.min(H, 9), dd / 2);
    return finish(lm.id, d, spots, far);
  }
  if (h.has('vigiles', 'firemen', 'watch') || w * dd < 2600) {
    // Fire-watch station: barracks round a court with a shrine, pumps and bucket stores.
    plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'brick');
    const wing = clamp(Math.min(w, dd) * 0.25, 4, 7);
    courtyardRanges(d, -w / 2, -dd / 2, w / 2, dd / 2, wing, Math.min(H, 8), 'brick', detail, { gate: 3.4, inner: 'cells', courtMat: 'cobbles' });
    const cd = dd / 2 - wing;
    aedicula(d, 0, 0.04, cd - 1.2, 2.4, 'plaster_red', detail);
    for (let i = 0; i < 6; i++) placeProp(d, 'basket', -w / 2 + wing + 1 + i * 0.6, 0.04, -dd / 2 + wing + 0.8, i, { collide: false });
    placeProp(d, 'vat', w / 2 - wing - 1.5, 0.04, 0, 0);
    placeProp(d, 'handcart', w / 2 - wing - 2, 0.04, -2.5, 0.3);
    for (let i = 0; i < 3; i++) d.box('wood', -w / 2 + wing + 0.4, 2.3, -1 + i * 0.7, 0.08, 4.6, 0.5, { rz: 0.12 });
    // The watch keeps lamps burning all night at the gate; a painted notice of the cohort.
    for (const sx of [-1, 1]) wallTorch(ctx, d, sx * 2.6, 3.0, -dd / 2 - 0.12, 0);
    inscription(d, [h.has('vigiles') ? 'COHORS VIGILVM' : lm.latin.split('/')[0].trim()], 0, 5.6, -dd / 2 - 0.2, 4, 0.7, 0, 'painted');
    placeProp(d, 'bench_masonry', 4.5, 0, -dd / 2 - 0.9, 0);
    spots.push(spot(`${lm.id}:gate`, 'door', 0, 0, -dd / 2 - 0.6, 0), spot(`${lm.id}:shrine`, 'shrine', 0, 0.04, cd - 2.6, 0), spot(`${lm.id}:watchman`, 'npc', 1.6, 0, -dd / 2 - 0.8, Math.PI), spot(`${lm.id}:buckets`, 'container', -w / 2 + wing + 1.6, 0.04, -dd / 2 + wing + 1.6, Math.PI), spot(`${lm.id}:bench`, 'sit', 4.5, 0, -dd / 2 - 1.4, Math.PI));
    far.span('brick', -w / 2, 0, -dd / 2, w / 2, Math.min(H, 8), dd / 2);
    return finish(lm.id, d, spots, far);
  }
  fort(d, ctx, w, dd, spots, far, { wallH: clamp(H, 4, 8), corner: 8, wallCells: w > 120 });
  return finish(lm.id, d, spots, far, 1000);
}

// ---------------------------------------------------------------- harbours

export interface QuayOpts {
  /** Height of the quay top above the water (game m). */
  drop?: number;
  /** Depth of the stepped quay strip (game m). */
  depth?: number;
  cranes?: number;
  /** Warehouse fronts along the back of the strip. */
  sheds?: boolean;
}

/**
 * A river quay along the −z edge of w × dd: a travertine embankment falling to the water in steps,
 * ramps, pierced mooring blocks along the face, bollards, treadwheel cranes and stacks of goods on
 * the wharf, and (optionally) a row of warehouse fronts behind.
 */
export function quay(d: Draw, ctx: LandmarkContext, w: number, dd: number, spots: Spot[], far: Draw, o: QuayOpts = {}) {
  const { detail, lm } = ctx;
  const rng = ctx.rng.fork('quay');
  const drop = o.drop ?? 3.4;
  const qd = Math.min(o.depth ?? dd * 0.45, dd);
  const z0 = -dd / 2; // water edge
  const steps = 5;
  const sd = 1.4;
  // Stepped embankment: wide steps (visual giant steps, 0.6 m) with walkable flights every so often.
  for (let k = 0; k < steps; k++) {
    const y1 = -drop + ((k + 1) * drop) / steps;
    d.span('travertine', -w / 2, -drop - 1.5, z0 + k * sd, w / 2, y1, z0 + (k + 1) * sd, { collide: true });
  }
  d.span('paving_travertine', -w / 2, -1.5, z0 + steps * sd, w / 2, 0.02, z0 + qd, { collide: true });
  const nf = Math.max(1, Math.round(w / 40));
  for (let i = 0; i < nf; i++) {
    const x = -w / 2 + ((i + 0.5) * w) / nf;
    flight(d.at(0, 0, 0, 0), x, z0 - 0.4, 2.2, -drop, 0, 'travertine');
  }
  // Ramps for carts at the ends (down-river and up-river).
  // Mooring blocks with a hole through them, set into the lowest step face.
  const nm = Math.floor(w / 9);
  for (let i = 0; i < nm; i++) {
    const x = -w / 2 + ((i + 0.5) * w) / nm;
    d.span('travertine', x - 0.5, -drop + 0.3, z0 - 0.35, x + 0.5, -drop + 1.2, z0 + 0.2);
    d.cyl('black', x, -drop + 0.75, z0 - 0.36, 0.16, 0.05, 8, { rx: Math.PI / 2 });
    if (i % 2 === 0) d.cyl('travertine', x, 0.45, z0 + steps * sd + 0.6, 0.28, 0.9, 8, { collide: true });
  }
  // Goods on the wharf.
  const goods: PropKind[] = ['amphora_stack', 'amphora_stack', 'sack', 'crate', 'dolium', 'amphora_rack', 'cart', 'handcart', 'basket'];
  const zw0 = z0 + steps * sd + 2, zw1 = z0 + qd - 2;
  const ng = detail === 'high' ? Math.floor(w / 6) : Math.floor(w / 15);
  for (let i = 0; i < ng; i++) {
    const x = -w / 2 + 3 + rng.range(0, w - 6);
    const z = rng.range(zw0, Math.max(zw0 + 0.5, zw1));
    placeProp(d, goods[rng.int(0, goods.length - 1)], x, 0.02, z, rng.range(0, 6.28), { rng: rng.fork(`g${i}`) });
    if (i % 5 === 0) spots.push(spot(`${lm.id}:goods${i}`, 'container', x, 0.02, z - 1.2, 0));
  }
  // Treadwheel cranes at the edge, swung out over the water.
  const nc = o.cranes ?? Math.max(1, Math.floor(w / 80));
  for (let i = 0; i < nc; i++) {
    const x = -w / 2 + ((i + 0.5) * w) / nc + 6;
    treadwheelCrane(d.at(x, 0.02, z0 + steps * sd + 1.2, 0), 10 + rng.range(-1, 2), rng.fork(`c${i}`));
    spots.push(spot(`${lm.id}:crane${i}`, 'npc', x + 2.5, 0.02, z0 + steps * sd + 4.5, Math.PI));
  }
  // Barges moored at the foot of the quay.
  const nb = Math.max(1, Math.floor(w / 70));
  for (let i = 0; i < nb; i++) {
    const x = -w / 2 + ((i + 0.3) * w) / nb;
    const f = d.at(x, -drop + 0.15, z0 - 3.2, 0);
    f.box('wood_dark', 0, 0, 0, 14, 1.2, 3.6);
    f.box('wood', 0, 0.62, 0, 13, 0.08, 3.2);
    for (let k = 0; k < 6; k++) placeProp(f, 'amphora_globular', -4 + k * 1.4, 0.66, 0.4 * (k % 2 ? 1 : -1), 0, { collide: false });
    f.cyl('wood', 3.5, 4, 0, 0.12, 7, 6);
  }
  if (o.sheds ?? true) {
    const sz = z0 + qd;
    tabernae(d, -w / 2 + 1, w / 2 - 1, sz, Math.min(8, dd - qd - 0.5), 6.5, 'brick', detail, rng.fork('sheds'));
    d.span('brick', -w / 2, 6.5, sz, w / 2, 7.2, sz + Math.min(8, dd - qd - 0.5), { collide: true });
    tiledRoof(d, 'shed', 0, sz + Math.min(8, dd - qd - 0.5) / 2, w, Math.min(8, dd - qd - 0.5), 7.2, 'low', { pitchDeg: 14 });
    far.span('brick', -w / 2, 0, sz, w / 2, 7.2, sz + Math.min(8, dd - qd - 0.5));
  }
  spots.push(spot(`${lm.id}:quay`, 'vista', 0, 0.02, z0 + steps * sd + 0.8, Math.PI), spot(`${lm.id}:boatman`, 'npc', -w * 0.1, -drop + 0.6, z0 + 0.5, Math.PI));
  far.span('travertine', -w / 2, -drop, z0, w / 2, 0.02, z0 + qd);
}

function buildHarbor(ctx: LandmarkContext): LandmarkBuild {
  const { lm } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  // Find how far the ground falls at the water edge to size the embankment.
  const edge = Math.min(ctx.groundAt(0, -dd / 2 - 3), ctx.groundAt(-w / 4, -dd / 2 - 3), ctx.groundAt(w / 4, -dd / 2 - 3));
  quay(d, ctx, w, dd, spots, far, { drop: clamp(-edge + 0.4, 1.8, 5) });
  return finish(lm.id, d, spots, far, 900);
}

// ---------------------------------------------------------------- gardens

export interface GardenOpts {
  walls?: boolean;
  /** Number of pavilions / statues / pergolas (scaled by area if omitted). */
  pavilions?: number;
  tower?: boolean;
  nymphaeum?: boolean;
  trees?: number;
}

/**
 * Pleasure gardens over w × dd, following the terrain: a low boundary wall with gates, gravel walks
 * in a grid, box hedges, statues on bases, vine pergolas with benches, basins, a pavilion (a small
 * tholos or a belvedere tower) and a nymphaeum — kept clear of every other landmark inside.
 */
export function gardenLayout(d: Draw, ctx: LandmarkContext, w: number, dd: number, spots: Spot[], o: GardenOpts = {}) {
  const { detail, lm } = ctx;
  const rng = ctx.rng.fork('garden');
  const free = clearOf(obstacles(ctx, 3));
  const g = (x: number, z: number) => ctx.groundAt(x, z);
  // Boundary wall with a gate in the middle of each side.
  if (o.walls ?? true) {
    const corners: [number, number][] = [[-w / 2, -dd / 2], [w / 2, -dd / 2], [w / 2, dd / 2], [-w / 2, dd / 2]];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i];
      const [bx, bz] = corners[(i + 1) % 4];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 8));
      for (let k = 0; k < n; k++) {
        if (Math.abs((k + 0.5) / n - 0.5) < 0.6 / n) continue; // gate
        const x0 = ax + ((bx - ax) * k) / n, z0 = az + ((bz - az) * k) / n;
        const x1 = ax + ((bx - ax) * (k + 1)) / n, z1 = az + ((bz - az) * (k + 1)) / n;
        if (!free((x0 + x1) / 2, (z0 + z1) / 2, 1)) continue;
        const lo = Math.min(g(x0, z0), g(x1, z1));
        wallRun(d, x0, z0, x1, z1, lo - 0.5, Math.max(g(x0, z0), g(x1, z1)) + 2.2, 0.6, 'plaster_white');
        if (k % 2 === 0) d.box('travertine', x0, Math.max(g(x0, z0), lo) + 1.25, z0, 0.9, 2.5, 0.9);
      }
    }
  }
  // Walks: a cross of main allées and secondary paths, as strips draped on the ground every metre
  // (flat 5 m boxes floated off the slope at one end and sank at the other).
  const strip = (ax: number, az: number, bx: number, bz: number, wd: number, mat: MaterialId = 'gravel') => {
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    const nx = -uz * (wd / 2), nz = ux * (wd / 2);
    const n = Math.max(1, Math.round(len));
    const lift = 0.05;
    const pos: number[] = [];
    let run: [number, number, number, number, number, number][] = [];
    const flush = () => {
      for (let k = 0; k + 1 < run.length; k++) {
        const [lx0, ly0, lz0, rx0, ry0, rz0] = run[k], [lx1, ly1, lz1, rx1, ry1, rz1] = run[k + 1];
        pos.push(lx0, ly0, lz0, lx1, ly1, lz1, rx0, ry0, rz0, rx0, ry0, rz0, lx1, ly1, lz1, rx1, ry1, rz1);
      }
      run = [];
    };
    for (let k = 0; k <= n; k++) {
      const cx = ax + ((bx - ax) * k) / n, cz = az + ((bz - az) * k) / n;
      if (!free(cx, cz, wd / 2)) {
        flush();
        continue;
      }
      run.push([cx + nx, g(cx + nx, cz + nz) + lift, cz + nz, cx - nx, g(cx - nx, cz - nz) + lift, cz - nz]);
    }
    flush();
    if (!pos.length) return;
    // Orient every triangle up.
    for (let i = 0; i < pos.length; i += 9) {
      const e1x = pos[i + 3] - pos[i], e1z = pos[i + 5] - pos[i + 2], e2x = pos[i + 6] - pos[i], e2z = pos[i + 8] - pos[i + 2];
      if (e1z * e2x - e1x * e2z < 0) for (let c = 0; c < 3; c++) [pos[i + 3 + c], pos[i + 6 + c]] = [pos[i + 6 + c], pos[i + 3 + c]];
    }
    d.tris(mat, pos);
  };
  strip(-w / 2, 0, w / 2, 0, 5, 'paving_travertine');
  strip(0, -dd / 2, 0, dd / 2, 5, 'paving_travertine');
  for (const f of [-0.3, 0.3]) {
    strip(-w / 2, dd * f, w / 2, dd * f, 2.2);
    strip(w * f, -dd / 2, w * f, dd / 2, 2.2);
  }
  // Features at the crossings and along the walks.
  const area = w * dd;
  const nFeat = o.pavilions ?? clamp(Math.round(area / 2500), 4, detail === 'high' ? 28 : 12);
  const sites: [number, number][] = [];
  for (const fx of [-0.3, 0, 0.3]) for (const fz of [-0.3, 0, 0.3]) sites.push([w * fx, dd * fz]);
  for (let i = 0; sites.length < nFeat + 4 && i < 200; i++) sites.push([rng.range(-w * 0.45, w * 0.45), rng.range(-dd * 0.45, dd * 0.45)]);
  let placed = 0;
  let pav = false, nym = false, tower = false;
  for (const [x0, z0] of sites) {
    if (placed >= nFeat) break;
    const x = x0 + (x0 === 0 ? 0 : 5), z = z0 + 5;
    if (!free(x, z, 6)) continue;
    const y = g(x, z);
    const kind = !pav ? 'pavilion' : !nym && (o.nymphaeum ?? true) ? 'nymphaeum' : !tower && o.tower ? 'tower' : (['statue', 'pergola', 'basin', 'statue', 'pergola', 'hedges'] as const)[placed % 6];
    if (kind === 'pavilion') {
      pav = true;
      const { min } = groundRange(ctx, x - 5, z - 5, x + 5, z + 5, 2);
      tholos(d.b, { radius: 3.6, columns: 8, order: 'ionic', base: 'steps', material: 'marble', cellaMaterial: 'plaster_white', podiumMaterial: 'travertine', detail: 'low' }, mul(d.m, T(x, Math.max(y, min), z)));
      d.span('travertine', x - 4.6, min - 0.6, z - 4.6, x + 4.6, Math.max(y, min) + 0.02, z + 4.6, { collide: true });
      spots.push(spot(`${lm.id}:pavilion`, 'vista', x, Math.max(y, min) + 0.5, z - 5.6, 0));
    } else if (kind === 'nymphaeum') {
      nym = true;
      const f = d.at(x, y, z);
      f.span('brick', -5, -0.5, 1.2, 5, 4.2, 2.2, { collide: true });
      for (let k = 0; k < 3; k++) f.span('black', -3.6 + k * 3, 1.0, 1.15, -2.4 + k * 3, 3.0, 1.2);
      for (let k = 0; k < 3; k++) statueOnPedestal(f, 'togate', -3 + k * 3, 1.0, 1.0, 0, 0.6, 'marble', 'low', 0.1);
      pool(f, 0, 0, -0.6, 9, 3, 'marble', 0.5, 0.4);
      spots.push(spot(`${lm.id}:nymphaeum`, 'shrine', x, y, z - 3, 0));
    } else if (kind === 'tower') {
      tower = true;
      const f = d.at(x, y, z);
      f.span('brick', -3, -0.6, -3, 3, 14, 3, { collide: true });
      for (const yy of [4, 8, 11.5]) for (const s of [-1, 1]) f.span('black', s * 0.6 - 0.45, yy, -3.02, s * 0.6 + 0.45, yy + 1.6, -2.98);
      f.span('travertine', -3.3, 14, -3.3, 3.3, 14.4, 3.3);
      crenellations(f, -3, -3, 3, -3, 14.4, 0.4, 'brick', 0.8, 0.6, 0.8);
      tiledRoof(f, 'hip', 0, 0, 6, 6, 15.2, 'low', { pitchDeg: 24 });
      spots.push(spot(`${lm.id}:tower`, 'vista', x, y, z - 4, 0));
    } else if (kind === 'statue') {
      statueOnPedestal(d, rng.chance(0.3) ? 'seated' : 'togate', x, y, z, rng.range(-0.5, 0.5), 1.0, rng.chance(0.4) ? 'bronze' : 'marble', 'low', 1.4);
      if (placed % 3 === 0) spots.push(spot(`${lm.id}:statue${placed}`, 'inscription', x, y, z - 1.4, 0));
    } else if (kind === 'pergola') {
      const f = d.at(x, y, z, rng.chance(0.5) ? 0 : Math.PI / 2);
      pergola(f, 3, 8, 2.4, 'wood');
      for (let k = 0; k < 6; k++) f.span('foliage_broad', -1.6 + rng.range(-0.2, 0.2), 2.45, -4 + k * 1.35, 1.6, 2.75, -3.2 + k * 1.35);
      placeProp(f, 'bench_masonry', 1.0, 0, 0, -Math.PI / 2);
      spots.push(spot(`${lm.id}:pergola${placed}`, 'sit', x, y, z, 0));
    } else if (kind === 'basin') {
      roundBasin(d, x, y, z, 2.2, 'marble', 0.5, detail);
    } else {
      hedge(d, x - 6, z - 0.4, x + 6, z + 0.4, y, 0.9);
      hedge(d, x - 6, z + 3.6, x + 6, z + 4.4, y, 0.9);
    }
    placed++;
  }
  // A few trees integral to the design (cypresses lining the main allée, pines by the pavilion).
  const nt = o.trees ?? (detail === 'high' ? 16 : 8);
  for (let i = 0; i < nt; i++) {
    const x = -w * 0.4 + ((i % (nt / 2)) / (nt / 2 - 1)) * w * 0.8;
    const z = i < nt / 2 ? -3.6 : 3.6;
    if (!free(x, z, 2)) continue;
    tree(ctx, d, 'cypress', x, g(x, z), z, 11 + rng.range(-2, 3));
  }
  spots.push(spot(`${lm.id}:gate`, 'door', 0, g(0, -dd / 2 - 1), -dd / 2 - 1, 0));
}

function buildGarden(ctx: LandmarkContext): LandmarkBuild {
  const { lm } = ctx;
  const h = hintsOf(lm);
  const d = draw(ctx);
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  if (sitingOf(lm) !== 'open' && w * dd < 12000) {
    // A porticoed garden (built, on a pad).
    plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'travertine');
    quadriporticusGarden(d, ctx, w, dd, heightG(ctx, 6), spots, { garden: 'trees' });
    return finish(lm.id, d, spots);
  }
  if (h.has('grove', 'spring', 'lucus') && !h.has('gardens', 'pavilion', 'porticoes')) {
    // A sacred grove with its spring (and, where let out, the people living in it).
    sacredGrove(d, ctx, w, dd, h, spots);
    return finish(lm.id, d, spots);
  }
  gardenLayout(d, ctx, w, dd, spots, { tower: h.has('tower', 'turris', 'watched rome burn'), nymphaeum: true });
  return finish(lm.id, d, spots, undefined, 700);
}

// ---------------------------------------------------------------- other

function buildOther(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const h = hintsOf(lm);
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const H = heightG(ctx, 3);
  const spots: Spot[] = [];
  const g = (x: number, z: number) => ctx.groundAt(x, z);
  if (h.has('district', 'quarter', 'anchor')) {
    // A district anchor: the community building (a synagogue as a house-type hall round a court).
    const free = clearOf(obstacles(ctx, 2));
    const W = 22, D = 26;
    let cx = 0, cz = 0;
    for (const [x, z] of [[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30]] as const) if (free(x, z, 16)) { cx = x; cz = z; break; }
    const f = d.at(cx, 0, cz);
    const { min, max } = groundRange(ctx, cx - W / 2, cz - D / 2, cx + W / 2, cz + D / 2, 3);
    const F = d.at(cx, max, cz);
    F.span('travertine', -W / 2, min - max - 0.5, -D / 2, W / 2, 0.02, D / 2, { collide: true });
    courtyardRanges(F, -W / 2, -D / 2, W / 2, -D / 2 + 10, 3.5, 5, 'plaster_cream', detail, { gate: 2.4, inner: 'plain', courtMat: 'cobbles' });
    hall(F, -W / 2, -D / 2 + 10, W / 2, D / 2, { mat: 'plaster_white', height: 7.5, roof: 'gable', roofAxis: 'z', doors: 1, detail, dado: 'plaster_red', windowRows: 1 });
    roundBasin(F, 0, 0.02, -D / 2 + 5, 1.0, 'travertine', 0.6, detail);
    void f;
    spots.push(spot(`${lm.id}:door`, 'door', cx, max, cz - D / 2 - 0.8, 0), spot(`${lm.id}:elder`, 'npc', cx + 1.5, max, cz - D / 2 - 1, Math.PI), spot(`${lm.id}:basin`, 'shrine', cx, max, cz - D / 2 + 3.6, 0));
    return finish(lm.id, d, spots);
  }
  if (h.has('field', 'bare') && lm.height < 2) {
    // A bare walled field; a hidden stair down to a small vaulted chamber (lamp, bread, water).
    const free = clearOf(obstacles(ctx, 1));
    for (const [ax, az, bx, bz] of [[-w / 2, -dd / 2, w / 2, -dd / 2], [w / 2, -dd / 2, w / 2, dd / 2], [w / 2, dd / 2, -w / 2, dd / 2], [-w / 2, dd / 2, -w / 2, -dd / 2]] as const) {
      if (free((ax + bx) / 2, (az + bz) / 2)) groundWall(d, ctx, ax, az, bx, bz, 1.4, 0.5, 'tufa', 6, az === -dd / 2 && bz === -dd / 2 ? [[w / 2 - 1.5, w / 2 + 1.5]] : []);
    }
    const x = w * 0.18, z = dd * 0.12, y = g(x, z);
    d.span('tufa', x - 1.2, y - 0.2, z - 1.8, x + 1.2, y + 0.12, z + 1.8);
    d.span('black', x - 0.7, y + 0.121, z - 1.3, x + 0.7, y + 0.13, z + 1.3);
    d.span('travertine', x - 1.4, y, z + 1.9, x + 1.4, y + 0.3, z + 2.4);
    spots.push(spot(`${lm.id}:stair`, 'door', x, y, z - 2.2, 0), spot(`${lm.id}:chamber`, 'container', x, y - 3, z, 0), spot(`${lm.id}:gate`, 'vista', 0, g(0, -dd / 2 - 1), -dd / 2 - 1, 0));
    return finish(lm.id, d, spots);
  }
  if (h.has('auditorium', 'apse', 'half-sunken')) {
    // Half-sunken hall with a stepped apse at the back, painted garden walls inside.
    const sink = 2.4;
    const z1 = dd / 2 - w / 2;
    d.span('concrete', -w / 2, -sink - 0.2, -dd / 2, w / 2, -sink, dd / 2);
    for (const [ax, az, bx, bz] of [[-w / 2, -dd / 2, w / 2, -dd / 2], [w / 2, -dd / 2, w / 2, z1], [-w / 2, z1, -w / 2, -dd / 2]] as const) piercedWall(d, ax, az, bx, bz, -sink, H - sink, 0.8, 'reticulatum', ax === -w / 2 && az === -dd / 2 ? [{ x: w / 2, w: 1.6, h: 2.4 }] : []);
    for (let k = 0; k < 7; k++) {
      const r = w / 2 - 0.8 - k * 0.6;
      if (r < 1) break;
      const g2 = new THREE.CylinderGeometry(r, r, 0.3, 16, 1, false, Math.PI / 2, Math.PI);
      d.geo(g2, 'marble', 0, -sink + 0.15 + k * 0.3, z1);
      d.solidCyl(0, -sink + (k + 1) * 0.15, z1 + r * 0.5, r * 0.5, (k + 1) * 0.3);
    }
    const ap = new THREE.CylinderGeometry(w / 2, w / 2, H, 16, 1, true, Math.PI / 2, Math.PI);
    d.geo(ap, 'reticulatum', 0, -sink + H / 2, z1);
    d.span('stucco_painted', -w / 2 + 0.81, -sink + 1.2, -dd / 2 + 1, -w / 2 + 0.83, -sink + 4, z1);
    d.span('stucco_painted', w / 2 - 0.83, -sink + 1.2, -dd / 2 + 1, w / 2 - 0.81, -sink + 4, z1);
    flight(d, 0, -dd / 2 - flightLength(sink), 1.6, -sink, 0);
    tiledRoof(d, 'gable', 0, (z1 - dd / 2) / 2, w, z1 + dd / 2, H - sink, detail, { axis: 'z' });
    spots.push(spot(`${lm.id}:door`, 'door', 0, 0, -dd / 2 - flightLength(sink) - 0.6, 0), spot(`${lm.id}:recital`, 'sit', 0, -sink + 0.9, z1 + 1, Math.PI));
    return finish(lm.id, d, spots);
  }
  if (h.has('outlet', 'sewer', 'cloaca')) {
    // A triple-ringed arch in the embankment wall, dark water inside.
    d.span('peperino', -w / 2, -4, -dd / 2, w / 2, H, dd / 2, { collide: true });
    for (let k = 0; k < 3; k++) {
      const g2 = new THREE.TorusGeometry(2.2 + k * 0.5, 0.25, 4, 16, Math.PI);
      d.geo(g2, k === 1 ? 'tufa' : 'peperino', 0, 0, -dd / 2 - 0.1 - k * 0.02);
    }
    d.span('black', -2.1, -1, -dd / 2 - 0.05, 2.1, 1.8, -dd / 2 + 0.2);
    spots.push(spot(`${lm.id}:mouth`, 'door', 0, -1, -dd / 2 - 1, 0));
    return finish(lm.id, d, spots);
  }
  if (h.has('cliff', 'rock') && sitingOf(lm) === 'open') {
    // A cliff edge: a low parapet with a viewpoint and an altar of the condemned.
    railing(d, [[-w / 2, -dd / 2 + 1], [w / 2, -dd / 2 + 1]], 0, 1.0, false, (x, z) => g(x, z));
    spots.push(spot(`${lm.id}:edge`, 'vista', 0, g(0, -dd / 2 + 2), -dd / 2 + 2, Math.PI));
    return finish(lm.id, d, spots);
  }
  if (h.has('cistern', 'reservoir')) {
    plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'brick');
    const n = Math.max(2, Math.round(w / 6));
    for (let i = 0; i < n; i++) vaultedAisle(d, -w / 2 + (i + 0.5) * (w / n), -dd / 2, dd / 2, w / n - 0.8, H * 0.6, 'brick', detail);
    d.span('brick', -w / 2, 0, -dd / 2, w / 2, H * 0.6, dd / 2, { collide: true });
    d.span('concrete', -w / 2, H * 0.6 + w / n / 2 + 0.3, -dd / 2, w / 2, H * 0.6 + w / n / 2 + 0.5, dd / 2);
    spots.push(spot(`${lm.id}:hatch`, 'door', 0, 0, -dd / 2 - 0.6, 0));
    return finish(lm.id, d, spots);
  }
  if (sitingOf(lm) === 'open' && lm.height < 2) {
    // An open area with a boundary of cippi (marker stones) and a paved spot in the middle.
    const free = clearOf(obstacles(ctx, 1));
    const per = 2 * (w + dd);
    const n = Math.min(40, Math.max(8, Math.round(per / 12)));
    for (let i = 0; i < n; i++) {
      const s = (i / n) * per;
      const [x, z] = s < w ? [-w / 2 + s, -dd / 2] : s < w + dd ? [w / 2, -dd / 2 + s - w] : s < 2 * w + dd ? [w / 2 - (s - w - dd), dd / 2] : [-w / 2, dd / 2 - (s - 2 * w - dd)];
      if (free(x, z)) d.box('travertine', x, g(x, z) + 0.4, z, 0.4, 1.2, 0.3, { collide: true });
    }
    spots.push(spot(`${lm.id}:centre`, 'vista', 0, g(0, 0), 0, 0));
    return finish(lm.id, d, spots);
  }
  // Default: a public building — brick hall on a podium round a small court, with a portico front.
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'travertine');
  const top = hall(d, -w / 2 + 0.5, -dd / 2 + 3.5, w / 2 - 0.5, dd / 2 - 0.5, { mat: h.material === 'tufa' ? 'tufa' : 'brick', height: Math.max(4, H * 0.85), roof: 'gable', roofAxis: w > dd ? 'x' : 'z', doors: Math.max(1, Math.round(w / 12)), detail, arched: true, pilasters: 5 });
  liteColonnade(d, [V(w / 2 - 1, 0.02, -dd / 2 + 3.3), V(-w / 2 + 1, 0.02, -dd / 2 + 3.3)], { columnHeight: Math.min(H * 0.5, 6.5), spacing: 3, depth: 0.2, back: 'none', material: 'travertine', detail, order: 'tuscan' });
  spots.push(spot(`${lm.id}:door`, 'door', 0, 0, -dd / 2 + 2.5, 0));
  far.span('brick', -w / 2, 0, -dd / 2, w / 2, top, dd / 2);
  return finish(lm.id, d, spots, far);
}

export const builders: LandmarkBuilder[] = liftAll([
  { handles: ['category:basilica'], build: buildBasilica },
  { handles: ['category:curia'], build: buildCuria },
  { handles: ['category:library'], build: buildLibrary },
  { handles: ['category:prison'], build: buildPrison },
  { handles: ['category:palace'], build: buildPalace },
  { handles: ['category:house'], build: buildHouse },
  { handles: ['category:market'], build: buildMarket },
  { handles: ['category:warehouse'], build: buildWarehouse },
  { handles: ['category:portico'], build: buildPortico },
  { handles: ['category:baths'], build: buildBaths },
  { handles: ['category:camp'], build: buildCamp },
  { handles: ['category:harbor'], build: buildHarbor },
  { handles: ['category:garden'], build: buildGarden },
  { handles: ['category:other'], build: buildOther },
]);

export { TRS, type Hints };
