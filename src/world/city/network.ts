/**
 * Street graph for NPC navigation (`game.streets`): nodes every ≤ 24 m along the atlas roads and
 * the minor streets, junctions where streets meet or cross, the piazzas, the open fora and plazas,
 * and the fronts (or entrance spots) of the landmarks; edges carry the walkable width. Spots are
 * the places NPCs go: shop and house doors along the blocks, fountains, shrines, benches, stalls.
 *
 * The graph is built from polylines snapped together with a segment hash, so streets that end on
 * another street, cross it, or end at a plaza are connected. Every link the graph adds of its own
 * (street ends snapped onto a street, plazas and landmark entrances linked to the nearest streets,
 * islands joined to the network) is checked with a LinkProbe before it is made, and the nearest
 * link that is actually walkable is taken: never through a block or the river (plan raster), nor
 * through a wall, a parapet or up a podium side (physics, when the game is there). Nodes standing
 * inside something (a road junction inside a monument) move to the nearest free spot.
 */
import * as THREE from 'three';
import type { Game } from '../../core/Game';
import { Layer } from '../../core/Physics';
import type { Vec2 } from '../../arch/fabric/types';
import { toGame } from '../coords';
import { FLOOR_LIFT } from './datum';
import type { CityPlan } from './plan';
import { K, distToPoly, pointInPoly, polyCentroid } from './raster';
import type { StreetWork } from './roads';

export type NodeKind = 'road' | 'street' | 'stairs' | 'junction' | 'piazza' | 'plaza' | 'landmark';
export type StreetSpotKind = 'shopDoor' | 'houseDoor' | 'fountain' | 'shrine' | 'stall' | 'bench' | 'container';

export interface StreetNode {
  id: number;
  x: number;
  z: number;
  kind: NodeKind;
}

export interface StreetSpot {
  id: string;
  kind: StreetSpotKind;
  position: THREE.Vector3;
  /** Heading (model +Z convention) of someone using the spot (shopkeeper: out to the street). */
  heading: number;
  /** Owning block id, or null for street furniture. */
  block: string | null;
  tag?: string;
  /** Nearest graph node. */
  node: number;
}

export interface StreetGraph {
  nodes: StreetNode[];
  /** [a, b, width] — undirected. */
  edges: [number, number, number][];
  spots: StreetSpot[];
  /**
   * Single-link nodes in the area that nothing could join (a road that runs into a monument, a
   * footprint or the Servian wall, a stairway's foot): deliberate termini, with the reason.
   */
  termini: { node: number; reason: 'stairs' | 'road' | 'street' }[];
  /** Nearest node to a position (within `maxDist`), or −1. */
  nearest(x: number, z: number, maxDist?: number): number;
  /** Neighbours of a node: [node, width][]. */
  neighbours(id: number): [number, number][];
  /** Connected components (largest first), as node-id arrays. */
  components(): number[][];
}

const SOLID = new Set(['temple', 'basilica', 'baths', 'palace', 'theatre', 'amphitheatre', 'stadium', 'library', 'curia', 'warehouse', 'prison', 'odeum', 'house', 'tomb']);

/**
 * Something a link must not pass through (game m): a disc; `end`: ignored within this distance
 * of a link's ends (the fountain a piazza node stands by, the stairway a stair end leaves).
 */
export interface Obstacle {
  x: number;
  z: number;
  r: number;
  end?: number;
}

/** Walkability tests for the links the graph makes. */
export interface LinkProbe {
  /** Can a person walk straight from a to b? `ya`: standing height at a, if known (game y). */
  clear(a: Vec2, b: Vec2, ya?: number): boolean;
  /** Is a person standing at (x, z) (height y, if known) inside something? */
  blocked(x: number, z: number, y?: number): boolean;
}

/**
 * The plan's verdict: no link through a built block, the river or a standing wall, nor through a solid landmark's
 * footprint (except its first and last 4 m, where its doors are), nor through the city's own
 * street furniture (`obstacles`: market stalls, fountains, benches, carts; discs, game m), which
 * is only built later, near the player.
 */
export function rasterProbe(plan: CityPlan, obstacles: Obstacle[] = []): LinkProbe {
  const g = plan.grid;
  const hash = new Map<string, Obstacle[]>();
  for (const o of obstacles) {
    const k = `${Math.floor(o.x / 8)},${Math.floor(o.z / 8)}`;
    const l = hash.get(k);
    if (l) l.push(o);
    else hash.set(k, [o]);
  }
  /** In an obstacle, unless within the obstacle's own `end` distance of the link's ends. */
  const prop = (x: number, z: number, fromEnd: number) => {
    const kx = Math.floor(x / 8), kz = Math.floor(z / 8);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const o of hash.get(`${kx + dx},${kz + dz}`) ?? []) if (fromEnd > (o.end ?? 0) && (o.x - x) ** 2 + (o.z - z) ** 2 < o.r * o.r) return true;
    return false;
  };
  const bad = (x: number, z: number) => {
    const i = g.index(x, z);
    if (i < 0) return true;
    const c = g.cls[i];
    // The river, and the standing stretches of the Servian wall (its colliders exist only near
    // the player, the raster always).
    if (c === K.WATER || c === K.WALL) return true;
    if (c !== K.FREE || g.owner[i] < 2_000_000) return false;
    // In a block: past its property line by more than a raster step (the outline is traced from
    // the cells, so the cells at its edge may lie just outside it).
    const o = plan.blocks[g.owner[i] - 2_000_000].outline;
    return pointInPoly(x, z, o) && distToPoly(x, z, o) > 0.6;
  };
  const solid = (x: number, z: number) => {
    const i = g.index(x, z);
    return i >= 0 && g.cls[i] === K.LANDMARK && SOLID.has(plan.landmarkCategory[g.owner[i]] ?? '');
  };
  return {
    clear(a, b) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(L / 0.4));
      for (let k = 1; k < n; k++) {
        const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        if (bad(x, z) || prop(x, z, Math.min(t, 1 - t) * L)) return false;
        if (t * L > 4 && (1 - t) * L > 4 && solid(x, z)) return false;
      }
      return true;
    },
    blocked: (x, z) => bad(x, z),
  };
}

/**
 * The physics world's verdict (static colliders: landmarks, bridges, quays, city monuments):
 * walking the link in 0.5 m steps, the next foothold must be at most a step (0.6 m) up and 1.2 m
 * down, with nothing at knee or chest height in between and headroom above.
 */
export function physicsProbe(game: Game, H: (x: number, z: number) => number): LinkProbe {
  const ph = game.physics;
  const DOWN = { x: 0, y: -1, z: 0 }, UP = { x: 0, y: 1, z: 0 };
  /** Walking surface below `from` (game y), or null when `from` is inside a collider. */
  const surface = (x: number, z: number, from: number): number | null => {
    const g = H(x, z);
    if (from < g) return g;
    const hit = ph.raycast({ x, y: from, z }, DOWN, from - g + 1.5, Layer.World);
    if (!hit) return g;
    if (hit.distance < 1e-4) return null;
    return Math.max(hit.point.y, g);
  };
  const headroom = (x: number, z: number, y: number) => !ph.raycast({ x, y: y + 0.15, z }, UP, 1.6, Layer.World);
  return {
    blocked(x, z, y) {
      const s = surface(x, z, (y ?? H(x, z)) + 0.6);
      return s === null || !headroom(x, z, s);
    },
    clear(a, b, ya) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-3) return true;
      const dir = { x: (b[0] - a[0]) / L, y: 0, z: (b[1] - a[1]) / L };
      let y = surface(a[0], a[1], (ya ?? H(a[0], a[1])) + 0.6);
      if (y === null) return false;
      const n = Math.max(1, Math.ceil(L / 0.5));
      const step = L / n;
      for (let k = 1; k <= n; k++) {
        const px = a[0] + dir.x * step * (k - 1), pz = a[1] + dir.z * step * (k - 1);
        if (ph.raycast({ x: px, y: y + 0.5, z: pz }, dir, step, Layer.World)) return false;
        if (ph.raycast({ x: px, y: y + 1.3, z: pz }, dir, step, Layer.World)) return false;
        const qx = a[0] + dir.x * step * k, qz = a[1] + dir.z * step * k;
        // At most 0.4 m per half metre either way (a step; slopes steeper than ~38°, where the
        // controller starts to slide, and podium sides are not paths).
        const ny = surface(qx, qz, y + 0.6);
        if (ny === null || Math.abs(ny - y) > 0.4 || !headroom(qx, qz, ny)) return false;
        y = ny;
      }
      return true;
    },
  };
}

/** Both verdicts. */
export function bothProbes(a: LinkProbe, b: LinkProbe): LinkProbe {
  return {
    clear: (p, q, ya) => a.clear(p, q, ya) && b.clear(p, q, ya),
    blocked: (x, z, y) => a.blocked(x, z, y) || b.blocked(x, z, y),
  };
}

class Builder {
  nodes: StreetNode[] = [];
  edges = new Map<string, [number, number, number]>();
  /** Edges along flights of steps (parapets on both sides: links join them only at their ends). */
  stairEdges = new Set<string>();
  private seg = new Map<string, { a: number; b: number; w: number }[]>();
  private nodeHash = new Map<string, number[]>();
  private adj = new Map<number, Set<number>>();
  private readonly H = 32;

  edgesOf(id: number): number[] {
    return [...(this.adj.get(id) ?? [])];
  }

  private link(a: number, b: number, on: boolean) {
    for (const [x, y] of [[a, b], [b, a]]) {
      let s = this.adj.get(x);
      if (!s) this.adj.set(x, (s = new Set()));
      if (on) s.add(y);
      else s.delete(y);
    }
  }

  node(x: number, z: number, kind: NodeKind, merge = 1.2): number {
    const kx = Math.floor(x / 4), kz = Math.floor(z / 4);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const id of this.nodeHash.get(`${kx + dx},${kz + dz}`) ?? []) {
          const n = this.nodes[id];
          if (Math.hypot(n.x - x, n.z - z) < merge) {
            if (kind === 'junction' || kind === 'piazza' || kind === 'plaza' || kind === 'landmark') n.kind = kind;
            return id;
          }
        }
    const id = this.nodes.length;
    this.nodes.push({ id, x, z, kind });
    const k = `${kx},${kz}`;
    const l = this.nodeHash.get(k);
    if (l) l.push(id);
    else this.nodeHash.set(k, [id]);
    return id;
  }

  edge(a: number, b: number, w: number) {
    if (a === b) return;
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    const e = this.edges.get(key);
    if (e) e[2] = Math.max(e[2], w);
    else {
      this.edges.set(key, [Math.min(a, b), Math.max(a, b), w]);
      this.link(a, b, true);
      this.indexSeg(a, b, w);
    }
  }

  private indexSeg(a: number, b: number, w: number) {
    const A = this.nodes[a], B = this.nodes[b];
    const x0 = Math.floor(Math.min(A.x, B.x) / this.H), x1 = Math.floor(Math.max(A.x, B.x) / this.H);
    const z0 = Math.floor(Math.min(A.z, B.z) / this.H), z1 = Math.floor(Math.max(A.z, B.z) / this.H);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const k = `${x},${z}`;
        const l = this.seg.get(k);
        const s = { a, b, w };
        if (l) l.push(s);
        else this.seg.set(k, [s]);
      }
  }

  /** Nearest point on an existing edge (excluding edges touching `skip`). */
  nearestEdge(x: number, z: number, maxD: number, skip?: Set<number>): { a: number; b: number; w: number; t: number; d: number; p: Vec2 } | null {
    let best: { a: number; b: number; w: number; t: number; d: number; p: Vec2 } | null = null;
    const r = Math.ceil(maxD / this.H);
    const kx = Math.floor(x / this.H), kz = Math.floor(z / this.H);
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++)
        for (const s of this.seg.get(`${kx + dx},${kz + dz}`) ?? []) {
          if (skip && (skip.has(s.a) || skip.has(s.b))) continue;
          if (!this.edges.has(s.a < s.b ? `${s.a},${s.b}` : `${s.b},${s.a}`)) continue;
          const A = this.nodes[s.a], B = this.nodes[s.b];
          const ex = B.x - A.x, ez = B.z - A.z;
          const l2 = ex * ex + ez * ez;
          let t = l2 > 0 ? ((x - A.x) * ex + (z - A.z) * ez) / l2 : 0;
          t = Math.max(0, Math.min(1, t));
          const px = A.x + ex * t, pz = A.z + ez * t;
          const d = Math.hypot(px - x, pz - z);
          if (d <= maxD && (!best || d < best.d)) best = { a: s.a, b: s.b, w: s.w, t, d, p: [px, pz] };
        }
    return best;
  }

  /** Points on the edges within maxD of (x, z), nearest first (at most `max`). */
  nearEdges(x: number, z: number, maxD: number, skip?: Set<number>, max = 8): { a: number; b: number; w: number; t: number; d: number; p: Vec2 }[] {
    const out: { a: number; b: number; w: number; t: number; d: number; p: Vec2 }[] = [];
    const keyOf = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
    const seen = new Set<string>();
    const r = Math.ceil(maxD / this.H);
    const kx = Math.floor(x / this.H), kz = Math.floor(z / this.H);
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++)
        for (const s of this.seg.get(`${kx + dx},${kz + dz}`) ?? []) {
          if (skip && (skip.has(s.a) || skip.has(s.b))) continue;
          const key = s.a < s.b ? `${s.a},${s.b}` : `${s.b},${s.a}`;
          if (seen.has(key) || !this.edges.has(key)) continue;
          seen.add(key);
          const A = this.nodes[s.a], B = this.nodes[s.b];
          const ex = B.x - A.x, ez = B.z - A.z;
          const l2 = ex * ex + ez * ez;
          let t = l2 > 0 ? ((x - A.x) * ex + (z - A.z) * ez) / l2 : 0;
          t = Math.max(0, Math.min(1, t));
          // Never onto a flight of steps (over its parapet): the stairs' own ends link outward.
          if (this.stairEdges.has(keyOf(s.a, s.b))) continue;
          const px = A.x + ex * t, pz = A.z + ez * t;
          const d = Math.hypot(px - x, pz - z);
          if (d <= maxD) out.push({ a: s.a, b: s.b, w: s.w, t, d, p: [px, pz] });
        }
    out.sort((p, q) => p.d - q.d);
    return out.slice(0, max);
  }

  /** Move a node (re-indexing it and its edges). */
  move(id: number, x: number, z: number) {
    const n = this.nodes[id];
    const k0 = `${Math.floor(n.x / 4)},${Math.floor(n.z / 4)}`;
    const l0 = this.nodeHash.get(k0);
    if (l0) l0.splice(l0.indexOf(id), 1);
    n.x = x;
    n.z = z;
    const k1 = `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
    const l1 = this.nodeHash.get(k1);
    if (l1) l1.push(id);
    else this.nodeHash.set(k1, [id]);
    for (const m of this.adj.get(id) ?? []) {
      const key = id < m ? `${id},${m}` : `${m},${id}`;
      const e = this.edges.get(key);
      if (e) this.indexSeg(id, m, e[2]);
    }
  }

  /** Inside a flight of steps (two stair edges meet there): nothing links to it from the side. */
  midStairs(id: number): boolean {
    let n = 0;
    for (const m of this.adj.get(id) ?? []) if (this.stairEdges.has(id < m ? `${id},${m}` : `${m},${id}`)) n++;
    return n >= 2;
  }

  /** Neighbour ids of a node. */
  neighbourIds(id: number): number[] {
    return [...(this.adj.get(id) ?? [])];
  }

  /** Insert a node on edge a–b at p (splitting it), returning the node. */
  split(a: number, b: number, w: number, p: Vec2, kind: NodeKind): number {
    const A = this.nodes[a], B = this.nodes[b];
    if (Math.hypot(A.x - p[0], A.z - p[1]) < 1.5) return a;
    if (Math.hypot(B.x - p[0], B.z - p[1]) < 1.5) return b;
    const n = this.node(p[0], p[1], kind, 0.3);
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    const stairs = this.stairEdges.delete(key);
    this.edges.delete(key);
    this.link(a, b, false);
    this.edge(a, n, w);
    this.edge(n, b, w);
    if (stairs) for (const [x, y] of [[a, n], [n, b]]) this.stairEdges.add(x < y ? `${x},${y}` : `${y},${x}`);
    return n;
  }

  polyline(pts: readonly Vec2[], w: number, kind: NodeKind, step = 24, keep?: (x: number, z: number) => boolean): number[] {
    const ids: number[] = [];
    let prev = -1;
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(L / step));
      for (let j = k === 0 ? 0 : 1; j <= n; j++) {
        const x = a[0] + ((b[0] - a[0]) * j) / n, z = a[1] + ((b[1] - a[1]) * j) / n;
        if (keep && !keep(x, z)) {
          prev = -1;
          continue;
        }
        const id = this.node(x, z, kind);
        if (prev >= 0) {
          this.edge(prev, id, w);
          if (kind === 'stairs' && prev !== id) this.stairEdges.add(prev < id ? `${prev},${id}` : `${id},${prev}`);
        }
        ids.push(id);
        prev = id;
      }
    }
    return ids;
  }
}

export function buildStreetGraph(
  plan: CityPlan,
  work: StreetWork,
  game: Game | null,
  inArea: (x: number, z: number) => boolean,
  opts: { probe?: LinkProbe; obstacles?: Obstacle[]; /** Join loose ends to the nearest street (default true; false = the graph before the M3 rework, for the audit). */ deadEnds?: boolean } = {},
): StreetGraph {
  const B = new Builder();
  const g = plan.grid;
  const H = (x: number, z: number) => (game?.heightmap ? game.heightmap.heightAt(x, z) : plan.hy[Math.max(0, g.index(x, z))]);
  const physics = game?.physics && game.heightmap ? physicsProbe(game, H) : null;
  // Street furniture with colliders, built later near the player: links keep clear of it.
  const R = { stall: 2, fountain: 1.8, shrine: 1.4, bench: 1, container: 1 } as Record<string, number>;
  const obstacles: Obstacle[] = [
    // A piazza's own fountain / shrine / bench stand round its node: free within its radius.
    ...work.spots.map((s) => ({ x: s.position.x, z: s.position.z, r: R[s.kind] ?? 1, end: /^pz\d+:/.test(s.id) ? 5.5 : 2.5 })),
    ...work.carts.map((c) => ({ x: c.x, z: c.z, r: 2, end: 2.5 })),
    ...(opts.obstacles ?? []),
  ];
  // The stairways, parapets on both sides: no link crosses one.
  for (const [ri, path] of work.stairPaths) {
    const half = plan.roads[ri].carriage / 2 + 0.5;
    const L = polylineLength(path);
    for (let t = 0; t <= L; t += 1) {
      const p = pointOn(path, t);
      obstacles.push({ x: p[0], z: p[1], r: half, end: half + 1 });
    }
  }
  const raster = rasterProbe(plan, obstacles);
  const P = opts.probe ?? (physics ? bothProbes(raster, physics) : raster);
  /** Standing heights of nodes where the ground is not the terrain (landmark doors on podia). */
  const nodeY = new Map<number, number>();
  const bridgeNodes = new Set<number>();
  const linkOk = (id: number, p: Vec2) => {
    const n = B.nodes[id];
    return P.clear([n.x, n.z], p, nodeY.get(id));
  };
  const walkable = (x: number, z: number) => {
    if (!inArea(x, z)) return false;
    const i = g.index(x, z);
    if (i < 0) return false;
    if (g.cls[i] === K.LANDMARK && SOLID.has(plan.landmarkCategory[g.owner[i]] ?? '')) return false;
    return g.cls[i] !== K.WATER;
  };
  // Atlas roads keep their course even where a (0.6-scale) landmark footprint overlaps them:
  // they are the routes through the Forum, under arches and along porticoes.
  const onLand = (x: number, z: number) => inArea(x, z) && g.at(x, z) !== K.WATER;
  // Roads, bridges, then minor streets.
  const ends: { id: number; dir: Vec2; reach: number }[] = [];
  for (const br of plan.bridges) {
    if (!inArea(br.a[0], br.a[1]) && !inArea(br.b[0], br.b[1])) continue;
    const ids = B.polyline([br.a, br.b], br.width, 'road', 24);
    for (const id of ids) bridgeNodes.add(id);
    ends.push({ id: ids[0], dir: unit(br.a, br.b), reach: 14 });
    ends.push({ id: ids[ids.length - 1], dir: unit(br.b, br.a), reach: 14 });
  }
  for (const r of plan.roads) {
    // Stairways along the course the flights actually take (extended to the street at a foot on a slope).
    const p = (r.style === 'stairs' ? work.stairPaths.get(r.index) : null) ?? r.points;
    const ids = B.polyline(p, r.half * 2, r.style === 'stairs' ? 'stairs' : 'road', r.style === 'stairs' ? 8 : 24, onLand);
    if (ids.length) {
      ends.push({ id: ids[0], dir: unit(p[0], p[1]), reach: r.half + 4 });
      ends.push({ id: ids[ids.length - 1], dir: unit(p[p.length - 1], p[p.length - 2]), reach: r.half + 4 });
    }
  }
  // Road crossings: split both at the intersection.
  for (const j of work.junctions) {
    if (!inArea(j.p[0], j.p[1])) continue;
    const hits: number[] = [];
    for (let k = 0; k < 4; k++) {
      const e = B.nearestEdge(j.p[0], j.p[1], j.r + 2, new Set(hits));
      if (!e) break;
      hits.push(B.split(e.a, e.b, e.w, e.p, 'junction'));
    }
    const c = B.node(j.p[0], j.p[1], 'junction', 0.5);
    for (const h of hits) B.edge(c, h, j.r * 2);
  }
  for (const s of plan.streets) {
    const steps = s.steps.some(Boolean);
    const ids = B.polyline(s.points, s.width, steps ? 'stairs' : 'street', 24, walkable);
    if (ids.length) {
      const p = s.points;
      ends.push({ id: ids[0], dir: unit(p[0], p[1]), reach: s.width / 2 + 4.5 });
      ends.push({ id: ids[ids.length - 1], dir: unit(p[p.length - 1], p[p.length - 2]), reach: s.width / 2 + 4.5 });
    }
  }
  // Nodes standing inside something (a road crossing inside a monument, a street end in a
  // parapet) move to the nearest free spot (physics only: the raster cannot tell).
  if (physics) {
    for (const n of B.nodes) {
      if (bridgeNodes.has(n.id) || !inArea(n.x, n.z) || !physics.blocked(n.x, n.z)) continue;
      const to = freeSpot(physics, n.x, n.z, B.neighbourIds(n.id).map((m) => B.nodes[m]));
      if (to) B.move(n.id, to[0], to[1]);
    }
  }
  // Roads that run into a monument's pier (the atlas line misses the arch's passage by a metre or
  // two): a detour node beside the obstacle, where one walks round it or through the passage.
  if (physics) {
    const near = (x: number, z: number) => {
      const c = g.at(x, z);
      return c === K.LANDMARK || c === K.WATER;
    };
    for (const [a, b, w] of [...B.edges.values()]) {
      if (bridgeNodes.has(a) && bridgeNodes.has(b)) continue;
      const A = B.nodes[a], C = B.nodes[b];
      if (!inArea(A.x, A.z) || !inArea(C.x, C.z)) continue;
      const L = Math.hypot(C.x - A.x, C.z - A.z);
      let suspect = false;
      for (let t = 0; t <= L && !suspect; t += 1.5) suspect = near(A.x + ((C.x - A.x) * t) / L, A.z + ((C.z - A.z) * t) / L);
      if (!suspect || physics.clear([A.x, A.z], [C.x, C.z])) continue;
      const d = detour(physics, [A.x, A.z], [C.x, C.z]);
      if (d) B.split(a, b, w, d, B.nodes[a].kind === 'stairs' ? 'stairs' : 'road');
    }
  }
  // Snap loose ends onto the street they meet (the nearest walkable link).
  for (const e of ends) {
    const n = B.nodes[e.id];
    const own = new Set([e.id, ...B.edgesOf(e.id)]);
    for (const hit of B.nearEdges(n.x + e.dir[0] * 1.5, n.z + e.dir[1] * 1.5, e.reach + 6, own, 6)) {
      if (!linkOk(e.id, hit.p)) continue;
      const j = B.split(hit.a, hit.b, hit.w, hit.p, 'junction');
      B.edge(e.id, j, Math.min(hit.w, 4));
      break;
    }
  }
  // Piazzas (on the street they open on).
  for (const pz of plan.piazzas) {
    // A court at the very edge of the area has its street outside it (nothing to link to).
    if (!inArea(pz.center[0], pz.center[1]) || !inArea(pz.junction[0], pz.junction[1])) continue;
    const id = B.node(pz.center[0], pz.center[1], 'piazza', 0.5);
    let linked = false;
    for (const hit of B.nearEdges(pz.junction[0], pz.junction[1], 12, new Set([id]), 4)) {
      if (!linkOk(id, hit.p)) continue;
      B.edge(id, B.split(hit.a, hit.b, hit.w, hit.p, 'junction'), pz.r * 2);
      linked = true;
      break;
    }
    // Else the nearest walkable link from the square itself.
    if (!linked) linkAround(B, id, 1, 20, linkOk);
  }
  // Open fora and plazas: a node at the centre, linked to the nearest streets around them.
  for (const pl of plan.plazas) {
    const c = polyCentroid(pl.polygon);
    if (!inArea(c[0], c[1])) continue;
    const id = B.node(c[0], c[1], 'plaza', 0.5);
    if (physics?.blocked(c[0], c[1])) {
      // A monument stands on the centroid: the nearest free spot of the square instead.
      const to = freeSpot(physics, c[0], c[1], [], 14);
      if (!to) continue;
      B.move(id, to[0], to[1]);
    }
    linkAround(B, id, 3, 90, linkOk);
  }
  // Landmark entrances: their own spots when they declare doors / entrances, else the facade front.
  if (game?.landmarks) {
    for (const pl of game.landmarks.values()) {
      const lm = pl.lm;
      const [gx, gz] = toGame(lm.center[0], lm.center[1]);
      if (!inArea(gx, gz)) continue;
      const doors = pl.spots.filter((s) => /door|entr|gate/i.test(s.kind));
      const pts: Vec2[] = doors.length ? doors.slice(0, 4).map((s) => [s.position.x, s.position.z] as Vec2) : [facadeFront(lm)];
      pts.forEach((p, k) => {
        const id = B.node(p[0], p[1], 'landmark', 0.5);
        if (doors.length) nodeY.set(id, doors[k].position.y);
        linkAround(B, id, 1, 70, linkOk);
      });
    }
  }

  // Loose ends the snapping above missed (a road running into a landmark's apron, the foot of a
  // stairway, a lane ending against a slope): the nearest walkable link, up to 30 m, to another
  // street (never back onto its own neighbours).
  if (opts.deadEnds !== false) closeDeadEnds(B, linkOk, inArea, 30);

  // Islands of streets that end on open ground (plazas, landmark aprons, slopes): a short path to
  // the nearest node of the main network.
  linkIslands(B, linkOk);

  // Spots: street furniture, and doors along the blocks of the detail area.
  const graph = finalize(B);
  const spots: StreetSpot[] = [];
  for (const s of work.spots) {
    spots.push({ id: s.id, kind: s.kind, position: s.position, heading: s.heading, block: null, tag: s.tag, node: graph.nearest(s.position.x, s.position.z, 60) });
  }
  for (const blk of plan.blocks) {
    if (blk.kind !== 'built' || !inArea(blk.centroid[0], blk.centroid[1])) continue;
    doorsOf(blk.id, blk.outline, blk.frontEdges, blk.sidewalk, (x, z) => (game?.heightmap ? game.heightmap.heightAt(x, z) : plan.hy[Math.max(0, g.index(x, z))]), blk.seed, (s) => {
      spots.push({ ...s, node: graph.nearest(s.position.x, s.position.z, 60) });
    });
  }
  graph.spots = spots;
  for (const n of graph.nodes) {
    if (n.kind === 'piazza' || n.kind === 'plaza' || n.kind === 'landmark' || graph.neighbours(n.id).length !== 1 || !inArea(n.x, n.z)) continue;
    graph.termini.push({ node: n.id, reason: n.kind === 'stairs' ? 'stairs' : n.kind === 'road' ? 'road' : 'street' });
  }
  return graph;
}

/** Door spots along a block's frontages (one shop door every ~12 m, a house door every ~25 m). */
function doorsOf(blockId: string, outline: readonly Vec2[], fronts: number[], sidewalk: number[], H: (x: number, z: number) => number, seed: number, emit: (s: Omit<StreetSpot, 'node'>) => void) {
  let n = 0;
  for (const e of fronts) {
    const a = outline[e], b = outline[(e + 1) % outline.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    // Outward normal of a positive polygon edge: (uz, −ux).
    const ox = uz, oz = -ux;
    const heading = Math.atan2(ox, oz);
    const k = Math.floor(L / 12);
    for (let i = 0; i < k; i++) {
      const t = (i + 0.5) / k;
      const x = a[0] + (b[0] - a[0]) * t + ox * 0.6, z = a[1] + (b[1] - a[1]) * t + oz * 0.6;
      const house = (seed + i + e) % 2 === 0 && i % 2 === 1;
      emit({ id: `${blockId}:door${n++}`, kind: house ? 'houseDoor' : 'shopDoor', position: new THREE.Vector3(x, H(x, z) + (sidewalk[e] ?? 0) + FLOOR_LIFT, z), heading, block: blockId });
    }
  }
}

/**
 * Nodes with a single link that no spot, piazza or landmark door explains: link them to the
 * nearest other stretch of street within `maxD` (twice that for a road end: a road cut by a
 * solid footprint is bridged round it) that a person can walk to (second neighbours
 * excluded, so a stub never links back onto its own street).
 */
function closeDeadEnds(B: Builder, ok: (id: number, p: Vec2) => boolean, inArea: (x: number, z: number) => boolean, maxD: number) {
  for (const n of [...B.nodes]) {
    if (n.kind === 'piazza' || n.kind === 'plaza' || n.kind === 'landmark' || B.neighbourIds(n.id).length !== 1 || !inArea(n.x, n.z)) continue;
    // Its own street for three links back is no target.
    const own = new Set<number>([n.id]);
    let frontier = [n.id];
    for (let k = 0; k < 3; k++) {
      const next: number[] = [];
      for (const f of frontier) for (const m of B.neighbourIds(f)) if (!own.has(m)) { own.add(m); next.push(m); }
      frontier = next;
    }
    for (const hit of B.nearEdges(n.x, n.z, n.kind === 'road' ? maxD * 4 : maxD * 2, own, 8)) {
      if (!inArea(hit.p[0], hit.p[1]) || !ok(n.id, hit.p)) continue;
      B.edge(n.id, B.split(hit.a, hit.b, hit.w, hit.p, 'junction'), Math.min(hit.w, 4));
      break;
    }
  }
}

function linkIslands(B: Builder, ok: (id: number, p: Vec2) => boolean) {
  for (let pass = 0; pass < 3; pass++) {
    const comps = finalize(B).components();
    if (comps.length < 2) return;
    const main = new Set(comps[0]);
    const mainNodes = comps[0].map((id) => B.nodes[id]);
    const hash = new Map<string, typeof mainNodes>();
    for (const n of mainNodes) {
      const k = `${Math.floor(n.x / 30)},${Math.floor(n.z / 30)}`;
      const l = hash.get(k);
      if (l) l.push(n);
      else hash.set(k, [n]);
    }
    let linked = 0;
    for (const comp of comps.slice(1)) {
      // The nearest pairs (island node, main node) first; the first walkable one is the link.
      const pairs: [number, number, number][] = [];
      for (const id of comp) {
        const n = B.nodes[id];
        const kx = Math.floor(n.x / 30), kz = Math.floor(n.z / 30);
        for (let dx = -4; dx <= 4; dx++)
          for (let dz = -4; dz <= 4; dz++)
            for (const m of hash.get(`${kx + dx},${kz + dz}`) ?? []) {
              const d = Math.hypot(m.x - n.x, m.z - n.z);
              if (d < 120) pairs.push([id, m.id, d]);
            }
      }
      pairs.sort((p, q) => p[2] - q[2]);
      for (const [a, m] of pairs.filter(([a, m]) => !B.midStairs(a) && !B.midStairs(m)).slice(0, 40)) {
        if (main.has(a) || !ok(a, [B.nodes[m].x, B.nodes[m].z])) continue;
        B.edge(a, m, 2.5);
        linked++;
        break;
      }
    }
    if (!linked) return;
  }
}

/** Link a node to up to `count` different nearby streets, by the nearest walkable links. */
function linkAround(B: Builder, id: number, count: number, maxD: number, ok: (id: number, p: Vec2) => boolean) {
  const n = B.nodes[id];
  const used = new Set([id]);
  let made = 0;
  for (let round = 0; round < count && made < count; round++) {
    let linked = false;
    for (const hit of B.nearEdges(n.x, n.z, maxD, used, 10)) {
      if (!ok(id, hit.p)) continue;
      const j = B.split(hit.a, hit.b, hit.w, hit.p, 'junction');
      B.edge(id, j, 4);
      used.add(hit.a).add(hit.b).add(j);
      made++;
      linked = true;
      break;
    }
    if (!linked) break;
  }
}

/** A point beside the straight line a–b through which both halves are walkable, or null. */
function detour(P: LinkProbe, a: Vec2, b: Vec2): Vec2 | null {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 1) return null;
  const n: Vec2 = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
  for (const o of [1, -1, 2, -2, 3, -3, 4, -4, 6, -6]) {
    for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      const m: Vec2 = [a[0] + (b[0] - a[0]) * t + n[0] * o, a[1] + (b[1] - a[1]) * t + n[1] * o];
      if (!P.blocked(m[0], m[1]) && P.clear(a, m) && P.clear(m, b)) return m;
    }
  }
  return null;
}

/**
 * The nearest spot within `maxR` m of (x, z) where a person can stand, preferring one from which
 * every neighbour can be reached in a straight line.
 */
function freeSpot(P: LinkProbe, x: number, z: number, neighbours: { x: number; z: number }[], maxR = 8): Vec2 | null {
  let fallback: Vec2 | null = null;
  for (let r = 1; r <= maxR; r += 1) {
    const n = Math.max(8, Math.round(r * 4));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const p: Vec2 = [x + Math.cos(a) * r, z + Math.sin(a) * r];
      if (P.blocked(p[0], p[1])) continue;
      if (neighbours.every((m) => P.clear(p, [m.x, m.z]))) return p;
      fallback ??= p;
    }
  }
  return fallback;
}

function facadeFront(lm: { center: readonly [number, number]; rotation: number; footprint: { kind: string; d?: number; rz?: number; r?: number } }): Vec2 {
  const [gx, gz] = toGame(lm.center[0], lm.center[1]);
  const th = (lm.rotation * Math.PI) / 180;
  const fp = lm.footprint;
  const depth = (fp.kind === 'rect' ? fp.d! / 2 : fp.kind === 'ellipse' ? fp.rz! : fp.kind === 'circle' ? fp.r! : 10) * 0.6 + 3;
  return [gx + Math.sin(th) * depth, gz - Math.cos(th) * depth];
}

function polylineLength(p: readonly Vec2[]): number {
  let L = 0;
  for (let k = 0; k + 1 < p.length; k++) L += Math.hypot(p[k + 1][0] - p[k][0], p[k + 1][1] - p[k][1]);
  return L;
}

function pointOn(p: readonly Vec2[], t: number): Vec2 {
  let acc = 0;
  for (let k = 0; k + 1 < p.length; k++) {
    const L = Math.hypot(p[k + 1][0] - p[k][0], p[k + 1][1] - p[k][1]);
    if (acc + L >= t || k === p.length - 2) {
      const f = L > 0 ? Math.min(1, Math.max(0, (t - acc) / L)) : 0;
      return [p[k][0] + (p[k + 1][0] - p[k][0]) * f, p[k][1] + (p[k + 1][1] - p[k][1]) * f];
    }
    acc += L;
  }
  return [p[0][0], p[0][1]];
}

function unit(a: readonly number[], b: readonly number[]): Vec2 {
  const x = a[0] - b[0], z = a[1] - b[1];
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
}

function finalize(B: Builder): StreetGraph {
  const nodes = B.nodes;
  const edges = [...B.edges.values()];
  const adj: [number, number][][] = nodes.map(() => []);
  for (const [a, b, w] of edges) {
    adj[a].push([b, w]);
    adj[b].push([a, w]);
  }
  const hash = new Map<string, number[]>();
  for (const n of nodes) {
    const k = `${Math.floor(n.x / 32)},${Math.floor(n.z / 32)}`;
    const l = hash.get(k);
    if (l) l.push(n.id);
    else hash.set(k, [n.id]);
  }
  return {
    nodes,
    edges,
    spots: [],
    termini: [],
    neighbours: (id) => adj[id] ?? [],
    nearest(x, z, maxDist = 100) {
      let best = -1, bd = maxDist;
      const r = Math.ceil(maxDist / 32);
      const kx = Math.floor(x / 32), kz = Math.floor(z / 32);
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++)
          for (const id of hash.get(`${kx + dx},${kz + dz}`) ?? []) {
            const d = Math.hypot(nodes[id].x - x, nodes[id].z - z);
            if (d < bd) { bd = d; best = id; }
          }
      return best;
    },
    components() {
      const seen = new Int32Array(nodes.length).fill(-1);
      const out: number[][] = [];
      for (let s = 0; s < nodes.length; s++) {
        if (seen[s] >= 0 || !adj[s].length) continue;
        const comp: number[] = [];
        const stack = [s];
        seen[s] = out.length;
        while (stack.length) {
          const v = stack.pop()!;
          comp.push(v);
          for (const [w] of adj[v]) if (seen[w] < 0) { seen[w] = out.length; stack.push(w); }
        }
        out.push(comp);
      }
      return out.sort((a, b) => b.length - a.length);
    },
  };
}

