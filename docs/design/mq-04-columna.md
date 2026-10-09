# mq-04 "One Hundred Feet" (*Centum Pedes*): build spec

The build spec for Act I, chapter 4: the dedication of Trajan's Column on 12 May 113. `docs/STORY.md` rules apply: every scene says who wants what, why, and what to do next; the next step is always on screen; history holds (real people are seen, not spoken to, except in overheard lines).

This file is the contract between the pieces. Each section names its **owner files**. Agents edit only their own files, plus the shared-file edits listed for them, and keep those edits minimal.

---

## 1. The chapter as played

*Forum of Trajan, 12 May AD 113, from first light.*

### 1.1 Why the player is there
At the end of `mq-03`, Gratus read Festus's decoded message: *IN DEDICATIONE ARCVS IN LOCO ALTO* ("at the dedication, a bow on the high place"). He decided the high place is the Column. He told the player to be in the Forum of Trajan at dawn.

### 1.2 Beats
1. **Dawn** (`dawn`).
   - **The date.** `mq-04` starts the moment `mq-03` completes (usually around 01:00 on the night of 11 May). The calendar steps from the eve (11 May) to the anchor (12 May) at the first midnight on or after the start. In practice that is at once, since the rite ends after midnight.
   - **Objective:** "Be in the Forum of Trajan at first light". Target: location `forum-trajan`.
   - **At night** (hour < 5.5 or ≥ 20), the quest hints "Press T to wait until first light (about 05:30)".
   - **Completion:** the objective completes when the player is inside `forum-trajan` or `column-trajan` and the hour is between 5.5 and 18.
   - **Day ambience** for the whole chapter, until `aftermath` ends:
     - more citizens in the Imperial Fora (a crowd boost);
     - Trajan's daily walk is held (`npc-traianus` held);
     - Gratus is staged in the Column court, not at the strongrooms.
2. **Gratus's briefing** (`post`). Gratus stands in the Column court by the altar.
   - **Objective:** "Speak to Gratus in the Column court". Target: `npc-gratus`.
   - **His briefing** (dialogue §4.1) covers:
     - the plan: men on the library roofs and in the gallery, praetorians thirty paces deep round Caesar;
     - the door: the Column's bronze door was **sealed with lead at first light**, after Apollodorus's men swept the stair;
     - the player's post: stand at the Column's door.
   - **Optional:** "Ask Apollodorus about the door". Apollodorus is staged in the court. He says that before dawn the scaffold gang was in the stair taking down the last hoist ropes. The gang was Dacian captives, "good with ropes", and his foreman sealed the door after they came out. Did they all come out? He assumes so.
3. **The ceremony** (`ceremony`).
   - **Objective:** "Take your post at the Column's door". Target: location `column-door`.
   - **Start:** the ceremony starts when the player stands within 3 m of the door between 06:00 and 18:00. If it is earlier, Gratus says Caesar comes "at the second hour" and the quest hints to wait (T) until 06:00.
   - **The sequence:** `src/content/dedication.ts`, §3.4.
     - Caesar's party comes out of the Basilica Ulpia onto its back steps.
     - Horns sound.
     - The herald calls *Favete linguis!* and reads the dedication from the pedestal.
     - Trajan pours a libation at the altar.
     - Overheard lines from the party.
   - **The seal** (optional objective "Look at the seal on the door"; examine point `mq04-seal` at the door): "The lead seal has been cut through and pressed back together to look whole. Someone has been inside since dawn." Examining it makes Gratus look over and start walking toward the player. 4 s later the arrow comes.
   - **If the player never looks:** at t ≈ 52 s (after the herald), Gratus walks over to check on them, and the arrow comes when he is halfway.
4. **The arrow** (end of `ceremony`).
   - **The shot:**
     - A figure stands up on the Column's viewing platform: Bitus, seen small and high, with a bow.
     - An arrow flies (a visible shaft) and strikes Gratus in the shoulder.
     - Gratus falls (pose `sleep`).
   - **Panic:**
     - A woman screams.
     - The praetorians close round Caesar and hurry the party back into the basilica.
     - The crowd scatters (`population.alarm`).
     - Crito, Caesar's physician, runs to Gratus and kneels by him.
   - **Gratus** (subtitle, then a short auto-opened dialogue §4.2): "On top. He's on the top. The door, the seal... Go! Alive if you can. I want the hand that paid him."
   - The Column door now opens (flag `columna-open`).
5. **The stair** (`climb`).
   - **Objective:** "Climb the Column: stop the archer". Target: `column-door`, then markers inside.
   - **Entering:** using the door ("Enter the stair") fades to the interior cell `dun-columna` (§3.2): a vestibule, the empty chamber, then the spiral stair of **185 steps** lit by narrow slit windows.
   - **The two Dacian knife-men** were left to hold the stair:
     - one on **landing 1** (after step 62);
     - one on **landing 2** (after step 124).
     - They wait on their landings and fight when the player reaches them. Optional objective: "Deal with the men on the stair".
   - **The empty chamber** (examine, optional flavour): "A square room cut into the pedestal, with a marble shelf and nothing on it. The workmen call it the tomb. Nobody says whose."
   - **At the top,** a small door in the drum opens onto the viewing platform ("Out onto the platform").
6. **The archer** (`archer`). The platform (§3.3) is a square of marble 5.2 m across round the drum that carries Caesar's gilded statue, a hundred feet over the Forum.
   - **The fight:**
     - Bitus starts on the far side of the drum.
     - He shoots up to **6 arrows** (a shield blocks them).
     - Then he fights with a sica.
     - He yields at 25% health.
   - **Objective:** "Stop the archer" (target: `npc-bitus`).
   - **When he yields,** the player chooses from the standard yield panel:
     - **Spare** (or Rob, or Arrest): flag `bitus-fate = 'spared'`. Bitus's dialogue opens (§4.3), then Pudens's men come up the stair and take him down (fade).
     - **Kill:** flag `bitus-fate = 'killed'`. His body holds the bone token and three Parthian drachms. Optional objective: "Search the archer".
   - Either way the player gets `quest-tessera-mucaporis`, the bone token with a falx scratched on it and the name MVCAPOR.
7. **Aftermath** (`aftermath`).
   - **Objective:** "Go down to Gratus". Then: "Speak to Pudens" (target `npc-pudens`, staged in the court beside Gratus and Crito).
   - **Pudens** (dialogue §4.4):
     - introduces himself;
     - reacts to Bitus's fate;
     - says Gratus will live;
     - delivers the official story, an omen: "There was no arrow...";
     - summons the player to the Castra Peregrina tomorrow.
   - **Completion:** the node `summonsEnd` completes the quest.
   - **Rewards:** 80 denarii, skill XP in the weapon the player used (`skillXp: ['blades']` is fine) and athletics, and the item `anulus-peregrinorum`.
8. **Done** (`done`).
   - **Banner:** "Act I continues" / "The Board" / "Pudens's offer, 13 May, comes in a future update." (7 s).
   - **Calendar:** with `mq-04-columna` done, the calendar runs on (13 May at the next midnight).
   - **Rumour:** folk `news` gains a rumour about the "omen at the Column" (§4.6).

### 1.3 Spec conflict resolved
The GDD says the archer wounds "Pudens's deputy". That is Gratus (CONTENT §2: Gratus is "deputy of the princeps peregrinorum"; "wounded there, survives"). Gratus stays `essential`.

### 1.4 What Bitus knows (keep every line consistent with this)
- **Who he is:** Bitus, son of Dida, from the hills above Sarmizegetusa. He was a boy in 106 when the city fell. He was brought to Rome as a captive and worked on the Forum of Trajan's building gangs. He hid in the stair when the hoist gang came out before dawn.
- **Who paid:** **Mucapor**, a falx-fighter at the Ludus Dacicus, gave him the bow. The silver came from "a man with Syrian rings who smelled of pepper", the Pepper Warehouses (Horrea Piperataria) thread from Festus's message.
- **His target was Gratus, not Caesar:** "the centurion in the grey cloak, the one asking about the pepper house. Caesar is for later." This line sets up the cabal's real plan for the profectio. Do not resolve it.
- **His motive:** the Column's frieze shows his people burning their own houses, drinking poison, and Decebalus's head carried to Trajan. "Your stone says we lost. I wanted it to say one more thing."

---

## 2. Calendar, places, flags and ids

### 2.1 Ids (use exactly these)
- **Quest:** `mq-04-columna`, title "One Hundred Feet", latin *Centum Pedes*, category `main`.
- **Stages,** in order: `dawn` → `post` → `ceremony` → `climb` → `archer` → `aftermath` (Bitus spared) or `aftermath-killed` (Bitus killed; same objectives and handlers, different journal) → `done`.
- **Flags:**
  - `columna-open` (the door opens);
  - `bitus-fate` (`'spared' | 'killed'`);
  - `mq04-seal-seen`;
  - `mq04-apollodorus-door`.
- **NPCs:**
  - new: `npc-pudens`, `npc-bitus`, `npc-crito`;
  - existing: `npc-gratus`, `npc-apollodorus`, `npc-traianus`.
- **Combat ids:** `npc-bitus` (on the platform); `mq04-dacian-a` and `mq04-dacian-b` (the knife-men).
- **Interiors:**
  - `dun-columna`: the stair, a cell under the court;
  - `columna-summa`: the 1:1 platform, at the top of the real Column.
- **Interior spots:**
  - `dun-columna`: `entry`, `chamber`, `landing-1`, `landing-2`, `top`;
  - `columna-summa`: `hatch`, `bitus`, `view`.
- **Marker ids** (kind `location`): `interior:dun-columna:landing-1`, etc. They are resolved by the interiors module (§3.1).
- **Examine ids:**
  - `mq04-seal` (at `column-door`);
  - `mq04-chamber` (interior spot `chamber`);
  - `mq04-body` is not used: the kill path uses the combat body container.
- **Items:**
  - `quest-tessera-mucaporis`: "Bone Token", latin *tessera ossea*. "A bone gaming token, scratched with a curved Dacian blade and the letters MVCAPOR." `tags: ['clue']`.
  - `quest-sagitta-dacica`: "Dacian Arrow", latin *sagitta*. "Crito pulled it out of Gratus's shoulder: barbed, the shaft painted with red bands. He gave it to you without a word." It is given in aftermath.
  - `anulus-peregrinorum`: "Courier's Ring", a misc reward item, latin *anulus*. "A plain iron ring with a horseman and a spear cut into the bezel: the couriers' mark. Pudens gave it to me." Value 0, weight 0, `tags: ['token']`.
- **Loot table** `body.npc-bitus`: rolls 0, denarii 2, always `quest-tessera-mucaporis`, `quest-drachma-parthica` × 3, `sica`, `arcus`.

### 2.2 Calendar
- On the `mq-04-columna` start (`onEnter` of `dawn`): if `game.calendar` exists and `game.time.hour < 12`, call `game.calendar.stepToAnchor()`. Otherwise do it on the next `time:hour` whose `hour === 0`.
- `stepToAnchor` only works from the eve (11 May, ordinal 130), and is a no-op otherwise.
- After `mq-04-columna` completes, the existing calendar logic moves on by itself.

### 2.3 Gratus, Apollodorus and Trajan on 12 May
- `NpcManager.stage(id, x, z, heading, loop?)` / `unstage(id)` (§3.5) puts a named NPC at a point regardless of schedule, held there in an idle loop.
  - **Gratus:** staged at the court's altar side (col-local about (2.2, -2.2), heading toward the door) during `dawn`, `post` and `ceremony`. In `aftermath` he lies wounded near the door.
  - **Apollodorus:** staged in the court during `dawn` and `post` (col-local about (-2.6, -4.6), loop `talk`). During the ceremony he is part of the party.
- `population.holdNamed('npc-traianus')` from `dawn` until `done`, so his daily walk does not run. The ceremony uses tableau figures for him and his party (§3.4).

---

## 3. Systems and content (by owner)

### 3.1 Interiors: `src/world/interiors/` (new), plus `UIManager.fade` (owner: interiors agent)
A small cell system for spaces "bigger on the inside" (GDD §12.4). Nothing like it exists yet.

```ts
// src/world/interiors/types.ts
export interface Vec3 { x: number; y: number; z: number }
export interface InteriorDoor {
  id: string;                      // unique, e.g. 'dun-columna:out'
  label: string;                   // "The bronze door"
  verb: string;                    // "Go out", "Enter the stair"
  /** Where the prompt sits: local to `from` (or world when from === null). */
  at: Vec3;
  from: string | null;             // interior id the door is in; null = the outside world
  reach?: number;                  // default 1.8
  /** Destination: interior id (local position) or null (world position). */
  to: { interior: string | null; position: Vec3; heading: number };
  /** null = usable; a string = refused, shown as a notice. */
  locked?: (game: Game) => string | null;
}
export interface InteriorBuild { object: THREE.Object3D; colliders: ColliderSpec[]; spots: Spot[] /* local */ }
export interface InteriorDef {
  id: string; name: string; latin?: string;
  /** World placement of the local origin (null until the world can say: e.g. the landmark is not placed yet). */
  origin(game: Game): { x: number; y: number; z: number; rotY: number } | null;
  build(ctx: { game: Game; builder(): MeshBuilder }): InteriorBuild;
  /** Local axis-aligned box: "the player is inside" (3D). */
  bounds: { min: Vec3; max: Vec3 };
  doors?: InteriorDoor[];
  /** Ordered local waypoints from the entrance to the far end (bots, tests, NPC helpers). */
  route?: Vec3[];
  /** Hidden unless the player is inside (default true: cells live under or over the world). */
  hiddenOutside?: boolean;
  /** sky.indoor while inside (default 1; 0 for open-air cells such as the platform). */
  indoor?: number;
  onEnter?(game: Game): void;
  onExit?(game: Game): void;
}
```

`InteriorSystem` (a `System`, installed as `game.interiors` by `installInteriors(game)`):
- **Registry and building:**
  - `register(def)` and `get(id)`.
  - `ensure(id): boolean` builds once, places the object at `origin` (rotation `rotY`), adds it to the scene, and registers colliders with `registerColliders` or the Physics API, owned by the interior.
  - `dispose(id)`.
- **Player state:** `current(): string | null` (3D bounds test, re-checked every 0.2 s) and `isInside(id)`.
- **Coordinates:**
  - `toWorld(id, local: Vec3): THREE.Vector3 | null`;
  - `spot(id, spotId): { position: THREE.Vector3; heading: number } | null` (world);
  - `routeWorld(id): THREE.Vector3[]`;
  - `resolve(markerId): THREE.Vector3 | null` for `interior:<id>:<spot>`.
- **Moving the player:**
  - `enter(id, local: Vec3, heading): Promise<void>`: fade out (0.35 s), `ensure`, `player.teleport(world, heading)`, then fade in.
  - `leave(world: Vec3, heading): Promise<void>`: the same, back to the world.
- **Doors:**
  - each door is an interaction (`game.interactions.add`) at its world position, re-positioned when the cell is built;
  - outside-world doors (`from: null`) are added at install;
  - `locked` is checked on use.
- **Events:** emits `interior:entered` / `interior:exited` (`{ id }`, typed via `declare module`) when `current()` changes, and calls the def's `onEnter`/`onExit`.
- **Inside a cell:**
  - sets `game.sky.indoor` to the def's `indoor` while inside, and 0 outside;
  - for `hiddenOutside` cells, `object.visible = isInside(id)`;
  - discovers the location with the interior's id if `game.locations` has it.
- **Save and load:** on `save:loaded` and every check, if the player's position falls inside a cell's bounds (`origin` resolved), `ensure` that cell.
- **Marker resolver:** in `src/game/wiring.ts`, the `location` resolver first tries `game.interiors?.resolve(id)` (a one-line shared edit).
- **Install:** call `installInteriors(game)` where the other world services are installed for the Rome scene (find where `installContent` is called, and install just before it). Also register the two Column defs there (`registerColumnInteriors(game)`, §3.2/§3.3), or let `installInteriors` import them. One place only.
- **`UIManager.fade(outS = 0.35, holdS = 0.1, inS = 0.45): Promise<void>`:** a black veil in `overlayLayer`, like `GameFlow.veil()`. It resolves when fully faded out (so the caller teleports in the dark), then fades back in by itself. With no DOM (tests) it resolves at once. Owner: the interiors agent, as a small shared edit in `src/ui/UIManager.ts`.

**Tests:** `tests/interiors.test.ts`, with a fake game and a tiny def:
- `ensure` adds colliders once;
- `isInside` is 3D (same x/z, different y → outside);
- `enter` teleports and emits events;
- a door refuses while locked;
- `resolve('interior:x:spot')`;
- `hiddenOutside` visibility.

### 3.2 The stair cell `dun-columna`: `src/world/interiors/columna.ts` (owner: column-cell agent)
- **Frame:**
  - **Origin:** the Column's axis (the pedestal centre: col-local (-1.035, 0, 0.004), see `trajan-column.ts`; take it from the placed landmark's matrix), with `y = groundY − 120`.
  - **rotY:** the column landmark's (so the door is on local −z, as outside).
- **Layout** (local metres, 1:1):
  - **Vestibule:** a corridor 1.2 m wide and 2.5 m high, from the inner door at z = −3.6 to the stair well at z ≈ −1.6. The floor is at y = 0, with a vaulted or flat travertine ceiling.
    - Door interaction "Go out" → world: the `column-door` spot (heading facing away from the door), from a world point.
  - **Chamber:** opens off the vestibule to the −x side: 2.4 × 2.4 × 2.6 m, an empty marble shelf, a lamp niche. Spot `chamber`, with the examine `mq04-chamber`.
  - **Well:** cylindrical, inner radius 1.35 m, wall 0.45 m (boxes ring collider, 24 segments per ring, rings every 2.66 m) from y = 0 to the top.
  - **Stair:** `spiralStairs` (§3.6), with:
    - `count 185`, `rise 0.19`, `stepsPerTurn 18`, `innerR 0.32`, `outerR 1.35`;
    - climbing counter-clockwise from the vestibule mouth;
    - landings after step 62 and after step 124, each a quarter turn (flat).
    - Spots `landing-1` and `landing-2` are at the landing centres on the walking line.
    - Total rise is 35.15 m.
  - **Windows:** 43 slit windows (0.12 m × 0.85 m, sill 1.1 m above the tread at the window's angle), spaced evenly along the helix. Each is an opening in the wall with a warm daylight emissive plane just outside, so it reads as light coming in. The windows have no colliders.
  - **Top:** a small landing at y = 35.15 under a low dome. Spot `top`. Door interaction "Out onto the platform" → interior `columna-summa`, spot `hatch`.
  - **Lamps:** 4 'interior' lamps (vestibule, landing 1, landing 2, top) through the landmark lamp helper (`trajan-lights.ts` `Lamps`), or the LightPool directly. The slit windows carry the rest. Keep within the budget: ≤ 4 lights, ≤ 25 draw calls for the whole cell (merge per material).
- **Route:** `entry` → points every 7 steps along the walking line → `top`.
- **Bounds:** x/z ±2.0 (vestibule to −3.8 z, chamber to −3.8 x), y −0.5 to 39.
- **The outside door** (`from: null`) is at the `column-door` spot: verb "Enter the stair".
  - `locked`: refused unless `game.quests?.flags?.get('columna-open')`, with the text "The bronze door is shut and sealed with lead."
  - Destination: `dun-columna`, local (0, 0, −3.2), heading facing +z.
- `hiddenOutside: true`, `indoor: 1`.

**Tests:** `tests/columna.test.ts`. Build the def in a real physics world (`tests/arch.walker.ts`). Walk the `route` with the player capsule (4.4 m/s) and with an NPC capsule (`{ radius: 0.3, layer: Layer.Npc }`, 1.3 m/s) from `entry` to `top`, then back down. Assert:
- the top is reached within 0.2 m of the height;
- headroom of ≥ 2.0 m above every tread on the walking line;
- the landings are flat.

### 3.3 The platform `columna-summa`, and the Column's top split (owner: column-cell agent)
- **`trajan-column.ts`** (shared edit):
  - Build the **rail, the statue drum and the gilded statue** of the near column into a separate object named `column-trajan:top`, added to the landmark group. The capital stays in the column.
  - The far LOD and `far` stand-in keep their tops as they are.
  - The visual result must be unchanged.
  - Export a helper `columnTopLocalY()` (21.77 game m, the abacus top above the pedestal base) and `COLUMN_AXIS` (the col-local axis point), so the cells can place themselves.
- **`columna-summa`** (`src/world/interiors/columna.ts`):
  - **Origin:** the column axis at the abacus top (world), with the column's rotY. `hiddenOutside: true`, `indoor: 0`.
  - **Slab:** a 5.2 × 5.2 m marble slab, 0.3 m thick, its top at local y = 0.
  - **Railing:** bronze, 1.05 m high, posts every 0.9 m, with box colliders 1.15 m high all round.
  - **Drum:** radius 0.95, height 1.45, marble, with a cylinder collider. A small bronze door on its local −z face: interaction "Down the stair" → `dun-columna` `top`.
  - **Statue:** the gilded statue 1:1 on the drum (`armoredEmperor`, scale `4 / 1.85`, `spear: true`).
  - **Spots:** `hatch` (in front of the drum door), `bitus` (the opposite side, local +z), `view`.
  - **Bounds:** ±2.8 x/z, y −0.5 to 6.
  - `onEnter` hides `column-trajan:top` (the exterior rail and statue would stand in the walkway); `onExit` shows it again.
- **Tests** (in `tests/columna.test.ts`): walk round the drum on the platform; the rail stops a walker; `hatch` and `bitus` are on the slab.

### 3.4 The dedication: `src/content/dedication.ts` and `src/content/tableau.ts` (owner: ceremony agent)
- **`tableau.ts`:** static, non-interactive figures for staged scenes. Read `src/world/landmarks/builders/trajan-extras.ts` for how it builds posed Actors.

```ts
export interface FigureDef { id: string; role?: AvatarRole; appearance?: Appearance; x: number; y?: number; z: number; heading: number; loop?: IdleLoop; weapon?: WeaponModel }
export class Tableau {
  constructor(game: Game);
  add(def: FigureDef): Actor | null;     // y defaults to the ground (heightmap / physics ray)
  walk(id: string, to: { x: number; z: number }, speed?: number, then?: IdleLoop): void;  // kinematic, in fixed steps
  face(id: string, heading: number): void;
  loop(id: string, loop: IdleLoop): void;
  remove(id: string): void;
  clear(): void;
  get(id: string): Actor | undefined;
}
```

- **`src/content/sequence.ts`:** a small timeline runner advanced by game time, so it pauses with the game.
  - `new Sequence(game).at(t, fn).at(...).start()`, plus `stop()` and `elapsed`.
  - Each step runs once.
  - `stop()` cancels everything.
  - It must not use `setTimeout`.
- **`dedication.ts`:**

```ts
export type DedicationPhase = 'idle' | 'rite' | 'shot' | 'panic' | 'over';
export interface Dedication {
  readonly phase: DedicationPhase;
  start(): void;                 // the party comes out, the herald, the libation
  sealSeen(): void;              // Gratus starts toward the door; the shot follows 4 s later
  stop(): void;                  // clear figures, restore extras, crowd boost and holds
}
export function createDedication(game: Game, hooks: { onShot(): void }): Dedication;
```

- **On `start`:**
  - `game.trajanExtras.enabled = false` (restored by `stop()`);
  - chain a crowd boost (×1.6 within 120 m of the Forum of Trajan centre, the `MunusDirector` pattern);
  - add tableau figures, positioned from the column landmark's spots and frame (see `trajan-column.ts` `COURT`; the basilica back steps are at court z ≈ 72.9–74.5):
    - **On the basilica back steps, facing the Column:**
      - Trajan (`npc-traianus`'s appearance);
      - Plotina, Matidia and Similis (appearances from `docs/CONTENT.md` §2.B);
      - Phaedimus with a cup;
      - Crito;
      - Celsus;
      - Apollodorus;
      - 6 praetorians in togas (role `praetorian`, no armour: the *cohors togata*).
    - **At the altar:** a priest (role `priest`) and a herald (a citizen in a toga) by the pedestal's inscription.
    - **Watching:** 10–14 citizens on the NW upper gallery (`column-vista-gallery`, y 4.72) and the library porches.
  - Do **not** spawn ambient NPCs in the court: `addNoGo` over the court rectangle while active.
- **Timeline** (seconds; subtitles via `say`, 4.5–6 s each; the subtitle slot holds one line, so space them):
  - 0: party walks out of the basilica door (3 m) to the steps. "(The cornicines sound. The crowd falls quiet.)"
  - 5: Herald: "Favete linguis!", then "(Keep holy silence!)"
  - 10: Herald: "SENATVS POPVLVSQVE ROMANVS IMP·CAESARI·DIVI·NERVAE·F·NERVAE TRAIANO AVG·GERM·DACICO PONTIF·MAXIMO TRIB·POT·XVII IMP·VI COS·VI P·P"
  - 17: Herald: "AD DECLARANDVM QVANTAE ALTITVDINIS MONS ET LOCVS TANTIS OPERIBVS SIT EGESTVS"
  - 23: (gloss) "The Senate and People of Rome, to Caesar Trajan… to show how high a hill was cut away for works so great."
  - 29: "(Trajan steps down to the altar and pours wine on the fire.)" Trajan walks 2 m to the altar.
  - 34: Plotina: "Let the dedication be short, Marcus. The gods are patient; the crowd is not."
  - 40: Similis: "Everyone within thirty paces is mine today. Everyone."
  - 46: Phaedimus: "Watered, Caesar, as you asked. Lightly."
  - 52: if `sealSeen` has not run, Gratus walks toward the door. The shot is at +4 s.
- **The shot** (`sealSeen()` → 4 s; or the 52 s path → 4 s):
  - Bitus appears on the exterior platform: a tableau figure (role `dacian`, `weapon: 'bow'`) at the exterior abacus top, by the rail on the court side. Use the world-y of `columnTopLocalY()`.
  - 0.6 s later, an arrow flies from him to Gratus: `game.combat.shootVisual(from, to, seconds)` if it exists (§3.7), otherwise a local thin-shaft mesh tweened on a slight arc.
  - On arrival, Gratus falls (`holdPose(game, 'npc-gratus', 'sleep')`).
  - `say('A woman', '(A scream.)')`.
  - `population.alarm(court, 30, 'danger')`.
  - Phase `shot`, then `hooks.onShot()`.
- **Panic** (+1 s):
  - the party and praetorians walk back into the basilica door and are removed;
  - Crito walks to Gratus and kneels (`pray`);
  - the herald and priest leave;
  - the exterior Bitus figure is removed when the player enters `dun-columna`, or after 60 s.
- **Phase `over`** after 12 s; figures stay until `stop()`.

### 3.5 NPCs: `src/npc/content/columna.ts` (new) and `NpcManager.stage` (owner: NPC agent)
- **`npc-pudens`:** from `docs/CONTENT.md` §2.A.
  - essential, faction `frumentarii`, home `castra-peregrina`;
  - schedule as in CONTENT, but no named spawn on 12 May until staged;
  - dialogue `npc-pudens`.
- **`npc-bitus`:** Dacian, about 22, slight and wiry, 1.72 m, skin `#c99a72`, long hair `#2a1d14`, beard short.
  - Garments: a long-sleeved tunic `#8e8a80`, Dacian trousers if the garment kinds allow (otherwise a tunic), a cloak `#7a6248`.
  - Footwear: soleae. Weapon: bow.
  - No home and no schedule: he exists only where the quest spawns him.
  - Dialogue `npc-bitus`. Combat profile `BITUS_PROFILE` in `src/content/profiles.ts` (§3.7).
- **`npc-crito`:** T. Statilius Crito, Trajan's physician, from CONTENT (look and overheard line). No home; staged only. Dialogue `npc-crito`.
- **Gratus:** keep `essential: true`. Update the comment.
- **`NpcManager.stage(id, x, z, heading, loop?: IdleLoop | null): boolean`** and **`unstage(id)`:**
  - holds the named NPC out of its schedule;
  - spawns it at (x, z) (or moves it there if spawned), posed in `loop` (default `stand`);
  - it stays talkable;
  - `unstage` releases it to its schedule;
  - staged NPCs survive `updateNamed` and despawn/respawn when the player comes near again (re-stage on respawn).
- **Content helpers:** add `stage(game, npcId, at: string | Vec3, heading, loop?)` and `unstage(game, npcId)` to `src/content/director.ts`. Points are used as given (no `streetPoint`).
- **Tests:** `tests/npc-stage.test.ts`.

### 3.6 Spiral stairs: `src/arch/common/spiral.ts` (owner: spiral agent)

```ts
export interface SpiralSpec {
  count: number; rise: number; stepsPerTurn: number;
  innerR: number;            // newel radius
  outerR: number;            // inner face of the well wall
  startAngle?: number;       // angle of step 0's centre; angle a ↦ local direction (sin a, 0, cos a)
  clockwise?: boolean;       // false (default): angle increases as you climb
  landings?: { after: number; turns: number }[];   // a flat landing after step `after` (0-based), `turns` of a turn long
  material?: MaterialId; newelMaterial?: MaterialId;
  collide?: boolean;         // default true
  newel?: boolean;           // default true: newel cylinder from 0 to the top + 2.4 m (visual + collider)
}
export interface SpiralResult {
  height: number;
  steps: { angle: number; y: number }[];             // centre angle and tread top of each step
  landings: { angle0: number; angle1: number; y: number }[];
  walkR: number;                                     // (innerR + outerR) / 2
  pointAt(t: number, r?: number): THREE.Vector3;     // local point on tread `t` (fractional step index ok), at radius r (default walkR), y = tread top
  endAngle: number;
}
export function spiralStairs(b: MeshBuilder, spec: SpiralSpec, at?: THREE.Matrix4): SpiralResult;
```

- **Treads:** step `i` is a box plate from `y_i − rise` to `y_i` (`y_i = (i + 1) · rise` before landings).
  - Its width runs from innerR − 0.02 to outerR + 0.02.
  - Its depth is the arc at outerR for one step plus 4%.
  - It is rotated tangentially round the axis and centred on the step's angle.
  - One box collider per plate.
- **Landings** are flat sector plates (several boxes) at the landing height, covering `turns · 2π`, with the next step continuing from the landing's end angle.
- **Headroom** is `stepsPerTurn · rise − rise` (3.23 m for the Column), and `((1 − turns) · stepsPerTurn − 1) · rise` under a landing, which must stay ≥ 2.3 m (2.38 m for the Column). That is why it has 18 steps a turn.
- **Tests:** `tests/arch.spiral.test.ts` with the real Actor (`walk()` from `tests/arch.walker.ts`, legs `to` successive `pointAt`):
  - the player capsule climbs and descends;
  - an NPC capsule (`{ radius: 0.3, layer: Layer.Npc }`) climbs and descends at 0.8, 1.1 and 1.4 m/s;
  - a landing is flat;
  - headroom ≥ 2.0 m on the walking line (raycast up);
  - `pointAt` heights match the steps.
- Also add the spiral to `tests/arch.generators.test.ts`'s generator list if that file lists generators.

### 3.7 Combat: height, arrows, the archer (owner: combat agent; Opus)
1. **Height.** Combat is 2D today. Add vertical awareness:
   - a target more than **1.6 m** above or below is out of melee reach (`sweepTargets`, `applyHit`, the player's aim assist `assistTarget`, lock-on candidates);
   - it is not acquired by `acquire` unless within 2.5 m vertically;
   - perception reports it not visible for melee purposes beyond 2.5 m vertically.

   This keeps fighters on different turns of a spiral, or on the surface above a cell, from hitting or chasing each other. Add tests in the combat suite.
2. **Arrows.** Extend `Projectile` with `kind: 'net' | 'arrow'`, a 3D position and velocity (`y`, `vy`, gravity −9.8 for arrows), and `damage`.
   - **Hits:** capsule test (radius 0.35, 0 to 1.8 m above the feet).
   - **Block:** a block facing the arrow (±70°) stops it (shield or weapon; stamina cost as for a light blow).
   - **Dodge:** i-frames avoid it.
   - **Damage:** through the normal damage formula (attack type `thrust`, weapon `arcus` stats), so armour, difficulty, KO and yield rules all apply.
   - **Feedback:** the hit indicator and feedback for the player.
   - **Visual:** a shaft and fletching mesh oriented along the velocity, via `projectileVisual`.
   - **Misses:** an arrow that misses keeps flying until a world raycast hits something or 2 s pass. It may stick for 4 s, then is removed.
3. **Archer behaviour** (opt-in): `CombatProfile.shoot?: { ammo: number; interval: [number, number]; range: [number, number]; drawS: number }`.
   - **While shooting:** if ammo > 0, the target is in range (default [3, 22] m), and in sight, the NPC plants (no approach), turns to face, draws for `drawS` (a readable telegraph pose; reuse a wind-up), releases an arrow aimed at the target's chest (lead the target slightly), and waits a random `interval`.
   - **Otherwise:** closer than the range minimum, or out of ammo, it fights in melee with its `weapon` (the sica). The bow model shows while shooting and the melee weapon in melee, if the avatar supports a weapon swap. Otherwise keep the melee weapon.
   - `Combatant` exposes `ammo`.
4. **Scripted shots** for staged scenes:
   - `CombatSystem.shootVisual(from: Vec3, to: Vec3, seconds: number, onArrive?: () => void): void`: an arrow mesh on a slight arc, no damage.
   - `CombatSystem.shoot(fromId, targetId)`: a real arrow from a combatant.
5. **The yield prompt:** confirm that a yield caused by the player's blow opens the decision panel on the platform. Bitus is spawned with `game.combat.spawnEnemy(...)` at a world position, not `director.spawnEnemy`, which snaps to the street. Note this in a comment in `director.ts`: `spawnEnemy` accepts `{ x, y, z }`, but `streetPoint` moves it, so content placing foes in interiors or at height must call `game.combat.spawnEnemy` with `opts.npc`. Add a director helper `spawnEnemyAt(game, archetype, worldPos, opts)` that does exactly that.
6. **`BITUS_PROFILE`** in `src/content/profiles.ts`, from CONTENT §5.2:
   - health 45, stamina 70, armour 6 cloth, skill 40;
   - weapon `sica`, `ranged: 'arcus'`, `shoot: { ammo: 6, interval: [1.6, 2.4], range: [3, 18], drawS: 0.9 }`;
   - reactionS 0.4, blockSkill 0.1, aggression 0.5, yieldAt 0.25;
   - loot `body.npc-bitus`.
   - Also `DACIAN_KNIFE_PROFILE` (a thug with a sica, health 40, yieldAt 0, named "Dacian knife-man").
- **Tests:**
  - `tests/combat-height.test.ts`: no melee hit at Δy 2.5; no acquire across floors.
  - `tests/combat-arrows.test.ts`: an arrow damages an unblocking player; a block stops it; a dodge avoids it; the archer plants and shoots in range and switches to melee at 2 m; ammo runs out after 6.
  - Run the whole combat suite: no regressions.

### 3.8 The quest: `src/quests/content/mq-04-columna.ts` (owner: quest agent)
- **Stages and objectives** as in §1.2 and §2.1. The journal is first person, past tense (written in §5).
- **Trigger:** `triggers['quest:completed']`: `mq-03-lemuria` → `q.start()`.
- **Also:** remove the placeholder banner from `mq-03-lemuria`'s `done` stage. mq-03 ends with its journal only; mq-04's `dawn` journal and banner take over.
- **Staging, by stage `onEnter`** (re-entrant; re-applied on `save:loaded`):
  - **`dawn`:**
    - the calendar step (§2.2);
    - `holdNamed('npc-traianus')`;
    - `stage` Gratus and Apollodorus.
  - **`post`:** Gratus's dialogue node `postEnd` → stage `ceremony`.
  - **`ceremony`:**
    - `placeExamine` `mq04-seal` at `column-door` ("Look at", "The seal on the door");
    - start the dedication when the player is within 3 m of `column-door` and the hour is 6–18 (check on `location:entered`, `time:hour` and a 0.5 s poll; hint at night or before 06:00);
    - on `content:interact` `mq04-seal`: flag `mq04-seal-seen`, notify the seal text, `dedication.sealSeen()`;
    - `onShot` → `setStage('climb')`.
  - **`climb`:**
    - flag `columna-open`;
    - Gratus posed `sleep` at his fall point;
    - Crito staged kneeling;
    - objective markers: `column-door`, then (inside) `interior:dun-columna:landing-1` → `landing-2` → `top` (use `reveal` and per-objective targets);
    - on `interior:entered` `dun-columna`, spawn the two knife-men with `spawnEnemyAt` at `landing-1` and `landing-2` (aggro 6, hearing 6, tags `[mq-04-columna, 'stair']`), once;
    - examine `mq04-chamber` in the chamber;
    - on `interior:entered` `columna-summa` → stage `archer`.
  - **`archer`:**
    - spawn Bitus once at spot `bitus` (`spawnEnemyAt`, `npc: npc-bitus`, profile `BITUS_PROFILE`, `quest`, tags);
    - **on `combat:yieldChoice` for Bitus:** `spare` / `rob` / `arrest` → fate `spared`, then auto-open the `npc-bitus` dialogue 1.2 s later; when it ends (node `bitusEnd`), fade, remove Bitus and notify "Pudens's men came up the stair and took Bitus down in chains." `kill` → fate `killed`, plus the optional objective "Search the archer" (done on `item:added` `quest-tessera-mucaporis`);
    - **on `actor:killed` for Bitus** with no fate → `killed`;
    - `actor:yielded` alone decides nothing;
    - a fate that is set → stage `aftermath`, unless the "Search" objective is open, in which case on its completion.
    - If the player leaves the platform with Bitus yielded and undecided, treat it as `spared` (he is taken by Pudens's men).
  - **`aftermath` / `aftermath-killed`:**
    - Crito's post-shot line from CONTENT ("Lay him flat. Press there. No, harder. Good.") is said by `say` when Crito reaches Gratus;
    - Gratus staged lying in the court;
    - Crito by him;
    - Pudens staged standing by them (col-local about (1.0, −4.0));
    - objectives "Go down to Gratus" (location `column-door`) then "Speak to Pudens" (`npc-pudens`);
    - give `quest-sagitta-dacica` when the player first talks to Crito or Pudens;
    - Pudens's node `summonsEnd` → `done`.
  - **`done`:** stop the dedication, unstage everyone, release Trajan's hold, the banner (§1.2 item 8), `end: 'complete'`.
- **Rewards:** `{ denarii: 80, skillXp: ['blades', 'athletics'], items: [{ id: 'anulus-peregrinorum' }] }`.
- **Test:** `tests/content-mq04.test.ts` (copy the local helpers from `tests/content-quests.test.ts`). Drive the quest by events:
  - the start after mq-03;
  - the calendar step;
  - the stages through the briefing, the seal, the shot (call the hook);
  - the climb (emit `interior:entered`);
  - Bitus spared via `combat:yieldChoice`, and killed (a second world);
  - Pudens;
  - done, with the banner.
  - Stub `game.interiors` and the dedication where needed.

### 3.9 Dialogue: `src/dialogue/content/columna.ts` (new) and Gratus in `src/dialogue/content/main-quest.ts` (owner: dialogue agent). See §4.

### 3.10 Smaller fixes found while mapping (owners as listed)
- **The Mus fate is recorded too early** (`src/quests/content/mq-02-tabella.ts`). `actor:yielded` records `'spared'` before the player chooses, so a later Kill is lost.
  - Make `actor:yielded` provisional.
  - Decide on `combat:yieldChoice` (`kill` → killed; spare, rob or arrest → spared) or `actor:killed`.
  - If the player leaves the hideout with Mus yielded and undecided → spared.
  - Update the Mus tests in `tests/content-quests.test.ts`.
- **Temples shut on the wrong day** (`src/content/director.ts` `todaysFestivals`/`templesShut`, `src/content/barks.ts` `festivalsOn`). They read the unclamped `game.time.date()`, so on the third elapsed day dialogue says the temples are shut for the Lemuria while the calendar still holds 11 May.
  - Make them read `game.calendar` (its `festivals()`/`isFestival`) when present, falling back to the old table without a calendar.
  - Keep the 'fest-columna-eve' meaning as "the calendar is held on the eve of the Column" (`calendar.clamp === 'mq-04-columna'`, or the date is 11 May without a calendar).
  - Add `hoursUntil(target, now)` to `src/content/hours.ts`.
  - Tests.

---

## 4. Dialogue (owner: dialogue agent)

**Voices:**
- **Gratus:** a tired soldier, short sentences, dry.
- **Pudens:** genial, slow, terrifying; "my boy" / "my girl" (the player's sex: `c.game.player` sheet or appearance; neutral "my friend" if unknown).
- **Bitus:** plain, proud, bitter; good Latin learned on the building gangs.
- **Crito:** a Greek doctor, brisk.
- **Apollodorus:** clever, impatient.

**Form:**
- Lines are lucid, with no modern idiom.
- Each node is ≤ 3 sentences of NPC text.
- Player choices are short.
- Use `defineDialogue` as in `marii.ts` and `main-quest.ts`. The hook node ids below are contracts: the quest listens for them.

### 4.1 Gratus, morning of 12 May (in `main-quest.ts`, entered when `mq-04-columna` stage is `dawn` or `post`)
- **`d12a`:** "You came. Good. Nobody in my camp slept, and I trust half of them." Choices:
  - "What's the plan?" → `d12plan`
  - "Who else knows what the message said?" → `d12who`
  - "What if the bow isn't on the Column?" → `d12else`
  - "Where do you want me?" → `d12post`
- **`d12plan`:** "Men on both library roofs and in the gallery. The praetorians round Caesar, thirty paces deep: Similis wouldn't let me nearer. Apollodorus had the Column's door sealed with lead at first light, after his men swept the stair. There's nobody up there but the statue." → back.
- **`d12who`:** "You, me, Pudens: he's my chief, the princeps of the Peregrini. And whoever sold Festus's road. I told Pudens last night. He said, 'Then let them shoot, and we'll see who hands them the bow.' He has a sense of humour, Pudens." → back.
- **`d12else`:** "Then I'm a fool on the wrong roof. The message said a high place. Look up. There's nothing higher in Rome today." → back.
- **`d12post`:** "Stand at the Column's door. Nobody goes in or out. You know the faces of the Mouse's kind now. If anything feels wrong, shout, and don't wait for my leave." → `postEnd`.
- **`postEnd`:** player line "(You take the centurion's meaning.)", `end: true`. **The quest hook.**
- **When the stage is `ceremony`:** a short node: "Caesar comes at the second hour. Your post is the door." (and, before 06:00, "Wait. Watch. It's early yet.")
- **Wounded** (stage `climb`, auto-opened by the quest, id `w0`): "On top. He's on the top. The seal... Go! Alive if you can. I want the hand that paid him." `end: true`. If the player talks to him again in `climb`: Crito answers instead ("He can't talk. Go and do what he told you.").
- **`aftermath`:**
  - **`a0`:** "Did you get him?" Choices:
    - "He's alive, and Pudens's men have him." (if spared) → "Good. A dead man tells nothing."
    - "He's dead." (if killed) → "Then he can't tell us who paid. Pity."
    - "He wasn't aiming at Caesar. He was aiming at you." (only if spared and the player heard it, flag `mq04-bitus-target`) → "At me? ... Then someone in my own camp told them which centurion was asking about pepper. Tell Pudens. Tell him exactly that."
    - "Rest." → end

### 4.2 Crito (`npc-crito`)
- **`c0` (climb):** "He can't talk. Press here... harder. Good. Go and do what he told you." end.
- **`c1` (aftermath):** "Under the collarbone, through the muscle, missed the great vessel by a finger. He'll live, if he lies still, which he won't." The first time, he gives the player `quest-sagitta-dacica`: "(Crito puts the arrow in your hand. Barbed. Red bands on the shaft. Dacian.)" end.

### 4.3 Bitus (`npc-bitus`), auto-opened after he is spared (start node `b0`)
- **`b0`:** "So. You climbed all of it. One hundred and eighty-five steps; I counted them in the dark." Choices:
  - "Who are you?" → `bwho`
  - "Why?" → `bwhy`
  - "Who paid you?" → `bpaid`
  - "Who were you shooting at?" → `btarget`
  - "Get up. Pudens's men are coming." → `bitusEnd`
- **`bwho`:** "Bitus, son of Dida. From the hills above Sarmizegetusa, when there were hills and a Sarmizegetusa. I carried stone for this forum for six years. Nobody looks at a captive with a rope on his shoulder." → back.
- **`bwhy`:** "Walk down your Column and count my people. They're on it a thousand times: burning our own houses, drinking poison, carrying our king's head to your Caesar on a dish. Your stone says we lost. I wanted it to say one more thing." → back.
- **`bpaid`:** "Mucapor gave me the bow: a falx-man at the Ludus Dacicus. The silver was from a man with Syrian rings who smelled of pepper. Take this; Mucapor's men know it. If you go asking for him, take more friends than you have." Effects: give `quest-tessera-mucaporis` (once). → back.
- **`btarget`:** "Not Caesar. They were clear. The centurion in the grey cloak, the one going about asking questions at the pepper house. Caesar, they said, is for later." Effects: flag `mq04-bitus-target`. → back.
- **`bitusEnd`:** "Do what you like with me. I've seen Rome from the top. It's smaller than they say." `end: true`. **The quest hook.**

### 4.4 Pudens (`npc-pudens`), aftermath (start node `p0`)
- **`p0`:** "So you're Gratus's stray. Titus Aufidius Pudens. I keep the couriers, and the couriers keep the secrets. Gratus says you brought Festus's tablet all the way in from the gate, and then climbed my emperor's column for him." Then, by fate:
  - **spared:** "...and you brought me a live Dacian. Do you know how rare that is, my boy? A live one talks."
  - **killed:** "...and you left me a dead Dacian. Dead men are poor company and worse witnesses."

  Choices:
  - "Will Gratus live?" → `pgratus`
  - "The archer wasn't shooting at Caesar." (if `mq04-bitus-target`) → `ptarget`
  - "What happens now?" → `pomen`
- **`pgratus`:** "Crito says so, and Crito is Caesar's own doctor, so he had better be right. A hand lower and you'd be talking to Gratus's ghost, and the Lemuria is over." → back.
- **`ptarget`:** "No. He wasn't. Gratus has been telling me for a month that my camp leaks. Today I believe him. Keep that to yourself, my boy. Especially from my camp." → back.
- **`pomen`:** "Now? Now you listen carefully, because this is what happened. There was no arrow. A centurion of mine was taken ill in the sun, and at the same moment a hawk was seen over the Column. The augurs are already calling it a fine omen for the Parthian war. That is what you saw. Say it back to me." Choices:
  - "A hawk over the Column. A fine omen." → `psummons`
  - "Rome will hear the truth anyway." → "Rome will hear forty truths by nightfall. Ours will be the one with a temple attached." → `psummons`
- **`psummons`:** "Come to the Castra Peregrina tomorrow, on the Caelian. Show the guard Gratus's token. We'll talk about what you are going to be. And take this; it opens doors that are none of your business." Effects: give `anulus-peregrinorum` (once). → `summonsEnd`.
- **`summonsEnd`:** player line "(Pudens turns back to the litter where Gratus lies.)", `end: true`. **The quest hook.**
- **Outside mq-04** (Pudens is only staged in mq-04): a fallback node "Tomorrow, my boy. The Castra Peregrina."

### 4.5 Apollodorus, 12 May (in the file holding `npc-apollodorus`'s dialogue; add a branch while `mq-04-columna` is at `dawn` or `post`)
- "The door? Sealed with lead at first light. Moschus did it himself. Before that the hoist gang were in the stair, taking down the last ropes. Dacians, most of them: they're good with ropes. They came out, Moschus sealed it, and nobody has been in since." Choice "Did they all come out?" → "...I assume so. I'm an architect, not a shepherd. Moschus counted. I think." Effects: flag `mq04-apollodorus-door`. The quest completes the optional objective on this flag.

### 4.6 The crowd after the dedication (owner: dialogue agent, small edit in `src/content/folk/topics.ts` or `citizens.ts` news)
Once `mq-04-columna` is done, the `news` answers add (by status) the omen story:
- "They say a hawk flew over the Column at the very moment. Good for the war, the augurs say."
- From a slave or pauper: "A hawk. Yes. And a centurion fainted. In May. At the second hour."

---

## 5. Journal entries (owner: quest agent, written here)
- **`dawn`:** "Gratus had told me to be in the Forum of Trajan at first light. It was the day of the dedication: Caesar would stand at the foot of his Column before all Rome, and somewhere there was a bow on a high place."
- **`post`:** "The Forum of Trajan was full before the sun was up: senators, soldiers, half the city on the gallery roofs. Gratus was in the little court behind the basilica, at the Column's foot."
- **`ceremony`:** "Gratus put me at the Column's door. It had been sealed with lead at first light, after the stair was swept. Nobody was to go in or out."
- **`climb`:** "The arrow came from the top of the Column and took Gratus in the shoulder. Caesar's guards closed round him and hurried him away. The seal on the door had been cut. The archer was up there, a hundred feet over the Forum, and the only way up was the stair inside."
- **`archer`:** "One hundred and eighty-five steps in the dark, with slits of daylight to climb by. Two of his friends were waiting on the stair. At the top, a little door opened onto the sky."
- **`aftermath`** (spared): "The archer was a Dacian called Bitus, son of Dida. I spared him. He said the bow came from a falx-man called Mucapor, and the silver from a man who smelled of pepper. And he said he was never sent to kill Caesar: only Gratus. Caesar, they told him, was for later."
- **`aftermath`** (killed): "The archer was a Dacian. He died on the platform under Caesar's statue, with three Parthian drachms in his belt and a bone token scratched with a falx and a name: MVCAPOR."

  The two variants go through two stages that share a body (`aftermath` and `aftermath-k`), or set the journal by stage choice. The journal is static per stage, so use `aftermath` (spared) and `aftermath-killed` with the same objectives and handlers.
- **`done`:** "Pudens, chief of the couriers, told me what had happened: a centurion fainted in the heat, and a hawk was seen over the Column, a fine omen for the war. Gratus will live. I am to go to the Castra Peregrina tomorrow."

---

## 6. Verification (orchestrator)
- **Automated:** `npm run typecheck`, the full `npx vitest run` (exit code), and the new tests.
- **In-game shots** (`scripts/shot.mjs`):
  - the court before the ceremony;
  - the ceremony (party, herald), the arrow, Gratus down;
  - the vestibule, the stair (looking up the well), a slit window, landing 1 with a knife-man;
  - the platform with the statue and Bitus, and the view;
  - the aftermath with Pudens.
- **Checkpoints** (owner: test agent; `src/game/checkpoints.ts`):
  - `?part=dedication`: 12 May 06:30, mq-04 at `post`, at the court;
  - `?part=column`: mq-04 at `climb`, door open, at `column-door`;
  - `?part=summit`: mq-04 at `climb`, the player inside `dun-columna` at `top`;
  - `?part=aftermath`: mq-04 at `aftermath`, fate spared.
- **Golden path:** `scripts/golden-bot.js` and `scripts/golden-path.mjs` gain `mq-04-columna`:
  - wait to dawn;
  - follow markers;
  - use the interior doors (`interaction` ids from the interiors module);
  - inside a cell, follow `game.interiors.routeWorld(id)` instead of nav paths;
  - fight;
  - answer the yield panel with "Spare";
  - talk.
- **Performance:**
  - the cell's draw calls ≤ 25 and lights ≤ 4;
  - the Forum at the ceremony holds 60 fps (perf.mjs `--views` with a dedication query, if a view exists; else shot stats).
