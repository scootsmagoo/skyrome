/** Uniform grid bucket for neighbour queries among walkers (rebuilt every fixed step). */
export interface Positioned {
  readonly hx: number;
  readonly hz: number;
}

export class SpatialHash<T extends Positioned> {
  private cells = new Map<number, T[]>();
  private pool: T[][] = [];

  constructor(readonly size = 4) {}

  /** A small-integer key (no heap numbers): |cell| < 8192. */
  private key(ix: number, iz: number) {
    return (ix + 8192) * 16384 + (iz + 8192);
  }

  clear() {
    for (const l of this.cells.values()) {
      l.length = 0;
      this.pool.push(l);
    }
    this.cells.clear();
  }

  insert(item: T) {
    const k = this.key(Math.floor(item.hx / this.size), Math.floor(item.hz / this.size));
    let l = this.cells.get(k);
    if (!l) {
      l = this.pool.pop() ?? [];
      this.cells.set(k, l);
    }
    l.push(item);
  }

  /** Items within `r` of (x, z), excluding `self`; appended to `out` (cleared first). */
  query(x: number, z: number, r: number, out: T[], self?: T): T[] {
    out.length = 0;
    const s = this.size;
    const x0 = Math.floor((x - r) / s);
    const x1 = Math.floor((x + r) / s);
    const z0 = Math.floor((z - r) / s);
    const z1 = Math.floor((z + r) / s);
    const r2 = r * r;
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = x0; ix <= x1; ix++) {
        const l = this.cells.get(this.key(ix, iz));
        if (!l) continue;
        for (let i = 0; i < l.length; i++) {
          const it = l[i];
          if (it === self) continue;
          const dx = it.hx - x;
          const dz = it.hz - z;
          if (dx * dx + dz * dz <= r2) out.push(it);
        }
      }
    }
    return out;
  }
}
