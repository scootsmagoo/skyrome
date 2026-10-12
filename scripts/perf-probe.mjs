#!/usr/bin/env node
/**
 * Render-submit probe: where the CPU time of a frame's render goes, and what a switch saves.
 *
 *   node scripts/perf-probe.mjs [--view forum] [--frames 90] [--rounds 3] [--size 1280x720] [--dpr 1]
 *                               [--graphics high|medium|low] [--query 'a=1'] [--ab default|none|'name=js;;name'] (switches split on ';;')
 *                               [--json out.json] [--browser webkit]
 *                               [--gpu [--gpu-post] [--gpu-detail]] [--gpu-bench] [--gpu-ab default|'name=js;;name']
 *                               [--reps 4] [--trials 25] [--settle-frames 3]
 *                               [--census] [--glcount] [--cpuprofile <ms> [--pan] [--top n] [--match <re>] [--callers <fn>]]
 *
 * It boots one view (the views of perf.mjs: spawn, forum, circus, cavea, colosseum, pantheon),
 * profiles every frame with hooks around three.js's own steps, and prints the mean ms of:
 *
 *   umw      scene.updateMatrixWorld (the whole-graph walk three.js does first)
 *   project  the render-list walk: visibility, frustum culling, sorting (onBeforeRender → shadows)
 *   shadow   the shadow-map pass (frames that render it; also as ms per frame)
 *   main     lights + background + drawing the render lists
 *   post     everything renderFrame does after the scene pass (post-processing)
 *   systems  the game's systems (frame CPU minus render)
 *
 * plus draw calls per pass (renderer.info) and the render-list sizes. Then each A/B switch runs:
 * the page alternates OFF/ON in `--rounds` rounds of `--frames` frames each (one page, one GPU:
 * the fairest comparison while other agents share the machine) and prints the delta per step.
 * A switch is `name=<js>` where the js runs in the page with `game` and `on` (true to switch the
 * thing off) and must undo itself when `on` is false. `--ab default` runs the built-in list.
 *
 * `--size 1512x860 --dpr 2` approximates the owner's MacBook (the game caps the pixel ratio at 1.5).
 *
 * GPU: `--gpu` times live frames with timer queries (shadow, scene, post; `--gpu-detail` per pass,
 * which ANGLE's flush at each query inflates); `--gpu-post` repeats it with each post effect off.
 * `--gpu-bench` is the steadier number: the view drawn `--reps` times inside one timer query, best
 * of `--trials` (frame, scene, post, one shadow pass). `--gpu-ab` runs the bench with switches
 * OFF/ON in one page, like `--ab`, and prints the median of the paired differences (`--gpu-ab
 * default`: GPU_AB, the post effects, the point lights, the shadow pass and scene groups). Other
 * programs on the GPU (other agents' browsers) add time to every number: compare the ratios, use
 * many trials, and check the machine's GPU load first (ioreg's "Device Utilization %").
 * Pass `--ab none` to skip the CPU switches. `--census` counts the draws of a frame by pass,
 * top-level scene group, kind of object and material.
 */
import { createServer as createNetServer } from 'node:net';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const [vw, vh] = (args.size ?? '1280x720').split('x').map(Number);
const browserName = args.browser ?? 'chromium';
const FRAMES = Number(args.frames ?? 90);
const ROUNDS = Number(args.rounds ?? 3);
const VIEWS = {
  spawn: '',
  forum: '&at=rostra',
  circus: '&at=circus-maximus',
  cavea: ['&at=circus-maximus', [29, 16, 459]],
  colosseum: '&at=colosseum',
  pantheon: '&at=pantheon',
};
const view = args.view ?? 'forum';

/** Built-in switches: each hides or stops one suspect for the A/B rounds. */
const DEFAULT_AB = {
  // A top-level scene group (or family) hidden: what it costs to walk, cull and draw.
  'hide city:batches': hideGroups('^city:batches$'),
  'hide lmbatch': hideGroups('^lmbatch:batches$'),
  'hide landmark:*': hideGroups('^landmark:'),
  'hide *:far': hideGroups(':far$'),
  'hide terrain-dressing': hideGroups('^terrain-dressing$'),
  'hide grass/forest/trees': hideGroups('^(grass|forest|landmark-trees|city:trees|capfora:groves)'),
  'hide actors': hideGroups('^actor:'),
  'hide standins': hideGroups('^content:standins'),
  'hide water': hideGroups('^water$'),
  // The shadow pass skipped (the map keeps its last content).
  'no shadow pass': 'game.__probeNoShadow = on;',
  'no post': 'game.post && (game.post.enabled = !on);',
  // Everything frozen for one frame: what matrixAutoUpdate still costs.
  'umw skipped': 'game.scene.matrixWorldAutoUpdate = !on;',
  // The audit's fixes switched back off one at a time (positive deltas = what each one saves).
  'old: scene root auto': 'game.scene.matrixAutoUpdate = on;',
  'old: no sealed walks': `const f = game.getSystem('staticFreeze'); if (f) f.switches.seal = !on;`,
  'old: no pre-cull': 'const m = window.__probeMods?.fastCull; if (m) m.fastCullSwitches.precull = !on;',
  'old: shared pass lists': 'const m = window.__probeMods?.fastCull; if (m) m.fastCullSwitches.passLists = !on;',
  // The opaque list sorted by shader program first (fewer program switches, each of which re-sends
  // the light uniforms), with the program id cached on the material.
  'sort by program': `const r = game.renderer; const props = r.properties;
    const pg = (m) => { let v = m.__pg; if (v === undefined || m.__pgv !== m.version) { const p = props.get(m).currentProgram; v = p ? p.id : 0; if (v) { m.__pg = v; m.__pgv = m.version; } } return v; };
    r.setOpaqueSort(on ? (a, b) => a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || pg(a.material) - pg(b.material) || a.material.id - b.material.id || a.z - b.z || a.id - b.id : null);`,
  // Phase 3's CPU fixes switched back off.
  'old: no shadow pre-cull': 'const m = window.__probeMods?.fastCull; if (m) m.fastCullSwitches.shadowPrecull = !on;',
  'old: no root cull': 'const m = window.__probeMods?.fastCull; if (m) m.fastCullSwitches.rootCull = !on;',
  // The tier's level-of-detail scale back at 1 (High's distances) in a Medium or Low page.
  'lod scale 1': 'const m = window.__probeMods?.lodScale; if (m) { game.__lodScale ??= m.lodScale.value; m.lodScale.value = on ? 1 : game.__lodScale; }',
  'old: one depth material': 'const m = window.__probeMods?.shadowLod; if (m) m.shadowLodSwitches.kindDepth = !on;',
};

/** Built-in GPU switches (`--gpu-ab default`): post passes, lights and scene groups. */
const GPU_AB = {
  'no ao': postFlag('aoEnabled'),
  'no contact': postFlag('contactEnabled'),
  'no bloom': postFlag('bloomEnabled'),
  'no shafts': postFlag('shaftsEnabled'),
  // The light pool's eight PointLights out of the scene (three recompiles without them).
  'no point lights': `for (const c of game.scene.children) if (/^poolLight/.test(c.name)) c.visible = !on;`,
  'no shadow pass': DEFAULT_AB['no shadow pass'],
  'hide actors': DEFAULT_AB['hide actors'],
  'hide grass/forest/trees': DEFAULT_AB['hide grass/forest/trees'],
  'hide terrain-dressing': DEFAULT_AB['hide terrain-dressing'],
  'hide city:batches': DEFAULT_AB['hide city:batches'],
  'hide lmbatch': DEFAULT_AB['hide lmbatch'],
  'hide water': DEFAULT_AB['hide water'],
  'hide transparent': hideWhere('m.transparent'),
  'hide hair': hideWhere("m.name === 'real-hair'"),
  'hide alpha-tested': hideWhere('m.alphaTest > 0'),
  // Textures the passes would upload mid-pass (bone textures, batch draw lists) uploaded before the
  // shadow pass instead: on Metal (ANGLE) an upload inside a render pass may split it.
  'preupload': `const r = game.renderer; const sm = r.shadowMap;
    if (!game.__preup) {
      game.__preup = { on: false, orig: sm.render };
      sm.render = function (...a) {
        if (game.__preup.on) {
          const rl = r.renderLists.get(game.scene, 0);
          for (const list of [rl.opaque, rl.transparent]) for (const it of list) {
            const o = it.object;
            if (o.isSkinnedMesh && o.skeleton.boneTexture && o.skeleton.boneTexture.version > 0) r.initTexture(o.skeleton.boneTexture);
            if (o.isBatchedMesh && o._indirectTexture) r.initTexture(o._indirectTexture);
          }
        }
        return game.__preup.orig.apply(this, a);
      };
    }
    game.__preup.on = on;`,
  // gfx/chunkPatches.ts's dark-point-light skip undone: the chunk restored and every material
  // recompiled (a cache-key suffix, since three.js keys programs without the chunk text).
  'lightskip off': `const T = window.__probeThree; const sp = window.__probeMods?.chunkPatches; const sc = T && T.ShaderChunk;
    if (sc && sp?.originalChunks?.lights_fragment_begin) game.__ls ??= { patched: sc.lights_fragment_begin, orig: sp.originalChunks.lights_fragment_begin, wrapped: new WeakSet() };
    if (game.__ls) {
      sc.lights_fragment_begin = on ? game.__ls.orig : game.__ls.patched;
      game.__lsTag = on ? ':noskip' : '';
      game.scene.traverse((o) => {
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) {
          if (!game.__ls.wrapped.has(m)) { const k = m.customProgramCacheKey; m.customProgramCacheKey = function () { return k.call(this) + (game.__lsTag ?? ''); }; game.__ls.wrapped.add(m); }
          m.needsUpdate = true;
        }
      });
    }`,
  // Every head's hair at LOD 0, as heads made 22 m away or more had it before phase 3.
  'hairlod off': `for (const a of game.actors.all()) { const rb = a.avatar?.real; if (rb?.head) rb.head.setLod(on ? 0 : Math.min(rb.lod, 2)); }`,
  // The AO pass reading the character mask for all twelve samples again (before phase 3).
  'ao mask always': `const m = game.post?.aoMat; if (m && (m.defines.AO_MASK_ALWAYS === 1) !== on) { if (on) m.defines.AO_MASK_ALWAYS = 1; else delete m.defines.AO_MASK_ALWAYS; m.needsUpdate = true; }`,
  // A cheaper tier's rows applied in this page (core/graphics.ts TIER_SETTINGS), except what needs a
  // new page or time to show: antialiasing (fixed when the renderer is made), the crowd and the view
  // distance (they stream), the frame cap. Give LODs time: --settle-frames 12.
  'tier medium': tierSwitch('medium'),
  'tier low': tierSwitch('low'),
  // Fill rate: the frame at Medium's render scale.
  'render scale 0.85': `game.__probeRs ??= game.settings.data.renderScale; game.settings.set('renderScale', on ? 0.85 : game.__probeRs);`,
};

// All of phase 3's GPU changes undone at once: the before/after of the pass in one page.
GPU_AB['phase 3 off'] = [GPU_AB['lightskip off'], GPU_AB['hairlod off'], GPU_AB['ao mask always'], DEFAULT_AB['old: no shadow pre-cull'], DEFAULT_AB['old: one depth material'], DEFAULT_AB['old: no root cull']].map((js) => `{ ${js} }`).join('\n');
DEFAULT_AB['phase 3 off'] = GPU_AB['phase 3 off'];

/** Hide every visible mesh whose (single) material `m` matches (and show them again). */
function hideWhere(cond) {
  return `game.__probeHid ??= new Map(); const key = ${JSON.stringify(cond)};
    if (on && !game.__probeHid.has(key)) { const list = []; game.scene.traverse((o) => { const m = o.material; if (o.visible && m && !Array.isArray(m) && (${cond})) { o.visible = false; list.push(o); } }); game.__probeHid.set(key, list); }
    else if (!on) { for (const o of game.__probeHid.get(key) ?? []) o.visible = true; game.__probeHid.delete(key); }`;
}

function tierSwitch(tier) {
  return `const g = window.__probeMods?.graphics; if (g) {
    const skip = new Set(['antialias', 'crowdDensity', 'viewDistance', 'maxFps']);
    const rows = Object.entries(g.TIER_SETTINGS[${JSON.stringify(tier)}]).filter(([k]) => !skip.has(k));
    game.__tierOrig ??= Object.fromEntries(rows.map(([k]) => [k, game.settings.data[k]]));
    for (const [k, v] of rows) { const want = on ? v : game.__tierOrig[k]; if (game.settings.data[k] !== want) game.settings.set(k, want); }
  }`;
}

function postFlag(k) {
  return `const p = game.post; if (p) { p.__orig ??= {}; p.__orig.${k} ??= p.${k}; p.${k} = on ? false : p.__orig.${k}; }`;
}

function hideGroups(re) {
  return `const r = new RegExp(${JSON.stringify(re)}); game.__probeHidden ??= new Map();
    for (const c of game.scene.children) if (r.test(c.name)) {
      if (on) { if (!game.__probeHidden.has(c)) game.__probeHidden.set(c, c.visible); c.visible = false; }
      else if (game.__probeHidden.has(c)) { c.visible = game.__probeHidden.get(c); game.__probeHidden.delete(c); }
    }`;
}

function parseAb(s, builtIn = DEFAULT_AB) {
  if (!s || s === true || s === 'default') return builtIn;
  if (s === 'none') return {};
  const out = {};
  for (const part of String(s).split(';;')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1);
    else {
      const js = builtIn[part.trim()] ?? DEFAULT_AB[part.trim()] ?? GPU_AB[part.trim()];
      if (js) out[part.trim()] = js;
      else console.warn(`unknown switch: ${part.trim()}`);
    }
  }
  return out;
}
const ab = parseAb(args.ab);

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
const launchArgs = browserName === 'chromium'
  ? [...(process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-angle=vulkan', '--enable-features=Vulkan']), '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc']
  : [];
const browser = await pw[browserName].launch({ headless: true, args: launchArgs });
const out = { view, graphics: args.graphics ?? 'high', base: null, ab: [] };
try {
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: Number(args.dpr ?? 1) });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
  const [query, tp] = Array.isArray(VIEWS[view]) ? VIEWS[view] : [VIEWS[view] ?? '', null];
  const gfx = args.graphics ? `&graphics=${args.graphics}` : '';
  const url = `${baseUrl}?scene=rome&quick=1&hour=10&fps=0${gfx}${query}${args.query ? `&${args.query}` : ''}`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 180000, polling: 100 });
  console.log(`boot ${((Date.now() - t0) / 1000).toFixed(1)} s  ${url}`);
  if (tp) {
    await page.waitForTimeout(1000);
    await page.evaluate(([x, y, z]) => window.__skyrome.game.player.teleport({ x, y, z }, 0), tp);
  }
  await page.waitForTimeout(Number(args.settle ?? 6000));
  await page.evaluate(install, sample.toString());
  out.base = await page.evaluate(sample, FRAMES * 2);
  printBase(out.base);
  if (args.gpu) {
    // GPU ms per pass (EXT_disjoint_timer_query_webgl2; Chromium): shadow map, scene, post. With
    // --gpu-post the post passes are switched off one at a time to price each.
    const states = args['gpu-post'] ? ['base', 'no ao', 'no bloom', 'no shafts', 'no contact', 'base'] : ['base'];
    await page.evaluate((src) => { window.__gpuPassesFn = (0, eval)(`(${src})`); }, gpuPasses.toString());
    for (const st of states) {
      await page.evaluate((st) => {
        const p = window.__skyrome.game.post;
        if (!p) return;
        p.__orig ??= { ao: p.aoEnabled, bloom: p.bloomEnabled, shafts: p.shaftsEnabled, contact: p.contactEnabled };
        Object.assign(p, { aoEnabled: p.__orig.ao, bloomEnabled: p.__orig.bloom, shaftsEnabled: p.__orig.shafts, contactEnabled: p.__orig.contact });
        if (st === 'no ao') p.aoEnabled = false;
        if (st === 'no bloom') p.bloomEnabled = false;
        if (st === 'no shafts') p.shaftsEnabled = false;
        if (st === 'no contact') p.contactEnabled = false;
      }, st);
      const g = await page.evaluate(([n, d]) => window.__gpuPassesFn(n, d), [Number(args['gpu-frames'] ?? 60), !!args['gpu-detail']]);
      printGpu(st, g);
      (out.gpuStates ??= []).push({ state: st, ...g });
    }
  }
  if (args['gpu-bench'] || args['gpu-ab']) {
    // GPU bench: the view drawn `--reps` times per timer query, best of `--trials` (see gpuBench).
    const reps = Number(args.reps ?? 4), trials = Number(args.trials ?? 25), settleFrames = Number(args['settle-frames'] ?? 3);
    const base = await page.evaluate(gpuBench, { js: null, reps, trials, settleFrames });
    out.gpuBench = base?.off ?? null;
    if (base?.off) console.log(`\nGPU bench (best of ${trials}, ${reps} draws a query): frame ${base.off.frame.toFixed(2)} ms (median ${base.off.frameMed.toFixed(2)}) = scene ${base.off.scene.toFixed(2)} + post ${base.off.post.toFixed(2)}; shadow pass ${base.off.shadow.toFixed(2)} ms (${(base.off.shadow / 2).toFixed(2)} a frame at 30 Hz)`);
    if (args['gpu-ab']) console.log('switches (ON = the thing off): median of the paired ON - OFF differences over the trials, and of the ratios');
    if (args['gpu-ab']) {
      const sw = parseAb(args['gpu-ab'], GPU_AB);
      out.gpuAb = [];
      for (const [name, js] of Object.entries(sw)) {
        const r = await page.evaluate(gpuBench, { js, reps, trials, settleFrames });
        r.name = name;
        out.gpuAb.push(r);
        printGpuAb(r);
      }
    }
  }
  if (args.census) {
    // Draws per frame by top-level scene group, kind of object and material, per pass (main/shadow).
    out.census = await page.evaluate(async (n) => {
      const game = window.__skyrome.game;
      const r = game.renderer;
      const top = (o) => { let p = o; while (p.parent && p.parent !== game.scene) p = p.parent; return p.parent ? (p.name || p.type) : '(scene)'; };
      const rows = new Map();
      let pass = 'main';
      const sm = r.shadowMap;
      const smRender = sm.render;
      let shadowPasses = 0;
      sm.render = function (lights, sc, cam) {
        if (sc === game.scene && sm.enabled && (sm.autoUpdate || sm.needsUpdate) && lights.length > 0) shadowPasses++;
        pass = 'shadow';
        try { return smRender.call(this, lights, sc, cam); } finally { pass = 'main'; }
      };
      const rbd = r.renderBufferDirect;
      r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
        if (scene === game.scene || (pass === 'shadow' && scene === null)) {
          const kind = object.isBatchedMesh ? 'batched' : object.isInstancedMesh ? 'instanced' : object.isSkinnedMesh ? 'skinned' : object.isPoints ? 'points' : object.isLine ? 'line' : object.isSprite ? 'sprite' : 'mesh';
          const key = `${pass}|${top(object).replace(/^actor:.*/, 'actor:*').replace(/^content:standins:.*/, 'content:standins:*').replace(/:[0-9a-f-]{6,}$/i, '')}|${kind}|${material.type}${material.transparent ? '+T' : ''}${material.alphaTest > 0 ? '+A' : ''}${material.side === 2 ? '+2S' : ''}`;
          const row = rows.get(key) ?? { draws: 0, sub: 0, inst: 0, tris: 0 };
          row.draws++;
          if (object.isBatchedMesh) row.sub += object._multiDrawCount ?? 0;
          if (object.isInstancedMesh) row.inst += object.count;
          rows.set(key, row);
          const t0 = r.info.render.triangles;
          const res = rbd.call(this, camera, scene, geometry, material, object, group);
          row.tris += r.info.render.triangles - t0;
          return res;
        }
        return rbd.call(this, camera, scene, geometry, material, object, group);
      };
      await new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      sm.render = smRender;
      r.renderBufferDirect = rbd;
      // Main-pass rows per frame, shadow rows per shadow pass.
      const per = (k) => (k.startsWith('shadow|') ? Math.max(1, shadowPasses) : n);
      return [...rows].map(([k, v]) => [k, +(v.draws / per(k)).toFixed(1), +(v.sub / per(k)).toFixed(0), +(v.inst / per(k)).toFixed(0), Math.round(v.tris / per(k))]).sort((a, b) => b[1] - a[1]);
    }, 30);
    const tot = {};
    for (const [k, d, , , t] of out.census) { const p = k.split('|')[0]; tot[p] ??= { draws: 0, tris: 0 }; tot[p].draws += d; tot[p].tris += t; }
    console.log(`\ndraws per frame by pass | top-level group | kind | material (T transparent, A alpha test, 2S double-sided): draws, triangles (sub-draws, instances); totals ${JSON.stringify(tot)} (main: per frame; shadow: per shadow pass)`);
    const row = ([k, d, sub, inst, t]) => console.log(`  ${String(d).padStart(6)}  ${(t / 1000).toFixed(0).padStart(5)} k tris  ${k}${sub ? `  (${sub} sub)` : ''}${inst ? `  (${inst} inst)` : ''}`);
    out.census.slice(0, Number(args.top ?? 60)).forEach(row);
    console.log('  by triangles:');
    [...out.census].sort((a, b) => b[4] - a[4]).slice(0, 25).forEach(row);
  }
  if (args.glcount) {
    // WebGL calls per frame by name (wraps the context's methods for a few frames).
    out.gl = await page.evaluate(async (n) => {
      const game = window.__skyrome.game;
      const gl = game.renderer.getContext();
      const counts = new Map();
      const orig = new Map();
      const proto = Object.getPrototypeOf(gl);
      for (const k of Object.getOwnPropertyNames(proto)) {
        let d;
        try { d = Object.getOwnPropertyDescriptor(proto, k); } catch { continue; }
        if (!d || typeof d.value !== 'function') continue;
        const f = d.value;
        orig.set(k, f);
        gl[k] = function (...a) { counts.set(k, (counts.get(k) ?? 0) + 1); return f.apply(this, a); };
      }
      const ext = gl.getExtension('WEBGL_multi_draw');
      let subDraws = 0, multi = 0;
      const md = ext?.multiDrawElementsWEBGL, ma = ext?.multiDrawArraysWEBGL;
      if (md) ext.multiDrawElementsWEBGL = function (...a) { multi++; subDraws += a[a.length - 1]; return md.apply(this, a); };
      if (ma) ext.multiDrawArraysWEBGL = function (...a) { multi++; subDraws += a[a.length - 1]; return ma.apply(this, a); };
      await new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      for (const k of orig.keys()) delete gl[k];
      if (md) ext.multiDrawElementsWEBGL = md;
      if (ma) ext.multiDrawArraysWEBGL = ma;
      const per = [...counts].map(([k, v]) => [k, +(v / n).toFixed(1)]).sort((a, b) => b[1] - a[1]);
      return { per, multi: +(multi / n).toFixed(1), subDraws: +(subDraws / n).toFixed(1) };
    }, 30);
    console.log(`\nGL calls per frame: ${out.gl.per.reduce((s, [, v]) => s + v, 0).toFixed(0)} total · multi-draws ${out.gl.multi} (${out.gl.subDraws} sub-draws)`);
    console.log('  ' + out.gl.per.slice(0, 30).map(([k, v]) => `${k} ${v}`).join(' · '));
  }
  if (args.cpuprofile) {
    // A sampling CPU profile over a few seconds of play: self time by function, the hot spots.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Profiler.start');
    const ms = Number(args.cpuprofile === true ? 4000 : args.cpuprofile);
    if (args.pan) {
      // Turn the view through full circles meanwhile (as perf.mjs's pan): streaming and LOD work.
      await page.evaluate(async (ms) => {
        const p = window.__skyrome.game.player;
        const yaw0 = p.yaw, t0 = performance.now();
        while (performance.now() - t0 < ms) {
          p.yaw = yaw0 + ((performance.now() - t0) / 6000) * Math.PI * 2;
          await new Promise((r) => requestAnimationFrame(r));
        }
      }, ms);
    } else await page.waitForTimeout(ms);
    const { profile } = await cdp.send('Profiler.stop');
    out.hot = hotSpots(profile, Number(args.top ?? 40));
    console.log('\nself time (ms over the window), hottest first:');
    for (const h of out.hot) console.log(`  ${h.ms.toFixed(1).padStart(7)}  ${h.fn}  ${h.at}`);
    out.inclusive = inclusive(profile, Number(args.top ?? 40), args.match ? new RegExp(args.match) : /src\//);
    console.log('\ninclusive time of matching functions (ms over the window):');
    for (const h of out.inclusive) console.log(`  ${h.ms.toFixed(1).padStart(7)}  ${h.fn}  ${h.at}`);
    if (args.callers) {
      out.callers = callers(profile, String(args.callers));
      console.log(`\ncallers of ${args.callers} (ms, two frames up):`);
      for (const h of out.callers) console.log(`  ${h.ms.toFixed(1).padStart(7)}  ${h.chain}`);
    }
    if (args.saveprofile) writeFileSync(resolve(root, args.saveprofile), JSON.stringify(profile));
  }
  for (const [name, js] of Object.entries(ab)) {
    const r = await page.evaluate(runAb, { js, frames: FRAMES, rounds: ROUNDS });
    r.name = name;
    out.ab.push(r);
    printAb(r);
  }
  if (errors.length) console.log(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} finally {
  await browser.close();
  if (server) await server.close();
}
if (args.json) writeFileSync(resolve(root, args.json), JSON.stringify(out, null, 2));
process.exit(0);

/**
 * In the page: GPU ms per pass over `n` live frames (EXT_disjoint_timer_query_webgl2): `shadow`,
 * `scene` and `post`. With `detail` one timer per step: `opaque` (sky, opaque and transmissive
 * lists), `transparent`, `resolve` (the MSAA blit into the HDR textures), then each post pass by
 * its material's name (AO, AOBlur, ShaftMask, ShaftBlur, BloomDown, BloomUp, Composite, FXAA).
 * Shared-GPU noise and ANGLE's flush at every query make these rough: compare with --gpu-ab.
 */
async function gpuPasses(n, detail = false) {
  const game = window.__skyrome.game;
  const r = game.renderer;
  const gl = r.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return null;
  const pending = [];
  let open = null;
  let inMain = false;
  let frame = 0;
  // Coarse by default (shadow, scene, post): every query boundary makes ANGLE flush its command
  // buffer, which on Metal inflates short passes several times over (--gpu-detail shows them anyway).
  const SCENE = new Set(['opaque', 'transparent', 'resolve']);
  const group = (pass) => (detail || pass === 'shadow' ? pass : SCENE.has(pass) ? 'scene' : 'post');
  const begin = (raw) => {
    const pass = group(raw);
    if (open?.pass === pass) return;
    if (open) gl.endQuery(ext.TIME_ELAPSED_EXT);
    const q = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    open = { q, pass, frame };
    pending.push(open);
  };
  const end = () => { if (open) { gl.endQuery(ext.TIME_ELAPSED_EXT); open = null; } };
  const sm = r.shadowMap;
  const smRender = sm.render;
  sm.render = function (lights, sc, cam) {
    if (sc !== game.scene) return smRender.call(this, lights, sc, cam);
    const will = sm.enabled && (sm.autoUpdate || sm.needsUpdate) && lights.length > 0;
    if (will) begin('shadow');
    smRender.call(this, lights, sc, cam);
    if (will) begin('opaque');
  };
  const rbd = r.renderBufferDirect;
  r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (inMain && detail && open?.pass === 'opaque' && material.transparent) begin('transparent');
    return rbd.call(this, camera, scene, geometry, material, object, group);
  };
  const blit = gl.blitFramebuffer;
  gl.blitFramebuffer = function (...a) {
    if (inMain && detail && open?.pass !== 'resolve') begin('resolve');
    return blit.apply(this, a);
  };
  const after = game.scene.onAfterRender;
  game.scene.onAfterRender = function (...a) { after.apply(this, a); inMain = false; begin('post'); };
  const post = game.post;
  const pass = post?.pass;
  if (post) post.pass = function (mat, target) { begin(mat.name || 'post'); return pass.call(this, mat, target); };
  const rf = game.renderFrame;
  game.renderFrame = () => { inMain = true; begin('opaque'); rf(); end(); inMain = false; frame++; };
  await new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  sm.render = smRender;
  r.renderBufferDirect = rbd;
  delete gl.blitFramebuffer;
  if (gl.blitFramebuffer !== blit) gl.blitFramebuffer = blit;
  game.scene.onAfterRender = after;
  if (post) post.pass = pass;
  game.renderFrame = rf;
  await new Promise((res) => setTimeout(res, 200));
  const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
  const sum = {};
  let shadowN = 0;
  for (const p of pending) {
    let k = 0;
    while (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE) && k++ < 50) await new Promise((res) => setTimeout(res, 5));
    if (gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) {
      sum[p.pass] = (sum[p.pass] ?? 0) + gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6;
      if (p.pass === 'shadow') shadowN++;
    }
    gl.deleteQuery(p.q);
  }
  const f = Math.max(1, frame);
  const passes = {};
  for (const [k, v] of Object.entries(sum)) passes[k] = +(v / f).toFixed(3);
  const g = (k) => sum[k] ?? 0;
  const sceneMs = g('scene') + g('opaque') + g('transparent') + g('resolve');
  let postMs = 0;
  for (const [k, v] of Object.entries(sum)) if (!['shadow', 'scene', 'opaque', 'transparent', 'resolve'].includes(k)) postMs += v;
  return {
    frames: frame,
    disjoint: !!disjoint,
    shadowPerPass: +(g('shadow') / Math.max(1, shadowN)).toFixed(2),
    shadowPerFrame: +(g('shadow') / f).toFixed(2),
    scene: +(sceneMs / f).toFixed(2),
    post: +(postMs / f).toFixed(2),
    total: +((g('shadow') + sceneMs + postMs) / f).toFixed(2),
    passes,
  };
}

/**
 * In the page: the GPU ms of drawing the current view, with a switch off and on. Each measurement
 * draws the view `reps` times inside ONE timer query (no idle gaps between draws, one flush), on
 * an idle queue (gl.finish first), and waits for its result before the next one: ANGLE on Metal
 * times a query's command buffers from when they are queued, so queries in flight together, or
 * behind the game's own frames, read long. A trial measures the sides in the order off, on, on,
 * off, re-applying the switch before each query (switches must be idempotent; one that recompiles
 * shaders is warmed first), so a drift in the machine's load cancels out. Per side: `frame` (the
 * frame without its shadow pass), `shadow` (one shadow-map render: frame with it minus without),
 * `scene` (the scene pass alone into the HDR target, MSAA resolve included) and `post` (frame
 * minus scene). The result keeps each side's best trial and the median of the per-trial
 * differences and ratios.
 */
async function gpuBench({ js, reps, trials, settleFrames = 3 }) {
  const game = window.__skyrome.game;
  const r = game.renderer;
  const gl = r.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return null;
  const sm = r.shadowMap;
  const fn = js ? new Function('game', 'on', js) : null;
  const time = async (side, draw) => {
    if (fn) await fn(game, side === 'on');
    gl.finish();
    const q = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    for (let i = 0; i < reps; i++) draw();
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    gl.flush();
    let k = 0;
    while (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && k++ < 500) await new Promise((res) => setTimeout(res, 1));
    const ok = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(ext.GPU_DISJOINT_EXT);
    const v = ok ? gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 / reps : NaN;
    gl.deleteQuery(q);
    return v;
  };
  const frame = (shadow) => () => {
    sm.autoUpdate = false;
    sm.needsUpdate = shadow;
    game.renderFrame();
  };
  const sceneOnly = () => {
    sm.autoUpdate = false;
    sm.needsUpdate = false;
    r.setRenderTarget(game.post?.enabled ? game.post.hdr : null);
    r.render(game.scene, game.camera);
    r.setRenderTarget(null);
  };
  const frames = async (n) => { for (let k = 0; k < n; k++) await new Promise((res) => requestAnimationFrame(res)); };
  if (fn) {
    // Warm both sides (shader compiles, render-target sizes) before anything is timed.
    for (const on of [true, false]) {
      await fn(game, on);
      await frames(settleFrames + 2);
      frame(true)();
      sceneOnly();
    }
  }
  const order = fn ? ['off', 'on', 'on', 'off'] : ['off'];
  const runs = { off: [], on: [] };
  for (let t = 0; t < trials; t++) {
    const acc = { off: { frame: 0, shadow: 0, scene: 0, n: 0 }, on: { frame: 0, shadow: 0, scene: 0, n: 0 } };
    for (const side of order) {
      if (fn) { await fn(game, side === 'on'); frame(true)(); } // the shadow map and uploads for this side, untimed
      const f = await time(side, frame(false));
      const sh = await time(side, frame(true));
      const sc = await time(side, sceneOnly);
      const a = acc[side];
      a.frame += f; a.shadow += sh - f; a.scene += sc; a.n++;
    }
    for (const side of fn ? ['off', 'on'] : ['off']) {
      const a = acc[side];
      if (a.n && Number.isFinite(a.frame) && Number.isFinite(a.shadow) && Number.isFinite(a.scene)) runs[side].push({ frame: a.frame / a.n, shadow: a.shadow / a.n, scene: a.scene / a.n, post: (a.frame - a.scene) / a.n });
      else runs[side].push(null);
    }
  }
  if (fn) { await fn(game, false); await frames(settleFrames); }
  // Trials where either side failed are dropped from both.
  const keep = runs.off.map((x, i) => x && (!fn || runs.on[i]));
  for (const side of ['off', 'on']) runs[side] = runs[side].filter((_, i) => keep[i]);
  const keys = ['frame', 'shadow', 'scene', 'post'];
  const med = (a) => { const v = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return v.length ? v[v.length >> 1] : NaN; };
  const min = (a) => Math.min(...a.filter((x) => Number.isFinite(x)));
  const out = { programs: r.info.programs?.length ?? 0, trials: runs.off.length };
  for (const side of fn ? ['off', 'on'] : ['off']) {
    const rs = runs[side];
    out[side] = { frame: +min(rs.map((x) => x.frame)).toFixed(3), scene: +min(rs.map((x) => x.scene)).toFixed(3), shadow: +Math.max(0, med(rs.map((x) => x.shadow))).toFixed(3), post: +Math.max(0, med(rs.map((x) => x.post))).toFixed(3), frameMed: +med(rs.map((x) => x.frame)).toFixed(3) };
  }
  if (fn && runs.on.length) {
    out.delta = {};
    out.ratio = {};
    for (const k of keys) {
      out.delta[k] = +med(runs.on.map((x, i) => x[k] - runs.off[i][k])).toFixed(3);
      out.ratio[k] = +med(runs.on.map((x, i) => x[k] / runs.off[i][k])).toFixed(3);
    }
  }
  return out;
}

function printGpu(label, g) {
  if (!g) { console.log(`GPU (${label}): no timer queries`); return; }
  const parts = Object.entries(g.passes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ');
  console.log(`GPU (${label}): total ${g.total} = shadow ${g.shadowPerFrame} (${g.shadowPerPass}/pass) + scene ${g.scene} + post ${g.post}${g.disjoint ? ' [disjoint]' : ''}`);
  console.log(`  ${parts}`);
}

function printGpuAb(r) {
  const f = (v) => (v > 0 ? '+' : '') + v.toFixed(2);
  if (!r?.delta) { console.log(`${String(r?.name).padEnd(26)} GPU: no timer queries`); return; }
  const d = r.delta;
  const pct = (k) => `${f((r.ratio[k] - 1) * 100)} %`;
  console.log(`${r.name.padEnd(26)} GPU frame ${f(d.frame)} ms (${pct('frame')}) · scene ${f(d.scene)} (${pct('scene')}) · post ${f(d.post)} · shadow pass ${f(d.shadow)}   [off: frame ${r.off.frame.toFixed(2)} (median ${r.off.frameMed.toFixed(2)}) = scene ${r.off.scene.toFixed(2)} + post ${r.off.post.toFixed(2)}, shadow ${r.off.shadow.toFixed(2)}/pass; ${r.trials} trials]`);
}

/** In the page: hooks around three.js's render steps (once). */
async function install(sampleSrc) {
  const game = window.__skyrome.game;
  window.__probeSample = (0, eval)(`(${sampleSrc})`);
  if (game.__probe) return;
  // The game's own modules (same URLs as the app's imports, so the same instances): runtime switches.
  window.__probeMods = {};
  try { window.__probeMods.fastCull = await import('/src/gfx/fastCull.ts'); } catch {}
  try { window.__probeMods.chunkPatches = await import('/src/gfx/chunkPatches.ts'); } catch {}
  try { window.__probeMods.shadowLod = await import('/src/gfx/shadowLod.ts'); } catch {}
  try { window.__probeMods.graphics = await import('/src/core/graphics.ts'); } catch {}
  try { window.__probeMods.lodScale = await import('/src/gfx/lodScale.ts'); } catch {}
  // three.js itself, the very module instance the game uses (Vite's optimized dependency URL).
  try {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/deps\/three\.js(\?|$)/.test(n));
    if (url) window.__probeThree = await import(url);
  } catch {}
  const r = game.renderer;
  const scene = game.scene;
  const P = { umw: 0, project: 0, shadow: 0, shadowFrames: 0, main: 0, post: 0, render: 0, cpu: 0, frames: 0,
    callsShadow: 0, callsMain: 0, callsPost: 0, opaque: 0, transparent: 0, objects: 0 };
  game.__probe = P;
  let tUmw = 0, tBefore = 0, tShadow0 = 0, tShadow1 = 0, tAfter = 0, inMain = false, shadowCalls = 0;
  const umw = scene.updateMatrixWorld.bind(scene);
  scene.updateMatrixWorld = (force) => {
    const t = performance.now();
    umw(force);
    tUmw += performance.now() - t;
  };
  // Chained: the game hooks the scene itself (gfx/fastCull's pre-cull runs here, counted in `project`).
  const before = scene.onBeforeRender;
  scene.onBeforeRender = function (...a) { tBefore = performance.now(); inMain = true; before.apply(this, a); };
  const sm = r.shadowMap;
  const smRender = sm.render.bind(sm);
  sm.render = (lights, sc, cam) => {
    if (sc !== scene) return smRender(lights, sc, cam);
    if (game.__probeNoShadow) sm.needsUpdate = false;
    tShadow0 = performance.now();
    const will = sm.enabled && (sm.autoUpdate || sm.needsUpdate) && lights.length > 0;
    smRender(lights, sc, cam);
    tShadow1 = performance.now();
    shadowCalls = r.info.render.calls;
    if (will) { P.shadow += tShadow1 - tShadow0; P.shadowFrames++; P.callsShadow += shadowCalls; }
  };
  const after = scene.onAfterRender;
  scene.onAfterRender = function (...a) {
    tAfter = performance.now();
    P.callsMain += r.info.render.calls - shadowCalls;
    inMain = false;
    after.apply(this, a);
  };
  const rf = game.renderFrame;
  game.renderFrame = () => {
    tUmw = 0;
    const t0 = performance.now();
    rf();
    const t1 = performance.now();
    P.render += t1 - t0;
    P.umw += tUmw;
    P.project += tShadow0 - tBefore;
    P.main += tAfter - tShadow1;
    P.post += t1 - tAfter;
    P.callsPost += r.info.render.calls;
    P.frames++;
  };
  // Total frame CPU from the game's own stats, sampled after each frame.
  const tick = () => { if (P.frames > 0) P.cpu += game.stats.cpuMs; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  void inMain;
}

/** In the page: reset the counters, run `n` frames, return the means. */
async function sample(n) {
  const game = window.__skyrome.game;
  const P = game.__probe;
  const frames = (k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  for (const k of Object.keys(P)) P[k] = 0;
  await frames(n);
  const f = Math.max(1, P.frames);
  const s = Math.max(1, P.shadowFrames);
  const lists = (() => {
    // Render-list sizes of the last main pass (three keeps them per scene).
    const rl = game.renderer.renderLists.get(game.scene, 0);
    return { opaque: rl.opaque.length, transparent: rl.transparent.length, transmissive: rl.transmissive.length };
  })();
  let objects = 0, auto = 0;
  game.scene.traverse((o) => { objects++; if (o.matrixAutoUpdate) auto++; });
  return {
    frames: P.frames,
    cpu: +(P.cpu / f).toFixed(2),
    render: +(P.render / f).toFixed(2),
    umw: +(P.umw / f).toFixed(2),
    project: +(P.project / f).toFixed(2),
    shadowPerPass: +(P.shadow / s).toFixed(2),
    shadow: +(P.shadow / f).toFixed(2),
    main: +(P.main / f).toFixed(2),
    post: +(P.post / f).toFixed(2),
    callsShadow: Math.round(P.callsShadow / s),
    callsMain: Math.round(P.callsMain / f),
    callsTotal: Math.round(P.callsPost / f),
    triangles: game.stats.triangles,
    lists,
    objects,
    autoMatrix: auto,
    programs: game.renderer.info.programs?.length ?? 0,
  };
}

/** In the page: alternate a switch off/on and return the mean of each side. */
async function runAb({ js, frames, rounds }) {
  const game = window.__skyrome.game;
  const fn = new Function('game', 'on', js);
  const keys = ['cpu', 'render', 'umw', 'project', 'shadow', 'main', 'post', 'callsMain', 'callsShadow'];
  const acc = { off: {}, on: {} };
  for (const k of keys) { acc.off[k] = 0; acc.on[k] = 0; }
  const sampleFn = window.__probeSample;
  for (let i = 0; i < rounds; i++) {
    for (const side of ['off', 'on']) {
      fn(game, side === 'on');
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const s = await sampleFn(frames);
      for (const k of keys) acc[side][k] += s[k] / rounds;
    }
  }
  fn(game, false);
  const delta = {};
  for (const k of keys) delta[k] = +(acc.on[k] - acc.off[k]).toFixed(2);
  return { off: acc.off, on: acc.on, delta };
}

function printBase(b) {
  console.log(`\nframe cpu ${b.cpu} ms · render ${b.render} = umw ${b.umw} + project ${b.project} + shadow ${b.shadow} (${b.shadowPerPass}/pass) + main ${b.main} + post ${b.post}`);
  console.log(`draws: shadow ${b.callsShadow}/pass · main ${b.callsMain} · total ${b.callsTotal} · tris ${(b.triangles / 1e6).toFixed(2)}M · lists ${JSON.stringify(b.lists)} · objects ${b.objects} (${b.autoMatrix} auto) · programs ${b.programs}`);
}

function printAb(r) {
  const d = r.delta;
  const f = (v) => (v > 0 ? '+' : '') + v.toFixed(2);
  console.log(`${r.name.padEnd(26)} cpu ${f(d.cpu)} · render ${f(d.render)} (umw ${f(d.umw)}, project ${f(d.project)}, shadow ${f(d.shadow)}, main ${f(d.main)}, post ${f(d.post)}) · draws main ${f(d.callsMain)} shadow ${f(d.callsShadow)}   [base render ${r.off.render.toFixed(2)}]`);
}

/** Self time per function from a CDP profile (ms), the `top` hottest. */
function hotSpots(profile, top) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) {
    const n = byId.get(profile.samples[i]);
    const cf = n.callFrame;
    const key = `${cf.functionName || '(anon)'}|${(cf.url || '').replace(/^.*\/(src|node_modules)\//, '$1/').replace(/\?.*$/, '')}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
  }
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, ms]) => {
    const [fn, at] = k.split('|');
    return { fn, at, ms };
  });
}

/** Self time of a function by its call chain (the two frames above it), to find who calls a hot spot. */
function callers(profile, name) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const label = (n) => `${n.callFrame.functionName || '(anon)'}@${(n.callFrame.url || '').replace(/^.*\/(src|node_modules)\//, '$1/').replace(/\?.*$/, '').replace(/^node_modules\/\.vite\/deps\//, '')}:${n.callFrame.lineNumber + 1}`;
  const tot = new Map();
  const dt = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) {
    let id = profile.samples[i];
    // The sample may be in a callee of the named function: walk up to it.
    let n = byId.get(id);
    while (n && n.callFrame.functionName !== name) { id = parent.get(id); n = id === undefined ? undefined : byId.get(id); }
    if (!n) continue;
    const chain = [];
    for (let p = parent.get(id), k = 0; p !== undefined && k < 3; p = parent.get(p), k++) chain.push(label(byId.get(p)));
    const key = chain.join(' < ');
    tot.set(key, (tot.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
  }
  return [...tot].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([chain, ms]) => ({ chain, ms }));
}

/** Inclusive time per function whose location matches `re` (each sample counted once per function). */
function inclusive(profile, top, re) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const keyOf = (n) => {
    const cf = n.callFrame;
    return `${cf.functionName || '(anon)'}|${(cf.url || '').replace(/^.*\/(src|node_modules)\//, '$1/').replace(/\?.*$/, '')}:${cf.lineNumber + 1}`;
  };
  const tot = new Map();
  const dt = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) {
    const seen = new Set();
    for (let id = profile.samples[i]; id !== undefined; id = parent.get(id)) {
      const k = keyOf(byId.get(id));
      if (seen.has(k) || !re.test(k)) continue;
      seen.add(k);
      tot.set(k, (tot.get(k) ?? 0) + (dt[i] ?? 0) / 1000);
    }
  }
  return [...tot].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, ms]) => {
    const [fn, at] = k.split('|');
    return { fn, at, ms };
  });
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) o[key] = true;
    else { o[key] = next; i++; }
  }
  return o;
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
