#!/usr/bin/env node
/**
 * Render music offline in the real engine (page-side OfflineAudioContext through the real instruments
 * and the music hall reverb), save WAVs, and print level and spectrum statistics. This is how the
 * music is "heard" without ears: peak, RMS, LUFS (ffmpeg ebur128) and band energy (numpy).
 *
 *   node tools/music/render-check.mjs --tag after --states explore-day,combat --seconds 90
 *
 * Output: .cache/render/<tag>-<state>.wav, then a table from tools/music/analyze.py.
 */
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const tag = arg('tag', 'run');
const seconds = Number(arg('seconds', '90'));
const block = argv.includes('--block'); // simulate the recordings failing to load (the synthesised fallbacks)
const states = arg('states', 'explore-day,explore-night,tension,combat,tavern,temple').split(',');
const outDir = resolve(root, '.cache/render');
mkdirSync(outDir, { recursive: true });

const port = await new Promise((res) => {
  const s = createNetServer();
  s.listen(0, () => {
    const p = s.address().port;
    s.close(() => res(p));
  });
});
const { createServer } = await import('vite');
const server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
await server.listen();
const pw = await import('playwright');
const browser = await pw[arg('browser', 'chromium')].launch({ headless: true, args: arg('browser', 'chromium') === 'chromium' ? ['--autoplay-policy=no-user-gesture-required'] : [] });
const page = await browser.newPage();
if (block) await page.route(/\/audio\/music\/[^/]+\.(m4a|mp3)$/, (r) => r.abort());
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
page.on('console', (m) => (m.type() === 'error' ? console.log('console.error', m.text()) : null));
// A bare page on the dev server is enough: the verify module imports only the audio engine.
await page.goto(`http://127.0.0.1:${port}/index.html?scene=audio`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 90000 }).catch(() => {});

for (const state of states) {
  const r = await page.evaluate(
    async ({ state, seconds }) => {
      const m = await import('/src/audio/debug/verify.ts');
      const { row, buf } = await m.renderMusic(state, seconds);
      const enc = (a) => {
        const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
        let s = '';
        for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
        return btoa(s);
      };
      return { row, rate: buf.sampleRate, l: enc(buf.getChannelData(0)), r: enc(buf.getChannelData(1)) };
    },
    { state, seconds },
  );
  const l = new Float32Array(Buffer.from(r.l, 'base64').buffer.slice(0));
  const rr = new Float32Array(Buffer.from(r.r, 'base64').buffer.slice(0));
  const pcm = Buffer.alloc(l.length * 4);
  for (let i = 0; i < l.length; i++) {
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(l[i] * 32767))), i * 4);
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(rr[i] * 32767))), i * 4 + 2);
  }
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0);
  hdr.writeUInt32LE(36 + pcm.length, 4);
  hdr.write('WAVEfmt ', 8);
  hdr.writeUInt32LE(16, 16);
  hdr.writeUInt16LE(1, 20);
  hdr.writeUInt16LE(2, 22);
  hdr.writeUInt32LE(r.rate, 24);
  hdr.writeUInt32LE(r.rate * 4, 28);
  hdr.writeUInt16LE(4, 32);
  hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36);
  hdr.writeUInt32LE(pcm.length, 40);
  writeFileSync(`${outDir}/${tag}-${state}.wav`, Buffer.concat([hdr, pcm]));
  console.log(`${state}: ${r.row.events} events ${JSON.stringify(r.row.byPart)} peak ${r.row.peakDb.toFixed(1)} rms ${r.row.rmsDb.toFixed(1)} issues ${r.row.issues.join('; ') || 'none'}`);
}
await browser.close();
await server.close();
spawnSync('python3', [resolve(root, 'tools/music/analyze.py'), ...states.map((s) => `${outDir}/${tag}-${s}.wav`)], { stdio: 'inherit' });
