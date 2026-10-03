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
}

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
  | 'xp.mult';

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

export type EquipSlot = 'mainHand' | 'offHand' | 'head' | 'body' | 'hands' | 'legs' | 'feet' | 'cloak' | 'neck' | 'finger' | 'ammo';

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
  /** Skill that governs and is trained by this weapon. */
  skill: SkillId;
  /** Ranged weapons: projectile speed (m/s) and ammo item id (thrown weapons consume themselves). */
  projectileSpeed?: number;
  ammo?: string;
}

export interface ArmorStats {
  rating: number;
  weightClass: 'light' | 'heavy' | 'clothing';
}

export interface ShieldStats {
  rating: number;
  /** Fraction of incoming melee damage absorbed when blocking (before perks). */
  blockMitigation: number;
}

export type EffectKind =
  | 'restore' // instant: amount of resource
  | 'regen' // +amount per second for duration
  | 'fortify' // +amount to resource max or a modifier for duration
  | 'damage' // poison etc.
  | 'cure'
  | 'modifier'; // temporary ModifierId bonus

export interface Effect {
  kind: EffectKind;
  /** ResourceId for restore/regen/fortify/damage, ModifierId for modifier, 'disease'/'poison' for cure. */
  target: string;
  amount: number;
  /** Seconds (game-real seconds); omit for instant. */
  duration?: number;
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
}

export interface ItemStack {
  itemId: string;
  count: number;
  /** Stolen from this owner id (crime) — selling to non-fences is refused. */
  stolenFrom?: string;
}

// ------------------------------------------------------------------ factions

export interface FactionRank {
  id: string;
  title: string;
  latin?: string;
  minReputation: number;
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
