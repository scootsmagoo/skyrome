/**
 * Combat AI (docs/GDD.md §6.13): a utility-scored state machine re-evaluated at 10 Hz, with
 * steering every fixed step.
 *
 *   approach  out of reach: run to the target, stop at reach + 0.3 m
 *   engage    holds an attack token: close in and attack every lerp(2.5, 0.9, aggression) s,
 *             70 % light / 30 % power (elites 40 %), feints from veteran up (0.25 × aggression);
 *             with chance blockSkill it waits for an opening (the target's recovery) rather than
 *             swinging into a wind-up [design]
 *   circle    no token: strafe at 3–5 m (1.5 m/s), switching direction every 2–4 s
 *   guard     pre-emptive spells of 1–3 s for blockSkill × 0.6 of the time (circle, and engage
 *             between attacks); reactive when the target enters reach facing us (chance
 *             blockSkill, −30 % under 30 % stamina, after the reaction time), held while it stays
 *             in reach and faces us, until we attack or tire (re-rolled when struck unguarded,
 *             [design]); also against a power wind-up;
 *             elites, champions and bosses may parry (blockSkill × 0.4)
 *   retreat   stamina < 25 %: back off 2–4 m until 60 %
 *   call-help at combat start and at 50 % health (the system shouts to allies)
 *   flee      health ≤ fleeAt;  yield: health ≤ yieldAt (the system kneels the actor)
 *   search    lost sight for 2 s: go to the last known position, search 20 s, then idle
 *   opener    scripted first exchanges (a light chain; a delayed, long power wind-up)
 *   bash      shield fighters pressed by a target who keeps swinging answer with the umbo [design]
 *
 * Bosses add a `BrainScript` (Nereus' net, phases). Pure logic: see ./types.ts.
 */
import { headingFromDir, lerp } from '../../core/math';
import { emptyIntent, type BrainProfile, type BrainServices, type BrainState, type Intent, type Perception } from './types';

/** Movement speeds (m/s) before the profile's speed multiplier. */
export const AI_SPEEDS = {
  /** Run ×0.85 while armed in combat (§6.6). */
  run: 4.4 * 0.85,
  walk: 1.9,
  circle: 1.5,
  flee: 6,
};

/** The circle band (§6.13). */
export const CIRCLE = { min: 3, max: 5 };

const DECIDE_EVERY = 0.1;

/** Hooks for scripted fighters (bosses). */
export interface BrainScript {
  /** Called at every decision after the normal logic; may set `intent.special`, `minWindup`, `phase`. */
  decide(brain: CombatBrain, p: Perception, svc: BrainServices): void;
}

export class CombatBrain {
  state: BrainState = 'idle';
  readonly intent: Intent = emptyIntent();
  /** Seconds between attacks (§6.13 lerp unless the profile sets attackIntervalS). */
  attackInterval: number;
  /** For the scripted bosses: next attack's wind-up floor. */
  pendingMinWindup = 0;
  /** For the scripted bosses: the next attack's kind. */
  forceNext: 'light' | 'power' | null = null;
  script: BrainScript | null = null;
  /**
   * A scripted first exchange (docs/CONTENT.md §5.2, the mq-01 tutorial pair): 'chain' takes the
   * first turn with a three-hit light chain; 'delayed-power' waits 3 s, then opens with a power
   * attack wound up for a full second, so a beginner sees it coming and can parry.
   */
  opener: 'chain' | 'delayed-power' | null = null;

  private chainLeft = 0;
  /** How much of the time the target has been swinging lately (0..1, an average over ~1.5 s). */
  private pressure = 0;
  private nextDecide = 0;
  private circleDir = 1;
  private circleSwitchAt = 0;
  private circleRadius: number;
  private guardSpell = false;
  private guardToggleAt = 0;
  private reactive = false;
  private reactiveAt = Infinity;
  private powerGuard = false;
  private powerGuardAt = Infinity;
  private powerSeen = false;
  private parryRolled = false;
  private prevInReach = false;
  private prevBusy = false;
  private nextAttackAt = 0;
  private turnAttacks = 0;
  private tokenCooldownUntil = 0;
  private lastSeen = -Infinity;
  private lastKnown = { x: 0, z: 0 };
  private searchUntil = 0;
  private shoutedStart = false;
  private shoutedHalf = false;
  private engaged = false;
  private waitForOpening = false;
  private lastStruck = -Infinity;
  private gaveUp = false;

  constructor(
    public profile: BrainProfile,
    private readonly rng: () => number = Math.random,
  ) {
    this.attackInterval = profile.attackIntervalS ?? lerp(2.5, 0.9, profile.aggression);
    this.circleRadius = CIRCLE.min + 0.2 + rng() * (CIRCLE.max - CIRCLE.min - 0.6);
    this.circleDir = rng() < 0.5 ? -1 : 1;
  }

  /** Force a state (scripts, the system: 'down' while knocked out, 'idle' when spared). */
  setState(s: BrainState) {
    this.state = s;
  }

  /** Bring the next attack forward to `now + delay` (scripts: punishing an entangled target). */
  attackSoon(now: number, delay: number) {
    this.nextAttackAt = Math.min(this.nextAttackAt, now + delay);
  }

  /** Has this brain ever had a target (it called for help at the start). */
  get hasEngaged() {
    return this.engaged;
  }

  /** One fixed step: decide at 10 Hz, steer every step. */
  tick(p: Perception, svc: BrainServices, dt: number): Intent {
    const I = this.intent;
    // One-shot flags last a single step.
    I.shout = false;
    I.yield = false;
    I.flee = false;
    I.parry = false;
    I.phase = undefined;
    if (p.now >= this.nextDecide) {
      this.nextDecide = p.now + DECIDE_EVERY;
      I.attack = null;
      I.special = null;
      I.minWindup = undefined;
      this.decide(p, svc);
    } else {
      // An attack order is consumed by the system on the step it is issued.
      I.attack = null;
      I.special = null;
    }
    this.reactions(p);
    this.steer(p, dt);
    return I;
  }

  // ------------------------------------------------------------------ decisions

  private decide(p: Perception, svc: BrainServices) {
    const I = this.intent;
    const P = this.profile;
    const now = p.now;
    if (this.state === 'yield' || this.state === 'down') {
      svc.releaseToken();
      return;
    }
    const hp = p.self.health;
    if (!P.beast && P.yieldAt > 0 && hp <= P.yieldAt && !P.prefersFlee) {
      this.state = 'yield';
      I.yield = true;
      svc.releaseToken();
      return;
    }
    const fleeAt = P.prefersFlee ? Math.max(P.fleeAt, P.yieldAt) : P.fleeAt;
    if (this.state !== 'flee' && fleeAt > 0 && hp <= fleeAt) {
      this.state = 'flee';
      I.flee = true;
      svc.releaseToken();
      return;
    }
    if (this.state === 'flee') return;

    const t = p.target;
    if (!t) {
      svc.releaseToken();
      if (this.state !== 'search') this.state = 'idle';
      else if (now > this.searchUntil) this.state = 'idle';
      return;
    }
    if (t.visible) {
      this.lastSeen = now;
      this.lastKnown.x = t.x;
      this.lastKnown.z = t.z;
    } else if (now - this.lastSeen > 2) {
      svc.releaseToken();
      if (this.gaveUp) this.state = 'idle';
      else if (this.state !== 'search') {
        this.state = 'search';
        this.searchUntil = now + 20;
      } else if (now > this.searchUntil) {
        this.state = 'idle';
        this.gaveUp = true;
      }
      return;
    }
    this.gaveUp = false;

    if (!this.engaged) {
      this.engaged = true;
      if (!this.shoutedStart) {
        this.shoutedStart = true;
        I.shout = true;
      }
      // First swing a moment after contact, not instantly.
      this.nextAttackAt = now + 0.4 + this.rng() * 0.6;
      if (this.opener === 'chain') {
        this.chainLeft = 3;
        this.nextAttackAt = now + 0.6;
      } else if (this.opener === 'delayed-power') {
        this.tokenCooldownUntil = now + 3;
        this.nextAttackAt = now + 3;
        this.forceNext = 'power';
        this.pendingMinWindup = 1;
      }
      this.opener = null;
    }
    if (!this.shoutedHalf && hp <= 0.5) {
      this.shoutedHalf = true;
      I.shout = true;
    }

    // Exhausted: back off to regenerate (§6.13 retreat).
    if (this.state === 'retreat') {
      if (p.self.stamina < 0.6 && !P.beast) {
        svc.releaseToken();
        this.script?.decide(this, p, svc);
        return;
      }
      this.state = 'circle';
    } else if (p.self.stamina < 0.25 && !P.beast && !p.self.busy) {
      this.state = 'retreat';
      svc.releaseToken();
      this.reactive = false;
      return;
    }

    const d = Math.hypot(t.x - p.self.x, t.z - p.self.z);
    this.pressure += ((t.attacking && d <= t.reach + 0.5 ? 1 : 0) - this.pressure) * 0.07;
    // Token turn-taking.
    if (svc.holdsToken() && ((this.turnAttacks <= 0 && !p.self.busy) || svc.tokenOverdue())) {
      svc.releaseToken();
      this.tokenCooldownUntil = now + 0.8 + this.rng() * 1.2;
    }
    let has = svc.holdsToken();
    if (!has && now >= this.tokenCooldownUntil && d <= CIRCLE.max + 3) {
      has = svc.requestToken(P.tokensCost);
      if (has) {
        this.turnAttacks = this.chainLeft > 0 ? this.chainLeft : 1 + Math.floor(this.rng() * 3);
        this.nextAttackAt = Math.max(this.nextAttackAt, now + 0.15 + this.rng() * 0.35);
      }
    }
    if (has) this.state = 'engage';
    else this.state = d > Math.max(CIRCLE.max + 1.5, p.self.reach + 0.3) ? 'approach' : 'circle';

    // Attack — a skilled fighter (chance blockSkill) doesn't swing into the target's wind-up: it
    // keeps its guard and strikes in the target's recovery instead (at most 1.5 s late).
    const chaining = this.chainLeft > 0;
    const opening = chaining || !(t.attacking && t.impactIn < Infinity) || !this.waitForOpening || now > this.nextAttackAt + 1.5;
    if (this.state === 'engage' && p.self.canAct && now >= this.nextAttackAt && d <= p.self.reach - 0.05 && opening) {
      let kind: 'light' | 'power' | 'feint' | 'bash' = this.rng() < P.powerChance ? 'power' : 'light';
      if (P.canFeint && this.rng() < 0.25 * P.aggression) kind = 'feint';
      // Against a target who keeps swinging, a shield fighter answers with the umbo [design]: the
      // bash knocks the next swing out of its wind-up instead of trading blows.
      const pressed = !!p.self.shield && this.pressure > 0.55;
      if (pressed && this.rng() < Math.min(0.9, P.blockSkill * 1.5)) kind = 'bash';
      if (this.forceNext) {
        kind = this.forceNext;
        this.forceNext = null;
      }
      if (chaining) kind = 'light';
      I.attack = kind;
      if (this.pendingMinWindup > 0) {
        I.minWindup = this.pendingMinWindup;
        this.pendingMinWindup = 0;
      }
      if (kind !== 'feint') this.turnAttacks--;
      // A chain swings again as soon as the last blow is over (inside the 0.35 s chain gap).
      if (chaining) this.chainLeft--;
      // Pressed behind the shield, it picks its moments more sparingly.
      this.nextAttackAt = this.chainLeft > 0 ? now : now + this.attackInterval * (0.85 + 0.3 * this.rng()) * (pressed ? 1.3 : 1);
      // A shield fighter fights from behind the shield: more often it waits for the opening [design].
      this.waitForOpening = this.rng() < (p.self.shield ? Math.min(0.9, P.blockSkill * 1.5) : P.blockSkill);
      // Taking the token to attack drops a reactive guard (§6.13).
      this.reactive = false;
      this.powerGuard = false;
    }

    this.preemptiveGuard(p);
    this.script?.decide(this, p, svc);
  }

  /** Pre-emptive guard spells: up for blockSkill × 0.6 of the time, in spells of 1–3 s. */
  private preemptiveGuard(p: Perception) {
    const f = this.profile.blockSkill * 0.6;
    if (f <= 0) {
      this.guardSpell = false;
      return;
    }
    if (this.guardToggleAt === 0) {
      // Start with the guard down for a random spell-gap.
      this.guardToggleAt = p.now + (1 + 2 * this.rng()) * ((1 - f) / f);
      return;
    }
    if (p.now < this.guardToggleAt) return;
    if (this.guardSpell) {
      this.guardSpell = false;
      const off = (1 + 2 * this.rng()) * ((1 - f) / f);
      this.guardToggleAt = p.now + off;
    } else {
      this.guardSpell = true;
      this.guardToggleAt = p.now + 1 + 2 * this.rng();
    }
  }

  /** Reactive guard, power-wind-up guard and parries; every step (they hinge on the reaction time). */
  private reactions(p: Perception) {
    const I = this.intent;
    const P = this.profile;
    const t = p.target;
    const fighting = this.state === 'engage' || this.state === 'circle' || this.state === 'approach' || this.state === 'retreat';
    if (!t || !fighting || !p.self.guardable) {
      this.reactive = this.powerGuard = false;
      this.reactiveAt = this.powerGuardAt = Infinity;
      this.prevInReach = false;
      I.guard = false;
      return;
    }
    const d = Math.hypot(t.x - p.self.x, t.z - p.self.z);
    const inReach = d <= t.reach + 0.25 && t.facingMe;
    const tired = p.self.stamina < 0.3;
    // The target stepping into reach while facing us — or still there when our own swing ends.
    const ownSwingEnded = this.prevBusy && !p.self.busy;
    // Being struck with the guard down is a stimulus too [design]: roll again.
    const struck = p.self.lastHitAt !== undefined && p.self.lastHitAt > this.lastStruck;
    if (struck) this.lastStruck = p.self.lastHitAt!;
    if (inReach && (!this.prevInReach || ownSwingEnded || struck) && !this.reactive && this.reactiveAt === Infinity) {
      // Pressed by a target who keeps swinging, a shield fighter gets the shield back up more surely [design].
      const skill = p.self.shield && this.pressure > 0.5 ? Math.min(0.95, P.blockSkill * 1.5) : P.blockSkill;
      const chance = skill * (tired ? 0.7 : 1);
      if (this.rng() < chance) this.reactiveAt = p.now + P.reactionS;
    }
    this.prevInReach = inReach;
    this.prevBusy = p.self.busy;
    if (!inReach) {
      this.reactive = false;
      this.reactiveAt = Infinity;
    } else if (p.now >= this.reactiveAt) {
      this.reactive = true;
      this.reactiveAt = Infinity;
    }
    if (tired) this.reactive = false;

    // A power wind-up can be read and guarded against.
    if (t.power) {
      if (!this.powerSeen) {
        this.powerSeen = true;
        if (this.rng() < P.blockSkill) this.powerGuardAt = p.now + P.reactionS;
      }
      if (p.now >= this.powerGuardAt) this.powerGuard = true;
    } else {
      this.powerSeen = false;
      this.powerGuard = false;
      this.powerGuardAt = Infinity;
    }

    // Timed parry.
    if (t.attacking && P.canParry) {
      if (!this.parryRolled && t.impactIn <= 0.12 && d <= t.reach + 0.3) {
        this.parryRolled = true;
        if (this.rng() < P.blockSkill * 0.4) I.parry = true;
      }
    } else this.parryRolled = false;

    const betweenAttacks = this.state === 'engage' && !p.self.busy;
    const spell = this.guardSpell && (this.state === 'circle' || betweenAttacks || this.state === 'retreat');
    I.guard = !p.self.busy && !I.attack && (this.reactive || this.powerGuard || spell);
  }

  // ------------------------------------------------------------------ steering

  private steer(p: Perception, dt: number) {
    const I = this.intent;
    const P = this.profile;
    const m = I.move;
    m.x = m.z = 0;
    const s = p.self;
    const t = p.target;
    const speed = P.speedMult;
    switch (this.state) {
      case 'idle':
      case 'yield':
      case 'down':
        I.face = null;
        return;
      case 'search': {
        const dx = this.lastKnown.x - s.x;
        const dz = this.lastKnown.z - s.z;
        const d = Math.hypot(dx, dz);
        if (d > 1) {
          m.x = (dx / d) * AI_SPEEDS.walk * speed;
          m.z = (dz / d) * AI_SPEEDS.walk * speed;
          I.face = headingFromDir(dx, dz);
        }
        return;
      }
      case 'flee': {
        if (!t) return;
        const dx = s.x - t.x;
        const dz = s.z - t.z;
        const d = Math.hypot(dx, dz) || 1;
        m.x = (dx / d) * AI_SPEEDS.flee * speed;
        m.z = (dz / d) * AI_SPEEDS.flee * speed;
        I.face = headingFromDir(dx, dz);
        return;
      }
    }
    if (!t) return;
    const dx = t.x - s.x;
    const dz = t.z - s.z;
    const d = Math.hypot(dx, dz) || 1e-3;
    const ux = dx / d;
    const uz = dz / d;
    I.face = headingFromDir(dx, dz);
    switch (this.state) {
      case 'approach': {
        const stop = s.reach + 0.3;
        if (d > stop) {
          const v = (d > stop + 3 ? AI_SPEEDS.run : AI_SPEEDS.walk * 1.3) * speed;
          m.x = ux * v;
          m.z = uz * v;
        }
        break;
      }
      case 'engage': {
        // Close enough to strike, never hugging (a dagger's reach is short).
        const want = Math.max(1.15, s.reach - 0.25);
        if (d > want + 0.1) {
          const v = (d > want + 2.5 ? AI_SPEEDS.run : AI_SPEEDS.walk * 1.4) * speed;
          m.x = ux * v;
          m.z = uz * v;
        } else if (d < Math.max(0.95, want - 0.7)) {
          m.x = -ux * AI_SPEEDS.walk * 0.8;
          m.z = -uz * AI_SPEEDS.walk * 0.8;
        }
        break;
      }
      case 'circle': {
        if (p.now >= this.circleSwitchAt) {
          this.circleSwitchAt = p.now + 2 + 2 * this.rng();
          this.circleDir = -this.circleDir;
        }
        const tangent = AI_SPEEDS.circle * speed * this.circleDir;
        const radial = Math.max(-1.5, Math.min(1.5, (d - this.circleRadius) * 1.5));
        m.x = -uz * tangent + ux * radial;
        m.z = ux * tangent + uz * radial;
        break;
      }
      case 'retreat': {
        if (d < s.reach + 3) {
          m.x = -ux * AI_SPEEDS.walk * speed;
          m.z = -uz * AI_SPEEDS.walk * speed;
        }
        break;
      }
    }
    // Keep a little room between allies so they don't stack in one spot.
    for (const a of p.allies) {
      const ax = s.x - a.x;
      const az = s.z - a.z;
      const ad = Math.hypot(ax, az);
      if (ad > 1e-3 && ad < 1.6) {
        const push = (1.6 - ad) * 1.8;
        m.x += (ax / ad) * push;
        m.z += (az / ad) * push;
      }
    }
    void dt;
  }
}
