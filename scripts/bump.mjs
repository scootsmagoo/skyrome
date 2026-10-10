#!/usr/bin/env node
/**
 * Bump test: run the real player into posed NPCs and count what the topple gate decides.
 *
 *   node scripts/bump.mjs [--n 20] [--roles citizen,porter,soldier] [--speeds run,sprint]
 *                         [--query "at=rostra&hour=10&crowd=0"] [--log 1]
 *
 * Each trial spawns one NPC of the role on open paving, stands it still with a random heading,
 * puts the player 16 m off, holds forward (and the sprint key) until the contact is resolved,
 * and reads the outcome from ToppleGate.resolve. Prints a table of none / stumble / fall counts.
 * `--roles porter` gives an amphora carrier (propChance is forced to a load via `forceLoad`).
 */
import { createServer as createNetServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1];
const N = Number(a.n ?? 20);
const roles = (a.roles ?? 'citizen,porter,soldier').split(',');
const speeds = (a.speeds ?? 'run,sprint').split(',');
const wantLoad = a.load === '1';
const query = a.query ?? 'at=rostra&hour=10&crowd=0&vignettes=0&stations=0';

const { createServer } = await import('vite');
const port = await new Promise((res) => {
  const s = createNetServer();
  s.listen(0, '127.0.0.1', () => {
    const p = s.address().port;
    s.close(() => res(p));
  });
});
const server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const pw = await import('playwright');
const browser = await pw.chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('PAGE ERROR', String(e).slice(0, 300)));
await page.goto(`http://127.0.0.1:${port}/?${query}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 90000, polling: 100 });
await page.waitForTimeout(2000);

const result = await page.evaluate(
  async ({ N, roles, speeds, wantLoad }) => {
    const game = window.__skyrome.game;
    const pop = game.population;
    const p = game.player;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const log = [];
    const gate = pop.topple;
    const orig = gate.resolve.bind(gate);
    let last = null;
    gate.resolve = (id, now, c, r, roll) => {
      const o = orig(id, now, c, r, roll);
      if (!last || last.o === 'none') last = { id, o, approach: c.approach, facing: c.facing };
      return o;
    };
    const p0 = { x: p.position.x, y: p.position.y, z: p.position.z };
    let best = null;
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2;
      const d = { x: Math.sin(ang), y: 0, z: Math.cos(ang) };
      let clear = 0;
      for (const h of [0.4, 1.0, 1.6]) {
        const hit = game.physics.raycast({ x: p0.x, y: p0.y + h, z: p0.z }, d, 30, 1);
        clear += hit ? hit.distance : 30;
      }
      if (!best || clear > best.clear) best = { clear, d };
    }
    const dir = best.d;
    const out = {};
    for (const role of roles) {
      for (const speed of speeds) {
        const key = `${role}/${speed}`;
        const c = { none: 0, stumble: 0, fall: 0, timeout: 0 };
        for (let i = 0; i < N; i++) {
          const nx = p0.x + dir.x * 16;
          const nz = p0.z + dir.z * 16;
          let npc = null;
          for (let tries = 0; tries < 12; tries++) {
            npc = pop.spawnAmbient(role, nx, nz, Math.random() * Math.PI * 2, { escorts: false });
            if (!npc || !wantLoad || npc.prop) break;
            pop.despawn(npc);
            npc = null;
          }
          if (!npc) {
            c.timeout++;
            continue;
          }
          const load = npc.prop?.kind ?? null;
          pop.pose(npc, 'stand', npc.heading);
          await sleep(300);
          p.teleport({ x: p0.x, y: p0.y, z: p0.z }, 0);
          p.yaw = Math.atan2(-dir.x, -dir.z);
          p.velocity.set(0, 0, 0);
          last = null;
          game.input.simulate('KeyW', true);
          if (speed === 'sprint') game.input.simulate('ShiftLeft', true);
          const t0 = performance.now();
          while (!last && performance.now() - t0 < 9000) {
            await sleep(40);
            const dx = npc.position.x - p.position.x;
            const dz = npc.position.z - p.position.z;
            p.yaw = Math.atan2(-dx, -dz);
          }
          game.input.simulate('KeyW', false);
          game.input.simulate('ShiftLeft', false);
          if (!last) c.timeout++;
          else {
            c[last.o]++;
            last.speedAfter = Math.hypot(p.velocity.x, p.velocity.z);
            log.push(`${key} #${i} ${last.o} approach=${last.approach.toFixed(1)} facing=${last.facing.toFixed(2)} load=${load} playerSpeedAfter=${(last.speedAfter ?? 0).toFixed(1)}`);
          }
          await sleep(700);
          pop.undirect(npc);
          pop.despawn(npc);
          await sleep(150);
        }
        out[key] = c;
      }
    }
    return { out, log };
  },
  { N, roles, speeds, wantLoad },
);

console.table(result.out);
if (a.log) console.log(result.log.join('\n'));
await browser.close();
await server.close();
process.exit(0);
