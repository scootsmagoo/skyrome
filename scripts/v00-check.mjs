#!/usr/bin/env node
/**
 * v0.0 acceptance checks (GDD §17.0) that a script can run, against the real game:
 *
 *   landmarks  the 8 H landmarks stand at their atlas positions (±5 game m); nothing at the sites
 *              of the Arch of Septimius Severus or the Arch of Constantine (AC-03 subset)
 *   quickload  P saves; position, health, stamina, equipment and quest stage change; L (and Y to
 *              confirm) restores every one of them (v0.0 "quickload restores player and quest state")
 *   walk       a walker bot goes from the Arch of Titus to the Miliarium Aureum and on to the Ludus
 *              arena on foot, steering by the crowd's own pathfinding, and must never be stuck
 *              (AC-02 subset)
 *
 *   node scripts/v00-check.mjs [--only landmarks,quickload,walk] [--browser webkit] [--shots]
 *
 * Exit code 1 if any check fails. Prints one PASS/FAIL line per check, with details.
 */
import { createServer as createNetServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const only = args.only ? String(args.only).split(',') : ['landmarks', 'quickload', 'walk'];
const browserName = args.browser ?? 'chromium';
const outDir = resolve(root, '.shots');
mkdirSync(outDir, { recursive: true });

const { createServer } = await import('vite');
const port = await freePort();
const server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const pw = await import('playwright');
const browser = await pw[browserName].launch({ headless: true, args: browserName === 'chromium' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const results = [];

async function boot(query) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://127.0.0.1:${port}/?scene=rome&${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__skyrome?.ready, null, { timeout: 120000, polling: 200 });
  await page.waitForTimeout(3000);
  return { page, errors };
}

async function check(name, fn) {
  if (!only.includes(name)) return;
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name.padEnd(10)} ${((Date.now() - t0) / 1000).toFixed(0)} s  ${detail ?? ''}`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`FAIL  ${name.padEnd(10)} ${((Date.now() - t0) / 1000).toFixed(0)} s  ${e.message}`);
  }
}

const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

try {
  await check('landmarks', async () => {
    const { page, errors } = await boot('quick=1&hour=10');
    const r = await page.evaluate(async () => {
      const g = window.__skyrome.game;
      const atlas = await import('/src/data/atlas.ts');
      const coords = await import('/src/world/coords.ts');
      const H = ['miliarium-aureum', 'rostra', 'temple-castor-pollux', 'basilica-julia', 'arch-titus', 'colossus-sol', 'colosseum', 'ludus-magnus'];
      const out = [];
      for (const id of H) {
        const lm = atlas.LANDMARK_BY_ID[id];
        const placed = g.landmarks.get(id);
        if (!lm || !placed) {
          out.push({ id, missing: true });
          continue;
        }
        const [gx, gz] = coords.toGame(lm.center[0], lm.center[1]);
        out.push({ id, off: Math.hypot(placed.position.x - gx, placed.position.z - gz) });
      }
      // No later monuments: nothing placed within 6 game m of the two arch sites.
      const banned = [['arch of Septimius Severus', 30, -28], ['arch of Constantine', 521, 312]].map(([name, x, z]) => {
        const [gx, gz] = coords.toGame(x, z);
        const near = [...g.landmarks.values()].filter((p) => Math.hypot(p.position.x - gx, p.position.z - gz) < 6).map((p) => p.lm.id);
        return { name, near };
      });
      return { out, banned };
    });
    await page.close();
    const bad = r.out.filter((o) => o.missing || o.off > 5);
    expect(!bad.length, `off their atlas positions: ${bad.map((b) => `${b.id} ${b.missing ? 'missing' : b.off.toFixed(1) + ' m'}`).join(', ')}`);
    const ana = r.banned.filter((b) => b.near.length);
    expect(!ana.length, `something stands where a later arch would: ${ana.map((a) => `${a.name}: ${a.near.join(',')}`).join('; ')}`);
    expect(!errors.length, `console errors: ${errors.slice(0, 2).join(' | ')}`);
    return r.out.map((o) => `${o.id} ${o.off.toFixed(1)}`).join(' · ');
  });

  await check('quickload', async () => {
    const { page, errors } = await boot('at=rostra&hour=10');
    const k = page.keyboard;
    await page.mouse.click(640, 360);
    await page.waitForTimeout(300);
    const QID = 'mq-01-madida-capena';
    const state = () =>
      page.evaluate((qid) => {
        const g = window.__skyrome.game;
        const v = g.player.sheet.vitals;
        return {
          pos: g.player.position.toArray().map((n) => Math.round(n * 10) / 10),
          health: Math.round(v.health.current),
          stamina: Math.round(v.stamina.current),
          gear: Object.values(g.player.inventory.equipment).sort().join(','),
          denarii: g.player.inventory.denarii,
          stage: g.quests.state(qid)?.stage ?? null,
        };
      }, QID);
    await page.evaluate((qid) => {
      const g = window.__skyrome.game;
      g.player.sheet.vitals.set('health', 63);
      g.player.sheet.vitals.set('stamina', 41);
      g.quests.setStage(qid, 'gate');
    }, QID);
    await page.waitForTimeout(300);
    const before = await state();
    await k.press('KeyP');
    await page.waitForTimeout(1500);
    // Change everything the save must restore.
    await page.evaluate((qid) => {
      const g = window.__skyrome.game;
      const p = g.player.position;
      g.player.teleport({ x: p.x + 25, y: p.y + 2, z: p.z + 12 }, 1);
      g.player.sheet.vitals.set('health', 20);
      g.player.sheet.vitals.set('stamina', 90);
      g.player.inventory.unequip?.('mainHand');
      g.player.inventory.addDenarii(500);
      g.quests.setStage(qid, 'ambush');
    }, QID);
    await page.waitForTimeout(800);
    const changed = await state();
    expect(JSON.stringify(changed) !== JSON.stringify(before), 'the state did not change before loading');
    await k.press('KeyL');
    await page.waitForTimeout(500);
    const asking = await page.evaluate(() => window.__skyrome.game.ui?.top?.id);
    expect(asking === 'confirm', `L opened ${asking}, not the confirmation`);
    await k.press('KeyY');
    // Read the state the moment the load lands (health and stamina regenerate right after).
    let after = await state();
    for (let i = 0; i < 60 && Math.hypot(after.pos[0] - before.pos[0], after.pos[2] - before.pos[2]) > 0.6; i++) {
      await page.waitForTimeout(100);
      after = await state();
    }
    await page.close();
    const diffs = [];
    if (Math.hypot(after.pos[0] - before.pos[0], after.pos[2] - before.pos[2]) > 0.6) diffs.push(`position ${after.pos} vs ${before.pos}`);
    // A little regeneration happens between reading `before` and pressing P, and after loading.
    if (Math.abs(after.health - before.health) > 4) diffs.push(`health ${after.health} vs ${before.health}`);
    if (Math.abs(after.stamina - before.stamina) > 15) diffs.push(`stamina ${after.stamina} vs ${before.stamina}`);
    for (const key of ['gear', 'denarii', 'stage']) if (after[key] !== before[key]) diffs.push(`${key} ${after[key]} vs ${before[key]}`);
    expect(!diffs.length, `not restored: ${diffs.join('; ')}`);
    expect(!errors.length, `console errors: ${errors.slice(0, 2).join(' | ')}`);
    return `restored ${JSON.stringify(before)}`;
  });

  await check('walk', async () => {
    const { page, errors } = await boot('at=arch-titus&hour=10');
    // Under the Arch of Titus, then the Sacra Via (atlas points, real m) down to the Miliarium
    // Aureum; back up it past the Meta Sudans to the Ludus Magnus' entrance and into its arena.
    const legs = [
      { name: 'Miliarium Aureum', via: [[348, 188], [295, 131], [197, 82], [67, -4]], goal: "game.landmarks.get('miliarium-aureum').position", arrive: 8 },
      // ...then round the Colosseum's south side (its centre is at [660, 256]) to the Ludus.
      { name: 'Ludus arena', via: [[67, -4], [197, 82], [295, 131], [348, 188], [343, 209], [505, 269], [520, 290], [600, 385], [720, 390], [800, 330]], goal: ['ludus-entrance', 'arena-center'], arrive: 5 },
    ];
    await page.evaluate(async () => {
      const g = window.__skyrome.game;
      const a = g.landmarks.get('arch-titus').position;
      g.player.teleport({ x: a.x, y: a.y + 0.5, z: a.z }, 0);
    });
    await page.waitForTimeout(2500);
    const report = [];
    for (const leg of legs) {
      const r = await page.evaluate(
        async ({ via, goal, arrive }) => {
          const game = window.__skyrome.game;
          const coords = await import('/src/world/coords.ts');
          const lud = game.landmarks.get('ludus-magnus');
          const spot = (id) => lud.spots.find((s) => s.id.endsWith(id)).position;
          const pts = via.map(([x, z]) => {
            const [gx, gz] = coords.toGame(x, z);
            return { x: gx, z: gz, r: 10 };
          });
          const goals = Array.isArray(goal) ? goal.map((id) => ({ ...spot(id), r: arrive })) : [{ ...new Function('game', `return ${goal}`)(game), r: arrive }];
          const wps = [...pts, ...goals].map((w) => ({ x: w.x, z: w.z, r: w.r }));
          return new Promise((done) => {
            const p = game.player;
            const grid = game.population?.nav?.grid;
            const t0 = performance.now();
            const start = p.position.clone();
            let total = 0;
            let last = { x: start.x, z: start.z };
            for (const w of wps) (total += Math.hypot(w.x - last.x, w.z - last.z)), (last = w);
            const limit = (total / 1.5 + 60) * 1000;
            let i = 0;
            let corner = wps[0];
            let lastPlan = -1e9;
            let stuck = 0;
            let stuckAt = null;
            let win = { t: t0, x: start.x, z: start.z };
            let trap = { t: t0, x: start.x, z: start.z };
            let travelled = 0;
            const prev = start.clone();
            game.input.simulate('KeyW', true);
            const finish = (ok, why) => {
              game.input.simulate('KeyW', false);
              const pos = p.position;
              const w = wps[Math.min(i, wps.length - 1)];
              done({ ok, why, stuck, stuckAt, seconds: Math.round((performance.now() - t0) / 1000), route: Math.round(total), travelled: Math.round(travelled), waypoint: `${i}/${wps.length}`, left: Math.round(Math.hypot(w.x - pos.x, w.z - pos.z)), at: [Math.round(pos.x), Math.round(pos.y), Math.round(pos.z)] });
            };
            const tick = () => {
              const now = performance.now();
              const pos = p.position;
              travelled += Math.hypot(pos.x - prev.x, pos.z - prev.z);
              prev.copy(pos);
              const w = wps[i];
              if (Math.hypot(w.x - pos.x, w.z - pos.z) < w.r) {
                i++;
                lastPlan = -1e9;
                if (i >= wps.length) return finish(true);
              }
              if (now - t0 > limit) return finish(false, 'timed out');
              const target = wps[i];
              // Round what's in the way with the crowd's walk grid; straight on where it isn't built.
              if (now - lastPlan > 1500 || Math.hypot(corner.x - pos.x, corner.z - pos.z) < 1.2) {
                lastPlan = now;
                corner = target;
                // Beyond the built grid, aim for a reachable cell ~30 m along the way instead.
                // Goals inside a monument's base (the Miliarium Aureum) snap to the nearest reachable cell.
                let aim = (grid?.ready(target.x, target.z) && grid.nearestWalkable(target.x, target.z, 8, { x: 0, z: 0 }, true)) || target;
                const d = Math.hypot(target.x - pos.x, target.z - pos.z);
                if (grid?.ready(pos.x, pos.z) && !grid.ready(target.x, target.z) && d > 30) {
                  // Far: the crowd's own route (street graph, led through the grid).
                  const route = game.population.nav.findPath(pos.x, pos.z, target.x, target.z);
                  const c = Array.isArray(route) ? route.find((q) => Math.hypot(q.x - pos.x, q.z - pos.z) > 1.2) : null;
                  if (c) {
                    corner = c;
                    p.yaw = Math.atan2(-(corner.x - pos.x), -(corner.z - pos.z));
                    setTimeout(tick, 100);
                    return;
                  }
                  const mid = { x: pos.x + ((target.x - pos.x) / d) * 30, z: pos.z + ((target.z - pos.z) / d) * 30 };
                  aim = grid.nearestWalkable(mid.x, mid.z, 10, { x: 0, z: 0 }, true) ?? mid;
                }
                if (grid?.ready(pos.x, pos.z) && grid.ready(aim.x, aim.z) && !grid.lineWalkable(pos.x, pos.z, aim.x, aim.z)) {
                  const path = grid.findPath(pos.x, pos.z, aim.x, aim.z, 8000);
                  const c = path?.find((q) => Math.hypot(q.x - pos.x, q.z - pos.z) > 1.2);
                  if (c) corner = c;
                } else if (aim !== target) corner = aim;
              }
              p.yaw = Math.atan2(-(corner.x - pos.x), -(corner.z - pos.z));
              // A stall (under 1 m in 6 s) is noted and the walker looks further ahead, as a
              // person would; trapped (under 2 m in 20 s) fails the check.
              if (now - win.t > 6000) {
                if (Math.hypot(pos.x - win.x, pos.z - win.z) < 1) {
                  stuck++;
                  stuckAt ??= [Math.round(pos.x), Math.round(pos.y), Math.round(pos.z)];
                  lastPlan = -1e9;
                  game.input.simulate('Space', true);
                  setTimeout(() => game.input.simulate('Space', false), 80);
                }
                win = { t: now, x: pos.x, z: pos.z };
              }
              if (now - trap.t > 20000) {
                if (Math.hypot(pos.x - trap.x, pos.z - trap.z) < 2) return finish(false, 'trapped');
                trap = { t: now, x: pos.x, z: pos.z };
              }
              setTimeout(tick, 100);
            };
            tick();
          });
        },
        leg,
      );
      if (args.shots) await page.screenshot({ path: join(outDir, `walk-${leg.name.replace(/\W+/g, '-')}.png`) });
      report.push({ leg: leg.name, ...r });
      if (!r.ok) break;
    }
    await page.close();
    const summary = report.map((r) => `${r.leg}: ${r.ok ? 'arrived' : r.why} in ${r.seconds} s (${r.travelled} m walked of a ${r.route} m route), stuck ${r.stuck}×${r.stuckAt ? ' first at ' + r.stuckAt.join(',') : ''}${r.ok ? '' : ` · waypoint ${r.waypoint}, ${r.left} m short, at ${r.at.join(',')}`}`).join(' | ');
    expect(report.every((r) => r.ok) && report.length === legs.length, summary);
    expect(!errors.length, `console errors: ${errors.slice(0, 2).join(' | ')}`);
    return summary;
  });
} finally {
  await browser.close();
  await server.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
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
