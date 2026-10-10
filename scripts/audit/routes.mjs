#!/usr/bin/env node
/**
 * Route audit (phase 4 "solid ground", lens 4: routes). Walks every route the game can show with
 * the REAL player controller and records every place it runs into a wall, a building, a drop,
 * water, a fence or a gap, or needs a jump or a climb, and where the drawn route leaves walkable
 * space. The in-page half is scripts/audit/routes-page.js (read its header).
 *
 *   node scripts/audit/routes.mjs [--phases objectives,approach,tour,random,edges,sweep]
 *        [--approaches 1] [--random 24] [--edges 100] [--seed 1] [--time-scale 3]
 *        [--sweep-max 9999] [--sweep-tile 60] [--minutes 90] [--shots 14] [--only mq-02,lud-01]
 *        [--out scripts/audit/out] [--name routes] [--size 960x540]
 *
 * Phases (each a kind of job; all on by default):
 *   objectives  every objective of every quest (src/quests/content; each stage set in turn so the
 *               NPCs stand where that stage puts them), walked from where the player stands when it
 *               appears: the previous objective's place (the story's four chapters as one chain, the
 *               Porta Capena first), or the Forum for the first step of a side quest. Objectives in
 *               the Column's stair start at its door (the door is used on the way).
 *   approach    each objective's place again from N street nodes 100-160 m away on other sides (the
 *               final approach, where the route leaves the streets for the goal)
 *   tour        the story's districts in a ring: Porta Capena, the Circus valley, the Forum, the
 *               Velabrum, the Vicus Tuscus, the Subura, the Ludus Magnus, the Colosseum valley, the
 *               Forum of Trajan, the Campus Martius, Tiber Island, the river port and back
 *   random      N random routes of 180-450 m across the street graph (seeded)
 *   edges       N street-graph edges, one per 60 m tile (seeded), walked node to node as drawn
 *   sweep       every street-graph edge checked statically against the physics world, tile by tile
 *               (a second page with ?cityNear=75 so the city's lazy colliders cover each tile)
 *
 * Output: <out>/<name>.json (totals, ranked clusters, compact per-job results; under 2 MB),
 * <out>/<name>.txt (the printed report) and screenshots of the worst places in .shots/routes/.
 * Exit code is always 0 (it is a survey). About 60-80 minutes for everything at --time-scale 3.
 */
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] === undefined || all[i + 1].startsWith('--') ? true : all[i + 1]]] : a), []));
const phases = new Set(String(args.phases ?? 'objectives,approach,tour,random,edges,sweep').split(','));
const opt = {
  approaches: Number(args.approaches ?? 1),
  random: Number(args.random ?? 24),
  edges: Number(args.edges ?? 100),
  seed: Number(args.seed ?? 1),
  timeScale: Number(args['time-scale'] ?? 3),
  sweepMax: Number(args['sweep-max'] ?? 99999),
  sweepTile: Number(args['sweep-tile'] ?? 60),
  minutes: Number(args.minutes ?? 90),
  shots: Number(args.shots ?? 14),
  only: args.only ? String(args.only).split(',') : null,
};
const outDir = resolve(root, String(args.out ?? 'scripts/audit/out'));
const name = String(args.name ?? 'routes');
const shotDir = resolve(root, '.shots/routes');
mkdirSync(outDir, { recursive: true });
mkdirSync(shotDir, { recursive: true });
const [vw, vh] = String(args.size ?? '960x540').split('x').map(Number);
const pageScript = readFileSync(resolve(root, 'scripts/audit/routes-page.js'), 'utf8');
const T0 = Date.now();
const deadline = T0 + opt.minutes * 60000;
const lines = [];
const say = (s = '') => {
  lines.push(s);
  console.log(s);
};

let seed = opt.seed * 7919 + 13;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------- browser

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
const pageErrors = [];

async function boot(query) {
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e).slice(0, 300)));
  page.on('crash', () => say('  PAGE CRASHED'));
  await page.goto(`http://127.0.0.1:${port}/?scene=rome&quick=1&${query}`);
  await page.waitForFunction(() => window.__skyrome?.ready || window.__skyrome?.error, null, { timeout: 180000, polling: 250 });
  const err = await page.evaluate(() => window.__skyrome?.error ?? null);
  if (err) throw new Error(`boot error: ${err}`);
  await page.waitForTimeout(2500);
  await page.addScriptTag({ content: pageScript });
  await page.evaluate(async (ts) => {
    await window.__routeAudit.load();
    await window.__skyrome.game.console?.exec?.('tgm on');
    window.__skyrome.game.timeScale = ts;
  }, opt.timeScale);
  return page;
}
const WALK_QUERY = 'hour=11&crowd=0.05&fps=0';

// ---------------------------------------------------------------- jobs

const results = [];
let objectives = [];
let page = null;
let info = null;

async function runJob(job) {
  if (Date.now() > deadline) return null;
  const t = Date.now();
  let r;
  try {
    const guard = new Promise((_, rej) => setTimeout(() => rej(new Error('job wall-clock timeout')), 8 * 60000));
    r = await Promise.race([page.evaluate((j) => window.__routeAudit.walk(j), job), guard]);
  } catch (err) {
    r = { id: job.id, kind: job.kind, outcome: `error: ${String(err?.message ?? err).slice(0, 160)}`, events: [], line: [] };
    // A dead page: boot a new one and go on.
    try {
      await page.close();
    } catch {
      /* already gone */
    }
    page = await boot(WALK_QUERY);
  }
  r.kind = job.kind;
  r.label = job.label ?? job.id;
  r.quest = job.quest ?? null;
  r.goal = [Math.round(job.goal.x * 10) / 10, Math.round((job.goal.y ?? 0) * 10) / 10, Math.round(job.goal.z * 10) / 10];
  results.push(r);
  const bad = r.events.filter((e) => e.kind !== 'door').map((e) => `${e.kind}${e.why ? ':' + e.why : ''}`);
  const thru = r.line.filter((l) => l.kind === 'through' && l.len >= 1.5).length;
  say(`  ${job.kind.padEnd(10)} ${String(r.label).slice(0, 52).padEnd(52)} ${String(r.plan?.status ?? '-').padEnd(7)} ${String(Math.round(r.plan?.legs?.reduce((a, l) => a + l.length, 0) ?? 0)).padStart(5)} m  ${String(r.outcome).padEnd(9)} ${((Date.now() - t) / 1000).toFixed(0).padStart(3)} s  ${bad.length ? bad.join(' ') : ''}${thru ? ` line-through×${thru}` : ''}`);
  return r;
}

function objectiveJobs() {
  const jobs = [];
  const STORY = ['mq-01-madida-capena', 'mq-02-tabella', 'mq-03-lemuria', 'mq-04-columna'];
  const spawn = { x: 314.5, z: 583.9 };
  const forum = { x: 0, z: 6 };
  const byQuest = new Map();
  for (const o of objectives) {
    if (!o.pos) continue;
    if (opt.only && !opt.only.some((q) => o.quest.startsWith(q))) continue;
    (byQuest.get(o.quest) ?? byQuest.set(o.quest, []).get(o.quest)).push(o);
  }
  let storyPrev = { ...spawn, label: 'the new-game spawn (Porta Capena)' };
  let columnDoor = null;
  for (const [quest, list] of byQuest) {
    const story = STORY.includes(quest);
    let prev = story ? storyPrev : { ...forum, label: 'the Forum (Golden Milestone)' };
    for (const o of list) {
      if (o.cell === null && o.target?.kind === 'location' && o.target.id === 'column-door') columnDoor = o.pos;
      let start = prev;
      let setup = null;
      if (o.cell) {
        // Inside the Column: from its door, through the door, up the stair.
        if (!o.target || o.target.kind !== 'location') continue;
        start = columnDoor ? { ...columnDoor, label: 'the Column door' } : prev;
        setup = { quest: 'mq-04-columna', stage: 'climb', flags: { 'columna-open': true } };
      }
      const d = dist(start, o.pos);
      if (!o.cell && d < 12) {
        if (!o.optional) prev = { ...o.pos, label: `${o.quest}/${o.obj}` };
        continue;
      }
      if (jobs.some((j) => dist(j.start, start) < 6 && dist(j.goal, o.pos) < 6 && (j.goal.cell ?? null) === (o.cell ?? null))) {
        if (!o.optional) prev = { ...o.pos, label: `${o.quest}/${o.obj}` };
        continue;
      }
      const goal = { x: o.pos.x, y: o.pos.y, z: o.pos.z, cell: o.cell, target: o.target.kind === 'location' ? o.target : { kind: 'point', x: o.pos.x, y: o.pos.y, z: o.pos.z } };
      jobs.push({ id: `${o.quest}/${o.stage}/${o.obj}`, kind: 'objective', quest: o.quest, label: `${o.quest.replace(/^(mq|misc|job|lud)-/, '$1 ')}/${o.obj} ← ${start.label}`, start: { x: start.x, z: start.z, y: start.y }, goal, setup });
      if (!o.optional && !o.cell) prev = { ...o.pos, label: `${o.quest}/${o.obj}` };
    }
    if (story) storyPrev = prev;
  }
  return jobs;
}

function approachJobs(nodes, objJobs) {
  const goals = [];
  for (const j of objJobs) if (!j.goal.cell && !goals.some((g) => dist(g, j.goal) < 15)) goals.push(j);
  const main = nodes.filter((n) => n[4] === 0 && n[3] !== 'stairs').map((n) => ({ i: n[0], x: n[1], z: n[2] }));
  const jobs = [];
  for (const g of goals) {
    const ring = main.filter((n) => {
      const d = dist(n, g.goal);
      return d > 100 && d < 160;
    });
    if (!ring.length) continue;
    const picked = [];
    // The side the objective's own route came from is covered: start from other bearings.
    const from = Math.atan2(g.start.z - g.goal.z, g.start.x - g.goal.x);
    const used = [from];
    for (let k = 0; k < opt.approaches; k++) {
      let best = null;
      let bs = -1;
      for (const n of shuffle(ring.slice()).slice(0, 80)) {
        const a = Math.atan2(n.z - g.goal.z, n.x - g.goal.x);
        const sep = Math.min(...used.map((u) => Math.abs(Math.atan2(Math.sin(a - u), Math.cos(a - u)))));
        if (sep > bs) ((bs = sep), (best = n));
      }
      if (!best) break;
      used.push(Math.atan2(best.z - g.goal.z, best.x - g.goal.x));
      picked.push(best);
    }
    for (const n of picked) jobs.push({ id: `approach:${g.id}:${n.i}`, kind: 'approach', quest: g.quest, label: `→ ${g.id.split('/').slice(0, 1).join('')}/${g.id.split('/').pop()} from node ${n.i}`, start: { x: n.x, z: n.z }, goal: g.goal });
  }
  return jobs;
}

function tourJobs(landmarks, locs) {
  const find = (re) => landmarks.find((l) => re.test(l.id) || re.test(l.name)) ?? locs.find((l) => re.test(l.id) || re.test(l.name));
  const want = [
    ['Porta Capena', /^porta-capena$/],
    ['the Circus valley', /^circus-maximus$/],
    ['the Forum', /^rostra$/],
    ['the Velabrum', /compitum-velabri|velabr/i],
    ['the Vicus Tuscus', /taberna-collapsa|vicus.?tuscus/i],
    ['the Subura', /subura/i],
    ['the Ludus Magnus', /^ludus-magnus$/],
    ['the Colosseum valley', /^(colosseum|amphitheatrum-flavium)$|colosse/i],
    ['the Forum of Trajan', /^forum-trajan$/],
    ['the Campus Martius', /^pantheon$/],
    ['Tiber Island', /aesculap|insula-tiberina|island-daos/i],
    ['the river port', /portus-tiberinus|forum-boarium|emporium/i],
  ];
  const stops = [];
  for (const [label, re] of want) {
    const f = find(re);
    if (f) stops.push({ label: `${label} (${f.id})`, x: f.x, y: f.y, z: f.z });
    else say(`  tour: no place for ${label}`);
  }
  const jobs = [];
  for (let k = 0; k < stops.length; k++) {
    const a = stops[k];
    const b = stops[(k + 1) % stops.length];
    jobs.push({ id: `tour:${a.label}>${b.label}`, kind: 'tour', label: `${a.label.split(' (')[0]} → ${b.label.split(' (')[0]}`, start: { x: a.x, z: a.z }, goal: { x: b.x, y: b.y, z: b.z, target: { kind: 'point', x: b.x, y: b.y, z: b.z } } });
  }
  return jobs;
}

function randomJobs(nodes) {
  const main = nodes.filter((n) => n[4] === 0).map((n) => ({ i: n[0], x: n[1], z: n[2], kind: n[3] }));
  // Spread the starts over 150 m tiles.
  const tiles = new Map();
  for (const n of main) {
    const k = `${Math.floor(n.x / 150)},${Math.floor(n.z / 150)}`;
    (tiles.get(k) ?? tiles.set(k, []).get(k)).push(n);
  }
  const keys = shuffle([...tiles.keys()]);
  const jobs = [];
  for (const k of keys) {
    if (jobs.length >= opt.random) break;
    const a = tiles.get(k)[Math.floor(rnd() * tiles.get(k).length)];
    const cands = main.filter((n) => {
      const d = dist(a, n);
      return d > 180 && d < 450;
    });
    if (!cands.length) continue;
    const b = cands[Math.floor(rnd() * cands.length)];
    jobs.push({ id: `random:${a.i}>${b.i}`, kind: 'random', label: `node ${a.i} → node ${b.i} (${Math.round(dist(a, b))} m)`, start: { x: a.x, z: a.z }, goal: { x: b.x, y: undefined, z: b.z, target: { kind: 'point', x: b.x, y: 0, z: b.z } } });
  }
  return jobs;
}

function edgeJobs(nodes, edges) {
  const N = new Map(nodes.map((n) => [n[0], { i: n[0], x: n[1], z: n[2], kind: n[3], comp: n[4] }]));
  const tiles = new Map();
  edges.forEach((e, idx) => {
    const a = N.get(e[0]);
    const b = N.get(e[1]);
    if (!a || !b || a.comp !== 0) return;
    if (dist(a, b) < 6) return;
    const k = `${Math.floor((a.x + b.x) / 120)},${Math.floor((a.z + b.z) / 120)}`;
    (tiles.get(k) ?? tiles.set(k, []).get(k)).push([idx, a, b]);
  });
  const jobs = [];
  for (const k of shuffle([...tiles.keys()])) {
    if (jobs.length >= opt.edges) break;
    const l = tiles.get(k);
    const [idx, a0, b0] = l[Math.floor(rnd() * l.length)];
    const [a, b] = rnd() < 0.5 ? [a0, b0] : [b0, a0];
    jobs.push({ id: `edge:${idx}:${a.i}>${b.i}`, kind: 'edge', label: `edge ${idx} ${a.kind}→${b.kind} (${Math.round(dist(a, b))} m)`, start: { x: a.x, z: a.z }, goal: { x: b.x, z: b.z }, line: [{ x: a.x, z: a.z }, { x: b.x, z: b.z }], maxSec: 25 });
  }
  return jobs;
}

// ---------------------------------------------------------------- aggregation

const SEV = { blocker: 3, major: 2, minor: 1 };
const KIND_W = { objective: 3, approach: 2, tour: 2, random: 1, edge: 1 };

/** Incidents: what a player meets on the walk, and where the drawn line leaves walkable space. */
function incidents() {
  const out = [];
  for (const r of results) {
    for (const e of r.events ?? []) {
      let sev = null;
      let what = e.kind;
      if (e.kind === 'blocked') ((sev = e.why === 'npc' ? null : 'blocker'), (what = `blocked (${e.why})`));
      else if (e.kind === 'fell-through' || e.kind === 'timeout' || e.kind === 'door-unusable') sev = 'blocker';
      else if (e.kind === 'jump') ((sev = 'major'), (what = `needs a jump/mantle (${e.why})`));
      else if (e.kind === 'off-line') sev = 'major';
      else if (e.kind === 'drop') sev = e.height > 4 ? 'major' : 'minor';
      else if (e.kind === 'swim') sev = 'major';
      if (!sev) continue;
      out.push({ src: 'walk', sev, what, kind: e.kind, at: e.at, place: e.place, part: e.part, job: r.id, jobKind: r.kind, label: r.label, detail: e });
    }
    for (const c of r.climbs ?? []) {
      out.push({ src: 'walk', sev: c.height > 0.8 ? 'major' : 'minor', what: `climb (${c.kind} ${c.height.toFixed(2)} m)`, kind: 'climb', at: c.at, place: null, job: r.id, jobKind: r.kind, label: r.label, detail: c });
    }
    for (const l of r.line ?? []) {
      let sev = null;
      if (l.kind === 'through') sev = l.len >= 2 ? 'major' : l.len >= 1 ? 'minor' : null;
      else if (l.kind === 'wall') sev = 'major';
      else if (l.kind === 'ledge') sev = l.value > 0.8 ? 'major' : l.value > 0.45 ? 'minor' : null;
      else if (l.kind === 'low') sev = l.len >= 1 ? 'minor' : null;
      else if (l.kind === 'drop') sev = l.value < -2.5 ? 'major' : 'minor';
      else if (l.kind === 'water') sev = 'major';
      else if (l.kind === 'steep') sev = l.deg >= 45 ? 'major' : 'minor';
      if (!sev) continue;
      out.push({ src: 'line', sev, what: `route line: ${l.kind}${l.value !== undefined ? ` ${l.value}` : ''}`, kind: `line-${l.kind}`, at: l.at, place: l.place, part: l.part, job: r.id, jobKind: r.kind, label: r.label, detail: l });
    }
  }
  return out;
}

function cluster(list, R = 8) {
  const cl = [];
  for (const it of list) {
    let c = cl.find((c) => Math.hypot(c.x - it.at[0], c.z - it.at[2]) < R && c.src === it.src);
    if (!c) cl.push((c = { src: it.src, x: it.at[0], y: it.at[1], z: it.at[2], items: [], jobs: new Set(), sev: it.sev }));
    c.items.push(it);
    c.jobs.add(it.job);
    if (SEV[it.sev] > SEV[c.sev]) c.sev = it.sev;
  }
  for (const c of cl) {
    const kinds = {};
    for (const it of c.items) kinds[it.what] = (kinds[it.what] ?? 0) + 1;
    c.kinds = kinds;
    c.weight = SEV[c.sev] * 10 + [...c.jobs].reduce((a, j) => a + (KIND_W[results.find((r) => r.id === j)?.kind] ?? 1), 0);
    const ex = c.items.slice().sort((a, b) => SEV[b.sev] - SEV[a.sev])[0];
    c.example = ex;
    c.place = ex.place ?? c.items.find((i) => i.place)?.place ?? '';
    c.parts = [...new Set(c.items.map((i) => i.part).filter(Boolean))];
    c.questJobs = [...new Set(c.items.filter((i) => i.jobKind === 'objective').map((i) => i.job))];
  }
  return cl.sort((a, b) => b.weight - a.weight);
}

// ---------------------------------------------------------------- run

if (args.reshoot) {
  // Screenshots again from a finished run's JSON: --reshoot scripts/audit/out/routes.json [--shots 14] [--from 0]
  const prev = JSON.parse(readFileSync(resolve(root, String(args.reshoot)), 'utf8'));
  page = await boot(WALK_QUERY);
  const from = Number(args.from ?? 0);
  const list = prev.places.filter((c) => c.sev !== 'minor').slice(from, from + opt.shots);
  const spots = list.map((c) => {
    const job = prev.jobs.find((j) => j.id === c.example.job);
    return { x: c.at[0], y: c.at[1], z: c.at[2], kind: String(c.example.what).split(' ')[0].replace(/[^a-z-]/gi, ''), pts: job?.plan?.legs?.[0]?.pts ?? [], goal: job?.goal ? { x: job.goal[0], y: job.goal[1], z: job.goal[2] } : null };
  });
  await shoot(spots);
  await browser.close();
  await server.close();
  process.exit(0);
}
say(`Route audit, ${new Date().toISOString()}  phases: ${[...phases].join(',')}  time scale ${opt.timeScale}`);
const needWalkPage = ['objectives', 'approach', 'tour', 'random', 'edges'].some((p) => phases.has(p));
let sweep = null;
let landmarks = [];
let locs = [];
if (needWalkPage) {
  page = await boot(WALK_QUERY);
  info = await page.evaluate(() => window.__routeAudit.info());
  say(`street graph: ${info.nodes} nodes, ${info.edges} edges, ${info.componentCount} components (largest ${info.components.slice(0, 5).join(', ')}), ${info.termini} termini; nav grid ${info.grid ? 'on' : 'OFF'}`);
  const nodes = await page.evaluate(() => window.__routeAudit.nodes());
  const edges = await page.evaluate(() => window.__routeAudit.edges());
  landmarks = await page.evaluate(() => window.__routeAudit.landmarks());
  locs = await page.evaluate(() => (window.__skyrome.game.locations?.all() ?? []).map((l) => ({ id: l.id, name: l.name, x: l.position.x, y: l.position.y ?? 0, z: l.position.z })));
  let objJobs = [];
  if (phases.has('objectives') || phases.has('approach')) {
    objectives = await page.evaluate(() => window.__routeAudit.objectives());
    const unresolved = objectives.filter((o) => o.target && !o.pos);
    say(`objectives: ${objectives.length} with markers, ${unresolved.length} unresolved (${unresolved.map((o) => `${o.quest}/${o.obj}`).join(', ')})`);
    // A fresh game for the walks (the stages set above spawned fights and moved people).
    await page.close();
    page = await boot(WALK_QUERY);
    objJobs = objectiveJobs();
  }
  const plan = [];
  if (phases.has('objectives')) plan.push(['objectives', objJobs]);
  if (phases.has('approach')) plan.push(['approach', approachJobs(nodes, objJobs)]);
  if (phases.has('tour')) plan.push(['tour', tourJobs(landmarks, locs)]);
  if (phases.has('random')) plan.push(['random', randomJobs(nodes)]);
  if (phases.has('edges')) plan.push(['edges', edgeJobs(nodes, edges)]);
  for (const [ph, jobs] of plan) {
    say(`\n== ${ph}: ${jobs.length} jobs`);
    for (const j of jobs) {
      if (Date.now() > deadline) {
        say('  (time limit reached)');
        break;
      }
      await runJob(j);
    }
  }
}
if (phases.has('sweep') && Date.now() < deadline) {
  say(`\n== sweep: every street-graph edge, ${opt.sweepTile} m tiles (?cityNear=75)`);
  const sp = await boot('hour=11&crowd=0&cityNear=75');
  sweep = { tiles: 0, edges: 0, checked: 0, length: 0, issues: [], perKind: {}, edgeBad: 0 };
  let from = 0;
  for (;;) {
    if (Date.now() > deadline) {
      say('  (time limit reached)');
      break;
    }
    const part = await sp.evaluate((o) => window.__routeAudit.edgeSweep(o), { tile: opt.sweepTile, from, max: Math.min(60, opt.sweepMax - from) });
    sweep.tiles = part.tiles;
    sweep.edges = part.edges;
    sweep.checked += part.checked;
    sweep.length += part.length;
    sweep.edgeBad += part.edgeBad;
    for (const [k, v] of Object.entries(part.perKind)) sweep.perKind[k] = (sweep.perKind[k] ?? 0) + v;
    sweep.issues.push(...part.issues);
    from = part.next;
    say(`  tiles ${from}/${part.tiles}  edges ${sweep.checked}  flagged ${sweep.edgeBad}  ${JSON.stringify(sweep.perKind)}`);
    if (from >= part.tiles || from >= opt.sweepMax) break;
  }
  await sp.close();
}

// ---------------------------------------------------------------- report

const inc = incidents();
const clusters = cluster(inc);
const totals = { jobs: results.length, byKind: {}, outcomes: {}, planStatus: {}, walkedRoutes: 0, routeMetres: 0, simSeconds: 0, recoveries: 0, replans: 0, incidents: {}, minutes: Math.round((Date.now() - T0) / 6000) / 10 };
for (const r of results) {
  totals.byKind[r.kind] = (totals.byKind[r.kind] ?? 0) + 1;
  totals.outcomes[r.outcome] = (totals.outcomes[r.outcome] ?? 0) + 1;
  totals.planStatus[r.plan?.status ?? 'none'] = (totals.planStatus[r.plan?.status ?? 'none'] ?? 0) + 1;
  totals.routeMetres += r.plan?.legs?.reduce((a, l) => a + l.length, 0) ?? 0;
  totals.simSeconds += r.simSec ?? 0;
  totals.recoveries += r.recoveries ?? 0;
  totals.replans += r.replans ?? 0;
}
for (const i of inc) totals.incidents[i.what.split(' (')[0]] = (totals.incidents[i.what.split(' (')[0]] ?? 0) + 1;
totals.routeMetres = Math.round(totals.routeMetres);
totals.jobsWithBlock = results.filter((r) => (r.events ?? []).some((e) => e.kind === 'blocked' && e.why !== 'npc')).length;
totals.objectiveJobsWithBlock = results.filter((r) => r.kind === 'objective' && (r.events ?? []).some((e) => e.kind === 'blocked' && e.why !== 'npc')).length;
totals.places = clusters.length;
totals.placesBySeverity = clusters.reduce((a, c) => ((a[c.sev] = (a[c.sev] ?? 0) + 1), a), {});

say(`\n== totals\n${JSON.stringify(totals, null, 1)}`);
say(`\n== worst places (by severity and how many routes meet them)`);
clusters.slice(0, 60).forEach((c, k) => {
  const ex = c.example;
  say(`${String(k + 1).padStart(3)}. [${c.sev}] ${c.x.toFixed(1)},${c.y.toFixed(1)},${c.z.toFixed(1)}  ${c.place}  routes ${c.jobs.size}${c.questJobs.length ? ` (quest ${c.questJobs.length})` : ''}  ${Object.entries(c.kinds).map(([k, v]) => `${k}×${v}`).join(', ')}  part ${c.parts.join('/')}`);
  const d = ex.detail;
  say(`       e.g. ${ex.label}: ${d.why ?? ''} ${d.hit ? `hit ${d.hit.owner} @${d.hit.h} m ${d.hit.d} m` : ''} ${d.owner ? `owner ${d.owner}` : ''} ${d.rise !== undefined && d.rise !== null ? `rise ${d.rise}` : ''} ${d.near ? `near ${d.near}` : ''} ${d.len ? `len ${d.len}` : ''} ${d.cls ? `cls ${d.cls}` : ''}`);
});
let sweepSummary = null;
if (sweep) {
  const sc = cluster(
    sweep.issues
      .filter((i) => i.kind !== 'headroom' && !(i.kind === 'ledge' && i.value <= 0.45) && !(i.kind === 'through' && i.len < 1))
      .map((i) => ({ src: 'sweep', sev: i.kind === 'through' || i.kind === 'wall' || i.kind === 'water' || (i.kind === 'steep' && i.deg >= 50) ? 'major' : 'minor', what: i.kind, kind: i.kind, at: i.at, place: i.place, job: `edge:${i.edge}`, jobKind: 'sweep', label: `edge ${i.edge} (${i.kinds.join('→')}, ${i.edgeLen} m)`, detail: i })),
    10,
  );
  const byOwner = {};
  for (const i of sweep.issues) {
    const o = String(i.owner ?? '-').replace(/:.*$/, (m) => (/^:(-?\d+,-?\d+|blk|b\d)/.test(m) ? ':*' : m));
    const k = `${i.kind} ${o}`;
    byOwner[k] = (byOwner[k] ?? 0) + 1;
  }
  sweepSummary = { tiles: sweep.tiles, edges: sweep.edges, checked: sweep.checked, metres: Math.round(sweep.length), edgesFlagged: sweep.edgeBad, perKind: sweep.perKind, byOwner: Object.fromEntries(Object.entries(byOwner).sort((a, b) => b[1] - a[1]).slice(0, 40)), places: sc.length, top: sc.slice(0, 80).map((c) => ({ sev: c.sev, at: [c.x, c.y, c.z], place: c.place, kinds: c.kinds, edges: c.jobs.size, example: c.example.detail })) };
  say(`\n== sweep: ${sweep.checked} of ${sweep.edges} edges (${Math.round(sweep.length / 1000)} km), ${sweep.edgeBad} flagged; ${JSON.stringify(sweep.perKind)}`);
  say(`   by cause: ${Object.entries(sweepSummary.byOwner).slice(0, 20).map(([k, v]) => `${k}×${v}`).join(', ')}`);
  sc.slice(0, 30).forEach((c, k) => say(`${String(k + 1).padStart(3)}. [${c.sev}] ${c.x.toFixed(1)},${c.y.toFixed(1)},${c.z.toFixed(1)}  ${c.place}  edges ${c.jobs.size}  ${Object.entries(c.kinds).map(([k, v]) => `${k}×${v}`).join(', ')}  e.g. ${c.example.label} owner ${c.example.detail.owner ?? '-'} value ${c.example.detail.value ?? '-'} len ${c.example.detail.len ?? '-'}`));
}

// ---------------------------------------------------------------- screenshots of the worst places

/**
 * Two screenshots per place: the player's view 9 m back along the route (HUD on: the minimap's red
 * route, the gold trail on the ground) and a free camera above and behind. `spots`: {x,y,z,kind,pts,goal}.
 */
async function shoot(spots) {
  const out = [];
  for (let k = 0; k < spots.length; k++) {
    const c = spots[k];
    const pts = c.pts ?? [];
    let back = null;
    let bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - c.x, pts[i][1] - c.z);
      if (d < bd) ((bd = d), (back = i));
    }
    let from = { x: c.x - 9, z: c.z };
    if (back !== null) {
      for (let i = back; i >= 0; i--) {
        const d = Math.hypot(pts[i][0] - c.x, pts[i][1] - c.z);
        if (d >= 9) {
          from = { x: c.x + ((pts[i][0] - c.x) * 9) / d, z: c.z + ((pts[i][1] - c.z) * 9) / d };
          break;
        }
      }
    }
    const base = `${String(k + 1).padStart(2, '0')}-${c.kind}-${Math.round(c.x)}_${Math.round(c.z)}`;
    const files = [];
    for (const mode of ['view', 'over']) {
      const file = join(shotDir, `${base}-${mode}.png`);
      try {
        await page.evaluate((o) => window.__routeAudit.frame(o), { from, at: { x: c.x, y: c.y, z: c.z }, goal: c.goal, mode });
        await page.screenshot({ path: file });
        files.push(file.replace(root + '/', ''));
        say(`  shot ${file.replace(root + '/', '')}`);
      } catch (err) {
        say(`  shot failed: ${err?.message ?? err}`);
      }
    }
    await page.evaluate(() => window.__routeAudit.unframe()).catch(() => {});
    out.push(files);
  }
  return out;
}

const shots = [];
if (page && opt.shots > 0) {
  const top = clusters.filter((c) => c.sev !== 'minor').slice(0, opt.shots);
  const spots = top.map((c) => {
    const job = results.find((x) => x.id === c.example.job);
    return { x: c.x, y: c.y, z: c.z, kind: c.example.kind, pts: job?.plan?.legs?.[0]?.pts ?? [], goal: job?.goal ? { x: job.goal[0], y: job.goal[1], z: job.goal[2] } : null };
  });
  const files = await shoot(spots);
  top.forEach((c, k) => {
    c.shots = files[k] ?? [];
    c.shot = c.shots[0] ?? null;
    shots.push(...c.shots);
  });
}

// ---------------------------------------------------------------- write

const compact = results.map((r) => ({
  id: r.id,
  kind: r.kind,
  label: r.label,
  outcome: r.outcome,
  plan: r.plan ? { status: r.plan.status, ms: r.plan.ms, gridAtStart: r.plan.gridAtStart, gridAtGoal: r.plan.gridAtGoal, length: Math.round(r.plan.legs?.reduce((a, l) => a + l.length, 0) ?? 0), legs: r.plan.legs?.map((l) => ({ cell: l.cell, door: l.door, length: l.length, ...((r.events?.length || r.line?.some((x) => x.kind === 'through')) ? { pts: l.pts } : {}) })) } : null,
  start: r.start,
  startPlace: r.startPlace,
  goal: r.goal,
  goalPlace: r.goalPlace,
  simSec: r.simSec,
  realSec: r.realSec,
  recoveries: r.recoveries,
  replans: r.replans,
  endD: r.endD,
  events: r.events,
  line: (r.line ?? []).filter((l) => l.kind !== 'headroom' && !(l.kind === 'ledge' && l.value <= 0.45)),
  climbs: r.climbs,
}));
const json = {
  generated: new Date().toISOString(),
  tool: 'scripts/audit/routes.mjs',
  options: opt,
  graph: info,
  totals,
  places: clusters.map((c) => ({ sev: c.sev, at: [c.x, c.y, c.z], place: c.place, routes: c.jobs.size, questRoutes: c.questJobs, kinds: c.kinds, parts: c.parts, shot: c.shot ?? null, shots: c.shots ?? [], example: { job: c.example.job, label: c.example.label, what: c.example.what, detail: c.example.detail } })),
  sweep: sweepSummary,
  objectives: objectives.map((o) => ({ quest: o.quest, stage: o.stage, obj: o.obj, optional: o.optional, target: o.target, pos: o.pos, cell: o.cell })),
  jobs: compact,
  pageErrors: [...new Set(pageErrors)].slice(0, 30),
};
let text = JSON.stringify(json);
if (text.length > 1.9e6) {
  for (const j of json.jobs) if (j.plan) for (const l of j.plan.legs ?? []) delete l.pts;
  text = JSON.stringify(json);
}
writeFileSync(join(outDir, `${name}.json`), text);
say(`\nwrote ${join(outDir, `${name}.json`).replace(root + '/', '')} (${(text.length / 1e6).toFixed(2)} MB), ${shots.length} screenshots; ${totals.minutes} min`);
if (pageErrors.length) say(`page errors: ${[...new Set(pageErrors)].slice(0, 6).join(' | ')}`);
writeFileSync(join(outDir, `${name}.txt`), lines.join('\n') + '\n');
await browser.close();
await server.close();
process.exit(0);
