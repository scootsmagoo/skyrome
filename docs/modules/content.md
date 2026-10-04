# Content module: quests, people, dialogue, items, texts and the golden path

The words and the people of the first playable (v0.0 to v0.1): seven quests played stage by stage,
seventy-odd named Romans with schedules and something to say, their conversations, the things you can
read, pray at, search and trade for, and the dawn shift that makes the walk from the Porta Capena to the
Forum something other than empty ground. Everything follows `docs/CONTENT.md` (the content bible); where
it differs, this file says so.

- Code: `src/quests/content/` (quests), `src/dialogue/content/` (conversations), `src/npc/content/` (NpcDefs),
  `src/content/` (places, hours, route, barks, vignettes, texts, containers, shrines, lamps, the installer
  and the service layer), `src/rpg/data/items/content.ts`, `quest.ts` and `loot.ts` (the bible's items and loot)
- Tests: `tests/content.test.ts` (validity, the corridor), `tests/content-quests.test.ts` (a scripted
  playthrough of every quest), `tests/content-install.test.ts`, `tests/content-services.test.ts`
- Third-party assets or libraries: none (every text is original, the bible labels all of them invented [G])

## How to try it (for the owner)

1. `npm run dev`, open <http://127.0.0.1:5173/?scene=rome>, choose **New Game**.
2. You stand outside the Porta Capena at 04:30 by a cart with lamps on it. Two seconds after you get control the
   courier Festus starts talking (Tab leaves). Walk on to the gate: the fight, the dying courier, the tablet.
3. Walk up the valley. The street is no longer empty: a beggar who held the line at Tapae, a vigil with a lantern, a
   street sweeper, a charcoal seller, a lamp seller, a carter with a wheel off, the shrine attendant, a mime, a fig
   seller, the fans of the Greens and the Blues chalking the Circus wall, a schoolmaster with three boys, an augur on
   the slope, goat-milk and water sellers, then the Velabrum and the Vicus Tuscus. **E** talks to any of them.
4. Things to look at and do on the way: **E** at a crossroads shrine prays (+5 Pietas, the Lares favor); **E** at a
   scratched wall or a painted board reads it; **E** at a slab, a crack in a wall, a bundle, a basket or a coin in a
   basin searches it (66 of them; the owned ones are theft if somebody sees). Lamps glow along the whole way until dawn.
5. At the Silver Pig (Chreste), the arms dealer (Euhodus) and the Temple of Castor (Philetus) "Show me your wares"
   opens the trading panel. The teachers (Glaucus, Nereus, Asiaticus, Hermippus, Zethus, Philetus) give lessons.
6. The rest of the day: Castor's doors are shut for the Lemuria, the strongrooms are not; the Ludus Magnus
   (three practice bouts, Nereus); the brawl at the Meta Sudans on the way back; the tablet at dusk: "Tomorrow, the Column."

Dev switches: `?scene=rome&quick=1` (no menus), `&hour=5.5`, `&at=<landmark id>`; `game.content` (counts),
`game.quests.list()`, `game.dialogue.start('npc-…')`.

## File map

| What | Where |
|---|---|
| Quests (`defineQuest`) | `src/quests/content/` `mq-01-madida-capena`, `mq-02-tabella`, `lud-01-sacramentum`, `misc-meta-sudans-rixa`, `misc-lemuria-fabae`, `misc-insula-nutans`, `misc-venus-cloacina`; `places.ts` exports the places |
| Dialogue (`defineDialogue`) | `src/dialogue/content/` `main-quest`, `ludus`, `misc-quests`, `vendors`, `romans`, `street`, `citizens` (72 dialogues, 375 nodes, 25 Rhetoric checks) |
| NpcDefs | `src/npc/content/` `main-quest`, `ludus`, `misc-quests`, `vendors`, `romans`, `historical`, `law`, `corridor` (76 NPCs) |
| Places, hours, the golden path | `src/content/places.ts` (landmarks, bible spots, contract spots, street stations), `hours.ts` (Roman hours, `shift()`, `entryAt()`), `route.ts` (`onPath(d, side)`) |
| Conversation kit | `src/content/people.ts` (`person()`: greeting, topics, news, trade, one Rhetoric check) and `talk.ts` (quest conditions, rumors) |
| Quest helpers | `src/content/director.ts` (spawn, fight, examine points, scripted deaths, moving actors), `questkit.ts`, `profiles.ts` (stat blocks of Mus, Pullus, Auctus, Nereus, the Rex, the mq-01 pair) |
| Texts and landmark things | `src/content/texts.ts` (the bible's T1 to T13, 9 more along the walk, the §8.4 signs; `bookViewFor`), `things.ts` (a note, inscription or vista at each of the 54 landmarks of the nine districts) |
| Barks and vignettes | `src/content/barks.ts` (districts, archetypes, festivals, reactions), `vignettes.ts` (28 scenes with casts and lines) |
| In the world | `src/content/install.ts` (`installContent`), `containers.ts`, `shrines.ts`, `lamps.ts`, `services.ts` |
| Items and loot | `src/rpg/data/items/content.ts`, `quest.ts`, `loot.ts` (the bible's §4 and §6) |

`installContent(game)` is found and run by `src/game/optional.ts` (a two-line edit there: one `import.meta.glob`
and one call), after the atlas locations are registered. It places everything below and answers
`'dialogue:service'`. `game.content` reports what it placed.

## The golden path (GDD §17.2)

The corridor from the cart stand to the Forum is 1,266 real metres (760 in the game). `route.ts` holds it as a
line; everything "on the way" is placed by distance and side, so it lands on the street. A test
(`tests/content.test.ts`, "has someone with a name every 70 m") walks it at 05:30, 07:00 and 09:00 and fails if
there is a gap of more than about 130 m without a named person, and a second one checks the dawn shift is out at 04:36.

| d (m) | Station | Who is there |
|---|---|---|
| 0 | cart stand (`capena-extra`) | Festus, Dromo, his cart and mule, a lantern |
| 34 | inside the gate (`capena-intus`) | Capito, the old soldier |
| 60 | gate post (`capena-statio`) | Valens (urban cohort, day), Crescens (vigil, night) |
| 79 | `compitum-capenae` | Aufidia and her boy, the Lares altar, a honey cake for the shrine |
| 110, 150, 200, 255 | sweepers, charcoal, lamps, the broken cart | Gaudens, Mancinus, Epagathus, Cornix |
| 314, 345 | `compitum-circi`, the mime's corner | Trophimus, Latinus |
| 380, 405, 433 | fig stall, sausages, the diviners | Caunea, Niger, Arruns, Zenon |
| 470, 520 | the Circus wall, the street school | Lucrio and Sabellus, Chaerea |
| 560, 660, 720 | water, goat's milk, the augur's post | Sabinus, Dorcas, Postumius (and Severus, the day patrol) |
| 866 to 1000 | the Velabrum and the Vicus Tuscus | Florus, Thallusa, Philadelphus, Prima, Zethus, Hilarus (lamp-tender), Mus (hidden) |
| 1081 to 1262 | the Silver Pig, the perfumer, the head of the street, the Forum | Chreste, Fadia, Licinia, Cerdo, Dento, Juvenal, Philetus, Chrysippus, Gratus |

Schedules use **`sleep` for "gone home"**: the population module does not spawn a sleeper, whereas `travel` would
leave the NPC standing at the last place. Gratus stays at the vaults from the first hour to the second watch
(the bible sends him to the camp at the fourth hour) so "ask for Gratus" works whenever the player arrives; Dromo
stays at the cart until the second hour, so he can still be asked what he saw.

## Quests

Journal texts and objectives follow the bible; the scripted playthroughs (`tests/content-quests.test.ts`) drive
each through every stage by emitting what the engines emit ('dialogue:node', 'location:entered', 'actor:killed',
'actor:yielded', 'time:hour') against the real QuestSystem and DialogueSystem.

| Quest | Stages | Notes |
|---|---|---|
| `mq-01-madida-capena` (auto-start) | start, gate, ambush, dying, city, done | the cart conversation opens by itself on a new game; two tutorial thugs (`mq01-grassator-a/b` with the bible's stat block); Festus is knifed at the arch and dies after he gives the tablet (`scriptedDeath`); his body is a "Search" point (6 den. 3 as., pugio, the letter home); the hideout objective is hidden until a flag says it is known; ends at the Forum; reward Fama +5 in the Circus district |
| `mq-02-tabella` | start, loculi, gratus, mus, deliver, done-v01 | Philetus at the shut doors (the Lemuria rule, AC-18), Chrysippus ("there is no Gratus"), Gratus by day and at dusk; the clue "clue-mus" from Auctus, Glaucus or the street; the Mouse fights in the burned taberna or hands over the key; the satchel doubles the pay; "Tomorrow, the Column." |
| `lud-01-sacramentum` | start, kit, bout1, bout2, bout3, missio, done | guest or oath (Infamia +20, a tiro); the armory stores the practice arms whenever you leave the Ludus; bouts start when you tell Asiaticus "Ready"; a lusio injury lasts one game hour; yielding to Nereus rolls the missio (favor); the choice after his yield is made in dialogue (or by `'content:missio'` if combat runs its own prompt); purse 30 den. × (1 + favor/100), half if spared; Hermippus patches you up and tells you to wait for the lamps |
| `misc-meta-sudans-rixa` | start, rixa, after, done, done-peace, done-walked, fail | armed on the way back from the Ludus (between the 11th hour and the second watch); the other side's three brawlers (a bruiser with the caestus and two drunks); blade drawn or a death fails it; yielding costs a tenth of the purse; the watch asks who started it |
| `misc-lemuria-fabae` | start, watch, choice, done | the night of 11 May: the stair after midnight, Thallusa, the lean-to at the compitum, three endings; stealth ships later, so the tail is a matter of time and place |
| `misc-insula-nutans` | start, callistus, aedile, evacuate, done, collapsed, bribed | four "Examine" signs (a smith's eye counts double), Callistus' bribe, Dento (Persuade, Lie, a bribe, or the Fabrica reading), four households warned before the first watch, then the wall falls |
| `misc-venus-cloacina` | start, descend, rex, cache, done | the interior `dun-cloaca-maxima` belongs to the world side; until it exists the delve is staged at the outfall on the Tiber (`cloaca-maxima-outlet`): three cloacarii, then the Rex; the cache is a container |

Flags set (global, saved): `festus-dead`, `mus-has-satchel`, `festus-mentioned-twin`, `festus-family-known`,
`promised-festus`, `clue-curved-blade`, `clue-hooded-fighter`, `clue-mus`, `clue-piperataria`, `mus-fate`,
`gratus-has-drachm`, `mq02-delivered`, `ludus-status`, `lud01-favor`, `nereus-spared`, `hermippus-patched`,
`rixa-side`, `threw-first-punch`, `rixa-outcome`, `fabae`, `florus-feeds-family`, `nutans-bribed`,
`nutans-collapsed`, `nutans-collapse-pending`, `dento-order`, `callistus-fled`, `rex-cloacae-fate`,
`hideout-known`, `circus-leaning`, `lares-explained`. `hideout-known` (the knife-men's burned taberna, which reveals the
hidden objective of mq-01) is set by Chreste's rumour, Primigenius, Hilarus the lamp-tender, the vigiles' night talk and the
citizens' gossip; Capito and Dromo give the "hooded fighter" clue instead.

### Node ids the quests listen to

`npc-festus` cartEnd, d1, dyingEnd · `npc-dromo` sawIt · `npc-philetus` strongrooms, n2 · `npc-chrysippus` fetch ·
`npc-gratus` delivered · `npc-auctus` mus · `npc-mus` surrender (and `'dialogue:attack'`) · `npc-glaucus` n0,
signedGuest, signedOath · `npc-successus` issueScutum, issueParmula, issueOwn · `npc-asiaticus` begin1 to begin3 ·
`npc-nereus` spared, struck · `npc-rixa` sideScutarii, sideParmularii, peace, cupThrown, walked · `npc-rixa-law`
lawFine, lawClear · `npc-fabae` accept, florusLie, florusPersuaded, florusTold · `npc-prima` offerAccept, p-evacuate ·
`npc-callistus` confronted, bribed · `npc-dento` ordered · `npc-nutans-tenants` warned · `npc-ianuarius` accept, d0.
`tests/content.test.ts` checks that every node a quest file names exists in the dialogue it names.

## People and conversation

- **76 named NPCs.** The bible's v0.1 roster (the courier, the carter, Gratus, Chrysippus, the optio, Mus; Juvenal,
  Apollodorus, a Vestal, the senator Vettius, Trajan walking home at the eleventh hour; the Ludus: Glaucus, Celer,
  Hermippus, Successus, Asiaticus, Pullus, Auctus, Nereus; 16 vendors; the quest givers) plus 24 people of my own
  [G]: the dawn shift above, the three other households of the Leaning Insula, the lamp-tender Hilarus and the garland
  seller Licinia. The two grassatores of mq-01 are not NpcDefs (the bible has them unnamed): they are spawned by id.
- Every NPC has `dialogue`, barks and an Appearance (`tests/content.test.ts` checks height, garments, skin, factions,
  ranks, tags, vendor stock and purses against GDD §7.3, trainers, places and schedule order).
- **`person()`** builds the many ordinary conversations: a first greeting, return lines, topics (once or repeatable),
  "what's the news?" (the rumor mill answers by what the player has and has not done), a trade, a deal (figs, a lamp, a
  sausage, a cup of water, a honey cake for the shrine), and sometimes one Rhetoric check. Quest graphs are written by hand.
- **Rhetoric checks (AC)**: persuade, intimidate, lie and a bribe all appear (25 checks in 72 dialogues), including
  Juvenal ("say one good thing about Rome"), Chrysippus, Mus, Callistus, Dento, the Rex, the Silver Pig and the
  citizens at large. Other skills appear too (Athletics for Cornix's wheel).
- The unnamed crowd gets the `'*'` dialogue: rumors (the bible's §8.1 list and the day's open stories), directions to
  the Forum, the Ludus, Castor, the Silver Pig, the Capena Gate and the Meta Sudans, a Rhetoric check for the courier gossip,
  and different lines at night and on the Lemuria.

## In the world (`installContent`)

| What | How |
|---|---|
| Shrines | 13 "Pray" points (the six compita, Vortumnus, Venus Cloacina, Juturna, Vulcan, the Lacus Curtius, Janus, Mercury's spring): `devotion.prayAtCompitum`, +5 Pietas once a day per shrine and the Lares favor, on the Lemuria too; Cloacina purifies, Juturna heals 10 HP and washes |
| Texts | 42 "Read" points open the book reader: T3 to T13 (graffiti, playbill, fire notice, the altar of the Vicus Tuscus, the lost dog, the club's rules, 20 points in all), 9 more along the walk (the gate pier, Mercury's votive tablet, the litter tariff, the Circus chalk, the diviners' boards, two altars, the burned shop's notice, Vortumnus' base) and the §8.4 shop signs; the lampoon on the basilica steps is washed off at sunset |
| Landmark things | 54 "Read" / "Look" points, one in front of the façade of every landmark of the nine v0.1 districts (AC-23): Tiberius' rebuilding of Castor's temple, the beaks of Antium on the Rostra, the Tullianum, the Menorah in Vespasian's Temple of Peace, Trajan's Column, the Circus' two hundred and fifty thousand seats, the bronze bull, the island shaped like a ship… all of them what a Roman of 113 could know |
| Containers | 66 in the street (20+ unowned, owned ones are `furtum` if `population.witnesses` sees you), 13 more indoors waiting for their interiors; loot rolled once with a seed per container and kept in the world deltas; the Mouse's strongbox opens only with his key; the Rex's cache is a container the quest listens for |
| Lamps | 68, flagged `night` so they light at dusk and go out one by one at dawn: the gate, shrines, stations, shops and one every ~45 m of the corridor |
| Carts | when `src/npc/props.ts` exists (the NPC crew's), Dromo's cart and mule stand at the cart stand and Cornix's with a wheel off; their load containers only appear with the cart |
| Services | `services.ts` answers `'dialogue:service'`: **barter** (a BarterView over `game.barter`: stock, purses, §7.4 prices, stolen goods refused unless the merchant fences, whole-deal validation), **train** (§5.1 cost and caps), **repair**, **heal**, **rent** |

New events (declared in `director.ts` and `install.ts`): `content:interact` (an examine point was used),
`content:beat` (a staged beat other modules may act on), `content:missio`, `content:read`, `content:opened`.

## For the other crews

- **Combat**: quests call `game.combat.spawnEnemy(archetype, position, opts)` and, for an NPC already in the world,
  `game.combat.engage(id, opts)`. `opts` = `{ id, npc?, name?, tags?, quest?, hostile?, practice?, brawl?, boss?, yieldAt?,
  profile? }`; `profile` is the stat block in `src/content/profiles.ts` (the bible's §5.2/§5.3). Quests listen to
  `'actor:killed'` and `'actor:yielded'` by the spawned id: a knockout in a lusio is a `'actor:killed'`, a fleeing or yielding
  thug an `'actor:yielded'`. Practice arms never kill; a brawl is non-lethal and drawing a blade is `crime:committed` `vis`.
  Without a combat module every fight resolves on its own, so the thread stays playable.
- **NPC life**: schedules use `sleep` for offstage. `scriptedDeath` calls `game.population.kill(npc)` and emits
  `'actor:killed'`: the world deltas record the death, but the population module must also skip dead NPCs when it
  respawns named people after a load and forget its dead ones (Festus) on a New Game from the title. Quests emit `'content:beat'` (`courier-knifed`, `mus-flees`, `courier-dying`,
  `grassatores-flee`, `bout-start`, `bout-stopped`, `brawl-start`, `cloacarius-grate`, `insula-collapses`) for scenes the NPC and
  combat sides may play; nothing depends on them.
- **World**: the contract spots (`spawn-capena`, `courier-ambush`, `castor-strongroom`, `ludus-gate`, `ludus-arena-center`,
  `lanista`, `armory`, `medicus`) and the bible's spots have fallback positions in `places.ts`; a spot the world registers with the
  same id replaces them and `syncAliases` keeps the bible's alias ids on top. The interior cells `dun-taberna-collapsa`,
  `dun-cloaca-maxima` and the small interiors are the world side's; the quests work at their entrances today.
- **UI**: the content opens `ui.openBook` (texts, things), `ui.openContainer` (containers) and `ui.openBarter` (trade, through `services.ts`); the dialogue panel is the flow's.
- **Calendar**: `rpg.hooks.templesClosed` must be true on the Lemuria for the offering to be refused (the dialogue
  also checks the date itself).
- **Flow**: nothing else to wire; `installContent` is found by `optional.ts`. The new game starts `mq-01` and tracks it.

## Differences from the bible

- mq-01 starts on foot at the cart stand (there is no cart to climb down from): "dismount" is leaving the stand or talking to Festus.
- Gratus stays at the vaults all day; Dromo leaves for the inn at the second hour, not the first.
- Lud-01 has a `missio` stage between the yield and the purse (the arena's choice, in dialogue), and bouts are started by
  telling Asiaticus you are ready (the bible leaves the starter open).
- The Cloaca delve is staged at the outfall until `dun-cloaca-maxima` exists; the Rex's gang is three cloacarii.
- The Leaning Insula has a failing ending (`collapsed`) for a player who is too slow.
- Twenty-four extra people, nine extra texts, thirteen small shrines and a lamp plan are mine; all are marked invented [G].

## Not done yet

- v0.2 content: the Tullianum, the arrest, mq-03 and the rest of Act I, the faction starters other than the Ludus,
  the other misc quests (all specified in the bible).
- Stealth-based beats (the Black Beans tail, the Rex's sluice route, S meters) and lockpicking; the bible's
  tutorial counters in the first bout (parry, riposte, dodge, lock-on) wait for the combat events that would drive them.
- Vignette and bark tables exist as data (`src/content/barks.ts`, `vignettes.ts`) and the NPC module has its own copies of the
  bible's lines; unifying them is the integrator's call.
- Interiors: containers, the cista of Mus and the lockers wait for their rooms; the readable signs of indoor places
  are placed at the doorstep.
