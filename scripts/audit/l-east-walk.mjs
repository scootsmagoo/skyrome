#!/usr/bin/env node
/**
 * L-EAST's bridge walk check: boots the game, lets the city stream in at each end, then walks a
 * point along a line (default: the Pons Cestius axis, from the B ramp foot to the A ramp foot and
 * back) with physics rays: the floor under every step (a ray from 0.5 m over the last floor) and a
 * horizontal ray at 0.35 and 1.0 m to the next step. Prints the highest riser, any wall, any drop
 * and where the line leaves the floor (water).
 *
 *   node scripts/audit/l-east-walk.mjs [--bridge pons-cestius] [--from -7] [--to 56] [--lat 0,2,-2] [--query terrain=v1]
 */
import { boot, parseArgs } from './boot.mjs';

const args = parseArgs(process.argv.slice(2));
const id = String(args.bridge ?? 'pons-cestius');
const lats = String(args.lat ?? '0,2,-2').split(',').map(Number);
const query = `scene=rome&quick=1&hour=11&audit=1&tgm=1${args.query ? '&' + args.query : ''}`;
const { page, errors, close } = await boot(query, { timeout: 240000 });
try {
  const info = await page.evaluate((id) => {
    const pb = window.__skyrome.game.bridges.get(id);
    return pb ? { a: [pb.a.x, pb.a.z], b: [pb.b.x, pb.b.z], start: pb.layout.start, end: pb.layout.end, crown: pb.layout.crown } : null;
  }, id);
  if (!info) throw new Error('no bridge ' + id);
  const from = Number(args.from ?? info.start - 1.5), to = Number(args.to ?? info.end + 1.5);
  console.log(`${id}: ramps u ${info.start}..${info.end}, crown ${info.crown[1].toFixed(2)}; walking u ${from} -> ${to}`);
  for (const lat of lats) {
    for (const [u0, u1] of [[to, from], [from, to]]) {
      const r = await page.evaluate(async ({ info, u0, u1, lat }) => {
        const g = window.__skyrome.game;
        window.__collision.unblock();
        const [ax, az] = info.a, [bx, bz] = info.b;
        const len = Math.hypot(bx - ax, bz - az);
        const ux = (bx - ax) / len, uz = (bz - az) / len;
        const P = (u) => [ax + ux * u - uz * lat, az + uz * u + ux * lat];
        const [sx, sz] = P(u0);
        g.player.teleport({ x: sx, y: g.heightmap.heightAt(sx, sz) + 0.5, z: sz }, 0);
        await window.__collision.settleView(sx, sz, 60, 4, 15000);
        const mid = P((u0 + u1) / 2);
        await window.__collision.settleView(mid[0], mid[1], 60, 4, 15000);
        const world = g.physics.world;
        const down = (x, y, z, max) => {
          const h = world.castRay({ origin: { x, y, z }, dir: { x: 0, y: -1, z: 0 } }, max, true, undefined, 0xffff0001);
          return h ? y - h.timeOfImpact : null;
        };
        const sgn = Math.sign(u1 - u0), step = 0.1;
        const [x0, z0] = P(u0);
        let y = down(x0, g.heightmap.heightAt(x0, z0) + 1.2, z0, 3);
        const out = { start: y, maxRise: 0, maxRiseAt: null, maxDrop: 0, walls: [], lost: [], minY: y, maxY: y, end: null };
        let u = u0;
        while ((u1 - u) * sgn > 0) {
          const un = u + sgn * step;
          const [x, z] = P(un), [xp, zp] = P(u);
          const fy = down(x, y + 0.5, z, 1.5);
          if (fy === null) {
            out.lost.push(`u ${un.toFixed(1)}`);
            if (out.lost.length > 5) break;
            u = un;
            continue;
          }
          const dy = fy - y;
          if (dy > out.maxRise) { out.maxRise = dy; out.maxRiseAt = un.toFixed(1); }
          if (-dy > out.maxDrop) out.maxDrop = -dy;
          for (const h of [0.35, 1.0]) {
            const hit = world.castRay({ origin: { x: xp, y: y + h, z: zp }, dir: { x: (x - xp) / step, y: 0, z: (z - zp) / step } }, step + 0.3, true, undefined, 0xffff0001);
            if (hit && !out.walls.some((w) => Math.abs(w.u - un) < 0.6)) out.walls.push({ u: +un.toFixed(1), h, y: +y.toFixed(2) });
          }
          y = fy;
          out.minY = Math.min(out.minY, y);
          out.maxY = Math.max(out.maxY, y);
          u = un;
        }
        out.end = y;
        return out;
      }, { info, u0, u1, lat });
      console.log(`lat ${lat} ${u0}->${u1}: start ${r.start?.toFixed(2)} end ${r.end?.toFixed(2)} y ${r.minY?.toFixed(2)}..${r.maxY?.toFixed(2)}  maxRise ${r.maxRise.toFixed(2)} @${r.maxRiseAt}  maxDrop ${r.maxDrop.toFixed(2)}  walls ${JSON.stringify(r.walls.slice(0, 6))}  lost ${r.lost.slice(0, 4).join(',')}`);
    }
  }
} finally {
  await close();
}
if (errors.length) console.log('page errors:\n' + errors.slice(0, 5).join('\n'));
