# SKYROME: Game Design Research and Proposal

> **Status:** research draft v1, 2026-10-03. Written by the design-research agent for the owner and the dev agents.
> **Scope:** Part A looks at what makes the genre and its historical cousins work. Part B is a concrete proposal for SKYROME (Rome, AD 113 / 866 AUC).
> **Conventions:**
> - **[?]** marks a fact that is uncertain, reconstructed or debated. Check it before it becomes in-game text.
> - **[design]** marks an invented number or mechanic, as opposed to a historical claim.
> - Money: base unit is the **denarius**, matching `src/rpg/types.ts`. 1 den. = 4 sestertii (HS) = 16 asses. 1 aureus = 25 den.
> - Distances are in **game meters** (the real distance x 0.6 for layout) unless marked "real".
> - Controls follow the bindings already in `CLAUDE.md` and `src/core/Input.ts`: F attack, Q block, R ready, E interact, V view, C sneak, arrows look. B10 proposes only additions to these.

---

## 0. TL;DR

1. **What made Morrowind, Oblivion and Skyrim work:** a world you can see and walk to, something new every half-minute to a minute, and freedom of build, of faction and of order. Systems combine into stories: skills that grow by use, crime with witnesses, loot, radiant jobs and followers. Dungeons are built from modular kits, end with a boss and **loop back to the entrance**. **What failed:** level scaling (Oblivion), guilds with no consequences and no identity (you could lead them all), floaty melee, and radiant fetch quests that wear thin.
2. **What the historical games teach us.** AC Origins and Odyssey show how to build a crowded, living ancient city. Kingdom Come shows that grounded systems (clothing, reputation, literacy, lethal combat) are compelling. Ryse shows that spectacle without depth goes stale. Expeditions: Rome is a warning about *verisimilitude without accuracy*. Mount & Blade shows that emergent combat sustains a sandbox. Shadow of Rome had a great arena idea: **crowd favor as a resource**.
3. **Avoid mouse-direction combat for the owner's trackpad.** The directional systems of KCD and Mount & Blade read the mouse's movement direction, which a trackpad does badly. SKYROME should use the Skyrim verb set (light, power, block, bash) plus a timed parry, stamina and poise. All of it maps to keys.
4. **Pillars (B1):** *The City Is the Dungeon* · *Go Anywhere, Become Anyone, Within the Law* · *Steel, Stamina and the Crowd* · *Gods in the Margins* · *History Bends, Never Breaks*.
5. **Progression:** 17 use-based skills in three lines (Martial, Clandestine, Civic). The three pools are **Health, Stamina and Pietas**; Pietas is the grounded replacement for magicka. Social standing is tracked separately as **Dignitas** (legal rank), **Fama** (reputation per faction and district) and **Infamia** (social stain).
6. **Main quest, *Profectio*:** a conspiracy grows around Trajan's departure for the Parthian war. The player is a mid-level fixer. Every faction questline can crack one cell of the conspiracy, so the guilds feed the main plot. History's fixed points (Trajan leaves in autumn; Hadrian is not yet heir) are never broken.
7. **Seven faction lines:** Vigiles; Ludus Magnus and the arena; Urban Cohorts (with an invitation to the Praetorians); the Cultores Lavernae (a thieves' collegium in the Subura); a Mithraic cell; Clientela (patronage and the Senate); and the Circus factions. There are also radiant jobs and 48 misc quest seeds tied to real places and events of 113.
8. **Low-fantasy rule:** every "supernatural" effect has an in-world natural explanation, has modest mechanics, is never shown as visible magic, and is never confirmed.
9. **First playable slice (B11):** the Forum Romanum, the Velia, the Colosseum valley and the Ludus Magnus, with the Cloaca Maxima beneath, set on 11 May 113 (a Lemuria night, the eve of the Column's dedication). It runs 20–40 minutes and includes one arena bout with a missio choice, one sewer dungeon with a boss and a loopback, one crime-and-law loop, a level-up with a perk, and first- and third-person combat throughout.

---

# PART A: Analysis

## A1. The Bethesda open-world formula (Morrowind 2002, Oblivion 2006, Skyrim 2011)

### A1.1 "See that hill? You can go there."

- **Landmarks you can see from anywhere.** Skyrim's Throat of the World and Oblivion's White-Gold Tower are visible from most of the map, so the player always knows where they are and always has a distant goal. Disney calls this kind of landmark a *weenie*. Rome in 113 has many natural ones:
  - the gilded roof of **Jupiter Optimus Maximus** on the Capitol;
  - the **Amphitheatrum Flavium** (the Colosseum);
  - **Trajan's Column**, crowned with Trajan's gilt statue;
  - the Domitianic palace façade on the **Palatine**;
  - the **Colossus** (Nero's statue, by then Sol). In 113 it still stands on the Velia at the old Domus Aurea vestibule; Hadrian moved it next to the amphitheater only later, using 24 elephants (HA *Hadr.* 19). Note this for the atlas team;
  - the **Mausoleum of Augustus** with its tree-planted mound;
  - the scaffolded **Pantheon** of Agrippa, burned in 110 and being rebuilt.
- **Density, not size.** Players remember how often something happens, not how many square kilometers there are. The working target the owner cited, something interesting every ~30–60 s of travel, is a common designer heuristic for Bethesda worlds rather than a published Bethesda number **[?]**. At a jog of ~4 m/s it means a hook every **~120–240 game meters**. Rome's monumental core already beats that easily. The risk lies in the residential sprawl (Esquiline, Aventine, Trastevere, upper Campus Martius), which needs tier-2 and tier-3 content (B1, Pillar 1).
- **Interruptions.** Skyrim's random encounters, such as a courier with a letter, a giant fighting a bandit, or a thief who demands your gold, make even a known road feel alive. Rome supplies these naturally. Juvenal's third Satire (c. 110s) is practically a random-encounter table: collapsing insulae, fires, carts at night, drunken toughs, things dropped from windows.
- **Environmental storytelling.** A skeleton next to a journal and a bottle tells a story with no dialogue. This is cheap for a team with no artists, because it needs props and text, not cinematics.
- **Dungeon craft.** Joel Burgess and Nate Purkeypile described the method at GDC 2013 ("Level Design in a Day", "Skyrim's Modular Level Design"). Skyrim's art team built **seven modular kits**, from which the level designers made **400+ interior cells in about 2.5 years**. **Loopback layouts** send the player past the climax and back near the entrance through a one-way device, usually a drop. That removes the dead walk back out. *Both ideas suit a procedural, artist-less team: build a few kits well and let generation plus hand-placed story beats do the rest.*

### A1.2 Systems that generate stories

| Mechanic | Why it works | Bethesda precedent | SKYROME translation |
|---|---|---|---|
| Skills improve by use | Players become what they do, and no class lock-in means no regret | Skyrim's 18 skills; Morrowind's major/minor skills | 17 skills (B3); a perk point each level |
| Perk trees | Readable long-term goals and build identity | Skyrim constellations | Perks drawn as reliefs spiralling up a column (a nod to Trajan's Column) |
| Guardian / birth stones | A cheap, flavorful early choice | Skyrim's Warrior/Mage/Thief stones; Oblivion birthsigns | **Patron deity** chosen at a temple (B8) |
| Guild questlines | Long arcs with ranks, a home and a climax | Companions, Thieves Guild, Dark Brotherhood, College | 7 faction lines (B5.2) |
| Radiant quests | Endless content seeded by systems (Skyrim's Story Manager) | "Clear X", "steal Y", "kill Z" | Radiant jobs per faction, kept fresh by varying context and outcome (B5.3) |
| Crime and bounty | The world reacts and the law has teeth | Bounty per hold; jail costs skill progress | Separate jurisdictions by day and night, status-dependent punishment, condemnation to the ludus (B9.7) |
| Loot | Small dopamine hits, and a reason to enter dungeons | Leveled lists | Quality tiers named after real workshops, no enchantments (B9.2) |
| Crafting | Converts loot to power and time to mastery | Smithing, Alchemy, Enchanting | Fabrica, Medicina; cooking (no skill) |
| Followers | Company and tactical help | Lydia et al. | Freedman bodyguard, hired gladiator, Molossian hound (B9.5) |
| Houses | A place to belong, and a trophy display | Breezehome, Hearthfire | From a cenaculum to a domus (B9.4) |
| NPC schedules | A living world (Oblivion's Radiant AI) | Shops close and people sleep | **The Roman day** drives everything (Appendix D) |
| Fast travel | Respects the player's time | Morrowind's silt striders; Skyrim's map | Map travel plus diegetic litters and Tiber boats (B9.6) |

### A1.3 Where the formula breaks (lessons)

1. **Full level scaling breaks the fantasy.** In Oblivion, bandits in glass armor scaled to the player. Skyrim's fix was encounter zones with a level range that lock on first entry. *SKYROME: fixed difficulty bands per area and faction. A Subura tough stays a tough, and a Praetorian stays dangerous.*
2. **Guilds without consequence lack identity.** In Skyrim you can become Arch-Mage after a handful of spells and head of every guild at once. *SKYROME: let the player join everything, but put one or two hard crossroads where factions collide (for example, the Urban Cohorts versus the Cultores Lavernae). Gate top ranks on skill thresholds as Morrowind did.*
3. **Floaty melee.** Skyrim's combat came down to trading swings with weak hit reactions, and blocking was optional. *SKYROME: poise and stagger, a timed parry, real stamina pressure and lethal hits (B4).*
4. **Radiant fatigue.** "Go to a random dungeon and fetch X" gets old quickly. *SKYROME: radiant jobs vary the verb (protect, escort, arrest, deliver, sabotage), the outcome (spare, bribe, kill) and the place, and some of them escalate into authored quests.*
5. **Marker autopilot.** Morrowind's written directions forced players to look at the world. *SKYROME: markers on by default, with an optional "Morrowind mode" in which the journal gives Roman-style directions ("past the Temple of Saturn, down the Vicus Iugarius, the third taberna after the fountain").*
6. **One build dominates.** In Skyrim it was the stealth archer. *SKYROME: sling and bow are strong but loud in a crowded city. Sneak attacks in the streets draw witnesses, so stealth is a tool and not a solved game.*
7. **The economy breaks.** In Skyrim, smithing and enchanting loops made players rich and merchants ran out of coin. *SKYROME: you can only spend money on status (rank, houses, patronage, bribes), which soaks up a lot of it, and there are diminishing returns on crafting value.*

## A2. Historical-setting games: what they do well and badly

### Assassin's Creed Origins (2017, Ptolemaic Egypt, 49–43 BC) and Odyssey (2018, Peloponnesian War, 431 BC)
- **Strong:**
  - Dense crowds, markets, processions and temples. Ancient cities feel inhabited.
  - Climb-anywhere vistas.
  - The **Discovery Tour** (a no-combat education mode) was widely praised and gave the series credibility.
  - Odyssey's **Cult of Kosmos board**: a conspiracy shown as a grid of masked members unmasked one by one. It is a superb non-linear main-quest structure.
  - Odyssey's mercenary system: bounty hunters who escalate.
- **Weak:**
  - Level-gated enemies, gear-score loot treadmills and XP boosters sold in the store.
  - Maps carpeted with checklist icons.
  - Recycled side content.
  - The scale is inflated and the cities are thinned out to fill it.
- **Take for SKYROME:**
  - the **conspiracy board** (B5.1);
  - crowds that vary by district and time of day;
  - an in-game **Lexicon** with sources, a lightweight Discovery Tour;
  - a "hunted" escalation for high bounties, here the *fugitivarii* (B9.7).
- **Avoid:** level gates, gear score, and icon spam.

### Kingdom Come: Deliverance (2018) and KCD2 (Feb 2025), Bohemia 1403
- **Strong:**
  - Grounded systems that matter: clothing and dirt or blood affect how people react (charisma), literacy is a skill, reputation is local, and crime has witnesses.
  - Lethal, learnable melee.
  - Skills grow by use.
  - Kuttenberg in KCD2 shows a medieval city that feels believable at scale.
  - KCD2 cut attack directions to **four** (from five plus a stab) to ease the learning curve. Master strikes now apply to swords only.
- **Weak:**
  - Its early hours are punishing.
  - The save system (Saviour Schnapps) was controversial.
  - Combat is **directional, driven by the mouse's motion**.
- **Take:**
  - clothing and status as a social stat (the toga!);
  - bathing and cleanliness as charisma (a reason to visit the Baths of Trajan);
  - books that teach;
  - lethal but readable combat.
- **Avoid:**
  - restricted saves (use free saves plus autosave);
  - mouse-gesture combat, which is bad on a trackpad;
  - a brutal opening hour.

### Ryse: Son of Rome (2013, Crytek)
- **Strong:** spectacle, gorgeous Roman set dressing, and the crowd and arena sequences.
- **Weak:**
  - It is linear and leans on QTE executions, so combat becomes repetitive.
  - The history is fanciful (Nero, Boudica and York jumbled together).
- **Take:** weighty shield-and-gladius animation goals, shield bash and formation feel, and arena crowd reactions.
- **Avoid:** quick-time-event finishers as the main verb, and corridor levels.

### Expeditions: Rome (2022, Logic Artists): a turn-based tactical RPG of the Late Republic, with the player as a legatus
- **Strong:** writing, companions with approval, meaningful choices, convincing equipment, and Latin pronunciation.
- **Weak:** Bret Devereaux's critique on ACOUP, "Expeditions: Rome and the Perils of Verisimilitude", 2022.
  - It invests in *looking* accurate while being wrong about substance: political institutions, army organization, unpainted statues, and Cleopatra as an "exotic Eastern queen".
  - Players end up "knowing less than nothing".
- **Take, as a core principle:** *making claims to accuracy creates obligations.* SKYROME's Lexicon should cite sources. Inventions must be clearly fictional characters and plots, not false "facts". Statues and temples are **painted**.

### Mount & Blade: Warband (2010) and Bannerlord (2020 Early Access, 2022 release)
- **Strong:**
  - Emergent sandbox (renown, fiefs, armies).
  - Physics-based combat with momentum (couched lances, speed bonus).
  - Bannerlord's Calradic Empire is a thinly veiled late Rome.
- **Weak:** thin authored quests, a repetitive loop, directional combat **driven by mouse motion**, and little sense of place in its towns.
- **Take:** momentum-based damage (charges, sprint attacks), the speed bonus for the later mounted layer, and shield walls with allies.
- **Avoid:** content that is only systemic.

### Also relevant
- **Shadow of Rome (2005, Capcom).** The arena **salvo** system: flashy actions fill a crowd meter, and calling to the crowd when it is full makes them throw in rare weapons. Calling early may get you food or nothing. It is the best existing model for a Roman arena: **the crowd is an economy that pays for showmanship**. It also mixed in stealth sections, as a two-protagonist game.
- **The Forgotten City (2015 Skyrim mod; standalone in 2021, set in a cursed underground Roman city).** Investigation-first and dialogue-heavy, with a time loop, multiple endings and a "Golden Rule" ("if one sins, all are punished"). It shows how compelling Roman *moral and legal* puzzles can be. It is a 6–8 hour, mostly linear story by design.
- **The Witcher 3 contracts** are a useful model for Vigiles and Urban Cohort investigations: authored, investigation then fight, repeatable in feel.

### A2.1 The trackpad finding (important for the owner)
KCD and Mount & Blade decide the direction of an attack from the **direction the mouse moves**. On a MacBook trackpad that is unreliable and tiring: there are finger lifts, accidental taps, and keypresses held at the same time. There are also anecdotal reports that laptop palm rejection suppresses trackpad input while keys are held **[?]**. **SKYROME should choose Skyrim-style verbs** (light on tap, power on hold, block, bash) plus a **timed parry**, a **soft lock-on**, and directional power attacks chosen with **WASD**, not the mouse.

## A3. Rome inside Skyrim: the existing mods

| Mod | What it is | Notes |
|---|---|---|
| **The Forgotten City** (Modern Storyteller / Nick Pearce; mod released Oct 2015, standalone July 2021) | A narrative mystery mod with a time loop. The mod is set in Dwemer ruins in the Reach; the 2021 standalone moved it to a cursed underground **Roman** city | About 6–8 hours, story-driven, few open-world systems. Won an Australian Writers' Guild award (2016). **Most likely the mod the owner means by "linear and short"** **[?]** |
| **The City of Rome**, "A Historical Mod by M7" (Nexus 60907, Dec 2014) | Read a book at an "Imperial Roman History Center" in Winterhold and you are transported to a slice of Rome: arena (non-lethal fights), a temple, "Trajan's Baths", "Caesar's Palace", the Circus Maximus, a naval-battle room | A small visit or diorama, not a questline. Possibly the one the owner remembers **[?]** |
| **The Roman Conquest of Skyrim** (Skyrim SE Nexus 89819) | Reskins the Civil War as the Roman invasion of Britain, AD 43, with army patrols and commanding units | A battle sandbox, not a city RPG |
| Roman Empire (Nexus 62891), Imperial Roman Conversion (60287), Roman Imperial armor and weapons (10740), Historical Revival: The Roman Era, Companions of Rome | A settlement, reskins and equipment | Content packs |

**Takeaway:** nobody has made a *systemic, non-linear* Roman RPG of Rome itself. The appetite is shown (The Forgotten City's success, the many equipment mods), and the gap is real.

## A4. Synthesis: ten lessons we carry into Part B
1. Density beats acreage. Measure content per minute of travel.
2. Landmarks orient and lure. Keep sightlines to the big ones (the procedural city must protect them).
3. Systems that witness and remember (crime, reputation, clothing) beat scripted reactivity.
4. Guilds need identity *and* friction with each other.
5. Fixed difficulty bands, never full scaling.
6. Combat needs weight: poise, stagger, a parry, stamina and lethality. It must be playable on a trackpad.
7. Every dungeon needs a hook, three beats, a climax and a loopback.
8. Main plots should be boards of discoverable nodes with many routes, not a single corridor.
9. Accuracy is a promise. Invent people and plots, never "facts". Cite sources in-game.
10. Respect the player's time: free saves, optional markers, fast travel, and scalable difficulty.

---

# PART B: Proposal for SKYROME

## B1. Design pillars

1. **The City Is the Dungeon.** Rome in 113 is the world's densest, most layered adventure space: tombs, sewers, buried palaces, warehouses and rooftops lie above and below the streets. Content tiers (game meters, at a jog of about 4 m/s):
   - **Tier 1 landmark** (named, map-marked, discoverable; usually enterable or quest-bearing): one every **150–250 m** of travel, about **120–180 for the city**. That is comparable to Skyrim's few hundred map markers, packed into a smaller, denser area.
   - **Tier 2 minor POI**, every **40–80 m**. Examples:
     - a **compitum shrine** of the Lares at a crossroads (Rome had 265 *vici* with Lares shrines, per Pliny, *NH* 3.66, AD 73);
     - a street fountain (*lacus*; Agrippa alone built 700 basins, *NH* 36.121);
     - a taberna, popina, bakery or mill, fullonica, painted notice wall, or workshop.
   - **Tier 3 ambient vignette**, every **15–30 s**: barks, scuffles, processions, a cart at night, a dog stealing a sausage.
2. **Go Anywhere, Become Anyone, Within the Law.** No locked paths and no classes. Roman society is itself the gameplay: legal status, patronage, clothing and reputation open and close doors, and the player can climb, fall and climb again. Social mobility (plebeian, then client, then equestrian) is a progression track as real as swordsmanship.
3. **Steel, Stamina and the Crowd.** Combat is grounded, readable and lethal. It is skill-expressive through parry, poise and positioning, not mouse gestures. The arena turns combat into performance: **crowd favor** is a resource, and a beloved loser can be spared (*missio*).
4. **Gods in the Margins.** There is no magic, but belief has power. Omens, vows, curse tablets, mystery rites and ghosts on the Lemuria have modest, plausible mechanics and always allow a natural explanation (B8).
5. **History Bends, Never Breaks.** The setting is accurate to AD 113, and the protagonists, plots and most NPCs are fictional. Historical figures are *fixed stars*: the player orbits them and shapes their reputations and fortunes in small ways, but cannot kill Trajan or crown Hadrian early. This keeps later expansions (Ostia and Portus, the Parthian war, the provinces) coherent.

*Cross-cutting constraint: **built for the browser and the trackpad**. Every verb has a key, toggles replace holds when the player asks, difficulty and timing windows are adjustable, and the scope fits a team of AI agents with no artists (text dialogue, procedural kits).*

## B2. Character creation

### B2.1 Flow (under 3 minutes in the first slice)
1. **Origin**, which sets legal status, bonuses, starting gear, a unique opening hook and some unique dialogue.
2. **Gender.** Male or female; the choice is cosmetic plus contextual dialogue and is never a gate (B2.3).
3. **Name** with a Roman naming helper:
   - a citizen man takes *praenomen + nomen + cognomen* (e.g., *Marcus Ulpius Celer*);
   - a freedman takes the former owner's praenomen and nomen plus his own former name as cognomen;
   - a woman uses the feminine nomen (*Ulpia*) plus a cognomen;
   - a peregrine uses a single name plus a patronymic.
4. **Appearance** from procedural presets: face shape, skin, age band, hair, beard. Period notes:
   - Men in 113 are mostly **clean-shaven**. Hadrian made beards fashionable later, so a beard signals Greek, philosopher, mourner or foreigner, and NPCs react.
   - Elite women wear tall, layered Trajanic hairstyles (Plotina's portraits).
5. **Patron deity** is **not** picked here. You choose one at a temple in the first hour (B8.3), as Skyrim does with its Guardian Stones.

### B2.2 Origins

| Origin | Legal status | Starting bonuses (skills +10 / +5 / +5) | Trait | Opening hook / unique thread |
|---|---|---|---|---|
| **Civis Romanus (Subura-born plebeian)** | Citizen: toga, right of appeal | Rhetoric / Mercatura / Brawling | *Street-wise:* the home district's tier-2 POIs start revealed; locals barter better | An aunt's popina is being squeezed by a collegium |
| **Libertus / Liberta (freedman)** | Freed citizen with obligations to a patron (*operae*). Cannot hold office | Mercatura / Locks & Seals / Rhetoric | *Patron's shadow:* the former owner occasionally calls in a favor (a radiant quest). Very rich freedmen can later join the **Augustales** | Your manumission tablet is "lost". Prove your freedom (cf. the Herculaneum dispute over Petronia Iusta's free birth) |
| **Gallus / Galla (Narbonensis or Lugdunensis)** | Citizen (Narbonensis) or peregrine (choose) | Fabrica / Spear / Heavy Armor | *Gallic smith:* better repair and improvement results | A kinsman sells Gallic mail; a forgery ring is using his maker's mark |
| **Hispanus / Hispana (Baetica, Trajan's and Hadrian's homeland around Italica)** | Citizen | Blades / Rhetoric / Equitatio | *Caesar's countryman:* the Baetican senatorial clique is warmer. Bilbilis-steel blades are cheaper | A letter of introduction to a Hispanic senator, which leads straight into court politics |
| **Syrus / Syra (Antioch or Emesa)** | Peregrine | Archery & Sling / Mercatura / Medicina | *Archer of the East:* bow draw and stamina perk. During war preparations, some NPCs suspect "Easterners" | A Parthian silk merchant asks for "a small favor" |
| **Aegyptius / Aegyptia (Alexandria)** | Alexandrian citizen (an Egyptian needed Alexandrian citizenship *before* Roman: Pliny *Ep.* 10.5–7, the case of the physician Harpocras) | Medicina / Locks & Seals / Pietas | *Alexandrian learning:* reads Greek medical texts, and Isis devotees trust you | The Iseum Campense is missing a papyrus |
| **Afer / Afra (Africa Proconsularis or Mauretania)** | Citizen or peregrine | Spear / Athletics / Light Armor | *Beast-wise:* bonus against animals, so venatio work suits you. Lusius Quietus's Moorish cavalry gives Mauri a reputation | A shipment of leopards for the Ludus Matutinus has a crate missing |
| **Veteranus (discharged early with *missio causaria*, wounded in the Dacian wars)** | Citizen | Shield / Blades / Heavy Armor | *Old wound:* lower starting Athletics but +stagger resistance. Soldiers respect you, and you start with a discharge diploma | Your old centurion is in the city, too rich for his pay |
| **Dacus / Daca (a captive of 106, worked on Trajan's Forum, informally freed: a *Junian Latin*)** | Junian Latin, with a path to full citizenship through **6 years' service in the Vigiles** (lex Visellia, AD 24; the term was later cut to 3 years) **[?]** | Fabrica / Athletics / Blades (sica/falx) | *Survivor:* +poise when outnumbered. Some Romans sneer, and Dacian slaves trust you | Your people are carved on the new Column. A Dacian revenge cell wants your help. Main-quest relevant |
| **Equestrian fallen on hard times** | Citizen of equestrian birth who has lost the 400,000 HS census and the gold ring | Rhetoric / Equitatio / Blades | *Old name:* elite doors open once; debtors hound you | Win back the ring. This doubles as a personal arc to equestrian status |

Each origin starts with roughly 50–150 den. in coin, clothes suited to its status, and one signature item [design].

### B2.3 Gender: plausible roles with player freedom
Design rule: **no hard gates**. NPCs recognize unusual choices in their dialogue. Historical texture supports wide freedom:
- **Women in business** are well attested: tabernae, workshops, money-lending, property (e.g., Eumachia at Pompeii).
- **Medicae** (women physicians) appear in inscriptions.
- **Gladiatrices** were rare and sensational. Domitian staged women fighting by torchlight (Suet. *Dom.* 4). A relief from Halicarnassus (British Museum) shows "Amazon" and "Achillia" both released (*missae*). Septimius Severus banned female gladiators c. AD 200 (Dio 76.16), so in 113 they are legal but scandalous.

How each faction frames the player:

| Faction | Male PC framing | Female PC framing (same quests, different dialogue) |
|---|---|---|
| Vigiles | Recruit (*vigil*) | "Auxiliary" informer and fire-runner. Later, the tribune quietly gives her a real rank and the men grumble, then accept it |
| Ludus | Auctoratus | Gladiatrix. A sensation, so crowd favor gains more and Dignitas takes a bigger penalty |
| Urban Cohorts | Miles | A *delatrix*-style informant and agent of the urban prefect's office |
| Cultores Lavernae | Fur | Fur. Thieves don't care |
| Mithraic cell | Initiate | No women are attested in Mithraism. The Pater makes a deliberate exception ("Mithras judges the deed"), and some brothers object, which creates a sub-plot |
| Clientela / Senate | Cliens; can advocate in court | Cliens or patroness. Women were barred from pleading for others (the Carfania story), so the player wins cases through a male advocate whom she directs, as a puzzle variant |
| Circus | Charioteer | Charioteer under a hood, a disguise sub-plot, or an owner and trainer |

## B3. Skills and progression

### B3.1 Rules
- **Pools:** Health, Stamina and **Pietas** (`ResourceId` in `src/rpg/types.ts`). Each level, add +10 to one pool.
- **Skills** run 0–100 and rise by use (`useSkill`). Each skill level adds to character XP, and each character level gives **one perk point**.
- **Governing pool** (`SkillDef.attribute`): Martial skills feed Health or Stamina, Clandestine skills feed Stamina, and Civic skills feed Pietas or Health [design].
- **Trainers** (5 lessons per level, paid in denarii) and **skill books** (one-time +1 when read) make up the Skyrim pair. Books are excerpts of real Latin and Greek texts available by 113, in original translations: Celsus, Dioscorides, Frontinus (*Strategemata*, *De aquaeductu*), Onasander, Vitruvius, Martial, Pliny's letters. Vegetius is not on the list because he wrote around 400.
- **No level scaling** (A1.3): areas have bands.
- **Separate social tracks:**
  - **Dignitas**: legal rank, with steps *peregrinus/libertus*, *civis*, *cliens of note*, *eques*, and later *adlectus* (a DLC idea).
  - **Fama**: reputation per faction and per district.
  - **Infamia**: the legal and social stain of arena, stage or brothel work and of convictions. It affects senators and magistrates, and helps with the plebs and the underworld.

### B3.2 The 17 skills

| # | Skill (Latin) | Line | Covers | Improves by | Sample perks (5–8 per skill in the final tree) |
|---|---|---|---|---|---|
| 1 | **Blades** (*Gladius*) | Martial | gladius, spatha, pugio, sica; two-handed falx as a branch | Hitting with blades | *Punctim* (thrusts +25% vs mail) · *Pugio Draw* (instant off-hand dagger finisher on staggered foes) · *Sicarius* (sneak-attack x3 with daggers) · *Falx Hook* (two-handed falx pulls shields aside) |
| 2 | **Spear** (*Hasta*) | Martial | hasta, lancea, venabulum, trident; thrown pilum and javelins | Spear hits, both melee and thrown | *Long Reach* (+0.3 m) · *Pilum Volley* (thrown pilum sticks in a shield: −50% of the target's block) · *Venator* (+damage vs beasts) · *Brace* (a charging enemy impales itself) |
| 3 | **Archery & Sling** (*Arcus et Funda*) | Martial | composite bow, sling (lead *glandes*) | Ranged hits | *Steady Draw* · *Lead Shot* (sling stagger) · *Cretan Eye* (slower draw timer) · *Moving Shot* |
| 4 | **Shield** (*Scutum*) | Martial | scutum, clipeus, parma; blocking, bashing, parrying | Blocked damage, bashes, parries | *Umbo Strike* (power bash knocks down) · *Testudo* (block arrows from the front automatically) · *Timed Parry+* (wider window) · *Shield Wall* (allies adjacent: +block) |
| 5 | **Brawling** (*Pugilatus*) | Martial | fists, caestus, wrestling holds, clubs and cudgels (*fustis*); knockouts | Unarmed and blunt hits, knockouts | *Pankration* (grapple-throw) · *Caestus* (fist damage scales with skill) · *Subdue* (blunt KOs instead of kills) · *Fustis Discipline* (Urban-Cohort club stuns) |
| 6 | **Heavy Armor** (*Lorica*) | Martial | mail (hamata), scale (squamata), segmented plate (segmentata), muscle cuirass | Being hit while wearing heavy armor | *Well Fitted* (less stamina drain) · *Segmentata Drill* (poise +) · *Cingulum* (no penalty to sprint) |
| 7 | **Light Armor** (*Levis Armatura*) | Martial | leather, padded *subarmalis*, gladiator *manica* and greaves | Being hit while wearing light armor | *Gladiator's Manica* (sword arm can't be disarmed) · *Nimble* (dodge cost −30%) · *Padded* (−blunt damage) |
| 8 | **Athletics** (*Gymnastica*) | Clandestine | sprinting, mantling and climbing (ladders, ledges up to ~2 m), swimming the Tiber, falling | Distance sprinted, climbs, swims | *Second Wind* · *Roof-runner* (mantle cost −50%, no fall damage under 6 m) · *Swimmer* (Tiber current resistance) |
| 9 | **Stealth** (*Latebrae*) | Clandestine | sneaking, hiding in crowds, sneak attacks | Moving unseen near aware NPCs | *Crowd Blend* (stand in crowds to break line of sight) · *Night Walker* · *Silent Hobnails* (no caligae noise) · *Assassin's Pugio* |
| 10 | **Pickpocket** (*Furtum*) | Clandestine | theft from persons, planting items | Successful lifts | *Sector Zonarius* ("purse-cutter": cut whole purses) · *Plant Evidence* (main quest use) · *Crowd Cover* |
| 11 | **Locks & Seals** (*Claustra et Signa*) | Clandestine | **picking Roman locks; opening and resealing wax-sealed letters and tablets undetected; copying seal impressions** | Locks opened, seals forged | *Light Fingers* · *Reseal* (no trace) · *Forger* (craft a seal from an impression; lex Cornelia de falsis makes it a capital-grade crime) · *Tumbler Sense* |
| 12 | **Rhetoric** (*Eloquentia*) | Civic | persuade, intimidate, bribe, court cases, speeches, haggling dialogue | Successful checks; court and debate wins | *Exordium* (first check +) · *Clientela* (invoke your patron's name) · *Advocatus* (court "boss" debates) · *Laudatio* (crowd speeches) |
| 13 | **Mercatura** (Trade) | Civic | prices, fencing, investments in shops and maritime loans | Buying and selling value | *Nundinae* (better prices on market days) · *Fence* · *Faenus Nauticum* (invest in a cargo; risk and return later) |
| 14 | **Medicina** | Civic | bandaging, remedies (replaces alchemy), poisons and antidotes, diagnosis; healing followers | Brewing, treating, diagnosing | *Celsus' Method* (bandages also cure bleeding) · *Dioscorides* (+1 ingredient effect known) · *Theriac* (antidote) · *Soporific* (KO-poisons) |
| 15 | **Fabrica** (Smithing) | Civic | improving and repairing weapons and armor, casting lead shot, hobnails; forging from purchased iron | Crafting and improving | *Noric Steel* · *Bilbilis Temper* · *Armorer of the Legion* (repair in the field) · *Lead Caster* |
| 16 | **Pietas** | Civic | prayers, offerings, vows, rites, reading omens, festival bonuses | Rites performed, vows fulfilled, festivals honored | *Votum* (vow strength +) · *Augur's Eye* (omens are clearer) · *Lararium* (home rest bonus +) · *Pax Deorum* (+Pietas max) |
| 17 | **Equitatio** (Riding and Driving) | Civic | horse riding (outside the city), chariot driving (Circus) | Riding distance, races | *Quadriga* (team stamina) · *Hortator* · *Spina Hug* (tighter turns at the metae) |

Fixes and decisions:
- **Military texts:** Vegetius (c. 400) and Arrian's *Tactica* (136) are both too late. For in-game military books, use Frontinus and Onasander (both 1st century).
- **Blunt** weapons belong to **Brawling**, so the non-lethal toolkit lives in one tree.
- **Pilum and javelins** go under **Spear**. Bows and slings go under **Archery & Sling**.
- **Equitatio** is in the list because the Circus line uses it inside the city. Riding horses comes with the Latium expansion.

## B4. Combat design

### B4.1 Verbs and inputs (current bindings plus proposed additions)

| Verb | Input (existing) | Notes [design tuning starting points] |
|---|---|---|
| Light attack | **F** or click (tap) | Stamina 8–12. A 3-hit chain with weapon-specific timing |
| Power attack | **Hold F or the click for 0.35 s** | Stamina 25–35, high poise damage. **The direction comes from WASD** (Skyrim-style): forward = lunge, sideways = sweep, back = a step-back cut, none = overhead |
| Block | **Q** or right-click (hold); a **toggle option** in settings | Mitigation from the shield and skill; costs stamina per hit absorbed |
| Timed block / parry | Press **Q** within the window before a hit | Window: **0.18 s** normal, 0.30 easy, 0.40 "Tiro assist", 0.12 hard. A parry costs no stamina, staggers the attacker (light) and opens a **0.8 s riposte** for x2 damage or a finisher at low HP |
| Shield bash | **F while holding Q** | Stamina 20. Interrupts a power attack during its wind-up |
| Dodge / sidestep | *Proposed:* **Space while in combat stance** (weapon drawn and an enemy aware) + a WASD direction; with no direction, a backstep. Settings option: "Space always jumps" | Stamina 15, ~0.25 s displacement, **minimal i-frames (0.12 s)**. Moving out of the arc is the real defense |
| Soft lock-on | *Proposed:* **X** to toggle; tap again to cycle | Essential for trackpad players. It keeps the camera on the target, strafes when locked, and is skippable |
| Ranged | Hold **F** to draw the bow or whirl the sling; release to shoot. **Q** cancels | A thrown pilum or javelin is a hotbar item: select it, hold F to aim, release |
| Invoke deity | *Proposed:* **Z** (Skyrim's shout key) | Spends Pietas (B8.3) |
| Hotbar / quick items | *Proposed:* **1–8**; **G** opens a quick wheel | Bandages, food, thrown weapons, weapon sets |
| Yield / surrender | *Proposed:* **hold Y for 1 s** (needs an enemy who will accept it, e.g., in brawls, the arena or arrest) | B4.5 |

### B4.2 Core rules
- **Stamina.** 100 at the start. Regenerates 20/s after 0.8 s of not spending, and half as fast while blocking. At 0 stamina, a block **breaks** (guard broken, staggered).
- **Poise / stagger.** Every actor has poise (`CombatProfile`). Power attacks, bashes, blunt weapons and sling shot deal poise damage. When poise breaks, the actor staggers for 0.8–1.5 s, which is the window for finishers.
- **Three damage types:** cut, thrust and blunt, against four armor families. Starting matrix [design]:

| | Cut | Thrust | Blunt |
|---|---|---|---|
| Cloth | 1.0 | 1.0 | 1.0 |
| Padded / leather | 0.7 | 0.9 | 0.6 |
| Mail / scale | 0.4 | 0.8 | 0.8 |
| Segmentata / muscle | 0.3 | 0.6 | 0.7 |

  The *gladius* thrust doctrine therefore emerges on its own: in Roman training doctrine, the thrust beats the cut (Vegetius said so later; the Romans practiced it earlier).
- **Lethality.** On normal difficulty, an unarmored person dies to about 3–5 gladius hits and an armored soldier to 6–10. The same applies to the player. **No health regeneration in combat.** Out of combat, regeneration is slow. Bandages heal fast and stop **bleeding**, a damage-over-time effect from blades.
- **Injury (later):** a leg wound slows you and an arm wound weakens your attacks. A medicus or Medicina cures it.
- **Group fights.** **Attack tokens** allow at most 2 melee attackers engaged at once on normal (3 on hard). The others circle, throw or reposition. Ranged enemies seek cover.
- **Momentum** (from Mount & Blade): sprint attacks and charges get a small damage and poise bonus. This is the basis for the later mounted combat.

### B4.3 Non-lethal options (a pillar, and also historically resonant)
- **Subdue:** blunt weapons and fists knock people out instead of killing them. This gives the vigiles and Urban Cohorts a clean way to make arrests.
- **Yield** (enemies): below `yieldAt`, foes may drop their weapon and kneel. You choose:
  - **spare**: a bonus to Fama and Pietas;
  - **rob**;
  - **arrest**: only with a faction mandate;
  - **kill**: witnessed killings of yielded foes are a crime, and Pietas falls.
- **Yield** (player): brawls, arrests and arena bouts with missio allowed.
- **Missio** (arena): a downed gladiator raises a finger (*ad digitum*). Fight rules:
  - The editor decides, swayed by the **crowd-favor meter**.
  - The player can be spared on a loss if favor is high. **Losing does not mean game over in the arena when you have fought well.**
  - *Sine missione* (no quarter) was officially banned by Augustus, so it appears only at illegal underground fights.
  - The meaning of "thumbs down" (*pollice verso*) is debated. Use a crowd chant plus a gesture of the editor's hand, not a modern thumbs-down.

### B4.4 The arena as a progression track
**Ladder:**
1. **Ludus Magnus** practice arena. Its small cavea seats ~3,000 by common estimates **[?]**. It was rebuilt under Trajan after a fire in 107, and a tunnel linked it to the amphitheater's hypogeum.
2. **Funeral munera** at tombs on the Via Appia, private games; authentic to the earlier tradition and still practiced.
3. **Morning venatio** (beast hunts) with the **Ludus Matutinus**.
4. **Midday bouts** in the Amphitheatrum Flavium.
5. **The afternoon headline munus**.
6. **The farewell munus** before Trajan's departure. This occasion is **invented** **[design]**; the Dacian triumph of 107 lasted 123 days (Dio 68.15) and is a precedent for scale.

**Ranks** (shared with the faction line in B5.2):
- *tiro* (novice), then *veteranus* (after the first public fight);
- *palus* grades, up to **primus palus** (attested in inscriptions **[?]**);
- *rudiarius*, a retired champion granted the wooden *rudis*;
- *doctor* (trainer).

**A free volunteer is an *auctoratus*.** He swears to "be burned, bound, beaten and killed by the sword" (Petronius 117) and takes on **Infamia**.

**Crowd favor (the salvo idea from Shadow of Rome):**
- Raised by parries, finishers, sparing at the right moment, fighting to your gladiator type, and playing to the editor's box.
- Lowered by running, stalling and dirty tricks (unless the crowd loves a villain).
- **Full favor:** raise your arms (hold E toward the crowd) and the crowd throws gifts: coins, a better weapon, wine (heals). It also tips missio in your favor.
- **Gladiator pairings** follow historical match-ups: murmillo vs thraex or hoplomachus; secutor vs retiarius; eques vs eques. Choose your armatura, which fixes your arena kit and earns favor for fighting to type.

### B4.5 Enemy archetypes (summary; full list in B6)

| Archetype | Kit | Behavior | Counter |
|---|---|---|---|
| Grassator (mugger) | knife or club | Pairs at night; flees at low HP | Light armor, quick strikes, intimidation |
| Sicarius (assassin) | sica, poison | Ambushes out of crowds; feints | Lock-on, parry, Medicina antidote |
| Collegium bruiser | caestus or fustis | Grapples, knock-down | Dodge, then a power attack |
| Funditor (slinger) | sling | Keeps distance, high stagger | Close in behind a shield; use cover |
| Sagittarius (Syrian or Cretan archer) | composite bow | Uses cover and the high ground | Shield up and flank |
| Legionary / Urban cohort soldier | scutum, gladius, pilum | Volley at 20 m, then a shield push. Fights in formation with mutual cover | Break the formation: bash, flank, sling at the edges |
| Praetorian | oval shield, better armor | Coordinated, uses officer buffs | Kill or KO the officer first |
| Gladiator types | per armatura | B6 | B6 |
| Beasts | — | Charge, pounce, maul | Spear brace, terrain, cages |

### B4.6 Boss design patterns
Each boss uses at least three of these:
- a clear **telegraph** for every big attack;
- **phases** at 66% and 33% HP;
- an **arena hazard or tool** to exploit: sluice gates, trapdoors, lifts, fire, darkness, a crowd;
- an **adds** wave;
- a **rule-breaker** that forces a new behavior (a net, a falx that ignores shields, darkness);
- a **non-lethal resolution** where it fits the story.

## B5. Quest structure

### B5.1 Main quest: *Profectio* (working title, "The Departure")

**Premise (historical frame):**
- Spring 113. On **12 May** Trajan dedicates his **Column** and rededicates the **Temple of Venus Genetrix** in Caesar's Forum (Fasti Ostienses). His Forum and the Basilica Ulpia were dedicated in **January 112** (some sources say 113 **[?]**).
- The Parthian king **Osroes** has put his own candidate (Parthamasiris) on the Armenian throne, a casus belli. Trajan is preparing to leave for the East in **autumn 113**. Parthian envoys later meet him at **Athens**.
- Trajan has **no designated heir.** The likely candidates and players:
  - **Plotina** (the empress, Hadrian's patroness).
  - **Hadrian**, eponymous **archon of Athens in 112/13** and so probably *absent* from Rome **[?]**.
  - **P. Acilius Attianus**, Hadrian's former guardian and praetorian prefect from about 112 **[?]**.
  - The generals Trajan honored with statues in their lifetimes (Dio 68.16): **A. Cornelius Palma**, **L. Publilius Celsus** (**consul ordinarius in 113** with C. Clodius Crispinus) and **Q. Sosius Senecio**.
  - Hadrian's ambitious brother-in-law, **L. Julius Ursus Servianus** **[?]**.
- Dramatic irony: in 118 Hadrian had Palma, Celsus, Lusius Quietus and Avidius Nigrinus executed as alleged conspirators (the "four consulars").

**The plot (fictional, built around fixed points):**
- A cabal of **war profiteers**, a disgraced fictional senator (*Q. Valerius Asper* [design]), **Parthian money** and a **Dacian revenge cell** plans to strike at the departure ceremony.
- They carry a **forged adoption codicil** to produce in the chaos, and they plan to frame Plotina's and Hadrian's circle.
- The plot **cannot succeed**, because Trajan leaves in autumn (fixed). The questions are who exposes it, who is ruined, and who gets the credit.

**The player** is a mid-level fixer who is in the wrong place at the right time.

**Structure:** an **Odyssey-style conspiracy board** (*Tabula Coniuratorum*) with **4 cells × 3–4 masked members**. Each member can be unmasked by **at least two different routes**, usually a faction line or a skill route. That is how the guilds matter to the main plot.

| Cell | Members (fictional unless noted) | Example routes to unmask |
|---|---|---|
| **The Purse** (war contractors) | an army-grain contractor, an arms-dealer freedman, Valerius Asper | Mercatura audit of the Horrea ledgers · a Cultores Lavernae burglary · Vigiles evidence of arson-for-profit |
| **The Eastern Gold** (Parthian agents) | a silk and pepper merchant at the **Horrea Piperataria**, a Greek astrologer, a courier | Mithraic cell (the conspirators try to smear the Mithras cult as "Persian") · a Syrian-origin thread · Locks & Seals (reading letters) |
| **The Dacian Blades** | a falx champion, an informally freed builder, a ludus trainer | Ludus line · Vigiles · the Dacian-origin thread · mercy shown at the Column chase |
| **The Toga** (Roman ambition) | a senator, a praetorian centurion gone rogue, a scribe of the imperial chancery | Clientela (Senate) line · Urban Cohorts line · forging and planting letters |

**Acts:**

- **Act I, *Novus* (late April to mid May)**
  1. **"Madida Capena."** You arrive at night in a cart. Wheeled traffic was banned from the city by day (Tabula Heracleensis, the lex Iulia municipalis), so carts came in after dark. You pass under the dripping aqueduct at the **Porta Capena**, Juvenal's *madidam Capenam* (Sat. 3.11). An imperial courier is murdered at a roadside tomb, and you end up with his sealed tablet. *(Tutorial: movement, talking, the first fight.)*
  2. **"Carcer."** You are suspected and held in the **Carcer Tullianum**. One of three patrons intervenes (a soft alignment choice that is not exclusive).
  3. **"Lemuria"** (9, 11, 13 May). The courier's "ghost" is seen at his family's house. The investigation has an ambiguous outcome (B8).
  4. **"Columna"** (12 May): the dedication crowd in Trajan's Forum. An archer appears on the Basilica Ulpia roof and the chase runs **up the Column's internal spiral stair (185 steps) to the viewing platform**. You may spare the shooter, a Dacian, which opens the Dacian route.
  5. *Act end:* a prefect's agent makes you a **deniable investigator**. The board opens.

- **Act II, *Coniuratio* (June to August)**
  - Unmask members in any order. Cracking **3 of the 4 cells** unlocks Act III. The fourth cell, if left uncracked, shapes the finale: its members show up as extra enemies or traitors.
  - Set pieces:
    - **Vestalia** (7–15 June): a break-in at the temple storeroom, with the Palladium's secrecy at stake;
    - **Ludi Apollinares** (6–13 July): a theater riot used as a cover;
    - **Volcanalia** (23 Aug): an arson fire in the Subura as a diversion, a Vigiles set piece;
    - a Senate debate on war funding where your evidence matters.
  - **Midpoint twist:** the forged adoption codicil. The **"Pumpkins" scene** draws on Dio 69.4: Apollodorus of Damascus tells young Hadrian to "go away and draw your gourds". Apollodorus, the Forum's architect, becomes your ally. His contempt for Hadrian is a red herring that the conspirators exploit.

- **Act III, *Profectio* (September to October; calendar snap)**
  - **Ludi Romani** (4–19 Sept). Trajan's birthday is **18 Sept**.
  - The final ambush lies on the **Via Appia** among the tombs, along the route south toward Brundisium (Trajan's own **Via Traiana** from Beneventum opened in 109). You end where you began, at the Porta Capena.
  - **Allies appear based on the factions you completed** (Skyrim's Battle for Whiterun, but earned): vigiles with siphons, gladiators, Mithraic soldiers, Circus toughs, a client mob.
  - Multi-phase final fight against "the Sword of the cabal", a fictional ex-centurion.

**Endings** (all preserve history; each is stated in an epilogue that looks ahead to 117 and 118):

| Ending | You give the evidence to… | Result for you | Epilogue irony |
|---|---|---|---|
| **Fides** (loyal) | Trajan's council | Equestrian rank (gold ring) and Trajan's favor | Trajan sails; nothing about the succession is settled |
| **Prudentia** (Hadrianic) | Plotina and Attianus | Quiet patronage, a house on the Esquiline | The same papers help ruin the "marshals" in 118 |
| **Ambitio** (the marshals) | Palma and Celsus | Military commission (Parthian war DLC hook) | You backed the losing side of 118 |
| **Arcana** (keep it) | No one; you keep it as leverage | Master of secrets and an information network | Everyone fears you, and the knife may come later |
| **Exsilium** (fail-state) | — (the Praetorians thwart the plot without you) | You are blamed and relegated, and the game continues in **Ostia/Latium** | A new start in the next region (expansion hook) |

**Fixed-star rules:**
- **Trajan, Plotina, Hadrian, Attianus, Palma, Celsus, Senecio and Servianus are *essential*.** They can be disgraced, outwitted or angered, but never killed by the player.
- Trajan's departure always happens.

### B5.2 Faction questlines (7, plus candidates)
Each line has a home (HQ), ranks, 6–9 quests, a capstone boss, and a reward that changes how you play. Ranks require faction reputation (`FactionRank.minReputation`) **and** skill thresholds for the top ranks, the Morrowind lesson.

1. **Vigiles: the night watch and fire brigade**
   - **HQ:** the **station of the 5th Cohort on the Caelian** (Regio II), near Porta Capena, which ties into the opening **[?]**. The 5th Cohort probably covered Regiones I and II.
   - **Ranks:** *vigil*, then *sebaciarius* (torch-bearing night patrol), *siphonarius* (pump crew lead), *optio*, *centurio*, *tribunus*. Many rank titles are attested only in 3rd-century graffiti from the Trastevere excubitorium **[?]**.
   - **Quests:**
     - night patrols and burglars (*effractores*);
     - a bucket-chain and pump fire in a cenaculum;
     - corrupt *aquarii* who sell water during fires (water theft is real: Frontinus, *De aquaeductu* 75–76);
     - a landlord's arson-for-profit ring (a Crassus-style buyer of burning buildings);
     - a missing-child search through the Subura rooftops.
   - **Capstone:** the **Volcanalia fire** (multi-block). Rescue tenants, cut a firebreak, and beat the **Incendiarius** boss.
   - **Reward:** fire resistance perks, the station barracks bed, Vigiles allies in the main finale. Junian Latin PCs move toward **citizenship**.

2. **Ludus Magnus: the arena**
   - **HQ:** the **Ludus Magnus**, with the imperial procurator and a lanista NPC.
   - **Ranks:** *tiro*, *veteranus*, *quartus/tertius/secundus/primus palus*, *rudiarius*.
   - **Quests:**
     - training (each armatura has a drill);
     - a funeral munus on the Via Appia;
     - a venatio with the Ludus Matutinus;
     - pairs fights;
     - a rival's sabotage (a poisoned training sword);
     - **illegal *sine missione* fights in a hypogeum-adjacent cellar**;
     - the escaped bear;
     - a gladiator mutiny brewing. Precedent: gladiators at Praeneste tried to break out in 64 (Tac. *Ann.* 15.46).
   - **Capstone:** the **farewell munus** in the Amphitheatrum Flavium against the **Primus Palus**.
   - **Reward:** the *rudis* (freedom from your oath), huge Fama with the plebs, permanent Infamia, a gladiator follower.

3. **Urban Cohorts, with an invitation to the Praetorian *speculatores***
   - **HQ:** the **Castra Praetoria** (where the urban cohorts were also housed in this period) and the urban prefect's tribunal.
   - **Ranks:** *miles*, *tesserarius*, *optio*, *centurio*; capstone invitation to the **speculatores**, the Praetorian scouts and agents.
   - **Quests:**
     - a market riot at the Macellum;
     - a Blues-vs-Greens riot at the Circus;
     - escorting a witness to the Basilica Julia;
     - a raid on an illegal collegium. Trajan feared collegia as political clubs, refusing even a fire brigade for Nicomedia (Pliny *Ep.* 10.33–34);
     - hunting a sicarius.
   - **Crossroad:** raid the **Cultores Lavernae** HQ or warn them. This is mutually exclusive with that line's capstone.
   - **Capstone:** the **rogue centurion** in the Palatine cryptoporticus.
   - **Reward:** a legal mandate to arrest and subdue, a lower bounty from the law's view, and Praetorian allies.

4. **Cultores Lavernae: the Subura thieves' collegium (Thieves' Guild analogue)**
   - **Fiction:** Laverna was the Roman goddess of thieves and profit, with an altar by the **Porta Lavernalis** on the Aventine (Varro *LL* 5.163; Horace *Ep.* 1.16.60). The guild poses as a **funerary collegium**, a legal burial club, meeting behind a **fullonica** (laundry) off the Clivus Suburanus. Its real HQ is in a disused cistern below.
   - **Ranks:** *tiro*, *fur*, *sector zonarius* (purse-cutter, a real term), *effractor*, *magister* (collegia had *magistri*), *patronus*.
   - **Quests:**
     - pickpocketing in the Saepta Julia luxury market;
     - fencing through an Argiletum bookseller;
     - a domus burglary on the Esquiline;
     - forging seals;
     - rigging a race (drugged horses);
     - the **Horrea Piperataria pepper heist**;
     - selling the "dagger of Brutus" to a gullible collector (a con).
   - **Capstone:** the magister has sold the guild to the Urban Cohorts. Confront him in the **Cloaca** beneath the Subura.
   - **Reward:** rooftop routes, fences, a Laverna shrine (B8.3), stolen-goods trade.

5. **The Mithraic cell (the grounded secret society)**
   - **History:** Mithras is **new in Rome in 113**:
     - Statius mentions him around 80 (*Theb.* 1.719–720);
     - the earliest Roman monument is a dedication by **Alcimus**, slave steward of **Ti. Claudius Livianus**, Trajan's praetorian prefect from 101 (CIMRM 593/594, about 98–102). Whether Livianus still held the post in 113 is uncertain **[?]**;
     - most surviving Roman mithraea (Santa Prisca, San Clemente, Circus Maximus) are **later 2nd and 3rd century**.
   - **So:** a small, secret cell meeting in a **private building's cellar** fits 113 well.
   - **Ranks:** the seven grades *Corax, Nymphus, Miles, Leo, Perses, Heliodromus, Pater*. They are attested mainly from later evidence (the Felicissimus mosaic at Ostia, Jerome), so for 113 they are flagged as **reconstruction** **[?]**.
   - **Tension:** in a year of war with Parthia, a cult with a Persian-named god is suspect. The conspirators exploit that.
   - **Quests:**
     - an oath of silence;
     - an ordeal in darkness (the details are speculative and come from later, partly hostile sources, so keep them vague);
     - protecting a brother who is accused as a spy;
     - finding the actual informant inside the cell.
   - **Capstone:** a duel with the traitor **Heliodromus** in the spelaeum during a darkness rite.
   - **Reward:** an empire-wide brotherhood (caches and safe houses in later regions), the *Invictus* invocation (B8.3), and soldier allies.

6. **Clientela: patronage and the Senate**
   - **HQ:** your patron's domus. Choose one of three fictional houses:
     - a hawkish **Trajanic general's** family;
     - a **Baetican/Hispanic** clan aligned with Plotina;
     - an **old Italian** aristocrat who is skeptical of war costs.
   - **Ranks:** *cliens*, *amicus minor*, *amicus*, *procurator* (agent), *eques*.
   - **Daily loop:** the **salutatio** at dawn (radiant). Attend and receive the **sportula**, traditionally 100 *quadrantes* (Martial; Juvenal 1).
   - **Quests:**
     - escorting the patron to the Forum (*deductio*);
     - canvassing for the patron's son's praetorship (elections now take place in the Senate);
     - a **court case in the Basilica Julia** (the Centumviral court where Pliny pleaded), a Rhetoric "boss";
     - a **dinner party** mini-game about couch positions on the triclinium and their hierarchy;
     - recovering compromising letters.
   - **Capstone:** the Senate's war-funding debate. Your evidence decides a career.
   - **Reward:** **equestrian status**: gold ring, narrow stripe, seats in the 14 rows at the theater (lex Roscia). Census 400,000 HS = **100,000 den.**

7. **The Circus factions (Greens and Blues)**
   - **HQ:** the faction stables in the **Campus Martius**, Regio IX; the exact site is disputed **[?]**. In 113 there are four colors: Domitian's Purple and Gold died with him.
   - **Ranks:** *stable hand*, *sparsor* (water-thrower), *hortator* (encouraging rider), *agitator/auriga*, *miliarius* (a charioteer with 1,000 wins; a real honorific).
   - **Quests:**
     - horse care and spying;
     - **curse tablets aimed at horses** (*defixiones* in the Circus are a real genre; most surviving examples are later, but the practice is old);
     - betting and bribery;
     - Blues-vs-Greens riots (tied to the Urban Cohorts).
   - **Races:** 7 laps, a quadriga, rein and whip stamina, turning tight at the *metae*.
   - **Capstone:** the **Ludi Romani race** against a rival who rams and uses the whip.
   - **Reward:** prize money, a horse (for later regions), Fama.
   - **Note:** the famous Diocles raced from **122**, so he does not appear. Scorpus died around 95. All charioteers here are fictional.

**Candidate later factions:**
- **The Bibliotheca Ulpia scholars**, a College-of-Winterhold analogue: knowledge, engineering and medicine, with Apollodorus as engineer.
- **The Iseum Campense** (Isis).
- **The Asclepiads of the Tiber Island** (healers).
- **The Annona** grain merchants (Ostia).
- **The Equites Singulares** (horse guard).

### B5.3 Radiant jobs (repeatable, systemic)
Postings appear diegetically on **painted wall notices** (*dipinti/programmata*, as at Pompeii), at faction HQs, and from street NPCs.

| Giver | Job templates (verb · twist) |
|---|---|
| Vigiles | Night patrol (catch a burglar; **arrest or KO**) · fire call (save X tenants within a time limit) · find a fire-starter (clues lead to a radiant suspect) |
| Ludus | A bout of your armatura (random opponent type) · train a tiro (escort and spar) · recapture an escaped beast (spear or net) |
| Urban Cohorts | Bounty on a named criminal (alive pays double) · escort a cart of coin to the Fiscus · break up a brawl (non-lethal) |
| Cultores Lavernae | Burgle a domus (a noble house gives a bonus) · lift an item · pay protection or collect it · fence goods · **plant evidence** |
| Clientela | Carry a sealed letter (option to open and reseal it) · intimidate a debtor · fill seats for a recital · canvass voters |
| Circus | Exercise horses · scout a rival's stable · deliver a bribe |
| Temples | Fetch offerings · escort a procession · clear a desecrated shrine |
| Street | Retrieve stolen clothes at the baths · find a lost dog · settle a dice dispute |

**Freshness rules [design]:**
- Never repeat the same location twice in a row.
- Every third radiant job has a **complication**: an ambush, a double-cross, or a target who pleads with you.
- Each faction has **one escalation chain** in which three radiant jobs reveal an authored quest.

### B5.4 Misc quest seeds (48, rooted in AD 113)
1. **The face on the Column.** A sculptor swears a soldier on Trajan's Column has his face. Prove it before the 12 May dedication.
2. **Overdue at the Ulpia.** The Greek library wants a scroll back from a borrower who has died. His heirs are selling it.
3. **Thirsty pipes.** Someone is tapping the Aqua Traiana (opened 109) illegally. Find the corrupt *aquarius* (Frontinus describes such frauds).
4. **Pantheon dust.** A worker falls on the scaffold of Agrippa's burned Pantheon. The contractor (*redemptor*) is skimming lime from the concrete.
5. **The leaning insula.** Juvenal's nightmare: tenants say the walls crack. The landlord shrugs. Prove it before it falls.
6. **Grain tokens.** Forged *tesserae frumentariae* are circulating at the **Porticus Minucia**.
7. **Lead in the well.** A curse tablet found near the Circus targets a Green charioteer. Who wrote it?
8. **The beans of the Lemuria.** A paterfamilias's black beans keep vanishing on ghost night. Is it the ghost, or a slave feeding a family?
9. **The Argei.** On **14 May** the straw puppets are thrown from the **Pons Sublicius**. One splash was too heavy.
10. **No iron on the Sublician bridge.** The wooden bridge must contain no iron (Pliny *NH* 36.100). Someone has driven nails into it: sabotage or omen?
11. **Asclepius's abandoned.** A sick slave left on the **Tiber Island** recovers. Under Claudius's edict that makes him free (Suet. *Claud.* 25). Help him prove it.
12. **Leopard in the gardens.** A beast from the Ludus Matutinus is loose in the **Horti Maecenatis**.
13. **Bad garum.** Fish sauce is being adulterated at **Trajan's Markets**. (Do not call it "Via Biberatica": that street name is medieval.)
14. **Corinthian bronzes.** Fakes are on sale in the luxury stalls of the **Saepta Julia**.
15. **The pirate edition.** An unauthorized copy of a famous author is being sold in the **Argiletum**. Martial grumbled about such copyists.
16. **The forged will.** An inheritance case in the **Basilica Julia** before the Centumviri, decided under the lex Cornelia de falsis.
17. **Diploma on the wall.** A veteran's military diploma claims its master copy is "fixed on the wall behind the Temple of the Deified Augustus, near Minerva". Find it and expose a forgery ring.
18. **Horologium blues.** The great sundial meridian in the Campus Martius has been off for decades (Pliny *NH* 36.73). An astronomer wants proof, and an astrologer wants it hushed.
19. **The emperor's horoscope.** A Chaldaean is selling Trajan's horoscope, which is treason. Turn him in, protect him, or buy it.
20. **Floodwater.** A Tiber flood swamps the **Emporium** warehouses. Rescue amphorae, or loot them.
21. **The modest hill.** Oil merchants dump amphorae behind the Horrea Galbana (the young **Monte Testaccio**; most of its bulk is later **[?]**). A stamp-forgery scam.
22. **Naumachia rehearsal.** Sabotage at the **Naumachia of Trajan** (dedicated 109) beyond the river.
23. **The pantomime's mask.** A star dancer's mask is stolen before a show in the **Theatre of Pompey**. Fan factions riot.
24. **The Capitoline Games.** An athlete training in the **Stadium of Domitian** for the **Agon Capitolinus of 114** (held every 4 years since 86) is being slowly poisoned.
25. **The spear of the Fetiales.** The ceremonial spear for a possible declaration of war at the **Columna Bellica** by the Temple of Bellona has vanished. Whether Trajan used the fetial rite is unknown; Marcus Aurelius did in 178 **[?]**.
26. **Romulus's hut.** The thatched **Casa Romuli** on the Palatine catches fire, as it did repeatedly. Accident or omen?
27. **Gemonian stairs.** A family wants an executed man's body back from the stairs where Decebalus's head was shown in 106 (Dio 68.14).
28. **Sighs of the girls.** A matron's love letters to a gladiator ("the girls' heartthrob", a Pompeian graffito) are being used for blackmail.
29. **Moving day.** **1 July** is when rents fall due and leases change (Martial 12.32). Help a family flee a debt-collector with their bed on their backs.
30. **The deserter.** A recruit for the Parthian levy hides in the Subura. Turn him in or smuggle him to Ostia.
31. **Dacian hands.** Dacian captives building the **Baths of Trajan** ask you to smuggle out a family heirloom, or a man.
32. **The sacred chickens.** An augur's chickens won't eat before an auspice for the war. Someone has overfed them.
33. **The bath thief.** Clothes are stolen at the Baths of Trajan. The *capsarius* (cloakroom attendant) is in on it. British curse tablets complain of exactly this crime.
34. **A prodigy.** A two-headed calf is born at a farm near the Porta Esquilina. The pontiffs want it quiet; a preacher wants it public.
35. **Asylum at the statue.** A runaway slave clings to an imperial statue, a recognized refuge. The owner's men are coming.
36. **The anonymous libel.** An unsigned denunciation names a small house-church. Trajan's own rescript says anonymous accusations "have no place" (Pliny *Ep.* 10.97). Handle it with care: no catacombs and no martyr spectacle.
37. **The Jewish tax informer.** An informer extorts people over the *fiscus Iudaicus*, although Nerva curbed such abuses (*calumnia fisci Iudaici sublata* coins). Show restraint and respect.
38. **Colossus dare.** A youth bets he can climb the bronze **Colossus** on the Velia. An Athletics challenge, then a rescue.
39. **Meta Sudans brawl.** Fans of rival gladiators fight at the cone fountain by the amphitheater.
40. **Venus Cloacina.** Someone is hiding things in the drain under the Cloacina shrine in the Forum. This leads into the Cloaca Maxima (the vertical slice).
41. **Mausoleum noises.** The custodians of the **Mausoleum of Augustus** hear digging at night: tomb robbers.
42. **Pliny is dead?** News arrives c. 113 that Pliny the Younger has died in Bithynia **[?]**. A legacy for his freedmen (as his Comum inscription records) needs a courier.
43. **The physician's rival.** **Soranus of Ephesus** practiced in Rome under Trajan and Hadrian (Suda) **[?]**. A quack is selling "Soranus-approved" cures. Galen is *not* yet born (129).
44. **Theriac.** A merchant sells fake Mithridatium. Track down a real recipe (Andromachus, Nero's physician, improved it).
45. **Incubation.** Sleep in the precinct of Aesculapius to dream a cure for a feverish child. The dream is ambiguous (B8).
46. **The dagger of Brutus.** A collector buys "the pugio of the Ides" (Fabrica can expose the fake).
47. **Plotina's Epicureans.** The empress protects the Epicureans (her later letter for the Athenian school, 121). Find a lost Philodemus roll for her circle.
48. **Market-day mule.** On market day (*nundinae*, every 8th day), a country trader's mule is stolen.

## B6. Enemies and bosses for Rome

### B6.1 Rosters by district and band [design bands]

| Band | Enemies | Where |
|---|---|---|
| 1 (streets) | grassatores (muggers), drunk toughs, dogs, collegium bruisers, beggar gangs | Subura, Velabrum by night, riverbank |
| 2 (underworld) | sicarii, effractores (burglars), smugglers at the river wharves, sewer dwellers, tomb robbers | Cloaca, Emporium, Via Appia |
| 3 (professionals) | gladiators by armatura, venatores with dogs, deserters, cult fanatics | Ludus, hypogeum, Mithraeum, quarries |
| 4 (elite) | rogue Praetorians, Dacian falx-men, Parthian agents, the cabal's veterans | Palatine, Domus Aurea, main-quest sites |
| Beasts | dogs (Molossian), boar, bear, leopard, lion, bull, **crocodile** (Augustus showed crocodiles in Rome), snakes (in tombs). **Rats** are a swarm hazard, not an enemy | Arena, escaped animals, sewer |

**Gladiator types for 113:**
- **Murmillo:** large shield, tanky.
- **Thraex:** curved sica and small *parmula*. Hooks around your shield.
- **Hoplomachus:** spear plus dagger, small round shield. Long reach.
- **Secutor:** smooth helmet. Pursues; limited vision means he hunts by sound, so flank him.
- **Retiarius:** net and trident, no armor, fast.
- **Provocator.**
- **Eques:** starts mounted.
- **Essedarius:** chariot fighter.
- **Sagittarius** **[?]**.
- **Dimachaerus** (two swords): attested only in later inscriptions **[?]**, so use sparingly.

**Rule:** villains are individuals and cells, **never whole religions or peoples**.

### B6.2 Bosses

| Boss | Arena | Mechanics (telegraph · phases · tool · rule-breaker) | Non-lethal resolution |
|---|---|---|---|
| **Rex Cloacae**, a sewer gang lord | Cloaca Maxima junction chamber | Fights alongside 4 lookouts and a slinger on a ledge. At 50% he raises a **sluice**, and the floodwater pushes everyone; ride the current or grab a chain | Open the sluice to flush out his gang, and he surrenders |
| **The Crocodile** (*Suchus*), an escaped exhibit | A flooded Cloaca bay | A **death-roll grab** (mash bash or stamina to escape). It is fast in water and slow on walkways, so fight from the walkways | Net it with a borrowed retiarius net and return it to the Ludus Matutinus for a reward |
| **Retiarius champion** | Ludus Magnus arena | **Net throw**: dodge, or be entangled and cut free. Trident reach, high mobility, crowd-pleasing feints | Missio: spare him with high crowd favor |
| **Murmillo and Thraex pair** | Amphitheater, midday | One holds the shield wall while the other flanks. Separate them with the lifts and trapdoors | Missio |
| **The Bear of the Hypogeum** | Colosseum underground | Charges. Use the **lifts and cages** to trap it, and close the trapdoors | Cage it, for a Ludus reward |
| **Primus Palus** (arena capstone) | Amphitheater, headline fight | A **learning boss**: tracks your most-used attack and starts parrying it. Phase 2 switches weapons | Grant or receive missio |
| **The Incendiarius** | A burning insula during the Volcanalia | Throws **pitch pots** (fire zones). The fire spreads per floor and floors collapse on timers. Vigiles allies with siphons | Subdue him and drag him out, as an arrest |
| **The rogue centurion** (*Vitis*) | Palatine cryptoporticus | Commands a 4-man **testudo**. His vine staff (*vitis*) rallies them (a buff). Break it with bash, sling and flank, and he duels once alone | Disarm him; he yields to an officer's order if you carry a mandate |
| **The traitor Heliodromus** | Mithraeum (spelaeum) | **Darkness phase**: lamps go out, so fight by sound and torchlight. Then the "sun" moment, when the lamps are relit, for a duel in full light | Expose him to the Pater, who exiles him |
| **The Dacian falx champion** | Domus Aurea's buried halls | The two-handed **falx ignores shields**; only dodge works. Heavy telegraphed sweeps; he is fighting for his dead king | Spare him and he becomes a possible follower (a Dacian-origin bonus scene) |
| **The tomb-robber king** | Tufa quarries (arenaria) off the Via Appia | Tunnels he knows and you don't. **Collapsing galleries**, traps, a chase phase, then a stand in a columbarium | Cut him a deal (he knows the cabal's tomb route) |
| **The Sicaria** (cabal assassin) | City streets, then the Column stair | A **reverse anonymity hunt**: she stalks you in crowds and you spot her by tells (no crowd reaction, a hand inside her cloak). Then a duel in a confined spiral | Unmask and arrest her |
| **The rival charioteer** | Circus Maximus | A race boss: rams, whips, cuts in at the metae, and rides a cursed-tablet horse (a rumor) | Win cleanly, or let a bribe decide (Infamia) |
| **The Sword of the cabal** (main-quest finale) | Via Appia tombs | Phase 1: archers on tomb roofs while your faction allies fight. Phase 2: a shield duel. Phase 3: he wrecks a monument and fights among the rubble | Capture him for trial, which changes the ending flavor |

## B7. Dungeons and interiors

### B7.1 Rules
- **Size classes:**
  - **S**: 5–10 min, 1 cell;
  - **M**: 10–20 min, 2 cells;
  - **L**: 20–40 min, 3+ cells with a mid-boss.
- **Every dungeon has:**
  - a hook;
  - an **environmental story** (a body with a wax tablet, abandoned tools, graffiti);
  - three beats (exploration, a combat spike, a puzzle or traversal);
  - a climax;
  - a **reward chest**;
  - a **loopback**: a one-way drop, a lift, a gate you unbar from the far side, or a manhole back to the street.
- **Interiors are separate "cells"** behind doors, as in Skyrim. That keeps browser performance manageable.

**Proposed procedural kits** (Skyrim had 7; the generators produce variations, and the designers place story beats):
1. **Cloaca**: vaulted channel, walkways, junctions, manholes, sluices, outfalls.
2. **Hypogeum**: corridors, cages, lifts, trapdoors, ramps.
3. **Tomb**: columbarium niches, sarcophagi, stairs down, painted vaults.
4. **Cryptoporticus**: long vaulted corridors with stucco and light wells.
5. **Horrea**: rooms around a court, ramps, stacked amphorae and sacks.
6. **Insula**: shops, stairs, cenacula; *burned* variants.
7. **Quarry**: irregular tufa galleries, pillars, collapses.

### B7.2 Locations (with notes on accuracy for 113)

| Dungeon | Accuracy notes | Type / size | Contents | Loopback |
|---|---|---|---|---|
| **Cloaca Maxima** | The great drain under the Forum, from the Argiletum to the Velabrum and the Tiber outfall by the Pons Aemilius. Agrippa reputedly sailed through it (33 BC). Entry from the **Shrine of Venus Cloacina** in the Forum | Cloaca kit · M | Sewer thieves, rats (hazard), Rex Cloacae, the crocodile (optional) | A manhole grate by the Basilica Aemilia, unbarred from below |
| **Colosseum hypogeum** | Domitianic underground with lifts and trapdoors; linked by **tunnel to the Ludus Magnus** | Hypogeum · M/L | Beasts, handlers, illegal fights | A lift up to the arena floor |
| **Carcer Tullianum** | The state prison at the foot of the Capitol. **Don't call it "Mamertine"**, a medieval name | Prison · S | An escape sequence (if arrested) or an interrogation | Up through a drain shaft to the Clivus Argentarius |
| **Mithraeum** | A cellar in a private building (B5.2, 5). Not a known site, so it is fictional by design | Shrine · S | Darkness rite, the traitor duel | A secret stair to the insula's light well |
| **Via Appia tombs and columbaria** | Large 1st-century columbaria (Vigna Codini, Pomponius Hylas), the Tomb of the Scipios, Caecilia Metella's drum. **No Christian catacombs as such.** Jewish and pagan hypogea are later or uncertain **[?]**. Tomb violation was a crime | Tomb · M | Tomb robbers, snakes, the cabal's arms cache | Up to a tomb roof, then a drop to the road |
| **Domus Aurea, buried halls** | Nero's Esquiline wing was filled in as foundations for the **Baths of Trajan** (opened 109) after a fire in 104. Painted vaults survive under rubble, so it is a perfect "lost palace" | Cryptoporticus/insula hybrid · L | Squatters, the Dacian falx champion, Neronian frescoes (lore) | A service shaft up into the baths' cisterns (the Sette Sale) **[?]** |
| **Horrea Piperataria** | Domitian's spice warehouses on the Velia (later under the Basilica of Maxentius); exists in 113 | Horrea · M | Pepper heist, guards, ledgers | A loading ramp and gate onto the Via Sacra |
| **Horrea Galbana / Emporium** | Giant warehouses by the river (Testaccio area) | Horrea · M | Smugglers, flood events | A wharf drop into the Tiber (swim) |
| **Palatine cryptoporticus** | The Neronian covered corridor linking the palace complexes | Cryptoporticus · M | Rogue centurion, Praetorian intrigue | A stair up into the Domus Tiberiana gardens |
| **Burned-out insula** | Fires were constant (Juvenal 3). Trajan reportedly capped building heights at **60 Roman feet (~17.8 m)** (Epit. de Caes. 13.13) **[?]** | Insula (burned) · S/M | Scavengers, collapsing floors, a trapped family | Jump down to the neighbor's roof |
| **Arenaria (tufa and pozzolana quarries)** | Ancient quarries along the Via Appia and Via Salaria. Later reused for catacombs, but in 113 they are working or abandoned quarries | Quarry · L | Tomb-robber king, collapses, a lost worker | A collapse opens a shaft back near the entrance |
| **Aqueduct specus** (bonus) | The Aqua Claudia and Anio Novus arcades; maintenance access by manholes | Linear traversal · S | Water thieves, a high walk with vistas | A ladder down an arch pier |
| **Pantheon construction site** (bonus) | Agrippa's temple, burned in 110. Rebuilding began under Trajan (brick stamps) and was finished under Hadrian **[?]** | Vertical scaffolds · S | A chase, a fall-hazard puzzle | Ropes down |
| **Castra Praetoria cells** (bonus) | The guard camp of 23 BC; its walls were later raised by Aurelian (but the walls of 113 are the original lower ones) | Prison/barracks · S | An interrogation, a breakout | A drain to the moat |

## B8. Low-fantasy rules: the "Ambiguity Contract"

### B8.1 Five rules
1. **Two explanations.** Every uncanny event has an in-world natural explanation that a careful player can find or infer: smoke, a drugged cup, a living person, chance, psychology.
2. **No visible magic.** No glows, no particles from hands, no projectiles. A blessing *feels* like a gust, a bird call or the sun breaking through clouds.
3. **Modest numbers.** Mechanical effects stay within what confidence, luck or medicine could plausibly do: about **±5–25%**, for short durations.
4. **Never confirm.** Neither the journal nor the Lexicon ever says "the ghost was real". Skeptical NPCs (Epicureans, followers of Lucretius) and believers both get dialogue.
5. **Belief has power, and that is a mechanic.** For example, **a curse tablet only harms a target who *learns* of it**: the rumor spreads over N days, and it hits superstitious NPCs harder.

### B8.2 What is allowed

| Allowed (ambiguous) | How it works |
|---|---|
| **Omens** (augury, lightning, eagles, stumbling at the threshold) | Thunder **on the left** is favorable in Roman augury. A morning omen gives a small daily modifier (±5% crit, prices or detection). Omens in quests are designer hints |
| **Haruspicy and augurs' readings** | A paid "reading" phrases true quest-state hints in ambiguous language (a hint system) |
| **Curse tablets** (*defixiones*) | Write a lead tablet, nail it, and deposit it in a grave, well or spring. It affects the target only through belief (B8.1, rule 5). Protective amulets (the bulla; charms against the evil eye) negate it |
| **Vows** (*vota*) | "If I survive this fight, I will dedicate X." You get a modest buff now. Fulfil the vow (*votum solvit libens merito*) or take the "ill-omened" debuff |
| **Astrology** | Buy a horoscope for a daily fated bonus or penalty. Casting the emperor's horoscope is treason |
| **Dreams and incubation** | Sleeping at Aesculapius's precinct gives a cryptic hint dream |
| **Mystery-cult visions** | Scripted sequences with plausible causes: darkness, fasting, chanting, wine, sudden light |
| **Ghosts** (Lemuria, tombs) | Seen only at night and at the edge of vision, never in combat. They vanish when approached. Each case has a mundane lead, plus one detail that stays unexplained |
| **Prodigies** (two-headed calf, statues that "sweat") | Social events: the pontiffs expiate, and rumors shift prices and crowd moods |
| **"Mythic" arena spectacles** | Condemned men are forced into mythological roles (Martial's *Book of Spectacles*). Costume and stagecraft, handled tastefully |

**Not allowed:** fireballs and spell projectiles; summoning; walking dead; resurrection; levitation; invisibility; shapeshifting; real monsters (no harpies, minotaurs or cyclopes, except as costumes); dragons.

### B8.3 Pietas, the "magic" system
- **The Pietas pool** (`ResourceId 'pietas'`) does **not** regenerate over time. It refills through **devotion**:
  - daily prayer at a shrine;
  - offerings (incense, wine, cakes, paid sacrifices at temples);
  - fulfilling vows;
  - joining festivals;
  - resting at your home **lararium**.
- **Shrine blessings** (Skyrim-style) last one game day, one at a time. **Compitum shrines** are everywhere (265 vici), which makes them the city's wayshrines.
- **Patron deity:** choose one at that god's temple (re-choosing has a cost). It gives a passive bonus and an **invocation** on **Z** that costs Pietas [design numbers]:

| Deity (temple) | Passive | Invocation (Z) |
|---|---|---|
| **Mars Ultor** (Forum of Augustus) | +10% stamina regen in combat | *Furor*: power attacks cost no stamina for 10 s |
| **Minerva** (Forum of Nerva) | +10% XP for Fabrica and Medicina | *Clarity*: enemy telegraphs stand out more clearly for 15 s |
| **Mercurius** (by the Circus Maximus) | Better prices | *Swift*: sprinting costs no stamina for 20 s |
| **Fortuna** (Fortuna Huiusce Diei, Campus Martius) | +5% crit and luck rolls | *Fortune's Turn*: the next lock, lift or persuasion roll succeeds |
| **Hercules** (Ara Maxima, Forum Boarium) | +carry weight | *Labor*: immune to stagger for 10 s |
| **Venus Genetrix** (rededicated 12 May 113) | +Rhetoric with the charmed | *Charis*: +25 Rhetoric for one conversation |
| **Diana** (Aventine) | Better at night and with bows | *Keen*: hear hidden enemies (sound pings) for 30 s |
| **Aesculapius** (Tiber Island) | +bandage healing | *Salus*: heal 50% over 10 s |
| **Laverna** (Porta Lavernalis; via the Cultores) | Quieter steps | *Shade*: silent footsteps for 30 s |
| **Nemesis** (the amphitheater shrines) | +crowd-favor gain | *Retribution*: +damage against your last attacker |
| **Mithras** (via the cell) | +poise | *Invictus*: once per day, stay at 1 HP instead of dying |
| **Isis** (Iseum Campense) | Cure ailments when you pray | *Salvation*: cure poison and bleeding |

- **Impiety:** desecration, killing in a temple, robbing tombs or breaking vows gives the "ill-omened" state. NPCs become uneasy and a small debuff applies. Cure it with an expiation (*piaculum*: a fee plus a rite).

## B9. Economy, loot, crafting, housing, followers, mounts, travel, law

### B9.1 Money and price anchors
- **Coins in 113:** aureus, denarius, sestertius, dupondius, as, semis, quadrans.

| Anchor | Value | Source / note |
|---|---|---|
| Legionary pay | 300 den./year | Domitian's raise |
| Sportula (daily client dole) | 100 quadrantes = 6¼ HS ≈ 1.56 den. | Martial; Juvenal 1 |
| Cheap wine | 1 as a cup; "for four, Falernian" | The famous Pompeii/Herculaneum price graffito **[?]** for the exact site |
| Modest rent | Up to ~2,000 HS (500 den.) a year was "modest" in Caesar's day | Suet. *Iul.* 38 |
| Equestrian census | 400,000 HS = 100,000 den. | — |
| Senatorial census | 1,000,000 HS = 250,000 den. | — |

- **Game economy [design]:** compress, don't simulate. Use monthly rents (40–150 den.), weapons at 15–200 den., armor at 50–800 den., and arena purses of 20–2,000 den. The equestrian ring is a long-term goal, met through **patronage plus a fee plus a census check**, at a game-scale census of about 25,000 den. [design].
- **Money sinks:** rent, bribes, offerings, patronage gifts, legal fees, house purchases, followers' wages, fines.

### B9.2 Loot
- **No enchantments.** Value comes from:
  - **quality tiers** named after real makers and materials: *iron*, then **Noric steel** (*ferrum Noricum*), then **Bilbilis steel** (Martial's hometown in Hispania, famous for blades), then *officer's silvered* pieces, then **named uniques**;
  - **condition**;
  - **provenance** (stolen goods are flagged; `ItemStack.stolenFrom`).
- **Valuables:** silver plate, Arretine and terra sigillata ware, glass, gems, **pepper**, purple dye, papyrus rolls (books are collectibles that teach), inscribed lead **sling bullets**.
- **Unique items:**
  - the *Primus Palus's gladius*;
  - a Dacian *falx*;
  - a centurion's *vitis* (vine staff: +stagger against soldiers);
  - a thraex's *manica*;
  - a "dagger of Brutus", which is a fake (Fabrica reveals it).
- **Equipment correct for 113:**
  - Pompeii-type **gladius**, cavalry **spatha**, **pugio**;
  - **lorica segmentata**, **hamata** and **squamata** (all appear on Trajan's Column);
  - Imperial Gallic and Italic helmets, some with **cross-braces** added in the Dacian wars;
  - **curved rectangular scutum**, oval *clipeus* for auxiliaries;
  - **hobnailed caligae**.
- **No stirrups** (Romans did not have them; use four-horned saddles). **Horseshoes:** only *hipposandals*.

### B9.3 Crafting
- **Fabrica** works at a *fabrica* (forge) or *officina* (workbench). You **improve** gear at the grindstone or bench, **repair** it (a light condition system), **cast lead shot**, and forge from bought iron. There is no mining in the city.
- **Medicina** works at a medicus's table or with a mortar:
  - **Ingredients** come from Dioscorides and Celsus: poppy, mandragora, garlic, honey, vinegar (*posca*), myrrh, frankincense, wormwood, hellebore.
  - **Remedies:** bandage, poultice, eye-salve (*collyrium*; real oculists' stamps exist), Mithridatium and theriac (antidote), soporific.
  - **Poisons:** aconite, hemlock, yew.
  - **Discovery:** learn an effect by tasting, as in Skyrim, or by reading Dioscorides.
- **Cooking** needs no skill: posca, puls, bread, garum dishes and cena platters give small buffs. **Food is not mandatory.**
- **Bathing:** cleanliness and blood or dirt affect Rhetoric (the KCD lesson). A visit to the **Baths of Trajan** or any *balneum* resets it, which also makes the baths social hubs with quest-givers.

### B9.4 Housing ladder

| Step | Where | How | Features |
|---|---|---|---|
| A pallet behind a taberna (*pergula*) | Your origin's district | Free and cramped | Bed, one chest |
| **Cenaculum** (upper-floor flat) | Subura or Aventine insula | Rent due monthly; **1 July** is the traditional lease day | Bed, chests, lararium. Risk of fire and collapse events |
| Ground-floor apartment | Esquiline or Quirinal insula | Higher rent | Safer, with a workshop slot |
| **Domus** | Caelian, Esquiline or Aventine | Purchase, plus a patron's or faction's approval | Atrium, peristyle garden (herb plot), library (book display), trophy room, forge or medicus room, staff |
| *Villa suburbana* | Outside the walls (expansion) | — | Stables (horses), farm income |

**Staff and slavery policy** (the owner should confirm, B12):
- Enslaved people exist in the world, as is historically necessary, and are depicted honestly.
- The player is **never required to own slaves**. A domus comes staffed by **paid freedmen**, or you can **manumit** inherited household slaves, which gives Pietas and Fama.
- Quests let you help people gain freedom.

### B9.5 Followers
- **Limit:** one human plus one animal (Skyrim's rule).

| Follower | Recruit | Specialty |
|---|---|---|
| Freedman bodyguard (a Syrian ex-boxer) | Hire at a popina | Brawler; intimidation bonus |
| Hired gladiator | Rent from the lanista (daily fee), or a Ludus reward | Tank. Crowds recognize him |
| Discharged veteran (optio) | Veteran origin, or a quest | Shield wall; good with formation enemies |
| Cretan archer | Through the Circus or Urban Cohorts | Ranged support |
| **Medica** | A Tiber Island quest | Heals you and cures bleeding |
| Street kid "guide" | A Subura quest | Reveals tier-2 POIs nearby and knows the shortcuts |
| **Nomenclator** (a freedman who knows everyone's name) | A Clientela reward | **UI perk: shows NPC names, factions and patron links in the HUD** |
| Molossian hound | A bought pup or a rescued dog | Tracking and an attack dog |

### B9.6 Mounts and travel
- **Inside the city:** no riding.
  - Wheeled traffic is banned by day (the Tabula Heracleensis allows exceptions for public building work, temples and processions), so carts fill the streets at night, an atmospheric touch.
  - Horses are stabled at the gates. Inside, travel is by **litter** (*lectica*, hired at stands by the fora) or **Tiber boat**. Both are diegetic fast travel between discovered points.
  - Map fast travel to discovered landmarks is **on by default**. An option, "lectica only", is available for immersion.
- **Outside the city** (expansion): horses, mules and carriages (*cisium*, *raeda*), with speed and stamina tied to Equitatio.

### B9.7 Law, crime and social standing
- **Jurisdictions:**
  - **Vigiles** at night: burglary, fire, street violence;
  - **Urban Cohorts** by day: riots, theft, murder;
  - **Praetorians**: the palace and treason.
- **Crimes** need **witnesses** (a line of sight plus an alarm radius) and produce a **bounty** per jurisdiction.
- **When caught:**
  - **Pay** the fine (your patron may lower it).
  - **Prison** in the Carcer: time passes and skill progress is lost, as in Skyrim.
  - **Flee.**
  - **Fight**: the bounty rises.
  - **Seek asylum** at an imperial statue or temple, which buys time.
- **Severe sentences:**
  - **condemnation to the ludus** (*ad ludum*), an alternative entry into the arena line that ends when you win your freedom;
  - **relegation**, temporary exile from Rome that sends you to Latium (expansion).
  - Status matters: high Dignitas and citizenship soften the sentence. The formal *honestiores/humiliores* divide is still emerging in this period **[?]**.
- **High bounty:** **fugitivarii**, professional slave-catchers and trackers hired by your enemies, hunt you (the Odyssey mercenary lesson).
- **Status crimes:**
  - wearing a **toga** without citizenship (Claudius beheaded usurpers of citizenship: Suet. *Claud.* 25);
  - wearing an equestrian ring without the rank;
  - forging seals.
- **The toga** is required at the salutatio and in court. It boosts Rhetoric with the elite but is hot and slows you (an Athletics penalty). Augustus wanted citizens in togas in the Forum (Suet. *Aug.* 40).

## B10. Controls and UX (keyboard and Mac trackpad)

### B10.1 Bindings
**Existing**, from `src/core/Input.ts`:

| Key | Action |
|---|---|
| W/A/S/D | Move |
| Space | Jump |
| Shift | Sprint |
| Caps Lock | Walk toggle |
| C | Sneak |
| **F or click** | Attack |
| **Q or right-click** | Block |
| R | Ready / sheathe |
| E | Interact |
| **V** | First / third person |
| Arrow keys | Turn the camera |
| Scroll or = / − | Zoom |
| Tab | Menu |
| I / J / M / K | Inventory / journal / map / skills |
| Esc | Pause |
| F5 / F9 | Quicksave / quickload |
| ` | Debug overlay |

**Proposed additions** (all left-hand reachable while the right hand stays on the trackpad):

| Key | Action |
|---|---|
| **Space in combat stance + direction** | Dodge (with a settings toggle) |
| **X** | Lock-on toggle / cycle target |
| **Z** | Invoke patron deity |
| **G** | Quick-item wheel |
| **1–8** | Hotbar |
| **T** | Wait / rest (Skyrim habit) |
| **Hold Y** | Yield / surrender |
| **Hold E toward the crowd** (arena) | Salute the crowd |

### B10.2 Trackpad rules
- **Every action has a key.** Never require a held right-click (a two-finger click) while also moving the cursor.
- **Toggles:** block, sprint, sneak, aim and walk can each be set to *hold* or *toggle*.
- **Power attacks use a hold-threshold timer** (0.35 s, adjustable), never a mouse gesture.
- **Lock-on and aim assist** do the work of fine aiming. The look sensitivity setting has separate trackpad and mouse presets.
- **Pointer lock:** request it on click. The browser always releases it on Esc, so the game pauses on `pointerlockchange`. Use `unadjustedMovement` where supported (Chrome), as an option: trackpad users may *prefer* OS acceleration. Safari support **[?]**.
- **Mac browser pitfalls:**
  - Never bind **Cmd** keys (Cmd+W closes the tab and Cmd+Q quits the browser).
  - Add a `beforeunload` confirmation while a game is running.
  - Avoid Ctrl+click: on a Mac it is a right-click.
- **Palm rejection risk [?]:** there are anecdotal reports that laptop trackpads ignore input or taps while keys are held. **Test early on the owner's Mac.** Recommend *physical press-clicks* rather than tap-to-click, keep **arrow-key look** and **lock-on** as first-class alternatives, and offer a keyboard-only mode.
- **Accessibility:**
  - adjustable parry window and difficulty;
  - pause any time;
  - FOV slider, head-bob and camera-shake toggles (motion comfort);
  - colorblind-safe markers;
  - text size;
  - subtitles for every bark.

### B10.3 Camera
- **V** toggles first and third person.
- **First person:** your body is visible when you look down (optional). The weapon is in view, with a shield edge on the left.
- **Third person:** an over-the-shoulder offset (shoulder swap in settings). Scroll zooms; scrolling all the way in switches to first person, as in Skyrim.
- **In combat with lock-on**, the third-person camera frames both combatants.
- Ranged aiming works in either view with a minimal reticle.

### B10.4 HUD
- **Compass** across the top, as in Skyrim:
  - cardinal letters N/E/S/W by default. Latin initials would collide: *Septentrio, Oriens, Meridies, Occidens* give S/O/M/O. So the Latin names appear only in a tooltip;
  - icons for discovered and nearby undiscovered landmarks;
  - quest markers (they can be turned off: "Morrowind mode");
  - an enemy-awareness tick.
- **Bars:** Health in the middle, Stamina on the right, Pietas on the left. They fade when full, as in Skyrim.
- **Crosshair:** a dot. The sneak "eye" sits above it.
- **Arena:** a crowd-favor meter.
- **Discovery banner:** the **Latin name with an English subtitle** ("TEMPLVM SATVRNI · Temple of Saturn"), plus an optional Lexicon entry.
- **Time and date**, shown on the wait screen or by holding Tab:
  - **Roman hours**: the day is split into 12 hours from sunrise, so a summer hour is longer;
  - **Roman date** with the modern date in a tooltip ("a.d. V Id. Mai., L. Publilio Celso II C. Clodio Crispino cos." means 11 May 113);
  - a market-day (nundinae) marker.

### B10.5 Menus
**Tab** opens a ring of:
- **Sarcina** (inventory, styled as a soldier's pack);
- **Columna** (skills: each skill is a column, and perks are reliefs that spiral upward);
- **Forma** (map, drawn in the style of an incised marble plan). The surviving Marble Plan is Severan (203–211), so the *style* is borrowed; a Flavian predecessor in the Templum Pacis is hypothesized **[?]**;
- **Tabulae** (journal on wax tablets, with conspiracy-board and faction tabs);
- **Lexicon** (an encyclopedia of places, people and customs with sources: a lightweight Discovery Tour);
- **Settings**.

**Dialogue:** a list of options. Rhetoric checks show the approach (Persuade / Intimidate / Bribe / Invoke patron) and the **odds**.

## B11. The first playable vertical slice (20–40 minutes)

### B11.1 Footprint and date
- **Area:**
  - the **Forum Romanum** (origin: the Miliarium Aureum by the Temple of Saturn and the Rostra), up the **Via Sacra** over the **Velia** with the Colossus, down to the **Colosseum valley** (Meta Sudans, the amphitheater exterior with the arena floor as an interior) and the **Ludus Magnus**;
  - an edge of the **Argiletum/Subura**;
  - the **Cloaca Maxima** beneath.
  - That is about 900 × 500 m real, or **~540 × 300 game meters**. Crossing it on foot takes about **2.5 minutes at a jog**.
- **Landmarks** (about 15 named tier 1):
  - Miliarium Aureum, Rostra, Temple of Saturn, Curia, Basilica Aemilia, Basilica Julia;
  - Temple of Castor, Temple of Vesta and the Atrium Vestae, Temple of Divus Iulius, Regia;
  - Arch of Titus, Colossus, Meta Sudans, Amphitheatrum Flavium, Ludus Magnus;
  - the Shrine of Venus Cloacina, which is the dungeon entrance.
- **Date: 11 May 113** (a.d. V Id. Mai.). It is a **Lemuria** night and the **eve of the Column's dedication**: the streets are busy with preparations, and there is a ghost vignette at night.

### B11.2 A 30-minute script
1. **0–4 min: Arrival and creation.** A dawn arrival on the Via Sacra by the Arch of Titus, where a short card tells of the night cart. Pick origin, gender and name (presets for appearance). This covers the movement tutorial, **V to toggle the view**, and the compass.
2. **4–10 min: Errand.** Deliver a sealed tablet to a patron's agent at the **Basilica Aemilia**. Along the way:
   - talk to NPCs;
   - an optional pickpocket attempt that teaches the witness and bounty loop with an Urban Cohort patrol (pay or flee);
   - a prayer at the **Cloacina shrine** that teaches blessings and Pietas;
   - a shop (popina or armorer).
3. **10–20 min: The Ludus Magnus.**
   - Sign on for a bout as an auctoratus, or as a guest for coin.
   - A training fight with the wooden *rudis* teaches light, power, block, the **timed parry**, bash and dodge.
   - A real bout against the **retiarius mini-boss**: the net mechanic, the crowd-favor meter, and a **missio choice**.
   - Earn coin; buy a gladius and scutum or a hasta; sling practice at targets.
4. **20–35 min: The Cloaca Maxima.**
   - The agent's tablet was a decoy. The courier's real cache lies hidden in the drain beneath **Venus Cloacina**.
   - The dungeon includes stealth past lookouts, one **lock** (Locks & Seals), a rat-swarm hazard, a slinger on a ledge, and the **Rex Cloacae** boss with the **sluice** phase.
   - The **loopback** is the grate by the Basilica Aemilia.
   - **Loot:** coins, a Noric-steel pugio, and a tablet stamped with a **Parthian drachm** (a hook).
5. **35–40 min: Return.**
   - At dusk the Forum empties. The night carts and vigiles appear, and a Lemuria ghost glimpse comes at the edge of vision.
   - **Level up** and spend your first perk.
   - **Teaser** for Act I: "tomorrow, the Column".

### B11.3 Systems the slice must prove (definition of done)
- [ ] Movement, sprint, jump and mantle, sneak; **first and third person toggle** with consistent combat in both.
- [ ] Melee: light, power (hold), block, **timed parry with a riposte**, bash, dodge, stamina, poise and stagger, lock-on. **Every action is playable on keyboard alone.**
- [ ] One ranged weapon (the sling) and one thrown weapon (a javelin).
- [ ] At least four enemy archetypes: mugger, slinger, retiarius, gang lord. Attack tokens.
- [ ] **Non-lethal:** a yield from enemies, and missio in the arena.
- [ ] Skills improve by use. At least one **character level and one perk** within 30 minutes.
- [ ] Inventory, equipment (visible on the avatar), loot, stolen-item flag, one shop.
- [ ] Crime: witnesses, a bounty, and a confrontation (pay, flee or fight).
- [ ] A Pietas shrine blessing (and ideally one patron-deity invocation).
- [ ] Compass with markers, discovery banners, journal with quest stages, map, dialogue with a Rhetoric check.
- [ ] Day-to-dusk time progression with schedule changes (crowds thin, carts and vigiles appear).
- [ ] Save, load and autosave (with `localStorage`/IndexedDB wrapped in try/catch).
- [ ] **Performance:** 60 fps target on an M-series Mac in Chrome and Safari (per `CLAUDE.md` budgets).

**Explicitly out of scope** for the slice: horses, housing, followers (except perhaps a hired gladiator for 5 minutes), crafting beyond buying and repair, radiant jobs beyond a repeatable Ludus bout, voice acting.

## B12. Open questions for the owner
1. **Which Rome mod** did you mean: *The Forgotten City* (story-driven, ~6–8 h) or M7's *The City of Rome* (a small visit mod)?
2. **Difficulty and lethality:** closer to Skyrim (forgiving) or Kingdom Come (lethal)? The proposal is lethal on Normal, with a gentle "Tiro" mode.
3. **Quest markers** on by default, with an optional Morrowind-style directions mode. OK?
4. **Slavery:** is the proposed policy right (honest depiction, the player never forced to own slaves, freeing people possible)?
5. **Gore:** blood yes. What about dismemberment or decapitation finishers in the arena?
6. **Romance and marriage** (Roman marriage *sine manu*): wanted, and if so when?
7. **Latin first or English first** for place names in the UI? The proposal is Latin with English subtitles.
8. **Saves:** free saving plus autosave (proposed), versus restricted saving like KCD's.
9. **Trackpad test:** can you hold W and look around with the trackpad on your Mac without the cursor freezing? This decides how much the game leans on arrow-key look and lock-on.

---

## Appendix A. Calendar for the game span (AD 113)

| Date | Festival / event | Gameplay use |
|---|---|---|
| 4–10 Apr | Megalesia (Magna Mater) | Galli processions; a Palatine temple |
| 12–19 Apr | Cerialia | Circus games |
| 21 Apr | **Parilia**, Rome's birthday | Bonfires (jump the fire for Pietas) |
| 23 Apr | Vinalia | Wine tasting, merchants |
| 25 Apr | Robigalia | A rural rite on the Via Claudia (outside the city) |
| 28 Apr–3 May | **Floralia** | Games and theater; rowdy |
| **9, 11, 13 May** | **Lemuria** | Ghost nights (B8); beans thrown at midnight |
| **12 May** | **Dedication of Trajan's Column and the Temple of Venus Genetrix** | Main-quest Act I climax |
| 14 May | **Argei** puppets thrown from the Pons Sublicius | Misc seed 9 |
| 7–15 June | **Vestalia** | The Vestals' storeroom opened to matrons; Act II set piece |
| 1 July | Leases and rents due | Housing and moving-day events |
| 6–13 July | **Ludi Apollinares** | Theater, Act II set piece |
| 20–30 July | Ludi Victoriae Caesaris | Games |
| 23 July | Neptunalia | Shelters of boughs by the river |
| 13 Aug | Nemoralia (Diana at Aricia) | Torch processions (outside the city) |
| 17 Aug | Portunalia | River port events |
| 19 Aug | Vinalia Rustica | — |
| 21 Aug | Consualia | Circus races (mules and horses) |
| **23 Aug** | **Volcanalia** | Vigiles capstone; arson diversion |
| **4–19 Sept** | **Ludi Romani** | Circus capstone; Act III |
| **18 Sept** | **Trajan's birthday** | Act III set piece |
| **Autumn (traditionally Oct.) [?]** | **Trajan departs for the East** | Main-quest finale; the exact day is uncertain |

**Market days** (*nundinae*) fall every 8th day and bring rural vendors to the Forum. Dating formula: "L. Publilio Celso II, C. Clodio Crispino cos." (AUC 866).

## Appendix B. People in or around Rome in 113 (use sparingly; essential, never killable)

| Person | 113 status | Certainty |
|---|---|---|
| **Trajan** (b. 18 Sept 53) | In Rome until autumn. His titles on the Column base: *Imp. Caesar divi Nervae f. Nerva Traianus Aug. Germ. Dacicus pont. max. trib. pot. XVII imp. VI cos. VI p.p.* "Optimus" was used informally and **formally adopted in 114** | High |
| **Pompeia Plotina** | Empress; Hadrian's patroness, Epicurean sympathies. Dio 68.5 records her saying on entering the palace that she hoped to leave it the same woman | High |
| **Salonia Matidia** | Trajan's niece, Sabina's mother. Marciana (Trajan's sister) died in Aug 112 and was deified | High |
| **Hadrian** | Archon of Athens 112/13; probably absent from Rome; joins Trajan in the East | Medium **[?]** |
| **Vibia Sabina** | Hadrian's wife; whereabouts uncertain | Low **[?]** |
| **P. Acilius Attianus / Ser. Sulpicius Similis** | Praetorian prefects from about 112 | Medium **[?]** |
| **Ti. Claudius Livianus** | Praetorian prefect from 101; his tenure afterwards is unclear | Low **[?]** |
| **L. Publilius Celsus, C. Clodius Crispinus** | Consuls ordinarii of 113 | High |
| **A. Cornelius Palma, Q. Sosius Senecio** | Trajan's honored marshals (statues, Dio 68.16) | High (whereabouts **[?]**) |
| **L. Julius Ursus Servianus** | Elder statesman, Hadrian's brother-in-law and rival | Medium |
| **Apollodorus of Damascus** | Architect of the Forum, Column and Baths | High (presence in 113 likely) |
| **Juvenal** | Satirist active in Rome c. 110s | Medium |
| **Suetonius** | Imperial secretary posts under Trajan (*a studiis*, *a bibliothecis*) **[?]** | Low–medium |
| **Soranus of Ephesus** | Physician practicing in Rome under Trajan and Hadrian (Suda) | Medium **[?]** |
| Pliny the Younger | Dies c. 113 in Bithynia (absent) | Medium |
| Tacitus | Proconsul of Asia 112/13 (absent) | Medium |
| Licinius Sura | **Dead** (c. 108) | High |
| Galen | **Not born** (129) | High |
| Diocles (charioteer) | A child in Lusitania; races from 122 | High |

## Appendix C. Anachronism watch-list (design and UI level)

| Don't | Use instead |
|---|---|
| "Colosseum" as the in-world name | **Amphitheatrum Flavium** (with "Colosseum" as an English gloss) |
| "Mamertine Prison" | **Carcer / Tullianum** |
| "Via Biberatica" | An unnamed street of Trajan's Markets |
| Colossus beside the amphitheater | Colossus on the **Velia** (moved by Hadrian later) |
| Temple of Venus and Roma | Not begun until 121 |
| Hadrianic Pantheon finished | A burned Pantheon under scaffolding |
| Pons Aelius, Mausoleum of Hadrian | Not yet built |
| Aurelian Walls, Baths of Caracalla and Diocletian, Arches of Septimius Severus and Constantine | — |
| Christian catacombs | Pagan tombs and columbaria, tufa quarries |
| "Thumbs down" meaning death | A crowd chant and the editor's gesture (the meaning of *pollice verso* is debated) |
| Stiff-armed "Roman salute" | A raised right hand of greeting or acclamation (the modern salute is a 20th-century invention) |
| Beards on most men | Clean-shaven men; beards mark Greeks, philosophers or mourners |
| Stirrups, horseshoes | Four-horned saddle, hipposandals |
| Tomatoes, potatoes, maize, chili, sugar as food | Garum, puls, bread, olives, figs, honey (sugar only as a rare medicine) |
| Galen, Vegetius, Arrian's *Tactica* as sources | Celsus, Dioscorides, Scribonius Largus, Frontinus, Onasander |
| *Plumbatae* (weighted darts) | Late antique; leave them out |
| Gladiators always fighting to the death | Many bouts ended in missio. *Sine missione* was banned |
| Unpainted white marble everywhere | **Painted** statues and architecture |
| The seven Mithraic grades as certain in 113 | Present them as the cell's own tradition **[?]** |

## Appendix D. The Roman day (drives NPC schedules)

| Roman hour (from sunrise) | City life | Quest and systemic hooks |
|---|---|---|
| Before dawn – 1st hr | **Salutatio**: clients queue at patrons' doors | Clientela radiant (sportula); the night carts leave |
| 2nd–5th | Fora, courts, markets, schools, workshops | Court cases, shopping, Senate (when in session) |
| 6th (noon) | Prandium (a light lunch), shops slow | Popina gossip |
| 7th–8th | Rest; the streets ease | Burglary windows in rich houses (owners at the baths) |
| 8th–9th | **Baths** (thermae open in the afternoon) | Bath thieves, gossip, cleanliness reset |
| 9th–10th | **Cena** (dinner) | Dinner-party quests, patron events |
| Night | Streets dark, **carts allowed**, Vigiles patrols, taverns, crime | Night patrols, fires, muggings, Lemuria ghosts |

## Appendix E. Sources (brief)
- **Game design:**
  - J. Burgess and N. Purkeypile, "Level Design in a Day" and "Skyrim's Modular Level Design", GDC 2013 (blog.joelburgess.com; gamedeveloper.com/design/skyrim-s-modular-approach-to-level-design).
  - UESP Oblivion Arena ranks (en.uesp.net/wiki/Oblivion:Arena_(faction)).
  - Wikipedia: *The Forgotten City*; *Shadow of Rome* (the salvo system); *Expeditions: Rome*.
  - B. Devereaux, "Expeditions: Rome and the Perils of Verisimilitude", ACOUP, 15 Apr 2022.
  - KCD2 combat (Fextralife wiki; GameRant).
  - Oblivion Remastered architecture (UE5 renderer over the original engine logic; Wikipedia and press).
- **Mods:**
  - Nexus Mods: *The City of Rome* (skyrim/mods/60907; Steam Workshop 357809690, M7, 2014);
  - *The Roman Conquest of Skyrim* (skyrimspecialedition/mods/89819);
  - *Roman Empire* (62891), *Imperial Roman Conversion* (60287), *Roman Imperial armor and weapons* (10740);
  - UESP *Skyrim Mod: The Forgotten City*.
- **History:**
  - Fasti Ostienses on 12 May 113 (via Wikipedia, *Trajan's Column*; *Temple of Venus Genetrix*).
  - Wikipedia: *Lucius Publilius Celsus*; *AD 113*; *Trajan's Parthian campaign*; *Mithraism* (Statius; the Alcimus/Livianus dedication, CIMRM 593); *Ludus Magnus*; *Praetorian prefect*.
  - Platner and Ashby, *Topographical Dictionary* (LacusCurtius): Caelius Mons, Cohortium Vigilum Stationes.
  - Ancient texts: Juvenal *Sat.* 1 and 3; Martial; Pliny *Ep.* 10.5–7, 10.33–34, 10.96–97; Pliny *NH* 3.66, 36.73, 36.100, 36.121; Suetonius *Aug.* 40, *Iul.* 38, *Claud.* 25, *Dom.* 4; Dio 68.5, 68.14–16, 69.4, 76.16; Tacitus *Ann.* 15.46; Petronius 117; Frontinus *De aquaeductu*; Varro *LL* 5.163; Tabula Heracleensis; HA *Hadr.* 19; *Epitome de Caesaribus* 13.13.
