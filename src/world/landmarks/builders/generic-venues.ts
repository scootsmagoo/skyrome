/**
 * Category builders for the places of spectacle — theatres, odea, stadia, circuses and
 * amphitheatres — plus the reusable `theatre()` and `bowl()` they are made of, which the Campus
 * Martius heroes (Pompey, Balbus, the Odeum and Stadium of Domitian, the Vatican circus) also use.
 *
 * Seats are 1:1 (0.4 m rows, not walkable; the radial aisles are); monumental heights are scaled.
 */
import * as THREE from 'three';
import { amphitheatre, caveaSection, type AmphitheatreSpec } from '../../../arch/classical/amphitheatre';
import { amphitheatreFar } from '../../../arch/classical/amphitheatreFar';
import { MeshBuilder } from '../../../gfx/MeshBuilder';
import { colosseumStoreys } from '../../../arch/classical/arch';
import { obelisk } from '../../../arch/classical/monuments';
import type { Order } from '../../../arch/classical/orders';
import { lathe, ProfileBuilder } from '../../../arch/common/geom';
import type { Draw } from '../../../arch/fabric/draw';
import type { MaterialId } from '../../../gfx/materialIds';
import { LANDMARKS } from '../../../data/atlas';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import {
  T, V, arc, children, crenellations, dims, draw, farDraw, finish, flight, flightLength, groundRange, heightG, hintsOf, inscription, mul, offsetLine, pathLength,
  piercedWall, plinth, spot, statueOnPedestal, tiledRoof, type Detail, type V3, liftAll,
} from './generic-common';
import { liteColonnade, liteColumnAt } from './generic-civic-lib';
import { liteArcade, ribbonSlab, ribbonWall, seating, seatingTiers, type LiteStorey } from './generic-seating';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Facade storeys for a lite arcade: arcades with half-columns, the top one an attic if `attic`. */
export function arcadeStoreys(H: number, n: number, attic = true): LiteStorey[] {
  return Array.from({ length: n }, (_, i) => ({ height: H / n, columns: true, kind: attic && n > 2 && i === n - 1 ? 'attic' : 'arcade', parapet: i > 0 ? 1.0 : 0 }));
}

// ---------------------------------------------------------------- theatre

export interface TheatreSpec {
  /** Orchestra centre (local z); the cavea bulges toward −z from it, the stage lies toward +z. */
  zc: number;
  /** Outer radius of the curved facade. */
  Ro: number;
  /** Orchestra radius (the foot of the cavea's podium). */
  r0: number;
  /** Height of the facade top. */
  H: number;
  storeys: number;
  /** Arches round the half circle. */
  bays?: number;
  /** Stage (pulpitum) width and depth. */
  stageW: number;
  stageD: number;
  /** Back of the stage building (local z) and its width. */
  zBack: number;
  sceneW: number;
  /** Roofed hall (odeum): a timber roof over the cavea. */
  roof?: boolean;
  /** Storeys of columns on the scaenae frons. */
  frons?: number;
  /** Fractions (0 = the cavea's west/left end … 1 = the other end) where no aisle is built. */
  skip?: [number, number][];
  /** Doors through the back of the stage building (Pompey: onto the porticus garden). */
  backDoors?: boolean;
  material?: MaterialId;
  /** Velarium masts on the attic. */
  masts?: boolean;
}

export interface TheatreResult {
  seatTop: number;
  /** z of the scaenae frons. */
  zf: number;
  reach: number;
}

/**
 * Foundation that follows a curved plan: a rectangle from z0 to z1 (half-width hw) plus a half disc
 * of radius r round (0, zc) on the `side` (−1: bulging to −z, theatres; +1: to +z, stadium ends).
 * Replaces the rectangular plinth so no paving pokes out past a curved facade.
 */
export function curvedPlinth(d: Draw, ctx: LandmarkContext, hw: number, z0: number, z1: number, r: number, zc: number, side: -1 | 1) {
  const zA = side < 0 ? zc - r : z0, zB = side < 0 ? z1 : zc + r;
  const gr = groundRange(ctx, -Math.max(hw, r), zA, Math.max(hw, r), zB, 6);
  const bottom = Math.min(-0.25, gr.min - 0.5);
  const top = 0.02;
  d.span('travertine', -hw, bottom, z0, hw, top, z1, { collide: true });
  const g = new THREE.CylinderGeometry(r + 0.6, r + 0.6, top - bottom, 40, 1, false, side < 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI);
  d.geo(g, 'travertine', 0, (top + bottom) / 2, zc);
  // Colliders for the half disc: three stacked boxes inside it.
  for (const [fx, fz] of [[0.97, 0.45], [0.8, 0.75], [0.5, 0.95]]) {
    const za = zc, zb = zc + side * r * fz;
    d.solid(-r * fx, bottom, Math.min(za, zb), r * fx, top, Math.max(za, zb));
  }
}

/** Pure: the cavea section `theatre()` sweeps (x = offset outward from the orchestra edge, y up). */
export function theatreProfile(s: Pick<TheatreSpec, 'Ro' | 'r0' | 'H' | 'storeys'>): { profile: [number, number][]; height: number; reach: number } {
  const reach = s.Ro - 1.8 - 3.0 - s.r0;
  const tiers = seatingTiers(s.H - 1.4, reach, 1.0, clamp(s.storeys - 1, 1, 2), 2.2);
  const sec = caveaSection({ arenaRx: 1, arenaRz: 1, podium: 1.0, tiers, topWalk: 2.2 });
  return { profile: sec.profile, height: sec.height, reach: sec.reach };
}

/** Pure: the height of the stepped section at offset x (the tread under that point). */
export function profileHeightAt(profile: [number, number][], x: number): number {
  let y = 0;
  for (const [px, py] of profile) if (px <= x + 1e-6 && py > y) y = py;
  return y;
}

/** Points of a half circle round (0, zc) from (−r, zc) through −z to (r, zc): facade outward on the right. */
export function halfCircle(r: number, zc: number, n: number, y = 0): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (Math.PI * i) / n;
    out.push(V(r * Math.cos(a), y, zc - r * Math.sin(a)));
  }
  return out;
}

export function theatre(d: Draw, ctx: LandmarkContext, s: TheatreSpec, spots: Spot[], far: Draw): TheatreResult {
  const { detail, lm } = ctx;
  const mat = s.material ?? 'travertine';
  const segs = detail === 'high' ? 40 : 24;
  const fd = 1.8; // facade (pier) depth
  const c = 3.0; // ambulatory behind the facade
  const reach = s.Ro - fd - c - s.r0;
  const seatH = s.H - 1.4;
  const zc = s.zc;
  // Orchestra floor (a half disc and the strip to the stage) in coloured marble.
  d.geo(new THREE.CylinderGeometry(s.r0, s.r0, 0.06, segs, 1, false, Math.PI / 2, Math.PI), 'marble_veined', 0, 0.0, zc);
  const zStage = zc + 3.4; // the parodoi run between the cavea ends and the stage
  d.span('marble_veined', -s.r0, -0.2, zc, s.r0, 0.03, zStage);
  // Cavea.
  const path = halfCircle(s.r0, zc, segs);
  const L = pathLength(path);
  const aisles = Math.max(5, Math.round((Math.PI * s.r0) / 9));
  const res = seating(d, {
    path, podium: 1.0, height: seatH, reach, walkways: clamp(s.storeys - 1, 1, 2), aisles, topWalk: 2.2, detail, colliderChord: 6, ends: true,
    skip: s.skip?.map(([a, b]) => [a * L, b * L] as [number, number]), podiumStairs: true, seat: 'marble', riser: mat, podiumMat: 'marble',
  });
  // Facade arcade round the half circle, ambulatory floors behind it.
  const fpath = halfCircle(s.Ro, zc, segs);
  const bays = s.bays ?? Math.max(12, Math.round((Math.PI * s.Ro) / 4.2));
  const storeyH = s.H / s.storeys;
  liteArcade(d, fpath, { storeys: arcadeStoreys(s.H, s.storeys), bay: (Math.PI * s.Ro) / bays, depth: fd, material: mat, detail });
  for (let k = 1; k < s.storeys; k++) ribbonSlab(d, fpath, -fd - c - 0.2, -fd, Math.min(k * storeyH, res.height), 0.4, 'concrete');
  ribbonSlab(d, fpath, -fd - c - 0.2, -fd, res.height, 0.5, 'concrete');
  ribbonSlab(d, fpath, -fd - c - 0.2, -fd, 0.03, 0.25, 'paving_travertine');
  // Inner ring wall of the ambulatory (the back of the seating), dark so the arches read as voids.
  ribbonWall(d, fpath, -fd - c - 0.6, -fd - c, 0, res.height, 'plaster_dark');
  // Porticus in summa cavea: where the facade rises above the last row, a colonnade on the top walk.
  const rTop = s.r0 + res.reach - 1.4;
  summaPorticus(d, halfCircle(rTop, zc, segs), res.height, s.H, s.Ro - fd - rTop, detail);
  if (s.masts && detail === 'high') {
    for (let i = 0; i <= bays; i += 2) {
      const p = halfCircle(s.Ro - 0.6, zc, bays)[i];
      d.cyl('wood', p.x, s.H + 2.2, p.z, 0.14, 5, 6);
    }
  }
  // Stage: pulpitum with a niched front, stairs up at both ends.
  const pulpH = 1.2;
  const sw = s.stageW;
  d.span('marble', -sw / 2, -0.3, zStage, sw / 2, pulpH, zStage + s.stageD, { collide: true });
  d.span('wood', -sw / 2 + 0.1, pulpH, zStage + 0.05, sw / 2 - 0.1, pulpH + 0.05, zStage + s.stageD);
  const niches = Math.max(3, Math.floor(sw / 4));
  for (let i = 0; i < niches; i++) {
    const x = -sw / 2 + (i + 0.5) * (sw / niches);
    d.span(i % 2 ? 'black' : 'marble_veined', x - 0.6, 0.15, zStage - 0.02, x + 0.6, pulpH - 0.2, zStage + 0.02);
  }
  for (const sx of [-1, 1]) flight(d, sx * (sw / 2 - 1.2), zStage - flightLength(pulpH), 1.6, 0, pulpH, 'marble');
  // Scaenae frons: wall with three doors, storeys of coloured columns in front.
  const zf = zStage + s.stageD;
  const fronsH = Math.max(seatH, s.H * 0.85);
  const doorW = 2.6, doorH = Math.min(5, fronsH * 0.35);
  piercedWall(d, -sw / 2, zf, sw / 2, zf, pulpH, fronsH, 1.6, 'marble', [-1, 0, 1].map((k) => ({ x: sw / 2 + k * sw * 0.28, w: doorW, h: doorH, arched: k === 0 })));
  const fs = s.frons ?? Math.min(3, s.storeys);
  const colMats: MaterialId[] = ['marble_giallo', 'marble_pavonazzetto', 'porphyry'];
  const sh = (fronsH - pulpH) / fs;
  for (let k = 0; k < fs; k++) {
    const y0 = pulpH + k * sh;
    const ped = 0.9;
    const eh = Math.max(0.6, sh * 0.13);
    const colH = sh - ped - eh;
    const D = colH / 9.5;
    const n = Math.max(4, Math.round(sw / 3.4));
    const zc2 = zf - 1.2 - (k === 0 ? 0.6 : 0);
    d.span('marble', -sw / 2, y0, zc2 - D * 0.8, sw / 2, y0 + ped, zf, { collide: k === 0 });
    for (let i = 0; i <= n; i++) {
      const x = -sw / 2 + 0.6 + ((sw - 1.2) * i) / n;
      if (k === 0 && [-1, 0, 1].some((j) => Math.abs(x - j * sw * 0.28) < doorW / 2 + D)) continue;
      liteColumnAt(d, x, y0 + ped, zc2, colH, D, colMats[(k + i) % 3], 'corinthian', detail, k === 0);
      if (detail === 'high' && k === 1 && i % 2 === 1 && i < n) statueOnPedestal(d, 'togate', x + (sw - 1.2) / n / 2, y0 + ped, zf - 0.5, 0, 0.9, 'marble', 'low', 0.1);
    }
    d.span('marble', -sw / 2 - 0.2, y0 + ped + colH, zc2 - D * 0.9, sw / 2 + 0.2, y0 + sh, zf);
  }
  // Stage roof: a tiled lean-to from the top of the frons out over the stage.
  const roofLen = s.stageD + 1.2;
  const ang = 0.24;
  d.box('roof_tile', 0, fronsH + 0.6 - Math.sin(ang) * roofLen / 2, zf - roofLen / 2 * Math.cos(ang), sw + 1, 0.3, roofLen, { rx: -ang });
  d.box('wood_dark', 0, fronsH + 0.3 - Math.sin(ang) * roofLen / 2, zf - roofLen / 2 * Math.cos(ang), sw + 0.8, 0.2, roofLen - 0.2, { rx: -ang });
  // Stage building behind the frons, and the side wings (versurae) out to the full width.
  const zb = s.zBack;
  const bw = s.sceneW;
  const backOps = s.backDoors ? [-1, 0, 1].map((k) => ({ x: bw / 2 + k * bw * 0.25, w: 3.2, h: 4.6, arched: true })) : [];
  d.span(mat, -sw / 2, -0.4, zf + 1.6, sw / 2, fronsH + 1.2, zb - 1.4, { collide: true });
  d.span('black', -sw / 2 + 1, pulpH, zf + 1.58, sw / 2 - 1, pulpH + doorH, zf + 1.62);
  piercedWall(d, bw / 2, zb, -bw / 2, zb, 0, fronsH + 1.2, 1.4, mat, backOps.map((o) => ({ ...o, x: bw - o.x })));
  if (s.backDoors) for (const o of backOps) d.span('black', -bw / 2 + o.x - o.w / 2, 0, zb - 1.45, -bw / 2 + o.x + o.w / 2, o.h, zb - 1.4);
  for (const sx of [-1, 1]) {
    const x0 = sx * sw / 2, x1 = sx * bw / 2;
    if (Math.abs(x1 - x0) > 1) {
      d.span(mat, Math.min(x0, x1), -0.4, zStage, Math.max(x0, x1), fronsH * 0.75, zb, { collide: true });
      d.span('black', sx * (sw / 2 + 0.02) - (sx > 0 ? 0 : 0.04), pulpH, zStage + 1, sx * (sw / 2 + 0.06), pulpH + 3.2, zStage + 3.4);
    }
  }
  d.span('travertine', -bw / 2 - 0.2, fronsH + 0.9, zf + 1.4, bw / 2 + 0.2, fronsH + 1.5, zf + 2.2);
  if (!s.roof) tiledRoof(d, 'hip', 0, (zf + 1.6 + zb) / 2, bw, zb - zf - 1.6, fronsH + 1.2, 'low', { pitchDeg: 16 });
  // Odeum: a timber roof over the cavea (half cone) and over the stage building.
  if (s.roof) {
    const rise = s.Ro * 0.28;
    const g = new THREE.ConeGeometry(s.Ro + 0.6, rise, segs, 1, true, Math.PI / 2, Math.PI);
    d.geo(g, 'roof_tile', 0, s.H + 0.4 + rise / 2, zc);
    d.geo(new THREE.ConeGeometry(s.Ro + 0.4, rise, segs, 1, true, Math.PI / 2, Math.PI), 'wood_dark', 0, s.H + 0.2 + rise / 2, zc, { rx: 0 });
    d.span('roof_tile', -s.Ro - 0.6, s.H + 0.2, zc - 0.3, s.Ro + 0.6, s.H + 0.5, zb);
    far.geo(new THREE.ConeGeometry(s.Ro, rise, 12, 1, true, Math.PI / 2, Math.PI), 'roof_tile', 0, s.H + rise / 2, zc);
  }
  // Spots.
  spots.push(
    spot(`${lm.id}:entrance`, 'door', 0, 0, zc - s.Ro - 1.2, 0),
    spot(`${lm.id}:orchestra`, 'vista', 0, 0.03, zc - s.r0 * 0.4, 0),
    spot(`${lm.id}:stage`, 'npc', 0, pulpH, zStage + s.stageD * 0.5, Math.PI),
    spot(`${lm.id}:topseat`, 'vista', s.Ro * 0.3, res.height, zc - (s.r0 + reach) * 0.92, 0),
    spot(`${lm.id}:seat`, 'sit', -s.r0 * 0.7, 1.4, zc - s.r0 * 0.9, Math.PI * 0.85),
  );
  // Far stand-in: half drum + stage block.
  far.geo(new THREE.CylinderGeometry(s.Ro, s.Ro, s.H, 12, 1, false, Math.PI / 2, Math.PI), mat, 0, s.H / 2, zc);
  far.span(mat, -bw / 2, 0, zStage, bw / 2, fronsH + 1.2, zb);
  return { seatTop: res.height, zf, reach };
}

function buildTheatre(ctx: LandmarkContext): LandmarkBuild {
  const { lm } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const H = heightG(ctx, 8);
  const spots: Spot[] = [];
  // Outer radius from the depth (curve to the front edge), capped by the width.
  const stageZone = Math.max(9, dd * 0.28);
  const Ro = Math.min(w / 2, dd - stageZone);
  const zc = -dd / 2 + Ro;
  curvedPlinth(d, ctx, Math.min(w, 2 * Ro) / 2, zc, dd / 2, Ro, zc, -1);
  theatre(d, ctx, {
    zc, Ro, r0: Ro * 0.3, H, storeys: H > 14 ? 3 : 2, stageW: Ro * 1.3, stageD: Math.min(6, stageZone * 0.3),
    zBack: dd / 2, sceneW: Math.min(w, 2 * Ro), roof: lm.category === 'odeum', masts: H > 14,
  }, spots, far);
  return finish(lm.id, d, spots, far, 900);
}

// ---------------------------------------------------------------- stadium / circus bowl

export interface BowlSpec {
  /** Arena width (between the podium walls). */
  aw: number;
  /** z of the straight (front) end of the seating and of the curve centre. */
  z0: number;
  zs: number;
  /** Facade height and storeys. */
  H: number;
  storeys: number;
  /** Seating reach from the podium foot to the back (excl. ambulatory and facade). */
  reach: number;
  podium?: number;
  /** z positions on the straight sides of entrance passages (cut through both sides). */
  gaps?: number[];
  gapW?: number;
  material?: MaterialId;
  /** Upper rows of timber (older or makeshift circuses). */
  timberTop?: boolean;
  bay?: number;
  /** Width of a gate passage cut through the apex of the curved end (an arch landmark stands in it). */
  apexGap?: number;
}

export interface BowlResult {
  seatTop: number;
  /** Outer half-width (podium foot offset + reach + ambulatory + facade). */
  outer: number;
  /** Full podium-foot path (U), for spots. */
  path: V3[];
}

/** The U-shaped podium-foot path: right straight (+x) from z0 to zs, curve round +z, left straight back. */
export function uPath(aw: number, z0: number, zs: number, n: number, step = 8): V3[] {
  const out: V3[] = [];
  const r = aw / 2;
  const ns = Math.max(1, Math.round((zs - z0) / step));
  for (let i = 0; i <= ns; i++) out.push(V(r, 0, z0 + ((zs - z0) * i) / ns));
  for (let i = 1; i < n; i++) {
    const a = (Math.PI * i) / n;
    out.push(V(r * Math.cos(a), 0, zs + r * Math.sin(a)));
  }
  for (let i = 0; i <= ns; i++) out.push(V(-r, 0, zs - ((zs - z0) * i) / ns));
  return out;
}

/** Cut a polyline into the pieces outside the arc-length intervals `cuts`. */
export function cutPath(path: V3[], cuts: [number, number][]): V3[][] {
  const at = (s: number): V3 => {
    let acc = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const L = path[i].distanceTo(path[i + 1]);
      if (acc + L >= s) return path[i].clone().lerp(path[i + 1], L > 0 ? (s - acc) / L : 0);
      acc += L;
    }
    return path[path.length - 1].clone();
  };
  const total = pathLength(path);
  const sorted = [...cuts].sort((a, b) => a[0] - b[0]);
  const keep: [number, number][] = [];
  let s0 = 0;
  for (const [a, b] of sorted) {
    if (a > s0) keep.push([s0, a]);
    s0 = Math.max(s0, b);
  }
  if (s0 < total) keep.push([s0, total]);
  const out: V3[][] = [];
  for (const [a, b] of keep) {
    if (b - a < 1) continue;
    const pts = [at(a)];
    let acc = 0;
    for (let i = 0; i < path.length - 1; i++) {
      acc += path[i].distanceTo(path[i + 1]);
      if (acc > a + 1e-6 && acc < b - 1e-6) pts.push(path[i + 1].clone());
    }
    pts.push(at(b));
    out.push(pts);
  }
  return out;
}

/**
 * Stadium/circus bowl: seating along the U (straight sides and the curved end at +z), a 2–3 storey
 * arcade outside it with an ambulatory, entrance passages through the long sides crowned by
 * tribunals, and the sand arena. The straight front end (−z) is left to the caller (gate / carceres).
 */
export function bowl(d: Draw, ctx: LandmarkContext, s: BowlSpec, spots: Spot[], far: Draw): BowlResult {
  const { detail, lm } = ctx;
  const mat = s.material ?? 'travertine';
  const podium = s.podium ?? 1.4;
  const n = detail === 'high' ? 24 : 14;
  const path = uPath(s.aw, s.z0, s.zs, n);
  const L = pathLength(path);
  const fd = 1.8, c = 2.6;
  const outerOff = s.reach + c + fd;
  const seatH = s.H - 1.2;
  const gw = s.gapW ?? 5;
  const straight = s.zs - s.z0;
  const cuts: [number, number][] = [];
  for (const g of s.gaps ?? []) {
    const sg = g - s.z0;
    if (sg <= gw || sg >= straight - gw) continue;
    cuts.push([sg - gw / 2, sg + gw / 2], [L - sg - gw / 2, L - sg + gw / 2]);
  }
  // The apex passage: arc-length interval at the middle of the U (seats are cut a little wider).
  const apexCuts: [number, number][] = s.apexGap ? [[L / 2 - s.apexGap / 2, L / 2 + s.apexGap / 2]] : [];
  if (s.apexGap) cuts.push([L / 2 - s.apexGap / 2 - 1, L / 2 + s.apexGap / 2 + 1]);
  let seatTop = 0;
  let seatReach = s.reach;
  for (const piece of cutPath(path, cuts)) {
    const r = seating(d, {
      path: piece, podium, height: seatH, reach: s.reach, walkways: s.storeys > 2 ? 2 : 1, aisles: Math.max(2, Math.round(pathLength(piece) / 14)),
      topWalk: 2.0, detail, colliderChord: 8, ends: true, podiumStairs: false, seat: s.timberTop ? 'wood' : 'marble', riser: mat,
    });
    seatTop = r.height;
    seatReach = r.reach;
  }
  // Facade arcade and ambulatory along the offset U (in pieces either side of an apex passage).
  for (const piece of cutPath(path, apexCuts)) {
    const fpath = offsetLine(piece, outerOff);
    liteArcade(d, fpath, { storeys: arcadeStoreys(s.H, s.storeys, s.storeys > 2), bay: s.bay ?? 4.4, depth: fd, material: mat, detail });
    for (let k = 1; k < s.storeys; k++) ribbonSlab(d, fpath, -fd - c - 0.2, -fd, Math.min((k * s.H) / s.storeys, seatTop), 0.4, 'concrete');
    ribbonSlab(d, fpath, -fd - c - 0.2, -fd, seatTop, 0.5, 'concrete');
    ribbonSlab(d, fpath, -fd - c - 0.2, -fd, 0.03, 0.25, 'paving_travertine');
    ribbonWall(d, fpath, -fd - c - 0.6, -fd - c, 0, seatTop, 'plaster_dark');
    summaPorticus(d, offsetLine(piece, seatReach - 1.4), seatTop, s.H, outerOff - fd - (seatReach - 1.4), detail);
  }
  if (s.apexGap) {
    // Passage floor from the arena out through the gap, its sides closed by ashlar end walls.
    const za = s.zs + s.aw / 2, zb = za + outerOff + 1;
    d.span('paving_travertine', -s.apexGap / 2, -0.2, za, s.apexGap / 2, 0.04, zb);
    for (const sx of [-1, 1]) d.span(mat, sx * s.apexGap / 2 - (sx > 0 ? 0 : 1.2), -0.3, za - 1.2, sx * s.apexGap / 2 + (sx > 0 ? 1.2 : 0), s.H, zb - 1, { collide: true });
    spots.push(spot(`${lm.id}:apexGate`, 'door', 0, 0.04, zb + 1.5, Math.PI));
  }
  // Passages and tribunals at the gaps.
  for (const g of s.gaps ?? []) {
    for (const sx of [-1, 1]) {
      const x0 = sx * s.aw / 2, x1 = sx * (s.aw / 2 + outerOff - fd);
      d.span('paving_travertine', Math.min(x0, x1), -0.2, g - gw / 2, Math.max(x0, x1), 0.03, g + gw / 2);
      // Vault over the passage carrying the tribunal (officials' box) with its balustrade.
      const yT = Math.min(seatTop * 0.55, 6);
      d.span(mat, Math.min(x0, x1), yT, g - gw / 2 - 0.4, Math.max(x0, x1), yT + 1.2, g + gw / 2 + 0.4, { collide: true });
      d.span('marble', x0 - sx * 0.1, yT + 1.2, g - gw / 2, x0 + sx * 0.3, yT + 2.3, g + gw / 2, { collide: true });
      d.span('marble', Math.min(x0, x1), yT + 1.2, g - gw / 2 - 0.4, Math.max(x0, x1), yT + 1.25, g + gw / 2 + 0.4);
      spots.push(spot(`${lm.id}:tribunal${sx}:${g.toFixed(0)}`, 'vista', x0 + sx * 2, yT + 1.25, g, sx > 0 ? -Math.PI / 2 : Math.PI / 2));
      spots.push(spot(`${lm.id}:passage${sx}:${g.toFixed(0)}`, 'door', x1 + sx * 2.5, 0, g, sx > 0 ? -Math.PI / 2 : Math.PI / 2));
    }
  }
  // Arena.
  d.span('sand', -s.aw / 2, -0.2, s.z0, s.aw / 2, 0.04, s.zs);
  d.geo(new THREE.CylinderGeometry(s.aw / 2, s.aw / 2, 0.24, n * 2, 1, false, -Math.PI / 2, Math.PI), 'sand', 0, -0.08, s.zs);
  // Far: the facade as a few slabs.
  const ring = offsetLine(uPath(s.aw, s.z0, s.zs, 8, 40), outerOff - fd / 2);
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    const len = a.distanceTo(b);
    far.box(mat, (a.x + b.x) / 2, s.H / 2, (a.z + b.z) / 2, len + fd, s.H, fd, { ry: Math.atan2(-(b.z - a.z), b.x - a.x) });
  }
  spots.push(spot(`${lm.id}:arena`, 'npc', 0, 0.04, (s.z0 + s.zs) / 2, 0), spot(`${lm.id}:seat`, 'sit', s.aw / 2 + 2, 1.6 + 0.4 * 3, (s.z0 + s.zs) / 2 + 12, -Math.PI / 2));
  return { seatTop, outer: s.aw / 2 + outerOff, path };
}

/**
 * Colonnade on the top walk of a cavea (porticus in summa cavea), facing the orchestra/arena: `path`
 * runs with its right-hand normal pointing OUT (as the seating path), so it is reversed here. Only
 * built where the facade stands at least 3 m above the last row of seats.
 */
export function summaPorticus(d: Draw, path: V3[], y: number, top: number, depth: number, detail: Detail) {
  const colH = top - y - 1.2;
  if (colH < 2.6 || depth < 1) return;
  liteColonnade(d, [...path].reverse(), { columnHeight: colH, spacing: Math.max(2.4, colH * 0.5), depth, back: 'wall', material: 'marble', wallMaterial: 'travertine', detail, order: 'corinthian', y, stylobate: 0.15 });
}

/** A meta: three gilded cones on a semicircular base at a spina end. */
export function meta(d: Draw, x: number, y: number, z: number, detail: Detail, flip = false) {
  const f = d.at(x, y, z, flip ? Math.PI : 0);
  f.geo(new THREE.CylinderGeometry(2.2, 2.2, 1.4, 12, 1, false, -Math.PI / 2, Math.PI), 'marble', 0, 0.7, 0);
  f.span('marble', -2.2, 0, -0.01, 2.2, 1.4, 0.6);
  f.solidCyl(0, 0.7, 0.4, 2.2, 1.4);
  const prof = new ProfileBuilder(0.55, 0).to(0.5, 0.5).to(0.08, 4.4).to(0, 4.6).build();
  const g = lathe(prof, { segments: detail === 'high' ? 12 : 6 });
  for (const x2 of [-1.3, 0, 1.3]) f.geo(g, 'gilded_bronze', x2, 1.4, 0.4 - Math.abs(x2) * 0.3);
}

/**
 * Starting gates across the straight end: `n` arched stalls on a shallow arc with a wider pompa gate
 * in the middle, a magistrate's box over it and crenellated towers (oppida) at both ends.
 */
export function carceres(d: Draw, ctx: LandmarkContext, width: number, z: number, H: number, n: number, spots: Spot[], mat: MaterialId = 'travertine') {
  const { detail, lm } = ctx;
  const gateW = 2.8;
  const depth = 4.2;
  const total = width;
  const span = total / (n + 2);
  for (let i = 0; i < n + 1; i++) {
    const k = i - n / 2;
    const x = k * span;
    const zArc = z + (k * k) * 0.06;
    if (i === n / 2) {
      // Pompa gate with the editor's box above.
      d.span(mat, x - span / 2, H * 0.62, zArc - depth / 2, x + span / 2, H, zArc + depth / 2, { collide: true });
      d.span('marble', x - span / 2 - 0.2, H, zArc - depth / 2 - 0.2, x + span / 2 + 0.2, H + 1.1, zArc + depth / 2);
      inscription(d, [lm.latin.split('/')[0].trim()], x, H * 0.8, zArc + depth / 2 + 0.02, span * 0.8, 0.7, Math.PI);
      spots.push(spot(`${lm.id}:editor`, 'vista', x, H + 1.1, zArc, 0));
      continue;
    }
    // Pier, arch head and a herm before each stall.
    d.span(mat, x - span / 2, -0.3, zArc - depth / 2, x - gateW / 2, H * 0.62, zArc + depth / 2, { collide: true });
    d.span(mat, x + gateW / 2, -0.3, zArc - depth / 2, x + span / 2, H * 0.62, zArc + depth / 2, { collide: true });
    d.span(mat, x - span / 2, H * 0.45, zArc - depth / 2, x + span / 2, H * 0.62, zArc + depth / 2);
    d.span('wood_painted', x - gateW / 2, 0, zArc + depth / 2 - 0.3, x + gateW / 2, H * 0.4, zArc + depth / 2 - 0.2);
    if (detail === 'high') d.box('marble', x - span / 2 + 0.4, H * 0.3, zArc + depth / 2 + 0.25, 0.4, H * 0.55, 0.4);
  }
  d.span(mat, -total / 2, H * 0.62, z - depth / 2, total / 2, H * 0.72, z + depth / 2 + 0.6);
  for (const sx of [-1, 1]) {
    const x = sx * (total / 2 + 2.6);
    d.span(mat, x - 2.6, -0.4, z - 3.2, x + 2.6, H + 3, z + 3.2, { collide: true });
    crenellations(d, x - 2.6, z + 3, x + 2.6, z + 3, H + 3, 0.5, mat, 0.9, 0.7, 0.9);
    crenellations(d, x - 2.6, z - 3, x + 2.6, z - 3, H + 3, 0.5, mat, 0.9, 0.7, 0.9);
  }
}

/** Spina along x = 0 from z0 to z1 (a low platform with a water channel, metae at both ends). */
export function spina(d: Draw, ctx: LandmarkContext, z0: number, z1: number, spots: Spot[], gaps: [number, number][] = [], ornaments = true) {
  const { detail, lm } = ctx;
  const w = 3.2;
  const pieces: [number, number][] = [];
  let s = z0 + 3;
  for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (a > s) pieces.push([s, a]);
    s = Math.max(s, b);
  }
  if (z1 - 3 > s) pieces.push([s, z1 - 3]);
  for (const [a, b] of pieces) {
    d.span('marble', -w / 2, -0.2, a, w / 2, 1.1, b, { collide: true });
    d.span('water', -w / 2 + 0.4, 1.0, a + 0.4, w / 2 - 0.4, 1.06, b - 0.4);
  }
  meta(d, 0, 0, z0 + 1, detail, true);
  meta(d, 0, 0, z1 - 1, detail);
  if (ornaments) {
    const n = Math.max(2, Math.floor((z1 - z0) / 40));
    for (let i = 0; i < n; i++) {
      const z = z0 + ((i + 0.5) * (z1 - z0)) / n;
      if (gaps.some(([a, b]) => z > a - 4 && z < b + 4)) continue;
      if (i % 2) statueOnPedestal(d, 'togate', 0, 1.1, z, 0, 1.1, 'gilded_bronze', 'low', 1.2);
      else {
        // Lap counter: seven bronze dolphins on a frame.
        d.span('marble', -0.8, 1.1, z - 0.3, 0.8, 4.4, z + 0.3);
        for (let k = 0; k < 7; k++) d.ellipsoid('bronze', 0, 1.6 + k * 0.4, z, 0.35, 0.12, 0.18, { seg: [6, 4] });
      }
    }
  }
  spots.push(spot(`${lm.id}:meta`, 'vista', 3, 0.04, z1 - 1, Math.PI / 2));
}

function buildStadium(ctx: LandmarkContext): LandmarkBuild {
  const { lm } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const H = heightG(ctx, 6);
  const spots: Spot[] = [];
  const reach = clamp(w * 0.22, 6, 18);
  const aw = Math.max(10, w - 2 * (reach + 4.4));
  const zs = dd / 2 - aw / 2 - reach - 4.4;
  const z0 = -dd / 2 + 4;
  curvedPlinth(d, ctx, w / 2, -dd / 2, zs, w / 2, zs, 1);
  bowl(d, ctx, { aw, z0, zs, H, storeys: H > 12 ? 2 : 1, reach, gaps: [(z0 + zs) / 2] }, spots, far);
  piercedWall(d, -w / 2, z0 - 1.5, w / 2, z0 - 1.5, 0, H * 0.6, 1.5, 'travertine', [{ x: w / 2, w: 5, h: 5.5, arched: true }]);
  return finish(lm.id, d, spots, far, 900);
}

/** Local game position of another landmark relative to `lm`. */
export function localOf(ctx: LandmarkContext, other: { center: readonly [number, number] }): { x: number; z: number } {
  const { lm, S } = ctx;
  const th = (lm.rotation * Math.PI) / 180;
  const dx = other.center[0] - lm.center[0], dz = other.center[1] - lm.center[1];
  return { x: (dx * Math.cos(th) + dz * Math.sin(th)) * S, z: (-dx * Math.sin(th) + dz * Math.cos(th)) * S };
}

function buildCircus(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const h = hintsOf(lm);
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const H = heightG(ctx, 6);
  const spots: Spot[] = [];
  if (lm.height < 1) {
    // An open circus (Flaminius): a long open square with a low turning-post at each end.
    spina(d, ctx, -dd * 0.35, dd * 0.35, spots, [], false);
    return finish(lm.id, d, spots);
  }
  const reach = clamp(w * 0.2, 6, 26);
  const aw = Math.max(20, w - 2 * (reach + 4.4));
  const zs = dd / 2 - aw / 2 - reach - 4.4;
  const z0 = -dd / 2 + 8;
  curvedPlinth(d, ctx, w / 2, -dd / 2, zs, w / 2, zs, 1);
  // An arch standing in the curved end (the Arch of Titus in the Circus Maximus) gets a passage.
  let apexGap = 0;
  for (const c of children(lm)) {
    if (c.category !== 'arch') continue;
    const p = localOf(ctx, c);
    if (p.z > zs && Math.abs(p.x) < aw / 2) apexGap = Math.max(apexGap, (c.footprint.kind === 'rect' ? c.footprint.w : 12) * ctx.S + 1.5);
  }
  bowl(d, ctx, { aw, z0, zs, H, storeys: H > 14 ? 3 : 2, reach, timberTop: h.has('disused', 'wooden', 'timber'), gaps: [z0 + (zs - z0) * 0.55], apexGap }, spots, far);
  carceres(d, ctx, aw + 2 * reach, z0 - 2, Math.min(H * 0.6, 8), 12, spots);
  // Spina, leaving room for any obelisk or shrine standing on it (built as its own landmark).
  const gaps: [number, number][] = [];
  for (const c of children(lm)) {
    const p = localOf(ctx, c);
    if (Math.abs(p.x) < 8) gaps.push([p.z - 4, p.z + 4]);
  }
  spina(d, ctx, z0 + (zs - z0) * 0.12, zs - 4, spots, gaps, detail === 'high');
  return finish(lm.id, d, spots, far, 1000);
}

// ---------------------------------------------------------------- amphitheatre

/**
 * Pure: an amphitheatre spec for the kit's `amphitheatre()` fitted to a footprint (game m): the
 * facade on the footprint ellipse in Colosseum storeys scaled to the height, and a cavea of 1:1
 * rows whose reach exactly fills the space between the arena and the ambulatory's inner wall. The
 * arena comes from the notes ("Arena 83 x 48 m", real) or the Colosseum's proportions.
 */
export function fitAmphitheatre(rx: number, rz: number, H: number, S: number, arenaReal: [number, number] | null, detail: Detail, arches?: number): AmphitheatreSpec {
  const k = H / 48.15;
  const storeys = H > 20 ? colosseumStoreys(k) : colosseumStoreys(k).slice(0, H > 12 ? 3 : 2);
  const bays = arches && arches % 4 === 0 ? arches : Math.max(32, Math.round((Math.PI * (rx + rz)) / 4.05 / 4) * 4);
  const depth = 2.4 * S, corridor = 6 * S;
  const inner = (r: number) => r - depth / 2 - corridor - 0.9;
  let ax = arenaReal ? (arenaReal[0] / 2) * S : rx * 0.46;
  let az = arenaReal ? (arenaReal[1] / 2) * S : rz * 0.35;
  // Reach available round the arena (the tighter of the two axes).
  const avail = Math.min(inner(rx) - ax, inner(rz) - az);
  const tiersFor = (rows: number) => {
    const a = Math.max(3, Math.round(rows * 0.3)), b = Math.max(3, Math.round(rows * 0.45)), c = Math.max(2, rows - a - b);
    return [{ rows: a, rise: 0.4, depth: 0.7 }, { rows: b, rise: 0.4, depth: 0.7, wall: 1.0 }, { rows: c, rise: 0.4, depth: 0.7, wall: 1.0 }];
  };
  // The colonnade in summa cavea is added by the caller with lite columns (the kit's costs ~130k).
  const base = { podium: 4 * S, segments: detail === 'high' ? 80 : 56, aisles: Math.max(12, Math.round(bays / 4)), seatMaterial: 'marble' as const, riserMaterial: 'marble_veined' as const, topWalk: 3.5, detail: 'low' as const };
  let rows = Math.max(9, Math.floor((avail - 3.5 - 2.2 - 3.2) / 0.7));
  let reach = caveaSection({ arenaRx: ax, arenaRz: az, ...base, tiers: tiersFor(rows) }).reach;
  while (reach > avail && rows > 9) reach = caveaSection({ arenaRx: ax, arenaRz: az, ...base, tiers: tiersFor(--rows) }).reach;
  // The arena takes up the slack so the back of the cavea meets the inner wall on both axes.
  ax = inner(rx) - reach;
  az = inner(rz) - reach;
  return {
    // Engaged columns as 8-sided prisms: 80 bays × 4 storeys of 'low' columns alone are ~120k triangles.
    facade: { rx, rz, bays, storeys, depth, corridor, material: 'travertine', detail: 'low', columnDetail: 'far', masts: H > 20 },
    cavea: { arenaRx: ax, arenaRz: az, ...base, tiers: tiersFor(rows) },
  };
}

function buildAmphitheatre(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = new MeshBuilder();
  const { w, d: dd } = dims(ctx);
  const H = heightG(ctx, 8);
  const spots: Spot[] = [];
  const h = hintsOf(lm);
  const m = h.text.match(/arena\s+(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/);
  const arches = h.text.match(/facade of (\d+) arches|(\d+) arches/);
  const spec = fitAmphitheatre(w / 2, dd / 2, H, ctx.S, m ? [Number(m[1]), Number(m[2])] : null, detail, arches ? Number(arches[1] ?? arches[2]) : undefined);
  // Footing under the whole ellipse down to the lowest ground round it.
  const gr = groundRange(ctx, -w / 2, -dd / 2, w / 2, dd / 2, 6);
  if (gr.min < -0.05) d.geo(new THREE.CylinderGeometry(1, 1, 0.6 - gr.min, 40), 'travertine', 0, (gr.min - 0.6) / 2 + 0.02, 0, { sx: w / 2 + 0.3, sz: dd / 2 + 0.3 });
  const res = amphitheatre(d.b, spec, d.m);
  amphitheatreFar(far, { ...spec, cavea: { ...spec.cavea, topPortico: { order: 'corinthian', columnHeight: 6 } } });
  // Porticus in summa cavea: a lite colonnade on the top walk, facing the arena, roofed to the facade.
  const c = spec.cavea;
  const ring: V3[] = [];
  const nr = detail === 'high' ? 96 : 64;
  const off = res.cavea.reach - 3.5 + 0.9;
  for (let i = nr; i >= 0; i--) {
    const t = (i / nr) * Math.PI * 2;
    const ex = c.arenaRx * Math.cos(t), ez = c.arenaRz * Math.sin(t);
    const nx = c.arenaRz * Math.cos(t), nz = c.arenaRx * Math.sin(t), nl = Math.hypot(nx, nz);
    ring.push(V(ex + (nx / nl) * off, 0, ez + (nz / nl) * off));
  }
  liteColonnade(d, ring, { columnHeight: Math.min(6.5, Math.max(3, res.facade.height - res.cavea.height - 1.6)), spacing: 2.6, depth: 3.2, back: 'none', closed: true, material: 'marble', detail, order: 'corinthian', y: res.cavea.height, stylobate: 0.15 });
  for (const e of res.entrances) if (e.kind === 'gate') spots.push(spot(`${lm.id}:gate${e.bay}`, 'door', e.x + e.nx * 2.5, 0, e.z + e.nz * 2.5, Math.atan2(-e.nx, -e.nz)));
  spots.push(
    spot(`${lm.id}:entrance`, 'door', 0, 0, -dd / 2 - 1.5, 0),
    spot(`${lm.id}:arena`, 'npc', 0, 0.04, 0, 0),
    spot(`${lm.id}:topwalk`, 'vista', 0, res.cavea.height, -(spec.cavea.arenaRz + res.cavea.reach - 1.5), 0),
  );
  return { object: d.b.build(lm.id), colliders: d.b.colliders, spots, far: far.build(`${lm.id}:far`), cullDistance: 420 };
}

/** A free-standing obelisk on a moulded base at local (x, z) — for spinae and forecourts. */
export function obeliskAt(d: Draw, x: number, y: number, z: number, height: number, detail: Detail, glyphs = true, ball = false) {
  obelisk(d.b, { height, hieroglyphs: glyphs, detail, gildedTip: !ball }, mul(d.m, T(x, y, z)));
  if (ball) {
    const ped = 0.22 * height;
    d.ellipsoid('gilded_bronze', x, y + ped + height + 0.5, z, 0.7, 0.7, 0.7, { seg: [12, 8] });
  }
}

export const builders: LandmarkBuilder[] = liftAll([
  { handles: ['category:theatre'], build: buildTheatre },
  { handles: ['category:odeum'], build: buildTheatre },
  { handles: ['category:stadium'], build: buildStadium },
  { handles: ['category:circus'], build: buildCircus },
  { handles: ['category:amphitheatre'], build: buildAmphitheatre },
]);

export { arc, LANDMARKS, type Order };
