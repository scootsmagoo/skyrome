/**
 * The golden-path bot (AC-15), run IN THE PAGE by scripts/golden-path.mjs. It plays Act I's
 * chapters (docs/STORY.md: the gate, the tablet, the Lemuria, the dedication) the way a player would:
 * follows the tracked objective's marker on foot, talks to the NPC it names and picks dialogue
 * choices, fights whoever attacks it, uses what the objective points at (a strongbox, a clue, the
 * seal on the Column's door, a door), and waits (T) when a stage needs the evening, midnight or first
 * light. Inside a cell (the Column's stair and platform) it walks the cell's route (game.interiors
 * routeWorld) instead of the nav paths, which do not exist underground. God mode is on (`tgm`): it
 * tests the content, not its own swordplay.
 *
 * Everything that would stop a player is logged in window.__gp: `snags` (a walk that jams, a
 * marker that can't be resolved, an NPC who isn't where the marker says, an objective that doesn't
 * complete on arrival) and `errors`. A jammed walk teleports ahead so the run goes on.
 */
(() => {
  const game = window.__skyrome.game;
  const p = game.player;
  const MQ04 = 'mq-04-columna';
  const BITUS = 'npc-bitus';
  const QUESTS = ['mq-01-madida-capena', 'mq-02-tabella', 'mq-03-lemuria', MQ04];
  const L = (window.__gp = { t0: performance.now(), events: [], snags: [], errors: [], talks: [], done: false, goal: null, walked: 0, teleports: 0, fights: 0 });
  const at = () => +((performance.now() - L.t0) / 1000).toFixed(1);
  const log = (...a) => L.events.push([at(), ...a]);
  const snag = (kind, detail) => {
    const pos = [p.position.x, p.position.y, p.position.z].map((v) => Math.round(v));
    L.snags.push({ t: at(), kind, detail, pos, goal: L.goal ? `${L.goal.quest}/${L.goal.obj}` : null });
  };
  const ev = game.events;
  ev.on('quest:started', (e) => log('started', e.questId));
  ev.on('quest:stage', (e) => log('stage', e.questId, e.stage));
  ev.on('quest:completed', (e) => log('completed', e.questId));
  ev.on('quest:failed', (e) => log('FAILED', e.questId));
  ev.on('ui:notify', (e) => log('notify', String(e.text).slice(0, 100)));
  ev.on('actor:killed', (e) => log('down', e.victimId, (e.tags ?? []).join(',')));
  ev.on('actor:yielded', (e) => log('yield', e.actorId));
  ev.on('combat:yieldChoice', (e) => log('yield choice', e.actorId, e.choice));
  // The talks' closing nodes (Gratus's postEnd, Bitus's bitusEnd, Pudens's summonsEnd) are logged as they fire.
  ev.on('dialogue:node', (e) => /End$/.test(e.nodeId ?? '') && log('node', e.dialogueId, e.nodeId));
  ev.on('interior:entered', (e) => log('cell in', e.id));
  ev.on('interior:exited', (e) => log('cell out', e.id));
  ev.on('crime:committed', (e) => log('CRIME', e.crime ?? e.id ?? JSON.stringify(e).slice(0, 60)));
  window.addEventListener('error', (e) => L.errors.push(String(e.message)));
  void game.console?.exec('tgm on');

  const keys = new Set();
  const hold = (code, down) => {
    if (down && !keys.has(code)) (keys.add(code), game.input.simulate(code, true));
    if (!down && keys.has(code)) (keys.delete(code), game.input.simulate(code, false));
  };
  const tap = (code) => {
    game.input.simulate(code, true);
    setTimeout(() => game.input.simulate(code, false), 60);
  };
  const face = (x, z) => (p.yaw = Math.atan2(-(x - p.position.x), -(z - p.position.z)));
  const dist = (a) => Math.hypot(a.x - p.position.x, a.z - p.position.z);
  /** Distance in three dimensions (the stair's turns share their plan positions, so 2D is not enough inside a cell). */
  const reach3 = (a) => Math.hypot(a.x - p.position.x, (a.y ?? p.position.y) - p.position.y, a.z - p.position.z);
  /** The cell the player's feet are in (InteriorSystem), or null outside. */
  const inCell = () => game.interiors?.current?.() ?? null;
  const stageOf = (id) => game.quests.status(id)?.stage ?? '';

  // ------------------------------------------------------------------ goals

  /** A goal's marker: the quest's own resolver, then the combat side for a foe who is not an actor yet. */
  function goalOf(quest, obj, text, target) {
    let pos = game.quests.resolveTarget(target);
    if (!pos && target.kind === 'npc') pos = game.combat?.core?.get?.(target.id)?.position ?? null;
    return { quest, obj, text, target, pos };
  }

  /** The first required, active objective of the golden-path quests (in quest order). */
  function nextGoal() {
    for (const id of QUESTS) {
      if (!game.quests.status(id)?.running) continue;
      for (const o of game.quests.objectives(id)) {
        if (!o.active || o.done || o.optional || !o.target) continue;
        return goalOf(id, o.id, o.text, o.target);
      }
      // Every required objective is done but the stage has not moved on: Bitus is dead and the
      // player is still on the platform. Leaving by the stair is what moves it on (the search is optional).
      if (id === MQ04 && stageOf(id) === 'archer' && inCell() === 'columna-summa') {
        const door = doorItem('door:columna-summa:down');
        return { quest: id, obj: 'leave', text: 'Go down the stair', target: { kind: 'location', id: 'column-door' }, pos: door?.position() ?? null };
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ dialogue

  const AVOID = /attack|threat|insult|bribe|steal|lie\b|draw your|strike|iugula|kill/i;
  const LEAVE = /goodbye|farewell|leave|later|vale|nothing|never mind|that is all|go on my way|walk away/i;
  const WANT = /gratus|tablet|ready|begin|sign|guest|scutum|spare|mitte|curved|blade|mus\b|fight|bout|missio|deliver|here is|take it|courier|festus|strongroom|scutarii|murmill|join|side|yes|again/i;
  const visited = new Set();
  let talkT = 0;
  let lastDialogue = null;
  function stepDialogue() {
    const d = game.dialogue;
    const v = d.view;
    if (!v) return;
    if (performance.now() - talkT < 350) return;
    talkT = performance.now();
    const key = `${v.dialogueId}/${v.nodeId}`;
    // The auto-opened talks (Gratus's wounded talk, Bitus's end) are logged by name, so the run shows they were driven.
    if (v.dialogueId !== lastDialogue) (lastDialogue = v.dialogueId), log('dialogue', v.dialogueId);
    if (!v.choices.length) {
      L.talks.push(key);
      d.advance();
      return;
    }
    const opts = v.choices.map((c, i) => ({ i, c, seen: visited.has(`${key}#${i}`) })).filter((o) => o.c.enabled !== false);
    const score = (o) => (AVOID.test(o.c.text) ? 100 : 0) + (LEAVE.test(o.c.text) ? 50 : 0) + (o.seen ? 20 : 0) - (WANT.test(o.c.text) ? 10 : 0) + o.i * 0.1;
    opts.sort((a, b) => score(a) - score(b));
    const pick = opts[0];
    if (!pick) return void d.end();
    visited.add(`${key}#${pick.i}`);
    L.talks.push(`${key} → ${pick.c.text.slice(0, 40)}`);
    d.choose(pick.i);
  }

  /** The yield decision over Bitus (CombatSystem.openYieldChoice, a ChoiceView in a DialoguePanel): spare him. */
  let choiceT = 0;
  function stepChoice(panel) {
    const view = panel.view;
    if (view.ended) return void game.ui.close(panel);
    if (performance.now() - choiceT < 350) return;
    choiceT = performance.now();
    const i = view.choices.findIndex((c) => !c.disabled && /spare|mitte/i.test(c.text));
    if (i < 0) {
      snag('yield choice without Spare', view.choices.map((c) => c.text).join(' | '));
      return void view.end();
    }
    L.talks.push(`${view.npcId} → ${view.choices[i].text.slice(0, 40)}`);
    view.choose(i);
  }
  /** Bitus kneeling with no decision panel open (the 1.2 s delay ran out while a dialogue was open): open it. */
  function yieldedBitus() {
    if (stageOf(MQ04) !== 'archer') return null;
    const c = game.combat?.core?.get?.(BITUS);
    return c && c.status === 'yielded' ? c : null;
  }

  // ------------------------------------------------------------------ fights

  function foes() {
    const core = game.combat?.core;
    const pc = game.combat?.playerC;
    if (!core || !pc) return [];
    // A player goes after the quest's own foes too (the brawl's rivals), not only whoever attacks.
    const questFoe = (c) => !!L.goal && (c.tags ?? []).includes(L.goal.quest) && !(c.tags ?? []).includes('rixa-ally');
    // Inside a cell the stair's other floors are out of reach: only foes within 2 m up or down.
    const cell = inCell();
    const floor = (c) => !cell || Math.abs(c.position.y - p.position.y) < 2;
    // A foe the player spared is on the player's side again (CombatCore.decideYielded: team 'spared:<id>'): no swings at him.
    const spared = (c) => String(c.team ?? '').startsWith('spared');
    return core.list.filter((c) => c !== pc && c.status === 'active' && !spared(c) && (c.target === pc || core.hostile(c, pc) || questFoe(c)) && dist(c.position) < 25 && floor(c));
  }
  let swingT = 0;
  function fightStep(list) {
    const pc = game.combat.playerC;
    const t = list.sort((a, b) => dist(a.position) - dist(b.position))[0];
    face(t.position.x, t.position.z);
    const d = dist(t.position);
    hold('KeyW', d > 2.2);
    hold('ShiftLeft', false);
    // A brawl is fought with fists (drawing a blade turns it into assault): never draw then.
    if (!pc.drawn && !pc.brawl && performance.now() - swingT > 900) {
      tap('KeyR');
      swingT = performance.now();
      return;
    }
    if (d < 2.6 && performance.now() - swingT > 380) {
      tap('KeyF');
      swingT = performance.now();
    }
    // Caught in a net: struggle.
    if (pc.entangled?.(game.combat.core.now)) tap('KeyE');
  }

  // ------------------------------------------------------------------ walking

  let path = null;
  let pathFor = '';
  let lastPos = p.position.clone();
  let stillFor = 0;
  let progressT = performance.now();
  let progressBest = Infinity;
  let arrivedAt = 0;
  let jamFrom = null;
  let pathAt = 0;
  let pathLed = false;
  /** Walk the nav path to goal.pos (outside any cell). */
  function walkTo(goal) {
    const target = goal.pos;
    const key = `${goal.quest}/${goal.obj}/${Math.round(target.x)},${Math.round(target.z)}`;
    const nav = game.population?.nav;
    // A path made while the nav grid was still being sampled (just after a teleport or a long walk) is the street graph's
    // straight links, which cut corners and clip buildings: plan again, from here, once the grid knows the ground.
    const stale = pathFor === key && !pathLed && nav?.gridReady?.(p.position.x, p.position.z) && performance.now() - pathAt > 1500;
    if (key !== pathFor || !path || !path.length || stale) {
      const r = nav?.findPath(p.position.x, p.position.z, target.x, target.z);
      path = Array.isArray(r) ? r.slice() : [{ x: target.x, z: target.z }];
      pathFor = key;
      pathAt = performance.now();
      pathLed = !!nav?.gridReady?.(p.position.x, p.position.z);
    }
    follow(target, 1.5, () => teleportToward(target));
  }
  /**
   * Inside a cell: the cell's route is the only way. From the route point nearest the player to the
   * route point nearest the target (walking up or down the stair), then straight to the target.
   */
  function walkCell(cell, target, key) {
    const route = game.interiors?.routeWorld?.(cell) ?? [];
    if (key !== pathFor || !path || !path.length) {
      if (!route.length) path = [{ x: target.x, y: target.y, z: target.z }];
      else {
        const i = nearest(route, p.position);
        const j = nearest(route, target);
        const seq = i <= j ? route.slice(i, j + 1) : route.slice(j, i + 1).reverse();
        path = [...seq, target].map((v) => ({ x: v.x, y: v.y, z: v.z }));
      }
      pathFor = key;
    }
    follow(target, 0.7, () => teleportInCell(path[Math.min(1, path.length - 1)] ?? target));
  }
  function nearest(list, v) {
    let best = 0;
    let bd = Infinity;
    list.forEach((w, k) => {
      const d = (w.x - v.x) ** 2 + (w.y - v.y) ** 2 + (w.z - v.z) ** 2;
      if (d < bd) ((bd = d), (best = k));
    });
    return best;
  }
  /**
   * A player steers round a stall or a corner the street graph's straight links cut; so does the bot: when the
   * next waypoint is not in a straight walkable line from here (the NavGrid knows the colliders), lead through the
   * grid to it (A*, as the crowd does). At most twice a second; outside cells only.
   */
  let steerT = 0;
  function steerAround(pts) {
    const grid = game.population?.nav?.grid;
    if (!grid || inCell() || !pts.length || performance.now() - steerT < 500) return;
    const c = pts[0];
    if (dist(c) > 70 || !grid.ready(p.position.x, p.position.z) || !grid.ready(c.x, c.z)) return;
    steerT = performance.now();
    if (grid.lineWalkable(p.position.x, p.position.z, c.x, c.z)) return;
    const lead = grid.findPath(p.position.x, p.position.z, c.x, c.z, 4000);
    if (lead && lead.length) pts.unshift(...lead.filter((q) => Math.hypot(q.x - c.x, q.z - c.z) > 0.5));
  }
  /** Face the next point of the path (popping those within `pop` m), hold W, and handle a jam. */
  function follow(target, pop, unstuck) {
    // Inside a cell a route point on another floor shares its plan position: pop only within 1.5 m of the player's height.
    const reached = (w) => dist(w) < pop && (!inCell() || Math.abs((w.y ?? p.position.y) - p.position.y) < 1.5);
    while (path.length > 1 && reached(path[0])) path.shift();
    steerAround(path);
    const c = path[0] ?? target;
    face(c.x, c.z);
    const far = dist(target);
    hold('KeyW', true);
    hold('ShiftLeft', far > 25);
    // A jam: under 1.5 m of movement in 8 s while trying to walk (a path's detour still moves).
    if (!jamFrom || Math.hypot(p.position.x - jamFrom.x, p.position.z - jamFrom.z) > 1.5) {
      jamFrom = p.position.clone();
      progressT = performance.now();
    }
    if (performance.now() - progressT > 8000) {
      // What stands in the way: rays toward the next waypoint at foot, knee, waist and head, the floor under the feet.
      const fx = c.x - p.position.x;
      const fz = c.z - p.position.z;
      const fl = Math.hypot(fx, fz) || 1;
      const ahead = [0.08, 0.3, 0.7, 1.4].map((h) => {
        const r = game.physics.raycast({ x: p.position.x, y: p.position.y + h, z: p.position.z }, { x: fx / fl, y: 0, z: fz / fl }, 3, 1);
        return r ? +r.distance.toFixed(2) : '-';
      });
      const diag = `wp ${Math.round(c.x)},${Math.round(c.z)} ${fl.toFixed(1)}m ahead[${ahead.join(' ')}] grounded=${p.grounded}`;
      snag('stuck', `${Math.round(far)} m from ${L.goal?.text ?? 'the marker'} :: ${diag}`);
      unstuck();
    }
    void progressBest;
    L.walked += Math.hypot(p.position.x - lastPos.x, p.position.z - lastPos.z);
    lastPos = p.position.clone();
  }
  function resetProgress() {
    jamFrom = null;
    progressBest = Infinity;
    progressT = performance.now();
    path = null;
  }
  function teleportToward(target) {
    L.teleports++;
    const d = dist(target);
    const k = Math.min(1, 25 / Math.max(1, d));
    const x = p.position.x + (target.x - p.position.x) * (d < 30 ? 1 : k);
    const z = p.position.z + (target.z - p.position.z) * (d < 30 ? 1 : k);
    const g = game.population?.nav?.snap?.(x, z, 8) ?? { x, z };
    const y = game.heightmap?.heightAt(g.x, g.z) ?? p.position.y;
    p.teleport({ x: g.x, y: y + 0.5, z: g.z });
    resetProgress();
  }
  /** Put the player 5 m out from a place's centre, on the side they stand on (a walkable point by the nav snap). */
  function stepAway(from) {
    let dx = p.position.x - from.x;
    let dz = p.position.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) (dx = 1), (dz = 0);
    else (dx /= len), (dz /= len);
    const x = from.x + dx * 5;
    const z = from.z + dz * 5;
    const g = game.population?.nav?.snap?.(x, z, 8) ?? { x, z };
    const y = game.heightmap?.heightAt(g.x, g.z) ?? p.position.y;
    L.teleports++;
    p.teleport({ x: g.x, y: y + 0.5, z: g.z });
    resetProgress();
  }
  /** Inside a cell a jam moves the player to the next route point (the nav snap does not exist there). */
  function teleportInCell(wp) {
    L.teleports++;
    p.teleport({ x: wp.x, y: (wp.y ?? p.position.y) + 0.3, z: wp.z });
    resetProgress();
  }

  // ------------------------------------------------------------------ doors and examines

  const doorItem = (id) => [...(game.interactions?.items ?? [])].find((i) => i.id === id) ?? null;
  /** A usable door interaction (in reach-or-walkable: its point is known and it is enabled). */
  function usableDoor(id) {
    const it = doorItem(id);
    if (!it || (it.enabled && !it.enabled())) return null;
    const dp = it.position();
    return dp && dp.y > -1000 ? it : null;
  }
  /**
   * The door a goal needs: the Column's bronze door from the court (the climb's 'door' objective), the
   * stair's door out (any marker outside the stair), the hatch up (the top of the stair), and the
   * platform's door down (any marker outside the platform). Null: the goal walks to its own marker.
   */
  function doorFor(goal, cell) {
    if (goal.quest !== MQ04) return null;
    const outside = goal.target.kind === 'location' && !String(goal.target.id).startsWith('interior:');
    if (cell === 'columna-summa') return outside ? 'door:columna-summa:down' : null;
    if (cell === 'dun-columna') {
      if (goal.target.id === 'interior:dun-columna:top') return 'door:dun-columna:up';
      return outside ? 'door:dun-columna:out' : null;
    }
    if (!cell && goal.obj === 'door') return 'door:dun-columna:in';
    return null;
  }
  /** Walk to a door and use it when within reach (the door's own reach is 1.8 m; the bot stops at 1.2 m). */
  function walkDoor(goal, cell, it) {
    const dp = it.position();
    if (reach3(dp) < 1.2) {
      hold('KeyW', false);
      hold('ShiftLeft', false);
      if (performance.now() - (L.usedAt ?? 0) > 1500) {
        L.usedAt = performance.now();
        log('door', it.id);
        it.interact(game);
      }
      return;
    }
    if (cell) return walkCell(cell, { x: dp.x, y: dp.y, z: dp.z }, `door/${cell}/${it.id}`);
    return walkTo({ ...goal, pos: { x: dp.x, z: dp.z } });
  }
  /** Use the nearest interaction whose id matches, if it is within reach (a seal, a strongbox, a clue). */
  function useNear(match, reach) {
    const it = [...(game.interactions?.items ?? [])].find((i) => match.test(i.id) && (!i.enabled || i.enabled()) && dist(i.position()) < reach);
    if (!it) return false;
    hold('KeyW', false);
    if (performance.now() - (L.usedAt ?? 0) > 1500) {
      L.usedAt = performance.now();
      log('use', it.label());
      it.interact(game);
    }
    return true;
  }

  // ------------------------------------------------------------------ the loop

  let lastGoalKey = '';
  let talkedTo = new Map();
  let idleFor = 0;
  const dusk = 19.4;
  let waitAgainAt = 0;
  let waitRefused = 0;
  let lastCell = null;
  let bitusWaitT = 0;
  /** Spared Bitus is still on the platform (his talk, bitusEnd, opens 1.2 s after the choice; takeBitusDown removes him). */
  const bitusHere = () => {
    const c = game.combat?.core?.get?.(BITUS);
    return !!c && (c.status === 'yielded' || String(c.team ?? '').startsWith('spared'));
  };
  L.timer = setInterval(() => {
    try {
      if (L.done) return;
      if (game.dialogue?.active) {
        hold('KeyW', false);
        hold('ShiftLeft', false);
        return stepDialogue();
      }
      // Bitus's yield decision: its panel is not closed by the menu sweep below until it is answered.
      const top = game.ui?.top;
      if (top?.id === 'dialogue' && top.view && (top.view.npcId ?? '').split('~')[0] === BITUS) {
        hold('KeyW', false);
        return stepChoice(top);
      }
      if (!top && yieldedBitus()) {
        hold('KeyW', false);
        if (performance.now() - choiceT > 1500) {
          choiceT = performance.now();
          game.combat.openYieldChoice(yieldedBitus());
        }
        return;
      }
      // Close any menu a notice or a level-up opened.
      if (top && top.id !== 'console') game.ui?.closeAll?.();
      const list = foes();
      if (list.length) {
        if (!L.inFight) (L.inFight = true), L.fights++, log('fight', list.map((c) => c.id).join(','));
        return fightStep(list);
      }
      if (L.inFight) {
        L.inFight = false;
        resetProgress();
        hold('KeyW', false);
      }
      const cell = inCell();
      if (cell !== lastCell) {
        lastCell = cell;
        log('cell', cell ?? 'outside');
        resetProgress();
      }
      const all = QUESTS.map((id) => game.quests.status(id));
      if (all.every((s) => s?.done)) {
        L.done = true;
        hold('KeyW', false);
        hold('ShiftLeft', false);
        log('ALL DONE');
        return;
      }
      // Spared Bitus's own talk (bitusEnd) opens on the platform 1.2 s after the choice. The bot waits up to 5 s
      // for it, as a player who stays would, before the walk to the stair (which takes him down).
      if (stageOf(MQ04) === 'aftermath' && cell === 'columna-summa' && !game.dialogue?.active && bitusHere()) {
        hold('KeyW', false);
        hold('ShiftLeft', false);
        if (!bitusWaitT) (bitusWaitT = performance.now()), log('wait for Bitus talk');
        if (performance.now() - bitusWaitT < 5000) return;
      }
      const goal = nextGoal();
      // Waits the story asks for: Gratus takes the tablet after sunset (mq-02 'give'); the rite
      // is at midnight (mq-03 'wait', at the Marii's door); the Column's dedication needs first light
      // (mq-04 'forum', before 05:30 or after 20:00) and the ceremony the hour from 06:00 (mq-04 'post').
      const h = game.time.hour;
      let until = goal?.obj === 'give' && h < dusk && h > 5 ? dusk : goal?.obj === 'wait' && goal.pos && dist(goal.pos) < 8 && h < 23.6 && h > 5 ? 23.7 : null;
      if (goal && until === null && goal.quest === MQ04) {
        if (goal.obj === 'forum' && (h < 5.5 || h >= 20)) until = h >= 20 ? 30 : 6;
        else if (goal.obj === 'post' && h < 6 && goal.pos && dist(goal.pos) < 8) until = 6;
      }
      if (goal && until !== null) {
        hold('KeyW', false);
        if (performance.now() < waitAgainAt) return;
        const hours = Math.ceil(until - h);
        const r = game.ui?.sources?.wait?.(hours);
        // Refused (just after a fight the player still counts as in combat for a few seconds): retry.
        if (typeof r === 'string') {
          if (!waitRefused) log('wait refused', r);
          waitRefused++;
          waitAgainAt = performance.now() + 2000;
          if (waitRefused === 10) snag('wait refused for 20 s', r);
        } else {
          log('wait', `${hours} h from ${h.toFixed(2)}`);
          waitRefused = 0;
        }
        return;
      }
      if (!goal) {
        hold('KeyW', false);
        hold('ShiftLeft', false);
        // The dedication runs on its own (the rite, the arrow): the stage moves on at the shot.
        if (stageOf(MQ04) === 'ceremony') return;
        idleFor += 0.1;
        if (idleFor > 20) {
          snag('no goal', QUESTS.map((id) => `${id}:${game.quests.status(id)?.stage ?? '-'}`).join(' '));
          idleFor = 0;
        }
        return;
      }
      idleFor = 0;
      const gk = `${goal.quest}/${goal.obj}`;
      if (gk !== lastGoalKey) {
        lastGoalKey = gk;
        L.goal = goal;
        log('goal', gk, goal.text);
        resetProgress();
        arrivedAt = 0;
      }
      if (!goal.pos) {
        snag('marker unresolved', JSON.stringify(goal.target));
        L.done = true;
        return;
      }
      // The Column's seal (an examine on the bronze door, optional): look at it as the player stands the post.
      // Once: the seal is looked at a single time (the quest guards on its flag).
      if (goal.quest === MQ04 && goal.obj === 'post' && !L.sealUsed && useNear(/mq04-seal/, 2.4)) return void (L.sealUsed = true);
      const d = cell ? reach3(goal.pos) : dist(goal.pos);
      if (goal.target.kind === 'npc') {
        const actor = game.actors?.get(goal.target.id);
        // Within 3.2 m: Gratus's body can stop the walk 2.6 m short (a jam 3 m out), so the talk reach is a little wider.
        if (dist(goal.pos) < 3.2 && actor) {
          hold('KeyW', false);
          hold('ShiftLeft', false);
          face(actor.position.x, actor.position.z);
          const n = (talkedTo.get(gk) ?? 0) + 1;
          talkedTo.set(gk, n);
          if (n % 40 === 1) {
            if (n > 1) snag('talked, objective still open', `${goal.target.id} (${Math.floor(n / 40) + 1} tries)`);
            if (n > 200) {
              L.done = true;
              return;
            }
            const v = game.dialogue.start(goal.target.id);
            if (!v) snag('no dialogue', goal.target.id);
          }
          return;
        }
        if (dist(goal.pos) < 6 && !actor) {
          snag('npc missing at marker', goal.target.id);
          teleportToward({ x: goal.pos.x + 2, z: goal.pos.z });
          return;
        }
        if (cell) return walkCell(cell, goal.pos, `${gk}/${Math.round(goal.pos.x)},${Math.round(goal.pos.z)}`);
        return walkTo(goal);
      }
      // A door on the way (the Column's bronze door, the stair's doors): walk to it and use it.
      const doorId = doorFor(goal, cell);
      const door = doorId ? usableDoor(doorId) : null;
      if (door) return walkDoor(goal, cell, door);
      // A place with something to use there (Mus' strongbox, the clues at the Marii's door): use
      // the nearest such thing within reach, as a player pressing E would.
      if (d < 8 && (goal.obj === 'satchel' || goal.obj === 'clues' || goal.obj === 'search')) {
        const want = goal.obj === 'satchel' ? (i) => /strongbox/i.test(i.label()) : goal.obj === 'clues' ? (i) => i.id.startsWith('content:clue-') : (i) => i.id === 'content:festus-body';
        const items = [...(game.interactions?.items ?? [])].filter(want);
        const it = items.sort((a, b) => dist(a.position()) - dist(b.position()))[0];
        if (it) {
          const ip = it.position();
          if (dist(ip) > 2) return walkTo({ ...goal, pos: { x: ip.x, z: ip.z } });
          hold('KeyW', false);
          if (performance.now() - (L.usedAt ?? 0) > 1500) {
            L.usedAt = performance.now();
            log('use', it.label());
            it.interact(game);
            // A container opened: take everything (R in the container screen), as a player would.
            game.ui?.top?.view?.takeAll?.();
            game.ui?.closeAll?.();
          }
          return;
        }
      }
      // A place: walk in; an objective that doesn't complete 8 s after arriving is a snag. The Column's
      // door is 3 m across: the bot stops at 2 m so the ceremony and the entry (radius 3) take.
      const arriveR = cell ? 2 : goal.target.id === 'column-door' ? 2 : 4;
      if (d < arriveR) {
        hold('KeyW', false);
        hold('ShiftLeft', false);
        if (!arrivedAt) arrivedAt = performance.now();
        else if (performance.now() - arrivedAt > 8000) {
          snag('arrived, objective still open', `${goal.target.id} (${d.toFixed(1)} m)`);
          // A place is entered on a step in: step out of it, then the walk goes back in (location:entered).
          if (!cell && goal.target.kind === 'location') stepAway(goal.pos);
          else p.teleport({ x: goal.pos.x, y: (goal.pos.y ?? p.position.y) + 0.5, z: goal.pos.z });
          arrivedAt = performance.now() + 30000;
        }
        return;
      }
      if (cell) return walkCell(cell, goal.pos, `${gk}/${Math.round(goal.pos.x)},${Math.round(goal.pos.y)},${Math.round(goal.pos.z)}`);
      walkTo(goal);
    } catch (err) {
      L.errors.push(`bot: ${err?.message ?? err}`);
    }
  }, 100);
})();
