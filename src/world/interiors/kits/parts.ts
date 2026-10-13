/** Building parts the interior kits share: rooms (floor, solid floor, ceiling and beams) and wall runs with doorway gaps. */
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

