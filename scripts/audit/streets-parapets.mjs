#!/usr/bin/env node
/**
 * STREETS crew (phase 4b): offline, the box colliders the street cells build within 12 m of a point and how
 * far their top corners stand over the ground (stair parapets: about 0.9 m once pitched with the flight).
 *
 *   node scripts/audit/streets-parapets.mjs <root> <x> <z>
 */
import { createServer } from 'vite';
const root = process.argv[2], px = Number(process.argv[3]), pz = Number(process.argv[4]);
const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const load = (p) => server.ssrLoadModule(p);
try {
  const atlas = await load('/src/data/atlas.ts');
  const HM = await load('/src/world/terrain/heightmap.ts');
  const { landmarkPads } = await load('/src/world/rome/buildRome.ts');
  const { planCity, scaleBounds } = await load('/src/world/city/plan.ts');
  const { streetWork } = await load('/src/world/city/roads.ts');
  const { MeshBuilder } = await load('/src/gfx/MeshBuilder.ts');
  const THREE = await import('three');
  const box = (b, m = 0) => ({ minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m });
  const lbs = [box(atlas.CORE_BOUNDS, 350), ...atlas.DETAIL_REGIONS.map((r) => box(r, 100))];
  const lb = { minX: Math.min(...lbs.map((b) => b.minX)), maxX: Math.max(...lbs.map((b) => b.maxX)), minZ: Math.min(...lbs.map((b) => b.minZ)), maxZ: Math.max(...lbs.map((b) => b.maxZ)) };
  const hm = HM.buildHeightmap({ BASE_ELEVATION: atlas.BASE_ELEVATION, HILLS: atlas.HILLS, LOWLANDS: atlas.LOWLANDS, RIVERS: atlas.RIVERS, ISLANDS: atlas.ISLANDS, ROADS: atlas.ROADS, bounds: atlas.CITY_BOUNDS }, { spacing: 2, pads: landmarkPads(lb) });
  const plan = planCity(atlas, hm, { detailBounds: scaleBounds(atlas.CORE_BOUNDS, 150), corridorDetail: 150 });
  const H = (x, z) => hm.heightAt(x, z);
  const work = streetWork(plan, H, plan.detailRects.map((b) => ({ minX: b.minX - 60, minZ: b.minZ - 60, maxX: b.maxX + 60, maxZ: b.maxZ + 60 })), 128);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const c = work.cells.get(`${Math.floor(px / 128) + dx},${Math.floor(pz / 128) + dz}`);
    if (!c) continue;
    const b = new MeshBuilder();
    for (const it of c.items) it(b);
    for (const col of b.colliders) {
      if (col.kind !== 'box' || Math.hypot(col.center.x - px, col.center.z - pz) > 12) continue;
      const m = new THREE.Matrix4().compose(col.center, col.rotation ?? new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      let top = -Infinity, worst = -Infinity;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const p = new THREE.Vector3(sx * col.half.x, col.half.y, sz * col.half.z).applyMatrix4(m);
        top = Math.max(top, p.y);
        worst = Math.max(worst, p.y - H(p.x, p.z));
      }
      console.log(`box @${col.center.x.toFixed(2)},${col.center.y.toFixed(2)},${col.center.z.toFixed(2)} half ${col.half.x.toFixed(2)},${col.half.y.toFixed(2)},${col.half.z.toFixed(2)}: top corner up to ${worst.toFixed(2)} m over the ground`);
    }
  }
} finally {
  await server.close();
}
