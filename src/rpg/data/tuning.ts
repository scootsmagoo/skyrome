/**
 * BALANCE — every tunable number of the RPG rules, from docs/GDD.md (v1.0, "starting tuning
 * values [design]"). Section numbers point into the GDD. Systems read these; nothing is
 * hard-coded, so playtesting can retune here without code edits.
 *
 * Money is in denarii (1 den. = 4 HS = 16 asses = 64 quadrantes); weights in kg; combat timings in
 * real seconds; durations of effects in real seconds (1 game day = 4320 real s at timeScale 20).
 */

/** §3.3 The three pools. */
export const RESOURCES = {
  base: { health: 100, stamina: 100, pietas: 50 },
  /** Pietas starts half full. */
  startCurrent: { pietas: 25 },
  /** A level-up adds +10 to the chosen pool. */
  perLevelPick: 10,
  /** Every skill level gained adds +0.2 to its governing pool's max (SkillDef.attribute). */
  governingPerSkillLevel: 0.2,
};

/** §3.3 Regeneration, in points per second (absolute). */
export const REGEN = {
  /** Out of combat only ("no hostile aware within 40 m for 8 s" — combat sets vitals.inCombat). */
  health: 0.5,
  stamina: 20,
  /** Pietas never regenerates over time; devotion refills it (§14.6). */
  pietas: 0,
  /** Multipliers in combat: no health regeneration in combat. */
  combat: { health: 0, stamina: 1, pietas: 0 },
  /** Stamina regenerates at half speed while blocking. */
  blockingStamina: 0.5,
  /** Seconds without spending before regeneration resumes. */
  delay: { health: 0, stamina: 0.8, pietas: 0 },
};

/** §5.2 Skill XP curve: xpToNext(L) = round(difficulty × (L + offset)^exp). */
export const SKILL_CURVE = {
  start: 10,
  max: 100,
  offset: 5,
  exp: 1.5,
};

/** §5.3 Character levels: charXpToNext(n) = perLevel × (n + offset); each skill-up adds its new level. */
export const LEVEL_CURVE = {
  perLevel: 25,
  offset: 2,
  skillXpMult: 1,
  perkPointsPerLevel: 1,
  /** No hard cap in the GDD; this only guards runaway loops. */
  maxLevel: 999,
};

/** §3.3 Carry weight. */
export const CARRY = {
  base: 50,
  perStaminaPick: 5,
  /** Over the limit you can only walk: 1.9 m/s against a 4.4 m/s run. */
  overSpeed: 1.9 / 4.4,
};

/** §6.1 and §6.6 Stamina costs. */
export const STAMINA_COSTS = {
  /** Light attack: 5 + 2 × weapon kg (gladius 7.4). */
  lightFlat: 5,
  lightPerKg: 2,
  /** Power attack: 3 × light, at least 20. */
  powerMult: 3,
  powerMin: 20,
  /** Sprint attack: light × 1.5. */
  sprintAttackMult: 1.5,
  bash: 18,
  /** Dodge 15; the third dodge within 1 s costs double. */
  dodge: 15,
  /** Holding a drawn bow drains 4/s after 1.5 s. */
  bowHold: 4,
  bowHoldAfter: 1.5,
  /** §6.6 Sprinting, per second (heavy armor +25% through the armor penalty). */
  sprint: 8,
  jump: 5,
  mantle: 10,
  /** Fast swimming, per second. */
  swimFast: 6,
  /** Holding a whirling sling, per second. */
  slingWhirl: 3,
  /** Throwing a pilum or javelin. */
  throw: 12,
  /** At 0 stamina you cannot attack, sprint or dodge until this much has regenerated. */
  exhaustedUntil: 15,
};

/** §6.2–6.7 Combat. */
export const COMBAT = {
  /** raw = W.damage × (1 + skill / skillDiv) × … */
  skillDiv: 200,
  /** attackMult (§6.2): light 1.0, third chain hit 1.25, power charge 1.5 at 0.35 s → 2.0 at 0.8 s, bash 0.3, riposte 2.0. */
  attack: { light: 1, chain3: 1.25, powerMin: 1.5, powerMax: 2, chargeMinSec: 0.35, chargeMaxSec: 0.8, bash: 0.3, riposte: 2, sprint: 1.3 },
  /** Power attack direction (§6.1): attackMult = chargeMult × dirFactor — overhead (none) and the forward lunge 1.0, the sideways sweep 0.7, the back step-cut 0.65. */
  directional: { none: 1, forward: 1, sideways: 0.7, back: 0.65 },
  /** Overhead power attack: +50% poise damage. */
  overheadPoise: 1.5,
  /** 3% chance of ×1.5 on non-sneak hits, shifted by the `luck` and `crit.chance` modifiers (Fortuna +5 points). */
  crit: { chance: 0.03, mult: 1.5 },
  /** Ranged headshots. */
  headshot: { bare: 1.5, helmeted: 1.2 },
  /** Bleeding from cut hits with blades: 20% (35% on power), 2 HP/s for 6 s, stacks ×3, chance halved vs AR ≥ 30. */
  bleed: { chance: 0.2, powerChance: 0.35, halvedAtAR: 30 },
  /** TYPE_VS_FAMILY (§6.2): thrust beats cut against armor, blunt beats both against mail and plate. */
  typeVsFamily: {
    cloth: { cut: 1, thrust: 1, blunt: 1 },
    padded: { cut: 0.8, thrust: 0.9, blunt: 0.75 },
    mail: { cut: 0.6, thrust: 0.85, blunt: 0.85 },
    plate: { cut: 0.5, thrust: 0.75, blunt: 0.8 },
  },
  /** armorReduction(AR) = min(cap, AR / (AR + K)); AR = Σ pieces × (1 + armorSkill / armorSkillDiv) × (1 + armor.*). */
  armorK: 120,
  armorCap: 0.6,
  armorSkillDiv: 250,
  /** Final damage is at least this. */
  minDamage: 1,
  /** §6.3 Condition: AR, damage and shield block mitigation × (0.75 + 0.25 × condition); −1% per 100 damage dealt or absorbed. */
  conditionFloor: 0.75,
  wearPerDamage: 0.0001,
  /** §6.4 Block: base + (0.95 − base) × Shield/200, where base is the shield or weapon-only value; cap 0.90. */
  weaponBlock: { blade: 0.45, twoHand: 0.55, fists: 0.25 },
  blockSkillDiv: 200,
  blockTarget: 0.95,
  blockCap: 0.9,
  /** perk-shield-wall: block stamina −30% per ally within 2 m (max −60%). */
  shieldWall: { perAlly: 0.3, max: 0.6 },
  /** Stamina per absorbed hit: max(min, mult × raw × (1 − Shield skill / 200)). */
  blockStamina: { min: 4, mult: 0.6, skillDiv: 200 },
  guardBreakStagger: 1.2,
  /** Sica ignores 25% of block mitigation, falx 50% (Falx Hook perk: both 50%). */
  blockIgnore: { sica: 0.25, falx: 0.5, hooked: 0.5 },
  /** §6.4 Parry. */
  parry: { attackerPoiseLoss: 0.6, attackerStagger: 1, riposteWindow: 0.8, finisherAtHealth: 0.25, perkWindowBonus: 0.06 },
  /**
   * §6.5 Poise. Flinch from hits ≥ 20% of max (NPCs) or 35% (the player); anti-loop: 1.5 s of poise
   * immunity after a stagger, 0.4 s of flinch immunity after a flinch, at most 2 staggers per 4 s.
   */
  poise: {
    player: 50, heavyBody: 12, shieldRaised: 20, regen: 15, regenDelay: 1.5, flinchFrac: 0.2, flinchFracPlayer: 0.35,
    staggerLight: 0.8, staggerHeavy: 1.5, knockdown: 2, immunityAfterStagger: 1.5, flinchImmunity: 0.4, staggerLimit: 2, staggerWindow: 4,
  },
  /** Nemesis' Retribution: +25% against your last attacker. */
  retribution: 1.25,
  /** Poise damage = weapon.stagger × these. Parry takes 60% of max. */
  poiseMult: { light: 1, power: 2.5, bash: 2, sprint: 1.5 },
  /** §6.7 Sneak attacks: melee ×3 (Sicarius perk ×4), pugio/sica ×4 (perk ×6), ranged ×2. */
  sneak: { melee: 3, meleePerk: 4, dagger: 4, daggerPerk: 6, ranged: 2 },
  /** §6.3 Heavy armor penalties (removed by perks): stamina regen −15%, sprint cost +25%, footstep noise +50%. */
  heavyPenalty: { staminaRegen: -0.15, sprintCost: -0.25, noise: 0.5 },
  /** Partial bow draw (from 0.4 s of the 0.9 s full draw) does 50%. */
  partialDraw: 0.5,
  /** Seconds per light swing at weapon speed 1 (wind-up 0.25 + active 0.12 + recovery 0.30). */
  swingSeconds: 0.67,
  /** Unarmed fists (§8.1). */
  fists: { damage: 4, speed: 1.4, reach: 0.5, stagger: 8 },
};

/** §6.12 Difficulty. `taken` applies only to damage dealt to the player. */
export const DIFFICULTY = {
  tiro: { name: 'Tiro', dealt: 1.5, taken: 0.5, parryWindow: 0.4, tokens: 1 },
  facilis: { name: 'Facilis', dealt: 1.25, taken: 1, parryWindow: 0.3, tokens: 2 },
  normalis: { name: 'Normalis', dealt: 1, taken: 1.5, parryWindow: 0.2, tokens: 2 },
  difficilis: { name: 'Difficilis', dealt: 0.85, taken: 2, parryWindow: 0.14, tokens: 3 },
  herculea: { name: 'Herculea', dealt: 0.75, taken: 3, parryWindow: 0.1, tokens: 3 },
} as const;
export type Difficulty = keyof typeof DIFFICULTY;
/** v0.1 ships three levels; facilis and herculea are Should (§6.12). */
export const DIFFICULTY_V01: readonly Difficulty[] = ['tiro', 'normalis', 'difficilis'];

/** §14.6 Pietas and the gods. Gains and losses are pietas points. */
export const DEVOTION = {
  /** Pietas gained by acts of devotion. */
  gain: {
    /** Daily prayer at a compitum shrine: once per shrine per day (also grants the Lares favor). */
    compitum: 5,
    /** Prayer at a temple with an offering (also grants the temple's blessing). */
    temple: 10,
    /** Home lararium prayer, once a day (full with perk-religio-lararium). */
    lararium: 15,
    festival: 25,
    spareYielded: 5,
    burial: 10,
  },
  /** Pietas lost by impious acts; `omen` acts also leave you infaustus. */
  loss: {
    killYielded: { pietas: 15, omen: false },
    templeTheft: { pietas: 25, omen: true },
    killInTemple: { pietas: 30, omen: true },
    brokenVow: { pietas: 30, omen: true },
    falseOath: { pietas: 10, omen: false },
  },
  /** A temple blessing lasts 24 game hours (real seconds at timeScale 20); the Lares favor 2 game hours. */
  blessingSeconds: 4320,
  laresSeconds: 360,
  /** The least offering a temple blessing needs: a libum, a pinch of incense, or 1 den. */
  minOffering: 1,
  /** Changing patron deity costs 100 den. and waits 7 days after the last choice. */
  rechooseCost: 100,
  rechooseDays: 7,
  /** perk-religio-pax-deorum: invocations cost 20% less. */
  paxDeorumDiscount: 0.2,
  /** perk-religio-votum: vow buffs +50%. */
  votumPerk: 0.5,
  /**
   * Vows: V ≥ max(5 den., 10% of the quest's expected reward). `votum` gives damage resistance and
   * stamina regeneration by V (5% / 10% at 25 den. / 15% at 100 den.); paying gives pietas 20 / 30 / 50.
   */
  vow: { min: 5, minRewardFraction: 0.1, tiers: [{ at: 100, buff: 0.15, pietas: 50 }, { at: 25, buff: 0.1, pietas: 30 }, { at: 0, buff: 0.05, pietas: 20 }] },
  /** Days to pay a vow after the quest succeeds. */
  vowDays: 3,
  /** Piaculum: 2 × the vow's value, or 20 den. */
  piaculumMult: 2,
  piaculumMin: 20,
  /** Daily omen, the first time outdoors after dawn: good 20%, bad 20%, nothing 60%. */
  omen: { good: 0.2, bad: 0.2 },
};

/**
 * §7.4 Barter. Every price modifier goes inside the clamps, summed as fractions:
 *   buy  = value × max(1.05, 1.60 − 0.50 × mercatura/100 − disposition/200 − Σbuy)
 *   sell = value × min(0.90, 0.35 + 0.35 × mercatura/100 + disposition/200 + Σsell)
 * which keeps sell ≤ buy × 0.86 for any skill and modifiers (no arbitrage).
 */
export const BARTER = {
  buyBase: 1.6,
  buyMerc: 0.5,
  buyFloor: 1.05,
  sellBase: 0.35,
  sellMerc: 0.35,
  sellCap: 0.9,
  /** The no-arbitrage invariant the clamps guarantee. */
  arbitrage: 0.86,
  /** Disposition runs −20…+20 (Fama/10, origin traits, gifts); Fama reaches prices only through it. */
  dispositionMax: 20,
  /** Fences pay this fraction of the normal sell price for stolen goods (perk-mercatura-fence: 0.7). */
  fenceMult: 0.5,
  fencePerkMult: 0.7,
  /** Σbuy terms: market day at stall vendors (every 8th elapsed day), the Nundinae perk, street-wise at plebeian vendors, Bilbilis blades for the hispanus. */
  nundinaeEvery: 8,
  marketDay: 0.1,
  nundinaePerk: 0.1,
  streetWise: 0.05,
  bilbilis: 0.2,
  /** Haggle: one Rhetoric check per vendor per day; success Σbuy +0.10 and Σsell +0.10; failure Σbuy −0.05 and −5 disposition. */
  haggle: { difficulty: { stall: 10, shop: 25, banker: 40 }, success: 0.1, failure: -0.05, failureDisposition: -5, argentarius: 15 },
  /** Vendor purses refresh every 2 game days. */
  restockHours: 48,
  /** Prices are quantized to the quadrans (1/64 den.). */
  round: 1 / 64,
  /** Repairs (§7.2 #39): 10% of the value per 25% of condition restored. */
  repairPerQuarter: 0.1,
  /** perk-mercatura-nauticum: after 30 days +40% (80%) or a total loss (20%), rolled when you invest; stake ≤ 20% of the banker's purse. */
  nauticum: { days: 30, gain: 0.4, successChance: 0.8, stakeCap: 0.2 },
};

/** §14.1 Crime and bounty. */
export const CRIME = {
  attackOnSight: 1000,
  /** Fugitivarii (3 hunters and a Molossian hound) come for you at or above this. */
  hunters: 2000,
  /** Carcer: ceil(bounty / 100) days, at most 10; citizens serve 25% less. */
  jailDenariiPerDay: 100,
  jailMaxDays: 10,
  citizenJailMult: 0.75,
  /** Each day in the Carcer loses the progress bar of one random skill. */
  jailProgressLossPerDay: 1,
  /** Pay: −10% per Clientela rank, at most 40%. */
  patronDiscountPerRank: 0.1,
  patronDiscountCap: 0.4,
  /** Persuade: bounty < 200; DC = min(85, 10 + bounty / 20); success halves the bounty. */
  persuadeMax: 200,
  persuadeDcBase: 10,
  persuadeDcDiv: 20,
  persuadeDcMax: 85,
  /** Bribe: bounty ≤ 200 and a corruptible guard; costs 1.5 × bounty. */
  bribeMax: 200,
  bribeMult: 1.5,
  corruptible: { vigiles: 0.4, 'cohortes-urbanae': 0.25, praetoriani: 0.05 } as Record<string, number>,
  /** A guard with no id is rolled once per confrontation; the roll holds this many game hours (or until it ends). */
  confrontationHours: 1,
  /** Asylum at a statue or altar: guards hold off 1 game hour; non-violent crimes, bounty ≤ 1000, once a day. */
  asylumHours: 1,
  asylumMaxBounty: 1000,
  /** Fleeing adds 10% to the bounty, resisting 50%. */
  fleeMult: 0.1,
  resistMult: 0.5,
  /** Ad ludum: a murder conviction or a bounty ≥ 3000; win 3 bouts to go free (Infamia +30). */
  adLudumMin: 3000,
  adLudumBouts: 3,
  adLudumInfamia: 30,
  /** An eques pays twice the fine instead of going to the Carcer (not for maiestas). */
  equesFineMult: 2,
  /** A city bounty under 40 is forgotten after 7 elapsed days without a new crime. */
  lapseBelow: 40,
  lapseDays: 7,
  /** Unidentified crimes raise the district's alert (0–3) for a game day. */
  alertMax: 3,
  alertHours: 24,
  /** Hood up at night: witnesses identify you only half the time. */
  hoodedIdentify: 0.5,
  /** Urban Cohorts members: new bounties reduced 25% "by your word" (§9.2). */
  cohortsBountyMult: 0.75,
};

/** §14.5 Persuasion and dialogue checks: p = clamp(0.05, 0.95, 0.50 + (skill + mods − DC) / 100). */
export const PERSUASION = {
  base: 0.5,
  min: 0.05,
  max: 0.95,
  div: 100,
  /** 5 × (your Dignitas step − theirs). */
  dignitasStep: 5,
  /** Intimidate: rhetoric + 10 × (your band − theirs) + 10 if armed and armored; −5 disposition afterwards. Your band = min(5, 1 + floor(level / 8)). */
  intimidate: { perBand: 10, armed: 10, dispositionAfter: -5 },
  /** Bribe: DC × 0.5 den. × status. */
  bribe: { perDc: 0.5, status: { plebs: 1, soldier: 2, official: 5 } },
  /** Invoke patron: Clientela rank ≥ amicus-minor (index 1); +15, +15 more with perk-rhetoric-clientela. */
  patron: { bonus: 15, perk: 15, minRank: 1 },
  /** perk-rhetoric-exordium: +10 to the first check with each person. */
  exordium: 10,
  /** A failed check can't be retried with the same NPC and approach for 24 game hours. */
  retryHours: 24,
  /** Disposition runs −20…+20. */
  dispositionMax: 20,
};

/** §14.13 Saving. */
export const SAVE = {
  manualSlots: 10,
  autosaveSlots: 3,
  /** Quest-stage autosaves at most every 120 real seconds; a timed autosave every 10 real minutes. */
  questAutosaveInterval: 120,
  periodicAutosave: 600,
};

/** §5.4 XP per use [design]. Systems award these with sheet.useSkill(skill, xp). */
export const XP = {
  blades: { light: 4, power: 7, riposte: 10, sneak: 12 },
  spear: { light: 4, power: 7, riposte: 10, sneak: 12, thrown: 8, thrownFar: 12, thrownFarMeters: 15, net: 6 },
  archery: { hit: 6, perTenMeters: 1, maxDistanceBonus: 6, headshotMult: 1.5 },
  shield: { block: 3, perAbsorbed: 0.2, parry: 8, bash: 5 },
  brawling: { hit: 3, bluntHit: 4, knockout: 12, throw: 8 },
  armor: { hit: 2, perDamage: 0.3, max: 10 },
  athletics: { sprintMeters: 10, climb: 4, rooftopRoute: 25, fireRun: 20, swimMeters: 20, fall: 3 },
  stealth: { perSecond: 0.6, maxPerMinute: 30, sneakAttack: 15 },
  pickpocket: { base: 10, valueDiv: 5, max: 60 },
  locks: { tiers: [8, 15, 25, 40], reseal: 15, forge: 40 },
  rhetoric: { perTier: 10, fail: 2, haggle: 10, salutatio: 5, popinaDebate: 15, radiantMin: 20, radiantMax: 40, court: 100, speech: 50 },
  /** Per transaction worth ≥ 1 den.; each repeat of the same item with the same vendor on the same day halves it again. */
  mercatura: { base: 1, valueDiv: 10, max: 50, fenceMult: 1.5, minValue: 1, repeatMult: 0.5 },
  /** Remedy-making arrives with the crafting workbench (v0.5). */
  medicina: { remedy: 10, perEffect: 5, learned: 5, treat: 15, selfBandage: 3 },
  fabrica: { improve: 10, improveValueDiv: 20, repair: 5, cast: 6, forge: 25 },
  religio: { dailyPrayer: 8, offering: 5, offeringValueDiv: 2, offeringMax: 30, vow: 40, festival: 25, omen: 10 },
  equitatio: { per100m: 2, lap: 15, win: 100 },
  /** Training dummies give half, and nothing above level 30; lusiones against living opponents count as real fights. */
  dummyMult: 0.5,
  dummyMaxLevel: 30,
};

/** §5.1 Trainers: 5 lessons per character level; cost round(0.15 × L² + 10); caps by trainer grade. */
export const TRAINING = {
  cost: (level: number) => Math.round(0.15 * level * level + 10),
  perLevel: 5,
  caps: { common: 40, expert: 70, master: 90 },
};

/** §3.4 Social standing. */
export const STANDING = {
  /** Fama runs −100…+100 per faction and per district. */
  famaMin: -100,
  famaMax: 100,
  /** Dignitas: +5 disposition per step with elite NPCs. */
  dignitasDisposition: 5,
  /** The equestrian census at game scale, and the Infamia ceiling for the ring. */
  equestrianCensus: 25000,
  equestrianMaxInfamia: 20,
  /** Cleanliness: sordidus −10 persuasion (not with the underworld); lautus +10 for 12 game hours. */
  sordidusPersuasion: -10,
  lautusPersuasion: 10,
  lautusHours: 12,
  /** §14.8 Lautus also gives +10% stamina regeneration. */
  lautusStaminaRegen: 0.1,
  /**
   * Infamia (§3.4): oath +20, each public bout +2, convictions +10, brothel or stage +10, a woman's
   * toga at a salutatio or in court +5 (once). Recovery: −1 per 10 elapsed days without a new stain,
   * down to 10 if you ever swore the oath or were condemned (else 0); restitutio −15; the rudis −10.
   */
  infamia: { oath: 20, bout: 2, conviction: 10, trade: 10, togaWoman: 5, recoverDays: 10, recoverAmount: 1, floorBranded: 10, restitutio: 15, rudis: 10 },
  /** §3.7 A woman in a toga: respectable NPCs −15 disposition, the underworld +5. */
  togaWomanDisposition: { respectable: -15, underworld: 5 },
};

/** §9.1 Skill gates unless a rank states its own: middle ranks 30, top ranks 45 (the Ludus 45 / 60). */
export const RANK_GATES = { middle: 30, top: 45, ludusMiddle: 45, ludusTop: 60 };
