/**
 * Route audit, the part that runs IN THE PAGE (injected by scripts/audit/routes.mjs, like
 * scripts/golden-bot.js). It defines `window.__routeAudit` with:
 *
 *   info()                    the street graph and the quests at a glance
 *   objectives()              every objective of every quest, stage by stage (each stage is set with
 *                             QuestSystem.setStage so the NPCs stand where that stage puts them), with
 *                             the marker's position as the HUD would resolve it
 *   walk(job)                 the route the game would show (game.questRoute, its source pointed at
 *                             the job's goal; `job.reach`: the objective completes within that many
 *                             metres, so the walk stops there), WALKED with the real player controller: face a point
 *                             2 m ahead on the drawn line, hold W (+ Shift to sprint), and record
 *                             every place the walk is blocked, needs a jump or a climb, drops,
 *                             swims, or slides off the line; and, ahead of the walker where the
 *                             city's colliders exist, where the DRAWN line itself crosses solid
 *                             geometry, a ledge or water. `job.line` walks a fixed polyline instead
 *                             (a street-graph edge).
 *   edgeSweep(opts)           every street-graph edge, checked statically against the physics world
 *                             tile by tile (the player is teleported to each tile so the lazy city
 *                             colliders exist): walls, low obstacles, ledges, drops, water, steep
 *                             ground and nodes inside solids along the straight line the maps draw.
 *
 * Coordinates are game metres (+x east, +z south). Nothing here changes game code: it only drives the
 * player (teleport, simulated keys) and overrides `game.questRoute.source` for the length of a walk.
 */
(() => {
  const game = window.__skyrome.game;
  const p = game.player;
  const ph = game.physics;
  const WORLD = 1;
  const NPC = 1 << 2;
  const DOWN = { x: 0, y: -1, z: 0 };
  const UP = { x: 0, y: 1, z: 0 };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = (n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;
  const P3 = (v) => [r1(v.x), r1(v.y), r1(v.z)];
  const H = (x, z) => game.heightmap.heightAt(x, z);
  const CLS = ['free', 'road', 'street', 'landmark', 'margin', 'plaza', 'garden', 'water', 'steep', 'wall', 'aqueduct', 'piazza', 'outside', 'scrap'];

  // A clock in simulated seconds (fixed steps), so the walker's limits hold at any timeScale or frame rate.
  let simT = 0;
  if (!game.getSystem?.('routeAuditClock')) game.addSystem({ name: 'routeAuditClock', priority: -1000, fixedUpdate: (dt) => { simT += dt; } });
  const climbs = [];
  game.events.on('player:climb', (e) => climbs.push({ t: simT, height: e.height, kind: e.kind, at: P3(p.position) }));

  let mods = null;
  async function load() {
    if (mods) return mods;
    const [safe, atlas] = await Promise.all([import('/src/world/safeGround.ts'), import('/src/data/atlas.ts')]);
    mods = { safe, atlas };
    return mods;
  }

  // ------------------------------------------------------------------ naming places

  let named = null;
  function namedPlaces() {
    if (named) return named;
    named = [];
    for (const pl of game.landmarks?.values?.() ?? []) named.push({ x: pl.position.x, z: pl.position.z, name: pl.lm.name, id: pl.lm.id, w: 1 });
    for (const l of game.locations?.all?.() ?? []) if (l.name) named.push({ x: l.position.x, z: l.position.z, name: l.name, id: l.id, w: 1.3 });
    return named;
  }
  function regionAt(x, z) {
    const plan = game.city?.plan;
    if (!plan || !mods) return '';
    const i = plan.grid.index(x, z);
    const ri = i >= 0 ? plan.region[i] : 255;
    const reg = mods.atlas.REGIONS[ri];
    return reg ? `${reg.latin} ${reg.name}` : '';
  }
  /** The nearest named place (landmark or quest location) and the region. */
  function placeName(x, z) {
    let best = null;
    let bd = Infinity;
    for (const n of namedPlaces()) {
      const d = Math.hypot(n.x - x, n.z - z) * n.w;
      if (d < bd) ((bd = d), (best = n));
    }
    const reg = regionAt(x, z);
    return best ? `${best.name} (${Math.round(Math.hypot(best.x - x, best.z - z))} m${reg ? ', ' + reg : ''})` : reg;
  }
  function clsAt(x, z) {
    const c = game.city?.classAt?.(x, z);
    return c === undefined ? '?' : (CLS[c] ?? String(c));
  }
  /** What a collider belongs to, as a short label. */
  function ownerName(o) {
    if (o === undefined || o === null) return 'unknown';
    if (o === game.terrain) return 'terrain';
    if (typeof o === 'string') return o;
    if (typeof o !== 'object') return String(o);
    if (o.city) return `city:${o.city}`;
    if (o.landmarkId) return `landmark:${o.landmarkId}`;
    if (o.lm?.id) return `landmark:${o.lm.id}`;
    if (o.landmark) return `landmark:${o.landmark.id ?? o.landmark}`;
    if (o.id) return `${o.constructor?.name && o.constructor.name !== 'Object' ? o.constructor.name + ':' : ''}${o.id}`;
    if (o.name) return String(o.name);
    const k = Object.keys(o).slice(0, 2).join(',');
    return `${o.constructor?.name ?? 'obj'}{${k}}`;
  }

  /** The nearest interaction (a cart, a door, a stall) within 4 m, by its label. */
  function nearThing(x, z) {
    let best = null;
    let bd = 4;
    for (const it of game.interactions?.items ?? []) {
      let q;
      try {
        q = it.position();
      } catch {
        continue;
      }
      if (!q) continue;
      const d = Math.hypot(q.x - x, q.z - z);
      if (d < bd) {
        bd = d;
        let label = it.id;
        try {
          label = `${it.id} (${typeof it.label === 'function' ? it.label() : it.label})`;
        } catch {
          /* id only */
        }
        best = `${label} ${r1(d)} m`;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ physics probes

  /** The walking surface below `from` (game y), or null when `from` is inside a collider. */
  function surface(x, z, from) {
    const g = H(x, z);
    if (from < g) return { y: g, ny: 1, owner: 'terrain' };
    const hit = ph.raycast({ x, y: from, z }, DOWN, from - g + 1.5, WORLD);
    if (!hit) return { y: g, ny: 1, owner: 'terrain' };
    if (hit.distance < 1e-4) return null;
    return { y: Math.max(hit.point.y, g), ny: hit.normal.y, owner: hit.owner };
  }
  /** The surface a person would stand on at a street node: near the terrain, with headroom, not under water. */
  function standY(x, z) {
    const g = H(x, z);
    const water = game.water?.levelAt?.(x, z) ?? null;
    let best = null;
    let top = g + 14;
    for (let k = 0; k < 6; k++) {
      const hit = ph.raycast({ x, y: top, z }, DOWN, top - g + 1, WORLD);
      if (!hit) break;
      const y = hit.point.y;
      if (hit.distance > 1e-4 && hit.normal.y > 0.6 && !ph.raycast({ x, y: y + 0.1, z }, UP, 1.7, WORLD)) {
        const wet = water !== null && y < water - 0.3;
        const score = Math.abs(y - g) + (wet ? 50 : 0) + (y < g - 0.5 ? 20 : 0);
        if (!best || score < best.score) best = { y, score };
      }
      top = y - 0.05;
      if (top < g - 1) break;
    }
    return best ? best.y : g;
  }
  /** Heights 0.1-1.9 m above the feet: the distance to the first hit along `dir` (null = clear). */
  function aheadProfile(x, y, z, dx, dz, max = 1.5) {
    return [0.1, 0.35, 0.7, 1.0, 1.4, 1.9].map((h) => {
      const r = ph.raycast({ x, y: y + h, z }, { x: dx, y: 0, z: dz }, max, WORLD);
      return r ? r2(r.distance) : null;
    });
  }
  function firstHitOwner(x, y, z, dx, dz, max = 1.5) {
    for (const h of [1.4, 1.0, 0.7, 0.35, 0.1]) {
      const r = ph.raycast({ x, y: y + h, z }, { x: dx, y: 0, z: dz }, max, WORLD);
      if (r) return { owner: ownerName(r.owner), h, d: r2(r.distance), ny: r2(r.normal.y) };
    }
    return null;
  }

  /**
   * Check a straight walk a → b against the physics world (the lazy colliders must exist there).
   * Returns the issues along it: through (solid at chest height), low (an obstacle 0.35-1.3 m),
   * ledge (a rise the step-up does not take: clamber 0.32-0.8, mantle to 1.6, wall above), drop,
   * steep, water, inside (a point inside a collider), headroom.
   */
  function checkLine(ax, az, bx, bz, ya, opts = {}) {
    const L = Math.hypot(bx - ax, bz - az);
    const out = [];
    if (L < 0.3) return out;
    const dx = (bx - ax) / L;
    const dz = (bz - az) / L;
    const step = opts.step ?? 0.5;
    const n = Math.max(1, Math.ceil(L / step));
    const s = L / n;
    let y = ya ?? standY(ax, az);
    let run = null;
    const flush = () => {
      if (run && run.len >= (opts.minRun ?? 0.9)) out.push(run);
      run = null;
    };
    const issue = (kind, k, extra) => {
      const x = ax + dx * s * k;
      const z = az + dz * s * k;
      if (run && run.kind === kind && k - run.k1 <= 2) {
        run.k1 = k;
        run.len = r1((run.k1 - run.k0 + 1) * s);
        if (extra.value !== undefined && Math.abs(extra.value) > Math.abs(run.value ?? 0)) run.value = extra.value;
        return;
      }
      flush();
      run = { kind, k0: k, k1: k, len: r1(s), at: [r1(x), r1(y), r1(z)], along: r1(s * k), ...extra };
    };
    let slopeY = y;
    let slopeK = 0;
    for (let k = 1; k <= n; k++) {
      const px = ax + dx * s * (k - 1);
      const pz = az + dz * s * (k - 1);
      const qx = ax + dx * s * k;
      const qz = az + dz * s * k;
      const chest = ph.raycast({ x: px, y: y + 1.3, z: pz }, { x: dx, y: 0, z: dz }, s, WORLD);
      const knee = ph.raycast({ x: px, y: y + 0.5, z: pz }, { x: dx, y: 0, z: dz }, s, WORLD);
      const g = surface(qx, qz, y + 0.6);
      if (!g) {
        // The next point is inside something at knee height: find out how high it is.
        const top = surface(qx, qz, y + 2.2);
        if (!top) {
          issue('through', k, { owner: ownerName(chest?.owner ?? knee?.owner), value: 2.2 });
          continue;
        }
        const rise = top.y - y;
        issue(rise > 1.6 ? 'through' : 'ledge', k, { owner: ownerName(top.owner), value: r2(rise) });
        if (rise <= 1.6) y = top.y;
        continue;
      }
      const dh = g.y - y;
      if (chest && chest.normal.y < 0.5) {
        issue('through', k, { owner: ownerName(chest.owner), value: 1.3 });
        continue;
      }
      if (knee && knee.normal.y < 0.5 && dh < 0.5) {
        issue('low', k, { owner: ownerName(knee.owner), value: r2(dh) });
        continue;
      }
      flush();
      if (dh > 0.32) out.push({ kind: dh > 1.6 ? 'wall' : 'ledge', at: [r1(qx), r1(g.y), r1(qz)], along: r1(s * k), value: r2(dh), owner: ownerName(g.owner), len: r1(s) });
      else if (dh < -1.0) out.push({ kind: 'drop', at: [r1(qx), r1(g.y), r1(qz)], along: r1(s * k), value: r2(dh), owner: ownerName(g.owner), len: r1(s) });
      const water = game.water?.levelAt?.(qx, qz) ?? null;
      if (water !== null && g.y < water - 0.4) {
        const last = out[out.length - 1];
        if (last && last.kind === 'water' && s * k - last.along < 2) last.len = r1(s * k - last.along);
        else out.push({ kind: 'water', at: [r1(qx), r1(g.y), r1(qz)], along: r1(s * k), value: r2(water - g.y), len: r1(s) });
      }
      if (ph.raycast({ x: qx, y: g.y + 0.1, z: qz }, UP, 1.7, WORLD)) {
        const last = out[out.length - 1];
        if (!(last && last.kind === 'headroom' && s * k - last.along < 2)) out.push({ kind: 'headroom', at: [r1(qx), r1(g.y), r1(qz)], along: r1(s * k), len: r1(s) });
      }
      y = g.y;
      // Grade over 2 m windows (a stair reads as a slope too, which is fine: ~0.6).
      if ((k - slopeK) * s >= 2) {
        const grade = (y - slopeY) / ((k - slopeK) * s);
        if (Math.abs(grade) > 0.9) {
          const last = out[out.length - 1];
          if (last && last.kind === 'steep' && s * k - last.along < 3) ((last.len = r1(s * k - last.along + 2)), (last.value = r2(Math.max(last.value, Math.abs(grade)))));
          else out.push({ kind: 'steep', at: [r1(qx), r1(y), r1(qz)], along: r1(s * k), value: r2(Math.abs(grade)), deg: Math.round((Math.atan(Math.abs(grade)) * 180) / Math.PI), len: 2 });
        }
        slopeY = y;
        slopeK = k;
      }
    }
    flush();
    for (const o of out) (delete o.k0, delete o.k1);
    return out;
  }

  // ------------------------------------------------------------------ setup helpers

  function pacify() {
    try {
      if (game.dialogue?.active) game.dialogue.end?.();
      const top = game.ui?.top;
      if (top && top.id !== 'console') game.ui.closeAll?.();
      const pc = game.combat?.playerC;
      if (pc && game.combat.core.list.some((c) => c !== pc && c.status === 'active' && (c.target === pc || game.combat.core.hostile(c, pc)) && c.position.distanceTo(p.position) < 40)) game.console?.exec?.('killall');
    } catch {
      /* best effort */
    }
  }
  function release() {
    for (const k of ['KeyW', 'ShiftLeft', 'Space']) game.input.simulate(k, false);
  }
  async function settle(maxMs = 6000) {
    const t0 = performance.now();
    await frames(3);
    while (performance.now() - t0 < maxMs) {
      const urgent = game.city?.streamer?.urgent?.() ?? false;
      const grid = game.population?.grid;
      const ready = !grid || grid.ready(p.position.x, p.position.z);
      if (!urgent && ready) break;
      await frames(4);
    }
    return performance.now() - t0;
  }
  /** Teleport onto safe ground near a point and let the city and the nav grid build. */
  async function placeAt(x, z, y, loose = false) {
    const { safe } = await load();
    const near = { x, y: y ?? standY(x, z), z };
    const s = (loose ? safe.findSafeGround(game, near, { maxRadius: 5, open: 1.2, openDirs: 3, maxAboveTerrain: 3 }) : null) ?? safe.findSafeGround(game, near, { maxRadius: 24 }) ?? safe.findSafeGround(game, near, { maxRadius: 40, open: 1.5, openDirs: 4 });
    const at = s ?? { x, y: near.y + 0.3, z };
    p.teleport({ x: at.x, y: at.y + 0.05, z: at.z });
    p.velocity?.set?.(0, 0, 0);
    await settle();
    return { moved: r1(Math.hypot(at.x - x, at.z - z)), safe: !!s };
  }

  // ------------------------------------------------------------------ objectives

  const STORY = ['mq-01-madida-capena', 'mq-02-tabella', 'mq-03-lemuria', 'mq-04-columna'];

  /** Every objective with a marker, its stage set first (NPCs move by stage), in story/stage order. */
  async function objectives() {
    await load();
    const q = game.quests;
    const ids = q.all().map((d) => d.id).filter((id) => !id.startsWith('_'));
    ids.sort((a, b) => (STORY.indexOf(a) < 0 ? 99 : STORY.indexOf(a)) - (STORY.indexOf(b) < 0 ? 99 : STORY.indexOf(b)) || a.localeCompare(b));
    const out = [];
    for (const id of ids) {
      const def = q.get(id);
      for (const [sid, st] of Object.entries(def.stages)) {
        const objs = (st.objectives ?? []).filter((o) => o.target);
        if (!objs.length) continue;
        try {
          if (!q.status(id)?.running) q.start(id);
          q.setStage(id, sid);
        } catch (err) {
          out.push({ quest: id, stage: sid, error: String(err?.message ?? err) });
        }
        await sleep(250);
        pacify();
        for (const o of objs) {
          const v = q.resolveTarget(o.target);
          const cell = o.target.kind === 'location' && /^interior:([^:]+):/.test(o.target.id) ? /^interior:([^:]+):/.exec(o.target.id)[1] : v ? (game.interiors?.cellAt?.(v) ?? null) : null;
          // A location objective completes on entering its radius (the walk can stop there).
          const radius = o.target.kind === 'location' ? (game.locations?.get?.(o.target.id)?.radius ?? null) : null;
          out.push({ quest: id, stage: sid, obj: o.id, text: o.text, optional: !!o.optional, target: o.target, pos: v ? { x: r2(v.x), y: r2(v.y), z: r2(v.z) } : null, cell, radius, giver: def.giver ?? null, category: def.category });
        }
      }
      pacify();
    }
    pacify();
    return out;
  }

  // ------------------------------------------------------------------ the walker

  /**
   * Closest point of a polyline (array of {x,z}) to (x, z), searching segments lo..hi. With `y` (in a
   * cell) the height counts too, as QuestRoute does: a spiral stair's turns share their plan position.
   */
  function closestOn(pts, cum, x, z, lo = 0, hi = Infinity, y = NaN) {
    let best = { seg: 0, t: 0, d: Infinity, along: 0 };
    const a = Math.max(0, lo);
    const b = Math.min(pts.length - 2, hi);
    for (let i = a; i <= b; i++) {
      const A = pts[i];
      const B = pts[i + 1];
      const ex = B.x - A.x;
      const ez = B.z - A.z;
      const l2 = ex * ex + ez * ez;
      let t = l2 > 1e-9 ? ((x - A.x) * ex + (z - A.z) * ez) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      let d = Math.hypot(A.x + ex * t - x, A.z + ez * t - z);
      if (Number.isFinite(y) && Number.isFinite(A.y) && Number.isFinite(B.y)) d = Math.hypot(d, (A.y + (B.y - A.y) * t - y) * 1.5);
      if (d < best.d) best = { seg: i, t, d, along: cum[i] + Math.sqrt(l2) * t };
    }
    return best;
  }
  function pointAt(pts, cum, along) {
    const n = pts.length;
    if (along <= 0) return { ...pts[0], seg: 0 };
    for (let i = 0; i < n - 1; i++) {
      if (cum[i + 1] >= along) {
        const L = cum[i + 1] - cum[i];
        const t = L > 0 ? (along - cum[i]) / L : 0;
        return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y, z: pts[i].z + (pts[i + 1].z - pts[i].z) * t, seg: i };
      }
    }
    return { ...pts[n - 1], seg: n - 2 };
  }
  function cumOf(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    return cum;
  }
  function legPts(leg) {
    const out = [];
    for (let i = 0; i < leg.line.n; i++) out.push({ x: leg.line.pts[i * 3], y: leg.line.pts[i * 3 + 1], z: leg.line.pts[i * 3 + 2] });
    return out;
  }
  /** The route as the minimap draws it, rounded and thinned (for the report). */
  function snapshot(qr) {
    return qr.legs.map((l) => {
      const pts = legPts(l);
      const step = Math.max(1, Math.ceil(pts.length / 80));
      return { cell: l.cell, door: l.door, length: r1(l.line.length), n: pts.length, pts: pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((q) => [r1(q.x), r1(q.z)]) };
    });
  }

  const origSource = game.questRoute ? game.questRoute.source : null;

  /**
   * Walk one job. job = { id, start: {x, z, y?}, goal: {x, y, z, target?, cell?}, line?: [{x,z}...],
   * sprint?: true, maxSec? }. With `line` the walker follows that fixed line; else the quest route.
   */
  async function walk(job) {
    await load();
    const qr = game.questRoute;
    const res = { id: job.id, kind: job.kind, events: [], line: [], outcome: 'none', recoveries: 0, replans: 0, primes: 0 };
    const t0 = performance.now();
    release();
    pacify();
    climbs.length = 0;
    // Start: the place the player stands when the objective appears.
    if (job.startCell) {
      res.outcome = 'skipped-start-in-cell';
      return res;
    }
    const placed = await placeAt(job.start.x, job.start.z, job.start.y, !!job.line);
    if (job.setup) {
      // A stage the goal needs (the Column's door opens at mq-04 'climb').
      try {
        const q = game.quests;
        if (!q.status(job.setup.quest)?.running) q.start(job.setup.quest);
        q.setStage(job.setup.quest, job.setup.stage);
        for (const [k, v] of Object.entries(job.setup.flags ?? {})) q.flags.set(k, v);
      } catch (err) {
        res.setupError = String(err?.message ?? err);
      }
      await sleep(400);
      pacify();
    }
    res.start = P3(p.position);
    res.startMoved = placed.moved;
    res.startPlace = placeName(p.position.x, p.position.z);
    res.goalPlace = placeName(job.goal.x, job.goal.z);
    res.reach = job.reach ?? null;
    // The goal as the HUD hands it to the route (a point or a location without a height comes as
    // y = 0, which the route's arrival test, |Δy| < 3 m, then never passes on raised ground).
    // A survey goal with no height (a random street node) stands on the ground.
    const goalStand = standY(job.goal.x, job.goal.z);
    const goal = { key: `audit:${job.id}:${Math.random()}`, x: job.goal.x, y: job.goal.y ?? goalStand, z: job.goal.z, target: job.goal.target };
    let arriveY = goal.y;
    if (!job.line && Math.abs(goalStand - goal.y) > 3 && !job.goal.cell) {
      res.goalYOff = r1(goalStand - goal.y);
      arriveY = goalStand;
    }
    let fixed = null;
    if (job.line) {
      const pts = job.line.map((q) => ({ x: q.x, y: NaN, z: q.z }));
      fixed = { pts, cum: cumOf(pts) };
      res.plan = { status: 'fixed', legs: [{ cell: null, door: null, length: r1(fixed.cum[fixed.cum.length - 1]), pts: pts.map((q) => [r1(q.x), r1(q.z)]) }] };
    } else {
      if (!qr) {
        res.outcome = 'no-questRoute';
        return res;
      }
      qr.source = () => goal;
      qr.invalidate();
      const v0 = qr.version;
      const tp = performance.now();
      while (performance.now() - tp < 4000 && (qr.version === v0 || qr.status === 'none')) await frames(2);
      const grid = game.population?.grid;
      res.plan = { status: qr.status, ms: r2(qr.stats.lastMs), legs: snapshot(qr), gridAtStart: !!grid?.ready(p.position.x, p.position.z), gridAtGoal: !!grid?.ready(job.goal.x, job.goal.z), goalD: r1(Math.hypot(job.goal.x - p.position.x, job.goal.z - p.position.z)) };
      // The straight ends of the outside leg: the lead from the player onto the streets, and the
      // lead from the last street node to the goal (drawn straight when the goal's grid is not built).
      const l0 = qr.legs.find((l) => l.cell === null);
      if (l0 && l0.line.n >= 2) {
        const q = legPts(l0);
        const n = q.length;
        res.plan.leadIn = r1(Math.hypot(q[1].x - q[0].x, q[1].z - q[0].z));
        res.plan.leadOut = r1(Math.hypot(q[n - 1].x - q[n - 2].x, q[n - 1].z - q[n - 2].z));
      }
      if (qr.status === 'failed' || !qr.legs.length) {
        res.outcome = qr.status === 'arrived' ? 'arrived' : 'no-route';
        qr.source = origSource;
        return res;
      }
    }
    const expectLen = res.plan.legs.reduce((a, l) => a + l.length, 0);
    const maxSim = job.maxSec ?? Math.min(420, 25 + expectLen / 3.2);
    const simStart = simT;
    // Line state.
    let lineVer = -1;
    let pts = null;
    let cum = null;
    let seg = 0;
    let bestAlong = 0;
    let checkedTo = 0;
    let lineLeg = null;
    const lineOf = () => {
      if (fixed) return { ver: 0, pts: fixed.pts, cum: fixed.cum, leg: { door: null, cell: null } };
      const leg = qr.legs[0];
      if (!leg || !leg.line.n) return null;
      if (qr.version !== lineVer) {
        const ps = legPts(leg);
        return { ver: qr.version, pts: ps, cum: cumOf(ps), leg };
      }
      return { ver: lineVer, pts, cum, leg };
    };
    // Progress windows.
    const hist = [];
    let lastStuckAt = null;
    let stuckHere = 0;
    let swimLogged = null;
    let slideT = null;
    let fallFrom = null;
    let usedDoorAt = -10;
    let lastPrime = p.position.clone();
    /** Which part of the drawn route a segment is: the lead from the player, a street-graph link, the lead to the goal. */
    const partOf = (k) => (fixed ? 'edge' : !pts ? '?' : pts.length <= 2 ? 'direct' : k <= 0 ? 'lead-in' : k >= pts.length - 2 ? 'lead-out' : 'graph');
    const ev = (kind, extra = {}) => {
      const pos = p.position;
      const e = { kind, t: r1(simT - simStart), at: P3(pos), along: r1(bestAlong), part: partOf(seg), cls: clsAt(pos.x, pos.z), place: placeName(pos.x, pos.z), cell: game.interiors?.current?.() ?? null, ...extra };
      res.events.push(e);
      return e;
    };
    const keyW = (on) => game.input.simulate('KeyW', on);
    let sprintOn = false;
    const sprint = (on) => {
      if (on !== sprintOn) ((sprintOn = on), game.input.simulate('ShiftLeft', on));
    };
    p.walkMode = false;
    // Sprint is held, not toggled, for the walk (the owner's preset toggles it); god mode keeps the stamina.
    const pcSys = game.getSystem?.('playerController');
    const sprintMode = pcSys?.sprintMode;
    if (pcSys) pcSys.sprintMode = 'hold';
    void game.console?.exec?.('tgm on');
    let done = false;
    while (!done) {
      await frames(1);
      pacify();
      const now = simT - simStart;
      if (now > maxSim) {
        res.outcome = 'timeout';
        ev('timeout', { remaining: fixed ? null : r1(Math.hypot(job.goal.x - p.position.x, job.goal.z - p.position.z)) });
        break;
      }
      const pos = p.position;
      // The lazy city around the walker: a block next to it without its colliders yet is built now
      // (the walker runs faster than the streamer at a high time scale; a real player would not).
      if (game.city?.streamer?.urgent?.() || pos.distanceTo(lastPrime) > 40) {
        game.city.prime(pos);
        lastPrime = pos.clone();
        res.primes++;
      }
      const place = game.interiors?.current?.() ?? null;
      const ln = lineOf();
      if (!ln) {
        if (!fixed && qr.status === 'arrived') {
          res.outcome = 'arrived';
          break;
        }
        keyW(false);
        if (!fixed && performance.now() - t0 > 2000 && qr.status !== 'streets' && qr.status !== 'direct') {
          if ((res.waitNoLine = (res.waitNoLine ?? 0) + 1) > 240) {
            res.outcome = `lost-route:${qr.status}`;
            break;
          }
        }
        continue;
      }
      if (ln.ver !== lineVer) {
        if (lineVer !== -1) res.replans++;
        lineVer = ln.ver;
        pts = ln.pts;
        cum = ln.cum;
        lineLeg = ln.leg;
        seg = 0;
        const c0 = closestOn(pts, cum, pos.x, pos.z, 0, Infinity, place !== null ? pos.y : NaN);
        seg = c0.seg;
        bestAlong = c0.along;
        checkedTo = c0.along;
        hist.length = 0;
      }
      const total = cum[cum.length - 1];
      const yIn = place !== null ? pos.y : NaN;
      let c = closestOn(pts, cum, pos.x, pos.z, seg - 2, seg + 30, yIn);
      if (c.d > 6) c = closestOn(pts, cum, pos.x, pos.z, 0, Infinity, yIn);
      seg = c.seg;
      bestAlong = Math.max(bestAlong, c.along);
      // Arrived?
      const last = fixed || (qr.legs.length === 1 && !lineLeg.door);
      const endP = pts[pts.length - 1];
      const dEnd = Math.hypot(endP.x - pos.x, endP.z - pos.z);
      if (last && (fixed ? dEnd < 1.5 || c.along > total - 1.2 : qr.status === 'arrived' || (dEnd < Math.max(2.5, job.reach ?? 0) && Math.abs(arriveY - pos.y) < 3))) {
        res.outcome = 'arrived';
        break;
      }
      if (!fixed && qr.status === 'arrived') {
        res.outcome = 'arrived';
        break;
      }
      // A door at the end of this leg: use it when within reach, as a player pressing E would.
      if (!fixed && lineLeg.door && dEnd < 1.8 && now - usedDoorAt > 2) {
        keyW(false);
        sprint(false);
        const it = [...(game.interactions?.items ?? [])].find((i) => i.id === `door:${lineLeg.door}`);
        usedDoorAt = now;
        if (it && (!it.enabled || it.enabled())) {
          ev('door', { door: lineLeg.door });
          it.interact(game);
          await sleep(1800);
          await settle(3000);
        } else ev('door-unusable', { door: lineLeg.door });
        continue;
      }
      // The drawn line ahead (where the colliders exist: within ~25 m), checked once per stretch.
      if (place === null && bestAlong + 25 > checkedTo && checkedTo < total) {
        const from = Math.max(checkedTo, bestAlong);
        const to = Math.min(total, bestAlong + 25);
        if (to - from > 3 || to >= total) {
          let yA = pos.y;
          let at = from;
          while (at < to - 0.05) {
            const a = pointAt(pts, cum, at);
            const nextV = Math.min(to, cum[a.seg + 1] ?? to);
            const b = pointAt(pts, cum, nextV);
            const issues = checkLine(a.x, a.z, b.x, b.z, at === from && Math.abs(at - c.along) < 2 ? yA : standY(a.x, a.z));
            for (const iss of issues) {
              iss.routeAlong = r1(at + iss.along);
              iss.place = placeName(iss.at[0], iss.at[2]);
              iss.cls = clsAt(iss.at[0], iss.at[2]);
              iss.seg = a.seg;
              iss.part = partOf(a.seg);
              iss.segLen = r1((cum[a.seg + 1] ?? at) - cum[a.seg]);
              res.line.push(iss);
            }
            if (nextV <= at + 1e-3) break;
            at = nextV;
          }
          checkedTo = to;
        }
      }
      // Steer: a point 2 m ahead on the line (pure pursuit), never behind the best progress.
      // A shorter look-ahead in a cell (a spiral stair: 2 m ahead is across the newel).
      const tgt = pointAt(pts, cum, Math.max(c.along, bestAlong - 0.5) + (place !== null ? 0.8 : 2.0));
      const fx = tgt.x - pos.x;
      const fz = tgt.z - pos.z;
      const fl = Math.hypot(fx, fz);
      if (fl > 0.05) p.yaw = Math.atan2(-fx, -fz);
      keyW(true);
      sprint(job.sprint !== false && total - c.along > 6 && place === null);
      // Water.
      if (p.swimming) {
        if (!swimLogged || Math.hypot(pos.x - swimLogged.x, pos.z - swimLogged.z) > 15) {
          swimLogged = pos.clone();
          ev('swim', { water: r2((game.water?.levelAt?.(pos.x, pos.z) ?? pos.y) - pos.y) });
        }
      }
      // Falls: a drop of over 2.5 m (or under the terrain: through the world).
      if (p.grounded) fallFrom = pos.y;
      else if (fallFrom !== null && fallFrom - pos.y > 2.5) {
        const e = ev('drop', { height: r1(fallFrom - pos.y) });
        fallFrom = null;
        e.from = r1(e.at[1] + e.height);
      }
      if (place === null && pos.y < H(pos.x, pos.z) - 2.5) {
        ev('fell-through', { below: r1(H(pos.x, pos.z) - pos.y) });
        res.outcome = 'fell-through';
        break;
      }
      // Pushed off the line (sliding along a wall the line runs into).
      if (c.d > 3) {
        if (slideT === null) slideT = now;
        else if (now - slideT > 1.2 && !res.events.some((e) => e.kind === 'off-line' && Math.hypot(e.at[0] - pos.x, e.at[2] - pos.z) < 8)) ev('off-line', { d: r1(c.d) });
      } else slideT = null;
      // Stuck: under 0.6 m moved, or under 0.8 m of progress along the line, in 2 s.
      hist.push({ t: now, x: pos.x, z: pos.z, along: bestAlong });
      while (hist.length > 2 && hist[1].t < now - 2.0) hist.shift();
      if (hist.length < 2 || now - hist[0].t < 1.9) continue;
      const moved = Math.hypot(pos.x - hist[0].x, pos.z - hist[0].z);
      const prog = bestAlong - hist[0].along;
      if (moved > 0.6 && prog > 0.8) continue;
      // Diagnose.
      const dir = { x: fx / (fl || 1), z: fz / (fl || 1) };
      const ahead = aheadProfile(pos.x, pos.y, pos.z, dir.x, dir.z);
      const hit = firstHitOwner(pos.x, pos.y, pos.z, dir.x, dir.z);
      const ga = surface(pos.x + dir.x * 0.7, pos.z + dir.z * 0.7, pos.y + 2.0);
      const under = ph.raycast({ x: pos.x, y: pos.y + 0.3, z: pos.z }, DOWN, 1.5, WORLD);
      const npcs = ph.overlapSphere({ x: pos.x + dir.x * 0.6, y: pos.y + 1, z: pos.z + dir.z * 0.6 }, 0.6, NPC).length;
      const near = nearThing(pos.x + dir.x * 0.8, pos.z + dir.z * 0.8);
      const rise = ga ? r2(ga.y - pos.y) : null;
      const why = npcs && !hit ? 'npc' : !hit && under && under.normal.y < 0.75 ? 'steep' : hit && hit.h >= 1.0 ? 'wall' : hit ? 'low' : moved > 0.6 ? 'slide' : 'snag';
      // Would the nav grid (it knows the real colliders, once built here) know a way on? Separates a
      // stale straight lead drawn before the grid existed (a replan would fix it) from a goal walled in.
      const grid = game.population?.grid;
      let gridInfo = null;
      if (grid) {
        const gx = job.goal.x;
        const gz = job.goal.z;
        const gd = Math.hypot(gx - pos.x, gz - pos.z);
        gridInfo = { here: grid.ready(pos.x, pos.z), goal: grid.ready(gx, gz), goalD: r1(gd), goalReach: grid.ready(gx, gz) ? grid.reachable(gx, gz) : null };
        if (gridInfo.here && gridInfo.goal && gd < 90 && !fixed) {
          const gp = grid.findPath(pos.x, pos.z, gx, gz, 7000);
          gridInfo.path = gp ? r1(gp.reduce((a, q, i) => a + Math.hypot(q.x - (i ? gp[i - 1].x : pos.x), q.z - (i ? gp[i - 1].z : pos.z)), 0)) : null;
        }
      }
      // A jump (Space: jump or mantle) as a player would try.
      keyW(true);
      game.input.simulate('Space', true);
      await sleep(80);
      game.input.simulate('Space', false);
      const tj = simT;
      const a0 = bestAlong;
      while (simT - tj < 1.0) await frames(1);
      let c2 = closestOn(pts, cum, p.position.x, p.position.z, 0, Infinity, place !== null ? p.position.y : NaN);
      const jumped = c2.along - a0 > 1.0 && c2.d < 4;
      const sameSpot = lastStuckAt && Math.hypot(lastStuckAt.x - pos.x, lastStuckAt.z - pos.z) < 3;
      const e = ev(jumped ? 'jump' : 'blocked', { why, ahead, hit, rise, slope: under ? r2(Math.acos(Math.min(1, under.normal.y)) * 57.3) : null, lineD: r1(c.d), seg: c.seg, npcs, near, moved: r2(moved), progress: r2(prog), grid: gridInfo, routeVer: fixed ? null : qr.version, climbs: climbs.filter((k) => k.t > simT - 4).map((k) => `${k.kind} ${r2(k.height)}`) });
      hist.length = 0;
      if (jumped) continue;
      stuckHere = sameSpot ? stuckHere + 1 : 0;
      lastStuckAt = pos.clone();
      // Recover: put the walker on the line beyond the obstacle (the next standable point 3-40 m on).
      res.recoveries++;
      if (res.recoveries > 12) {
        res.outcome = 'aborted';
        break;
      }
      const { safe } = await load();
      let put = null;
      if (place !== null) {
        // In a cell: the next point of the cell's route (never safe ground: that is outside).
        const q = pointAt(pts, cum, Math.min(total, Math.max(c.along, bestAlong) + 3 + stuckHere * 3));
        put = { x: q.x, y: (Number.isFinite(q.y) ? q.y : pos.y) + 0.25, z: q.z };
        e.skip = 'cell';
      }
      for (let d = 3 + stuckHere * 3; d <= 45 && !put; d += 1.5) {
        const q = pointAt(pts, cum, Math.max(c.along, bestAlong) + d);
        const y0 = standY(q.x, q.z);
        game.city.prime({ x: q.x, y: y0, z: q.z });
        ph.step(1e-4);
        put = safe.standableAt(game, q.x, q.z, y0, { open: 1, openDirs: 3, maxAboveTerrain: 3 });
        if (put) e.skip = r1(d);
        if (Math.max(c.along, bestAlong) + d >= total) break;
      }
      if (!put) {
        const q = pointAt(pts, cum, Math.min(total, Math.max(c.along, bestAlong) + 8));
        put = safe.findSafeGround(game, { x: q.x, y: standY(q.x, q.z), z: q.z }, { maxRadius: 12 });
        e.skip = 'safe';
      }
      if (!put) {
        res.outcome = 'aborted';
        break;
      }
      release();
      sprintOn = false;
      p.teleport({ x: put.x, y: put.y + 0.05, z: put.z });
      await settle(2500);
      c2 = closestOn(pts, cum, p.position.x, p.position.z, 0, Infinity, place !== null ? p.position.y : NaN);
      bestAlong = Math.max(bestAlong, c2.along);
      seg = c2.seg;
      fallFrom = null;
    }
    release();
    if (pcSys) pcSys.sprintMode = sprintMode;
    res.climbs = climbs.slice(0, 30).map((k) => ({ ...k, t: r1(k.t - simStart) }));
    res.simSec = r1(simT - simStart);
    res.realSec = r1((performance.now() - t0) / 1000);
    res.end = P3(p.position);
    res.endD = r1(Math.hypot(job.goal.x - p.position.x, job.goal.z - p.position.z));
    const gridEnd = game.population?.grid;
    if (gridEnd && gridEnd.ready(job.goal.x, job.goal.z)) res.goalGrid = { reachable: gridEnd.reachable(job.goal.x, job.goal.z), floor: gridEnd.floorAt(job.goal.x, job.goal.z) };
    if (!fixed) {
      res.finalStatus = qr.status;
      qr.source = origSource;
    }
    return res;
  }

  // ------------------------------------------------------------------ the static sweep of every edge

  /**
   * Every street-graph edge, tile by tile: teleport into the tile (the lazy colliders appear), then
   * checkLine along the edge as the maps draw it. Options: tile (m), only (tile keys), max tiles.
   */
  async function edgeSweep(opts = {}) {
    await load();
    const st = game.streets;
    const T = opts.tile ?? 60;
    const tiles = new Map();
    st.edges.forEach((e, i) => {
      const a = st.nodes[e[0]];
      const b = st.nodes[e[1]];
      const k = `${Math.floor((a.x + b.x) / 2 / T)},${Math.floor((a.z + b.z) / 2 / T)}`;
      (tiles.get(k) ?? tiles.set(k, []).get(k)).push(i);
    });
    const keys = [...tiles.keys()].sort();
    const out = { tiles: keys.length, edges: st.edges.length, checked: 0, length: 0, issues: [], perKind: {}, edgeBad: 0, tileMs: [] };
    const maxT = opts.max ?? Infinity;
    let done = 0;
    const startAt = opts.from ?? 0;
    for (let ti = startAt; ti < keys.length && done < maxT; ti++, done++) {
      const k = keys[ti];
      const [tx, tz] = k.split(',').map(Number);
      const cx = (tx + 0.5) * T;
      const cz = (tz + 0.5) * T;
      const t0 = performance.now();
      const y0 = standY(cx, cz);
      p.teleport({ x: cx, y: y0 + 60, z: cz });
      p.velocity?.set?.(0, 0, 0);
      await frames(2);
      game.city.prime({ x: cx, y: y0, z: cz });
      ph.step(1e-4);
      for (const i of tiles.get(k)) {
        const [ia, ib] = st.edges[i];
        const a = st.nodes[ia];
        const b = st.nodes[ib];
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        out.checked++;
        out.length += L;
        const issues = checkLine(a.x, a.z, b.x, b.z, undefined, { step: 0.5 });
        if (issues.length) out.edgeBad++;
        for (const iss of issues) {
          out.perKind[iss.kind] = (out.perKind[iss.kind] ?? 0) + 1;
          iss.edge = i;
          iss.nodes = [ia, ib];
          iss.kinds = [a.kind, b.kind];
          iss.edgeLen = r1(L);
          iss.cls = clsAt(iss.at[0], iss.at[2]);
          out.issues.push(iss);
        }
      }
      out.tileMs.push(Math.round(performance.now() - t0));
      if (opts.progress && done % 25 === 0) console.info(`[routeAudit] sweep tile ${ti}/${keys.length} issues ${out.issues.length}`);
    }
    out.next = startAt + done;
    // Name the places (cheaply, at the end).
    for (const iss of out.issues) iss.place = placeName(iss.at[0], iss.at[2]);
    out.length = Math.round(out.length);
    return out;
  }

  // ------------------------------------------------------------------ the graph, for job building

  function info() {
    const st = game.streets;
    const comps = st.components();
    const comp = new Int32Array(st.nodes.length).fill(-1);
    comps.forEach((c, i) => c.forEach((n) => (comp[n] = i)));
    return { nodes: st.nodes.length, edges: st.edges.length, components: comps.map((c) => c.length).slice(0, 30), componentCount: comps.length, termini: st.termini.length, crowd: !!game.population, grid: !!game.population?.grid };
  }
  /** Nodes (index, x, z, kind, component) for the driver to sample from. */
  function nodes() {
    const st = game.streets;
    const comps = st.components();
    const comp = new Int32Array(st.nodes.length).fill(-1);
    comps.forEach((c, i) => c.forEach((n) => (comp[n] = i)));
    return st.nodes.map((n, i) => [i, r1(n.x), r1(n.z), n.kind, comp[i]]);
  }
  function edges() {
    return game.streets.edges.map((e) => [e[0], e[1], r1(e[2])]);
  }
  function landmarks() {
    return [...(game.landmarks?.values?.() ?? [])].map((pl) => ({ id: pl.lm.id, name: pl.lm.name, x: r1(pl.position.x), y: r1(pl.position.y), z: r1(pl.position.z) }));
  }

  // ------------------------------------------------------------------ framing a place for a screenshot

  let rigOff = null;
  /**
   * Stand the player at `from` with the quest route to `goal` live (the gold trail on the ground on,
   * the minimap showing the red route) and frame `at`: 'view' is the player's third-person view
   * toward it with the HUD; 'over' lifts a free camera 13 m above and 9 m behind, HUD hidden; 'map'
   * opens the big map centred on it (`mapScale` px per metre) with the route on it.
   */
  async function frame(o) {
    game.timeScale = 1;
    release();
    if (rigOff) {
      game.addSystem(rigOff);
      rigOff = null;
    }
    game.settings.data.routeInWorld = true;
    const qr = game.questRoute;
    const plan = async () => {
      const g = { key: `shot:${Math.random()}`, x: o.goal.x, y: o.goal.y ?? standY(o.goal.x, o.goal.z), z: o.goal.z, target: o.goal.target };
      qr.source = () => g;
      qr.invalidate();
      const v0 = qr.version;
      const t = performance.now();
      while (performance.now() - t < 3000 && qr.version === v0) await frames(2);
    };
    if (o.keep) {
      // The previous frame's player and route stay (only the camera moves).
    } else if (o.planFrom && o.goal && qr) {
      // The route as the walker had it: planned where the walk began (far off, before the nav grid
      // near the goal existed), then the player put on that line short of the spot. The route only
      // replans when the player strays 9 m from it, so it stays as it was drawn.
      await placeAt(o.planFrom.x, o.planFrom.z, undefined, true);
      await plan();
      await placeAt(o.from.x, o.from.z, undefined, true);
      await sleep(400);
    } else {
      await placeAt(o.from.x, o.from.z, undefined, true);
      if (o.goal && qr) await plan();
    }
    const pos = p.position;
    const ax = o.at.x - pos.x;
    const az = o.at.z - pos.z;
    p.yaw = Math.atan2(-ax, -az);
    p.pitch = -0.2;
    p.zoom = 4.5;
    p.setViewMode?.('third');
    const ui = document.querySelector('.ui-root');
    if (ui) ui.style.visibility = o.mode === 'over' ? 'hidden' : 'visible';
    game.ui?.closeAll?.();
    await sleep(900);
    if (o.mode === 'map') {
      // The big map (M) centred on the place, the route as drawn on it ("Your route").
      const shell = game.ui?.openMenu?.('map');
      await sleep(500);
      const r = shell?.tabs?.get?.('map')?.renderer;
      r?.centerOn?.(o.at.x, o.at.z, o.mapScale ?? 2.4);
      game.invalidate?.();
      await sleep(900);
      return { player: P3(p.position), route: qr?.status, version: qr?.version, along: qr ? r1(qr.along) : null, map: !!r };
    }
    if (o.mode === 'over') {
      const rig = game.getSystem('cameraRig');
      if (rig) {
        game.removeSystem(rig);
        rigOff = rig;
      }
      const L = Math.hypot(ax, az) || 1;
      const ay = o.at.y ?? standY(o.at.x, o.at.z);
      game.camera.position.set(o.at.x - (ax / L) * 9, ay + 13, o.at.z - (az / L) * 9);
      game.camera.lookAt(o.at.x, ay, o.at.z);
      game.camera.updateMatrixWorld();
      game.world?.refreshAll?.();
      game.invalidate?.();
    }
    await sleep(900);
    return { player: P3(p.position), route: qr?.status, version: qr?.version, along: qr ? r1(qr.along) : null };
  }
  function unframe() {
    game.ui?.closeAll?.();
    if (rigOff) {
      game.addSystem(rigOff);
      rigOff = null;
    }
    const ui = document.querySelector('.ui-root');
    if (ui) ui.style.visibility = 'visible';
    if (game.questRoute) game.questRoute.source = origSource;
  }

  window.__routeAudit = { frame, unframe, info, objectives, walk, edgeSweep, checkLine, nodes, edges, landmarks, placeName, standY, pacify, placeAt, settle, simTime: () => simT, load };
})();
