#!/usr/bin/env node
/**
 * Holes in the drawn ground, swept over the whole grid: boots Rome, hides everything but the terrain's
 * CDLOD mesh (no apron, no water, no buildings, no grass) and renders it over a key colour (magenta)
 * from a lattice of cameras: straight down over every tile of the grid (the leaf level and the culling)
 * and at eye height and from 30 m up looking four ways (the coarser levels, their morph zones and
 * skirts). Every key pixel is a ray that saw no ground; it is a hole when the same ray, marched through
 * the heightmap on the CPU, gets below the lowest the drawn ground can be there (the samples of the
 * cell the drawn patch's level morphs within, less its bias: a ray that only skims a ridge the coarser
 * levels smooth away is not one; where no patch was drawn, any ground it meets counts). Holes are
 * reported by 8 m cell with the camera that saw them and whether a selected patch covers the spot.
 *
 *   node scripts/audit/terrain-holes.mjs [--query terrain=v1] [--step 160] [--json out.json]
 *        [--views down,eye] [--late] [--shots dir] [--max-wait 30]
 *
 * By default the terrain selects its patches for each camera the way the game does before a frame
 * (`terrain.select()` with the game camera placed there). --late renders from a second camera the
 * terrain was not updated for, as a tool that places its camera after the terrain's update does
 * (look.mjs and the other audits pin theirs at priority 150): the terrain must still draw that
 * camera's patches (it selects again in `scene.onBeforeRender`). Exit 1 when any hole is found.
 * --shots writes a PNG of the first view of each hole cluster (key colour left in) to that directory.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { boot, parseArgs, root } from './boot.mjs';
import { guard } from './lock.mjs';

const args = parseArgs(process.argv.slice(2));
const views = String(args.views ?? 'down,eye').split(',');
const step = Number(args.step ?? 160);
const late = !!args.late;
const query = `scene=rome&quick=1&hour=11&tgm=1&npcs=0` + (args.query ? '&' + String(args.query).replace(/^[?&]/, '') : '');
const release = await guard('terrain-holes', args);
const kill = setTimeout(() => {
  console.log('terrain-holes: timed out');
  process.exit(2);
}, Number(args.timeout ?? 20) * 60_000);
const { page, errors, close, bootMs } = await boot(query, { size: '640x400' });
console.log(`booted in ${(bootMs / 1000).toFixed(1)} s  (${query})${late ? '  [late camera]' : ''}`);
let failed = false;
try {
  await page.evaluate(setup, { late });
  const plan = await page.evaluate(({ views, step }) => window.__holes.plan(views, step), { views, step });
  console.log(`${plan.count} views (${views.join(', ')}; eye lattice every ${step} m)`);
  const t0 = Date.now();
  const res = { views: 0, keyPx: 0, holePx: 0, grazes: 0, cells: {} };
  for (let i = 0; i < plan.count; i += 40) {
    const r = await page.evaluate(({ i, n }) => window.__holes.run(i, n), { i, n: Math.min(40, plan.count - i) });
    res.views += r.views;
    res.keyPx += r.keyPx;
    res.holePx += r.holePx;
    res.grazes += r.grazes;
    for (const [k, c] of Object.entries(r.cells)) {
      const o = (res.cells[k] ??= { x: c.x, z: c.z, px: 0, views: 0, view: c.view, level: c.level, covered: c.covered, first: c.first });
      o.px += c.px;
      o.views += c.views;
    }
  }
  const cells = Object.values(res.cells).sort((a, b) => b.px - a.px);
  console.log(`${res.views} views in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${res.keyPx} key pixels, ${res.grazes} grazing rays, ${res.holePx} hole pixels in ${cells.length} cells of 8 m`);
  for (const c of cells.slice(0, 40)) {
    console.log(`  hole at ${c.x}, ${c.z}: ${c.px} px in ${c.views} view(s); first from ${c.view.kind} ${c.view.e.map((v) => v.toFixed(0)).join(',')} yaw ${c.view.yaw.toFixed(2)} pitch ${c.view.pitch.toFixed(2)}; patch level there ${c.level ?? '-'}; ${c.covered ? 'a selected patch covers it (drawn wrong)' : 'no selected patch covers it (selection)'}`);
  }
  if (args.shots && cells.length) {
    const dir = resolve(root, String(args.shots));
    mkdirSync(dir, { recursive: true });
    const seen = new Set();
    for (const c of cells.slice(0, 12)) {
      const key = JSON.stringify(c.view);
      if (seen.has(key)) continue;
      seen.add(key);
      const png = await page.evaluate((v) => window.__holes.shot(v), c.view);
      const file = join(dir, `hole-${c.x}_${c.z}.png`);
      writeFileSync(file, Buffer.from(png, 'base64'));
      console.log(`  shot ${file}`);
    }
  }
  if (args.json) writeFileSync(resolve(root, String(args.json)), JSON.stringify({ query, late, step, ...res, cells }, null, 1) + '\n');
  failed = cells.length > 0;
} catch (e) {
  failed = true;
  console.error('FAILED:', e?.stack ?? e);
} finally {
  if (errors.length) console.log('page errors:\n  ' + errors.slice(0, 10).join('\n  '));
  await close();
  clearTimeout(kill);
  release();
}
process.exit(failed ? 1 : 0);

/** In the page: hide all but the terrain, and install window.__holes. */
async function setup({ late }) {
  // The page's own three.js (Vite's pre-bundled copy, by its exact URL: one instance).
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/\.vite\/deps\/three\.js(\?|$)/.test(n));
  if (!url) throw new Error('three.js module not found among the page resources');
  const THREE = await import(url);
  const g = window.__skyrome.game;
  const hm = g.heightmap;
  const terrain = g.terrain;
  // The game loop keeps running between batches; stop the systems that would move or re-show things.
  g.paused = true;
  const terrainOnly = () => {
    for (const o of g.scene.children) if (o !== terrain.group) o.visible = false;
    if (terrain.apron) terrain.apron.visible = false;
  };
  const W = 320, H = 200;
  const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
  const buf = new Uint8Array(W * H * 4);
  const cam = g.camera;
  const lateCam = new THREE.PerspectiveCamera(70, W / H, 0.1, 6000);
  const ray = new THREE.Vector3(), org = new THREE.Vector3();
  const maxH = hm.heights.reduce((a, b) => Math.max(a, b), -Infinity);
  const P = terrain.quadtree.patchQuads;
  const top = terrain.quadtree.levels - 1;
  const { nx: NX, nz: NZ, spacing: sp, heights: HS } = hm;
  const inGrid = (x, z) => x >= hm.minX && x <= hm.maxX && z >= hm.minZ && z <= hm.maxZ;
  // The level drawn at each level-0 patch of the grid in the last render (-1: no patch there).
  const leaf = P * sp;
  const RX = Math.ceil(((NX - 1) * sp) / leaf), RZ = Math.ceil(((NZ - 1) * sp) / leaf);
  const drawnLevel = new Int8Array(RX * RZ);
  const rasterize = () => {
    drawnLevel.fill(-1);
    const geo = terrain.mesh.geometry, a = geo.attributes.aPatch.array;
    for (let k = 0; k < geo.instanceCount; k++) {
      const i0 = Math.round((a[k * 4] - hm.minX) / leaf), j0 = Math.round((a[k * 4 + 1] - hm.minZ) / leaf), n = Math.round((a[k * 4 + 2] * P) / leaf);
      for (let j = j0; j < Math.min(RZ, j0 + n); j++) for (let i = i0; i < Math.min(RX, i0 + n); i++) drawnLevel[j * RX + i] = a[k * 4 + 3];
    }
  };
  const levelAt = (x, z) => {
    const i = Math.floor((x - hm.minX) / leaf), j = Math.floor((z - hm.minZ) / leaf);
    return i >= 0 && j >= 0 && i < RX && j < RZ ? drawnLevel[j * RX + i] : -1;
  };
  // Min pyramid: the lowest sample of each cell of 2^k samples (edges included), k = 1 .. top.
  const pyr = [null];
  for (let k = 1; k <= top; k++) {
    const s = 2 ** k, cx = Math.ceil((NX - 1) / s), cz = Math.ceil((NZ - 1) / s);
    const m = new Float32Array(cx * cz).fill(Infinity);
    if (k === 1) {
      for (let j = 0; j < cz; j++) for (let i = 0; i < cx; i++) {
        let v = Infinity;
        for (let b = 0; b <= 2; b++) for (let a = 0; a <= 2; a++) v = Math.min(v, HS[Math.min(NZ - 1, j * 2 + b) * NX + Math.min(NX - 1, i * 2 + a)]);
        m[j * cx + i] = v;
      }
    } else {
      const pm = pyr[k - 1], pcx = Math.ceil((NX - 1) / (s / 2)), pcz = Math.ceil((NZ - 1) / (s / 2));
      for (let j = 0; j < pcz; j++) for (let i = 0; i < pcx; i++) {
        const q = (j >> 1) * cx + (i >> 1);
        m[q] = Math.min(m[q], pm[j * pcx + i]);
      }
    }
    pyr.push(m);
  }
  const bias = (L) => (L === 0 ? 0 : Math.min(3, 0.04 * sp * 2 ** L));
  /**
   * The lowest the drawn ground can be at (x, z): a level-L patch, morphing toward level L + 1, takes
   * its heights from the samples of the level-(L + 1) cell it lies in (its vertices slide inside that
   * cell), lowered by at most the next level's bias and the 9 cm drop under roads and pads. Where no
   * patch was drawn it is the ground itself.
   */
  const drawnMin = (x, z) => {
    const L = levelAt(x, z);
    if (L < 0) return hm.heightAt(x, z);
    const k = Math.min(L + 1, top);
    if (k === 0) return hm.heightAt(x, z) - 0.09;
    const s = 2 ** k, cx = Math.ceil((NX - 1) / s), cz = Math.ceil((NZ - 1) / s);
    const i = Math.min(cx - 1, Math.floor((x - hm.minX) / sp / s)), j = Math.min(cz - 1, Math.floor((z - hm.minZ) / sp / s));
    return pyr[k][j * cx + i] - bias(k) - 0.09;
  };
  /**
   * March a pixel's ray through the heightmap. A hole: the ray gets under the lowest the drawn ground
   * can be there (`drawnMin`), so it must have met drawn ground, yet the pixel shows the key colour. A
   * ray that only enters the fine ground (a silhouette the coarser levels smooth away) is a graze.
   */
  const march = (o, d) => {
    let t = 0.05, grazed = false;
    for (let it = 0; it < 8000; it++) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (!inGrid(x, z) || t > 6000 || (y > maxH + 1 && d.y >= 0)) break;
      const h = hm.heightAt(x, z);
      if (y < h) {
        grazed = true;
        const lo = drawnMin(x, z);
        if (y < lo - 0.05) return { x, z, t, depth: h - y };
        t += Math.min(10, Math.max(0.25, 0.3 * (y - lo)));
      } else t += Math.min(20, Math.max(0.25, (y - h) * 0.3));
    }
    return grazed ? { graze: true } : null;
  };
  const list = [];
  const place = (c, v) => {
    c.fov = v.fov;
    c.aspect = W / H;
    c.near = 0.1;
    c.far = 6000;
    c.updateProjectionMatrix();
    c.position.set(v.e[0], v.e[1], v.e[2]);
    c.rotation.set(v.pitch, v.yaw, 0, 'YXZ');
    c.updateMatrixWorld();
  };
  const render = (v) => {
    const saved = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov, aspect: cam.aspect, near: cam.near, far: cam.far };
    place(cam, v);
    terrain.select();
    let c = cam;
    if (late) {
      // The terrain selected for the game camera; the frame is drawn from another view (a quarter turn away).
      place(lateCam, { ...v, yaw: v.yaw + Math.PI / 2 });
      c = lateCam;
    }
    terrainOnly();
    const bg = g.scene.background, fog = g.scene.fog;
    g.scene.background = null;
    const clear = new THREE.Color();
    g.renderer.getClearColor(clear);
    const alpha = g.renderer.getClearAlpha();
    g.renderer.setClearColor(0xff00ff, 1);
    g.renderer.setRenderTarget(rt);
    g.renderer.clear();
    g.renderer.render(g.scene, c);
    g.renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    const view = { inv: c.projectionMatrixInverse.clone(), mw: c.matrixWorld.clone() };
    g.renderer.setRenderTarget(null);
    g.renderer.setClearColor(clear, alpha);
    g.scene.background = bg;
    g.scene.fog = fog;
    cam.position.copy(saved.p);
    cam.quaternion.copy(saved.q);
    Object.assign(cam, { fov: saved.fov, aspect: saved.aspect, near: saved.near, far: saved.far });
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    return view;
  };
  window.__holes = {
    plan(views, stepM) {
      list.length = 0;
      if (views.includes('down')) {
        // Straight down from 70 m over the tile's highest ground, fov 60: tiles of 80 m.
        const tile = 80;
        for (let z = hm.minZ + tile / 2; z < hm.maxZ; z += tile) {
          for (let x = hm.minX + tile / 2; x < hm.maxX; x += tile) {
            let top = -Infinity;
            for (let dz = -tile / 2; dz <= tile / 2; dz += 8) for (let dx = -tile / 2; dx <= tile / 2; dx += 8) if (inGrid(x + dx, z + dz)) top = Math.max(top, hm.heightAt(x + dx, z + dz));
            list.push({ kind: 'down', e: [x, top + 70, z], yaw: 0, pitch: -Math.PI / 2 + 1e-4, fov: 60 });
          }
        }
      }
      if (views.includes('eye')) {
        for (let z = hm.minZ + stepM / 2; z < hm.maxZ; z += stepM) {
          for (let x = hm.minX + stepM / 2; x < hm.maxX; x += stepM) {
            const y = hm.heightAt(x, z);
            for (const up of [1.7, 30]) for (let k = 0; k < 4; k++) list.push({ kind: 'eye', e: [x, y + up, z], yaw: (k * Math.PI) / 2 + 0.3, pitch: up > 2 ? -0.45 : -0.12, fov: 70 });
          }
        }
      }
      return { count: list.length };
    },
    run(i0, n) {
      const out = { views: 0, keyPx: 0, holePx: 0, grazes: 0, cells: {} };
      for (let i = i0; i < i0 + n; i++) {
        const v = list[i];
        const { inv, mw } = render(v);
        rasterize();
        out.views++;
        for (let py = 0; py < H; py++) {
          for (let px = 0; px < W; px++) {
            const o = (py * W + px) * 4;
            if (!(buf[o] > 250 && buf[o + 1] < 5 && buf[o + 2] > 250)) continue;
            out.keyPx++;
            // The pixel's ray (render targets read bottom-up).
            ray.set(((px + 0.5) / W) * 2 - 1, ((py + 0.5) / H) * 2 - 1, 0.5).applyMatrix4(inv).applyMatrix4(mw);
            org.setFromMatrixPosition(mw);
            ray.sub(org).normalize();
            const hit = march(org, ray);
            if (!hit) continue;
            if (hit.graze) {
              out.grazes++;
              continue;
            }
            out.holePx++;
            const cx = Math.floor(hit.x / 8) * 8, cz = Math.floor(hit.z / 8) * 8;
            const k = cx + ',' + cz;
            let cell = out.cells[k];
            if (!cell) {
              const level = levelAt(hit.x, hit.z);
              cell = out.cells[k] = { x: cx, z: cz, px: 0, views: 0, view: v, level, covered: level >= 0, last: -1, first: { px, py: H - 1 - py, t: +hit.t.toFixed(1), depth: +hit.depth.toFixed(2) } };
            }
            cell.px++;
            if (cell.last !== i) {
              cell.views++;
              cell.last = i;
            }
          }
        }
      }
      return out;
    },
    shot(v) {
      render(v);
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(W, H);
      for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
      ctx.putImageData(img, 0, 0);
      return cv.toDataURL('image/png').split(',')[1];
    },
  };
}
