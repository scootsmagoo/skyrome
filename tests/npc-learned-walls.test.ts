/**
 * Learned walls are one walker's own (NpcManager.learnWall, the stuck ladder): the review found that a
 * wall learned on the one shared NavGrid (`block`) stayed for everyone, so one NPC pushing into a crowd's
 * edge, a stall or a shut door in a doorway could strand everybody on that side. Now the walker's own
 * searches keep out of the cell for a while (NavGrid.avoid through NavService.findPath); nobody else's do.
 */
import { describe, expect, it } from 'vitest';
import { LearnedWalls, LEARNED_WALL_S, MAX_LEARNED } from '../src/ai/life/learnedWalls';
import { Mover } from '../src/ai/life/mover';
import { NavService } from '../src/ai/life/nav';
import { NavGrid } from '../src/ai/life/navgrid';
import { FakeWorld } from './npc-fakes';

/** Two yards joined by one 1 m doorway (x 0..1, z 0..1) in a wall along z = 0..1; a second way round to the east (x >= 6). */
function yards(withDetour: boolean) {
  const w = new FakeWorld();
  // The dividing wall (z 0..1), a doorway at x 0..1, open from x = 6 east when there is a detour.
  w.wall(-30, 0, 0, 1).wall(1, 0, withDetour ? 6 : 30, 1);
  const grid = new NavGrid(w, { radius: 40 });
  grid.setFocus(0, 0);
  grid.buildAll();
  grid.flood(0.5, -5, 1e6);
  return { grid, nav: new NavService(grid) };
}

/** Does a path cross the dividing wall's line (z 0..1) within the doorway? */
function throughDoor(p: { x: number; z: number }[], from: { x: number; z: number }) {
  let prev = from;
  for (const q of p) {
    if ((prev.z - 0.5) * (q.z - 0.5) < 0) {
      const x = prev.x + ((q.x - prev.x) * (0.5 - prev.z)) / (q.z - prev.z);
      if (x > -0.5 && x < 1.5) return true;
    }
    prev = q;
  }
  return false;
}

describe('LearnedWalls', () => {
  it('keeps each wall for LEARNED_WALL_S seconds, then forgets it', () => {
    const w = new LearnedWalls();
    w.add(1, 2);
    w.tick(LEARNED_WALL_S - 1);
    expect(w.n).toBe(1);
    w.add(3, 4);
    w.tick(1.5);
    // The first has lapsed, the second stays.
    expect(w.n).toBe(1);
    expect([w.xz[0], w.xz[1]]).toEqual([3, 4]);
    w.tick(LEARNED_WALL_S);
    expect(w.n).toBe(0);
  });

  it('remembers at most MAX_LEARNED, dropping the oldest', () => {
    const w = new LearnedWalls();
    for (let k = 0; k <= MAX_LEARNED; k++) w.add(k, 0);
    expect(w.n).toBe(MAX_LEARNED);
    expect(w.xz[0]).toBe(1);
    expect(w.xz[2 * (MAX_LEARNED - 1)]).toBe(MAX_LEARNED);
  });
});

describe('a learned wall is the walker\'s own (the false-positive case)', () => {
  it('one walker learns a wall in a doorway (a crowd pinned it there): everybody else still walks through', () => {
    const { grid, nav } = yards(true);
    const a = new LearnedWalls();
    // The doorway cell: a false alarm (nothing is built there).
    a.add(0.5, 0.5);
    const from = { x: 0.5, z: -6 };
    const mine = nav.findPath(from.x, from.z, 0.5, 8, true, a);
    const theirs = nav.findPath(from.x, from.z, 0.5, 8);
    expect(Array.isArray(mine) && Array.isArray(theirs)).toBe(true);
    // The walker who learned it goes round by the far opening; everyone else through the door.
    expect(throughDoor(mine as { x: number; z: number }[], from)).toBe(false);
    expect(throughDoor(theirs as { x: number; z: number }[], from)).toBe(true);
    // Nothing was marked on the shared grid.
    expect(grid.walkable(0.5, 0.5)).toBe(true);
    expect(grid.lineWalkable(0.5, -6, 0.5, 8)).toBe(true);
  });

  it('with no other way round, only the walker who learned it is held back, and only until the wall lapses', () => {
    const { nav } = yards(false);
    const m = new Mover();
    const out = { x: 0, z: 0 };
    m.walls.add(0.5, 0.5);
    m.setGoal(0.5, 8, 1.3);
    // Its own search fails (the door is its only way): it gives up this goal.
    expect(m.update(1 / 60, 0.5, -6, nav, out)).toBe('failed');
    // Another walker goes through.
    expect(nav.findPath(0.5, -6, 0.5, 8)).not.toBeNull();
    // Once the wall has lapsed, the first one goes through too.
    for (let t = 0; t < LEARNED_WALL_S + 1; t += 1) m.update(1, 0.5, -6, nav, out);
    expect(m.walls.n).toBe(0);
    m.setGoal(0.5, 8, 1.3);
    expect(m.update(1 / 60, 0.5, -6, nav, out)).toBe('none');
    expect(m.path.length).toBeGreaterThan(0);
  });

  it('a wall learned on the cell the walker stands in or walks to is not kept out of (that search could never succeed)', () => {
    const { nav } = yards(false);
    const a = new LearnedWalls();
    a.add(0.5, 8);
    a.add(0.5, -6);
    expect(nav.findPath(0.5, -6, 0.5, 8, true, a)).not.toBeNull();
  });
});
