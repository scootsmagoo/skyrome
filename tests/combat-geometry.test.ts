/** Hit geometry: the weapon's swept arc from the hand against capsules (src/combat/geometry.ts). */
import { describe, expect, it } from 'vitest';
import { DEG } from '../src/core/math';
import { ARC, arcFor, meleeRange, powerDirection, sweepCapsule, type Sweep } from '../src/combat/geometry';

const sweep = (o: Partial<Sweep> = {}): Sweep => ({ x: 0, y: 1.38, z: 0, heading: 0, handDist: 0.55, reach: 0.75, arc: ARC.thrust * DEG, y0: 0.4, y1: 2, ...o });
const body = (x: number, z: number) => ({ x, z, y0: 0.1, y1: 1.8, r: 0.35 });

describe('sweepCapsule', () => {
  it('a gladius thrust reaches a body 1.6 m in front, not one 1.8 m away or behind', () => {
    expect(sweepCapsule(sweep(), body(0, 1.6))).toBeGreaterThanOrEqual(0);
    expect(sweepCapsule(sweep(), body(0, 1.8))).toBe(-1);
    expect(sweepCapsule(sweep(), body(0, -1.2))).toBe(-1);
  });

  it('meleeRange is the centre distance the weapon covers', () => {
    expect(meleeRange(0.75)).toBeCloseTo(1.65, 6);
    expect(sweepCapsule(sweep(), body(0, meleeRange(0.75) - 0.01))).toBeGreaterThanOrEqual(0);
  });

  it('a thrust (50°) misses a target 45° to the side that a cut (110°) and a sweep (140°) catch', () => {
    const side = body(Math.sin(45 * DEG) * 1.3, Math.cos(45 * DEG) * 1.3);
    expect(sweepCapsule(sweep({ arc: arcFor('thrust') }), side)).toBe(-1);
    expect(sweepCapsule(sweep({ arc: arcFor('cut') }), side)).toBeGreaterThanOrEqual(0);
    expect(sweepCapsule(sweep({ arc: arcFor('cut', { sweep: true }) }), side)).toBeGreaterThanOrEqual(0);
  });

  it('the smaller angle wins: a target straight ahead is "more central" than one to the side', () => {
    const s = sweep({ arc: arcFor('cut') });
    expect(sweepCapsule(s, body(0, 1.3))).toBeLessThan(sweepCapsule(s, body(0.9, 1.0)));
  });

  it('the vertical band matters: a blade at chest height does not hit a body lying 0.3 m up', () => {
    expect(sweepCapsule(sweep({ y0: 0.9, y1: 2 }), { x: 0, z: 1.4, y0: 0, y1: 0.4, r: 0.35 })).toBe(-1);
  });
});

describe('power-attack directions (§6.1)', () => {
  it('movement relative to facing: forward, sideways, back, none', () => {
    expect(powerDirection(0, 0, 1)).toBe('forward');
    expect(powerDirection(0, 1, 0)).toBe('sideways');
    expect(powerDirection(0, 0, -1)).toBe('back');
    expect(powerDirection(0, 0, 0)).toBe('none');
  });
});
