/**
 * Pure collider probes for walkability tests: the boxes and cylinders a builder hands to physics,
 * indexed on an xz grid, queried as vertical columns ("what solid spans [bottom, top] over this
 * point?"). Lets a test find floors, pits, drops and blocked headroom without Rapier or a GPU.
 */
import * as THREE from 'three';
import type { ColliderSpec } from '../../src/gfx/MeshBuilder';

interface Solid {
  /** 'box': centre, half extents and the inverse of its rotation (xz test in box space). */
  kind: 'box' | 'cylinder';
  cx: number;
  cz: number;
  bottom: number;
  top: number;
  hx: number;
  hz: number;
  r: number;
  inv: THREE.Quaternion | null;
  /** The box's rotation tilts its top (not a flat floor): skip it for floor queries. */
  tilted: boolean;
}

const CELL = 4;
const _v = new THREE.Vector3();

export class ColliderProbe {
  private readonly grid = new Map<string, Solid[]>();
  readonly solids: Solid[] = [];

  constructor(cols: readonly ColliderSpec[]) {
    for (const c of cols) {
      let s: Solid;
      if (c.kind === 'box') {
        const q = c.rotation ?? new THREE.Quaternion();
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
        const tilted = Math.abs(up.y) < 0.999;
        // Footprint radius in xz (conservative, for the grid buckets).
        s = { kind: 'box', cx: c.center.x, cz: c.center.z, bottom: c.center.y - c.half.y, top: c.center.y + c.half.y, hx: c.half.x, hz: c.half.z, r: Math.hypot(c.half.x, c.half.z, tilted ? c.half.y : 0), inv: q.clone().invert(), tilted };
      } else if (c.kind === 'cylinder') {
        s = { kind: 'cylinder', cx: c.center.x, cz: c.center.z, bottom: c.center.y - c.halfHeight, top: c.center.y + c.halfHeight, hx: 0, hz: 0, r: c.radius, inv: null, tilted: false };
      } else continue;
      this.solids.push(s);
      const i0 = Math.floor((s.cx - s.r - 1) / CELL);
      const i1 = Math.floor((s.cx + s.r + 1) / CELL);
      const j0 = Math.floor((s.cz - s.r - 1) / CELL);
      const j1 = Math.floor((s.cz + s.r + 1) / CELL);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const k = `${i},${j}`;
          let l = this.grid.get(k);
          if (!l) this.grid.set(k, (l = []));
          l.push(s);
        }
      }
    }
  }

  /** Solids whose footprint (grown by `pad`) contains (x, z). */
  at(x: number, z: number, pad = 0): Solid[] {
    const l = this.grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
    if (!l) return [];
    const out: Solid[] = [];
    for (const s of l) {
      if (s.kind === 'cylinder') {
        if (Math.hypot(x - s.cx, z - s.cz) <= s.r + pad) out.push(s);
        continue;
      }
      _v.set(x - s.cx, 0, z - s.cz).applyQuaternion(s.inv!);
      if (Math.abs(_v.x) <= s.hx + pad && Math.abs(_v.z) <= s.hz + pad) out.push(s);
    }
    return out;
  }

  /** Flat collider tops over (x, z). */
  tops(x: number, z: number, pad = 0): number[] {
    return this.at(x, z, pad)
      .filter((s) => !s.tilted)
      .map((s) => s.top);
  }

  /** Is there a flat collider top within `tol` of height y over (x, z)? */
  floorNear(x: number, z: number, y: number, tol: number, pad = 0): boolean {
    return this.tops(x, z, pad).some((t) => Math.abs(t - y) <= tol);
  }

  /** The highest flat top at or below `y + step` over (x, z) (the floor a walker at y stands on), or −Infinity. */
  floorBelow(x: number, z: number, y: number, step: number, pad = 0): number {
    let best = -Infinity;
    for (const t of this.tops(x, z, pad)) if (t <= y + step && t > best) best = t;
    return best;
  }

  /** Does any solid within `radius` of (x, z) overlap the height band (y0, y1)? */
  blocked(x: number, z: number, y0: number, y1: number, radius: number): boolean {
    return this.at(x, z, radius).some((s) => s.top > y0 && s.bottom < y1);
  }
}

export interface FloodResult {
  /** Cells reached (key → floor height). */
  reached: Map<string, number>;
  /** Steps off an edge onto nothing or onto a floor more than `maxDrop` lower. */
  drops: { x: number; z: number; from: number; to: number }[];
}

/**
 * Flood-fill walkable cells from `start` on a square grid of `h` metres, the way a capsule of
 * radius ~0.35 m walks: it climbs at most `step` per cell, needs 1.8 m of headroom, and stops (as
 * a "drop") wherever the next cell's floor lies more than `maxDrop` below. `keep(x, z, y)` bounds
 * the region (return false to stop there without counting a drop).
 */
export function flood(p: ColliderProbe, start: THREE.Vector3, h: number, keep: (x: number, z: number, y: number) => boolean, opts: { step?: number; maxDrop?: number; pad?: number; radius?: number; maxCells?: number } = {}): FloodResult {
  const step = opts.step ?? 0.45;
  const maxDrop = opts.maxDrop ?? 0.6;
  const pad = opts.pad ?? 0.1;
  const radius = opts.radius ?? 0.3;
  const maxCells = opts.maxCells ?? 200_000;
  const reached = new Map<string, number>();
  const drops: FloodResult['drops'] = [];
  const key = (i: number, j: number) => `${i},${j}`;
  const i0 = Math.round(start.x / h);
  const j0 = Math.round(start.z / h);
  reached.set(key(i0, j0), start.y);
  const queue: [number, number, number][] = [[i0, j0, start.y]];
  while (queue.length && reached.size < maxCells) {
    const [i, j, y] = queue.shift()!;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = i + di;
      const nj = j + dj;
      const x = ni * h;
      const z = nj * h;
      const ny = p.floorBelow(x, z, y, step, pad);
      if (!keep(x, z, Number.isFinite(ny) ? ny : y)) continue;
      const base = Number.isFinite(ny) ? ny : y;
      if (p.blocked(x, z, base + step, base + 1.8, radius)) continue;
      if (!(ny >= y - maxDrop)) {
        drops.push({ x, z, from: y, to: ny });
        continue;
      }
      const k = key(ni, nj);
      const old = reached.get(k);
      if (old !== undefined && Math.abs(old - ny) < 0.5) continue;
      reached.set(k, ny);
      queue.push([ni, nj, ny]);
    }
  }
  return { reached, drops };
}
