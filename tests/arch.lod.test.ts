/**
 * Far LOD (detail 'far', research §1.8 LOD2: 1–4k triangles per building) and the instanced,
 * indexed geometry that keeps a city of columns in memory.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { caveaFarProfile, caveaSection, type AmphitheatreSpec } from '../src/arch/classical/amphitheatre';
import { amphitheatreFar, arcadeFacadeTexture, colonnadeTexture, seatRowsTexture } from '../src/arch/classical/amphitheatreFar';
import { colosseumStoreys, triumphalArch } from '../src/arch/classical/arch';
import { column } from '../src/arch/classical/column';
import { ORDERS, diameterForHeight } from '../src/arch/classical/orders';
import { porticus } from '../src/arch/classical/porticus';
import { temple } from '../src/arch/classical/temple';
import { tholos } from '../src/arch/classical/tholos';
import { MeshBuilder } from '../src/gfx/MeshBuilder';

/** Drawn triangles (instances counted per placement). */
function triangles(b: MeshBuilder): number {
  let n = 0;
  b.build('t').traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    n += ((m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
  });
  return n;
}

const K = 0.6;
const AMPH: AmphitheatreSpec = {
  facade: { rx: 94 * K, rz: 78 * K, bays: 80, storeys: colosseumStoreys(K), depth: 2.4 * K, corridor: 6 * K, material: 'travertine', detail: 'far', masts: true },
  cavea: {
    arenaRx: 43 * K,
    arenaRz: 27 * K,
    podium: 4 * K,
    tiers: [{ rows: 6, rise: 0.4, depth: 0.7 }, { rows: 9, rise: 0.4, depth: 0.7, wall: 1.0 }, { rows: 5, rise: 0.4, depth: 0.7, wall: 1.0 }],
    seatMaterial: 'marble',
    riserMaterial: 'marble_veined',
    topPortico: { order: 'corinthian', columnHeight: 7 },
    detail: 'far',
  },
};

/** Mean luminance of a texture region (u0..u1, v0..v1 in 0..1). */
function lum(t: { w: number; h: number; color: Uint8ClampedArray }, u0: number, u1: number, v0: number, v1: number) {
  let s = 0;
  let n = 0;
  for (let y = Math.floor(v0 * t.h); y < Math.ceil(v1 * t.h); y++)
    for (let x = Math.floor(u0 * t.w); x < Math.ceil(u1 * t.w); x++) {
      const j = (y * t.w + x) * 4;
      s += 0.2126 * t.color[j] + 0.7152 * t.color[j + 1] + 0.0722 * t.color[j + 2];
      n++;
    }
  return s / n;
}

describe("far LOD ('far' detail)", () => {
  for (const order of ORDERS) {
    it(`${order} column: an 8-sided prism with a capital, under 80 triangles`, () => {
      const b = new MeshBuilder();
      const D = diameterForHeight(order, 9);
      const r = column(b, { order, D, detail: 'far' });
      const box = new THREE.Box3().setFromObject(b.build('c'));
      expect(triangles(b)).toBeLessThan(80);
      expect(box.max.y).toBeCloseTo(r.dims.height, 2);
      // the capital is wider than the shaft top
      expect(box.max.x).toBeGreaterThan(r.dims.d / 2 + 0.05 * D);
    });
  }

  const cases: [string, (b: MeshBuilder) => void, number][] = [
    ['hexastyle temple', (b) => temple(b, { order: 'corinthian', plan: 'pseudoperipteral', front: 6, width: 18, detail: 'far' }), 4000],
    ['tholos', (b) => tholos(b, { radius: 5.5, columns: 20, base: 'steps', detail: 'far' }), 5000],
    ['porticus 64 m', (b) => porticus(b, [new THREE.Vector3(0, 0, 30), new THREE.Vector3(0, 0, 0), new THREE.Vector3(34, 0, 0)], { order: 'ionic', columnHeight: 5.4, depth: 6, detail: 'far' }), 4000],
    ['triumphal arch', (b) => triumphalArch(b, { span: 3.2, detail: 'far' }), 6000],
  ];
  for (const [name, fn, budget] of cases) {
    it(`${name} within ${budget} triangles`, () => {
      const b = new MeshBuilder();
      fn(b);
      expect(triangles(b)).toBeLessThan(budget);
    });
  }

  it('amphitheatre far shell: ~5k triangles, same height and footprint as the full build', () => {
    const b = new MeshBuilder();
    const r = amphitheatreFar(b, AMPH);
    expect(r.triangles).toBeLessThan(6000);
    expect(r.height).toBeCloseTo(colosseumStoreys(K).reduce((a, s) => a + s.height, 0), 6);
    const box = new THREE.Box3().setFromObject(b.build('far'));
    expect(box.max.x).toBeGreaterThan(94 * K - 0.1);
    expect(box.max.x).toBeLessThan(94 * K + 1);
    expect(box.max.z).toBeGreaterThan(78 * K - 0.1);
    expect(box.max.y).toBeGreaterThan(r.height); // the velarium masts rise above the attic
    expect(b.colliders.length).toBe(0);
  });

  it('far cavea profile spans the same reach and height as the stepped section', () => {
    const full = caveaSection(AMPH.cavea);
    const far = caveaFarProfile(AMPH.cavea);
    expect(far.reach).toBeCloseTo(full.reach, 6);
    expect(far.height).toBeCloseTo(full.height, 6);
    expect(far.slopes.map((s) => s.rows)).toEqual([6, 9, 5]);
    for (let i = 1; i < far.profile.length; i++) expect(far.profile[i][0]).toBeGreaterThanOrEqual(far.profile[i - 1][0] - 1e-9);
  });

  it('facade texture: dark arches between lit piers, windows in alternate attic bays', () => {
    const storeys = colosseumStoreys(K);
    const bay = 4.07;
    const t = arcadeFacadeTexture(storeys, bay, bay * 0.36, 128, 256);
    const H = storeys.reduce((a, s) => a + s.height, 0);
    const v = (y: number) => y / H;
    // ground storey: arch centre (u 0.25 = middle of bay 0) vs the half-column on the bay edge
    expect(lum(t, 0.22, 0.28, v(3), v(4))).toBeLessThan(0.6 * lum(t, 0.0, 0.02, v(3), v(4)));
    // attic windows: bay 1 only
    const atticY0 = H - storeys[3].height;
    const win = (u: number) => lum(t, u - 0.02, u + 0.02, v(atticY0 + storeys[3].height * 0.45), v(atticY0 + storeys[3].height * 0.55));
    expect(win(0.75)).toBeLessThan(0.6 * win(0.25));
  });

  it('seat rows read as stripes: risers darker than treads; colonnade columns lighter than the back', () => {
    const s = seatRowsTexture();
    expect(lum(s, 0, 1, 0, 0.3)).toBeLessThan(0.85 * lum(s, 0, 1, 0.45, 0.8));
    const c = colonnadeTexture(0.7, 2.24, 7, 1.6);
    expect(lum(c, 0, 0.05, 0.3, 0.6)).toBeGreaterThan(1.2 * lum(c, 0.4, 0.6, 0.3, 0.6));
  });
});

describe('instanced columns', () => {
  it('a colonnade is one InstancedMesh per material, shared across builders', () => {
    const spec = { order: 'ionic' as const, D: 0.6, detail: 'low' as const, material: 'marble' as const };
    const a = new MeshBuilder();
    for (let i = 0; i < 12; i++) column(a, spec, new THREE.Matrix4().makeTranslation(i * 2, 0, 0));
    const b = new MeshBuilder();
    for (let i = 0; i < 3; i++) column(b, spec, new THREE.Matrix4().makeTranslation(0, 0, i * 2));
    const meshes = (g: THREE.Group) => {
      const out: THREE.InstancedMesh[] = [];
      g.traverse((o) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh) out.push(o as THREE.InstancedMesh);
      });
      return out;
    };
    const ga = meshes(a.build('a'));
    const gb = meshes(b.build('b'));
    expect(ga.length).toBe(1); // shaft and trim share the material
    expect(ga[0].count).toBe(12);
    expect(gb[0].count).toBe(3);
    expect(gb[0].geometry).toBe(ga[0].geometry); // one copy of the vertices for the program
    expect(ga[0].geometry.index).not.toBeNull();
    // placements carry their transforms
    const m = new THREE.Matrix4();
    ga[0].getMatrixAt(5, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).x).toBeCloseTo(10, 6);
  });

  it('append() carries instances through the parent transform; triangleCount counts placements', () => {
    const child = new MeshBuilder();
    column(child, { order: 'doric', D: 0.8, detail: 'far' });
    const parent = new MeshBuilder();
    parent.append(child, new THREE.Matrix4().makeTranslation(5, 0, 0));
    parent.append(child, new THREE.Matrix4().makeTranslation(-5, 0, 0));
    const g = parent.build('p');
    let inst: THREE.InstancedMesh | null = null;
    g.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh) inst = o as THREE.InstancedMesh;
    });
    expect(inst).not.toBeNull();
    const im = inst as unknown as THREE.InstancedMesh;
    expect(im.count).toBe(2);
    const m = new THREE.Matrix4();
    im.getMatrixAt(1, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).x).toBeCloseTo(-5, 6);
    expect(parent.triangleCount).toBe(2 * child.triangleCount);
  });
});
