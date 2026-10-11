#!/usr/bin/env node
/**
 * Real memory of a game session: boots the game headless (Chromium), waits, forces a garbage
 * collection and reports the resident memory of the page (renderer) and GPU processes plus the JS
 * heap, then what holds memory inside the game: CPU-side geometry bytes by top-level scene group
 * (arrays freed after upload count 0, as in perf.mjs), the renderer's geometry / texture / program
 * counts and where the textures come from (gfx/textureCensus.ts), and the city batches' live and
 * allocated vertices. Compare runs before and after memory work.
 *
 *   node scripts/memory.mjs [--query "at=colosseum"] [--wait 15] [--runs 3] [--prod] [--json out.json]
 *
 * --runs N   boot N times (a fresh browser each) and print every run plus the median: streaming and
 *            the crowd move the heap by 20–40 MB between two boots.
 * --prod     measure the production build (vite build into .cache/memprod, served by vite preview),
 *            which is what the owner plays: the dev server keeps every module's source text and
 *            inline source map in the heap (about 75 MB).
 */
import { createServer as createNetServer } from 'node:net';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]]] : a), []));
const runs = Number(args.runs ?? 1);
const freePort = () =>
  new Promise((res) => {
    const s = createNetServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });

const vite = await import('vite');
const port = await freePort();
let server;
if (args.prod) {
  const outDir = resolve(root, '.cache/memprod');
  await vite.build({ root, logLevel: 'error', build: { outDir, emptyOutDir: true } });
  server = await vite.preview({ root, logLevel: 'error', build: { outDir }, preview: { port, strictPort: true, host: '127.0.0.1' } });
} else {
  server = await vite.createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
  await server.listen();
}
const { chromium } = await import('playwright');

/** Inside the page: the game's own view of its memory. */
function inspect() {
  const game = window.__skyrome.game;
  const attrBytes = (a) => (a.array ?? a.data?.array)?.byteLength ?? 0;
  const seen = new Set();
  const groups = new Map();
  for (const top of game.scene.children) {
    const key = top.name || top.type;
    let bytes = 0;
    top.traverse((o) => {
      if (o.isInstancedMesh) bytes += o.instanceMatrix.array.byteLength;
      const g = o.geometry;
      if (!g || seen.has(g)) return;
      seen.add(g);
      for (const a of Object.values(g.attributes)) bytes += attrBytes(a);
      if (g.index) bytes += attrBytes(g.index);
    });
    groups.set(key, (groups.get(key) ?? 0) + bytes);
  }
  const total = [...groups.values()].reduce((s, b) => s + b, 0);
  const top = [...groups].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, b]) => `${k} ${(b / 1048576).toFixed(1)}`);
  // Texture classes (same rules as gfx/textureCensus.ts, inlined so the prod build needs no import).
  const maps = new Set();
  const skeletons = new Set();
  let batched = 0;
  const KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'lightMap', 'envMap'];
  game.scene.traverse((o) => {
    if (o.isSkinnedMesh) skeletons.add(o.skeleton);
    if (o.isBatchedMesh) batched++;
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      for (const k of KEYS) if (m[k]?.isTexture) maps.add(m[k]);
      if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u?.value?.isTexture) maps.add(u.value);
    }
  });
  let bones = 0;
  for (const s of skeletons) if (s.boneTexture) bones++;
  const city = game.city?.pool?.stats?.();
  const info = game.renderer.info;
  return {
    geometryMB: +(total / 1048576).toFixed(1),
    geometryTop: top.join(' · '),
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programs: info.programs?.length ?? 0,
    census: { materialMaps: maps.size, boneTextures: bones, batchedMeshes: batched },
    city: city ? { verts: city.verts, cap: city.cap, batches: city.batches } : null,
  };
}

const results = [];
for (let r = 0; r < runs; r++) {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
  await page.goto(`http://127.0.0.1:${port}/?scene=rome&${args.query ?? 'at=rostra&hour=10'}`);
  await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 180000, polling: 200 });
  await page.waitForTimeout(Number(args.wait ?? 15) * 1000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(1500);
  await cdp.send('HeapProfiler.collectGarbage');
  const heap = await page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576));
  const game = await page.evaluate(inspect);
  // Resident memory of this browser's renderer and GPU processes (macOS/Linux ps; KB). Only the process
  // tree of the browser launched here: other agents' or windows' Chromiums on the machine are not counted.
  const bcdp = await browser.newBrowserCDPSession();
  const { processInfo } = await bcdp.send('SystemInfo.getProcessInfo');
  const table = execSync('ps -axo pid=,ppid=,rss=,command=').toString().split('\n').map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map((m) => ({ pid: +m[1], ppid: +m[2], rss: +m[3], cmd: m[4] }));
  const mine = new Set(processInfo.map((p) => p.id));
  const sum = (re) => Math.round(table.filter((x) => mine.has(x.pid) && re.test(x.cmd)).reduce((s2, x) => s2 + x.rss, 0) / 1024);
  const renderer = sum(/--type=renderer/);
  const gpu = sum(/--type=gpu-process/);
  const row = { heap, renderer, gpu, ...game, errors };
  results.push(row);
  console.log(`run ${r + 1}: JS heap ${heap} MB · page process ${renderer} MB · GPU process ${gpu} MB · total ${renderer + gpu} MB`);
  console.log(`  geometry ${game.geometryMB} MB (${game.geometryTop})`);
  console.log(`  renderer: geometries ${game.geometries} · textures ${game.textures} (material maps ${game.census.materialMaps}, bone ${game.census.boneTextures}, batched meshes ${game.census.batchedMeshes}) · programs ${game.programs}`);
  if (game.city) console.log(`  city batches: ${game.city.batches} batches, ${game.city.verts} live / ${game.city.cap} allocated vertices`);
  if (errors.length) console.log(`  page errors: ${errors.join(' | ')}`);
  await browser.close();
}
if (runs > 1) {
  const med = (k) => {
    const v = results.map((x) => x[k]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  console.log(`median of ${runs}: JS heap ${med('heap')} MB · geometry ${med('geometryMB')} MB · textures ${med('textures')} · page ${med('renderer')} MB · GPU ${med('gpu')} MB`);
}
if (args.json) writeFileSync(args.json, JSON.stringify(results, null, 2));
await (server.close ? server.close() : server.httpServer?.close());
process.exit(results.some((x) => x.errors.length) ? 1 : 0);
