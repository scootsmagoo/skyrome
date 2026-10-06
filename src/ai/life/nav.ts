/**
 * NavService: one entry point for "how do I walk from A to B" (tech.md §6.2's interface, minus
 * the navmesh library). Near the player it answers from the NavGrid (A* + smoothing); for long
 * routes it strings street-graph nodes together; with neither, it returns the straight line and
 * lets steering and the stuck ladder cope (open plazas, test beds).
 *
 * Searches are rationed per fixed step so a crowd re-planning at once can't spike a frame:
 * a caller that gets 'busy' simply asks again next step.
 */
import type { NavGrid } from './navgrid';
import type { StreetNav } from './streets';
import type { Vec2 } from './steering';

export type PathResult = Vec2[] | null | 'busy';

export class NavService {
  /** A* searches allowed per fixed step. */
  budget = 6;
  private used = 0;
  /** Searches run (stats). */
  searches = 0;
  failures = 0;

  constructor(
    public grid: NavGrid | null,
    public streets: () => StreetNav | null = () => null,
  ) {}

  /** Call once per fixed step. */
  beginStep() {
    this.used = 0;
  }

  /** Is the local grid built at this point? */
  gridReady(x: number, z: number) {
    return !!this.grid && this.grid.ready(x, z);
  }

  findPath(ax: number, az: number, bx: number, bz: number): PathResult {
    const grid = this.grid;
    const d = Math.hypot(bx - ax, bz - az);
    if (d < 0.3) return [{ x: bx, z: bz }];
    if (grid && grid.ready(ax, az) && grid.ready(bx, bz)) {
      // Cheap first: a clear straight line needs no search.
      if (grid.lineWalkable(ax, az, bx, bz)) return [{ x: bx, z: bz }];
      // Walled off from where we stand (the reachability labels): no search can succeed, and a
      // failing search is the most expensive kind.
      if (grid.reachable(ax, az) && !grid.reachable(bx, bz)) {
        this.failures++;
        return null;
      }
      if (this.used >= this.budget) return 'busy';
      this.used++;
      this.searches++;
      const p = grid.findPath(ax, az, bx, bz, Math.min(8000, 600 + d * d * 3));
      if (!p) this.failures++;
      return p;
    }
    const streets = this.streets();
    if (streets && !streets.empty && d > 25) {
      if (this.used >= this.budget) return 'busy';
      this.used++;
      this.searches++;
      const p = streets.path(ax, az, bx, bz);
      if (p) {
        // The street graph's straight lines can cut through a portico or a corner: lead through
        // the grid to the farthest node it covers (it walks round what's in between), then on.
        if (grid && grid.ready(ax, az)) {
          let tries = 0;
          for (let i = p.length - 1; i >= 0 && tries < 3; i--) {
            if (!grid.ready(p[i].x, p[i].z)) continue;
            const node = grid.nearestWalkable(p[i].x, p[i].z, 3);
            if (!node) continue;
            tries++;
            if (grid.lineWalkable(ax, az, node.x, node.z)) return [{ x: node.x, z: node.z }, ...p.slice(i + 1)];
            const lead = grid.findPath(ax, az, node.x, node.z, 6000);
            if (lead) return [...lead, ...p.slice(i + 1)];
          }
        }
        return p;
      }
    }
    // Unknown ground: head straight there; steering and the stuck ladder deal with surprises.
    return [{ x: bx, z: bz }];
  }

  /** Nearest walkable point the player can also reach (grid), or the point itself when the grid doesn't know. */
  snap(x: number, z: number, r = 4): Vec2 {
    const g = this.grid;
    if (g && g.ready(x, z)) {
      const n = g.nearestWalkable(x, z, r, { x: 0, z: 0 }, true) ?? g.nearestWalkable(x, z, r);
      if (n) return { x: n.x, z: n.z };
    }
    return { x, z };
  }

  /** Floor height from the grid (null when unknown). */
  heightAt(x: number, z: number): number | null {
    return this.grid ? this.grid.heightAt(x, z) : null;
  }
}
