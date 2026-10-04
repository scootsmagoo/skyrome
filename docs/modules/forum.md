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

## Spots

Every landmark exposes `spots` (kinds `inscription`, `vista`, `shrine`, `container`, `door`, `npc`,
`vendor`, `spawn`, `sit`, `stall`). Inscription spot ids are keys of `FORUM_INSCRIPTIONS`, which
gives the Latin, an English translation and a confidence grade ([A] surviving text, [B] attested in
substance, [C] the game's). Spots for CONTENT.md: `castor-strongroom` (door of `castor-loculi`, W
flank), `castor-aedituus`, `castor-chrysippus`, `castor-libaria`, `signum-vortumni`,
`lectica-statio-forum`, `cloaca-grate-aemiliae`, `statio-cohortium-urbanarum`,
`tabernae-aemiliae-notice` (T10), `basilica-iulia-lampoon` (T5), `rostra-orator` (the crier),
`spawn-sacra-via` (v0.0 spawn by the Arch of Titus).

## Budgets

High detail, triangles per landmark (unit-tested): heroes under 150k (Castor 123k, Basilica Iulia
95k, Saturn 68k, Vesta 61k), the rest under 100k. Big landmarks swap to a 'low' far stand-in
beyond 110–170 m. In `?scene=rome` at street level in the Forum: about 600–950 draw calls and
1.9–2.4M triangles, 60 fps on an M4 Max.
