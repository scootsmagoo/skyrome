# Forum Romanum and the Velia

The landmark builders for the heart of the v0.0 slice: the Forum square and its monuments, the
lower Forum round Castor and Vesta, the Capitoline end (Tabularium, Dei Consentes, Carcer), the
Velabrum edge (Horrea Agrippiana, Domitian's vestibule) and the upper Sacra Via over the Velia to
the Arch of Titus and the Colossus. 37 atlas ids, all in `src/world/landmarks/builders/forum-*.ts`.
Open one with `?scene=landmark&id=<id>&cam=front|aerial|side|back|inside`, or walk the whole core
with `?scene=rome&at=<id>`.

## Files

| File | What it builds |
| --- | --- |
| `forum-square.ts` | The Golden Milestone (which also paves the whole Forum, see below), the Rostra with its rams, statues and Duilius' column, the Umbilicus and the mundus stone, the Lapis Niger, the Volcanal, the Lacus Curtius (Marsyas, the sacred trees, Naevius' bronze letters), the empty site of Domitian's horse (a loose slab: a cache), Venus Cloacina with the Cloaca grate, the Servilian basin, Janus Geminus with its doors open |
| `forum-life.ts` | Everyday life on the paving: Vortumnus, the Acta Diurna board, the litter stand, the Cloaca grate by the Basilica Paulli, the Urban Cohorts' post, a garland seller, a bookseller, a scribe, the Columna Maenia, the Puteal Libonis and the praetor's tribunal, lamps, 20 crowd spots |
| `forum-temples.ts`, `forum-temple.ts` | Saturn (the aerarium door), Vespasian and Titus, Concord, Divus Augustus, Divus Iulius (altar, Actian rams, the star), Castor and Pollux (strongrooms, the deposit vaults' open door, the Lemuria fillet), Jupiter Stator; `forumTemple()` and the arcade/roof helpers |
| `forum-basilicas.ts` | Basilica Iulia (steps with gaming boards and a chalked lampoon, enterable court, back shops) and Basilica Paulli (portico, money-changers' shops, notices) |
| `forum-curia.ts` | The Curia (enterable hall, Victory and her altar) and the Carcer |
| `forum-vesta.ts` | Vesta (the fire), the Regia, the Atrium Vestae (porch, court, Vestals, the Sacra Via shops), Juturna |
| `forum-capitol.ts` | Tabularium (gallery vista) and the Portico of the Twelve Gods |
| `forum-arches.ts` | Arches of Titus (reliefs, the causeway of the summa Sacra Via), Augustus, Tiberius; the Fornix Fabianus |
| `forum-velia.ts` | Colossus of Sol, the Velia vestibule, Horrea Piperataria (terrace, spice dealers) and Agrippiana, Porticus Margaritaria, Domitian's vestibule; street edges of the summa Sacra Via |
| `forum-kit.ts` | `landmark()` (near build + low far stand-in), ground helpers (`foundation`, `pave`, `flight`), column tiers, rams, balustrades, altars, pedestals, inscriptions, fires (`addFire`, queued until the light pool exists), `streetEdge()`, atlas/local conversion |
| `forum-figures.ts`, `forum-statue.ts` | Statuary: draped women, Janus, horses (ellipsoid figures) and the lofted heroic nude (Sol, Marsyas) |
| `forum-data.ts`, `forum-reliefs.ts` | The paved area, road gaps, the inscription texts with confidence grades; relief textures |

## Paving and other modules

The miliarium builder paves one polygon, `FORUM_PLAZA` / `forumPavedArea()` (atlas real metres):
the square, the Comitium, the lower Forum up to the Fornix Fabianus, and the Forum mouths of the
Vicus Tuscus and Vicus Iugarius. Streets crossing it get basalt strips at the paving's level.
**The city module should not pave or fill inside it.** Along the summa Sacra Via (Fornix → Arch of
Titus) the Horrea Piperataria and Porticus Margaritaria builders draw sidewalks and retaining walls
(`streetEdge()`), the Atrium Vestae a shop portico with a sidewalk to the kerb, and the Arch of
Titus a causeway over the terrain's 4.5 m step below its pad.

## Street life on the Vicus Tuscus

The player's first walk (Velabrum, Vicus Tuscus, the Forum mouth) used to pass a blank brick flank
and bare ground. Now, along the stretch these builders own (atlas z 84-210, from the plaza's edge
to the end of the Horrea Agrippiana):

- **Horrea Agrippiana**: five tabernae (cloth, victuallers, a wine shop, a shuttered one) built
  against the west flank on a raised floor, with painted fascia signs, awnings, torches on the party
  walls, vendor spots and two porters. The street is only 3 to 7 m from the wall (it narrows toward
  the front corner), so the row takes the southern part and is shallow (2.2 m).
- **Raised walks** (`sidewalk`, 0.3 m crepido, travertine) along the road's east edge by the Horrea
  and its west edge by the Divus Augustus precinct, and a paved **court** (26 m wide, 15 m deep)
  before the Temple of Divus Augustus with lamps, two benches and two people. The walks and court
  are 0.3 m up on purpose: the terrain dressing treats anything under 0.25 m as ground and grew
  grass and trees through thin paving (see Shared files below).
- **Lamps**: lampstands lit at dusk at the shop rows, the Divus Augustus court, the Domitianic
  vestibule's entrance (with two guards), the Velia vestibule, the Margaritaria colonnade (with a
  bench), the Arch of Titus (torches on the passage walls, lamps at both mouths), the Colossus
  (four braziers burning day and night), the Rostra's back stair, the Curia, the Carcer, the
  Tabularium door, the Regia, Saturn, Vespasian, Concord, Janus.

The city module should keep out of the walks and the court (`sidewalk` / `court` are laid in the
landmark builders), and decides the rest of the street: the houses, the west side south of the
Divus Augustus precinct and anything beyond z 210 are its.

## Interactions

`forum-interactions.ts` hands the spots to the game through `game.interactions`, once the services
exist (the same pattern as the river district's `riverLife`):

| Spot kind | Prompt | What it does |
| --- | --- | --- |
| `inscription` (with a text in `FORUM_INSCRIPTIONS`) | **Read** | opens the book reader with the Latin as carved, the English, the grade [A]/[B]/[C] and the note |
| `vista`, and the `shrine`s and `door`s in `FORUM_LOOKS` | **Look**, **Honour**, **Look inside** | a line of what the view or the thing shows, as a subtitle |

Interaction ids are `forum:read:<spot id>` and `forum:look:<spot id>`. The quest team keeps working
on the spot ids (`castor-strongroom`, `aerarium-door`, `carcer-door`, `tabularium-door`,
`curia-julia`…): register your own interactable at the spot (`game.landmarks.get(id).spots`, world
space) and remove the flavour one with `game.interactions.remove`.

## Spots

`landmark()` settles every standing spot (npc, vendor, stall, spawn, door, shrine, inscription,
vista, container) before handing it over: its height snaps to the floor under it (a box top within
a step, or the terrain plus the paving laid there) and a spot inside furniture, a pier or a counter
moves to the nearest free point within 1.2 to 2.2 m. `tests/forum-world.test.ts` builds every
landmark on the real heightmap and fails when a standing spot overlaps a collider of any Forum
landmark, floats, or stands on a cliff. Shop vendors therefore stand beside their counters.

Every landmark exposes `spots` (kinds `inscription`, `vista`, `shrine`, `container`, `door`, `npc`,
`vendor`, `spawn`, `sit`, `stall`). Inscription spot ids are keys of `FORUM_INSCRIPTIONS`, which
gives the Latin, an English translation and a confidence grade ([A] surviving text, [B] attested in
substance, [C] the game's). Spots for CONTENT.md: `castor-strongroom` (door of `castor-loculi`, W
flank), `castor-aedituus`, `castor-chrysippus`, `castor-libaria`, `signum-vortumni`,
`lectica-statio-forum`, `curia-forecourt` (street level, at the foot of the Curia's stair: content's `curia-julia:front`), `cloaca-grate-aemiliae`, `statio-cohortium-urbanarum`,
`tabernae-aemiliae-notice` (T10), `basilica-iulia-lampoon` (T5), `rostra-orator` (the crier),
`spawn-sacra-via` (v0.0 spawn by the Arch of Titus).

## Atlas notes

- **Arch of Tiberius**: the atlas sets its passage on the Temple of Saturn's shut aerarium door
  (2.6 m from the flank, a dead end). The atlas point lies on the Vicus Iugarius, so the arch is
  turned 81 degrees (passage along the street, facade to the Forum) and set 1.5 m off Saturn's
  flank (`turned()` in forum-kit): the player can walk through it between the Basilica Iulia and
  Saturn.
- **Janus Geminus** stands 1.5 m west of the atlas point, clear of the Basilica Paulli's steps.
- **Temple of Jupiter Stator**: the atlas point is in the gully at the head of the Clivus Palatinus,
  so the temple shows only once the player turns up the clivus (it stands at the end of the road
  with its steps and cheeks, and from a distance). Moving it 12 m west would put it on open ground;
  that is an atlas change.
- **Tabularium** sits on the Capitoline slope (its landmark has no pad): the origin is the saddle,
  the Forum-level foot 14 m below. The door opens on the flat foot, west of where the cliff climbs.

## Budgets

High detail, triangles per landmark (unit-tested, the near level): heroes under 150k (Castor 123k,
Basilica Iulia 106k, Saturn 69k, Vesta 61k), the rest under 100k. Every landmark over 12k triangles
with a far stand-in has **three tiers**, a `THREE.LOD` inside the landmark object: the full near
build, then (beyond the landmark's radius plus 48 m, 56 for Castor, 65 for the basilicas) a **mid**
tier (the far build with 12-sided stand-in columns on bases, about 100 triangles each: no
interiors, no shop contents, no inscriptions; Castor 123k to 7k, Basilica Iulia 106k to 33k, Saturn
69k to 3k, Atrium Vestae 96k to 13k), then, beyond the `near` distance (110–170 m from the
surface), the 'low' far stand-in of the world registry. In
`?scene=rome` at street level in the Forum: about 800–1,150 draw calls and 1.6–2.4M triangles
(the plaza centre 1.7M), 60 fps on an M4 Max.

## Shared files touched

- `src/world/terrain/dress.ts` (terrain dressing): (1) one physics step before the built-over probe,
  because Rapier's ray queries see only colliders a step has put in the broad phase, so the probe was
  blind to every landmark; (2) a surface that is not the terrain's own heightfield and stands 4 cm
  above the ground (paving, kerbs, steps) now counts as built-over (it was 25 cm), so grass and trees
  no longer grow through the Forum's paving.

## Tests

`tests/forum-landmarks.test.ts` (each landmark on a flat plane: budgets, spots, walks into the
Curia, the Basilica Iulia and up the Rostra), `tests/forum-world.test.ts` (all Forum landmarks on
the real heightmap: spots clear of colliders, and the golden path walked by the real Actor:
Vicus Tuscus to the Forum mouth, across the square and up the Rostra's back stair, through the Arch
of Tiberius, along the Sacra Via to the Arch of Titus), `tests/forum-interactions.test.ts` (every
inscription reads, every vista has a line, the prompts reach `game.interactions`).
