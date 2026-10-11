#!/usr/bin/env node
/**
 * Look at the map: boots the game once and takes a screenshot from each named camera of
 * scripts/audit/cams.json (one per finding of docs/design/solid-ground.md section 2), or from spots
 * you give. Used for the before / after pairs the fix crews report.
 *
 *   node scripts/audit/look.mjs --cams b01-column-ulpia,rc1-*  --out docs/research/solid-ground/after/foo
 *        [--query terrain=v1] [--size 1280x720] [--quality 70] [--hour 11] [--resolve]
 *   node scripts/audit/look.mjs --cams all --out <dir>
 *   node scripts/audit/look.mjs --spots "x,y,z[,dx,dz[,h[,name]]];..." --out <dir> [--probe]
 *
 * --cams    ids, id prefixes ending in *, finding codes (B7, RC3 ...) or `all`.
 * --out     where the JPEGs go (<id>.jpg); default .shots/look.
 * --query   extra game URL parameters, e.g. terrain=v1 (the same camera in the same build, other profile).
 * --resolve write the automatically chosen eye (x,z) of every camera that has none back into cams.json,
 *           so a before / after pair uses the very same camera (done once, for the BEFORE set).
 * --no-guard / --max-wait <min>  skip / bound the wait of the load guard (scripts/audit/lock.mjs).
 * --spots   quick spots: look at x,y,z from (x+dx, z+dz), the eye h m over the ground (default 4, 4, 1.6).
 *
 * The camera. Pinned mode (the default): the eye stands at max(street, terrain) + eyeAbove (1.6 m) at its
 * x, z, where "street" is the highest walkable surface under it that is not a roof (a physics ray down from
 * 3 m above the spot's level), so a shot is never taken from under a slab or inside the terrain. It looks at
 * the spot. Mode "third": the real third-person camera, the player stood at the eye facing the spot.
 * With no eye given the clearest of 12 sides at 4, 5.5, 7.5 and 10 m is taken (physics rays to the spot).
 * The city is given up to 12 s to stream in round the spot before the shot. HUD and avatar are hidden in
 * pinned mode.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { boot, parseArgs, root } from './boot.mjs';
import { guard } from './lock.mjs';

const args = parseArgs(process.argv.slice(2));
const outDir = resolve(root, String(args.out ?? '.shots/look'));
mkdirSync(outDir, { recursive: true });
const camsPath = resolve(root, 'scripts/audit/cams.json');
const camsFile = JSON.parse(readFileSync(camsPath, 'utf8'));
const quality = Number(args.quality ?? 70);

let list = [];
if (args.cams) {
  const want = String(args.cams).split(',').map((s) => s.trim()).filter(Boolean);
  const all = camsFile.cams;
  list = want.includes('all')
    ? all
    : all.filter((c) => want.some((w) => w === c.id || w.toLowerCase() === c.finding.toLowerCase() || (w.endsWith('*') && c.id.startsWith(w.slice(0, -1)))));
  const unknown = want.filter((w) => w !== 'all' && !all.some((c) => w === c.id || w.toLowerCase() === c.finding.toLowerCase() || (w.endsWith('*') && c.id.startsWith(w.slice(0, -1)))));
  if (unknown.length) console.log(`unknown cameras: ${unknown.join(', ')}`);
} else if (args.spots) {
  list = String(args.spots).split(';').filter(Boolean).map((s, i) => {
    const p = s.split(',');
    const n = p.slice(0, 6).map(Number);
    const spot = [n[0], n[1], n[2]];
    return { id: p[6] ?? `spot-${i + 1}`, finding: '-', spot, eye: [spot[0] + (n[3] ?? 4), spot[2] + (n[4] ?? 4)], mode: 'pin', eyeAbove: n[5] ?? 1.6 };
  });
}
if (!list.length) {
  console.log('nothing to shoot: give --cams <ids|all> or --spots "x,y,z;..."');
  process.exit(1);
}

const base = `scene=rome&quick=1&hour=${args.hour ?? 11}&tgm=1&npcs=0${args.probe ? '&audit=1' : ''}`;
const query = base + (args.query ? '&' + String(args.query).replace(/^[?&]/, '') : '');
const release = await guard('look', args);
const { page, errors, close, bootMs } = await boot(query, { size: args.size ?? '1280x720' });
console.log(`booted in ${(bootMs / 1000).toFixed(1)} s  (${query})  ${list.length} camera(s) -> ${outDir}`);
let failed = 0;
try {
  if (args.probe) {
    await page.evaluate(() => import('/src/dev/audit/streetFit.ts'));
    await page.evaluate(() => window.__streetFit.init());
  }
  await page.evaluate(async () => {
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
  });
  for (const cam of list) {
    let r;
    try {
      r = await page.evaluate(frame, cam);
    } catch (e) {
      failed++;
      console.log(`FAILED ${cam.id}: ${String(e?.message ?? e).slice(0, 200)}`);
      continue;
    }
    const file = join(outDir, `${cam.id}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality });
    if (cam.mode !== 'third') await page.evaluate(() => { window.__pin = null; });
    const eye = r.eye.map((v) => +v.toFixed(2));
    console.log(`shot ${cam.id}.jpg  spot ${cam.spot.join(',')}  eye ${eye.join(',')} (street ${r.street === null ? '-' : r.street.toFixed(2)}, terrain ${r.terrain.toFixed(2)})${r.auto ? ' [auto side, clear ' + r.clear.toFixed(2) + ']' : ''}${r.streamed ? '' : ' [city still streaming]'}`);
    if (args.probe) console.log('  probe', JSON.stringify(await page.evaluate(({ x, z }) => window.__streetFit.probe(x, z), { x: cam.spot[0], z: cam.spot[2] })));
    if (args.resolve && !cam.eye && r.auto) {
      const stored = camsFile.cams.find((c) => c.id === cam.id);
      if (stored) stored.eye = [+r.eye[0].toFixed(2), +r.eye[2].toFixed(2)];
    }
  }
  if (args.resolve) {
    writeFileSync(camsPath, JSON.stringify(camsFile, null, 1) + '\n');
    console.log('cams.json: automatic eyes stored');
  }
} catch (e) {
  failed++;
  console.error('FAILED:', e?.stack ?? e);
} finally {
  if (errors.length) console.log('page errors:\n  ' + errors.slice(0, 10).join('\n  '));
  await close();
  release();
}
process.exit(failed ? 1 : 0);

/** In the page: put the camera for `cam`, wait for the city, return what was chosen. */
async function frame(cam) {
  const g = window.__skyrome.game;
  const Layer = window.__Layer;
  const hm = g.heightmap;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const [sx, sy, sz] = cam.spot;
  const above = cam.eyeAbove ?? 1.6;
  // The player stands 8 m off (the city streams round it; the avatar is hidden in pinned mode).
  const ang0 = cam.eye ? Math.atan2(cam.eye[1] - sz, cam.eye[0] - sx) : 0.6;
  const px = sx + Math.cos(ang0) * 8, pz = sz + Math.sin(ang0) * 8;
  window.__pin = null;
  g.player.teleport({ x: px, y: hm.heightAt(px, pz) + 0.5, z: pz }, 0);
  const t0 = performance.now();
  await sleep(1500);
  let streamed = true;
  while (true) {
    const st = g.city.streamer;
    if (!st.job && !st.cellJob) break;
    if (performance.now() - t0 > 12000) {
      streamed = false;
      break;
    }
    await sleep(250);
  }
  await sleep(800);
  // max(street, terrain): the highest walkable surface under (x, z) that is not a roof.
  const groundAt = (x, z) => {
    const terrain = hm.heightAt(x, z);
    const from = Math.max(terrain, sy) + 3;
    const hit = g.physics.raycast({ x, y: from, z }, { x: 0, y: -1, z: 0 }, from - terrain + 4, Layer.World);
    const street = hit && hit.normal.y > 0.5 ? hit.point.y : null;
    return { terrain, street, y: Math.max(terrain, street ?? -Infinity) };
  };
  let ex, ez, clear = 1, auto = false;
  if (cam.eye) [ex, ez] = cam.eye;
  else {
    auto = true;
    let best = null;
    search: for (const d of [5.5, 7.5, 4, 10]) {
      for (let k = 0; k < 12; k++) {
        const a = ang0 + (k * Math.PI) / 6;
        const x = sx + Math.cos(a) * d, z = sz + Math.sin(a) * d;
        const gy = groundAt(x, z).y + above;
        const L = Math.hypot(x - sx, gy - sy, z - sz);
        const hit = g.physics.raycast({ x, y: gy, z }, { x: (sx - x) / L, y: (sy - gy) / L, z: (sz - z) / L }, L, Layer.World);
        const free = hit ? Math.max(0, hit.distance - 0.8) / L : 1;
        if (!best || free > best.free) best = { x, z, free };
        if (free >= 1) break search;
      }
    }
    ex = best.x;
    ez = best.z;
    clear = best.free;
  }
  const gr = groundAt(ex, ez);
  const ey = gr.y + above;
  if (cam.mode === 'third') {
    const fx = sx - ex, fz = sz - ez;
    g.player.teleport({ x: ex, y: gr.y + 0.2, z: ez }, Math.atan2(-fx, -fz));
    await sleep(2500);
  } else {
    window.__pin = [ex, ey, ez, sx, sy, sz];
    await sleep(900);
  }
  return { eye: [ex, ey, ez], street: gr.street, terrain: gr.terrain, auto, clear, streamed };
}
