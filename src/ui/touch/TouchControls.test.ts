import { describe, expect, it } from 'vitest';
import { inStickArea, stickAxes } from './TouchControls';

describe('touch thumbstick', () => {
  it('reads a centred thumb as still and a full push as 1', () => {
    expect(stickAxes(3, -2, 56)).toEqual({ x: 0, z: 0 });
    const up = stickAxes(0, -56, 56);
    expect(up.x).toBeCloseTo(0);
    expect(up.z).toBeCloseTo(-1);
    const diag = stickAxes(40, 40, 56);
    expect(Math.hypot(diag.x, diag.z)).toBeCloseTo(1, 3);
  });

  it('gives a part push under 1 (walking) and caps an overshoot at 1', () => {
    const half = stickAxes(28, 0, 56);
    expect(half.x).toBeGreaterThan(0.3);
    expect(half.x).toBeLessThan(0.55);
    expect(stickAxes(-200, 0, 56).x).toBeCloseTo(-1);
  });
});

describe('touch stick area', () => {
  it('upright: the lower left half; sideways: the lower left 45 %', () => {
    // An upright iPhone (393 x 852): the bottom left corner moves, the right half and the top look.
    expect(inStickArea(70, 760, 393, 852)).toBe(true);
    expect(inStickArea(180, 500, 393, 852)).toBe(true);
    expect(inStickArea(260, 760, 393, 852)).toBe(false);
    expect(inStickArea(70, 200, 393, 852)).toBe(false);
    // Sideways (852 x 393).
    expect(inStickArea(200, 300, 852, 393)).toBe(true);
    expect(inStickArea(500, 300, 852, 393)).toBe(false);
  });
});
