import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GAP, separateCoplanar } from '../src/gfx/coplanar';

/** A 2 × 2 m square facing +y at height y (two triangles, non-indexed). */
function square(y: number, x0 = 0): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(2, 2).toNonIndexed();
  g.rotateX(-Math.PI / 2);
  g.translate(x0 + 1, y, 1);
  return g;
}
const top = (g: THREE.BufferGeometry) => g.getAttribute('position').getY(0);

describe('separateCoplanar', () => {
  it('sinks the earlier of two coplanar faces of different materials', () => {
    const wall = square(1), coping = square(1);
    const moved = separateCoplanar([
      { geometry: wall, material: 'brick', seq: 1 },
      { geometry: coping, material: 'travertine', seq: 2 },
    ]);
    expect(moved).toBe(2);
    expect(top(coping)).toBeCloseTo(1);
    expect(top(wall)).toBeCloseTo(1 - GAP);
  });

  it('keeps a face that is already clearly in front, even if older', () => {
    const decal = square(1.002), wall = square(1);
    separateCoplanar([
      { geometry: decal, material: 'plaster_red', seq: 1 },
      { geometry: wall, material: 'plaster_white', seq: 2 },
    ]);
    expect(top(decal)).toBeCloseTo(1.002);
    expect(top(wall)).toBeCloseTo(1.002 - GAP);
  });

  it('leaves same-material, distant and merely touching faces alone', () => {
    const a = square(1), b = square(1), c = square(1.5), d = square(1, 2);
    expect(separateCoplanar([
      { geometry: a, material: 'brick', seq: 1 },
      { geometry: b, material: 'brick', seq: 2 },
      { geometry: c, material: 'marble', seq: 3 },
      { geometry: d, material: 'marble', seq: 4 },
    ])).toBe(0);
  });
});
