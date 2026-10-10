/**
 * The quest route (src/nav): the street router, the polyline, the planner's legs through doors.
 */
import { describe, expect, it } from 'vitest';
import type { Game } from '../src/core/Game';
import { QuestRoute } from '../src/nav/QuestRoute';
import { cellLeg, doorChain, doublesBack, planRoute, streetLeg, type DoorLink, type GridLike, type Leg, type PlanWorld } from '../src/nav/plan';
import { Polyline, closest } from '../src/nav/polyline';
import { StreetRouter } from '../src/nav/streetRouter';

/** A w×h street grid, `step` m apart, node i = z * w + x. */
function gridGraph(w: number, h: number, step = 20, skip?: (a: number, b: number) => boolean) {
  const nodes: { id: number; x: number; z: number }[] = [];
  const edges: [number, number, number][] = [];
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) nodes.push({ id: z * w + x, x: x * step, z: z * step });
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      if (x + 1 < w && !skip?.(i, i + 1)) edges.push([i, i + 1, 4]);
      if (z + 1 < h && !skip?.(i, i + w)) edges.push([i, i + w, 4]);
    }
  return { nodes, edges };
}

describe('StreetRouter', () => {
  it('finds the shortest way along the streets', () => {
    const r = new StreetRouter(gridGraph(10, 10));
    const path = r.route(0, 99)!;
    expect(path[0]).toBe(0);
    expect(path[path.length - 1]).toBe(99);
    // 18 blocks of 20 m: 19 nodes on a Manhattan path.
    expect(path.length).toBe(19);
    for (let i = 1; i < path.length; i++) expect(Math.abs(path[i] - path[i - 1]) === 1 || Math.abs(path[i] - path[i - 1]) === 10).toBe(true);
  });

  it('goes round a closed street', () => {
    // Cut every link across the middle row except at the far right.
    const r = new StreetRouter(gridGraph(6, 6, 20, (a, b) => b - a === 6 && Math.floor(a / 6) === 2 && a % 6 !== 5));
    const path = r.route(2 * 6 + 0, 3 * 6 + 0)!;
    expect(path).not.toBeNull();
    // Must pass the open link 17 → 23.
    expect(path.includes(17) && path.includes(23)).toBe(true);
  });

  it('labels components and keeps the nearest node to the route’s component', () => {
    const g = gridGraph(4, 1);
    g.nodes.push({ id: 100, x: 200, z: 0 }, { id: 101, x: 220, z: 0 });
    g.edges.push([100, 101, 4]);
    const r = new StreetRouter(g);
    expect(r.comp[0]).toBe(0);
    expect(r.comp[4]).toBe(1);
    expect(r.route(0, 4)).toBeNull();
    // Nearest to (205, 0) overall is the island; restricted to component 0 it is node 3.
    expect(r.nearest(205, 0, 300)).toBe(4);
    expect(r.nearest(205, 0, 300, 0)).toBe(3);
  });

  it('starts at the node on the way, not the nearest one behind you', () => {
    const r = new StreetRouter(gridGraph(10, 1));
    // Node 0 (x 0) is nearest to (9, 5), but node 1 (x 20) is on the way to x 180.
    expect(r.nearest(9, 5)).toBe(0);
    const p = r.routeBetween(9, 5, 180, 0)!;
    expect(p[0]).toBe(1);
    expect(p[p.length - 1]).toBe(9);
    // And it stops at the node nearest the goal from the right side: a goal at x 171 ends at 8 or 9.
    const q = r.routeBetween(9, 5, 171, 3)!;
    expect(q[q.length - 1]).toBeGreaterThanOrEqual(8);
  });

  it('routeBetween reaches across components only when it can, else uses the far nearest', () => {
    const g = gridGraph(4, 1);
    g.nodes.push({ id: 100, x: 400, z: 0 }, { id: 101, x: 420, z: 0 });
    g.edges.push([100, 101, 4]);
    const r = new StreetRouter(g);
    expect(r.routeBetween(0, 0, 410, 0)).toBeNull();
    expect(r.routeBetween(0, 0, 70, 0)).toEqual([0, 1, 2, 3]);
  });

  it('routes across a big graph quickly and repeatedly without drift', () => {
    const r = new StreetRouter(gridGraph(90, 90, 12));
    const t0 = performance.now();
    let len = 0;
    for (let i = 0; i < 20; i++) len = r.route(0, 90 * 90 - 1)!.length;
    expect(len).toBe(179);
    expect((performance.now() - t0) / 20).toBeLessThan(25);
  });
});

describe('Polyline', () => {
  it('merges near points, measures and finds the closest point', () => {
    const l = new Polyline(2);
    l.push(0, 0, 0).push(0.1, 0, 0).push(10, 0, 0).push(10, 0, 10);
    expect(l.n).toBe(3);
    expect(l.length).toBeCloseTo(20);
    const c = l.closest(4, 3, closest());
    expect(c.seg).toBe(0);
    expect(c.d).toBeCloseTo(3);
    expect(c.along).toBeCloseTo(4);
    const p = l.pointAt(15, { x: 0, y: 0, z: 0, dx: 0, dz: 0 });
    expect(p.x).toBeCloseTo(10);
    expect(p.z).toBeCloseTo(5);
    expect(p.dz).toBeCloseTo(1);
  });

  it('tells the turns of a spiral stair apart by height', () => {
    // Two turns of a 1.5 m stair, 3 m apart in height: every point of the plan is on both.
    const l = new Polyline();
    for (let i = 0; i <= 36; i++) {
      const a = (i / 18) * Math.PI * 2;
      l.push(Math.sin(a) * 1.5, (i / 18) * 3, Math.cos(a) * 1.5, 0.05);
    }
    const c = closest();
    // Standing on the upper turn: with the feet height it is found there, not on the lower one.
    l.closest(0, 1.5, c, 0, l.n - 1, 3.1);
    expect(c.along).toBeGreaterThan(l.length / 2 - 1);
    expect(c.d).toBeLessThan(0.1);
    l.closest(0, 1.5, c, 0, l.n - 1, 0.1);
    expect(c.along).toBeLessThan(1);
  });

  it('interpolates known heights and passes over unknown ones', () => {
    const l = new Polyline();
    l.push(0, 2, 0).push(10, NaN, 0).push(20, 4, 0);
    const p = { x: 0, y: 0, z: 0, dx: 0, dz: 0 };
    expect(l.pointAt(5, p).y).toBe(2);
    expect(l.pointAt(15, p).y).toBe(4);
  });
});

describe('planner', () => {
  const noDoors: PlanWorld = { router: null, grid: null, cellRoute: () => [], doors: () => [] };
  const door = (id: string, from: string | null, to: string | null, at: [number, number, number], exit: [number, number, number]): DoorLink => ({
    id,
    from,
    to,
    at: { x: at[0], y: at[1], z: at[2] },
    exit: { x: exit[0], y: exit[1], z: exit[2] },
  });
  const doors = [
    door('stair:in', null, 'stair', [100, 10, 0], [100, -110, 1]),
    door('stair:out', 'stair', null, [100, -110, 1.5], [100, 10, -2]),
    door('stair:up', 'stair', 'top', [100, -80, 0], [100, 40, 0]),
    door('top:down', 'top', 'stair', [100, 40, 0.5], [100, -80, 0.5]),
  ];

  it('chains doors between places', () => {
    expect(doorChain(doors, null, null)).toEqual([]);
    expect(doorChain(doors, null, 'top')!.map((d) => d.id)).toEqual(['stair:in', 'stair:up']);
    expect(doorChain(doors, 'top', null)!.map((d) => d.id)).toEqual(['top:down', 'stair:out']);
    expect(doorChain(doors, null, 'nowhere')).toBeNull();
  });

  it('plans a leg per place, ending at each door', () => {
    const stair = [
      { x: 100, y: -110, z: 1 },
      { x: 101, y: -100, z: 0 },
      { x: 100, y: -90, z: -1 },
      { x: 100, y: -80, z: 0 },
    ];
    const world: PlanWorld = { router: null, grid: null, cellRoute: (c) => (c === 'stair' ? stair : []), doors: () => doors };
    const legs: Leg[] = [];
    const s = planRoute(world, { x: 0, y: 10, z: 0, cell: null }, { x: 100, y: 40, z: 1, cell: 'top' }, legs);
    expect(legs.map((l) => [l.cell, l.door])).toEqual([
      [null, 'stair:in'],
      ['stair', 'stair:up'],
      ['top', null],
    ]);
    // No street graph outside: that leg is a straight line, and says so.
    expect(s).toBe('direct');
    // The stair leg follows the cell's route up.
    const mid = legs[1].line;
    expect(mid.n).toBeGreaterThanOrEqual(4);
    expect(mid.y(mid.n - 1)).toBeCloseTo(-80);
  });

  it('fails when the places are not joined', () => {
    const legs: Leg[] = [];
    expect(planRoute(noDoors, { x: 0, y: 0, z: 0, cell: null }, { x: 0, y: 0, z: 0, cell: 'stair' }, legs)).toBe('failed');
    expect(legs.length).toBe(0);
  });

  it('walks a cell route in either direction', () => {
    const route = [0, 1, 2, 3, 4].map((i) => ({ x: i, y: i * 2, z: 0 }));
    const world: PlanWorld = { ...noDoors, cellRoute: () => route };
    const down = new Polyline();
    cellLeg(world, 'c', { x: 4, y: 8, z: 0 }, { x: 0, y: 0, z: 0 }, down);
    expect(down.x(0)).toBe(4);
    expect(down.x(down.n - 1)).toBe(0);
  });

  it('follows the streets from the player to the objective', () => {
    const router = new StreetRouter(gridGraph(10, 10));
    const line = new Polyline();
    const s = streetLeg({ ...noDoors, router }, { x: 3, y: 0, z: 2 }, { x: 178, y: 0, z: 181 }, line);
    expect(s).toBe('streets');
    expect(line.x(0)).toBe(3);
    expect(line.x(line.n - 1)).toBe(178);
    // About the Manhattan distance, not the straight line.
    expect(line.length).toBeGreaterThan(330);
    expect(line.length).toBeLessThan(380);
  });

  it('cuts straight to a far node when the nav grid says the line is clear', () => {
    const router = new StreetRouter(gridGraph(10, 10));
    // A grid that is built everywhere and open: lines are clear, so the lead skips nodes.
    const open: GridLike = { ready: () => true, lineWalkable: () => true, findPath: (_ax, _az, bx, bz) => [{ x: bx, z: bz }] };
    const line = new Polyline();
    streetLeg({ ...noDoors, router, grid: open }, { x: 0, y: 0, z: 0 }, { x: 60, y: 0, z: 0 }, line);
    // A short hop on an open grid is one straight line.
    expect(line.n).toBe(2);
  });

  it('does not double back to a node behind the player', () => {
    // Node at 0, next at 20; a player standing at 12 on that street goes on, not back to 0.
    expect(doublesBack(12, 0, 0, 0, 20, 0)).toBe(true);
    expect(doublesBack(-5, 0, 0, 0, 20, 0)).toBe(false);
    // Far off to the side of that street: no shortcut through the block.
    expect(doublesBack(12, 60, 0, 0, 20, 0)).toBe(false);
  });
});

describe('QuestRoute (replanning and back-off)', () => {
  function fakeGame(streets: unknown) {
    const player = { position: { x: 3, y: 0, z: 2 } };
    const data: Record<string, unknown> = {};
    const game = { settings: { data }, player, streets, population: undefined, interiors: undefined } as unknown as Game;
    return { game, player, data };
  }
  const goalAt = (x: number, z: number, key = 'q:a:b') => ({ key, x, y: 0, z });
  const run = (r: QuestRoute, seconds: number) => {
    for (let t = 0; t < seconds; t += 0.05) r.update(0.05);
  };

  it('plans once, follows progress, and replans only after straying (throttled)', () => {
    const { game, player } = fakeGame(gridGraph(10, 10));
    const r = new QuestRoute(game, () => goalAt(178, 181));
    run(r, 1);
    expect(r.status).toBe('streets');
    expect(r.stats.plans).toBe(1);
    // Walk along the first stretch: no replan, progress grows.
    const l = r.legs[0].line;
    player.position.x = l.x(2);
    player.position.z = l.z(2);
    run(r, 2);
    expect(r.stats.plans).toBe(1);
    expect(r.along).toBeGreaterThan(5);
    // Wander 60 m off: one replan, not one per check.
    player.position.x = 100;
    player.position.z = 20;
    run(r, 0.5);
    expect(r.stats.plans).toBe(2);
    run(r, 3);
    expect(r.stats.plans).toBe(2);
  });

  it('backs off when there is no street route', () => {
    const { game, player } = fakeGame(null);
    const r = new QuestRoute(game, () => goalAt(300, 0));
    run(r, 0.3);
    expect(r.status).toBe('direct');
    expect(r.stats.plans).toBe(1);
    // Keep straying: plans at 2, 4, 8 … s, not every second.
    let x = 0;
    for (let i = 0; i < 300; i++) {
      x += 1.3;
      player.position.x = x % 50;
      player.position.z = 40 + ((i * 7) % 30);
      r.update(0.1);
    }
    // 30 s of straying: about 1 + log2 steps (2, 4, 8, 16 → 4 retries), far below 30.
    expect(r.stats.plans).toBeLessThanOrEqual(6);
  });

  it('replans at once for a new objective and hides on arrival', () => {
    const { game, player } = fakeGame(gridGraph(10, 10));
    let goal = goalAt(178, 181, 'q:a:1');
    const r = new QuestRoute(game, () => goal);
    run(r, 0.5);
    expect(r.stats.plans).toBe(1);
    goal = goalAt(20, 160, 'q:a:2');
    run(r, 0.25);
    expect(r.stats.plans).toBe(2);
    player.position.x = 21;
    player.position.z = 159;
    run(r, 0.5);
    expect(r.status).toBe('arrived');
    expect(r.legs.length).toBe(0);
  });

  it('works out only the doors while every route display is off', () => {
    const { game, data } = fakeGame(gridGraph(10, 10));
    data.routeOnMaps = false;
    const r = new QuestRoute(game, () => goalAt(178, 181));
    run(r, 1);
    // A straight leg, no street search.
    expect(r.legs[0].line.n).toBe(2);
    expect(r.wanted).toBe(false);
  });
});
