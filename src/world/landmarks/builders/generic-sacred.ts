/**
 * Category builders for sacred and commemorative landmarks: temples (fitted to the footprint with
 * the order, plan and column count read from the atlas notes; round ones as tholoi; big precincts
 * as a porticoed court round the temple), shrines, monuments (obelisks, statues, altars,
 * enclosures), honorific columns, fountains, tombs (drum, pyramid, altar, columbarium, rock-cut,
 * roadside cemeteries) and arches. (The Servian gates are in generic-gates.ts.)
 */
import * as THREE from 'three';
import { obelisk, honorificColumn } from '../../../arch/classical/monuments';
import { column } from '../../../arch/classical/column';
import { diameterForHeight, entablatureDims, type Order } from '../../../arch/classical/orders';
import { inscriptionPanel } from '../../../arch/common/inscription';
import { temple, templeLayout, type TempleLayout, type TemplePlan, type TempleSpec } from '../../../arch/classical/temple';
import { tholos } from '../../../arch/classical/tholos';
import { plainArch, triumphalArch } from '../../../arch/classical/arch';
import { lathe, ProfileBuilder } from '../../../arch/common/geom';
import type { Draw } from '../../../arch/fabric/draw';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import {
  T, TRS, V, altar, broadTree, crenellations, cypress, dims, draw, farDraw, finish, flight, heightG, hintsOf, inscription, mul, plinth, pool,
  railing, roundBasin, spot, statueOnPedestal, tiledRoof, wallRun, type Detail, type Hints,
} from './generic-common';
import { liteColonnade } from './generic-civic-lib';
import { lamp, tree } from './generic-world';

// ---------------------------------------------------------------- temples

export interface FitOptions {
  order?: Order;
  plan?: TemplePlan;
  front?: number;
  material?: MaterialId;
  podiumMaterial?: MaterialId;
  cellaMaterial?: MaterialId;
  roofMaterial?: 'roof_tile' | 'gilded_bronze';
  podiumHeight?: number;
  detail: Detail;
  pedimentRelief?: boolean;
  stairs?: 'front' | 'sides' | 'none';
  /**
   * Above this many columns the temple is built at 'low' detail even when `detail` is 'high' (a
   * fluted Corinthian column costs ~6k triangles at high detail). Default 6; heroes raise it.
   */
  maxHighColumns?: number;
  /** Dedication carved on the front frieze (lines, latinized here). */
  dedication?: string[];
  /** Bronze statues on pedestals flanking the foot of the stairs. */
  statues?: boolean;
  /** For lights: with a context the altar gets a live fire (light pool). */
  ctx?: LandmarkContext;
}

/**
 * Pure: a temple spec whose podium + stairs fill a w × d (game m) rectangle. Returns the spec, the
 * layout and the z offset that centres the whole temple (stairs included) in the rectangle.
 */
export function fitTemple(w: number, d: number, o: FitOptions): { spec: TempleSpec; layout: TempleLayout; offsetZ: number } {
  const front = o.front ?? (w < 8 ? 4 : w < 18 ? 6 : w < 32 ? 8 : 10);
  const plan = o.plan ?? 'prostyle';
  const minSides = plan === 'prostyle' ? 4 : plan === 'sine_postico' ? 5 : Math.max(5, Math.ceil(front * 1.4));
  let width = w * 0.97;
  let best: { spec: TempleSpec; layout: TempleLayout } | null = null;
  for (let iter = 0; iter < 14; iter++) {
    const base: TempleSpec = {
      order: o.order ?? 'corinthian', plan, front, width, sides: 5, material: o.material, podiumMaterial: o.podiumMaterial, cellaMaterial: o.cellaMaterial,
      roofMaterial: o.roofMaterial, detail: o.detail, pedimentRelief: o.pedimentRelief, podiumHeight: o.podiumHeight, stairs: o.stairs,
      fluted: o.detail === 'high',
    };
    const L0 = templeLayout(base);
    const stairLen = L0.stylobate.z0 - L0.podiumFront;
    const margin = L0.stylobate.z1 - L0.stylobate.z0 - L0.spanZ;
    let sides = Math.floor((d * 0.97 - stairLen - margin) / L0.axial) + 1;
    sides = Math.min(40, sides);
    if (sides >= minSides || iter === 13) {
      sides = Math.max(minSides, sides);
      const spec = { ...base, sides };
      let layout = templeLayout(spec);
      if (spec.detail === 'high' && layout.columns.length > (o.maxHighColumns ?? 6)) {
        spec.detail = 'low';
        spec.fluted = false;
        layout = templeLayout(spec);
      }
      best = { spec, layout };
      break;
    }
    width *= 0.9;
  }
  const L = best!.layout;
  return { spec: best!.spec, layout: L, offsetZ: -(L.podiumFront + L.stylobate.z1) / 2 };
}

/** Material scheme for a temple from its hints. */
export function templeMaterials(h: Hints): Pick<FitOptions, 'material' | 'podiumMaterial' | 'cellaMaterial' | 'roofMaterial'> {
  if (h.republican || h.material === 'tufa' || h.material === 'peperino') {
    // Republican: stucco over tufa, tufa/peperino podium, travertine trim.
    const col: MaterialId = h.material === 'travertine' ? 'travertine' : 'plaster_white';
    return { material: col, podiumMaterial: h.material === 'peperino' ? 'peperino' : 'tufa', cellaMaterial: 'plaster_white', roofMaterial: 'roof_tile' };
  }
  if (h.material === 'travertine') return { material: 'travertine', podiumMaterial: 'travertine', cellaMaterial: 'travertine', roofMaterial: h.gilded ? 'gilded_bronze' : 'roof_tile' };
  return { material: 'marble', podiumMaterial: 'marble', cellaMaterial: 'marble', roofMaterial: h.gilded ? 'gilded_bronze' : 'roof_tile' };
}

export interface TempleBuild {
  layout: TempleLayout;
  offsetZ: number;
  /** Front of the podium/stairs (local z). */
  front: number;
  spots: Spot[];
}

/** A carved dedication on the front frieze of a kit temple (architrave-face plane, centred). */
export function friezeDedication(d: Draw, L: TempleLayout, offsetZ: number, lines: string[], ground = '#ebe7df') {
  const ent = entablatureDims(L.order, L.H);
  const y = L.podiumHeight + L.H + ent.architrave + ent.frieze / 2;
  const w = Math.min((L.entablature.x1 - L.entablature.x0) * 0.74, 12);
  const h = Math.max(0.28, ent.frieze * 0.78);
  inscriptionPanel(d.b, { lines, width: w, height: h, style: 'carved', ground, sizes: lines.map(() => 1) }, mul(d.m, T(0, y, L.entablature.z0 + offsetZ - 0.04)), { depth: 0.04 });
}

/** A temple fitted to a local rectangle centred at (cx, cz) and facing −z of the frame `d`. */
export function fittedTemple(d: Draw, w: number, dd: number, o: FitOptions, id: string, withAltar = true): TempleBuild {
  const fit = fitTemple(w, dd, o);
  temple(d.b, fit.spec, mul(d.m, T(0, 0, fit.offsetZ)));
  const L = fit.layout;
  const front = fit.offsetZ + L.podiumFront;
  const spots: Spot[] = [];
  const P = L.podiumHeight;
  // Door of the cella and the top of the stairs.
  spots.push(spot(`${id}:door`, 'door', 0, P, fit.offsetZ + L.cella.z0 - 0.6, Math.PI));
  spots.push(spot(`${id}:steps`, 'sit', L.stairs.x0 + 0.6, L.stairs.rise * Math.floor(L.stairs.count / 3), front + L.stairs.run * Math.floor(L.stairs.count / 3) + 0.15, Math.PI));
  if (o.dedication?.length) friezeDedication(d, L, fit.offsetZ, o.dedication, o.material === 'plaster_white' || o.material === 'travertine' ? '#ece5d4' : '#ebe7df');
  if (withAltar && front + dd / 2 > 3.2) {
    const z = (front - dd / 2) / 2;
    altar(d, 0, 0, z, 1.6, 1.0, 1.0, o.material === 'plaster_white' ? 'travertine' : 'marble');
    spots.push(spot(`${id}:altar`, 'shrine', 0, 0, z - 1.6, 0));
    if (o.ctx) {
      // Embers on the altar (always burning: offerings go on at dawn).
      d.cyl('glow_fire', 0, 1.24, z, 0.32, 0.08, 7);
      d.cyl('glow_fire', 0, 1.42, z, 0.18, 0.3, 6, { rTop: 0.02 });
      lamp(o.ctx, d, 0, 1.6, z, { kind: 'fire', intensity: 20, distance: 12, flicker: 0.5, glow: 0.45 });
    }
  }
  if (o.statues && L.stairs.count > 0) {
    const sx = (L.stairs.x1 - L.stairs.x0) / 2 + 0.9;
    for (const s of [-1, 1]) statueOnPedestal(d, 'togate', s * Math.min(sx, w / 2 - 0.8), 0, front - 1.0, 0, 1.0, 'bronze', 'low', 1.2, 'marble');
  }
  return { layout: L, offsetZ: fit.offsetZ, front, spots };
}

function buildTemple(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const h = hintsOf(lm);
  const d = draw(ctx);
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const far = farDraw();
  const mats = templeMaterials(h);
  const round = lm.footprint.kind === 'circle' || lm.footprint.kind === 'ellipse' || (h.round && !h.has('precinct') && w < 30);
  const precinct = !round && ((w > 34 && dd > 34) || (h.has('precinct', 'porticoed', 'platform', 'terrace') && w > 24 && dd > 24));
  if (round) {
    const R = Math.min(w, dd) / 2;
    const steps = h.has('crepidoma', 'steps all round');
    // A ring of 16–20 fluted columns at high detail is ~150k triangles: keep the columns light.
    const res = tholos(d.b, { radius: R * 0.78, columns: R > 6 ? 20 : 16, order: h.order ?? 'corinthian', base: steps ? 'steps' : 'podium', material: mats.material, cellaMaterial: mats.cellaMaterial, podiumMaterial: mats.podiumMaterial, detail: 'low' }, d.m);
    spots.push(spot(`${lm.id}:door`, 'door', 0, res.baseHeight, -R * 0.5, Math.PI));
    far.cyl(mats.material ?? 'marble', 0, res.height * 0.4, 0, R * 0.8, res.height * 0.8, 10);
    far.cyl('roof_tile', 0, res.height * 0.9, 0, R * 0.85, res.height * 0.2, 10, { rTop: 0.2 });
    return finish(lm.id, d, spots, far);
  }
  if (precinct) return buildPrecinct(ctx, d, h, w, dd, mats, far);
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, mats.podiumMaterial ?? 'travertine');
  const t = fittedTemple(d, w, dd, {
    ...mats, order: h.order ?? (h.republican ? 'ionic' : 'corinthian'), plan: h.plan, front: h.front, detail, maxHighColumns: lm.priority >= 3 ? 4 : 6,
    dedication: [lm.latin.split('/')[0].trim()], statues: detail === 'high' && w > 10, ctx,
  }, lm.id);
  spots.push(...t.spots);
  // Far: podium + cella block + roof.
  const L = t.layout;
  const s = L.stylobate;
  far.span(mats.podiumMaterial ?? 'travertine', s.x0, 0, t.front, s.x1, L.podiumHeight, s.z1 + t.offsetZ);
  far.span(mats.material ?? 'marble', s.x0 + 0.2, L.podiumHeight, s.z0 + t.offsetZ, s.x1 - 0.2, L.podiumHeight + L.H + L.entablature.height, s.z1 + t.offsetZ - 0.2);
  tiledRoof(far, 'gable', 0, (s.z0 + s.z1) / 2 + t.offsetZ, s.x1 - s.x0, s.z1 - s.z0, L.podiumHeight + L.H + L.entablature.height, 'low', { axis: 'z', pitchDeg: 14 });
  return finish(lm.id, d, spots, far);
}

/** Temple in a porticoed precinct (Templum Gentis Flaviae, Divus Claudius, Quirinus' court…). */
function buildPrecinct(ctx: LandmarkContext, d: Draw, h: Hints, w: number, dd: number, mats: ReturnType<typeof templeMaterials>, far: Draw): LandmarkBuild {
  const { lm, detail } = ctx;
  const spots: Spot[] = [];
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.05, 'travertine');
  d.span('paving_travertine', -w / 2 + 0.5, 0.05, -dd / 2 + 0.5, w / 2 - 0.5, 0.12, dd / 2 - 0.5);
  const colH = Math.min(7, Math.max(4, heightG(ctx) * 0.3));
  const depth = Math.min(5, w * 0.08);
  // Colonnades on three sides, a gate in the front wall.
  const hw = w / 2 - depth - 0.6, hd = dd / 2 - depth - 0.6;
  liteColonnade(d, [V(-hw, 0.12, -hd), V(-hw, 0.12, hd), V(hw, 0.12, hd), V(hw, 0.12, -hd)], { columnHeight: colH, spacing: colH * 0.45, depth, material: 'marble', detail, order: 'corinthian' });
  const gate = Math.min(8, w * 0.2);
  const wallH = colH + 1.5;
  wallRun(d, -w / 2 + 0.3, -dd / 2 + 0.3, -gate / 2, -dd / 2 + 0.3, 0, wallH, 0.6, 'plaster_cream');
  wallRun(d, gate / 2, -dd / 2 + 0.3, w / 2 - 0.3, -dd / 2 + 0.3, 0, wallH, 0.6, 'plaster_cream');
  // Propylon: columns across the gate.
  for (const x of [-gate / 2, -gate / 6, gate / 6, gate / 2]) column(d.b, { order: 'corinthian', D: diameterForHeight('corinthian', wallH), height: wallH, material: 'marble', detail: 'low' }, mul(d.m, T(x, 0.12, -dd / 2 + 0.3)));
  d.span('marble', -gate / 2 - 0.6, wallH, -dd / 2, gate / 2 + 0.6, wallH + 0.9, -dd / 2 + 0.8);
  // Temple (or tholos) at the back of the court.
  const tw = Math.min(hw * 2 * 0.55, 30), td = Math.min(hd * 2 * 0.62, 50);
  const tz = hd - td / 2 - 1;
  if (h.round) {
    const res = tholos(d.b, { radius: Math.min(tw, td) * 0.38, columns: 20, order: h.order ?? 'corinthian', base: 'podium', material: mats.material, cellaMaterial: mats.cellaMaterial, podiumMaterial: mats.podiumMaterial, detail }, mul(d.m, T(0, 0.12, tz)));
    far.cyl('marble', 0, res.height / 2, tz, Math.min(tw, td) * 0.4, res.height, 10);
  } else {
    const t = fittedTemple(d.at(0, 0.12, tz), tw, td, { ...mats, order: h.order ?? 'corinthian', plan: h.plan ?? (h.dipteral ? 'peripteral' : undefined), front: h.front, detail }, lm.id, false);
    spots.push(...t.spots.map((s) => ({ ...s, position: s.position.clone().add(V(0, 0.12, tz)) })));
    far.span('marble', -tw / 2, 0, tz - td / 2, tw / 2, t.layout.totalHeight * 0.8, tz + td / 2);
  }
  altar(d, 0, 0.12, tz - td / 2 - 4, 2, 1.2, 1.1);
  spots.push(spot(`${lm.id}:altar`, 'shrine', 0, 0.12, tz - td / 2 - 6, 0), spot(`${lm.id}:gate`, 'door', 0, 0, -dd / 2 - 0.5, 0));
  far.span('plaster_cream', -w / 2, 0, -dd / 2, w / 2, wallH, -dd / 2 + 1);
  far.span('plaster_cream', -w / 2, 0, dd / 2 - 1, w / 2, wallH, dd / 2);
  far.span('plaster_cream', -w / 2, 0, -dd / 2, -w / 2 + 1, wallH, dd / 2);
  far.span('plaster_cream', w / 2 - 1, 0, -dd / 2, w / 2, wallH, dd / 2);
  return finish(lm.id, d, spots, far);
}

// ---------------------------------------------------------------- shrines

function buildShrine(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const h = hintsOf(lm);
  const d = draw(ctx);
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const g = (x: number, z: number) => ctx.groundAt(x, z);
  const open = (lm as { siting?: string }).siting === 'open' || lm.height < 0.6 || w * dd > 900;
  if (h.has('shaft', 'buried', 'underground')) {
    // Capped shaft in a fenced plot with boundary stones (Tarentum).
    const r = Math.min(w, dd) * 0.18;
    d.cyl('travertine', 0, 0.25, 0, r + 0.5, 0.5, 16, { collide: true });
    d.cyl('peperino', 0, 0.55, 0, r + 0.3, 0.1, 16);
    d.box('iron', 0, 0.62, 0, 0.12, 0.05, r * 1.6);
    railing(d, [[-w / 2 + 0.5, -dd / 2 + 0.5], [w / 2 - 0.5, -dd / 2 + 0.5], [w / 2 - 0.5, dd / 2 - 0.5], [-w / 2 + 0.5, dd / 2 - 0.5]], 0, 1.0, true, g);
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) d.box('travertine', (x * w) / 2.6, g((x * w) / 2.6, (z * dd) / 2.6) + 0.5, (z * dd) / 2.6, 0.4, 1.0, 0.3);
    spots.push(spot(`${lm.id}:shaft`, 'shrine', 0, 0, -r - 1.2, 0), spot(`${lm.id}:cache`, 'container', 0.4, 0.62, 0, 0));
    return finish(lm.id, d, spots);
  }
  if (h.has('cave', 'grotto')) {
    // A grotto in the slope: rock mass with a dark mouth and a small aedicula front.
    d.box('rock', 0, Math.max(3, heightG(ctx)) / 2, dd * 0.1, w, Math.max(3, heightG(ctx)), dd * 0.8, { collide: true });
    d.box('black', 0, 1.4, -dd * 0.3 - 0.02, 2.2, 2.8, 0.1);
    aedicula(d, 0, 0, -dd * 0.3 - 0.4, 3.2, 'travertine', detail);
    spots.push(spot(`${lm.id}:mouth`, 'shrine', 0, 0, -dd * 0.3 - 1.8, 0));
    return finish(lm.id, d, spots);
  }
  if (open) {
    // Sacred ground or grove: low boundary wall with a gate, an altar, a spring basin, an aedicula.
    const wallH = 0.9;
    const pts: [number, number][] = [[-w / 2, -dd / 2], [w / 2, -dd / 2], [w / 2, dd / 2], [-w / 2, dd / 2]];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[(i + 1) % 4];
      const segs = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 6));
      for (let k = 0; k < segs; k++) {
        if (i === 0 && k === Math.floor(segs / 2)) continue; // gate gap in the front
        const x0 = ax + ((bx - ax) * k) / segs, z0 = az + ((bz - az) * k) / segs;
        const x1 = ax + ((bx - ax) * (k + 1)) / segs, z1 = az + ((bz - az) * (k + 1)) / segs;
        const gy = Math.min(g(x0, z0), g(x1, z1));
        wallRun(d, x0, z0, x1, z1, gy - 0.3, gy + wallH, 0.45, 'tufa');
      }
    }
    const ay = g(0, 0);
    altar(d, 0, ay, 0, 1.3, 0.9, 0.95, 'travertine');
    spots.push(spot(`${lm.id}:altar`, 'shrine', 0, ay, -1.8, 0));
    if (h.has('spring', 'fountain', 'water')) {
      const z = dd * 0.22;
      pool(d, w * 0.18, g(w * 0.18, z), z, 3.2, 2.2, 'travertine');
      spots.push(spot(`${lm.id}:spring`, 'shrine', w * 0.18, g(w * 0.18, z), z - 1.6, 0));
    }
    if (h.has('grove', 'lucus', 'trees', 'poplar')) {
      const n = Math.min(14, Math.max(5, Math.round((w * dd) / 120)));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = Math.cos(a) * w * 0.33, z = Math.sin(a) * dd * 0.33;
        if (i % 3 === 0) tree(ctx, d, 'cypress', x, g(x, z), z, 9 + ctx.rng.range(0, 3));
        else tree(ctx, d, 'plane', x, g(x, z), z, 8 + ctx.rng.range(0, 3));
      }
    }
    aedicula(d, -w * 0.25, g(-w * 0.25, dd * 0.25), dd * 0.25, 2.6, 'plaster_white', detail);
    return finish(lm.id, d, spots);
  }
  if (h.has('altar') || lm.height <= 2.5) {
    // Altar on a stepped platform inside a railing (Arae Incendii Neroniani).
    plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02);
    const pw = w * 0.7, pd = dd * 0.6;
    d.span('travertine', -pw / 2 - 0.68, 0, -pd / 2 - 0.68, pw / 2 + 0.68, 0.2, pd / 2 + 0.68, { collide: true });
    d.span('travertine', -pw / 2 - 0.34, 0.2, -pd / 2 - 0.34, pw / 2 + 0.34, 0.4, pd / 2 + 0.34, { collide: true });
    altar(d, 0, 0.4, 0, Math.min(3, pw * 0.5), Math.min(2, pd * 0.4), Math.min(1.4, Math.max(0.9, heightG(ctx) - 0.8)), 'travertine');
    railing(d, [[-w / 2 + 0.3, -dd / 2 + 0.3], [w / 2 - 0.3, -dd / 2 + 0.3], [w / 2 - 0.3, dd / 2 - 0.3], [-w / 2 + 0.3, dd / 2 - 0.3]], 0, 1.0, true);
    spots.push(spot(`${lm.id}:altar`, 'shrine', 0, 0, -dd / 2 - 0.6, 0));
    return finish(lm.id, d, spots);
  }
  // A small temple-front shrine (aedicula / sacellum).
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02);
  const t = fittedTemple(d, w, dd, { order: h.order ?? 'ionic', front: 4, plan: 'prostyle', ...templeMaterials(h), detail }, lm.id, false);
  spots.push(...t.spots);
  return finish(lm.id, d, spots);
}

/** A small aedicula: two columns and a pediment over a niche, on a base. */
export function aedicula(d: Draw, x: number, y: number, z: number, h: number, mat: MaterialId, detail: Detail) {
  const f = d.at(x, y, z);
  const w = h * 0.7;
  f.box(mat, 0, 0.3, 0.15, w + 0.3, 0.6, 1.0, { collide: true });
  f.box(mat, 0, h / 2 + 0.3, 0.55, w, h, 0.25);
  f.box('black', 0, 0.6 + h * 0.3, 0.42, w * 0.45, h * 0.55, 0.02);
  const D = h * 0.09;
  for (const sx of [-1, 1]) column(f.b, { order: 'ionic', D, height: h * 0.7, material: mat, detail: 'low', collide: false }, mul(f.m, T(sx * (w / 2 - D), 0.6, 0)));
  f.box(mat, 0, 0.6 + h * 0.7 + 0.12, 0.2, w + 0.1, 0.24, 0.9);
  const tri = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.05, 0), new THREE.Vector2(w / 2 + 0.05, 0), new THREE.Vector2(0, w * 0.22)]);
  const g = new THREE.ExtrudeGeometry(tri, { depth: 0.9, bevelEnabled: false });
  f.geo(g, mat, 0, 0.6 + h * 0.7 + 0.24, -0.25);
  if (detail === 'high') statueOnPedestal(f, 'togate', 0, 0.6, 0.42, 0, 0.45, 'bronze', 'low', 0.1);
}

// ---------------------------------------------------------------- monuments

function buildMonument(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const h = hintsOf(lm);
  const d = draw(ctx);
  const { w, d: dd } = dims(ctx);
  const H = heightG(ctx, 1);
  const spots: Spot[] = [];
  const far = farDraw();
  if (h.has('obelisk', 'sundial', 'gnomon')) {
    const shaft = H / 1.27;
    plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02);
    obelisk(d.b, { height: shaft, hieroglyphs: !h.has('uninscribed', 'without hieroglyphs'), pedestal: H - shaft - 0.5, detail }, d.m);
    if (h.has('ball', 'sphere', 'globe')) d.ellipsoid('gilded_bronze', 0, H + 0.2, 0, shaft * 0.03, shaft * 0.03, shaft * 0.03);
    far.box('travertine', 0, (H - shaft) / 2, 0, shaft / 6, H - shaft, shaft / 6);
    far.cyl('plaster_ochre', 0, H - shaft / 2, 0, shaft / 18, shaft, 4, { rTop: shaft / 28 });
    spots.push(spot(`${lm.id}:base`, 'inscription', 0, 0, -shaft / 9 - 1.4, 0));
    return finish(lm.id, d, spots, far);
  }
  if (h.has('enclosure', 'crematorium', 'ustrinum', 'railing')) {
    // Walled marble enclosure, a ring of iron railing, poplars and a pyre platform.
    plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02);
    const wh = Math.max(1.8, H * 0.8);
    const gate = 3;
    wallRun(d, -w / 2, -dd / 2, -gate / 2, -dd / 2, 0, wh, 0.5, 'marble');
    wallRun(d, gate / 2, -dd / 2, w / 2, -dd / 2, 0, wh, 0.5, 'marble');
    wallRun(d, w / 2, -dd / 2, w / 2, dd / 2, 0, wh, 0.5, 'marble');
    wallRun(d, w / 2, dd / 2, -w / 2, dd / 2, 0, wh, 0.5, 'marble');
    wallRun(d, -w / 2, dd / 2, -w / 2, -dd / 2, 0, wh, 0.5, 'marble');
    const r = Math.min(w, dd) * 0.33;
    const ring: [number, number][] = Array.from({ length: 20 }, (_, i) => [Math.cos((i / 20) * Math.PI * 2) * r, Math.sin((i / 20) * Math.PI * 2) * r] as [number, number]).filter((_, i) => i !== 15);
    railing(d, ring, 0, 1.6, false);
    d.span('travertine', -2, 0, -1.5, 2, 1.0, 1.5, { collide: true });
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) / 8) * Math.PI * 2;
      tree(ctx, d, 'cypress', Math.cos(a) * (r + 2.2), 0, Math.sin(a) * (r + 2.2), 10); // black poplars: tall and narrow
    }
    spots.push(spot(`${lm.id}:pyre`, 'shrine', 0, 0, -2.6, 0), spot(`${lm.id}:gate`, 'door', 0, 0, -dd / 2 - 0.5, 0));
    far.span('marble', -w / 2, 0, -dd / 2, w / 2, wh, dd / 2);
    return finish(lm.id, d, spots, far);
  }
  if (h.has('altar', 'ara ')) {
    plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02);
    altarEnclosure(d, w, dd, H, detail, lm.id, spots);
    return finish(lm.id, d, spots);
  }
  if (h.has('equestrian', 'horse')) {
    plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02);
    const ped = Math.min(H * 0.45, 5);
    const sc = Math.max(1, (H - ped) / 3.3);
    statueOnPedestal(d, 'equestrian', 0, 0, 0, 0, sc, 'gilded_bronze', detail, ped, 'marble');
    spots.push(spot(`${lm.id}:base`, 'inscription', 0, 0, -dd / 2 - 0.8, 0));
    return finish(lm.id, d, spots);
  }
  if (h.has('site', 'ruin', 'removed', 'destroyed') || lm.height < 1) {
    // An empty, stripped pedestal or a paved patch.
    d.span('travertine', -w / 2, -0.2, -dd / 2, w / 2, Math.max(0.3, H), dd / 2, { collide: true });
    d.span('concrete', -w / 2 + 0.4, Math.max(0.3, H), -dd / 2 + 0.4, w / 2 - 0.4, Math.max(0.3, H) + 0.05, dd / 2 - 0.4);
    spots.push(spot(`${lm.id}:base`, 'inscription', 0, 0, -dd / 2 - 0.8, 0));
    return finish(lm.id, d, spots);
  }
  if (h.has('milestone', 'miliarium', 'golden')) {
    d.cyl('gilded_bronze', 0, H / 2, 0, Math.min(w, dd) * 0.3, H, 16, { collide: true });
    d.box('marble', 0, 0.2, 0, w, 0.4, dd, { collide: true });
    spots.push(spot(`${lm.id}:inscription`, 'inscription', 0, 0, -dd / 2 - 0.6, 0));
    return finish(lm.id, d, spots);
  }
  // Default: a statue on a tall inscribed pedestal (colossal if the height says so).
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02);
  const ped = Math.min(Math.max(1.4, H * 0.3), 8);
  const sc = Math.max(1, (H - ped) / 1.85);
  const kind = h.has('emperor', 'armour', 'armor', 'sol', 'colossus') ? 'emperor' : h.has('seated', 'enthroned') ? 'seated' : 'togate';
  statueOnPedestal(d, kind, 0, 0, 0, 0, sc, h.has('gilded') ? 'gilded_bronze' : 'bronze', detail, ped);
  inscription(d, [lm.latin.split('/')[0].trim()], 0, ped * 0.55, -0.45 * sc - 0.01, Math.min(2.4, 0.8 * sc), Math.min(0.9, ped * 0.3));
  spots.push(spot(`${lm.id}:base`, 'inscription', 0, 0, -dd / 2 - 0.8, 0));
  if (H > 12) {
    far.box('marble', 0, ped / 2, 0, 1.2 * sc, ped, 1.2 * sc);
    far.cyl('bronze', 0, ped + (H - ped) / 2, 0, 0.3 * sc, H - ped, 6);
  }
  return finish(lm.id, d, spots, H > 12 ? far : undefined);
}

/** Altar enclosure (Ara Pacis type): marble screen walls with doors front and back, the altar inside on steps. */
export function altarEnclosure(d: Draw, w: number, dd: number, H: number, detail: Detail, id: string, spots: Spot[], opts: { reliefs?: THREE.Material; podium?: number } = {}) {
  const P = opts.podium ?? Math.min(1.2, H * 0.2);
  const wh = H - P;
  const t = 0.35;
  // Podium with a front flight.
  const stairW = Math.min(3.6, w * 0.4);
  d.span('marble', -w / 2, 0, -dd / 2 + 2.2, w / 2, P, dd / 2, { collide: true });
  flight(d, 0, -dd / 2 + 2.2 - Math.ceil(P / 0.2) * 0.34, stairW, 0, P, 'marble');
  const y0 = P;
  const z0 = -dd / 2 + 2.2;
  const door = Math.min(3, w * 0.3);
  const relief: MaterialId = 'marble';
  // Front and back walls with door openings; flanks solid.
  for (const z of [z0 + t / 2, dd / 2 - t / 2]) {
    wallRun(d, -w / 2, z, -door / 2, z, y0, y0 + wh, t, relief);
    wallRun(d, door / 2, z, w / 2, z, y0, y0 + wh, t, relief);
    d.span(relief, -door / 2, y0 + wh * 0.82, z - t / 2, door / 2, y0 + wh, z + t / 2);
  }
  for (const x of [-w / 2 + t / 2, w / 2 - t / 2]) wallRun(d, x, z0, x, dd / 2, y0, y0 + wh, t, relief);
  // Relief bands: acanthus below, procession above (the frieze material if given).
  const band = (x0: number, x1: number, z: number, faceZ: number, rot: number) => {
    if (opts.reliefs) {
      const g = new THREE.PlaneGeometry(x1 - x0, wh * 0.38);
      g.rotateY(rot);
      g.translate((x0 + x1) / 2, y0 + wh * 0.7, z + faceZ * 0.03);
      d.b.add(g, opts.reliefs, d.m, { uv: 'keep' });
    } else {
      d.span('marble_veined', x0, y0 + wh * 0.5, z + faceZ * 0.02, x1, y0 + wh * 0.88, z + faceZ * 0.08);
    }
    d.span('marble', x0, y0 + wh * 0.44, z + faceZ * 0.02, x1, y0 + wh * 0.5, z + faceZ * 0.12);
  };
  band(-w / 2, w / 2, z0, -1, 0);
  // Altar on steps inside.
  const iz = (z0 + dd / 2) / 2;
  d.span('marble', -w / 2 + 1.2, y0, iz - 1.4, w / 2 - 1.2, y0 + 0.4, iz + 1.6, { collide: true });
  altar(d, 0, y0 + 0.4, iz + 0.2, Math.min(3.4, w * 0.4), 1.4, 1.0);
  spots.push(spot(`${id}:altar`, 'shrine', 0, y0, iz - 1.8, 0), spot(`${id}:reliefs`, 'inscription', 0, 0, -dd / 2 - 0.5, 0));
  if (detail === 'high') {
    // Corner pilasters.
    for (const x of [-w / 2, w / 2]) for (const z of [z0, dd / 2]) d.box('marble', x, y0 + wh / 2, z, 0.5, wh, 0.5);
  }
}

// ---------------------------------------------------------------- honorific columns

function buildColumn(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const h = hintsOf(lm);
  const d = draw(ctx);
  const { w, d: dd } = dims(ctx);
  const H = heightG(ctx, 2);
  const spots: Spot[] = [];
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02);
  if (H > 12) {
    honorificColumn(d.b, { height: H * 0.76, turns: h.has('frieze', 'helical', 'spiral') ? 23 : 0, statue: !h.has('no statue'), inscription: [lm.latin.split('/')[0].trim()], detail }, d.m);
  } else {
    const ped = Math.min(1.2, H * 0.25);
    d.box('travertine', 0, ped / 2, 0, Math.min(w, dd) * 0.8, ped, Math.min(w, dd) * 0.8, { collide: true });
    const order: Order = h.order ?? 'tuscan';
    column(d.b, { order, D: diameterForHeight(order, H - ped), height: H - ped, material: h.material ?? 'peperino', detail }, mul(d.m, T(0, ped, 0)));
  }
  spots.push(spot(`${lm.id}:base`, 'inscription', 0, 0, -dd / 2 - 0.6, 0));
  return finish(lm.id, d, spots);
}

// ---------------------------------------------------------------- fountains

function buildFountain(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const h = hintsOf(lm);
  const d = draw(ctx);
  const { w, d: dd } = dims(ctx);
  const H = heightG(ctx, 1.5);
  const spots: Spot[] = [];
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02);
  if (h.has('cone', 'conical', 'meta')) {
    const r = Math.min(w, dd) / 2;
    roundBasin(d, 0, 0, 0, r, 'travertine', 0.7, detail);
    const prof = new ProfileBuilder(0, 0).to(r * 0.3, 0).to(r * 0.3, H * 0.25).to(r * 0.08, H).to(0, H).build();
    d.b.add(lathe(prof, { segments: detail === 'high' ? 20 : 10 }), 'brick', d.m);
    d.solidCyl(0, H / 2, 0, r * 0.3, H);
    spots.push(spot(`${lm.id}:basin`, 'shrine', 0, 0, -r - 0.6, 0));
    return finish(lm.id, d, spots);
  }
  if (h.has('nymphaeum', 'exedra')) {
    const R = Math.min(w / 2, dd) * 0.9;
    const segs = detail === 'high' ? 16 : 8;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI, a1 = ((i + 1) / segs) * Math.PI;
      wallRun(d, Math.cos(a0) * R, dd / 2 - Math.sin(a0) * R * 0.9, Math.cos(a1) * R, dd / 2 - Math.sin(a1) * R * 0.9, 0, H, 0.8, 'brick');
    }
    pool(d, 0, 0, dd / 2 - R * 0.45, R * 1.6, R * 0.7, 'marble');
    spots.push(spot(`${lm.id}:basin`, 'shrine', 0, 0, -dd / 2 - 0.5, 0));
    return finish(lm.id, d, spots);
  }
  // Basin fountain: a marble pool with a central pedestal carrying a statue group (Orpheus) or a spout.
  pool(d, 0, 0, 0, w * 0.9, dd * 0.9, 'marble', 0.55, 0.4);
  const ped = Math.min(1.8, H * 0.35);
  if (h.has('statue', 'orpheus', 'beasts', 'figure')) {
    statueOnPedestal(d, 'seated', 0, 0, 0, 0, Math.max(1, (H - ped) / 1.6), 'bronze', detail, ped);
    if (h.has('beasts', 'animals', 'eagle')) {
      for (const [x, z] of [[-1.4, -0.6], [1.3, -0.8], [0.9, 1.1], [-1.1, 1.0]]) d.ellipsoid('bronze', x, 0.75, z, 0.5, 0.35, 0.28, { ry: x });
    }
  } else {
    d.box('marble', 0, ped / 2, 0, 0.8, ped, 0.8, { collide: true });
    d.cyl('bronze', 0, ped + 0.25, -0.3, 0.12, 0.5, 6, { rx: 1.2 });
  }
  spots.push(spot(`${lm.id}:basin`, 'shrine', 0, 0, -dd / 2 - 0.6, 0));
  return finish(lm.id, d, spots);
}

// ---------------------------------------------------------------- tombs

function buildTomb(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const h = hintsOf(lm);
  const d = draw(ctx);
  const { w, d: dd } = dims(ctx);
  const H = heightG(ctx, 2);
  const spots: Spot[] = [];
  const far = farDraw();
  const siting = (lm as { siting?: string }).siting;
  const name = lm.latin.split('/')[0].trim();
  if (h.has('pyramid')) {
    const base = plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.3, 'travertine');
    pyramidTomb(d, Math.min(w, dd) * 0.96, H, 'marble', 0.3);
    inscription(d, [name.toUpperCase()], 0, H * 0.55, -Math.min(w, dd) * 0.96 * 0.5 * 0.45 - 0.2, Math.min(w, dd) * 0.3, Math.min(w, dd) * 0.08, 0);
    spots.push(spot(`${lm.id}:inscription`, 'inscription', 0, Math.max(0, base), -dd / 2 - 1.5, 0));
    pyramidTomb(far, Math.min(w, dd), H, 'marble', 0);
    return finish(lm.id, d, spots, far);
  }
  // (notes often mention a neighbouring drum tomb, so the more specific kinds win)
  if (lm.footprint.kind === 'circle' || (h.has('drum', 'round', 'tumulus') && !h.has('rock-cut', 'rock cut', 'columbarium', 'cylinders', 'kneading'))) {
    const R = Math.min(w, dd) / 2;
    drumTomb(d, R, H, detail, ctx);
    spots.push(spot(`${lm.id}:door`, 'door', 0, 0, -R - 0.6, 0));
    far.cyl('travertine', 0, H * 0.3, 0, R, H * 0.6, 12);
    return finish(lm.id, d, spots, far);
  }
  if (h.has('cemetery', 'necropolis', 'graves') || (siting === 'open' && w * dd > 2000)) {
    necropolis(ctx, d, w, dd, detail, spots);
    return finish(lm.id, d, spots);
  }
  if (h.has('columbarium') || siting === 'underground') {
    // A small brick entrance house with a stair going down into the dark.
    const hw = Math.min(w, 6) / 2, hd = Math.min(dd, 5) / 2;
    plinth(d, ctx, -hw, -hd, hw, hd, 0.02, 'brick');
    for (const [ax, az, bx, bz] of [[-hw, hd, hw, hd], [-hw, -hd, -hw, hd], [hw, -hd, hw, hd]] as const) wallRun(d, ax, az, bx, bz, 0, 2.8, 0.4, 'brick');
    wallRun(d, -hw, -hd, -1.0, -hd, 0, 2.8, 0.4, 'brick');
    wallRun(d, 1.0, -hd, hw, -hd, 0, 2.8, 0.4, 'brick');
    d.span('brick', -1, 2.3, -hd - 0.2, 1, 2.8, -hd + 0.2);
    tiledRoof(d, 'gable', 0, 0, hw * 2, hd * 2, 2.8, detail, { axis: 'z' });
    d.span('black', -0.8, -0.05, -hd + 0.6, 0.8, 0.02, hd - 0.6);
    inscription(d, [name.toUpperCase()], 0, 2.55, -hd - 0.22, 1.6, 0.4);
    spots.push(spot(`${lm.id}:door`, 'door', 0, 0, -hd - 0.6, 0), spot(`${lm.id}:inscription`, 'inscription', 0, 0, -hd - 1.2, 0));
    return finish(lm.id, d, spots);
  }
  if (h.has('rock-cut', 'rock cut')) {
    // Painted facade cut into the tufa slope: half-columns, niches with statues, a dark doorway.
    const fh = Math.min(H, 7);
    d.span('tufa', -w / 2, -1, -dd / 2 + 1.5, w / 2, fh + 3, dd / 2, { collide: true });
    d.span('plaster_red', -w / 2 + 0.6, 0, -dd / 2 + 1.45, w / 2 - 0.6, fh * 0.45, -dd / 2 + 1.5);
    d.span('peperino', -w / 2 + 0.4, fh * 0.45, -dd / 2 + 1.2, w / 2 - 0.4, fh * 0.52, -dd / 2 + 1.5);
    const n = Math.max(3, Math.round(w / 3.5));
    for (let i = 0; i <= n; i++) {
      const x = -w / 2 + 1 + ((w - 2) * i) / n;
      column(d.b, { order: 'tuscan', D: 0.45, height: fh * 0.45, material: 'peperino', kind: 'engaged', detail: 'low' }, mul(d.m, T(x, fh * 0.52, -dd / 2 + 1.5)));
    }
    d.span('black', -0.7, 0, -dd / 2 + 1.44, 0.7, 2.3, -dd / 2 + 1.46);
    for (const x of [-w / 4, w / 4]) statueOnPedestal(d, 'togate', x, fh * 0.52, -dd / 2 + 1.0, 0, 0.9, 'peperino', detail, 0.2, 'peperino');
    spots.push(spot(`${lm.id}:door`, 'door', 0, 0, -dd / 2 + 0.6, 0));
    return finish(lm.id, d, spots);
  }
  if (h.has('cylinders', 'kneading', 'baker')) {
    // Eurysaces: a trapezoidal travertine block with rows of round openings and a frieze.
    plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02);
    d.span('travertine', -w / 2, 0, -dd / 2, w / 2, H * 0.3, dd / 2, { collide: true });
    for (let row = 0; row < 2; row++) {
      const y = H * 0.3 + row * H * 0.25;
      d.span('travertine', -w / 2 + 0.1, y, -dd / 2 + 0.1, w / 2 - 0.1, y + H * 0.22, dd / 2 - 0.1, { collide: row === 0 });
      const n = Math.max(3, Math.round(w / 1.4));
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + ((i + 0.5) * w) / n;
        d.cyl('black', x, y + H * 0.11, -dd / 2 + 0.05, 0.38, 0.12, 10, { rx: Math.PI / 2 });
      }
    }
    d.span('travertine', -w / 2 - 0.1, H * 0.8, -dd / 2 - 0.1, w / 2 + 0.1, H * 0.95, dd / 2 + 0.1);
    d.span('marble_veined', -w / 2 + 0.05, H * 0.82, -dd / 2 - 0.12, w / 2 - 0.05, H * 0.93, -dd / 2 - 0.05);
    inscription(d, ['EST HOC MONIMENTVM MARCEI VERGILEI EVRYSACIS PISTORIS REDEMPTORIS APPARET'], 0, H * 0.27, -dd / 2 - 0.04, w * 0.9, 0.35);
    spots.push(spot(`${lm.id}:inscription`, 'inscription', 0, 0, -dd / 2 - 1.0, 0));
    return finish(lm.id, d, spots);
  }
  // Altar / house tomb: a travertine block on a podium, pilasters, inscription, crowning altar.
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'travertine');
  const P = Math.min(1.4, H * 0.18);
  d.span('travertine', -w / 2, 0, -dd / 2, w / 2, P, dd / 2, { collide: true });
  d.span(h.material === 'tufa' ? 'tufa' : 'travertine', -w / 2 + 0.3, P, -dd / 2 + 0.3, w / 2 - 0.3, H * 0.82, dd / 2 - 0.3, { collide: true });
  for (const x of [-w / 2 + 0.45, w / 2 - 0.45]) d.box('travertine', x, (P + H * 0.82) / 2, -dd / 2 + 0.22, 0.5, H * 0.82 - P, 0.2);
  d.span('travertine', -w / 2 + 0.1, H * 0.82, -dd / 2 + 0.1, w / 2 - 0.1, H * 0.9, dd / 2 - 0.1);
  if (H > 4) altar(d, 0, H * 0.9, 0, Math.min(w, dd) * 0.45, Math.min(w, dd) * 0.3, H * 0.08, 'travertine');
  inscription(d, [name.toUpperCase()], 0, P + (H * 0.82 - P) * 0.6, -dd / 2 + 0.28, Math.min(w - 1.2, 4), Math.min(1.0, (H * 0.82 - P) * 0.3));
  spots.push(spot(`${lm.id}:inscription`, 'inscription', 0, 0, -dd / 2 - 1.0, 0));
  return finish(lm.id, d, spots);
}

/** A pyramid with a marble skin on a low plinth (Cestius, the Meta Romuli). */
export function pyramidTomb(d: Draw, side: number, H: number, mat: MaterialId, y0 = 0) {
  const s = side / 2;
  const top = V(0, y0 + H, 0);
  const c = [V(-s, y0, -s), V(s, y0, -s), V(s, y0, s), V(-s, y0, s)];
  for (let i = 0; i < 4; i++) d.poly(mat, [c[i], c[(i + 1) % 4], top].reverse());
  // Colliders: stacked boxes approximating the slope.
  const n = 6;
  for (let k = 0; k < n; k++) {
    const f = 1 - (k + 0.5) / n;
    d.solid(-s * f, y0 + (H * k) / n, -s * f, s * f, y0 + (H * (k + 1)) / n, s * f);
  }
}

/** Drum tomb: travertine-faced cylinder with a cornice and a conical earth mound with cypresses. */
export function drumTomb(d: Draw, R: number, H: number, detail: Detail, ctx: LandmarkContext) {
  const drumH = Math.min(H * 0.45, 12);
  const seg = detail === 'high' ? 32 : 16;
  d.cyl('travertine', 0, drumH / 2, 0, R, drumH, seg, { collide: true });
  d.cyl('travertine', 0, drumH + 0.25, 0, R + 0.35, 0.5, seg);
  const prof = new ProfileBuilder(R - 0.2, drumH + 0.5).to(R * 0.25, H * 0.85).to(0, H * 0.88).build();
  d.b.add(lathe(prof, { segments: seg }), 'grass', d.m);
  d.cyl('travertine', 0, H * 0.88, 0, R * 0.2, H * 0.12, 12);
  const n = detail === 'high' ? 10 : 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = R * 0.62;
    const y = drumH + 0.5 + (H * 0.85 - drumH - 0.5) * (1 - (r - R * 0.25) / (R - 0.2 - R * 0.25));
    tree(ctx, d, 'cypress', Math.cos(a) * r, y - 0.3, Math.sin(a) * r, Math.max(4, R * 0.4));
  }
  d.span('black', -0.9, 0, -R - 0.05, 0.9, 2.6, -R + 0.3);
  d.span('travertine', -1.3, 2.6, -R - 0.2, 1.3, 3.0, -R + 0.3);
}

/** Roadside cemetery: rows of small altar tombs, stelae and a few house tombs. */
function necropolis(ctx: LandmarkContext, d: Draw, w: number, dd: number, detail: Detail, spots: Spot[]) {
  const rng = ctx.rng.fork('tombs');
  const n = Math.min(detail === 'high' ? 70 : 30, Math.round((w * dd) / 90));
  for (let i = 0; i < n; i++) {
    const x = rng.range(-w / 2 + 2, w / 2 - 2);
    const z = rng.range(-dd / 2 + 2, dd / 2 - 2);
    const y = ctx.groundAt(x, z);
    const r = rng.next();
    const rot = rng.range(-0.15, 0.15);
    if (r < 0.45) {
      d.at(x, y, z, rot).box('travertine', 0, 0.45, 0, 0.6, 1.0, 0.18, { collide: true }); // stele
    } else if (r < 0.8) {
      const s = rng.range(1.0, 1.8);
      altar(d, x, y - 0.1, z, s, s * 0.7, s * 0.8, rng.chance(0.5) ? 'travertine' : 'marble', rot);
    } else {
      const f = d.at(x, y, z, rot);
      const s = rng.range(3, 5);
      f.box('brick', 0, 1.4, 0, s, 3.0, s * 0.8, { collide: true });
      f.box('black', 0, 0.9, -s * 0.4 - 0.01, 0.9, 1.8, 0.04);
      tiledRoof(f, 'gable', 0, 0, s, s * 0.8, 2.9, 'low', { axis: 'z' });
    }
    if (i % 12 === 0) spots.push(spot(`${ctx.lm.id}:tomb${i}`, 'inscription', x, y, z - 1.2, 0));
  }
}

// ---------------------------------------------------------------- arches and gates

function buildArch(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const h = hintsOf(lm);
  const d = draw(ctx);
  const { w, d: dd } = dims(ctx);
  const H = heightG(ctx, 4);
  const spots: Spot[] = [];
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02);
  const latin = lm.latin.split('/')[0].trim();
  if (h.has('aqueduct', 'channel', 'carrying', 'specus')) {
    // Aqueduct arch dressed as a monument: an arch with an attic hiding the channel.
    const span = Math.max(3.2, w * 0.42);
    const r = plainArch(d.b, { span, height: Math.min(H * 0.7, span * 1.6), pier: (w - span) / 2, depth: dd, material: 'travertine', detail }, d.m);
    const atticH = Math.max(1.5, H - r.height);
    d.span('travertine', -w / 2, r.height, -dd / 2, w / 2, r.height + atticH, dd / 2);
    inscription(d, ['SENATVS POPVLVSQVE ROMANVS', latin.toUpperCase()], 0, r.height + atticH * 0.5, -dd / 2 - 0.02, w * 0.8, atticH * 0.7);
    d.span('lead', -w / 2 - 1, r.height + atticH, -0.6, w / 2 + 1, r.height + atticH + 0.4, 0.6);
    spots.push(spot(`${lm.id}:inscription`, 'inscription', 0, 0, -dd / 2 - 2, 0));
    return finish(lm.id, d, spots);
  }
  const triple = h.has('triple', 'three') || w / dd > 3.2 && w * ctx.S > 0 && w > 14;
  if (h.has('plain', 'simple', 'travertine arch', 'consular') || H < 7 || w < 6) {
    const span = Math.max(2.6, w * 0.45);
    plainArch(d.b, { span, height: Math.min(H * 0.75, span * 1.7), pier: Math.max(0.6, (w - span) / 2), depth: Math.max(1, dd), material: h.material ?? 'travertine', detail }, d.m);
    spots.push(spot(`${lm.id}:passage`, 'vista', 0, 0, -dd / 2 - 1.5, 0));
    return finish(lm.id, d, spots);
  }
  const W = triple ? w / 3.96 : w / 2.52;
  triumphalArch(d.b, { bays: triple ? 3 : 1, span: Math.max(2.6, W), material: 'marble', detail, inscription: ['Senatus Populusque Romanus', latin], quadriga: H > 10 }, d.m);
  spots.push(spot(`${lm.id}:inscription`, 'inscription', 0, 0, -Math.max(dd, W) - 2, 0));
  return finish(lm.id, d, spots);
}

export const builders: LandmarkBuilder[] = [
  { handles: ['category:temple'], build: buildTemple },
  { handles: ['category:shrine'], build: buildShrine },
  { handles: ['category:monument'], build: buildMonument },
  { handles: ['category:column'], build: buildColumn },
  { handles: ['category:fountain'], build: buildFountain },
  { handles: ['category:tomb'], build: buildTomb },
  { handles: ['category:arch'], build: buildArch },
];

export { TRS };
