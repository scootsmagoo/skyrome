/** Skill checks shared by dialogue, crime (talking down a guard) and anything else that rolls. */
import { clamp } from '../core/math';

/**
 * Chance to pass: certain at `skill ≥ difficulty`, falling off linearly to 0 at 25 levels below
 * (clamp((skill − difficulty + 25) / 25, 0, 1)), plus a flat bonus (persuade.chance, wine…).
 */
export function skillCheckChance(skill: number, difficulty: number, bonus = 0): number {
  return clamp((skill - difficulty + 25) / 25 + bonus, 0, 1);
}

export function rollSkillCheck(skill: number, difficulty: number, rng: { next(): number }, bonus = 0): { pass: boolean; chance: number } {
  const chance = skillCheckChance(skill, difficulty, bonus);
  return { pass: chance >= 1 || (chance > 0 && rng.next() < chance), chance };
}
