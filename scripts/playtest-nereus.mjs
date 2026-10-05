#!/usr/bin/env node
/**
 * AC-08 agent playtest: a bot fights Nereus (lud-01's third bout, a lusio) with each playable
 * origin's own gear plus the Ludus-issued rudis and scutum, on Normal.
 *
 *   node scripts/playtest-nereus.mjs [--origins civis-suburanus,hispanus,veteranus,dacus]
 *                                    [--browser webkit] [--minutes 7] [--shots] [--bout 1|2|3]
                                    [--parry 0.5] (how often the bot tries a parry instead of a block)
 *
 * Prints per origin: who won, how long it took, phases reached, nets thrown and dodged, hits
 * both ways, the crowd's favor, the lowest health. The bot is scripts/nereus-bot.js.
 */
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const origins = String(args.origins ?? 'civis-suburanus,hispanus,veteranus,dacus').split(',');
const minutes = Number(args.minutes ?? 7);
const browserName = args.browser ?? 'chromium';
const bot = readFileSync(resolve(root, 'scripts/nereus-bot.js'), 'utf8');
const outDir = resolve(root, '.shots');
mkdirSync(outDir, { recursive: true });

const { createServer } = await import('vite');
const port = await freePort();
const server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const pw = await import('playwright');
const browser = await pw[browserName].launch({ headless: true, args: browserName === 'chromium' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
let failures = 0;
try {
  for (const origin of origins) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
    await page.goto(`http://127.0.0.1:${port}/?scene=rome&quick=1&hour=10&at=ludus-magnus&origin=${origin}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__skyrome?.ready, null, { timeout: 120000, polling: 200 });
    await page.waitForTimeout(4000);
    const kit = await page.evaluate(() => {
      const inv = window.__skyrome.game.player.inventory;
      return Object.values(inv.equipment).join(',');
    });
    await page.evaluate(([b, k]) => ((window.__bout = b), (window.__nereusSkill = k)), [Number(args.bout ?? 3), Number(args.parry ?? 0.5)]);
    await page.addScriptTag({ content: bot });
    const t0 = Date.now();
    let shot = 0;
    while (Date.now() - t0 < minutes * 60000) {
      await page.waitForTimeout(2000);
      const end = await page.evaluate(() => window.__nereus?.end);
      if (args.shots && Date.now() - t0 > shot * 30000) {
        await page.screenshot({ path: join(outDir, `nereus-${origin}-${shot}.png`) });
        shot++;
      }
      if (end) break;
    }
    // A yield opens the missio prompt: let it settle, then read the log.
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => {
      const l = window.__nereus;
      clearInterval(l.timer);
      const g = window.__skyrome.game;
      const boss = g.combat.core.get(['npc-pullus', 'npc-auctus', 'npc-nereus'][Number(window.__bout ?? 3) - 1]);
      const top = g.ui?.top;
      return {
        end: l.end,
        yielded: l.yielded,
        seconds: +((performance.now() - l.t0) / 1000).toFixed(0),
        phases: l.phases,
        nets: l.nets,
        entangled: l.entangled,
        parries: l.parries,
        hitsBy: l.hitsBy,
        hitsOn: l.hitsOn,
        dmgBy: Math.round(l.dmgBy),
        dmgOn: Math.round(l.dmgOn),
        favor: l.favor.length ? l.favor[l.favor.length - 1][1] : null,
        favorEvents: l.favor.length,
        minHp: l.minHp,
        bossHp: boss ? Math.round(boss.healthFrac() * 100) : null,
        prompt: top?.view?.line?.text?.slice(0, 80) ?? null,
        events: l.events.slice(-6),
        taken: l.taken.slice(0, 30),
        tries: l.tries,
        stamina: Math.round(l.staminaSum / Math.max(1, l.staminaN)),
        lowStamina: +(l.lowStamina / Math.max(1, l.staminaN)).toFixed(2),
        openings: +(l.openings / Math.max(1, l.ticks)).toFixed(2),
        bossIdle: +(l.bossIdle / Math.max(1, l.ticks)).toFixed(2),
      };
    });
    const won = /^npc-/.test(r.yielded ?? '') || /^foe /.test(r.end ?? '');
    if (!won) failures++;
    console.log(`\n== ${origin} (${kit})`);
    console.log(`  ${won ? 'WON' : 'LOST/UNFINISHED'} in ${r.seconds} s · end: ${r.end} · yielded: ${r.yielded} · Nereus at ${r.bossHp}% · your lowest health ${r.minHp}`);
    console.log(`  phases ${JSON.stringify(r.phases)} · nets ${r.nets} (caught ${r.entangled}) · parries ${r.parries} · hits ${r.hitsBy} for ${r.dmgBy} / taken ${r.hitsOn} for ${r.dmgOn} · favor ${r.favor} (${r.favorEvents} changes)`);
    if (r.prompt) console.log(`  prompt: ${r.prompt}`);
    console.log(`  last events: ${JSON.stringify(r.events)}`);
    if (args.verbose) console.log(`  attack tries ${r.tries} · mean stamina ${r.stamina} · time winded ${r.lowStamina} · in openings ${r.openings} · Nereus idle ${r.bossIdle}`);
    if (args.verbose) console.log(`  blows taken: ${r.taken.map((t) => t.filter(Boolean).join(' ')).join(' | ')}`);
    if (errors.length) console.log(`  page errors: ${errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failures ? 1 : 0);

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
