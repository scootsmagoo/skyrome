/**
 * Combat formulas — pure functions the combat system calls. No state except the tiny PoiseState.
 *
 *   attack  = (weapon + ammo) × (1 + skill × 0.005) × (1 + class perks)
 *             × power (×2 × (1 + damage.power)) × sneak (×3 melee / ×2 ranged, + damage.sneak)
 *   block   = raw × (1 − mitigation); mitigation = shield (or 0.35/0.5 weapon) + block skill + perks, ≤ 0.95
 *             stamina cost = raw × 0.6 (× 1.5 vs power attacks) × (1 − block.staminaCost); out of stamina = guard break
 *   armor   = after-block × (1 − min(0.8, R / (R + 120)))
 *   poise   = weapon.stagger × 40 (× 2 power, × 0.35 blocked); ≤ 0 → stagger, ≥ 90% of max in one hit → knockdown
 *
 * Order of application: raw → block → armor → difficulty multiplier. Numbers live in data/balance.ts.
 */
import { clamp } from '../core/math';
import { COMBAT, DIFFICULTY, STAMINA_COSTS, type Difficulty } from './data/balance';
import type { ItemDef, ModifierId, ShieldStats, WeaponClass, WeaponStats } from './types';

/** What combat needs to know about a combatant: the player's sheet, or an NPC stub. */
export interface CombatantStats {
  skillLevel(id: string): number;
  modifier(id: ModifierId): number;
  hasFlag(flag: string): boolean;
}

/** Stats for an NPC with a flat skill level and no perks. */
export function flatStats(skill: number): CombatantStats {
  return { skillLevel: () => skill, modifier: () => 0, hasFlag: () => false };
}

export const FISTS: WeaponStats = { class: 'unarmed', skill: 'unarmed', ...COMBAT.fists };

export function isRanged(cls: WeaponClass) {
  return cls === 'bow' || cls === 'sling' || cls === 'thrown';
}

/** The damage modifier that applies to a weapon class. */
export function damageModifierFor(cls: WeaponClass): ModifierId {
  switch (cls) {
    case 'blade':
      return 'damage.blades';
    case 'spear':
    case 'thrown':
      return 'damage.spear';
    case 'blunt':
      return 'damage.blunt';
    case 'bow':
    case 'sling':
      return 'damage.ranged';
    default:
      return 'damage.unarmed';
  }
}

export interface AttackOptions {
  power?: boolean;
  /** Target unaware of the attacker. */
  sneak?: boolean;
  /** Bow draw 0..1 (ranged only; default 1). */
  charge?: number;
  /** Arrow / sling bullet (adds its damage). */
  ammo?: WeaponStats;
  /** The weapon item (tags like 'dagger', and weight for stamina cost). */
  item?: ItemDef;
}

export interface AttackResult {
  /** Raw damage before block and armor. */
  damage: number;
  /** Poise damage before block. */
  poise: number;
  /** Stamina the attacker spends. */
  staminaCost: number;
  /** Fraction of the target's armor ignored (Skullcracker). */
  armorIgnore: number;
  /** Seconds this swing takes. */
  interval: number;
}

/** Raw weapon damage from base numbers (no perks lookup). */
export function weaponDamage(
  w: WeaponStats,
  skill: number,
  opts: { classMod?: number; power?: boolean; powerMod?: number; sneak?: boolean; sneakMod?: number; sneakMult?: number; charge?: number; ammo?: WeaponStats } = {},
): number {
  const ranged = isRanged(w.class);
  let d = (w.damage + (opts.ammo?.damage ?? 0)) * (1 + clamp(skill, 0, 100) * COMBAT.skillDamagePerLevel) * Math.max(0, 1 + (opts.classMod ?? 0));
  if (ranged && w.class === 'bow') d *= 0.35 + 0.65 * clamp(opts.charge ?? 1, 0, 1);
  if (opts.power && !ranged) d *= COMBAT.powerMult * (1 + (opts.powerMod ?? 0));
  if (opts.sneak) d *= (opts.sneakMult ?? (ranged ? COMBAT.sneakRanged : COMBAT.sneakMelee)) + (opts.sneakMod ?? 0);
  return d;
}

/** Everything about one swing/shot by a combatant with a weapon (undefined = fists). */
export function computeAttack(stats: CombatantStats, weapon: WeaponStats | undefined, opts: AttackOptions = {}): AttackResult {
  const w = weapon ?? FISTS;
  const ranged = isRanged(w.class);
  const dagger = !!opts.item?.tags?.includes('dagger') && stats.hasFlag('sneak.dagger');
  let sneakMult = ranged ? COMBAT.sneakRanged : COMBAT.sneakMelee;
  if (dagger && opts.sneak) sneakMult *= 2;
  const damage = weaponDamage(w, stats.skillLevel(w.skill), {
    classMod: stats.modifier(damageModifierFor(w.class)),
    power: opts.power,
    powerMod: stats.modifier('damage.power'),
    sneak: opts.sneak,
    sneakMod: ranged ? 0 : stats.modifier('damage.sneak') * (dagger ? 2 : 1),
    sneakMult,
    charge: opts.charge,
    ammo: opts.ammo,
  });
  let poise = poiseDamage(w.stagger + (opts.ammo?.stagger ?? 0), !!opts.power && !ranged, false);
  if (w.class === 'blunt' && stats.hasFlag('blunt.stagger')) poise *= 1.5;
  if (w.class === 'unarmed' && opts.power && stats.hasFlag('unarmed.knockdown')) poise = Math.max(poise, 1000);
  return {
    damage,
    poise,
    staminaCost: attackStaminaCost(opts.item?.weight ?? (weapon ? 1 : 0), !!opts.power, stats.modifier('stamina.attackCost')),
    armorIgnore: w.class === 'blunt' && opts.power && stats.hasFlag('blunt.ignoreArmor') ? 0.25 : 0,
    interval: attackInterval(w, !!opts.power),
  };
}

export function attackStaminaCost(weaponKg: number, power: boolean, costMod = 0): number {
  const base = power ? STAMINA_COSTS.powerFlat + STAMINA_COSTS.powerPerKg * weaponKg : STAMINA_COSTS.lightFlat + STAMINA_COSTS.lightPerKg * weaponKg;
  return base * Math.max(0, 1 - costMod);
}

/** Seconds per swing. */
export function attackInterval(w: WeaponStats, power = false): number {
  return (power ? COMBAT.powerSwingSeconds : COMBAT.swingSeconds) / Math.max(0.1, w.speed);
}

// ------------------------------------------------------------------ armor

export function armorMitigation(rating: number, ignore = 0): number {
  const r = Math.max(0, rating) * (1 - clamp(ignore, 0, 1));
  return Math.min(COMBAT.armorCap, r / (r + COMBAT.armorK));
}

export function applyArmor(damage: number, rating: number, ignore = 0): number {
  return damage * (1 - armorMitigation(rating, ignore));
}

/** Displayed armor rating of worn pieces (and shield), scaled by armor skills and perks. */
export function effectiveArmorRating(pieces: readonly ItemDef[], stats: CombatantStats): number {
  const heavy = (1 + stats.skillLevel('heavyArmor') * COMBAT.armorSkillPerLevel) * (1 + stats.modifier('armor.heavy'));
  const light = (1 + stats.skillLevel('lightArmor') * COMBAT.armorSkillPerLevel) * (1 + stats.modifier('armor.light'));
  const shield = 1 + stats.skillLevel('block') * COMBAT.armorSkillPerLevel;
  let total = 0;
  for (const p of pieces) {
    if (p.armor) total += p.armor.rating * (p.armor.weightClass === 'heavy' ? heavy : p.armor.weightClass === 'light' ? light : 1);
    if (p.shield) total += p.shield.rating * shield;
  }
  return total;
}

// ------------------------------------------------------------------ block

export interface BlockInput {
  /** Raw incoming damage. */
  damage: number;
  shield?: ShieldStats;
  /** Blocking with a two-handed weapon (better than one-handed). */
  twoHanded?: boolean;
  /** Incoming power attack. */
  power?: boolean;
  /** Incoming arrow / bullet / javelin. */
  ranged?: boolean;
  /** The blocker's current stamina. */
  stamina: number;
}

export interface BlockResult {
  damage: number;
  staminaCost: number;
  guardBroken: boolean;
  mitigation: number;
}

export function blockMitigation(stats: CombatantStats, shield?: ShieldStats, twoHanded = false): number {
  const base = shield ? shield.blockMitigation : twoHanded ? COMBAT.weaponBlock.twoHand : COMBAT.weaponBlock.oneHand;
  return Math.min(COMBAT.blockCap, base + stats.skillLevel('block') * COMBAT.blockSkillPerLevel + stats.modifier('block.mitigation'));
}

export function resolveBlock(stats: CombatantStats, i: BlockInput): BlockResult {
  let mitigation = blockMitigation(stats, i.shield, i.twoHanded);
  if (i.ranged && i.shield && stats.hasFlag('block.missiles')) mitigation = 1;
  let staminaCost = i.damage * STAMINA_COSTS.blockPerDamage * (i.power ? COMBAT.blockPowerMult : 1) * Math.max(0, 1 - stats.modifier('block.staminaCost'));
  let guardBroken = false;
  if (staminaCost > i.stamina + 1e-9) {
    guardBroken = true;
    mitigation *= COMBAT.guardBreakKeep;
    staminaCost = Math.max(0, i.stamina);
  }
  return { damage: i.damage * (1 - mitigation), staminaCost, guardBroken, mitigation };
}

// ------------------------------------------------------------------ poise / stagger

export type StaggerResult = 'none' | 'flinch' | 'stagger' | 'knockdown';

export interface PoiseState {
  current: number;
  max: number;
  /** Seconds until regeneration resumes. */
  delay: number;
}

export function createPoise(max: number): PoiseState {
  return { current: max, max, delay: 0 };
}

export function poiseDamage(stagger: number, power: boolean, blocked: boolean): number {
  return stagger * COMBAT.poisePerStagger * (power ? COMBAT.poisePowerMult : 1) * (blocked ? COMBAT.poiseBlockedMult : 1);
}

/** Apply poise damage; `resist` (0..1) reduces it (heavy armor perk, bosses). */
export function applyPoiseDamage(state: PoiseState, amount: number, resist = 0): StaggerResult {
  amount *= 1 - clamp(resist, 0, 1);
  if (!(amount > 0)) return 'none';
  state.delay = COMBAT.poiseRegenDelay;
  if (amount >= state.max * COMBAT.knockdownFrac) {
    state.current = state.max;
    return 'knockdown';
  }
  state.current -= amount;
  if (state.current <= 0) {
    state.current = state.max;
    return 'stagger';
  }
  return 'flinch';
}

export function tickPoise(state: PoiseState, dt: number) {
  if (state.delay > 0) {
    state.delay = Math.max(0, state.delay - dt);
    return;
  }
  state.current = Math.min(state.max, state.current + state.max * COMBAT.poiseRegen * dt);
}

// ------------------------------------------------------------------ whole hits

export interface HitInput {
  attack: Pick<AttackResult, 'damage' | 'poise' | 'armorIgnore'>;
  /** Defender's effective armor rating. */
  armor: number;
  /** Present when the defender is blocking and facing the attack. */
  block?: { stats: CombatantStats; shield?: ShieldStats; twoHanded?: boolean; stamina: number; power?: boolean; ranged?: boolean };
  /** Difficulty multiplier (difficultyMult()). */
  mult?: number;
}

export interface HitResult {
  damage: number;
  poise: number;
  blocked: boolean;
  guardBroken: boolean;
  blockStamina: number;
}

/** Raw → block → armor → difficulty. */
export function resolveHit(h: HitInput): HitResult {
  let damage = h.attack.damage;
  let poise = h.attack.poise;
  let blockStamina = 0;
  let guardBroken = false;
  if (h.block) {
    const b = resolveBlock(h.block.stats, { damage, shield: h.block.shield, twoHanded: h.block.twoHanded, power: h.block.power, ranged: h.block.ranged, stamina: h.block.stamina });
    damage = b.damage;
    blockStamina = b.staminaCost;
    guardBroken = b.guardBroken;
    poise *= guardBroken ? 1 : COMBAT.poiseBlockedMult;
  }
  damage = applyArmor(damage, h.armor, h.attack.armorIgnore) * (h.mult ?? 1);
  return { damage, poise, blocked: !!h.block, guardBroken, blockStamina };
}

/** Damage multiplier for the current difficulty: player attacking → dealt, player defending → taken. */
export function difficultyMult(difficulty: Difficulty, playerIsAttacker: boolean): number {
  const d = DIFFICULTY[difficulty] ?? DIFFICULTY.adept;
  return playerIsAttacker ? d.dealt : d.taken;
}

/** Balancing helper: swings to kill, and seconds when only `hitRate` of swings land unblocked. */
export function timeToKill(o: { damagePerHit: number; interval: number; health: number; hitRate?: number }): { hits: number; seconds: number } {
  const hits = o.damagePerHit > 0 ? Math.ceil(o.health / o.damagePerHit - 1e-9) : Infinity;
  return { hits, seconds: (hits * o.interval) / clamp(o.hitRate ?? 1, 0.01, 1) };
}
