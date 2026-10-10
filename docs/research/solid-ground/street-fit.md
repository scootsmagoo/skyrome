# Street-level fit audit

Generated 2026-10-10T23:16:30.271Z by `node scripts/audit/street-fit.mjs` (227 of 227 street cells, 2.4 min sweep, 3.5 min with screenshots). Coordinates are game metres (+x east, +z south). Values are metres.

## Totals

```
{
 "streetCells": 8571096,
 "doublePavingCells": 844789,
 "zfightCells": 35416,
 "lipCells": 89526,
 "lipCells05": 61981,
 "lipCells12": 16888,
 "props:block": 26141,
 "propsFootInAir": 6659,
 "propsTerrainThroughFloor": 2870,
 "edgeSamples": 881640,
 "edgeBins": 21761,
 "throughCells": 34722,
 "kerbstones": 879,
 "props:street": 1429,
 "fixtures": 5664,
 "fixturesEdgeInAir": 201,
 "propsFloating": 2409,
 "fixturesFloating": 886,
 "face-bottomBins": 361,
 "lipCells30": 1948,
 "propsSunk": 271,
 "props:landmark": 1609,
 "propsOnProps": 35,
 "kerbstonesOnCityPaving": 59,
 "fixturesUpperLevel": 31,
 "lmPropsFloating": 42,
 "lmPropsUpperLevel": 84,
 "lmPropsSunk": 3,
 "cells": 227,
 "droppedFindings": 45853
}
```

## Open edges by source

| source | edge examined (m) | floating > 3 cm (m) | > 8 cm | > 15 cm |
| --- | ---: | ---: | ---: | ---: |
| ground-cover | 42524.5 | 10827 | 480.8 | 17.3 |
| street:vicus | 48098.8 | 4104.5 | 713.8 | 132.9 |
| street:alley | 49849.1 | 2810.8 | 507.4 | 54.8 |
| road:rural | 3995.5 | 2239.6 | 394.9 | 115.2 |
| piazza | 31283.2 | 1957.1 | 256.8 | 175.5 |
| road:urban | 16015.3 | 1619.8 | 670.5 | 171.7 |
| street:lane | 26030.2 | 1533.6 | 307.4 | 41.7 |
| road:open | 3245 | 1111.3 | 681.4 | 124.9 |
| junction | 2218.6 | 68.6 | 20.6 | 13 |

## Causes (same defect, many places)

| places | extent | worst (m) | cause | example |
| ---: | ---: | ---: | --- | --- |
| 2603 | 189435 | 0.15 | double-paving / street:vicus /  /  | -470.13, 6.28, 585.38 (emporium) |
| 2055 | 103978 | 0.15 | double-paving / street:alley /  /  | -1014.88, 6.38, -604.63 (meta-romuli) |
| 1897 | 28969 | 0.523 | lip / ground-cover /  / ground-cover over terrain | 211.38, 16.44, 93.5 (arch-titus) |
| 1028 | 80476 | 0.15 | double-paving / road:urban /  /  | 321.63, 12.78, 592.13 (spawn-capena) |
| 2126 | 74854 | 0.15 | double-paving / ground-cover /  /  | -561.88, 5.42, 819.38 (porticus-aemilia) |
| 468 | 66992 | 0.148 | double-paving / piazza /  /  | -87.88, 8.59, -149.63 (tomb-bibulus) |
| 1170 | 61993 | 0.15 | double-paving / street:lane /  /  | -541.63, 6.36, 649.88 (emporium) |
| 224 | 8625 | 0.586 | lip / road:rural /  / road:rural over terrain | -1077, 14.02, -507.13 (janiculum-north) |
| 700 | 16151 | 0.297 | terrain-through / piazza /  /  | -941.88, 35.89, 244.13 (aqua-traiana-terminus) |
| 1512 | 31320 | 0.15 | double-paving / block /  /  | -1409.13, 7.07, -951.88 (naumachia-traiani) |
| 651 | 7275 | 0.587 | lip / piazza /  / piazza over terrain | -267.25, 21.25, 538.63 (temple-juno-regina-aventine) |
| 337 | 5864 | 0.594 | lip / street:vicus /  / street:vicus over terrain | 486.63, 17.17, 261 (ludus-matutinus) |
| 454 | 5782 | 0.587 | lip / street:alley /  / street:alley over terrain | -1217, 29.08, -112.88 (janiculum-north) |
| 62 | 22669 | 0.149 | double-paving / road:open /  /  | -12.88, 8.17, -7.88 (temple-vespasian-titus) |
| 268 | 4454 | 0.595 | lip / road:urban /  / road:urban over terrain | -21.25, 12.5, -64.13 (gradus-monetae) |
| 1325 | 6893.8 | 0.36 | edge-float / ground-cover /  /  | 111.88, 27.19, -286 (markets-trajan) |
| 245 | 3548 | 0.6 | lip / street:lane /  / street:lane over terrain | -1098.38, 29.78, 38.5 (aqua-traiana-terminus) |
| 110 | 3581 | 0.571 | lip / road:open /  / road:open over terrain | 303.75, 12.61, 157.88 (meta-sudans:front) |
| 462 | 2461.5 | 0.732 | edge-float / street:vicus /  /  | -1089.76, 30.26, 49.89 (aqua-traiana-terminus) |
| 96 | 6190 | 0.234 | terrain-through / ground-cover /  /  | 200.88, 15.81, 94.13 (horrea-piperataria) |
| 330 | 3749 | 0.303 | lip / piazza /  / piazza over block | 494, 11.98, 88.13 (domus-aurea-buried) |
| 36 | 7663 | 0.148 | double-paving / landmark:porta-capena /  /  | 386.63, 12.82, 664.13 (temple-honos-virtus) |
| 104 | 3533 | 0.299 | terrain-through / street:alley /  /  | -1053.38, 34.89, 101.13 (aqua-traiana-terminus) |
| 143 | 1481.6 | 0.668 | edge-float / road:rural /  /  | 55.21, 15.89, 127.07 (horrea-agrippiana) |
| 458 | 1747.3 | 0.461 | edge-float / street:alley /  /  | -1205.03, 29.37, -97.06 (janiculum-north) |
| 77 | 4663 | 0.149 | double-paving / road:rural /  /  | -311.63, 7.21, 320.38 (pons-sublicius) |
| 59 | 1863 | 0.299 | terrain-through / road:rural /  /  | 174.13, 22.75, 145.13 (temple-jupiter-stator) |
| 241 | 1054.4 | 0.5 | edge-float / street:lane /  /  | -1097.98, 29.48, 38.69 (aqua-traiana-terminus) |
| 221 | 873 | 0.6 | lip / block /  / block over street:alley | -1157.5, 26.66, -347.63 (janiculum-north) |
| 214 | 1064.6 | 0.49 | edge-float / road:urban /  /  | 619.2, 28.63, -448.62 (cispius) |
| 396 | 428 | 1.178 | prop-floating / block / basket /  | -992.01, 40.87, 360.45 (aqua-traiana-terminus) |
| 501 | 523 | 0.955 | prop-floating / block / amphora_tall /  | 40.11, 13.05, -325.67 (bibliotheca-ulpia-east) |
| 211 | 965.8 | 0.5 | edge-float / piazza /  /  | -971, 29.37, 199.45 (aqua-traiana-terminus) |
| 252 | 788 | 0.594 | lip / block /  / block over street:vicus | -940.13, 9.08, -19.25 (aqua-traiana-terminus) |
| 254 | 1660 | 0.273 | lip / piazza /  / piazza over street:alley | -937, 29.25, 242.63 (aqua-traiana-terminus) |
| 56 | 3805 | 0.116 | double-paving / landmark:circus-maximus /  /  | -108.63, 7.34, 360.13 (aediles-clerk) |
| 264 | 745 | 0.574 | lip / block /  / block over ground-cover | -963, 15.48, 21.88 (aqua-traiana-terminus) |
| 880 | 1055 | 0.393 | prop-foot-in-air / block / amphora_stack /  | -590.42, 7.03, 21.7 (temple-mars-in-circo) |
| 22 | 3078 | 0.134 | double-paving / junction /  /  | 304.13, 9.7, 570.13 (capena-grassator-b) |
| 296 | 310 | 1.254 | prop-floating / block / bench_masonry /  | -315.7, 23.78, 632.92 (armilustrium) |
| 106 | 867.9 | 0.438 | edge-float / road:open /  /  | 304.23, 12.3, 158.04 (meta-sudans:front) |
| 21 | 1272 | 0.296 | terrain-through / road:open /  /  | 113.38, 12.64, 105.38 (clivus-victoriae) |
| 750 | 897 | 0.382 | prop-foot-in-air / block / puteal /  | -1583.05, 8.28, -779.04 (vatican-necropolis) |
| 981 | 1119 | 0.299 | prop-foot-in-air / block / trough /  | -892.91, 7.63, -476.37 (tarentum-altar) |
| 45 | 1060 | 0.282 | terrain-through / junction /  /  | -83.88, 11.48, 85.13 (tarpeian-rock) |
| 195 | 224 | 1.3 | prop-foot-in-air / block / cart /  | -951.61, 5.97, -344.04 (tarentum-altar) |
| 39 | 961 | 0.3 | terrain-through / street:lane /  /  | 108.38, 26.35, -287.38 (markets-trajan) |
| 27 | 1883 | 0.15 | double-paving / landmark:miliarium-aureum /  /  | 39.88, 7.88, -6.38 (curia-julia:front) |
| 579 | 690 | 0.39 | prop-foot-in-air / block / dolium /  | -398.86, 5.83, 662.44 (emporium) |
| 52 | 908 | 0.296 | terrain-through / street:vicus /  /  | -1234.13, 35.76, -125.88 (janiculum-north) |
| 20 | 3373 | 0.078 | double-paving / landmark:forum-boarium /  /  | -119.88, 5.8, 216.38 (lacus-velabri) |
| 125 | 472 | 0.554 | lip / block /  / block over road:urban | -105.63, 21.23, 489.25 (armilustrium) |
| 109 | 215 | 0.992 | prop-floating / block / amphora_globular /  | -337.95, 17.97, 731.53 (porta-lavernalis) |
| 40 | 319 | 0.588 | lip / junction /  / junction over terrain | -84, 13.48, 80.63 (tarpeian-rock) |
| 296 | 307 | 0.6 | prop-floating / block / bench /  | 193.65, 21.86, -186.79 (subura) |
| 153 | 161 | 1.112 | prop-floating / block / crate /  | 583.53, 26.34, 580.62 (castra-peregrina) |
| 11 | 1549 | 0.113 | double-paving / landmark:circus-flaminius /  /  | -311.38, 7.02, 32.13 (carter-bridgehead) |
| 170 | 173 | 0.91 | fixture-edge-in-air / street-furniture / travertine /  | -953.34, 34.68, 387.39 (aqua-traiana-terminus) |
| 5 | 265 | 0.577 | lip / landmark:porticus-margaritaria /  / lm over road:open | 182.63, 12.28, 89.75 (porticus-margaritaria) |
| 90 | 295 | 0.507 | lip / block /  / block over street:lane | -1610.38, 10.94, -772.25 (vatican-necropolis) |

## Worst places

| # | severity | kind | source | value (m) | extent | x, y, z | place | screenshot | note |
| ---: | --- | --- | --- | ---: | ---: | --- | --- | --- | --- |
| 1 | major | face-float | road:clivus-victoriae:open (paving_basalt) | 0.591 | 28.83 (10) | 80.71, 14.39, 106.07 | clivus-victoriae (21 m) | .shots/street-fit/01-face-float.png |  |
| 2 | major | face-float | piazza:pz586 (cobbles) | 0.713 | 19.75 (8) | 88.75, 11.82, 350.67 | domus-augustana:front (6 m) | .shots/street-fit/02-face-float.png |  |
| 3 | major | lip | street:st611:vicus  | 0.578 | 78 (7) | 486.63, 17.17, 261 | ludus-matutinus (34 m) | .shots/street-fit/03-lip.png | street:vicus over terrain (street:st611:vicus / terrain) |
| 4 | major | face-float | piazza:pz587 (paving_travertine) | 0.669 | 17.5 (8) | 113.11, 10.03, 371.92 | street-north-of-circus (30 m) |  |  |
| 5 | major | lip | street:st1050:vicus  | 0.464 | 95 (12) | -1087, 20.3, -429.88 | janiculum-north (124 m) |  | street:vicus over terrain (street:st1050:vicus / terrain) |
| 6 | major | lip | road:clivus-victoriae:open  | 0.531 | 71 (6) | 120.75, 18.44, 114.63 | clivus-victoriae (29 m) | .shots/street-fit/04-lip.png | road:open over terrain (road:clivus-victoriae:open / terrain) |
| 7 | major | lip | road:via-sacra:open  | 0.566 | 56 (7) | 303.75, 12.61, 157.88 | meta-sudans:front (9 m) |  | road:open over terrain (road:via-sacra:open / terrain) |
| 8 | major | lip | lm:horrea-agrippiana  | 0.597 | 49 (3) | 10.13, 8.48, 124 | taberna-vestiarii (3 m) | .shots/street-fit/05-lip.png | lm over road:urban (lm:horrea-agrippiana / road:vicus-tuscus:urban) |
| 9 | major | lip | road:trastevere-vatican-riverside-road:rural  | 0.56 | 55 (8) | -1077, 14.02, -507.13 | janiculum-north (152 m) | .shots/street-fit/06-lip.png | road:rural over terrain (road:trastevere-vatican-riverside-road:rural / terrain) |
| 10 | major | face-float | road:clivus-victoriae:open (paving_basalt) | 0.98 | 5.74 (4) | 104.36, 11.03, 100.6 | clivus-victoriae (8 m) |  |  |
| 11 | major | lip | street:st616:alley  | 0.572 | 48 (6) | 463.38, 19.51, 238 | ludus-matutinus (47 m) | .shots/street-fit/07-lip.png | street:alley over terrain (street:st616:alley / terrain) |
| 12 | major | lip | street:st263:vicus  | 0.576 | 44 (7) | -313, 20.81, 590.63 | temple-juno-regina-aventine (110 m) |  | street:vicus over terrain (street:st263:vicus / terrain) |
| 13 | major | lip | road:clivus-capitolinus:rural  | 0.525 | 52 (6) | -61.13, 12.69, 42.5 | temple-jupiter-tonans (30 m) |  | road:rural over terrain (road:clivus-capitolinus:rural / terrain) |
| 14 | major | lip | road:vicus-patricius:rural  | 0.462 | 67 (6) | 526.75, 14.88, -307.13 | viminal (158 m) |  | road:rural over terrain (road:vicus-patricius:rural / terrain) |
| 15 | major | lip | road:vicus-patricius:rural  | 0.443 | 71 (6) | 490.75, 11.92, -251.13 | fullonica-suburana (156 m) |  | road:rural over terrain (road:vicus-patricius:rural / terrain) |
| 16 | major | lip | road:vicus-patricius:rural  | 0.443 | 69 (6) | 548.75, 17.05, -341.13 | cispius (140 m) |  | road:rural over terrain (road:vicus-patricius:rural / terrain) |
| 17 | major | lip | street:st1038:alley  | 0.587 | 39 (7) | -1114.88, 29.52, 17.25 | aqua-traiana-terminus (261 m) |  | street:alley over terrain (street:st1038:alley / terrain) |
| 18 | major | lip | road:via-sacra:urban  | 0.59 | 38 (4) | 201.75, 14.32, 100.38 | arch-titus (26 m) | .shots/street-fit/08-lip.png | road:urban over terrain (road:via-sacra:urban / terrain) |
| 19 | major | face-float | piazza:pz628 (cobbles) | 0.428 | 23.6 (9) | 613.4, 18.44, 111.29 | ludus-dacicus (83 m) |  |  |
| 20 | major | lip | road:clivus-victoriae:open  | 0.457 | 60 (6) | 39.75, 10.34, 143.13 | horrea-agrippiana (29 m) |  | road:open over terrain (road:clivus-victoriae:open / terrain) |
| 21 | major | lip | street:st1040:lane  | 0.573 | 38 (4) | -1220.38, 29.16, -117.5 | janiculum-north (318 m) | .shots/street-fit/09-lip.png | street:lane over terrain (street:st1040:lane / terrain) |
| 22 | major | lip | street:st904:vicus  | 0.545 | 42 (6) | 661.5, 29.45, -191.88 | lacus-orphei (8 m) |  | street:vicus over terrain (street:st904:vicus / terrain) |
| 23 | major | lip | block:b279  | 0.456 | 59 (4) | -105.63, 21.23, 489.25 | armilustrium (115 m) | .shots/street-fit/10-lip.png | block over road:urban (block:b279 / road:vicus-armilustri:urban) |
| 24 | major | lip | piazza:pz663  | 0.568 | 38 (5) | -975.38, 30.2, 195.25 | aqua-traiana-terminus (74 m) |  | piazza over terrain (piazza:pz663 / terrain) |
| 25 | major | lip | road:trastevere-vatican-riverside-road:rural  | 0.488 | 51 (6) | -1063.25, 8.09, -528.88 | meta-romuli (143 m) |  | road:rural over terrain (road:trastevere-vatican-riverside-road:rural / terrain) |
| 26 | major | lip | street:st1030:alley  | 0.544 | 41 (4) | -1217, 29.08, -112.88 | janiculum-north (322 m) |  | street:alley over terrain (street:st1030:alley / terrain) |
| 27 | major | lip | road:trastevere-vatican-riverside-road:rural  | 0.549 | 40 (4) | -1083.13, 16.51, -497.25 | janiculum-north (142 m) |  | road:rural over terrain (road:trastevere-vatican-riverside-road:rural / terrain) |
| 28 | major | lip | piazza:pz660  | 0.587 | 35 (6) | -1161.38, 29.51, -41.25 | aqua-traiana-terminus (334 m) |  | piazza over terrain (piazza:pz660 / terrain) |
| 29 | major | lip | road:clivus-argentarius:urban  | 0.595 | 34 (5) | -21.25, 12.5, -64.13 | gradus-monetae (4 m) |  | road:urban over terrain (road:clivus-argentarius:urban / terrain) |
| 30 | major | lip | road:via-nova:open  | 0.5 | 48 (9) | 180.75, 15.4, 128.88 | temple-jupiter-stator (15 m) |  | road:open over terrain (road:via-nova:open / terrain) |
| 31 | major | lip | lm:porticus-margaritaria  | 0.577 | 36 (3) | 182.63, 12.28, 89.75 | porticus-margaritaria (22 m) |  | lm over road:open (lm:porticus-margaritaria / road:via-sacra:open) |
| 32 | major | lip | street:st798:lane  | 0.567 | 37 (7) | 411.25, 11.97, 83.13 | baths-titus (48 m) |  | street:lane over terrain (street:st798:lane / terrain) |
| 33 | major | lip | lm:basilica-aemilia  | 0.523 | 42 (3) | 60.5, 9.14, -17.88 | janus-geminus (8 m) |  | lm over road:open (lm:basilica-aemilia / road:argiletum:open) |
| 34 | major | lip | lm:aqua-traiana-terminus  | 0.36 | 87 (5) | -1009.5, 42.38, 253.13 | aqua-traiana-terminus (7 m) |  | lm over ground-cover (lm:aqua-traiana-terminus / ground-cover) |
| 35 | major | lip | road:trastevere-vatican-riverside-road:rural  | 0.528 | 40 (5) | -1071, 11.33, -516.63 | meta-romuli (157 m) |  | road:rural over terrain (road:trastevere-vatican-riverside-road:rural / terrain) |
| 36 | major | lip | road:vicus-patricius:rural  | 0.408 | 66 (5) | 468.75, 11.06, -217.13 | fullonica-suburana (118 m) |  | road:rural over terrain (road:vicus-patricius:rural / terrain) |
| 37 | major | lip | road:clivus-victoriae:open  | 0.493 | 45 (6) | 67.63, 12.75, 117.75 | domitianic-vestibule (22 m) |  | road:open over terrain (road:clivus-victoriae:open / terrain) |
| 38 | major | lip | piazza:pz555  | 0.537 | 36 (6) | -267.25, 21.25, 538.63 | temple-juno-regina-aventine (46 m) |  | piazza over terrain (piazza:pz555 / terrain) |
| 39 | major | prop-floating | block:b269 (amphora_globular) | 0.992 | 2 (2) | -337.95, 17.97, 731.53 | porta-lavernalis (88 m) |  | block amphora_globular: no foot touches (lowest 0.99 m, highest foot 1.03 m) |
| 40 | major | lip | street:st1473:vicus  | 0.467 | 47 (5) | 111.75, 15.09, -219.13 | markets-trajan (27 m) |  | street:vicus over terrain (street:st1473:vicus / terrain) |
| 41 | major | lip | road:alta-semita:urban  | 0.45 | 50 (5) | 112.75, 29.16, -302.13 | markets-trajan (106 m) |  | road:urban over terrain (road:alta-semita:urban / terrain) |
| 42 | major | lip | road:vicus-patricius:rural  | 0.393 | 65 (5) | 511.13, 13.5, -283 | viminal (169 m) |  | road:rural over terrain (road:vicus-patricius:rural / terrain) |
| 43 | major | lip | street:st355:vicus  | 0.575 | 30 (5) | -988.25, 37.22, 405.63 | aqua-traiana-terminus (150 m) |  | street:vicus over terrain (street:st355:vicus / terrain) |
| 44 | major | lip | street:st1032:vicus  | 0.594 | 28 (4) | -993.88, 29.42, 170.5 | aqua-traiana-terminus (90 m) |  | street:vicus over terrain (street:st1032:vicus / terrain) |
| 45 | major | face-float | road:clivus-victoriae:open (paving_basalt) | 0.948 | 3.74 (3) | 65.89, 15.95, 121.93 | domitianic-vestibule (25 m) |  |  |
| 46 | major | prop-floating | block:b1539 (amphora_globular) | 0.97 | 2 (2) | 100.08, 23.75, -256.3 | markets-trajan (59 m) |  | block amphora_globular: no foot touches (lowest 0.97 m, highest foot 1.01 m) |
| 47 | major | lip | street:st1023:vicus  | 0.57 | 30 (6) | -1228.88, 29.42, -127.25 | janiculum-north (308 m) |  | street:vicus over terrain (street:st1023:vicus / terrain) |
| 48 | major | lip | street:st1454:vicus  | 0.569 | 30 (4) | 215.88, 28.28, -397.75 | arae-incendii-neroniani (131 m) |  | street:vicus over terrain (street:st1454:vicus / terrain) |
| 49 | major | lip | piazza:pz587  | 0.542 | 33 (3) | 115.13, 9.02, 374.75 | street-north-of-circus (29 m) |  | piazza over terrain (piazza:pz587 / terrain) |
| 50 | major | lip | road:vicus-patricius:rural  | 0.372 | 69 (6) | 562.75, 18.45, -363.13 | cispius (133 m) |  | road:rural over terrain (road:vicus-patricius:rural / terrain) |
| 51 | major | lip | road:vicus-patricius:rural  | 0.424 | 53 (5) | 498.5, 12.5, -263.38 | fullonica-suburana (170 m) |  | road:rural over terrain (road:vicus-patricius:rural / terrain) |
| 52 | major | prop-floating | block:b269 (crate) | 0.937 | 2 (2) | -341.01, 16.61, 734.37 | porta-lavernalis (90 m) |  | block crate: no foot touches (lowest 0.94 m, highest foot 1.28 m) |
| 53 | major | lip | street:st1029:alley  | 0.553 | 30 (8) | -1202, 29.09, -93.88 | janiculum-north (341 m) |  | street:alley over terrain (street:st1029:alley / terrain) |
| 54 | major | lip | road:clivus-victoriae:rural  | 0.523 | 33 (6) | 53.5, 16.65, 129.63 | horrea-agrippiana (25 m) |  | road:rural over terrain (road:clivus-victoriae:rural / terrain) |
| 55 | major | lip | ground-cover  | 0.523 | 33 (4) | -19.5, 23.68, -107.38 | auguraculum (17 m) |  | ground-cover over terrain (ground-cover / terrain) |
| 56 | major | lip | street:st800:lane  | 0.471 | 40 (4) | 411.88, 15.84, 53 | baths-titus (42 m) |  | street:lane over terrain (street:st800:lane / terrain) |
| 57 | major | lip | street:st1031:vicus  | 0.55 | 29 (5) | -1157.5, 28.97, -37.38 | aqua-traiana-terminus (328 m) |  | street:vicus over terrain (street:st1031:vicus / terrain) |
| 58 | major | edge-float | road:trastevere-vatican-riverside-road:rural (gravel) | 0.577 | 12.38 (9) | -1069.28, 10.43, -519.3 | meta-romuli (154 m) |  |  |
| 59 | major | lip | street:st1025:lane  | 0.6 | 23 (5) | -1098.38, 29.78, 38.5 | aqua-traiana-terminus (235 m) |  | street:lane over terrain (street:st1025:lane / terrain) |
| 60 | major | prop-floating | block:b275 (bench_masonry) | 1.254 | 1 | -315.7, 23.78, 632.92 | armilustrium (140 m) |  | block bench_masonry: no foot touches (lowest 1.25 m, highest foot 2.04 m) |
| 61 | major | lip | road:clivus-victoriae:open  | 0.489 | 34 (5) | 129.63, 24.55, 125.75 | clivus-victoriae (44 m) |  | road:open over terrain (road:clivus-victoriae:open / terrain) |
| 62 | major | lip | junction:j10  | 0.577 | 24 (6) | -84, 13.48, 80.63 | tarpeian-rock (21 m) |  | junction over terrain (junction:j10 / terrain) |
| 63 | major | lip | road:clivus-argentarius:open  | 0.227 | 155 (9) | 3.25, 8.47, -33.88 | carcer-tullianum (9 m) |  | road:open over terrain (road:clivus-argentarius:open / terrain) |
| 64 | major | face-float | piazza:pz586 (cobbles) | 0.513 | 10.12 (3) | 95.37, 14.89, 355.3 | domus-augustana:front (8 m) |  |  |
| 65 | major | lip | road:vicus-patricius:urban  | 0.419 | 44 (4) | 618.88, 28.56, -448.75 | cispius (151 m) |  | road:urban over terrain (road:vicus-patricius:urban / terrain) |
| 66 | major | lip | lm:temple-divus-augustus  | 0.212 | 171 (9) | 12.75, 8.11, 103.13 | seplasia-vici-tusci (4 m) |  | lm over road:open (lm:temple-divus-augustus / road:via-nova:open) |
| 67 | major | face-float | road:clivus-victoriae:urban (paving_basalt) | 0.421 | 14.73 (7) | 83.05, 19.43, 106 | clivus-victoriae (19 m) |  |  |
| 68 | major | lip | junction:j16  | 0.588 | 22 (5) | -26, 20.42, -73.88 | gradus-monetae (11 m) |  | junction over terrain (junction:j16 / terrain) |
| 69 | major | lip | piazza:pz626  | 0.549 | 25 (6) | 488.75, 21.18, 86.88 | domus-aurea-buried (39 m) |  | piazza over terrain (piazza:pz626 / terrain) |
| 70 | major | lip | road:vicus-patricius:rural  | 0.366 | 56 (5) | 534.5, 15.61, -319.13 | cispius (151 m) |  | road:rural over terrain (road:vicus-patricius:rural / terrain) |
| 71 | major | edge-float | street:st1035:vicus (concrete) | 0.732 | 6.85 (7) | -1089.76, 30.26, 49.89 | aqua-traiana-terminus (221 m) |  |  |
| 72 | major | face-float | road:clivus-capitolinus:rural (paving_basalt) | 0.618 | 6.62 (4) | -66.87, 16, 45.17 | temple-jupiter-tonans (26 m) |  |  |
| 73 | major | lip | road:vicus-patricius:rural  | 0.419 | 42 (3) | 520.5, 14.29, -297.38 | viminal (162 m) |  | road:rural over terrain (road:vicus-patricius:rural / terrain) |
| 74 | major | lip | road:clivus-palatinus:urban  | 0.452 | 36 (4) | 193.25, 14.97, 122.63 | arch-titus (16 m) |  | road:urban over terrain (road:clivus-palatinus:urban / terrain) |
| 75 | major | prop-floating | block:b395 (basket) | 1.178 | 1 | -992.01, 40.87, 360.45 | aqua-traiana-terminus (105 m) |  | block basket: no foot touches (lowest 1.18 m, highest foot 1.44 m) |
| 76 | major | lip | street:st1035:vicus  | 0.534 | 25 (4) | -1091.75, 29.83, 47.13 | aqua-traiana-terminus (225 m) |  | street:vicus over terrain (street:st1035:vicus / terrain) |
| 77 | major | lip | road:alta-semita:urban  | 0.443 | 36 (4) | 111, 29.98, -325.88 | markets-trajan (129 m) |  | road:urban over terrain (road:alta-semita:urban / terrain) |
| 78 | major | edge-float | road:trastevere-vatican-riverside-road:rural (gravel) | 0.505 | 13.45 (10) | -1077.02, 13.92, -507.04 | janiculum-north (152 m) |  |  |
| 79 | major | lip | block:b406  | 0.551 | 23 (4) | -220.38, 9.88, 425 | porta-trigemina (42 m) |  | block over street:vicus (block:b406 / street:st389:vicus) |
| 80 | major | lip | block:b1043  | 0.473 | 31 (2) | -940.13, 9.08, -19.25 | aqua-traiana-terminus (287 m) |  | block over street:vicus (block:b1043 / street:st1001:vicus) |
| 81 | major | face-float | road:clivus-victoriae:urban (paving_basalt) | 0.475 | 10.46 (4) | 75.41, 14.64, 112.07 | domitianic-vestibule (23 m) |  |  |
| 82 | major | face-float | piazza:pz658 (cobbles) | 0.472 | 10.55 (3) | -1014.83, 32.29, 147.27 | aqua-traiana-terminus (111 m) |  |  |
| 83 | major | face-float | piazza:pz662 (paving_travertine) | 0.469 | 10.57 (7) | -935.35, 30.97, 247.05 | aqua-traiana-terminus (79 m) |  |  |
| 84 | major | edge-float | street:st355:vicus (concrete) | 0.546 | 11.17 (6) | -986.82, 36.57, 406.88 | aqua-traiana-terminus (151 m) |  |  |
| 85 | major | lip | road:clivus-suburanus:urban  | 0.492 | 28 (5) | 595.63, 24.29, -143 | porticus-liviae (38 m) |  | road:urban over terrain (road:clivus-suburanus:urban / terrain) |
| 86 | major | edge-float | road:trastevere-vatican-riverside-road:rural (gravel) | 0.525 | 12.02 (11) | -1083.21, 16.55, -497.23 | janiculum-north (142 m) |  |  |
| 87 | major | lip | road:alta-semita:urban  | 0.431 | 35 (4) | 107.5, 32.19, -376.38 | markets-trajan (179 m) |  | road:urban over terrain (road:alta-semita:urban / terrain) |
| 88 | major | lip | piazza:pz588  | 0.318 | 64 (6) | -8.75, 10.03, 224.88 | insula-nutans-taberna (23 m) |  | piazza over terrain (piazza:pz588 / terrain) |
| 89 | major | prop-floating | block:b556 (crate) | 1.112 | 1 | 583.53, 26.34, 580.62 | castra-peregrina (65 m) |  | block crate: no foot touches (lowest 1.11 m, highest foot 1.50 m) |
| 90 | major | lip | road:clivus-victoriae:open  | 0.349 | 53 (5) | 107, 11, 102.13 | clivus-victoriae (11 m) |  | road:open over terrain (road:clivus-victoriae:open / terrain) |
| 91 | major | face-float | piazza:pz661 (cobbles) | 0.545 | 7.39 (4) | -995.29, 30.92, 170.87 | aqua-traiana-terminus (89 m) |  |  |
| 92 | major | face-float | street:st611:vicus (concrete) | 0.426 | 12.03 (7) | 485.73, 16.05, 259.9 | ludus-matutinus (33 m) |  |  |
| 93 | major | face-float | junction:j10 (paving_basalt) | 0.484 | 9.07 (6) | -88.29, 11.05, 83.6 | tarpeian-rock (20 m) |  |  |
| 94 | major | prop-floating | block:b269 (basket) | 0.772 | 2 (2) | -340.51, 16.61, 733.87 | porta-lavernalis (89 m) |  | block basket: no foot touches (lowest 0.77 m, highest foot 0.93 m) |
| 95 | major | edge-float | street:st904:vicus (concrete) | 0.539 | 10.51 (7) | 661.5, 29.45, -191.96 | lacus-orphei (8 m) |  |  |
| 96 | major | lip | road:clivus-victoriae:open  | 0.571 | 19 (2) | 51.5, 17.39, 133.63 | horrea-agrippiana (26 m) |  | road:open over terrain (road:clivus-victoriae:open / terrain) |
| 97 | major | lip | lm:forum-nerva  | 0.447 | 30 (4) | 155.38, 9.7, -76 | temple-minerva-nerva (16 m) |  | lm over road:open (lm:forum-nerva / road:argiletum:open) |
| 98 | major | lip | ground-cover  | 0.345 | 50 (5) | 211.38, 16.44, 93.5 | arch-titus (32 m) |  | ground-cover over terrain (ground-cover / terrain) |
| 99 | major | face-float | piazza:pz626 (paving_travertine) | 0.484 | 8.63 (6) | 491.91, 14.66, 90.07 | domus-aurea-buried (37 m) |  |  |
| 100 | major | lip | piazza:pz661  | 0.497 | 24 (5) | -997.75, 29.56, 166.13 | aqua-traiana-terminus (93 m) |  | piazza over terrain (piazza:pz661 / terrain) |
| 101 | major | lip | street:st616:alley  | 0.477 | 26 (4) | 355.63, 19.78, 278.5 | temple-divus-claudius (91 m) |  | street:alley over terrain (street:st616:alley / terrain) |
| 102 | major | lip | road:trastevere-vatican-riverside-road:rural  | 0.351 | 48 (5) | -1057, 6.22, -538.88 | meta-romuli (132 m) |  | road:rural over terrain (road:trastevere-vatican-riverside-road:rural / terrain) |
| 103 | major | lip | street:st775:vicus  | 0.571 | 18 (3) | 546.25, 21.73, 70.13 | domus-aurea-buried (23 m) |  | street:vicus over terrain (street:st775:vicus / terrain) |
| 104 | major | prop-floating | block:b1438 (crate) | 1.05 | 1 | 506.15, 21.07, -297.22 | viminal (154 m) |  | block crate: no foot touches (lowest 1.05 m, highest foot 1.56 m) |
| 105 | major | lip | street:st270:vicus  | 0.547 | 19 (2) | -270.75, 21.28, 542.63 | temple-juno-regina-aventine (51 m) |  | street:vicus over terrain (street:st270:vicus / terrain) |
| 106 | major | lip | road:clivus-victoriae:urban  | 0.574 | 17 (4) | 75.63, 11.24, 108.5 | domitianic-vestibule (21 m) |  | road:urban over terrain (road:clivus-victoriae:urban / terrain) |
| 107 | major | lip | road:vicus-patricius:rural  | 0.405 | 34 (3) | 556.5, 17.9, -353.38 | cispius (135 m) |  | road:rural over terrain (road:vicus-patricius:rural / terrain) |
| 108 | major | lip | road:trastevere-vatican-riverside-road:rural  | 0.284 | 69 (7) | -1049.25, 5.24, -551.13 | meta-romuli (119 m) |  | road:rural over terrain (road:trastevere-vatican-riverside-road:rural / terrain) |
| 109 | major | lip | street:st768:lane  | 0.194 | 146 (9) | 573.13, 28.9, -84.5 | porticus-liviae (66 m) |  | street:lane over terrain (street:st768:lane / terrain) |
| 110 | major | lip | road:vicus-patricius:rural  | 0.37 | 40 (3) | 484.5, 11.59, -241.38 | fullonica-suburana (145 m) |  | road:rural over terrain (road:vicus-patricius:rural / terrain) |
| 111 | major | lip | street:st27:alley  | 0.19 | 149 (8) | -661, 6.4, 870.38 | porticus-aemilia (132 m) |  | street:alley over terrain (street:st27:alley / terrain) |
| 112 | major | lip | piazza:pz700  | 0.545 | 18 (3) | 83.88, 17.46, -335.25 | bibliotheca-ulpia-east (137 m) |  | piazza over terrain (piazza:pz700 / terrain) |
| 113 | major | lip | road:clivus-victoriae:rural  | 0.577 | 16 (6) | 103.75, 10.2, 99.38 | clivus-victoriae (7 m) |  | road:rural over terrain (road:clivus-victoriae:rural / terrain) |
| 114 | major | lip | road:clivus-suburanus:urban  | 0.395 | 34 (4) | 681.75, 29.35, -191.88 | lacus-orphei (26 m) |  | road:urban over terrain (road:clivus-suburanus:urban / terrain) |
| 115 | major | lip | road:vicus-patricius:urban  | 0.469 | 24 (4) | 583.38, 20.57, -393.25 | cispius (130 m) |  | road:urban over terrain (road:vicus-patricius:urban / terrain) |
| 116 | major | lip | road:vicus-patricius:rural  | 0.342 | 45 (3) | 475, 11.22, -226.88 | fullonica-suburana (129 m) |  | road:rural over terrain (road:vicus-patricius:rural / terrain) |
| 117 | major | lip | piazza:pz662  | 0.538 | 18 (4) | -937.88, 29.59, 242.25 | aqua-traiana-terminus (78 m) |  | piazza over terrain (piazza:pz662 / terrain) |
| 118 | major | lip | road:vicus-patricius:rural  | 0.352 | 42 (3) | 578.5, 20.22, -387.38 | cispius (130 m) |  | road:rural over terrain (road:vicus-patricius:rural / terrain) |
| 119 | major | lip | road:clivus-rocca-savella:rural  | 0.332 | 47 (6) | -197.25, 13.23, 455.88 | porta-trigemina (74 m) |  | road:rural over terrain (road:clivus-rocca-savella:rural / terrain) |
| 120 | major | edge-float | road:clivus-victoriae:rural (paving_basalt) | 0.668 | 5.69 (3) | 55.21, 15.89, 127.07 | horrea-agrippiana (25 m) |  |  |
