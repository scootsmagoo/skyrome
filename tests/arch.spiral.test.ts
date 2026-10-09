/**
 * Spiral stairs (src/arch/common/spiral.ts) must be walkable by the real Actor: up and down, by
 * the player capsule and by townsfolk, with at least 2.0 m of headroom above the walking line.
 * The walks follow successive points of the walking line (each tread's pointAt(t)), built at the
 * origin so the local points are the world points, as the Column's route does.
 * Landings eat headroom (the flight above a landing is only (1 − turns) of a turn up), which is why
 * the Column has 18 steps a turn: a quarter-turn landing leaves 2.38 m (a capsule spans about two
 * treads, so the effective clearance is about one rise less than on the walking line).
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { Layer, initPhysics } from '../src/core/Physics';
import { spiralStairs, type SpiralResult, type SpiralSpec } from '../src/arch/common/spiral';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { addColliders, makeWorld, walk, type TestWorld } from './arch.walker';

/** The Column's stair (spec §3.2): 185 risers, rise 0.19, 18 steps a turn, newel 0.32 m, well 1.35 m. */
const COLUMN: SpiralSpec = { count: 185, rise: 0.19, stepsPerTurn: 18, innerR: 0.32, outerR: 1.35 };
/** The same rise, radii and turns, with 60 risers (for the slower townsfolk walks). */
const SHORT: SpiralSpec = { ...COLUMN, count: 60 };
/** The Column's landings (spec §3.2: after steps 62 and 124, a quarter turn each). */
const COLUMN_LANDINGS: SpiralSpec = { ...COLUMN, landings: [{ after: 62, turns: 0.25 }, { after: 124, turns: 0.25 }] };

const PLAYER = { radius: 0.35, layer: Layer.Player };
const NPC = { radius: 0.3, layer: Layer.Npc };

function build(spec: SpiralSpec) {
  const w: TestWorld = makeWorld();
  const b = new MeshBuilder();
  const r = spiralStairs(b, spec);
  addColliders(w.physics, b);
  w.physics.step(1 / 60);
  return { w, r, b };
}

/** The ground point two treads before step 0, at the walking radius (clear of the first tread). */
function groundPoint(r: SpiralResult): [number, number] {
  const dAng = r.steps[1].angle - r.steps[0].angle;
  const a = r.steps[0].angle - 2 * dAng;
  return [r.walkR * Math.sin(a), r.walkR * Math.cos(a)];
}

/**
 * Up the walking line (every tread), then back down it, then out onto the ground. The walker's
 * feet can rest on the tread above the one it targets (its capsule reaches that tread's edge), so
 * the down check only requires the walker to be no higher than the second tread.
 */
function climbAndDescend(spec: SpiralSpec, speed: number, body: { radius: number; layer: number }) {
  const { w, r } = build(spec);
  const up: [number, number][] = r.route().map((p) => [p.x, p.z] as [number, number]);
  const ground = groundPoint(r);
  const start = { x: ground[0], y: 0.05, z: ground[1] };
  const legs = [...up, ...[...up].reverse(), ground].map((p) => ({ to: p, seconds: 4, speed, reach: 0.12 }));
  const res = walk(w, start, legs, body);
  const n = up.length;
  // Horizontal miss of the descent's end against the bottom tread's walking point: a walker that
  // stalls on the way down ends far from it, whatever its height.
  const bottom = r.pointAt(0);
  const downMiss = Math.hypot(res.ends[2 * n - 1].x - bottom.x, res.ends[2 * n - 1].z - bottom.z);
  return { r, upEnd: res.ends[n - 1], downEnd: res.ends[2 * n - 1], downMiss, groundEnd: res.ends[2 * n] };
}

/** Distance up from a point on the walking line to the first World surface (Infinity if none). */
function headroom(w: TestWorld, p: THREE.Vector3): number {
  const hit = w.physics.raycast({ x: p.x, y: p.y + 0.02, z: p.z }, { x: 0, y: 1, z: 0 }, 30, Layer.World);
  return hit ? hit.distance : Infinity;
}

describe('spiral stairs are walkable (real Actor)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('the player capsule climbs and descends the plain 185-riser Column flight at 4.4 m/s', () => {
    const { r, upEnd, downEnd, downMiss, groundEnd } = climbAndDescend(COLUMN, 4.4, PLAYER);
    expect(upEnd.y).toBeCloseTo(r.height, 1);
    // Feet rest on the tread above the walking point, so the descent ends about one rise high.
    expect(downEnd.y).toBeLessThan(r.steps[1].y + 0.1);
    expect(downMiss).toBeLessThan(0.3);
    expect(groundEnd.y).toBeLessThan(0.1);
  });

  it('the player capsule climbs and descends the Column with its two landings at 4.4 m/s', () => {
    const { r, upEnd, downMiss, groundEnd } = climbAndDescend(COLUMN_LANDINGS, 4.4, PLAYER);
    expect(upEnd.y).toBeCloseTo(r.height, 1);
    expect(downMiss).toBeLessThan(0.3);
    expect(groundEnd.y).toBeLessThan(0.1);
  });

  it('a townsfolk capsule climbs and descends the Column with its landings at 1.2 m/s', () => {
    const { r, upEnd, downMiss, groundEnd } = climbAndDescend(COLUMN_LANDINGS, 1.2, NPC);
    expect(upEnd.y).toBeCloseTo(r.height, 1);
    expect(downMiss).toBeLessThan(0.3);
    expect(groundEnd.y).toBeLessThan(0.1);
  });

  for (const speed of [0.8, 1.1, 1.4]) {
    it(`a townsfolk capsule climbs and descends a 60-riser spiral at ${speed} m/s`, () => {
      const { r, upEnd, downEnd, downMiss, groundEnd } = climbAndDescend(SHORT, speed, NPC);
      expect(upEnd.y, `up at ${speed}`).toBeCloseTo(r.height, 1);
      expect(downEnd.y, `down at ${speed}`).toBeLessThan(r.steps[1].y + 0.1);
      expect(downMiss, `down miss at ${speed}`).toBeLessThan(0.3);
      expect(groundEnd.y, `ground at ${speed}`).toBeLessThan(0.1);
    });
  }

  it('the plain 185-riser Column flight has at least 2.0 m of headroom above every tread', () => {
    const { w, r } = build(COLUMN);
    expect(r.height).toBeCloseTo(35.15, 2);
    let min = Infinity;
    for (const p of r.route()) min = Math.min(min, headroom(w, p));
    expect(min).toBeGreaterThanOrEqual(2.0);
  });

  it('the Column with its landings has at least 2.0 m of headroom on the walking line', () => {
    const { w, r } = build(COLUMN_LANDINGS);
    let min = Infinity;
    for (const p of r.route()) min = Math.min(min, headroom(w, p));
    expect(min).toBeGreaterThanOrEqual(2.0);
  });

  it('the landings are flat (the Column\'s two, and a short stair with one)', () => {
    for (const spec of [COLUMN_LANDINGS, { ...SHORT, landings: [{ after: 20, turns: 0.25 }] }]) {
      const { w, r } = build(spec);
      expect(r.landings.length).toBe(spec.landings!.length);
      for (const L of r.landings) {
        // Samples across the landing at the walking radius, cast down from 1 m above its top. The
        // ends are skipped: the next tread's footprint overlaps the landing's far end by about 0.1 rad.
        for (const f of [0.25, 0.4, 0.5, 0.6, 0.75]) {
          const a = L.angle0 + f * (L.angle1 - L.angle0);
          const p = { x: r.walkR * Math.sin(a), y: L.y + 1, z: r.walkR * Math.cos(a) };
          const hit = w.physics.raycast(p, { x: 0, y: -1, z: 0 }, 3, Layer.World);
          expect(hit, `landing ${L.y} at ${f}`).not.toBeNull();
          expect(Math.abs(hit!.point.y - L.y), `landing ${L.y} at ${f}`).toBeLessThan(1e-3);
        }
      }
    }
  });

  it('pointAt puts each tread at its own height and at the walking radius', () => {
    const { r } = build(COLUMN);
    r.steps.forEach((s, i) => {
      if (i % 20 !== 0 && i !== COLUMN.count - 1) return;
      const p = r.pointAt(i);
      expect(p.y).toBeCloseTo(s.y, 6);
      expect(Math.atan2(p.x, p.z)).toBeCloseTo(Math.atan2(Math.sin(s.angle), Math.cos(s.angle)), 6);
      expect(Math.hypot(p.x, p.z)).toBeCloseTo(r.walkR, 6);
    });
    expect(r.pointAt(COLUMN.count - 1).y).toBeCloseTo(r.height, 6);
    expect(r.pointAt(-5).y).toBeCloseTo(r.steps[0].y, 6);
  });
});
