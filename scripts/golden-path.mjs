#!/usr/bin/env node
/**
 * AC-15: a bot plays Act I as built (docs/STORY.md: mq-01 the gate → mq-02 the tablet → mq-03 the
 * Lemuria → mq-04 the dedication of the Column) from the Porta Capena at dawn, and reports every
 * place a player would get stuck.
 * The bot is scripts/golden-bot.js.
 *
 *   node scripts/golden-path.mjs [--minutes 40] [--shots] [--query "origin=dacus"]
 *
 * Prints the quest timeline, the snags (jams, unresolved markers, missing NPCs, objectives that don't
 * complete) and page errors; exit code 1 unless all four chapters complete.
 */
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] === undefined || all[i + 1].startsWith('--') ? true : all[i + 1]]] : a), []));
const minutes = Number(args.minutes ?? 40);
const bot = readFileSync(resolve(root, 'scripts/golden-bot.js'), 'utf8');
const outDir = resolve(root, '.shots');
mkdirSync(outDir, { recursive: true });

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
const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)));
page.on('console', (m) => m.type() === 'error' && pageErrors.push(`[console] ${m.text()}`));
page.on('crash', () => console.log('PAGE CRASHED'));
page.on('framenavigated', (f) => f === page.mainFrame() && console.log(`navigated: ${f.url()}`));
await page.goto(`http://127.0.0.1:${port}/?scene=rome&quick=1&${args.query ?? ''}`);
await page.waitForFunction(() => window.__skyrome?.ready, null, { timeout: 120000, polling: 200 });
await page.waitForTimeout(3000);
await page.addScriptTag({ content: bot });

const t0 = Date.now();
let seen = 0;
let snagSeen = 0;
let errorSeen = 0;
let shot = 0;
while (Date.now() - t0 < minutes * 60000) {
  await page.waitForTimeout(5000);
  const s = await page.evaluate((from) => {
    const L = window.__gp;
    const g = window.__skyrome?.game;
    if (!L || !g) return { done: true, events: [], n: from, snags: 0, hour: '?', pos: [], lost: true };
    return { done: L.done, events: L.events.slice(from), n: L.events.length, snags: L.snags.length, hour: g.time.hour.toFixed(2), pos: g.player.position.toArray().map(Math.round) };
  }, seen);
  for (const e of s.events) {
    if (e[1] === 'notify') continue;
    console.log(`  ${String(e[0]).padStart(6)} s  ${e.slice(1).join(' · ')}`);
    if (args.shots && (e[1] === 'stage' || e[1] === 'completed')) await page.screenshot({ path: join(outDir, `gp-${String(shot++).padStart(2, '0')}-${e[2]}-${e[3] ?? ''}.png`) });
  }
  seen = s.n;
  const snags = await page.evaluate((from) => window.__gp.snags.slice(from).map((x) => ({ ...x })), snagSeen);
  for (const x of snags) console.log(`  ${String(x.t).padStart(6)} s  snag ${x.kind}: ${x.detail}  [${x.goal}] at ${x.pos.join(',')}`);
  snagSeen += snags.length;
  const errs = await page.evaluate((from) => window.__gp.errors.slice(from), errorSeen);
  for (const x of errs) console.log(`  bot error: ${x}`);
  errorSeen += errs.length;
  if (s.done) break;
}
const r = await page.evaluate(() => {
  const L = window.__gp;
  clearInterval(L.timer);
  const g = window.__skyrome.game;
  const ids = ['mq-01-madida-capena', 'mq-02-tabella', 'mq-03-lemuria', 'mq-04-columna'];
  return {
    seconds: Math.round((performance.now() - L.t0) / 1000),
    quests: ids.map((id) => `${id}: ${JSON.stringify(g.quests.status(id))}`),
    snags: L.snags,
    errors: L.errors,
    walked: Math.round(L.walked),
    teleports: L.teleports,
    fights: L.fights,
    hour: g.time.hour.toFixed(2),
    talks: L.talks.length,
  };
});
console.log(`\n${Math.round(r.seconds / 60)} min · walked ${r.walked} m · ${r.teleports} teleports · ${r.fights} fights · ${r.talks} dialogue steps · game hour ${r.hour}`);
for (const q of r.quests) console.log(`  ${q}`);
console.log(`\nSnags (${r.snags.length}):`);
for (const s of r.snags) console.log(`  ${String(s.t).padStart(6)} s  ${s.kind}: ${s.detail}  [${s.goal}] at ${s.pos.join(',')}`);
const errs = [...new Set([...r.errors, ...pageErrors])];
if (errs.length) console.log(`\nErrors (${errs.length}):\n  ${errs.slice(0, 12).join('\n  ')}`);
await browser.close();
await server.close();
const ok = r.quests.every((q) => q.includes('"completed":true'));
console.log(`\n${ok ? 'PASS' : 'FAIL'}: the golden path ${ok ? 'completes' : 'does not complete'}`);
process.exit(ok ? 0 : 1);
