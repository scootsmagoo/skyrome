/**
 * RPG data model contracts shared by the rpg engine, combat, UI, quests and content.
 * Definitions (…Def) are static data authored in TypeScript; runtime state is serializable.
 * Money is counted in denarii (decimals allowed for sestertii/asses: 1 sestertius = 0.25 denarius).
 */

// ------------------------------------------------------------------ resources & skills

export type ResourceId = 'health' | 'stamina' | 'pietas';

export interface Resource {
  current: number;
  max: number;
}

/** Skill ids are defined by data (src/rpg/data/skills.ts); kept as string for extensibility. */
export type SkillId = string;

export interface SkillDef {
  id: SkillId;
  name: string;
  latin: string;
  /** Resource that grows when this skill levels (Skyrim's "governing attribute"). */
  attribute: ResourceId;
  description: string;
  /** How XP is earned, for the skills screen. */
  howToTrain: string;
  /** Multiplier on XP needed per level (default 1). */
  difficulty?: number;
  /** Skills-screen grouping (rpg extension). */
  category?: SkillCategory;
}

/** Skills-screen grouping: the three lines of the design research (Martial, Clandestine, Civic). */
export type SkillCategory = 'martial' | 'clandestine' | 'civic';

export interface PerkDef {
  id: string;
  skill: SkillId;
  name: string;
  description: string;
  requiresLevel: number;
  requiresPerk?: string;
  /** Numeric modifiers this perk grants (read through CharacterSheet.modifier()). */
  modifiers?: Partial<Record<ModifierId, number>>;
  /** Free-form flag other systems can test with sheet.hasFlag(). */
  flags?: string[];
  /**
   * The game system the perk depends on (GDD §5.5: 'sling', 'bow', 'bleeding', 'allies',
   * 'market-days', 'crafting', 'racing', 'beasts'…). Perks whose system hasn't shipped are hidden.
   * rpg extension.
   */
  requiresSystem?: string;
}

/** Additive modifiers (fractions where it makes sense: 0.2 = +20%). */
export type ModifierId =
  | 'damage.blades'
  | 'damage.spear'
  | 'damage.blunt'
  | 'damage.ranged'
  | 'damage.unarmed'
  | 'damage.power'
  | 'damage.sneak'
  | 'block.mitigation'
  | 'block.staminaCost'
  | 'armor.light'
  | 'armor.heavy'
  | 'stamina.regen'
  | 'stamina.attackCost'
  | 'stamina.sprintCost'
  | 'health.regen'
  | 'health.max'
  | 'stamina.max'
  | 'pietas.max'
  | 'pietas.regen'
  | 'carry.max'
  | 'speed.move'
  | 'price.buy'
  | 'price.sell'
  | 'persuade.chance'
  | 'stealth.noise'
  | 'stealth.visibility'
  | 'lockpick.ease'
  | 'pickpocket.chance'
  | 'potion.strength'
  | 'blessing.duration'
  | 'xp.mult'
  // rpg extensions (GDD §14): damage taken (Jupiter, vows), luck rolls (crit, lifts, lock zones),
  // combat-only stamina regeneration (Mars), extra poise (Mithras), bandage and food strength,
  // poison and fire resistance, arena crowd favor and missio, per-skill XP (xp.<skill>).
  | 'damage.taken'
  | 'luck'
  | 'crit.chance'
  | 'stamina.regenCombat'
  | 'poise.max'
  | 'bandage.strength'
  | 'food.strength'
  | 'poison.resist'
  | 'fire.resist'
  | 'arena.favor'
  | 'arena.missio'
  /** Attack speed (the toga −20%, the palla −10%). */
  | 'attack.speed'
  | `xp.${string}`;

// ------------------------------------------------------------------ items

export type ItemType =
  | 'weapon'
  | 'shield'
  | 'armor'
  | 'clothing'
  | 'ammo'
  | 'consumable'
  | 'ingredient'
  | 'book'
  | 'key'
  | 'tool'
  | 'misc'
  | 'quest';

/**
 * Equipment slots (GDD §8.2). Layers stack the way they were worn: `under` (tunic), `padding`
 * (subarmalis), `body` (cuirass or stola), `cloak` (toga, palla, paenula, sagum, lacerna); `legs`
 * (bracae, fasciae), `shins` (ocreae), `arm` (manica), `head` (a helmet or a hood or hat).
 */
export type EquipSlot = 'mainHand' | 'offHand' | 'under' | 'padding' | 'body' | 'cloak' | 'legs' | 'shins' | 'arm' | 'head' | 'feet' | 'neck' | 'finger' | 'ammo';

export type WeaponClass = 'blade' | 'spear' | 'blunt' | 'bow' | 'sling' | 'thrown' | 'unarmed';

export interface WeaponStats {
  class: WeaponClass;
  /** Base damage per hit before skill/perk/armor. */
  damage: number;
  /** Attack speed multiplier (1 = normal). */
  speed: number;
  /** Reach in meters from the shoulder. */
  reach: number;
  /** Poise damage. */
  stagger: number;
  twoHanded?: boolean;
  /** Cut, thrust or blunt, against armor families (GDD §6.2 TYPE_VS_FAMILY). rpg extension; default by class. */
  damageType?: DamageType;
  /** A second way to strike with different damage (gladius: thrust 13, cut 11). rpg extension. */
  alt?: { damageType: DamageType; damage: number };
  /** Damage when thrown (lancea 18) if different from `damage`. rpg extension. */
  thrownDamage?: number;
  /**
   * Damage type of each attack (GDD §6.2 attack-type table) when it differs from `damageType`:
   * the light chain (hits 1/2/3) and the power directions. The type picks the value (`alt` for the
   * second type). rpg extension.
   */
  attackTypes?: { light?: [DamageType, DamageType, DamageType]; overhead?: DamageType; forward?: DamageType; side?: DamageType };
  /** Arma lusoria (rudis, practice trident): never kills — 0 health is a knockout (§6.10). rpg extension. */
  practice?: boolean;
  /** Skill that governs and is trained by this weapon. */
  skill: SkillId;
  /** Ranged weapons: projectile speed (m/s) and ammo item id (thrown weapons consume themselves). */
  projectileSpeed?: number;
  ammo?: string;
}

export interface ArmorStats {
  rating: number;
  weightClass: 'light' | 'heavy' | 'clothing';
  /** Armor family for the cut/thrust/blunt matrix (body armor decides). rpg extension; default by weight class. */
  family?: ArmorFamily;
}

export type DamageType = 'cut' | 'thrust' | 'blunt';
export type ArmorFamily = 'cloth' | 'padded' | 'mail' | 'plate';

export interface ShieldStats {
  /** Bash stagger (GDD §8.4). */
  rating: number;
  /** Fraction of missiles a raised shield stops (scutum 1, oval 0.9, parma 0.7, parmula 0.6). rpg extension. */
  missiles?: number;
  /** Fraction of incoming melee damage absorbed when blocking (before perks). */
  blockMitigation: number;
}

export type EffectKind =
  | 'restore' // instant: amount of resource
  | 'regen' // +amount per second for duration
  | 'fortify' // +amount to resource max or a modifier for duration
  | 'damage' // poison etc.
  | 'cure'
  | 'modifier' // temporary ModifierId bonus
  | 'flag' // temporary sheet flag (target = flag name), e.g. 'stagger.immune' — rpg extension
  | 'condition'; // apply a named ConditionDef (target = its id), e.g. 'ebrius' — rpg extension

export interface Effect {
  kind: EffectKind;
  /** ResourceId for restore/regen/fortify/damage (fortify may also name a SkillId: +N skill), ModifierId for modifier, a kind or source for cure, a ConditionDef id for condition. */
  target: string;
  amount: number;
  /** Seconds (game-real seconds); omit for instant. */
  duration?: number;
  /** rpg extension: `amount` is a percentage of the pool's max (restore, regen, damage, fortify on a pool). */
  percent?: boolean;
}

export interface ItemDef {
  id: string;
  name: string;
  latin?: string;
  type: ItemType;
  description: string;
  /** Roman pounds would be fun but we use kg. */
  weight: number;
  /** Base value in denarii. */
  value: number;
  /** Emoji or short glyph for the inventory list until real icons exist. */
  icon?: string;
  stackable?: boolean;
  slot?: EquipSlot;
  weapon?: WeaponStats;
  armor?: ArmorStats;
  shield?: ShieldStats;
  effects?: Effect[];
  /** Book text (may contain simple markup: paragraphs separated by blank lines). */
  text?: string;
  /** Reading this book raises a skill once. */
  teaches?: SkillId;
  /** Avatar visuals when equipped (see src/actors/appearance.ts). */
  visual?: { weapon?: import('../actors/appearance').WeaponModel; shield?: import('../actors/appearance').ShieldModel; armor?: import('../actors/appearance').ArmorLook; garment?: import('../actors/appearance').Garment };
  questItem?: boolean;
  tags?: string[];
  /** Modifiers granted while this item is equipped (amulets, rings, fine clothing). rpg extension. */
  equipModifiers?: Partial<Record<ModifierId, number>>;
  /** Sheet flags while equipped ('dress.toga', 'hooded', 'hobnails'…). rpg extension. */
  equipFlags?: string[];
}

export interface ItemStack {
  itemId: string;
  count: number;
  /** Stolen from this owner id (crime) — selling to non-fences is refused. */
  stolenFrom?: string;
  /** Condition 0..1 for arms and armor (GDD §6.3); omitted = 1 (perfect). rpg extension. */
  condition?: number;
}

// ------------------------------------------------------------------ factions

export interface FactionRank {
  id: string;
  title: string;
  latin?: string;
  minReputation: number;
  /** Top ranks also need skills (the Morrowind lesson): every gate must pass; a gate with several skills needs any one. rpg extension. */
  requires?: { skill: SkillId | SkillId[]; level: number }[];
  /** Capstone ranks are granted by a quest (FactionSystem.grantRank), not by Fama. rpg extension. */
  questOnly?: boolean;
}

export interface FactionDef {
  id: string;
  name: string;
  latin?: string;
  description: string;
  ranks: FactionRank[];
  /** Factions whose members attack this one on sight. */
  enemies?: string[];
  /** Crimes against members are reported to this faction (guards). */
  lawful?: boolean;
  /** Only Roman citizens may join (GDD: the Urban Cohorts). rpg extension. */
  citizensOnly?: boolean;
  /** Joining this faction closes these (Greens vs Blues). rpg extension. */
  exclusiveWith?: string[];
  /** Leader NPC id and HQ landmark id (GDD §9.1). rpg extension. */
  leader?: string;
  hq?: string;
  /** Non-citizens rise no higher than this rank until they are citizens (Clientela: amicus). rpg extension. */
  nonCitizenMaxRank?: string;
  /** Infamia for joining (the gladiator's oath +20). rpg extension. */
  joinInfamia?: number;
}

// ------------------------------------------------------------------ enemies / combatant tiers

export interface CombatProfile {
  /** Tier id from the GDD table, e.g. 'thug', 'veteran', 'champion', 'boss'. */
  tier: string;
  health: number;
  stamina: number;
  armor: number;
  /** Base weapon item id (determines damage). */
  weapon?: string;
  shield?: string;
  /** 0..1 how often it attacks vs. waits/blocks. */
  aggression: number;
  /** 0..1 chance to block an incoming attack it sees coming. */
  blockSkill: number;
  /** Will yield (missio) below this health fraction instead of fighting to death; 0 = never. */
  yieldAt?: number;
  /** Flees below this health fraction; 0 = never. */
  fleeAt?: number;
  /** Skill level used for damage scaling. */
  skill: number;
  /** Loot table id. */
  loot?: string;
  /** Actor level the profile was scaled to (rpg extension). */
  level?: number;
  /** Poise before a stagger (rpg extension; see combat-math.ts). */
  poise?: number;
  /** Display name for the tier ("Suburan Thug"). */
  name?: string;
  /** Multiplier on weapon damage (GDD §6.11 dmgMult; default 1). */
  dmgMult?: number;
  /** Damage-type family of the outermost torso piece (§6.11; default cloth). */
  armorFamily?: ArmorFamily;
  /** Danger band 0–5 (§6.11, §13.3). */
  band?: number;
  /** Locomotion speed multiplier (§6.11). */
  speedMult?: number;
  /** Seconds before a reactive guard, dodge or counter (§6.11). */
  reactionS?: number;
  /** Seconds between attacks; overrides lerp(2.5, 0.9, aggression) when set (§6.13). */
  attackIntervalS?: number;
  /** Attack tokens the NPC uses: 1, bosses 2 (§6.12). */
  tokensCost?: number;
  /** Beasts: never yield, use unblockable charges and grapples (rpg extension). */
  beast?: boolean;
  /** §13.1 archetype id ('grassator', 'miles-urbanus'…) (rpg extension). */
  archetype?: string;
  /** Thrown or ranged backup: pilum, net, sling shot (rpg extension). */
  ranged?: string;
  /**
   * An archer (mq-04, opt-in): with arrows left and the target in sight between range[0] and
   * range[1] m (default 3–22), it plants, draws for `drawS` and looses one at the chest of `ranged`
   * (the bow item), then waits a random `interval` s; closer, or out of arrows, it fights with `weapon`.
   */
  shoot?: { ammo: number; interval: [number, number]; range: [number, number]; drawS: number };
  /** Worn item ids for the avatar and loot (rpg extension). */
  worn?: string[];
  /** Weapon coating, a poison condition id (rpg extension). */
  poison?: string;
  /** An animal companion's tier (rpg extension). */
  companion?: string;
}

// ------------------------------------------------------------------ runtime services (implemented by src/rpg)

export interface Vitals {
  readonly health: Readonly<Resource>;
  readonly stamina: Readonly<Resource>;
  readonly pietas: Readonly<Resource>;
  readonly dead: boolean;
  /** Apply damage after mitigation; returns the damage actually dealt. */
  damage(amount: number, source?: string): number;
  restore(id: ResourceId, amount: number): void;
  /** Spend stamina/pietas; returns false (and spends nothing) if not enough. */
  spend(id: ResourceId, amount: number): boolean;
  /** Spend what is available (sprinting); returns amount spent. */
  drain(id: ResourceId, amount: number): number;
  /** Seconds until regen resumes after spending. */
  delayRegen(id: ResourceId, seconds: number): void;
  setMax(id: ResourceId, max: number): void;
  tick(dt: number): void;
  revive(): void;
}

export interface CharacterSheet {
  readonly level: number;
  /** Progress toward next character level, 0..1. */
  readonly levelProgress: number;
  readonly vitals: Vitals;
  readonly perkPoints: number;
  readonly perks: ReadonlySet<string>;
  skillLevel(id: SkillId): number;
  /** 0..1 progress to the next skill level. */
  skillProgress(id: SkillId): number;
  /** Award skill-use XP (raw "use" units; the engine applies curves and multipliers). */
  useSkill(id: SkillId, amount: number): void;
  canTakePerk(id: string): boolean;
  takePerk(id: string): boolean;
  /** Sum of all active modifiers (perks + effects + blessings). */
  modifier(id: ModifierId): number;
  hasFlag(flag: string): boolean;
  /** Active timed effects (potions, blessings, diseases). */
  readonly activeEffects: readonly { source: string; effect: Effect; remaining: number }[];
  applyEffects(source: string, effects: Effect[]): void;
}

export interface Inventory {
  readonly denarii: number;
  readonly stacks: readonly ItemStack[];
  readonly weight: number;
  readonly maxWeight: number;
  add(itemId: string, count?: number, opts?: { stolenFrom?: string; silent?: boolean }): void;
  remove(itemId: string, count?: number): boolean;
  count(itemId: string): number;
  addDenarii(amount: number): void;
  spendDenarii(amount: number): boolean;
  equip(itemId: string): boolean;
  unequip(slot: EquipSlot): void;
  equipped(slot: EquipSlot): string | undefined;
  readonly equipment: Readonly<Partial<Record<EquipSlot, string>>>;
  /** Use a consumable/book; returns true if consumed/read. */
  use(itemId: string): boolean;
  onChange(fn: () => void): () => void;
}

// ------------------------------------------------------------------ rpg module extensions (data shapes)

/** An origin chosen at character creation (GDD §3.2). */
export interface BackgroundDef {
  id: string;
  name: string;
  latin?: string;
  description: string;
  /** Added to the starting skill level (+10 / +5 / +5; the veteran's old wound is −5 Athletics). */
  skills: Partial<Record<SkillId, number>>;
  kit: { id: string; count?: number; equip?: boolean; condition?: number }[];
  denarii: number;
  /** Legal status at the start. */
  status?: LegalStatus;
  /** Trait id (`trait-…`) and its one-line description for the origin card. */
  traitId?: string;
  trait?: string;
  /** The trait's mechanics: permanent modifiers and flags. */
  modifiers?: Partial<Record<ModifierId, number>>;
  flags?: string[];
  /** Personal hook (quest thread). */
  hook?: string;
  /** Starting debt in denarii (the fallen eques). */
  debt?: number;
  /** Version in which the origin becomes playable (v0.1 ships four; the rest show locked). rpg extension. */
  since?: string;
  /** Formal dress that starts in the pack, by sex (a toga; or a stola and palla). rpg extension. */
  pack?: { male?: BackgroundDef['kit']; female?: BackgroundDef['kit'] };
  /** Picks a creation extra (a used parmula or +40 den.); every origin but the veteran. rpg extension. */
  creationExtra?: boolean;
}

/** GDD §3.2 legal status ids. */
export type LegalStatus = 'civis' | 'libertus' | 'latinus-iunianus' | 'peregrinus' | 'alexandrinus';

/** A named timed condition. Applied with sheet.applyCondition(id); the effect source is `${kind}:${id}`. */
export interface ConditionDef {
  id: string;
  kind: 'disease' | 'blessing' | 'poison' | 'injury' | 'omen' | 'state';
  name: string;
  latin?: string;
  description: string;
  effects: Effect[];
  /** Blessings: the god and where they are granted. */
  god?: string;
  /** Diseases: chance per exposure (0..1) before resistances. */
  contagion?: number;
  /** Several copies may run at once (bleeding stacks ×3). */
  maxStacks?: number;
  /** rpg extension, blessings: 'temple' (one at a time, 24 game hours) or 'lares' (the compitum favor, 2 game hours). */
  slot?: 'temple' | 'lares';
  /** rpg extension, blessings: landmark id(s) of the temple that grants it. */
  temple?: string | string[];
}

export interface LootEntry {
  /** Item id, or omit and give `table` to roll a nested table. */
  item?: string;
  table?: string;
  /** Weight for weighted picks (`entries`). */
  weight?: number;
  /** Independent chance 0..1 (`extras`). */
  chance?: number;
  /** Count range (inclusive). Default [1, 1]. */
  count?: [number, number];
  minLevel?: number;
  maxLevel?: number;
}

export interface LootTableDef {
  id: string;
  /** Number of weighted picks from `entries` (inclusive range). */
  rolls: [number, number];
  /** Chance that each roll yields nothing (0..1). */
  chanceNone?: number;
  entries: LootEntry[];
  /** Rolled independently, each with its own `chance` (the GDD's "fustis or pugio (50%)" columns). */
  extras?: LootEntry[];
  /** Coins in denarii: a uniform [min, max], optionally scaled by (1 + level × perLevel). */
  denarii?: { range: [number, number]; perLevel?: number; chance?: number };
  /** Always added (keys, quest items). */
  always?: { item: string; count?: number }[];
}

/** One row of the GDD §6.11 tier table (fixed stats — the GDD has no level scaling). */
export interface EnemyTierDef {
  tier: string;
  name: string;
  /** Danger band(s) where it appears: 0 civilians … 4 elite. */
  band: number | [number, number];
  health: number;
  stamina: number;
  /** Armor rating range of its kits. */
  ar: [number, number];
  /** Body armor family of its usual kit. */
  family?: ArmorFamily;
  dmgMult: number;
  speed: number;
  aggression: number;
  blockSkill: number;
  poise: number;
  /** Seconds before a block or dodge reaction. */
  reaction: number;
  skill: number;
  yieldAt?: number;
  fleeAt?: number;
  /** Kits: weapon/shield combinations it may carry, with the kit's AR and body family (spawners pick one). */
  kits: { weapon: string; shield?: string; ar?: number; family?: ArmorFamily }[];
  /** Beasts: movement speed in m/s. */
  moveSpeed?: number;
  loot?: string;
  /** Beasts never yield and use unblockable charges and grapples. */
  beast?: boolean;
}

/** Crime ids (docs/GDD.md §14.1). Resisting arrest and fleeing are bounty multipliers, not crimes. */
export type CrimeId =
  | 'trespass'
  | 'furtum' // theft: 2 × value (min 5)
  | 'furtum-personae' // caught pickpocketing: 25 + 2 × value
  | 'effractio' // lockpicking seen
  | 'rixa' // starting a brawl
  | 'vis' // assault
  | 'sacrilegium' // theft or desecration in a temple
  | 'violatio-sepulcri' // tomb violation
  | 'usurpatio' // the toga without citizenship (100) / the gold ring without rank (200)
  | 'falsum' // forging seals, wills or coins
  | 'homicidium' // murder
  | 'caedes-supplicis' // killing a yielded foe
  | 'incendium' // arson
  | 'maiestas' // treason (the Praetorian ledger)
  | 'fuga'; // escaping custody

export interface CrimeDef {
  id: CrimeId;
  name: string;
  latin?: string;
  /** Flat bounty in denarii. */
  bounty: number;
  /** Extra bounty per denarius of stolen value. */
  valueMult?: number;
  /** rpg extension: the bounty is at least this. */
  min?: number;
  /** rpg extension: a violent crime (no asylum). */
  violent?: boolean;
  /** rpg extension: a murder conviction (sentence ad ludum). */
  murder?: boolean;
  /** rpg extension: always booked in this ledger ('palatium' for maiestas). */
  ledger?: string;
}

/** A patron deity: a passive bonus while chosen and an invocation (Z) that spends pietas. */
export interface DeityDef {
  id: string;
  name: string;
  latin: string;
  /** Where the player chooses this god. */
  temple: string;
  passive: { description: string; modifiers?: Partial<Record<ModifierId, number>>; flags?: string[] };
  invocation: { name: string; description: string; cost: number; effects: Effect[]; /** rpg extension: usable once per game day (Invictus). */ oncePerDay?: boolean };
  /** The shrine blessing this god grants (ConditionDef id). */
  blessing?: string;
}
