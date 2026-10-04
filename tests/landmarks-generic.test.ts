/**
 * Category builders (generic-*.ts) and the Campus Martius heroes (campus-*.ts): the pure helpers,
 * and a smoke build of every landmark they handle (both detail levels) with budgets and contracts.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LANDMARKS } from '../src/data/atlas';
import { caveaSection } from '../src/arch/classical/amphitheatre';
import { Rng } from '../src/core/Rng';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { builderFor, registeredBuilderKeys } from '../src/world/landmarks/registry';
import type { LandmarkData } from '../src/world/landmarks/types';
import { flightSteps, insidePoly, parseHints } from '../src/world/landmarks/builders/generic-common';
import { fitTemple } from '../src/world/landmarks/builders/generic-sacred';
import { gatePassages } from '../src/world/landmarks/builders/generic-gates';
import { clipPath } from '../src/world/landmarks/builders/generic-forum';
import { fitAmphitheatre } from '../src/world/landmarks/builders/generic-venues';
import { testaccioHeight } from '../src/world/landmarks/builders/campus-river';

/** Regions whose landmarks other crews build by id; our category builders still cover the rest. */
const OTHER_REGIONS = new Set(['regio-viii', 'regio-iv', 'regio-x', 'regio-iii', 'regio-ii', 'regio-xi']);
const SPOT_KINDS = new Set(['inscription', 'vista', 'shrine', 'container', 'door', 'npc', 'vendor', 'spawn', 'sit', 'stall']);

function triangles(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    const t = (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3;
    n += t * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
  });
  return n;
}

function build(lm: (typeof LANDMARKS)[number], detail: 'high' | 'low') {
  const b = builderFor(lm as unknown as LandmarkData)!;
  // A gentle slope so foundations and terrain-following code paths run.
  const groundAt = (x: number, z: number) => x * 0.02 - z * 0.015;
  return { key: b.handles[0], r: b.build({ game: {} as never, lm: lm as unknown as LandmarkData, S: 0.6, rng: new Rng(`landmark:${lm.id}`), detail, builder: () => new MeshBuilder(), groundAt }) };
}

describe('atlas text hints', () => {
  it('reads order, column count, plan, round and Republican fabric', () => {
    const h = parseHints({ name: 'Temple of X', description: 'An Ionic hexastyle peripteral temple.', builderNotes: 'Stucco over tufa.', dates: '179 BC' });
    expect(h.order).toBe('ionic');
    expect(h.front).toBe(6);
    expect(h.plan).toBe('peripteral');
    expect(h.republican).toBe(true);
    expect(h.material).toBe('tufa');
    const r = parseHints({ name: 'Round temple', description: 'A tholos of 20 columns', builderNotes: 'Marble, rebuilt by Augustus', dates: '100 BC' });
    expect(r.round).toBe(true);
    expect(r.republican).toBe(false);
    // Words match at word starts only ('hut' must not fire on 'shuttered').
    expect(parseHints({ name: 'a', description: 'shuttered house', builderNotes: '' }).has('hut')).toBe(false);
  });

  it('counts gate passages', () => {
    expect(gatePassages('the triple gate (porta trigemina)')).toBe(3);
    expect(gatePassages('a double gateway in a stub of wall')).toBe(2);
    expect(gatePassages('a triple arch, of which only the central bay survives')).toBe(1);
    expect(gatePassages('a tufa ashlar gate')).toBe(1);
  });
});

describe('fitted temples', () => {
  for (const [w, d, plan] of [[10, 18, 'prostyle'], [18, 30, 'peripteral'], [30, 50, 'pseudoperipteral']] as const) {
    it(`a ${plan} temple fills ${w} × ${d} m without spilling out`, () => {
      const { layout, offsetZ } = fitTemple(w, d, { plan, detail: 'low' });
      expect(layout.stylobate.x1 - layout.stylobate.x0).toBeLessThanOrEqual(w + 1e-6);
      expect(offsetZ + layout.podiumFront).toBeGreaterThanOrEqual(-d / 2 - 1e-6);
      expect(offsetZ + layout.stylobate.z1).toBeLessThanOrEqual(d / 2 + 1e-6);
      expect(layout.stairs.rise).toBeLessThanOrEqual(0.22 + 1e-6);
    });
  }
});

describe('pure layout helpers', () => {
  it('clips a colonnade path round an obstacle and drops stubs', () => {
    const path = [new THREE.Vector3(-30, 0, 0), new THREE.Vector3(30, 0, 0)];
    const runs = clipPath(path, (x) => Math.abs(x) > 8);
    expect(runs.length).toBe(2);
    for (const r of runs) for (const p of r) expect(Math.abs(p.x)).toBeGreaterThan(8 - 1e-6);
    expect(clipPath(path, (x) => x < -26).length).toBe(0); // a 4 m stub is dropped
  });

  it('shapes Monte Testaccio as a terraced heap', () => {
    const flat = () => 1;
    expect(testaccioHeight(1, 0, flat)).toBe(0);
    expect(testaccioHeight(0, 0, flat)).toBeGreaterThan(0.8);
    let prev = Infinity;
    for (let r = 0; r <= 1; r += 0.02) {
      const h = testaccioHeight(r, 0, flat);
      expect(h).toBeLessThanOrEqual(prev + 1e-9);
      prev = h;
    }
  });

  it('fits the amphitheatre cavea between the arena and the ambulatory on both axes', () => {
    const spec = fitAmphitheatre(56.4, 46.8, 29.1, 0.6, [83, 48], 'high', 80);
    expect(spec.facade.bays).toBe(80);
    const reach = caveaSection(spec.cavea).reach;
    const inner = (r: number) => r - spec.facade.depth / 2 - (spec.facade.corridor ?? 0) - 0.9;
    expect(spec.cavea.arenaRx + reach).toBeCloseTo(inner(56.4), 6);
    expect(spec.cavea.arenaRz + reach).toBeCloseTo(inner(46.8), 6);
    expect(spec.cavea.arenaRz).toBeGreaterThan(8);
  });

  it('keeps every human-scale flight climbable (risers ≤ 0.22 m)', () => {
    for (let h = 0.06; h < 12; h += 0.037) expect(flightSteps(h).rise).toBeLessThanOrEqual(0.21 + 1e-9);
  });

  it('has an even-odd point-in-polygon', () => {
    const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(insidePoly(5, 5, sq)).toBe(true);
    expect(insidePoly(15, 5, sq)).toBe(false);
  });
});

describe('category coverage', () => {
  it('has a category builder for every landmark category except aqueducts (the city module)', () => {
    const keys = new Set(registeredBuilderKeys());
    const cats = new Set(LANDMARKS.map((l) => l.category));
    for (const c of cats) if (c !== 'aqueduct') expect(keys.has(`category:${c}`), c).toBe(true);
  });
});

describe('every landmark we build', () => {
  // Ours: every landmark outside the other crews' regions, plus anything anywhere that falls back
  // to one of our category builders.
  const ours = LANDMARKS.filter((lm) => {
    const key = builderFor(lm as unknown as LandmarkData)?.handles[0] ?? '';
    return key !== 'category:*' && (key.startsWith('category:') || !OTHER_REGIONS.has(lm.region));
  });
  it('covers well over a hundred landmarks', () => expect(ours.length).toBeGreaterThan(120));
  for (const lm of ours) {
    it(`${lm.id} builds within budget with valid spots`, () => {
      // The detail the game builds it at (core extent: priority ≤ 2 high).
      const detail = lm.priority <= 2 ? 'high' : 'low';
      const { key, r } = build(lm, detail);
      const tris = triangles(r.object);
      const hero = !key.startsWith('category:');
      // Heroes ~150k (a few big complexes a little over), category builds well under that.
      expect(tris, `${lm.id} (${key}) ${detail}`).toBeLessThan(hero || lm.priority === 1 ? 200_000 : 120_000);
      if (detail === 'high') expect(triangles(build(lm, 'low').r.object), `${lm.id} low`).toBeLessThanOrEqual(tris * 1.05 + 1);
      for (const s of r.spots ?? []) {
        expect(SPOT_KINDS.has(s.kind), `${s.id}: ${s.kind}`).toBe(true);
        expect(Number.isFinite(s.position.x + s.position.y + s.position.z)).toBe(true);
      }
      if (lm.siting !== 'open' && lm.height >= 2) expect(r.colliders.length, `${lm.id} colliders`).toBeGreaterThan(0);
      if (r.far) expect(triangles(r.far)).toBeLessThan(Math.max(30_000, tris * 0.6));
    });
  }
});
