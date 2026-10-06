/**
 * CombatCore: the rules of a fight on a fixed-step clock — docs/GDD.md §6 and §13.
 *
 * It owns the combatants' action timelines (wind-up → hit → recovery), guards and parries,
 * dodges and i-frames, poise and staggers (with the §6.5 anti-loop rules from combat-math),
 * damage through src/rpg/combat-math (§6.2–6.4), knockouts, yields and flight (§6.9), attack
 * tokens and the AI brains (§6.13), Nereus' net, and the arena bout (§6.10). It knows nothing of
 * Three.js scenes, Rapier or the DOM: bodies and avatars come in through `CombatBody` /
 * `CombatView`, and everything else (sight lines, sound, hit-stop, HUD cues, events) through
 * `CombatEnv`. CombatSystem wires it into the Game; the tests drive it with fakes.
 */
import * as THREE from 'three';
import type { GameEvents } from '../core/Events';
import { DEG, approachAngle, clamp, wrapAngle } from '../core/math';
import type { ActionClip } from '../actors/Actor';
import { CombatBrain } from '../ai/combat/CombatBrain';
import { PathFollower, type NavProbe } from '../ai/combat/pathing';
import { AttackTokens } from '../ai/combat/tokens';
import type { BrainServices, Perception, TargetPerception } from '../ai/combat/types';
import {
  applyPoiseDamage,
  armorSkillFor,
  attackTypeFor,
  computeAttack,
  difficultyMult,
  parryWindow,
  playerPoise,
  resolveHit,
  resolveParry,
  tickPoise,
} from '../rpg/combat-math';
import { COMBAT, DIFFICULTY, STAMINA_COSTS, XP, type Difficulty } from '../rpg/data/tuning';
import type { ShieldStats, WeaponStats } from '../rpg/types';
import { ArenaBout, type BoutOptions } from './ArenaBout';
import { Combatant, type Action } from './Combatant';
import { BODY, angleTo, arcFor, dist2D, meleeRange, sweepCapsule } from './geometry';
import { TIMING, attackLength, attackPhases, chargeFraction, clipSpeedFor, type AttackKind } from './timing';
import './events';

/** Everything outside the rules: sight, sound, feedback, HUD cues, events, randomness. */
export interface CombatEnv {
  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void;
  lineOfSight(a: Combatant, b: Combatant): boolean;
  sfx(id: string, pos?: { x: number; y: number; z: number }, volume?: number): void;
  /** Hit-stop and camera shake for a blow involving the player. */
  feedback(kind: 'light' | 'power' | 'heavy'): void;
  /** HUD cues for the player: a refused stamina cost, an unblockable telegraph, sand, the net. */
  cue(kind: 'stamina' | 'unblockable' | 'blind' | 'entangled' | 'free', c: Combatant): void;
  night(): boolean;
  rng(): number;
  /** Accessibility override of the parry window (seconds), or null. */
  parryWindowOverride(): number | null;
  /** Show or remove a projectile's visual. */
  projectileVisual?(p: Projectile, on: boolean): void;
  /**
   * People in front of the player's blow who aren't combatants yet (the crowd, a shopkeeper): make
   * them combatants so the blow can land (an assault, §14.1). Returns how many were added.
   */
  adoptNear?(c: Combatant, radius: number, o: { power: boolean }): number;
  /**
   * Aim assist for the player's attack: the person it is meant for (the lock, the foe, else whoever
   * is nearest the line of the swing in a forgiving cone), adopted if need be; null for none.
   */
  assistTarget?(c: Combatant, weapon: WeaponStats): Combatant | null;
  /** The world's walls for the NPCs' steering (rays, the NPC crew's paths); none = open ground. */
  nav?: NavProbe;
}

export const nullEnv: CombatEnv = {
  emit: () => {},
  lineOfSight: () => true,
  sfx: () => {},
  feedback: () => {},
  cue: () => {},
  night: () => false,
  rng: Math.random,
  parryWindowOverride: () => null,
};

export interface Projectile {
  id: number;
  kind: 'net';
  owner: Combatant;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  ttl: number;
  radius: number;
  /** Combatants who dodged through it. */
  dodged: Set<string>;
  visual?: unknown;
}

/** Nereus' wooden practice dagger (§13.2: 6 blunt, phase 3). */
export const PRACTICE_DAGGER: WeaponStats = { class: 'blade', skill: 'blades', damage: 6, damageType: 'blunt', speed: 1.3, reach: 0.55, stagger: 6, practice: true };

const ZERO = { x: 0, z: 0 };
/** An NPC with an aggro radius notices a hostile this close without seeing it (it hears it). */
export const HEAR = 5;
/** An engaged NPC keeps track of its foe this close, round a corner or behind a cart. */
const TRACK = 6;
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
/** A viewed attack resolves at its clip's onHit, or this long after the timeline's hit time. */
const VIEW_GRACE = 0.05;
const TIER_RANK: Record<string, number> = { civilian: 0, thug: 1, skirmisher: 1, bruiser: 2, miles: 3, veteran: 4, champion: 5, elite: 6, boss: 7 };
const FRONT = 60 * DEG;

export class CombatCore {
  /** Combat clock (simulated seconds). */
  now = 0;
  difficulty: Difficulty = 'normalis';
  readonly list: Combatant[] = [];
  readonly tokens: AttackTokens;
  readonly projectiles: Projectile[] = [];
  bout: ArenaBout | null = null;
  player: Combatant | null = null;
  /** The player is in combat until this time (the §6 predicate). */
  playerCombatUntil = -Infinity;
  /** Lock-on, set by the player's input (preferred target of sweeps). */
  private byId = new Map<string, Combatant>();
  private hostileTeams = new Set<string>();
  private wasInCombat = false;
  private projectileSeq = 0;
  /** Line-of-sight cache per viewer → seen (pruned when a combatant leaves). */
  private los = new Map<Combatant, Map<Combatant, { at: number; ok: boolean }>>();
  /** Auto-aggro radius per NPC (spawned hostiles attack on sight). */
  readonly aggro = new Map<string, number>();
  /**
   * Within this radius an NPC with an aggro radius notices a hostile without seeing it (it hears
   * it, or it was told where the player is: a quest's ambush). Default `HEAR`.
   */
  readonly hearing = new Map<string, number>();
  /** Route-finding around obstacles per driven NPC (src/ai/combat/pathing.ts). */
  private followers = new Map<Combatant, PathFollower>();
  /** Reused perception records (one per NPC; the brain copies what it keeps). */
  private perceptions = new Map<Combatant, Perception>();

  constructor(public env: CombatEnv = nullEnv) {
    this.tokens = new AttackTokens((targetId) => (targetId === this.player?.id ? DIFFICULTY[this.difficulty].tokens : 2));
  }

  // ------------------------------------------------------------------ registry

  add(c: Combatant): Combatant {
    if (this.byId.has(c.id)) this.remove(this.byId.get(c.id)!);
    this.list.push(c);
    this.byId.set(c.id, c);
    if (c.isPlayer) this.player = c;
    return c;
  }

  remove(c: Combatant) {
    const i = this.list.indexOf(c);
    if (i >= 0) this.list.splice(i, 1);
    this.byId.delete(c.id);
    this.tokens.forget(c.id);
    this.aggro.delete(c.id);
    this.hearing.delete(c.id);
    this.followers.delete(c);
    this.perceptions.delete(c);
    this.los.delete(c);
    for (const o of this.list) {
      if (o.target === c) o.target = null;
      if (o.lockTarget === c) o.lockTarget = null;
      this.los.get(o)?.delete(c);
    }
    if (this.player === c) this.player = null;
  }

  get(id: string): Combatant | undefined {
    return this.byId.get(id);
  }

  /** Teams that fight on sight (both directions). */
  setHostile(a: string, b: string, on = true) {
    for (const k of [`${a}|${b}`, `${b}|${a}`]) {
      if (on) this.hostileTeams.add(k);
      else this.hostileTeams.delete(k);
    }
  }

  /** Would `a` strike `b` on purpose? Different hostile teams, or one is fighting the other. */
  hostile(a: Combatant, b: Combatant): boolean {
    if (a === b) return false;
    if (a.target === b || b.target === a) return true;
    if (a.team === b.team) return false;
    return this.hostileTeams.has(`${a.team}|${b.team}`);
  }

  /** `a` fights `b` (and an idle `b` fights back). */
  engage(a: Combatant, b: Combatant) {
    if (a === b || !b.active) return;
    if (a.status !== 'active' && a.status !== 'yielded') return;
    if (a.target !== b) {
      a.target = b;
      if (a.brain) a.driven = true;
    }
    if (!b.isPlayer && b.brain && !b.target && b.active) {
      b.target = a;
      b.driven = true;
    }
  }

  /** Stop fighting (the NPC module takes the body back). */
  disengage(a: Combatant) {
    a.target = null;
    this.tokens.release(a.id);
    a.guardWanted = false;
    if (a.brain && a.brain.state !== 'yield' && a.brain.state !== 'down') a.brain.setState('idle');
  }

  /** Fighting (or being fought) right now. */
  isInCombat(c: Combatant): boolean {
    if (!c.active) return false;
    if (c.isPlayer) return this.playerInCombat;
    return !!c.target;
  }

  get playerInCombat(): boolean {
    return this.now < this.playerCombatUntil;
  }

  // ------------------------------------------------------------------ the step

  fixedStep(dt: number) {
    this.now += dt;
    for (const c of this.list) this.tickState(c, dt);
    for (const c of this.list) if (c.driven && c.status !== 'fled') this.think(c, dt);
    this.tickProjectiles(dt);
    this.tickCombatPredicate();
    this.tickBout(dt);
  }

  private tickState(c: Combatant, dt: number) {
    const now = this.now;
    if (c.ownsVitals && c.status !== 'dead') {
      c.vitals.inCombat = !!c.target || c.status === 'ko';
      c.vitals.tick(dt);
    }
    tickPoise(c.poise, dt);
    if (c.isPlayer) {
      const heavy = c.inventory ? c.inventory.items.get(c.inventory.equipped('body') ?? '')?.armor?.weightClass === 'heavy' : false;
      const enemies = this.list.reduce((n, o) => n + (o.active && o.target === c ? 1 : 0), 0);
      const max = playerPoise(c.stats, { heavyBody: heavy, shieldRaised: c.guardActive && !!c.shield, enemies });
      if (max !== c.poise.max) {
        if (max > c.poise.max) c.poise.current += max - c.poise.max;
        c.poise.max = max;
        c.poise.current = Math.min(c.poise.current, max);
      }
    }
    const st = c.vitals.stamina;
    if (st.current <= 0.5) c.winded = true;
    else if (c.winded && st.current >= Math.min(st.max, STAMINA_COSTS.exhaustedUntil)) c.winded = false;
    if (c.bleeds.length) {
      c.bleeds = c.bleeds.filter((t) => t > now);
      if (c.bleeds.length && c.active) this.dealDamage(c.lastHitBy ? (this.get(c.lastHitBy) ?? null) : null, c, 2 * c.bleeds.length * dt, { bleed: true });
    }
    if (c.status === 'ko' && now >= c.koUntil) this.wake(c);
    if (c.status !== 'active') {
      if (c.guardActive) this.setGuardActive(c, false);
      return;
    }
    if (c.stun && now >= c.stun.until) c.stun = null;
    if (c.motion && now >= c.motion.until) c.motion = null;
    if (c.action) this.tickAction(c, c.action);
    const can = c.guardWanted && c.drawn && !c.stunned(now) && !c.attacking() && c.action?.kind !== 'dodge' && c.action?.kind !== 'draw' && c.action?.kind !== 'sheathe';
    if (can !== c.guardActive) this.setGuardActive(c, can);
  }

  private setGuardActive(c: Combatant, on: boolean) {
    c.guardActive = on;
    c.guardSince = on ? this.now : Infinity;
    c.vitals.blocking = on;
    c.view?.setBlocking(on);
  }

  private tickAction(c: Combatant, a: Action) {
    const now = this.now;
    switch (a.kind) {
      case 'charge': {
        c.view?.setCharge(chargeFraction(now - a.start));
        if (now - a.start >= TIMING.power.autoRelease) this.releaseCharge(c, a.direction ?? 'none');
        return;
      }
      case 'dodge':
      case 'draw':
      case 'sheathe':
        if (now >= a.end) c.action = null;
        return;
      case 'kneel':
        return;
    }
    if (a.cancelAt !== undefined && now >= a.cancelAt) {
      c.view?.setCharge(0);
      c.action = null;
      return;
    }
    if (!a.resolved && a.hitAt !== undefined && now >= a.hitAt + (a.viewed ? VIEW_GRACE : 0)) this.resolve(c, a);
    if (now >= a.end) {
      if (a.kind === 'light' || a.kind === 'riposte' || a.kind === 'sprint') c.lastLightEnd = now;
      if (c.action === a) c.action = null;
    }
  }

  // ------------------------------------------------------------------ verbs

  /** Free to start something: active, not stunned or netted, nothing else going on. */
  free(c: Combatant): boolean {
    return c.active && !c.stunned(this.now) && !c.entangled(this.now) && !c.action;
  }

  /** Light, power (NPC), bash, riposte, sprint, feint, net, sand kick. Returns false if refused. */
  startAttack(
    c: Combatant,
    kind: AttackKind,
    opts: { sprint?: boolean; minWindup?: number; direction?: 'none' | 'forward' | 'sideways' | 'back'; weapon?: WeaponStats } = {},
  ): boolean {
    const now = this.now;
    if (!this.free(c) || !c.drawn) return false;
    if (c.winded && kind !== 'net' && kind !== 'sandKick') {
      this.env.cue('stamina', c);
      return false;
    }
    const weapon = opts.weapon ?? c.weapon;
    // A light attack on a target whose riposte window is open is a riposte (§6.4).
    if (kind === 'light' && !opts.sprint) {
      const t = this.preferredTarget(c);
      if (t && t.riposteUntil > now && dist2D(t.position, c.position) <= meleeRange(weapon.reach, t.body.radius) + 0.6) kind = 'riposte';
    }
    if (opts.sprint && kind === 'light') kind = 'sprint';
    const npc = !c.isPlayer;
    const phases = attackPhases(kind, weapon.speed, { npc, minWindup: opts.minWindup });
    let chain = 1;
    if (kind === 'light') chain = now - c.lastLightEnd <= TIMING.chainGap && c.lastChain < 3 ? c.lastChain + 1 : 1;
    const power = kind === 'power';
    const cost = this.staminaCost(c, weapon, { power, bash: kind === 'bash', sprint: kind === 'sprint', none: kind === 'feint' || kind === 'net' || kind === 'sandKick' });
    if (cost > 0) c.vitals.drain('stamina', cost);
    const a: Action = {
      kind,
      start: now,
      phases,
      hitAt: now + phases.windup,
      end: now + attackLength(phases),
      resolved: false,
      chain,
      charge: power ? Math.min(phases.windup, COMBAT.attack.chargeMaxSec) : undefined,
      direction: power ? (opts.direction ?? 'none') : undefined,
      sprint: kind === 'sprint',
      unblockable: kind === 'net' || kind === 'sandKick',
      hyperArmor: power && ((c.weaponItem?.weight ?? 0) >= 2 || c.profile?.tier === 'boss'),
      weapon: opts.weapon,
    };
    if (kind === 'feint') {
      a.cancelAt = now + phases.windup * TIMING.feintCancel;
      a.end = a.cancelAt;
    }
    c.action = a;
    c.lastAttackAt = now;
    if (kind === 'light') c.lastChain = chain;
    if (c.isPlayer) {
      this.bout?.attacked();
      c.assist = kind === 'feint' ? null : (this.env.assistTarget?.(c, weapon) ?? null);
    }
    this.playAttackClip(c, a);
    this.stepFor(c, a);
    if (power || kind === 'net') this.env.sfx(this.voice(c, 'grunt'), this.chest(c), 0.9);
    if (a.unblockable && c.target?.isPlayer) this.env.cue('unblockable', c);
    return true;
  }

  /** Player: start holding a power attack (§6.1). */
  beginCharge(c: Combatant): boolean {
    if (!this.free(c) || !c.drawn) return false;
    if (c.winded) {
      this.env.cue('stamina', c);
      return false;
    }
    c.action = { kind: 'charge', start: this.now, end: Infinity, resolved: false, direction: 'none' };
    return true;
  }

  /** Player: latch a direction while charging (§6.1 direction latch). */
  latchDirection(c: Combatant, dir: 'none' | 'forward' | 'sideways' | 'back') {
    if (c.action?.kind === 'charge') c.action.direction = dir;
  }

  /** Release a held power attack: 0.15 s to the hit, 0.45 s recovery (÷ weapon speed). */
  releaseCharge(c: Combatant, direction?: 'none' | 'forward' | 'sideways' | 'back'): boolean {
    const ch = c.action;
    if (!ch || ch.kind !== 'charge') return false;
    const now = this.now;
    const held = now - ch.start;
    const dir = direction ?? ch.direction ?? 'none';
    c.action = null;
    const phases = attackPhases('power', c.weapon.speed);
    const cost = this.staminaCost(c, c.weapon, { power: true });
    c.vitals.drain('stamina', cost);
    const a: Action = {
      kind: 'power',
      start: now,
      phases,
      hitAt: now + phases.windup,
      end: now + attackLength(phases),
      resolved: false,
      charge: held,
      direction: dir,
      hyperArmor: (c.weaponItem?.weight ?? 0) >= 2,
    };
    c.action = a;
    c.lastAttackAt = now;
    if (c.isPlayer) {
      this.bout?.attacked();
      c.assist = this.env.assistTarget?.(c, c.weapon) ?? null;
    }
    this.playAttackClip(c, a, held);
    this.stepFor(c, a);
    this.env.sfx(this.voice(c, 'grunt'), this.chest(c), 0.9);
    return true;
  }

  /** Cancel a held charge (dodge, block). */
  cancelCharge(c: Combatant) {
    if (c.action?.kind === 'charge') {
      c.action = null;
      c.view?.setCharge(0);
    }
  }

  /**
   * Dodge in a world direction (unit; zero = a backstep): 2.5 m over 0.3 s, i-frames for the first
   * 0.12 s, 0.2 s recovery; 15 stamina, the third dodge within 1 s costs double (§6.1).
   */
  dodge(c: Combatant, dx: number, dz: number): boolean {
    const now = this.now;
    if (!c.active || c.stunned(now) || c.entangled(now)) return false;
    const a = c.action;
    // A dodge can cancel a charge, an attack's recovery, or the previous dodge's recovery.
    const inRecovery = a && a.hitAt !== undefined && a.resolved && now >= a.hitAt + (a.phases?.active ?? 0);
    const dodgeRecovery = a?.kind === 'dodge' && now >= a.start + TIMING.dodge.move;
    if (a && a.kind !== 'charge' && !inRecovery && !dodgeRecovery) return false;
    if (c.winded) {
      this.env.cue('stamina', c);
      return false;
    }
    if (a?.kind === 'charge') this.cancelCharge(c);
    const recent = c.dodges.filter((t) => now - t < TIMING.dodge.window);
    const cost = STAMINA_COSTS.dodge * (recent.length >= 2 ? 2 : 1);
    c.vitals.drain('stamina', cost);
    recent.push(now);
    c.dodges = recent;
    let x = dx;
    let z = dz;
    const len = Math.hypot(x, z);
    if (len < 1e-3) {
      x = -Math.sin(c.heading);
      z = -Math.cos(c.heading);
    } else {
      x /= len;
      z /= len;
    }
    const D = TIMING.dodge;
    c.action = { kind: 'dodge', start: now, end: now + D.move + D.recovery, resolved: true, dx: x, dz: z };
    c.iframesUntil = now + D.iframes;
    const v = D.distance / D.move;
    c.motion = { vx: x * v, vz: z * v, until: now + D.move, accel: 60 };
    this.env.sfx('cloth.rustle', this.chest(c), 0.6);
    return true;
  }

  /** Raise or lower the guard (it takes 0.1 s to protect). */
  setGuard(c: Combatant, wanted: boolean) {
    c.guardWanted = wanted;
  }

  /** A parry attempt: the window runs from now (§6.4). */
  pressParry(c: Combatant) {
    c.parryAt = this.now;
    c.parryUsed = false;
  }

  /** Parry window for a defender (difficulty, Practised Parry, the accessibility override). */
  parryWindow(c: Combatant): number {
    const o = this.env.parryWindowOverride();
    if (c.isPlayer && o !== null && o > 0) return o;
    return parryWindow(c.stats, c.isPlayer ? this.difficulty : 'normalis');
  }

  /** Draw or sheathe (0.5 s). */
  setDrawn(c: Combatant, drawn: boolean): boolean {
    if (drawn === c.drawn) return true;
    if (!c.active || c.action || c.stunned(this.now)) return false;
    c.drawn = drawn;
    c.action = { kind: drawn ? 'draw' : 'sheathe', start: this.now, end: this.now + (drawn ? TIMING.draw : TIMING.sheathe), resolved: true };
    c.view?.play(drawn ? 'drawWeapon' : 'sheathWeapon');
    c.view?.setDrawn(drawn);
    if (c.weapon.class === 'blade') this.env.sfx(drawn ? 'weapon.draw' : 'weapon.sheathe', this.chest(c), 0.8);
    if (!drawn) c.guardWanted = false;
    // Drawing a blade in a brawl makes it an assault (§6.9).
    if (drawn && c.brawl && c.weapon.class !== 'unarmed' && !c.weapon.practice) {
      for (const o of this.list) o.brawl = false;
      this.env.emit('combat:brawlEscalated', { by: c.id });
    }
    return true;
  }

  /** Caught in a net: no moving, attacking or dodging; a shield can still be raised (§6.8). */
  entangle(c: Combatant, seconds: number, by?: Combatant) {
    if (!c.active) return;
    if (c.action?.kind === 'charge') c.view?.setCharge(0);
    if (c.action && c.action.kind !== 'kneel') c.action = null;
    c.entangledUntil = this.now + seconds;
    c.parryUsed = true;
    c.view?.play('hitFront');
    this.env.cue('entangled', c);
    this.env.sfx('cloth.rustle', this.chest(c));
    if (by) this.env.emit('combat:hit', this.hitEvent(by, c, { kind: 'net', damage: 0 }));
  }

  /** One struggle press (E or F): −0.4 s of entanglement. */
  struggle(c: Combatant): boolean {
    if (!c.entangled(this.now)) return false;
    c.entangledUntil -= TIMING.net.perPress;
    c.view?.play('hitBack');
    if (!c.entangled(this.now)) this.env.cue('free', c);
    return true;
  }

  // ------------------------------------------------------------------ hits

  private viewHit(c: Combatant, a: Action) {
    if (c.action === a && !a.resolved && a.hitAt !== undefined && this.now >= a.hitAt - 0.12) this.resolve(c, a);
  }

  private resolve(c: Combatant, a: Action) {
    a.resolved = true;
    if (a.kind === 'net') return this.throwNet(c);
    if (a.kind === 'sandKick') return this.sandKick(c);
    if (a.kind === 'feint') return;
    const weapon = a.weapon ?? c.weapon;
    this.env.sfx(weapon.speed >= 1.2 ? 'swing.fast' : weapon.speed >= 0.95 ? 'swing.medium' : 'swing.slow', this.chest(c), 0.8);
    const targets = this.sweepTargets(c, a, weapon);
    for (const t of targets) this.applyHit(c, t, a, weapon);
    if (c.isPlayer) this.env.emit('combat:swing', { attackerId: c.id, power: a.kind === 'power', hits: targets.length, reach: BODY.handDist + weapon.reach });
  }

  /** Who the swing touches: the hand-socket sweep (geometry.ts) against every capsule in reach. */
  sweepTargets(c: Combatant, a: Action, weapon: WeaponStats): Combatant[] {
    const type = a.kind === 'bash' ? 'blunt' : attackTypeFor(weapon, { chain: a.chain, power: a.kind === 'power', direction: a.direction });
    const sweep = a.kind === 'power' && a.direction === 'sideways';
    const arc = arcFor(type, { sweep, overhead: a.kind === 'power' && (a.direction ?? 'none') === 'none', bash: a.kind === 'bash' });
    const pivot = tmpA;
    const s = c.body.height / BODY.height;
    if (!c.view?.shoulder(pivot)) pivot.set(c.position.x, c.position.y + BODY.shoulder * s, c.position.z);
    let handDist = BODY.handDist;
    let handY = pivot.y - 0.1;
    if (c.view?.hand(tmpB)) {
      const fx = Math.sin(c.heading);
      const fz = Math.cos(c.heading);
      // Along the facing: what the hand reaches in front of the shoulder line.
      handDist = clamp((tmpB.x - pivot.x) * fx + (tmpB.z - pivot.z) * fz, BODY.minHand, BODY.maxHand);
      handY = tmpB.y;
    }
    const spec = {
      x: pivot.x,
      y: pivot.y,
      z: pivot.z,
      heading: c.heading,
      handDist,
      reach: a.kind === 'bash' ? 0.35 : weapon.reach,
      arc,
      y0: Math.min(handY, pivot.y) - 0.95,
      y1: Math.max(handY, pivot.y) + 0.6,
    };
    const hits: { o: Combatant; ang: number; rank: number }[] = [];
    // The player's blows land on whoever they touch: anyone, anywhere (an attack on someone who
    // wasn't an enemy is an assault, §14.1). People in reach who aren't combatants yet are adopted
    // first so the blow can land. NPCs strike only their enemies (§6.1, AC-22).
    const power = a.kind === 'power';
    if (c.isPlayer) this.env.adoptNear?.(c, spec.handDist + spec.reach + 0.8, { power });
    const aim = c.isPlayer ? (c.assist ?? c.lockTarget ?? c.target) : (c.lockTarget ?? c.target);
    for (const o of this.list) {
      if (o === c || o.status === 'dead' || o.status === 'fled' || o.status === 'ko') continue;
      const hostile = this.hostile(c, o);
      if (!c.isPlayer && !hostile) continue;
      const yielded = o.status === 'yielded';
      // A sweep passes over the kneeling; the player's other blows take them only when they are
      // what the attack was aimed at.
      if (yielded && (sweep || (c.isPlayer && o !== aim))) continue;
      const p = o.position;
      const ang = sweepCapsule(spec, { x: p.x, z: p.z, y0: p.y + (yielded ? -0.3 : 0.1), y1: p.y + o.body.height, r: o.body.radius });
      if (ang < 0 || !this.sight(c, o)) continue;
      // Preference: the one aimed at, then an enemy on its feet, then anyone else.
      hits.push({ o, ang, rank: o === aim ? 0 : hostile ? 1 : 2 });
    }
    if (!hits.length) return [];
    if (sweep) return hits.map((h) => h.o);
    hits.sort((x, y) => x.rank - y.rank || x.ang - y.ang);
    return [hits[0].o];
  }

  /** Resolve one blow from `att` on `def` (§6.2–6.5, §6.7, §6.9, §6.10). */
  applyHit(att: Combatant, def: Combatant, a: Action, weapon: WeaponStats = a.weapon ?? att.weapon) {
    const now = this.now;
    const bout = this.bout;
    const player = att.isPlayer || def.isPlayer;
    // A blow by the player on someone who wasn't an enemy: an assault, with no skill XP and no
    // sneak bonus unless the player was deliberately sneaking.
    const bystander = att.isPlayer && !def.isPlayer && !this.hostile(att, def);
    if (bystander && def.active) {
      att.aggressor = true;
      this.env.emit('combat:assault', { attackerId: att.id, victimId: def.id, lawfulVictim: def.lawful });
    }
    if (now < def.iframesUntil) {
      if (a.unblockable && def.isPlayer) bout?.event('dodge-unblockable');
      return;
    }
    const toAtt = angleTo(def.heading, att.position.x - def.position.x, att.position.z - def.position.z);
    const frontal = Math.abs(toAtt) <= FRONT;
    const behind = Math.abs(toAtt) > 120 * DEG;
    const power = a.kind === 'power';
    const yieldedVictim = def.status === 'yielded';

    // Parry (§6.4): a press in the window before impact, facing the blow.
    let parryAsBlock = false;
    if (
      def.active &&
      !a.unblockable &&
      frontal &&
      def.drawn &&
      !def.parryUsed &&
      !def.entangled(now) &&
      !def.stunned(now) &&
      !def.attacking() &&
      now - def.parryAt <= this.parryWindow(def)
    ) {
      def.parryUsed = true;
      const pr = resolveParry({ attackerPoiseMax: att.poise.max, power, withShield: !!def.shield });
      if (pr.parried) {
        this.onParry(att, def, pr.attackerPoiseLoss, pr.attackerStagger, pr.riposteWindow);
        return;
      }
      parryAsBlock = true;
    }
    const blocking = def.active && !a.unblockable && frontal && (parryAsBlock || (def.guardActive && now - def.guardSince >= TIMING.guardUp));

    const unaware = !def.isPlayer && def.active && !def.target && (def.brain?.state ?? 'idle') === 'idle' && (!bystander || att.sneaking);
    const riposte = def.riposteUntil > now && def.active;
    if (riposte) def.riposteUntil = -Infinity;
    const finisher = riposte && def.healthFrac() <= COMBAT.parry.finisherAtHealth;
    const soldier = def.profile?.tier === 'miles' || def.profile?.tier === 'elite';
    const atk = computeAttack(att.stats, weapon, {
      chain: a.chain,
      power,
      chargeSeconds: a.charge,
      direction: a.direction ?? 'none',
      sprint: a.sprint,
      bash: a.kind === 'bash',
      riposte,
      sneak: unaware,
      item: a.weapon ? undefined : att.weaponItem,
      condition: a.weapon ? 1 : att.weaponCondition,
      vsSoldier: soldier,
      vsBeast: !def.human,
      critRoll: this.env.rng(),
    });

    // Fists or a fustis from behind on an unaware human up to veteran: instant knockout (§6.7).
    if (atk.takedown && behind && def.human && (TIER_RANK[def.profile?.tier ?? 'thug'] ?? 9) <= TIER_RANK.veteran) {
      this.knockout(def, att);
      if (att.isPlayer) att.sheet?.useSkill('brawling', XP.brawling.knockout);
      if (player) this.env.feedback('heavy');
      return;
    }

    const shield = this.effectiveShield(def);
    const hit = resolveHit({
      attack: atk,
      armor: def.armor,
      family: def.family,
      defender: def.stats,
      block: blocking
        ? {
            stats: def.stats,
            shield,
            twoHanded: !shield && (def.weapon.class === 'spear' || !!def.weapon.twoHanded),
            fists: !shield && def.weapon.class === 'unarmed',
            stamina: def.vitals.stamina.current,
            condition: def.shieldCondition,
            formation: this.formationBonus(def),
          }
        : undefined,
      mult: difficultyMult(this.difficulty, att.isPlayer, def.isPlayer),
    });

    if (hit.blocked) {
      def.vitals.drain('stamina', hit.blockStamina);
      if (hit.guardBroken) {
        this.stagger(def, TIMING.guardBreak, att, 'guardBreak');
        this.env.sfx('block.metal', this.chest(def));
      } else {
        def.view?.play('blockHit');
        this.push(def, att, TIMING.steps.blockImpact, 0.15);
        this.env.sfx(shield ? 'block.shield' : weapon.class === 'blade' || weapon.class === 'spear' ? 'clash.metal' : 'hit.punch', this.chest(def));
      }
      if (def.isPlayer) {
        def.sheet?.useSkill('shield', XP.shield.block + XP.shield.perAbsorbed * Math.max(0, atk.damage - hit.damage));
        if (shield) def.inventory?.wear('offHand', atk.damage);
      }
    }

    // Who struck comes first: a yield or flight the blow causes reads it ('actor:yielded' → the decision).
    def.lastHitAt = now;
    def.lastHitBy = att.id;
    const outcome = this.dealDamage(att, def, hit.damage, { finisher, weapon });

    let stagger = 'none';
    if (def.active && def.status === 'active') {
      const heavy = power || a.kind === 'bash' || a.kind === 'sprint';
      const immune = !!def.action?.hyperArmor && def.inWindup(now);
      const pr = applyPoiseDamage(def.poise, hit.poise, { heavy, immune, riposte });
      stagger = pr.result;
      if (pr.result === 'stagger') {
        this.stagger(def, pr.seconds, att, 'stagger');
        if (pr.riposteWindow) def.riposteUntil = now + COMBAT.parry.riposteWindow;
      } else if (pr.result === 'knockdown') this.knockdown(def, att);
      else if (pr.result === 'flinch') this.flinch(def, att, behind);
      else if (!hit.blocked && !def.action) def.view?.play(behind ? 'hitBack' : 'hitFront');
    }

    if (!hit.blocked) {
      this.env.sfx(atk.damageType === 'blunt' ? 'hit.punch' : 'hit.flesh', this.chest(def));
      if (def.status === 'active') this.env.sfx(this.voice(def, 'pain'), this.chest(def), 0.8);
      if (def.isPlayer) {
        this.env.emit('ui:hit', { x: att.position.x, z: att.position.z });
        const worn = def.inventory?.worn().map((w) => w.def) ?? [];
        const skill = armorSkillFor(worn);
        if (skill) def.sheet?.useSkill(skill, Math.min(XP.armor.max, XP.armor.hit + XP.armor.perDamage * hit.damage));
        def.inventory?.wear('body', hit.damage);
      }
      if (hit.bleedChance > 0 && this.env.rng() < hit.bleedChance && def.active) {
        if (def.isPlayer) def.sheet?.applyCondition('cruentus');
        else if (def.bleeds.length < 3) def.bleeds.push(now + 6);
      }
    }
    if (player) this.env.feedback(finisher || riposte ? 'heavy' : power && !hit.blocked ? 'power' : 'light');

    if (att.isPlayer) {
      const xp = bystander ? null : this.attackXp(weapon, { power, riposte, sneak: unaware, bash: a.kind === 'bash' });
      if (xp) att.sheet?.useSkill(xp.skill, xp.amount);
      if (!a.weapon) att.inventory?.wear('mainHand', hit.damage);
      if (bout && bout.foes.has(def.id)) {
        if (yieldedVictim) bout.event('strike-yielded');
        else if (finisher) bout.event('finisher');
        else if (riposte) bout.event('riposte');
        else if (power && !hit.blocked) bout.event('power-hit');
      }
    }

    // Striking down a yielded foe is the "kill" choice, made with the sword (§6.9, §6.10).
    if (yieldedVictim && att.isPlayer && (outcome === 'dead' || outcome === 'ko')) {
      if (bout?.foes.has(def.id)) {
        if (!bout.over) bout.decide(false);
        // lud-01's missio objective hears the choice made with the sword.
        this.env.emit('content:missio', { spared: false });
      }
      this.env.emit('combat:yieldChoice', { actorId: def.id, choice: 'kill' });
    }
    this.env.emit('combat:hit', this.hitEvent(att, def, { kind: a.kind, damage: hit.damage, blocked: hit.blocked, power, riposte, finisher, sneak: unaware, stagger }));
    if (outcome === 'hit' && !def.isPlayer && def.active && def.target !== att) {
      const wasIdle = !def.target;
      this.engage(def, att);
      if (wasIdle) this.callHelp(def);
    }
  }

  private onParry(att: Combatant, def: Combatant, poiseLoss: number, staggerS: number, window: number) {
    const now = this.now;
    att.poise.current = Math.max(0, att.poise.current - poiseLoss);
    this.stagger(att, staggerS, def, 'stagger');
    att.riposteUntil = now + window;
    def.view?.play('blockHit');
    this.env.sfx(def.shield ? 'block.shield' : 'clash.metal', this.chest(def));
    if (att.isPlayer || def.isPlayer) this.env.feedback('heavy');
    if (def.isPlayer) {
      def.sheet?.useSkill('shield', XP.shield.parry);
      if (this.bout?.foes.has(att.id)) this.bout.event('parry');
    }
    this.env.emit('combat:parry', { defenderId: def.id, attackerId: att.id });
    this.env.emit('combat:hit', this.hitEvent(att, def, { kind: att.action?.kind ?? 'light', damage: 0, parried: true, stagger: 'stagger' }));
    if (!def.isPlayer && !def.target) this.engage(def, att);
  }

  /**
   * Apply health damage with the §6.9 rules: practice arms, knockout weapons, brawls and essential
   * NPCs knock out instead of killing; an NPC that can yield doesn't die from the blow that
   * crosses its yield threshold (bosses never skip their yield); a finisher takes the rest.
   */
  dealDamage(att: Combatant | null, def: Combatant, amount: number, o: { finisher?: boolean; weapon?: WeaponStats; bleed?: boolean } = {}): 'hit' | 'ko' | 'dead' | 'yield' | 'flee' {
    const v = def.vitals;
    if (def.status === 'dead' || def.status === 'ko' || !(amount > 0) || v.invulnerable) return 'hit';
    const max = v.health.max;
    const hp = v.health.current;
    const yieldAt = def.brain?.profile.yieldAt ?? def.profile?.yieldAt ?? 0;
    const canYield = !def.isPlayer && def.status === 'active' && yieldAt > 0 && !def.yieldedOnce && !def.profile?.beast;
    const floor = canYield && hp > yieldAt * max ? yieldAt * max : 0;
    if (o.finisher) amount = Math.max(amount, hp - floor);
    const dealt = floor > 0 ? Math.min(amount, hp - floor) : amount;
    const nonLethal = this.nonLethal(att, def, o.weapon);
    if (nonLethal && dealt >= hp - 1e-6) {
      v.set('health', 0);
      if (att) v.lastDamageSource = att.id;
      this.knockout(def, att);
      return 'ko';
    }
    v.damage(dealt, att?.id);
    if (v.dead) {
      this.kill(def, att);
      return 'dead';
    }
    if (!def.isPlayer && def.status === 'active') {
      const f = v.fraction('health');
      if (canYield && f <= yieldAt + 1e-6) {
        if (def.brain?.profile.prefersFlee) {
          this.startFlee(def);
          return 'flee';
        }
        this.yieldNpc(def, att);
        return 'yield';
      }
      const fleeAt = def.brain?.profile.fleeAt ?? def.profile?.fleeAt ?? 0;
      if (fleeAt > 0 && f <= fleeAt && def.brain?.state !== 'flee') {
        this.startFlee(def);
        return 'flee';
      }
    }
    return 'hit';
  }

  /** §6.9 / §6.10: does 0 health mean a knockout rather than death? */
  nonLethal(att: Combatant | null, def: Combatant, weapon?: WeaponStats): boolean {
    if (def.essential) return true;
    if (this.bout?.lusio && (def.isPlayer || this.bout.foes.has(def.id))) return true;
    if (def.brawl && (!att || att.brawl)) return true;
    const w = weapon ?? att?.weapon;
    if (!w || !def.human) return false;
    if (w.practice) return true;
    const tags = att?.weaponItem?.tags ?? [];
    if (w.class === 'unarmed' || tags.includes('knockout')) return true;
    if (tags.includes('knockout-miles')) {
      const rank = TIER_RANK[def.profile?.tier ?? (def.isPlayer ? 'miles' : 'thug')] ?? 9;
      const subdue = !!att?.stats.hasFlag('perk-brawling-subdue') && def.profile?.tier !== 'boss';
      return rank <= TIER_RANK.miles || subdue;
    }
    return false;
  }

  // ------------------------------------------------------------------ reactions

  stagger(c: Combatant, seconds: number, by: Combatant | null, kind: 'stagger' | 'guardBreak' = 'stagger') {
    if (!c.active) return;
    if (c.action?.kind === 'charge') c.view?.setCharge(0);
    if (c.action && c.action.kind !== 'kneel') c.action = null;
    c.stun = { kind, until: this.now + seconds };
    c.view?.play('stagger', { speed: clamp(1.15 / seconds, 0.6, 1.6) });
    if (by) this.push(c, by, seconds >= 1.2 ? TIMING.steps.staggerLong : TIMING.steps.staggerShort, 0.4);
  }

  knockdown(c: Combatant, by: Combatant | null) {
    if (!c.active) return;
    if (c.action && c.action.kind !== 'kneel') c.action = null;
    c.stun = { kind: 'knockdown', until: this.now + TIMING.knockdownTime };
    c.view?.play('knockdown', { speed: 2.75 / TIMING.knockdownTime });
    if (by) this.push(c, by, TIMING.steps.knockdown, 0.5);
  }

  /** A flinch interrupts only a light wind-up, never a block, a dodge or a recovery (§6.5). */
  private flinch(c: Combatant, by: Combatant, behind: boolean) {
    const a = c.action;
    const lightish = a && (a.kind === 'light' || a.kind === 'riposte' || a.kind === 'sprint' || a.kind === 'feint') && c.inWindup(this.now);
    if (lightish) {
      c.action = null;
      c.view?.setCharge(0);
      c.stun = { kind: 'flinch', until: this.now + 0.25 };
      c.view?.play(behind ? 'hitBack' : 'hitFront');
    } else if (!a && !c.guardActive) c.view?.play(behind ? 'hitBack' : 'hitFront');
    void by;
  }

  /** Push `c` away from `from` by `meters` (negative = back) over `seconds`. */
  private push(c: Combatant, from: Combatant, meters: number, seconds: number) {
    let dx = c.position.x - from.position.x;
    let dz = c.position.z - from.position.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    const v = -meters / seconds;
    c.motion = { vx: dx * v, vz: dz * v, until: this.now + seconds, accel: 30 };
  }

  knockout(def: Combatant, by: Combatant | null, seconds = def.isPlayer ? TIMING.playerKnockout : TIMING.knockout) {
    if (def.status === 'dead' || def.status === 'ko' || def.vitals.invulnerable) return;
    const essential = def.essential && !def.isPlayer;
    const foes = def.isPlayer ? this.list.filter((o) => o.target === def).map((o) => o.id) : undefined;
    def.status = 'ko';
    def.koUntil = this.now + (essential ? 3 : seconds);
    this.downed(def);
    def.view?.setDead(true);
    this.env.sfx('body.fall', this.chest(def));
    this.env.emit('combat:knockout', { actorId: def.id, byId: by?.id, seconds: essential ? 3 : seconds });
    // Out of the fight: quests count a knockout like a kill (docs/CONTENT.md `kill:<tag>`).
    this.env.emit('actor:killed', { victimId: def.id, killerId: by?.id, tags: this.outcomeTags(def, 'ko') });
    if (by?.isPlayer && (by.weapon.skill === 'brawling' || by.weapon.class === 'unarmed')) by.sheet?.useSkill('brawling', XP.brawling.knockout);
    const bout = this.bout;
    if (def.isPlayer) {
      const outcome = bout?.lusio ? 'saniarium-no-purse' : def.brawl ? 'brawl-lost' : 'knocked-out';
      this.boutOver('foe');
      this.env.emit('combat:playerDefeated', { outcome, byId: by?.id, lusio: !!bout?.lusio, foes });
    } else if (bout && bout.foes.has(def.id)) this.foeDown(def);
  }

  /** The tags 'actor:killed' carries: the combatant's own (quest tags, archetype) and how it ended. */
  outcomeTags(c: Combatant, how: 'dead' | 'ko' | 'fled'): string[] {
    const tags = [...c.tags];
    const arch = c.profile?.archetype;
    if (arch && !tags.includes(arch)) tags.push(arch);
    tags.push(how);
    return tags;
  }

  kill(def: Combatant, by: Combatant | null) {
    if (def.status === 'dead' || def.vitals.invulnerable) return;
    def.status = 'dead';
    // Dead by the rules even when the blow didn't take the last point (a refused missio, Hold F).
    if (!def.vitals.dead) def.vitals.damage(def.vitals.health.current + 1, by?.id);
    this.downed(def);
    def.view?.setDead(true);
    def.body.setGhost?.(true);
    this.env.sfx(this.voice(def, 'death'), this.chest(def));
    this.env.sfx('body.fall', this.chest(def));
    const p = def.position;
    this.env.emit('actor:killed', { victimId: def.id, killerId: by?.id, tags: this.outcomeTags(def, 'dead') });
    this.env.emit('combat:death', {
      actorId: def.id,
      killerId: by?.id,
      loot: def.profile?.loot,
      worn: def.profile?.worn ? [...def.profile.worn] : [],
      weapon: def.weaponItem?.id ?? def.profile?.weapon,
      shield: def.shieldItem?.id ?? def.profile?.shield,
      x: p.x,
      y: p.y,
      z: p.z,
    });
    if (def.isPlayer) {
      this.boutOver('foe');
      this.env.emit('combat:playerDefeated', { outcome: 'death', byId: by?.id, lusio: !!this.bout?.lusio });
    } else if (this.bout?.foes.has(def.id)) this.foeDown(def);
  }

  /** Common to death, knockout and yield: stop acting, give back tokens, drop out of fights. */
  private downed(c: Combatant) {
    if (c.action?.kind === 'charge') c.view?.setCharge(0);
    c.action = null;
    c.stun = null;
    c.motion = null;
    c.guardWanted = false;
    if (c.guardActive) this.setGuardActive(c, false);
    c.bleeds.length = 0;
    this.tokens.forget(c.id);
    c.target = null;
    c.brain?.setState(c.status === 'yielded' ? 'yield' : 'down');
    for (const o of this.list) {
      if (o.target === c) {
        o.target = null;
        this.tokens.release(o.id);
      }
      if (o.lockTarget === c && c.status !== 'yielded') o.lockTarget = null;
    }
  }

  private foeDown(def: Combatant) {
    const bout = this.bout!;
    const foesLeft = [...bout.foes].some((id) => this.get(id)?.active);
    if (!foesLeft && def.status !== 'yielded') this.boutOver('player');
  }

  /** Finish the bout (if it isn't already) and announce its end exactly once. */
  private boutOver(winner: 'player' | 'foe' | 'draw') {
    const b = this.bout;
    if (!b) return;
    b.finish(winner);
    if (b.reported) return;
    b.reported = true;
    const w = b.winner ?? winner;
    this.env.emit('combat:bout', { phase: 'end', lusio: b.lusio, winner: w, favor: b.favor, purse: w === 'player' ? b.purse() : undefined });
  }

  /** Back on its feet after a knockout. */
  wake(c: Combatant) {
    c.status = 'active';
    c.koUntil = Infinity;
    c.vitals.set('health', Math.max(c.vitals.health.current, c.vitals.health.max * 0.25));
    c.poise.current = c.poise.max;
    c.view?.setDead(false);
    c.body.setGhost?.(false);
    c.target = null;
    c.brain?.setState('idle');
  }

  /** Yield (§6.9): drop the weapon and kneel (in the arena: ad digitum). */
  yieldNpc(c: Combatant, by: Combatant | null) {
    if (c.status !== 'active') return;
    c.status = 'yielded';
    c.yieldedOnce = true;
    c.yieldedAt = this.now;
    this.downed(c);
    c.drawn = false;
    c.action = { kind: 'kneel', start: this.now, end: Infinity, resolved: true };
    c.view?.play('yield');
    this.env.emit('actor:yielded', { actorId: c.id, byId: by?.id });
    const bout = this.bout;
    if (bout && bout.foes.has(c.id)) {
      const chant = bout.foeYielded({ foeFoughtWell: c.lastAttackAt > 0 && bout.t > 40 });
      this.env.emit('ui:subtitle', { text: chant === 'mitte' ? 'Mitte! Mitte!' : 'Iugula! Iugula!', speaker: 'The crowd', duration: 4 });
    }
  }

  /**
   * The player's decision over a yielded foe. Spare: he stands up and leaves the fight. Kill:
   * a deliberate blow (practice arms knock him out instead). The RPG consequences (Pietas,
   * Fama, crime) are applied by the caller through rpg/yield.ts.
   */
  decideYielded(c: Combatant, choice: 'spare' | 'rob' | 'arrest' | 'kill', o: { purse?: number } = {}) {
    if (c.status !== 'yielded') return;
    const bout = this.bout && this.bout.foes.has(c.id) ? this.bout : null;
    if (choice === 'kill') {
      bout?.decide(false);
      c.status = 'active';
      if (this.nonLethal(this.player, c)) this.knockout(c, this.player);
      else this.kill(c, this.player);
    } else {
      bout?.decide(true);
      c.action = null;
      c.status = 'active';
      c.team = `spared:${c.id}`;
      c.brain?.setState('idle');
      c.driven = false;
      c.view?.play('interact');
    }
    if (bout) this.boutOver('player');
    this.env.emit('combat:yieldChoice', { actorId: c.id, choice, purse: o.purse });
    // The arena's missio (lud-01 'Decide Nereus' missio' listens for it, docs/CONTENT.md).
    if (bout) this.env.emit('content:missio', { spared: choice !== 'kill' });
  }

  /**
   * Nobody decided (the player walked off, or the yield wasn't to the player): he gets up and goes
   * about his business, with no consequences for anyone.
   */
  releaseYielded(c: Combatant) {
    if (c.status !== 'yielded') return;
    c.action = null;
    c.status = 'active';
    c.team = `spared:${c.id}`;
    c.target = null;
    c.brain?.setState('idle');
    c.driven = false;
    c.view?.play('interact');
  }

  startFlee(c: Combatant) {
    if (!c.active) return;
    this.tokens.forget(c.id);
    if (c.action?.kind === 'charge') c.view?.setCharge(0);
    c.action = null;
    c.guardWanted = false;
    c.brain?.setState('flee');
  }

  /** Call for help (§6.13): allies of the group within 30 m (20 at night) join; lawful guards join against an aggressor. */
  callHelp(c: Combatant) {
    const t = c.target;
    if (!t) return;
    const r = this.env.night() ? 20 : 30;
    for (const o of this.list) {
      if (o === c || !o.active || o.target || !o.brain || o.isPlayer) continue;
      if (dist2D(o.position, c.position) > r) continue;
      const ally = o.group === c.group;
      const law = o.lawful && t.isPlayer && t.aggressor;
      if (ally || law) this.engage(o, t);
    }
    this.env.emit('combat:callHelp', { actorId: c.id, targetId: t.id, x: c.position.x, z: c.position.z, radius: r });
  }

  // ------------------------------------------------------------------ AI bridge

  private think(c: Combatant, dt: number) {
    const now = this.now;
    if (!c.brain || c.status === 'dead' || c.status === 'ko') {
      c.body.move(this.motionFor(c) ?? ZERO, dt, 30);
      return;
    }
    if (c.target && (!c.target.active || c.target.status !== 'active')) {
      c.target = null;
      this.tokens.release(c.id);
    }
    if (c.status === 'yielded') {
      c.body.move(ZERO, dt, 30);
      return;
    }
    if (!c.target && c.brain.state !== 'flee') this.acquire(c);
    const b = c.brain;
    const I = b.tick(this.perceive(c), this.services(c), dt);
    if (I.yield) this.yieldNpc(c, c.lastHitBy ? (this.get(c.lastHitBy) ?? null) : null);
    if (I.flee) this.startFlee(c);
    if (c.status !== 'active') {
      c.body.move(ZERO, dt, 30);
      return;
    }
    // Bosses fight alone (adds are scripted, §13.2).
    if (I.shout && c.profile?.tier !== 'boss') this.callHelp(c);
    if (I.phase) this.env.emit('combat:phase', { actorId: c.id, phase: I.phase });
    if (c.target && !c.drawn && !c.action && b.state !== 'flee') this.setDrawn(c, true);
    if (I.attack) this.npcAttack(c, I.attack, I.minWindup);
    if (I.special) this.npcSpecial(c, I.special);
    if (I.parry) this.pressParry(c);
    c.guardWanted = I.guard;
    // Facing: track the target through the wind-up (slower), hold still while striking.
    const a = c.action;
    const striking = !!a && c.attacking() && a.kind !== 'charge' && !c.inWindup(now);
    if (I.face !== null && !c.stunned(now) && !striking && !c.entangled(now)) {
      const rate = a && c.inWindup(now) ? 3.5 : 9;
      c.body.heading = approachAngle(c.body.heading, I.face, rate * dt);
    }
    const m = this.motionFor(c);
    // Round walls, carts and stalls toward where the brain is heading (and never stuck, AC-22).
    if (!m && this.env.nav) this.follower(c).steer({ now, x: c.position.x, y: c.position.y, z: c.position.z, radius: c.body.radius, goal: I.goal, wish: I.move, free: !c.action && !c.stunned(now) });
    c.body.move(m ?? I.move, dt, m?.accel);
    // The fight is over for an NPC another module owns: hand the body back.
    if (!c.keepDriven && !c.target && b.state === 'idle' && !c.action && !c.motion) {
      c.driven = false;
      return;
    }
    if (b.state === 'flee') {
      // Away from whoever it runs from (the last to hit it, else its foe); gone at 30 m, or after 15 s.
      const from = (c.lastHitBy ? this.get(c.lastHitBy) : null) ?? c.target ?? this.player;
      c.fleeSince ??= now;
      if (!from || dist2D(from.position, c.position) > 30 || now - c.fleeSince > 15) {
        c.status = 'fled';
        c.target = null;
        c.driven = false;
        this.env.emit('combat:fled', { actorId: c.id });
        this.env.emit('actor:killed', { victimId: c.id, killerId: from?.id, tags: this.outcomeTags(c, 'fled') });
        if (this.bout?.foes.has(c.id)) this.foeDown(c);
      }
    }
  }

  /**
   * Spawned hostiles attack on sight within their aggro radius, and notice a hostile they can't
   * see within their hearing radius (default 5 m; a quest's ambushers know where you are).
   */
  private acquire(c: Combatant) {
    const r = this.aggro.get(c.id) ?? 0;
    if (r <= 0) return;
    const hear = Math.min(r, this.hearing.get(c.id) ?? HEAR);
    let best: Combatant | null = null;
    let bestD = r;
    for (const o of this.list) {
      if (o === c || !o.active || !this.hostile(c, o)) continue;
      const d = dist2D(o.position, c.position);
      if (d < bestD && (d <= hear || this.sight(c, o))) {
        best = o;
        bestD = d;
      }
    }
    if (best) this.engage(c, best);
  }

  /** The route-finder of a driven NPC (created on first use). */
  follower(c: Combatant): PathFollower {
    let f = this.followers.get(c);
    if (!f) {
      f = new PathFollower(this.env.nav!);
      f.lastProgressAt = this.now;
      f.onStuck = () => c.brain?.state === 'circle' && c.brain.flipCircle(this.now);
      this.followers.set(c, f);
    }
    return f;
  }

  /** How long the longest-stuck driven NPC has been trying to move without progress (AC-22 logs). */
  worstStuck(): { id: string; seconds: number } | null {
    let best: { id: string; seconds: number } | null = null;
    for (const [c, f] of this.followers) {
      if (!c.driven || !c.active) continue;
      const s = f.stuckFor(this.now);
      if (!best || s > best.seconds) best = { id: c.id, seconds: s };
    }
    return best;
  }

  private npcAttack(c: Combatant, kind: 'light' | 'power' | 'feint' | 'bash', minWindup?: number) {
    if (!this.free(c)) return;
    // An NPC's bash keeps a readable telegraph (§6.5) and needs the shield.
    if (kind === 'bash') {
      if (c.shield) this.startAttack(c, 'bash', { minWindup: Math.max(minWindup ?? 0, TIMING.npcMinWindup.bash) });
      else this.startAttack(c, 'light', { minWindup });
      return;
    }
    let weapon: WeaponStats | undefined;
    // Nereus in phase 3: the practice dagger at close range.
    if (c.script && c.script.phase >= 3 && c.target && dist2D(c.target.position, c.position) < 1.4 && kind === 'light') weapon = PRACTICE_DAGGER;
    this.startAttack(c, kind, { minWindup, weapon });
  }

  private npcSpecial(c: Combatant, special: string) {
    if (!this.free(c)) return;
    if (special === 'net' && c.hasNet) this.startAttack(c, 'net');
    else if (special === 'sandKick') this.startAttack(c, 'sandKick');
  }

  /** What an NPC brain sees this step. */
  perceive(c: Combatant): Perception {
    const now = this.now;
    const t = c.target;
    let p = this.perceptions.get(c);
    if (!p) {
      p = {
        now,
        self: { x: 0, z: 0, heading: 0, health: 1, stamina: 1, busy: false, canAct: false, reach: 1, guardable: true },
        target: null,
        allies: [],
        night: false,
      };
      this.perceptions.set(c, p);
    }
    p.now = now;
    p.night = this.env.night();
    const self = p.self;
    self.x = c.position.x;
    self.z = c.position.z;
    self.heading = c.heading;
    self.health = c.healthFrac();
    self.stamina = c.vitals.fraction('stamina');
    self.busy = !!c.action || c.stunned(now) || c.entangled(now);
    self.canAct = this.free(c) && !c.winded;
    self.reach = meleeRange(c.weapon.reach, t?.body.radius ?? BODY.radius);
    self.guardable = true;
    self.shield = !!c.shield;
    self.hasNet = c.hasNet;
    self.lastHitAt = c.lastHitAt;
    if (t) {
      const ta = t.action;
      const tp: TargetPerception = (p.target ??= { id: '', x: 0, z: 0, heading: 0, visible: false, reach: 1, attacking: false, power: false, impactIn: Infinity, facingMe: false });
      const d = dist2D(t.position, c.position);
      tp.id = t.id;
      tp.x = t.position.x;
      tp.z = t.position.z;
      tp.heading = t.heading;
      // Seen, or close enough to hear (an ambusher knows where you are): it keeps track.
      tp.visible = d <= Math.max(TRACK, this.hearing.get(c.id) ?? 0) || this.sight(c, t);
      tp.reach = meleeRange(t.weapon.reach, c.body.radius);
      tp.attacking = t.attacking();
      tp.power = ta?.kind === 'charge' || (ta?.kind === 'power' && t.inWindup(now));
      tp.impactIn = ta && ta.hitAt !== undefined && !ta.resolved ? ta.hitAt - now : Infinity;
      tp.facingMe = Math.abs(angleTo(t.heading, c.position.x - t.position.x, c.position.z - t.position.z)) <= FRONT;
      tp.entangled = t.entangled(now);
    } else p.target = null;
    // Allies close by, from a pool of points kept with the record.
    const allies = p.allies as { x: number; z: number }[];
    let n = 0;
    for (const o of this.list) {
      if (o === c || !o.active || o.isPlayer || o.team !== c.team) continue;
      if (Math.abs(o.position.x - c.position.x) >= 2 || Math.abs(o.position.z - c.position.z) >= 2) continue;
      const a = (allies[n] ??= { x: 0, z: 0 });
      a.x = o.position.x;
      a.z = o.position.z;
      n++;
    }
    allies.length = n;
    return p;
  }

  private svc = new WeakMap<Combatant, BrainServices>();

  /** Token access bound to a combatant and its current target (cached; reads the target live). */
  private services(c: Combatant): BrainServices {
    let s = this.svc.get(c);
    if (!s) {
      s = {
        requestToken: (cost) => (c.target ? this.tokens.request(c.id, c.target.id, cost, this.now) : false),
        releaseToken: () => this.tokens.release(c.id),
        holdsToken: () => (c.target ? this.tokens.holds(c.id, c.target.id) : false),
        tokenOverdue: () => this.tokens.overdue(c.id, this.now),
        rng: () => this.env.rng(),
      };
      this.svc.set(c, s);
    }
    return s;
  }

  /** Line of sight, cached 0.2 s per pair (entries go with the combatant, see remove). */
  sight(a: Combatant, b: Combatant): boolean {
    let row = this.los.get(a);
    if (!row) this.los.set(a, (row = new Map()));
    const e = row.get(b);
    if (e && this.now - e.at < 0.2) return e.ok;
    const ok = this.env.lineOfSight(a, b);
    if (e) {
      e.at = this.now;
      e.ok = ok;
    } else row.set(b, { at: this.now, ok });
    return ok;
  }

  // ------------------------------------------------------------------ motion

  /**
   * Code displacement for this step (dodges, steps, pushes), or a stop; null = free movement. The
   * returned object is reused: read it at once.
   */
  motionFor(c: Combatant): { x: number; z: number; accel: number } | null {
    const now = this.now;
    const m = MOTION;
    if (c.status !== 'active' && c.status !== 'fled') return set3(m, 0, 0, 30);
    if (c.motion && now < c.motion.until) return set3(m, c.motion.vx, c.motion.vz, c.motion.accel);
    if (c.entangled(now) || c.stunned(now) || c.action?.kind === 'kneel') return set3(m, 0, 0, 20);
    if (!c.isPlayer && c.attacking() && c.action?.kind !== 'charge') return set3(m, 0, 0, 20);
    return null;
  }

  /** Attack steps (§6.15 displacement column): +0.3 light, +0.5 overhead, ±1.5 lunge/back, +0.6 riposte, +0.4 bash. */
  private stepFor(c: Combatant, a: Action) {
    const S = TIMING.steps;
    let m = 0;
    switch (a.kind) {
      case 'light':
        m = S.light;
        break;
      case 'riposte':
        m = S.riposte;
        break;
      case 'bash':
        m = S.bash;
        break;
      case 'sprint':
        m = 1.2;
        break;
      case 'power':
        m = a.direction === 'forward' ? S.lunge : a.direction === 'back' ? S.back : a.direction === 'sideways' ? 0 : S.power;
        break;
      default:
        return;
    }
    const w = Math.max(0.12, a.phases?.windup ?? 0.2);
    // The player's aim assist: close the gap to the one the attack is meant for over the wind-up
    // (up to a long step; a forward power attack lunges further), so a swing from a pace too far
    // still lands, and stop short of walking into them.
    const aim = c.isPlayer ? c.assist : null;
    if (aim && m >= 0) {
      const dx = aim.position.x - c.position.x;
      const dz = aim.position.z - c.position.z;
      const d = Math.hypot(dx, dz);
      const reach = (a.kind === 'bash' ? 0.35 : (a.weapon ?? c.weapon).reach) * 0.75 + BODY.handDist + aim.body.radius;
      const max = a.kind === 'power' && a.direction === 'forward' ? S.lunge + 0.5 : a.kind === 'power' || a.kind === 'sprint' ? 1.6 : 1.2;
      const gap = Math.min(max, Math.max(0, d - reach));
      if (d > 0.01 && gap > 0.02) {
        const v = gap / w;
        c.motion = { vx: (dx / d) * v, vz: (dz / d) * v, until: this.now + w, accel: 30 };
      }
      return;
    }
    const t = this.preferredTarget(c);
    // Don't step into someone already at arm's length.
    if (m > 0 && t && dist2D(t.position, c.position) < c.body.radius + t.body.radius + 0.35) return;
    const v = m / w;
    c.motion = { vx: Math.sin(c.heading) * v, vz: Math.cos(c.heading) * v, until: this.now + w, accel: 25 };
  }

  /** The lock or fight target, else the nearest hostile in front. */
  preferredTarget(c: Combatant): Combatant | null {
    if (c.lockTarget?.active || c.lockTarget?.status === 'yielded') return c.lockTarget;
    if (c.target?.active) return c.target;
    let best: Combatant | null = null;
    let bd = 3;
    for (const o of this.list) {
      if (o === c || !o.active || !this.hostile(c, o)) continue;
      const d = dist2D(o.position, c.position);
      if (d < bd && Math.abs(angleTo(c.heading, o.position.x - c.position.x, o.position.z - c.position.z)) < 70 * DEG) {
        best = o;
        bd = d;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ Nereus

  private throwNet(c: Combatant) {
    const t = c.target;
    if (!t || !c.hasNet) return;
    const N = TIMING.net;
    const from = this.chest(c);
    const flight = dist2D(t.position, c.position) / N.speed;
    const tv = t.body.velocity?.() ?? ZERO;
    const ax = t.position.x + tv.x * flight * 0.6 - from.x;
    const az = t.position.z + tv.z * flight * 0.6 - from.z;
    const d = Math.hypot(ax, az) || 1;
    const p: Projectile = {
      id: ++this.projectileSeq,
      kind: 'net',
      owner: c,
      x: from.x,
      y: from.y,
      z: from.z,
      vx: (ax / d) * N.speed,
      vz: (az / d) * N.speed,
      ttl: (N.range + 0.8) / N.speed,
      radius: 0.55,
      dodged: new Set(),
    };
    this.projectiles.push(p);
    this.env.projectileVisual?.(p, true);
    this.env.sfx('swing.slow', from);
  }

  private sandKick(c: Combatant) {
    const t = c.target;
    if (!t || !t.active) return;
    const K = TIMING.sandKick;
    if (dist2D(t.position, c.position) > K.range) return;
    if (Math.abs(angleTo(c.heading, t.position.x - c.position.x, t.position.z - c.position.z)) > FRONT) return;
    if (this.now < t.iframesUntil) {
      if (t.isPlayer) this.bout?.event('dodge-unblockable');
      return;
    }
    t.blindUntil = this.now + K.blind;
    this.env.cue('blind', t);
    this.env.sfx('cloth.rustle', this.chest(t));
  }

  private tickProjectiles(dt: number) {
    const now = this.now;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.ttl -= dt;
      let done = p.ttl <= 0;
      if (!done) {
        for (const o of this.list) {
          if (o === p.owner || !o.active || !this.hostile(p.owner, o) || p.dodged.has(o.id)) continue;
          if (Math.hypot(o.position.x - p.x, o.position.z - p.z) > p.radius + o.body.radius) continue;
          if (now < o.iframesUntil) {
            p.dodged.add(o.id);
            if (o.isPlayer) this.bout?.event('dodge-unblockable');
            continue;
          }
          const boss = o.profile?.tier === 'boss';
          this.entangle(o, boss ? TIMING.net.entangleBoss : TIMING.net.entangle, p.owner);
          done = true;
          break;
        }
      }
      if (done) {
        this.projectiles.splice(i, 1);
        this.env.projectileVisual?.(p, false);
      }
    }
  }

  // ------------------------------------------------------------------ the player's combat state, arena

  private tickCombatPredicate() {
    const p = this.player;
    if (!p) return;
    const now = this.now;
    const R = TIMING.inCombat;
    for (const c of this.list) {
      if (c === p || !c.active || c.target !== p || !c.brain) continue;
      const s = c.brain.state;
      if (s === 'flee' || s === 'yield' || s === 'idle') continue;
      if (dist2D(c.position, p.position) <= R.radius) this.playerCombatUntil = now + R.memory;
    }
    const inC = p.active && now < this.playerCombatUntil;
    if (!p.ownsVitals) p.vitals.inCombat = inC;
    if (inC !== this.wasInCombat) {
      this.wasInCombat = inC;
      this.env.emit(inC ? 'combat:started' : 'combat:ended', {});
    }
  }

  startBout(o: BoutOptions): ArenaBout {
    const bout = new ArenaBout({ ...o, tiro: o.tiro ?? this.difficulty === 'tiro' });
    bout.onChange = (favor, delta, reason) => this.env.emit('combat:favor', { favor, delta, reason });
    this.bout = bout;
    this.env.emit('combat:bout', { phase: 'start', lusio: bout.lusio, favor: bout.favor });
    return bout;
  }

  private tickBout(dt: number) {
    const b = this.bout;
    const p = this.player;
    if (!b || b.over || !p) return;
    let nearest: Combatant | null = null;
    let nd = Infinity;
    for (const id of b.foes) {
      const f = this.get(id);
      if (!f?.active) continue;
      const d = dist2D(f.position, p.position);
      if (d < nd) {
        nd = d;
        nearest = f;
      }
    }
    let retreating = false;
    const v = p.body.velocity?.();
    if (nearest && v && nd > 2.2) {
      const dx = (p.position.x - nearest.position.x) / nd;
      const dz = (p.position.z - nearest.position.z) / nd;
      retreating = v.x * dx + v.z * dz > 1;
    }
    b.tick(dt, retreating);
  }

  /** The player holds Y (§6.9): brawl → lose 10 % of the purse; arena → missio; a lawful foe → arrest. */
  playerYield(): { context: 'brawl' | 'arena' | 'arrest' | 'none'; spared?: boolean; outcome?: string } {
    const p = this.player;
    if (!p || !p.active) return { context: 'none' };
    const foes = this.list.filter((c) => c.active && c.target === p);
    const stop = () => {
      for (const f of foes) this.disengage(f);
      this.playerCombatUntil = this.now;
      p.action = null;
      p.guardWanted = false;
    };
    // Quests hear the player give up like any other yield ('actor:yielded', actorId 'player').
    const by = foes[0]?.id;
    if (this.bout && !this.bout.over) {
      const r = this.bout.playerYields(this.env.rng);
      stop();
      p.view?.play('yield');
      this.env.emit('actor:yielded', { actorId: p.id, byId: by });
      this.env.emit('combat:playerYielded', { context: 'arena', spared: r.spared, outcome: r.outcome });
      this.boutOver('foe');
      if (!r.spared && r.outcome === 'death') this.kill(p, null);
      return { context: 'arena', spared: r.spared, outcome: r.outcome };
    }
    if (foes.length && foes.every((f) => f.brawl)) {
      stop();
      this.env.emit('actor:yielded', { actorId: p.id, byId: by });
      const purse = p.inventory?.denarii ?? 0;
      if (purse > 0) p.inventory?.spendDenarii(Math.round(purse * 0.1 * 4) / 4);
      this.env.emit('combat:playerYielded', { context: 'brawl', outcome: 'lost 10% of the purse' });
      return { context: 'brawl' };
    }
    if (foes.some((f) => f.lawful)) {
      stop();
      this.env.emit('actor:yielded', { actorId: p.id, byId: by });
      this.env.emit('combat:playerYielded', { context: 'arrest' });
      return { context: 'arrest' };
    }
    return { context: 'none' };
  }

  /** Bring the player back (dev scenes, game flow after a defeat): full pools. */
  revive(c: Combatant) {
    c.vitals.revive();
    this.standUp(c);
  }

  /** On its feet again with its pools as they are (after a load restored them). */
  standUp(c: Combatant) {
    c.status = 'active';
    c.koUntil = Infinity;
    c.fleeSince = null;
    c.target = null;
    c.lockTarget = null;
    c.view?.setDead(false);
    c.body.setGhost?.(false);
    c.action = null;
    c.stun = null;
    c.entangledUntil = -Infinity;
    c.poise.current = c.poise.max;
  }

  // ------------------------------------------------------------------ helpers

  private playAttackClip(c: Combatant, a: Action, chargedFor = 0) {
    const v = c.view;
    if (!v || !a.phases) return;
    if (a.kind === 'feint') {
      v.setCharge(0.75);
      return;
    }
    const clip = clipFor(a);
    const hit = v.clipHit(clip);
    let from = 0;
    if (a.kind === 'power' && chargedFor > 0) {
      const w = v.clipWindup(clip) ?? 0;
      from = w * Math.min(1, chargedFor / 0.5);
    }
    v.play(clip, { speed: clipSpeedFor(hit, a.phases.windup, from), onHit: () => this.viewHit(c, a) });
    a.viewed = hit !== undefined;
  }

  private staminaCost(c: Combatant, weapon: WeaponStats, o: { power?: boolean; bash?: boolean; sprint?: boolean; none?: boolean }): number {
    if (o.none) return 0;
    return computeAttack(c.stats, weapon, { power: o.power, bash: o.bash, sprint: o.sprint, item: weapon === c.weapon ? c.weaponItem : undefined }).staminaCost;
  }

  private effectiveShield(c: Combatant): ShieldStats | undefined {
    const s = c.shield;
    if (!s) return undefined;
    // A pilum stuck in the shield halves its block until the shield is dropped (§6.8).
    return c.pila > 0 ? { ...s, blockMitigation: s.blockMitigation * 0.5 } : s;
  }

  /** §6.13 formation: 3+ miles in line (within 2.5 m of two others) add +0.15 block. */
  private formationBonus(c: Combatant): number {
    if (c.profile?.tier !== 'miles' || !c.shield) return 0;
    let n = 0;
    for (const o of this.list) if (o !== c && o.active && o.profile?.tier === 'miles' && o.team === c.team && dist2D(o.position, c.position) < 2.5) n++;
    return n >= 2 ? 0.15 : 0;
  }

  private attackXp(w: WeaponStats, o: { power: boolean; riposte: boolean; sneak: boolean; bash: boolean }): { skill: string; amount: number } | null {
    if (o.bash) return { skill: 'shield', amount: XP.shield.bash };
    const table = w.skill === 'spear' ? XP.spear : w.skill === 'blades' ? XP.blades : null;
    if (table) return { skill: w.skill, amount: o.sneak ? table.sneak : o.riposte ? table.riposte : o.power ? table.power : table.light };
    if (w.skill === 'brawling') return { skill: 'brawling', amount: w.class === 'blunt' ? XP.brawling.bluntHit : XP.brawling.hit };
    return null;
  }

  private voice(c: Combatant, kind: 'grunt' | 'pain' | 'death'): string {
    return `vox.${kind}.${c.voice}`;
  }

  private chest(c: Combatant) {
    const p = c.position;
    return { x: p.x, y: p.y + c.body.height * 0.72, z: p.z };
  }

  private hitEvent(att: Combatant, def: Combatant, o: Partial<GameEvents['combat:hit']> & { kind: string; damage: number }): GameEvents['combat:hit'] {
    return {
      attackerId: att.id,
      targetId: def.id,
      damage: o.damage,
      blocked: !!o.blocked,
      parried: !!o.parried,
      kind: o.kind,
      power: !!o.power,
      riposte: !!o.riposte,
      finisher: !!o.finisher,
      sneak: !!o.sneak,
      stagger: o.stagger ?? 'none',
      x: def.position.x,
      z: def.position.z,
    };
  }
}

/** The avatar clip for an attack. */
export function clipFor(a: Pick<Action, 'kind' | 'chain'>): ActionClip {
  switch (a.kind) {
    case 'light':
      return a.chain === 2 ? 'attackLight2' : a.chain === 3 ? 'attackLight3' : 'attackLight1';
    case 'power':
      return 'attackPower';
    case 'bash':
      return 'bash';
    case 'riposte':
      return 'attackLight1';
    case 'sprint':
      return 'attackLight3';
    case 'net':
      return 'throw';
    case 'sandKick':
      return 'pickup';
    default:
      return 'attackLight1';
  }
}

const MOTION = { x: 0, z: 0, accel: 0 };
function set3(m: typeof MOTION, x: number, z: number, accel: number) {
  m.x = x;
  m.z = z;
  m.accel = accel;
  return m;
}

/** Facing helper for the system: heading from a to b. */
export function headingTo(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.atan2(b.x - a.x, b.z - a.z);
}

export { wrapAngle };
