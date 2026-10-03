/**
 * Skill checks and persuasion (docs/GDD.md §14.5), shared by dialogue, haggling and the law.
 *
 *   p = clamp(0.05, 0.95, 0.50 + (skill + mods − DC) / 100)
 *   DC tiers: Facilis 10 · Mediocris 25 · Difficilis 40 · Ardua 55 · Gravissima 70 · Herculea 85
 *   mods: disposition (−20…+20) + 5 × (your Dignitas step − theirs) + dress + cleanliness
 *         + Fama/10 + Infamia effects + perks (+ Venus' Charis through fortified Rhetoric)
 *
 * Approaches: persuade (Rhetoric), intimidate (+10 per band above the target, +10 armed and
 * armored; fails against elites), bribe (always works on the corruptible; DC × 0.5 den. × status),
 * invoke patron (Clientela rank ≥ amicus-minor: +15, +15 more with the perk).
 *
 * Formal dress (§3.7, §8.2) is the toga for a man, the stola with the palla for a woman: +10 with
 * elites and officials, −5 with Subura plebs. A woman in a toga gets no bonus: respectable NPCs
 * take −15 disposition, the underworld +5. The gold ring counts only on a man.
 */
import { clamp } from '../core/math';
import { PERSUASION, STANDING } from './data/tuning';

/**
 * Chance to pass a check: 50% when skill + mods equals the DC, ±1% per point, between 5% and 95%.
 * `bonus` is a flat fraction (persuade.chance: +0.05 = +5 points).
 */
export function skillCheckChance(skill: number, difficulty: number, bonus = 0): number {
  const P = PERSUASION;
  return clamp(P.base + (skill - difficulty) / P.div + bonus, P.min, P.max);
}

export function rollSkillCheck(skill: number, difficulty: number, rng: { next(): number }, bonus = 0): { pass: boolean; chance: number } {
  const chance = skillCheckChance(skill, difficulty, bonus);
  return { pass: rng.next() < chance, chance };
}

/** Named DCs (§14.5); the tier (1–6) sets Rhetoric XP (10 × tier). */
export const CHECK_TIERS = [
  { id: 'facilis', name: 'Facilis', difficulty: 10 },
  { id: 'mediocris', name: 'Mediocris', difficulty: 25 },
  { id: 'difficilis', name: 'Difficilis', difficulty: 40 },
  { id: 'ardua', name: 'Ardua', difficulty: 55 },
  { id: 'gravissima', name: 'Gravissima', difficulty: 70 },
  { id: 'herculea', name: 'Herculea', difficulty: 85 },
] as const;

/** Tier 1–6 of a difficulty (the highest tier whose DC it reaches; at least 1). */
export function checkTier(difficulty: number): number {
  let t = 1;
  CHECK_TIERS.forEach((c, i) => {
    if (difficulty >= c.difficulty) t = i + 1;
  });
  return t;
}

/** Name of the tier a DC falls in ("Difficilis"). */
export function tierName(difficulty: number): string {
  return CHECK_TIERS[checkTier(difficulty) - 1].name;
}

/** Who is being persuaded. */
export type Audience = 'any' | 'elite' | 'official' | 'plebs' | 'subura' | 'soldier' | 'underworld' | 'games';

export type Approach = 'persuade' | 'intimidate' | 'bribe' | 'invoke-patron';

/** Dignitas steps (§3.4): peregrinus/latinus 0 · libertus 1 · civis 2 · cliens-notus 3 · eques 4. */
const DIGNITAS_BY_ID: Record<string, number> = { peregrinus: 0, 'latinus-iunianus': 0, alexandrinus: 0, libertus: 1, civis: 2, 'cliens-notus': 3, eques: 4, senator: 4 };

/** What a check needs to know about the person being persuaded (from NpcDef tags and combat profile). */
export interface Listener {
  tags?: readonly string[];
  /** The target's danger band 0–5 (intimidation compares bands, §14.5); default 0. */
  band?: number;
}

export type Sex = 'male' | 'female';

/** Wearing formal dress (§8.2): the toga for a man; the stola with the palla for a woman. */
export function wearsFormalDress(flags: { hasFlag(f: string): boolean }, sex: Sex = 'male'): boolean {
  return sex === 'female' ? flags.hasFlag('dress.stola') && flags.hasFlag('dress.palla') : flags.hasFlag('dress.toga');
}

/** A woman in a toga (§3.7): no status bonus, a stain with the respectable. */
export function womanInToga(flags: { hasFlag(f: string): boolean }, sex: Sex = 'male'): boolean {
  return sex === 'female' && flags.hasFlag('dress.toga');
}

/** The player's band for intimidation: min(5, 1 + floor(level / 8)) — a new character counts as band 1. */
export function playerBand(level: number): number {
  return Math.min(5, 1 + Math.floor(Math.max(1, level) / 8));
}

/**
 * The audience an NPC belongs to, from its tags: 'elite', 'official', 'soldier', 'underworld',
 * 'plebs', 'subura' or 'games' ('arena-fan'); 'any' otherwise.
 */
export function audienceOf(l: Listener | undefined): Audience {
  const t = l?.tags ?? [];
  for (const a of ['elite', 'official', 'soldier', 'underworld', 'subura', 'plebs', 'games'] as const) if (t.includes(a)) return a;
  if (t.includes('arena-fan')) return 'games';
  return 'any';
}

/** The target's Dignitas step: a `dignitas:<id>` tag, else elites 4 and officials 3; undefined if unknown. */
export function dignitasOf(l: Listener | undefined, audience: Audience = audienceOf(l)): number | undefined {
  const tag = l?.tags?.find((x) => x.startsWith('dignitas:'));
  if (tag && tag.slice(9) in DIGNITAS_BY_ID) return DIGNITAS_BY_ID[tag.slice(9)];
  if (audience === 'elite') return 4;
  if (audience === 'official') return 3;
  return undefined;
}

/**
 * Origin traits and omens toward an NPC (§3.2, §14.6): Caesar's countryman +10 with Baetican NPCs,
 * old wound +10 with soldiers, eastern archer −5 with soldiers, survivor +20 with Dacians and −10
 * with xenophobes, Alexandrian learning +10 with devotees of Isis, ill-omened −5 with the pious.
 */
export function traitDisposition(flags: { hasFlag(f: string): boolean }, l: Listener | undefined, sex: Sex = 'male'): number {
  const t = l?.tags ?? [];
  const f = (x: string) => flags.hasFlag(x);
  let d = 0;
  if (womanInToga(flags, sex)) d += audienceOf(l) === 'underworld' ? STANDING.togaWomanDisposition.underworld : STANDING.togaWomanDisposition.respectable;
  if (f('trait-caesars-countryman') && t.includes('baetican')) d += 10;
  if (f('trait-old-wound') && t.includes('soldier')) d += 10;
  if (f('trait-eastern-archer') && t.includes('soldier')) d -= 5;
  if (f('trait-survivor') && t.includes('dacian')) d += 20;
  if (f('trait-survivor') && t.includes('xenophobe')) d -= 10;
  if (f('trait-alexandrian-learning') && t.includes('isiac')) d += 10;
  if (f('infaustus') && t.includes('pious')) d -= 5;
  return d;
}

export interface PersuasionInputs {
  /** The speaker's sheet flags (dress.toga, dress.soleae, ebrius…). */
  flags: { hasFlag(f: string): boolean };
  /** Fama with the listener's faction or district (−100…+100). */
  fama?: number;
  infamia?: number;
  cleanliness?: 'lautus' | 'normal' | 'sordidus';
  /** The listener's disposition toward you (−20…+20). */
  disposition?: number;
  /** Your Dignitas step and the listener's (5 points per step of difference). */
  dignitas?: { mine: number; theirs?: number };
  /** The speaker's sex: formal dress and the gold ring depend on it. */
  sex?: Sex;
}

/**
 * Persuasion points (§14.5 mods) for an audience: disposition; 5 × Dignitas steps; dress (toga +10
 * with elites and officials, −5 with Subura plebs; soleae −5 with elites; lacerna +3 at the games;
 * gold ring +10 with elites; silvered weapon +5 with soldiers); tipsy +5 with plebs; Fama/10;
 * −Infamia/5 with elites and officials, +Infamia/10 with the underworld and the games; sordidus −10
 * (not with the underworld), lautus +10.
 */
export function persuasionPoints(audience: Audience, i: PersuasionInputs): number {
  const f = (x: string) => i.flags.hasFlag(x);
  const elite = audience === 'elite' || audience === 'official';
  const plebs = audience === 'plebs' || audience === 'subura';
  let p = clamp(i.disposition ?? 0, -PERSUASION.dispositionMax, PERSUASION.dispositionMax);
  if (i.dignitas && i.dignitas.theirs !== undefined) p += PERSUASION.dignitasStep * (i.dignitas.mine - i.dignitas.theirs);
  if (wearsFormalDress(i.flags, i.sex)) p += elite ? 10 : audience === 'subura' ? -5 : 0;
  if (f('dress.soleae') && audience === 'elite') p -= 5;
  if (f('dress.lacerna') && audience === 'games') p += 3;
  if (f('dress.anulus-aureus') && audience === 'elite' && i.sex !== 'female') p += 10;
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

/** Intimidation points (§14.5): +10 per band above the target's (your band from your level), +10 if armed and armored. */
export function intimidationPoints(o: { playerLevel: number; targetBand?: number; armedAndArmored?: boolean }): number {
  const I = PERSUASION.intimidate;
  return I.perBand * (playerBand(o.playerLevel) - (o.targetBand ?? 0)) + (o.armedAndArmored ? I.armed : 0);
}

/** Intimidation fails automatically against elites. */
export function intimidationPossible(audience: Audience): boolean {
  return audience !== 'elite';
}

/** Bribe status class of a listener: officials 5, soldiers 2, everyone else (plebs) 1. */
export function bribeStatus(audience: Audience): keyof typeof PERSUASION.bribe.status {
  return audience === 'official' || audience === 'elite' ? 'official' : audience === 'soldier' ? 'soldier' : 'plebs';
}

/** What a bribe costs: DC × 0.5 den. × status (§14.5). */
export function bribeCost(dc: number, audience: Audience): number {
  const B = PERSUASION.bribe;
  return dc * B.perDc * B.status[bribeStatus(audience)];
}

/**
 * Invoke-patron points: 0 without a patron (Clientela rank < amicus-minor) or against a target of
 * equal or higher status than your patron; otherwise +15, and +15 more with perk-rhetoric-clientela.
 */
export function patronPoints(o: { clientelaRank: number; perk?: boolean; targetDignitas?: number }): number {
  const P = PERSUASION.patron;
  if (o.clientelaRank < P.minRank) return 0;
  if (o.targetDignitas !== undefined && o.targetDignitas >= 4) return 0;
  return P.bonus + (o.perk ? P.perk : 0);
}
