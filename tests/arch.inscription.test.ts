import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ATLAS_PAGE, atlasEntry, inscriptionPanel, latinize, layoutLines, paintedSign, shelfPack } from '../src/arch/common/inscription';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { HeightField, friezeBand, hieroglyphFace } from '../src/arch/common/relief';

describe('inscriptions', () => {
  it('writes Latin in Roman capitals with interpuncts', () => {
    expect(latinize('Senatus Populusque Romanus')).toBe('SENATVS · POPVLVSQVE · ROMANVS');
    expect(latinize('Julius  Augustus', true)).toBe('IVLIVS · AVGVSTVS');
    expect(latinize('taberna vinaria', false)).toBe('TABERNA VINARIA');
  });

  it('lays out lines top to bottom inside the margins, first line largest', () => {
    const L = layoutLines(4);
    expect(L.length).toBe(4);
    expect(L[0].size).toBeGreaterThan(L[1].size);
    for (let i = 1; i < L.length; i++) expect(L[i].baseline).toBeGreaterThan(L[i - 1].baseline);
    expect(L[0].baseline - L[0].size).toBeGreaterThanOrEqual(0.12 - 1e-9);
    expect(L[3].baseline).toBeLessThanOrEqual(1 - 0.12 + 1e-9);
    const one = layoutLines(1, [1], 0.1);
    expect(one[0].size).toBeCloseTo(0.8, 6);
  });
});

describe('inscription atlas', () => {
  it('packs rectangles in shelves without overlap and reports a full page', () => {
    const st = { size: 100, x: 0, y: 0, rowH: 0 };
    const placed: [number, number, number, number][] = [];
    for (let i = 0; i < 20; i++) {
      const w = 20 + (i % 3) * 7;
      const h = 10 + (i % 4) * 5;
      const at = shelfPack(st, w, h);
      if (!at) break;
      placed.push([at.x, at.y, w, h]);
    }
    expect(placed.length).toBeGreaterThan(8);
    for (const [x, y, w, h] of placed) expect(x + w <= 100 && y + h <= 100).toBe(true);
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) {
        const [ax, ay, aw, ah] = placed[i];
        const [bx, by, bw, bh] = placed[j];
        expect(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay).toBe(true);
      }
    expect(shelfPack({ size: 100, x: 0, y: 95, rowH: 0 }, 50, 10)).toBeNull();
  });

  it('shop signs share one material per style and page, each with its own UV rectangle', () => {
    const b = new MeshBuilder();
    const names = ['Taberna', 'Pistor', 'Fullonica', 'Thermopolium', 'Lanarius', 'Unguentarius'];
    for (const [i, n] of names.entries()) paintedSign(b, [n, 'Venalis'], 2.4, 0.8, new THREE.Matrix4().makeTranslation(i * 3, 2, 0));
    inscriptionPanel(b, { lines: ['Imp Caesari'], width: 3, height: 0.9, style: 'bronze' });
    inscriptionPanel(b, { lines: ['Senatus Populusque Romanus'], width: 6, height: 1.6, style: 'carved', monumental: true });
    const g = b.build('signs');
    const mats = new Set<THREE.Material>();
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) mats.add(m.material as THREE.Material);
    });
    const names2 = [...mats].map((m) => m.name);
    // six painted signs → one shared painted page; one bronze page; one unique monumental panel
    expect(names2.filter((n) => n.startsWith('inscriptions:painted')).length).toBe(1);
    expect(names2.filter((n) => n.startsWith('inscriptions:bronze')).length).toBe(1);
    expect(names2.filter((n) => n.startsWith('inscription:')).length).toBe(1);
    const rects = names.map((n) => atlasEntry({ lines: [n, 'Venalis'], width: 2.4, height: 0.8, style: 'painted', interpunct: false, sizes: [1, 0.7] }).uv);
    for (const [u0, v0, u1, v1] of rects) {
      expect(u0).toBeGreaterThanOrEqual(0);
      expect(v1).toBeLessThanOrEqual(1);
      expect((u1 - u0) * ATLAS_PAGE).toBeCloseTo(2.4 * 150, -1);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const c = rects[j];
        expect(a[2] <= c[0] || c[2] <= a[0] || a[3] <= c[1] || c[3] <= a[1]).toBe(true);
      }
  });
});

describe('relief height fields', () => {
  it('rasterises primitives and wraps friezes seamlessly', () => {
    const f = new HeightField(32, 16, true);
    f.ellipse(31, 8, 3, 3, 1);
    // wrapped onto the left edge
    expect(f.data[8 * 32 + 1]).toBeGreaterThan(0);
    const band = friezeBand(256, 32, 1);
    expect(Math.max(...band.data)).toBeGreaterThan(0.3);
    // the spiral divider fillet runs along the bottom rows
    expect(band.data[1 * 256 + 100]).toBeGreaterThan(0.2);
  });

  it('carves hieroglyphs (negative heights)', () => {
    const g = hieroglyphFace(64, 256, 3);
    expect(Math.min(...g.data)).toBeLessThan(-0.3);
    expect(Math.max(...g.data)).toBeLessThanOrEqual(0);
  });
});
