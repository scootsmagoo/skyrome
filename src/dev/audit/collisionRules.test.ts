import { describe, expect, it } from 'vitest';
import { compareColumn, compareWall, groundBand, terrainBilinear, terrainDrawnHeight, terrainOtherHeight } from './collisionRules';

const flat = (y: number, tag = 't') => ({ y, ny: 1, tag });

describe('compareColumn', () => {
  it('agrees when the collider is where the picture is', () => {
    expect(compareColumn([flat(10.0, 'paving')], [flat(10.02, 'city:b1:trimesh')], 9.9)).toBeNull();
  });
  it('reports a float when the player stands above the drawn ground', () => {
    const f = compareColumn([flat(10.0, 'paving'), flat(9.9, 'terrain')], [flat(10.2, 'city:b1:box')], 9.9)!;
    expect(f.kind).toBe('float');
    expect(f.delta).toBeCloseTo(0.2);
    expect(f.phys).toBe('city:b1:box');
  });
  it('reports a sink when a drawn kerb has no collider', () => {
    const f = compareColumn([flat(10.15, 'kerb'), flat(10.0, 'road'), flat(9.9, 'terrain')], [flat(10.0, 'road:trimesh')], 9.9)!;
    expect(f.kind).toBe('sink');
    expect(f.delta).toBeCloseTo(-0.15);
    expect(f.vis).toBe('kerb');
  });
  it('tells a ramp under drawn steps apart from a real offset', () => {
    const ramp = { y: 10.08, ny: 0.9, tag: 'stairs:trimesh' };
    expect(compareColumn([flat(10.0, 'tread')], [ramp], 9.5)!.kind).toBe('ramp-steps');
    expect(compareColumn([flat(10.0, 'tread')], [{ ...ramp, y: 10.3 }], 9.5)!.kind).toBe('float');
  });
  it('reports a fall-through when nothing collides under a drawn floor', () => {
    const f = compareColumn([flat(10.0, 'floor')], [], 9.9)!;
    expect(f.kind).toBe('fallthrough');
  });
  it('ignores roofs: only the ground band counts', () => {
    expect(groundBand([flat(20), flat(10), flat(8)], 9.9).map((s) => s.y)).toEqual([10]);
    expect(compareColumn([flat(20, 'roof'), flat(10, 'floor')], [flat(10, 'floor:box'), flat(20.5, 'roof:box')], 9.9)).toBeNull();
  });
  it('ignores ceilings (down-facing) and steep faces', () => {
    expect(compareColumn([flat(10, 'floor'), { y: 12, ny: -1, tag: 'ceiling' }], [flat(10, 'f'), { y: 11, ny: 0.1, tag: 'wall' }], 9.9)).toBeNull();
  });
});

describe('compareWall', () => {
  it('is quiet when the first collider is the drawn wall', () => {
    expect(compareWall({ dist: 2.0, tag: 'p' }, { dist: 2.1, tag: 'v' }, 6)).toBeNull();
    expect(compareWall(null, null, 6)).toBeNull();
  });
  it('finds an invisible wall standing in front of the drawn one', () => {
    const f = compareWall({ dist: 1.2, tag: 'city:b:box' }, { dist: 2.0, tag: 'wall' }, 6)!;
    expect(f.kind).toBe('invisible');
    expect(f.gap).toBeCloseTo(0.8);
  });
  it('finds an invisible wall with nothing drawn behind it, unless the ray just ran out', () => {
    expect(compareWall({ dist: 3, tag: 'p' }, null, 6)!.kind).toBe('invisible');
    expect(compareWall({ dist: 5.9, tag: 'p' }, null, 6)).toBeNull();
  });
  it('finds a ghost wall the body passes through', () => {
    expect(compareWall(null, { dist: 2, tag: 'v' }, 6)!.kind).toBe('ghost');
    expect(compareWall({ dist: 3, tag: 'p' }, { dist: 2, tag: 'v' }, 6)!.gap).toBeCloseTo(1);
  });
});

describe('terrain triangulations', () => {
  const h = [0, 1, 0, 1] as const; // h00 h10 h01 h11: a fold along the a–d diagonal
  it('match the bilinear height at the corners and along the shared diagonal', () => {
    for (const [tx, tz] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]] as const) {
      expect(terrainDrawnHeight(...h, tx, tz)).toBeCloseTo(terrainBilinear(...h, tx, tz));
    }
  });
  it('differ from each other inside a twisted cell', () => {
    const t = [0, 0, 0, 1] as const; // only one corner raised
    expect(terrainDrawnHeight(...t, 0.5, 0.5)).toBeCloseTo(0.5);
    expect(terrainOtherHeight(...t, 0.5, 0.5)).toBeCloseTo(0); // the centre lies on the b–c diagonal: (h10 + h01) / 2
    expect(terrainDrawnHeight(...t, 0.75, 0.25)).toBeCloseTo(0.25);
    expect(terrainOtherHeight(...t, 0.75, 0.25)).toBeCloseTo(0);
    expect(terrainBilinear(...t, 0.75, 0.25)).toBeCloseTo(0.1875);
  });
});
