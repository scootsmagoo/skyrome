# Content module: quests, people, dialogue, items, texts and the golden path

The words and the people of the first playable (v0.0 to v0.1): seven quests played stage by stage,
seventy-odd named Romans with schedules and something to say, their conversations, the things you can
read, pray at, search and trade for, and the dawn shift that makes the walk from the Porta Capena to the
Forum something other than empty ground. Everything follows `docs/CONTENT.md` (the content bible); where
it differs, this file says so.

- Code: `src/quests/content/` (quests), `src/dialogue/content/` (conversations), `src/npc/content/` (NpcDefs),
  `src/content/` (places, hours, route, barks, vignettes, texts, containers, shrines, lamps, the installer
  and the service layer), `src/rpg/data/items/content.ts`, `quest.ts` and `loot.ts` (the bible's items and loot)
- Tests: `tests/content.test.ts` (validity, the corridor, no spot inside a building), `tests/content-quests.test.ts`
  (a scripted playthrough of every quest), `tests/content-install.test.ts`, `tests/content-services.test.ts`,
  `tests/content-world.test.ts` (the content placed in the real built world: every prompt focusable, nothing inside or
  under a building, every schedule place at street level)
- Third-party assets or libraries: none (every text is original, the bible labels all of them invented [G])

## How to try it (for the owner)

1. `npm run dev`, open <http://127.0.0.1:5173/?scene=rome>, choose **New Game**.
2. You stand at the Porta Capena at 04:30 beside the night cart (its mule, Dromo, Festus, two lanterns). Two seconds
   after you get control the courier Festus starts talking (Tab leaves). Walk on down the street: a dozen steps ahead
   the knife-men come out of the dark, then the dying courier and the tablet. (Until the Porta Capena has its own
   builder the gate is a solid block and the flow puts you just inside it; the scene is laid out there, in front of you.
   With the builder its spots take over: the cart outside, the ambush under the arch.)
3. Walk up the valley. The street is no longer empty: a beggar who held the line at Tapae, a vigil with a lantern, a
   street sweeper, a charcoal seller, a lamp seller, a carter with a wheel off, the shrine attendant, a mime, a fig
   seller, the fans of the Greens and the Blues chalking the Circus wall, a schoolmaster with three boys, an augur on
   the slope, goat-milk and water sellers, then the Velabrum and the Vicus Tuscus. **E** talks to any of them.
4. Things to look at and do on the way, each one a thing you can see: **E** at a crossroads altar prays (+5 Pietas, the
   Lares favor); **E** at graffiti scratched on a wall, a painted notice, a marble plaque, a notice board or a stele
   reads it; **E** at a lifted slab, a crack stuffed with rags, a bundle, stacked amphorae, a basket on a crate, the
   offering box beside the altar or a coin in a basin searches it (66 of them; the owned ones are theft if somebody
   sees). Lanterns burn on wall brackets and posts (and the altars' fires) until dawn.
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
| In the world | `src/content/install.ts` (`installContent`), `ground.ts` (where things may stand: out of buildings, at street level, walls), `standins.ts` (the visible things), `containers.ts`, `shrines.ts`, `lamps.ts`, `services.ts` |
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
| 0 | the bible's cart stand outside the gate (`capena-extra`) | (the builder's cart, when it exists) |
| 34 | inside the gate (`capena-intus`) | Capito, the old soldier |
| 42 to 62 | the fallback opening (`spawn-capena`, `night-cart`, `courier-ambush`) | the player, Festus, Dromo, the cart and mule; the ambush |
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
leave the NPC standing at the last place. They never name a solid building: a person who works at a temple, a basilica,
the Rostra or the Meta Sudans stands at its door-side spot `<landmark>:front` (2.5 m before the façade, `FRONT_SPOTS`),
so nobody spawns on a roof or a podium (the aedituus waits on Castor's steps). Mus's schedule names `mus-latebra`, a
place that exists only while the player is on his trail (the hideout is known, or mq-02 sends them after him) and he
has not been dealt with: the population module spawns nobody at an unknown place, so he is out of sight until then. Gratus stays at the vaults from the first hour to the second watch
(the bible sends him to the camp at the fourth hour) so "ask for Gratus" works whenever the player arrives; Dromo
stays at the cart until the second hour, so he can still be asked what he saw.

## Quests

Journal texts and objectives follow the bible; the scripted playthroughs (`tests/content-quests.test.ts`) drive
each through every stage by emitting what the engines emit ('dialogue:node', 'location:entered', 'actor:killed',
'actor:yielded', 'time:hour') against the real QuestSystem and DialogueSystem.

| Quest | Stages | Notes |
|---|---|---|
| `mq-01-madida-capena` (auto-start) | start, gate, ambush, dying, city, done | the cart conversation opens by itself on a new game; two tutorial thugs (`mq01-grassator-a/b` with the bible's stat block) at `capena-grassator-a/b`; Festus is knifed at the ambush and dies after he gives the tablet (`scriptedDeath`); walking on to the Forum while he is dying gives the tablet anyway (no soft-lock); his body is a "Search" point (6 den. 3 as., pugio, the letter home); the hideout objective is hidden until a flag says it is known; ends at the Forum; reward Fama +5 in the Circus district |
| `mq-02-tabella` | start, loculi, gratus, mus, deliver, done-v01 | Philetus at the shut doors (the Lemuria rule, AC-18), Chrysippus ("there is no Gratus"), Gratus by day and at dusk; the clue "clue-mus" from Auctus, Glaucus or the street; the Mouse fights in the burned taberna or hands over the key; the satchel doubles the pay; "Tomorrow, the Column." |
| `lud-01-sacramentum` | start, kit, bout1, bout2, bout3, missio, done | guest or oath (Infamia +20, a tiro); the armory stores the practice arms whenever you leave the Ludus; bouts start when you tell Asiaticus "Ready"; a lusio injury lasts one game hour; yielding to Nereus rolls the missio (favor); the choice after his yield is made in dialogue (or by `'content:missio'` if combat runs its own prompt); purse 30 den. × (1 + favor/100), half if spared; Hermippus patches you up and tells you to wait for the lamps |
| `misc-meta-sudans-rixa` | start, rixa, after, done, done-peace, done-walked, fail | armed on the way back from the Ludus (between the 11th hour and the second watch); the other side's three brawlers (its leader, already at the fountain, is engaged where he stands with `fight()`; two drunks are spawned) before the fountain (`meta-sudans:front`); blade drawn or a death fails it; yielding costs a tenth of the purse; the watch asks who started it |
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

Everything placed goes through `src/content/ground.ts` first: a point inside the footprint of a building the world
builds as solid masonry (or in the wall of an open court) is moved out of it; then, in the built world, the `Placer`
takes the nearest point whose first surface under the sky is at street level (no roof, podium or wall top), out of the
river, with nothing solid at body height and clear of what content already placed and of every spot where a schedule
puts somebody (the NPCs stand there). Rapier's queries only see the colliders that existed at its last step, so
`installContent` steps the physics a tenth of a millisecond first: everything was built behind the loading screen.
Places buried in the world's geometry (the Subura's fallback block today) get nothing until they have a street.

Every prompt has something to see (`src/content/standins.ts`, merged per 150 m cell into one mesh per material and
registered with `placeAndRegister`, colliders included; ~210 things, a few dozen draw calls where the player is):

| What | How |
|---|---|
| Shrines | 13 "Pray" points, each on an **altar** (kit `altar`; before the shrine when the shrine is a building, like the Lacus Curtius; the Porta Capena builder's spring is used as it is): `devotion.prayAtCompitum`, +5 Pietas once a day per shrine and the Lares favor, on the Lemuria too; Cloacina purifies, Juturna heals 10 HP and washes |
| Texts | 42 "Read" points open the book reader: graffiti **scratched on a real wall**, notices **painted on it**, inscriptions on a **marble plaque**, shop signs on a **signboard** above the door; where the street has no building, several share a **stretch of plastered wall** of their own, else a **notice board**, a **stele** or a **scratched pier**. T3 to T13, 9 more along the walk and the §8.4 signs; the lampoon on the basilica steps is washed off at sunset |
| Landmark things | 54 "Read" / "Look" points, a **stele** (inscription), a **notice board** (note) or a **herm** (vista) 2.5 m before the façade of every landmark of the nine v0.1 districts (AC-23), turned so the reader stands in the street |
| Containers | 66 in the street, each a thing: a **lifted slab**, a **crack stuffed with rags** in a real wall (or a broken wall stub), a **bundle**, **stacked amphorae**, a **basket on a crate**, the **offering box on its stand** 1.7 m from the altar, a **basin** with the coin, a **mallet on a step**, silt heaps at the outfall; prompts sit on top of or in front of them, never inside. Owned ones are `furtum` if `population.witnesses` sees you; 13 more indoors wait for their interiors; loot rolled once with a seed per container and kept in the world deltas; the Mouse's strongbox opens only with his key |
| Lamps | each burns in something: a **lantern on an iron bracket** where there is a wall, else a **lantern on a post**, or the **altar's fire** at the shrines; the street lamps along the corridor are hung only on walls (none over open ground); flagged `night`, lit at dusk, out one by one at dawn |
| Carts | when `src/npc/props.ts` exists (the NPC crew's), Dromo's cart and mule at `night-cart` (beside the spawn) and Cornix's with a wheel off; their loads are searched from the cart's side once the cart exists; the Porta Capena builder's own cart replaces Dromo's |
| World spots | the landmark builders' spots the content uses (`spawn-capena`, `night-cart`, `night-cart-driver`, `courier-ambush`, `capena-grassator-a/b`, `capena-mercury-spring`, `castor-strongroom`, the Ludus' gate, arena, lanista (the office), barracks (`ludus-cellae`), armory and medicus; by id or `<landmark>:<id>`) are mirrored into `game.locations` (`mirrorLandmarkSpots`) and replace the fallbacks; the bible's aliases follow them (`capena-extra`, `castor-loculi`, `ludus-cavea`…), and `capena-fight-area` stays 40 m round the new ambush. `game.content.worldSpots` lists them. The Ludus' office and barracks are two places: Celer's `lanista` is the room in the front range, everybody else's `ludus-cellae` the back portico of the court, both at street level. The bible's coordinates for the barracks (885, 257) fall on the built school's stands, so their fallback is the builder's own spot |
| People | on `game:started`: a New Game brings back the named NPCs the last game killed (Festus) and sends the opening's courier back to the cart; a load takes away whoever its world deltas say is dead (`syncNamedDeaths`); Mus's corner follows the story (`syncMusHideout`) |
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
- **NPC life**: schedules use `sleep` for offstage and never name a solid building (`<landmark>:front`). `scriptedDeath`
  calls `game.population.kill(npc)` and emits `'actor:killed'` (the world deltas record the death). Content keeps
  `population.deadNamed` in step with the story on `game:started` (it clears it on a New Game, adds the save's dead on a
  load, despawns a stale corpse or a moved Festus); the population module should still skip `deltas.isDead` ids when it
  respawns named people, so this does not depend on content. Content claims the spots where schedules put people, so
  its props never stand on them. Quests emit `'content:beat'` (`courier-knifed`, `mus-flees`, `courier-dying`,
  `grassatores-flee`, `bout-start`, `bout-stopped`, `brawl-start`, `cloacarius-grate`, `insula-collapses`) for scenes the NPC and
  combat sides may play; nothing depends on them.
- **World**: the contract spots (`spawn-capena`, `night-cart`, `courier-ambush`, `castor-strongroom`, `ludus-gate`,
  `ludus-arena-center`, `lanista`, `armory`, `medicus`, plus the barracks `ludus-cellae`, `night-cart-driver`, `capena-grassator-a/b`, `capena-mercury-spring`)
  have fallback positions in `places.ts`; when a landmark builder exposes a spot with the id (or `<landmark>:<id>`),
  `installContent` mirrors it into `game.locations` and the bible's alias ids follow. The `subura` district anchor is built
  as one solid block by the generic builder, which buries `fullonica-suburana` (T13 is not placed until it has a street). The interior cells `dun-taberna-collapsa`,
  `dun-cloaca-maxima` and the small interiors are the world side's; the quests work at their entrances today.
- **UI**: the content opens `ui.openBook` (texts, things), `ui.openContainer` (containers) and `ui.openBarter` (trade, through `services.ts`); the dialogue panel is the flow's.
- **Calendar**: `rpg.hooks.templesClosed` must be true on the Lemuria for the offering to be refused (the dialogue
  also checks the date itself).
- **Flow**: nothing else to wire; `installContent` is found by `optional.ts`. The new game starts `mq-01` and tracks it.

## Differences from the bible

- mq-01 starts on foot at the cart stand (there is no cart to climb down from): "dismount" is leaving the stand or talking to Festus.
  Until the Porta Capena has a passage the stand and the ambush are inside the gate, where the flow spawns the player
  (the bible has them outside and under the arch; the builder's spots restore that). Mus is not seen at the burned
  taberna until the player is after him (the bible: he vanishes after the murder).
- Spots the bible puts inside buildings built as solid blocks today (the strongrooms in Castor's podium, the steps of
  the Basilica Julia) stand at the edge of the building on the same side.
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
- The stand-ins are procedural kit pieces and simple shapes (an altar, a stele, a board, lanterns): CC0 models from the
  asset plan (`docs/research/assets-3d-plan.md`) can replace them one kind at a time in `standins.ts`.
