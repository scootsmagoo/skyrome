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
import { buildPlaza, buildStairs, buildStreet, type StreetSpec } from '../../arch/fabric/streets';
import { Draw } from '../../arch/fabric/draw';
import { compitalShrine } from '../../arch/fabric/shrines';
import { lacus } from '../../arch/fabric/fountain';
import { placeProp } from '../../arch/props/props';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { Polygon, Vec2 } from '../../arch/fabric/types';
import { K } from './raster';
import type { CityPlan, PlanRoad, PlanStreet, PlanPiazza } from './plan';
import type { HeightFn } from './massing';

export type WorkItem = (b: MeshBuilder) => void;

export interface CellWork {
  key: string;
  cx: number;
  cz: number;
  items: WorkItem[];
}

export interface StreetSpotDef {
  id: string;
  kind: 'fountain' | 'shrine' | 'bench' | 'stall';
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

/** Lifts above the terrain, so overlapping surfaces never fight (plus a polygon offset). */
const LIFT = { road: 0.07, junction: 0.1, vicus: 0.055, lane: 0.05, alley: 0.045, piazza: 0.09 };

/** Landmark categories a road stops at (it runs round them, not through them). */
const SOLID = new Set(['temple', 'basilica', 'baths', 'palace', 'theatre', 'amphitheatre', 'stadium', 'library', 'curia', 'warehouse', 'prison', 'odeum', 'house', 'tomb']);

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
  junctions: Junction[];
  spots: StreetSpotDef[];
  /** Road runs that got geometry (for the street graph: open / urban / rural). */
  runs: { road: number; s0: number; s1: number; ctx: string }[];
}

export function streetWork(plan: CityPlan, H: HeightFn, area: { minX: number; minZ: number; maxX: number; maxZ: number }, size = 128): StreetWork {
  const inArea = (x: number, z: number) => x >= area.minX && x <= area.maxX && z >= area.minZ && z <= area.maxZ;
  const cells = new Map<string, CellWork>();
  const add = (x: number, z: number, item: WorkItem) => {
    if (!inArea(x, z)) return;
    const key = cellKey(x, z, size);
    let c = cells.get(key);
    if (!c) {
      const [ix, iz] = key.split(',').map(Number);
      cells.set(key, (c = { key, cx: (ix + 0.5) * size, cz: (iz + 0.5) * size, items: [] }));
    }
    c.items.push(item);
  };
  const spots: StreetSpotDef[] = [];
  const runs: StreetWork['runs'] = [];

  // ---- ground cover: packed earth over every urban scrap of ground the streets and yards leave
  // (raster margins beside the streets, landmark aprons, corners), so no terrain grass shows in town.
  for (let x = Math.floor(area.minX / size) * size; x < area.maxX; x += size) {
    for (let z = Math.floor(area.minZ / size) * size; z < area.maxZ; z += size) {
      const x0 = x, z0 = z;
      add(x0 + size / 2, z0 + size / 2, (b) => groundCover(b, plan, H, x0, z0, size));
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
    add(j.p[0], j.p[1], (b) => buildPlaza(b, poly, H, { material: allRural ? 'gravel' : 'paving_basalt', lift: LIFT.junction, cell: 2.5, skirt: 0.35 }));
  }

  // ---- atlas roads
  plan.roads.forEach((road, ri) => {
    const L = lineLength(road.points);
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
          add(mid[0], mid[1], (bld) => buildRoadPiece(bld, road, c, pts, H, capStart, capEnd));
        });
      }
    }
  });

  // ---- minor streets
  for (const st of plan.streets) {
    const L = lineLength(st.points);
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
          add((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (bld) => buildStairs(bld, a as Vec2, c as Vec2, Math.max(2.6, st.width - 0.4), (x, z) => H(x, z) + 0.04, { material: st.wealth > 0.5 ? 'travertine' : 'tufa', riser: 0.17, parapet: null }));
        }
        continue;
      }
      const pieces = chunks(s0, s1, 80);
      pieces.forEach(([p0, p1], k2) => {
        const pts = sliceLine(st.points, p0, p1);
        if (pts.length < 2) return;
        const mid = pts[Math.floor(pts.length / 2)];
        add(mid[0], mid[1], (bld) => buildMinorPiece(bld, st, pts, H, k2 === 0, k2 === pieces.length - 1));
      });
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
    } else {
      spots.push({ id: `${pz.id}:shrine`, kind: 'shrine', position: at(0, 1.6), heading: pz.facing + Math.PI, tag: 'compitum' });
    }
    const bench = rng.chance(0.7);
    if (bench) spots.push({ id: `${pz.id}:bench`, kind: 'bench', position: at(pz.r - 1.1, -0.5), heading: pz.facing - Math.PI / 2 });
    const stall = rng.chance(0.35);
    if (stall) spots.push({ id: `${pz.id}:stall`, kind: 'stall', position: at(-pz.r + 1.6, 0.4), heading: pz.facing, tag: 'market' });
    add(pz.center[0], pz.center[1], (b) => {
      const poly: Polygon = [];
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        poly.push([pz.center[0] + Math.cos(a) * pz.r, pz.center[1] + Math.sin(a) * pz.r]);
      }
      buildPlaza(b, poly, H, { material: rng.chance(0.5) ? 'paving_travertine' : 'cobbles', lift: LIFT.piazza, cell: 2.5, skirt: 0.3 });
      const d = new Draw(b).at(pz.center[0], y, pz.center[1], rot);
      if (pz.kind === 'lacus') lacus(d.at(0, 0, 0.2, 0), rng);
      else compitalShrine(d.at(0, 0, -0.6, 0), rng);
      if (bench) placeProp(d, 'bench_masonry', -(pz.r - 1.1), 0, 0.5, -Math.PI / 2, { variant: 0 });
      if (stall) placeProp(d, 'stall', pz.r - 1.6, 0, -0.4, Math.PI, { rng });
      if (rng.chance(0.4)) placeProp(d, 'amphora_stack', pz.r - 1.4, 0, 2.2, rng.range(0, 6), { rng });
    });
  }
  return { cells, junctions, spots, runs };
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

const COVER = new Set<number>([K.STREET, K.PIAZZA, K.SCRAP, K.FREE, K.MARGIN, K.ROAD, K.AQUEDUCT, K.WALL]);

/** Packed-earth quads over the covered raster classes of one cell (row runs, ≤ 4 m pieces). */
function groundCover(b: MeshBuilder, plan: CityPlan, H: HeightFn, x0: number, z0: number, size: number) {
  const g = plan.grid;
  const c = g.cell;
  const pos: number[] = [];
  const lift = 0.04;
  const iz0 = Math.max(0, g.iz(z0)), iz1 = Math.min(g.nz - 1, g.iz(z0 + size - 1e-6));
  const ix0 = Math.max(0, g.ix(x0)), ix1 = Math.min(g.nx - 1, g.ix(x0 + size - 1e-6));
  const maxRun = Math.max(1, Math.round(6 / c));
  for (let iz = iz0; iz <= iz1; iz++) {
    const za = g.z0 + iz * c, zb = za + c;
    let ix = ix0;
    while (ix <= ix1) {
      if (!COVER.has(g.cls[iz * g.nx + ix])) { ix++; continue; }
      let jx = ix;
      while (jx + 1 <= ix1 && jx + 1 - ix < maxRun && COVER.has(g.cls[iz * g.nx + jx + 1])) jx++;
      const xa = g.x0 + ix * c, xb = g.x0 + (jx + 1) * c;
      const a = [xa, H(xa, za) + lift, za], bb = [xb, H(xb, za) + lift, za], cc = [xb, H(xb, zb) + lift, zb], d = [xa, H(xa, zb) + lift, zb];
      // Up-facing winding in (x, z) with +z south: a → d → c, a → c → b.
      pos.push(...a, ...d, ...cc, ...a, ...cc, ...bb);
      ix = jx + 1;
    }
  }
  if (!pos.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  b.add(geo, 'dirt', undefined, { castShadow: false });
}

function buildRoadPiece(b: MeshBuilder, road: PlanRoad, ctx: string, pts: Vec2[], H: HeightFn, capStart: boolean, capEnd: boolean) {
  if (road.style === 'stairs') {
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], c = pts[k + 1];
      // Flights of ~8 m with landings at the joints.
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const n = Math.max(1, Math.ceil(L / 8));
      for (let j = 0; j < n; j++) {
        const p0: Vec2 = [a[0] + ((c[0] - a[0]) * j) / n, a[1] + ((c[1] - a[1]) * j) / n];
        const p1: Vec2 = [a[0] + ((c[0] - a[0]) * (j + 1)) / n, a[1] + ((c[1] - a[1]) * (j + 1)) / n];
        buildStairs(b, p0, p1, road.carriage, (x, z) => H(x, z) + 0.05, { material: 'travertine', riser: 0.17, parapet: 'tufa' });
      }
    }
    return;
  }
  const spec: StreetSpec = { points: pts, lift: LIFT.road, capStart, capEnd, steppingStones: [], seed: road.index };
  if (road.style === 'paved' && ctx === 'urban') {
    Object.assign(spec, { kind: 'paved', roadWidth: road.carriage, sidewalk: road.sidewalk, curb: 0.2 });
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
    buildStreet(b, { points: pts, kind: 'paved', roadWidth: st.width - 2 * sw, sidewalk: sw, curb: 0.16, lift: LIFT.vicus, capStart, capEnd, steppingStones: [], seed: st.index }, H);
  } else if (st.kind === 'lane') {
    buildStreet(b, { points: pts, kind: 'lane', roadWidth: st.width, roadMaterial: st.wealth > 0.45 ? 'paving_basalt' : 'cobbles', lift: LIFT.lane, seed: st.index }, H);
  } else {
    buildStreet(b, { points: pts, kind: 'lane', roadWidth: st.width, roadMaterial: st.density > 0.85 ? 'dirt' : 'gravel', lift: LIFT.alley, seed: st.index }, H);
  }
}

export type { PlanPiazza };
