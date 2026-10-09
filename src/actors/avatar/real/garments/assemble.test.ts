import { describe, expect, it } from 'vitest';
import { assembleBody } from './assemble';
import type { BodyPaint } from './paint';

/** A strip of 2 x 4 vertices (three quads, six triangles) along y, the upper two rows cloth. */
function strip() {
  const n = 8;
  const position = new Float32Array(n * 3);
  const normal = new Float32Array(n * 3);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 2; c++) {
      const v = r * 2 + c;
      position.set([c * 0.1, r * 0.1, 0], v * 3);
      normal.set([0, 0, 1], v * 3);
    }
  const index: number[] = [];
  for (let r = 0; r < 3; r++) {
    const a = r * 2, b = a + 1, c = a + 2, d = a + 3;
    index.push(a, b, d, a, d, c);
  }
  const skinIndex = new Uint8Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) skinWeight[v * 4] = 1;
  const cloth = new Uint8Array([0, 0, 0, 0, 1, 1, 1, 1]);
  const surf = new Uint8Array(n * 4);
  for (let v = 0; v < n; v++) surf.set(cloth[v] ? [200, 0, 3, 0] : [180, 0, 8, 0], v * 4);
  const paint: BodyPaint = {
    color: new Float32Array(n * 3).fill(0.5),
    surf,
    thick: new Float32Array(n).fill(0.01),
    cloth,
    cover: Float32Array.from([0, 0, 0.2, 0.2, 0.9, 0.9, 1, 1]),
    torso: { y0: 0, y1: 0.3, at: () => ({ a: 0.1, zc: 0, bf: 0.05, bb: 0.05 }) },
  };
  return { position, normal, skinIndex, skinWeight, index, paint };
}

describe('assembleBody', () => {
  it('split layout: cloth group on offset copies, skin group on the original vertices', () => {
    const s = strip();
    const a = assembleBody({ ...s, split: true });
    const g = a.geometry;
    expect(a.count).toBe(8);
    expect(g.groups.length).toBe(2);
    // The cloth group first (material 1), then the skin group (material 0).
    expect(g.groups[0].materialIndex).toBe(1);
    expect(g.groups[1].materialIndex).toBe(0);
    // Cloth triangles are those touching a cloth vertex: the top two quads' worth of the strip (4 triangles).
    expect(g.groups[0].count).toBe(4 * 3);
    // Copies come after the template vertices and point back at their source.
    const pos = g.getAttribute('position');
    expect(pos.count).toBeGreaterThan(8);
    for (let j = 0; j < a.source.length; j++) expect(a.source[j]).toBeGreaterThanOrEqual(0);
    // A copy of a cloth vertex stands off the surface by the thickness (normal +z).
    const idx = g.index!;
    const first = idx.getX(0);
    expect(first).toBeGreaterThanOrEqual(8);
    expect(pos.getZ(first)).toBeGreaterThanOrEqual(0.003 - 1e-6);
    // Skin vertices are never offset.
    for (let v = 0; v < 8; v++) expect(pos.getZ(v)).toBe(0);
    // The cover attribute is carried onto the copies.
    const cov = g.getAttribute('cover');
    for (let j = 0; j < a.source.length; j++) expect(cov.getX(8 + j)).toBeCloseTo(s.paint.cover![a.source[j]], 6);
  });

  it('skin triangles wholly under cloth are dropped', () => {
    const s = strip();
    s.paint.cover = Float32Array.from([0, 0, 0.2, 0.2, 1, 1, 1, 1]);
    const a = assembleBody({ ...s, split: true });
    // Of 6 triangles, the top quad (two, all cloth, all cover > 0.9) is not in the skin group.
    expect(a.geometry.groups[1].count).toBe(4 * 3);
  });

  it('hidden vertices (shells) drop their triangles from both groups', () => {
    const s = strip();
    const hide = new Uint8Array(8);
    hide[4] = hide[5] = hide[6] = hide[7] = 1;
    const a = assembleBody({ ...s, hide, split: true });
    const total = a.geometry.groups[0].count + a.geometry.groups[1].count;
    // The top quad (2 triangles) is gone; the middle quad (2 triangles) has 2 of 4 vertices hidden per triangle.
    expect(total / 3).toBeLessThan(6 + 4);
  });

  it('flat layout: one draw, cloth vertices offset in place', () => {
    const s = strip();
    const a = assembleBody({ ...s, split: false });
    expect(a.geometry.groups.length).toBe(0);
    expect(a.geometry.index!.count).toBe(6 * 3);
    const pos = a.geometry.getAttribute('position');
    expect(pos.getZ(0)).toBe(0);
    expect(pos.getZ(7)).toBeCloseTo(0.01, 6);
    expect(a.geometry.getAttribute('cover')).toBeUndefined();
  });

  it('a triangle whose vertices disagree on the material gets one material', () => {
    const s = strip();
    // Row 2 is a different garment from row 3.
    for (const v of [4, 5]) s.paint.surf.set([100, 0, 5, 0], v * 4);
    const a = assembleBody({ ...s, split: true });
    const surf = a.geometry.getAttribute('surf');
    const idx = a.geometry.index!;
    for (let t = 0; t < a.geometry.groups[0].count; t += 3) {
      const pats = [0, 1, 2].map((k) => Math.round(surf.getZ(idx.getX(t + k)) * 255));
      expect(new Set(pats).size).toBe(1);
    }
  });
});
