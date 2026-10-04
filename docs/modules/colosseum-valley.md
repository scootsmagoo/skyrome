# Colosseum valley landmarks (prefix `colos-`)

The amphitheatre and everything round it in AD 113: the gladiator schools, the Meta Sudans, the
baths on the Oppian over the buried Golden House, the Caelian with the Claudianum, and the service
quarter east of the valley. 21 atlas landmarks, all built by hand. Every builder follows the
landmark contract (`src/world/landmarks/types.ts`): local space, facade to −z, monumental sizes ×
`WORLD_SCALE`, human-scale parts 1:1.

Look at any of them with `?scene=landmark&id=<id>` (`&cam=front|aerial|side|back`, `&hour=H`) or in
the city with `?scene=rome&at=<id>`. `&at=colosseum` lands you on the arena sand.

## Files

| File | Builds |
| --- | --- |
| `builders/colos-kit.ts` | Shared helpers (no builders): `Oval` (an ellipse and its parallel curves, bays at equal arc length), the `InstanceLod` system and `lodInstances()` (repeated pieces as InstancedMeshes with per-instance distance LOD), carved Roman numerals, cheap statues, `ovalPaving` (terrain-following ring paving that stops at a kerb where a hillside rises), `frontSteps`, `plantTrees`, `smokePlume` (a one-draw column of furnace smoke, animated while visible) and `addReadables` (see below). |
| `builders/colos-colosseum.ts` | `colosseum`. |
| `builders/colos-ludus.ts` | `ludus-magnus` (the playable arena), `ludus-dacicus`, `ludus-gallicus`, `ludus-matutinus`. |
| `builders/colos-court.ts` | `courtyardBuilding()`: ranges of rooms round a court with portico and gallery, gates, shop fronts and furnished enterable rooms (armoury, infirmary, office, shrine, mess, forge…). Used by the schools, the camps, the mint, the watch station and the Curiae. |
| `builders/colos-fountains.ts` | `meta-sudans` (animated water film), `lacus-orphei`. |
| `builders/colos-baths.ts` | `baths-trajan`, `baths-titus`, `sette-sale`, `domus-aurea-buried`. |
| `builders/colos-caelian.ts` | `temple-divus-claudius`, `arch-dolabella`, `castra-peregrina`, `macellum-magnum`, `statio-vigiles-v`. |
| `builders/colos-quarter.ts` | `castra-misenatium`, `moneta`, `curiae-veteres`, `porticus-liviae`, `domus-plinii`. |
| `tests/colos-builders.test.ts` | Every id builds on the real terrain with valid colliders and unique spots; triangle budgets; the spots the gameplay team relies on; a "thing" at every tier-1 landmark. |
| `tests/colos-walk.test.ts` | The real character controller walks the routes: plaza → arena by both long-axis gates, passage → imperial box, vomitorium → first balteus; the podium can't be climbed; the Ludus gate, its unclimbable arena wall and the stairs to the stands. |

## The Flavian Amphitheatre

Every ring is a curve parallel to the arena ellipse (43 × 27 m real at the podium), so ring widths
stay constant and the facade lands on 188 × 156 m. 80 bays per ring at equal arc length; bays 0,
20, 40, 60 sit on the axes (Libitinensis E, imperial S, Triumphalis W, editor's N) and the other
76 carry their carved red numerals I–LXXVI.

- **Facade:** Tuscan, Ionic and Corinthian half-columns, arches 4.2 × 7.0 / 6.4 m, parapets and
  statues (marble on II, bronze on III) in the upper arches, the attic with Corinthian pilasters,
  alternating windows and gilded shields, 240 corbels and velarium masts. Smooth travertine (the
  pockmarks are medieval). Four axial porches; the west one carries the dedication in bronze
  letters (CIL VI 40454a).
- **Velarium:** canvas strips on ropes from the masts towards an open oval over the sand, ropes
  down to the cippi. On 11 May the north arc is furled (`velariumFurled`), which also opens the
  bowl to the view from the Oppian.
- **Inside:** two vaulted ambulatories (stuccoed vaults, red dado), the inner arcade, ring 3 with
  doors; the shrine of Nemesis (Nemesis Augusta, doors shut for the Lemuria) by the Porta
  Triumphalis; four walkable vomitoria up to the first balteus; the cavea (podium terrace and 3
  senatorial rows, maenianum primum 8 rows, secundum 8 rows, summum in ligneis 6 timber rows,
  aisles of 0.21 m half steps, flights at each balteus wall), the porticus in summa cavea; the
  imperial box (S) and the editor's box (N) on the podium with stairs up from the short-axis
  passages; the long-axis passages onto the sand; the arena of sand over boards with the hypogeum's
  iron-strapped trapdoors and gratings (the hypogeum itself is a later dungeon).
- **Plaza:** travertine paving out to the ring of 160 cippi, ending at a kerb where the Oppian
  slope rises; eight sellers' pitches (sausages over braziers, cushions for hire, wine, clay lamps),
  the Misenum sailors' rope coils, torch brackets at the axial porches.
- **Performance:** the 80 bays of each storey, the inner arcade, statues, top colonnade and cippi
  are LOD-instanced (near detail only within ~34 m of a bay); a zone test hides what can't be seen
  (the bowl from the outside beyond the plaza, the shell from inside the bowl, the ambulatories from
  the cavea). About 140k triangles drawn with the camera far away, a 3.6k-triangle far stand-in
  beyond 1.5 km. In `?scene=rome` the whole valley in view stays around 0.9–1.6M triangles and
  400–800 draw calls including the shadow pass.

## The Ludus Magnus (v0.0 playable arena)

Trajan's brick school: three storeys of cells round a porticoed court almost filled by the practice
arena (sand ellipse 23.8 × 38.8 game m; a 2.8 m marble podium with a painted frieze, a balustrade
the player can't climb or jump, two gates on the long axis), five rows of seats, stairs up the back
wall to the top walk, awnings on masts over the long sides, the procurator's tribunal under a
pediment on the east side and the gladiators' bronze statue of Trajan (with its dedication) on the
west, facing it. The sand is clear: the pali stand in the court. The court has the corner
fountains, weapon racks, the fighters' corner (trough, bench, water jars) by the front arena gate,
the armoury, the lanista's office, the infirmary, the shrine of Nemesis, the mess and the forge, the
tunnel stair towards the amphitheatre, and the gladiators' graffiti on the back portico (content
T4). The street front has LVDVS · MAGNVS over the gate, torches and a painted notice.

## The other heroes

- **Meta Sudans:** marble cone on a drum with eight spouting niches in its 16 m basin; the water
  film runs down the cone (`waterSheetMaterial`, animated by the module's LOD system). Round it:
  the `lacus-metae` drinking basin, a plastered notice wall with the playbill for the games of
  18 May (content T7), the fan parties' standing spots and a loose paving slab (street cache).
- **Baths of Trajan:** walled garden with porticoes, libraries, the great hemicycle over the
  Golden House, and the bath block: porch with Trajan's dedication of 109, the natatio with its
  columnar screen, the enterable frigidarium (three groin vaults on eight granite columns), the
  caldarium projecting SW, palaestrae; smoke from the furnace stacks drifts over the garden (also
  over the Baths of Titus and the mint).

## Spots and readable inscriptions

Spots (`LandmarkBuild.spots`) use the landmark's prefix (`colos-`, `ludus-`, `meta-sudans-`,
`trajan-`, `titus-`, `claudium-`, `dolabella-`, …), except the ids the brief named (`lanista`,
`armory`, `medicus`, `spectator-N`). The Ludus also carries aliases under the content bible's
location ids (`ludus-cavea`, `ludus-armamentarium`, `ludus-saniarium`, `ludus-cellae`), and the
Meta Sudans has `lacus-metae`, so NPC schedules can point at them directly.

`addReadables()` makes inscriptions readable now: looking at one within reach shows **Read** and
the interact key opens the text (Latin as cut, translation, a line of context) in the UI's book
reader. Wired: the Colosseum dedication and the shrine of Nemesis; the Ludus gate, its painted
notice, the graffiti and Trajan's statue base; the Meta Sudans playbill; the Baths of Trajan and of
Titus; the Arch of Dolabella. It is a no-op without `game.interactions` (tests, scenes without the
interaction system). If the gameplay team builds a generic reader for `inscription` spots, drop the
`addReadables` calls; the spot ids match.

## Shared-file changes

- `src/world/rome/buildRome.ts` (`landmarkPads`): landmarks with `siting: 'underground'` (the
  buried Domus Aurea) no longer flatten a terrain pad.

## Known limits

- The plaza's outer ring lies partly on the terrain pad's blend zone (pads are flat to 1 m past the
  atlas footprint, then blend over 14 m). Where the Oppian rises the paving stops at a kerb. A
  per-landmark pad surround in `landmarkPads` (e.g. +20 m for the Colosseum) would let the whole
  ring lie flat.
- The cavea is empty (no games until 18 May). A crowd for game days belongs to the NPC module; the
  seats have `sit` spots.
- The hypogeum, the Domus Aurea and the Ludus tunnel are entrances only (later dungeons).
