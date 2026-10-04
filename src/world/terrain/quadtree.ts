/**
 * CDLOD quadtree (Strugar 2010, "Continuous Distance-Dependent Level of Detail") over the
 * heightmap grid. Pure: no Three.js scene objects, so the selection is unit-tested.
 *
 * Every drawn piece is a PATCH of `patchQuads` × `patchQuads` cells. A node at level L covers
 * 2 × patchQuads cells of 2^L samples each and is drawn as its four quadrant patches; a node that
 * is only partly inside the finer range draws the quadrants its children don't take, at its own
 * level. The vertex shader morphs every odd vertex of a level-L patch onto its even neighbour as
 * the distance approaches range[L], so each level fades into the next without popping or cracks
 * (skirts hide what is left). `select` writes one instance per patch: [x0, z0, cell size, level].
 */

export interface QuadtreeGrid {
  minX: number;
  minZ: number;
  spacing: number;
  nx: number;
  nz: number;
  heights: Float32Array;
}

export interface QuadtreeOptions {
  /** Cells per patch side (power of two). Default 16. */
  patchQuads?: number;
  /** Distance (game m) to which full resolution is used. Default: `leafFactor` leaf-node sizes. */
  leafRange?: number;
  /** Leaf range in leaf-node sizes when `leafRange` is not given. Default 3.2. */
  leafFactor?: number;
  /** Range ratio between successive levels (≥ 2). Default 3. */
  lodRatio?: number;
  /** Fraction of a level's range where morphing toward the next level starts. Default 0.62. */
  morphStart?: number;
  /** Extra vertical extent added below the node boxes (skirts, distance bias). */
  boxPadding?: number;
}

/** Minimal frustum interface (THREE.Frustum fits). */
export interface BoxCuller {
  intersectsBox(box: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }): boolean;
}

export const PATCH_STRIDE = 4;

export class TerrainQuadtree {
  readonly patchQuads: number;
  /** Number of levels (0 = finest). */
  readonly levels: number;
  /** Selection range per level (game m); the last is infinite. */
  readonly ranges: number[];
  /** Morph start / end distance per level. */
  readonly morph: [number, number][];
  /** Nodes per axis per level. */
  private readonly nodesX: number[] = [];
  private readonly nodesZ: number[] = [];
  /** min / max height per node per level. */
  private readonly minY: Float32Array[] = [];
  private readonly maxY: Float32Array[] = [];
  private readonly pad: number;
  private readonly box = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  private out: Float32Array = new Float32Array(0);
  private count = 0;
  private cam = { x: 0, y: 0, z: 0 };
  private culler: BoxCuller | null = null;
  /** Statistics from the last selection. */
  readonly stats = { patches: 0, perLevel: [] as number[] };

  constructor(
    readonly grid: QuadtreeGrid,
    opts: QuadtreeOptions = {},
  ) {
    const P = (this.patchQuads = opts.patchQuads ?? 16);
    const cells = Math.max(grid.nx - 1, grid.nz - 1);
    let levels = 1;
    while (2 * P * 2 ** (levels - 1) < cells) levels++;
    this.levels = levels;
    const leaf = opts.leafRange ?? 2 * P * grid.spacing * (opts.leafFactor ?? 3.2);
    const ratio = Math.max(2, opts.lodRatio ?? 3);
    const ms = opts.morphStart ?? 0.62;
    this.ranges = [];
    this.morph = [];
    for (let L = 0; L < levels; L++) {
      const r = L === levels - 1 ? Infinity : leaf * ratio ** L;
      this.ranges.push(r);
      const prev = L === 0 ? 0 : leaf * ratio ** (L - 1);
      const end = L === levels - 1 ? 1e9 : r;
      this.morph.push([L === levels - 1 ? 1e9 - 1 : prev + (r - prev) * ms, end]);
    }
    this.pad = opts.boxPadding ?? 4;
    this.buildBounds();
  }

  /** Cells per node side at level L. */
  nodeCells(L: number): number {
    return 2 * this.patchQuads * 2 ** L;
  }

  private buildBounds() {
    const { nx, nz, heights } = this.grid;
    for (let L = 0; L < this.levels; L++) {
      const n = this.nodeCells(L);
      const cx = Math.ceil((nx - 1) / n);
      const cz = Math.ceil((nz - 1) / n);
      this.nodesX.push(cx);
      this.nodesZ.push(cz);
      const mn = new Float32Array(cx * cz).fill(Infinity);
      const mx = new Float32Array(cx * cz).fill(-Infinity);
      if (L === 0) {
        for (let j = 0; j < cz; j++) {
          for (let i = 0; i < cx; i++) {
            let a = Infinity, b = -Infinity;
            const i1 = Math.min(nx - 1, (i + 1) * n), j1 = Math.min(nz - 1, (j + 1) * n);
            for (let z = j * n; z <= j1; z++) {
              for (let x = i * n; x <= i1; x++) {
                const h = heights[z * nx + x];
                if (h < a) a = h;
                if (h > b) b = h;
              }
            }
            mn[j * cx + i] = a;
            mx[j * cx + i] = b;
          }
        }
      } else {
        const pcx = this.nodesX[L - 1], pcz = this.nodesZ[L - 1];
        const pmn = this.minY[L - 1], pmx = this.maxY[L - 1];
        for (let j = 0; j < pcz; j++) {
          for (let i = 0; i < pcx; i++) {
            const k = (j >> 1) * cx + (i >> 1);
            mn[k] = Math.min(mn[k], pmn[j * pcx + i]);
            mx[k] = Math.max(mx[k], pmx[j * pcx + i]);
          }
        }
      }
      this.minY.push(mn);
      this.maxY.push(mx);
    }
  }

  private setBox(L: number, x0: number, z0: number, cells: number, node: number) {
    const g = this.grid;
    const sp = g.spacing;
    const b = this.box;
    b.min.x = g.minX + x0 * sp;
    b.min.z = g.minZ + z0 * sp;
    b.max.x = g.minX + Math.min(g.nx - 1, x0 + cells) * sp;
    b.max.z = g.minZ + Math.min(g.nz - 1, z0 + cells) * sp;
    b.min.y = this.minY[L][node] - this.pad;
    b.max.y = this.maxY[L][node] + 1;
  }

  private boxInSphere(r: number): boolean {
    if (r === Infinity) return true;
    const b = this.box, c = this.cam;
    const dx = c.x < b.min.x ? b.min.x - c.x : c.x > b.max.x ? c.x - b.max.x : 0;
    const dy = c.y < b.min.y ? b.min.y - c.y : c.y > b.max.y ? c.y - b.max.y : 0;
    const dz = c.z < b.min.z ? b.min.z - c.z : c.z > b.max.z ? c.z - b.max.z : 0;
    return dx * dx + dy * dy + dz * dz <= r * r;
  }

  private emit(L: number, x0: number, z0: number) {
    const g = this.grid;
    if (x0 >= g.nx - 1 || z0 >= g.nz - 1) return;
    if (this.count * PATCH_STRIDE >= this.out.length) {
      const n = new Float32Array(Math.max(256, this.out.length * 2));
      n.set(this.out);
      this.out = n;
    }
    const o = this.count * PATCH_STRIDE;
    const cell = 2 ** L;
    this.out[o] = g.minX + x0 * g.spacing;
    this.out[o + 1] = g.minZ + z0 * g.spacing;
    this.out[o + 2] = cell * g.spacing;
    this.out[o + 3] = L;
    this.count++;
    this.stats.perLevel[L] = (this.stats.perLevel[L] ?? 0) + 1;
  }

  /** Draw a whole node as its four quadrant patches. */
  private emitNode(L: number, x0: number, z0: number) {
    const h = this.patchQuads * 2 ** L;
    this.emit(L, x0, z0);
    this.emit(L, x0 + h, z0);
    this.emit(L, x0, z0 + h);
    this.emit(L, x0 + h, z0 + h);
  }

  private selectNode(L: number, i: number, j: number): boolean {
    const n = this.nodeCells(L);
    const x0 = i * n, z0 = j * n;
    const node = j * this.nodesX[L] + i;
    this.setBox(L, x0, z0, n, node);
    if (!this.boxInSphere(this.ranges[L])) return false;
    if (this.culler && !this.culler.intersectsBox(this.box)) return true;
    if (L === 0 || !this.boxInSphere(this.ranges[L - 1])) {
      this.emitNode(L, x0, z0);
      return true;
    }
    const h = n / 2;
    for (let q = 0; q < 4; q++) {
      const ci = i * 2 + (q & 1), cj = j * 2 + (q >> 1);
      if (ci >= this.nodesX[L - 1] || cj >= this.nodesZ[L - 1]) continue;
      if (!this.selectNode(L - 1, ci, cj)) {
        // The child is beyond the finer range: draw its quarter at this level.
        if (this.culler) {
          this.setBox(L - 1, ci * h, cj * h, h, cj * this.nodesX[L - 1] + ci);
          if (!this.culler.intersectsBox(this.box)) continue;
        }
        this.emit(L, x0 + (q & 1) * h, z0 + (q >> 1) * h);
      }
    }
    return true;
  }

  /**
   * Select the patches to draw for a camera position. Returns the instance data (PATCH_STRIDE
   * floats per patch; valid until the next call) and the patch count.
   */
  select(cam: { x: number; y: number; z: number }, culler: BoxCuller | null = null): { data: Float32Array; count: number } {
    this.cam.x = cam.x;
    this.cam.y = cam.y;
    this.cam.z = cam.z;
    this.culler = culler;
    this.count = 0;
    this.stats.perLevel = [];
    const L = this.levels - 1;
    for (let j = 0; j < this.nodesZ[L]; j++) for (let i = 0; i < this.nodesX[L]; i++) this.selectNode(L, i, j);
    this.stats.patches = this.count;
    return { data: this.out, count: this.count };
  }
}

/** CPU twin of the vertex-shader morph (for tests): the morphed grid offset of vertex g. */
export function morphOffset(g: number, morphK: number): number {
  const odd = g - 2 * Math.floor(g / 2);
  return g - odd * morphK;
}
