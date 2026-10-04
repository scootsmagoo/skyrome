# River district landmarks and the Tiber bridges

The landmarks between the Capitol, the Palatine and the Tiber, Tiber Island, the Theatre of
Marcellus with its neighbours on the southern Campus, and every bridge standing in AD 113. All
builders follow the landmark contract (`src/world/landmarks/types.ts`): local space, facade to −z,
monumental sizes × `WORLD_SCALE`, human-scale parts 1:1.

Open `?scene=river` for the whole district on the real terrain with a stand-in water sheet
(`&at=<landmark or bridge id>` to spawn there, `&far=1` for every bridge over the whole city
terrain, `&water=0` to hide the sheet, `&cam=x,y,z,tx,ty,tz` for a fixed camera). Single landmarks
work in `?scene=landmark&id=…` as usual.

## Files

| File | Builds |
| --- | --- |
| `src/world/landmarks/builders/river-kit.ts` | Shared helpers: local/atlas conversion with water and bed heights (`riverEnv`), neighbour footprints, road and bridge corridors for open squares to leave free, fitted kit temples and frieze dedications, altar, gable and shed roofs, river boats (caudicaria barge, scapha, punt), oxen, Hercules statue, fences, a cheap colonnade (≈ 60 triangles a column), far stand-ins. |
| `river-boarium.ts` | `temple-portunus` (Ionic tetrastyle pseudoperipteral, stuccoed, Portunalia notice), `temple-hercules-victor` (tholos of 20 fluted Corinthian columns on a crepidoma, door east), `ara-maxima` (tufa platform, altar, bronze Hercules). |
| `river-port.ts` | `forum-boarium` (paved square, bronze bull of Aegina, cattle pens with oxen, butchers and hawkers, the sealed stone chamber), `portus-tiberinus` (quay wall and deck, mooring stones, paired water stairs, treadwheel cranes, cargo, storerooms, harbour office, moored barges), `cloaca-maxima-outlet` (headwall at the waterline, three rings of voussoirs, ledge and stair down to the iron grating). |
| `river-holitorium.ts` | `forum-holitorium` (vegetable market: stalls under awnings, mensa ponderaria, lacus, aediles' edict, strongbox), `temple-janus-holitorium`, `temple-juno-sospita`, `temple-spes` (peripteral, fitted to their footprints, altars), `columna-lactaria`. |
| `river-marcellus.ts` | `theatre-marcellus` (see below). |
| `river-campus.ts` | `temple-apollo-sosianus`, `temple-bellona`, `columna-bellica`, `porticus-octaviae`, `circus-flaminius`. |
| `river-island.ts` | `temple-aesculapius` (with the incubation portico), `island-prow`, `island-obelisk`. |
| `src/world/bridges/` | `buildBridges()` (index), pure layout (`layout.ts`), per-bridge data (`specs.ts`), geometry (`geometry.ts`). |
| `src/scenes/river.ts` | The dev scene. |
| `tests/river-bridges.test.ts` | Layout maths and walkability of the bridges on the real terrain. |

## Theatre of Marcellus

41 travertine bays on the front semicircle (the kit's `ellipticalArcade`, 82 bays round, bays
41–81) in three storeys: Doric with triglyphs, Ionic on pedestals, and an attic with Corinthian
pilasters, windows and velarium masts (32.6 m real). Behind it a vaulted ambulatory with a
reticulate ring wall, then a semicircular cavea swept from the kit's `caveaSection` (1:1 seats,
0.44 × 0.7 m; two tiers and a praecinctio), a colonnade in summa cavea, the marble orchestra, the
stage (1.25 m, niche front, steps at both ends), a two-storey scaenae frons in coloured marbles
with the royal and guest doors, a sloping stage roof, the side halls with the tribunals over the
vaulted aditus, the stage building and a portico toward the river.

**Walk in:** through any facade arch into the ambulatory, round to either end, into the aditus and
the orchestra; the six aisles (0.22 m half-steps, flights of 0.2 m over the praecinctio wall)
climb to the top walk. Every row, aisle step, the ring wall and the portico have box/cylinder
colliders (≈ 1,700), tested by walking from the orchestra to the top.

## Bridges

`buildBridges(game, atlas, hm, opts?)` builds every atlas bridge and publishes them on
`game.bridges` (`PlacedBridge`: object, layout, ends, world-space spots). The optional `opts`
(`only`, `highDetailBounds`) is for test scenes; buildRome's call is unchanged.

Layout (`layoutBridge`, pure and tested), in the bridge's own axis frame:

1. Sample the ground along the axis; the **wet interval** is where it lies below the water.
2. Lay the historical arcade (`specs.ts`: spans, piers, rise ratio, flood openings) centred on the
   channel, widening the spans if the river is wider, or narrowing them (to 75 % at most) if the
   arcade would run far up the banks.
3. The **deck** is the lowest surface that clears every arch (extrados + 0.35 m fill) and a gentle
   hump over the arcade, with a grade of at most 0.19 (≈ 11°): a "cone envelope" of those
   requirements, smoothed. Where it still stands above the ground at the atlas ends, **ramps**
   carry on into the streets until they meet the ground.

Stone bridges are one extruded elevation (deck line, ramps and abutments down to the ground,
intrados arcs and piers, flood openings as holes) in tufa or peperino, with travertine arch rings,
keystones, imposts, pointed cutwaters with sloping hoods, a string course, parapets (1.08 m) and a
basalt deck. The Pons Fabricius carries its dedication on both faces at both ends and the
consuls' approval of 21 BC on the parapet, and a pair of herms at the island end [C]. The Pons
Sublicius is all timber (pile bents with battered outer piles, pegged cross-bracing, cap beams,
stringers, planking, rails) with no metal at all; its crown carries the `argei` spot for the
ritual of the Ides of May. The Pons Mulvius lies 2.4 km north of the modelled terrain and is laid
out over a synthetic river section (banks at the atlas bank height).

Colliders: tilted box per straight run of the deck (invisible, 0.6 m thick), parapet slabs,
end posts, piers and cutwaters, solid boxes under ramps and abutments.

| Bridge | Arches (real spans) | Triangles |
| --- | --- | ---: |
| Pons Fabricius | 2 × 24.5 m, flood arch in the pier | 2.9k |
| Pons Cestius | 23.65 m + two small side arches | 2.7k |
| Pons Aemilius | 6 (17–23 m), flood openings in the piers | 5.0k |
| Pons Sublicius | timber trestle | 4.9k |
| Pons Agrippae / Neronianus / Mulvius | 5 / 5 / 6 | 2.6k / 2.6k / 3.5k (low detail) |

## Spots (`LandmarkBuild.spots`, kinds from the brief)

Every landmark has at least one "thing" (GDD §12.3). Highlights: inscriptions to read (Portunalia
notice, Hercules Victor dedication, the theatre's playbill for the Ludi Apollinares and the
stage-restoration panel, the Fabricius inscriptions, the frieze dedications of the Holitorium
trio, Apollo, Bellona, Jupiter Stator and Juno Regina, the Turma Alexandri base, the mensa
ponderaria, the aediles' edict, the island ex-voto), vistas (bridge crowns, the summa cavea, the
prow's bow, the propylon steps, the bull, the metae), shrines (altars, the War Column, the
Columna Lactaria, the sealed chamber in the Forum Boarium, the Argei on the Sublicius), doors
(the theatre, the cloaca grating — the sewer dungeon's entrance, temple cellae, the libraries,
the storerooms), containers (strongbox, votive shelves, cargo), NPC and vendor posts (drovers,
butchers, crane crews, the harbour master, wet-nurses, incubants, librarian), seats in the cavea.

## Triangles (high / low detail, from the builders)

| Landmark | High | Low | Notes |
| --- | ---: | ---: | --- |
| theatre-marcellus | 158k | 126k | far stand-in 0.2k, cull 1100 m |
| porticus-octaviae | 152k | 81k | far stand-in, cull 900 m |
| temple-hercules-victor | 167k | 19k | kit tholos at high detail (20 fluted Corinthian columns) |
| temple-portunus | 107k | 13k | |
| forum-holitorium / forum-boarium | 49k / 47k | 23k / 20k | stalls, pens, plazas |
| circus-flaminius / portus-tiberinus | 38k / 26k | 21k / 11k | |
| Holitorium trio, Apollo, Bellona, Aesculapius | 9–19k each | same | M fidelity (GDD §12.1), low-detail kit temples |
| ara-maxima, cloaca outlet, prow, columns, obelisk | 0.2–4k | | |

The whole district from the air in `?scene=river`: about 175–380 draw calls and 0.6–1.4M
triangles depending on the view, 60 fps (M4 Max, Chromium).

## Integration notes

- **Water.** `buildWater` is still a stub; the river scene shows a flat stand-in sheet at
  `hm.waterLevelY`. Bridges, boats, the quay stairs and the cloaca use `hm.waterLevelY` too.
- **Quays.** The Portus Tiberinus builds its own quay wall and deck unless the heightmap already
  carries stone quays (`hm.features.quays`, from the terrain module's riverbanks): then it only
  dresses the terrain's quay (cranes, cargo, storerooms, stairs, boats, mooring stones).
- **Open squares** (`forum-boarium`, `forum-holitorium`, `circus-flaminius`) pave their footprint
  minus the neighbours' footprints, the atlas road corridors (for the street builders) and the
  bridges' real extents, with a trimesh collider 0.1 m over the terrain.
- `spawnAtLandmark(game, 'portus-tiberinus', 18)` (buildRome's helper, used by `?scene=rome&at=`)
  lands in the river, because the landmark's centre is on the waterline and its facade faces the
  water; the builder publishes a `portus-tiberinus:quay` spawn spot on the quay instead.
