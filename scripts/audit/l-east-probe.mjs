#!/usr/bin/env node
/**
 * L-EAST's quick probe: boots the game once with the collision audit on, teleports to the given
 * spots and prints the drawn and physics surfaces under each (src/dev/audit/collisionAudit.ts
 * `surfacesAt`), plus the colliders near the feet.
 *
 *   node scripts/audit/l-east-probe.mjs --spots "x,z[,name];..." [--query terrain=v1] [--near 1.5]
 */
import { boot, parseArgs } from './boot.mjs';

const args = parseArgs(process.argv.slice(2));
const spots = String(args.spots ?? '').split(';').filter(Boolean).map((s) => {
  const [x, z, name] = s.split(',');
  return { x: Number(x), z: Number(z), name: name ?? `${x},${z}` };
});
const near = Number(args.near ?? 1.2);
const query = `scene=rome&quick=1&hour=11&audit=1&tgm=1${args.query ? '&' + args.query : ''}`;
const { page, errors, close } = await boot(query, { timeout: 240000 });
try {
  for (const s of spots) {
    const r = await page.evaluate(async ({ x, z, near }) => {
      const g = window.__skyrome.game;
      window.__collision.unblock();
      const y = g.heightmap.heightAt(x, z);
      g.player.teleport({ x, y: y + 0.5, z }, 0);
      await window.__collision.settleView(x, z, 20, 4, 12000);
      const at = window.__collision.at(x, z);
      const top = at.physics[0]?.y ?? y;
      const nearby = window.__collision.near(x, top + 0.5, z, near).map((c) => ({ tag: c.tag ?? c.name ?? c.key, kind: c.kind ?? c.shape, y: c.y ?? c.center?.y, top: c.top, info: c }));
      const faces = window.__audit ? window.__audit.auditFacesNear(x, z, 0.6, 40).map((f) => `${f.name} ${f.mat} ${f.src} ${f.steep ? 'steep' : 'up'} y ${f.minY.toFixed(2)}..${f.maxY.toFixed(2)}`) : [];
      return { heightAt: +y.toFixed(3), terrainDrawn: +at.terrainDrawn.toFixed(3), drawn: at.drawn.slice(0, 6), physics: at.physics.slice(0, 6), cls: at.cls, near: nearby.slice(0, 8), faces: [...new Set(faces)].slice(0, 12) };
    }, { x: s.x, z: s.z, near });
    console.log(`\n== ${s.name} (${s.x}, ${s.z})  heightAt ${r.heightAt}  terrainDrawn ${r.terrainDrawn}  cls ${r.cls}`);
    console.log('  drawn:  ' + r.drawn.map((d) => `${d.y} ${d.tag} [${d.key}]`).join(' | '));
    console.log('  physics:' + r.physics.map((d) => `${d.y} ${d.tag}`).join(' | '));
    for (const n of r.near) console.log('  near:   ' + JSON.stringify(n.info).slice(0, 240));
    for (const f of r.faces) console.log('  face:   ' + f);
  }
} finally {
  await close();
}
if (errors.length) console.log('page errors:\n' + errors.slice(0, 5).join('\n'));
