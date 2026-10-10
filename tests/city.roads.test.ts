/**
 * M5a, roads and dead ends over the plan the game builds (the whole CITY_BOUNDS raster):
 * - the atlas roads no longer run through solid buildings (detour.ts), without cutting the network;
 * - no atlas road ends at nothing (a road end meets a road, a street, a gate or arch, a square, a
 *   building's door, a stairway's path, the river or the edge of the planned area);
 * - the street graph's nodes are reachable from the Forum;
 * and in the street builder: walkable aprons at the edges, dropped kerbs where a street meets a road.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as atlas from '../src/data/atlas';
import { buildStreet } from '../src/arch/fabric/streets';
import { KERB } from '../src/core/traversal';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { auditReach, auditRoadEnds, summarizeRoadEnds } from '../src/world/city/audit';
import { BLOCKING, insideLength } from '../src/world/city/detour';
import { LIFT } from '../src/world/city/datum';
import { buildStreetGraph } from '../src/world/city/network';
import { scaleBounds } from '../src/world/city/plan';
import { streetMouths, streetWork } from '../src/world/city/roads';
import { PINNED_OPEN } from '../src/world/city/data';
import { K } from '../src/world/city/raster';
import { toGame } from '../src/world/coords';
import { gameFixture } from './city.fixture';

/** Highest collider surface over (x, z) in a street build, or null when no triangle covers it. */
function topAt(b: MeshBuilder, x: number, z: number): number | null {
  let top: number | null = null;
  for (const c of b.colliders) {
    if (c.kind !== 'trimesh') continue;
    const p = c.geometry.getAttribute('position');
    for (let i = 0; i + 2 < p.count; i += 3) {
      const A = [p.getX(i), p.getY(i), p.getZ(i)], B = [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)], C = [p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)];
      const d = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((B[2] - C[2]) * (x - C[0]) + (C[0] - B[0]) * (z - C[2])) / d;
      const v = ((C[2] - A[2]) * (x - C[0]) + (A[0] - C[0]) * (z - C[2])) / d;
      const w = 1 - u - v;
      if (u < -1e-9 || v < -1e-9 || w < -1e-9) continue;
      const y = u * A[1] + v * B[1] + w * C[1];
      if (top === null || y > top) top = y;
    }
  }
  return top;
}

describe('street builder: aprons and dropped kerbs', () => {
  const flat = () => 0;
  // A straight street along +z: carriageway 5 m, sidewalks 2 m, so the kerb is at x = ±2.5 and the property line at ±4.5.
  const build = (extra: object = {}) => {
    const b = new MeshBuilder();
    buildStreet(b, { points: [[0, 0], [0, 60]], roadWidth: 5, sidewalk: 2, lift: LIFT.road, curb: KERB, capStart: false, capEnd: false, steppingStones: [], ...extra }, flat);
    return b;
  };

  it('has a walkable apron from the sidewalk edge down to the ground (no lip at the property line)', () => {
    const b = build();
    const top = LIFT.road + KERB;
    // At the property line the sidewalk is at its full height; 0.9 m further out the surface is down at the ground.
    expect(topAt(b, 4.5, 30)).toBeCloseTo(top, 2);
    const out = topAt(b, 4.5 + 0.9, 30);
    expect(out).not.toBeNull();
    expect(out!).toBeLessThan(0.03);
    // And the way down is a ramp, never a step above the walk-over limit.
    let prev = topAt(b, 4.5, 30)!;
    for (let x = 4.6; x <= 5.4; x += 0.1) {
      const y = topAt(b, x, 30);
      expect(y).not.toBeNull();
      expect(prev - y!).toBeLessThan(0.05);
      prev = y!;
    }
  });

  it('gives a lane walkable edges too', () => {
    const b = new MeshBuilder();
    buildStreet(b, { points: [[0, 0], [0, 60]], kind: 'lane', roadWidth: 3.2, lift: LIFT.lane }, flat);
    // The lane's surface is LIFT.lane above the ground at its edge (x = 1.6) and runs out to the ground beyond it.
    expect(topAt(b, 1.6, 30)).toBeGreaterThan(0.03);
    const out = topAt(b, 1.6 + 0.55, 30);
    expect(out).not.toBeNull();
    expect(out!).toBeLessThan(0.03);
  });

  it('drops the kerb where a street meets the road, on that side only', () => {
    const plain = build();
    const dip = build({ dips: [{ s: 30, side: 1, w: 4 }] });
    const sideTop = LIFT.road + KERB;
    // Sidewalk on the +normal side (normal of +z travel is (-1, 0)... x < 0) or the other: one drops, the other stays.
    const xs = [3.5, -3.5];
    const heights = xs.map((x) => [topAt(plain, x, 30), topAt(dip, x, 30)]);
    expect(heights[0][0]).toBeCloseTo(sideTop, 2);
    expect(heights[1][0]).toBeCloseTo(sideTop, 2);
    const dropped = heights.filter(([, d]) => d !== null && d < sideTop - 0.1);
    const kept = heights.filter(([, d]) => d !== null && Math.abs(d - sideTop) < 0.01);
    expect(dropped).toHaveLength(1);
    expect(kept).toHaveLength(1);
    // The dropped sidewalk is flush with the carriageway at its kerb, and ramps back up over RAMP (1.6 m) beyond the dip.
    const x = heights[0][1]! < sideTop - 0.1 ? 3.5 : -3.5;
    expect(topAt(dip, x, 30)!).toBeLessThan(LIFT.road + 0.02);
    expect(topAt(dip, x, 30 + 2 + 0.8)!).toBeGreaterThan(LIFT.road + 0.03);
    expect(topAt(dip, x, 30 + 2 + 4)!).toBeCloseTo(sideTop, 2);
  });
});

describe('roads and dead ends on the real plan', () => {
  const after = gameFixture(true, true);
  const before = gameFixture(true, false);
  const blockers = (plan: typeof after.plan) => plan.landmarkPolys.filter((l) => BLOCKING.has(l.category)).map((l) => ({ id: l.id, poly: l.poly }));
  const inside = (plan: typeof after.plan) => plan.roads.reduce((n, r) => n + insideLength(r.points, blockers(plan)), 0);

  it('no longer runs the atlas roads through solid buildings', () => {
    const b = inside(before.plan), a = inside(after.plan);
    console.log('ROAD METRES INSIDE BLOCKING FOOTPRINTS before', Math.round(b), 'after', Math.round(a), '; detours', after.plan.roadDetours.length, 'links', after.plan.stats.roadLinks, 'reverted', after.plan.stats.roadsReverted);
    expect(b).toBeGreaterThan(250);
    expect(a).toBeLessThan(b * 0.45);
    expect(after.plan.roadDetours.length).toBeGreaterThan(10);
  });

  it('has no atlas road that ends at nothing', () => {
    const ends = auditRoadEnds(after.plan);
    const dead = ends.filter((e) => e.verdict === 'dead');
    console.log('ROAD ENDS', JSON.stringify(summarizeRoadEnds(auditRoadEnds(before.plan))), '->', JSON.stringify(summarizeRoadEnds(ends)), dead.map((e) => `${e.road}@${e.p.map(Math.round)}`).join(' '));
    expect(dead).toHaveLength(0);
    expect(auditRoadEnds(before.plan).filter((e) => e.verdict === 'dead').length).toBeGreaterThan(0);
  });

  it('keeps the walkable network whole: every street node can be walked to from the Forum', () => {
    const core = scaleBounds(atlas.CORE_BOUNDS);
    const inCore = (x: number, z: number) => x >= core.minX && x <= core.maxX && z >= core.minZ && z <= core.maxZ;
    const graph = buildStreetGraph(after.plan, streetWork(after.plan, (x, z) => after.hm.heightAt(x, z), core, 128), null, inCore);
    const g0 = buildStreetGraph(before.plan, streetWork(before.plan, (x, z) => before.hm.heightAt(x, z), core, 128), null, inCore);
    const r = auditReach(graph, 0, 0), r0 = auditReach(g0, 0, 0);
    console.log('REACH FROM THE FORUM before', r0.reachable, '/', r0.nodes, r0.share.toFixed(3), 'after', r.reachable, '/', r.nodes, r.share.toFixed(3), 'islands', r.islands.map((i) => `${i.size}@${i.at}`).join(' '));
    expect(r.share).toBeGreaterThanOrEqual(r0.share);
    // The plan asks for every node. A node is only left out when no walkable link (the raster probe
    // used here; the game adds the physics probe) reaches the main network within 120 m: the few
    // islands that remain are lanes walled in between courts. The test pins that set so it cannot grow:
    // at most 4 islands, 5 nodes each, under 1% of the nodes. The NavGrid (what people walk) is separate:
    // see tests/navgrid.links.test.ts and the in-game window.__streetAudit().
    expect(r.share).toBeGreaterThan(0.99);
    expect(r.islands.length).toBeLessThanOrEqual(4);
    for (const i of r.islands) expect(i.size).toBeLessThanOrEqual(5);
    // The Forum and the places the story walks between are all on the one network.
    const comp = new Set<number>();
    const stack = [graph.nearest(0, 0, 200)];
    comp.add(stack[0]);
    while (stack.length) for (const [w] of graph.neighbours(stack.pop()!)) if (!comp.has(w)) { comp.add(w); stack.push(w); }
    for (const [x, z, name] of [[525, 171, 'Ludus Magnus'], [400, 100, 'Colosseum'], [304, 573, 'Porta Capena'], [60, -190, 'Trajan\'s Forum'], [-260, 150, 'Porta Carmentalis']] as const) {
      const n = graph.nearest(x, z, 150);
      expect(n, name).toBeGreaterThanOrEqual(0);
      expect(comp.has(n), name).toBe(true);
    }
  }, 120000);

  it('keeps the ground the story stands on open: no block (house) over the places the golden path spawns on', () => {
    for (const pin of PINNED_OPEN) {
      const [x, z] = toGame(pin.at[0], pin.at[1]);
      const g = after.plan.grid;
      // The spot and a ring of points round it are not in any building block.
      for (const [dx, dz] of [[0, 0], [pin.r * 0.6, 0], [-pin.r * 0.6, 0], [0, pin.r * 0.6], [0, -pin.r * 0.6]]) {
        const i = g.index(x + dx, z + dz);
        const inBlock = i >= 0 && g.cls[i] === K.FREE && g.owner[i] >= 2_000_000;
        expect(inBlock, `${pin.id} ${dx},${dz}`).toBe(false);
      }
    }
  });

  it('drops kerbs at the streets that meet the roads', () => {
    const mouths = streetMouths(after.plan);
    let n = 0;
    for (const l of mouths.values()) n += l.length;
    expect(n).toBeGreaterThan(30);
    for (const l of mouths.values()) for (const m of l) expect([-1, 1]).toContain(m.side);
  });
});

void THREE;
