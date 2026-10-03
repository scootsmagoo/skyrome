/**
 * Street graph adapter (GDD §14.7b: "A* over street and vicus centerlines, doors and fora as
 * nodes"). The city crew publishes `game.streets` as `{ nodes, edges, spots }`; its exact shape is
 * theirs, so this file codes against a tolerant local interface and normalises whatever arrives:
 *
 *   nodes: array or Map of { id?, x, z, y?, tags?/kind? } (or { position: {x, y, z} })
 *   edges: array of { a, b } | { from, to } | [a, b]  (node ids or array indices), optional width/kind
 *   spots: array of { id, kind, position: {x, y, z}, facing?, tag? } (fabric `Spot`s: shopDoor,
 *          houseDoor, fountain, shrine, bench, stall, tree, well, workshop)
 *
 * Absent or malformed input gives an empty graph; callers then fall back to the local grid or to
 * wandering on open ground.
 */

export interface StreetNodeLike {
  id?: string | number;
  x?: number;
  y?: number;
  z?: number;
  position?: { x: number; y?: number; z: number };
  tags?: readonly string[];
  kind?: string;
}

export interface StreetEdgeLike {
  a?: string | number;
  b?: string | number;
  from?: string | number;
  to?: string | number;
  width?: number;
  kind?: string;
}

export interface StreetSpotLike {
  id: string;
  kind: string;
  position: { x: number; y?: number; z: number };
  facing?: number;
  tag?: string;
}

export interface StreetGraphLike {
  nodes?: readonly StreetNodeLike[] | ReadonlyMap<string | number, StreetNodeLike>;
  edges?: readonly (StreetEdgeLike | readonly [string | number, string | number])[];
  spots?: readonly StreetSpotLike[];
}

export interface StreetNode {
  i: number;
  id: string;
  x: number;
  y: number;
  z: number;
  tags: readonly string[];
}

export interface StreetSpot {
  id: string;
  kind: string;
  x: number;
  y: number;
  z: number;
  facing: number;
  tag?: string;
}

/** A normalised street graph with A* and nearest-node queries. */
export class StreetNav {
  readonly nodes: StreetNode[] = [];
  readonly adj: { to: number; w: number; width: number }[][] = [];
  readonly spots: StreetSpot[] = [];
  private grid = new Map<number, number[]>();
  private readonly gridSize = 32;
  /** The raw object this was built from (rebuild when it changes). */
  readonly source: unknown;

  constructor(raw: StreetGraphLike | null | undefined) {
    this.source = raw;
    if (!raw || typeof raw !== 'object') return;
    const byId = new Map<string, number>();
    const rawNodes: [string | number | undefined, StreetNodeLike][] = [];
    if (raw.nodes instanceof Map) for (const [k, n] of raw.nodes) rawNodes.push([k, n]);
    else if (Array.isArray(raw.nodes)) raw.nodes.forEach((n, i) => rawNodes.push([n?.id ?? i, n]));
    for (const [k, n] of rawNodes) {
      if (!n) continue;
      const x = n.position?.x ?? n.x;
      const z = n.position?.z ?? n.z;
      if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) continue;
      const i = this.nodes.length;
      const id = String(n.id ?? k ?? i);
      const tags = [...(n.tags ?? []), ...(n.kind ? [n.kind] : [])];
      this.nodes.push({ i, id, x, y: n.position?.y ?? n.y ?? NaN, z, tags });
      this.adj.push([]);
      byId.set(id, i);
      if (k !== undefined) byId.set(String(k), i);
    }
    const resolve = (v: string | number | undefined) => (v === undefined ? undefined : byId.get(String(v)));
    for (const e of raw.edges ?? []) {
      let a: number | undefined;
      let b: number | undefined;
      let width = 4;
      if (Array.isArray(e)) {
        a = resolve(e[0]);
        b = resolve(e[1]);
      } else if (e && typeof e === 'object') {
        const o = e as StreetEdgeLike;
        a = resolve(o.a ?? o.from);
        b = resolve(o.b ?? o.to);
        if (typeof o.width === 'number') width = o.width;
      }
      if (a === undefined || b === undefined || a === b) continue;
      const na = this.nodes[a];
      const nb = this.nodes[b];
      const w = Math.hypot(na.x - nb.x, na.z - nb.z);
      this.adj[a].push({ to: b, w, width });
      this.adj[b].push({ to: a, w, width });
    }
    for (const s of raw.spots ?? []) {
      if (!s?.position || typeof s.position.x !== 'number' || typeof s.position.z !== 'number') continue;
      this.spots.push({ id: String(s.id), kind: String(s.kind), x: s.position.x, y: s.position.y ?? NaN, z: s.position.z, facing: s.facing ?? 0, tag: s.tag });
    }
    for (const n of this.nodes) {
      const k = this.cellKey(n.x, n.z);
      let l = this.grid.get(k);
      if (!l) this.grid.set(k, (l = []));
      l.push(n.i);
    }
  }

  get empty() {
    return this.nodes.length === 0;
  }

  private cellKey(x: number, z: number) {
    return (Math.floor(x / this.gridSize) + 32768) * 65536 + (Math.floor(z / this.gridSize) + 32768);
  }

  /** Nearest node within `maxR` metres (grid-bucketed search). */
  nearest(x: number, z: number, maxR = 200, filter?: (n: StreetNode) => boolean): StreetNode | null {
    let best: StreetNode | null = null;
    let bd = maxR * maxR;
    const rings = Math.ceil(maxR / this.gridSize);
    const cx = Math.floor(x / this.gridSize);
    const cz = Math.floor(z / this.gridSize);
    for (let r = 0; r <= rings; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const l = this.grid.get((cx + dx + 32768) * 65536 + (cz + dz + 32768));
          if (!l) continue;
          for (const i of l) {
            const n = this.nodes[i];
            const d = (n.x - x) ** 2 + (n.z - z) ** 2;
            if (d < bd && (!filter || filter(n))) {
              bd = d;
              best = n;
            }
          }
        }
      }
      // Anything found in ring r is closer than ring r+1's nearest possible point.
      if (best && Math.sqrt(bd) <= r * this.gridSize) break;
    }
    return best;
  }

  /** A* between two nodes; returns node indices including both ends, or null. */
  route(from: number, to: number, maxExpand = 20000): number[] | null {
    if (from === to) return [from];
    const N = this.nodes;
    const g = new Float64Array(N.length).fill(Infinity);
    const came = new Int32Array(N.length).fill(-1);
    const closed = new Uint8Array(N.length);
    const open: number[] = [from];
    const f = new Float64Array(N.length).fill(Infinity);
    const goal = N[to];
    const h = (i: number) => Math.hypot(N[i].x - goal.x, N[i].z - goal.z);
    g[from] = 0;
    f[from] = h(from);
    let n = 0;
    while (open.length) {
      // Small graphs near the player: linear scan of the open list is fine (and allocation-free).
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === to) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (++n > maxExpand) return null;
      for (const e of this.adj[cur]) {
        const c = g[cur] + e.w;
        if (c < g[e.to]) {
          g[e.to] = c;
          came[e.to] = cur;
          f[e.to] = c + h(e.to);
          open.push(e.to);
        }
      }
    }
    if (came[to] < 0) return null;
    const out = [to];
    let k = to;
    while (k !== from) {
      k = came[k];
      if (k < 0) return null;
      out.push(k);
    }
    return out.reverse();
  }

  /** Waypoints (game x/z) from a point to a point along the streets, or null. */
  path(ax: number, az: number, bx: number, bz: number): { x: number; z: number }[] | null {
    if (this.empty) return null;
    const a = this.nearest(ax, az, 120);
    const b = this.nearest(bx, bz, 120);
    if (!a || !b) return null;
    const r = this.route(a.i, b.i);
    if (!r) return null;
    const pts = r.map((i) => ({ x: this.nodes[i].x, z: this.nodes[i].z }));
    pts.push({ x: bx, z: bz });
    return pts;
  }

  /** Spots of a kind within `r` of a point, nearest first. */
  spotsNear(x: number, z: number, r: number, kind?: string | ((s: StreetSpot) => boolean)): StreetSpot[] {
    const r2 = r * r;
    const out: [number, StreetSpot][] = [];
    for (const s of this.spots) {
      if (kind && (typeof kind === 'string' ? s.kind !== kind : !kind(s))) continue;
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d <= r2) out.push([d, s]);
    }
    return out.sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  }

  /** Nodes tagged with any of `tags` (flee targets: home, guard, crowd). */
  tagged(...tags: string[]): StreetNode[] {
    return this.nodes.filter((n) => n.tags.some((t) => tags.includes(t)));
  }
}
