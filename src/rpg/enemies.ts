/**
 * Enemy tiers → CombatProfile (docs/GDD.md §6.11). Stats are fixed per tier — the GDD has no level
 * scaling; areas pick tiers by danger band. A spawner chooses one of the tier's kits (weapon,
 * shield, AR, armor family); bosses override health and kit.
 */
import { flatStats, FISTS, type CombatantStats } from './combat-math';
import { ENEMY_TIERS, NATURAL_WEAPONS } from './data/enemies';
import type { ItemDb } from './items';
import type { CombatProfile, EnemyTierDef, WeaponStats } from './types';

const tiers = new Map<string, EnemyTierDef>(ENEMY_TIERS.map((t) => [t.tier, t]));

export function registerEnemyTiers(defs: readonly EnemyTierDef[]) {
  for (const d of defs) tiers.set(d.tier, d);
}

export function tierDef(tier: string): EnemyTierDef | undefined {
  return tiers.get(tier);
}

export function allTiers(): EnemyTierDef[] {
  return [...tiers.values()];
}

/** Tiers that appear in a danger band (0 civilians … 4 elite). */
export function tiersInBand(band: number, opts: { beasts?: boolean } = {}): EnemyTierDef[] {
  return allTiers().filter((t) => {
    if (!!t.beast !== !!opts.beasts) return false;
    const [lo, hi] = Array.isArray(t.band) ? t.band : [t.band, t.band];
    return band >= lo && band <= hi;
  });
}

export interface ProfileOptions {
  /** Kit index, or the weapon id of a kit (default: the first kit). */
  kit?: number | string;
  /** Bosses: authored health (300–700). */
  health?: number;
  /** Override the kit's AR. */
  armor?: number;
}

/** Build a CombatProfile for a tier with one of its kits. */
export function combatProfileFor(tier: string, opts: ProfileOptions = {}): CombatProfile {
  const def = tiers.get(tier);
  if (!def) throw new Error(`[enemies] unknown tier "${tier}"`);
  const kit = (typeof opts.kit === 'string' ? def.kits.find((k) => k.weapon === opts.kit) : def.kits[opts.kit ?? 0]) ?? def.kits[0];
  const armor = opts.armor ?? kit?.ar ?? Math.round((def.ar[0] + def.ar[1]) / 2);
  return {
    tier: def.tier,
    name: def.name,
    band: Array.isArray(def.band) ? def.band[0] : def.band,
    health: opts.health ?? def.health,
    stamina: def.stamina,
    armor,
    armorFamily: kit?.family ?? def.family ?? 'cloth',
    skill: def.skill,
    poise: def.poise,
    damageMult: def.dmgMult,
    speed: def.speed,
    reaction: def.reaction,
    weapon: kit?.weapon,
    shield: kit?.shield,
    aggression: def.aggression,
    blockSkill: def.blockSkill,
    yieldAt: def.beast ? 0 : (def.yieldAt ?? 0),
    fleeAt: def.fleeAt ?? 0,
    loot: def.loot,
    beast: def.beast,
  };
}

/** CombatantStats for a profile: flat skill, no perks, the tier's damage multiplier. */
export function profileStats(p: CombatProfile): CombatantStats {
  return flatStats(p.skill, p.damageMult ?? 1);
}

/** The profile's weapon stats: an item, a natural weapon (bites, claws, fists), or fists. */
export function profileWeapon(p: CombatProfile, items: ItemDb): WeaponStats {
  if (!p.weapon) return FISTS;
  return items.get(p.weapon)?.weapon ?? NATURAL_WEAPONS[p.weapon] ?? FISTS;
}
