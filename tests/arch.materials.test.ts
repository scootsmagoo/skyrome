import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getMaterial } from '../src/gfx/materials';
import { MATERIAL_BASE, MATERIAL_IDS } from '../src/gfx/materialIds';
import { MATERIAL_RECIPES, TEXTURE_STATS, UV_METERS, repeatFor, roughnessFactor, tintFor } from '../src/gfx/textures/catalog';
import { fbm2D, heightToNormal, valueNoise2D } from '../src/gfx/textures/noise';
import { generateProcedural } from '../src/gfx/textures/procedural';

const root = join(__dirname, '..');

function dirSize(dir: string): number {
  let n = 0;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const s = statSync(p);
    n += s.isDirectory() ? dirSize(p) : s.size;
  }
  return n;
}

describe('material catalog', () => {
  it('has a recipe for every material id; photo sets exist on disk with stats', () => {
    for (const id of MATERIAL_IDS) {
      const r = MATERIAL_RECIPES[id];
      expect(r).toBeDefined();
      if (r.set) {
        expect(TEXTURE_STATS[r.set]).toBeDefined();
        for (const f of ['color.jpg', 'normal.jpg', 'arm.jpg']) expect(existsSync(join(root, 'public/textures', r.set, f))).toBe(true);
      }
    }
  });

  it('covers the required surfaces with photo textures', () => {
    const required = ['marble', 'marble_veined', 'tufa', 'peperino', 'basalt', 'rock', 'brick', 'concrete', 'plaster_white', 'plaster_cream', 'plaster_ochre', 'plaster_red', 'plaster_dark', 'roof_tile', 'wood', 'wood_dark', 'paving_basalt', 'paving_travertine', 'cobbles', 'gravel', 'dirt', 'grass', 'dry_grass', 'sand', 'mud', 'bark'] as const;
    for (const id of required) expect(MATERIAL_RECIPES[id].set, id).toBeTruthy();
    // reticulatum and travertine are procedural (no CC0 scan shows Roman ashlar: the travertine
    // scans are modern polished vein-cut tiles), and so are fabrics, mosaic, painted stucco, metals
    for (const id of ['reticulatum', 'travertine', 'fabric_red', 'mosaic', 'stucco_painted', 'gilded_bronze'] as const) expect(MATERIAL_RECIPES[id].proc, id).toBeTruthy();
  });

  it('stays within the texture download budget', () => {
    // A session downloads the compressed sets (KTX2) for the material library, plus the JPEGs of
    // the terrain's ground layers; the other JPEGs are only a fallback if the KTX2 path fails.
    const sizeOf = (ext: string) => {
      let n = 0;
      for (const set of readdirSync(join(root, 'public/textures'))) {
        const dir = join(root, 'public/textures', set);
        if (!statSync(dir).isDirectory() || set === 'people') continue;
        for (const f of readdirSync(dir)) if (f.endsWith(ext)) n += statSync(join(dir, f)).size;
      }
      return n;
    };
    expect(sizeOf('.ktx2')).toBeLessThan(26 * 1024 * 1024);
    expect(sizeOf('.jpg')).toBeLessThan(14 * 1024 * 1024);
    // The character body maps (public/textures/people) have their own budget (docs/modules/avatar-real.md).
    expect(dirSize(join(root, 'public/textures')) - dirSize(join(root, 'public/textures/people'))).toBeLessThan(40 * 1024 * 1024);
  });

  it('tiles textures at real-world size', () => {
    // box UVs are one unit per 2 m: a 1.1 m brick texture repeats 2/1.1 times per unit
    expect(UV_METERS).toBe(2);
    const [u, v] = repeatFor({ tile: 1.1 });
    expect(u).toBeCloseTo(2 / 1.1);
    expect(v).toBeCloseTo(2 / 1.1);
    const [tu, tv] = repeatFor(MATERIAL_RECIPES.travertine);
    expect(tu).toBeLessThan(tv); // anisotropic: pores stretched horizontally
  });

  it('normalises tints so the average albedo hits the palette colour', () => {
    const t = tintFor([0.5, 0.25, 0.1], [0.25, 0.25, 0.25]);
    expect(t[0] * 0.5).toBeCloseTo(0.25);
    expect(t[1] * 0.25).toBeCloseTo(0.25);
    expect(t[2]).toBeLessThanOrEqual(6); // clamped
    expect(roughnessFactor(0.45, 0.9) * 0.9).toBeCloseTo(0.45);
  });

  it('getMaterial is synchronous, cached and flat in Node', () => {
    const a = getMaterial('marble');
    expect(a).toBe(getMaterial('marble'));
    expect((a as THREE.MeshStandardMaterial).color.getHex()).toBe(new THREE.Color(MATERIAL_BASE.marble.color).getHex());
  });
});

describe('procedural textures', () => {
  it('noise is tileable', () => {
    const n = valueNoise2D(3, 8, 4);
    for (const y of [0.2, 1.7, 3.3]) expect(n(0, y)).toBeCloseTo(n(8, y), 9);
    expect(n(2.5, 0)).toBeCloseTo(n(2.5, 4), 9);
    const f = fbm2D(9, 4, 4, 0.5, 2);
    expect(f(0, 0.3)).toBeCloseTo(f(1, 0.3), 9);
    expect(f(0.3, 0)).toBeCloseTo(f(0.3, 1), 9);
  });

  it('a flat height field gives straight-up normals', () => {
    const n = heightToNormal(new Float32Array(16), 4, 4);
    expect([n[0], n[1], n[2], n[3]]).toEqual([128, 128, 255, 255]);
  });

  it('a slope rising along +u tilts the normal towards −u', () => {
    const w = 8;
    const h = new Float32Array(w * w);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) h[y * w + x] = x;
    const n = heightToNormal(h, w, w, 0.5);
    const i = (3 * w + 3) * 4;
    expect(n[i]).toBeLessThan(128);
    expect(Math.abs(n[i + 1] - 128)).toBeLessThan(2);
  });

  it('every generator produces sane images', () => {
    for (const id of ['fabric', 'mosaic', 'stucco', 'gilded', 'bronze', 'metal', 'porphyry', 'reticulatum', 'travertine', 'foliage'] as const) {
      const img = generateProcedural(id);
      expect(img.color.length).toBe(img.size * img.size * 4);
      for (const a of img.albedo) {
        expect(a).toBeGreaterThan(0.005);
        expect(a).toBeLessThan(1);
      }
      expect(img.roughness).toBeGreaterThan(0.05);
      expect(img.roughness).toBeLessThanOrEqual(1);
    }
  });
});
