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
import { RIM_SINK, Sheet, buildStreet, emitSheet, inConv, makeConv } from '../src/arch/fabric/streets';
import { KERB } from '../src/core/traversal';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { auditReach, auditRoadEnds, summarizeRoadEnds } from '../src/world/city/audit';
import { BLOCKING, insideLength } from '../src/world/city/detour';
import { LIFT } from '../src/world/city/datum';
import { buildStreetGraph } from '../src/world/city/network';
import { scaleBounds, trimSteepStreets, type PlanStreet } from '../src/world/city/plan';
import { PavingIndex, RANK, parapetCollider, retainingPieces, streetMouths, streetWork } from '../src/world/city/roads';
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
    // Terrain v2 (one ground) re-plans the city on the physics' triangles: its one island is 9 nodes
    // on a terrace at the core's south-east corner (555, 579), against v1's four of 3–5 nodes.
    for (const i of r.islands) expect(i.size).toBeLessThanOrEqual(after.hm.profile === 'v1' ? 5 : 9);
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

// ------------------------------------------------------------------ phase 4b: street surfaces on the ground

/** A v2-style ground: heights on a 2 m lattice, linear on each cell's b–c triangles (as Heightmap.heightAt under terrain v2). */
function latticeGround(seed = 7, amp = 0.6) {
  const s = 2, n = 60;
  const h: number[] = [];
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) h.push(amp * Math.sin(i * 0.7 + rnd()) * Math.cos(j * 0.45) + 0.08 * i + 0.3 * rnd());
  const at = (i: number, j: number) => h[Math.max(0, Math.min(n, j)) * (n + 1) + Math.max(0, Math.min(n, i))];
  const H = (x: number, z: number) => {
    const fx = x / s, fz = z / s;
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const h00 = at(i, j), h10 = at(i + 1, j), h01 = at(i, j + 1), h11 = at(i + 1, j + 1);
    return tx + tz <= 1 ? h00 + (h10 - h00) * tx + (h01 - h00) * tz : h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  };
  return { H, ground: { x0: 0, z0: 0, s } };
}

/** Every drawn triangle of a build: [ax, ay, az, bx, ...]. */
function drawnTris(b: MeshBuilder): number[][] {
  const out: number[][] = [];
  for (const geoms of (b as unknown as { parts: Map<string, THREE.BufferGeometry[]> }).parts.values()) {
    for (const g of geoms) {
      const p = g.getAttribute('position');
      const idx = g.index;
      const n = idx ? idx.count : p.count;
      for (let k = 0; k + 2 < n; k += 3) {
        const t: number[] = [];
        for (let q = 0; q < 3; q++) {
          const i = idx ? idx.getX(k + q) : k + q;
          t.push(p.getX(i), p.getY(i), p.getZ(i));
        }
        out.push(t);
      }
    }
  }
  return out;
}

describe('street surfaces conform to the ground (phase 4b)', () => {
  const { H, ground } = latticeGround();

  it('follows heightAt within 2 cm at every edge midpoint and centroid, and skirts its open edges down under the ground', () => {
    const b = new MeshBuilder();
    buildStreet(b, { points: [[20, 10], [40, 60], [80, 90]], kind: 'paved', roadWidth: 4, sidewalk: 1.2, curb: KERB, lift: LIFT.vicus, steppingStones: [], conform: { ground } }, H);
    const tris = drawnTris(b);
    let worst = 0, up = 0, skirtLow = Infinity;
    for (const t of tris) {
      const P = [0, 1, 2].map((q) => [t[3 * q], t[3 * q + 1], t[3 * q + 2]]);
      const ny = (P[1][2] - P[0][2]) * (P[2][0] - P[0][0]) - (P[1][0] - P[0][0]) * (P[2][2] - P[0][2]);
      const area = Math.abs(ny) / 2;
      if (area < 1e-6) {
        // A vertical face: a kerb face or a skirt.
        skirtLow = Math.min(skirtLow, ...P.map((p) => p[1] - H(p[0], p[2])));
        continue;
      }
      up++;
      const off = P.map((p) => p[1] - H(p[0], p[2]));
      const dev = (x: number, z: number, y: number, o: number) => Math.abs(y - H(x, z) - o);
      for (const [u, v] of [[0, 1], [1, 2], [2, 0]]) worst = Math.max(worst, dev((P[u][0] + P[v][0]) / 2, (P[u][2] + P[v][2]) / 2, (P[u][1] + P[v][1]) / 2, (off[u] + off[v]) / 2));
      worst = Math.max(worst, dev((P[0][0] + P[1][0] + P[2][0]) / 3, (P[0][2] + P[1][2] + P[2][2]) / 3, (P[0][1] + P[1][1] + P[2][1]) / 3, (off[0] + off[1] + off[2]) / 3));
    }
    expect(up).toBeGreaterThan(100);
    expect(worst).toBeLessThanOrEqual(0.0201);
    // The capped ends' skirts reach under the lowest ground of their edge (SKIRT_DEPTH).
    expect(skirtLow).toBeLessThan(-0.09);
  });

  it('is cut away exactly where a surface that wins the place lies, with skirts along the cut', () => {
    const square = makeConv([[44, 40], [56, 40], [56, 52], [44, 52]]);
    const b = new MeshBuilder();
    buildStreet(b, { points: [[50, 10], [50, 80]], kind: 'lane', roadWidth: 3, lift: LIFT.lane, conform: { ground, cut: (a, c, d, e) => (square.maxX >= a && square.minX <= d && square.maxZ >= c && square.minZ <= e ? [square] : []) } }, H);
    const tris = drawnTris(b);
    let inside = 0, cutFaces = 0;
    for (const t of tris) {
      const cx = (t[0] + t[3] + t[6]) / 3, cz = (t[2] + t[5] + t[8]) / 3;
      if (cx > 44.01 && cx < 55.99 && cz > 40.01 && cz < 51.99) inside++;
      // Vertical faces standing on the cut lines z = 40 and z = 52.
      if ([t[2], t[5], t[8]].every((z) => Math.abs(z - 40) < 1e-6) || [t[2], t[5], t[8]].every((z) => Math.abs(z - 52) < 1e-6)) cutFaces++;
    }
    expect(inside).toBe(0);
    expect(cutFaces).toBeGreaterThan(0);
  });

  it('lays ground cover with its rim sunk and no skirts (a rim lower than its body)', () => {
    const sheet = new Sheet(H);
    const a = sheet.v(10, 10, 0.04), c = sheet.v(20, 10, 0.04), d = sheet.v(20, 20, 0.04), e = sheet.v(10, 20, 0.04);
    sheet.tri(a, c, d, 'dirt', false);
    sheet.tri(a, d, e, 'dirt', false);
    const b = new MeshBuilder();
    emitSheet(b, sheet, { ground, rim: 0.04 - RIM_SINK, skirts: false, collide: false });
    const tris = drawnTris(b);
    let rimLow = Infinity, bodyHigh = -Infinity;
    for (const t of tris) for (let q = 0; q < 3; q++) {
      const x = t[3 * q], y = t[3 * q + 1], z = t[3 * q + 2];
      const onRim = Math.abs(x - 10) < 1e-6 || Math.abs(x - 20) < 1e-6 || Math.abs(z - 10) < 1e-6 || Math.abs(z - 20) < 1e-6;
      if (onRim) rimLow = Math.min(rimLow, y - H(x, z));
      else bodyHigh = Math.max(bodyHigh, y - H(x, z));
    }
    expect(rimLow).toBeCloseTo(-0.01, 5);
    expect(bodyHigh).toBeCloseTo(0.04, 5);
    expect(b.colliders.length).toBe(0);
  });
});

describe('one surface per place: the paving index (phase 4b)', () => {
  it('ranks the surfaces and covers a band bend with its convex pieces', () => {
    const pave = new PavingIndex();
    const road = pave.add(RANK.road, [[0, 0], [20, 0], [20, 20]], 2);
    const lane = pave.add(RANK.lane, [[10, -10], [10, 10]], 1.5);
    // The lane loses to the road where they cross; the road never to the lane.
    expect(pave.over(10, 0, pave.order(lane), lane)).toBe(true);
    expect(pave.over(10, 0, pave.order(road), road)).toBe(false);
    // The outside corner of the bend (the mitre) is covered by the road's pieces.
    const pieces = pave.convs(20, -3, 23, 0, pave.order(lane), lane);
    expect(pieces.some((c) => inConv(c, 21.6, -1.6))).toBe(true);
  });
});

describe('stair parapets and retaining walls (phase 4b)', () => {
  it('pitches a parapet collider with its flight: its top stays about 0.9 m over the treads at both ends', () => {
    const c = parapetCollider([0, 0], 0, 4, 10, 12, 0, 1, 0.9);
    const m = new THREE.Matrix4().compose(c.center, c.rotation, new THREE.Vector3(1, 1, 1));
    const top = (zLocal: number) => new THREE.Vector3(0, c.half.y, zLocal).applyMatrix4(m);
    // Over the treads' line (y = 10 + z / 2) at both ends of its top: about 0.9 m, never the 2.8 m wall of an upright box.
    for (const p of [top(-c.half.z), top(c.half.z)]) {
      expect(p.y - (10 + p.z / 2)).toBeGreaterThan(0.85);
      expect(p.y - (10 + p.z / 2)).toBeLessThan(1.1);
    }
  });

  it('builds a retaining run as wall pieces of at most 4 m outside the road, a cut wall up to the slope', () => {
    // The band's edge at x = 5; right of travel along +z is −x, where the ground climbs at 56°.
    const H = (x: number) => (x < 5 ? (5 - x) * 1.5 : 0);
    const run = { road: 'r', side: 1 as const, points: Array.from({ length: 12 }, (_, k) => ({ x: 5, z: k * 1.2, y: 0, ground: 6, grade: 1.5 })) };
    const pieces = retainingPieces(run, null, H);
    expect(pieces.length).toBeGreaterThanOrEqual(3);
    for (const p of pieces) {
      expect(p.length).toBeLessThanOrEqual(4.1);
      expect(p.cut).toBe(true);
      // Just outside the band edge, its inner face on it, its top meeting the slope behind it.
      expect(p.x).toBeCloseTo(4.7, 5);
      expect(p.bottom).toBeLessThan(0);
      expect(p.top).toBeCloseTo(0.9 + 0.25, 5);
    }
  });
});

describe('minor streets end at the cliff (phase 4b)', () => {
  it('cuts a street where its grade over 4 m passes STREET_MAX_GRADE and keeps the walkable pieces', () => {
    // Flat, then a 60 % ramp from z 40 to 50, then flat again.
    const H = (_x: number, z: number) => (z < 40 ? 0 : z < 50 ? (z - 40) * 0.6 : 6);
    const streets: PlanStreet[] = [{ id: 'st0', index: 0, points: [[0, 0], [0, 90]], width: 4, kind: 'lane', level: 1, steps: [false], density: 0.5, wealth: 0.5, corridor: false } as PlanStreet];
    const r = trimSteepStreets(streets, H);
    expect(r.cut).toBe(1);
    expect(streets.length).toBe(2);
    expect(r.ends.length).toBe(2);
    for (const st of streets) {
      for (const p of st.points) expect(p[1] < 40 || p[1] > 50).toBe(true);
      expect(st.steps.length).toBe(st.points.length - 1);
    }
    expect(streets[1].index).toBe(1);
  });
});
