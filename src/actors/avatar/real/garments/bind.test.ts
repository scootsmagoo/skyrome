import { describe, expect, it } from 'vitest';
import { PARENT_INDEX, B } from '../../rig';
import { TriGrid, adjacency, bindGarment, closestOnTri, coverMask, fitGarment, topFour, transferWeights, weldMap, type NearestHit } from './bind';
import { skirtRule } from './fit';

/** A UV sphere (radius r, centre c) with outward normals; optional vertical squash. */
function sphere(r: number, rings = 16, segs = 24, c = [0, 0, 0], sy = 1) {
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    const ph = v * Math.PI;
    for (let i = 0; i <= segs; i++) {
      const th = (i / segs) * Math.PI * 2;
      const x = Math.sin(ph) * Math.cos(th);
      const y = Math.cos(ph);
      const z = Math.sin(ph) * Math.sin(th);
      pos.push(c[0] + x * r, c[1] + y * r * sy, c[2] + z * r);
      nrm.push(x, y, z);
    }
  }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i;
      const b = a + segs + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  return { position: new Float32Array(pos), normal: new Float32Array(nrm), index: new Uint32Array(idx) };
}

describe('nearest points and rays', () => {
  const tri = { pos: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), idx: [0, 1, 2] };
  it('projects inside the triangle and clamps to edges and corners', () => {
    const h: NearestHit = { tri: 0, u: 0, v: 0, d2: 0 };
    closestOnTri(tri.pos, tri.idx, 0, 0.25, 0.25, 0.5, h);
    expect(h.u).toBeCloseTo(0.25);
    expect(h.v).toBeCloseTo(0.25);
    expect(h.d2).toBeCloseTo(0.25);
    closestOnTri(tri.pos, tri.idx, 0, 2, -1, 0, h);
    expect([h.u, h.v]).toEqual([1, 0]);
    closestOnTri(tri.pos, tri.idx, 0, 0.5, -1, 0, h);
    expect(h.u).toBeCloseTo(0.5);
    expect(h.v).toBeCloseTo(0);
  });

  it('the grid finds the same nearest point as brute force', () => {
    const s = sphere(0.3, 12, 18, [0.1, 1, -0.2]);
    const g = new TriGrid(s.position, s.index, 0.05);
    const h: NearestHit = { tri: 0, u: 0, v: 0, d2: 0 };
    const b: NearestHit = { tri: 0, u: 0, v: 0, d2: 0 };
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let k = 0; k < 60; k++) {
      const p = [0.1 + rnd() * 0.6, 1 + rnd() * 0.6, -0.2 + rnd() * 0.6];
      expect(g.nearest(p[0], p[1], p[2], 2, h)).toBe(true);
      let best = Infinity;
      for (let t = 0; t < s.index.length / 3; t++) {
        closestOnTri(s.position, s.index, t, p[0], p[1], p[2], b);
        best = Math.min(best, b.d2);
      }
      expect(h.d2).toBeCloseTo(best, 9);
    }
  });

  it('casts rays against the mesh', () => {
    const s = sphere(0.5, 16, 24);
    const g = new TriGrid(s.position, s.index, 0.06);
    // From the centre outward: the shell at ~0.5 (chords of the tessellation are a little inside).
    const t = g.raycast(0, 0, 0, 1, 0, 0, 2);
    expect(t).toBeGreaterThan(0.48);
    expect(t).toBeLessThanOrEqual(0.5001);
    expect(g.raycast(0.8, 0, 0, 1, 0, 0, 2)).toBe(-1);
  });
});

describe('binding a garment to a body', () => {
  const body = sphere(0.5, 20, 30);
  const grid = new TriGrid(body.position, body.index, 0.05);
  // The garment: a shell 3 cm out over the upper half.
  const shell = sphere(0.53, 10, 16);

  it('fits back exactly onto the body it was bound to', () => {
    const b = bindGarment(shell, body, grid);
    const out = { position: new Float32Array(shell.position.length), normal: new Float32Array(shell.normal.length) };
    fitGarment(b, body, body.index, out);
    for (let i = 0; i < shell.position.length; i++) expect(out.position[i]).toBeCloseTo(shell.position[i], 5);
    for (let i = 0; i < shell.normal.length; i++) expect(out.normal[i]).toBeCloseTo(shell.normal[i], 4);
  });

  it('follows a bigger body at the same distance off it', () => {
    const b = bindGarment(shell, body, grid);
    const big = sphere(0.65, 20, 30);
    const out = { position: new Float32Array(shell.position.length), normal: new Float32Array(shell.normal.length) };
    fitGarment(b, big, body.index, out);
    for (let v = 0; v < shell.position.length / 3; v++) {
      const r = Math.hypot(out.position[v * 3], out.position[v * 3 + 1], out.position[v * 3 + 2]);
      // 0.65 + 0.03, give or take the chords of the tessellations.
      expect(r).toBeGreaterThan(0.665);
      expect(r).toBeLessThan(0.69);
    }
  });

  it('keeps cloth close to a body that changes shape (a squashed sphere)', () => {
    const b = bindGarment(shell, body, grid);
    const flat = sphere(0.5, 20, 30, [0, 0, 0], 0.7);
    const out = { position: new Float32Array(shell.position.length), normal: new Float32Array(shell.normal.length) };
    fitGarment(b, flat, body.index, out);
    for (let v = 0; v < shell.position.length / 3; v++) {
      const x = out.position[v * 3];
      const y = out.position[v * 3 + 1];
      const z = out.position[v * 3 + 2];
      // Outside the squashed body (x^2/a^2 + y^2/b^2 + z^2/a^2 > 1), and not far from it.
      const e = (x * x + z * z) / 0.25 + (y * y) / (0.35 * 0.35);
      expect(e).toBeGreaterThan(1);
      expect(e).toBeLessThan(1.35);
    }
  });

  it('welds split vertices and builds their adjacency', () => {
    const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0]);
    const w = weldMap(pos);
    expect(Array.from(w)).toEqual([0, 1, 2, 1]);
    const adj = adjacency([0, 1, 2, 0, 3, 2], w);
    const nb = (i: number) => Array.from(adj.list.slice(adj.start[i], adj.start[i + 1])).sort();
    expect(nb(0)).toEqual([1, 2]);
    expect(nb(1)).toEqual([0, 2]);
  });
});

describe('skin weights for a garment', () => {
  // Body: a sphere whose upper half is weighted to the chest, lower half to the left thigh.
  const body = sphere(0.5, 20, 30);
  const n = body.position.length / 3;
  const skinIndex = new Uint8Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const up = body.position[v * 3 + 1] > 0;
    skinIndex[v * 4] = up ? B.chest : B.forearmL;
    skinWeight[v * 4] = 1;
  }
  const grid = new TriGrid(body.position, body.index, 0.05);
  const shell = sphere(0.53, 10, 16);
  const b = bindGarment(shell, body, grid);

  it('transfers, remaps to allowed bones and normalises', () => {
    const allowed = new Set([B.chest, B.upperArmL]);
    const w = transferWeights(b, { skinIndex, skinWeight }, body.index, 25, { allowed: (x) => allowed.has(x), parent: PARENT_INDEX, passes: 2 });
    for (let v = 0; v < b.n; v++) {
      let t = 0;
      for (let k = 0; k < 4; k++) {
        t += w.skinWeight[v * 4 + k];
        if (w.skinWeight[v * 4 + k] > 0) expect(allowed.has(w.skinIndex[v * 4 + k])).toBe(true);
      }
      expect(t).toBeCloseTo(1, 5);
      const y = shell.position[v * 3 + 1];
      // The forearm's weight went up the chain to the upper arm.
      if (y > 0.25) expect(w.skinIndex[v * 4]).toBe(B.chest);
      if (y < -0.25) expect(w.skinIndex[v * 4]).toBe(B.upperArmL);
    }
  });

  it('keeps the four largest', () => {
    const row = new Float32Array(25);
    row[3] = 0.1;
    row[5] = 0.4;
    row[7] = 0.2;
    row[9] = 0.05;
    row[11] = 0.25;
    const si = new Uint8Array(4);
    const sw = new Float32Array(4);
    topFour(row, si, sw, 0);
    expect(Array.from(si)).toEqual([5, 11, 7, 3]);
    expect(sw[0] + sw[1] + sw[2] + sw[3]).toBeCloseTo(1, 6);
  });

  it('the skirt rule blends hips to the thigh on its side down the skirt', () => {
    const w = new Float32Array(25);
    skirtRule(0.1, 1.0, 1.0, 0.1, 0.17, 0.6, 0.4, w);
    expect(w[B.hips] + w[B.spine]).toBeCloseTo(1, 5);
    skirtRule(0.12, 0.15, 1.0, 0.1, 0.17, 0.6, 0.4, w);
    let t = 0;
    for (const x of w) t += x;
    expect(t).toBeCloseTo(1, 5);
    expect(w[B.thighL] + w[B.shinL]).toBeGreaterThan(w[B.thighR] + w[B.shinR]);
    expect(w[B.shinL]).toBeGreaterThan(0);
    skirtRule(0, 0.5, 1.0, 0.1, 0.17, 0.6, 0, w);
    expect(w[B.thighL]).toBeCloseTo(w[B.thighR], 5);
  });
});

describe('the skin a garment covers', () => {
  const body = sphere(0.5, 20, 30);
  const cap = sphere(0.53, 12, 20);
  // Keep only the triangles of the upper half of the garment (y > 0.1): a cap.
  const keep: number[] = [];
  for (let t = 0; t < cap.index.length; t += 3) {
    const ys = [0, 1, 2].map((k) => cap.position[cap.index[t + k] * 3 + 1]);
    if (Math.min(...ys) > 0.1) keep.push(cap.index[t], cap.index[t + 1], cap.index[t + 2]);
  }
  const g = new TriGrid(cap.position, keep, 0.05);

  it('hides skin well under the cloth, not at its edge or outside it', () => {
    const hide = coverMask(body, g, { maxDist: 0.1, eligible: () => true });
    for (let v = 0; v < body.position.length / 3; v++) {
      const y = body.position[v * 3 + 1];
      if (y > 0.4) expect(hide[v]).toBe(1);
      if (y < 0.1) expect(hide[v]).toBe(0);
    }
  });

  it('respects eligibility', () => {
    const hide = coverMask(body, g, { maxDist: 0.1, eligible: () => false });
    expect(hide.reduce((a, x) => a + x, 0)).toBe(0);
  });
});
