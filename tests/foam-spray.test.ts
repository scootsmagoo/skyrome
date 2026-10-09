import { describe, expect, it } from 'vitest';
import { addFoamObstacle, clearFoamObstacles, foamObstacles, foamUniforms } from '../src/world/water/foam';
import { clearSpray, registerSpray, sprayPointCount } from '../src/world/city/spray';

const ob = (x: number) => ({ x, z: 0, dx: 1, dz: 0, hl: 1, hw: 1 });

describe('foam obstacle owners', () => {
  it('clearing one owner keeps the others', () => {
    clearFoamObstacles();
    addFoamObstacle(ob(1), 'bridge');
    addFoamObstacle(ob(2), 'quay');
    addFoamObstacle(ob(3), 'bridge');
    clearFoamObstacles('bridge');
    expect(foamObstacles().map((o) => o.x)).toEqual([2]);
    expect(foamUniforms.uFoamCount.value).toBe(1);
    expect(foamUniforms.uFoamA.value[0].x).toBe(2);
    clearFoamObstacles();
    expect(foamObstacles().length).toBe(0);
  });
});

describe('fountain spray registry', () => {
  it('dedupes by id', () => {
    clearSpray();
    registerSpray('a', 1, 2, 3);
    registerSpray('a', 1, 2, 3);
    registerSpray('b', 4, 5, 6);
    expect(sprayPointCount()).toBe(2);
    clearSpray();
  });
});
