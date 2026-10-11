#!/usr/bin/env node
/**
 * STREETS crew (phase 4b): offline check of the city's street cells, without a browser. Builds the
 * heightmap and the city plan as the game does (as grades.mjs does), runs the street work items of
 * chosen 128 m cells into MeshBuilders and reports per cell: items, triangles (by source kind),
 * colliders, the slowest item (ms), and the largest gap between the street surfaces' vertices and
 * heightAt. Use it for before/after triangle budgets and the cost of a cell's items.
 *
 *   node scripts/audit/streets-cells.mjs [--at x,z;x,z] [--all] [--terrain v1|v2] [--by-src] [--json out.json]
 *
 * --probe x,z[;x,z]: every drawn triangle over the point (its y, material, source) against heightAt.
 * --edges: open edges of the cell's build (vertices welded at 2 mm, as street-fit counts them) standing over
 *          3 cm above what lies 6 cm beyond them (street surfaces of the cell, else heightAt − plan.drop).
 * --holes: places (0.25 m raster) a street surface claims (the paving index: cut round) where nothing is drawn.
 * --by-src: triangles by what built them (the work items' tags: ground-cover, road, street:lane, junction, ...).
 *
 * Default cells: the STREETS cameras of docs/design/solid-ground.md §4 plus the Forum and the spawn.
 */
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './boot.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
if (args.pts) globalThis.__pts = true;
// The geometry audit's source tags (withAuditSource) are on only with ?audit.
if (args['by-src'] || args.probe) globalThis.location = { search: '?audit' };
if (args.terrain) process.env.SKYROME_TERRAIN = String(args.terrain);
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);

const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const load = (p) => server.ssrLoadModule(p);
try {
  const atlas = await load('/src/data/atlas.ts');
  const HM = await load('/src/world/terrain/heightmap.ts');
  const { landmarkPads } = await load('/src/world/rome/buildRome.ts');
  const { planCity, scaleBounds } = await load('/src/world/city/plan.ts');
  const roadsMod = await load('/src/world/city/roads.ts');
  const { streetWork } = roadsMod;
  const { MeshBuilder } = await load('/src/gfx/MeshBuilder.ts');
  const { withAuditSource } = await load('/src/dev/audit/geomAudit.ts');
  const streets = await load('/src/arch/fabric/streets.ts');
  const cs = streets.conformStats;
  if (cs) cs.check = true;
  const box = (b, m = 0) => ({ minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m });
  const lbs = [box(atlas.CORE_BOUNDS, 350), ...atlas.DETAIL_REGIONS.map((r) => box(r, 100))];
  const landmarkBounds = { minX: Math.min(...lbs.map((b) => b.minX)), maxX: Math.max(...lbs.map((b) => b.maxX)), minZ: Math.min(...lbs.map((b) => b.minZ)), maxZ: Math.max(...lbs.map((b) => b.maxZ)) };
  const SRC = { BASE_ELEVATION: atlas.BASE_ELEVATION, HILLS: atlas.HILLS, LOWLANDS: atlas.LOWLANDS, RIVERS: atlas.RIVERS, ISLANDS: atlas.ISLANDS, ROADS: atlas.ROADS, bounds: atlas.CITY_BOUNDS };
  const hm = HM.buildHeightmap(SRC, { spacing: 2, pads: landmarkPads(landmarkBounds) });
  log(`heightmap ${hm.nx}x${hm.nz} profile ${hm.profile}`);
  const plan = planCity(atlas, hm, { detailBounds: scaleBounds(atlas.CORE_BOUNDS, 150), corridorDetail: 150 });
  log(`plan: ${plan.roads.length} roads, ${plan.streets.length} streets, ${plan.blocks.length} blocks; steep streets cut ${plan.stats.steepStreetsCut} (dropped ${plan.stats.steepStreetsDropped}, ${plan.stats.steepStreetMetres} m)`);
  const H = (x, z) => hm.heightAt(x, z);
  const areaRects = plan.detailRects.map((b) => ({ minX: b.minX - 60, minZ: b.minZ - 60, maxX: b.maxX + 60, maxZ: b.maxZ + 60 }));
  const work = streetWork(plan, H, areaRects, 128);
  log(`street work: ${work.cells.size} cells`);
  const DEFAULT = '486.6,261;80.7,106.1;200.9,94.1;-470.1,585.4;-377.9,591.3;266,552.5;51.5,1.2;105.4,-288.5;60,60;300,570;-0.1,259.7';
  const keys = args.all ? [...work.cells.keys()] : [...new Set(String(args.at ?? DEFAULT).split(';').map((s) => s.split(',').map(Number)).map(([x, z]) => `${Math.floor(x / 128)},${Math.floor(z / 128)}`))];
  const rows = [];
  let total = { tris: 0, items: 0, ms: 0, colliders: 0 };
  const bySrc = {};
  for (const key of keys) {
    const c = work.cells.get(key);
    if (!c) continue;
    const b = new MeshBuilder();
    let slow = 0, slowTag = '', ms = 0;
    const per = [];
    if (cs) for (const k of Object.keys(cs)) if (typeof cs[k] === 'number') cs[k] = 0;
    c.items.forEach((it, k) => {
      const before = b.triangleCount;
      const t = performance.now();
      const s0 = cs ? { ...cs } : null;
      try {
        withAuditSource(`item#${k}`, () => it(b));
      } catch (e) {
        console.log(`  item ${k} failed: ${e.message}`);
      }
      const dt = performance.now() - t;
      ms += dt;
      const added = b.triangleCount - before;
      if (dt > slow) {
        slow = dt;
        slowTag = `#${k}`;
      }
      const src = [...b.parts.values()].flat().find((g) => g.userData.src)?.userData.src;
      void src;
      per.push({ k, tris: added, ms: +dt.toFixed(1), stats: cs ? Object.fromEntries(Object.keys(cs).filter((q) => typeof cs[q] === 'number').map((q) => [q, Math.round(cs[q] - s0[q])])) : null });
    });
    if (args.items) for (const p of per.sort((a, b) => b.tris - a.tris).slice(0, 6)) console.log(`   item #${p.k}: ${p.tris} tris ${p.ms} ms ${JSON.stringify(p.stats)}`);
    if (cs) console.log(`   sheets ${JSON.stringify(Object.fromEntries(Object.entries(cs).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, k === 'maxDev' || k === 'overLen' ? +v.toFixed(4) : Math.round(v)])))}`);
    const tris = b.triangleCount;
    if (args.edges) {
      const tris = [];
      for (const geoms of b.parts.values()) for (const g of geoms) {
        const a = g.getAttribute('position');
        for (let i = 0; i + 2 < a.count; i += 3) tris.push([a.getX(i), a.getY(i), a.getZ(i), a.getX(i + 1), a.getY(i + 1), a.getZ(i + 1), a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2), g.userData.src ?? '']);
      }
      const vid = new Map(), id = (x, y, z) => { const k = `${Math.round(x * 500)},${Math.round(y * 500)},${Math.round(z * 500)}`; let v = vid.get(k); if (v === undefined) vid.set(k, (v = vid.size)); return v; };
      const V = tris.map((t) => [id(t[0], t[1], t[2]), id(t[3], t[4], t[5]), id(t[6], t[7], t[8])]);
      const uses = new Map(), ek = (a, c) => (a < c ? `${a},${c}` : `${c},${a}`);
      for (const v of V) for (let k = 0; k < 3; k++) uses.set(ek(v[k], v[(k + 1) % 3]), (uses.get(ek(v[k], v[(k + 1) % 3])) ?? 0) + 1);
      const topAt = (x, z, below) => {
        let best = H(x, z) - (plan.drop ? plan.drop(x, z) : 0);
        for (const t of tris) {
          const d = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8]);
          if (Math.abs(d) < 1e-9) continue;
          const u = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / d, v = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / d, w = 1 - u - v;
          if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
          const y = u * t[1] + v * t[4] + w * t[7];
          if (y <= below && y > best) best = y;
        }
        return best;
      };
      let n = 0, len = 0;
      const ex = [];
      tris.forEach((t, ti) => {
        const ny = (t[5] - t[2]) * (t[6] - t[0]) - (t[3] - t[0]) * (t[8] - t[2]);
        const area = Math.abs(ny) / 2;
        if (area < 1e-6) return;
        for (let k = 0; k < 3; k++) {
          if (uses.get(ek(V[ti][k], V[ti][(k + 1) % 3])) !== 1) continue;
          const a = k * 3, c = ((k + 1) % 3) * 3, o = ((k + 2) % 3) * 3;
          const ax = t[a], ay = t[a + 1], az = t[a + 2], bx = t[c], by = t[c + 1], bz = t[c + 2];
          const L = Math.hypot(bx - ax, bz - az);
          if (L < 0.01) continue;
          let ox = -(bz - az) / L, oz = (bx - ax) / L;
          const mx = (ax + bx) / 2, mz = (az + bz) / 2;
          if (ox * (t[o] - mx) + oz * (t[o + 2] - mz) > 0) { ox = -ox; oz = -oz; }
          const y = (ay + by) / 2, gap = y - topAt(mx + ox * 0.06, mz + oz * 0.06, y + 0.02);
          if (gap > 0.03) {
            n++;
            len += L;
            if (ex.length < 8) ex.push(`${t[9]} @${mx.toFixed(2)},${y.toFixed(2)},${mz.toFixed(2)} gap ${gap.toFixed(3)} L ${L.toFixed(2)}`);
          }
        }
      });
      console.log(`   open edges ${key}: ${n} over 3 cm, ${len.toFixed(1)} m; ${ex.join(' | ')}`);
      if (args.near) {
        const [qx, qz, qr = 0.8] = String(args.near).split(',').map(Number);
        for (const t of tris) {
          const cx = (t[0] + t[3] + t[6]) / 3, cz = (t[2] + t[5] + t[8]) / 3;
          if (Math.hypot(cx - qx, cz - qz) < qr) console.log('     tri', t.slice(0, 9).map((v) => v.toFixed(3)).join(' '), t[9]);
        }
      }
    }
    if (args.holes) {
      const [cx, cz] = key.split(',').map(Number);
      const R = 0.25, N = Math.round(128 / R);
      const cov = new Uint8Array(N * N);
      // The neighbour cells' surfaces reach in too (a piece is built in the cell of its middle).
      const nb = new MeshBuilder();
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        for (const it of work.cells.get(`${cx + dx},${cz + dz}`)?.items ?? []) {
          try {
            it(nb);
          } catch {
            /* counted in its own cell */
          }
        }
      }
      for (const geoms of [...b.parts.values(), ...nb.parts.values()]) for (const g of geoms) {
        const a = g.getAttribute('position');
        for (let i = 0; i + 2 < a.count; i += 3) {
          const A = [a.getX(i), a.getZ(i)], B = [a.getX(i + 1), a.getZ(i + 1)], C = [a.getX(i + 2), a.getZ(i + 2)];
          const d = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
          if (Math.abs(d) < 1e-9) continue;
          const i0 = Math.max(0, Math.floor((Math.min(A[0], B[0], C[0]) - cx * 128) / R)), i1 = Math.min(N - 1, Math.ceil((Math.max(A[0], B[0], C[0]) - cx * 128) / R));
          const j0 = Math.max(0, Math.floor((Math.min(A[1], B[1], C[1]) - cz * 128) / R)), j1 = Math.min(N - 1, Math.ceil((Math.max(A[1], B[1], C[1]) - cz * 128) / R));
          for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
            const x = cx * 128 + (ii + 0.5) * R, z = cz * 128 + (j + 0.5) * R;
            const u = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (z - C[1])) / d, v = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (z - C[1])) / d;
            if (u >= -1e-6 && v >= -1e-6 && 1 - u - v >= -1e-6) cov[j * N + ii] = 1;
          }
        }
      }
      let holes = 0;
      const ex = [];
      for (let j = 0; j < N; j++) for (let ii = 0; ii < N; ii++) {
        if (cov[j * N + ii]) continue;
        const x = cx * 128 + (ii + 0.5) * R, z = cz * 128 + (j + 0.5) * R;
        if (!roadsMod.cityPavedAt(x, z)) continue;
        holes++;
        if (ex.length < 6 && !ex.some(([qx, qz]) => Math.hypot(qx - x, qz - z) < 10)) ex.push([+x.toFixed(2), +z.toFixed(2), JSON.stringify(roadsMod.cityPavingAt(x, z))]);
      }
      console.log(`   holes ${key}: ${holes} cells (${(holes * R * R).toFixed(1)} m²) e.g. ${ex.map((e) => e.join(' ')).join(' ; ')}`);
      bySrc.__holes = (bySrc.__holes ?? 0) + holes;
    }
    if (args.probe) {
      for (const [px, pz] of String(args.probe).split(';').map((q) => q.split(',').map(Number))) {
        if (`${Math.floor(px / 128)},${Math.floor(pz / 128)}` !== key) continue;
        console.log(`   probe ${px},${pz}: heightAt ${H(px, pz).toFixed(3)}; paving ${JSON.stringify(roadsMod.cityPavingAt?.(px, pz) ?? [])}`);
        for (const [mk, geoms] of b.parts) for (const g of geoms) {
          const a = g.getAttribute('position');
          for (let i = 0; i + 2 < a.count; i += 3) {
            const A = [a.getX(i), a.getY(i), a.getZ(i)], B = [a.getX(i + 1), a.getY(i + 1), a.getZ(i + 1)], C = [a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2)];
            const d = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
            if (Math.abs(d) < 1e-12) continue;
            const u = ((B[2] - C[2]) * (px - C[0]) + (C[0] - B[0]) * (pz - C[2])) / d, v = ((C[2] - A[2]) * (px - C[0]) + (A[0] - C[0]) * (pz - C[2])) / d, w = 1 - u - v;
            if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
            console.log(`     y ${(u * A[1] + v * B[1] + w * C[1]).toFixed(3)} (+${(u * A[1] + v * B[1] + w * C[1] - H(px, pz)).toFixed(3)})  ${mk.split('|')[0]}  ${g.userData.src ?? ''}`);
          }
        }
      }
    }
    if (args['by-src']) {
      for (const geoms of b.parts.values()) for (const g of geoms) {
        const src = String(g.userData.src ?? '?').split(':');
        const k = src[0] === 'street' ? `street:${src[2] ?? ''}` : src[0];
        bySrc[k] = (bySrc[k] ?? 0) + g.getAttribute('position').count / 3;
      }
    }
    rows.push({ key, items: c.items.length, tris, colliders: b.colliders.length, ms: +ms.toFixed(1), slowestMs: +slow.toFixed(1), slowest: slowTag });
    total.tris += tris;
    total.items += c.items.length;
    total.ms += ms;
    total.colliders += b.colliders.length;
    log(`cell ${key}: ${c.items.length} items, ${tris} tris, ${b.colliders.length} colliders, ${ms.toFixed(0)} ms (slowest item ${slow.toFixed(1)} ms ${slowTag})`);
  }
  log(`total: ${JSON.stringify({ ...total, ms: +total.ms.toFixed(0) })}`);
  if (args['by-src']) {
    const by = Object.entries(bySrc).sort((a, b) => b[1] - a[1]);
    for (const [k, v] of by) console.log(`   ${k.padEnd(24)} ${v}`);
  }
  if (args.json) writeFileSync(resolve(root, String(args.json)), JSON.stringify({ profile: hm.profile, rows, total }, null, 1));
} finally {
  await server.close();
}
