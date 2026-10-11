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
 * --lips: street-fit's raster lips (0.25 m; walkable floors of different builds, the drawn ground = heightAt − plan.drop)
 *         within the cell's street surfaces and the neighbours' that reach in: counts ≥ 3 / 12 / 30 cm and the worst.
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
if (args['by-src'] || args.probe || args.lips) globalThis.location = { search: '?audit' };
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
    if (args.lips) {
      const [cx, cz] = key.split(',').map(Number);
      const R = 0.25, N = Math.round(128 / R);
      const FLOOR = /paving|cobbles|gravel|dirt|sand|mud|concrete|basalt|mosaic|terracotta|grass|opus|floor|earth/;
      const sec = new Float32Array(N * N).fill(-Infinity), ssrc = new Int32Array(N * N).fill(-1), sfl = new Uint8Array(N * N), tmatS = new Array(N * N).fill('t'), steep = new Uint8Array(N * N), top = new Float32Array(N * N).fill(-Infinity), tsrc = new Int32Array(N * N).fill(-1), tfl = new Uint8Array(N * N).fill(1);
      const vis = new Float32Array(N * N);
      for (let j = 0; j < N; j++) for (let ii = 0; ii < N; ii++) {
        const x = cx * 128 + (ii + 0.5) * R, z = cz * 128 + (j + 0.5) * R;
        vis[j * N + ii] = H(x, z) - (plan.drop ? plan.drop(x, z) : 0);
      }
      const srcs = [], sid = new Map(), idOf = (s) => { let v = sid.get(s); if (v === undefined) { sid.set(s, (v = srcs.length)); srcs.push(s); } return v; };
      const nb = new MeshBuilder();
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        for (const it of work.cells.get(`${cx + dx},${cz + dz}`)?.items ?? []) {
          try {
            withAuditSource('nb', () => it(nb));
          } catch {
            /* counted in its own cell */
          }
        }
      }
      for (const [mk, geoms] of [...b.parts, ...nb.parts]) for (const g of geoms) {
        const mat = mk.split('|')[0], fl = FLOOR.test(mat) ? 1 : 0, si = idOf(String(g.userData.src ?? mat));
        const a = g.getAttribute('position');
        for (let i = 0; i + 2 < a.count; i += 3) {
          const A = [a.getX(i), a.getY(i), a.getZ(i)], B = [a.getX(i + 1), a.getY(i + 1), a.getZ(i + 1)], C = [a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2)];
          const d = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
          if (Math.abs(d) < 1e-9) continue;
          // street-fit indexes only up-facing triangles (normal within ~45° of up): steeper ones are walls to it.
          const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], wx = C[0] - A[0], wy = C[1] - A[1], wz = C[2] - A[2];
          const nX = uy * wz - uz * wy, nY = uz * wx - ux * wz, nZ = ux * wy - uy * wx;
          const up = nY / (Math.hypot(nX, nY, nZ) || 1) > 0.7;
          const i0 = Math.max(0, Math.floor((Math.min(A[0], B[0], C[0]) - cx * 128) / R)), i1 = Math.min(N - 1, Math.ceil((Math.max(A[0], B[0], C[0]) - cx * 128) / R));
          const j0 = Math.max(0, Math.floor((Math.min(A[2], B[2], C[2]) - cz * 128) / R)), j1 = Math.min(N - 1, Math.ceil((Math.max(A[2], B[2], C[2]) - cz * 128) / R));
          for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
            const x = cx * 128 + (ii + 0.5) * R, z = cz * 128 + (j + 0.5) * R;
            const u = ((B[2] - C[2]) * (x - C[0]) + (C[0] - B[0]) * (z - C[2])) / d, v = ((C[2] - A[2]) * (x - C[0]) + (A[0] - C[0]) * (z - C[2])) / d, w = 1 - u - v;
            if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
            const y = u * A[1] + v * B[1] + w * C[1], k = j * N + ii;
            if (y > vis[k] + 1.5 || y < vis[k] - 1.5) continue;
            if (!up) {
              if (Math.abs(nY) > 0.05 && nY > 0) steep[k] = 1;
              continue;
            }
            if (y > top[k]) { if (tsrc[k] !== si) { sec[k] = top[k]; ssrc[k] = tsrc[k]; sfl[k] = tfl[k]; } top[k] = y; tsrc[k] = si; tfl[k] = fl; tmatS[k] = mat; } else if (si !== tsrc[k] && y > sec[k]) { sec[k] = y; ssrc[k] = si; sfl[k] = fl; }
          }
        }
      }
      const kindOf = (q) => (q.startsWith('road:') || q.startsWith('street:') ? `${q.split(':')[0]}:${q.split(':').slice(-1)[0]}` : q.replace(/[:#].*$/, ''));
      let dbl = 0, dblSame = 0;
      for (let k = 0; k < N * N; k++) {
        if (top[k] >= vis[k] && ssrc[k] >= 0 && sec[k] >= vis[k] && tfl[k] && sfl[k] && top[k] - sec[k] >= 0.002 && top[k] - sec[k] < 0.15) {
          if (kindOf(srcs[tsrc[k]]) !== kindOf(srcs[ssrc[k]])) dbl++;
          else dblSame++;
        }
      }
      bySrc.__dbl = (bySrc.__dbl ?? 0) + dbl;
      bySrc.__dblSame = (bySrc.__dblSame ?? 0) + dblSame;
      for (let k = 0; k < N * N; k++) if (top[k] < vis[k]) { top[k] = vis[k]; tsrc[k] = -1; tfl[k] = 1; }
      const cnt = { c3: 0, c12: 0, c30: 0, s12: 0, s30: 0 };
      const bins = new Map();
      for (let j = 1; j < N - 2; j++) for (let ii = 1; ii < N - 2; ii++) {
        const k = j * N + ii;
        for (const dir of [1, N]) {
          const o = k + dir;
          if (tsrc[k] === tsrc[o] || !tfl[k] || !tfl[o]) continue;
          const dd = top[o] - top[k], ad = Math.abs(dd);
          if (ad < 0.03 || ad > 0.6) continue;
          const before = top[k] - top[k - dir], after = top[o + dir] - top[o];
          if (ad - Math.max(Math.abs(before), Math.abs(after)) < 0.03) continue;
          if (Math.sign(before) === Math.sign(dd) && Math.abs(before) > ad * 0.6) continue;
          const st = steep[k] || steep[o] || steep[k - dir] || steep[o + dir];
          cnt.c3++;
          if (ad >= 0.12) cnt.c12++;
          if (ad >= 0.3) cnt.c30++;
          if (st && ad >= 0.12) cnt.s12++;
          if (st && ad >= 0.3) cnt.s30++;
          if (ad < 0.12) continue;
          const hi = dd > 0 ? o : k, lo = dd > 0 ? k : o;
          const nm = (s) => (s < 0 ? 'terrain' : srcs[s]);
          const kd = (s) => { const q = nm(s); return q.startsWith('road:') || q.startsWith('street:') ? `${q.split(':')[0]}:${q.split(':').slice(-1)[0]}` : q.replace(/[:#].*$/, ''); };
          const pk = `__lp${ad >= 0.3 ? 30 : 12}${st ? 's' : ''} ${kd(tsrc[hi])} over ${kd(tsrc[lo])}${args.mats ? ` [${tmatS[hi]}>${tsrc[lo] < 0 ? 't' : tmatS[lo]}]` : ''}`;
          bySrc[pk] = (bySrc[pk] ?? 0) + 1;
          const hx = cx * 128 + ((hi % N) + 0.5) * R, hz = cz * 128 + (Math.floor(hi / N) + 0.5) * R;
          if (args.mats && ((globalThis.__ex ??= {})[pk] ??= []).length < 3 && !globalThis.__ex[pk].some((q) => Math.hypot(q[0] - hx, q[1] - hz) < 30)) {
            globalThis.__ex[pk].push([+hx.toFixed(2), +hz.toFixed(2), dir === 1 ? (o === hi ? 'lo-x' : 'lo+x') : (o === hi ? 'lo-z' : 'lo+z'), +ad.toFixed(3)]);
          }
          const x = cx * 128 + ((hi % N) + 0.5) * R, z = cz * 128 + (Math.floor(hi / N) + 0.5) * R;
          const bk = `${nm(tsrc[hi])}|${nm(tsrc[lo])}|${Math.floor(x / 4)},${Math.floor(z / 4)}`;
          const e = bins.get(bk);
          if (e) { e.n++; if (ad > e.v) Object.assign(e, { v: ad, x, z, hiY: top[hi], loY: top[lo], vis: vis[hi], dir: dir === 1 ? 'x' : 'z', st }); }
          else bins.set(bk, { pair: `${nm(tsrc[hi])} over ${nm(tsrc[lo])}`, n: 1, v: ad, x, z, hiY: top[hi], loY: top[lo], vis: vis[hi], dir: dir === 1 ? 'x' : 'z', st });
        }
      }
      console.log(`   lips ${key}: ${cnt.c3} cells ≥ 3 cm, ${cnt.c12} ≥ 12 cm, ${cnt.c30} ≥ 30 cm (beside a surface steeper than 45°: ${cnt.s12} / ${cnt.s30})`);
      for (const k of ['c3', 'c12', 'c30', 's12', 's30']) bySrc[`__lips_${k}`] = (bySrc[`__lips_${k}`] ?? 0) + cnt[k];
      const worst = [...bins.values()].sort((a, b) => b.v * Math.sqrt(b.n) - a.v * Math.sqrt(a.n)).slice(0, Number(args.lips === true ? 8 : args.lips));
      for (const e of worst) console.log(`     ${e.v.toFixed(3)} n${e.n} ${e.dir} @${e.x.toFixed(2)},${e.z.toFixed(2)} hi ${e.hiY.toFixed(2)} lo ${e.loY.toFixed(2)} ground(hi) ${e.vis.toFixed(2)}${e.st ? ' STEEP' : ''}  ${e.pair}`);
    }
    if (args.probe) {
      let probeNb = null;
      for (const [px, pz] of String(args.probe).split(';').map((q) => q.split(',').map(Number))) {
        if (`${Math.floor(px / 128)},${Math.floor(pz / 128)}` !== key) continue;
        console.log(`   probe ${px},${pz}: heightAt ${H(px, pz).toFixed(3)} drawn ${(H(px, pz) - (plan.drop ? plan.drop(px, pz) : 0)).toFixed(3)}; paving ${JSON.stringify(roadsMod.cityPavingAt?.(px, pz) ?? [])}`);
        if (!probeNb) {
          probeNb = new MeshBuilder();
          const [cx, cz] = key.split(',').map(Number);
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dz) continue;
            for (const it of work.cells.get(`${cx + dx},${cz + dz}`)?.items ?? []) {
              try {
                withAuditSource('nb', () => it(probeNb));
              } catch {
                /* counted in its own cell */
              }
            }
          }
        }
        for (const [mk, geoms] of [...b.parts, ...probeNb.parts]) for (const g of geoms) {
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
    for (const [k, v] of by) console.log(`   ${k.padEnd(24)} ${v}${globalThis.__ex?.[k] ? '  e.g. ' + globalThis.__ex[k].map((q) => q.join(' ')).join(' ; ') : ''}`);
  }
  if (args.json) writeFileSync(resolve(root, String(args.json)), JSON.stringify({ profile: hm.profile, rows, total }, null, 1));
} finally {
  await server.close();
}
