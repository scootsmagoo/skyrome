#!/usr/bin/env node
/**
 * Render-submit probe: where the CPU time of a frame's render goes, and what a switch saves.
 *
 *   node scripts/perf-probe.mjs [--view forum] [--frames 90] [--rounds 3] [--size 1280x720]
 *                               [--graphics high|medium|low] [--query 'a=1'] [--ab default|none|'name=js;;name'] (switches split on ';;')
 *                               [--json out.json] [--browser webkit]
 *                               [--gpu] [--glcount] [--cpuprofile <ms> [--pan] [--top n] [--match <re>] [--callers <fn>]]
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
};

function hideGroups(re) {
  return `const r = new RegExp(${JSON.stringify(re)}); game.__probeHidden ??= new Map();
    for (const c of game.scene.children) if (r.test(c.name)) {
      if (on) { game.__probeHidden.set(c, c.visible); c.visible = false; }
      else if (game.__probeHidden.has(c)) { c.visible = game.__probeHidden.get(c); game.__probeHidden.delete(c); }
    }`;
}

function parseAb(s) {
  if (!s || s === 'default') return DEFAULT_AB;
  if (s === 'none') return {};
  const out = {};
  for (const part of String(s).split(';;')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1);
    else if (DEFAULT_AB[part.trim()]) out[part.trim()] = DEFAULT_AB[part.trim()];
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
  ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc']
  : [];
const browser = await pw[browserName].launch({ headless: true, args: launchArgs });
const out = { view, graphics: args.graphics ?? 'high', base: null, ab: [] };
try {
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
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
      const g = await page.evaluate(gpuPasses, 60);
      console.log(`GPU (${st}): total ${g?.total} = shadow ${g?.shadowPerFrame} (${g?.shadowPerPass}/pass) + scene ${g?.scene} + post ${g?.post}`);
      (out.gpuStates ??= []).push({ state: st, ...g });
    }
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

/** In the page: GPU ms per pass over `n` frames (timer queries). */
async function gpuPasses(n) {
  const game = window.__skyrome.game;
  const r = game.renderer;
  const gl = r.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return null;
  const pending = [];
  let open = null;
  const begin = (pass) => { if (open) gl.endQuery(ext.TIME_ELAPSED_EXT); const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); open = { q, pass }; pending.push(open); };
  const end = () => { if (open) { gl.endQuery(ext.TIME_ELAPSED_EXT); open = null; } };
  const sm = r.shadowMap;
  const smRender = sm.render;
  sm.render = function (lights, sc, cam) {
    if (sc !== game.scene) return smRender.call(this, lights, sc, cam);
    const will = sm.enabled && (sm.autoUpdate || sm.needsUpdate) && lights.length > 0;
    if (will) begin('shadow');
    smRender.call(this, lights, sc, cam);
    begin('scene');
  };
  const rf = game.renderFrame;
  game.renderFrame = () => { begin('scene'); rf(); end(); };
  const after = game.scene.onAfterRender;
  game.scene.onAfterRender = function (...a) { after.apply(this, a); begin('post'); };
  await new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  sm.render = smRender;
  game.renderFrame = rf;
  game.scene.onAfterRender = after;
  await new Promise((res) => setTimeout(res, 200));
  const sum = { shadow: 0, scene: 0, post: 0 };
  const cnt = { shadow: 0, scene: 0, post: 0 };
  let frames = 0;
  for (const p of pending) {
    let k = 0;
    while (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE) && k++ < 50) await new Promise((res) => setTimeout(res, 5));
    if (gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) { sum[p.pass] += gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6; cnt[p.pass]++; }
    gl.deleteQuery(p.q);
    if (p.pass === 'post') frames++;
  }
  const f = Math.max(1, frames);
  return { frames, shadowPerPass: +(sum.shadow / Math.max(1, cnt.shadow)).toFixed(2), shadowPerFrame: +(sum.shadow / f).toFixed(2), scene: +(sum.scene / f).toFixed(2), post: +(sum.post / f).toFixed(2), total: +((sum.shadow + sum.scene + sum.post) / f).toFixed(2) };
}

/** In the page: hooks around three.js's render steps (once). */
async function install(sampleSrc) {
  const game = window.__skyrome.game;
  window.__probeSample = (0, eval)(`(${sampleSrc})`);
  if (game.__probe) return;
  // The game's own modules (same URLs as the app's imports, so the same instances): runtime switches.
  window.__probeMods = {};
  try { window.__probeMods.fastCull = await import('/src/gfx/fastCull.ts'); } catch {}
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
