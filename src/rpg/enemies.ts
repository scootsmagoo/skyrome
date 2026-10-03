/** Enemy tier presets → CombatProfile, levelled to the player within each tier's range. */
import { clamp } from '../core/math';
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

/** Level an enemy of this tier spawns at for a player of `playerLevel`. */
export function enemyLevel(def: EnemyTierDef, playerLevel: number): number {
  return clamp(Math.round(playerLevel), def.minLevel, def.maxLevel);
}

/** Build a CombatProfile for a tier. `opts.level` forces a level (named NPCs, bosses). */
export function combatProfileFor(tier: string, playerLevel: number, opts: { level?: number } = {}): CombatProfile {
  const def = tiers.get(tier);
  if (!def) throw new Error(`[enemies] unknown tier "${tier}"`);
  const level = opts.level ?? enemyLevel(def, playerLevel);
  const n = Math.max(0, level - 1);
  const lin = ([base, per]: [number, number]) => Math.round(base + per * n);
  const arms = [...def.weapons].reverse().find((w) => w.minLevel <= level) ?? def.weapons[0];
  return {
    tier: def.tier,
    name: def.name,
    level,
    health: lin(def.health),
    stamina: lin(def.stamina),
    armor: lin(def.armor),
    skill: Math.min(100, lin(def.skill)),
    poise: def.poise,
    damageMult: Math.round(((def.damage?.[0] ?? 1) + (def.damage?.[1] ?? 0) * n) * 1000) / 1000,
    weapon: arms?.weapon,
    shield: arms?.shield,
    aggression: def.aggression,
    blockSkill: def.blockSkill,
    yieldAt: def.yieldAt ?? 0,
    fleeAt: def.fleeAt ?? 0,
    loot: def.loot,
  };
}

const WEAPON_MODS = new Set<string>(['damage.blades', 'damage.spear', 'damage.blunt', 'damage.ranged', 'damage.unarmed']);

/** CombatantStats for a profile: flat skill, and the damage multiplier as a weapon-damage modifier. */
export function profileStats(p: CombatProfile): CombatantStats {
  const base = flatStats(p.skill);
  const dmg = (p.damageMult ?? 1) - 1;
  if (!dmg) return base;
  return { ...base, modifier: (id) => (WEAPON_MODS.has(id) ? dmg : 0) };
}

/** The profile's weapon stats: an item, a natural weapon (bite), or fists. */
export function profileWeapon(p: CombatProfile, items: ItemDb): WeaponStats {
  if (!p.weapon) return FISTS;
  return items.get(p.weapon)?.weapon ?? (NATURAL_WEAPONS as Record<string, WeaponStats>)[p.weapon] ?? FISTS;
}
