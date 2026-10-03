# Combat module: the fight, the combat AI and the arena

This module runs every fight in Skyrome: the player's verbs (light chain, power attack, block and
parry, bash, dodge, lock-on, draw, yield), the rules that decide what a blow does (through the
RPG's combat math), the enemies' combat AI, Nereus the retiarius, and the arena's crowd. It follows
`docs/GDD.md` §4.2–4.4 (controls and camera), §6 (all of combat), §13 (enemies and bosses) and the
acceptance criteria AC-04, AC-06–AC-09 and AC-22.

- Code: `src/combat/` (rules, the game wiring, player input, HUD overlay), `src/ai/combat/` (brain, attack tokens, Nereus)
- Test bed: `?scene=arena` (`src/scenes/arena.ts`)
- Tests: `tests/combat-*.test.ts` (87 cases)
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
   `&toggle=1` turns on toggle-block (the Trackpad preset).

## Wiring it in

```ts
import { installCombat } from './combat';

setupPlayer(game, pos, heading, createHumanoid(app));
installRpg(game, { background: 'veteranus' });      // optional: the sheet, inventory, XP
installUI(game, uiRoot);                             // optional: enemy/boss bars, compass, dialogs
installAudio(game);                                  // optional: swings, clashes, cries, combat music
const combat = installCombat(game, { hudRoot: uiRoot });  // game.combat — install it last
```

`installCombat` builds the player's combatant from `player.sheet` and `player.inventory` when the
RPG is installed (it re-reads the loadout on every equip change and puts the equipped weapon and
shield on the avatar). Without the RPG the player fights with fists at skill 25. It hooks the
`PlayerController` (`canJump`, `motionOverride`, `speedMultiplier`, `canSprint`; each composes with
earlier hooks), provides the UI's `target`, `boss`, `inCombat` and `compassMarkers` sources (it
composes with existing markers), and mounts its HUD overlay inside the UI's HUD root.

## For other modules

```ts
// NPC module
const c = game.combat.register(actor, { profile, team: 'law', faction: 'vigiles', lawful: true, loadout: { weapon: 'fustis' } });
game.combat.engage(actor, game.player);          // actors, combatants or ids
game.combat.isInCombat(actor);                   // fighting? (no argument: the player, §6 predicate)
game.combat.isDriving(actor);                    // true while combat moves this body: skip your own locomotion
game.combat.disengage(actor);

// Spawners and quests
const thug = game.combat.spawnEnemy('grassator', pos, { engage: true });        // avatar, actor, AI
const nereus = game.combat.spawnEnemy('boss-nereus', pos, { lusio: true });
game.combat.startBout({ foes: [nereus], lusio: true, editor: { x, z }, purse: 40 });
game.combat.despawn(thug);
```

- `spawnEnemy(archetype, position, opts)`: archetypes are `grassator`, `ebrius-rixator`,
  `collegium-bruiser`, `tiro`, `thraex`, `miles-urbanus`, `vigil` and `boss-nereus`
  (`src/combat/archetypes.ts`). Options: `tier`, `kit`, `lusio` (practice arms), `team`, `group`,
  `aggro` (the attack-on-sight radius, default 18 m), `engage`, `heading`, `seed`, `lod`, `drawn`, `id`,
  `name`. Stats come from `src/rpg/enemies.ts` (§6.11 tiers and §13.1 kits). The look comes from
  `randomAppearance(role)` with the kit's weapon and shield models.
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
| `actor:killed` | A death (the loot hook; `killerId` is `player` for the player's kills) |
| `combat:death` | The same death with its loot table, worn items, weapon, shield and position, for a body container |
| `actor:yielded` | An NPC knelt (§6.9); the combat system offers the spare/rob/arrest/kill choice |
| `combat:yieldChoice` | The decision (the combat system applies `rpg/yield.ts`: Pietas, Fama, the purse, crime) |
| `combat:knockout`, `combat:fled` | A knockout (with its duration), a successful flight |
| `combat:callHelp`, `combat:assault`, `combat:brawlEscalated` | For the NPC and crime modules |
| `combat:playerDefeated` | `death`, `knocked-out`, `brawl-lost`, `saniarium`, `saniarium-no-purse`: game flow decides what happens next |
| `combat:playerYielded` | Hold Y: `brawl` (fight over, −10 % purse), `arena` (missio roll), `arrest` (open the arrest dialogue) |
| `combat:bout`, `combat:favor`, `combat:phase`, `combat:lock` | Arena bout start and end (with the purse), favor changes, boss phases, lock-on |

Sound goes out as `sfx` events (`swing.*`, `clash.metal`, `block.shield`, `block.metal`,
`hit.flesh`, `hit.punch`, `vox.grunt/pain/death.m|f`, `body.fall`, `weapon.draw/sheathe`,
`cloth.rustle`). Spawned enemies get footsteps when audio is installed.

### Settings (all optional, declared in `src/combat/settings.ts`)

`combatDifficulty` (default `normalis`), `combatSimplePower`, `combatPowerHold` (0.2–0.6 s,
default 0.35), `combatParryWindow` (accessibility override in seconds), `combatShake` (`third`, the
default per §4.4 = off in first person; `on`; `off`), `combatLockOn` (`suggest` is the default:
drawing a weapon with a hostile within 8 m locks on; `manual`; `auto`), `combatSpaceAlwaysJumps`,
`combatHitStop`, `reduceFlashing`. Hold or toggle block is the core setting `blockToggle`.

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
in the arc, otherwise the most central hostile, and touches a bystander only when no hostile is
there (AC-22). A kneeling, yielded fighter is struck only on purpose: with a power attack, or while
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

**Parry and riposte.** Every block press opens the window (0.20 s on Normal, 0.40 Tiro, 0.30
Facilis, 0.14 Difficilis, 0.10 Herculea, +0.06 with Practised Parry, or the accessibility
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

**Hit-stop and shake.** Blows involving the player set `game.timeScale` to 0.1 for 0.05 s (light),
0.08 s (power) or 0.12 s (parry, riposte, finisher), restored on real time. `CameraRig.shake` gets
0.02, 0.05 or 0.08 m, decaying over 0.22 s (in third person only by default).

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
for 20 s). Guards are pre-emptive (spells of 1–3 s for blockSkill × 0.6 of the time) and reactive:
when the target steps into reach facing the NPC, chance blockSkill (−30 % when tired) after the
reaction time, held until the NPC attacks or tires. A power wind-up can also be read and guarded,
and elites, champions and bosses parry (blockSkill × 0.4). It moves only through
`Actor.locomote` and faces its target (slower during its own wind-up, so a dodge works).

`AttackTokens` hands out at most 1 (Tiro), 2 (Normal) or 3 (Difficilis) tokens per target. Bosses
cost 2, though a lone boss may still attack on Tiro. The longest waiter is served first, and a
holder gives its token back after its turn of 1–3 attacks or 4.5 s.

**Nereus (`nereus.ts`, §13.2).** 300 HP, AR 7 cloth, a practice trident (8 blunt, 1.8 m), skill 60,
poise 150, reaction 0.25 s, block 0.45 weapon-only, intervals of 1.6, 1.3 and 1.1 s by phase,
2 tokens, a lusio.
- **Phase 1:** a net every 12 s (first at 4 s) within 2.2–6 m. The 0.8 s twirl telegraph (a red
  screen-edge pulse and a grunt) is followed by a 14 m/s cast that entangles for 3 s. Each F or E
  press takes 0.4 s off, the shield still blocks but there is no parry, and his first follow-up is
  a power poke with a wind-up of at least 0.8 s.
- **Phase 2 (75 %):** faster (speed ×1.1), feints, and a sand kick every 9 s that blinds for 1 s.
- **Phase 3 (45 %):** he loses the net; more power lunges (50 %) and the wooden dagger up close.
- **15 %:** he yields, and the missio choice opens. Phase barks appear as subtitles.

### [design] choices beyond the GDD

- **Counter timing.** With chance blockSkill, an NPC whose attack is due waits up to 1.5 s for the
  target's swing to land rather than swinging into its wind-up. Without this, a *miles* traded blows
  with light-attack spam and blocked only about 30 %.
- **Struck while unguarded.** Being hit with the guard down re-rolls the reactive guard (like
  stepping into reach does).
- **Movement while fighting.** The player moves at ×0.7 while guarding, ×0.6 while charging and
  ×0.45 mid-swing; NPCs plant their feet while striking. The §6.6 ×0.85 run in combat is applied.
- **Engage spacing.** NPCs engage at no closer than 1.15 m (a dagger's reach would make them hug).

## Verified (scripts/shot.mjs and Vitest)

- **AC-07 block rates** (a 20 s scripted duel with F every 0.15 s from within reach, 3 seeds):
  *miles* 42 %, 53 % and 44 %; thug 15 % and 12 % (a third run ended early when the thug fled
  after an opening sneak attack).
- **AC-07 tokens:** 1 vs 4 grassatores gives at most 2 attackers at once on Normal and 1 on Tiro;
  the others circle (in-game histogram and `tests/combat-ai.test.ts`).
- **Nereus:** nets entangle (screenshots of the drape and the IRRETITVS prompt), phases at 73 % and
  45 %, and the yield at exactly 15 % (Vitest). Struck down while yielded, the bout ends once.
- **AC-06:** light chain, held power attack, hold and toggle block (§4.2 timings), parries 6 of 6 with
  taps 0.12 s before impact, riposte ×2, bash, Space and Option dodges (Space doesn't jump in
  combat), lock-on with cycle and hold-release, R, V mid-fight (AC-04), hold Y.
- Runs in Chrome (Metal) and WebKit without console errors. 41–62 draw calls in the arena.
  `?scene=arena&site=rome` fights inside the city at the Ludus Magnus (265 draw calls).

## Shared-file changes

- `src/core/Input.ts`: the actions `dodge` (Option), `parry` (unbound), `lockOn` (X) and `yield` (Y).
- `src/player/PlayerController.ts`: the `canJump` and `motionOverride` hooks.
- `src/player/CameraRig.ts`: `framingDistance` for lock-on.
- `src/ui/menus/ControlsScreen.ts`: labels for the new actions.
- `src/ui/types.ts` (`BossView.phases`), `src/ui/hud/Bars.ts`, `Hud.ts` and `hud.css`: boss phase
  pips (both edges of the centre-shrinking bar) and `hud.flashBar(kind)` for a refused cost.

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
- **Hooks left to other modules.** No loot container UI (`combat:death` carries everything a body
  container needs). Player death, knockout and Saniarium outcomes are events for game flow (the
  arena scene revives you after 4 s).
- **AC-08 fight length** (3–6 minutes) needs the owner's playtest. With god-mode light spam, Nereus
  yields in about 30 s, but a real fight is mostly blocking and dodging his pokes (≈22 damage each
  on Normal).
- **Control presets.** The Mouse/Trackpad/Keyboard-only presets (click-to-attack off, auto-lock)
  belong to the settings screen. Combat reads `combatLockOn` and `blockToggle`.
