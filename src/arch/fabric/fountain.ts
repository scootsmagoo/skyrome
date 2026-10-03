/**
 * Lacus: the public street fountain fed by the aqueducts — a rectangular basin of four big stone
 * slabs clamped with iron, a spout pillar carved with a head, a constant jet of water, and a worn
 * stepping stone. Frame: centred on the basin, the spout pillar at the +z end, users at −z.
 */
import type { Rng } from '../../core/Rng';
import type { MaterialId } from '../../gfx/materialIds';
import type { Draw } from './draw';

export interface LacusOpts {
  stone?: MaterialId;
  length?: number;
  width?: number;
}

/** Returns the two standing spots (local) where people fill their jars. */
export function lacus(d: Draw, rng: Rng, o: LacusOpts = {}): { x: number; z: number; facing: number }[] {
  const stone = o.stone ?? (rng.chance(0.6) ? 'basalt' : 'travertine');
  const L = o.length ?? 2.3, W = o.width ?? 1.45, H = 0.85, t = 0.2;
  // Four slabs (long sides overlap the short ends), floor slab, clamps.
  d.span(stone, -W / 2, 0, -L / 2, W / 2, 0.15, L / 2);
  d.span(stone, -W / 2, 0, -L / 2, -W / 2 + t, H, L / 2);
  d.span(stone, W / 2 - t, 0, -L / 2, W / 2, H, L / 2);
  d.span(stone, -W / 2 + t, 0, -L / 2, W / 2 - t, H - 0.02, -L / 2 + t);
  d.span(stone, -W / 2 + t, 0, L / 2 - t, W / 2 - t, H - 0.02, L / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) d.span('iron', sx * (W / 2 - 0.1) - 0.04, H - 0.005, sz * (L / 2 - 0.1) - 0.08, sx * (W / 2 - 0.1) + 0.04, H + 0.01, sz * (L / 2 - 0.1) + 0.08, { shadow: false });
  d.span('water', -W / 2 + t, H - 0.12, -L / 2 + t, W / 2 - t, H - 0.11, L / 2 - t, { shadow: false });
  // Overflow notch on the front slab.
  d.span('black', -0.08, H - 0.1, -L / 2 - 0.005, 0.08, H - 0.02, -L / 2 + 0.01, { shadow: false });
  // Spout pillar with a relief head and bronze pipe.
  const pz = L / 2 + 0.22;
  d.span('travertine', -0.32, 0, pz - 0.22, 0.32, 1.3, pz + 0.22);
  d.span('travertine', -0.36, 1.3, pz - 0.26, 0.36, 1.4, pz + 0.26);
  d.ellipsoid('travertine', 0, 1.0, pz - 0.24, 0.15, 0.18, 0.07, { seg: [10, 8] });
  d.cyl('bronze', 0, 0.95, pz - 0.36, 0.022, 0.2, 6, { rx: Math.PI / 2 });
  d.rod('water', { x: 0, y: 0.95, z: pz - 0.46 }, { x: 0, y: 0.88, z: pz - 0.62 }, 0.02, 5, { shadow: false });
  d.rod('water', { x: 0, y: 0.88, z: pz - 0.62 }, { x: 0, y: H - 0.11, z: pz - 0.72 }, 0.018, 5, { shadow: false });
  d.cyl('fabric_white', 0, H - 0.1, pz - 0.72, 0.09, 0.01, 8, { shadow: false }); // splash foam
  // Worn stepping stone in front.
  d.cyl(stone, 0, 0.08, -L / 2 - 0.45, 0.4, 0.16, 10);
  d.solid(-W / 2, 0, -L / 2, W / 2, H, L / 2);
  d.solid(-0.36, 0, pz - 0.26, 0.36, 1.4, pz + 0.26);
  return [
    { x: 0, z: -L / 2 - 0.65, facing: Math.PI },
    { x: -W / 2 - 0.5, z: 0, facing: -Math.PI / 2 },
  ];
}
