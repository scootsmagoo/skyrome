/**
 * Spiral (helical) stairs around a newel: the stair of the Column of Trajan and the other
 * tight stairs inside drums. Local frame: the newel's axis is the y axis through the origin, the
 * flight rises from y = 0, and a point at angle a sits at (sin a, y, cos a) (see spec §3.6 of
 * docs/design/mq-04-columna.md). Build with `at` to place it.
 *
 * Each tread is a wedge built from three radial bands of box plates (visual and collider), each band
 * as long tangentially as the tread's arc at the band's outer edge: one box per tread would be
 * sized for the wall and overlap its neighbour along the walking line, leaving a tread only a
 * hand's width deep there. A landing is a flat sector of the same bands at the height of the tread
 * it follows, so landings add no rise: the total rise is `count * rise`.
 *
 * Walkability: the same limits as stairs.ts apply (risers ≤ 0.25 m, the KCC autostep). Without
 * landings the plates above a walking point are one turn (`stepsPerTurn * rise`) away, so the
 * headroom is (stepsPerTurn − 1) * rise. A landing of `turns` adds no rise over its angle, so the
 * flight above a landing is only (1 − turns) * stepsPerTurn risers up: keep
 * ((1 − turns) * stepsPerTurn − 1) * rise ≥ 2.3 m: a capsule spans about two treads, so its real
 * clearance is about one rise less than on the walking line, and the step-up needs room for the
 * whole body over the next tread. The Column uses 18 steps a turn with quarter-turn landings: 2.38 m
 * under a landing, 3.23 m elsewhere (tests/arch.spiral.test.ts walks both).
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';

export interface SpiralSpec {
  count: number;
  rise: number;
  stepsPerTurn: number;
  /** Newel radius. */
  innerR: number;
  /** Inner face of the well wall. */
  outerR: number;
  /** Angle of step 0's centre; angle a ↦ local direction (sin a, 0, cos a). */
  startAngle?: number;
  /** false (default): the angle increases as you climb. */
  clockwise?: boolean;
  /** A flat landing after step `after` (0-based), `turns` of a turn long. */
  landings?: { after: number; turns: number }[];
  material?: MaterialId;
  newelMaterial?: MaterialId;
  /** Default true. */
  collide?: boolean;
  /** Default true: a newel cylinder from 0 to the top + 2.4 m (visual and collider). */
  newel?: boolean;
}

export interface SpiralResult {
  height: number;
  /** Centre angle and tread top of each step. */
  steps: { angle: number; y: number }[];
  landings: { angle0: number; angle1: number; y: number }[];
  /** (innerR + outerR) / 2. */
  walkR: number;
  /** Local point on tread `t` (fractional step index ok) at radius `r` (default walkR), y = tread top. */
  pointAt(t: number, r?: number): THREE.Vector3;
  /** Centre angle of the last step. */
  endAngle: number;
  /**
   * The walking line as waypoints (local): every `every`-th tread centre, and points along each
   * landing's arc, so a walker never cuts across the newel. Ends on the last tread.
   */
  route(every?: number, r?: number): THREE.Vector3[];
}

export function spiralStairs(b: MeshBuilder, spec: SpiralSpec, at?: THREE.Matrix4): SpiralResult {
  const { count, rise, stepsPerTurn, innerR, outerR } = spec;
  const mat = spec.material ?? 'travertine';
  const collide = spec.collide ?? true;
  const m = at ?? new THREE.Matrix4();
  const dAng = (2 * Math.PI) / stepsPerTurn;
  const s = spec.clockwise ? -1 : 1;
  const walkR = (innerR + outerR) / 2;
  const height = count * rise;
  // Radial bands: the newel side, the walking line, the wall side (the outermost reaches 2 cm into
  // the wall and the innermost into the newel, so no gap shows).
  const edges = [innerR - 0.02, innerR + (outerR - innerR) * 0.33, innerR + (outerR - innerR) * 0.67, outerR + 0.02];

  /**
   * A flat wedge from `y - rise` to `y` centred on angle `a` and spanning `span` radians: one box per
   * band, each as long as the arc at the band's outer edge (+2%), so the bands tile the sector.
   */
  const plate = (a: number, y: number, span: number, id: MaterialId) => {
    for (let k = 0; k < 3; k++) {
      const r0 = edges[k];
      const r1 = edges[k + 1];
      const rc = (r0 + r1) / 2;
      const local = new THREE.Matrix4()
        .makeTranslation(rc * Math.sin(a), y - rise / 2, rc * Math.cos(a))
        .multiply(new THREE.Matrix4().makeRotationY(a - Math.PI / 2));
      b.box(id, r1 - r0, rise, r1 * span * 1.02, m.clone().multiply(local), { collide });
    }
  };

  const landingAfter = new Map<number, number>();
  for (const l of spec.landings ?? []) landingAfter.set(l.after, (landingAfter.get(l.after) ?? 0) + l.turns);

  const steps: { angle: number; y: number }[] = [];
  const landings: { angle0: number; angle1: number; y: number }[] = [];
  let a = spec.startAngle ?? 0;
  for (let i = 0; i < count; i++) {
    const y = (i + 1) * rise;
    steps.push({ angle: a, y });
    plate(a, y, dAng, mat);
    const turns = landingAfter.get(i);
    if (turns) {
      // The landing starts half a tread past this step's centre and runs `turns` of a turn; the
      // next step's plate starts where the landing ends (its centre half a tread on).
      const span = turns * 2 * Math.PI;
      const angle0 = a + (s * dAng) / 2;
      const angle1 = angle0 + s * span;
      landings.push({ angle0, angle1, y });
      // One wedge per tread-sized sector, so the plates follow the arc.
      const n = Math.max(1, Math.ceil(span / dAng));
      for (let j = 0; j < n; j++) plate(angle0 + ((j + 0.5) / n) * (s * span), y, span / n, mat);
      a = angle1 + (s * dAng) / 2;
    } else a += s * dAng;
  }

  if (spec.newel ?? true) {
    const H = height + 2.4;
    const newelMat = spec.newelMaterial ?? mat;
    const local = new THREE.Matrix4().makeTranslation(0, H / 2, 0);
    b.add(new THREE.CylinderGeometry(innerR, innerR, H, 16), newelMat, m.clone().multiply(local));
    if (collide) {
      // The collider is an upright cylinder at the transformed centre, so `at` must be yaw-only.
      b.collider({ kind: 'cylinder', center: new THREE.Vector3(0, H / 2, 0).applyMatrix4(m), halfHeight: H / 2, radius: innerR });
    }
  }

  const endAngle = steps[count - 1].angle;
  return {
    height,
    steps,
    landings,
    walkR,
    endAngle,
    pointAt(t: number, r = walkR) {
      const tc = Math.min(Math.max(t, 0), count - 1);
      if (count < 2) return new THREE.Vector3(r * Math.sin(steps[0].angle), steps[0].y, r * Math.cos(steps[0].angle));
      const i0 = Math.min(Math.floor(tc), count - 2);
      const f = tc - i0;
      const p = steps[i0];
      const q = steps[i0 + 1];
      const ang = p.angle + (q.angle - p.angle) * f;
      const y = p.y + (q.y - p.y) * f;
      return new THREE.Vector3(r * Math.sin(ang), y, r * Math.cos(ang));
    },
    route(every = 1, r = walkR) {
      const at = (ang: number, y: number) => new THREE.Vector3(r * Math.sin(ang), y, r * Math.cos(ang));
      const out: THREE.Vector3[] = [];
      for (let i = 0; i < count; i++) {
        const L = landings.find((l) => Math.abs(l.angle0 - (steps[i].angle + (s * dAng) / 2)) < 1e-9 && l.y === steps[i].y);
        if (i % every === 0 || i === count - 1 || L) out.push(at(steps[i].angle, steps[i].y));
        if (L) {
          // Along the arc, a point every ~half tread (stopping short of the next riser), so no leg
          // chords across the newel.
          const n = Math.max(2, Math.ceil(Math.abs(L.angle1 - L.angle0) / (dAng / 2)));
          for (let j = 1; j < n; j++) out.push(at(L.angle0 + ((L.angle1 - L.angle0) * j) / n, L.y));
        }
      }
      return out;
    },
  };
}
