/**
 * NavGrid sampler backed by the Rapier world: one downward ray finds the floor, one capsule
 * overlap test between knee and head height says whether a person fits. Only `Layer.World`
 * colliders count (characters, triggers and projectiles are ignored).
 *
 * The ray starts a few metres above the reference ground (the heightmap when there is one), so
 * podia and steps are found but roofs, upper floors and arcade vaults above are not.
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
    const world = this.physics.world;
    const ref = this.opts.refHeight?.(x, z);
    const y0 = (ref ?? this.fallbackY) + this.above;
    const o = this.ray.origin;
    o.x = x;
    o.y = y0;
    o.z = z;
    const hit = world.castRay(this.ray, this.depth, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.filter);
    if (!hit) {
      out.h = NaN;
      out.walkable = false;
      return;
    }
    const h = y0 - hit.timeOfImpact;
    out.h = h;
    if (hit.timeOfImpact < 0.05) {
      // Started inside something solid (a wall, a massing box): not a floor.
      out.walkable = false;
      return;
    }
    this.pos.x = x;
    this.pos.y = h + 0.5 + 1.25 / 2;
    this.pos.z = z;
    const blocker = world.intersectionWithShape(this.pos, this.rot, this.capsule, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.filter);
    out.walkable = !blocker;
  }
}
