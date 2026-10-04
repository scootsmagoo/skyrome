#!/usr/bin/env node
/**
 * Controls check: drives the real game with REAL keyboard events (page.keyboard, so every DOM
 * listener runs: the UI's capture handler, menus, dialogue) and asserts what each control does.
 *
 *   node scripts/controls-check.mjs [--browser chromium|webkit|both] [--preset mouse|trackpad|keyboard|all] [--url http://…/] [--only name,name]
 *                                    [--extension /path/to/unpacked/extension]
 *
 * --extension loads a browser extension (e.g. an unpacked copy of Vimium, which takes d/f/r/x for its
 * own commands on every page) into Chromium and checks that the game still gets those keys.
 *
 * Exit code 1 if any check fails. Run it after touching input, the UI's key handling, the player
 * controller, the camera rig, combat input or the game flow.
 */
import { createServer as createNetServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]?.startsWith('--') ? true : arr[i + 1] ?? true]] : acc), []),
);
const browsers = args.browser === 'both' || !args.browser ? ['chromium', 'webkit'] : [args.browser];
const only = typeof args.only === 'string' ? new Set(args.only.split(',')) : null;
const presets = args.preset === 'all' ? ['mouse', 'trackpad', 'keyboard'] : typeof args.preset === 'string' ? [args.preset] : [null];

let server = null;
let base = typeof args.url === 'string' ? args.url : null;
if (!base) {
  const { createServer } = await import('vite');
  const port = await new Promise((res) => { const s = createNetServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  server = await createServer({ root, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } });
  await server.listen();
  base = `http://127.0.0.1:${port}/`;
}

const pw = await import('playwright');
let failures = 0;

for (const browserName of browsers) {
  console.log(`\n=== ${browserName} ===`);
  const browser = await pw[browserName].launch({ headless: true, args: browserName === 'chromium' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
  try {
    for (const preset of presets) {
      if (preset) console.log(`--- preset ${preset}`);
      failures += await runSuite(browser, browserName, preset);
    }
    failures += await runRepairCheck(browser);
  } finally {
    await browser.close();
  }
}
if (typeof args.extension === 'string') failures += await runExtensionCheck(args.extension);
if (server) await server.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll controls checks passed');
process.exit(failures ? 1 : 0);

// ------------------------------------------------------------------------------------------------

async function boot(page, query) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}?${query}`);
  await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 150000 });
  const err = await page.evaluate(() => window.__skyrome.error);
  if (err) throw new Error(`boot error: ${err}`);
  await page.waitForFunction(() => window.__skyrome.game.flow?.state === 'playing' && window.__skyrome.game.player, null, { timeout: 150000 });
  return errors;
}

async function runSuite(browser, browserName, preset) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  if (preset) {
    // A chosen preset, as if picked in the first-launch picker (settings fixups then write its rows).
    await ctx.addInitScript((p) => {
      const key = 'skyrome.settings.v1';
      let s = {};
      try { s = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
      if (s.controlPreset !== p) {
        s.controlPreset = p;
        s.presetPicked = true;
        delete s.presetApplied;
        localStorage.setItem(key, JSON.stringify(s));
      }
    }, preset);
  }
  const page = await ctx.newPage();
  const errors = await boot(page, 'scene=rome&at=circus-maximus&hour=10');
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const k = page.keyboard;
  let fails = 0;
  const results = [];
  const check = async (name, fn) => {
    if (only && !only.has(name)) return;
    try {
      await settle();
      const detail = await fn();
      results.push(['PASS', name, detail ?? '']);
    } catch (e) {
      fails++;
      results.push(['FAIL', name, e.message]);
    }
    const [r, n, d] = results[results.length - 1];
    console.log(`${r}  ${n.padEnd(34)} ${String(d).slice(0, 150)}`);
  };
  const expect = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };

  // Close whatever is open, release everything, stand at the open spot facing north.
  async function settle() {
    for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'KeyF', 'KeyQ', 'KeyX', 'KeyO']) await k.up(key);
    await ev(() => {
      const g = window.__skyrome.game;
      try { g.dialogue?.end?.(); } catch {}
      for (let i = 0; i < 6 && g.ui?.top; i++) { try { g.ui.top.close ? g.ui.top.close() : g.ui.back(); } catch { break; } }
      const s = window.__ctl;
      const p = g.player;
      p.teleport({ x: s.x, y: s.y, z: s.z }, Math.PI);
      p.yaw = 0;
      p.pitch = -0.15;
      p.walkMode = false;
      p.sneaking = false;
      if (p.viewMode !== 'third') p.setViewMode('third');
    });
    await wait(350);
  }
  const pos = () => ev(() => { const p = window.__skyrome.game.player; return { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw, pitch: p.pitch }; });
  /** Camera-relative displacement between two samples (yaw from the first). */
  const rel = (a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z;
    return { fwd: dx * -Math.sin(a.yaw) + dz * -Math.cos(a.yaw), right: dx * Math.cos(a.yaw) + dz * -Math.sin(a.yaw) };
  };
  async function hold(keys, ms) {
    for (const key of keys) await k.down(key);
    await wait(ms);
    for (const key of [...keys].reverse()) await k.up(key);
  }
  const top = () => ev(() => window.__skyrome.game.ui?.top?.id ?? null);
  const speedOver = async (ms) => {
    const a = await pos();
    await wait(ms);
    const b = await pos();
    return Math.hypot(b.x - a.x, b.z - a.z) / (ms / 1000);
  };

  // An open, flat spot near the spawn (the game's own finder: primes the city's lazy colliders and
  // rejects anywhere the body would overlap geometry), clear for 14 m all round, away from people.
  const spot = await ev(async () => {
    const g = window.__skyrome.game;
    const { findSafeGround } = await import('/src/world/safeGround.ts');
    const p = findSafeGround(g, g.player.position, { maxRadius: 160, open: 14, openDirs: 8 });
    return p ? { x: p.x, y: p.y, z: p.z } : null;
  });
  if (!spot) throw new Error('no open spot found near the Circus Maximus');
  await ev((s) => { window.__ctl = s; }, spot);
  await ev(() => {
    window.__notes = [];
    window.__skyrome.game.events.on('ui:notify', (e) => window.__notes.push(e.text));
  });
  console.log(`open spot ${spot.x.toFixed(1)}, ${spot.z.toFixed(1)}; preset ${await ev(() => window.__skyrome.game.settings.data.controlPreset)}`);

  // ---------------------------------------------------------------- movement
  for (const [key, dir] of [['KeyW', 'fwd'], ['KeyS', 'back'], ['KeyA', 'left'], ['KeyD', 'right']]) {
    await check(`move ${key.slice(3)} (${dir})`, async () => {
      const a = await pos();
      await hold([key], 1000);
      await wait(250);
      const r = rel(a, await pos());
      const along = dir === 'fwd' ? r.fwd : dir === 'back' ? -r.fwd : dir === 'right' ? r.right : -r.right;
      const across = dir === 'fwd' || dir === 'back' ? Math.abs(r.right) : Math.abs(r.fwd);
      expect(along > 2.5, `moved only ${along.toFixed(2)} m ${dir} (fwd ${r.fwd.toFixed(2)}, right ${r.right.toFixed(2)})`);
      expect(across < along * 0.4, `drifted ${across.toFixed(2)} m sideways`);
      return `${along.toFixed(2)} m`;
    });
  }
  await check('move W+D diagonal', async () => {
    const a = await pos();
    await hold(['KeyW', 'KeyD'], 1000);
    const r = rel(a, await pos());
    expect(r.fwd > 1.5 && r.right > 1.5, `fwd ${r.fwd.toFixed(2)}, right ${r.right.toFixed(2)}`);
    return `fwd ${r.fwd.toFixed(1)} right ${r.right.toFixed(1)}`;
  });
  await check('arrow keys do not move', async () => {
    const a = await pos();
    await hold(['ArrowLeft'], 400);
    const b = await pos();
    expect(Math.hypot(b.x - a.x, b.z - a.z) < 0.2, 'arrow key moved the player');
    expect(b.yaw - a.yaw > 0.3, `ArrowLeft turned only ${(b.yaw - a.yaw).toFixed(2)} rad`);
    return `turned ${(b.yaw - a.yaw).toFixed(2)} rad`;
  });
  await check('look right / up / down', async () => {
    let a = await pos();
    await hold(['ArrowRight'], 400);
    let b = await pos();
    expect(b.yaw - a.yaw < -0.3, `ArrowRight yaw ${(b.yaw - a.yaw).toFixed(2)}`);
    a = b;
    await hold(['ArrowUp'], 300);
    b = await pos();
    expect(b.pitch - a.pitch > 0.1, `ArrowUp pitch ${(b.pitch - a.pitch).toFixed(2)}`);
    a = b;
    await hold(['ArrowDown'], 300);
    b = await pos();
    expect(b.pitch - a.pitch < -0.1, `ArrowDown pitch ${(b.pitch - a.pitch).toFixed(2)}`);
  });
  await check('jump (Space)', async () => {
    const a = await pos();
    await k.press('Space');
    let peak = a.y;
    for (let i = 0; i < 8; i++) { await wait(60); peak = Math.max(peak, (await pos()).y); }
    expect(peak - a.y > 0.4, `rose only ${(peak - a.y).toFixed(2)} m`);
    return `+${(peak - a.y).toFixed(2)} m`;
  });
  await check('sprint (Shift, preset mode)', async () => {
    const toggle = await ev(() => window.__skyrome.game.settings.data.sprintToggle !== false && window.__skyrome.game.settings.data.controlPreset !== 'mouse');
    await k.down('KeyW');
    await wait(200);
    if (toggle) await k.press('ShiftLeft');
    else await k.down('ShiftLeft');
    await wait(500);
    const v = await speedOver(600);
    await k.up('ShiftLeft');
    await k.up('KeyW');
    expect(v > 5.5, `speed ${v.toFixed(2)} m/s (${toggle ? 'toggle' : 'hold'})`);
    return `${v.toFixed(1)} m/s (${toggle ? 'toggle' : 'hold'})`;
  });
  await check('walk toggle (N)', async () => {
    await k.press('KeyN');
    await k.down('KeyW');
    await wait(400);
    const v = await speedOver(600);
    await k.up('KeyW');
    await k.press('KeyN');
    await wait(120); // presses are handled on the next frame
    expect(v > 0.8 && v < 2.8, `walk speed ${v.toFixed(2)} m/s`);
    expect(!(await ev(() => window.__skyrome.game.player.walkMode)), 'N did not toggle walking off');
    return `${v.toFixed(1)} m/s`;
  });
  await check('sneak (C)', async () => {
    await k.press('KeyC');
    await wait(120);
    const on = await ev(() => window.__skyrome.game.player.sneaking);
    const hold = await ev(() => !!window.__skyrome.game.settings.data.sneakHold);
    if (hold) return 'sneakHold set: skipped';
    await k.press('KeyC');
    await wait(120);
    const off = await ev(() => window.__skyrome.game.player.sneaking);
    expect(on && !off, `sneaking after C: ${on}, after second C: ${off}`);
  });

  // ---------------------------------------------------------------- camera
  await check('view toggle (V)', async () => {
    await k.press('KeyV');
    await wait(100);
    const first = await ev(() => window.__skyrome.game.player.viewMode);
    await k.press('KeyV');
    await wait(100);
    const back = await ev(() => window.__skyrome.game.player.viewMode);
    expect(first === 'first' && back === 'third', `V: ${first}, V again: ${back}`);
  });
  await check('view toggle while moving', async () => {
    await k.down('KeyW');
    await wait(300);
    await k.press('KeyV');
    await wait(300);
    const mode = await ev(() => window.__skyrome.game.player.viewMode);
    const v = await speedOver(400);
    await k.up('KeyW');
    await k.press('KeyV');
    expect(mode === 'first' && v > 2, `mode ${mode}, speed ${v.toFixed(2)}`);
  });
  await check('shoulder swap (H)', async () => {
    const side = () => ev(() => window.__skyrome.game.getSystem('cameraRig')?.shoulderSide);
    const a = await side();
    await k.press('KeyH');
    await wait(120);
    const b = await side();
    await k.press('KeyH');
    await wait(120);
    const c = await side();
    expect(a === 1 && b === -1 && c === 1, `sides ${a} → ${b} → ${c}`);
  });
  await check('zoom (- and =)', async () => {
    const z = () => ev(() => window.__skyrome.game.player.zoom);
    const a = await z();
    await k.press('Minus');
    await wait(300);
    const b = await z();
    await k.press('Equal');
    await wait(300);
    const c = await z();
    expect(b > a && c < b, `zoom ${a} → ${b} → ${c}`);
  });

  // ---------------------------------------------------------------- climbing
  // Test ledges built on the open spot: a 0.7 m platform (clamber by pushing), a 1.3 m platform
  // (Space mantles), a 2.4 m wall (too high: Space just jumps). Removed afterwards.
  const ledge = async (h) => {
    await ev((hh) => {
      const g = window.__skyrome.game;
      const s = window.__ctl;
      window.__ledges?.forEach((c) => g.physics.removeCollider(c));
      // A 4 m wide, 3 m deep block whose near face is 2 m north of the spot.
      window.__ledges = [g.physics.addBox({ x: s.x, y: s.y + hh / 2 - 0.05, z: s.z - 2 - 1.5 }, { x: 2, y: hh / 2, z: 1.5 })];
      g.physics.step(1e-4);
    }, h);
    await wait(100);
  };
  const dropLedges = () => ev(() => { const g = window.__skyrome.game; window.__ledges?.forEach((c) => g.physics.removeCollider(c)); window.__ledges = []; g.physics.step(1e-4); });
  await check('clamber a 0.7 m ledge (push W)', async () => {
    await ledge(0.7);
    const a = await pos();
    await hold(['KeyW'], 1500);
    await wait(300);
    const b = await pos();
    await dropLedges();
    expect(b.y - a.y > 0.6, `rose ${(b.y - a.y).toFixed(2)} m`);
    return `+${(b.y - a.y).toFixed(2)} m`;
  });
  await check('mantle a 1.3 m ledge (Space)', async () => {
    await ledge(1.3);
    await k.down('KeyW');
    await wait(500);
    await k.press('Space');
    await wait(900);
    await k.up('KeyW');
    await wait(200);
    const b = await pos();
    const a = { y: (await ev(() => window.__ctl.y)) };
    await dropLedges();
    expect(b.y - a.y > 1.2, `rose ${(b.y - a.y).toFixed(2)} m`);
    return `+${(b.y - a.y).toFixed(2)} m`;
  });
  await check('no climbing a 2.4 m wall', async () => {
    await ledge(2.4);
    await k.down('KeyW');
    await wait(500);
    await k.press('Space');
    await wait(1100);
    await k.up('KeyW');
    await wait(300);
    const b = await pos();
    const a = { y: (await ev(() => window.__ctl.y)) };
    await dropLedges();
    expect(b.y - a.y < 0.3, `ended ${(b.y - a.y).toFixed(2)} m up`);
  });

  // ---------------------------------------------------------------- talking
  await check('talk (E) · leave (Tab)', async () => {
    // Crowd walkers move on; try up to three people, nearest first, and re-aim each time.
    let placed = null;
    let focus = null;
    for (let attempt = 0; attempt < 3 && !focus; attempt++) {
      placed = await ev((skip) => {
        const g = window.__skyrome.game;
        const p = g.player.position;
        const list = [...(g.interactions?.items ?? [])].filter((i) => /talk/i.test(i.verb?.() ?? '') && (!i.enabled || i.enabled()));
        list.sort((a, b) => a.position().distanceTo(p) - b.position().distanceTo(p));
        const it = list[skip];
        if (!it) return null;
        const q = it.position();
        const gy = g.physics.groundHeight(q.x, q.z + 1.6, q.y + 10, 30);
        if (gy === null) return null;
        g.player.teleport({ x: q.x, y: gy + 0.05, z: q.z + 1.6 }, Math.PI);
        g.player.yaw = 0;
        g.player.pitch = -0.2;
        return it.label?.() ?? it.id;
      }, attempt);
      if (!placed) break;
      await wait(300);
      focus = await ev(() => window.__skyrome.game.interactions?.focus?.label?.() ?? null);
    }
    if (!placed && !focus) return 'no one to talk to nearby: skipped';
    expect(!!focus, `no interaction focus near ${placed} (3 tries)`);
    await k.press('KeyE');
    await wait(500);
    const t1 = await top();
    expect(t1 === 'dialogue', `E opened ${t1}`);
    const moving = await ev(() => window.__skyrome.game.input.enabled);
    expect(!moving, 'gameplay input still enabled in dialogue');
    await k.press('Escape');
    await wait(300);
    const t2 = await top();
    expect(t2 === 'pause', `Esc in dialogue opened ${t2} (expected pause)`);
    await k.press('Escape');
    await wait(300);
    const t3 = await top();
    expect(t3 === 'dialogue', `Esc in pause returned to ${t3}`);
    await k.press('Tab');
    await wait(400);
    const t4 = await top();
    expect(t4 === null, `Tab left to ${t4}`);
    expect(await ev(() => window.__skyrome.game.input.enabled), 'input still disabled after leaving');
    return placed;
  });

  // ---------------------------------------------------------------- menus
  for (const [key, label] of [['Tab', 'menu'], ['KeyI', 'inventory'], ['KeyJ', 'journal'], ['KeyM', 'map'], ['KeyK', 'skills'], ['KeyT', 'wait'], ['Escape', 'pause']]) {
    await check(`open/close ${label} (${key})`, async () => {
      await k.press(key);
      await wait(400);
      const t = await top();
      expect(t !== null, `${key} opened nothing`);
      expect(!(await ev(() => window.__skyrome.game.input.enabled)), 'gameplay input enabled under a menu');
      const a = await pos();
      await hold(['KeyW'], 400);
      const b = await pos();
      expect(Math.hypot(b.x - a.x, b.z - a.z) < 0.1, 'W moved the player under a menu');
      await k.press('Escape');
      await wait(400);
      const after = await top();
      expect(after === null, `Esc left ${after} open`);
      return t;
    });
  }
  await check('no stuck key through a menu', async () => {
    await k.down('KeyW');
    await wait(300);
    await k.press('KeyI');
    await wait(300);
    await k.up('KeyW');
    await wait(200);
    await k.press('Escape');
    await wait(500);
    const v = await speedOver(500);
    expect(v < 0.3, `still moving at ${v.toFixed(2)} m/s after the menu closed`);
  });
  await check('no stuck key after window blur', async () => {
    await k.down('KeyD');
    await wait(300);
    await ev(() => window.dispatchEvent(new Event('blur')));
    await wait(300);
    const v = await speedOver(400);
    await k.up('KeyD');
    expect(v < 0.3, `still moving at ${v.toFixed(2)} m/s after blur`);
  });
  await check('clock (hold O)', async () => {
    await k.down('KeyO');
    await wait(150);
    const vis = await ev(() => !!window.__skyrome.game.ui?.hud?.clockVisible);
    await k.up('KeyO');
    await wait(100);
    const after = await ev(() => !!window.__skyrome.game.ui?.hud?.clockVisible);
    expect(vis && !after, `while held ${vis}, after ${after}`);
  });

  // ---------------------------------------------------------------- items, saves
  await check('hotbar (1) uses a consumable', async () => {
    const id = await ev(async () => {
      const inv = window.__skyrome.game.player.inventory;
      const mod = await import('/src/rpg/data/items/index.ts');
      const defs = Object.values(mod).flatMap((v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [])).filter((d) => d && typeof d === 'object' && 'type' in d && 'id' in d);
      const d = defs.find((x) => x.type === 'consumable' && x.tags?.includes('bandage')) ?? defs.find((x) => x.type === 'consumable' && x.effects?.length);
      if (!d) return null;
      inv.add(d.id, 2, { silent: true });
      return d.id;
    });
    if (!id) return 'no consumable in the item database: skipped';
    const total = () => ev(() => window.__skyrome.game.player.inventory.list((d) => d.type === 'consumable').reduce((n, x) => n + x.stack.count, 0));
    const before = await total();
    await k.press('Digit1');
    await wait(300);
    const after = await total();
    expect(after === before - 1, `consumables ${before} → ${after}`);
    return `${before} → ${after}`;
  });
  await check('invoke (Z) answers', async () => {
    const n = await ev(() => window.__notes.length);
    await k.press('KeyZ');
    await wait(400);
    const notes = await ev((i) => window.__notes.slice(i), n);
    expect(notes.length > 0, 'Z did nothing visible');
    return notes[0];
  });
  await check('quicksave (P) · quickload asks (L)', async () => {
    const n = await ev(() => window.__notes.length);
    await k.press('KeyP');
    await wait(1200);
    const notes = await ev((i) => window.__notes.slice(i), n);
    const saved = await ev(async () => (await window.__skyrome.game.save.list()).some((m) => m.slot === 'quick' || m.id === 'quick' || m.kind === 'quick'));
    expect(saved, 'no quicksave slot after P');
    await k.press('KeyL');
    await wait(400);
    const t = await top();
    await k.press('Escape');
    await wait(300);
    expect(t === 'confirm', `L opened ${t}`);
    return notes.join(' | ') || '(no notification text captured)';
  });

  // Combat last: a fight keeps the player 'in combat' for 8 s (GDD §6), which rightly blocks
  // waiting and talking, so it must not run before those checks.
  // ---------------------------------------------------------------- combat
  const pc = (expr) => ev((e) => { const c = window.__skyrome.game.combat?.playerC; return c ? new Function('c', `return ${e}`)(c) : undefined; }, expr);
  await check('ready weapon (R)', async () => {
    expect(await ev(() => !!window.__skyrome.game.combat?.playerC), 'no combat module / player combatant');
    if (await pc('c.drawn')) { await k.press('KeyR'); await wait(900); }
    await k.press('KeyR');
    await wait(900);
    const drawn = await pc('c.drawn');
    expect(drawn === true, `drawn ${drawn}`);
  });
  await check('light attack (F)', async () => {
    if (!(await pc('c.drawn'))) { await k.press('KeyR'); await wait(900); }
    await k.press('KeyF');
    await wait(80);
    const kind = await pc('c.action && c.action.kind');
    expect(kind && kind !== 'draw' && kind !== 'sheathe', `action after F: ${kind}`);
    await wait(900);
    return String(kind);
  });
  await check('power attack (hold F)', async () => {
    if (!(await pc('c.drawn'))) { await k.press('KeyR'); await wait(900); }
    await k.down('KeyF');
    await wait(650);
    const kind = await pc('c.action && c.action.kind');
    await k.up('KeyF');
    await wait(100);
    const after = await pc('c.action && c.action.kind');
    await wait(1200);
    expect(kind === 'charge' || kind === 'power' || after === 'power', `held: ${kind}, released: ${after}`);
    return `${kind} → ${after}`;
  });
  await check('block (Q)', async () => {
    if (!(await pc('c.drawn'))) { await k.press('KeyR'); await wait(900); }
    const toggle = await ev(() => !!window.__skyrome.game.settings.data.blockToggle);
    const guard = () => pc('c.guardWanted');
    if (toggle) {
      // GDD §4.2 toggle mode: a press of 0.18 s or more toggles; a shorter tap is a parry attempt
      // that restores the guard state from before it.
      await hold(['KeyQ'], 300);
      await wait(120);
      const raised = await guard();
      await k.press('KeyQ');
      await wait(120);
      const afterTap = await guard();
      await hold(['KeyQ'], 300);
      await wait(120);
      const lowered = await guard();
      expect(raised && afterTap && !lowered, `long press: ${raised}, tap kept: ${afterTap}, long press again: ${lowered}`);
      return 'toggle';
    }
    await k.down('KeyQ');
    await wait(350);
    const held = await guard();
    await k.up('KeyQ');
    await wait(150);
    const after = await guard();
    expect(held && !after, `hold: raised ${held}, after release ${after}`);
    return 'hold';
  });
  await check('dodge (Option)', async () => {
    if (!(await pc('c.drawn'))) { await k.press('KeyR'); await wait(900); }
    await k.down('KeyA');
    await k.press('AltLeft');
    await wait(60);
    const kind = await pc('c.action && c.action.kind');
    await k.up('KeyA');
    await wait(700);
    expect(kind === 'dodge', `action after Option: ${kind}`);
  });
  await check('lock on (X) with a foe ahead', async () => {
    const ok = await ev(() => {
      const g = window.__skyrome.game;
      const p = g.player.position;
      try {
        window.__foe = g.combat.spawnEnemy('grassator', { x: p.x, y: p.y, z: p.z - 5 }, {});
        return true;
      } catch (e) { return String(e); }
    });
    expect(ok === true, `spawnEnemy failed: ${ok}`);
    if (!(await pc('c.drawn'))) { await k.press('KeyR'); await wait(900); }
    await wait(200);
    await k.press('KeyX');
    await wait(150);
    const locked = await pc('c.lockTarget && c.lockTarget.id');
    await ev(() => { const g = window.__skyrome.game; try { g.combat.despawn(window.__foe); } catch {} });
    expect(!!locked, 'no lock target after X');
    return locked;
  });
  await check('sheathe (R)', async () => {
    if (!(await pc('c.drawn'))) { await k.press('KeyR'); await wait(900); }
    await k.press('KeyR');
    await wait(900);
    expect((await pc('c.drawn')) === false, 'still drawn');
  });

  if (errors.length) {
    fails++;
    console.log(`FAIL  page errors: ${errors.slice(0, 3).join(' | ')}`);
  }
  await ctx.close();
  return fails;
}

/** Saved settings that left "Strafe right" with no key are repaired at boot. */
async function runRepairCheck(browser) {
  if (only && !only.has('repair saved bindings')) return 0;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('ctl-seeded')) return;
    sessionStorage.setItem('ctl-seeded', '1');
    const key = 'skyrome.settings.v1';
    let s = {};
    try { s = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
    s.bindings = { ...(s.bindings || {}), right: [], shoulderSwap: ['KeyD'] };
    localStorage.setItem(key, JSON.stringify(s));
  });
  const page = await ctx.newPage();
  let fails = 0;
  try {
    await boot(page, 'scene=rome&at=circus-maximus&hour=10');
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const g = window.__skyrome.game;
      const saved = JSON.parse(localStorage.getItem('skyrome.settings.v1') || '{}').bindings || {};
      return { right: g.input.bindings.right, shoulder: g.input.bindings.shoulderSwap, savedRight: saved.right };
    });
    const ok = r.right.includes('KeyD') && !r.shoulder.includes('KeyD') && (r.savedRight ?? []).includes('KeyD');
    console.log(`${ok ? 'PASS' : 'FAIL'}  repair saved bindings              ${JSON.stringify(r)}`);
    if (!ok) fails++;
  } catch (e) {
    console.log(`FAIL  repair saved bindings              ${e.message}`);
    fails++;
  }
  await ctx.close();
  return fails;
}

/** With a keyboard extension loaded (Vimium & co.), the game still receives its keys. */
async function runExtensionCheck(ext) {
  console.log(`\n=== chromium + extension ${ext} ===`);
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(`${tmpdir()}/skyrome-ext-`);
  const ctx = await pw.chromium.launchPersistentContext(dir, {
    headless: true,
    channel: 'chromium',
    viewport: { width: 1280, height: 720 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  let fails = 0;
  try {
    await new Promise((r) => setTimeout(r, 1500));
    // Listen before the game does: its UI consumes menu keys (J, Tab…) and stops them propagating.
    await ctx.addInitScript(() => {
      window.__seen = [];
      window.addEventListener('keydown', (e) => window.__seen.push(e.code), true);
    });
    const page = await ctx.newPage();
    let reloads = -1;
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) reloads++; });
    await boot(page, 'scene=rome&at=circus-maximus&hour=10');
    await page.mouse.click(900, 500);
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.__seen.length = 0; });
    for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyR', 'KeyX', 'KeyV', 'KeyJ']) {
      await page.keyboard.down(k);
      await page.waitForTimeout(100);
      await page.keyboard.up(k);
      await page.waitForTimeout(150);
      if (k === 'KeyJ') { await page.keyboard.press('Tab'); await page.waitForTimeout(200); }
    }
    const seen = await page.evaluate(() => window.__seen);
    const missing = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyR', 'KeyX', 'KeyV', 'KeyJ'].filter((k) => !seen.includes(k));
    const ok = missing.length === 0 && reloads <= 0;
    console.log(`${ok ? 'PASS' : 'FAIL'}  keys reach the game past the extension  ${missing.length ? 'missing ' + missing.join(',') : 'all arrived'}${reloads > 0 ? ' · page reloaded' : ''}`);
    if (!ok) fails++;
  } catch (e) {
    console.log(`FAIL  extension check  ${e.message}`);
    fails++;
  }
  await ctx.close();
  return fails;
}
