/**
 * CityBlockFiller: fills a city block (polygon in game coordinates) with lots facing the streets
 * around it — insulae, domus, small shop rows, the odd horrea — leaving interior yards, alleys and
 * small piazzas with fountains and shrines. Works on sloping terrain (each lot gets its own floor
 * level at the highest sidewalk point of its frontage, with plinths/stepped foundations below).
 *
 *   const r = new CityBlockFiller().fill(poly, { density: 0.8, wealth: 0.3, seed: 7, heightAt });
 *   placeAndRegister(game, 'block7', r.builder.build('block7'), r.builder.colliders, { x: 0, y: 0, z: 0 });
 *
 * The polygon is the block's property line (the outer edge of the sidewalks), unless
 * `streetWidth` is given, in which case it is treated as the street centrelines and inset.
 * Deterministic per seed. `planLots` is the pure (geometry-free) part.
 */
import * as THREE from 'three';
import { Rng } from '../../core/Rng';
import { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { placeProp } from '../props';
import { Draw } from './draw';
import { domus } from './domus';
import { lacus } from './fountain';
import { horrea } from './horrea';
import { insula, MAX_BUILDING_HEIGHT } from './insula';
import {
  distToSegment, ensurePositive, insetPolygon, obbCorners, signedArea, obbIntersectsPolygon, obbOverlap, pointInOBB, pointInPolygon, polygonBounds,
  polygonContainsOBB, rayToPolygon, type OBB,
} from './polygon';
import { compitalShrine } from './shrines';
import { buildPlaza } from './streets';
import type { BuildingOutput, HeightFn, Polygon, Spot, SpotKind, Vec2 } from './types';

export type LotKind = 'insula' | 'domus' | 'horrea' | 'shops' | 'piazza' | 'alley';

export interface FillOptions {
  heightAt: HeightFn;
  /** 0 = sparse (gaps, gardens, low buildings) … 1 = packed (continuous tall frontage). */
  density?: number;
  /** 0 = poor (tall insulae, workshops) … 1 = rich (domus, porticoes, fine shops). */
  wealth?: number;
  seed?: number;
  /** Areas to keep clear (e.g. a landmark footprint or a square). */
  avoid?: Polygon[];
  /** If > 0 the polygon is street centrelines; it is inset by half this width. */
  streetWidth?: number;
  /** Raised sidewalk height in front of each edge (number or per-edge array). Default 0.3. */
  sidewalkHeight?: number | number[];
  /** Which polygon edges are street frontages (default: all edges ≥ 8 m). */
  frontEdges?: number[];
  maxStoreys?: number;
  allowHorrea?: boolean;
  /** Ground surface for yards (null = none). */
  yard?: MaterialId | null;
  /** Prefix for lot and spot ids (e.g. 'subura3:'), so ids stay unique across blocks. */
  id?: string;
  /** Merge into this builder instead of a new one. */
  builder?: MeshBuilder;
  /**
   * 'low' builds a far-LOD stand-in with identical massing (same seed → same lots and buildings)
   * but no interiors, window dressing, tile ridges, props or colliders. Use it as the `far` object
   * of a WorldRegistry entry.
   */
  detail?: 'full' | 'low';
  /** Street props / awnings on shops (default true). */
  streetDressing?: boolean;
}

export interface LotPlan {
  id: string;
  kind: LotKind;
  obb: OBB;
  /** Polygon edge this lot fronts. */
  edge: number;
  /** Heading of the inward (depth) axis; `rotationY` for the building (front faces the street). */
  rotationY: number;
  width: number;
  depth: number;
  seed: number;
  /** Sides that touch a neighbour (party walls). */
  party: { left: boolean; right: boolean; back: boolean };
  /** Outline edge a free side faces (a corner on a side street), or −1. */
  street: { left: number; right: number };
}

export interface Lot extends LotPlan {
  /** Floor level (game y) of the building. */
  floorY: number;
  /** World position of the footprint centre at floor level. */
  center: THREE.Vector3;
  /** Eaves height above the floor. */
  height: number;
}

export interface FillResult {
  builder: MeshBuilder;
  spots: Spot[];
  lots: Lot[];
}

interface TypeDef {
  kind: LotKind;
  w: [number, number];
  d: [number, number];
}

const TYPES: Record<LotKind, TypeDef> = {
  insula: { kind: 'insula', w: [12, 21], d: [12, 19] },
  domus: { kind: 'domus', w: [15, 21], d: [26, 36] },
  horrea: { kind: 'horrea', w: [28, 38], d: [24, 32] },
  shops: { kind: 'shops', w: [8, 12], d: [8, 11] },
  piazza: { kind: 'piazza', w: [9, 14], d: [8, 12] },
  alley: { kind: 'alley', w: [2.4, 3.2], d: [0, 0] },
};

function edgeInfo(poly: Polygon, i: number) {
  const a = poly[i], b = poly[(i + 1) % poly.length];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const v: Vec2 = [-u[1], u[0]];
  return { a, b, len, u, v };
}

/** The usable block outline (positive orientation). */
export function blockOutline(polygon: Polygon, streetWidth = 0): Polygon {
  return streetWidth > 0 ? insetPolygon(polygon, streetWidth / 2) : ensurePositive(polygon);
}

/** Edge index of the caller's polygon → edge index in `blockOutline` (which may be reversed). */
function edgeMapper(polygon: Polygon): (i: number) => number {
  const n = polygon.length;
  return signedArea(polygon) < 0 ? (i) => (((n - 2 - i) % n) + n) % n : (i) => i;
}

/** Pure lot layout (no geometry). */
export function planLots(polygon: Polygon, opts: Omit<FillOptions, 'heightAt'> = {}): LotPlan[] {
  const poly = blockOutline(polygon, opts.streetWidth ?? 0);
  const rng = new Rng(opts.seed ?? 1);
  const density = opts.density ?? 0.7, wealth = opts.wealth ?? 0.4;
  const mapEdge = edgeMapper(polygon);
  const edges = (opts.frontEdges?.map(mapEdge) ?? poly.map((_, i) => i).filter((i) => edgeInfo(poly, i).len >= 8)).slice();
  edges.sort((x, y) => edgeInfo(poly, y).len - edgeInfo(poly, x).len);
  const placed: LotPlan[] = [];
  const avoid = opts.avoid ?? [];
  let lotN = 0;
  const prefix = opts.id ?? '';

  const fits = (o: OBB) =>
    polygonContainsOBB(poly, o) && !placed.some((p) => p.kind !== 'alley' && obbOverlap(p.obb, o, 0.05)) && !avoid.some((av) => obbIntersectsPolygon(o, av));

  for (const e of edges) {
    const { a, len, u, v } = edgeInfo(poly, e);
    // How deep can lots go from this edge? (meet lots from the opposite side roughly halfway)
    let reach = Infinity;
    for (const f of [0.15, 0.35, 0.5, 0.65, 0.85]) {
      const o: Vec2 = [a[0] + u[0] * len * f + v[0] * 0.05, a[1] + u[1] * len * f + v[1] * 0.05];
      reach = Math.min(reach, rayToPolygon(o, v, poly));
    }
    const yardGap = density > 0.8 ? 0 : (1 - density) * 6;
    const half = Math.max(8, reach / 2 - yardGap / 2);
    const rotationY = Math.atan2(v[0], v[1]);
    let s = 0;
    let guard = 0;
    while (s < len - 4 && guard++ < 200) {
      const roll = rng.weighted<LotKind>([
        ['insula', 3 + density * 3 - wealth],
        ['domus', wealth > 0.4 ? wealth * 4 : 0],
        ['shops', (1 - density) * 2 + 0.3],
        ['piazza', (1 - density) * 0.9],
        ['alley', 0.25 + density * 0.3],
        ['horrea', opts.allowHorrea && wealth < 0.6 ? 0.35 : 0],
      ]);
      const def = TYPES[roll];
      let w = rng.range(def.w[0], def.w[1]);
      if (s + w > len) w = len - s;
      if (w < def.w[0] * 0.8) {
        // Too little frontage left: try a narrower building type once, else stop.
        if (roll !== 'shops' && len - s >= TYPES.shops.w[0]) continue;
        break;
      }
      if (roll === 'alley') {
        // An alley only makes sense between buildings.
        if (s > 0) placed.push({ id: `${prefix}lot${lotN++}`, kind: 'alley', obb: { c: [a[0] + u[0] * (s + w / 2) + v[0] * 2, a[1] + u[1] * (s + w / 2) + v[1] * 2], u, v, hu: w / 2, hv: 2 }, edge: e, rotationY, width: w, depth: 4, seed: rng.int(0, 1e9), party: { left: false, right: false, back: false }, street: { left: -1, right: -1 } });
        s += w;
        continue;
      }
      let d = Math.min(rng.range(def.d[0], def.d[1]), roll === 'piazza' ? reach * 0.45 : half);
      if (d < def.d[0] * 0.75 && roll !== 'piazza') {
        if (roll !== 'insula' && roll !== 'shops') continue;
        d = Math.max(7, d);
      }
      let ok = false;
      let obb: OBB | null = null;
      for (let attempt = 0; attempt < 4 && !ok; attempt++) {
        const dd = d * Math.pow(0.85, attempt);
        if (dd < 6.5 && roll !== 'piazza') break;
        obb = { c: [a[0] + u[0] * (s + w / 2) + v[0] * (dd / 2), a[1] + u[1] * (s + w / 2) + v[1] * (dd / 2)], u, v, hu: w / 2, hv: dd / 2 };
        ok = fits(obb);
        if (ok) d = dd;
      }
      if (!ok || !obb) {
        s += 1;
        continue;
      }
      placed.push({ id: `${prefix}lot${lotN++}`, kind: roll, obb, edge: e, rotationY, width: w, depth: d, seed: rng.int(0, 1e9), party: { left: false, right: false, back: false }, street: { left: -1, right: -1 } });
      s += w;
    }
  }
  // Party walls: a side is shared when a neighbouring building lot is right against it.
  const solid = placed.filter((p) => p.kind !== 'alley' && p.kind !== 'piazza');
  for (const p of solid) {
    const probe = (lx: number, lz: number) => {
      const x = p.obb.c[0] + p.obb.u[0] * lx + p.obb.v[0] * lz, z = p.obb.c[1] + p.obb.u[1] * lx + p.obb.v[1] * lz;
      return solid.some((q) => q !== p && pointInOBB([x, z], q.obb, 0.05));
    };
    const hu = p.obb.hu, hv = p.obb.hv;
    p.party.left = probe(-hu - 0.3, 0) || probe(-hu - 0.3, hv * 0.5) || probe(-hu - 0.3, -hv * 0.5);
    p.party.right = probe(hu + 0.3, 0) || probe(hu + 0.3, hv * 0.5) || probe(hu + 0.3, -hv * 0.5);
    p.party.back = probe(0, hv + 0.3) || probe(hu * 0.5, hv + 0.3) || probe(-hu * 0.5, hv + 0.3);
    // Corner lots: a free side lying on the block outline faces a side street.
    const sideEdge = (sx: number) => {
      const c: Vec2 = [p.obb.c[0] + p.obb.u[0] * sx * hu, p.obb.c[1] + p.obb.u[1] * sx * hu];
      let best = -1, bd = 1.2;
      for (let i = 0; i < poly.length; i++) {
        const d = distToSegment(c, poly[i], poly[(i + 1) % poly.length]);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    };
    p.street.left = p.party.left ? -1 : sideEdge(-1);
    p.street.right = p.party.right ? -1 : sideEdge(1);
  }
  return placed;
}

export class CityBlockFiller {
  fill(polygon: Polygon, opts: FillOptions): FillResult {
    return fillBlock(polygon, opts);
  }
}

/** Plan lots and build every building, piazza and yard into one MeshBuilder (world coordinates). */
export function fillBlock(polygon: Polygon, opts: FillOptions): FillResult {
  const poly = blockOutline(polygon, opts.streetWidth ?? 0);
  const plans = planLots(polygon, opts);
  const b = opts.builder ?? new MeshBuilder();
  const rng = new Rng((opts.seed ?? 1) ^ 0x5bd1e995);
  const wealth = opts.wealth ?? 0.4, density = opts.density ?? 0.7;
  const H = opts.heightAt;
  // Per-edge sidewalk heights are given for the caller's edge order; re-index for the outline.
  const mapEdge = edgeMapper(polygon);
  const swByEdge = new Map<number, number>();
  if (Array.isArray(opts.sidewalkHeight)) opts.sidewalkHeight.forEach((h, i) => swByEdge.set(mapEdge(i), h));
  const sidewalkOf = (e: number) => (Array.isArray(opts.sidewalkHeight) ? swByEdge.get(e) ?? 0.3 : opts.sidewalkHeight ?? 0.3);
  const spots: Spot[] = [];
  const lots: Lot[] = [];
  const low = opts.detail === 'low';
  const dress = (opts.streetDressing ?? true) && !low;
  const detail = opts.detail ?? 'full';
  const colliders0 = b.colliders.length;

  // Yard surface under everything (buildings stand on top of it).
  if (opts.yard !== null) buildPlaza(b, poly, H, { material: opts.yard ?? 'dirt', lift: 0.03, cell: 3, skirt: 0.2, collide: false });

  for (const p of plans) {
    if (p.kind === 'alley') continue;
    const { obb } = p;
    const toWorld = (lx: number, lz: number): Vec2 => [obb.c[0] + obb.u[0] * lx + obb.v[0] * lz, obb.c[1] + obb.u[1] * lx + obb.v[1] * lz];
    const sw = sidewalkOf(p.edge);
    // Floor level: the highest sidewalk point along the frontage.
    let floorY = -Infinity;
    for (let i = 0; i <= 4; i++) {
      const [x, z] = toWorld(-obb.hu + (2 * obb.hu * i) / 4, -obb.hv - 0.4);
      floorY = Math.max(floorY, H(x, z) + sw + 0.06);
    }
    const groundAt = (lx: number, lz: number) => {
      const [x, z] = toWorld(lx, lz);
      // Sidewalks in front, and along side streets on corner lots.
      const raise = lz < -obb.hv + 0.01 ? sw : lx < -obb.hu + 0.01 && p.street.left >= 0 ? sidewalkOf(p.street.left) : lx > obb.hu - 0.01 && p.street.right >= 0 ? sidewalkOf(p.street.right) : 0;
      return H(x, z) + 0.06 + raise - floorY;
    };
    const m = new THREE.Matrix4().makeTranslation(obb.c[0], floorY, obb.c[1]).multiply(new THREE.Matrix4().makeRotationY(p.rotationY));
    const sides = { left: !p.party.left, right: !p.party.right, back: !p.party.back };
    const sideShops = { left: p.street.left >= 0, right: p.street.right >= 0 };
    const lrng = new Rng(p.seed);
    let out: BuildingOutput | null = null;
    if (p.kind === 'insula') {
      const maxS = opts.maxStoreys ?? 6;
      const storeys = Math.min(maxS, Math.round(2.6 + density * 2.2 + (1 - wealth) * 1.2 + lrng.range(-0.6, 0.8)));
      out = insula({
        width: p.width, depth: p.depth, seed: p.seed, wealth: Math.min(1, Math.max(0, wealth + lrng.range(-0.15, 0.15))),
        storeys: Math.max(3, storeys), courtyard: p.width >= 18 && p.depth >= 17 && lrng.chance(0.55),
        portico: wealth > 0.3 && p.depth > 13 && lrng.chance(0.25), groundAt, sides, sideShops, streetDressing: dress, maxHeight: MAX_BUILDING_HEIGHT, detail,
      });
    } else if (p.kind === 'shops') {
      out = insula({ width: p.width, depth: p.depth, seed: p.seed, wealth, storeys: 2, groundAt, sides, sideShops, balcony: lrng.chance(0.4) ? 'full' : 'none', roof: 'gable', streetDressing: dress, detail });
    } else if (p.kind === 'domus') {
      out = domus({ width: p.width, depth: p.depth, seed: p.seed, wealth: Math.max(0.5, wealth), groundAt, sides, streetDressing: dress, detail });
    } else if (p.kind === 'horrea') {
      out = horrea({ width: p.width, depth: p.depth, seed: p.seed, groundAt, detail });
    } else if (p.kind === 'piazza') {
      piazza(b, p, H, lrng, spots, sw, low);
    }
    if (out) {
      b.append(out.builder, m);
      for (const s of out.spots) {
        spots.push({ ...s, id: `${p.id}:${s.id}`, position: s.position.clone().applyMatrix4(m), facing: s.facing + p.rotationY });
      }
      lots.push({ ...p, floorY, center: new THREE.Vector3(obb.c[0], floorY, obb.c[1]), height: out.height });
    } else {
      lots.push({ ...p, floorY, center: new THREE.Vector3(obb.c[0], floorY, obb.c[1]), height: 0 });
    }
  }
  if (low) b.colliders.splice(colliders0);
  else yardDressing(b, poly, plans, H, rng, spots, opts.id ?? '');
  return { builder: b, spots, lots };
}

/** Small square in a gap of the frontage: paving, a fountain or a shrine, benches, trees. */
function piazza(b: MeshBuilder, p: LotPlan, H: HeightFn, rng: Rng, spots: Spot[], sw: number, low = false) {
  const corners = obbCorners(p.obb);
  buildPlaza(b, corners, (x, z) => H(x, z) + sw * 0.5, { material: rng.chance(0.5) ? 'paving_travertine' : 'cobbles', lift: 0.05 });
  const c = p.obb.c;
  const y = H(c[0], c[1]) + sw * 0.5 + 0.05;
  const d = new Draw(b, new THREE.Matrix4().makeTranslation(c[0], y, c[1]).multiply(new THREE.Matrix4().makeRotationY(p.rotationY)));
  const add = (kind: SpotKind, lx: number, lz: number, facing: number, tag?: string) =>
    spots.push({ id: `${p.id}:${kind}${spots.length}`, kind, position: d.point(lx, 0, lz), facing: facing + p.rotationY, tag });
  if (rng.chance(0.55)) {
    for (const s of lacus(d.at(0, 0, p.obb.hv * 0.25, Math.PI), rng)) add('fountain', -s.x, p.obb.hv * 0.25 - s.z, s.facing + Math.PI);
  } else {
    compitalShrine(d.at(0, 0, p.obb.hv * 0.4, Math.PI), rng);
    add('shrine', 0, p.obb.hv * 0.4 - 1.8, 0, 'compitum');
  }
  for (const s of [-1, 1]) {
    if (!rng.chance(0.7) || low) continue;
    const lx = s * (p.obb.hu - 1.2);
    placeProp(d, 'bench_masonry', lx, 0, 0, s * Math.PI / 2, { variant: 0 });
    add('bench', lx - s * 0.5, 0, -s * Math.PI / 2);
  }
  for (const s of [-1, 1]) if (rng.chance(0.6)) add('tree', s * (p.obb.hu - 1.5), p.obb.hv - 1.5, 0, rng.pick(['pine', 'plane', 'cypress']));
  add('stall', 0, -p.obb.hv + 2.0, Math.PI, 'market');
}

/** Wells, stacked amphorae, carts and trees in the leftover yard space. */
function yardDressing(b: MeshBuilder, poly: Polygon, plans: LotPlan[], H: HeightFn, rng: Rng, spots: Spot[], prefix: string) {
  const { minX, minZ, maxX, maxZ } = polygonBounds(poly);
  const solid = plans.filter((p) => p.kind !== 'alley');
  const free = (x: number, z: number, r: number) =>
    pointInPolygon([x, z], poly) &&
    !solid.some((p) => pointInOBB([x, z], p.obb, r)) &&
    [[r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => pointInPolygon([x + dx, z + dz], poly));
  const d = new Draw(b);
  let n = 0;
  const area = (maxX - minX) * (maxZ - minZ);
  const tries = Math.min(400, Math.floor(area / 15));
  const kinds = ['puteal', 'amphora_stack', 'cart', 'crate', 'tree', 'tree', 'dolium', 'handcart', 'trough'] as const;
  for (let i = 0; i < tries && n < area / 120; i++) {
    const x = rng.range(minX, maxX), z = rng.range(minZ, maxZ);
    const k = rng.pick(kinds);
    const r = k === 'cart' ? 3 : k === 'tree' ? 2.5 : 1.4;
    if (!free(x, z, r)) continue;
    const y = H(x, z) + 0.03;
    if (k === 'tree') spots.push({ id: `${prefix}yard:tree${n}`, kind: 'tree', position: new THREE.Vector3(x, y, z), facing: 0, tag: rng.pick(['fig', 'olive', 'laurel', 'pine', 'cypress']) });
    else {
      placeProp(d, k, x, y, z, rng.range(0, Math.PI * 2), { rng });
      if (k === 'puteal') spots.push({ id: `${prefix}yard:well${n}`, kind: 'well', position: new THREE.Vector3(x + 0.9, y, z), facing: -Math.PI / 2 });
    }
    n++;
  }
}
