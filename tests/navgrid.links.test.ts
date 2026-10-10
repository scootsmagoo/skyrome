/**
 * NavGrid link tests (M5a): a wall thinner than a cell stands between two cell centres that both
 * read as walkable (the Regia's marble wall: bot and crowd walked straight into it). The sampler's
 * `link` says which neighbour links are walled; paths and straight walks must respect that.
 */
import { describe, expect, it } from 'vitest';
import { NavGrid, type CellSample, type CellSampler } from '../src/ai/life/navgrid';

/** Flat floor; a thin wall along x = 5.4 from z = -40 to z = 12, with a gap (a door) at 7 <= z < 9. */
function world(withLink: boolean): CellSampler {
  const wallBetween = (x0: number, z0: number, x1: number, z1: number) => {
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    if (!(lo < 5.4 && hi > 5.4)) return false;
    const zc = (z0 + z1) / 2;
    return zc >= -40 && zc < 12 && !(zc >= 7 && zc < 9);
  };
  const s: CellSampler = {
    sample(_x: number, _z: number, out: CellSample) {
      out.h = 0;
      out.walkable = true;
    },
  };
  if (withLink) s.link = (x0, z0, _h0, x1, z1) => !wallBetween(x0, z0, x1, z1);
  return s;
}

function grid(withLink: boolean) {
  const g = new NavGrid(world(withLink), { radius: 40 });
  g.setFocus(6, 6);
  g.buildAll();
  return g;
}

describe('NavGrid link tests', () => {
  it('without a link test, the path goes straight through the thin wall (the old behaviour)', () => {
    const g = grid(false);
    expect(g.lineWalkable(2.5, 2.5, 8.5, 2.5)).toBe(true);
  });

  it('with it, a straight walk across the wall is refused and a path goes round through the door', () => {
    const g = grid(true);
    expect(g.lineWalkable(2.5, 2.5, 8.5, 2.5)).toBe(false);
    const p = g.findPath(2.5, 2.5, 8.5, 2.5);
    expect(p).not.toBeNull();
    // It crosses the wall line (x = 5.4) only inside the doorway (z 7..9).
    let prev = { x: 2.5, z: 2.5 };
    for (const q of p!) {
      if ((prev.x - 5.4) * (q.x - 5.4) < 0) {
        const t = (5.4 - prev.x) / (q.x - prev.x);
        const zc = prev.z + (q.z - prev.z) * t;
        expect(zc).toBeGreaterThanOrEqual(6.5);
        expect(zc).toBeLessThan(9.5);
      }
      prev = q;
    }
    // The way through the door itself is walkable.
    expect(g.lineWalkable(2.5, 8.5, 8.5, 8.5)).toBe(true);
  });

  it('does not cut the corner of a wall on a diagonal', () => {
    const g = grid(true);
    // From the west side to the east side across the wall diagonally, away from the door.
    expect(g.lineWalkable(4.5, 2.5, 6.5, 3.5)).toBe(false);
    expect(g.lineWalkable(4.5, 2.5, 4.5, 3.5)).toBe(true);
  });

  it('is not ready where the links are not tested yet', () => {
    const g = new NavGrid(world(true), { radius: 40 });
    g.setFocus(6, 6);
    // Sample a few cells only: the nearest chunk is sampled but its links are not tested yet.
    g.build(100);
    expect(g.ready(6, 6)).toBe(false);
    g.buildAll();
    expect(g.ready(6, 6)).toBe(true);
  });

  it('keeps flood labelling (reachability) on the walled side', () => {
    const g = grid(true);
    g.flood(2.5, 2.5, 100000);
    // The far side is reachable through the door, the unwalled area beyond the wall's end too.
    expect(g.reachable(8.5, 2.5)).toBe(true);
  });
});
