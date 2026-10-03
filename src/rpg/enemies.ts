/**
 * Enemy tiers and archetypes → CombatProfile (docs/GDD.md §6.11, §13.1). Stats are fixed per tier —
 * the GDD has no level scaling; areas pick tiers by danger band. A spawner chooses one of the tier's
 * kits (weapon, shield, AR, armor family), or an archetype ('grassator', 'miles-urbanus', 'thraex'…)
 * whose kit sets the weapon, worn pieces and AR; bosses override health and kit.
 */
import { armorFamilyOf, flatStats, FISTS, type CombatantStats } from './combat-math';
import { ARCHETYPES, ENEMY_TIERS, NATURAL_WEAPONS, type ArchetypeDef } from './data/combatants';
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
    dmgMult: def.dmgMult,
    speedMult: def.speed,
    reactionS: def.reaction,
    // §6.12: bosses use two attack tokens.
    tokensCost: def.tier === 'boss' ? 2 : 1,
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
  return flatStats(p.skill, p.dmgMult ?? 1);
}

/** The profile's weapon stats: an item, a natural weapon (bites, claws, fists), or fists. */
export function profileWeapon(p: CombatProfile, items: ItemDb): WeaponStats {
  if (!p.weapon) return FISTS;
  return items.get(p.weapon)?.weapon ?? NATURAL_WEAPONS[p.weapon] ?? FISTS;
}

const archetypes = new Map<string, ArchetypeDef>(ARCHETYPES.map((a) => [a.id, a]));

export function archetypeDef(id: string): ArchetypeDef | undefined {
  return archetypes.get(id);
}

export function allArchetypes(): ArchetypeDef[] {
  return [...archetypes.values()];
}

export interface ArchetypeOptions {
  /** One of the archetype's tiers (gladiators: 'thug' for a tiro, 'veteran', 'champion'); default the first. */
  tier?: string;
  /** Kit index (default 0). */
  kit?: number;
  health?: number;
}

/**
 * A CombatProfile for a §13.1 archetype: the tier's stats with the archetype's kit. Without an
 * explicit AR the kit's AR is the sum of its worn pieces' ratings (body family sets the matrix).
 */
export function archetypeProfile(id: string, items: ItemDb, opts: ArchetypeOptions = {}): CombatProfile {
  const a = archetypes.get(id);
  if (!a) throw new Error(`[enemies] unknown archetype "${id}"`);
  const tiersOf = Array.isArray(a.tier) ? a.tier : [a.tier];
  const tier = opts.tier && tiersOf.includes(opts.tier) ? opts.tier : tiersOf[0];
  const kit = a.kits[opts.kit ?? 0] ?? a.kits[0];
  const worn = (kit.worn ?? []).map((w) => items.get(w)).filter((d): d is NonNullable<typeof d> => !!d);
  const wornAr = worn.reduce((n, d) => n + (d.armor?.rating ?? 0), 0);
  const base = combatProfileFor(tier, { health: opts.health, armor: kit.ar ?? wornAr });
  return {
    ...base,
    name: a.name,
    archetype: a.id,
    band: Array.isArray(a.band) ? a.band[0] : a.band,
    armorFamily: kit.family ?? (worn.length ? armorFamilyOf(worn) : base.armorFamily),
    weapon: kit.weapon,
    shield: kit.shield,
    ranged: kit.ranged,
    worn: kit.worn ? [...kit.worn] : undefined,
    poison: kit.poison,
    companion: kit.companion,
  };
}
