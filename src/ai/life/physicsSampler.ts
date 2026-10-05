/**
 * NavGrid sampler backed by the Rapier world: one downward ray finds the floor, one capsule
 * overlap test between knee and head height says whether a person fits. Only `Layer.World`
 * colliders count (characters, triggers and projectiles are ignored).
 *
 * The ray starts a few metres above the reference ground (the heightmap when there is one), so
 * podia and steps are found but roofs, upper floors and arcade vaults above are not. The crowd
 * lives at street level: a raised floor with walkable ground under it (an arena's seating over
 * its gate tunnels, a gallery over a portico) is sampled at the ground beneath.
 */
import { ALL_LAYERS, groups, Layer, RAPIER, type Physics } from '../../core/Physics';
import type { CellSample, CellSampler } from './navgrid';

export interface PhysicsSamplerOptions {
  /** Reference ground height under a point (default: `fallbackY`). */
  refHeight?: (x: number, z: number) => number | null | undefined;
  fallbackY?: number;
  /** Ray starts this far above the reference ground (default 5.5 m). */
  above?: number;
  /** And searches this far down (default 14 m). */
  depth?: number;
  /** Person radius for the clearance test (default 0.28 m). */
  radius?: number;
}

/** A floor this far above the street (m) is checked for walkable ground beneath it. */
const UPPER = 1.8;
/** Off-centre clearance probes (m) for cells a passage only partly covers. */
const SUB_OFFSET = 0.3;
/** A cast this short started inside a shape. */
const INSIDE = 1e-4;

export class PhysicsCellSampler implements CellSampler {
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  private readonly capsule: InstanceType<typeof RAPIER.Capsule>;
  private readonly rot = { x: 0, y: 0, z: 0, w: 1 };
  private readonly pos = { x: 0, y: 0, z: 0 };
  private readonly filter = groups(ALL_LAYERS, Layer.World);
  /** Overrides `fallbackY` for the reference height (e.g. the player's feet). */
  fallbackY: number;
  private readonly above: number;
  private readonly depth: number;

  constructor(
    private readonly physics: Physics,
    private readonly opts: PhysicsSamplerOptions = {},
  ) {
    const r = opts.radius ?? 0.28;
    // Spans 0.5 m (above autostep height) to 1.75 m above the floor.
    this.capsule = new RAPIER.Capsule((1.25 - 2 * r) / 2, r);
    this.fallbackY = opts.fallbackY ?? 0;
    this.above = opts.above ?? 5.5;
    this.depth = opts.depth ?? 14;
  }

  sample(x: number, z: number, out: CellSample): void {
    const ref = this.opts.refHeight?.(x, z) ?? this.fallbackY;
    const top = this.floorBelow(x, z, ref + this.above);
    if (!top) {
      out.h = NaN;
      out.walkable = false;
      return;
    }
    out.h = top.h;
    out.walkable = !top.inside && this.clear(x, top.h, z);
    // A floor well above the street (seating, a gallery, a deck): when there is open, walkable
    // street-level ground beneath it (a tunnel under the seats, a street under a gallery), the
    // crowd walks there. A solid podium or terrace fails the clearance test and keeps its top.
    if (!top.inside && top.h - ref > UPPER) {
      // Down through whatever lies between (a tunnel's vault under the seats) to street level.
      let y = top.h - 0.05;
      for (let k = 0; k < 4; k++) {
        const low = this.floorBelow(x, z, y);
        if (!low || low.inside || low.h < ref - 1) break;
        if (low.h - ref <= UPPER && top.h - low.h > 1.9 && this.clear(x, low.h, z)) {
          out.h = low.h;
          out.walkable = true;
          break;
        }
        y = low.h - 0.05;
      }
    }
  }

  /**
   * The first floor below `y` (searching `depth` down). A ray that starts inside something (an
   * overhead beam, a floor slab, a gallery, a massing box) continues from where it leaves it;
   * `inside` is set when it never got out (a wall, solid to the floor).
   */
  private floorBelow(x: number, z: number, y: number): { h: number; inside: boolean } | null {
    const world = this.physics.world;
    const o = this.ray.origin;
    o.x = x;
    o.y = y;
    o.z = z;
    // A solid ray cast reports exactly 0 when it starts inside a shape.
    let hit = world.castRay(this.ray, this.depth, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.filter);
    for (let i = 0; i < 4 && hit && hit.timeOfImpact < INSIDE; i++) {
      const exit = world.castRay(this.ray, this.depth, false, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.filter);
      // Out through the far side (or, starting on a boundary between stacked blocks, a nudge).
      o.y -= exit && exit.timeOfImpact > 1e-3 ? exit.timeOfImpact + 0.02 : 0.03;
      hit = world.castRay(this.ray, this.depth, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.filter);
    }
    if (!hit) return null;
    return { h: o.y - hit.timeOfImpact, inside: hit.timeOfImpact < INSIDE };
  }

  /**
   * Room for a person standing on a floor at `h` (knee to head height clear) at the cell centre,
   * or failing that at one of four points a little off it: a gate or doorway that doesn't line up
   * with the grid (a rotated building) must not read as a wall because its jamb grazes a centre.
   */
  private clear(x: number, h: number, z: number): boolean {
    if (this.fits(x, h, z)) return true;
    const d = SUB_OFFSET;
    return this.fits(x + d, h, z) || this.fits(x - d, h, z) || this.fits(x, h, z + d) || this.fits(x, h, z - d);
  }

  private fits(x: number, h: number, z: number): boolean {
    this.pos.x = x;
    this.pos.y = h + 0.5 + 1.25 / 2;
    this.pos.z = z;
    return !this.physics.world.intersectionWithShape(this.pos, this.rot, this.capsule, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.filter);
  }
}
