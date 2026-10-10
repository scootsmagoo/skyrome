import { describe, expect, it } from 'vitest';
import { StreetNav } from '../src/ai/life/streets';

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
});
