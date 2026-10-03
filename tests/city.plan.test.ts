/**
 * City plan, layout and street graph on the real atlas (core of Rome plus a ring around it).
 * One fixture (heightmap + plan) is built for the whole file.
 */
import { describe, expect, it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { pointInOBB, obbOverlap, polygonContainsOBB } from '../src/arch/fabric/polygon';
import { MAX_BUILDING_HEIGHT } from '../src/arch/fabric/insula';
import { footprintPolygon } from '../src/world/terrain/heightmap';
import { DISTRICT_LANDMARKS } from '../src/world/city/data';
import { layoutBlock } from '../src/world/city/massing';
import { buildStreetGraph } from '../src/world/city/network';
import { planCity, scaleBounds } from '../src/world/city/plan';
import { K, distToPoly, pointInPoly, type Pt } from '../src/world/city/raster';
import { streetWork } from '../src/world/city/roads';
import { placeTrees } from '../src/world/city/vegetation';
import { AREA, cityFixture } from './city.fixture';

const S = 0.6;
const { hm, plan } = cityFixture();
const H = (x: number, z: number) => hm.heightAt(x, z);
const core = scaleBounds(atlas.CORE_BOUNDS);
const inCore = (x: number, z: number) => x >= core.minX && x <= core.maxX && z >= core.minZ && z <= core.maxZ;

describe('city plan', () => {
  it('lays out streets and blocks over the core', () => {
    const built = plan.blocks.filter((b) => b.kind === 'built');
    expect(plan.streets.length).toBeGreaterThan(300);
    expect(built.length).toBeGreaterThan(300);
    expect(plan.blocks.filter((b) => b.detailed).length).toBeGreaterThan(150);
    expect(plan.piazzas.length).toBeGreaterThan(50);
    // Streets are human scale (vici, lanes, angiportus).
    for (const s of plan.streets) {
      expect(s.width).toBeGreaterThanOrEqual(3);
      expect(s.width).toBeLessThanOrEqual(6.5);
      expect(s.steps.length).toBe(s.points.length - 1);
    }
  });

  it('is deterministic', () => {
    const again = planCity(atlas, hm, { bounds: scaleBounds(AREA), detailBounds: scaleBounds(atlas.CORE_BOUNDS, 150) });
    expect(again.blocks.length).toBe(plan.blocks.length);
    expect(again.streets.length).toBe(plan.streets.length);
    expect(again.blocks[10].outline).toEqual(plan.blocks[10].outline);
  });

  it('keeps blocks off landmark footprints, the river and the open fora', () => {
    const solids = atlas.LANDMARKS.filter((l) => l.siting !== 'open' && l.siting !== 'underground' && !DISTRICT_LANDMARKS.has(l.id) && l.category !== 'garden' && l.category !== 'aqueduct').map((l) => footprintPolygon(l.center, l.rotation, l.footprint as never).map(([x, z]) => [x * S, z * S] as Pt));
    let bad = 0, checked = 0;
    for (const b of plan.blocks) {
      if (b.kind !== 'built') continue;
      // Points well inside the block (≥ 2 m from its outline) must not lie in a landmark.
      const xs = b.outline.map((p) => p[0]), zs = b.outline.map((p) => p[1]);
      for (let x = Math.min(...xs); x < Math.max(...xs); x += 3)
        for (let z = Math.min(...zs); z < Math.max(...zs); z += 3) {
          if (!pointInPoly(x, z, b.outline) || distToPoly(x, z, b.outline) < 2) continue;
          checked++;
          if (solids.some((poly) => pointInPoly(x, z, poly))) bad++;
        }
      expect(plan.grid.at(b.centroid[0], b.centroid[1])).not.toBe(K.WATER);
    }
    expect(checked).toBeGreaterThan(10000);
    expect(bad).toBe(0);
    // The Forum basin has no insulae.
    expect(plan.blocks.some((b) => b.kind === 'built' && Math.hypot(b.centroid[0] - 60 * S, b.centroid[1] - 40 * S) < 40)).toBe(false);
  });

  it('keeps blocks low near the major landmarks (GDD §12.3) and tall in the Subura', () => {
    const colosseum = atlas.LANDMARK_BY_ID.colosseum.center;
    const near = plan.blocks.filter((b) => Math.hypot(b.centroid[0] - colosseum[0] * S, b.centroid[1] - colosseum[1] * S) < 120);
    expect(near.length).toBeGreaterThan(0);
    for (const b of near) expect(b.maxStoreys).toBeLessThanOrEqual(4);
    const subura = plan.blocks.filter((b) => b.quarter === 'subura' && b.kind === 'built');
    expect(subura.length).toBeGreaterThan(10);
    expect(subura.some((b) => b.maxStoreys >= 5)).toBe(true);
    const caelian = plan.blocks.filter((b) => b.quarter === 'caelian');
    const mean = (xs: number[]) => xs.reduce((a, c) => a + c, 0) / xs.length;
    expect(mean(subura.map((b) => b.density))).toBeGreaterThan(mean(caelian.map((b) => b.density)));
    expect(mean(caelian.map((b) => b.wealth))).toBeGreaterThan(mean(subura.map((b) => b.wealth)));
  });

  it('gives every built block street frontage with sidewalk heights per edge', () => {
    for (const b of plan.blocks) {
      expect(b.sidewalk.length).toBe(b.outline.length);
      if (b.kind === 'built') expect(b.frontEdges.length).toBeGreaterThan(0);
    }
  });

  it('builds the Servian wall remnants, non-landmark gates and aqueduct arcades from the atlas', () => {
    expect(plan.walls.some((w) => w.id === 'servian-agger' && w.agger)).toBe(true);
    // Gates that are landmarks (Porta Capena…) or only sites are left to others / out.
    expect(plan.gates.find((g) => g.id === 'porta-capena')).toBeUndefined();
    expect(plan.gates.find((g) => g.id === 'porta-ratumena')).toBeUndefined();
    expect(plan.gates.find((g) => g.id === 'porta-raudusculana')).toBeDefined();
    expect(plan.aqueducts.map((a) => a.id)).toContain('arcus-neroniani');
    expect(plan.aqueducts.map((a) => a.id)).not.toContain('janiculum-mill-race');
  });
});

describe('city block layout', () => {
  const sample = plan.blocks.filter((b) => b.kind === 'built' && b.detailed).slice(0, 60);

  it('puts lots and back buildings inside the block without overlaps, under the height limit', () => {
    let backs = 0;
    for (const b of sample) {
      const lay = layoutBlock(b, H);
      const solid = lay.lots.filter((l) => l.kind !== 'alley');
      for (const l of solid) expect(polygonContainsOBB(b.outline, l.obb, 0.05)).toBe(true);
      for (const bl of lay.back) {
        backs++;
        expect(polygonContainsOBB(b.outline, bl.obb, 0.05)).toBe(true);
        for (const l of solid) expect(obbOverlap(bl.obb, l.obb, 0.05)).toBe(false);
      }
      for (const m of lay.masses) expect(m.eave - m.floorY).toBeLessThanOrEqual(MAX_BUILDING_HEIGHT + 0.01);
      // Yard trees stand clear of every building.
      for (const t of lay.trees) for (const l of solid) expect(pointInOBB(t, l.obb, 0)).toBe(false);
    }
    expect(backs).toBeGreaterThan(10);
  });
});

describe('city street graph', () => {
  const inArea = (x: number, z: number) => inCore(x, z);
  const work = streetWork(plan, H, core, 128);
  const graph = buildStreetGraph(plan, work, null, inArea);

  it('covers the core with one big connected network', () => {
    expect(graph.nodes.length).toBeGreaterThan(500);
    const comps = graph.components();
    const linked = comps.reduce((n, c) => n + c.length, 0);
    expect(comps[0].length / linked).toBeGreaterThan(0.95);
    for (const [a, b, w] of graph.edges) {
      expect(a).not.toBe(b);
      expect(w).toBeGreaterThan(0);
    }
  });

  it('has spots for doors, fountains and shrines, each tied to a node', () => {
    const kinds = new Set(graph.spots.map((s) => s.kind));
    for (const k of ['shopDoor', 'houseDoor', 'fountain', 'shrine']) expect(kinds.has(k as never)).toBe(true);
    const tied = graph.spots.filter((s) => s.node >= 0).length;
    expect(tied / graph.spots.length).toBeGreaterThan(0.95);
    const big = new Set(graph.components()[0]);
    const reachable = graph.spots.filter((s) => big.has(s.node)).length;
    expect(reachable / graph.spots.length).toBeGreaterThan(0.9);
  });

  it('finds the nearest node of a point on a street', () => {
    const s = plan.streets.find((st) => inCore(st.points[0][0], st.points[0][1]))!;
    const p = s.points[Math.floor(s.points.length / 2)];
    const n = graph.nearest(p[0], p[1], 30);
    expect(n).toBeGreaterThanOrEqual(0);
  });
});

describe('city vegetation', () => {
  it('plants trees in gardens and on slopes, reeds on the riverbank, none on streets', () => {
    const trees = placeTrees(plan, scaleBounds(AREA), hm.waterLevelY);
    expect(trees.length).toBeGreaterThan(500);
    const on = (k: number) => trees.filter((t) => plan.grid.at(t.x, t.z) === k).length;
    expect(on(K.GARDEN)).toBeGreaterThan(100);
    expect(on(K.STEEP)).toBeGreaterThan(20);
    expect(on(K.STREET) + on(K.ROAD)).toBe(0);
    expect(trees.some((t) => t.species === 'reeds')).toBe(true);
    expect(trees.some((t) => t.species === 'umbrella_pine')).toBe(true);
  });
});
