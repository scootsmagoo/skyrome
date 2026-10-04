/**
 * Shared toolkit for the generic category builders (generic-*.ts) and the Campus Martius heroes
 * (campus-*.ts): reading hints out of the atlas text, footprint sizes in game metres, foundations
 * that follow sloping ground, human-scale flights of steps, tiled roofs, crenellated walls, cheap
 * trees, statues on pedestals, basins, railings, spots and far stand-ins.
 *
 * Everything works in the landmark's LOCAL frame (facade towards −z, y = 0 the pad) through a
 * fabric `Draw` (a MeshBuilder plus a frame), so parts merge per material and colliders follow.
 * Monumental dimensions arrive in REAL metres and are scaled by ctx.S; steps, doors, parapets and
 * seats stay 1:1.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LANDMARK_BY_ID, LANDMARKS } from '../../../data/atlas';
import { Draw } from '../../../arch/fabric/draw';
import { roof as tileRoof } from '../../../arch/fabric/roof';
import { wall as fabricWall } from '../../../arch/fabric/wall';
import { footprintPolygon } from '../../terrain/heightmap';
import { footprintRadius } from '../footprint';
import { stairs } from '../../../arch/common/stairs';
import { T, TRS, mul } from '../../../arch/common/geom';
import { inscriptionPanel } from '../../../arch/common/inscription';
import { armoredEmperor, equestrian, seatedDeity, togate } from '../../../arch/classical/statues';
import type { Order } from '../../../arch/classical/orders';
import type { TemplePlan } from '../../../arch/classical/temple';
import { MATERIAL_BASE, type MaterialId } from '../../../gfx/materialIds';
import { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, LandmarkData, Spot } from '../types';

/** This file only exports helpers; the registry glob still imports it, so give it an empty list. */
export const builders: LandmarkBuilder[] = [];

export type Detail = 'high' | 'low';
export type V3 = THREE.Vector3;
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- atlas text → hints

export interface Hints {
  /** Lower-case name + description + builder notes (+ dates). */
  text: string;
  order?: Order;
  /** Columns across the front (tetrastyle → 4 …). */
  front?: number;
  plan?: TemplePlan;
  dipteral: boolean;
  round: boolean;
  /** Republican fabric (stucco over tufa / peperino, terracotta), not rebuilt in marble. */
  republican: boolean;
  gilded: boolean;
  /** Dominant facing material named in the notes. */
  material?: MaterialId;
  has(...words: string[]): boolean;
}

const COUNT_WORDS: Record<string, number> = { tetrastyle: 4, hexastyle: 6, octastyle: 8, decastyle: 10 };

/** Pure: reads order, plan, column count and fabric from an atlas record's text. */
export function parseHints(lm: Pick<LandmarkData, 'name' | 'description' | 'builderNotes'> & { dates?: string }): Hints {
  const dates = (lm.dates ?? '').toLowerCase();
  const text = `${lm.name} ${lm.description} ${lm.builderNotes}`.toLowerCase();
  // Words match at a word start ('hut' must not fire on 'shuttered'); they may end mid-word ('gild').
  const has = (...words: string[]) => words.some((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text));
  let order: Order | undefined;
  for (const o of ['composite', 'corinthian', 'ionic', 'doric', 'tuscan'] as Order[]) {
    if (text.includes(o)) {
      order = o;
      break;
    }
  }
  let front: number | undefined;
  for (const [w, n] of Object.entries(COUNT_WORDS)) if (text.includes(w)) front = n;
  let plan: TemplePlan | undefined;
  if (text.includes('pseudoperipteral') || text.includes('pseudo-peripteral')) plan = 'pseudoperipteral';
  else if (text.includes('sine postico')) plan = 'sine_postico';
  else if (text.includes('peripteral') || text.includes('peripteros') || text.includes('dipteral')) plan = 'peripteral';
  else if (text.includes('prostyle')) plan = 'prostyle';
  const dipteral = text.includes('dipteral');
  const round = /\bround\b|tholos|circular|rotunda/.test(text);
  const bc = /\bbc\b/.test(dates) || /\bbc\b/.test(text.match(/\b\d{2,3} bc\b/)?.[0] ?? '');
  const rebuilt = /augustus|augustan|domitian|tiberius|imperial|marble|rebuilt|restored/.test(dates + ' ' + lm.builderNotes.toLowerCase());
  const republican = bc && !rebuilt;
  const gilded = has('gilded', 'gilt');
  let material: MaterialId | undefined;
  if (has('peperino')) material = 'peperino';
  else if (has('travertine')) material = 'travertine';
  else if (has('tufa')) material = 'tufa';
  else if (has('brick')) material = 'brick';
  else if (has('marble')) material = 'marble';
  return { text, order, front, plan, dipteral, round, republican, gilded, material, has };
}

export function hintsOf(lm: LandmarkData): Hints {
  const full = LANDMARK_BY_ID[lm.id] as { dates?: string } | undefined;
  return parseHints({ ...lm, dates: full?.dates });
}

/** The atlas `siting` ('pad' | 'slope' | 'open' | 'underground'); not part of LandmarkData. */
export function sitingOf(lm: LandmarkData): string {
  return (lm as { siting?: string }).siting ?? 'pad';
}

/** Landmarks whose `within` is this one (temples inside fora, obelisks on spinae…). */
export function children(lm: LandmarkData) {
  return LANDMARKS.filter((l) => l.within === lm.id);
}

// ---------------------------------------------------------------- footprint

/** Footprint extent in GAME metres in the local frame (x across the facade, z deep). */
export function dims(ctx: LandmarkContext): { w: number; d: number } {
  const fp = ctx.lm.footprint;
  const S = ctx.S;
  if (fp.kind === 'rect') return { w: fp.w * S, d: fp.d * S };
  if (fp.kind === 'circle') return { w: 2 * fp.r * S, d: 2 * fp.r * S };
  if (fp.kind === 'ellipse') return { w: 2 * fp.rx * S, d: 2 * fp.rz * S };
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const th = (ctx.lm.rotation * Math.PI) / 180;
  for (const [px, pz] of fp.points) {
    const dx = px - ctx.lm.center[0], dz = pz - ctx.lm.center[1];
    const lx = dx * Math.cos(th) + dz * Math.sin(th), lz = -dx * Math.sin(th) + dz * Math.cos(th);
    x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); z0 = Math.min(z0, lz); z1 = Math.max(z1, lz);
  }
  return { w: (x1 - x0) * S, d: (z1 - z0) * S };
}

/** Height above the pad in game metres (at least `min`). */
export function heightG(ctx: LandmarkContext, min = 3) {
  return Math.max(min, ctx.lm.height * ctx.S);
}

/** Lowest / highest ground under a local rectangle (relative to the pad), sampled on a grid. */
export function groundRange(ctx: LandmarkContext, x0: number, z0: number, x1: number, z1: number, n = 4): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const g = ctx.groundAt(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * j) / n);
      min = Math.min(min, g);
      max = Math.max(max, g);
    }
  }
  return { min, max };
}

/**
 * A solid masonry plinth under a rectangle from just below the lowest ground up to `top`, so the
 * building never floats where the terrain falls away. Returns the lowest ground found.
 */
export function plinth(d: Draw, ctx: LandmarkContext, x0: number, z0: number, x1: number, z1: number, top: number, mat: MaterialId = 'travertine', collide = true): number {
  const g = groundRange(ctx, x0, z0, x1, z1).min;
  const bottom = Math.min(top - 0.25, g - 0.4);
  d.span(mat, x0, bottom, z0, x1, top, z1, { collide });
  return g;
}

// ---------------------------------------------------------------- stairs

/**
 * A human-scale flight (risers ≤ 0.22 m, treads 0.34 m) climbing from y0 to y1 towards +z in the
 * frame `d`, its foot at z0 and centred on x. Returns the z of the top step.
 */
export function flight(d: Draw, x: number, z0: number, width: number, y0: number, y1: number, mat: MaterialId = 'travertine'): number {
  const h = y1 - y0;
  if (h <= 0.05) return z0;
  const { count, rise } = flightSteps(h);
  const run = 0.34;
  stairs(d.b, { width, rise, run, count, material: mat }, mul(d.m, T(x, y0, z0)));
  return z0 + count * run;
}

/** Pure: steps for a rise of h — never a riser over 0.21 m (the player's capsule climbs ~0.26). */
export function flightSteps(h: number): { count: number; rise: number } {
  const count = Math.max(1, Math.ceil(h / 0.21 - 1e-9));
  return { count, rise: h / count };
}

/** Length of a flight for a rise (for layout). */
export function flightLength(h: number): number {
  if (h <= 0.05) return 0;
  return flightSteps(h).count * 0.34;
}

// ---------------------------------------------------------------- neighbours

/**
 * Footprints of the other solid landmarks that reach into this one, as polygons in this landmark's
 * LOCAL game frame, grown by `margin` game metres. Open areas (gardens, districts) are skipped, so a
 * garden avoids the temple inside it but not the neighbouring garden.
 */
export function obstacles(ctx: LandmarkContext, margin = 2): [number, number][][] {
  const { lm, S } = ctx;
  const R = footprintRadius(lm);
  const th = (lm.rotation * Math.PI) / 180;
  const c = Math.cos(th), s = Math.sin(th);
  const out: [number, number][][] = [];
  for (const o of LANDMARKS) {
    if (o.id === lm.id || o.siting === 'open' || o.category === 'aqueduct') continue;
    if (Math.hypot(o.center[0] - lm.center[0], o.center[1] - lm.center[1]) > R + footprintRadius(o as LandmarkData) + margin / S) continue;
    const poly = footprintPolygon(o.center, o.rotation, o.footprint, margin / S);
    // World real → local real (inverse of footprintPolygon's rotation), then to game metres.
    out.push(poly.map(([x, z]) => {
      const dx = x - lm.center[0], dz = z - lm.center[1];
      return [(dx * c + dz * s) * S, (-dx * s + dz * c) * S] as [number, number];
    }));
  }
  return out;
}

/** Pure: point-in-polygon (even-odd). */
export function insidePoly(x: number, z: number, poly: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** A predicate that is true where (x, z) is clear of every obstacle polygon. */
export function clearOf(obs: [number, number][][]): (x: number, z: number, r?: number) => boolean {
  return (x, z, r = 0) => !obs.some((p) => insidePoly(x, z, p) || (r > 0 && (insidePoly(x + r, z, p) || insidePoly(x - r, z, p) || insidePoly(x, z + r, p) || insidePoly(x, z - r, p))));
}

// ---------------------------------------------------------------- walls and roofs

export interface WallOpening {
  /** Centre, measured along the wall from its start point. */
  x: number;
  w: number;
  h: number;
  /** Bottom above the wall's floor level (0 = a door). */
  sill?: number;
  arched?: boolean;
  fill?: MaterialId;
}

/**
 * A wall from (ax, az) to (bx, bz) whose outer face looks along the right-hand normal (dz, 0, −dx)
 * of a→b and whose thickness runs inward, pierced by real openings (fabric `wall`, so reveals have
 * depth). `floor` is the walking level at the wall; the masonry starts 0.5 m below it. Box colliders
 * leave the doorways open.
 */
export function piercedWall(d: Draw, ax: number, az: number, bx: number, bz: number, floor: number, top: number, t: number, mat: MaterialId, openings: WallOpening[] = [], collide = true) {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.05 || top <= floor) return;
  const f = d.at(ax, 0, az, Math.atan2(-(bz - az), bx - ax));
  const y0 = floor - 0.5;
  const ops = openings.map((o) => {
    const sill = floor + (o.sill ?? 0);
    return { x0: o.x - o.w / 2, x1: o.x + o.w / 2, y0: sill, y1: sill + o.h, arch: o.arched ? o.w / 2 : 0, fill: o.fill };
  });
  const cut = fabricWall(f, mat, 0, len, y0, top, t, ops);
  if (!collide) return;
  const doors = cut.filter((o) => o.y0 <= floor + 0.35).sort((p, q) => p.x0 - q.x0);
  let x = 0;
  for (const o of doors) {
    if (o.x0 > x + 0.05) f.solid(x, y0, 0, o.x0, top, t);
    f.solid(o.x0, o.y1 - (o.arch ?? 0) * 0.3, 0, o.x1, top, t);
    x = o.x1;
  }
  if (len > x + 0.05) f.solid(x, y0, 0, len, top, t);
}

/**
 * A wall that follows the terrain between two points: split into segments of about `seg` m, each
 * standing from below the local ground to `h` above it (garden walls, camp walls on slopes).
 */
export function groundWall(d: Draw, ctx: LandmarkContext, ax: number, az: number, bx: number, bz: number, h: number, t: number, mat: MaterialId, seg = 6, gaps: [number, number][] = []) {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.round(len / seg));
  for (let k = 0; k < n; k++) {
    const s0 = (len * k) / n, s1 = (len * (k + 1)) / n;
    // Skip the parts that fall in a gap (gateways), trimming partial overlaps.
    let a = s0, b = s1;
    for (const [g0, g1] of gaps) {
      if (g0 <= a && g1 >= b) { a = b; break; }
      if (g0 > a && g0 < b) b = Math.min(b, g0);
      if (g1 > a && g1 < b) a = Math.max(a, g1);
    }
    if (b - a < 0.2) continue;
    const x0 = ax + ((bx - ax) * a) / len, z0 = az + ((bz - az) * a) / len;
    const x1 = ax + ((bx - ax) * b) / len, z1 = az + ((bz - az) * b) / len;
    const g0 = ctx.groundAt(x0, z0), g1 = ctx.groundAt(x1, z1), gm = ctx.groundAt((x0 + x1) / 2, (z0 + z1) / 2);
    const lo = Math.min(g0, g1, gm), hi = Math.max(g0, g1, gm);
    wallRun(d, x0, z0, x1, z1, lo - 0.6, hi + h, t, mat);
  }
}

/** A straight wall slab between two points in the frame (any direction), with a box collider. */
export function wallRun(d: Draw, ax: number, az: number, bx: number, bz: number, y0: number, y1: number, t: number, mat: MaterialId, collide = true) {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.01 || y1 <= y0) return;
  const ry = Math.atan2(-(bz - az), bx - ax);
  d.box(mat, (ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2, len + t * 0.98, y1 - y0, t, { ry, collide });
}

/**
 * Ashlar coursing on a wall face along x (from x0 to x1, y0 to y1) whose surface is the plane z,
 * facing `face` (−1: towards −z). Blocks stand 4 cm proud of the core, 2.5 cm short of their
 * neighbours, so the joints read as fine shadow lines; courses alternate stretchers (≈ 1.3 m) and
 * headers (≈ 0.6 m) as in the Servian wall (0.6 m = 2 Roman feet, kept 1:1). Blocks overlapping a
 * `hole` (an arch opening, below its y1) are left out.
 */
export function ashlarFace(d: Draw, x0: number, x1: number, y0: number, y1: number, z: number, face: -1 | 1, mat: MaterialId, rng: { range(a: number, b: number): number }, holes: { x0: number; x1: number; y1: number }[] = [], course = 0.58) {
  const proud = 0.04, gap = 0.025;
  const rows = Math.max(1, Math.round((y1 - y0) / course));
  const c = (y1 - y0) / rows;
  for (let r = 0; r < rows; r++) {
    const ya = y0 + r * c;
    const len = r % 2 ? 0.62 : 1.32;
    let x = x0 - (r % 2 ? 0 : rng.range(0, len * 0.5));
    while (x < x1 - 0.05) {
      const l = r % 2 ? len : len * rng.range(0.85, 1.2);
      const a = Math.max(x0, x), b = Math.min(x1, x + l);
      x += l;
      if (b - a < 0.15) continue;
      if (holes.some((h) => b > h.x0 && a < h.x1 && ya < h.y1)) continue;
      // Slight random relief so a whole face doesn't look stamped.
      const p = proud * rng.range(0.6, 1.25);
      d.span(mat, a + gap, ya + gap, z, b - gap, ya + c - gap, z + face * p);
    }
  }
}

/** Merlons along a wall top between two points. */
export function crenellations(d: Draw, ax: number, az: number, bx: number, bz: number, y: number, t: number, mat: MaterialId, merlon = 1.0, gap = 0.8, h = 1.0) {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.floor(len / (merlon + gap)));
  const ry = Math.atan2(-(bz - az), bx - ax);
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    d.box(mat, ax + (bx - ax) * f, y + h / 2, az + (bz - az) * f, Math.min(merlon, step * 0.6), h, t, { ry });
  }
}

/** Tiled roof over a local rectangle (wall line centred at cx, cz). */
export function tiledRoof(d: Draw, kind: 'hip' | 'gable' | 'shed', cx: number, cz: number, w: number, dd: number, y: number, detail: Detail, opts: { axis?: 'x' | 'z'; pitchDeg?: number; wallMat?: MaterialId; overhang?: number; topMat?: MaterialId } = {}) {
  return tileRoof(d.at(cx, 0, cz), {
    kind,
    w,
    d: dd,
    y,
    pitch: ((opts.pitchDeg ?? 18) * Math.PI) / 180,
    overhang: opts.overhang ?? 0.5,
    ridges: detail === 'high' && w * dd < 4000,
    axis: opts.axis,
    wallMat: opts.wallMat,
    topMat: opts.topMat,
  });
}

/** Ring roof (courtyard building): wall line w × d, opening wi × di. */
export function ringRoof(d: Draw, cx: number, cz: number, w: number, dd: number, wi: number, di: number, y: number, detail: Detail) {
  return tileRoof(d.at(cx, 0, cz), { kind: 'ring', w, d: dd, y, inner: { w: wi, d: di }, pitch: (18 * Math.PI) / 180, ridges: detail === 'high' && w * dd < 3000 });
}

/** A moulded cornice band round a rectangle at height y. */
export function cornice(d: Draw, x0: number, z0: number, x1: number, z1: number, y: number, h: number, out: number, mat: MaterialId) {
  d.span(mat, x0 - out, y, z0 - out, x1 + out, y + h, z0 + 0.3);
  d.span(mat, x0 - out, y, z1 - 0.3, x1 + out, y + h, z1 + out);
  d.span(mat, x0 - out, y, z0, x0 + 0.3, y + h, z1);
  d.span(mat, x1 - 0.3, y, z0, x1 + out, y + h, z1);
}

/** Row of arched dark window openings painted on a wall face (cheap, for far or big walls). */
export function windowRow(d: Draw, x0: number, x1: number, y: number, h: number, w: number, spacing: number, z: number, faceDir: 1 | -1 = -1) {
  const n = Math.max(1, Math.floor((x1 - x0) / spacing));
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 0.5) * (x1 - x0)) / n;
    d.span('black', x - w / 2, y, z + faceDir * 0.02, x + w / 2, y + h, z + faceDir * 0.06);
  }
}

// ---------------------------------------------------------------- greenery stand-ins (integral to monuments)

/** A cypress: narrow dark flame on a short trunk (low-poly, merged). */
export function cypress(d: Draw, x: number, y: number, z: number, h: number, detail: Detail) {
  const seg = detail === 'high' ? 7 : 5;
  d.cyl('bark', x, y + h * 0.06, z, h * 0.025, h * 0.12, 5);
  d.cyl('foliage_cypress', x, y + h * 0.1 + h * 0.36, z, h * 0.11, h * 0.72, seg, { rTop: h * 0.035 });
  d.cyl('foliage_cypress', x, y + h * 0.86, z, h * 0.035, h * 0.28, seg, { rTop: 0.02 });
}

/** An umbrella pine / plane-like broad tree stand-in. */
export function broadTree(d: Draw, x: number, y: number, z: number, h: number, detail: Detail, kind: 'pine' | 'plane' = 'plane') {
  const seg = detail === 'high' ? 8 : 5;
  if (kind === 'pine') {
    d.cyl('bark', x, y + h * 0.35, z, h * 0.035, h * 0.7, 6, { rTop: h * 0.025 });
    d.ellipsoid('foliage_pine', x, y + h * 0.82, z, h * 0.42, h * 0.16, h * 0.42, { seg: [seg + 2, 4] });
  } else {
    d.cyl('bark', x, y + h * 0.25, z, h * 0.04, h * 0.5, 6, { rTop: h * 0.03 });
    d.ellipsoid('foliage_broad', x, y + h * 0.65, z, h * 0.3, h * 0.32, h * 0.3, { seg: [seg + 1, 5] });
  }
  d.solidCyl(x, y + h * 0.3, z, h * 0.05, h * 0.6);
}

/** Box hedge strip. */
export function hedge(d: Draw, x0: number, z0: number, x1: number, z1: number, y: number, h = 0.8) {
  d.span('foliage_broad', x0, y, z0, x1, y + h, z1);
}

// ---------------------------------------------------------------- sculpture, altars, basins

export type StatueKind = 'togate' | 'emperor' | 'seated' | 'equestrian';

/** A statue on a moulded pedestal; `scale` 1 = life size. Faces −z of its own rotation. */
export function statueOnPedestal(d: Draw, kind: StatueKind, x: number, y: number, z: number, rotY: number, scale: number, mat: MaterialId, detail: Detail, pedH = 1.4, pedMat: MaterialId = 'marble') {
  const pw = kind === 'equestrian' ? 1.2 * scale : 0.9 * scale;
  const pd = kind === 'equestrian' ? 2.9 * scale : 0.9 * scale;
  const f = d.at(x, y, z, rotY);
  f.box(pedMat, 0, pedH * 0.06, 0, pw + 0.3, pedH * 0.12, pd + 0.3);
  f.box(pedMat, 0, pedH / 2, 0, pw, pedH, pd, { collide: true });
  f.box(pedMat, 0, pedH - pedH * 0.05, 0, pw + 0.18, pedH * 0.1, pd + 0.18);
  const m = mul(f.m, TRS(0, pedH, 0, 0, 0, 0, scale));
  const opts = { material: mat, detail, plinth: false } as const;
  if (kind === 'togate') togate(d.b, m, opts);
  else if (kind === 'emperor') armoredEmperor(d.b, m, opts);
  else if (kind === 'seated') seatedDeity(d.b, m, opts);
  else equestrian(d.b, m, { ...opts, pedestal: 0 });
}

/** A moulded altar block (ara) with bolsters, on a step. */
export function altar(d: Draw, x: number, y: number, z: number, w: number, l: number, h: number, mat: MaterialId = 'marble', rotY = 0) {
  const f = d.at(x, y, z, rotY);
  f.box(mat, 0, 0.1, 0, w + 0.6, 0.2, l + 0.6, { collide: true });
  f.box(mat, 0, 0.2 + 0.08, 0, w + 0.2, 0.16, l + 0.2);
  f.box(mat, 0, 0.2 + h / 2, 0, w, h, l, { collide: true });
  f.box(mat, 0, 0.2 + h - 0.06, 0, w + 0.18, 0.14, l + 0.18);
  for (const sx of [-1, 1]) f.cyl(mat, (sx * w) / 2 - sx * 0.12, 0.2 + h + 0.1, 0, 0.12, l, 8, { rx: Math.PI / 2 });
}

/** Rectangular pool: kerb, sunken water surface. */
export function pool(d: Draw, cx: number, y: number, cz: number, w: number, l: number, mat: MaterialId = 'marble', kerb = 0.45, depth = 0.4) {
  const t = 0.4;
  d.span(mat, cx - w / 2, y, cz - l / 2, cx + w / 2, y + kerb, cz - l / 2 + t, { collide: true });
  d.span(mat, cx - w / 2, y, cz + l / 2 - t, cx + w / 2, y + kerb, cz + l / 2, { collide: true });
  d.span(mat, cx - w / 2, y, cz - l / 2, cx - w / 2 + t, y + kerb, cz + l / 2, { collide: true });
  d.span(mat, cx + w / 2 - t, y, cz - l / 2, cx + w / 2, y + kerb, cz + l / 2, { collide: true });
  d.span(mat, cx - w / 2 + t, y - depth, cz - l / 2 + t, cx + w / 2 - t, y + 0.02, cz + l / 2 - t);
  d.span('water', cx - w / 2 + t, y + kerb - 0.15, cz - l / 2 + t, cx + w / 2 - t, y + kerb - 0.12, cz + l / 2 - t);
}

/** Round basin with water (fountains, labra). */
export function roundBasin(d: Draw, cx: number, y: number, cz: number, r: number, mat: MaterialId = 'marble', kerb = 0.5, detail: Detail = 'high') {
  const seg = detail === 'high' ? 24 : 12;
  d.cyl(mat, cx, y + kerb / 2, cz, r, kerb, seg, { open: false });
  d.cyl('water', cx, y + kerb + 0.005, cz, r - 0.25, 0.02, seg);
  d.solidCyl(cx, y + kerb / 2, cz, r, kerb);
}

/** An iron railing along a polyline. */
export function railing(d: Draw, pts: [number, number][], y: number, h = 1.1, closed = false, ground?: (x: number, z: number) => number) {
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    const len = Math.hypot(bx - ax, bz - az);
    const k = Math.max(1, Math.round(len / 0.5));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const g = ground ? ground(x, z) : y;
      d.cyl('iron', x, g + h / 2, z, 0.018, h, 4);
    }
    const ga = ground ? ground(ax, az) : y;
    const gb = ground ? ground(bx, bz) : y;
    d.rod('iron', V(ax, ga + h - 0.05, az), V(bx, gb + h - 0.05, bz), 0.025, 4);
    d.rod('iron', V(ax, ga + 0.12, az), V(bx, gb + 0.12, bz), 0.02, 4);
    // Collider only (an invisible slab along the rail).
    d.at((ax + bx) / 2, 0, (az + bz) / 2, Math.atan2(-(bz - az), bx - ax)).solid(-len / 2, Math.min(ga, gb), -0.06, len / 2, Math.max(ga, gb) + h, 0.06);
  }
}

/** A carved inscription panel standing proud of a wall face (front facing −z at z). */
export function inscription(d: Draw, lines: string[], x: number, y: number, z: number, w: number, h: number, rotY = 0, style: 'carved' | 'bronze' | 'painted' = 'carved') {
  inscriptionPanel(d.b, { lines, width: w, height: h, style }, mul(d.m, TRS(x, y, z, 0, rotY, 0)), { depth: 0.1 });
}

// ---------------------------------------------------------------- spots

/** Spot in local coordinates; heading uses the +Z model convention (π faces the facade, −z). */
export function spot(id: string, kind: string, x: number, y: number, z: number, heading = Math.PI): Spot {
  return { id, kind, position: new THREE.Vector3(x, y, z), heading };
}

// ---------------------------------------------------------------- far stand-ins

/** Start a far stand-in (cheap massing shown beyond the cull distance). */
export function farDraw(): Draw {
  return new Draw(new MeshBuilder()).flatWalls();
}

/**
 * Package a landmark build. The near mesh is swapped for a far stand-in beyond ~600 m: the given
 * `far` massing, or — for small landmarks without one — the near mesh itself; either way baked into
 * ONE vertex-coloured mesh (`bakeFar`), so a whole-city view costs one draw call per landmark.
 */
export function finish(name: string, d: Draw, spots: Spot[] = [], far?: Draw, cullDistance?: number): LandmarkBuild {
  const object = d.b.build(name);
  let farObj: THREE.Object3D | undefined;
  let cull = cullDistance;
  if (far) {
    farObj = bakeFar(far.b.build(`${name}:far`), `${name}:far`);
    cull = Math.min(cullDistance ?? FAR_SWAP, FAR_SWAP);
  } else if (d.b.triangleCount < AUTO_FAR_MAX) {
    // Same geometry, flat colours: the swap is invisible a few hundred metres out.
    farObj = bakeFar(object, `${name}:far`);
    cull = Math.min(cullDistance ?? AUTO_FAR_SWAP, AUTO_FAR_SWAP);
  }
  return { object, colliders: d.b.colliders, spots, far: farObj, cullDistance: cull };
}

/** Landmarks below this many triangles get their own near mesh, baked, as the far stand-in... */
const AUTO_FAR_MAX = 30000;
/** ...swapped in from this distance. */
const AUTO_FAR_SWAP = 260;

let farMat: THREE.MeshStandardMaterial | null = null;
/** Shared flat-shaded vertex-colour material for baked far stand-ins (sRGB byte colours decoded in the shader). */
export function farMaterial(): THREE.MeshStandardMaterial {
  if (farMat) return farMat;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0 });
  m.name = 'landmark:far';
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_COLOR
  vColor.rgb = pow(vColor.rgb, vec3(2.2));
#endif`);
  };
  m.customProgramCacheKey = () => 'landmark:far';
  farMat = m;
  return m;
}

/**
 * Bake every mesh of `obj` (instanced ones expanded) into one geometry with per-vertex MATERIAL_BASE
 * colours (or the material's own colour for one-off textured parts), in `obj`'s local frame.
 */
export function bakeFar(obj: THREE.Object3D, name: string): THREE.Mesh {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const pos: number[] = [];
  const col: number[] = [];
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const im = new THREE.Matrix4();
  const c = new THREE.Color();
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const id = mat?.name as MaterialId;
    if (id === 'glow_fire' || id === 'water') return;
    const base = (MATERIAL_BASE as Record<string, { color: number }>)[id];
    if (base) c.setHex(base.color);
    else if (mat?.color) c.copy(mat.color).convertLinearToSRGB();
    else c.setHex(0x9a9a9a);
    const r = Math.round(c.r * 255), g = Math.round(c.g * 255), b = Math.round(c.b * 255);
    const geo = mesh.geometry;
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const idx = geo.index;
    const n = idx ? idx.count : p.count;
    const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
    const count = inst ? inst.count : 1;
    for (let k = 0; k < count; k++) {
      m.multiplyMatrices(inv, mesh.matrixWorld);
      if (inst) {
        inst.getMatrixAt(k, im);
        m.multiply(im);
      }
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(p, idx ? idx.getX(i) : i).applyMatrix4(m);
        pos.push(v.x, v.y, v.z);
        col.push(r, g, b);
      }
    }
  });
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(col), 3, true));
  // No normals (flat shading from derivatives): vertices weld across faces, ~10 bytes a triangle.
  if (pos.length) geo = mergeVertices(geo, 1e-3);
  geo.computeBoundingSphere();
  const out = new THREE.Mesh(geo, farMaterial());
  out.name = name;
  out.castShadow = false;
  out.receiveShadow = true;
  return out;
}

/** Distance (m, from the landmark's bounding sphere) beyond which a far stand-in replaces it. */
export const FAR_SWAP = 450;

/** Fresh drawing frame for a landmark. */
export function draw(ctx: LandmarkContext): Draw {
  return new Draw(ctx.builder());
}

// ---------------------------------------------------------------- swept paths

/** Point, unit tangent and right-hand normal (dz, 0, −dx) at arc length s along a polyline. */
export function along(path: V3[], s: number): { p: V3; t: V3; n: V3 } {
  let acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const L = a.distanceTo(b);
    if (acc + L >= s || i === path.length - 2) {
      const f = L > 0 ? Math.min(1, Math.max(0, (s - acc) / L)) : 0;
      const t = b.clone().sub(a).normalize();
      return { p: a.clone().lerp(b, f), t, n: V(t.z, 0, -t.x) };
    }
    acc += L;
  }
  const t = V(1, 0, 0);
  return { p: path[0].clone(), t, n: V(0, 0, -1) };
}

export function pathLength(path: V3[]): number {
  let L = 0;
  for (let i = 0; i < path.length - 1; i++) L += path[i].distanceTo(path[i + 1]);
  return L;
}

/** Arc of points around (cx, cz) from angle a0 to a1 (x = cos, z = sin), n segments. */
export function arc(cx: number, cz: number, r: number, a0: number, a1: number, n: number, y = 0): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(V(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
  }
  return out;
}

/** Offset a polyline sideways by `off` along its right-hand normal (mitred). */
export function offsetLine(path: V3[], off: number): V3[] {
  return path.map((p, i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    const t = b.clone().sub(a).normalize();
    let n = V(t.z, 0, -t.x);
    if (i > 0 && i < path.length - 1) {
      const t0 = p.clone().sub(path[i - 1]).normalize(), t1 = path[i + 1].clone().sub(p).normalize();
      const n0 = V(t0.z, 0, -t0.x), n1 = V(t1.z, 0, -t1.x);
      n = n0.clone().add(n1).normalize();
      n.divideScalar(Math.max(0.3, n.dot(n0)));
    }
    return p.clone().addScaledVector(n, off);
  });
}

/** Matrix for a frame at `p` with x along tangent t, −z along normal n (so "facade" faces n). */
export function frameAt(p: V3, t: V3, n: V3): THREE.Matrix4 {
  const z = n.clone().negate();
  return new THREE.Matrix4().makeBasis(t.clone(), V(0, 1, 0), z).setPosition(p);
}

export { T, TRS, mul };
