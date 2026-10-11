#!/usr/bin/env node
/**
 * Shadow banding on the ground (LOOK crew, docs/design/solid-ground.md §4 LOOK): boots the game once,
 * pins the camera at named cameras of scripts/audit/cams.json (five shadowed-ground views by default)
 * and measures the stripe energy of the shadowed ground: the energy of the luminance at 2–6 px periods
 * (a 3-px box minus a 7-px box, along the screen's rows and along its columns; the larger of the two)
 * inside the shadowed-ground mask, relative to the mean luminance there.
 *
 *   node scripts/audit/look-banding.mjs [--cams rc7-shadow-banding,...] [--out dir] [--hour 11]
 *        [--variants "name:bias,normalBias,radius;..."] [--query terrain=v1] [--json path]
 *        [--no-guard] [--max-wait <min>]
 *
 * The mask. The same frame is taken twice: with the shadow comparison forced to "lit" (shadow.bias = +1
 * under the game's reversed depth buffer: a uniform, no shader recompile; three uploads it only after
 * every material's light state is marked stale) and with the shadows as they are; a pixel in the lower 62 % of the
 * frame that is at least 18 % darker with shadows is shadowed ground (walls in shade count too: they
 * band the same way), eroded by 3 px so the penumbra's own edge is not counted.
 *
 * Variants. `today` is the base's shadow bias (bias −0.00025, normalBias 0.0156 m at 3072², PCF radius
 * 3); `now` is whatever the code sets (read from the rig before anything is changed). Extra variants are
 * applied live (bias, normalBias and radius are uniforms). Every variant is measured on two consecutive
 * frames, one right after a shadow-map re-render and the next one without (the 30 Hz re-render of
 * Game.ts): both are printed, so a fix that only holds on the re-render frame shows.
 *
 * Output: the per-camera table and the mean per variant; `now` must be at most 30 % of `today` (§4).
 * JSON (--json): { cams: [{ id, variants: { name: { on, off, stripe, stripe2 } } }], mean: {...} }.
 * Screenshots of the `today` and `now` frames go to --out (default .shots/look-banding).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { boot, parseArgs, root } from './boot.mjs';
import { guard } from './lock.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = resolve(root, String(args.out ?? '.shots/look-banding'));
mkdirSync(outDir, { recursive: true });
const camsFile = JSON.parse(readFileSync(resolve(root, 'scripts/audit/cams.json'), 'utf8'));
const DEFAULT_CAMS = ['rc7-shadow-banding', 'rc6-travertine-seam', 'rc6-basalt-plaza', 'rc7-dither-ghost', 'rc6-opening-street'];
const want = String(args.cams ?? DEFAULT_CAMS.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const list = camsFile.cams.filter((c) => want.includes(c.id));
const unknown = want.filter((w) => !list.some((c) => c.id === w));
if (unknown.length) console.log(`unknown cameras: ${unknown.join(', ')}`);
if (!list.length) {
  console.log('nothing to measure');
  process.exit(1);
}
/** The base's values (shadows.ts on phase4b before LOOK): what "today" means. */
const TODAY = { bias: -0.00025, normalBias: (0.035 * (100 / 3072)) / 0.073, radius: 3 };
const extra = args.variants
  ? String(args.variants).split(';').filter(Boolean).map((s) => {
      const [name, v] = s.split(':');
      const [bias, normalBias, radius] = v.split(',').map(Number);
      return { name, bias, normalBias, radius };
    })
  : [];

const base = `scene=rome&quick=1&hour=${args.hour ?? 11}&tgm=1&npcs=0`;
const query = base + (args.query ? '&' + String(args.query).replace(/^[?&]/, '') : '');
const release = await guard('look-banding', args);
const { page, errors, close, bootMs } = await boot(query, { size: args.size ?? '1280x720' });
console.log(`booted in ${(bootMs / 1000).toFixed(1)} s  (${query})  ${list.length} camera(s) -> ${outDir}`);
let failed = 0;
const result = { startedAt: new Date().toISOString(), query, today: TODAY, cams: [], mean: {} };
try {
  const now = await page.evaluate(install);
  console.log(`now (the code's values): bias ${now.bias}, normalBias ${now.normalBias.toFixed(5)}, radius ${now.radius}, map ${now.mapSize}`);
  const variants = [{ name: 'today', ...TODAY }, { name: 'now', ...now }, ...extra];
  result.variants = variants;
  for (const cam of list) {
    let r;
    try {
      r = await page.evaluate(frame, cam);
    } catch (e) {
      failed++;
      console.log(`FAILED ${cam.id}: ${String(e?.message ?? e).slice(0, 200)}`);
      continue;
    }
    const rec = { id: cam.id, eye: r.eye.map((v) => +v.toFixed(2)), variants: {} };
    for (const v of variants) {
      const m = await page.evaluate(measure, v);
      rec.variants[v.name] = m;
      if (v.name === 'today' || v.name === 'now') await page.screenshot({ path: join(outDir, `${cam.id}-${v.name}.jpg`), type: 'jpeg', quality: 80 });
    }
    result.cams.push(rec);
    const line = variants.map((v) => {
      const m = rec.variants[v.name];
      return `${v.name} ${(m.stripe * 1e3).toFixed(2)}/${(m.stripe2 * 1e3).toFixed(2)} (lit ${(m.off * 1e3).toFixed(2)}, mask ${(m.mask * 100).toFixed(0)} %)`;
    });
    console.log(`${cam.id.padEnd(24)} ${line.join('  |  ')}`);
    await page.evaluate(() => { window.__pin = null; });
  }
  // Means over the cameras (stripe energy ×1e3; stripe2 is the frame after the re-render).
  for (const v of variants) {
    const rows = result.cams.map((c) => c.variants[v.name]).filter(Boolean);
    const mean = (k) => rows.reduce((s, m) => s + m[k], 0) / Math.max(1, rows.length);
    result.mean[v.name] = { stripe: mean('stripe'), stripe2: mean('stripe2'), on: mean('on'), off: mean('off') };
  }
  const today = result.mean.today?.stripe ?? 0;
  console.log('\n== stripe energy at 2-6 px periods in the shadowed ground (x1e3), mean of the cameras');
  for (const v of variants) {
    const m = result.mean[v.name];
    console.log(`  ${v.name.padEnd(12)} ${(m.stripe * 1e3).toFixed(3)}  (next frame ${(m.stripe2 * 1e3).toFixed(3)}; lit floor ${(m.off * 1e3).toFixed(3)})  ${today ? ((m.stripe / today) * 100).toFixed(0) + ' % of today' : ''}   bias ${v.bias} normalBias ${v.normalBias.toFixed(5)} radius ${v.radius}`);
  }
  const ratio = today ? result.mean.now.stripe / today : 1;
  result.ratioNowToToday = ratio;
  console.log(`\nnow / today = ${(ratio * 100).toFixed(0)} %  (gate: at most 30 %)  ${ratio <= 0.3 ? 'PASS' : 'FAIL'}`);
  if (ratio > 0.3) failed++;
  if (args.json) writeFileSync(resolve(root, String(args.json)), JSON.stringify(result, null, 1) + '\n');
} catch (e) {
  failed++;
  console.error('FAILED:', e?.stack ?? e);
} finally {
  if (errors.length) console.log('page errors:\n  ' + errors.slice(0, 10).join('\n  '));
  await close();
  release();
}
process.exit(failed ? 1 : 0);

/** In the page: the pinned camera, the frame grab, and the current shadow values. */
async function install() {
  const { Layer } = await import('/src/core/Physics.ts');
  const g = window.__skyrome.game;
  window.__Layer = Layer;
  document.querySelectorAll('.ui-root').forEach((e) => (e.style.visibility = 'hidden'));
  window.__pin = null;
  g.addSystem({
    name: 'lookCam',
    priority: 150,
    lateUpdate() {
      const c = window.__pin;
      if (c) {
        g.camera.position.set(c[0], c[1], c[2]);
        g.camera.lookAt(c[3], c[4], c[5]);
        g.camera.updateMatrixWorld();
      }
      if (g.player.avatar) g.player.avatar.root.visible = !c;
    },
  });
  // Luminance of the finished frame, read straight from the default framebuffer after the render.
  const cap = { want: 0, lum: null, w: 0, h: 0, raw: null, shadowFrame: false, frames: [] };
  const orig = g.renderFrame;
  g.renderFrame = () => {
    const sm = g.renderer.shadowMap;
    const fresh = sm.needsUpdate;
    orig();
    if (cap.want > 0) {
      cap.want--;
      const gl = g.renderer.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      if (!cap.raw || cap.raw.length !== w * h * 4) cap.raw = new Uint8Array(w * h * 4);
      g.renderer.setRenderTarget(null);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, cap.raw);
      const lum = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        const row = (h - 1 - y) * w;
        for (let x = 0; x < w; x++) {
          const o = (row + x) * 4;
          lum[y * w + x] = cap.raw[o] * 0.299 + cap.raw[o + 1] * 0.587 + cap.raw[o + 2] * 0.114;
        }
      }
      cap.frames.push({ lum, w, h, fresh });
    }
  };
  window.__cap = cap;
  const s = g.sky.shadows.light.shadow;
  return { bias: s.bias, normalBias: s.normalBias, radius: s.radius, mapSize: s.mapSize.x };
}

/** In the page: put the camera for `cam` (look.mjs's pinned mode), wait for the city, return the eye. */
async function frame(cam) {
  const g = window.__skyrome.game;
  const Layer = window.__Layer;
  const hm = g.heightmap;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const [sx, sy, sz] = cam.spot;
  const above = cam.eyeAbove ?? 1.6;
  const ang0 = cam.eye ? Math.atan2(cam.eye[1] - sz, cam.eye[0] - sx) : 0.6;
  const px = sx + Math.cos(ang0) * 8, pz = sz + Math.sin(ang0) * 8;
  window.__pin = null;
  g.player.teleport({ x: px, y: hm.heightAt(px, pz) + 0.5, z: pz }, 0);
  const t0 = performance.now();
  await sleep(1500);
  while (true) {
    const st = g.city.streamer;
    if (!st.job && !st.cellJob) break;
    if (performance.now() - t0 > 12000) break;
    await sleep(250);
  }
  await sleep(800);
  const groundAt = (x, z) => {
    const terrain = hm.heightAt(x, z);
    const from = Math.max(terrain, sy) + 3;
    const hit = g.physics.raycast({ x, y: from, z }, { x: 0, y: -1, z: 0 }, from - terrain + 4, Layer.World);
    const street = hit && hit.normal.y > 0.5 ? hit.point.y : null;
    return Math.max(terrain, street ?? -Infinity);
  };
  const [ex, ez] = cam.eye ?? [sx + 4, sz + 4];
  const ey = groundAt(ex, ez) + above;
  window.__pin = [ex, ey, ez, sx, sy, sz];
  await sleep(900);
  return { eye: [ex, ey, ez] };
}

/**
 * In the page: apply a variant's bias, normalBias and radius, grab the lit frame (bias −1), then two
 * consecutive frames with the shadows (the first right after a shadow re-render), and reduce them.
 */
async function measure(v) {
  const g = window.__skyrome.game;
  const cap = window.__cap;
  const s = g.sky.shadows.light.shadow;
  const sm = g.renderer.shadowMap;
  const frames = (n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const grab = async (n) => {
    cap.frames = [];
    cap.want = n;
    while (cap.frames.length < n) await frames(1);
    return cap.frames;
  };
  // three uploads a light's shadow bias, normalBias and radius only when its light state version
  // changes (WebGLRenderer.setProgram): mark every material's light state stale, so the next frame
  // re-reads them (the program is found in the cache again: no recompile).
  const apply = (bias) => {
    s.radius = v.radius;
    s.normalBias = v.normalBias;
    s.bias = bias;
    const props = g.renderer.properties;
    g.scene.traverse((o) => {
      const m = o.material;
      if (!m) return;
      for (const mm of Array.isArray(m) ? m : [m]) {
        const p = props.get(mm);
        if (p && 'lightsStateVersion' in p) p.lightsStateVersion = -1;
      }
    });
    sm.needsUpdate = true;
  };
  // Lit: every comparison passes (the bias is a uniform; nothing recompiles). The game runs a reversed
  // depth buffer (Game.ts), where three r186's PCF adds the bias unflipped: +1 is "nearer than anything".
  apply(1);
  await frames(3);
  const [off] = await grab(1);
  apply(v.bias);
  await frames(3);
  // Two frames in a row: Game.ts re-renders the map at ~30 Hz, so one of each pair is a stale-map frame.
  const pair = await grab(2);
  const { w, h } = off;
  const y0 = Math.floor(h * 0.38);
  // Shadowed-ground mask: the lower part of the frame, at least 18 % darker with the shadows on, eroded 3 px.
  const m0 = new Uint8Array(w * h);
  const on = pair[0].lum, lit = off.lum;
  for (let y = y0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (lit[i] > 12 && on[i] < lit[i] * 0.82) m0[i] = 1;
  }
  const mask = new Uint8Array(w * h);
  let count = 0;
  for (let y = y0 + 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
    const i = y * w + x;
    if (!m0[i]) continue;
    let ok = 1;
    for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3; dx++) if (!m0[i + dy * w + dx]) { ok = 0; break; }
    if (ok) { mask[i] = 1; count++; }
  }
  // Stripe energy at 2-6 px periods: (box3 - box7) along rows and along columns, relative to the mean
  // luminance of the mask; the larger of the two directions (stripes are oriented, grain is not).
  const energy = (L) => {
    if (count < 2000) return 0;
    let sumL = 0;
    for (let i = 0; i < w * h; i++) if (mask[i]) sumL += L[i];
    const meanL = Math.max(1, sumL / count);
    let ev = 0, eh = 0;
    for (let y = y0 + 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      let b3 = 0, b7 = 0;
      for (let k = -3; k <= 3; k++) { const v = L[i + k * w]; b7 += v; if (k >= -1 && k <= 1) b3 += v; }
      const dv = b3 / 3 - b7 / 7;
      ev += dv * dv;
      b3 = 0; b7 = 0;
      for (let k = -3; k <= 3; k++) { const v = L[i + k]; b7 += v; if (k >= -1 && k <= 1) b3 += v; }
      const dh = b3 / 3 - b7 / 7;
      eh += dh * dh;
    }
    return Math.max(ev, eh) / count / (meanL * meanL);
  };
  const eOn = energy(pair[0].lum), eOn2 = energy(pair[1].lum), eOff = energy(off.lum);
  return { mask: count / (w * (h - y0)), on: eOn, on2: eOn2, off: eOff, stripe: Math.max(0, eOn - eOff), stripe2: Math.max(0, eOn2 - eOff), fresh: [pair[0].fresh, pair[1].fresh] };
}
