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

/** One flat quad shared by every wear strip (add() clones it). */
const STRIP = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const STRIP_LIFT = 0.004;

/**
 * Wear on a tread: a pale polished lip along the nosing (where feet and sandals scuff it) and a dark
 * line of dirt where the tread meets the next riser. Two quads per tread, no collider; `xa..xb` and
 * `za..zb` are the tread's local extent, `nose` the side the nosing is on (-1 = low z, +1 high z, 0 = none).
 */
export function treadWear(b: MeshBuilder, mat: MaterialId, m: THREE.Matrix4, xa: number, xb: number, za: number, zb: number, top: number, nose: -1 | 1, alongX = false): void {
  const w = alongX ? zb - za : xb - xa;
  const d = alongX ? xb - xa : zb - za;
  if (w < 0.3 || d < 0.2) return;
  const lip = Math.min(0.07, d * 0.25);
  const joint = Math.min(0.05, d * 0.18);
  const strip = (off: number, width: number, material: MaterialId) => {
    // off = distance from the nosing edge into the tread; width of the strip across the run.
    const c = alongX ? (nose < 0 ? xa + off : xb - off) : nose < 0 ? za + off : zb - off;
    const t = new THREE.Matrix4().makeTranslation(alongX ? c : (xa + xb) / 2, top + STRIP_LIFT, alongX ? (za + zb) / 2 : c);
    const sc = new THREE.Matrix4().makeScale(alongX ? width : w, 1, alongX ? w : width);
    b.add(STRIP, material, m.clone().multiply(t).multiply(sc));
  };
  if (mat !== 'marble') strip(lip / 2, lip, 'marble');
  strip(d - joint / 2, joint, 'dirt');
}

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

/** A built flight as the stair audit sees it: plan corners (bottom front L/R, back R/L) and heights. */
export interface FlightRecord {
  builder: MeshBuilder;
  corners: [number, number][];
  y0: number;
  y1: number;
}
let recorder: ((f: FlightRecord) => void) | null = null;
/** Tests: be told about every flight `stairs()` builds (null to stop). */
export function recordFlights(fn: ((f: FlightRecord) => void) | null): void {
  recorder = fn;
}

export function stairs(b: MeshBuilder, spec: StairsSpec, at?: THREE.Matrix4): StairsResult {
  const { width, rise, run, count } = spec;
  const mat = spec.material ?? 'travertine';
  const depth = run * count;
  const m = at ?? new THREE.Matrix4();
  if (recorder) {
    const p = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(m);
    const c = [p(-width / 2, 0, 0), p(width / 2, 0, 0), p(width / 2, 0, depth), p(-width / 2, 0, depth)];
    recorder({ builder: b, corners: c.map((v) => [v.x, v.z]), y0: c[0].y, y1: p(0, rise * count, 0).y });
  }
  const solid = spec.solid ?? true;
  const mode = spec.collider ?? 'steps';
  for (let i = 0; i < count; i++) {
    const z0 = i * run;
    const z1 = solid ? depth : z0 + run;
    const y0 = i * rise;
    const h = rise;
    const local = new THREE.Matrix4().makeTranslation(0, y0 + h / 2, (z0 + z1) / 2);
    b.box(mat, width, h, z1 - z0, m.clone().multiply(local), { collide: mode === 'steps' });
    treadWear(b, mat, m, -width / 2, width / 2, z0, z0 + run, y0 + h, -1);
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

export interface WrappedStepsSpec {
  /** The platform the steps climb to (local x/z), its top at `rise * count`. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  rise: number;
  run: number;
  count: number;
  /** Which sides have steps: front (−z), back (+z), left (−x), right (+x). */
  sides: { front?: boolean; back?: boolean; left?: boolean; right?: boolean };
  material?: MaterialId;
  collide?: boolean;
}

/**
 * Steps on several sides of a platform, wrapped round the corners as on a Roman podium: each step
 * is one ring (or L, or U) at one height, so where the front flight meets an end flight the
 * corner steps turn instead of two flights running into each other. Step i (0 = lowest) is a band
 * `(count − i) · run` out from the platform, solid down to the ground.
 */
export function wrappedSteps(b: MeshBuilder, spec: WrappedStepsSpec, at?: THREE.Matrix4) {
  const { rise, run, count, sides } = spec;
  const mat = spec.material ?? 'travertine';
  const m = at ?? new THREE.Matrix4();
  const collide = spec.collide ?? true;
  const box = (xa: number, xb: number, za: number, zb: number, top: number) => {
    if (xb - xa < 1e-3 || zb - za < 1e-3) return;
    b.box(mat, xb - xa, top, zb - za, m.clone().multiply(new THREE.Matrix4().makeTranslation((xa + xb) / 2, top / 2, (za + zb) / 2)), { collide });
  };
  for (let i = 0; i < count; i++) {
    const out = (count - i) * run;
    const inn = (count - i - 1) * run;
    const top = (i + 1) * rise;
    // This step's outline, and the next step's (the one it runs under).
    const X0 = spec.x0 - (sides.left ? out : 0);
    const X1 = spec.x1 + (sides.right ? out : 0);
    const Z0 = spec.z0 - (sides.front ? out : 0);
    const Z1 = spec.z1 + (sides.back ? out : 0);
    const x0n = spec.x0 - (sides.left ? inn : 0);
    const x1n = spec.x1 + (sides.right ? inn : 0);
    const z0n = spec.z0 - (sides.front ? inn : 0);
    const z1n = spec.z1 + (sides.back ? inn : 0);
    // Front and back bands run the full width (corners included); the side bands fill between.
    if (sides.front) { box(X0, X1, Z0, z0n, top); treadWear(b, mat, m, X0, X1, Z0, z0n, top, -1); }
    if (sides.back) { box(X0, X1, z1n, Z1, top); treadWear(b, mat, m, X0, X1, z1n, Z1, top, 1); }
    if (sides.left) { box(X0, x0n, z0n, z1n, top); treadWear(b, mat, m, X0, x0n, z0n, z1n, top, -1, true); }
    if (sides.right) { box(x1n, X1, z0n, z1n, top); treadWear(b, mat, m, x1n, X1, z0n, z1n, top, 1, true); }
  }
}
