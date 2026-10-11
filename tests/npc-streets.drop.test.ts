import { describe, expect, it } from 'vitest';
import { NavService } from '../src/ai/life/nav';
import { NavGrid } from '../src/ai/life/navgrid';
import { StreetNav } from '../src/ai/life/streets';
import { FakeWorld } from './npc-fakes';

describe('StreetNav.drop', () => {
  // A short way through B (at z = 0) and a long way round through D (at z = 40).
  const graph = () =>
    new StreetNav({
      nodes: [
        { id: 'A', x: 0, z: 0 },
        { id: 'B', x: 50, z: 0 },
        { id: 'C', x: 100, z: 0 },
        { id: 'D', x: 50, z: 40 },
      ],
      edges: [['A', 'B'], ['B', 'C'], ['A', 'D'], ['D', 'C']],
    });

  it('routes round a node that was cut out', () => {
    const s = graph();
    expect(s.path(0, 0, 100, 0)!.map((p) => p.z)).toEqual([0, 0, 0, 0]);
    expect(s.drop(50, 0)).toBe(true);
    expect(s.dropped).toBe(1);
    expect(s.path(0, 0, 100, 0)!.some((p) => p.z === 40)).toBe(true);
    // Nothing left to cut there.
    expect(s.drop(50, 0)).toBe(false);
  });

  it('refuses a point that is not near a node', () => {
    expect(graph().drop(20, 20)).toBe(false);
  });

  it('never starts or ends a route on a cut node', () => {
    const s = graph();
    s.drop(50, 0);
    // From right beside B: the nearest node with a link is A (or C), not B.
    const p = s.path(51, 1, 100, 0);
    expect(p).not.toBeNull();
    expect(p!.some((q) => q.x === 50 && q.z === 0)).toBe(false);
  });

  it('puts a cut node back when the ground under it changes, and not before', () => {
    const s = graph();
    s.drop(50, 0, 7);
    s.restoreCut(() => 7);
    expect(s.dropped).toBe(1);
    s.restoreCut(() => 8);
    expect(s.dropped).toBe(0);
    expect(s.path(0, 0, 100, 0)!.map((p) => p.z)).toEqual([0, 0, 0, 0]);
  });

  it('a link to a node still cut comes back with that node', () => {
    const s = graph();
    s.drop(50, 0, 1);
    s.drop(100, 0, 1);
    // C changes first: its links to D come back, the one to B waits for B.
    s.restoreCut((x) => (x === 100 ? 2 : 1));
    expect(s.dropped).toBe(1);
    expect(s.adj[2].map((e) => s.nodes[e.to].id).sort()).toEqual(['D']);
    s.restoreCut(() => 2);
    expect(s.dropped).toBe(0);
    expect(s.adj[1].map((e) => s.nodes[e.to].id).sort()).toEqual(['A', 'C']);
    expect(s.adj[2].map((e) => s.nodes[e.to].id).sort()).toEqual(['B', 'D']);
  });
});

/**
 * NavService cuts a street node the walk cannot reach (a node the city drew behind a building) only from
 * reachability labels made with the grid round it built: the review found a node whose chunk was built after
 * the last flood read as walled off, and the cut lasted the whole session.
 */
describe('NavService: cutting a street node behind a building', () => {
  // A closed room (walls 1 m thick) round x 12..18, z -3..3; the street node R inside it.
  function setup() {
    const w = new FakeWorld();
    w.wall(11, -4, 19, -3).wall(11, 3, 19, 4).wall(11, -4, 12, 4).wall(18, -4, 19, 4);
    const grid = new NavGrid(w, { radius: 40 });
    // The street graph: from S (where the walker stands) through R (in the room) to E (far, past the grid),
    // or the long way round through D.
    const streets = new StreetNav({
      nodes: [
        { id: 'S', x: 0.5, z: 0.5 },
        { id: 'R', x: 15.5, z: 0.5 },
        { id: 'E', x: 120.5, z: 0.5 },
        { id: 'D', x: 30.5, z: 30.5 },
      ],
      edges: [['S', 'R'], ['R', 'E'], ['S', 'D'], ['D', 'E']],
    });
    const nav = new NavService(grid, () => streets);
    return { w, grid, streets, nav };
  }
  const viaRoom = (p: unknown) => Array.isArray(p) && p.some((q: { x: number; z: number }) => Math.abs(q.x - 15.5) < 1 && Math.abs(q.z - 0.5) < 1);

  it('not while the labels were made before the grid there was built', () => {
    const { grid, streets, nav } = setup();
    grid.setFocus(0, 0);
    // The walker's chunk only, then a flood, then the rest (the room's chunk among it).
    grid.build(16 * 16 + 2 * 16);
    grid.flood(0.5, 0.5, 1e6);
    grid.buildAll();
    expect(grid.reachable(15.5, 0.5)).toBe(false);
    expect(grid.settled(15.5, 0.5, 24)).toBe(false);
    nav.beginStep();
    nav.findPath(0.5, 0.5, 120.5, 0.5);
    expect(streets.dropped).toBe(0);
    // A flood over the built grid: now it is cut, and the route goes the long way round.
    grid.flood(0.5, 0.5, 1e6);
    expect(grid.settled(15.5, 0.5, 24)).toBe(true);
    nav.beginStep();
    const p = nav.findPath(0.5, 0.5, 120.5, 0.5);
    expect(streets.dropped).toBe(1);
    expect(viaRoom(p)).toBe(false);
  });

  it('it comes back when the grid under it changes (here: the room gets a door and is sampled again)', () => {
    const { w, grid, streets, nav } = setup();
    grid.setFocus(0, 0);
    grid.buildAll();
    grid.flood(0.5, 0.5, 1e6);
    nav.beginStep();
    nav.findPath(0.5, 0.5, 120.5, 0.5);
    expect(streets.dropped).toBe(1);
    // Sampling the grid again with nothing changed keeps the cut.
    const refreshAll = () => {
      for (let x = -40; x <= 40; x += 16) for (let z = -40; z <= 40; z += 16) grid.resample(x, z);
      grid.buildAll();
    };
    refreshAll();
    nav.beginStep();
    nav.findPath(0.5, 0.5, 120.5, 0.5);
    expect(streets.dropped).toBe(1);
    // A door in the room's west wall: the chunk changes, the node comes back and is walkable again.
    w.blocks.splice(2, 1, { x0: 11, z0: -4, x1: 12, z1: 0 }, { x0: 11, z0: 1, x1: 12, z1: 4 });
    refreshAll();
    grid.flood(0.5, 0.5, 1e6);
    nav.beginStep();
    const p = nav.findPath(0.5, 0.5, 120.5, 0.5);
    expect(streets.dropped).toBe(0);
    expect(viaRoom(p)).toBe(true);
  });
});
