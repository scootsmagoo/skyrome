/**
 * Street graph for NPC navigation (`game.streets`): nodes every ≤ 24 m along the atlas roads and
 * the minor streets, junctions where streets meet or cross, the piazzas, the open fora and plazas,
 * and the fronts (or entrance spots) of the landmarks; edges carry the walkable width. Spots are
 * the places NPCs go: shop and house doors along the blocks, fountains, shrines, benches, stalls.
 *
 * The graph is built from polylines snapped together with a segment hash, so streets that end on
 * another street, cross it, or end at a plaza are connected.
 */
import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Vec2 } from '../../arch/fabric/types';
import { toGame } from '../coords';
import type { CityPlan } from './plan';
import { K, polyCentroid } from './raster';
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
  /** Nearest node to a position (within `maxDist`), or −1. */
  nearest(x: number, z: number, maxDist?: number): number;
  /** Neighbours of a node: [node, width][]. */
  neighbours(id: number): [number, number][];
  /** Connected components (largest first), as node-id arrays. */
  components(): number[][];
}

const SOLID = new Set(['temple', 'basilica', 'baths', 'palace', 'theatre', 'amphitheatre', 'stadium', 'library', 'curia', 'warehouse', 'prison', 'odeum', 'house', 'tomb']);

class Builder {
  nodes: StreetNode[] = [];
  edges = new Map<string, [number, number, number]>();
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

  /** Insert a node on edge a–b at p (splitting it), returning the node. */
  split(a: number, b: number, w: number, p: Vec2, kind: NodeKind): number {
    const A = this.nodes[a], B = this.nodes[b];
    if (Math.hypot(A.x - p[0], A.z - p[1]) < 1.5) return a;
    if (Math.hypot(B.x - p[0], B.z - p[1]) < 1.5) return b;
    const n = this.node(p[0], p[1], kind, 0.3);
    this.edges.delete(a < b ? `${a},${b}` : `${b},${a}`);
    this.link(a, b, false);
    this.edge(a, n, w);
    this.edge(n, b, w);
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
        if (prev >= 0) this.edge(prev, id, w);
        ids.push(id);
        prev = id;
      }
    }
    return ids;
  }
}

export function buildStreetGraph(plan: CityPlan, work: StreetWork, game: Game | null, inArea: (x: number, z: number) => boolean): StreetGraph {
  const B = new Builder();
  const g = plan.grid;
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
    ends.push({ id: ids[0], dir: unit(br.a, br.b), reach: 14 });
    ends.push({ id: ids[ids.length - 1], dir: unit(br.b, br.a), reach: 14 });
  }
  for (const r of plan.roads) {
    const ids = B.polyline(r.points, r.half * 2, r.style === 'stairs' ? 'stairs' : 'road', 24, onLand);
    if (ids.length) {
      const p = r.points;
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
  // Snap loose ends onto the street they meet.
  for (const e of ends) {
    const n = B.nodes[e.id];
    const own = new Set([e.id, ...B.edgesOf(e.id)]);
    const hit = B.nearestEdge(n.x + e.dir[0] * 1.5, n.z + e.dir[1] * 1.5, e.reach + 6, own);
    if (!hit) continue;
    const j = B.split(hit.a, hit.b, hit.w, hit.p, 'junction');
    B.edge(e.id, j, Math.min(hit.w, 4));
  }
  // Piazzas (on the street they open on).
  for (const pz of plan.piazzas) {
    if (!inArea(pz.center[0], pz.center[1])) continue;
    const id = B.node(pz.center[0], pz.center[1], 'piazza', 0.5);
    const hit = B.nearestEdge(pz.junction[0], pz.junction[1], 12, new Set([id]));
    if (hit) B.edge(id, B.split(hit.a, hit.b, hit.w, hit.p, 'junction'), pz.r * 2);
  }
  // Open fora and plazas: a node at the centre, linked to the nearest streets around them.
  for (const pl of plan.plazas) {
    const c = polyCentroid(pl.polygon);
    if (!inArea(c[0], c[1])) continue;
    const id = B.node(c[0], c[1], 'plaza', 0.5);
    linkAround(B, id, 3, 90);
  }
  // Landmark entrances: their own spots when they declare doors / entrances, else the facade front.
  if (game?.landmarks) {
    for (const pl of game.landmarks.values()) {
      const lm = pl.lm;
      const [gx, gz] = toGame(lm.center[0], lm.center[1]);
      if (!inArea(gx, gz)) continue;
      const doors = pl.spots.filter((s) => /door|entr|gate/i.test(s.kind));
      const pts: Vec2[] = doors.length ? doors.slice(0, 4).map((s) => [s.position.x, s.position.z] as Vec2) : [facadeFront(lm)];
      for (const p of pts) {
        const id = B.node(p[0], p[1], 'landmark', 0.5);
        linkAround(B, id, 1, 70);
      }
    }
  }

  // Islands of streets that end on open ground (plazas, landmark aprons, slopes): a short path to
  // the nearest node of the main network.
  linkIslands(B);

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
      emit({ id: `${blockId}:door${n++}`, kind: house ? 'houseDoor' : 'shopDoor', position: new THREE.Vector3(x, H(x, z) + (sidewalk[e] ?? 0), z), heading, block: blockId });
    }
  }
}

function linkIslands(B: Builder) {
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
      let best: [number, number, number] | null = null;
      for (const id of comp) {
        const n = B.nodes[id];
        const kx = Math.floor(n.x / 30), kz = Math.floor(n.z / 30);
        for (let dx = -2; dx <= 2; dx++)
          for (let dz = -2; dz <= 2; dz++)
            for (const m of hash.get(`${kx + dx},${kz + dz}`) ?? []) {
              const d = Math.hypot(m.x - n.x, m.z - n.z);
              if (d < 60 && (!best || d < best[2])) best = [id, m.id, d];
            }
      }
      if (best && !main.has(best[0])) {
        B.edge(best[0], best[1], 2.5);
        linked++;
      }
    }
    if (!linked) return;
  }
}

function linkAround(B: Builder, id: number, count: number, maxD: number) {
  const n = B.nodes[id];
  const used = new Set([id]);
  for (let k = 0; k < count; k++) {
    const hit = B.nearestEdge(n.x, n.z, maxD, used);
    if (!hit) break;
    const j = B.split(hit.a, hit.b, hit.w, hit.p, 'junction');
    B.edge(id, j, 4);
    used.add(hit.a).add(hit.b).add(j);
  }
}

function facadeFront(lm: { center: readonly [number, number]; rotation: number; footprint: { kind: string; d?: number; rz?: number; r?: number } }): Vec2 {
  const [gx, gz] = toGame(lm.center[0], lm.center[1]);
  const th = (lm.rotation * Math.PI) / 180;
  const fp = lm.footprint;
  const depth = (fp.kind === 'rect' ? fp.d! / 2 : fp.kind === 'ellipse' ? fp.rz! : fp.kind === 'circle' ? fp.r! : 10) * 0.6 + 3;
  return [gx + Math.sin(th) * depth, gz - Math.cos(th) * depth];
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

