/**
 * Street-graph reachability (M4): the walkable graph the NPCs and the quest routes use must be
 * one connected network over the core, not a scatter of islands. Counts are logged so a rework
 * can be compared before and after.
 */
import { describe, expect, it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { buildStreetGraph } from '../src/world/city/network';
import { scaleBounds } from '../src/world/city/plan';
import { streetWork } from '../src/world/city/roads';
import { gameFixture } from './city.fixture';

describe('street graph reachability', () => {
  const { hm, plan } = gameFixture();
  const core = scaleBounds(atlas.CORE_BOUNDS);
  const inCore = (x: number, z: number) => x >= core.minX && x <= core.maxX && z >= core.minZ && z <= core.maxZ;
  const graph = buildStreetGraph(plan, streetWork(plan, (x, z) => hm.heightAt(x, z), core, 128), null, inCore);
  const comps = graph.components();

  it('has one dominant component holding nearly every node', () => {
    const total = graph.nodes.length;
    const share = comps[0].length / total;
    console.log('REACH components', comps.length, 'nodes', total, 'largest', comps[0].length, 'share', share.toFixed(3), 'next sizes', comps.slice(1, 8).map((c) => c.length).join(','));
    expect(total).toBeGreaterThan(500);
    expect(share).toBeGreaterThan(0.9);
  });

  it('keeps the road and street nodes in the middle of the core on the main network', () => {
    const main = new Set(comps[0]);
    const cx = (core.minX + core.maxX) / 2, cz = (core.minZ + core.maxZ) / 2;
    const rx = (core.maxX - core.minX) / 4, rz = (core.maxZ - core.minZ) / 4;
    const mid = graph.nodes.filter((n) => (n.kind === 'road' || n.kind === 'street') && Math.abs(n.x - cx) < rx && Math.abs(n.z - cz) < rz);
    const off = mid.filter((n) => !main.has(n.id));
    console.log('REACH mid-core road/street nodes', mid.length, 'off the main network', off.length);
    expect(mid.length).toBeGreaterThan(100);
    expect(off.length / mid.length).toBeLessThan(0.05);
  });
});
