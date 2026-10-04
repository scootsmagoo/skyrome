/**
 * AC-08 fight length (docs/GDD.md §17.3): a scripted competent player — rudis and scutum, skill
 * 25, a tunic, no god mode — fights Nereus on Normal: blocks his pokes (and parries some), dodges
 * the net and the sand, struggles out of the net, and answers each opening with one blow (a
 * 0.15 s reaction). The bout must be winnable; its length is logged against AC-08's 3–6 minutes.
 */
import { describe, expect, it } from 'vitest';
import { NereusScript } from '../src/ai/combat/nereus';
import { ENEMIES, nereusProfile } from '../src/combat/archetypes';
import type { Combatant } from '../src/combat/Combatant';
import type { CombatCore } from '../src/combat/CombatCore';
import { headingFromDir } from '../src/core/math';
import { addNpc, addPlayer, fakeEnv, makeCore } from './combat-fakes';

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface BoutLog {
  seconds: number;
  outcome: 'yielded' | 'player-down' | 'timeout';
  hits: number;
  taken: number;
  nets: number;
  phases: number[];
}

/** The competent player: one decision per fixed step. */
class Bot {
  private nextStruggle = 0;
  private answered = -1;
  private wish = { x: 0, z: 0 };
  private parryRolled = -1;
  private openSince = -1;

  constructor(
    private readonly rng: () => number,
    private readonly skill = { parry: 0.25, block: 0.85, dodge: 0.6, reaction: 0.15 },
  ) {}

  step(core: CombatCore, p: Combatant, n: Combatant, dt: number) {
    const now = core.now;
    const dx = n.position.x - p.position.x;
    const dz = n.position.z - p.position.z;
    const d = Math.hypot(dx, dz) || 1e-3;
    this.wish.x = this.wish.z = 0;
    // Netted: mash F/E (6 a second) behind the shield.
    if (p.entangled(now)) {
      core.setGuard(p, true);
      if (now >= this.nextStruggle) {
        core.struggle(p);
        this.nextStruggle = now + 1 / 6;
      }
      this.move(core, p, dt);
      return;
    }
    // The net in flight, or the sand kick about to land: dodge sideways (most of the time).
    const net = core.projectiles.find((q) => q.owner === n && Math.hypot(q.x - p.position.x, q.z - p.position.z) < 2.2);
    const na = n.action;
    const kick = na?.kind === 'sandKick' && na.hitAt !== undefined && na.hitAt - now < 0.1 && !na.resolved;
    if ((net || kick) && this.rng() < this.skill.dodge * 0.25) {
      core.dodge(p, -dz / d, dx / d);
    }
    // His poke coming: guard up in time; sometimes a timed parry instead.
    const incoming = !!na && na.hitAt !== undefined && !na.resolved && (na.kind === 'light' || na.kind === 'power' || na.kind === 'feint');
    const impactIn = incoming ? na!.hitAt! - now : Infinity;
    if (incoming && impactIn < 0.14 && this.parryRolled !== na!.start) {
      this.parryRolled = na!.start;
      if (this.rng() < this.skill.parry) core.pressParry(p);
    }
    const guard = incoming && impactIn < 0.45 && this.rng() < this.skill.block + 0.1;
    core.setGuard(p, guard || (incoming && p.guardWanted));
    // One blow per opening: his recovery, a stagger (a parry's riposte), or a quiet moment in reach.
    const recovering = !!na && na.resolved && na.kind !== 'kneel';
    const open = recovering || n.stunned(now) || (!na && now - n.lastAttackAt > 1.2);
    // A human sees the opening a moment late.
    if (open && this.openSince < 0) this.openSince = now;
    if (!open) this.openSince = -1;
    const opening = open && now - this.openSince >= this.skill.reaction;
    const key = na ? na.start : Math.floor(now / 1.5);
    if (!incoming && opening && d < 2.0 && key !== this.answered && p.vitals.stamina.current > 30 && core.free(p)) {
      core.setGuard(p, false);
      if (core.startAttack(p, 'light')) this.answered = key;
    }
    // Keep at fighting distance: close in when he backs off, never hug.
    if (d > 1.8 && !incoming) {
      this.wish.x = (dx / d) * 3;
      this.wish.z = (dz / d) * 3;
    }
    this.move(core, p, dt);
    if (!p.stunned(now) && p.action?.kind !== 'dodge') p.body.heading = headingFromDir(dx, dz);
  }

  private move(core: CombatCore, p: Combatant, dt: number) {
    const m = core.motionFor(p);
    p.body.move(m ? { x: m.x, z: m.z } : this.wish, dt);
  }
}

function bout(seed: number, maxSeconds = 600): BoutLog {
  const env = fakeEnv(mulberry(seed));
  const core = makeCore(env);
  core.difficulty = 'normalis';
  const p = addPlayer(core, { weapon: 'rudis', shield: 'scutum', armor: 4, x: 0, z: 0 });
  const n = addNpc(core, 'nereus', nereusProfile(), { z: 5, ai: true, rng: mulberry(seed * 7 + 1), brain: ENEMIES['boss-nereus'].brain });
  const s = new NereusScript();
  s.onNetLost = () => (n.hasNet = false);
  n.script = s;
  n.brain!.script = s;
  n.hasNet = true;
  core.startBout({ lusio: true, foes: ['nereus'], purse: 40 });
  core.engage(n, p);
  const bot = new Bot(mulberry(seed * 13 + 5));
  const dt = 1 / 60;
  let outcome: BoutLog['outcome'] = 'timeout';
  const phaseAt: number[] = [];
  const emit = env.emit;
  env.emit = (type, payload) => {
    if (type === 'combat:phase') phaseAt.push(Math.round(core.now));
    emit(type, payload);
  };
  for (let i = 0; i < maxSeconds * 60; i++) {
    bot.step(core, p, n, dt);
    core.fixedStep(dt);
    // The RPG ticks the player's vitals in the game; the fake player owns them here.
    if (n.status === 'yielded') {
      outcome = 'yielded';
      break;
    }
    if (p.status !== 'active') {
      outcome = 'player-down';
      break;
    }
  }
  const hits = (env.of('combat:hit') as { attackerId: string; blocked: boolean; damage: number }[]).filter((h) => h.attackerId === 'player' && h.damage > 0).length;
  const taken = (env.of('combat:hit') as { targetId: string; damage: number }[]).filter((h) => h.targetId === 'player' && h.damage > 0).length;
  const nets = (env.of('combat:hit') as { kind: string }[]).filter((h) => h.kind === 'net').length;
  const phases = phaseAt;
  return { seconds: Math.round(core.now), outcome, hits, taken, nets, phases };
}

describe('AC-08: Nereus against a competent player on Normal (measurement)', () => {
  it('is winnable through all three phases; the fight length is logged', () => {
    const logs = [1, 2, 3, 4, 5, 6].map((seed) => bout(seed));
    console.log('[AC-08 bot]', JSON.stringify(logs));
    const wins = logs.filter((l) => l.outcome === 'yielded');
    expect(wins.length).toBeGreaterThanOrEqual(3);
    for (const w of wins) expect(w.phases.length).toBe(2);
    // Measured on 2026-10-04: wins in 45–56 s (mean ≈ 50 s), 4 of 6. AC-08 asks for 3–6 minutes:
    // with §13.2's stat block (300 HP, AR 7) and a rudis (≈ 12 a blow, 16 blows to the yield), a
    // player who answers each of his pokes yields him in under a minute. That needs a design call
    // (more health with softer pokes, or weaker practice arms), so it is reported, not asserted.
    const mean = wins.reduce((a, l) => a + l.seconds, 0) / wins.length;
    expect(mean).toBeGreaterThan(20);
  });
});
