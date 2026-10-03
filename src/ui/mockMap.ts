/**
 * Mock map data for the UI dev scene: Rome c. AD 113, approximated from modern coordinates
 * (real meters from the Miliarium Aureum, +x east, +z south) and converted to game meters with
 * WORLD_SCALE. Replaced at integration by an adapter over src/data/atlas.ts + the terrain module.
 */
import { WORLD_SCALE } from '../world/coords';
import type { MapDataSource, MapIconKind, MapLabel, MapLandmark, MapLandmarkStyle, MapLine, MapLocation, MapQuestMarker, MapRiver, MapRoad, MapShape } from './types';

const K = WORLD_SCALE;
type P = [number, number];
const pts = (list: P[]): P[] => list.map(([x, z]) => [x * K, z * K]);

// ------------------------------------------------------------------ shape helpers (real meters in)

/** Rectangle whose long side (`long`) runs along compass bearing `axis`. */
const R = (x: number, z: number, long: number, short: number, axis = 90): MapShape => ({ kind: 'rect', x: x * K, z: z * K, w: long * K, d: short * K, rot: axis - 90 });
/** Ellipse with `rx` along compass bearing `axis`. */
const E = (x: number, z: number, rx: number, rz: number, axis = 90): MapShape => ({ kind: 'ellipse', x: x * K, z: z * K, rx: rx * K, rz: rz * K, rot: axis - 90 });
/** Circus/stadium whose curved end points along `axis` (the straight carceres end is opposite). */
const S = (x: number, z: number, length: number, width: number, axis = 90): MapShape => ({ kind: 'stadium', x: x * K, z: z * K, length: length * K, width: width * K, rot: axis - 90 });
/** Theatre: half disc whose flat (stage) side faces bearing `faces`. */
const T = (x: number, z: number, r: number, faces: number): MapShape => ({ kind: 'halfDisc', x: x * K, z: z * K, r: r * K, rot: faces });

const L = (id: string, name: string, latin: string | undefined, style: MapLandmarkStyle, shapes: MapShape[], extra: Partial<MapLandmark> = {}): MapLandmark => ({ id, name, latin, style, shapes, ...extra });

// ------------------------------------------------------------------ terrain

interface Hill { x: number; z: number; rx: number; rz: number; axis: number; top: number }
const PLAIN = 14;
const HILLS: Hill[] = [
  { x: -150, z: -95, rx: 95, rz: 75, axis: 45, top: 46 }, // Arx
  { x: -260, z: 100, rx: 125, rz: 85, axis: 30, top: 46 }, // Capitolium
  { x: -205, z: 5, rx: 90, rz: 70, axis: 30, top: 38 }, // Asylum saddle
  { x: 230, z: 420, rx: 280, rz: 195, axis: 125, top: 50 }, // Palatine
  { x: 420, z: 150, rx: 110, rz: 70, axis: 60, top: 31 }, // Velia
  { x: -330, z: 1110, rx: 390, rz: 290, axis: 30, top: 46 }, // Aventine
  { x: 230, z: 1330, rx: 230, rz: 180, axis: 60, top: 40 }, // Aventinus minor
  { x: 930, z: 770, rx: 560, rz: 230, axis: 100, top: 50 }, // Caelian
  { x: 1060, z: -120, rx: 320, rz: 220, axis: 70, top: 55 }, // Oppian
  { x: 1080, z: -560, rx: 230, rz: 200, axis: 60, top: 55 }, // Cispian
  { x: 1800, z: -350, rx: 760, rz: 700, axis: 0, top: 57 }, // Esquiline plateau
  { x: 980, z: -800, rx: 500, rz: 170, axis: 49, top: 56 }, // Viminal
  { x: 550, z: -1000, rx: 820, rz: 225, axis: 42, top: 60 }, // Quirinal
  { x: -150, z: -2000, rx: 650, rz: 380, axis: 70, top: 58 }, // Pincian
  { x: -1850, z: 450, rx: 300, rz: 1250, axis: 100, top: 82 }, // Janiculum (long N–S ridge)
  { x: -2600, z: -1400, rx: 560, rz: 650, axis: 90, top: 70 }, // Vatican
];

const RIVER_REAL: P[] = [
  [-560, -3000], [-700, -2600], [-881, -2235], [-1050, -1900], [-1212, -1590], [-1502, -1202], [-1720, -1000],
  [-1791, -880], [-1760, -640], [-1600, -430], [-1253, -204], [-1000, -60], [-840, 14], [-640, 150],
  [-500, 330], [-520, 520], [-640, 760], [-840, 1179], [-1046, 1623], [-1150, 2000], [-1250, 2600],
];

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function distToPolyline(x: number, z: number, line: P[]): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i];
    const [bx, bz] = line[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - ax - t * dx, z - az - t * dz);
    if (d < best) best = d;
  }
  return best;
}

/** Ancient ground elevation (m ASL) at a real-meter point. */
export function mockElevation(x: number, z: number): number {
  let h = PLAIN + 2.5 * Math.sin(x * 0.0021 + 1.3) * Math.sin(z * 0.0017 - 0.4);
  for (const hl of HILLS) {
    const a = (hl.axis * Math.PI) / 180;
    // Local coords: u along the axis bearing, v across it.
    const ux = Math.sin(a);
    const uz = -Math.cos(a);
    const dx = x - hl.x;
    const dz = z - hl.z;
    const u = dx * ux + dz * uz;
    const v = -dx * uz + dz * ux;
    const d = Math.hypot(u / hl.rx, v / hl.rz);
    // Plateau top with steep-ish flanks, plus a little relief so contours aren't perfect ovals.
    const k = 1 - smooth(0.5, 1.2, d + 0.06 * Math.sin(u * 0.02) * Math.cos(v * 0.025));
    h = Math.max(h, PLAIN + (hl.top - PLAIN) * k);
  }
  const r = distToPolyline(x, z, RIVER_REAL);
  return h - (h - 7) * (1 - smooth(40, 170, r));
}

// ------------------------------------------------------------------ lines

const RIVERS: MapRiver[] = [{ name: 'Tiberis', width: 100 * K, points: pts(RIVER_REAL) }];

const ROADS: MapRoad[] = [
  { name: 'Via Sacra', rank: 'via', points: pts([[40, 50], [200, 110], [380, 180], [520, 250], [610, 290]]) },
  { name: 'Via Lata', rank: 'via', points: pts([[-80, -80], [-170, -380], [-300, -800], [-420, -1180], [-560, -1600], [-690, -1990], [-760, -2400], [-700, -3000]]) },
  { name: 'Via Appia', rank: 'via', points: pts([[560, 330], [520, 700], [480, 1030], [700, 1450], [1050, 1950], [1400, 2400], [1600, 2700]]) },
  { name: 'Via Latina', rank: 'via', points: pts([[700, 1450], [1100, 1800], [1600, 2300], [2000, 2700]]) },
  { name: 'Via Labicana', rank: 'via', points: pts([[660, 300], [1150, 230], [1800, 190], [2700, 170]]) },
  { name: 'Via Tiburtina', rank: 'via', points: pts([[640, -420], [1000, -520], [1400, -520], [1900, -650], [2700, -950]]) },
  { name: 'Via Praenestina', rank: 'via', points: pts([[1400, -520], [1900, -250], [2555, 140], [2800, 300]]) },
  { name: 'Via Nomentana', rank: 'via', points: pts([[950, -1450], [1350, -2000], [1800, -2700]]) },
  { name: 'Via Salaria', rank: 'via', points: pts([[950, -1450], [750, -2000], [650, -2800]]) },
  { name: 'Via Ostiensis', rank: 'via', points: pts([[-260, 560], [-560, 780], [-700, 1100], [-600, 1450], [-330, 1780], [-250, 2300], [-150, 2700]]) },
  { name: 'Via Aurelia', rank: 'via', points: pts([[-445, 400], [-800, 380], [-1250, 300], [-1700, 250], [-2300, 200], [-2950, 180]]) },
  { name: 'Via Portuensis', rank: 'via', points: pts([[-698, 731], [-950, 1050], [-1300, 1500], [-1650, 2200], [-1900, 2700]]) },
  { name: 'Via Triumphalis', rank: 'via', points: pts([[-1847, -913], [-2200, -1100], [-2600, -1500], [-2950, -1800]]) },
  { name: 'Clivus Capitolinus', rank: 'street', points: pts([[-40, 60], [-150, 60], [-230, 90]]) },
  { name: 'Vicus Tuscus', rank: 'street', points: pts([[40, 120], [-30, 300], [-80, 480], [-150, 620]]) },
  { name: 'Vicus Iugarius', rank: 'street', points: pts([[-60, 90], [-200, 200], [-330, 300]]) },
  { name: 'Argiletum', rank: 'street', points: pts([[110, -30], [330, -200], [640, -420], [950, -750], [1300, -1150], [1500, -1350]]) },
  { name: 'Vicus Longus', rank: 'street', points: pts([[250, -330], [650, -800], [950, -1450]]) },
  { name: 'Via Recta', rank: 'street', points: pts([[-1735, -847], [-1300, -800], [-900, -780], [-420, -760]]) },
  { name: 'Via Nova', rank: 'street', points: pts([[0, 170], [150, 230], [320, 280]]) },
  { rank: 'street', points: pts([[-420, -760], [-640, -560], [-700, -400], [-640, -60]]) },
  { rank: 'street', points: pts([[-560, -1300], [-900, -1100], [-1250, -1000]]) },
  { rank: 'street', points: pts([[-570, 400], [-700, 600], [-900, 800], [-1200, 900], [-1500, 1000]]) },
  { rank: 'street', points: pts([[-621, 264], [-900, 300], [-1200, 450]]) },
  { name: 'Clivus Scauri', rank: 'street', points: pts([[500, 600], [750, 700], [1000, 750]]) },
  { rank: 'street', points: pts([[-217, -258], [-500, -300], [-900, -280], [-1217, -258]]) },
];

const BRIDGES: MapLine[] = [
  { name: 'Pons Neronianus', points: pts([[-1735, -847], [-1847, -913]]) },
  { name: 'Pons Agrippae', points: pts([[-1217, -258], [-1289, -150]]) },
  { name: 'Pons Fabricius', points: pts([[-528, 192], [-566, 221]]) },
  { name: 'Pons Cestius', points: pts([[-590, 239], [-628, 268]]) },
  { name: 'Pons Aemilius', points: pts([[-445, 400], [-570, 405]]) },
  { name: 'Pons Sublicius', points: pts([[-582, 789], [-698, 731]]) },
];

const WALLS: MapLine[] = [
  {
    name: 'Murus Servii Tullii',
    points: pts([
      [-330, 80], [-330, -40], [-260, -200], [-60, -420], [150, -600], [300, -850], [600, -1200], [900, -1520],
      [1250, -1350], [1420, -1100], [1450, -800], [1420, -520], [1450, -100], [1500, 250], [1380, 600],
      [1150, 950], [800, 1050], [480, 1030], [300, 1250], [250, 1500], [0, 1700], [-250, 1650], [-500, 1550],
      [-680, 1300], [-650, 1000], [-520, 760],
    ]),
  },
];

const AQUEDUCTS: MapLine[] = [
  { name: 'Aqua Claudia · Arcus Neroniani', points: pts([[3000, 400], [2555, 140], [2000, 380], [1500, 600], [1150, 700], [900, 650]]) },
  { name: 'Aqua Virgo', points: pts([[900, -2800], [300, -2100], [-150, -1500], [-450, -1000], [-560, -700], [-660, -600]]) },
];

const ISLANDS: MapShape[] = [E(-578, 230, 135, 32, 142)];

// ------------------------------------------------------------------ landmarks

const LANDMARKS: MapLandmark[] = [
  // Forum Romanum and the Capitol
  L('forum-romanum', 'Roman Forum', 'Forum Romanum', 'public', [R(100, 70, 180, 55, 115)]),
  L('curia', 'Senate House', 'Curia Iulia', 'public', [R(55, -20, 30, 20, 25)]),
  L('basilica-aemilia', 'Basilica Aemilia', undefined, 'public', [R(135, 10, 100, 30, 115)]),
  L('basilica-iulia', 'Basilica Julia', 'Basilica Iulia', 'public', [R(55, 120, 100, 48, 115)]),
  L('temple-saturn', 'Temple of Saturn', 'Aedes Saturni', 'temple', [R(-35, 70, 40, 22, 25)]),
  L('temple-castor', 'Temple of Castor', 'Aedes Castoris', 'temple', [R(155, 150, 40, 30, 25)]),
  L('temple-vesta', 'Temple of Vesta', 'Aedes Vestae', 'temple', [E(205, 168, 9, 9)], { labelMinZoom: 1.2 }),
  L('atrium-vestae', 'House of the Vestals', 'Atrium Vestae', 'domestic', [R(255, 195, 70, 35, 115)]),
  L('temple-divus-iulius', 'Temple of Divus Julius', 'Aedes Divi Iuli', 'temple', [R(170, 105, 30, 26, 115)], { labelMinZoom: 1.2 }),
  L('tabularium', 'Tabularium', undefined, 'public', [R(-100, 30, 74, 38, 25)]),
  L('capitolium', 'Temple of Jupiter', 'Aedes Iovis Optimi Maximi', 'temple', [R(-275, 110, 62, 54, 0)]),
  L('juno-moneta', 'Temple of Juno Moneta', 'Aedes Iunonis Monetae', 'temple', [R(-150, -90, 30, 20, 30)]),
  // Imperial fora
  L('forum-caesaris', 'Forum of Caesar', 'Forum Iulium', 'public', [R(25, -100, 160, 75, 145)]),
  L('forum-augusti', 'Forum of Augustus', 'Forum Augusti', 'public', [R(210, -170, 125, 90, 145)]),
  L('mars-ultor', 'Temple of Mars Ultor', 'Aedes Martis Ultoris', 'temple', [R(255, -215, 50, 38, 145)], { labelMinZoom: 1.1 }),
  L('forum-nervae', 'Forum of Nerva', 'Forum Transitorium', 'public', [R(275, -60, 120, 45, 145)]),
  L('templum-pacis', 'Temple of Peace', 'Templum Pacis', 'public', [R(385, 20, 140, 110, 115)]),
  L('forum-traiani', "Trajan's Forum", 'Forum Traiani', 'public', [R(90, -225, 118, 90, 145)]),
  L('basilica-ulpia', 'Basilica Ulpia', undefined, 'public', [R(10, -300, 170, 60, 55)]),
  L('column-trajan', "Trajan's Column", 'Columna Traiani', 'monument', [E(-31, -340, 8, 8)], { labelAt: { x: -31 * K, z: -362 * K } }),
  L('markets-trajan', "Trajan's Markets", 'Mercatus Traiani', 'public', [T(160, -290, 90, 235)]),
  // Colosseum valley
  L('colosseum', 'Flavian Amphitheatre', 'Amphitheatrum Flavium', 'arena', [E(622, 285, 94, 78, 105)]),
  L('ludus-magnus', 'Ludus Magnus', 'Gladiatorial school', 'arena', [R(810, 255, 95, 75, 105), E(810, 255, 34, 22, 105)]),
  L('meta-sudans', 'Meta Sudans', undefined, 'monument', [E(560, 335, 9, 9)], { labelMinZoom: 1.4 }),
  L('colossus', 'Colossus of the Sun', 'Colossus Solis', 'monument', [R(520, 215, 16, 16, 0)], { labelMinZoom: 1.3 }),
  L('arch-titus', 'Arch of Titus', 'Arcus Titi', 'monument', [R(440, 225, 15, 6, 115)], { labelMinZoom: 1.3 }),
  L('baths-trajan', 'Baths of Trajan', 'Thermae Traiani', 'public', [R(960, -80, 330, 250, 120)]),
  // Palatine
  L('palace', 'Imperial Palace', 'Domus Augustana', 'palace', [R(200, 480, 180, 130, 160)]),
  L('domus-tiberiana', 'House of Tiberius', 'Domus Tiberiana', 'palace', [R(110, 330, 150, 90, 115)]),
  L('palatine-stadium', 'Palace Stadium', 'Hippodromus', 'palace', [S(310, 500, 160, 48, 160)], { labelMinZoom: 1 }),
  L('apollo-palatinus', 'Temple of Apollo', 'Aedes Apollinis Palatini', 'temple', [R(85, 470, 40, 25, 160)], { labelMinZoom: 1.1 }),
  L('circus-maximus', 'Circus Maximus', undefined, 'arena', [S(35, 741, 620, 140, 120)]),
  // Southern Campus Martius and the river port
  L('theatre-marcellus', 'Theatre of Marcellus', 'Theatrum Marcelli', 'arena', [T(-412, 97, 66, 225)]),
  L('porticus-octaviae', 'Portico of Octavia', 'Porticus Octaviae', 'public', [R(-470, 10, 120, 110, 90)]),
  L('circus-flaminius', 'Circus Flaminius', undefined, 'arena', [S(-650, -70, 300, 90, 90)]),
  L('forum-holitorium', 'Vegetable Market', 'Forum Holitorium', 'public', [R(-420, 195, 100, 70, 20)], { labelMinZoom: 0.9 }),
  L('forum-boarium', 'Cattle Market', 'Forum Boarium', 'public', [R(-330, 380, 150, 90, 120)]),
  L('temple-hercules', 'Temple of Hercules', 'Aedes Herculis Victoris', 'temple', [E(-395, 400, 9, 9)], { labelMinZoom: 1.5 }),
  L('temple-portunus', 'Temple of Portunus', 'Aedes Portuni', 'temple', [R(-370, 330, 26, 14, 0)], { labelMinZoom: 1.5 }),
  L('emporium', 'Emporium', 'Porticus Aemilia', 'public', [R(-820, 1520, 480, 60, 25)]),
  L('horrea-galbana', 'Warehouses of Galba', 'Horrea Galbana', 'public', [R(-590, 1660, 200, 150, 25)]),
  L('pyramid', 'Pyramid of Cestius', 'Sepulcrum C. Cesti', 'monument', [R(-303, 1798, 30, 30, 0)]),
  // Campus Martius
  L('porticus-minucia', 'Grain Portico', 'Porticus Minucia Frumentaria', 'public', [R(-560, -300, 120, 90, 0)]),
  L('theatre-pompey', 'Theatre of Pompey', 'Theatrum Pompeii', 'arena', [T(-960, -300, 82, 90)]),
  L('porticus-pompeiana', 'Portico of Pompey', 'Porticus Pompeiana', 'public', [R(-790, -270, 180, 135, 90)]),
  L('pantheon', 'Pantheon', 'rebuilding after the fire', 'temple', [E(-643, -647, 22, 22), R(-643, -680, 34, 16, 90)]),
  L('baths-agrippa', 'Baths of Agrippa', 'Thermae Agrippae', 'public', [R(-680, -560, 110, 80, 90)]),
  L('baths-nero', 'Baths of Nero', 'Thermae Neronianae', 'public', [R(-800, -730, 180, 120, 90)]),
  L('stadium-domitian', 'Stadium of Domitian', 'Stadium Domitiani', 'arena', [S(-951, -720, 275, 106, 0)]),
  L('odeum', 'Odeum of Domitian', 'Odeum', 'arena', [T(-1010, -560, 45, 0)], { labelMinZoom: 1 }),
  L('saepta', 'Saepta Julia', 'Saepta Iulia', 'public', [R(-420, -620, 310, 120, 0)]),
  L('iseum', 'Temple of Isis', 'Iseum Campense', 'temple', [R(-520, -610, 220, 70, 0)]),
  L('mausoleum-augusti', 'Mausoleum of Augustus', 'Mausoleum Augusti', 'temple', [E(-695, -1435, 45, 45)]),
  L('ara-pacis', 'Altar of Peace', 'Ara Pacis Augustae', 'monument', [R(-470, -1170, 12, 11, 0)], { labelMinZoom: 0.9 }),
  L('horologium', 'Sundial of Augustus', 'Horologium Augusti', 'monument', [E(-560, -1195, 6, 6)], { labelMinZoom: 1.3 }),
  // Hills and edges
  L('castra-praetoria', 'Praetorian Camp', 'Castra Praetoria', 'camp', [R(1580, -1430, 440, 380, 30)]),
  L('temple-claudius', 'Temple of Divus Claudius', 'Templum Divi Claudii', 'temple', [R(760, 610, 200, 180, 0)]),
  L('excubitorium', 'Station of the Seventh Cohort', 'Excubitorium Cohortis VII', 'camp', [R(-1200, 880, 40, 30, 0)], { labelMinZoom: 1.2 }),
  L('circus-nero', 'Circus of Gaius and Nero', 'Circus Gai et Neronis', 'arena', [S(-2372, -1053, 540, 90, 90)]),
  L('aesculapius', 'Temple of Aesculapius', 'Aedes Aesculapii', 'temple', [R(-590, 228, 30, 18, 52)], { labelMinZoom: 1.3 }),
  // Gardens (labels come from LABELS)
  L('horti-sallustiani', 'Gardens of Sallust', 'Horti Sallustiani', 'garden', [E(800, -1750, 380, 260, 120)]),
  L('horti-luculliani', 'Gardens of Lucullus', 'Horti Luculliani', 'garden', [E(-150, -1950, 420, 230, 110)]),
  L('horti-maecenatis', 'Gardens of Maecenas', 'Horti Maecenatiani', 'garden', [E(1450, -200, 280, 220, 90)]),
  L('horti-agrippinae', 'Gardens of Agrippina', 'Horti Agrippinae', 'garden', [E(-2300, -950, 420, 300, 90)]),
];

const LABELS: MapLabel[] = [
  { text: 'CAMPVS MARTIVS', x: -850 * K, z: -1000 * K, kind: 'region', angle: -8 },
  { text: 'SVBVRA', x: 560 * K, z: -430 * K, kind: 'region', angle: -38 },
  { text: 'TRANS TIBERIM', x: -1280 * K, z: 640 * K, kind: 'region', angle: -12 },
  { text: 'VELABRVM', x: -190 * K, z: 300 * K, kind: 'region' },
  { text: 'CARINAE', x: 700 * K, z: -170 * K, kind: 'region' },
  { text: 'PALATINE', latin: 'Mons Palatinus', x: 330 * K, z: 380 * K, kind: 'hill' },
  { text: 'CAPITOLINE', latin: 'Mons Capitolinus', x: -300 * K, z: -20 * K, kind: 'hill' },
  { text: 'AVENTINE', latin: 'Mons Aventinus', x: -300 * K, z: 1120 * K, kind: 'hill' },
  { text: 'CAELIAN', latin: 'Mons Caelius', x: 1080 * K, z: 830 * K, kind: 'hill' },
  { text: 'ESQUILINE', latin: 'Mons Esquilinus', x: 1250 * K, z: -340 * K, kind: 'hill' },
  { text: 'VIMINAL', latin: 'Collis Viminalis', x: 1050 * K, z: -880 * K, kind: 'hill', angle: -40 },
  { text: 'QUIRINAL', latin: 'Collis Quirinalis', x: 380 * K, z: -880 * K, kind: 'hill', angle: -42 },
  { text: 'PINCIAN', latin: 'Collis Hortulorum', x: 250 * K, z: -2200 * K, kind: 'hill' },
  { text: 'JANICULUM', latin: 'Mons Ianiculus', x: -1880 * K, z: 380 * K, kind: 'hill', angle: -80 },
  { text: 'VATICAN', latin: 'Mons Vaticanus', x: -2550 * K, z: -1500 * K, kind: 'hill' },
  { text: 'Tiberis', x: -1120 * K, z: -120 * K, kind: 'water', angle: 30 },
  { text: 'Tiberis', x: -980 * K, z: 1420 * K, kind: 'water', angle: -65 },
  { text: 'Horti Sallustiani', x: 820 * K, z: -1760 * K, kind: 'garden' },
  { text: 'Horti Luculliani', x: -180 * K, z: -1880 * K, kind: 'garden' },
  { text: 'Horti Maecenatiani', x: 1470 * K, z: -150 * K, kind: 'garden' },
  { text: 'Horti Agrippinae', x: -2300 * K, z: -900 * K, kind: 'garden' },
];

// ------------------------------------------------------------------ locations

type Loc = [id: string, name: string, latin: string | undefined, x: number, z: number, icon: MapIconKind, discovered: boolean, description: string];
const LOCS: Loc[] = [
  ['forum-romanum', 'Roman Forum', 'Forum Romanum', 60, 70, 'forum', true, 'The heart of Rome: temples, basilicas, the Rostra and the Golden Milestone, from which every road is measured.'],
  ['curia', 'Senate House', 'Curia Iulia', 55, -20, 'palace', true, 'Where the Senate meets — and, these days, mostly agrees with the emperor.'],
  ['tabularium', 'Tabularium', 'Record office', -100, 30, 'landmark', true, 'The state archive. Bronze tablets of laws and treaties line its vaults.'],
  ['capitolium', 'Temple of Jupiter', 'Aedes Iovis Optimi Maximi', -275, 110, 'temple', true, 'Jupiter Best and Greatest, with Juno and Minerva, gilded roof flashing over the city.'],
  ['column-trajan', "Trajan's Column", 'Columna Traiani', -31, -340, 'monument', true, 'Dedicated this very month: a spiral of the Dacian wars, a hundred Roman feet high.'],
  ['forum-traiani', "Trajan's Forum", 'Forum Traiani', 90, -225, 'forum', true, 'The newest and grandest forum, paid for with Dacian gold.'],
  ['markets-trajan', "Trajan's Markets", 'Mercatus Traiani', 160, -300, 'market', true, 'A hillside of shops and offices in brick, climbing the Quirinal.'],
  ['colosseum', 'Flavian Amphitheatre', 'Amphitheatrum Flavium', 622, 285, 'arena', true, 'Fifty thousand seats. Trajan’s Dacian triumph games ran here for 123 days.'],
  ['ludus-magnus', 'Ludus Magnus', 'Gladiatorial school', 810, 255, 'arena', false, 'The great gladiator school, linked to the amphitheatre by a tunnel.'],
  ['circus-maximus', 'Circus Maximus', undefined, 35, 741, 'arena', true, 'Chariot races for a quarter of a million spectators. Greens and Blues, and blood feuds.'],
  ['baths-trajan', 'Baths of Trajan', 'Thermae Traiani', 960, -80, 'baths', false, 'Vast new baths on the Oppian, built over Nero’s Golden House.'],
  ['palace', 'Imperial Palace', 'Domus Augustana', 200, 480, 'palace', true, 'Domitian’s palace on the Palatine, now home to the Optimus Princeps.'],
  ['pantheon', 'Pantheon', 'Pantheum', -643, -647, 'temple', false, 'Struck by lightning and burned three years ago. Trajan’s builders are raising it anew.'],
  ['theatre-marcellus', 'Theatre of Marcellus', 'Theatrum Marcelli', -412, 97, 'theatre', true, 'Augustus’ theatre, named for his nephew. Comedies, mimes and the occasional riot.'],
  ['theatre-pompey', 'Theatre of Pompey', 'Theatrum Pompeii', -960, -300, 'theatre', false, 'Rome’s first stone theatre. Caesar died in the curia of its portico.'],
  ['porticus-minucia', 'Grain Portico', 'Porticus Minucia Frumentaria', -560, -300, 'market', false, 'Where citizens with a grain token collect the monthly dole.'],
  ['popina', 'Popina of the Four Winds', 'Popina IV Ventorum', 520, -380, 'tavern', true, 'Cheap wine, hot sausage and dice under the table. Mind your purse.'],
  ['bakery', 'Bakery of Decimus', 'Pistrinum Decimi', -40, 330, 'shop', true, 'Decimus Attius bakes the best panis quadratus on the Vicus Tuscus.'],
  ['tiber-island', 'Tiber Island', 'Insula Tiberina', -578, 230, 'temple', false, 'Shaped like a ship, sacred to Aesculapius. The sick come here to sleep and dream.'],
  ['pons-sublicius', 'Sublician Bridge', 'Pons Sublicius', -640, 760, 'bridge', false, 'The oldest bridge, built of wood without iron, as the pontiffs require.'],
  ['porta-capena', 'Porta Capena', undefined, 480, 1030, 'gate', true, 'The old gate where the Via Appia begins; the aqueduct above it drips on travelers.'],
  ['porta-esquilina', 'Porta Esquilina', undefined, 1420, -520, 'gate', false, 'Eastern gate of the old wall, toward Tibur and Praeneste.'],
  ['castra-praetoria', 'Praetorian Camp', 'Castra Praetoria', 1580, -1430, 'camp', false, 'Barracks of the Praetorian Guard. Emperors have been made and unmade here.'],
  ['mausoleum-augusti', 'Mausoleum of Augustus', 'Mausoleum Augusti', -695, -1435, 'landmark', false, 'The tomb of the first emperor, crowned with cypresses and his bronze statue.'],
  ['horti-sallustiani', 'Gardens of Sallust', 'Horti Sallustiani', 800, -1750, 'garden', false, 'Imperial pleasure gardens: fountains, statues and shade.'],
  ['emporium', 'Emporium', 'Porticus Aemilia', -820, 1520, 'market', false, 'Wharves and warehouses where the ships from Ostia unload.'],
  ['pyramid', 'Pyramid of Cestius', 'Sepulcrum C. Cesti', -303, 1798, 'landmark', false, 'A magistrate’s tomb in the Egyptian fashion, built in 330 days.'],
  ['excubitorium', 'Station of the Seventh Cohort', 'Excubitorium', -1200, 880, 'camp', false, 'Barracks of the vigiles who fight fires and patrol Trastevere by night.'],
  ['tomb-appia', 'Tomb of the Freedmen', 'Columbarium', 1250, 2300, 'dungeon', false, 'A half-buried columbarium off the Via Appia. People say lamps burn there at night.'],
  ['temple-claudius', 'Temple of Divus Claudius', 'Templum Divi Claudii', 760, 610, 'temple', false, 'A vast terrace on the Caelian, with a fountain-front facing the Palatine.'],
  ['stadium-domitian', 'Stadium of Domitian', 'Stadium Domitiani', -951, -720, 'arena', false, 'Athletic games in the Greek style; foot races and wrestling.'],
  ['forum-boarium', 'Cattle Market', 'Forum Boarium', -330, 380, 'market', true, 'Oxen, sheep and the oldest temples in Rome, by the river harbor.'],
];

// ------------------------------------------------------------------ the source

export interface MockMapHooks {
  player?: () => { x: number; z: number; bearing: number } | null;
  questMarkers?: () => MapQuestMarker[];
}

export class MockMap implements MapDataSource {
  readonly bounds = { minX: -2900 * K, maxX: 2600 * K, minZ: -2700 * K, maxZ: 2300 * K };
  readonly contourInterval = 3 * K;
  readonly rivers = RIVERS;
  readonly islands = ISLANDS;
  readonly roads = ROADS;
  readonly walls = WALLS;
  readonly aqueducts = AQUEDUCTS;
  readonly bridges = BRIDGES;
  readonly landmarks = LANDMARKS;
  readonly labels = LABELS;
  private locs: MapLocation[] = LOCS.map(([id, name, latin, x, z, icon, discovered, description]) => ({ id, name, latin, x: x * K, z: z * K, icon, discovered, description }));

  constructor(private readonly hooks: MockMapHooks = {}) {}

  heightAt(x: number, z: number): number {
    return mockElevation(x / K, z / K) * K;
  }

  locations(): MapLocation[] {
    return this.locs;
  }

  discover(id: string): MapLocation | undefined {
    const l = this.locs.find((x) => x.id === id);
    if (l) l.discovered = true;
    return l;
  }

  player() {
    return this.hooks.player?.() ?? null;
  }

  questMarkers(): MapQuestMarker[] {
    return this.hooks.questMarkers?.() ?? [];
  }
}
