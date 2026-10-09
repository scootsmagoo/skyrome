#!/usr/bin/env node
/**
 * Boots the real game headless, unlocks audio, and reports every sound the way the engine holds it:
 * source (recording or synth), variants, duration, peak and RMS (dBFS), plus engine stats. Used for
 * the listening checklist in the A1 report.
 *
 *   node scripts/sfx/report.mjs [--samples 0] [--out file.json]
 */
import { createServer as createNetServer } from 'node:net';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
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
const web = opt('--browser', 'chromium') === 'webkit';
const browser = await (web ? pw.webkit : pw.chromium).launch({ headless: true, args: web ? [] : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => errors.push(String(e?.stack ?? e)));
const q = new URLSearchParams({ at: 'rostra', hour: '10' });
if (opt('--samples', '1') === '0') q.set('samples', '0');
try {
  await page.goto(`http://127.0.0.1:${port}/?${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 90000, polling: 100 });
  await page.waitForTimeout(4000);
  const rows = await page.evaluate(async () => {
    const g = window.__skyrome.game;
    g.audio.unlock();
    await new Promise((r) => setTimeout(r, 2500));
    const { SOUNDS } = await import('/src/audio/bank.ts');
    const out = [];
    for (const def of SOUNDS.values()) {
      g.audio.prepare(def.id);
    }
    await new Promise((r) => setTimeout(r, 4000));
    for (const def of SOUNDS.values()) {
      const bufs = g.audio.buffersIfReady(def);
      const recorded = !!g.audio.samples?.ids().includes(def.id);
      if (!bufs) {
        out.push({ id: def.id, kind: def.kind, recorded, missing: true });
        continue;
      }
      const st = bufs.map((b) => {
        const d = b.getChannelData(0);
        let pk = 0;
        let s = 0;
        for (let i = 0; i < d.length; i++) {
          const a = Math.abs(d[i]);
          if (a > pk) pk = a;
          s += d[i] * d[i];
        }
        return { dur: b.duration, pk: 20 * Math.log10(pk || 1e-9), rms: 10 * Math.log10(s / d.length || 1e-9) };
      });
      out.push({ id: def.id, kind: def.kind, recorded, n: bufs.length, rate: bufs[0].sampleRate, dur: [Math.min(...st.map((x) => x.dur)), Math.max(...st.map((x) => x.dur))], pk: Math.max(...st.map((x) => x.pk)), rms: st.reduce((a, x) => a + x.rms, 0) / st.length });
    }
    return { rows: out, stats: g.audio.stats() };
  });
  const r = rows.rows;
  console.log(`stats: ${JSON.stringify(rows.stats)}`);
  console.log(`${r.length} sounds, ${r.filter((x) => x.recorded).length} recorded, ${r.filter((x) => x.missing).length} not ready`);
  for (const x of r.filter((x) => x.recorded || x.missing)) {
    if (x.missing) console.log(`${x.id.padEnd(26)} NOT READY`);
    else console.log(`${x.id.padEnd(26)} ${String(x.n).padStart(2)}x ${x.dur[0].toFixed(2)}-${x.dur[1].toFixed(2)}s  pk ${x.pk.toFixed(1)}  rms ${x.rms.toFixed(1)}  ${x.rate} Hz`);
  }
  if (opt('--out')) writeFileSync(opt('--out'), JSON.stringify(rows, null, 1));
  if (errors.length) console.log('console:\n' + errors.slice(0, 10).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
