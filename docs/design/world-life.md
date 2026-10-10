# World life: the phase 2 plan

*Lead design, 10 October 2026. This combines the scout's inventory with three proposals (player-first, history-first, systems-first), checked against the code at `b8041fe`. Phase 1 is described in `living-city-2026-10.md`. Where this file and `docs/STORY.md` disagree, `docs/STORY.md` wins.*

## The decisions on one screen

1. **Every activity uses the conversation panel.** Shops, services, baths, notice boards, the crafting bench and dice all use the panel the owner already knows. It works with E, the number keys 1 to 9, the arrow keys with Enter, and Esc. `game.dialogue.start(id, { name, dialogueId })` already works with any id, so a thing (a bath door or a notice board) can open a "card" in that panel. Phase 2 adds no new screens. The barter screen stays as it is.
2. **No new keys.** H is taken (shoulder swap) and J is taken (the journal), and the phase-1 NAV crew is adding bindings of its own. Everything in phase 2 runs from E plus the keys inside the panel. No crew edits `src/core/Input.ts`.
3. **Shopkeepers stand at the existing stations.** The ~55 trade stations already have hours, people walking to work and set dressing. A *keeper* is a named, registered NPC (`NpcDef`) who replaces one ambient member of a station. Barter already keys every merchant by `NpcDef` id, so the barter system needs no change.
4. **No interiors.** Roman shops (*tabernae*) opened onto the street, so a counter on the pavement is historically right. The baths work as a card and do not need a building.
5. **One data folder and one validator.** All content lives in `src/life/data/**`, which is discovered with a glob. One test (`validateLife`) checks every id, price, hour and history rule. That test is what lets eight agents work at once.
6. **Jobs are repeatable quests.** `QuestSystem` already supports `repeatable` quests, quest markers and saves. It also refuses to let a side quest take the tracker from a running main quest. Jobs reuse all of that.
7. **Fewer things, done well:** 19 shops, 6 services, 1 crafting bench with 7 recipes, 1 dice game plus bets on the games, 4 jobs, 6 side quests and about 60 rumours.

---

## 1. The vision

Rome should feel like a city the player lives in, not one they walk past. It is 11 May AD 113. The bakers are at their ovens before dawn. Clients in togas queue at a senator's door for their handout (the *sportula*). The shops open onto the street and put up their shutters when the keeper goes home. The bath bell rings at the eighth hour. The dicers come out after dark, glancing round for the watch. Each of these is something the player can join by pressing E: buy bread from the woman who sells it, bathe for a quadrans, take the sportula, carry amphorae at the river port, throw knucklebones, grind a poultice, or chase a lost dog. The main quest already makes the player wait: Gratus wants the tablet after sunset, the Lemuria rite is at midnight, and the Column is at first light. Those waits are where the city lives. After the Column the calendar runs on toward June, and the city has to carry the player on its own. Everything here is an offer. Nothing takes the tracker from the story, nothing was built after AD 113, and every supernatural thing stays ambiguous.

---

## 2. What exists and is reused

| What exists | Where | What phase 2 uses it for |
|---|---|---|
| Barter: prices, purses, 2-day restock, haggle, market-day discount, fences, repairs | `src/rpg/barter.ts`, `src/rpg/data/vendors.ts`, `src/content/services.ts`, `src/ui/dialogue/BarterScreen.ts` | Every keeper's shop, the fence, the smith's repairs. Merchant state is keyed by `NpcDef` id, so a registered keeper is a merchant without any change. |
| `person()` conversation kit | `src/content/people.ts` | Every keeper's conversation, including news, haggling and trade. |
| The conversation panel and the dialogue engine | `src/ui/dialogue/DialoguePanel.ts`, `src/dialogue/DialogueSystem.ts`, `src/game/wiring.ts:168` | Cards for things. Any `dialogue:started` already opens the panel. A dialogue whose `start()` returns `undefined` falls through to the next candidate, so a quest dialogue can sit on top of a keeper's own. |
| Stations, StationDirector, staff walking to work, dressing | `src/npc/crowd/trades.ts`, `stations.ts`, `src/npc/stationDirector.ts` | Shop posts, opening hours, people arriving for work, stalls and counters. |
| Named-NPC spawning | `NpcManager.spawnNamed`. The scheduled-spawn loop skips any def with no `home` or `schedule`. | Keepers are spawned only by their station, never by the schedule loop. |
| Roman hours | `src/content/hours.ts` (`at`, `between`) | Every time window in the data. |
| Rest rules with no caller yet | `src/rpg/rest.ts` (`bathe`, `washAtFountain`, `sleep(own)`) | Baths, fountains and the rented pallet. |
| Omens with no caller yet | `src/rpg/devotion.ts` (`rollOmen`, `acceptOmen`, the `amulet` flag) | The haruspex's reading and the fortune-teller's lots. |
| Quests: tracker rule, `repeatable`, markers, `locations` and `items` exports | `src/quests/QuestSystem.ts`, `types.ts` | Side quests and jobs. |
| Quest-staging helpers | `src/content/director.ts`, `questkit.ts` | Quest scenes. |
| Arena rules and practice bouts | `src/rpg/arena.ts`, `src/combat/ArenaBout.ts`, `lud-01` | The daily practice bout at the Ludus. |
| The games in the Colosseum | `src/arena/MunusDirector.ts` (`munus:bout`, `status()`) | Bets and the printed programme. |
| Containers and world deltas | `src/content/containers.ts`, `src/save/deltas.ts` | The chest under the rented pallet. |
| Painted notice boards | The `capfora-nerva` 'notice' spot (Subura compitum), `capfora-caesar` 'praeco-notice', palcirc `temple-ceres-album` (the aediles), the `colos-fountains` album (Meta Sudans) | The four notice boards. |
| Rumour mill | `src/content/talk.ts` `rumors()`, `src/content/folk/topics.ts` | Becomes the front end of the rumour pool. |
| Vignettes | `src/npc/vignettes/street.ts` (thief, hawker) | The thief becomes catchable and the hawker sells. |
| Items | `tali`, `fritillus`, `tessera-frumentaria`, `defixio`, `epistula-signata`, 9 herbs, 6 remedies, `toga`, `stola`, footwear | Wagers, quests and recipes. |
| Calendar | `src/game/calendar.ts` (Mercuralia 15 May, Argei 14 May), `barter.isMarketDay()` | Gates for festivals and market days. |
| Interactions, saves, console | `game.interactions.add`, `game.save.register`, `coc`, `sethour`, `additem`, `gold`, `munus` | Every "press E" thing, the `life` save section, testing. |

**These stay as they are:** the one-click "Buy" at the Palatine and Circus counters (`palcirc/life.ts`), the 16 named vendors' stock, Dama's rented room, and the shrine boons that clean the player at Cloacina and Juturna.

**Gaps this plan closes:** stalls the player cannot buy from; daily-life rules nobody calls (baths, fountains, own bed, omens); no crafting; thin side content (4 misc quests, no jobs); the Ludus is dead after lud-01; the Colosseum is only to look at; nowhere to sell stolen goods; nowhere to keep things.

---

## 3. Systems to build first (LIFE-CORE)

### 3.1 Module map

```
src/life/
  types.ts        the contracts below (LIFE-CORE owns; everyone imports, nobody else edits)
  registry.ts     glob of ./data/**/*.ts (eager), merge, validateLife()
  install.ts      installLife(game): game.life, keepers to npcs and dialogues, cards, save, console
  gates.ts        passes(gate, game): the only reader of Gate
  effects.ts      the only place Effects run
  keepers.ts      KeeperDef to NpcDef plus person() dialogue; station binding; open, shut, dead
  cards.ts        ActivityDef to interactable plus a "card" dialogue; notice boards
  talk.ts         lifeChoices(npcId): life lines for hand-written dialogues
  rumours.ts      daily seeded picks for boards, the crier and citizens
  console.ts      life, life goto <id>, life open <id>, life rumours [board], job start <id>
  craft/          (CRAFT crew) rules.ts, bench.ts
  wager/          (CRAFT crew) tali.ts, munus.ts
  jobs/           (JOBS crew) defineJob.ts
  data/           content, one folder per lane, glob-discovered
    _examples.ts  one worked example of every type (LIFE-CORE; loaded in tests and dev only)
    keepers/ services/ activities/ recipes/ wagers/ rumours/
```

### 3.2 The contracts (`src/life/types.ts`)

```ts
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
```

The other public signatures:

```ts
// src/life/install.ts
declare module '../core/Game' { interface Game { life: LifeService } }
declare module '../core/Events' {
  interface GameEvents {
    /** An option was taken (owner = keeper, NPC or activity id). Quests listen here (the bath thief). */
    'life:option': { owner: string; option: string; detail?: Record<string, string | number | boolean> };
    'life:crafted': { recipe: string; item: string; count: number };
    'life:wager': { wager: string; staked: number; won: number };
  }
}

export interface LifeService {
  /** The keeper is at their post now (station on duty, keeper alive). */
  isOpen(keeperId: string): boolean;
  /** "at the first hour" while shut; null when open, or shut for good (a dead keeper). */
  opensAt(keeperId: string): string | null;
  /** Today's picks: stable for the game day (seeded by the elapsed day) and across save/load. */
  rumours(where: { district?: string; board?: string; kind?: RumourKind }, n: number): RumourDef[];
  /** What E does on a thing; tests and the console call it too. False when shut or gated. */
  open(activityId: string): boolean;
  /** Take an option for an owner: gates, price, daily, effects, then 'life:option'. */
  take(owner: string, option: OptionDef): { ok: boolean; why?: string };
  status(): { keepers: number; open: number; activities: number; interactables: number; rumoursToday: number; problems: string[] };
}

// src/life/talk.ts: splice life lines into a hand-written dialogue (services, bench, dice, jobs, deliveries)
export function lifeChoices(npcId: string): { choices: DialogueChoice[]; nodes: Record<string, DialogueNode> };

// src/life/registry.ts
export const LIFE: Readonly<Required<LifeData>>;
export function validateLife(data: Required<LifeData>, refs: LifeRefs): string[]; // empty when clean

// src/life/jobs/defineJob.ts (JOBS crew)
export function defineJob(def: JobDef): QuestDef; // category 'radiant', repeatable, daily cap in the life save
```

### 3.3 How the pieces work (rules for LIFE-CORE)

- **Keepers.**
  - At install, each `KeeperDef` becomes:
    - an `NpcDef` with no `home` and no `schedule`, so the schedule loop never spawns it;
    - tags `vendor:<kind>` when it runs a shop;
    - no `dialogue` field;
    - a `person()` dialogue registered at priority 10, so a quest's dialogue for the same NPC can take over at priority 50 or more.
  - `StationHost` gets `keeperFor(def, memberIndex)`. When that returns an id, `NpcManager.spawnStationMember` calls `spawnNamed(keeperDef, …)` and sets `npc.station`. Station people already count toward the night cap of 25.
- **Hours.** A keeper's hours are its station's `when`, so they are written in one place only.
  - While a keeper station is off duty and the player is within 85 m, the dressing stays and the `closed` dressing is added.
  - E on the counter then says "Closed · opens at the first hour".
  - A dead keeper (`deadNamed`) leaves the shop shuttered for good, and the counter says "Closed. The keeper is dead." There is no successor in phase 2.
- **Market days.** `StationDef` gets `marketDay?: boolean`. Those stations are active only when `barter.isMarketDay()` is true.
- **Cards.**
  - An `ActivityDef` becomes an interactable. It is registered only while the player is within 60 m, and its `position()` returns a stored vector, with no allocation.
  - E calls `game.dialogue.start(activityId, { name, dialogueId: 'life:' + activityId })`. Options become choices, and `needs` becomes a disabled choice whose hint is `why`.
  - An `hours` effect dims the screen for 650 ms, as Wait does, by reusing the `wt-veil` class.
- **Boards.** A board's card lists 2 to 4 of today's notices, at most 2 of them hooks.
  - Reading a hooked notice offers "Note it down", which starts the quest. It appears in the journal and is not tracked while the main quest runs.
  - A board on a builder's spot replaces that spot's "Read" prompt (`replaces`).
- **Rumours.**
  - The day's picks are seeded with `dayIndex` and the board or district id, so they do not change on reload.
  - A hooked rumour disappears once its quest starts, and no hooked rumour appears before `mq-01-madida-capena` is done (STORY rule 2).
  - `content/talk.ts` `rumors()` appends one 'talk' pick from the pool. The citizens' news topic (`folk/topics.ts`) also draws from the pool. Cerdo the crier reads 'cry' picks.
- **Services for existing NPCs.** A `ServiceSet` reaches a named vendor through one spread line in their dialogue: `...lifeChoices('npc-tryphon').choices`. The same function adds job offers and delivery lines for running jobs.
- **Saves.** `game.save.register('life', …)` keeps the daily marks, jobs done today, each table's bank used today, the shops shut for good, open munus bets and the pallet's rent day. Target: 16 KB or less.
- **Validation is a test, not a boot step.** In production nothing is validated at runtime, and `installLife` must take 5 ms or less.

### 3.4 Ids and naming

| Kind | Pattern | Example |
|---|---|---|
| Keeper (also the NpcDef and merchant id) | `keeper-<district>-<trade>` | `keeper-subura-pistor` |
| New station | `st-life-<district>-<trade>` | `st-life-tuscus-aerarius` |
| Activity | `act.<place>.<what>` | `act.subura.board` |
| Recipe | `rec.<bench>.<item>` | `rec.mortar.emplastrum` |
| Wager | `wgr.<game>.<place>` | `wgr.tali.subura` |
| Rumour | `rum.<lane>.<topic>` | `rum.city.mule-prices` |
| Job (quest id) | `job-<place>-<verb>` | `job-portus-saccarius` |
| Side quest | `misc-<name>` | `misc-hilara` |
| Board | `board-<place>` | `board-subura`, `board-forum`, `board-ceres`, `board-meta` |
| Flags shared between crews | listed in §4 | `hilara-returned`, `pallet-until` |

### 3.5 Shared files (only LIFE-CORE edits these, each edit small)

| File | Edit |
|---|---|
| `src/game/optional.ts` | Add a glob for `../life/install.ts`. |
| `src/npc/crowd/stations.ts` | `StationDef.marketDay?`; a hook to register life stations; DressingKind gains `'shutters' \| 'banner'`; **remove** `st-esquiline-salutatio` (see Appendix A). |
| `src/npc/stationDirector.ts` | `keeperFor` host hook; keep the dressing and add `closed` while off duty and near; market-day filter. |
| `src/npc/NpcManager.ts` | `spawnStationMember` spawns the keeper's NpcDef when hooked. |
| `src/npc/props.ts` | Two cached dressing kinds, `shutters` and `banner` (made with `cachedDressing`). |
| `src/content/talk.ts`, `src/content/folk/topics.ts` | Rumour pool feeds. |
| `src/rpg/data/items/index.ts` | `...LIFE_ITEMS` from `./life` (the CITY VOICE crew fills this). |
| `src/rpg/data/conditions.ts` | `...LIFE_CONDITIONS` from `./conditions-life` (SERVICES fills this). |
| `src/rpg/data/vendors.ts` | Merge `VENDORS_LIFE` from `./vendors-life` (SHOPS fills this). |
| `src/ui/hud/Hud.ts` | The date line shows "· Nundinae" on market days. |
| `src/dev/console/commands.ts` | Register the `life` and `job` commands. |

Other crews ask for shared changes in their report and do not make them.

### 3.6 The validator (`tests/life-data.test.ts`)

It runs `validateLife(LIFE, refs)` on the real data and checks that a broken fixture fails. It checks:

- Every id is unique and has its lane's prefix. Each `(station, member)` pair is claimed only once.
- Every item, NPC, station, vendor kind, quest or job, festival, skill and condition id exists.
- Hours are valid `RomanHour` marks.
- Prices are greater than 0 and come in whole quadrantes (multiples of 1/64).
- Shops have stock. Keepers have at least 2 topics. A recipe's output is not one of its inputs.
- Rumour text is 280 characters or fewer, and notices are 400 or fewer.
- **History and story lint:**
  - No text names a building or ruler after AD 113 (the CLAUDE.md list, plus Hadrian's Pantheon, Caracalla and Diocletian).
  - `npc-hermogenes` never appears in life data. `npc-euhodus` appears only in a `ServiceSet` whose only effect is `repair`.
  - The strings "Piperataria" and "pepper warehouse" never appear in rumours, quests or keeper talk (the Pepper Warehouses are a main-quest lead).
  - The real people Pliny, Martial, Trajan, Plotina and Hadrian are never speakers.

---

## 4. Content

### 4.1 The Roman day (11 May; Roman hours from `hours.ts`)

| Roman hour (clock) | The city | The player can |
|---|---|---|
| v4 to h1 (02:27–04:54) | Bakers at the ovens, the last carts leaving, greengrocers setting out | Buy bread in the Subura and herbs at the Holitorium; the bread round |
| h1 to h2 (04:54–07:16) | Clients at the patron's door; barbers and the schoolmaster start | Take the sportula, get a haircut |
| h3 to h6 (07:16–12:00) | Shops, markets, the grain dole, the courts | Shopping, porter work, Forged Tokens at the dole, the scribe |
| h7 (12:00–13:11) | Midday meal and rest. The streets thin; shops stay open. | Eat at a popina. The bath attendant: "Not until the bell." |
| h8 to h10 (13:11–16:44) | The bath bell rings (Martial 14.163, 10.48); the Ludus drills again | Bathe; the Bath Thief; the daily practice bout |
| h11 to h12 (16:44–19:06) | Dinner (*cena*); popinae fill; most shops shut | Eat; dice on the Basilica Julia steps until the boards are packed away |
| v1 to v3 (19:06–00:00) | Carts, the vigiles, popinae, dice | Dice in the Subura, the fence's doorway, sleep |

### 4.2 Shops and keepers by district (SHOPS crew; 19 keepers)

Build them in this order: the golden path first (Circus, Velabrum and Vicus Tuscus, Forum), then the Subura and Argiletum, then the river markets. Items marked * are new and come from the CITY VOICE crew.

| # | Keeper id | Station (member) | Who | Sells | Services | Open |
|---|---|---|---|---|---|---|
| 1 | `keeper-circus-popina` | `st-circus-popina` (0) | Cook-shop under the Circus arcades | puls, botulus, lupini, panis, vinum, posca | A hot cup (*calda*, 2 as) gives `calefactus` | dawn to evening |
| 2 | `keeper-circus-sortilega` | `st-circus-sortilega` (0) | Fortune-teller (Juvenal 6.582–91) | none | Draw a lot (2 as): `omen` plus an ambiguous line, once a day | morning to evening |
| 3 | `keeper-circus-figulus` | `st-circus-figlinae` (0) | Potter and lamp-seller | lucerna*, cheap cups | none | day |
| 4 | `keeper-velabrum-casearius` | `st-velabrum-caseus` (0) | Smoked cheese of the Velabrum (Martial 11.52, 13.32) | caseus, olivae, ficus, mel | none | shop hours |
| 5 | `keeper-tuscus-vestiarius` | `st-tuscus-vestarius` (0) | Silks and fine cloth | tunica-linea, palla-fina, stola-fina, pallium | none | dawn to evening |
| 6 | `keeper-tuscus-olearius` | `st-tuscus-velabrum` (0) | Oil-seller | oleum*, olivae, acetum | none | day |
| 7 | `keeper-forum-scriba` | `st-forum-scriba` (0) | Letter-writer by the courts | tabula-cerata*, stilus, cera-signatoria | Write a letter for me (4 as) gives `epistula-signata` | shop hours |
| 8 | `keeper-sacra-piperarius` | `st-sacra-piperatarii` (0) | Spice and drug dealer (`seplasiarius`). **Trade talk only.** | piper ×3, tus, myrrha, papaver, mandragora | none | shop hours |
| 9 | `keeper-sacra-margaritarius` | `st-sacra-margaritarii` (0) | Pearl-dealer of the Porticus Margaritaria | margarita, gemma, jewellery | none | shop hours, late |
| 10 | `keeper-subura-popina` | `st-subura-thermopolium` (0) | Popina keeper (relabelled; see Appendix A) | puls, cicer, lupini, botulus, panis, vinum, posca | *calda* | morning to night |
| 11 | `keeper-subura-pistor` | `st-subura-pistrinum` (1) | The bread-seller at the bakery door | panis, libum | none | predawn to morning |
| 12 | `keeper-subura-vinarius` | `st-subura-vinarius` (0) | Wine-seller | vinum, vinum-melius, vinum-falernum, mulsum, acetum | none | shop hours, late |
| 13 | `keeper-subura-faber` | `st-subura-faber-ferrarius` (0) | Smith | clavus, ferrum, pugio, fustis, tools | Mend my arms (`repair`) | working day |
| 14 | `keeper-subura-tonsor` | `st-subura-tonsor` (1) | Street barber (Martial 7.61) | none | Haircut (2 as) or shave (1 as) gives `tonsus` and a `rumour` | dawn to midday |
| 15 | `keeper-subura-fullo` | `st-subura-fullonica` (1) | Fuller | tunica, tunica-crassa, linteum* | Wash my clothes (3 as): `clean: normal` | working day |
| 16 | `keeper-argiletum-librarius` | `st-argiletum-librarius` (0) | Bookseller, door-posts covered with titles (Martial 1.117) | the books, tabula-cerata* | none | shop hours, late |
| 17 | `keeper-argiletum-sutor` | `st-argiletum-sutor` (0) | Cobbler | soleae, calcei, carbatinae, caligae | none | working day |
| 18 | `keeper-boarium-lanius` | `st-boarium-lanii` (0) | Butcher | botulus, patina, corium | none | dawn to midday |
| 19 | `keeper-holitorium-holitor` | `st-holitorium-holitores` (0) | Greengrocer and herb-seller | allium, salvia, ruta, absinthium, cicer, fabae, ficus | none | predawn to morning |

Each keeper has a name, a title, two or more topics in their own voice, news, and a short `closed` shutter line. New vendor kinds go in `src/rpg/data/vendors-life.ts`: `margaritarius`, which buys jewellery, and `vinarius`.

### 4.3 Market day (SHOPS)

On every 8th elapsed day (`barter.isMarketDay()`), four keepers with `marketDay` stations set up at the Forum Boarium and the Forum Holitorium, each with a `banner` (rule given in §3.3):

- a country woman selling mel, caseus and ficus;
- a herb-woman selling cheap herbs;
- a dealer in cheap pottery and lamps;
- a cloth-seller with tunics.

The crier calls the market (a 'cry' rumour from CITY VOICE), the HUD date reads "· Nundinae", and the existing 10% stall discount applies. The nundinae came every 8 days, and country people came into town for them [A].

### 4.4 Services

All of these are `OptionDef`s. Services sold by keepers belong to the crew that owns the keeper. SERVICES owns the ones on existing NPCs and things.

| Service | Who or where | Price | Effects | Gate |
|---|---|---|---|---|
| Bathe | Bath attendant at the Baths of Titus (`st-thermae-titi` 0) and the Baths of Trajan (`st-thermae-traiani` 0): `keeper-thermae-titi-balneator`, `keeper-thermae-traiani-balneator` | 1 quadrans | `bathe` (1 h, `lautus` 12 h, 15% chance the cloak is stolen), then `rumour` | h8 to h11. At h7: "Not until the bell, at the eighth hour." |
| Bathe and tip the cloakroom slave | same | 1 quadrans + 1 as | `bathe {tip}` (no theft) | same |
| Bathe with a rub-down | same | 1 quadrans + 3 as | `bathe {tip, massage}` (full stamina) | same |
| Wash at a fountain | Every street `fountain` spot (≤ 6 near) | free | `clean: normal`, toast | `sordidus` |
| Haircut and shave | `npc-tryphon` (Basilica Paulli) | 2 as / 1 as | `tonsus` (+5 persuasion for 1 day; new condition), `rumour` | Free once flag `hilara-returned` is set |
| Laundry | `npc-cerinthus` (Velabrum) | 3 as | `clean: normal` | none |
| Mend my arms | `npc-euhodus` | smith's price | `repair` | Repair only. He is not moved or used in any other way. |
| A reading of the signs | `npc-arruns` (haruspex) | 1 den. | `omen` (good: `omen-faustum`; bad: "touch an amulet" refuses it), religio XP | Daily |
| A nativity | `npc-zenon` (astrologer) | 12 as | Flavour only: three lines drawn by day, religio XP 5 | Daily |
| The pallet behind the Silver Pig | `npc-chreste` | 2 den. for 30 days | Flag `pallet-until`, gives `clavis-pergulae`* | none |
| News | `npc-cerdo` | free | Reads 3 'cry' picks | none |

New conditions in `src/rpg/data/conditions-life.ts`:

- `tonsus`: groomed, +5 persuasion for 1 game day.
- `calefactus`: warmed, +10% stamina regeneration for 1 game hour.

### 4.5 Activities

- **Notice boards** (SERVICES; texts from CITY VOICE). There are four, each on an existing painted board, replacing its Read prompt:
  - `board-subura`: the compitum board, `capfora-nerva` 'notice'.
  - `board-forum`: `capfora-caesar` 'praeco-notice'.
  - `board-ceres`: the aediles' album at the Temple of Ceres.
  - `board-meta`: the album at the Meta Sudans.
- **The pallet** (SERVICES). Behind the Silver Pig:
  - `act.silver-pig.pallet` (verb Sleep). Gate: `pallet-until` is not past. Options: sleep until dawn, or until the sixth hour, both as `sleep: own`, which gives `bene-quietus`.
  - A chest, `cista-pergulae`, in `containers.ts`. It has no owner, is locked with `clavis-pergulae`, and persists in the deltas.
  - This is the GDD's `domus-pergula`: a bed and a chest, the first place to keep things.
- **The salutatio** (SERVICES). A new station, `st-life-velia-salutatio`, at a fictional senator's door on the Velia. The senator is Gaius Vettius Rufinus, who is seen and never speaks.
  - The doorkeeper is `keeper-velia-ostiarius`.
  - "Wait in the queue and greet the patron" (1 h). Needs the toga, fine toga or stola. Daily, h1 to h2.
  - Effects: `receive` 25 as (100 quadrantes: Martial 1.59 and 3.7 [A]), rhetoric XP 5 (GDD §5.4), Fama clientela +1.
  - On one day in two the doorkeeper also offers `job-cliens-epistula`.
- **Dice (*tali*)** (CRAFT and GAMES). Two tables:
  - `keeper-subura-aleator` at `st-subura-alea` (evening and night).
  - `keeper-forum-aleator` at `st-forum-tabulae`, the gaming boards scratched into the Basilica Julia steps (morning to afternoon).
  - The rules are **Augustus's own**, from his letter in Suetonius, *Augustus* 71 [A]:
    - Each round every player throws four tali.
    - For each die showing 1 (*canis*) or 6 (*senio*), the thrower puts one stake into the pot.
    - Whoever throws Venus (four different faces) takes the pot.
  - Faces come up about 1 : 4 : 4 : 1 for 1, 3, 4, 6 [P, modern throws]. One key press is one round: the dicers throw automatically and the text tells the throws.
  - Stakes are 1 to 4 as per die. The table's bank is 3 den. a day.
  - The keeper refuses while a guard or vigil is within 18 m ("Not with the watch looking"). Gambling was illegal outside the Saturnalia and was tolerated (Martial 4.14, 5.84) [A].
  - No cheating in phase 2.
- **The games** (CRAFT and GAMES). Only on games days (`munusOn`):
  - The programme-seller (`keeper-colos-libellio`, `st-colos-libelli` 0) sells today's card for 1 as. The card text is made from `game.munus.status()`.
  - A bookmaker (`keeper-colos-sponsor`, a new station by the Colosseum) takes bets of ¼ to 4 den. on one fighter of the next pair.
  - The bet is settled by `munus:bout` (pays 1.8×; a draw with both sent off standing returns the stake). The player collects by talking to the bookmaker.
  - Ovid, *Ars Amatoria* 1.167–170, shows a man at the gladiators asking for the programme and placing a bet [A].

### 4.6 Crafting (CRAFT and GAMES)

There is one bench: the **mortar**, for remedies (medicina). It is at:

- Demetrius's in the Basilica Paulli: 1 as a use, while he is there.
- Hermippus's in the Ludus infirmary: free once `lud-01-sacramentum` is done.

The bench card lists the recipes. Ones the player can make are enabled. Ones without the inputs are disabled with "You need …". Ones above the player's skill are greyed with "Medicina 20". Making one passes time, uses the inputs, gives XP and fires `life:crafted`.

| Recipe | Inputs | Makes | Medicina | Hours | Where the inputs come from |
|---|---|---|---|---|---|
| `rec.mortar.fascia` | linteum* ×1 | fascia ×2 | 0 | 0.25 | Fuller |
| `rec.mortar.posca` | acetum ×1, aqua ×1 | posca ×2 | 0 | 0.25 | Oil-seller, a fountain |
| `rec.mortar.emplastrum` | mel, salvia, acetum | emplastrum ×3 | 10 | 0.5 | Cheese-seller, greengrocer |
| `rec.mortar.collyrium` | ruta, acetum, mel | collyrium ×2 | 20 | 0.5 | Greengrocer |
| `rec.mortar.febrifugum` | absinthium ×2, vinum, mel | febrifugum ×1 | 30 | 1 | Greengrocer, wine-seller |
| `rec.mortar.soporificum` | papaver, mandragora | soporificum ×1 | 40 | 1 | Spice dealer |
| `rec.mortar.theriaca` | myrrha, papaver, mel, ruta, allium, vinum-falernum | theriaca ×1 | 55 | 2 | Spice dealer and others |

The recipes are simplified [G]; remedy-making itself is attested (Celsus book 5, Pliny *NH* 20) [A]. Fountains get a second option, "Fill a flask", which gives `aqua`. **Economy rule:** selling a craft back recovers its inputs plus a modest margin at most. The gain is XP and having the remedy when it is needed. A 30-day simulation test enforces this (§5.4). The crafting perks stay hidden. Do not flip `V01_SYSTEMS` in phase 2.

### 4.7 Jobs (JOBS and LUDUS; repeatable, offered by their giver, never tracked over the main quest)

| Job | Giver | Steps | Pay | Cap and gate |
|---|---|---|---|---|
| `job-portus-saccarius`: Porter at the river port | `keeper-portus-tabularius` (the tally clerk, `st-portus-saccarii` 2) | 3 times: take an amphora of oil* (quest item, heavy, so the player is slowed by the weight) from the barge, carry it to the storehouse door, hand it to the storekeeper | 12 as | 2 a day. Working day. After mq-01. |
| `job-subura-pistor`: The bread round | `keeper-subura-furnarius` (the baker, `st-subura-pistrinum` 0) | Deliver a basket each to `keeper-subura-popina`, `npc-chreste` and `npc-dama` before h3 | 6 as and a loaf | 1 a day. From v4 to h1. Fails cleanly after h3. |
| `job-cliens-epistula`: The patron's letter | `keeper-velia-ostiarius` (after the sportula) | Carry `epistula-signata` to one of `npc-philetus`, `npc-zethus` or `npc-dama` (a variant picked by the day) | 4–8 as by distance | 1 a day, on one day in two |
| `job-ludus-lusio`: A practice bout | `npc-asiaticus` | One practice bout with wooden arms (nobody dies) against a random Ludus regular, using the lud-01 favour and missio rules | `arenaPurse(favor)`, 3–10 den. | 1 a day in drill hours. After lud-01. |

A labourer earned about 12 as a day [P]. That calibrates the pay above, and the practice bout is the risky, better-paid career.

### 4.8 Side quests (six)

All six are offers found by walking about. They use `defineQuest` (`category: 'misc'`). The journal is in the first person, past tense. Fists only, unless the player draws a blade (assault). No main-quest secrets.

**Q1. Hilara (`misc-hilara`), QUESTS I.**
- **Place:** the Basilica Paulli shops, the Circus valley, the yard behind the Circus starting gates (a location exported by the quest).
- **When:** after mq-01; any day. The stray pack comes out at dusk (h11 to v2).
- **Hook:** all already exist: the painted notice on the Basilica Paulli pier (`t10-canis`), Tryphon's topic, and Cerdo's cry. Board notice: `board-forum`.
- **Steps:**
  1. Tryphon offers the 20 sesterces.
  2. Ask around the Circus. A 'talk' rumour, gated on the quest running, gives the lead: "a big Molossian with a bronze bulla runs with the pack behind the starting gates."
  3. At dusk, find the pack: three or four dogs made with the existing `Quadruped`.
  4. Offer a sausage (needs `botulus`; the cook-shop sells them). Hilara follows 2–4 m behind, waits if the player runs ahead, and goes back to the pack beyond 40 m.
  5. Bring her to Tryphon in his hours.
- **Reward:** 5 den. (20 HS); sets `hilara-returned` (free haircuts); Fama plebs +2.
- **History:** lost-and-found notices were painted on walls [A, Pompeii]. Molossian hounds [A]. The notice itself is invented [G].

**Q2. The Bronze Pot (`misc-urna-aenea`), QUESTS I.**
- **Place:** a coppersmith in the Vicus Tuscus (new post `st-life-tuscus-aerarius`, `keeper-tuscus-aerarius`, Primus); the Subura dice table; the fence's doorway (`st-life-subura-receptatrix`, `keeper-subura-receptatrix`, Crispina; evening and night; vendor kind `receptator`).
- **Hook:** Cerdo's cry (exists). The shop's painted notice in the words of a real Pompeian one: "A bronze pot has gone from this shop. Whoever brings it back gets 65 sesterces; whoever hands over the thief, 20 more" (CIL IV 64) [A, Pompeii].
- **Steps:**
  1. Primus offers the job.
  2. His apprentice Felix lies. Either pass Rhetoric DC 25, or hear at the dice table that "the coppersmith's boy owes thirty asses".
  3. Felix confesses he sold the pot to Crispina.
  4. Crispina wants 10 den. Pay her; or intimidate her (DC 40); or report her to the vigiles, in which case the pot is confiscated and returned and the reward is smaller.
  5. Name Felix (+20 HS), or cover for him by paying his 30 as debt at the table.
- **Reward:** 65 HS (16¼ den.), +20 HS for the thief, Fama plebs +3.
- **Afterwards:** Crispina stays as Rome's fence, so stolen goods have a buyer and the `fences` perk works.
- **History:** receivers of stolen goods (*receptatores*) were punished like the thieves [P].

**Q3. The Bath Thief (`misc-fur-balnearius`), QUESTS I.**
- **Place:** the Baths of Titus, Crispina's doorway, the tombs on the Via Appia outside the Porta Capena.
- **Hook:** bathing without the tip can cost the player their cloak. The quest starts on `life:option` with `detail.stolen`. There is also a rumour: "a cloak a day goes from the Titus."
- **Steps:**
  1. Ask Sabinus, the cloakroom attendant (*capsarius*; QUESTS I's own NPC, at the baths' side door h8 to h11). He shrugs.
  2. At the next bathing hour, watch the cloakroom door (T to wait). A slave leaves with a bundle. Follow him (`walkTo`) to Crispina.
  3. Crispina sells him out: Sabinus brings her one a day.
  4. Choose one:
     - (a) Confront Sabinus: Rhetoric DC 40, or a fistfight. The cloak comes back, plus 5 den.
     - (b) Report him to an officer of the vigiles at their night post. The prefect of the watch heard cases against *capsarii* who stole clothes at the baths (Digest 1.15.3.5) [A]. The cloak comes back, plus 8 den.
     - (c) Have a curse tablet (`defixio`) written and push it into a tomb's libation pipe outside the Porta Capena. Three days later Sabinus is sick with a fever and the cloak hangs on the player's peg again. Nobody says why.
- **Reward:** the cloak, 5 or 8 den., or the ambiguous ending.
- **History:** curse tablets against bath thieves survive from Bath in Britain [A, outside Rome]. Curse tablets were put in graves [A].

**Q4. Forged Tokens (`misc-tesserae-falsae`), QUESTS II.**
- **Place:** the Porticus Minucia Frumentaria; the Subura dice table at night; a lead-worker's yard (a container exported by the quest).
- **Hook:**
  - A scene at the dole in the morning, when the player is near: the freedman Eutychus is turned away with a lead token.
  - A rumour.
  - The curator's notice on `board-subura`: "Tokens bought from anyone but the curator are false and will be broken."
- **Steps:**
  1. Eutychus paid 6 den. "to a man with a lead-stained thumb who dices in the Subura".
  2. The curator of the dole (`keeper-minucia-curator`, `st-minucia-frumentatio` 0) quietly asks the player to find the mould.
  3. At the dice table in the evening, find Lucrio. Persuade him, stake him at tali, or follow him home.
  4. Take the moulds (`forma-tesserarum`, a quest item) from his yard. It is theft if someone sees.
  5. Choose: give the moulds to the curator (20 den., Fama plebs +5; Lucrio is taken away), or sell them to Crispina if she exists (30 den., Infamia +5; a later rumour says the false tokens are still about).
- **History:** the dole by token [A/P]. The forgery is invented [G].

**Q5. Mercury's Water (`misc-mercuralia`), QUESTS II.**
- **Place:** Mercury's spring by the Porta Capena (a quest location); the aediles' clerk by the Temple of Ceres; a new oil-dealer's post at the Forum Boarium (`st-life-boarium-olearius`).
- **When:** offered from 10 May. During Act I that means through the existing Fadia topic, a notice and a cry. It plays out on **15 May**, which can only be reached after mq-04, once the date runs. If missed, it is offered again a year later (GDD §11.1).
- **Steps:**
  1. From dawn to h3, merchants come to the spring with jars and laurel. The player can do the rite: "Dip a laurel and sprinkle yourself" (1 as) gives religio XP 25 and Pietas +2.
  2. Overhear the oil-dealer Lucius Septimius praying hardest to wash away "the short measure". Ovid's merchant asks Mercury to forgive his past lies and bless his future ones (*Fasti* 5.673–692) [A].
  3. Borrow the aediles' standard measure from their clerk.
  4. Test his measure at his stall. It is a sixth short.
  5. Choose: report him (fine; his post is shut for 8 days; 10 den.), squeeze him (15 den., Infamia +3), or warn him that Mercury sees (Rhetoric DC 40; Pietas +5; he sells to the player at cost from then on).
- **History:** the aediles policed markets and measures [A]. The fraud is invented [G].

**Q6. Free by the God's Hand (`misc-servus-aesculapii`), QUESTS II.**
- **Place:** Tiber Island (the temple of Aesculapius) and the Pons Fabricius.
- **Hook:** a rumour, "A slave left to die on the Island has got up and walked," and `board-ceres`.
- **Steps:**
  1. Daos, an old Syrian cook, was left on the island when he fell sick. Now his master's steward wants him back.
  2. Claudius's edict made such a slave free if he recovered (Suetonius, *Claudius* 25.2) [A]. Gather two of three proofs: the temple attendant's memory of him being brought in, a fellow patient who saw the master's men leave him, and the carter who brought him.
  3. At h3 on the bridge, face the steward. Persuade him (Rhetoric DC 55, −15 for each proof), bribe him (10 den.), or fight his two men with fists.
- **Reward:** Daos's Syrian amulet (`amuletum-syrium`, a quest item; worn, it sets the `amulet` flag that turns aside bad omens), Pietas +5, Fama plebs +3.
- **Policy:** the player helps a man win his freedom (GDD §14.11).

### 4.9 Street life and the city's voice

- **Keepers' day.** Keepers walk in from a house door when their station opens (this already exists) and leave when it shuts. The shutters go up. Night popinae keep their keepers.
- **"Fur!"** (JOBS and LUDUS):
  - The thief vignette becomes catchable after mq-01. Close in on or hit the thief and he yields (the yield system).
  - E on him: "Take back the purse." Returning it to the victim earns 2–6 as and Fama plebs +1.
  - Keeping it is theft (`furtum`) if someone sees.
- **The hawker sells** (JOBS and LUDUS). The hawker vignette's tray gets a one-click Buy (honey cake, lupins), as at the palcirc counters.
- **The bath bell** (SERVICES). At h8, bath attendants within earshot call "The bell! The water's hot!" This is bark data only.
- **Rumours** (CITY VOICE). About 60:
  - ≥ 30 'talk', tagged by district;
  - ≥ 12 'cry' (Cerdo, market days, games days, Mercuralia eve);
  - ≥ 20 'notice' across the four boards: games playbills on `munusOn` days, rooms to let in the style of the Pompeian lease notice (CIL IV 138) [A, Pompeii], lost and found, the job and quest hooks.
  - They change daily, and they react to quest state and festivals.

### 4.10 Money (asses unless marked; 16 as = 1 denarius)

| Spend | Price | | Earn | Pay |
|---|---|---|---|---|
| Bread, a cup of house wine | 1 | | Sportula (daily) | 25 |
| *Calda*, sausage | 2 | | Porter (×2 a day) | 12 each |
| Baths | ¼ (+1 tip, +2 rub-down) | | Bread round | 6 and a loaf |
| Haircut, shave, laundry | 2, 1, 3 | | Patron's letter | 4–8 |
| Lot, haruspex, nativity | 2, 16, 12 | | Practice bout | 3–10 den. |
| Dama's bed | 4 a night | | Side quests | 5–20 den. |
| Pallet behind the Silver Pig | 2 den. a month | | Dice | ±, bank 3 den. a day |
| Mortar | 1 | | Crafts sold | small margin |

### 4.11 Pacing and discovery

| Main-quest point | What opens |
|---|---|
| Before mq-01 is done (the opening night) | Nothing that offers. Keepers are at their posts (the bakers before dawn) but no hooks, boards, Fur! or jobs (STORY rule 2). |
| mq-01 done, mq-02 running (11 May, by day) | Shops and services, baths, boards and rumours, porter and bread-round jobs, Hilara, the Bronze Pot, Forged Tokens. Gratus's "after sunset" is the big window. |
| mq-02 done (dusk) | The salutatio letter job (next dawn), the Bath Thief (next bathing hour), dice at night. |
| mq-03 done (the Lemuria night is over) | Night beats in the Velabrum allowed; Free by the God's Hand. |
| lud-01 done | Daily practice bout, Hermippus's mortar. |
| mq-04 done (the date runs from 13 May) | Mercury's Water (15 May); the city carries the player until mq-05. |

**Discovery runs through three channels, in this order:** someone says it (a keeper, a citizen's news, the crier); a painted notice (four boards); the journal once the player takes the offer. There is no map spam.

- No board shows more than 2 hooks a day.
- Nothing has a hard time limit before mq-05, except the dated festival, which is offered again.
- A missed offer keeps coming back as a rumour.

---

## 5. Workstreams

### 5.1 Crews (2 Opus, 5 Sonnet, 1 Haiku; an Opus reviewer at gate 3)

| Crew | Model | Size | Owns: creates or edits, nothing else |
|---|---|---|---|
| **A. LIFE-CORE** | Opus | L | `src/life/{types,registry,install,gates,effects,keepers,cards,talk,rumours,console}.ts`, `src/life/data/_examples.ts`, `tests/life-data.test.ts`, `tests/life-core.test.ts`, `docs/modules/life.md`, and every shared file in §3.5 |
| **B. SHOPS** | Sonnet | M | `src/life/data/keepers/{circus,velabrum,forum,subura,argiletum,river,market}.ts`, `src/rpg/data/vendors-life.ts` |
| **C. SERVICES** | Sonnet | M | `src/life/data/keepers/services.ts` (bath attendants, doorkeeper and his station), `src/life/data/services/vendors.ts`, `src/life/data/activities/{baths,fountains,boards,pallet}.ts`, `src/rpg/data/conditions-life.ts`, edits to `src/dialogue/content/vendors.ts` (one `lifeChoices` spread per vendor, and Cerdo's news reading 'cry' picks), `src/content/containers.ts` (the chest) |
| **D. CRAFT and GAMES** | Sonnet | M | `src/life/craft/*`, `src/life/wager/*`, `src/life/data/recipes/*.ts`, `src/life/data/wagers/*.ts`, `src/life/data/keepers/games.ts`, `src/life/data/services/benches.ts` (Demetrius, Hermippus), `tests/life-craft.test.ts`, `tests/life-tali.test.ts`, `tests/life-economy.test.ts` |
| **E. JOBS and LUDUS** | Opus | M/L | `src/life/jobs/*`, `src/quests/content/job-*.ts`, `src/life/data/keepers/jobs.ts`, `src/dialogue/content/jobs.ts`, edits to `src/dialogue/content/ludus.ts` (Asiaticus's offer; `lifeChoices` for Hermippus) and `src/npc/vignettes/street.ts` (thief, hawker), `tests/life-jobs.test.ts`. Must not change lud-01's behaviour. |
| **F. QUESTS I** | Sonnet | M | `src/quests/content/misc-{hilara,urna-aenea,fur-balnearius}.ts`, `src/dialogue/content/misc-life-f.ts`, `src/npc/content/misc-life-f.ts`, `src/life/data/keepers/quests-f.ts`, `src/life/data/rumours/quests-f.ts` |
| **G. QUESTS II** | Sonnet | M | `src/quests/content/misc-{tesserae-falsae,mercuralia,servus-aesculapii}.ts`, `src/dialogue/content/misc-life-g.ts`, `src/npc/content/misc-life-g.ts`, `src/life/data/keepers/quests-g.ts`, `src/life/data/rumours/quests-g.ts` |
| **H. CITY VOICE** | Haiku (two runs: rumours, then items) | S | `src/life/data/rumours/{city,districts,cries,notices}.ts`, `src/rpg/data/items/life.ts` (calda, linteum, lucerna, tabula-cerata, oleum, amphora-olei, clavis-pergulae, job baskets) |

Quest items that belong to one quest are exported by that quest module (`items`), not by H.

### 5.2 Order and dependencies

1. **Gate 0 (A, first 2–3 hours).**
   - What it lands: `types.ts`, `registry.ts` with `validateLife`, `_examples.ts` (one of each type, including an example keeper on `st-subura-vinarius`), the validator test, and `docs/modules/life.md` with worked examples.
   - Then: it is merged to the phase-2 branch, and every crew branches from it.
   - Unblocks: B, C, D, F, G and H start writing data and quests at once, and the validator catches mistakes. E can start `defineJob` at once.
2. **Gate 1 (A, about day 1).**
   - What it lands: the runtime. That is keepers on stations, shut and dead posts, cards, effects, gates, the rumour pool and its feeds, the save, and the console. It also covers the shared edits in §3.5.
   - Unblocks: from here B, C and D test in the game.
3. **Gate 2 (content).** A merges in this order: H, then B, C, D, then E, then F, then G. The validator must be clean after each merge.
   - C's boards need H's notices.
   - Delivery steps in E's jobs need B's and C's keepers.
   - Crispina (F) is optional for G. G checks `game.npcs.has('keeper-subura-receptatrix')`.
4. **Gate 3 (A plus an Opus reviewer).** Run the full acceptance list, the perf survey before and after, and a 30-minute soak. Then hand over to phase 3, the second perf pass.

### 5.3 Rules for every crew (definition of done)

- Stay inside your files. List any shared-file request in your report, and A does it.
- `npm run typecheck && npm test` are clean, including `validateLife` and the history lint.
- No new key bindings. Every action is E or a choice in the panel.
- Visual work is checked with `node scripts/shot.mjs`, and the PNGs are read with the Read tool and saved under `.shots/life/<crew>/`.
- The report lists: the shot commands used, ids added, flags set or read, and anything left undone.
- Journal lines are in the first person, past tense. Real people never speak. Nothing comes from after AD 113.

### 5.4 Acceptance criteria (verifiable with scripts or screenshots)

The shot pattern used below:

```
node scripts/shot.mjs --query "at=<landmark>&hour=<h>" --steps '[{"eval":"game.console.exec(\"life goto <id>\")"},{"wait":2500},{"eval":"<check>"},{"shot":"life/<crew>/<name>.png"}]'
```

**A. LIFE-CORE**
1. `npm test` passes. The broken fixture makes `validateLife` report each planted error.
2. At h7 the example keeper is at its post, `game.life.isOpen(id) === true`, and Talk, then "Show me your wares", opens the barter panel with stock (`game.barter.merchant(id).stock.length > 0`). Screenshot.
3. At h21 the shutters are visible and the counter prompt reads "Closed · opens at …". After `kill` on the keeper, the prompt reads "Closed. The keeper is dead." and stays that way after a save and load.
4. `game.life.open('act.example.card')` opens the panel. Digit1 applies the option: compare money and time before and after.
5. `game.life.rumours({ board: 'board-subura' }, 4)` is identical before and after a save and load on the same day, and different the next day. Before mq-01 is done, no pick has a `hook`.
6. `npm run check:controls` passes. The `?part=` story checkpoints show no change in the opening.

**B. SHOPS**
1. All 19 keepers are reachable with `life goto`. One screenshot per district at an open hour shows the keeper and the dressing, and three barter-panel screenshots show stock.
2. At night, three shuttered posts are shown in screenshots, with the right "opens at" line.
3. Market day: advance with `game.time.advanceHours(24*k)` to the next nundinae. Four extra stalls and banners appear at the Forum Boarium (screenshot), a market-day stall's buy price is 10% lower (eval), and the HUD date reads "· Nundinae".

**C. SERVICES**
1. Baths of Titus at h8: "Bathe" sets `game.standing.cleanliness === 'lautus'`, adds 1 game hour and costs 1/64 den. At h7 the attendant refuses and nothing is charged.
2. Set `sordidus` by eval, then E at a fountain: cleanliness returns to `normal`.
3. Tryphon's haircut costs 2 as and applies `tonsus`. With `hilara-returned` set, it is free.
4. Salutatio at h1 in a toga gives +25 as. A second try the same day is refused. Without a toga the choice is disabled with its reason.
5. Each of the four boards opens a card with 2 to 4 notices (four screenshots).
6. The pallet: rent it, sleep and get `bene-quietus`. An item put in the chest is still there after a save and load.
7. Arruns: 1 den. gives an omen line and, on a good omen, the `omen-faustum` condition. It can be used once a day.

**D. CRAFT and GAMES**
1. Unit tests:
   - Tali scoring: Venus, dog and six all score correctly.
   - Face frequencies over 10,000 throws are within ±1% of 10/40/40/10.
   - The bank stops play when spent.
   - Economy: 30 simulated days of best play stay within the daily caps, and no recipe sells back for more than 2× its inputs at the buying vendor.
2. With mel, salvia and acetum at Demetrius's mortar: 3 poultices, medicina XP goes up, and 30 game minutes pass. The bench card hides nothing: recipes above the player's level show greyed out with their level.
3. Dice at the Subura table at dusk: play until a Venus throw (screenshot of the card mid-game). With a vigil spawned within 18 m: refused.
4. On a games day: buy the programme, place a bet, settle it with `munus next`, then collect from the bookmaker.

**E. JOBS and LUDUS**
1. `defineJob` unit tests: stages are built, the daily cap holds, and the variant chosen is the same for the whole day.
2. Porter: three loads with the player encumbered, then +12 as. A third job the same day is refused. With mq-02 running, `game.quests.tracked === 'mq-02-tabella'` throughout.
3. Bread round: done before h3 it pays. At h3 it fails cleanly with a journal line.
4. Practice bout after lud-01: one bout a day, the purse is paid, and the lud-01 tests are unchanged.
5. Fur!: a forced thief vignette can be caught, and returning the purse gives Fama +1.

**F and G. QUESTS**
1. Each quest has a scripted run, with shot steps or a Vitest event drive, from the offer to every ending. There is a screenshot of each quest's key moment.
2. While the main quest runs, the tracker stays on it.
3. Every quest is offered by a rumour or a notice, and that rumour disappears once the quest has started.
4. Mercury's Water is offered on 11 May and plays out only on 15 May.

**H. CITY VOICE**
1. The data has ≥ 30 talk rumours, ≥ 12 cries and ≥ 20 notices, every hook id exists, and every gate is valid.
2. Screenshots show Cerdo's news reading a cry, and a citizen's news giving a rumour from their district.

### 5.5 Performance budgets (A measures at gate 3)

| Budget | Limit | Checked by |
|---|---|---|
| Draw calls added (worst of the forum, circus and spawn views, looking four ways) | +40 or fewer | `node scripts/perf.mjs --views spawn,forum,circus --size 1512x860 --dpr 2`, before and after |
| Triangles added | +60k or fewer | same |
| Life CPU (`game.profile` entry for the life system) | 0.15 ms mean or less. A 2 Hz tick, no per-frame work, rumours picked once per game hour. | `?debug` overlay |
| Interactables registered by life | 40 or fewer at any place. `position()` does not allocate. | `game.life.status().interactables` |
| People | Keepers replace station members one for one. Market-day stalls add 8 or fewer people per market. The night cap of 25 is unchanged. | Crowd counts in the shot output |
| Runtime materials or geometries | None created. Shutters and banners use `cachedDressing`, and empty instanced meshes are hidden. | Code review |
| Heap | Less than 100 MB growth in a 30-minute soak | `node scripts/soak.mjs --minutes 30` |
| Save | Life section 16 KB or less after 10 game days | eval |
| Boot | `installLife` 5 ms or less; validation only in tests | console timing |

---

## 6. Out of scope for now (and where each item goes)

- **Interiors** for shops, baths and homes. Tabernae were open-fronted, and the baths are a card. Later, with the interiors API.
- **Housing beyond the pallet:** upper-floor flats, a house of your own, rent on the Kalends, eviction.
- **Patron choice, vows, atonement payments (*piaculum*), the home shrine (*lararium*):** a separate RELIGIO track. Z stays without a patron until then.
- **Faction questlines** (vigiles, urban cohorts, the Lavernae, clientela ranks, Mithras, the circus factions).
- **Stealth, pickpocketing, lockpicking, burglary, cheating at dice.**
- **Circus races and race bets.** There are no races in the May window: the next games with races are the Ludi Apollinares, 6–13 July.
- **Fighting in the real munus, beast hunts (*venatio*), seats in the cavea.**
- **Fast travel, litters, boats, followers, mounts:** these belong to NAV and later phases.
- **Dropped items in the world.**
- **Price drift, supply and demand, trade routes, loans, banking and investments.** Hermogenes is protected until mq-06.
- **General crafting** (smithing, cooking, tailoring), foraging, the crafting perks.
- **Hunger and needs; the courts and advocacy; latrunculi.**
- **Successors for dead keepers.**
- **The Argei (14 May) scene, and the 30 other GDD misc seeds.**
- **mq-05 and the conspiracy board:** the main-quest crew.
- **Minimap pips for offers:** after NAV lands.
- **Anything outside the playable core:** the Emporium, the Saepta Julia, the Macellum Liviae.

---

## Appendix A. History and story guardrails found while reading

1. **The salutatio station is at Pliny's house.** `st-esquiline-salutatio` puts clients at `domus-plinii`. The atlas says that house is shut up while Pliny governs Bithynia, and that he must never appear as a living NPC in Rome. The game's own rumour says so too. Fix: A removes the station, and C adds the fictional patron's door on the Velia.
2. **"Thermopolium" is the wrong word for AD 113.** In 113 the word is *popina* (`docs/research/society.md` §3.3). The Subura keeper's title says "Popina", and the station label is replaced by the keeper's name.
3. **There are two Tryphons.** The barber `npc-tryphon` is in the Basilica Paulli. Tryphon the bookseller, whose back room hides Gemellus in mq-03, is in the Vicus Tuscus. The Hilara notice points to the barber. No new content uses "Tryphon's shop" without saying which one.
4. **The Pepper Warehouses are a main-quest lead.** The spice dealer trades and makes small talk only. The lint enforces this.
5. **Euhodus and Hermogenes are protected (`coniuratio-masked`).** Euhodus gets only the repair choice. Hermogenes gets nothing.
6. **Baths.** They open at the eighth hour and cost a quadrans. Mixed bathing was banned only later, by Hadrian, so phase 2 does not invent a separation rule.
7. **Gaming** was illegal outside the Saturnalia and tolerated, so the tables avoid the watch.
8. **Real people are seen and never speak** (STORY rule 5). Pliny, Martial, Trajan and Plotina are never speakers, and the senator patron is fictional.

## Appendix B. Questions for the owner (defaults chosen; phase 2 proceeds with these)

*2026-10-10: the defaults below were put to the owner and phase 2 started with them; the owner may still overrule any of them.*

1. **Dice for in-game coins**, pure luck under Augustus's own rules. *Default: include.* It can be removed by deleting one data file.
2. **Shopkeepers can be killed, and their shop then shuts for good.** *Default: yes, consequences stick.* Alternative: make them unkillable.
3. **The salutatio needs a toga or stola.** A non-citizen origin wearing a toga commits usurpation (*usurpatio*), as the game's crime rules already say. *Default: keep the rule.*