/**
 * Street geometry for the city plan, as lazily built work items grouped by merge cell:
 *
 * - atlas roads: basalt carriageways between travertine curbs and raised sidewalks where they run
 *   between blocks, flush paving across fora and open ground, plain basalt / gravel / dirt outside
 *   the city, flights of steps for the scalae; road crossings get a paved junction square and the
 *   roads stop at its edge (streets must not overlap);
 * - minor streets: paved vici with narrow sidewalks, cobbled or basalt lanes, gravel / dirt alleys,
 *   and flights of steps where a street climbs the fall line;
 * - piazzas: a small paved square with a lacus fountain or a compital shrine, and benches.
 *
 * Every item writes into the MeshBuilder of its cell (world coordinates); the streamer builds a
 * cell's items when the camera comes near and drops them again far away.
 */
import * as THREE from 'three';
import { Rng } from '../../core/Rng';
import { withAuditSource } from '../../dev/audit/geomAudit';
import { buildPlaza, buildStairs, buildStreet, type StreetSpec } from '../../arch/fabric/streets';
import { Draw } from '../../arch/fabric/draw';
import { compitalShrine } from '../../arch/fabric/shrines';
import { lacus } from '../../arch/fabric/fountain';
import { velum } from '../../arch/fabric/awnings';
import { groundIn, placeProp } from '../../arch/props/props';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { Polygon, Vec2 } from '../../arch/fabric/types';
import { KERB } from '../../core/traversal';
import { LIFT } from './datum';
import { K, distToPoly, polyBounds, pointInPoly } from './raster';
import { inRects, rectsBounds, type Bounds, type CityPlan, type PlanRoad, type PlanStreet, type PlanPiazza } from './plan';
import type { HeightFn } from './massing';
import type { LampDef } from './life';

export type WorkItem = (b: MeshBuilder) => void;

export interface CellWork {
  key: string;
  cx: number;
  cz: number;
  /** Street surfaces and ground cover (built within the streamer's cell range). */
  items: WorkItem[];
  /** Street furniture and props (built only close to the camera). */
  detail: WorkItem[];
}

export interface StreetSpotDef {
  id: string;
  kind: 'fountain' | 'shrine' | 'bench' | 'stall' | 'container';
  position: THREE.Vector3;
  heading: number;
  tag?: string;
}

export interface Junction {
  id: string;
  p: Vec2;
  r: number;
  roads: number[];
}

/** Landmark categories a road stops at (it runs round them, not through them). */
const SOLID = new Set(['temple', 'basilica', 'baths', 'palace', 'theatre', 'amphitheatre', 'stadium', 'library', 'curia', 'warehouse', 'prison', 'odeum', 'house', 'tomb']);

/** Tag a work item's geometry with its source for the geometry audit (?audit). */
const T = (tag: string, fn: (b: MeshBuilder) => void) => (b: MeshBuilder) => withAuditSource(tag, () => fn(b));

export function cellKey(x: number, z: number, size: number) {
  return `${Math.floor(x / size)},${Math.floor(z / size)}`;
}

// ---------------------------------------------------------------- junctions

/** Road crossings and T-junctions (endpoints on another road), merged when close. */
export function findJunctions(roads: PlanRoad[]): Junction[] {
  const raw: { p: Vec2; roads: number[] }[] = [];
  for (let i = 0; i < roads.length; i++) {
    const a = roads[i];
    for (let j = i + 1; j < roads.length; j++) {
      const b = roads[j];
      // Crossings.
      for (let s = 0; s + 1 < a.points.length; s++) {
        for (let t = 0; t + 1 < b.points.length; t++) {
          const hit = segIntersect(a.points[s], a.points[s + 1], b.points[t], b.points[t + 1]);
          if (hit) raw.push({ p: hit, roads: [i, j] });
        }
      }
      // Endpoints touching the other road.
      for (const [r, o] of [[a, b], [b, a]] as const) {
        for (const e of [r.points[0], r.points[r.points.length - 1]]) {
          const n = nearestOnPolyline(e, o.points);
          if (n.d < o.half + 3) raw.push({ p: n.p, roads: [i, j] });
        }
      }
    }
  }
  const out: Junction[] = [];
  for (const j of raw) {
    const near = out.find((o) => Math.hypot(o.p[0] - j.p[0], o.p[1] - j.p[1]) < 8);
    if (near) {
      for (const r of j.roads) if (!near.roads.includes(r)) near.roads.push(r);
      continue;
    }
    out.push({ id: `j${out.length}`, p: j.p, r: 0, roads: [...j.roads] });
  }
  for (const j of out) j.r = Math.max(...j.roads.map((r) => roads[r].half)) + 0.6;
  return out;
}

function segIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a[0] + r[0] * t, a[1] + r[1] * t];
}

export function nearestOnPolyline(p: Vec2, pts: readonly Vec2[]): { p: Vec2; d: number; s: number; seg: number } {
  let best = { p: pts[0] as Vec2, d: Infinity, s: 0, seg: 0 };
  let acc = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz);
    let t = L > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (L * L) : 0;
    t = Math.max(0, Math.min(1, t));
    const q: Vec2 = [a[0] + dx * t, a[1] + dz * t];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < best.d) best = { p: q, d, s: acc + L * t, seg: k };
    acc += L;
  }
  return best;
}

// ---------------------------------------------------------------- polyline utilities

interface Sample {
  p: Vec2;
  s: number;
  n: Vec2;
}

function sampleLine(pts: readonly Vec2[], step: number): Sample[] {
  const out: Sample[] = [];
  let acc = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    const n: Vec2 = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
    const m = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < m; j++) out.push({ p: [a[0] + ((b[0] - a[0]) * j) / m, a[1] + ((b[1] - a[1]) * j) / m], s: acc + (L * j) / m, n });
    acc += L;
  }
  const last = pts[pts.length - 1];
  out.push({ p: [last[0], last[1]], s: acc, n: out.length ? out[out.length - 1].n : [0, 1] });
  return out;
}

/** The part of a polyline between arc lengths s0 and s1. */
export function sliceLine(pts: readonly Vec2[], s0: number, s1: number): Vec2[] {
  const out: Vec2[] = [];
  let acc = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const e0 = acc, e1 = acc + L;
    if (e1 >= s0 && e0 <= s1 && L > 0) {
      const t0 = Math.max(0, (s0 - e0) / L), t1 = Math.min(1, (s1 - e0) / L);
      const p0: Vec2 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
      const p1: Vec2 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
      if (!out.length || Math.hypot(out[out.length - 1][0] - p0[0], out[out.length - 1][1] - p0[1]) > 1e-4) out.push(p0);
      out.push(p1);
    }
    acc = e1;
  }
  return out;
}

function lineLength(pts: readonly Vec2[]) {
  let L = 0;
  for (let k = 0; k + 1 < pts.length; k++) L += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
  return L;
}

/** Split [0, L] into pieces of at most `max` m (piece boundaries do not get end caps). */
function chunks(s0: number, s1: number, max: number): [number, number][] {
  const n = Math.max(1, Math.ceil((s1 - s0) / max));
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) out.push([s0 + ((s1 - s0) * i) / n, s0 + ((s1 - s0) * (i + 1)) / n]);
  return out;
}

// ---------------------------------------------------------------- work generation

export interface StreetWork {
  cells: Map<string, CellWork>;
  /** Lamps of the street furniture (shrines, fountains). */
  lamps: LampDef[];
  junctions: Junction[];
  spots: StreetSpotDef[];
  /** Road runs that got geometry (for the street graph: open / urban / rural). */
  runs: { road: number; s0: number; s1: number; ctx: string }[];
  /** Parked carts (centre, heading along the road). */
  carts: { x: number; z: number; heading: number }[];
  /** The course of each stairway (road index → path of its flights, see stairProfile). */
  stairPaths: Map<number, Vec2[]>;
}

/**
 * Queue a work item into the cell at (x, z) (ignored outside the area): `base` for surfaces,
 * `detail` for street furniture and props (built only near the camera).
 */
export function cellAdder(cells: Map<string, CellWork>, size: number, inArea: (x: number, z: number) => boolean) {
  return (x: number, z: number, item: WorkItem, layer: 'base' | 'detail' = 'base') => {
    if (!inArea(x, z)) return;
    const key = cellKey(x, z, size);
    let c = cells.get(key);
    if (!c) {
      const [ix, iz] = key.split(',').map(Number);
      cells.set(key, (c = { key, cx: (ix + 0.5) * size, cz: (iz + 0.5) * size, items: [], detail: [] }));
    }
    (layer === 'detail' ? c.detail : c.items).push(item);
  };
}

export function streetWork(plan: CityPlan, H: HeightFn, areas: Bounds | Bounds[], size = 128): StreetWork {
  const rects = Array.isArray(areas) ? areas : [areas];
  const inArea = (x: number, z: number) => inRects(rects, x, z);
  const area = rectsBounds(rects);
  const cells = new Map<string, CellWork>();
  const add = cellAdder(cells, size, inArea);
  const addCell = cellAdder(cells, size, () => true);
  const spots: StreetSpotDef[] = [];
  const lamps: LampDef[] = [];
  const runs: StreetWork['runs'] = [];
  const carts: StreetWork['carts'] = [];
  const stairPaths = new Map<number, Vec2[]>();

  // ---- ground cover: packed earth over every urban scrap of ground the streets and yards leave
  // (raster margins beside the streets, landmark aprons, corners), so no terrain grass shows in town.
  for (let x = Math.floor(area.minX / size) * size; x < area.maxX; x += size) {
    for (let z = Math.floor(area.minZ / size) * size; z < area.maxZ; z += size) {
      const x0 = x, z0 = z;
      // Cells that overlap the area at all (the cover itself stops at the area's edge).
      if (!rects.some((r) => r.minX < x0 + size && r.maxX > x0 && r.minZ < z0 + size && r.maxZ > z0)) continue;
      addCell(x0 + size / 2, z0 + size / 2, T('ground-cover', (b) => groundCover(b, plan, H, x0, z0, size, inArea)));
    }
  }

  // ---- junction squares
  const junctions = findJunctions(plan.roads);
  for (const j of junctions) {
    const poly: Polygon = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      poly.push([j.p[0] + Math.cos(a) * j.r, j.p[1] + Math.sin(a) * j.r]);
    }
    const allRural = j.roads.every((r) => plan.roads[r].style !== 'paved');
    add(j.p[0], j.p[1], T(`junction:${j.id}`, (b) => buildPlaza(b, poly, H, { material: allRural ? 'gravel' : 'paving_basalt', lift: LIFT.junction, cell: 2.5, skirt: 0.35, bevelCollide: true })));
  }

  // ---- where the minor streets meet the atlas roads: the road's sidewalk drops to the carriageway there (a dropped kerb)
  const mouths = streetMouths(plan);
  // ---- atlas roads
  plan.roads.forEach((road, ri) => {
    const L = lineLength(road.points);
    if (road.style === 'stairs') {
      // A flight of steps with a walkable grade from the street at its foot to the top (stairsRoad).
      const sp = stairProfile(road.points, H);
      stairPaths.set(ri, sp.path);
      runs.push({ road: ri, s0: 0, s1: L, ctx: 'stairs' });
      const mid = road.points[Math.floor(road.points.length / 2)];
      // Where another road crosses the stairway, its parapets open onto the crossing.
      const open = junctions.filter((j) => j.roads.includes(ri)).map((j) => ({ x: j.p[0], z: j.p[1], r: j.r + 0.6 }));
      add(mid[0], mid[1], T(`stairs-road:${road.id}`, (bld) => stairsRoad(bld, road, sp, H, open)));
      return;
    }
    // Arc-length intervals taken by junction squares.
    const cuts: [number, number][] = [];
    for (const j of junctions) {
      if (!j.roads.includes(ri)) continue;
      const n = nearestOnPolyline(j.p, road.points);
      if (n.d > j.r + 2) continue;
      cuts.push([n.s - j.r + 0.15, n.s + j.r - 0.15]);
    }
    // Context per sample.
    const smp = sampleLine(road.points, 2);
    const ctx = smp.map((sm) => roadContext(plan, road, sm));
    // Majority filter so runs do not flicker.
    const fctx = ctx.map((_, i) => {
      const cnt = new Map<string, number>();
      for (let k = -4; k <= 4; k++) {
        const c = ctx[Math.max(0, Math.min(ctx.length - 1, i + k))];
        cnt.set(c, (cnt.get(c) ?? 0) + 1);
      }
      let best = ctx[i], bn = 0;
      for (const [c, n] of cnt) if (n > bn) { bn = n; best = c; }
      return ctx[i] === 'skip' ? 'skip' : best === 'skip' ? ctx[i] : best;
    });
    // Runs of equal context, minus junction cuts.
    let i0 = 0;
    for (let i = 1; i <= smp.length; i++) {
      if (i < smp.length && fctx[i] === fctx[i0]) continue;
      const c = fctx[i0];
      const s0 = smp[i0].s, s1 = i < smp.length ? smp[i].s : L;
      i0 = i;
      if (c === 'skip' || s1 - s0 < 0.5) continue;
      for (const [a, b] of subtract([s0, s1], cuts)) {
        if (b - a < 0.8) continue;
        runs.push({ road: ri, s0: a, s1: b, ctx: c });
        const pieces = chunks(a, b, 80);
        pieces.forEach(([p0, p1], k) => {
          const pts = sliceLine(road.points, p0, p1);
          if (pts.length < 2) return;
          const mid = pts[Math.floor(pts.length / 2)];
          const capStart = k === 0, capEnd = k === pieces.length - 1;
          const dips = (mouths.get(ri) ?? []).filter((m) => m.s > p0 - m.w && m.s < p1 + m.w).map((m) => ({ s: m.s - p0, side: m.side, w: m.w }));
          add(mid[0], mid[1], T(`road:${road.id}:${c}`, (bld) => buildRoadPiece(bld, road, c, pts, H, capStart, capEnd, dips)));
        });
      }
    }
  });

  // ---- minor streets (each stops where it reaches a road or a piazza: drawn over them, its own
  // surface and cobbled edges would show through theirs in patches)
  for (const st of plan.streets) {
    const L = lineLength(st.points);
    const stCuts: [number, number][] = [];
    {
      let c0 = -1;
      const step = 0.5;
      for (let s = 0; s <= L + 1e-6; s += step) {
        const p = pointAt(st.points, Math.min(s, L));
        const k = plan.grid.at(p[0], p[1]);
        const over = k === K.ROAD || k === K.PIAZZA;
        if (over && c0 < 0) c0 = s;
        if (!over && c0 >= 0) {
          stCuts.push([c0, s - step * 0.5]);
          c0 = -1;
        }
      }
      if (c0 >= 0) stCuts.push([c0, L + 1]);
    }
    // Runs of steps / no steps along the segments.
    let acc = 0;
    const segs = st.points.slice(0, -1).map((p, k) => {
      const q = st.points[k + 1];
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const r = { s0: acc, s1: acc + l, steps: st.steps[k] };
      acc += l;
      return r;
    });
    let k0 = 0;
    for (let k = 1; k <= segs.length; k++) {
      if (k < segs.length && segs[k].steps === segs[k0].steps) continue;
      const s0 = segs[k0].s0, s1 = k < segs.length ? segs[k].s0 : L;
      const steps = segs[k0].steps;
      k0 = k;
      if (steps) {
        // One flight per segment.
        for (let j = 0; j < st.points.length - 1; j++) {
          if (segs[j].s0 < s0 - 1e-6 || segs[j].s1 > s1 + 1e-6) continue;
          const a = st.points[j], c = st.points[j + 1];
          add((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, T(`street-stairs:${st.id}`, (bld) => buildStairs(bld, a as Vec2, c as Vec2, Math.max(2.6, st.width - 0.4), (x, z) => H(x, z) + 0.04, { material: st.wealth > 0.5 ? 'travertine' : 'tufa', riser: 0.17, parapet: null })));
        }
        continue;
      }
      for (const [c0, c1] of subtract([s0, s1], stCuts)) {
        if (c1 - c0 < 0.8) continue;
        const pieces = chunks(c0, c1, 80);
        pieces.forEach(([p0, p1], k2) => {
          const pts = sliceLine(st.points, p0, p1);
          if (pts.length < 2) return;
          const mid = pts[Math.floor(pts.length / 2)];
          add(mid[0], mid[1], T(`street:${st.id}:${st.kind}`, (bld) => buildMinorPiece(bld, st, pts, H, k2 === 0, k2 === pieces.length - 1)));
        });
      }
    }
  }

  // ---- markets: stalls along the edges of the Forum Boarium and the Forum Holitorium, with
  // cattle pens on the Boarium, and baskets, crates and amphorae between the stalls
  for (const pl of plan.plazas) {
    if (pl.kind !== 'market') continue;
    const rng = new Rng(`market:${pl.id}`);
    const c = polyCenter(pl.polygon);
    if (!inArea(c[0], c[1])) continue;
    const g = plan.grid;
    const bb = bounds(pl.polygon);
    const stalls: { p: Vec2; facing: number; kind: string }[] = [];
    // Aisles from the middle of the square to the nearest streets around it, where the street
    // graph links the square: no stall stands in them.
    const aisles = marketAisles(plan, c, 3, 90);
    for (let x = bb.minX + 3; x < bb.maxX; x += 4.6) {
      for (let z = bb.minZ + 3; z < bb.maxZ; z += 4.6) {
        const p: Vec2 = [x + rng.range(-0.8, 0.8), z + rng.range(-0.8, 0.8)];
        if (!pointIn(p, pl.polygon) || edgeDist(p, pl.polygon) > 24 || edgeDist(p, pl.polygon) < 3) continue;
        // Clear ground only: no landmark, road or street under the stall or right around it.
        if ([[0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]].some(([dx, dz]) => g.at(p[0] + dx, p[1] + dz) !== K.PLAZA)) continue;
        if (!rng.chance(0.5)) continue;
        if (aisles.some(([a, b]) => distSegV(p, a, b) < 3.2)) continue;
        stalls.push({ p, facing: Math.atan2(c[0] - p[0], c[1] - p[1]), kind: rng.pick(['stall_fruit', 'stall_fish', 'stall_pottery', 'stall_cloth']) });
      }
    }
    stalls.forEach((st, k) => spots.push({ id: `${pl.id}:stall${k}`, kind: 'stall', position: new THREE.Vector3(st.p[0] + Math.sin(st.facing) * 1.2, H(st.p[0], st.p[1]), st.p[1] + Math.cos(st.facing) * 1.2), heading: st.facing, tag: st.kind }));
    // Group stalls by work cell.
    const byCell = new Map<string, typeof stalls>();
    for (const st of stalls) {
      const k = cellKey(st.p[0], st.p[1], size);
      const l = byCell.get(k);
      if (l) l.push(st);
      else byCell.set(k, [st]);
    }
    for (const [key, list] of byCell) {
      add(list[0].p[0], list[0].p[1], (b) => {
        // A fresh generator per build: a cell dropped and rebuilt gets the same props.
        const r = new Rng(`market:${pl.id}:${key}`);
        const d = new Draw(b);
        for (const st of list) {
          const y = H(st.p[0], st.p[1]);
          // Stall fronts (local −z) face the middle of the square.
          placeProp(d, st.kind as 'stall_fruit', st.p[0], y, st.p[1], st.facing + Math.PI, { rng: r, ground: H });
          if (r.chance(0.5)) {
            const gx = st.p[0] + r.range(-1.6, 1.6), gz = st.p[1] + r.range(-1.6, 1.6);
            placeProp(d, r.pick(['basket', 'crate', 'amphora_stack', 'sack'] as const), gx, H(gx, gz), gz, r.range(0, 6), { rng: r, ground: H });
          }
        }
      }, 'detail');
    }
    if (pl.id === 'forum-boarium') {
      // Cattle pens: timber post-and-rail enclosures near the river side of the square.
      let pens = 0;
      for (let k = 0; k < 40 && pens < 3; k++) {
        const p: Vec2 = [rng.range(bb.minX, bb.maxX), rng.range(bb.minZ, bb.maxZ)];
        if (!pointIn(p, pl.polygon)) continue;
        if ([[-4, -3], [4, -3], [4, 3], [-4, 3], [0, 0]].some(([dx, dz]) => g.at(p[0] + dx, p[1] + dz) !== K.PLAZA)) continue;
        if (stalls.some((st) => Math.hypot(st.p[0] - p[0], st.p[1] - p[1]) < 7)) continue;
        pens++;
        const rot = rng.range(0, Math.PI);
        const seed = rng.int(0, 1e9);
        add(p[0], p[1], (b) => cattlePen(new Draw(b).at(p[0], H(p[0], p[1]), p[1], rot), 8, 6, new Rng(seed)), 'detail');
      }
    }
  }

  // ---- parked carts: wheeled traffic is banned by day, so carts wait at the edge of the city
  // (where the roads leave the built-up area) until dusk
  {
    const rng = new Rng('carts');
    for (const run of runs) {
      if (run.ctx !== 'rural') continue;
      const road = plan.roads[run.road];
      for (const [s0, dir] of [[run.s0, 1], [run.s1, -1]] as const) {
        const prev = runs.find((r) => r.road === run.road && r.ctx === 'urban' && Math.abs((dir > 0 ? r.s1 : r.s0) - s0) < 3);
        if (!prev || !rng.chance(0.8)) continue;
        const pts = sliceLine(road.points, Math.max(0, s0 + dir * 4), s0 + dir * 30);
        if (pts.length < 2) continue;
        const a = pts[0], z = pts[pts.length - 1];
        const L = Math.hypot(z[0] - a[0], z[1] - a[1]) || 1;
        const t: Vec2 = [(z[0] - a[0]) / L, (z[1] - a[1]) / L], n: Vec2 = [-t[1], t[0]];
        const count = rng.int(2, 4);
        const seed = rng.int(0, 1e9);
        const off = road.half + 1.8;
        // Only where a cart can stand: open, level ground (not on another road, steps, a landmark).
        const spots: [number, number][] = [];
        for (let k = 0; k < count; k++) {
          const x = a[0] + t[0] * (k * 5.5) + n[0] * off, zz = a[1] + t[1] * (k * 5.5) + n[1] * off;
          if (cartGround(plan, H, x, zz, t) && inArea(x, zz)) spots.push([x, zz]);
        }
        for (const [x, zz] of spots) carts.push({ x, z: zz, heading: Math.atan2(t[0], t[1]) });
        if (!spots.length) continue;
        add(a[0], a[1], (b) => {
          const r = new Rng(seed);
          const d = new Draw(b);
          spots.forEach(([x, zz], k) => placeProp(d, k % 2 ? 'handcart' : 'cart', x, H(x, zz), zz, Math.atan2(t[0], t[1]) + r.range(-0.2, 0.2), { rng: r, ground: H }));
        }, 'detail');
      }
    }
  }

  // ---- awnings stretched across the narrow lanes of the market quarters
  {
    const rng = new Rng('vela');
    for (const st of plan.streets) {
      if (st.kind === 'vicus' || st.density < 0.84 || st.steps.some(Boolean)) continue;
      const L = lineLength(st.points);
      for (let s = 8; s < L - 8; s += 24) {
        if (!rng.chance(0.35)) continue;
        const pts = sliceLine(st.points, s - 0.5, s + 0.5);
        if (pts.length < 2) continue;
        const a = pts[0], z = pts[pts.length - 1];
        const ang = Math.atan2(z[0] - a[0], z[1] - a[1]);
        const w = st.width + 0.3;
        const mats = rng.pick([['fabric_white', 'fabric_red'], ['fabric_ochre', 'fabric_white'], ['fabric_white', 'fabric_blue']] as const);
        // velum(): width along local x (across the lane), poles at local z = −depth.
        add(a[0], a[1], (b) => velum(new Draw(b).at(a[0], H(a[0], a[1]) + LIFT.lane, a[1], ang + Math.PI / 2), w, 2.2, 3.7, [mats[0], mats[1]]), 'detail');
      }
    }
  }

  // ---- piazzas
  for (const pz of plan.piazzas) {
    if (!inArea(pz.center[0], pz.center[1])) continue;
    const rng = new Rng(`piazza:${pz.id}`);
    const y = H(pz.center[0], pz.center[1]) + LIFT.piazza;
    const rot = pz.facing + Math.PI; // local −z faces the street
    const fwd: Vec2 = [Math.sin(pz.facing), Math.cos(pz.facing)];
    const right: Vec2 = [Math.cos(pz.facing), -Math.sin(pz.facing)];
    const at = (lx: number, lz: number): THREE.Vector3 =>
      // lz > 0 toward the street, lx to the right (seen facing the street).
      new THREE.Vector3(pz.center[0] + fwd[0] * lz + right[0] * lx, y, pz.center[1] + fwd[1] * lz + right[1] * lx);
    if (pz.kind === 'lacus') {
      spots.push({ id: `${pz.id}:fountain`, kind: 'fountain', position: at(0, 1.2 + 0.65), heading: pz.facing, tag: 'lacus' });
      spots.push({ id: `${pz.id}:fountain2`, kind: 'fountain', position: at(-1.25, 0.6), heading: pz.facing - Math.PI / 2, tag: 'lacus' });
      // A lampstand by the basin (the fountain is where the street gathers before dawn).
      const lp = at(1.9, 1.5);
      lamps.push({ x: lp.x, y: lp.y + 1.42, z: lp.z, kind: 'fountain' });
    } else {
      spots.push({ id: `${pz.id}:shrine`, kind: 'shrine', position: at(0, 1.6), heading: pz.facing + Math.PI, tag: 'compitum' });
      // The Lares' lamp burns on the shrine's altar.
      const lp = at(0, 0.6);
      lamps.push({ x: lp.x, y: lp.y + 1.25, z: lp.z, kind: 'shrine' });
    }
    const bench = rng.chance(0.7);
    if (bench) spots.push({ id: `${pz.id}:bench`, kind: 'bench', position: at(pz.r - 1.1, -0.5), heading: pz.facing - Math.PI / 2 });
    // (Not on a slope: the stall's poles stand on the paving, which follows the ground, and a bank under it leaves one side hanging.)
    const hs = [H(pz.center[0] + pz.r, pz.center[1]), H(pz.center[0] - pz.r, pz.center[1]), H(pz.center[0], pz.center[1] + pz.r), H(pz.center[0], pz.center[1] - pz.r)];
    const stall = rng.chance(0.35) && Math.max(...hs) - Math.min(...hs) < 0.6;
    if (stall) spots.push({ id: `${pz.id}:stall`, kind: 'stall', position: at(-pz.r + 1.6, 0.4), heading: pz.facing, tag: 'market' });
    const travertine = rng.chance(0.5);
    const amphorae = rng.chance(0.4);
    const seed = rng.int(0, 1e9);
    add(pz.center[0], pz.center[1], T(`piazza:${pz.id}`, (b) => {
      const poly: Polygon = [];
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        poly.push([pz.center[0] + Math.cos(a) * pz.r, pz.center[1] + Math.sin(a) * pz.r]);
      }
      buildPlaza(b, poly, H, { material: travertine ? 'paving_travertine' : 'cobbles', lift: LIFT.piazza, cell: 2.5, skirt: 0.3, bevelCollide: true });
    }));
    add(pz.center[0], pz.center[1], (b) => {
      const r = new Rng(seed);
      const d = new Draw(b).at(pz.center[0], y, pz.center[1], rot);
      // Props stand on the paving, which follows the terrain (local y of the surface at each spot).
      const gnd = groundIn(d, (x, z) => H(x, z) + LIFT.piazza);
      const on = (x: number, z: number) => gnd(x, z);
      if (pz.kind === 'lacus') {
        lacus(d.at(0, 0, 0.2, 0), r);
        placeProp(d, 'lampstand', -1.9, on(-1.9, -1.5), -1.5, 0, { variant: 0, ground: gnd });
      } else compitalShrine(d.at(0, 0, -0.6, 0), r);
      if (bench) placeProp(d, 'bench_masonry', -(pz.r - 1.1), on(-(pz.r - 1.1), 0.5), 0.5, -Math.PI / 2, { variant: 0, ground: gnd });
      if (stall) placeProp(d, 'stall', pz.r - 1.6, on(pz.r - 1.6, -0.4), -0.4, Math.PI, { rng: r, ground: gnd });
      if (amphorae) {
        const ar = r.range(0, 6);
        placeProp(d, 'amphora_stack', pz.r - 1.4, on(pz.r - 1.4, 2.2), 2.2, ar, { rng: r, ground: gnd });
      }
    }, 'detail');
  }
  return { cells, junctions, spots, runs, lamps, carts, stairPaths };
}

/**
 * Straight aisles from a square's middle to the nearest points of up to `count` different streets
 * or roads within `maxD` m (the links the street graph makes from a plaza node).
 */
export function marketAisles(plan: CityPlan, c: Vec2, count: number, maxD: number): [Vec2, Vec2][] {
  const cands: { p: Vec2; d: number; id: string }[] = [];
  const lines: { id: string; pts: readonly Vec2[] }[] = [
    ...plan.roads.filter((r) => r.style !== 'stairs').map((r) => ({ id: r.id, pts: r.points as Vec2[] })),
    ...plan.streets.map((st) => ({ id: st.id, pts: st.points as Vec2[] })),
  ];
  for (const l of lines) {
    const n = nearestOnPolyline(c, l.pts);
    if (n.d <= maxD) cands.push({ p: n.p, d: n.d, id: l.id });
  }
  cands.sort((a, b) => a.d - b.d);
  return cands.slice(0, count).map((x) => [c, x.p]);
}

function distSegV(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]);
}

/** Ground classes a parked cart may stand on. */
const CART_GROUND = new Set<number>([K.MARGIN, K.SCRAP, K.OUTSIDE, K.GARDEN, K.PLAZA]);

/**
 * Can a cart (≈ 3 × 1.6 m, along `t`) stand at (x, z)? Every corner on open ground of an allowed
 * class, and the ground under it level within 0.4 m. Exported for tests.
 */
export function cartGround(plan: CityPlan, H: HeightFn, x: number, z: number, t: Vec2): boolean {
  const n: Vec2 = [-t[1], t[0]];
  let lo = Infinity, hi = -Infinity;
  for (const [a, c] of [[0, 0], [1.6, 0.9], [1.6, -0.9], [-1.6, 0.9], [-1.6, -0.9]]) {
    const px = x + t[0] * a + n[0] * c, pz = z + t[1] * a + n[1] * c;
    if (!CART_GROUND.has(plan.grid.at(px, pz))) return false;
    const y = H(px, pz);
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  return hi - lo < 0.4;
}

/** What a road runs through at a sample: 'skip' (inside a building), 'urban', 'open' or 'rural'. */
function roadContext(plan: CityPlan, road: PlanRoad, sm: Sample): string {
  const g = plan.grid;
  const [x, z] = sm.p;
  const i = g.index(x, z);
  if (i < 0) return 'rural';
  const c = g.cls[i];
  if (c === K.LANDMARK) {
    const lm = landmarkCategory(plan, g.owner[i]);
    if (lm && SOLID.has(lm)) return 'skip';
  }
  if (road.style !== 'paved') return 'rural';
  const off = road.half + 1.6;
  let urban = 0, open = 0;
  for (const s of [-1, 1]) {
    const k = g.index(x + sm.n[0] * off * s, z + sm.n[1] * off * s);
    const cc = k < 0 ? K.OUTSIDE : g.cls[k];
    if (cc === K.FREE || cc === K.STREET || cc === K.PIAZZA || cc === K.SCRAP) urban++;
    else if (cc === K.PLAZA || cc === K.MARGIN || cc === K.LANDMARK || cc === K.AQUEDUCT || cc === K.WALL) open++;
  }
  if (urban) return 'urban';
  if (open) return 'open';
  return 'rural';
}

function landmarkCategory(plan: CityPlan, owner: number): string | null {
  return plan.landmarkCategory[owner] ?? null;
}

function subtract(iv: [number, number], cuts: [number, number][]): [number, number][] {
  let out: [number, number][] = [iv];
  for (const [c0, c1] of cuts) {
    const next: [number, number][] = [];
    for (const [a, b] of out) {
      if (c1 <= a || c0 >= b) next.push([a, b]);
      else {
        if (c0 > a) next.push([a, c0]);
        if (c1 < b) next.push([c1, b]);
      }
    }
    out = next;
  }
  return out;
}

// ---------------------------------------------------------------- builders

/** A cattle pen: timber posts and two rails round a w × d rectangle, a gate gap on one side. */
function cattlePen(d: Draw, w: number, dd: number, rng: Rng) {
  const posts: Vec2[] = [];
  const n = Math.ceil(w / 2), m = Math.ceil(dd / 2);
  for (let i = 0; i <= n; i++) posts.push([-w / 2 + (w * i) / n, -dd / 2], [-w / 2 + (w * i) / n, dd / 2]);
  for (let j = 1; j < m; j++) posts.push([-w / 2, -dd / 2 + (dd * j) / m], [w / 2, -dd / 2 + (dd * j) / m]);
  for (const [x, z] of posts) d.box('wood_dark', x, 0.6, z, 0.14, 1.2, 0.14);
  for (const y of [0.55, 1.05]) {
    d.box('wood', 0, y, -dd / 2, w, 0.08, 0.06);
    d.box('wood', -w * 0.3, y, dd / 2, w * 0.4, 0.08, 0.06); // gate gap on the far side
    d.box('wood', w * 0.3, y, dd / 2, w * 0.4, 0.08, 0.06);
    d.box('wood', -w / 2, y, 0, 0.06, 0.08, dd);
    d.box('wood', w / 2, y, 0, 0.06, 0.08, dd);
  }
  d.solid(-w / 2 - 0.07, 0, -dd / 2 - 0.07, w / 2 + 0.07, 1.2, -dd / 2 + 0.07);
  d.solid(-w / 2 - 0.07, 0, -dd / 2, -w / 2 + 0.07, 1.2, dd / 2);
  d.solid(w / 2 - 0.07, 0, -dd / 2, w / 2 + 0.07, 1.2, dd / 2);
  // Straw and a trough inside.
  d.box('dry_grass', 0, 0.02, 0, w - 0.6, 0.04, dd - 0.6, { shadow: false });
  placeProp(d, 'trough', rng.range(-w / 4, w / 4), 0, -dd / 2 + 0.7, 0, { variant: 0 });
}

function polyCenter(poly: readonly Vec2[]): Vec2 {
  let x = 0, z = 0;
  for (const p of poly) { x += p[0]; z += p[1]; }
  return [x / poly.length, z / poly.length];
}

function bounds(poly: readonly Vec2[]) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  return { minX, minZ, maxX, maxZ };
}

function pointIn(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function edgeDist(p: Vec2, poly: readonly Vec2[]): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    d = Math.min(d, Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]));
  }
  return d;
}

/** Landmark categories that pave a ring round themselves (their builders lay the apron out to the pad), and how far (m). */
const PAVED_ROUND = new Set(['amphitheatre', 'circus', 'theatre', 'odeum', 'stadium', 'baths']);
const PAVED_RING = 14;
const COVER = new Set<number>([K.STREET, K.PIAZZA, K.SCRAP, K.FREE, K.AQUEDUCT, K.WALL]);
/**
 * Paved: landmark margins (the walkable apron round a monument, where the stalls stand) and the
 * edges of the atlas roads' corridors between the sidewalks and the house fronts.
 */
const PAVED = new Set<number>([K.MARGIN, K.ROAD]);

/** Steepest grade (rise / run) at which the ground cover is still laid (cliffs keep their rock). */
export const COVER_MAX_GRADE = 0.4;

/**
 * Ground cover over the covered raster classes of one cell: packed earth over the town's scraps
 * and under the streets, cobbles on the landmark margins and, along the golden path, on the scraps
 * and squares too. Not inside a block's outline (the block lays its own yard), not on slopes
 * steeper than COVER_MAX_GRADE (no paving draped over a cliff) and not outside the detail area.
 * Marching squares on the lattice of cell centres: interior squares merge into runs of up to
 * ~6 m, the boundary squares get the smooth (45°) edge pieces, so the cover never shows the
 * raster's staircase against the grass.
 */
function groundCover(b: MeshBuilder, plan: CityPlan, H: HeightFn, x0: number, z0: number, size: number, inArea: (x: number, z: number) => boolean = () => true) {
  const kinds = coverKinds(plan, x0, z0, size, inArea);
  coverSet(b, plan, H, x0, z0, size, (i) => kinds.get(i) === 1, 'dirt', 0.04);
  coverSet(b, plan, H, x0, z0, size, (i) => kinds.get(i) === 2, 'cobbles', 0.05);
}

/**
 * What covers each raster cell of a street cell (and its 1-cell rim): 0 nothing, 1 packed earth,
 * 2 cobbles. Exported for tests.
 */
export function coverKinds(plan: CityPlan, x0: number, z0: number, size: number, inArea: (x: number, z: number) => boolean = () => true): Map<number, number> {
  const g = plan.grid;
  const out = new Map<number, number>();
  // Gravel and dirt roads keep earth edges; paved roads get cobbles up to the house fronts.
  const pavedRoad = (i: number) => plan.roads[g.owner[i] - 1_000_000]?.style === 'paved';
  const ix0 = Math.max(1, g.ix(x0) - 2), ix1 = Math.min(g.nx - 2, g.ix(x0 + size) + 2);
  const iz0 = Math.max(1, g.iz(z0) - 2), iz1 = Math.min(g.nz - 2, g.iz(z0 + size) + 2);
  const c2 = 2 * g.cell;
  // The monumental buildings pave a ring round themselves well past their footprint (the Colosseum's pad, the Circus'
  // plaza): earth laid there stacks on their paving and fights it (the crawl's 'colosseum paving | ground cover').
  const paved = plan.landmarkPolys.filter((l) => PAVED_ROUND.has(l.category)).map((l) => ({ poly: l.poly, b: polyBounds(l.poly) })).filter(({ b }) => b.maxX + PAVED_RING > x0 && b.minX - PAVED_RING < x0 + size && b.maxZ + PAVED_RING > z0 && b.minZ - PAVED_RING < z0 + size);
  const nearPaved = (x: number, z: number) => paved.some(({ poly, b }) => x > b.minX - PAVED_RING && x < b.maxX + PAVED_RING && z > b.minZ - PAVED_RING && z < b.maxZ + PAVED_RING && (pointInPoly(x, z, poly) || distToPoly(x, z, poly) < PAVED_RING));
  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const i = iz * g.nx + ix;
      const cls = g.cls[i];
      const x = g.cx(ix), z = g.cz(iz);
      let k = 0;
      const block = cls === K.FREE && g.owner[i] >= 2_000_000 ? plan.blocks[g.owner[i] - 2_000_000] : null;
      // Only ground nothing else draws on: not a landmark's margin (the terrain paints its apron),
      // not a piazza, and not the strip a road or street itself paves (overlapping surfaces showed
      // as cobble patches over basalt and paving, and fought where they met).
      if (cls === K.MARGIN || cls === K.PIAZZA) continue;
      if (paved.length && nearPaved(x, z)) continue;
      if (cls === K.ROAD) {
        const road = plan.roads[g.owner[i] - 1_000_000];
        if (road && nearestOnPolyline([x, z], road.points as Vec2[]).d < road.half + 0.4) continue;
      }
      if (cls === K.STREET) {
        const st = plan.streets[g.owner[i]];
        if (st && nearestOnPolyline([x, z], st.points as Vec2[]).d < st.width / 2 + 0.4) continue;
      }
      if (block && pointIn([x, z], block.outline as Vec2[])) k = 0;
      else if (PAVED.has(cls) && (cls !== K.ROAD || pavedRoad(i))) k = 2;
      else if (COVER.has(cls) || (cls === K.ROAD && !pavedRoad(i))) k = (cls === K.SCRAP || cls === K.PIAZZA || cls === K.FREE) && plan.corridor(x, z) ? 2 : 1;
      if (k) {
        const gx = (plan.hy[i + 1] - plan.hy[i - 1]) / c2, gz = (plan.hy[i + g.nx] - plan.hy[i - g.nx]) / c2;
        if (gx * gx + gz * gz > COVER_MAX_GRADE * COVER_MAX_GRADE || !inArea(x, z)) k = 0;
      }
      if (k) out.set(i, k);
    }
  }
  // Lone cells (no covered 4-neighbour) read as stray tiles: drop them.
  for (const [i, k] of [...out]) {
    if (![i - 1, i + 1, i - g.nx, i + g.nx].some((o) => out.get(o) === k)) out.delete(i);
  }
  return out;
}

function coverSet(b: MeshBuilder, plan: CityPlan, H: HeightFn, x0: number, z0: number, size: number, inSet: (i: number) => boolean, material: 'dirt' | 'cobbles', lift: number) {
  const g = plan.grid;
  const c = g.cell;
  const pos: number[] = [];
  const iz0 = Math.max(0, g.iz(z0) - 1), iz1 = Math.min(g.nz - 2, g.iz(z0 + size - 1e-6));
  const ix0 = Math.max(0, g.ix(x0) - 1), ix1 = Math.min(g.nx - 2, g.ix(x0 + size - 1e-6));
  const on = (ix: number, iz: number) => inSet(iz * g.nx + ix);
  const X = (fx: number) => g.x0 + (fx + 0.5) * c, Z = (fz: number) => g.z0 + (fz + 0.5) * c;
  const v = (fx: number, fz: number) => {
    const x = X(fx), z = Z(fz);
    return [x, H(x, z) + lift, z];
  };
  /** Polygon in lattice coords (fx, fz) listed a → d → c → b (+z south): an up-facing fan. */
  const poly = (pts: [number, number][]) => {
    const p0 = v(pts[0][0], pts[0][1]);
    for (let k = 1; k + 1 < pts.length; k++) pos.push(...p0, ...v(pts[k][0], pts[k][1]), ...v(pts[k + 1][0], pts[k + 1][1]));
  };
  // One lattice square per quad: longer runs were draped only at their ends, and the ground bulged
  // through them in between.
  const maxRun = 1;
  // Only squares whose top-left lattice point lies in this cell (each square is emitted once).
  const sx0 = Math.max(ix0, g.ix(x0 + c / 2)), sz0 = Math.max(iz0, g.iz(z0 + c / 2));
  const sx1 = Math.min(ix1, g.ix(x0 + size + c / 2) - 1), sz1 = Math.min(iz1, g.iz(z0 + size + c / 2) - 1);
  for (let iz = sz0; iz <= sz1; iz++) {
    let ix = sx0;
    while (ix <= sx1) {
      const a = on(ix, iz), bb = on(ix + 1, iz), cc = on(ix + 1, iz + 1), d = on(ix, iz + 1);
      const code = (a ? 1 : 0) | (bb ? 2 : 0) | (cc ? 4 : 0) | (d ? 8 : 0);
      if (code === 15) {
        let jx = ix;
        while (jx + 1 <= sx1 && jx + 1 - ix < maxRun && on(jx + 2, iz) && on(jx + 2, iz + 1)) jx++;
        poly([[ix, iz], [ix, iz + 1], [jx + 1, iz + 1], [jx + 1, iz]]);
        ix = jx + 1;
        continue;
      }
      if (code) {
        // Corners a (ix, iz), b (ix+1, iz), c (ix+1, iz+1), d (ix, iz+1) and edge midpoints.
        const A: [number, number] = [ix, iz], B: [number, number] = [ix + 1, iz], C: [number, number] = [ix + 1, iz + 1], D: [number, number] = [ix, iz + 1];
        const ab: [number, number] = [ix + 0.5, iz], bc: [number, number] = [ix + 1, iz + 0.5], cd: [number, number] = [ix + 0.5, iz + 1], da: [number, number] = [ix, iz + 0.5];
        // Walk the square's boundary a → d → c → b (up-facing order) keeping covered corners and the crossings.
        const ring: [number, number][] = [];
        const corners: [[number, number], boolean, [number, number]][] = [[A, a, da], [D, d, cd], [C, cc, bc], [B, bb, ab]];
        for (let k = 0; k < 4; k++) {
          const [pt, inside, edgeToNext] = corners[k];
          const nextInside = corners[(k + 1) % 4][1];
          if (inside) ring.push(pt);
          if (inside !== nextInside) ring.push(edgeToNext);
        }
        // Saddles (a & c or b & d only) come out as one hexagon, which is fine for ground.
        if (ring.length >= 3) poly(ring);
      }
      ix++;
    }
  }
  if (!pos.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  b.add(geo, material, undefined, { castShadow: false });
}

/**
 * Where a minor street ends on an atlas road: per road index, the arc length along the road, the
 * side the street comes in on (+1 = left normal) and its width. The street stops at the road's
 * band; the road drops its kerb there (buildStreet `dips`).
 */
export function streetMouths(plan: CityPlan): Map<number, { s: number; side: -1 | 1; w: number }[]> {
  const out = new Map<number, { s: number; side: -1 | 1; w: number }[]>();
  for (const st of plan.streets) {
    if (st.points.length < 2 || st.steps.some(Boolean)) continue;
    for (const e of [st.points[0], st.points[st.points.length - 1]]) {
      let best: { ri: number; n: ReturnType<typeof nearestOnPolyline> } | null = null;
      for (const road of plan.roads) {
        if (road.style !== 'paved') continue;
        const n = nearestOnPolyline(e, road.points);
        if (n.d > road.half + st.width / 2 + 2.5) continue;
        if (!best || n.d < best.n.d) best = { ri: road.index, n };
      }
      if (!best) continue;
      const rd = plan.roads[best.ri].points;
      const a = rd[best.n.seg], b = rd[best.n.seg + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
      const side = (e[0] - best.n.p[0]) * -tz + (e[1] - best.n.p[1]) * tx >= 0 ? 1 : -1;
      const list = out.get(best.ri) ?? [];
      list.push({ s: best.n.s, side, w: Math.max(2.4, st.width - 0.6) });
      out.set(best.ri, list);
    }
  }
  return out;
}

/** One piece of an atlas road (≤ 80 m) in its context (urban, open ground, rural, stairs). */
function buildRoadPiece(b: MeshBuilder, road: PlanRoad, ctx: string, pts: Vec2[], H: HeightFn, capStart: boolean, capEnd: boolean, dips: { s: number; side: -1 | 1; w: number }[]) {
  const spec: StreetSpec = { points: pts, lift: LIFT.road, capStart, capEnd, steppingStones: [], seed: road.index };
  if (road.style === 'paved' && ctx === 'urban') {
    Object.assign(spec, { kind: 'paved', roadWidth: road.carriage, sidewalk: road.sidewalk, curb: KERB, dips });
  } else if (road.style === 'paved' && ctx === 'open') {
    Object.assign(spec, { kind: 'lane', roadWidth: road.carriage + road.sidewalk, roadMaterial: 'paving_basalt' });
  } else if (road.style === 'paved') {
    Object.assign(spec, { kind: 'lane', roadWidth: road.carriage, roadMaterial: 'paving_basalt' });
  } else {
    Object.assign(spec, { kind: 'lane', roadWidth: road.carriage, roadMaterial: road.style === 'gravel' ? 'gravel' : 'dirt' });
  }
  buildStreet(b, spec, H);
}

function buildMinorPiece(b: MeshBuilder, st: PlanStreet, pts: Vec2[], H: HeightFn, capStart: boolean, capEnd: boolean) {
  if (st.kind === 'vicus') {
    const sw = 0.85;
    buildStreet(b, { points: pts, kind: 'paved', roadWidth: st.width - 2 * sw, sidewalk: sw, curb: KERB, lift: LIFT.vicus, capStart, capEnd, steppingStones: [], seed: st.index }, H);
  } else if (st.kind === 'lane') {
    buildStreet(b, { points: pts, kind: 'lane', roadWidth: st.width, roadMaterial: st.wealth > 0.45 ? 'paving_basalt' : 'cobbles', lift: LIFT.lane, seed: st.index }, H);
  } else {
    buildStreet(b, { points: pts, kind: 'lane', roadWidth: st.width, roadMaterial: st.density > 0.85 ? 'dirt' : 'gravel', lift: LIFT.alley, seed: st.index }, H);
  }
}

// ---------------------------------------------------------------- stairs (scalae, gradus)

/** Steepest grade of a flight (riser 0.2 m over a 0.3 m tread). */
export const STAIR_MAX_GRADE = 0.66;

export interface StairProfile {
  /** The stairs' course (game m): the atlas line, extended down to the street at a foot on a slope. */
  path: Vec2[];
  /** Arc lengths along `path` of the profile samples, and the walking surface (game y) there. */
  s: number[];
  y: number[];
}

/**
 * The walking surface of a flight of stairs along a polyline: the lowest profile that stays on or
 * above the ground (+ 5 cm) and never climbs steeper than STAIR_MAX_GRADE. Where the atlas line
 * starts or ends on a slope too steep for that (the Centum Gradus begins half-way up the Tarpeian
 * cliff), the course is extended along its own direction (≤ 12 m) until the stairs reach the ground,
 * so every flight starts at the street below and ends on the ground above. Pure.
 */
export function stairProfile(points: readonly Vec2[], H: HeightFn, maxGrade = STAIR_MAX_GRADE, ext = 12, ds = 0.5): StairProfile {
  const pts = points.map((p) => [p[0], p[1]] as Vec2);
  const n = pts.length;
  const d0 = unitV(pts[0], pts[1]), d1 = unitV(pts[n - 1], pts[n - 2]);
  // Extended course: E metres before the start and after the end.
  const ext0: Vec2 = [pts[0][0] + d0[0] * ext, pts[0][1] + d0[1] * ext];
  const ext1: Vec2 = [pts[n - 1][0] + d1[0] * ext, pts[n - 1][1] + d1[1] * ext];
  const full: Vec2[] = [ext0, ...pts, ext1];
  const L = lineLength(full);
  const s: number[] = [], g: number[] = [];
  const m = Math.max(2, Math.ceil(L / ds));
  for (let i = 0; i <= m; i++) {
    const si = (L * i) / m;
    const p = pointAt(full, si);
    s.push(si);
    g.push(H(p[0], p[1]) + 0.05);
  }
  // Lowest profile ≥ ground with |slope| ≤ maxGrade: two passes of the slope-limited envelope.
  const y = g.slice();
  for (let i = 1; i <= m; i++) y[i] = Math.max(y[i], y[i - 1] - maxGrade * (s[i] - s[i - 1]));
  for (let i = m - 1; i >= 0; i--) y[i] = Math.max(y[i], y[i + 1] - maxGrade * (s[i + 1] - s[i]));
  // Trim the extensions to where the profile meets the ground (nothing to build beyond).
  const sA = ext, sB = L - ext;
  let i0 = s.findIndex((v) => v >= sA - 1e-6), i1 = s.length - 1 - [...s].reverse().findIndex((v) => v <= sB + 1e-6);
  while (i0 > 0 && y[i0] - g[i0] > 0.03) i0--;
  while (i1 < m && y[i1] - g[i1] > 0.03) i1++;
  const s0 = s[i0], s1 = s[i1];
  return { path: sliceLine(full, s0, s1), s: s.slice(i0, i1 + 1).map((v) => v - s0), y: y.slice(i0, i1 + 1) };
}

/** Walking height of a profile at arc length t. */
export function profileAt(sp: StairProfile, t: number): number {
  const { s, y } = sp;
  if (t <= s[0]) return y[0];
  if (t >= s[s.length - 1]) return y[y.length - 1];
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid] <= t) lo = mid;
    else hi = mid;
  }
  const f = (t - s[lo]) / (s[hi] - s[lo] || 1);
  return y[lo] + (y[hi] - y[lo]) * f;
}

/**
 * An atlas stairway: travertine flights (≤ 4 m each, so they follow the profile's bends) on a
 * tufa substructure down to the ground, low tufa parapets along both sides, and a smooth ramp
 * collider under the step noses of every flight.
 */
function stairsRoad(b: MeshBuilder, road: PlanRoad, sp: StairProfile, H: HeightFn, open: { x: number; z: number; r: number }[] = []) {
  const path = sp.path;
  const L = lineLength(path);
  const n = Math.max(1, Math.ceil(L / 4));
  const opening = (x: number, z: number) => open.some((o) => Math.hypot(o.x - x, o.z - z) < o.r);
  for (let k = 0; k < n; k++) {
    const t0 = (L * k) / n, t1 = (L * (k + 1)) / n;
    flight(b, pointAt(path, t0), pointAt(path, t1), profileAt(sp, t0), profileAt(sp, t1), road.carriage, H, 'travertine', 'tufa', opening);
  }
}

/**
 * One straight flight from a (walking height ya) to c (yc): steps standing on a solid base down to
 * below the lowest ground under the flight, parapets, a ramp collider through the step noses and
 * parapet colliders. Risers ≤ 0.2 m.
 */
function flight(b: MeshBuilder, a: Vec2, c: Vec2, ya: number, yc: number, width: number, H: HeightFn, mat: 'travertine' | 'tufa', parapet: 'tufa' | null, opening: (x: number, z: number) => boolean = () => false) {
  const dx = c[0] - a[0], dz = c[1] - a[1];
  const run = Math.hypot(dx, dz);
  if (run < 0.05) return;
  const yaw = Math.atan2(dx, dz);
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  const steps = Math.max(1, Math.ceil(Math.abs(yc - ya) / 0.2));
  // The base reaches below the ground anywhere under the flight (it may stand proud of a slope).
  let ground = Infinity;
  const sx = Math.cos(yaw) * (width / 2), sz = -Math.sin(yaw) * (width / 2);
  for (let i = 0; i <= 4; i++) {
    const x = a[0] + (dx * i) / 4, z = a[1] + (dz * i) / 4;
    ground = Math.min(ground, H(x, z), H(x + sx, z + sz), H(x - sx, z - sz));
  }
  const base = Math.min(ground, ya, yc) - 0.4;
  for (let i = 0; i < steps; i++) {
    const f0 = i / steps, f1 = (i + 1) / steps;
    const top = ya + (yc - ya) * (yc > ya ? f1 : f0);
    const mid = (f0 + f1) / 2;
    b.add(BOX, mat, new THREE.Matrix4().compose(new THREE.Vector3(a[0] + dx * mid, (base + top) / 2, a[1] + dz * mid), q, new THREE.Vector3(width, top - base, run / steps + 0.01)));
  }
  if (parapet) {
    for (const side of [-1, 1]) {
      const ox = Math.cos(yaw) * (width / 2 + 0.15) * side, oz = -Math.sin(yaw) * (width / 2 + 0.15) * side;
      const pieces = Math.max(1, Math.ceil(run / 1.5));
      // Runs of parapet between openings, one collider each.
      let r0 = -1;
      for (let i = 0; i <= pieces; i++) {
        const mid = (i + 0.5) / pieces;
        const px = a[0] + dx * mid + ox, pz = a[1] + dz * mid + oz;
        const solid = i < pieces && !opening(px, pz);
        if (solid) {
          const top = ya + (yc - ya) * mid + 0.9;
          b.add(BOX, parapet, new THREE.Matrix4().compose(new THREE.Vector3(px, (top + base) / 2, pz), q, new THREE.Vector3(0.3, top - base, run / pieces + 0.01)));
          if (r0 < 0) r0 = i;
        } else if (r0 >= 0) {
          const f0 = r0 / pieces, f1 = i / pieces, fm = (f0 + f1) / 2;
          const y0 = ya + (yc - ya) * f0, y1 = ya + (yc - ya) * f1;
          b.collider({ kind: 'box', center: new THREE.Vector3(a[0] + dx * fm + ox, (y0 + y1) / 2 + 0.45, a[1] + dz * fm + oz), half: new THREE.Vector3(0.15, Math.abs(y1 - y0) / 2 + 0.95, (run * (f1 - f0)) / 2), rotation: q.clone() });
          r0 = -1;
        }
      }
    }
  }
  // Ramp collider whose top passes through the step noses.
  const pitch = Math.atan2(yc - ya, run);
  const rq = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pitch));
  const thick = 0.3;
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rq);
  const center = new THREE.Vector3(a[0] + dx / 2, (ya + yc) / 2 + 0.02, a[1] + dz / 2).addScaledVector(up, -thick / 2);
  b.collider({ kind: 'box', center, half: new THREE.Vector3(width / 2, thick / 2, Math.hypot(run, yc - ya) / 2 + 0.05), rotation: rq });
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

function unitV(a: Vec2, b: Vec2): Vec2 {
  const x = a[0] - b[0], z = a[1] - b[1];
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}

/** Point at arc length t along a polyline. */
export function pointAt(pts: readonly Vec2[], t: number): Vec2 {
  let acc = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + L >= t || k === pts.length - 2) {
      const f = L > 0 ? Math.min(1, Math.max(0, (t - acc) / L)) : 0;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    acc += L;
  }
  return [pts[0][0], pts[0][1]];
}

export type { PlanPiazza };
