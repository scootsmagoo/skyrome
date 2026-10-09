#!/usr/bin/env node
/**
 * Live level check in the real game: boots the audio scene, silences every bus but the music, plays each
 * music state for a while and samples game.audio.meter() (the output after master glue, limiter and
 * clipper) 20 times a second.
 *
 *   node tools/music/live-meter.mjs [--root <repo>] [--states explore-day,combat] [--seconds 20]
 *
 * `--root` lets the same script measure another checkout (the "before" numbers).
 */
import { createServer as createNetServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const root = resolve(arg('root', here));
const states = arg('states', 'explore-day,explore-night,tension,combat,tavern,temple,seikilos,delphic').split(',');
const seconds = Number(arg('seconds', '20'));

const port = await new Promise((res) => {
  const s = createNetServer();
  s.listen(0, () => {
    const p = s.address().port;
    s.close(() => res(p));
  });
});
const { createServer } = await import(resolve(root, 'node_modules/vite/dist/node/index.js'));
const server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const pw = await import(resolve(root, 'node_modules/playwright/index.mjs'));
const browser = await pw.chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', (e) => console.log('PAGE ERROR', String(e)));
await page.goto(`http://127.0.0.1:${port}/?scene=audio`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 90000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const game = window.__skyrome.game;
  game.audio.unlock();
  const d = game.settings.data;
  d.ambienceVolume = 0;
  d.sfxVolume = 0;
  d.voiceVolume = 0;
  d.uiVolume = 0;
  game.audio.setMuted(false);
});
await page.waitForTimeout(1500);
console.log(`music only, default music slider; ${seconds} s per state (the first ~8 s are the fade-in and load)`);
console.log('state          peak dBFS   mean-RMS dBFS (while sounding)   max RMS   glue dB   samples MB');
for (const state of states) {
  const r = await page.evaluate(
    async ({ state, seconds }) => {
      const game = window.__skyrome.game;
      game.audio.music.setState(state);
      await new Promise((r) => setTimeout(r, 9000));
      const rows = [];
      const t0 = performance.now();
      while (performance.now() - t0 < (seconds - 9) * 1000) {
        rows.push(game.audio.meter());
        await new Promise((r) => setTimeout(r, 50));
      }
      const live = rows.filter((m) => m.rmsDb > -80);
      const pw = live.length ? 10 * Math.log10(live.reduce((a, m) => a + Math.pow(10, m.rmsDb / 10), 0) / live.length) : -120;
      return {
        peak: Math.max(...rows.map((m) => m.peakDb)),
        rms: pw,
        maxRms: Math.max(...rows.map((m) => m.rmsDb)),
        glue: Math.min(...rows.map((m) => m.glueDb)),
        mb: game.audio.stats().musicMB,
        sounding: live.length / rows.length,
      };
    },
    { state, seconds },
  );
  console.log(`${state.padEnd(14)} ${r.peak.toFixed(1).padStart(8)} ${r.rms.toFixed(1).padStart(14)}  (${Math.round(r.sounding * 100)}% of windows)  ${r.maxRms.toFixed(1).padStart(8)} ${r.glue.toFixed(1).padStart(9)} ${r.mb.toFixed(1).padStart(10)}`);
}
await browser.close();
await server.close();
