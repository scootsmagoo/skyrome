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
import { velum } from '../../arch/fabric/awnings';
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
    for (let x = bb.minX + 3; x < bb.maxX; x += 4.6) {
      for (let z = bb.minZ + 3; z < bb.maxZ; z += 4.6) {
        const p: Vec2 = [x + rng.range(-0.8, 0.8), z + rng.range(-0.8, 0.8)];
        if (!pointIn(p, pl.polygon) || edgeDist(p, pl.polygon) > 24 || edgeDist(p, pl.polygon) < 3) continue;
        // Clear ground only: no landmark, road or street under the stall or right around it.
        if ([[0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]].some(([dx, dz]) => g.at(p[0] + dx, p[1] + dz) !== K.PLAZA)) continue;
        if (!rng.chance(0.5)) continue;
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
    for (const list of byCell.values()) {
      add(list[0].p[0], list[0].p[1], (b) => {
        const d = new Draw(b);
        for (const st of list) {
          const y = H(st.p[0], st.p[1]);
          // Stall fronts (local −z) face the middle of the square.
          placeProp(d, st.kind as 'stall_fruit', st.p[0], y, st.p[1], st.facing + Math.PI, { rng });
          if (rng.chance(0.5)) placeProp(d, rng.pick(['basket', 'crate', 'amphora_stack', 'sack'] as const), st.p[0] + rng.range(-1.6, 1.6), y, st.p[1] + rng.range(-1.6, 1.6), rng.range(0, 6), { rng });
        }
      });
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
        add(p[0], p[1], (b) => cattlePen(new Draw(b).at(p[0], H(p[0], p[1]), p[1], rot), 8, 6, rng));
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
        add(a[0], a[1], (b) => {
          const d = new Draw(b);
          for (let k = 0; k < count; k++) {
            const off = road.half + 1.8;
            const x = a[0] + t[0] * (k * 5.5) + n[0] * off, zz = a[1] + t[1] * (k * 5.5) + n[1] * off;
            placeProp(d, k % 2 ? 'handcart' : 'cart', x, H(x, zz), zz, Math.atan2(t[0], t[1]) + rng.range(-0.2, 0.2), { rng });
          }
        });
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
        add(a[0], a[1], (b) => velum(new Draw(b).at(a[0], H(a[0], a[1]) + LIFT.lane, a[1], ang + Math.PI / 2), w, 2.2, 3.7, [mats[0], mats[1]]));
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

const COVER = new Set<number>([K.STREET, K.PIAZZA, K.SCRAP, K.FREE, K.MARGIN, K.ROAD, K.AQUEDUCT, K.WALL]);

/**
 * Packed earth over the covered raster classes of one cell, as marching squares on the lattice
 * of cell centres: interior squares merge into runs of up to ~6 m, the boundary squares get the
 * smooth (45°) edge pieces, so the cover never shows the raster's staircase against the grass.
 */
function groundCover(b: MeshBuilder, plan: CityPlan, H: HeightFn, x0: number, z0: number, size: number) {
  const g = plan.grid;
  const c = g.cell;
  const pos: number[] = [];
  const lift = 0.04;
  const iz0 = Math.max(0, g.iz(z0) - 1), iz1 = Math.min(g.nz - 2, g.iz(z0 + size - 1e-6));
  const ix0 = Math.max(0, g.ix(x0) - 1), ix1 = Math.min(g.nx - 2, g.ix(x0 + size - 1e-6));
  const on = (ix: number, iz: number) => COVER.has(g.cls[iz * g.nx + ix]);
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
  const maxRun = Math.max(1, Math.round(6 / c));
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
  b.add(geo, 'dirt', undefined, { castShadow: false });
}

/** A cattle pen: timber posts and two rails round a w × d rectangle, a gate gap on one side. */
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
