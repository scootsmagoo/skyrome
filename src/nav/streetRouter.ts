/**
 * Street routing for the player's quest route (pure). The city's street graph (`game.streets`,
 * src/world/city/network.ts: about 8k nodes and 8.6k edges) is packed once into flat arrays
 * (compressed adjacency) and searched with A* on a binary heap. Every search reuses the same typed
 * arrays, so a route across Rome costs a millisecond or two and no garbage beyond its result.
 *
 * The NPCs' StreetNav (src/ai/life/streets.ts) scans its open list linearly: fine for short hops
 * near the player, slow for a route across the city, hence this one.
 */

export interface GraphLike {
  nodes: readonly { id?: number | string; x: number; z: number }[];
  /** [a, b] or [a, b, width] by node id (or index when ids are indices). */
  edges: readonly (readonly [number, number, number?] | readonly number[])[];
}

export class StreetRouter {
  readonly n: number;
  readonly x: Float32Array;
  readonly z: Float32Array;
  /** Connected component of each node (0 = the largest). */
  readonly comp: Int32Array;
  /** Expansions in the last search (stats, tests). */
  lastExpanded = 0;
  private readonly off: Int32Array;
  private readonly to: Int32Array;
  private readonly w: Float32Array;
  // Search state, reused: a generation stamp marks what this search has touched.
  private readonly g: Float32Array;
  private readonly came: Int32Array;
  private readonly seen: Uint32Array;
  private readonly done: Uint32Array;
  private gen = 0;
  private readonly goalStamp: Uint32Array;
  private readonly goalCost: Float32Array;
  private readonly near: number[] = [];
  private heapNode: Int32Array;
  private heapKey: Float32Array;
  private heapN = 0;
  // Spatial buckets for nearest-node queries.
  private readonly cell = 32;
  private readonly buckets = new Map<number, number[]>();

  constructor(graph: GraphLike) {
    const nodes = graph.nodes;
    const n = (this.n = nodes.length);
    this.x = new Float32Array(n);
    this.z = new Float32Array(n);
    const index = new Map<number | string, number>();
    for (let i = 0; i < n; i++) {
      const nd = nodes[i];
      this.x[i] = nd.x;
      this.z[i] = nd.z;
      index.set(nd.id ?? i, i);
    }
    const ix = (v: number | string | undefined) => (v === undefined ? -1 : (index.get(v) ?? -1));
    // Count, then fill (both directions).
    const deg = new Int32Array(n + 1);
    const pairs: number[] = [];
    for (const e of graph.edges) {
      const a = ix(e[0]);
      const b = ix(e[1]);
      if (a < 0 || b < 0 || a === b) continue;
      pairs.push(a, b);
      deg[a]++;
      deg[b]++;
    }
    this.off = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) this.off[i + 1] = this.off[i] + deg[i];
    const m = this.off[n];
    this.to = new Int32Array(m);
    this.w = new Float32Array(m);
    const fill = this.off.slice(0, n);
    for (let k = 0; k < pairs.length; k += 2) {
      const a = pairs[k];
      const b = pairs[k + 1];
      const d = Math.hypot(this.x[a] - this.x[b], this.z[a] - this.z[b]);
      this.to[fill[a]] = b;
      this.w[fill[a]++] = d;
      this.to[fill[b]] = a;
      this.w[fill[b]++] = d;
    }
    // One extra slot: the virtual goal of routeBetween.
    this.g = new Float32Array(n + 1);
    this.came = new Int32Array(n + 1);
    this.seen = new Uint32Array(n + 1);
    this.done = new Uint32Array(n + 1);
    this.goalStamp = new Uint32Array(n);
    this.goalCost = new Float32Array(n);
    this.heapNode = new Int32Array(Math.max(16, m + 4));
    this.heapKey = new Float32Array(this.heapNode.length);
    this.comp = this.label();
    for (let i = 0; i < n; i++) {
      const k = this.key(Math.floor(this.x[i] / this.cell), Math.floor(this.z[i] / this.cell));
      let l = this.buckets.get(k);
      if (!l) this.buckets.set(k, (l = []));
      l.push(i);
    }
  }

  get empty() {
    return this.n === 0;
  }

  private key(cx: number, cz: number) {
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  /** Components by flood fill, renumbered so 0 is the largest. */
  private label(): Int32Array {
    const comp = new Int32Array(this.n).fill(-1);
    const sizes: number[] = [];
    const stack: number[] = [];
    for (let s = 0; s < this.n; s++) {
      if (comp[s] >= 0) continue;
      const c = sizes.length;
      let size = 0;
      comp[s] = c;
      stack.push(s);
      while (stack.length) {
        const v = stack.pop()!;
        size++;
        for (let k = this.off[v]; k < this.off[v + 1]; k++) {
          const u = this.to[k];
          if (comp[u] < 0) {
            comp[u] = c;
            stack.push(u);
          }
        }
      }
      sizes.push(size);
    }
    const order = sizes.map((_, i) => i).sort((a, b) => sizes[b] - sizes[a]);
    const rank = new Int32Array(sizes.length);
    order.forEach((c, r) => (rank[c] = r));
    for (let i = 0; i < this.n; i++) comp[i] = rank[comp[i]];
    return comp;
  }

  /** Nearest node within `maxR` metres, or −1. `comp` limits it to one component (the route's other end must be reachable). */
  nearest(x: number, z: number, maxR = 150, comp = -1): number {
    let best = -1;
    let bd = maxR * maxR;
    const cs = this.cell;
    const cx = Math.floor(x / cs);
    const cz = Math.floor(z / cs);
    const rings = Math.ceil(maxR / cs);
    for (let r = 0; r <= rings; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const l = this.buckets.get(this.key(cx + dx, cz + dz));
          if (!l) continue;
          for (const i of l) {
            if (comp >= 0 && this.comp[i] !== comp) continue;
            const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2;
            if (d < bd) {
              bd = d;
              best = i;
            }
          }
        }
      }
      // Anything in ring r is nearer than the nearest possible point of ring r + 1.
      if (best >= 0 && Math.sqrt(bd) <= r * cs) break;
    }
    return best;
  }

  /** A* from node to node: node indices from `from` to `to` inclusive, or null. */
  route(from: number, to: number, maxExpand = 60000): number[] | null {
    if (from < 0 || to < 0 || from >= this.n || to >= this.n) return null;
    if (from === to) return [from];
    if (this.comp[from] !== this.comp[to]) return null;
    const gen = ++this.gen;
    const { g, came, seen, done, x, z } = this;
    const gx = x[to];
    const gz = z[to];
    this.heapN = 0;
    g[from] = 0;
    came[from] = -1;
    seen[from] = gen;
    this.push(from, Math.hypot(x[from] - gx, z[from] - gz));
    let expanded = 0;
    let found = false;
    while (this.heapN) {
      const cur = this.pop();
      if (done[cur] === gen) continue;
      if (cur === to) {
        found = true;
        break;
      }
      done[cur] = gen;
      if (++expanded > maxExpand) break;
      const gc = g[cur];
      for (let k = this.off[cur]; k < this.off[cur + 1]; k++) {
        const u = this.to[k];
        if (done[u] === gen) continue;
        const c = gc + this.w[k];
        if (seen[u] === gen && c >= g[u]) continue;
        seen[u] = gen;
        g[u] = c;
        came[u] = cur;
        this.push(u, c + Math.hypot(x[u] - gx, z[u] - gz));
      }
    }
    this.lastExpanded = expanded;
    if (!found) return null;
    const out: number[] = [];
    for (let k = to; k >= 0; k = came[k]) {
      out.push(k);
      if (k === from) break;
    }
    return out.reverse();
  }

  /** Nodes within `r` m of a point (into `out`, cleared first). */
  within(x: number, z: number, r: number, out: number[]): number[] {
    out.length = 0;
    const cs = this.cell;
    const r2 = r * r;
    for (let iz = Math.floor((z - r) / cs); iz <= Math.floor((z + r) / cs); iz++) {
      for (let ix = Math.floor((x - r) / cs); ix <= Math.floor((x + r) / cs); ix++) {
        const l = this.buckets.get(this.key(ix, iz));
        if (!l) continue;
        for (const i of l) if ((this.x[i] - x) ** 2 + (this.z[i] - z) ** 2 <= r2) out.push(i);
      }
    }
    return out;
  }

  /**
   * The best way between two free points: A* that may start at any node within `reach` m of a and
   * finish at any node within `reach` of b, the walk off the graph at each end costing `off` times
   * its straight length. So the route doesn't run back to the node nearest the player when a node
   * a little farther is on the way. Ends with no node within reach use the nearest one (within
   * `far` m). Returns the node indices from the entry node to the exit node, or null.
   */
  routeBetween(ax: number, az: number, bx: number, bz: number, reach = 40, off = 1.35, far = 220, maxExpand = 60000): number[] | null {
    if (this.n === 0) return null;
    const gen = ++this.gen;
    const { g, came, seen, done, x, z, goalStamp, goalCost } = this;
    const V = this.n;
    // Exits.
    let exits = this.within(bx, bz, reach, this.near);
    if (!exits.length) {
      const k = this.nearest(bx, bz, far);
      if (k < 0) return null;
      exits = [k];
    }
    for (const k of exits) {
      goalStamp[k] = gen;
      goalCost[k] = Math.hypot(x[k] - bx, z[k] - bz) * off;
    }
    // Entries.
    this.heapN = 0;
    let entries = this.within(ax, az, reach, this.near);
    if (!entries.length) {
      const k = this.nearest(ax, az, far);
      if (k < 0) return null;
      entries = [k];
    }
    for (const k of entries) {
      g[k] = Math.hypot(x[k] - ax, z[k] - az) * off;
      came[k] = -1;
      seen[k] = gen;
      this.push(k, g[k] + Math.hypot(x[k] - bx, z[k] - bz));
    }
    let expanded = 0;
    let found = false;
    while (this.heapN) {
      const cur = this.pop();
      if (cur === V) {
        found = true;
        break;
      }
      if (done[cur] === gen) continue;
      done[cur] = gen;
      if (++expanded > maxExpand) break;
      const gc = g[cur];
      if (goalStamp[cur] === gen) {
        const c = gc + goalCost[cur];
        if (seen[V] !== gen || c < g[V]) {
          seen[V] = gen;
          g[V] = c;
          came[V] = cur;
          this.push(V, c);
        }
      }
      for (let k = this.off[cur]; k < this.off[cur + 1]; k++) {
        const u = this.to[k];
        if (done[u] === gen) continue;
        const c = gc + this.w[k];
        if (seen[u] === gen && c >= g[u]) continue;
        seen[u] = gen;
        g[u] = c;
        came[u] = cur;
        this.push(u, c + Math.hypot(x[u] - bx, z[u] - bz));
      }
    }
    this.lastExpanded = expanded;
    if (!found) return null;
    const out: number[] = [];
    for (let k = came[V]; k >= 0; k = came[k]) out.push(k);
    return out.reverse();
  }

  // ---------------------------------------------------------------- binary heap (lazy deletion)

  private push(node: number, key: number) {
    if (this.heapN >= this.heapNode.length) {
      const n2 = new Int32Array(this.heapNode.length * 2);
      n2.set(this.heapNode);
      const k2 = new Float32Array(n2.length);
      k2.set(this.heapKey);
      this.heapNode = n2;
      this.heapKey = k2;
    }
    const hn = this.heapNode;
    const hk = this.heapKey;
    let i = this.heapN++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] <= key) break;
      hn[i] = hn[p];
      hk[i] = hk[p];
      i = p;
    }
    hn[i] = node;
    hk[i] = key;
  }

  private pop(): number {
    const hn = this.heapNode;
    const hk = this.heapKey;
    const top = hn[0];
    const n = --this.heapN;
    if (n > 0) {
      const node = hn[n];
      const key = hk[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && hk[c + 1] < hk[c]) c++;
        if (hk[c] >= key) break;
        hn[i] = hn[c];
        hk[i] = hk[c];
        i = c;
      }
      hn[i] = node;
      hk[i] = key;
    }
    return top;
  }
}
