/**
 * The contracts of phase 2 (docs/design/world-life.md §3). LIFE-CORE owns this file; every other
 * crew imports it and never edits it. Each file in src/life/data/** default-exports defineLife({...}).
 */
import type { Appearance } from '../actors/appearance';
import type { RomanHour } from '../content/hours';
import type { PersonSpec } from '../content/people';
import type { Game } from '../core/Game';
import type { StationDef, StationDressing } from '../npc/crowd/stations';
import type { MarkerTarget, Reward } from '../quests/types';

// ------------------------------------------------------------------ when

/** From one Roman hour mark to another (content/hours.ts), wrapping past midnight. */
export interface Hours {
  from: RomanHour;
  to: RomanHour;
}

/** When something exists or is allowed. Every field given must hold. Only gates.ts reads it. */
export interface Gate {
  questDone?: string | string[];        // finished (completed or failed)
  questCompleted?: string | string[];
  questNotStarted?: string | string[];
  questRunning?: string;
  flag?: string;                        // a saved flag (QuestSystem flags) is truthy…
  notFlag?: string;                     // …or falsy
  festival?: string;                    // today is this festival (game/calendar.ts FESTIVALS id)
  marketDay?: boolean;                  // nundinae (barter.isMarketDay)
  hours?: Hours[];
  dates?: { from: [month: number, day: number]; to: [month: number, day: number] }; // AD 113, month 0-based
  wearing?: string[];                   // any of these item ids equipped (['toga', 'toga-fina', 'stola'])
  has?: { item: string; count?: number };
  skill?: { id: string; min: number };
  fama?: { faction: string; min: number };
  sordidus?: boolean;                   // the player is (or is not) filthy
  /** Last resort. validateLife() can't see inside it, so prefer the fields. */
  if?: (game: Game) => boolean;
}

// ------------------------------------------------------------------ what happens

export type Effect =
  | { kind: 'receive'; denarii: number }                        // paid to the player (the sportula)
  | { kind: 'hours'; hours: number }                            // time passes (skipTime: timers run); the screen dims as in Wait
  | { kind: 'bathe'; tip?: boolean; massage?: boolean }         // rest.bathe(): 1 h, lautus, the cloakroom risk
  | { kind: 'clean'; to: 'normal' | 'lautus' }                  // the fountain, the fuller
  | { kind: 'sleep'; bed: 'own' | 'rented'; until: RomanHour }  // rest.sleep() up to that hour
  | { kind: 'condition'; id: string }                           // sheet.applyCondition ('tonsus', 'calefactus')
  | { kind: 'restore'; target: 'health' | 'stamina'; amount: number | 'full' }
  | { kind: 'skillXp'; skill: string; amount: number }          // sheet.useSkill
  | { kind: 'pietas'; amount: number }
  | { kind: 'fama'; faction: string; amount: number }
  | { kind: 'give'; item: string; count?: number }
  | { kind: 'take'; item: string; count?: number }
  | { kind: 'flag'; name: string; value?: number | string | boolean }
  | { kind: 'rumour'; district?: string }                       // the speaker passes on one of today's rumours
  | { kind: 'omen' }                                            // devotion.rollOmen(), told ambiguously
  | { kind: 'repair' }                                          // the smith mends what you wear (barter.repair)
  | { kind: 'startQuest'; quest: string };                      // an offer accepted (never takes the tracker from the main quest)

/** One thing to do at a person or a thing: a choice in the panel. */
export interface OptionDef {
  /** Unique within its owner. Together with the owner id it keys `daily` and the 'life:option' event. */
  id: string;
  /** The player's line or the action ("Bathe"). The runner adds the price: "Bathe (a quadrans)". */
  text: string;
  /** Denarii (1 as = 1/16, a quadrans = 1/64). Taken first; if the player can't pay, nothing happens. */
  price?: number;
  /** Hidden unless. */
  gate?: Gate;
  /** Shown but disabled unless; `why` is the hint ("You are not dressed for a salutatio"). */
  needs?: { gate: Gate; why: string };
  /** Once per game day. */
  daily?: boolean;
  effects: Effect[];
  /** Said afterwards: the keeper's voice, or the narrator's at a thing. A list rotates. */
  result: string | readonly string[] | ((game: Game) => string);
}

// ------------------------------------------------------------------ people at stations

export type BenchKind = 'mortar';           // phase 2; 'oven' | 'anvil' | 'loom' later

/** A named person who stands at a station post: a shopkeeper, a bath attendant, a doorkeeper. */
export interface KeeperDef {
  /** The NpcDef id this registers ('keeper-<district>-<trade>'). It is also the merchant id. */
  id: string;
  /** crowd/districts.ts id ('dist-subura'). */
  district: string;
  /** An existing station id (crowd/trades.ts, stations.ts), or a new station ('st-life-…'). */
  station: string | StationDef;
  /** Which member of the station is the keeper (default 0). That ambient member becomes this person. */
  member?: number;
  name: string;
  title: string;
  /** Default: seeded from the id, fitting the member's crowd role. */
  appearance?: Appearance;
  tags?: string[];
  barks?: string[];
  /** A shop: the barter panel. `vendor` is a VENDORS kind ('pistor', 'popina'…). */
  shop?: { vendor: string; stock: { id: string; count: number }[]; purse?: number; buys?: string[] };
  /** The conversation (content/people.ts). `trade` defaults to "Show me your wares." when there is a shop. */
  talk: Omit<PersonSpec, 'id' | 'npcs' | 'priority'>;
  services?: OptionDef[];
  /** Job quest ids this keeper offers (src/quests/content/job-*.ts). */
  jobs?: string[];
  /** The player may work here while the keeper is at the post. */
  bench?: BenchKind;
  /** A WagerDef this keeper plays. */
  wager?: string;
  /** Put out while the post is shut and the player is near: shutters across the counter, a rolled awning. */
  closed?: StationDressing[];
  /** Sources and confidence, e.g. "Martial 12.57; Pompeii bakeries [A]". */
  period: string;
}

/** Life lines for an existing named NPC (the 16 vendors, the Ludus people). */
export interface ServiceSet {
  npc: string;
  services?: OptionDef[];
  jobs?: string[];
  bench?: BenchKind;
  wager?: string;
}

// ------------------------------------------------------------------ things

export type ThingAt =
  | { place: string; dx?: number; dz?: number }       // a location, landmark or street-spot id
  | { landmarkSpot: string; replaces?: string }       // a builder's spot; `replaces` removes that interactable id
  | { streetSpots: 'fountain'; max?: number }         // each such street spot near the player (default max 6)
  | { station: string; dressing: number };            // a piece of a station's dressing

/** A thing with E: a fountain, a notice board, a bed, a tomb. */
export interface ActivityDef {
  id: string;                     // 'act.<place>.<what>'
  name: string;                   // prompt label
  verb: string;                   // prompt verb ("Wash", "Read the notices", "Sleep")
  at: ThingAt;
  reach?: number;
  /** The thing is there only when. */
  gate?: Gate;
  open?: Hours[];
  closedText?: string;
  intro?: string | readonly string[];
  /** One option and no intro: it runs at once, with a toast and no panel. */
  options?: OptionDef[];
  /** A notice board: today's notices for this board id become the options. */
  board?: string;
  period: string;
}

// ------------------------------------------------------------------ crafting and games

export interface Recipe {
  id: string;                     // 'rec.mortar.emplastrum'
  bench: BenchKind;
  name: string;                   // the choice: "Make poultices"
  skill?: 'medicina';
  minLevel: number;               // below it the recipe is shown greyed out ("Medicina 20")
  inputs: { item: string; count: number }[];
  output: { item: string; count: number };
  hours: number;
  xp: number;                     // skill XP (GDD §5.4: 10 + 5 per effect)
  period: string;
}

export interface WagerDef {
  id: string;                     // 'wgr.<game>.<place>'
  game: 'tali' | 'munus';
  /** Denarii: per die paid into the pot (tali) or per bet (munus). Offered as choices 1–4. */
  stakes: number[];
  /** What the table can lose per game day (denarii). Then: "Enough of your luck for one day." */
  bank: number;
  /** tali: no game with a guard or vigil this close (m; default 18). */
  watchRadius?: number;
  /** munus: the payout multiple (default 1.8). */
  odds?: number;
  period: string;
}

// ------------------------------------------------------------------ the city's voice

export type RumourKind = 'talk' | 'cry' | 'notice';

export interface RumourDef {
  id: string;                     // 'rum.<lane>.<topic>'
  kind: RumourKind;               // folk talk, the crier's call, a painted notice
  text: string;
  latin?: string;                 // notices: the painted Latin, shown above the English
  districts?: string[];           // heard here (default: anywhere)
  boards?: string[];              // notices: which boards carry it (default: all)
  gate?: Gate;
  /** A quest or job id this offers. Dropped once that quest has started. */
  hook?: string;
  weight?: number;                // default 1
  period?: string;
}

// ------------------------------------------------------------------ jobs (src/life/jobs/defineJob.ts)

export type JobDone =
  | { talk: string }                                          // speak to this NPC (a line is added to their talk)
  | { deliver: { item: string; count: number; to: string } }  // hand these over by talking to `to`
  | { reach: string }                                         // enter a location
  | { use: string };                                          // use an activity ('act.…')

export interface JobStep {
  id: string;
  text: string;                   // the tracker line
  target: MarkerTarget;
  done: JobDone;
  /** Job goods handed over when the step starts (quest items, so they can't be sold). */
  give?: { item: string; count: number }[];
  journal: string;                // first person, past tense
}

export interface JobDef {
  id: string;                     // 'job-<place>-<verb>', also the quest id
  title: string;
  latin?: string;
  summary: string;
  giver: string;                  // keeper or NPC id; offered in their talk
  offer: Gate;
  daily: number;                  // times per game day
  limitHours?: number;            // fails cleanly if not done in this many game hours
  pay: number;                    // denarii on completion
  steps: JobStep[];
  /** If set, one of these replaces `steps`, picked by the day (stable across save/load). */
  variants?: JobStep[][];
  rewards?: Reward;
  period: string;
}

// ------------------------------------------------------------------ a data file

export interface LifeData {
  keepers?: KeeperDef[];
  services?: ServiceSet[];
  activities?: ActivityDef[];
  recipes?: Recipe[];
  wagers?: WagerDef[];
  rumours?: RumourDef[];
}

export const defineLife = (d: LifeData): LifeData => d;
