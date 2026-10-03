/** Landmark footprints in LOCAL real meters (facade faces -z), from atlas data. */
import type { LandmarkData } from './types';

export type LocalFootprint =
  | { kind: 'rect'; w: number; d: number }
  | { kind: 'ellipse'; rx: number; rz: number }
  | { kind: 'circle'; r: number }
  | { kind: 'poly'; points: [number, number][] };

/** Converts a poly footprint from absolute frame coords to local (un-rotated) real meters. */
export function localFootprint(lm: LandmarkData): LocalFootprint {
  const fp = lm.footprint;
  if (fp.kind !== 'poly') return fp as LocalFootprint;
  const th = (lm.rotation * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  return {
    kind: 'poly',
    points: fp.points.map(([x, z]) => {
      const dx = x - lm.center[0];
      const dz = z - lm.center[1];
      // Inverse of the clockwise rotation used in footprintPolygon().
      return [dx * cos + dz * sin, -dx * sin + dz * cos] as [number, number];
    }),
  };
}

/** Radius (real m) of a circle that contains the footprint. */
export function footprintRadius(lm: LandmarkData): number {
  const fp = lm.footprint;
  if (fp.kind === 'rect') return Math.hypot(fp.w, fp.d) / 2;
  if (fp.kind === 'ellipse') return Math.max(fp.rx, fp.rz);
  if (fp.kind === 'circle') return fp.r;
  let r = 0;
  for (const [x, z] of fp.points) r = Math.max(r, Math.hypot(x - lm.center[0], z - lm.center[1]));
  return r;
}
