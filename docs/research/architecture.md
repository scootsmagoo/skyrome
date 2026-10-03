# SKYROME: Architecture & Visual Reference (Rome, spring–summer AD 113)

> A builder's reference for the procedural geometry, materials, character and lighting code.
> Scope: the city of Rome in AD 113 (866 AUC), under Trajan. Version 1, 2026-10-03.
> Sister docs (topography, history, gameplay) own **positions**. This doc owns **shapes, sizes, colours and looks**.
> Where they disagree on a position, trust the topography doc. Where they disagree on a shape, trust this one and flag it.

---

## 0. Conventions and quick rules

### 0.1 Units and notation

| Symbol | Meaning |
|---|---|
| m | Real metres, as built. Multiply landmark and layout values by `WORLD_SCALE = 0.6` at build time (see §0.3). |
| RF | Roman foot (*pes*) = **0.296 m** (*pes monetalis*, 0.2957 m). 1 *passus* = 5 RF = 1.48 m. 1 Roman mile = 1,000 *passus* ≈ 1,480 m. |
| D | Lower diameter of a column shaft, measured just above the base. The proportions of the orders are given in D. |
| Axes | +x = east, +z = south, +y = up (north is −z). "Faces N" means the front looks toward −z. |
| Confidence | **[A]** measured remains or explicit ancient testimony. **[B]** standard scholarly reconstruction with some uncertainty. **[C]** informed guess for the game; replace it if better data turns up. |
| Hex colours | sRGB **albedo** (unlit base colour). In three.js with `ColorManagement.enabled = true` (the default since r152), `new Color('#rrggbb')` converts sRGB to linear for you. |

### 0.2 The ten rules (read these if nothing else)

1. **Rome in 113 was not all white marble.** Most of the city was brick-faced concrete, stucco (white, ochre and red), timber and terracotta roofs. Public monuments in gleaming white or coloured marble stood out from that, and gilded bronze flashed on the roofs of the greatest of them.
2. **The monumental silhouette** is a podium band, a vertical rhythm of columns, a heavy entablature casting a deep horizontal shadow under the cornice, a low pediment (12–15°) and **statues along the rooflines** (quadrigas, Victories, acroteria). Roman skylines bristled with bronze figures.
3. **Ground floors are shops.** Almost every street frontage is a row of *tabernae*: wide openings with wooden shutter boards, and a small mezzanine window above.
4. **There are no chimneys.** Smoke leaks from windows, eaves and roof vents. Columns of smoke rise from bath furnaces, bakeries and cookshops.
5. **Streets** are paved with dark basalt polygons and lined with raised kerbed sidewalks. Porticoes and colonnades run along many of them. **No wheeled carts by day** (§5.1), so daytime traffic is pedestrians, litters, porters and pack mules.
6. **Men are clean-shaven, with short hair combed forward into a straight fringe** (the Trajanic look). Beards mark mourners, philosophers, foreigners and youths before their first shave.
7. **The toga is formal wear** (forum, courts, games, salutatio). Most people on the street wear belted tunics in undyed and earthy colours, with the occasional bright dye.
8. **New buildings gleam.** Trajan's Forum (112), the Column (May 113), the Baths (109) and the rebuilt Temple of Venus Genetrix (May 113) are brand new. Republican temples are older stucco over tufa. Insulae get soot streaks and patched stucco.
9. **There are building sites everywhere:** the Pantheon site (burned 110), the Trajanic finishing works, scaffolding, treadwheel cranes, ox-carts of stone parked outside the centre until dusk.
10. **Avoid the anachronisms in §8.** The most likely mistakes are the Arch of Constantine, the Arch of Septimius Severus, the Temple of Venus and Roma, a finished domed Pantheon, the Aurelian Walls and the Colossus standing next to the Colosseum.

### 0.3 WORLD_SCALE = 0.6: what to scale and what to keep at 1:1

| Element | Rule |
|---|---|
| Landmark footprints, heights, column D and H, arch spans, distances between landmarks, hills and the river | ×0.6 |
| Stairs on landmarks (temple stairs, podium flights) | Compute the scaled total rise, then **regenerate the steps at human scale**: riser 0.16–0.22 m, tread ≥ 0.28 m. Visual "giant" stylobate steps (0.3–0.5 m) may scale, but add a walkable stair or ramp collider. |
| Doors players and NPCs pass through | Minimum clear opening 1.0 × 2.2 m for single doors and 1.8 × 2.6 m for double doors. Monumental doors may scale but never below 2.6 m tall. |
| Theatre and amphitheatre seating | Regenerate at 1:1: riser 0.40 m, tread 0.70 m. Row count = scaled cavea height / 0.40, so there are fewer rows than in reality, which is fine. |
| Parapets, balustrades, counters, benches, latrine seats | 1:1 (parapet 1.0–1.1 m, counter 0.9–1.0 m, bench 0.45 m) |
| Generic insulae, domus, tabernae, street widths | 1:1 |
| Props, vegetation, people | 1:1 |

**Caveat:** with landmarks at 0.6 and insulae at 1.0, the scaled Colosseum (≈29 m) is only 1.6× the height of a 5-storey insula (17.7 m), against 2.7× in reality. **Recommendation:** within about 150 m (scaled) of a major landmark, generic blocks should be 2–4 storeys. Keep the 5-storey, 60 RF blocks for the dense quarters (Subura, Trastevere, the Aventine slopes, the Vicus Tuscus and Argiletum backstreets).

---

## 1. The classical orders as built in Imperial Rome

The orders were Roman practice c. AD 100 (Flavian and Trajanic), not textbook Greek. Vitruvius (Augustan) is the classic rulebook, but Imperial buildings run slenderer and richer than he prescribes. **Corinthian is the default** for anything important in AD 113. Tuscan and Doric appear on ground storeys, utilitarian porticoes and the Column. Ionic appears on Republican temples, upper storeys and some basilicas.

### 1.1 Master proportion table (in D; Roman Imperial practice, Vitruvius in brackets)

| Quantity (×D) | Tuscan | Doric (Roman) | Ionic | Corinthian | Composite |
|---|---|---|---|---|---|
| **Column height** (base + shaft + capital) | 7 [Vitr. 7] | 7.5–8 [Vitr. 7] | 8.5–9 [Vitr. 8–9] | **9.5–10** [Vitr. ≈9.5] | 10 |
| Base height | 0.5 (round plinth 0.25 + torus 0.25) | 0 (Greek style) or 0.5 (Attic/Tuscan base, usual in Rome) | 0.5 (Attic) | 0.5 (Attic) | 0.5 (Attic) |
| Plinth width | 1.33 (round in Vitruvius) | 1.33 | 1.4 [Vitr. 1.5] | 1.4 | 1.4 |
| Capital height | 0.5 | 0.5 | 0.35 to the abacus top (volutes hang to ≈ −0.15 below the echinus) | **1.1–1.17** [Vitr. 1.0] | 1.1–1.17 |
| Abacus width | 1.2 square | 1.2 square | 1.05; volute face to volute face ≈ 1.45 | concave sides; **diagonal ≈ 2.0** (face ≈ 1.45) | as Corinthian |
| Shaft top diameter (taper) | 0.75 [Vitr.] (use 0.8) | 0.83 | 0.83–0.87 | 0.83–0.87 | 0.85 |
| Fluting | none | 20 sharp arrises, or plain | 24 flutes with fillets | 24 flutes with fillets, **or plain polished monolith** (granite, coloured marble) | 24 or plain |
| **Entablature total** | 1.75 | 2.0 | 2.0–2.25 | **2.25–2.5** (≈ ¼ of column height) | 2.5 |
| Architrave | 0.5 (often timber in old Tuscan) | 0.5 (one plain fascia + taenia) | 0.6–0.7 (3 fasciae) | 0.75 (3 fasciae) | 0.75 |
| Frieze | 0.6 | 0.75 (triglyphs and metopes) | 0.6–0.75 (plain or carved) | 0.75 (plain, inscribed or carved scrolls) | 0.75 |
| Cornice height | 0.65 | 0.75 | 0.75 (dentils) | **1.0** (dentils + modillions) | 1.0 |
| Cornice projection beyond frieze face | 0.8 (deep eaves) | 0.75 | 0.75 | ≈1.0 | ≈1.0 |
| Pedestal (when used: arches, interior orders) | 1.5–2 | 2–2.5 | 2.5–3 | 3 | 3 |

Real Roman columns (for calibration):

| Building (state in 113) | Order | D (m) | Column H (m) | H/D | Shaft material | Conf. |
|---|---|---|---|---|---|---|
| Temple of Mars Ultor (2 BC) | Corinthian | 1.76 | ≈17.7 (Platner: 15.3, probably shaft only) | ≈10 | Luna marble, fluted | A/B |
| Temple of Castor & Pollux (AD 6) | Corinthian | ≈1.45 | ≈14.8 | ≈10.2 | white marble, fluted | B |
| Round temple of Hercules Victor (late 2nd c. BC) | Corinthian | ≈1.0 | 10.66 | ≈10.5 | Pentelic (10 replaced in Luna under Tiberius) | A |
| Trajan's Column (113) | Tuscan-Doric (monumental) | 3.70 | 29.78 (= 100 RF, base + shaft + capital) | 8.0 | Luna marble drums | A |
| Pantheon porch (built c. 114–125; **not yet in 113**) | Corinthian | 1.48 | 14.15 (shaft 11.9 = 40 RF) | 9.6 | grey/pink Egyptian granite, unfluted | A |
| Forum of Augustus exedra columns | Corinthian | ≈0.95 [C] | 9.5 | ≈10 | cipollino, fluted | A (height) |

### 1.2 Intercolumniation

Clear gap between shafts, measured at the base, in D:

| Vitruvian type | Clear gap | Axis spacing | Where |
|---|---|---|---|
| Pycnostyle | 1.5 D | 2.5 D | Venus Genetrix, Divus Julius (Vitruvius 3.3.2 names both) |
| Systyle | 2 D | 3 D | Many Augustan temples |
| Eustyle (the ideal) | 2.25 D, centre bay 3 D | 3.25 D, centre 4 D | Default for temples |
| Diastyle | 3 D | 4 D | Porticoes |
| Araeostyle | > 3 D (needs timber architraves) | 4–5+ D | Tuscan and Etruscan temples, utilitarian porticoes |

Rules:
- Temple fronts have an **even number of columns** (4, 6, 8, 10), so that a bay sits on the axis. The central bay may be about 20–30% wider.
- On flanks (peripteral), the classic count is `flank = 2 × front + 1` in Greek work. Roman temples are shorter: Castor & Pollux is 8 × 11 and Mars Ultor 8 × 8 (with no rear colonnade).
- **Doric constraint:** column axis spacing must be a whole multiple of the triglyph–metope unit (1.25 D): `spacing = n × 1.25 D`. Use n = 2 (2.5 D, one triglyph over each bay) or n = 3 (3.75 D, two triglyphs per bay). Triglyphs sit centred over every column. At corners, Roman practice centres the triglyph on the corner column and ends with a half-metope.
- **Corinthian modillions** fall about every 0.55–0.65 D, with one centred on each column axis. Adjust the spacing per bay so that it divides evenly.
- Forum porticoes use 2.5–3.5 D axis spacing. Street porticoes on brick piers use 3–4.5 m axis spacing at 1:1.

### 1.3 Shaft profile, entasis and fluting (code-ready)

Vitruvius 3.3.12 ties the taper to the absolute column height:

| Column height | Top diameter / D |
|---|---|
| up to 15 RF (4.4 m) | 5/6 = 0.833 |
| 15–20 RF | 0.867 (13/15) |
| 20–30 RF | 0.875 (7/8) |
| 30–40 RF | 0.882 (15/17) |
| 40–50 RF (12–15 m) | 0.889 (8/9) |

**Entasis** is a barely visible convex swelling: the profile is straight or near-cylindrical for the lower third, then curves in convexly to the top diameter. It adds an outward flare (*apophyge*) of about 0.04 D over 0.08 D at both ends of the shaft, plus a ring (*astragal*) at the top: 0.06 D tall, projecting 0.035 D.

```ts
/** Radius (in units of D) of a column shaft at height fraction t in [0,1]. */
export function shaftRadius(t: number, top = 0.85): number {
  const r0 = 0.5;
  if (t < 0.03) return r0 + 0.04 * (1 - t / 0.03) ** 2;          // lower apophyge (flare)
  if (t <= 1 / 3) return r0;                                      // straight lower third
  const u = (t - 1 / 3) / (2 / 3);
  let r = r0 - (r0 - r0 * top) * Math.pow(u, 1.4);               // convex taper (entasis)
  if (t > 0.97) r += 0.03 * ((t - 0.97) / 0.03) ** 2;             // upper apophyge
  return r;
}
// Build with THREE.LatheGeometry(points, radialSegments):
// LOD0: 48 segments (or 24 + flute normal map); LOD1: 12–16; LOD2: 6–8.
```

**Fluting** (Ionic and Corinthian): 24 semicircular flutes separated by flat fillets. The fillet is about 1/5 of the flute width. Flute depth is half the flute width, about 0.026 D. Flutes stop at the apophyges with rounded ends. In the **lower third**, Imperial columns sometimes have *cabled* flutes (filled with convex rods). The Doric uses 20 shallow elliptical flutes meeting in sharp arrises.
**Implementation:** fluting is invisible beyond about 30 m. Use a tangent-space normal map (24 bands) at LOD0–1 and real geometry only for hero columns within touching distance. Polished monoliths of granite and coloured marble are **unfluted**.

### 1.4 Base and capital profiles

**Attic base** (the standard base under Ionic, Corinthian and Composite, and on most Roman Doric). Lathe profile with r measured from the column axis and y up, both in D (simplified):

| Point | r | y | Note |
|---|---|---|---|
| 0 | 0.70 | 0.000 | Plinth (square in plan: extrude a box, not a lathe) |
| 1 | 0.70 | 0.167 | Plinth top |
| 2 | 0.67 | 0.170 | Lower torus starts |
| 3 | 0.70 | 0.215 | Lower torus belly |
| 4 | 0.66 | 0.255 | |
| 5 | 0.62 | 0.265 | Fillet |
| 6 | 0.57 | 0.300 | Scotia (the hollow) |
| 7 | 0.60 | 0.345 | Fillet |
| 8 | 0.61 | 0.385 | Upper torus belly |
| 9 | 0.56 | 0.430 | |
| 10 | 0.53 | 0.450 | Fillet |
| 11 | 0.52 | 0.500 | Apophyge into the shaft (r 0.5) |

**Tuscan base:** a round plinth 0.25 D tall at r = 0.665, then one torus 0.2 D and a fillet 0.05 D.

**Tuscan/Doric capital** (0.5 D): necking (*hypotrachelium*) 0.17 D at shaft-top radius, then 2–3 annulets or an astragal; echinus 0.17 D, a quarter-round flaring to r ≈ 0.55; abacus 0.17 D, a square slab 1.2 D wide. Roman versions often carve an **egg-and-dart** on the echinus (as on Trajan's Column).

**Ionic capital:** bounding box W 1.45 × Dp 1.05 × H 0.35 D above the shaft top. It has an echinus ring with egg-and-dart, a flat band (*canalis*) and two **volutes** (spiral disc Ø ≈ 0.4–0.45 D, eyes ≈ 1.1 D apart), with a thin abacus on top. Seen from the side, the volutes join as a "bolster" (*pulvinus*): a waisted cylinder with a central belt. Corner columns on Republican temples (Portunus) use **diagonal volutes at 45°**. LOD1: box + two cylinders (r 0.2 D, axis front-to-back) + echinus torus. LOD2: box.

**Corinthian capital** (≈1.15 D tall):
- *Bell (kalathos):* inverted truncated cone from r = shaft-top radius (≈0.43 D) to r ≈ 0.5 D at the top, 1.0 D tall.
- *Leaves:* two rows of **8 acanthus leaves** each. The lower row reaches ≈0.33 of the capital height and the upper row (offset 22.5°) ≈0.62. Leaf tips curl outward by ≈0.12 D.
- *Caulicoli and volutes:* stalks rise between the upper leaves and split into large **corner volutes** under the abacus corners and small **inner spirals (helices)** under the abacus centre.
- *Abacus:* 0.15 D tall. Its four sides are concave (inset ≈ 1/9 of the width) and its corners cut. **Diagonal ≈ 2.0 D.** A carved flower (*fleuron*) sits at the centre of each face.
- LOD1: lathe bell + 16 instanced bent quads ("leaf cards", alpha-tested or solid) + 4 corner volute boxes + a chamfered, concave-sided abacus. About 150–300 tris.
- LOD2: flared frustum (r 0.43 → 0.65 D) + a square slab. About 30 tris. The flared silhouette is the readable Corinthian cue at distance.

**Composite capital:** the Corinthian lower half (2 rows of acanthus), then an Ionic echinus with egg-and-dart, and **4 large diagonal volutes** springing from the echinus. The first securely dated use is the Arch of Titus (c. 81–82). In 113 it is used mainly on arches and interiors; temples are Corinthian.

### 1.5 Entablature profiles (code-ready sweeps)

Sweep each profile along the building perimeter with mitred corners (`ExtrudeGeometry` with a custom path, or your own sweep). The values are in D and stack bottom to top. "Proj." is the outward offset from the **frieze face plane**. The architrave's lower face is flush with the shaft-top radius.

**Corinthian architrave** (0.75 D): fascia 1, 0.18 (proj. −0.06) → fascia 2, 0.22 (−0.03) → fascia 3, 0.26 (0.00) → crown (cyma reversa + fillet), 0.09 (+0.08). The underside (*soffit*) between columns usually has a sunk, carved panel.

**Corinthian frieze** (0.75 D): a flat band, proj. 0. On temples it often carries the **dedicatory inscription in gilded bronze letters** (*litterae aureae*: individual letters fixed by pins into sockets cut in the stone). Otherwise it is carved with acanthus scrolls (Forum of Trajan, Venus Genetrix) or left plain.

**Corinthian cornice** (≈1.0 D):

| Element (bottom → top) | Height | Proj. at top of element | Notes |
|---|---|---|---|
| Cyma reversa (bed moulding) | 0.08 | 0.08 | Leaf-and-dart carving |
| Dentil band | 0.15 | 0.20 | Dentils w 0.10, gap 0.067, depth 0.12. Instanced boxes. |
| Ovolo | 0.10 | 0.32 | Egg-and-dart |
| **Modillion band** | 0.22 | modillions reach 0.85 | Scroll brackets w 0.20 at spacing 0.55–0.65. Between them, **coffers with rosettes** in the soffit. This is the strongest shadow-maker. |
| Corona (vertical fascia) | 0.18 | 0.95 | Drip edge (flat under-surface) |
| Sima (cyma recta gutter) | 0.22 | 1.05 | On the flanks, **lion-head water spouts** every 2nd modillion. Along the eaves, antefixes may replace the sima. |

**Ionic cornice:** omit the modillions; dentils are bigger (h 0.18). Total ≈0.75 D.
**Doric entablature:** architrave 0.5 D (plain, topped by a *taenia* band 0.07 D; *regulae* with 6 *guttae* under each triglyph). The frieze is 0.75 D, with **triglyphs** 0.5 D wide (two full V-grooves + two half-grooves at the edges) and **square metopes** 0.75 × 0.75 D, carved in Roman work with rosettes, bucrania, paterae and shields. The cornice is 0.6–0.75 D, with flat *mutules* (slabs with 3 × 6 guttae) on its underside over each triglyph and metope.
**Tuscan:** the architrave is a plain beam. Old temples have **wide timber eaves** projecting about ¼ of the column height, with terracotta revetment plaques painted in bright red, black and white.

### 1.6 Pediments, roofs, acroteria, podia and doors

| Element | Rule | Conf. |
|---|---|---|
| Pediment slope | Vitruvius 3.5.12: tympanum height = 1/9 of the cornice width → **atan(2/9) = 12.5°**. Roman practice 12–16°. **Default 13.5°.** Roof slope = pediment slope. | A |
| Raking cornice | Repeats the cornice profile, modillions included, along the slope. The horizontal cornice under the tympanum omits the sima. | B |
| Tympanum | Recessed 0.25–0.4 D behind the architrave face. Filled on major temples with **high-relief or freestanding sculpture**, painted and gilded. | A |
| Acroteria | Central figure at the apex (quadriga, Victory, Jupiter) about 1.1 × the tympanum height. Corner figures about ½ that (Vitruvius). Bronze, often gilded. | A/B |
| Roof covering | Terracotta *tegulae* (flat, flanged) + *imbrices* (half-round cover tiles). **Gilded bronze tiles** on JOM, the Basilica Ulpia (Pausanias calls its roof bronze) and later the Pantheon. Tegula ≈ 0.60 × 0.45 m (2 × 1.5 RF), flanges 5–7 cm high. Imbrex ≈ 0.60 m long, 0.16–0.20 m wide. Row pitch across the slope **0.45 m**. Effective course length down the slope ≈ 0.5 m (overlap). | A |
| Antefixes | Decorative end tiles capping each imbrex row along the eaves (every 0.45 m): palmette or mask, 0.20–0.30 m tall, painted. | A |
| Podium | Roman temples sit on a **high podium** with a **frontal stair only**. Podium height ≈ 0.2–0.5 × column height (Castor 7 m against 14.8 m columns; Mars Ultor ≈3.5 m against 17.7 m). Mouldings: base moulding ≈0.6 D, plain die, crown moulding ≈0.5 D. | A |
| Frontal stair | Full width of the front, or between two projecting cheek walls (*antae* of the podium). The altar often stands in front or on a landing within the stair. Real steps rise 0.25–0.35 m (**regenerate at human scale**, §0.3). | A |
| Cella door | Height ≈ 0.5–0.6 × column height, width ≈ 0.4–0.45 × door height. Moulded jambs, a lintel cornice on scroll consoles, **double bronze leaves** with panels and studs. | B |
| Cella interior | Often lined with a smaller interior colonnade along the walls. Apse or raised platform at the back for the cult statue (colossal, often chryselephantine or marble with bronze). Floors of coloured marble *opus sectile*. Ceilings of coffered timber, gilded. | B |

**Temple plan types (for the generator):**

| Plan | Columns | Rome examples (113) |
|---|---|---|
| Prostyle | Columns only across the front (+ return columns in the porch) | Divus Julius, Vespasian, Saturn (Republican rebuild), Minerva (Forum of Nerva) |
| Pseudoperipteral | Free porch columns + **engaged half-columns** on the flanks and back | Portunus |
| Peripteros sine postico | Columns on the front and both flanks, back wall blank | Mars Ultor, Venus Genetrix, Jupiter OM |
| Peripteral | Columns all around | Castor & Pollux |
| Tholos | Round cella ringed by columns, conical roof | Vesta, Hercules Victor |
| Tuscan triple-cella | Wide front, deep columned porch, three cellae side by side | Jupiter Optimus Maximus (Capitoline) |

### 1.7 Arcuated orders and superposition (Colosseum, theatres, circus, basilicas)

The Roman "arch order" consists of **piers with arched openings, framed by engaged half-columns carrying a full entablature**. Storeys are stacked as Tuscan/Doric → Ionic → Corinthian → **attic** (a solid wall with flat Corinthian pilasters and small windows).

| Parameter | Typical value | Colosseum (for calibration) |
|---|---|---|
| Bay (axis to axis) | 1.4–1.6 × the opening width + the half-column | ≈6.6–6.8 m (perimeter 527–545 m / 80) |
| Opening width | 0.55–0.65 of the bay | ≈4.2 m |
| Opening height | 1.6–1.8 × width | ≈7.0 m on the ground storey [B] |
| Impost moulding | At ≈0.6 of the opening height. The arch springs here (semicircular). | |
| Keystone | Plain or projecting | Plain |
| Engaged half-column | D ≈ 0.12–0.14 × the storey height, projecting ½ D | |
| Entablature per storey | ≈ 1/6–1/5 of the storey height. Ground-storey cornices are kept modest. | |
| Upper parapet / balustrade in each arch | 1.0–1.2 m | Yes, on storeys II–III |

Vitruvius (5.1.3) wants each upper order ¼ shorter than the one below; the Colosseum ignores this, with storeys of about 10.5, 11.9, 11.6 m and an attic of ≈14 m. Brick buildings (the Markets of Trajan, horrea, the Ostia-style insulae) translate the same vocabulary into **brick pilasters, flat brick lintel arches (*platbands*), relieving arches and moulded brick cornices**.

### 1.8 LOD guidance: what matters at 5 m, 30 m and 200 m

Distances are in scaled game metres.

| Band | Distance | Must show | Can drop | Budget per temple-sized landmark |
|---|---|---|---|---|
| LOD0 "touch" | 0–5 m | Flutes (normal map OK), base mouldings, capital leaves, dentils and modillions, egg-and-dart (normal map), door studs and panels, **inscriptions**, stains, chipped edges, graffiti | — | 50–150k tris (hero buildings only, chunk-streamed) |
| LOD1 "street" | 5–30 m | **Correct column count and spacing**, lathe shafts (12–16 sides), capitals as bell + leaf cards, 3-band architrave, **deep cornice overhang** with an instanced modillion row, pediment sculpture as relief, tiles via texture plus a ridged normal map | Flute geometry, carved mouldings | 10–30k |
| LOD2 "district" | 30–200 m | Podium, colonnade rhythm (6–8-sided prisms), entablature as 2–3 boxes with the **cornice shadow line**, pediment triangle, roof colour, rooftop statues as rough blobs, gilding specular | Capital detail (a frustum is enough), mouldings | 1–4k |
| LOD3 "skyline" | > 200 m | Mass boxes, colonnades as a recessed box face with a dark/light **stripe texture**, roof slope and colour, **gilded roof highlights** (JOM, Basilica Ulpia), tall silhouettes (the Column, obelisks, the Colosseum attic line, the firewall of Augustus, aqueduct arcades) | Everything else. Use impostor billboards for the Column and statues. | 50–300 |

What the eye reads at 200 m:
1. Mass and roofline.
2. Value and hue contrast: white marble against brick red against terracotta roofs against dark green pines and cypresses.
3. Vertical colonnade rhythm (dark gaps between columns).
4. The horizontal shadow under cornices.
5. The **sparkle of gilding**.

At 30 m, column count, capital type (flared, scroll or block) and arches come in. At 5 m, texture, carving, inscriptions and dirt.

**Implementation tips:**
- `InstancedMesh` for columns, capitals, modillions, dentils, antefixes and statues.
- `LatheGeometry` for shafts, bases, tholos roofs, amphorae and dolia.
- Sweep profiles for mouldings.
- Merge static geometry per city chunk.
- Put polychrome bands in **vertex colours** to save texture binds.
- Use one architectural texture atlas (marble, travertine, brick, stucco, tile, basalt) with triplanar or box UVs.
- Impostors for distant statues and trees.

---

## 2. Construction materials and colours in AD 113

### 2.1 Swatch table

Albedo hex values. Roughness is for a metal/rough PBR workflow. "Accent" means veins, clasts, joints or speckles for procedural noise.

| Material | Latin / Italian name | Where in 113 | Base hex | Accent hex | Rough. | Procedural notes |
|---|---|---|---|---|---|---|
| **Travertine**, fresh | *lapis Tiburtinus* (Tivoli) | Colosseum, Theatre of Marcellus, temple podia, thresholds, kerbs, arches, bridge facings | `#E3DAC6` | pores `#9E927A`, weathered `#CFC4AC` | 0.85 | Horizontal laminar bands + small elongated voids. Warm cream. Glows honey-gold at low sun (§7). |
| **Luna marble** (Carrara) | *marmor Lunense* | Columns, revetments, Trajan's Column, Mars Ultor, the Forum of Trajan paving | `#EEEDE8` | veins `#A3A8AD` | 0.35 polished / 0.6 honed | Cool white, faint grey veining. Brand new in the Trajanic fora. |
| **Pentelic marble** | *marmor Pentelicum* (Attica) | Jupiter OM columns, Hercules Victor, Arch of Titus | `#F0E9DA` | iron patina `#E2D2B0` | 0.45 | Warm white that weathers golden. |
| **Proconnesian** | *marmor Proconnesium* (Marmara) | Architectural elements, sarcophagi, revetment | `#E6E8E7` | grey bands `#8A939A` | 0.45 | White with parallel blue-grey stripes |
| Hymettian | *marmor Hymettium* | Older Republican columns, the Regia | `#C9CDCF` | `#9AA1A6` | 0.45 | Bluish-grey |
| **Giallo antico** | *marmor Numidicum* (Chemtou) | Basilica Ulpia porches, the Forum of Augustus porticoes, steps, floors, Domus Flavia | `#D8AE55` | deep `#B88A3A`, red-pink veins `#B5654A` | 0.3 | Golden yellow, brecciated in places |
| **Pavonazzetto** | *marmor Phrygium / Synnadicum* (Docimium) | Dacian prisoner statues (Forum of Trajan), Basilica Aemilia columns, floors | `#EDE6DA` | violet veins `#6B3E5E`, `#8C5A70` | 0.3 | White with violet-purple veining and breccia |
| **Porphyry** (red) | *lapis porphyrites* (Mons Porphyrites) | **Rare in 113**: small inlays, a few statues. Common only from the 3rd c. on. | `#6E2232` | white flecks `#D6C3BE` | 0.25 | Deep purple-red with fine light speckle |
| **Cipollino** | *marmor Carystium* (Euboea) | Forum of Augustus exedra columns, Basilica Ulpia upper order, many shafts | `#B4C3AE` | wavy green `#6F8C72`, dark `#4E6B57` | 0.35 | Pale green with wavy "onion-layer" bands |
| **Africano** | *marmor Luculleum* (Teos) | Columns (Forum of Augustus upper levels), floors | `#2B2826` | clasts `#9C4A55`, `#C9B3A6`, `#6B6F5E` | 0.3 | Black breccia with pink, red and grey fragments |
| Serpentine (green porphyry) | *lapis Lacedaemonius* | Small floor inlays (opus sectile) | `#3B5A3C` | crystals `#A8BF8A` | 0.3 | Dark green with pale rectangular crystals |
| Rosso antico | *marmor Taenarium* | Small details, inlays | `#8E3A33` | `#6E2A26` | 0.3 | Dark brick-red, fine-grained |
| **Grey granite** | *marmor Claudianum* (Mons Claudianus) | Basilica Ulpia ground order, Templum Pacis?, porticoes | `#8F8E89` | speckle `#3E3D3B`, `#D0CEC8` | 0.4 | Salt-and-pepper speckle |
| **Red granite / syenite** | *lapis Syenites* (Aswan) | **Templum Pacis porticoes**, obelisks (Circus Maximus, Horologium) | `#A86A5C` | `#4A3A36`, `#D9B7A8` | 0.4 | Pink-red coarse speckle |
| **Cappellaccio** tufa | | Archaic foundations (JOM podium), oldest Servian wall stretches | `#A99D83` | `#857A63` | 0.95 | Soft, grey-brown, crumbly |
| **Grotta Oscura** tufa | (Veii) | **Servian walls** (4th c. BC), Republican podia, the Cloaca outlet | `#CDBB8E` | `#A8956A` | 0.95 | Yellowish. Big blocks ≈0.6 m (2 RF) square in section. |
| Anio / Fidenae tufa | *lapis Aniensis* | Republican walls, Temple of Portunus | `#9C8668` | dark inclusions `#5E5040` | 0.95 | Brownish with dark scoria bits |
| **Peperino** | *lapis Albanus* | **Firewall of the Forum of Augustus**, Forum of Trajan enclosure walls, Cloaca Maxima, sarcophagi | `#7F8178` | black flecks `#3A3B37`, white `#C8C6BC` | 0.9 | Grey-green "peppercorn" speckle; fire-resistant (Tacitus Ann. 15.43) |
| Lapis Gabinus | (Gabii) | Fire-resistant bands, Forum of Augustus, Cloaca | `#8A8476` | `#5E5A50` | 0.9 | Grey-brown |
| **Brick facing**, red | *opus testaceum* (fired brick) | **Everything utilitarian**: insulae, Markets of Trajan, baths, horrea, Castra Praetoria, Ludus Magnus, aqueduct repairs | `#B4613E` | mortar `#C8BFAE`; yellow bricks `#CFA06A`; burnt `#8C4A33` | 0.9 | Bricks 3–4.5 cm thick, joints 1–2 cm (**thick mortar is characteristic**). Courses ≈ 5.5–6 cm. At distance it averages to `#AE6A4E`. Trajanic façades mix red and yellow bricks for decorative pilasters and bands. |
| **Opus reticulatum** | | Late Republican and Julio-Claudian walls: Theatre of Marcellus interiors, older houses. Often with brick quoins (*opus mixtum*). | `#B7A57E` | mortar net `#D0C7B4` | 0.9 | Square tufa blocks 6–10 cm laid diagonally at 45°, a diamond net |
| Opus quadratum | | Ashlar tufa or travertine | as stone | joints `#6E6656` | | Courses 0.6 m. Alternate headers and stretchers. |
| **Lime stucco**, white | *tectorium* | Most façades, covering tufa on Republican temples (often scored to imitate marble blocks) | `#EFEADC` | dirt `#B8AE98` | 0.85 | Lower 1.5 m dirtier; soot streaks above windows |
| **Pompeian red** (cinnabar for the rich, red ochre for the rest) | *minium / rubrica* | Wall dadoes, interior panels, shopfronts, inscriptions | cinnabar `#A3271F`, red ochre `#9A3A24` | | 0.8 | Cinnabar darkens if exposed to sun; red ochre is the common outdoor red |
| **Yellow ochre** | *sil* | Wall panels, façades | `#CC9A35` | | 0.8 | |
| **Black** | *atramentum* | Dadoes, panel borders | `#1F1D1B` | | 0.8 | |
| Egyptian blue | *caeruleum* | Accents, statue paint, mouldings, sky backgrounds | `#2D5DA1` | | 0.8 | |
| Green earth | *creta viridis* | Garden paintings, borders | `#6F8656` | | 0.8 | |
| **Terracotta roof tiles**, fresh | *tegulae, imbrices* | Almost all roofs | `#B85C33` | weathered `#9B5A3F`, lichen `#8E8E5E`, soot `#5A4A40` | 0.9 | Ridged normal map, 0.45 m pitch |
| **Gilded bronze** | *aes inauratum* | Roof tiles of Jupiter OM and the Basilica Ulpia, statues, letters, the Column's top statue, the Colossus (?) | `#D6AE45` | | 0.2 metal 1.0 | Strong specular; visible from kilometres in sun |
| Bronze, maintained | *aes* | Statues (kept oiled and polished: warm brown-gold, not green), doors, grilles | `#8C5E33` | highlights `#C4935A` | 0.35 metal 1.0 | Green verdigris (`#4F7A63`) only on neglected or older pieces |
| **Lead** | *plumbum* | Water pipes (*fistulae*, stamped), roof flashing, clamps | `#7E8285` | | 0.6 metal 0.6 | |
| **Basalt paving** (leucitite) | *silex* (It. *selce*), from Capo di Bove | Streets, the Via Sacra, roads | `#4B4C4E` | worn polish `#5C5D5E`, wheel ruts darker | 0.6 (polished by feet) | Irregular polygons 0.7–1.0 m across, tight joints |
| Timber, fresh | fir *abies*, oak *quercus*, chestnut | Roofs, balconies, shutters, upper partitions, scaffolds, cranes | fir `#A8784A`, oak `#7A5A3A` | weathered grey `#8A8173` | 0.85 | Shutters and balconies are weathered grey or painted red or green [C] |
| Opus signinum floor | | Cheap floors, cisterns, terraces | `#A5603F` | white tesserae dots `#E8E2D2` | 0.85 | Crushed terracotta in lime |
| Cocciopesto lining | | Aqueduct channels, cisterns, roof terraces | `#B9806A` | | 0.9 | |
| Black-and-white mosaic | *opus tessellatum* | Baths, insula floors, shops | `#EDE8DA` / `#262422` | | 0.7 | Tesserae ≈1 cm; the dominant 2nd-c. style |
| Window glass | *vitrum* | Baths and rich houses only: small cast panes ≈ 30 × 40 cm in bronze or wooden frames | `#A9C4B5` α 0.5 | | 0.2 | Greenish, bubbly, semi-translucent. Insulae use **shutters** (or mica/selenite in rare cases). |
| Orvieto lava | (Vulsinii leucitite) | Rotary mills (*molae*) in bakeries | `#4F4D4B` | `#6E6A66` | 0.95 | Porous dark grey |

### 2.2 Polychromy: how painted and gilded was it?

- **Statues** were painted: skin tones; eyes (often inlaid in glass and stone); lips; hair in red-brown or blond; garments in colour with borders; gold on jewellery and weapons. Bronze statues were polished warm brown with gilded or silvered details, copper lips and inlaid eyes. Many honorific bronzes were **fully gilded** (equestrian statues, quadrigas). [A: traces and ancient texts; degree varies]
- **Architecture:** marble surfaces were mostly left their natural colour, with **painted and gilded accents** on mouldings. Egg-and-dart, leaf-and-dart and modillion scrolls might be picked out in red, blue or gold; coffers blue with gilded rosettes; tympanum backgrounds sometimes blue. **Inscriptions** were painted red (*rubricated*) or set in **gilded bronze letters**. [B: the amount is debated; keep it subtle on exteriors, richer on interiors and up close]
- **Tufa and travertine Republican temples** were covered in fine white stucco, scored and sometimes painted to imitate marble blocks, with coloured terracotta revetments on the oldest (Tuscan) roofs. [A]
- **Brick façades** of utilitarian buildings were often left exposed, with fine joints and decorative brick mouldings, pilasters and pediments (the Markets of Trajan, Ostia). Some were stuccoed and painted with a red dado band. [A]
- **Shops and insulae:** stuccoed, with painted signs (red or black letters on a whitewashed panel), lararium paintings (snakes, Lares) by doors, and graffiti.
- **Doors:** temple and curia doors were bronze, sometimes gilded or silvered (JOM). House doors were timber with bronze studs and ring handles.
- **Floors** of public buildings were opus sectile slabs in giallo antico, pavonazzetto, africano, grey granite and porphyry discs, in geometric patterns.
- **Implementation:** use vertex colour or a secondary "paint mask" channel per moulding band, with three paint presets: `none` (Republican stucco), `subtle` (default marble exteriors: gold on the inscription and a few red/blue bands) and `rich` (interiors, statues, close-up hero assets).

### 2.3 Which material where (generator defaults)

| Building class | Walls / structure | Visible face | Columns | Roof | Floor / ground |
|---|---|---|---|---|---|
| Imperial temple (Augustan to Trajanic) | Concrete + tufa core | **White marble** blocks (Luna/Pentelic), coloured marble inside | White marble, fluted | Tile or gilded bronze, low pitch | Coloured marble |
| Republican temple | Tufa (Anio, Grotta Oscura) | **White stucco** over tufa; travertine bases and corners | Tufa or travertine, stuccoed | Tile with painted antefixes | Travertine steps |
| Imperial forum enclosure | Peperino + Gabine ashlar | Marble revetment inside; bare grey-green stone outside (the firewall) | Coloured marbles | Tile behind parapets | White marble paving |
| Amphitheatre, theatre, circus | Concrete, tufa, brick | **Travertine** exterior, marble seats | Engaged travertine | Timber roof over the top colonnade only | Sand (arena), marble (seats) |
| Baths, markets, horrea, barracks | Brick-faced concrete | **Exposed brick** (Markets) or stucco; marble inside the baths | Granite and marble inside the baths | Concrete vaults under tile-covered timber or terraces | Mosaic, sectile, signinum |
| Insula | Brick-faced concrete (lower), timber frame and wattle (upper partitions) | Exposed brick or **stucco** (white, ochre, red dado) | Brick piers (porticoes) | Tile, 15–22° | Basalt street, travertine thresholds |
| Domus | Brick and concrete | Blank stucco walls outside, painted inside | Stuccoed brick or marble (peristyle) | Tile, compluviate atrium | Mosaic |
| Bridges, walls, aqueducts | Tufa, peperino, travertine, concrete | Ashlar (rusticated on Claudian aqueduct works) | — | — | Basalt deck |

### 2.4 Palette as code

```ts
// src/world/palette.ts (suggested). sRGB hex albedo; roughness r; metalness m.
export const MAT = {
  travertine:   { c: '#E3DAC6', r: 0.85 }, travertineWeathered: { c: '#CFC4AC', r: 0.9 },
  marbleLuna:   { c: '#EEEDE8', r: 0.4 },  marblePentelic: { c: '#F0E9DA', r: 0.45 },
  marbleProcon: { c: '#E6E8E7', r: 0.45 }, gialloAntico:   { c: '#D8AE55', r: 0.3 },
  pavonazzetto: { c: '#EDE6DA', r: 0.3, vein: '#6B3E5E' }, cipollino: { c: '#B4C3AE', r: 0.35, vein: '#6F8C72' },
  africano:     { c: '#2B2826', r: 0.3, clast: '#9C4A55' }, porphyry: { c: '#6E2232', r: 0.25 },
  serpentine:   { c: '#3B5A3C', r: 0.3 },  rossoAntico: { c: '#8E3A33', r: 0.3 },
  graniteGrey:  { c: '#8F8E89', r: 0.4 },  graniteRed: { c: '#A86A5C', r: 0.4 },
  tufaCappellaccio: { c: '#A99D83', r: 0.95 }, tufaGrottaOscura: { c: '#CDBB8E', r: 0.95 },
  tufaAnio:     { c: '#9C8668', r: 0.95 }, peperino: { c: '#7F8178', r: 0.9 }, lapisGabinus: { c: '#8A8476', r: 0.9 },
  brick:        { c: '#B4613E', r: 0.9, mortar: '#C8BFAE', far: '#AE6A4E' }, brickYellow: { c: '#CFA06A', r: 0.9 },
  reticulatum:  { c: '#B7A57E', r: 0.9, mortar: '#D0C7B4' },
  stuccoWhite:  { c: '#EFEADC', r: 0.85 }, stuccoDirty: { c: '#B8AE98', r: 0.9 },
  paintCinnabar:{ c: '#A3271F', r: 0.8 },  paintRedOchre: { c: '#9A3A24', r: 0.8 },
  paintOchre:   { c: '#CC9A35', r: 0.8 },  paintBlack: { c: '#1F1D1B', r: 0.8 },
  paintEgyptianBlue: { c: '#2D5DA1', r: 0.8 }, paintGreenEarth: { c: '#6F8656', r: 0.8 },
  tile:         { c: '#B85C33', r: 0.9 },  tileWeathered: { c: '#9B5A3F', r: 0.9 },
  gilt:         { c: '#D6AE45', r: 0.2, m: 1 }, bronze: { c: '#8C5E33', r: 0.35, m: 1 },
  verdigris:    { c: '#4F7A63', r: 0.6, m: 0.3 }, lead: { c: '#7E8285', r: 0.6, m: 0.6 },
  basalt:       { c: '#4B4C4E', r: 0.6 },  basaltWorn: { c: '#5C5D5E', r: 0.45 },
  timberFir:    { c: '#A8784A', r: 0.85 }, timberOak: { c: '#7A5A3A', r: 0.85 }, timberGrey: { c: '#8A8173', r: 0.9 },
  signinum:     { c: '#A5603F', r: 0.85 }, cocciopesto: { c: '#B9806A', r: 0.9 },
  mosaicWhite:  { c: '#EDE8DA', r: 0.7 },  mosaicBlack: { c: '#262422', r: 0.7 },
  glass:        { c: '#A9C4B5', r: 0.2, opacity: 0.5 }, lava: { c: '#4F4D4B', r: 0.95 },
} as const;
```

---
## 3. Landmark build specs

Dimensions are REAL metres; scale by 0.6 (§0.3). Orientations are approximate and given only for the facing direction. **Positions come from the topography doc.** Every entry lists the state **in spring–summer 113**.

**Entry template:** spec table → materials/colours → interior worth modelling → what a visitor in 113 sees → don'ts (anachronisms) → simplification notes.

### 3.0 Index

| # | Landmark | Group | Priority for the first playable |
|---|---|---|---|
| 1 | Rostra, Miliarium Aureum (world origin), Forum square | Forum Romanum | ★★★ |
| 2 | Temple of Saturn | Forum Romanum | ★★ |
| 3 | Temple of Castor & Pollux | Forum Romanum | ★★★ |
| 4 | Temple of Divus Julius + Arch of Augustus | Forum Romanum | ★★ |
| 5 | Temple of Vesta, Atrium Vestae, Regia | Forum Romanum | ★★ |
| 6 | Curia Julia, Comitium, Lapis Niger, Janus shrine | Forum Romanum | ★★★ |
| 7 | Basilica Julia | Forum Romanum | ★★ |
| 8 | Basilica Aemilia (Paulli) | Forum Romanum | ★★ |
| 9 | Capitol backdrop: Tabularium, Temples of Vespasian and Concord, Arch of Tiberius | Forum Romanum | ★★ |
| 10 | Carcer (Mamertine prison, Tullianum) | Forum Romanum | ★★ (dungeon) |
| 11 | Arch of Titus | Via Sacra | ★★ |
| 12 | Temple of Jupiter Optimus Maximus, Area Capitolina, Arx | Capitoline | ★★★ |
| 13 | Forum of Caesar + Temple of Venus Genetrix | Imperial Fora | ★★ |
| 14 | Forum of Augustus + Temple of Mars Ultor + firewall | Imperial Fora | ★★★ |
| 15 | Templum Pacis | Imperial Fora | ★★ |
| 16 | Forum of Nerva (Transitorium) | Imperial Fora | ★ |
| 17 | Forum of Trajan: square, equestrian statue, Basilica Ulpia, libraries, Column | Imperial Fora | ★★★ |
| 18 | Markets of Trajan | Imperial Fora | ★★★ (hub) |
| 19 | Colosseum (Amphitheatrum Flavium) | Colosseum valley | ★★★ |
| 20 | Ludus Magnus | Colosseum valley | ★★★ (gladiator questline) |
| 21 | Meta Sudans | Colosseum valley | ★★ |
| 22 | Colossus (Sol) | Velia | ★★ |
| 23 | Baths of Trajan (+ Sette Sale cistern) | Oppian | ★★ |
| 24 | Domus Flavia / Augustana, Palatine | Palatine | ★★ |
| 25 | Circus Maximus | Murcia valley | ★★★ |
| 26 | Pantheon site (burned 110) | Campus Martius | ★★ |
| 27 | Theatre of Pompey + Venus Victrix + Porticus Pompeiana | Campus Martius | ★★ |
| 28 | Theatre of Marcellus | Circus Flaminius | ★★ |
| 29 | Mausoleum of Augustus (+ Ustrinum, Horologium, Ara Pacis) | N. Campus Martius | ★★ |
| 30 | Temple of Portunus | Forum Boarium | ★ |
| 31 | Round temple of Hercules Victor | Forum Boarium | ★ |
| 32 | Tiber Island + Temple of Aesculapius | River | ★★ |
| 33 | Tiber bridges | River | ★★★ |
| 34 | Cloaca Maxima (+ outlet) | Underground | ★★ (dungeon) |
| 35 | Castra Praetoria | Viminal edge | ★★ |
| 36 | Aqueduct arcades, Porta Maggiore, Arcus Neroniani | Edges | ★★ |
| 37 | Servian walls and gates | Ring | ★★ |
| 38 | Extra quick specs (Ara Pacis, Stadium of Domitian, Porticus Octaviae, Apollo Palatinus, Tomb of Eurysaces, Pyramid of Cestius, Monte Testaccio, Naumachia, …) | Various | ★ |

---

### 3.1 Forum Romanum square, Rostra and Miliarium Aureum (the world origin)

| Item | Spec | Conf. |
|---|---|---|
| Forum open square | Trapezoid ≈ 120 m NW–SE × 40–50 m. Paved in travertine slabs (Augustan repaving, the "Lucius Naevius Surdinus" paving near the Lacus Curtius). | B |
| **Rostra Augusti** (W end, in front of the Temple of Concord, between the Arch of Tiberius side and the Comitium) | Platform ≈ 24 m wide × 12 m deep × **≈3 m high**. Front faced in marble with **bronze ship beaks (*rostra*)** fixed in rows. Access by stairs at the back (hemicycle stair of Caesar's design behind). Marble parapet on top. Honorific statues on and around it. | B |
| Rostra Diui Iuli (E end) | A second, lower speaker's platform across the front of the Temple of Divus Julius, also with ship beaks (Actium) | B |
| **Miliarium Aureum** (Golden Milestone, 20 BC, Augustus) | A marble column **sheathed in gilded bronze**, listing the distances to major cities. Stands at the S/W end of the Rostra near the Temple of Saturn. Surviving fragments suggest a cylindrical marble base ≈1.2 m Ø. **Height unknown: use ≈3.5–4 m on a 1 m plinth.** This is the **world origin (0,0,0)**. | A (existence) / C (size) |
| Umbilicus Urbis | Brick drum ≈4.5 m Ø at the N end of the Rostra. The visible remains are Severan; its existence in 113 is uncertain. Optional, or omit. | C |
| Lacus Curtius | Small sunken paved area with a balustrade and a relief of Curtius on horseback; coins are thrown in | A |
| Statues in the square | Dense: honorific statues on pedestals along the edges, columns with statues. **The equestrian statue of Domitian (Equus Domitiani) was destroyed after 96 (damnatio memoriae)**; at most an empty or dismantled base remains. | A |
| Fig, olive and vine | The sacred fig, olive and vine grow together in the middle of the Forum (Pliny NH 15.78), near the Lacus Curtius. Small fenced planting. | A |
| Shrine of Venus Cloacina | Small round enclosure (≈2.4 m Ø) on a low platform in front of the Basilica Aemilia, marking the Cloaca's course | A |

- **Visitor in 113:** a crowded, noisy, statue-cluttered square ringed by gleaming porticoes. Speakers and advocates hold forth on the Rostra; litigants spill out of the Basilica Julia; money-changers work under the Basilica Aemilia's portico. The Forum is the ceremonial heart, but the newer Imperial Fora to the north are shinier.
- **Don't add:** the Arch of Septimius Severus (203), the Column of Phocas (608), the Decennalia monument (303), the seven honorific columns along the Basilica Julia (4th c.), the Temple of Antoninus and Faustina (141), the "Temple of Romulus" (c. 307), the Basilica of Maxentius (308–312).
- The *Anaglypha Traiani* (marble balustrade reliefs) may date to Trajan or Hadrian. They are uncertain for 113, so omit them or add them as "new".

### 3.2 Temple of Saturn (Aedes Saturni)

| Item | Spec | Conf. |
|---|---|---|
| Version in 113 | The **42 BC rebuild by L. Munatius Plancus**. The 8 granite Ionic columns visible today are a late-antique (post-283) restoration, so **don't copy them literally**. | A |
| Podium | Very high, ≈ 22 × 40 m, ≈ 9 m high at the Forum end where the ground falls away. Travertine/tufa faced. The **Aerarium** (state treasury) occupies rooms inside the podium, with a door onto the Forum side. | B |
| Front | Faces **E/NE onto the Forum**. Hexastyle prostyle porch. **Order uncertain**: use Ionic or Corinthian, 6 front × 2–3 deep, columns ≈ 11–12 m. Stair partly lateral (narrower than the front). | C |
| Interior | Statue of Saturn, hollow, filled with oil, **feet bound with woollen bands** (unbound for the Saturnalia, 17 Dec) | A |

- **Visitor:** treasury scribes and officials of the *aerarium* coming and going; the Clivus Capitolinus winds up beside it. The Miliarium Aureum and the Arch of Tiberius stand nearby.
- **LOD:** at distance it is the "tall podium with six columns" landmark at the Capitol foot.

### 3.3 Temple of Castor & Pollux (Aedes Castoris)

| Item | Spec | Conf. |
|---|---|---|
| Version | **Tiberian rebuild, dedicated AD 6** | A |
| Podium | **32 × 49.5 m, 7 m high.** Concrete core, once faced with tufa then marble. Chambers between the foundation piers housed the **office of weights and measures, bank strongrooms, shops** (one was a dentist's: teeth found). | A |
| Plan | **Octastyle peripteral Corinthian: 8 × 11 columns** | A |
| Columns | D ≈ 1.45 m, H ≈ 14.8 m, fluted white marble. Very fine Augustan-Tiberian Corinthian capitals with interlocking central spirals. | B |
| Entablature | ≈ 3.5 m: three-fascia architrave, plain frieze, rich modillion cornice | B |
| Front | Faces **N/NW onto the Forum**. The front of the podium has a **speaker's platform (tribunal)** with side stairs. The main flight is narrow and lateral (the platform occupies the front). | B |
| Neighbours | **Lacus Juturnae** to the east: a square spring basin (≈5 × 5 m) with a small central pier carrying a marble group of the Dioscuri watering their horses; aedicula of Juturna | A |

- **Interior:** single cella with a mosaic floor; standards of weights.
- **Visitor:** equites honour the twins here (the equestrian parade *transvectio equitum* on 15 July passes here); bankers and the weights office do business in the podium.

### 3.4 Temple of Divus Julius (Aedes Divi Iuli) and the Arch of Augustus

| Item | Spec | Conf. |
|---|---|---|
| Date | Dedicated 29 BC on the site of Caesar's pyre, at the **E end of the Forum, facing W** down the square | A |
| Podium | ≈ 26 × 30 m, ≈ 3.5–5.5 m high. Its front forms the **Rostra Diui Iuli** with ship beaks from Actium. A **semicircular niche** in the front wall holds the **round altar marking the cremation spot**. | B |
| Temple | Prostyle hexastyle, **pycnostyle** (Vitruvius 3.3.2), Corinthian, columns ≈ 11–12 m [C]. A **star (sidus Iulium)** in the pediment and on the cult statue's head. | B/C |
| Arch of Augustus | **Triple arch** (19 BC, Parthian standards) on the S side of the temple, spanning the Via Sacra-side passage between it and the Temple of Castor. Central arch tall with an attic and quadriga; side openings lower, with pediments. ≈ 17 m wide [C]. The **Fasti** (lists of consuls and triumphs) may have been inscribed on or near it. | B |

- **Visitor:** flowers and offerings at the altar niche; the Regia is behind.

### 3.5 Temple of Vesta (Aedes Vestae), Atrium Vestae and Regia

| Item | Spec | Conf. |
|---|---|---|
| Temple version | **Rebuilt after the fire of 64** (Neronian/Flavian; some sources say completed under Trajan). The surviving fragments are the **Severan** rebuild of 191, which was similar in form. | B |
| Plan | **Round:** podium ≈ 15 m Ø, ≈ 3 m high; cella inner Ø ≈ 8.6 m; **20 Corinthian columns** on a ring of radius ≈ 6.2 m; columns slender (D ≈ 0.5–0.55 m, H ≈ 5.5 m [C]) | B |
| Between the columns | **Bronze lattice screens** (shown on reliefs) closing the lower intercolumniations | B |
| Roof | **Conical**, of bronze tiles [C], with a **vent at the top for smoke from the eternal fire** | B |
| Entrance | Faces **E** (toward the Regia/Atrium). Steps on that side only. | B |
| Interior | No cult statue: the **sacred hearth**; the *penus* (inner storeroom, closed to all but the Vestals) with the Palladium | A |
| **Atrium Vestae** | House of the six Vestals, SE of the temple at the foot of the Palatine. Rectangular complex ≈ 115 × 50 m [C], with a **long central courtyard ≈ 65 × 20 m [C] with pools** (a central oblong pool plus two smaller ones) and garden. Two-storey porticoed rooms; upper floors expanded under Trajan [B]. **The statues of Vestales Maximae now in the courtyard are 3rd–4th c.: use only a few, or plain bases.** | B/C |
| **Regia** | Small irregular (trapezoidal) marble building between the Temple of Vesta and the Temple of Divus Julius: the office of the **Pontifex Maximus** (= Trajan), with the shrine of Mars (the *ancilia* shields and spears) and of Ops. Rebuilt in marble in 36 BC. ≈ 20 × 25 m footprint [C]. | A/B |

- **Visitor:** Vestals in white with a lictor ahead of them (§6.7); only women enter the temple, and men never enter the *penus*. The fire visibly smokes through the roof vent.

### 3.6 Curia Julia, Comitium, Lapis Niger, Janus shrine

| Item | Spec | Conf. |
|---|---|---|
| Version in 113 | Caesar/Augustus' Curia, **restored by Domitian (c. 94)**. The standing building is Diocletian's (after 283), which **followed the same plan**, so use its form. | A |
| Size | Exterior **≈ 27 × 18 m**; interior ≈ 25.2 × 17.6 m; height ≈ 21 m [B, Diocletianic] | A/B |
| Façade | Faces **SW onto the Comitium/Forum**. Brick-faced concrete; **lower part marble-revetted, upper part stucco imitating white marble blocks**; tall triangular pediment; **3 large windows** high in the façade; **bronze double doors** (the Diocletianic set survives at the Lateran); **corner buttresses**. A front porch or portico (*chalcidicum*) in 113 is possible [C]. | B |
| Interior | **Three broad low steps** on each long side for the senators' seats (≈300 sitting); the presiding magistrates' platform at the back; **statue of Victory on a globe** and the **Altar of Victory** (Augustan); walls marble-veneered to about ⅔ of their height; floor of **opus sectile** (rosettes, cornucopias) in porphyry, serpentine, giallo antico and pavonazzetto (the surviving floor is Diocletianic) | A/B |
| Comitium | The older assembly space in front, with a paved surface; the **Lapis Niger**: a ≈ 4 × 3 m patch of **black marble paving** enclosed by a low white marble parapet, marking an ancient sacred spot (said to be the tomb of Romulus) | A |
| **Janus Geminus shrine** | **Tiny bronze shrine with two opposed gates**, near the Argiletum/Basilica Aemilia. Its **doors stand open in wartime**. In 113 Trajan is preparing the Parthian war, so they are **open**. About 4 × 3 × 5 m tall [C], with a statue of two-faced Janus. | A (doors) / C (size) |

### 3.7 Basilica Julia

| Item | Spec | Conf. |
|---|---|---|
| Version | Caesar/Augustan (rededicated AD 12). The visible piers are mostly Diocletianic restorations, but the plan is the same. | A |
| Size | **≈ 101 × 49 m**; central hall (nave) **82 × 18 m**; **5 aisles** (nave + double aisles all round) | A |
| Façade | Along the Forum's S side: **two storeys of arcades** (≈ 18 bays on the long side [C]) on marble-faced piers with **engaged Tuscan-Doric half-columns** (second storey Ionic/Doric [C]). Raised on a flight of ≈ 7 steps. | B |
| Roof | Nave rises above the aisles with a **clerestory**, timber truss roof, tiles | B |
| Floors | Nave in **coloured marble** slabs; aisles in white marble | A |
| Details | **Gaming boards scratched into the steps** and pavement (grids, circles: *tabulae lusoriae*) | A |
| Use | **Centumviral court** (inheritance cases): four tribunals in the nave, separated by curtains (Pliny Ep. 6.33); crowds of spectators in the upper galleries | A |

### 3.8 Basilica Aemilia (Basilica Paulli)

| Item | Spec | Conf. |
|---|---|---|
| Version | Augustan rebuild (14 BC), restored AD 22; stands until 410 | A |
| Size | ≈ 90–100 × 29 m hall plus a front portico [B] | B |
| Façade | On the Forum's N side, the **Porticus of Gaius and Lucius**: a **two-storey arcade** (≈16 arches [C]) with engaged Doric columns, fronting the **Tabernae Novae** (shops: bankers and money-changers) | B |
| Interior | Nave with **columns of africano** and **pavonazzetto** ("Phrygian columns", Pliny NH 36.102, who counts it among the most beautiful buildings in the world); a carved frieze of early Roman legends | A/B |

### 3.9 Capitol backdrop: Tabularium, Temples of Vespasian and Concord, Arch of Tiberius

| Item | Spec | Conf. |
|---|---|---|
| **Tabularium** (78 BC) | Massive substructure façade closing the W end of the Forum below the Capitol: ≈ 70 m wide, a lower blank wall of peperino/Gabine ashlar, an upper **gallery of arches framed by engaged Tuscan-Doric half-columns** (travertine/peperino), and an upper storey above [C]. Houses state archives. | A |
| Temple of Vespasian & Titus | Domitianic (c. 87). Hexastyle prostyle Corinthian, Luna marble, squeezed in front of the Tabularium; columns ≈ 15 m; rich frieze of sacrificial instruments | A/B |
| Temple of Concord | Tiberian (AD 10). **Unusual wide cella set crosswise** with a hexastyle porch projecting in the centre of the long side; **museum of Greek art** inside; faces E onto the Forum | A |
| Porticus Deorum Consentium | Small angled portico with rooms for 12 gods' statues, on the Clivus Capitolinus. The surviving form is 367; a Flavian predecessor is likely [B]. | B/C |
| Arch of Tiberius | AD 16. Single arch spanning the Via Sacra by the Basilica Julia/Temple of Saturn; commemorates the recovery of Varus' standards. Small, ≈ 10 m [C]. | A/C |

### 3.10 Carcer (Mamertine prison, Tullianum)

| Item | Spec | Conf. |
|---|---|---|
| Location | At the foot of the Capitol beside the Curia, on the Clivus Argentarius | A |
| Façade | **Travertine façade** with an inscription naming consuls C. Vibius Rufinus and M. Cocceius Nerva (an early 1st c. AD restoration [B]) | B |
| Upper chamber | Irregular trapezoid ≈ 5 × 4 m [C], peperino/tufa blocks, low vault | B/C |
| **Lower chamber (Tullianum)** | Roughly circular, ≈ 7 m Ø [C], **≈ 2 m high**, of large tufa blocks; **reachable only through a round hole in the floor of the upper chamber**; a spring in the floor | A/B |
| Use in 113 | Holding cell for condemned prisoners before execution (strangulation); famous captives (Jugurtha, Vercingetorix) died here. Small, dark, damp: a good "short dungeon". | A |

### 3.11 Arch of Titus

| Item | Spec | Conf. |
|---|---|---|
| Date | Domitian, c. 81–82, for the deified Titus | A |
| Size | **15.4 m H × 13.5 m W × 4.75 m D**; single passage **8.3 m H × 5.36 m W** | A |
| Order | **Composite** engaged columns (the earliest securely dated composite), 4 per face, on pedestals | A |
| Material | **Pentelic marble**. In 113 entirely marble: **the travertine flanks seen today are Valadier's 1821 restoration**. | A |
| Reliefs | Inside the passage: S panel, the **spoils of Jerusalem** (menorah, trumpets, table); N panel, **Titus in his triumphal quadriga** crowned by Victory. Vault: **coffers** with the apotheosis of Titus (carried by an eagle) at the centre. Small frieze of the triumph over the passage. Victories in the spandrels. | A |
| Attic | Inscription on the **E face** (toward the Colosseum): `SENATVS / POPVLVSQVE·ROMANVS / DIVO·TITO·DIVI·VESPASIANI·F(ilio) / VESPASIANO·AVGVSTO`. Letters gilded bronze or paint [C]. On top, a **bronze quadriga** with Titus [B]. | A/B |
| Siting | On the **summa Sacra Via** (the high point of the Via Sacra on the Velia), axis NW–SE | A |

### 3.12 Temple of Jupiter Optimus Maximus (Capitolium) and the Capitoline

| Item | Spec | Conf. |
|---|---|---|
| Version | **Fourth temple, Domitian's rebuild (dedicated c. 82)** after the fire of 80 | A |
| Podium | **Archaic platform of cappellaccio, ≈ 53.5 × 62 m** (estimates of the superstructure's size are disputed; some reconstructions are smaller) | B |
| Plan | **Hexastyle front with a deep columned porch** (3 rows of 6), colonnades down the flanks (*peripteros sine postico*), **triple cella**: Jupiter (centre), Juno Regina (left), Minerva (right) | B |
| Columns | **Pentelic marble, Corinthian**, cut in Athens; Plutarch (Publ. 15) says recutting in Rome made them too slender. Scale: D ≈ 2.0–2.2 m, H ≈ 18–20 m [C]. | A (material) / C (size) |
| Roof | **Gilded bronze tiles**: Plutarch puts the gilding at more than 12,000 talents. **Gilded doors.** | A |
| Roof sculpture | **Jupiter in a four-horse chariot (quadriga)** at the apex; **bigae with Victories** at the corners; Mars and Venus at the cornice corners | A/B |
| Pediment | Jupiter enthroned between Juno and Minerva; other gods and figures | B |
| Faces | **S/SSE**, toward the Forum Holitorium and the Tiber bend | B |
| Height to ridge | ≈ 30–35 m [C]; on the 40 m Capitoline hill it dominates the skyline, the roof flashing gold | C |
| **Area Capitolina** | Paved precinct around the temple, crammed with **statues, trophies, votive gifts**, the small Temple of Fides, the Temple of Jupiter Feretrius (tiny, archaic; spolia opima), the Casa Romuli (a thatched hut) [C: one also on the Palatine] | A |
| **Arx** (N summit) | **Temple of Juno Moneta** (the old mint was nearby; minting has since moved), the *auguraculum* (an augur's observation spot). The saddle between the two summits is the **Asylum** with the Temple of Veiovis. | A/B |
| **Tarpeian Rock** | Cliff on the S/SW side where traitors were thrown | A |
| Approaches | **Clivus Capitolinus** (a switchback paved road from the Forum, past Saturn), the **Centum Gradus** (a hundred steps up from the Forum Holitorium side). **No Cordonata or Michelangelo piazza** (16th c.). | A |

### 3.13 Forum of Caesar (Forum Iulium) and the Temple of Venus Genetrix

| Item | Spec | Conf. |
|---|---|---|
| Size | **≈ 160 × 75 m** overall (square + temple), long axis NW–SE | A |
| Square | Paved, with **porticoes (double colonnade)** on the long sides; a row of **tabernae** in the SW side, in a two-storey block against the Capitoline slope | A/B |
| **Basilica Argentaria** | **New (Trajanic)**: an arcaded hall on tufa piers behind the western portico along the Clivus Argentarius; bankers and money-changers | A |
| **Temple of Venus Genetrix** | At the NW end facing SE. **Octastyle, pycnostyle**, Corinthian, peripteral on the front and flanks (*sine postico*); high podium (≈ 5 m) with no full frontal stair (lateral access [B]). **Rebuilt by Trajan and rededicated 12 May 113**, the same day as the Column, with a new rich frieze of Cupids and acanthus. | A |
| Statues | **Equestrian bronze statue of Caesar** in front of the temple (its horse had "human-like" forefeet); gilded statue of **Cleopatra** inside the temple; the Appiades fountain (nymph statues) | A |

- **Visitor:** a fresh building site turned showpiece in spring 113: new marble, dazzling white, its frieze being finished or just revealed for the May ceremony.

### 3.14 Forum of Augustus, Temple of Mars Ultor and the firewall

| Item | Spec | Conf. |
|---|---|---|
| Size | **≈ 125 × 90 m** (Platner) | A |
| **Firewall** | Rear (NE) enclosure wall separating the forum from the Subura slum: **up to ≈ 33–36 m high**, **peperino ashlar in alternating headers and stretchers**, with **2 bands of travertine** dividing it into three zones; deliberately irregular plan; marble/stucco on the inner face; the **Arco dei Pantani** gate pierces it toward the Subura | A |
| Square | White marble paving; central **quadriga of Augustus** (inscribed *Pater Patriae*) | A |
| Porticoes | Long sides, raised by steps. **Columns of giallo antico** (ground), with africano and pavonazzetto used elsewhere. The attic above the colonnade has **caryatids** (copies of the Erechtheion korai) **alternating with shield medallions (*clipei*) bearing heads of Jupiter Ammon**. | A |
| Exedrae | Two big semicircular exedrae (≈ 40 m Ø [B]) behind the porticoes, each with **fluted cipollino columns 9.5 m** and **two rows of niches** (lower ≈ 2.5 m, upper ≈ 1.5 m) holding bronze statues of the *summi viri* with *elogia* inscriptions. **NW exedra: Aeneas carrying Anchises and leading Ascanius**, plus the Julii. **SE exedra: Romulus with the spolia opima**, plus Republican heroes. | A |
| **Temple of Mars Ultor** | At the NE end against the firewall, **facing SW**. **Octastyle, peripteros sine postico** (8 front, 8 on each flank, blank back wall). **Luna marble columns D 1.76 m, H ≈ 17.7 m**. Podium ≈ 3.5 m high, faced with marble; frontal stair with an altar. Footprint ≈ 36 × 50 m incl. stair [B]. | A/B |
| Cella | Interior colonnades along the side walls; **apse** with colossal statues of **Mars Ultor, Venus with Cupid and Divus Julius**; a coffered peristyle ceiling with rosettes. **Recovered Parthian standards** displayed. | A |
| Hall of the Colossus | Room off the NW portico with a **colossal statue (≈ 11–14 m) of Augustus/the Genius Augusti** | B |

- **Visitor:** the Senate meets here for war decisions; magistrates leave for provinces from here; boys take the *toga virilis* here. **Important for 113: Trajan's war preparations.**

### 3.15 Templum Pacis (Forum of Vespasian / Temple of Peace)

| Item | Spec | Conf. |
|---|---|---|
| Date | Vespasian, 71–75; Flavian state in 113 (burned 192, rebuilt by Severus) | A |
| Size | Enclosure ≈ **135–145 × 110 m** (reported figures vary). Enclosing wall of peperino lined with marble, several gates. | B |
| Garden square | ≈ 110 × 105 m, **unpaved garden**: **six long raised flowerbeds or water channels** (*euripi*) running lengthwise, with statues. Use rows of low beds bordered by marble kerbs, roses and shrubs. | B |
| Porticoes | Three sides, on **red Aswan granite** columns (unfluted, pink-red speckled) | B |
| Temple | On the **SE side**, **not a projecting temple but a broad apsed hall (aedes)** opening behind a line of 6 larger columns in the portico, flanked by halls: **a library (Bibliotheca Pacis)** and others | B |
| Contents | **Spoils of Jerusalem: the Menorah and the Table of Showbread**; masterpieces of Greek sculpture and painting (formerly in Nero's Golden House) | A |
| Marble plan | The **Severan Forma Urbis (203–211) does not exist yet**. A Flavian plan in the same hall is hypothesized [C]; the game may use one as a "city map" prop if labelled as such. | C |

### 3.16 Forum of Nerva (Forum Transitorium)

| Item | Spec | Conf. |
|---|---|---|
| Date | Built by Domitian, **dedicated by Nerva in 97** | A |
| Size | **Long and narrow, ≈ 120 × 40–45 m**, NE–SW, fitted between the Forum of Augustus and the Templum Pacis; **the Argiletum street ran through it** (hence "transitorium") | B |
| Walls | **No free colonnade**: Corinthian columns set **≈ 1.5 m in front of the walls**, carrying an **entablature that breaks forward over each column** (*colonnacce*). The frieze shows **women's crafts and the myth of Arachne**; the attic has **reliefs of Minerva** in panels. Columns ≈ 9–10 m [C]. | A |
| Temple of Minerva | At the NE end, facing SW: **hexastyle prostyle Corinthian**, partly built into the exedra wall (survived until 1606) | A |

### 3.17 Forum of Trajan (Forum Traiani): square, equestrian statue, Basilica Ulpia, libraries, Column

The **newest complex in Rome**: forum dedicated 1 Jan 112, Column dedicated **12 May 113**. Architect **Apollodorus of Damascus** (attributed). Financed by the Dacian spoils (*ex manubiis*). The Quirinal slope was **cut back** to make room; the Column's height marks how much was removed (per its inscription).

**Overall layout** (axis NW–SE, entering from the SE):

| Zone (SE → NW) | Spec | Conf. |
|---|---|---|
| Overall complex | **≈ 300 × 185 m** including the Markets' side, or ≈ 300 m along the axis | B |
| Entrance (SE side, from the Forum of Augustus) | A wall with a central **monumental arch** (coins show a single arch with an attic carrying a six-horse chariot of Trajan and trophies). The **recent excavations (Meneghini, 1998–2008) show the S side as a straight wall with a central arch**, not the hemicycle of older plans. | B |
| **Square** | **≈ 120 × 90 m**, paved in white **Luna marble** slabs. Enclosing walls of peperino clad in marble. | B |
| **Equestrian statue of Trajan** (Equus Traiani) | Colossal **gilded bronze**, in the **S part of the square near the entrance** (foundations located; previously thought to be central); base ≈ 10 × 5–7 m [C]; statue ≈ 2.5–3× life [C]. Constantius II marvelled at it (Ammianus 16.10.15). | A/B |
| E and W porticoes | Raised by **3 steps of giallo antico**; single colonnade of **pavonazzetto** Corinthian columns (≈ 9 m [C]); **attic over each column carrying a statue of a Dacian captive** in pavonazzetto (or with white heads and hands), alternating with **shield medallions with portraits**; above the roofline, **gilded statues of horses and military standards**, inscribed *EX MANVBIIS* (Gellius 13.25) | A/B |
| Exedrae (hemicycles) | Behind each lateral portico, a big **hemicycle ≈ 45 m Ø** (E and W), with marble floors; the E exedra backs onto the street in front of the Markets | B |
| **Basilica Ulpia** (N side, across the axis) | See the table below | |
| Column courtyard | Behind the basilica: **a small court ≈ 24 × 16 m [C]** with the Column in the centre, **flanked by the Greek and Latin libraries** | B |
| **Libraries (Bibliotheca Ulpia)** | Two halls, each ≈ 27 × 20 m [B], facing each other across the court. Wall **niches for wooden book cabinets (armaria)** on **two levels** with a gallery; **columns of pavonazzetto**; **floors of grey granite slabs with giallo antico bands** [C]. The **upper galleries and roofs gave close views of the Column's frieze**. | B |
| Temple of Divus Traianus | **Not in 113** (after 117, if it existed at all) | A |

**Basilica Ulpia:**

| Item | Spec | Conf. |
|---|---|---|
| Size | Hall **≈ 117 × 55 m** (excluding apses); with the two **apses** at the short (NE/SW) ends, **≈ 170 m** overall: the **largest basilica in Rome** | A/B |
| Plan | **Nave + 2 aisles each side (5 aisles)**, colonnades on all four sides of the nave (an ambulatory); 96 columns in total [B]; nave ≈ 25 m wide [B] | B |
| Columns | **Ground order: grey granite** (Mons Claudianus) Corinthian, ≈ 9–11 m [C]; **upper gallery: cipollino** (green) columns, ≈ 7 m [C] | B/C |
| Height | Nave roof ≈ 25–30 m [C]. Wikipedia's "50 m roof" is doubtful. | C |
| Roof | Timber trusses (a span of ≈ 25 m, a famous engineering feat), **covered with gilded bronze tiles** (Pausanias 5.12.6; 10.5.11) | A/B |
| **Façade to the square** | Long S side with **three projecting porticoes (porches)**: the central one larger, with **10 giallo antico columns**. **Attic with statues of Dacian captives**; above the central porch a **gilt-bronze quadriga escorted by Victories**, with **bigae** above the side porches and statues of Trajan. Three doors. | B |
| Floors | **Coloured marble**: giallo antico and pavonazzetto squares and bands | A/B |
| Interior | Courts; the *atrium libertatis* (manumissions) was associated with it [B]; statues; great space and light | B |

**Trajan's Column (Columna Traiani):**

| Item | Spec | Conf. |
|---|---|---|
| Dedication | **12 May 113** | A |
| Heights | **Pedestal ≈ 5.3 m** + **column (base + shaft + capital) 29.78 m = 100 RF** → **≈ 35 m**; with the **bronze statue of Trajan** ≈ **38–40 m** | A/B |
| Shaft | **D = 3.70 m** at the bottom (≈ 3.2–3.3 m top [C]); **≈ 17–20 drums of Luna marble** (≈ 32 t each); capital block 53.3 t | A |
| Order | **Tuscan-Doric**: torus base carved with laurel leaves; **Doric capital with egg-and-dart echinus**; a square abacus forming a **viewing platform** with a bronze railing | A |
| **Frieze** | **Spiral band 190 m long, 23 windings**, band height increasing from ≈ 0.9–1.0 m at the bottom to ≈ 1.25 m at the top; **155 scenes, ≈ 2,660 figures** (Trajan appears 58 times): the two Dacian Wars (101–102, 105–106). Low relief (≈ 2–5 cm); **drill holes for small bronze weapons** (spears, swords); traces of paint have been debated, so keep any paint subtle [C]. | A |
| Pedestal | Cube ≈ 5.5 m with **reliefs of piled Dacian arms and armour** (shields, helmets, dragon standards: the *draco*); **four eagles at the corners holding a garland**; a **door on the SE side** with the **dedicatory inscription** above it, held by two Victories | A |
| Inscription (above the door) | `SENATVS·POPVLVSQVE·ROMANVS / IMP·CAESARI·DIVI·NERVAE·F·NERVAE / TRAIANO·AVG·GERM·DACICO·PONTIF / MAXIMO·TRIB·POT·XVII·IMP·VI·COS·VI·P·P / AD·DECLARANDVM·QVANTAE·ALTITVDINIS / MONS·ET·LOCVS·TANT[IS·OPER]IBVS·SIT·EGESTVS` | A |
| Interior | **Spiral staircase of 185 steps** carved inside the drums, lit by **≈ 40 small slit windows**, rising to the platform. Inside the pedestal is a chamber (later **Trajan's tomb**, 117; **empty in 113**). | A |
| Top | **Bronze statue of Trajan** (cuirassed, with spear/globe [C]); ≈ 4–5 m [C] | B/C |
| Views | Only partial views from the small court, the library galleries and the basilica roof. **The frieze can't be read in full from the ground** (part of the design). | B |

- **Visitor (spring 113):** before 12 May the Column may still be wrapped in **scaffolding**, with carvers finishing the upper frieze in situ [C, a plausible gameplay hook]. On dedication day there is a great ceremony; Venus Genetrix is rededicated the same day.
- **Simplification:** at LOD1–2 the spiral is a **helical normal/relief texture** on the lathe shaft (the band is a helix: 23 turns over the shaft height, with band height increasing toward the top). Interior stair: a separate interior mesh (it's playable!).

### 3.18 Markets of Trajan (Mercati di Traiano)

| Item | Spec | Conf. |
|---|---|---|
| Date | c. 100–112, built into the cut-back Quirinal slope **behind the E exedra of the Forum of Trajan**, separated from it by a **basalt-paved street** and a fire-break | A |
| **Great hemicycle** | **Three-storey curved façade** (≈ 60 m across the arc [C]), concentric with the forum exedra. **Ground floor: 11 tabernae** with travertine door frames. **2nd storey: a row of arched windows framed by brick pilasters**, with **alternating triangular and segmental brick pediments** over them. **3rd storey: a set-back terrace or ambulatory.** Small semi-domed halls at each end. | A |
| Materials | **Exposed brick-faced concrete** (fine red and yellow bricks with thin mortar joints and brick mouldings), **travertine thresholds, door frames and corbels**. The best example of "Roman utilitarian beauty". | A |
| Upper levels | Streets climb the slope: the **"Via Biberatica"** (a medieval name; use "upper street" in-game or invent a Latin name [C]), lined with **shops in two storeys**, basalt paved | A |
| **Great Hall (Aula Grande)** | **Vaulted two-level hall ≈ 30 × 10 m [C]**, with **6 cross (groin) vaults on travertine consoles** over the central space, shops on two levels opening off it, and a light gallery | A/B |
| Count | **≈ 150 rooms/shops** on up to 6 levels | B |
| Function | Shops, offices and possibly the administration (procurator) of the forum. "Market" is a modern label [B]. Use it as the trading hub: oil, wine, fruit, spices, fish (tanks on the upper floors [C]), cloth, scribes, dole offices (*frumentationes*?) [C]. | B/C |

### 3.19 Colosseum (Amphitheatrum Flavium)

| Item | Spec | Conf. |
|---|---|---|
| Date | Vespasian/Titus (inaugurated 80); **hypogeum and top storey completed under Domitian** | A |
| Plan | **Ellipse 188–189 × 156 m**; perimeter ≈ 527–545 m | A |
| Height | **≈ 48–50 m** | A |
| Major axis | Roughly E–W (take the exact bearing from the topography doc) | B |
| **Storeys** (outer ring) | See the storey table below | B |
| Bays | **80 arches per storey on the 3 arcaded storeys**; bay axis ≈ 6.6–6.8 m; piers ≈ 2.4 m wide | A/B |
| **Entrances** | **80 ground-floor arches**: **76 numbered I–LXXVI** (carved numerals above the arches, possibly painted red), plus **4 unnumbered axial entrances**. The 2 on the minor axis lead to the **imperial and magistrates' boxes**; the 2 on the major axis serve the arena (*Porta Triumphalis* and *Porta Libitinensis*, for the dead). The axial entrances may have had **small porches** (a projecting gabled or arched front) [B]. | A/B |
| Arch openings | Ground: ≈ **4.2 m W × 7.0 m H**; upper storeys ≈ 4.2 × 6.4 m [C]. **Statues in the arches of storeys II and III** (shown on coins of Titus) [B]. Balustrade/parapet across the upper arches. | B |
| **Attic** | Solid wall with **flat Corinthian pilasters**; **small rectangular windows in alternate bays (≈ 40)**; **bronze shields (*clipei*) on the wall in the other bays** [B]; near the top a ring of **240 stone corbels** (3 per bay) supporting the **velarium masts**, which passed through **matching holes in the top cornice** | A/B |
| **Velarium** | A huge awning of linen or canvas strips on **240 timber masts**, rigged by **sailors of the Misenum fleet** (lodged in the Castra Misenatium nearby). Ropes run down to the **ring of travertine bollards (*cippi*) ≈ 18 m out** (one theory [C]). Colour: natural canvas `#E8E0C8` [C]; Pliny records sky-blue starry awnings elsewhere. In practice it **shaded the cavea, not the arena**: a ring with an open centre. | A/B |
| Surface | **Smooth travertine.** **The pockmarks on the modern building are medieval iron-robbing holes: in 113 the surface is smooth and continuous.** About 300 t of iron clamps were hidden inside. | A |
| Surround | **Travertine-paved ring ≈ 18 m wide**, bounded by **travertine bollards (cippi)**, some connected by gates/chains [C] | A |
| **Arena** | Floor ≈ **83 × 48 m** (≈ 87 × 55 m to the podium wall): **timber boards covered with sand** (*harena*), with **trapdoors** | A/B |
| Podium wall | ≈ **4–5 m** high, marble-faced, with a protective net or railing [C] and an **access corridor behind**; above it a terrace with wide steps for **senators' movable chairs (*bisellia*)** | A/B |
| **Cavea** | **Maenianum primum** (equites), **maenianum secundum** (*imum*, *summum*: citizens by rank), and **maenianum summum in ligneis**: **wooden seats at the top for women and the poor**, under a **colonnade (*porticus in summa cavea*)** of granite/cipollino columns [B]. Marble seats; **vomitoria** (entrance passages) open onto each level. | A/B |
| Capacity | ≈ 50,000 (modern estimate) | B |
| **Imperial box** (*pulvinar*) | On the **minor axis, S side** [B], a richly marbled box; magistrates' box opposite [B] | B |
| Interior corridors | Annular vaulted ambulatories, stairs; **painted stucco** (red, green, white) on vaults; **fountains and latrines** | B |
| **Hypogeum** | Domitianic: **2 underground levels ≈ 6–7 m below the arena**; a central corridor along the major axis plus parallel and curved corridors; **cages, ramps and capstan-driven lifts** for animals and scenery; **80 vertical shafts** to the arena; **a tunnel E to the Ludus Magnus**; drainage to the sewers | A/B |

Outer storey table:

| Storey | Height (≈) | Order (engaged half-columns) | Openings |
|---|---|---|---|
| I (ground) | 10.5 m | Tuscan (Doric-like) | 80 arches, numbered |
| II | 11.9 m | Ionic | 80 arches, statues + parapet |
| III | 11.6 m | Corinthian | 80 arches, statues + parapet |
| IV (attic) | ≈ 14 m | Flat Corinthian pilasters | 40 small windows + shields; 240 corbels; masts above |

- **Visitor:** on game days, crowds, awnings, perfume sprays (saffron water), food sellers outside. Morning: *venationes* (beast hunts); midday: executions; afternoon: gladiator pairs. **Note for 113:** Trajan's huge games for the Dacian triumph were in 107 (123 days, 10,000 gladiators). In 113 the games are smaller (the emperor's departure festivities?) [C].
- **Simplification:** generate one bay (pier + half-column + arch + entablature slice) per storey as an instanced unit placed on the ellipse. The inner cavea is a lofted ellipse ring with stepped profile + vomitoria cut-outs as decals. Hypogeum as a separate interior chunk.

### 3.20 Ludus Magnus (main gladiator school)

| Item | Spec | Conf. |
|---|---|---|
| Date | Domitian; **rebuilt by Trajan** (floor raised ≈ 1.4 m; the visible brick is mostly Trajanic, so **it is effectively new in 113**) | A |
| Location | **Just E of the Colosseum** (between the Esquiline and the Caelian), linked by an **underground tunnel** to the Colosseum hypogeum | A |
| Plan | Rectangular block (≈ 100 × 80 m [C]) around a **porticoed courtyard** containing the **practice arena** | B/C |
| **Practice arena** | **Elliptical ≈ 63 × 42 m** with a **small cavea for ≈ 3,000 spectators** (spectators came to watch training) | A |
| Courtyard | **Portico** of travertine columns or brick piers [C]; **four small triangular fountains at the corners** of the courtyard | A |
| Living quarters | **Small cells** (≈ 3 × 4 m [C]) for gladiators opening off the porticoes, on **3 storeys**; an outer row of shops | A/B |
| Neighbours | **Ludus Matutinus** (beast-hunters), **Ludus Gallicus**, **Ludus Dacicus** (Dacian captive gladiators: topical in 113), **Castra Misenatium** (velarium sailors), **Armamentarium** (arsenal), **Summum Choragium** (scenery store), **Spoliarium** (where dead gladiators were stripped), **Saniarium** (infirmary) [A/B as names, C as details] | B |

### 3.21 Meta Sudans

| Item | Spec | Conf. |
|---|---|---|
| Date | Flavian (c. 89–96) | A |
| Form | **Conical fountain ≈ 17 m high** (a cone on a cylindrical drum [B]) | A |
| Basin | **Circular, 16 m Ø, 1.4 m deep** | A |
| Materials | Brick and concrete core faced with **marble** | A |
| Water | **"Sweats"**: water oozes from the top or from openings and runs down the cone in a sheen; no jet | A/B |
| Site | Just W/SW of the Colosseum, where the **triumphal route turns onto the Via Sacra**; a meeting point of several of the 14 regions | A |

### 3.22 Colossus of Nero / Sol

| Item | Spec | Conf. |
|---|---|---|
| Height | **≈ 30–35 m** (Pliny 106.5 RF ≈ 31.5 m; Suetonius 120 RF ≈ 35.5 m) | A |
| Material | **Bronze** (by Zenodorus). Gilding is uncertain [C]: use warm polished bronze with gilded rays. | A/C |
| Identity in 113 | **Sol**, converted under Vespasian (the face reworked), with a **radiate crown of 7 rays** (each ≈ 6 m [C]) | A/B |
| Pose | Standing nude; one hand on a **rudder/staff or holding a globe**, the other raised toward the brow [C] (later coins differ) | C |
| **Location in 113** | **In the former vestibule of Nero's Golden House on the Velia (upper Via Sacra), on the site where Hadrian later built the Temple of Venus and Roma.** **Not beside the Colosseum**: Hadrian moved it there c. 128 with 24 elephants. | A |
| Base | A high pedestal ≈ 7–14 m [C] in an open court or porticoed precinct | C |

### 3.23 Baths of Trajan (Thermae Traiani)

| Item | Spec | Conf. |
|---|---|---|
| Date | **Dedicated 22 June 109** (Fasti Ostienses, "X K. Iul."; some secondary sources say 1 July); architect Apollodorus (attributed) | A |
| Location | **Oppian Hill, built over the buried Esquiline wing of Nero's Golden House** | A |
| Enclosure | **≈ 330 × 340 m**, an outer precinct with gardens, porticoes and **exedrae** (libraries, lecture halls) at the SW and NW corners; **a great SW exedra with stepped seating (a theatre-like stadium?)** facing the bath block [B] | A/B |
| Bath block | **≈ 190 × 210 m [C]**, symmetrical along a **NE–SW axis**, rotated ≈ 30° from the Baths of Titus so the **caldarium faces SW for afternoon sun** | A |
| Sequence (NE → SW) | **Natatio** (open-air pool) → **frigidarium** (the largest hall: **cross-vaulted on 8 granite columns [C]**) → tepidarium → **caldarium** (big windows, **glazed**, facing SW) | A/B |
| Side suites | Palaestrae (exercise courts) with porticoes on either side; apodyteria (changing rooms); latrines | B |
| **Cistern (Sette Sale)** | NE of the baths: **9 parallel vaulted chambers** (≈ 30 m long each [C]) on two levels, **≈ 8 million litres** | A |
| Materials | Brick-faced concrete; marble revetments; columns of granite and coloured marbles; mosaic and sectile floors; **vaulted roofs**; huge windows | A/B |
| Smoke | **Furnace (praefurnium) smoke plumes** rise along the service sides all day | B |
| Fee | A *quadrans* (the smallest coin); men and women may share facilities in 113 (Hadrian banned mixed bathing later) | B |

### 3.24 Domus Flavia / Domus Augustana (Palatine palace)

| Item | Spec | Conf. |
|---|---|---|
| Date | **Domitian, completed 92**; architect **Rabirius**. Trajan lives here; it is the "Palatium". | A |
| Siting | Occupies the **central and SE Palatine**. The **public wing (Domus Flavia)** faces **N toward the Area Palatina**; the **private wing (Domus Augustana)** spreads S to a **curved façade overlooking the Circus Maximus**. | A |
| **Aula Regia** (throne room) | **≈ 30.5 × 38.5 m**, height **≥ 30 m**; walls with **niches holding colossal statues of green-black basanite** (Hercules, Bacchus found); **columns of pavonazzetto and giallo antico** stacked in two orders against the walls; coffered timber ceiling [C]; apse for the throne | A/B |
| Flanking | **Basilica** (judicial hall, apsed, two rows of columns) and **Lararium** | A/B |
| Peristyle | Huge porticoed court with **giallo antico columns** around a **pool with an octagonal "maze" island of channels** | A |
| **Cenatio Iovis** (dining hall) | S of the peristyle; **≈ 31 × 29 m**, flanked by **two courts with oval marble fountains (nymphaea)** visible through windows | A/B |
| Domus Augustana | Upper peristyle; a **lower sunken peristyle** (≈ 10 m below) with a **pool and an island of pelta-shaped (crescent) basins**; residential suites; the exedra façade to the Circus | A |
| **Palatine "Stadium"** | **≈ 160 × 48 m sunken garden** in the shape of a hippodrome with a **two-storey portico** and a **curved S end**; an **imperial viewing box** (exedra) on the E side | A/B |
| Other Palatine sights | **Temple of Apollo Palatinus** (Augustan, **Luna marble**, **gilded chariot of Sol on the roof**, ivory doors; portico of the Danaids in giallo antico), **Temple of Magna Mater** (Cybele; stairs and games), **Casa Romuli** (a thatched hut, preserved and rebuilt), **Domus Tiberiana** (older palace on the NW summit, with the Domitianic ramp down to the Forum) | A |
| Materials | Brick-faced concrete, walls ≈ 3 m thick, **lavish coloured marble everywhere inside**, white marble outside [C] | A |

### 3.25 Circus Maximus

| Item | Spec | Conf. |
|---|---|---|
| State in 113 | **Rebuilt in stone by Trajan (dedicated c. 103)**; Pliny's *Panegyricus* (51) mentions the added seating and the façade "worthy of a temple". **Brand-new façade.** | A |
| Size | **≈ 621 m long × 118–150 m wide** (including the outer façade) | A/B |
| Axis | **NW–SE** in the Murcia valley between the Palatine (NE side) and the Aventine (SW side). **Starting gates (carceres) at the NW end, curved end at the SE.** | A |
| Track (arena) | ≈ 580 × 80 m [C], sand over packed earth | C |
| **Seating** | **3 tiers (maeniana)**: the lowest of stone/marble (senators front centre, equites behind), the upper tiers for the plebs; ≈ **150,000+ seats** (Pliny's 250,000 is exaggerated) | A/B |
| **Façade** | **Three storeys of arcades** (like the Colosseum but lower), the ground floor full of **shops (tabernae)**: cookshops, astrologers, prostitutes (*fornices*), wine shops (the fire of 64 began here) | A |
| **Spina / Euripus** (central barrier) | ≈ **335 m long** [B], ≈ 8–10 m wide [C]: a **chain of water basins** (*euripi*) bridged in places, carrying **monuments** | B |
| **Obelisk of Augustus** | **Red Aswan granite** (Seti I/Ramesses II, from Heliopolis); **shaft ≈ 23–26 m** (sources differ) on a Roman pedestal ≈ 3–4 m [C]; at the **centre of the spina**. **Only ONE obelisk in 113**: the second (Lateran) obelisk came in 357. | A |
| Lap counters | **Seven eggs** (*ova*) on a raised frame at one end and **seven bronze dolphins** (spouting water; Agrippa, 33 BC) at the other, turned or lowered one per lap | A |
| Spina shrines | Statues of **Cybele riding a lion**, **Victories on columns**, small shrines; the **underground altar of Consus** at the first meta (uncovered only at the Consualia); the **shrine of Murcia** | A/B |
| **Metae** (turning posts) | At each end: a **semicircular podium carrying three tall conical pillars** with egg-shaped tips (bronze-clad, gilded [C]); ≈ 6–8 m tall [C] | A (form) / C (size) |
| **Carceres** (starting gates) | **12 stalls** on a **slight curve** (so all lanes are equal to the start line), each ≈ 3.5–4 m wide [C], with **herm pilasters** and **spring-loaded double gates** opened together; flanked by **towers (*oppida*)**; the central **Porta Pompae** (processional gate) with the **magistrate's box above** (he drops the *mappa*, a white cloth, to start the race) | A/B |
| **Pulvinar** | The imperial box on the **Palatine (NE) side**, temple-like (columns, pediment), originally for images of the gods; linked to the palace above | A/B |
| Temple of Sol (and Luna) | Built into the seating on the **Aventine (SW) side** opposite | B |
| **Arch of Titus (in the Circus)** | **Triple arch (AD 81)** at the **curved SE end**, serving as the processional gate. **Not the Arch of Titus on the Via Sacra.** | A |
| Canal | An old perimeter channel between track and seats, filled in by Nero; a small drain remains [B] | B |

- **Factions in 113: four** — Russata (red), Albata (white), Veneta (blue) and Prasina (green). Domitian's purple and gold factions have lapsed. Charioteers (§6.6).
- **Simplification:** a stretched stadium (two straights + one semicircle) built with the arcade-bay instancer of the Colosseum (3 storeys). Seating as a stepped loft. The spina as a long low platform with props. The carceres as an instanced gate bay ×12 on an arc.

### 3.26 The Pantheon site in 113 (burned 110; Trajanic rebuild about to start)

| Item | State | Conf. |
|---|---|---|
| History | Agrippa's Pantheon (27–25 BC) → burned 80 → **restored by Domitian** → **struck by lightning and burned in 110** (Orosius 7.12; Jerome, *Chron.*) | A |
| Rebuild | Brick-stamp analysis (Hetland 2007 and others) puts the **start of the present building under Trajan, c. 114**, with site preparation possibly soon after 110. Hadrian completed and dedicated it c. 125–128. The architect may have been Apollodorus [C]. | B |
| **What a visitor in spring–summer 113 sees** | **A cleared or clearing ruin and building yard**: hoarding; **burned walls of the Domitianic building** being demolished; fire-cracked, reddened column drums; charred roof timbers; **survey stakes and the first foundation trenches** for the giant ring (the foundation ring is ≈ 7.3 m wide × 4.5 m deep); **stacks of new stamped bricks**, lime pits, sand, timber; treadwheel cranes; **ox-carts parked at night**; perhaps the **first granite shafts arriving** later (14.15 m columns with 40 RF shafts; for 114+). **Treat it as a construction-site POI.** | B/C |
| Old porch | The Agrippan/Domitianic porch also faced **N** onto a forecourt (1990s excavations); its fire-damaged remains may still stand at the N end [C] | C |
| Neighbours (standing) | **Baths of Agrippa** (restored after 80), **Basilica of Neptune** (damaged? restored later by Hadrian) [C], **Saepta Julia** (a voting enclosure turned market/arcade, with luxury shops), **Iseum Campense** (Temple of Isis, with obelisks and sphinxes) | A/B |
| Future-proofing | The finished Pantheon for later "time skips": rotunda inner Ø **43.3 m** = height; oculus 8.2–9 m; porch of **16 granite columns** (8 front), shafts 11.9 m; bronze roof tiles; faces N | A |

### 3.27 Theatre of Pompey, Temple of Venus Victrix and Porticus Pompeiana

| Item | Spec | Conf. |
|---|---|---|
| Date | **55 BC**, Rome's first permanent stone theatre; scaena restored by **Domitian after the fire of 80** | A |
| Cavea | Semicircle **≈ 150–160 m Ø**, with its **curve to the W** (the modern Via di Grotta Pinta follows it) and the stage to the E; capacity ≈ 11,000 (the catalogues give 17,000–22,888 "places") | A/B |
| Façade | **Arcaded travertine** on ≈ 3 storeys with engaged orders (like Marcellus but larger) [C] | C |
| **Temple of Venus Victrix** | **At the top centre of the cavea on the axis**: the seats are "steps up to the temple". Plus small shrines of **Honos, Virtus and Felicitas** [A]. A prostyle temple on the upper rim, ≈ 20 m wide [C]. | A/C |
| Scaena | **≈ 95 m long**, a 3-storey **scaenae frons** with columns of coloured marble, niches and statues [C]; stage roof | B/C |
| **Porticus Pompeiana** | E of the stage: **a vast four-sided portico ≈ 180 × 135 m** enclosing a **garden with double rows of plane trees (*platanones*) in groves**, **fountains**, **statues** (a Greek art gallery), shaded walks | A/B |
| **Curia Pompeia** | At the **E end of the portico**: **where Caesar was murdered** (44 BC); **walled up by Augustus**, later a latrine (tradition) [B] | A/B |
| Hecatostylon | "Portico of 100 columns" along the N side | A |
| **Temples of the Largo Argentina** | Just E of the Curia: four Republican temples in a row (A–D), including the round Temple C/B (of Fortuna Huiusce Diei, Temple B) | A |

### 3.28 Theatre of Marcellus

| Item | Spec | Conf. |
|---|---|---|
| Date | Begun by Caesar, dedicated by **Augustus, 13–11 BC** | A |
| Size | **Outer diameter ≈ 111–130 m** (Wikipedia gives 111 m, Italian surveys ≈ 130 m; Platner's "150 m" probably includes the stage block) | B |
| Façade | **≈ 32.6 m high, 3 tiers of 41 arches**: **Doric** (ground), **Ionic** (2nd), and an **attic with Corinthian pilasters** (3rd; lost); **travertine**; piers **≈ 3 m wide × 2 m thick** | A/B |
| Orientation | Curved façade toward the **N/NE** (Circus Flaminius side); **scaena toward the Tiber** (SW), with views of Tiber Island | B |
| Stage | **≈ 80–90 × 20 m**, with **apsidal halls ≈ 25 × 15 m** at each end | A |
| Capacity | ≈ 11,000–14,000 (the catalogue gives 17,580/20,500 "places") | A/B |
| Neighbours | **Temple of Apollo Sosianus** (Corinthian, Luna marble, beautifully carved; 3 columns survive), **Temple of Bellona** (where the Senate received victorious generals; the *columna bellica* in front, from which the fetial priest declared war by hurling a spear), **Porticus Octaviae** (§3.38) | A |

### 3.29 Mausoleum of Augustus (+ Ustrinum, Horologium, Ara Pacis)

| Item | Spec | Conf. |
|---|---|---|
| Date | 28 BC onward. **Nerva (98) was the last emperor interred**; Trajan will be buried in his Column instead. | A |
| Size | **Ø ≈ 87–90 m (300 RF), height ≈ 42–45 m** | A |
| Structure | **Concentric ring walls** of tufa/concrete; an outer **travertine-faced drum ≈ 12 m high** [B] with a moulded cornice; above it an **earth mound (tumulus) planted with evergreen trees (cypresses) up to the summit** (Strabo 5.3.8); a central drum/pier rising out of the top carrying a **colossal bronze statue of Augustus** | A/B |
| Entrance | **Faces S**: a door in the drum, flanked by **two bronze pillars bearing the Res Gestae** | A |
| Obelisks | **Two uninscribed pink granite obelisks ≈ 14.7 m** flanking the entrance; **when they were set up is uncertain** (attested by the 4th c.). Optional in 113 [C]. | C |
| Interior | Corridor → ring passages → a **central burial chamber** with **niches for urns** (Augustus, Livia, Marcellus, Agrippa, Octavia, Tiberius, Germanicus' family, Claudius, Vespasian?, Nerva) | A/B |
| Park | Surrounded by **public parkland with groves and walks** (Strabo); the **Ustrinum** (cremation enclosure, travertine walls with an iron railing, poplars [A]) nearby | A |
| Horologium Augusti | SE of the mausoleum: an **Egyptian obelisk (≈ 21.8 m, red granite, Psamtik II) used as a sundial gnomon** over a **paved field with bronze-inlaid lines and Greek labels** (the meridian line was relaid under Domitian at a higher level [B]) | A/B |
| **Ara Pacis** | **Altar enclosure ≈ 11.6 × 10.6 m, walls ≈ 4.6 m high**, Luna marble, **relief friezes** (imperial procession, Tellus, acanthus scrolls), **painted** [A traces]; on the Via Flaminia/Via Lata (W side) | A |

### 3.30 Temple of Portunus (Forum Boarium)

| Item | Spec | Conf. |
|---|---|---|
| Date | Rebuilt c. 120–80 BC | A |
| Plan | **Ionic, tetrastyle, pseudoperipteral**: a **4-column front, 2 columns deep in the porch**; **engaged half-columns** along the flanks (5) and back (4) [B]; high podium with a frontal stair | A |
| Size | Footprint ≈ 10.5 × 19 m [C]; podium ≈ 2.3 m [C]; columns ≈ 8.5 m [C] | C |
| Materials | **Anio tufa** walls and engaged columns; **travertine** for the free porch columns, bases, capitals and corners; **all stuccoed white** | A |
| Capitals | Ionic, with **diagonal volutes on the corner columns** | A |
| Context | Next to the **river harbour (Portus Tiberinus)**, the cattle market, the **Ara Maxima of Hercules** and the round temple. Faces the river side (N/NE [C]). | A/C |

### 3.31 Round temple of Hercules Victor ("Olivarius")

| Item | Spec | Conf. |
|---|---|---|
| Date | Late 2nd c. BC (the earliest surviving marble building in Rome); Tiberian repairs | A |
| Plan | **Tholos: 20 Corinthian columns** ringing a round marble cella | A |
| Size | **Ø 14.8 m** (colonnade); columns **10.66 m**, D ≈ 1.0 m | A |
| Materials | **Pentelic marble** (10 columns replaced in **Luna** under Tiberius, visibly different white); tufa foundation | A |
| Base | **Greek-style stepped crepidoma** (≈ 3 steps all round), not a podium | A |
| Roof | **Low conical roof of tiles** (the original is lost; the modern roof is post-classical). No dome. | B |
| Faces | **E** | B |

### 3.32 Tiber Island (Insula Tiberina) and the Temple of Aesculapius

| Item | Spec | Conf. |
|---|---|---|
| Island | **≈ 270 m long × 67 m wide**, a boat shape, linked by the **Pons Fabricius** (to the Campus Martius side) and the **Pons Cestius** (to Trastevere) | A |
| "Ship" | The **downstream (SE) tip was faced in travertine as a ship's prow**, with a **relief of Aesculapius and his serpent-staff** (and a bull's head) [A, surviving fragment]. The story that the whole island was walled as a ship with an **obelisk as mast** is a later reconstruction [C]: model the prow only, or add the obelisk as an option. | A/C |
| Temple of Aesculapius | Founded 291 BC (the sacred snake from Epidaurus), at the **SE end** (under San Bartolomeo). **Form unknown**: build a modest prostyle temple on a podium (Ionic or Tuscan, 4–6 columns) [C], with **porticoes for sick pilgrims sleeping in the sanctuary (incubation)**, sacred snakes, a well/spring | A (existence) / C (form) |
| Props | **Terracotta anatomical votives** (legs, eyes, wombs, hands), inscribed thank-offerings, sick and abandoned slaves (Claudius decreed that slaves abandoned there became free) | A |
| Other shrines | Faunus, Jupiter Iurarius, Veiovis, Semo Sancus [A] | A |

### 3.33 Tiber bridges in 113 (downstream order)

| Bridge | Date / state | Spec | Conf. |
|---|---|---|---|
| **Pons Mulvius** (Milvian) | 109 BC, stone | ≈ 3 km N of the city on the Via Flaminia; several arches, tufa/travertine | A |
| **Pons Neronianus** | 1st c. AD (Nero; maybe Caligulan), stone | Links the Campus Martius to the Vatican plain (Nero's circus, the Gardens of Agrippina); near the modern Ponte Vittorio Emanuele | B |
| **Pons Agrippae** | c. 25–12 BC, stone | Near the modern Ponte Sisto (rebuilt under Antoninus Pius in 147) | B |
| **Pons Fabricius** | **62 BC**, still standing | **2 arches of 24.5 m span**, length 62 m, **width 5.5 m**; **a small relief arch through the central pier**; tufa core, **travertine arch rings**; the inscription `L·FABRICIVS·C·F·CVR·VIAR·FACIVNDVM·COERAVIT·IDEMQVE·PROBAVIT` four times. The brick facing seen today may be later [C]. | A |
| **Pons Cestius** | Mid-1st c. BC (**original**, rebuilt in 370 and again in the 19th c.) | **1 main arch ≈ 23–24 m**, 2 small side (relief) arches; island to Trastevere | B |
| **Pons Aemilius** | Piers 179 BC, arches 142 BC; stone (the later "Ponte Rotto") | ≈ 6 arches [C], tufa/travertine; the Cloaca outlet just downstream on the E bank | B |
| **Pons Sublicius** | The oldest, **all timber, built without metal for religious reasons**, maintained by the pontiffs | **Timber pile-and-beam bridge**, near the Porta Trigemina below the Aventine | A |
| **Not yet** | — | **Pons Aelius** (134), Pons Aurelius (later), **Pons Probi** (late 3rd c.). All modern Ponte names are anachronistic. | A |

Generic: deck width 5–8 m, basalt paving, **parapets ≈ 1.0–1.2 m** of travertine slabs, small shrines and statues at the abutments [C].

### 3.34 Cloaca Maxima

| Item | Spec | Conf. |
|---|---|---|
| Route | From the **Argiletum/Subura**, under the **Forum of Nerva and the Forum Romanum** (beside the Basilica Aemilia, under the Basilica Julia area), then the **Velabrum** and the **Forum Boarium**, to the **Tiber near the Pons Aemilius** | A |
| Length | ≈ 1.6 km [C] | C |
| Channel | **Peperino-built vaulted section: 4.2 m high × 3.2 m wide**; other sections smaller and brick-faced (Imperial repairs); paved bottom (lava/basalt); side drains entering at many points | A |
| Depth | Up to **≈ 10 m below modern grade** near the Velabrum (less below ancient grade) | A |
| **Outlet** | A semicircular arch in the river embankment with **three concentric rings of voussoirs** (Gabine stone and Grotta Oscura tufa), c. 100 BC; span ≈ 4.5 m [C] | A/C |
| Gameplay | Walkable maintenance ledges, sluice gates, rats, side tunnels: a natural **"sewer dungeon"**. Agrippa boated through it in 33 BC. | A |

### 3.35 Castra Praetoria

| Item | Spec | Conf. |
|---|---|---|
| Date | **AD 23** (Sejanus/Tiberius), on the NE edge of the city (Viminal/Esquiline plateau) | A |
| Size | **440 × 380 m**, a rectangle with **rounded corners** | A |
| Walls | **Brick-faced concrete, original height 4.73 m**, with **battlements**. **In 113 the walls are freestanding at their original height**: they were raised and absorbed into the Aurelian Walls only in the 270s. | A |
| Gates | 4 gates, one centred on each side (**porta praetoria / decumana** on the long N–S axis, the **principales** E and W ≈ 190 m from the N side) with **towers** | A/B |
| Interior | **Rows of vaulted rooms (≈ 3 m high) along the inside of the walls**, barracks blocks, **principia** (HQ) with the **shrine of the standards**, baths, a parade ground | A/B |
| Garrison in 113 | **Praetorian cohorts** (≈ 10 cohorts) **and the urban cohorts** (who share the camp until the 270s) | B |

### 3.36 Aqueduct arcades, Porta Maggiore, Arcus Neroniani

Aqueducts in 113: **Appia** (312 BC, mostly underground), **Anio Vetus** (272 BC, underground), **Marcia** (144 BC: cold and the best water; arcades), **Tepula** (125 BC), **Julia** (33 BC), **Virgo** (19 BC, Agrippa; mostly underground; arches across the Campus Martius), **Alsietina** (2 BC, Trastevere, non-potable), **Claudia + Anio Novus** (AD 52: the great arcades), **Traiana** (**109**: from Lake Sabatinus/Bracciano to the **Janiculum**, which powers mills there later [B]).

| Item | Spec | Conf. |
|---|---|---|
| **Claudia/Anio Novus arcades** | Approach from the SE across the Campagna; **up to ≈ 27–30 m high** near Rome; arches ≈ 5–6 m span [C]; piers ≈ 3 m [C]; **peperino/tufa ashlar** (rusticated in the Claudian manner) with some brick repairs; **two channels stacked** (Anio Novus above Claudia) | A/B |
| Specus (channel) | ≈ **1 m wide × 1.5–2 m high**, lined with **cocciopesto**, roofed with slabs or a vault; inspection shafts | A/B |
| Marcia/Tepula/Julia | Combined arcade with **three stacked channels**, lower (≈ 9–10 m); **the Augustan arch over the Via Tiburtina** (later the Porta Tiburtina) carries them | A |
| **Porta Maggiore** (Claudian) | **Not yet a city gate** (it became one under Aurelian): a **monumental double arch** carrying Claudia and Anio Novus over the **Via Praenestina and Via Labicana**; **heavily rusticated travertine**; small **aedicules with Corinthian half-columns and pediments** framing the piers; **attic with 3 inscription bands** (Claudius 52, Vespasian 71, Titus 81) concealing the 2 channels; total height ≈ 24 m [C] | A/C |
| **Tomb of Eurysaces** (the baker) | Just outside the Porta Maggiore, between the roads: **≈ 10 m travertine tomb with rows of circular openings** (dough-mixing vats) and a frieze of bread-making (c. 50–20 BC) | A |
| **Arcus Neroniani** | Nero's branch of the Claudia **from the Porta Maggiore area across the Caelian** (≈ 2 km) to the Palatine (via Domitian's extension): **brick arches** ≈ 15 m high [C] | A/B |
| Castella | Distribution tanks/towers at the city end, small castella throughout; lead pipes (*fistulae*) stamped with names | A |

### 3.37 Servian walls and gates

| Item | Spec | Conf. |
|---|---|---|
| Date | Early 4th c. BC (after the Gauls, 390); ≈ 11 km circuit | A |
| Construction | **Grotta Oscura tufa blocks ≈ 0.6 × 0.6 m in section (2 RF) × 1.2–1.5 m long**, courses of alternating headers and stretchers; **≈ 10 m high, ≈ 3.6–4 m thick** | A/B |
| Esquiline sector | **Agger** (an earth rampart behind the wall, ≈ 30 m wide) + **fossa** (ditch ≈ 30 m wide × 9 m deep) [B]. Parts of the agger are a public promenade by the Augustan period (Horace), the Horti Maecenatis garden partly over it. | A/B |
| **State in 113** | **Obsolete and patchy**: many stretches **built into or over by houses**, gates surviving as **arches or landmarks** and in street names. **Rome has no defensive circuit in 113**: the city boundary is the **pomerium** (marked by cippi), plus customs posts. | A |
| Gates (portae) | **Porta Capena** (Via Appia; **"dripping": the Marcia branch arcade passes over it**, Juvenal 3.11), **Porta Esquilina** (Augustan single-arch rebuild in travertine; **later rededicated to Gallienus in 262**, so in 113 it is unlabelled or carries an Augustan-era inscription [C]), **Porta Collina**, **Porta Viminalis**, **Porta Querquetulana**, **Porta Caelimontana**, **Porta Naevia**, **Porta Raudusculana**, **Porta Lavernalis**, **Porta Trigemina** (river gate by the Aventine), **Porta Flumentana**, **Porta Carmentalis** (Forum Holitorium), **Porta Fontinalis**, **Porta Sanqualis**, **Porta Salutaris**, **Porta Quirinalis** | A |
| Gate form | A single arch (or an older trabeated opening) in ashlar, ≈ 4–5 m wide [C], often with a later travertine arch facing; flanking masonry | C |

### 3.38 Extra quick specs

| Landmark | Key look | Conf. |
|---|---|---|
| **Porticus Octaviae** | Augustan, Domitianic rebuild: a double colonnade ≈ 119 × 132 m [B] enclosing the **Temples of Jupiter Stator and Juno Regina**, a library, a curia; **projecting columnar propylon** on the S (the surviving one is a Severan restoration of the same design) | A/B |
| **Stadium of Domitian** | **≈ 275 × 106 m** (the outline of the modern Piazza Navona); 2 storeys of travertine arcades; ≈ 20–30,000 seats (the catalogue gives 30,088 places); Greek-style athletic contests | A/B |
| Odeum of Domitian | Roofed concert hall (the catalogue gives ≈ 10,600 places) S of the stadium; semicircular, travertine | B/C |
| **Baths of Nero** (restored), **Baths of Titus** (beside the Colosseum, on the Oppian edge, smaller than Trajan's), **Baths of Agrippa** (Campus Martius) | Bath blocks in the same style as §3.23, smaller | A/B |
| **Saepta Julia** | Long porticoed enclosure (≈ 300 × 100 m [C]) in the Campus Martius, between the Pantheon area and the Iseum; **luxury shops** (Martial) | A/B |
| **Temple of Apollo Palatinus** | Luna marble, Corinthian, **gilded chariot of Sol on the roof**; the portico of the Danaids with **giallo antico** columns | A |
| **Temple of Divus Augustus** | Behind the Basilica Julia, restored by Domitian | B |
| **Temple of Isis and Serapis (Iseum Campense)** | Egyptianizing precinct with **small red/grey granite obelisks, sphinxes**, a **Nilotic** feel; priests in white linen | A/B |
| **Ara Maxima of Hercules** | Large altar in the Forum Boarium by the Circus carceres | A/B |
| **Pyramid of Cestius** | **≈ 30 m pyramid, white marble-faced**, by the Via Ostiensis (12 BC). **Not built into any wall in 113.** | A |
| **Monte Testaccio** | **The growing hill of broken olive-oil amphorae** (Dressel 20) behind the Emporium; by 113 well underway but **much lower than today's ≈ 35–45 m** [C: ≈ 10–20 m?] | B/C |
| **Emporium + Porticus Aemilia + Horrea Galbana** | Riverside docks below the Aventine: **stepped quays, mooring stones, cranes**; the **Porticus Aemilia** (vast stepped-vault warehouse hall, ≈ 487 × 60 m, 193/174 BC; the identification is debated, as some say it was the Navalia shipsheds [B]); the **Horrea Galbana** (huge courtyard warehouses, §4.8) | A/B |
| **Naumachia Traiani** | **Brand new (dedicated 109)**: a basin for staged naval battles near the Vatican, NW across the river | A/B |
| **Circus of Gaius and Nero** (Vatican) | With the **Vatican obelisk** (25.5 m, uninscribed) on its spina (it still stands today in St Peter's Square) | A |
| **Gardens (Horti)** | Horti Sallustiani (Quirinal/Pincian, imperial property), Horti Lamiani and Maecenatis (Esquiline), Horti Luculliani (Pincian): **villas, pavilions, nymphaea, sculpture, terraces, umbrella pines and cypress** | A |

---
## 4. Generic city fabric (all 1:1, human scale)

Rome in 113 has about 1 million people. The 4th-c. regionary catalogues list **≈ 46,600 *insulae* against ≈ 1,800 *domus***. ("Insula" may there mean a rental unit rather than a block, but the point stands: **apartment blocks are the city**.) The best preserved models are at Ostia (2nd c.) and the Insula dell'Ara Coeli in Rome (2nd c., 5–6 storeys with a mezzanine).

### 4.1 Insula (apartment block)

| Parameter | Value | Conf. |
|---|---|---|
| **Height limit** | Augustus: **70 RF (≈ 20.7 m)** (Strabo 5.3.7). **Trajan: 60 RF (≈ 17.75 m)** (*Epitome de Caesaribus* 13.13), "because of collapses". Often flouted (Juvenal Sat. 3). | A |
| Storeys | Ground (shops + mezzanine) + **3–4 upper floors**: **4–6 storeys total** | A/B |
| Ground storey | **4.0–5.5 m** floor-to-floor, including a **wooden mezzanine (*pergula*)** inside each shop at ≈ 2.4–2.8 m | A |
| Upper storeys | **3.0–3.5 m** (1st floor, the best flats: *cenacula*, tallest, sometimes with balconies); **2.6–3.0 m** for the upper floors; the top floor has garrets under the roof (cheapest, hottest, most dangerous) | A/B |
| Footprint | Frontage **15–40 m**; depth 12–40 m. Small blocks are solid; **large blocks have a central courtyard** (Ostia type: ≈ 30 × 40 m block, ≈ 10 × 15 m court with a well/basin) | A/B |
| Walls | Ground: brick-faced concrete ≈ 0.6 m; upper: 0.45 m; upper partitions: **timber frame + wattle and daub (*opus craticium*)** (a fire hazard; Vitruvius complains) | A |
| **Façade finish** | **Exposed brick** with brick pilasters, string courses and moulded brick cornices (Trajanic best practice), **or stucco** in white/cream with a **red or ochre dado band** (≈ 1–1.5 m) at street level; grime and soot | A/B |
| **Tabernae front** | A continuous row of shop openings, see §4.3 | A |
| **Street door to the stairs** | A separate narrow doorway (**0.9–1.2 m × 2.2–2.5 m**) between shops, leading **straight up a steep stair** (risers 0.2–0.25 m, treads 0.22–0.28 m) to the upper flats | A |
| **Windows (upper)** | Regular rows: **0.6–1.0 m wide × 0.9–1.4 m high**, sill ≈ 0.9 m, **wooden shutters** (rarely mica or glass), one or two per room, ≈ 3–4 m apart; the top floor has **smaller square windows (0.5 m)**; flat brick lintels with relieving arches | A |
| **Balconies (*maeniana*)** | (a) **Timber**: joists cantilevered ≈ 1–1.5 m, plank floor, **lattice railing ≈ 1 m**, sometimes roofed; (b) **masonry**: on brick corbels or arches (Ostia, Casa di Diana), running along the façade at 1st-floor level. Plants in pots, laundry. | A |
| **Porticoes** | **After the fire of 64, Nero required porticoes in front of insulae** (Tacitus Ann. 15.43): **brick piers or travertine columns at 3–4 m centres, 2.5–4 m deep**, carrying a **1st-floor terrace/balcony**. Use them along main streets. | A |
| Roof | **Tiled, 15–22°**, eaves projecting 0.4–0.8 m on rafter ends; **or flat roof terraces (*solaria*)** in cocciopesto with parapets, plants, pergolas; **no chimneys** | A/B |
| Fire-safety rules (post-64) | **No shared party walls** (each building its own walls), fireproof Alban/Gabine stone in lower parts, limited timber, street widths increased, water to hand | A |
| Interior | Unheated except by braziers; no water above the ground floor (carried up from public basins); chamber pots (emptied into street jars or, illegally, out of windows); latrines on the ground floor only | A |
| Signs | Painted rental notices and owner names | A |

**Procedural recipe:** lot → choose type (solid block / courtyard) → ground floor = taberna bays (3–4 m) + 1 stair door per 15–20 m → upper floors = repeated window bays (3–3.5 m) → 0–1 balcony bands → roof (tile gable or hip, or terrace) → finish (brick 40% / stucco 60% in dense quarters [C]) → grime gradient (dark at the base, soot stains above windows).

### 4.2 Domus (atrium house)

| Parameter | Value | Conf. |
|---|---|---|
| Location | Mostly on the hills (**Palatine** = imperial; **Caelian, Esquiline, Quirinal, Aventine** = elite) and the edges of the Campus Martius | A |
| Footprint | Frontage 15–30 m × depth 30–60 m (much larger for senatorial houses) | B |
| Street face | **Blank, windowless stucco walls** (small high windows at most), often **with rented tabernae flanking the entrance**; the **door** (2.5–3.5 m tall, double wooden leaves with bronze studs) framed by pilasters or engaged columns and a small pediment; a doorkeeper (*ianitor*), a chained dog ("cave canem" mosaic) | A |
| Sequence | **Fauces** (entry passage, 1.5–2.5 m wide) → **atrium** (≈ 10 × 12 m; roof sloping inward to a **compluvium opening ≈ 3 × 4 m** above an **impluvium pool ≈ 0.3 m deep**; *lararium* shrine, ancestor masks in cupboards, the strongbox) → **tablinum** (the master's office) → **peristyle garden** (columns 3–4 m tall, stuccoed brick or marble; fountains, statues, box hedges) → triclinium (dining room: 3 couches), cubicula (bedrooms), baths in rich houses, kitchen, slave rooms | A |
| Height | 1–2 storeys (6–9 m), sometimes more toward the back slope | B |
| Decoration | Walls painted (Flavian-Trajanic "Fourth Style", turning simpler in the 2nd c.: **red and yellow panels with thin architectural framing on white or black**); mosaic floors (black-and-white geometric); marble veneers in the richest houses | A/B |

### 4.3 Tabernae (shops), a component of nearly every building

| Parameter | Value | Conf. |
|---|---|---|
| Bay | Width **3–4.5 m**, depth **4–8 m**, height 4–5 m | A |
| Opening | **Almost the full width** (2.5–3.8 m), with a flat **travertine or timber lintel** and a **brick relieving arch above** | A |
| **Threshold** | A travertine sill with a **groove for vertical shutter boards**, slotted in at night and locked with a bar; **a narrow hinged door (≈ 0.8 m) at one end** of the shutter line | A |
| Mezzanine window | One small window (≈ 0.6 × 0.8 m) centred above the lintel at ≈ 3 m | A |
| Interior | A **masonry counter** across the front or in an L; shelves; a ladder or stair to the mezzanine (where the shopkeeper's family sleeps); a painted *lararium* | A |
| Street spill | Goods displayed on the street, tied to pillars; Martial (7.61) praises Domitian for banning shops from encroaching on the street | A |

### 4.4 Food shops

| Type | Look | Conf. |
|---|---|---|
| **Thermopolium / caupona bar** | **L-shaped masonry counter** 0.9–1.0 m high × 0.6–0.7 m deep × 2–5 m long, with **2–5 dolia (jars) embedded** (mouths ≈ 0.4–0.5 m Ø) for dry food and wine; **top clad in polychrome marble offcuts (*crustae*)**; **stepped shelves** for cups at one end; a **small stove** at the counter end; a painted lararium behind; amphorae racked against the wall | A |
| **Popina** | A tavern with tables and benches inside, dark interior, wine jugs, dice (gambling is illegal outside the Saturnalia), sometimes rooms upstairs; a low reputation | A |
| **Pistrinum** (mill-bakery) | **2–6 hourglass mills** of grey Orvieto lava: a conical **meta** (base ≈ 0.9 m Ø) under an hourglass **catillus**, total ≈ **1.6–1.9 m tall**, catillus Ø ≈ 0.8–1.0 m, with **a square wooden frame and beam turned by a donkey/mule** (or slaves); the floor paved around in basalt; a **domed brick oven ≈ 2.5–3 m Ø with a 0.6 m mouth and a flue**; a kneading machine; loaves (*panis quadratus*: round, ≈ 20 cm, scored into 8 wedges, stamped) | A |
| Butcher, fish, greengrocer | Counters, hooks, **fish tanks**, baskets; the **Macellum Magnum** (a meat and provisions market, Nero) on the Caelian; the **Macellum Liviae** on the Esquiline | A |

### 4.5 Fullonica (laundry / cloth-finishing)

| Feature | Look | Conf. |
|---|---|---|
| Treading stalls (*saltus fullonicus*) | **A row of small tubs ≈ 0.6–1.0 m wide**, with low dividing walls ≈ 1 m high for hand support; workers tread cloth in water, urine and fuller's earth | A |
| Rinsing tanks | **3–4 large interconnected basins (≈ 2 × 3 m, 0.6–1 m deep)** at descending levels | A |
| Equipment | **Screw press** (≈ 2 m tall wooden frame), **wicker drying cages with sulphur fumigation (*viminea cavea*)**, carding brushes, drying lines or rails on the roof or balcony | A |
| Street | **Urine-collection jars at the door** (taxed by Vespasian: "pecunia non olet") | A |

### 4.6 Horrea (warehouses)

| Feature | Look | Conf. |
|---|---|---|
| Plan | A **courtyard** (or central corridor) surrounded by **rows of deep narrow rooms (*cellae*) ≈ 4–6 m wide × 8–15 m deep**, on **2 storeys** with **stairs/ramps** | A |
| Openings | **One narrow doorway per cella** (1.5–2 m, travertine frame), **few small high slit windows**; **one main gate** (lockable, guarded) to the street | A |
| Floors | **Raised floors (on low walls or pilae) for grain ventilation** | A |
| Walls | Thick brick-faced concrete, often **unrendered**; a plain, fortress-like exterior | A |
| Examples | **Horrea Galbana** (Testaccio: three huge courtyards; total ≈ 160 × 140 m [C]), **Horrea Agrippiana** (by the Vicus Tuscus), **Horrea Piperataria** (pepper and spices: on the **Via Sacra/Velia**, Domitianic) | A/B |

### 4.7 Street religion: compital shrines and street altars

| Feature | Look | Conf. |
|---|---|---|
| Count | **265 compita** (Pliny NH 3.66, AD 73) at the crossroads of the vici, each with a **compital shrine of the Lares Augusti** run by freedman **vicomagistri** (toga praetexta on duty) | A |
| Form | (a) a **small aedicula** (1.5–3 m tall, a little tiled gable or vault) on a **masonry plinth**, with an **altar** (≈ 1 m tall) in front; or (b) a **niche or painted panel on a wall at the corner** with a masonry altar below | A |
| Painting | **Two Lares** (youths in short tunics, dancing, holding a **drinking horn and a bucket**), the **Genius** (togate, sacrificing, head veiled), **two serpents** approaching an altar; garlands; a sacrificial pig; flute player | A |
| Offerings | Garlands, cakes, wine, incense; **small oil lamps** burn at night (**one of the few light sources on dark streets**) | A/B |
| Festival | **Compitalia** (early January, movable); small woollen dolls/balls hung for each household member [A] | A |

### 4.8 Water: lacus, nymphaea, latrines

| Feature | Look | Conf. |
|---|---|---|
| **Lacus** (street basin) | Frontinus counts **591 lacus**: one every street block or so. A **rectangular basin of 4–5 stone slabs** (travertine, basalt or peperino; ≈ **1.2–2.0 × 2.0–3.0 m, 0.7–0.9 m high**), clamped with iron, worn smooth where people lean; a **short pillar with a spout** (often carved as a mask or animal head) running continuously; the overflow runs across the street, flushing the gutters | A |
| **Nymphaeum** (monumental fountain) | An aedicular façade (≈ 10–20 m wide, 1–2 storeys) with **niches, statues, columns**, water cascading into a long basin; examples: Lacus Orphei, Lacus Promethei, Lacus Servilius (Forum: famously decorated with Sulla's heads) | A/B |
| **Latrine (*forica*)** | A rectangular room (≈ 6 × 10 m); **continuous bench on 2–3 walls with keyhole-shaped openings**, **seat height ≈ 0.45 m**, spacing **≈ 0.55–0.6 m**, marble or stone; **a running-water gutter (≈ 0.2 m) at the foot** for **sponges on sticks (*tersorium*)**; a deep sewer channel under the bench; a basin/fountain; high windows; sometimes a statue of Fortuna; **20–60 seats**; a small fee at the door; communal and social | A |
| Public baths (*balnea*) | Hundreds of small private bath-houses across the city (the catalogues list ≈ 850 later [A]): a modest brick block with a **praefurnium smoke vent** | A/B |

### 4.9 Streets, sidewalks, porticoes, awnings

| Parameter | Value | Conf. |
|---|---|---|
| **Main arteries** (Via Lata/Flaminia, Via Sacra, Vicus Tuscus, Argiletum, Clivus Suburanus, Vicus Patricius, Vicus Iugarius) | Carriageway **4.5–7 m** + sidewalks **1.5–3 m** + **porticoes** on one or both sides (the Via Lata is wider, ≈ 10+ m [C]) | B |
| Ordinary vici | Carriageway **3–5 m**, sidewalks **0.6–1.5 m** | B |
| Alleys (*angiportus*) | **2–3 m**, unpaved or stone-paved, dark, crossed by balconies (**some nearly meet overhead**) | B |
| Clivus (sloping street) | Paved, with **transverse ribs**; steep ones have **steps (*scalae*)**: e.g., the **Scalae Caci** (Palatine), the **Centum Gradus** (Capitol) | A |
| Paving | **Basalt (selce) polygons** 0.7–1.0 m across, 0.25–0.4 m thick, laid crowned; **kerbs (*crepidines*)** of travertine/tufa, sidewalk **raised 0.3–0.5 m** (in Rome more like 0.2–0.4 [C]); **wheel ruts** in older streets; bollard stones at corners | A |
| Sidewalk surface | Beaten earth, signinum, travertine slabs, or brick/stone in front of good shops | A/B |
| Stepping stones | Pompeii-style raised crossing stones **(0.5 m tall blocks, 1–3 in a row)**. **Evidence in Rome is thin**: use them sparingly in minor, steep, wet streets [C]. | C |
| Gutters | Along the kerb; **drain openings into the sewers** (round or slotted stone grates) | A |
| Porticoes (public) | Columns or piers at **3–4.5 m centres, 4–6 m deep, 5–7 m tall** | A/B |
| **Awnings (*vela*)** | Linen or canvas stretched from shopfront **beams or poles** across sidewalks and narrow streets; natural `#D9CDB4`, faded red `#A85A48`, ochre `#C49A4E`, striped [C] | A/B |
| **Graffiti / dipinti** | **Painted notices** (red `#9A3A24` or black letters on **whitewashed panels**, ≈ 1–2 m wide, at 1.5–3 m): **games announcements (edicta munerum)**, rentals ("insula for rent"), lost property, guild notices, **circus faction slogans** (Greens/Blues); **scratched graffiti** at eye height (1.2–1.8 m): greetings, love notes, insults, gladiator sketches, tallies, ships, phalluses (apotropaic) | A |
| Graffiti caution | **No Pompeii-style electoral posters for magistrates**: popular elections moved to the Senate in AD 14. Neighbourhood (vicus) and guild notices are fine. | A |

### 4.10 Doors, windows and openings (human scale)

| Item | Size | Conf. |
|---|---|---|
| Taberna opening | 2.5–3.8 × 3–3.8 m | A |
| Stair door (insula) | 0.9–1.2 × 2.2–2.5 m | A |
| Domus entrance | 1.5–2.5 × 2.5–3.5 m, double leaf | A |
| Interior door | 0.8–1.0 × 2.0–2.2 m (curtains are common) | A |
| Upper window | 0.6–1.0 × 0.9–1.4 m | A/B |
| Mezzanine window | 0.6 × 0.8 m | A |
| Temple door | 0.5–0.6 × column height (bronze) | B |

---

## 5. Props and vegetation

### 5.1 Vehicles and traffic

**Traffic law:** the Lex Iulia Municipalis (45 BC) **bans wheeled vehicles inside the city from sunrise until the 10th hour (≈ 2 h before sunset)**. The exceptions are carts **for temple and public building works**, **demolition debris removal**, **the Vestals, rex sacrorum and flamines on religious days**, and **triumphs and games processions**. **Consequence:** by day the carts wait **outside the gates and in yards**; at night the streets fill with rumbling wagons (Juvenal 3.236: no sleep in Rome). Daytime transport is **litters, sedan chairs, porters, pack mules and donkeys**.

| Prop | Spec | Colours | Conf. |
|---|---|---|---|
| **Plaustrum** (heavy cart) | 2 or 4 **solid disc wheels (*tympana*) 0.8–1.1 m Ø**, a plank bed ≈ 2.5 × 1.3 m, oxen; for stone, amphorae, timber | timber `#8A6A4A`, iron tyres `#3A3836` | A |
| **Carrus/raeda** (4-wheel wagon) | **Spoked wheels ≈ 0.9–1.2 m Ø**, bed ≈ 3 × 1.4 m, mules | | A |
| **Cisium** (light gig) | 2 spoked wheels ≈ 1.2–1.4 m, a seat for 2, one horse or mule | | A |
| **Carpentum** | 2-wheeled **covered carriage with an arched roof** (cloth on a frame), for matrons, priestesses, the empress; ornate | dyed covers `#7A3550`, gilt fittings | A |
| Gauge | Wheel gauge ≈ **1.4 m** [B] (Pompeii ruts ≈ 1.36–1.45 m) | | B |
| **Lectica** (litter) | Bed **≈ 2.0 × 0.9 m**, a **canopy on 4 posts with curtains**, cushions; **2 poles ≈ 4–5 m**; **4–8 bearers (*lecticarii*)** in matching livery (often tall Syrians, Cappadocians or Germans as a status display) | curtains in red, saffron, blue or purple; livery in matching colour or red `#A23B2E` [C] | A |
| **Sella** (sedan chair) | Enclosed chair on 2 poles, 2–4 bearers | | A |
| Pack animals | Mules and donkeys with **panniers** or **pack saddles (amphorae, sacks)**; ox teams | | A |
| Porters (*saccarii*, *phalangarii*) | Sacks on the shoulder; **pairs carrying amphorae slung from a pole** | | A |

### 5.2 Containers

| Prop | Spec | Colour | Conf. |
|---|---|---|---|
| **Dressel 20** (Baetican olive oil) | **Globular, ≈ 0.6 m Ø × 0.7–0.8 m tall**, short thick handles, a knob toe; empty ≈ 30 kg, full ≈ 100 kg; **stamped handles, painted tituli picti** (black/red ink); **the stuff of Monte Testaccio** | pale buff `#D6C1A0` | A |
| **Dressel 2–4** (wine; Italian/Spanish/Aegean) | **Tall and slender ≈ 1.0–1.1 m**, a long neck, **double-rod (bifid) handles**, a solid spike toe | Campanian red-brown `#A55A3F` | A |
| **Dressel 7–11** (garum and fish sauce, Spain) | ≈ 1 m, a **flaring funnel rim**, a long spike toe | `#C9A27E` | A |
| **Gauloise 4** (Gallic wine) | ≈ 0.6–0.65 m, **flat ring base**, small handles | `#C98B62` | A |
| **Africana I/II** (N. African oil/garum) | **Cylindrical, ≈ 1–1.1 m**, a short spike | orange `#D08A5A` | A/B |
| Rhodian type | **High peaked (horned) handles**, ≈ 0.8–1 m | `#C9A27E` | A |
| Stacking | Amphorae stored **leaning in rows against walls**, **stacked in layers in sand**, on **racks**, or **tied in pairs** for carrying | | A |
| **Dolium** | Huge jar **≈ 1.4–1.8 m tall, 1.2–1.6 m Ø**, a wide mouth with a lid, **often buried to the shoulder** in horrea/shops; **lead-clamp repairs** visible | `#B06A45` | A |
| Baskets, sacks, crates | Wicker baskets (round, flat), canvas sacks, wooden crates and barrels (barrels are a Gallic/Alpine wine import; **some exist in Rome by now** [B]) | wicker `#B89A62` | A/B |

### 5.3 Market stalls and street furniture

| Prop | Spec | Conf. |
|---|---|---|
| Market stall | Trestle table (≈ 2 × 0.8 m, 0.8 m high) + an **awning on 2–4 poles**, baskets, hanging produce; vendors also spread goods on cloth on the ground | A/B |
| Scales | **Bronze steelyard (*statera*)** with a hook and sliding weight; balance scales; stone weights | A |
| **Mensa ponderaria** | A stone/marble table with **cavities of standard volume** (official measures) in markets | A |
| Money-changer's table | Small table, coins, a strongbox; at the Basilica Aemilia/Argentaria | A |
| Bench / seat | Stone benches along walls, **exedra benches** (curved) at public spaces | A |
| Hitching rings / mounting stones | Stone posts at corners and gates | B |

### 5.4 Statues, altars, milestones

| Prop | Spec | Conf. |
|---|---|---|
| **Honorific statue** | **Pedestal 1.2–1.8 m tall, 0.7–1.0 m wide**, an inscribed front (moulded top and base), **statue 1.9–2.4 m** (slightly over life); types: **togate**, **cuirassed**, **heroic nude**, seated; marble (painted) or bronze (polished or gilded). **Fora are crowded with them** (some had to be cleared periodically). | A |
| Equestrian statue | **Base ≈ 3–4 × 1.5–2 m, 1.5–2.5 m tall**; horse and rider ≈ 3–4 m (life) to colossal | A |
| Statue on a column | Honorific columns (≈ 6–10 m) with a statue on top | A |
| **Herm** | A **square pillar ≈ 1.2–1.6 m** with a portrait or god head (Hermes, Dionysus, philosophers); gardens and libraries | A |
| **Altar (*ara*)** | **0.9–1.2 m tall, 0.6–1.0 m square**; moulded top and base; **bolsters (pulvini)** at the top sides; reliefs of **garlands, bucrania, paterae, jugs**; a fire-bowl/hollow on top; stained with blood and soot near temples | A |
| Small altar / cippus | 0.5–0.8 m, in shrines and homes | A |
| **Milestone** | **Cylindrical column ≈ 0.5–0.6 m Ø × 1.5–2.5 m tall** on a cubic base, inscribed with the **mile number and the emperor's name**; outside the city along roads (the miles are counted from the **gates** of the Servian wall [B]) | A |
| Boundary cippi | **Pomerium markers**: travertine stones ≈ 2 m tall with rounded tops, inscribed (Claudius, Vespasian; **Hadrian's come later**) | A |

### 5.5 Lighting props

| Prop | Spec | Light | Conf. |
|---|---|---|---|
| **Lucerna** (oil lamp) | Clay (mould-made, a **picture disc** on top: gladiators, gods, erotic scenes) or bronze, ≈ 8–12 cm long, 1–3 nozzles; olive oil | ≈ **10–15 lm per wick** (about one candle), ≈ 1,900 K `#FFA54F`, flickers | A |
| **Candelabrum** | **Bronze stand 1.0–1.5 m** with a plate on top for lamps; or a **lampstand tree** (multiple hanging lamps) | 1–6 lamps | A |
| **Laterna** (lantern) | **Cylindrical bronze frame ≈ 25–35 cm tall** with **horn (or bladder) panes** and a handle/chain; carried by a slave (*laternarius*) | ≈ 10–20 lm, warm, dim | A |
| **Fax / taeda** (torch) | Resinous pine or **bundled wood soaked in pitch/wax**, ≈ 0.6–1 m; for night processions and weddings | ≈ 100+ lm, smoky orange `#FF9329` (1,800 K) | A |
| **Brazier (*foculus*)** | **Bronze tripod or box brazier ≈ 0.6–1.0 m** for heating and cooking; tripod incense burners in temples | coals `#FF6A1F` | A |
| Candles | Tallow or wax candles also used (cheaper ones smoky) | | A |

### 5.6 Construction-site props (important in 113)

| Prop | Spec | Conf. |
|---|---|---|
| **Treadwheel crane (*polyspastos*)** | An A-frame or single mast **10–20 m** with pulleys; a **human treadwheel ≈ 4–5 m Ø** at the base (Haterii relief) | A |
| Scaffolding | Timber poles lashed with rope, put-log holes in the walls, plank walks | A |
| Materials | **Stacks of bricks (stamped)**, column drums, **marble blocks with lifting holes (lewis)**, timber, lime pits, sand heaps, **centring (arch formwork)** | A |
| Workers | §6.3 | |

### 5.7 Vegetation (period-correct)

| Plant | Form and size | Colours | Where | Conf. |
|---|---|---|---|---|
| **Umbrella / stone pine** *Pinus pinea* | **12–20 m**, **flat umbrella crown 8–15 m wide** on a bare, often leaning trunk | needles `#3F5B33`, trunk `#7B4A33` (plated bark) | **Gardens, sanctuaries, tomb groves, Horti**; sacred to Cybele (pine cones as motifs). **Avenues of pines along the Appia are mostly 19th-c. plantings: don't line roads with them.** | A/B |
| **Italian cypress** *Cupressus sempervirens* | **15–25 m tall, narrow column 2–4 m wide** | `#2F4128` | **Tombs and funerary groves (the Mausoleum of Augustus!)**, gardens, topiary | A |
| **Laurel / bay** *Laurus nobilis* | Shrub/tree **5–10 m**, dense oval | `#3D5A2E` | **Temples of Apollo**, the doorposts of the imperial house (laurels flank the door), triumphs | A |
| **Olive** *Olea europaea* | **4–8 m**, gnarled trunk, airy crown | silver-green `#8A9A78` | Gardens; the **sacred olive in the Forum** | A |
| **Oriental plane** *Platanus orientalis* | **20–30 m**, broad spreading crown | `#5E7B3F`, mottled bark `#B8AE95` | **Shade groves in porticoes (Porticus Pompeiana!)**, gardens, gymnasia | A |
| **Holm oak** *Quercus ilex* | **10–20 m**, dense dark crown | `#34482B` | Sacred groves, hills (the Caelian was once "Querquetulanus": oak) | A |
| **Fig** *Ficus carica* | 3–8 m, broad leaves | `#5C7A3A` | **Ficus Ruminalis** (Comitium/Lupercal), Ficus Navia; gardens, wild in ruins | A |
| **Grapevine** *Vitis* | On **pergolas (2.2–2.5 m)**, trellises, trees | `#5F7F3A`, grapes `#4A2A4E` | Gardens, taverns, courtyards, balconies | A |
| **Myrtle** *Myrtus* | Shrub 1–3 m | `#3E5A32` | Gardens (sacred to Venus), wreaths | A |
| **Box** *Buxus* | **Clipped hedges and topiary** (*ars topiaria*) | `#3D5530` | Domus gardens, Horti | A |
| Ivy, acanthus, roses, violets, lilies, poppies, oleander, quince, pomegranate, apple, pear, cherry (since Lucullus), plum, peach (new, 1st c.), date palm (rare, ornamental) | | roses `#C24A5A`, oleander `#E58FA8` | Gardens, garlands, tombs | A/B |
| Weeds and ruderals | Grasses, fennel, acanthus, wild fig on old walls, moss on north faces | | Everywhere old | A |
| **NOT in AD 113 Rome** | **Orange and lemon trees** (the citron is barely known), **tomatoes, maize, prickly pear, agave, eucalyptus**, horse chestnut, London plane (a 17th-c. hybrid), robinia, ailanthus, Washingtonia/Canary palms, **sunflowers** | — | — | A |

---

## 6. People: appearance for procedural character generation

### 6.1 Bodies, skin, hair

| Parameter | Value | Conf. |
|---|---|---|
| Height (skeletal studies, Imperial Rome) | **Men ≈ 164 cm (SD ≈ 6), women ≈ 152 cm (SD ≈ 5)** (Giannecchini & Moggi-Cecchi 2008). Germanic and Gallic guards and slaves were noticeably taller. | A/B |
| Build | Lean, with manual labourers muscular. The urban poor were often small and stunted; elites better fed. | B |
| Ancestry | **A highly cosmopolitan city.** Ancient-DNA work (Antonio et al., *Science* 2019) shows Imperial-period Romans shifted strongly toward **Eastern Mediterranean / Near Eastern** ancestry, alongside Italian, North African, Gallic, Germanic, Levantine, Egyptian and Ethiopian/Nubian minorities. | A |
| Hair colour | Mostly dark brown to black (~80%); brown; some red and blond (Gauls, Germans). **Blond wigs made from German captives' hair were fashionable** with women (Ovid, Martial). | A/B |
| Eyes | Mostly brown; some hazel, green, grey or blue | B |

**Skin-tone palette** (sRGB albedo; weights for a random city crowd [C]):

| Tone | Hex | Weight |
|---|---|---|
| Light | `#EBC9AE` | 0.08 |
| Light olive | `#DDB48F` | 0.20 |
| Olive | `#C99A72` | 0.28 |
| Medium olive-brown | `#B07D58` | 0.22 |
| Brown | `#8E5E3E` | 0.12 |
| Dark brown | `#6B4229` | 0.07 |
| Deep brown | `#4A2D1C` | 0.03 |

Add per-face ruddiness and sun-tan modifiers: workers and soldiers are darker and redder; elite women deliberately pale (lead white makeup *cerussa*, red ochre/wine-lees on the cheeks, kohl on the eyes).

### 6.2 Male hair and beards (Trajanic, AD 113)

| Group | Style | Conf. |
|---|---|---|
| Default citizen | **Short hair combed forward from the crown into a straight-cut fringe** (Trajan's "comma locks" across the forehead), **clean-shaven** (a daily barber visit or shaving by a slave); the shaving is often imperfect (stubble) | A |
| Youths (≈ 15–22) | A **light first beard (*barbatulus*)** until the **depositio barbae** ritual | A |
| Mourners, accused men | **Unshaven, hair untrimmed**, dark clothes | A |
| Philosophers, Greek intellectuals | **Full beard**, longer hair, Greek *pallium* (himation) without a tunic underneath | A |
| Foreigners | Gauls and Germans: long hair, moustaches or beards; Parthians and Syrians: beards, curled hair; Egyptian priests: shaved heads; Jews: beards | A/B |
| Slaves | No special style; working slaves cropped; some (pages, *delicati*) long-haired youths | A |
| **Not yet** | **Hadrian's fashionable full beard (from 117)**: avoid beards on respectable Roman men in 113 | A |

### 6.3 Clothing by role

**Core garments**
- **Tunica:** two rectangles sewn at the shoulders and sides. Men's is **knee-length, belted** (with a blousy overhang); women's is ankle-length. Short sleeves or sleeveless; long sleeves were considered effeminate or foreign.
- **Toga:** a **semicircular woollen mantle ≈ 4.5–5.5 m long × 2–2.5 m wide**, worn in the Imperial manner with a large **sinus** (the hanging fold in front) and an **umbo** (a pouch pulled out over the belt). It is heavy (≈ 3–4 kg) and needs help to drape.
- **Stola:** a matron's long sleeveless overdress on narrow shoulder straps.
- **Palla:** a woman's mantle (≈ 3 × 1.5 m), often drawn over the head outdoors.
- **Paenula:** a hooded poncho-like cloak (wool or leather) for travel and rain; **soldiers wear it too**.
- **Lacerna:** an open cloak pinned at the right shoulder; fashionable over the toga at the games (coloured).
- **Cucullus:** a hood.

| Role | Garments | Colours (hex) | Accessories | Conf. |
|---|---|---|---|---|
| **Plebeian man** | Tunic (1–2 layers), belt; **paenula/lacerna** in bad weather; hat (*petasus*, a broad-brimmed straw or felt hat) in sun or for travel | Undyed off-white `#E2DAC6`, grey `#8E8A80`, brown `#7A6248`, faded madder red `#9C4A3A`, blue-green `#4F6E6A` | Purse on the belt, knife (tool), wax tablet | A/B |
| **Citizen, formal** | **Toga virilis** (natural white wool) over a tunic; **calcei** | `#E8E1CF` | Ring (iron or gold) | A |
| **Toga candida** | Candidate for office: **chalk-whitened toga** (canvassing the Senate electorate) | `#F7F4EC` | | A |
| **Toga praetexta** | **Curule magistrates, some priests, vicomagistri on duty, and freeborn boys until ≈ 15–16**: white with a **purple border (≈ 5–8 cm)** along the straight edge | white + purple `#5B1F3B` | Boys wear a **bulla** (gold or leather amulet) on the neck | A |
| **Toga pulla** | **Mourning**: dark grey/black wool | `#3B342F` | | A |
| **Toga picta + tunica palmata** | **Triumphing general / the emperor in ceremonies**: purple embroidered with gold | `#4A1836` + `#C9A23F` | Laurel wreath | A |
| **Senator** | Tunic with the **latus clavus**: **two broad purple stripes (≈ 7–10 cm) running from the shoulders down front and back**; toga; **calcei senatorii** (black leather shoes with straps wound up the shin; **patricians add a small ivory crescent (*lunula*)** [B]); gold ring | stripes `#5B1F3B` | Lictors only if a magistrate | A/B |
| **Eques** (knight) | Tunic with the **angustus clavus**: **narrow purple stripes (≈ 2–3 cm)**; **gold ring (*anulus aureus*)**; the *trabea* (short striped cloak) at parades | | | A |
| **Matrona** (married citizen woman) | Long tunic + **stola** (by 113 increasingly a portrait convention or for formal occasions [B]) + **palla**; **woollen fillets (*vittae*)** in the hair | **Wide colour range**: saffron `#E0A526`, sea-green `#5E9A8A`, rose `#C77B83`, violet `#6B3A6E`, sky blue `#7FA4C9`, white, ochre | **Gold earrings with pearls**, necklaces, bracelets, rings, a parasol (*umbraculum*) carried by a slave, a fan, a mirror | A/B |
| Young woman, girl | Tunic, palla; girls wear a *lunula* pendant | lighter colours | | A |
| **Bride** | **Flame-orange veil (*flammeum*)** `#E2621B`, **hair in six locks (*seni crines*)** under a wreath, a white tunic tied with a **Hercules knot** | | | A |
| **Slave** | **Like the poor free**: a tunic, often shorter and coarser; **no distinctive dress** (the Senate rejected a slave uniform lest slaves see their numbers: Seneca, *De Clem.* 1.24). Labourers wear the **exomis** (one-shoulder tunic). Household slaves of the rich are **well dressed in livery**; **iron collars** only on recaptured runaways (inscribed "hold me, I have fled") [A]. | Undyed, brown | Tools, baskets, a lantern at night | A |
| **Freedman / freedwoman** | Like citizens; the **pilleus** (conical felt cap) at manumission and during the **Saturnalia**; wealthy freedmen dress ostentatiously (Trimalchio) | | | A |
| **Worker / artisan** | Tunic tucked up into the belt or an exomis; a **loincloth (*subligaculum*)** for heavy labour; a leather apron (smiths); a hood or hat | Undyed, brown, grey | Tools (hammer, adze, trowel, chisels), a hod | A |
| **Foreigners** | **Greeks**: himation and beard; **Gauls/Germans**: **trousers (*bracae*)**, long-sleeved tunics, the **sagum** (a woollen cloak, often **checked**); **Parthians/Persians/Armenians**: trousers, long sleeves, Phrygian cap; **Egyptians**: linen; **Jews**: fringed mantle | checks `#7E5B3A`/`#3F5F3A`/`#B08A4A` | | A/B |

### 6.4 Officials and the military in Rome

| Role | Appearance | Conf. |
|---|---|---|
| **Lictors** | **In the city: a white toga** (a red *sagum* only outside the pomerium); carry **fasces on the left shoulder**: a bundle of **elm/birch rods ≈ 1.5 m bound with red leather thongs**; **no axe inside the pomerium** (except for a dictator, now obsolete). **12 for a consul, 24 for the emperor (with laurelled fasces)**, 6 for a praetor, **1 for each Vestal**. Walk in single file ahead of the magistrate. | A |
| **Praetorian Guard** | **On palace duty in Rome: the cohort on guard wears the TOGA** (*cohors togata*, Tacitus Hist. 1.38; Martial) with swords hidden or at the side; **in uniform for parades and campaigns**: an ornate **Attic-style helmet with a tall crest**, **muscle or scale cuirass** (or segmentata), an **oval shield (*scutum*) with a scorpion emblem** and thunderbolts/wings, the gladius, a red or white tunic, a paenula. **In 113, units are mustering for the Parthian war**, so armoured Praetorians are plausible around the Castra and the palace. | A (toga) / B (kit) |
| **Urban cohorts** (*cohortes urbanae*) | City police under the urban prefect, based in the Castra Praetoria: **tunic + sword + paenula** on patrol, with armour similar to the Praetorians for riots [C] | B/C |
| **Vigiles** (night watch and firemen) | **7 cohorts of freedmen**, each covering 2 regions, in **barracks (*stationes*)** and **sub-stations (*excubitoria*)**; **no armour**: a tunic, belt and cloak; equipment: **buckets (*hamae*, esparto grass sealed with pitch)**, **axes (*dolabrae*)**, **hooks and poles**, **ladders**, **wet rag blankets (*centones*)**, **force pumps (*siphones*)**, **lanterns**; night patrols looking for fire and thieves | A |
| **Legionaries** (in transit, veterans, the Parthian levy, triumph parades) | **As on Trajan's Column**: **lorica segmentata** (iron band armour), **Imperial Gallic helmet with reinforcing cross-bars** (in Dacia), **curved rectangular scutum** (painted, often red with thunderbolt/wing motifs and a bronze boss), **gladius** (Pompeii type) on the right, **pugio** (dagger) on the left, **pilum**, a **neck scarf (*focale*)**, **knee breeches (*feminalia*)**, **caligae** (hob-nailed sandal-boots); tunics off-white or red (debated) | A/B |
| **Auxiliaries** | **Mail shirt (*lorica hamata*)**, **flat oval shield**, a spear and *spatha*/gladius, similar helmets; archers (Syrian, with long robes and conical helmets) on Trajan's Column | A |
| **Equites singulares Augusti** | The **emperor's horse guard** (created by Domitian or Trajan [B]), recruited from **Batavians and other Germans** and provincials; camp on the **Caelian** (Castra Priora); mail, an oval shield, a spatha, crested helmets; noticeably tall, blond and bearded [B/C] | B/C |
| **Officers** | **Muscle cuirass** (bronze or leather) with **pteruges** (leather strips) at the shoulders and hips, a **sash (cinctorium)**; centurions with a **transverse crest**, a **vine stick (*vitis*)** and greaves; tribunes; the general in a **scarlet paludamentum** `#A8232B` | A |
| **Misenum sailors** | Tunics, caps; **rig the Colosseum velarium**; based at the Castra Misenatium by the Colosseum | A |
| Military colours | Iron `#6E6F70`, bronze trim `#B0874A`, red tunic `#9E3B2E` or off-white `#E2DAC6`, red shields `#8E2E26`, leather `#7A4E2C` | B/C |

### 6.5 Priests and religious figures

| Role | Appearance | Conf. |
|---|---|---|
| **Flamen Dialis** (priest of Jupiter) | The **apex**: a close **leather cap (*galerus*) with a chin strap**, topped by a **spike with an olive twig and a woollen tuft**; the **laena** (a thick double woollen cloak, fastened with a brooch); may not touch iron or see armies; always attended | A |
| Other flamines (Martialis, Quirinalis, minor) | The same apex and laena | A |
| **Flaminica Dialis** | Hair in the **tutulus** (piled high, bound with purple wool), the **flammeum**, a bough ornament | A |
| **Vestal Virgins** | **White** woollen garments (a stola-like dress), the **suffibulum** (a **white rectangular veil with a purple border**, pinned under the chin with a brooch) for rites, **infula** (a woollen band wound round the head, its ends hanging as **vittae**), hair in **seni crines** (six braids); **a lictor precedes each**; they may ride in a carpentum | A |
| **Pontifices** (incl. Trajan as Pontifex Maximus) | A toga praetexta, **head veiled with the toga's fold (*capite velato*)** when sacrificing; the *galerus* for some rites | A |
| **Augurs** | **Lituus** (a curved staff), the *trabea* (striped toga); watch birds from the auguraculum | A |
| **Haruspices** (Etruscan diviners) | A fringed cloak with a brooch, a tall pointed cap (Etruscan style) [B]; examine livers at sacrifices | A/B |
| **Salii** (dancing priests of Mars) | **Archaic bronze breastplate**, an embroidered tunic, the **apex**, a sword, and the **figure-eight shields (*ancilia*)**; processions in **March and October** | A |
| **Galli** (priests of Cybele) | **Eunuchs** with **long bleached or curled hair**, **women's robes in bright colours** (saffron), earrings, makeup, a **pine-cone or Attis cap**; tambourines, cymbals, flutes; the procession of 15–27 **March** | A |
| **Priests of Isis** | **Shaved heads**, **white linen**, sistrum (a rattle), palm fronds; daily ceremonies at the Iseum | A |
| Sacrifice attendants | **Popa/victimarius**: bare-chested with a **long apron (*limus*)**, holding an axe or mallet; **camillus** (a boy attendant) with an incense box; a **tibicen** (double-pipe player) | A |
| Mithraism | **Barely present in 113** (it spreads in the 2nd c.); small underground mithraea at most [B] | B |
| Jews and early Christians | Jewish community (Trastevere, synagogues); **Christians a tiny, unremarkable minority** (no churches, no Christian catacombs yet) | A |

### 6.6 Gladiators, venatores, charioteers (Trajanic types)

| Type | Helmet | Shield | Weapon | Armour | Usual opponent | Conf. |
|---|---|---|---|---|---|---|
| **Murmillo** | **Broad-brimmed, visored helmet with a high crest** (a fish motif) | **Large curved rectangular scutum** | Gladius | **Manica** (arm guard of quilted linen or segmented metal) on the **right** arm; **short greave (ocrea)** on the **left** leg; a **belt (balteus)** and **loincloth (subligaculum)** | Thraex, hoplomachus | A |
| **Thraex** (Thracian) | **Griffin-crested** broad-brimmed visored helmet | **Small square or rectangular parmula** | **Sica** (a short curved sword) | **Two high greaves** over quilted leg wraps (*fasciae*); manica on the right arm | Murmillo, hoplomachus | A |
| **Hoplomachus** | Brimmed visored helmet with a crest/feathers | **Small round bronze shield** | **Spear + dagger** | Two high greaves, quilted leggings, manica | Murmillo, thraex | A |
| **Retiarius** | **None** | **Galerus** (metal shoulder guard on the left shoulder) instead | **Net, trident, dagger** | Manica on the left arm; tunic or loincloth | Secutor | A |
| **Secutor** | **Smooth egg-shaped helmet with small eye holes and a low fin** (nothing for the net to catch) | Scutum | Gladius | Manica on the right arm, ocrea on the left leg | Retiarius | A |
| **Provocator** | Visored helmet without a brim | Scutum | Gladius | **Cardiophylax** (a small rectangular or crescent breastplate), manica, greave | Provocator | A |
| **Eques** | Brimmed helmet with feathers, no crest | Round cavalry shield (*parma equestris*) | Lance, then a gladius | **A coloured tunic** (no bare chest), manica; starts mounted | Eques | A |
| **Essedarius** | Brimless helmet | | | Fights from a chariot (British-style), then on foot | Essedarius | A/B |
| **Venator / bestiarius** | None or a cap | — | **Hunting spear (*venabulum*)**, sword, sometimes a bow | A tunic, leg wraps, sometimes a padded jerkin | Animals (lions, leopards, bears, bulls, ostriches) | A |
| **Charioteer (*auriga*)** | Leather cap/helmet (*galea*) | — | **A curved knife** to cut the reins | **A short tunic in faction colour**, **chest bound with leather straps** (*fasciae*), leg wrappings; **reins wrapped around the waist** | | A |

Faction colours: **Russata `#A8352A`, Albata `#EDE7D8`, Veneta `#3A5D8F`, Prasina `#3E7A44`**. Gladiators fought bare-chested except the eques and provocator. Helmets were bronze (`#B0874A`) with crests of coloured feathers or horsehair (red, white, black). Shields were painted with emblems.

### 6.7 Footwear

| Name | Description | Who | Conf. |
|---|---|---|---|
| **Calcei** | **Closed leather shoes/boots tied with laces or straps**, the **proper shoe for the toga** in public | Citizens in formal dress | A |
| Calceus senatorius | **Black**, with **4 straps (*corrigiae*) wound up the shin**; the patrician version with an **ivory lunula** [B] | Senators | A/B |
| Calceus patricius / mulleus | **Red** shoes (the old kings, curule magistrates) | High magistrates, patricians at ceremonies | B |
| **Soleae** | Simple **sandals** (a sole plus thongs): **indoors only, or at the baths and dinners**; wearing them in the street is slovenly | Everyone at home | A |
| **Crepidae** | Open sandals with a strapped upper (Greek style) | Greeks, casual wear | A |
| **Caligae** | **Military hob-nailed sandal-boots** (an open lattice upper, iron hobnails) | Soldiers | A |
| **Carbatinae** | **One-piece rawhide shoes** | Peasants, workers | A |
| **Socci** | Soft slippers (comic actors, women, effeminate men) | | A |
| Women's shoes | Soft leather, **coloured (white, red, yellow, even gilded or pearl-studded for the rich)** | | A |
| **Barefoot** | Common among the poor, slaves and children | | A |

### 6.8 Women's hairstyles (Flavian-Trajanic)

| Style | Description | Who | Conf. |
|---|---|---|---|
| **Flavian-Trajanic "toupet" (orbis comarum)** | A **tall frontal crest of tight curls** built on a **frame or wire support** (and padding or hairpieces), rising like a diadem above the forehead; the **back hair braided and coiled into a flat bun (*nodus*)** at the nape or crown | **Fashionable elite women** (Julia Titi, Domitia) | A |
| **Plotina style** (Trajan's wife) | A **high, structured frontal arrangement** (a crest or visor of combed/braided hair in tiers, more austere than Flavian curls) with the back hair braided and gathered in a coil | Imperial women, conservative matrons | A |
| **Marciana / Matidia style** | **Stacked, stepped front tiers** like a diadem (a "turret" of braid layers) | Imperial women, imitators | A |
| Simple matron | **Centre parting, waved sides, a bun at the back**, **vittae** woollen bands | Ordinary married women | A/B |
| Working women, slaves | **A simple bun, braids or a kerchief** | | B |
| Vestals, brides | **Seni crines** (six locks or braids) | | A |
| Accessories | **Hairpins of bone, ivory or gold**, nets, ribbons, **hair dyes** (red with henna, blond with "Batavian soap"/pomade), **wigs** (German blond, Indian black) | | A |

---

## 7. Lighting and atmosphere

### 7.1 Sun geometry for Rome (41.9° N; AD 113 obliquity ≈ 23.66°)

Computed (geometric, no refraction). Altitude above the horizon; azimuth measured from north through east.

| Date (Julian, approx.) | Noon altitude | Day length | Sunrise az. | Sunset az. | **Roman hour** (1/12 of daylight) |
|---|---|---|---|---|---|
| Spring equinox (≈ 22 Mar) | 48.1° | 12.0 h | 90° (E) | 270° (W) | 60 min |
| **Parilia, 21 Apr** (Rome's birthday) | 60.0° | 13.45 h | 74° | 286° | 67 min |
| **12 May** (Column dedication; Lemuria 9/11/13 May) | 66.0° | 14.2 h | 66° | 294° | 71 min |
| **Summer solstice** (≈ 21–24 Jun) | **71.8°** | **15.1 h** | 57° (ENE) | 303° (WNW) | **75 min** |
| 1 Aug | 66.1° | 14.3 h | 65.5° | 294.5° | 71 min |
| Winter solstice (reference) | 24.4° | 8.9 h | 123° | 237° | 45 min |

Sun altitude / azimuth at the **start of each Roman hour** (hora 0 = sunrise):

| Hora | 0 | 1 | 2 | 3 | 4 | 5 | 6 (noon) | 7 | 8 | 9 | 10 | 11 | 12 (sunset) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ≈ 21 Jun | 0 / 57 | 12.5 / 69 | 26 / 81 | 40 / 93 | 54 / 108 | 66 / 133 | **72 / 180** | 66 / 227 | 54 / 252 | 40 / 267 | 26 / 279 | 12.5 / 291 | 0 / 303 |
| ≈ 12 May | 0 / 66 | 12.5 / 77 | 26 / 89 | 39 / 101 | 51 / 118 | 62 / 142 | 66 / 180 | 62 / 218 | 51 / 243 | 39 / 259 | 26 / 272 | 12.5 / 283 | 0 / 294 |
| ≈ 21 Apr | 0 / 74 | 12 / 85 | 25 / 96 | 37 / 109 | 48 / 126 | 57 / 149 | 60 / 180 | 57 / 211 | 48 / 234 | 37 / 251 | 25 / 264 | 12 / 275 | 0 / 286 |

For the game: `sunDir` from (altitude, azimuth) → three.js vector with +x = E, +z = S: `x = cos(alt)·sin(az)`, `y = sin(alt)`, `z = −cos(alt)·cos(az)`. Romans tell time by **horae** (daylight hours vary in length); the **gnomon of the Horologium** and sundials everywhere support this. Twilight at 42° N in summer lasts ≈ 30–35 min (civil) and ≈ 75 min (nautical).

### 7.2 Daytime look

| Aspect | Guidance | Conf. |
|---|---|---|
| Sky | Mediterranean summer: zenith `#5E8FCC`, horizon **milky and desaturated** `#C9D4DC`, warmer near the sun | B |
| Sun colour | Midday `#FFF4E5` (≈ 5,800 K effective); **golden hour** (altitude < 8°) `#FFC27A` → `#FF9E5A` at sunset | B |
| Shadow / fill | Sky-blue ambient `#9DB3D6` at noon; **strong contrast**: hard shadows in narrow streets, **bounce light from pale travertine and stucco** warms the shadows (`#C9B79A` bounce) | B |
| **Urban haze** | Rome burns wood and charcoal everywhere: **hearth and cookshop smoke, bath furnaces (praefurnia), bakeries, lime and pottery kilns at the edges, cremation on the Esquiline**, plus **dust** from construction and unpaved edges. Seneca (Ep. 104.6) on escaping "the heavy air of the city and the reek of smoking kitchens". Visibility on summer days ≈ **5–15 km**; brownish-grey near the ground, heavier in the valleys (Subura, Velabrum) and in the morning and evening. | A/B |
| Fog formula | Visibility V (m, real) with 2% contrast threshold: `FogExp2 density ≈ 1.98 / V`. **Scaled to game units: `density ≈ 1.98 / (V × 0.6)`**. Example: V = 8 km → **4.1e-4**. Add local smoke volumes (particles/cards) over the baths, bakeries and dense quarters. | B |
| River mist | Morning mist on the Tiber and the Campus Martius lowlands (spring/autumn) | B |
| Heat | Summer heat shimmer over paving at midday; **siesta**: activity drops after the 6th–7th hour; the wealthy leave for villas in July–August | A/B |

### 7.3 Light on stone at golden hour

| Surface | Midday albedo look | Golden-hour lit face | Golden-hour shade face |
|---|---|---|---|
| Travertine | `#E3DAC6` | **`#F0C891` → `#E7AE6E`** (honey/amber glow: the signature look of the Colosseum) | `#8F8EA0` (blue-violet) |
| Luna marble | `#EEEDE8` | `#F6D7AE` | `#9AA1B8` |
| Brick | `#B4613E` | `#D07A48` (glowing orange) | `#6E4A44` |
| Stucco (white) | `#EFEADC` | `#F7D6A6` | `#9C9AAA` |
| Gilded bronze | `#D6AE45` | **blinding specular flare** (strongly visible from far away: JOM, the Basilica Ulpia, statues) | dull `#7A6230` |
| Terracotta roofs | `#B85C33` | `#D6703E` | `#6A4038` |

Implementation: drive the sun colour and intensity by altitude (a lerp curve) and the hemisphere-light sky colour by altitude. Keep **material albedos fixed**; the colour shift comes from light. Consider a **slight bloom** for gilt and water glints.

### 7.4 Night

| Aspect | Guidance | Conf. |
|---|---|---|
| **No street lighting** | Rome's streets are **dark**. Light comes from **shop and tavern doorways** (taverns open late), **lamps at compital shrines**, **lit windows** (shutters ajar, dim), **torches and lanterns carried by slaves** escorting the well-off, **vigiles' lanterns**, **temple lamps and altar fires**, and occasional **braziers** of night workers. | A |
| Moonlight | Full moon ≈ 0.1–0.3 lux, a cool tint `#C4D3FF`; the **main ambient at night**. Moon phase matters (track it in GameTime). New-moon nights are pitch black between light pools. | B |
| Light sources (for PointLights) | **Oil lamp**: ≈ 10–15 lm, `#FFA54F`, radius ≈ 2–3 m; **lantern**: ≈ 15–25 lm, `#FFB060`, radius 3–4 m; **torch**: ≈ 100–200 lm, `#FF9329`, radius 6–10 m, heavy flicker and smoke; **brazier**: `#FF6A1F`, radius 3–5 m | B |
| Activity | **Wagons rumble through** (the daytime ban lifts; supplies and building materials), **vigiles patrol**, drunks and gangs (Juvenal: "make your will before going out to dinner"), **burglars**, revellers with torches, dogs | A |
| Smoke at night | Lamp and hearth smoke pooling in windless streets; torch smoke trails | B |
| Performance note | Clamp the number of active dynamic lights (pool + cull by distance and importance). Bake shrine lamps as emissive + light-probe contributions. Torches carried by NPCs are the dynamic ones. | — |

### 7.5 Seasonal and festive atmosphere (spring–summer 113)

| When | Visual cue | Conf. |
|---|---|---|
| March | **Salii** dancing in armour through the streets (1–24 Mar) [A]; the **Cybele/Attis** rites with the Galli (15–27 Mar; the full cycle is attested later, so its form in 113 is uncertain [B]) | A/B |
| 4–10 April **Megalesia** | Games and theatre for Cybele (Magna Mater) at her Palatine temple; Galli processions with drums and cymbals | A |
| 21 April **Parilia** | **Bonfires** of straw that people leap over; **Rome's birthday** | A |
| Late April–May **Floralia** (28 Apr – 3 May) | **Flowers, colourful clothing** (instead of white), games, some licentious theatre | A |
| 9, 11, 13 May **Lemuria** | Householders walk at **midnight, barefoot, throwing black beans** to placate the restless dead; temples closed. **The "ghost-or-not" season.** | A |
| **12 May 113** | **Dedication of Trajan's Column and Venus Genetrix**: ceremony, crowds, sacrifices | A |
| 9 June **Vestalia** | Matrons barefoot to the Temple of Vesta; **bakers' donkeys garlanded**, mills idle | A |
| **15 July Transvectio equitum** | **Parade of knights on horseback in olive wreaths and trabeae** to the Temple of Castor | A |
| **Ludi Apollinares** (6–13 July) | Theatre and circus games | A |
| **Autumn 113** | **Trajan departs for the East** (the Parthian war): troops, oaths, sacrifices, departure processions (a likely main-story beat) | A/B |

---

## 8. Anachronism checklist (do NOT build these in AD 113 Rome)

| Item | Real date | Note |
|---|---|---|
| Aurelian Walls (and anything incorporated in them, e.g. gates at the Porta Maggiore, Pyramid of Cestius in a wall) | 271–275 | Rome is **unwalled** in 113; only fragments of the Servian walls remain |
| Baths of Caracalla / Diocletian / Constantine | 216 / 306 / c. 315 | Baths in 113: Agrippa, Nero, Titus, **Trajan** + hundreds of small *balnea* |
| Arch of Septimius Severus | 203 | Forum NW corner: empty or statues |
| Arch of Constantine | 315 | SW of the Colosseum: open ground by the Meta Sudans |
| Arch of Janus (Velabrum), Arch of Gallienus (as a dedication) | 4th c. / 262 | |
| **Temple of Venus and Roma** | begun 121, dedicated 135/141 | The site on the Velia holds the **Colossus** and the old vestibule area |
| **Hadrianic Pantheon finished** | c. 125–128 | In 113: a **burned ruin and building site** |
| **Colossus beside the Colosseum** | moved c. 128 | In 113: on the Velia |
| Pons Aelius, Mausoleum of Hadrian (Castel Sant'Angelo) | 134 / 139 | |
| Temple of Divus Traianus (and Trajan's ashes in the Column base) | after 117 | |
| Temple of Matidia, Hadrianeum (Temple of Deified Hadrian) | 119 / 145 | |
| Temple of Antoninus & Faustina | 141 | |
| Column of Antoninus Pius / Column of Marcus Aurelius | 161 / c. 193 | |
| Septizodium | 203 | Palatine SE corner faces the Circus without it |
| Severan Forma Urbis | 203–211 | |
| Basilica of Maxentius, Temple of "Romulus", Circus of Maxentius | 4th c. | |
| Column of Phocas, Decennalia base, 4th-c. honorific columns in the Forum | 303–608 | |
| Second obelisk in the Circus Maximus (Lateran obelisk) | 357 | **Only ONE obelisk on the spina** |
| Castra Nova (Severan), Castra Urbana (270s) | | |
| Christian churches, basilicas, **Christian catacombs** | 3rd c.+ | Pagan/Jewish tombs, **columbaria** and family hypogea along the roads are fine |
| Mithraea as common | 2nd–3rd c. | At most rare and small in 113 |
| **Equestrian statue of Domitian** in the Forum | destroyed 96 | Gone (damnatio memoriae) |
| Hadrian's beard fashion | 117+ | Men clean-shaven |
| **Pockmarked Colosseum** (clamp-robbing holes), ruined/missing outer ring | medieval | **Smooth, complete** in 113 |
| Valadier travertine flanks of the Arch of Titus | 1821 | All Pentelic marble |
| Cordonata, Capitoline piazza and palaces, Aracoeli stairs | 16th c. | Clivus Capitolinus + Centum Gradus |
| Electoral campaign posters | after AD 14 | No popular elections |
| Citrus orchards, tomatoes, maize, prickly pear, agave, eucalyptus | post-Columbian / later | |
| Umbrella-pine avenues along the consular roads | mostly 19th c. | Pines in gardens and groves only |
| Stirrups, horseshoes (nailed), gunpowder, paper, windmills, chimneys, glass windows in ordinary flats, forks | later or non-Roman | Hipposandals at most; no stirrups |

---

## 9. Sources (brief)

**Ancient:** Vitruvius *De architectura* (orders, intercolumniation, pediments, taper); Strabo 5.3.7–8 (height limit, the Mausoleum); *Epitome de Caesaribus* 13.13 (Trajan's 60 ft limit); Tacitus *Ann.* 15.43 (post-64 building code), *Hist.* 1.38 (togate guard cohort); Pliny *NH* 3.66 (compita), 15.78 (Forum fig/olive/vine), 34.45 (Colossus), 36.102 (Basilica Aemilia); Suetonius *Nero* 31 (Colossus); Plutarch *Publicola* 15 (Domitian's Capitolium); Pausanias 5.12.6, 10.5.11 (bronze roof of Trajan's Forum); Aulus Gellius 13.25 (*ex manubiis*); Ammianus 16.10.15 (Equus Traiani); Orosius 7.12 / Jerome *Chron.* (Pantheon fire 110); Frontinus *De aquaeductu*; Juvenal *Sat.* 3; Martial; Seneca *Ep.* 104.6, *De Clem.* 1.24; Pliny the Younger *Panegyricus* 51, *Ep.* 6.33; Dionysius of Halicarnassus 3.68 (Circus); SHA *Commodus* 15.6 (velarium sailors); *Lex Iulia Municipalis* (traffic); *Fasti Ostienses* (dedications of 109, 112, 113).

**Modern reference:** S. B. Platner & T. Ashby, *A Topographical Dictionary of Ancient Rome* (1929), on LacusCurtius (penelope.uchicago.edu): entries Forum Augustum, Theatrum Marcelli, Castra Praetoria, Cloaca Maxima, Templum Pacis, etc.; L. Richardson Jr., *A New Topographical Dictionary of Ancient Rome* (1992); F. Coarelli, *Rome and Environs: An Archaeological Guide* (2007/2014); J. E. Packer, *The Forum of Trajan in Rome* (1997); R. Meneghini, excavation reports on the Forum of Trajan and the Templum Pacis; L. Hetland, "Dating the Pantheon", *JRA* 20 (2007); H.-J. Beste on the Colosseum hypogeum; R. Taylor, *Roman Builders*; J.-P. Adam, *Roman Building: Materials and Techniques*; M. Wilson Jones, *Principles of Roman Architecture*; Giannecchini & Moggi-Cecchi, "Stature in archeological samples from central Italy", *AJPA* 135 (2008); Antonio et al., "Ancient Rome: A genetic crossroads of Europe and the Mediterranean", *Science* 366 (2019); Stanford Digital Forma Urbis Romae; Digital Augustan Rome; Wikipedia articles (Colosseum, Trajan's Column, Trajan's Forum, Basilica Ulpia, Circus Maximus, Temple of Castor and Pollux, Curia Julia, Basilica Julia, Arch of Titus, Meta Sudans, Ludus Magnus, Colossus of Nero, Baths of Trajan, Mausoleum of Augustus, Temple of Hercules Victor, Temple of Portunus, Flaminio Obelisk, Pons Fabricius, Aqua Claudia, Domus Flavia, Temple of Vesta, Theatre of Pompey, Forum of Caesar, Temple of Peace, Insula dell'Ara Coeli) for cross-checking numbers.

**Known weak spots** (verify before hero-modelling):
- The size of the JOM superstructure.
- The Saturn and Divus Julius orders in 113.
- The Basilica Ulpia nave height and column heights.
- The Theatre of Marcellus diameter (111 vs 130 m).
- The Colosseum storey heights and hypogeum lift count.
- Meta and carceres dimensions in the Circus.
- The Miliarium Aureum form.
- Ludus Magnus overall dimensions.
- The Atrium Vestae courtyard size.
- Porta Maggiore height.
- Monte Testaccio height in 113.
- Colossus pose.
- Praetorian ceremonial kit.

All of these are tagged [B]/[C] above.
