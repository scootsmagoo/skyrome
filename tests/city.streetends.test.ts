/**
 * Street-end audit (M3, dead-ends) over the plan the game builds (the whole CITY_BOUNDS raster):
 * how many minor-street ends stop at nothing (stubs), by region and by what lies beyond, before
 * (closeStubs: false) and after the rework; and the street graph's degree-1 nodes on the core.
 * Set STREET_AUDIT_OUT=<file> to dump the stubs as JSON (positions for the screenshot hunt).
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { auditStreetEnds, summarize } from '../src/world/city/audit';
import { buildStreetGraph } from '../src/world/city/network';
import { scaleBounds } from '../src/world/city/plan';
import { streetWork } from '../src/world/city/roads';
import { gameFixture } from './city.fixture';

const regionName = (i: number) => atlas.REGIONS[i]?.id ?? 'none';

describe('street-end audit', () => {
  const before = auditStreetEnds(gameFixture(false).plan, regionName);
  const after = auditStreetEnds(gameFixture(true).plan, regionName);
  const b = summarize(before), a = summarize(after);

  it('reports the stubs before and after', () => {
    console.log('STREET-END AUDIT before', JSON.stringify(b));
    console.log('STREET-END AUDIT after', JSON.stringify(a));
    if (process.env.STREET_AUDIT_OUT) writeFileSync(process.env.STREET_AUDIT_OUT, JSON.stringify({ before: before.filter((e) => e.verdict === 'stub'), after: after.filter((e) => e.verdict === 'stub') }));
    expect(b.ends).toBeGreaterThan(500);
  });

  it('closes the minor-street stubs: every end meets a road, a street, a square or opens into a court', () => {
    // Before the rework a good fifth of the street ends stopped at nothing (a sliver, a landmark's
    // apron, a slope foot, a garden). What is left stops at the river, a Servian wall, the
    // country beyond the city's last block, or is too tight for a court.
    expect(b.stubs).toBeGreaterThan(b.ends * 0.15);
    expect(a.stubs).toBeLessThan(b.stubs * 0.3);
    // Where the player goes (the core and 150 m round it, game m): next to none.
    const near = (e: { p: number[] }) => e.p[0] > -522 && e.p[0] < 666 && e.p[1] > -378 && e.p[1] < 678;
    const nb = before.filter((e) => e.verdict === 'stub' && near(e)).length, na = after.filter((e) => e.verdict === 'stub' && near(e)).length;
    console.log('STREET-END AUDIT core+150: before', nb, 'after', na);
    expect(nb).toBeGreaterThan(100);
    expect(na).toBeLessThanOrEqual(12);
  });
});

describe('street graph degree-1 nodes', () => {
  const { hm, plan } = gameFixture();
  const core = scaleBounds(atlas.CORE_BOUNDS);
  const inCore = (x: number, z: number) => x >= core.minX && x <= core.maxX && z >= core.minZ && z <= core.maxZ;
  // Nodes within 12 m of the core's edge lead out of the graph's area; piazzas and landmark doors
  // hang from one link by design.
  const edge = (x: number, z: number) => Math.min(x - core.minX, core.maxX - x, z - core.minZ, core.maxZ - z) < 12;
  const loose = (graph: ReturnType<typeof buildStreetGraph>) =>
    graph.nodes.filter((n) => graph.neighbours(n.id).length === 1 && !edge(n.x, n.z) && n.kind !== 'piazza' && n.kind !== 'plaza' && n.kind !== 'landmark');

  it('joins the loose ends in the core that a walkable link of 30 m can reach', () => {
    const work = streetWork(plan, (x, z) => hm.heightAt(x, z), core, 128);
    const before = loose(buildStreetGraph(gameFixture(false).plan, streetWork(gameFixture(false).plan, (x, z) => hm.heightAt(x, z), core, 128), null, inCore, { deadEnds: false }));
    const after = loose(buildStreetGraph(plan, work, null, inCore));
    console.log('DEG1 before', before.length, 'after', after.length, JSON.stringify(after.map((n) => [n.kind, Math.round(n.x), Math.round(n.z)])));
    expect(before.length).toBeGreaterThan(50);
    // What is left: roads running into a monument, the Servian wall, a stairway's foot at a podium.
    expect(after.length).toBeLessThanOrEqual(24);
    expect(after.length).toBeLessThan(before.length * 0.5);
    // Reconciled count (game plan, core): 95 before, 20 after the 120 m road reach; the 20 are
    // all named termini (earlier reports said 24/25/23 for earlier reach settings).
    const graph = buildStreetGraph(plan, work, null, inCore);
    const named = new Set(graph.termini.map((t) => t.node));
    for (const n of loose(graph)) expect(named.has(n.id)).toBe(true);
    expect(graph.termini.some((t) => t.reason === 'stairs')).toBe(true);
  });
});
