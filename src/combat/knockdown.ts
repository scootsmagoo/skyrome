/**
 * When a melee blow floors its target (rather than only staggering them): a heavy blow (a power
 * attack, a sprint attack or a shield bash) that lands on someone who is not braced, with poise
 * damage close to their whole poise. Poise comes by tier and archetype (rpg/data/combatants.ts):
 * a citizen (20) or a thug (30) goes down to any power blow, a bruiser (55) to an overhead
 * swing of a heavy weapon, a soldier (60) or a veteran (70) to a maul or a two-hander, a champion
 * (90) hardly ever, and bosses and the player never (they stagger as before).
 */
export interface KnockdownCase {
  /** Power attack, sprint attack or shield bash. */
  heavy: boolean;
  /** The blow was guarded (shield or weapon): a block absorbs it. */
  blocked: boolean;
  /** Poise damage of the blow, and the victim's whole poise. */
  poiseDamage: number;
  poiseMax: number;
  /** In the wind-up of a swing of their own, or otherwise set to take it. */
  braced: boolean;
  boss: boolean;
  isPlayer: boolean;
}

/** Share of the victim's poise one heavy blow must carry to floor them. */
export const KNOCKDOWN_FRACTION = 0.9;

export function floorsTarget(c: KnockdownCase): boolean {
  if (!c.heavy || c.blocked || c.braced || c.boss || c.isPlayer) return false;
  return c.poiseDamage >= c.poiseMax * KNOCKDOWN_FRACTION;
}
