#!/usr/bin/env node
/**
 * Terrain grades audit, offline (no browser, no GPU): builds the city's heightmap and the city plan
 * exactly as the game does (buildRome + buildCity, core extent), and measures how steep the ground
 * is where a player walks. Pure analysis lives in src/dev/audit/grades.ts.
 *
 *   node scripts/audit/grades.mjs [--json scripts/audit/out/terrain-grades.json]
 *                                 [--png scripts/audit/out/terrain-grades.png]
 *                                 [--dirs 24] [--no-climb] [--no-options] [--top 40]
 *
 * What it does (about 2.5 minutes on a quiet M-series Mac; 20 when other agents load the machine):
 *  1. The slope map: per 2 m cell the steeper of the two triangles of Rapier's heightfield (what
 *     the character controller meets), classed by what the cell is underfoot (atlas road, minor
 *     street, flight, open ground, a landmark's margin or square, water, built over).
 *  2. The controller's curve: the REAL Actor (src/actors/Actor.ts) run up heightfield ramps of
 *     0 to 60 degrees at walk, run and sprint (uphill speed, does it stay planted when it stops),
 *     and across them at 45 and 70 degrees off the fall line (does a zig-zag gain height?).
 *  3. The hills: for every hill (terraces folded into their hill) the grade of its flanks, the
 *     easiest way up from the low ground (minimax: the least "steepest grade on the way", by
 *     surface slope and by the rise of the move for a walker or runner who zig-zags without
 *     stepping on ground steeper than the measured slide limit), the shortest walkable way that
 *     stays that easy (a polyline the live audit walks), the real Actor run up each face (`--dirs`
 *     radial lines from the summit's foot) on the real terrain colliders, and how each atlas hill
 *     and terrace is made (its smoothstep flank's top grade, the run that would keep it under 25/30).
 *  4. Roads and streets by grade (atlas roads after the city's detours, and the minor streets):
 *     steepest 4 m stretch, with and without the landmark pads (a pad stamped over a road), length
 *     over 10/20/30/40 %, the real Actor run up every steep road, and the cut and fill a regrade
 *     to 15/20/25 % would take.
 *  5. The steep spots: connected patches of walkable ground over 35, 40 and 50 degrees, ranked,
 *     each with the nearest named place and a cause (hill flank, cliff, pad embankment, road
 *     bank, river cut, ground noise) from the natural landform rebuilt without roads, pads or noise;
 *     and those on roads, streets and squares, with the nearest story place.
 *  6. What-ifs for softening the hills, each measured on the same walkable mask: a lower vertical
 *     scale above 12 m ASL, longer hill flanks in the atlas, pad embankments as long as their height
 *     needs, no atlas cliffs (a bound), slope-limited relaxation, and packages; each with the clivi,
 *     the easiest way up each hill, minor streets over 40 degrees, and how far landmarks, story
 *     places and the river's edge move.
 *
 * Writes the summary JSON and a slope-map PNG (2 px per 4 m; the core at 1 px per 2 m) and prints
 * a ranked report. Then `node scripts/audit/grades-live.mjs` checks the worst places in the game.
 */
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = parseArgs(process.argv.slice(2));
const jsonOut = resolve(root, args.json ?? 'scripts/audit/out/terrain-grades.json');
const pngOut = resolve(root, args.png ?? 'scripts/audit/out/terrain-grades.png');
const DIRS = Number(args.dirs ?? 24);
const TOP = Number(args.top ?? 40);
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);

const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
const load = (p) => server.ssrLoadModule(p);
const atlas = await load('/src/data/atlas.ts');
const HM = await load('/src/world/terrain/heightmap.ts');
const { landmarkPads } = await load('/src/world/rome/buildRome.ts');
const { planCity, scaleBounds } = await load('/src/world/city/plan.ts');
const G = await load('/src/dev/audit/grades.ts');
const { WORLD_SCALE: S } = await load('/src/world/coords.ts');
const PH = await load('/src/core/Physics.ts');
const { Actor } = await load('/src/actors/Actor.ts');
const THREE = await import('three');
const { PLAYER_SPEEDS } = await load('/src/player/PlayerController.ts');
log('modules loaded');

// ------------------------------------------------------------------ 1. the ground as the game builds it
const box = (b, m = 0) => ({ minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m });
const lbs = [box(atlas.CORE_BOUNDS, 350), ...atlas.DETAIL_REGIONS.map((r) => box(r, 100))];
const landmarkBounds = { minX: Math.min(...lbs.map((b) => b.minX)), maxX: Math.max(...lbs.map((b) => b.maxX)), minZ: Math.min(...lbs.map((b) => b.minZ)), maxZ: Math.max(...lbs.map((b) => b.maxZ)) };
const SRC = { BASE_ELEVATION: atlas.BASE_ELEVATION, HILLS: atlas.HILLS, LOWLANDS: atlas.LOWLANDS, RIVERS: atlas.RIVERS, ISLANDS: atlas.ISLANDS, ROADS: atlas.ROADS, bounds: atlas.CITY_BOUNDS };
const PADS = landmarkPads(landmarkBounds);
const hm = HM.buildHeightmap(SRC, { spacing: 2, pads: PADS });
log(`heightmap ${hm.nx}×${hm.nz}`);
const plan = planCity(atlas, hm, { detailBounds: scaleBounds(atlas.CORE_BOUNDS, 150), corridorDetail: 150 });
log(`plan: ${plan.roads.length} roads, ${plan.streets.length} streets, ${plan.blocks.length} blocks`);
const CX = hm.nx - 1, CZ = hm.nz - 1, NC = CX * CZ;
const cellX = (k) => hm.minX + ((k % CX) + 0.5) * hm.spacing;
const cellZ = (k) => hm.minZ + (((k / CX) | 0) + 0.5) * hm.spacing;
const cellAt = (x, z) => {
  const ix = Math.floor((x - hm.minX) / hm.spacing), iz = Math.floor((z - hm.minZ) / hm.spacing);
  return ix >= 0 && iz >= 0 && ix < CX && iz < CZ ? iz * CX + ix : -1;
};
const grade = G.cellGrades(hm);
const cls = G.walkClasses(hm, plan, hm.waterLevelY);
// The world's edge walls stand 4 m inside the grid: nobody walks beyond them.
const EDGE = 4;
for (let k = 0; k < NC; k++) {
  const x = cellX(k), z = cellZ(k);
  if (x < hm.minX + EDGE || z < hm.minZ + EDGE || x > hm.maxX - EDGE || z > hm.maxZ - EDGE) cls[k] = G.WALK.NONE;
}
const walk = (k) => G.onTerrain(cls[k]);
const DEG = (g) => +G.toDeg(g).toFixed(1);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// ------------------------------------------------------------------ names
const lms = atlas.LANDMARKS.map((l) => ({ id: l.id, name: l.name, x: l.center[0] * S, z: l.center[1] * S, cat: l.category }));
const roadsNamed = plan.roads.map((r) => ({ id: r.id, name: r.name, pts: r.points, half: r.half }));
const hillSdf = new Map();
function sdfFor(h) {
  let e = hillSdf.get(h.id);
  if (e) return e;
  const cell = 6; // real m
  const xs = h.outline.map((p) => p[0]), zs = h.outline.map((p) => p[1]);
  const pad = h.slope + 20;
  const x0 = Math.min(...xs) - pad, z0 = Math.min(...zs) - pad;
  const nx = Math.ceil((Math.max(...xs) + pad - x0) / cell) + 1, nz = Math.ceil((Math.max(...zs) + pad - z0) / cell) + 1;
  const d = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) d[j * nx + i] = HM.signedDistance(x0 + i * cell, z0 + j * cell, h.outline);
  e = { x0, z0, cell, nx, nz, d, pad };
  hillSdf.set(h.id, e);
  return e;
}
/** Signed distance (REAL m) from game (x, z) to a hill's outline; +Infinity far outside its box. */
function hillSd(h, gx, gz) {
  const e = sdfFor(h);
  const x = gx / S, z = gz / S;
  const fx = (x - e.x0) / e.cell, fz = (z - e.z0) / e.cell;
  if (fx < 0 || fz < 0 || fx > e.nx - 1.001 || fz > e.nz - 1.001) return Infinity;
  const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, k = iz * e.nx + ix;
  const a = e.d[k] + (e.d[k + 1] - e.d[k]) * tx, c = e.d[k + e.nx] + (e.d[k + e.nx + 1] - e.d[k + e.nx]) * tx;
  return a + (c - a) * tz;
}
// Hill groups: the seven hills (and the others in the bounds), terraces folded into their hill.
const GROUP_OF = {
  capitolium: 'Capitoline', arx: 'Capitoline', 'capitoline-asylum': 'Capitoline',
  palatine: 'Palatine', velia: 'Velia', aventine: 'Aventine', 'aventine-minor': 'Lesser Aventine', caelian: 'Caelian',
  oppius: 'Oppian', cispius: 'Esquiline (Cispian)', 'esquiline-plateau': 'Esquiline', viminal: 'Viminal', 'castra-plateau': 'Viminal Field (Castra)',
  quirinal: 'Quirinal', pincian: 'Pincian (Hill of Gardens)', janiculum: 'Janiculum', 'janiculum-north': 'Janiculum (north)', monteverde: 'Janiculum (Monteverde)',
  vatican: 'Vatican', 'latin-plateau': 'Via Latina plateau', 'spes-vetus-rise': 'Spes Vetus rise',
};
const groupOf = (h) => GROUP_OF[h.id] ?? GROUP_OF[h.parent] ?? h.name;
const hillsIn = atlas.HILLS.filter((h) => h.outline.some(([x, z]) => x * S > hm.minX && x * S < hm.maxX && z * S > hm.minZ && z * S < hm.maxZ));
function hillAt(x, z) {
  let best = null, bestT = Infinity;
  for (const h of hillsIn) {
    const sd = hillSd(h, x, z);
    if (sd === Infinity || sd > h.slope) continue;
    const t = sd <= 0 ? -1 : sd / h.slope; // inside beats flank
    if (t < bestT) {
      bestT = t;
      best = { hill: h, group: groupOf(h), sd, part: sd <= 0 ? 'top' : 'flank' };
    }
  }
  return best;
}
function placeName(x, z) {
  let lm = null, ld = Infinity;
  for (const l of lms) {
    const d = Math.hypot(l.x - x, l.z - z);
    if (d < ld) {
      ld = d;
      lm = l;
    }
  }
  let road = null, rd = Infinity;
  for (const r of roadsNamed) {
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const d = Math.sqrt(HM.segDist2(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1])) - r.half;
      if (d < rd) {
        rd = d;
        road = r;
      }
    }
  }
  const h = hillAt(x, z);
  const parts = [];
  if (road && rd < 6) parts.push(`on ${road.name} (${road.id})`);
  else if (road && rd < 25) parts.push(`${Math.round(rd)} m off ${road.name}`);
  if (lm) parts.push(`${Math.round(ld)} m from ${lm.name} (${lm.id})`);
  if (h) parts.push(`${h.group} ${h.part}`);
  return parts.join(', ');
}

// ------------------------------------------------------------------ causes: the landform without roads, pads or noise
const natHm = HM.buildHeightmap({ ...SRC, ROADS: [] }, { spacing: 2, pads: [] });
const natGrade = G.cellGrades(natHm);
const smoothHm = HM.buildHeightmap({ ...SRC, ROADS: [] }, { spacing: 2, pads: [], noise: 0 });
const smoothGrade = G.cellGrades(smoothHm);
// The same ground with its roads but no landmark pads: what the pads do to the roads.
const noPadHm = HM.buildHeightmap(SRC, { spacing: 2, pads: [] });
log('natural landform rebuilt (no roads/pads; and no noise; and roads without pads)');
const padsGame = PADS.map((p) => ({ id: p.id, poly: p.polygon, margin: p.margin ?? 12, elevation: p.elevation }));
/** The pad whose blend reaches game (x, z) and moves the ground there the most (id, real m outside its footprint, its elevation). */
function padAt(x, z) {
  let best = null, bestDy = -1;
  for (const p of padsGame) {
    const sd = HM.signedDistance(x / S, z / S, p.poly);
    if (sd > p.margin) continue;
    const dy = Math.abs((p.elevation ?? (noPadHm.heightAt(x, z) / S)) - noPadHm.heightAt(x, z) / S);
    if (dy > bestDy) {
      bestDy = dy;
      best = { id: p.id, outside: r1(sd), elevation: p.elevation ?? 'mean of the ground', groundAsl: r1(noPadHm.heightAt(x, z) / S) };
    }
  }
  return best;
}
function causeOf(k) {
  const x = cellX(k), z = cellZ(k);
  const g = grade[k], gn = natGrade[k], gs = smoothGrade[k];
  if (g > gn + 0.12) {
    // Engineered: a pad's embankment or a road's leveled bank made it steeper.
    let pad = null, pd = Infinity;
    for (const p of padsGame) {
      const sd = HM.signedDistance(x / S, z / S, p.poly);
      if (sd > -2 && sd < p.margin + 2 && sd < pd) {
        pd = sd;
        pad = p;
      }
    }
    if (pad) return `pad embankment: ${pad.id} (${r1(pd * S)} m outside its footprint)`;
    for (const r of atlas.ROADS) {
      for (let i = 0; i + 1 < r.points.length; i++) {
        const d = Math.sqrt(HM.segDist2(x / S, z / S, r.points[i][0], r.points[i][1], r.points[i + 1][0], r.points[i + 1][1]));
        if (d < r.width / 2 + 7) return `road bank: ${r.id} (leveled crosswise, ${r1(d * S)} m from its centreline)`;
      }
    }
    return 'engineered (road/pad blend)';
  }
  if (gn > gs + 0.15 && gs < G.toGrade(30)) return 'ground noise on a flank (fbm, heightmap.ts)';
  // River channel or quay?
  if (hm.heights[((k / CX) | 0) * hm.nx + (k % CX)] < hm.waterLevelY + 6) {
    const nearWater = (() => {
      for (let dz = -6; dz <= 6; dz += 3) for (let dx = -6; dx <= 6; dx += 3) {
        const j = cellAt(x + dx * 2, z + dz * 2);
        if (j >= 0 && cls[j] === G.WALK.WATER) return true;
      }
      return false;
    })();
    if (nearWater) return 'river bank / channel cut';
  }
  const h = hillAt(x, z);
  if (h) {
    if (h.hill.cliffs?.length) {
      for (const c of h.hill.cliffs) {
        const dc = Math.sqrt(HM.segDist2(x / S, z / S, c.a[0], c.a[1], c.b[0], c.b[1]));
        if (dc < 70) return `cliff of ${h.hill.id} (atlas cliff, ${Math.round(dc)} real m from its line: CLIFF_RUN 13 m)`;
      }
    }
    return `hill flank: ${h.hill.id} (plateau ${h.hill.plateau} m, run ${h.hill.slope} m)`;
  }
  return 'landform (lowland blend)';
}

// ------------------------------------------------------------------ 2. slope map stats
const BANDS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 90];
function histogram(gr, mask) {
  const cnt = new Array(BANDS.length - 1).fill(0);
  for (let k = 0; k < NC; k++) {
    if (!mask(k)) continue;
    const d = G.toDeg(gr[k]);
    let b = 0;
    while (b < cnt.length - 1 && d >= BANDS[b + 1]) b++;
    cnt[b]++;
  }
  return cnt;
}
const areaHa = (cells) => r2((cells * hm.spacing * hm.spacing) / 10000);
const byClass = {};
for (const [i, name] of G.WALK_NAMES.entries()) {
  if (!G.onTerrain(i)) continue;
  const h = histogram(grade, (k) => cls[k] === i);
  const total = h.reduce((a, b) => a + b, 0);
  byClass[name] = { cells: total, ha: areaHa(total), bandsDeg: BANDS.slice(0, -1).map((b, j) => `${b}-${BANDS[j + 1]}`), cells_by_band: h, pct_over: overPct(grade, (k) => cls[k] === i) };
}
function overPct(gr, mask) {
  const th = [20, 25, 30, 35, 40, 45, 50];
  const c = th.map(() => 0);
  let n = 0;
  for (let k = 0; k < NC; k++) {
    if (!mask(k)) continue;
    n++;
    const d = G.toDeg(gr[k]);
    for (let i = 0; i < th.length; i++) if (d > th[i]) c[i]++;
  }
  return Object.fromEntries(th.map((t, i) => [`>${t}deg`, { cells: c[i], pct: n ? r2((100 * c[i]) / n) : 0 }]));
}
const walkAll = overPct(grade, walk);
log('slope map done');

// ------------------------------------------------------------------ 3. the controller's curve (real Actor on heightfield ramps)
await PH.initPhysics();
function makeGame(physics) {
  return { physics, scene: new THREE.Scene() };
}
/**
 * The real Actor on a 200 m heightfield ramp of `deg` degrees (rising toward −z), pushed at `speed`
 * along a heading `phi` degrees off the fall line (0 = straight up, 90 = along the contour): the
 * horizontal speed, the rate it gains height, and whether it stays put when it stops.
 */
function rampTest(deg, speed, phi = 0) {
  const physics = new PH.Physics();
  const n = 100, sp = 2, t = Math.tan((deg * Math.PI) / 180);
  const h = new Float32Array((n + 1) * (n + 1));
  for (let iz = 0; iz <= n; iz++) for (let ix = 0; ix <= n; ix++) h[iz * (n + 1) + ix] = -(iz * sp - 100) * t; // rises toward −z
  physics.addHeightfield(-100, -100, n * sp, n * sp, n, n, h);
  physics.step(1 / 60);
  const game = makeGame(physics);
  const ph = (phi * Math.PI) / 180;
  const x0 = phi ? -80 : 0;
  const a = new Actor(game, { id: 'ramp', position: { x: x0, y: -(80) * t + 0.05, z: 80 }, layer: PH.Layer.Player });
  physics.step(1 / 60);
  const ux = Math.sin(ph), uz = -Math.cos(ph);
  const wish = new THREE.Vector3(ux * speed, 0, uz * speed);
  a.heading = Math.atan2(ux, uz);
  let p0 = null, y0 = 0, tStart = 0, tEnd = 0, minStep = Infinity;
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 7; i++) {
    a.locomote(wish, dt);
    physics.step(dt);
    tEnd = i;
    if (i === 90) {
      p0 = a.position.clone();
      y0 = a.position.y;
      tStart = i;
    }
    if (i > 90) {
      const dz = (a.position.x - a.prevPos.x) * ux + (a.position.z - a.prevPos.z) * uz;
      if (dz < minStep) minStep = dz;
    }
    if (a.position.z < -90 || a.position.x > 95) break;
  }
  const el = Math.max(1, tEnd - tStart) / 60;
  // Progress along the push (horizontal), and height gained.
  const dist = p0 ? (a.position.x - p0.x) * ux + (a.position.z - p0.z) * uz : 0;
  const rise = a.position.y - y0;
  // Stop and stand: does it stay put?
  // The first second is the run coasting to a halt (as tests/actor.slope.test.ts); measure the next 3.
  const zero = new THREE.Vector3();
  let stopAt = a.position.clone();
  for (let i = 0; i < 240; i++) {
    if (i === 60) stopAt = a.position.clone();
    a.locomote(zero, dt);
    physics.step(dt);
  }
  const drift = a.position.distanceTo(stopAt);
  physics.removeCharacter(a.body);
  return { deg, phi, speed, horiz: r2(dist / el), vert: r2(rise / el), alongSlope: r2(Math.hypot(dist, rise) / el), pct: Math.round((100 * dist) / el / speed), driftAfterStop: r2(drift), minStep: r2(minStep * 60) };
}
const curve = [];
for (const deg of [0, 5, 10, 15, 20, 25, 30, 35, 38, 40, 42, 45, 48, 50, 52, 55, 60]) {
  for (const [mode, sp] of [['walk', PLAYER_SPEEDS.walk], ['run', PLAYER_SPEEDS.run], ['sprint', PLAYER_SPEEDS.sprint]]) curve.push({ mode, ...rampTest(deg, sp) });
}
// Zig-zag: the same ramps crossed at 45 and 70 degrees off the fall line (does a traverse gain height
// where the straight line can't?).
const traverse = [];
for (const deg of [30, 38, 40, 42, 45, 48, 50, 55]) {
  for (const phi of [45, 70]) {
    for (const [mode, sp] of [['walk', PLAYER_SPEEDS.walk], ['run', PLAYER_SPEEDS.run]]) traverse.push({ mode, ...rampTest(deg, sp, phi) });
  }
}
log('controller curve measured');
for (const mode of ['walk', 'run', 'sprint']) {
  console.log(`  ${mode.padEnd(6)} ` + curve.filter((c) => c.mode === mode).map((c) => `${c.deg}°:${c.horiz}`).join('  '));
}
console.log('  drift after stop (run): ' + curve.filter((c) => c.mode === 'run').map((c) => `${c.deg}°:${c.driftAfterStop}`).join('  '));
for (const mode of ['walk', 'run']) for (const phi of [45, 70]) {
  console.log(`  ${mode} ${phi}° off the fall line, height gained m/s: ` + traverse.filter((c) => c.mode === mode && c.phi === phi).map((c) => `${c.deg}°:${c.vert}`).join('  '));
}
/** Steepest ramp (deg) on which `mode` still gains height going straight up (the measured curve). */
const climbLimit = (mode) => Math.max(...curve.filter((c) => c.mode === mode && c.vert > 0.05).map((c) => c.deg));

// ------------------------------------------------------------------ terrain physics world (real colliders, chunked like Terrain.addColliders)
const world = new PH.Physics();
{
  const n = 65, step = n - 1;
  for (let cz = 0; cz < hm.nz - 1; cz += step) {
    for (let cx = 0; cx < hm.nx - 1; cx += step) {
      const sx = Math.min(n, hm.nx - cx), sz = Math.min(n, hm.nz - cz);
      if (sx < 2 || sz < 2) continue;
      const h = new Float32Array(sx * sz);
      for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) h[z * sx + x] = hm.heights[(cz + z) * hm.nx + cx + x];
      world.addHeightfield(hm.minX + cx * hm.spacing, hm.minZ + cz * hm.spacing, (sx - 1) * hm.spacing, (sz - 1) * hm.spacing, sx - 1, sz - 1, h);
    }
  }
  world.step(1 / 60);
}
const wgame = makeGame(world);
/**
 * Run the real Actor along `legs` (game points) at `speed` on the bare terrain. Reports whether it
 * got there, time, mean speed, and every stall (under 0.3 m of progress in a second) with the grade there.
 */
function climb(start, legs, speed, maxSec) {
  const a = new Actor(wgame, { id: 'climber', position: { x: start[0], y: hm.heightAt(start[0], start[1]) + 0.1, z: start[1] }, layer: PH.Layer.Player });
  world.step(1 / 60);
  const dt = 1 / 60;
  const wish = new THREE.Vector3();
  let leg = 0, steps = 0, path = 0;
  const trace = [];
  const stalls = [];
  let last = a.position.clone();
  let lastSec = a.position.clone();
  let slid = 0;
  let bestGoal = Infinity, bestAt = 0;
  const maxSteps = Math.round(maxSec * 60);
  while (leg < legs.length && steps < maxSteps) {
    const p = a.position;
    const [tx, tz] = legs[leg];
    wish.set(tx - p.x, 0, tz - p.z);
    if (wish.length() < (leg === legs.length - 1 ? 1.2 : 2.5)) {
      leg++;
      continue;
    }
    wish.normalize().multiplyScalar(speed);
    a.heading = Math.atan2(wish.x, wish.z);
    a.locomote(wish, dt);
    world.step(dt);
    steps++;
    path += Math.hypot(a.position.x - last.x, a.position.z - last.z);
    last.copy(a.position);
    if (steps % 60 === 0) {
      const moved = Math.hypot(a.position.x - lastSec.x, a.position.z - lastSec.z);
      const k = cellAt(a.position.x, a.position.z);
      if (moved < 0.3) stalls.push({ at: [r1(a.position.x), r1(a.position.y), r1(a.position.z)], deg: k >= 0 ? DEG(grade[k]) : null, t: steps / 60 });
      if (a.position.y < lastSec.y - 0.3) slid++;
      trace.push([r1(a.position.x), r1(a.position.y), r1(a.position.z)]);
      lastSec.copy(a.position);
      // Stuck for 4 s in a row, or no nearer to the goal for 8 s (sliding back and forth on a face it
      // can't climb): give up.
      if (stalls.length >= 4 && stalls.slice(-4).every((s, i, arr) => i === 0 || s.t - arr[i - 1].t === 1)) break;
      const [gx, gz] = legs[Math.min(leg, legs.length - 1)];
      const dGoal = Math.hypot(gx - a.position.x, gz - a.position.z) - leg * 1e5;
      if (dGoal < bestGoal - 0.5) {
        bestGoal = dGoal;
        bestAt = steps;
      } else if (steps - bestAt > 8 * 60) {
        stalls.push({ at: [r1(a.position.x), r1(a.position.y), r1(a.position.z)], deg: DEG(grade[cellAt(a.position.x, a.position.z)] ?? 0), t: steps / 60, noProgress: true });
        break;
      }
    }
  }
  const end = a.position.clone();
  world.removeCharacter(a.body);
  return { reached: leg >= legs.length, secs: r1(steps / 60), meanSpeed: r2(path / Math.max(1e-3, steps / 60)), end: [r1(end.x), r1(end.y), r1(end.z)], stalls, slidSeconds: slid, trace };
}

// ------------------------------------------------------------------ 4. hills
const groups = new Map();
for (const h of hillsIn) {
  const g = groupOf(h);
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(h);
}
// Per cell: which group's top or flank it is on (first match wins; tops before flanks).
const cellGroup = new Int16Array(NC).fill(-1);
const cellPart = new Uint8Array(NC); // 1 top, 2 flank
const groupNames = [...groups.keys()];
for (let k = 0; k < NC; k++) {
  if (k % CX === 0 && ((k / CX) | 0) % 200 === 0) { /* progress tick */ }
  const x = cellX(k), z = cellZ(k);
  const h = hillAt(x, z);
  if (!h) continue;
  cellGroup[k] = groupNames.indexOf(h.group);
  cellPart[k] = h.part === 'top' ? 1 : 2;
}
const groupFlank = groupNames.map(() => []);
for (let k = 0; k < NC; k++) if (cellGroup[k] >= 0 && cellPart[k] === 2 && walk(k)) groupFlank[cellGroup[k]].push(k);
log('hill membership done');
// The easiest way up from the low ground (≤ 21 m ASL, walkable), by surface and by uphill move.
const lowY = 21 * S;
const lowSrc = (k) => walk(k) && hm.heights[((k / CX) | 0) * hm.nx + (k % CX)] <= lowY;
const prevS = new Int32Array(NC);
const bnSurface = G.bottleneck(hm, grade, lowSrc, walk, { mode: 'surface', prev: prevS });
// A zig-zag only helps while the ground under the feet holds: the controller slides on anything over
// its 40 degree slide angle (walking backs down there; running still gains height to ~50: the curve above).
const WALK_LIMIT = climbLimit('walk'), RUN_LIMIT = climbLimit('run');
const bnUphill = G.bottleneck(hm, grade, lowSrc, walk, { mode: 'uphill', wall: G.toGrade(WALK_LIMIT) });
const bnUphillRun = G.bottleneck(hm, grade, lowSrc, walk, { mode: 'uphill', wall: G.toGrade(RUN_LIMIT) });
log(`bottleneck (easiest way up) done; climbs straight up to ${WALK_LIMIT}° walking, ${RUN_LIMIT}° running`);
const hillReports = [];
for (const [gi, name] of groupNames.entries()) {
  const members = groups.get(name);
  const flank = (k) => cellGroup[k] === gi && cellPart[k] === 2 && walk(k);
  const top = (k) => cellGroup[k] === gi && cellPart[k] === 1 && walk(k);
  let nFlank = 0, nTop = 0;
  for (let k = 0; k < NC; k++) {
    if (flank(k)) nFlank++;
    else if (top(k)) nTop++;
  }
  if (!nFlank && !nTop) continue;
  const q = G.quantiles(grade, flank, [0.5, 0.9, 0.99, 1]);
  // Easiest way up: the least bottleneck over the hill's top cells (well inside: 1/3 of the way to the summit).
  let bestS = Infinity, bestSk = -1, bestU = Infinity, bestUR = Infinity, summitK = -1, summitY = -Infinity;
  for (let k = 0; k < NC; k++) {
    if (cellGroup[k] !== gi || cellPart[k] !== 1) continue;
    const y = hm.heights[((k / CX) | 0) * hm.nx + (k % CX)];
    if (y > summitY) {
      summitY = y;
      summitK = k;
    }
  }
  // Top cells: within 3 m (game) of the highest top elevation band of this group's plateaus.
  const plateauY = Math.min(...members.filter((m) => m.kind !== 'terrace').map((m) => m.plateau), ...members.map((m) => m.plateau)) * S;
  for (let k = 0; k < NC; k++) {
    if (!top(k)) continue;
    const y = hm.heights[((k / CX) | 0) * hm.nx + (k % CX)];
    if (y < plateauY - 1) continue;
    if (bnSurface[k] < bestS) {
      bestS = bnSurface[k];
      bestSk = k;
    }
    if (bnUphill[k] < bestU) bestU = bnUphill[k];
    if (bnUphillRun[k] < bestUR) bestUR = bnUphillRun[k];
  }
  // The easiest route's steepest cell (walk back from the best top cell).
  let worstOnRoute = null;
  if (bestSk >= 0) {
    let k = bestSk, guard = 0;
    while (k >= 0 && guard++ < 1e6) {
      if (!worstOnRoute || grade[k] > grade[worstOnRoute]) worstOnRoute = k;
      k = prevS[k];
    }
  }
  hillReports.push({
    group: name,
    plateauY,
    members: members.map((m) => m.id),
    summit: summitK >= 0 ? [r1(cellX(summitK)), r1(summitY), r1(cellZ(summitK))] : null,
    flankHa: areaHa(nFlank),
    topHa: areaHa(nTop),
    flankDeg: { p50: DEG(q[0]), p90: DEG(q[1]), p99: DEG(q[2]), max: DEG(q[3]) },
    flankOver: overPct(grade, flank),
    easiestUp: {
      surfaceDeg: Number.isFinite(bestS) ? DEG(bestS) : null,
      // null: no way up at all without crossing ground steeper than the walker (run: runner) can hold.
      zigzagDeg: Number.isFinite(bestU) ? DEG(bestU) : null,
      zigzagRunDeg: Number.isFinite(bestUR) ? DEG(bestUR) : null,
      steepestCellOnIt: worstOnRoute != null ? { at: [r1(cellX(worstOnRoute)), r1(cellZ(worstOnRoute))], deg: DEG(grade[worstOnRoute]), place: placeName(cellX(worstOnRoute), cellZ(worstOnRoute)) } : null,
    },
    faces: [],
  });
  // The shortest way up that never meets anything steeper than the easiest way's steepest cell (+1°):
  // the line the live audit walks with the real player, and the way a player would have to find.
  if (Number.isFinite(bestS)) {
    const lim = G.toGrade(DEG(bestS) + 1);
    const prevW = new Int32Array(NC);
    const dist = G.shortestWay(hm, lowSrc, (k) => walk(k) && grade[k] <= lim, prevW);
    let goal = -1, gd = Infinity;
    for (let k = 0; k < NC; k++) {
      if (!top(k) || hm.heights[((k / CX) | 0) * hm.nx + (k % CX)] < plateauY - 1) continue;
      if (dist[k] < gd) {
        gd = dist[k];
        goal = k;
      }
    }
    if (goal >= 0) {
      const cells = G.wayTo(prevW, goal);
      let worst = cells[0];
      for (const k of cells) if (grade[k] > grade[worst]) worst = k;
      const rep = hillReports[hillReports.length - 1];
      rep.easiestUp.way = {
        metres: Math.round(gd),
        rise: r1(hm.heightAt(cellX(goal), cellZ(goal)) - hm.heightAt(cellX(cells[0]), cellZ(cells[0]))),
        steepest: { at: [r1(cellX(worst)), r1(hm.heightAt(cellX(worst), cellZ(worst))), r1(cellZ(worst))], deg: DEG(grade[worst]), place: placeName(cellX(worst), cellZ(worst)) },
        // Every ~8 m, from the low ground to the top.
        points: cells.filter((_, i) => i % 4 === 0 || i === cells.length - 1).map((k) => [r1(cellX(k)), r1(cellZ(k))]),
      };
    }
  }
}
log(`hills: ${hillReports.length} groups`);
// How each atlas hill (and terrace helper) is made: its flank is plateau → ground over `slope` real m
// as a smoothstep, whose steepest point is 1.5× the mean grade; a cliff squeezes it to CLIFF_RUN (13 m).
// `designMaxDeg` is that steepest grade; `runFor30` / `runFor25` the slope run that would keep it under.
const atlasHills = hillsIn.map((h) => {
  let cx = 0, cz = 0;
  for (const [x, z] of h.outline) {
    cx += x;
    cz += z;
  }
  cx /= h.outline.length;
  cz /= h.outline.length;
  const feet = h.outline.map(([x, z]) => {
    const L = Math.hypot(x - cx, z - cz) || 1;
    const d = h.slope + 8;
    return natHm.heightAt((x + ((x - cx) / L) * d) * S, (z + ((z - cz) / L) * d) * S) / S;
  }).sort((a, b) => a - b);
  const foot = feet[Math.floor(feet.length / 2)];
  const rise = Math.max(0, h.plateau - foot);
  const g = (1.5 * rise) / h.slope;
  return {
    id: h.id, group: groupOf(h), kind: h.kind, plateau: h.plateau, summit: h.summit, slope: h.slope, footAsl: r1(foot), rise: r1(rise),
    designMaxDeg: DEG(g), cliffs: h.cliffs?.length ?? 0, cliffMaxDeg: h.cliffs?.length ? DEG((1.5 * rise) / 13) : null,
    runFor30: Math.ceil((1.5 * rise) / G.toGrade(30)), runFor25: Math.ceil((1.5 * rise) / G.toGrade(25)),
  };
}).sort((a, b) => b.designMaxDeg - a.designMaxDeg);

// Faces: radial lines from the summit; the real Actor runs up each from the foot.
if (!args['no-climb']) {
  for (const rep of hillReports) {
    if (!rep.summit) continue;
    const gi = groupNames.indexOf(rep.group);
    const [sx, , sz] = rep.summit;
    for (let d = 0; d < DIRS; d++) {
      const th = (d / DIRS) * Math.PI * 2;
      const ux = Math.sin(th), uz = -Math.cos(th); // bearing th (0 = north)
      // March out until this hill's influence ends (or the grid, or another hill's top).
      let r = 0, foot = null;
      for (r = 4; r < 1400; r += 2) {
        const x = sx + ux * r, z = sz + uz * r;
        if (x < hm.minX + 8 || z < hm.minZ + 8 || x > hm.maxX - 8 || z > hm.maxZ - 8) break;
        const k = cellAt(x, z);
        if (k < 0) break;
        if (cellGroup[k] !== gi) {
          foot = [x, z];
          break;
        }
      }
      if (!foot) continue;
      // The face line: foot → summit, sampled every 1 m.
      const prof = G.profile((x, z) => hm.heightAt(x, z), [foot, [sx, sz]], 1, 4);
      let walkN = 0, maxG = 0, maxAt = 0;
      for (let i = 0; i < prof.s.length; i++) {
        const k = cellAt(prof.x[i], prof.z[i]);
        if (k >= 0 && (walk(k) || cls[k] === G.WALK.STAIRS)) walkN++;
        if (prof.grade[i] > maxG) {
          maxG = prof.grade[i];
          maxAt = i;
        }
      }
      const rise = prof.y[prof.y.length - 1] - prof.y[0];
      const bearing = Math.round((th * 180) / Math.PI);
      const face = {
        bearing,
        foot: [r1(foot[0]), r1(hm.heightAt(foot[0], foot[1])), r1(foot[1])],
        length: Math.round(prof.length),
        rise: r1(rise),
        walkableShare: r2(walkN / prof.s.length),
        steepest4m: { deg: DEG(maxG), at: [r1(prof.x[maxAt]), r1(prof.y[maxAt]), r1(prof.z[maxAt])] },
      };
      if (rise > 2) {
        // Run the hard part: from 60 m below the steepest stretch to 40 m above it (or the line's ends).
        const s0 = Math.max(0, prof.s[maxAt] - 60), s1 = Math.min(prof.length, prof.s[maxAt] + 40);
        const at = (sv) => [foot[0] + ((sx - foot[0]) * sv) / prof.length, foot[1] + ((sz - foot[1]) * sv) / prof.length];
        const a = at(s0), b = at(s1);
        const res = climb(a, [b], PLAYER_SPEEDS.run, (s1 - s0) / 0.8 + 10);
        face.run = { from: [r1(a[0]), r1(a[1])], to: [r1(b[0]), r1(b[1])], metres: Math.round(s1 - s0), reached: res.reached, secs: res.secs, flatSecs: r1((s1 - s0) / PLAYER_SPEEDS.run), meanSpeed: res.meanSpeed, stalls: res.stalls.length, firstStall: res.stalls[0] ?? null, end: res.end };
      }
      rep.faces.push(face);
    }
    const climbed = rep.faces.filter((f) => f.run);
    rep.faceSummary = {
      faces: rep.faces.length,
      blocked: climbed.filter((f) => !f.run.reached).length,
      blockedWalkable: climbed.filter((f) => !f.run.reached && f.walkableShare >= 0.6).length,
      slowestMean: climbed.length ? Math.min(...climbed.map((f) => f.run.meanSpeed)) : null,
      steepestFaceDeg: rep.faces.length ? Math.max(...rep.faces.map((f) => f.steepest4m.deg)) : null,
      gentlestFaceDeg: rep.faces.length ? Math.min(...rep.faces.map((f) => f.steepest4m.deg)) : null,
    };
    log(`  ${rep.group}: ${rep.faceSummary.faces} faces, ${rep.faceSummary.blocked} blocked (${rep.faceSummary.blockedWalkable} on walkable lines), slowest mean ${rep.faceSummary.slowestMean} m/s`);
  }
}

// ------------------------------------------------------------------ 5. roads and streets by grade
function roadReport(id, name, kind, style, pts) {
  const prof = G.profile((x, z) => hm.heightAt(x, z), pts, 1, 4);
  // The same line without the landmark pads: the grade the road would have, and where a pad's level
  // or embankment takes the road over (the pads are stamped after the roads are leveled).
  const bare = G.profile((x, z) => noPadHm.heightAt(x, z), pts, 1, 4);
  let bareMax = 0, padDy = 0, padI = -1;
  for (let i = 0; i < bare.s.length; i++) {
    bareMax = Math.max(bareMax, Math.abs(bare.grade[i]));
    const d = Math.abs(prof.y[i] - bare.y[i]);
    if (d > padDy) {
      padDy = d;
      padI = i;
    }
  }
  let maxG = 0, maxAt = 0;
  const over = { '>10%': 0, '>20%': 0, '>30%': 0, '>40%': 0, '>58% (30deg)': 0 };
  for (let i = 0; i < prof.s.length; i++) {
    const g = Math.abs(prof.grade[i]);
    if (g > maxG) {
      maxG = g;
      maxAt = i;
    }
    if (g > 0.1) over['>10%']++;
    if (g > 0.2) over['>20%']++;
    if (g > 0.3) over['>30%']++;
    if (g > 0.4) over['>40%']++;
    if (g > 0.58) over['>58% (30deg)']++;
    if (g > 0.84) over['>84% (40deg)'] = (over['>84% (40deg)'] ?? 0) + 1;
  }
  const ys = [...prof.y];
  const rise = Math.max(...ys) - Math.min(...ys);
  const regr = {};
  for (const G2 of [0.15, 0.2, 0.25]) {
    const r = G.regrade(prof.s, prof.y, G2);
    regr[`${Math.round(G2 * 100)}%`] = { cut: r1(r.cut), fill: r1(r.fill) };
  }
  return {
    id, name, kind, style,
    length: Math.round(prof.length), rise: r1(rise), meanGrade: r2(rise / Math.max(1, prof.length)),
    max4m: { pct: Math.round(maxG * 100), deg: DEG(maxG), at: [r1(prof.x[maxAt]), r1(prof.y[maxAt]), r1(prof.z[maxAt])] },
    max4mWithoutPads: Math.round(bareMax * 100),
    padTakeover: padDy > 1 ? { dy: r1(padDy), at: [r1(prof.x[padI]), r1(prof.y[padI]), r1(prof.z[padI])], bareY: r1(bare.y[padI]), pad: padAt(prof.x[padI], prof.z[padI]) } : null,
    metresOver: over,
    regrade: regr,
    lowEnd: prof.y[0] <= prof.y[prof.y.length - 1] ? 0 : 1,
    pts,
  };
}
const roadReports = plan.roads.map((r) => {
  const rep = roadReport(r.id, r.name, atlas.ROADS.find((a) => a.id === r.id)?.kind ?? 'road', r.style, r.points);
  // The terrain levels the ATLAS centreline (heightmap.ts step 2); the city lays the road on the plan's
  // line, which detour.ts may bend round a footprint, off the leveled band and onto a pad's embankment.
  const ar = atlas.ROADS.find((a) => a.id === r.id);
  const det = plan.roadDetours.filter((d) => d.road === r.id).length;
  if (ar) {
    const p = G.profile((x, z) => hm.heightAt(x, z), ar.points.map(([x, z]) => [x * S, z * S]), 1, 4);
    let m = 0, mi = 0;
    for (let i = 0; i < p.grade.length; i++) if (Math.abs(p.grade[i]) > m) { m = Math.abs(p.grade[i]); mi = i; }
    rep.atlasLine = { max4mPct: Math.round(m * 100), at: [r1(p.x[mi]), r1(p.y[mi]), r1(p.z[mi])], detours: det };
  }
  return rep;
});
const streetReports = plan.streets.map((s) => roadReport(s.id, `${s.kind} ${s.id}`, s.kind, 'street', s.points));
for (const r of streetReports) r.place = placeName(r.max4m.at[0], r.max4m.at[2]);
log(`roads ${roadReports.length}, streets ${streetReports.length} profiled`);
if (!args['no-climb']) {
  for (const r of roadReports) {
    if (r.rise < 3 || r.max4m.pct < 18 || r.style === 'stairs') continue;
    const pts = r.lowEnd === 0 ? r.pts : [...r.pts].reverse();
    // Time limit: three times the flat time (a long road is not stuck just because it is long).
    const res = climb(pts[0], pts.slice(1), PLAYER_SPEEDS.run, (r.length / PLAYER_SPEEDS.run) * 3 + 20);
    const flat = r.length / PLAYER_SPEEDS.run;
    r.run = { reached: res.reached, secs: res.secs, flatSecs: r1(flat), meanSpeed: res.meanSpeed, stalls: res.stalls.slice(0, 5), end: res.end, endPlace: res.reached ? null : placeName(res.end[0], res.end[2]) };
  }
  log('steep roads run');
}
for (const r of [...roadReports, ...streetReports]) delete r.pts;

// ------------------------------------------------------------------ 6. steep spots (walkable ground over 35 / 40 / 50 degrees)
/** The story's places (docs/STORY.md, Act I) and the owner's list. */
const storyIds = ['porta-capena', 'circus-maximus', 'rostra', 'temple-castor-pollux', 'meta-sudans', 'colosseum', 'ludus-magnus', 'forum-trajan', 'column-trajan', 'subura', 'forum-boarium', 'portus-tiberinus', 'pantheon', 'scalae-caci', 'arch-titus', 'temple-aesculapius', 'velia-vestibule', 'markets-trajan'];
const storyPts = storyIds.map((id) => atlas.LANDMARK_BY_ID?.[id] ?? atlas.LANDMARKS.find((l) => l.id === id)).filter(Boolean).map((l) => ({ id: l.id, x: l.center[0] * S, z: l.center[1] * S }));
const spots = {};
for (const th of [35, 40, 50]) {
  const g = G.toGrade(th);
  const comps = G.components(hm, grade, cls, (k) => walk(k) && grade[k] > g, 3);
  spots[`over${th}`] = {
    patches: comps.length,
    cells: comps.reduce((a, c) => a + c.cells, 0),
    top: comps.slice(0, th === 35 ? TOP : 20).map((c) => {
      const k = cellAt(c.maxAt[0], c.maxAt[1]);
      return {
        at: [r1(c.maxAt[0]), r1(hm.heightAt(c.maxAt[0], c.maxAt[1])), r1(c.maxAt[1])],
        centroid: [r1(c.cx), r1(c.cz)],
        areaM2: Math.round(c.area),
        maxDeg: DEG(c.max),
        meanDeg: DEG(c.mean),
        classes: Object.fromEntries(c.byClass.map((n, i) => [G.WALK_NAMES[i], n]).filter(([, n]) => n > 0)),
        place: placeName(c.maxAt[0], c.maxAt[1]),
        cause: causeOf(k),
        easiestFromLowDeg: Number.isFinite(bnSurface[k]) ? DEG(bnSurface[k]) : null,
      };
    }),
  };
}
// The steep patches a player meets on the way: those touching a road, a street or a landmark's square,
// ranked by how many of those cells they hold, with the nearest story place.
{
  const comps = G.components(hm, grade, cls, (k) => walk(k) && grade[k] > G.toGrade(35), 3);
  spots.onWays = comps
    .map((c) => ({ c, ways: c.byClass[G.WALK.ROAD] + c.byClass[G.WALK.STREET] + c.byClass[G.WALK.PRECINCT] }))
    .filter((e) => e.ways > 0)
    .sort((a, b) => b.ways - a.ways)
    .slice(0, TOP)
    .map(({ c, ways }) => {
      const k = cellAt(c.maxAt[0], c.maxAt[1]);
      let story = null, sd = Infinity;
      for (const p of storyPts) {
        const d = Math.hypot(p.x - c.maxAt[0], p.z - c.maxAt[1]);
        if (d < sd) {
          sd = d;
          story = p.id;
        }
      }
      return {
        at: [r1(c.maxAt[0]), r1(hm.heightAt(c.maxAt[0], c.maxAt[1])), r1(c.maxAt[1])],
        areaM2: Math.round(c.area),
        waysM2: ways * hm.spacing * hm.spacing,
        maxDeg: DEG(c.max),
        meanDeg: DEG(c.mean),
        classes: Object.fromEntries(c.byClass.map((n, i) => [G.WALK_NAMES[i], n]).filter(([, n]) => n > 0)),
        place: placeName(c.maxAt[0], c.maxAt[1]),
        nearestStoryPlace: { id: story, metres: Math.round(sd) },
        cause: causeOf(k),
        pad: padAt(c.maxAt[0], c.maxAt[1]),
      };
    });
}
// Causes across all walkable cells over 35 degrees.
const causeTally = new Map();
const causeKey = (c) => (c.startsWith('pad embankment') ? 'pad embankment' : c.startsWith('road bank') ? 'road bank' : c.startsWith('cliff') ? 'atlas cliff' : c.startsWith('hill flank') ? 'hill flank' : c);
for (let k = 0; k < NC; k++) {
  if (!walk(k) || grade[k] <= G.toGrade(35)) continue;
  const key = causeKey(causeOf(k));
  causeTally.set(key, (causeTally.get(key) ?? 0) + 1);
}
const causes = Object.fromEntries([...causeTally.entries()].sort((a, b) => b[1] - a[1]));
// Same tally by class.
const steepByClass = {};
for (let k = 0; k < NC; k++) if (walk(k) && grade[k] > G.toGrade(35)) steepByClass[G.WALK_NAMES[cls[k]]] = (steepByClass[G.WALK_NAMES[cls[k]]] ?? 0) + 1;
log('steep spots ranked');

// ------------------------------------------------------------------ 7. what-ifs
const lmPts = lms.filter((l) => l.x > hm.minX && l.x < hm.maxX && l.z > hm.minZ && l.z < hm.maxZ);
function sampleH(h, x, z) {
  const fx = Math.min(Math.max((x - hm.minX) / hm.spacing, 0), hm.nx - 1.0001), fz = Math.min(Math.max((z - hm.minZ) / hm.spacing, 0), hm.nz - 1.0001);
  const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, i = iz * hm.nx + ix;
  const a = h[i] + (h[i + 1] - h[i]) * tx, c = h[i + hm.nx] + (h[i + hm.nx + 1] - h[i + hm.nx]) * tx;
  return a + (c - a) * tz;
}
/** The clivi and stairways the owner named, and the core's ways up (their steepest 4 m in each option). */
const CLIVI = ['clivus-capitolinus', 'clivus-palatinus', 'clivus-victoriae', 'clivus-argentarius', 'clivus-publicius', 'clivus-scauri', 'clivus-suburanus', 'via-sacra', 'via-nova', 'vicus-iugarius', 'vicus-cuprius', 'clivus-rocca-savella', 'scalae-caci', 'centum-gradus', 'gradus-monetae'];
function evaluate(name, heights, note) {
  const gr = G.cellGrades({ ...hm, heights }, heights);
  const over = overPct(gr, walk);
  const roads = plan.roads.map((r) => {
    const p = G.profile((x, z) => sampleH(heights, x, z), r.points, 1, 4);
    let m = 0;
    for (const g of p.grade) m = Math.max(m, Math.abs(g));
    return { id: r.id, pct: Math.round(m * 100) };
  }).sort((a, b) => b.pct - a.pct);
  const clivi = Object.fromEntries(CLIVI.map((id) => [id, roads.find((r) => r.id === id)?.pct ?? null]));
  let streetsOver84 = 0;
  for (const st of plan.streets) {
    const p = G.profile((x, z) => sampleH(heights, x, z), st.points, 1, 4);
    let m = 0;
    for (const g of p.grade) m = Math.max(m, Math.abs(g));
    if (m > 0.84) streetsOver84++;
  }
  const dl = lmPts.map((l) => ({ id: l.id, dy: r2(sampleH(heights, l.x, l.z) - sampleH(hm.heights, l.x, l.z)) })).sort((a, b) => Math.abs(b.dy) - Math.abs(a.dy));
  const ds = storyPts.map((p) => ({ id: p.id, dy: r2(sampleH(heights, p.x, p.z) - sampleH(hm.heights, p.x, p.z)) }));
  // Water line: max change on cells within 1 m of the river's level.
  let dw = 0, changed = 0, maxD = 0;
  for (let i = 0; i < heights.length; i++) {
    const d = Math.abs(heights[i] - hm.heights[i]);
    if (d > 0.05) changed++;
    if (d > maxD) maxD = d;
    if (Math.abs(hm.heights[i] - hm.waterLevelY) < 1 && d > dw) dw = d;
  }
  // The easiest way onto each hill again (surface slope), on the changed ground.
  const g2 = { ...hm, heights };
  const lowSrc2 = (k) => walk(k) && heights[((k / CX) | 0) * hm.nx + (k % CX)] <= lowY;
  const bn = G.bottleneck(g2, gr, lowSrc2, walk, { mode: 'surface' });
  const hills = hillReports.map((h) => {
    const gi = groupNames.indexOf(h.group);
    const arr = Float32Array.from(groupFlank[gi], (k) => gr[k]).sort();
    let easiest = Infinity;
    const plateauY = h.plateauY;
    for (let k = 0; k < NC; k++) {
      if (cellGroup[k] !== gi || cellPart[k] !== 1 || !walk(k)) continue;
      if (hm.heights[((k / CX) | 0) * hm.nx + (k % CX)] < plateauY - 1) continue;
      if (bn[k] < easiest) easiest = bn[k];
    }
    return { group: h.group, p90: arr.length ? DEG(arr[Math.round(0.9 * (arr.length - 1))]) : null, max: arr.length ? DEG(arr[arr.length - 1]) : null, easiestUpDeg: Number.isFinite(easiest) ? DEG(easiest) : null };
  });
  return {
    option: name, note,
    walkableOver: Object.fromEntries(Object.entries(over).map(([k, v]) => [k, v.pct])),
    walkableOverHa: Object.fromEntries(Object.entries(over).map(([k, v]) => [k, areaHa(v.cells)])),
    steepestRoads: roads.slice(0, 8),
    clivi,
    streetsOver84,
    hills,
    landmarksMoved: { over0_5m: dl.filter((d) => Math.abs(d.dy) > 0.5).length, over2m: dl.filter((d) => Math.abs(d.dy) > 2).length, worst: dl.slice(0, 8) },
    storyPlaces: ds,
    waterLineMaxChange: r2(dw),
    samplesChanged: changed,
    maxChange: r2(maxD),
  };
}
const options = [];
if (!args['no-options']) {
  options.push(evaluate('as built', hm.heights, 'the current terrain'));
  // A. A lower vertical scale for the land above 12 m ASL: the river, its quays and the Campus stay.
  const datum = 12 * S;
  for (const k of [0.8, 0.7]) options.push(evaluate(`vertical scale ×${k} above 12 m ASL`, G.scaleAbout(hm.heights, k, datum), `y' = ${r1(datum)} + (y − ${r1(datum)})·${k} for ground above 12 m ASL (the Campus, river and quays stay); every grade above it ×${k}`));
  // B. Longer hill flanks in the atlas (cliffs keep CLIFF_RUN).
  const flanks15 = atlas.HILLS.map((h) => ({ ...h, slope: h.slope * 1.5 }));
  {
    const h2 = HM.buildHeightmap({ ...SRC, HILLS: flanks15 }, { spacing: 2, pads: PADS });
    options.push(evaluate('hill flanks ×1.5 longer (atlas slope)', h2.heights, 'every hill\'s and terrace\'s slope run ×1.5 (cliffs keep CLIFF_RUN); the plateaus stay, the flanks spread into the valleys'));
  }
  // C. Pad embankments as long as their height needs: a smoothstep over (margin − 1) m has a top grade of
  //    1.5·Δh/(margin − 1); under 30 degrees needs margin ≥ 1 + 2.6·Δh (real m), here 14 to 60 m.
  const padsByHeight = PADS.map((p) => {
    let elev = p.elevation;
    const nat = (x, z) => natHm.heightAt(x * S, z * S) / S;
    let cx = 0, cz = 0;
    for (const [x, z] of p.polygon) {
      cx += x;
      cz += z;
    }
    cx /= p.polygon.length;
    cz /= p.polygon.length;
    if (elev === undefined) {
      let sum = nat(cx, cz) * 2;
      for (const [x, z] of p.polygon) sum += nat(x, z);
      elev = sum / (p.polygon.length + 2);
    }
    let dh = 0;
    for (const [x, z] of p.polygon) {
      const L = Math.hypot(x - cx, z - cz) || 1;
      for (const m of [0, 7, 14]) dh = Math.max(dh, Math.abs(elev - nat(x + ((x - cx) / L) * m, z + ((z - cz) / L) * m)));
    }
    const margin = Math.min(60, Math.max(p.margin ?? 12, Math.ceil(1 + 2.6 * dh)));
    return { ...p, margin, dh };
  });
  const padsChanged = padsByHeight.filter((p, i) => p.margin !== (PADS[i].margin ?? 12));
  const hmPads = HM.buildHeightmap(SRC, { spacing: 2, pads: padsByHeight });
  options.push(evaluate('pad embankments by height (≤30°, 14–60 m)', hmPads.heights, `${padsChanged.length} of ${PADS.length} pads get a longer blend: ${padsChanged.sort((a, b) => b.dh - a.dh).slice(0, 12).map((p) => `${p.id} ${r1(p.dh)} m → ${p.margin} m`).join(', ')}`));
  // D. No atlas cliffs at all (the upper bound of softening them: the flank takes the hill's own run).
  {
    const h2 = HM.buildHeightmap({ ...SRC, HILLS: atlas.HILLS.map((h) => ({ ...h, cliffs: undefined })) }, { spacing: 2, pads: PADS });
    options.push(evaluate('no atlas cliffs (bound)', h2.heights, 'every hill\'s cliffs removed: an upper bound for softening them (the Tarpeian Rock, the Aventine river cliff and the Palatine\'s SW corner become ordinary flanks)'));
  }
  // E. Slope-limited relaxation on open ground only (roads, pads, streets, blocks and the river margins stay).
  const movable = (i) => {
    const ix = i % hm.nx, iz = (i / hm.nx) | 0;
    const k = Math.min(iz, CZ - 1) * CX + Math.min(ix, CX - 1);
    return cls[k] === G.WALK.OPEN && hm.padMask[i] < 0.01 && hm.roadMask[i] < 0.01 && hm.heights[i] > hm.waterLevelY + 2.5;
  };
  options.push(evaluate('relax open ground to 35°', G.relax(hm, G.toGrade(35), 300, movable), 'thermal relaxation (mass kept) of open ground only, 300 sweeps; roads, pads, streets, blocks and ground under 2.5 m above the river fixed'));
  // F. Packages.
  options.push(evaluate('×0.8 vertical + pads by height', G.scaleAbout(hmPads.heights, 0.8, datum), 'A (×0.8) on top of C'));
  {
    const h2 = HM.buildHeightmap({ ...SRC, HILLS: flanks15 }, { spacing: 2, pads: padsByHeight });
    options.push(evaluate('×0.8 vertical + flanks ×1.5 + pads by height', G.scaleAbout(h2.heights, 0.8, datum), 'A (×0.8), B and C together'));
  }
  log(`options: ${options.length} evaluated`);
}

// ------------------------------------------------------------------ PNG slope map
writePng(pngOut, 2, 0, 0, CX, CZ);
// The core (Capitoline to the Caelian, the Campus edge to the Circus) at one pixel per 2 m cell.
{
  const x0 = Math.floor((-260 - hm.minX) / hm.spacing), z0 = Math.floor((-420 - hm.minZ) / hm.spacing);
  writePng(pngOut.replace(/\.png$/, '-core.png'), 1, x0, z0, 560, 520);
}
function writePng(out, f, ox, oz, cw, ch) {
  const W = Math.floor(cw / f), H = Math.floor(ch / f);
  const px = new Uint8Array(W * H * 3);
  const colors = [
    [0, [236, 233, 222]], [10, [196, 222, 176]], [20, [150, 200, 120]], [25, [240, 222, 110]], [30, [245, 180, 70]],
    [35, [235, 110, 50]], [40, [205, 40, 40]], [45, [150, 20, 70]], [50, [90, 20, 120]],
  ];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let gmax = 0, kind = 0, water = 0, none = 0, stairs = 0;
      for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) {
        const k = (oz + y * f + dy) * CX + ox + x * f + dx;
        if (walk(k)) {
          kind++;
          if (grade[k] > gmax) gmax = grade[k];
        } else if (cls[k] === G.WALK.WATER) water++;
        else if (cls[k] === G.WALK.STAIRS) stairs++;
        else none++;
      }
      let c;
      if (kind) {
        const d = G.toDeg(gmax);
        c = colors[0][1];
        for (const [t, col] of colors) if (d >= t) c = col;
      } else if (water) c = [120, 160, 200];
      else if (stairs) c = [60, 60, 200];
      else c = [150, 146, 140];
      // Hillshade (sun from the NW) for relief.
      const k0 = (oz + y * f) * hm.nx + ox + x * f;
      const hx = hm.heights[Math.min(k0 + 1, hm.heights.length - 1)] - hm.heights[k0];
      const hz = hm.heights[Math.min(k0 + hm.nx, hm.heights.length - 1)] - hm.heights[k0];
      const shade = Math.max(0.6, Math.min(1.15, 1 - (hx + hz) * 0.12));
      const o = (y * W + x) * 3;
      px[o] = Math.min(255, c[0] * shade);
      px[o + 1] = Math.min(255, c[1] * shade);
      px[o + 2] = Math.min(255, c[2] * shade);
    }
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(W, H, px));
  log(`slope map ${W}×${H} → ${out}`);
}

// ------------------------------------------------------------------ report
const summary = {
  generated: new Date().toISOString(),
  tool: 'scripts/audit/grades.mjs',
  grid: { nx: hm.nx, nz: hm.nz, spacing: hm.spacing, minX: hm.minX, minZ: hm.minZ, cells: NC, worldScale: S },
  controller: { maxClimbDeg: 50, slideFromDeg: 40, plantedUpToDeg: 50, climbsStraightUpToDeg: { walk: WALK_LIMIT, run: RUN_LIMIT }, speeds: PLAYER_SPEEDS, curve, traverse },
  walkable: { cells: [...cls].filter((c) => G.onTerrain(c)).length, over: walkAll, byClass, steepOver35ByClass: steepByClass, steepOver35ByCause: causes },
  hills: hillReports,
  atlasHills,
  roads: roadReports.sort((a, b) => b.max4m.pct - a.max4m.pct),
  streets: {
    count: streetReports.length,
    over30pct: streetReports.filter((s) => s.max4m.pct > 30).length,
    over45pct: streetReports.filter((s) => s.max4m.pct > 45).length,
    // 84 %: 40 degrees, where a walker slides back; 119 %: 50 degrees, where a runner does too.
    over84pct: streetReports.filter((s) => s.max4m.pct > 84).length,
    over119pct: streetReports.filter((s) => s.max4m.pct > 119).length,
    takenOverByPads: streetReports.filter((s) => s.padTakeover && s.padTakeover.dy > 2).length,
    steepest: streetReports.sort((a, b) => b.max4m.pct - a.max4m.pct).slice(0, 25),
    padTakeovers: streetReports.filter((s) => s.padTakeover && s.padTakeover.dy > 2).sort((a, b) => b.padTakeover.dy - a.padTakeover.dy).slice(0, 15).map((s) => ({ id: s.id, kind: s.kind, max4mPct: s.max4m.pct, withoutPadsPct: s.max4mWithoutPads, ...s.padTakeover })),
  },
  spots,
  options,
  minutes: r1((Date.now() - T0) / 60000),
};
mkdirSync(dirname(jsonOut), { recursive: true });
writeFileSync(jsonOut, JSON.stringify(summary, null, 1));
log(`summary → ${jsonOut}`);

console.log('\n== Walkable ground (on the terrain) over a slope:');
console.log('   ' + Object.entries(walkAll).map(([k, v]) => `${k}: ${v.pct}% (${areaHa(v.cells)} ha)`).join('  '));
console.log('   over 35° by cause: ' + JSON.stringify(causes));
console.log('   over 35° by class: ' + JSON.stringify(steepByClass));
console.log('\n== Hills (flank p50/p90/max; easiest way up by surface / zig-zag; faces blocked)');
for (const h of hillReports) {
  console.log(`   ${h.group.padEnd(26)} flank ${String(h.flankDeg.p50).padStart(5)} / ${String(h.flankDeg.p90).padStart(5)} / ${String(h.flankDeg.max).padStart(5)}°  easiest ${h.easiestUp.surfaceDeg}° / ${h.easiestUp.zigzagDeg ?? 'none'}° (run ${h.easiestUp.zigzagRunDeg ?? 'none'}°)  faces ${h.faceSummary ? `${h.faceSummary.blocked}/${h.faceSummary.faces} blocked (${h.faceSummary.blockedWalkable} walkable), slowest ${h.faceSummary.slowestMean} m/s` : '-'}`);
}
console.log('\n== The easiest way up each hill (shortest way under its easiest grade + 1°)');
for (const h of hillReports) if (h.easiestUp.way) console.log(`   ${h.group.padEnd(26)} ${h.easiestUp.way.metres} m, rise ${h.easiestUp.way.rise} m, steepest ${h.easiestUp.way.steepest.deg}° @${h.easiestUp.way.steepest.at.join(',')} ${h.easiestUp.way.steepest.place}`);
console.log('\n== Atlas hills by designed flank (smoothstep top grade = 1.5 × rise / run)');
for (const h of atlasHills.slice(0, 16)) console.log(`   ${h.id.padEnd(22)} ${String(h.kind).padEnd(8)} plateau ${h.plateau} over foot ${h.footAsl} m ASL, run ${h.slope} m: ${h.designMaxDeg}°${h.cliffs ? ` (cliffs ${h.cliffMaxDeg}°)` : ''}; run for 30°: ${h.runFor30} m, for 25°: ${h.runFor25} m`);
console.log('\n== Steepest atlas roads (4 m window)');
for (const r of summary.roads.slice(0, 20)) console.log(`   ${String(r.max4m.pct).padStart(4)}% (${r.max4m.deg}°) ${r.id.padEnd(34)} ${r.kind}/${r.style} rise ${r.rise} m over ${r.length} m @${r.max4m.at.join(',')} [atlas line ${r.atlasLine?.max4mPct ?? '-'}%, ${r.atlasLine?.detours ?? 0} detours]${r.run ? `  run: ${r.run.reached ? 'up' : 'STUCK'} in ${r.run.secs}s (flat ${r.run.flatSecs}s)` : ''}`);
console.log('\n== Roads a landmark pad takes over (ground moved > 1 m on the road line)');
for (const r of summary.roads.filter((r) => r.padTakeover).sort((a, b) => b.padTakeover.dy - a.padTakeover.dy).slice(0, 15)) console.log(`   ${r.id.padEnd(34)} ${r.max4m.pct}% (without pads ${r.max4mWithoutPads}%)  ground moved ${r.padTakeover.dy} m @${r.padTakeover.at.join(',')} by ${r.padTakeover.pad ? `${r.padTakeover.pad.id} (pad ${r.padTakeover.pad.elevation} m ASL, ground ${r.padTakeover.pad.groundAsl} m)` : '?'}`);
console.log(`\n== Minor streets: ${summary.streets.over30pct} over 30 %, ${summary.streets.over45pct} over 45 %, ${summary.streets.over84pct} over 84 % (40°: a walker slides back), ${summary.streets.over119pct} over 119 % (50°), ${summary.streets.takenOverByPads} moved > 2 m by a pad (of ${summary.streets.count})`);
for (const st of summary.streets.steepest.slice(0, 10)) console.log(`   ${st.id.padEnd(8)} ${st.kind.padEnd(6)} ${st.max4m.pct}% (${st.max4m.deg}°) @${st.max4m.at.join(',')} without pads ${st.max4mWithoutPads}%  ${st.place}`);
console.log('\n== Steep spots over 35° (largest first)');
for (const s of spots.over35.top.slice(0, 25)) console.log(`   ${String(s.areaM2).padStart(6)} m²  max ${s.maxDeg}°  @${s.at.join(',')}  ${s.place}  — ${s.cause}`);
console.log('\n== Steep patches (>35°) on roads, streets and squares (most way-cells first)');
for (const s of spots.onWays.slice(0, 20)) console.log(`   ${String(s.waysM2).padStart(5)} m² of way, max ${s.maxDeg}° @${s.at.join(',')}  ${s.place}; story: ${s.nearestStoryPlace.id} ${s.nearestStoryPlace.metres} m — ${s.cause}`);
console.log('\n== Options');
for (const o of options) {
  console.log(`   ${o.option.padEnd(44)} >30°:${o.walkableOver['>30deg']}% >35°:${o.walkableOver['>35deg']}% >40°:${o.walkableOver['>40deg']}% >50°:${o.walkableOver['>50deg']}%  streets >84%: ${o.streetsOver84}  landmarks moved >0.5 m: ${o.landmarksMoved.over0_5m}, >2 m: ${o.landmarksMoved.over2m}  water ${o.waterLineMaxChange} m`);
  console.log(`      clivi: ${Object.entries(o.clivi).map(([k, v]) => `${k.replace('clivus-', 'cl.')} ${v}%`).join(', ')}`);
  console.log(`      easiest way up: ${o.hills.filter((h) => ['Capitoline', 'Palatine', 'Aventine', 'Caelian', 'Oppian', 'Quirinal', 'Viminal', 'Esquiline (Cispian)', 'Velia', 'Janiculum', 'Pincian (Hill of Gardens)'].includes(h.group)).map((h) => `${h.group.split(' ')[0]} ${h.easiestUpDeg}°`).join(', ')}`);
}
console.log(`\ndone in ${summary.minutes} min`);
await server.close();
process.exit(0);

// ------------------------------------------------------------------ helpers
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

function encodePng(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return crc ^ 0xffffffff;
}
