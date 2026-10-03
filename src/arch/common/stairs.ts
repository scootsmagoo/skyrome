/**
 * Straight flights of steps. Local frame: origin at the centre of the bottom front edge, the
 * flight climbs towards +z (rotate the matrix to face it elsewhere). Risers default to ~0.22 m.
 *
 * Walkability: the character controller is configured with a 0.42 m autostep, but with its
 * 0.35 m-radius capsule the EFFECTIVE limit is about 0.26 m, and treads need ≥ ~0.3 m. Keep
 * risers ≤ 0.25 m and runs ≥ 0.3 m for anything the player should climb (tests/arch.stairs.test.ts).
 *
 * Collider modes:
 *  - 'steps' (default): one box per step, each spanning from its tread down to the step below,
 *    so the solid stack matches the visual exactly. Verified walkable by the KCC.
 *  - 'ramp': one oriented box through the nosings (smoother for very long flights).
 *  - 'none'.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';

export interface StairsSpec {
  width: number;
  rise: number;
  run: number;
  count: number;
  material?: MaterialId;
  collider?: 'steps' | 'ramp' | 'none';
  /** Extend each step's box back to the top of the flight (solid blocks). Default true. */
  solid?: boolean;
}

export interface StairsResult {
  height: number;
  depth: number;
}

/** Number of risers and exact rise for a height, aiming at `targetRise`. */
export function stepCount(height: number, targetRise = 0.22): { count: number; rise: number } {
  const count = Math.max(1, Math.round(height / targetRise));
  return { count, rise: height / count };
}

export function stairs(b: MeshBuilder, spec: StairsSpec, at?: THREE.Matrix4): StairsResult {
  const { width, rise, run, count } = spec;
  const mat = spec.material ?? 'travertine';
  const depth = run * count;
  const m = at ?? new THREE.Matrix4();
  const solid = spec.solid ?? true;
  const mode = spec.collider ?? 'steps';
  for (let i = 0; i < count; i++) {
    const z0 = i * run;
    const z1 = solid ? depth : z0 + run;
    const y0 = i * rise;
    const h = rise;
    const local = new THREE.Matrix4().makeTranslation(0, y0 + h / 2, (z0 + z1) / 2);
    b.box(mat, width, h, z1 - z0, m.clone().multiply(local), { collide: mode === 'steps' });
  }
  if (mode === 'ramp') {
    // A slab whose top passes through the step nosings.
    const len = Math.hypot(depth, rise * count);
    const ang = Math.atan2(rise * count, depth);
    const thick = 0.5;
    const local = new THREE.Matrix4()
      .makeRotationX(-ang)
      .setPosition(0, (rise * count) / 2 + rise / 2 - (thick / 2) / Math.cos(ang), depth / 2 - run / 2);
    const w = m.clone().multiply(local);
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    w.decompose(pos, q, s);
    b.collider({ kind: 'box', center: pos, half: new THREE.Vector3(width / 2, thick / 2, len / 2), rotation: q });
  }
  return { height: rise * count, depth };
}
