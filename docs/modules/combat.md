# Combat module: the fight, the combat AI and the arena

This module runs every fight in Skyrome: the player's verbs (light chain, power attack, block and
parry, bash, dodge, lock-on, draw, yield), the rules that decide what a blow does (through the
RPG's combat math), the enemies' combat AI, Nereus the retiarius, and the arena's crowd. It follows
`docs/GDD.md` §4.2–4.4 (controls and camera), §6 (all of combat), §13 (enemies and bosses) and the
acceptance criteria AC-04, AC-06–AC-09 and AC-22.

- Code: `src/combat/` (rules, the game wiring, player input, HUD overlay, bodies, street danger), `src/ai/combat/` (brain, attack tokens, Nereus)
- Test bed: `?scene=arena` (`src/scenes/arena.ts`); in the city it is installed by the game flow (`src/game/optional.ts`)
- Tests: `tests/combat-*.test.ts` (126 cases)
- Third-party assets or libraries: none

## How to try it (for the owner)

1. Run `npm run dev` and open <http://127.0.0.1:5173/?scene=arena>. You stand in a sand practice
   arena like the Ludus Magnus' with a gladius and a scutum. A mugger (*grassator*) comes at you.
2. **F** attacks: tap for the three-hit chain, hold for a power attack (release to strike).
   **Q** blocks. A Q press just before a blow lands is a **parry**: he staggers, and your next
   attack is a riposte for double damage. **F while blocking** bashes with the shield.
3. **Space** dodges while you are fighting with the weapon out (it jumps otherwise). **Option**
   always dodges. Hold a direction for a side step, or nothing for a backstep.
4. **X** locks on (X again changes target, hold X to let go). **R** sheathes and draws. **V**
   switches first and third person, also mid-fight. **Hold Y** to yield.
5. Try other opponents: `?scene=arena&enemy=miles-urbanus` (an urban soldier who blocks a lot),
   `&enemy=grassator&count=4` (four at once; only two attack at a time), `&enemy=thraex`,
   `&enemy=tiro`, `&enemy=collegium-bruiser`, `&enemy=vigil`, `&enemy=ebrius-rixator` (a brawl:
   fists, nobody dies).
6. **Nereus:** `?scene=arena&enemy=boss-nereus`. A practice bout (*lusio*) with crowd favor on the
   right edge. Watch for the net: he twirls it for almost a second, and the screen edge glows red.
   Dodge it (+4 favor), or press F or E quickly to struggle free. Your shield still works while
   you are netted. He changes his style at 75 % and 45 % health and yields at 15 %; then you
   choose: *Mitte* (spare him) or strike.
7. Difficulty: add `&difficulty=tiro` (story) or `&difficulty=difficilis`.
   `&toggle=1` turns on toggle-block (the Trackpad preset). These URL choices last for the visit
   only; they never change your saved settings.

**In the city** (`?scene=rome`, the real game): combat is always on. R draws, F attacks, and the
difficulty, block mode, power-hold time and lock-on follow Esc → Settings.

8. **Night muggers.** After dark (19:30 until first light at 06:10) a pair of *grassatores* may wait
   by the street ahead of you: under the Palatine, on the Vicus Tuscus or on the road from the Porta
   Capena to the Colosseum. On a new game's walk from the Porta Capena you meet the first pair on
   the street under the Palatine. They step out when you come near: *"Purse or blood, friend."* Pay
   a quarter of your purse and they let you pass, or refuse and fight. Run, and they let you go.
   To see one at once:
   <http://127.0.0.1:5173/?scene=rome&quick=1&hour=21&danger=circus-north-capena> (they wait 20 m
   ahead). `&danger=0` keeps the streets safe.
9. **Bodies.** A fallen enemy can be searched: look at it and press **E** (*Search*). You find its
   weapon, some of its clothes and a few coins. **R** takes everything.
10. **Knocked out in the street.** A cudgel or fists can knock you out instead of killing you. The
    screen goes dark for a few seconds; muggers take half your purse and are gone when you come to.
11. **Tiro: the Aesculapian rescue.** On Tiro a death is not the end: after a moment of black you
    wake in front of the Temple of Aesculapius on the Tiber Island with full health and a fifth less
    coin (passers-by carried you there). The same happens on any difficulty while you have no save
    to load yet, so a new game never ends at the title.

## Wiring it in

```ts
import { installCombat } from './combat';

setupPlayer(game, pos, heading, createHumanoid(app));
installRpg(game, { background: 'veteranus' });      // optional: the sheet, inventory, XP
installUI(game, uiRoot);                             // optional: enemy/boss bars, compass, dialogs
installAudio(game);                                  // optional: swings, clashes, cries, combat music
const combat = installCombat(game, { hudRoot: uiRoot });  // game.combat — install it last
```

In Rome the game flow installs it (`src/game/optional.ts` finds `installCombat` in
`src/combat/index.ts`), after the UI wiring: the flow's HUD sources already ask `game.combat` for
`targetView()`, `bossView()` and `compassMarkers()`, and the music follows `game.combat.active` and
`alerted()`. The flow keeps its own death prompt ("Mortuus es", load or title) except when
`game.combat.handlesDeath` is true: on Tiro (§6.12) and while there is no save to load at all
[design], combat runs the **Aesculapian rescue** instead (`rescue()`, `'combat:rescued'`).

`installCombat` builds the player's combatant from `player.sheet` and `player.inventory` when the
RPG is installed (it re-reads the loadout on every equip change and, unless the flow's `PlayerLook`
dresses the avatar, puts the equipped weapon and shield on it). When `PlayerLook` rebuilds the avatar
for new clothes (`'player:avatar'`), the combatant follows the new one. A load (`'save:loaded'`) or a
new game (`'game:started'`) ends every fight and stands the player up with the pools the save
restored. Without the RPG the player fights with fists at skill 25. It hooks the
`PlayerController` (`canJump`, `motionOverride`, `speedMultiplier`, `canSprint`; each composes with
earlier hooks), provides the UI's `target`, `boss`, `inCombat` and `compassMarkers` sources (it
composes with existing markers), and mounts its HUD overlay inside the UI's HUD root.

## For other modules

```ts
// NPC module
game.combat.engage(npcActor, game.player);       // actors, combatants or ids; returns whether a fight started
game.combat.engage(guard, thief);                //   an actor that isn't a combatant yet is adopted (below)
game.combat.isInCombat(actor);                   // fighting? (no argument: the player, §6 predicate)
game.combat.isDriving(actor);                    // true while combat moves this body: skip your own locomotion
game.combat.disengage(actor);
const c = game.combat.register(actor, { profile, team: 'law', faction: 'vigiles', lawful: true, loadout: { weapon: 'fustis' } });

// Quest content (src/content/director.ts speaks this already)
game.combat.spawnEnemy('grassator', pos, { id: 'npc-sorex', npc: 'npc-sorex', quest: 'mq-01-madida-capena', tags: ['grassator'], hostile: true, profile });
game.combat.spawnEnemy('retiarius', pos, { id: 'npc-nereus', boss: 'boss-nereus', practice: true, quest: 'lud-01-sacramentum' });
game.combat.engage('npc-crispus', { brawl: true, tags: ['rixa'] });   // an actor id + options: fight the player

// Spawners and dev scenes
const thug = game.combat.spawnEnemy('grassator', pos, { engage: true });        // avatar, actor, AI
const nereus = game.combat.spawnEnemy('boss-nereus', pos, { lusio: true });
game.combat.startBout({ foes: [nereus], lusio: true, editor: { x, z }, purse: 40 });
game.combat.despawn(thug);
game.combat.override({ difficulty: 'tiro' });     // dev scenes: settings for this visit only
game.combat.danger.trigger('vicus-tuscus-south'); // stage a night mugging now
```

- `spawnEnemy(archetype, position, opts)`: the authored archetypes are `grassator`,
  `ebrius-rixator`, `collegium-bruiser`, `tiro`, `thraex`, `miles-urbanus`, `vigil` and
  `boss-nereus` (`src/combat/archetypes.ts`); any other §13.1 archetype of the RPG tables spawns too
  (`murmillo`, `retiarius`, `cloacarius`, `sicarius`…: its tier and kit, a fitting look, the Ludus
  team for gladiators), and an unknown id becomes a knife thug. Options: `tier`, `kit`, `lusio` or
  `practice` (practice arms; a practice gladiator spawned by a quest also starts an arena bout with
  crowd favor), `brawl`, `yieldAt`, `hostile`, `tags` and `quest` (echoed in `'actor:killed'`),
  `npc` (a named NPC id: its name, title, look, stat block and essential flag), `profile` (content's
  own stat block, e.g. `mq01GrassatorProfile`: it wins over the archetype's and the NPC's numbers,
  with practice arms and `yieldAt` still applied on top), `boss` (`boss-nereus` wins over the
  archetype), `opener`, `bout`, `team`, `group`, `aggro` (the attack-on-sight radius, default 18 m),
  `engage`, `heading`, `seed`, `lod`, `drawn`, `id`, `name`. A `hostile` fighter spawned for a
  `quest` (or with `engage`) knows where the player is: it notices you anywhere within its aggro
  radius, seen or not (mq-01's ambush behind the solid Porta Capena block starts), and walks round
  whatever stands between (see *Getting round things* below).
  Spawning with an id that is already in use replaces that fighter. Stats come from
  `src/rpg/enemies.ts` (§6.11 tiers and §13.1 kits). The look comes from `randomAppearance(role)`
  (or the NPC's own appearance) with the kit's weapon and shield models. The resolution is pure and
  tested (`src/combat/spawnSpec.ts`).
- **Scripted openers** (docs/CONTENT.md §5.2): `opener: 'chain'` takes the first turn with a three-hit
  light chain; `'delayed-power'` waits 3 s and then winds up a power attack for a full second.
  mq-01's two grassatores get them automatically (the first spawned for `mq-01-madida-capena` chains
  with a knife, the second waits with a cudgel) until content passes `opener` itself.
- `engage(a, b?)`: without `b`, or with options instead (`{ hostile, practice, brawl, yieldAt, tags,
  quest, name, profile }`), `a` fights the player. An actor another module placed is adopted first
  (`adoptActor`): its profile comes from `game.npcs` (or the actor's own `def`), else from its
  faction (`vigiles` → a vigil, `cohortes-urbanae` → a miles), else it is a civilian who defends
  himself; its team is its faction. Adopted actors are driven by combat only while they fight, and
  their deaths are passed to `game.population.kill(actor)` when that exists.
- **Anyone can be struck** (§14.1). The player's blows land on whoever they touch: a light attack,
  a riposte, a bash, a sweep or a power attack, on a passer-by, a shopkeeper, the courier or the
  watch. People in reach who aren't combatants yet are adopted first (up to three in front; the
  crowd's soldiers and vigiles as the lawful watch). With an enemy in the swing, the enemy is struck
  before a passer-by beside him; a kneeling, yielded person is struck only when the attack is aimed
  at them. Essential NPCs are knocked down for a moment instead of dying. A blow on someone who
  wasn't an enemy is an assault (`combat:assault`, the player becomes the aggressor), gives no skill
  XP and no sneak bonus unless the player was sneaking (C), and a civilian yields at half health or
  runs. NPCs strike only their enemies. Adopted people idle for 30 s, or gone from the world, are
  let go again.
- **Aim assist.** When the player attacks, the combat system picks who the blow is meant for: the
  lock target when it's within a few steps; else the person, foe or not, nearest the line of the
  swing within ±55° and up to 1.9 m beyond reach (enemies on their feet preferred, the kneeling
  least). The body turns to them and steps in over the wind-up (up to 1.2 m, 1.6 m for a power or
  sprint attack, more for a forward lunge), so a swing from a pace too far still lands.
- **F with the weapon sheathed** draws it and swings as soon as it is out (one press).
- **The law** (`src/game/law.ts`, GDD §14.1) answers. An assault is *vis* (40 den. bounty; the
  victim always saw it); killing someone you assaulted, or one of the watch while you are the
  aggressor, is *homicidium* (1,000) when someone saw it. Witnesses raise the alarm: the crowd
  scatters and nearby guards fight you. With a bounty, a guard who sees you walks up ("Stop right
  there!") and talks: pay the fine, a word (bounty under 200), a bribe (a corruptible guard, 200 or
  less), the Carcer (days pass, you walk out at its door), or resist (+50 %, guards attack on
  sight). Walking away from the talk is resisting; running from the guard adds 10 %. At 1,000 or
  more guards attack on sight; hold Y while they fight you to give up into the same talk. The
  condemnation *ad ludum* has no bouts yet, so a murderer serves the longest Carcer term instead.
- **Gore** (`src/combat/gore/`, Settings → Gameplay → Gore: *Ultra* by default, *Normal*, *Off*).
  Every blow that draws blood sprays droplets and leaves splats (more for a blade than a club); the
  dead bleed into a spreading pool. A killing cut with a blade takes off the head, an arm (at the
  shoulder or the elbow) or a leg (at the hip or the knee): always on Ultra (a power attack often
  two parts), sometimes on Normal; overheads and sweeps go for the head. The piece is the body's
  own mesh baked in its pose (with what it held: the sword, the helmet), thrown off with physics;
  both stumps get a flesh-and-bone cap and pump blood for a few seconds. On Ultra a swing that
  strikes nobody alive but reaches a body hacks another part off it. The player is never
  dismembered. `game.combat.gore.dismember(id, part)` takes a part off on demand (scripted
  executions); `game.combat.gore.blood.burst(at, dir, n)` spills blood for any module.
- **Yields nobody decides.** A foe who yields to the player gets the spare/rob/arrest/kill choice
  put to the player (the prompt, a moment after the player's last swing), also when the very first
  blow caused it. A passer-by the player set upon just kneels: look at them and press E (*Decide*)
  for the same choice. If nobody
  decides, he gets up and goes about his business once the player is 40 m away or after 60 s
  (15 s when he didn't yield to the player); an adopted NPC goes back to its module, a spawned one
  leaves. Arena foes wait for the missio.
- `register(actor, opts)`: any actor with a `CombatProfile`. A registered NPC is driven by combat
  only while it fights, and is handed back once it is idle again (`isDriving`). Spawned enemies
  stay driven.
- Teams: different teams fight when they are made hostile (`core.setHostile(a, b)`; spawned
  `hostile` enemies are hostile to `player`) or when one engages the other. Calls for help reach
  the same `group` (or faction) within 30 m (20 m at night), plus lawful guards against an
  aggressor.
- `game.combat.core` is the rules engine (`CombatCore`). It has no Three.js scene, physics or
  DOM, so tests and tools can drive it directly.

### Events

| Event | When |
|---|---|
| `combat:started` / `combat:ended` | The player's §6 inCombat predicate flips (combat music follows) |
| `combat:hit` | A blow landed, was blocked or was parried (attacker, target, damage, kind, flags, stagger) |
| `combat:parry` | A timed block landed |
| `actor:killed` | Someone is out of the fight for good: a death, a **knockout** or a **flight**. `tags` carries the spawn's tags, its archetype and how it ended: `'dead'`, `'ko'` or `'fled'` (quest `kill:<tag>` objectives count all three; the save's world deltas record only deaths). The player's own knockout is `{ victimId: 'player', tags: ['ko'] }` |
| `combat:death` | A real death with its loot table, worn items, weapon, shield and position (the body container hook; the combat module's own bodies use it) |
| `actor:yielded` | An NPC knelt (§6.9): the combat system offers the spare/rob/arrest/kill choice. Also the player holding Y (`actorId: 'player'`) |
| `combat:yieldChoice` | The decision (the combat system applies `rpg/yield.ts`: Pietas, Fama, the purse, crime) |
| `content:missio` | An arena foe's missio was decided in combat's prompt (`spared: true` for *Mitte*) or by striking him down (`false`). Declared identically by quest content; lud-01's *Decide Nereus' missio* objective listens for it |
| `combat:rescued` | The Aesculapian rescue: the player woke at the Temple of Aesculapius (`place`) for `fee` denarii |
| `combat:knockout`, `combat:fled` | A knockout (with its duration), a successful flight |
| `combat:callHelp`, `combat:assault`, `combat:brawlEscalated` | For the NPC and crime modules |
| `combat:playerDefeated` | `death`, `knocked-out`, `brawl-lost`, `saniarium`, `saniarium-no-purse` (with the ids of the `foes` who were fighting): game flow decides what happens after a death; knockouts end in a short blackout |
| `combat:playerYielded` | Hold Y: `brawl` (fight over, −10 % purse), `arena` (missio roll), `arrest` (open the arrest dialogue) |
| `combat:bout`, `combat:favor`, `combat:phase`, `combat:lock` | Arena bout start and end (with the purse), favor changes, boss phases, lock-on |

Sound goes out as `sfx` events (`swing.*`, `clash.metal`, `block.shield`, `block.metal`,
`hit.flesh`, `hit.punch`, `vox.grunt/pain/death.m|f`, `body.fall`, `weapon.draw/sheathe`,
`cloth.rustle`). Spawned enemies get footsteps when audio is installed.

### Settings (all optional, declared in `src/combat/settings.ts`)

The game flow's settings come first: `difficulty` (Gameplay; default `normalis`), `powerHoldS`
(0.2–0.6 s, default 0.35) and `lockOnMode` (`suggest` is the default: drawing a weapon with a hostile
within 8 m locks on; `manual`; `auto`), set by the control presets. Hold or toggle block is the core
setting `blockToggle`. The combat module's own keys: `combatSimplePower`, `combatParryWindow`
(accessibility override in seconds), `combatShake` (`third`, the default per §4.4 = off in first
person; `on`; `off`), `combatSpaceAlwaysJumps`, `combatHitStop`, `reduceFlashing`,
`combatStreetDanger` (night muggers, default on), and the older `combatDifficulty`, `combatPowerHold`
and `combatLockOn` (used only when the flow's keys are unset). Dev scenes call
`game.combat.override({...})`, which is never saved.

## Rules at a glance

**Timeline (§6.1, §6.15).** Every action runs on the combat clock (fixed 60 Hz). A light attack is
wind-up 0.25, active 0.12 and recovery 0.30 s, each divided by the weapon's speed. The third hit
of the chain is ×1.25, and presses during a swing are buffered for 0.25 s. A power attack charges
while F is held (×1.5 at 0.35 s up to ×2.0 at 0.8 s, auto-release at 1.0 s), then takes 0.15 s to
the hit and 0.45 s to recover. The direction is latched from WASD within 0.25 s before the
threshold ("simple power" uses the movement at release). NPC wind-ups are stretched to the
telegraph minimums (light 0.35 s, power 0.70 s). Avatar clips are played at the speed that puts
their hit frame on the timeline's hit time (a Vitest checks every stance).

**Hit detection.** At the hit frame (the clip's `onHit`, or the timeline if no clip plays), the
weapon is a segment from the hand: its distance from the shoulder and its height come from the
avatar's `handR` and `chest` sockets, and it is `weapon.reach` long. It sweeps the stroke's arc
around the body's facing: 50° for a thrust, 110° for a cut, 60° for an overhead, 140° for the
sideways sweep, 90° for a bash. Every capsule it touches is tested (`geometry.ts`), and a line of
sight check stops blows through walls. The camera is never involved, so first and third person
fight identically (a scripted first-person duel gives the same results). NPCs strike only their
enemies, and sweeps strike only hostiles. A player's thrust or cut takes the lock target if it is
in the arc, otherwise the most central hostile; it touches a bystander only as a deliberate power
attack or punch with no hostile there (AC-22, see *Bystanders* above). A kneeling, yielded fighter is struck only on purpose: with a power attack, or while
locked on him.

**Damage (§6.2–6.4).** `computeAttack` and `resolveHit` from `src/rpg/combat-math.ts`. The core
supplies the chain position, charge, direction, sprint, bash, riposte, sneak (an unaware target, ×3
and daggers ×4), critical roll, condition and difficulty. The §6.2 examples are pinned by
`tests/combat-core.test.ts`: 14.6 per gladius thrust at Blades 25, so a thug falls in 4. An urban
soldier takes 10 thrusts or 9 clava blows. A sicarius kills a tunic-wearing player in 5 hits and a
mailed one in 10. A block needs the guard up for 0.1 s and the blow inside the 120° front.
Absorbing a blow costs max(4, 0.6 × raw × (1 − Shield/200)) stamina, and at 0 stamina the guard
breaks for 1.2 s. With three or more miles side by side, each gets +0.15 block (§6.13 formation).
A stuck pilum halves a shield's block.

**Parry and riposte.** Every block press opens the window (0.26 s on Normal, 0.40 Tiro, 0.32
Facilis, 0.18 Difficilis, 0.12 Herculea, +0.06 with Practised Parry, or the accessibility
override). A landed parry costs nothing: the attacker loses 60 % poise, staggers for 1.0 s and is
open to a riposte for 0.8 s (×2, a guaranteed stagger that opens no new window; at 25 % health or
less, a finisher). Weapon-only parries of power attacks count as blocks. Unblockable attacks (the
net, the sand kick) can't be parried. Toggle block follows §4.2 exactly (`guardInput.ts`): a tap
under 0.18 s is a parry attempt and never changes the guard, a longer press toggles it, and a parry
that lands never changes it.

**Dodge.** 2.5 m over 0.3 s, i-frames for the first 0.12 s and 0.2 s of recovery. It costs 15
stamina, double for the third within 1 s (a dodge can cancel a charge, an attack's recovery or the
previous dodge's recovery).

**Stamina.** Light 5 + 2 × weapon kg (gladius 7.4), power 3 × light (at least 20), bash 18, dodge
15. At 0 you can't attack, sprint or dodge until 15 has regenerated, and the stamina bar flashes.
Regeneration is the RPG's (20/s after 0.8 s, half while guarding).

**Poise (§6.5).** It goes through `applyPoiseDamage`/`tickPoise`: flinches at 20 % of max for NPCs
and 35 % for the player, with 0.4 s of flinch immunity. A flinch interrupts only a light wind-up,
never a block, a dodge or a recovery. A poise break staggers 0.8 s (light) or 1.5 s (heavy),
followed by 1.5 s of immunity, at most two staggers in 4 s. Heavy weapons (2 kg or more) and
bosses have hyper-armor in power wind-ups. The player's poise is 50, +12 in heavy body armor, +20
with a shield raised, plus the old-wound and survivor traits.

**The feel of a blow** (`CombatSystem.feedback`, numbers in `TIMING.hitStop` and `TIMING.feel`).
Blows involving the player set `game.timeScale` to 0.03 for 0.07 s (light), 0.11 s (power) or
0.15 s (parry, riposte, finisher), restored on real time; a killing blow by the player then eases
back from ×0.25 over 0.55 s. Each blow adds camera trauma (shake = trauma² × 0.13 m and a roll,
smooth noise, fading 1.8/s). Striking nods the view into the blow and punches the field of view in
(power blows and kills); being struck snaps it away from the attacker (`CameraRig.kick`/`fovKick`).
First person gets about a third of it. The hit marker flashes round the crosshair (red for a kill),
a landed blow shoves its target back 0.3 m (power 0.8 m), and blade hits on or by the player get a
body thump under the flesh sound.

**Lock-on.** X picks the target nearest the screen centre within 15 m and ±35°, X again cycles left
to right, and holding X for 0.5 s releases. The lock breaks at 20 m or after 2 s without sight.
Third person turns the camera a little off the line to the foe so the player never hides him, and
pulls back to 3.5–5 m (`CameraRig.framingDistance`). First person tracks the target's chest with a
0.15 s lag. With a weapon drawn, the body squares up to the target.

**Non-lethal rules (§6.9, §6.10).** Fists and the caestus always knock humans out at 0. The fustis,
clava and vitis do so up to `miles` (Subdue extends it). Practice arms never kill, and neither does
anyone in a brawl. Fists or a fustis from behind on an unaware human up to veteran tier knock out
instantly. Essential NPCs kneel for 3 s. A knockout lasts 3 real minutes; holding F on a
knocked-out body kills it (an `assault` event). An NPC that can yield doesn't die from the blow
that crosses its yield threshold. The grassator flees at it instead. NPCs flee at `fleeAt` and
are gone once 30 m away. Drawing a blade in a brawl turns it into an assault.

**The player knocked out.** Outside a bout's rules the player is out for 6 s [design] (an NPC for
3 minutes): the world goes dark, the foes stop and lose interest, and street thugs take half the
purse and are gone when the player comes to with a quarter of their health. In a lusio or a brawl the
events tell the quest (lud-01 stops the bout; the rixa is lost).

**Bodies (§6.14, `bodies.ts`).** A dead NPC is a container: E (*Search*) opens the UI's container
panel. It holds its weapon and shield (never practice arms or fists), each worn piece with a 50 %
chance, and a roll of its tier's loot table with coin, rolled the first time it is opened. Bodies
last 3 game days; spawned corpses leave the world once searched-out and far away (160 m). At most
`MAX_CORPSES` (12) spawned corpses stay at once: past that the farthest go, except corpses in view (within 45 m, in front of the camera), which stay up to `MAX_CORPSES_SEEN` (24) (each holds its own avatar and
gore pieces, about 3 MB; before the cap 20 fights in one place grew the heap by 170 MB).

**Arena (§6.10, `ArenaBout.ts`).** Favor starts at 30 (+10 with plebs Fama over 30). It rises for
a parry (+6), a riposte or finisher (+8), a power hit (+3), dodging an unblockable (+4) and a
salute (+5: hold E facing the editor's box at 50 or more, once). It falls by 2/s when you retreat
for more than 3 s, by 5 for every 6 s without an attack, and by 20 for striking a yielded foe.
When a foe yields, the crowd chants *Mitte!* (always in a lusio, or after a brave or long bout)
or *Iugula!*. Going with the chant gives +15 (+10 more for sparing rightly), against it −15. At
full favor, hold E for the crowd's gifts (5–50 den., wine for 40 stamina, a 20 % chance of a
Noric gladius); favor then resets to 60. When you yield, missio spares you at 50 or more, half
the time at 30–49, one in ten below that (always on Tiro). In a lusio, a refused missio or a
knockout means the Saniarium and the `injured` condition. The purse is base × (1 + favor/100),
paid once.

## Combat AI (`src/ai/combat/`)

`CombatBrain` is the §6.13 state machine, re-evaluated at 10 Hz and steered every fixed step:
approach (stop at reach + 0.3 m), engage (needs an attack token; attack every lerp(2.5, 0.9,
aggression) s; 30 % power attacks, 40 % for elites; feints from veteran up), circle (3–5 m at
1.5 m/s, switching direction every 2–4 s, spacing from allies), retreat under 25 % stamina (until
60 %), call-help at the start and at 50 % health, yield, flee, and search (the last known position
for 20 s). It notices hostiles in sight within its aggro radius, or unseen within its hearing radius (5 m;
a quest's ambushers: their whole aggro radius), and keeps track of a foe it can hear (6 m) or was
told to fight (its last known position starts where the foe was). Guards are pre-emptive (spells
of 1–3 s for blockSkill × 0.6 of the time) and reactive:
when the target steps into reach facing the NPC, chance blockSkill (−30 % when tired) after the
reaction time, held until the NPC attacks or tires. A power wind-up can also be read and guarded,
and elites, champions and bosses parry (blockSkill × 0.4). It moves only through
`Actor.locomote` and faces its target (slower during its own wind-up, so a dodge works).

**Getting round things (`pathing.ts`, §6.13 "path to the target", AC-22).** The brain steers in
straight lines toward a goal (the target, or its last known position); a `PathFollower` per driven
NPC turns that wish into one that goes round a gate block, a cart, a stall or a wall. The straight
line to the goal is probed with rays against the world (knee, chest and both shoulders; cached
0.25 s). When it is blocked the follower takes waypoints from the NPC crew's `NavService`
(`game.population.nav.findPath`, read structurally) when it exists, else follows the wall: the clear
direction nearest the goal, keeping to one side until the goal is in the clear again. Circling,
retreating and fleeing slide along walls instead of pushing into them. A mover that tries to walk
but makes no 0.35 m of progress in 1.5 s is stuck: it changes sides, drops its path, sidesteps for
0.6 s (and circling flips direction). `core.worstStuck()` reports the longest stuck spell for logs;
`tests/combat-nav.test.ts` checks a fighter round a fake gate block, a search round a wall, and a
1-vs-4 fight among walls with nobody stuck for 3 s.

`AttackTokens` hands out at most 1 (Tiro), 2 (Normal) or 3 (Difficilis) tokens per target. Bosses
cost 2, though a lone boss may still attack on Tiro. The longest waiter is served first, and a
holder gives its token back after its turn of 1–3 attacks or 4.5 s.

**Shield fighters under a rain of blows [design].** The brain keeps a running measure of how much
of the time its target has been swinging within reach. A shield-bearer pressed that way (above 55 %)
waits for the opening more often (blockSkill × 1.5), gets the shield back up after its own swing
more surely, attacks 30 % less often, and answers with an **umbo bash** (wind-up stretched to 0.3 s)
instead of trading blows: the bash knocks the attacker's next swing out of its wind-up. This is what
holds a *miles* above the AC-07 bar against light-attack spam.

**Nereus (`nereus.ts`, §13.2).** 300 HP, AR 7 cloth, a practice trident (8 blunt, 1.8 m), skill 60,
poise 150, reaction 0.25 s, block 0.45 weapon-only, intervals of 1.6, 1.3 and 1.1 s by phase,
2 tokens, a lusio.
- **Phase 1:** a net every 12 s (first at 4 s) within 2.2–6 m. The 0.8 s twirl telegraph (a red
  screen-edge pulse and a grunt) is followed by a 14 m/s cast that entangles for 3 s. Each F or E
  press takes 0.4 s off, the shield still blocks but there is no parry, and his first follow-up is
  a power poke with a wind-up of at least 0.8 s.
- **Phase 2 (75 %):** faster (speed ×1.1), feints, and a sand kick every 9 s that blinds for 1 s.
- **Phase 3 (45 %):** he loses the net; more power lunges (50 %) and the wooden dagger up close.
- **15 %:** he yields, and the missio choice opens (the decision is also sent as `content:missio`).
  Phase barks appear as subtitles.
- **The look:** no helmet, the white linen manica on the left arm and the bronze galerus over the
  left shoulder on a sun-browned body, so he reads as a retiarius at a glance (`retiariusLook`).

### [design] choices beyond the GDD

- **Counter timing.** With chance blockSkill, an NPC whose attack is due waits up to 1.5 s for the
  target's swing to land rather than swinging into its wind-up. Without this, a *miles* traded blows
  with light-attack spam and blocked only about 30 %.
- **Struck while unguarded.** Being hit with the guard down re-rolls the reactive guard (like
  stepping into reach does).
- **Movement while fighting.** The player moves at ×0.7 while guarding, ×0.6 while charging and
  ×0.45 mid-swing; NPCs plant their feet while striking. The §6.6 ×0.85 run in combat is applied.
- **Engage spacing.** NPCs engage at no closer than 1.15 m (a dagger's reach would make them hug).

## World danger (`danger.ts`, §13.3)

The night band of the v0.1 districts (docs/CONTENT.md §5.2 spawn bands) brings out grassator pairs
at four street sites: two on the street under the Palatine (the Circus north side), one on the Vicus
Tuscus south of its compitum, one on the road from the Porta Capena to the Colosseum. A site comes
alive when it is night (19:30 to first light at 06:10, §17.2), the player has been playing for 20 s
and nothing has been going on for 20 s (no fight, no menu, no dialogue), the site is 40–170 m
**ahead** of the player (within 60° of the way they are moving, or looking when standing) and out
of sight (80 m or more off in the dark, or off to the side of the view), it hasn't been used
tonight, and no vigil stands within 20 m. The pair waits beside the street (`lean` or `stand`) and
steps out when the player comes within 14 m in sight ("You there. A word, friend."); only then is
the street spent for the night. Face to face (3 m, or 5 m after 8 s) they make their demand in the
dialogue panel: pay `max(3, ⌈purse/4⌉)` denarii (never more than the purse) and they walk off, or
refuse and fight. Drawing a blade, striking first, walking off from the demand or closing the panel
counts as a refusal. A mark who keeps more than 15 m away for 3 s is let go ("Run, then."), so the
demand never pops up for muggers who can't reach you. A pair walked past without meeting (the
player 15 m farther than their closest and 30 m off) slips away and frees the slot for the next
street ahead. At first light unmet muggers slip away; far from the player (200 m) the encounter
ends. One encounter at a time. `tests/combat-danger.test.ts` walks the golden path from the Porta
Capena at 04:30 at 1.9, 3.0 and 4.4 m/s: each meets the pair on the street under the Palatine
before first light.

## Verified (scripts/shot.mjs and Vitest)

- **AC-07 block rates** (`__arena.duel(60, 150)`: a 60 s scripted duel, F every 0.15 s from within
  reach, god mode on both sides, after the main merge of 2026-10-04): *miles* 58.5 %, 42 %, 58 %,
  56 % and 41.5 % (seeds 1–5; 20 s duels scatter ±10 % around the same mean), thug 18.5 %, 10 % and
  11 %. A Vitest duel through the core asserts ≥ 40 % and the bash.
- **In Rome** (`?scene=rome&quick=1`): combat installs through the flow; spawned thugs fight on the
  Via Appia; the night mugging plays through approach, demand (the dialogue panel), refusal, fight
  and the player's knockout blackout; a death shows the flow's prompt and a load stands the player
  up; a gladius and scutum equipped mid-game swap onto the avatar in place.
- **Content's calls** (simulated in the arena with content's exact options): mq-01's pair spawns with
  the openers (knife: light ×3 at 0.7 s spacing, chain 1-2-3; cudgel: a 1.0 s power wind-up 2.3 s
  later); `spawnEnemy('retiarius', …, { boss: 'boss-nereus', practice: true, quest })` is Nereus with
  the net and starts a lusio bout.
- **Bodies:** a killed grassator shows *Search* and opens the container (2.5 denarii, his fustis, his
  tunic).
- **AC-07 tokens:** 1 vs 4 grassatores gives at most 2 attackers at once on Normal and 1 on Tiro;
  the others circle (in-game histogram and `tests/combat-ai.test.ts`).
- **Nereus:** nets entangle (screenshots of the drape and the IRRETITVS prompt), phases at 73 % and
  45 %, and the yield at exactly 15 % (Vitest). Struck down while yielded, the bout ends once.
- **AC-06:** light chain, held power attack, hold and toggle block (§4.2 timings), parries 6 of 6 with
  taps 0.12 s before impact, riposte ×2, bash, Space and Option dodges (Space doesn't jump in
  combat), lock-on with cycle and hold-release, R, V mid-fight (AC-04), hold Y.
- **First/third person parity:** 10 s of F every 0.15 s against a training post connects 11 of 14
  swings (8 blocked, 3 landed) in both views, identically.
- Screenshots: mid-swing in third and first person, a hit reaction, a death with the dropped
  cudgel, a tiro's yield pose, the knockout blackout, the mugger's demand.
- Runs in Chrome (Metal) without console errors. 41–62 draw calls in the arena.
  `?scene=arena&site=rome` fights inside the city at the Ludus Magnus.
- **Review fixes (2026-10-04, in Rome with `?scene=rome&quick=1`):** two quest grassatores spawned
  on the far side of the solid Porta Capena block notice the player at once and come round both
  sides of it (one engages within 8 s); two light attacks at a passer-by whiff, a held power
  attack assaults him, he kneels and the *Decide* prompt shows; a 3 m/s scripted walk from the
  gate at 04:30 meets the muggers on the street under the Palatine at 05:16 with the demand face to
  face; sprinting away from muggers who stepped out ends the encounter with no demand; a death on
  Tiro wakes the player at the Temple of Aesculapius for a fifth of the purse.
- **AC-08 measurement** (`tests/combat-nereus-bot.test.ts`): a scripted competent player (rudis and
  scutum, skill 25, a tunic, no god mode; blocks 85 % of pokes, parries a quarter, dodges the net
  and the sand, struggles free, one blow per opening after a 0.15 s reaction) wins 4 of 6 bouts on
  Normal in 45–56 s (all three phases each time).

## Shared-file changes

The input actions, the `PlayerController` hooks (`canJump`, `motionOverride`) and
`CameraRig.framingDistance` this module needs are on main (the game-flow crew merged them).
On this branch:

- `src/ui/types.ts` (`BossView.phases`), `src/ui/hud/Bars.ts`, `Hud.ts` and `hud.css`: boss phase
  pips (both edges of the centre-shrinking bar) and `hud.flashBar(kind)` for a refused cost.
- `src/save/deltas.ts`: `'actor:killed'` with a `'ko'` or `'fled'` tag no longer records the actor
  as dead (knockouts and flights are reported to quests through the same event).

## Not done yet

- **Visuals.** No dedicated clips for dodges, the net throw, being entangled or a riposte. They use
  code displacement plus the closest existing clips (`throw`, `pickup`, `hitFront`/`hitBack`,
  `attackLight1`). Directional power attacks have their math (factors, the 140° hostile-only
  sweep, ±1.5 m steps), but the avatar picks its own variant from movement.
- **Ranged and formation.** The pilum volley isn't thrown; only the formation block bonus and the
  stuck-pilum rule exist.
- **Stubs.** Search and flight are simple (go to the last known position; run away from the
  attacker). Yield-choice crimes pass `witnessed: false` until the stealth module provides
  witnesses.
- **Hooks left to other modules.** Player death and Saniarium outcomes are events for game flow
  (the arena scene revives you after 4 s; in Rome the flow's death prompt loads a save). Bodies are
  not saved (world deltas record the death only). The hotbar, quick wheel and patron invocation keys
  are the RPG and UI crews'.
- **Street danger.** Only the night muggers. Daytime band-1 trouble (the ebrius rixator, Lurco's
  bruisers) is left to the NPC crew's vignettes and quest content; lit areas don't yet keep the
  muggers away (only a vigil within 20 m does).
- **First-person view of the scutum.** The big shield covers much of the left of the screen in the
  drawn stance in first person (the avatar module's pose; not changed here).
- **AC-08 fight length** (3–6 minutes) is not met by a competent player: the bot above yields
  Nereus in under a minute, because §13.2's stat block (300 HP, AR 7) against a rudis (≈ 12 a blow,
  16 blows to the yield) gives an opening with every one of his pokes. More block skill, evasive
  backsteps or a keep-away retiarius barely lengthened the bout in the bot's runs and made it
  deadlier for a slower player, so they were left out. Reaching 3–6 minutes needs a design call:
  more health with softer pokes, or weaker practice arms.
- **Paths.** Without the NPC crew's `NavService` (not on main yet) fighters use the wall-follower,
  which rounds convex obstacles (a gate block, a cart, a stall) but can still wander in a deep
  U-shaped dead end until the stuck detector turns it round.
- **Control presets.** The presets live in the game flow's settings; combat follows `blockToggle`,
  `powerHoldS` and `lockOnMode`. Aim assist is for ranged weapons, which the player can't use yet.
