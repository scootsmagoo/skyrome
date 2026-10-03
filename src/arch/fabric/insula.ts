/**
 * Insula: the multi-storey brick-faced or plastered apartment block of imperial Rome.
 *
 * Ground floor: a row of tabernae (wide lintelled or arched openings, plank shutters or open shops
 * with goods), stair doors up to the apartments, mezzanine windows over the shops. Upper floors:
 * regular small windows (some shuttered), wooden balconies (maeniana) on joists, string courses, a
 * cornice and a low tile roof. Options: an internal light-well courtyard, and a Neronian street
 * portico (arcade with a terrace on top, as required after the fire of AD 64).
 *
 * Local frame: footprint `width` (x) × `depth` (z) centred on the origin, street front facing −z,
 * floor level y = 0 (the filler puts it at the highest sidewalk point along the front).
 */
import { Rng } from '../../core/Rng';
import { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { placeProp, stripedAwning } from '../props';
import { Draw } from './draw';
import { roof } from './roof';
import { pickShopKind, shopFrontage, shopInterior, type ShopKind } from './shops';
import { flatGround, type BuildingOutput, type LocalGround, type Spot, type SpotKind } from './types';
import { archBand, band, doorFrame, doorLeaves, plankShutters, wall, windowDetails, type Opening } from './wall';
import * as THREE from 'three';

/** Trajan's height limit for private buildings: 60 Roman feet ≈ 17.7 m. */
export const MAX_BUILDING_HEIGHT = 17.7;

export type BayKind = ShopKind | 'closed' | 'stair' | 'entrance';

export interface InsulaSpec {
  width: number;
  depth: number;
  /** 3–6 (clamped to the height limit). */
  storeys?: number;
  seed?: number;
  /** 0 poor … 1 rich: finishes, shop mix, balconies. */
  wealth?: number;
  finish?: 'brick' | 'plaster';
  plaster?: MaterialId;
  courtyard?: boolean;
  balcony?: 'none' | 'partial' | 'full';
  /** Neronian arcade along the street front. */
  portico?: boolean;
  roof?: 'hip' | 'gable';
  /** Explicit ground-floor bays (left → right seen from the street); otherwise generated. */
  bays?: BayKind[];
  /** Probability that a shop is open (default 0.6). */
  openShopChance?: number;
  /** Terrain relative to the floor level (local coords). */
  groundAt?: LocalGround;
  /** Sides with windows (false = party wall against a neighbour). Default true. */
  sides?: { left?: boolean; right?: boolean; back?: boolean };
  maxHeight?: number;
  /** Shop awnings, street props (default true). */
  streetDressing?: boolean;
}

interface Bay {
  x0: number;
  x1: number;
  kind: BayKind;
  /** Floor level of this bay (≤ 0 on slopes). */
  yb: number;
  open: boolean;
  o: Opening | null;
}

const T = 0.6; // wall thickness

export function insula(spec: InsulaSpec): BuildingOutput {
  const rng = new Rng(spec.seed ?? 1);
  const b = new MeshBuilder();
  const d = new Draw(b);
  const spots: Spot[] = [];
  const W = spec.width, D = spec.depth;
  const wealth = spec.wealth ?? 0.4;
  const ground = spec.groundAt ?? flatGround;
  const sides = { left: spec.sides?.left ?? true, right: spec.sides?.right ?? true, back: spec.sides?.back ?? true };
  const dress = spec.streetDressing ?? true;

  // ---- heights (respecting the 60-foot limit)
  const G = rng.range(4.1, 4.5);
  const storeyH = (k: number) => 3.05 - 0.08 * Math.max(0, k - 2);
  let n = spec.storeys ?? rng.weighted([[3, 0.5 + wealth * 2], [4, 2], [5, 2.2 - wealth * 1.5], [6, Math.max(0.1, 1.2 - wealth * 1.2)]]);
  n = Math.max(2, Math.min(6, Math.round(n)));
  const floorY = (k: number) => { let y = G; for (let j = 1; j < k; j++) y += storeyH(j); return y; }; // k ≥ 1: floor of upper storey k
  const maxH = spec.maxHeight ?? MAX_BUILDING_HEIGHT;
  while (n > 2 && floorY(n) + 0.3 > maxH) n--;
  const eave = floorY(n);

  // ---- materials
  const finish = spec.finish ?? (rng.chance(0.6 - 0.25 * wealth) ? 'brick' : 'plaster');
  const wallMat: MaterialId = finish === 'brick' ? 'brick' : spec.plaster ?? rng.weighted<MaterialId>([['plaster_cream', 3], ['plaster_ochre', 2], ['plaster_white', 1.5 + wealth], ['plaster_red', 0.4]]);
  const trim: MaterialId = finish === 'brick' ? 'travertine' : wallMat === 'plaster_white' ? 'plaster_ochre' : 'plaster_white';
  const courseMat: MaterialId = finish === 'brick' ? (rng.chance(0.5) ? 'brick' : 'travertine') : trim;
  const dadoMat: MaterialId = wallMat === 'plaster_red' ? 'plaster_dark' : rng.chance(0.6) ? 'plaster_red' : 'plaster_dark';
  const arched = rng.chance(finish === 'brick' ? 0.45 : 0.2);
  const shutterMat: MaterialId = rng.chance(0.6) ? 'wood_painted' : 'wood';

  // ---- footprint split: optional portico in front
  const portico = spec.portico ?? false;
  const pd = portico ? 3.2 : 0;
  const Db = D - pd; // body depth
  const zf = -D / 2 + pd; // body front plane
  const zb = D / 2;

  // Foundation level: lowest terrain under the footprint minus a margin.
  let gmin = 0;
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2], [0, 0], [0, -D / 2], [0, D / 2]]) gmin = Math.min(gmin, ground(x, z));
  const yMin = gmin - 0.5;

  // ---- ground-floor bays
  const nb = Math.max(2, Math.round(W / rng.range(3.7, 4.5)));
  const bw = W / nb;
  const kinds: BayKind[] = spec.bays?.slice(0, nb) ?? [];
  if (!spec.bays) {
    for (let i = 0; i < nb; i++) kinds.push(pickShopKind(rng, wealth));
    const stair = nb >= 3 ? (rng.chance(0.5) ? 1 : nb - 2) : 0;
    kinds[stair] = 'stair';
    if (nb >= 6) kinds[stair === 1 ? nb - 2 : 1] = 'stair';
    if (spec.courtyard && nb >= 3) kinds[Math.floor(nb / 2)] = 'entrance';
  }
  while (kinds.length < nb) kinds.push('closed');
  const openChance = spec.openShopChance ?? 0.6;
  const oh = rng.range(2.85, 3.05);
  const bays: Bay[] = kinds.map((kind, i) => {
    const x0 = -W / 2 + i * bw, x1 = x0 + bw, cx = (x0 + x1) / 2;
    const yb = Math.max(yMin + 0.4, Math.min(0, ground(cx, zf - 0.3)));
    const isShop = kind !== 'stair' && kind !== 'entrance' && kind !== 'closed';
    const open = isShop && rng.chance(openChance);
    let o: Opening;
    if (kind === 'stair') o = { x0: cx - 0.58, x1: cx + 0.58, y0: yb, y1: yb + 2.45 };
    else if (kind === 'entrance') o = { x0: cx - 1.05, x1: cx + 1.05, y0: yb, y1: yb + 3.3, arch: 1.05 };
    else {
      const ow = Math.max(2.1, Math.min(3.5, bw - rng.range(0.85, 1.1)));
      o = { x0: cx - ow / 2, x1: cx + ow / 2, y0: yb, y1: yb + oh, arch: arched ? ow * 0.17 : 0 };
    }
    return { x0, x1, kind: isShop ? kind : kind, yb, open, o };
  });

  const spot = (kind: SpotKind, x: number, y: number, z: number, facing: number, tag?: string) =>
    spots.push({ id: `${kind}${spots.length}`, kind, position: new THREE.Vector3(x, y, z), facing, tag });

  // ---- front facade (body)
  const F = d.at(0, 0, zf);
  const frontOpen: Opening[] = [];
  const sd = Math.max(2.4, Math.min(5.0, (spec.courtyard ? Math.min(7, Db * 0.32) : Db) - T - 1.6)); // shop depth (inner)
  const balcony = portico ? 'none' : spec.balcony ?? rng.weighted<'none' | 'partial' | 'full'>([['none', 1.4], ['partial', 1 + wealth], ['full', 0.6 + wealth]]);
  let bal0 = 0, bal1 = -1;
  if (balcony === 'full') { bal0 = 0; bal1 = nb - 1; }
  else if (balcony === 'partial') { const len = rng.int(1, Math.max(1, Math.min(3, nb - 1))); bal0 = rng.int(0, nb - len); bal1 = bal0 + len - 1; }
  const twoWin = bw > 4.3 && rng.chance(0.5);

  for (const bay of bays) {
    if (bay.o) frontOpen.push(bay.o);
    // Mezzanine window above shop lintels.
    if (bay.kind !== 'stair' && bay.kind !== 'entrance' && bay.o) {
      const cx = (bay.x0 + bay.x1) / 2;
      const y0 = bay.o.y1 + 0.38;
      if (y0 + 0.55 < G - 0.25) frontOpen.push({ x0: cx - 0.36, x1: cx + 0.36, y0, y1: y0 + 0.55 });
    }
  }
  const upperWins: { o: Opening; k: number; door: boolean }[] = [];
  for (let k = 1; k < n; k++) {
    const fy = floorY(k);
    const top = k === n - 1;
    bays.forEach((bay, i) => {
      const cx = (bay.x0 + bay.x1) / 2;
      const door = k === 1 && i >= bal0 && i <= bal1;
      const ww = (top ? 0.85 : 1.0) * (door ? 1.0 : rng.range(0.95, 1.08));
      const wh = door ? 2.2 : top ? 1.15 : 1.4;
      const y0 = door ? fy + 0.08 : fy + 0.9;
      const xs = twoWin && !door ? [cx - bw * 0.22, cx + bw * 0.22] : [cx];
      for (const x of xs) {
        const o: Opening = { x0: x - ww / 2, x1: x + ww / 2, y0, y1: y0 + wh, arch: finish === 'brick' && !door && rng.chance(0.15) ? 0.12 : 0 };
        frontOpen.push(o);
        upperWins.push({ o, k, door });
      }
    });
  }
  const cut = wall(F, wallMat, -W / 2, W / 2, yMin, eave, T, frontOpen);
  const isCut = (o: Opening) => cut.includes(o);

  // Facade details: string courses, cornice, dado on plastered ground floor.
  for (let k = 1; k < n; k++) band(F, courseMat, -W / 2 - 0.02, W / 2 + 0.02, floorY(k) - 0.07, 0.12, 0.07);
  cornice(F, trim, -W / 2, W / 2, eave);
  if (finish === 'plaster') {
    // Painted dado on each pier between the openings.
    let x = -W / 2;
    for (const bay of bays) {
      if (bay.o && isCut(bay.o)) {
        dado(F, dadoMat, x, bay.o.x0, yMin, bay.yb + 1.1);
        x = bay.o.x1;
      }
    }
    dado(F, dadoMat, x, W / 2, yMin, bays[bays.length - 1].yb + 1.1);
  }

  // Shops / doors.
  for (const bay of bays) {
    const o = bay.o;
    if (!o || !isCut(o)) continue;
    const cx = (o.x0 + o.x1) / 2, ow = o.x1 - o.x0;
    const S = F.at(cx, bay.yb, 0);
    const lo: Opening = { ...o, x0: -ow / 2, x1: ow / 2, y0: 0, y1: o.y1 - bay.yb };
    if (bay.kind === 'stair') {
      doorFrame(S, lo, trim === 'plaster_white' ? 'travertine' : trim);
      stairwell(S, ow, T, Math.min(sd, 3.2));
      S.solid(-ow / 2 - 0.05, 0, T * 0.5, ow / 2 + 0.05, 2.6, sd);
      spot('houseDoor', cx, bay.yb, zf - 0.5, Math.PI, 'stair');
      continue;
    }
    if (bay.kind === 'entrance') {
      doorFrame(S, lo, 'travertine', { cornice: true });
      doorLeaves(S, lo, T, 0, 'wood_dark', true);
      S.span('black', -ow / 2, 0, T * 0.5 + 0.05, ow / 2, lo.y1, T * 0.5 + 0.1, { shadow: false });
      spot('houseDoor', cx, bay.yb, zf - 0.5, Math.PI, 'courtyard');
      continue;
    }
    // Lintel / archivolt and relieving arch.
    if (o.arch) archBand(S, finish === 'brick' ? 'brick' : trim, 0, lo.y1 - o.arch, ow / 2, o.arch, 0.24, 0.035);
    else S.span(finish === 'brick' ? 'travertine' : 'wood_dark', -ow / 2 - 0.18, lo.y1, -0.035, ow / 2 + 0.18, lo.y1 + 0.24, 0.05, { shadow: false });
    if (finish === 'brick' && !o.arch) archBand(S, 'brick', 0, lo.y1 + 0.24, ow / 2 + 0.05, Math.min(0.32, ow * 0.11), 0.22, 0.03);
    S.span('travertine', -ow / 2 - 0.02, -0.08, -0.14, ow / 2 + 0.02, 0.02, T * 0.6); // threshold with shutter groove
    const kind = bay.kind as ShopKind;
    const ceiling = lo.y1 + 0.12 - (o.arch ?? 0) * 0;
    // Mezzanine (dark) above the shop ceiling, behind the small window.
    S.span('black', -ow / 2, ceiling + 0.11, T + 0.01, ow / 2, Math.max(ceiling + 0.3, G - bay.yb - 0.2), T + 1.2, { shadow: false });
    if (bay.open) {
      shopInterior(S, kind, { w: ow, depth: T + sd, h: ceiling, t: T, wealth }, rng.fork(`shop${cx}`));
      S.solid(-ow / 2 - 0.3, -0.4, T * 0.2, ow / 2 + 0.3, 0, T + sd); // shop floor
      if (dress) {
        shopFrontage(S, kind, ow, rng.fork(`front${cx}`));
        if (!portico && rng.chance(0.45)) {
          const mats: [MaterialId, MaterialId] = rng.pick([['fabric_white', 'fabric_red'], ['fabric_ochre', 'fabric_white'], ['fabric_white', 'fabric_blue']] as [MaterialId, MaterialId][]);
          const ay = Math.min(lo.y1 + 0.55, G - bay.yb - 0.4);
          stripedAwning(S, -ow / 2 - 0.25, ow / 2 + 0.25, -1.35, -0.02, ay - 0.55, ay, mats);
          for (const s of [-1, 1]) S.cyl('wood', s * (ow / 2 + 0.2), (ay - 0.6) / 2, -1.35, 0.035, ay - 0.6, 5);
          S.rod('iron', { x: 0, y: ay, z: -0.02 }, { x: 0, y: ay + 0.25, z: 0 }, 0.01, 3, { shadow: false });
        }
        if (rng.chance(0.25)) placeProp(S, 'signboard', ow / 2 + 0.45, Math.min(lo.y1 + 0.4, G - bay.yb - 0.6), 0, 0, { variant: rng.int(0, 2), collide: false });
      }
      spot('shopDoor', cx, bay.yb, zf - 0.6, Math.PI, kind);
      spot('workshop', cx, bay.yb, zf + T + 1.3, Math.PI, kind);
    } else {
      plankShutters(S, lo, T, rng);
      S.span('black', -ow / 2, 0, T * 0.3 + 0.08, ow / 2, lo.y1, T * 0.3 + 0.1, { shadow: false });
    }
  }
  // Upper windows: sills, lintels, shutters (balcony doors get leaves).
  for (const { o, door } of upperWins) {
    if (!isCut(o)) continue;
    if (door) {
      F.span(shutterMat, o.x0 + 0.02, o.y0, T * 0.45, o.x1 - 0.02, o.y1 - 0.02, T * 0.45 + 0.05);
      continue;
    }
    const sh = rng.weighted<'open' | 'half' | 'closed' | null>([['open', 3], ['half', 1.5], ['closed', 2], [null, 2.5]]);
    windowDetails(F, o, {
      t: T,
      sill: 'travertine',
      lintel: finish === 'brick' ? null : rng.chance(0.4) ? 'travertine' : null,
      relieving: finish === 'brick' ? 'brick' : null,
      shutters: sh,
      shutterMat,
    });
  }

  // ---- balcony (maenianum)
  if (bal1 >= bal0) balconyAt(F, bays[bal0].x0 + 0.15, bays[bal1].x1 - 0.15, floorY(1), rng.range(0.95, 1.2), rng, shutterMat);

  // ---- other walls
  const sideWins = (len: number, open: boolean, groundWins = !spec.courtyard): Opening[] => {
    if (!open) return [];
    const out: Opening[] = [];
    const m = Math.max(1, Math.round((len - 1.5) / 3.6));
    for (let k = 1; k < n; k++) {
      const fy = floorY(k);
      const top = k === n - 1;
      for (let i = 0; i < m; i++) {
        const x = -len / 2 + (len * (i + 0.5)) / m;
        const ww = top ? 0.8 : 0.95;
        out.push({ x0: x - ww / 2, x1: x + ww / 2, y0: fy + 0.9, y1: fy + 0.9 + (top ? 1.1 : 1.35) });
      }
    }
    // A couple of small barred windows on the ground floor.
    for (let i = 0; i < m && groundWins; i++) if (rng.chance(0.4)) { const x = -len / 2 + (len * (i + 0.5)) / m; out.push({ x0: x - 0.4, x1: x + 0.4, y0: 2.3, y1: 2.9 }); }
    return out;
  };
  const sideLen = Db - 2 * T;
  const L = d.at(-W / 2, 0, (zf + zb) / 2, Math.PI / 2);
  const R = d.at(W / 2, 0, (zf + zb) / 2, -Math.PI / 2);
  const Bk = d.at(0, 0, zb, Math.PI);
  for (const [frame, len, open] of [[L, sideLen, sides.left], [R, sideLen, sides.right], [Bk, W, sides.back]] as const) {
    const wins = sideWins(len, open);
    const cutS = wall(frame, wallMat, -len / 2, len / 2, yMin, eave, T, wins);
    if (open) {
      for (const o of cutS) windowDetails(frame, o, { t: T, sill: 'travertine', relieving: finish === 'brick' ? 'brick' : null, shutters: rng.weighted([['open', 2], ['closed', 1.5], [null, 2]]), shutterMat, grille: o.y0 < G && o.y0 > 2 });
      for (let k = 1; k < n; k++) band(frame, courseMat, -len / 2 - (len === W ? 0.02 : T + 0.02), len / 2 + (len === W ? 0.02 : T + 0.02), floorY(k) - 0.07, 0.12, 0.07);
      cornice(frame, trim, -len / 2 - (len === W ? 0 : T), len / 2 + (len === W ? 0 : T), eave);
    }
  }

  // ---- interior darkness behind windows
  const ix = W / 2 - T - 0.01, iz0 = zf + T + 0.01, iz1 = zb - T - 0.01;
  let cw = 0, cdp = 0;
  if (spec.courtyard) {
    cw = Math.max(4, W - 2 * Math.min(7, W * 0.32));
    cdp = Math.max(4, Db - 2 * Math.min(7, Db * 0.32));
    const ccz = (zf + zb) / 2;
    const cx0 = -cw / 2 - T - 0.01, cx1 = cw / 2 + T + 0.01;
    const cz0 = ccz - cdp / 2 - T - 0.01, cz1 = ccz + cdp / 2 + T + 0.01;
    const y0 = G - 0.25;
    d.span('black', -ix, y0, iz0, ix, eave, cz0, { shadow: false });
    d.span('black', -ix, y0, cz1, ix, eave, iz1, { shadow: false });
    d.span('black', -ix, y0, cz0, cx0, eave, cz1, { shadow: false });
    d.span('black', cx1, y0, cz0, ix, eave, cz1, { shadow: false });
    courtyardWalls(d, cw, cdp, ccz, n, floorY, G, eave, wallMat, courseMat, rng, shutterMat);
  } else {
    d.span('black', -ix, G - 0.25, iz0, ix, eave, iz1, { shadow: false });
  }
  // Ground floor behind side/back barred windows.
  if (!spec.courtyard) d.span('black', -ix, 2.0, iz0 + sd + 0.2, ix, G - 0.26, iz1, { shadow: false });

  // ---- portico
  if (portico) porticoFront(d, W, D, pd, bays, G, yMin, wallMat, trim, sides, rng);

  // ---- roof
  const roofKind = spec.courtyard ? 'ring' : spec.roof ?? (rng.chance(0.7) ? 'hip' : 'gable');
  const rz = (zf + zb) / 2;
  roof(d.at(0, 0, rz), {
    kind: roofKind,
    w: W,
    d: Db,
    y: eave,
    overhang: rng.range(0.45, 0.65),
    inner: spec.courtyard ? { w: cw, d: cdp } : undefined,
    wallMat,
    wallT: T,
    pitch: (rng.range(19, 23) * Math.PI) / 180,
  });

  // ---- colliders: upper mass, back of the ground floor, front piers per bay
  d.solid(-W / 2, G - 0.3, zf, W / 2, eave, zb);
  d.solid(-W / 2, yMin, zf + T + sd + 0.1, W / 2, G - 0.3, zb);
  let px = -W / 2;
  for (const bay of bays) {
    const o = bay.o;
    if (!o || !isCut(o) || !(bay.open && bay.kind !== 'stair' && bay.kind !== 'entrance')) continue;
    d.solid(px, yMin, zf, o.x0, G - 0.3, zf + T + sd + 0.1);
    d.solid(o.x0, o.y1, zf, o.x1, G - 0.3, zf + T + sd + 0.1);
    d.solid(o.x0, yMin, zf, o.x1, o.y0 - 0.12, zf + T * 0.2);
    px = o.x1;
  }
  d.solid(px, yMin, zf, W / 2, G - 0.3, zf + T + sd + 0.1);
  // Closed bays & doors are covered by the pier boxes above (they span to the next open shop).
  return { builder: b, spots, height: eave };
}

/** Two-step projecting cornice just under the eaves (top at `y`). */
function cornice(F: Draw, mat: MaterialId, x0: number, x1: number, y: number) {
  F.span(mat, x0 - 0.05, y - 0.32, -0.12, x1 + 0.05, y - 0.16, 0.03);
  F.span(mat, x0 - 0.1, y - 0.16, -0.24, x1 + 0.1, y, 0.03);
}

function dado(F: Draw, mat: MaterialId, x0: number, x1: number, y0: number, y1: number) {
  if (x1 - x0 < 0.05) return;
  F.span(mat, x0, y0, -0.015, x1, y1, 0.01, { shadow: false });
}

/** Steps rising into the dark from a stair door. */
function stairwell(S: Draw, w: number, t: number, depth: number) {
  S.span('plaster_cream', -w / 2 - 0.12, 0, t, -w / 2, 3.2, t + depth);
  S.span('plaster_cream', w / 2, 0, t, w / 2 + 0.12, 3.2, t + depth);
  const n = Math.floor(depth / 0.3);
  for (let i = 0; i < n; i++) S.span('travertine', -w / 2, 0, t + 0.25 + i * 0.3, w / 2, 0.18 * (i + 1), t + 0.25 + (i + 1) * 0.3);
  S.span('black', -w / 2, 0.18 * n, t + 0.25 + n * 0.3 - 0.02, w / 2, 3.2, t + 0.25 + n * 0.3);
  S.span('plaster_cream', -w / 2 - 0.12, 2.55, t, w / 2 + 0.12, 2.7, t + 1.2, { shadow: false });
  S.span('black', -w / 2, 2.45, t + 1.2, w / 2, 3.2, t + depth, { shadow: false });
}

/** Wooden balcony on projecting joists with an X-lattice railing. */
function balconyAt(F: Draw, x0: number, x1: number, y: number, depth: number, rng: Rng, mat: MaterialId) {
  const len = x1 - x0;
  const nj = Math.max(2, Math.round(len / 0.95) + 1);
  for (let i = 0; i < nj; i++) {
    const x = x0 + (len * i) / (nj - 1);
    F.span('wood_dark', x - 0.07, y - 0.24, -depth - 0.08, x + 0.07, y - 0.06, 0.05);
  }
  F.span('wood', x0, y - 0.07, -depth, x1, y + 0.02, -0.005);
  const railH = 1.0;
  const posts = nj;
  const z = -depth + 0.05;
  for (let i = 0; i < posts; i++) F.span(mat, x0 + (len * i) / (posts - 1) - 0.045, y, z - 0.045, x0 + (len * i) / (posts - 1) + 0.045, y + railH + 0.05, z + 0.045);
  F.span(mat, x0 - 0.03, y + railH, z - 0.06, x1 + 0.03, y + railH + 0.07, z + 0.06);
  F.span(mat, x0, y + 0.06, z - 0.035, x1, y + 0.13, z + 0.035, { shadow: false });
  for (let i = 0; i < posts - 1; i++) {
    const a = x0 + (len * i) / (posts - 1), c = x0 + (len * (i + 1)) / (posts - 1);
    const cx = (a + c) / 2, span = c - a, h = railH - 0.13;
    const ang = Math.atan2(h, span);
    const dl = Math.hypot(span, h) - 0.05;
    for (const s of [-1, 1]) F.box(mat, cx, y + 0.13 + h / 2, z, dl, 0.045, 0.03, { rz: s * ang, shadow: false });
  }
  // Side rails.
  for (const x of [x0, x1]) {
    F.span(mat, x - 0.03, y + railH, -depth, x + 0.03, y + railH + 0.06, 0);
    F.span(mat, x - 0.02, y, -depth + 0.4, x + 0.02, y + railH, -depth + 0.46, { shadow: false });
  }
  // Pots and laundry on some balconies.
  if (rng.chance(0.5)) F.cyl('terracotta', x0 + 0.3, y + 0.15, -0.3, 0.14, 0.28, 8, { rTop: 0.18 });
  if (rng.chance(0.4)) F.span(rng.pick(['fabric_white', 'fabric_red', 'fabric_blue'] as MaterialId[]), x0 + len * 0.4, y + 0.4, z - 0.06, x0 + len * 0.4 + 0.7, y + railH, z - 0.05, { shadow: false });
}

/** Inner facades of a light-well courtyard. */
function courtyardWalls(d: Draw, cw: number, cd: number, cz: number, n: number, floorY: (k: number) => number, G: number, eave: number, wallMat: MaterialId, course: MaterialId, rng: Rng, shutterMat: MaterialId) {
  const walls: [Draw, number][] = [
    [d.at(0, 0, cz - cd / 2, Math.PI), cw + 2 * T],
    [d.at(0, 0, cz + cd / 2, 0), cw + 2 * T],
    [d.at(-cw / 2, 0, cz, -Math.PI / 2), cd],
    [d.at(cw / 2, 0, cz, Math.PI / 2), cd],
  ];
  for (const [frame, len] of walls) {
    const ops: Opening[] = [];
    const m = Math.max(1, Math.round((len - 1) / 3.2));
    for (let i = 0; i < m; i++) {
      const x = -len / 2 + (len * (i + 0.5)) / m;
      ops.push({ x0: x - 0.6, x1: x + 0.6, y0: 0, y1: 2.6, arch: 0.6 });
      for (let k = 1; k < n; k++) ops.push({ x0: x - 0.45, x1: x + 0.45, y0: floorY(k) + 0.9, y1: floorY(k) + 2.2 });
    }
    // Each frame's outer face looks into the courtyard; the wall extends back into the wing.
    const inner = frame;
    const cutI = wall(inner, wallMat, -len / 2, len / 2, -0.3, eave, T, ops);
    for (const o of cutI) {
      if (o.y0 < 0.5) inner.span('black', o.x0, 0, T * 0.5, o.x1, o.y1, T * 0.5 + 0.02, { shadow: false });
      else windowDetails(inner, o, { t: T, sill: 'travertine', shutters: rng.weighted([['open', 1], ['closed', 1], [null, 1]]), shutterMat });
    }
    for (let k = 1; k < n; k++) band(inner, course, -len / 2, len / 2, floorY(k) - 0.07, 0.12, 0.06);
  }
  // Courtyard floor and a cistern head.
  d.span('cobbles', -cw / 2, -0.3, cz - cd / 2, cw / 2, 0.0, cz + cd / 2);
  placeProp(d, 'puteal', 0, 0, cz, 0, { variant: 0 });
  void G;
}

/** Neronian street portico: an arcade carrying a terrace, in front of the shops. */
function porticoFront(d: Draw, W: number, D: number, pd: number, bays: Bay[], G: number, yMin: number, wallMat: MaterialId, trim: MaterialId, sides: { left: boolean; right: boolean }, rng: Rng) {
  const F = d.at(0, 0, -D / 2);
  const pt = 0.7;
  const arches: Opening[] = bays.map((bay) => {
    const cx = (bay.x0 + bay.x1) / 2, ow = bay.x1 - bay.x0 - 0.8;
    return { x0: cx - ow / 2, x1: cx + ow / 2, y0: bay.yb, y1: Math.min(bay.yb + 3.5, G - 0.5), arch: Math.min(ow / 2, 1.2) };
  });
  const top = G + 0.05;
  const cut = wall(F, wallMat, -W / 2, W / 2, yMin, top, pt, arches);
  for (const o of cut) archBand(F, wallMat === 'brick' ? 'brick' : trim, (o.x0 + o.x1) / 2, o.y1 - (o.arch ?? 0), (o.x1 - o.x0) / 2, o.arch ?? 0.5, 0.25, 0.04);
  band(F, trim, -W / 2 - 0.05, W / 2 + 0.05, top - 0.25, 0.25, 0.1);
  // Terrace slab, ceiling, parapet.
  d.span(trim === 'travertine' ? 'travertine' : 'concrete', -W / 2, G - 0.35, -D / 2 + pt, W / 2, top, -D / 2 + pd);
  d.span(wallMat, -W / 2, top, -D / 2, W / 2, top + 0.95, -D / 2 + 0.3);
  d.span(trim, -W / 2 - 0.03, top + 0.95, -D / 2 - 0.03, W / 2 + 0.03, top + 1.05, -D / 2 + 0.33);
  // Floors per bay (paved walkway following the slope) and piers' colliders.
  bays.forEach((bay, i) => {
    d.span('paving_travertine', bay.x0, bay.yb - 0.3, -D / 2 + 0.02, bay.x1, bay.yb + 0.01, -D / 2 + pd + 0.02);
    d.solid(bay.x0, bay.yb - 0.5, -D / 2, bay.x1, bay.yb, -D / 2 + pd);
    const a = cut[i];
    if (a) {
      d.solid(i === 0 ? -W / 2 : bay.x0, yMin, -D / 2, a.x0, top, -D / 2 + pt);
      d.solid(a.x0, a.y1 - (a.arch ?? 0) * 0.3, -D / 2, a.x1, top, -D / 2 + pt);
    } else d.solid(bay.x0, yMin, -D / 2, bay.x1, top, -D / 2 + pt);
  });
  d.solid(cut.length ? cut[cut.length - 1].x1 : -W / 2, yMin, -D / 2, W / 2, top, -D / 2 + pt);
  // Ends: open arch if the side is free, else a solid wall.
  for (const [s, open] of [[-1, sides.left], [1, sides.right]] as const) {
    const E = d.at(s * W / 2, 0, -D / 2 + pd / 2, s < 0 ? Math.PI / 2 : -Math.PI / 2);
    const yb = s < 0 ? bays[0].yb : bays[bays.length - 1].yb;
    const ops: Opening[] = open ? [{ x0: -pd / 2 + 0.8, x1: pd / 2 - 0.8, y0: yb, y1: Math.min(yb + 3.2, G - 0.5), arch: (pd - 1.6) / 2 }] : [];
    wall(E, wallMat, -pd / 2, pd / 2, yMin, top, 0.45, ops);
    if (!open) E.solid(-pd / 2, yMin, 0, pd / 2, top, 0.45);
    else {
      E.solid(-pd / 2, yMin, 0, -pd / 2 + 0.8, top, 0.45);
      E.solid(pd / 2 - 0.8, yMin, 0, pd / 2, top, 0.45);
    }
  }
  if (rng.chance(0.5)) placeProp(d, 'bench_masonry', bays[0].x1 - 0.2, bays[0].yb, -D / 2 + pd - 0.3, Math.PI, { variant: 0 });
}
