#!/usr/bin/env node
/**
 * STREETS crew (phase 4b): street-fit's spot check in the game (src/dev/audit/streetFit.ts `probe`), under
 * the load guard: every surface over each point (city cell, blocks, landmarks) with its build, and the
 * terrain as drawn and as walked. For finding out what street-fit's raster sees at a lip.
 *
 *   node scripts/audit/streets-probe.mjs [--query terrain=v1] [--max-wait 20] --at "x,z;x,z" [--line x0,z0,x1,z1,step]
 */
import { boot, parseArgs } from './streets-boot.mjs';
import { acquireSlot } from './lock.mjs';

const args = parseArgs(process.argv.slice(2));
if (args.query) process.env.STREETS_QUERY = String(args.query);
const pts = args.at ? String(args.at).split(';').map((p) => p.split(',').map(Number)) : [];
if (args.line) {
  const [x0, z0, x1, z1, st = 0.25] = String(args.line).split(',').map(Number);
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / st));
  for (let i = 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
}
const release = await acquireSlot({ label: 'streets-probe', maxWaitMin: Number(args['max-wait'] ?? 20) });
const { page, close } = await boot('scene=rome&quick=1&hour=11&audit=1&tgm=1&npcs=0', { size: '800x600' });
try {
  await page.evaluate(() => import('/src/dev/audit/streetFit.ts'));
  await page.evaluate(() => window.__streetFit.init());
  const keys = [...new Set(pts.map(([x, z]) => `${Math.floor(x / 128)},${Math.floor(z / 128)}`))];
  for (const key of keys) await page.evaluate((k) => window.__streetFit.sweepCell(k, { blocks: true }), key);
  for (const [x, z] of pts) {
    const r = await page.evaluate(([px, pz]) => window.__streetFit.probe(px, pz), [x, z]);
    const s = r.surfaces.filter((q) => q.y > r.visible - 1.5 && q.y < r.visible + 1.6).slice(0, 5).map((q) => `${q.y.toFixed(3)} ${q.mat} ${q.src} L${q.layer}`).join(' | ');
    console.log(`${x.toFixed(2)},${z.toFixed(2)}  drawn ${r.visible.toFixed(3)} walked ${r.physics.toFixed(3)}  ${s}`);
  }
} finally {
  await close();
  release();
}
