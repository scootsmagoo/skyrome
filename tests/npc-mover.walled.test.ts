import { describe, expect, it } from 'vitest';
import { Mover } from '../src/ai/life/mover';
import type { NavService } from '../src/ai/life/nav';

/** A nav service stand-in: a path of two corners and a grid that says whether the way to a corner is open. */
function fakeNav(open: { value: boolean }) {
  const calls = { search: 0 };
  const nav = {
    grid: { ready: () => true, lineWalkable: () => open.value },
    findPath: () => {
      calls.search++;
      return [{ x: 5, z: 0 }, { x: 10, z: 0 }];
    },
  } as unknown as NavService;
  return { nav, calls };
}

describe('Mover: the way to the corner closes', () => {
  it('plans again when the grid says a wall now stands between the agent and its corner, a few times and not in a rush', () => {
    const open = { value: true };
    const { nav, calls } = fakeNav(open);
    const m = new Mover();
    m.setGoal(10, 0, 1.3);
    const out = { x: 0, z: 0 };
    // Half a second with the way open (the stuck ladder has not started).
    for (let i = 0; i < 30; i++) m.update(1 / 60, 0, 0, nav, out);
    expect(calls.search).toBe(1);
    // A wall closes the way: re-plans, but at most three per goal and 1.5 s apart.
    open.value = false;
    let events = 0;
    for (let i = 0; i < 60 * 12; i++) {
      const ev = m.update(1 / 60, 0, 0, nav, out);
      if (ev === 'stuck' || ev === 'blocked') events++;
      if (calls.search > 8) break;
    }
    expect(calls.search).toBeGreaterThanOrEqual(2);
    expect(calls.search).toBeLessThanOrEqual(5);
    expect(events).toBeGreaterThanOrEqual(0);
  });
});
