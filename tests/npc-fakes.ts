/** Fake worlds for NPC navigation tests (no physics, no three.js). */
import type { CellSample, CellSampler } from '../src/ai/life/navgrid';

/** Flat ground with axis-aligned blocks (walls, pillars) and raised pads (podia, steps). */
export class FakeWorld implements CellSampler {
  blocks: { x0: number; z0: number; x1: number; z1: number }[] = [];
  pads: { x0: number; z0: number; x1: number; z1: number; h: number }[] = [];
  calls = 0;

  sample(x: number, z: number, out: CellSample) {
    this.calls++;
    let h = 0;
    for (const p of this.pads) if (x >= p.x0 && x < p.x1 && z >= p.z0 && z < p.z1) h = Math.max(h, p.h);
    out.h = h;
    out.walkable = !this.blocked(x, z);
  }

  blocked(x: number, z: number) {
    return this.blocks.some((b) => x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1);
  }

  /** A body of radius r at (x, z) overlaps a block. */
  hits(x: number, z: number, r: number) {
    return this.blocks.some((b) => x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1);
  }

  wall(x0: number, z0: number, x1: number, z1: number) {
    this.blocks.push({ x0, z0, x1, z1 });
    return this;
  }
}
