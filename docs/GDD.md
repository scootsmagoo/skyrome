# SKYROME: Game Design Document

> **Version:** 1.1 (master GDD, after the first review pass), 2026-10-03. It synthesizes `docs/research/` (game-design, society, architecture, topography-terrain, topography-landmarks, tech, assets).
> **Audience:** (a) the owner, who is new to game development, and (b) the AI engineers building the systems. Every system lists concrete numbers, formulas and stable IDs.
> **Status of numbers:** every gameplay number in this doc is a **starting tuning value** `[design]`. Engineers put them in data/tuning files (`src/rpg/data/*.ts`), not hard-coded in systems, so playtesting can change them without code edits.
> **Sister docs:** `docs/CONTENT.md` (NPC, quest and item content), `docs/ATLAS.md` + `src/data/atlas.ts` (positions), `docs/ARCHITECTURE.md` (code), `CLAUDE.md` (conventions). Where this GDD and a research doc disagree on a *historical fact*, the research doc wins; on a *design decision*, this GDD wins.

---

## 0. How to read this document

| Convention | Meaning |
|---|---|
| **IDs** | `kebab-case`, stable and unique within their kind. Landmark IDs match `docs/research/topography-landmarks.md`. Prefixes: `mq-` main quest, `vig-`/`lud-`/`urb-`/`lav-`/`mit-`/`cli-`/`cir-` faction quests, `misc-` misc quests, `rad-` radiant templates, `perk-` perks, `boss-` bosses, `dun-` dungeons, `dist-` districts, `fest-` festivals, `npc-` named NPCs. |
| **Units** | Gameplay distances are **game meters**. Layout and landmarks are real meters × `WORLD_SCALE = 0.6`. Human-scale things (people, doors, steps, weapons, generic insulae) are 1:1. "Real" marks unscaled distances. **Human-scale interiors of landmarks** (the Column's stair, the Carcer, the Castor strongrooms, the hypogeum, the cryptoporticus) are separate **1:1 interior cells** behind a door or load, so they are "bigger on the inside" than the 0.6 exterior, as in Skyrim (§12.4). |
| **Time** | Game time runs at `timeScale = 20`, so 1 game hour = 3 real minutes and 1 game day = 72 real minutes. "Game seconds" means seconds of game time. Combat timings (windows, wind-ups) are in **real** seconds. |
| **Money** | Denarii (`den.`). 1 den. = 4 sestertii (HS) = 16 asses (`as.`) = 64 quadrantes. 1 aureus = 25 den. (§7.1) |
| **Confidence tags** | **[A]** attested · **[P]** probable · **[U]** uncertain or disputed · **[G]** game extrapolation, plausible but invented · **[design]** an invented mechanic or number. Never present [G] or [design] material as history in the in-game Lexicon. |
| **Priority** | **Must** / **Should** / **Could** in the v0.0 and v0.1 specs (§17). |

---

## 1. Elevator pitch and design pillars

### 1.1 Elevator pitch

> **Rome, AD 113.** Trajan's new Forum still gleams, his Column is about to be unveiled, and the emperor is preparing to march on Parthia. You arrive at dawn through the dripping Porta Capena with nothing but a dead courier's sealed tablet, and the greatest city on earth opens around you. Fight in the Ludus Magnus, run with the night watch, rob the Esquiline rich, kneel at a crossroads shrine or plead in the Basilica Julia. Somewhere in the crowds a conspiracy is gathering around the emperor's departure. **A Skyrim-style open-world action RPG with the dragons replaced by history:** grounded, lethal, non-linear, playable in a browser on a Mac trackpad.

### 1.2 Pillars

| # | Pillar | What it means in practice | Test question for any feature |
|---|---|---|---|
| 1 | **The City Is the Dungeon** | Rome is dense and layered: streets, rooftops, sewers, buried palaces, warehouses, tombs. A hook every 30–60 s of travel (§12.3). | Does it add density, not just acreage? |
| 2 | **Go Anywhere, Become Anyone, Within the Law** | No classes, no locked map. Legal status, patronage, clothing and reputation open and close doors. You can climb from freedman to *eques*, by the emperor's grace (§3.4), and fall again. | Does the world react to who you are? |
| 3 | **Steel, Stamina and the Crowd** | Combat is weighty, readable and lethal: stamina, poise, a timed parry, no mouse gestures. The arena turns fighting into performance through **crowd favor**, and you can be spared (*missio*). | Can it be played on keyboard alone? Does it reward skill over stats? |
| 4 | **Gods in the Margins** | No magic, but belief has power. Omens, vows, curse tablets and ghosts on the Lemuria have modest effects and always allow a natural explanation (§2.4). | Could a skeptical Roman explain it away? |
| 5 | **History Bends, Never Breaks** | Accurate to AD 113. Protagonists, plots and most NPCs are fictional. Historical figures are *fixed stars*: you can influence them but never kill Trajan or crown Hadrian early. | Would a historian wince? |

**Cross-cutting constraint: built for the browser and the trackpad.** Every verb has a key, toggles replace holds when the player asks, timing windows and difficulty can be adjusted, and the scope fits a team of AI agents with no artists (procedural kits, text dialogue, no voice acting).

---

## 2. Setting

### 2.1 Date: the game starts at dawn on 11 May AD 113

**In-game start:** **11 May 113** (*a.d. V Id. Mai.*, year of the consuls L. Publilius Celsus II and C. Clodius Crispinus, 866 AUC), at **04:30 local solar time**. That is the fourth watch of the night, about 25 minutes before sunrise (sunrise ≈ 04:54, sunset ≈ 19:06, one Roman hour ≈ 71 min). Set `GameTime.start = { year: 113, month: 4, day: 11 }`, `startHour = 4.5`.

Why this date:
1. **The Act I climax is one day away.** The Fasti Ostienses put the rededication of the Temple of Venus Genetrix on **12 May 113**, and the Column dedication is usually placed on the same day [A for Venus; P/U for the Column's exact day, sometimes given as 18 May]. A strong hook arrives at once, with no weeks of waiting.
2. **It is a Lemuria day.** The ghost nights are 9, 11 and 13 May [A]. The first night of play is a ghost night, which shows the low-fantasy contract on day one.
3. **There is festival content right after it:** the third Lemuria (13 May), the Argei puppets thrown from the Pons Sublicius (14/15 May) and the Mercuralia at the spring by the Porta Capena (15 May) [A].
4. **It is spring.** Days are long (14.2 h of daylight), the sun stands high (66° at noon), and the Tiber is past its flood season.
5. **A dawn arrival works best on screen.** Night carts were the only legal wheeled traffic [A], so the player arrives with the last cart before dawn. The sun rises *behind* the player (azimuth 66°, ENE) as they walk WNW up the Circus Maximus valley, lighting the Palatine palace façade. The first look at Rome is in golden light, not darkness.
6. **It matches the date of the first-playable slice** in `game-design.md` B11 (the v0.0 milestone also matches B11's footprint; v0.1 is larger, §17), and the moon (about 8 days old, waxing, ~57% lit; computed mean lunation, ±1 day) lights the first night until after midnight.

**Game span:** the main quest runs from **11 May to 19 October 113** (Trajan's departure, §10). After the epilogue the calendar keeps running for free roam.

### 2.2 Situation in 113 (what the player feels)

| Thread | Facts | In-game texture |
|---|---|---|
| **The new Rome of Trajan** | Forum of Trajan and Basilica Ulpia dedicated 1 Jan 112. Column 12 May 113. Baths of Trajan June 109. Aqua Traiana 109. Circus Maximus rebuilt in stone (103). [A] | Gleaming new marble. Building sites, cranes and scaffolds. Dacian captives at work. |
| **The burned Pantheon** | Struck by lightning and burned in 110. Rebuilding usually dated from c. 114 (brick stamps) [P]. | A blackened shell behind hoardings. No dome. |
| **War with Parthia** | King Osroes put Parthamasiris on the Armenian throne without Rome's consent. Trajan leaves in **autumn 113** [A]; the exact day is unattested [U]. | Recruiters, troops mustering, mules and horses getting dearer, contractors getting rich, vows on the Capitol, Easterners eyed with suspicion. **The doors of Janus stand open.** |
| **No heir** | Trajan (59; turns 60 on 18 Sep) has not designated a successor. Hadrian (37) was archon of Athens in 112/13 and his whereabouts in 113 are uncertain [U]. Plotina backs him. | Wagers, horoscopes and whispers about the succession: the engine of the main quest. |
| **Trajan's style** | *Civilitas*: he walks among people, defers to the Senate, curbs informers, refuses *dominus et deus*. "Optimus" is used informally and becomes an official title only in 114 [A]. | NPCs call him *optimus princeps*. Calling anyone *dominus et deus* is a sycophant's faux pas. |
| **The city** | About 1 million people [U]. 14 regions, 265 neighborhoods (*vici*) with crossroads shrines [A]. | Crowded, noisy, multilingual: Juvenal's Satire 3 as a random-encounter table. |

### 2.3 Tone

- **Grounded, humane and wry.** Rome is magnificent, filthy, funny and dangerous. Juvenal and Martial set the voice for street barks; Pliny and Tacitus set it for the elite.
- **Violence is real and has weight.** Blood yes. Dismemberment: off by default (open question, Appendix B). **Executions are implied, never playable**: they are heard from the stands, discussed, or the subject of a rescue.
- **Slavery is depicted honestly.** Enslaved people exist everywhere, as history requires. The player is **never required to own slaves**, can help people win freedom, and a domus comes staffed by paid freedmen (§14.11).
- **Villains are individuals and cells, never whole religions or peoples.** Dacians, Syrians, Jews, Christians, Egyptians and Parthians appear as people with their own views.
- **Latin first, English second.** Place names show in Latin with an English subtitle ("AEDES·SATVRNI · Temple of Saturn"). In-world Latin uses **names attested in antiquity**, never modern scholarly labels:
  - the amphitheatre is **AMPHITHEATRVM** ("Flavian Amphitheatre / Colosseum" only as the English gloss). *Amphitheatrum Flavium* is a modern label with no ancient attestation (Wikipedia, "Colosseum"); the ancient name was simply *amphitheatrum*, and Martial *Spect.* 1 has *Caesareum amphitheatrum* [A];
  - temples are **AEDES·…** (*aedes Saturni*, *aedes Castoris*), which is what Romans normally said, not *templum*. The *Templum Pacis* keeps its own name;
  - the Basilica Aemilia is **BASILICA·PAVLLI**, "probably its ordinary name" in the imperial period [A: Platner & Ashby, "Basilica Aemilia"; Tac. *Ann.* 3.72; Statius *Silv.* 1.1.30];
  - the palace is **PALATIVM** (or DOMVS·AVGVSTANA for the whole complex). "Domus Flavia" is modern;
  - the twin temples at Sant'Omobono (a modern church name) show as **AEDES·FORTVNAE·ET·MATRIS·MATVTAE**; "Markets of Trajan" has no known ancient name, so it gets an **English-only label**. The Lexicon marks every modern conventional name as modern;
  - "Carcer" (or "Tullianum"), never "Mamertine".
  
  Stable IDs (`colosseum`, `basilica-aemilia`, `domus-flavia`, `markets-trajan`, `sant-omobono-temples`) stay as they are; only the displayed names change. The Latin column in `topography-landmarks.md` still uses some modern labels and should follow this list.

### 2.4 Low-fantasy rules: the Ambiguity Contract

Five rules, binding on all content:
1. **Two explanations.** Every uncanny event has an in-world natural explanation that a careful player can find or infer (smoke, a drugged cup, a living person, chance, psychology).
2. **No visible magic.** No glows, particles from hands, or projectiles. A blessing *feels* like a gust, a bird call or the sun breaking through clouds.
3. **Modest numbers.** Effects stay within what confidence, luck or medicine could do: **±5–25%**, for short durations.
4. **Never confirm.** Neither the journal nor the Lexicon says "the ghost was real". Skeptics (Epicureans) and believers both get dialogue.
5. **Belief is the mechanic.** A curse tablet harms only a target who *learns* of it; superstitious NPCs are affected more and Epicureans not at all.

| Allowed (ambiguous) | Not allowed |
|---|---|
| Omens (birds, thunder on the left, stumbling at a threshold) with accept/refuse (*omen accipio* / *absit omen*) | Fireballs, spell projectiles, glowing hands |
| Augury and haruspicy as a paid **hint system** | Summoning, raising or walking dead |
| Curse tablets (*defixiones*), amulets (*fascinum*, *bulla*, *lunula*) | Resurrection (death reloads; Tiro mode's "Aesculapian" rescue is people, not a miracle) |
| Vows (*vota*): a modest buff now, a debt later | Invisibility, levitation, shapeshifting |
| Astrology, dreams and incubation at Aesculapius' temple | Real monsters: no harpies, minotaurs or cyclopes, except as arena **costumes** |
| Mystery-cult visions with plausible causes (darkness, fasting, chant, wine) | Dragons, of course |
| Ghosts: only at night, only at the edge of vision, never in combat, vanishing when approached; each case has a mundane lead and **one** detail left unexplained | Werewolves as real creatures (a bandit in a wolfskin is fine) |
| Prodigies (a two-headed calf, a "sweating" statue) as social events | Anything that confirms the gods act visibly |

### 2.5 History rules

- **Fixed stars (essential, cannot be killed):** Trajan, Plotina, Matidia, Hadrian (offstage: letters and rumor only), P. Acilius Attianus, Ser. Sulpicius Similis, Ti. Claudius Livianus [U tenure], A. Cornelius Palma, L. Publilius Celsus, Q. Sosius Senecio, L. Julius Ursus Servianus, Lusius Quietus, Apollodorus of Damascus, Suetonius, Juvenal, M. Ulpius Phaedimus, T. Statilius Crito and Soranus of Ephesus. If they take lethal damage they kneel and become "affronted" instead of dying. **Trajan always departs in autumn.**
- **Absent or dead in 113:** Pliny the Younger (in Bithynia, probably dying), Tacitus (proconsul of Asia), Martial, Frontinus and Licinius Sura (dead). Galen is not yet born, and Diocles does not race until 122.
- **Accuracy is a promise.** Invent people and plots, never "facts". The Lexicon cites sources. Uncertain matters go in a character's mouth as opinion or rumor.
- **Anachronism watch-list:** the full lists are `topography-landmarks.md` App. A, `architecture.md` §8 and `society.md` §11. Engineers must never build: the Aurelian Walls, the Baths of Caracalla or Diocletian, the Arches of Septimius Severus and Constantine, the Temple of Venus and Roma, a finished domed Pantheon, the Pons Aelius or Hadrian's Mausoleum, the Temple of Divus Traianus, Christian catacombs or churches, the Colossus beside the amphitheater (it stands on the Velia), a pockmarked or ruined amphitheater, or a second obelisk in the Circus.

---

## 3. Player character

### 3.1 Character creation flow (≤ 3 minutes)

1. **Origin** (§3.2): legal status, skill bonuses, a trait, starting kit and a personal hook.
2. **Sex:** male or female. It changes appearance, period-correct dress and dialogue framing, and **never gates content** (§3.7).
3. **Name** with a Roman naming helper (§3.6).
4. **Appearance** from procedural presets (§3.6).
5. The **patron deity is not chosen here.** You choose one at that god's temple during play (§14.6), like Skyrim's Guardian Stones.

### 3.2 Origins

Base skills start at **10**. An origin adds **+10 / +5 / +5** to three skills. Starting coin is in denarii. Legal status IDs: `civis` (citizen), `libertus` (freed citizen with duties to a patron), `latinus-iunianus` (informally freed, a Junian Latin), `peregrinus` (free non-citizen), `alexandrinus` (peregrine with Alexandrian citizenship).

**v0.1 ships 4 origins** whose kit and trait work with v0.1 systems: `civis-suburanus`, `hispanus`, `veteranus` and `dacus`. The other six are shown but locked ("arrives in v0.2") until their systems exist: bows (`syrus`), javelins (`afer`), beasts (`afer`), smiths (`gallus`), Greek skill books (`aegyptius`) and radiant favors (`libertus`, `eques-lapsus`). Every origin except `veteranus` also picks one extra at creation: a used parmula (60% condition) or +40 den. Formal dress (toga, or stola and palla) **starts in the pack, not worn**.

| ID | Origin | Status | Skills +10 / +5 / +5 | Trait (ID: effect) | Coin | Signature kit | Personal hook (v0.3+) |
|---|---|---|---|---|---|---|---|
| `civis-suburanus` | Subura-born plebeian | civis | rhetoric / mercatura / brawling | `trait-street-wise`: tier-2 POIs in the Subura and Velabrum start revealed; −5% prices at plebeian vendors | 60 | tunic, paenula, calcei, fustis; in the pack: plain toga (male) or plain stola and palla (female) | An aunt's popina is squeezed by a collegium |
| `libertus` | Freedman or freedwoman | libertus | mercatura / locks-seals / rhetoric | `trait-patrons-shadow`: +10% Mercatura XP; the former owner calls in favors (radiant) | 80 | good tunic, wax tablets, pugio | The manumission tablet is "lost": prove your freedom |
| `gallus` | Gaul (Narbonensis or Lugdunensis) | civis or peregrinus (choose) | fabrica / spear / heavy-armor | `trait-gallic-smith`: improvement +1 quality tier at a forge | 50 | bracae, checked sagum, hasta, leather cuirass | A forgery ring uses a kinsman's maker's mark |
| `hispanus` | Hispanus from Baetica (Trajan's homeland) | civis | blades / rhetoric / equitatio | `trait-caesars-countryman`: +10 disposition with Baetican NPCs; Bilbilis-steel blades −20% | 90 | tunic, gladius; in the pack: toga (male) or stola and palla (female) | Letter of introduction to the patroness Calpurnia Severa |
| `syrus` | Syrian (Antioch or Emesa) | peregrinus | archery / mercatura / medicina | `trait-eastern-archer`: bow draw time −20%; soldiers −5 disposition during the war levy | 70 | long tunic, composite bow, 20 arrows, pugio | A Parthian silk merchant asks for "a small favor" |
| `aegyptius` | Alexandrian | alexandrinus | medicina / locks-seals / religio | `trait-alexandrian-learning`: +50% from Greek skill books; Isis devotees +10 disposition | 60 | linen tunic, 5 bandages, pugio | A papyrus is missing from the Iseum Campense |
| `afer` | African (Proconsularis or Mauretania) | civis or peregrinus | spear / athletics / light-armor | `trait-beast-wise`: +20% damage vs beasts; beasts flee sooner | 50 | tunic, 3 lanceae, leather cuirass | A leopard crate for the Ludus Matutinus has gone missing |
| `veteranus` | Dacian-war veteran of an **auxiliary cohort**, discharged early after a wound (*missio causaria*) | civis (since 106) | shield / blades / heavy-armor | `trait-old-wound`: Athletics −5 at start, +20 poise; soldiers +10 disposition; carries a **bronze diploma** recording the citizenship his cohort won *ante emerita stipendia* in the Dacian war [A: the diploma of 11 Aug 106 for cohors I Brittonum milliaria, CIL XVI 160; his unit can be that one or a similar cohort]. Legionaries, already citizens, got no diplomas [A], hence the auxiliary. | 60 | tunic, sagum, caligae, gladius, worn oval shield (`scutum-ovale`, 40% condition), Imperial Gallic helmet | Your old centurion is too rich for his pay (leads to the Toga cell) |
| `dacus` | Dacian captive of 106, informally freed | latinus-iunianus | fabrica / athletics / blades | `trait-survivor`: +10 poise per enemy beyond the first (max +30); some Romans −10 disposition, Dacians +20 | 30 | tunic, sica, builder's tools | Your people are carved on the Column; a Dacian revenge cell wants you |
| `eques-lapsus` | Equestrian fallen on hard times | civis (equestrian birth) | rhetoric / equitatio / blades | `trait-old-name`: opens one elite door per patron once; debt collectors ambush you (radiant) | 20 (and a debt of 2,000) | calcei, iron signet ring, spatha; in the pack: fine but worn toga (male) or stola and palla (female) | Win back the gold ring (female: the family's standing, §3.7) |

**Legal status and dress.** Only citizens and freed citizens (`civis`, `libertus`) may wear formal citizen dress (§8.2): a **man wears the toga**, a **woman the stola with the palla** [A for the convention; the stola was by 113 mostly formal wear, P]. A non-citizen in a toga commits *usurpatio togae* (§14.1). A woman in a toga reads as a prostitute or a condemned adulteress (§3.7). Citizens get lighter sentences (§14.1). A `latinus-iunianus` can earn citizenship through the Vigiles line (§9) or the bakers' route (Trajan's edict in Gaius, *Inst.* 1.34 [A]; a later misc quest). A `peregrinus` or `alexandrinus` can earn it through a patron's petition to the emperor (Clientela; cf. Pliny *Ep.* 10.5–7 [A]) or as a main-quest reward.

**The road to the equestrian ring** (§3.4). From AD 23 the gold ring required **free birth for three generations** (the man, his father and his paternal grandfather) plus the 400,000 HS census [A: Pliny *NH* 33.32]. So:
- **Freeborn citizens** (`civis` origins, `eques-lapsus`) take the **census route**: census + a patron's commendation + Infamia ≤ 20.
- **Freeborn non-citizens** (`peregrinus`, `alexandrinus`) must first gain citizenship, then take the census route.
- **Freedmen** (`libertus`, and a `latinus-iunianus` such as the `dacus` once a citizen) can rise only by an **imperial grant of the gold ring** (*ius anulorum aureorum*) [A: Suet. *Galba* 14; Tac. *Hist.* 1.13, 2.57]. It comes only through Trajan's favor: the `fides` ending (§10.4), or the Clientela capstone when your patron carries your petition to the emperor (§9.1).

### 3.3 Attributes (the three pools)

| Resource ID | Start max | Start current | Regeneration | Spent on | Level-up |
|---|---|---|---|---|---|
| `health` | 100 | 100 | **None while `inCombat`** (§6, one predicate for every system). Otherwise 0.5 HP/s, +`health.regen`. Food, bandages, rest. | Damage taken | +10 if chosen |
| `stamina` | 100 | 100 | 20/s after 0.8 s without spending; half while blocking; +`stamina.regen` | Attacks, blocks, sprinting, dodges, jumps, mantles, bow hold | +10 and +5 kg carry weight if chosen |
| `pietas` | 50 | 25 | **Never regenerates over time.** Refilled only by devotion (§14.6). | Patron-deity invocations (Z), some dialogue options and rites | +10 if chosen |

- **Level-up:** choose **+10 to one pool**, and receive **1 perk point**.
- **Governing growth:** every time a skill gains a level, its governing pool's max grows by **+0.2** (shown rounded; five skill-ups = +1). This is `SkillDef.attribute`.
- **Carry weight:** 50 kg base, +5 kg per Stamina level-up choice, plus Hercules and perk bonuses. Over the limit you can only walk (1.9 m/s) and cannot sprint or fast travel.

### 3.4 Social standing (separate from skills)

| Track | Range | How it changes | What it does |
|---|---|---|---|
| **Dignitas** (legal rank) | Steps: `peregrinus`/`latinus-iunianus` 0 · `libertus` 1 · `civis` 2 · `cliens-notus` 3 · `eques` 4 (`adlectus` later) | Origin; citizenship grants; Clientela rank; the equestrian ring. **Freeborn citizens:** census 25,000 den. (game scale) + patron's commendation + Infamia ≤ 20. **Freedmen:** only by an imperial grant of the ring (*ius anulorum*), through Trajan's favor. **Non-citizens:** citizenship first (§3.2). | +5 disposition per step with elite NPCs; legal penalties (§14.1); access to the Palatine beyond the Domitianic vestibule needs `eques` or a pass |
| **Fama** (reputation) | −100…+100 per track (track IDs in §9.1) | Quests +5…+20; sparing yielded foes +2; arena wins +3 with the plebs; crimes −5…−30 | Persuasion +Fama/10; disposition (which is how Fama reaches prices, §7.4); leniency from guards; NPCs greet you by name above +50 |
| **Infamia** (social stain) | 0…100 | Swearing the gladiator's oath +20; each public bout +2; convictions +10; brothel or stage work +10; a woman wearing a toga in public (§3.7) +5 once | −Infamia/5 to persuasion with elites and officials; +Infamia/10 with the underworld and arena fans; above 20 blocks equestrian rank. **Recovery** [design]: −1 per 10 elapsed days without a new stain, down to a floor of 10 if you ever swore the oath or were condemned (otherwise 0); a patron's *restitutio* quest (Clientela) −15; receiving the *rudis* and retiring from the arena −10; the *Fides* ending clears it |
| **Cleanliness** | `lautus` (washed) · normal · `sordidus` (bloody or filthy) | Combat, sewers or rain make you `sordidus`; baths make you `lautus`; a fountain (*lacus*) restores normal | `sordidus`: −10 persuasion with everyone but the underworld; `lautus`: +10 persuasion for 12 game hours (§14.8) |

### 3.5 Starting kit (all origins)

Clothing per origin (above), plus: a purse with the origin's coin, 2 bandages (`fascia`), 1 loaf of bread (`panis`), 1 wax tablet with stylus, and **the courier's sealed tablet** (`quest-tabella-signata`, from mq-01). Every origin's signature weapon starts at condition 90% (flavour: well used, not ruined).

### 3.6 Name and appearance

**Naming helper** (with presets and a "random" button; lists in `society.md` §7.4):

| Status and sex | Pattern | Example |
|---|---|---|
| Citizen man | praenomen + nomen + cognomen | *Marcus Ulpius Celer* |
| Citizen woman | feminine nomen + cognomen | *Ulpia Procula* |
| Freedman | former owner's praenomen and nomen + his own former name | *Gaius Iulius Eros* |
| Peregrine or Junian Latin | single name + "son/daughter of" father's name | *Daizus, son of Mucapor* |

**Appearance options:**

| Option | Values |
|---|---|
| Age band | `iuvenis` (18–25), `adultus` (26–40), `maturus` (41–55) |
| Height | 1.50–1.85 m (defaults: men 1.64, women 1.52) |
| Build | lean, average, muscular, heavy |
| Skin | 7 tones from `architecture.md` §6.1 (light `#EBC9AE` to deep brown `#4A2D1C`) plus ruddiness and sun-tan sliders |
| Hair (men) | Trajanic forward fringe (default), cropped, curled Greek, long Gallic, shaved (Egyptian priestly) |
| Hair (women) | simple bun, centre parting with waves, braids, Plotina-style frontal crest (an elite look; draws comment if your clothes are poor) |
| Beard | clean-shaven (default), stubble, full. **A full beard reads as Greek, philosopher, mourner or foreigner** in 113, and NPCs react to it. |
| Eyes | brown, hazel, green, grey, blue |
| Marks | scars (default for the veteran), tattoo (Dacian or Thracian origin only) |

A barber (*tonsor*) changes hair and beard for 1 den. at any time.

### 3.7 Sex: plausible roles with full freedom

No content is gated by sex. Dialogue frames choices: a female PC in the Ludus is a **gladiatrix** (rare, legal in 113 and sensational: crowd-favor gain +25%, Infamia gain +50%). In the Vigiles she starts as an informer and fire-runner and receives rank quietly. Under Clientela she wins court cases by directing a male advocate (Roman women could not plead for others). In the Mithraic cell the Pater makes an exception, which starts a subplot. In the Circus line she drives hooded. Details: `game-design.md` B2.3.

**Dress follows sex** (§8.2). The toga was the dress of male citizens. A citizen woman's (or freedwoman's) formal dress is the **stola** with the **palla**, and it carries the same status effects as the toga: the elite persuasion bonus, "formal dress" at a salutatio and in court, and *usurpatio* if worn by a non-citizen [stola usurpation is G]. **A woman in a toga** gets no status bonus: the toga marked a prostitute or a condemned adulteress [A: Hor. *Sat.* 1.2.63, 82; Mart. 2.39, 10.52; Juv. 2.68–70]. Respectable NPCs take −15 disposition and bark about it, the underworld +5, and wearing it at a salutatio or in court costs Infamia +5 (once). A male PC in a stola and palla is the disguise route of `mq-10` (§10.3).

**Two origins need female framing** [G, flagged in the Lexicon]: women did not serve in the army or hold equestrian rank. A female `eques-lapsus` is the daughter of a fallen equestrian house: her hook is winning back the family's fortune and standing, and her `eques` Dignitas step is game shorthand for an equestrian family's standing; the gold ring item governs men only (women wore gold rings as jewellery [P]). A female `veteranus` is an open question for the owner (Appendix B, Q11); until it is settled she is the widow of an auxiliary veteran who followed the army in Dacia, with the same skills and kit. The diploma is his, and her own legal status is part of the open question (a diploma gave the soldier's wife the right of legal marriage, *conubium*, not citizenship [P]).

---

## 4. Controls

### 4.1 Rules

- **Every action has a key.** No action requires a held right-click (a two-finger click) while the cursor moves.
- Systems read **actions**, never raw keys (`src/core/Input.ts`, `DEFAULT_BINDINGS`). Everything can be rebound.
- **Never bind Cmd** (Cmd+W closes the tab, Cmd+Q quits). Avoid Ctrl+click (a right-click on a Mac). Show a `beforeunload` confirmation while a game is in progress.
- **Pointer lock** starts on a click into the canvas. Esc always releases it, and losing pointer lock pauses the game. **The click that acquires pointer lock is swallowed**: it is never recorded as a `Mouse0` press, so coming back from a menu never swings your weapon (`Input.ts` currently records it; fix it).
- **Safari pinch:** call `preventDefault()` on `gesturestart` / `gesturechange` (Safari) and on `ctrlKey` + wheel (Chrome's pinch) so the page never zooms.
- **Week-1 input lab:** build `?scene=inputlab`, which logs keys, buttons, wheel deltas, gesture events and pointer-lock changes on the owner's Mac. It answers Appendix B Q10 and checks the trackpad pitfalls in §4.3.

### 4.2 Default bindings (keyboard + mouse)

Action IDs marked * already exist in `DEFAULT_BINDINGS`. The others are additions to make.

| Action ID | Default keys | Behaviour |
|---|---|---|
| `forward`/`back`/`left`/`right`* | W / S / A / D | Move. Also selects the direction of power attacks (latched, §6.1) and dodges. |
| `jump`* | Space | Jump or mantle. **Only while `inCombat` (§6) with a weapon drawn does it dodge instead**, so an armed player walking the city still jumps onto steps and carts (setting: "Space always jumps"). |
| `dodge` | Space (while `inCombat` with a weapon drawn) · Option (AltLeft, always dodges) | Dodge in the WASD direction, or a backstep with no direction (§6.1) |
| `sprint`* | Shift | Hold (default) or toggle (setting) |
| `walkToggle`* | N | Toggle walking. **Not Caps Lock:** on macOS the browser fires `keydown` when Caps Lock turns on and `keyup` only when it turns off, and Caps Lock may switch the input source. Caps Lock can be bound as an alternate; then read `getModifierState('CapsLock')` and treat either edge as a toggle (unit-test this path). |
| `sneak`* | C | Toggle (default) or hold |
| `attack`* | F · left click (not in the Trackpad preset, §4.3) | Tap = light attack. **Hold ≥ 0.35 s = power attack.** With a bow or sling: hold to draw, release to shoot. |
| `block`* | Q · right click | Hold (default) or toggle. A press inside the window before impact parries. Q **cancels** a drawn bow or sling. **Toggle mode** (used by the Trackpad and Keyboard-only presets): a Q press always opens the parry window and raises the guard at once if it is down. On release, a press **shorter than 0.18 s** restores the guard state from before the press (a tap is a parry attempt only, so a guarded player never drops the guard by trying to parry); a press of **0.18 s or more** toggles the guard. A parry that lands never changes the guard state. An optional separate `parry` action can be bound (unbound by default). Vitest: simulated press/release timings in both modes. |
| (bash) | F while blocking | Shield bash |
| `readyWeapon`* | R | Ready or sheathe the weapon |
| `interact`* | E | Talk, take, open, use. **Hold E** for the alternative action (take all, salute the crowd in the arena, drag a body). |
| `lockOn` | X | Tap: lock onto the target nearest the screen centre. Tap again: cycle. Hold 0.5 s: release. |
| `invoke` | Z | Invoke your patron deity (spends Pietas) |
| `quickWheel` | G | Quick-item wheel (pause-lite: time runs at 25%) |
| `hotbar1`–`hotbar8` | 1–8 | Use or equip the hotbar slot (bandages, food, thrown weapons, weapon sets) |
| `yield` | Hold Y for 1 s | Yield or surrender (brawls, arrest, arena with missio) |
| `wait` | T | Wait or rest menu |
| `toggleView`* | V | First / third person |
| `shoulderSwap` | H | Swap the third-person camera to the other shoulder |
| `lookLeft`/`Right`/`Up`/`Down`* | Arrow keys | Camera look (keyboard-only mode and an alternative to the trackpad) |
| `zoomIn`/`zoomOut`* | Scroll · trackpad pinch · = / − | Third-person zoom. Wheel `deltaY` is **accumulated** and steps the zoom only past a threshold, with a 250 ms debounce, so trackpad momentum can't fire a burst. Zooming all the way in switches to first person **in the Mouse preset only** (off in the Trackpad and Keyboard-only presets, where V does it). |
| `menu`* | Tab | Menu hub |
| `inventory`* / `journal`* / `map`* / `skills`* | I / J / M / K | Open that menu directly |
| `pause`* | Esc | Pause and settings |
| `quickSave`* / `quickLoad`* | F5 · P / F9 · L | Quicksave / quickload. **P and L are needed on a Mac:** Apple keyboards send media functions on F5/F9 unless fn is held. Quickload always asks for confirmation. Both are also buttons in the Esc menu. |
| `debug`* | ` | Debug overlay |

**In menus:** W/S or the arrow keys move the selection, A/D switch tabs, E/Enter/Space confirm, R is a secondary action (drop, compare, read), and Esc/Backspace goes back. The mouse works as usual.

### 4.3 Control presets

| Setting | **Mouse** (default on a desktop) | **Trackpad** (recommended for the owner) | **Keyboard only** |
|---|---|---|---|
| Look | Mouse; sensitivity 1.0 | Trackpad with pointer lock; sensitivity 1.6×; smoothing 0.08 s | Arrow keys: yaw 150°/s, pitch 90°/s, with a 0.25 s ease-in |
| Attack / block | Click / right-click or F / Q | **F / Q.** Clicking does **not** attack by default (opt-in setting), because a browser can't tell tap-to-click from a physical press, so light taps while looking would swing. | F / Q |
| Block | Hold | **Toggle** (tap = parry, press ≥ 0.18 s = guard, §4.2) | Toggle (same rule) |
| Zoom to first person | Scroll fully in | **Off** (use V); wheel steps accumulate with a threshold and debounce | Off (use V) |
| Sprint | Hold | **Toggle** | Toggle |
| Power-attack hold threshold | 0.35 s | 0.35 s (adjustable 0.2–0.6) | 0.35 s |
| Lock-on | Manual (X) | **Auto-suggest**: drawing a weapon with a hostile within 8 m locks on | Auto-lock always |
| Aim assist (ranged) | Off | Light (3° magnetism) | Strong (6° magnetism + target snap on X) |
| Third-person auto-recenter | Off | **On**: the camera swings behind you after 1.5 s without look input while moving | On |

**Trackpad notes [?]:** test all of these early on the owner's Mac in `?scene=inputlab` (§4.1). That is why arrow-key look, lock-on and toggles are first-class options.
- macOS may suppress trackpad *taps* while keys are held.
- Tap-to-click and a physical click look identical to the page, hence no click-to-attack in the Trackpad preset.
- Two-finger scrolling has momentum, which fires bursts of wheel events after the fingers lift; hence the zoom accumulator and debounce.
- Safari reports pinch as gesture events, Chrome as `ctrlKey` + wheel; both must be prevented from zooming the page.
- The left hand carries WASD, Shift, Space, F, Q and the rest. Directional power attacks therefore latch their direction (§6.1), and a "simple power" setting removes the chord entirely. Test the chords on the owner's keyboard.

### 4.4 Camera

| Parameter | Value (code: `src/player/CameraRig.ts`) |
|---|---|
| Toggle | **V** switches first and third person with a 0.25 s blend. In the Mouse preset, scrolling all the way in switches to first person and scrolling out switches back (§4.2). |
| Third person | **Over the right shoulder**: offset 0.42 m right, pivot 1.55 m above the feet, default distance 3.0 m, zoom 1.4–7.0 m in 0.6 m steps. H swaps the shoulder. A sphere cast pulls the camera in front of walls, and the player mesh fades when the camera is closer than 0.6 m. |
| First person | **Decision for v0.0–v0.1: "true first person".** The camera rides the head bone of the same full-body rig (position follows the bone with 0.05 s smoothing; rotation comes only from look input, never from the animation), so **one clip set serves both views** (§6.15). Eye height = actor height × 0.93. The head mesh is hidden with `colorWrite = false` so the body still casts a full shadow. The arms, weapon and shield edge you see are the body's own, posed so the guard sits low in view; the body is visible when looking down. When a wall is closer than 0.25 m, a sphere cast moves the camera back toward the neck; a weapon clipping into walls is tolerated in v0.1. **Fallback after the owner playtests:** a viewmodel pass (`tech.md` §2.3/§5.7a) that reuses the same pose functions with an arms-only mask. This overrides `tech.md`'s viewmodel default for the first milestones. |
| FOV | Default **70°** vertical (setting 55–90). Sprint adds +6°. |
| Lock-on framing | In third person the camera frames both combatants and pulls back to 3.5–5 m. In first person the view tracks the target's chest with a 0.15 s lag. |
| Combat parity | All combat works identically in both views. Hit detection is from the character, never from the camera. |
| Comfort | Head-bob, camera shake and motion blur each have a toggle (shake and blur are off by default in first person). |
| Gladiator helmets | First-person view through visored gladiator helmets adds a vignette mask: secutor strong, murmillo and thraex medium (an authentic penalty to peripheral vision). |

### 4.5 Accessibility

Adjustable parry window and difficulty (§6.12); pause at any time (including in dialogue); hold-or-toggle for every hold action; text size (90–150%); colorblind-safe marker shapes (every color also has a distinct shape); subtitles for every bark (always on, with a speaker label); a reduce-flashing option; and remappable everything.

---

## 5. Progression

### 5.1 Rules

- **Skills run 0–100 and rise by use** (`CharacterSheet.useSkill(id, xp)`). There are no classes. Every skill starts at **10**, plus the origin bonus.
- Each skill level gained adds **character XP equal to the new skill level**. Each character level grants **+10 to one pool** and **1 perk point** (§3.3).
- **No level scaling.** Areas and factions have fixed difficulty bands (§13.1). Danger still rises over a playthrough through **escalation that is not tied to player level**: night bands, main-quest act, bounty, Fama and Infamia, festival riots and rare roaming events (§13.3).
- Faction quests can also grant **skill XP rewards** (`reward.skillXp`): one level's worth (`xpToNext` at the current level) in a skill the quest exercised, Skyrim's trainer-equivalent. This keeps non-combat skills on pace with the faction rank gates (§9.1).
- Ways to raise skills besides use:
  - **Trainers:** 5 lessons per character level; a lesson raises the skill by one level. Cost: `round(0.15 × L² + 10)` den. at current level L (L20 = 70, L50 = 385, L70 = 745). Trainers cap at Common 40, Expert 70 and Master 90.
  - **Skill books:** +1 level once per book; about 3 per skill in v1.0 (§8.6).
- **Modifiers:** `xp.mult` (blessings, well rested) multiplies all skill XP.

### 5.2 Skill XP curve

```
xpToNext(L) = round( difficulty × (L + 5)^1.5 )      // XP to go from level L to L+1
```

| L | 10 | 15 | 20 | 30 | 50 | 75 | 99 |
|---|---|---|---|---|---|---|---|
| xpToNext (difficulty 1.0) | 58 | 89 | 125 | 207 | 408 | 716 | 1,061 |

Going from 10 to 100 takes about 44,800 XP per skill at difficulty 1.0. A typical early hit is worth about 5 XP, so mastering a weapon skill takes thousands of uses, as in Skyrim.

### 5.3 Character level curve

```
charXpToNext(n) = 25 × (n + 2)          // from character level n to n+1
charXpGained    = newSkillLevel          // per skill level-up
```

| Reach level | 2 | 3 | 5 | 10 | 20 | 30 | 50 | ~81 |
|---|---|---|---|---|---|---|---|---|
| Cumulative char XP | 75 | 175 | 450 | 1,575 | 5,700 | 12,325 | 33,075 | ≈ 84,600 (every skill at 100) |

There is no hard level cap. **Pacing check (v0.1):** in a 30–40 minute session a player makes about 60 weapon hits, 20 blocks, two Rhetoric checks and a kilometre of sprinting. That gives about 5–6 skill-ups at levels 15–20, about 90–110 char XP, so **level 2 and the first perk** arrive inside the slice.

### 5.4 The 17 skills

Lines: **Martial**, **Clandestine**, **Civic**. "Governs" is `SkillDef.attribute`.

| # | ID | Name (Latin) | Line | Governs | Difficulty | Covers | XP per use [design] |
|---|---|---|---|---|---|---|---|
| 1 | `blades` | Blades (*Gladius*) | Martial | health | 1.0 | pugio, sica, gladius, spatha, falx, dolabra | Hit on a hostile: light 4, power 7, riposte or finisher 10, sneak attack 12. Training dummy: 50%, and no XP from dummies above level 30. *Lusiones* against living opponents (§6.10) count as real fights. |
| 2 | `spear` | Spear (*Hasta*) | Martial | stamina | 1.0 | hasta, lancea, venabulum, tridens; thrown pilum, iaculum, net | As blades; thrown hit 8, or 12 beyond 15 m; a net that entangles 6 |
| 3 | `archery` | Archery & Sling (*Arcus et Funda*) | Martial | stamina | 1.0 | composite bow, sling | Hit 6, +1 per 10 m (max +6); headshot ×1.5 |
| 4 | `shield` | Shield (*Scutum*) | Martial | health | 1.0 | scutum, clipeus, parma, parmula; block, bash, parry | Block 3 + 0.2 × damage absorbed; parry 8; bash hit 5 |
| 5 | `brawling` | Brawling (*Pugilatus*) | Martial | stamina | 1.0 | fists, caestus, fustis, clava, vitis; knockouts | Hit 3 (blunt weapon 4); knockout 12; grapple-throw 8 |
| 6 | `heavy-armor` | Heavy Armor (*Lorica*) | Martial | health | 1.0 | hamata, squamata, segmentata, muscle cuirass, metal helmets | Hit taken while your **body piece** is heavy (§8.3): 2 + 0.3 × damage (max 10) |
| 7 | `light-armor` | Light Armor (*Levis Armatura*) | Martial | stamina | 1.0 | subarmalis, leather, manica, greaves, gladiator kit | As heavy armor, while your body piece is light (or you wear only padding) |
| 8 | `athletics` | Athletics (*Gymnastica*) | Clandestine | stamina | 0.8 | sprinting, mantling, climbing, swimming, falling | 1 per 10 m sprinted; mantle or climb 4; rooftop route completed 25; Vigiles fire-run 20; 1 per 20 m swum; surviving a fall over 4 m 3 |
| 9 | `stealth` | Stealth (*Latebrae*) | Clandestine | stamina | 1.0 | sneaking, crowd cover, sneak attacks | 0.6/s while sneaking, undetected, within 15 m of an NPC who could see you (max 30/min); sneak attack 15 |
| 10 | `pickpocket` | Pickpocket (*Furtum*) | Clandestine | stamina | 1.2 | lifting, planting | Success: 10 + value/5 (max 60). Failure: 0. |
| 11 | `locks-seals` | Locks & Seals (*Claustra et Signa*) | Clandestine | stamina | 1.1 | Roman tumbler locks, wax seals, forgery | Lock opened 8 / 15 / 25 / 40 by tier; seal opened and resealed 15; seal forged 40 |
| 12 | `rhetoric` | Rhetoric (*Eloquentia*) | Civic | pietas | 1.1 | persuade, intimidate, haggle, court, speeches | Check passed: 10 × tier (1–6); failed 2; haggle won 10; salutatio small talk 5 (once per patron per day); popina debate won 15 (repeatable daily); radiant persuasion jobs 20–40; court case won 100; crowd speech 50 |
| 13 | `mercatura` | Trade (*Mercatura*) | Civic | pietas | 1.0 | buying, selling, fencing, investments | Per transaction worth ≥ 1 den.: 1 + value/10 (max 50); each repeat of the same item with the same vendor on the same day gives ×0.5; fencing ×1.5 |
| 14 | `medicina` | Medicine (*Medicina*) | Civic | health | 1.0 | bandaging, remedies, poisons, diagnosis | Bandaging yourself 3; treating an NPC or follower 15; new effect learned 5. Remedy-making (10 + 5 per effect) arrives with the crafting workbench in v0.5. |
| 15 | `fabrica` | Smithing (*Fabrica*) | Civic | health | 1.0 | improve, repair, cast lead shot, forge | Improve 10 + value/20; repair 5; casting 10 glandes 6. Forging arrives with crafting recipes in v0.5. |
| 16 | `religio` | Rites (*Religio*) | Civic | pietas | 1.0 | prayer, offerings, vows, omens, festivals | Daily prayer 8; offering 5 + value/2 (max 30); vow fulfilled 40; festival rite 25; omen read 10 |
| 17 | `equitatio` | Riding & Driving (*Equitatio*) | Civic | stamina | 0.8 | chariot racing (city); riding (expansions) | 2 per 100 m driven or ridden; race lap 15; race won 100 (no source before chariot racing in v0.4) |

Naming note: the *skill* is `religio` so that it never collides with the *resource* `pietas`.

### 5.5 Perks (the core set: 4 per skill; 1 point each)

Requirements are skill levels. Every skill's **first perk needs 15**, so each origin's +10 and +5 skills qualify at once and the first perk arrives inside the first session. Effects use `ModifierId` names from `src/rpg/types.ts` where one exists, and flags otherwise.

- **`PerkDef.requiresSystem`** (a field to add): the system a perk depends on (`sling`, `bow`, `bleeding`, `allies`, `market-days`, `crafting`, `racing`, `beasts`, …). Perks whose system isn't shipped in the running version are **hidden**, never offered as dead picks.
- **Perk economy** [design]: every skill at 100 means character level ~81 and ~80 perk points; a level-50 character holds 49. The 68 core perks would run out by mid-game and erase build identity, so **v1.0 grows the tree to 6–8 perks per skill (about 120)**: the first perk of each skill gets 3 ranks (Req 15 / 35 / 55, the effect scaling ×1 / ×2 / ×3 where numeric), and each skill's top tier splits into an **exclusive pair** (pick one; e.g. Testudo vs Practised Parry in a later shield tier). Authoring the extra perks is a content-pass task.

| Skill | Perk ID | Name | Req | Effect |
|---|---|---|---|---|
| blades | `perk-blades-punctim` | Punctim ("with the point") | 15 | Thrusts +25% damage vs mail and plate |
| blades | `perk-blades-bilbilis-edge` | Bilbilis Edge | 35 | Cut bleed chance +15 percentage points |
| blades | `perk-blades-pugio-draw` | Pugio Draw | 50 | Riposte on a staggered foe below 30% HP is an instant finisher |
| blades | `perk-blades-falx-hook` | Falx Hook | 65 | Falx and sica attacks ignore 50% of block mitigation |
| spear | `perk-spear-longa-manus` | Long Reach | 15 | +0.3 m reach with spears |
| spear | `perk-spear-pilum-volley` | Pilum Volley | 30 | Thrown weapons +30% damage; pila stuck in shields halve block mitigation |
| spear | `perk-spear-venator` | Venator | 45 | +30% damage vs beasts |
| spear | `perk-spear-brace` | Brace | 60 | Blocking with a spear against a charge: the attacker takes 2× damage and staggers |
| archery | `perk-archery-steady-draw` | Steady Draw | 15 | Hold drain −30%; slight zoom at full draw |
| archery | `perk-archery-lead-shot` | Lead Shot | 30 | Lead glandes +50% poise damage |
| archery | `perk-archery-cretan-eye` | Cretan Eye | 50 | Aim sway −60%; full draw 0.2 s faster |
| archery | `perk-archery-moving-shot` | Moving Shot | 60 | Draw and whirl at jogging speed |
| shield | `perk-shield-umbo` | Umbo Strike | 15 | A power bash (hold F while blocking) knocks down non-elite humans |
| shield | `perk-shield-testudo` | Testudo | 30 | A raised scutum stops missiles from 180° and blocks them for 0 stamina |
| shield | `perk-shield-parry-plus` | Practised Parry | 40 | Parry window +0.06 s |
| shield | `perk-shield-wall` | Shield Wall | 60 | Block stamina cost −30% per ally within 2 m (max −60%) |
| brawling | `perk-brawling-caestus` | Caestus | 15 | Fist and caestus damage +50% |
| brawling | `perk-brawling-subdue` | Subdue | 30 | All blunt weapons knock out (never kill) non-boss humans |
| brawling | `perk-brawling-pankration` | Pankration | 50 | An unarmed power attack becomes a grapple-throw (knockdown 2 s) |
| brawling | `perk-brawling-fustis` | Fustis Discipline | 60 | Blunt hits on staggered foes disarm 25% of the time |
| heavy-armor | `perk-heavy-armor-well-fitted` | Well Fitted | 15 | Removes the −15% stamina regeneration penalty of heavy armor |
| heavy-armor | `perk-heavy-armor-drill` | Segmentata Drill | 40 | +30 poise in heavy armor |
| heavy-armor | `perk-heavy-armor-cingulum` | Cingulum | 50 | Removes the +25% sprint cost of heavy armor |
| heavy-armor | `perk-heavy-armor-iron-skin` | Iron Skin | 70 | `armor.heavy` +0.15 (AR of heavy pieces +15%) |
| light-armor | `perk-light-armor-manica` | Gladiator's Manica | 15 | Cannot be disarmed; manica AR ×2 |
| light-armor | `perk-light-armor-nimble` | Nimble | 30 | Dodge stamina −30% |
| light-armor | `perk-light-armor-padded` | Padded | 40 | −20% blunt damage taken |
| light-armor | `perk-light-armor-unburdened` | Unburdened | 60 | Worn light armor weighs nothing |
| athletics | `perk-athletics-second-wind` | Second Wind | 15 | Once per fight, at 0 stamina, instantly regain 40 |
| athletics | `perk-athletics-roof-runner` | Roof-runner | 30 | Mantle cost −50%; no fall damage below 6 m |
| athletics | `perk-athletics-swimmer` | Tiber Swimmer | 40 | Swim speed +30%; resists the Tiber current |
| athletics | `perk-athletics-cursor` | Cursor | 60 | `stamina.sprintCost` −0.25 |
| stealth | `perk-stealth-crowd-blend` | Crowd Blend | 15 | Crowd cover factor 0.4 (base 0.6); standing still in a crowd breaks pursuit sight lines |
| stealth | `perk-stealth-night-walker` | Night Walker | 30 | −25% visibility in darkness |
| stealth | `perk-stealth-silent-hobnails` | Silent Hobnails | 40 | No noise penalty for caligae or heavy armor |
| stealth | `perk-stealth-assassin` | Sicarius | 60 | Melee sneak attacks ×4 (daggers ×6) |
| pickpocket | `perk-pickpocket-light-fingers` | Light Fingers | 15 | +10 percentage points to lift chance |
| pickpocket | `perk-pickpocket-sector-zonarius` | Sector Zonarius ("purse-cutter") | 40 | Cut the whole purse in one lift |
| pickpocket | `perk-pickpocket-plant` | Plant | 50 | Plant items, including evidence (used by the main quest) |
| pickpocket | `perk-pickpocket-crowd-cover` | Crowd Cover | 60 | A failed lift inside a crowd of 3 or more is not attributed to you: no bounty, only an alert |
| locks-seals | `perk-locks-light-touch` | Light Touch | 15 | Set zone +20% |
| locks-seals | `perk-locks-tumbler-sense` | Tumbler Sense | 30 | Audible click and highlight on the correct lift height |
| locks-seals | `perk-locks-reseal` | Reseal | 40 | Open and reseal wax seals without a trace |
| locks-seals | `perk-locks-forger` | Forger | 60 | Cut a seal ring from a wax impression (a capital-grade crime, *falsum*) |
| rhetoric | `perk-rhetoric-exordium` | Exordium | 15 | +10 to your first check with each NPC |
| rhetoric | `perk-rhetoric-clientela` | Clientela | 30 | "Invoke patron" option +15 |
| rhetoric | `perk-rhetoric-advocatus` | Advocatus | 50 | One extra argument per round in court debates |
| rhetoric | `perk-rhetoric-laudatio` | Laudatio | 60 | Speak to crowds: calm riots, gain Fama |
| mercatura | `perk-mercatura-nundinae` | Nundinae | 15 | −10% buying prices on market days, at every vendor |
| mercatura | `perk-mercatura-fence` | Receptator | 30 | Sell stolen goods to any fence at the full fence rate |
| mercatura | `perk-mercatura-nauticum` | Faenus Nauticum | 50 | Invest in a cargo: after 30 days, +40% (80%) or a total loss (20%). The outcome is **rolled with a seeded RNG when you invest** (reloading can't change it), and the stake is capped at 20% of the banker's purse. |
| mercatura | `perk-mercatura-argentarius` | Argentarius | 60 | Vendor purses +100%; haggling +15 |
| medicina | `perk-medicina-celsus` | Celsus' Method | 15 | Bandages cure bleeding and heal +50% |
| medicina | `perk-medicina-dioscorides` | Dioscorides | 30 | Tasting an ingredient reveals 2 effects |
| medicina | `perk-medicina-theriaca` | Theriac | 40 | Brew theriac; immune to poison for 1 game hour after drinking it |
| medicina | `perk-medicina-soporificum` | Soporific | 50 | Brew knockout poison for weapons |
| fabrica | `perk-fabrica-plumbum` | Lead Caster | 15 | Cast inscribed glandes (+10% sling damage) |
| fabrica | `perk-fabrica-noric` | Noric Steel | 30 | Improve iron and Noric steel one quality tier further |
| fabrica | `perk-fabrica-armorer` | Armorer of the Legion | 40 | Repair in the field with a repair kit |
| fabrica | `perk-fabrica-bilbilis` | Bilbilis Temper | 60 | Improve Bilbilis steel; improved blades +10% damage |
| religio | `perk-religio-votum` | Votum | 15 | Vow buffs +50% |
| religio | `perk-religio-augur` | Augur's Eye | 30 | The daily omen offers a choice of two |
| religio | `perk-religio-lararium` | Lararium | 40 | Praying at your home lararium fully restores Pietas once a day |
| religio | `perk-religio-pax-deorum` | Pax Deorum | 60 | `pietas.max` +25; invocations cost 20% less |
| equitatio | `perk-equitatio-quadriga` | Quadriga | 15 | Team stamina +20% in races |
| equitatio | `perk-equitatio-hortator` | Hortator | 30 | Whip cooldown −30% |
| equitatio | `perk-equitatio-spina` | Spina Hug | 50 | Turning at the metae loses 15% less speed |
| equitatio | `perk-equitatio-eques` | Eques | 60 | Mounted attacks +25% (expansions) |

---

## 6. Combat

All numbers are Normal difficulty (`normalis`) unless marked. Timings are real seconds.

**`inCombat` (one predicate for every system):** true while any hostile with suspicion ≥ 100 toward the player (§14.2) has been within 40 m at any moment in the last 8 s. It is the only definition of "in combat": Space dodges only while `inCombat` with a weapon drawn (§4.2), and health regeneration (§3.3), saving (§14.13), waiting and sleeping (§14.8) and fast travel (§14.12) are all blocked while it is true.

### 6.1 Verbs at a glance

| Verb | Input | Stamina | Timing (gladius; scaled by weapon speed) |
|---|---|---|---|
| Light attack (3-hit chain) | Tap F | `5 + 2 × weapon kg` (gladius 7.4) | Wind-up 0.25, active 0.12, recovery 0.30; input buffer 0.25. The 3rd hit is ×1.25. |
| Power attack | Hold F ≥ 0.35 s; direction latched from WASD (below) | 3 × light (min 20) | Charge ×1.5 at 0.35 s, rising to ×2.0 at 0.8 s; auto-release at 1.0 s |
| Block | Hold or toggle Q (toggle rule in §4.2) | 0 to hold; absorbing costs (§6.4) | Guard up 0.1 s |
| Parry (timed block) | Press Q in the window before impact (in toggle mode a tap parries without changing the guard) | 0 | Window **0.20 s** (§6.12) |
| Shield bash | F while blocking | 18 | 0.35 s; interrupts power wind-ups |
| Dodge | Space while `inCombat` with a weapon drawn, or Option, + direction | 15 | 2.5 m over 0.3 s; i-frames 0.12 s; recovery 0.2 s; the third dodge within 1 s costs double |
| Sprint attack | F while sprinting | light × 1.5 | ×1.3 damage, ×1.5 poise (momentum) |
| Lock-on | X | 0 | Acquire within 15 m and ±35° of screen centre; breaks at 20 m or after 2 s without sight |
| Ranged | Hold F to draw, release to shoot, Q cancels | §6.8 | §6.8 |
| Invoke deity | Z | Pietas (§14.6) | 0.6 s gesture |
| Yield | Hold Y 1 s | 0 | Only where accepted (§6.9) |

**Power attack multiplier:** `attackMult = chargeMult(t) × dirFactor`, where `chargeMult` rises from 1.5 (at 0.35 s) to 2.0 (at 0.8 s). The direction multiplies the charge; it never replaces it.

| Direction | `dirFactor` | Type (blades) | Extra | At full charge |
|---|---|---|---|---|
| **None = overhead** (Must in v0.1) | 1.0 | cut (spears: a downward thrust) | +50% poise damage | ×2.0 |
| Forward = lunge | 1.0 | thrust | +1.5 m step | ×2.0 |
| Sideways = sweep | 0.7 | cut | hits **hostiles only** in a 140° arc | ×1.4 |
| Back = step-back cut | 0.65 | cut | disengage 1.5 m | ×1.3 |

- **Priority:** the overhead power attack is **Must** for v0.1; the three directional ones are **Should** (they need their own animations, §6.15, and a two-key chord).
- **Direction latch:** the direction is the last movement input held within **0.25 s before** the hold threshold, so you can tap D, let go and then hold F; no D + F chord on the same finger. Setting **"simple power"**: direction = current movement intent, or overhead if none.
- **Which hits are thrusts and which are cuts** is in the attack-type table (§6.2).

### 6.2 Damage formula

```
raw     = W.damage × (1 + skill/200) × (1 + Σ damage.<class> modifiers)
          × attackMult × sneakMult × critMult
          × (attacker is player ? difficulty.dealt : profile.dmgMult × difficulty.taken*)
typed   = raw × TYPE_VS_FAMILY[attack's damageType][target's armorFamily]
final   = max(1, typed × (1 − armorReduction(AR)) × (blocking ? 1 − blockMitigation : 1))
armorReduction(AR) = min(0.60, AR / (AR + 120))
AR      = Σ AR of worn pieces × (1 + armorSkill/250) × (1 + armor.light|armor.heavy)
```
\* `difficulty.taken` applies only to damage dealt **to the player**. NPC-vs-NPC damage uses 1.0.

- `attackMult`: light 1.0 (3rd chain hit 1.25); power = `chargeMult × dirFactor` (§6.1); bash 0.3 (blunt); riposte ×2.0.
- **Damage type of each attack** (`attackTypes` per weapon, in the weapon data). A dual-type weapon has two damage values (gladius 13 thrust / 11 cut; spatha 14 cut / 12 thrust), and **the attack's type picks the value**. Bleeding (cuts only), Punctim (thrusts) and Bilbilis Edge (cuts) key off this type.

| Weapon | Light chain (1 / 2 / 3) | Overhead power | Forward | Sideways / back |
|---|---|---|---|---|
| Gladius | thrust / cut / thrust | cut | thrust | cut |
| Spatha | cut / cut / thrust | cut | thrust | cut |
| Pugio | thrust ×3 | thrust (downward stab) | thrust | thrust |
| Sica, falx, dolabra | cut ×3 | cut | cut | cut |
| Spears, trident, pilum in melee | thrust ×3 | thrust (downward) | thrust | thrust |
| Fists, caestus, fustis, clava, vitis, rudis | blunt ×3 | blunt | blunt | blunt |
- `critMult`: 3% chance of ×1.5 on non-sneak hits (Fortuna +5 points). Grounded as "a lucky stroke"; no visual effect beyond a heavier sound.
- **Ranged headshots:** ×1.5 bare-headed, ×1.2 helmeted.
- **Bleeding:** cut hits from blades have a 20% chance (35% on power attacks) of 2 HP/s for 6 s, stacking up to ×3. The chance is halved if the target's AR ≥ 30. Bandages cure it.

**Damage type vs body-armor family** (`TYPE_VS_FAMILY`):

| Family | Cut | Thrust | Blunt | Examples |
|---|---|---|---|---|
| `cloth` | 1.00 | 1.00 | 1.00 | tunic, toga, bare chest (most gladiators) |
| `padded` | 0.80 | 0.90 | 0.75 | subarmalis, leather cuirass, cardiophylax |
| `mail` | 0.60 | 0.85 | 0.85 | lorica hamata, squamata |
| `plate` | 0.50 | 0.75 | 0.80 | lorica segmentata, muscle cuirass |

So the Roman doctrine emerges by itself: **thrust beats cut against armor, and blunt beats both against mail and plate.**

**Lethality check:** an iron gladius at Blades 25 does `13 × 1.125 = 14.6`.

| Target | Hits to kill |
|---|---|
| Thug in a tunic (45 HP) | **4** thrusts (3 with a Noric-steel gladius, §8.1) |
| Urban soldier, segmentata + helmet, AR 50 (70 HP) | **10** thrusts, 14 cuts, 9 clava blows (Brawling 25) |
| Player in a tunic (100 HP) vs a sicarius (sica 11, skill 50, tier 1.15, Normal 1.5 → 23.7) | **5** hits |
| The same player in mail and helmet, AR 42 | **10** hits |

These hit the targets of 3–5 hits for the unarmored and 6–10 for the armored.

### 6.3 Armor

- Worn pieces add AR (§8.3). A shield adds **no** passive AR; it works only through blocking.
- **Heavy armor penalties** (removed by perks): stamina regeneration −15%, sprint cost +25%, footstep noise +50%, swimming impossible above 15 kg of armor. **The armor class is the class of your body piece** (§8.3): a heavy cuirass triggers the penalties and Heavy Armor XP; helmets, greaves and manicae add only AR and weight, so one gladiator helmet over light kit never makes you "heavy".
- **Condition** 0–100%: AR, damage and shield block mitigation scale by `0.75 + 0.25 × condition`. Condition drops **1% per 100 damage** dealt (weapons) or absorbed (armor and shields), about 4% over the whole v0.1 golden path. Repairs at a smith, at the arms dealer (v0.1, §7.3) or with a kit (§8.5).

### 6.4 Blocking and parrying

| Item | Value |
|---|---|
| Block arc | 120° in front |
| Block mitigation | `base + (0.95 − base) × shieldSkill/200`, where `base` is the shield value (§8.4) or weapon-only: blades 0.45, two-handed spear or falx 0.55, fists 0.25. Perks and formation bonuses add on top. **Cap 0.90.** So skill matters all the way to 100 and helps small shields most: scutum 0.85 → 0.90, parmula 0.58 → 0.77, blades 0.45 → 0.70. |
| Stamina per absorbed hit | `max(4, 0.6 × raw × (1 − shieldSkill/200))` |
| Guard break | At 0 stamina while blocking: stagger 1.2 s |
| Missiles | Blocked with a scutum 100%, oval 90%, parma 70%, parmula 60%, no shield 0% (arrows can't be blocked with a sword) |
| **Parry window** | Press block within **0.20 s before impact** (in toggle mode a tap parries without changing the guard, §4.2) (Tiro 0.40, Facilis 0.30, Difficilis 0.14, Herculea 0.10; `perk-shield-parry-plus` +0.06) |
| Parry effect | 0 damage, 0 stamina; the attacker loses 60% of max poise and staggers 1.0 s; opens a **0.8 s riposte window** (×2 damage, guaranteed stagger; a target ≤ 25% HP takes a finisher) |
| Parrying power attacks | Only with a shield. A weapon-only parry of a power attack counts as a normal block. |
| Unblockable attacks | Falx sweeps, net throws, beast charges and grapples, boss "red" attacks. **Dodge them.** They are telegraphed by a longer anticipation, a distinct grunt, and a brief cinnabar pulse on the screen edge (a HUD cue, not in-world magic). |

### 6.5 Poise, stagger and hit-stop

| Item | Value |
|---|---|
| Player poise | 50; heavy body armor +10 to +15; shield raised +20; trait and perk bonuses |
| Poise damage | `weapon.stagger` × (light 1.0, power 2.5, bash 2.0, sprint attack 1.5, parry 60% of max) |
| Poise regeneration | 15/s after 1.5 s with no poise damage |
| Poise break | Stagger 0.8 s (light attacks) or 1.5 s (power, bash or parry), which opens the riposte window. Poise refills to max when the stagger ends. |
| **Anti-loop rules** | (1) When any stagger ends, the victim has **1.5 s of poise immunity** (it counts as "no poise damage", so regeneration starts after it). (2) A riposte's guaranteed stagger **never opens a new riposte window**. (3) At most **2 staggers on one target within 4 s**; a third qualifying hit only flinches. |
| Flinch | A hit that doesn't break poise interrupts the victim's *light* wind-up only if its poise damage ≥ **20% of max for NPCs, 35% of max for the player**. A flinch never interrupts a block, a dodge or a recovery. After any flinch the victim has **0.4 s of flinch immunity**, so two attackers can't flinch-lock the player. Power wind-ups of heavy weapons and of bosses have **hyper-armor**. |
| Knockdown | 2 s on the ground: shield `perk-shield-umbo`, pankration, bear charge, net |
| **Hit-stop** | Light 0.05 s, power 0.08 s, parry, riposte or finisher 0.12 s. Time scale 0.1 during it. |
| Camera shake | 0.02 / 0.05 / 0.08 m (light / power / finisher); toggleable |
| NPC telegraphs | Minimum wind-ups (Normal): light 0.35 s, power 0.70 s, each with body anticipation and an audio cue |

### 6.6 Movement in combat

Speeds (code: `PLAYER_SPEEDS`): walk 1.9, run 4.4, sprint 7.0, sneak 1.5 m/s. Backpedal ×0.7, strafe ×0.9, swim 1.4 (2.2 sprinting). While `inCombat` with a weapon drawn, run speed is ×0.85. **Jump apex target 1.0–1.2 m** (the code currently uses 5.6 m/s, about 1.6 m; tune it down). Mantle ledges up to 2.0 m.

**Stamina outside attacks:** sprint 8/s (heavy armor +25%), jump 5, mantle 10, fast swim 6/s, bow held at full draw 4/s after 1.5 s, sling whirl held 3/s, pilum or javelin throw 12. At 0 stamina you cannot attack, sprint or dodge until 15 has regenerated.

**Fall damage:** `(h − 4) × 10` HP for falls of h > 4 game m. Cliffs are scaled ×0.6 like everything else, so the Tarpeian Rock (about 25–30 m real, 15–18 game m) does 110–140 HP: fatal for most characters.

### 6.7 Sneak attacks

| Attack | Multiplier |
|---|---|
| Melee, unaware target (target suspicion < 35, §14.2) | ×3 (`perk-stealth-assassin`: ×4) |
| Pugio or sica | ×4 (with the perk ×6) |
| Ranged | ×2 |
| Fists or fustis from behind on a human up to `veteran` tier | **Instant knockout** (1.2 s takedown) |

### 6.8 Ranged weapons

| Weapon | Aim | Damage | Type | Speed (m/s) | Effective range | Notes |
|---|---|---|---|---|---|---|
| `arcus` composite bow | Full draw 0.9 s (partial draw from 0.4 s does 50%) | 16 per `sagitta` | thrust | 55 (gravity) | 60 m | 50% of arrows recoverable |
| `funda` sling | Whirl 0.7 s | 12 lead `glans` / 8 stone | blunt | 60 / 45 | 50 m | Stagger 25; **loud** (alerts within 15 m); stones can be picked up free |
| `pilum` | Aim 0.6 s | 30 | thrust | 25 | 25 m | **Sticks in shields:** the target's block mitigation −50% until it drops the shield. NPCs drop a shield after 2 pila. |
| `iaculum` javelin | 0.5 s | 18 | thrust | 28 | 30 m | Carry up to 5 |
| `rete` net | 0.6 s | 0 | — | 14 | 6 m | Entangles 3.0 s (bosses 1.5 s). Struggle free by mashing E or F (−0.4 s per press). While entangled you can still raise a shield (no parry, no attack). |

There is a reticle in both views, plus aim assist by control preset (§4.3). A drawn shot can be held (bow hold drain 4 stamina/s after 1.5 s).

### 6.9 Non-lethal options: knockout and yield

- **Knockout weapons:** fists and caestus *always* knock humans out at 0 HP. Fustis, clava and vitis knock out humans up to `miles` tier (all non-boss humans with `perk-brawling-subdue`). KO lasts 60 game minutes (3 real minutes). Killing a KO'd person takes a deliberate **Hold F** on the body (a crime if witnessed).
- **Brawls** (*rixa*, started in dialogue or by throwing the first punch) are non-lethal by rule. Drawing a blade turns a brawl into assault.
- **NPC yield:** at HP ≤ `yieldAt` the NPC drops its weapon and kneels (in the arena it raises a finger, *ad digitum*). Choose:

| Choice | Effect |
|---|---|
| **Spare** | Pietas +5, Fama +2 in the district; some spared foes return later as informants |
| **Rob** | Take the purse. *Furtum* if witnessed. |
| **Arrest** | Needs a mandate: Vigiles rank ≥ `sebaciarius` (at night), Urban Cohorts rank ≥ `miles`, or a bounty contract. Pays the bounty. |
| **Kill** | Pietas −15 always. Crime `caedes-supplicis` if witnessed. |

- **Player yield:** hold Y for 1 s. In a brawl you lose 10% of your purse and the fight ends. During an arrest it opens the arrest dialogue (§14.1). In the arena it triggers the missio roll (§6.10).

### 6.10 Arena: crowd favor and missio

- **Crowd favor** runs 0–100. It starts at 30 (+10 if your Fama with the plebs > 30). It is shown on the arena HUD.

| Gains | | Losses | |
|---|---|---|---|
| Parry | +6 | Retreating > 3 s | −2/s |
| Riposte or finisher | +8 | No attack for 6 s | −5 |
| Power hit | +3 | Striking a yielded fighter | −20 (and a crime at public games) |
| Fighting to your armatura (signature move) | +4 | Dirty trick (thrown sand, low blow) | −8 (unless you play a villain) |
| Dodging an unblockable | +4 | | |
| Saluting the editor's box (hold E, favor ≥ 50, once per bout) | +5 | | |
| Sparing at the right moment | +10 | | |

- **Full favor (100):** hold E toward the crowd. They throw gifts: coins (5–50 den.), wine (restores 40 stamina), and a 20% chance of a better weapon. Favor resets to 60.
- **Missio when you yield:** you are spared if favor ≥ 50, with 50% chance at 30–49, and 10% below 30 (Nemesis patron +15 points; always spared on Tiro). Spared means you wake in the Saniarium with `injured` (−20% max HP for 1 game day). Not spared means death and a reload, except in a *lusio*.
- **Lusio (practice bout with *arma lusoria*):** the Ludus's training bouts, including all of `lud-01`, use blunted practice arms (`rudis`, `tridens-lusorius`, §8.1) [P: blunt *arma lusoria* were used in the warm-up *prolusio*; RE "Arma lusoria"]. Practice arms are blunt and **never kill**: a fighter at 0 HP is knocked out. If you yield in a lusio and are "not spared", the doctor stops the bout: you wake in the Saniarium with `injured` and lose the purse. Real steel and real missio start with public munera (`lud-03` onward).
- **When an opponent yields,** the crowd's wish shows as a chant: *Mitte!* (let him go) or *Iugula!* (cut his throat). The editor's gesture is a hand signal, never the modern thumbs-down, whose meaning is debated [A]. Going against the crowd changes favor by ±15. *Stans missus* (both left standing, a draw) is possible when both fighters are below 30% HP and favor ≥ 70.
- **Purse** = base purse × (1 + favor/100).

### 6.11 Enemy tiers

`CombatProfile.tier` values. `dmgMult` multiplies the weapon's damage. Speed is a multiplier on the NPC's locomotion. Reaction is the delay before a *reactive* guard, dodge or counter (§6.13); it does not apply to a guard that is already up.

**`CombatProfile` must carry what the formulas read** (extend `src/rpg/types.ts`, which today has only `tier, health, stamina, armor, weapon, shield, aggression, blockSkill, yieldAt, fleeAt, skill, loot`): `band` (0–5), `dmgMult`, `poise`, `reactionS`, `speedMult`, `attackIntervalS` (overrides the §6.13 lerp when set), `tokensCost` (attack tokens the NPC uses: 1, bosses 2), and `armorFamily` (`'cloth' | 'padded' | 'mail' | 'plate'`, **derived from the equipped body piece** when the NPC has equipment, §6.14). Tier rows below supply the defaults; archetypes and bosses (§13.2) override them.

| Tier ID | Band | HP | Stamina | AR | dmgMult | Speed | Aggression | Block skill | Poise | Reaction (s) | Skill | yieldAt | fleeAt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `civilian` | 0 | 30 | 50 | 0 | 0.6 | 1.0 | 0.10 | 0.05 | 20 | 0.60 | 5 | 0.50 | 0.60 |
| `thug` | 1 | 45 | 60 | 0–6 | 0.9 | 1.0 | 0.55 | 0.15 | 30 | 0.45 | 15 | 0.25 | 0.15 |
| `bruiser` | 1–2 | 75 | 80 | 10 | 1.0 | 0.95 | 0.70 | 0.20 | 55 | 0.45 | 25 | 0.20 | 0.10 |
| `skirmisher` | 1–2 | 45 | 70 | 6 | 1.0 | 1.05 | 0.50 | 0.10 | 30 | 0.40 | 30 | 0.25 | 0.20 |
| `miles` | 2–3 | 70 | 100 | 45–50 | 1.0 | 0.95 | 0.50 | 0.55 | 60 | 0.35 | 35 | 0.15 | 0.05 |
| `veteran` | 3 | 95 | 110 | 20–55 | 1.15 | 1.0 | 0.60 | 0.60 | 70 | 0.30 | 50 | 0.30 (arena) | 0 |
| `champion` | 3–4 | 140 | 130 | 25–60 | 1.3 | 1.05 | 0.65 | 0.70 | 90 | 0.25 | 70 | 0.30 (arena) | 0 |
| `elite` | 4 | 120 | 120 | 55 | 1.3 | 1.0 | 0.60 | 0.75 | 85 | 0.22 | 70 | 0.10 | 0 |
| `boss` | — | 300–700 | 150 | per boss | 1.4 | per boss | per phase | 0.6–0.8 | 150+ | 0.20 | 80 | scripted | 0 |

**Beasts** (they never yield, flee at their `fleeAt`, and use only unblockable charges and grapples for their heavy attacks):

| ID | HP | Damage (type) | Speed (m/s) | Poise | fleeAt | Notes |
|---|---|---|---|---|---|---|
| `canis` (stray dog) | 25 | 6 cut | 7.5 | 15 | 0.4 | Packs of 2–4 at night |
| `canis-molossus` (Molossian hound) | 45 | 10 cut | 8.0 | 30 | 0.2 | Fugitivarii and guards |
| `lupus` (wolf, arena) | 50 | 10 cut | 8.0 | 25 | 0.2 | |
| `aper` (boar) | 90 | 16 thrust | 7.0 | 60 | 0 | Charges |
| `pardus` (leopard) | 120 | 14 cut | 9.0 | 40 | 0.15 | Pounce (grapple) |
| `leo` (lion) | 200 | 20 cut | 8.5 | 80 | 0 | Pounce, maul |
| `ursus` (bear) | 240 | 22 blunt | 6.5 | 120 | 0 | Charge knocks you down; rears up (a telegraph) |
| `taurus` (bull) | 260 | 25 thrust | 7.5 | 150 | 0 | Charge only; turns slowly |
| `crocodilus` | 320 | 24 cut | 2.5 on land / 6 in water | 140 | 0 | Death-roll grab (mash to escape) |
| `rattus` swarm | — | 1/s while inside | — | — | — | A hazard, not a target. Torches disperse it. |

### 6.12 Difficulty

| ID | Name | Damage dealt | Damage taken | Parry window | Attack tokens | Death |
|---|---|---|---|---|---|---|
| `tiro` | Tiro (story) | ×1.5 | ×0.5 | 0.40 s | 1 | **Aesculapian rescue:** wake in the Temple of Aesculapius with −20% coin (people found you; no miracle) |
| `facilis` | Facilis | ×1.25 | ×1.0 | 0.30 s | 2 | Reload |
| `normalis` | Normalis (default) | ×1.0 | ×1.5 | 0.20 s | 2 | Reload |
| `difficilis` | Difficilis | ×0.85 | ×2.0 | 0.14 s | 3 | Reload |
| `herculea` | Herculea | ×0.75 | ×3.0 | 0.10 s | 3 | Reload |

The parry window can be overridden on its own in Accessibility. **v0.1 ships three levels** (`tiro`, `normalis`, `difficilis`); `facilis` and `herculea` are Should.

### 6.13 AI behaviours

Combat AI is a utility-scored state machine, re-evaluated at 10 Hz.

| State | Trigger and rule |
|---|---|
| `approach` | Hostile, out of reach: path to the target and stop at weapon reach + 0.3 m |
| `engage` | Holds an **attack token** (§6.12). Attack interval = lerp(2.5 s, 0.9 s, aggression). Light attacks 70%, power 30% (elites 40%). |
| `circle` | No token: strafe at 3–5 m (1.5 m/s), alternating direction every 2–4 s. Ranged allies throw or shoot instead. |
| `guard` (pre-emptive) | In `circle`, and in `engage` between attacks, a shield- or weapon-bearing NPC **holds its guard up** for a fraction of the time = blockSkill × 0.6 (thug 9%, miles 33%, elite 45%), in spells of 1–3 s, with its stamina regeneration halved while guarding (as for the player). A light attack that lands on a raised guard is blocked. This is why a `miles` blocks light-attack spam even though its reaction is slower than a gladius' 0.25 s wind-up. |
| `feint` | Tiers ≥ `veteran`: chance 0.25 × aggression to start a wind-up and cancel it at 40% |
| `block` (reactive) | Raising the guard reacts to **the player entering reach while facing the NPC (±60°)**, not to the wind-up: chance = blockSkill (−30% if the NPC's stamina < 30%), after the reaction time. A reactive guard is held while the player stays in reach and facing it, until the NPC takes a token to attack or its stamina falls below 30%. Against a power attack (wind-up ≥ 0.35 s) the NPC can also react to the wind-up itself. Elites and champions can parry (chance blockSkill × 0.4). The reaction time also delays dodges and counters. |
| `retreat` | Stamina < 25%: back off 2–4 m to regenerate; ranged NPCs also retreat when the player is within 6 m |
| `call-help` | At combat start and at 50% HP: shout radius 30 m (day) or 20 m (night). Allies of the same group respond, plus lawful guards if the player is the aggressor. |
| `formation` | 3+ `miles`: shields line up (+15% block), one pilum volley at 15–25 m, then advance in step |
| `flee` | HP ≤ fleeAt: run to the nearest safe point (home, guard, crowd); may return after 2 game hours |
| `yield` | HP ≤ yieldAt: drop the weapon, kneel (§6.9) |
| `ranged-kite` | Skirmishers keep 12–30 m, strafe after each shot, seek cover and high ground, and switch to a dagger within 3 m |
| `search` | Lost the target: go to its last known position, search 20 s, then return |

### 6.14 Death and loot

- **Player death:** reload the last save (autosaves §14.13), except Tiro's rescue (§6.12) and arena missio (§6.10).
- **NPC death:** a death animation, then a lootable body (E). Bodies persist **3 game days** outdoors and until the interior cell resets (10 game days). Killed named NPCs are recorded as world deltas.
- **Essential NPCs** (fixed stars, quest-critical) kneel for 3 s and become "affronted" instead of dying.
- **Loot tables** (by tier; values in den.):

| Tier | Coin | Common drops | Rare drops (chance) |
|---|---|---|---|
| civilian | 0–1 | food, a wax tablet | dice (10%) |
| thug | 0.2–3 | fustis or pugio (50%), bread (30%), dice (15%) | stolen trinket (10%) |
| bruiser | 1–6 | caestus or clava, posca | collegium token (20%) |
| skirmisher | 1–5 | sling + glandes or bow + arrows | inscribed glans (15%) |
| miles | 3–10 | gladius (iron), helmet (25%), bandage | military pay tablet (10%) |
| veteran / champion | 10–40 | Noric-steel weapon (40%), gladiator armor piece (30%) | Bilbilis steel (10%) |
| elite | 20–60 | Noric or Bilbilis weapon, armor piece | sealed letter (quest lead, 20%) |
| boss | authored | authored unique | — |

- **Equipment visibility:** what an NPC wears and wields is what it drops (weighted by condition).

### 6.15 Animation manifest

**Animation is the critical path of combat.** Every verb above needs a readable clip, and no artist will draw them. Engineers build exactly this list, no more, for each milestone.

- **How clips are made:** code-authored keyframe tables (degrees per bone, with mirroring helpers) on the one procedural skeleton, played by `AnimationMixer` with upper/lower-body track filtering (`tech.md` §5.2–5.3). Key poses are **named pose functions** (`poseGuard(rig)`, `poseChamberHigh(rig)`, …) shared by the player, the NPCs and both camera views (true first person, §4.4).
- **No root motion.** The controller (`Actor.locomote`) moves the capsule; steps, lunges and dodges are displacement curves applied in code.
- **Timing comes from §6.1.** Each attack clip has three phases (wind-up, active, recovery) whose lengths are the §6.1 values divided by the weapon's `speed`. The **hit frame** is the first frame of the active phase. For NPCs only the wind-up phase is time-stretched, holding the anticipation pose, to the telegraph minimums of §6.5 (light ≥ 0.35 s, power ≥ 0.70 s).
- **Three rigs for v0.1:** `rig-blade-shield` (one-handed blade with or without a shield: gladius, spatha, pugio, sica, rudis), `rig-spear` (hasta, trident, with or without a shield; Nereus' net), `rig-unarmed-blunt` (fists, caestus, fustis, clava). v0.0 needs only the first two; until v0.1 the fustis and other one-handed blunt weapons borrow the blade rig's cut clips. Other weapons (falx, bow, sling, javelin) bring their own clips with their systems.

| Clip ID | Rigs | Key poses | Duration (s, speed 1.0) | Hit frame (s) | Displacement (code) | Milestone |
|---|---|---|---|---|---|---|
| `loco-idle/walk/run/sprint/strafe/backpedal/sneak` | all | 2–4 keys per gait cycle; a combat-idle guard per rig | cycle 0.8–1.1; `timeScale = speed / strideSpeed` | — | capsule | v0.0 |
| `jump` / `fall` / `land` | all | crouch-push, tuck, absorb | 0.3 / loop / 0.25 | — | capsule | v0.0 |
| `mantle` | all | hands on ledge, knee up, stand | 0.6 | — | up to 2.0 m | v0.1 |
| `draw` / `sheathe` | per rig | hand to hilt, out, guard | 0.5 / 0.5 | — | — | v0.0 |
| `atk-light-1/2/3` | each rig | guard → chamber (end of wind-up) → extension (active) → return | 0.25 + 0.12 + 0.30 = 0.67 | 0.25 | +0.3 m step | v0.0 (blade, spear); v0.1 (unarmed) |
| `atk-power-overhead` | each rig | high chamber held while charging → strike down → follow-through | hold 0.35–1.0, then 0.15 + 0.45 | at release | +0.5 m | v0.0 |
| `atk-power-forward/side/back` | blade, spear | lunge chamber; wide side chamber; step-back cut | release, then 0.15 + 0.5 | at release | +1.5 m / 0 / −1.5 m | v0.1 Should |
| `atk-sprint` | blade, spear | running chamber, thrust | 0.25 + 0.12 + 0.40 | 0.25 | momentum | v0.1 Should |
| `block-hold` (additive pose) / `block-impact` | per rig, with and without a shield | shield up and weapon cocked; recoil | pose / 0.2 | — | −0.2 m on impact | v0.0 |
| `parry` | per rig | a sharp beat across the line | 0.3 | contact at 0.05 | — | v0.0 |
| `riposte` | per rig | step-in thrust (blade), short jab (spear), hook (unarmed) | 0.15 + 0.10 + 0.35 | 0.15 | +0.6 m | v0.0 |
| `bash` | blade-shield | shoulder into the shield | 0.12 + 0.08 + 0.15 | 0.12 | +0.4 m | v0.1 |
| `finisher` (paired; the victim plays `death-finisher`) | blade, spear | seize and stab | 1.2 | 0.7 | aligned pair | v0.1 Should |
| `dodge-f/b/l/r` | all | one sidestep-hop pose, mirrored and rotated (no rolls in armor) | 0.3 + 0.2 recovery | — | 2.5 m | v0.0 |
| `hit-flinch` (additive) | all | head and torso snap away from the hit | 0.25 | — | — | v0.0 |
| `stagger-short` / `stagger-long` | all | stumble back with arms out; the long one buckles a knee | 0.8 / 1.2–1.5 (stretched) | — | −0.5 / −1.0 m | v0.0 |
| `guard-break` | blade-shield, spear | guard knocked wide | 1.2 | — | −0.3 m | v0.0 |
| `knockdown` | all | fall back, lie, get up | 2.0 | — | −1.0 m | v0.1 |
| `yield-kneel` | all | drop the weapon, kneel; one finger raised (*ad digitum*) in the arena | 1.0, then loop | — | — | v0.0 |
| `ko-collapse` / `death` | all | crumple, then a static ground pose (no ragdoll) | 1.0 | — | — | v0.0 |
| `net-throw` | spear (Nereus) | 0.8 s twirl (the telegraph), cast, recover | 0.8 + 0.2 + 0.5 | release at 0.8 | — | v0.0 |
| `entangled` / `struggle` | all | arms pinned; a jerk per key press | loop / 0.15 per press | — | — | v0.0 |
| `feint` | per rig | the wind-up of `atk-light-1` or `atk-power-overhead`, cancelled at 40% back to guard | — | — | — | v0.1 (veteran and up) |
| `interact` / `use-item` / `invoke` | all | reach; wrap a bandage or drink; hands raised | 0.6 / 1.0 / 0.6 | — | — | v0.1 |
| `salute` | all | weapon raised to the editor's box | 1.0 | — | — | v0.1 |

Checks: a Vitest asserts that every attack clip's hit frame equals its wind-up ÷ weapon speed and that stretched NPC wind-ups meet the §6.5 minimums. A `?scene=animlab` plays each clip on each rig in both views.

---

## 7. Economy

### 7.1 Currency (decision)

- **The main unit is the denarius (`den.`).** It is the unit in code (`Inventory.denarii`, `ItemDef.value`, as in `src/rpg/types.ts`) and in the HUD.
- **Sub-units are real but light:** 1 den. = 4 sestertii (HS) = 16 asses (`as.`) = 64 quadrantes. Amounts are stored as a float **quantized to 1/64 den.** (one quadrans), which IEEE doubles hold exactly.
- **Display:** `12 den. 3 as.` for mixed amounts, `3 as.` below 1 den., and `1 quadrans` for the bath fee. The tooltip shows the sestertius equivalent ("= 49 HS"), because the sestertius was the Romans' unit of account. A setting can show all prices in HS for purists.
- **Coins as flavour:** loot names coin types ("a worn dupondius of Domitian", "a new denarius showing the Column") and they convert to denarii on pickup. An **aureus** (= 25 den.) appears as loot and in rewards. There is no coin weight (encumbrance by coin is an optional realism setting for later).
- **Scale:** cheap goods use historical prices. Arms and armor are close to the `society.md` [G] estimates. Big-ticket status goods (houses, the equestrian census) are **compressed** to about 1/4–1/20 of reality so they stay reachable; the Lexicon states the real figure.

### 7.2 Price table

Base values (`ItemDef.value`) or service fees, before barter modifiers.

| # | Item or service | Price | Note |
|---|---|---|---|
| 1 | Cup of house wine (`vinum`) | 1 as. | "Drink for an as" (CIL IV 1679) [A] |
| 2 | Cup of better wine (`vinum-melius`) | 2 as. | [A] same graffito |
| 3 | Cup of Falernian (`vinum-falernum`) | 4 as. | [A] same graffito |
| 4 | Flask of posca (`posca`) | 1 as. | [G] |
| 5 | Loaf of bread, 1 libra (`panis`) | 1 as. | [P] Pompeii |
| 6 | Bowl of puls (`puls`) | 1 as. | [P] |
| 7 | Popina meal: bread, relish, wine | 3 as. | [P] (Aesernia inn bill CIL IX 2689) |
| 8 | Sausage (`botulus`) | 2 as. | [G] |
| 9 | Cheese portion (`caseus`) | 2 as. | [G] |
| 10 | Olives, a small jar (`olivae`) | 3 as. | [G] |
| 11 | Figs or dates, a bag (`ficus`) | 2 as. | [G] |
| 12 | Honey, a small jar (`mel`) | 6 as. | [G] |
| 13 | Garum dish (`patina`) | 8 as. | [G] |
| 14 | Honey cake (`libum`), also an offering | 1 as. | [G] |
| 15 | Wheat, 1 modius | 1 den. | [P] about 3–4 HS |
| 16 | Full cena at a good caupona | 3 den. | [G] |
| 17 | Bath entry (`balneum` or the Thermae Traiani) | 1 quadrans | [A] |
| 18 | Tip to the capsarius (prevents bath theft) | 1 as. | [G] |
| 19 | Massage and strigil (*unctor*) | 2 as. | [G] |
| 20 | Shave or haircut (*tonsor*) | 2 as. | [G] |
| 21 | Change hair and beard style | 1 den. | [design] |
| 22 | Night's room at a caupona | 4 as. | [G] |
| 23 | Litter hire (`lectica`), per trip | 1 den. | [design] |
| 24 | Tiber ferry crossing | 1 as. | [G] |
| 25 | Laundering a tunic (*fullo*) | 4 as. | [P] about 1 HS |
| 26 | Cleaning a toga | 1 den. | [G] |
| 27 | Letter written by a scribe | 4 as. | [G] |
| 28 | Physician: treat wounds / cure a disease | 2 / 5 den. | [G] |
| 29 | Haruspex reading (a quest hint) | 2 den. | [design] |
| 30 | Augur's consultation | 5 den. | [design] |
| 31 | Horoscope (daily modifier) | 10 den. | [design]; the emperor's horoscope is treason (500, black market) |
| 32 | Curse tablet: blank lead / nail / commissioned from a magus | 2 as. / 1 as. / 3 den. | [G] |
| 33 | Incense: a pinch / a box (`tus`) | 1 as. / 1 den. | [G] |
| 34 | Sacrifice: cockerel / piglet / lamb | 1 / 4 / 6 den. | [G] |
| 35 | Votive terracotta (Tiber Island) | 3 as. | [G] |
| 36 | Advocate's fee (court case) | 50–500 den. | [G]; capped at 2,500 den. (10,000 HS, Claudius) [A] |
| 37 | Collegium entry / monthly dues | 25 den. + an amphora of wine / 5 as. | [A] Lanuvium rules (AD 136) |
| 38 | Trainer lesson | `0.15 × L² + 10` den. | §5.1 |
| 39 | Repair at a smith | 10% of value per 25% condition | [design] |
| 40 | Improvement at a smith (one level) | 25% of value | [design] |
| 41 | Rent: cenaculum (upper flat), per month | 15 den. | [G] (real: about 125–250 den. a year) |
| 42 | Rent: ground-floor flat, per month | 40 den. | [G] |
| 43 | Domus (Caelian / Esquiline) | 8,000 / 12,000 den. | compressed; real 25,000–250,000+ |
| 44 | Tunic (`tunica`) | 4 den. | [P] about 15 HS |
| 45 | Toga, plain / fine · stola, plain / fine · palla, plain / fine | 25 / 80 · 20 / 60 · 8 / 30 den. | [G] |
| 46 | Paenula | 8 den. | [G] |
| 47 | Calcei / caligae / soleae | 4 / 5 / 1 den. | [G] |
| 48 | Pugio / sica / gladius / spatha | 6 / 18 / 22 / 35 den. | [G] (gladius 60–120 HS) |
| 49 | Gladius of Noric / Bilbilis steel | 55 / 132 den. | quality ×2.5 / ×6 |
| 50 | Hasta / pilum / fustis | 12 / 10 / 1 den. | [G] |
| 51 | Composite bow / 10 arrows | 45 / 2 den. | [G] |
| 52 | Sling / 10 lead glandes | 1 / 1 den. | [G] |
| 53 | Scutum / parma | 45 / 25 den. | [G] |
| 54 | Subarmalis / leather cuirass | 20 / 35 den. | [G] |
| 55 | Lorica hamata / squamata | 190 / 220 den. | [G] (mail 500–900 HS) |
| 56 | Lorica segmentata (black market only) | 390 den. | [G] military issue, ×1.5 |
| 57 | Imperial Gallic helmet / manica / pair of greaves | 60 / 15 / 40 den. | [G] |
| 58 | Bandage / poultice / theriac | 2 as. / 4 as. / 15 den. | [G] |
| 59 | Book roll: fine copy (Martial, Book 1) / cheap copy | 5 / 1 den. | [A] Martial 1.117, 13.3 |
| 60 | Wax tablet and stylus / clay lamp / torch | 3 as. / 1 as. / 2 as. | [P] |
| 61 | Lockpick (`hamulus`) | 1 den. | [design] |
| 62 | Fascinum amulet / gold bulla | 2 / 25 den. | [G] |
| 63 | Black pepper / white / long pepper, per libra | 4 / 7 / 15 den. | [A] Pliny *NH* 12.28 |
| 64 | Mule / horse | 130 / 400 den. | [P]/[U] |
| 65 | Grain token (black market) | 25 den. | [G] |
| 66 | Bribe: vigil / aedile's man / official | 2–10 / 10–40 / 50+ den. | [design] |

**Income anchors:** day labor 1 den.; the client's *sportula* 1 den. 9 as. (100 quadrantes [A]); Ludus practice bout 3 den.; guest bout 15–40 den.; public munus bout 80–300 den.; the Primus Palus fight 1,500 den. plus gifts; misc quests 10–60; faction quests 25–150; main quests 100–500 plus status. **Target income:** about 50–100 den. per hour of play early, 300–500 mid-game, 1,000+ late, against the money sinks below.

**Money sinks:** rent, bribes, fines, offerings and vows, patron gifts, collegium dues, legal fees, followers' wages, house purchase and furnishing, the equestrian census (**25,000 den. in assets** at game scale [design]; real 100,000 den.), betting, and improving gear.

### 7.3 Vendors

| Vendor ID | Who | Sells / buys | Purse (den., refreshes every 2 game days) | Example place (v0.1) |
|---|---|---|---|---|
| `popina` | tavern keeper | food, drink; buys food | 40 | Vicus Tuscus |
| `caupona` | innkeeper | rooms, meals, rumors | 60 | near the Circus carceres |
| `pistor` | baker | bread, libum | 20 | Velabrum |
| `macellarius` | market stallholder | food, ingredients | 50 | Forum Boarium / Forum Holitorium |
| `armorum-negotiator` | arms dealer | weapons, armor, ammo; **repairs** (at the smith's price, so v0.1 has a repair service without a smith) | 500 | Sacra Via, near the Ludus Magnus |
| `faber-ferrarius` | smith | repair, improve, raw iron, kits | 300 | Velabrum |
| `vestiarius` | clothier | clothing, cloaks | 150 | Horrea Agrippiana |
| `fullo` | fuller | cleaning (removes `sordidus`), clothing | 30 | Velabrum |
| `seplasiarius` | druggist and perfumer | ingredients, incense | 120 | Vicus Tuscus |
| `medicus` | physician | healing, cures, remedies | 150 | Basilica Aemilia tabernae |
| `librarius` | bookseller | books, papyrus, tablets | 200 | Argiletum (v0.3) |
| `argentarius` | banker | exchange, loans (1% a month, the legal cap [A]), letters of credit | 3,000 | Basilica Aemilia |
| `receptator` | fence | buys stolen goods at 50% of normal sell | 400 | Subura (v0.3) |
| `lanista` | gladiator trainer | arena kit, follower hire, bouts | 400 | Ludus Magnus |
| `aedituus` | temple custodian | offerings, sacrifices, blessings | 100 | Temple of Castor |
| `haruspex` / `mathematicus` / `magus` | diviners | readings, horoscopes, curse tablets | 50 | by the Circus Maximus |
| `tonsor` | barber | appearance, gossip | 20 | Forum Romanum |
| `lecticarius` | litter bearers | fast travel (§14.12) | — | litter stands by the fora |

### 7.4 Barter and haggling

```
buyPrice  = value × max(1.05, 1.60 − 0.50 × mercatura/100 − disposition/200 − Σbuy)
sellPrice = value × min(0.90, 0.35 + 0.35 × mercatura/100 + disposition/200 + Σsell)
fence     : sellPrice × 0.5 (perk-mercatura-fence: × 0.7); non-fences refuse stolen goods
```
- **Every price modifier goes inside the clamps**, summed as fractions: `Σbuy` = `price.buy` modifiers + trait discounts (Bilbilis blades 0.20 for the `hispanus`, street-wise 0.05 at plebeian vendors) + market day 0.10 (stall vendors, on *nundinae*, every 8th elapsed day) + the Nundinae perk 0.10 + festival discounts (the Mercuralia 0.10) + haggle (+0.10 on success, −0.05 on failure) + blessings and patron bonuses. `Σsell` collects the sell-side ones the same way (Saturn's blessing 0.05, Mercury's patronage 0.05, haggle +0.10 / −0.05). Nothing multiplies the result after the clamp.
- **Invariant (no arbitrage):** for the same item, vendor and day, `sellPrice ≤ buyPrice × 0.86`, which the clamps (1.05 and 0.90) guarantee once every modifier is inside them. A Vitest property test checks it over random skills, dispositions and modifier sets.
- `disposition` runs −20…+20 (Fama, origin traits, gifts). **Fama reaches prices only through disposition**; there is no separate Fama price term.
- **Haggle** (one attempt per vendor per day; **Should** in v0.1): a Rhetoric check against the vendor's difficulty (stall Facilis 10, shop Mediocris 25, banker Difficilis 40). Success: Σbuy +0.10 and Σsell +0.10 for the day. Failure: Σbuy −0.05 for the day and −5 disposition.
- Mercatura XP comes from transactions worth at least 1 den., with diminishing returns on repeats (§5.4).

---

## 8. Items

### 8.1 Weapons

Quality tiers (blades and spear heads): **iron** ×1.0 damage · **Noric steel** (*ferrum Noricum*) ×1.15, value ×2.5 · **Bilbilis steel** (blades only) ×1.3, value ×6 · **officer's silvered** ×1.0, value ×4, +5 persuasion with soldiers · **named uniques**. Fabrica improvements add +5% per level (up to +1 below Fabrica 30, +2 at 30–59, +3 at 60+).

| ID | Name | Class | Damage | Type | Speed | Reach (m) | Stagger | kg | Value (den.) | Skill | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `fists` | Fists | unarmed | 4 | blunt | 1.40 | 0.50 | 8 | — | — | brawling | Always knocks out |
| `caestus` | Caestus | unarmed | 7 | blunt | 1.40 | 0.50 | 12 | 0.6 | 8 | brawling | Always knocks out |
| `pugio` | Pugio (dagger) | blade | 8 | thrust | 1.30 | 0.55 | 6 | 0.4 | 6 | blades | Sneak ×4; off-hand finisher |
| `sica` | Sica (curved short sword) | blade | 11 | cut | 1.15 | 0.70 | 10 | 0.6 | 18 | blades | Hooks round shields: ignores 25% of block mitigation |
| `gladius` | Gladius (Pompeii type) | blade | 13 (cut 11) | thrust | 1.00 | 0.75 | 12 | 1.2 | 22 | blades | The all-rounder |
| `spatha` | Spatha | blade | 14 (thrust 12) | cut | 0.90 | 0.95 | 14 | 1.4 | 35 | blades | Cavalry sword |
| `dolabra` | Dolabra (pick-axe) | blade | 15 | cut | 0.85 | 0.80 | 22 | 2.0 | 10 | blades | Vigiles tool; breaks doors |
| `falx` | Falx (Dacian) | blade | 24 | cut | 0.70 | 1.20 | 30 | 2.8 | 60 | blades | Two-handed; ignores 50% of block; power sweep unblockable |
| `rudis` | Rudis (wooden practice sword) | blade | 11 | blunt | 1.00 | 0.75 | 14 | 1.0 | 1 | blades | *Arma lusoria* (§6.10): never kills (KO at 0 HP); trains Blades, not Brawling; issued by the Ludus armory |
| `hasta` | Hasta (spear) | spear | 14 | thrust | 0.90 | 1.80 | 14 | 2.0 | 12 | spear | One-handed with a shield |
| `lancea` | Lancea (light spear) | spear | 11 (thrown 18) | thrust | 1.00 | 1.50 | 10 | 1.2 | 8 | spear | Melee or thrown |
| `venabulum` | Venabulum (boar spear) | spear | 16 | thrust | 0.85 | 1.90 | 18 | 2.4 | 20 | spear | +25% vs beasts; brace |
| `tridens` | Tridens (trident) | spear | 13 | thrust | 0.90 | 1.80 | 12 | 2.2 | 25 | spear | Retiarius kit |
| `tridens-lusorius` | Blunted practice trident | spear | 8 | blunt | 0.90 | 1.80 | 12 | 2.0 | — | spear | *Arma lusoria* (§6.10): never kills; not sold |
| `pilum` | Pilum | thrown | 30 (melee 10) | thrust | 0.80 | 1.60 | 20 | 2.0 | 10 | spear | Sticks in shields (§6.8) |
| `iaculum` | Iaculum (javelin) | thrown | 18 | thrust | — | — | 12 | 0.8 | 4 | spear | Carry 5 |
| `rete` | Rete (net) | thrown | 0 | — | — | 6 (range) | — | 2.0 | 15 | spear | Entangles |
| `fustis` | Fustis (cudgel) | blunt | 10 | blunt | 1.05 | 0.80 | 20 | 1.0 | 1 | brawling | Knocks out up to `miles` |
| `clava` | Clava (club) | blunt | 13 | blunt | 0.90 | 0.80 | 26 | 1.8 | 3 | brawling | Knocks out up to `miles` |
| `vitis` | Vitis (centurion's vine staff) | blunt | 9 | blunt | 1.10 | 0.85 | 18 | 0.6 | — | brawling | Not sold; +50% stagger vs soldiers |
| `arcus` | Arcus (composite bow) | bow | 16 / arrow | thrust | — | — | 10 | 1.0 | 45 | archery | §6.8 |
| `funda` | Funda (sling) | sling | 12 lead / 8 stone | blunt | — | — | 25 | 0.1 | 1 | archery | §6.8 |
| `sagitta` | Arrow | ammo | — | — | — | — | — | 0.05 | 0.2 | — | Sold in tens |
| `glans-plumbea` | Lead sling bullet | ammo | — | — | — | — | — | 0.05 | 0.1 | — | Inscribed variants are collectibles |

**Uniques (v1.0):** `gladius-primi-pali` (the Primus Palus's Bilbilis gladius, ×1.4), `falx-mucaporis` (the Dacian champion's falx), `vitis-vituli` (the rogue centurion's vine staff), `manica-thraecis-aurata` (a gilded thraex manica, AR 9), `pugio-bruti` (the "dagger of Brutus", a fake; Fabrica 40 reveals it), `rete-nerei` (Nereus' net, +1 s entangle).

### 8.2 Clothing and status items

**Equipment slots** (replace `EquipSlot` in `src/rpg/types.ts`): `mainHand`, `offHand`, `under` (tunic), `padding` (subarmalis), `body` (cuirass or stola), `cloak` (toga, palla, paenula, sagum, lacerna), `legs` (bracae, fasciae), `shins` (ocreae), `arm` (manica), `head` (a helmet **or** a hood or hat, exclusive), `feet`, `neck`, `finger`, `ammo`. Layers stack the way they were worn: tunic, then subarmalis, then mail. The family of the outermost torso piece (body, else padding, else cloth) sets the damage matrix (§6.2); the class of the body piece sets armor penalties and XP (§6.3).

| ID | Slot | AR | kg | Value | Effect |
|---|---|---|---|---|---|
| `tunica` / `tunica-crassa` | under | 0 / 2 | 0.5 / 0.9 | 4 / 6 | Basic dress for everyone (dyed variants by color) |
| `toga` / `toga-fina` | cloak | 0 | 3.5 | 25 / 80 | **Male citizens and freedmen only** (otherwise the crime *usurpatio togae*; on a woman it is a prostitute's or adulteress's garment, §3.7). Formal dress: +10 persuasion with elites and officials, −5 with Subura plebs; required at a salutatio and in court. Sprint cost +50%, attack speed −20%. |
| `stola` / `stola-fina` | body | 0 | 1.2 | 20 / 60 | **Citizen women and freedwomen only** (otherwise *usurpatio* [G]). The matron's long overdress on shoulder straps [A]. With a palla it is formal dress, with the toga's status effects. Sprint cost +15%. |
| `palla` / `palla-fina` | cloak | 0 | 1.5 | 8 / 30 | A woman's mantle, often drawn over the head outdoors [A]. With a stola it completes formal dress. Sprint cost +25%, attack speed −10%. |
| `paenula` | cloak | 0 | 1.5 | 8 | Hood: witnesses identify you only 50% of the time at night; protects from rain |
| `sagum` / `lacerna` | cloak | 1 / 0 | 1.8 / 0.8 | 6 / 10 | Lacerna: +3 persuasion at the games (fashionable) |
| `bracae` / `fasciae` | legs | 1 | 0.6 / 0.2 | 3 / 1 | |
| `caligae` | feet | 1 | 1.0 | 5 | Hobnails: footstep noise +20% on stone |
| `calcei` / `soleae` / `carbatinae` | feet | 0 | 0.6 / 0.3 / 0.5 | 4 / 1 / 1 | Soleae in the street: −5 persuasion with elites |
| `cucullus` / `petasus` | head | 0 / 1 | 0.2 | 1 | Hood (as the paenula) / sun hat. Exclusive with helmets. |
| `fascinum` / `bulla` / `lunula` | neck | — | 0.05 | 2 / 25 / 10 | Amulets: negate curse tablets; −50% chance of a bad daily omen |
| `anulus-aureus` | finger | — | 0.01 | 50 | Gold ring. **For men it marks an eques** (otherwise `usurpatio`); +10 persuasion with elites. On a woman it is jewellery, with no status effect and no crime [P]. |
| `anulus-signatorius` | finger | — | 0.01 | 5 | Signet ring: seals letters; can be copied (Forger perk) |

**Formal dress** = a toga (men) or a stola with a palla (women). Its status effects apply once, not per piece.

### 8.3 Armor

| ID | Name | Slot | Class | Family | AR | kg | Value (den.) |
|---|---|---|---|---|---|---|---|
| `subarmalis` | Subarmalis (padded jerkin, worn over the tunic and under mail) | padding | light | padded | 10 | 3.0 | 20 |
| `thorax-coriaceus` | Leather cuirass | body | light | padded | 14 | 5.0 | 35 |
| `cardiophylax` | Provocator's chest plate | body | light | padded | 10 | 2.0 | 30 |
| `lorica-hamata` | Mail shirt | body | heavy | mail | 30 | 9.0 | 190 |
| `lorica-squamata` | Scale shirt | body | heavy | mail | 32 | 10.0 | 220 |
| `lorica-segmentata` | Segmented plate (Corbridge type) | body | heavy | plate | 38 | 8.5 | 260 (black market 390) |
| `thorax-musculus` | Bronze muscle cuirass (officers) | body | heavy | plate | 34 | 9.0 | 320 |
| `galea-gallica` | Imperial Gallic helmet | head | heavy | — | 12 | 1.8 | 60 |
| `galea-italica` | Imperial Italic helmet | head | heavy | — | 11 | 1.9 | 55 |
| `galea-cruciata` | Gallic helmet with Dacian-war cross-braces | head | heavy | — | 14 | 2.1 | 80 |
| `galea-attica` | Praetorian crested helmet | head | heavy | — | 12 | 2.0 | 150 |
| `galea-murmillonis` | Murmillo helmet (brim, tall crest) | head | heavy | — | 14 | 3.5 | 90 |
| `galea-thraecis` | Thraex helmet (griffin crest) | head | heavy | — | 13 | 3.3 | 90 |
| `galea-secutoris` | Secutor helmet (smooth egg) | head | heavy | — | 16 | 3.8 | 90 |
| `galea-hoplomachi` / `galea-provocatoris` / `galea-equitis` | Gladiator helmets | head | heavy | — | 13 / 13 / 12 | 3.3 / 3.2 / 2.8 | 85 / 80 / 80 |
| `manica-linea` / `manica-ferrea` | Arm guard: quilted linen / segmented iron | arm | light / heavy | — | 4 / 7 | 1.0 / 2.0 | 15 / 60 |
| `ocrea` / `ocreae` | Greave: single / high pair | shins | light | — | 3 / 6 | 0.8 / 1.8 | 18 / 40 |

The **outermost torso piece's family** (body, else padding) sets the damage-type matrix (§6.2), and **the body piece's class** decides heavy-armor penalties and which armor skill trains (§6.3, §5.4). Helmets, manicae and greaves only add AR and weight, whatever their class column says. A secutor's helmet cannot be caught by a net, and gladiator helmets add a first-person vignette (§4.4).

### 8.4 Shields (`offHand`)

| ID | Name | Bash stagger (`rating`) | `blockMitigation` | Missiles blocked | kg | Value |
|---|---|---|---|---|---|---|
| `scutum` | Curved rectangular scutum (legionary, murmillo, secutor) | 30 | 0.85 | 100% | 7.5 | 45 |
| `scutum-ovale` | Flat oval clipeus (auxiliary, praetorian) | 26 | 0.78 | 90% | 6.0 | 35 |
| `parma` | Round parma (cavalry, hoplomachus) | 20 | 0.65 | 70% | 3.0 | 25 |
| `parmula` | Small square parmula (thraex) | 18 | 0.58 | 60% | 2.5 | 20 |
| `galerus` | Retiarius shoulder guard | 0 | 0.35 (left side only) | 20% | 1.2 | 25 |

A lit **torch** (`fax`) also goes in the off hand: light radius 8 m, burns 2 game hours, disperses rat swarms, sets pitch alight, and makes you visible (+50% visibility).

### 8.5 Consumables, remedies and tools

| ID | Name | Effect [design] |
|---|---|---|
| `panis` / `puls` / `caseus` / `olivae` / `ficus` | Bread / porridge / cheese / olives / figs | Restore 8 / 12 / 6 / 4 / 4 HP over 8 s (puls also +10 stamina) |
| `botulus` / `patina` | Sausage / garum dish | +15 HP over 10 s / +20 HP over 10 s and +10% stamina regeneration for 5 game min |
| `cena` | Full dinner | +40 HP over 20 s; `satur` (well fed): +10% max stamina for 2 game hours |
| `aqua` | Water (free at any *lacus*) | +5 stamina; also washes off `sordidus` partly |
| `posca` | Vinegar water (soldiers' drink) | +30 stamina; +20% stamina regeneration for 60 s |
| `vinum` / `vinum-melius` / `vinum-falernum` / `mulsum` | Wines | +15 / +20 / +25 / +20 stamina. `ebrius` (tipsy, 60 s): −5% accuracy, +5 persuasion with plebs. Falernian: +5 Rhetoric for 120 s. |
| `libum` | Honey cake | +5 HP; the standard small offering |
| `fascia` | Bandage | +25 HP over 5 s; cures bleeding |
| `emplastrum` | Poultice | +40 HP over 10 s |
| `collyrium` | Eye salve (oculists' stamps are real [A]) | Cures `caecatus` (blinded by sand or smoke) |
| `theriaca` | Theriac / Mithridatium | Cures poison; −50% poison damage for 1 game hour |
| `febrifugum` | Fever draught | Cures `febris` (§14.9) |
| `soporificum` | Soporific (poppy and mandragora) | Weapon coating, 3 hits: a target up to `elite` collapses after 3 s, KO 60 game min |
| `aconitum` / `cicuta` / `taxus` | Poisons: aconite / hemlock / yew | 4 HP/s for 10 s / −50% stamina regeneration for 60 s / 2 HP/s for 30 s |
| Ingredients | `papaver`, `mandragora`, `allium`, `mel`, `acetum`, `myrrha`, `tus`, `absinthium`, `helleborus`, `ruta`, `salvia`, `aconitum`, `cicuta`, `taxus` | 2–4 effects each, learned by tasting (one per taste) or from books (Dioscorides, Celsus) |
| `instrumentum-fabri` | Repair kit | Field repair +25% condition (requires `perk-fabrica-armorer`) |
| `hamulus` | Lockpick | §14.3 |
| `fax` / `lucerna` | Torch / clay lamp | Light (§8.4) / a lamp for interiors and for the lararium |

### 8.6 Misc, books and keys

| ID | Name | Use |
|---|---|---|
| `defixio` | Curse tablet (blank lead sheet) | Inscribe, nail (`clavus`) and deposit at a grave, well or spring (§14.6) |
| `tabula-cerata` / `stilus` | Wax tablet / stylus | Notes; forged messages; quest letters |
| `cera-signatoria` | Sealing wax | Resealing (Locks & Seals) |
| `tessera-frumentaria` / `tessera-theatralis` | Grain token / theatre token | Grain dole (forgery quests) / theatre entry |
| `tali` / `fritillus` | Knucklebones / dice cup | Dice games (illegal outside the Saturnalia [A]) |
| `glans-inscripta` | Inscribed sling bullet | Collectible (12 to find in v1.0) |
| `piper`, `argentum`, `vasa-arretina`, `vitrum`, `purpura` | Pepper, silver plate, Arretine ware, glass, purple dye | Valuable trade goods and loot |
| `clavis-<id>` | Keys | One per locked door or chest that has an owner |
| `quest-*` | Quest items | Weightless; cannot be sold or dropped |

**Skill books** (excerpts in original translation; all exist by 113): Celsus *De Medicina* (medicina); Dioscorides *De Materia Medica* (medicina, Greek); Scribonius Largus *Compositiones* (medicina); Frontinus *Strategemata* (shield); Onasander *Strategikos* (blades, Greek); Vitruvius *De Architectura* (fabrica); Frontinus *De Aquaeductu* (fabrica); Martial *Epigrams* Book 1 (rhetoric); Pliny *Letters* I–IX (rhetoric) [P publication by c. 109]; Columella *De Re Rustica* (mercatura); Ovid *Fasti* (religio); Pliny *Natural History* 28 (religio); Xenophon *On Horsemanship* (equitatio, Greek); a lanista's training notes *Commentarii Doctoris* (fictional; spear). **Not in 113:** Vegetius, Arrian's *Tactica*, Galen, Juvenal Books 2–5.

---

## 9. Factions and questlines

### 9.1 Rules

- You can join every faction, but there are **hard crossroads**: Urban Cohorts vs Cultores Lavernae (`urb-07`), Greens vs Blues, and your choice of patron.
- **Rank is granted by quest completion** (the Skyrim model): each quest in a line names the rank it grants, about one rank per 1–2 quests, and the capstone grants the top rank. Top ranks also need a **skill gate** (the Morrowind lesson); if you lack the skill, the promotion waits until you reach it. Skill gates are **30 for middle ranks and 45 for top ranks** unless stated; the Ludus, whose skills rise fastest through fighting, uses 45 and 60. Fama no longer gates rank (`FactionRank.minReputation = 0` by default): it drives discounts, dialogue, radiant pay and greetings.
- **Fama tracks** (IDs in data): one per faction (`fama.vigiles`, `fama.ludus-magnus`, `fama.cohortes-urbanae`, `fama.cultores-lavernae`, `fama.sodales-invicti`, `fama.clientela`, `fama.factio-prasina`, `fama.factio-veneta`), one per district (`fama.dist-<id>`: the §12.1 districts in v0.1, plus one per district added in E1), and `fama.plebs` (the city crowd and the arena).
- Every line has a home (HQ), 6–8 quests, a capstone boss, a reward that changes play, and a radiant job board (§11.2). Every line can also crack one cell of the main-quest conspiracy (§10.2).
- Leaders and HQs are fictional unless marked [A]. Fictional holders of real offices are labelled in the Lexicon as invented.

| Faction ID | Name | Leader (NPC ID) | HQ (landmark) | Ranks (low → high) | Joining | Lawful |
|---|---|---|---|---|---|---|
| `vigiles` | Vigiles, Cohors V (night watch and fire brigade) | Tribune **Ti. Claudius Vindex** (`npc-vindex`) | Station of the 5th Cohort on the Caelian (`statio-vigiles-v`); a forward *excubitorium* in the Velabrum for v0.3 (location free: the 14 sub-stations are unlocated [A]) | `vigil` → `sebaciarius` → `siphonarius` → `optio` (Athletics 30) → `centurio` (Athletics 45 + Brawling or Blades 30) | Any status; freedmen welcome. Complete `vig-01`. No night bounty. | yes |
| `ludus-magnus` | Ludus Magnus (imperial gladiator school) | *Doctor* **Glaucus**, a Thracian-born rudiarius (`npc-glaucus`); procurator Sex. Attius Celer | Ludus Magnus (`ludus-magnus`) | `tiro` → `veteranus` → `palus-quartus` → `palus-tertius` → `palus-secundus` (one martial skill 45) → `primus-palus` (one martial skill 60) → `rudiarius` (capstone) | Fight as a **paid guest** (the golden-path default: no ranks, and practice bouts add no Infamia), swear the oath as an *auctoratus* (Infamia +20; an explicit crossroad dialogue shows the cost, "blocks equestrian rank"), or be condemned *ad ludum* (§14.1). Ranks need the oath. | no |
| `cohortes-urbanae` | Urban Cohorts, Cohors X Urbana | Tribune **C. Fulvius Rufus** (`npc-rufus`) | Castra Praetoria (`castra-praetoria`); a forward *statio* on the Clivus Argentarius beside the Carcer [design] | `miles` → `tesserarius` → `optio` (Blades or Spear 30) → `centurio` (45) → invitation to the Praetorian *speculatores* | **Citizens only.** No bounty. Pass the drill (`urb-01`). | yes |
| `cultores-lavernae` | Cultores Lavernae (thieves posing as a burial club) | Magister **Q. Opimius Faustus "the Fuller"** (`npc-faustus`) | A fullonica off the Clivus Suburanus, with a disused cistern below (Subura) | `tiro` → `fur` → `sector-zonarius` → `effractor` (Locks & Seals 30) → `magister` (capstone; Pickpocket or Locks 45) | Steal a token from the doorman, or bring stolen goods worth ≥ 25 den. | no |
| `sodales-invicti` | The Mithraic cell (Sodales Invicti) | *Pater* **Alcimus**, steward of Ti. Claudius Livianus (`npc-alcimus`): a real dedicant (CIL VI 718, c. 101–120 [A]) in a fictional role | A spelaeum in a cellar under a shop of the Horrea Agrippiana (`horrea-agrippiana`) [design; no mithraeum is securely dated this early] | `corax` → `nymphus` → `miles` → `leo` → `perses` → `heliodromus` → `pater` (honorary, capstone). The seven grades are attested later, so they are this cell's own tradition [P]. | Invitation after a soldier vouches; you must have spared at least one yielded foe; oath of silence | no |
| `clientela` | Patronage: your patron's house | Choose one: **M. Sergius Bassus**, a consular general and war hawk (`npc-patron-sergius`, Caelian); **Calpurnia Severa** of Corduba, a Baetican widow in Plotina's circle (`npc-patron-calpurnia`, Aventine); **Sex. Vettius Crispinus**, an old Italian senator skeptical of the war's cost (`npc-patron-vettius`, Carinae) | The patron's domus | `cliens` → `amicus-minor` → `amicus` (Rhetoric 30) → `procurator` (45) → `eques` (freeborn citizens: census 25,000 den. + Infamia ≤ 20; freedmen: the capstone's petition to Trajan for the *ius anulorum*, §3.2) | Attend 3 *salutationes* in formal dress (a toga, or a stola and palla; non-citizens attend in their best tunic and can rise only to `amicus` until they are citizens) | yes |
| `factio-prasina` / `factio-veneta` | Circus faction: Greens / Blues | *Domini factionis* **C. Sentius Felix** (Greens, `npc-felix`) / **Q. Arrius Venustus** (Blues, `npc-venustus`) | The faction stables in the Campus Martius [U site]; club rooms in the Circus Maximus arcades | `agaso` (stable hand) → `sparsor` (water-thrower) → `hortator` → `auriga` (Equitatio 30) → `miliarius` (capstone; an honorific for 1,000 wins [A]) | Choose a color (**exclusive**). Equitatio ≥ 15 to drive. | no |

### 9.2 Faction quests (one line each)

**Vigiles** (reward: fire resistance, a barracks bed, vigiles allies in the finale, and **citizenship for a Junian Latin** by the prefect's special commendation, a game compression of the 6-year Lex Visellia term [A])
- `vig-01-hamae` "Buckets": join a bucket chain at a cenaculum fire in the Velabrum and learn the siphon pump.
- `vig-02-effractores` "House-breakers": night patrol on the Vicus Tuscus; catch burglars and arrest or knock them out.
- `vig-03-aquarii` "Thirsty Water-men": corrupt water-men sell water during fires (Frontinus' frauds [A]).
- `vig-04-dominus-flammae` "The Landlord of Flames": a ring buys burning insulae cheap and sets the fires.
- `vig-05-puer-in-tegulis` "The Boy on the Roof Tiles": search for a missing child across the Subura rooftops (Athletics).
- `vig-06-centones` "Water in Every Flat": an inspection round; beat, fine or forgive careless tenants (Dig. 1.15 [P]).
- `vig-07-volcanalia` **Capstone** "The Great Fire": the next great fire breaks out **2 elapsed days after `vig-06`, on any date**: a multi-block fire; rescue tenants, cut a firebreak, beat `boss-incendiarius`. If `mq-12` (the Volcanalia fire, 23 Aug) is reached while `vig-07` is still pending, that fire *is* this one, a shared set piece. The faction line never waits on the main quest. (The ID keeps its old name.)

**Ludus Magnus** (reward: the *rudis*, Fama with the plebs, a gladiator follower, permanent Infamia)
- `lud-01-sacramentum` "The Oath": sign on as a **paid guest** (the default) or swear the oath (an explicit crossroad that shows its Infamia cost), draw the training kit from the armory (a *rudis* and a scutum or parmula, returned when you leave the Ludus), and fight three practice bouts (*lusiones* with *arma lusoria*, §6.10) ending with `boss-nereus` (**v0.1**).
- `lud-02-armatura` "Choose Your Steel": pick an armatura (murmillo, thraex, hoplomachus, secutor or retiarius) and pass its drill.
- `lud-03-munus-funebre` "Funeral Games": fight at a family tomb on the Via Appia.
- `lud-04-venatio` "The Morning Hunt": venatio with the Ludus Matutinus (leopard, bear).
- `lud-05-rudis-venenata` "The Poisoned Rudis": a rival poisons a training sword (Medicina).
- `lud-06-sine-missione` "Without Mercy": illegal no-quarter fights in a cellar near the hypogeum (shut them down, or win).
- `lud-07-ursus` "The Bear Below": an escaped bear in the hypogeum (`boss-ursus-hypogei`).
- `lud-08-primus-palus` **Capstone**: the farewell munus in the amphitheatre against `boss-primus-palus`.

**Urban Cohorts** (reward: a legal mandate to arrest, bounties reduced 25% by your word, Praetorian allies)
- `urb-01-sacramentum` "The Drill": oath, drill and escort duty in the Forum.
- `urb-02-macellum` "Riot at the Market": non-lethal crowd control at the Forum Boarium.
- `urb-03-testis` "The Witness": escort a witness to the Basilica Julia through ambushes.
- `urb-04-collegium-illicitum` "An Unlicensed Club": raid an illegal collegium (Trajan distrusted clubs: Pliny *Ep.* 10.34 [A]).
- `urb-05-prasini-veneti` "Green and Blue": break up a faction riot at the Circus (links `cir-06`).
- `urb-06-sicarius` "Hunt the Sicarius": track an assassin through the Subura.
- `urb-07-laverna` **Crossroad**: raid the Cultores Lavernae HQ, or warn them (exclusive with `lav-08`).
- `urb-08-vitis` **Capstone**: the rogue centurion in the Palatine cryptoporticus (`boss-vitis`); invitation to the speculatores.

**Cultores Lavernae** (reward: rooftop routes, fences, the Laverna shrine and blessing, stolen-goods trade)
- `lav-01-sector` "Cut a Purse": a lift on a crowded market day.
- `lav-02-argiletum` "Books and Bags": fence goods through an Argiletum bookseller.
- `lav-03-cena` "While They Dine": burgle an Esquiline domus during the cena (9th–10th hour).
- `lav-04-signa` "A Borrowed Seal": forge a seal and swap a letter (Locks & Seals).
- `lav-05-equi` "Slow Horses": drug a stable's horses to rig a race (links the Circus line).
- `lav-06-piperataria` "The Pepper Heist": rob the Horrea Piperataria (`dun-horrea-piperataria`).
- `lav-07-pugio-bruti` "The Dagger of Brutus": sell a fake relic to a gullible collector.
- `lav-08-cloaca` **Capstone**: the magister has sold the guild to the Cohorts; confront him in the Cloaca under the Subura.

**Sodales Invicti** (reward: safe houses empire-wide in later regions, the *Invictus* invocation, soldier allies)
- `mit-01-silentium` "The Oath of Silence": first meeting in the spelaeum; grade Corax.
- `mit-02-tenebrae` "Darkness": an ordeal in the dark (kept deliberately vague: later and hostile sources [P]).
- `mit-03-frater` "A Brother Accused": protect a praetorian brother accused of spying for Parthia.
- `mit-04-taurus` "The Stolen Bull": recover the cell's stolen relief before its existence becomes evidence.
- `mit-05-delator` "The Informer": find the traitor inside the cell.
- `mit-06-heliodromus` **Capstone**: duel the traitor Heliodromus during the darkness rite (`boss-heliodromus`).

**Clientela** (reward: equestrian rank through the census, or for a freedman the emperor's grant of the ring; patronage discounts on fines; political access)
- `cli-01-salutatio` "Morning Calls": attend the dawn salutatio 3 times; afterwards a daily radiant with the sportula.
- `cli-02-deductio` "Escort to the Forum": walk your patron through a hostile crowd.
- `cli-03-candidatus` "The White Toga": canvass senators for the patron's son's praetorship (elections are in the Senate in 113 [A]).
- `cli-04-centumviri` "The Hundred Judges": an inheritance case in the Basilica Julia (a Rhetoric boss, `boss-advocatus`).
- `cli-05-triclinium` "Where to Recline": a dinner party; the couch hierarchy as a social puzzle.
- `cli-06-epistulae` "Letters That Burn": recover compromising letters.
- `cli-07-patres-conscripti` **Capstone**: your patron's business in the Curia at the **first regular session (Kalends or Ides) after `cli-06`** [A: the Senate met as of right on the Kalends and Ides, Suet. *Aug.* 35.3]. The agenda is what the Senate really did: honors, vows and a senatorial trial (never war or its funding, which were the emperor's [A]); you win the vote or the verdict with Rhetoric, favors or evidence. A freedman PC's patron also carries the petition for the *ius anulorum* to Trajan (§3.2). If the main quest has reached `mq-13`, the two share the 1 Sep session.

**Circus factions** (reward: prize money, a racehorse for later regions, Fama)
- `cir-01-stabulum` "Mucking Out": stable work; choose your color.
- `cir-02-speculator` "Eyes on the Rival": scout the rival stable at night.
- `cir-03-defixio` "Lead in the Well": curse tablets against our horses; find the writer (ambiguous).
- `cir-04-sparsor` "Water-thrower": dodge chariots on the track during a real race.
- `cir-05-sponsio` "The Wager": betting, bribery and a fixed heat.
- `cir-06-seditio` "Riot": the Blues-and-Greens brawl (links `urb-05`).
- `cir-07-ludi-romani` **Capstone**: the great race at **the next ludi with circus races after `cir-06`** (Apollinares 6–13 Jul, Victoriae 20–30 Jul, Romani 4–19 Sep, then again every year after the epilogue) against `boss-auriga-rivalis` (fictional; Diocles races only from 122 [A]). (The ID keeps its old name.)

**Candidate later factions:** Bibliotheca Ulpia scholars (with Apollodorus and Suetonius), the Iseum Campense, the Asclepiads of the Tiber Island, the grain merchants of the Annona (Ostia), the Equites Singulares.

---

## 10. Main quest: *Profectio* ("The Departure")

### 10.1 Premise

Spring 113. Trajan prepares for war with Parthia and has named no heir. A **cabal** forms around his coming departure: war contractors getting rich, Parthian silver, a Dacian revenge cell, and a disgraced senator, **Q. Valerius Asper** (fictional). Their plan is to strike during the *profectio* and, in the chaos, produce a **forged adoption codicil** that names Hadrian. The forgery is meant to make Plotina and Hadrian's circle look like murderers, so that their rivals can seize the succession. **The plot cannot succeed** (Trajan departs safely; history is fixed). The questions are who exposes it, who is ruined, and who takes the credit.

**The player** is a mid-level fixer in the wrong place at the right time: a deniable agent of the **princeps peregrinorum** (fictional holder: **T. Aufidius Pudens**, `npc-pudens`), who commands the frumentarii, the imperial couriers, at the Castra Peregrina on the Caelian [P: the office is first attested under Trajan].

### 10.2 Structure: the conspiracy board (*Tabula Coniuratorum*)

Act II is a board of **4 cells × 3 masked members** (the AC Odyssey lesson). Members can be unmasked in any order, and **each has at least two routes**, usually a faction line or a skill route. **Cracking 3 of the 4 cells** unlocks Act III; an uncracked cell supplies extra enemies or a traitor in the finale.

| Cell (quest) | Members (all fictional) | Routes to unmask |
|---|---|---|
| **The Purse** (`mq-06-sacculus`) | Sex. Pinarius Avitus, army-grain contractor · Ti. Claudius Euhodus, freedman arms dealer · Hermogenes, banker at the Basilica Aemilia | Mercatura audit of the Horrea ledgers · a Lavernae burglary · Vigiles evidence of arson for profit |
| **The Eastern Gold** (`mq-07-aurum-parthicum`) | A silk and pepper merchant at the Horrea Piperataria · Asclepiodotus the Chaldaean (astrologer) · Mardonius, a courier | The Mithraic cell (the cabal smears Mithras as "Persian") · the Syrian origin thread · Locks & Seals (reading their letters) |
| **The Dacian Blades** (`mq-08-falx`) | Mucapor, falx champion · Daizus, an informally freed builder on the Baths of Trajan · Tarbus, a trainer at the Ludus Dacicus | The Ludus line · the Vigiles · the Dacian origin · mercy shown to the Column shooter |
| **The Toga** (`mq-09-toga`) | Q. Valerius Asper, disgraced senator · Sex. Naevius Vitulus "Vitis", praetorian centurion gone rogue · M. Ulpius Chrysogonus, a freedman scribe of the imperial chancery (the forger) | The Clientela line · the Urban Cohorts (`urb-08`) · forging and planting letters (Locks & Seals + Pickpocket) |

The cabal's **Sword** (the final boss, outside the cells) is **Gn. Fabius Durus**, a dismissed former primus pilus. Its assassin is **Tacita the Sicaria**.

### 10.3 Quests

**Date anchors** use the *pridie* clamp (§14.10): the calendar waits on the eve of each anchor until the player is ready. Only these main-quest set pieces are anchors; faction and misc content never waits on them.

| # | ID | Title | Act | Date anchor | Where | Beats and choices |
|---|---|---|---|---|---|---|
| 1 | `mq-01-madida-capena` | The Dripping Gate | I | 11 May, dawn | Porta Capena → Circus valley → Forum | Tutorial. You arrive with the last night cart under the leaking aqueduct arch (Juvenal's *madidam Capenam*, 3.11 [A]). A frumentarius courier, C. Marius Festus, is knifed beside you; you fight off two *grassatores* and take his sealed tablet. Walk to the Forum: movement, V view toggle, compass, talking. **(v0.1)** |
| 2 | `mq-02-carcer` | The Tullianum | I | 11 May | Forum, Carcer Tullianum | Urban soldiers arrest you as a suspect. In the Carcer one of three patrons' agents vouches for you (the start of the Clientela choice), or you escape through the drain shaft (a stealth route). *(v0.1 runs a short version, `mq-02-tabella`: deliver the tablet to the strongrooms in the Temple of Castor's podium [A: safe deposits]. Their barred doors open from outside the podium, separate from the shrine, so they stay open on the Lemuria when the cella is shut, §14.10.)* |
| 3 | `mq-03-lemuria` | Beans for the Dead | I | night of 11 May | The courier's family insula, Velabrum | His "ghost" walks at midnight while the paterfamilias throws black beans (Ovid *Fasti* 5.429–44 [A]). The mundane lead: his twin brother hiding with the real message. One detail stays unexplained. Yields the cipher key. |
| 4 | `mq-04-columna` | One Hundred Feet | I | **12 May** | Forum of Trajan, inside the Column | At the dedication an archer on the Column's viewing platform wounds Pudens' deputy. Fight up the **185-step spiral stair** (lit by its slit windows [A]) to the platform. The stair is a **1:1 interior cell** behind the door in the pedestal: at the 0.6 exterior scale it would hold only ~105 steps and be ~0.4 m wide, narrower than the player (§0, §12.4). The shooter is Dacian: **spare him** (opens the Dacian route) or kill him. Hushed up officially as "an omen". |
| 5 | `mq-05-tabula` | The Board | I | 13 May | Castra Peregrina, Caelian | Pudens makes you a deniable agent. The conspiracy board opens. **End of Act I.** |
| 6–9 | `mq-06` … `mq-09` | The four cells | II | — (any order) | Across the city | §10.2. Each cell ends with a confrontation; unmasking 3 cells unlocks Act III. |
| 10 | `mq-10-penus-vestae` | The Storeroom of Vesta | II | **9 Jun** (Vestalia) | Temple of Vesta, Atrium Vestae | Unlocks after 1 cell. On the day the storeroom opens to barefoot matrons [A], the cabal tries to plant the forged codicil among the **wills kept by the Vestals** (Augustus deposited his there, Suet. *Aug.* 101 [A]). Infiltration; men may not enter, so a male PC needs a matron ally or a disguise (a stola and palla, §3.7). |
| 11 | `mq-11-cucurbitae` | Draw Your Pumpkins | II | **6 Jul** (Ludi Apollinares) | Theatre of Marcellus; Forum of Trajan | Unlocks after 2 cells. A theatre riot covers the murder of a witness. **Midpoint twist:** the codicil is real paper with a forged hand, and it names Hadrian. **Apollodorus of Damascus** becomes an ally; his contempt for Hadrian ("go away and draw your pumpkins", Dio 69.4 [A, anecdote U]) is a red herring the cabal exploits. |
| 12 | `mq-12-volcanalia` | The Fire of Vulcan | II | **23 Aug** (Volcanalia) | Subura | Unlocks after 3 cells. The cabal sets an arson fire to burn the evidence warehouse and pin it on the Vigiles. A set piece shared with `vig-07`. The real plan is revealed: strike at the profectio. **End of Act II.** |
| 13 | `mq-13-patres-conscripti` | Conscript Fathers | III | **1 Sep** (Kalends) | Curia Julia | A regular session on the Kalends [A]. In September only senators drawn by lot had to attend, so the benches are thin and a few votes swing it (Suet. *Aug.* 35.3 [A]). **The agenda is what the Senate really did:** first the vows for Trajan's safe departure and return (*vota pro itu et reditu*) and honors for the profectio, where the cabal's ally moves to put his men in the procession; then a **repetundae trial** (cf. Pliny *Ep.* 2.11, the trial of Marius Priscus [A]) of a cabal senator, a fictional former governor whose extortion money funds the contractors. **Your evidence decides the verdict.** The Senate never debates war or its funding: those belong to the emperor and his prefects [A]. You choose **whom you give the evidence to**, which sets the ending track (§10.4). A Rhetoric "boss" (prosecution or defence speech, timed by the water-clock), or a Clientela or bribery route. |
| 14 | `mq-14-natalis` | The Sixtieth Birthday | III | **18 Sep** | Capitol (Epulum Iovis, 13 Sep), Circus Maximus | Trajan turns 60 [A]. Games in the Circus. A decoy attack draws the guards; **Tacita the Sicaria** stalks you through the crowds (spot her by her tells), then a duel. |
| 15 | `mq-15-profectio` | The Departure | III | **19 Oct** [design; the exact day is unattested, "October 113" [U]] | Armilustrium rite on the Aventine at dawn → the procession → the Via Appia tombs → Porta Capena | The army's arms are purified, and Trajan rides out. The ambush comes among the tombs of the Via Appia. **Your completed factions arrive as allies** (vigiles with siphons, gladiators, Mithraic soldiers, Circus toughs, a client mob). A three-phase final fight against `boss-gladius-coniurationis`. You end where you began, at the dripping gate. Epilogue. |

### 10.4 Endings (all preserve history; each epilogue looks ahead to 117 and 118)

| Ending ID | You give the evidence to | Your reward | Epilogue irony |
|---|---|---|---|
| `fides` (loyalty) | Trajan's council | Equestrian rank (gold ring), Infamia cleared, Trajan's favor | Trajan sails; nothing about the succession is settled |
| `prudentia` (the Hadrianic path) | Plotina and Attianus | Quiet patronage and a house on the Esquiline | The same papers help ruin the "four consulars" in 118 [A] |
| `ambitio` (the marshals) | Palma and Celsus | A military commission: the Parthian war expansion hook | You backed the losing side of 118 |
| `arcana` (keep it) | No one | A spy network, the master of secrets | Everyone fears you; the knife may come later |
| `exsilium` (fail state) | — (the Praetorians foil the plot without you) | You are blamed and relegated | The game continues in Ostia and Latium (an expansion hook) |

Capturing Durus alive (instead of killing him) adds a trial scene to any ending.

---

## 11. Misc quests and radiant jobs

### 11.1 Misc quest seeds (36)

Each seed is rooted in a real place or custom of 113. "Window" is when the quest is offered; festival-bound quests are offered from 5 days before until the festival ends. **Dated quests are never lost for good:** one whose window is missed (held behind the *pridie* clamp, or skipped by a date jump, §14.10) is offered again at the next festival of the same kind where one exists (any Kalends for `misc-kalendae-iuliae`'s rent trouble, any ludi for race-day seeds), and otherwise **every year after the epilogue**.

| ID | Title | Where (landmark) | Window | Hook and resolution |
|---|---|---|---|---|
| `misc-lemuria-fabae` | Black Beans | Velabrum insula | 9–13 May, nights | A father's beans vanish on ghost night: a ghost, or a slave feeding a family? **(v0.1)** |
| `misc-meta-sudans-rixa` | Brawl at the Fountain | `meta-sudans` | any | Fans of rival gladiators brawl: a fist fight that teaches knockouts and yielding. **(v0.1)** |
| `misc-insula-nutans` | The Leaning Insula | Vicus Tuscus | any | Tenants say the walls crack and the landlord shrugs (Juvenal 3.190 [A]). Prove it before it falls. **(v0.1)** |
| `misc-venus-cloacina` | What Venus Hides | `basilica-aemilia` (Cloacina shrine) | any | Someone hides things in the drain under the shrine → `dun-cloaca-maxima`. **(v0.1 Should)** |
| `misc-facies-columnae` | The Face on the Column | `column-trajan` | before 12 May | A sculptor swears a soldier in the frieze has his face. |
| `misc-ulpia-liber` | Overdue at the Ulpia | `bibliotheca-ulpia-west` | any | A dead borrower's heirs are selling the library's scroll. |
| `misc-aqua-furtiva` | Thirsty Pipes | Aqua Traiana branch (v0.5) | any | Illegal taps on the new aqueduct; find the corrupt *aquarius*. |
| `misc-pantheon-calx` | Pantheon Dust | `pantheon` | any | A worker falls from the scaffold; the contractor skims lime. |
| `misc-tesserae-falsae` | Forged Tokens | `porticus-minucia-frumentaria` | any | Forged grain tokens are circulating. |
| `misc-argei` | The Heavy Splash | `pons-sublicius` | 14–15 May | One of the Argei puppets thrown by the Vestals splashed too heavily. |
| `misc-sublicius-clavi` | No Iron on the Bridge | `pons-sublicius` | any | Someone drove nails into the sacred all-wood bridge (Pliny *NH* 36.100 [A]): sabotage or omen? |
| `misc-servus-aesculapii` | Free by the God's Hand | `temple-aesculapius` | any | An abandoned sick slave recovered, so Claudius' edict makes him free (Suet. *Claud.* 25 [A]). Prove it. |
| `misc-pardus-horti` | Leopard in the Gardens | `horti-maecenatis` | any | A beast from the Ludus Matutinus is loose. |
| `misc-garum-adulteratum` | Bad Garum | `markets-trajan` | any | Fish sauce is adulterated in Trajan's Markets. |
| `misc-aes-corinthium` | Corinthian Bronzes | `saepta-julia` | any | Fake antiques in the luxury market. |
| `misc-editio-furtiva` | The Pirate Edition | Argiletum | any | A copyist sells an unauthorized edition (Martial grumbled about such [A]). |
| `misc-testamentum` | The Forged Will | `basilica-julia` | any | An inheritance case before the Centumviri under the Cornelian law on forgery. |
| `misc-diploma` | Diploma on the Wall | behind `temple-divus-augustus` | any | A veterans' diploma forgery ring; the master copies hang "on the wall behind the Temple of the Deified Augustus" [A]. |
| `misc-horologium` | The Sundial Is Wrong | `horologium-augusti` | any | The meridian has been off for decades (Pliny *NH* 36.73 [A]); an astronomer wants proof, an astrologer wants silence. |
| `misc-genitura-caesaris` | The Emperor's Horoscope | by `circus-maximus` | any | A Chaldaean sells Trajan's horoscope, which is treason. Turn him in, protect him, or buy it. |
| `misc-inundatio` | Floodwater | `emporium` | after heavy rain | Rescue amphorae from a flooded warehouse, or loot them. |
| `misc-naumachia` | Rehearsal at the Naumachia | `naumachia-traiani` | any | Sabotage at Trajan's new sea-battle basin (dedicated 109 [A]). |
| `misc-persona-pantomimi` | The Pantomime's Mask | `theatre-pompey` | any | A star dancer's mask is stolen before a show; fan factions riot. |
| `misc-casa-romuli` | Romulus' Hut Is Burning | `casa-romuli` | any | The thatched hut catches fire, as it often did [A]. Accident or omen? |
| `misc-scalae-gemoniae` | The Gemonian Stairs | `carcer-tullianum` | any | A family wants an executed man's body back from the stairs. |
| `misc-suspirium-puellarum` | The Girls' Heartthrob | `ludus-magnus` | any | A matron's love letters to a gladiator are used for blackmail. |
| `misc-kalendae-iuliae` | Moving Day | Subura | 1 Jul | Rents fall due and leases change (Martial 12.32 [A]); help a family flee a debt collector with their bed on their backs. |
| `misc-desertor` | The Deserter | Subura | Jun–Oct | A recruit for the Parthian levy hides; turn him in or smuggle him to Ostia. |
| `misc-pulli-sacri` | The Sacred Chickens | Capitol (`asylum`) | Sep–Oct | An augur's chickens won't eat before the war auspices: someone overfed them. |
| `misc-fur-balnearius` | The Bath Thief | `baths-trajan` | any | Clothes stolen at the baths, with the cloakroom attendant in on it (British curse tablets complain of exactly this [A]). |
| `misc-asylum-statuae` | Asylum at the Statue | Forum of Trajan, `equus-traiani` | any | A runaway slave clings to the emperor's statue [P]; the owner's men are coming. |
| `misc-libellus-anonymus` | The Anonymous Libel | Trastevere | any | An unsigned accusation names a house-church. Trajan's rescript says anonymous accusations "have no place" (Pliny *Ep.* 10.97 [A]). No catacombs, no martyr spectacle. |
| `misc-colossus` | The Colossus Dare | `colossus-sol` | any | A youth bets he can climb the bronze Colossus: an Athletics climb, then a rescue. |
| `misc-mercuralia` | Mercury's Water | `porta-capena` | 15 May | Merchants sprinkle themselves at Mercury's spring to wash away their lies (Ovid [A]); one is washing away a real fraud. |
| `misc-vestalis-obvia` | The Vestal on the Road | Sacra Via | any | A condemned man is spared if he meets a Vestal by chance (Plutarch *Numa* 10 [A]); arrange a "chance" meeting. |
| `misc-equus-october` | The Head of the October Horse | Campus Martius → Subura | 15 Oct | The Subura and the Via Sacra fight over the sacrificed horse's head [A]: a sacred district brawl. Pick a side. |

More seeds for later passes: `game-design.md` B5.4 (48 seeds) and `society.md` §§2–8.

### 11.2 Radiant job templates

Postings appear on **painted wall notices** (*dipinti*), at faction HQs and from street NPCs. Each template = **verb + target generator + twist**. Rewards scale with the band of the area, never with player level.

| ID | Giver | Verb and target | Reward (den.) | Twist pool |
|---|---|---|---|---|
| `rad-vig-nocturna` | Vigiles | Night patrol: catch a burglar in district X | 15–40 + Fama | The burglar is a starving freedman; arrest, knock out or let go |
| `rad-vig-incendium` | Vigiles | Fire call: save N tenants within T game minutes | 20–60 | A tenant refuses to leave the strongbox |
| `rad-lud-pugna` | Ludus | Bout of your armatura against a random type | purse × favor | The opponent is an old friend; a rigged weapon |
| `rad-lud-bestia` | Ludus | Recapture an escaped beast (net or spear) | 30–80 | The beast shelters cubs |
| `rad-urb-proscriptio` | Urban Cohorts | Bounty on a named criminal (×2 if alive) | 25–150 | The criminal is innocent and framed |
| `rad-urb-praesidium` | Urban Cohorts | Escort a coin cart to the treasury (Temple of Saturn) | 20–50 | Ambush at a crossing |
| `rad-lav-furtum` | Lavernae | Lift an item / burgle a domus (bonus for noble houses) | 30–200 (fence) | The owner is home; the item is cursed (a rumor) |
| `rad-lav-tributum` | Lavernae | Collect or pay protection | 10–40 | The shop is your own aunt's |
| `rad-cli-epistula` | Clientela | Carry a sealed letter (option: open and reseal it) | 5–20 | The letter concerns you |
| `rad-cli-salutatio` | Clientela | Daily salutatio at dawn | sportula 1 den. 9 as. | The patron asks a small, shady favor |
| `rad-cir-equi` | Circus | Exercise horses / scout a rival / deliver a bribe | 10–40 | A rival's spy follows you |
| `rad-templum` | Temples | Fetch offerings / escort a procession / clear a desecrated shrine | 10–30 + Pietas | The desecrator is a grieving parent |
| `rad-vicus` | Street | Retrieve clothes stolen at the baths / find a lost dog / settle a dice dispute | 2–15 | The dog belongs to a senator |

**Freshness rules:** never repeat a location twice in a row; every third job has a **complication** (ambush, double-cross, or a target who pleads); each faction has **one escalation chain** where three radiant jobs reveal an authored quest; jobs vary the outcome (spare, bribe, kill, arrest), not only the target.

---

## 12. World plan

### 12.1 v0.0–v0.1 districts: the Rome core

All landmark IDs are from `topography-landmarks.md`. Positions are real meters (× 0.6 in game). The core spans roughly x −650…+960, z −420…+980 real, about **970 × 840 game meters**. Build fidelity: **H** = hero (full procedural detail; interior where noted), **M** = massing (correct footprint, height, order and colors, simplified), **B** = backdrop (impostor or low-poly silhouette).

| District ID | Name | Key landmarks (fidelity) | Fabric and life | First in |
|---|---|---|---|---|
| `dist-forum-romanum` | Forum Romanum | `miliarium-aureum` H (world origin), `rostra` H, `curia-julia` H, `temple-saturn` H, `basilica-julia` H, `basilica-aemilia` H (+ Cloacina shrine), `temple-castor-pollux` H, `temple-divus-julius` M, `temple-vesta` M, `regia` M, `atrium-vestae` M, `temple-vespasian-titus` M, `temple-concord` M, `tabularium` M, `arch-augustus` M, `arch-tiberius` M, `lacus-juturnae` M, `lacus-curtius` M, `comitium-lapis-niger` M, `janus-geminus` M (doors open), `equus-domitiani-site` M, `carcer-tullianum` M | Crowds, money-changers, idlers on the Basilica Julia steps, criers, litters | **v0.0** |
| `dist-capitolium` | Capitoline Hill | `temple-jupiter-capitolinus` H (gilded roof), `asylum` M, `temple-juno-moneta` M, `tarpeian-rock` M, `porticus-dei-consentes` M, `temple-veiovis` B | Priests, sacred geese, the Clivus Capitolinus | v0.1 (all at M; the Capitolium's H is Should) |
| `dist-palatium` | Palatine | `domitianic-vestibule` M, `domus-tiberiana` M, `domus-flavia` M (exterior), `domus-augustana` M (the façade over the Circus), `temple-apollo-palatinus` M, `temple-magna-mater` M, `casa-romuli` H, `house-augustus` M, `palatine-stadium` B, `lupercal` M | Quiet, guarded. Palace interiors are closed (Praetorian jurisdiction); terraces and the Germalus are open by day. | v0.1 at M/B (H is Should; v0.2) |
| `dist-fora-imperialia` | Imperial Fora | `forum-trajan` H, `basilica-ulpia` H (exterior), `column-trajan` H (interior stair in v0.2), `equus-traiani` H, `bibliotheca-ulpia-east`/`-west` M, `markets-trajan` H (hemicycle; upper levels M), `forum-augustus` H, `temple-mars-ultor` H, `forum-caesar` M, `temple-venus-genetrix` M (festooned for 12 May), `basilica-argentaria` M, `forum-nerva` M, `temple-minerva-nerva` M, `templum-pacis` M | Brand-new marble; dedication preparations; Dacian captive statues | v0.1 (H only for the Forum of Trajan group: `forum-trajan`, `basilica-ulpia`, `column-trajan`, `equus-traiani`; the other H entries are M until v0.2) |
| `dist-velia` | Velia and upper Sacra Via | `arch-titus` H, `colossus-sol` H (**on the Velia**), `velia-vestibule` M, `horrea-piperataria` M, `porticus-margaritaria` M, `temple-jupiter-stator` B | Jewelers and pearl sellers, spice smell | **v0.0** |
| `dist-vallis-colossei` | Colosseum valley | `colosseum` H (exterior; arena floor Should), `meta-sudans` H, `ludus-magnus` H (**playable arena**), `curiae-veteres` B, `baths-titus` B, `temple-divus-claudius` B | Gladiator drills, fans, velarium sailors | **v0.0** |
| `dist-circus-maximus` | Circus Maximus and Porta Capena | `circus-maximus` H (exterior and track), `obelisk-circus-maximus` M, `pulvinar` M, `arch-titus-circus` M, `porta-capena` H (**spawn**), `ara-maxima` M | Arcade shops, astrologers, the night carts | v0.1 |
| `dist-velabrum-boarium` | Velabrum, Vicus Tuscus, Forum Boarium, river port | `forum-boarium` H, `portus-tiberinus` M, `temple-portunus` H, `temple-hercules-victor` H, `cloaca-maxima-outlet` M, `sant-omobono-temples` M, `horrea-agrippiana` M, `pons-aemilius` M, `pons-sublicius` M | Cattle pens, oil merchants, dockers, the fuller and baker | v0.1 at M/B (H is Should; v0.2) |
| `dist-forum-holitorium` | Forum Holitorium and Tiber Island | `porta-carmentalis` M, `forum-holitorium` M, the three temples (`temple-janus-holitorium`, `temple-juno-sospita`, `temple-spes`) M, `theatre-marcellus` M, `temple-apollo-sosianus` M, `temple-bellona` M, `pons-fabricius` M, `tiber-island` M, `temple-aesculapius` M | Vegetable market, the Columna Lactaria, the sick on the island | v0.1 Should |

**Fidelity by milestone.** **v0.0** builds only `dist-forum-romanum`, `dist-velia` and `dist-vallis-colossei` (B11's footprint without the Argiletum and the Cloaca), with **H for 8 landmarks only**: `miliarium-aureum`, `rostra`, `temple-castor-pollux`, `basilica-julia`, `arch-titus`, `colossus-sol`, `colosseum` (exterior) and `ludus-magnus` (playable arena); every other landmark there is M or B. **v0.1** adds the other districts at the fidelity in the "First in" column; any H not listed for v0.1 is Should. Interiors of landmarks are 1:1 cells (§0, §12.4).

**Edges are diegetic:** the 33 m firewall of the Forum of Augustus shuts out the Subura (its historical job as a firebreak and screen [P]); the Oppian, Caelian and Aventine slopes rise to backdrop; the Campus Martius stops at the Porticus Octaviae; across the Tiber, Trastevere is a backdrop and the current is too strong to swim. The rest of the city appears as low-poly silhouettes so Rome never looks like an island.

### 12.2 Expansion order

| Step | Area | Milestone | Notes and anachronism flags |
|---|---|---|---|
| E0 | **Rome core** (§12.1) | v0.1–v0.2 | — |
| E1 | **The rest of the city**, one streamed worldspace (~6 × 6 km real, 3.6 × 3.6 km game; 64 m chunks): Subura and Argiletum; Esquiline and Oppian (Baths of Trajan, buried Domus Aurea, Sette Sale, Horti Maecenatis); Caelian (Castra Peregrina, Vigiles V, Temple of Claudius, Macellum Magnum); Aventine (Temple of Diana, Trajan's private house, Baths of Sura) and the Emporium; Campus Martius south and north (Theatre of Pompey, Largo Argentina, Pantheon site, Saepta, Iseum, Stadium of Domitian, Mausoleum, Ara Pacis, Horologium); Quirinal, Viminal and Castra Praetoria; Trastevere and the Janiculum (the brand-new Aqua Traiana's terminal castellum on the Janiculum [P; exact site U], with fulleries, baths and workshops in Trastevere fed by it; the Jewish quarter). **No Janiculum water-mills:** the multi-wheel mill complex on the Aqua Traiana is late 3rd century [A: Wilson's American Academy excavations, 1990–99]. A single small private mill is allowed only as [G] and stays out of the Lexicon as fact; the Vatican plain (Naumachia of Trajan); the **suburbium** along the first mile of the Via Appia (tombs, columbaria, Tomb of the Scipios) | v0.3–v0.7 | No Aurelian Walls: the city is open, with Servian wall stubs and a customs line. No Pons Aelius; the Horti Domitiae garden stands there instead. |
| E2 | **Ostia and Portus** (separate worldspace; Tiber boat or Via Ostiensis) | v1.1 | Trajan's hexagonal basin is new (c. 100–112 [P]). **Ostia's Capitolium and many of its big insulae and horrea are Hadrianic or later**: build a smaller, older Ostia. |
| E3 | **Via Appia and the Alban Hills** (Bovillae, Aricia, Nemi and the sanctuary of Diana Nemorensis with its runaway-slave priest, the *rex nemorensis* [A], the Alban Lake, Domitian's Alban villa) | v1.2 | Horses and roads arrive. **No Castra Albana** (Severan). Bandits (*latrones*). |
| E4 | **Tibur** (the sanctuary of Hercules Victor, the Anio falls, the round temple, the travertine quarries) | v1.3 | **No Hadrian's Villa** (begun c. 118). |
| E5 | **The provinces:** follow Trajan east (Antioch 114, Armenia, Mesopotamia, the Antioch earthquake of 13 Dec 115), or Dacia, Baetica or Britannia | v2.x | Its own design doc |

### 12.3 POI density targets

Measured along walkable routes in game meters, at a jog of 4.4 m/s.

| Tier | What | Target spacing | v0.1 count |
|---|---|---|---|
| 1 | **Landmark**: named, map-marked, discoverable (banner + Lexicon entry); usually enterable or quest-bearing | 1 per 150–250 m traveled | ≥ 40 discoverable |
| 2 | **Minor POI**: compitum shrine, *lacus* fountain, taberna, popina, workshop, painted notice wall, latrine, inscribed statue base | 1 per 40–80 m | ≥ 120 |
| 3 | **Ambient vignette**: barks, scuffles, a sacrifice, a procession, a cart at night, a dog stealing a sausage, pots falling from windows (Juvenal 3) | every 15–30 s by day, 30–60 s at night | ≥ 25 vignette types |
| — | Lootable containers in interiors and dungeons | 1 per 30 m | — |
| — | **Street-level containers**: amphora stacks, taberna strongboxes, shrine offering boxes, a loose paving slab over a cache. Owned ones are theft (§14.1); in v0.1, if crime doesn't ship, owned ones stay closed and only unowned caches open. | 1 per 60–100 m | ≥ 40 |

**Every tier-1 landmark has a "thing"**: a lootable, a note or inscription to read, a vista point, a named bark, or a mini-quest, so that seeing a place and going there always pays off (AC-23).

**Protect the sightlines** to the big landmarks: the gilded roof of the Capitolium, the amphitheatre, Trajan's Column, the Colossus, the Palatine façade over the Circus, and the gilded roof of the Basilica Ulpia. Within 150 game m of a major landmark, procedural blocks stay at 2–4 storeys; the 5-storey, 60-foot blocks belong to the dense quarters (`architecture.md` §0.3).

### 12.4 Dungeons

Every dungeon has a hook, an environmental story, three beats (exploration, a combat spike, a puzzle or traversal), a climax, a reward chest and a **loopback** to the entrance. Interiors are separate cells behind doors. **Interior scale rule:** interiors, including human-scale interiors of landmarks (the Column's stair, the Carcer, the Castor strongrooms, the hypogeum, the cryptoporticus), are built **1:1**, while the exterior stays at 0.6; the mismatch ("bigger on the inside") is accepted, as in Skyrim. **Kits (8):** `kit-cloaca`, `kit-hypogeum`, `kit-tomb`, `kit-cryptoporticus`, `kit-horrea`, `kit-insula`, `kit-quarry`, and `kit-landmark-interior` (1:1 stairs, podium rooms and cells inside scaled landmarks). Sizes: S = 5–10 min, M = 10–20 min, L = 20–40 min.

| ID | Place (accuracy note) | Kit | Size | Milestone | Climax | Loopback |
|---|---|---|---|---|---|---|
| `dun-taberna-collapsa` | The grassatores' hideout: a fire-gutted taberna cellar off the Vicus Tuscus (procedural, 3 rooms) | insula | S (5 min) | **v0.1 Must** | The knife-men's leader and the courier's stolen satchel | A light well up into the insula's courtyard |
| `dun-cloaca-maxima` | Cloaca Maxima, entered from the Venus Cloacina shrine | cloaca | M | **v0.1 Should** / v0.2 | `boss-rex-cloacae` (and optionally `boss-suchus`) | Grate by the Basilica Aemilia, unbarred from below |
| `dun-carcer` | Carcer Tullianum (never "Mamertine"), a 1:1 interior cell | landmark-interior | S | v0.2 | Escape or interrogation | Drain shaft to the Clivus Argentarius |
| `dun-columna` | Inside Trajan's Column: 185 steps [A], a 1:1 interior cell | landmark-interior | S | v0.2 | The Dacian shooter | Stair down or rope |
| `dun-cryptoporticus` | Nero's Palatine cryptoporticus | cryptoporticus | M | v0.3 | `boss-vitis` | Stair to the Domus Tiberiana gardens |
| `dun-insula-usta` | Burned insulae (procedural, several) | insula | S/M | v0.3 | Scavengers; collapsing floors | Jump to a neighbor's roof |
| `dun-hypogeum` | The amphitheater's hypogeum and its tunnel to the Ludus Magnus | hypogeum | M/L | v0.4 | `boss-ursus-hypogei` | Lift to the arena floor |
| `dun-horrea-piperataria` | Domitian's spice warehouses (later under the Basilica of Maxentius) | horrea | M | v0.4 | Guards and ledgers | Loading ramp to the Sacra Via |
| `dun-domus-aurea` | Nero's Esquiline wing, buried under the Baths of Trajan (104–109) | cryptoporticus/insula | L | v0.5 | `boss-mucapor` | Service shaft to the Sette Sale cistern |
| `dun-horrea-galbana` | The great river warehouses (Emporium) | horrea | M | v0.5 | Smugglers; a flood event | Wharf drop into the Tiber |
| `dun-specus` | Aqueduct channel of the Arcus Neroniani | linear | S | v0.5 | Water thieves; high views | Ladder down a pier |
| `dun-pantheon` | The burned Pantheon's building site | scaffolds | S | v0.5 | A chase over scaffolds | Ropes down |
| `dun-spelaeum` | The Mithraic cell's cellar (fictional by design) | shrine | S | v0.6 | `boss-heliodromus` | Secret stair to the insula's light well |
| `dun-sepulcra-appia` | Via Appia tombs and columbaria (pagan only; **no Christian catacombs**) | tomb | M | v0.7 | The cabal's arms cache | Up to a tomb roof, then a drop to the road |
| `dun-arenaria` | Tufa quarries off the Via Appia (working or abandoned in 113) | quarry | L | v0.7 | `boss-rex-sepulcrorum` | A collapse opens a shaft near the entrance |

---

## 13. Enemies and bosses

### 13.1 Roster

**Rule:** villains are individuals and cells, never whole peoples or religions.

| Archetype ID | Tier | Band | Kit | Behaviour | Where | First in |
|---|---|---|---|---|---|---|
| `grassator` (mugger) | thug | 1 | pugio or fustis | Hunts in pairs at night; flees at low HP | Streets, the Velabrum by night | v0.1 |
| `ebrius-rixator` (drunk tough) | thug | 1 | fists | Starts brawls ("Whose sour wine are you full of?", Juvenal 3.292 [A]) | Popinae | v0.1 |
| `collegium-bruiser` | bruiser | 1–2 | caestus or clava | Grapples, knockdowns | Subura, the Meta Sudans | v0.1 |
| `funditor` (slinger) | skirmisher | 1–2 | sling | Keeps distance, high stagger, uses ledges | Cloaca, rooftops | v0.1 Should |
| `cloacarius` (sewer dweller) | thug / bruiser | 2 | knives, nets, torches | Ambushes from side channels | Cloaca | v0.1 Should |
| `miles-urbanus` (urban soldier) | miles | 2–3 | scutum, gladius, pilum | Formation, pilum volley, arrests | Day patrols | v0.1 (law) |
| `vigil` (night watchman) | thug | 1–2 | dolabra, fustis | Prefers knockouts and arrests; calls siphon crews | Night patrols | v0.1 (law) |
| `canis` pack | beast | 1 | — | Packs of 2–4; flee from torches | Night alleys | v0.2 |
| `sicarius` (assassin) | veteran | 2–3 | sica, poison | Ambushes from crowds, feints | Main-quest streets | v0.2 |
| `effractor` (burglar) | thug | 2 | pugio | Flees over rooftops | Rich quarters at night | v0.3 |
| `sagittarius` (Syrian or Cretan archer) | skirmisher | 2–3 | composite bow | Cover and high ground | Main quest, Circus | v0.3 |
| `praetorianus` | elite | 4 | oval scutum, gladius, better armor | Coordinated; officers buff | Palatine, Castra | v0.3 |
| `fugitivarius` (bounty hunter) | veteran | 3 | spatha + Molossian hound | Tracks high-bounty players (§14.1) | Anywhere | v0.3 |
| Gladiators: `murmillo`, `thraex`, `hoplomachus`, `secutor`, `retiarius`, `provocator` | thug (tiro) / veteran / champion | 1–4 | by armatura (`society.md` §10.2) | Fight to type; yield in the arena; the secutor hunts by sound (flank him) | Ludus, amphitheater | v0.1 (tiro, thraex, retiarius); all by v0.4 |
| `eques` (mounted gladiator), `dimachaerus` [U, use rarely] | champion | 4 | lance / two swords | — | Amphitheater | v1.2 / v0.4 |
| `venator` | veteran | 3 | venabulum + dogs | Hunts beasts; hostile only in quests | Ludus Matutinus | v0.4 |
| `contrabandista` (smuggler) | thug / miles | 2 | gladius, hooks | Fights near water; boats | Emporium | v0.5 |
| `desertor` | miles | 2–3 | military kit | Desperate; may yield | Subura | v0.5 |
| `falcarius` (Dacian falx-man) | elite | 4 | falx | Unblockable sweeps | Domus Aurea, main quest | v0.5 |
| `fanaticus` (cult fanatic) | bruiser | 3 | knife, torch | Ambushes in the dark | Mithraic line | v0.6 |
| `agens-parthicus` (Parthian agent) | elite | 4 | bow + dagger | Kites, then closes in | Main quest | v0.6 |
| `veteranus-coniurationis` (cabal veteran) | elite | 4 | full legionary kit | Shield wall | Act III | v0.7 |
| `violator-sepulcri` (tomb robber) | thug / skirmisher | 2 | picks, slings | Traps, tunnels | Via Appia | v0.7 |
| Beasts: `aper`, `pardus`, `leo`, `ursus`, `taurus`, `crocodilus`, `lupus` | beast | 3–4 | — | §6.11 | Arena, escapes, sewers | v0.4 (v0.2 for the crocodile) |

### 13.2 Bosses

Each boss uses at least three of these patterns: a clear telegraph for every big attack; phases (at 66% and 33% HP by default); an arena hazard or tool to exploit; a wave of adds; a rule-breaker that forces new behavior; and a non-lethal resolution where the story fits.

**Phase rule:** each phase spans **at least 25% of HP before any yield or capture threshold**. Bosses that yield or can be captured use phases at **75% and 45%** and yield at **15%**, so the last phase is 30% of HP, not a two-hit flash.

| ID | Boss | Arena | First in | HP | Mechanics | Non-lethal resolution |
|---|---|---|---|---|---|---|
| `boss-nereus` | **Nereus the retiarius** (fictional champion) | Ludus Magnus practice arena, a *lusio* with practice arms (§6.10) | **v0.0** | 300 | **P1 (100–75%):** pokes with the blunted trident at 1.8 m reach; a net throw every 12 s (unblockable; telegraph: a 0.8 s twirl) entangles you for 3 s. **While entangled you can still raise a shield** (no parry) and struggle, and his first follow-up is always a telegraphed power poke (wind-up ≥ 0.8 s). **P2 (75–45%):** faster, feints, a sand kick (blinds 1 s). **P3 (45–15%):** he loses the net (or you cut it while he is entangled) and fights with trident and dagger in desperate lunges. **Rule-breaker:** the net. Teaches dodging, struggling free and crowd favor. | He yields at 15% (arena rules); the crowd and you decide on missio |
| `boss-rex-cloacae` | **Rex Cloacae**, a sewer gang lord | Cloaca junction chamber | v0.1 Should | 350 | Four lookouts plus a slinger on a ledge. At 50% he opens a **sluice**: the surge pushes everyone 6 m (hold E on a chain to hold on). Torches keep the rats back. | Open the sluice yourself first: his gang is flushed out and he surrenders |
| `boss-suchus` | **The crocodile** (an escaped exhibit) | Flooded Cloaca bay | v0.2 | 320 | Death-roll grab (mash to escape); fast in water, slow on walkways | Net it and return it to the Ludus Matutinus |
| `boss-vitis` | **Vitis**, the rogue praetorian centurion | Palatine cryptoporticus | v0.3 | 450 | Commands a 4-man **testudo**; his vine staff rallies them (+20% damage for 10 s; interrupt with a bash or sling). At 40% he duels alone. | Disarm him; with a mandate he yields to an officer's order |
| `boss-ursus-hypogei` | **The Bear of the Hypogeum** | Hypogeum | v0.4 | 480 | Charges that knock you down; rears up as a telegraph. Use the **lifts and cages**; close the trapdoors. | Cage it |
| `boss-par-gladiatorum` | **Murmillo and Thraex pair** | Amphitheater, midday | v0.4 | 2 × 220 | One holds a shield wall while the other flanks. Separate them with the lifts and trapdoors. | Missio |
| `boss-primus-palus` | **Ferox the Gaul**, Primus Palus (murmillo) | Amphitheater, the headline bout | v0.4 (capstone in v0.6) | 600 | **A learning boss:** after you use the same attack 4 times he starts parrying it. Phase 2 (at 50%): he drops the scutum for a spatha and speed. | Grant or receive missio (he yields at 15%) |
| `boss-auriga-rivalis` | **The rival charioteer** | Circus Maximus | v0.4 | — (a race) | Rams, whip, cutting in at the metae; his horse "carries a curse tablet" (a rumor) | Win cleanly, or let a bribe decide (Infamia) |
| `boss-mucapor` | **Mucapor**, the Dacian falx champion | Buried halls of the Domus Aurea | v0.5 | 500 | The falx **ignores shields**: only dodging works. Heavy telegraphed sweeps; he fights for his dead king. | Spare him and he can become a follower |
| `boss-incendiarius` | **The Incendiarius** (arsonist) | A burning insula on the Volcanalia | v0.6 | 380 | Pitch pots make fire zones; the fire spreads floor by floor and floors collapse on timers; vigiles allies with siphons | Knock him out and drag him out: an arrest |
| `boss-heliodromus` | **The traitor Heliodromus** | Spelaeum | v0.6 | 400 | **Darkness phase:** the lamps go out and you fight by sound (directional audio pings) and torchlight; then the lamps are relit for a duel in full light | Expose him to the Pater, who exiles him |
| `boss-advocatus` | **The opposing advocate** | Basilica Julia (Centumviral court) | v0.6 | — (debate) | Three rounds; you play arguments (evidence, precedent, pathos, patron) against a jury meter; the water-clock times each speech [A] | It is a debate |
| `boss-tacita` | **Tacita the Sicaria** | Crowded streets, then a confined space | v0.7 | 320 | A reverse hunt: she stalks you through crowds and you spot her by her tells (no reaction to crowd events, a hand inside her cloak). Then a duel with poison (bleeding and poison). | Unmask and arrest her |
| `boss-rex-sepulcrorum` | **The tomb-robber king** | Arenaria quarries | v0.7 | 380 | Tunnels he knows and you don't; collapsing galleries and traps; a chase, then a stand in a columbarium | Cut a deal: he knows the cabal's tomb route |
| `boss-gladius-coniurationis` | **Gn. Fabius Durus**, the Sword of the cabal | Via Appia tombs | v0.7 | 700 | **P1 (100–75%):** archers on the tomb roofs while your faction allies fight. **P2 (75–45%):** a shield duel (parry-heavy). **P3 (45–15%):** he wrecks a monument and fights among the rubble. | Hold back the final blow at 15% and he is captured for trial |

**Boss stat blocks** (`CombatProfile` overrides, §6.11; `dmgMult` 1.4 and the boss tier's other defaults unless stated). Race and debate bosses have none.

| ID | HP | AR (family) | Weapons (damage) | Skill | Poise | Reaction (s) | Block skill | Attack interval (s) | Tokens | Speed | Phases / yield |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `boss-nereus` | 300 | 7 (cloth: manica, greave) | `tridens-lusorius` 8 blunt; `rete`; a wooden practice dagger 6 blunt in P3 | 60 | 150 | 0.25 | 0.45 (weapon-only; `galerus` 0.35 on the left) | 1.6 / 1.3 / 1.1 by phase | 2 | 1.05 | 75 / 45; yields 15% |
| `boss-rex-cloacae` | 350 | 14 (padded) | gladius 13; pugio 8 | 60 | 150 | 0.25 | 0.50 | 1.6 | 1 (adds use the rest) | 1.0 | sluice at 50%; surrenders if you open it first |
| `boss-suchus` | 320 | 20 (padded hide) | bite 24 cut; death-roll grab | — | 140 | 0.40 | — | 2.2 | 2 | 2.5 land / 6.0 water (m/s) | 50; no yield (net it) |
| `boss-vitis` | 450 | 50 (plate) | gladius 13; scutum 0.85; vitis 9 | 80 | 170 | 0.20 | 0.75 | 1.4 | 1 with the testudo, 2 alone | 0.95 | testudo until 40%, then duel; yields 15% to an officer's order |
| `boss-ursus-hypogei` | 480 | 15 (padded hide) | claws 22 blunt; charge (knockdown) | — | 200 | 0.40 | — | 2.5 | 2 | 6.5 m/s | 66 / 33; caged, never yields |
| `boss-par-gladiatorum` | 2 × 220 | murmillo 21, thraex 26 (cloth) | gladius 13 + scutum / sica 11 + parmula | 70 | 120 each | 0.22 | 0.70 / 0.60 | 1.6 each | 1 each | 1.0 / 1.1 | when one falls the other speeds up +15%; each yields 15% |
| `boss-primus-palus` | 600 | 24 (cloth: murmillo kit) | Bilbilis gladius 17; scutum; spatha 14 in P2 | 90 | 180 | 0.20 | 0.80 | 1.3 / 1.0 | 2 | 1.0 / 1.15 | 50; yields 15% |
| `boss-mucapor` | 500 | 20 (padded) | falx 24 cut (sweeps unblockable) | 85 | 170 | 0.22 | 0.55 (weapon-only) | 1.8 | 2 | 1.0 | 66 / 33; spared at 15% |
| `boss-incendiarius` | 380 | 6 (cloth) | dolabra 15; pitch pots (fire zones) | 60 | 120 | 0.30 | 0.30 | 1.8 | 1 (the fire is the second threat) | 1.05 | floors on timers; KO-able |
| `boss-heliodromus` | 400 | 30 (mail) | spatha 14; pugio 8 | 75 | 150 | 0.22 | 0.65 | 1.5 | 2 | 1.0 | dark until 50%, then lit; exposed at 15% |
| `boss-tacita` | 320 | 10 (padded) | sica 11 and pugio 8, both poisoned | 85 | 110 | 0.18 | 0.50 | 1.2 | 2 | 1.15 | hunt (no HP phase), duel, poison at 50%; arrested at 15% |
| `boss-rex-sepulcrorum` | 380 | 14 (padded) | pick (dolabra 15); sling 8 stone | 65 | 140 | 0.25 | 0.40 | 1.6 | 1 (+ adds) | 1.05 | chase, then a stand at 50%; deals at 15% |
| `boss-gladius-coniurationis` | 700 | 52 (plate) | gladius 13; scutum 0.85 | 95 | 200 | 0.18 | 0.80 | 1.3 | 2 | 1.0 | 75 / 45; captured at 15% |

### 13.3 World danger without level scaling

Nothing scales with the player's level (§5.1), yet Rome must not feel "solved" after ten hours. Danger escalates through the world instead:

| Driver | Effect [design] |
|---|---|
| **Night** | Each district has a **night band**: day band +1 in the Subura, Trastevere, the Velabrum and the Via Appia suburbium; +0 on the guarded Palatine and Capitol. |
| **Main-quest act** | Each district has an **Act II band** (+1 after `mq-05`): cabal *sicarii* and Parthian agents appear in the streets. In Act III cabal veterans (`veteranus-coniurationis`, band 4) patrol the routes of the profectio. |
| **Bounty** | ≥ 2,000 sends *fugitivarii* (band 3) every 2–4 game days (§14.1). |
| **Fama and Infamia** | Fama ≥ 50 with a faction makes its enemies send band +1 crews (Lavernae vs Cohorts, Greens vs Blues). Infamia ≥ 40 draws underworld rivals and arena challengers. |
| **Festival riots** | Circus race days and the October Horse raise the band of the crowds near the venue by +1 for the day. |
| **Roaming events** | About once per 3 game days from Act II: a deserter gang (band 3–4), an escaped beast (band 3–4) or a cabal hit squad (band 3), announced by barks and a compass tick. |

| District (first in) | Day band | Night band | Act II+ band |
|---|---|---|---|
| Forum Romanum, Capitoline, Palatine (v0.0–v0.1) | 0–1 | 1 | 2 (Palatine 3: praetorians) |
| Velia, Colosseum valley (v0.0) | 1 | 2 | 2–3 |
| Imperial Fora (v0.1) | 1 | 1 | 2 |
| Circus Maximus and Porta Capena (v0.1) | 1 | 2 | 2–3 |
| Velabrum and Forum Boarium (v0.1) | 1 | 2 | 3 |
| Subura (v0.3) | 2 | 3 | 3–4 |
| Trastevere (v0.5) | 2 | 3 | 3–4 |
| Via Appia suburbium (v0.7) | 2 | 3 | 4 |

---

## 14. Systems

### 14.1 Crime and bounty

- **Jurisdictions:** by day (sunrise to sunset) the **Urban Cohorts**; by night the **Vigiles**; the Palatine and treason belong to the **Praetorians** in a separate ledger (`bounty.palatium`). Everything else goes on the city ledger (`bounty.urbs`), which both day and night patrols enforce.
- **Witnesses:** any NPC with a line of sight within 25 m (day) or 12 m (night) at the moment of the crime. Witnesses report when they reach a guard, or after 30 game minutes, unless they are intimidated, bribed or silenced (a further crime). A guard who sees the crime acts at once. **Hood up** (paenula or cucullus) at night: witnesses identify you only 50% of the time. An unidentified crime adds no bounty but raises that district's **alert** (0–3: more patrols for 1 game day).

| Crime ID | Bounty (den.) | Note |
|---|---|---|
| `trespass` | 5 | After a warning, in private or closed areas |
| `furtum` (theft) | 2 × value (min 5) | Goods are flagged `stolenFrom` |
| `furtum-personae` (caught pickpocketing) | 25 + 2 × value | |
| `effractio` (lockpicking seen) | 10 | |
| `rixa` (starting a brawl) | 10 | Only against someone who didn't agree to fight |
| `vis` (assault) | 40 | |
| `sacrilegium` | 250 | Theft or desecration in a temple; also `infaustus` (§14.6) |
| `violatio-sepulcri` (tomb violation) | 150 | |
| `usurpatio` (toga or stola without citizenship / gold ring on a man without equestrian rank) | 100 / 200 | Status crimes [A for the toga and the ring: Claudius punished usurpers; G for the stola]. A woman in a toga commits no crime but takes a social stain (§3.7). |
| `falsum` (forging seals, wills or coins) | 500 | Cornelian law on forgery [A] |
| `homicidium` (murder) | 1,000 | |
| `caedes-supplicis` (killing a yielded foe) | 1,000 | Pietas −15 |
| `incendium` (arson) | 1,500 | |
| `maiestas` (treason: the emperor's horoscope, violence on the Palatine) | 5,000 | Praetorian ledger |
| `fuga` (escaping custody) / resisting arrest | 100 / +50% of current | |

**When a guard confronts you:**

| Option | Rule |
|---|---|
| Pay | The bounty, minus 10% per Clientela rank (max 40%). Stolen goods are confiscated. |
| Persuade | Bounty < 200: Rhetoric check, DC = min(85, 10 + bounty/20). Success halves the bounty and you get a warning. |
| Bribe | Bounty ≤ 200 and a corruptible guard (vigiles 40%, urban 25%, praetorians 5%): pay 1.5 × bounty off the books |
| Carcer | Days = ceil(bounty/100), max 10 (citizens −25%). Each day you lose the progress bar (not levels) of one random skill. Confiscated goods wait in the evidence chest. |
| Asylum | Reach an imperial statue or a temple altar within 30 s: guards hold off for 1 game hour so you can negotiate. Non-violent crimes ≤ 1,000 only; once a day [P]. |
| Flee / resist | +10% / +50% bounty |

- **Thresholds:** bounty ≥ 1,000 means guards attack on sight. **≥ 2,000 means *fugitivarii*** (3 hunters with a Molossian hound) come for you every 2–4 game days outdoors.
- **Severe sentences:** after an arrest with a murder conviction or a bounty ≥ 3,000 you are condemned **`ad-ludum`**: you become a condemned fighter at the Ludus Magnus. Win 3 bouts and you are released with the bounty cleared (Infamia +30). *Relegatio* (exile to Latium) arrives with the expansions.
- **Status softens sentences** [P; the formal honestiores/humiliores divide is later]: a citizen never gets flogged; an eques pays a fine (×2) instead of the Carcer, except for *maiestas*.
- **Lapse:** a city bounty under 40 is forgotten after 7 elapsed days without a new crime (Rome is big).

### 14.2 Stealth

Each NPC keeps a **suspicion** value S (0–100) toward the player, updated at 5 Hz (budget: at most 24 NPCs with line-of-sight checks per tick).
```
ΔS/s    = visual + hearing      (if both are 0 the NPC does not perceive you, and S decays 15/s)
visual  = 100 × V × A × P       (0 without line of sight)
hearing = 40 × Σ noise_i × clamp(1 − d/Rn_i, 0, 1)²
V    = light (0.2 dark … 1.0 sunlit; torch-carrier +0.5)
       × stance (sneaking 0.5, standing 1.0) × motion (still 0.6, walk 1.0, run 1.5, sprint 2.0)
       × crowd (0.6 with ≥ 3 NPCs within 3 m; 0.4 with Crowd Blend) × (1 − stealth/200)
A    = 1.0 within ±40° of the NPC's gaze, 0.5 within ±80°, 0.15 behind
P    = clamp(1 − d/R, 0, 1)²   with R = 25 m by day, 12 m at night (18 m if the NPC carries a torch)
noise (continuous sources, per second):
  footsteps = motion (still 0, sneak or walk 1.0, run 1.5, sprint 2.0) × caligae on stone 1.2 × heavy armor 1.5
              × sneaking 0.3 × (1 − stealth/200);   Rn = 8 m (12 m when sprinting)
  sling whirl 3.0, Rn = 15 m;   every continuous source ×0.5 inside a crowd (≥ 3 NPCs within 3 m)
noise events (instant):  ΔS = 100 × loudness × clamp(1 − d/Rn, 0, 1)
  sling release 1.0 (Rn 25 m) · clash of arms, hit or shout 1.0 (Rn 25 m) · a body falling 0.6 (Rn 10 m)
  · a breaking lockpick 0.4 (Rn 6 m)
```
- **Thresholds:** S ≥ 35 = **suspicious** ("*Quis est?*"; investigates the last known position for 20 s); S ≥ 100 = **detected** (combat, or a witness to crimes). Bystanders track S too (it decides witnesses and sneak attacks), but only **hostiles, guards in restricted areas and owners of private space** react at 35, so walking through a crowd never sets off a chorus of "*Quis est?*".
- **HUD eye:** closed (S < 5), half-open (5–35), open (35–100), red flash on detection.
- **Vitest canon** (stealth 10): (1) standing still by day, NPC facing you at 5 m → visual 36.5/s, detected in ~2.7 s; (2) sneaking behind an NPC at 2 m at night without a torch → ~7.4/s, suspicious in ~5 s; (3) sprinting in heavy armor and caligae on stone behind an NPC at 5 m by day → ~65/s, detected in ~1.5 s; (4) a sling shot 15 m from an unaware NPC → +40, suspicious, and nothing at 25 m; (5) walking past an NPC's back at 3 m in a Forum crowd → ~14/s, but a bystander does not investigate.
- A sneak attack (§6.7) requires the target's S < 35.

### 14.3 Locks and seals

Roman locks are **lift-and-slide tumbler locks**: the key lifts the tumblers so the bolt can slide [A]. The minigame works with keys only.
- **Tiers:** `simplex` (2 tumblers), `mediocris` (3), `difficilis` (4), `firma` (5), plus seals.
- **Play:** for each tumbler, **hold Space, F or the mouse button** to lift. A lift meter oscillates at 0.9 cycles/s; **release inside the set zone** to set the tumbler. When every tumbler is set, press D to slide the bolt.
- **Set zone width** = 22% of the meter × (1 + locks/100) × tier factor (1.0 / 0.8 / 0.6 / 0.45).
- A release outside the zone adds **strain**; 3 strain breaks the pick (`hamulus`, 1 den.). Tumbler Sense adds a click and a highlight.
- **Seals:** heat the wax (hold), lift, read, then reseal at the right temperature (release in a zone). A failed reseal leaves a visible flaw: the recipient notices, which can fail quests or reveal you. Forging a seal ring needs `perk-locks-forger` and a wax impression.

### 14.4 Pickpocketing

Crouch behind an NPC and press E to open their purse. The success chance is shown before each lift.
```
p = clamp(0.05, 0.95, 0.40 + pickpocket/150 + 0.15·crowd(≥3 within 4 m) + 0.15·unaware(S < 35)
          − 0.04 × weight(kg) − value/400 − 0.30·alert)
```
Equipped items cannot be lifted. Planting needs `perk-pickpocket-plant`. Failure: the target shouts (`furtum-personae`, unless covered by Crowd Cover).

### 14.5 Persuasion and dialogue checks

Dialogue checks show the **approach** and the **odds**.
```
p = clamp(0.05, 0.95, 0.50 + (rhetoric + mods − DC)/100)
DC tiers: Facilis 10 · Mediocris 25 · Difficilis 40 · Ardua 55 · Gravissima 70 · Herculea 85
mods: disposition (−20…+20) + 5 × (your Dignitas step − theirs) + clothing (formal dress, toga or stola and palla, +10 with elites)
      + cleanliness (sordidus −10, lautus +10) + Fama/10 + Infamia effects (§3.4) + perks + Venus' Charis (+25)
```

| Approach | Uses | Notes |
|---|---|---|
| **Persuade** | rhetoric | The default |
| **Intimidate** | rhetoric + 10 × (your band − theirs) + 10 if armed and armored | NPCs have no level, so it compares **bands** (§6.11): your band = min(5, 1 + floor(level / 8)), so a new character counts as band 1, like a thug. Lowers disposition afterwards; fails automatically against elites |
| **Bribe** | — | Always succeeds if the target is corruptible. Cost = DC × 0.5 den. × status (plebs 1, soldiers 2, officials 5). Refused by `incorruptible` NPCs. |
| **Invoke patron** | Clientela rank | Needs rank ≥ `amicus-minor`: +15 (+15 more with the perk) against targets of lower status |

A failed check can't be retried with the same NPC and approach for 24 game hours.

### 14.6 Pietas and the gods

**Pietas gains and losses** (the pool never regenerates over time; §3.3):

| Gain | Pietas | Loss | Pietas |
|---|---|---|---|
| Daily prayer at a compitum shrine (once per shrine per day) | +5 | Killing a yielded foe | −15 |
| Prayer at a temple with an offering | +10 | Theft in a temple, desecration, tomb robbing | −25 and `infaustus` |
| Home lararium prayer (once a day) | +15 (full with the perk) | Killing inside a temple precinct | −30 and `infaustus` |
| Taking part in a festival rite | +25 | Breaking a vow | −30 and `infaustus` |
| Fulfilling a vow | +20…+50 | Sacrilegious oath-breaking (lying "by the Genius of Caesar") | −10 |
| Sparing a yielded foe; burying the dead properly | +5 / +10 | | |

**Below zero:** Pietas never shows less than 0, but a loss the pool can't cover goes into a hidden **`impietas`** debt. While `impietas` > 0 you are `infaustus`, and devotion pays the debt off before it refills the pool, so impious acts always cost something.

**Shrines and blessings.** You have **two slots**: one **temple blessing** (24 game hours; costs an offering of at least a libum, a pinch of incense or 1 den.) and one **Lares favor** (2 game hours, free at any of the many compitum shrines: +10% stamina regeneration). Blessings feel like gusts, bird calls and sunlight; there are no visual effects.

| Blessing ID | Temple (landmark) | Effect (24 h) |
|---|---|---|
| `benedictio-iuppiter` | `temple-jupiter-capitolinus` | −10% damage taken |
| `benedictio-mars` | `temple-mars-ultor` | +10% melee damage |
| `benedictio-minerva` | `temple-minerva-nerva` | +15% XP for Fabrica, Medicina, Locks & Seals |
| `benedictio-venus` | `temple-venus-genetrix` | +10 persuasion |
| `benedictio-castores` | `temple-castor-pollux` | +5% move speed; +15% Equitatio XP |
| `benedictio-saturnus` | `temple-saturn` | +5% sell prices |
| `benedictio-vesta` | `temple-vesta` (forecourt; men may not enter) | +25% fire resistance; better rest |
| `benedictio-hercules` | `ara-maxima` (women are barred from its rites [A]: they pray at `temple-hercules-victor`) | +20 kg carry; +10% blunt damage |
| `benedictio-portunus` | `temple-portunus` (god of keys) | Lock set zone +15% |
| `benedictio-fortuna` | `sant-omobono-temples` | +5% crit and luck rolls |
| `benedictio-magna-mater` | `temple-magna-mater` | +15 max stamina |
| `benedictio-apollo` | `temple-apollo-palatinus` / `temple-apollo-sosianus` | +10% ranged damage |
| `benedictio-aesculapius` | `temple-aesculapius` | +50% healing from remedies; cures disease |
| `benedictio-nemesis` | amphitheater shrine | +25% crowd-favor gain |
| `benedictio-diana` / `-ceres` / `-isis` / `-laverna` | Aventine / Aventine / Iseum Campense / Porta Lavernalis (v0.3+) | Night stealth and ranged +15% / food effects ×1.5 / poison resistance +25% / pickpocket +15% |

**Patron deity** (choose at the god's temple; changing costs 100 den. and a 7-day wait). It gives a passive bonus and an invocation on **Z**:

| Patron ID | Temple | Passive | Invocation (Pietas cost) |
|---|---|---|---|
| `patronus-mars` | Mars Ultor | +10% stamina regeneration in combat | *Furor* (30): power attacks cost no stamina for 10 s |
| `patronus-minerva` | Minerva (Forum of Nerva) | +10% XP for Fabrica and Medicina | *Clarity* (30): enemy telegraphs read more clearly (slower anticipation) for 15 s |
| `patronus-mercurius` | Mercury (by the Circus Maximus) | Better prices (+5%) | *Swift* (30): sprinting costs no stamina for 20 s |
| `patronus-fortuna` | Fortuna (Sant'Omobono) | +5% crit and luck | *Fortune's Turn* (25): your next lock, lift or persuasion roll succeeds |
| `patronus-hercules` | Ara Maxima / Hercules Victor | +15 kg carry | *Labor* (30): immune to stagger for 10 s |
| `patronus-venus` | Venus Genetrix | +5 persuasion | *Charis* (30): +25 persuasion for one conversation |
| `patronus-diana` | Diana (Aventine) | +10% at night and with bows | *Keen* (30): hear hidden enemies (audio pings) for 30 s |
| `patronus-aesculapius` | Tiber Island | +25% bandage healing | *Salus* (40): heal 50% over 10 s |
| `patronus-laverna` | Porta Lavernalis (via the Cultores) | Quieter steps (−20% noise) | *Shade* (30): silent footsteps for 30 s |
| `patronus-nemesis` | Amphitheater shrine | +15% crowd favor; +15 points on missio rolls | *Retribution* (30): +25% damage against your last attacker for 15 s |
| `patronus-mithras` | via the Sodales Invicti | +15 poise | *Invictus* (50, once a day): stay at 1 HP instead of dying |
| `patronus-isis` | Iseum Campense | Praying cures ailments | *Salvation* (30): cure poison and bleeding |

**Vows (*vota*).** At a temple, before a quest, pledge an offering of value V, with **V ≥ max(5 den., 10% of the quest's expected reward)**. You get `votum` until the quest ends, scaled by V: +5% damage resistance and +5% stamina regeneration at the minimum, +10% / +10% at V ≥ 25 den., +15% / +15% at V ≥ 100 den. On success you owe V within 3 days; paying it gives Pietas +20 (+30 at V ≥ 25, +50 at V ≥ 100), Religio XP 40 and "V·S·L·M" on a votive tablet. If you don't pay, you become `infaustus`.

**`infaustus` (ill-omened):** −10% on luck rolls (crit, lifts, lock zones), −5 disposition with the pious. Cured by a *piaculum*: pay 2 × V (or 20 den.) at a temple and perform the rite; a piaculum also clears any `impietas` debt.

**Daily omen:** the first time you go outdoors after dawn, 60% nothing, 20% a good omen, 20% a bad one. *Accept* a good omen (+5% crit for the day). *Refuse* a bad one by touching an amulet (automatic if you wear a `fascinum`) or re-crossing the threshold; otherwise −5% luck for the day [A: omens could be accepted or refused, Pliny *NH* 28.17].

**Curse tablets:** write one (or commission it from a *magus*), nail it, and deposit it in a grave, well or spring. **It works only through belief:** the rumor reaches the target in 1–3 days (faster if you tell them, or nail a copy up in public). The target gets −15% performance for 5 days (×1.5 if superstitious; Epicureans are immune; amulets negate it). If the player learns of a tablet against them and wears no amulet: `defixus` (−5% luck, −5 persuasion for 3 days). A placebo, honestly labeled.

### 14.7 NPC schedules and crowds

Schedules are authored in **Roman hours** (hour *n* starts at `sunrise + (n − 1) × daylight/12`; night has four watches, *vigiliae*) and compiled to clock hours for the current date (`ScheduleEntry.from`).

| Time | City life | Gameplay |
|---|---|---|
| 4th watch, before dawn | Night carts leave; clients gather at patrons' doors | Arrival (mq-01); the salutatio |
| Hours 1–2 | **Salutatio**; shops open | Clientela radiant (the sportula) |
| Hours 2–6 | Fora, courts, markets, schools, workshops at full bustle | Shopping, court cases, peak crowds |
| Hour 6 (noon) | *Prandium*; shops slow | Popina gossip (rumors) |
| Hours 7–8 | Rest; streets ease; the rich go to the baths | Burglary windows in rich houses |
| Hours 8–9 | **Baths** (thermae open around midday until dusk) | Bath thieves, gossip, getting clean |
| Hours 9–10 | **Cena** | Dinner-party quests; burglaries |
| Night | Streets dark; **carts allowed**; vigiles patrol; taverns; crime | Muggings, fires, Lemuria ghosts |

Archetype templates (`npc/schedules.ts`): `tabernarius` (shopkeeper), `faber` (artisan), `patronus` (senator), `cliens`, `matrona`, `servus-baiulus` (porter), `miles-urbanus`, `vigil` (sleeps by day), `sacerdos` (temple opens at dawn and closes at dusk), `gladiator` (drills hours 1–6 and 8–10, locked in at night), `otiosus` (idler at the Basilica Julia gaming boards), `mendicus` (beggar), `plaustrarius` (night carter), `grassator` (night only), `puer` (children and errands).

**Crowd targets:** Forum Romanum at hours 2–6 shows **≥ 60 NPCs on screen** (≤ 40 animated at full rate, the rest on animation LOD; **v0.1 Must is 30, Should 60**); at night ≤ 25 visible, plus carts, vigiles with lanterns and rare revelers with torches. At most 150 simulated NPCs in the loaded area. Off-screen NPCs jump along the street graph.

### 14.7b Navigation

Combat AI paths, circles and flees; schedules walk NPCs through a procedural city. Navigation is its own subsystem (`src/nav/`, behind the `NavService` interface of `tech.md` §6.2):
- **Street graph** for long routes, schedules and off-screen NPCs (A* over street and vicus centerlines, doors and fora as nodes).
- **Navmesh tiles near the player** (Ring 0–1), generated in a worker from the same collider descriptors the physics uses (or baked at build time from the same data). Library: **navcat** (pure TS), with recast-navigation-js as the fallback (`tech.md` §6).
- **Crowd steering** (Detour-style crowd / RVO) for agents within ~60 m; beyond that, path following with separation.
- **Bodies and the crowd:** crowd NPCs sidestep the player; the player **shoulders through** with a soft push (crowd NPCs are kinematic agents, never hard walls). Hostiles block normally.
- **Bystanders and blows:** melee hits register on non-hostiles **only from a directed attack** (lock-on target or crosshair aim). Sideways sweeps and lock-on target hostiles only, so a power sweep in the Forum never turns into a string of assault crimes.
- **Flee targets** ("the nearest safe point", §6.13) are street-graph nodes tagged `home`, `guard` or `crowd`.

### 14.8 Baths, rest and cleanliness

- **Baths** (Thermae Traiani, Thermae Titi, any *balneum*): 1 quadrans. Going through apodyterium → tepidarium → caldarium → frigidarium (or interacting once) passes 1 game hour and gives **`lautus`** (washed) for 12 game hours: +10 persuasion, +10% stamina regeneration, and removes `sordidus`. A massage (2 as.) also fully restores stamina. Tip the capsarius (1 as.) or there is a 15% chance your outer garment is stolen.
- **`sordidus`** (bloody or filthy) comes from combat with bleeding, sewers and dungeons, and lasts until you wash: −10 persuasion, and NPCs bark about it. A street fountain (*lacus*) removes it but gives no `lautus`.
- **Sleep and wait (T):** 1–24 game hours. Not allowed while `inCombat` (§6) or while trespassing. Sleeping in **your own bed** gives `bene-quietus` (+10% skill XP for 8 game hours); a rented bed gives `quietus` (+5%). Sleep restores all health and stamina.

### 14.9 Conditions

| ID | Cause | Effect | Cure |
|---|---|---|---|
| `cruentus` (bleeding) | Cut hits (§6.2) | 2 HP/s per stack, 6 s | Bandage |
| `veneno` (poisoned) | Poisons, sicarii | Per the poison | Theriac, Isis' invocation, physician |
| `injured` | Losing in the arena, falls over 7 game m | −20% max HP for 1 game day | Physician, rest |
| `caecatus` | Thrown sand, smoke | Vision blurred 1–3 s | Wait, collyrium |
| `ebrius` | Wine | §8.5 | Time |
| `febris` (v0.5+) | Sleeping in low districts (Velabrum, Campus Martius, Trastevere) Aug–Oct: 10% chance per night | −15% max stamina until cured | `febrifugum`, physician, Aesculapius (malaria season [A]) |

### 14.10 Time, calendar and festivals

- **Clock:** `timeScale = 20` (1 game day = 72 real minutes). The sun follows `architecture.md` §7.1 for the current date. The moon phase follows the elapsed days from the computed 113 lunation.
- **Two counters:** `elapsedDays` always counts up (rent, cooldowns, nundinae every 8th elapsed day, moon). The **calendar date** advances at midnight, **except under the *pridie* clamp**.
- **The *pridie* clamp** (*pridie* = "the day before"): the main quest has date **anchors** (12 May, 9 Jun, 6 Jul, 23 Aug, 1 Sep, 18 Sep, 19 Oct; §10.3). While the next anchor's quest is pending, the calendar cannot pass that anchor's **eve**. Days keep cycling, schedules run and rent accrues, but the date stays on the eve, with festival preparations as ambience. Between anchors the calendar runs freely, so festivals pass naturally. The world waits for the player, as Skyrim's does.
  - **Only main-quest set pieces are anchors.** Faction capstones are not date-bound (`vig-07` follows `vig-06`, `cli-07` takes the next Kalends or Ides, `cir-07` the next ludi with races; §9.2), so **every faction line can be finished while the main quest waits**. Dated misc quests that the clamp holds back are offered again later (§11.1).
  - **Starting a set piece:** on the eve, entering the anchor's trigger area or choosing "Wait until…" moves the date to the anchor (a one-day step) and the set piece starts. If the anchor is more than a day away, the trigger area only says when to come back ("Come back on the Vestalia, in 19 days"), with a **Wait until…** button.
  - **Any multi-day jump** first shows a **confirmation listing what it skips**: festival windows, dated misc quests (re-offered later, §11.1), rent falling due, vows coming due and bounties lapsing.
  - **The jump itself:** date += Δ and `elapsedDays` += Δ; every timer advances by Δ as if you had waited (rent, vows, cooldowns, bounty lapse, body persistence, cell resets, followers' wages); the moon follows `elapsedDays`; NPCs are re-placed by their schedules; the usual Wait rules apply (not while `inCombat`).
  - **Festival effects** (ambience, closures, price changes) fire only on the first elapsed day that carries a festival date. A clamp-held eve that is itself a festival day (11 May, the Lemuria, all through v0.1) is the festival only once; on later elapsed days it is just "the eve of the Column".
  - If you ignore the main quest, the date stays on the next eve and the seasons wait with it. Appendix B Q8 asks the owner whether a free-running calendar should be an option.
- **Festivals in the game window** (sources: `society.md` §5, Ovid's *Fasti*):

| ID | Date (113) | Festival | Gameplay |
|---|---|---|---|
| `fest-lemuria` | 9, 11, 13 May | Lemuria | Midnight bean rites; ghost glimpses. **Temple cellae are shut** [A: Ovid *Fasti* 5.485–6]: the aedituus won't open the doors, so no temple blessings, vows or patron choice that day. **Open as usual** [G]: the Castor podium strongrooms and other podium offices, whose doors open from outside the shrine, and the open-air compitum shrines (the Lares favor). Encode these exceptions in the festival data so the building is never hard-closed. |
| `fest-columna` | 12 May | Column dedicated; Venus Genetrix rededicated | `mq-04`; crowds in the Imperial Fora |
| `fest-argei` | 14 May | Argei puppets thrown from the Pons Sublicius | `misc-argei` |
| `fest-mercuralia` | 15 May | Merchants' purification at Mercury's spring by the Porta Capena | `misc-mercuralia`; −10% prices |
| `fest-vestalia` | 7–15 Jun (main day 9 Jun) | Vestalia: storeroom opened to matrons; bakers rest; donkeys garlanded | `mq-10`; bakeries closed |
| `fest-matralia` | 11 Jun | Matralia (Mater Matuta) | Women's rite at the Sant'Omobono temples |
| `fest-quinquatrus-minores` | 13–15 Jun | Flute-players roam masked and drunk | Street vignettes |
| `fest-fors-fortuna` | 24 Jun | Garlanded boats drift down the Tiber | Riverside party |
| `fest-kalendae-iuliae` | 1 Jul | Leases and rents due | Rent; `misc-kalendae-iuliae` |
| `fest-ludi-apollinares` | 6–13 Jul | Theatre, then circus races | `mq-11`; Circus race days; `cir-07` if pending |
| `fest-nonae-caprotinae` | 7 Jul | Slave women's festival | Feasts under fig trees |
| `fest-transvectio` | 15 Jul | Knights' parade through the Forum past the Temple of Castor to the Capitol | Parade route blocks the Forum |
| `fest-ludi-victoriae` | 20–30 Jul | Games for Caesar's victory | Races; `cir-07` if pending |
| `fest-neptunalia` | 23 Jul | Leafy shelters by the river | River vignettes |
| `fest-diana` | 13 Aug | Slaves' holiday on the Aventine | Torch processions |
| `fest-portunalia` / `fest-consualia` | 17 / 21 Aug | Harbors and keys / horses and mules rest | Lock blessing doubled / Circus races |
| `fest-volcanalia` | 23 Aug | Volcanalia: work by lamplight from now on | `mq-12` (and `vig-07` if still pending) |
| `fest-mundus` | 24 Aug, 5 Oct | *Mundus patet* | More omens; amulet prices ×2 |
| `fest-ludi-romani` | 4–19 Sep (Epulum Iovis 13 Sep) | Rome's oldest games | `mq-14`; `cir-07` if pending |
| `fest-natalis-traiani` | 18 Sep | Trajan's 60th birthday | `mq-14` |
| `fest-ludi-augustales` | 3–12 Oct | Augustalia at the altar of Fortuna Redux, vows for a safe return | Vows ×1.5 |
| `fest-equus-october` | 15 Oct | The October Horse | `misc-equus-october` |
| `fest-armilustrium` | 19 Oct | Purification of the army's weapons | `mq-15` |

### 14.11 Housing (and the slavery policy)

| ID | Home | Where | Cost | Features |
|---|---|---|---|---|
| `domus-pergula` | A pallet behind a taberna | Your origin's district (v0.1: the Velabrum) | Free | Bed, one chest |
| `domus-cenaculum` | Upper-floor flat | Subura or Aventine insula | 15 den./month | Bed, 2 chests, **lararium**; fire and collapse events |
| `domus-taberna` | Ground-floor flat with a workshop | Esquiline or Quirinal | 40 den./month | Safer; a forge or medicus bench |
| `domus-caeliana` / `domus-esquilina` | A **domus** | Caelian / Esquiline | 8,000 / 12,000 den. plus a patron's or faction's approval | Atrium, peristyle (herb plot), library (book display), trophy room, forge, staff of **paid freedmen** |
| `villa-suburbana` | A villa outside the city | Expansions | — | Stables, farm income |

Rent is due every 30 elapsed days, and 1 July is lease day. Three missed months mean eviction (your goods go to the evidence chest at the Carcer). **Slavery policy:** enslaved people exist in the world and are shown honestly; the player is **never required to own slaves**. An inherited household can be **manumitted** (+Pietas, +Fama), and quests let you help people win freedom.

### 14.12 Fast travel (decision)

- **Map fast travel is ON by default** (**Should** in v0.1), to any discovered tier-1 landmark or owned or rented home, from outdoors. Not allowed while `inCombat` (§6), while overencumbered, or while trespassing. Game time passes as if walking (route length / 4.4 m/s).
- **Diegetic alternatives:** **litter stands** (*lectica*, 1 den., about 30% faster than walking, safe from muggers) by the fora, the Circus and the Colosseum; **Tiber boats** from the Portus Tiberinus (to the Emporium, and to Ostia in v1.1).
- **"Lectica only" mode** (a setting) disables map travel for immersion.

### 14.13 Saving

- **Free saving** anywhere except while `inCombat` (§6), in dialogue or in a fall: **10 manual slots**, **3 rotating autosaves**, and **1 quicksave** (F5 or P / F9 or L, §4.2).
- **Autosave** on interior cell changes, quest stage completion (at most every 120 s), sleep or wait, and every 10 real minutes.
- **Format:** `{ saveVersion, generatorVersion, worldSeed, gameTime (date, elapsedDays, clamp), player, questStates, factionStates, entityDeltas }`. Deltas key on stable IDs (`${worldspace}:${cx},${cz}:${generator}:${index}` for procedural objects).
- **Storage:** IndexedDB, with every access wrapped in try/catch. Call `navigator.storage.persist()`. Add **Export/Import save file** (JSON) to guard against Safari's 7-day eviction. Version migrations are pure functions with Vitest fixtures.

### 14.14 Followers

One **human** and one **animal** at a time. Commands go through dialogue, or hold E while looking at the follower (wait, follow, trade, use item, fight here). Followers have a fixed level band (no scaling) and improve with the gear you give them. On Normal they are **downed** (they recover after combat); on Difficilis and above they can die.

| ID | Follower | How you get them | Specialty | Wage |
|---|---|---|---|---|
| `comes-pugil` | Freedman bodyguard (a Syrian ex-boxer) | Hire at a popina | Brawler; +10 to intimidation | 2 den./day |
| `comes-gladiator` | Hired gladiator | Hire from the lanista, or a Ludus reward | Tank; crowds recognize him | 5 den./day |
| `comes-optio` | Discharged optio | Veteran origin, or a quest | Shield wall; good against formations | 3 den./day |
| `comes-sagittarius` | Cretan archer | Circus or Urban Cohorts line | Ranged support | 4 den./day |
| `comes-medica` | Medica | Tiber Island quest | Heals you; cures bleeding | Free |
| `comes-puer` | A street kid "guide" | Subura quest | Reveals nearby tier-2 POIs; knows shortcuts | Free (feed him) |
| `comes-nomenclator` | Nomenclator (knows everyone's name) | Clientela reward | **UI perk:** NPC names, factions and patrons on the HUD | Free |
| `comes-mucapor` | Mucapor, the Dacian falx champion | Spare him (`boss-mucapor`) | Unblockable falx sweeps | Free |
| `comes-molossus` | Molossian hound (the animal slot) | Buy a pup or rescue a dog | Tracking; attack dog | — |

---

## 15. UI

**Implementation:** a DOM overlay (Preact + signals) over the canvas. The HUD layer has `pointer-events: none`; interactive panels turn it on. Fonts: **Cinzel** (titles, banners, map labels; carved capitals with interpuncts, e.g. `AEDES·SATVRNI`; attested Latin names only, §2.3) and **EB Garamond** (body text). Both are self-hosted OFL. The 3D view pauses (or drops to 10 fps) under full-screen menus.

### 15.1 HUD

| Element | Placement | Behaviour |
|---|---|---|
| **Compass** | Top centre, 600 px, showing 180° | Letters N/E/S/W (the Latin names *Septentrio, Oriens, Meridies, Occidens* in a tooltip, since their initials collide). Gold quest markers (a diamond), white icons for discovered landmarks, outlined icons for undiscovered landmarks within 150 m, red ticks for aware enemies, green for the follower. Markers can be turned off ("Morrowind mode": the journal gives Roman directions instead). |
| **Bars** | Bottom: **Health** centre (cinnabar `#A3271F`), **Stamina** right (green earth `#6F8656`), **Pietas** left (Egyptian blue `#2D5DA1`) | Each fades 3 s after it is full; flashes when a cost is refused |
| **Crosshair** | Centre | A 4 px dot; a reticle with ranged weapons; the lock-on target gets a bracket |
| **Sneak eye** | Above the crosshair | §14.2 states |
| **Interaction prompt** | Below the crosshair | `[E] Talk · Gaius the baker`, with the key label taken from the live bindings; a lock tier or the owner's name appears when relevant (red for "owned") |
| **Notifications** | Top left, at most 4, 4 s each | "Blades increased to 21", "Quest updated", "+5 Pietas", "Crime witnessed: furtum (bounty 12 den.)" |
| **Discovery banner** | Upper third, centre | `AEDES·CASTORIS` with "Temple of Castor and Pollux" below, plus an optional Lexicon link. A place with no known ancient name (the Markets of Trajan) shows the English label alone. |
| **Boss bar** | Bottom centre, above the Health bar | Name and title ("Nereus · Retiarius, victor of 31"), with phase pips |
| **Arena favor** | Right edge, vertical | Crowd-favor meter, with the chant shown at a missio |
| **Subtitles** | Bottom, above the bars | Every bark, with the speaker's name; Latin phrases in italics with a gloss |
| **Time and date** | On the wait screen, or when holding Tab | Roman hour ("hora V"), the Roman date ("a.d. V Id. Mai."), the consuls' dating formula in a tooltip, and a nundinae marker |
| **Damage direction** | Screen edge | A short cinnabar wedge toward the attacker; the unblockable cue (§6.4) |

### 15.2 Menus

| Menu | Key | Contents |
|---|---|---|
| **Hub** (Tab) | Tab | A ring of the six menus below plus time and date |
| **Sarcina** (inventory, a soldier's pack) | I | Categories: weapons, armor, clothing, consumables, ingredients, books, keys, misc, quest. Sort, weight, value, condition, a compare panel, equip, use, drop, and hotbar assignment (press 1–8 over an item). The equipped look shows on the avatar preview. |
| **Columna** (skills) | K | 17 skills in three groups; each skill is a column with its perks as reliefs spiralling up it (a nod to Trajan's Column). Shows level, progress and how to train; spending perk points; the level-up choice (+10 pool) |
| **Forma** (map) | M | Generated **from the atlas** (AD 113 features only) in the style of an incised marble plan (the Severan plan is later; a Flavian one probably hung in the Templum Pacis [U]). Discovered markers, the player arrow, quest markers, a custom marker, fast travel, and a zoom level per district. |
| **Tabulae** (journal on wax tablets) | J | Quests by category (main / faction / misc / radiant) with stages written in the first person, objectives and **set active**. Tabs: conspiracy **board** (Act II), factions (rank, Fama, next rank), Dignitas/Fama/Infamia, and bounties. |
| **Lexicon** | via the hub | Places, people, customs and sources: a light "Discovery Tour". Entries unlock on discovery. Invented content is labelled, and so are **modern conventional names** ("Colosseum", "Domus Flavia", "Markets of Trajan", "Sant'Omobono"), which appear as English labels with a note on the ancient name or its absence (§2.3). |
| **Settings** | Esc | Gameplay (difficulty, markers mode, fast-travel mode, Space-always-jumps, simple power), controls (preset, rebinding, sensitivity, hold or toggle per action), video (quality preset, render scale 0.5–1.5, shadows, view distance, FOV, head-bob, camera shake, motion blur), audio (master, music, ambience, SFX, UI), accessibility (§4.5), and saves (slots, export/import) |

**Dialogue:** a list of options. Checks show the approach and the odds ("[Persuade 64%]", "[Bribe 12 den.]", "[Invoke patron +15]"). Quest-related options carry a small marker. **Barter:** two columns, live prices, haggle (one try a day). **Character creation and level-up** are full-screen panels styled like an inscribed plaque.

---

## 16. Art and audio direction

### 16.1 Art direction: procedural stylized-realism

- **Real proportions and real materials, simplified geometry.** Builders follow `architecture.md` (orders in D, footprints, materials). Detail is chunky and readable at 30 m; hero detail is saved for landmarks and the player's close view. No outlines or toon shading; tone mapping is **AgX** with sky-driven exposure.
- **Rome in 113 was not all white marble.** Brick, stucco, timber and tile everywhere; white and colored marble for monuments; **gilded bronze flashing on the greatest roofs**. Statues and moldings are **painted** (subtle outdoors, rich indoors).
- **New against old:** Trajanic buildings gleam; Republican temples are stucco over tufa; insulae carry soot streaks, patched stucco, laundry, awnings and shutters. There are **building sites everywhere** (the Pantheon, scaffolds, treadwheel cranes).
- **People:** procedural humanoids. Men average 1.64 m and women 1.52 m. The skin palette is in `architecture.md` §6.1. Men have the Trajanic forward fringe and are clean-shaven; beards mark Greeks, philosophers and mourners. Clothing follows role; the toga is formal wear only.
- **Textures:** CC0 PBR sets (Poly Haven, ambientCG; `assets.md` §7), re-encoded at 1k and tinted to the palette below, plus procedural detail (opus reticulatum, tegulae and imbrices, brick shader).

| Palette | Colors (sRGB albedo) |
|---|---|
| Building | travertine `#E3DAC6` · Luna marble `#EEEDE8` · brick `#B4613E` · white stucco `#EFEADC` · roof tile `#B85C33` · basalt paving `#4B4C4E` · peperino `#7F8178` · gilt `#D6AE45` · bronze `#8C5E33` |
| Paint accents | cinnabar `#A3271F` · red ochre `#9A3A24` · yellow ochre `#CC9A35` · Egyptian blue `#2D5DA1` · green earth `#6F8656` · black `#1F1D1B` |
| Clothing | undyed `#E2DAC6` · grey `#8E8A80` · brown `#7A6248` · faded madder `#9C4A3A` · blue-green `#4F6E6A` · matron saffron `#E0A526` and sea-green `#5E9A8A` · senatorial purple `#5B1F3B` |
| Circus colors | Russata `#A8352A` · Albata `#EDE7D8` · Veneta `#3A5D8F` · Prasina `#3E7A44` |
| UI | papyrus `#E9DFC4` · wax-tablet dark `#2B2622` · ink `#1F1D1B` · cinnabar, gilt and Egyptian blue as accents |

| Light keyframe | Sun | Sky / ambient | Atmosphere |
|---|---|---|---|
| Dawn (start of play) | `#FF9E5A` → `#FFC27A`, rising in the ENE | blue-violet shade `#8F8EA0` | River mist, cool haze |
| Midday | `#FFF4E5`, 66° high in May | zenith `#5E8FCC`, horizon `#C9D4DC`, fill `#9DB3D6` | Urban haze: FogExp2 ≈ 4.1e-4 in game units (about 8 km visibility); heat shimmer |
| Golden hour (sun below 8°) | `#FFC27A` | Travertine glows `#F0C891`; gilt flares | Smoke columns from baths and bakeries |
| Night | — (moon `#C4D3FF`) | Dark streets; pools of light from tavern doors, shrine lamps, lanterns and torches (oil lamp `#FFA54F` 2–3 m; torch `#FF9329` 6–10 m) | Pooled smoke; at most 4–8 dynamic lights |

### 16.2 Audio direction

- **Engine:** Web Audio, with buses (music, ambience, sfx, voice, ui) → compressor, a voice pool of 24–32, `equalpower` panning (HRTF for at most 4–8 near sources). Procedural sound effects are pre-rendered at load with `OfflineAudioContext`. CC0 recordings come from `assets.md` §4.
- **Ambience by district** (crossfaded loops plus placed one-shots): the **Forum** (crowd murmur, criers, money-changers rattling coins, the water-clock in court); the **Velabrum and Forum Boarium** (cattle, oil jars, dockers, gulls, ropes, the river); the **Subura** (hammering, shouting, babies, bakeries before dawn: Martial 12.57 [A]); the **Palatine** (fountains, birds, a guard's hobnails); the **Colosseum valley** (wooden rudis clacks from the Ludus, the Meta Sudans' water); **baths** (Seneca *Ep.* 56: grunts, the masseur's slap, sausage-sellers' cries [A]); **night** (creaking carts, dogs, the vigiles' calls, a distant reveler).
- **Sound effects:** footsteps by surface and footwear (caligae ring on basalt), sword clash, shield thump, the sling's whirr, the net's swish, crowd roars driven by crowd favor, and fire.
- **Music (sparse, modal, acoustic):** the Karplus–Strong **lyre or kithara**, the double-reed **aulos**, frame drum, cymbals and sistrum, the **hydraulis** (water organ) in the arena [A], and **cornu and tuba** calls for the military. Melodies come from the surviving public-domain ancient tunes: the **Seikilos epitaph**, the **Delphic hymns** and **Mesomedes**' hymns (Hadrianic, slightly later; flagged). Exploration music plays rarely and fades out; combat brings in drums; there are stingers for discovery and level-up.
- **Voice:** no voice acting in v1.0. Barks are English subtitles with Latin interjections (*Salve!*, *Cave!*, *Mehercle!*). An optional synthesized crowd murmur ("walla") fills the background.

---

## 17. First playables: v0.0 "Prima Lux-alpha" and v0.1 "Prima Lux"

**Two milestones.** The owner's bar for "finished for now" is: see the world, fight, and switch between first and third person. **v0.0** is exactly that and nothing more. **v0.1** then grows it into the full golden path. Shipping v0.0 first puts a playable build in the owner's hands early and tests the controls on the owner's Mac before the bigger systems land.

### 17.0 v0.0 "Prima Lux-alpha": the owner's bar

**Goal:** the owner opens a URL on a Mac, walks from the Arch of Titus through the Forum and down to the Colosseum valley, fights in the street and in the Ludus Magnus, and switches between first and third person at any time.

| Area | **Must** | Out (v0.1 or later) |
|---|---|---|
| World | `dist-forum-romanum`, `dist-velia` and `dist-vallis-colossei` (B11's footprint) with the 8 H landmarks of §12.1 and the rest at M/B; terrain from the AD 113 DEM for that footprint; procedural fabric with the 2–4-storey rule; the skyline backdrop. Spawn on the Sacra Via by the Arch of Titus at dawn, as in B11. | Every other district; interiors except the Ludus arena |
| Time | The clock and the sun run; a simple night | Calendar, clamp, festivals, schedules |
| Character | One default character (`civis-suburanus` kit), sex choice, a preset name; `hispanus` and `veteranus` as optional origins | The creation screen beyond that; appearance options |
| Combat | Light chain, the overhead power attack, block (hold and toggle), parry and riposte, dodge, lock-on, stamina, poise and stagger with the §6.5 anti-loop rules, hit-stop, the §6.2 damage formula; the v0.0 clips of §6.15 (`rig-blade-shield`, `rig-spear`) in both views | Directional power attacks, bash, sprint attack, ranged, knockouts, crime |
| Enemies | Two `grassator`s in the street; a tiro and a thraex in *lusiones*; `boss-nereus` (lusio, §13.2) | Everything else |
| NPCs | ≥ 20 ambient walkers in the Forum (no schedules) | Crowds of 30–60; schedules |
| UI | Health and stamina bars, crosshair, interaction prompt, lock-on bracket, boss bar, crowd-favor meter; a pause menu with control preset, sensitivity, FOV and hold/toggle | Inventory, journal, map and skills screens |
| Saves | Quicksave and quickload (F5 or P / F9 or L) of the player's state (position, health, stamina, equipment) and quest state only, with storage wrapped in try/catch | Slots, autosave, world deltas, export |
| Quests | A short thread: arrival, the grassatores, the Ludus (tiro, thraex, Nereus) | Everything else |

**v0.0 acceptance:** AC-04, AC-05 (on its own path), AC-06 for the v0.0 verbs, AC-07 (tokens, guard, retreat, yield; no `miles` yet), AC-08 (with the default character), AC-19 (in its footprint), AC-20 and AC-24, plus: a scripted walk from the Arch of Titus to the Miliarium Aureum and to the Ludus arena never gets stuck (AC-02 subset); the 8 H landmarks stand at their atlas positions (AC-03 subset); quickload restores the player and quest state.

### 17.1 v0.1 "Prima Lux": scope

**Goal:** the owner opens a URL on a Mac, makes a character, walks into Rome at dawn on 11 May 113, explores the core of the city with crowds and landmarks, fights in the streets and in the Ludus Magnus against a boss, switches between first and third person, and saves the game. **Session length:** 30–40 minutes for the golden path, with free roaming beyond it.

| Area | **Must** | **Should** | Out of scope (later) |
|---|---|---|---|
| World | Districts of §12.1 first in v0.0 or v0.1, at their v0.1 fidelity; terrain from the AD 113 DEM; the Tiber; procedural city fabric (insulae, tabernae, compitum shrines, *lacus*) with the 2–4-storey rule near landmarks; diegetic edges; the skyline backdrop. **Exploration rewards:** 4–6 small enterable interiors (a popina, the arms dealer's shop, the Castor strongroom, one insula stairwell up to a rooftop, the Ludus barracks); street-level containers (§12.3); the micro-dungeon `dun-taberna-collapsa`; a "thing" at every tier-1 landmark (§12.3) | `dist-forum-holitorium` and the Tiber Island; the H fidelity marked Should in §12.1; the Colosseum arena floor as an interior; `dun-cloaca-maxima` (a 3-room form is enough) | The rest of the city; enterable domus interiors |
| Time | Day and night (§14.10), the *pridie* clamp holding 11 May (the 12 May anchor arrives in v0.2), the Lemuria night ambience and the Lemuria temple rule | Moonlight by phase | Festivals beyond the Lemuria |
| Character | Origin pick (**4 playable**: `civis-suburanus`, `hispanus`, `veteranus`, `dacus`; the other 6 shown locked), sex with period dress (§3.7), name, 3 appearance presets per sex | Full appearance sliders | Origin story threads; the 6 locked origins (v0.2) |
| Combat | The §6.1 verbs: light chain, the **overhead** power attack, block (hold and toggle), parry and riposte, bash, dodge, lock-on; stamina, poise and stagger with the anti-loop rules, hit-stop, the damage formula with attack types, knockouts and yields, *lusio* rules, arena crowd favor and missio; the v0.1 clip set of §6.15 (3 rigs); 3 difficulty levels | Directional power attacks, sprint attack, finisher; sling and javelin; bleeding; `facilis` and `herculea` | Bow; poisons; mounted |
| Enemies | `grassator`, `ebrius-rixator`, `collegium-bruiser`, tiro and thraex gladiators, `boss-nereus`; `miles-urbanus` and `vigil` as the law | `funditor`, `cloacarius`, `boss-rex-cloacae` in `dun-cloaca-maxima` | Beasts; the other bosses |
| NPCs | **≥ 30** on screen in the Forum by day, schedules for at least 6 archetypes (§14.7), navigation and crowd steering (§14.7b), barks with subtitles, night carts and vigiles | ≥ 60 on screen; rumors at the popina | Named NPC schedules for every vendor |
| Quests | `mq-01-madida-capena`, `mq-02-tabella` (a v0.1 stand-in that becomes the first stage of `mq-02-carcer` in v0.2: deliver the tablet to the Castor strongrooms; ends with "Tomorrow, the Column"), `lud-01-sacramentum`, `misc-meta-sudans-rixa` | `misc-lemuria-fabae`, `misc-insula-nutans`, `misc-venus-cloacina` | Every other quest |
| RPG | Skills by use for the **10 skills in the slice**: `blades`, `spear`, `shield`, `brawling`, `light-armor`, `heavy-armor`, `athletics`, `rhetoric`, `religio`, and `medicina` through bandages; level-up and perks for those skills (perks that need unshipped systems are hidden, §5.5); inventory with layered equipment visible on the avatar (§8.2); loot; 3 vendors (the arms dealer, who also repairs; the popina; the aedituus) with the §7.4 barter formulas; Pietas with compitum prayer and one temple blessing (Castor) | Haggling; crime with witnesses and a bounty (pay, flee or fight); `sordidus`; a medicus vendor | Lockpicking; pickpocketing; housing; followers; crafting |
| UI | HUD (§15.1), inventory, skills, journal, map, dialogue with a Rhetoric check, pause and settings | Fast travel to discovered landmarks; Lexicon entries for the discovered landmarks | The conspiracy board |
| Saves | Manual slots, quicksave, autosave, IndexedDB; player, inventory, time and quest state | World deltas (dead NPCs, looted containers); export/import | — |
| Audio | Footsteps, combat SFX, two ambience loops (Forum, night), crowd roar | Music (Seikilos on lyre) | District-specific ambience |

### 17.2 Golden path (about 35 minutes)

Game time runs at `timeScale = 20` from 04:30, so real minute 15 is about 09:30 and real minute 30 about 14:30; sunset (19:06) would come only at real minute ~44 and midnight at ~58. The path therefore **teaches the Wait menu** to reach dusk.

1. **0–5 min, The Dripping Gate** (04:30–06:10). Character creation, then the last night cart at the Porta Capena in the fourth watch. The courier is knifed beside you; a two-*grassator* fight teaches attack, block and the view toggle. Take the sealed tablet. Dawn breaks behind you.
2. **5–12 min, Into the city** (06:10–08:30). Walk up the Circus valley under the Palatine façade, past the Circus Maximus, through the Velabrum and the Vicus Tuscus to the Forum. Discovery banners; talk to NPCs; a compitum prayer (Pietas and the Lares favor); the popina. Optional: the knife-men's hideout, `dun-taberna-collapsa`, off the Vicus Tuscus.
3. **12–15 min, The tablet** (08:30–09:30). The Temple of Castor's cella is shut for the Lemuria (the aedituus explains), but the podium strongrooms are open. The contact asks you to come back at dusk after you "prove yourself useful" and points you to the Ludus Magnus, where the courier's killer trained.
4. **15–30 min, The Oath** (09:30–14:30). At the Ludus Magnus: sign on as a paid guest (swearing the oath is an explicit, costed choice), draw a *rudis* and a scutum or parmula from the armory, a training bout (parry, riposte, dodge, lock-on), a bout against a thraex, then **Nereus**: the net, crowd favor, a missio choice. A purse; the arms dealer on the Sacra Via sells and repairs. Level 2 and the first perk.
5. **30–35 min, Dusk.** The Ludus medicus patches you up and tells you to rest until evening: the game prompts the **Wait menu (T)** to sunset. The Meta Sudans brawl (knockouts and yielding) on the way back; the tablet is delivered at the strongrooms; the Forum empties; carts and vigiles appear, and after nightfall a Lemuria ghost-glimpse comes at the edge of vision. The journal reads "Tomorrow, the Column." Save.

### 17.3 Acceptance criteria (v0.1; the v0.0 subset is listed in §17.0)

| ID | Criterion | How it is verified |
|---|---|---|
| AC-01 | New game → character creation (4 playable origins, 6 shown locked) → spawn at the Porta Capena on 11 May at 04:30, within 20 s of pressing Start on the owner's Mac (Chrome and Safari) | Owner test; shot.mjs timing |
| AC-02 | On foot you can reach the Miliarium Aureum, the Capitolium, the Palatine terrace over the Circus, the Column court, the Ludus Magnus arena and the Forum Boarium without falling through geometry or getting stuck | Scripted waypoint walk in shot.mjs plus screenshots |
| AC-03 | Every landmark of the Must districts (§12.1, first in v0.0 or v0.1) exists at its atlas position (±5 game m) and facing, with the displayed Latin names of §2.3. **No anachronisms:** nothing at the sites of the Arch of Septimius Severus [30, −28] or the Arch of Constantine [521, 312]; the Colossus on the Velia; no Temple of Venus and Roma; Janus' doors open | Vitest over the world registry plus screenshots |
| AC-04 | V switches views in < 0.3 s anywhere, including in combat; in the Mouse preset zooming fully in switches to first person; H swaps shoulders; the camera never sits inside a wall; first person uses the full-body rig (§4.4) | shot.mjs (`press KeyV`) and screenshots |
| AC-05 | The whole golden path is playable with the keyboard-only preset, and with the trackpad preset on the owner's Mac (holding W while looking with the trackpad; F/Q combat) | Owner test |
| AC-06 | Combat matches §6: light chain, the overhead power attack (and the directional ones if the Should ships), block in hold and toggle modes, parry with riposte (0.20 s on Normal), bash, dodge with i-frames, lock-on cycling, stamina costs and regeneration, poise breaks with the anti-loop rules (no stagger lock; two attackers can't flinch-lock the player), hit-stop; attack hit frames match §6.15 | Vitest for the formulas, stamina, the toggle/parry timing rule (§4.2) and clip timings; scripted duel in the sandbox scene |
| AC-07 | Enemy AI: at most 2 attackers at once on Normal (tokens); others circle; NPCs guard pre-emptively and block, retreat when exhausted, call for help, yield and flee at their thresholds. In a scripted duel where the player spams light attacks from within reach, a `miles` blocks ≥ 40% of them and a `thug` ≤ 25% | Scripted 1-vs-4 fight and duels with logs |
| AC-08 | `boss-nereus` (a *lusio* with practice arms): three phases (75% / 45%), the net entangles and can be struggled out of while a shield still blocks, he yields at 15%, the crowd-favor meter works, and missio works both ways. A new character of each playable origin, with its origin gear plus the Ludus-issued *rudis* and scutum, can win on Normal without buying anything; the fight lasts 3–6 minutes | Owner and agent playtests |
| AC-09 | Non-lethal: the Meta Sudans brawl ends in a knockout or a yield with no deaths; the spare, rob and kill choices change Pietas and Fama as specified | Scripted test |
| AC-10 | Crowds: ≥ 30 NPCs visible in the Forum during hours 2–6 (≥ 60 if the Should ships); shops open at hour 1; the streets thin out at night (≤ 25 visible) and carts and lanterned vigiles appear | Screenshots at 3 times of day |
| AC-11 | A full day takes 72 real minutes; the sun's altitude and azimuth match `architecture.md` §7.1 within ±2°; nights are lit by the moon and pools of lamplight; T waits | Vitest (sun math) plus screenshots |
| AC-12 | The HUD shows the compass (cardinals, quest marker, discovered and nearby landmarks, enemy ticks), the three bars (fading when full), crosshair, prompt with live key labels, notifications and the Latin-plus-English discovery banner | Screenshots; DOM assertions in Playwright |
| AC-13 | Inventory: pick up, equip in layered slots (visible on the avatar), weight, use. Journal: stages, objectives, markers. Map: generated plan, discovered markers, player arrow (and fast travel if the Should ships) | DOM assertions; owner test |
| AC-14 | Skills rise by use with the §5 curves; the golden path reaches level 2; level-up offers +10 to a pool; a perk can be taken. **Every playable origin has ≥ 2 perks it can take at level 2 that work in v0.1**, and perks that need unshipped systems are hidden | Vitest; playthrough log |
| AC-15 | `mq-01`, `mq-02-tabella`, `lud-01` and `misc-meta-sudans-rixa` play from start to end with journal entries and rewards (scripts may use the prompted Wait) | One automated playthrough script per quest |
| AC-16 | Three vendors trade with the §7.4 formulas at §7.2 prices; stolen goods are refused; the arms dealer repairs; no buy-sell arbitrage exists | Vitest (barter, including the arbitrage property test) and a UI test |
| AC-17 | Saving: manual, quick (F5 or P / F9 or L, with a confirmation on quickload) and autosave on quest stages. Loading restores position, time, inventory and quest stages and survives a browser restart. (Should: dead NPCs and looted containers; export and import.) | Playwright test with a reload |
| AC-18 | Praying at a compitum shrine gives +5 Pietas and the Lares favor, on the Lemuria too. On the Lemuria day the Castor cella is shut (the aedituus refuses) while the strongrooms stay open; on a later elapsed day an offering at the Temple of Castor gives its blessing | Scripted test |
| AC-19 | Performance at default settings, Forum at peak crowd: median ≥ 55 fps and 1% low ≥ 40 in Chrome and Safari on the owner's Mac; draw calls ≤ 1,500 (target 800); triangles ≤ 3 M; first download ≤ 25 MB gzip; no console errors | shot.mjs stats (`--browser webkit` too) |
| AC-20 | A 30-minute session runs without a crash, and memory grows < 100 MB after warm-up; `npm run typecheck && npm test` is clean | Soak run; CI |
| AC-21 | Settings work: difficulty (3 levels), control preset (with the §4.3 Trackpad defaults), rebinding (attack, block, dodge, lock-on, view), sensitivity, FOV, hold/toggle options, "simple power"; Esc pauses and releases pointer lock | UI test; owner test |
| AC-22 | Navigation: a 1-vs-4 fight in the Forum crowd at peak leaves no NPC stuck for > 3 s; the player shoulders through the crowd; sweeps and lock-on never hit a bystander | Scripted fight with logs |
| AC-23 | Exploration: every tier-1 landmark of the v0.1 districts has its "thing" (§12.3); the 4–6 interiors and `dun-taberna-collapsa` are enterable and finishable; at least 40 street containers exist | Vitest over the registry; scripted walk |
| AC-24 | Mac input (`?scene=inputlab` on the owner's Mac): the pointer-lock click never attacks; momentum scrolling causes no zoom burst; pinch never zooms the page; P/L quicksave and quickload and N walk-toggle work | Owner test |

---

## 18. Roadmap: v0.0 → v1.0

| Version | Codename | Content | Systems | Exit gate |
|---|---|---|---|---|
| **v0.0** | *Prima Lux-alpha* | Forum, Velia, Colosseum valley and the Ludus (§12.1); a short thread; `boss-nereus` | §17.0: core combat, both views, quicksave | The §17.0 criteria pass; the owner sees the world, fights and toggles the view on a Mac |
| **v0.1** | *Prima Lux* (First Light) | Rome core (§12.1); 4 quests; `boss-nereus`; small interiors and `dun-taberna-collapsa` | §17.1 | All §17.3 criteria pass; the owner plays the golden path |
| v0.2 | *Columna* | **Act I complete** (mq-02 to mq-05: the Carcer, the Lemuria, the Column's stair); `dun-cloaca-maxima`, `dun-carcer`; Tiber Island; sicarii, dogs | Crime and bounty in full, stealth, lockpicking and seals, pickpocketing, full character creation with all 10 origins, sling and javelin, bleeding, directional power attacks and the other v0.1 Shoulds, Lexicon | **Engine gate review** (`tech.md` §1.4): stay in the browser unless 2+ criteria fail |
| v0.3 | *Vigiliae* | Subura, Argiletum, Caelian (Castra Peregrina); Vigiles and Urban Cohorts lines; `dun-cryptoporticus`, burned insulae; praetorians, fugitivarii | Fire system, rooftop traversal, the insula interior kit, housing tiers 1–2, the radiant board | Two faction lines playable start to end |
| v0.4 | *Harena* | Colosseum interior and hypogeum; the full Ludus line; the Circus factions and chariot racing; beasts and the venatio | Racing physics, cages, lifts and trapdoors, the learning boss | An arena career and a race win |
| v0.5 | *Urbs* | **The whole city** (E1): Campus Martius, Oppian (Baths of Trajan, `dun-domus-aurea`), Aventine and Emporium, Quirinal and Viminal (Castra Praetoria), Trastevere, the Vatican plain | A streamed worldspace (64 m chunks, HLOD), followers, crafting (Fabrica, Medicina), baths, fever | 60 fps holds across the whole city |
| v0.6 | *Coniuratio* | **Act II** (the board, 4 cells, mq-10 to mq-12); Lavernae, Clientela and Mithraic lines; court and dinner-party set pieces | Conspiracy board UI, court debates, disguises, the `ad-ludum` sentence | Act II playable in any cell order |
| v0.7 | *Profectio* | **Act III** (mq-13 to mq-15), the Via Appia suburbium, `dun-sepulcra-appia`, `dun-arenaria`, all endings | Faction allies in the finale; epilogues | The main quest completes on every route |
| v0.8 | *Plenitudo* (Abundance) | Density pass to §12.3 targets citywide; all 36 misc quests and more; uniques, books and collectibles | Radiant freshness rules; escalation chains | Content-density audit passes |
| v0.9 | Beta | — | Safari performance, save robustness and migrations, accessibility, tutorials, balance | Owner's full playthrough; zero blockers |
| **v1.0** | *Roma* | Rome complete | Decide on a desktop wrapper (Electron) per `tech.md` §1.3 | Release |
| v1.1 / v1.2 / v1.3 / v2.x | — | Ostia and Portus · Via Appia and the Alban Hills (horses) · Tibur · the provinces (the Parthian war) | Worldspaces, mounts, travel | — |

---

## Appendix A. Where the data lives (for engineers)

| Data | File (suggested) | Section |
|---|---|---|
| Tuning constants (combat, stamina, poise, difficulty, stealth, crime) | `src/rpg/data/tuning.ts` | §6, §14 |
| Skills / perks | `src/rpg/data/skills.ts` / `src/rpg/data/perks.ts` | §5 |
| Items, prices, loot tables | `src/rpg/data/items/*.ts`, `src/rpg/data/loot.ts` | §7, §8, §6.14 |
| Origins, traits | `src/rpg/data/origins.ts` | §3.2 |
| Enemy tiers, archetypes, bosses | `src/rpg/data/combatants.ts`, `src/npc/content/*.ts` | §6.11, §13 |
| Factions | `src/rpg/data/factions.ts` | §9 |
| Quests and dialogue | `src/quests/content/*.ts`, `src/dialogue/content/*.ts` | §9–§11 |
| Festivals, anchors, schedules | `src/core/calendar/*.ts`, `src/npc/schedules.ts` | §14.7, §14.10 |
| Blessings, patron deities | `src/rpg/data/religio.ts` | §14.6 |
| Districts, POIs, dungeons, danger bands | `src/data/atlas.ts`, `src/world/districts.ts` | §12, §13.3 |
| Animation clips and pose functions (per rig) | `src/actors/anims/*.ts` | §6.15 |
| Navigation (street graph, navmesh tiles, crowd) | `src/nav/*.ts` behind `NavService` | §14.7b |

## Appendix B. Open questions for the owner (with defaults chosen)

| # | Question | Default in this GDD |
|---|---|---|
| 1 | Difficulty and lethality: closer to Skyrim (forgiving) or Kingdom Come (lethal)? | Lethal on Normal (damage taken ×1.5); a gentle Tiro mode |
| 2 | Quest markers on, with an optional Morrowind-style directions mode? | Markers on |
| 3 | Is the slavery policy right (honest depiction; never forced to own slaves; freeing people possible)? | Yes |
| 4 | Gore: blood yes; dismemberment or decapitation finishers in the arena? | Blood on; dismemberment off |
| 5 | Romance and Roman marriage: wanted, and when? | Not before v1.0 |
| 6 | Latin first or English first for place names? | Latin with an English subtitle |
| 7 | Saves: free saving plus autosave, or restricted? | Free |
| 8 | The *pridie* clamp: the calendar waits on the eve of the next main-quest set piece. Faction lines never wait on it, and missed dated misc quests come back, but if you ignore the main quest the date (and the season) stays put. Or would you prefer a free-running calendar where main-quest events can be missed? | Clamp on |
| 9 | Which Rome mod did you mean: *The Forgotten City* or M7's *The City of Rome*? | It doesn't change the design |
| 10 | Trackpad test: can you hold W and look around with the trackpad without the cursor freezing? | Decides how much the game leans on arrow-key look and lock-on |
| 11 | Women did not serve in the army or hold equestrian rank. How should a female `veteranus` or `eques-lapsus` be framed: reframed (a veteran's widow; the daughter of an equestrian house), or allowed as an acknowledged fiction? | Reframed (§3.7) |
