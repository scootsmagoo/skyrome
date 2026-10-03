/**
 * Combat test bed: a sand practice arena like the Ludus Magnus' (an ellipse of about 62 × 42 m
 * inside a podium wall and nine rows of seats, the editor's box on the south side), the player
 * with a gladius and scutum (the RPG, UI, audio and combat installed), and enemies from §13.
 *
 *   ?scene=arena&enemy=<archetype>&count=N     grassator · ebrius-rixator · collegium-bruiser · tiro ·
 *                                              thraex · miles-urbanus · vigil · boss-nereus
 *   &difficulty=tiro|facilis|normalis|difficilis|herculea
 *   &tier=thug|veteran|champion  &kit=0|1      archetype options
 *   &lusio=0|1     practice arms (rudis) for both sides; gladiators default to a lusio bout
 *   &bout=0|1      an arena bout with crowd favor (gladiators: on)
 *   &noai=1        the enemies stand and guard (training posts)   &aggro=<m>  attack-on-sight radius
 *   &view=first    start in first person         &hour=<h>      time of day (default 10.5)
 *   &dist=<m>      spawn distance (default 8)    &crowd=<n>     spectators (default 24)
 *   &god=1         the player can't drop         &toggle=1      toggle block (Trackpad preset)
 *   &foegod=1      the enemies can't drop (long scripted duels for block-rate statistics)
 *   &origin=<id>   RPG origin (default veteranus) &audio=0       no audio
 *   &site=rome     fight in the city at a landmark (&at=<id>, default ludus-magnus) instead of the sand arena
 *
 * `window.__arena` (for scripts/shot.mjs): `stats` (player swings, hits, blocks, parries; the
 * most attackers holding tokens at once…), `spam(seconds, everyMs)`, `reset()`, `hurt(id, frac)`,
 * `freeze()` / `thaw()`, `cam(yawDeg, zoom, pitch)`, `foes`, `combat`.
 */
import * as THREE from 'three';
import { Actor } from '../actors/Actor';
import { createHumanoid } from '../actors/avatar/HumanoidAvatar';
import { avatarLod } from '../actors/avatar/lod';
import { randomAppearance, type AvatarRole } from '../actors/avatar/variants';
import { installAudio } from '../audio';
import { installCombat } from '../combat';
import { ENEMIES } from '../combat/archetypes';
import { meleeRange } from '../combat/geometry';
import type { Combatant } from '../combat/Combatant';
import type { Game } from '../core/Game';
import { DEG } from '../core/math';
import { Layer } from '../core/Physics';
import { Rng } from '../core/Rng';
import { MeshBuilder, placeAndRegister } from '../gfx/MeshBuilder';
import { Interactions } from '../interaction/Interactions';
import { PERKS } from '../rpg/data/perks';
import { SKILLS } from '../rpg/data/skills';
import { DIFFICULTY, type Difficulty } from '../rpg/data/tuning';
import { installRpg } from '../rpg/install';
import { characterViewFrom, inventoryViewFrom } from '../ui/adapters';
import { installUI } from '../ui/UIManager';
import { WorldRegistry } from '../world/WorldRegistry';
import { installSky } from '../world/sky';
import { setupPlayer } from './common';
import type { SceneDef } from './types';

/** Arena ellipse (half-axes, m) and the stands. */
const ARENA = { rx: 31, rz: 21, wall: 1.9, tiers: 9, tierRise: 0.48, tierDepth: 0.85, segments: 64 };

function ellipsePoint(rx: number, rz: number, a: number) {
  return { x: Math.cos(a) * rx, z: Math.sin(a) * rz };
}

/** The sand, the podium wall, nine rows of seats, the outer wall, gates and the editor's box. */
function buildArena(game: Game) {
  const b = new MeshBuilder();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  // Sand floor (and the ground under the stands).
  b.box('sand', ARENA.rx * 2 + 4, 0.4, ARENA.rz * 2 + 4, m.makeTranslation(0, -0.2, 0), { collide: true });
  b.box('dirt', 120, 0.4, 100, new THREE.Matrix4().makeTranslation(0, -0.45, 0), { collide: true });
  const N = ARENA.segments;
  // A ring of boxes along an ellipse: each segment spans two neighbouring points.
  const ring = (rx: number, rz: number, y: number, h: number, depth: number, mat: 'travertine' | 'tufa' | 'brick' | 'wood' | 'marble', collide: boolean, skip?: (a: number) => boolean) => {
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2;
      const a1 = ((i + 1) / N) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      if (skip?.(am)) continue;
      const p0 = ellipsePoint(rx, rz, a0);
      const p1 = ellipsePoint(rx, rz, a1);
      const len = Math.hypot(p1.x - p0.x, p1.z - p0.z) + 0.06;
      const cx = (p0.x + p1.x) / 2;
      const cz = (p0.z + p1.z) / 2;
      const rot = Math.atan2(-(p1.z - p0.z), p1.x - p0.x);
      // Push the box outward by half its depth so the inner face sits on the ellipse.
      const nx = Math.cos(am) / rx;
      const nz = Math.sin(am) / rz;
      const nl = Math.hypot(nx, nz);
      q.setFromAxisAngle(up, rot);
      const mm = new THREE.Matrix4().compose(new THREE.Vector3(cx + (nx / nl) * depth * 0.5, y + h / 2, cz + (nz / nl) * depth * 0.5), q, new THREE.Vector3(1, 1, 1));
      b.box(mat, len, h, depth, mm, { collide });
    }
  };
  const gate = (a: number) => Math.abs(Math.cos(a)) > 0.995; // east and west gates
  ring(ARENA.rx, ARENA.rz, 0, ARENA.wall, 0.7, 'travertine', true, gate);
  // Seats: each tier steps up and back.
  for (let t = 0; t < ARENA.tiers; t++) {
    const off = 0.7 + t * ARENA.tierDepth;
    const top = ARENA.wall + 0.25 + t * ARENA.tierRise;
    ring(ARENA.rx + off, ARENA.rz + off, 0, top, ARENA.tierDepth + 0.05, t % 3 === 2 ? 'marble' : 'tufa', false, gate);
  }
  const outer = 0.7 + ARENA.tiers * ARENA.tierDepth;
  ring(ARENA.rx + outer, ARENA.rz + outer, 0, ARENA.wall + ARENA.tiers * ARENA.tierRise + 2.6, 0.9, 'brick', true, gate);
  // Gates: piers and a lintel at both ends.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.box('travertine', outer + 1, 4.2, 0.8, new THREE.Matrix4().makeTranslation(sx * (ARENA.rx + outer / 2), 2.1, sz * 2.2), { collide: true });
    b.box('travertine', outer + 1, 0.9, 5.2, new THREE.Matrix4().makeTranslation(sx * (ARENA.rx + outer / 2), 4.65, 0));
  }
  // The editor's box (tribunal) on the south long side: a platform, four columns, an awning.
  const ez = ARENA.rz + 2.2;
  b.box('marble', 6, 0.3, 3, new THREE.Matrix4().makeTranslation(0, ARENA.wall + 1.35, ez + 0.4));
  for (const sx of [-2.6, 2.6]) for (const dz of [-0.9, 1.6]) b.add(new THREE.CylinderGeometry(0.16, 0.18, 2.6, 10), 'marble', new THREE.Matrix4().makeTranslation(sx, ARENA.wall + 2.8, ez + dz));
  b.box('fabric_red', 6.6, 0.12, 3.4, new THREE.Matrix4().makeTranslation(0, ARENA.wall + 4.15, ez + 0.4));
  // Training posts (pali) at the west end.
  for (const [x, z] of [[-24, -6], [-24, 6], [-27, 0]]) b.add(new THREE.CylinderGeometry(0.14, 0.17, 1.9, 8), 'wood_dark', new THREE.Matrix4().makeTranslation(x, 0.95, z), { castShadow: true });
  const g = b.build('arena');
  placeAndRegister(game, 'arena', g, b.colliders, { x: 0, y: 0, z: 0 }, 0, { cullDistance: 5000 });
  return { editor: { x: 0, z: ez } };
}

/** Spectators in the south stands and by the gates: decoration (not combatants). */
function buildCrowd(game: Game, n: number, rng: Rng) {
  const roles: AvatarRole[] = ['plebeian-man', 'plebeian-woman', 'freedman', 'merchant', 'slave', 'plebeian-man', 'patrician-man', 'matron'];
  for (let i = 0; i < n; i++) {
    const t = 1 + (i % 6);
    const off = 0.7 + t * ARENA.tierDepth + ARENA.tierDepth * 0.5;
    const a = Math.PI / 2 + (rng.next() - 0.5) * 1.5 * (i % 2 ? 1 : -1) + (i % 2 ? 0.2 : -0.2);
    const side = i % 3 === 0 ? -1 : 1; // most on the south side, some on the north
    const p = ellipsePoint(ARENA.rx + off, ARENA.rz + off, side > 0 ? a : -a);
    const y = ARENA.wall + 0.25 + t * ARENA.tierRise;
    const app = randomAppearance(rng.fork(`crowd-${i}`), rng.pick(roles));
    const av = createHumanoid(app, { lod: 'low', castShadow: false });
    const actor = new Actor(game, { id: `spectator-${i}`, position: { x: p.x, y: y + 0.02, z: p.z }, heading: Math.atan2(-p.x, -p.z), layer: Layer.Npc, avatar: av });
    av.setIdleLoop(rng.next() < 0.6 ? 'cheer' : 'stand');
    game.actors.add(actor);
  }
}

const scene: SceneDef = {
  title: 'Arena',
  description: 'Combat test bed: duels, 1-vs-4, Nereus',
  async setup(game: Game, uiRoot: HTMLElement) {
    const q = new URLSearchParams(location.search);
    const num = (k: string, d: number) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
    const enemyId = q.get('enemy') ?? 'grassator';
    const spec = ENEMIES[enemyId] ?? ENEMIES.grassator;
    const count = Math.max(0, Math.min(12, num('count', 1)));
    const difficulty = (q.get('difficulty') ?? 'normalis') as Difficulty;
    const lusio = q.has('lusio') ? q.get('lusio') === '1' : !!spec.defaults?.lusio;
    const bout = q.has('bout') ? q.get('bout') === '1' : spec.team === 'ludus';
    const rng = new Rng(q.get('seed') ?? 113);

    game.world = game.addSystem(new WorldRegistry(game));
    game.interactions = game.addSystem(new Interactions(game));
    game.time.restore({ totalHours: num('hour', 10.5) });
    installSky(game);
    // &site=rome: stage the fight in the city, at a landmark (default the Ludus Magnus).
    const inRome = q.get('site') === 'rome';
    let origin = { x: 0, y: 0, z: 0 };
    let site = { editor: { x: 0, z: ARENA.rz + 2.2 } };
    if (inRome) {
      const { buildRome, spawnAtLandmark } = await import('../world/rome/buildRome');
      await buildRome(game, { extent: 'core' });
      const at = spawnAtLandmark(game, q.get('at') ?? 'ludus-magnus', 0);
      if (at) origin = { x: at.position.x, y: at.position.y, z: at.position.z };
      site = { editor: { x: origin.x, z: origin.z + 20 } };
      game.world.refreshAll();
    } else site = buildArena(game);
    const ground = (x: number, z: number) => (inRome ? (game.physics.groundHeight(origin.x + x, origin.z + z, origin.y + 40, 120) ?? origin.y) : 0) + 0.05;
    const at = (x: number, z: number) => ({ x: origin.x + x, y: ground(x, z), z: origin.z + z });

    // The player: a fighter of the Ludus (gladius and scutum; practice arms in a lusio).
    const pApp = randomAppearance(new Rng('arena-player'), (q.get('player') as AvatarRole) ?? 'legionary');
    pApp.armor = { ...pApp.armor, helmet: pApp.armor?.helmet };
    const avatar = createHumanoid(pApp);
    const dist = num('dist', 8);
    const start = at(0, dist / 2 + 2);
    const player = setupPlayer(game, new THREE.Vector3(start.x, start.y, start.z), Math.PI, avatar);
    avatarLod.viewer = game.camera;
    const rpg = installRpg(game, { background: q.get('origin') ?? 'veteranus', sex: pApp.sex });
    const inv = rpg.inventory;
    const weapon = q.get('pweapon') ?? (lusio ? 'rudis' : 'gladius');
    const shield = q.get('pshield') ?? 'scutum';
    for (const id of [weapon, shield]) {
      if (id === 'none' || !rpg.items.has(id)) continue;
      inv.add(id, 1, { silent: true, source: 'start' });
      inv.equip(id);
    }
    if (shield === 'none') {
      const off = inv.equipped('offHand');
      if (off) inv.unequip('offHand');
    }
    game.settings.set('combatDifficulty', difficulty);
    if (q.has('toggle')) game.settings.set('blockToggle', q.get('toggle') === '1');

    const ui = installUI(game, uiRoot);
    ui.provide({
      vitals: () => rpg.sheet.vitals,
      character: () => characterViewFrom(rpg.sheet, { name: 'Gaius', title: 'Of the Ludus Magnus', skills: SKILLS, perks: PERKS }),
      inventory: () => inventoryViewFrom(rpg.inventory, (id) => rpg.items.get(id)),
      currentLocation: () => 'Ludus Magnus',
    });
    if (q.get('audio') !== '0') {
      try {
        const audio = installAudio(game);
        audio.ambience.setBase({ city: 0.6, crowd: inRome ? 0.2 : 0.8 });
        audio.footsteps.attach(player, { surfaceAt: () => (inRome ? 'gravel' : 'dirt'), spatial: false, voice: pApp.sex === 'female' ? 'f' : 'm', gear: 'armor' });
      } catch {
        /* no audio in this browser */
      }
    }
    const combat = installCombat(game, { hudRoot: uiRoot, seed: q.get('seed') ?? 113 });
    if (!inRome) combat.surfaceAt = () => 'dirt';
    if (q.get('view') === 'first') player.setViewMode('first');
    // Start with the weapon in hand (&drawn=0 starts sheathed).
    if (q.get('drawn') !== '0' && combat.playerC) {
      combat.playerC.drawn = true;
      avatar.setDrawn(true);
    }
    player.pitch = -0.12;

    // Enemies across the sand, facing the player.
    const foes: Combatant[] = [];
    const aggro = num('aggro', q.get('noai') === '1' ? 0 : 30);
    for (let i = 0; i < count; i++) {
      const spread = count > 1 ? (i - (count - 1) / 2) * 2.6 : 0;
      const c = combat.spawnEnemy(spec.id, at(spread, -dist / 2 + 2 - Math.abs(spread) * 0.3), {
        id: count > 1 ? `${spec.id}-${i + 1}` : spec.id,
        heading: 0,
        tier: q.get('tier') ?? undefined,
        kit: q.has('kit') ? num('kit', 0) : undefined,
        lusio,
        aggro,
        seed: `${q.get('seed') ?? 113}-${i}`,
        drawn: true,
      });
      if (q.get('noai') === '1' && c.brain) {
        c.brain = null;
        c.guardWanted = true;
      }
      foes.push(c);
    }
    if (bout && foes.length) combat.startBout({ foes, lusio, editor: site.editor, purse: spec.boss ? 40 : 10 });
    else if (q.get('noai') !== '1') for (const f of foes) if (combat.playerC) combat.core.engage(f, combat.playerC);
    if (num('crowd', 24) > 0 && !inRome) buildCrowd(game, num('crowd', 24), rng);

    // ---------------------------------------------------------------- scripted-test hooks
    const pc = combat.playerC!;
    const stats = {
      swings: 0,
      lightSwings: 0,
      connected: 0,
      landed: 0,
      blocked: 0,
      parried: 0,
      playerHitsTaken: 0,
      playerBlocked: 0,
      playerParried: 0,
      maxTokens: 0,
      maxAttacking: 0,
      tokenHistogram: {} as Record<number, number>,
      phases: [] as { phase: number; t: number; health: number }[],
      nets: 0,
      entangled: 0,
      events: [] as string[],
      why: {} as Record<string, number>,
      foeAttacks: 0,
      started: game.elapsed,
    };
    const startAttack = combat.core.startAttack.bind(combat.core);
    combat.core.startAttack = (c, kind, o) => {
      const ok = startAttack(c, kind, o);
      if (ok && c === pc) {
        stats.swings++;
        if (kind === 'light' || kind === 'riposte') stats.lightSwings++;
      }
      if (ok && kind === 'net') stats.nets++;
      if (ok && c !== pc) stats.foeAttacks++;
      return ok;
    };
    const log = (s: string) => {
      stats.events.push(`${(game.elapsed - stats.started).toFixed(1)}s ${s}`);
      if (stats.events.length > 80) stats.events.shift();
    };
    // Before the core resolves a player's blow, note the defender's state (why a hit wasn't blocked).
    const applyHit = combat.core.applyHit.bind(combat.core);
    combat.core.applyHit = (att, def, a, w) => {
      if (att === pc) {
        const now = combat.core.now;
        const why = def.attacking() ? 'attacking' : def.stunned(now) ? 'stunned' : def.guardActive ? (now - def.guardSince < 0.1 ? 'guard-rising' : 'guarded') : def.guardWanted ? 'wanted' : 'no-guard';
        stats.why[why] = (stats.why[why] ?? 0) + 1;
      }
      return applyHit(att, def, a, w);
    };
    game.events.on('combat:hit', (e) => {
      if (e.attackerId === pc.id) {
        if (e.kind === 'net') return;
        stats.connected++;
        if (e.parried) stats.parried++;
        else if (e.blocked) stats.blocked++;
        else stats.landed++;
      } else if (e.targetId === pc.id) {
        if (e.kind === 'net') {
          stats.entangled++;
          log(`netted by ${e.attackerId}`);
        } else if (e.parried) stats.playerParried++;
        else if (e.blocked) stats.playerBlocked++;
        else stats.playerHitsTaken++;
      }
    });
    game.events.on('combat:phase', (e) => {
      const c = combat.core.get(e.actorId);
      stats.phases.push({ phase: e.phase, t: +(game.elapsed - stats.started).toFixed(1), health: +(c?.healthFrac() ?? 0).toFixed(3) });
      log(`${e.actorId} phase ${e.phase}`);
    });
    game.events.on('actor:yielded', (e) => log(`${e.actorId} yields`));
    game.events.on('combat:knockout', (e) => log(`${e.actorId} knocked out`));
    game.events.on('actor:killed', (e) => log(`${e.victimId} killed by ${e.killerId}`));
    game.events.on('combat:fled', (e) => log(`${e.actorId} flees`));
    game.events.on('combat:playerDefeated', (e) => log(`player defeated: ${e.outcome}`));
    game.events.on('combat:callHelp', (e) => log(`${e.actorId} calls for help`));
    // Token watch: how many hold attack tokens against the player, every frame.
    game.addSystem({
      name: 'arenaWatch',
      priority: 30,
      fixedUpdate() {
        const n = combat.core.tokens.holders(pc.id).length;
        stats.maxTokens = Math.max(stats.maxTokens, n);
        stats.tokenHistogram[n] = (stats.tokenHistogram[n] ?? 0) + 1;
        const attacking = combat.core.list.filter((c) => c !== pc && c.active && c.target === pc && c.attacking()).length;
        stats.maxAttacking = Math.max(stats.maxAttacking, attacking);
        if (q.get('foegod') === '1') for (const f of foes) if (f.active) f.vitals.set('health', f.vitals.health.max);
        if (q.get('god') === '1' && pc.active) {
          pc.vitals.set('health', pc.vitals.health.max);
          pc.vitals.set('stamina', pc.vitals.stamina.max);
        }
      },
    });
    // Defeat in the dev scene: get up again after 4 s.
    game.events.on('combat:playerDefeated', () => {
      setTimeout(() => {
        combat.core.revive(pc);
        player.teleport(start, Math.PI);
      }, 4000);
    });

    let spamTimer: ReturnType<typeof setInterval> | null = null;
    let photo: { deg: number; dist: number; height: number; targetId?: string } | null = null;
    let duelFoe: Combatant | null = null;
    let wHeld = false;
    game.addSystem({
      name: 'arenaDuel',
      priority: -20, // before the player controller reads input
      update() {
        const f = duelFoe;
        if (!f) return;
        const dx = f.position.x - player.position.x;
        const dz = f.position.z - player.position.z;
        player.yaw = Math.atan2(-dx, -dz);
        const want = f.active && Math.hypot(dx, dz) > meleeRange(pc.weapon.reach, f.body.radius) - 0.2;
        if (want !== wHeld) {
          game.input.simulate('KeyW', want);
          wHeld = want;
        }
      },
    });
    const look = new THREE.Vector3();
    game.addSystem({
      name: 'arenaPhoto',
      priority: 101, // after the camera rig
      lateUpdate() {
        if (!photo) return;
        const t = photo.targetId ? combat.core.get(photo.targetId) : null;
        const a = player.root.position;
        look.set(a.x, a.y + 1.15, a.z);
        if (t) look.set((a.x + t.position.x) / 2, a.y + 1.15, (a.z + t.position.z) / 2);
        const r = photo.deg * DEG;
        game.camera.position.set(look.x + Math.sin(r) * photo.dist, a.y + photo.height, look.z + Math.cos(r) * photo.dist);
        game.camera.lookAt(look);
      },
    });
    const api = {
      combat,
      core: combat.core,
      player: pc,
      foes,
      stats,
      tokensMax: DIFFICULTY[difficulty].tokens,
      reset() {
        for (const k of ['swings', 'lightSwings', 'connected', 'landed', 'blocked', 'parried', 'playerHitsTaken', 'playerBlocked', 'playerParried', 'maxTokens', 'maxAttacking', 'nets', 'entangled', 'foeAttacks'] as const) stats[k] = 0;
        stats.tokenHistogram = {};
        stats.why = {};
        stats.events.length = 0;
        stats.started = game.elapsed;
      },
      /** Press F every `everyMs` for `seconds` (light-attack spam); resolves with a summary. */
      spam(seconds: number, everyMs = 160) {
        if (spamTimer) clearInterval(spamTimer);
        spamTimer = setInterval(() => {
          game.input.simulate('KeyF', true);
          setTimeout(() => game.input.simulate('KeyF', false), 45);
        }, everyMs);
        return new Promise((res) =>
          setTimeout(() => {
            if (spamTimer) clearInterval(spamTimer);
            spamTimer = null;
            res(api.summary());
          }, seconds * 1000),
        );
      },
      /**
       * Scripted duel (AC-07): keep facing `foeId` (default the first foe), close to reach with W, and
       * spam F every `everyMs` for `seconds`. Resolves with the summary.
       */
      duel(seconds: number, everyMs = 160, foeId?: string) {
        duelFoe = (foeId ? combat.core.get(foeId) : foes[0]) ?? null;
        const done = api.spam(seconds, everyMs);
        return done.then((r) => {
          duelFoe = null;
          if (wHeld) game.input.simulate('KeyW', false);
          wHeld = false;
          return r;
        });
      },
      summary() {
        const c = stats.connected || 1;
        return {
          swings: stats.swings,
          connected: stats.connected,
          landed: stats.landed,
          blocked: stats.blocked,
          parried: stats.parried,
          blockRate: +((stats.blocked + stats.parried) / c).toFixed(3),
          hitsTaken: stats.playerHitsTaken,
          foeAttacks: stats.foeAttacks,
          maxTokens: stats.maxTokens,
          maxAttacking: stats.maxAttacking,
          tokenHistogram: stats.tokenHistogram,
          defenderState: stats.why,
          foes: foes.map((f) => ({ id: f.id, hp: +f.healthFrac().toFixed(2), status: f.status, state: f.brain?.state })),
          player: { hp: +pc.healthFrac().toFixed(2), status: pc.status },
          phases: stats.phases,
          nets: stats.nets,
          entangled: stats.entangled,
          events: stats.events.slice(-30),
        };
      },
      hurt(id: string, frac: number) {
        const c = combat.core.get(id);
        c?.vitals.set('health', c.vitals.health.max * frac);
      },
      /** Pause the simulation (rendering continues) to hold a pose for a screenshot. */
      freeze() {
        game.paused = true;
      },
      thaw() {
        game.paused = false;
      },
      /** Third-person camera around the player: yaw (deg, 0 = looking north), zoom (m), pitch (rad). */
      cam(yawDeg: number, zoom = 3.4, pitch = -0.12) {
        player.yaw = yawDeg * DEG;
        player.zoom = zoom;
        player.pitch = pitch;
      },
      /**
       * A photo camera that doesn't turn the player: orbit the midpoint of the player and `targetId`
       * (or the player) at bearing `deg` (0 = from the south), `dist` m, `height` m. photo() turns it off.
       */
      photo(deg?: number, dist = 5, height = 1.7, targetId?: string) {
        photo = deg === undefined ? null : { deg, dist, height, targetId };
      },
    };
    (window as unknown as { __arena: typeof api }).__arena = api;
  },
};
export default scene;
