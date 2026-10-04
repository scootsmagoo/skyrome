# Skyrome: real 3D scans of Roman sculpture, architecture fragments and artifacts

Research date: 2026-10-04. Companion to `assets.md` (textures, characters, audio) and `GDD.md` §16.1 (art direction: stylized realism, **statues and moldings are painted**, hero detail saved for landmarks).

**Scope.** Statues and portraits (Trajan, Augustus, Livia and the rest of the family), reliefs (Trajan's Column, Ara Pacis, Arch of Titus), altars, sarcophagi, capitals and column bases, amphorae, lamps, coins, armour and weapons. Every item below was checked against the license rules in `assets.md` §0 (public GitHub repo, may be sold later): **CC0 / public domain best, CC-BY OK with credit, CC-BY-SA flagged, NC / ND / editorial / AI-generated rejected.**

Nothing was added to the repo. Downloads went to the git-ignored scratch folder `.claude/asset-staging/sculpture/` (about 730 MB of raw STLs plus the reduced GLBs). The only repo file touched is this one.

---

## 1. Summary

1. **Two open sources beat everything else, and both are plain `curl` with no login.**
   - **SMK (Statens Museum for Kunst, Copenhagen)** scanned its Royal Cast Collection (plaster casts of antique sculpture). 371 objects have 3D files. About 90 are Roman works and about 60 more are Roman copies of Greek originals. They are **public domain / CC0**, they are STL files at `https://api.smk.dk/api/v1/download-3d/<id>.stl`, and they include **four panels of Trajan's Column dated 113**, the **Augustus of Prima Porta**, **Matidia (Trajan's niece)**, a **Trajanic man (110-120)**, a **Gaul-or-Dacian head (c. 100)**, **Claudius**, **Julia Titi**, **Drusus**, and a **Flavian/Trajanic matron with the tall curl-tower hairstyle**.
   - **Musée Saint-Raymond (Toulouse)** has CC0 scans mirrored on Wikimedia Commons as STL. They include the **Trajan bust dated 108-113** and the **oak-crowned Augustus**.
2. **The scans are exactly the quality we want, and the pipeline is trivial.** I downloaded 25 of them (20 SMK, 5 Saint-Raymond), converted STL to GLB, decimated to 8-30k triangles in about one second each, and rendered them in three.js. Faces, hair, drapery and relief read clearly. Measured sizes: a 20k-triangle portrait is **246 KB** as plain GLB, **72 KB** with meshopt, **40 KB** with Draco (§3).
3. **STL means no texture and no UVs.** That is a feature for us. The GDD wants painted statues, so one marble/plaster material plus our paint palette beats baked museum-photo textures. Plan on triplanar or procedural shading and (if needed) vertex-baked AO.
4. **Sketchfab is the second tier.** Many museum scans are CC0 (Cleveland, Minneapolis, Rijksmuseum van Oudheden, LWL Westphalia, Musée Saint-Raymond), and good hobbyist scans are CC-BY. But **Sketchfab downloads need a (free) login or API token**: an anonymous `GET /v3/models/<uid>/download` returns `{"detail":"Authentication credentials were not provided."}`. So I could inspect licenses and polycounts through the public API but could not download these.
5. **Rejected on sight.** Whole families of Sketchfab "Roman" models are **AI-generated (Meshy)**: the Corinthian-capital series (Trajan's Forum, Arch of Titus, Pantheon, Mars Ultor...) and two "Ara Pacis" uploads. They look like scans in the thumbnail but are hallucinated geometry. Also rejected: everything from the **British Museum's** own Sketchfab account (CC BY-NC-SA), **Scan the World / MyMiniFactory** (BY-NC-SA on the shop page), and **Open Heritage 3D** (per-dataset, e.g. the Pantheon is BY-NC-SA). Details in §6.
6. **Gaps.** No open scan exists (that I could find) of the **Ara Pacis processions, the Arch of Titus panels, the Great Trajanic Frieze, the Dacian captive statues, or any equestrian bronze**. Real Roman **capitals and column bases** exist only as heavy provincial scans. Procedural stays the right answer for those (§7).
7. **Anachronism filter.** Many of the best scans are of **later** emperors (Hadrian, Antonine, Severan) or of famous finds that were not on display in 113. I listed them in §6 and kept only what fits AD 113. Notably the **Marcus Aurelius equestrian group (c. 175)** and the **Capitoline Wolf (medieval)** are out.
8. **Cost.** A starter pack of 20 CC0 sculptures (§8) is **about 2 MB shipped**. The whole P1 list in §4 is under 5 MB.

---

## 2. Sources checked and verdicts

How I verified licenses. Sketchfab, Commons and SMK pages are JavaScript-rendered, so `WebFetch` returns nothing useful. I used the **public APIs that feed those pages**: Sketchfab API v3 (`/search` returns the `license` object, face counts and archive sizes; `/licenses` gives the wording below), the Wikimedia Commons API and **raw wikitext** of each file page (the license template is quoted below), and the SMK Open API v1. Pages that refused me (HTTP 403): MyMiniFactory, Printables, Medium, the SMK "use of material" page.

Sketchfab license wording (`GET /v3/licenses`):
- `cc0` "CC0 Public Domain": "Credit is not mandatory. Commercial use is allowed."
- `by` "Creative Commons Attribution": "Author must be credited. Commercial use is allowed."
- `by-sa`: "Author must be credited. Modified versions must have the same license. Commercial use is allowed."
- `by-nc-sa`: "Author must be credited. No commercial use. Modified versions must have the same license."

| Source | License found (quoted) | Roman content | Direct download? | Verdict |
|---|---|---|---|---|
| **SMK Open** (Royal Cast Collection) via `api.smk.dk` and Commons | Commons wikitext of the files I opened (KAS740, KAS81/10): `{{Licensed-PD-Art\|PD-old-100-expired\|Cc-zero}}`. All 186 SMK files in `Category:3D models from Statens Museum for Kunst` report "Public domain" in the Commons API. SMK API `public_domain: true`, `rights: https://creativecommons.org/publicdomain/mark/1.0/`. SMK's first-batch announcement (only seen through a search-result summary; the Medium page 403s) says its cast scans were released under public-domain licenses that allow sharing, reshaping and printing "anything at all". | About 90 Roman works plus about 60 Roman copies of Greek originals; 4 Trajan's Column panels | **Yes, `curl`, no login.** STL, 20 MB "small" (400k tris) and 40-500 MB full | **Use. Best source.** One flag: `KAS499` Borghese Gladiator has `public_domain: false`, skip it. |
| **Musée Saint-Raymond**, Sketchfab (user `museesaintraymond`) and Commons mirror | Sketchfab: "CC0 Public Domain". Commons wikitext: `\|photo license = {{cc0}}` (photographer "Musée Saint-Raymond/IMA Solutions", source = their Sketchfab). Two Sketchfab uploads are CC-BY (Augustus 2M faces `60235874...`, Tête de Bacchus). | Trajan, Augustus, Septimius Severus, aurei of Augustus/Claudius/Caligula, sestertius of Trajan, bronzes | Commons STL **yes** (about 10 models); Sketchfab needs login | **Use the CC0 ones.** Check each, a few are CC-BY. |
| **Musée Saint-Raymond via Scan the World**, Commons mirror | Commons wikitext: `\|photo license = {{cc-by-sa-4.0}}` with an OTRS permission ticket (the museum agreed). MyMiniFactory's own page for Scan the World items is BY-NC-SA (search summary; page 403s). | Livia, Octavian-Augustus, Agrippa Postumus, Antonia Minor, Drusus the Younger, Domitia Longina, 18 sarcophagi, the Chiragan Hercules frieze | Yes (Commons, 35 MB STL each) | **Flag (CC-BY-SA).** The museum's own Sketchfab CC0 versions are preferable where they exist. Livia has no CC0 version. |
| **INP Romania** (`cimec`) on Commons and Sketchfab | Commons wikitext: `{{cc-by-4.0}}`; Commons API: "CC BY 4.0" | 1,256 files (STL plus preview JPGs, roughly 600 models): Roman Dacia altars, the Adamclisi Tropaeum Traiani (AD 109) | Yes (STL, about 9 MB) | **OK with credit.** Provincial; use sparingly. |
| **Cleveland Museum of Art** (Sketchfab) | "CC0 Public Domain" (mostly; a few CC-BY) | Vespasian, Claudia Octavia, cinerary box, helmets, lamps | Login | Use |
| **Minneapolis Institute of Art** (`artsmia`) | "CC0 Public Domain" (one BY-SA) | Isis, funerary relief, tondo | Login | Use |
| **Rijksmuseum van Oudheden** (`rmo_leiden`) | "CC0 Public Domain" | Caesar?, Germanicus, altars, tombstones (many provincial) | Login | Use |
| **LWL-Archäologie Westfalen** | "CC0 Public Domain" | Haltern legionary helmet, dagger, lamps (Augustan) | Login | Use |
| **Fitzwilliam, Kelsey, Carlos, Walters volunteers (`agancz`), artfletch, tdr125, ...** | "Creative Commons Attribution" | Portraits, inscriptions, in-situ Roman scans | Login | OK with credit; see §4C |
| **British Museum** (own account) | "CC Attribution-NonCommercial-ShareAlike" | Many | Login | **Reject** |
| **Smithsonian 3D** (CC0) | CC0 | Re-checked by web search: only 19th-century American busts (e.g. Washington as a Roman emperor). No ancient Roman scans. | n/a | Nothing |
| **Poly Haven models** (CC0, direct) | CC0 | Re-listed all 521 models: nothing Roman. `marble_bust_01` is Renaissance-style. Brass vases and ceramic pots are modern. | Yes | Skip |
| **Scan the World / MyMiniFactory, Thingiverse, Printables, Cults** | Per object; mostly BY-NC-SA | Trajan's Column casts, many busts | Login/403 | **Reject** unless a specific item shows CC0/CC-BY |
| **Open Heritage 3D / CyArk** | "licensed through Creative Commons with the specific license selected by the contributor"; Pantheon is BY-NC-SA | Pantheon laser scan | Form | **Reject** |
| **Europeana 3D** | n/a | Searched; nothing hosted directly. Items link out to Sketchfab. | n/a | Nothing new |

---

## 3. The tested pipeline (STL to web GLB)

All of this was run, not guessed. Scratch tools are in `.claude/asset-staging/sculpture/tools/` and reproduced in Appendix B.

```
curl  ->  stl2glb.mjs (weld vertices, write GLB)  ->  gltf-transform simplify --ratio R --error 0.02  ->  gltf-transform meshopt --level high
```

Measured (three.js r186 preview, plain `MeshStandardMaterial`, normals computed at load):

| Asset | Raw triangles | Target | Result | GLB (positions + indices) | + meshopt | + Draco |
|---|---|---|---|---|---|---|
| Trajan bust (MSR, Commons STL) | 291,488 | 20k | 20.4k | 245.6 KB | **71.8 KB** | 40.3 KB |
| Augustus of Prima Porta (SMK small) | 400,066 | 30k | 30.0k | 360.3 KB | **104.6 KB** | n/a |
| Matidia (SMK small) | 400,100 | 20k | 20.0k | 240.8 KB | n/a | n/a |
| Trajan's Column panel KAS81/10 (SMK small) | 400,042 | 15k | 15.0k | 180.7 KB | **53.6 KB** | n/a |
| Trajanic man KAS200 (SMK **full**) | 2,000,028 | 20k | 20.0k | 240.5 KB | n/a | n/a |

- `simplify` takes about **1 second** per model and hits the ratio exactly (`ratio = target / raw`). Use 3 LODs per hero piece (100%, 30%, 8%).
- Add normals later: about +30-40% size before meshopt. Or compute them at load (`geometry.computeVertexNormals()` on the welded mesh, which is what I did, and it looks smooth).
- **I rendered all 25 reduced meshes and looked at them.** Busts hold up well at 12-20k triangles. The Prima Porta cuirass relief softens at 30k (fine beyond 3 m; use 40k for a close-up hero). Trajan's Column panels at 15-25k keep faces, drapery folds and horses.
- **STL specifics.**
  - SMK "small" STLs are **normalised to 130 units on the longest axis** (a 3D-print scale). Real size comes from the museum record, not the file. Busts are about life-size (0.3-0.6 m). **Z is up.** Rotate -90° about X.
  - SMK full-resolution files are 40-500 MB (1M-10M triangles). Use the small ones.
  - Commons MSR STLs are **real millimetres, Y up**. Trajan bust: 349 x 572 x 263 mm.
  - **Dead links:** 2 of the 17 SMK "small" URLs I tried returned HTTP 404 (`KAS200`, `KAS288`). The API still lists them. Always range-check (`curl -r 0-99`) and fall back to the full file.
- **Do not run AI-generated models through this pipeline** (§6). Decimating a hallucinated capital does not make it a scan.

---

## 4. Candidates (57)

Priority: **P1** = take it, **P2** = good alternate or niche, **P3** = reference only. "Target" is the web triangle budget (statues 5-30k, small props under 2-5k plus a baked normal map). "Reduction" is `ratio = target / raw`.

### 4A. Direct download, CC0, no login (22)

SMK items: `https://api.smk.dk/api/v1/download-3d/<id>` (IDs in Appendix A). MSR items: Commons `upload.wikimedia.org` (URLs in Appendix A). All were downloaded and parsed successfully (HTTP 200, binary STL).

| # | P | Object (museum ref, date) | Use in game (atlas ids) | Raw | Target / reduction |
|---|---|---|---|---|---|
| A1 | P1 | **Bust of Trajan**, white marble, dated **108-113**, Villa of Chiragan, H 56 cm (MSR `Ra 117`). Commons: `{{cc0}}`. | `forum-trajan`, `basilica-ulpia`, `forum-trajan-gateway` niches, Palatine halls; head donor for the lost `equus-traiani` | STL 14.6 MB, **291,488 tris** (Sketchfab page says 145,744 faces / 13.2 MB GLB, 2k textures) | 20k, ratio 0.07 (measured: 72 KB meshopt) |
| A2 | P1 | **Augustus crowned with oak**, white marble, 19-18 BC, H 51 cm (MSR `Ra 57`). CC0. | `temple-divus-augustus`, `forum-augustus`, `house-augustus` | STL 23.8 MB, **476,944 tris** | 20k, ratio 0.042 (241 KB raw) |
| A3 | P1 | **Augustus of Prima Porta**, plaster cast (SMK `KAS65`, SMK date "ca. 15 BC"). | `forum-augustus` / `temple-mars-ultor` niche, `temple-divus-augustus` cella, `house-augustus` atrium. The full-length hero statue. | small 20.0 MB, **400,066 tris**; full 503 MB (about 10M) | 30k, ratio 0.075 (measured 105 KB meshopt). 40k for hero close-up. |
| A4 | P1 | **Matidia**, veiled bust, "Roman, first half of 2nd c.", from Baiae (SMK `KAS740`). SMK note: Matidia is Trajan's sister's daughter; the identification is debated (Wegner/West accept it). | `forum-trajan` portrait gallery; veiled matron or priestess | small 20.0 MB, 400,100 tris; full 102.9 MB | 20k, ratio 0.05 |
| A5 | P1 | **"Fonseca bust"**, Roman lady with a tall curl-tower coiffure (SMK `KAS843`, SMK date "Roman, Flavian?"). That hairstyle is the late-Flavian/Trajanic court fashion (see the Marciana note at C7). | Matrons in atria and basilicas; the best match for female fashion in 113 | small 20.0 MB; full 43.2 MB | 20k, ratio 0.05 |
| A6 | P1 | **Man with strong curly hair**, SMK date **110-120** (SMK `KAS200`). The closest Trajan-era male portrait in the set. | Civic portrait busts for the Forum, atria, the Curia's gallery | **No small file (404).** Full 100.0 MB, **2,000,028 tris** | 20k, ratio 0.01 |
| A7 | P1 | **Gaul or Dacian man**, long hair and moustache, c. 100 (SMK `KAS598`). | Dacian captive heads for the `forum-trajan` colonnade, `column-trajan` props | small 20.0 MB, 400,004 tris; full 100 MB | 20k, ratio 0.05 |
| A8 | P2 | **Man with a panther skin**, private portrait, 80-100 (SMK `KAS1099`). | Bacchic priest or collegium bust; tombs, atria | small 20.0 MB; full 94.9 MB | 20k |
| A9 | P1 | **Claudius**, "end of Claudius's reign" (SMK `KAS722`). | `temple-divus-claudius`, `porticus-liviae` | small 20.0 MB; full 122.5 MB | 20k |
| A10 | P1 | **Julia Titi**, c. AD 80-81 (SMK `KAS1238`). Flavian. | `templum-pacis`, `temple-vespasian-titus`, `baths-titus` | small 20.0 MB; full 100.0 MB | 20k |
| A11 | P2 | **Drusus**, Julio-Claudian prince, 15-35 (SMK `KAS431`). | `temple-divus-augustus` and `porticus-liviae` family galleries | small 20.0 MB; full 84.9 MB | 20k |
| A12 | P2 | **Augustan prince "Marcellus?"**, 30-15 BC (SMK `KAS809`). | `forum-augustus` (summi viri), `porticus-octaviae` | small 20.0 MB; full 87.3 MB | 20k |
| A13 | P2 | **Standing nude male statue**, SMK "Germanicus", ca. 30 BC (SMK `KAS644`). A full-figure heroic-nude portrait statue with drape. | Statue in fora and temple porticoes | small 20.0 MB, 400,020 tris; full 75.3 MB | 25-30k, ratio 0.07 |
| A14 | P2 | **Two Julio-Claudian women**: `KAS720` (30-40) and Minatia Polla `KAS1227` (35-40). | Ancestor busts in atria; family tombs | small 20.0 MB each | 15-20k each |
| A15 | P1 | **Trajan's Column cast: "Roman laurel-wreathed sacrificer"** (SMK `KAS81/9`, SMK date "113"). | `column-trajan` base-zone reliefs; normal-map source for the shaft frieze | small 20.0 MB, 400,004 tris; full 38.4 MB | 25k, ratio 0.0625 |
| A16 | P1 | **Trajan's Column cast: "Spectators of a sacrifice (Dacian women and men)"** (SMK `KAS81/10`, "113"; Commons notes 520 x 850 mm cast). | as A15 | small 20.0 MB, 400,042 tris; full 50.0 MB | 15-25k (measured at 15k: 181 KB) |
| A17 | P1 | **Trajan's Column cast: "Embassy of barbarian peoples"** (SMK `KAS81/11`, "113"). | as A15 | small 20.0 MB; full 50.0 MB | 25k |
| A18 | P1 | **Trajan's Column cast: "Roman soldiers attacking"** (SMK `KAS81/13`, "113"). Lies flat in the file (depth on Z). | as A15 | small 20.0 MB; full 54.4 MB | 25k |
| A19 | P1 | **Funerary relief of Publius Aiedius Amphio and Aiedia**, 20-10 BC, bust pair in a niche (SMK `DEP457`). | Tomb rows on `via-appia` and the northern roads; columbaria | small 20.0 MB; full 97.0 MB | 25k, ratio 0.0625 |
| A20 | P1 | **Bronze statuette of Jupiter**, 1st c. BC to 1st c. AD, H 16.8 cm, from Bouillac (MSR 2014.1.1). CC0. | Lararia, shop shrines, temple offering shelves | STL 5.0 MB, **100,022 tris** | 8-10k, ratio 0.1 (121 KB) |
| A21 | P2 | **Laocoon**, cast (SMK `KAS385`). Pliny (NH 36.37) places the group in Titus's house; found on the Esquiline in 1506. | `baths-titus`, `domus-aurea-buried` (placement is a judgment call) | small 20.0 MB | 30k |
| A22 | P2 | **Dying Gaul** ("Dying Gladiator", cast, SMK `KAS1312`). Found in the Horti Sallustiani area. | `horti-sallustiani` garden | small 20.0 MB; full 200 MB | 25k |

**Also in SMK, not listed:** `KAS2298` Roman general (ca. 80 BC), `KAS631` Republican portrait, `KAS497` barbarian woman (early 1st c.), `KAS1313` priestess of Isis restored with a jar (2nd c.), `KAS35` seated Thalia (2nd c.), Hadrianic and Antonine portraits (anachronistic). Enumerate with the script in Appendix B.

### 4B. Sketchfab CC0 museum scans (login needed to download) (11)

All license labels read "CC0 Public Domain: Credit is not mandatory. Commercial use is allowed." Sizes are the Sketchfab GLB archive.

| # | P | Object | Use in game | Author / URL | Raw | Target / reduction |
|---|---|---|---|---|---|---|
| B1 | P1 | **"Julius Caesar?"**, Roman man with short hair and crow's-feet | `temple-divus-julius`, `forum-caesar` | Rijksmuseum van Oudheden, `sketchfab.com/3d-models/bc68d05694af4688ab800461a3f6ef96` | 512,431 faces, 19.5 MB, 4k tex | 20k, 0.039 |
| B2 | P2 | **"Germanicus"**, half-long hair | Julio-Claudian gallery | RMO, `.../6aea3a466ce444b4b4798c37d502648c` | 764,325 faces, 29.7 MB | 20k, 0.026 |
| B3 | P1 | **Vespasian, recut from Nero**, AD 64-79, 40 cm | `templum-pacis`, `temple-vespasian-titus` | Cleveland Museum of Art `1929.998`, `.../359e48ed821544fe8cf22c3c5dbbff9d` | 64,654 faces, 69.9 MB (3 x 8k tex) | Mesh already light; shrink the textures to 2k |
| B4 | P2 | **Empress Claudia Octavia**, 50-70 | Neronian-era imperial portrait (Palatine) | Cleveland `1925.943`, `.../9b2fbfe552ac4107a3623e19c1ddb4e4` | 80,000 faces, 122.7 MB | 15k |
| B5 | P2 | **Cinerary box**, marble, 1-100 CE, Italy, 29 x 24 cm | Tombs, `columbarium-pomponius-hylas` | Cleveland `1915.560`, `.../97d4e16d56434cf5984198512737aff8` | 233,386 faces, 153.8 MB | 5k |
| B6 | P1 | **Goddess Isis**, bronze statuette, 1st c. CE | `iseum-campense` | Minneapolis Institute of Art, `.../fef83e3711e248689702f953e02809a0` | 64,000 faces, 5.4 MB | 8k |
| B7 | P1 | **Roman legionary helmet**, Haltern main camp, dated 7/5 BC to AD 9/16 (Augustan; by 113 the Imperial Gallic/Italic types dominate, so use it as veterans' or old kit and as a modelling reference) | Legionary kit, `castra-praetoria` | LWL-Archäologie `046`, `.../58b2ee67fbda4764a2c975ded8e46b96` | 500,020 faces, 93.6 MB (8k tex) | 2-4k plus baked normal map |
| B8 | P2 | **Dagger with scabbard**, Haltern, "around Christ's birth", 35 cm | Pugio props | LWL `048`, `.../a991ac44ee4048deb2c58cc7e797e4d9` | 1,999,492 faces, 183.4 MB | 3k plus baked normal map |
| B9 | P2 | **Eagle lamp**, bronze, "around Christ's birth", 14.3 cm | Tavern and domus lamps | LWL `050`, `.../c924448579f5415dbfb1825b985fccb4` | 499,330 faces, 88.2 MB | 3k |
| B10 | P1 | **Sestertius of Trajan**, minted at Rome 103-111, 26.35 g | Inventory icon and coin pickup; render to 2D | MSR, `.../ba652714bc514e3888f94a606985f79e` | **400 faces** plus 4k textures (35 MB) | Geometry is already tiny. Bake a 256-512 px icon. |
| B11 | P1 | **Aurei of Augustus (11-10 BC), Claudius (50-54), Caligula (37)** | Currency icons | MSR, `.../ebd08135cca146e3890c9b705e340cd7`, `.../cdf7a3f84a6046f5b0aa9a82ca241341`, `.../d484dc681b8a46b0969287f5e89b488d` | 400 faces each, 7-9 MB | as B10 |

### 4C. Sketchfab CC-BY (login needed, credit required) (24)

All label "Creative Commons Attribution: Author must be credited. Commercial use is allowed." Every entry goes in `CREDITS.md` (Appendix C).

| # | P | Object | Use in game | Author / URL (`sketchfab.com/3d-models/<uid>`) | Raw | Target / reduction |
|---|---|---|---|---|---|---|
| C1 | P1 | **Trajan's Column in situ** (254 photos, Feb 2026, Metashape; "top section not shown") | `column-trajan`. **Bake source** for the shaft frieze normal/height map and base details; not a runtime mesh. | artfletch, `e99d644be6f34cbea00a7cf95041b67c` | 1,582,528 faces, 77.3 MB (2 x 8k tex) | Strip to 40k and bake |
| C2 | P1 | **Cupid relief fragments**, "from the interior decoration of the cell of the Temple of Venus Genetrix in the Forum of Caesar. Date: 113 AD", Museo dei Fori Imperiali | `temple-venus-genetrix` interior, `markets-trajan` | artfletch, `45460b35dccb40d2ae927d755794289b` | 429,062 faces, 24.2 MB | 20k, 0.047 |
| C3 | P2 | **House of Livia triclinium**, second-style paintings, 30 BC (279 photos, Feb 2026) | `house-livia`. **Texture source** for fresco panels; use a 10k room box for geometry. | artfletch, `df3f6c4708e44b5caf4cdacfc5f448f5` | 904,942 faces, 62.6 MB (2 x 8k) | 10k |
| C4 | P1 | **Livia, "Ceres type"**, Antikensammlung Kiel `N 170-2`, AR-optimised (check the page for whether Kiel's piece is the original or a cast) | `house-livia`, `porticus-liviae`, `macellum-liviae` | antikensammlung_kiel, `3c3ff75149e643808ff8e802f74f93fc` | 200,000 faces, 20.7 MB (8k) | 15-20k |
| C5 | P2 | **Livia**, Parian marble bust found at Carthage (the museum's date field reads 58-29 BC, which looks like her life span) | alt Livia | fitzwilliammuseum, `cf29c58ab12347c8be4feb8d6216a39e` | 500,000 faces, 18.8 MB | 20k |
| C6 | P2 | **Livia**, MNAT 7602, Paros marble, first quarter of 1st c. AD, 31 cm, Tarragona | alt Livia (portrait gallery) | mnattgn, `ffae2613cc2143ed8a35c4b33704c45a` | 500,000 faces, 36.2 MB | 20k |
| C7 | P1 | **Ulpia Marciana**, Trajan's sister (d. 112, deified), 379k faces. Description: "ever more complex hair arrangements were developed for the ladies of the imperial court" | `forum-trajan`; the reference for A5's hairstyle | mikepnyu, `11685e0699784b468a35a9c7ceb68d3e` | 379,123 faces, 15.3 MB (4k) | 20k |
| C8 | P2 | **Torso of an Emperor in Armor**, Parian marble, AD 14-68, Walters Art Museum | Cuirassed statue body for fora; swap in A1's head | agancz, `a86e2a3297664c3690531a046e75a705` | 176,627 faces, 17.8 MB | 25k |
| C9 | P1 | **Head of a Priestess**, Parian marble, late 1st to early 2nd c. AD, 57 cm, Carlos Museum | Priestess bust (Vesta, Isis); Trajanic hair | kemcclin, `dc8675557181447dabd382816d5426e7` | 371,855 faces, 26.8 MB | 20k |
| C10 | P1 | **Funerary inscription of L. Calpurnius Rufus**, scriba of the Praetorian fleet at Misenum, Roman 71-214 CE, 29 x 38 cm, Kelsey Museum | `castra-misenatium`; tomb plaques in columbaria | Kelseymuseum, `fbdbac87b671468ebea9fc8f2166482a` | 200,000 faces, 44.1 MB (3 x 8k) | 2k slab plus texture crop |
| C11 | P1 | **Lar holding a patera and cornucopia**, bronze, 1st-2nd c. CE, Mount Holyoke `MH 2013.31` | Lararia in domus and insulae; Compitalia shrines | laurashea, `afe58d4a99214ed18177cb65d0fe9b23` | 100,000 faces, 24.2 MB | 8k |
| C12 | P2 | **Dacians on Trajan's Column** (photogrammetry, 16 photos) | `column-trajan` details; Dacian figures | mihai.s, `3759412597ac4fdf96f78e2a6c64bf2e` | 78,435 faces, 5.6 MB | 15k |
| C13 | P1 | **Roman pugio, 70-130 AD** | Legionary kit. Already game-ready. | davicolt, `4fbd48b57c3a440f87072226686bcf60` | **4,952 faces**, 30.8 MB (3 x 4k tex) | Keep; textures to 1k |
| C14 | P2 | **Gladius, Pompeii type** | Gladius prop and reference | count_zero, `be820101a6ec4dc7b895fe3a4cabb72f` | 10,930 faces, 48.0 MB (6 x 4k) | 2k plus normal map |
| C15 | P2 | **Roman instruments of war** (cornu and others) | Army signalling props | AlbertGregl, `5700f4c6cc1f4bcd92defbd8459ad62e` | 4,304 faces, 3.0 MB | Keep |
| C16 | P2 | **Three-legged marble table**, House of the Ceii, Pompeii (scan, delit) | Domus and shop interiors | OpusPoly, `ae18ba9db0f34eab9b8af5250540b994` | **3,016 faces**, 24.3 MB (4k) | Keep; textures to 1k |
| C17 | P3 | **Roman oil lamp** (a replica, scanned) | Lamp props | OpusPoly, `45636e55ecc842bd8b107ad7b284d428` | 10,000 faces, 4.2 MB | 1.5k |
| C18 | P1 | **Dressel 20 amphora** ("parva"), the Baetican olive-oil type found at Monte Testaccio | `monte-testaccio`, `emporium`, `horrea-galbana` | josemoya, `b419273dfd2c4255ba94c17bf9e08887` | 241,143 faces, 12.9 MB (4k) | 2k |
| C19 | P2 | **Forum pavement**, travertine slabs with the inscription `A. AEMILIUS A. F.`, Terracina | Texture and normal-map source for forum paving | tdr125, `e03de7e251754a3b89f4a64916001eab` | 272,166 faces, 21.6 MB (8k) | Texture only |
| C20 | P2 | **Roman columbarium**, Terracina, on the Appian Way | `columbarium-pomponius-hylas` interior | tdr125, `6c8982a286154459b8aae2e9b4e7a16a` | 89,999 faces, 11.0 MB | 10k |
| C21 | P3 | **Tomb of Eurysaces the Baker, ideal reconstruction** (SketchUp, not a scan) | `tomb-eurysaces`, `porta-maggiore`. Use as reference; the monument is simple enough to build procedurally. | michelebutini, `06bda131a28f4cfdbd96ed0780c96c0a` | 102,169 faces, 8.0 MB (13 mats, 1k) | Reference |
| C22 | P2 | **Ara Pacis: acanthus scrolls and lizard** (detail) | `ara-pacis` precinct wall panel; normal-map source | yannbernard, `80a1f0e1aa404f4bbfc0afd7fdea2192` | 307,944 faces, 18.4 MB (2 x 4k) | 20k relief panel |
| C23 | P2 | **Corinthian capital**, MNAT 7593, 31 BC-AD 14, 58 cm, Theatre of Tarraco | Scale reference and normal map for the procedural capital, or one hero capital at a temple porch | mnattgn, `33a3b21aa6c24094afae050fd237720b` | 199,999 faces, 16.5 MB (2k) | 10k |
| C24 | P2 | **Grave altar of Titus Statilius Hermes**, AD 1-200, relief decoration | Tomb rows; funerary altars | fitzwilliammuseum, `e62834dccb1f428f8a1ad16730463968` | 300,000 faces, 50.8 MB (2 x 8k) | 12k |

**Bulk source (Commons, CC BY 4.0, direct STL).** `Category:3D models from Institutul Național al Patrimoniului` has 1,256 files (STL plus preview JPGs, roughly 600 models) from the Romanian National Heritage Institute: Roman Dacia altars (about 9 MB STL, 180k tris each, e.g. `Altar dedicat lui Silvanus`) and the **Tropaeum Traiani at Adamclisi** (9.36 MB, about 187k tris; Trajan's AD 109 trophy, off-map for Rome). Provincial, 2nd-3rd c. altars, mostly a shape source.

---

## 5. Where it goes: landmark map

| Atlas id | Candidates |
|---|---|
| `column-trajan` | A15-A18 (SMK casts, 113), C1 (in-situ bake source), C12 (Dacians) |
| `forum-trajan`, `basilica-ulpia`, `forum-trajan-gateway` | A1 Trajan, A4 Matidia, A5 Fonseca lady, A6 Trajanic man, A7 Dacian head, C7 Marciana |
| `equus-traiani` | **Gap.** Reuse A1's head on a procedural bronze horseman. |
| `temple-venus-genetrix`, `forum-caesar`, `temple-divus-julius` | C2 Cupid reliefs (113), B1 Caesar |
| `forum-augustus`, `temple-mars-ultor`, `arch-augustus`, `temple-divus-augustus`, `house-augustus` | A2, A3, A12, A11 |
| `house-livia`, `porticus-liviae`, `macellum-liviae` | C3 triclinium (texture source), C4 / C5 / C6 Livia, A9 Claudius |
| `ara-pacis` | C22 (acanthus detail). **Gap** for the processions. |
| `templum-pacis`, `temple-vespasian-titus`, `arch-titus`, `baths-titus`, `domus-aurea-buried` | B3 Vespasian, A10 Julia Titi, A21 Laocoon |
| `iseum-campense` | B6 Isis |
| `horti-sallustiani` | A22 Dying Gaul |
| `castra-misenatium`, `castra-praetoria` | C10 inscription, B7 helmet, C13 pugio, C14 gladius, C15 cornu |
| `tomb-eurysaces`, `porta-maggiore`, `columbarium-pomponius-hylas`, `via-appia` tombs | A19 funerary relief, B5 cinerary box, C20 columbarium, C24 grave altar, C21 (reference) |
| `monte-testaccio`, `emporium`, `horrea-galbana` | C18 Dressel 20 |
| Lararia in domus and insulae | A20 Jupiter, C11 Lar |
| Forum paving (`rostra`, `curia-julia`, `lapis niger` area) | C19 as texture source |
| Inventory and economy | B10, B11 coins |
| Generic interiors | C16 table, C17 lamp, B9 lamp |

---

## 6. Rejected and flagged

### Rejected

| Item | Why |
|---|---|
| `giorgia.mingotto` **Corinthian Capital** series (Trajan's Forum, Vespasian and Titus, Venus Genetrix, Mars Ultor, Arch of Titus, Pantheon, Vesta, Hercules Victor...; 2.4-4.1M faces, CC-BY) | **AI-generated.** Description: "This model was generated using Meshy's AI toolkit." No textures, hallucinated geometry. Same for `vasvitmih` "Classical Ionic Capital". |
| `aopdfikopajljdka` **Ara Pacis Augustae Rome** (two uploads, CC-BY) | **AI-generated (Meshy).** |
| `juanbrualla` (many Vatican, Venice, Pompeii and Merida pieces, CC-BY) | Description says "IA Photo to 3D Process": AI photo-to-3D, not a scan. |
| **British Museum** official Sketchfab (about 15 Roman pieces) | "CC Attribution-NonCommercial-ShareAlike". Note that `nebulousflynn` re-uploaded the BM Julius Caesar (150k faces, 15.1 MB, identical to the BM one) as CC-BY. **Do not use**: the provenance conflicts with the BM's own terms. |
| Fitzwilliam "Honours for Antiochus", `danielpett` "Antinous", `tdr125` "Roman funerary lion" | NC, or NC-ND. |
| **Scan the World / MyMiniFactory** items | BY-NC-SA on the shop page (could not fetch; 403). Commons mirrors of the Saint-Raymond set say CC BY-SA 4.0. See flags. |
| **Open Heritage 3D** (Pantheon laser scan) | BY-NC-SA. |
| SMK `KAS499` Borghese Gladiator | `public_domain: false`. |

### Anachronism (legal, but not Rome in AD 113)

Marcus Aurelius (SMK `KAS1133/1`, `/2`, the Capitoline equestrian group c. 175), Hadrian and the Hadrianic cuirass statue (r. 117-138), Antinous (130s), Faustina, Lucius Verus, Commodus, Septimius Severus (incl. MSR's CC0 busts), Caracalla, Julia Domna, Tranquillina and Licinius (3rd-4th c.), the Portonaccio and other 2nd-3rd c. sarcophagi, the Basilica of Maxentius (308), the **Farnese Hercules** (from the Baths of Caracalla), the **Capitoline Wolf** (medieval bronze), Nicopolis capitals (2nd-3rd c.). **Sarcophagi in general:** cremation was the norm in 113 and inhumation sarcophagi only spread under Hadrian. The 18 Saint-Raymond sarcophagi and the Simpelveld one are out. Use cinerary altars and boxes (B5, C24) instead.

### Flagged: CC-BY-SA (legal, but share-alike reaches our derived meshes)

| Item | License as found |
|---|---|
| Musée Saint-Raymond via Scan the World on Commons: **Livia** (`47-msr-livie-10.stl`), **Octavian-Augustus** (`61-msr-octave-augustus-5.stl`), Agrippa Postumus, Antonia Minor, Drusus the Younger, Domitia Longina, Valeria Maximilia, Cybele, Attis, Hygieia, theatre masks, the Chiragan Hercules frieze, a capital and two columns (35 MB STL each) | `{{cc-by-sa-4.0}}` (Commons wikitext) |
| `Bust of Augustus-MAHG 009164` (Geneva), by Rama on Commons | CC BY-SA 3.0 fr / CeCILL |
| `Roman funerary altar Augusta Emerita.stl` (Commons) | CC BY-SA 4.0 |
| `mihai.s` "Part of Trajan's Column in Bucharest" (3 parts) | BY-SA (the CC-BY pieces in C12 are fine) |
| `alicecmartin` "Trajan (Dacicus)" and others | BY-SA |

If the owner is comfortable with share-alike on the decimated meshes (the code is unaffected), Livia and Octavian-Augustus from the Saint-Raymond set become the only direct-download Livia/young-Augustus. Otherwise use C4 for Livia.

---

## 7. Gaps and what to do instead

| Need | Finding | Recommendation |
|---|---|---|
| Ara Pacis processions, Tellus relief | No open scan. Only the acanthus detail (C22) and AI junk. | Procedural relief panels with a tiled stone material. |
| Arch of Titus panels (menorah, triumph) | None. Only a tourist-quality "Golden Menorah" model. | Procedural. |
| Great Trajanic Frieze, Anaglypha Traiani, Haterii tomb | None | Skip. |
| Dacian captive statues (`forum-trajan` attic) | Only the Dacian heads A7, C12 | Use heads on procedural bodies in a dark stone material. |
| `equus-traiani` | Lost in antiquity; no CC scan of any imperial equestrian bronze that fits | Procedural horse plus A1's head. |
| Capitals and column bases | Only heavy provincial scans (C23; Terracina capital 385k faces, 24.6 MB `200be187ca844ee5b792ea52ed885aaf`; MSR capital is BY-SA) | Keep the procedural orders from `architecture.md`; borrow a scan's normal map for the acanthus. |
| Amphorae | Only Dressel 20 (C18) | Lathe other types procedurally. |
| Statues in togas | Only Carthage or 3rd-c. togati (SMK `KAS685` is c. 250) | Procedural toga on A-series heads. |
| Armour | Only Augustan Haltern pieces and hobbyist low-poly | Procedural lorica segmentata plus B7 as helmet reference. |

---

## 8. Recommendation

1. **Starter pack, all CC0, no login, about 2 MB shipped.** A1, A2, A3, A4, A5, A6, A7, A9, A10, A11, A12, A15, A16, A17, A18, A19, A20. Twenty meshes at 8-30k triangles, each 50-110 KB with meshopt. That covers Trajan, Augustus (two), Matidia, a Trajan-era matron, a Trajanic man, a Dacian, Claudius, Julia Titi, Drusus, Marcellus, four Trajan's Column panels, one funerary relief and one lararium bronze. It makes `forum-trajan`, `column-trajan`, `forum-augustus` and the tombs visibly real.
2. **Build one fetch script** that reads a manifest (`id`, URL, source, license, ratio, rotation, real height in metres), runs the Appendix B pipeline, and writes `public/assets/sculpture/<id>.glb` plus a `CREDITS.md` line (per `assets.md` §8). Keep raw STLs out of git (use `.asset-cache/`).
3. **One shared material.** Marble/plaster PBR (`assets.md` §1.2 Marble019) plus the GDD paint palette in a triplanar or vertex-colour shader. The real busts were painted; this gets the look for free and avoids UV unwrapping.
4. **If the owner wants Sketchfab items** (B and C groups), create a free Sketchfab account and an API token once, then add an `Authorization: Token ...` header to the script (`GET /v3/models/<uid>/download` returns signed glTF/GLB URLs). Do the CC0 B-group first (helmet, coins, Isis, Vespasian).
5. **Sequencing.** This is a content pass that does not touch gameplay. Do the starter pack when the Forum Trajan scene is being dressed. It can wait until the core game loop is done without losing anything.

---

## Appendix A: download manifest

Commons (MSR, CC0). Use a descriptive `User-Agent` (Wikimedia asks for one). Sizes are the served `content-length`.

```bash
UA='skyrome-asset-scout/1.0 (research)'
curl -L -A "$UA" -o MSR-Trajan-Ra117.stl   https://upload.wikimedia.org/wikipedia/commons/e/e5/MSR-Trajan-Ra_117.stl       # 14,574,484 B
curl -L -A "$UA" -o MSR-Auguste-Ra57.stl   https://upload.wikimedia.org/wikipedia/commons/1/1e/MSR-Auguste-Ra57.stl        # 23,847,284 B
curl -L -A "$UA" -o MSR-Jupiter.stl        https://upload.wikimedia.org/wikipedia/commons/3/35/MSR-Jupiter-2014-1-1.stl     #  5,001,184 B
```

SMK (CC0 / public domain, STL). Base: `https://api.smk.dk/api/v1/download-3d/`. **Range-check each URL first** (`curl -s -r 0-99 -o /dev/null -w '%{http_code}' URL` should give 206).

| Object | small (about 20 MB, 400k tris) | full |
|---|---|---|
| KAS65 Augustus Prima Porta | `dj52w921d_KAS65_small.stl` | `6682x851h_smk-kas65-augustus-prima-porta.stl` (503 MB) |
| KAS740 Matidia | `qb98mm14m_KAS740_small.stl` | `rb68xh148_55-smk-inv-740.stl` (103 MB) |
| KAS843 Fonseca bust | `m039k989c_KAS843_small.stl` | `6d5702059_smk3-kas843-fonseca-bust.stl` (43 MB) |
| KAS200 Trajanic man | **small link is dead (404)** | `q524jt287_62-smk-inv-200.stl` (100 MB) |
| KAS598 Gaul or Dacian | `rf55zd447_KAS598.stl` | `kk91fr32w_inv-598.stl` (100 MB) |
| KAS1099 man with panther skin | `7w62fd81v_KAS1099_small.stl` | `tt44ps69k_inv-1099.stl` (95 MB) |
| KAS722 Claudius | `bk128g50c_KAS722_small.stl` | `4b29bb622_164-inv-722.stl` (122 MB) |
| KAS1238 Julia Titi | `pg15bk672_KAS1238_small.stl` | `b27740812_54-smk-inv-1238.stl` (100 MB) |
| KAS431 Drusus | `db78th447_KAS431_small.stl` | `fn107356j_160-inv-431.stl` (85 MB) |
| KAS809 Augustan prince | `zp38wj686_KAS809_small.stl` | `m039k983q_153-smk-809.stl` (87 MB) |
| KAS644 nude statue "Germanicus" | `nv935743t_KAS644_small.stl` | `0p096c25s_smk41-kas644-germanicus.stl` (75 MB) |
| KAS720 / KAS1227 women | `6h440z239_KAS720_small.stl` / `r207tt91d_KAS1227_small.stl` | `4t64gs85f_inv-720.stl` / `z603r3074_155-smk-inv-1227.stl` |
| KAS81/9 sacrificer | `dr26z311x_KAS81-9_small.stl` | `pc289p640_79.stl` (38 MB) |
| KAS81/10 spectators | `hd76s4850_KAS81-10_small.stl` | `5x21tk796_78.stl` (50 MB) |
| KAS81/11 embassy | `r494vq89k_KAS81-11_small.stl` | `wp988q60g_77.stl` (50 MB) |
| KAS81/13 soldiers attacking | `dj52w922p_KAS81-13_small.stl` | `h415pg15j_75-romerske-soldater-angriber-inv-ction.stl` (54 MB) |
| DEP457 funerary relief | `4j03d432t_DEP457_small.stl` | `9306t391j_74-inv-kasdep-42-publius-aiedius-amphio-tex-ction.stl` (97 MB) |
| KAS385 Laocoon | `d504rr247_KAS385_small.stl` | (small only) |
| KAS1312 Dying Gaul | `5t34sq60f_KAS1312_small.stl` | `4f16c782s_smk-190-inv-dying-gladiator.stl` (200 MB) |

To list every SMK object that has a 3D file, with Roman dating notes (no key needed):

```bash
curl -s 'https://api.smk.dk/api/v1/art/search/?keys=*&offset=0&rows=100&lang=en&filters=%5Bhas_3d_file%3Atrue%5D'
# 371 hits; page with offset=100,200,300. Fields: object_number, titles, files_3D[{url,file_size}],
# original[0].production_date_notes (e.g. "113 / Romersk"), public_domain, rights.
```

## Appendix B: STL to GLB scratch converter and commands

`stl2glb.mjs` (binary STL only; welds identical vertices; no dependencies):

```js
import fs from 'node:fs';
const [,, inp, out] = process.argv;
const buf = fs.readFileSync(inp);
const n = buf.readUInt32LE(80);
if (84 + n * 50 !== buf.length) { console.error('not binary STL'); process.exit(2); }
const map = new Map(); const pos = []; const idx = new Uint32Array(n * 3);
let mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9];
for (let i = 0; i < n; i++) {
  const o = 84 + i * 50 + 12;
  for (let k = 0; k < 3; k++) {
    const v = [buf.readFloatLE(o+k*12), buf.readFloatLE(o+k*12+4), buf.readFloatLE(o+k*12+8)];
    const key = v.join(','); let id = map.get(key);
    if (id === undefined) { id = pos.length / 3; map.set(key, id); pos.push(...v);
      for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], v[a]); mx[a] = Math.max(mx[a], v[a]); } }
    idx[i*3+k] = id;
  }
}
const P = new Float32Array(pos), pb = Buffer.from(P.buffer), ib = Buffer.from(idx.buffer);
const bin = Buffer.concat([pb, ib]);
const json = { asset:{version:'2.0'}, scene:0, scenes:[{nodes:[0]}], nodes:[{mesh:0}],
  meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],
  accessors:[{bufferView:0,componentType:5126,count:P.length/3,type:'VEC3',min:mn,max:mx},{bufferView:1,componentType:5125,count:idx.length,type:'SCALAR'}],
  bufferViews:[{buffer:0,byteOffset:0,byteLength:pb.length,target:34962},{buffer:0,byteOffset:pb.length,byteLength:ib.length,target:34963}],
  buffers:[{byteLength:bin.length}] };
let js = Buffer.from(JSON.stringify(json)); while (js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]);
let b = bin; while (b.length % 4) b = Buffer.concat([b, Buffer.alloc(1)]);
const h = Buffer.alloc(12); h.write('glTF',0); h.writeUInt32LE(2,4); h.writeUInt32LE(12+8+js.length+8+b.length,8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length,0); jh.write('JSON',4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(b.length,0); bh.writeUInt32LE(0x004E4942,4);
fs.writeFileSync(out, Buffer.concat([h,jh,js,bh,b]));
console.log(JSON.stringify({ tris:n, verts:P.length/3 }));
```

```bash
node stl2glb.mjs KAS740_small.stl KAS740.raw.glb
npx -y @gltf-transform/cli@4 simplify KAS740.raw.glb KAS740.glb --ratio 0.05 --error 0.02     # 400k -> 20k
npx -y @gltf-transform/cli@4 meshopt  KAS740.glb KAS740.meshopt.glb --level high               # 241 KB -> about 70-100 KB
```

Preview harness (not needed in production): a static server rooted at the repo and a three.js page with `GLTFLoader` and a plain `MeshStandardMaterial`, screenshotted with the repo's Playwright. SMK files need `rotation.x = -π/2`.

## Appendix C: CREDITS block (paste into `CREDITS.md`, trim to what ships)

```markdown
### 3D sculpture scans

CC0 / public domain (credited as a courtesy):
- Plaster casts scanned by **SMK, Statens Museum for Kunst (National Gallery of Denmark)**, from the Royal Cast
  Collection, public domain / CC0 (https://open.smk.dk): KAS65 Augustus of Prima Porta; KAS740 Matidia;
  KAS843 "Fonseca bust"; KAS200, KAS598, KAS722, KAS1238, KAS431, KAS809 portraits; KAS81/9, 81/10, 81/11, 81/13
  Trajan's Column panels; DEP457 funerary relief of P. Aiedius Amphio. Decimated for real-time use.
- **Musée Saint-Raymond, Toulouse** (3D scans by IMA Solutions), CC0: Bust of Trajan (Ra 117),
  Bust of Augustus crowned with oak (Ra 57), Jupiter statuette (2014.1.1), via Wikimedia Commons / Sketchfab.

CC-BY 4.0 (attribution required; add one line per shipped item):
- "<Title>", <author>, <museum if any>, Sketchfab, CC BY 4.0, <URL>. Modified: decimated, retextured.
  (Authors for the C-group: artfletch, antikensammlung_kiel, mikepnyu, kemcclin, Kelseymuseum, laurashea,
  davicolt, OpusPoly, josemoya, tdr125, yannbernard, mnattgn, fitzwilliammuseum, agancz.)
```

---

### Sources consulted

Sketchfab API v3 (`/search` with `license`, `user`, `downloadable` filters; `/licenses`; anonymous `/download` check). Wikimedia Commons API and raw file wikitext (STL files, categories `3D models from Statens Museum for Kunst`, `STL files from Musée Saint-Raymond of Toulouse`, `3D models from Institutul Național al Patrimoniului`, `STL files from Smithsonian Institution`). SMK Open API v1 (`api.smk.dk/api/v1/art/search`, 371 items with 3D files). Poly Haven API (`/assets?t=models`, 521 models). Web searches for Smithsonian 3D, Open Heritage 3D, Europeana, Scan the World / MyMiniFactory licensing, and SMK's cast-scanning announcement (the page itself returned 403). three.js r186 and `@gltf-transform/cli@4` for the measurements and previews.
