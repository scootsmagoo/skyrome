# RPG module: rules, quests, dialogue, places and saving

This module is the rulebook of Skyrome and the machinery that runs stories. It covers skills
that rise by use, levels and perks, health/stamina/pietas, items and inventory, combat math,
crime and bounty, barter, factions, the gods, quests, dialogue, named places and saved games.
It draws nothing on screen. Other modules (combat, AI, UI, world) call it and listen to its
events. Every number comes from `docs/GDD.md` (v1.1) and lives in data files, so playtesting
can retune it without code changes.

- Code: `src/rpg/` (rules), `src/quests/` (quest engine), `src/dialogue/` (dialogue engine),
  `src/npc/registry.ts`, `src/world/locations.ts`, `src/save/`
- Dev scene: `src/scenes/rpg.ts`, opened with `?scene=rpg`
- Tests: `tests/rpg-*.test.ts`, `tests/quest-system.test.ts`, `tests/dialogue-system.test.ts`, `tests/save-system.test.ts` (246 tests)
- Third-party assets or libraries: none

## How to try it (for the owner)

1. Run `npm run dev` and open <http://127.0.0.1:5173/?scene=rpg>. You start as a Veteran of Dacia in a corner of the Forum.
2. The card at the top left is your character: level, the three bars, purse, burden, best skills, status, and chips for anything affecting you (blessings, wine, fever).
3. Walk to the little painted shrine on the left and press **E** to pray: +5 Pietas and the Favor of the Lares. Press E at the altar of Mars to offer a denarius for the Blessing of Mars.
4. Talk to the scribe by the Rostra (**E**, then **1–9** to choose). Asking for money in advance shows a Rhetoric check and its odds. Accept and take the letter across the Forum to the banker; the journal at the top right tracks it, with a pointer.
5. The **Dev actions** panel tries the rest: quicksave/quickload (F5/F9), reading the sealed letter (it changes the banker's lines), Falernian wine, catching a fever, stealing (a bounty), paying the fine, taking Mars as patron and invoking him.

## File map (GDD Appendix A)

| Data | File |
|---|---|
| Tuning constants (pools, curves, combat, stamina, poise, difficulty, crime, persuasion, barter, devotion, saving, XP, trainers) | `src/rpg/data/tuning.ts` |
| Skills / perks / origins | `src/rpg/data/skills.ts`, `perks.ts`, `origins.ts` |
| Items (weapons, armor and shields, clothing, consumables, misc, books) | `src/rpg/data/items/*.ts` (`ITEMS` from `items/index.ts`) |
| Loot tables | `src/rpg/data/loot.ts` |
| Enemy tiers, beasts, natural weapons, §13.1 archetypes | `src/rpg/data/combatants.ts` |
| Factions and Fama tracks | `src/rpg/data/factions.ts` |
| Blessings and patron deities | `src/rpg/data/religio.ts` |
| Conditions (injuries, poisons, states, diseases, omens) | `src/rpg/data/conditions.ts` |
| Crimes and ledgers | `src/rpg/data/crimes.ts` |
| Vendor kinds (§7.3) | `src/rpg/data/vendors.ts` |

Runtime: `sheet.ts` (CharacterSheet), `vitals.ts`, `inventory.ts`, `items.ts`, `combat-math.ts`,
`enemies.ts`, `loot.ts`, `checks.ts` (skill checks and persuasion), `barter.ts`, `crime.ts`,
`factions.ts`, `standing.ts`, `devotion.ts`, `arena.ts`, `rest.ts`, `thievery.ts`, `yield.ts`,
`money.ts`, `events.ts`, `install.ts`.

## Wiring it in

```ts
import { installRpg } from './rpg/install';
const rpg = installRpg(game, { background: 'veteranus', sex: 'male', extra: 'denarii', systems: ['stealth', 'bleeding'] });
```

`installRpg` (after `setupPlayer`) creates every service, puts them on `game` (`game.items`, `game.npcs`,
`game.locations`, `game.factions`, `game.standing`, `game.devotion`, `game.crime`, `game.barter`,
`game.quests`, `game.dialogue`, `game.save`, `game.deltas`) and `game.rpg`, attaches
`player.sheet` and `player.inventory`, adds the `rpg`, `locations` and `save` systems, and starts a
new game. Options: `background` (origin id), `sex`, `extra` (`'parmula' | 'denarii'`), `examples`
(load the `_example` quest/dialogue), `storage`, `newGame`, `systems` (the game systems that have
shipped; perks tagged with any other `requiresSystem` are hidden, §5.5; omit it for "everything").
The tags are listed in `PERK_SYSTEMS` (stealth, bleeding, lockpicking, pickpocketing, crafting, bow,
racing, vows, omens and so on).

`rpg.hooks` holds three functions the calendar module replaces: `templesClosed()` (the Lemuria:
no temple blessings, vows or patron choice; compitum shrines stay open), `festivalDiscount()`
(the Mercuralia 0.10) and `vowMult()` (the Ludi Augustales ×1.5).

Wired automatically: sprint stamina (8/s) and the "exhausted until 15" rule through
`PlayerController.canSprint/speedMultiplier`; heavy-armor penalties by the body piece; hourly
checks (bounty lapse, overdue vows, Infamia recovery); vows ending with their quests; pending
faction promotions on skill-ups; the gladiator's oath costing Infamia; cleanliness as a
condition; autosaves on quest stages.

## Rules at a glance

**Progression (§5).** Skills start at 10 (+10/+5/+5 by origin). `xpToNext(L) = round(difficulty ×
(L + 5)^1.5)` (L10 58, L50 408); each skill level gives character XP equal to the new level;
`charXpToNext(n) = 25 × (n + 2)`. A level gives +10 to a chosen pool (stamina also +5 kg carry)
and a perk point; each skill level adds +0.2 to its governing pool. XP per use is in `XP`
(tuning). Trainers: `round(0.15 L² + 10)` den., 5 lessons a level, caps 40/70/90. Books: +1 level
once (Greek books +50% for the Alexandrian). `reward.skillXp` gives one level's worth.

**Perks (§5.5).** 68, four per skill; every first perk needs 15. A taken perk's id is a sheet flag.
`requiresSystem` hides perks whose system hasn't shipped (`sheet.shippedSystems`,
`availablePerkDefs()`, blocker `'unavailable'`).

**Pools (§3.3).** Health 100 (0.5/s, never while `vitals.inCombat`), stamina 100 (20/s after
0.8 s, half while blocking), pietas 50 starting at 25 (never regenerates). Carry 50 kg; over it you
walk at 1.9/4.4.

**Combat math (§6, `combat-math.ts`).** `computeAttack(stats, weapon, opts)` returns raw damage,
type, poise, stamina cost, bleed chance, block-ignore, crit and interval; `resolveHit({ attack,
armor, family, defender, block, mult })` applies type vs family, armor and the block.
- raw = W × condition(0.75 + 0.25c) × (1 + skill/200) × (1 + damage.class) × attackMult × sneak × crit × (player: dealt | NPC: dmgMult × taken).
- Attack types per weapon (§6.2): the gladius thrusts/cuts/thrusts (13/11), its overhead and sweeps cut, its lunge thrusts (`attackTypeFor`).
- Power = chargeMult (1.5 → 2.0 over 0.35–0.8 s) × dirFactor (overhead and lunge 1, sweep 0.7, back 0.65); overhead +50% poise.
- AR = Σ pieces × condition × (1 + armorSkill/250) × (1 + armor.class); reduction AR/(AR+120), max 60%; at least 1 damage.
- The outermost torso piece (body, else padding) sets the family; the body piece's class sets heavy-armor penalties and the armor skill.
- Block = base + (0.95 − base) × Shield/200, cap 0.90 (scutum 0.85 → 0.90); stamina max(4, 0.6 × raw × (1 − Shield/200)); Shield Wall −30% stamina per ally; parry windows by difficulty.
- Poise: flinch ≥ 20% of max (player 35%), 0.4 s flinch immunity; a break staggers 0.8/1.5 s and refills, then 1.5 s of immunity; at most 2 staggers in 4 s; a riposte opens no new window.
- Difficulty: tiro / facilis / normalis / difficilis / herculea (`DIFFICULTY_V01` = the three v0.1 levels).
- `fallDamage(h)`, `missioChance`, `addFavor`, `arenaPurse`, `isPracticeWeapon` (lusio: practice arms never kill).

The GDD's lethality checks are pinned by tests: an iron gladius at Blades 25 does 14.6; a thug in a
tunic takes 4 thrusts (3 Noric); an urban soldier (AR 50) 10 thrusts and 9 clava blows; a sicarius
kills a player in a tunic in 5 hits, in mail and helmet in 10.

**Time to kill** (Normalis, light attacks landing every swing; the builds are in `tests/rpg-ttk.ts`;
print it with `PRINT_TTK=1 npx vitest run tests/rpg-combat.test.ts -t "TTK table"`):

| Player | Enemy (weapon) | Enemy HP / AR | Player hit | Hits | Seconds | Enemy hit | Hits to kill player | Seconds |
|---|---|---|---|---|---|---|---|---|
| L1 (AR 15) | thug (fustis) | 45 / 0 | 14.0 | 4 | 2.7 | 12.9 | 8 | 5.1 |
| L1 (AR 15) | thug (pugio) | 45 / 2 | 13.7 | 4 | 2.7 | 10.3 | 10 | 5.2 |
| L1 (AR 15) | bruiser (clava) | 75 / 10 | 11.6 | 7 | 4.7 | 19.5 | 6 | 4.5 |
| L1 (AR 15) | miles (gladius) | 70 / 50 | 7.4 | 10 | 6.7 | 20.4 | 5 | 3.4 |
| L1 (AR 15) | veteran (sica) | 95 / 20 | 12.0 | 8 | 5.4 | 21.1 | 5 | 2.9 |
| L10 (AR 48) | thug (fustis) | 45 / 0 | 17.9 | 3 | 2.0 | 8.8 | 18 | 11.5 |
| L10 (AR 48) | miles (gladius) | 70 / 50 | 11.9 | 6 | 4.0 | 13.9 | 11 | 7.4 |
| L10 (AR 48) | veteran (gladius-noric) | 95 / 55 | 11.5 | 9 | 6.0 | 19.6 | 8 | 5.4 |
| L10 (AR 48) | champion (gladius-bilbilis) | 140 / 60 | 11.2 | 13 | 8.7 | 27.0 | 6 | 4.0 |
| L10 (AR 48) | elite (gladius-noric) | 120 / 55 | 13.1 | 10 | 6.7 | 23.9 | 7 | 4.7 |
| L30 (AR 94) | thug (fustis) | 45 / 0 | 23.7 | 2 | 1.3 | 6.5 | 39 | 24.9 |
| L30 (AR 94) | miles (gladius) | 70 / 50 | 15.7 | 5 | 3.4 | 9.6 | 26 | 17.4 |
| L30 (AR 94) | champion (gladius-bilbilis) | 140 / 60 | 14.8 | 10 | 6.7 | 18.7 | 14 | 9.4 |
| L30 (AR 94) | elite (gladius-noric) | 120 / 55 | 17.2 | 7 | 4.7 | 16.5 | 16 | 10.7 |
| L30 (AR 94) | boss (falx) | 500 / 55 | 14.6 | 35 | 23.5 | 19.8 | 13 | 12.4 |

**Enemies (§6.11, §13.1).** `combatProfileFor(tier, { kit, health, armor })` builds a
`CombatProfile` with the GDD fields (`band`, `dmgMult`, `poise`, `reactionS`, `speedMult`,
`tokensCost`, `armorFamily`, …); `archetypeProfile('miles-urbanus' | 'thraex' | …, items, { tier,
kit })` adds the archetype's weapon, shield, ranged backup, worn pieces (AR from them), poison and
companion. `profileStats`/`profileWeapon` feed `computeAttack`. `rollLoot(tableId, level, rng)` rolls
the §6.14 tables.

**Items and inventory (§8).** Stable kebab-case ids, quality variants (`-noric`, `-bilbilis`,
`-silvered`), uniques, practice arms (`rudis`, `tridens-lusorius`). Layered slots: `under`,
`padding`, `body`, `cloak`, `legs`, `shins`, `arm`, `head`, `feet`, `neck`, `finger`, `mainHand`,
`offHand`, `ammo`. Stacks by stolen owner and condition; two-handed rules; coins become denarii;
quest items weigh nothing and can't be dropped; wear 1% per 100 damage; `use` for food, remedies
(potion, bandage and food strength) and books; equip modifiers and flags (`dress.toga`,
`dress.stola`, `dress.palla`, `amulet`, `hooded`…).

**Economy (§7).** Money is denarii quantized to the quadrans (`formatDenarii`, HS style).
`BarterSystem`: prices with every modifier inside the clamps (Σbuy, Σsell), so a sale never
beats 0.86 × the buy price; disposition from Fama/10, traits and dialogue; market days, street-wise,
Bilbilis, festivals; haggling once a day by vendor grade; fences; purses restock every 2 days;
Trade XP with same-day diminishing returns; repairs at the arms dealer or smith; Faenus Nauticum
cargo loans rolled at investment time.

**Society.** `Standing`: legal status, Dignitas, Infamia (recovers 1 per 10 quiet days, floor 10
once branded), district Fama, cleanliness, sex, debt. `FactionSystem`: ranks granted by quests
(`promote`, `grantRank`, `reward.rank`) with skill gates that make a promotion wait; Fama ±100
per faction; citizens-only, non-citizen caps, exclusive colors, oath Infamia. `CrimeSystem`
(§14.1): city and Palatine ledgers, the GDD bounty table, unidentified crimes raising district
alerts, pay/persuade/bribe/Carcer/asylum/flee/resist, ad ludum and the eques' fine, lapse,
evidence chest, status crimes (`statusCrimeFor`). `resolveYield` applies spare/rob/arrest/kill.

**Persuasion (§14.5, `checks.ts`).** p = clamp(0.05, 0.95, 0.50 + (skill + mods − DC)/100); DC tiers
10/25/40/55/70/85. Mods: disposition, 5 × Dignitas steps, formal dress by sex (toga, or stola +
palla), cleanliness, Fama/10, Infamia. Approaches: persuade, intimidate (+10 per band), bribe (DC ×
0.5 × status; refused by `incorruptible`), invoke patron (+15/+30). A failure locks the approach with
that NPC for 24 game hours. Pickpocketing and lock widths: `thievery.ts`.

**The gods (§14.6, `devotion.ts`).** Compitum prayer +5 once per shrine per day and the Lares favor;
temple prayer with an offering +10 and the temple's blessing (one temple blessing at a time);
lararium +15 (perk: full); festivals +25; impiety losses with an `impietas` debt; 12 patrons with
passives and invocations (Invictus once a day); vows scaled by stake; piaculum; daily omens with
Augur's Eye; curse tablets through belief.

**Rest (§14.8).** `sleep`, `wait`, `bathe`, `washAtFountain`, `fastTravelBlocker`.

## Quests (`src/quests/`)

Quests are modules in `src/quests/content/*.ts` (found by `import.meta.glob`; `_`-prefixed files
are examples) exporting `default defineQuest({...})`, and optionally `items`, `locations` and `npcs`
that `installRpg` registers. A quest has `stages` (journal text, objectives with optional counts,
`hidden`, `optional`, marker targets, `onEnter`, `end`, auto-`next`), `triggers` (handlers that may
start it), `on` (handlers while it runs; any GameEvent), `rewards` (denarii, items, XP, skill XP,
`skillXp` levels, reputation, `rank`), `autoStart`, `listenBeforeStart`, `repeatable`. Handlers get a
`QuestContext` (`start`, `setStage`, `progress`, `completeObjective`, `reveal`, `complete`, `fail`,
`giveReward`, `vars`, flags, other quests' state). `game.quests` exposes `status`, `objectives`,
`markers()` (with `registerResolver(kind, fn)` for NPC positions), `track`, `list()` for the journal,
and save/restore. `src/quests/content/_example.ts` is a complete example ("The Scribe's Letter").

## Dialogue (`src/dialogue/`)

Dialogues are modules in `src/dialogue/content/*.ts` exporting `defineDialogue({ id, npcs, start,
nodes, priority })`. Nodes have text (string or function), choices with `if`, `enabled`, `goto`,
`check` (skill, DC, approach, audience), `bribe` (amount or DC-priced), `once`, `effects`, `end`.
`game.dialogue.start(npcId)` returns a UI view `{ npcId, speakerName, text, choices: [{ text,
enabled, tag, kind }], canContinue, willEnd }`; then `choose(i)`, `advance()`, `end()`. Per-NPC memory
and `once` choices are saved; flags are shared with quests. Quests react to `dialogue:node`.

## Places and NPCs

`LocationRegistry` (`game.locations`) checks the player's position four times a second and emits
`location:entered` / `location:exited` / `location:discovered`; it answers `current()`, `nearest()`,
`containing()`. `NpcRegistry` (`game.npcs`) looks NPC definitions up by id, faction, tag, service and
home. NPC tags the rules read: `vendor:<kind>` (§7.3), audience tags (`elite`, `official`,
`soldier`, `plebs`, `subura`, `underworld`, `arena-fan`), `dignitas:<step>`, `incorruptible`,
`baetican`, `dacian`, `isiac`, `pious`, `xenophobe`; `combat.band` for intimidation.

## Saving (`src/save/`, §14.13)

A save file is `{ format, saveVersion, generatorVersion, worldSeed, gameTime, meta, data }`, where
`data` holds every registered section: `sheet`, `inventory`, `player` (position), `standing`,
`devotion` (the player), `quests` (quest states), `factions` (faction states), `entityDeltas`
(world deltas), `crime`, `barter`, `dialogue`, `locations`, `time`. Slots: 10 manual
(`saveNew`, `manualSlots`), 3 rotating autosaves, 1 quicksave (input actions `quickSave` /
`quickLoad`). Saving is blocked in combat, in dialogue and while falling (`addBlocker` adds more).
Autosaves fire on quest stages (at most every 120 s, deferred until saving is allowed), every 10
real minutes, and on `save:request` (emit it for sleep/wait and interior changes). Storage is
IndexedDB with a localStorage fallback, every access in try/catch, and `navigator.storage.persist()`
is requested. `exportSave` / `importSave` / `downloadSave` / `importFile` move JSON files.
Migrations are pure functions (`migrateV1toV2`, `registerMigration`) with fixtures in the tests.
`game.deltas` keeps world deltas by stable id (`proceduralId(worldspace, cx, cz, generator, index)`);
killed actors are recorded automatically.

## Events

Emitted: `rpg:notify` (HUD toasts: "+5 Pietas", "Crime witnessed: furtum (bounty 12 den.)"),
`skill:levelup`, `player:levelup`, `player:levelChoice`, `perk:taken`, `effect:added/expired`,
`item:added/removed/equipped/unequipped/used`, `book:read`, `denarii:changed`,
`faction:joined/left/rank/reputation`, `crime:committed/bounty/cleared/jailed/resist/sentenced`,
`barter:trade`, `devotion:patron/invoked/act`, `standing:changed/cleanliness`,
`quest:started/stage/objective/completed/failed`, `quest:tracked`, `dialogue:started/node/ended/check/service/attack`,
`location:entered/exited/discovered`, `flag:changed`, `save:saved/loaded/error`, `delta:changed`.
Listened to: `actor:killed`, `actor:yielded` (quests), `time:hour`, `save:request`.

## Integration notes for other modules

- **Combat:** call `computeAttack` / `resolveHit` with `player.sheet` as stats and `difficultyMult`;
  apply `inventory.wear(slot, damage)`; on a bleed roll apply `sheet.applyCondition('cruentus')`
  (the old id `cruor` is gone); track poise with `createPoise`/`applyPoiseDamage`/`tickPoise`; set
  `sheet.vitals.inCombat` from the §6 predicate and `vitals.blocking` while guarding; award XP with
  `sheet.useSkill(skill, XP.blades.light)` etc.; use `resolveYield` for spare/rob/arrest/kill and
  `arena.ts` for favor and missio.
- **AI / spawners:** build profiles with `combatProfileFor` or `archetypeProfile`; read
  `tokensCost`, `reactionS`, `speedMult`, `attackIntervalS`, `armorFamily`; roll loot with `rollLoot`.
- **UI:** read `game.rpg` services; show `rpg:notify`; journal from `quests.list()`; dialogue from
  `dialogue.onChange`; arrest dialogue from `crime.arrestOptions(ledger, guard)`.
- **Calendar:** replace `rpg.hooks.templesClosed`, `festivalDiscount` and `vowMult`.
- **World:** emit `save:request` on interior changes; record deltas in `game.deltas`.

## Not done yet, and where this differs from the GDD

- Stealth suspicion (§14.2), witnesses and NPC schedules belong to the AI/stealth module; crime
  takes `witnessed` / `identified` from it. Danger bands (§13.3) belong to the world/spawner.
- The GDD's "14 cuts" against the urban soldier assumes 13 damage; with the gladius cut at 11 the
  formula gives 17 (the test pins "at least 14").
- Diseases other than `febris` (lippitudo, scabies, tussis) and a few items are marked "Extra".
- Which systems v0.1 ships is the integrator's call: pass `systems` to `installRpg` to hide the perks of the rest.
- The Mercury temple id `temple-mercury` isn't in the atlas yet.
