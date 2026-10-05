import { beforeAll, describe, expect, it } from 'vitest';
import { NavGrid } from '../src/ai/life/navgrid';
import { NavService } from '../src/ai/life/nav';
import { PhysicsCellSampler } from '../src/ai/life/physicsSampler';
import { StreetNav } from '../src/ai/life/streets';
import { initPhysics, Physics } from '../src/core/Physics';
import { FakeWorld } from './npc-fakes';

function grid(world: FakeWorld, radius = 40) {
  const g = new NavGrid(world, { radius });
  g.setFocus(0, 0);
  g.buildAll();
  return g;
}

describe('NavGrid', () => {
  it('builds chunks nearest first under a budget', () => {
    const w = new FakeWorld();
    const g = new NavGrid(w, { radius: 40 });
    g.setFocus(0, 0);
    expect(g.ready(0, 0)).toBe(false);
    g.build(256);
    expect(w.calls).toBe(256);
    expect(g.ready(0.5, 0.5) || g.ready(-0.5, -0.5) || g.ready(-0.5, 0.5) || g.ready(0.5, -0.5)).toBe(true);
    g.buildAll();
    expect(g.ready(30, 0)).toBe(true);
    expect(g.ready(200, 0)).toBe(false);
  });

  it('finds a straight path on open ground', () => {
    const g = grid(new FakeWorld());
    const p = g.findPath(0.5, 0.5, 20.5, 10.5);
    expect(p).not.toBeNull();
    expect(p!.length).toBe(1);
    expect(p![0]).toEqual({ x: 20.5, z: 10.5 });
  });

  it('paths around a wall and the path never crosses blocked cells', () => {
    const w = new FakeWorld();
    w.blocks.push({ x0: 5, z0: -10, x1: 6, z1: 10 }); // wall x∈[5,6), z∈[-10,10)
    const g = grid(w);
    const p = g.findPath(0.5, 0.5, 12.5, 0.5);
    expect(p).not.toBeNull();
    expect(p!.length).toBeGreaterThan(1);
    // Walk the polyline in 0.1 m steps: never inside the wall.
    let px = 0.5;
    let pz = 0.5;
    for (const c of p!) {
      const n = Math.ceil(Math.hypot(c.x - px, c.z - pz) / 0.1);
      for (let i = 1; i <= n; i++) {
        const x = px + ((c.x - px) * i) / n;
        const z = pz + ((c.z - pz) * i) / n;
        expect(w.blocked(x, z)).toBe(false);
      }
      px = c.x;
      pz = c.z;
    }
    expect(p![p!.length - 1]).toEqual({ x: 12.5, z: 0.5 });
  });

  it('climbs onto a podium only by its steps', () => {
    const w = new FakeWorld();
    // A 3 m podium x∈[10,20) with 0.25 m steps on its west face at z∈[0,3).
    w.pads.push({ x0: 10, z0: -10, x1: 20, z1: 10, h: 3 });
    for (let i = 0; i < 12; i++) w.pads.push({ x0: -2 + 1 * i - 0, z0: 0, x1: -1 + i, z1: 3, h: 0.25 * (i + 1) });
    const g = grid(w);
    const p = g.findPath(0.5, -8.5, 15.5, -5.5);
    expect(p).not.toBeNull();
    // It must pass through the stair band z∈[0,3).
    const onStairs = p!.some((c) => c.z >= 0 && c.z < 3 && c.x < 10);
    expect(onStairs).toBe(true);
  });

  it('returns null for an enclosed goal and stays within the expansion budget', () => {
    const w = new FakeWorld();
    // A closed box around (20, 20).
    w.blocks.push({ x0: 15, z0: 15, x1: 25, z1: 16 }, { x0: 15, z0: 24, x1: 25, z1: 25 }, { x0: 15, z0: 15, x1: 16, z1: 25 }, { x0: 24, z0: 15, x1: 25, z1: 25 });
    const g = grid(w);
    const t0 = performance.now();
    expect(g.findPath(0.5, 0.5, 20.5, 20.5, 3000)).toBeNull();
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it('labels the area reachable from the player (spawns stay connected)', () => {
    const w = new FakeWorld();
    w.blocks.push({ x0: 15, z0: 15, x1: 25, z1: 16 }, { x0: 15, z0: 24, x1: 25, z1: 25 }, { x0: 15, z0: 15, x1: 16, z1: 25 }, { x0: 24, z0: 15, x1: 25, z1: 25 });
    const g = grid(w);
    g.flood(0.5, 0.5, 1e6);
    expect(g.reachable(10.5, 10.5)).toBe(true);
    expect(g.reachable(20.5, 20.5)).toBe(false);
  });

  it('nearestWalkable and lineWalkable', () => {
    const w = new FakeWorld();
    w.blocks.push({ x0: 0, z0: 0, x1: 3, z1: 3 });
    const g = grid(w);
    const n = g.nearestWalkable(1.5, 1.5, 4)!;
    expect(w.blocked(n.x, n.z)).toBe(false);
    expect(Math.hypot(n.x - 1.5, n.z - 1.5)).toBeLessThan(2.5);
    expect(g.lineWalkable(-5.5, 1.5, 5.5, 1.5)).toBe(false);
    expect(g.lineWalkable(-5.5, 5.5, 5.5, 5.5)).toBe(true);
  });
});

describe('NavService', () => {
  it('rations searches per step and falls back to a straight line off-grid', () => {
    const w = new FakeWorld();
    w.blocks.push({ x0: 5, z0: -10, x1: 6, z1: 10 });
    const nav = new NavService(grid(w));
    nav.budget = 2;
    nav.beginStep();
    expect(Array.isArray(nav.findPath(0.5, 0.5, 12.5, 0.5))).toBe(true);
    expect(Array.isArray(nav.findPath(0.5, 1.5, 12.5, 1.5))).toBe(true);
    expect(nav.findPath(0.5, 2.5, 12.5, 2.5)).toBe('busy');
    nav.beginStep();
    expect(nav.findPath(0.5, 2.5, 500, 2.5)).toEqual([{ x: 500, z: 2.5 }]);
  });

  it('strings street-graph nodes together for long routes', () => {
    const streets = new StreetNav({
      nodes: [
        { id: 'a', x: 0, z: 0 },
        { id: 'b', x: 100, z: 0 },
        { id: 'c', x: 100, z: 100 },
        { id: 'd', x: 0, z: 100 },
      ],
      edges: [
        { a: 'a', b: 'b' },
        { from: 'b', to: 'c' },
        ['c', 'd'],
      ],
    });
    const nav = new NavService(null, () => streets);
    nav.beginStep();
    const p = nav.findPath(1, 1, 1, 99);
    expect(Array.isArray(p)).toBe(true);
    // a → b → c → d → goal (it must go round, the a–d edge does not exist).
    expect((p as { x: number; z: number }[]).map((q) => [q.x, q.z])).toEqual([
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
      [1, 99],
    ]);
  });
});

describe('StreetNav adapter', () => {
  it('tolerates maps, index edges, positions and junk', () => {
    const nodes = new Map<string, { position: { x: number; y: number; z: number }; tags?: string[] }>([
      ['x', { position: { x: 0, y: 1, z: 0 }, tags: ['home'] }],
      ['y', { position: { x: 10, y: 1, z: 0 } }],
    ]);
    const s = new StreetNav({ nodes, edges: [{ a: 'x', b: 'y' }, { a: 'x', b: 'nope' }, null as never], spots: [{ id: 's1', kind: 'shopDoor', position: { x: 3, z: 1 }, facing: 1 }] });
    expect(s.nodes.length).toBe(2);
    expect(s.adj[0].length).toBe(1);
    expect(s.tagged('home').map((n) => n.id)).toEqual(['x']);
    expect(s.spotsNear(0, 0, 5, 'shopDoor').length).toBe(1);
    expect(s.nearest(9, 1)?.id).toBe('y');
    expect(new StreetNav(undefined).empty).toBe(true);
    expect(new StreetNav({ nodes: 'garbage' as never }).empty).toBe(true);
  });
});

describe('PhysicsCellSampler', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('finds floors, podia and blocked cells in a Rapier world', () => {
    const physics = new Physics();
    physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 50, y: 0.5, z: 50 });
    physics.addBox({ x: 10, y: 1.5, z: 0 }, { x: 4, y: 1.5, z: 4 }); // podium 3 m high
    physics.addCylinder({ x: -5, y: 2, z: 0 }, 2, 0.5); // a column
    physics.addBox({ x: 0, y: 6, z: 10 }, { x: 3, y: 0.3, z: 3 }); // a roof above head height
    physics.step(1 / 60);
    const s = new PhysicsCellSampler(physics);
    const out = { h: NaN, walkable: false };
    s.sample(0, 0, out);
    expect(out.h).toBeCloseTo(0, 2);
    expect(out.walkable).toBe(true);
    s.sample(10, 0, out);
    expect(out.h).toBeCloseTo(3, 2);
    expect(out.walkable).toBe(true);
    s.sample(-5, 0, out); // the column: blocked, or at most its top (4 m up, not street level)
    expect(out.walkable && Math.abs(out.h) < 0.5).toBe(false);
    s.sample(-4.6, 0, out); // right beside it: no room to stand
    expect(out.walkable && Math.abs(out.h) < 0.5).toBe(false);
    s.sample(0, 10, out); // under the roof: ground is found below it (the ray starts at 5.5 m)
    expect(out.h).toBeCloseTo(0, 2);
  });

  it('sees the street under a beam the ray starts inside, and under seating over a tunnel', () => {
    const physics = new Physics();
    physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 50, y: 0.5, z: 50 });
    physics.addBox({ x: 0, y: 5.35, z: 0 }, { x: 6, y: 0.55, z: 0.4 }); // a gallery beam, 4.8–5.9 m
    // Seating over a gate tunnel: the vault slab at 2.5 m, a seat block above it to 4 m.
    physics.addBox({ x: 20, y: 2.64, z: 0 }, { x: 1.6, y: 0.14, z: 3 });
    physics.addBox({ x: 20, y: 3.4, z: 0 }, { x: 0.5, y: 0.6, z: 0.2 });
    physics.addBox({ x: 18.2, y: 1.4, z: 0 }, { x: 0.2, y: 1.4, z: 3 }); // tunnel walls
    physics.addBox({ x: 21.8, y: 1.4, z: 0 }, { x: 0.2, y: 1.4, z: 3 });
    physics.step(1 / 60);
    const s = new PhysicsCellSampler(physics);
    const out = { h: NaN, walkable: false };
    s.sample(0, 0, out);
    expect([+out.h.toFixed(2), out.walkable]).toEqual([0, true]);
    s.sample(20, 0, out);
    expect([+out.h.toFixed(2), out.walkable]).toEqual([0, true]);
    s.sample(20, 1.5, out);
    expect([+out.h.toFixed(2), out.walkable]).toEqual([0, true]);
  });

  it('keeps the top of a solid podium, and finds a doorway that misses the cell centre', () => {
    const physics = new Physics();
    physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 50, y: 0.5, z: 50 });
    physics.addBox({ x: 10, y: 1.5, z: 0 }, { x: 3, y: 1.5, z: 3 }); // a podium, solid to the ground
    // A wall along x with a 1.2 m doorway from z = 0.1 to 1.3 (a 1 m cell centred at z = 0.5 is
    // inside it, one centred at z = 1.5 grazes the jamb).
    physics.addBox({ x: -10, y: 1.5, z: -10.05 }, { x: 0.3, y: 1.5, z: 10.15 });
    physics.addBox({ x: -10, y: 1.5, z: 11.3 }, { x: 0.3, y: 1.5, z: 10 });
    physics.step(1 / 60);
    const s = new PhysicsCellSampler(physics);
    const out = { h: NaN, walkable: false };
    s.sample(10, 0, out);
    expect([+out.h.toFixed(2), out.walkable]).toEqual([3, true]);
    s.sample(-10, 0.5, out);
    expect(out.walkable).toBe(true);
    s.sample(-10, 1.25, out);
    expect(out.walkable).toBe(true);
    s.sample(-10, 5, out); // in the wall
    expect(out.walkable && Math.abs(out.h) < 0.5).toBe(false);
  });
});
