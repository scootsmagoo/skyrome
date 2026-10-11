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
import { WALKS, walkPoints } from './walks';

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
  /** Road links through a building's walls (built with the physics probe only): cut, or kept for want of a way round. */
  walledLinks?: { cut: [number, number][]; kept: [number, number][] };
  /**
   * How the graph joined what its straight links could not (stats): nodes joined along a path on the plan raster
   * (`along`), stray islands joined so (`islands`), nodes parked on the nearest linked node (`parked`: walled in), the
   * explicit walks (walks.ts) and the nodes still without a link (`edgeless`, in the area).
   */
  joins?: { along: number; islands: number; parked: number; walks: number; edgeless: number; ms: number };
  /** Nearest node with a link to a position (within `maxDist`), or −1. */
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
  /**
   * Can a path search step on the cell at (x, z) (cheap: the plan's verdict only)? `fromEnd`: metres from the
   * search's start (a solid landmark's door stands in its footprint: the first metres out of it are free).
   */
  cell?(x: number, z: number, fromEnd: number): boolean;
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
    cell: (x, z, fromEnd) => !bad(x, z) && !prop(x, z, fromEnd) && (fromEnd <= SOLID_FREE || !solid(x, z)),
  };
}

/** A path search leaving a solid landmark's door may cross this much of its footprint (m). */
const SOLID_FREE = 12;
/** A piazza's node stands this far from its centre (m), beside its centrepiece (`ringPoints`). */
const PIAZZA_RING = 3.2;
/** Nodes keep this clear of a fountain's or a shrine's edge (m); compital altars keep it from every link (content/install.ts). */
export const ALTAR_CLEAR = 1.5;

/** The nearest link of a graph to (x, z) within `maxD` m: its distance and the closest point on it; null if none. */
export function nearestLink(g: Pick<StreetGraph, 'nodes' | 'edges'>, x: number, z: number, maxD: number): { d: number; p: Vec2 } | null {
  let best: { d: number; p: Vec2 } | null = null;
  let bd = maxD;
  for (const [a, b] of g.edges) {
    const A = g.nodes[a], C = g.nodes[b];
    if (Math.min(A.x, C.x) > x + bd || Math.max(A.x, C.x) < x - bd || Math.min(A.z, C.z) > z + bd || Math.max(A.z, C.z) < z - bd) continue;
    const ex = C.x - A.x, ez = C.z - A.z;
    const l2 = ex * ex + ez * ez;
    const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - A.x) * ex + (z - A.z) * ez) / l2)) : 0;
    const px = A.x + ex * t, pz = A.z + ez * t;
    const d = Math.hypot(px - x, pz - z);
    if (d < bd) ((bd = d), (best = { d, p: [px, pz] }));
  }
  return best;
}

/**
 * A spot for something a route must not run over (a compital altar): `at` when it stands `clear` m or more from every
 * link of the graph, else found again (`find`) from a point pushed off the nearest link, a few times. Returns the
 * spot farthest from the links found (at least `at`).
 */
export function clearOfLinks<S extends { x: number; z: number }>(g: Pick<StreetGraph, 'nodes' | 'edges'> | null | undefined, at: S, clear: number, find: (x: number, z: number) => S | null): S {
  if (!g) return at;
  let best = at;
  let bestD = nearestLink(g, at.x, at.z, clear)?.d ?? clear;
  let cur = at;
  for (let k = 0; k < 4 && bestD < clear; k++) {
    const near = nearestLink(g, cur.x, cur.z, clear);
    if (!near) break;
    const dx = cur.x - near.p[0], dz = cur.z - near.p[1];
    const d = Math.hypot(dx, dz);
    const [ux, uz] = d > 1e-3 ? [dx / d, dz / d] : [1, 0];
    const next = find(near.p[0] + ux * (clear + 0.2), near.p[1] + uz * (clear + 0.2));
    if (!next) break;
    const nd = nearestLink(g, next.x, next.z, clear)?.d ?? clear;
    if (nd > bestD) ((best = next), (bestD = nd));
    cur = next;
  }
  return best;
}

/**
 * The points of the ring of radius `r` round `c` (12) clear of the edges of `props` (discs) by `ALTAR_CLEAR`, nearest
 * `to` first, then the others, clearest first; `c` itself when the ring has no room.
 */
function ringPoints(c: readonly number[], to: readonly number[], r: number, props: { x: number; z: number; r: number }[]): Vec2[] {
  if (r <= 0.5) return [[c[0], c[1]]];
  const pts: { p: Vec2; clear: number; dTo: number }[] = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const p: Vec2 = [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
    let clear = Infinity;
    for (const o of props) clear = Math.min(clear, Math.hypot(o.x - p[0], o.z - p[1]) - o.r);
    pts.push({ p, clear: Math.min(clear, ALTAR_CLEAR), dTo: Math.hypot(to[0] - p[0], to[1] - p[1]) });
  }
  return pts.sort((a, b) => b.clear - a.clear || a.dTo - b.dTo).map((q) => q.p);
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
  /**
   * Where a walk from (x, z) with no known height starts: the floor under a point `UNKNOWN_UP` m over the ground when
   * it is no higher than `UNKNOWN_TOP` (a raised square, a low podium: from 0.6 m up the ray started inside it), else
   * the floor under 0.6 m up as before.
   */
  const startFloor = (x: number, z: number): number | null => {
    const s = raisedFloor(x, z);
    return s ?? surface(x, z, H(x, z) + 0.6);
  };
  /**
   * The floor under (x, z) found from `UNKNOWN_UP` m over the ground when it is ground level, or a slab no higher than
   * `UNKNOWN_TOP` that carries on round the point (a raised square's paving, a podium: at least three of four points
   * 1.5 m away within 0.3 m of it); null for anything else (inside a wall from up there, a wall's top, or a small
   * thing standing on the ground: an altar, a statue's base, a basin's rim).
   */
  const raisedFloor = (x: number, z: number): number | null => {
    const g = H(x, z);
    const s = surface(x, z, g + UNKNOWN_UP);
    if (s === null || s > g + UNKNOWN_TOP) return null;
    if (s - g <= 0.4) return s;
    let level = 0;
    for (const [dx, dz] of SLAB_DIRS) {
      const t = surface(x + dx, z + dz, s + 0.6);
      if (t !== null && Math.abs(t - s) <= 0.3) level++;
    }
    return level >= 3 ? s : null;
  };
  return {
    blocked(x, z, y) {
      if (y !== undefined) {
        const s = surface(x, z, y + 0.6);
        return s === null || !headroom(x, z, s);
      }
      // Height unknown: a raised square's paving or a low podium is floor (from 0.6 m up the ray started inside it,
      // and every node on it read as walled in); inside a wall or a pier, on a wall's top, or on an altar or a statue's
      // base, it is blocked (`raisedFloor`).
      const s = raisedFloor(x, z);
      return s === null || !headroom(x, z, s);
    },
    clear(a, b, ya) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-3) return true;
      const dir = { x: (b[0] - a[0]) / L, y: 0, z: (b[1] - a[1]) / L };
      let y = ya !== undefined ? surface(a[0], a[1], ya + 0.6) : startFloor(a[0], a[1]);
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

/** Where `raisedFloor` looks for the slab carrying on (m). */
const SLAB_DIRS: readonly (readonly [number, number])[] = [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]];
/** `physicsProbe.blocked` with no height: the floor is searched from this far over the ground (m)… */
const UNKNOWN_UP = 2.5;
/** …and one higher than this over the ground is a wall's or a podium's top, not a street (m). */
const UNKNOWN_TOP = 1.4;

/** Both verdicts. */
export function bothProbes(a: LinkProbe, b: LinkProbe): LinkProbe {
  return {
    clear: (p, q, ya) => a.clear(p, q, ya) && b.clear(p, q, ya),
    blocked: (x, z, y) => a.blocked(x, z, y) || b.blocked(x, z, y),
    cell: (x, z, f) => (a.cell ? a.cell(x, z, f) : !a.blocked(x, z)) && (!b.cell || b.cell(x, z, f)),
  };
}

class Builder {
  nodes: StreetNode[] = [];
  edges = new Map<string, [number, number, number]>();
  /** Edges along flights of steps (parapets on both sides: links join them only at their ends). */
  stairEdges = new Set<string>();
  /** Road edges through a building's walls (the physics probe found no way along or beside them): nothing links onto them. */
  walled = new Set<string>();
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
          // Never onto a flight of steps (over its parapet): the stairs' own ends link outward. Nor onto a road through a wall.
          if (this.stairEdges.has(keyOf(s.a, s.b)) || this.walled.has(keyOf(s.a, s.b))) continue;
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

  /** Remove the edge a–b (the nodes stay). Returns its width, or null when there was none. */
  unedge(a: number, b: number): number | null {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    const e = this.edges.get(key);
    if (!e) return null;
    this.edges.delete(key);
    this.stairEdges.delete(key);
    this.link(a, b, false);
    return e[2];
  }

  /** Are a and b connected (breadth-first over the links)? */
  joined(a: number, b: number): boolean {
    if (a === b) return true;
    const seen = new Set([a]);
    const q = [a];
    for (let h = 0; h < q.length; h++) {
      for (const m of this.adj.get(q[h]) ?? []) {
        if (m === b) return true;
        if (!seen.has(m)) (seen.add(m), q.push(m));
      }
    }
    return false;
  }

  /** Length of the shortest way from a to b along the links (Dijkstra), or Infinity when there is none within `maxLen` m. */
  pathLen(a: number, b: number, maxLen: number): number {
    const dist = new Map<number, number>([[a, 0]]);
    const done = new Set<number>();
    const open = [a];
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (dist.get(open[i])! < dist.get(open[bi])!) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (done.has(cur)) continue;
      const dc = dist.get(cur)!;
      if (cur === b) return dc;
      done.add(cur);
      const A = this.nodes[cur];
      for (const m of this.adj.get(cur) ?? []) {
        const B = this.nodes[m];
        const d = dc + Math.hypot(B.x - A.x, B.z - A.z);
        if (d > maxLen || d >= (dist.get(m) ?? Infinity)) continue;
        dist.set(m, d);
        open.push(m);
      }
    }
    return Infinity;
  }

  /** Nodes reachable from a, counting up to `max`. */
  reach(a: number, max: number): number {
    const seen = new Set([a]);
    const q = [a];
    for (let h = 0; h < q.length && seen.size < max; h++) for (const m of this.adj.get(q[h]) ?? []) if (!seen.has(m)) (seen.add(m), q.push(m));
    return Math.min(seen.size, max);
  }

  /** Insert a node on edge a–b at p (splitting it), returning the node. */
  split(a: number, b: number, w: number, p: Vec2, kind: NodeKind): number {
    const A = this.nodes[a], B = this.nodes[b];
    if (Math.hypot(A.x - p[0], A.z - p[1]) < 1.5) return a;
    if (Math.hypot(B.x - p[0], B.z - p[1]) < 1.5) return b;
    const n = this.node(p[0], p[1], kind, 0.3);
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    const stairs = this.stairEdges.delete(key);
    const wall = this.walled.delete(key);
    this.edges.delete(key);
    this.link(a, b, false);
    this.edge(a, n, w);
    this.edge(n, b, w);
    if (stairs) for (const [x, y] of [[a, n], [n, b]]) this.stairEdges.add(x < y ? `${x},${y}` : `${y},${x}`);
    if (wall) for (const [x, y] of [[a, n], [n, b]]) this.walled.add(x < y ? `${x},${y}` : `${y},${x}`);
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
  // Junction, road and street nodes beside a fountain or a shrine stand clear of it (an altar under a route's corner is mantled).
  for (const sp of work.spots) {
    if (sp.kind !== 'fountain' && sp.kind !== 'shrine') continue;
    const keep = (R[sp.kind] ?? 1) + ALTAR_CLEAR;
    for (const n of B.nodes) {
      const dx = n.x - sp.position.x, dz = n.z - sp.position.z;
      const d = Math.hypot(dx, dz);
      if (d >= keep || bridgeNodes.has(n.id)) continue;
      const [ux, uz] = d > 1e-3 ? [dx / d, dz / d] : [1, 0];
      B.move(n.id, sp.position.x + ux * keep, sp.position.z + uz * keep);
    }
    // A link running over it (a lane through its piazza) bends round it: a node beside it at the same distance.
    for (const hit of B.nearEdges(sp.position.x, sp.position.z, (R[sp.kind] ?? 1) + 0.5, undefined, 4)) {
      if (bridgeNodes.has(hit.a) || bridgeNodes.has(hit.b) || B.stairEdges.has(hit.a < hit.b ? `${hit.a},${hit.b}` : `${hit.b},${hit.a}`)) continue;
      const A = B.nodes[hit.a], C = B.nodes[hit.b];
      let ox = hit.p[0] - sp.position.x, oz = hit.p[1] - sp.position.z;
      let d = Math.hypot(ox, oz);
      if (d < 1e-3) ((ox = -(C.z - A.z)), (oz = C.x - A.x), (d = Math.hypot(ox, oz) || 1));
      const j = B.split(hit.a, hit.b, hit.w, hit.p, A.kind === 'road' ? 'road' : 'street');
      if (j !== hit.a && j !== hit.b) B.move(j, sp.position.x + (ox / d) * keep, sp.position.z + (oz / d) * keep);
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
      // A bridge's deck: the probe starts its walk at the ground under the deck (the river bed), so it cannot judge it.
      if (bridgeNodes.has(a) && bridgeNodes.has(b)) continue;
      const A = B.nodes[a], C = B.nodes[b];
      if (!inArea(A.x, A.z) || !inArea(C.x, C.z)) continue;
      const L = Math.hypot(C.x - A.x, C.z - A.z);
      let suspect = false;
      for (let t = 0; t <= L && !suspect; t += 1.5) suspect = near(A.x + ((C.x - A.x) * t) / L, A.z + ((C.z - A.z) * t) / L);
      if (!suspect || physics.clear([A.x, A.z], [C.x, C.z])) continue;
      const d = detour(physics, [A.x, A.z], [C.x, C.z]);
      if (d) B.split(a, b, w, d, B.nodes[a].kind === 'stairs' ? 'stairs' : 'road');
      // No way beside it either: the road's line runs through a building's walls. Nothing links onto it; it is cut
      // once the network is complete (below).
      else B.walled.add(a < b ? `${a},${b}` : `${b},${a}`);
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
    // On a ring beside the centrepiece (the basin or the compital shrine stands at the centre, the bench and the
    // stall at the sides), clear of all of them, the nearest the street it opens on.
    const own = work.spots.filter((sp) => sp.id.startsWith(`${pz.id}:`));
    const ring = ringPoints(pz.center, pz.junction, Math.min(PIAZZA_RING, pz.r - 0.8), own.map((sp) => ({ x: sp.position.x, z: sp.position.z, r: R[sp.kind] ?? 1 })));
    // The first of them with a clear line to the street it opens on (else the centre, as before: it links some other way).
    const [rx, rz] = ring.find((p) => P.clear(p, pz.junction)) ?? pz.center;
    const id = B.node(rx, rz, 'piazza', 0.5);
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
        if (linkAround(B, id, 1, 70, linkOk) || B.neighbourIds(id).length || !physics) return;
        // No straight link from the door itself: from its foot (down its steps, out of its porch).
        const ap = apron(P, p, nodeY.get(id), [gx, gz]);
        if (!ap) return;
        const a = B.node(ap[0], ap[1], 'landmark', 0.5);
        if (a === id) return;
        B.edge(id, a, 2.5);
        linkAround(B, a, 1, 70, linkOk, [id]);
      });
    }
  }

  // Explicit walks through landmarks (walks.ts): joined as drawn, their ends linked to the streets.
  let walks = 0;
  for (const w of WALKS) {
    const pl = w.landmark ? game?.landmarks?.get(w.landmark) : null;
    if (w.landmark && !pl) continue;
    const pts = walkPoints(w, pl ?? null);
    if (!pts.every((p) => inArea(p[0], p[1]))) continue;
    // Within a metre of a node already there (a landmark's door, another walk's end): the same node.
    const ids = pts.map((p) => B.node(p[0], p[1], 'landmark', WALK_MERGE));
    for (let k = 0; k + 1 < ids.length; k++) B.edge(ids[k], ids[k + 1], 3);
    for (const k of w.link ?? [0, ids.length - 1]) linkAround(B, ids[k], 1, 40, linkOk, ids);
    walks++;
  }

  // Loose ends the snapping above missed (a road running into a landmark's apron, the foot of a
  // stairway, a lane ending against a slope): the nearest walkable link, up to 30 m, to another
  // street (never back onto its own neighbours).
  if (opts.deadEnds !== false) closeDeadEnds(B, linkOk, inArea, 30);

  // Islands of streets that end on open ground (plazas, landmark aprons, slopes): a short path to
  // the nearest node of the main network.
  linkIslands(B, linkOk);

  // Road links through a building's walls (the Clivus Palatinus, bent round Jupiter Stator, ran through the walled
  // court of the Porticus Margaritaria: a node in the court, its links through the walls; a route along them walks
  // into brickwork). All are taken out; one stays out when that leaves a lone node (no link: never anyone's nearest)
  // or when the network joins its ends another way that is not much longer (2.5 times, plus 60 m). Otherwise it
  // goes back: the graph has no better way there (the Argiletum's link through the Forum of Nerva: the way round is
  // 950 m), and the NPC planner cuts it when the walk finds it walled (StreetNav.drop). A road end left loose is
  // joined to the nearest street a person can walk to.
  const cuts: [number, number, number][] = [];
  for (const key of B.walled) {
    const [a, b] = key.split(',').map(Number);
    const w = B.unedge(a, b);
    if (w !== null) cuts.push([a, b, w]);
  }
  /** Where each node left by a cut was linked before (a lone node is parked there if nothing else joins it). */
  const before = new Map<number, number>();
  for (const [a, b] of cuts) (before.set(a, b), before.set(b, a));
  const loose: number[] = [];
  for (const [a, b, w] of cuts) {
    const A = B.nodes[a], C = B.nodes[b];
    const L = Math.hypot(C.x - A.x, C.z - A.z);
    const lone = !B.neighbourIds(a).length || !B.neighbourIds(b).length;
    if (lone || B.pathLen(a, b, L * 2.5 + 60) < Infinity) loose.push(a, b);
    else B.edge(a, b, w);
  }
  const walledLinks = { cut: [] as [number, number][], kept: [] as [number, number][] };
  for (const [a, b] of cuts) (B.neighbourIds(a).includes(b) ? walledLinks.kept : walledLinks.cut).push([a, b]);
  if (opts.deadEnds !== false && loose.length) closeDeadEnds(B, linkOk, inArea, 30, loose.filter((id) => B.neighbourIds(id).length === 1));

  // No node without a link, and no stray island: what the straight links could not join is joined along a path
  // on the plan raster, each leg of it checked like any other link (joinStrays).
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const joins = opts.deadEnds === false ? null : joinStrays(B, P, nodeY, inArea, before);
  alongBuf = null;

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
  graph.walledLinks = walledLinks;
  if (joins) graph.joins = { ...joins, walks, ms: (typeof performance !== 'undefined' ? performance.now() : 0) - t0 };
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
function closeDeadEnds(B: Builder, ok: (id: number, p: Vec2) => boolean, inArea: (x: number, z: number) => boolean, maxD: number, only?: readonly number[]) {
  for (const n of only ? only.map((id) => B.nodes[id]) : [...B.nodes]) {
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

/**
 * Join what the straight links could not: every node in the area with no link, then every stray island of streets,
 * to the city's network (the largest component) along a path on the plan raster (`linkAlong`). A node that still has
 * no link is parked on the node it was linked to before a cut took its links (a road's node inside a walled court),
 * or on the nearest linked node of the network within `PARK_REACH` m (a door walled in on every side): it stays where a
 * route can end, and never leads into the walls.
 */
function joinStrays(B: Builder, P: LinkProbe, nodeY: Map<number, number>, inArea: (x: number, z: number) => boolean, before: Map<number, number>) {
  const out = { along: 0, islands: 0, parked: 0, edgeless: 0 };
  const mainSet = () => new Set(finalize(B).components()[0] ?? []);
  let main = mainSet();
  for (const n of [...B.nodes]) {
    if (B.neighbourIds(n.id).length || !inArea(n.x, n.z)) continue;
    if (linkAlong(B, n.id, P, main, nodeY.get(n.id))) {
      out.along++;
      main.add(n.id);
    }
  }
  // Islands: from their nodes nearest the network, a few tries each.
  main = mainSet();
  const comps = finalize(B).components().slice(1);
  const mainNodes = [...main].map((id) => B.nodes[id]);
  for (const comp of comps) {
    if (!comp.some((id) => inArea(B.nodes[id].x, B.nodes[id].z))) continue;
    const near = comp
      .filter((id) => !B.midStairs(id))
      .map((id) => {
        const n = B.nodes[id];
        let d = Infinity;
        for (const m of mainNodes) d = Math.min(d, Math.abs(m.x - n.x) + Math.abs(m.z - n.z));
        return { id, d };
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    for (const { id, d } of near) {
      if (d > 180) break;
      if (linkAlong(B, id, P, main, nodeY.get(id))) {
        out.islands++;
        for (const k of comp) main.add(k);
        break;
      }
    }
  }
  // Parked: still no link.
  for (const n of B.nodes) {
    if (B.neighbourIds(n.id).length || !inArea(n.x, n.z)) continue;
    let to = before.get(n.id);
    if (to === undefined || !B.neighbourIds(to).length) {
      to = undefined;
      let bd = PARK_REACH;
      for (const m of main) {
        const q = B.nodes[m];
        const d = Math.hypot(q.x - n.x, q.z - n.z);
        if (d < bd && B.neighbourIds(m).length && !B.midStairs(m)) ((bd = d), (to = m));
      }
    }
    if (to === undefined) {
      out.edgeless++;
      continue;
    }
    B.move(n.id, B.nodes[to].x, B.nodes[to].z);
    B.edge(n.id, to, 2);
    out.parked++;
  }
  return out;
}

/** A walk's point this near a node already in the graph is that node (m; a walk's own points are farther apart). */
const WALK_MERGE = 1;

/** A node nothing joins is parked on the nearest linked node of the network within this (m). */
const PARK_REACH = 90;

/** linkAlong's buffers (one window), kept while a graph is built. */
let alongBuf: { goal: Uint8Array; state: Int8Array; dist: Float32Array; came: Int32Array } | null = null;

/** Search window of `linkAlong` (m from the node) and its most expansions. */
const ALONG = { reach: 90, expand: 12000, retries: 16, goal: 1.6 };

/**
 * Link node `id` to the network (`main`: node ids) along a short path: A* (Dijkstra, many goals) on 1 m cells of the
 * plan raster within 90 m (`LinkProbe.cell`) to the nearest cell within 1.6 m of a link of the network, then
 * string-pulled, every leg checked with the full probe (physics included). A leg the probe refuses blocks its cell
 * and the search runs again (a few times). The path's corners become nodes. Returns true when linked.
 */
function linkAlong(B: Builder, id: number, P: LinkProbe, main: Set<number>, ya?: number): boolean {
  const n = B.nodes[id];
  const R = ALONG.reach;
  const W = 2 * R + 1;
  const ox = n.x - R, oz = n.z - R;
  const at = (i: number): Vec2 => [ox + (i % W), oz + Math.floor(i / W)];
  const cellOf = (x: number, z: number) => {
    const i = Math.round(x - ox), j = Math.round(z - oz);
    return i < 0 || j < 0 || i >= W || j >= W ? -1 : j * W + i;
  };
  // Goal cells: near a link of the network (not along a stair's parapets, nor a walled road).
  const buf = (alongBuf ??= { goal: new Uint8Array(W * W), state: new Int8Array(W * W), dist: new Float32Array(W * W), came: new Int32Array(W * W) });
  const goal = buf.goal.fill(0);
  let goals = 0;
  for (const e of B.nearEdges(n.x, n.z, R * 1.42, new Set([id]), 100000)) {
    if (!main.has(e.a) || !main.has(e.b)) continue;
    const A = B.nodes[e.a], C = B.nodes[e.b];
    const L = Math.hypot(C.x - A.x, C.z - A.z);
    const steps = Math.max(1, Math.ceil(L / 0.5));
    for (let k = 0; k <= steps; k++) {
      const x = A.x + ((C.x - A.x) * k) / steps, z = A.z + ((C.z - A.z) * k) / steps;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const c = cellOf(x + dx, z + dz);
          if (c < 0 || goal[c]) continue;
          const [cx, cz] = at(c);
          if (Math.hypot(cx - x, cz - z) <= ALONG.goal) ((goal[c] = 1), goals++);
        }
    }
  }
  if (!goals) return false;
  const state = buf.state.fill(0); // 0 unknown, 1 free, 2 blocked
  const free = (c: number) => {
    if (!state[c]) {
      const [x, z] = at(c);
      const from = Math.hypot(x - n.x, z - n.z);
      // The plan first (cheap), then the colliders (inside a wall, no headroom); the door a search leaves stands in its own building.
      const f = (P.cell ? P.cell(x, z, from) : true) && (from < 1.5 || !P.blocked(x, z));
      state[c] = f ? 1 : 2;
    }
    return state[c] === 1;
  };
  const start = cellOf(n.x, n.z);
  const dist = buf.dist;
  const came = buf.came;
  for (let attempt = 0; attempt < ALONG.retries; attempt++) {
    dist.fill(Infinity);
    const heap = new CellHeap();
    dist[start] = 0;
    came[start] = -1;
    heap.push(start, 0);
    let found = -1;
    let expanded = 0;
    while (heap.size) {
      const [c, d] = heap.pop();
      if (d > dist[c]) continue;
      if (goal[c] && c !== start) {
        found = c;
        break;
      }
      if (++expanded > ALONG.expand) break;
      const ci = c % W, cj = Math.floor(c / W);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const i = ci + dx, j = cj + dz;
          if (i < 0 || j < 0 || i >= W || j >= W) continue;
          const m = j * W + i;
          if (!free(m)) continue;
          // No corner cutting past a blocked cell.
          if (dx && dz && (!free(cj * W + i) || !free(j * W + ci))) continue;
          const nd = d + (dx && dz ? Math.SQRT2 : 1);
          if (nd >= dist[m]) continue;
          dist[m] = nd;
          came[m] = c;
          heap.push(m, nd);
        }
    }
    if (found < 0) return false;
    // The cells from the node to the goal.
    const cells: number[] = [];
    for (let c = found; c >= 0 && c !== start; c = came[c]) cells.push(c);
    cells.reverse();
    const pts: Vec2[] = [[n.x, n.z], ...cells.map(at)];
    // The network's link the path reaches, and the point on it.
    const end = pts[pts.length - 1];
    const hit = B.nearEdges(end[0], end[1], ALONG.goal + 0.8, new Set([id]), 6).find((e) => main.has(e.a) && main.has(e.b));
    if (!hit) return false;
    pts.push(hit.p);
    // String-pull: from each corner the farthest point the full probe walks to (a few tries per corner).
    const corners: Vec2[] = [pts[0]];
    let i = 0;
    let bad = -1;
    while (i < pts.length - 1) {
      let next = -1;
      for (const k of [64, 32, 16, 8, 4, 2, 1]) {
        const j = Math.min(pts.length - 1, i + k);
        if (j <= i) continue;
        if (P.clear(pts[i], pts[j], i === 0 ? ya : undefined)) {
          next = j;
          break;
        }
      }
      if (next < 0) {
        bad = i + 1;
        break;
      }
      corners.push(pts[next]);
      i = next;
    }
    if (bad >= 0) {
      // Block the cell the probe could not reach and search again (the last point is on the link: its cell then).
      const c = cellOf(pts[Math.min(bad, pts.length - 2)][0], pts[Math.min(bad, pts.length - 2)][1]);
      if (c < 0 || c === start) return false;
      state[c] = 2;
      goal[c] = 0;
      continue;
    }
    // The corners become nodes; the last one splits the network's link.
    let prev = id;
    for (let k = 1; k < corners.length - 1; k++) {
      const m = B.node(corners[k][0], corners[k][1], 'street', 0.3);
      if (m !== prev) B.edge(prev, m, 2.5);
      prev = m;
    }
    const j = B.split(hit.a, hit.b, hit.w, hit.p, 'junction');
    if (j !== prev) B.edge(prev, j, 2.5);
    return true;
  }
  return false;
}

/** A small binary heap of (cell, cost) for linkAlong. */
class CellHeap {
  private c: number[] = [];
  private k: number[] = [];
  get size() {
    return this.c.length;
  }
  push(cell: number, key: number) {
    const c = this.c, k = this.k;
    let i = c.length;
    c.push(cell);
    k.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      c[i] = c[p];
      k[i] = k[p];
      i = p;
    }
    c[i] = cell;
    k[i] = key;
  }
  pop(): [number, number] {
    const c = this.c, k = this.k;
    const top: [number, number] = [c[0], k[0]];
    const lc = c.pop()!, lk = k.pop()!;
    if (c.length) {
      let i = 0;
      for (;;) {
        let m = 2 * i + 1;
        if (m >= c.length) break;
        if (m + 1 < c.length && k[m + 1] < k[m]) m++;
        if (k[m] >= lk) break;
        c[i] = c[m];
        k[i] = k[m];
        i = m;
      }
      c[i] = lc;
      k[i] = lk;
    }
    return top;
  }
}

/** Link a node to up to `count` different nearby streets, by the nearest walkable links. */
function linkAround(B: Builder, id: number, count: number, maxD: number, ok: (id: number, p: Vec2) => boolean, skip: Iterable<number> = []): number {
  const n = B.nodes[id];
  const used = new Set([id, ...skip]);
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
  return made;
}

/**
 * The foot of a door that no straight link reaches (a temple's door on its podium, a basilica's behind its steps):
 * the farthest point up to 12 m (`APRON.dists`) straight out of it that a person walks to from the door (`P.clear` from the
 * door's height), outward from the landmark's centre first, then turning either way. Null when none is 3 m or more.
 */
function apron(P: LinkProbe, door: Vec2, y: number | undefined, centre: Vec2): Vec2 | null {
  const dx = door[0] - centre[0], dz = door[1] - centre[1];
  const a0 = Math.atan2(dz, dx);
  for (const turn of APRON.turns) {
    const a = a0 + turn;
    for (const d of APRON.dists) {
      const p: Vec2 = [door[0] + Math.cos(a) * d, door[1] + Math.sin(a) * d];
      if (P.clear(door, p, y)) return p;
    }
  }
  return null;
}

/** Door aprons: directions tried (radians off the outward one) and distances (m, farthest first). */
const APRON = { turns: [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2], dists: [12, 8, 5, 3] };

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
            // A node with no link (a road's cut through a building, a door nothing reaches) leads nowhere.
            if (!adj[id].length) continue;
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

