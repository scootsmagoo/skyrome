#!/usr/bin/env node
/**
 * Check the seamless loops of the sustained samples (oboe, flute, cello) in the browser: each is played
 * looping for 14 s through an OfflineAudioContext, and we report the biggest jump between neighbouring
 * samples at the loop points relative to the typical step (about 1 is seamless), and how much the
 * 20 ms RMS envelope wobbles (in dB) once the loop is running.
 *
 *   node tools/music/loop-check.mjs
 */
import { createServer as createNetServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
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
const browser = await pw.chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR', String(e)));
await page.goto(`http://127.0.0.1:${port}/index.html?scene=audio`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 90000 }).catch(() => {});
const rows = await page.evaluate(async () => {
  const { vsco } = await import('/src/audio/music/vsco.ts');
  const { VSCO } = await import('/src/audio/music/vscoManifest.ts');
  await vsco.loadAll();
  const out = [];
  for (const group of ['oboe', 'flute', 'cello']) {
    for (const s of VSCO[group]) {
      const buf = vsco.get(s.id);
      const rate = buf.sampleRate;
      const ctx = new OfflineAudioContext(1, rate * 14, rate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = s.loop[0];
      src.loopEnd = s.loop[1];
      src.connect(ctx.destination);
      src.start(0);
      const r = (await ctx.startRendering()).getChannelData(0);
      // Loop boundaries after the first pass.
      const len = s.loop[1] - s.loop[0];
      let med = 0;
      const d = new Float32Array(r.length - 1);
      for (let i = 0; i < d.length; i++) d[i] = Math.abs(r[i + 1] - r[i]);
      const sorted = Float32Array.from(d).sort();
      med = sorted[Math.floor(sorted.length * 0.5)] || 1e-9;
      let worst = 0;
      for (let k = 1; s.loop[1] + (k - 1) * len < 13.5; k++) {
        const at = Math.round((s.loop[1] + (k - 1) * len) * rate);
        for (let i = at - 3; i <= at + 3; i++) if (i > 0 && i < d.length) worst = Math.max(worst, d[i] / med);
      }
      // Envelope wobble after the first loop pass.
      const win = Math.round(rate * 0.02);
      const env = [];
      for (let i = Math.round(s.loop[1] * rate); i + win < r.length; i += win) {
        let e = 0;
        for (let j = 0; j < win; j++) e += r[i + j] * r[i + j];
        env.push(10 * Math.log10(e / win + 1e-12));
      }
      const mean = env.reduce((a, b) => a + b, 0) / env.length;
      const sd = Math.sqrt(env.reduce((a, b) => a + (b - mean) ** 2, 0) / env.length);
      out.push({ id: s.id, jump: worst, wobbleDb: sd, loopS: len, extra: buf.duration - s.dur });
    }
  }
  return out;
});
console.log('id            loop s   seam jump (x typical step)   envelope wobble (dB sd)');
for (const r of rows) console.log(`${r.id.padEnd(13)} ${r.loopS.toFixed(2).padStart(6)} ${r.jump.toFixed(1).padStart(14)} ${r.wobbleDb.toFixed(2).padStart(24)}  decoded length - expected: ${(r.extra * 1000).toFixed(1)} ms`);
console.log(`worst jump ${Math.max(...rows.map((r) => r.jump)).toFixed(1)}x, worst wobble ${Math.max(...rows.map((r) => r.wobbleDb)).toFixed(2)} dB`);
await browser.close();
await server.close();
