#!/usr/bin/env node
/**
 * Performance survey: boots the city at a set of viewpoints and reports, for each, the frame cost
 * the player would feel (uncapped fps, CPU ms per frame mean/p95), what the GPU is asked to draw
 * (draw calls, triangles, shader programs) looking four ways, which systems spend the CPU (the
 * game's per-system profiler), and memory (JS heap, geometry bytes by top-level scene group).
 *
 *   node scripts/perf.mjs [--views spawn,forum,circus,colosseum,pantheon] [--browser webkit]
 *                         [--size 1280x720] [--dpr 2] [--fps 0] [--settle 5000] [--json out.json]
 *                         [--url <server>]
 *
 * `--dpr 2 --size 1512x860` approximates a MacBook's browser window. `--fps 60` measures with the
 * default frame cap instead of uncapped. GPU time comes from EXT_disjoint_timer_query_webgl2
 * where the browser offers it (Chromium does).
 *
 * Headless GPU numbers are not the owner's MacBook, but they move together: compare runs.
 */
import { createServer as createNetServer } from 'node:net';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const [vw, vh] = (args.size ?? '1280x720').split('x').map(Number);
const browserName = args.browser ?? 'chromium';
const settle = Number(args.settle ?? 5000);
const dpr = Number(args.dpr ?? 1);
const fpsCap = Number(args.fps ?? 0);

/** URL query per view, plus an optional teleport (x, y, z) after boot. */
const VIEWS = {
  spawn: '',
  forum: '&at=rostra',
  circus: '&at=circus-maximus',
  cavea: ['&at=circus-maximus', [29, 16, 459]], // the top gallery of the Circus seating
  colosseum: '&at=colosseum',
  pantheon: '&at=pantheon',
};
const DEFAULT_VIEWS = ['spawn', 'forum', 'circus', 'colosseum', 'pantheon'];
const views = (args.views ? String(args.views).split(',') : DEFAULT_VIEWS).filter((v) => v in VIEWS);

let server = null;
let baseUrl = args.url;
if (!baseUrl) {
  const { createServer } = await import('vite');
  const port = await freePort();
  server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
  await server.listen();
  baseUrl = `http://127.0.0.1:${port}/`;
}

const pw = await import('playwright');
const launchArgs =
  browserName === 'chromium'
    ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc']
    : [];
const browser = await pw[browserName].launch({ headless: true, args: launchArgs });
const results = [];

try {
  for (const view of views) {
    const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
    const [query, tp] = Array.isArray(VIEWS[view]) ? VIEWS[view] : [VIEWS[view], null];
    const url = `${baseUrl}?scene=rome&quick=1&hour=10&fps=${fpsCap}${query}`;
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 120000, polling: 100 });
    const bootMs = Date.now() - t0;
    if (tp) {
      await page.waitForTimeout(1000);
      await page.evaluate(([x, y, z]) => window.__skyrome.game.player.teleport({ x, y, z }, 0), tp);
    }
    await page.waitForTimeout(settle);
    const r = await page.evaluate(measure);
    r.view = view;
    r.bootMs = bootMs;
    r.errors = errors.slice(0, 5);
    results.push(r);
    print(r);
    await page.close();
  }
} finally {
  await browser.close();
  if (server) await server.close();
}
if (args.json) writeFileSync(resolve(root, args.json), JSON.stringify(results, null, 2));
process.exit(0);

/** Runs in the page. */
async function measure() {
  const game = window.__skyrome.game;
  const p = game.player;
  const frames = (n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  globalThis.gc?.();
  game.profiling = true;
  game.profile.clear();
  const cpu = [];
  const dirs = [];
  const t0 = performance.now();
  let frameCount = 0;
  const yaw0 = p.yaw;
  for (let d = 0; d < 4; d++) {
    p.yaw = yaw0 + (d * Math.PI) / 2;
    await frames(10); // let streaming react to the new view
    let draws = 0, tris = 0, n = 0;
    for (let i = 0; i < 45; i++) {
      await frames(1);
      cpu.push(game.stats.cpuMs);
      draws = Math.max(draws, game.stats.drawCalls);
      tris = Math.max(tris, game.stats.triangles);
      n++;
    }
    frameCount += n + 10;
    dirs.push({ draws, tris });
  }
  const elapsed = performance.now() - t0;
  p.yaw = yaw0;

  // GPU time per frame (timer queries around the game's render, where available).
  let gpuMs = null;
  const gl = game.renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (ext) {
    const orig = game.renderFrame;
    const queries = [];
    game.renderFrame = () => {
      const q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      orig();
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      queries.push(q);
    };
    await frames(40);
    game.renderFrame = orig;
    await frames(4);
    const times = [];
    for (const q of queries) {
      let n = 0;
      while (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && n++ < 40) await new Promise((r) => setTimeout(r, 5));
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(ext.GPU_DISJOINT_EXT)) times.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
    }
    times.sort((a, b) => a - b);
    if (times.length) gpuMs = { median: +times[Math.floor(times.length / 2)].toFixed(1), p90: +times[Math.floor(times.length * 0.9)].toFixed(1) };
  }
  const canvas = game.renderer.domElement;
  cpu.sort((a, b) => a - b);
  const mean = cpu.reduce((s, v) => s + v, 0) / cpu.length;
  const p95 = cpu[Math.floor(cpu.length * 0.95)];

  // Geometry bytes, unique per geometry, grouped by the top-level scene child that holds it.
  const seen = new Set();
  const groups = new Map();
  let meshes = 0, visibleMeshes = 0, instances = 0;
  // CPU-side bytes (arrays freed after upload count as 0 here; they live on the GPU only).
  const attrBytes = (a) => (a.array ?? a.data?.array)?.byteLength ?? 0;
  const geoBytes = (g) => {
    let b = 0;
    for (const a of Object.values(g.attributes)) b += attrBytes(a);
    if (g.index) b += attrBytes(g.index);
    return b;
  };
  for (const top of game.scene.children) {
    const key = top.name || top.type;
    const e = groups.get(key) ?? { bytes: 0, meshes: 0, objects: 0 };
    top.traverse((o) => {
      e.objects++;
      if (!o.isMesh && !o.isInstancedMesh && !o.isLine && !o.isPoints) return;
      meshes++;
      e.meshes++;
      if (o.visible) visibleMeshes++;
      if (o.isInstancedMesh) {
        instances += o.count;
        e.bytes += o.instanceMatrix.array.byteLength;
      }
      if (o.geometry && !seen.has(o.geometry)) {
        seen.add(o.geometry);
        e.bytes += geoBytes(o.geometry);
      }
    });
    groups.set(key, e);
  }
  const top = [...groups].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 10)
    .map(([k, e]) => ({ group: k, mb: +(e.bytes / 1048576).toFixed(1), meshes: e.meshes, objects: e.objects }));
  const prof = [...game.profile].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, ms]) => [k, +ms.toFixed(2)]);
  const info = game.renderer.info;
  const mem = performance.memory;
  game.profiling = false;
  return {
    fps: +((frameCount / elapsed) * 1000).toFixed(1),
    gpuMs,
    buffer: [canvas.width, canvas.height],
    cpuMean: +mean.toFixed(1),
    cpuP95: +p95.toFixed(1),
    dirs,
    programs: info.programs?.length ?? null,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
    sceneMeshes: meshes,
    visibleMeshes,
    instances,
    geometryMB: +([...groups.values()].reduce((s, e) => s + e.bytes, 0) / 1048576).toFixed(1),
    topGroups: top,
    profile: prof,
    player: p.position.toArray().map((v) => Math.round(v)),
  };
}

function print(r) {
  console.log(`\n== ${r.view}  (boot ${(r.bootMs / 1000).toFixed(1)} s, player ${r.player.join(', ')})`);
  console.log(`  ${r.buffer.join('×')} · gpu ${r.gpuMs ? `${r.gpuMs.median} ms median / ${r.gpuMs.p90} p90` : 'n/a'}`);
  console.log(`  ${r.fps} fps · cpu ${r.cpuMean} ms mean / ${r.cpuP95} ms p95 · programs ${r.programs} · geo ${r.geometries} · tex ${r.textures} · heap ${r.heapMB} MB`);
  console.log(`  draws/tris by direction: ${r.dirs.map((d) => `${d.draws}/${(d.tris / 1e6).toFixed(2)}M`).join('  ')}`);
  console.log(`  meshes ${r.sceneMeshes} (${r.visibleMeshes} visible) · instances ${r.instances} · geometry ${r.geometryMB} MB`);
  console.log(`  geometry by group: ${r.topGroups.map((g) => `${g.group} ${g.mb} MB/${g.meshes}`).join(' · ')}`);
  console.log(`  cpu by system: ${r.profile.map(([k, ms]) => `${k} ${ms}`).join(' · ')}`);
  if (r.errors.length) console.log(`  page errors: ${r.errors.join(' | ')}`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

function freePort() {
  return new Promise((res, rej) => {
    const s = createNetServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
    s.on('error', rej);
  });
}
