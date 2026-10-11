import { describe, expect, it } from 'vitest';
import { isMidLevel, isMovingCart, compareColumn, compareWall, findSeams, groundBand, isOverhead, severityOf, terrainBilinear, terrainDrawnHeight, terrainOtherHeight } from './collisionRules';

const flat = (y: number, tag = 't') => ({ y, ny: 1, tag });
const under = (y: number, tag = 'u') => ({ y, ny: -1, tag });

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
  it('reports a ledge when the collider is more than a step above the drawn ground', () => {
    const f = compareColumn([flat(10.0, 'paving')], [flat(11.3, 'landmark:x:box')], 9.9)!;
    expect(f.kind).toBe('ledge');
    expect(f.delta).toBeCloseTo(1.3);
  });
  it('reports a sink when a drawn kerb has no collider', () => {
    const f = compareColumn([flat(10.15, 'kerb'), flat(10.0, 'road'), flat(9.9, 'terrain')], [flat(10.0, 'road:trimesh')], 9.9)!;
    expect(f.kind).toBe('sink');
    expect(f.delta).toBeCloseTo(-0.15);
    expect(f.vis).toBe('kerb');
  });
  it('reports a ghost when a drawn counter has no collider at all', () => {
    const f = compareColumn([flat(10.9, 'counter'), flat(9.9, 'terrain')], [flat(9.9, 'terrain:heightfield')], 9.9)!;
    expect(f.kind).toBe('ghost');
    expect(f.delta).toBeCloseTo(-1.0);
  });
  it('does not count an overhead slab (a gallery floor) the player walks under', () => {
    const gallery = [flat(13.2, 'gallery'), under(13.08, 'gallery'), flat(10.0, 'paving')];
    expect(isOverhead(gallery[0], gallery, 10.0)).toBe(true);
    expect(compareColumn(gallery, [flat(10.0, 'paving:trimesh')], 10.0)).toBeNull();
    // A slab too low to walk under is a solid in the way.
    const bench = [flat(10.5, 'bench'), under(10.4, 'bench'), flat(10.0, 'paving')];
    expect(isOverhead(bench[0], bench, 10.0)).toBe(false);
    expect(compareColumn(bench, [flat(10.0, 'paving:trimesh')], 10.0)!.kind).toBe('ghost');
    // A roof plane or an awning (no underside) with nothing drawn below it down to the floor.
    expect(compareColumn([flat(12.9, 'roof'), flat(10.0, 'paving')], [flat(10.0, 'paving:trimesh')], 10.0)).toBeNull();
    // A slab with its underside at head height only clips the head.
    expect(compareColumn([flat(11.9, 'landing'), under(11.7, 'landing'), flat(10.0, 'paving')], [flat(10.0, 'paving:trimesh')], 10.0)!.kind).toBe('low-overhead');
    // A tall drawn solid with surfaces down to the floor is in the way.
    expect(compareColumn([flat(12.4, 'statue head'), flat(11.0, 'shoulder'), flat(10.0, 'paving')], [flat(10.0, 'paving:trimesh')], 10.0)!.kind).toBe('ghost');
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
  it('keeps a surface exactly at the band edge in both lists', () => {
    expect(compareColumn([flat(15.2, 'floor')], [flat(15.2, 'floor:trimesh'), flat(12, 'terrain')], 12)).toBeNull();
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

describe('findSeams', () => {
  it('finds a collider lip where the drawn ground is smooth', () => {
    const s = findSeams([10, 10, 10.05, 10.05], [10, 10, 10, 10]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: 'lip', at: 2 });
    expect(s[0].dPhys).toBeCloseTo(0.05);
  });
  it('finds a crack between two collider pieces', () => {
    const s = findSeams([10, 10, 9.6, 10, 10], [10, 10, 10, 10, 10]);
    expect(s.map((f) => f.kind)).toEqual(['crack']);
  });
  it('reports a drawn step over a smooth collider as a look only', () => {
    expect(findSeams([10, 10, 10], [10, 10, 10.15]).map((f) => f.kind)).toEqual(['drawn-step']);
  });
  it('is quiet where both agree (a kerb with its own collider)', () => {
    expect(findSeams([10, 10, 10.15, 10.15], [10, 10, 10.15, 10.15])).toEqual([]);
  });
  it('accepts a kerb collider a sample or two off the drawn kerb, not more', () => {
    expect(findSeams([10, 10, 10, 10.15, 10.15, 10.15], [10, 10.15, 10.15, 10.15, 10.15, 10.15])).toEqual([]);
    const far = findSeams([10, 10, 10, 10, 10, 10.15, 10.15], [10, 10.15, 10.15, 10.15, 10.15, 10.15, 10.15]);
    expect(far.map((f) => f.kind).sort()).toEqual(['drawn-step', 'lip']);
  });
});

describe('severityOf', () => {
  it('ranks what a player feels first', () => {
    expect(severityOf('fallthrough', 1)).toBe('blocker');
    expect(severityOf('ledge', 1.3, 20)).toBe('major');
    expect(severityOf('sink', 0.05, 40)).toBe('minor');
    expect(severityOf('lip', 0.04)).toBe('minor');
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

describe('false positives dropped (phase 4b G0)', () => {
  it('recognises the mid level and moving carts', () => {
    expect(isMidLevel('city:brick:mid:brick')).toBe(true);
    expect(isMidLevel('city:black:ns:mid:black')).toBe(true);
    expect(isMidLevel('city:brick:full:brick')).toBe(false);
    expect(isMovingCart('?:box')).toBe(true);
    expect(isMovingCart('city:b637:box')).toBe(false);
  });
  it('drops a ghost wall of the drawn mid level and a cart collider', () => {
    expect(compareWall(null, { dist: 2, tag: 'city:brick:mid:brick' }, 5)).toBeNull();
    expect(compareWall(null, { dist: 2, tag: 'city:brick:full:brick' }, 5)!.kind).toBe('ghost');
    expect(compareWall({ dist: 1, tag: '?:box' }, null, 5)).toBeNull();
    expect(compareWall({ dist: 1, tag: 'city:b1:box' }, null, 5)!.kind).toBe('invisible');
  });
  it('drops a column ghost of the mid level and a cart ledge', () => {
    expect(compareColumn([flat(11, 'city:black:ns:mid:black'), flat(9.9, 'terrain')], [flat(9.9, 'terrain:heightfield')], 9.9)).toBeNull();
    expect(compareColumn([flat(10.0, 'paving')], [flat(11.8, '?:box')], 9.9)).toBeNull();
  });
});
