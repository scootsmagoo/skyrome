/**
 * boss-nereus — Nereus the retiarius (docs/GDD.md §13.2), a lusio at the Ludus Magnus.
 *
 *   P1 (100–75 %)  trident pokes at 1.8 m; a net every 12 s (unblockable, 0.8 s twirl telegraph)
 *                  that entangles for 3 s. His first follow-up on a netted target is always a
 *                  telegraphed power poke (wind-up ≥ 0.8 s).
 *   P2 (75–45 %)   faster (interval 1.3 s, speed ×1.1), feints, a sand kick that blinds for 1 s.
 *   P3 (45–15 %)   loses the net; trident and dagger in desperate lunges (interval 1.1 s, more power).
 *   15 %           yields (arena rules): the crowd and the player decide on missio.
 *
 * The phases follow the §13.2 rule: each spans at least 25 % of health before the yield.
 */
import type { BrainScript, CombatBrain } from './CombatBrain';
import type { BrainServices, Perception } from './types';

export const NEREUS = {
  id: 'boss-nereus',
  /** Health fractions where phases 2 and 3 begin. */
  phases: [0.75, 0.45] as const,
  yieldAt: 0.15,
  /**
   * Attack interval by phase. §13.2 gives 1.6 / 1.3 / 1.1 s; at that pace a first-time player
   * can't find a gap to strike in (agent playtests), so each is half a second longer.
   */
  interval: [2.1, 1.8, 1.6] as const,
  speed: [1.05, 1.155, 1.2] as const,
  /** Seconds between net casts, and before the first. */
  netEvery: 12,
  firstNet: 4,
  netRange: [2.2, 6] as const,
  sandKickEvery: 9,
  sandKickRange: 2.4,
  /** Desperate lunges in phase 3. */
  powerChanceP3: 0.5,
};

export class NereusScript implements BrainScript {
  phase = 1;
  hasNet = true;
  private netAt = -1;
  private kickAt = -1;
  private followedUp = false;
  /** Called when he loses the net (the system hides it). */
  onNetLost: (() => void) | null = null;

  decide(brain: CombatBrain, p: Perception, svc: BrainServices) {
    const now = p.now;
    if (this.netAt < 0) {
      this.netAt = now + NEREUS.firstNet;
      this.kickAt = now + 3;
    }
    const hp = p.self.health;
    const phase = hp > NEREUS.phases[0] ? 1 : hp > NEREUS.phases[1] ? 2 : 3;
    if (phase > this.phase) {
      this.phase = phase;
      brain.intent.phase = phase;
      brain.attackInterval = NEREUS.interval[phase - 1];
      brain.profile.speedMult = NEREUS.speed[phase - 1];
      brain.profile.canFeint = true;
      if (phase === 3) {
        brain.profile.powerChance = NEREUS.powerChanceP3;
        if (this.hasNet) {
          this.hasNet = false;
          this.onNetLost?.();
        }
      }
    }
    if (brain.state !== 'engage' && brain.state !== 'circle' && brain.state !== 'approach') return;
    const t = p.target;
    if (!t) return;
    const d = Math.hypot(t.x - p.self.x, t.z - p.self.z);

    // A netted target gets the telegraphed power poke first (it can still raise a shield).
    if (t.entangled) {
      if (!this.followedUp) {
        this.followedUp = true;
        brain.forceNext = 'power';
        brain.pendingMinWindup = 0.8;
        if (!svc.holdsToken()) svc.requestToken(brain.profile.tokensCost);
        brain.attackSoon(now, 0.1);
      }
    } else this.followedUp = false;

    if (p.self.busy || brain.intent.attack) return;
    if (this.hasNet && now >= this.netAt && d >= NEREUS.netRange[0] && d <= NEREUS.netRange[1] && t.visible && !t.entangled) {
      brain.intent.special = 'net';
      this.netAt = now + NEREUS.netEvery;
    } else if (this.phase === 2 && now >= this.kickAt && d <= NEREUS.sandKickRange) {
      brain.intent.special = 'sandKick';
      this.kickAt = now + NEREUS.sandKickEvery;
    }
  }
}
