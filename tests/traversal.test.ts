/**
 * The traversal contract (core/traversal.ts) and the audits that hold the city to it: kerbs no
 * taller than the step contract, one datum per block, no climb the planner asks for that the
 * Actor cannot make, props that sit on the surface under their corners.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { Draw } from '../src/arch/fabric/draw';
import { buildStreet } from '../src/arch/fabric/streets';
import { PROP_MAX_SLOPE, groundProp, placeProp } from '../src/arch/props';
import { NavGrid } from '../src/ai/life/navgrid';
import { AUTOSTEP_MAX, KERB, NAV_MAX_STEP, STEP_ASSIST_MAX, STEP_ASSIST_MIN, walkable } from '../src/core/traversal';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { FLOOR_LIFT, LIFT, SIDEWALK, sidewalkTop } from '../src/world/city/datum';
import type { HeightFn } from '../src/world/city/massing';
import { scaleBounds } from '../src/world/city/plan';
import { streetWork } from '../src/world/city/roads';
import { cityFixture } from './city.fixture';
import { FakeWorld } from './npc-fakes';

/** Height of a triangle that stands (normal mostly horizontal), else 0. */
function steepFaceHeight(p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number): number {
  const ux = p.getX(i + 1) - p.getX(i), uy = p.getY(i + 1) - p.getY(i), uz = p.getZ(i + 1) - p.getZ(i);
  const vx = p.getX(i + 2) - p.getX(i), vy = p.getY(i + 2) - p.getY(i), vz = p.getZ(i + 2) - p.getZ(i);
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  if (l < 1e-9 || Math.abs(ny) / l > 0.5) return 0;
  return Math.max(p.getY(i), p.getY(i + 1), p.getY(i + 2)) - Math.min(p.getY(i), p.getY(i + 1), p.getY(i + 2));
}

describe('the traversal contract', () => {
  it('orders the limits: kerb <= assist <= autostep, and the planner never asks for more than the assist', () => {
    expect(KERB).toBeGreaterThanOrEqual(STEP_ASSIST_MIN);
    expect(KERB).toBeLessThanOrEqual(STEP_ASSIST_MAX);
    expect(STEP_ASSIST_MAX).toBeLessThanOrEqual(AUTOSTEP_MAX);
    expect(NAV_MAX_STEP).toBeLessThanOrEqual(STEP_ASSIST_MAX);
    expect(walkable(KERB)).toBe(true);
    expect(walkable(STEP_ASSIST_MAX + 0.01)).toBe(false);
  });

  it('the NavGrid default is the contract, and it refuses a lone ledge the Actor could not climb', () => {
    const w = new FakeWorld();
    // A 0.25 m ledge (a kerb and a half) and a 0.4 m one (a seat row), each with level ground either side.
    w.pads.push({ x0: 5, z0: -20, x1: 40, z1: -2, h: 0.25 });
    w.pads.push({ x0: 5, z0: 2, x1: 40, z1: 20, h: 0.4 });
    const g = new NavGrid(w, { radius: 40 });
    expect(g.maxStep).toBe(NAV_MAX_STEP);
    g.setFocus(0, 0);
    g.buildAll();
    expect(g.canStep(4, -10, 5, -10)).toBe(true);
    expect(g.canStep(4, 10, 5, 10)).toBe(false);
    expect(g.findPath(0.5, 10.5, 12.5, 10.5)).toBeNull();
  });
});

describe('prop grounding', () => {
  const flat = () => 0;
  const rect = { minX: -1, maxX: 1, minZ: -0.5, maxZ: 0.5 };

  it('leaves a prop on flat ground alone', () => {
    const g = groundProp(flat, 3, 4, 0.7, rect);
    expect(g.dy).toBeCloseTo(0, 6);
    expect(g.gx).toBeCloseTo(0, 6);
    expect(g.worstGap).toBeCloseTo(0, 6);
  });

  it('leans with a gentle slope and keeps every corner within 6 cm of the ground', () => {
    for (const slope of [0.04, 0.08, PROP_MAX_SLOPE]) {
      for (const rot of [0, 0.6, 2.1, 4]) {
        const H = (x: number, z: number) => slope * (0.8 * x - 0.6 * z) + 2;
        const g = groundProp(H, 10, -5, rot, rect);
        expect(g.worstGap, `slope ${slope} rot ${rot}`).toBeLessThanOrEqual(0.06);
        expect(Math.hypot(g.gx, g.gz)).toBeLessThanOrEqual(PROP_MAX_SLOPE + 1e-9);
        // The origin stands on the plane: the lift matches what the surface rises under the footprint.
        expect(Math.abs(g.dy)).toBeLessThan(0.11);
      }
    }
  });

  it('caps the lean on a steep slope and sinks the high side instead of floating the low one', () => {
    const H = (x: number) => 0.4 * x;
    const g = groundProp(H, 0, 0, 0, rect);
    expect(Math.hypot(g.gx, g.gz)).toBeCloseTo(PROP_MAX_SLOPE, 6);
    // What the lean cannot take up stays on the low side, bounded by the slope left over.
    expect(g.worstGap).toBeLessThanOrEqual((0.4 - PROP_MAX_SLOPE) * 1 - 0.09);
  });

  it('placeProp with a ground function puts a stall on the slope, not above it', () => {
    const H: HeightFn = (x, z) => 0.1 * x + 0.05 * z;
    const b = new MeshBuilder();
    const d = new Draw(b);
    placeProp(d, 'stall_fruit', 6, H(6, 4), 4, 0.5, { variant: 0, ground: H });
    const pr = b.props[0];
    expect(pr).toBeDefined();
    // The lowest point of the model lies on the ground (or a hand's breadth into it), never above it.
    let lowest = Infinity;
    for (const gm of pr.geoms) {
      const p = gm.getAttribute('position');
      for (let i = 0; i < p.count; i++) lowest = Math.min(lowest, p.getY(i) - H(p.getX(i), p.getZ(i)));
    }
    expect(lowest).toBeGreaterThanOrEqual(-0.11);
    expect(lowest).toBeLessThanOrEqual(0.03);
    // Without grounding the same stall hangs 5 cm or more off the slope on its low side.
    const plain = new MeshBuilder();
    placeProp(new Draw(plain), 'stall_fruit', 6, H(6, 4), 4, 0.5, { variant: 0 });
    let lowestPlain = Infinity;
    for (const gm of plain.props[0].geoms) {
      const p = gm.getAttribute('position');
      for (let i = 0; i < p.count; i++) lowestPlain = Math.min(lowestPlain, p.getY(i) - H(p.getX(i), p.getZ(i)));
    }
    expect(lowestPlain).toBeLessThan(lowest + 0.05);
  });
});

/** Props with no ground under them by design (MeshBuilder's HUNG_PROPS). */
const HUNG = /torch|bracket|lamp|awning|sign|hang|shelf|garland|wreath|lantern|banner|sconce|velum/;

describe('the city holds to the contract', () => {
  const { hm, plan } = cityFixture();
  const H: HeightFn = (x, z) => hm.heightAt(x, z);
  let mb: MeshBuilder;

  beforeAll(() => {
    mb = new MeshBuilder();
    const work = streetWork(plan, H, scaleBounds(atlas.CORE_BOUNDS, 150), 128);
    for (const c of work.cells.values()) for (const item of [...c.items, ...c.detail]) item(mb);
  }, 120000);

  it('has one kerb height, under the step contract, in the street builder', () => {
    const b = new MeshBuilder();
    const flatH = () => 0;
    buildStreet(b, { points: [[0, 0], [0, 40]], roadWidth: 5, sidewalk: 2, lift: LIFT.road, curb: KERB }, flatH);
    const tri = b.colliders.find((c) => c.kind === 'trimesh');
    expect(tri && tri.kind === 'trimesh').toBe(true);
    if (!tri || tri.kind !== 'trimesh') return;
    const p = tri.geometry.getAttribute('position');
    let maxFace = 0;
    for (let i = 0; i + 2 < p.count; i += 3) maxFace = Math.max(maxFace, steepFaceHeight(p, i));
    expect(maxFace).toBeGreaterThan(0.1);
    expect(maxFace).toBeLessThanOrEqual(KERB + 1e-6);
  });

  it('every kerb the city builds is at most the kerb standard high (vertical steps of its colliders)', () => {
    let steps = 0;
    let worst = 0;
    let kerbs = 0;
    for (const c of mb.colliders) {
      if (c.kind !== 'trimesh') continue;
      const p = c.geometry.getAttribute('position');
      // Vertices stacked on the same (x, z): the foot and the lip of a kerb face.
      const at = new Map<string, number[]>();
      for (let i = 0; i < p.count; i++) {
        const k = `${Math.round(p.getX(i) * 1000)},${Math.round(p.getZ(i) * 1000)}`;
        const l = at.get(k);
        if (l) l.push(p.getY(i));
        else at.set(k, [p.getY(i)]);
      }
      for (const ys of at.values()) {
        if (ys.length < 2) continue;
        const h = Math.max(...ys) - Math.min(...ys);
        if (h < 0.01) continue;
        steps++;
        worst = Math.max(worst, h);
        if (h > 0.1) kerbs++;
      }
    }
    expect(kerbs).toBeGreaterThan(100);
    expect(steps).toBeGreaterThan(100);
    expect(worst).toBeLessThanOrEqual(KERB + 0.005);
  });

  it('keeps one datum: block sidewalks, street lifts and building floors agree to the centimetre', () => {
    expect(SIDEWALK.road + FLOOR_LIFT).toBeCloseTo(sidewalkTop(LIFT.road), 9);
    expect(SIDEWALK.street + FLOOR_LIFT).toBeCloseTo(sidewalkTop(LIFT.vicus), 9);
    expect(SIDEWALK.other + FLOOR_LIFT).toBeCloseTo(LIFT.piazza, 9);
    // Surfaces that meet differ by well under what a walker feels (a ride-over rise).
    const lifts = Object.values(LIFT).sort((a, b) => a - b);
    for (let i = 1; i < lifts.length; i++) expect(lifts[i] - lifts[i - 1]).toBeLessThanOrEqual(0.03 + 1e-9);
    expect(Math.abs(sidewalkTop(LIFT.road) - sidewalkTop(LIFT.vicus))).toBeLessThanOrEqual(0.03);
    // Every block edge carries one of the three datums.
    const allowed = new Set([SIDEWALK.road, SIDEWALK.street, SIDEWALK.other].map((v) => v.toFixed(6)));
    const sample = plan.blocks.filter((bl) => bl.kind === 'built').slice(0, 400);
    for (const bl of sample) for (const s of bl.sidewalk) expect(allowed.has(s.toFixed(6)), `${bl.id} ${s}`).toBe(true);
  });

  it('every prop the street work places stands on the ground it was given, within a hand', () => {
    let n = 0;
    let floating = 0;
    let worst = 0;
    for (const pr of mb.props) {
      // (An altar stands on its shrine's podium.)
      if (HUNG.test(pr.kind) || pr.kind === 'altar') continue;
      let minY = Infinity;
      for (const g of pr.geoms) {
        const p = g.getAttribute('position');
        for (let i = 0; i < p.count; i++) minY = Math.min(minY, p.getY(i));
      }
      if (!Number.isFinite(minY)) continue;
      n++;
      // Feet against the terrain under the origin; paving, kerbs and market platforms lift it a little.
      const gap = minY - H(pr.base.x, pr.base.z);
      worst = Math.max(worst, gap);
      if (gap > 0.45) floating++;
    }
    expect(n).toBeGreaterThan(20);
    expect(floating).toBe(0);
    expect(worst).toBeLessThan(0.45);
  });
});
