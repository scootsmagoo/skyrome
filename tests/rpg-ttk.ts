/**
 * Time-to-kill scenarios for the GDD §6.2 formula: representative player builds at levels 1/10/30
 * against the §6.11 tiers. Used by tests/rpg-combat.test.ts and the table in docs/modules/rpg.md
 * (print it with `PRINT_TTK=1 npx vitest run tests/rpg-combat.test.ts -t "TTK table"`).
 */
import { armorFamilyOf, attackInterval, computeAttack, difficultyMult, effectiveArmorRating, resolveHit, timeToKill } from '../src/rpg/combat-math';
import { ITEMS } from '../src/rpg/data/items';
import { combatProfileFor, profileStats, profileWeapon } from '../src/rpg/enemies';
import { ItemDb } from '../src/rpg/items';
import { CharacterSheetImpl } from '../src/rpg/sheet';

export const db = new ItemDb(ITEMS);

export interface Build {
  level: number;
  skills: Record<string, number>;
  perks: string[];
  weapon: string;
  worn: string[];
  healthPicks: number;
}

/** A Veteran of Dacia as he might look at levels 1, 10 and 30 (gear repaired to full condition). */
export const BUILDS: Build[] = [
  { level: 1, skills: { blades: 15, shield: 20, 'heavy-armor': 15 }, perks: [], weapon: 'gladius', worn: ['tunica', 'sagum', 'caligae', 'galea-gallica'], healthPicks: 0 },
  { level: 10, skills: { blades: 40, shield: 35, 'heavy-armor': 30 }, perks: ['perk-blades-punctim'], weapon: 'gladius-noric', worn: ['tunica', 'lorica-hamata', 'galea-gallica', 'caligae'], healthPicks: 5 },
  {
    level: 30,
    skills: { blades: 80, shield: 60, 'heavy-armor': 70 },
    perks: ['perk-blades-punctim', 'perk-blades-bilbilis-edge', 'perk-heavy-armor-iron-skin', 'perk-heavy-armor-drill'],
    weapon: 'gladius-bilbilis',
    worn: ['tunica', 'lorica-segmentata', 'galea-cruciata', 'manica-ferrea', 'ocreae', 'caligae'],
    healthPicks: 15,
  },
];

export function playerFor(b: Build) {
  const sheet = new CharacterSheetImpl();
  for (const [k, v] of Object.entries(b.skills)) sheet.setSkill(k, v);
  for (const p of b.perks) sheet.grantPerk(p);
  const worn = b.worn.map((id) => db.require(id));
  return { sheet, armor: effectiveArmorRating(worn, sheet), family: armorFamilyOf(worn), health: 100 + b.healthPicks * 10 };
}

export interface Duel {
  level: number;
  tier: string;
  enemyHealth: number;
  enemyArmor: number;
  playerArmor: number;
  /** Player light attack after armor and damage type, on Normalis. */
  perHit: number;
  hits: number;
  /** Seconds of continuous light attacks, every swing landing. */
  seconds: number;
  enemyPerHit: number;
  hitsToDie: number;
  secondsToDie: number;
}

/** Player vs an enemy tier (one of its kits) and the enemy back, on Normalis (taken ×1.5). */
export function duel(b: Build, tier: string, kit = 0): Duel {
  const p = playerFor(b);
  const w = db.require(b.weapon);
  const prof = combatProfileFor(tier, { kit });
  const perHit = resolveHit({ attack: computeAttack(p.sheet, w.weapon, { item: w }), armor: prof.armor, family: prof.armorFamily, mult: difficultyMult('normalis', true) }).damage;
  const toKill = timeToKill({ damagePerHit: perHit, interval: attackInterval(w.weapon!), health: prof.health });
  const ew = profileWeapon(prof, db);
  const eItem = prof.weapon ? db.get(prof.weapon) : undefined;
  const enemyPerHit = resolveHit({ attack: computeAttack(profileStats(prof), ew, { item: eItem }), armor: p.armor, family: p.family, defender: p.sheet, mult: difficultyMult('normalis', false) }).damage;
  const toDie = timeToKill({ damagePerHit: enemyPerHit, interval: attackInterval(ew), health: p.health });
  return {
    level: b.level,
    tier: `${tier}${prof.weapon ? ` (${prof.weapon})` : ''}`,
    enemyHealth: prof.health,
    enemyArmor: prof.armor,
    playerArmor: Math.round(p.armor),
    perHit,
    hits: toKill.hits,
    seconds: toKill.seconds,
    enemyPerHit,
    hitsToDie: toDie.hits,
    secondsToDie: toDie.seconds,
  };
}

/** Rows of the documented table. */
export const TTK_ROWS: [buildIndex: number, tier: string, kit?: number][] = [
  [0, 'thug'], [0, 'thug', 1], [0, 'bruiser', 1], [0, 'miles'], [0, 'veteran', 1],
  [1, 'thug'], [1, 'miles'], [1, 'veteran'], [1, 'champion'], [1, 'elite'],
  [2, 'thug'], [2, 'miles'], [2, 'champion'], [2, 'elite'], [2, 'boss'],
];

export function ttkTable(): string {
  const rows = ['| Player | Enemy (weapon) | Enemy HP / AR | Player hit | Hits | Seconds | Enemy hit | Hits to kill player | Seconds |', '|---|---|---|---|---|---|---|---|---|'];
  for (const [bi, tier, kit] of TTK_ROWS) {
    const d = duel(BUILDS[bi], tier, kit);
    rows.push(`| L${d.level} (AR ${d.playerArmor}) | ${d.tier} | ${d.enemyHealth} / ${d.enemyArmor} | ${d.perHit.toFixed(1)} | ${d.hits} | ${d.seconds.toFixed(1)} | ${d.enemyPerHit.toFixed(1)} | ${d.hitsToDie} | ${d.secondsToDie.toFixed(1)} |`);
  }
  return rows.join('\n');
}
