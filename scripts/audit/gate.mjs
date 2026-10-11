#!/usr/bin/env node
/**
 * The regression gate of phase 4b ("solid ground", docs/design/solid-ground.md sections 4 and 5).
 *
 *   node scripts/audit/gate.mjs --tier fast|full [--lens grades,collision,...] [--out dir]
 *        [--record] [--reduce-only [--from dir]] [--max-wait 45] [--list]
 *
 * It runs the audit tools of the tier, reduces each one's output to the metrics in
 * scripts/audit/gates.json (metric, today, gate, direction, target and owner crew), prints a
 * today / now / gate table and exits 1 if any metric misses its gate (or a tool failed to deliver).
 *
 *   fast  (npm run audit:fast)  types + units, grades (offline), street-fit, the story's routes, the
 *                               places probe, collision and structures on the story's places. About 15 minutes
 *                               on a quiet machine (browser audits run two at a time).
 *   full  (npm run audit:full)  the whole city: structures, collision, surface (+7 walks), routes (all walk
 *                               phases, and the sweep in its own process), grades-live, crawl. About 3 hours.
 *
 * Rules (section 5): the numbers in gates.json only go down; a commit that raises one says why; only the lead
 * refreshes baselines (--record). Every gate is "not worse than today"; `target` is what a fix crew must reach
 * (it is that crew's target, not this base's gate). Allowlist entries (scripts/audit/allowlist.json) need the
 * lead's approval and a screenshot.
 *
 * The load guard (scripts/audit/lock.mjs): no browser audit starts while the 1-minute load average is over 16,
 * and at most 2 browser audits run at once on the machine (lock files in the OS temp directory). Waiting is bounded
 * (--max-wait, minutes, default 45); on a timeout the gate says so and exits 2 having run nothing more.
 *
 * --reduce-only reads the outputs already in --from (default scripts/audit/out: the phase 4a runs) and
 * prints the table without running anything; metrics the old outputs cannot give show "n/a".
 * --record writes today (and gate) of every measured metric of the tier into gates.json (never loosens a gate that is
 * already tighter than the new number: it then keeps the old gate and says so).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadavg } from 'node:os';
import { acquireSlot, MAX_LOAD } from './lock.mjs';
import { STORY } from './story.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const tier = String(args.tier ?? 'fast');
if (!['fast', 'full'].includes(tier)) die('--tier must be fast or full');
const gatesPath = join(root, 'scripts/audit/gates.json');
const gates = JSON.parse(readFileSync(gatesPath, 'utf8'));
const lensFilter = args.lens ? new Set(String(args.lens).split(',')) : null;
const outDir = resolve(root, String(args.out ?? `scripts/audit/out/gate-${tier}`));
const maxWait = Number(args['max-wait'] ?? 45);
const T0 = Date.now();
const mins = () => ((Date.now() - T0) / 60000).toFixed(1);
const say = (s) => console.log(`[${mins()} min] ${s}`);

// ---------------------------------------------------------------------------------------------- the steps
const node = process.execPath;
const A = (f) => join('scripts/audit', f);
const storyOnly = STORY.join(',');
/**
 * lens: the metrics' lens in gates.json; lane: 'offline' runs alone beside the two browser lanes; est: minutes on a
 * quiet machine (the lanes are balanced by it); cap: minutes after which the step is killed.
 */
const STEPS = {
  fast: [
    { id: 'units', lens: 'units', lane: 'offline', est: 4, cap: 20, shell: 'npx tsc --noEmit -p . ; echo "== tsc exit $?" ; npx vitest run ; echo "== vitest exit $?"' },
    { id: 'grades', lens: 'grades', lane: 'offline', est: 3, cap: 40, cmd: [A('grades.mjs'), '--no-climb', '--no-options', '--json', `${outDir}/grades.json`, '--png', `${outDir}/grades.png`] },
    { id: 'street-fit', lens: 'street-fit', lane: 'browser', est: 4, cap: 25, cmd: [A('street-fit.mjs'), '--out', outDir, '--shots', '0', '--minutes', '20'] },
    { id: 'routes', lens: 'routes', lane: 'browser', est: 10, cap: 40, cmd: [A('routes.mjs'), '--phases', 'guide,objectives', '--only', 'mq-,lud-01', '--out', outDir, '--name', 'routes', '--shots', '0', '--minutes', '30'] },
    { id: 'routes-places', lens: 'routes-places', lane: 'browser', est: 2, cap: 10, cmd: [A('routes.mjs'), '--probe', A('routes-places.js')], stdout: 'routes-places.json' },
    { id: 'collision', lens: 'collision', lane: 'browser', est: 5, cap: 25, cmd: [A('collision.mjs'), '--only', storyOnly, '--confirm', '0', '--shots', '0', '--minutes', '18', '--out', outDir] },
    { id: 'structures', lens: 'structures', lane: 'browser', est: 5, cap: 25, cmd: [A('structures.mjs'), '--passes', 'monuments,river,stairs,landmarks', '--only', storyOnly, '--no-shots', '--minutes', '18', '--json', `${outDir}/structures.json`] },
  ],
  full: [
    { id: 'units', lens: 'units', lane: 'offline', est: 4, cap: 20, shell: 'npx tsc --noEmit -p . ; echo "== tsc exit $?" ; npx vitest run ; echo "== vitest exit $?"' },
    { id: 'grades', lens: 'grades', lane: 'offline', est: 20, cap: 60, cmd: [A('grades.mjs'), '--json', `${outDir}/grades.json`, '--png', `${outDir}/grades.png`] },
    { id: 'street-fit', lens: 'street-fit', lane: 'browser', est: 5, cap: 30, cmd: [A('street-fit.mjs'), '--out', outDir, '--shots', '0', '--minutes', '25'] },
    { id: 'structures', lens: 'structures', lane: 'browser', est: 20, cap: 70, cmd: [A('structures.mjs'), '--levels', 'full,low', '--no-shots', '--minutes', '55', '--json', `${outDir}/structures.json`] },
    { id: 'collision', lens: 'collision', lane: 'browser', est: 17, cap: 60, cmd: [A('collision.mjs'), '--confirm', '0', '--shots', '0', '--minutes', '45', '--out', outDir] },
    { id: 'surface', lens: 'surface', lane: 'browser', est: 45, cap: 90, cmd: [A('surface.mjs'), '--max', '243', '--minutes', '75', '--json', `${outDir}/surface.json`] },
    { id: 'routes', lens: 'routes', lane: 'browser', est: 100, cap: 150, cmd: [A('routes.mjs'), '--phases', 'guide,objectives,approach,tour,random,edges', '--out', outDir, '--name', 'routes-walk', '--shots', '0', '--minutes', '130'] },
    { id: 'routes-sweep', lens: 'routes', lane: 'browser', est: 60, cap: 100, cmd: [A('routes.mjs'), '--phases', 'sweep', '--out', outDir, '--name', 'routes-sweep', '--shots', '0', '--minutes', '85'] },
    { id: 'routes-places', lens: 'routes-places', lane: 'browser', est: 2, cap: 10, cmd: [A('routes.mjs'), '--probe', A('routes-places.js')], stdout: 'routes-places.json' },
    { id: 'grades-live', lens: 'grades-live', lane: 'browser', est: 16, cap: 30, cmd: [A('grades-live.mjs'), '--from', `${outDir}/grades.json`, '--json', `${outDir}/grades-live.json`, '--no-shots', '--minutes', '14'] },
    { id: 'crawl', lens: 'crawl', lane: 'browser', est: 20, cap: 45, cmd: ['scripts/crawl.mjs', '--json', `${outDir}/crawl.json`] },
  ],
};

// ---------------------------------------------------------------------------------------------- reducers
const readJson = (dir, f) => {
  const p = join(dir, f);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
};
const sum = (a) => a.reduce((s, v) => s + v, 0);

/** Each reducer: (dir) -> { key: number | null } for the lens; null = this output cannot say. */
const REDUCERS = {
  units(dir) {
    const log = existsSync(join(dir, 'units.log')) ? readFileSync(join(dir, 'units.log'), 'utf8') : null;
    if (log === null) return {};
    const tsc = (log.match(/error TS\d+/g) ?? []).length;
    const tscExit = Number((log.match(/== tsc exit (\d+)/) ?? [])[1] ?? 1);
    const failed = Number((log.match(/Tests\s+(?:\d+ passed \| )?(\d+) failed/) ?? [])[1] ?? 0);
    const files = Number((log.match(/Test Files\s+(?:\d+ passed \| )?(\d+) failed/) ?? [])[1] ?? 0);
    const vExit = Number((log.match(/== vitest exit (\d+)/) ?? [])[1] ?? 1);
    return { typecheckErrors: tscExit === 0 ? 0 : Math.max(1, tsc), testFailures: vExit === 0 ? 0 : Math.max(1, failed + files) };
  },
  grades(dir) {
    const j = readJson(dir, 'grades.json') ?? readJson(dir, 'terrain-grades.json');
    if (!j) return {};
    if (j.gate) return { ...j.gate };
    // phase 4a output (no gate block): what it holds
    const streets = j.streets ?? {};
    return {
      wayCellsOver38: null,
      atlasRoadsOver25pct: j.roads.filter((r) => r.max4m.pct > 25).length,
      atlasRoadsOver84pct: j.roads.filter((r) => r.max4m.pct > 84).length,
      minorStreetsOver58pct: null,
      minorStreetsOver45pct: streets.over45pct ?? null,
      minorStreetsOver84pct: streets.over84pct ?? null,
      designedFlankTopDeg: Math.max(0, ...j.atlasHills.map((h) => h.designMaxDeg ?? 0)),
      easiestWayUpMaxDeg: Math.max(0, ...j.hills.map((h) => h.easiestUp?.surfaceDeg ?? 0)),
      walkableOver40Pct: j.walkable.over['>40deg']?.pct ?? null,
    };
  },
  'street-fit'(dir) {
    const j = readJson(dir, 'street-fit.json') ?? readJson(join(root, 'docs/research/solid-ground'), 'street-fit.json');
    if (!j) return {};
    if (j.gate) return { ...j.gate };
    const t = j.totals, by = Object.values(j.bySrc ?? {});
    return {
      lipCells30: t.lipCells30, lipCells12: t.lipCells12,
      openEdgeOver3cmM: +sum(by.map((e) => e.float03 ?? 0)).toFixed(1), openEdgeOver8cmM: +sum(by.map((e) => e.float08 ?? 0)).toFixed(1),
      faceFloatOver10cm: j.findings.filter((f) => f.kind === 'face-float' && f.v > 0.1).length,
      doublePavingCells: t.doublePavingCells, terrainThroughCells: t.throughCells, kerbstonesOnCityPaving: t.kerbstonesOnCityPaving, zfightCells: t.zfightCells,
      propsFloating: t.propsFloating, propsSunk: t.propsSunk, propFootInAirOver30cm: j.findings.filter((f) => f.kind === 'prop-foot-in-air' && f.v > 0.3).length,
    };
  },
  routes(dir) {
    // the walk run, plus the sweep when it ran in its own process
    const names = ['routes.json', 'routes-walk.json'].filter((f) => existsSync(join(dir, f)));
    const j = names.length ? readJson(dir, names[0]) : null;
    if (!j) return {};
    const sweepJ = readJson(dir, 'routes-sweep.json');
    const sw = sweepJ?.sweep ?? j.sweep;
    const jobs = j.jobs ?? [];
    const v = j.totals?.objectiveVerdicts ?? {};
    const events = jobs.flatMap((x) => x.events ?? []);
    const blocked = events.filter((e) => e.kind === 'blocked');
    return {
      objectiveFail: v.FAIL ?? 0,
      objectiveBlocked: v.BLOCKED ?? 0,
      objectiveSnags: v.snags ?? 0,
      leadOutBlocked: blocked.filter((e) => e.part === 'lead-out').length,
      allBlocked: blocked.length,
      tourAborted: jobs.filter((x) => x.outcome === 'aborted').length,
      timeouts: jobs.filter((x) => x.outcome === 'timeout').length,
      swims: events.filter((e) => e.kind === 'swim').length,
      targetsNoHeight: (j.questTable ?? []).filter((q) => q.goalYOff > 1).length,
      sweepEdgesFlagged: sw ? sw.edgesFlagged : null,
      sweepThroughSolid: sw ? sw.perKind?.through ?? null : null,
    };
  },
  'routes-places'(dir) {
    const j = readJson(dir, 'routes-places.json');
    if (!j) return {};
    return { edgelessNodes: j.isolated, noStreetRoute: j.bad.filter((b) => b.why.startsWith('no route')).length, placesOver30mFromNode: j.bad.filter((b) => b.why === 'long lead').length };
  },
  collision(dir) {
    const j = readJson(dir, 'collision.json');
    if (!j) return {};
    if (j.gate) return { ...j.gate };
    const t = j.terrain ?? {};
    const n = (t.drawnMatches ?? 0) + (t.otherMatches ?? 0) + (t.neither ?? 0);
    return { fallthrough: j.byKind?.fallthrough?.defects ?? null, terrainMaxDiffM: t.maxAbs ?? null, terrainDrawnDiagonalPct: n ? +((100 * t.drawnMatches) / n).toFixed(1) : null };
  },
  structures(dir) {
    const j = readJson(dir, 'structures.json');
    if (!j) return {};
    if (j.gate) return { ...j.gate };
    const bt = j.byType ?? {};
    const lots = j.totals?.lots ?? {};
    return {
      wallAqueductStretches03: bt['floating|monument']?.n ?? 0,
      buildingsFloating01: lots.floating ?? null,
      buildingsBuriedOpening: lots.buried ?? null,
      farBoxesOver10cm: j.massing?.floating ?? null,
      farBoxesDrawnL2: j.massing?.drawn?.L2 ?? null,
      lowDetailFloatingSamples: j.totals?.byJob?.['block-low']?.floating ?? null,
      lowDetailSunkSamples: j.totals?.byJob?.['block-low']?.sunkFloor ?? null,
    };
  },
  surface(dir) {
    const j = readJson(dir, 'surface.json');
    if (!j) return {};
    const t = j.totals ?? {};
    const pair = (a, b) => (j.ranked?.seams ?? []).concat(j.ranked?.twins ?? []).find((s) => s.pair.includes(a) && s.pair.includes(b));
    const trv = (j.ranked?.seams ?? []).find((s) => s.pair === 'paving_travertine | travertine');
    const cob = (j.ranked?.seams ?? []).find((s) => /cobbles/.test(s.pair) && /basalt/.test(s.pair));
    return {
      holes: t.holesN, slivers: t.slivers ?? t.sliversN, patchworkMean: t.patchwork, patchworkWorst: j.ranked?.patchy?.[0]?.patchwork ?? null,
      settlePopping: t.settlePopping, walkSpikes: t.walkSpikes,
      travertineRepeatRatio: trv?.tileRatio ?? pair('paving_travertine', 'travertine')?.tileRatio ?? null, cobblesBasaltRepeatRatio: cob?.tileRatio ?? null,
      textureChurnEvents: sum((j.walks ?? []).map((w) => w.byKind?.textures ?? 0)),
    };
  },
  'grades-live'(dir) {
    const j = readJson(dir, 'grades-live.json') ?? readJson(dir, 'terrain-grades-live.json');
    if (!j) return {};
    const climbs = j.climbs ?? [];
    return { climbsUp: climbs.filter((c) => c.reached).length, climbsTotal: climbs.length, gradeStalls: climbs.filter((c) => (c.stalls ?? []).some((s) => s.why === 'grade')).length };
  },
  crawl(dir) {
    const j = readJson(dir, 'crawl.json');
    if (!j) return {};
    return { crawlFindings: Array.isArray(j.findings) ? j.findings.length : null };
  },
};

// ---------------------------------------------------------------------------------------------- run
async function main() {
  if (args.list) {
    for (const m of gates.metrics) if (m.scope === tier) console.log(`${m.id.padEnd(46)} today ${String(m.today).padStart(9)}  gate ${String(m.gate).padStart(9)}  ${m.direction}  target ${m.target ?? '-'}  ${m.owner}`);
    return 0;
  }
  const reduceOnly = !!args['reduce-only'];
  const readDir = reduceOnly ? resolve(root, String(args.from ?? 'scripts/audit/out')) : outDir;
  const steps = STEPS[tier].filter((s) => !lensFilter || lensFilter.has(s.lens));
  const timings = [];
  let failedSteps = 0;
  if (!reduceOnly) {
    mkdirSync(outDir, { recursive: true });
    say(`gate ${tier}: ${steps.map((s) => s.id).join(', ')}  (load ${loadavg()[0].toFixed(1)}, limit ${MAX_LOAD}; outputs in ${outDir})`);
    // Balance the browser steps over two lanes by their estimates (largest first); the offline steps run in a third lane.
    const lanes = { offline: [], b0: [], b1: [] };
    const load = { b0: 0, b1: 0 };
    for (const s of steps.filter((s) => s.lane === 'offline')) lanes.offline.push(s);
    for (const s of steps.filter((s) => s.lane === 'browser').sort((a, b) => b.est - a.est)) {
      const k = load.b0 <= load.b1 ? 'b0' : 'b1';
      lanes[k].push(s);
      load[k] += s.est;
    }
    const runLane = async (list) => {
      for (const s of list) {
        const t = await runStep(s);
        timings.push(t);
        if (!t.ok) failedSteps++;
      }
    };
    await Promise.all(Object.values(lanes).map(runLane));
    say(`all steps finished (${failedSteps} failed)`);
  } else say(`reducing the outputs in ${readDir}`);

  // ---- the table
  const lenses = [...new Set(gates.metrics.filter((m) => m.scope === tier).map((m) => m.lens))].filter((l) => !lensFilter || lensFilter.has(l));
  const reduced = {};
  for (const l of lenses) {
    try {
      reduced[l] = REDUCERS[l] ? REDUCERS[l](readDir) : {};
    } catch (e) {
      reduced[l] = {};
      console.log(`reducer ${l} failed: ${e.message}`);
    }
  }
  const rows = [];
  let misses = 0, missing = 0;
  for (const m of gates.metrics.filter((m) => m.scope === tier && lenses.includes(m.lens))) {
    const key = m.id.split('.').slice(2).join('.');
    const now = reduced[m.lens]?.[key];
    let status;
    if (now === undefined || now === null || Number.isNaN(now)) {
      status = reduceOnly ? 'n/a' : 'MISSING';
      if (!reduceOnly) missing++;
    } else if (m.gate === null || m.gate === undefined) status = 'record';
    else {
      const tol = m.tol ?? 0;
      const ok = m.direction === 'max' ? now <= m.gate + tol : now >= m.gate - tol;
      status = ok ? (m.target !== undefined && m.target !== null && (m.direction === 'max' ? now <= m.target : now >= m.target) ? 'ok (target met)' : 'ok') : 'MISS';
      if (!ok) misses++;
    }
    rows.push({ m, now, status });
  }
  printTable(rows);
  const secs = timings.map((t) => `${t.id} ${(t.secs / 60).toFixed(1)}`).join(', ');
  if (timings.length) say(`step times (min): ${secs}`);
  say(`done: ${rows.length} metrics, ${misses} missed, ${missing} missing, ${failedSteps} tool step(s) failed; total ${mins()} min`);

  if (args.record) {
    let n = 0;
    for (const { m, now } of rows) {
      if (now === undefined || now === null || Number.isNaN(now)) continue;
      const g = gates.metrics.find((x) => x.id === m.id);
      const tighter = g.gate !== null && g.gate !== undefined && (g.direction === 'max' ? g.gate < now : g.gate > now);
      g.today = now;
      if (tighter) console.log(`  kept the tighter gate of ${g.id}: ${g.gate} (now ${now})`);
      else g.gate = now;
      g.recorded = new Date().toISOString().slice(0, 10);
      n++;
    }
    gates.recordedAt = new Date().toISOString();
    writeFileSync(gatesPath, JSON.stringify(gates, null, 1) + '\n');
    say(`recorded ${n} metrics into gates.json`);
  }
  return misses || missing || failedSteps ? 1 : 0;
}

/** Run one step: wait for the guard when it is a browser audit, run, log to <out>/<id>.log. */
async function runStep(s) {
  const t0 = Date.now();
  const log = createWriteStream(join(outDir, `${s.id}.log`));
  let release = () => {};
  if (s.lane === 'browser') {
    try {
      release = await acquireSlot({ label: `gate:${s.id}`, maxWaitMin: maxWait, log: (m) => say(m) });
    } catch (e) {
      say(e.message);
      log.end();
      process.exitCode = 2;
      return { id: s.id, ok: false, secs: (Date.now() - t0) / 1000, code: 'guard-timeout' };
    }
  }
  say(`start ${s.id}`);
  const t1 = Date.now();
  const child = s.shell ? spawn('/bin/sh', ['-c', s.shell], { cwd: root }) : spawn(node, s.cmd, { cwd: root });
  let stdoutFile = s.stdout ? createWriteStream(join(outDir, s.stdout)) : null;
  child.stdout.on('data', (d) => (stdoutFile ? stdoutFile.write(d) : log.write(d)));
  if (stdoutFile) child.stdout.on('data', (d) => log.write(d));
  child.stderr.on('data', (d) => log.write(d));
  const killer = setTimeout(() => {
    say(`${s.id}: over its ${s.cap} min cap, killed`);
    child.kill('SIGKILL');
  }, s.cap * 60_000);
  const code = await new Promise((res) => child.on('close', (c) => res(c)));
  clearTimeout(killer);
  release();
  stdoutFile?.end();
  log.end();
  if (s.stdout) trimJson(join(outDir, s.stdout));
  const secs = (Date.now() - t1) / 1000;
  const ok = s.shell ? true : code === 0;
  say(`${ok ? 'done' : 'FAILED'} ${s.id} (exit ${code}) in ${(secs / 60).toFixed(1)} min${Date.now() - t0 - secs * 1000 > 5000 ? ` (+${((Date.now() - t0 - secs * 1000) / 60000).toFixed(1)} min waiting)` : ''}`);
  return { id: s.id, ok, secs, code };
}

/** A probe's stdout holds its boot noise and then one JSON object: keep the object. */
function trimJson(path) {
  try {
    const txt = readFileSync(path, 'utf8');
    const i = txt.indexOf('\n{');
    const start = txt.startsWith('{') ? 0 : i + 1;
    if (start >= 0) writeFileSync(path, txt.slice(start));
  } catch {
    /* leave it */
  }
}

function printTable(rows) {
  const f = (v) => (v === null || v === undefined ? '-' : typeof v === 'number' ? String(+v.toFixed(3)) : String(v));
  const w = [Math.max(6, ...rows.map((r) => r.m.id.length)), 10, 10, 10, 12, 14];
  const line = (c) => c.map((x, i) => String(x).padEnd(w[i])).join('  ');
  console.log('\n' + line(['metric', 'today', 'now', 'gate', 'target', 'owner  status']));
  console.log('-'.repeat(w.reduce((a, b) => a + b + 2, 0)));
  for (const { m, now, status } of rows) console.log(line([m.id, f(m.today), f(now), `${m.direction === 'max' ? '<=' : '>='} ${f(m.gate)}`, m.target !== undefined && m.target !== null ? `${m.direction === 'max' ? '<=' : '>='} ${f(m.target)}` : '-', `${m.owner}  ${status}`]));
  console.log('');
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else {
      out[a.slice(2)] = next;
      i++;
    }
  }
  return out;
}
function die(msg) {
  console.error(msg);
  process.exit(2);
}

main().then(
  (code) => process.exit(process.exitCode ?? code),
  (e) => {
    console.error('gate failed:', e?.stack ?? e);
    process.exit(2);
  },
);
