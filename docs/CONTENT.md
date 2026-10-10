# SKYROME: Content Bible (v0.1 "Prima Lux" and v0.2 "Columna")

> **Version:** 1.0, 2026-10-03. **Scope:** every named person, quest, item, enemy, container, text and ambient line that the first playable (**v0.1**, GDD §17.1) needs, plus the milestone after it (**v0.2 "Columna"**, GDD §18: Act I complete, the Cloaca, the Tiber Island, sicarii and dogs, stealth, locks, pickpocketing, sling and javelin). Faction starter quests for lines that the roadmap ships later (v0.3–v0.6) are specified too, so they can be pulled forward.
> **Authority:** `docs/GDD.md` v1.1 wins on every design decision, formula, ID and number. `src/data/atlas.ts` wins on positions. Research docs win on historical facts. Where this file needs something neither has, it says so and proposes it (**Atlas additions**, §1; new item IDs marked **NEW**; new festival IDs marked **NEW**).
> **Audience:** the engineers who turn this into `src/npc/content/*.ts`, `src/quests/content/*.ts`, `src/dialogue/content/*.ts`, `src/rpg/data/items/*.ts` and `src/rpg/data/loot.ts`, and the owner, who should be able to read any quest and picture it.
> **Confidence tags** as in the GDD: **[A]** attested · **[P]** probable · **[U]** uncertain · **[G]** game extrapolation · **[design]** invented mechanic or number. Invented people holding real offices are labelled **[G]** and must be labelled as invented in the Lexicon.

---

## 0. How to read this file

### 0.1 Contents

1. Atlas additions (new location IDs with coordinates)
2. NPC roster (96 named NPCs) and the handling of historical figures
3. Quests: main quest Act I opening (3), faction starters (7), misc quests (12)
4. Items catalogue (228 entries; v0.1 needs marked)
5. Enemies and bosses
6. Containers and loot tables
7. In-world texts (13)
8. Ambient content: barks, shrines, festivals, signage
9. Open questions, caveats and sources

### 0.2 Conventions used throughout

| Thing | Convention |
|---|---|
| **IDs** | GDD §0: `npc-`, `mq-`, `vig-`/`lud-`/`urb-`/`lav-`/`mit-`/`cli-`/`cir-`, `misc-`, `boss-`, `dun-`, `fest-`, `dlg-` (dialogue). Locations are **landmark IDs from `LANDMARKS`**, Atlas additions (§1.1–1.2), or IDs from another atlas array (a bridge, island, gate or road, registered as a `LocationDef`, §1.3). Every location ID used in this file resolves to one of the three; §1 lists all the non-landmark ones. |
| **Positions** | §1 gives **real metres** in the atlas frame (origin Miliarium Aureum, +x east, +z south), like `atlas.ts`. `LocationDef.position` is game metres: `toGame()` multiplies by 0.6. Radii are **game metres**. |
| **Milestone tags** | **v0.1-Must / v0.1-Should / v0.1-Could**, **v0.2**, or the roadmap version (v0.3 …) with "pull-forward" when the content could ship earlier. |
| **Money** | Denarii (`den.`), with asses (`as.`) for small sums; 1 den. = 16 as. |
| **Skill checks** | GDD §14.5: `p = clamp(0.05, 0.95, 0.50 + (rhetoric + mods − DC)/100)`. DC tiers: **Facilis 10 · Mediocris 25 · Difficilis 40 · Ardua 55 · Gravissima 70 · Herculea 85.** Written `[Persuade 25]`, `[Intimidate 40]`, `[Bribe 13 den.]`, `[Invoke patron]`. Non-Rhetoric checks name the skill: `[Fabrica 30]`. |
| **Rewards** | `den` (denarii), `items`, `fama.<track> ±n`, `pietas ±n`, `rank`, and **XP** written two ways, both from `Reward`: `skillXp: <skill>` = one level's worth (`xpToNext` at the current level, GDD §5.1) and `skills: <skill> +n` = use-units. **No quest grants character XP directly** (`Reward.xp` stays unset): character XP comes only from skill level-ups (GDD §5.3), which keeps the v0.1 pacing check (level 2 inside the slice) true. |
| **Fama tracks** | GDD §9.1: `fama.vigiles`, `fama.ludus-magnus`, `fama.cohortes-urbanae`, `fama.cultores-lavernae`, `fama.sodales-invicti`, `fama.clientela`, `fama.factio-prasina`, `fama.factio-veneta`, `fama.plebs`, `fama.dist-<district id>` (§12.1 IDs: `dist-forum-romanum`, `dist-capitolium`, `dist-palatium`, `dist-fora-imperialia`, `dist-velia`, `dist-vallis-colossei`, `dist-circus-maximus`, `dist-velabrum-boarium`, `dist-forum-holitorium`). |
| **Flags** | Global saved flags (`QuestContext.flag`), `kebab-case`, listed per quest under "Flags set". |

### 0.3 Roman hours (schedules)

Schedules are **authored in Roman hours** and compiled to clock hours for the current date (GDD §14.7). `h1`…`h12` are the starts of the twelve daylight hours; `v1`…`v4` are the starts of the four night watches (*vigiliae*). A `+0.5` suffix means half an hour later. For **11 May 113** (sunrise 04:54, sunset 19:06; one *hora* = 71 min, one watch = 147 min), the compiled `ScheduleEntry.from` values are:

| Mark | h1 | h2 | h3 | h4 | h5 | h6 | h7 | h8 | h9 | h10 | h11 | h12 | v1 (sunset) | v2 | v3 (midnight) | v4 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Clock | 04:54 | 06:05 | 07:16 | 08:27 | 09:38 | 10:49 | 12:00 | 13:11 | 14:22 | 15:33 | 16:44 | 17:55 | 19:06 | 21:33 | 00:00 | 02:27 |
| `from` | 4.90 | 6.08 | 7.27 | 8.45 | 9.63 | 10.82 | 12.00 | 13.18 | 14.37 | 15.55 | 16.73 | 17.92 | 19.10 | 21.55 | 0.00 | 2.45 |

Activities are `IdleLoop` values (`stand`, `sit`, `sitGround`, `lean`, `work`, `sweep`, `talk`, `pray`, `sleep`, `cheer`, `guard`, `drunk`) or `wander`, `patrol` (with a route of location IDs) and `travel`. A schedule line reads `h1 castor-loculi:work · h7 popina-vici-tusci:sit · v1 insula-mariorum:sleep`.

### 0.4 Dialogue notation (maps onto `DialogueDef`)

```
DLG dlg-id · npcs: npc-a, npc-b · priority 50
start: <condition> → node · else → node
n0  "NPC line."                                   (speaker defaults to the NPC; [P] = player line, [N] = narration)
  ▸ "Player choice."                    → n1      {effects}
  ▸ [Persuade 25] "Choice."             → pass n2 · fail n3
  ▸ [Bribe 13 den.] "Choice."           → n4      (bribe formula of §14.5 unless an amount is given)
  ▸ (if <condition>) "Choice."          → n5      (hidden unless true)
  ▸ (enabled <condition>) "Choice."     → n6      (shown, greyed out unless true)
  ▸ "Choice." ⇥ end                               (ends the conversation)
```

Effects: `stage(q, s)`, `start(q)`, `fail(q)`, `obj(q, o)` (complete an objective), `reveal(q, o)` (show a hidden objective), `flag(x=v)`, `give(item[,n])`, `take(item[,n])`, `pay(n)` (the player pays), `receive(n)` (the player receives), `disp(±n)`, `fama(track, ±n)`, `pietas(±n)`, `infamia(+n)`, `rank(faction, rank)`, `skills(skill, +n)`, `crime(id, bounty)` and `bounty(id, n)` (GDD §14.1), `kill(npc, scripted)` (a scripted death), `service(barter|train|heal|repair|rent)`, `attack()`, `once`. Plain-language effects ("split the purse", "spawn the sides") are spelled out where they occur. Conditions: `origin=…`, `sex=…`, `flag(x)`, `q(id).stage=…`, `has(item)`, `den≥n`, `skill(id)≥n`, `dress(formal)`, `time∈[h7,v1)`.

**Origin and sex hooks.** v0.1 ships four origins (`civis-suburanus`, `hispanus`, `veteranus`, `dacus`). Lines marked `(if origin=…)` are the origin-flavoured alternatives; at least one exists in each main quest. Sex never gates content (GDD §3.7); where framing differs, the female line is given as `(if sex=female)`.

### 0.5 Quest notation

Each quest has a header table (ID, title and Latin title, category, faction, giver, milestone, trigger, prerequisites, window), then **stages** (stage ID, journal text in the first person and past tense as `QuestStageDef.journal` requires, objectives with `MarkerTarget`s and counts, and how the stage completes), then **dialogue**, **rewards**, **failure states**, **world changes** and **flags**. Objective targets are written `npc:npc-x`, `loc:location-id`, `item:item-id`, `kill:<tag>` (count kills, knockouts and yields of NPCs carrying the tag), `time:<mark>` (the clock passes that Roman-hour mark).

---

## 1. ATLAS ADDITIONS (proposed location IDs)

> **Clearly marked: none of these IDs exist in `src/data/atlas.ts` yet.** Every location this file uses is either a `LANDMARKS` ID, a non-landmark atlas ID registered as a location (§1.3), or one of the IDs below. Coordinates are **real metres** in the atlas frame; each was checked against the landmark footprints so that nothing lands inside a building it doesn't belong to (children of a landmark list it as `parent`). Three of them (`fullonica-suburana`, `stabula-factionum`, `temple-mercury`) are **already referenced by code** (`src/rpg/data/factions.ts`, `src/rpg/data/religio.ts`) and need these entries to resolve.
>
> Suggested home: a `SPOTS: LocationSpot[]` export in `atlas.ts` (or `src/world/spots.ts`) with `{ id, name, latin?, at: P2, parent?, radius, mapMarker?, discoverable?, interior?, confidence, note }`; the location registry converts `at` with `toGame()`.

### 1.1 Spots for v0.1 (golden path, vendors, shrines, v0.1 interiors)

| ID | Name (Latin) | At (x, z) real m | Parent | Radius (game m) | Marker / discoverable | Conf. | Note and source |
|---|---|---|---|---|---|---|---|
| `capena-extra` | Outside the Capena Gate (*extra Portam Capenam*) | 523, 974 | `porta-capena` | 8 | — / no | low | **New-game spawn**: the cart stand 25 m outside the gate on the Via Appia (gate faces 140°). [design] |
| `fons-mercurii` | Mercury's Spring (*aqua Mercurii*) | 488, 968 | `porta-capena` | 4 | fountain / yes | low | "est aqua Mercurii portae vicina Capenae", Ovid *Fasti* 5.673 [A]; which side of the gate [U]. Mercuralia site (15 May). |
| `temple-mercury` | Temple of Mercury (*Aedes Mercurii*) | 232, 978 | — | 12 | temple / yes | low | **Propose as a LANDMARK** (category temple, rect ~16 × 26 m, facing NNE toward the Circus, P2). Platner & Ashby: "on the slope of the Aventine, above and facing the circus Maximus", near its SE end; dedicated on the Ides of May, 495 BC [A]. Already the `patronus-mercurius` temple in `religio.ts`. |
| `compitum-capenae` | Crossroads Shrine by the Capena Gate | 470, 915 | — | 3 | shrine / yes | low | Lares Compitales shrine [G site; 265 vici had them, A]. |
| `compitum-circi` | Crossroads Shrine below the Palatine | 300, 755 | — | 3 | shrine / yes | low | On `street-north-of-circus`. [G] |
| `astrologi-circi` | Astrologers' Arcade (*sub arcubus Circi*) | 200, 690 | `circus-maximus` | 10 | shop / yes | low | Diviners plied by the Circus [P, society §2.10]; booths of Zenon and Arruns. |
| `caupona-carcerum` | The Inn at the Starting Gates | −175, 520 | — | 6 | tavern / yes | low | GDD §7.3 caupona "near the Circus carceres" (carceres at about −138, 541). [G] |
| `popina-vici-tusci` | The Silver Pig (*Ad Porcum Argenteum*) | 2, 215 | — | 6 | tavern / yes | low | **v0.1 interior** (GDD §17.1). West side of the Vicus Tuscus. [G] |
| `seplasia-vici-tusci` | Fadia's Perfumery | 18, 178 | — | 4 | shop / yes | low | Perfume and incense trade of the Vicus Tuscus [A]; `seplasiarius` vendor. |
| `taberna-collapsa` | The Burned Taberna | −8, 262 | — | 4 | dungeon / yes | low | Entrance of **`dun-taberna-collapsa`** (v0.1 Must micro-dungeon, GDD §12.4). [design] |
| `compitum-vici-tusci` | Crossroads Shrine of the Vicus Tuscus | −33, 290 | — | 3 | shrine / yes | low | Altar inscription in §7, T9. [G] |
| `signum-vortumni` | Statue of Vortumnus (*signum Vortumni*) | 92, 64 | — | 3 | shrine / yes | medium | The bronze god of exchange stood at the Forum end of the Vicus Tuscus [A: Propertius 4.2; Varro *LL* 5.46]; exact spot [P]. |
| `castor-loculi` | Strongrooms of Castor (*loculi aedis Castoris*) | 88, 98 | `temple-castor-pollux` | 5 | — / yes | low | **v0.1 interior** (1:1 cell). Chambers in the podium used as deposit vaults [A: Juv. 14.260–2, later; GDD §10.3]. Which flank [G]: the west flank, toward the Vicus Tuscus. Doors open from outside the podium, so they stay open on the Lemuria. |
| `tabernae-aemiliae` | Shops of the Basilica Paulli (*tabernae*) | 135, 12 | `basilica-aemilia` | 8 | market / no | medium | Shop row on the Forum front [A]. Banker, physician, barber. |
| `basilica-julia-gradus` | Steps of the Basilica Julia | 44, 44 | `basilica-julia` | 10 | — / no | high | Gaming boards scratched into the steps [A]. Idlers, dice. |
| `cloaca-grate-aemiliae` | Drain Grate by the Basilica Paulli | 118, 22 | — | 3 | — / no | low | Loopback exit of `dun-cloaca-maxima` (GDD §12.4). [design] |
| `taberna-armorum` | Euhodus' Arms Shop (*arma venalia*) | 478, 268 | — | 6 | shop / yes | low | **v0.1 interior.** GDD §7.3: arms dealer "Sacra Via, near the Ludus Magnus": the south side of the Sacra Via, 45 m short of the Meta Sudans. [design] |
| `compitum-acili` | Crossroads Shrine of Acilius (*Compitum Acili*) | 455, 125 | — | 3 | shrine / yes | low | **Attested**: a distyle shrine on a 2.75 × 3 m podium, dedicated 5 BC, excavated (and destroyed) by Colini in 1932 "north of the Temple of Venus and Rome on the Velia" at the junction of the Sacra Via with a street up to the Carinae [A: Digital Augustan Rome; it.wikipedia]. Spot [P]. It survived Nero, so it stands in 113 [P]. |
| `lacus-metae` | Basin by the Meta Sudans | 530, 262 | `meta-sudans` | 3 | fountain / no | low | Public drinking basin (removes `sordidus`, GDD §14.8). [G] |
| `ludus-cavea` | Practice Arena of the Ludus Magnus | 875, 285 | `ludus-magnus` | 22 | arena / no | medium | Elliptical practice arena with a small cavea (about 3,000 seats [?], game-design B4.4). Bouts of `lud-01`. |
| `ludus-armamentarium` | Ludus Armory | 834, 297 | `ludus-magnus` | 5 | — / no | low | Kit issue (rudis, shield). The real *Armamentarium* stood near the ludi [A, Regionaries]; for play it is a room inside the Ludus. [design] |
| `ludus-saniarium` | Ludus Infirmary (*saniarium*) | 916, 273 | `ludus-magnus` | 5 | — / no | low | Where KO'd and spared fighters wake (GDD §6.10). [A for the institution; room G] |
| `ludus-cellae` | Ludus Barracks | 885, 257 | `ludus-magnus` | 8 | — / no | low | **v0.1 interior** (GDD §17.1). Gladiator graffiti (§7, T4). |
| `lectica-statio-forum` | Litter Stand (Forum) | 62, 32 | — | 4 | — / no | low | Fast travel, GDD §14.12 (v0.1 Should). |
| `lectica-statio-capena` | Litter Stand (Capena Gate) | 492, 930 | — | 4 | — / no | low | As above. |
| `lectica-statio-metae` | Litter Stand (Meta Sudans) | 540, 300 | — | 4 | — / no | low | As above. |
| `statio-cohortium-urbanarum` | Post of the Urban Cohorts | 30, −62 | — | 6 | camp / yes | low | GDD §9.1: a forward *statio* on the Clivus Argentarius beside the Carcer [design]. v0.1 law patrols start here; `urb-01` giver. |

### 1.2 Spots for v0.2 and the faction starters

| ID | Name (Latin) | At (x, z) real m | Parent | Radius | Marker / disc. | Conf. | Note and source |
|---|---|---|---|---|---|---|---|
| `insula-mariorum` | Insula of the Marii | −82, 345 | — | 8 | house / yes | low | Courier's family home, `mq-03`. A light-well courtyard; roof hatch to `insula-mariorum-tectum` (child spot, same x/z, roof level). [G] |
| `insula-nutans` | The Leaning Insula | −42, 352 | — | 8 | house / yes | low | `misc-insula-nutans`. Becomes a ruin after the quest. [G] |
| `insula-tuccii` | Insula of Tuccius the Cooper | −55, 420 | — | 8 | house / no | low | `misc-lemuria-fabae`. [G] |
| `excubitorium-velabri` | Watch Post of the Vigiles, Velabrum | −110, 300 | — | 6 | camp / yes | low | GDD §9.1 forward excubitorium (the 14 sub-stations are unlocated [A], so placed freely [design]). Fire notice T8. |
| `compitum-velabri` | Crossroads Shrine of the Velabrum | −125, 355 | — | 3 | shrine / yes | low | [G] |
| `lacus-velabri` | Velabrum Basin | −140, 375 | — | 3 | fountain / no | low | Water for the bucket chain in `vig-01`. [G] |
| `fullonica-velabri` | Fullery of the Velabrum | −150, 320 | — | 5 | shop / yes | low | GDD §7.3 `fullo` vendor "Velabrum". [G] |
| `pistrinum-velabri` | Bakery of the Velabrum | −95, 395 | — | 5 | shop / yes | low | GDD §7.3 `pistor` "Velabrum". [G] |
| `insula-ardens` | The Burning Insula | −160, 400 | — | 10 | — / no | low | `vig-01` fire site, west edge of the Velabrum toward the Forum Boarium. [design] |
| `compitum-boarii` | Crossroads Shrine of the Cattle Market | −215, 445 | `forum-boarium` | 3 | shrine / yes | low | [G] |
| `arca-argei` | Argei Chapel of the Velabrum (*sacrarium Argeorum*) | −60, 300 | — | 3 | shrine / no | low | One of the 27 Argei chapels [A: Varro *LL* 5.45–54]; this location [G]. `misc-argei`. |
| `scalae-gemoniae` | Gemonian Stairs (*Scalae Gemoniae*) | −6, −88 | — | 6 | — / yes | low | "Leading up to the Capitoline past the carcer… probably… the present Via di S. Pietro in Carcere" (Platner & Ashby) [A existence, U line]. May be the same flight as road `gradus-monetae`. `misc-scalae-gemoniae`. |
| `officina-columnae` | Carvers' Hut at the Column | −18, −366 | `column-trajan` | 5 | — / no | low | Workshop hut in the Column court on the eve of the dedication. [G] `misc-facies-columnae`. |
| `colossus-machina` | Scaffold of the Colossus | 415, 175 | `colossus-sol` | 6 | — / no | low | Regilding scaffold put up for the dedication festivities [G]. Human-scale (1:1) timber beside the 0.6-scale statue. `misc-colossus`. |
| `domus-clivi-victoriae` | House on the Rise of Victory | 60, 247 | — | 6 | house / no | low | Recipient's house in `misc-genitura-caesaris`, on road `clivus-victoriae`. [G] |
| `spelaeum-horreorum` | The Cave under the Horrea (*spelaeum*) | 55, 192 | `horrea-agrippiana` | 5 | — / no | low | Underground; the Mithraic cell's cellar, GDD §9.1 [design; no mithraeum is securely dated this early, P]. Interior `dun-spelaeum` (v0.6). |
| `taberna-vestiarii` | Clothier in the Horrea Agrippiana | 28, 205 | `horrea-agrippiana` | 4 | shop / yes | low | GDD §7.3 `vestiarius` "Horrea Agrippiana". |
| `fullonica-suburana` | The Fullery off the Clivus Suburanus | 620, −250 | — | 6 | — / no | low | **Referenced by `factions.ts`** (Cultores Lavernae HQ, GDD §9.1). Subura (v0.3). [design] |
| `stabula-factionum` | Stables of the Circus Factions (*stabula IIII factionum*) | −1040, −470 | — | 25 | camp / yes | low | **Referenced by `factions.ts`.** "In the southern part of the campus Martius, near the circus Flaminius"; the Greens' stable "in the immediate neighbourhood of the Cancelleria" (Platner & Ashby) [A/P]. Campus Martius (E1, v0.3+). |
| `domus-sergii` | House of M. Sergius Bassus | 700, 690 | — | 10 | house / yes | low | Caelian, above the Clivus Scauri. [G] |
| `domus-calpurniae` | House of Calpurnia Severa | −260, 1040 | — | 10 | house / yes | low | Aventine, near Trajan's private house (`privata-traiani`), fitting Plotina's circle. [G] |
| `domus-vettii` | House of Sex. Vettius Crispinus | 545, −30 | — | 10 | house / yes | low | The Carinae, on road `vicus-cuprius`. [G] |

### 1.3 Non-landmark atlas features registered as locations

These IDs already exist in other `atlas.ts` arrays. The location registry should create a `LocationDef` for each with the position and radius below, so quests can target them like landmarks.

| ID | Source array | Position (real m) | Radius (game m) | Used by |
|---|---|---|---|---|
| `pons-sublicius` | `BRIDGES` (midpoint of a/b) | −398, 541 | 35 | `misc-sublicius-clavi`, `misc-argei`, `fest-argei` |
| `pons-aemilius` | `BRIDGES` | −418, 361 | 45 | ambient |
| `insula-tiberina` | `ISLANDS` (centroid) | −540, 235 | 60 | `misc-servus-aesculapii` |
| `porta-lavernalis` | `GATES` | −430, 1280 | 8 | Laverna shrine (v0.3+) |
| `clivus-victoriae`, `gradus-monetae`, `vicus-tuscus`, `street-north-of-circus` | `ROADS` | polyline | 6 (corridor) | chase and escort routes |

### 1.4 Interior cells (not map positions)

| Cell ID | Entrance spot → exit spot | Kit (GDD §12.4) | Milestone |
|---|---|---|---|
| `dun-taberna-collapsa` | `taberna-collapsa` → a light well up into the courtyard of the next insula (exit spot `taberna-collapsa-puteus`, at −20, 275) | `kit-insula` | **v0.1 Must** |
| `castor-loculi` (cell) | street door on the podium's west flank | `kit-landmark-interior` | **v0.1 Must** |
| `popina-vici-tusci`, `taberna-armorum`, `ludus-cellae`, an insula stairwell (`insula-nutans` stair to the roof) | their spots | `kit-insula` | **v0.1 Must** (the 4–6 small interiors of GDD §17.1) |
| `dun-cloaca-maxima` | `shrine-venus-cloacina` grate → `cloaca-grate-aemiliae` | `kit-cloaca` | v0.1 Should / v0.2 |
| `dun-carcer` | `carcer-tullianum` door → drain shaft to the Clivus Argentarius (exit spot `carcer-cloaca`, at 5, −52) | `kit-landmark-interior` | v0.2 |
| `dun-columna` | `column-trajan` pedestal door → viewing platform | `kit-landmark-interior` | v0.2 |

---

## 2. NPC ROSTER

### 2.0 Format

Each entry maps onto `NpcDef` (`src/npc/types.ts`) and `Appearance` (`src/actors/appearance.ts`).

- **Header:** `id` — full name · sex, age (`AgeGroup`) · role · faction and rank · **essential** (cannot die: kneels and becomes "affronted", GDD §6.14) · milestone.
- **Home / work** and **Schedule** in Roman hours (§0.3).
- **Look** uses the `Appearance` enums: build, height, skin hex, hair style and colour, beard, garments (`kind` colour, `trim`, `clavi`), footwear, armour and weapon models. Beards are rare in 113 and always explained.
- **Personality / voice** (no voice acting; this guides the subtitle writing), **Barks** (3–6, spoken in passing; ambient barks by district are in §8.1), **Services** (vendor kind from `src/rpg/data/vendors.ts`, trainer skill and cap, and so on).

Palette shorthands: undyed `#E2DAC6`, grey `#8E8A80`, brown `#7A6248`, faded madder `#9C4A3A`, blue-green `#4F6E6A`, saffron `#E0A526`, sea-green `#5E9A8A`, rose `#C77B83`, violet `#6B3A6E`, sky `#7FA4C9`, ochre `#CC9A35`, toga white `#EFE8D8`, purple `#5B1F3B`, mourning `#3B342F`, soldier's red `#9E3B2E`. Hair: black `#1B1612`, dark brown `#2A1D14`, brown `#4A3424`, red-brown `#6B3A22`, fair `#B08A4A`, grey `#8A8580`, white `#CFCBC4`.

**Roster at a glance (96):** A. Act I and the frumentarii (10) · B. historical figures who appear (13) · C. faction people (33) · D. vendors and service people (16) · E. quest givers and ordinary Romans (24). Named fighters (Mus, the Rex Cloacae, Pullus, Auctus, Nereus) sit in A, C and E and also have stat blocks in §5.

### 2.A Act I and the frumentarii

**`npc-festus` — Gaius Marius Festus** · male, 33 (adult) · courier (*miles frumentarius*), a legionary detached to the Castra Peregrina [G for the man; the frumentarii are P] · essential: no (dies in `mq-01`, scripted) · v0.1-Must
- **Home / work:** `insula-mariorum` / `castra-peregrina`. **Schedule:** scripted only (on the cart at `capena-extra`, dies under the arch of `porta-capena`).
- **Look:** average, 1.68 m, skin `#C99A72`, hair cropped `#2A1D14`, beard stubble (nine days on the road); tunica grey, paenula brown `#6B5236`; caligae; a soldier's belt with a leather dispatch tube; pugio.
- **Personality / voice:** tired, dry, kind under a professional reticence. Short sentences. Calls the player "stranger" until they have talked, then "friend".
- **Barks:** "Nine days from Brundisium and the last mile is the longest." · "Don't ask me what's in the tube. I'm paid not to know." · "Mind the arch. It drips on emperors too." · "Rome. Smell that? Bread, smoke and somebody else's money."
- **Services:** none. **Loot (body):** 6 den. 3 as., `pugio` (condition 0.9), `quest-epistula-festi` (§6.3).

**`npc-dromo` — Dromo** · male, 41 (middle) · night carter (*plaustrarius*), slave of a Campanian wine dealer [G] · — · essential: no · v0.1-Must
- **Home / work:** `capena-extra` (cart) / `caupona-carcerum`. **Schedule:** v4 `capena-extra:work` (the cart, `mq-01`) · h1 `caupona-carcerum:sit` (tells the story all day) · v1 `capena-extra:work` (next load) · v3 `capena-extra:sleep` (under the cart).
- **Look:** stocky, 1.62 m, skin `#B07D58`, hair curly-short `#1B1612`, beard stubble; tunica-short brown, a sack over the shoulders; barefoot; a whip.
- **Personality / voice:** cheerful coward, superstitious, talks to his mules more than to people. Ends sentences with oaths (*Mehercle!*).
- **Barks:** "Up, Ballista! Up, Catapulta! The sun's coming and the law with it." · "I was under the cart. Best seat in the house." · "A man died at the gate. Nobody's mule will stop there now." · "Wine for the Velabrum, lime for the Pantheon, and corpses for the gods. Busy night."
- **Services:** none (gossip: tells the `mq-01` clue "the hooded one walked like a fighter").

**`npc-gratus` — Aulus Vettulenus Gratus** · male, 44 (middle) · centurion of the frumentarii, deputy of the *princeps peregrinorum* [G] · frumentarii · essential until `mq-04` (wounded there, survives) · v0.1-Must
- **Home / work:** `castra-peregrina` / `castor-loculi`. **Schedule:** h1–h4 `castor-loculi:work` (inspects the deposits) · h4 `castra-peregrina:work` · v1 `castor-loculi:work` (meets the player at dusk, `mq-02`) · v2 `castra-peregrina:sleep`. On 12 May: `column-trajan:guard` (v0.2).
- **Look:** muscular, 1.70 m, skin `#B07D58` (sun-darkened), hair cropped `#8A8580`, clean-shaven, a pale knife scar across the left forearm; tunica off-white with a narrow soldier's belt, paenula grey; caligae; gladius on the right hip (off duty, civilian tunic, no armour).
- **Personality / voice:** courteous, watchful, never says a name twice in public. Speaks in questions. Respects competence and nothing else.
- **Barks:** "Walk on. If you need me you'll know where." · "Every seal in Rome tells a story. Most of them lie." · "Daylight is for honest men and fools." · "Festus was the best rider in the camp. Remember that, if anyone asks."
- **Services:** none.

**`npc-chrysippus` — Chrysippus** · male, 52 (middle) · keeper of the deposits in the Castor strongrooms, a public slave (*servus publicus*) [G] · — · essential: no · v0.1-Must
- **Home / work:** `castor-loculi` (lives above it in a cubicle) / `castor-loculi`. **Schedule:** h1–h12 `castor-loculi:work` · v1 `castor-loculi:sit` · v2 `castor-loculi:sleep`.
- **Look:** slight, 1.60 m, skin `#DDB48F`, hair receding `#8A8580`, clean-shaven; tunica undyed, a ring of iron keys on a cord round his neck; soleae (indoors).
- **Personality / voice:** pedantic, frightened of his superiors, proud of his ledgers. Counts things aloud.
- **Barks:** "Deposits on the left, withdrawals on the right, complaints to the gods." · "The temple is shut. The money is not. Money never sleeps." · "Mind the step. Eleven steps. I counted them in the year of Nerva."
- **Services:** none (story: admits the player to Gratus, `mq-02`).

**`npc-marius-fuscus` — Gaius Marius Fuscus** · male, 66 (old) · Festus' father, a retired legionary of the Flavian wars [G], now a lamp-maker · — · essential until `mq-03` completes · v0.2
- **Home / work:** `insula-mariorum` / the lamp shop on its ground floor. **Schedule:** h1 `compitum-velabri:pray` · h2–h9 `insula-mariorum:work` · h9 `insula-mariorum:sit` · v1 `insula-mariorum:sleep` (on the Lemuria nights: up at v3 for the rite).
- **Look:** slight, 1.63 m, skin `#C99A72`, hair cropped `#CFCBC4`, beard stubble (on 11 May; full mourning stubble after Festus' death is the period custom), tunica grey; barefoot during the rite; old *phalerae* nailed to the doorpost.
- **Personality / voice:** stern, pious, a soldier of the old school who believes in the ghosts and is ashamed to say so. Formal Latin when moved.
- **Barks:** "Black beans, nine times, and don't look back. That's how my father did it." · "Two sons. One in the post, one in the books. Neither at my table." · "The house creaks. Houses do. Don't they?"
- **Services:** none.

**`npc-helpis` — Antonia Helpis** · female, 58 (old) · Festus' mother, a freedwoman · — · essential until `mq-03` completes · v0.2
- **Home / work:** `insula-mariorum`. **Schedule:** h1 `pistrinum-velabri:talk` (buys bread) · h2 `insula-mariorum:work` (spins wool) · h7 `compitum-velabri:pray` · v1 `insula-mariorum:sleep`.
- **Look:** slight, 1.50 m, skin `#B07D58`, hair bun `#8A8580` under a palla drawn over the head; tunica-long blue-green, palla grey; soleae.
- **Personality / voice:** warm, quick, practical; grief makes her talk more, not less.
- **Barks:** "He writes every Kalends. Every Kalends, and this month nothing." · "Gemellus eats like a bird and sleeps like a cat: anywhere but his bed." · "Have you eaten? You look as if Rome has eaten you."
- **Services:** none.

**`npc-gemellus` — Lucius Marius Gemellus** · male, 33 (adult) · Festus' twin, a copyist (*librarius*) in hiding · — · essential: no (killing him is possible but costs; §3.1.3) · v0.2
- **Home / work:** `insula-mariorum-tectum` (hiding on the roof). **Schedule:** v2–v4 `insula-mariorum-tectum:sitGround` · h1–h12 `insula-mariorum-tectum:sleep` (until `mq-03` completes; then `castra-peregrina:work` if he testifies, or removed if he leaves Rome).
- **Look:** slight, 1.68 m (Festus' face: same skin `#C99A72`, hair cropped `#2A1D14`), beard short (three weeks in hiding: a sign of fear and mourning), wearing Festus' old brown paenula; ink-stained fingers; barefoot.
- **Personality / voice:** clever, nervous, sardonic; speaks fast in Greek-sprinkled Latin; hates being mistaken for his brother.
- **Barks:** "I'm not him. I've never been him. Ask our mother." · "A copyist sees everything twice: once to read, once to write." · "If you're here to kill me, do it quietly. Father's asleep."
- **Services:** none.

**`npc-pudens` — Titus Aufidius Pudens** · male, 52 (middle) · *princeps peregrinorum*, chief of the frumentarii at the Castra Peregrina [G person; office first attested under Trajan, P] · frumentarii · essential · v0.2 (`mq-05`)
- **Home / work:** `castra-peregrina`. **Schedule:** h1–h7 `castra-peregrina:work` · h7 `castra-peregrina:sit` · h9 `castra-peregrina:work` · v2 `castra-peregrina:sleep`.
- **Look:** heavy, 1.66 m, skin `#DDB48F`, hair receding `#8A8580`, clean-shaven; tunica white with a red border at the hem, sagum red `#9E3B2E`; caligae; centurion's vine staff (`vitis`) tucked under the arm.
- **Personality / voice:** genial, slow-spoken, terrifying. Never raises his voice. Calls everyone "my boy" or "my girl".
- **Barks:** "Everyone in Rome is someone's informer. The trick is to be mine." · "Sit. Eat a fig. Then lie to me, if you still want to." · "The emperor leaves in the autumn. Until then, nobody sleeps."
- **Services:** none.

**`npc-verecundus` — Titus Flavius Verecundus** · male, 38 (adult) · *optio*, Cohors X Urbana, commander of the Forum day patrol [G] · `cohortes-urbanae`, rank `optio` · essential: no · v0.1-Must (as the law), v0.2 (`mq-02-carcer`)
- **Home / work:** `castra-praetoria` / `statio-cohortium-urbanarum`. **Schedule:** h1 `statio-cohortium-urbanarum:guard` · h2 patrol route [`statio-cohortium-urbanarum`, `rostra`, `basilica-julia-gradus`, `temple-castor-pollux`, `tabernae-aemiliae`] · h7 `statio-cohortium-urbanarum:sit` · h8 patrol (same) · v1 `statio-cohortium-urbanarum:guard` (hands the city to the vigiles) · v2 `castra-praetoria:sleep`. On 11 May in v0.2: v1 `castor-loculi:guard` (the arrest).
- **Look:** muscular, 1.71 m, skin `#C99A72`, hair cropped `#4A3424`, clean-shaven; tunica off-white, lorica-hamata, galea-italica, sagum red; caligae; gladius, scutum-ovale (red, thunderbolt emblem).
- **Personality / voice:** by-the-book, overworked, decent. Weary humour.
- **Barks:** "Move along. Rome's big enough for everyone if everyone moves." · "Dice? On the basilica steps? I see nothing. I see everything." · "No fighting in the Forum. Fight in the Subura like civilised people." · "Before the Column, everyone's a suspect. After it, everyone's a hero."
- **Services:** bounty payment (crime confrontation, GDD §14.1).

**`npc-mus` — Dizas, called Mus ("the Mouse")** · male, 30 (adult) · a thraex dismissed from the Ludus for theft, now leader of the knife-men off the Vicus Tuscus [G] · `grassatores` (leader) · essential: no · v0.1-Must (`dun-taberna-collapsa` climax; stat block §5.2)
- **Home / work:** `dun-taberna-collapsa`. **Schedule:** v4 `porta-capena` (the murder, `mq-01`) · h1–v1 `dun-taberna-collapsa:sit` · v1–v4 `dun-taberna-collapsa:guard`.
- **Look:** slight, 1.61 m, skin `#B07D58`, hair cropped `#1B1612`, clean-shaven, a torn left ear; cucullus (hood) brown, tunica faded madder; barefoot; the curved `sica-muris` (NEW unique) and a pugio.
- **Personality / voice:** quick, vain, resentful; talks about the arena as if he were still the star. Thracian oaths.
- **Barks:** "Thirty-one bouts! And they threw me out for a cloak." · "Up from under, like a thraex finishing a man on his knees." · "The mice eat what the lions leave." · "Who sent you? Glaucus? Tell him the Mouse still bites."
- **Services:** none.

### 2.B Historical figures who appear in v0.1–v0.2

All are **essential** (GDD §2.5 fixed stars, plus Juvenal and Suetonius from the same list, and Soranus and Crito). None is ever a combat target. Their lines are opinion, never invented "facts". Handling for the ones who do **not** appear is in §2.F.

**`npc-traianus` — Imperator Caesar Nerva Traianus Augustus (Trajan)** · male, 59 (middle) · emperor · essential (never approachable in v0.1–v0.2) · v0.1-Should (a distant glimpse), v0.2 (the dedication)
- **Where:** `domus-augustana` (offstage). **Schedule (11 May, v0.1-Should):** h11 walks on foot down the `clivus-palatinus`, along the `via-sacra` to `forum-trajan` to inspect the dedication preparations, and back by v1; a togate praetorian cordon keeps everyone ≥ 25 m away; 24 lictors with laurelled fasces walk ahead [A: 24 for the emperor, society §6.4]. **12 May (v0.2):** on the steps of `temple-venus-genetrix`, then at `column-trajan`.
- **Look:** tall for a Roman, heavy, 1.78 m, skin `#C99A72` (weathered), hair cropped (a straight forward fringe) `#8A8580` going white [A: Pliny *Pan.* 4], clean-shaven; tunica white, toga toga-white with a purple border (`toga`, trim `#5B1F3B`) on ceremonial days; calcei red (the patrician *mullei*). No armour inside the city.
- **Personality / voice:** bluff, direct, soldierly; easy with ordinary people (*civilitas*). He is never given a line the player can answer. Overheard lines only.
- **Barks (overheard at ≥ 25 m):** "Well, Apollodorus? Does it stand?" · "Let them come close. They paid for it." · "Tomorrow the gods, and then the East." · (to a soldier) "Commilito! Were you at Sarmizegetusa? So was I. Wet, wasn't it?"
- **Services:** none. **Crowd reaction:** "Ave, optime princeps!" (the informal *optimus*; never *dominus et deus*, GDD §2.2).

**`npc-apollodorus` — Apollodorus of Damascus** · male, about 55 (middle) [U age] · architect of the Forum, Column and Baths of Trajan [A] · essential · v0.1 (present, talkable), v0.2 (`misc-facies-columnae`)
- **Home / work:** an Esquiline house (offstage) / `forum-trajan`. **Schedule:** h1 `forum-trajan:work` · h4 `officina-columnae:talk` · h7 `basilica-ulpia:work` · h10 `column-trajan:work` · v1 offstage (`baths-trajan` direction). 11 May (the eve): h1–v1 at `column-trajan` and `officina-columnae`.
- **Look:** average, 1.67 m, skin `#B07D58`, hair curly-short `#4A3424` greying, **beard short** (a Greek-speaking Syrian intellectual: reads as Greek, GDD §3.6), tunica-long undyed under a pallium-like lacerna `#A5916C`; calcei; a wax tablet and a bronze measuring rod.
- **Personality / voice:** brilliant, impatient, contemptuous of amateurs, tender about stone. Thinks in numbers. Greek oaths (*Ma Dia*).
- **Barks:** "A hundred feet of Luna marble and they ask me if it will fall down." · "Measure twice. Carve once. Pray never." · "The frieze climbs like the army did: slowly, and in the rain." · "Domes? Domes are for people who draw pumpkins." (the in-joke of Dio 69.4 [A, anecdote U]; he never names Hadrian in v0.1–v0.2)
- **Services:** none (story ally from `mq-11`).

**`npc-iuvenalis` — Decimus Iunius Iuvenalis (Juvenal)** · male, about 55 (middle) [U] · satirist, a poor client in Rome [P] · essential · v0.1
- **Home / work:** a third-floor *cenaculum* (offstage, Subura) / `basilica-julia-gradus`. **Schedule:** h1 `domus-sergii:stand` (in the salutatio queue; v0.2 onward) · h2 `rostra:stand` (heckles the crier) · h3–h7 `basilica-julia-gradus:sit` · h7 `popina-vici-tusci:sit` · h9 `baths-titus` (offstage) · v1 `popina-vici-tusci:drunk` · v2 offstage.
- **Look:** slight, 1.64 m, skin `#C99A72`, hair receding `#8A8580`, clean-shaven but badly (a client must look respectable), a threadbare toga (`toga` `#D8CFBA`, patched) over a grey tunica; calcei split at the toe; a wax tablet he scribbles on.
- **Personality / voice:** bitter, hilarious, unfair, observant; complains in long cadenced sentences. He is drafting; he never quotes his later Satires (no *panem et circenses*, society §7.6).
- **Barks (original, in his manner):** "In Rome even the smoke from your neighbour's kitchen costs you a tip." · "They've built a column a hundred feet high so the rich can look down on us from even further away." · "I was a client at dawn, a pedestrian at noon and a target at night. A full day." · "Another Greek. Another Syrian. Another cook who calls himself a philosopher." · "Make your will before you walk under a window. I've made mine. I'm leaving everything to the landlord; he takes it anyway." · "If you want honesty, try the gladiators. At least they admit they'll kill you."
- **Services:** none. Gossip (rumours of the day, GDD §14.7 popina rumours).

**`npc-suetonius` — Gaius Suetonius Tranquillus** · male, 43 (middle) · scholar, holder of the posts *a studiis* and *a bibliothecis* [A posts, P timing] · essential · v0.2
- **Home / work:** offstage / `bibliotheca-ulpia-west`. **Schedule:** h2–h10 `bibliotheca-ulpia-west:work` · h10 `forum-trajan:wander` · v1 offstage.
- **Look:** slight, 1.65 m, skin `#DDB48F`, hair cropped `#4A3424`, clean-shaven; tunica white with narrow equestrian stripes (`clavi: narrow`, `#5B1F3B`), lacerna grey; calcei; gold ring (an eques).
- **Personality / voice:** gossipy, precise, delighted by scandal in old documents, timid about present ones.
- **Barks:** "Did you know the deified Julius wrote his secret letters with every letter moved three places? Delightful." · "Overdue is a sin. Stolen is a crime. Burned is a tragedy." · "I collect the emperors' habits. The dead ones."
- **Services:** none (v0.2: cipher hint in `mq-03`; books later).

**`npc-soranus` — Soranus of Ephesus** · male, about 40 (adult) [U] · Greek physician practising in Rome [P, Suda] · essential · v0.2
- **Home / work:** offstage / `temple-aesculapius`. **Schedule:** h2–h6 `temple-aesculapius:work` (visits the sick in the porticoes) · h7 `insula-tiberina:wander` · h9 offstage.
- **Look:** slight, 1.66 m, skin `#C99A72`, hair curly-short `#2A1D14`, **beard full** (Greek physician), tunica-long white, pallium `#A5916C`; soleae; a case of bronze instruments.
- **Personality / voice:** calm, exact, compassionate; dislikes superstition but respects the god's house.
- **Barks:** "Fevers have causes. Gods have priests. I deal in causes." · "Bathe less, walk more, and stop eating oysters." · "He was dying. Now he is not. Write that down: it is the only part that matters."
- **Services:** `healer` (heal wounds 2 den., cure disease 5 den., GDD §7.2), trainer `medicina` (Expert 70) from v0.2.

**`npc-plotina`, `npc-matidia`, `npc-celsus`, `npc-similis`, `npc-phaedimus`, `npc-crito`** · the dedication party, **v0.2 only** (12 May, `mq-04`), all essential, no dialogue trees (one overheard line each, below).

| ID | Who | Look (Appearance) | Placement 12 May | Overheard line |
|---|---|---|---|---|
| `npc-plotina` | Pompeia Plotina Augusta | slight, 1.55 m, skin `#DDB48F` (pale by design), hair `trajanic-tower` `#4A3424` (the tall frontal crest), stola sea-green `#5E9A8A`, palla-fina white; calcei | beside Trajan, `temple-venus-genetrix` steps | "Let the dedication be short, Marcus. The gods are patient; the crowd is not." |
| `npc-matidia` | Matidia Augusta (praenomen doubted; society §1.2) | average, 1.56 m, skin `#DDB48F`, hair `trajanic-tower` `#2A1D14`, stola violet `#6B3A6E`, palla saffron | behind Plotina | "My mother would have loved this. She liked things that were tall and finished." |
| `npc-celsus` | L. Publilius Celsus (cos. II 113) | heavy, 1.69 m, skin `#C99A72`, hair cropped `#8A8580`, tunica with `clavi: wide`, toga-fina; calcei (black senatorial) | front row of senators | "A column, a temple, a war. The man never rests, and so none of us may." |
| `npc-similis` | Ser. Sulpicius Similis, praetorian prefect [U tenure] | average, 1.68 m, skin `#B07D58`, hair cropped `#CFCBC4`, toga over a tunic, sword hidden (the *cohors togata*, society §9.1) | at Trajan's left | "Everyone within thirty paces is mine today. Everyone." |
| `npc-phaedimus` | M. Ulpius Phaedimus, Trajan's freedman (*a potione*), 24 [A] | slight, 1.70 m, skin `#DDB48F`, hair cropped `#2A1D14`, tunica-linea white, gold ring | carries the emperor's cup | "Watered, Caesar, as you asked. Lightly." |
| `npc-crito` | T. Statilius Crito, Trajan's physician [A] | slight, 1.64 m, skin `#C99A72`, beard full (Greek doctor), pallium | near the Column's door; first to reach the wounded Gratus | "Lay him flat. Press there. No, harder. Good." |

**`npc-vestalis-maxima` — Cassia Lucilla, Virgo Vestalis Maxima** [G: the names of the Vestals in 113 are unknown, society §2.5] · female, 47 (middle) · chief Vestal · essential (sacrosanct) · v0.2 (`misc-argei`; `mq-10` later)
- **Home / work:** `atrium-vestae` / `temple-vesta`. **Schedule:** h1–h6 `temple-vesta:pray` · h6 `atrium-vestae:sit` · v1 `atrium-vestae:sleep`. 14 May h3–h5 `pons-sublicius:pray` (the Argei).
- **Look:** slight, 1.56 m, skin `#DDB48F`, hair `vestal` (*seni crines* under the *infula*), white woollen dress (`stola` `#F1EEE6`) with the *suffibulum* (white veil, `trim` purple) for rites; calcei white. A lictor walks before her (`npc-lictor-vestalis`, unnamed extra).
- **Personality / voice:** grave, formal, unexpectedly witty in private.
- **Barks:** "The fire does not care who you are. Neither do I." · "Twenty-seven of rush, as our fathers made them." · "Stand back, citizen. The goddess is not a sight for gawkers."
- **Services:** none.

### 2.C Faction people

#### Vigiles, Cohors V (`vigiles`)

**`npc-vindex` — Tiberius Claudius Vindex** · male, 50 (middle) · tribune of the 5th Cohort of the Vigiles [G person, GDD §9.1] · `vigiles`, leader · essential · v0.3 (cameo in `vig-01` from v0.2 if pulled forward)
- **Home / work:** `statio-vigiles-v`. **Schedule:** h1 `statio-vigiles-v:work` · h7 `statio-vigiles-v:sit` · v1 patrol route [`statio-vigiles-v`, `porta-capena`, `excubitorium-velabri`, `statio-vigiles-v`] · v4 `statio-vigiles-v:sleep` (the vigiles sleep by day; he doesn't).
- **Look:** heavy, 1.69 m, skin `#B07D58`, hair cropped `#8A8580`, clean-shaven, burn scar on the neck; tunica faded madder, belt with a bronze buckle, paenula brown; caligae; helmet `vigiles-cap`; dolabra.
- **Personality / voice:** gruff, practical, protective of his freedmen; despises landlords. Speaks in orders.
- **Barks:** "Water in every flat. Every flat. I'll beat it into them if I must." · "A landlord's dream is a fire with no witnesses." · "Freedmen, Latins, nobodies: on a ladder they're all the same height." · "Smell that? Pitch. Nobody cooks with pitch."
- **Services:** trainer `athletics` (Expert 70, from v0.3).

**`npc-ursulus` — Marcus Antonius Ursulus** · male, 42 (middle) · *optio* of the vigiles, commander of the Velabrum post [G] · `vigiles`, `optio` · essential: no · v0.2 pull-forward (`vig-01` giver)
- **Home / work:** `excubitorium-velabri`. **Schedule:** h1 `excubitorium-velabri:sleep` · h7 `excubitorium-velabri:sit` · v1 `excubitorium-velabri:guard` · v2 patrol [`excubitorium-velabri`, `insula-nutans`, `insula-ardens`, `forum-boarium`, `excubitorium-velabri`] · v4 `excubitorium-velabri:sit`.
- **Look:** stocky, 1.65 m, skin `#C99A72`, hair cropped `#4A3424`, clean-shaven; tunica brown, paenula; caligae; `vigiles-cap`; dolabra and a coiled rope.
- **Personality / voice:** loud, funny, fearless in fire and nervous with officials.
- **Barks:** "Buckets! Who's got hands? You've got hands!" · "The gods made fire. The Velabrum made it worse." · "Don't look at the flames. Look at your feet." · "Four flights up, no water, a straw mattress and a lamp. That's not a home, that's kindling."
- **Services:** trainer `athletics` (Common 40).

**`npc-primigenius` — Quintus Vibius Primigenius** · male, 29 (adult) · *sebaciarius* (torch-man of the night patrol) [A for the rank, G person] · `vigiles`, `sebaciarius` · essential: no · v0.1-Must (night law; the "lanterned vigiles" of AC-10)
- **Home / work:** `excubitorium-velabri`. **Schedule:** h1–h9 `excubitorium-velabri:sleep` · h9 `excubitorium-velabri:sit` · v1 patrol [`excubitorium-velabri`, `compitum-vici-tusci`, `popina-vici-tusci`, `signum-vortumni`, `castor-loculi`, `basilica-julia-gradus`, `compitum-velabri`, `excubitorium-velabri`] · v4 `excubitorium-velabri:sit`.
- **Look:** slight, 1.63 m, skin `#8E5E3E`, hair cropped `#1B1612`; tunica undyed, paenula; caligae; a lantern on a pole (torch model, warm light `#FFA54F`); fustis.
- **Personality / voice:** cheerful insomniac, a Junian Latin counting the days to citizenship (Lex Visellia, GDD §9.2).
- **Barks:** "Fourth year in the watch. Two more and I'm a citizen. Two more!" · "Lamp out? Good. Lamp lit? Mind it." · "Beans tonight, friend. Ghosts about. Stay in." (Lemuria) · "*Quis est?* Oh. Just you. Walk on."
- **Services:** none (law: night jurisdiction, GDD §14.1).

**`npc-daos` — Daos** · male, 35 (adult) · *siphonarius* (pump man) of the vigiles, a Junian Latin from Thrace [G] · `vigiles`, `siphonarius` · essential: no · v0.2 pull-forward (`vig-01`)
- **Home / work:** `excubitorium-velabri`. **Schedule:** as Primigenius, but at v1 `excubitorium-velabri:work` (oils the pump) and patrols only when called.
- **Look:** muscular, 1.70 m, skin `#C99A72`, hair long-tied `#6B3A22` (Thracian), beard short (a foreigner's beard, GDD §3.6); tunica-short brown, apron of wet leather; barefoot.
- **Personality / voice:** taciturn, strong, sings work songs in Thracian.
- **Barks:** "Push. Pull. Push. Pull. The fire doesn't rest; why should you?" · "My pump, my baby. Touch it and I'll drown you." · "Water's heavy. Fire's heavier."
- **Services:** none.

#### Ludus Magnus (`ludus-magnus`)

**`npc-glaucus` — Glaucus** · male, 46 (middle) · *doctor* (chief trainer), a Thracian-born *rudiarius* [G person, GDD §9.1] · `ludus-magnus`, leader · essential · v0.1-Must (`lud-01` giver)
- **Home / work:** `ludus-cellae` / `ludus-cavea`. **Schedule:** h1–h6 `ludus-cavea:work` (drills) · h6 `ludus-cellae:sit` · h8–h10 `ludus-cavea:work` · h10 `ludus-cellae:talk` · v1 `ludus-cellae:sleep`.
- **Look:** muscular, 1.72 m, skin `#B07D58`, hair cropped `#8A8580`, clean-shaven, many scars (one across the nose); tunica-short undyed, broad leather belt (balteus); barefoot on the sand; carries a long practice stick (`fustis` model) and a *rudis* on his belt (his own, the token of his freedom).
- **Personality / voice:** patient, sarcastic, fatherly; judges people by their feet. Calls everyone "tiro" until they win.
- **Barks:** "Feet first, then the shield, then the sword. Then your mouth, if there's time." · "You parry with the eyes. The arm only agrees." · "The crowd isn't cruel, tiro. It's bored. Don't bore it." · "I got this stick after forty bouts. You'll get a bruise after four." · "Guest or sworn? Make up your mind before the sand does."
- **Services:** trainer `blades` (Expert 70); `lanista` (bouts; v0.3 radiant `rad-lud-pugna`).

**`npc-celer` — Sextus Attius Celer** · male, 55 (middle) · imperial procurator of the Ludus Magnus, an equestrian [G person; procurators ran the imperial ludi, A] · `ludus-magnus` · essential · v0.1 (ambient), v0.2+ (contracts)
- **Home / work:** offstage / `ludus-magnus`. **Schedule:** h2–h6 `ludus-cellae:work` (the office) · h6 offstage.
- **Look:** heavy, 1.66 m, skin `#DDB48F`, hair receding `#CFCBC4`, clean-shaven; tunica with `clavi: narrow`, toga; calcei; gold ring; a slave with tablets follows.
- **Personality / voice:** an accountant of blood; polite, cold, counts everything in pairs.
- **Barks:** "Each pair costs Caesar more than a ship. Fight like it." · "Guests sign here. The sworn sign there. The dead sign nothing." · "The Column will want games. Games want men."
- **Services:** none.

**`npc-hermippus` — Hermippus of Cos** · male, 60 (old) · physician (*medicus*) of the Ludus, in the *saniarium* [G] · `ludus-magnus` · essential: no · v0.1-Must (golden path: "the Ludus medicus patches you up and tells you to rest", GDD §17.2)
- **Home / work:** `ludus-saniarium`. **Schedule:** h1–v1 `ludus-saniarium:work` · v1 `ludus-saniarium:sleep`.
- **Look:** slight, 1.62 m, skin `#DDB48F`, hair receding `#CFCBC4`, **beard full** (Greek physician), tunica-long white, apron; soleae; bronze probe and a bowl of vinegar.
- **Personality / voice:** brisk, kind, unimpressed by heroics; quotes the old Hippocratic sayings in Greek and translates them wrongly on purpose.
- **Barks:** "Vinegar, honey and silence. Mostly silence." · "Lie down. You'll be a hero tomorrow; today you're a patient." · "The best wound is the one you stepped away from." · "Rest till the lamps are lit. Doctor's orders, and the doctor is me."
- **Services:** `healer` (treat wounds 2 den., GDD §7.2; free for Ludus fighters during `lud-01`), vendor `medicus` (stock: `fascia` 10, `emplastrum` 4, `collyrium` 2, `posca` 6; purse 150), trainer `medicina` (Common 40).

**`npc-successus` — Successus** · male, 38 (adult) · keeper of the armory, an imperial slave (*Caesaris servus*) [G] · `ludus-magnus` · essential: no · v0.1-Must
- **Home / work:** `ludus-armamentarium`. **Schedule:** h1–h11 `ludus-armamentarium:work` · h11 `ludus-cellae:sit` · v1 `ludus-armamentarium:sleep`.
- **Look:** stocky, 1.60 m, skin `#8E5E3E`, hair cropped `#1B1612`, clean-shaven; tunica-short brown, leather apron; barefoot; a tally stick.
- **Personality / voice:** possessive about every wooden sword; keeps lists in his head.
- **Barks:** "One rudis, one shield, one signature. Bring them back or I'll know." · "That scutum has blocked more blows than you've thrown." · "Wood for practice, iron for Caesar."
- **Services:** issues the Ludus kit (`rudis`, `scutum` or `parmula`, tagged `ludus-issued`, returned on leaving the Ludus); vendor `lanista` (arena kit; stock: `manica-linea` 2, `ocrea` 2, `ocreae` 1, `fasciae` 4, `subarmalis` 1, `galea-thraecis` 1, `galea-murmillonis` 1, `rete` 1; purse 400).

**`npc-asiaticus` — Asiaticus** · male, 58 (old) · *summa rudis* (chief referee), a retired *rudiarius* [A for the office, G person] · `ludus-magnus` · essential: no · v0.1-Must
- **Home / work:** `ludus-cellae` / `ludus-cavea`. **Schedule:** h2–h6 `ludus-cavea:guard` (referees bouts) · h6 `ludus-cellae:sit` · h8–h10 `ludus-cavea:guard` · v1 `ludus-cellae:sleep`.
- **Look:** slight, 1.65 m, skin `#C99A72`, hair bald, clean-shaven; tunica white with two red bands at the hem (the referee's), a long staff (*rudis*, `fustis` model).
- **Personality / voice:** loud, ceremonious; announces everything in the third person like a herald. The tutorial voice of `lud-01`.
- **Barks:** "Shields up! The sand is hungry!" · "A finger! He raises a finger! Ad digitum!" · "Step apart! Step apart, I said, or I'll part you." · "The crowd asks: *Mitte!* or *Iugula?* Today, it asks *Mitte!*"
- **Services:** trainer `shield` (Common 40).

**`npc-pullus` — Pullus** · male, 19 (young) · *tiro*, a free volunteer (*auctoratus*) from Capua [G] · `ludus-magnus`, `tiro` · essential: no (lusio: cannot die) · v0.1-Must (bout 1; stat block §5.2)
- **Home / work:** `ludus-cellae` / `ludus-cavea`. **Schedule:** gladiator template (GDD §14.7): h1–h6 `ludus-cavea:work` · h6 `ludus-cellae:sit` · h8–h10 `ludus-cavea:work` · v1 `ludus-cellae:sleep` (locked in).
- **Look:** slight, 1.66 m, skin `#DDB48F`, hair cropped `#4A3424`, a light first beard (*barbatulus*, a youth's, GDD/architecture §6.2); subligaculum white, balteus; barefoot; rudis, scutum (practice).
- **Personality / voice:** eager, frightened, boastful by turns. Wants to send money home.
- **Barks:** "My mother thinks I'm a baker." · "Is it true they throw roses? Or is it just the bread?" · "Go easy. Not too easy. Medium."
- **Services:** none.

**`npc-auctus` — Auctus** · male, 31 (adult) · thraex *veteranus*, a slave of the imperial school, Gallic-born [G] · `ludus-magnus`, `veteranus` · essential: no · v0.1-Must (bout 2; reveals Mus)
- **Home / work, schedule:** gladiator template, as Pullus.
- **Look:** muscular, 1.68 m, skin `#DDB48F` (sunburned), hair cropped `#6B3A22`, clean-shaven; subligaculum, balteus, high greaves (`greaves: both`), manica right; helmet `thraex` (griffin crest) for bouts; rudis-curved practice blade (`sica-lusoria`, NEW) and parmula.
- **Personality / voice:** wry, honest, likes the player after losing to them. Knew Mus well.
- **Barks:** "The thraex fights low. Watch my feet, not my sword." · "Thirty bouts, eighteen wins, eleven *missio*, one draw. And a cold." · "Up from under, that's the thraex's stroke. Nobody else uses it in the street."
- **Services:** none.

**`npc-nereus` — Nereus** · male, 34 (adult) · champion *retiarius*, "victor of 31" [G] · `ludus-magnus`, `palus-secundus` · essential (v0.1: a lusio; he yields) · v0.1-Must (**`boss-nereus`**, §5.3)
- **Home / work, schedule:** gladiator template; v1 `ludus-cellae:sit` (mends nets).
- **Look:** slight, 1.75 m, skin `#8E5E3E`, hair curly-short `#1B1612`, clean-shaven, no helmet (the retiarius' bare face); subligaculum white, balteus, manica left, galerus on the left shoulder; barefoot; practice trident and net.
- **Personality / voice:** graceful, theatrical, generous to good opponents; superstitious (kisses the net before every bout). Talks to the crowd more than to the opponent.
- **Barks:** "The net has no edges. Only patience." · "Thirty-one wins, and I still pray before each one." · "You blocked my net with your shield? Clever. Do it again." · "*Non te peto, piscem peto!* I'm after the fish, not you. Old habit." (the retiarius' chant to the fish-crested murmillo, Festus s.v. *retiario* [A])
- **Services:** trainer `spear` (Common 40) after `lud-01` completes.

#### Urban Cohorts (`cohortes-urbanae`)

**`npc-rufus` — Gaius Fulvius Rufus** · male, 47 (middle) · tribune of Cohors X Urbana [G person, GDD §9.1] · `cohortes-urbanae`, leader · essential · v0.3 (cameo)
- **Home / work:** `castra-praetoria` / `statio-cohortium-urbanarum`. **Schedule:** h1–h3 `statio-cohortium-urbanarum:work` · h3 `castra-praetoria:work` · v1 `castra-praetoria:sleep`.
- **Look:** average, 1.70 m, skin `#C99A72`, hair cropped `#4A3424`, clean-shaven; tunica white, thorax-musculus bronze, sagum red; caligae; galea-attica with a white crest; vitis.
- **Personality / voice:** ambitious, intelligent, contemptuous of the vigiles.
- **Barks:** "Order is a habit. Break it once and the whole city forgets." · "The vigiles catch drunks. We catch the men who buy them drinks." · "Citizens only. That's not snobbery, it's law."
- **Services:** none.

**`npc-proculus` — Gnaeus Pompeius Proculus** · male, 40 (adult) · *optio* and drillmaster of Cohors X Urbana [G] · `cohortes-urbanae`, `optio` · essential: no · v0.3 pull-forward (`urb-01` giver)
- **Home / work:** `castra-praetoria` / `statio-cohortium-urbanarum`. **Schedule:** h1–h4 `rostra:guard` (drills recruits in the Forum at dawn) · h4 `statio-cohortium-urbanarum:work` · h8 patrol (as Verecundus) · v1 `castra-praetoria:sleep`.
- **Look:** muscular, 1.68 m, skin `#B07D58`, hair cropped `#1B1612`, clean-shaven; tunica off-white, lorica-segmentata, galea-gallica; caligae; vitis; scutum (red).
- **Personality / voice:** bellowing, fair, fond of proverbs he gets slightly wrong.
- **Barks:** "Shields touching! If a fly gets through, you'll eat it." · "Left! Left! The other left!" · "*Festina lente*, recruit. That means slowly. Faster!"
- **Services:** trainer `shield` (Expert 70, v0.3).

#### Cultores Lavernae (`cultores-lavernae`)

**`npc-faustus` — Quintus Opimius Faustus, "the Fuller"** · male, 52 (middle) · magister of the Cultores Lavernae (a thieves' guild posing as a burial club) [G, GDD §9.1] · `cultores-lavernae`, `magister` · essential · v0.3 (named in `lav-01`)
- **Home / work:** `fullonica-suburana`. **Schedule:** h1–h7 `fullonica-suburana:work` (treads cloth) · h7 `fullonica-suburana:sit` · v1 `fullonica-suburana:talk` (guild business) · v3 `fullonica-suburana:sleep`.
- **Look:** heavy, 1.64 m, skin `#C99A72`, hair bald, clean-shaven; tunica-short undyed, apron, legs stained to the knee; barefoot.
- **Personality / voice:** jovial, sentimental, ruthless. Talks about the club's funerals with real feeling.
- **Barks:** "We bury our members with honour. Some of them sooner than others." · "Minerva for the fullers, Laverna for the rest of us." · "Clean hands are a fuller's whole trade."
- **Services:** trainer `locks-seals` (Expert 70, v0.3).

**`npc-chrysis` — Opimia Chrysis** · female, 27 (adult) · freedwoman of Faustus, recruiter and pickpocket; sells garlands in the Velabrum as cover [G] · `cultores-lavernae`, `sector-zonarius` · essential: no · v0.2 pull-forward (`lav-01` giver)
- **Home / work:** `fullonica-suburana` / `compitum-velabri`. **Schedule:** h2–h7 `forum-boarium:wander` (garlands; lifts) · h7 `compitum-velabri:sit` · v1 `popina-vici-tusci:talk` · v2 `caupona-carcerum:sit` · v4 offstage.
- **Look:** slight, 1.52 m, skin `#B07D58`, hair bun `#2A1D14` with a cheap bronze pin, tunica-long rose `#C77B83`, palla grey; soleae; a basket of rose and violet garlands.
- **Personality / voice:** quick, teasing, never stands still; speaks in the second person as if reading your mind.
- **Barks:** "Garlands! For the dead, for the living, for the girl you shouldn't." · "You walk like a man with a full purse. Careful." · "Laverna loves the light-fingered and the light-hearted." · "Smile, citizen. It costs nothing, which is all you've got left."
- **Services:** vendor (garlands, `tus`, `libum`; purse 20), trainer `pickpocket` (Common 40).

**`npc-bucco` — Bucco** · male, 35 (adult) · doorman of the guild, a former boxer [G] · `cultores-lavernae`, `fur` · essential: no · v0.2 (`lav-01` token)
- **Home / work:** `fullonica-suburana`. **Schedule:** h1–h12 `fullonica-suburana:guard` · v1 `popina-vici-tusci:drunk` (his night off, 11 May and every 4th day) · v3 `fullonica-suburana:sleep`.
- **Look:** heavy, 1.70 m, skin `#C99A72`, hair cropped `#1B1612`, cauliflower ears, clean-shaven; tunica-short brown, balteus with a bronze guild token (`tessera-lavernae`, NEW) hanging from it; caestus tucked in the belt.
- **Personality / voice:** slow, sentimental drunk, quick fists.
- **Barks:** "Members only. Members and the dead." · "Another cup. For my mother. She's dead. Another cup." · "I had eleven fights. I won six. The other five I don't remember."
- **Services:** none.

**`npc-mustela` — "Mustela" (the Weasel)** · female, 61 (old) · fence (*receptator*) in the Subura [G] · `cultores-lavernae` · essential: no · v0.3
- **Home / work:** a back room off `fullonica-suburana`. **Schedule:** h7–v3 there:work.
- **Look:** slight, 1.48 m, skin `#DDB48F`, hair bun `#CFCBC4`, tunica-long grey, three palla layers whatever the weather; soleae; scales.
- **Personality / voice:** sweet as honey, hard as a coin; calls every object "a pretty thing".
- **Barks:** "Pretty thing. Hot, but pretty." · "Half the price, twice the safety." · "I never saw you. I never see anyone."
- **Services:** vendor `receptator` (fence: 50% of sell price, GDD §7.4; purse 400).

#### The Mithraic cell (`sodales-invicti`)

**`npc-alcimus` — Alcimus** · male, 50 (middle) · steward (*vilicus*) and slave of Ti. Claudius Livianus [A: CIL VI 718, a real dedicant], Pater of the cell [G role] · `sodales-invicti`, `pater` · essential · v0.6 (named in `mit-01`, pull-forward possible)
- **Home / work:** the Livianus household (offstage) / `spelaeum-horreorum`. **Schedule:** h1–h10 offstage · v2 `spelaeum-horreorum:pray` · v4 offstage.
- **Look:** average, 1.65 m, skin `#B07D58`, hair cropped `#8A8580`, clean-shaven; by day tunica white of good wool; in the cave a red cloak (`sagum` `#9E3B2E`) and a Phrygian cap (`pileus`); calcei.
- **Personality / voice:** quiet authority; a slave who commands free men underground. Speaks in images (light, the bull, the cave).
- **Barks:** "Below the earth, every man is the same height." · "Silence is the first grade. Most fail it." · "The sun is invincible. We merely try to be patient."
- **Services:** none.

**`npc-ingenuus` — Lucius Aemilius Ingenuus** · male, 30 (adult) · soldier of a praetorian cohort, a Mithraic *miles* [G] · `sodales-invicti`, `miles` (grade) · essential: no · v0.2 (vouches; `mit-01`)
- **Home / work:** `castra-praetoria`. **Schedule:** h1–h8 offstage (duty) · h8 `baths-titus` (offstage) · v1 `caupona-carcerum:sit` (off duty, every night) · v2 `castra-praetoria:sleep`.
- **Look:** muscular, 1.74 m, skin `#C99A72`, hair cropped `#2A1D14`, clean-shaven; off duty: tunica white, sagum; caligae; a sword belt with no sword (left at the camp; praetorians don't parade armed in town).
- **Personality / voice:** earnest, sober (unusually for the caupona), watches how people treat the defeated.
- **Barks:** "I saw you spare that man. Most don't." · "The Guard drinks too much. I drink water and listen." · "Ask me no questions about the dark, and I'll tell you no lies about it."
- **Services:** none.

#### Clientela (`clientela`)

**`npc-patron-sergius` — Marcus Sergius Bassus** · male, 61 (old) · consular, a general of the Dacian wars and a war hawk [G, GDD §9.1] · `clientela`, patron · essential · v0.2 (agent only), v0.6
- **Home / work:** `domus-sergii`. **Schedule:** h1 `domus-sergii:talk` (salutatio) · h2 `curia-julia` or `forum-trajan:wander` (Senate days: Kalends and Ides) · h8 `baths-trajan` (offstage) · h9 `domus-sergii:sit` (cena) · v2 sleep.
- **Look:** heavy, 1.71 m, skin `#B07D58` (campaign-tanned), hair cropped `#CFCBC4`, clean-shaven; tunica with `clavi: wide`, toga-fina; calcei (black senatorial).
- **Personality / voice:** bluff, generous, bullying; talks of Parthia like a hunting trip.
- **Barks:** "Ctesiphon by next summer. Mark me." · "A client who doesn't come at dawn is a client who doesn't come." · "The Senate debates. Caesar decides. I advise."
- **Services:** sportula (1 den. 9 as.) to attending clients.

**`npc-patron-calpurnia` — Calpurnia Severa** · female, 48 (middle) · Baetican widow of Corduba in Plotina's circle [G, GDD §9.1] · `clientela`, patroness · essential · v0.2 (agent; letter for the `hispanus` origin)
- **Home / work:** `domus-calpurniae`. **Schedule:** h1 salutatio · h3 `domus-augustana` (offstage, Plotina's rooms) · h8 `thermae-suranae` (offstage) · h9 cena.
- **Look:** slight, 1.56 m, skin `#DDB48F`, hair `trajanic-tower` `#2A1D14`, stola-fina violet, palla-fina saffron; calcei; pearl earrings.
- **Personality / voice:** cultivated, Epicurean, amused, ruthless about loyalty. Spanish accent in a Roman salon.
- **Barks:** "Pleasure, my dear, is the absence of pain. And of fools." · "The empress reads everything. So do I." · "A countryman of Caesar's? Then sit, and tell me what Corduba eats now."
- **Services:** sportula.

**`npc-patron-vettius` — Sextus Vettius Crispinus** · male, 70 (old) · old Italian senator, sceptical of the war's cost [G, GDD §9.1] · `clientela`, patron · essential · v0.2 (agent), v0.6
- **Home / work:** `domus-vettii`. **Schedule:** h1 salutatio · h2 `curia-julia` (Senate days) · h4 `domus-vettii:sit` · v1 sleep.
- **Look:** slight, 1.62 m, skin `#C99A72`, hair receding `#CFCBC4`, clean-shaven; tunica with `clavi: wide`, toga (worn and old-fashioned), calcei with the ivory crescent (a patrician, architecture §6.7).
- **Personality / voice:** courteous, dry, nostalgic; quotes Cato; worries about money.
- **Barks:** "Wars are paid for twice: once in silver and once in sons." · "In my father's day a senator walked. Now he is carried, and calls it progress." · "Sit, sit. The young stand too much."
- **Services:** sportula.

**`npc-phoebus` — Marcus Sergius Phoebus** · male, 40 (adult) · freedman and business agent of Sergius Bassus · `clientela` · essential: no · v0.2 (`mq-02-carcer` agent)
- **Schedule:** h1 `domus-sergii:work` · h3 `tabernae-aemiliae:talk` (business) · h8 `basilica-aemilia:work` · v1 `domus-sergii:sleep`.
- **Look:** heavy, 1.64 m, skin `#B07D58`, hair cropped `#2A1D14`, clean-shaven; tunica-linea white, lacerna blue `#3F5A7A`; calcei; too many rings (a rich freedman, society §3.8).
- **Personality / voice:** oily, efficient, loyal; enjoys his master's power.
- **Barks:** "My patron remembers his friends. He also remembers the others." · "Everything has a price. Fortunately, my patron has money."
- **Services:** none.

**`npc-theodote` — Calpurnia Theodote** · female, 35 (adult) · freedwoman secretary of Calpurnia Severa · `clientela` · essential: no · v0.2 (agent)
- **Schedule:** h1 `domus-calpurniae:work` · h4 `bibliotheca-ulpia-west:work` (fetches books) · v1 sleep.
- **Look:** slight, 1.55 m, skin `#C99A72`, hair bun `#2A1D14`, tunica-long sky `#7FA4C9`, palla white; soleae; tablets.
- **Personality / voice:** precise, guarded, kind under it; reads people like letters.
- **Barks:** "My lady asks. My lady never orders." · "Write it down; memory is a liar."
- **Services:** `scribe` (letters 4 as.).

**`npc-pollio` — Lucius Vettius Pollio** · male, 26 (adult) · grand-nephew and client of Vettius Crispinus, a young advocate [G] · `clientela` · essential: no · v0.2 (agent)
- **Schedule:** h2–h7 `basilica-julia:work` (the courts) · h7 `basilica-julia-gradus:talk` · h9 `domus-vettii:sit`.
- **Look:** slight, 1.70 m, skin `#DDB48F`, hair cropped `#4A3424`, clean-shaven; tunica with `clavi: narrow`, toga; calcei; ink on the fingers.
- **Personality / voice:** idealistic, nervous, eloquent once warmed up; quotes Cicero to himself.
- **Barks:** "Four panels of judges and every one of them asleep." · "Justice is slow. Injustice takes a litter." · "My great-uncle says I talk too much. He is right, and here is why."
- **Services:** trainer `rhetoric` (Expert 70).

**`npc-philargyrus` — Philargyrus** · male, 45 (middle) · door slave (*ostiarius*) and nomenclator of Sergius Bassus · — · essential: no · v0.6 (`cli-01`)
- **Schedule:** v4–h3 `domus-sergii:guard` (the door) · h3 `domus-sergii:work` · v1 sleep.
- **Look:** heavy, 1.66 m, skin `#B07D58`, hair cropped `#1B1612`, clean-shaven; tunica-linea white, a chained bronze tag; soleae.
- **Personality / voice:** the tip-taker of Juvenal's complaints; knows every client's name and price.
- **Barks:** "Your name, citizen? Ah. Wait there. No, further." · "The master is very busy. The master is less busy for an as." · "Togas to the left. Tunics, the street."
- **Services:** none.

#### Circus factions (`factio-prasina`, `factio-veneta`)

**`npc-felix` — Gaius Sentius Felix** · male, 57 (middle) · *dominus factionis* of the Greens [G, GDD §9.1] · `factio-prasina`, leader · essential · v0.4 (named in `cir-01`)
- **Schedule:** h2–h7 `stabula-factionum:work` · h7 `circus-maximus:wander` (club rooms in the arcades) · v1 offstage.
- **Look:** heavy, 1.65 m, skin `#C99A72`, hair cropped `#8A8580`, clean-shaven; tunica with `clavi: narrow` (an eques), lacerna green `#3E7A44`; calcei; gold ring.
- **Personality / voice:** sentimental about horses, cold about men.
- **Barks:** "Horses don't lie. Charioteers do nothing else." · "Green is the colour of spring, and of money." · "*Favent panno*, the snobs say. Let them. The cloth pays."
- **Services:** none.

**`npc-venustus` — Quintus Arrius Venustus** · male, 50 (middle) · *dominus factionis* of the Blues [G] · `factio-veneta`, leader · essential · v0.4
- **Schedule:** as Felix (the Blue stables).
- **Look:** average, 1.69 m, skin `#DDB48F`, hair cropped `#4A3424`, clean-shaven; tunica with `clavi: narrow`, lacerna blue `#3A5D8F`; calcei; gold ring.
- **Personality / voice:** smooth, aristocratic, contemptuous of the Greens' "plebeian vulgarity".
- **Barks:** "The Blues win with taste. The Greens win with noise." · "Every race is a contract. Some contracts are with the gods."
- **Services:** none.

**`npc-hierax` — Hierax** · male, 24 (young) · star charioteer of the Greens, a slave with 200 wins [G; Diocles is not active until 122, A] · `factio-prasina`, `auriga` · essential: no · v0.4
- **Look:** slight, 1.60 m, skin `#B07D58`, hair curly-short `#1B1612`, clean-shaven; short tunica green `#3E7A44`, chest bound in leather straps, leather cap; a curved knife on the belt (to cut the reins, architecture §6.6).
- **Barks:** "Inside line, every turn, or don't bother living." · "Two hundred wins. Still a slave. Still faster than you."
- **Services:** trainer `equitatio` (Expert 70, v0.4).

**`npc-aquilo` — Aquilo** · male, 28 (adult) · charioteer of the Blues, the future rival (`boss-auriga-rivalis` candidate) [G] · `factio-veneta`, `auriga` · essential: no · v0.4
- **Look:** average, 1.64 m, skin `#DDB48F`, hair cropped `#B08A4A`, clean-shaven; tunica blue `#3A5D8F`, chest straps, leather cap.
- **Barks:** "The north wind doesn't ask the road's permission." · "Green? I'll paint the spina with them."
- **Services:** none.

**`npc-epaphra` — Sentius Epaphra** · male, 45 (middle) · freedman of Felix, stable master of the Greens [G] · `factio-prasina` · essential: no · v0.4 (`cir-01` giver, Greens)
- **Schedule:** v4–h7 `stabula-factionum:work` · h7 `stabula-factionum:sit` · v1 sleep.
- **Look:** stocky, 1.62 m, skin `#8E5E3E`, hair cropped `#8A8580`; tunica-short green-dyed, apron; barefoot; a pitchfork.
- **Barks:** "Muck first, glory later. Glory smells worse." · "That's Victor. He bites. He bites everyone. He's a genius."
- **Services:** trainer `equitatio` (Common 40).

**`npc-phileros` — Arrius Phileros** · male, 39 (adult) · freedman of Venustus, stable master of the Blues [G] · `factio-veneta` · essential: no · v0.4 (`cir-01` giver, Blues)
- **Look:** slight, 1.66 m, skin `#C99A72`, hair receding `#4A3424`; tunica-short blue-dyed, apron; barefoot.
- **Barks:** "Blue stables are clean stables. Go and look at the Greens' if you want a laugh." · "Water, then barley, then prayer. In that order."
- **Services:** none.

### 2.D Vendors and service people

Stock lists use item IDs from §4 (`id count`). Purses and vendor kinds follow GDD §7.3 and `src/rpg/data/vendors.ts`; purses refresh every 2 game days. **v0.1 ships three vendors (GDD §17.1 Must): Euhodus (arms, repairs), Chreste (popina) and Philetus (aedituus).**

**`npc-euhodus` — Tiberius Claudius Euhodus** · male, 49 (middle) · arms dealer, a rich freedman; secretly a member of **The Purse** cell of the cabal (GDD §10.2) · — (`coniuratio`, masked) · **essential until `mq-06` resolves** (protected: he cannot be killed before Act II unmasks him) · **v0.1-Must vendor**
- **Home / work:** offstage (Carinae) / `taberna-armorum`. **Schedule:** h1–h6 `taberna-armorum:work` · h6 `taberna-armorum:sit` · h8–h12 `taberna-armorum:work` · v1 offstage. Closed on no day (a dealer in wartime).
- **Look:** heavy, 1.67 m, skin `#DDB48F`, hair cropped `#4A3424` (dyed), clean-shaven; tunica-linea white, lacerna faded madder; calcei; three gold rings (on a freedman: legal as jewellery, a social sneer); a scale for weighing blades.
- **Personality / voice:** charming, anxious, overfamiliar; talks about "the war" as a market. Lets slip that business with "the contractors" is very good this spring.
- **Barks:** "Iron from Noricum, steel from Bilbilis, prices from heaven." · "Parthia! Every recruit needs a sword, and every sword needs me." · "Repairs while you wait. Waiting is extra." · "No segmentata. I don't sell army plate. Officially."
- **Services:** vendor `armorum-negotiator`, **repairs** (GDD §7.3: smith's price, 10% of value per 25% condition). Purse 500. **Stock (v0.1):** `pugio 3`, `sica 1`, `gladius 3`, `gladius-noric 1`, `spatha 1`, `hasta 2`, `lancea 4`, `fustis 4`, `clava 2`, `caestus 2`, `scutum 1`, `scutum-ovale 1`, `parma 1`, `parmula 1`, `subarmalis 2`, `thorax-coriaceus 1`, `lorica-hamata 1`, `galea-gallica 1`, `galea-italica 1`, `manica-linea 2`, `ocreae 1`, `fascia 5`. **Adds in v0.2:** `funda 2`, `glans-plumbea 50`, `iaculum 6`, `pilum 2`, `hamulus 3` (under the counter: Rhetoric 25 or disposition ≥ 10).

**`npc-chreste` — Vibia Chreste** · female, 44 (middle) · keeper (*copa*) of the popina *Ad Porcum Argenteum* ("The Silver Pig"), a freedwoman [G] · — · essential: no · **v0.1-Must vendor**
- **Home / work:** the room behind `popina-vici-tusci`. **Schedule:** v4 `pistrinum-velabri:talk` (buys bread) · h1–v2 `popina-vici-tusci:work` · v2 `popina-vici-tusci:sweep` · v3 `popina-vici-tusci:sleep`.
- **Look:** stocky, 1.54 m, skin `#B07D58`, hair bun `#2A1D14` under a scarf, tunica-long saffron `#E0A526` faded, apron; soleae; a ladle.
- **Personality / voice:** loud, motherly, ruthless about debts; knows every rumour in the Velabrum and sells them with the wine. (If the player's origin is `civis-suburanus`, she becomes "the aunt" of the v0.3 origin hook.)
- **Barks:** "An as for the house wine, two for the better, four if you want to remember Campania." · "Hot chickpeas! Lupins! Sit or move, the step isn't free." · "Dice in my popina and the aedile's men will drink for free. On you." · "Knife-men in the burned taberna, so they say. I say nothing. I sell wine." · "On ghost night you pay before midnight. After midnight the dead pay, and the dead are terrible at it."
- **Services:** vendor `popina` (purse 40, buys food). **Stock:** `vinum 30`, `vinum-melius 20`, `vinum-falernum 6`, `mulsum 6`, `posca 10`, `panis 12`, `puls 8`, `botulus 8`, `caseus 6`, `olivae 6`, `ficus 6`, `lupini 10` (NEW), `cicer 10` (NEW), `patina 4`, `fabae 12` (NEW; on the Lemuria). Gossip: one rumour per day (GDD §14.7), the first being the `dun-taberna-collapsa` lead.

**`npc-philetus` — Marcus Pomponius Philetus** · male, 57 (old) · *aedituus* (custodian) of the Temple of Castor, a freedman [G] · — · essential: no · **v0.1-Must vendor**
- **Home / work:** `temple-castor-pollux` (a room in the precinct). **Schedule:** h1 `temple-castor-pollux:work` (opens the doors; on the Lemuria he stands at the shut doors instead) · h6 `temple-castor-pollux:sit` · h7–h12 `temple-castor-pollux:work` · v1 `temple-castor-pollux:sweep` (closes) · v2 sleep.
- **Look:** slight, 1.62 m, skin `#C99A72`, hair receding `#CFCBC4`, clean-shaven; tunica white, a willow wreath on feast days; soleae; a ring of bronze keys.
- **Personality / voice:** courteous, pedantic about the rules of the god's house, secretly a gossip about the bankers who use the podium vaults.
- **Barks:** "The Lemures walk tonight. The god's doors stay shut. Come back tomorrow." · "Twins, both divine, both horsemen, both patient. Unlike my visitors." · "An offering for the Dioscuri? A cake will do. A coin will do better." · "The strongrooms? Down the side, under the podium. They're not the god's; they're the bankers'."
- **Services:** vendor `aedituus` (purse 100). **Stock:** `libum 12`, `tus 20`, `lucerna 6`. **Services:** temple blessing `benedictio-castores` for an offering (a `libum`, a pinch of `tus` or 1 den.; refused on the Lemuria day, GDD §14.10); sacrifice (cockerel 1 den., piglet 4 den., lamb 6 den.); vows (v0.2); patron deity — none here (the Dioscuri are not a patron option). Trainer `religio` (Common 40).

**`npc-hermogenes` — Hermogenes** · male, 54 (middle) · banker (*argentarius*) in the Basilica Paulli; secretly of **The Purse** (GDD §10.2) · — (`coniuratio`, masked) · essential until `mq-06` · v0.2 vendor
- **Home / work:** offstage (Esquiline) / `tabernae-aemiliae`. **Schedule:** h2–h7 `tabernae-aemiliae:work` · h7 `basilica-aemilia:talk` · h8 offstage.
- **Look:** slight, 1.64 m, skin `#DDB48F`, hair cropped `#8A8580`, clean-shaven; tunica-linea, toga (he is a citizen and wants it known); calcei; a money-tester's touchstone.
- **Personality / voice:** soft-spoken, exact, interested in everyone's debts.
- **Barks:** "One in the hundred a month. The law's limit, and my pleasure." · "Plated denarii? Not at my table. Bite them yourself." · "Letters of credit to Brundisium, Antioch, anywhere Caesar goes."
- **Services:** vendor `argentarius` (purse 3,000): exchange, loans at 1% a month [A], letters of credit; buys `misc` valuables.

**`npc-demetrius` — Demetrius of Tralles** · male, 46 (middle) · physician (*medicus*) with a shop in the tabernae of the Basilica Paulli [G] · — · essential: no · v0.1-Should vendor
- **Schedule:** h2–h9 `tabernae-aemiliae:work` · h9 offstage.
- **Look:** slight, 1.65 m, skin `#C99A72`, hair curly-short `#4A3424`, **beard short** (a Greek doctor), tunica-long white, pallium; soleae.
- **Barks:** "Wine for the wound, honey for the scar, and two denarii for me." · "Archigenes charges a senator's fee. I charge a baker's. Choose."
- **Services:** `healer` (treat wounds 2 den., cure disease 5 den.); vendor `medicus` (purse 150; stock `fascia 12`, `emplastrum 6`, `collyrium 3`, `theriaca 1`, `febrifugum 2`); trainer `medicina` (Common 40).

**`npc-tryphon` — Tryphon** · male, 36 (adult) · barber (*tonsor*) in the tabernae of the Basilica Paulli [G] · — · essential: no · v0.1-Should
- **Schedule:** h1–h8 `tabernae-aemiliae:work` · h8 `basilica-julia-gradus:talk` · v1 offstage.
- **Look:** slight, 1.63 m, skin `#B07D58`, hair curly-short `#1B1612` (oiled), clean-shaven to a gleam; tunica white, apron; soleae; a razor and a mirror of polished bronze.
- **Personality / voice:** gossip incarnate; knows everything about everyone's chin.
- **Barks:** "A shave, citizen? You look like a mourner, or a philosopher, or worse, a Greek." · "Sit still. My razor is fast and my tongue is faster." · "They say the emperor shaves himself. They say a lot of things."
- **Services:** `barber`: shave or haircut 2 as.; change hair and beard 1 den. (GDD §7.2); one rumour a day.

**`npc-cerdo` — Lucius Seius Cerdo** · male, 50 (middle) · public crier (*praeco*) [G] · — · essential: no · v0.1
- **Schedule:** h2–h6 `rostra:stand` (announcements) · h6 `basilica-julia-gradus:sit` · h8–h10 `rostra:stand` · v1 offstage.
- **Look:** heavy, 1.68 m, skin `#C99A72`, hair cropped `#8A8580`, clean-shaven; tunica white, toga; calcei; enormous voice.
- **Barks (announcements, the radiant notice board in voice form):** "Hear, Quirites! A bronze pot has walked out of a shop in the Vicus Tuscus. Sixty-five sesterces for its return, more for the thief!" · "Tomorrow, the gods willing, Caesar dedicates his column. The Forum will be closed to carts from the fourth hour." · "Lost: a Molossian bitch answering to Hilara. She answers to nothing. Reward." · "The Lemures walk tonight! The temples are shut! The taverns are not!"
- **Services:** none.

**`npc-zethus` — Marcus Lucretius Zethus** · male, 62 (old) · *vicomagister* of the Vicus Tuscus, a freedman, keeper of the crossroads shrine [A for the office, G person] · — · essential: no · v0.1
- **Schedule:** h1 `compitum-vici-tusci:pray` · h2 `compitum-vici-tusci:sweep` · h7 `popina-vici-tusci:sit` · h12 `compitum-vici-tusci:pray` (lights the lamp) · v1 sleep.
- **Look:** slight, 1.60 m, skin `#DDB48F`, hair receding `#CFCBC4`; on his days of office a toga with a purple border (*toga praetexta*, the vicomagister's privilege [A]); otherwise tunica white; calcei.
- **Personality / voice:** proud, fussy, kindly; the neighbourhood's memory.
- **Barks:** "The Lares see the whole street. Behave as if they do." · "A pinch of incense costs an as. Bad luck costs more." · "We renewed our altar this January, when Celsus was consul again. Look, it's carved." (the altar inscription T9)
- **Services:** explains the **Lares favor** (free, GDD §14.6); trainer `religio` (Common 40).

**`npc-fortunata` — Fortunata** · female, 39 (adult) · seller of offering cakes and incense (*libaria*) by the Temple of Castor, a slave of a baker [G] · — · essential: no · v0.1-Should
- **Schedule:** h1–h10 `temple-castor-pollux:stand` (a tray by the steps) · h10 `pistrinum-velabri:work` · v1 sleep.
- **Look:** slight, 1.52 m, skin `#8E5E3E`, hair bun `#1B1612`, tunica-long undyed, apron; barefoot; a tray of honey cakes.
- **Barks:** "Liba! Honey cakes for the gods and for you!" · "One for Castor, one for Pollux, one for your stomach." · "Shut for the dead today, but the gods still eat tomorrow."
- **Services:** vendor `pistor` (purse 20; stock `libum 20`, `tus 10`, `mel 3`).

**`npc-arruns` — Arruns** · male, 63 (old) · Etruscan-style diviner (*haruspex*) of the Circus booths [G] · — · essential: no · v0.2
- **Schedule:** h2–h11 `astrologi-circi:sit` · v1 offstage.
- **Look:** heavy, 1.64 m, skin `#C99A72`, hair receding `#CFCBC4`, clean-shaven; a fringed cloak (`paenula` `#5A4632`) with a brooch, a tall pointed cap (`leather-cap`) [B, architecture §6.5]; calcei.
- **Personality / voice:** grave showman, contemptuous of "Chaldaean arithmetic", well informed (his "readings" use street gossip).
- **Barks:** "The liver does not lie. Men lie. Livers are honest." · "Two denarii, and the gods will whisper. Five, and they'll speak up." · "Ask the Chaldaean whose stars he sells. Go on, ask him."
- **Services:** reading 2 den. (a quest hint, GDD §7.2; text: one true lead about the active quest, phrased as an omen).

**`npc-zenon` — Zenon of Seleucia** · male, 41 (middle) · astrologer (*mathematicus*, "Chaldaean") [G] · — · essential: no (can be arrested in `misc-genitura-caesaris`) · v0.2
- **Schedule:** h3–h11 `astrologi-circi:sit` · v1 `astrologi-circi:work` (stars by night) · v3 offstage.
- **Look:** slight, 1.70 m, skin `#B07D58`, hair curly-short `#1B1612`, **beard full** (an Easterner), tunica-long blue-green, a mantle embroidered with stars (`lacerna` `#2D3A5A`); soleae; a bronze sphere.
- **Personality / voice:** flattering, nervous, clever; uses technical words to frighten customers.
- **Barks:** "Your nativity, citizen? Saturn in the eighth. Terrible. Ten denarii and I'll fix it." · "The stars incline; they do not compel. Mostly." · "Whose stars? Nobody's. Everybody's. Don't ask."
- **Services:** horoscope 10 den. (a daily modifier [design]: +5% XP in one random skill for the day, or +5 persuasion; framed as confidence).

**`npc-fadia` — Fadia Musa** · female, 36 (adult) · perfumer (*unguentaria*) and druggist on the Vicus Tuscus [G] · — · essential: no · v0.2 (`misc-mercuralia` giver)
- **Schedule:** h2–h10 `seplasia-vici-tusci:work` · h10 `basilica-aemilia:wander` · v1 sleep. 15 May: h1–h3 `fons-mercurii:stand`.
- **Look:** slight, 1.55 m, skin `#DDB48F`, hair bun `#6B3A22` (henna), tunica-long rose, palla violet; soleae; small glass flasks on a belt.
- **Personality / voice:** elegant, anxious, a good businesswoman with one bad secret.
- **Barks:** "Nard from India, myrrh from Arabia, honesty from nowhere, sadly." · "Smell that? That's money that hasn't been spent yet." · "Incense for the gods, perfume for the living, vinegar for the doctors."
- **Services:** vendor `seplasiarius` (purse 120; stock `tus 30`, `myrrha 4`, `ruta 6`, `salvia 6`, `allium 6`, `absinthium 4`, `papaver 2`, `nardus 2` (NEW), `acetum 6`).

**`npc-dama` — Lucius Novius Dama** · male, 48 (middle) · innkeeper (*caupo*) of the Inn at the Starting Gates [G] · — · essential: no · v0.2 vendor (v0.1 ambient)
- **Schedule:** h1–v3 `caupona-carcerum:work` · v3 sleep.
- **Look:** heavy, 1.63 m, skin `#B07D58`, hair bald, clean-shaven; tunica brown, apron; soleae.
- **Barks:** "A bed for four asses, fleas for free." · "Race days I triple the price and nobody notices." · "The carter's been telling that story since dawn. It gets better every cup."
- **Services:** `innkeeper`: room 4 as. a night (`quietus`, GDD §14.8), `cena` 3 den.; vendor `caupona` (purse 60; stock `cena 6`, `vinum 20`, `vinum-melius 10`, `panis 10`, `puls 6`); rumours.

**`npc-philadelphus` — Philadelphus** · male, 37 (adult) · baker (*pistor*) of the Velabrum, a Junian Latin working toward citizenship under Trajan's edict [A for the edict: Gaius *Inst.* 1.34; G person] · — · essential: no · v0.2 vendor
- **Schedule:** v3–h4 `pistrinum-velabri:work` (bakers work at night, Martial 12.57 [A]) · h4 `pistrinum-velabri:sit` · h6 sleep · v2 `pistrinum-velabri:work`.
- **Look:** heavy, 1.66 m, skin `#C99A72`, hair cropped `#2A1D14` dusted with flour, clean-shaven; tunica-short undyed, apron; barefoot.
- **Barks:** "A hundred modii a day for three years and I'm a citizen. Ninety-one to go today." · "Bread! Still warm, unlike the city." · "Donkeys turn the mill, I turn the donkeys."
- **Services:** vendor `pistor` (purse 20; stock `panis 30`, `libum 10`).

**`npc-cerinthus` — Cerinthus** · male, 50 (middle) · fuller (*fullo*) of the Velabrum, a freedman [G] · — · essential: no · v0.1-Should (cleaning removes `sordidus`)
- **Schedule:** h1–h11 `fullonica-velabri:work` · v1 sleep.
- **Look:** stocky, 1.61 m, skin `#B07D58`, hair cropped `#8A8580`, legs stained grey to the knee; tunica-short, apron; barefoot.
- **Barks:** "Bring me your stains. I've a vat for everything, and you don't want to know what's in it." · "Minerva's my goddess. Urine's my trade." · "*Non olet*, said the deified Vespasian. He never smelled my yard."
- **Services:** vendor `fullo` (purse 30): wash a tunic 4 as. (removes `sordidus`), clean a toga 1 den.; buys clothing.

**`npc-tychicus` — Tiberius Claudius Tychicus** · male, 45 (middle) · clothier (*vestiarius*) in the Horrea Agrippiana; a Mithraic *nymphus* whose cellar holds the cave [G] · `sodales-invicti` (secret) · essential: no · v0.2 vendor
- **Schedule:** h2–h11 `taberna-vestiarii:work` · v2 `spelaeum-horreorum:pray` (meeting nights) · v4 sleep.
- **Look:** average, 1.66 m, skin `#C99A72`, hair cropped `#4A3424`, clean-shaven; tunica-linea white, lacerna sea-green; calcei.
- **Barks:** "A toga for a citizen, a palla for a lady, a hood for a man with a past." · "Dyed in Tarentum, cut in Rome, worn by the lucky." · "We close early on some nights. Don't ask which."
- **Services:** vendor `vestiarius` (purse 150; stock `tunica 6`, `tunica-crassa 3`, `tunica-linea 2`, `tunica-longa 2`, `toga 2`, `toga-fina 1`, `stola 2`, `stola-fina 1`, `palla 3`, `palla-fina 1`, `paenula 3`, `lacerna 2`, `cucullus 4`, `petasus 2`, `calcei 4`, `soleae 4`, `caligae 2`, `fasciae 4`). The toga and stola are sold to anyone; wearing them is the crime (GDD §14.1).

### 2.E Quest givers and ordinary Romans

**`npc-florus` — Marcus Tuccius Florus** · male, 55 (middle) · cooper (*cuparius*), head of a household in the Velabrum [G] · — · essential: no · v0.1-Should (`misc-lemuria-fabae` giver)
- **Home / work:** `insula-tuccii` (the cooperage on its ground floor). **Schedule:** h1–h9 `insula-tuccii:work` (hammering hoops) · h9 `popina-vici-tusci:sit` · v1 `insula-tuccii:sleep` · v3 `insula-tuccii:pray` (Lemuria nights).
- **Look:** stocky, 1.64 m, skin `#B07D58`, hair cropped `#8A8580`, clean-shaven; tunica-short brown, leather apron; barefoot; an adze.
- **Personality / voice:** loud, superstitious, tight-fisted, softer than he pretends.
- **Barks:** "Every Lemuria, the same. I throw the beans, and by dawn: gone. The ghosts have an appetite." · "Oak for wine, chestnut for oil, pine for fools." · "My father haunts me. He haunted me alive, too."
- **Services:** none.

**`npc-thallusa` — Thallusa** · female, 64 (old) · enslaved housekeeper of Florus; her daughter was freed years ago and is now a poor widow [G] · — · essential: no · v0.1-Should
- **Home / work:** `insula-tuccii`. **Schedule:** v4 `lacus-velabri:work` (water) · h1–h12 `insula-tuccii:work` · v1 `insula-tuccii:sleep` · v3+0.5 `insula-tuccii:work` (after the rite: gathers the beans) · v4 `compitum-velabri:sitGround` (feeds her grandchildren).
- **Look:** slight, 1.48 m, skin `#8E5E3E`, hair bun `#CFCBC4` under a scarf, tunica-long brown, patched; barefoot.
- **Personality / voice:** quiet, quick-witted, terrified of being sold. Speaks to the gods as to old neighbours.
- **Barks:** "Yes, master. No, master. The ghosts, master." · "Little ones, eat slowly. Slowly, I said."
- **Services:** none.

**`npc-prima` — Iulia Prima** · female, 39 (adult) · widow of a stonemason, tenant of a third-floor flat in the Leaning Insula, mother of two [G] · — · essential: no · v0.1-Should (`misc-insula-nutans` giver)
- **Home / work:** `insula-nutans`. **Schedule:** h1 `lacus-velabri:work` · h2–h8 `insula-nutans:work` (spins wool on the stair) · h8 `compitum-vici-tusci:pray` · v1 `insula-nutans:sleep`.
- **Look:** slight, 1.53 m, skin `#C99A72`, hair bun `#2A1D14`, tunica-long blue-green, palla grey drawn over the head; soleae.
- **Personality / voice:** angry, articulate, done with being polite to Callistus.
- **Barks:** "Another crack. Sleep easy, says Callistus. I'll sleep easy in my tomb." · "My husband built half the Forum. He couldn't afford to live in a wall that stands." · "Children! Away from that wall!"
- **Services:** none.

**`npc-callistus` — Callistus** · male, 47 (middle) · *insularius* (rent collector and manager) of the Leaning Insula, a slave of an absentee senatorial owner [G] · — · essential: no · v0.1-Should
- **Schedule:** h2 `insula-nutans:work` (collects) · h5 `tabernae-aemiliae:talk` · h8 `popina-vici-tusci:drunk` · v1 offstage. After `misc-insula-nutans`: gone (v0.3 bounty radiant).
- **Look:** heavy, 1.67 m, skin `#DDB48F`, hair cropped `#4A3424`, clean-shaven; tunica-linea white, lacerna; calcei; a wax tablet ledger.
- **Personality / voice:** smiling, evasive, always "about to see to it".
- **Barks:** "Sleep easy, sleep easy. The props are oak." · "The rent is due on the Kalends. The repairs are due on the Greek Kalends." · "The master is a senator. Senators don't do walls."
- **Services:** none.

**`npc-dento` — Sextus Furius Dento** · male, 44 (middle) · *apparitor* (attendant and inspector) of the aediles [A for the post, G person] · — · essential: no · v0.1-Should
- **Schedule:** h2–h6 `rostra:work` (by the aediles' tribunal) · h6 `basilica-julia-gradus:sit` · h7–h10 patrol [`rostra`, `vicus-tuscus`, `forum-boarium`] (markets and weights) · v1 offstage.
- **Look:** average, 1.66 m, skin `#C99A72`, hair cropped `#4A3424`, clean-shaven; tunica white, toga; calcei; a set of bronze test weights on a cord.
- **Personality / voice:** lazy, honest when cornered, terrified of a scandal under "his" aedile.
- **Barks:** "Short measure? Show me. No, show me with witnesses." · "Taverns, brothels, weights and walls. The aediles do everything, and I do it for them." · "If it falls down, it's my aedile's fault. If it's my aedile's fault, it's mine."
- **Services:** none (story: orders evacuations and fines).

**`npc-ianuarius` — Ianuarius** · male, 40 (adult) · public slave in the service of the curators of the Tiber banks and sewers [P: curators take charge of the sewers under Trajan, society §3.7; G person] · — · essential: no · v0.1-Should (`misc-venus-cloacina` giver)
- **Schedule:** h1–h8 patrol [`shrine-venus-cloacina`, `cloaca-grate-aemiliae`, `basilica-julia-gradus`, `cloaca-maxima-outlet`] (checks grates) · h8 `popina-vici-tusci:sit` · v1 offstage.
- **Look:** stocky, 1.61 m, skin `#6B4229`, hair cropped `#1B1612`, clean-shaven; tunica-short brown, leather leggings to the thigh (`braccae` `#5A4632`); barefoot; a long iron hook and a lantern.
- **Personality / voice:** cheerful about filth, protective of "his" drain; calls the Cloaca "the old lady".
- **Barks:** "The old lady's been here since the kings. She'll outlast the lot of us." · "Someone's been lifting my grate. My grate!" · "Venus of the drains, they call her. Laugh, but she's never had a flood she didn't forgive."
- **Services:** gives `clavis-cloacae` (the grate key) in `misc-venus-cloacina`.

**`npc-antiochus` — Antiochus of Aphrodisias** · male, 34 (adult) · stone carver of the Column's frieze [G; Aphrodisian sculptors worked in Rome, P] · — · essential: no · v0.1-Could / v0.2 (`misc-facies-columnae` giver)
- **Schedule (11 May):** h1–v1 `officina-columnae:work` · v1 `column-trajan:sitGround` (keeps watch over "his" face) · v3 `officina-columnae:sleep`.
- **Look:** slight, 1.66 m, skin `#C99A72`, hair curly-short `#2A1D14` grey with marble dust, **beard short** (a Greek craftsman), tunica-short undyed, apron; barefoot; chisels and a drill bow.
- **Personality / voice:** passionate, stubborn, funny about stone, devastated about his brother.
- **Barks:** "Four hundred soldiers on that spiral, and one of them is my brother." · "Marble remembers everything. That's the trouble with it." · "The master wants a hundred identical faces. The army didn't have identical faces."
- **Services:** none.

**`npc-moschus` — Moschus** · male, 51 (middle) · foreman of the carving crew, a freedman of the building contractor [G] · — · essential: no · v0.2
- **Schedule (11 May):** h1–h12 `column-trajan:work` · v1 `officina-columnae:talk`.
- **Look:** heavy, 1.64 m, skin `#DDB48F`, hair receding `#8A8580`, clean-shaven; tunica-short, a chalk line and a mallet.
- **Barks:** "Recut by dawn. Those are the orders, and orders don't have brothers." · "The dedication waits for no chisel." · "Every face the same height, every shield the same size. That's discipline."
- **Services:** none.

**`npc-mergus` — "Mergus" (the Diver)** · male, 32 (adult) · Tiber diver of the fishermen's and divers' guild (*piscatores et urinatores*) [A for the guild, G person] · — · essential: no · v0.2 (`misc-argei`)
- **Schedule:** h1–h7 `portus-tiberinus:work` (salvage) · h7 `caupona-carcerum:sit` · v1 sleep. 14 May h3 `pons-sublicius:stand` (watches the Argei).
- **Look:** slight, 1.72 m, skin `#8E5E3E`, hair cropped `#1B1612`, clean-shaven; subligaculum, a rope round the waist; barefoot; a diving knife.
- **Personality / voice:** cheerful, observant, superstitious about the river.
- **Barks:** "Twenty-seven straw men go in. Twenty-six float. Funny, that." · "Father Tiber gives back everything. Eventually. In pieces." · "Want to see the bottom? Hold your breath and your tongue."
- **Services:** none (later: salvage diving).

**`npc-onesimus` — Onesimus** · male, 29 (adult) · cattle drover, abandoned sick by his master on the Tiber Island and now recovered [G; Claudius' edict A] · — · essential: no · v0.2 (`misc-servus-aesculapii` giver)
- **Schedule:** h1–v1 `temple-aesculapius:sitGround` (afraid to leave the god's precinct) · v1 `temple-aesculapius:sleep`.
- **Look:** slight (thin from fever), 1.67 m, skin `#6B4229`, hair cropped `#1B1612`, beard stubble; tunica-short undyed, ragged; barefoot.
- **Personality / voice:** quiet, devout, stubborn about his freedom; thanks the god in every other sentence.
- **Barks:** "He left me here to die. The god kept me. Whose am I now?" · "Aesculapius, I owe you a cockerel. Two, when I have work." · "If I step off the island, his men will take me."
- **Services:** none.

**`npc-lurco` — Publius Naevius Lurco** · male, 52 (middle) · cattle dealer (*pecuarius*) of the Forum Boarium [G] · — · essential: no · v0.2 (`lav-01` mark; `misc-servus-aesculapii`)
- **Schedule:** h1–h7 `forum-boarium:work` (sales) · h7 `caupona-carcerum:drunk` · h9 offstage.
- **Look:** heavy, 1.65 m, skin `#C99A72`, hair receding `#4A3424`, clean-shaven; tunica white, lacerna faded madder; calcei; a fat purse on a strap; two bruisers follow him (`collegium-bruiser` kit, unnamed).
- **Personality / voice:** loud, jovial, mean; his name means "glutton" (a Plautine joke, flagged as such).
- **Barks:** "Bulls from Campania, heifers from Etruria, prices from heaven!" · "That slave? Cost me a fortune in doctors. Well, in one doctor. Well, in the god." · "Mind the dung. It's worth more than you."
- **Services:** none.

**`npc-pusio` — Marcus Valerius "Pusio"** · male, 15 (child/young) · son of a pearl-seller, the Colossus dare [G] · — · essential: no · v0.2 (`misc-colossus`)
- **Schedule:** h2–h8 `colossus-sol:wander` (with his gang) · h8 `porticus-margaritaria:sit` · v1 sleep.
- **Look:** slight, 1.55 m, skin `#DDB48F`, hair cropped `#4A3424`, a gold `bulla` (freeborn boy), tunica white with a purple border (*toga praetexta* on feast days; tunica otherwise); calcei.
- **Barks:** "I bet you I can touch his crown. I bet you anything." · "I'm not scared. I'm just thinking. Up here." · "Don't tell my father. He'll tell my mother. She'll tell the whole Sacred Way."
- **Services:** none.

**`npc-hilario` — Marcus Valerius Hilario** · male, 45 (middle) · pearl-seller (*margaritarius*) in the Pearl-Sellers' Arcade, Pusio's father, a freedman [A for the trade on the Sacra Via, G person] · — · essential: no · v0.2
- **Schedule:** h2–h10 `porticus-margaritaria:work` · v1 sleep.
- **Look:** average, 1.66 m, skin `#C99A72`, hair cropped `#2A1D14`, clean-shaven; tunica-linea, lacerna sea-green; calcei; a tray of pearls.
- **Barks:** "Pearls from the Red Sea, the price of a farm, the weight of a tear." · "My son will be an eques. If he lives, which he won't, the way he climbs."
- **Services:** vendor (luxury goods; v0.3).

**`npc-bassulus` — Bassulus** · male, 38 (adult) · butcher (*lanius*), leader of the murmillo fans (*scutarii*) at the Meta Sudans [A: the scutarii/parmularii fan parties, Suet. *Dom.* 10; M. Aurelius *Med.* 1.5] · — · essential: no · v0.1-Must (`misc-meta-sudans-rixa`)
- **Schedule:** h1–h8 offstage · h8–h12 `meta-sudans:stand` · v1 `popina-vici-tusci:drunk`.
- **Look:** heavy, 1.69 m, skin `#B07D58`, hair cropped `#1B1612`, clean-shaven; tunica-short with blood stains, a cloth painted with a big rectangular shield (the scutum) tied round the arm; barefoot; fists (a `collegium-bruiser`; stat block §5.2: caestus).
- **Barks:** "Big shield, big heart! *Scutarii!*" · "A thraex is a rat with a hat." · "The murmillo stands. The thraex runs. Which would you marry?"
- **Services:** none.

**`npc-anicetus` — Anicetus** · male, 33 (adult) · tanner, leader of the thraex fans (*parmularii*) [A for the parties, G person] · — · essential: no · v0.1-Must
- **Schedule:** as Bassulus.
- **Look:** slight, 1.66 m, skin `#8E5E3E`, hair curly-short `#1B1612`; tunica-short brown, stinking of the tannery; a small square shield painted on a board hung from his neck; barefoot.
- **Barks:** "Small shield, quick feet! *Parmularii!*" · "The murmillo is a fish in a pot. We eat fish." · "Did you see Auctus today? Robbed, I tell you. Robbed!"
- **Services:** none.

**`npc-zura` — Zura** · female, 54 (middle) · a Dacian captive of 106, informally freed, a laundress; mother of the executed man in `misc-scalae-gemoniae` [G; the name is invented and Thraco-Dacian in sound, flagged] · — · essential: no · v0.2
- **Schedule:** h1–h8 `fullonica-velabri:work` · h8 `scalae-gemoniae:stand` (on the three display days) · v1 `compitum-velabri:sitGround`.
- **Look:** slight, 1.55 m, skin `#DDB48F`, hair braided under a dark scarf (`veiled`), tunica-long dark `#3B342F` (mourning); barefoot.
- **Personality / voice:** dignified, broken Latin, perfect clarity about what she wants.
- **Barks:** "My son. On the stairs. Three days, and then the hook." · "In my country we bury our dead facing the sun." · "The Romans carved us on their column. Let them carve that we buried our own."
- **Services:** none.

**`npc-callias` — Callias of Ephesus** · male, 47 (middle) · wholesale dealer in unguents and nard at the Horrea Piperataria [G] · — · essential: no · v0.2 (`misc-mercuralia`)
- **Schedule:** h2–h9 `horrea-piperataria:work` · h9 offstage. 15 May h1–h3 `fons-mercurii:pray`.
- **Look:** heavy, 1.64 m, skin `#C99A72`, hair curly-short `#4A3424` oiled, clean-shaven; tunica-linea, lacerna rose; calcei; a laurel branch on 15 May (to sprinkle himself, Ovid *Fasti* 5.673ff [A]).
- **Barks:** "Indian nard, true as gold!" · "Every merchant lies a little. The gods know it; that's why they made the Ides of May." · "Prove it. Go on. Prove it with your nose."
- **Services:** vendor (wholesale; not stocked in v0.2).

**`npc-talarius` — "Talarius"** · male, 45 (middle) · idler and dice player on the Basilica Julia steps (an *otiosus*), nicknamed for his knucklebones [G] · — · essential: no · v0.1 (ambient)
- **Schedule:** h2–h10 `basilica-julia-gradus:sitGround` · h10 `popina-vici-tusci:drunk` · v2 offstage.
- **Look:** slight, 1.63 m, skin `#B07D58`, hair receding `#8A8580`, beard stubble (careless, not philosophical); tunica grey, patched; soleae; `tali` and a board scratched into the step.
- **Barks:** "Venus! Venus, by the gods! No, it's the Dog again." · "Dice are illegal, citizen. That's why the stakes are so low." · "Stand in front of me. The aedile's man is looking."
- **Services:** none (v0.3: dice mini-game).

**`npc-lycus` — Lycus** · male, 30 (adult) · clerk of the banker Hermogenes [G] · — (`coniuratio`, unwitting) · essential: no · v0.2 (`urb-01`, `misc-argei` hooks)
- **Schedule:** h2–h7 `tabernae-aemiliae:work` · h7 `arca-argei:wander` (13–14 May only) · v1 offstage.
- **Look:** slight, 1.68 m, skin `#DDB48F`, hair cropped `#4A3424`, clean-shaven; tunica white; soleae; tablets and a stylus behind the ear.
- **Barks:** "Count it yourself if you don't trust me. Everyone does." · "My master's busy. My master is always busy."
- **Services:** none.

**`npc-antigonus` — Tiberius Claudius Antigonus** · male, 49 (middle) · freedman agent of an unnamed senator (in Act II revealed as Q. Valerius Asper's man, the Toga cell) [G] · — (`coniuratio`, masked) · essential until `mq-09` · v0.2 (`misc-genitura-caesaris`)
- **Schedule:** h1–v1 `domus-clivi-victoriae:work` · v1 sleep.
- **Look:** slight, 1.69 m, skin `#DDB48F`, hair cropped `#8A8580`, clean-shaven; tunica-linea, toga-fina (a freedman showing off); calcei.
- **Barks:** "My patron receives no one. My patron does not exist, today." · "Put it down on the table. Do not touch the seal."
- **Services:** none.

**`npc-sosibius` — Sosibius** · male, 58 (old) · owner of river barges at the Portus Tiberinus, the target of Anthus' curse [G] · — · essential: no · v0.2
- **Schedule:** h1–h8 `portus-tiberinus:work` · h8 offstage.
- **Look:** heavy, 1.62 m, skin `#B07D58`, hair bald, clean-shaven; tunica brown, lacerna; calcei.
- **Barks:** "Rot? That barge has twenty good years in her." · "Lightermen drown. That's what lightermen do."
- **Services:** none.

**`npc-anthus` — Anthus** · male, 17 (young) · apprentice carpenter of the builders' guild (*fabri tignarii*), son of a drowned lighterman [G] · — · essential: no · v0.2 (`misc-sublicius-clavi`)
- **Home / work:** an attic near `forum-boarium` / `portus-tiberinus`. **Schedule:** h1–h10 `portus-tiberinus:work` · h10 `forum-boarium:wander` · v2 `pons-sublicius:work` (on nights when he drives nails, until caught) · v3 `forum-boarium:sleep`.
- **Look:** slight, 1.58 m, skin `#8E5E3E`, hair curly-short `#1B1612`, no beard (too young); tunica-short brown with sawdust, apron; barefoot; a carpenter's hammer (`hammer` model).
- **Personality / voice:** angry, grieving, proud; speaks in short bursts and then too much.
- **Barks:** "The river took my father. It can take a ship for him." · "Lighterman's son, carpenter's apprentice, nobody's dog." · "I'm not running. I'm walking fast."
- **Services:** none.

**`npc-hermeros` — Hermeros** · male, 48 (middle) · *calator* (servant) of the pontiffs, keeper of the Pons Sublicius [A for calatores; G person] · — · essential: no · v0.2 (`misc-sublicius-clavi`, `misc-argei`)
- **Home / work:** `regia` / `pons-sublicius`. **Schedule:** h1 `regia:work` · h3 `pons-sublicius:work` (inspects the timbers) · h8 `pons-sublicius:guard` · v1 `regia:sleep`. 14 May h3–h6 `pons-sublicius:guard` (the Argei rite).
- **Look:** heavy, 1.65 m, skin `#DDB48F`, bald, clean-shaven; tunica white, a willow wreath on rite days; soleae; a wooden mallet (no iron).
- **Personality / voice:** fussy, devout, frightened of pollution and of the pontiffs in equal measure.
- **Barks:** "Not one nail. Not since King Ancus. Not on my watch." · "Wood, wood, wood, rope and the gods." · "The Tiber hears everything said on this bridge. Watch your mouth."
- **Services:** none.

**`npc-rex-cloacae` — Saturninus, called "Rex Cloacae"** · male, 42 (middle) · sewer gang lord, receiver of stolen goods under the Forum [G] · `latrones` · essential: no · v0.1-Should / v0.2 (**`boss-rex-cloacae`**, §5.3)
- **Home / work:** `dun-cloaca-maxima` (junction chamber). **Schedule:** always there (a boss).
- **Look:** heavy, 1.70 m, skin `#B07D58` (pale from the dark), hair long-tied `#2A1D14` greasy, beard full (a man who never sees a barber; reads as an outcast), a bath-stolen toga worn as a cloak (`palla`-like drape, `#C8BFA8`, filthy), thorax-coriaceus; barefoot; gladius and pugio; a crown of rusted drain-grate iron.
- **Personality / voice:** grandiose, funny, dangerous; holds court among stolen bath clothes.
- **Barks:** "Welcome to my kingdom. Mind the floor; it moves." · "Above, Caesar. Below, me." · "Every toga in Rome ends up here eventually. So does every senator." · "Open the sluice and we'll all go swimming!"
- **Services:** none.

### 2.F Historical figures: how each one is handled

| Person | Status in 113 | In v0.1 | In v0.2 | Later | Rule |
|---|---|---|---|---|---|
| **Trajan** | In Rome until autumn [A] | **Seen at a distance** (11 May, h11, walking to his forum; Should) | At the dedication, 12 May (`mq-04`): seen, heard, never addressed | Profectio (`mq-15`) | Essential; ≥ 25 m cordon; no dialogue; never *dominus et deus* |
| **Plotina, Matidia** | In Rome; likely travel east with him [P] | — | At the dedication | `prudentia` ending | Essential; overheard lines only |
| **Hadrian** | Archon of Athens 112/13; whereabouts in 113 uncertain [U] | Rumour barks only ("Still in Athens, playing the Greek") | Rumour | **Offstage: letters and rumour only** (GDD §2.5). Never spawned. The forged codicil names him. | Never present; NPCs disagree about where he is |
| **Apollodorus** | In Rome [P] | **Present** at the Forum of Trajan (talkable) | `misc-facies-columnae` | Ally from `mq-11` | Essential |
| **Juvenal** | A poor client in Rome [P] | **Present** (Basilica Julia steps, popina) | Salutatio queue | — | Essential; never quotes Satires 6 or 10 (society §7.6) |
| **Suetonius** | *a studiis* / *a bibliothecis* [A posts, P timing] | — | Ulpian Library (cipher hint) | Library questline | Essential |
| **Tacitus** | Proconsul of Asia 112–113 [A] | Rumour ("He'll be back to write us all up") | Rumour | A letter from Asia (v0.6+, could) | **Absent; never spawned** before his return from Asia [U date] |
| **Pliny the Younger** | Governor in Bithynia, probably dying [P] | Rumour ("No letters from Bithynia since winter") | Rumour; `Domus Plinii` shut | `misc` seed "Pliny is dead?" | **Absent; never spawned** |
| **Martial, Frontinus, Licinius Sura** | Dead [A] | Mentioned as dead | — | — | Never spawned; their books exist |
| **L. Publilius Celsus** | Consul ordinarius (Jan–Feb) [A] | — | At the dedication | `ambitio` ending | Essential |
| **Suffect consuls L. Stertinius Noricus, L. Fadius Rufinus** | In office May–August [P] | — | At the dedication with 12 lictors each (unnamed extras labelled "the consuls") | — | Essential extras, no dialogue |
| **Ser. Sulpicius Similis** | Praetorian prefect [U tenure] | — | At the dedication | — | Essential |
| **Ti. Claudius Livianus** | Prefect earlier; tenure unclear [U] | — | — | Alcimus' master (offstage) | Essential if ever spawned |
| **P. Acilius Attianus, A. Cornelius Palma, Q. Sosius Senecio, L. Iulius Ursus Servianus, Lusius Quietus** | In or near Rome; locations uncertain [U] | — | Rumour (Quietus' Moorish horsemen "camped on the Campus") | Act II–III | Essential; offstage in v0.1–v0.2 |
| **M. Ulpius Phaedimus, T. Statilius Crito** | Palace staff [A] | — | At the dedication | Palace scenes | Essential |
| **Soranus of Ephesus** | Practising in Rome [P] | — | Tiber Island (`misc-servus-aesculapii`) | Medicina trainer | Essential |
| **Archigenes of Apamea** | Fashionable physician [P] | Mentioned by Demetrius | — | Could | Essential if spawned |
| **The Vestals** | Six; names unknown [U] | — | Cassia Lucilla [G] at the Argei | `mq-10` | Sacrosanct; men never enter Vesta's storeroom (*penus*) |

---

## 3. QUESTS

### 3.0 Overview

| # | ID | Title (Latin) | Cat. | Giver | Milestone | Kind | Main places |
|---|---|---|---|---|---|---|---|
| 1 | `mq-01-madida-capena` | The Dripping Gate (*Madida Capena*) | main | — (new game) | **v0.1-Must** | tutorial, **combat** | `capena-extra`, `porta-capena`, `circus-maximus`, `miliarium-aureum` |
| 2 | `mq-02-tabella` → `mq-02-carcer` | The Sealed Tablet (*Tabella Signata*) → The Tullianum (*Tullianum*) | main | `npc-festus` (dying words) | **v0.1-Must** (tabella) / v0.2 (carcer) | delivery, investigation, (v0.2) **stealth** escape | `castor-loculi`, `ludus-magnus`, `dun-taberna-collapsa`, `carcer-tullianum` |
| 3 | `mq-03-lemuria` | Beans for the Dead (*Fabae Lemurum*) | main | `npc-gratus` | v0.2 (v0.1 shows only the ghost glimpse) | **investigation**, festival, chase | `insula-mariorum` |
| 4 | `vig-01-hamae` | Buckets (*Hamae*) | faction | `npc-ursulus` | v0.3 (pull-forward v0.2) | **fire with the Vigiles** | `insula-ardens`, `excubitorium-velabri` |
| 5 | `lud-01-sacramentum` | The Oath (*Sacramentum*) | faction | `npc-glaucus` | **v0.1-Must** | **arena fight**, boss | `ludus-magnus` |
| 6 | `urb-01-sacramentum` | The Drill (*Exercitatio*) | faction | `npc-proculus` | v0.3 | drill, escort, combat | `rostra`, `tabernae-aemiliae`, `temple-saturn` |
| 7 | `lav-01-sector` | Cut a Purse (*Sector Zonarius*) | faction | `npc-chrysis` | v0.6 (pull-forward v0.2) | **stealth** (pickpocket) | `popina-vici-tusci`, `forum-boarium` |
| 8 | `mit-01-silentium` | The Oath of Silence (*Silentium*) | faction | `npc-ingenuus` → `npc-alcimus` | v0.6 | lose a tail, initiation | `spelaeum-horreorum` |
| 9 | `cli-01-salutatio` | Morning Calls (*Salutatio*) | faction | a patron's agent | v0.6 | **persuasion**, delivery | `domus-sergii` / `-calpurniae` / `-vettii` |
| 10 | `cir-01-stabulum` | Mucking Out (*Stabulum*) | faction | `npc-epaphra` / `npc-phileros` | v0.4 | labour, investigation, choice | `stabula-factionum` |
| 11 | `misc-meta-sudans-rixa` | Brawl at the Fountain (*Rixa ad Metam*) | misc | `npc-bassulus` / `npc-anicetus` | **v0.1-Must** | **combat** (non-lethal) | `meta-sudans` |
| 12 | `misc-lemuria-fabae` | Black Beans (*Fabae Nigrae*) | misc | `npc-florus` | **v0.1-Should** | **investigation**, stealth tail, **festival** | `insula-tuccii` |
| 13 | `misc-insula-nutans` | The Leaning Insula (*Insula Nutans*) | misc | `npc-prima` | **v0.1-Should** | **persuasion**, investigation | `insula-nutans`, `rostra` |
| 14 | `misc-venus-cloacina` | What Venus Hides (*Quod Cloacina Celat*) | misc | `npc-ianuarius` | **v0.1-Should** / v0.2 | **sewer delve**, boss | `dun-cloaca-maxima` |
| 15 | `misc-facies-columnae` | The Face on the Column (*Facies Columnae*) | misc | `npc-antiochus` | v0.1-Could / v0.2 | **persuasion**, climb | `officina-columnae`, `column-trajan` |
| 16 | `misc-genitura-caesaris` | The Emperor's Horoscope (*Genitura Caesaris*) | misc | `npc-zenon` | v0.2 | **delivery with a twist** | `astrologi-circi`, `domus-clivi-victoriae` |
| 17 | `misc-sublicius-clavi` | No Iron on the Bridge (*Clavi Sublicii*) | misc | `npc-hermeros` | v0.2 | stakeout, **chase** | `pons-sublicius`, `forum-boarium` |
| 18 | `misc-scalae-gemoniae` | The Gemonian Stairs (*Scalae Gemoniae*) | misc | `npc-zura` | v0.2 | **stealth**, burial | `scalae-gemoniae` |
| 19 | `misc-argei` | The Heavy Splash (*Argei*) | misc | `npc-mergus` | v0.2 (14 May) | **festival event**, dive, investigation | `pons-sublicius`, `arca-argei` |
| 20 | `misc-mercuralia` | Mercury's Water (*Aqua Mercurii*) | misc | `npc-fadia` | v0.2 (15 May) | **festival**, persuasion, trade | `seplasia-vici-tusci`, `fons-mercurii` |
| 21 | `misc-servus-aesculapii` | Free by the God's Hand (*Manu Dei Liber*) | misc | `npc-onesimus` | v0.2 | **persuasion**, legal, evidence | `temple-aesculapius`, `forum-boarium` |
| 22 | `misc-colossus` | The Colossus Dare (*Sponsio Colossi*) | misc | `npc-pusio`'s friends | v0.2 | climb, rescue | `colossus-machina` |

**Calendar note.** In v0.1 the *pridie* clamp holds the date on **11 May** (GDD §17.1), so every v0.1 quest happens on "11 May" (the Lemuria day and the eve of the Column; festival effects fire on the first elapsed day only, GDD §14.10). In v0.2 the 12 May anchor arrives with `mq-04`; the next anchor (9 June, `mq-10`) is not shipped, so the clamp then holds **8 June** and the festivals of 13 May–8 June run freely (§8.3).

### 3.1 Main quest, Act I opening

#### 3.1.1 `mq-01-madida-capena` — The Dripping Gate (*Madida Capena*)

| Field | Value |
|---|---|
| Category / act | main, Act I, quest 1 (GDD §10.3) |
| Giver | none (`autoStart`) |
| Trigger | New game, after character creation. Date 11 May 113, **04:30** (fourth watch), `GameTime.start` (GDD §2.1). |
| Prerequisites | none |
| Milestone | **v0.1-Must** (AC-01, AC-15) |
| Teaches | movement, E, R/F/Q combat, V view toggle, compass, talking, looting, the Lares favor |
| NPCs | `npc-festus`, `npc-dromo`, 2 × `grassator` (tag `mq01-grassator`: one `pugio`, one `fustis`; thug tier, §5.1), `npc-mus` (hooded, flees, not fightable here) |

**Stages**

1. **`start`** — *Journal:* "I came to Rome in the fourth watch of the night, on the last wine cart up the Appian Way. A courier called Festus shared the cart and the cold. Ahead of us the aqueduct arches dripped over the Capena Gate."
   - `talk-festus` — Talk to the courier → `npc:npc-festus` (the cart dialogue opens by itself when the scene starts; optional, but it seeds `mq-03`).
   - `dismount` — Climb down from the cart → interact `prop-plaustrum-dromonis` at `loc:capena-extra`.
   - *onEnter:* spawn the player seated on the cart at `capena-extra`; Festus beside them; Dromo walking at the mules' heads. HUD hint: "[E] Climb down". Ambience: dripping water, mules, a cock crowing far away.
   - *Completes* when `dismount` is done → `gate`.
2. **`gate`** — *Journal:* "Festus walked ahead to stretch his legs. Under the arch the water fell like thin rain. 'The gate weeps for every stranger,' he said."
   - `walk-gate` — Walk through the Capena Gate → `loc:porta-capena`.
   - *Completes* when the player is within 6 game m of the arch → `ambush`.
3. **`ambush`** — *Journal:* "Three men came out of the dark under the arch. One of them knifed Festus before he could draw. The other two came for me."
   - `fight` — Fight off the attackers → `kill:mq01-grassator` **×2** (a kill, a knockout, a yield or a flight each counts).
   - *onEnter:* Mus (hooded, `cucullus`) stabs Festus from behind, cuts the satchel strap and runs west along `street-north-of-circus`; he vanishes at `astrologi-circi` (despawns; sets `mus-has-satchel`). The two grassatores attack. Tutorial prompts in order, each dismissed by use: "[R] Ready your weapon", "[F] Attack", "[Q] Block (tap just before a blow to parry)", "[V] Switch view", "[X] Lock on". If the player is unarmed (no signature weapon equipped), Festus' dropped `pugio` lies at their feet ("[E] Take").
   - The grassatores flee at 15% health (thug `fleeAt`) and yield at 25%. Yield choices follow GDD §6.9 (spare / rob / kill; arrest needs a mandate and is hidden).
   - If the player runs more than 40 m away, the grassatores give up after 8 s and the objective completes ("driven off").
   - *Completes* → `dying`.
4. **`dying`** — *Journal:* "Festus was still alive when I knelt beside him. He pushed a sealed tablet into my hand."
   - `talk-dying` — Speak to the dying courier → `npc:npc-festus` (dialogue `dlg-mq01-festus-dying`).
   - `search` (optional) — Search Festus' body → `npc:npc-festus` (loot: 6 den. 3 as., `pugio` at 90%, `quest-epistula-festi`).
   - `ask-dromo` (optional) — Ask the carter what he saw → `npc:npc-dromo`.
   - *Completes* when `talk-dying` is done → `city`.
5. **`city`** — *Journal:* "Festus died under the dripping arch with the sun coming up behind me. His last words sent me to the strongrooms under the Temple of Castor, in the Forum. The way led up the valley of the Circus, under the walls of the palace."
   - `circus` — Follow the valley past the Circus Maximus → `loc:circus-maximus` (discovery banner CIRCVS·MAXIMVS).
   - `forum` — Reach the Forum and the Golden Milestone → `loc:miliarium-aureum`.
   - `lares` (optional) — Pray at a crossroads shrine → `loc:compitum-capenae` or `loc:compitum-circi` (+5 Pietas and the Lares favor: the Pietas lesson).
   - `popina` (optional) — Eat or drink at the Silver Pig on the Vicus Tuscus → `loc:popina-vici-tusci`.
   - `hideout` (optional, **hidden**) — Find the knife-men's hideout → `loc:taberna-collapsa`. Revealed by Chreste's rumour, by Primigenius at night, or by Auctus in `lud-01`. Completing it is shared with `mq-02` (the same dungeon).
   - *Completes* when `forum` is done → `done`.
6. **`done`** (end: complete) — *Journal:* "I stood at the Golden Milestone, where they say every road in Italy ends. Mine had ended there too, for now. Festus' tablet was still sealed in my belt." *onEnter:* `start(mq-02-tabella)` (v0.1) or `start(mq-02-carcer)` (v0.2).

**Dialogue**

```
DLG dlg-mq01-festus-cart · npcs: npc-festus · priority 90
start: q(mq-01-madida-capena).stage=start → n0
n0  "Awake? Good. The carter swears we'll be through the gate before the cocks start. First time in Rome?"
  ▸ "First time."                                               → n1
  ▸ (if origin=civis-suburanus) "I was born in the Subura. I'm coming home."   → n1s
  ▸ (if origin=veteranus) "The last time I saw it was the triumph. Six years ago." → n1v
  ▸ (if origin=dacus) "The first time, I came in chains."      → n1d
  ▸ (if origin=hispanus) "First time. I carry a letter for a lady from Corduba." → n1h
n1  "Then hold on to your purse and your hat. Rome takes both and says thank you."   → n2
n1s "Then you know the rules better than I do. Don't walk under windows after dark." → n2
n1v "Then you'll find it grown. A new forum, new baths, and a column with your whole war carved on it." → n2
n1d [N] Festus is quiet for a moment.  → n1d2
n1d2 "Then I won't tell you about the column. You'll see it soon enough. I'm sorry." → n2 {disp(+5)}
n1h "Corduba! The emperor's own people. They'll treat you like a cousin, and charge you like one." → n2
n2  "I carry letters for the imperial post. Don't ask me what's in them. I'm paid not to know."
  ▸ "Who do you carry them for?"            → n3   {once}
  ▸ "Is it dangerous work?"                 → n4   {once}
  ▸ "Who's waiting for you in Rome?"        → n5   {once}
  ▸ "Rest. We're nearly there."  ⇥ end      {obj(mq-01-madida-capena, talk-festus)}
n3  "For a camp on the Caelian. Men who read other men's letters for a living. Tonight I'm only a tired soldier on a wine cart." → n2
n4  "On the road, no. Near home, sometimes. Rome is the only city where I sleep with my boots on."  → n2
n5  "My mother, my father, and my brother, if he's ever home. My twin. He copies books in the Velabrum. People mix us up; he hates it."  → n2 {flag(festus-mentioned-twin=true)}

DLG dlg-mq01-festus-dying · npcs: npc-festus · priority 100
start: q(mq-01-madida-capena).stage=dying → n0
n0  "Stranger... no, don't press it. It's deep."   → n1
n1  "Take this. Sealed. The strongrooms under Castor's temple, in the Forum. Ask for Gratus. Only Gratus." {give(quest-tabella-signata)}
  ▸ "Who did this to you?"          → n2
  ▸ "I'll take it to him."          → n3
  ▸ "Why trust me?"                 → n2b
n2  "Hired knives. The one behind me fought like a gladiator. Curved blade. They took my satchel; let them have it. They didn't get the tablet." → n3 {flag(clue-curved-blade=true)}
n2b "Because you stayed. Everyone else in this city would have run."   → n3
n3  "Tell my mother... tell her it was quick. Lie, if you have to. The Marii, behind the Vicus Tuscus, in the Velabrum."  {flag(festus-family-known=true)}
  ▸ "I'll tell her myself."         → n4 {flag(promised-festus=true)}
  ▸ "Rest now."                     → n4
n4  [N] Festus does not answer. The water from the arch keeps falling on his face.  ⇥ end
    {stage(mq-01-madida-capena, city); kill(npc-festus, scripted)}

DLG dlg-mq01-dromo · npcs: npc-dromo · priority 80
start: q(mq-01-madida-capena).stage∈{dying, city} → n0
n0  "Gods below, they cut him like a ham. I was under the cart, and I'm not ashamed of it."
  ▸ "Did you see who did it?"                → n1
  ▸ "Which way is the Forum?"                → n2
  ▸ "You should tell the watch."             → n3
  ▸ "Go home, Dromo." ⇥ end
n1  "Three of them. The one who did the knifing wore a hood and walked like a fighter, up on his toes. He took the soldier's bag and ran toward the Circus."  → n0 {flag(clue-hooded-fighter=true); obj(mq-01-madida-capena, ask-dromo)}
n2  "Up the valley, under the palace, Circus on your left. At the far end the Vicus Tuscus takes you straight into the Forum. You can't miss it: it's where all the shouting is."  → n0
n3  "The watch? The watch will ask what a slave was doing out at... oh. Carts are allowed at night. Right. Still. I'll have a drink first."  → n0
```

**Rewards:** `fama.dist-circus-maximus +5` (you fought muggers in front of the carters). No denarii (Festus' purse is loot). XP comes from the fight itself.

**Failure states:** none. Player death → reload (Tiro: the Aesculapian rescue wakes the player at `temple-aesculapius`; the quest resumes at `city`). The tablet is a weightless quest item and cannot be dropped, sold or stolen.

**World changes:** Festus' body and a blood decal stay at `porta-capena` until **h3**, when a vigiles handcart removes them (a vignette); after that a chalked mark on the arch pier remains for 3 game days. Dromo spends the day at `caupona-carcerum` telling the story (his barks change). The grassatores who fled are marked "seen": they can reappear at night in the Velabrum (band 1–2) until `dun-taberna-collapsa` is cleared.

**Flags set:** `festus-dead`, `mus-has-satchel`, `festus-mentioned-twin`, `festus-family-known`, `promised-festus`, `clue-curved-blade`, `clue-hooded-fighter`.

---

#### 3.1.2 `mq-02-tabella` / `mq-02-carcer` — The Sealed Tablet / The Tullianum

| Field | Value |
|---|---|
| Category / act | main, Act I, quest 2 |
| IDs | **v0.1:** `mq-02-tabella` (stages `start` → `done-v01`). **v0.2:** the same stages become the first half of `mq-02-carcer`, which continues from `deliver` into `arrest` (GDD §10.3). |
| Giver | `npc-festus` (his dying instruction); started by `mq-01` → `done` |
| Trigger | `mq-01-madida-capena` complete |
| Prerequisites | `mq-01` complete; carries `quest-tabella-signata` |
| Window | 11 May, morning to after sunset (the delivery needs `time ≥ v1`, 19:06) |
| Milestone | **v0.1-Must** (AC-15, AC-18) / v0.2 |
| NPCs | `npc-philetus`, `npc-chrysippus`, `npc-gratus`, `npc-glaucus`, `npc-auctus`, `npc-mus`, `npc-hermippus`; v0.2: `npc-verecundus`, `npc-phoebus`, `npc-theodote`, `npc-pollio` |

**Stages (v0.1 and v0.2)**

1. **`start`** — *Journal:* "Festus' last words sent me to the strongrooms under the Temple of Castor and Pollux, in the Forum, to a man called Gratus."
   - `castor` — Go to the Temple of Castor and Pollux → `loc:temple-castor-pollux`.
   - *Completes* on arrival, or on talking to Philetus at the shut doors → `loculi`.
2. **`loculi`** — *Journal:* "The temple itself was shut for the Lemuria, the night of the restless dead, but the strongrooms in its podium open onto the street. Their keeper, Chrysippus, guards the door like a dog guards a bone."
   - `chrysippus` — Ask the keeper of the strongrooms for Gratus → `npc:npc-chrysippus` (`dlg-mq02-chrysippus`).
   - *Completes* when Chrysippus fetches Gratus (any branch; no dead end) → `gratus`.
3. **`gratus`** — *Journal:* "Gratus is a centurion of the frumentarii, the imperial couriers. He would not take the tablet. A dispatch like this, he said, is never carried across the Forum in daylight; I should keep it in my belt until dusk. Meanwhile he wanted to know who carries a curved blade and fights like a gladiator."
   - `ludus` — Go to the Ludus Magnus → `loc:ludus-magnus`.
   - `ask` — Find out who fights with a curved blade → topic node `mus` in `dlg-lud01-auctus` (after bout 2 of `lud-01`), or `[Persuade 40]` with Auctus before the bouts, or `[Persuade 25]` with Glaucus after any bout.
   - *Completes* when `ask` is done (sets `clue-mus`) → `mus`.
4. **`mus`** — *Journal:* "Auctus knew the stroke at once: 'Up from under, like a thraex finishing a man on his knees.' He named Dizas, called the Mouse, a thraex thrown out of the Ludus for theft. He runs knife-men out of a burned taberna off the Vicus Tuscus. Gratus said to come back at dusk."
   - `dusk` — Return to the strongrooms of Castor after sunset → `loc:castor-loculi` with `time:v1`. The Ludus physician Hermippus tells the player to rest until the lamps are lit: **the game prompts the Wait menu (T)** (GDD §17.2 step 5).
   - `hideout` (optional) — Deal with Mus in the burned taberna → `loc:taberna-collapsa` (`dun-taberna-collapsa`, §3.1.2a).
   - `satchel` (optional) — Recover Festus' satchel → `item:quest-sacculum-festi`.
   - *Completes* when `dusk` is reached → `deliver`.
5. **`deliver`** — *Journal:* "Gratus was waiting by lamplight among the strongboxes."
   - `give` — Give the tablet to Gratus → `npc:npc-gratus` (`dlg-mq02-gratus-dusk`).
   - *Completes* → **v0.1:** `done-v01` · **v0.2:** `arrest`.
6. **`done-v01`** (v0.1 end: complete) — *Journal:* "Gratus broke the seal and swore softly. The tablet was written in Festus' private cipher. 'His brother would have the key,' he said, 'and tomorrow is the Column.' I walked out into an empty Forum. Somewhere in the Velabrum a man was beating a bronze pot to drive the ghosts away. Tomorrow, the Column."
7. **`arrest`** (v0.2) — *Journal:* "I had not taken ten steps from the strongrooms when the Urban Cohorts closed around me. A carter had sworn he saw a stranger kneeling over a dead imperial courier at dawn. Now here was the same stranger, at night, coming out of the courier's strongroom."
   - `answer` — Answer the optio → `npc:npc-verecundus` (`dlg-mq02-verecundus`): go quietly → `carcer`; `[Persuade 55]` → `release` (Gratus is called back and vouches; no patron agent); resist or flee → bounty `fuga` 100 (GDD §14.1) and → `fugitive`.
8. **`carcer`** (v0.2) — *Journal:* "They lowered me into the Tullianum, the round cell under the prison where Rome once strangled captured kings. It smelled of water and old fear. Before the second watch, three visitors came to the grating."
   - `visitors` — Hear the visitors at the grating → three short conversations in `dlg-mq02-agents` (Phoebus for Sergius Bassus, Theodote for Calpurnia Severa, Pollio for Vettius Crispinus). Accept one → `release` with `flag(patron-leaning=<id>)`.
   - `escape` (optional, alternative) — Escape through the drain shaft → interior `dun-carcer`: sneak past the dozing jailer (stealth; S < 100), lift the drain cover (hold E 3 s), climb out at `carcer-cloaca` → `release` with `flag(escaped-carcer=true)` and bounty `fuga` 100 (cleared by Gratus in `mq-05`).
9. **`fugitive`** (v0.2) — *Journal:* "I ran. Now the city had a price on my head, and Festus' family still did not know their son was dead." `answer-agent` — Meet a patron's agent at the Silver Pig → `loc:popina-vici-tusci` (all three agents wait there in turn after v2); accepting one clears the bounty (`release`).
10. **`release`** (v0.2 end: complete) — *Journal:* depends on the route. Patron agent: "Someone with a great name had spoken for me, and the Tullianum's door opened as if it had never been shut. Gratus sent word: Festus' twin would know the cipher, and he had vanished a month ago. The Marii lived in the Velabrum, and it was the night of the Lemures." Escape: "I came up out of the drain with the Cloaca's stink on me and the Urban Cohorts behind me. I went to the Velabrum anyway." *onEnter:* `start(mq-03-lemuria)`.

**Dialogue**

```
DLG dlg-mq02-philetus · npcs: npc-philetus · priority 70
start: festival=fest-lemuria today and q(mq-02-*).stage=start → n0 · else → (vendor greeting)
n0  "The doors are shut, citizen. The Lemures walk tonight, and the gods do not receive on the days of the dead."
  ▸ "I'm looking for the strongrooms."        → n1
  ▸ "Can I make an offering anyway?"           → n2
  ▸ "Ghosts? Do you believe that?"             → n3
n1  "Ah, the bankers' cellars. Down the west side, under the podium, the little doors. They're not the god's; they don't close for him." → ⇥ end {stage(mq-02-*, loculi)}
n2  "At the crossroads shrines, yes. The Lares are always at home. Here, come back tomorrow." → n0
n3  "I believe the doors are shut. The rest is between you and your grandfather." → n0

DLG dlg-mq02-chrysippus · npcs: npc-chrysippus · priority 70
start: q(mq-02-*).stage=loculi → n0
n0  "Deposits on the left, withdrawals on the right. Which are you?"
  ▸ "Neither. I'm looking for Gratus."                         → n1
  ▸ (if has(quest-tabella-signata)) [P] Show him the seal.     → n4
n1  "Gratus? There is no Gratus. There has never been a Gratus. Who sent you?"
  ▸ [Persuade 25] "A courier sent me, with his last breath. Fetch him."   → pass n2 · fail n3
  ▸ [Intimidate 25] "Fetch him, or I'll count your keys for you."         → pass n2 · fail n3
  ▸ [Bribe 6 den.] "For your trouble."                                    → n2
n2  "...Wait here. Touch nothing. Nothing!"  ⇥ end {stage(mq-02-*, gratus)}
n3  "Out. Out, before I call the—"  → n3b
n3b [N] A door opens behind him. A grey-haired man in a soldier's belt steps out. "Who said Festus?" ⇥ end {stage(mq-02-*, gratus)}
n4  [N] Chrysippus goes white at the impression in the wax: a horseman with a raised spear. "That's... wait. Wait here."  ⇥ end {stage(mq-02-*, gratus)}

DLG dlg-mq02-gratus-day · npcs: npc-gratus · priority 90
start: q(mq-02-*).stage=gratus → n0
n0  "You have something of Festus'. Don't take it out. Tell me how he died."
  ▸ "Knifed under the Capena arch. Three men; one fought like a gladiator."  → n1
  ▸ (if flag(clue-curved-blade)) "He said it was a curved blade."           → n1c
  ▸ "Take the tablet and let me go."                                       → n2
n1  "A gladiator. In the Velabrum they hire the ones the Ludus throws out." → n3
n1c "Curved. A sica. Then a thraex, or a man who learned from one." → n3 {disp(+5)}
n2  "Not in daylight. A dispatch is never carried across the Forum by day. Keep it in your belt. Nobody looks twice at a stranger; everybody looks at me." → n3
n3  "Go to the Ludus Magnus, past the amphitheatre. Ask Glaucus, the doctor there, who uses that stroke. Prove yourself useful, and come back after the lamps are lit."
  ▸ "Why should I do your work for you?"        → n4
  ▸ "I'll go."  ⇥ end                          {stage(mq-02-*, gratus)}
n4  "Because Festus trusted you, and he was a good judge of men. And because you'll be paid." ⇥ end

DLG dlg-mq02-gratus-dusk · npcs: npc-gratus · priority 90
start: q(mq-02-*).stage=deliver → n0
n0  "You came back. Most don't. The tablet."
  ▸ [P] Give him the tablet.                                     → n1 {take(quest-tabella-signata)}
n1  [N] He checks the seal against the lamp, then breaks it.  → n2
n2  "Festus' own cipher. Of course. His brother would have the key, and his brother has been missing since the Ides of April."
  ▸ (if has(quest-sacculum-festi)) "I found his satchel. And the man who took it."   → n3
  ▸ "What does it say?"                                                            → n4
n3  "Mus. Dead or running, it comes to the same thing for now." [N] He turns the scraped tablet over, then the silver coin. "A Parthian drachm. In a Roman knife-man's purse." He looks at you for a long moment. → n4 {take(quest-sacculum-festi); receive(25); fama(dist-forum-romanum,+5); flag(gratus-has-drachm=true)}
n4  "It says nothing until I have the key. But tomorrow is the Column, and Festus rode nine days to be here before it." → n5
n5  "Take this token. Show it at the camp on the Caelian if you're ever asked who you are. And take this, for the courier's burial; see that his family get some of it." {give(quest-tessera-peregrina); receive(25)}
  ▸ "I promised him I'd tell his mother."        → n6 {if flag(promised-festus)}
  ▸ "Until tomorrow."  ⇥ end                     {stage(mq-02-*, done-v01 | arrest)}
n6  "Then keep your promise. Not tonight, though; tonight the Velabrum belongs to the dead." ⇥ end {stage(...)}

DLG dlg-mq02-verecundus (v0.2) · npcs: npc-verecundus · priority 95
start: q(mq-02-carcer).stage=arrest → n0
n0  "You. Stand still. A carter swears he saw you kneeling over a dead courier at dawn, and now you come out of the courier's strongroom at night. Explain that, or explain it to the Tullianum."
  ▸ "I'll come quietly."                                             → n1
  ▸ [Persuade 55] "Call Gratus back. He'll tell you who I am."        → pass n2 · fail n1f
  ▸ (if has(quest-tessera-peregrina)) [P] Show Gratus' token.         → n2t
  ▸ [P] Run.                                                         → ⇥ end {bounty(fuga,100); stage(mq-02-carcer, fugitive)}
n1  "Sensible. The Tullianum is cold, but it's quiet." ⇥ end {stage(mq-02-carcer, carcer)}
n1f "Gratus? Gratus is a name. The Carcer is a place. Walk." ⇥ end {stage(mq-02-carcer, carcer)}
n2t "A Caelian token. Anyone can buy one of those in the Subura." [N] He hesitates. "Anyone. Walk." ⇥ end {stage(mq-02-carcer, carcer)}   (the token alone is not enough; it adds +10 to the check above)
n2  [N] A runner comes back with Gratus, who says three quiet words to the optio. "...Go home, stranger. If you have one." ⇥ end {stage(mq-02-carcer, release)}

DLG dlg-mq02-agents (v0.2) · npcs: npc-phoebus, npc-theodote, npc-pollio · priority 95
start: by npc → p0 / t0 / v0
p0  (Phoebus) "My patron, Marcus Sergius Bassus, consul, general, friend of Caesar, has heard that a brave stranger is in the hole. He likes brave strangers. They are useful in a war."
  ▸ "I accept his help."   → p1   ▸ "Let me hear the others."  ⇥ end
p1  "Then you are his friend, and his friends come to his door at dawn." ⇥ end {flag(patron-leaning=sergius); fama(clientela,+5); stage(mq-02-carcer, release)}
t0  (Theodote) "My lady Calpurnia Severa reads everything, even the Urban Cohorts' arrest lists. She thinks you have been unlucky, and she dislikes waste."
  ▸ (if origin=hispanus) "I have a letter of introduction to her." → t2
  ▸ "I accept her help."   → t1   ▸ "Let me hear the others."  ⇥ end
t1  "Then the door will open within the hour. She will expect to hear from you." ⇥ end {flag(patron-leaning=calpurnia); fama(clientela,+5); stage(mq-02-carcer, release)}
t2  "Then you were hers before you came. Good." → t1 {disp(+10)}
v0  (Pollio) "My great-uncle, Sextus Vettius Crispinus, sends me because I'm the only one in the family who knows the way to the Carcer. He says the law should not need a patron. It does, so here I am."
  ▸ "I accept his help."   → v1   ▸ "Let me hear the others."  ⇥ end
v1  "Then I'll argue you out. It will take me a quarter of an hour; the jailer is a slow reader." ⇥ end {flag(patron-leaning=vettius); fama(clientela,+5); stage(mq-02-carcer, release)}
```

The Auctus topic (`ask` objective) lives in `dlg-lud01-auctus` (§3.2.1). In these graphs `mq-02-*` means whichever of `mq-02-tabella` (v0.1) or `mq-02-carcer` (v0.2) is running; `stage(mq-02-*, done-v01 | arrest)` picks `done-v01` in v0.1 and `arrest` in v0.2.

**3.1.2a The micro-dungeon `dun-taberna-collapsa` (v0.1-Must, about 5 minutes).** A fire-gutted taberna off the Vicus Tuscus, three rooms (GDD §12.4 rules: hook, environmental story, three beats, climax, reward chest, loopback).
- **Hook:** Chreste's rumour, Primigenius' night bark, or Auctus' clue (`clue-mus`).
- **Room 1, the shop floor (exploration):** charred counter, a collapsed upper floor (mantle up the rubble to reach a gap), a sleeping grassator (sneak attack or KO lesson). Container: a scorched amphora stack (`amphora-stack`, §6).
- **Room 2, the cellar stairs (combat spike):** two grassatores (one is a survivor of the `mq-01` ambush, if any fled) dicing by a lamp; a third arrives from the back after 10 s.
- **Room 3, the back cellar (climax):** **Mus** (`npc-mus`, stat block §5.2) behind a table of stolen goods. He talks first (`dlg-mus`): he will trade the satchel for his life (`[Intimidate 25]` makes him hand it over and flee; `[Persuade 40]` makes him tell who paid him: "a man with Syrian silver, at the Horrea Piperataria" → `flag(clue-piperataria)`), or fight. He yields at 20%: spare (Pietas +5; he later reappears as an informant, GDD §6.9), rob, or kill (Pietas −15).
- **Mus' dialogue** (before the fight):

```
DLG dlg-mus · npcs: npc-mus · priority 90
start: at(dun-taberna-collapsa) and npc alive → n0
n0  "Who sent you? Glaucus? Tell him the Mouse still bites. Thirty-one bouts, and he threw me out for a cloak."
  ▸ "I want the courier's satchel."                                  → n1
  ▸ [Intimidate 25] "Give me the satchel and run. Now."               → pass n2 · fail n4
  ▸ [Persuade 40] "Someone paid you to kill a courier. Who?"          → pass n3 · fail n4
  ▸ [P] Attack.                                                      → {attack()}
n1  "The bag? Useless. Wax and a foreign coin. Take it off my body, if you can." → n4
n2  "...Take it. Take the key too. I was never here." ⇥ end {give(clavis-cellae-muris); flag(mus-fate=fled); obj(mq-02-*, hideout)}
n3  "A man with Syrian silver, at the Pepper Warehouses. He never gave a name; men like that never do. Now get out of my cellar." → n2 {flag(clue-piperataria=true)}
n4  "Up from under, then." ⇥ end {attack()}
```

- **Reward chest:** `cista-muris` (locked `simplex`; key `clavis-cellae-muris` on Mus; v0.1 has no lockpicking, so the key or Mus' surrender is the only way): `quest-sacculum-festi` (with `quest-tabula-rasa` and `quest-drachma-parthica` inside), 18 den., `nugae` ×2, `sica-muris` (if Mus surrendered it), `fascia` ×2.
- **Loopback:** a light well up into the courtyard of the next insula (exit spot `taberna-collapsa-puteus`), mantle 1.9 m.

**Rewards (v0.1, at `done-v01`):** 25 den. (Gratus, "for the burial"); +25 den. and `fama.dist-forum-romanum +5` if the satchel is delivered; `quest-tessera-peregrina`; `skills: rhetoric +10`. **(v0.2, at `release`):** as above, plus `fama.clientela +5` (agent route) or `skillXp: stealth` (escape route).

**Failure states:** none in v0.1 (the quest cannot be failed; the delivery waits until dusk as long as needed). v0.2: killing an urban soldier during `arrest` → bounty `homicidium` 1,000 and the stage stays `fugitive` until the bounty is paid or cleared by a patron (Sergius' agent clears up to 1,000 at a cost of `fama.clientela −10`).

**World changes:** after `done-v01` the Forum empties for the night (schedules), vigiles with lanterns appear, and at the first crossing of `vicus-tuscus` after v2 the **Lemuria ghost-glimpse** vignette plays once (§8.3): a figure in a brown paenula at the end of an alley, gone when approached. v0.2: Chrysippus is questioned by the Cohorts and becomes hostile-neutral (refuses deposits for 3 days).

**Flags set:** `clue-mus`, `clue-piperataria`, `gratus-has-drachm`, `mus-fate` (`spared|robbed|killed|fled`), `patron-leaning`, `escaped-carcer`.

---

#### 3.1.3 `mq-03-lemuria` — Beans for the Dead (*Fabae Lemurum*)

| Field | Value |
|---|---|
| Category / act | main, Act I, quest 3 (GDD §10.3 "Beans for the Dead") |
| Giver | `npc-gratus` (by message after `mq-02-carcer`) |
| Trigger | `mq-02-carcer` complete (v0.2). The night of 11 May, after v2. |
| Prerequisites | `mq-02-carcer` complete |
| Window | the first night after `mq-02-carcer` ends. The 12 May anchor's *pridie* clamp holds the date on **11 May** (the second Lemuria night, GDD §2.1) until the player starts `mq-04`, so the rite always happens "on the night of 11 May" as far as the player sees. The quest **scripts the rite itself** and does not depend on the `fest-lemuria` flag, because festival ambience fires only on the first elapsed day (GDD §14.10). `mq-04` cannot start until `mq-03` reaches `done`. |
| Milestone | v0.2 (v0.1 ships only the ghost-glimpse vignette) |
| Kinds | investigation, festival rite, short rooftop chase |
| NPCs | `npc-helpis`, `npc-marius-fuscus`, `npc-gemellus` |

**Stages**

1. **`start`** — *Journal:* "Gratus needed the key to Festus' cipher, and only his twin, Gemellus, would know it. And I had promised Festus I would tell his mother. The Marii live in the Velabrum, behind the Vicus Tuscus."
   - `go` — Go to the Marii's insula in the Velabrum → `loc:insula-mariorum`.
2. **`family`** — *Journal:* "Festus' mother, Helpis, opened the door before I knocked. She knew from my face."
   - `tell` — Tell Helpis about her son → `npc:npc-helpis` (`dlg-mq03-helpis`).
   - `wait` — Wait for midnight and keep silent during the rite → `time:v3` at `loc:insula-mariorum` (the Wait menu offers "until midnight").
3. **`rite`** — *Journal:* "At midnight Fuscus walked barefoot through his house, washed his hands at the basin and threw black beans behind him nine times without looking back: 'These I send; with these beans I redeem me and mine.' Then he clashed a bronze pot and called on the ghosts of his fathers to go out. And on the gallery above the courtyard, for a moment, I saw Festus' brown cloak."
   - The rite plays as a vignette (60 real s). The player stands by the door. Any action other than walking or looking (talking to Fuscus, drawing a weapon, running out) counts as an **interruption**.
   - `witness` — Keep silent through the rite (auto-complete if not interrupted; if interrupted: Fuscus' disposition −10, Pietas −5, the objective fails but the stage continues).
   - At the 9th throw, the **figure** appears for 2 s on the gallery opposite (edge of vision, GDD §2.4 rule: only at night, never in combat, vanishes when approached).
   - *Completes* when the rite ends → `investigate`.
4. **`investigate`** — *Journal:* "Fuscus would not speak of what he had seen. The house was quiet. But ghosts, I thought, do not usually leave marks."
   - `clue-beans` — The beans on the stairs → interact (`prop-fabae-scalae`): "Someone has picked up the beans from the third step, carefully, one by one."
   - `clue-dust` — The gallery rail → interact (`prop-gallery-rail`): "Fresh plaster dust under the hatch to the roof."
   - `clue-cloak` — Festus' chest → interact (`prop-cista-festi`) or ask Helpis: "Festus' old brown paenula is gone. It has hung there since the Saturnalia."
   - Count **2 of 3** to proceed (`count: 2` on a parent objective `clues`). Optional hint: Suetonius' line about Caesar's cipher is not available at night; instead Helpis says "Gemellus always hid on the roof when Fuscus beat him."
   - *Completes* → `roof`.
5. **`roof`** — *Journal:* "The hatch above the gallery led to the roof tiles. Someone was up there."
   - `confront` — Find whoever is hiding on the roof → `npc:npc-gemellus` at `loc:insula-mariorum-tectum`.
   - On sight, Gemellus (wearing Festus' paenula) bolts unless the player is sneaking (S < 35 when he first sees them). **Chase:** two roofs east, one gap (a 1.5 m jump), a ladder down to the next courtyard; he stops at the second gap ("I can't jump that. I never could.") and the dialogue starts. Athletics XP per GDD §5.4.
   - `cipher` — Get the cipher key from Gemellus → `item:quest-clavis-cifrae` (via `dlg-mq03-gemellus`).
6. **`done`** (end: complete) — *Journal:* "Gemellus gave me the key: every letter moved four places along, the game the twins played as boys. The message was three lines: IN DEDICATIONE ARCVS IN LOCO ALTO · EX ORIENTE PECVNIA PER HORREA PIPERATARIA · MONE GRATVM. 'At the dedication, a bow on the high place. Money from the East, through the Pepper Warehouses. Warn Gratus.' Tomorrow was the dedication. One thing still troubles me. Gemellus swore he was on the roof the whole time the beans were falling, and I believe him. I did not ask Fuscus what he had seen." *onEnter:* `give(quest-nuntius-festi)`; v0.2: `start(mq-04-columna)` at dawn.

**Dialogue**

```
DLG dlg-mq03-helpis · npcs: npc-helpis · priority 90
start: q(mq-03-lemuria).stage=family → n0
n0  "You're not from the camp. They send two men in good cloaks. You're from the road. Say it."
  ▸ "Festus is dead. He was killed at the Capena Gate this morning."                → n1
  ▸ (if flag(promised-festus)) "He asked me to tell you it was quick. It was."      → n2
  ▸ (if has(quest-epistula-festi)) [P] Give her the letter he was carrying.          → n3
n1  [N] She sits down on the stair. For a while she says nothing.  → n4 {pietas(+0)}
n2  "Quick. He would say that. He would lie to me to the last." → n4 {pietas(+5)}
n3  [N] She reads it with her lips moving, twice. "He was going to bring me Falernian. He never had the money." → n4 {take(quest-epistula-festi); pietas(+5); disp(+10)}
n4  "And Gemellus is gone since the Ides of April. My husband says the house is full of ghosts. Tonight is the night of the Lemures. Stay. Keep silent at midnight, whatever you see, and then we will talk about your cipher."
  ▸ "I'll stay."  ⇥ end   {stage(mq-03-lemuria, family); obj(tell)}
  ▸ "What cipher?" → n5
n5  "The boys had a game. Letters moved along, so their father couldn't read their notes. Gemellus will know. If you find him." ⇥ end {obj(tell)}

DLG dlg-mq03-gemellus · npcs: npc-gemellus · priority 95
start: q(mq-03-lemuria).stage=roof → n0
n0  "Don't. If you're one of the knife-men, do it quietly; my father's asleep. If you're from the camp, I'm not him."
  ▸ "Your brother is dead. I was with him."                                  → n1
  ▸ [Persuade 40] "I'm not with the knife-men. Festus gave me his tablet. Help me finish what he started."  → pass n3 · fail n2
  ▸ (if has(quest-epistula-festi) or flag(letter-given)) "He wrote to your mother. He mentioned you." → n3
  ▸ [Intimidate 40] "Give me the key, or I'll tell the whole Velabrum where you sleep."  → pass n4 · fail n2
  ▸ [P] Attack him.                                                           → {attack()} (civilian tier: he yields at once; killing him: Pietas −15, the key is on his body)
n1  "I know. I saw it in a dream, and then I saw you on the stair. Why do you think I came down?" → n2
n2  "Why should I trust you? Festus trusted people. Look where it got him."
  ▸ [Persuade 25] "Because the man who killed him is still out there, and tomorrow he'll kill again." → pass n3 · fail n2b
  ▸ "Because I'm all you've got."  → n3
n2b [N] He looks at the street below. "Prove it. Tell me how he died." → n3 (the player recounts; no check)
n3  "Four. Every letter four along, and X wraps round to D. We did it as boys so Father couldn't read our notes. He sent me a copy of the dispatch too, in case." {give(quest-clavis-cifrae)}  → n5
n4  "...Four along. Four. Take it and go." {give(quest-clavis-cifrae); disp(-10)} → n5
n5  "What will you tell my parents?"
  ▸ "That you're alive. They deserve that."       → n6 {flag(gemellus-revealed=true); pietas(+5); fama(dist-velabrum-boarium,+5)}
  ▸ "Nothing, if you don't want me to."           → n7 {flag(gemellus-revealed=false)}
  ▸ "Come with me to Gratus. Testify."            → n8
n6  "Then I'll go down. Before she finds me herself." ⇥ end {stage(mq-03-lemuria, done)}
n7  "Thank you. When it's over, I'll go down. When it's over." ⇥ end {stage(...)}
n8  [Persuade 25] check → pass: "If I'm going to be killed, I'd rather it was for something." {flag(gemellus-testifies=true)} · fail: "No. I copy other men's words. I don't say my own." ⇥ end {stage(...)}
```

**Rewards:** 40 den. from Fuscus ("for my son's honour") at `done`; `pietas +25` (taking part in a festival rite, GDD §14.6, if `witness` succeeded); `skillXp: religio` (if `witness`) or `skillXp: rhetoric`; `fama.dist-velabrum-boarium +5`; **item:** Helpis gives Festus' signet, `anulus-festi` (NEW unique: an `anulus-signatorius` with a horseman intaglio; it can seal letters as Festus, a later Locks & Seals lever).

**Failure states:** none hard. Killing Gemellus: the quest completes with `flag(gemellus-dead)`, Pietas −15, `homicidium` if witnessed (Fuscus witnesses if awake), Helpis and Fuscus become hostile-neutral, and the signet is not given.

**World changes:** the Marii's lamp shop shows mourning (a cypress branch on the door, GDD-style ambience) for 9 days. If `gemellus-testifies`, Gemellus is at `castra-peregrina` from 12 May; otherwise he is gone from Rome. Fuscus' barks change ("The house is quiet now. Quiet as a tomb.").

**Flags set:** `gemellus-revealed`, `gemellus-testifies`, `gemellus-dead`, `cipher-key`, `lemuria-rite-witnessed`.

**Ambiguity check (GDD §2.4):** natural explanation = Gemellus in Festus' cloak (dust, beans, missing cloak); the one unexplained detail = the timing of the figure on the gallery (Gemellus' alibi). The journal never says "ghost".

### 3.2 Faction starter quests

#### 3.2.1 `lud-01-sacramentum` — The Oath (*Sacramentum*) · Ludus Magnus

| Field | Value |
|---|---|
| Faction | `ludus-magnus` (GDD §9.2: "sign on as a paid guest or swear the oath … three practice bouts … ending with `boss-nereus`") |
| Giver | `npc-glaucus` |
| Trigger | Enter `ludus-magnus` between h1 and h11, or talk to Glaucus; `mq-02` stage `gratus` points here. |
| Prerequisites | none (any origin, any sex, any status) |
| Milestone | **v0.1-Must** (AC-08, AC-15; golden path step 4) |
| Kind | **arena fight** (three *lusiones* with practice arms, GDD §6.10), boss |
| NPCs | `npc-glaucus`, `npc-successus`, `npc-asiaticus` (referee), `npc-pullus`, `npc-auctus`, `npc-nereus`, `npc-hermippus`; a practice crowd of 80–120 (off-duty sailors of the Castra Misenatium, fans, other gladiators) |

**Stages**

1. **`start`** — *Journal:* "The Ludus Magnus trains Caesar's gladiators beside the amphitheatre. Its doctor, a scarred Thracian called Glaucus, said any free person may fight on its sand: as a paid guest, or for good under the gladiator's oath."
   - `sign` — Sign on with Glaucus → `npc:npc-glaucus` (`dlg-lud01-glaucus`): **guest** (default; no rank, no Infamia) or **oath** (*auctoratus*: Infamia +20, ranks unlocked). Sets `flag(ludus-status=guest|auctoratus)`.
2. **`kit`** — *Journal:* "Successus, who keeps the armory, made me sign for a wooden sword and a shield as if they were his own children."
   - `draw` — Draw a practice sword and a shield from the armory → `npc:npc-successus` (choose `scutum` or `parmula`; both plus `rudis` are tagged `ludus-issued` and are stored by the armory whenever the player leaves `ludus-magnus`, restored on re-entry).
   - The player may keep their own shield instead; the practice sword is mandatory (*arma lusoria*: real steel is refused at a lusio).
3. **`bout1`** — *Journal:* "My first opponent was Pullus, a boy from Capua who had sold himself to the sand. Asiaticus, the referee, shouted the lessons at both of us."
   - `win1` — Defeat Pullus in a practice bout → `kill:lud01-pullus` (KO or yield; practice arms never kill).
   - Tutorial calls by Asiaticus, each with an optional hidden counter objective: `parry` "Parry a blow (tap Q just before it lands)", `riposte` "Strike in the moment after a parry", `dodge` "Dodge (Space or Option + a direction)", `lockon` "Lock on (X)".
   - Loss: the player is knocked out → wakes in `ludus-saniarium` with `injured` for 1 game hour (lusio rule: a shortened, practice-only `injured`, [design]) and may retry at once.
4. **`bout2`** — *Journal:* "Then Auctus, a thraex with eighteen wins, who fights low and hooks round your shield."
   - `win2` — Defeat Auctus in a practice bout → `kill:lud01-auctus`.
   - After the bout, Auctus talks (`dlg-lud01-auctus`); the `mus` topic completes `mq-02`'s `ask`.
5. **`bout3`** — *Journal:* "Glaucus saved Nereus for last: a retiarius, victor of thirty-one, with a net that seemed to have no edges. The benches had filled."
   - `nereus` — Face Nereus the retiarius → **`boss-nereus`** (§5.3). The crowd-favor meter appears (starts at 30, +10 if `fama.plebs > 30`; GDD §6.10).
   - When Nereus yields at 15%: the crowd chants (*Mitte!* if favor ≥ 50, *Iugula!* below 30, mixed between). In a lusio no one dies: the player chooses **Spare** (favor +10, Pietas +5, `fama.plebs +2`) or **Strike the yielded man** (Asiaticus' staff stops the blow; favor −20, `fama.ludus-magnus −5`).
   - If the player yields: missio roll (spared at favor ≥ 50; 50% at 30–49; 10% below; Tiro always). Not spared → "the doctor stops the bout": wake in `ludus-saniarium`, `injured`, no purse for this bout; retry after 1 game hour.
6. **`done`** (end: complete) — *Journal:* "Nereus raised one finger to the benches, and then he laughed and raised mine. Glaucus paid me in front of everyone. 'Come back,' he said, 'when you can do that twice.'" *(Variant, if the player yielded and the crowd spared them:)* "I raised a finger before Nereus did, and the benches let me live. Glaucus paid me half and said that losing well is also a skill." Hermippus then patches the player up and tells them to rest until the lamps are lit (GDD §17.2 step 5: the Wait prompt).

**Dialogue**

```
DLG dlg-lud01-glaucus · npcs: npc-glaucus · priority 80
start: q(lud-01).stage=start → n0 · q(lud-01).stage=done → d0 · else → g0
n0  "Look at your feet. No, don't look at them, I'm looking at them. You stand like a baker. What do you want, baker?"
  ▸ "To fight."                                   → n1
  ▸ (if q(mq-02-*).stage=gratus) "I'm looking for a man who fights with a curved blade." → n0b
  ▸ (if sex=female) "To fight. Does that bother you?"      → n0f
  ▸ "Just looking." ⇥ end
n0b "Half my thraeces fight with a curved blade. Fight first, ask later; the ones who know won't talk to a stranger." → n1
n0f "Bother me? Domitian had women fighting by torchlight, and the crowd nearly tore the benches out. They'll love you twice as fast and the matrons will hate you twice as hard. That's your business. Fighting is mine." → n1
n1  "Two ways onto my sand. Guest: you fight for a purse, you go home at night, you're nobody's. Or the oath: 'to be burned, bound, beaten and killed by the sword.' Sworn men get ranks, and a name the crowd knows. And a stain that never washes out."
  ▸ "As a guest."                                                       → n2
  ▸ "Tell me exactly what the oath costs."                               → n3
  ▸ "I'll swear the oath."                                              → n4
n2  "Sensible. Guests are paid three denarii a practice bout and they bleed the same. Go and see Successus." ⇥ end {flag(ludus-status=guest); stage(lud-01, kit)}
n3  [N] SACRAMENTVM GLADIATORIVM — Swearing makes you an auctoratus: Infamia +20 at once (it never falls below 10 again), a bar to the equestrian ring while Infamia is above 20, and every public bout adds +2. In return: the Ludus ranks (tiro → rudiarius), the crowd's recognition, better purses.  → n1
n4  "Then say it after me, and mean it: uri, vinciri, verberari, ferroque necari." 
  ▸ [P] "Uri, vinciri, verberari, ferroque necari."   → n5 {infamia(+20); flag(ludus-status=auctoratus); rank(ludus-magnus, tiro)}
  ▸ "On second thought, as a guest."                 → n2
n5  "Welcome, tiro. Now you belong to the sand, and the sand belongs to Caesar. Successus will give you wood. Earn iron." ⇥ end {stage(lud-01, kit)}
g0  "Successus has your kit. Then Asiaticus has your bout. Go."  ⇥ end
d0  "Again? Good. Not today. Your arms are lying to you; they say they're fine." 
  ▸ (if q(mq-02-*).stage∈{gratus}) [Persuade 25] "The man with the curved blade. Who?"  → pass d1 · fail d2
  ▸ "Train me." {service(train)} ⇥ end
  ▸ "Farewell." ⇥ end
d1  "Ask Auctus about the Mouse. And don't tell him I said so." ⇥ end {flag(clue-mus=true)}
d2  "I train fighters, not informers. Ask the thraeces yourself." ⇥ end

DLG dlg-lud01-auctus · npcs: npc-auctus · priority 80
start: q(lud-01).stage≥bout3 → a0 · else → b0
b0  "After the bout, stranger. I don't talk to people I haven't hit."
  ▸ [Persuade 40] "A courier was knifed at the Capena Gate. Up from under, with a curved blade."  → pass m0 · fail ⇥ end
  ▸ "After the bout, then." ⇥ end
a0  "Good bout. You parry like a man who's been hit a lot. That's a compliment."
  ▸ (if q(mq-02-*).stage=gratus) "A courier was knifed this morning with a stroke from below, a curved blade." → m0
  ▸ "How do I beat Nereus?"  → a1
  ▸ "Farewell." ⇥ end
a1  "Don't be where the net lands. If it lands on you, raise your shield and pull; he always follows with a big slow poke. And don't let him make you run; the crowd hates a runner." → a0
m0  "Up from under, like a thraex finishing a man on his knees? That's our stroke. Nobody uses it in the street... except Dizas. The Mouse. Glaucus threw him out last winter for stealing a cloak from the Saniarium. Now he runs knife-men out of a burned taberna off the Vicus Tuscus." ⇥ end {flag(clue-mus=true); obj(mq-02-*, ask); reveal(mq-01, hideout)}

DLG dlg-lud01-nereus (after the bout) · npcs: npc-nereus · priority 70
start: q(lud-01).stage=done → r0
r0  "You blocked my net with your shield. Nobody does that. Everybody tries to run."
  ▸ "You were holding back."                  → r1
  ▸ "Teach me the spear."                     → r2
  ▸ "Thirty-one wins. Why are you still here?" → r3
r1  "In a lusio? Of course. And so were you, I hope. If not, you have work to do." → r0
r2  "The trident is a spear that changed its mind three times. Come at the eighth hour." {service(train)} ⇥ end
r3  "Because the sand is the only place in Rome where everyone can see you're good at something." → r0
```

**Rewards:** bout 1 and bout 2: 3 den. each (GDD §7.2 practice bout); bout 3: guest purse **30 den. × (1 + favor/100)** (30–60 den.); `fama.ludus-magnus +10`; `fama.plebs +3`; `skillXp: blades` (or `shield`, whichever rose more during the bouts); if sworn: `rank: ludus-magnus/tiro` (already granted on swearing). **Unlocks:** Nereus as spear trainer (Common 40); Glaucus as blades trainer (Expert 70); the arena kit stock at Successus.

**Failure states:** none (every loss is a knockout and a retry). Using real steel or a lethal poison in a lusio is refused at the gate ("Wood, or nothing.").

**World changes:** the practice crowd remembers the player: Ludus fans at the Meta Sudans greet them by name if favor ended ≥ 70 (GDD §3.4: greeting by name normally needs Fama > 50; this is a local exception for the Colosseum valley only [design]). Nereus' barks change ("The net remembers you."). The Meta Sudans brawl (`misc-meta-sudans-rixa`) is armed for the walk back.

**Flags set:** `ludus-status`, `lud01-favor` (final favor), `nereus-spared`, `clue-mus`.

---

#### 3.2.2 `vig-01-hamae` — Buckets (*Hamae*) · Vigiles

| Field | Value |
|---|---|
| Faction | `vigiles` (GDD §9.2 `vig-01-hamae`: "join a bucket chain at a cenaculum fire in the Velabrum and learn the siphon pump") |
| Giver | `npc-ursulus` |
| Trigger | Any night (v1–v4) after `mq-01`: a fire breaks out at `insula-ardens` when the player is within 150 game m of it (cries of *Incendium!*, a smoke column, a compass tick), or talk to Ursulus at `excubitorium-velabri`. |
| Prerequisites | `mq-01` complete; no Vigiles bounty |
| Milestone | v0.3 (roadmap); **pull-forward candidate for v0.2** with a scripted fire (fire zones and smoke volumes, no spreading simulation) |
| Kind | **fire with the Vigiles** |
| NPCs | `npc-ursulus`, `npc-primigenius`, `npc-daos`, 6 tenants (2 trapped: an old man **Dasius** with a strongbox, and a girl **Secunda**), 6 bucket-chain extras |

**Stages**

1. **`start`** — *Journal:* "Fire on the third floor of an insula at the edge of the Velabrum. The vigiles were already there with their pitch-sealed rope buckets, and an optio called Ursulus shoved one into my hands."
   - `join` — Join the bucket chain → `npc:npc-ursulus` (receive `hama`, NEW tool).
2. **`chain`** — *Journal:* "Water from the basin, hand to hand, up the stair. The fire did not care how tired we were."
   - `buckets` — Pass buckets up the chain → count **10** (interact rhythm at `loc:lacus-velabri` → stair slot: press E when the incoming bucket reaches your hands; a miss spills it). Each pass: Athletics +2.
   - `tenants` — Bring the trapped tenants down → count **2** (inside the 1:1 insula interior: smoke volumes cause `caecatus` 1–3 s; a wet `cento` (NEW, from Daos) lets the player cross one fire zone without damage; fire zones do 6 HP/s, GDD [design]).
   - **Twist (radiant pool, GDD §11.2):** old Dasius refuses to leave his strongbox. `[Persuade 25]` ("The box won't burn. You will."), carry him (hold E: walk speed, stamina drains 6/s), or carry the box first (he follows), or leave him (he dies at the timer).
   - **Timer:** 40 game minutes (2 real minutes) from `chain` start for the tenants; each death: `fama.vigiles −5`, journal line changes.
3. **`siphon`** — *Journal:* "Then the pump came up on its cart. Daos the Thracian set me on one handle and took the other."
   - `pump` — Work the siphon pump with Daos → rhythm mini-game: alternate F and Q on the beat for 20 s (`fire-run` Athletics XP 20, GDD §5.4). Fire out.
4. **`cause`** — *Journal:* "When the smoke cleared Ursulus walked me up the black stair. 'Lamp on a straw mattress, they'll say,' he said. 'Smell that.'"
   - `search` — Search the burned stairwell → find **1 of 2** clues: pitch-soaked rags under the stair (`quest-panni-picati`), or a new lock on the ground-floor shop, already emptied before the fire.
   - Sets `flag(clue-pitch-velabrum)` (seeds `vig-04` "The Landlord of Flames" and the Purse cell's arson-for-profit route, GDD §10.2).
5. **`done`** (end: complete) — *Journal:* "Nobody thanked us; the tenants were already arguing about who owed whom a blanket. Ursulus said the watch could use someone who didn't run, and that freedmen and nobodies were welcome."
   - Join prompt (`dlg-vig01-ursulus` end): **join the cohort** → `rank: vigiles/vigil`. A `dacus` (Junian Latin) player hears the citizenship line (Lex Visellia, GDD §9.2).

**Dialogue (core)**

```
DLG dlg-vig01-ursulus · npcs: npc-ursulus · priority 85
start: q(vig-01-hamae).stage=start → n0 · stage=done → d0
n0  "Hands! You've got hands! Take this, fill it at the basin, pass it up, don't drop it, don't die. Questions later."
  ▸ "Give it here."                         → ⇥ end {give(hama); obj(join)}
  ▸ "It's not my fire."                     → n1
n1  "It's everybody's fire in the Velabrum, friend. The wind changes and it's yours." ⇥ end {give(hama); obj(join)}
d0  "You didn't run. Most people run, or loot. We could use you. Freedmen, Latins, nobodies: on a ladder everyone's the same height."
  ▸ "I'll join the watch."                                 → d1
  ▸ (if origin=dacus) "They say a Latin can earn citizenship in the watch." → d2
  ▸ "Not tonight."  ⇥ end
d1  "Then you're a vigil. You'll sleep by day, sweat by night, and smell of pitch for the rest of your life." ⇥ end {rank(vigiles, vigil)}
d2  "Six years, by the law of Visellius. Faster, if the prefect likes you. He likes people who carry old men down burning stairs." → d1 {disp(+5)}
```

**Rewards:** 25 den. (the prefect's fund); `fama.vigiles +10`; `fama.dist-velabrum-boarium +5`; `skillXp: athletics`; rank `vigil` if joined; tenants alive both: +5 den. from the grateful (Secunda's mother), and `pietas +5`.

**Failure states:** **fail** if the player steals from the burning flats and a vigil sees it (`furtum`, the chain throws them out: "Ursulus threw me out of the chain. Some people loot fires; I had become one of them."). Both tenants dying is not a failure; the quest completes with the bleak journal variant.

**World changes:** `insula-ardens` becomes a burned shell (the `kit-insula` burned variant, later a `dun-insula-usta` candidate); the tenants camp at `compitum-boarii` for 3 days; the vigiles greet the player at night.

**Flags set:** `clue-pitch-velabrum`, `vig01-dasius` (`saved|dead`), `vig01-secunda` (`saved|dead`).

---

#### 3.2.3 `urb-01-sacramentum` — The Drill (*Exercitatio*) · Urban Cohorts

| Field | Value |
|---|---|
| Faction | `cohortes-urbanae` (GDD §9.2: "oath, drill and escort duty in the Forum") |
| Giver | `npc-proculus` (drills recruits by the Rostra at dawn) |
| Trigger | Talk to Proculus at `rostra` h1–h4 or at `statio-cohortium-urbanarum`. |
| Prerequisites | **citizen** (`civis` or `libertus`, GDD §9.1 "Citizens only"); no bounty; `mq-02` complete |
| Milestone | v0.3 (roadmap; pull-forward needs the `miles` AI, which v0.1 ships) |
| Kind | drill, escort, combat |

**Stages**

1. **`start`** — *Journal:* "The Urban Cohorts take only citizens. Proculus, their drillmaster, made me swear by the Genius of Caesar before he would even look at my feet."
   - `swear` — Swear the oath → `npc:npc-proculus` (`dlg-urb01-proculus`). The oath is by the Genius of Caesar: breaking it later costs Pietas −10 (GDD §14.6).
2. **`drill`** — *Journal:* "Drill in the Forum at dawn, in front of everyone. The idlers on the basilica steps cheered every time I was knocked down."
   - `line` — Hold the shield line: block 10 blows of Proculus' vine staff → count **10** (`block` events while in the marked line slot).
   - `march` — March in step to the Temple of Divus Julius and back → follow the formation markers (a walking rhythm; break step 3 times and the drill restarts).
   - `subdue` — Disarm and subdue a "rioter" without killing him → `kill:urb01-rioter` with **knockout or yield only** (a kill fails the drill and Proculus restarts it with a fine of 5 den.).
3. **`escort`** — *Journal:* "My first duty: walk a banker's coin cart from the Basilica Paulli to the treasury in the Temple of Saturn. A hundred and seventy paces. What could happen?"
   - `cart` — Escort the coin cart to the Temple of Saturn → `loc:temple-saturn` (the cart starts at `tabernae-aemiliae`, Hermogenes' clerk Lycus signs it out).
   - **Ambush** at the Vicus Iugarius crossing: 3 `grassator` + 1 `funditor` on the Basilica Julia steps (v0.2 ships the sling; in v0.1-pull-forward use a 4th grassator). Thieves try to grab coin sacks (each grab = 3 s channel; interrupt with any hit).
   - `sacks` — Lose no more than one sack → 6 sacks start on the cart.
   - **Twist:** at the treasury the quaestor's clerk weighs the sacks: one is short by 40 den. **before** the ambush. `[Mercatura 25]` or asking Lycus (`[Persuade 25]`) reveals the swap happened at Hermogenes' table → `flag(clue-hermogenes-weights)` (The Purse, GDD §10.2).
4. **`done`** (end: complete) — *Journal:* "Proculus said I marched like a camel and fought like a soldier. Coming from him, that was a promotion."

**Dialogue (core)**

```
DLG dlg-urb01-proculus · npcs: npc-proculus · priority 80
start: q(urb-01).stage=start → n0
n0  "Recruit? Citizen? Show me your feet. Good. Now swear: by Jupiter Best and Greatest, and by the Genius of Caesar, to obey, to stand, and not to run."
  ▸ (if status∈{civis,libertus}) "I swear it."                       → n1
  ▸ (if status∉{civis,libertus}) "I'm not a citizen."                 → n2
  ▸ "What's the pay?"                                                → n3
n1  "Then you're a miles of the Tenth Urban. Shields touching, recruit. If a fly gets through, you'll eat it." ⇥ end {stage(urb-01, drill)}
n2  "Then you're in the wrong queue. The vigiles take anyone. We take Romans." ⇥ end
n3  "More than a vigil, less than a praetorian, and all the dust you can breathe." → n0
```

**Rewards:** 30 den.; `fama.cohortes-urbanae +10`; `skillXp: shield`; `rank: cohortes-urbanae/miles`. If the short sack was traced: +10 den. and `fama.cohortes-urbanae +5`.

**Failure states:** **fail** if 3 or more sacks are lost (the cart is "robbed under your escort"; the quest can be retaken from Proculus after 3 days as `urb-01` again, his barks are scornful). Killing a bystander: fail and bounty.

**World changes:** the player's patrol duty becomes a radiant (`rad-urb-praesidium`); Hermogenes' disposition −10 if the swap was raised; the Basilica Julia idlers jeer or cheer by name.

**Flags set:** `clue-hermogenes-weights`, `urb01-sacks-lost`.

---

#### 3.2.4 `lav-01-sector` — Cut a Purse (*Sector Zonarius*) · Cultores Lavernae

| Field | Value |
|---|---|
| Faction | `cultores-lavernae` (GDD §9.2: "a lift on a crowded market day"; joining: "steal a token from the doorman, or bring stolen goods worth ≥ 25 den.") |
| Giver | `npc-chrysis` |
| Trigger | Chrysis approaches the player at `popina-vici-tusci` or `caupona-carcerum` after v1 if **any** of: the player has made a successful lift; carries stolen goods; Infamia ≥ 10; or asks Chreste about "people who find lost things". |
| Prerequisites | pickpocketing shipped (v0.2) |
| Milestone | v0.6 (roadmap); **pull-forward candidate for v0.2** (recruitment moves from the Subura HQ to the Velabrum) |
| Kind | **stealth** (pickpocket), moral choice |

**Stages**

1. **`start`** — *Journal:* "A garland-seller called Chrysis sat down at my table and told me what was in my purse without looking. Laverna, she said, looks after those who look after themselves. If I wanted an introduction, I could start with the doorman's token."
   - `token` — Lift the bronze token from Bucco's belt → `item:tessera-lavernae` from `npc:npc-bucco` (he is drinking at `popina-vici-tusci`, `drunk` state: S rises slowly; pickpocket formula GDD §14.4) — **or** — `goods` — Show Chrysis stolen goods worth 25 den. or more (inventory check of `stolenFrom` stacks).
2. **`market`** — *Journal:* "Chrysis named the mark: Lurco, the cattle dealer, who wears his purse like a second belly. 'Market crowds are Laverna's cloak,' she said."
   - `lift` — Lift Lurco's purse in the Forum Boarium crowd → `item:quest-zona-lurconis` from `npc:npc-lurco` (h2–h7 at `forum-boarium`; crowd of ≥ 3 within 4 m gives +15%; his two bruisers watch his back: approach from the front-left).
   - With `perk-pickpocket-sector-zonarius` the whole purse comes in one lift.
   - **Caught:** `furtum-personae` bounty (25 + 2 × value); the bruisers attack (a brawl if the player raises no blade); Chrysis vanishes. The stage stays open; retry next day (Lurco +1 alert).
3. **`share`** — *Journal:* "Inside the purse, besides the money, was a bill of sale for a sick slave, crossed through, with 'left on the island' written beside it in a careless hand."
   - `bring` — Bring the purse to Chrysis at the Inn at the Starting Gates after dark → `npc:npc-chrysis` at `loc:caupona-carcerum`, `time:v1`.
   - Choice in dialogue: keep the bill of sale (`quest-titulus-onesimi`, NEW) or hand it to Chrysis ("Laverna takes paper too").
4. **`done`** (end: complete) — *Journal:* "Chrysis took Laverna's third and left me the rest. 'You're a tiro now,' she said. 'Show the token at the fullery on the Clivus Suburanus when the magister wants you.'"

**Dialogue (core)**

```
DLG dlg-lav01-chrysis · npcs: npc-chrysis · priority 80
start: q(lav-01).stage=start → n0 · stage=share → s0
n0  "Six denarii, a lamp wick and a love letter you never sent. Don't look like that; I didn't take anything. Yet."
  ▸ "Who are you?"                                     → n1
  ▸ "Touch my purse and I'll break your fingers."       → n2
n1  "A girl who sells garlands for funerals. Our club buries its members very nicely. Interested?"
  ▸ "What do I have to do?"                            → n3
  ▸ "I'm not a thief."                                 → n4
n2  "Charming. Laverna likes a temper; it makes people look the wrong way." → n1
n3  "Bucco, the big sad one in the corner, wears our token on his belt. Bring it to me before he notices. Or bring me something worth twenty-five that isn't yours." ⇥ end {stage(lav-01, start)}
n4  "Of course not. Neither is anyone, until the first time." ⇥ end
s0  "Well? Show Laverna what Lurco carries."
  ▸ [P] Give her the purse and keep the bill of sale.     → s1 {flag(kept-titulus=true)}
  ▸ [P] Give her everything.                              → s2
s1  "Paper? Keep it, if it matters to you. Laverna doesn't read." {split purse: 2/3 player} → s3
s2  "A bill of sale with 'left on the island'. Ugly. Paper like this is worth more than coin, to the right buyer." {split purse; take(quest-titulus-onesimi)} → s3
s3  "You're a tiro. Don't steal from the poor, don't steal from us, and never, ever steal from Faustus' laundry." ⇥ end {rank(cultores-lavernae, tiro); stage(lav-01, done)}
```

**Rewards:** two thirds of Lurco's purse (18–30 den., rolled when the quest starts); `fama.cultores-lavernae +10`; `skillXp: pickpocket`; `rank: tiro`; keeps `tessera-lavernae` (the pass for the HQ, v0.3). If the bill of sale is kept, it is decisive evidence in `misc-servus-aesculapii`.

**Failure states:** **fail** if the player reports Chrysis to the Urban Cohorts (a dialogue option with Verecundus becomes available after `start`): `fama.cultores-lavernae −20`, Chrysis disappears, and the guild is closed to the player until `urb-07`.

**World changes:** Lurco barks about the theft for 3 days, the Forum Boarium alert rises by 1 for a day (GDD §14.1), and his bruisers patrol with him.

**Flags set:** `kept-titulus`, `lav01-caught`.

---

#### 3.2.5 `mit-01-silentium` — The Oath of Silence (*Silentium*) · Sodales Invicti

| Field | Value |
|---|---|
| Faction | `sodales-invicti` (GDD §9.1: invitation after a soldier vouches; the player must have spared at least one yielded foe; oath of silence) |
| Giver | `npc-ingenuus` (vouches) → `npc-alcimus` (Pater) |
| Trigger | Ingenuus approaches at `caupona-carcerum` after v1 when `spared-count ≥ 1` **and** one of: origin `veteranus`; `fama.cohortes-urbanae ≥ 10`; `fama.ludus-magnus ≥ 10`; or the player bought him a drink and passed `[Persuade 40]`. |
| Prerequisites | `mq-03` complete (v0.2+) |
| Milestone | v0.6 (roadmap) |
| Kind | lose a tail (stealth), initiation (role-play), a test of nerve |

**Stages**

1. **`start`** — *Journal:* "A praetorian called Ingenuus, sober in a tavern full of drunks, said he had seen me spare a beaten man. He gave me a raven's feather and told me to be at the Horrea Agrippiana, at the shop with the bull's-horn knocker, in the second watch. Alone."
   - `go` — Go to the clothier's shop in the Horrea Agrippiana in the second watch → `loc:taberna-vestiarii` with `time:v2` (until v3).
   - `tail` (optional, appears when triggered) — Lose the man following you → an off-duty urban soldier tails from the caupona (break line of sight for 20 s, or `[Persuade 25]`/`[Bribe 25 den.]` him). If he is still following at the door, Tychicus refuses to open ("Not tonight") and the objective resets for the next night.
2. **`threshold`** — *Journal:* "Tychicus the clothier took the feather, bound my eyes with a strip of wool, and led me down more steps than a cellar should have."
   - `descend` — Follow the guide (blindfolded: the screen is black except for the next sound cue; walk with W toward the voice).
3. **`ordeal`** — *Journal:* "In the dark a voice asked me three questions. I answered as honestly as I could. Then something cold touched my chest, and the voice said: 'Do not move.'"
   - `answer` — Answer the Pater's three questions → `npc:npc-alcimus` (`dlg-mit01-pater`; there are no wrong answers except mockery).
   - `still` — Do not move → hold still for 5 real s (no input except look). Moving: the test is repeated once; moving twice: "Not yet" (retry next meeting night).
4. **`light`** — *Journal:* "The blindfold came off. In the lamplight a young god in a Persian cap was killing a bull carved in stone, and a dozen men I did not know were smiling at me. 'Corax,' said the Pater. 'The Raven serves.'"
   - `oath` — Swear the oath of silence (dialogue) → `rank: sodales-invicti/corax`.
5. **`done`** (end: complete).

**Dialogue (core)**

```
DLG dlg-mit01-pater · npcs: npc-alcimus · priority 90
start: q(mit-01).stage=ordeal → n0
n0  [Voice in darkness] "Why do you come down into the earth?"
  ▸ "Because a man I trust asked me."        → n1
  ▸ "To find something I can't find above."   → n1 {disp(+5)}
  ▸ "Curiosity."                              → n1
  ▸ "To see what you're hiding."              → n9
n1  "What did you leave behind you, at the top of the steps?"
  ▸ "My name."                                → n2 {disp(+5)}
  ▸ "Nothing. I came as I am."                → n2
  ▸ [Religio 25] "My fear. I left it with the clothier." → pass n2 {disp(+10); skills(religio,+10)} · fail n2
n2  "When you spared a beaten man, why did you do it?"
  ▸ "Because he asked."                       → n3
  ▸ "Because killing him would have changed nothing."  → n3
  ▸ "I don't know."                           → n3 {disp(+5)}   (honesty is valued)
n3  "Then stand still." ⇥ end {stage(mit-01, ordeal); obj(answer)}
n9  "Then go back up, and tell everyone you saw a cellar." ⇥ end {fail(mit-01)}
```

**Rewards:** `fama.sodales-invicti +10`; `pietas +10`; `skillXp: religio`; `rank: corax`; item `quest-penna-corvi` becomes `penna-corvi` (NEW keepsake). Unlocks the patron `patronus-mithras` path (later).

**Failure states:** **fail** on mockery (n9), or if the player later tells the cell's location to the Urban Cohorts or a crier (a dialogue option exists with Verecundus and Cerdo after `light`): expelled, `fama.sodales-invicti −20`, Ingenuus becomes hostile-neutral.

**World changes:** Tychicus gives a 10% discount; soldiers in the cell greet the player with "Nama" [P: a later Mithraic salutation, flagged].

**Flags set:** `mithraic-corax`, `mit01-tail-lost`.

---

#### 3.2.6 `cli-01-salutatio` — Morning Calls (*Salutatio*) · Clientela

| Field | Value |
|---|---|
| Faction | `clientela` (GDD §9.2: "attend the dawn salutatio 3 times; afterwards a daily radiant with the sportula") |
| Giver | the patron's agent (`npc-phoebus`, `npc-theodote` or `npc-pollio`), or the `hispanus` letter for Calpurnia |
| Trigger | `mq-02-carcer` agent accepted (starts with that patron), or talk to any agent at their daytime spot; `hispanus` origin can start it from the letter at once. |
| Prerequisites | formal dress (toga for a man, stola with palla for a woman; GDD §8.2) for citizens; non-citizens attend in their best tunic and cap at `amicus` (GDD §9.1) |
| Milestone | v0.6 (roadmap); the three agents appear in v0.2 |
| Kind | **persuasion**, social puzzle, delivery |

**Stages**

1. **`start`** — *Journal:* "A client's life begins before dawn, in a queue at a great man's door, in a toga that takes two people to put on. I chose my door."
   - `choose` — Choose a patron's door → `loc:domus-sergii` | `loc:domus-calpurniae` | `loc:domus-vettii` (the first door where the player attends counts; switching before visit 3 resets the count).
   - `salutatio` — Attend the dawn salutatio in formal dress → count **3**, each at h1 (to h2) on a different day.
   - **Visit 1 — the door:** the door slave (Philargyrus at Sergius'; the old porter Senex at Vettius'; Iris at Calpurnia's) wants a tip: pay 1 as., `[Persuade 25]`, or wait at the back of the queue (the patron "has left for the Forum" if the player arrives after h2). In Sergius' queue **Juvenal** stands two places ahead and mutters (§8.1 barks); a rich freedman pushes in front of a senator's client, a Juvenalian vignette.
   - **Visit 2 — the small talk:** the patron asks one question about the war (`[Persuade 25]`, +5 disposition and Rhetoric XP 5, GDD §5.4); the answer shows the patron's line: Sergius (hawk), Calpurnia (Plotina's circle, careful), Vettius (sceptic).
   - **Visit 3 — the favour:** the sportula and a sealed note to carry.
2. **`favor`** — *Journal:* "My patron handed me a sealed note with the sportula, as if the one were the price of the other."
   - `deliver` — Deliver the patron's note → Sergius: `npc:npc-celer` at the Ludus (he wants a pair of gladiators for a funeral munus); Calpurnia: `npc:npc-suetonius` at the Ulpian library (a book for Plotina's circle); Vettius: `npc:npc-hermogenes` (a request to extend a loan: the old senator is short of cash).
   - Optional twist (v0.2 Locks & Seals): open and reseal the note (`quest-epistula-patroni`); a flawed reseal is noticed by the recipient (disposition −10 with the patron, and the quest still completes).
3. **`done`** (end: complete) — *Journal:* "Three dawns, three queues, one note. I was a client now, which in Rome means I belonged to someone, in the politest possible way."

**Dialogue (core: Sergius' door)**

```
DLG dlg-cli01-philargyrus · npcs: npc-philargyrus · priority 80
start: q(cli-01).stage=start and at(domus-sergii) and time∈[v4,h2) → n0
n0  "Name? Ah. You. Wait there. No, further. Further."
  ▸ (if not dress(formal)) [N] He looks you up and down. "Togas to the left. Tunics, the street." → n9
  ▸ [Pay 1 as.] "For your trouble."             → n1 {pay(1/16)}
  ▸ [Persuade 25] "The consul asked for me by name."   → pass n1 · fail n2
  ▸ "I'll wait my turn."                        → n2
n1  "The master is less busy than he looked. In you go." ⇥ end {obj(salutatio,+1)}
n2  [N] You wait. The sun comes up. A freedman in three rings goes in before you. ⇥ end {obj(salutatio,+1) if time<h2}
n9  ⇥ end
```

**Rewards:** sportula 1 den. 9 as. per visit (GDD §7.2); 10 den. on delivery; `fama.clientela +10`; `skillXp: rhetoric`; `rank: clientela/cliens`. Unlocks `rad-cli-salutatio` (daily) and `rad-cli-epistula`.

**Failure states:** none. Attending in a toga as a non-citizen is *usurpatio* (bounty 100, GDD §14.1) and the door slave calls the watch; a woman in a toga is turned away (GDD §3.7) and the visit doesn't count.

**World changes:** the chosen patron's agent greets the player daily; the other two patrons' agents cool (disposition −5).

**Flags set:** `patron` (`sergius|calpurnia|vettius`), `cli01-note-opened`.

---

#### 3.2.7 `cir-01-stabulum` — Mucking Out (*Stabulum*) · Circus factions

| Field | Value |
|---|---|
| Faction | `factio-prasina` or `factio-veneta` (GDD §9.2: "stable work; choose your color", exclusive) |
| Giver | `npc-epaphra` (Greens) or `npc-phileros` (Blues) |
| Trigger | Talk to either stable master at `stabula-factionum` (hiring before the Ludi Apollinares, any day after `mq-05`) or hear the crier's notice ("Strong backs wanted at the stables, Greens and Blues alike"). |
| Prerequisites | none (Equitatio ≥ 15 is needed only to drive, later) |
| Milestone | v0.4 (roadmap) |
| Kind | labour, investigation, exclusive choice |

**Stages**

1. **`start`** — *Journal:* "Both colours were hiring stable hands for the summer games. I took a pitchfork from whoever offered first."
   - `muck` — Clean the stalls → count **5** (interact at stall props).
   - `water` — Water the horses → count **3**.
   - `walk` — Lead the champion horse round the yard → follow the path markers (on foot, leading by the halter).
2. **`poison`** — *Journal:* "By the ninth hour the champion was sweating and trembling in his stall. The stable master swore it was the other colour."
   - `look` — Examine the sick horse and its manger → `[Medicina 20]` identifies spoiled barley laced with oleander leaves (`quest-hordeum-corruptum`); without the check the player finds the leaves after 2 more interactions.
   - `track` — Follow the clue → a dropped token of the rival colour by the feed store **and** a lead curse tablet buried under the threshold (`defixio-prasina` if in the Greens' stable, or its Blue equivalent `defixio-veneta`, NEW). **Ambiguity:** the token is planted (its thong is new); the tablet is old. Talking to the feed seller (`[Persuade 25]`) reveals that a man from **neither** colour bought the oleander: a bookmaker who had bet on the horse losing (seed for `cir-05`).
3. **`choose`** — *Journal:* "Greens or Blues. In Rome that is not a question about colours."
   - `colour` — Choose your colour → Felix (Greens) or Venustus (Blues) dialogue. **Exclusive** (GDD §9.1).
4. **`done`** (end: complete) — rank `agaso` in the chosen faction.

**Rewards:** 12 den.; `fama.factio-<chosen> +10`, `fama.factio-<other> −5`; `skills: medicina +15` (diagnosing the horse); rank `agaso`. If the horse is saved (the oleander is found before h12): +8 den. from the stable master.

**Failure states:** none; the horse dies if not diagnosed by v1 (journal variant), which changes nothing else.

**World changes:** the chosen colour's fans in the Circus arcades greet the player; the other colour's fans heckle (barks §8.1).

**Flags set:** `circus-colour`, `cir01-horse` (`saved|dead`), `clue-bookmaker`.

### 3.3 Misc quests

Window and re-offer rules follow GDD §11.1: festival-bound quests are offered from 5 days before until the festival ends, and missed dated quests come back at the next festival of the same kind (otherwise every year after the epilogue).

#### 3.3.1 `misc-meta-sudans-rixa` — Brawl at the Fountain (*Rixa ad Metam*)

| Field | Value |
|---|---|
| Giver / trigger | Walking past `meta-sudans` between h11 and v2 after `lud-01` reaches `done` (golden path step 5: on the way back from the Ludus after the prompted wait to sunset), or any day between h11 and v2 once `lud-01` is done. The two fan leaders, `npc-bassulus` (*scutarii*, murmillo fans) and `npc-anicetus` (*parmularii*, thraex fans), are shouting about the day's bouts [A for the fan parties: Suet. *Dom.* 10; M. Aurelius *Med.* 1.5]. |
| Prerequisites | `lud-01` complete (v0.1); afterwards repeatable as a radiant brawl once a week |
| Milestone | **v0.1-Must** (AC-09, AC-15) |
| Kind | **combat, non-lethal**: knockouts and yields (GDD §6.9) |
| Enemies | 2 × `ebrius-rixator` (fists) + the rival leader as `collegium-bruiser` (caestus); 2 allies on the player's side if they join one |

**Stages**

1. **`start`** — *Journal:* "At the Sweating Post the murmillo's fans and the thraex's fans were shouting about shields. Big ones or small ones. Then someone mentioned my bout."
   - `choose` — Talk to the fans → `npc:npc-bassulus` or `npc:npc-anicetus` (`dlg-rixa`): join a side, calm them, or walk away (the brawl then starts without you and the quest completes as "walked away", no reward).
2. **`rixa`** — *Journal:* "Fists, not blades: a brawl is a brawl. Draw iron and it becomes assault."
   - `ko` — Knock out or make yield the other side's brawlers → `kill:rixa-<other side>` **×3**.
   - Rules: a *rixa* is non-lethal by rule; **drawing a blade** (R with a blade equipped) makes the brawlers scatter, turns it into `vis` (bounty 40) and **fails** the quest. Fists and caestus always knock out; the fustis knocks out humans up to `miles`. Player yield (hold Y 1 s): lose 10% of the purse, the fight ends (stage → `after`, "beaten" variant).
   - An enemy who yields kneels: **spare** (Pietas +5, `fama.dist-vallis-colossei +2`), **rob** (`furtum` if witnessed: the Meta Sudans always has witnesses), **kill** (impossible with fists; with a blunt weapon it needs Hold F: Pietas −15, `caedes-supplicis` 1,000).
3. **`after`** — *Journal:* "The watch arrived when it was over, as the watch always does."
   - `law` — Deal with the patrol → `npc:npc-verecundus` before v1, `npc:npc-primigenius` after (`dlg-rixa-law`): if the player threw the first punch, `rixa` bounty 10 den. (pay, `[Persuade 25]` to halve it, or point at the other side if your side won and two witnesses agree: no fine).
4. **`done`** (end: complete) — *Journal (winner):* "The winners bought me Falernian and told me I was a true scutarius (or a true parmularius). I have never had a cheaper friendship or a better one." *(peacemaker):* "Nobody hit anybody, and both sides went home disappointed. Rome has few greater achievements."

**Dialogue**

```
DLG dlg-rixa · npcs: npc-bassulus, npc-anicetus · priority 80
start: q(misc-meta-sudans-rixa).stage=start → n0
n0  (Bassulus) "You! You fought at the Ludus today. Tell this tanner the big shield wins."
    (Anicetus) "Don't listen to the butcher. Tell him Auctus was robbed!"
  ▸ "The big shield wins. Scutarii!"                    → n1 {flag(rixa-side=scutarii)}
  ▸ "Auctus was robbed. Parmularii!"                    → n1 {flag(rixa-side=parmularii)}
  ▸ [Persuade 25] "Both shields lost to me today. Drink to the winner, not the shield." → pass n2 · fail n3
  ▸ [Intimidate 40] "Shut up, both of you, or I'll show you how I won." → pass n2 · fail n3
  ▸ "Not my fight." ⇥ end {stage(…, done-walked)}
n1  "Ha! Then let's teach them!" ⇥ end {stage(…, rixa); spawn sides}
n2  [N] A pause. Then Bassulus laughs and slaps Anicetus on the back. "The winner! Wine for the winner!" ⇥ end {stage(…, done-peace); skills(rhetoric,+15); fama(plebs,+3)}
n3  "Who asked you?" [N] Someone throws a cup. The brawl starts around you. ⇥ end {stage(…, rixa); player joins the side that didn't throw}

DLG dlg-rixa-law · npcs: npc-verecundus, npc-primigenius · priority 85
start: q(misc-meta-sudans-rixa).stage=after → n0
n0  "Brawling at the Meta. In front of the amphitheatre. Who started it?"
  ▸ (if flag(threw-first-punch)) "I did."                      → n1
  ▸ (if not flag(threw-first-punch)) "They did. Ask anyone."   → n2
  ▸ [Persuade 25] "Fans being fans, officer. Nobody's hurt."    → pass n2 · fail n1
n1  "Ten denarii for the peace of the city. Pay, or walk with me." {crime(rixa,10)} ⇥ end
n2  "Fine. Go home. All of you." ⇥ end {stage(…, done)}
```

**Rewards:** winner: `vinum-falernum` ×1, 5 den. (the side's pot), `fama.dist-vallis-colossei +5`; peacemaker: `fama.plebs +3`, `skills: rhetoric +15`; beaten: nothing. Brawling XP accrues by use (GDD §5.4: knockout 12).

**Failure states:** **fail** on drawing a blade or killing anyone ("Blood at a brawl. The fans scattered and the watch came looking for me.").

**World changes:** the winning party greets the player at the Meta Sudans for 7 days; the other jeers (barks §8.1).

**Flags set:** `rixa-side`, `threw-first-punch`, `rixa-outcome`.

---

#### 3.3.2 `misc-lemuria-fabae` — Black Beans (*Fabae Nigrae*)

| Field | Value |
|---|---|
| Giver / trigger | `npc-florus`, at the popina (h9–v1) or by his door, complaining that the beans he throws to the ghosts vanish every Lemuria. |
| Window | 9–13 May, nights (GDD §11.1); in v0.1, the night of 11 May (first elapsed day). |
| Milestone | **v0.1-Should** |
| Kind | **investigation**, stealth tail, **festival** (Lemuria) |

**Stages**

1. **`start`** — *Journal:* "Florus the cooper throws black beans to the ghosts of his fathers every Lemuria, and every year by cockcrow they are gone. His wife says the dead are hungry. Florus wants to know how hungry."
   - `watch` — Keep watch in Florus' stairwell after the midnight rite → `loc:insula-tuccii`, `time:v3` (the Wait menu offers "until midnight").
2. **`watch`** — *Journal:* "After the rite, when the house was dark again, someone came down the stairs on bare feet and began to pick up the beans, one by one."
   - `see` — See who gathers the beans → stay unseen (S < 35) within 10 m: the gatherer is **Thallusa**, Florus' old slave.
   - `follow` — Follow her without being seen → to `loc:compitum-velabri`, where two thin children and their sick mother wait in a lean-to. If she spots the player (S ≥ 100), she does not run: she stops and pleads (straight to `choice`).
3. **`choice`** — *Journal:* "The ghosts' beans were feeding Thallusa's grandchildren. Her daughter was freed years ago; freedom, it turned out, did not include supper."
   - `decide` — Decide what to tell Florus → `npc:npc-thallusa`, then `npc:npc-florus` (`dlg-fabae`).
4. **`done`** (end: complete) — *Journal (ending varies):* "When I went back up Florus' stair, there was one black bean on every step, nine of them, although I had watched Thallusa sweep every last one into her apron."

**Dialogue**

```
DLG dlg-fabae · npcs: npc-thallusa, npc-florus · priority 85
start: speaker=thallusa and stage=choice → t0 · speaker=florus and flag(fabae-decided) → f0
t0  (Thallusa) "Don't tell the master. He'll sell me, and they'll starve before the Kalends. The dead don't eat beans, citizen. The living do."
  ▸ "Your secret is safe."                                   → t1 {flag(fabae=lie)}
  ▸ "I'll tell him the truth, but I'll make him listen."      → t2 {flag(fabae=persuade)}
  ▸ "He's your master. He has a right to know."              → t3 {flag(fabae=truth)}
  ▸ [P] Give her 5 denarii.                                  → t4 {pay(5); pietas(+5)}
t1  "The gods see you." ⇥ end {flag(fabae-decided)}
t2  "Then may Mercury lend you his tongue." ⇥ end {flag(fabae-decided)}
t3  [N] She says nothing. She picks up the smallest child. ⇥ end {flag(fabae-decided)}
t4  "...For the children. Thank you. I'll pray for you at every crossroads." → t0
f0  (Florus) "Well? Ghosts or thieves?"
  ▸ (if flag(fabae=lie)) "Ghosts. Hungry ones. Throw more beans next year." → f1
  ▸ (if flag(fabae=persuade)) [Persuade 40] "Your beans feed your slave's grandchildren. Feed them on purpose, and the dead will thank you twice." → pass f2 · fail f3
  ▸ (if flag(fabae=truth)) "Thallusa takes them for her grandchildren."   → f3
f1  "Gods! I knew it. Nine handfuls next year." ⇥ end {receive(5); pietas(+5); stage(done)}
f2  "...Pious, you mean? Feeding the living for the dead's sake. My father would have liked that. He never fed anyone." ⇥ end {receive(15); pietas(+10); fama(dist-velabrum-boarium,+5); flag(florus-feeds-family)}
f3  "My beans! For the dead! She'll be on the auction block by the Nones—" [N] He stops. "...No. Not in Lemuria. Not with my father listening." ⇥ end {receive(10); fama(dist-velabrum-boarium,-5) if truth}
```

**Rewards:** 5–15 den. by ending (above); Pietas as above; `skills: stealth +15` (the tail) and `rhetoric +10` (persuade ending).

**Failure states:** none.

**World changes:** persuade ending: Thallusa's daughter works in the cooperage (a new ambient NPC); truth ending: Florus grumbles but keeps Thallusa (the "Lemuria" line lets him off; GDD tone: no cruelty on screen).

**Flags set:** `fabae`, `florus-feeds-family`.

**Ambiguity check:** natural explanation = Thallusa; unexplained detail = the nine beans on the stair.

---

#### 3.3.3 `misc-insula-nutans` — The Leaning Insula (*Insula Nutans*)

| Field | Value |
|---|---|
| Giver / trigger | `npc-prima` (h2–h8 on the stair of `insula-nutans`), or her bark heard within 15 m ("Another crack!"). |
| Prerequisites | none |
| Milestone | **v0.1-Should** (the `insula-nutans` stairwell to the roof is one of the v0.1 interiors) |
| Kind | **persuasion**, investigation, a timed evacuation |

**Stages**

1. **`start`** — *Journal:* "Iulia Prima lives on the third floor of an insula on the Vicus Tuscus. The walls crack, the floors slope, and the landlord's man, Callistus, props it all up with timber and tells everyone to sleep easy."
   - `evidence` — Find proof the building is failing → count **3** of: the bulging ground-floor wall (behind the taberna), the bowed oak prop on the stair, the crack on the top floor you can put a hand into, a coin that rolls the length of Prima's floor (comic), and **`[Fabrica 25]`** at the ground-floor wall ("rubble core, no bonding course: cheap work", counts double).
2. **`callistus`** — *Journal:* "I took what I had found to Callistus."
   - `confront` — Confront Callistus → `npc:npc-callistus` (`dlg-nutans`): he laughs, then offers a bribe of 10 den. to forget it.
3. **`aedile`** — *Journal:* "The aediles answer for walls that fall on the public. Their man in the Forum is called Dento, and he hates scandal more than he hates work."
   - `report` — Report the building to the aediles' man → `npc:npc-dento` at `rostra` (`[Persuade 25]`, +10 per piece of evidence beyond the third; with the Fabrica finding the check is automatic).
4. **`evacuate`** — *Journal:* "Dento ordered the building emptied before dark. The tenants did not believe him either."
   - `warn` — Get the tenants out before nightfall → count **4** households (Prima's family, a shoemaker, an old couple, a family of Syrians who speak little Latin: `[Persuade 10]` or show Dento's order).
   - At **v1** the rear wall and stair partly collapse (a scripted event with dust, noise and falling tiles; anyone still inside is trapped: rescue in the stairwell with stamina drain, as in `vig-01`).
5. **`done`** (end: complete) — *Journal:* "The back of the insula came down in the first watch, and nobody was under it. Callistus has not been seen since. Prima says her husband built half the Forum and never once a wall like that."

**Dialogue (core)**

```
DLG dlg-nutans · npcs: npc-callistus · priority 80
start: q(misc-insula-nutans).stage=callistus → n0
n0  "Cracks? Every wall in Rome has cracks. It's how you know it's a wall. Sleep easy."
  ▸ [Persuade 40] "Fix it now, before you're explaining corpses to the aediles."  → pass n1 · fail n2
  ▸ [Intimidate 40] "Fix it, or I'll fix you."                                  → pass n1 · fail n2
  ▸ "I'm taking this to the aediles."                                          → n3
n1  "...I'll send for the builders. After the Ides. Possibly." → n3
n2  "Do. The aediles love a story." → n3
n3  "Listen. Ten denarii, and you never climbed these stairs. The master is a senator; you don't want to know which."
  ▸ [P] Take the money.            → n4 {receive(10); flag(nutans-bribed=true)}
  ▸ "Keep it."                     ⇥ end {stage(…, aedile)}
n4  "A sensible person. Sleep easy." ⇥ end {stage(…, bribed)}
```

**Bribed branch (`bribed`, end: **fail**)** — *Journal:* "I took Callistus' ten denarii. In the first watch the back of the insula came down. They are still digging." Two tenants die (bodies), `fama.dist-velabrum-boarium −15`, `pietas −10`; Prima's barks curse the player by description.

**Rewards (good ending):** 20 den. (collected by the tenants); Prima gives her late husband's `fascinum`; `fama.dist-velabrum-boarium +10`; `skillXp: rhetoric`.

**World changes:** `insula-nutans` becomes a propped ruin (the rear half fallen); its tenants camp at `compitum-vici-tusci` for 3 days; Callistus becomes a `rad-urb-proscriptio` bounty target (v0.3).

**Flags set:** `nutans-bribed`, `nutans-collapsed`, `callistus-fled`.

---

#### 3.3.4 `misc-venus-cloacina` — What Venus Hides (*Quod Cloacina Celat*)

| Field | Value |
|---|---|
| Giver / trigger | `npc-ianuarius` ("Someone's been lifting my grate!") on his patrol, or seeing a bundle dropped through the grate at `shrine-venus-cloacina` after v2. |
| Prerequisites | `mq-02` at `mus` or later (so the Cloaca is not the player's first night) |
| Milestone | **v0.1-Should** (a 3-room form is enough, GDD §17.1) / v0.2 Must (full `dun-cloaca-maxima`) |
| Kind | **sewer delve**, boss |
| Dungeon | `dun-cloaca-maxima` (kit `kit-cloaca`, size M, GDD §12.4): entrance the grate under the Cloacina shrine, climax `boss-rex-cloacae`, loopback `cloaca-grate-aemiliae` |

**Stages**

1. **`start`** — *Journal:* "Ianuarius, a public slave who looks after the drains, swears someone has been lifting the grate beside the little shrine of Venus Cloacina, the Venus of the sewer, in the middle of the Forum."
   - `watch` — Watch the shrine of Venus Cloacina at night → `loc:shrine-venus-cloacina`, `time:v2`–`v3`. A `cloacarius` lifts the grate, drops a bundle of stolen bath clothes and climbs down after it.
2. **`descend`** — *Journal:* "Ianuarius gave me his key and a torch, and the blessing of 'the old lady', as he calls the Cloaca."
   - `enter` — Go down into the Cloaca Maxima → interior `dun-cloaca-maxima` (key `clavis-cloacae`; in v0.2 the grate can also be picked, `mediocris`).
   - **Beat 1, exploration:** the old vaulted channel (6 m wide, tufa and travertine), side drains, offerings stuck in the silt (a small loot path). **Rat swarm** hazard (1 HP/s, a lit `fax` disperses it, GDD §6.11).
   - **Beat 2, combat spike:** 3 `cloacarius` from side channels (knives, a net, a torch) and a `funditor` on a ledge (v0.1-Should: replace the slinger with a thrown-stone thug).
   - **Beat 3, puzzle/traversal:** a sluice chamber: turn two wheels in order (upstream first, or the walkway floods for 20 s) to drain the way; a `mediocris` lock on the gang's gate (v0.2) or the key from a sleeping lookout (v0.1).
3. **`rex`** — *Journal:* "In a chamber where three drains meet, a man in a stolen toga sat on a throne of bath-house benches and called himself king."
   - `boss` — Defeat or outwit the Rex Cloacae → **`boss-rex-cloacae`** (§5.3). Opening the sluice first flushes his gang and makes him surrender.
4. **`cache`** — *Journal:* "His treasure was mostly other people's clothes. Not all of it."
   - `loot` — Search the Rex's cache → `cista-regis-cloacae` (§6.3): stolen bath clothes, 30–40 den., `pugio-noric`, and **a wax tablet sealed with the impression of a Parthian drachm** (`quest-tabella-drachmae`; GDD B11's hook): the same coin as in Mus' satchel, if the player has seen it (`flag(drachm-seen-twice)`).
   - `out` — Climb out by the grate beside the Basilica Paulli → `loc:cloaca-grate-aemiliae` (unbar from below: the loopback).
5. **`done`** (end: complete) — *Journal:* "Ianuarius counted his grates twice and pronounced the old lady satisfied."

**Dialogue (core)**

```
DLG dlg-cloacina · npcs: npc-ianuarius · priority 80
start: stage=start → n0 · stage=done → d0
n0  "My grate! The one by the little Venus. Scratches on the iron, and the bolt oiled, and I never oil it. Someone's using my lady as a front door."
  ▸ "I'll watch it tonight."                   → n1
  ▸ "What's down there?"                       → n2
n1  "Second watch is when the bath-thieves come home. Take my key if you go down. And a torch. The rats respect a torch." ⇥ end {give(clavis-cloacae); give(fax,2)}
n2  "The oldest drain in the world. Kings built it. Venus guards the gate. And lately, somebody's kingdom." → n0
d0  "You came up by the Paulli grate? Then she let you out. She doesn't always." ⇥ end {receive(30); fama(dist-forum-romanum,+10)}
```

**Rewards:** 30 den. (from the curators); the cache; `fama.dist-forum-romanum +10`; `skillXp: athletics` or `stealth` (the larger gain); `sordidus` until washed (GDD §14.8).

**Failure states:** none. Dying in the Cloaca: reload.

**World changes:** bath thefts at the Baths of Titus stop for 7 days (fewer `rad-vicus` stolen-clothes jobs); the Rex, if spared, reappears as a fence contact (v0.3).

**Flags set:** `rex-cloacae-fate`, `drachm-seen-twice`.

---

#### 3.3.5 `misc-facies-columnae` — The Face on the Column (*Facies Columnae*)

| Field | Value |
|---|---|
| Giver / trigger | `npc-antiochus` at `officina-columnae` (h1–v1), or his bark when the player first enters `forum-trajan`. |
| Window | **before 12 May** (GDD §11.1). In v0.1 the clamp holds 11 May, so the window never closes. In v0.2 the quest **expires** when `mq-04` starts: the face is recut by the dedication (default outcome) and Antiochus' bark changes; it is not re-offered (a carved face cannot recur), which is an exception to §11.1, flagged in §9. |
| Milestone | v0.1-Could / v0.2 |
| Kind | **persuasion** (Apollodorus), investigation, an optional night climb |

**Stages**

1. **`start`** — *Journal:* "A Greek carver called Antiochus swears that one of the soldiers on Trajan's Column wears his dead brother's face. He carved it from memory, against orders. The foreman wants it recut into a proper anonymous Roman before the dedication tomorrow."
   - `see` — Look at the face on the frieze → `loc:column-trajan` (the soldier on the third turn of the spiral building a camp wall; visible from the Basilica Ulpia gallery or the scaffold).
   - `proof` (optional) — Find someone who knew the brother → any one of: the **veteranus** player character (automatic: "I served with men like him"), a veteran beggar by the `equus-traiani` (**L. Mamilius Cotta**, extra), or Antiochus' wax sketch in `officina-columnae` (`[Fabrica 25]` to see it is from life).
2. **`ask`** — *Journal:* "Only one man could let the face stand: Apollodorus of Damascus, who built the Column and hates being told how."
   - `persuade` — Persuade Apollodorus to let the face stand → `npc:npc-apollodorus` (`dlg-facies`).
   - **Alternatives:** `[Bribe 13 den.]` the foreman Moschus to lose his chalk marks (works, but if Apollodorus later notices, Antiochus is dismissed: 50% at `mq-04`); or a **night climb** on the remaining scaffold (mantle × 5, athletics) to rub out Moschus' chalk marks (stealth; Moschus sleeps at the hut).
3. **`done`** (end: complete) — *Journal (face stays):* "Apollodorus looked at the face for a long time. 'He has a better nose than the emperor,' he said. 'Leave it.'" *(recut):* "By dawn the soldier on the third turn had a new face, as calm and as nobody's as all the others."

**Dialogue**

```
DLG dlg-facies · npcs: npc-apollodorus · priority 80
start: q(misc-facies-columnae).stage=ask → n0
n0  "Is this about a face? It's always about a face. Four hundred soldiers, and every carver in the workshop has an uncle."
  ▸ [Persuade 40] "It's his brother. He died at Sarmizegetusa. The Column is for them, isn't it?"  → pass n2 · fail n1
  ▸ (if obj(proof)) [Persuade 25] "A man who served with him recognised him. The face is from life." → pass n2 · fail n1
  ▸ [Fabrica 30] "Look at the work. It's the best face on the third turn. Recutting it ruins the line." → pass n3 · fail n1
  ▸ "Then let it be recut."  ⇥ end {stage(…, done-recut)}
n1  "The Column is for Caesar. Faces are Caesar's. Next." ⇥ end
n2  "...Sarmizegetusa. I built the bridge they crossed to get there." [N] He climbs two rungs of the scaffold and looks. → n4
n3  "You noticed the line? Nobody notices the line." [N] He climbs two rungs of the scaffold and looks. → n4
n4  "He has a better nose than the emperor. Leave it. And tell your Greek friend that if he does it again I'll carve him into the plinth." ⇥ end {stage(…, done-stays); disp(+10)}
```

**Rewards:** face stays: Antiochus gives `gemma` (a carnelian he cut, 30 den. value), `fama.dist-fora-imperialia +5`, Apollodorus disposition +10 (he remembers in `mq-11`), `skillXp: rhetoric`; recut: nothing; bribe path: 0 den. net and the 50% risk.

**Failure states:** none (recut is the default ending).

**World changes:** the face (a unique carved soldier) is a Lexicon "thing" at the Column (labelled [G]); Antiochus' barks change.

**Flags set:** `facies` (`stays|recut|bribed`).

---

#### 3.3.6 `misc-genitura-caesaris` — The Emperor's Horoscope (*Genitura Caesaris*)

| Field | Value |
|---|---|
| Giver / trigger | `npc-zenon` at `astrologi-circi` offers paid errands to anyone who buys a horoscope or asks "Any work?" |
| Prerequisites | `mq-02` complete |
| Milestone | v0.2 |
| Kind | **delivery with a twist** (the parcel is treason: casting the emperor's horoscope is *maiestas*, GDD §14.1, society §2.10) |

**Stages**

1. **`start`** — *Journal:* "Zenon the Chaldaean paid me eight denarii in advance to carry a sealed nativity to a client's house on the Rise of Victory. 'Do not open it,' he said, three times."
   - `deliver` — Deliver the sealed horoscope → `npc:npc-antigonus` at `loc:domus-clivi-victoriae` (item `quest-genitura`).
   - Hidden objective `learn` — Find out whose stars these are → any of: open and reseal it (v0.2 Locks & Seals; `perk-locks-reseal` avoids a trace); Arruns' warning ("Ask the Chaldaean whose stars he sells"); or Antigonus' reaction at the door.
2. **`door`** — *Journal:* "Antigonus, a freedman in a toga far too good for him, read the first line, went grey, and shut the door in my face. Then he opened it again, very quietly."
   - `choose` — Decide what to do with the horoscope → (`dlg-genitura`).
3. **Endings** (end: complete for all):
   - **`delivered`**: you leave it with Antigonus. +8 den. (Zenon's fee) + 20 den. "for your silence"; `flag(genitura-delivered)` (the Toga cell later has a horoscope to "prove" a death in the East was foretold: an Act II clue for `mq-09`).
   - **`informed`**: you take it to the Urban Cohorts post (`npc:npc-verecundus`). Zenon is arrested and relegated (he disappears); +50 den. (an informer's reward); `fama.cohortes-urbanae +5`; `fama.plebs −5` (informers are hated, society §2.9).
   - **`burned`**: burn it at a shrine lamp (`compitum-circi`); Zenon, furious, then frightened, pays 10 den. to keep you quiet.
   - **`traced`**: `[Intimidate 40]` Zenon: he admits he only copies; the computation is by "a Chaldaean from Seleucia who reads for great houses and pays in Syrian silver" → `flag(clue-asclepiodotus)` (The Eastern Gold, GDD §10.2). Combine with any of the above.
   - **`sold`** (v0.3, with a fence): `npc-mustela` pays 250 den. (the fence rate of the 500 den. black-market price, GDD §7.2); carrying it risks a random urban stop (10% a day) and `maiestas` (5,000, the Praetorian ledger).

**Dialogue (core)**

```
DLG dlg-genitura · npcs: npc-antigonus · priority 85
start: q(misc-genitura-caesaris).stage=door → n0
n0  "Who sent you? No. Don't say his name. Do you know what this is? Nerva's son, born at Italica on the fourteenth before the Kalends of October... Are you trying to get us all strangled?"
  ▸ "I'm only the carrier. Keep it or don't."                   → n1
  ▸ "Who ordered it?"                                            → n2
  ▸ "I'll take it to the Urban Cohorts."                         → n3
  ▸ "I'll burn it, and we never met."                            → n4
n1  [N] He takes it with two fingers, like something dead. "My patron will pay for your silence. Twenty. Go." ⇥ end {take(quest-genitura); receive(20); flag(genitura-delivered); stage(delivered)}
n2  "My patron receives no one, and does not exist, today." ⇥ → n0
n3  [Intimidate 25] "Do that, and you'll have to explain why you carried it." → pass: "...Take it. Take it and go." (he lets you leave with it) · fail: he shouts for his slaves (two civilians; leave or fight). ⇥ end
n4  "Then burn it somewhere I can't smell it." ⇥ end {stage(burned)}
```

The birth date: Trajan was born on **18 September 53** [A], which is *a.d. XIV Kal. Oct.*, the line Antigonus reads.

**Rewards:** as per ending above; `skills: locks-seals +15` if the seal was opened and resealed cleanly.

**Failure states:** none; but carrying the horoscope when stopped by any patrol (a 10% chance per elapsed day, plus guaranteed if the player is arrested for anything else) → `maiestas` 5,000 (Praetorian ledger, GDD §14.1). The journal warns once: "I should not be walking about Rome with Caesar's stars in my belt."

**World changes:** `informed`: the astrologers' arcade is raided; Arruns gloats (barks). `delivered`: Antigonus' door is closed to the player.

**Flags set:** `genitura-ending`, `genitura-delivered`, `clue-asclepiodotus`.

---

#### 3.3.7 `misc-sublicius-clavi` — No Iron on the Bridge (*Clavi Sublicii*)

| Field | Value |
|---|---|
| Giver / trigger | `npc-hermeros` on `pons-sublicius` (h3–v1). |
| Prerequisites | none |
| Milestone | v0.2 |
| Kind | stakeout, **chase**, moral choice; ambiguous curse |

**Stages**

1. **`start`** — *Journal:* "The Bridge of Piles is the oldest bridge in Rome, and by sacred law not one piece of iron may be in it (Pliny says so, and Hermeros, the pontiffs' man, says it louder). Someone has been driving iron nails into its timbers."
   - `nails` — Pull the nails from the bridge → count **3** (interact under the deck rail: each nail pins a tiny rolled lead sheet, `defixio-tiberina`, NEW).
   - `read` (optional) — Read one of the lead sheets → "Father Tiber, take the barge of Sosibius, who sent my father out in a rotten hull. Take it as you took him."
2. **`stakeout`** — *Journal:* "Whoever drives the nails comes back. I waited on the bank where the cattle drink."
   - `wait` — Watch the bridge in the second watch → `loc:pons-sublicius`, `time:v2` (hide: sneaking near the pilings gives darkness 0.2 and cover).
   - A figure arrives with a hammer: **Anthus**. If he spots the player first (S ≥ 35 before the player is within 6 m), he runs.
3. **`chase`** — *Journal:* "He ran like the river was behind him."
   - `catch` — Catch the nail-driver → `npc:npc-anthus`. **Route:** off the bridge, through the cattle pens of the `forum-boarium` (vault two rails, mantle 1.2 m), round the round `temple-hercules-victor`, between the dye vats of the `fullonica-velabri`, up the `vicus-tuscus`, and toward the `compitum-velabri`, where he tries a 1.5 m gap between two taberna awnings. **Rules:** keep within 30 m; if he gets 40 m ahead for 5 s he hides (search 20 s: he is behind the third amphora stack). Catch by touching him while sprinting (E prompt "Grab") or a sprint attack with fists (KO). He has run speed 1.05 × player run and sprint for 12 s, then 6 s of rest (stamina).
4. **`why`** — *Journal:* "Anthus, a carpenter's apprentice, whose father the river took."
   - `decide` — Decide Anthus' fate → (`dlg-sublicius`).
5. **`done`** (end: complete) — *Journal:* "That night Sosibius' worst barge sank at its moorings with nobody aboard. Rot, the dockers said. Hermeros said nothing at all."

**Dialogue (core)**

```
DLG dlg-sublicius · npcs: npc-anthus · priority 85
start: q(misc-sublicius-clavi).stage=why → n0
n0  "Hand me to the pontiffs, then. They'll beat me, and the guild will fine my mother. Sosibius will still be rich."
  ▸ "Why the bridge?"                                       → n1
  ▸ "You've polluted a sacred bridge. Hermeros decides."      → n2
  ▸ "Go home. I'll tell Hermeros the nails were old."         → n3
  ▸ "Bring a lawful complaint against Sosibius instead."      → n4
n1  "Father Tiber hears best from his own bridge. Everyone knows that. I didn't think about the iron. I didn't think about anything." → n0
n2  ⇥ end {stage(…, done); flag(anthus=turned-in)}  (Hermeros: "Expiation! Expiation for everything!" The guild pays; Anthus is fined and beaten off-screen.)
n3  [Persuade 25] with Hermeros later → pass: Hermeros believes it (Pietas +0) · fail: Hermeros finds a fourth nail and Anthus' hammer mark; disp −10 ⇥ end {flag(anthus=freed)}
n4  "A complaint? To whom? A lighterman's son against a man with three barges?" [P] "To the aediles. I know a man called Dento." → ⇥ end {flag(anthus=lawful); seeds a later misc quest}
```

**Rewards:** Hermeros: 20 den. from the pontifical chest and `pietas +10` (the bridge purified) on any ending where the nails are removed; `skillXp: athletics` (the chase); `fama.dist-velabrum-boarium +5` (freed or lawful).

**Failure states:** **fail** if Anthus drowns: if the chase reaches the riverbank (an alternative route he takes when cornered at the bridge end) and the player lets him swim (he is swept away after 15 s unless pulled out; Athletics swim, GDD §6.6). Journal: "The river took him too."

**World changes:** Sosibius' barge sinks (prop change at `portus-tiberinus`) whatever the player does; ambiguous (rot or curse).

**Flags set:** `anthus`, `sosibius-barge-sunk`.

---

#### 3.3.8 `misc-scalae-gemoniae` — The Gemonian Stairs (*Scalae Gemoniae*)

| Field | Value |
|---|---|
| Giver / trigger | `npc-zura`, standing at the foot of `scalae-gemoniae` (h8–v1) on the three display days. |
| Prerequisites | `mq-02` complete; stealth system (v0.2) |
| Milestone | v0.2 |
| Kind | **stealth** (a night body-recovery), legal alternative, burial (Pietas) |
| Background [G, flagged] | Tarsas, son of Bitus, a Dacian captive of 106 held in the Carcer since a failed escape plot, was strangled in the Tullianum as an enemy of the state; his body lies on the Gemonian Stairs for three days before the hook drags it to the Tiber [A for the practice, society §8.3]. |

**Stages**

1. **`start`** — *Journal:* "Zura, a Dacian laundress, has stood at the foot of the Gemonian Stairs since dawn. Her son's body lies on them, for the city to see, until the third day, when the hook will drag it to the river. She wants to bury him."
   - `how` — Find a way to give Tarsas a burial → choose one path (`dlg-gemoniae`).
2. **Path A, stealth — `night`** — *Journal:* "The stairs are watched by night by two soldiers from the post beside the Carcer. One of them sleeps."
   - `reach` — Reach the body unseen → `loc:scalae-gemoniae`, v2–v4 (darkness, no torch; S < 100 from both guards).
   - `carry` — Carry Tarsas down to Zura's handcart → drag the body (Hold E: walk 1.2 m/s, noise 0.6 per step, GDD §14.2) 40 m to the cart on the `clivus-argentarius`.
   - Detected: the guard shouts; flee (bounty `trespass` 5 + `vis` 40 only if the player strikes), or `[Bribe 25 den.]` (soldiers: DC 25 × 0.5 × 2, GDD §14.5).
3. **Path B, bribery — `bribe`** — `pay` — Bribe the night guard → `[Bribe 25 den.]`; he "looks at the stars".
4. **Path C, law — `petition`** — *Journal:* "Even the bodies of the condemned may be given to their kin, if someone asks properly." [A in principle: Dig. 48.24.1, later Severan]
   - `scribe` — Have a petition written → `npc:npc-theodote` or any scribe (4 as.).
   - `optio` — Present it to the optio of the Urban Cohorts → `npc:npc-verecundus` `[Persuade 40]` (+15 with `quest-tessera-peregrina`; +10 with `patron-leaning` set) → the body is released at dawn (no stealth).
5. **`burial`** — *Journal:* "Outside the city, in a field by the road, Zura threw three handfuls of earth over her son and sang something in her own language. An owl called from the tombs. She said it was a good sign; I did not ask in which religion."
   - `attend` — Attend the burial → `loc:capena-extra` area, at the next dawn (the cart leaves by the Porta Capena; burial outside the pomerium [A]).
6. **`done`** (end: complete).

**Dialogue (core)**

```
DLG dlg-gemoniae · npcs: npc-zura · priority 85
start: stage=start → n0
n0  "My son. On the stairs. Three days, they say, and then the hook. In my country we bury our dead facing the sun."
  ▸ (if origin=dacus) "I'm Dacian too. I'll bring him to you."   → n1 {disp(+20)}
  ▸ "I'll get him down tonight."                                → n1
  ▸ "There may be a lawful way. Let me ask."                    → n2
  ▸ "I can't help you."  ⇥ end
n1  "Bring him to the bottom of the bankers' rise. I'll have a cart. Go with the moon behind you." ⇥ end {stage(…, night)}
n2  "Lawful? They killed him lawfully." [N] A long pause. "Try. I'll wait. I've nothing else to do." ⇥ end {stage(…, petition)}
```

**Rewards:** `pietas +10` (burying the dead properly, GDD §14.6); Zura gives her son's `armilla-dacica` (NEW, a silver spiral bracelet, 20 den.); `flag(dacians-grateful)` (+10 disposition with Dacian NPCs; opens a route in `mq-08`); `skillXp: stealth` (path A) or `rhetoric` (path C).

**Failure states:** **fail** if the third day passes (the hook drags the body away at h1 on the third elapsed day; Zura leaves Rome; `pietas −5` if the player had promised). Killing a guard: fail, `homicidium`.

**World changes:** the empty stairs; in v0.6 the Dacian cell knows the player's name.

**Flags set:** `dacians-grateful`, `gemoniae-path`.

---

#### 3.3.9 `misc-argei` — The Heavy Splash (*Argei*)

| Field | Value |
|---|---|
| Giver / trigger | `npc-mergus` at `pons-sublicius` on **14 May** after the rite; the quest is offered from 9 May (5 days before) by Cerdo's announcement and Mergus' barks at the `portus-tiberinus`. |
| Window | 14 May (`fest-argei`, GDD §14.10: Ovid places the rite on the day before the Ides [A, Fasti 5.621ff]; Dionysius says the Ides [U]). Re-offered at the next Argei (March 16–17 procession or next May) if missed. |
| Milestone | v0.2 |
| Kind | **festival event**, dive, investigation |

**Stages**

1. **`start`** — *Journal:* "At the Argei the Vestals and the pontiffs throw twenty-seven men of rushes from the Bridge of Piles into the Tiber, as their fathers did. This year, Mergus the diver swears, one of them went down like a stone."
   - `rite` (optional) — Attend the rite on the bridge → `loc:pons-sublicius`, h3–h5 on 14 May (stand quietly: `pietas +25`, festival rite, GDD §14.6; the Vestalis Maxima Cassia Lucilla throws the first figure).
   - `talk` — Talk to Mergus → `npc:npc-mergus`.
2. **`dive`** — *Journal:* "Straw men float. This one didn't. Mergus wanted a second pair of hands on the rope."
   - `rope` — Hold the rope while Mergus dives → stamina hold (hold E; 4 stamina/s for 20 s) — **or** — dive yourself (swim 1.4 m/s; 30 s of breath; the current pushes 0.6 m/s downstream; `perk-athletics-swimmer` resists it).
   - `sack` — Recover what sank → `item:quest-formae-nummariae` (a waxed sack of clay **coin moulds** and a lead blank, bound inside the puppet's rushes).
3. **`who`** — *Journal:* "Moulds for plated denarii, wrapped in a sacred puppet and thrown into the river by a Vestal's own hand. Someone wanted their evidence carried away by the gods."
   - `chapel` — Ask at the Argei chapel of the Velabrum → `loc:arca-argei` (the pontiffs' slave who keeps the figures: `[Persuade 25]` or `[Bribe 6 den.]` → "a clerk paid me two denarii to tie in a stone, for luck, so it would fly straighter").
   - `clerk` — Identify the clerk → `npc:npc-lycus` (Hermogenes' clerk; recognised by his stylus behind the ear, or by name if `urb-01` was played).
4. **`choose`** — *Journal:* "The moulds pointed at a bank table in the Basilica Paulli."
   - Endings: **Cohorts** (give the moulds to Verecundus: 40 den., `fama.cohortes-urbanae +10`; Lycus is arrested and released the next day "for lack of a witness": `flag(lycus-protected)`, a Purse-cell clue); **blackmail** Hermogenes (60 den. silence money; `flag(hermogenes-blackmailed)`; Infamia +5); **pontiffs** (give them to Hermeros: the rite was polluted; `pietas +10`, 15 den.); **fence** (v0.3: 30 den.).
5. **`done`** (end: complete).

**Rewards:** as per ending; `skillXp: athletics` if the player dived.

**Failure states:** none; if the player never dives, Mergus recovers the sack alone and sells it to the fence (the quest closes with "Mergus kept his own counsel").

**World changes:** with the Cohorts ending, Hermogenes' table is "closed for accounts" for 3 days (the banker vendor is unavailable).

**Flags set:** `argei-ending`, `lycus-protected`, `hermogenes-blackmailed`.

---

#### 3.3.10 `misc-mercuralia` — Mercury's Water (*Aqua Mercurii*)

| Field | Value |
|---|---|
| Giver / trigger | `npc-fadia` at `seplasia-vici-tusci`, from 10 May (5 days before the festival) to 15 May. |
| Window | 15 May (`fest-mercuralia`): merchants sprinkle themselves and their goods with water from Mercury's spring by the Porta Capena with a laurel branch, praying to be forgiven their lies [A: Ovid *Fasti* 5.663–92]. Prices −10% (GDD §14.10). |
| Milestone | v0.2 (offered in v0.1 under the clamp; its climax waits for 15 May) |
| Kind | **festival**, persuasion, trade knowledge |

**Stages**

1. **`start`** — *Journal:* "Fadia the perfumer bought twenty flasks of Indian nard from Callias of Ephesus. Half of it is cut with something cheaper. On the Ides, she says, Callias will wash his lies off at Mercury's spring like every merchant in Rome, and swear blind he never sold her a drop."
   - `proof` — Get proof the nard is false → one of: `[Mercatura 25]` at Callias' stall in the `horrea-piperataria` (the price is too low for true nard), `[Medicina 20]` (smell and taste: "pseudo-nard", Pliny *NH* 12.43 [A]), or buy a flask (5 den.) and compare it with Fadia's true sample (`nardus`).
2. **`spring`** — *Journal:* "On the Ides of May the merchants queued at Mercury's spring by the Capena Gate, each with a laurel branch and a jar."
   - `confront` — Confront Callias at Mercury's spring → `npc:npc-callias` at `loc:fons-mercurii`, h1–h3 on 15 May, in front of the other merchants (`dlg-mercuralia`).
3. **`fadia`** — *Journal:* "Callias paid. Then Fadia told me why she had wanted it done so publicly."
   - `twist` — Hear Fadia out → she resold four of the false flasks to a senator's wife before she noticed, and wants the scandal to land on Callias alone. `[Persuade 25]` to make her confess and refund the lady (best), or keep quiet.
4. **`done`** (end: complete) — *Journal:* "Everybody at the spring was washing off a lie. Some of them were washing off mine."

**Dialogue (core)**

```
DLG dlg-mercuralia · npcs: npc-callias · priority 85
start: stage=spring → n0
n0  [N] Callias dips his laurel and shakes it over his jars. "Wash away the past, wash away the lies I've told..."
  ▸ [Persuade 40] (+10 with proof, +10 if lautus) "Wash this one too: Fadia's twenty flasks of watered nard."  → pass n1 · fail n2
  ▸ [Intimidate 40] "Repay her now, in front of Mercury and all these witnesses." → pass n1 · fail n2
  ▸ [P] Raise your voice to the queue: "Mercury hears! Ask him what's in his nard!"  → n3 (Rhetoric 25; pass: the crowd turns on him → n1)
n1  "...Fine. Fine! Twenty flasks, refunded. Mercury forgive me, and keep your mouth shut." ⇥ end {receive→fadia; stage(fadia)}
n2  "Prove it with your nose, then. Go on." ⇥ end {allow retry with proof once}
n3  [N] Forty merchants turn to look at Callias. Forty merchants who all water something.
```

**Rewards:** 25 den. (Fadia's share) and a flask of `nardus`; `fama.dist-circus-maximus +5`; `skillXp: mercatura` (proof by trade) or `rhetoric`; Fadia confessing: `pietas +5` and Fadia gives a 10% discount for good.

**Failure states:** missing 15 May → re-offered at the next Mercuralia (every year after the epilogue), GDD §11.1.

**World changes:** Callias' stall raises prices for the player (+10%) after a public shaming.

**Flags set:** `mercuralia-ending`, `fadia-confessed`.

---

#### 3.3.11 `misc-servus-aesculapii` — Free by the God's Hand (*Manu Dei Liber*)

| Field | Value |
|---|---|
| Giver / trigger | `npc-onesimus` in the precinct of `temple-aesculapius` on the Tiber Island. |
| Prerequisites | Tiber Island shipped (v0.2) |
| Milestone | v0.2 |
| Kind | **persuasion**, legal case, evidence gathering; a possible fight |
| Background | Claudius ruled that sick slaves abandoned on the Tiber Island by their masters, if they recovered, were free and did not return to their master's power [A: Suet. *Claud.* 25]. |

**Stages**

1. **`start`** — *Journal:* "Onesimus was left on the Tiber Island to die by his master, Lurco the cattle dealer, who didn't want to pay for a doctor. The god kept him alive. By the edict of the deified Claudius that makes him free. Now that he's well, Lurco wants his drover back."
   - `evidence` — Gather proof → count **2** of 3:
     - `witness-temple` — The temple attendants' word that he was left there → the aedituus of the Aesculapian temple (unnamed extra) `[Persuade 10]`.
     - `witness-doctor` — A physician's word that he truly was sick and recovered → `npc:npc-soranus` (`dlg-servus-soranus`; automatic if the player has `medicina ≥ 20` or asks politely; Soranus writes `quest-testimonium-sorani`).
     - `abandonment` — Proof that Lurco left him → `quest-titulus-onesimi` (from `lav-01`, if kept) **or** make Lurco say it before witnesses at the Forum Boarium (`[Persuade 40]`, +15 if he is `ebrius`: buy him two cups of wine at the caupona first).
2. **`hearing`** — *Journal:* "Lurco came to the island with two of his men and a bill of sale."
   - `face` — Face Lurco at the bridgehead of the island → `npc:npc-lurco` (`dlg-servus-lurco`): with 2 pieces of evidence, `[Persuade 25]`; with 3, automatic; with fewer, `[Persuade 55]`.
   - If persuasion fails, Lurco's two bruisers try to drag Onesimus off: a non-lethal brawl (`collegium-bruiser` × 2) on the Pons Fabricius. Winning it, Lurco retreats ("This isn't over"); the urban patrol arrives and Soranus' testimony settles it.
3. **`done`** (end: complete) — *Journal:* "Lurco went home without his drover. Onesimus went to the temple and promised the god a cockerel, then two, then, when he had work, a whole pig."

**Dialogue (core)**

```
DLG dlg-servus-soranus · npcs: npc-soranus · priority 85
start: q(misc-servus-aesculapii).stage=start and not obj(witness-doctor) → n0
n0  "You want me to say he was ill? He was dying. Tertian fever, then the lungs. I sat with him three nights."
  ▸ "Will you write that down, for a court?"                    → n1
  ▸ (if skill(medicina)≥20) "The fever broke on the ninth day?"   → n2
  ▸ "Was it the god who saved him, or you?"                     → n3
n1  "For a court, for a praetor, for Caesar himself. The truth is cheap to write." {give(quest-testimonium-sorani); obj(witness-doctor)} ⇥ end
n2  "The seventh. You've read Celsus. Good. Here." {give(quest-testimonium-sorani); obj(witness-doctor); skills(medicina,+10)} ⇥ end
n3  "The god provided the bed, the quiet and the hope. I provided the barley water. Ask the god for his statement; mine is quicker." → n1

DLG dlg-servus-lurco · npcs: npc-lurco · priority 85
start: stage=hearing → n0
n0  "That's my slave. I paid sixteen hundred sesterces for him in the year Trajan came home from Dacia. Step aside."
  ▸ [Persuade 25/55] "You left him on the island to die. Under the edict of the deified Claudius, the god freed him. Here is the proof." → pass n1 · fail n2
  ▸ (if has(quest-titulus-onesimi)) [P] Show him his own bill, with 'left on the island' in his hand.  → n1
  ▸ [Bribe 40 den.] "I'll pay you for a man who's already free."   → n3
  ▸ "Take him, then."                                              → n4
n1  [N] Lurco reads it. His men look at each other. "...The deified Claudius was a fool. Keep him. Keep the god, too." ⇥ end {stage(done); flag(onesimus=free)}
n2  "Proof? I'll show you proof." [N] He nods to his men. ⇥ end {brawl}
n3  "Forty? For a drover? ...Done. He was going to die anyway." ⇥ end {pay(40); flag(onesimus=bought-free); pietas(+5)}
n4  ⇥ end {fail}
```

**Rewards:** `pietas +10` (Aesculapius); `fama.dist-forum-holitorium +10`; Soranus pays 15 den. "for an honest case I can cite in my book"; `skillXp: rhetoric`; Onesimus becomes a drover at the Forum Boarium who gives a −5% price on livestock later and greets the player.

**Failure states:** **fail** if the player gives Onesimus back ("Take him, then") or Onesimus is dragged off (lost brawl with no patrol nearby). `pietas −10`.

**World changes:** Onesimus moves to `forum-boarium`; Lurco hates the player (disposition −20, bark).

**Flags set:** `onesimus`.

---

#### 3.3.12 `misc-colossus` — The Colossus Dare (*Sponsio Colossi*)

| Field | Value |
|---|---|
| Giver / trigger | A gang of youths at `colossus-sol` (h2–h8): Pusio has bet he can touch the bronze god's crown from the regilding scaffold, and is now stuck halfway up. His friends bet the player 2 den. that they can't bring him down. |
| Prerequisites | none |
| Milestone | v0.2 |
| Kind | climbing (mantle traversal), rescue, persuasion |

**Stages**

1. **`start`** — *Journal:* "The Colossus on the Velia, once Nero and now the Sun, wears a scaffold this month for the gilders. Pusio, a pearl-seller's boy, climbed it on a bet and froze on the sixth level. His friends bet me he'd still be there at sunset."
   - `bet` (optional) — Take the bet → pay 2 den. (wins 4 if the player rescues him).
   - `climb` — Climb the scaffold → `loc:colossus-machina`: 6 levels of 2 m (mantle each, 10 stamina), a loose plank on level 4 (it tilts after 1.5 s: keep moving), a gap on level 5 (jump). Athletics XP per mantle (GDD §5.4).
2. **`talk`** — *Journal:* "Pusio was clinging to a pole beside the god's bronze knee, white as marble."
   - `calm` — Talk Pusio down → `[Persuade 25]` ("Look at my hands, not at the ground"), or `[Intimidate 25]` ("Your mother is on her way"), or carry him (he rides on the player's back: climb down at walk speed, mantle cost doubled).
3. **`down`** — *Journal:* "At the bottom the curator of the statue's gilding was waiting with a face like the god's."
   - `curator` — Deal with the curator → pay a 5 den. fine, or `[Persuade 25]` ("He'd have fallen on your gold leaf").
4. **`done`** (end: complete) — *Journal:* "Pusio's father, a pearl-seller in the arcade on the Sacred Way, gave me a small pearl 'for my son's neck, which you saved, and which I shall now wring'."

**Rewards:** `margarita` (NEW, a small pearl, 15 den.); bet winnings (4 den.); `fama.dist-velia +5`; `skillXp: athletics`.

**Failure states:** **fail** if Pusio falls: if the player shakes the scaffold (attack on a pole) or takes more than 4 game hours (he slips at h11): `injured` boy, `fama.dist-velia −5`, the father curses the player (no death: a fall onto the gilders' sand pile [design], keeping the quest PG).

**World changes:** the youths greet the player; Hilario sells to the player at −10% (v0.3).

**Flags set:** `pusio-saved`.

---

## 4. ITEMS CATALOGUE

**Scope.** Every item the v0.1 and v0.2 content above uses, plus the rest of the GDD §8 catalogue so that loot, vendors and kits resolve: **228 entries**: the **191** base items and generated variants already in `src/rpg/data/items/*.ts` (this table mirrors all of them), plus **37 NEW** ones (18 items and 19 quest items). Stats follow GDD §6.2 and §8: weapon damage is the base value before `(1 + skill/200)`, attack multipliers, armour and difficulty; armour gives AR, class and family (`TYPE_VS_FAMILY`); shields give bash stagger, block mitigation and missile fraction (§6.4).

**Columns.** **v0.1:** `M` = a v0.1 build needs it (kits, the three v0.1 vendors, v0.1 loot, v0.1 quests); `S` = needed by a v0.1 Should; `2` = v0.2; `—` = later (exists so data resolves). **NEW** = not yet in the code; add it. Values in den. (1 as. = 0.0625). "@25" = the light-hit damage at skill 25 (`× 1.125`) for orientation: an iron gladius at Blades 25 does 14.6, so a 45-HP thug in a tunic falls in 4 thrusts (GDD §6.2 lethality check).

### 4.1 Weapons (`mainHand`; GDD §8.1)

| ID | Name | Latin | Class / skill | Damage (type) | @25 | Speed / reach / stagger | kg | Value | v0.1 | Description |
|---|---|---|---|---|---|---|---|---|---|---|
| `caestus` | Caestus | caestus | unarmed / brawling | 7 blunt | 7.9 | 1.40 / 0.50 / 12 | 0.6 | 8 | M | Oxhide boxing thongs studded with metal. Always knocks out. |
| `pugio` | Pugio | pugio | blade / blades | 8 thrust | 9.0 | 1.30 / 0.55 / 6 | 0.4 | 6 | M | The broad legionary dagger. Sneak attacks ×4; the off-hand finisher. |
| `sica` | Sica | sica | blade / blades | 11 cut | 12.4 | 1.15 / 0.70 / 10 | 0.6 | 18 | M | Curved Thracian short sword; hooks round shields (ignores 25% of block mitigation). |
| `gladius` | Gladius | gladius | blade / blades | 13 thrust (cut 11) | 14.6 | 1.00 / 0.75 / 12 | 1.2 | 22 | M | The Pompeii-pattern short sword. Light chain thrust / cut / thrust. |
| `spatha` | Spatha | spatha | blade / blades | 14 cut (thrust 12) | 15.8 | 0.90 / 0.95 / 14 | 1.4 | 35 | M | The long cavalry sword. Light chain cut / cut / thrust. |
| `dolabra` | Dolabra | dolabra | blade / blades | 15 cut | 16.9 | 0.85 / 0.80 / 22 | 2.0 | 10 | S | Pick-axe of soldiers and vigiles; breaks doors. |
| `falx` | Falx | falx Dacica | blade / blades (2H) | 24 cut | 27.0 | 0.70 / 1.20 / 30 | 2.8 | 60 | — | Two-handed Dacian blade; ignores 50% of block; power sweep unblockable. |
| `rudis` | Rudis | rudis | blade / blades | 11 blunt, *practice* | 12.4 | 1.00 / 0.75 / 14 | 1.0 | 1 | M | Wooden practice sword (*arma lusoria*): never kills; a fighter at 0 HP is knocked out. Issued by the Ludus armory. |
| `sica-lusoria` **NEW** | Practice Sica | sica lusoria | blade / blades | 9 blunt, *practice* | 10.1 | 1.15 / 0.70 / 10 | 0.5 | 1 | M | Curved wooden sica for thraeces in practice bouts (Auctus). Never kills; hooks round shields (ignores 25% of block mitigation). Not sold. |
| `hasta` | Hasta | hasta | spear / spear | 14 thrust | 15.8 | 0.90 / 1.80 / 14 | 2.0 | 12 | M | Thrusting spear, one-handed behind a shield. |
| `lancea` | Lancea | lancea | spear / spear | 11 thrust (thrown 18) | 12.4 | 1.00 / 1.50 / 10 | 1.2 | 8 | M | Light spear for thrusting or throwing (v0.2 throw). |
| `venabulum` | Venabulum | venabulum | spear / spear | 16 thrust | 18.0 | 0.85 / 1.90 / 18 | 2.4 | 20 | — | Boar spear with a crossbar: +25% vs beasts; brace. |
| `tridens` | Tridens | tridens | spear / spear | 13 thrust | 14.6 | 0.90 / 1.80 / 12 | 2.2 | 25 | — | The retiarius' trident. |
| `tridens-lusorius` | Practice Trident | tridens lusorius | spear / spear | 8 blunt, *practice* | 9.0 | 0.90 / 1.80 / 12 | 2.0 | 0 | M | Blunted trident (Nereus). Never kills. Not sold. |
| `pilum` | Pilum | pilum | thrown / spear | 30 thrown (melee 10) thrust | 33.8 | 0.80 / 1.60 / 20 | 2.0 | 10 | 2 | Heavy javelin; sticks in shields (block mitigation −50%). |
| `iaculum` | Iaculum | iaculum | thrown / spear | 18 thrown thrust | 20.3 | — / — / 12 | 0.8 | 4 | 2 | Light javelin; carry 5. |
| `rete` | Rete | rete | thrown / spear | 0 (entangle 3 s) | — | — / 6 m range / — | 2.0 | 15 | — | Weighted net; entangles 3 s (bosses 1.5 s). |
| `fustis` | Fustis | fustis | blunt / brawling | 10 blunt | 11.3 | 1.05 / 0.80 / 20 | 1.0 | 1 | M | Hardwood cudgel; knocks out up to `miles`. `civis-suburanus` signature weapon. |
| `clava` | Clava | clava | blunt / brawling | 13 blunt | 14.6 | 0.90 / 0.80 / 26 | 1.8 | 3 | M | Knotted club; knocks out up to `miles`. |
| `vitis` | Vitis | vitis | blunt / brawling | 9 blunt | 10.1 | 1.10 / 0.85 / 18 | 0.6 | 0 | — | Centurion's vine staff; +50% stagger vs soldiers. Not sold. |
| `arcus` | Arcus | arcus | bow / archery (2H) | 16 / arrow thrust | 18.0 | full draw 0.9 s / 60 m / 10 | 1.0 | 45 | — | Composite bow (v0.3+). |
| `funda` | Funda | funda | sling / archery | 12 lead · 8 stone blunt | 13.5 | whirl 0.7 s / 50 m / 25 | 0.1 | 1 | 2 | Braided wool sling; loud (alerts within 15 m). |
| `malleus` | Malleus | malleus | blunt / brawling (2H) | 16 blunt | 18.0 | 0.65 / 0.90 / 32 | 5.0 | 6 | — | Stonemason's sledgehammer from the building sites. |
| `fax` | Torch | fax | off-hand tool | 3 blunt | 3.4 | 1.00 / 0.60 / 4 | 0.8 | 0.125 | S | Light radius 8 m for 2 game hours; disperses rats; +50% visibility. |

### 4.2 Quality variants (generated by `weapons.ts`: Noric ×1.15 dmg, ×2.5 value; Bilbilis ×1.3, ×6; officer's silvered ×1.0, ×4 and +5 persuasion with soldiers)

| ID | Name | Damage (type) | Speed / reach / stagger | kg | Value | v0.1 |
|---|---|---|---|---|---|---|
| `pugio-noric` | Noric-steel Pugio | 9.2 thrust | 1.3 / 0.55 / 6 | 0.4 | 15 | S (Cloaca cache) |
| `sica-noric` | Noric-steel Sica | 12.65 cut | 1.15 / 0.70 / 10 | 0.6 | 45 | — |
| `gladius-noric` | Noric-steel Gladius | 14.95 thrust (cut 12.65) | 1.0 / 0.75 / 12 | 1.2 | 55 | M (Euhodus) |
| `spatha-noric` | Noric-steel Spatha | 16.1 cut (thrust 13.8) | 0.9 / 0.95 / 14 | 1.4 | 88 | — |
| `falx-noric` | Noric-steel Falx | 27.6 cut | 0.7 / 1.2 / 30 | 2.8 | 150 | — |
| `hasta-noric` | Noric-steel Hasta | 16.1 thrust | 0.9 / 1.8 / 14 | 2.0 | 30 | — |
| `lancea-noric` | Noric-steel Lancea | 12.65 thrust (thrown 20.7) | 1.0 / 1.5 / 10 | 1.2 | 20 | — |
| `venabulum-noric` | Noric-steel Venabulum | 18.4 thrust | 0.85 / 1.9 / 18 | 2.4 | 50 | — |
| `pugio-bilbilis` | Bilbilis-steel Pugio | 10.4 thrust | 1.3 / 0.55 / 6 | 0.4 | 36 | — |
| `sica-bilbilis` | Bilbilis-steel Sica | 14.3 cut | 1.15 / 0.70 / 10 | 0.6 | 108 | — |
| `gladius-bilbilis` | Bilbilis-steel Gladius | 16.9 thrust (cut 14.3) | 1.0 / 0.75 / 12 | 1.2 | 132 | — (the `hispanus` pays −20%) |
| `spatha-bilbilis` | Bilbilis-steel Spatha | 18.2 cut (thrust 15.6) | 0.9 / 0.95 / 14 | 1.4 | 210 | — |
| `pugio-silvered` | Officer's Silvered Pugio | 8 thrust | 1.3 / 0.55 / 6 | 0.4 | 24 | — |
| `gladius-silvered` | Officer's Silvered Gladius | 13 thrust (cut 11) | 1.0 / 0.75 / 12 | 1.2 | 88 | — |
| `spatha-silvered` | Officer's Silvered Spatha | 14 cut (thrust 12) | 0.9 / 0.95 / 14 | 1.4 | 140 | — |

### 4.3 Uniques

| ID | Name | Base | Stats | Value | v0.1 | Source and description |
|---|---|---|---|---|---|---|
| `sica-muris` **NEW** | The Mouse's Sica | `sica` | 11 cut ×1.0; condition 0.7; +5% bleed chance (a notched edge) [design] | 25 | M | Mus' blade from `dun-taberna-collapsa`. "Notched, oiled and too often used. Thirty-one bouts, its owner liked to say, and one cloak." |
| `gladius-primi-pali` | Gladius of the Primus Palus | `gladius-bilbilis` | 18.2 thrust (cut 15.4) | 600 | — | `boss-primus-palus` (v0.4+). |
| `falx-mucaporis` | Falx of Mucapor | `falx` | 27.6 cut | 400 | — | `boss-mucapor`. |
| `vitis-vituli` | Vitis of "Vitulus" | `vitis` | 11 blunt, stagger 24 | 0 | — | `boss-vitis`. |
| `rete-nerei` | Net of Nereus | `rete` | entangle +1 s | 120 | — | Not dropped in a lusio; offered by Nereus at `lud-08` (v0.6+). |
| `pugio-bruti` | The "Dagger of Brutus" | `pugio` | 8 thrust | 3 | — | `lav-07`; a fake (Fabrica 40 reveals it). |
| `manica-thraecis-aurata` | Gilded Thraex Manica | arm guard | AR 9 (light) | 160 | — | v1.0 unique. |
| `anulus-festi` **NEW** | Festus' Signet | `anulus-signatorius` (`finger`) | seals letters with a horseman intaglio | 5 | 2 | From Helpis in `mq-03`. A later Locks & Seals lever (a letter sealed "by Festus" opens doors at the Castra Peregrina). |

### 4.4 Ammunition (`ammo`)

| ID | Name | Latin | Stats | kg | Value | v0.1 |
|---|---|---|---|---|---|---|
| `sagitta` | Arrow | sagitta | for `arcus`; 50% recoverable | 0.05 | 0.2 | — |
| `glans-plumbea` | Lead Sling Bullet | glans plumbea | 12 blunt (sling) | 0.05 | 0.1 | 2 |
| `glans-inscripta` | Inscribed Sling Bullet | glans inscripta | 13.2 blunt; collectible (12) | 0.05 | 0.5 | 2 |
| `lapis` | Sling Stone | lapis | 8 blunt, 45 m/s; free | 0.06 | 0 | 2 |

### 4.5 Shields (`offHand`; GDD §8.4)

| ID | Name | Latin | Bash stagger | Block mitigation (skill 0 → 100) | Missiles | kg | Value | v0.1 |
|---|---|---|---|---|---|---|---|---|
| `scutum` | Scutum | scutum | 30 | 0.85 → 0.90 | 100% | 7.5 | 45 | M (Ludus issue; Euhodus) |
| `scutum-ovale` | Oval Shield | clipeus | 26 | 0.78 → 0.865 | 90% | 6.0 | 35 | M (`veteranus` kit at 40%; urban soldiers) |
| `parma` | Parma | parma | 20 | 0.65 → 0.80 | 70% | 3.0 | 25 | M |
| `parmula` | Parmula | parmula | 18 | 0.58 → 0.765 | 60% | 2.5 | 20 | M (Ludus issue; the creation extra at 60%) |
| `galerus` | Galerus | galerus | 0 | 0.35 (left side only) | 20% | 1.2 | 25 | M (Nereus) |

Block mitigation uses `base + (0.95 − base) × shieldSkill/200`, capped at 0.90 (GDD §6.4).

### 4.6 Armour (GDD §8.3)

| ID | Name | Slot | Class | Family | AR | kg | Value | v0.1 | Note |
|---|---|---|---|---|---|---|---|---|---|
| `subarmalis` | Subarmalis | padding | light | padded | 10 | 3.0 | 20 | M | Under mail; on its own sets the padded matrix. |
| `thorax-coriaceus` | Leather Cuirass | body | light | padded | 14 | 5.0 | 35 | M | Rex Cloacae wears one. |
| `cardiophylax` | Cardiophylax | body | light | padded | 10 | 2.0 | 30 | — | Provocator's chest plate. |
| `lorica-hamata` | Mail Shirt | body | heavy | mail | 30 | 9.0 | 190 | M | Euhodus stocks one; urban soldiers' alternative kit. |
| `lorica-squamata` | Scale Shirt | body | heavy | mail | 32 | 10.0 | 220 | — | |
| `lorica-segmentata` | Lorica Segmentata | body | heavy | plate | 38 | 8.5 | 260 (black market 390) | M (worn by urban soldiers; not sold) | |
| `thorax-musculus` | Muscle Cuirass | body | heavy | plate | 34 | 9.0 | 320 | — | Officers (Rufus). |
| `galea-gallica` | Imperial Gallic Helmet | head | heavy | — | 12 | 1.8 | 60 | M | `veteranus` kit. |
| `galea-italica` | Imperial Italic Helmet | head | heavy | — | 11 | 1.9 | 55 | M | |
| `galea-cruciata` | Cross-braced Gallic Helmet | head | heavy | — | 14 | 2.1 | 80 | — | Dacian-war cross-braces. |
| `galea-attica` | Praetorian Helmet | head | heavy | — | 12 | 2.0 | 150 | — | |
| `galea-murmillonis` | Murmillo Helmet | head | heavy | — | 14 | 3.5 | 90 | S | First-person vignette (medium). |
| `galea-thraecis` | Thraex Helmet | head | heavy | — | 13 | 3.3 | 90 | M (Auctus) | Griffin crest; vignette (medium). |
| `galea-secutoris` | Secutor Helmet | head | heavy | — | 16 | 3.8 | 90 | — | Cannot be caught by a net; vignette (strong). |
| `galea-hoplomachi` | Hoplomachus Helmet | head | heavy | — | 13 | 3.3 | 85 | — | |
| `galea-provocatoris` | Provocator Helmet | head | heavy | — | 13 | 3.2 | 80 | — | |
| `galea-equitis` | Eques Helmet | head | heavy | — | 12 | 2.8 | 80 | — | |
| `manica-linea` | Linen Manica | arm | light | — | 4 | 1.0 | 15 | M | |
| `manica-ferrea` | Iron Manica | arm | heavy | — | 7 | 2.0 | 60 | — | |
| `ocrea` | Greave | shins | light | — | 3 | 0.8 | 18 | M | |
| `ocreae` | High Greaves | shins | light | — | 6 | 1.8 | 40 | M | |

Helmets, manicae and greaves add only AR and weight; the **body** piece sets the class (penalties, XP) and the outermost torso piece sets the family (GDD §6.3, §8.3).

### 4.7 Clothing and status items (GDD §8.2)

| ID | Name | Slot | AR | kg | Value | v0.1 | Effect / note |
|---|---|---|---|---|---|---|---|
| `tunica` | Tunic | under | 0 | 0.5 | 4 | M | Basic dress; dyed variants by colour. All origin kits. |
| `tunica-crassa` | Thick Tunic | under | 2 | 0.9 | 6 | M | Bruisers. |
| `tunica-linea` | Linen Tunic | under | 0 | 0.4 | 12 | S | |
| `tunica-longa` | Long Tunic | under | 0 | 0.7 | 5 | S | Eastern fashion; women's long tunic visual. |
| `toga` | Toga | cloak | 0 | 3.5 | 25 | M | Male citizens and freedmen only (*usurpatio togae*, 100). Formal dress: +10 persuasion with elites and officials, −5 with Subura plebs; sprint +50%, attack speed −20%. On a woman: the prostitute's or adulteress's garment (GDD §3.7). In the pack for `civis-suburanus` and `hispanus` men. |
| `toga-fina` | Fine Toga | cloak | 0 | 3.5 | 80 | — | As the toga. |
| `stola` | Stola | body | 0 | 1.2 | 20 | M | Citizen women and freedwomen only (*usurpatio* [G]); with a palla = formal dress. Sprint +15%. In the pack for female `civis-suburanus` / `hispanus`. |
| `stola-fina` | Fine Stola | body | 0 | 1.2 | 60 | — | |
| `palla` | Palla | cloak | 0 | 1.5 | 8 | M | With a stola completes formal dress; sprint +25%, attack speed −10%. |
| `palla-fina` | Fine Palla | cloak | 0 | 1.5 | 30 | — | |
| `paenula` | Paenula | cloak | 0 | 1.5 | 8 | M | Hooded: at night witnesses identify you only 50% of the time. `civis-suburanus` kit. |
| `sagum` | Sagum | cloak | 1 | 1.8 | 6 | M | `veteranus` kit. |
| `lacerna` | Lacerna | cloak | 0 | 0.8 | 10 | S | +3 persuasion at the games. |
| `pallium` | Pallium | cloak | 0 | 1.2 | 10 | — | Greek mantle (philosophers, physicians). |
| `bracae` | Bracae | legs | 1 | 0.6 | 3 | — | |
| `fasciae` | Leg Wrappings | legs | 1 | 0.2 | 1 | S | |
| `caligae` | Caligae | feet | 1 | 1.0 | 5 | M | Hobnails: footsteps +20% on stone. `veteranus` kit. |
| `calcei` | Calcei | feet | 0 | 0.6 | 4 | M | The proper shoe for the toga. `civis-suburanus` kit. |
| `soleae` | Soleae | feet | 0 | 0.3 | 1 | S | In the street: −5 persuasion with elites. |
| `carbatinae` | Carbatinae | feet | 0 | 0.5 | 1 | M | Rustic shoes (`dacus` kit). |
| `cucullus` | Hood | head | 0 | 0.2 | 1 | M | As the paenula's hood; exclusive with helmets. Grassatores wear it. |
| `petasus` | Petasus | head | 1 | 0.2 | 1 | — | Sun hat. |
| `pileus` | Pileus | head | 0 | 0.2 | 1 | — | Felt cap of the freed. |
| `fascinum` | Fascinum | neck | — | 0.05 | 2 | S | Amulet: negates curse tablets; halves the chance of a bad daily omen. Reward in `misc-insula-nutans`. |
| `bulla` | Golden Bulla | neck | — | 0.05 | 25 | — | Amulet; freeborn boys (Pusio wears one). |
| `lunula` | Lunula | neck | — | 0.05 | 10 | — | Amulet. |
| `nodus-isidis` | Knot of Isis | neck | — | 0.02 | 15 | — | Amulet. |
| `anulus-aureus` | Gold Ring | finger | — | 0.01 | 50 | — | On a man marks an eques (else *usurpatio*, 200). |
| `anulus-signatorius` | Signet Ring | finger | — | 0.01 | 5 | M | Seals letters. |
| `torques` | Gold Torc | — | — | 0.4 | 120 | — | Loot, not jewellery. |

### 4.8 Food and drink (GDD §8.5, prices §7.2)

| ID | Name | Latin | Effect | kg | Value | v0.1 |
|---|---|---|---|---|---|---|
| `panis` | Bread | panis | +8 HP over 8 s | 0.33 | 1 as. | M (all kits) |
| `puls` | Puls | puls | +12 HP over 8 s, +10 stamina | 0.5 | 1 as. | M |
| `caseus` | Cheese | caseus | +6 HP over 8 s | 0.3 | 2 as. | M |
| `olivae` | Olives | olivae | +4 HP over 8 s | 0.3 | 3 as. | M |
| `ficus` | Dried Figs | ficus aridae | +4 HP over 8 s | 0.2 | 2 as. | M |
| `botulus` | Sausage | botulus | +15 HP over 10 s | 0.3 | 2 as. | M |
| `patina` | Garum Dish | patina | +20 HP over 10 s; +10% stamina regen 5 game min | 0.5 | 8 as. | M |
| `cena` | Full Dinner | cena | +40 HP over 20 s; `satur` (+10% max stamina, 2 game h) | 1.5 | 3 | 2 |
| `libum` | Honey Cake | libum | +5 HP; the standard small offering | 0.1 | 1 as. | M |
| `mel` | Honey | mel | +5 HP; ingredient | 0.3 | 6 as. | S |
| `aqua` | Water | aqua | +5 stamina; partly washes off grime | 0.5 | 0 | M |
| `posca` | Posca | posca | +30 stamina; +20% stamina regen 60 s | 0.6 | 1 as. | M |
| `vinum` | House Wine | vinum | +15 stamina; `ebrius` | 0.25 | 1 as. | M |
| `vinum-melius` | Better Wine | vinum melius | +20 stamina; `ebrius` | 0.25 | 2 as. | M |
| `vinum-falernum` | Falernian | vinum Falernum | +25 stamina; `ebrius`; +5 Rhetoric 120 s | 0.25 | 4 as. | M |
| `mulsum` | Mulsum | mulsum | +20 stamina; `ebrius` | 0.25 | 2 as. | M |
| `fabae` **NEW** | Black Beans | fabae nigrae | +3 HP over 6 s. The bean of the Lemuria rite (thrown, not eaten, by the pious) | 0.2 | 1 as. | S |
| `lupini` **NEW** | Lupins | lupini | +4 HP over 6 s. Salted, sold hot in the street (society §3.3) | 0.2 | 1 as. | M (Chreste) |
| `cicer` **NEW** | Hot Chickpeas | cicer frictum | +6 HP over 8 s | 0.3 | 1 as. | M (Chreste) |

### 4.9 Remedies, poisons and ingredients

| ID | Name | Latin | Effect | kg | Value | v0.1 |
|---|---|---|---|---|---|---|
| `fascia` | Bandage | fascia | +25 HP over 5 s; cures bleeding | 0.05 | 2 as. | M (all kits ×2) |
| `emplastrum` | Poultice | emplastrum | +40 HP over 10 s | 0.1 | 4 as. | M |
| `collyrium` | Eye Salve | collyrium | cures `caecatus` | 0.05 | 4 as. | S |
| `theriaca` | Theriac | theriaca | cures poison; −50% poison damage 1 game h | 0.15 | 15 | S |
| `febrifugum` | Fever Draught | febrifugum | cures `febris` | 0.2 | 28 as. | — |
| `soporificum` | Soporific | soporificum | weapon coating, 3 hits: KO after 3 s | 0.1 | 10 | — |
| `aconitum` | Aconite | aconitum | poison: 4 HP/s 10 s | 0.05 | 3 | — |
| `cicuta` | Hemlock | cicuta | poison: −50% stamina regen 60 s | 0.05 | 2 | — |
| `taxus` | Yew | taxus | poison: 2 HP/s 30 s | 0.05 | 2 | — |
| `papaver` | Poppy | papaver | ingredient | 0.05 | 12 as. | — |
| `mandragora` | Mandrake | mandragora | ingredient | 0.05 | 3 | — |
| `allium` | Garlic | allium | ingredient | 0.05 | 1 as. | 2 |
| `acetum` | Vinegar | acetum | ingredient | 0.05 | 1 as. | 2 |
| `myrrha` | Myrrh | myrrha | ingredient | 0.05 | 3 | 2 |
| `absinthium` | Wormwood | absinthium | ingredient | 0.05 | 4 as. | 2 |
| `helleborus` | Hellebore | helleborus | ingredient | 0.05 | 8 as. | — |
| `ruta` | Rue | ruta | ingredient | 0.05 | 4 as. | 2 |
| `salvia` | Sage | salvia | ingredient | 0.05 | 2 as. | 2 |
| `tus` | Incense | tus | offering (a pinch); a box costs 1 den. | 0.05 | 1 as. | M (Philetus) |
| `nardus` **NEW** | Indian Nard | nardus | ingredient and trade good (perfume) | 0.1 | 12 | 2 |

### 4.10 Tools

| ID | Name | Latin | Use | kg | Value | v0.1 |
|---|---|---|---|---|---|---|
| `tabula-cerata` | Wax Tablet | tabula cerata | notes, letters, forgeries (all kits) | 0.3 | 3 as. | M |
| `stilus` | Stylus | stilus | writing | 0.02 | 1 as. | M |
| `lucerna` | Clay Lamp | lucerna | interior light; the lararium lamp | 0.3 | 1 as. | M |
| `hamulus` | Lockpick | hamulus | locks (GDD §14.3) | 0.02 | 1 | 2 |
| `instrumentum-fabri` | Repair Kit | instrumentum fabri | field repair +25% (needs the Armorer perk) | 1.5 | 8 | — |
| `hama` **NEW** | Fire Bucket | hama | vigiles' esparto bucket sealed with pitch [A]; the `vig-01` chain; carries water to douse small fires (one fire zone per bucket) | 1.5 | 1 | 2 |
| `cento` **NEW** | Wet Rag Blanket | cento | vigiles' smothering blanket [A]; worn over the head (`cloak` slot) for 30 s: cross one fire zone without damage | 2.0 | 1 | 2 |

### 4.11 Trade goods, documents, tokens, coins and keepsakes

| ID | Name | Latin | Use | kg | Value | v0.1 |
|---|---|---|---|---|---|---|
| `cera-signatoria` | Sealing Wax | cera signatoria | resealing | 0.05 | 2 as. | 2 |
| `defixio` | Curse Tablet | defixio | blank lead sheet (GDD §14.6) | 0.2 | 2 as. | 2 |
| `clavus` | Nail | clavus | pierces a curse tablet | 0.02 | 1 as. | 2 |
| `defixio-prasina` | Curse Tablet against the Greens | defixio | text T6 (§7) | 0.2 | 2 as. | — |
| `defixio-veneta` **NEW** | Curse Tablet against the Blues | defixio | the Blue mirror of T6 (`cir-01`) | 0.2 | 2 as. | — |
| `defixio-furtum` | Curse Tablet against a Bath Thief | defixio | collectible | 0.2 | 2 as. | — |
| `defixio-tiberina` **NEW** | Curse Strip from the Bridge | defixio | Anthus' curse on Sosibius' barge (`misc-sublicius-clavi`; text in the quest) | 0.05 | 0 | 2 |
| `tabella-votiva` | Votive Tablet | tabella votiva | given when a vow is paid (V·S·L·M) | 0.2 | 0 | — |
| `tessera-frumentaria` | Grain Token | tessera frumentaria | the dole; 25 den. black market | 0.01 | 25 | — |
| `tessera-theatralis` | Theatre Token | tessera theatralis | theatre entry | 0.01 | 1 as. | — |
| `tessera-collegii` | Collegium Token | tessera collegii | back rooms of a trade club (bruiser loot) | 0.02 | 4 as. | M |
| `tessera-lavernae` **NEW** | Token of Laverna | tessera Lavernae | bronze token stamped with a hooded woman and a lamp: the Cultores' pass (`lav-01`) | 0.02 | 0 | 2 |
| `tali` | Knucklebones | tali | dice (illegal outside the Saturnalia) | 0.05 | 4 as. | M |
| `fritillus` | Dice Cup | fritillus | dice | 0.1 | 4 as. | S |
| `piper` / `piper-album` / `piper-longum` | Black / White / Long Pepper | piper | trade goods, per libra | 0.33 | 4 / 7 / 15 | — |
| `argentum` | Silver Plate | argentum | valuable | 0.6 | 40 | S |
| `vasa-arretina` | Arretine Ware | vasa Arretina | valuable | 0.6 | 2 | M |
| `vitrum` | Glass Beaker | vitrum | valuable | 0.3 | 3 | M |
| `purpura` | Tyrian Purple | purpura | luxury | 0.1 | 100 | — |
| `gemma` | Carnelian Gem | gemma | valuable; Antiochus' gift (`misc-facies-columnae`) | 0.01 | 30 | S |
| `margarita` **NEW** | Small Pearl | margarita | valuable (Red Sea pearl; `misc-colossus`) | 0.01 | 15 | 2 |
| `armilla-dacica` **NEW** | Dacian Silver Bracelet | armilla Dacica | a spiral bracelet with snake-head ends; keepsake and valuable (`misc-scalae-gemoniae`); Dacian NPCs +5 disposition while worn [design] | 0.1 | 20 | 2 |
| `nugae` | Stolen Trinket | nugae | valuable (thug loot) | 0.05 | 3 | M |
| `diploma` | Discharge Diploma | diploma militare | `veteranus` keepsake | 0.1 | 0 | M |
| `tabula-stipendii` | Pay Tablet | tabula stipendii | soldier loot | 0.1 | 2 | M |
| `epistula-signata` | Sealed Letter | epistula signata | elite loot; a quest lead | 0.05 | 0 | — |
| `corium` | Hide | corium | beast loot | 1.5 | 2 | — |
| `ferrum` | Iron Bar | ferrum | smithing | 2.0 | 2 | — |
| `penna-corvi` **NEW** | Raven Feather | penna corvi | keepsake of the Mithraic grade Corax (`mit-01`) | 0.01 | 0 | — |
| `aureus` | Aureus | aureus | coin = 25 den. on pickup | 0.007 | 25 | M |
| `denarius-columnae` | New Denarius | denarius | coin = 1 den. ("a new denarius showing the Column") | 0.003 | 1 | M |
| `dupondius-domitiani` | Worn Dupondius | dupondius | coin = 2 as. | 0.013 | 2 as. | M |

### 4.12 Books (skill books: +1 level once; GDD §8.6)

| ID | Name | Teaches | Value | v0.1 | Where (v0.1–v0.2) |
|---|---|---|---|---|---|
| `liber-celsus` | Celsus, *On Medicine* | medicina | 5 | S | Hermippus' shelf (`ludus-saniarium`, take with permission) |
| `liber-dioscorides` | Dioscorides, *On Medical Materials* | medicina | 5 | — | |
| `liber-scribonius` | Scribonius Largus, *Compositions* | medicina | 5 | 2 | Demetrius' shop |
| `liber-strategemata` | Frontinus, *Strategemata* | shield | 5 | 2 | `statio-cohortium-urbanarum` |
| `liber-onasander` | Onasander, *The General* | blades | 5 | — | |
| `liber-vitruvius` | Vitruvius, *On Architecture* | fabrica | 5 | 2 | `officina-columnae` |
| `liber-aquaeductu` | Frontinus, *On the Aqueducts* | fabrica | 5 | 2 | Ianuarius' niche (Cloaca) |
| `liber-martialis` | Martial, *Epigrams* I | rhetoric | 5 | S | Juvenal owns a copy; the popina shelf |
| `liber-plinii-epistulae` | Pliny, *Letters* | rhetoric | 5 | — | |
| `liber-columella` | Columella, *On Agriculture* | mercatura | 5 | — | |
| `liber-fasti` | Ovid, *Fasti* | religio | 5 | 2 | `insula-mariorum` (Fuscus' copy) |
| `liber-naturalis-28` | Pliny the Elder, *Natural History* XXVIII | religio | 5 | — | |
| `liber-xenophon-equitandi` | Xenophon, *On Horsemanship* | equitatio | 5 | — | |
| `liber-commentarii-doctoris` | *Commentarii Doctoris* (fictional) | spear | 1 | M | `ludus-cellae` (Glaucus' notes) |
| `liber-quintiliani` | Quintilian, *Institutio Oratoria* XII | rhetoric | 5 | — | |
| `liber-amores` | Ovid, *Amores* I | locks-seals | 1 | — | |
| `liber-satyricon` | Petronius, *Satyricon* (fragment) | pickpocket | 1 | — | |
| `liber-cynegeticus` | Xenophon, *On Hunting* | archery | 5 | — | |
| `liber-res-gestae` | *The Deeds of the Divine Augustus* | — (Lexicon) | 1 | — | |

### 4.13 Keys (`clavis-<id>`, GDD §8.6)

| ID | Opens | Where | v0.1 |
|---|---|---|---|
| `clavis-cellae-muris` **NEW** | `cista-muris` (the strongbox in `dun-taberna-collapsa`) | on Mus, or handed over if he surrenders | M |
| `clavis-cloacae` **NEW** | the grate at `shrine-venus-cloacina` and the gang gate in `dun-cloaca-maxima` | from Ianuarius | S |
| `clavis-loculi` **NEW** | (not obtainable) the deposit chests of `castor-loculi` | Chrysippus | — |

### 4.14 Quest items (all `type: 'quest'`, weightless, `questItem: true`; GDD §8.6)

| ID | Name | Latin | Quest | Description (and text, if any) |
|---|---|---|---|---|
| `quest-tabella-signata` | The Courier's Sealed Tablet | tabella signata | `mq-01`, `mq-02` | Two hinged wax tablets bound with linen thread, sealed with a horseman intaglio (Festus' ring). Text T1 (§7). The GDD's starting-kit item (§3.5). |
| `quest-epistula-festi` | Festus' Letter Home | epistula | `mq-01`, `mq-03` | An unsent letter to his mother. Text T2. |
| `quest-sacculum-festi` | Festus' Satchel | sacculus | `mq-02` | A courier's leather satchel with a cut strap. Contains the two items below. |
| `quest-tabula-rasa` | Scraped Wax Tablet | tabula rasa | `mq-02` | A tablet scraped in haste: under the lamp, three names still show in the grooves of the wax: "…NARIVS AVIT…", "…VHOD…", "HERMOG…" (The Purse, GDD §10.2: Pinarius Avitus, Euhodus, Hermogenes). |
| `quest-drachma-parthica` | Parthian Drachm | drachma Parthica | `mq-02` | A silver drachm of King Osroes, a bearded profile in a tiara. Not Roman money; not for spending. |
| `quest-tessera-peregrina` | Gratus' Token | tessera | `mq-02` → `mq-05` | A bone token cut with a spear and the letters PEREG. Admits you to the Castra Peregrina; +10 to talking your way past a soldier. |
| `quest-clavis-cifrae` | Gemellus' Key | clavis litterarum | `mq-03` | A child's wax tablet: two alphabets, the second moved four letters along. |
| `quest-nuntius-festi` | Festus' Message, Read | nuntius | `mq-03` → `mq-04` | The decoded dispatch (T1, plain text). |
| `quest-tabella-drachmae` | Tablet Sealed with a Drachm | tabella | `misc-venus-cloacina` | Sealed not with a ring but with the impression of a Parthian coin. Blank inside except for a tally: "XII · XII · XXIV". |
| `quest-zona-lurconis` | Lurco's Purse | zona | `lav-01` | A fat leather purse. 18–30 den. and a folded bill of sale. |
| `quest-titulus-onesimi` | Bill of Sale for Onesimus | titulus | `lav-01` → `misc-servus-aesculapii` | "Onesimus, drover, Syrian, about 26, healthy and without defects, 1,600 HS" — crossed through, and beside it in another hand: "aeger · in insula relictus" ("sick, left on the island"). |
| `quest-testimonium-sorani` | Soranus' Statement | testimonium | `misc-servus-aesculapii` | A Greek physician's note, in Greek and Latin, that the man was gravely ill and has recovered. |
| `quest-genitura` | The Sealed Nativity | genitura | `misc-genitura-caesaris` | A horoscope. Text T12. Carrying it is *maiestas* if found. |
| `quest-formae-nummariae` | Coin Moulds | formae nummariae | `misc-argei` | Clay moulds for denarii of Trajan and a lead blank, wrapped in waxed cloth inside a rush puppet. |
| `quest-panni-picati` | Pitch-soaked Rags | panni picati | `vig-01` | Rags stiff with pitch from under the burned stair. Nobody cooks with pitch. |
| `quest-hordeum-corruptum` | Spoiled Barley | hordeum | `cir-01` | Barley with chopped oleander leaves in it. |
| `quest-epistula-patroni` | The Patron's Note | epistula | `cli-01` | A sealed note; text varies by patron. |
| `quest-penna-corvi` | Raven Feather | penna | `mit-01` | The invitation token; becomes `penna-corvi`. |
| `quest-nardus-falsum` | False Nard | nardus adulteratus | `misc-mercuralia` | A flask of nard that smells of grass and lies. |

---

## 5. ENEMIES AND BOSSES

All stats are `CombatProfile` values from the GDD §6.11 tier table unless a row overrides them. Damage dealt to the player is `weapon × (1 + skill/200) × dmgMult × difficulty.taken` (Normal ×1.5), then the player's armour (GDD §6.2). No level scaling: what changes danger is the district band, the night band and the main-quest act (GDD §13.3).

### 5.1 Tier reference (the tiers v0.1–v0.2 use)

| Tier | Band | HP | Stam. | AR | dmgMult | Speed | Aggr. | Block | Poise | React. (s) | Skill | yieldAt | fleeAt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `civilian` | 0 | 30 | 50 | 0 | 0.6 | 1.0 | 0.10 | 0.05 | 20 | 0.60 | 5 | 0.50 | 0.60 |
| `thug` | 1 | 45 | 60 | 0–6 | 0.9 | 1.0 | 0.55 | 0.15 | 30 | 0.45 | 15 | 0.25 | 0.15 |
| `bruiser` | 1–2 | 75 | 80 | 10 | 1.0 | 0.95 | 0.70 | 0.20 | 55 | 0.45 | 25 | 0.20 | 0.10 |
| `skirmisher` | 1–2 | 45 | 70 | 6 | 1.0 | 1.05 | 0.50 | 0.10 | 30 | 0.40 | 30 | 0.25 | 0.20 |
| `miles` | 2–3 | 70 | 100 | 45–50 | 1.0 | 0.95 | 0.50 | 0.55 | 60 | 0.35 | 35 | 0.15 | 0.05 |
| `veteran` | 3 | 95 | 110 | 20–55 | 1.15 | 1.0 | 0.60 | 0.60 | 70 | 0.30 | 50 | 0.30 (arena) | 0 |
| `boss` | — | per boss | 150 | per boss | 1.4 | per boss | per phase | 0.6–0.8 | 150+ | 0.20 | 80 | scripted | 0 |

**Worked numbers (Normal):** a grassator's pugio (8 × 1.075 × 0.9 × 1.5) hits an unarmoured player for **11.6** (9 hits from 100 HP); his fustis for **14.5** (7 hits). A collegium bruiser's caestus (7 × 1.125 × 1.0 × 1.5) does **11.8** but always knocks out. An urban soldier's gladius thrust (13 × 1.175 × 1.5) does **22.9** to a player in a tunic (5 hits); against mail and helmet (AR 42, thrust vs mail 0.85) it does 14.4 (7 hits).

### 5.2 Archetypes and named fighters for v0.1–v0.2

| ID | Tier (band) | Loadout (item IDs) | AR / family | Spawns (location IDs, times) | Behaviour notes | Milestone |
|---|---|---|---|---|---|---|
| `grassator` | thug (1) | `pugio` + `cucullus`, `tunica` — or `fustis` + `tunica` | 0–2 / cloth | Pairs, **v1–v4**: `street-north-of-circus` (2 pairs), `vicus-tuscus` south of `compitum-vici-tusci` (1 pair), the alleys of `insula-mariorum` / `insula-nutans` (1 pair), `forum-boarium` (1 pair after v2). Scripted: 2 at `porta-capena` (`mq-01`), 3 in `dun-taberna-collapsa`. | Hunts in pairs at night; opens with a demand ("Purse or blood, friend"); one circles while one engages (tokens); **flees at 15%** to the nearest dark alley and may return after 2 game hours; yields at 25%. Avoids lit areas and anyone with a vigil within 20 m. | v0.1 |
| `ebrius-rixator` | thug (1) | fists, `tunica` | 0 / cloth | Popinae and the Meta Sudans after h10: `popina-vici-tusci` (1 in 3 nights), `caupona-carcerum`, `meta-sudans` (the rixa). | Starts brawls with a Juvenal line ("Whose sour wine and beans are you full of?", Sat. 3.292 [A]). **Non-lethal**: fists always KO. Slow (reaction 0.6 while `ebrius`), wide swings (stagger 8). Joins the side of whoever bought him a drink. | v0.1 |
| `collegium-bruiser` | bruiser (1–2) | `caestus` or `clava` + `tunica-crassa`, `subarmalis` | 10 / padded | `meta-sudans` (rixa leaders), Lurco's 2 bodyguards (`forum-boarium` h1–h7), 1 per 3 nights at `popina-vici-tusci` (a collegium debt collector, v0.2). | Grapples (an unblockable grab: 1.0 s telegraph, a 2 s knockdown) and knockdowns; holds a guard 12% of the time; calls 1 friend at 50%. The caestus never kills. | v0.1 |
| `miles-urbanus` (law) | miles (2–3) | `gladius`, `scutum`, `pilum` + `lorica-segmentata`, `galea-gallica`, `caligae` — or `scutum-ovale` + `lorica-hamata` + `galea-italica` | 50 plate / 45 mail | Day patrols of 3 (h1–v1) from `statio-cohortium-urbanarum`: Forum loop (Verecundus), `vicus-tuscus`–`forum-boarium`, `circus-maximus` north street. 2 guards at the Carcer day and night. | Lawful: arrests on witnessed crimes (GDD §14.1); formation with 3+ (shields lined, +15% block, one pilum volley at 15–25 m, v0.2); pre-emptive guard 33%; blocks ≥ 40% of light-attack spam (AC-07). | v0.1 |
| `vigil` (law) | thug (1–2) | `dolabra` or `fustis` + `tunica`, `paenula`, `caligae`, lantern | 1 / cloth | Night patrols of 2–3 (v1–v4) from `excubitorium-velabri` (Primigenius' route, §2.C) and from the Capena side. | Lawful at night; prefers knockouts and arrests; calls siphon crews to fires; shouts *Quis est?* | v0.1 |
| `funditor` | skirmisher (1–2) | `funda` + `glans-plumbea` ×12, `tunica` | 6 / cloth | `dun-cloaca-maxima` (ledge in beat 2, and the Rex's gallery); urb-01 ambush (Basilica Julia steps). | Keeps 12–30 m, uses ledges, high stagger (25), loud whirl (alerts 15 m); switches to a pugio within 3 m. | v0.1-Should / v0.2 |
| `cloacarius` | thug / bruiser (2) | `pugio` · `pugio` + `rete` · `fustis` + `fax` | 0–10 | `dun-cloaca-maxima` side channels (3 + 4 lookouts with the Rex). | Ambushes from side channels; net throws (entangle 3 s); torch-bearers light pitch pools (fire zone 6 HP/s, 10 s). | v0.1-Should / v0.2 |
| `sicarius` | veteran (2–3) | `sica` coated with `aconitum`, `tunica`, `paenula` | 20 / cloth | v0.2 only: one per Act I main-quest street sequence (the `mq-04` crowd, the walk to `castra-peregrina` in `mq-05`). | Ambushes from crowds (no reaction to crowd events: the GDD §13.2 "tell"); feints; poison on hit (4 HP/s for 10 s). | v0.2 |
| `canis` pack | beast (1) | bite 6 cut | — | v0.2 nights: 2–4 dogs in `vallis-murcia` lots behind the Circus, the `forum-boarium` pens, the Velabrum back alleys. | Packs circle; flee from torches; flee at 40%. | v0.2 |
| Gladiators (tiro, thraex, retiarius) | thug (tiro) / veteran / champion | per armatura (§2.C) | per kit | Ludus bouts only in v0.1–v0.2. | Fight to type; yield in the arena (*ad digitum*). | v0.1 |

**Named fighters (non-boss) — stat overrides:**

| ID | Base tier | HP | Stam. | AR / family | Weapon (damage) | Skill | Poise | React. | Block | Aggr. | yieldAt / fleeAt | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `npc-pullus` (bout 1) | thug | 45 | 60 | 0 / cloth (practice: subligaculum only) | `rudis` 11 blunt; `scutum` | 15 | 30 | 0.45 | 0.25 | 0.50 | KO at 0 (lusio); yields 0.25 | A nervous tiro: over-commits his power attacks (40% power, wind-up 0.8 s) so the player learns to parry and riposte. ~4–5 rudis hits at Blades 15. |
| `npc-auctus` (bout 2) | thug+ | 70 | 90 | 10 / cloth (`ocreae` 6 + `manica-linea` 4; no helmet in practice) | `sica-lusoria` 9 blunt (ignores 25% of block); `parmula` | 30 | 40 | 0.40 | 0.35 | 0.60 | KO at 0; yields 0.25 | Fights low and hooks round shields: teaches that a block is not a wall, and dodging. Attack interval 1.4 s. ~7 hits at Blades 20. |
| `npc-mus` (`dun-taberna-collapsa`) | bruiser | 75 | 90 | 6 / cloth (`tunica`, `cucullus`) | `sica-muris` 11 cut (+5% bleed); `pugio` 8 thrust (off-hand finisher) | 35 | 50 | 0.40 | 0.30 | 0.70 | yields 0.20 / flees 0 (cornered) | Ex-thraex: the "up from under" stroke = a forward power attack (wind-up 0.7 s, low crouch telegraph) that ignores 25% of block. Opens with dialogue (§3.1.2a). 1 token; his 2 knife-men take the other. |
| `mq01-grassator-a/b` | thug | 45 | 60 | 0 | `pugio` 8 / `fustis` 10 | 15 | 30 | 0.45 | 0.15 | 0.55 | 0.25 / 0.15 | The tutorial pair: fixed openers (A attacks first with a light chain; B waits 3 s, then a power attack with a long wind-up), so the parry lesson always lands. |
| `bitus` (`mq-04`, v0.2) — Bitus, son of Dida, the Dacian archer on the Column | skirmisher | 45 | 70 | 6 / cloth | `arcus` 16/arrow; `sica` 11 at ≤ 3 m | 40 | 30 | 0.40 | 0.10 | 0.50 | yields 0.25 | On the viewing platform; out of arrows after 6 shots; spare (opens the Dacian route) or kill (GDD §10.3). 2 Dacian knife-men (`thug`, `sica`) hold landings 1 and 3 of the 1:1 stair. |

**Spawn bands for v0.1 districts (GDD §13.3):**

| District | Day band / mix | Night band / mix |
|---|---|---|
| `dist-forum-romanum` | 0–1: urban patrol; pickpockets (v0.2, a `thug` that flees, never fights) | 1: 1 grassator pair near `basilica-julia-gradus` after v2; vigil patrol |
| `dist-fora-imperialia` | 1: workmen, guards at the Column court (praetorians from 12 May, v0.2) | 1: quiet; 2 urban guards at `column-trajan` (the eve) |
| `dist-velia`, `dist-vallis-colossei` | 1: fans, ebrius-rixator at h10+ | 2: grassator pairs (2), a bruiser at the Meta Sudans |
| `dist-circus-maximus` | 1: carters, astrologers, fans | 2: grassator pairs (2) on the north street; dogs (v0.2) |
| `dist-velabrum-boarium` | 1: dockers, cattle men; Lurco's bruisers | 2: grassator pairs (2), dogs (v0.2), the knife-men until `dun-taberna-collapsa` is cleared |
| `dist-capitolium`, `dist-palatium` | 0–1: guards | 1: guards; praetorian cordon (Palatine) |

### 5.3 Bosses (v0.1–v0.2), beat by beat

#### `boss-nereus` — Nereus the retiarius · v0.1-Must · `lud-01` bout 3 (a *lusio*)

**Stat block (GDD §13.2):** HP 300 · AR 7 (cloth: `manica-linea` left, a `ocrea`) · weapons `tridens-lusorius` 8 blunt, `rete` (entangle 3 s), a wooden practice dagger 6 blunt in P3 · skill 60 · poise 150 · reaction 0.25 · block 0.45 weapon-only, `galerus` 0.35 on the left side · attack interval 1.6 / 1.3 / 1.1 by phase · tokens 2 · speed 1.05 · phases at 75% and 45% · yields at 15%. A light poke hits a player in a tunic for **21.8** on Normal (8 × 1.3 × 1.4 × 1.5); in the lusio a player at 0 HP is knocked out, never killed.

**Arena:** `ludus-cavea`, an elliptical sand floor about 62 × 40 m (1:1 interior proportions), wooden barrier, the practice cavea with 80–120 spectators, Asiaticus refereeing with his staff, Glaucus at the gate. A water-organ is absent (practice); a horn sounds the start.

**Beats:**
1. **Entrance (10 s).** Asiaticus: "Nereus! Retiarius! Victor of thirty-one!" Nereus walks the barrier, kisses his net, and gives the crowd a flourish. Crowd favor shows on the right edge (starts at 30, +10 if `fama.plebs > 30`). The player may salute the benches (hold E: +5 favor once at ≥ 50, so not yet).
2. **P1, "the fisherman" (100 → 75%).** He keeps the trident's 1.8 m reach, circles left (away from the player's weapon hand), and pokes (light, wind-up 0.35 s). **Every 12 s, the net:** a 0.8 s overhead twirl (the telegraph: a swish, a distinct grunt, the cinnabar edge pulse) and a throw out to 6 m. **Dodging sideways** as the twirl starts beats it (+4 favor: dodging an unblockable). **If it lands:** the player is entangled for 3 s; mash E or F to struggle (−0.4 s per press); **the shield can still be raised**, and his first follow-up is always a telegraphed power poke (wind-up ≥ 0.8 s) that a raised scutum stops. **If it misses,** he must run to recover it (2–3 s): the punish window. Parrying his pokes (with a shield, even the power poke) staggers him and opens a riposte (+6 / +8 favor).
3. **P2, "the showman" (75 → 45%).** Interval 1.3 s. He feints (25% × aggression: a poke wind-up cancelled at 40%), adds a **sand kick** (he scuffs his right foot for 0.5 s, then `caecatus` 1 s if it lands within 3 m; a collyrium is not needed, it wears off), and plays to the crowd: if the player retreats > 3 s, the crowd boos (−2/s). Net still every 12 s, now thrown from a feint.
4. **P3, "the last cast" (45 → 15%).** At 45% he makes one last cast with everything in it (a 1.0 s twirl); hit or miss, the net tears on the barrier and is left on the sand. He switches to **trident and practice dagger**: desperate lunges (forward power attacks with hyper-armour, wind-up 0.7 s, +1.5 m), a dagger jab combo at ≤ 1 m. Interval 1.1 s. He is out of tricks and so is most dangerous here, and most punishable.
5. **Yield (15%).** He drops to one knee and raises a finger (*ad digitum*). Asiaticus steps in with the staff. The crowd chants (*Mitte!* at favor ≥ 50). The player chooses **Spare** (favor +10, Pietas +5, `fama.plebs +2`) or **strike** (stopped by the staff; −20 favor, `fama.ludus-magnus −5`). Missio is always granted in a lusio.
6. **Player yield (hold Y 1 s):** the missio roll (GDD §6.10): spared at favor ≥ 50, 50% at 30–49, 10% below, always on Tiro. Spared: the bout ends, wake in the Saniarium with `injured`, half purse. Not spared: "the doctor stops the bout", wake `injured`, no purse; retry after 1 game hour.

**Full favor (100):** hold E toward the benches: coins (5–20 den. in a lusio), a cup of wine (+40 stamina), 20% chance of a thrown `manica-linea`. Favor resets to 60.

**Tuning target (AC-08):** 3–6 minutes for a new character of each v0.1 origin with the Ludus `rudis` and `scutum` on Normal. At Blades 15–25 a rudis light hit does 11.8–12.4 × (1 − 7/127) ≈ **11.2–11.7**, so about 26 clean hits; parry-ripostes (×2) and his recovery windows after misses shorten it.

**Loot:** none (a lusio). Reward is the purse (§3.2.1).

#### `boss-rex-cloacae` — Saturninus, "Rex Cloacae" · v0.1-Should / v0.2 · `misc-venus-cloacina`

**Stat block (GDD §13.2):** HP 350 · AR 14 (padded: `thorax-coriaceus`) · `gladius` 13 thrust / 11 cut and `pugio` 8 · skill 60 · poise 150 · reaction 0.25 · block 0.50 · attack interval 1.6 · tokens 1 (his adds take the rest) · speed 1.0 · sluice at 50% · fleeAt 0 · **surrenders if the player opens the sluice first**.

**Arena:** the junction chamber of `dun-cloaca-maxima` (1:1): a vaulted space about 20 × 14 m where three drains meet, a knee-deep central channel, two walkways, a gallery 3 m up with the **sluice wheel** (reached by an iron ladder from the west walkway, or from a side channel that a sneaking player can reach before being seen), wall chains every 5 m, sconced torches, and the Rex's "throne" of bath-house benches heaped with stolen clothes.

**Beats:**
1. **Parley.** If the player arrives unseen (S < 35 at the chamber mouth), the **sluice route** is open: climb to the gallery and turn the wheel (hold E 4 s; 70 dB noise, so the gang is alerted as it turns). The surge flushes the 4 lookouts down the outfall; the Rex, clinging to his throne, surrenders ("Enough! The kingdom is yours!") → arrest (with a mandate), spare, rob or kill (GDD §6.9). Otherwise the Rex speaks first: "Welcome to my kingdom. Leave the way you came and keep your purse, or stay and lose both." `[Persuade 55]` makes him let the player take Ianuarius' grate key back and leave (the quest stays open); `[Intimidate 55]` makes the lookouts hesitate (2 of 4 do not join).
2. **P1, "court" (100 → 50%).** The Rex fights from the throne dais with gladius and pugio; **4 lookouts** (`cloacarius`: 2 knife, 1 net, 1 torch) and the **slinger** on the gallery. The slinger has a clear line to the walkways: break it by fighting under the gallery or by climbing to it. The torch-bearer lights pitch pools (fire zones). Rats stay in the dark channels while the sconces burn.
3. **P2, "the flood" (at 50%).** The Rex shouts "Open the sluice and we'll all go swimming!" and pulls a chain by the throne: a **surge** through the central channel pushes everyone in it 6 m toward the outfall. **Hold E on a wall chain** (marked by rust-red rags) to stay put; anyone swept takes 10 blunt damage and is out of the fight for 8 s; half the sconces go out. In the dark, the **rat swarm** comes out (1 HP/s inside it; a lit `fax` disperses it).
4. **P3, "the drowned king" (50 → 0%).** Knee-deep water: movement ×0.7 for everyone, dodges shortened to 1.8 m. The Rex is more aggressive (interval 1.3 s) and uses a **dirty trick**: a kick of filthy water into the face (`caecatus` 1 s, 0.5 s telegraph). He fights to the end (he has nowhere to go) unless the player sheathes the weapon at < 25% and talks (`[Persuade 25]`: he surrenders).
5. **Aftermath.** The cache (`cista-regis-cloacae`, §6) and the loopback grate.

**Loot (body):** `gladius` (cond. 0.7), `pugio`, `thorax-coriaceus`, the grate-iron "crown" (`nugae`, value 3), 12–20 den.

#### `boss-suchus` — The Crocodile · v0.2 · optional flooded bay of `dun-cloaca-maxima`

**Stat block (GDD §13.2):** HP 320 · AR 20 (padded hide) · bite 24 cut; **death-roll grab** · poise 140 · reaction 0.40 · attack interval 2.2 · tokens 2 · speed 2.5 m/s on land, 6.0 in water · phase at 50% · never yields: it is **netted**, not spared. Background: an escaped exhibit from the Ludus Matutinus (crocodiles were shown in Rome, game-design B6.1); the venatores want it back alive.

**Arena:** a flooded bay off the main channel: a 3 m-wide walkway around a pool 12 × 8 m, two collapsed sections (gaps of 1.5 m), a fallen beam across one corner.

**Beats:**
1. **P1, "the water" (100 → 50%).** It cruises; a **ripple line** telegraphs its approach. When the player stands within 1.5 m of the edge it **lunges** onto the walkway (1.0 s telegraph: the ripple stops, the snout rises): unblockable bite. Stay back from the edge and it hauls out only to bask (12 s cycle), when it can be hit safely from the side. Thrown spears and sling stones hit it in the water (−50% damage through water).
2. **P2, "the land" (50 → 0%).** It comes out to fight on the walkway: **tail sweep** (blunt 16, knockdown, 0.7 s telegraph: its head turns away), **bite** (24 cut), and the **death-roll grab** (a 1.0 s lunge; if it lands: mash E/F to escape, 6 HP/s until free, about 2 s for a fast masher). It cannot turn quickly on land: flank it.
3. **Netting.** Below 30% HP a **net** (`rete`, from the cloacarii's camp, or bought from Successus) entangles it for 1.5 s (boss rule); three successful nets in 20 s subdue it. Then the venatores' rope crew drags it out (cutscene-lite) → 60 den. from the Ludus Matutinus and `fama.ludus-magnus +5`. Killing it instead: `corium` ×2 and a tooth (`nugae`).

#### Set piece (v0.2): the stair of the Column (`mq-04`, preview)

Not a boss (GDD §10.3), but scripted: the 185-step spiral (a 1:1 interior, `dun-columna`), lit by slit windows [A]. Two Dacian knife-men (`thug`, `sica`) hold landings 1 and 3; the stair's radius means attacks along the curve: **sideways power sweeps are disabled** (the wall), lock-on is forced, and the inner newel blocks thrown weapons. At the top, **Bitus** (§5.2) on the viewing platform: 6 arrows (one at each landing window as the player climbs: blocked by a shield, 90% with an oval), then the sica. At 25% he yields: **spare** (Dacian route, `flag(bitus-spared)`) or kill.

---

## 6. CONTAINERS AND LOOT TABLES

Format follows `LootTableDef` in `src/rpg/data/loot.ts`: `rolls [min,max]` on weighted `entries` (an `item` or a nested `table`, with `count`), `chanceNone`, `denarii { range, chance }`, and independent `extras` with their own `chance`. **Existing** tables (`food`, `remedy`, `valuables`, `weapon.noric`, `weapon.bilbilis`, `armor.gladiator`, `armor.piece`, the tier tables, `chest.common`, `chest.rich`, `strongbox`, `shrine`, `tomb`) are kept as they are; **NEW** tables are defined below. Coins are rolled as denarii (GDD §7.1); named coin items convert on pickup.

### 6.1 Container types

| Container ID | Prop | Owner | Lock | Loot table | Respawn | Where (v0.1–v0.2) | v0.1 count |
|---|---|---|---|---|---|---|---|
| `latebra-silicis` **NEW** | A loose paving slab with a hollow under it | **unowned** | — | `cache.street` | never (one-time) | 1 per district: by `signum-vortumni`, `meta-sudans` steps, `compitum-circi`, `forum-boarium` drinking trough, behind `temple-portunus`, under the Basilica Julia steps' last board | 6 |
| `fissura-muri` **NEW** | A crack in an old wall, stuffed with rags | unowned | — | `cache.street` | never | insula walls in the Velabrum (4), the Circus north street (3), the Colosseum valley (2) | 9 |
| `sarcina-abiecta` **NEW** | A dropped bundle (thieves' stash) | unowned | — | `cache.street` + `extras: nugae 0.5` | 10 game days | alleys behind `insula-nutans`, `astrologi-circi`, `caupona-carcerum` | 3 |
| `amphora-stack` | Stack of 4–8 amphorae outside a taberna | owned (the taberna) | — | `amphora.wine` | 2 game days | outside every popina, caupona and the `horrea-agrippiana` door; one scorched (unowned) in `dun-taberna-collapsa` | 8 (+1 unowned) |
| `corbis-mercatoris` **NEW** | Market basket on a stall | owned | — | `food` | 1 game day | `forum-boarium`, `forum-holitorium`, the Vicus Tuscus stalls | 6 |
| `cista-insulae` **NEW** | Wooden chest in a flat | owned (the tenant) | `simplex` (v0.2) | `chest.common` | 10 game days | each enterable insula flat; Prima's flat; Fuscus' house (Festus' chest: scripted) | 4 |
| `arca-tabernae` **NEW** | Iron-bound shop strongbox | owned | `mediocris` (v0.2) | `strongbox` | 10 game days | `taberna-armorum` (Euhodus; his ledger becomes a Purse-cell clue in v0.6), `popina-vici-tusci`, `tabernae-aemiliae` (Hermogenes: `firma`) | 3 |
| `arca-compiti` **NEW** | Offering box at a crossroads shrine | owned (the *vicus*) | — | `shrine` | 3 game days | every `compitum-*` spot | 6 |
| `arca-templi` | Offering chest inside a temple precinct | owned (the god) | `difficilis` | `shrine` + `extras: argentum 0.05` | 10 game days | `temple-castor-pollux`, `temple-saturn`, `temple-aesculapius` | (v0.2) |
| `cella-ludi` **NEW** | A gladiator's locker in the barracks | owned (the gladiator) | — | `locker.ludus` | 5 game days | `ludus-cellae` (6 lockers) | 6 |
| `silt-niche` **NEW** | A niche in the drain wall, silted up | unowned | — | `cloaca.silt` | never | `dun-cloaca-maxima` (8) | (v0.1-Should) 3 |
| `cista-muris` **NEW** | Mus' strongbox | Mus (a criminal: no crime to take it) | `simplex`, key `clavis-cellae-muris` | fixed (below) | never | `dun-taberna-collapsa` room 3 | 1 |
| `cista-regis-cloacae` **NEW** | The Rex's heap of stolen goods | the Rex (no crime) | — | fixed (below) | never | `dun-cloaca-maxima` junction chamber | (v0.1-Should) 1 |
| `plaustrum` **NEW** | A night cart's load | owned (the carter) | — | `amphora.wine` or `building.load` | 1 game day | carts at `capena-extra` and on the Circus streets, v1–v4 | 2 |

**Ownership rules (GDD §12.3, §14.1):** taking from an owned container is `furtum` (2 × value) if witnessed; from a temple chest it is `sacrilegium` (250) and `infaustus`. **In v0.1, if crime with witnesses does not ship (it is a Should), owned containers stay closed** ("[E] Owned: Vibia Chreste") and only the unowned ones open. Counting the table: **20 unowned** containers (6 slabs, 9 wall cracks, 3 bundles, the scorched amphora stack, `cista-muris`; 23 with the Cloaca's Should niches) and **35 owned** ones, 55 in all, above the AC-23 target of 40. If crime is cut from v0.1, the 20 unowned containers plus 20 unowned "loose" props (a coin in a fountain basin, a dropped tool, a bundle on a cart) keep AC-23 at 40.

### 6.2 New loot tables

```ts
// add to LOOT_TABLES (src/rpg/data/loot.ts)
{ id: 'cache.street', rolls: [1, 1], chanceNone: 0.2, denarii: { range: [0.25, 4], chance: 0.5 },
  entries: [ { item: 'nugae', weight: 3 }, { item: 'tali', weight: 2 }, { item: 'dupondius-domitiani', weight: 3 },
             { item: 'denarius-columnae', weight: 2, count: [1, 3] }, { item: 'fascia', weight: 2 }, { item: 'vasa-arretina', weight: 1 },
             { item: 'fascinum', weight: 0.5 }, { item: 'defixio', weight: 0.5 }, { item: 'hamulus', weight: 0.5 /* v0.2 */ },
             { item: 'glans-inscripta', weight: 0.3 /* v0.2 collectible */ } ] },
{ id: 'amphora.wine', rolls: [1, 2], chanceNone: 0.25,
  entries: [ { item: 'vinum', weight: 5, count: [1, 3] }, { item: 'posca', weight: 3 }, { item: 'vinum-melius', weight: 2 },
             { item: 'vinum-falernum', weight: 0.5 }, { item: 'olivae', weight: 2 }, { item: 'acetum', weight: 1 } ] },
{ id: 'building.load', rolls: [1, 1], entries: [ { item: 'ferrum', weight: 2 }, { item: 'malleus', weight: 0.3 }, { item: 'lucerna', weight: 1 } ] },
{ id: 'locker.ludus', rolls: [1, 2], chanceNone: 0.1, denarii: { range: [0.25, 3], chance: 0.4 },
  entries: [ { item: 'fascia', weight: 4, count: [1, 2] }, { item: 'posca', weight: 3 }, { item: 'panis', weight: 3 }, { item: 'tali', weight: 2 },
             { item: 'manica-linea', weight: 1 }, { item: 'fasciae', weight: 1 }, { item: 'lucerna', weight: 1 }, { item: 'emplastrum', weight: 1 } ] },
{ id: 'cloaca.silt', rolls: [1, 2], chanceNone: 0.3, denarii: { range: [0.25, 3], chance: 0.6 },
  entries: [ { item: 'nugae', weight: 4 }, { item: 'dupondius-domitiani', weight: 3 }, { item: 'vitrum', weight: 1 },
             { item: 'glans-plumbea', weight: 1, count: [2, 5] }, { item: 'anulus-signatorius', weight: 0.3 }, { item: 'gemma', weight: 0.2 },
             { item: 'defixio-furtum', weight: 0.5 } ] },
{ id: 'rixator', rolls: [0, 0], entries: [], denarii: { range: [0, 1] },
  extras: [ { item: 'tali', chance: 0.2 }, { item: 'vinum', chance: 0.3 }, { item: 'panis', chance: 0.2 } ] },
{ id: 'vigil', rolls: [0, 0], entries: [], denarii: { range: [0.5, 2] },
  extras: [ { item: 'lucerna', chance: 0.6 }, { item: 'fascia', chance: 0.5 }, { item: 'hama', chance: 0.2 } ] },
{ id: 'cloacarius', rolls: [0, 0], entries: [], denarii: { range: [0.25, 3] },
  extras: [ { table: 'cloaca.silt', chance: 0.5 }, { item: 'fax', chance: 0.3 }, { item: 'tunica', chance: 0.2 /* stolen bath clothes */ } ] },
{ id: 'sicarius', rolls: [0, 0], entries: [], denarii: { range: [10, 30] },
  extras: [ { item: 'aconitum', chance: 0.4 }, { item: 'sica', chance: 0.6 }, { item: 'epistula-signata', chance: 0.1 }, { item: 'aureus', chance: 0.1 } ] },
// pickpocket purses by class (v0.2, GDD §14.4): what an NPC carries
{ id: 'purse.plebs',    rolls: [1, 1], chanceNone: 0.3, denarii: { range: [0.25, 3] }, entries: [ { item: 'tali', weight: 1 }, { item: 'libum', weight: 1 }, { item: 'nugae', weight: 1 } ] },
{ id: 'purse.mercator', rolls: [1, 1], chanceNone: 0.3, denarii: { range: [3, 15] },  entries: [ { item: 'tessera-collegii', weight: 2 }, { item: 'vasa-arretina', weight: 1 }, { item: 'tabula-cerata', weight: 2 } ] },
{ id: 'purse.miles',    rolls: [1, 1], chanceNone: 0.5, denarii: { range: [2, 8] },   entries: [ { item: 'tabula-stipendii', weight: 2 }, { item: 'tali', weight: 1 } ] },
{ id: 'purse.elite',    rolls: [1, 1], chanceNone: 0.2, denarii: { range: [10, 40] }, entries: [ { item: 'anulus-signatorius', weight: 1 }, { item: 'gemma', weight: 1 }, { item: 'aureus', weight: 1 } ] },
```

### 6.3 Fixed (authored) loot

| Container / body | Contents |
|---|---|
| `npc-festus` (body, `mq-01`) | 6 den. 3 as.; `pugio` (cond. 0.9); `quest-epistula-festi`; (the satchel is gone: Mus took it) |
| `cista-muris` (`dun-taberna-collapsa`) | `quest-sacculum-festi` (with `quest-tabula-rasa` and `quest-drachma-parthica`); 18 den.; `nugae` ×2; `fascia` ×2; `sica-muris` (if Mus surrendered it; otherwise it drops from his body) |
| `npc-mus` (body or surrender) | `clavis-cellae-muris`; `sica-muris`; `pugio`; `cucullus`; 3–6 den. |
| `cista-regis-cloacae` (`dun-cloaca-maxima`) | 30–40 den.; `pugio-noric`; `quest-tabella-drachmae`; stolen bath clothes: `tunica-linea`, `lacerna`, `palla` (all flagged `stolenFrom: baths-titus`, so non-fences refuse them); `defixio-furtum` (a bath-thief curse, ironically); `table: valuables` ×1 |
| `npc-rex-cloacae` (body) | `gladius` (cond. 0.7), `pugio`, `thorax-coriaceus`, the grate-iron crown (`nugae`), 12–20 den. |
| `boss-suchus` (if killed) | `corium` ×2, a crocodile tooth (`nugae`, value 4) |
| Lurco's purse (`quest-zona-lurconis`) | 18–30 den. (rolled at quest start); `quest-titulus-onesimi` |
| Festus' chest (`insula-mariorum`, `mq-03` `clue-cloak`) | empty peg where the paenula hung; `liber-fasti`; a child's wax tablet reading "TEBIX · QEBIX" ("PATER · MATER", every letter moved four along: the twins' game, a free hint for players who try) |

### 6.4 Enemy loot by type (v0.1–v0.2)

What an NPC wears and wields also drops, weighted by condition (GDD §6.14). Practice bouts (lusiones) drop nothing.

| Enemy | Loot table | Plus |
|---|---|---|
| `grassator` | `thug` (0.2–3 den.; fustis or pugio 50%; bread 30%; dice 15%; stolen trinket 10%) | its `cucullus` (50%) |
| `ebrius-rixator` | `rixator` | — |
| `collegium-bruiser` | `bruiser` (1–6 den.; caestus or clava; posca; collegium token 20%) | Lurco's bodyguards: no token (they are his slaves) |
| `funditor` | `skirmisher` | `funda`, 3–8 glandes |
| `cloacarius` | `cloacarius` | net-thrower drops `rete` (cond. 0.5) |
| `miles-urbanus` (killing one is a crime) | `miles` | equipment by condition |
| `vigil` | `vigil` | `dolabra` or `fustis` |
| `sicarius` (v0.2) | `sicarius` | — |
| `canis` (v0.2) | `beast` with `corium` chance 0.2 (dogs) | — |
| `bitus` (`mq-04`, v0.2) | fixed: `arcus`, 0–6 `sagitta`, `sica`, a Dacian amulet (`nugae`), 2 den. | spared: nothing taken unless robbed |
| Gladiators in public munera (v0.3+) | `veteran` / `champion` | armatura piece 30% |

---

## 7. IN-WORLD TEXTS

Thirteen original texts (none is copied from an ancient source; formulae such as *si vales bene est*, *vela erunt*, *vetustate conlapsam restituerunt* or *iam iam cito cito* are period conventions used in new sentences). Latin is given where the object would show it; the English is what the reading panel shows below it. Each names the item, prop or location that carries it. In the Lexicon all of them are labelled **invented** [G].

**T1 — The courier's sealed tablet** (`quest-tabella-signata`; read in `mq-02`, decoded in `mq-03`)

*Outer face, in clear, scratched in the wax of the cover:*
> DABIS · T · AVFIDIO · PVDENTI · PRINCIPI · PEREGRINORVM
> AB · C · MARIO · FESTO
> DATA · A · D · VI · NON · MAI · BRVNDISII
>
> *"Deliver to T. Aufidius Pudens, chief of the Peregrini, from C. Marius Festus. Given at Brundisium on the 6th day before the Nones of May (2 May)."*

*Inside, in Festus' cipher (every letter of the 21-letter alphabet A B C D E F G H I K L M N O P Q R S T V X moved four places along; X wraps to D):*
> NR HIHNGEBNSRI EXGCA NR PSGS EPBS
> ID SXNIRBI TIGCRNE TIX MSXXIE TNTIXEBEXNE
> QSRI LXEBCQ

*Decoded (with `quest-clavis-cifrae`):*
> IN DEDICATIONE ARCVS IN LOCO ALTO · EX ORIENTE PECVNIA PER HORREA PIPERATARIA · MONE GRATVM
>
> *"At the dedication, a bow in the high place. Money from the East through the Pepper Warehouses. Warn Gratus."*

(The cipher is a Caesar shift [A: Suetonius, *Iul.* 56, describes Caesar's shift of three; *Aug.* 88, Augustus' of one]. Suetonius the NPC enjoys this.)

**T2 — Festus' letter home, never sent** (`quest-epistula-festi`)
> *Festus matri suae Helpidi salutem. Si vales, bene est; ego valeo.*
>
> I write from Brundisium with a pen that hates me. I will be home before the Ides, the gods and the mules willing, and I am bringing you a little jar of Falernian, the real kind, not the kind Chreste sells. Don't tell Father. He'll pour it on the Lares.
>
> Tell Gemellus to come down off the roof and eat something. Tell him too that I have not forgotten our old game, and that he should practise it, because I may need him to read something for me. He will know what I mean. Four is still the number.
>
> The camp sends me everywhere and pays me from nowhere. When Caesar goes east I may go with him, or not; nobody tells a courier anything, which is why they make us couriers.
>
> Light a lamp for me at the crossroads on the Kalends. Farewell, and kiss Father for me, if he lets you.
>
> *Written on the 6th day before the Nones of May.*

**T3 — Graffiti in the Silver Pig** (`popina-vici-tusci`, scratched into the plaster by the counter; each line is a separate readable decal)
> VIBIA · CHRESTE · VINVM · NON · MISCET · MENTITVR
> *"Vibia Chreste doesn't water her wine." (Below, another hand:) "LIAR."*
>
> PRIMIGENIVS · IVCVNDAM · AMAT · IVCVNDA · PISTOREM
> *"Primigenius loves Iucunda. Iucunda loves the baker."*
>
> BVCCO · AS · AS · AS · AS · AS · (crossed out) · AS · AS
> *Chreste's tally of what Bucco owes. Two asses are still not crossed out.*
>
> SCVTARII · VINCVNT — (under it) — IN · TABERNA · TANTVM
> *"The scutarii win!" — "In the tavern, maybe."*
>
> QVI · HIC · MINXERIT · IRATAM · VENEREM · HABEAT
> *"Whoever pisses here, may Venus be angry with him."*

**T4 — Graffiti in the Ludus barracks** (`ludus-cellae`, cut into the cell walls)
> NEREVS · RET · V · XXXI
> *"Nereus, retiarius: 31 wins." (Beside it, a net drawn with a fish caught in it.)*
>
> AVCTVS · THR · XXX · V · XVIII · M · XI · ST · I
> *"Auctus, thraex: 30 bouts, 18 won, 11 spared, 1 draw." (V = won, M = spared, ST = left standing, after the Pompeian scoring, society §10.3.)*
>
> PVLLVS · MATRI · SALVTEM · PISTOR · SVM
> *"Pullus to his mother, greetings: I'm a baker."*
>
> DIZAS · MVS · FVR · EST
> *"Dizas the Mouse is a thief." (Someone has scratched a cloak next to it, and then scratched it out.)*
>
> TIRO · HODIE · CRAS · HEROS · POSTRIDIE · CINIS
> *"Today a recruit, tomorrow a hero, the day after, ash."*

**T5 — "On the Column", a lampoon** (chalked on the steps of the Basilica Julia, near Juvenal's usual place; `basilica-julia-gradus`, readable prop `prop-lampoon`; the vigiles wash it off at v1)
> *A hundred feet of Luna stone, and every foot a war:*
> *the river bridged, the forests felled, the hill-forts set alight;*
> *two thousand little soldiers marching round and round and upward,*
> *and not a single one of them has had his pay tonight.*
>
> *Look up, Quirites! Look up! It does the neck a kindness,*
> *and while you gape at heaven no one's watching where you're stepping.*
> *Up there the Dacian kneels for ever and the Emperor stands for ever;*
> *down here the landlord's always paid, the tenant always weeping.*
>
> *Inside, they say, a stairway turns, a hundred steps and more,*
> *with little slits to let the light in and to keep the weather out.*
> *Now there's a lodging for a client: dry, and high, and quiet.*
> *I'd rent it if I had the rent; and Caesar, I've no doubt,*
> *would charge me less than Callistus.*

(Juvenal, asked, says he has never seen it before in his life, and that the metre in the last line is a disgrace.)

**T6 — Curse tablet against the Greens** (`defixio-prasina`; found in `cir-01` and in tombs; a thin rolled lead sheet pierced by a nail)
> DEFIGO · EQVOS · PRASINOS · VICTOREM · AQVILAM · CERVVM · HILARVM
> LIGO · PEDES · CVRSVM · ANIMAM · EORVM
> NE · CVRRERE · NE · FLECTERE · AD · METAS · POSSINT
> VT · IN · CARCERIBVS · CADANT
> ET · AVRIGAM · HIERACEM · ET · OCVLOS · EIVS · ET · MANVS
> TE · ROGO · QVI · SVB · HAC · TERRA · IACES
> FAC · HODIE · HODIE · IAM · IAM · CITO · CITO
>
> *"I bind the horses of the Greens, Victor, Aquila, Cervus, Hilarus. I tie their feet, their running, their breath, so they cannot run, cannot turn at the turning-posts, so they fall in the starting-gates. And the driver Hierax, his eyes and his hands. I ask you, who lie under this earth: do it today, today, now, now, quickly, quickly."*

(Works only on those who learn of it, GDD §2.4 rule 5. Epaphra and Hierax are both superstitious: ×1.5.)

**T7 — Playbill for the games** (a painted notice, `dipinto`, on the plastered wall facing the Meta Sudans; another on the Circus north street) [G: the games themselves are invented]
> OB · DEDICATIONEM · COLVMNAE
> IMP · CAESARIS · NERVAE · TRAIANI · AVG · GERM · DACICI
> VENATIO · ET · PARIA · GLADIATORVM
> IN · AMPHITHEATRO · A · D · XV · K · IVN · ET · SEQVENTIBVS · DIEBVS
> VELA · ERVNT · SPARSIONES · ERVNT
> FELICITER
>
> *(Added below in red, in a smaller hand:)* NEREVS · RET · PVGNABIT
>
> *"For the dedication of the Column of the Emperor Caesar Nerva Trajan Augustus, conqueror of the Germans and the Dacians: a beast hunt and pairs of gladiators in the amphitheatre, on the 15th day before the Kalends of June (18 May) and the following days. There will be awnings. There will be sprinklings of perfume. Good luck to all!" — (below) "Nereus the retiarius will fight."*

**T8 — Vigiles fire notice** (painted on the wall of `excubitorium-velabri`, and copied at every compitum in the Velabrum)
> PRAEFECTVS · VIGILVM · EDICIT
> INQVILINI · AQVAM · IN · CENACVLO · PARATAM · HABENTO
> LVCERNAS · ET · FOCOS · NOCTV · NE · NEGLEGVNTO
> QVI · NEGLEXERIT · FVSTIBVS · CASTIGABITVR
> SI · INCENDIVM · VIDERIS · CLAMA · VIGILES · VOCA
>
> *"The Prefect of the Watch proclaims: Tenants shall keep water ready in their flats. They shall not leave lamps and hearths unattended at night. Whoever neglects this will be beaten with cudgels. If you see a fire, shout, and call the Watch."*
>
> *(Scrawled underneath:)* ET · QVIS · AQVAM · AD · QVARTVM · TABVLATVM · PORTABIT?
> *"And who's going to carry the water up to the fourth floor?"*

(The rules follow the prefect's powers as the *Digest* describes them, 1.15.3–4 [A, Severan text; the practice older, P].)

**T9 — The altar of the crossroads shrine** (`compitum-vici-tusci`, carved on the marble altar; Zethus points to it)
> LARIBVS · AVGVSTIS · ET · GENIO · CAESARIS
> MAGISTRI · VICI · TVSCI
> M · LVCRETIVS · ZETHVS · L · SEIVS · CERDO · Q · NAEVIVS · PHILOMVSVS · C · TITIVS · FAVSTVS
> ARAM · VETVSTATE · CONLAPSAM · DE · SVA · PECVNIA · RESTITVERVNT
> L · PVBLILIO · CELSO · II · C · CLODIO · CRISPINO · COS
>
> *"To the Lares Augusti and the Genius of Caesar. The magistrates of the Vicus Tuscus, M. Lucretius Zethus, L. Seius Cerdo, Q. Naevius Philomusus and C. Titius Faustus, restored at their own cost this altar, which had collapsed with age, in the consulship of L. Publilius Celsus (for the second time) and C. Clodius Crispinus."*

(Four *vicomagistri* per vicus is attested [A]. Cerdo the crier is one of them, which is why he keeps announcing it.)

**T10 — A lost-dog notice** (painted on the pier of the Basilica Paulli's shop row, `tabernae-aemiliae`)
> CANIS · MOLOSSA · NOMINE · HILARA
> ABERRAVIT · A · D · VIII · ID · MAI
> QVI · EAM · REDVXERIT · AD · TONSTRINAM · TRYPHONIS
> IN · TABERNIS · BASILICAE · PAVLLI
> ACCIPIET · HS · XX
>
> *"A Molossian bitch named Hilara went astray on the 8th day before the Ides of May (8 May). Whoever brings her back to Tryphon's barber's shop in the shops of the Basilica Paulli will receive 20 sesterces."* (A `rad-vicus` seed: Hilara lives with the stray pack behind the Circus, v0.2.)

**T11 — Fuscus' Lemuria tablet** (a wax tablet on the lararium of `insula-mariorum`)
> Midnight. Bare feet. No knots on you anywhere.
> Make the sign: thumb between the fingers.
> Wash the hands at the basin.
> Beans: the BLACK ones, in the blue jar. NOT Helpis' cooking beans.
> Throw them behind. Do not look back. Nine times:
> *haec ego mitto; his redimo meque meosque fabis.*
> Wash again. Strike the bronze. Nine times:
> *Manes exite paterni.*
> Then look back. Not before. NOT BEFORE.

(The rite is Ovid's, *Fasti* 5.429–44 [A]; the reminder, the knots, and the blue jar are Fuscus'.)

**T12 — The emperor's nativity** (`quest-genitura`; a single papyrus sheet, folded and sealed)
> GENITVRA
>
> A nativity cast by one who reads the heavens. The native was born at Italica in Baetica on the 14th day before the Kalends of October, when D. Iunius Silanus and Q. Haterius Antoninus were consuls, in the first hour after sunrise.
> The Sun in the Virgin. The Moon in the house of kings. Jupiter rising, which gives empire. Mars in the setting quarter, which gives victories in the West: see the Danube.
> Saturn stands in the eighth place, the place of endings, in an eastern sign.
> Therefore: he will rule long, fight much, and be called the best. His greatest glory and his last journey both lie in the East. Let him beware of water, and of the summer of his sixty-fourth year.
>
> *(At the foot, in a different hand, in Greek letters:)* ἀκριβῶς. *"Exactly."*

(Trajan was born on 18 September 53, *a.d. XIV Kal. Oct.*, in the consulship of D. Iunius Silanus Torquatus and Q. Haterius Antoninus [A]. The forecast is the astrologer's; the game never confirms it. Players who know that Trajan died at Selinus on the coast of Cilicia in August 117, in his 64th year, are welcome to shiver. The Greek annotation is Asclepiodotus' hand, a clue for The Eastern Gold.)

**T13 — The rules of the "burial club"** (`fullonica-suburana`, painted on a board by the door: the Cultores Lavernae's respectable front; readable in v0.2 as a copy Chrysis carries)
> LEX · COLLEGII · CVLTORVM · LAVERNAE
>
> Whoever wishes to join this club pays an entrance fee of one hundred sesterces and an amphora of good wine, and five asses on the Kalends of every month.
> To any member who has paid his dues for six months, the club grants three hundred sesterces for his funeral, and walks behind his bier.
> Members shall not quarrel at dinners. Whoever strikes another pays twenty sesterces; whoever insults the magister pays twelve; whoever insults Laverna pays nothing, because nobody does.
> Members shall not ask one another where anything came from.

(The money rules mimic the burial-club statutes of Lanuvium, AD 136 [A, later model; GDD §7.2 row 37]; the last two lines are the guild's own.)

---

## 8. AMBIENT CONTENT

### 8.1 Street barks

Barks are subtitled with a speaker label (GDD §4.5, §15.1); Latin interjections in italics with a gloss on first use. **Selection rule** [design]: an ambient NPC picks from its **district** pool (by day or night), its **class** pool and the **situational** pool (festival, reaction); never the same line twice within 10 game minutes in earshot; at most one bark every 8 real s within 15 m of the player. All lines are original (Juvenal and Martial set the voice, GDD §2.3). Named NPCs use their own barks (§2) first.

#### By district (day)

| District | Barks |
|---|---|
| `dist-forum-romanum` | "Three days the judges have slept through my case. Today they snored in my favour." · "Change! Denarii for sestertii, sestertii for asses, asses for nothing!" · "Who's the one in the purple? Don't point. Never point." · "I came to sue my brother-in-law and stayed for the gossip." · "A senator fell off the Rostra this morning. Pushed, they say. Tripped, I say." · "Tomorrow the whole city goes to Trajan's Forum. Today the whole city goes to the barber." (the eve, 11 May) · "Mind the steps. They're older than your grandfather and twice as slippery." |
| `dist-fora-imperialia` | "Garlands up, scaffolds down, and if anyone drops a hammer on Caesar, it wasn't me." · "A hundred feet. Hundred and eighty-five steps inside, they say. Don't ask how I know." · "Every soldier on it has a face. Mine would look better in marble." · "Dacian prisoners cut half this stone. Now they can watch themselves losing, all the way up." · "Mind the paint! It's for the gods, not your elbow!" · "Venus Genetrix gets her temple back tomorrow. My wife wants her kitchen back." |
| `dist-velia` | "Pearls! Red Sea pearls! Tears of the sea at the price of a farm!" · "Pepper from India, cinnamon from the end of the world, and change from me." · "The Colossus wears the Sun's face now. The old one had Nero's. I prefer the Sun's." · "Smell that? That's the Piperataria. You can't afford it, but breathing's free." · "Jewels for the lady, rings for the knight, glass for everyone else." |
| `dist-vallis-colossei` | "Nereus! Nereus! Thirty-one and never touched!" · "I sat behind a sailor at the last games. He rigged the awning and dripped on me all afternoon." · "My wife made me promise not to bet. So I promised." · "Drink from the Meta, citizen. The water's sweating for you." · "Hear that clacking? Wooden swords. They start at the first hour. I haven't slept past the second in three years." |
| `dist-circus-maximus` | "Greens for ever! Blues for the boneyard!" · "Your future, citizen? One denarius for the past, two for the future, five if you want it good." · "The gate drips on everyone: emperors, carters, me. Most democratic thing in Rome." · "They say Trajan made the Circus five thousand seats bigger, and still I stand." · "Figs! Figs from Caunus! Eat them before the races, cry after!" |
| `dist-velabrum-boarium` | "Oil! Sabine oil! Venafran for the rich!" · "Mind the cattle, mind the dung, mind your purse." · "Silk from the Seres, perfume from Arabia, rats from the river, all on one street." · "The Tiber's low this year. Thank the gods and the curators, in that order." · "Hercules grazed his cattle here once. He didn't pay the market tax either." · "Fishermen at dawn, dockers at noon, drunks at dusk. The Velabrum never sleeps alone." |
| `dist-capitolium`, `dist-palatium` | (guard) "Move along. The emperor's house is not a theatre." · (attendant) "Silence, citizens: the augur is watching the birds." · "Mind the sacred geese. They saved Rome once and they've never let anyone forget it." · "A triumph climbs these steps. I climb them with a sore knee." |

#### Night (all districts, v1–v4)

"Water in the flats! Lamps out! Water in the flats!" (vigiles) · "*Quis est?* Who's there? A citizen, at this hour? A brave one or a stupid one." (vigil) · "Out of the road! Lime for the Pantheon, and I don't stop for drunks!" (carter) · "Make way for a poet... no, wait, I'm going to be sick." (reveller) · "Shut that window! Don't throw it! Don't—" (a pot falls; Juvenal 3.268–77 as a vignette) · "Light! Who's got a light? My slave ran off with the lantern." · "Hush. Listen. That's the bakers starting, so it's the fourth watch. Go home." · "A cart ran over a man's foot on the Clivus. He's suing the mule."

#### Lemuria (11 May; the first elapsed day only)

"Black beans tonight. Nine handfuls. And don't look back, whatever you hear." · "The temples are shut. The gods don't want to see the dead, and the dead don't want to see the priests." · "My grandmother walks tonight. She'll want her good shawl back." · "Not a night to marry, not a night to sell, not a night to be out after the second watch." · "If someone calls your name tonight, don't answer. It's never a creditor. Usually."

#### By class

| Class | Barks |
|---|---|
| Elite (senators, equites, their wives) | "Clients at dawn, the Senate at the third hour, the baths at the ninth. Being important is exhausting." · "Carry me round the dung, not through it." · "Parthia is a question of honour. And of trade routes." · "Did you hear from Pliny? Nobody has, since winter." · "*Ecastor*, the price of a decent cook!" (women) |
| Plebs | "Bread's up a quadrans. War's coming, they say. Bread always knows first." · "Rent on the Kalends, dues on the Kalends, debts on the Kalends. I hate the Kalends." · "Did you see the elephant? There's no elephant. I just wanted you to look." · "Twenty years in the same flat and the stairs get longer every year." |
| Working women | "My husband's at the baths, my slave's at the market, I'm the only one working in this house." · "Mind your hands, citizen. My husband's a vigil and his brother's a gladiator." · "*Edepol*, if that fuller ruins one more palla, I'll full him." |
| Enslaved people | "Yes, master. Coming, master. Gone, master." · "Twelve years, and I've saved half my price. The other half is in the master's head." · "Don't look at me. If you look at me I'll have to talk, and if I talk I'll be late." |
| Freedmen and freedwomen | "I was a slave in Antioch. Now I own a shop in Rome. The gods have a sense of humour." · "My patron gets my respect and three days' work a year. He wants more of both." |
| Soldiers off duty | "*Commilito!* Were you at Tapae? Who wasn't." · "The East! Sand, Parthians and no wine. I miss it already." · "Pay's late, boots are tight, the optio has a vine stick. Life is good." |
| Foreign residents | (Greek) "Every Roman wants a Greek doctor and nobody wants a Greek neighbour." · (Syrian merchant) "Silk, glass, pepper: it all comes through Antioch, and Antioch doesn't care who's emperor." · (Dacian builder) "My grandfather's on that column. Third turn. The one who isn't running." · (Egyptian) "Isis heals, Rome taxes. Both are very thorough." |
| Rumours (popina, barber, idlers; one per NPC per day) | "They say Hadrian is still in Athens, playing the Greek." · "They say Tacitus is coming back from Asia to write us all into his book." · "No letters from Pliny in Bithynia since the winter. That's not like Pliny." · "Lusius Quietus' Moors are camped on the Campus, they say, eating raw horse." [rumour] · "There'll be games for the Column. Eighteen days, a hundred pairs. Or eight days and ten pairs. Someone's lying." · "The emperor walked through the Forum yesterday on his own feet, like a citizen. My cousin touched his cloak." |

#### Situational reactions

| Situation | Barks |
|---|---|
| Weapon drawn in a crowd | "Put that away! This is the Forum, not the arena!" · "Watch! Watch! Somebody's drawn steel!" |
| Player `sordidus` (GDD §14.8) | "Gods, you stink. Did you sleep in the Cloaca?" · "Wash first, talk after." |
| Player `lautus` | "Fresh from the baths? You smell like a rich man's dinner." |
| A woman in a toga (GDD §3.7) | (respectable) "A toga? On her? I know what that means." · (underworld, +5) "Nice toga, sweetheart. Business good?" |
| A man with a full beard (GDD §3.6) | "A philosopher! Somebody hide the wine." · "Mourning, friend? Who died?" |
| Hood up at night | "Hood up, eyes down: either a thief or a husband." |
| Crime witnessed (GDD §14.1) | "Thief! Thief! Watch, over here!" · "I saw that. Everybody saw that." |
| Player spared a yielded foe in public | "He spared him! *Mitte*, says the street!" (Fama +2 district) |
| The gladiatrix (female PC after `lud-01`) | "That's her! The one who fought Nereus!" · (matron) "Shameless. Magnificent. Shameless." |
| Fama ≥ 50 in the district | "*Salve*, [cognomen]!" (by name, GDD §3.4) |
| Daily omen (GDD §14.6) | Good: "An eagle on the right, citizen! Take it! *Omen accipio!*" · Bad: "You stumbled on the threshold. Go back in and come out again, quick. *Absit omen.*" |

### 8.2 Shrines and blessings (Pietas)

Pietas rules are GDD §14.6: daily prayer at a compitum **+5** (once per shrine per day) and the free **Lares favor** (`favor-larum`: +10% stamina regeneration for 2 game hours, its own slot); prayer at a temple with an offering **+10** and one **temple blessing** for 24 game hours (offering ≥ a `libum`, a pinch of `tus` or 1 den.); a festival rite **+25**. **On the Lemuria day** temple cellae are shut (no blessing, vow or patron choice); compita, the open-air shrines and the podium offices stay open (GDD §14.10, AC-18).

| Location ID | Shrine | Deity | Blessing / favour | Pietas | On the Lemuria | First in |
|---|---|---|---|---|---|---|
| `compitum-capenae`, `compitum-circi`, `compitum-vici-tusci`, `compitum-velabri`, `compitum-boarii`, `compitum-acili` | Crossroads shrines (*compita*) | Lares Compitales and the Genius of Caesar | `favor-larum` | +5 daily each | open | v0.1 (6 shrines; `compitum-acili` is the attested one) |
| `signum-vortumni` | Statue of Vortumnus | Vortumnus, god of change and exchange [A] | **proposal** `favor-vortumni` (Lares slot, 2 h): +3% sell prices at plebeian vendors; default `favor-larum` | +5 daily | open | v0.1 |
| `shrine-venus-cloacina` | Shrine of Venus Cloacina | Venus the Purifier [A: the Romans and Sabines purified themselves with myrtle here, Pliny *NH* 15.119] | **proposal** `favor-cloacinae`: praying removes `sordidus` once a day (a ritual purification; no `lautus`) | +5 daily | open | v0.1 |
| `lacus-juturnae` | Spring of Juturna | Juturna, healing waters; the Dioscuri watered their horses here [A] | **proposal**: drinking restores +10 HP and removes `sordidus` once a day | +5 daily | open | v0.1 |
| `volcanal` | Shrine of Vulcan | Vulcan | **proposal** `favor-volcani`: +10% fire resistance 2 h | +5 daily | open | v0.1 |
| `lacus-curtius` | Lacus Curtius | the old chasm; Romans threw coins into it for Augustus' health [A: Suet. *Aug.* 57] | **proposal**: toss 1 as. to re-roll today's bad omen once (GDD §14.6) | +5 daily | open | v0.1 |
| `janus-geminus` | Shrine of Janus Geminus | Janus; **the doors stand open** (war) [GDD §2.2] | none (bark: "Open for Parthia, they say. They were barely shut for Dacia.") | +5 daily | open | v0.1 |
| `temple-castor-pollux` | Aedes Castoris | Castor and Pollux | `benedictio-castores` (+5% move speed; +15% Equitatio XP) | +10 | **shut** (Philetus refuses; strongrooms open) | **v0.1-Must** (AC-18) |
| `temple-saturn` | Aedes Saturni | Saturn | `benedictio-saturnus` (+5% sell prices) | +10 | shut | v0.1 |
| `temple-vesta` | Aedes Vestae (forecourt; men may not enter) | Vesta | `benedictio-vesta` (+25% fire resistance; better rest) | +10 | shut | v0.1 |
| `temple-venus-genetrix` | Aedes Veneris Genetricis (festooned for 12 May) | Venus Genetrix | `benedictio-venus` (+10 persuasion); patron `patronus-venus` | +10 | shut | v0.1 (blessing from 12 May, v0.2) |
| `temple-mars-ultor` | Aedes Martis Ultoris | Mars Ultor | `benedictio-mars` (+10% melee damage); patron `patronus-mars` | +10 | shut | v0.1 |
| `temple-minerva-nerva` | Aedes Minervae | Minerva | `benedictio-minerva` (+15% XP Fabrica, Medicina, Locks & Seals); patron `patronus-minerva` | +10 | shut | v0.1 |
| `temple-jupiter-capitolinus` | Aedes Iovis O. M. | Jupiter | `benedictio-iuppiter` (−10% damage taken) | +10 | shut | v0.1 |
| `temple-magna-mater` | Aedes Matris Magnae | Magna Mater | `benedictio-magna-mater` (+15 max stamina) | +10 | shut | v0.1 |
| `temple-apollo-palatinus`, `temple-apollo-sosianus` | Temples of Apollo | Apollo | `benedictio-apollo` (+10% ranged damage) | +10 | shut | v0.1 / v0.1-Should |
| `ara-maxima` (men) · `temple-hercules-victor` (everyone) | Great Altar · Round Temple | Hercules | `benedictio-hercules` (+20 kg carry; +10% blunt); patron `patronus-hercules` | +10 | the open-air Ara Maxima stays open; the temple shuts | v0.1 |
| `temple-portunus` | Aedes Portuni | Portunus, god of harbours and keys | `benedictio-portunus` (lock zones +15%) | +10 | shut | v0.1 |
| `sant-omobono-temples` | Twin temples | Fortuna and Mater Matuta | `benedictio-fortuna` (+5% crits and luck); patron `patronus-fortuna` | +10 | shut | v0.1 |
| `temple-aesculapius` | Aedes Aesculapii | Aesculapius | `benedictio-aesculapius` (+50% remedy healing; cures disease); patron `patronus-aesculapius`; incubation (later) | +10 | shut | v0.1-Should / v0.2 |
| `colosseum` (shrine in the amphitheatre arcade) | Shrine of Nemesis | Nemesis | `benedictio-nemesis` (+25% crowd favor); patron `patronus-nemesis` | +10 | shut | v0.1 |
| `temple-mercury` (Atlas addition) | Aedes Mercurii | Mercury | patron `patronus-mercurius` (GDD); **proposal** `benedictio-mercurius` (+10% Mercatura XP) to fill the GDD's blessing gap | +10 | shut | v0.2 |

### 8.3 Festivals in the starting weeks (9 May – 15 June 113)

Dates per Ovid's *Fasti* and the calendars [A] (society §5). **Clamp:** v0.1 holds the date on 11 May; in v0.2 the date runs from 12 May to the eve of the 9 June anchor, so everything from 13 May to 8 June can happen (GDD §14.10). Festival effects fire on the first elapsed day carrying the date.

| Date | Roman date | Festival ID | What happens (in game) | Location IDs | Gameplay | Milestone |
|---|---|---|---|---|---|---|
| 9, 11, 13 May | a.d. VII / V / III Id. Mai. | `fest-lemuria` | Midnight bean rites in every house; temples shut; ghost glimpses at the edge of vision at night (§8.3.1) | homes, `insula-mariorum`, `insula-tuccii` | Temple cellae shut; `misc-lemuria-fabae`; `mq-03` | **v0.1** (11 May) |
| 12 May | a.d. IV Id. Mai. | `fest-columna` | Trajan rededicates the Temple of Venus Genetrix and dedicates the Column [A Venus; P/U Column day]; crowds in the Imperial Fora, sacrifices, praetorian cordons | `temple-venus-genetrix`, `column-trajan`, `forum-trajan` | `mq-04`; `misc-facies-columnae` expires | v0.2 |
| 14 May | pridie Id. Mai. | `fest-argei` | The Vestals throw 27 rush figures from the Bridge of Piles [A: Ovid 5.621ff] | `pons-sublicius`, `arca-argei` | `misc-argei`; festival rite +25 Pietas | v0.2 |
| 15 May | Id. Mai. | `fest-mercuralia` | Merchants sprinkle themselves at Mercury's spring; the anniversary of Mercury's temple [A] | `fons-mercurii`, `temple-mercury` | −10% prices at all vendors (GDD §7.4); `misc-mercuralia` | v0.2 |
| 18 May | a.d. XV Kal. Iun. | `fest-munus-columnae` **NEW** [G] | Games for the Column in the amphitheatre (the playbill T7): crowds in the Colosseum valley, fans, ticket touts, beast cages at the Ludus Matutinus | `colosseum`, `meta-sudans`, `ludus-magnus` | Colosseum valley band +1 for the day (festival riots, GDD §13.3); Ludus bouts pay ×1.5; Nereus fights (offstage) | v0.2 (ambience only; the arena floor comes in v0.4) |
| 21 May | a.d. XII Kal. Iun. | `fest-agonium-maium` **NEW** | Agonalia: the *rex sacrorum* sacrifices a ram [A, calendars] | `regia` | Ambient procession; +5 Pietas for watching quietly | v0.2 |
| 23 May | a.d. X Kal. Iun. | `fest-tubilustrium` **NEW** | Purification of the sacred trumpets, in the Hall of the Shoemakers [A: Varro *LL* 6.14; *atrium sutorium*] | `forum-romanum` area (procession) | Trumpet blasts at h3; bark: "Don't ask me why trumpets get dirty." | v0.2 |
| 25 May | a.d. VIII Kal. Iun. | `fest-fortuna-publica` **NEW** | Fortuna Publica on the Quirinal [A] | (offstage) | `benedictio-fortuna` lasts 36 h if received that day [design] | v0.2 |
| late May (moveable) | — | `fest-dea-dia` **NEW** | The Arval Brothers' festival of Dea Dia at their grove (5th milestone, Via Campana) [A, dates vary] | (offstage) | Rumour barks; vows for Trajan's safety | v0.2 |
| 1 Jun | Kal. Iun. | `fest-kalendae-iuniae` **NEW** | Carna's day: beans and bacon eaten for health (*Kalendae Fabariae*) [A: Ovid 6.101–182]; anniversaries of Juno Moneta and of the Temple of Mars outside the Porta Capena [A] | `temple-juno-moneta`, `porta-capena` (procession out to Mars' temple) | Rent due (GDD §14.11); popinae sell beans and bacon; +5 Pietas at Juno Moneta | v0.2 |
| 3 Jun | a.d. III Non. Iun. | `fest-bellona` **NEW** | Bellona's anniversary [A]; the war column before her temple (the fetial rite is **not** attested for Trajan [U]) | `temple-bellona`, `columna-bellica` | Rumour barks about the fetials | v0.2 (Forum Holitorium district: Should) |
| 4 Jun | pridie Non. Iun. | `fest-hercules-custos` **NEW** | Hercules the Guardian, by the Circus Flaminius [A] | (offstage) | — | — |
| 5 Jun | Non. Iun. | `fest-dius-fidius` **NEW** | Semo Sancus Dius Fidius, god of oaths [A] | (offstage) | Oaths sworn this day: Pietas −20 if broken (instead of −10) [design] | v0.2 |
| 7 Jun | a.d. VII Id. Iun. | `fest-ludi-piscatorii` **NEW** | Fishermen's games across the Tiber [A] | `portus-tiberinus` (bank) | Mergus and the divers compete; a small radiant swimming race (later) | v0.2 |
| 7–15 Jun (main day 9 Jun) | — | `fest-vestalia` (GDD) | Vesta's storeroom opened to barefoot matrons; bakers rest; donkeys garlanded with loaves | `temple-vesta`, bakeries | Bakeries closed (Philadelphus shut); `mq-10` (v0.6) | v0.2 (to 8 Jun), later |
| 11 Jun | a.d. III Id. Iun. | `fest-matralia` (GDD) | Matrons honour Mater Matuta at Sant'Omobono | `sant-omobono-temples` | Women's rite | later |
| 13–15 Jun | Id. Iun. – | `fest-quinquatrus-minores` (GDD) | Flute-players roam masked and drunk | everywhere | Street vignettes | later |

#### 8.3.1 Festival and city vignettes (tier-3 ambient, GDD §12.3)

| ID | Vignette | When / where | Milestone |
|---|---|---|---|
| `vig-lemuria-umbra` | **The ghost-glimpse**: a figure in a brown paenula at the far end of an alley or a gallery, seen for ≤ 2 s at the edge of vision, gone when approached or looked at directly; a cold draught sound; nothing in the journal (GDD §2.4). Natural lead available: the Velabrum is full of people in brown paenulae. | Lemuria nights after v2, once per night, Velabrum alleys, `vicus-tuscus` | **v0.1** (golden path step 5) |
| `vig-fabae` | A paterfamilias at a doorway throws beans over his shoulder; a bronze pot clangs | Lemuria nights, v3, 3 random doors | v0.1 |
| `vig-plaustrum` | A night cart with lime or marble grinds past; the carter swears; pedestrians press to the wall | v1–v4, `street-north-of-circus`, `vicus-tuscus`, `via-sacra` | v0.1 |
| `vig-vigiles-lucerna` | Two vigiles with a lantern call "Water in the flats!" | v1–v4 | v0.1 |
| `vig-matella` | A chamber pot emptied from a window (Juvenal 3.268–77); a near miss splashes `sordidus` within 1 m | insulae, any time, 1 in 20 passes under a window | v0.1 |
| `vig-sacrificium` | A small sacrifice at a crossroads: a cockerel, a flute-player, a vicomagister in the bordered toga | compita, h1–h2 | v0.1 |
| `vig-praeco` | Cerdo's announcements at the Rostra (radiant notices in voice) | `rostra`, h2–h6 | v0.1 |
| `vig-aleatores` | Dice on the Basilica Julia steps; everyone scatters when Dento walks past | `basilica-julia-gradus` | v0.1 |
| `vig-canis-botulus` | A dog steals a sausage from a stall; the seller gives chase | `forum-boarium`, `vicus-tuscus` | v0.1 |
| `vig-lectica` | A senator's litter with eight bearers forces the crowd aside | Forum, Sacra Via, h1–h4 | v0.1 |
| `vig-pompa-columnae` | Garlands being hung at the Forum of Trajan; workmen and a priest checking omens | `forum-trajan`, 11 May | v0.1 |
| `vig-traianus` | **Trajan on foot** with lictors and a togate cordon (§2.B) | `clivus-palatinus` → `forum-trajan`, 11 May h11 | v0.1-Should |
| `vig-velarium` | Misenum sailors drilling with ropes for the amphitheatre awning | `colosseum`, h2–h5 | v0.1 |
| `vig-rudis` | Wooden swords clacking from the Ludus; Glaucus' voice | `ludus-magnus`, h1–h6 | v0.1 |
| `vig-ruina` | A beam or a wine cask falls from a building-site crane; shouts (Juvenal 3.243–8) | building sites near the Imperial Fora | v0.1 |
| `vig-libaria` | Fortunata selling honey cakes to temple-goers at the shut doors | `temple-castor-pollux` | v0.1 |

### 8.4 Signage and inscriptions

Romans did not post street-name signs; places were found by landmarks and asking [P]. Signs are **painted shop signs, threshold mosaics, notices (dipinti) and inscriptions**. Displayed landmark names follow GDD §2.3 (Latin capitals with interpuncts, English below; attested names only).

| Where | Text (Latin) | English (shown below) | Kind |
|---|---|---|---|
| `popina-vici-tusci` | AD · PORCVM · ARGENTEVM (a painted silver pig) | "At the Silver Pig" | painted sign |
| `popina-vici-tusci`, counter | VINVM · AS · I · MELIVS · AS · II · FALERNVM · AS · IIII | "Wine 1 as · better 2 · Falernian 4" | painted price list (prices of GDD §7.2) |
| `taberna-armorum` | EVHODVS · ARMA · VENALIA · ET · REFECTA | "Euhodus: arms for sale, and repaired" | painted sign, with a painted gladius |
| `castor-loculi` door | LOCVLI · DEPOSITORVM | "Deposit vaults" | carved plaque |
| `temple-castor-pollux` (Lemuria) | (no sign) Philetus has hung a black wool fillet across the shut doors | — | prop |
| `tabernae-aemiliae` | TONSTRINA (with a painted razor and mirror) · MENSA · HERMOGENIS (with a painted coin) · MEDICVS (with a painted cupping vessel) | "Barber" · "Hermogenes' table" · "Physician" | painted signs |
| `seplasia-vici-tusci` | VNGVENTA · TVS · MYRRHA · NARDVS | "Perfumes, incense, myrrh, nard" | painted sign |
| `pistrinum-velabri` | PANIS · CALIDVS (a painted donkey turning a mill) | "Hot bread" | painted sign |
| `fullonica-velabri` | FVLLONES · ET · VLVLAM · CANO (an owl, Minerva's bird) | "I sing of fullers and the owl" (a fullers' joke) | graffito-style sign [the joke parodies a Pompeian graffito, CIL IV 9131] |
| `excubitorium-velabri` | COH · V · VIGILVM · EXCVBITORIVM | "Watch post of the 5th Cohort of the Vigiles" | painted, with the fire notice T8 |
| `statio-cohortium-urbanarum` | COH · X · VRB | "Tenth Urban Cohort" | painted |
| `ludus-magnus` gate | LVDVS · MAGNVS | "The Great School" | carved |
| `ludus-cellae` | (T4 graffiti) | | graffiti |
| `meta-sudans` wall | (T7 playbill) | | dipinto |
| Shop thresholds (random) | SALVE · · · CAVE · CANEM · · · LVCRVM · GAVDIVM | "Welcome" · "Beware of the dog" · "Profit is joy" | mosaic (conventional formulae [A]) |
| Alley corners (random) | CACATOR · CAVE · MALVM (with painted snakes) | "You who relieve yourself here: beware of bad luck" | warning dipinto (a conventional formula [A]) |
| `compitum-*` | T9 (Vicus Tuscus); others: LARIBVS · AVGVSTIS | "To the Lares Augusti" | carved altars |
| `circus-maximus` arcades | PRASINA · VINCIT · / · VENETA · VINCIT (overwritten in turns) | "Green wins! / Blue wins!" | faction graffiti |
| `astrologi-circi` | GENITVRAE · HIC · FIVNT | "Nativities cast here" | painted board (Zenon); Arruns' booth has a painted liver |
| `miliarium-aureum` | (no legible text) | — | **FLAG:** what the Golden Milestone carried is unknown (atlas builder note); show gilded bronze without letters |
| `column-trajan` base | (the real dedicatory inscription of 113, SENATVS · POPVLVSQVE · ROMANVS … [A, CIL VI 960]) | Lexicon translation | carved (historical; not original writing) |
| Discovery banners (GDD §15.1) | e.g. AEDES · CASTORIS · · · BASILICA · PAVLLI · · · AMPHITHEATRVM · · · CARCER · · · PORTA · CAPENA · · · COLVMNA · TRAIANI | "Temple of Castor and Pollux" · "Basilica Paulli (Aemilia)" · "Flavian Amphitheatre (Colosseum)" · "The Prison" · "Capena Gate" · "Trajan's Column" | UI |

---

## 9. OPEN QUESTIONS, CAVEATS AND SOURCES

### 9.1 Proposals that need an owner or GDD decision

| # | Proposal | Where | Default if nobody decides |
|---|---|---|---|
| 1 | Add the **Atlas additions** of §1 (48 spots and one proposed landmark, `temple-mercury`). Three are already referenced by code. | §1 | Add them as `SPOTS` with `confidence: 'low'`. |
| 2 | Two cabal members (**Euhodus**, **Hermogenes**) and a cabal agent (**Antigonus**) are ordinary vendors and NPCs from v0.1/v0.2, protected (essential) until their Act II cell resolves. | §2.D, §2.E | Keep: it seeds Act II and costs nothing. |
| 3 | `misc-facies-columnae` is **not re-offered** after 12 May (a carved face cannot recur), an exception to GDD §11.1. | §3.3.5 | The default "recut" ending applies silently. |
| 4 | A shortened `injured` (1 game hour) after a *lusio* knockout, instead of a game day, so the v0.1 golden path stays inside 35 minutes. | §3.2.1 | Keep for lusiones only. |
| 5 | Ludus fans greet the player by name after a `lud-01` finish with favor ≥ 70 (a local exception to the Fama > 50 greeting rule). | §3.2.1 | Keep, Colosseum valley only. |
| 6 | **Shrine favour variants** for the small Forum shrines (Vortumnus, Cloacina, Juturna, Volcanal, Lacus Curtius) using the Lares slot, and a missing **`benedictio-mercurius`**. | §8.2 | Without a decision every small shrine gives the standard `favor-larum`. |
| 7 | **New festival IDs** for the minor dates of 18 May – 7 June (`fest-munus-columnae` [G], `fest-agonium-maium`, `fest-tubilustrium`, `fest-fortuna-publica`, `fest-dea-dia`, `fest-kalendae-iuniae`, `fest-bellona`, `fest-hercules-custos`, `fest-dius-fidius`, `fest-ludi-piscatorii`). | §8.3 | Ambience only (barks and processions); no mechanics beyond those listed. |
| 8 | **18 new item IDs and 19 quest items** (marked **NEW** in §4; quest items in §4.14). | §4 | Add them to `src/rpg/data/items/*.ts`. |
| 9 | A `practice` sica (`sica-lusoria`) so Auctus fights to type in a lusio (the GDD lists only the rudis and the practice trident as *arma lusoria*). | §4.1 | Otherwise Auctus uses a `rudis` and loses his "hook" rule. |
| 10 | `mq-03` scripts the Lemuria rite itself, independent of the festival flag (festival effects fire only on the first elapsed day). | §3.1.3 | Keep. |
| 11 | Quest rewards use skill XP (`skillXp`, `skills`) and never `Reward.xp`, so character level still comes only from skill-ups (GDD §5.3). | §0.2 | Keep. |
| 12 | `cli-01`'s three door slaves (Philargyrus, "Iris", "Senex") and `vig-01`'s tenants (Dasius, Secunda) are minor extras without full roster entries. | §3.2 | Generate them from archetype templates. |

### 9.2 Historical caveats (flagged in the data)

- **Invented people in real offices** [G]: Gratus, Pudens, Vindex, Rufus, Celer (procurator), Verecundus, Proculus, Ursulus, the Vestalis Maxima "Cassia Lucilla" (the Vestals of 113 are unknown), and every vicomagister, aedituus and apparitor. Label them as invented in the Lexicon.
- **Uncertain presences** [U/P]: Juvenal in Rome (P; whether Satire 3 is already published is U, so he quotes nothing of it as famous); Suetonius' library posts in 113 (P); Soranus practising in Rome under Trajan (P); Apollodorus' age (U). Hadrian, Tacitus and Pliny never appear.
- **The Column dedication** on 12 May is P/U (sometimes 18 May): the playbill T7 puts the **games** on 18 May [G], which also covers the alternative date.
- **The Argei** fall on 14 May in Ovid (the day before the Ides) and on the Ides in Dionysius [U]; this file follows the GDD (14 May).
- **The Castor strongrooms:** the deposit use of the temple is attested by Juvenal 14.260–2 (written after 113) and the podium chambers by archaeology; their use in 113 is P.
- **Mithraic grades and the greeting "Nama"** are attested later [P]; the cell presents them as its own tradition (GDD §9.1).
- **The frumentarii** as secret police are attested only under Hadrian [A]; here they are "couriers with ears" (society §9).
- **The excubitorium of the Velabrum** is placed freely (the 14 sub-stations are unlocated [A]); the Trastevere excubitorium is later and is not used.
- **Executions in the Carcer under Trajan** (`misc-scalae-gemoniae`) are [G]: the practice (strangling state enemies in the Tullianum and showing the body on the Gemonian Stairs) is attested for earlier reigns [A]; Trajan's clemency makes it rare; the victim is a Dacian captive who plotted escape.
- **Fan parties** *scutarii* and *parmularii* are attested (Suet. *Dom.* 10; M. Aurelius *Med.* 1.5) [A]; their organisation in 113 is [G].
- **Coin moulds** for plated denarii are attested archaeologically [A]; the Argei puppet trick is [G].
- **Trajan's birth date** (18 Sep 53) and the consuls of 53 (D. Iunius Silanus Torquatus, Q. Haterius Antoninus) are [A]. The horoscope's forecast is fiction, never confirmed.
- **Positions** of `temple-mercury`, `compitum-acili`, `stabula-factionum` and `scalae-gemoniae` follow Platner & Ashby and Digital Augustan Rome but are `low` confidence (±50–150 m).

### 9.3 Sources used for this file (beyond the internal docs)

- Internal: `docs/GDD.md` v1.1 (all formulas, IDs, tiers, prices, factions); `src/data/atlas.ts` (landmark IDs and coordinates); `docs/research/society.md`, `game-design.md`, `architecture.md` §6; the existing data in `src/rpg/data/*.ts`, `src/npc/types.ts`, `src/quests/types.ts`, `src/dialogue/types.ts`, `src/actors/appearance.ts`.
- Platner & Ashby, *A Topographical Dictionary of Ancient Rome* (1929), LacusCurtius: "Aedes Mercurii" (on the Aventine slope facing the Circus, near its SE end; dedicated on the Ides of May), "Stabula IIII Factionum" (southern Campus Martius; the Greens near the Cancelleria), "Scalae Gemoniae" (probably along the Via di S. Pietro in Carcere).
- Digital Augustan Rome, "Compitum Acili", and it.wikipedia "Compitum Acili" (5 BC; excavated by Colini in 1932 north of the later Temple of Venus and Roma).
- Wikipedia, "Argei" (Ovid's 14 May vs Dionysius' Ides).
- Ovid, *Fasti* 5 (Lemuria 5.429–44, Argei 5.621ff, Mercuralia 5.663–92) and 6 (Kalends of June, Bellona, Hercules Custos, Dius Fidius, Ludi Piscatorii, Vestalia).
- Suetonius, *Iul.* 56 and *Aug.* 88 (Caesar's and Augustus' shift ciphers), *Aug.* 57 (coins in the Lacus Curtius), *Claud.* 25 (sick slaves on the Tiber Island), *Dom.* 4 (women fighting by torchlight), *Dom.* 10 (the parmularius).
- Pliny the Elder, *NH* 12.43 (false nard), 15.119 (myrtle purification at Venus Cloacina), 36.100 (no iron in the Pons Sublicius).
- Varro, *De Lingua Latina* 5.45–54 (the Argei chapels), 5.46 (Vortumnus), 6.14 (Tubilustrium in the *atrium sutorium*); Propertius 4.2 (Vortumnus).
- Festus s.v. *retiario* (the retiarius' chant); Marcus Aurelius, *Meditations* 1.5.
- *Digest* 1.15 (the prefect of the vigiles' powers) and 48.24.1 (bodies of the condemned given to kin); Gaius, *Institutes* 1.34 (Trajan's edict on Latin bakers).
- Juvenal, *Satires* 3 (the city), 14.260–2 (money deposited with Castor); CIL VI 718 (Alcimus), CIL VI 960 (the Column's inscription).
