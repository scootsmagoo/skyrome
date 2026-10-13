/** Building parts the interior kits share: rooms (floor, solid floor, ceiling and beams), wall runs with doorway gaps and chests. */
import type { MaterialId } from '../../../gfx/materialIds';
import type { Draw } from '../../../arch/fabric/draw';

/** A room's floor (solid underneath) and its timber ceiling with beams; the walls are wallRun's. */
export function room(d: Draw, x0: number, x1: number, z0: number, z1: number, y: number, h: number, walls: MaterialId, dado: MaterialId, floor: MaterialId) {
  const t = 0.25;
  d.span(floor, x0, y - 0.2, z0, x1, y, z1);
  d.solid(x0, y - 0.6, z0, x1, y, z1);
  d.span('wood_dark', x0, y + h, z0, x1, y + h + 0.15, z1, { shadow: false });
  // Ceiling beams.
  for (let x = x0 + 0.6; x < x1 - 0.3; x += 0.9) d.span('wood_dark', x - 0.07, y + h - 0.16, z0, x + 0.07, y + h, z1, { shadow: false });
  return { t, walls, dado };
}

/** What a chest is made of (`look`: a strongbox of dark wood and iron, a plain trunk, a gladiator's locker). */
const CHESTS = {
  strongbox: { body: 'wood_dark', trim: 'iron', size: [0.95, 0.6, 0.6] },
  trunk: { body: 'wood', trim: 'iron', size: [0.9, 0.55, 0.55] },
  locker: { body: 'wood', trim: 'iron', size: [0.85, 0.75, 0.5] },
} as const satisfies Record<string, { body: MaterialId; trim: MaterialId; size: readonly [number, number, number] }>;
export type ChestLook = keyof typeof CHESTS;

/**
 * An iron-bound chest standing at (x, y, z) of `d`, its face (the lock plate) toward −z turned by `yaw`; an
 * oblong box with a lid, two iron bands and a lock plate, colliding. The prompt of its container goes at the
 * floor point (the kind's height is added by the content module).
 */
export function chest(d: Draw, look: ChestLook, x: number, y: number, z: number, yaw = 0) {
  const c = CHESTS[look];
  const [w, h, dp] = c.size;
  const f = d.at(x, y, z, yaw);
  f.box(c.body, 0, h / 2, 0, w, h, dp, { collide: true });
  f.box(c.body, 0, h + 0.04, 0, w + 0.04, 0.08, dp + 0.04);
  for (const bx of [-w / 2 + 0.12, w / 2 - 0.12]) f.box(c.trim, bx, h / 2 + 0.02, 0, 0.06, h + 0.1, dp + 0.05);
  f.box(c.trim, 0, h - 0.1, -dp / 2 - 0.015, 0.1, 0.14, 0.03);
}

/** A wall from (x0,z0) to (x1,z1) (axis-aligned), with an optional doorway gap [g0,g1] along it. */
export function wallRun(d: Draw, x0: number, z0: number, x1: number, z1: number, y: number, h: number, mat: MaterialId, dado: MaterialId, gap?: [number, number], gapH = 2.2) {
  const t = 0.2;
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const a = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
  const b = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
  const segs: [number, number, number, number][] = gap ? [[a, gap[0], y, y + h], [gap[1], b, y, y + h], [gap[0], gap[1], y + gapH, y + h]] : [[a, b, y, y + h]];
  for (const [s0, s1, ya, yb] of segs) {
    if (s1 - s0 < 0.02) continue;
    if (alongX) {
      d.span(mat, s0, ya, z0 - t / 2, s1, yb, z0 + t / 2);
      if (ya === y) d.span(dado, s0, ya, z0 - t / 2 - 0.01, s1, ya + 1.0, z0 + t / 2 + 0.01, { shadow: false });
      d.solid(s0, ya, z0 - t / 2, s1, yb, z0 + t / 2);
    } else {
      d.span(mat, x0 - t / 2, ya, s0, x0 + t / 2, yb, s1);
      if (ya === y) d.span(dado, x0 - t / 2 - 0.01, ya, s0, x0 + t / 2 + 0.01, ya + 1.0, s1, { shadow: false });
      d.solid(x0 - t / 2, ya, s0, x0 + t / 2, yb, s1);
    }
  }
}

