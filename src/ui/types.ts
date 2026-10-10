/**
 * UI-facing read models. The UI never reaches into engine internals: each engine (rpg, quests,
 * dialogue, save, map/atlas) exposes one of these small views, usually through a thin adapter
 * (see src/ui/adapters.ts), and registers it with `game.ui.provide({...})`.
 *
 * Coordinates are GAME meters (+x east, +z south), like everything at runtime.
 * Every view is pull-based: the UI calls the getters when a screen opens or `onChange` fires.
 */
import type { EquipSlot, ItemDef, PerkDef, Resource, SkillDef } from '../rpg/types';
import type { MarkerTarget, QuestCategory } from '../quests/types';

// ------------------------------------------------------------------ shared

/** Icon set used by the compass, the map and the legend (see src/ui/icons.ts). */
export type MapIconKind =
  | 'temple'
  | 'forum'
  | 'baths'
  | 'arena'
  | 'theatre'
  | 'market'
  | 'gate'
  | 'palace'
  | 'tavern'
  | 'shop'
  | 'dungeon'
  | 'landmark'
  | 'monument'
  | 'camp'
  | 'bridge'
  | 'house'
  | 'garden';

export type Unsubscribe = () => void;

// ------------------------------------------------------------------ HUD

export interface VitalsView {
  readonly health: Readonly<Resource>;
  readonly stamina: Readonly<Resource>;
  readonly pietas: Readonly<Resource>;
}

/** Extra compass markers supplied by gameplay (enemies in combat, companions, custom pins). */
export interface CompassMarker {
  id: string;
  kind: 'quest' | 'location' | 'enemy' | 'ally' | 'custom';
  x: number;
  z: number;
  icon?: MapIconKind;
  /** Locations: discovered (filled icon) vs. merely nearby (outline). */
  discovered?: boolean;
  label?: string;
}

/** The enemy under attack / under the crosshair (Skyrim's top bar). */
export interface TargetView {
  name: string;
  /** 0..1 */
  health: number;
  /** Tier label shown faintly after the name, e.g. 'Veteran'. */
  tier?: string;
}

export interface BossView {
  name: string;
  title?: string;
  /** 0..1 */
  health: number;
  /** Health fractions where the boss changes phase (pips on the bar), e.g. [0.75, 0.45]. */
  phases?: number[];
}

// ------------------------------------------------------------------ character & skills

export interface SkillView {
  def: SkillDef;
  level: number;
  /** 0..1 toward the next level. */
  progress: number;
}

export interface PerkView {
  def: PerkDef;
  taken: boolean;
  /** Requirements met and a perk point is available. */
  available: boolean;
}

export interface EffectView {
  source: string;
  description: string;
  /** Seconds left; omit for permanent. */
  remaining?: number;
  kind: 'blessing' | 'potion' | 'disease' | 'curse' | 'other';
}

export interface FactionView {
  name: string;
  latin?: string;
  rank?: string;
  /** 0..1 progress to the next rank (optional). */
  progress?: number;
}

export interface CharacterView {
  readonly name: string;
  /** Status line under the name, e.g. 'Peregrinus · freeborn provincial'. */
  readonly title?: string;
  readonly level: number;
  readonly levelProgress: number;
  readonly perkPoints: number;
  readonly vitals: VitalsView;
  skills(): SkillView[];
  /** All perks, or one skill's perks. */
  perks(skillId?: string): PerkView[];
  takePerk(id: string): boolean;
  effects(): EffectView[];
  factions(): FactionView[];
  /** Outstanding bounties per authority. */
  bounties?(): { authority: string; amount: number }[];
  /** Misc. statistics rows ('Days in Rome', 'Denarii earned'...). */
  stats?(): { label: string; value: string }[];
  armorRating?(): number;
  onChange?(fn: () => void): Unsubscribe;
}

// ------------------------------------------------------------------ inventory

export interface InventoryEntry {
  itemId: string;
  def: ItemDef;
  count: number;
  /** Slot the item is equipped in, if any. */
  equipped?: EquipSlot;
  stolen?: boolean;
}

export interface InventoryView {
  readonly denarii: number;
  readonly weight: number;
  readonly maxWeight: number;
  entries(): InventoryEntry[];
  /** Equip, or unequip when already equipped. Returns false when impossible. */
  toggleEquip(itemId: string): boolean;
  /** Consume a consumable. */
  use(itemId: string): boolean;
  drop(itemId: string, count: number): boolean;
  /** Text for books/letters (the UI opens the reader). */
  read?(itemId: string): BookView | null;
  armorRating?(): number;
  onChange?(fn: () => void): Unsubscribe;
}

// ------------------------------------------------------------------ quests & notes

export type QuestState = 'active' | 'completed' | 'failed';

export interface ObjectiveView {
  id: string;
  text: string;
  done: boolean;
  optional?: boolean;
  /** Counted objectives: progress / count. */
  count?: number;
  progress?: number;
  /** Where the compass/map marker points. */
  target?: MarkerTarget;
}

export interface QuestView {
  id: string;
  title: string;
  latin?: string;
  category: QuestCategory;
  /** Display name of the quest giver. */
  giver?: string;
  summary: string;
  state: QuestState;
  tracked: boolean;
  /** Journal entries, oldest first (Skyrim-style first person, past tense). */
  entries: string[];
  /** Objectives of the current stage plus completed ones, in display order. */
  objectives: ObjectiveView[];
  /** Area name for the journal header ('Forum Romanum'). */
  location?: string;
}

export type BookKind = 'book' | 'letter' | 'note' | 'tablet' | 'scroll';

export interface BookView {
  title: string;
  author?: string;
  kind: BookKind;
  /** Paragraphs separated by blank lines. `*italic*` is honored. */
  text: string;
  /** Shown when the book lies in the world and can be picked up. */
  onTake?: () => void;
}

export interface NoteView {
  id: string;
  title: string;
  kind: BookKind;
  /** Short line under the title in the list ('Letter · Pliny the Younger'). */
  meta?: string;
  open(): BookView;
}

export interface QuestLogView {
  quests(): QuestView[];
  setTracked(questId: string, tracked: boolean): void;
  notes(): NoteView[];
  onChange?(fn: () => void): Unsubscribe;
}

// ------------------------------------------------------------------ map

/**
 * A footprint on the map. `rot` is a compass bearing in degrees (clockwise from north), the same
 * convention as atlas landmark rotations: a shape's local −z faces `rot`.
 */
export type MapShape =
  | { kind: 'rect'; x: number; z: number; w: number; d: number; rot?: number }
  | { kind: 'ellipse'; x: number; z: number; rx: number; rz: number; rot?: number }
  /** Circus/stadium: a long rect with semicircular ends; `length` runs along local x. */
  | { kind: 'stadium'; x: number; z: number; length: number; width: number; rot?: number }
  /** Theatre cavea: a half disc whose flat side faces `rot`. */
  | { kind: 'halfDisc'; x: number; z: number; r: number; rot?: number }
  | { kind: 'poly'; points: [number, number][] };

export type MapLandmarkStyle = 'temple' | 'public' | 'arena' | 'palace' | 'garden' | 'monument' | 'camp' | 'domestic';

export interface MapLandmark {
  id: string;
  name: string;
  latin?: string;
  shapes: MapShape[];
  style: MapLandmarkStyle;
  /** Where the label sits (defaults to the first shape's center). */
  labelAt?: { x: number; z: number };
  /** Hide the label below this zoom (px per game meter). */
  labelMinZoom?: number;
}

export interface MapLabel {
  text: string;
  latin?: string;
  x: number;
  z: number;
  kind: 'region' | 'hill' | 'water' | 'garden';
  /** Text angle in degrees (clockwise). */
  angle?: number;
}

export interface MapLine {
  name?: string;
  points: [number, number][];
}

export interface MapRoad extends MapLine {
  rank: 'via' | 'street';
}

export interface MapRiver extends MapLine {
  /** Width in game meters. */
  width: number;
}

export interface MapLocation {
  id: string;
  name: string;
  latin?: string;
  x: number;
  z: number;
  icon: MapIconKind;
  discovered: boolean;
  description?: string;
}

export interface MapQuestMarker {
  questId: string;
  label: string;
  x: number;
  z: number;
  tracked: boolean;
}

/**
 * The city's own street plan (the generated blocks, streets and squares the player walks), in
 * game metres. Flat point lists: x0, z0, x1, z1, … The map draws it once zoomed in; the minimap
 * always.
 */
export interface MapFabric {
  /** Blocks (property lines); gardens are open green blocks. */
  blocks: { pts: Float32Array; garden: boolean }[];
  /** Streets and roads with their full surface width (game m). */
  streets: { pts: Float32Array; width: number }[];
  /** Paved squares and fora (closed outlines). */
  plazas: { pts: Float32Array }[];
}

/**
 * The quest route as the maps draw it (src/nav/QuestRoute.ts fits): legs per place, the first
 * walked from `along` metres on. Only legs outside (cell null) are on the city maps.
 */
export interface MapRouteView {
  readonly version: number;
  readonly along: number;
  readonly legs: readonly { readonly cell: string | null; readonly door: string | null; readonly line: { readonly pts: Float32Array; readonly n: number; readonly cum: Float32Array } }[];
}

export interface MapDataSource {
  /** Game-space extent of the map. */
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Terrain height (game y) for hill shading and contours. */
  heightAt?(x: number, z: number): number;
  /** Contour interval in game meters (default 3). */
  readonly contourInterval?: number;
  readonly rivers: MapRiver[];
  /** Land drawn over water (Tiber Island). */
  readonly islands?: MapShape[];
  readonly roads: MapRoad[];
  readonly walls?: MapLine[];
  readonly aqueducts?: MapLine[];
  readonly bridges?: MapLine[];
  readonly landmarks: MapLandmark[];
  readonly labels: MapLabel[];
  /** Map pins for named places. Undiscovered ones are hidden on the map. */
  locations(): MapLocation[];
  player(): { x: number; z: number; bearing: number } | null;
  questMarkers(): MapQuestMarker[];
  /** The city's blocks and streets (the same object every call; drawing caches on it). */
  fabric?(): MapFabric | null;
  /** The route to the tracked objective, when one is shown (Settings → Interface). */
  route?(): MapRouteView | null;
}

// ------------------------------------------------------------------ dialogue

export interface DialogueTag {
  kind: 'skill' | 'bribe' | 'intimidate' | 'quest' | 'service' | 'action';
  /** Text inside the brackets, e.g. 'Rhetoric 40' or '25 denarii'. */
  label: string;
  /** Estimated success 0..1 for skill checks (colors the tag). */
  chance?: number;
}

export interface DialogueChoiceView {
  text: string;
  tag?: DialogueTag;
  /** Shown greyed out and not selectable. */
  disabled?: boolean;
  disabledReason?: string;
  /** Chosen before in an earlier conversation (dimmed, like Skyrim). */
  seen?: boolean;
  /** Leaves the conversation ('Goodbye'). */
  exit?: boolean;
}

export interface DialogueLine {
  speaker: 'npc' | 'player' | 'narrator';
  /** Speaker name override (a third character in the scene). */
  name?: string;
  text: string;
}

/**
 * What the dialogue engine exposes to the dialogue panel. The engine owns the conversation;
 * the panel renders `line` and `choices` and calls back. When `ended` turns true (or `end()` is
 * called) the panel closes.
 */
export interface DialogueView {
  readonly npcId: string;
  readonly npcName: string;
  readonly npcTitle?: string;
  readonly line: DialogueLine;
  /** Empty while the line simply continues: the panel shows 'Continue' and calls advance(). */
  readonly choices: readonly DialogueChoiceView[];
  readonly ended: boolean;
  choose(index: number): void;
  advance(): void;
  end(): void;
  onChange(fn: () => void): Unsubscribe;
}

// ------------------------------------------------------------------ barter & containers

export interface TradeItem {
  itemId: string;
  def: ItemDef;
  count: number;
  /** Unit price for this direction (what the player pays when buying, receives when selling). */
  price: number;
  stolen?: boolean;
  equipped?: boolean;
  /** Merchant will not take it ('Stolen goods', 'Does not buy weapons'). */
  refuse?: string;
}

export interface DealLine {
  itemId: string;
  count: number;
}

export interface Deal {
  buy: DealLine[];
  sell: DealLine[];
}

export interface BarterView {
  readonly merchantName: string;
  readonly merchantTitle?: string;
  merchantDenarii(): number;
  playerDenarii(): number;
  playerGoods(): TradeItem[];
  merchantGoods(): TradeItem[];
  /** Apply the whole deal atomically. */
  commit(deal: Deal): { ok: true } | { ok: false; reason: string };
  playerLoad?(): { weight: number; max: number };
  onChange?(fn: () => void): Unsubscribe;
}

export interface ContainerItem {
  itemId: string;
  def: ItemDef;
  count: number;
}

export interface ContainerView {
  readonly title: string;
  /** Owner name; when `owned`, taking is stealing (shown in red). */
  readonly owner?: string;
  readonly owned: boolean;
  items(): ContainerItem[];
  playerItems?(): ContainerItem[];
  take(itemId: string, count: number): void;
  takeAll(): void;
  store?(itemId: string, count: number): void;
  onChange?(fn: () => void): Unsubscribe;
}

// ------------------------------------------------------------------ saves

export interface SaveSlot {
  id: string;
  /** Character name. */
  name: string;
  level: number;
  location: string;
  /** In-game date (formatRoman()). */
  gameDate: string;
  /** Real time of saving (ms since epoch). */
  savedAt: number;
  /** Seconds played. */
  playTime: number;
  /** Small JPEG/PNG data URL. */
  thumbnail?: string;
  kind?: 'manual' | 'quick' | 'auto';
}

export interface SaveSlotsView {
  list(): SaveSlot[] | Promise<SaveSlot[]>;
  /** Overwrite `slotId`, or create a new slot. */
  save(slotId?: string): void | Promise<void>;
  load(id: string): void | Promise<void>;
  remove(id: string): void | Promise<void>;
}

// ------------------------------------------------------------------ the sources the UI pulls from

/**
 * Everything the UI reads from the rest of the game. All optional: a missing source hides the
 * corresponding HUD element or shows an empty screen. Register with `game.ui.provide({...})`.
 */
export interface UISources {
  vitals?: () => VitalsView | null;
  character?: () => CharacterView | null;
  inventory?: () => InventoryView | null;
  quests?: () => QuestLogView | null;
  /** Return the same object on every call: the map caches its terrain shading per source. */
  map?: () => MapDataSource | null;
  saves?: () => SaveSlotsView | null;
  /** Extra compass markers (enemies in combat, companions). */
  compassMarkers?: () => CompassMarker[];
  /** Resolve a quest marker target to a position (NPC → its actor, location → its center). */
  resolveTarget?: (t: MarkerTarget) => { x: number; y?: number; z: number } | null;
  target?: () => TargetView | null;
  boss?: () => BossView | null;
  /** Sneak detection 0 (hidden) .. 1 (detected); null when unknown. */
  detection?: () => number | null;
  inCombat?: () => boolean;
  itemName?: (itemId: string) => string | undefined;
  /** Name of the area the player is in (menu header, saves). */
  currentLocation?: () => string | null;
  /** Enables the map's 'Fast travel' button on discovered locations. */
  fastTravel?: (locationId: string) => void;
  /**
   * Wait/rest; default advances game.time. Return a reason (or false) to refuse, e.g.
   * 'You cannot rest while trespassing.' (Waiting in combat is already refused by the UI.)
   */
  wait?: (hours: number) => void | string | false;
  /** Pause menu → Quit to Title. */
  quitToTitle?: () => void;
}
