import { describe, expect, it } from 'vitest';
import { NavGrid } from '../src/ai/life/navgrid';
import { FakeWorld } from './npc-fakes';

describe('NavGrid.lineClear', () => {
  const grid = () => {
    const w = new FakeWorld();
    // A wall one cell thick along z, from z = 0 to 12, in the column x = 0..1.
    w.wall(0, 0, 1, 12);
    const g = new NavGrid(w, { radius: 40 });
    g.setFocus(0, 0);
    g.buildAll();
    return g;
  };

  it('refuses a line that grazes a wall (0.2 m off) which lineWalkable lets through, and accepts one with room', () => {
    const g = grid();
    // x = -0.2 is in the free column next to the wall: the cell test passes, a 0.6 m body would not.
    expect(g.lineWalkable(-0.2, 2, -0.2, 10)).toBe(true);
    expect(g.lineClear(-0.2, 2, -0.2, 10)).toBe(false);
    // x = -0.8: 0.8 m off, room either side.
    expect(g.lineClear(-0.8, 2, -0.8, 10)).toBe(true);
  });

  it('does not refuse someone who starts hugging the wall and walks away from it, and leaves short hops alone', () => {
    const g = grid();
    expect(g.lineClear(-0.2, 2, -5, 2)).toBe(true);
    expect(g.lineClear(-0.2, 2, -0.2, 3)).toBe(true);
  });

  it('a path string-pulled past the wall end keeps its corner (the shortcut would graze it)', () => {
    const g = grid();
    // From beside the wall's south end to the north side past its end: the straight line grazes the end.
    const path = g.findPath(-0.5, 1, -0.5, 14);
    expect(path).not.toBeNull();
    expect(path!.every((p) => p.x < 0 || p.z > 12)).toBe(true);
  });
});
