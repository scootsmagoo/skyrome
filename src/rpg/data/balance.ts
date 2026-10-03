/**
 * PROVISIONAL BALANCE — every tunable number of the RPG rules lives here so retuning is a one-file job.
 *
 * Values are Skyrim-like (the owner's reference point) until docs/GDD.md fixes them. Where a value
 * comes from Skyrim's game settings the original name is noted. Money is in denarii (1 d = 4
 * sestertii = 16 asses); weights in kg; times in real seconds unless stated.
 */

export const RESOURCES = {
  /** Starting maxima. */
  base: { health: 100, stamina: 100, pietas: 50 },
  /** Added to the chosen resource on each character level (Skyrim: +10). */
  perLevelPick: 10,
};

export const REGEN = {
  /** Fraction of max per second out of combat (Skyrim fHealthRegen ≈ 0.7%). */
  health: 0.007,
  stamina: 0.06,
  /** Divine favour returns slowly; shrines restore it in full. */
  pietas: 0.004,
  /** Multipliers while in combat (Skyrim fCombatHealthRegenRateMult 0.7, stamina 0.35). */
  combat: { health: 0.3, stamina: 0.5, pietas: 1 },
  /** Seconds before regen resumes after spending (blocking, sprinting, power attacks). */
  delay: { health: 0, stamina: 1.2, pietas: 3 },
};

export const SKILL_CURVE = {
  start: 15,
  max: 100,
  /** XP ("use units") needed for level L → L+1 = base + mult × L^exp. ≈8 uses at 15, ≈54 at 50, ≈165 at 90. */
  base: 3,
  mult: 0.025,
  exp: 1.95,
};

export const LEVEL_CURVE = {
  /** Character XP for level L → L+1 = base + perLevel × L (Skyrim: fXPLevelUpBase 75, fXPLevelUpMult 25). */
  base: 75,
  perLevel: 25,
  /** Each skill level-up grants character XP equal to the new skill level × this. */
  skillXpMult: 1,
  perkPointsPerLevel: 1,
  maxLevel: 81,
};

export const CARRY = {
  /** A legionary marched with ~30–40 kg; the hero can carry a bit more. */
  base: 80,
  /** Extra kg per stamina level pick. */
  perStaminaPick: 2,
  /** Speed multiplier when over-encumbered (and no sprinting). */
  overSpeed: 0.5,
};

export const STAMINA_COSTS = {
  /** Per second while sprinting. */
  sprint: 8,
  /** Light attack: flat + per kg of weapon weight. */
  lightFlat: 2,
  lightPerKg: 1,
  /** Power attack: flat + per kg of weapon weight (Skyrim fPowerAttackStaminaPenalty-ish). */
  powerFlat: 14,
  powerPerKg: 4,
  /** Stamina per point of damage absorbed by a block. */
  blockPerDamage: 0.6,
  /** Shield bash. */
  bash: 12,
};

export const COMBAT = {
  /** Damage multiplier per skill level (Skyrim: 1 + skill/200 → ×1.5 at 100). */
  skillDamagePerLevel: 0.005,
  /** Power attack multiplier (Skyrim ×2 standing). */
  powerMult: 2,
  /** Sneak attack multipliers before perks (Skyrim: ×3 melee, ×2 ranged). */
  sneakMelee: 3,
  sneakRanged: 2,
  /** Armor: mitigation = rating / (rating + K), capped (Skyrim caps at 80%). */
  armorK: 120,
  armorCap: 0.8,
  /** Armor rating multiplier per armor-skill level (×1.4 at 100). */
  armorSkillPerLevel: 0.004,
  /** Block mitigation without a shield. */
  weaponBlock: { oneHand: 0.35, twoHand: 0.5 },
  /** Extra block mitigation per Block skill level (+0.15 at 100). */
  blockSkillPerLevel: 0.0015,
  blockCap: 0.95,
  /** Blocking a power attack costs this much more stamina. */
  blockPowerMult: 1.5,
  /** Guard broken: fraction of the block mitigation still applied. */
  guardBreakKeep: 0.5,
  /** Seconds per swing at weapon speed 1 (light attack). */
  swingSeconds: 0.75,
  powerSwingSeconds: 1.25,
  /** Poise damage = weapon.stagger × this (× power, × blocked). */
  poisePerStagger: 40,
  poiseBlockedMult: 0.35,
  poisePowerMult: 2,
  /** Seconds after a hit before poise regenerates, and regen per second as a fraction of max. */
  poiseRegenDelay: 2,
  poiseRegen: 0.5,
  /** Poise damage ≥ this fraction of max in one hit → knockdown instead of stagger. */
  knockdownFrac: 0.9,
  playerPoise: 60,
  /** Unarmed fists (no weapon equipped). */
  fists: { damage: 4, speed: 1.2, reach: 0.7, stagger: 0.25 },
};

/** Damage dealt/taken multipliers by difficulty (Skyrim values). Combat reads settings → this. */
export const DIFFICULTY = {
  novice: { dealt: 2, taken: 0.5 },
  apprentice: { dealt: 1.5, taken: 0.75 },
  adept: { dealt: 1, taken: 1 },
  expert: { dealt: 0.75, taken: 1.5 },
  master: { dealt: 0.5, taken: 2 },
} as const;
export type Difficulty = keyof typeof DIFFICULTY;

export const BARTER = {
  /** Buy price = value × lerp(buyMax, buyMin, skill/100) × (1 − perk/faction discounts). Value is a fair retail price. */
  buyMax: 1.5,
  buyMin: 1.05,
  /** Never below this fraction of value. */
  buyFloor: 0.9,
  /** Sell price = value × lerp(sellMin, sellMax, skill/100) × (1 + perks). */
  sellMin: 0.3,
  sellMax: 0.65,
  /** Sell price is always at most this fraction of the buy price (no arbitrage). */
  sellCapOfBuy: 0.9,
  /** Barter skill = mercatura × wMerc + rhetoric × wRhet. */
  wMerc: 0.8,
  wRhet: 0.2,
  /** Fences pay this fraction for stolen goods (1 with the 'barter.fenceFull' flag). */
  fenceMult: 0.6,
  /** Discount per faction rank index (0-based + 1) when the merchant shares the faction; capped. */
  factionPerRank: 0.03,
  factionCap: 0.15,
  /** Prices round to the nearest as (1/16 denarius), minimum one as. */
  round: 1 / 16,
  /** Merchants restock after this many game hours. */
  restockHours: 48,
  /** Mercatura XP per denarius traded (Skyrim speech XP ∝ price). */
  xpPerDenarius: 0.05,
};

export const CRIME = {
  /** Guards attack on sight at or above this bounty. */
  attackOnSight: 1000,
  /** Days in the Carcer per this many denarii of bounty (min 1). */
  jailDenariiPerDay: 100,
  /** A guard accepts a bribe of bounty × this (requires the bounty to be below `bribeMax`). */
  bribeMult: 1.5,
  bribeMax: 500,
  /** Rhetoric check difficulty to talk a guard out of a small bounty (bounty < persuadeMax). */
  persuadeMax: 40,
  persuadeDifficulty: 50,
  /** Skill-progress loss per day in jail (skills whose current progress is zeroed). */
  jailProgressLossPerDay: 1,
};

export const XP_REWARDS = {
  /** Suggested skill "use" units per action (systems call sheet.useSkill(id, units)). */
  meleeHit: 1,
  meleePowerHit: 1.5,
  meleeKill: 2,
  rangedHit: 1.2,
  blockHit: 0.8,
  armorHit: 0.5,
  sneakSecondUnseen: 0.05,
  sneakAttack: 3,
  lockpickSuccess: 2,
  pickpocketPerDenarius: 0.1,
  persuadeSuccess: 2,
  medicineCraft: 2,
  prayer: 2,
};

/** Training: cost in denarii to raise a skill from L to L+1 with a trainer; max uses per level. */
export const TRAINING = {
  cost: (level: number) => Math.round(2 + 0.08 * level * level),
  perLevel: 5,
};
