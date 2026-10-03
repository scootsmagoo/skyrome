/**
 * Local navigation grid around the player (GDD §14.7b, tech.md §6): a walkability height-field
 * sampled from the physics world in 1 m cells, built lazily in 16 × 16 chunks nearest-first under
 * a per-frame budget, evicted when the player moves on. A* over it (8-connected, steps up to
 * `maxStep`) plus line-of-sight smoothing gives crowd paths around columns, podia and walls.
 *
 * It plays the role of the navmesh tiles of tech.md §6.2 without a dependency: it reads the same
 * colliders the characters collide with, so whatever the city and landmark crews build (boxes,
 * trimeshes, heightfields) is navigable the moment it has colliders. The sampler is an interface,
 * so tests run on a fake world.
 */

export interface CellSample {
  /** Floor height (NaN when there is no floor). */
  h: number;
  /** A standing person fits (no wall/column between knee and head height). */
  walkable: boolean;
}

export interface CellSampler {
  /** Sample the cell centred on (x, z). Write into `out`. */
  sample(x: number, z: number, out: CellSample): void;
}

export interface NavGridOptions {
  /** Cell size in metres (default 1). */
  cell?: number;
  /** Cells per chunk side (default 16). */
  chunkCells?: number;
  /** Chunks whose centre is within this radius of the focus are built (default 80 m). */
  radius?: number;
  /** Highest step between neighbouring cells (default 0.55 m). */
  maxStep?: number;
}

const WALK = 1;
const KNOWN = 2;
const BLOCKED_DYN = 4; // marked by agents that got stuck there

interface Chunk {
  cx: number;
  cz: number;
  h: Float32Array;
  flags: Uint8Array;
  /** Next cell to sample while building (cells² = done). */
  next: number;
  /** Distance² to focus when queued. */
  d2: number;
  /** `builds` counter when it was (last) finished. */
  builtAt: number;
}

const OFF = 32768;
const key = (cx: number, cz: number) => (cx + OFF) * 65536 + (cz + OFF);

export class NavGrid {
  readonly cell: number;
  readonly chunkCells: number;
  readonly chunkSize: number;
  radius: number;
  maxStep: number;
  private chunks = new Map<number, Chunk>();
  private queue: Chunk[] = [];
  private focusX = 0;
  private focusZ = 0;
  private hasFocus = false;
  private readonly sample: CellSample = { h: NaN, walkable: false };
  /** Total cells sampled (stats). */
  sampled = 0;
  /** Bumped whenever cells change (paths cached against an older version may be stale). */
  version = 0;

  constructor(
    private readonly sampler: CellSampler,
    opts: NavGridOptions = {},
  ) {
    this.cell = opts.cell ?? 1;
    this.chunkCells = opts.chunkCells ?? 16;
    this.chunkSize = this.cell * this.chunkCells;
    this.radius = opts.radius ?? 80;
    this.maxStep = opts.maxStep ?? 0.55;
  }

  // ---------------------------------------------------------------- building

  /** Re-centre the grid: queue missing chunks nearest-first, drop far ones. */
  setFocus(x: number, z: number) {
    const moved = !this.hasFocus || Math.hypot(x - this.focusX, z - this.focusZ) > this.chunkSize * 0.5;
    if (!moved) return;
    this.hasFocus = true;
    this.focusX = x;
    this.focusZ = z;
    const cs = this.chunkSize;
    const r = this.radius;
    const evict = r + cs * 2;
    for (const [k, c] of this.chunks) {
      const mx = (c.cx + 0.5) * cs;
      const mz = (c.cz + 0.5) * cs;
      if (Math.hypot(mx - x, mz - z) > evict) {
        this.chunks.delete(k);
        this.version++;
      }
    }
    const c0x = Math.floor((x - r) / cs);
    const c1x = Math.floor((x + r) / cs);
    const c0z = Math.floor((z - r) / cs);
    const c1z = Math.floor((z + r) / cs);
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const mx = (cx + 0.5) * cs;
        const mz = (cz + 0.5) * cs;
        const d2 = (mx - x) ** 2 + (mz - z) ** 2;
        if (d2 > (r + cs * 0.7) ** 2) continue;
        const k = key(cx, cz);
        if (this.chunks.has(k)) continue;
        const n = this.chunkCells * this.chunkCells;
        const c: Chunk = { cx, cz, h: new Float32Array(n).fill(NaN), flags: new Uint8Array(n), next: 0, d2, builtAt: 0 };
        this.chunks.set(k, c);
        this.queue.push(c);
      }
    }
    for (const c of this.queue) c.d2 = ((c.cx + 0.5) * cs - x) ** 2 + ((c.cz + 0.5) * cs - z) ** 2;
    this.queue = this.queue.filter((c) => this.chunks.get(key(c.cx, c.cz)) === c);
    this.queue.sort((a, b) => a.d2 - b.d2);
  }

  /**
   * Re-sample finished chunks older than this many `build()` calls (≈ frames) in the background,
   * so geometry that streams in later (city blocks, props) is picked up. 0 = never.
   */
  refreshAfter = 1800;
  private builds = 0;

  /** Sample up to `maxCells` cells (nearest unfinished chunks first). Returns cells sampled. */
  build(maxCells: number): number {
    let done = 0;
    const n = this.chunkCells * this.chunkCells;
    this.builds++;
    if (!this.queue.length && this.refreshAfter > 0 && this.builds % 30 === 0) {
      // Idle: refresh the stalest chunk near the focus.
      let stale: Chunk | null = null;
      for (const c of this.chunks.values()) {
        if (this.builds - c.builtAt < this.refreshAfter) continue;
        const d2 = ((c.cx + 0.5) * this.chunkSize - this.focusX) ** 2 + ((c.cz + 0.5) * this.chunkSize - this.focusZ) ** 2;
        if (!stale || d2 < stale.d2) {
          c.d2 = d2;
          stale = c;
        }
      }
      if (stale) {
        // Keep the old cells readable while re-sampling in place (flags stay KNOWN).
        stale.next = 0;
        this.queue.push(stale);
      }
    }
    while (done < maxCells && this.queue.length) {
      const c = this.queue[0];
      while (c.next < n && done < maxCells) {
        const i = c.next++;
        const ix = c.cx * this.chunkCells + (i % this.chunkCells);
        const iz = c.cz * this.chunkCells + Math.floor(i / this.chunkCells);
        this.sampler.sample((ix + 0.5) * this.cell, (iz + 0.5) * this.cell, this.sample);
        c.h[i] = this.sample.h;
        c.flags[i] = KNOWN | (this.sample.walkable && Number.isFinite(this.sample.h) ? WALK : 0);
        done++;
      }
      if (c.next >= n) {
        this.queue.shift();
        c.builtAt = this.builds;
        this.version++;
      }
    }
    this.sampled += done;
    return done;
  }

  /** Build everything queued now (tests, loading screens). */
  buildAll(limit = 1e7) {
    let total = 0;
    while (this.queue.length && total < limit) total += this.build(4096);
    return total;
  }

  /** Forget every chunk (the world geometry changed). They are rebuilt around the focus. */
  invalidate() {
    this.chunks.clear();
    this.queue = [];
    this.hasFocus = false;
    this.version++;
  }

  get pending() {
    return this.queue.length;
  }

  get chunkCount() {
    return this.chunks.size;
  }

  // ---------------------------------------------------------------- cell queries

  cellOf(v: number) {
    return Math.floor(v / this.cell);
  }

  private chunkAt(ix: number, iz: number): Chunk | undefined {
    return this.chunks.get(key(Math.floor(ix / this.chunkCells), Math.floor(iz / this.chunkCells)));
  }

  private idx(ix: number, iz: number) {
    const cc = this.chunkCells;
    return (((iz % cc) + cc) % cc) * cc + (((ix % cc) + cc) % cc);
  }

  /** 1 walkable · 0 blocked · -1 unknown (not built yet / outside the grid). */
  cellState(ix: number, iz: number): -1 | 0 | 1 {
    const c = this.chunkAt(ix, iz);
    if (!c) return -1;
    const f = c.flags[this.idx(ix, iz)];
    if (!(f & KNOWN)) return -1;
    return f & WALK && !(f & BLOCKED_DYN) ? 1 : 0;
  }

  cellHeight(ix: number, iz: number): number {
    const c = this.chunkAt(ix, iz);
    if (!c) return NaN;
    return c.h[this.idx(ix, iz)];
  }

  /** Walkable at a world point (unknown → `unknownAs`). */
  walkable(x: number, z: number, unknownAs = false): boolean {
    const s = this.cellState(this.cellOf(x), this.cellOf(z));
    return s === -1 ? unknownAs : s === 1;
  }

  /** Floor height at a world point, or null if unknown / no floor. */
  heightAt(x: number, z: number): number | null {
    const h = this.cellHeight(this.cellOf(x), this.cellOf(z));
    return Number.isFinite(h) ? h : null;
  }

  /** Is the area around a point built (so paths there are meaningful)? */
  ready(x: number, z: number): boolean {
    return this.cellState(this.cellOf(x), this.cellOf(z)) !== -1;
  }

  /** Mark a cell as blocked (an agent got stuck there; a cart parked). Cleared on rebuild. */
  block(x: number, z: number) {
    const ix = this.cellOf(x);
    const iz = this.cellOf(z);
    const c = this.chunkAt(ix, iz);
    if (!c) return;
    c.flags[this.idx(ix, iz)] |= BLOCKED_DYN;
    this.version++;
  }

  /** Can you step from cell a to its neighbour b (both walkable, step small enough)? */
  canStep(ax: number, az: number, bx: number, bz: number): boolean {
    if (this.cellState(bx, bz) !== 1) return false;
    const ha = this.cellHeight(ax, az);
    const hb = this.cellHeight(bx, bz);
    if (Math.abs(ha - hb) > this.maxStep) return false;
    if (ax !== bx && az !== bz) {
      // Diagonal: don't cut corners of walls.
      if (this.cellState(bx, az) !== 1 || this.cellState(ax, bz) !== 1) return false;
      const h1 = this.cellHeight(bx, az);
      const h2 = this.cellHeight(ax, bz);
      if (Math.abs(ha - h1) > this.maxStep || Math.abs(ha - h2) > this.maxStep) return false;
    }
    return true;
  }

  /**
   * Nearest walkable cell centre within `maxR` metres (spiral search), or null. With
   * `reachableOnly`, only cells the last flood labelled as reachable from the player count.
   */
  nearestWalkable(x: number, z: number, maxR = 6, out = { x: 0, z: 0 }, reachableOnly = false): { x: number; z: number } | null {
    const cx = this.cellOf(x);
    const cz = this.cellOf(z);
    const maxC = Math.ceil(maxR / this.cell);
    for (let r = 0; r <= maxC; r++) {
      let best = Infinity;
      let bx = 0;
      let bz = 0;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (this.cellState(cx + dx, cz + dz) !== 1) continue;
          if (reachableOnly && this.doneGen && this.stampOf(cx + dx, cz + dz) < this.doneGen) continue;
          const px = (cx + dx + 0.5) * this.cell;
          const pz = (cz + dz + 0.5) * this.cell;
          const d = (px - x) ** 2 + (pz - z) ** 2;
          if (d < best) {
            best = d;
            bx = px;
            bz = pz;
          }
        }
      }
      if (best < Infinity) {
        out.x = bx;
        out.z = bz;
        return out;
      }
    }
    return null;
  }

  /**
   * Straight walk from a to b stays on walkable cells with small steps (supercover DDA).
   * Used to smooth paths and to test short direct moves.
   */
  lineWalkable(ax: number, az: number, bx: number, bz: number): boolean {
    const c = this.cell;
    let ix = Math.floor(ax / c);
    let iz = Math.floor(az / c);
    const ex = Math.floor(bx / c);
    const ez = Math.floor(bz / c);
    if (this.cellState(ix, iz) !== 1) return false;
    const dx = bx - ax;
    const dz = bz - az;
    const sx = dx > 0 ? 1 : -1;
    const sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(c / dx) : Infinity;
    const tdz = dz !== 0 ? Math.abs(c / dz) : Infinity;
    let tmx = dx !== 0 ? (sx > 0 ? (ix + 1) * c - ax : ax - ix * c) / Math.abs(dx) : Infinity;
    let tmz = dz !== 0 ? (sz > 0 ? (iz + 1) * c - az : az - iz * c) / Math.abs(dz) : Infinity;
    let guard = 0;
    while ((ix !== ex || iz !== ez) && guard++ < 4096) {
      const px = ix;
      const pz = iz;
      if (Math.abs(tmx - tmz) < 1e-9) {
        // Passing exactly through a corner: both side cells must be free.
        if (!this.canStep(px, pz, px + sx, pz) || !this.canStep(px, pz, px, pz + sz)) return false;
        ix += sx;
        iz += sz;
        tmx += tdx;
        tmz += tdz;
      } else if (tmx < tmz) {
        ix += sx;
        tmx += tdx;
      } else {
        iz += sz;
        tmz += tdz;
      }
      if (!this.canStep(px, pz, ix, iz)) return false;
    }
    return true;
  }

  /** Is a disc of `r` metres around a point walkable (for carts, groups)? */
  areaWalkable(x: number, z: number, r: number): boolean {
    const n = Math.ceil(r / this.cell);
    const cx = this.cellOf(x);
    const cz = this.cellOf(z);
    for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) if (this.cellState(cx + dx, cz + dz) !== 1) return false;
    return true;
  }

  // ---------------------------------------------------------------- reachability

  private stamps = new Map<number, Uint32Array>();
  private floodGen = 0;
  private doneGen = 0;
  private fq: number[] = [];
  private fqHead = 0;
  private floodOn = false;

  /**
   * Label the cells reachable on foot from (x, z) (incremental BFS, `maxCells` per call).
   * Starts a new labelling when none is running. Returns true when a labelling finished.
   */
  flood(x: number, z: number, maxCells: number): boolean {
    if (!this.floodOn) {
      const sx = this.cellOf(x);
      const sz = this.cellOf(z);
      if (this.cellState(sx, sz) !== 1) {
        const n = this.nearestWalkable(x, z, 3);
        if (!n) return false;
        return this.startFlood(this.cellOf(n.x), this.cellOf(n.z), maxCells);
      }
      return this.startFlood(sx, sz, maxCells);
    }
    return this.stepFlood(maxCells);
  }

  private startFlood(sx: number, sz: number, maxCells: number) {
    this.floodGen++;
    this.floodOn = true;
    this.fq.length = 0;
    this.fqHead = 0;
    this.stamp(sx, sz);
    this.fq.push(sx, sz);
    return this.stepFlood(maxCells);
  }

  private stamp(ix: number, iz: number) {
    const k = key(Math.floor(ix / this.chunkCells), Math.floor(iz / this.chunkCells));
    let s = this.stamps.get(k);
    if (!s) this.stamps.set(k, (s = new Uint32Array(this.chunkCells * this.chunkCells)));
    s[this.idx(ix, iz)] = this.floodGen;
  }

  private stampOf(ix: number, iz: number) {
    const s = this.stamps.get(key(Math.floor(ix / this.chunkCells), Math.floor(iz / this.chunkCells)));
    return s ? s[this.idx(ix, iz)] : 0;
  }

  private stepFlood(maxCells: number): boolean {
    let n = 0;
    const q = this.fq;
    while (this.fqHead < q.length && n < maxCells) {
      const cx = q[this.fqHead++];
      const cz = q[this.fqHead++];
      n++;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dz) || (dx && dz)) continue; // 4-connected is enough for labelling
          const nx = cx + dx;
          const nz = cz + dz;
          if (this.stampOf(nx, nz) === this.floodGen) continue;
          if (!this.canStep(cx, cz, nx, nz)) continue;
          this.stamp(nx, nz);
          q.push(nx, nz);
        }
      }
    }
    if (this.fqHead >= q.length) {
      this.floodOn = false;
      this.doneGen = this.floodGen;
      q.length = 0;
      this.fqHead = 0;
      // Drop stamp arrays of evicted chunks.
      for (const k of this.stamps.keys()) if (!this.chunks.has(k)) this.stamps.delete(k);
      return true;
    }
    return false;
  }

  /** A labelling is in progress. */
  get flooding() {
    return this.floodOn;
  }

  /** Reachable on foot from the last flood origin (true when nothing has been labelled yet). */
  reachable(x: number, z: number): boolean {
    if (!this.doneGen) return true;
    return this.stampOf(this.cellOf(x), this.cellOf(z)) >= this.doneGen;
  }

  // ---------------------------------------------------------------- A*

  /**
   * A* from a to b over walkable cells; returns smoothed corner points (excluding the start,
   * ending at b's cell centre or b itself when it is walkable), or null when unreachable within
   * `maxExpand` expansions or outside the built grid.
   */
  findPath(ax: number, az: number, bx: number, bz: number, maxExpand = 6000): { x: number; z: number }[] | null {
    const c = this.cell;
    let sx = this.cellOf(ax);
    let sz = this.cellOf(az);
    let gx = this.cellOf(bx);
    let gz = this.cellOf(bz);
    if (this.cellState(sx, sz) !== 1) {
      const n = this.nearestWalkable(ax, az, 2.5);
      if (!n) return null;
      sx = this.cellOf(n.x);
      sz = this.cellOf(n.z);
    }
    let exactEnd = true;
    if (this.cellState(gx, gz) !== 1) {
      const n = this.nearestWalkable(bx, bz, 3);
      if (!n) return null;
      gx = this.cellOf(n.x);
      gz = this.cellOf(n.z);
      exactEnd = false;
    }
    if (sx === gx && sz === gz) return [{ x: exactEnd ? bx : (gx + 0.5) * c, z: exactEnd ? bz : (gz + 0.5) * c }];

    const pk = (x: number, z: number) => (x + OFF) * 65536 + (z + OFF);
    const g = new Map<number, number>();
    const came = new Map<number, number>();
    const heap = new MinHeap();
    const h = (x: number, z: number) => {
      const dx = Math.abs(x - gx);
      const dz = Math.abs(z - gz);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    const start = pk(sx, sz);
    const goal = pk(gx, gz);
    g.set(start, 0);
    heap.push(start, h(sx, sz));
    let expanded = 0;
    let found = false;
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) {
        found = true;
        break;
      }
      if (++expanded > maxExpand) break;
      const cx = Math.floor(cur / 65536) - OFF;
      const cz = (cur % 65536) - OFF;
      const gc = g.get(cur)!;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!this.canStep(cx, cz, nx, nz)) continue;
          const nk = pk(nx, nz);
          const cost = gc + (dx && dz ? Math.SQRT2 : 1);
          const old = g.get(nk);
          if (old !== undefined && old <= cost) continue;
          g.set(nk, cost);
          came.set(nk, cur);
          heap.push(nk, cost + h(nx, nz));
        }
      }
    }
    if (!found) return null;
    // Rebuild cell list.
    const cells: { x: number; z: number }[] = [];
    let k = goal;
    while (k !== start) {
      cells.push({ x: (Math.floor(k / 65536) - OFF + 0.5) * c, z: ((k % 65536) - OFF + 0.5) * c });
      k = came.get(k)!;
    }
    cells.reverse();
    if (exactEnd) cells[cells.length - 1] = { x: bx, z: bz };
    return this.smooth(ax, az, cells);
  }

  /** String-pull: drop corners that can be skipped with a straight walkable line. */
  smooth(ax: number, az: number, pts: { x: number; z: number }[]): { x: number; z: number }[] {
    if (pts.length <= 1) return pts;
    const out: { x: number; z: number }[] = [];
    let fromX = ax;
    let fromZ = az;
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      // Farthest visible point (check a handful from the end for speed, then step back).
      while (j > i && !this.lineWalkable(fromX, fromZ, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]);
      fromX = pts[j].x;
      fromZ = pts[j].z;
      i = j + 1;
    }
    return out;
  }

  /** A random walkable cell centre within `r` of a point (tries `tries` times), or null. */
  randomWalkable(rand: () => number, x: number, z: number, r: number, tries = 12, minR = 0): { x: number; z: number } | null {
    for (let i = 0; i < tries; i++) {
      const a = rand() * Math.PI * 2;
      const d = minR + Math.sqrt(rand()) * (r - minR);
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      if (this.walkable(px, pz)) return { x: (this.cellOf(px) + 0.5) * this.cell, z: (this.cellOf(pz) + 0.5) * this.cell };
    }
    return null;
  }
}

/** Binary min-heap of numeric keys by priority. */
class MinHeap {
  private k: number[] = [];
  private p: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, pri: number) {
    const k = this.k;
    const p = this.p;
    let i = k.length;
    k.push(key);
    p.push(pri);
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (p[par] <= pri) break;
      k[i] = k[par];
      p[i] = p[par];
      i = par;
    }
    k[i] = key;
    p[i] = pri;
  }
  pop(): number {
    const k = this.k;
    const p = this.p;
    const top = k[0];
    const lk = k.pop()!;
    const lp = p.pop()!;
    const n = k.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && p[r] < p[l] ? r : l;
        if (p[c] >= lp) break;
        k[i] = k[c];
        p[i] = p[c];
        i = c;
      }
      k[i] = lk;
      p[i] = lp;
    }
    return top;
  }
}
