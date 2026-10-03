/**
 * Shade: striped linen awnings (vela) on poles, and timber pergolas for vines (the vine canopy
 * itself comes from `vegetation/decor.ts`).
 */
import type { MaterialId } from '../../gfx/materialIds';
import { stripedAwning } from '../props';
import type { Draw } from './draw';

/**
 * Awning projecting from a wall (face at z = 0) over the street (−z): `width` along x, `depth`
 * out, high edge `y` at the wall. Two poles carry the outer edge.
 */
export function velum(d: Draw, width: number, depth: number, y: number, mats: [MaterialId, MaterialId] = ['fabric_white', 'fabric_red']) {
  stripedAwning(d, -width / 2, width / 2, -depth, -0.02, y - 0.5, y, mats);
  for (const s of [-1, 1]) d.cyl('wood', s * (width / 2 - 0.05), (y - 0.55) / 2, -depth, 0.035, y - 0.55, 5, { collide: true });
}

/** Free-standing pergola: brick or timber posts, beams and rafters. Returns the canopy rectangle. */
export function pergola(d: Draw, w: number, l: number, h: number, posts: 'wood' | 'brick' = 'wood') {
  const nx = Math.max(1, Math.round(w / 2.6)), nz = Math.max(1, Math.round(l / 2.6));
  for (let i = 0; i <= nx; i++)
    for (let k = 0; k <= nz; k++) {
      const x = -w / 2 + (w * i) / nx, z = -l / 2 + (l * k) / nz;
      if (posts === 'brick') d.span('brick', x - 0.2, 0, z - 0.2, x + 0.2, h, z + 0.2, { collide: true });
      else d.cyl('wood', x, h / 2, z, 0.08, h, 6, { collide: true });
    }
  for (let i = 0; i <= nx; i++) d.span('wood_dark', -w / 2 + (w * i) / nx - 0.08, h, -l / 2 - 0.3, -w / 2 + (w * i) / nx + 0.08, h + 0.18, l / 2 + 0.3);
  for (let z = -l / 2; z <= l / 2 + 0.01; z += 0.6) d.span('wood', -w / 2 - 0.3, h + 0.18, z - 0.04, w / 2 + 0.3, h + 0.26, z + 0.04, { shadow: false });
  return { w: w + 0.6, l: l + 0.6, y: h + 0.26 };
}
