#!/usr/bin/env node
/**
 * Real memory of a game session: boots the game headless (Chromium), waits, forces a garbage
 * collection and reports the resident memory of the page (renderer) and GPU processes plus the JS
 * heap. Compare runs before and after memory work.
 *
 *   node scripts/memory.mjs [--query "at=colosseum"] [--wait 15]
 */
import { createServer as createNetServer } from 'node:net';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1]]] : a), []));
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
await page.goto(`http://127.0.0.1:${port}/?scene=rome&${args.query ?? 'at=rostra&hour=10'}`);
await page.waitForFunction(() => window.__skyrome?.ready, null, { timeout: 120000, polling: 200 });
await page.waitForTimeout(Number(args.wait ?? 15) * 1000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.collectGarbage');
await page.waitForTimeout(1500);
const heap = await page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576));
// Resident memory of this browser's renderer and GPU processes (macOS/Linux ps; KB). Only the process
// tree of the browser launched here: other agents' or windows' Chromiums on the machine are not counted.
const bcdp = await browser.newBrowserCDPSession();
const { processInfo } = await bcdp.send('SystemInfo.getProcessInfo');
const table = execSync('ps -axo pid=,ppid=,rss=,command=').toString().split('\n').map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map((m) => ({ pid: +m[1], ppid: +m[2], rss: +m[3], cmd: m[4] }));
const mine = new Set(processInfo.map((p) => p.id));
const sum = (re) => Math.round(table.filter((r) => mine.has(r.pid) && re.test(r.cmd)).reduce((s2, r) => s2 + r.rss, 0) / 1024);
const renderer = sum(/--type=renderer/);
const gpu = sum(/--type=gpu-process/);
console.log(`JS heap ${heap} MB · page process ${renderer} MB · GPU process ${gpu} MB · total ${renderer + gpu} MB`);
await browser.close();
await server.close();
