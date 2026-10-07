import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { MATERIAL_IDS } from '../src/gfx/materialIds';
import { Draw } from '../src/arch/fabric/draw';
import { domus } from '../src/arch/fabric/domus';
import { horrea } from '../src/arch/fabric/horrea';
import { insula, MAX_BUILDING_HEIGHT } from '../src/arch/fabric/insula';
import { roof } from '../src/arch/fabric/roof';
import { buildPlaza, buildStairs, buildStreet } from '../src/arch/fabric/streets';
import type { BuildingOutput } from '../src/arch/fabric/types';

function tris(b: MeshBuilder) {
  const g = b.build('t');
  let n = 0;
  for (const c of g.children) n += (c as THREE.Mesh).geometry.getAttribute('position').count / 3;
  return { n, meshes: g.children as THREE.Mesh[] };
}

function sane(out: BuildingOutput, maxTris: number) {
  const { n, meshes } = tris(out.builder);
  expect(n).toBeGreaterThan(500);
  expect(n).toBeLessThan(maxTris);
  for (const m of meshes) {
    // Library materials, or the shared atlas pages of painted notices (fabric/notices.ts).
    const mat = m.name.split(':')[1];
    if (mat !== 'inscriptions') expect(MATERIAL_IDS).toContain(mat);
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i += 97) expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
    expect(m.geometry.getAttribute('uv')).toBeTruthy();
  }
  expect(out.builder.colliders.length).toBeGreaterThan(3);
}

describe('buildings', () => {
  it('insula: storeys clamp to Trajan’s 60-foot limit, deterministic output', () => {
    const a = insula({ width: 16, depth: 14, seed: 4, storeys: 6 });
    expect(a.height).toBeLessThanOrEqual(MAX_BUILDING_HEIGHT);
    expect(a.height).toBeGreaterThan(12);
    sane(a, 60000);
    const b = insula({ width: 16, depth: 14, seed: 4, storeys: 6 });
    expect(tris(b.builder).n).toBe(tris(insula({ width: 16, depth: 14, seed: 4, storeys: 6 }).builder).n);
  });

  it('insula: open shops get door + workshop spots facing the street', () => {
    const a = insula({ width: 18, depth: 15, seed: 2, openShopChance: 1, bays: ['thermopolium', 'stair', 'bakery', 'wine'] });
    const doors = a.spots.filter((s) => s.kind === 'shopDoor');
    expect(doors.map((d) => d.tag).sort()).toEqual(['bakery', 'thermopolium', 'wine']);
    for (const d of doors) {
      expect(d.position.z).toBeLessThan(-7.5); // in front of the facade (front at z = −7.5)
      expect(Math.cos(d.facing)).toBeCloseTo(-1); // facing −z, the street
    }
    expect(a.spots.some((s) => s.kind === 'houseDoor' && s.tag === 'stair')).toBe(true);
  });

  it('insula variants: courtyard, portico, sloping ground', () => {
    sane(insula({ width: 22, depth: 22, seed: 5, courtyard: true }), 80000);
    sane(insula({ width: 18, depth: 16, seed: 6, portico: true }), 60000);
    const sloped = insula({ width: 20, depth: 14, seed: 7, groundAt: (x) => -0.08 * (x + 10) });
    sane(sloped, 60000);
    // The foundation reaches below the lowest ground under the footprint.
    const g = sloped.builder.build('s');
    const box = new THREE.Box3().setFromObject(g);
    expect(box.min.y).toBeLessThan(-1.6 - 0.3);
  });

  it('domus and horrea build sensibly', () => {
    const d = domus({ width: 18, depth: 32, seed: 3 });
    sane(d, 60000);
    expect(d.spots.some((s) => s.kind === 'houseDoor' && s.tag === 'domus')).toBe(true);
    expect(d.spots.some((s) => s.kind === 'tree')).toBe(true);
    const h = horrea({ width: 30, depth: 26, seed: 1 });
    sane(h, 60000);
  });
});

describe('roofs', () => {
  it('hip roof ridge height follows the pitch', () => {
    const b = new MeshBuilder();
    const p = (20 * Math.PI) / 180;
    const r = roof(new Draw(b), { kind: 'hip', w: 12, d: 8, y: 10, pitch: p });
    expect(r.top).toBeCloseTo(10 + 4 * Math.tan(p), 5);
    const g = b.build('r');
    const box = new THREE.Box3().setFromObject(g);
    expect(box.max.x).toBeGreaterThan(6.3); // overhang
    expect(box.max.y).toBeLessThan(r.top + 0.25);
  });

  it('compluviate ring roof slopes down toward the opening', () => {
    const b = new MeshBuilder();
    const r = roof(new Draw(b), { kind: 'ring', w: 14, d: 12, y: 7, inner: { w: 4, d: 3 }, ridgeAt: 0.2 });
    expect(r.innerEave).toBeLessThan(7);
    expect(r.top).toBeGreaterThan(7);
  });
});

describe('streets', () => {
  const H = (x: number, z: number) => 0.04 * x + 0.02 * z + Math.sin(z / 7);

  it('paved street follows the terrain with raised sidewalks', () => {
    const b = new MeshBuilder();
    const res = buildStreet(b, { points: [[0, 0], [0, 60], [20, 90]], roadWidth: 5, sidewalk: 2, curb: 0.3, lift: 0.06 }, H);
    expect(res.length).toBeCloseTo(60 + Math.hypot(20, 30), 3);
    const g = b.build('s');
    const road = g.children.find((c) => c.name.endsWith('paving_basalt')) as THREE.Mesh;
    const side = g.children.find((c) => c.name.endsWith('cobbles')) as THREE.Mesh;
    const check = (m: THREE.Mesh, lo: number, hi: number) => {
      const p = m.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const d = p.getY(i) - H(p.getX(i), p.getZ(i));
        expect(d).toBeGreaterThanOrEqual(lo - 1e-4);
        expect(d).toBeLessThanOrEqual(hi + 1e-4);
      }
    };
    check(road, 0.06, 0.06 + 0.08);
    check(side, -0.6, 0.36); // top at curb height; end caps reach below
    expect(b.colliders.some((c) => c.kind === 'trimesh')).toBe(true);
    expect(b.colliders.filter((c) => c.kind === 'box').length).toBeGreaterThan(0); // stepping stones
  });

  it('plaza drapes over the terrain and stairs climb in ~17 cm risers', () => {
    const b = new MeshBuilder();
    buildPlaza(b, [[0, 0], [10, 0], [10, 8], [4, 12], [0, 8]], H, { lift: 0.07, skirt: 0 });
    const m = b.build('p').children[0] as THREE.Mesh;
    const p = m.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) expect(p.getY(i) - H(p.getX(i), p.getZ(i))).toBeCloseTo(0.07, 5);
    const s = new MeshBuilder();
    const steep = (x: number) => x * 0.25;
    buildStairs(s, [0, 0], [16, 0], 3, (x) => steep(x), { parapet: null });
    const steps = (s.build('st').children[0] as THREE.Mesh).geometry.getAttribute('position').count / 36;
    expect(steps).toBe(Math.ceil(4 / 0.17));
    expect(s.colliders.length).toBe(1); // smooth ramp collider
  });
});

describe('closed walls', () => {
  it('domus side walls have no see-through slots', () => {
    const W = 18, D = 32;
    const g = domus({ width: W, depth: D, seed: 9 }).builder.build('d');
    g.updateMatrixWorld(true);
    const rc = new THREE.Raycaster();
    for (const s of [-1, 1]) {
      for (let z = -D / 2 + 0.3; z < D / 2 - 0.3; z += 0.35) {
        for (const y of [1.5, 3]) {
          rc.set(new THREE.Vector3(s * (W / 2 + 3), y, z), new THREE.Vector3(-s, 0, 0));
          const h = rc.intersectObject(g, true)[0];
          expect(h && Math.abs(h.point.x) > W / 2 - 0.1, `side ${s} z=${z.toFixed(2)} y=${y}`).toBe(true);
        }
      }
    }
  });
});
