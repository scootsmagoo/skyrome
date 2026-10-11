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
  /** Connected component of each node (0 = the largest, the city's network). */
  readonly comp: Int32Array;
  /** Links of each node (0: a node nothing reaches, never an entry or an exit while a linked one is in reach). */
  readonly deg: Int32Array;
  /** Links cut while the game runs (`cut`: a wall the walk ran into), by adjacency slot. */
  private readonly cutSlot: Uint8Array;
  /** How many links are cut (`cut`). */
  cuts = 0;
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
    this.cutSlot = new Uint8Array(m);
    this.deg = new Int32Array(n);
    for (let i = 0; i < n; i++) this.deg[i] = this.off[i + 1] - this.off[i];
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

  /**
   * Cut the link a–b (both ways) for the rest of the session: the route found it walled (QuestRoute: the
   * player pushed into it). Returns false when there is no such link or it is cut already.
   */
  cut(a: number, b: number): boolean {
    let did = false;
    for (const [p, q] of [[a, b], [b, a]]) {
      for (let k = this.off[p]; k < this.off[p + 1]; k++) {
        if (this.to[k] !== q || this.cutSlot[k]) continue;
        this.cutSlot[k] = 1;
        did = true;
      }
    }
    if (did) this.cuts++;
    return did;
  }

  /** Is the link a–b there and not cut? */
  linked(a: number, b: number): boolean {
    for (let k = this.off[a]; k < this.off[a + 1]; k++) if (this.to[k] === b && !this.cutSlot[k]) return true;
    return false;
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
        if (done[u] === gen || this.cutSlot[k]) continue;
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
   * The nodes a route may start or end on near (x, z): those within `reach` m with a link, of the city's network
   * (component 0) whenever one of its nodes is within `far` m (a node nothing reaches, or a stray island of streets
   * behind a wall, is never an end while the network is in reach); else the nearest such node. Empty when none.
   */
  ends(x: number, z: number, reach: number, far: number, out: number[] = []): number[] {
    out.length = 0;
    const near = this.within(x, z, reach, this.near);
    let main = false;
    for (const k of near) if (this.comp[k] === 0 && this.deg[k] > 0) (out.push(k), (main = true));
    if (main) return out;
    const k = this.nearest(x, z, far, 0);
    if (k >= 0 && this.deg[k] > 0) {
      out.push(k);
      return out;
    }
    // No network in reach (an island far out): any linked node near, else the nearest linked one.
    for (const j of near) if (this.deg[j] > 0) out.push(j);
    if (out.length) return out;
    let best = -1;
    let bd = far * far;
    for (const j of this.within(x, z, far, this.near)) {
      const d = (this.x[j] - x) ** 2 + (this.z[j] - z) ** 2;
      if (this.deg[j] > 0 && d < bd) ((bd = d), (best = j));
    }
    if (best >= 0) out.push(best);
    return out;
  }

  private readonly exitList: number[] = [];
  private readonly entryList: number[] = [];

  /**
   * The best way between two free points: A* that may start at any node within `reach` m of a and
   * finish at any node within `opts.exitReach` (default `reach`) of b, the walk off the graph at each end costing
   * `off` times its straight length (an exit's walk times `opts.exitCost(node)` too: the planner makes an exit with no
   * clear line to the goal dearer). So the route doesn't run back to the node nearest the player when a node a little
   * farther is on the way. Only linked nodes of the city's network are ends while one is within `far` m (`ends`).
   * Returns the node indices from the entry node to the exit node, or null.
   */
  routeBetween(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    reach = 40,
    off = 1.35,
    far = 220,
    maxExpand = 60000,
    opts: { exitReach?: number; exitCost?: (node: number) => number } = {},
  ): number[] | null {
    if (this.n === 0) return null;
    const gen = ++this.gen;
    const { g, came, seen, done, x, z, goalStamp, goalCost } = this;
    const V = this.n;
    // Exits.
    const exits = this.ends(bx, bz, opts.exitReach ?? reach, far, this.exitList);
    if (!exits.length) return null;
    for (const k of exits) {
      goalStamp[k] = gen;
      goalCost[k] = Math.hypot(x[k] - bx, z[k] - bz) * off * (opts.exitCost ? opts.exitCost(k) : 1);
    }
    // Entries.
    this.heapN = 0;
    const entries = this.ends(ax, az, reach, far, this.entryList);
    if (!entries.length) return null;
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
        if (done[u] === gen || this.cutSlot[k]) continue;
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
