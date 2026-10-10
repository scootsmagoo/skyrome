#!/usr/bin/env node
/**
 * Records the real game's master bus for 30 s at four places and reports loudness and spectra.
 *
 *   node scripts/sfx/mixcheck.mjs [--only forum-day,subura-night,combat,temple,crossfade] [--seconds 30]
 *                                 [--md out.md] [--json out.json] [--root <checkout>]
 *
 * Each scenario boots a fresh game (headless Chromium), unlocks audio, sets the scene up, waits for
 * the sounds and music to settle, then calls game.audio.capture(): the final output (after glue,
 * limiter and clipper) plus the dry feed of each bus. Reported:
 *   LUFS-I  integrated K-weighted loudness of the output (BS.1770, gated), LUFS-M max momentary
 *   peak    sample peak (dBFS); LRA-ish: p95 - p10 of 3 s short-term loudness
 *   buses   RMS (dBFS, K-weighted off) of each bus feed: how loud music is against the ambience
 *   bands   octave-band share of the output energy; centroid; share above 5 kHz
 * `crossfade` plays explore, combat and explore again and reports the biggest 100 ms step of the
 * music bus's level (a smooth fade is a few dB per 100 ms; a cut is tens of dB).
 */
import { createServer as createNetServer } from 'node:net';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, kWeight, peakOf, spectrum, truePeak } from './dsp.mjs';

const here = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const root = resolve(opt('root', here));
const seconds = Number(opt('seconds', '30'));
const only = opt('only', 'forum-day,subura-night,combat,temple,crossfade').split(',');

// ---- scenarios: query, a setup run in the page, and how long to let things settle before recording
const IN_PAGE_TEMPLE = `
  // The game opens on 13 May, the last day of the Lemuria, when the temples are shut and silent: open them.
  if (game.calendar) game.calendar.festivals = () => [];
  if (game.rpg && game.rpg.hooks) game.rpg.hooks.templesClosed = () => false;
  const A = await import('/src/data/atlas.ts'); const C = await import('/src/world/coords.ts');
  const lm = A.LANDMARK_BY_ID['temple-saturn']; const [x, z] = C.toGame(lm.center[0], lm.center[1]);
  const h = game.terrain.heightAt(x, z);
  game.player.teleport({ x, y: h + 0.5, z }, 0);
`;
const SCENARIOS = {
  'forum-day': { query: 'at=rostra&hour=10', setup: '', settle: 14 },
  'subura-night': { query: 'at=subura&hour=23', setup: '', settle: 14 },
  combat: {
    query: 'at=rostra&hour=10',
    setup: `game.console.exec('tgm on'); game.console.exec('spawn thraex 2');
      window.__fightTimer = setInterval(() => { game.input.simulate('KeyF', true); setTimeout(() => game.input.simulate('KeyF', false), 90); }, 700);`,
    settle: 12,
  },
  temple: { query: 'at=temple-saturn&hour=10', setup: IN_PAGE_TEMPLE, settle: 16 },
  crossfade: { query: 'at=rostra&hour=10', setup: '', settle: 12, crossfade: true },
};

// Runs in the page: capture, then ship the PCM as base64 (the bus feeds decimated by 4).
const CAPTURE = `(s) => window.__skyrome.game.audio.capture(s).then((r) => {
  const b64 = (f) => { const u = new Uint8Array(f.buffer, f.byteOffset, f.byteLength); let t = ''; for (let i = 0; i < u.length; i += 32768) t += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(t); };
  const dec = (f) => { const o = new Float32Array(Math.floor(f.length / 4)); for (let i = 0; i < o.length; i++) o[i] = f[i * 4]; return o; };
  return { rate: r.rate, out: b64(r.out), buses: Object.fromEntries(Object.entries(r.buses).map(([k, v]) => [k, b64(dec(v))])) };
})`;

// ---- analysis
function integratedLufs(k, fs) {
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
  if (!abs.length) return { integrated: -Infinity, momentaryMax: -Infinity, shortTerm: [] };
  const rel = l(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((m) => l(m) > rel);
  const st = [];
  const sblk = Math.round(3 * fs);
  for (let s = 0; s + sblk <= k.length; s += Math.round(fs)) {
    let a = 0;
    for (let i = s; i < s + sblk; i++) a += k[i] * k[i];
    st.push(l(a / sblk));
  }
  return { integrated: l(gated.reduce((a, b) => a + b, 0) / gated.length), momentaryMax: Math.max(...ms.map(l)), shortTerm: st };
}
const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const rmsDb = (a) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return db(Math.sqrt(s / Math.max(1, a.length)));
};
const BANDS = [[45, 90], [90, 180], [180, 355], [355, 710], [710, 1400], [1400, 2800], [2800, 5600], [5600, 11200], [11200, 20000]];
function bandShares(a, fs) {
  const sp = spectrum(a, fs).power; // 2048-point frames
  const df = fs / 2048;
  const tot = sp.reduce((x, y) => x + y, 0) || 1;
  return BANDS.map(([lo, hi]) => {
    let e = 0;
    for (let i = 0; i < sp.length; i++) if (i * df >= lo && i * df < hi) e += sp[i];
    return (100 * e) / tot;
  });
}
function analyse(rec) {
  const { rate, out, buses } = rec;
  const k = kWeight(out, rate);
  const lu = integratedLufs(k, rate);
  const sp = spectrum(out, rate);
  const row = {
    lufsI: lu.integrated, lufsM: lu.momentaryMax, lra: lu.shortTerm.length > 4 ? pct(lu.shortTerm, 0.95) - pct(lu.shortTerm, 0.1) : 0,
    peak: db(peakOf(out)), truePeak: db(truePeak(out.subarray(0, Math.min(out.length, rate * 10)))),
    centroid: sp.cen, hf: sp.hf * 100, bands: bandShares(out, rate),
    buses: Object.fromEntries(Object.entries(buses).map(([n, a]) => [n, rmsDb(a)])),
  };
  return row;
}
function stepAnalysis(music, fs) {
  // 250 ms RMS envelope of the music bus; the biggest step between neighbours inside each switch
  // window (explore -> combat at 10 s, combat -> explore at 20 s, each 5 s long), and anywhere.
  const w = Math.round(0.25 * fs);
  const env = [];
  for (let s = 0; s + w <= music.length; s += w) env.push(rmsDb(music.subarray(s, s + w)));
  const worstIn = (a, b) => {
    let worst = 0;
    let at = 0;
    for (let i = Math.max(1, Math.floor(a * 4)); i < Math.min(env.length, Math.floor(b * 4)); i++) {
      if (env[i] < -70 && env[i - 1] < -70) continue;
      const d = Math.abs(env[i] - env[i - 1]);
      if (d > worst) { worst = d; at = i / 4; }
    }
    return { worst, at };
  };
  return { toCombat: worstIn(10, 15), toExplore: worstIn(20, 25), anywhere: worstIn(0, 1e9), env1s: env.filter((_, i) => i % 4 === 0).map((v) => +v.toFixed(1)) };
}

// ---- driver
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
  const sc = SCENARIOS[name];
  if (!sc) continue;
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  page.on('pageerror', (e) => console.log('PAGE ERROR', String(e).slice(0, 300)));
  await page.goto(`http://127.0.0.1:${port}/?${sc.query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 120000, polling: 100 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const game = window.__skyrome.game;
    game.audio.engine?.unlock?.();
    game.audio.unlock?.();
  });
  if (sc.setup) await page.evaluate(`(async () => { const game = window.__skyrome.game; ${sc.setup} })()`);
  await page.waitForTimeout(sc.settle * 1000);
  const info = await page.evaluate(() => {
    const g = window.__skyrome.game;
    return { stats: g.audio.stats(), pos: g.player.position.toArray().map((v) => +v.toFixed(1)) };
  });
  const done = page.evaluate(`(${CAPTURE})(${seconds})`);
  if (sc.crossfade) {
    // explore (0-10 s), combat (10-20 s), explore again (20 s on)
    await page.waitForTimeout(10000);
    await page.evaluate(() => window.__skyrome.game.audio.music.setOverride('combat', 'combat', 10));
    await page.waitForTimeout(10000);
    await page.evaluate(() => window.__skyrome.game.audio.music.setOverride('combat', null));
  }
  const r = await done;
  const un = (s) => {
    const b = Buffer.from(s, 'base64');
    return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  };
  // Bus feeds come every fourth sample (RMS and envelopes do not need more).
  const rec = { rate: r.rate, out: un(r.out), buses: Object.fromEntries(Object.entries(r.buses).map(([k, v]) => [k, un(v)])), busRate: r.rate / 4 };
  const row = analyse(rec);
  row.state = info.stats.music;
  row.reverb = info.stats.reverb;
  row.pos = info.pos;
  if (sc.crossfade) {
    const st = stepAnalysis(rec.buses.music, rec.busRate);
    row.crossfade = st;
  }
  results[name] = row;
  console.log(name, JSON.stringify({ ...row, bands: row.bands.map((b) => +b.toFixed(1)) }));
  await page.close();
}
await browser.close();
await server.close();

// ---- report
const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-inf');
let md = `| scenario | music state / reverb | LUFS-I | LUFS-M max | LRA | peak dBFS | true pk | centroid Hz | >5 kHz % |\n|---|---|---|---|---|---|---|---|---|\n`;
for (const [n, r] of Object.entries(results)) md += `| ${n} | ${r.state} / ${r.reverb} | ${f(r.lufsI)} | ${f(r.lufsM)} | ${f(r.lra)} | ${f(r.peak)} | ${f(r.truePeak)} | ${r.centroid.toFixed(0)} | ${f(r.hf)} |\n`;
md += `\nBus feeds (RMS dBFS, dry, before the master):\n\n| scenario | ${Object.keys(Object.values(results)[0]?.buses ?? {}).join(' | ')} |\n|---|${Object.keys(Object.values(results)[0]?.buses ?? {}).map(() => '---').join('|')}|\n`;
for (const [n, r] of Object.entries(results)) md += `| ${n} | ${Object.values(r.buses).map((v) => f(v)).join(' | ')} |\n`;
md += `\nOctave-band share of output energy (%):\n\n| scenario | ${BANDS.map(([a, b]) => `${a}-${b}`).join(' | ')} |\n|---|${BANDS.map(() => '---').join('|')}|\n`;
for (const [n, r] of Object.entries(results)) md += `| ${n} | ${r.bands.map((v) => f(v)).join(' | ')} |\n`;
for (const [n, r] of Object.entries(results)) if (r.crossfade) {
  const c = r.crossfade;
  md += `\nCrossfade (music bus, 250 ms RMS steps): explore to combat ${f(c.toCombat.worst)} dB (at ${f(c.toCombat.at)} s), combat to explore ${f(c.toExplore.worst)} dB (at ${f(c.toExplore.at)} s), largest anywhere ${f(c.anywhere.worst)} dB (at ${f(c.anywhere.at)} s). Level by second: ${c.env1s.join(' ')}\n`;
}
console.log('\n' + md);
if (opt('md')) writeFileSync(opt('md'), md);
if (opt('json')) writeFileSync(opt('json'), JSON.stringify(results, null, 1));
