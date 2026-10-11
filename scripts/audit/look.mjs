#!/usr/bin/env node
/**
 * Look at audit findings: boots the game once (with `?audit`, the street-fit module loaded) and,
 * for each spot, teleports the player next to it, pins the camera at the given offset looking at
 * it, waits for the city to stream in (at most 12 s) and saves a screenshot; optionally prints what
 * lies over the spot (`__streetFit.probe`: the drawn terrain, the walked terrain, every surface).
 *
 *   node scripts/audit/look.mjs --spots "x,y,z[,dx,dy,dz[,name]];..." [--probe] [--hour 11]
 *
 * dx, dy, dz: camera offset from the spot (default 4, 1.2, 4). Screenshots: .shots/street-fit/look-<name>.png
 */
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { boot, parseArgs, root } from './boot.mjs';

const args = parseArgs(process.argv.slice(2));
const shotDir = resolve(root, '.shots/street-fit');
mkdirSync(shotDir, { recursive: true });
const spots = String(args.spots ?? '').split(';').filter(Boolean).map((s, i) => {
  const p = s.split(',');
  const n = p.slice(0, 6).map(Number);
  return { x: n[0], y: n[1], z: n[2], dx: n[3] ?? 4, dy: n[4] ?? 1.2, dz: n[5] ?? 4, name: p[6] ?? String(i + 1) };
});
const { page, errors, close, bootMs } = await boot(`scene=rome&quick=1&hour=${args.hour ?? 11}&audit=1&tgm=1&npcs=0`, { size: args.size ?? '1280x720' });
console.log(`booted in ${(bootMs / 1000).toFixed(1)} s`);
try {
  await page.evaluate(() => import('/src/dev/audit/streetFit.ts'));
  await page.evaluate(() => {
    window.__streetFit.init();
    const g = window.__skyrome.game;
    document.querySelectorAll('.ui-root').forEach((e) => (e.style.visibility = 'hidden'));
    window.__pin = null;
    g.addSystem({ name: 'lookCam', priority: 150, lateUpdate() { const c = window.__pin; if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); } if (g.player.avatar) g.player.avatar.root.visible = false; } });
  });
  for (const s of spots) {
    await page.evaluate(async (s) => {
      const g = window.__skyrome.game;
      const cx = s.x + s.dx, cz = s.z + s.dz;
      // The player stands 10 m behind the camera (out of the picture; the city streams round it).
      const l = Math.hypot(s.dx, s.dz) || 1;
      const px = cx + (s.dx / l) * 10, pz = cz + (s.dz / l) * 10;
      g.player.teleport({ x: px, y: g.heightmap.heightAt(px, pz) + 0.5, z: pz }, 0);
      window.__pin = [cx, s.y + s.dy, cz, s.x, s.y, s.z];
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, 1500));
      while (performance.now() - t0 < 12000) {
        const st = g.city.streamer;
        if (!st.job && !st.cellJob) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      await new Promise((r) => setTimeout(r, 800));
    }, s);
    const p = join(shotDir, `look-${s.name}.png`);
    await page.screenshot({ path: p });
    console.log(`shot .shots/street-fit/look-${s.name}.png  spot ${s.x},${s.y},${s.z} camera +${s.dx},${s.dy},${s.dz}`);
    if (args.probe) console.log('  probe', JSON.stringify(await page.evaluate(({ x, z }) => window.__streetFit.probe(x, z), s)));
  }
} catch (e) {
  console.error('FAILED:', e?.stack ?? e);
} finally {
  if (errors.length) console.log('page errors:\n  ' + errors.slice(0, 10).join('\n  '));
  await close();
}
