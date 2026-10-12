import { describe, expect, it } from 'vitest';
import { stickAxes } from './TouchControls';

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
