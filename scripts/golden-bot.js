/**
 * The golden-path bot (AC-15), run IN THE PAGE by scripts/golden-path.mjs. It plays Act I's
 * chapters (docs/STORY.md: the gate, the tablet, the Lemuria) the way a player would: follows the
 * tracked objective's marker on foot, talks to the NPC it names and picks dialogue choices, fights
 * whoever attacks it, uses what the objective points at (a strongbox, a clue), and waits (T) when a
 * stage needs the evening or midnight. God mode is on (`tgm`): it tests the content, not its own
 * swordplay.
 *
 * Everything that would stop a player is logged in window.__gp: `snags` (a walk that jams, a
 * marker that can't be resolved, an NPC who isn't where the marker says, an objective that doesn't
 * complete on arrival) and `errors`. A jammed walk teleports ahead so the run goes on.
 */
(() => {
  const game = window.__skyrome.game;
  const p = game.player;
  const QUESTS = ['mq-01-madida-capena', 'mq-02-tabella', 'mq-03-lemuria'];
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

  // ------------------------------------------------------------------ goals

  /** The first required, active objective of the golden-path quests (in quest order). */
  function nextGoal() {
    for (const id of QUESTS) {
      if (!game.quests.status(id)?.running) continue;
      for (const o of game.quests.objectives(id)) {
        if (!o.active || o.done || o.optional || !o.target) continue;
        return { quest: id, obj: o.id, text: o.text, target: o.target, pos: game.quests.resolveTarget(o.target) };
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
  function stepDialogue() {
    const d = game.dialogue;
    const v = d.view;
    if (!v) return;
    if (performance.now() - talkT < 350) return;
    talkT = performance.now();
    const key = `${v.dialogueId}/${v.nodeId}`;
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

  // ------------------------------------------------------------------ fights

  function foes() {
    const core = game.combat?.core;
    const pc = game.combat?.playerC;
    if (!core || !pc) return [];
    // A player goes after the quest's own foes too (the brawl's rivals), not only whoever attacks.
    const questFoe = (c) => !!L.goal && (c.tags ?? []).includes(L.goal.quest) && !(c.tags ?? []).includes('rixa-ally');
    return core.list.filter((c) => c !== pc && c.status === 'active' && (c.target === pc || core.hostile(c, pc) || questFoe(c)) && dist(c.position) < 25);
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
  function walkTo(goal) {
    const target = goal.pos;
    const key = `${goal.quest}/${goal.obj}/${Math.round(target.x)},${Math.round(target.z)}`;
    if (key !== pathFor || !path || !path.length) {
      const r = game.population?.nav?.findPath(p.position.x, p.position.z, target.x, target.z);
      path = Array.isArray(r) ? r.slice() : [{ x: target.x, z: target.z }];
      pathFor = key;
    }
    while (path.length > 1 && dist(path[0]) < 1.5) path.shift();
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
      snag('stuck', `${Math.round(far)} m from ${goal.text}`);
      teleportToward(target);
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

  // ------------------------------------------------------------------ the loop

  let lastGoalKey = '';
  let talkedTo = new Map();
  let idleFor = 0;
  const dusk = 19.4;
  let waitAgainAt = 0;
  let waitRefused = 0;
  L.timer = setInterval(() => {
    try {
      if (L.done) return;
      if (game.dialogue?.active) {
        hold('KeyW', false);
        hold('ShiftLeft', false);
        return stepDialogue();
      }
      // Close any menu a notice or a level-up opened.
      if (game.ui?.top && game.ui.top.id !== 'console') game.ui.closeAll?.();
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
      const all = QUESTS.map((id) => game.quests.status(id));
      if (all.every((s) => s?.done)) {
        L.done = true;
        hold('KeyW', false);
        hold('ShiftLeft', false);
        log('ALL DONE');
        return;
      }
      const goal = nextGoal();
      // Waits the story asks for: Gratus takes the tablet after sunset (mq-02 'give'); the rite
      // is at midnight (mq-03 'wait', at the Marii's door).
      const h = game.time.hour;
      const until = goal?.obj === 'give' && h < dusk && h > 5 ? dusk : goal?.obj === 'wait' && goal.pos && dist(goal.pos) < 8 && h < 23.6 && h > 5 ? 23.7 : null;
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
        idleFor += 0.1;
        hold('KeyW', false);
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
      const d = dist(goal.pos);
      if (goal.target.kind === 'npc') {
        const actor = game.actors?.get(goal.target.id);
        if (d < 2.6 && actor) {
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
        if (d < 6 && !actor) {
          snag('npc missing at marker', goal.target.id);
          teleportToward({ x: goal.pos.x + 2, z: goal.pos.z });
          return;
        }
        return walkTo(goal);
      }
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
      // A place: walk in; an objective that doesn't complete 8 s after arriving is a snag.
      if (d < 4) {
        hold('KeyW', false);
        hold('ShiftLeft', false);
        if (!arrivedAt) arrivedAt = performance.now();
        else if (performance.now() - arrivedAt > 8000) {
          snag('arrived, objective still open', `${goal.target.id} (${d.toFixed(1)} m)`);
          p.teleport({ x: goal.pos.x, y: (goal.pos.y ?? p.position.y) + 0.5, z: goal.pos.z });
          arrivedAt = performance.now() + 30000;
        }
        return;
      }
      walkTo(goal);
    } catch (err) {
      L.errors.push(`bot: ${err?.message ?? err}`);
    }
  }, 100);
})();
