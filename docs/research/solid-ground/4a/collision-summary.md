
# Collision against visuals

865 stops of 865 (865 planned) in 15.2 min: 2099370 probe columns (1585441 standable, 499887 inside solids, 8491 ray-only cracks a capsule does not fall through), 10084 street edges, 1750014 seam samples, 10778044 rays, 75196678 drawn triangles indexed (0 released pieces skipped, 0 far stand-in pieces near a stop, 0 stops whose picture had not settled after 12 s), 54 s of probing.

## Defects by kind (grouped probes: same kind, same collider or drawn piece, within 2.5 m)

| kind | defects | probes | blocker | major | minor | worst size (m) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| fallthrough | 13 | 37 | 13 | 0 | 0 | 3.19 |
| ledge | 3849 | 9209 | 0 | 2569 | 1280 | 3.14 |
| ghost | 5920 | 12778 | 0 | 4452 | 1468 | 3.23 |
| invisible | 2140 | 4715 | 0 | 1786 | 354 | 7.01 |
| embedded | 1711 | 2375 | 0 | 97 | 1614 | 1.00 |
| float | 2390 | 9370 | 0 | 949 | 1441 | 0.32 |
| sink | 12951 | 106371 | 0 | 2289 | 10662 | 0.32 |
| lip | 3582 | 4775 | 0 | 1038 | 2544 | 0.59 |
| crack | 195 | 226 | 0 | 131 | 64 | 0.23 |
| ghost-wall | 1665 | 3210 | 0 | 773 | 892 | 99.00 |
| low-overhead | 639 | 1218 | 0 | 0 | 639 | 2.59 |
| ramp-steps | 2802 | 12554 | 0 | 0 | 2802 | 0.13 |
| drawn-step | 5432 | 6095 | 0 | 0 | 5432 | 0.60 |
| headroom | 604 | 831 | 0 | 0 | 604 | 1.00 |

## Causes (kind, collider owner vs drawn material; defects, probes, worst)

- sink | terrain:heightfield vs city:dirt:ns:off:dirt: 2422 defects, 16339 probes, worst 0.32 m at 514.8,27.46,-367.2 (Viminal Hill (viminal, 107 m))
- sink | terrain:heightfield vs city:cobbles:ns:off:cobbles: 1329 defects, 12789 probes, worst 0.32 m at 643.5,23.3,100.6 (Baths of Trajan (baths-trajan, 114 m))
- ramp-steps | terrain:heightfield vs terrain: 846 defects, 9036 probes, worst 0.13 m at 18,21.21,200.6 (Temple of the Great Mother (temple-magna-mater, 13 m))
- sink | terrain:heightfield vs city:city:massing:ns:off:city:massing: 101 defects, 8442 probes, worst 0.32 m at 225,27.28,-373.7 (The Subura (subura, 199 m))
- sink | terrain:heightfield vs city:gravel:ns:off:gravel: 790 defects, 7172 probes, worst 0.32 m at -214.6,23.37,663.1 (Trajan's Private House (privata-traiani, 91 m))
- sink | terrain:heightfield vs terrain: 605 defects, 6037 probes, worst 0.32 m at 506.3,11.88,-268.3 (Portico of Livia (porticus-liviae, 190 m))
- float | terrain:heightfield vs terrain: 584 defects, 5600 probes, worst 0.32 m at -152.8,14.57,89.3 (Carmental Gate (porta-carmentalis, 10 m))
- sink | terrain:heightfield vs lmbatch:paving_travertine:ns:paving_travertine: 49 defects, 3778 probes, worst 0.29 m at -244.1,6.96,45.5 (Theatre of Marcellus (theatre-marcellus, 8 m))
- sink | terrain:heightfield vs colosseum:static:paving_travertine:paving_travertine: 2 defects, 3297 probes, worst 0.17 m at 392.6,11.72,152.7 (Flavian Amphitheatre (colosseum, 4 m))
- sink | terrain:heightfield vs baths-trajan:paving_travertine:paving_travertine: 2 defects, 2158 probes, worst 0.32 m at 625.9,28.56,77.8 (Baths of Trajan (baths-trajan, 86 m))
- drawn-step | terrain:heightfield vs terrain: 1825 defects, 1944 probes, worst 0.53 m at 615.8,27.65,-146.7 (Portico of Livia (porticus-liviae, 27 m))
- sink | terrain:heightfield vs lmbatch:grass:ns:grass: 12 defects, 1943 probes, worst 0.29 m at 138.7,21.37,375 (Palace Hippodrome (palatine-stadium, 43 m))
- invisible | city:b#:box vs none: 908 defects, 1913 probes, worst 4.40 m at -512.7,7.2,355.6 (Jewish Quarter Across the Tiber (jewish-transtiberim, 62 m))
- sink | landmark:templum-pacis:box vs lmbatch:gravel:gravel: 2 defects, 1784 probes, worst 0.05 m at 151.2,9.66,-20.3 (Temple of Peace (templum-pacis, 6 m))
- sink | terrain:heightfield vs city:travertine:travertine: 1239 defects, 1765 probes, worst 0.32 m at 480,23.76,577.5 (Grove and Spring of the Camenae (camenae-grove, 93 m))
- sink | terrain:heightfield vs baths-trajan:gravel:gravel: 5 defects, 1691 probes, worst 0.04 m at 630.1,28.8,50.4 (Baths of Trajan (baths-trajan, 67 m))
- ledge | city:b#:box vs city:wood:ns:wood: 426 defects, 1600 probes, worst 1.60 m at 537.5,24.1,-127 (Baths of Trajan (baths-trajan, 139 m))
- sink | landmark:saepta-julia:box vs lmbatch:paving_travertine:paving_travertine: 4 defects, 1561 probes, worst 0.28 m at -290.4,7.22,-340 (Saepta Julia (saepta-julia, 28 m))
- sink | landmark:porticus-pompeiana:box vs lmbatch:grass:ns:grass: 3 defects, 1515 probes, worst 0.05 m at -427.2,7.03,-198.4 (Portico of Pompey (porticus-pompeiana, 28 m))
- sink | landmark:divorum:box vs lmbatch:grass:ns:grass: 5 defects, 1508 probes, worst 0.06 m at -222,7.82,-233.9 (Portico of the Deified (divorum, 7 m))
- lip | city:b#:box vs city:travertine:travertine: 1028 defects, 1501 probes, worst 0.59 m at 578.1,24.91,382 (Arch of Dolabella and Silanus (arch-dolabella, 90 m))
- sink | terrain:heightfield vs porticus-liviae:grass:grass: 1 defects, 1464 probes, worst 0.07 m at 626.8,28.2,-122.3 (Portico of Livia (porticus-liviae, 1 m))
- sink | landmark:adonaea:box vs lmbatch:grass:ns:grass: 4 defects, 1345 probes, worst 0.12 m at 208.2,28.41,217.8 (Gardens of Adonis (adonaea, 15 m))
- sink | terrain:heightfield vs colosseum:cavea:sand:sand: 3 defects, 1329 probes, worst 0.05 m at 395.8,11.7,153.7 (Flavian Amphitheatre (colosseum, 0 m))
- ghost | terrain:heightfield vs city:city:massing:ns:off:city:massing: 35 defects, 1276 probes, worst 2.05 m at 7.5,9.58,723.9 (Baths of Sura (thermae-suranae, 107 m))
- ghost | terrain:heightfield vs city:plaster_red:plaster_red: 585 defects, 1202 probes, worst 2.88 m at 362,20.92,339.5 (Temple of Divus Claudius (temple-divus-claudius, 75 m))
- sink | landmark:adonaea:box vs lmbatch:gravel:ns:gravel: 3 defects, 1190 probes, worst 0.06 m at 205.2,28.41,201.7 (Gardens of Adonis (adonaea, 20 m))
- sink | landmark:porticus-minucia-frumentaria:box vs lmbatch:paving_travertine:paving_travertine: 1 defects, 1156 probes, worst 0.28 m at -288.1,7.82,-189.5 (Minucian Portico (porticus-minucia-frumentaria, 1 m))
- embedded | city:b#:box vs : 834 defects, 1140 probes, worst 1.00 m at -15.6,7.95,212.7 (The Leaning Insula (insula-nutans, 14 m))
- ghost | landmark:templum-pacis:box vs lmbatch:grass:grass: 6 defects, 1138 probes, worst 0.44 m at 155.8,9.66,-21.1 (Temple of Peace (templum-pacis, 6 m))
- sink | landmark:divorum:box vs lmbatch:paving_travertine:paving_travertine: 1 defects, 1037 probes, worst 0.28 m at -226.5,7.82,-230 (Portico of the Deified (divorum, 2 m))
- sink | city:b#:box vs city:travertine:ns:travertine: 707 defects, 1033 probes, worst 0.29 m at 348.5,12.82,576.2 (Mercury’s Spring (fons-mercurii, 31 m))
- sink | landmark:forum-caesar:box vs lmbatch:paving_travertine:paving_travertine: 3 defects, 980 probes, worst 0.04 m at 64.8,10.98,-36.9 (Forum of Caesar (forum-caesar, 43 m))
- sink | terrain:heightfield vs baths-titus:sand:sand: 2 defects, 978 probes, worst 0.05 m at 434.6,22.8,49.5 (Baths of Titus (baths-titus, 21 m))
- sink | landmark:crypta-balbi:box vs lmbatch:paving_travertine:paving_travertine: 1 defects, 961 probes, worst 0.28 m at -263.1,7.82,-120.9 (Crypta Balbi (crypta-balbi, 1 m))
- sink | city:2,5:trimesh vs city:city:massing:ns:off:city:massing: 1 defects, 883 probes, worst 0.18 m at 301.3,7.96,631.3 (Mercury’s Spring (fons-mercurii, 55 m))
- drawn-step | terrain:heightfield vs city:travertine:travertine: 849 defects, 880 probes, worst 0.57 m at 496.1,11.18,104.7 (Buried Golden House (domus-aurea-buried, 38 m))
- sink | city:b#:box vs city:marble_veined:ns:marble_veined: 450 defects, 842 probes, worst 0.29 m at -297.2,7.72,141 (Tiber Island (insula-tiberina, 27 m))
- float | city:b#:box vs city:wood:wood: 506 defects, 804 probes, worst 0.28 m at 237.5,16.49,-180 (The Subura (subura, 33 m))
- ghost | city:b#:box vs city:wood:ns:wood: 390 defects, 757 probes, worst 1.49 m at 524.5,26.77,475.3 (Arch of Dolabella and Silanus (arch-dolabella, 18 m))
- sink | terrain:heightfield vs lmbatch:sand:ns:sand: 1 defects, 757 probes, worst 0.06 m at 524.7,12,170.6 (Great Gladiatorial School (ludus-magnus, 0 m))
- sink | landmark:porticus-philippi:box vs lmbatch:paving_travertine:paving_travertine: 1 defects, 746 probes, worst 0.28 m at -333.8,7.22,-48.1 (Circus Flaminius (circus-flaminius, 71 m))
- sink | city:b#:box vs city:travertine:travertine: 480 defects, 730 probes, worst 0.24 m at 237.5,18.36,-187.5 (The Subura (subura, 33 m))
- ramp-steps | terrain:heightfield vs city:gravel:ns:off:gravel: 260 defects, 654 probes, worst 0.13 m at 81.5,16.85,-249 (Market Halls of Trajan (markets-trajan, 53 m))
- sink | landmark:miliarium-aureum:trimesh vs lmbatch:paving_travertine:ns:paving_travertine: 15 defects, 628 probes, worst 0.30 m at 41,8.39,-30.6 (Forum of Caesar (forum-caesar, 43 m))

## Terrain: physics heightfield vs drawn triangulation

273338 bare-ground probes, |physics − drawn| mean 0.0143 m, max 1.194 m at [70.9,10.721,327,-1.194,"paedagogium"]. Where the two diagonals differ by over 2 cm, the physics matches the drawn diagonal 0×, the other diagonal 40305×, neither 0×.

## The worst defects (score: severity × area × size, ×1.5 on the story's route)

- [blocker] fallthrough 3.19 m over 10 probes @608.3,25.69,103.6 (Baths of Trajan (baths-trajan, 103 m)): none vs baths-trajan:paving_travertine:paving_travertine; confirmed: {"how":"drop on the drawn floor","at":[604.49,25.65,101.53],"grounded":true,"feetAboveDrawn":null,"droppedBelowDrawnFloor":3.23,"movedFromSpot":0.03}; shot .shots/audit/collision-01-fallthrough.png
- [blocker] fallthrough 2.80 m over 6 probes @-110.3,13.8,85.7 (Tarpeian Rock (tarpeian-rock, 19 m)): none vs lmbatch:rock:rock; confirmed: {"how":"drop on the drawn floor","at":[-110.18,13.73,86.77],"grounded":true,"feetAboveDrawn":null,"droppedBelowDrawnFloor":2.86,"movedFromSpot":0.07}; shot .shots/audit/collision-02-fallthrough.png
- [blocker] fallthrough 2.63 m over 4 probes @-118.2,15.7,87.2 (Tarpeian Rock (tarpeian-rock, 24 m)): none vs lmbatch:rock:rock; confirmed: {"how":"drop on the drawn floor","at":[-118.2,15.74,87.71],"grounded":true,"feetAboveDrawn":null,"droppedBelowDrawnFloor":2.59,"movedFromSpot":0.01}; shot .shots/audit/collision-03-fallthrough.png
- [blocker] fallthrough 1.72 m over 5 probes @-124,17.95,88.8 (Tarpeian Rock (tarpeian-rock, 30 m)): none vs lmbatch:rock:rock
- [blocker] fallthrough 2.18 m over 3 probes @-105.2,20.03,82.4 (Tarpeian Rock (tarpeian-rock, 14 m)): none vs lmbatch:rock:rock
- [blocker] fallthrough 2.20 m over 2 probes @-138,15.93,88.5 (Carmental Gate (porta-carmentalis, 13 m)): none vs lmbatch:rock:rock; confirmed: {"how":"drop on the drawn floor","at":[-137.52,15.92,89.54],"grounded":true,"feetAboveDrawn":null,"droppedBelowDrawnFloor":2.21,"movedFromSpot":0.04}; shot .shots/audit/collision-04-fallthrough.png
- [blocker] fallthrough 2.48 m over 1 probes @-98.2,21.99,78.7 (Tarpeian Rock (tarpeian-rock, 10 m)): none vs city:tree:umbrella_pine#1:veg:Lbark|0.00045|0.025||0|0|
- [blocker] fallthrough 2.69 m over 1 probes @111.5,18.93,367.5 (Palace Hippodrome (palatine-stadium, 56 m)): none vs lmbatch:gravel:ns:gravel; confirmed: {"how":"drop on the drawn floor","at":[111.46,18.8,367.56],"grounded":true,"feetAboveDrawn":null,"droppedBelowDrawnFloor":2.82,"movedFromSpot":0.08}; shot .shots/audit/collision-05-fallthrough.png
- [blocker] fallthrough 2.06 m over 1 probes @-143.5,20.9,84.5 (Carmental Gate (porta-carmentalis, 13 m)): none vs city:tree:fig#1:veg:Lbark|0.00045|0.025||0|0|
- [major] ghost 2.27 m over 270 probes @-122.2,10.15,89.4 (Tarpeian Rock (tarpeian-rock, 29 m)): terrain:heightfield vs lmbatch:rock:rock
- [major] ghost 2.05 m over 298 probes @7.5,9.58,723.9 (Baths of Sura (thermae-suranae, 107 m)): terrain:heightfield vs city:city:massing:ns:off:city:massing; confirmed: {"how":"walk over","approach":[1,0],"reached":true,"feetAboveDrawn":-2.031,"drawnY":11.627,"feetY":9.596,"nearest":0.24,"at":[-8.5,9.6,737.74],"frames":165,"seconds":2.7}; shot .shots/audit/collision-06-ghost.png
- [major] ghost 2.28 m over 94 probes @343.6,15.7,447 (Temple of Divus Claudius (temple-divus-claudius, 155 m)): terrain:heightfield vs city:black:ns:mid:black; confirmed: {"how":"walk over","approach":[0.38268343236508984,0.9238795325112867],"reached":false,"feetAboveDrawn":null,"drawnY":17.98,"feetY":15.569,"nearest":1.46,"at":[339.53,15.57,438.42],"frames":100,"seconds":1.7}; shot .shots/audit/collision-07-ghost.png
- [major] ghost-wall 99.00 m over 12 probes @-71.1,7.41,157.3 (Watch Post of the Vigiles, Velabrum (excubitorium-velabri, 23 m), story route): none vs city:plaster_ochre:mid:plaster_ochre; confirmed: {"how":"walk into","passedDrawn":false,"progress":3.33,"at":[-73.29,7.26,153.93],"standoff":-0.24,"against":"city:b695:box","frames":601,"seconds":10}; shot .shots/audit/collision-08-ghost-wall.png
- [blocker] fallthrough 1.58 m over 1 probes @-101.5,22.77,79.5 (Tarpeian Rock (tarpeian-rock, 11 m)): none vs city:tree:umbrella_pine#1:veg:Lbark|0.00045|0.025||0|0|
- [blocker] fallthrough 1.58 m over 1 probes @-101.5,22.77,79.5 (Tarpeian Rock (tarpeian-rock, 11 m)): none vs city:tree:umbrella_pine#1:veg:Lbark|0.00045|0.025||0|0|
- [blocker] fallthrough 1.55 m over 1 probes @-97.2,19.26,79.7 (Tarpeian Rock (tarpeian-rock, 12 m)): none vs lmbatch:rock:rock
- [blocker] fallthrough 1.55 m over 1 probes @-101.5,21.21,80.5 (Tarpeian Rock (tarpeian-rock, 12 m)): none vs lmbatch:rock:rock
- [major] ghost 1.79 m over 27 probes @-263.1,4.89,180.8 (River Port (portus-tiberinus, 39 m), story route): terrain:heightfield vs lmbatch:paving_travertine:ns:paving_travertine; confirmed: {"how":"walk over","approach":[1,0],"reached":true,"feetAboveDrawn":-1.763,"drawnY":6.682,"feetY":4.919,"nearest":0.03,"at":[-265.5,4.92,182.53],"frames":175,"seconds":2.9}; shot .shots/audit/collision-09-ghost.png
- [major] ghost-wall 99.00 m over 36 probes @650.7,27.68,462 (Camp of the Foreigners (castra-peregrina, 80 m)): none vs city:brick:brick; confirmed: {"how":"walk into","passedDrawn":true,"progress":1.76,"at":[639.23,27.66,464.09],"standoff":-1.56,"against":null,"frames":58,"seconds":1}; shot .shots/audit/collision-10-ghost-wall.png
- [major] invisible 3.18 m over 35 probes @-230.6,6.24,320.7 (Bridge of Piles (pons-sublicius, 9 m)): Object:box vs none collider box at -238.09,6.77,322.95 half-size 33×0.55×0.1; confirmed: {"how":"walk into","progress":0.94,"at":[-208.7,6.27,308.5],"standoff":null,"against":"Object:box","frames":80,"seconds":1.3}; shot .shots/audit/collision-11-invisible.png
- [major] invisible 3.18 m over 35 probes @-230.6,6.24,320.7 (Bridge of Piles (pons-sublicius, 9 m)): Object:box vs none collider box at -236.8,6.77,325.48 half-size 33×0.55×0.1
- [major] ghost 1.90 m over 98 probes @-78.3,10.75,68.5 (Tarpeian Rock (tarpeian-rock, 24 m)): terrain:heightfield vs lmbatch:rock:rock
- [major] ghost 2.60 m over 8 probes @492.9,14.4,220.5 (Morning School (ludus-matutinus, 24 m), story route): terrain:heightfield vs lmbatch:black:ns:black; confirmed: {"how":"walk over","approach":[1,0],"reached":false,"feetAboveDrawn":null,"drawnY":17,"feetY":20.453,"nearest":2.47,"at":[486.03,20.45,220.5],"frames":50,"seconds":0.8}; shot .shots/audit/collision-12-ghost.png
- [major] ghost 2.60 m over 8 probes @527.1,14.4,220.5 (Morning School (ludus-matutinus, 24 m), story route): terrain:heightfield vs lmbatch:black:ns:black; confirmed: {"how":"walk over","approach":[1,0],"reached":false,"feetAboveDrawn":null,"drawnY":17,"feetY":14.43,"nearest":1.33,"at":[521.17,14.43,220.5],"frames":100,"seconds":1.7}; shot .shots/audit/collision-13-ghost.png
- [major] ghost 2.60 m over 8 probes @576.9,13.8,175.5 (Dacian Gladiatorial School (ludus-dacicus, 24 m), story route): terrain:heightfield vs lmbatch:black:ns:black; confirmed: {"how":"walk over","approach":[1,0],"reached":false,"feetAboveDrawn":null,"drawnY":16.4,"feetY":19.853,"nearest":2.47,"at":[570.03,19.85,175.5],"frames":50,"seconds":0.8}; shot .shots/audit/collision-14-ghost.png
- [major] invisible 3.41 m over 8 probes @309,9.14,556.6 (Capena Gate (porta-capena, 17 m), story route): landmark:porta-capena:box vs lmbatch:travertine:travertine collider box at 305.77,9.39,561.18 half-size 4.7×1.09×4.45 top 10.48; confirmed: {"how":"walk into","progress":-0.02,"at":[308.94,9.17,557.05],"standoff":3.43,"against":"landmark:porta-capena:box","frames":40,"seconds":0.7}; shot .shots/audit/collision-15-invisible.png
- [major] ghost-wall 99.00 m over 8 probes @-63.5,7.35,157.4 (Watch Post of the Vigiles, Velabrum (excubitorium-velabri, 23 m), story route): none vs city:brick:mid:brick
- [major] ghost-wall 99.00 m over 8 probes @-68.8,7.34,305.9 (The Inn at the Starting Gates (caupona-carcerum, 37 m), story route): none vs circus-bays:travertine:travertine; confirmed: {"how":"walk into","passedDrawn":true,"progress":3.02,"at":[-69.54,7.37,306.33],"standoff":-1.38,"against":null,"frames":119,"seconds":2}; shot .shots/audit/collision-16-ghost-wall.png
- [major] ghost-wall 99.00 m over 8 probes @-60.6,7.34,294.7 (Insula of Tuccius the Cooper (insula-tuccii, 44 m), story route): none vs circus-bays-far:travertine:travertine; confirmed: {"how":"walk into","passedDrawn":true,"progress":3,"at":[-61.1,7.37,295.28],"standoff":-1.47,"against":null,"frames":101,"seconds":1.7}; shot .shots/audit/collision-17-ghost-wall.png
- [major] ghost-wall 99.00 m over 8 probes @-63.2,7.34,298.4 (The Inn at the Starting Gates (caupona-carcerum, 44 m), story route): none vs circus-bays-far:travertine:travertine
- [major] ghost-wall 99.00 m over 8 probes @-60.6,7.34,294.7 (Insula of Tuccius the Cooper (insula-tuccii, 44 m), story route): none vs circus-bays:travertine:travertine
- [major] ledge 1.27 m over 70 probes @306,10.48,561 (Capena Gate (porta-capena, 12 m), story route): landmark:porta-capena:box vs lmbatch:paving_travertine:ns:paving_travertine collider box at 305.77,9.39,561.18 half-size 4.7×1.09×4.45 top 10.48
- [major] ghost 3.23 m over 22 probes @338,9.01,668.8 (Temple of Honour and Virtue (temple-honos-virtus, 28 m)): terrain:heightfield vs city:black:ns:mid:black; confirmed: {"how":"walk over","approach":[0.9238795325112867,0.3826834323650898],"reached":false,"feetAboveDrawn":null,"drawnY":12.247,"feetY":8.779,"nearest":2.5,"at":[336.29,8.78,672.04],"frames":50,"seconds":0.8}; shot .shots/audit/collision-18-ghost.png
- [major] ghost 2.47 m over 6 probes @337,12.75,-157.5 (The Subura (subura, 71 m), story route): terrain:heightfield vs city:plaster_red:plaster_red
- [major] ghost 2.86 m over 6 probes @322,11.73,575.5 (Mercury’s Spring (fons-mercurii, 6 m), story route): terrain:heightfield vs city:black:ns:mid:black
- [major] invisible 2.70 m over 6 probes @323.2,12.69,582.3 (Mercury’s Spring (fons-mercurii, 7 m), story route): ?:box vs city:wood_dark:wood_dark collider box at 323.46,13.42,585.26 half-size 0.75×0.75×1.6 top 14.17; confirmed: {"how":"walk into","progress":3.51,"at":[322.49,12.7,585.84],"standoff":0.14,"against":"city:b594:box","frames":520,"seconds":8.7}; shot .shots/audit/collision-19-invisible.png
- [major] ghost-wall 99.00 m over 6 probes @278.7,7.89,538.4 (Crossroads Shrine by the Capena Gate (compitum-capenae, 11 m), story route): none vs lmbatch:plaster_red:plaster_red; confirmed: {"how":"walk into","passedDrawn":true,"progress":3,"at":[279.39,8.3,537.88],"standoff":-0.79,"against":null,"frames":104,"seconds":1.7}; shot .shots/audit/collision-20-ghost-wall.png
- [major] ghost-wall 99.00 m over 6 probes @591,28.2,501.8 (Camp of the Foreigners (castra-peregrina, 14 m), story route): none vs city:brick:brick; confirmed: {"how":"walk into","passedDrawn":true,"progress":4.82,"at":[586.18,28.23,500.26],"standoff":-1.57,"against":null,"frames":159,"seconds":2.6}; shot .shots/audit/collision-21-ghost-wall.png
- [major] ghost-wall 99.00 m over 6 probes @107.2,7.85,39.9 (Regia (regia, 9 m), story route): none vs forest:laurel#2:veg:Lbark|0.00045|0.025||0|0|; confirmed: {"how":"walk into","passedDrawn":true,"progress":2.8,"at":[105.91,7.88,39.51],"standoff":-1.57,"against":null,"frames":101,"seconds":1.7}; shot .shots/audit/collision-22-ghost-wall.png
- [major] invisible 3.33 m over 6 probes @-68.7,7.27,262.6 (Bakery of the Velabrum (pistrinum-velabri, 28 m), story route): city:-1,2:box vs city:plaster_ochre:plaster_ochre collider box at -67.18,8.92,262.56 half-size 1.1×2.05×1.1 top 10.97; confirmed: {"how":"walk into","progress":0.09,"at":[-68.85,7.25,262.67],"standoff":3.08,"against":null,"frames":80,"seconds":1.3}; shot .shots/audit/collision-23-invisible.png
- [major] ghost-wall 99.00 m over 6 probes @1.6,10.79,255.3 (Insula of Tuccius the Cooper (insula-tuccii, 40 m), story route): none vs city:wood:wood
- [major] invisible 2.49 m over 6 probes @-413.7,6.69,-330.7 (Saepta Julia (saepta-julia, 96 m), story route): city:b1703:box vs none collider box at -417.51,8.42,-325.48 half-size 2.01×2.31×2.85 top 10.74; confirmed: {"how":"walk into","progress":3.12,"at":[-416.13,6.76,-328.66],"standoff":null,"against":"city:b1703:box","frames":601,"seconds":10}; shot .shots/audit/collision-24-invisible.png
- [major] ghost-wall 99.00 m over 6 probes @-63.6,7.34,299 (The Inn at the Starting Gates (caupona-carcerum, 43 m), story route): none vs circus-bays:travertine:travertine
- [major] ghost-wall 99.00 m over 6 probes @-65.4,7.34,301.5 (The Inn at the Starting Gates (caupona-carcerum, 41 m), story route): none vs circus-bays:travertine:travertine
- [major] ghost-wall 99.00 m over 6 probes @1.6,10.79,255.3 (Insula of Tuccius the Cooper (insula-tuccii, 40 m), story route): none vs city:wood:wood
- [major] invisible 3.95 m over 6 probes @-0.1,8.16,259.7 (Lupercal Cave (lupercal, 37 m), story route): city:0,1:box vs none collider box at 0.05,9.08,259.9 half-size 0.15×1.4×1.91 top 10.48; confirmed: {"how":"walk into","progress":0.24,"at":[-0.89,8.04,262.06],"standoff":null,"against":"city:0,1:box","frames":520,"seconds":8.7}; shot .shots/audit/collision-25-invisible.png
- [major] ghost-wall 99.00 m over 6 probes @252.3,24.89,-223.1 (The Subura (subura, 47 m), story route): none vs city:brick:mid:brick
- [major] ghost-wall 99.00 m over 6 probes @-65.4,7.34,301.5 (The Inn at the Starting Gates (caupona-carcerum, 41 m), story route): none vs circus-bays-far:travertine:travertine
- [major] ledge 3.14 m over 18 probes @352.5,21.15,303.5 (Temple of Divus Claudius (temple-divus-claudius, 85 m)): city:b637:box vs city:gravel:ns:off:mid:gravel collider box at 350.85,20.55,303.81 half-size 1.48×0.6×2.85 top 21.15; confirmed: {"how":"stand on it","at":[351.5,20.9,302.5],"grounded":true,"feetAboveDrawn":0.727,"movedFromSpot":0}; shot .shots/audit/collision-26-ledge.png
- [major] ghost-wall 99.00 m over 18 probes @528.2,25.48,458.9 (Arch of Dolabella and Silanus (arch-dolabella, 10 m)): none vs city:brick:brick
- [major] ghost 2.29 m over 6 probes @338,10.45,562 (Mercury’s Spring (fons-mercurii, 27 m), story route): terrain:heightfield vs city:plaster_ochre:mid:plaster_ochre
- [major] invisible 1.75 m over 12 probes @280.3,7.93,542.4 (Crossroads Shrine by the Capena Gate (compitum-capenae, 7 m), story route): landmark:porta-capena:box vs city:wood:wood collider box at 284.78,9.69,538.96 half-size 2.44×2.41×2.85 top 12.1
- [major] ghost 1.49 m over 19 probes @-360.5,7.22,-406.6 (Saepta Julia (saepta-julia, 80 m), story route): landmark:pantheon:box vs lmbatch:dirt:ns:dirt collider box at -375.6,7.01,-401.4 half-size 17.4×0.21×25.2 top 7.22
- [major] ledge 1.90 m over 9 probes @-81.8,9.47,300.8 (The Inn at the Starting Gates (caupona-carcerum, 26 m), story route): city:b414:box vs city:terracotta:ns:terracotta collider box at -82.21,8.52,300.88 half-size 0.88×0.95×0.63 top 9.47; confirmed: {"how":"stand on it","at":[-81.5,9.22,300.5],"grounded":true,"feetAboveDrawn":1.647,"movedFromSpot":0}; shot .shots/audit/collision-27-ledge.png
- [major] ghost-wall 99.00 m over 16 probes @265.7,10.59,406 (Crossroads Shrine below the Palatine (compitum-circi, 98 m)): none vs city:brick:mid:brick
- [major] ghost-wall 99.00 m over 5 probes @53.3,7.85,-10.5 (Shrine of Janus Geminus (janus-geminus, 3 m), story route): none vs lmbatch:forum:bright-bronze:forum:bright-bronze
- [major] invisible 2.57 m over 5 probes @-298.6,6.7,136.6 (Tiber Island (insula-tiberina, 27 m), story route): city:b621:box vs none collider box at -298.07,7.06,136.82 half-size 1.05×0.24×0.25 top 7.3; confirmed: {"how":"walk into","progress":3.03,"at":[-299.78,6.72,137.71],"standoff":null,"against":null,"frames":125,"seconds":2.1}; shot .shots/audit/collision-28-invisible.png
- [major] ghost-wall 99.00 m over 5 probes @335.7,12.37,581.4 (Mercury’s Spring (fons-mercurii, 18 m), story route): none vs city:wood:mid:wood
- [major] ledge 1.12 m over 53 probes @293,10.64,572.9 (Capena Gate (porta-capena, 11 m), story route): landmark:porta-capena:box vs lmbatch:paving_travertine:ns:paving_travertine collider box at 292.28,9.64,572.49 half-size 4.7×1.01×4.45 top 10.64
- [major] ghost 1.52 m over 17 probes @-391,7.22,-404.5 (Pantheon of Agrippa (pantheon, 16 m), story route): landmark:pantheon:box vs lmbatch:dirt:ns:dirt collider box at -375.6,7.01,-401.4 half-size 17.4×0.21×25.2 top 7.22

## Verified by hand (2026-10-10, screenshots in .shots/verify/ and .shots/audit/)

Each was re-checked in the running game (player stood on the collider, or walked into or over the
spot with the real controller) and looked at:

1. River Port quay (Portus Tiberinus) @-262,5.35,182: a drawn travertine deck at 6.71 m has no
   collider; the only physics is the terrain 1.41 m lower (1.9 m at -269.5,185.5). Standing there,
   only the player's head shows above the paving (.shots/verify/v04-river-port-quay.png); walking
   onto the deck drops the player through it.
2. Porta Capena, the paved square inside the gate @306,10.48,561 and @293,10.64,572.9: each half is
   one flat box (capenaParts.ts:403, top = highest ground + 0.28) over paving that follows the
   slope: up to 1.27 m of invisible platform (70 and 53 m² of probes), an invisible wall at the low
   edge (walk stopped 3.43 m short of the drawn edge), feet 1.15 m over the paving
   (.shots/verify/v01-capena-square-float.png, .shots/audit/collision-15-invisible.png).
3. Terrain: Rapier's heightfield splits every 2 m cell along the other diagonal than the drawn
   CDLOD patch (Terrain.ts:82, idx a,c,d / a,d,b): physics matches the other diagonal in all 40,305
   samples where the two differ by over 2 cm; mean |Δ| 1.4 cm, max 1.19 m on the Palatine slope
   @70.9,10.72,327 where the player stands buried to the chest (.shots/verify/v05-terrain-diagonal.png).
4. Porta Capena gate passage @309.7,13.44,582.5: a landmark prop box (1.8×1.3×2.1 m) stands next to
   the drawn cart, its top 1.79 m over the paving; the player stands in mid-air there
   (.shots/audit-sweep2/collision-28-ledge.png).
5. Imperial Mint @649.8,16.72,198.4: the compound's box (36×1.56×24 m, top 16.72) is 1.1 m above the
   drawn ground (terrain 15.63) under the roofs: ~300 m² of invisible floor (.shots/verify/v02-moneta-ledge.png).
6. Subura @259.3,12.78,-156.8 (and Tiber Island @-333.6,6.75,131.8): lot box colliders fill drawn
   open doorways with a stair inside; the walk stops 2.7 m before the drawn opening
   (.shots/audit-sweep2/collision-26-invisible.png). 919 'city box vs nothing drawn' defects city-wide.
7. Baths of Trajan @608.3,25.69,103.6: a drawn paving lip overhangs the slope; standing on it drops
   the player 3.2 m (.shots/audit/collision-01-fallthrough.png). Tarpeian Rock and the Carmental
   Gate: drawn rock outcrops 1.6–3 m over the heightfield cliff with no collider (drops 2.2–2.9 m).
8. Circus Maximus, the starting-gate end (Inn at the Starting Gates @-68.8,7.34,305.9): the body
   walks 1.4–1.6 m into the drawn arcade bays along the sidewalk (.shots/audit/collision-16-ghost-wall.png).

Not defects (read the numbers with these in mind):
- The size of a grouped defect is its worst probe; the big paving and ground-cover 'sink' groups
  (Campus Martius courts, Theatre of Marcellus, Colosseum ring, city dirt/cobbles/gravel) are
  mostly 2–6 cm with a few edge probes up to 0.3 m.
- 'ghost-wall vs …:mid' near the edge of a stop: the city's mid level (no colliders) is drawn for
  blocks over 30 m from the player; standing at the spot builds the full level with colliders.
- '?:box' (no owner) are moving carts; the castra peregrina 1.7 m slab is a head-height lintel
  (now 'low-overhead').
