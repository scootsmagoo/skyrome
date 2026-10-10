#!/usr/bin/env node
/**
 * How much talking does the city do? Boots the real game at a few places and hours, unlocks audio,
 * waits for things to settle, then for one minute counts every ambience sound that is a voice
 * (amb.chatter / amb.murmur / amb.calls) with the distance it played at, and records the master
 * output and the ambience bus (the dry feed) to report loudness.
 *
 *   node scripts/sfx/chatter.mjs [--only forum-10,subura-10,subura-23] [--seconds 60] [--json out.json]
 *
 * Reported per scenario: NPCs within 25 m, voices per minute (by sound id, and the audible ones within
 * 20 m), the median / nearest voice distance, the ambience layers' target levels, the crowd layer's
 * level, LUFS-I of the master and the ambience bus RMS (dBFS).
 * Used for docs/research/crowd-audio.md (before and after).
 */
import { createServer as createNetServer } from 'node:net';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, kWeight } from './dsp.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const seconds = Number(opt('seconds', '60'));
const only = opt('only', 'forum-10,subura-10,subura-23').split(',');
const SCENARIOS = {
  'forum-10': 'at=rostra&hour=10',
  'forum-13': 'at=rostra&hour=13.5',
  'subura-10': 'at=subura&hour=10',
  'subura-23': 'at=subura&hour=23',
  'forum-23': 'at=rostra&hour=23',
};

const INSTALL = `(() => {
  const g = window.__skyrome.game;
  const a = g.audio;
  window.__voices = [];
  const op = a.play.bind(a);
  a.play = (id, o) => {
    const r = op(id, o);
    if (/^amb\\.(chatter|murmur|calls)/.test(id) && o && o.position) window.__voices.push({ id, d: a.distanceTo(o.position), ok: !!r, t: performance.now() });
    return r;
  };
  return true;
})()`;

const CAPTURE = `(s) => window.__skyrome.game.audio.capture(s).then((r) => {
  const b64 = (f) => { const u = new Uint8Array(f.buffer, f.byteOffset, f.byteLength); let t = ''; for (let i = 0; i < u.length; i += 32768) t += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(t); };
  const dec = (f) => { const o = new Float32Array(Math.floor(f.length / 4)); for (let i = 0; i < o.length; i++) o[i] = f[i * 4]; return o; };
  return { rate: r.rate, out: b64(r.out), amb: b64(dec(r.buses.ambience)) };
})`;

const un = (s) => {
  const b = Buffer.from(s, 'base64');
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const rmsDb = (a) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return db(Math.sqrt(s / Math.max(1, a.length)));
};
function lufs(out, fs) {
  const k = kWeight(out, fs);
  const blk = Math.round(0.4 * fs);
  const hop = Math.round(0.1 * fs);
  const ms = [];
  for (let s = 0; s + blk <= k.length; s += hop) {
    let a = 0;
    for (let i = s; i < s + blk; i++) a += k[i] * k[i];
    ms.push(a / blk);
  }
  const l = (m) => -0.691 + 10 * Math.log10(Math.max(1e-12, m));
  const abs = ms.filter((m) => l(m) > -70);
  if (!abs.length) return -Infinity;
  const rel = l(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((m) => l(m) > rel);
  return l(gated.reduce((a, b) => a + b, 0) / Math.max(1, gated.length));
}

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
const browser = await pw.chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const results = {};
for (const name of only) {
  const q = SCENARIOS[name];
  if (!q) continue;
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  page.on('pageerror', (e) => console.log('PAGE ERROR', String(e).slice(0, 300)));
  await page.goto(`http://127.0.0.1:${port}/?${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 120000, polling: 100 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const game = window.__skyrome.game;
    game.audio.unlock?.();
  });
  await page.waitForTimeout(14000);
  await page.evaluate(INSTALL);
  const rec = page.evaluate(`(${CAPTURE})(${seconds})`);
  // Sample the crowd around the player a few times while the minute runs.
  const pops = [];
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout((seconds * 1000) / 4);
    pops.push(await page.evaluate(() => {
      const g = window.__skyrome.game;
      return { n25: g.population ? g.population.near(g.player.position, 25).length : -1, n12: g.population ? g.population.near(g.player.position, 12).length : -1 };
    }));
  }
  const r = await rec;
  const info = await page.evaluate(() => {
    const g = window.__skyrome.game;
    const v = window.__voices;
    return { voices: v, levels: Object.fromEntries([...g.audio.ambience.levels].map(([k, x]) => [k, +x.toFixed(3)])), hour: g.audio.ambience.hour };
  });
  const by = {};
  for (const v of info.voices) by[v.id] = (by[v.id] ?? 0) + 1;
  const played = info.voices.filter((v) => v.ok);
  const near = played.filter((v) => v.d <= 20);
  const ds = played.map((v) => v.d).sort((a, b) => a - b);
  const row = {
    pops,
    perMinute: +(info.voices.length * (60 / seconds)).toFixed(1),
    playedPerMinute: +(played.length * (60 / seconds)).toFixed(1),
    within20PerMinute: +(near.length * (60 / seconds)).toFixed(1),
    byId: by,
    nearestD: ds.length ? +ds[0].toFixed(1) : null,
    medianD: ds.length ? +ds[Math.floor(ds.length / 2)].toFixed(1) : null,
    levels: info.levels,
    lufsI: +lufs(un(r.out), r.rate).toFixed(1),
    ambRmsDb: +rmsDb(un(r.amb)).toFixed(1),
  };
  results[name] = row;
  console.log(name, JSON.stringify(row));
  await page.close();
}
await browser.close();
await server.close();
const out = opt('json', '');
if (out) writeFileSync(out, JSON.stringify(results, null, 1));
