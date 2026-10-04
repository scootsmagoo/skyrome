/**
 * The golden path and street life: the road through the Porta Capena, corridor blocks, wall torches,
 * landmark-frontage dressing, lamps near the camera, and a street-graph route from the gate to the
 * Forum. Uses the shared city fixture (heightmap + plan over the core).
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { CityLamps } from '../src/world/city/lamps';
import { blockTorches, lifeWork, torchLamp, type LampDef } from '../src/world/city/life';
import { layoutBlock } from '../src/world/city/massing';
import { buildStreetGraph } from '../src/world/city/network';
import { scaleBounds } from '../src/world/city/plan';
import { K, distToSeg, type Pt } from '../src/world/city/raster';
import { cellAdder, streetWork, type CellWork } from '../src/world/city/roads';
import { cityFixture } from './city.fixture';

const S = 0.6;
const { hm, plan } = cityFixture();
const H = (x: number, z: number) => hm.heightAt(x, z);
const core = scaleBounds(atlas.CORE_BOUNDS);
const inCore = (x: number, z: number) => x >= core.minX && x <= core.maxX && z >= core.minZ && z <= core.maxZ;
const gate: Pt = [507 * S, 955 * S];

describe('golden path', () => {
  it('runs a street from the Porta Capena into the valley roads', () => {
    const road = plan.roads.find((r) => r.id === 'porta-capena-intra')!;
    expect(road).toBeDefined();
    expect(Math.hypot(road.points[0][0] - gate[0], road.points[0][1] - gate[1])).toBeLessThan(1);
    // Inside the gate (25 m along the road) there is street, not a block.
    const p = road.points[1];
    const t = [(p[0] - gate[0]) / Math.hypot(p[0] - gate[0], p[1] - gate[1]), (p[1] - gate[1]) / Math.hypot(p[0] - gate[0], p[1] - gate[1])];
    expect(plan.grid.at(gate[0] + t[0] * 25, gate[1] + t[1] * 25)).toBe(K.ROAD);
  });

  it('keeps every corridor block built (no garden lots on the way into the city)', () => {
    const cor = plan.blocks.filter((b) => b.corridor);
    expect(cor.length).toBeGreaterThan(30);
    expect(cor.every((b) => b.kind === 'built')).toBe(true);
    for (const b of cor) expect(b.density).toBeGreaterThan(0.7);
  });

  it('links the gate to the Forum on the street graph', () => {
    const work = streetWork(plan, H, core, 128);
    const graph = buildStreetGraph(plan, work, null, inCore);
    const a = graph.nearest(gate[0] - 10, gate[1] - 12, 25);
    const b = graph.nearest(60 * S, 40 * S, 60);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
    const comp = graph.components().find((c) => c.includes(a))!;
    expect(comp.includes(b)).toBe(true);
  });
});

describe('street life', () => {
  it('puts wall torches on the shop fronts, more on the golden path', () => {
    const sample = plan.blocks.filter((b) => b.kind === 'built' && b.detailed).slice(0, 120);
    let n = 0, cor = 0, corBlocks = 0;
    for (const b of sample) {
      const lay = layoutBlock(b, H);
      const torches = blockTorches(b, lay.lots, H);
      expect(torches).toEqual(lay.torches);
      // On the facade: on the block outline, above the street.
      for (const t of torches) {
        let d = Infinity;
        for (let k = 0; k < b.outline.length; k++) d = Math.min(d, distToSeg(t.x, t.z, b.outline[k][0], b.outline[k][1], b.outline[(k + 1) % b.outline.length][0], b.outline[(k + 1) % b.outline.length][1]));
        expect(d).toBeLessThan(0.05);
        expect(t.y - H(t.x, t.z)).toBeGreaterThan(2.4);
        // The flame sits out from the wall, above the bracket.
        const l = torchLamp(t);
        expect(Math.hypot(l.x - t.x, l.z - t.z)).toBeCloseTo(0.3, 3);
        expect(l.y).toBeGreaterThan(t.y);
      }
      n += torches.length;
      if (b.corridor) { cor += torches.length; corBlocks++; }
    }
    expect(n).toBeGreaterThan(60);
    if (corBlocks) expect(cor / corBlocks).toBeGreaterThan(n / sample.length);
  });

  it('dresses the landmark frontages that face a street: stalls on the Circus street, statues, benches', () => {
    const cells = new Map<string, CellWork>();
    const life = lifeWork(plan, H, inCore, cellAdder(cells, 128, inCore));
    expect(life.counts.stall).toBeGreaterThan(30);
    expect((life.counts.statue ?? 0) + (life.counts.bench ?? 0)).toBeGreaterThan(20);
    expect(life.counts.washing).toBeGreaterThan(20);
    // Every item stands on a landmark margin, ≥ 4.4 m from the next.
    const pts = life.spots.map((s) => s.position);
    for (const s of life.spots) expect([K.MARGIN, K.LANDMARK, K.ROAD, K.STREET]).toContain(plan.grid.at(s.position.x, s.position.z));
    // Stalls line the street under the Palatine (the Circus Maximus margin).
    const circusStalls = life.spots.filter((s) => s.kind === 'stall' && s.id.startsWith('circus-maximus'));
    expect(circusStalls.length).toBeGreaterThan(10);
    expect(pts.length).toBeGreaterThan(50);
    // All their geometry is street furniture (the near layer of the cells).
    let items = 0, detail = 0;
    for (const c of cells.values()) { items += c.items.length; detail += c.detail.length; }
    expect(items).toBe(0);
    expect(detail).toBeGreaterThan(100);
    // Lamps on the golden path.
    expect(life.lamps.length).toBeGreaterThan(20);
  });
});

describe('city lamps', () => {
  it('requests lamps near the camera only, and drops them when it moves away', () => {
    const live = new Set<number>();
    let id = 0;
    const game = {
      camera: new THREE.PerspectiveCamera(),
      world: { distanceScale: 1 },
      lights: {
        request: () => {
          const h = id++;
          live.add(h);
          return { id: h, remove: () => live.delete(h) };
        },
      },
    };
    const lamps = new CityLamps(game as never, 100);
    const defs: LampDef[] = [];
    for (let i = 0; i < 50; i++) defs.push({ x: i * 20, y: 3, z: 0, kind: 'torch' });
    for (const d of defs) lamps.add(d);
    game.camera.position.set(0, 2, 0);
    lamps.lateUpdate();
    expect(live.size).toBe(6); // 0, 20 … 100
    game.camera.position.set(600, 2, 0);
    lamps.lateUpdate();
    // 500…700 in range; the first six (≥ 470 m away) dropped.
    expect(lamps.active).toBe(11);
    expect(live.size).toBe(11);
  });
});
