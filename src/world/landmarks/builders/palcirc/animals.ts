/**
 * Cheap draft animals and strays for street scenes (palcirc crew): a few ellipsoids and cylinders
 * each, merged into the landmark's builder. All face −z in their own frame, standing on y = 0.
 */
import type { Draw } from '../../../../arch/fabric/draw';
import type { MaterialId } from '../../../../gfx/materialIds';

/** Ox (or bull), ~1.9 m long. */
export function ox(d: Draw, x: number, y: number, z: number, ry: number, mat: MaterialId = 'wood_dark') {
  const f = d.at(x, y, z, ry);
  f.ellipsoid(mat, 0, 1.0, 0.1, 0.42, 0.45, 0.95, { seg: [8, 6] });
  f.ellipsoid(mat, 0, 1.15, -0.85, 0.24, 0.27, 0.34, { seg: [7, 5] });
  for (const [sx, sz] of [[-0.24, -0.5], [0.24, -0.5], [-0.24, 0.65], [0.24, 0.65]]) f.cyl(mat, sx, 0.3, sz, 0.08, 0.62, 6, { rTop: 0.07 });
  for (const s of [-1, 1]) f.cyl('plaster_cream', s * 0.2, 1.38, -0.92, 0.04, 0.3, 4, { rTop: 0.015, rz: s * 0.9 });
}

/** Mule in harness, ~1.8 m long, with long ears; the head hangs a little (it has waited all night). */
export function mule(d: Draw, x: number, y: number, z: number, ry: number) {
  const f = d.at(x, y, z, ry);
  const m: MaterialId = 'bark';
  f.ellipsoid(m, 0, 1.05, 0.05, 0.3, 0.34, 0.78, { seg: [8, 6] });
  // Neck and head, lowered.
  f.rod(m, { x: 0, y: 1.18, z: -0.6 }, { x: 0, y: 1.05, z: -1.0 }, 0.13, 6);
  f.ellipsoid(m, 0, 0.98, -1.12, 0.12, 0.13, 0.28, { seg: [7, 5], rx: 0.5 });
  for (const s of [-1, 1]) f.cyl(m, s * 0.07, 1.25, -0.98, 0.035, 0.32, 4, { rTop: 0.012, rz: s * 0.35, rx: 0.3 });
  for (const [sx, sz] of [[-0.17, -0.45], [0.17, -0.45], [-0.17, 0.55], [0.17, 0.55]]) f.cyl(m, sx, 0.36, sz, 0.055, 0.74, 6, { rTop: 0.045 });
  f.rod(m, { x: 0, y: 1.1, z: 0.8 }, { x: 0, y: 0.6, z: 0.95 }, 0.03, 4);
  // Collar and pack saddle cloth.
  f.cyl('wood_dark', 0, 1.2, -0.55, 0.2, 0.12, 8, { rx: 1.1 });
  f.span('fabric_red', -0.32, 1.25, -0.25, 0.32, 1.33, 0.35);
}

/** A sleeping dog curled up, ~0.7 m across. */
export function sleepingDog(d: Draw, x: number, y: number, z: number, ry: number) {
  const f = d.at(x, y, z, ry);
  f.ellipsoid('dirt', 0, 0.16, 0, 0.36, 0.16, 0.26, { seg: [8, 5] });
  f.ellipsoid('dirt', 0.24, 0.17, -0.16, 0.11, 0.1, 0.13, { seg: [6, 4] });
}
