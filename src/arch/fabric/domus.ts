/**
 * Domus: the inward-looking town house of a wealthy family. Blank plastered street walls let out
 * as shops on either side of the entrance (fauces); behind them the atrium under a compluviate
 * roof (sloping inward to the opening over the impluvium), a tablinum block, and at the back a
 * peristyle garden with a colonnade of red-and-white plastered columns.
 *
 * Local frame as for insulae: footprint `width` × `depth` centred, street front facing −z, floor y = 0.
 */
import * as THREE from 'three';
import { Rng } from '../../core/Rng';
import { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { placeProp } from '../props';
import { hedge as boxHedge } from '../vegetation/decor';
import { Draw } from './draw';
import { roof } from './roof';
import { pickShopKind, shopFrontage, shopInterior, type ShopKind } from './shops';
import { flatGround, type BuildingOutput, type Detail, type LocalGround, type Spot, type SpotKind } from './types';
import { archBand, band, doorFrame, doorLeaves, plankShutters, socleAndDado, wall, windowDetails, type Opening } from './wall';

export interface DomusSpec {
  width: number;
  depth: number;
  seed?: number;
  wealth?: number;
  /** Street-side shops flanking the entrance (default: as many as fit). */
  shops?: boolean;
  /** Upper floor over the street shops (cenacula). */
  upperFloor?: boolean;
  groundAt?: LocalGround;
  sides?: { left?: boolean; right?: boolean; back?: boolean };
  streetDressing?: boolean;
  /** Level of detail (see `Detail`); every level has the same massing. */
  detail?: Detail;
}

const T = 0.5;

export function domus(spec: DomusSpec): BuildingOutput {
  const rng = new Rng(spec.seed ?? 1);
  const b = new MeshBuilder();
  const low = spec.detail === 'low';
  const full = (spec.detail ?? 'full') === 'full';
  const d = low ? new Draw(b).flatWalls() : new Draw(b);
  const spots: Spot[] = [];
  const W = spec.width, D = spec.depth;
  const wealth = spec.wealth ?? 0.75;
  const ground = spec.groundAt ?? flatGround;
  const dress = (spec.streetDressing ?? true) && full;
  const spot = (kind: SpotKind, x: number, y: number, z: number, facing: number, tag?: string) =>
    spots.push({ id: `${kind}${spots.length}`, kind, position: new THREE.Vector3(x, y, z), facing, tag });

  const wallMat: MaterialId = rng.weighted<MaterialId>([['plaster_white', 2], ['plaster_cream', 2], ['plaster_ochre', 1]]);
  // Pompeian red or yellow-ochre dado (never on a wall of the same colour).
  const dadoMat: MaterialId = rng.chance(0.6) || wallMat === 'plaster_ochre' ? 'plaster_red' : 'plaster_ochre';
  const trim: MaterialId = rng.chance(0.5) ? 'travertine' : 'tufa';
  // Masonry podium where the terrain falls away below the floor, painted dado above it.
  const socle = (f: Draw, x0: number, x1: number, skip?: Opening[]) => socleAndDado(f, x0, x1, yMin, ground, { dado: dadoMat, socle: trim, skip });

  let gmin = 0;
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2], [0, 0]]) gmin = Math.min(gmin, ground(x, z));
  const yMin = gmin - 0.5;

  // ---- zones along the depth
  const ft = 5.6; // street range (shops + fauces)
  const ad = Math.min(Math.max(9, W * 0.75), (D - ft) * 0.55); // atrium block
  const tbd = Math.min(4.5, Math.max(0, D - ft - ad - 6)); // tablinum block
  const pd = D - ft - ad - tbd; // peristyle / garden
  const z0 = -D / 2, z1 = z0 + ft, z2 = z1 + ad, z3 = z2 + tbd, z4 = D / 2;
  const upper = spec.upperFloor ?? rng.chance(0.45);
  const hf = upper ? 7.2 : 4.7;
  const ha = rng.range(6.6, 7.4);

  // ---- street range: shops either side of the fauces
  const F = d.at(0, 0, z0);
  const doorW = rng.range(1.7, 2.1), doorH = 3.6;
  const fyb = Math.max(yMin + 0.4, Math.min(0, ground(0, z0 - 0.3)));
  const fauces: Opening = { x0: -doorW / 2, x1: doorW / 2, y0: fyb, y1: fyb + doorH, fill: 'wood_dark' };
  const shopOps: { o: Opening; kind: ShopKind; open: boolean; yb: number }[] = [];
  if (spec.shops ?? true) {
    const avail = W / 2 - doorW / 2 - 1.4;
    const per = Math.floor(avail / 3.9);
    for (const side of [-1, 1]) {
      for (let i = 0; i < per; i++) {
        const cx = side * (doorW / 2 + 1.2 + (avail / per) * (i + 0.5));
        const ow = Math.min(3.0, avail / per - 1.0);
        const yb = Math.max(yMin + 0.4, Math.min(0, ground(cx, z0 - 0.3)));
        const kind = pickShopKind(rng, wealth), open = rng.chance(0.65);
        shopOps.push({ o: { x0: cx - ow / 2, x1: cx + ow / 2, y0: yb, y1: yb + 2.9, fill: open ? 'black' : 'wood' }, kind, open, yb });
      }
    }
  }
  const frontOps: Opening[] = [fauces, ...shopOps.map((s) => s.o)];
  // A few small high windows (and upper-floor windows over shops).
  const upWins: Opening[] = [];
  if (upper) {
    for (const s of shopOps) {
      const cx = (s.o.x0 + s.o.x1) / 2;
      upWins.push({ x0: cx - 0.45, x1: cx + 0.45, y0: 5.0, y1: 6.2 });
    }
  } else {
    for (const x of [-W / 2 + 1.2, W / 2 - 1.2]) if (W > 12) upWins.push({ x0: x - 0.3, x1: x + 0.3, y0: 3.4, y1: 3.9 });
  }
  const cut = wall(F, wallMat, -W / 2, W / 2, yMin, hf, T, [...frontOps, ...upWins]);
  // Street front: the shop floors step with the sidewalk, so the dado simply follows the ground.
  socleAndDado(F, -W / 2, W / 2, yMin, ground, { dado: dadoMat, skip: cut });
  band(F, trim, -W / 2 - 0.02, W / 2 + 0.02, hf - 0.5, 0.3, 0.18); // cornice, tucked under the roof slab
  if (upper) band(F, trim, -W / 2 - 0.02, W / 2 + 0.02, 4.3, 0.12, 0.07);
  for (const o of upWins) {
    const sh = rng.chance(0.5) ? 'closed' : 'open';
    if (cut.includes(o) && !low) windowDetails(F, o, { t: T, sill: 'travertine', shutters: sh, shutterMat: 'wood_painted', grille: !upper });
  }

  // Main door: travertine frame with cornice, studded leaves standing ajar, dark fauces.
  if (cut.includes(fauces)) {
    const S = F.at(0, fyb, 0);
    const lo: Opening = { x0: -doorW / 2, x1: doorW / 2, y0: 0, y1: doorH };
    doorFrame(S, lo, trim, { cornice: true, jamb: 0.22 });
    // Pilasters flanking the door with simple capitals (tufa "Samnite" doorway).
    for (const s of [-1, 1]) {
      S.span(trim, s * (doorW / 2 + 0.22) - 0.2 * (s > 0 ? 0 : 1), 0, -0.12, s * (doorW / 2 + 0.22) + 0.2 * (s > 0 ? 1 : 0), doorH + 0.24, 0);
      S.span(trim, s * (doorW / 2 + 0.22) - 0.26 * (s > 0 ? 0 : 1), doorH + 0.24, -0.16, s * (doorW / 2 + 0.22) + 0.26 * (s > 0 ? 1 : 0), doorH + 0.42, 0);
    }
    S.span('mosaic', -doorW / 2, -0.1, T - 0.05, doorW / 2, 0.01, T + 2.2);
    S.span(wallMat, -doorW / 2 - 0.1, 0, T, -doorW / 2, doorH, T + 2.2);
    S.span(wallMat, doorW / 2, 0, T, doorW / 2 + 0.1, doorH, T + 2.2);
    S.span(dadoMat, -doorW / 2 - 0.01, 0, T, -doorW / 2 + 0.01, 1.0, T + 2.2, { shadow: false });
    S.span(dadoMat, doorW / 2 - 0.01, 0, T, doorW / 2 + 0.01, 1.0, T + 2.2, { shadow: false });
    S.span(wallMat, -doorW / 2, doorH, T, doorW / 2, doorH + 0.1, T + 2.2, { shadow: false });
    S.span('black', -doorW / 2, 0, T + 2.2, doorW / 2, doorH, T + 2.25, { shadow: false });
    doorLeaves(S, lo, T, 0.35, 'wood_dark', true);
    S.solid(-doorW / 2, 0, T + 0.4, doorW / 2, doorH, T + 0.6);
    S.solid(-doorW / 2 - 0.2, -0.5, -0.1, doorW / 2 + 0.2, 0, T + 2.2);
    spot('houseDoor', 0, fyb, z0 - 0.6, Math.PI, 'domus');
  }
  // Shops.
  const sd = ft - T - 0.6;
  for (const s of shopOps) {
    if (!cut.includes(s.o)) continue;
    const cx = (s.o.x0 + s.o.x1) / 2, ow = s.o.x1 - s.o.x0;
    const S = F.at(cx, s.yb, 0);
    const lo: Opening = { x0: -ow / 2, x1: ow / 2, y0: 0, y1: 2.9 };
    S.span('wood_dark', -ow / 2 - 0.15, 2.9, -0.03, ow / 2 + 0.15, 3.12, 0.05, { shadow: false });
    S.span('travertine', -ow / 2 - 0.02, -0.08, -0.14, ow / 2 + 0.02, 0.02, T * 0.6);
    if (s.open && !full) {
      S.span('black', -ow / 2, 0, T * 0.6, ow / 2, 2.9, T * 0.6 + 0.02, { shadow: false });
    } else if (s.open) {
      shopInterior(S.noShadow(), s.kind, { w: ow, depth: T + sd, h: 3.0, t: T, wealth }, rng.fork(`shop${cx}`));
      S.solid(-ow / 2 - 0.2, -0.5, 0, ow / 2 + 0.2, 0, T + sd);
      if (dress) shopFrontage(S, s.kind, ow, rng.fork(`fr${cx}`));
    } else {
      // Shutter planks draw from a fork so every level keeps the same main sequence.
      if (!low) plankShutters(S, lo, T, rng.fork(`sh${cx}`));
      S.span('black', -ow / 2, 0, T * 0.3 + 0.08, ow / 2, 2.9, T * 0.3 + 0.1, { shadow: false });
    }
    if (s.open) {
      spot('shopDoor', cx, s.yb, z0 - 0.6, Math.PI, s.kind);
      spot('workshop', cx, s.yb, z0 + T + 1.3, Math.PI, s.kind);
    }
  }
  // Street range: side walls and roof (lean-to sloping to the street).
  for (const s of [-1, 1]) {
    const E = d.at(s * W / 2, 0, (z0 + z1) / 2, s < 0 ? Math.PI / 2 : -Math.PI / 2);
    // From behind the front wall back to the atrium's side wall (wall-x runs −z on the left side).
    const a = s < 0 ? -ft / 2 : -(ft - 2 * T) / 2, c = s < 0 ? (ft - 2 * T) / 2 : ft / 2;
    wall(E, wallMat, a, c, yMin, hf, T);
    socle(E, -ft / 2, ft / 2);
  }
  d.span('interior', -W / 2 + T, upper ? 4.2 : 3.2, z0 + T + 0.01, W / 2 - T, hf, z1 - 0.01, { shadow: false });
  roof(d.at(0, 0, (z0 + z1) / 2), { kind: 'gable', w: W, d: ft, y: hf, axis: 'x', overhang: 0.5, wallMat, wallT: T, pitch: 0.36, ridges: !low });

  // ---- atrium block (compluviate roof over the impluvium)
  const cw = Math.max(2.6, W * 0.24), cd = Math.max(2.4, ad * 0.3);
  const aw = Math.min(W - 6, cw + 6), adIn = Math.min(ad - 2.5, cd + 5);
  const za = (z1 + z2) / 2;
  for (const s of [-1, 1]) {
    const E = d.at(s * W / 2, 0, za, s < 0 ? Math.PI / 2 : -Math.PI / 2);
    wall(E, wallMat, -ad / 2, ad / 2, yMin, ha, T);
    socle(E, -ad / 2, ad / 2);
  }
  wall(d.at(0, 0, z1), wallMat, -W / 2, W / 2, hf - 0.4, ha, T);
  const rr = roof(d.at(0, 0, za), { kind: 'ring', w: W, d: ad, y: ha, inner: { w: cw, d: cd, overhang: 0.15 }, ridgeAt: 0.22, overhang: 0.45, pitch: 0.33, ridges: !low });
  // Atrium room under the roof: floor, painted walls, impluvium.
  d.span('mosaic', -aw / 2, -0.1, za - adIn / 2, aw / 2, 0.0, za + adIn / 2);
  for (const [x0, x1, zA, zB] of [[-aw / 2 - 0.3, -aw / 2, za - adIn / 2, za + adIn / 2], [aw / 2, aw / 2 + 0.3, za - adIn / 2, za + adIn / 2], [-aw / 2, aw / 2, za - adIn / 2 - 0.3, za - adIn / 2], [-aw / 2, aw / 2, za + adIn / 2, za + adIn / 2 + 0.3]]) {
    d.span('plaster_red', x0, 0, zA, x1, rr.innerEave + 0.6, zB);
  }
  d.span('marble', -cw / 2 - 0.25, 0, za - cd / 2 - 0.25, cw / 2 + 0.25, 0.18, za + cd / 2 + 0.25);
  d.span('water', -cw / 2 + 0.05, 0.12, za - cd / 2 + 0.05, cw / 2 - 0.05, 0.19, za + cd / 2 - 0.05, { shadow: false });
  if (full) {
    placeProp(d, 'puteal', cw / 2 + 0.9, 0, za + cd / 2 + 0.6, 0, { variant: 1 });
    placeProp(d, 'table_marble', 0, 0, za + cd / 2 + 1.3, 0);
  }
  // Dark mass between the atrium and the outer walls, kept under the inward-sloping roof.
  const darkTop = rr.innerEave + (aw / 2 + 0.3 - cw / 2 + 0.15) * Math.tan(0.33) - 0.3;
  for (const [x0, x1] of [[-W / 2 + T, -aw / 2 - 0.3], [aw / 2 + 0.3, W / 2 - T]]) d.span('black', x0, 0, z1 + 0.01, x1, darkTop, z2 - 0.01, { shadow: false });

  // ---- tablinum block
  if (tbd > 0.5) {
    const zt = (z2 + z3) / 2;
    for (const s of [-1, 1]) {
      const E = d.at(s * W / 2, 0, zt, s < 0 ? Math.PI / 2 : -Math.PI / 2);
      wall(E, wallMat, -tbd / 2, tbd / 2, yMin, ha - 0.6, T);
      socle(E, -tbd / 2, tbd / 2);
    }
    d.span('black', -W / 2 + T, 0, z2, W / 2 - T, ha - 0.6, z3, { shadow: false });
    roof(d.at(0, 0, zt), { kind: 'gable', w: W, d: tbd, y: ha - 0.6, axis: 'x', overhang: 0.3, wallMat, wallT: T, pitch: 0.36, ridges: !low });
  }

  // ---- peristyle garden
  const hp = 4.9;
  if (pd > 5) {
    const zp = (z3 + z4) / 2;
    const pw = W - 2 * T, pdd = pd - T;
    const port = Math.min(2.8, Math.min(pw, pdd) * 0.22);
    const gw = pw - 2 * port, gd = pdd - 2 * port;
    for (const s of [-1, 1]) {
      const E = d.at(s * W / 2, 0, zp, s < 0 ? Math.PI / 2 : -Math.PI / 2);
      wall(E, wallMat, -pd / 2, pd / 2, yMin, hp, T);
      socle(E, -pd / 2, pd / 2);
    }
    const Bk = d.at(0, 0, z4, Math.PI);
    wall(Bk, wallMat, -W / 2, W / 2, yMin, hp, T);
    socle(Bk, -W / 2 - 0.03, W / 2 + 0.03);
    // Rear face of the tablinum block, opening onto the garden.
    const tabOpen: Opening = { x0: -Math.min(2.2, W * 0.15), x1: Math.min(2.2, W * 0.15), y0: 0, y1: 3.3 };
    const Tb = d.at(0, 0, z3, Math.PI);
    const tcut = wall(Tb, wallMat, -W / 2, W / 2, -0.3, ha - 0.6, T, [tabOpen]);
    if (tcut.length) Tb.span('black', tabOpen.x0, 0, T + 0.5, tabOpen.x1, 3.3, T + 0.55, { shadow: false });
    band(Tb, dadoMat, -W / 2 + T, tabOpen.x0, -0.3, 1.6, 0.012);
    band(Tb, dadoMat, tabOpen.x1, W / 2 - T, -0.3, 1.6, 0.012);
    const gz = zp - T / 2;
    // Inner faces of the peristyle walls: red dado + white upper zone.
    const inner: [number, number, number, number][] = [[-pw / 2, -pw / 2 + 0.02, gz - pdd / 2, gz + pdd / 2], [pw / 2 - 0.02, pw / 2, gz - pdd / 2, gz + pdd / 2], [-pw / 2, pw / 2, gz + pdd / 2 - 0.02, gz + pdd / 2]];
    for (const [x0, x1, zA, zB] of inner) {
      d.span('plaster_red', x0, 0, zA, x1, 1.3, zB, { shadow: false });
      d.span('plaster_white', x0, 1.3, zA, x1, hp - 0.3, zB, { shadow: false });
    }
    const rp = roof(d.at(0, 0, gz), { kind: 'ring', w: pw, d: pdd, y: hp, inner: { w: gw, d: gd, overhang: 0.35 }, ridgeAt: 0, overhang: 0.3, pitch: 0.3, ridges: !low });
    // Colonnade: Pompeian columns, red lower third, white fluted-looking upper part.
    const colTop = rp.innerEave + 0.35 * Math.tan(0.3) - 0.14;
    const colsX = Math.max(2, Math.round(gw / 2.6));
    const colsZ = Math.max(2, Math.round(gd / 2.6));
    const cs = full ? 12 : low ? 5 : 8; // column segments per level
    const colAt = (x: number, z: number) => {
      if (!low) d.cyl('travertine', x, 0.06, z, 0.26, 0.12, cs - 2);
      d.cyl('plaster_red', x, 0.12 + (colTop - 0.5) / 6, z, 0.2, (colTop - 0.5) / 3, cs, { open: low });
      d.cyl('plaster_white', x, 0.12 + (colTop - 0.5) / 3 + (colTop - 0.5) / 3, z, 0.2, ((colTop - 0.5) * 2) / 3, cs, { rTop: 0.17, open: low });
      d.span('plaster_white', x - 0.27, colTop - 0.38, z - 0.27, x + 0.27, colTop - 0.25, z + 0.27);
      d.solidCyl(x, colTop / 2, z, 0.22, colTop);
    };
    for (let i = 0; i <= colsX; i++) {
      const x = -gw / 2 + (gw * i) / colsX;
      colAt(x, gz - gd / 2);
      colAt(x, gz + gd / 2);
    }
    for (let i = 1; i < colsZ; i++) {
      const z = gz - gd / 2 + (gd * i) / colsZ;
      colAt(-gw / 2, z);
      colAt(gw / 2, z);
    }
    // Architrave beams.
    for (const z of [gz - gd / 2, gz + gd / 2]) d.span('plaster_white', -gw / 2 - 0.25, colTop - 0.25, z - 0.2, gw / 2 + 0.25, colTop, z + 0.2);
    for (const x of [-gw / 2, gw / 2]) d.span('plaster_white', x - 0.2, colTop - 0.25, gz - gd / 2, x + 0.2, colTop, gz + gd / 2);
    // Walkway and garden.
    d.span('cobbles', -pw / 2, -0.12, gz - pdd / 2, pw / 2, 0.0, gz + pdd / 2);
    d.span('dirt', -gw / 2 + 0.25, -0.1, gz - gd / 2 + 0.25, gw / 2 - 0.25, 0.04, gz + gd / 2 - 0.25);
    // Box hedges framing beds, a basin in the centre.
    const hedge = (x0: number, z0: number, x1: number, z1: number) => boxHedge(d, x0, z0, x1, z1, 0.62, Math.round(x0 * 7 + z0 * 13));
    const gx = gw / 2 - 0.6, gzz = gd / 2 - 0.6;
    if (gx > 1.5 && gzz > 1.5 && !low) {
      hedge(-gx, gz - gzz, -0.9, gz - gzz + 0.4);
      hedge(0.9, gz - gzz, gx, gz - gzz + 0.4);
      hedge(-gx, gz + gzz - 0.4, -0.9, gz + gzz);
      hedge(0.9, gz + gzz - 0.4, gx, gz + gzz);
      d.span('gravel', -0.8, 0.04, gz - gd / 2 + 0.25, 0.8, 0.06, gz + gd / 2 - 0.25, { shadow: false });
    }
    d.cyl('marble', 0, 0.25, gz, 0.95, 0.5, 18);
    d.cyl('water', 0, 0.46, gz, 0.85, 0.06, 18, { shadow: false });
    d.cyl('marble', 0, 0.75, gz, 0.12, 0.6, 8);
    d.ellipsoid('marble', 0, 1.1, gz, 0.22, 0.08, 0.22, { seg: [10, 5] });
    spot('fountain', 0, 0, gz - 1.3, Math.PI, 'domus');
    for (const [x, z] of [[-gw / 4, gz - gd / 4], [gw / 4, gz + gd / 4], [gw / 4, gz - gd / 4], [-gw / 4, gz + gd / 4]]) if (rng.chance(0.6)) spot('tree', x, 0, z, 0, rng.pick(['laurel', 'olive', 'oleander', 'cypress']));
    if (rng.chance(0.6) && full) placeProp(d, 'herm', -gw / 2 + 0.6, 0, gz, Math.PI / 2);
    if (rng.chance(0.5) && full) placeProp(d, 'statue_pedestal', 0, 0, gz + gd / 2 - 0.8, Math.PI, { variant: 1, scale: 0.8 });
  }

  // ---- colliders: everything but the shop recesses / fauces
  const front = z0 + T + sd + 0.1;
  d.solid(-W / 2, yMin, front, W / 2, ha, z4);
  let px = -W / 2;
  const holes = [...shopOps.filter((s) => s.open && cut.includes(s.o)).map((s) => s.o), fauces].sort((a, b2) => a.x0 - b2.x0);
  for (const o of holes) {
    d.solid(px, yMin, z0, o.x0, hf, front);
    d.solid(o.x0, o.y1, z0, o.x1, hf, front);
    px = o.x1;
  }
  d.solid(px, yMin, z0, W / 2, hf, front);
  void archBand;
  return { builder: b, spots, height: hf };
}
