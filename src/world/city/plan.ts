/**
 * City planning (pure, no Three.js): turns the atlas and the heightmap into a street network and
 * city blocks over a class raster (see raster.ts).
 *
 *   1. Ground classes: outside the 14 regions, river and banks, slopes too steep to build on,
 *      horti and groves, open fora, landmark footprints with a walkable margin, atlas roads,
 *      standing stretches of the Servian wall (and the agger promenade), aqueduct arcades.
 *   2. Minor streets: every buildable component is split recursively by organic streets (vici,
 *      lanes, angiportus) until blocks reach a size that suits the quarter. On slopes the splits
 *      follow the contours (terraces); streets that climb the fall line turn into stairs.
 *   3. Small piazzas at junctions (a lacus fountain every ~90 m, compital shrines at crossroads).
 *   4. The remaining components become blocks: traced, simplified, with frontage edges, sidewalk
 *      heights, density / wealth / height limits from the regions and quarters, and the GDD §12.3
 *      sightline rule (≤ 4 storeys within 150 m of a major landmark). Thin quarters with low
 *      density turn into gardens.
 *
 * Everything is in GAME meters (atlas real meters × WORLD_SCALE). Deterministic.
 */
import { Rng, hash2 } from '../../core/Rng';
import type * as Atlas from '../../data/atlas';
import { WORLD_SCALE } from '../coords';
import { footprintPolygon, type P2 } from '../terrain/heightmap';
import { CORRIDORS, DISTRICT_LANDMARKS, EXTRA_ROADS, OPEN_SPACES, QUARTERS, SIGHTLINE_LANDMARKS, SIGHTLINE_RADIUS, SKIPPED_AQUEDUCTS, WILD_LANDMARKS, type Quarter } from './data';
import { probeEnd } from './audit';
import { closeStubs } from './stubs';
import { Grid, K, cleanRing, components, pointInPoly, polyBounds, polyCentroid, signedArea, simplifyRing, splitCells, traceLoops, type Pt } from './raster';

const S = WORLD_SCALE;
/** Raster margin on each side of a minor street's surface (the block outline never reaches the street). */
const STREET_MARGIN = 0.9;
/** Douglas–Peucker tolerance of block outlines (< STREET_MARGIN + half a cell, so they stay clear of the streets). */
const OUTLINE_TOL = 1.5;

export type PlanAtlas = Pick<typeof Atlas, 'ROADS' | 'WALLS' | 'GATES' | 'AQUEDUCTS' | 'REGIONS' | 'LANDMARKS' | 'RIVERS' | 'ISLANDS' | 'CORE_BOUNDS' | 'CITY_BOUNDS'> & Partial<Pick<typeof Atlas, 'BRIDGES' | 'DETAIL_REGIONS'>>;

export interface HeightSource {
  heightAt(x: number, z: number): number;
  waterLevelY: number;
}

export interface Bounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface PlanOptions {
  /** Planned area (game m). Default: the atlas CITY_BOUNDS. */
  bounds?: Bounds;
  /** Blocks whose centroid lies inside get full detail (game m). Default: CORE_BOUNDS + 150 m real. */
  detailBounds?: Bounds;
  /**
   * Also detail the golden-path corridors (data.ts CORRIDORS) with this margin (REAL m) round
   * them, so the way in from the spawn is never far massing. Default 150; null = core only.
   */
  corridorDetail?: number | null;
  /** Raster cell (game m). */
  cell?: number;
  seed?: number;
  /** Merge cell size for far massing (game m). */
  mergeCell?: number;
  /** Streets added to the atlas roads (default data.ts EXTRA_ROADS). */
  extraRoads?: typeof EXTRA_ROADS;
  /** Extend the minor-street stubs to the next street and open courts (default true; false = the pre-rework plan, for the audit). */
  closeStubs?: boolean;
}

export type RoadStyle = 'paved' | 'rural' | 'gravel' | 'dirt' | 'stairs' | 'path';

export interface PlanRoad {
  id: string;
  index: number;
  name: string;
  kind: string;
  style: RoadStyle;
  points: Pt[];
  /** Carriageway (or lane) width, game m. */
  carriage: number;
  /** Sidewalk width on each side where urban (0 = none). */
  sidewalk: number;
  /** Half of the full surface width (carriage + sidewalks). */
  half: number;
}

export type StreetKind = 'vicus' | 'lane' | 'alley';

export interface PlanStreet {
  id: string;
  index: number;
  points: Pt[];
  /** Surface width (game m). */
  width: number;
  kind: StreetKind;
  level: number;
  /** Per segment: a flight of steps (grade too steep for a ramp). */
  steps: boolean[];
  density: number;
  wealth: number;
  corridor: boolean;
}

export interface PlanBlock {
  id: string;
  index: number;
  /** Property line (outer edge of the sidewalks), positive orientation. */
  outline: Pt[];
  /** Islands inside the block that stay clear (landmarks, rocks…). */
  holes: Pt[][];
  area: number;
  centroid: Pt;
  /** Radius of a circle around the centroid containing the outline. */
  radius: number;
  kind: 'built' | 'garden';
  region: string;
  quarter: string | null;
  density: number;
  wealth: number;
  maxStoreys: number;
  allowHorrea: boolean;
  yard: 'dirt' | 'cobbles' | 'gravel';
  frontEdges: number[];
  /** Raised sidewalk height in front of each outline edge. */
  sidewalk: number[];
  /** Inside the detail area (full / mid detail is built near the player). */
  detailed: boolean;
  /** Key of the far-massing merge cell. */
  cell: string;
  seed: number;
  /** Mean terrain slope (rise / run) under the block. */
  slope: number;
  /** On the golden path (data.ts CORRIDORS): always built, dressed with more lamps and stalls. */
  corridor: boolean;
}

export interface PlanPiazza {
  id: string;
  center: Pt;
  r: number;
  kind: 'lacus' | 'compitum';
  /** Heading (model +Z convention) from the piazza toward the street it opens on. */
  facing: number;
  /** The junction point on the street network. */
  junction: Pt;
}

export interface PlanWall {
  id: string;
  points: Pt[];
  height: number;
  thickness: number;
  state: string;
  /** Agger: earth bank on the city side, game m wide (sign: side of the left normal). */
  agger?: { width: number; side: number };
}

export interface PlanGate {
  id: string;
  name: string;
  at: Pt;
  /** Three.js rotation.y of the gate (local −z faces outward, like a landmark facade). */
  rotationY: number;
  kind: 'arch' | 'ruin';
  /** Passage width (game m), wide enough for the road through it. */
  passage: number;
}

export interface PlanAqueduct {
  id: string;
  name: string;
  points: Pt[];
  /** Game y of the channel top at each point. */
  channelY: number[];
  kind: 'arcade' | 'mixed';
}

export interface CityPlan {
  grid: Grid;
  /** Cell-centre terrain heights (game y). */
  hy: Float32Array;
  /** Region index per cell (255 = none). */
  region: Uint8Array;
  roads: PlanRoad[];
  streets: PlanStreet[];
  blocks: PlanBlock[];
  piazzas: PlanPiazza[];
  walls: PlanWall[];
  gates: PlanGate[];
  aqueducts: PlanAqueduct[];
  /** Bridges (built by the bridges module; the street graph walks over them). */
  bridges: { id: string; a: Pt; b: Pt; width: number }[];
  /** Open spaces / plazas (game polygons) for paving, markets and the street graph. */
  plazas: { id: string; polygon: Pt[]; kind: string }[];
  /** The core detail rectangle (game m). */
  detailBounds: Bounds;
  /** Every detail rectangle: the core and the corridors' boxes (game m). */
  detailRects: Bounds[];
  /** Inside the detail area (grown by `grow` m)? */
  inDetail(x: number, z: number, grow?: number): boolean;
  mergeCell: number;
  /** Category of each atlas landmark (raster owner ids of LANDMARK / MARGIN / PLAZA cells index this). */
  landmarkCategory: string[];
  /** Footprints (game m) of the solid landmarks (buildings with a walkable margin round them). */
  landmarkPolys: { index: number; id: string; category: string; poly: Pt[] }[];
  /** On the golden path (data.ts CORRIDORS)? Game coordinates. */
  corridor(x: number, z: number): boolean;
  stats: Record<string, number>;
}

// ---------------------------------------------------------------- helpers

const g2 = (p: readonly [number, number]): Pt => [p[0] * S, p[1] * S];
const gpoly = (pts: readonly (readonly [number, number])[]): Pt[] => pts.map(g2);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The detail rectangles: the core, plus each golden-path corridor's box grown by `margin` real m. */
export function detailArea(core: Bounds, margin: number | null, extra: readonly Bounds[] = []): Bounds[] {
  const out = [core, ...extra];
  if (margin === null) return out;
  for (const c of CORRIDORS) {
    const b = polyBounds(c.points as Pt[]);
    const g = c.r + margin;
    const r = { minX: (b.minX - g) * S, minZ: (b.minZ - g) * S, maxX: (b.maxX + g) * S, maxZ: (b.maxZ + g) * S };
    // Only what sticks out of the core needs a rectangle of its own.
    if (r.minX >= core.minX && r.maxX <= core.maxX && r.minZ >= core.minZ && r.maxZ <= core.maxZ) continue;
    out.push(r);
  }
  return out;
}

export function inRects(rects: readonly Bounds[], x: number, z: number, grow = 0): boolean {
  for (const b of rects) if (x >= b.minX - grow && x <= b.maxX + grow && z >= b.minZ - grow && z <= b.maxZ + grow) return true;
  return false;
}

/** Bounding box of rectangles (grown). */
export function rectsBounds(rects: readonly Bounds[], grow = 0): Bounds {
  return {
    minX: Math.min(...rects.map((b) => b.minX)) - grow, minZ: Math.min(...rects.map((b) => b.minZ)) - grow,
    maxX: Math.max(...rects.map((b) => b.maxX)) + grow, maxZ: Math.max(...rects.map((b) => b.maxZ)) + grow,
  };
}

export function scaleBounds(b: Bounds, grow = 0): Bounds {
  return { minX: (b.minX - grow) * S, minZ: (b.minZ - grow) * S, maxX: (b.maxX + grow) * S, maxZ: (b.maxZ + grow) * S };
}

/** Road surface dimensions (game m) from an atlas road. */
export function roadDims(r: { kind: string; width: number; paving: string }): { style: RoadStyle; carriage: number; sidewalk: number } {
  const w = r.width * S;
  if (r.kind === 'stairs') return { style: 'stairs', carriage: Math.max(2.6, w), sidewalk: 0 };
  if (r.kind === 'path') return { style: 'path', carriage: Math.max(2.2, w), sidewalk: 0 };
  if (r.paving === 'gravel') return { style: 'gravel', carriage: Math.min(5, Math.max(3, w)), sidewalk: 0 };
  if (r.paving === 'dirt') return { style: 'dirt', carriage: Math.min(5, Math.max(3, w)), sidewalk: 0 };
  return { style: 'paved', carriage: Math.min(6.5, Math.max(3.2, w)), sidewalk: Math.min(2.2, Math.max(1.2, 0.9 + r.width * 0.12)) };
}

/** Quarter weight at a real-meter point (1 inside, fading out at circle edges). */
function quarterWeight(q: Quarter, x: number, z: number): number {
  if (q.polygon) return pointInPoly(x, z, q.polygon as Pt[]) ? 1 : 0;
  const d = Math.hypot(x - q.center![0], z - q.center![1]);
  return 1 - smooth(q.r! * 0.7, q.r!, d);
}

// ---------------------------------------------------------------- main

export function planCity(atlas: PlanAtlas, hm: HeightSource, opts: PlanOptions = {}): CityPlan {
  const t0 = now();
  const stats: Record<string, number> = {};
  const cell = opts.cell ?? 2;
  const bounds = opts.bounds ?? scaleBounds(atlas.CITY_BOUNDS);
  const detailBounds = opts.detailBounds ?? scaleBounds(atlas.CORE_BOUNDS, 150);
  // The core, the regions built to the same detail (atlas.DETAIL_REGIONS), the golden-path corridors.
  const extra = opts.corridorDetail === null ? [] : (atlas.DETAIL_REGIONS ?? []).map((r) => scaleBounds(r));
  const detailRects = detailArea(detailBounds, opts.corridorDetail === undefined ? 150 : opts.corridorDetail, extra);
  const inDetail = (x: number, z: number, grow = 0) => inRects(detailRects, x, z, grow);
  const mergeCell = opts.mergeCell ?? 256;
  const seed = opts.seed ?? 113;
  const g = Grid.over(bounds, cell);
  const { nx, nz } = g;
  const N = nx * nz;
  const cls = g.cls;
  cls.fill(K.OUTSIDE);

  // Terrain heights at cell centres.
  const hy = new Float32Array(N);
  for (let iz = 0; iz < nz; iz++) {
    const z = g.cz(iz);
    for (let ix = 0; ix < nx; ix++) hy[iz * nx + ix] = hm.heightAt(g.cx(ix), z);
  }
  stats.heightsMs = now() - t0;

  // 1. Regions → buildable.
  const region = new Uint8Array(N).fill(255);
  atlas.REGIONS.forEach((r, ri) =>
    g.scanPolygon(gpoly(r.polygon), (i) => {
      if (region[i] === 255) region[i] = ri;
      cls[i] = K.FREE;
    }),
  );

  // 2. Water: the Tiber and the Euripus with their banks; the island rises out of it.
  for (const r of atlas.RIVERS) {
    const cl = r.centerline;
    const bank = r.kind === 'canal' ? 2.5 : 5;
    for (let k = 0; k + 1 < cl.length; k++) {
      const half = (Math.max(r.width[k] ?? 0, r.width[k + 1] ?? r.width[k] ?? 0) / 2 + bank) * S;
      g.scanSegment(g2(cl[k]), g2(cl[k + 1]), half, (i) => (cls[i] = K.WATER));
    }
  }
  const tiberRegion = atlas.REGIONS.findIndex((r) => r.id === 'regio-xiv');
  for (const isl of atlas.ISLANDS) {
    g.scanPolygon(gpoly(isl.outline), (i) => {
      cls[i] = K.FREE;
      if (region[i] === 255) region[i] = tiberRegion;
    });
  }

  // 3. Slopes too steep to build on (> ~28°).
  const steepTan = Math.tan((28 * Math.PI) / 180);
  for (let iz = 1; iz < nz - 1; iz++) {
    for (let ix = 1; ix < nx - 1; ix++) {
      const i = iz * nx + ix;
      if (cls[i] !== K.FREE) continue;
      const gx = (hy[i + 1] - hy[i - 1]) / (2 * cell), gz = (hy[i + nx] - hy[i - nx]) / (2 * cell);
      if (gx * gx + gz * gz > steepTan * steepTan) cls[i] = K.STEEP;
    }
  }

  // 4. Gardens, groves and open fora (landmarks are stamped over them afterwards).
  const plazas: CityPlan['plazas'] = [];
  const soft = (c: number) => c === K.FREE || c === K.STEEP || c === K.OUTSIDE;
  for (const os of OPEN_SPACES) {
    const poly = gpoly(os.polygon);
    g.fillPolygon(poly, os.kind === 'plaza' ? K.PLAZA : K.GARDEN, soft);
    if (os.kind === 'plaza') plazas.push({ id: os.id, polygon: poly, kind: 'forum' });
  }
  const lmPolys: { lm: (typeof atlas.LANDMARKS)[number]; poly: Pt[]; solid: boolean; index: number }[] = [];
  atlas.LANDMARKS.forEach((lm, index) => {
    if (DISTRICT_LANDMARKS.has(lm.id) || lm.siting === 'underground') return;
    const poly = gpoly(footprintPolygon(lm.center, lm.rotation, lm.footprint as never));
    const garden = (lm.category === 'garden' && lm.height === 0) || WILD_LANDMARKS.has(lm.id);
    if (garden) {
      g.fillPolygon(poly, K.GARDEN, soft);
      return;
    }
    const open = lm.siting === 'open';
    lmPolys.push({ lm, poly, solid: !open, index });
  });
  for (const l of lmPolys) {
    if (l.solid) continue;
    g.fillPolygon(l.poly, K.PLAZA, (c) => soft(c) || c === K.GARDEN, l.index);
    plazas.push({ id: l.lm.id, polygon: l.poly, kind: l.lm.category });
  }
  for (const l of lmPolys) if (l.solid) g.fillPolygon(l.poly, K.LANDMARK, (c) => c !== K.WATER, l.index);
  const MARGIN = 6;
  for (const l of lmPolys) {
    if (!l.solid) continue;
    const p = l.poly;
    for (let k = 0; k < p.length; k++) {
      g.scanSegment(p[k], p[(k + 1) % p.length], MARGIN, (i) => {
        if (cls[i] === K.FREE || cls[i] === K.STEEP) {
          cls[i] = K.MARGIN;
          g.owner[i] = l.index;
        }
      });
    }
  }
  stats.groundMs = now() - t0;

  // 5. Atlas roads.
  const roads: PlanRoad[] = [];
  const roadable = (c: number) => c === K.FREE || c === K.STEEP || c === K.OUTSIDE || c === K.GARDEN || c === K.MARGIN || c === K.PLAZA;
  [...atlas.ROADS, ...(opts.extraRoads ?? EXTRA_ROADS)].forEach((r) => {
    if (r.points.length < 2) return;
    const d = roadDims(r);
    const pts = gpoly(r.points);
    const road: PlanRoad = { id: r.id, index: roads.length, name: r.name, kind: r.kind, style: d.style, points: pts, carriage: d.carriage, sidewalk: d.sidewalk, half: d.carriage / 2 + d.sidewalk };
    roads.push(road);
    g.fillBand(pts, road.half + 0.7, K.ROAD, roadable, 1_000_000 + road.index);
  });

  // 6. Servian wall remnants (standing stretches), the agger promenade, and gates.
  const walls: PlanWall[] = [];
  for (const w of atlas.WALLS) {
    if (w.height <= 0) continue;
    const pts = gpoly(w.points);
    const wall: PlanWall = { id: w.id, points: pts, height: w.height * S, thickness: w.thickness * S, state: w.state };
    if (w.rampartWidth) {
      // The bank lies on the city side: the side of the polyline facing the Forum (origin).
      let side = 0;
      for (let k = 0; k + 1 < pts.length; k++) {
        const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
        const nxv = -(bz - az), nzv = bx - ax;
        side += nxv * -(ax + bx) / 2 + nzv * -(az + bz) / 2;
      }
      wall.agger = { width: w.rampartWidth * S, side: side >= 0 ? 1 : -1 };
      const off = offsetLine(pts, (wall.thickness / 2 + wall.agger.width / 2) * wall.agger.side);
      g.fillBand(off, wall.agger.width / 2, K.GARDEN, (c) => c === K.FREE || c === K.STEEP || c === K.OUTSIDE || c === K.MARGIN);
    }
    walls.push(wall);
    if (w.state !== 'built-over') g.fillBand(pts, wall.thickness / 2 + 0.8, K.WALL, (c) => c === K.FREE || c === K.STEEP || c === K.OUTSIDE || c === K.GARDEN || c === K.MARGIN);
  }
  const gates: PlanGate[] = [];
  for (const gt of atlas.GATES) {
    if (gt.landmarkId) continue;
    const st = gt.state.toLowerCase();
    if (/site only|vanished|no structure/.test(st)) continue;
    const kind = /fragment/.test(st) ? 'ruin' : 'arch';
    const at = g2(gt.at);
    // Widest road through the gate (if any) sets the passage.
    let passage = 3.6;
    for (const r of roads) {
      for (let k = 0; k + 1 < r.points.length; k++) {
        if (distSeg(at, r.points[k], r.points[k + 1]) < 8) passage = Math.max(passage, r.carriage + 0.8);
      }
    }
    gates.push({ id: gt.id, name: gt.name, at, rotationY: -(gt.rotation * Math.PI) / 180, kind, passage });
  }

  // 7. Aqueduct arcades (where the channel stands clear of the ground).
  const aqueducts: PlanAqueduct[] = [];
  for (const a of atlas.AQUEDUCTS) {
    if (a.kind === 'underground') continue;
    const pts = gpoly(a.points);
    // Built by a landmark (the Janiculum mill race): keep its line clear of blocks, draw nothing.
    if (SKIPPED_AQUEDUCTS.has(a.id)) {
      for (let k = 0; k + 1 < pts.length; k++) g.fillBand([pts[k], pts[k + 1]], 9, K.AQUEDUCT, (c) => c === K.FREE || c === K.STEEP || c === K.OUTSIDE || c === K.GARDEN || c === K.MARGIN);
      continue;
    }
    const ys = a.channelElevation.map((e) => e * S);
    aqueducts.push({ id: a.id, name: a.name, points: pts, channelY: ys, kind: a.kind as 'arcade' | 'mixed' });
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(L / 4));
      for (let j = 0; j < n; j++) {
        const t0 = j / n, t1 = (j + 1) / n;
        const p0: Pt = [ax + (bx - ax) * t0, az + (bz - az) * t0], p1: Pt = [ax + (bx - ax) * t1, az + (bz - az) * t1];
        const y = ys[k] + (ys[k + 1] - ys[k]) * (t0 + t1) / 2;
        const gy = hm.heightAt((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2);
        if (y - gy < 1.2) continue;
        g.fillBand([p0, p1], 3.2, K.AQUEDUCT, (c) => c === K.FREE || c === K.STEEP || c === K.OUTSIDE || c === K.GARDEN || c === K.MARGIN);
      }
    }
  }
  stats.featuresMs = now() - t0;

  // 8. Minor streets: recursive organic subdivision of the buildable components.
  const quarterAt = (gx: number, gz: number) => {
    const x = gx / S, z = gz / S;
    let best: Quarter | null = null, bw = 0;
    for (const q of QUARTERS) {
      const w = quarterWeight(q, x, z);
      if (w > bw) { bw = w; best = q; }
    }
    return { q: best, w: bw };
  };
  const corridorAt = (gx: number, gz: number) => {
    const x = gx / S, z = gz / S;
    let best: (typeof CORRIDORS)[number] | null = null, bw = 0;
    for (const c of CORRIDORS) {
      let d = Infinity;
      for (let k = 0; k + 1 < c.points.length; k++) d = Math.min(d, distSeg([x, z], c.points[k] as Pt, c.points[k + 1] as Pt));
      const w = 1 - smooth(c.r * 0.6, c.r, d);
      if (w > bw) { bw = w; best = c; }
    }
    return { c: best, w: bw };
  };
  const character = (gx: number, gz: number) => {
    const i = g.index(gx, gz);
    const ri = i >= 0 ? region[i] : 255;
    const reg = ri !== 255 ? atlas.REGIONS[ri] : null;
    let density = reg?.density ?? 0.5, wealth = reg?.wealth ?? 0.5;
    const { q, w } = quarterAt(gx, gz);
    if (q && w > 0) {
      density += ((q.density ?? density) - density) * w;
      wealth += ((q.wealth ?? wealth) - wealth) * w;
    }
    // The golden path is packed with shops whatever the region (the Palatine's and Regio I's
    // averages would leave it half gardens).
    const cor = corridorAt(gx, gz);
    if (cor.c && cor.w > 0) {
      density = Math.max(density, density + (cor.c.density - density) * cor.w);
      wealth += (cor.c.wealth - wealth) * cor.w;
    }
    return { reg, density, wealth, q: w > 0.5 ? q : null, corridor: cor.w > 0.5 };
  };

  const streets: PlanStreet[] = [];
  const lab = new Int32Array(N).fill(-1);
  const mark = new Int32Array(N);
  const depthGrid = new Int32Array(N);
  const bfsQueue = new Int32Array(N);
  let stamp = 1;
  let nextId = 0;
  interface Comp { id: number; cells: Int32Array; level: number }
  const queue: Comp[] = [];
  const finals: Comp[] = [];
  for (const cells of components(g, (i) => cls[i] === K.FREE).comps) {
    const id = nextId++;
    for (const i of cells) lab[i] = id;
    queue.push({ id, cells, level: 0 });
  }
  const rng = new Rng(seed);
  const cellArea = cell * cell;
  let guard = 0;
  while (queue.length && guard++ < 200000) {
    const c = queue.pop()!;
    const area = c.cells.length * cellArea;
    if (area < 150) {
      for (const i of c.cells) if (cls[i] === K.FREE) cls[i] = K.SCRAP;
      continue;
    }
    // Shape statistics: centroid and principal axes.
    let sx = 0, sz = 0;
    for (const i of c.cells) { sx += i % nx; sz += (i / nx) | 0; }
    const n = c.cells.length;
    const mx = sx / n, mz = sz / n;
    let cxx = 0, czz = 0, cxz = 0;
    for (const i of c.cells) {
      const dx = (i % nx) - mx, dz = ((i / nx) | 0) - mz;
      cxx += dx * dx; czz += dz * dz; cxz += dx * dz;
    }
    const ang = 0.5 * Math.atan2(2 * cxz, cxx - czz);
    const u: Pt = [Math.cos(ang), Math.sin(ang)], v: Pt = [-u[1], u[0]];
    const ext = (dir: Pt) => {
      let lo = Infinity, hi = -Infinity;
      for (const i of c.cells) {
        const p = (i % nx) * dir[0] + ((i / nx) | 0) * dir[1];
        if (p < lo) lo = p;
        if (p > hi) hi = p;
      }
      return { lo: lo * cell, hi: hi * cell, len: (hi - lo + 1) * cell };
    };
    const eu = ext(u), ev = ext(v);
    const cxw = g.cx(Math.round(mx)), czw = g.cz(Math.round(mz));
    const ch = character(cxw, czw);
    const A = 1350 + (1 - ch.density) * 2600 + ch.wealth * 1600;
    const side = Math.sqrt(A);
    // Terrain gradient over the component (coarse: finite differences over ±10 m at the centroid).
    const gxv = (hm.heightAt(cxw + 10, czw) - hm.heightAt(cxw - 10, czw)) / 20;
    const gzv = (hm.heightAt(cxw, czw + 10) - hm.heightAt(cxw, czw - 10)) / 20;
    const slope = Math.hypot(gxv, gzv);
    let split: Pt | null = null; // street direction
    const meanW = area / eu.len; // mean width across the long axis
    if (slope > 0.08) {
      // Hillside: long terraces along the contours, occasional stairs up the fall line.
      const gd: Pt = [gxv / slope, gzv / slope], cd: Pt = [-gd[1], gd[0]];
      const ec = ext(cd);
      const depth = area / ec.len; // mean terrace depth across the contours
      if (depth > Math.max(30, side * 1.25)) split = cd;
      else if (ec.len > side * 2.4) split = gd;
    }
    if (!split) {
      if (eu.len > side * 1.45 || (area > A * 1.35 && eu.len >= meanW * 1.2)) split = v;
      else if (area > A * 1.35 && meanW > side * 1.1) split = u;
    }
    if (!split || meanW < 20) {
      finals.push(c);
      continue;
    }
    // Street hierarchy: big components get vici, smaller ones lanes and alleys.
    const level = c.level;
    const width = area > A * 5 ? 5.4 + ch.wealth * 0.6 : area > A * 2.2 ? 4.2 : 3.2;
    const kind: StreetKind = width >= 5 ? 'vicus' : width >= 4 ? 'lane' : 'alley';
    // Depth of each cell (4-neighbour steps to the component's edge), for good split starts.
    cellDepth(c.cells, c.id);
    let made: Pt[] | null = null;
    for (let attempt = 0; attempt < 6 && !made; attempt++) {
      // Split point: around the middle across the street direction (the other way after 3 tries).
      const sd: Pt = attempt < 3 ? split : [-split[1], split[0]];
      const across: Pt = [-sd[1], sd[0]];
      const ea = ext(across);
      const f = rng.range(0.38, 0.62);
      const along = (ea.lo + ea.len * f) / cell;
      // Start at the deepest component cell in a band around the split position (the centroid may
      // lie outside a C-shaped component, and a start on its rim gives a stub).
      const band = Math.max(3, (ea.len / cell) * 0.12);
      let start = -1, bd = -1;
      for (let q = 0; q < c.cells.length; q++) {
        const i = c.cells[q];
        const pa = (i % nx) * across[0] + ((i / nx) | 0) * across[1];
        if (Math.abs(pa - along) > band) continue;
        if (depthGrid[i] > bd) { bd = depthGrid[i]; start = i; }
      }
      if (start < 0 || bd < 3) continue;
      const p0: Pt = [g.cx(start % nx), g.cz((start / nx) | 0)];
      const jitter = rng.range(-0.18, 0.18) * ((attempt % 3) + 1);
      const dir: Pt = rot(sd, jitter);
      const contour = slope > 0.08 && Math.abs(dir[0] * gxv + dir[1] * gzv) / slope < 0.5;
      const fwd = march(p0, dir, c.id, contour);
      const back = march(p0, [-dir[0], -dir[1]], c.id, contour);
      const line = [...back.reverse(), p0, ...fwd];
      if (polylineLen(line) < 14) continue;
      made = line;
    }
    if (!made) {
      finals.push(c);
      continue;
    }
    // Stamp the street band (only inside this component).
    const pts = simplifyOpen(made, 0.35);
    const si = streets.length;
    g.scanPolyline(pts, width / 2 + STREET_MARGIN, (i) => {
      if (lab[i] === c.id && cls[i] === K.FREE) {
        cls[i] = K.STREET;
        g.owner[i] = si;
        lab[i] = -1;
      }
    });
    // Minor streets never get flights: a straight flight laid between two points of a curved
    // slope stood out of the ground (or into it), and stubs led nowhere where the lane beyond was
    // not built. A steep lane is a ramp that follows the ground (the character climbs 50°); the
    // atlas's own stairways (scalae) keep their steps (roads.ts stairsRoad).
    const steps: boolean[] = pts.slice(1).map(() => false);
    streets.push({ id: `st${si}`, index: si, points: pts, width, kind, level, steps, density: ch.density, wealth: ch.wealth, corridor: ch.corridor });
    // Re-label the pieces.
    const pieces = splitCells(g, c.cells, (i) => lab[i] === c.id && cls[i] === K.FREE, mark, stamp);
    stamp += 2;
    for (const p of pieces) {
      const id = nextId++;
      for (const i of p) lab[i] = id;
      queue.push({ id, cells: p, level: level + 1 });
    }
  }
  // 8b. Stubs: streets the marcher stopped at a sliver, an apron or a slope reach the nearest
  // road / street / square within 15 m; the ones with nothing in reach get a court (step 9).
  const stubFix = opts.closeStubs === false ? { extended: 0, orphans: [] } : closeStubs(g, streets, STREET_MARGIN);
  for (const s of streets) while (s.steps.length < s.points.length - 1) s.steps.push(false);
  stats.stubsClosed = stubFix.extended;
  stats.streets = streets.length;
  stats.subdivideMs = now() - t0;

  /** Multi-source BFS distance (in cells) from the component's boundary, written into `depthGrid`. */
  function cellDepth(cells: Int32Array, id: number) {
    const queue = bfsQueue;
    let tail = 0;
    for (const i of cells) {
      const ix = i % nx;
      if (ix === 0 || ix === nx - 1 || lab[i - 1] !== id || lab[i + 1] !== id || lab[i - nx] !== id || lab[i + nx] !== id) {
        depthGrid[i] = 0;
        queue[tail++] = i;
      } else depthGrid[i] = -1;
    }
    for (let h = 0; h < tail; h++) {
      const i = queue[h];
      const di = depthGrid[i] + 1;
      if (lab[i - 1] === id && depthGrid[i - 1] < 0) { depthGrid[i - 1] = di; queue[tail++] = i - 1; }
      if (lab[i + 1] === id && depthGrid[i + 1] < 0) { depthGrid[i + 1] = di; queue[tail++] = i + 1; }
      if (lab[i - nx] === id && depthGrid[i - nx] < 0) { depthGrid[i - nx] = di; queue[tail++] = i - nx; }
      if (lab[i + nx] === id && depthGrid[i + nx] < 0) { depthGrid[i + nx] = di; queue[tail++] = i + nx; }
    }
  }

  /** Walk from p along dir while inside component `id`; contour streets keep to their level. */
  function march(p: Pt, dir0: Pt, id: number, contour: boolean): Pt[] {
    const out: Pt[] = [];
    let x = p[0], z = p[1];
    let dx = dir0[0], dz = dir0[1];
    const step = cell * 0.5;
    const y0 = hm.heightAt(x, z);
    let drift = 0;
    for (let k = 0; k < 1200; k++) {
      if (contour) {
        // Follow the local contour, nudged back toward the starting level.
        const ex = (hm.heightAt(x + 3, z) - hm.heightAt(x - 3, z)) / 6, ez = (hm.heightAt(x, z + 3) - hm.heightAt(x, z - 3)) / 6;
        const gl = Math.hypot(ex, ez);
        if (gl > 0.03) {
          let cx = -ez / gl, cz = ex / gl;
          if (cx * dx + cz * dz < 0) { cx = -cx; cz = -cz; }
          const dy = hm.heightAt(x, z) - y0;
          // Move down-gradient when above the start level, up when below.
          const corr = Math.max(-0.4, Math.min(0.4, -dy * 0.25));
          cx += (ex / gl) * corr; cz += (ez / gl) * corr;
          const nl = Math.hypot(cx, cz);
          dx = dx * 0.6 + (cx / nl) * 0.4; dz = dz * 0.6 + (cz / nl) * 0.4;
        }
      } else {
        drift += (rng.next() - 0.5) * 0.02;
        drift = Math.max(-0.012, Math.min(0.012, drift));
        const c = Math.cos(drift), s = Math.sin(drift);
        [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
      }
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      const nxp = x + dx * step, nzp = z + dz * step;
      const i = g.index(nxp, nzp);
      if (i < 0 || lab[i] !== id) {
        // Reach a little past the edge so the street meets what lies beyond.
        out.push([nxp + dx * 0.6, nzp + dz * 0.6]);
        break;
      }
      x = nxp; z = nzp;
      if (k % 2 === 1) out.push([x, z]);
    }
    return out;
  }

  // 9. Piazzas at junctions: a lacus every ~90 m, compital shrines at crossroads.
  const piazzas: PlanPiazza[] = [];
  {
    const prng = new Rng(seed ^ 0x51ed);
    const ends: { p: Pt; dir: Pt; s: PlanStreet }[] = [];
    for (const s of streets) {
      const p = s.points;
      if (p.length < 2) continue;
      ends.push({ p: p[0], dir: unit(p[0][0] - p[1][0], p[0][1] - p[1][1]), s });
      const m = p.length - 1;
      ends.push({ p: p[m], dir: unit(p[m][0] - p[m - 1][0], p[m][1] - p[m - 1][1]), s });
    }
    prng.shuffle(ends);
    for (const e of ends) {
      const beyond = g.at(e.p[0] + e.dir[0] * 1.5, e.p[1] + e.dir[1] * 1.5);
      if (beyond !== K.ROAD && beyond !== K.STREET) continue;
      const kind: PlanPiazza['kind'] = piazzas.filter((q) => q.kind === 'lacus').length <= piazzas.length / 2 ? 'lacus' : 'compitum';
      const minSame = kind === 'lacus' ? 85 : 65;
      if (piazzas.some((q) => Math.hypot(q.junction[0] - e.p[0], q.junction[1] - e.p[1]) < (q.kind === kind ? minSame : 40))) continue;
      const r = 4.2;
      const sideSign = prng.chance(0.5) ? 1 : -1;
      const nrm: Pt = [-e.dir[1] * sideSign, e.dir[0] * sideSign];
      const off = e.s.width / 2 + STREET_MARGIN + r * 0.85;
      const center: Pt = [e.p[0] - e.dir[0] * (r + 1.2) + nrm[0] * off, e.p[1] - e.dir[1] * (r + 1.2) + nrm[1] * off];
      // Needs free ground under most of the disc.
      let free = 0, tot = 0;
      g.scanSegment(center, center, r, (i) => { tot++; if (cls[i] === K.FREE) free++; });
      if (tot === 0 || free / tot < 0.85) continue;
      g.scanSegment(center, center, r, (i) => { if (cls[i] === K.FREE) cls[i] = K.PIAZZA; });
      // Face the street the piazza opens on.
      const facing = Math.atan2(-nrm[0], -nrm[1]);
      piazzas.push({ id: `pz${piazzas.length}`, center, r, kind, facing, junction: e.p });
    }
  }
  // Courts: a street with nothing within reach ends in a small square (a compital shrine or a
  // lacus) straight ahead of it, so the lane stops somewhere (a wall, the river or a boundary
  // is reason enough to stop without one).
  {
    const crng = new Rng(seed ^ 0xc0a7);
    let courts = 0;
    for (const o of stubFix.orphans) {
      const s = streets[o.street];
      const pr = probeEnd(g, s, o.end);
      if (pr.beyond === K.OUTSIDE) continue;
      const r = 4.2;
      // Straight ahead of the end if the ground allows, else drawn back into the lane itself
      // (a wall, the river or an arcade just beyond): no building, wall, river, pier or road
      // under the disc.
      let center: Pt | null = null;
      for (const off of [r - 0.8, 0, -2, -3.5, -5.5]) {
        const c0: Pt = [pr.p[0] + pr.dir[0] * off, pr.p[1] + pr.dir[1] * off];
        if (piazzas.some((q) => Math.hypot(q.center[0] - c0[0], q.center[1] - c0[1]) < q.r + r + 8)) continue;
        let ok = 0, bad = 0, tot = 0;
        g.scanSegment(c0, c0, r, (i) => {
          tot++;
          const c = cls[i];
          if (c === K.FREE || c === K.SCRAP || c === K.STEEP || c === K.MARGIN || c === K.GARDEN || (c === K.STREET && g.owner[i] === s.index)) ok++;
          else bad++;
        });
        if (tot > 0 && bad === 0 && ok / tot >= 0.9) { center = c0; break; }
      }
      if (!center) continue;
      g.scanSegment(center, center, r, (i) => { if (cls[i] === K.FREE || cls[i] === K.SCRAP || cls[i] === K.STEEP) cls[i] = K.PIAZZA; });
      const kind: PlanPiazza['kind'] = crng.chance(0.5) ? 'lacus' : 'compitum';
      piazzas.push({ id: `pz${piazzas.length}`, center, r, kind, facing: Math.atan2(-pr.dir[0], -pr.dir[1]), junction: pr.p });
      courts++;
    }
    stats.courts = courts;
  }
  stats.piazzas = piazzas.length;

  // 10. Blocks.
  const blocks: PlanBlock[] = [];
  const majors = atlas.LANDMARKS.filter((l) => SIGHTLINE_LANDMARKS.has(l.id) || (l.priority === 1 && l.height >= 20 && l.siting !== 'open'));
  const majorGeo = majors.map((l) => ({ c: g2(l.center), r: footprintR(l.footprint, l.center) * S }));
  for (const fc of finals) {
    const pieces = splitCells(g, fc.cells, (i) => lab[i] === fc.id && cls[i] === K.FREE, mark, stamp);
    stamp += 2;
    for (const cells of pieces) {
      const area = cells.length * cellArea;
      if (area < 150) {
        for (const i of cells) cls[i] = K.SCRAP;
        continue;
      }
      for (const i of cells) mark[i] = -7;
      const loops = traceLoops(g, cells, (i) => mark[i] === -7);
      for (const i of cells) mark[i] = 0;
      const outers = loops.filter((l) => signedArea(l) > 0).sort((a, b) => signedArea(b) - signedArea(a));
      if (!outers.length) continue;
      const outline = cleanRing(simplifyRing(outers[0], OUTLINE_TOL), 0.3);
      const holes = loops.filter((l) => signedArea(l) < 0 && Math.abs(signedArea(l)) > 12).map((h) => cleanRing(simplifyRing(h.slice().reverse(), 0.8), 0.3)).filter((h) => h.length >= 3);
      const oa = signedArea(outline);
      if (outline.length < 3 || oa < 120) {
        for (const i of cells) cls[i] = K.SCRAP;
        continue;
      }
      let perim = 0;
      for (let k = 0; k < outline.length; k++) {
        const a = outline[k], b = outline[(k + 1) % outline.length];
        perim += Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
      if ((2 * oa) / perim < 6.5) {
        for (const i of cells) cls[i] = K.SCRAP;
        continue;
      }
      const centroid = polyCentroid(outline);
      let radius = 0;
      for (const p of outline) radius = Math.max(radius, Math.hypot(p[0] - centroid[0], p[1] - centroid[1]));
      const ch = character(centroid[0], centroid[1]);
      // Frontages and sidewalk heights from what lies outside each edge.
      const frontEdges: number[] = [], sidewalk: number[] = [];
      for (let k = 0; k < outline.length; k++) {
        const a = outline[k], b = outline[(k + 1) % outline.length];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const ox = (b[1] - a[1]) / (L || 1), oz = -(b[0] - a[0]) / (L || 1);
        let road = 0, street = 0, open = 0;
        for (const t of [0.2, 0.5, 0.8]) {
          const c = g.at(a[0] + (b[0] - a[0]) * t + ox * 1.6, a[1] + (b[1] - a[1]) * t + oz * 1.6);
          if (c === K.ROAD) road++;
          else if (c === K.STREET) street++;
          else if (c === K.PIAZZA || c === K.PLAZA || c === K.MARGIN || c === K.AQUEDUCT) open++;
        }
        const sw = road >= 2 ? 0.2 : street >= 2 ? 0.12 : road + street + open >= 2 ? 0.06 : 0.06;
        sidewalk.push(sw);
        if (L >= 6 && road + street + open >= 2) frontEdges.push(k);
      }
      // Slope under the block.
      const bb = polyBounds(outline);
      const sl = Math.hypot(
        (hm.heightAt(bb.maxX, centroid[1]) - hm.heightAt(bb.minX, centroid[1])) / Math.max(1, bb.maxX - bb.minX),
        (hm.heightAt(centroid[0], bb.maxZ) - hm.heightAt(centroid[0], bb.minZ)) / Math.max(1, bb.maxZ - bb.minZ),
      );
      const index = blocks.length;
      const bseed = hash2(Math.round(centroid[0]), Math.round(centroid[1]), seed);
      const brng = new Rng(bseed);
      let pGarden = smooth(0.62, 0.1, ch.density) * 0.85 + (sl > 0.28 ? 0.35 : 0);
      if (ch.corridor) pGarden = 0;
      if (!frontEdges.length) pGarden = 1;
      const garden = brng.chance(Math.min(1, pGarden));
      let maxStoreys = ch.q?.maxStoreys ?? (ch.density > 0.85 ? 6 : 5);
      for (const m of majorGeo) {
        if (Math.hypot(m.c[0] - centroid[0], m.c[1] - centroid[1]) - m.r - radius * 0.5 < SIGHTLINE_RADIUS) {
          maxStoreys = Math.min(maxStoreys, 4);
          break;
        }
      }
      const typical = ch.reg?.typical ?? [];
      const allowHorrea = !!ch.q?.horrea || ((typical.includes('warehouse') || typical.includes('horrea')) && ch.density > 0.6);
      const detailed = inDetail(centroid[0], centroid[1]);
      const blk: PlanBlock = {
        id: `b${index}`, index, outline, holes, area: oa, centroid, radius,
        kind: garden ? 'garden' : 'built',
        region: ch.reg?.id ?? 'none', quarter: ch.q?.id ?? null,
        density: ch.density, wealth: ch.wealth, maxStoreys, allowHorrea,
        // The golden path's yards are paved (no bare earth on the first walk of the game).
        yard: ch.corridor ? 'cobbles' : ch.q?.yard ?? (ch.wealth > 0.65 ? 'gravel' : ch.density > 0.8 ? 'dirt' : 'cobbles'),
        frontEdges, sidewalk, detailed,
        cell: `${Math.floor(centroid[0] / mergeCell)},${Math.floor(centroid[1] / mergeCell)}`,
        seed: bseed, slope: sl, corridor: ch.corridor,
      };
      blocks.push(blk);
      if (garden) for (const i of cells) cls[i] = K.GARDEN;
      else for (const i of cells) g.owner[i] = 2_000_000 + index;
    }
  }
  stats.blocks = blocks.length;
  stats.builtBlocks = blocks.filter((b) => b.kind === 'built').length;
  stats.totalMs = now() - t0;
  return { grid: g, hy, region, roads, streets, blocks, piazzas, walls, gates, aqueducts, bridges: (atlas.BRIDGES ?? []).map((b) => ({ id: b.id, a: g2(b.a), b: g2(b.b), width: Math.max(3, b.width * S) })), plazas, detailBounds, detailRects, inDetail, mergeCell, landmarkCategory: atlas.LANDMARKS.map((l) => l.category), landmarkPolys: lmPolys.filter((l) => l.solid).map((l) => ({ index: l.index, id: l.lm.id, category: l.lm.category, poly: l.poly })), corridor: (x, z) => corridorAt(x, z).w > 0.5, stats };
}

// ---------------------------------------------------------------- small geometry

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function rot(d: Pt, a: number): Pt {
  const c = Math.cos(a), s = Math.sin(a);
  return [d[0] * c - d[1] * s, d[0] * s + d[1] * c];
}

function unit(x: number, z: number): Pt {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}

export function polylineLen(p: readonly Pt[]): number {
  let L = 0;
  for (let k = 0; k + 1 < p.length; k++) L += Math.hypot(p[k + 1][0] - p[k][0], p[k + 1][1] - p[k][1]);
  return L;
}

function distSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]);
}

/** Douglas–Peucker on an open polyline. */
export function simplifyOpen(pts: readonly Pt[], tol: number): Pt[] {
  if (pts.length <= 2) return pts.slice() as Pt[];
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    let best = -1, bi = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = distSeg(pts[i], pts[i0], pts[i1]);
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol && bi > 0) {
      keep[bi] = 1;
      stack.push([i0, bi], [bi, i1]);
    }
  }
  return pts.filter((_, i) => keep[i]) as Pt[];
}

/** Offset a polyline sideways by d along its left normal (−dz, dx). */
export function offsetLine(pts: readonly Pt[], d: number): Pt[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const [tx, tz] = unit(b[0] - a[0], b[1] - a[1]);
    return [p[0] - tz * d, p[1] + tx * d] as Pt;
  });
}

function footprintR(fp: (typeof Atlas.LANDMARKS)[number]['footprint'], center: readonly [number, number]): number {
  if (fp.kind === 'rect') return Math.hypot(fp.w, fp.d) / 2;
  if (fp.kind === 'ellipse') return Math.max(fp.rx, fp.rz);
  if (fp.kind === 'circle') return fp.r;
  let r = 0;
  for (const [x, z] of fp.points) r = Math.max(r, Math.hypot(x - center[0], z - center[1]));
  return r;
}

export type { P2 };
