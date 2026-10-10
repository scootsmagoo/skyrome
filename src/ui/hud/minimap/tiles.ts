/**
 * The minimap's map, cut into square tiles rendered once with the big map's own static layers
 * (src/ui/map/base.ts: terrain, water, the city's streets and blocks, footprints) and kept. The
 * minimap pans and turns by drawing tiles, never by redrawing the vectors. Missing tiles render a
 * few per redraw (each is a millisecond or two), the least recently used go beyond `keep`.
 */
import { drawMapBase, type FabricStyle } from '../../map/base';
import type { MapDataSource } from '../../types';

/** The minimap's palette: darker blocks and brighter streets than the big map, for a small view. */
export const FABRIC_MINI: FabricStyle = {
  street: 'rgba(250, 242, 222, 1)',
  streetEdge: 'rgba(110, 80, 48, 0.55)',
  plaza: 'rgba(244, 234, 208, 0.95)',
  block: 'rgba(128, 92, 56, 0.62)',
  blockEdge: 'rgba(70, 48, 28, 0.7)',
  garden: 'rgba(110, 140, 72, 0.4)',
};

interface Tile {
  canvas: HTMLCanvasElement;
  used: number;
}

export class MapTiles {
  private tiles = new Map<number, Tile>();
  private queue: number[] = [];
  private queued = new Set<number>();
  private spare: HTMLCanvasElement[] = [];
  private frame = 0;
  /** Tiles rendered so far (stats). */
  rendered = 0;
  /** Milliseconds spent rendering the last tile (stats). */
  lastMs = 0;
  readonly px: number;

  constructor(
    private readonly data: MapDataSource,
    /** Tile size in game metres. */
    readonly size: number,
    /** Device pixels per game metre. */
    readonly pxPerM: number,
    /** Tiles kept (a view needs at most 9; the rest serve walking back). About 0.3 MB each at 2× pixels. */
    private readonly keep = 16,
  ) {
    this.px = Math.max(32, Math.min(512, Math.round(size * pxPerM)));
  }

  private key(ix: number, iz: number) {
    return (ix + 4096) * 8192 + (iz + 4096);
  }

  /** The tile's canvas, or null while it waits to be drawn (it is queued). */
  get(ix: number, iz: number): HTMLCanvasElement | null {
    const k = this.key(ix, iz);
    const t = this.tiles.get(k);
    if (t) {
      t.used = this.frame;
      return t.canvas;
    }
    if (!this.queued.has(k)) {
      this.queued.add(k);
      this.queue.push(k);
    }
    return null;
  }

  /** Call once per minimap redraw: renders up to `max` waiting tiles (nearest first is the caller's order). */
  pump(max = 1): number {
    this.frame++;
    let n = 0;
    while (n < max && this.queue.length) {
      const k = this.queue.shift()!;
      this.queued.delete(k);
      if (this.tiles.has(k)) continue;
      this.render(k);
      n++;
    }
    if (this.tiles.size > this.keep) this.evict();
    return n;
  }

  /** Waiting tiles. */
  get pending(): number {
    return this.queue.length;
  }

  private render(k: number) {
    const t0 = performance.now();
    const ix = Math.floor(k / 8192) - 4096;
    const iz = (k % 8192) - 4096;
    const canvas = this.spare.pop() ?? document.createElement('canvas');
    canvas.width = this.px;
    canvas.height = this.px;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const fabric = !!this.data.fabric?.();
    drawMapBase(ctx, this.data, { cx: (ix + 0.5) * this.size, cz: (iz + 0.5) * this.size, scale: this.px / this.size }, this.px, this.px, 1, {
      paper: false,
      roads: fabric ? 'none' : 'all',
      fabric: fabric ? 1 : 0,
      fabricStyle: FABRIC_MINI,
      contours: false,
    });
    this.tiles.set(k, { canvas, used: this.frame });
    this.rendered++;
    this.lastMs = performance.now() - t0;
  }

  private evict() {
    const list = [...this.tiles.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < list.length - this.keep; i++) {
      this.tiles.delete(list[i][0]);
      this.spare.push(list[i][1].canvas);
    }
    if (this.spare.length > 4) this.spare.length = 4;
  }

  dispose() {
    this.tiles.clear();
    this.queue.length = 0;
    this.queued.clear();
    this.spare.length = 0;
  }
}
