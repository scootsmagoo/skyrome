import { describe, expect, it } from 'vitest';
import { blastDamage, GUNS, nextGun, rayCapsule, scatter, shotInterval } from '../src/game/anachronism/weapons';

describe('anachronism guns', () => {
  it('cycles through the guns both ways', () => {
    expect(nextGun(null)).toBe('pistol');
    expect(nextGun('pistol')).toBe('rifle');
    expect(nextGun('rpg')).toBe('pistol');
    expect(nextGun('pistol', -1)).toBe('rpg');
  });

  it('fires the rifle at 10 a second and the RPG once in two', () => {
    expect(shotInterval(GUNS.rifle)).toBeCloseTo(0.1, 6);
    expect(shotInterval(GUNS.rpg)).toBeCloseTo(2, 6);
  });

  it('blast: full at the centre, nothing at the edge, falling in between', () => {
    expect(blastDamage(0, 7, 180)).toBe(180);
    expect(blastDamage(1.4, 7, 180)).toBe(180);
    expect(blastDamage(7, 7, 180)).toBe(0);
    const mid = blastDamage(4, 7, 180);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(180);
    expect(blastDamage(5, 7, 180)).toBeLessThan(mid);
  });

  it('scatters inside the cone and keeps unit length', () => {
    const dir = { x: 0, y: 0, z: -1 };
    for (const [u, v] of [[0, 0], [1, 0.25], [0.5, 0.7], [1, 1]]) {
      const s = scatter(dir, 5, u, v);
      expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(1, 6);
      const ang = (Math.acos(-s.z) * 180) / Math.PI;
      expect(ang).toBeLessThanOrEqual(5 + 1e-6);
    }
    expect(scatter(dir, 0, 1, 1)).toEqual(dir);
  });

  it('hits a standing person, misses one beside the line, and reports the near surface', () => {
    const feet = { x: 0, y: 0, z: -10 };
    const chest = rayCapsule({ x: 0, y: 1.4, z: 0 }, { x: 0, y: 0, z: -1 }, 100, feet, 1.75, 0.3);
    expect(chest).not.toBeNull();
    expect(chest!).toBeCloseTo(9.7, 3);
    expect(rayCapsule({ x: 0.5, y: 1.4, z: 0 }, { x: 0, y: 0, z: -1 }, 100, feet, 1.75, 0.3)).toBeNull();
    expect(rayCapsule({ x: 0, y: 2.2, z: 0 }, { x: 0, y: 0, z: -1 }, 100, feet, 1.75, 0.3)).toBeNull();
    expect(rayCapsule({ x: 0, y: 1.4, z: 0 }, { x: 0, y: 0, z: -1 }, 5, feet, 1.75, 0.3)).toBeNull();
    // From above, on the head.
    const head = rayCapsule({ x: 0, y: 10, z: -10 }, { x: 0, y: -1, z: 0 }, 100, feet, 1.75, 0.3);
    expect(head!).toBeCloseTo(10 - 1.75, 3);
  });
});
