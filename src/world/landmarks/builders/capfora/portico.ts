/**
 * `forumPortico()`: one straight run of a forum colonnade, the workhorse of the Imperial Fora
 * (Caesar's double porticoes, the giallo antico porticoes of Augustus with their caryatid attic,
 * the red granite porticoes of the Templum Pacis).
 *
 * Frame: the run goes along +x from x = 0 to `length`; the column axes stand on z = 0 and the
 * portico faces −z (the square). The back wall's inner face is at z = `depth`. y = 0 is the level of
 * the square in front; the portico floor (stylobate) is `floorY` above it, reached by human-scale
 * steps along the whole front. All lengths in GAME metres.
 *
 * What it builds: floor + steps (step colliders), columns (cylinder colliders from the kit), the
 * entablature (kit sweep), an optional attic (plain, relief or caryatids with Ammon shields), a
 * coffered ceiling, a lean-to tiled roof behind the attic, and the back wall with openings (doors to
 * tabernae, niches with statues). The back wall and end walls get box colliders.
 */
import * as THREE from 'three';
import { column } from '../../../../arch/classical/column';
import { entablature } from '../../../../arch/classical/entablature';
import { columnDims, diameterForHeight, type Detail, type Order } from '../../../../arch/classical/orders';
import { T, TRS, mul } from '../../../../arch/common/geom';
import { stairs, stepCount } from '../../../../arch/common/stairs';
import { wall, type Opening } from '../../../../arch/common/walls';
import type { MeshBuilder } from '../../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../../gfx/materialIds';
import { box, caryatid, clipeus, coffers, figure, friezeStrip, span, type FigureKind } from './ornament';

export interface PorticoSpec {
  length: number;
  /** Column axes (z = 0) to the inner face of the back wall. */
  depth: number;
  order: Order;
  /** Column height. */
  H: number;
  D?: number;
  /** Target axial spacing; the run is divided evenly. */
  spacing: number;
  /** Shaft material: a library id, or a one-off material (red granite). */
  material: MaterialId | THREE.Material;
  trimMaterial?: MaterialId;
  fluted?: boolean;
  detail: Detail;
  columnDetail?: Detail;
  /** Floor top above the square (0 = no steps). */
  floorY?: number;
  floorMaterial?: MaterialId;
  /** Lowest ground under the portico (relative to y = 0) so the floor block reaches it. */
  groundMin?: number;
  /** Back wall material (inner face) and thickness. 'none' = no back wall. */
  wallMaterial?: MaterialId | 'none';
  wallThickness?: number;
  /** Extra height of the back wall above the roof ridge. */
  wallExtra?: number;
  openings?: Opening[];
  /** Stretches [x0, x1] of the back wall left open (exedrae, side halls). */
  gaps?: [number, number][];
  /** Statues standing in the 'niche' openings. */
  nicheStatues?: FigureKind | 'none';
  nicheStatueMaterial?: MaterialId;
  attic?: { height: number; kind: 'plain' | 'caryatid' | 'relief'; material?: MaterialId; relief?: THREE.Material };
  roofMaterial?: MaterialId | 'none';
  ceiling?: 'coffers' | 'plain';
  /** Close the run's ends with walls (start, end). */
  endWalls?: [boolean, boolean];
  /** Relief material for the frieze, tile length (m). */
  frieze?: THREE.Material;
  friezeTile?: number;
  /** Columns at the very ends of the run (x = 0 and x = length) instead of half a bay in. */
  endColumns?: boolean;
}

export interface PorticoResult {
  columnsX: number[];
  floorY: number;
  /** Cornice top (y). */
  corniceY: number;
  /** Top of the attic (or the cornice). */
  atticTop: number;
  /** Height of the back wall. */
  wallTop: number;
  D: number;
}

export function forumPortico(b: MeshBuilder, spec: PorticoSpec, at: THREE.Matrix4): PorticoResult {
  const L = spec.length;
  const depth = spec.depth;
  const detail = spec.detail;
  const cdet = spec.columnDetail ?? 'low';
  const D = spec.D ?? diameterForHeight(spec.order, spec.H);
  const dims = columnDims(spec.order, D, spec.H);
  const d = dims.d;
  const floorY = spec.floorY ?? 0;
  const wallT = spec.wallThickness ?? 0.8;
  const front = dims.plinth / 2 + 0.35;

  // ---- floor, steps
  const g0 = Math.min(0, spec.groundMin ?? 0) - 0.3;
  const floorMat = spec.floorMaterial ?? 'paving_travertine';
  if (floorY > 0.01) {
    span(b, 'travertine', 0, g0, -front, L, floorY - 0.04, depth, at, true);
    span(b, floorMat, 0, floorY - 0.04, -front, L, floorY, depth, at);
    const { count, rise } = stepCount(floorY, 0.2);
    const run = 0.36;
    stairs(b, { width: L, rise, run, count, material: 'travertine' }, mul(at, T(L / 2, 0, -front - count * run)));
    if (g0 < -0.35) span(b, 'travertine', 0, g0, -front - count * run - 0.05, L, 0, -front, at);
  } else {
    span(b, floorMat, 0, g0, -front, L, 0.02, depth, at, true);
  }

  // ---- columns
  const n = Math.max(1, Math.round(L / spec.spacing));
  const xs: number[] = [];
  if (spec.endColumns) for (let k = 0; k <= n; k++) xs.push((k * L) / n);
  else for (let k = 0; k < n; k++) xs.push(((k + 0.5) * L) / n);
  const axial = L / n;
  // column() only hands the material on to MeshBuilder.add, which accepts a THREE.Material too.
  const shaft = spec.material as MaterialId;
  const trimMat = spec.trimMaterial ?? (typeof spec.material === 'string' ? undefined : 'marble');
  for (const x of xs) column(b, { order: spec.order, D, height: spec.H, fluted: spec.fluted ?? false, material: shaft, trimMaterial: trimMat, detail: cdet }, mul(at, T(x, floorY, 0)));

  // ---- entablature
  const yE = floorY + spec.H;
  const entMat: MaterialId = spec.trimMaterial ?? (typeof spec.material !== 'string' || spec.material === 'marble_giallo' || spec.material === 'marble_veined' ? 'marble' : spec.material);
  const ent = entablature(
    b,
    [new THREE.Vector3(0, yE, -d / 2), new THREE.Vector3(L, yE, -d / 2)],
    { order: spec.order, columnHeight: spec.H, D, material: entMat, detail, depth: d * 1.25, axial },
    { at, caps: true },
  );
  const corniceY = yE + ent.dims.total;
  const faceZ = -d / 2 - ent.friezeX;
  if (spec.frieze) {
    const fh = ent.dims.frieze * 0.92;
    friezeStrip(b, spec.frieze, 0, L, yE + ent.dims.architrave + ent.dims.frieze * 0.04, fh, spec.friezeTile ?? fh * 8, mul(at, T(0, 0, faceZ - 0.012)));
  }

  // ---- ceiling
  const yc = yE + ent.dims.architrave + ent.dims.frieze;
  if ((spec.ceiling ?? 'coffers') === 'coffers' && detail === 'high') coffers(b, 0, L, d / 2, depth, yc, Math.max(1.6, axial / 2), at, 'low');
  else span(b, 'wood_dark', 0, yc - 0.05, d / 2, L, yc, depth, at);

  // ---- attic
  let atticTop = corniceY;
  if (spec.attic) {
    const ah = spec.attic.height;
    const am = spec.attic.material ?? entMat;
    const az = faceZ + 0.15;
    span(b, am, 0, corniceY - 0.05, az, L, corniceY + ah, az + 0.7, at);
    // Base and crowning mouldings of the attic.
    span(b, am, -0.05, corniceY - 0.05, az - 0.14, L + 0.05, corniceY + ah * 0.08, az, at);
    span(b, am, -0.1, corniceY + ah * 0.9, az - 0.22, L + 0.1, corniceY + ah, az + 0.7, at);
    if (spec.attic.kind === 'caryatid') {
      // Caryatids over the columns, Ammon shields between them (Forum of Augustus).
      const ch = ah * 0.8;
      const yb = corniceY + ah * 0.08;
      for (const x of xs) caryatid(b, ch, mul(at, TRS(x, yb, az - 0.18, 0, 0, 0)), { detail: 'low', material: 'marble' });
      for (let k = 0; k < xs.length - 1; k++) {
        const x = (xs[k] + xs[k + 1]) / 2;
        clipeus(b, Math.min(ah * 0.3, axial * 0.28), mul(at, T(x, yb + ch * 0.52, az - 0.02)), { detail: 'low', material: 'marble' });
      }
      // Pilaster strips framing each bay behind the figures.
      for (const x of xs) span(b, am, x - 0.18 * ch, yb, az - 0.08, x + 0.18 * ch, corniceY + ah * 0.9, az, at);
    } else if (spec.attic.kind === 'relief' && spec.attic.relief) {
      friezeStrip(b, spec.attic.relief, 0, L, corniceY + ah * 0.15, ah * 0.7, ah * 0.7 * 8, mul(at, T(0, 0, az - 0.01)));
    }
    atticTop = corniceY + ah;
  }

  // ---- lean-to roof from the back wall down to behind the attic (or over the cornice)
  const roofMat = spec.roofMaterial ?? 'roof_tile';
  const zr0 = spec.attic ? faceZ + 0.85 : -d / 2 - ent.projection + 0.2;
  const yr0 = spec.attic ? atticTop - 0.35 : corniceY + 0.05;
  const run = depth + wallT * 0.5 - zr0;
  const rise = Math.tan((14 * Math.PI) / 180) * run;
  const yr1 = yr0 + rise;
  if (roofMat !== 'none') {
    const slope = Math.hypot(run, rise);
    const g = new THREE.BoxGeometry(L, 0.2, slope);
    g.rotateX(Math.atan2(rise, run));
    g.translate(L / 2, (yr0 + yr1) / 2, (zr0 + depth + wallT * 0.5) / 2);
    b.add(g, roofMat, at);
  }

  // ---- back wall
  const wallTop = Math.max(yr1 + 0.4 + (spec.wallExtra ?? 0), atticTop + 0.4);
  if ((spec.wallMaterial ?? 'travertine') !== 'none') {
    const wm = spec.wallMaterial as MaterialId;
    const ops = spec.openings ?? [];
    // Wall pieces between the gaps; each piece takes the openings that fall inside it.
    const gaps = [...(spec.gaps ?? [])].sort((a, c) => a[0] - c[0]);
    const pieces: [number, number][] = [];
    let x0 = 0;
    for (const [ga, gb] of gaps) {
      if (ga > x0 + 0.05) pieces.push([x0, ga]);
      x0 = Math.max(x0, gb);
    }
    if (L > x0 + 0.05) pieces.push([x0, L]);
    for (const [pa, pb] of pieces) {
      const mine = ops.filter((o) => o.x - o.width / 2 >= pa && o.x + o.width / 2 <= pb);
      wall(
        b,
        { length: pb - pa, height: wallTop - g0, thickness: wallT, material: wm, openings: mine.map((o) => ({ ...o, x: o.x - pa, sill: (o.sill ?? (o.kind === 'niche' ? 1.2 : 0)) - g0 + floorY })), detail, collide: true },
        mul(at, T(pa, g0, depth + wallT / 2)),
      );
    }
    if (spec.nicheStatues && spec.nicheStatues !== 'none') {
      for (const o of ops) {
        if (o.kind !== 'niche') continue;
        const sill = floorY + (o.sill ?? 1.2);
        const sc = Math.min(1.25, (o.height - o.width * 0.5) / 1.75);
        figure(b, spec.nicheStatues, mul(at, TRS(o.x, sill, depth + 0.25, 0, 0, 0)), { scale: sc, material: spec.nicheStatueMaterial ?? 'bronze', detail: detail === 'high' ? 'high' : 'low' });
      }
    }
  }
  const ends = spec.endWalls ?? [false, false];
  for (const [i, x] of [[0, 0], [1, L]] as const) {
    if (!ends[i]) continue;
    const t = wallT;
    const x0 = i === 0 ? -t : L;
    box(b, (spec.wallMaterial === 'none' ? 'travertine' : spec.wallMaterial) ?? 'travertine', x0 + t / 2, (g0 + wallTop) / 2, (depth + wallT - front) / 2 - 0.0, t, wallTop - g0, depth + wallT + front, at, true);
    void x;
  }
  return { columnsX: xs, floorY, corniceY, atticTop, wallTop, D };
}
