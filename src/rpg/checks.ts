/**
 * Skill checks shared by dialogue, haggling and the law, plus the persuasion modifiers of
 * docs/GDD.md §3.4 and §8.2 (dress, Fama, Infamia, cleanliness — "persuasion points" add to the
 * skill for the check).
 */
import { clamp } from '../core/math';

/**
 * Chance to pass: certain at `skill ≥ difficulty`, falling off linearly to 0 at 25 levels below
 * (clamp((skill − difficulty + 25) / 25, 0, 1)), plus a flat fractional bonus (persuade.chance).
 */
export function skillCheckChance(skill: number, difficulty: number, bonus = 0): number {
  return clamp((skill - difficulty + 25) / 25 + bonus, 0, 1);
}

export function rollSkillCheck(skill: number, difficulty: number, rng: { next(): number }, bonus = 0): { pass: boolean; chance: number } {
  const chance = skillCheckChance(skill, difficulty, bonus);
  return { pass: chance >= 1 || (chance > 0 && rng.next() < chance), chance };
}

/** Named check difficulties (GDD §7.4 uses Facilis 10, Mediocris 25, Difficilis 40); the tier (1–6) sets Rhetoric XP. */
export const CHECK_TIERS = [
  { id: 'facilis', name: 'Easy', difficulty: 10 },
  { id: 'mediocris', name: 'Average', difficulty: 25 },
  { id: 'difficilis', name: 'Hard', difficulty: 40 },
  { id: 'ardua', name: 'Very hard', difficulty: 55 },
  { id: 'gravis', name: 'Formidable', difficulty: 70 },
  { id: 'herculea', name: 'Herculean', difficulty: 85 },
] as const;

/** Tier 1–6 of a difficulty (the highest tier whose difficulty it reaches; at least 1). */
export function checkTier(difficulty: number): number {
  let t = 1;
  CHECK_TIERS.forEach((c, i) => {
    if (difficulty >= c.difficulty) t = i + 1;
  });
  return t;
}

/** Who is being persuaded. */
export type Audience = 'any' | 'elite' | 'official' | 'plebs' | 'subura' | 'soldier' | 'underworld' | 'games';

export interface PersuasionInputs {
  /** The speaker's sheet flags (dress.toga, dress.soleae, ebrius…). */
  flags: { hasFlag(f: string): boolean };
  /** Fama with the listener's faction or district (−100…+100). */
  fama?: number;
  infamia?: number;
  cleanliness?: 'lautus' | 'normal' | 'sordidus';
}

/**
 * Persuasion points for an audience (GDD §3.4, §8.2): toga +10 with elites and officials and −5
 * with Subura plebs; soleae −5 with elites; lacerna +3 at the games; the gold ring +10 with elites;
 * a silvered weapon +5 with soldiers; tipsy +5 with plebs; Fama/10; −Infamia/5 with elites and
 * officials, +Infamia/10 with the underworld and the games; sordidus −10 (not with the underworld),
 * lautus +10.
 */
export function persuasionPoints(audience: Audience, i: PersuasionInputs): number {
  const f = (x: string) => i.flags.hasFlag(x);
  const elite = audience === 'elite' || audience === 'official';
  const plebs = audience === 'plebs' || audience === 'subura';
  let p = 0;
  if (f('dress.toga')) p += elite ? 10 : audience === 'subura' ? -5 : 0;
  if (f('dress.soleae') && audience === 'elite') p -= 5;
  if (f('dress.lacerna') && audience === 'games') p += 3;
  if (f('dress.anulus-aureus') && audience === 'elite') p += 10;
  if (f('dress.silvered') && audience === 'soldier') p += 5;
  if (f('ebrius') && plebs) p += 5;
  p += (i.fama ?? 0) / 10;
  const inf = i.infamia ?? 0;
  if (elite) p -= inf / 5;
  else if (audience === 'underworld' || audience === 'games') p += inf / 10;
  if (i.cleanliness === 'sordidus' && audience !== 'underworld') p -= 10;
  else if (i.cleanliness === 'lautus') p += 10;
  return p;
}
