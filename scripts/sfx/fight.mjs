#!/usr/bin/env node
/**
 * Acceptance check for the mix: boots the real game, unlocks audio, starts the ambience of the
 * Forum and plays a dense fight (six fighters, swings, clashes, blocks, hits, falls, hobnailed
 * steps, grunts) for 12 s while polling `game.audio.meter()`. Reports the highest peak and RMS.
 *
 *   node scripts/sfx/fight.mjs [--samples 0]
 */
import { createServer as createNetServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const freePort = () =>
  new Promise((res) => {
    const s = createNetServer().listen(0, () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
const { createServer } = await import('vite');
const port = await freePort();
const server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const pw = await import('playwright');
const browser = await pw.chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => errors.push(String(e?.stack ?? e)));
const q = new URLSearchParams({ at: 'rostra', hour: '10' });
if (argv.includes('--samples') && argv[argv.indexOf('--samples') + 1] === '0') q.set('samples', '0');
try {
  await page.goto(`http://127.0.0.1:${port}/?${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 90000, polling: 100 });
  await page.waitForTimeout(3000);
  const res = await page.evaluate(async () => {
    const g = window.__skyrome.game;
    const a = g.audio;
    a.unlock();
    await new Promise((r) => setTimeout(r, 6000));
    const p = a.listener.clone();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const at = (i) => ({ x: p.x + Math.cos(i * 1.1) * (2 + (i % 3)), y: p.y, z: p.z + Math.sin(i * 1.1) * (2 + (i % 3)) });
    // Quiet first: the exploring level (ambience + the Forum's own zones) for 2 s.
    const track = { peak: -120, rms: -120, glue: 0, lim: 0 };
    const poll = () => {
      const m = a.meter();
      if (!m) return;
      track.peak = Math.max(track.peak, m.peakDb);
      track.rms = Math.max(track.rms, m.rmsDb);
      track.glue = Math.min(track.glue, m.glueDb);
      track.lim = Math.min(track.lim, m.limiterDb);
    };
    a.meter();
    await sleep(300);
    const calm = { peak: -120, rms: -120 };
    for (let i = 0; i < 60; i++) {
      const m = a.meter();
      calm.peak = Math.max(calm.peak, m.peakDb);
      calm.rms = Math.max(calm.rms, m.rmsDb);
      await sleep(33);
    }
    const t0 = performance.now();
    const events = [];
    let n = 0;
    while (performance.now() - t0 < 12000) {
      for (let f = 0; f < 6; f++) {
        const pos = at(f);
        const r = Math.random();
        if (r < 0.35) events.push(a.play(['swing.fast', 'swing.medium', 'swing.slow'][n % 3], { position: pos }));
        else if (r < 0.6) events.push(a.play('clash.metal', { position: pos }));
        else if (r < 0.72) events.push(a.play('block.shield', { position: pos }));
        else if (r < 0.88) events.push(a.play('hit.flesh', { position: pos }), a.play('vox.pain.m', { position: pos }));
        else if (r < 0.92) events.push(a.play('body.fall', { position: pos }));
        else events.push(a.play('block.metal', { position: pos }));
        events.push(a.play(`step.cobbles.run`, { position: pos, volume: 0.8 }), a.play('gear.hobnail', { position: pos, volume: 0.6 }));
        n++;
      }
      for (let k = 0; k < 8; k++) {
        poll();
        await sleep(30);
      }
    }
    return { calm, fight: track, stats: a.stats(), played: events.filter(Boolean).length };
  });
  console.log(JSON.stringify(res, null, 1));
  if (errors.length) console.log('console:\n' + errors.slice(0, 10).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
