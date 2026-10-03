/**
 * Shared time-to-kill scenarios: representative player builds at levels 1/10/30 duelling enemy
 * tiers. Used by tests/rpg-combat.test.ts and the TTK table in docs/modules/rpg.md
 * (print it with `npx vitest run tests/rpg-combat.test.ts -t "TTK table"`).
 */
import { applyArmor, attackInterval, computeAttack, effectiveArmorRating, timeToKill } from '../src/rpg/combat-math';
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

/** A veteran-background melee build as it might look at levels 1, 10 and 30. */
export const BUILDS: Build[] = [
  { level: 1, skills: { blades: 25, block: 25, heavyArmor: 20, lightArmor: 15 }, perks: [], weapon: 'gladius', worn: ['tunica', 'caligae', 'sagum'], healthPicks: 0 },
  { level: 10, skills: { blades: 45, block: 30, lightArmor: 30 }, perks: ['blades.arm1', 'blades.arm2', 'light.agile1'], weapon: 'gladius_mainz', worn: ['lorica_corio', 'cassis_corio', 'caligae', 'parma'], healthPicks: 6 },
  {
    level: 30,
    skills: { blades: 85, block: 60, heavyArmor: 70 },
    perks: ['blades.arm1', 'blades.arm2', 'blades.arm3', 'blades.arm4', 'blades.arm5', 'blades.punctim', 'heavy.miles1', 'heavy.miles2', 'heavy.miles3', 'block.wall1', 'block.wall2'],
    weapon: 'gladius_noric',
    worn: ['lorica_segmentata', 'galea_gallica', 'manica', 'ocreae', 'caligae', 'scutum'],
    healthPicks: 20,
  },
];

export function playerFor(b: Build) {
  const sheet = new CharacterSheetImpl();
  for (const [k, v] of Object.entries(b.skills)) sheet.setSkill(k, v);
  for (const p of b.perks) sheet.grantPerk(p);
  return { sheet, armor: effectiveArmorRating(b.worn.map((id) => db.require(id)), sheet), health: 100 + b.healthPicks * 10 };
}

export interface Duel {
  level: number;
  tier: string;
  enemyLevel: number;
  enemyHealth: number;
  enemyArmor: number;
  playerArmor: number;
  /** Player light attack after armor. */
  perHit: number;
  hits: number;
  /** Seconds of continuous light attacks, every swing landing. */
  seconds: number;
  powerHit: number;
  enemyPerHit: number;
  hitsToDie: number;
  secondsToDie: number;
}

/** Player vs an enemy tier at the build's level, and the enemy back (light attacks, all landing). */
export function duel(b: Build, tier: string): Duel {
  const p = playerFor(b);
  const w = db.require(b.weapon);
  const atk = computeAttack(p.sheet, w.weapon, { item: w });
  const prof = combatProfileFor(tier, b.level);
  const perHit = applyArmor(atk.damage, prof.armor);
  const toKill = timeToKill({ damagePerHit: perHit, interval: atk.interval, health: prof.health });
  const ew = profileWeapon(prof, db);
  const enemyPerHit = applyArmor(computeAttack(profileStats(prof), ew).damage, p.armor);
  const toDie = timeToKill({ damagePerHit: enemyPerHit, interval: attackInterval(ew), health: p.health });
  const powerHit = applyArmor(computeAttack(p.sheet, w.weapon, { item: w, power: true }).damage, prof.armor);
  return {
    level: b.level,
    tier,
    enemyLevel: prof.level!,
    enemyHealth: prof.health,
    enemyArmor: prof.armor,
    playerArmor: Math.round(p.armor),
    perHit,
    hits: toKill.hits,
    seconds: toKill.seconds,
    powerHit,
    enemyPerHit,
    hitsToDie: toDie.hits,
    secondsToDie: toDie.seconds,
  };
}

export function ttkTable(tiers = ['thug', 'brigand', 'gladiator', 'veteran', 'urbanus', 'praetorian', 'champion', 'boss']): string {
  const rows = ['| Player | Enemy (level) | Enemy HP / armor | Player hit | Hits | Seconds | Enemy hit | Hits to kill player | Seconds |', '|---|---|---|---|---|---|---|---|---|'];
  for (const b of BUILDS)
    for (const t of tiers) {
      const d = duel(b, t);
      rows.push(`| L${d.level} (AR ${d.playerArmor}) | ${t} (${d.enemyLevel}) | ${d.enemyHealth} / ${d.enemyArmor} | ${d.perHit.toFixed(1)} | ${d.hits} | ${d.seconds.toFixed(1)} | ${d.enemyPerHit.toFixed(1)} | ${d.hitsToDie} | ${d.secondsToDie.toFixed(1)} |`);
    }
  return rows.join('\n');
}
