#!/usr/bin/env node
/**
 * Texture churn finder (LOOK crew): boots the game, walks the player along a straight line at 4.4 m/s
 * (teleports a step a frame-ish, as the surface audit's walks do), and records every Texture.dispose()
 * that happens meanwhile, grouped by the kind of texture and the JS stack that disposed it: the "texture
 * churn" of surface.mjs (renderer.info.memory.textures going up and down) is made of these.
 *
 *   node scripts/audit/look-churn.mjs [--seconds 20] [--from 304,573] [--dir -0.9,-0.4] [--query prewarm=0]
 */
import { boot, parseArgs } from './boot.mjs';
import { guard } from './lock.mjs';

const args = parseArgs(process.argv.slice(2));
const release = await guard('look-churn', args);
const { page, errors, close } = await boot(`scene=rome&quick=1&hour=11&npcs=1${args.query ? '&' + args.query : ''}`);
try {
  const r = await page.evaluate(async ({ seconds, from, dir }) => {
    const g = window.__skyrome.game;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const Tex = Object.getPrototypeOf(Object.getPrototypeOf(g.terrain.textures.albedo));
    const seen = new Map();
    const orig = Tex.dispose;
    let live = true;
    Tex.dispose = function () {
      if (live) {
        const img = this.image ?? {};
        const stack = String(new Error().stack).split('\n').slice(2, 6).map((s) => s.trim().replace(/\?t=\d+/g, '').replace(/^at /, '').replace(/http:\/\/[^/]+/, '')).join(' < ');
        const key = `${this.constructor.name} ${this.name || ''} ${img.width ?? '?'}x${img.height ?? '?'} | ${stack}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      return orig.call(this);
    };
    const [x0, z0] = from, [dx, dz] = dir;
    const n = Math.hypot(dx, dz);
    const hm = g.heightmap;
    const t0 = performance.now();
    const samples = [];
    let last = g.renderer.info.memory.textures;
    let changes = 0;
    while ((performance.now() - t0) / 1000 < seconds) {
      const t = (performance.now() - t0) / 1000;
      const x = x0 + (dx / n) * 4.4 * t, z = z0 + (dz / n) * 4.4 * t;
      g.player.teleport({ x, y: hm.heightAt(x, z) + 0.6, z }, 0);
      await sleep(150);
      const tx = g.renderer.info.memory.textures;
      if (tx !== last) changes++;
      last = tx;
    }
    live = false;
    Tex.dispose = orig;
    return { disposes: [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15), changes, textures: last };
  }, { seconds: Number(args.seconds ?? 20), from: String(args.from ?? '304,573').split(',').map(Number), dir: String(args.dir ?? '-0.9,-0.4').split(',').map(Number) });
  console.log(`texture count changed ${r.changes} times; ends at ${r.textures}`);
  for (const [k, c] of r.disposes) console.log(String(c).padStart(5), k);
  if (errors.length) console.log('page errors:\n  ' + errors.slice(0, 5).join('\n  '));
} finally {
  await close();
  release();
}
