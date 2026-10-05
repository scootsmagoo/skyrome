/**
 * A simple fighting bot for the lud-01 Nereus bout (AC-08 agent playtest). Runs IN THE PAGE:
 * scripts/playtest-nereus.mjs injects it. It sets the quest to the third bout, draws the Ludus
 * kit, starts the bout and plays it with the real input actions (game.input.simulate): lock on,
 * close in, light attacks, block or parry his blows, sidestep the net, struggle free. It records
 * phases, nets, hits both ways, crowd favor and the end, in window.__nereus.
 */
(() => {
  const game = window.__skyrome.game;
  const combat = game.combat;
  const core = combat.core;
  const log = { t0: performance.now(), events: [], hitsOn: 0, hitsBy: 0, dmgOn: 0, dmgBy: 0, nets: 0, entangled: 0, dodges: 0, parries: 0, phases: [], favor: [], end: null, yielded: null, minHp: 100, taken: [], tries: 0, staminaSum: 0, staminaN: 0, lowStamina: 0, openings: 0, bossIdle: 0, ticks: 0 };
  window.__nereus = log;
  const at = () => +((performance.now() - log.t0) / 1000).toFixed(1);
  const on = (k, f) => game.events.on(k, f);
  on('combat:phase', (e) => log.phases.push([at(), e.phase]));
  on('combat:favor', (e) => log.favor.push([at(), Math.round(e.favor), e.reason]));
  on('combat:parry', (e) => {
    log.parries++;
    if (e.defenderId === 'player' || e.actorId === 'player' || e.byId === 'player') parriedAt = core.now;
  });
  on('combat:hit', (e) => {
    if (e.targetId === 'player') {
      log.taken.push([at(), e.kind, Math.round(e.damage), e.blocked ? 'blocked' : e.parried ? 'parried' : 'hit', e.power ? 'power' : '', e.stagger, core.get('player').entangled(core.now) ? 'netted' : '']);
      if (!e.blocked && !e.parried && e.damage > 0) (log.hitsOn++, (log.dmgOn += e.damage));
      if (e.kind === 'net') log.entangled++;
    } else if (e.attackerId === 'player' && e.damage > 0 && !e.blocked) (log.hitsBy++, (log.dmgBy += e.damage));
  });
  on('actor:yielded', (e) => {
    if (e.actorId === 'player') log.yielded = 'player';
    else log.yielded = log.yielded ?? e.actorId;
    log.events.push([at(), 'yielded', e.actorId]);
  });
  on('combat:bout', (e) => log.events.push([at(), 'bout', e.phase, e.winner, Math.round(e.favor)]));
  on('combat:playerDefeated', (e) => ((log.end = 'player ' + e.outcome), log.events.push([at(), 'defeated', e.outcome])));

  // The quest: the third bout, the Ludus kit (rudis + scutum), then "Begin!".
  const BOUT = Number(window.__bout ?? 3);
  const FOE = ['npc-pullus', 'npc-auctus', 'npc-nereus'][BOUT - 1];
  game.events.emit('dialogue:node', { dialogueId: 'npc-successus', nodeId: 'issueScutum' });
  game.quests.start('lud-01-sacramentum', 'bout' + BOUT);
  game.quests.setStage('lud-01-sacramentum', 'bout' + BOUT);
  game.events.emit('dialogue:node', { dialogueId: 'npc-asiaticus', nodeId: 'begin' + BOUT });
  game.settings.set('blockToggle', false);

  const keys = new Set();
  const press = (code, down) => {
    if (down && !keys.has(code)) (keys.add(code), game.input.simulate(code, true));
    if (!down && keys.has(code)) (keys.delete(code), game.input.simulate(code, false));
  };
  const tap = (code) => {
    game.input.simulate(code, true);
    setTimeout(() => game.input.simulate(code, false), 60);
  };
  let locked = false;
  let lastAttack = 0;
  let lastDodge = 0;
  let netSeen = null;
  let burst = 0;
  let blowSeen = null;
  let tryParry = false;
  let parriedAt = -9;
  /** How often the bot tries for a parry instead of a plain block (a fair human, roughly). */
  const PARRY_SKILL = Number(window.__nereusSkill ?? 0.5);
  const tick = () => {
    const pc = core.get('player');
    const boss = core.get(FOE);
    if (!pc || !boss) return;
    log.minHp = Math.min(log.minHp, Math.round(pc.vitals.health.current));
    if (boss.status !== 'active' || pc.status !== 'active' || log.end) {
      for (const k of [...keys]) press(k, false);
      if (!log.end && boss.status !== 'active') log.end = 'foe ' + boss.status;
      return;
    }
    const now = core.now;
    const p = game.player;
    const dx = boss.position.x - p.position.x;
    const dz = boss.position.z - p.position.z;
    const d = Math.hypot(dx, dz);
    p.yaw = Math.atan2(-dx, -dz);
    if (!pc.drawn) tap('KeyR');
    if (!locked && pc.drawn) {
      tap('KeyX');
      locked = true;
    }
    // Netted: shield up and struggle.
    if (pc.entangled(now)) {
      press('KeyQ', true);
      tap('KeyF');
      return;
    }
    const a = boss.action;
    const incoming = a && a.hitAt !== undefined && !a.resolved ? a.hitAt - now : Infinity;
    if (a && a.kind === 'net' && netSeen !== a) {
      netSeen = a;
      log.nets++;
    }
    // The net in flight: sidestep across its path when it is about to arrive.
    for (const pr of core.projectiles) {
      if (pr.kind !== 'net' || pr.owner !== boss) continue;
      const rx = p.position.x - pr.x;
      const rz = p.position.z - pr.z;
      const closing = rx * pr.vx + rz * pr.vz > 0;
      if (closing && Math.hypot(rx, rz) < 2.6 && now - lastDodge > 0.6) {
        press('KeyQ', false);
        press('KeyW', false);
        press('KeyD', true);
        tap('AltLeft');
        log.dodges++;
        lastDodge = now;
        setTimeout(() => press('KeyD', false), 250);
        return;
      }
    }
    // A blow on its way. Half the time (decided per blow) try a parry: let the shield down,
    // then a fresh press ~0.1 s before it lands. Otherwise hold the shield up.
    if (a && a.kind !== 'net' && incoming < 0.7 && d < 4) {
      press('KeyW', false);
      if (blowSeen !== a) {
        blowSeen = a;
        // Slow, telegraphed power pokes are simply blocked; light pokes are parried sometimes.
        tryParry = a.kind === 'light' && Math.random() < PARRY_SKILL;
      }
      if (tryParry) {
        // The blow can land up to 0.12 s before its nominal time (the clip's hit frame).
        if (incoming > 0.18) press('KeyQ', false);
        else if (!keys.has('KeyQ')) press('KeyQ', true);
      } else if (!keys.has('KeyQ')) press('KeyQ', true);
      return;
    }
    // Just parried: riposte now.
    if (parriedAt > now - 0.6 && core.free(pc) && d < 2.4) {
      press('KeyQ', false);
      tap('KeyF');
      parriedAt = -9;
      lastAttack = now;
      return;
    }
    // Close in; then strike only in his openings (recovering from a blow, staggered, or not
    // attacking), two cuts at most, and keep the shield up otherwise.
    const reach = 1.9;
    if (d > reach) {
      press('KeyQ', false);
      press('KeyW', true);
      return;
    }
    press('KeyW', false);
    const recovering = a && a.resolved && a.kind !== 'net';
    const opening = recovering || boss.stunned(now) || (!a && now - (boss.lastAttackAt ?? -9) > 0.9);
    log.ticks++;
    log.staminaSum += pc.vitals.stamina.current;
    log.staminaN++;
    if (pc.vitals.stamina.current <= 22) log.lowStamina++;
    if (opening) log.openings++;
    if (!a) log.bossIdle++;
    if (opening && pc.vitals.stamina.current > 22 && now - lastAttack > 0.3 && core.free(pc) && burst < 2) {
      press('KeyQ', false);
      tap('KeyF');
      log.tries++;
      lastAttack = now;
      burst++;
      return;
    }
    if (!opening) burst = 0;
    // Shield down between his blows: stamina only comes back with the guard lowered.
    press('KeyQ', false);
  };
  log.timer = setInterval(tick, 40);
})();
