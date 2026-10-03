/**
 * Combat formulas — docs/GDD.md §6.2–6.7, as pure functions the combat system calls.
 *
 *   raw   = W.damage × condition × (1 + skill/200) × (1 + Σ damage.<class>) × attackMult × sneakMult × critMult
 *           × (attacker is the player ? difficulty.dealt : tier.dmgMult × (target is the player ? difficulty.taken : 1))
 *   typed = raw × TYPE_VS_FAMILY[damageType][target body-armor family]
 *   final = max(1, typed × (1 − armorReduction(AR)) × (blocking ? 1 − blockMitigation : 1))
 *   armorReduction(AR) = min(0.60, AR / (AR + 120))
 *   AR    = Σ worn pieces × condition × (1 + armorSkill/250) × (1 + armor.light|armor.heavy); shields add none
 *
 * Block mitigation: the shield's, or weapon-only (blades 0.45, two-handed 0.55, fists 0.25), + Shield/400
 * (max +0.25), cap 0.95; sica/falx hooks ignore part of it. Stamina per absorbed hit:
 * max(4, 0.6 × raw × (1 − Shield/200)); at 0 stamina the guard breaks (stagger 1.2 s).
 * Poise damage = weapon.stagger × (light 1, power 2.5, bash 2, sprint 1.5); regen 15/s after 1.5 s.
 */
import { clamp } from '../core/math';
import { COMBAT, DIFFICULTY, STAMINA_COSTS, type Difficulty } from './data/balance';
import type { ArmorFamily, DamageType, ItemDef, ModifierId, ShieldStats, WeaponClass, WeaponStats } from './types';

/** What combat needs to know about a combatant: the player's sheet, or an NPC stub. */
export interface CombatantStats {
  skillLevel(id: string): number;
  modifier(id: ModifierId): number;
  hasFlag(flag: string): boolean;
  /** NPC tier damage multiplier (GDD dmgMult); the player has none. */
  damageMult?: number;
}

/** Stats for an NPC with a flat skill level, no perks and a tier damage multiplier. */
export function flatStats(skill: number, damageMult = 1): CombatantStats {
  return { skillLevel: () => skill, modifier: () => 0, hasFlag: () => false, damageMult };
}

export const FISTS: WeaponStats = { class: 'unarmed', skill: 'brawling', damageType: 'blunt', ...COMBAT.fists };

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

/** A weapon's main damage type, defaulting by class. */
export function damageTypeOf(w: WeaponStats): DamageType {
  if (w.damageType) return w.damageType;
  return w.class === 'blunt' || w.class === 'unarmed' || w.class === 'sling' ? 'blunt' : 'thrust';
}

/** Armor family of an outfit: the body piece decides (§8.3); cloth without one. */
export function armorFamilyOf(pieces: readonly ItemDef[]): ArmorFamily {
  const body = pieces.find((p) => p.slot === 'body' && p.armor);
  if (!body?.armor) return 'cloth';
  if (body.armor.family) return body.armor.family;
  return body.armor.weightClass === 'heavy' ? 'mail' : body.armor.weightClass === 'light' ? 'padded' : 'cloth';
}

/** TYPE_VS_FAMILY (§6.2). */
export function typeFactor(type: DamageType, family: ArmorFamily): number {
  return COMBAT.typeVsFamily[family][type];
}

/** §6.3 Condition scales AR and damage by 0.5 + 0.5 × condition. */
export function conditionFactor(condition = 1): number {
  return COMBAT.conditionFloor + (1 - COMBAT.conditionFloor) * clamp(condition, 0, 1);
}

// ------------------------------------------------------------------ attacks

export type PowerDirection = keyof typeof COMBAT.directional;

export interface AttackOptions {
  /** Power attack, with how long it was charged (seconds; 0.35 → ×1.5, 0.8+ → ×2.0) or a direction. */
  power?: boolean;
  chargeSeconds?: number;
  /** WASD direction of a power attack (§6.1): forward 2.0, sideways 1.4 (sweep), back 1.3, none 2.0 (+50% poise). */
  direction?: PowerDirection;
  /** Position in the light-attack chain (the 3rd hit is ×1.25). */
  chain?: number;
  /** Sprint attack: ×1.3 damage, ×1.5 poise, ×1.5 stamina. */
  sprint?: boolean;
  /** Shield bash: ×0.3 (blunt), poise ×2. */
  bash?: boolean;
  /** Riposte after a parry: ×2, guaranteed stagger. */
  riposte?: boolean;
  /** Target unaware (§6.7). */
  sneak?: boolean;
  /** Use the weapon's alternative strike (a gladius cut, a spatha thrust). */
  alt?: boolean;
  /** Thrown (pilum, lancea, iaculum). */
  thrown?: boolean;
  /** Bow: a partial draw (from 0.4 s) does 50%. */
  partialDraw?: boolean;
  /** Arrow / sling bullet (its damage is added): the item (preferred) or just its stats. */
  ammoItem?: ItemDef;
  ammo?: WeaponStats;
  /** The weapon item (tags: dagger, hook, falx, venatio, vitis…; weight for stamina). */
  item?: ItemDef;
  /** Weapon condition 0..1. */
  condition?: number;
  /** Target kind, for Venator/venabulum/beast-wise and the vitis. */
  vsBeast?: boolean;
  vsSoldier?: boolean;
  /** Ranged headshot. */
  headshot?: 'bare' | 'helmeted';
  /** Random 0..1 for the crit roll (omit = no crit). */
  critRoll?: number;
}

export interface AttackResult {
  /** Raw damage before difficulty, armor and block. */
  damage: number;
  damageType: DamageType;
  /** Poise damage. */
  poise: number;
  /** Stamina the attacker spends. */
  staminaCost: number;
  /** Thrust bonus against mail and plate (Punctim). */
  thrustVsMetal: number;
  /** Fraction of the defender's block mitigation ignored (sica 0.25, falx 0.5, Falx Hook 0.5). */
  blockIgnore: number;
  /** Cannot be blocked (falx power sweep). */
  unblockable: boolean;
  /** Chance to cause bleeding before the target-AR halving (cut hits with blades). */
  bleedChance: number;
  crit: boolean;
  /** Fists or a fustis from behind on a human up to veteran: instant knockout (§6.7). */
  takedown: boolean;
  /** Seconds this swing takes. */
  interval: number;
}

/** attackMult for a power attack charged `seconds` (§6.1): ×1.5 at 0.35 s rising to ×2.0 at 0.8 s. */
export function powerChargeMult(seconds = COMBAT.attack.chargeMaxSec): number {
  const a = COMBAT.attack;
  const t = clamp((seconds - a.chargeMinSec) / (a.chargeMaxSec - a.chargeMinSec), 0, 1);
  return a.powerMin + (a.powerMax - a.powerMin) * t;
}

/** Everything about one swing or shot by a combatant with a weapon (undefined = fists). */
export function computeAttack(stats: CombatantStats, weapon: WeaponStats | undefined, opts: AttackOptions = {}): AttackResult {
  const w = weapon ?? FISTS;
  const ranged = isRanged(w.class) && !(w.class === 'thrown' && !opts.thrown);
  const tags = opts.item?.tags ?? [];
  const power = !!opts.power && !isRanged(w.class);
  const dagger = tags.includes('dagger');
  const ammo = opts.ammo ?? opts.ammoItem?.weapon;

  // Base damage and type.
  let base = opts.thrown && w.thrownDamage !== undefined ? w.thrownDamage : w.damage;
  let damageType = damageTypeOf(w);
  if (opts.alt && w.alt) {
    base = w.alt.damage;
    damageType = w.alt.damageType;
  }
  if (opts.bash) damageType = 'blunt';
  base += ammo?.damage ?? 0;

  // raw = W × condition × skill × class perks × attack × sneak × crit
  let raw = base * conditionFactor(opts.condition) * (1 + clamp(stats.skillLevel(w.skill), 0, 100) / COMBAT.skillDiv) * Math.max(0, 1 + stats.modifier(damageModifierFor(w.class)));
  const A = COMBAT.attack;
  let attackMult = A.light;
  if (opts.bash) attackMult = A.bash;
  else if (power) attackMult = opts.direction ? COMBAT.directional[opts.direction] : powerChargeMult(opts.chargeSeconds);
  else if ((opts.chain ?? 1) >= 3) attackMult = A.chain3;
  if (power) attackMult *= 1 + stats.modifier('damage.power');
  if (opts.sprint) attackMult *= A.sprint;
  if (opts.riposte) attackMult *= A.riposte;
  if (w.class === 'bow' && opts.partialDraw) attackMult *= COMBAT.partialDraw;
  if (opts.thrown && stats.hasFlag('perk-spear-pilum-volley')) attackMult *= 1.3;
  if (opts.headshot && ranged) attackMult *= COMBAT.headshot[opts.headshot];
  if (opts.vsBeast) {
    if (stats.hasFlag('perk-spear-venator') && (w.class === 'spear' || w.class === 'thrown')) attackMult *= 1.3;
    if (tags.includes('venatio')) attackMult *= 1.25;
    if (stats.hasFlag('trait-beast-wise')) attackMult *= 1.2;
  }
  if (stats.hasFlag('nemesis.retribution')) attackMult *= 1.5;
  raw *= attackMult;

  let sneakMult = 1;
  if (opts.sneak) {
    const S = COMBAT.sneak;
    const perk = stats.hasFlag('perk-stealth-assassin');
    sneakMult = ranged ? S.ranged : dagger ? (perk ? S.daggerPerk : S.dagger) : perk ? S.meleePerk : S.melee;
    sneakMult += stats.modifier('damage.sneak');
  }
  raw *= sneakMult;

  const critChance = COMBAT.crit.chance + (stats.hasFlag('luck.crit') ? COMBAT.crit.fortunaBonus : 0);
  const crit = !opts.sneak && opts.critRoll !== undefined && opts.critRoll < critChance;
  if (crit) raw *= COMBAT.crit.mult;
  raw *= stats.damageMult ?? 1;

  // Poise.
  const P = COMBAT.poiseMult;
  let poise = w.stagger * (opts.bash ? P.bash : power ? P.power : opts.sprint ? P.sprint : P.light);
  if (power && opts.direction === 'none') poise *= COMBAT.overheadPoise;
  if (ammo?.stagger) poise += ammo.stagger;
  if (opts.ammoItem?.tags?.includes('lead') && stats.hasFlag('perk-archery-lead-shot')) poise *= 1.5;
  if (opts.vsSoldier && tags.includes('vitis')) poise *= 1.5;

  // Stamina (§6.1).
  const kg = opts.item?.weight ?? (weapon ? 1 : 0);
  const light = STAMINA_COSTS.lightFlat + STAMINA_COSTS.lightPerKg * kg;
  let staminaCost = opts.bash ? STAMINA_COSTS.bash : power ? Math.max(STAMINA_COSTS.powerMin, light * STAMINA_COSTS.powerMult) : light;
  if (opts.sprint && !opts.bash) staminaCost *= STAMINA_COSTS.sprintAttackMult;
  if (power && stats.hasFlag('power.free')) staminaCost = 0;
  staminaCost *= Math.max(0, 1 - stats.modifier('stamina.attackCost'));

  // Block hooks and bleeding.
  const hooked = (tags.includes('hook') || tags.includes('falx')) && stats.hasFlag('perk-blades-falx-hook');
  const blockIgnore = hooked ? COMBAT.blockIgnore.hooked : tags.includes('falx') ? COMBAT.blockIgnore.falx : tags.includes('hook') ? COMBAT.blockIgnore.sica : 0;
  let bleedChance = 0;
  if (w.class === 'blade' && damageType === 'cut') bleedChance = (power ? COMBAT.bleed.powerChance : COMBAT.bleed.chance) + (stats.hasFlag('perk-blades-bilbilis-edge') ? 0.15 : 0);

  return {
    damage: raw,
    damageType,
    poise,
    staminaCost,
    thrustVsMetal: stats.hasFlag('perk-blades-punctim') ? 0.25 : 0,
    blockIgnore,
    unblockable: power && tags.includes('falx') && opts.direction === 'sideways',
    bleedChance,
    crit,
    takedown: !!opts.sneak && !power && (w.class === 'unarmed' || opts.item?.id === 'fustis'),
    interval: attackInterval(w, power),
  };
}

/** Seconds per swing (wind-up + active + recovery), scaled by weapon speed. */
export function attackInterval(w: WeaponStats, power = false): number {
  return (power ? COMBAT.swingSeconds + COMBAT.attack.chargeMaxSec : COMBAT.swingSeconds) / Math.max(0.1, w.speed);
}

// ------------------------------------------------------------------ armor

export function armorReduction(ar: number): number {
  const r = Math.max(0, ar);
  return Math.min(COMBAT.armorCap, r / (r + COMBAT.armorK));
}

export function applyArmor(damage: number, ar: number): number {
  return damage * (1 - armorReduction(ar));
}

/**
 * AR of worn pieces (§6.2): Σ AR × condition × (1 + armorSkill/250) × (1 + armor.light|heavy).
 * Clothing adds its small AR unscaled; shields add none (they work only by blocking).
 * Gladiator's Manica doubles a manica.
 */
export function effectiveArmorRating(pieces: readonly (ItemDef | { def: ItemDef; condition?: number })[], stats: CombatantStats): number {
  const heavy = (1 + stats.skillLevel('heavy-armor') / COMBAT.armorSkillDiv) * (1 + stats.modifier('armor.heavy'));
  const light = (1 + stats.skillLevel('light-armor') / COMBAT.armorSkillDiv) * (1 + stats.modifier('armor.light'));
  let total = 0;
  for (const p of pieces) {
    const def = 'def' in p ? p.def : p;
    const cond = 'def' in p ? conditionFactor(p.condition) : 1;
    if (!def.armor) continue;
    const scale = def.armor.weightClass === 'heavy' ? heavy : def.armor.weightClass === 'light' ? light : 1;
    const manica = def.tags?.includes('manica') && stats.hasFlag('perk-light-armor-manica') ? 2 : 1;
    total += def.armor.rating * cond * scale * manica;
  }
  return total;
}

/** Which armor skill a hit trains: whichever class gives at least half the worn AR (§5.4). */
export function armorSkillFor(pieces: readonly ItemDef[]): 'heavy-armor' | 'light-armor' | null {
  let heavy = 0;
  let light = 0;
  for (const p of pieces) {
    if (p.armor?.weightClass === 'heavy') heavy += p.armor.rating;
    else if (p.armor?.weightClass === 'light') light += p.armor.rating;
  }
  if (heavy + light <= 0) return null;
  return heavy >= (heavy + light) / 2 ? 'heavy-armor' : 'light-armor';
}

// ------------------------------------------------------------------ block & parry

export interface BlockInput {
  /** Raw incoming damage (after the difficulty multiplier). */
  damage: number;
  shield?: ShieldStats;
  /** Blocking with a two-handed weapon (spear, falx). */
  twoHanded?: boolean;
  /** Blocking bare-handed. */
  fists?: boolean;
  /** Incoming arrow / bullet / javelin. */
  ranged?: boolean;
  /** Fraction of mitigation the attack ignores (AttackResult.blockIgnore). */
  ignore?: number;
  /** Allies within 2 m (Shield Wall). */
  alliesNear?: number;
  /** The blocker's current stamina. */
  stamina: number;
}

export interface BlockResult {
  /** Damage left after the block (before armor). */
  damage: number;
  staminaCost: number;
  /** Stamina ran out: stagger for COMBAT.guardBreakStagger seconds. */
  guardBroken: boolean;
  mitigation: number;
}

/** Block mitigation (§6.4): shield value or weapon-only, + Shield skill/400 (max +0.25), cap 0.95. */
export function blockMitigation(stats: CombatantStats, opts: { shield?: ShieldStats; twoHanded?: boolean; fists?: boolean; alliesNear?: number } = {}): number {
  const wb = COMBAT.weaponBlock;
  const base = opts.shield ? opts.shield.blockMitigation : opts.fists ? wb.fists : opts.twoHanded ? wb.twoHand : wb.blade;
  let m = base + Math.min(COMBAT.blockSkillMax, stats.skillLevel('shield') / COMBAT.blockSkillDiv) + stats.modifier('block.mitigation');
  if (opts.shield && stats.hasFlag('perk-shield-wall')) m += 0.1 * Math.min(2, opts.alliesNear ?? 0);
  return Math.min(COMBAT.blockCap, m);
}

export function resolveBlock(stats: CombatantStats, i: BlockInput): BlockResult {
  let mitigation = blockMitigation(stats, i) * (1 - clamp(i.ignore ?? 0, 0, 1));
  const B = COMBAT.blockStamina;
  let staminaCost = Math.max(B.min, B.mult * i.damage * (1 - stats.skillLevel('shield') / B.skillDiv));
  staminaCost *= Math.max(0, 1 - stats.modifier('block.staminaCost'));
  if (i.ranged) {
    // Missiles: a raised shield either stops one (its `missiles` fraction) or doesn't (§6.4); Testudo: 0 stamina.
    if (!i.shield) mitigation = 0;
    if (i.shield && stats.hasFlag('perk-shield-testudo') && (i.shield.missiles ?? 0) >= 1) staminaCost = 0;
  }
  const guardBroken = staminaCost >= i.stamina - 1e-9 && staminaCost > 0;
  return { damage: i.damage * (1 - mitigation), staminaCost: Math.min(staminaCost, Math.max(0, i.stamina)), guardBroken, mitigation };
}

/** Whether a raised shield stops a missile (§6.4: scutum 100%, oval 90%, parma 70%, parmula 60%). */
export function missileBlocked(shield: ShieldStats | undefined, roll: number): boolean {
  return !!shield && roll < (shield.missiles ?? 0);
}

/** Parry window in seconds (§6.4, §6.12), with Practised Parry. */
export function parryWindow(stats: CombatantStats, difficulty: Difficulty = 'normalis'): number {
  return DIFFICULTY[difficulty].parryWindow + (stats.hasFlag('perk-shield-parry-plus') ? COMBAT.parry.perkWindowBonus : 0);
}

/**
 * A timed block (§6.4): 0 damage and 0 stamina; the attacker loses 60% of max poise and staggers
 * 1.0 s; a 0.8 s riposte window opens. Power attacks can be parried only with a shield (otherwise
 * it counts as a normal block → `parried: false`).
 */
export function resolveParry(o: { attackerPoiseMax: number; power?: boolean; withShield: boolean }): { parried: boolean; attackerPoiseLoss: number; attackerStagger: number; riposteWindow: number } {
  if (o.power && !o.withShield) return { parried: false, attackerPoiseLoss: 0, attackerStagger: 0, riposteWindow: 0 };
  const P = COMBAT.parry;
  return { parried: true, attackerPoiseLoss: o.attackerPoiseMax * P.attackerPoiseLoss, attackerStagger: P.attackerStagger, riposteWindow: P.riposteWindow };
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

/**
 * The player's poise (§6.5): 50, +12 in heavy body armor, +20 with a shield raised, +20 old wound,
 * +30 Segmentata Drill (heavy), +10 per enemy beyond the first for a Dacian survivor (max +30).
 */
export function playerPoise(stats: CombatantStats, o: { heavyBody?: boolean; shieldRaised?: boolean; enemies?: number } = {}): number {
  const P = COMBAT.poise;
  let p = P.player;
  if (o.heavyBody) p += P.heavyBody + (stats.hasFlag('perk-heavy-armor-drill') ? 30 : 0);
  if (o.shieldRaised) p += P.shieldRaised;
  if (stats.hasFlag('trait-old-wound')) p += 20;
  if (stats.hasFlag('trait-survivor')) p += Math.min(30, 10 * Math.max(0, (o.enemies ?? 1) - 1));
  if (stats.hasFlag('patron.poise')) p += 15;
  return p;
}

/**
 * Apply poise damage (§6.5). A hit that breaks poise staggers (0.8 s light, 1.5 s heavy); one that
 * doesn't flinches only if it is at least 20% of max. `knockdown` attacks (Umbo, pankration, bear
 * charge, net) floor the target for 2 s. Immunity (Labor) ignores it all.
 */
export function applyPoiseDamage(state: PoiseState, amount: number, opts: { heavy?: boolean; knockdown?: boolean; immune?: boolean } = {}): { result: StaggerResult; seconds: number } {
  const P = COMBAT.poise;
  if (opts.immune || !(amount > 0)) return { result: 'none', seconds: 0 };
  state.delay = P.regenDelay;
  if (opts.knockdown) {
    state.current = state.max;
    return { result: 'knockdown', seconds: P.knockdown };
  }
  state.current -= amount;
  if (state.current <= 0) {
    state.current = state.max;
    return { result: 'stagger', seconds: opts.heavy ? P.staggerHeavy : P.staggerLight };
  }
  return amount >= state.max * P.flinchFrac ? { result: 'flinch', seconds: 0 } : { result: 'none', seconds: 0 };
}

/** Poise regenerates 15/s after 1.5 s without poise damage. */
export function tickPoise(state: PoiseState, dt: number) {
  if (state.delay > 0) {
    state.delay = Math.max(0, state.delay - dt);
    return;
  }
  state.current = Math.min(state.max, state.current + COMBAT.poise.regen * dt);
}

// ------------------------------------------------------------------ whole hits

export interface HitInput {
  attack: Pick<AttackResult, 'damage' | 'poise'> & Partial<Pick<AttackResult, 'damageType' | 'thrustVsMetal' | 'blockIgnore' | 'unblockable' | 'bleedChance'>>;
  /** Defender's effective AR (effectiveArmorRating). */
  armor: number;
  /** Defender's body-armor family; default cloth. */
  family?: ArmorFamily;
  /** Defender's stats, for defensive perks (Padded). */
  defender?: CombatantStats;
  /** Present when the defender is blocking and facing the attack. */
  block?: Omit<BlockInput, 'damage' | 'ignore'> & { stats: CombatantStats };
  /** Difficulty multiplier: difficultyMult(d, attackerIsPlayer, defenderIsPlayer). */
  mult?: number;
}

export interface HitResult {
  damage: number;
  poise: number;
  blocked: boolean;
  guardBroken: boolean;
  blockStamina: number;
  /** Chance of bleeding after the target-AR halving. */
  bleedChance: number;
}

/** raw × difficulty → type vs family → armor → block → at least 1 (§6.2). */
export function resolveHit(h: HitInput): HitResult {
  const raw = h.attack.damage * (h.mult ?? 1);
  const family = h.family ?? 'cloth';
  const type = h.attack.damageType ?? 'thrust';
  let typed = raw * typeFactor(type, family);
  if (type === 'thrust' && (family === 'mail' || family === 'plate')) typed *= 1 + (h.attack.thrustVsMetal ?? 0);
  if (type === 'blunt' && h.defender?.hasFlag('perk-light-armor-padded')) typed *= 0.8;
  let afterArmor = typed * (1 - armorReduction(h.armor));
  let poise = h.attack.poise;
  let blockStamina = 0;
  let guardBroken = false;
  const blocked = !!h.block && !h.attack.unblockable;
  if (h.block && blocked) {
    const b = resolveBlock(h.block.stats, { ...h.block, damage: raw, ignore: h.attack.blockIgnore });
    afterArmor *= 1 - b.mitigation;
    blockStamina = b.staminaCost;
    guardBroken = b.guardBroken;
    if (!guardBroken) poise *= 0.5;
  }
  const bleed = (h.attack.bleedChance ?? 0) * (h.armor >= COMBAT.bleed.halvedAtAR ? 0.5 : 1) * (blocked ? 0 : 1);
  return { damage: Math.max(COMBAT.minDamage, afterArmor), poise, blocked, guardBroken, blockStamina, bleedChance: bleed };
}

/**
 * Difficulty multiplier (§6.12): the player's attacks × dealt; attacks on the player × taken;
 * NPC against NPC × 1.
 */
export function difficultyMult(difficulty: Difficulty, attackerIsPlayer: boolean, defenderIsPlayer = !attackerIsPlayer): number {
  const d = DIFFICULTY[difficulty] ?? DIFFICULTY.normalis;
  if (attackerIsPlayer) return d.dealt;
  return defenderIsPlayer ? d.taken : 1;
}

/** Balancing helper: swings to kill, and seconds when only `hitRate` of swings land unblocked. */
export function timeToKill(o: { damagePerHit: number; interval: number; health: number; hitRate?: number }): { hits: number; seconds: number } {
  const hits = o.damagePerHit > 0 ? Math.ceil(o.health / o.damagePerHit - 1e-9) : Infinity;
  return { hits, seconds: (hits * o.interval) / clamp(o.hitRate ?? 1, 0.01, 1) };
}
