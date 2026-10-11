#!/usr/bin/env node
/**
 * Same-camera A/B screenshots: one page, the game paused (nothing moves between the two shots), a
 * switch flipped between them, and a pixel diff of the pair.
 *
 *   node scripts/ab-shot.mjs [--view forum] [--switch lightskip,hairlod] [--yaw 0,90,180,270]
 *                            [--size 1280x720] [--dpr 1] [--query 'a=1'] [--out .shots/ab]
 *                            [--graphics high|medium|low] [--browser chromium|webkit] [--hud]
 *                            [--crop x,y,w,h [--zoom 3]]
 *
 * For every yaw (degrees added to the player's) and switch it saves `<view>-<yaw>-<switch>-old.png`
 * (the switch on: the old behaviour), `-new.png`, and `-diff.png` (differences × 8 on black), and
 * prints the share of pixels that differ by more than 2 and 16 levels and the largest difference
 * (the final dither changes every frame by a level or two: compare with the > 2 share). The HUD
 * is hidden unless `--hud`. `--crop` also saves `-crop.png`: that region (CSS pixels) of the old
 * shot and the new one side by side, enlarged.
 * Switches (each must undo itself when `on` is false):
 *
 *   lightskip      gfx/chunkPatches.ts's dark-point-light skip undone (every material recompiled)
 *   hairlod        every head's hair at LOD 0, as heads made 22 m away or more had it before phase 3
 *   kinddepth      one shared depth material in the shadow pass (gfx/shadowLod.ts)
 *   shadowprecull  batches with nothing in the shadow view still drawn (gfx/fastCull.ts)
 *   aomask         the AO pass reading the character mask for every sample (gfx/post/ao.ts)
 *   rootcull       people not culled as a whole before the scene walk (gfx/fastCull.ts)
 *   phase3         all of the above at once
 *   'name=js'      your own (`game` and `on` in scope), as in scripts/perf-probe.mjs
 */
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const [vw, vh] = (args.size ?? '1280x720').split('x').map(Number);
const outDir = resolve(root, args.out ?? '.shots/ab');
mkdirSync(outDir, { recursive: true });
const VIEWS = { spawn: '', forum: '&at=rostra', circus: '&at=circus-maximus', colosseum: '&at=colosseum', pantheon: '&at=pantheon' };
const view = args.view ?? 'forum';
const yaws = String(args.yaw ?? '0').split(',').map(Number);

const SWITCHES = {
  lightskip: `const T = window.__abThree; const sp = await import('/src/gfx/chunkPatches.ts'); const sc = T.ShaderChunk;
    if (sp.originalChunks.lights_fragment_begin) game.__ls ??= { patched: sc.lights_fragment_begin, orig: sp.originalChunks.lights_fragment_begin, wrapped: new WeakSet() };
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
  hairlod: `for (const a of game.actors.all()) { const rb = a.avatar?.real; if (rb?.head) rb.head.setLod(on ? 0 : Math.min(rb.lod, 2)); }`,
  kinddepth: `const m = await import('/src/gfx/shadowLod.ts'); m.shadowLodSwitches.kindDepth = !on;`,
  shadowprecull: `const m = await import('/src/gfx/fastCull.ts'); m.fastCullSwitches.shadowPrecull = !on;`,
  rootcull: `const m = await import('/src/gfx/fastCull.ts'); m.fastCullSwitches.rootCull = !on;`,
  aomask: `const m = game.post?.aoMat; if (m && (m.defines.AO_MASK_ALWAYS === 1) !== on) { if (on) m.defines.AO_MASK_ALWAYS = 1; else delete m.defines.AO_MASK_ALWAYS; m.needsUpdate = true; }`,
};
// Every phase 3 switch at once: the before and after of the whole pass.
SWITCHES.phase3 = ['lightskip', 'hairlod', 'kinddepth', 'shadowprecull', 'aomask', 'rootcull'].map((k) => `{ ${SWITCHES[k]} }`).join('\n');
const chosen = {};
for (const part of String(args.switch ?? 'lightskip').split(';;').flatMap((p) => (p.includes('=') ? [p] : p.split(',')))) {
  const i = part.indexOf('=');
  if (i > 0) chosen[part.slice(0, i).trim()] = part.slice(i + 1);
  else if (SWITCHES[part.trim()]) chosen[part.trim()] = SWITCHES[part.trim()];
  else console.warn(`unknown switch ${part}`);
}

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
const browserName = args.browser ?? 'chromium';
const browser = await pw[browserName].launch({ headless: true, args: browserName === 'chromium' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
let exitCode = 0;
try {
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: Number(args.dpr ?? 1) });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
  const gfx = args.graphics ? `&graphics=${args.graphics}` : '';
  const url = `${baseUrl}?scene=rome&quick=1&hour=${args.hour ?? 10}${gfx}${VIEWS[view] ?? ''}${args.query ? `&${args.query}` : ''}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 180000, polling: 100 });
  await page.waitForTimeout(Number(args.settle ?? 6000));
  // The HUD fades banners and notices in and out on its own clock: hidden, unless --hud.
  if (!args.hud) await page.addStyleTag({ content: '.ui-root { display: none !important; }' });
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/deps\/three\.js(\?|$)/.test(n));
    window.__abThree = url ? await import(url) : null;
  });
  const yaw0 = await page.evaluate(() => window.__skyrome.game.player.yaw);
  for (const yaw of yaws) {
    // Turn while running (streaming and LODs settle for this view), then freeze the world.
    await page.evaluate(async (y) => {
      const game = window.__skyrome.game;
      game.paused = false;
      game.player.yaw = y;
      for (let i = 0; i < 90; i++) await new Promise((r) => requestAnimationFrame(r));
      game.paused = true;
      // Things that still ease while paused (the light pool's fades) settle before the first shot.
      for (let i = 0; i < 30; i++) {
        game.invalidate();
        await new Promise((r) => setTimeout(r, 40));
      }
    }, yaw0 + (yaw * Math.PI) / 180);
    for (const [name, js] of Object.entries(chosen)) {
      const shots = {};
      for (const side of ['old', 'new']) {
        await page.evaluate(async ({ js, on }) => {
          const game = window.__skyrome.game;
          await new (Object.getPrototypeOf(async function () {}).constructor)('game', 'on', js)(game, on);
          // Draw a few frames: shader compiles, a fresh shadow map (it re-renders at 30 Hz).
          for (let i = 0; i < 6; i++) {
            game.invalidate();
            await new Promise((r) => setTimeout(r, 40));
            await new Promise((r) => requestAnimationFrame(r));
          }
        }, { js, on: side === 'old' });
        const file = join(outDir, `${view}-${yaw}-${name}-${side}.png`);
        shots[side] = await page.screenshot({ path: file });
      }
      await page.evaluate(async (js) => {
        const game = window.__skyrome.game;
        await new (Object.getPrototypeOf(async function () {}).constructor)('game', 'on', js)(game, false);
      }, js);
      const d = await diff(browser, shots.old, shots.new);
      if (args.crop) {
        // A detail of both shots side by side (old left, new right), enlarged `--zoom` times.
        const png = await crop(browser, shots.old, shots.new, String(args.crop).split(',').map(Number), Number(args.zoom ?? 3));
        writeFileSync(join(outDir, `${view}-${yaw}-${name}-crop.png`), Buffer.from(png, 'base64'));
      }
      writeFileSync(join(outDir, `${view}-${yaw}-${name}-diff.png`), Buffer.from(d.png, 'base64'));
      console.log(`${view} yaw ${String(yaw).padStart(3)} ${name.padEnd(14)} pixels differing > 2 levels ${(d.over2 * 100).toFixed(3)} %, > 16 levels ${(d.over16 * 100).toFixed(3)} %, max ${d.max}, mean ${d.mean.toFixed(3)}  (${join(outDir, `${view}-${yaw}-${name}-{old,new,diff}.png`).replace(root + '/', '')})`);
    }
  }
  if (errors.length) {
    exitCode = 1;
    console.log(`page errors: ${errors.slice(0, 5).join(' | ')}`);
  }
} finally {
  await browser.close();
  if (server) await server.close();
}
process.exit(exitCode);

/** Pixel difference of two PNGs (decoded in a blank page): shares over 2 and 16 levels, max, mean, and a diff image. */
async function diff(browser, a, b) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(async ([a64, b64]) => {
      const load = async (s) => createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob());
      const [ia, ib] = await Promise.all([load(a64), load(b64)]);
      const w = ia.width, h = ia.height;
      const c = new OffscreenCanvas(w, h);
      const g = c.getContext('2d');
      g.drawImage(ia, 0, 0);
      const da = g.getImageData(0, 0, w, h).data;
      g.drawImage(ib, 0, 0);
      const db = g.getImageData(0, 0, w, h).data;
      const out = g.createImageData(w, h);
      let over2 = 0, over16 = 0, max = 0, sum = 0;
      for (let i = 0; i < da.length; i += 4) {
        const m = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
        if (m > 2) over2++;
        if (m > 16) over16++;
        if (m > max) max = m;
        sum += m;
        out.data[i] = Math.min(255, Math.abs(da[i] - db[i]) * 8);
        out.data[i + 1] = Math.min(255, Math.abs(da[i + 1] - db[i + 1]) * 8);
        out.data[i + 2] = Math.min(255, Math.abs(da[i + 2] - db[i + 2]) * 8);
        out.data[i + 3] = 255;
      }
      g.putImageData(out, 0, 0);
      const blob = await c.convertToBlob({ type: 'image/png' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const n = w * h;
      return { over2: over2 / n, over16: over16 / n, max, mean: sum / n, png: btoa(bin) };
    }, [a.toString('base64'), b.toString('base64')]);
  } finally {
    await page.close();
  }
}

/** Old and new side by side: the region [x, y, w, h] (CSS pixels × the shot's scale) of each, `zoom` times larger. */
async function crop(browser, a, b, [x, y, w, h], zoom) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(async ([a64, b64, x, y, w, h, zoom, dpr]) => {
      const load = async (s) => createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob());
      const [ia, ib] = await Promise.all([load(a64), load(b64)]);
      const sx = x * dpr, sy = y * dpr, sw = w * dpr, sh = h * dpr;
      const W = Math.round(w * zoom), H = Math.round(h * zoom);
      const c = new OffscreenCanvas(W * 2 + 8, H);
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#f0f';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(ia, sx, sy, sw, sh, 0, 0, W, H);
      g.drawImage(ib, sx, sy, sw, sh, W + 8, 0, W, H);
      const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    }, [a.toString('base64'), b.toString('base64'), x, y, w, h, zoom, Number(args.dpr ?? 1)]);
  } finally {
    await page.close();
  }
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
