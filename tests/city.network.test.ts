/**
 * The street graph's own links are walkable: the physics probe (walls, podia, stairs) on a small
 * Rapier world, and on the real plan: no link through a block, the river, a standing wall or the
 * city's street furniture, none onto the middle of a stairway, and links still join the network.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import * as atlas from '../src/data/atlas';
import type { Game } from '../src/core/Game';
import { Physics, initPhysics } from '../src/core/Physics';
import { buildStreetGraph, physicsProbe, rasterProbe } from '../src/world/city/network';
import { scaleBounds } from '../src/world/city/plan';
import { K, type Pt } from '../src/world/city/raster';
import { streetWork } from '../src/world/city/roads';
import { cityFixture } from './city.fixture';

beforeAll(async () => {
  await initPhysics();
});

describe('physics probe', () => {
  function world() {
    const physics = new Physics();
    physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 60, y: 0.5, z: 60 });
    // A wall across x = 10 from z = -5 to 5, a 1.2 m podium at x = 20…30 with steps up its west side
    // only for z in [-2, 2], and a tree trunk at (0, 12).
    physics.addBox({ x: 10, y: 1.5, z: 0 }, { x: 0.3, y: 1.5, z: 5 });
    physics.addBox({ x: 25, y: 0.6, z: 0 }, { x: 5, y: 0.6, z: 10 });
    for (let k = 0; k < 6; k++) physics.addBox({ x: 19.85 - (5 - k) * 0.3, y: (k + 1) * 0.1, z: 0 }, { x: 0.15, y: (k + 1) * 0.1, z: 2 });
    physics.addCylinder({ x: 0, y: 1.5, z: 12 }, 1.5, 0.3);
    physics.step(1 / 60);
    return physicsProbe({ physics } as unknown as Game, () => 0);
  }

  it('walks open ground, not through a wall or a trunk', () => {
    const P = world();
    expect(P.clear([0, 0], [8, 0])).toBe(true);
    expect(P.clear([0, 0], [14, 0])).toBe(false);
    expect(P.clear([0, -8], [14, -8])).toBe(true);
    expect(P.clear([-5, 12], [5, 12])).toBe(false);
    expect(P.blocked(10, 0)).toBe(true);
    expect(P.blocked(5, 0)).toBe(false);
  });

  it('climbs a podium by its steps only', () => {
    const P = world();
    expect(P.clear([16, 0], [24, 0])).toBe(true);
    expect(P.clear([16, 6], [24, 6])).toBe(false);
    // From the podium top (known standing height) back down the steps.
    expect(P.clear([24, 0], [16, 0], 1.2)).toBe(true);
  });
});

describe('street graph links on the plan', () => {
  const { hm, plan } = cityFixture();
  const H = (x: number, z: number) => hm.heightAt(x, z);
  const core = scaleBounds(atlas.CORE_BOUNDS);
  const inCore = (x: number, z: number) => x >= core.minX && x <= core.maxX && z >= core.minZ && z <= core.maxZ;
  const work = streetWork(plan, H, core, 128);
  const graph = buildStreetGraph(plan, work, null, inCore);

  it('refuses a link through a block, a standing wall or the river', () => {
    const P = rasterProbe(plan);
    const blk = plan.blocks.find((b) => b.kind === 'built' && b.detailed && b.area > 1500)!;
    const [cx, cz] = blk.centroid;
    expect(P.clear([cx - blk.radius - 10, cz], [cx + blk.radius + 10, cz])).toBe(false);
    const g = plan.grid;
    const crossing = (cls: number) => {
      for (let iz = 1; iz < g.nz - 1; iz += 3)
        for (let ix = 1; ix < g.nx - 1; ix += 3) {
          if (g.cls[iz * g.nx + ix] !== cls) continue;
          const x = g.cx(ix), z = g.cz(iz);
          return [[x - 6, z], [x + 6, z]] as [Pt, Pt];
        }
      return null;
    };
    for (const cls of [K.WALL, K.WATER]) {
      const c = crossing(cls);
      expect(c).not.toBeNull();
      expect(P.clear(c![0], c![1])).toBe(false);
    }
  });

  it('makes every plaza, piazza and landmark link walkable by the plan, never onto mid-stairway', () => {
    const R = { stall: 2, fountain: 1.8, shrine: 1.4, bench: 1, container: 1 } as Record<string, number>;
    const P = rasterProbe(plan, [
      ...work.spots.map((s) => ({ x: s.position.x, z: s.position.z, r: R[s.kind] ?? 1, end: /^pz\d+:/.test(s.id) ? 5.5 : 2.5 })),
      ...work.carts.map((c) => ({ x: c.x, z: c.z, r: 2, end: 2.5 })),
    ]);
    let links = 0;
    for (const [a, b] of graph.edges) {
      const A = graph.nodes[a], B = graph.nodes[b];
      if (A.kind !== 'plaza' && A.kind !== 'piazza' && B.kind !== 'plaza' && B.kind !== 'piazza') continue;
      links++;
      expect(P.clear([A.x, A.z], [B.x, B.z]), `${a}-${b}`).toBe(true);
    }
    expect(links).toBeGreaterThan(50);
    // Interior nodes of the atlas stairways keep two neighbours (their flight), nothing more.
    for (const [ri, path] of work.stairPaths) {
      const ends = [path[0], path[path.length - 1]];
      // Ends, and crossings with another road (the parapets open there), may branch.
      const open = work.junctions.filter((j) => j.roads.includes(ri));
      for (const n of graph.nodes) {
        if (ends.some((e) => Math.hypot(e[0] - n.x, e[1] - n.z) < 2)) continue;
        if (open.some((j) => Math.hypot(j.p[0] - n.x, j.p[1] - n.z) < j.r + 1)) continue;
        const onPath = path.some((p, k) => k + 1 < path.length && segDist(n.x, n.z, p, path[k + 1]) < 0.3);
        if (onPath) expect(graph.neighbours(n.id).length, `stairs node ${n.id}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('still joins the plazas and squares to the network', () => {
    const big = new Set(graph.components()[0]);
    const squares = graph.nodes.filter((n) => n.kind === 'plaza' || n.kind === 'piazza');
    const joined = squares.filter((n) => big.has(n.id)).length;
    expect(joined / squares.length).toBeGreaterThan(0.9);
  });
});

function segDist(x: number, z: number, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
  return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
}

void THREE;
