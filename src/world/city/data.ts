/**
 * City-specific data that is not in the atlas: local quarter character (overrides of the Augustan
 * regions' density / wealth), open spaces that must stay free of insulae, the landmarks whose
 * sightlines keep nearby blocks low, and which atlas landmarks are district markers rather than
 * buildings. All coordinates are REAL meters (atlas frame).
 */
import type { P2 } from '../terrain/heightmap';

export interface Quarter {
  id: string;
  /** Polygon (real m) or a circle. */
  polygon?: readonly P2[];
  center?: P2;
  r?: number;
  density?: number;
  wealth?: number;
  /** Max storeys of insulae (Trajan's 60-foot limit allows 5–6). */
  maxStoreys?: number;
  horrea?: boolean;
  /** Yard surface. */
  yard?: 'dirt' | 'cobbles' | 'gravel';
}

/**
 * Quarters with a character of their own (sources: docs/research/topography-terrain.md §8,
 * society.md; the Augustan regions are too coarse for these).
 */
export const QUARTERS: Quarter[] = [
  // The Subura: the densest, noisiest tenements of the city (atlas district polygon).
  {
    id: 'subura', density: 0.97, wealth: 0.15, maxStoreys: 6, yard: 'dirt',
    polygon: [[200, -200], [330, -130], [520, -200], [700, -260], [760, -380], [900, -620], [820, -660], [640, -450], [520, -560], [380, -480], [250, -360]],
  },
  // The Carinae: old aristocratic houses on the Oppian's west slope.
  { id: 'carinae', center: [600, -30], r: 140, density: 0.55, wealth: 0.85, maxStoreys: 4, yard: 'gravel' },
  // Velabrum and the Vicus Tuscus: shops, warehouses (Horrea Agrippiana), oil and grain dealers.
  { id: 'velabrum', center: [-70, 330], r: 150, density: 0.9, wealth: 0.5, horrea: true, yard: 'cobbles' },
  // Argiletum backstreets: booksellers and cobblers.
  { id: 'argiletum', center: [330, -170], r: 110, density: 0.95, wealth: 0.35, maxStoreys: 6, yard: 'dirt' },
  // Riverside below the Aventine and the Emporium: warehouses and dockers.
  { id: 'emporium', center: [-780, 1250], r: 420, density: 0.8, wealth: 0.25, horrea: true, yard: 'dirt' },
  { id: 'portus', center: [-380, 300], r: 120, density: 0.85, wealth: 0.35, horrea: true, yard: 'cobbles' },
  // The Janiculum's lower slope: garden villas and vineyards above Transtiberim, not tenements.
  { id: 'janiculum-villas', center: [-1470, 480], r: 260, density: 0.35, wealth: 0.65, maxStoreys: 3, yard: 'gravel' },
  // Transtiberim: the multi-ethnic port quarter of tanners, potters, millers and sailors.
  { id: 'transtiberim', center: [-860, 560], r: 420, density: 0.85, wealth: 0.3, maxStoreys: 5, yard: 'dirt' },
  // Aventine top: aristocrats and old temples (Trajan's own house).
  { id: 'aventine', center: [-180, 1020], r: 300, density: 0.55, wealth: 0.8, maxStoreys: 4, yard: 'gravel' },
  // Caelian: quiet, wealthy, domus with gardens.
  { id: 'caelian', center: [950, 700], r: 380, density: 0.5, wealth: 0.85, maxStoreys: 4, yard: 'gravel' },
  // Transtiberim riverside: tanners, potters, sailors; dense.
  { id: 'transtiberim', center: [-850, 500], r: 450, density: 0.9, wealth: 0.3, maxStoreys: 6, yard: 'dirt' },
  // Campus Martius insulae in the river bend.
  { id: 'campus-bend', center: [-1150, -350], r: 380, density: 0.85, wealth: 0.4, yard: 'cobbles' },
];

/**
 * Open spaces with no insulae (polygons in REAL m): the Forum basin and the open ground of the
 * imperial fora. Landmarks stand inside them; the rest is paving for the landmark crews.
 */
export const OPEN_SPACES: { id: string; kind: 'plaza' | 'grove'; polygon: readonly P2[] }[] = [
  { id: 'forum-romanum', kind: 'plaza', polygon: [[-30, -40], [60, -75], [150, -40], [250, 40], [330, 150], [250, 180], [150, 150], [60, 150], [0, 90], [-40, 40]] },
  { id: 'trajan-forum', kind: 'plaza', polygon: [[-60, -430], [90, -470], [200, -330], [150, -230], [20, -200], [-80, -290]] },
  // Area Capitolina and the Arx: temple precincts and the sacred groves ("inter duos lucos").
  { id: 'area-capitolina', kind: 'grove', polygon: [[-250, 120], [-220, 140], [-160, 125], [-125, 90], [-115, 50], [-120, 30], [-150, 20], [-175, -5], [-215, -12], [-245, 10], [-252, 45]] },
  { id: 'arx', kind: 'grove', polygon: [[-35, -180], [-60, -215], [-90, -220], [-120, -205], [-140, -160], [-130, -140], [-90, -95], [-60, -105], [-45, -120]] },
  // The Janiculum crest round the Aqua Traiana's castellum and the head of the mill race: pines,
  // cypresses and open ground, the city spread out below.
  { id: 'janiculum-crest', kind: 'grove', polygon: [[-1780, 330], [-1700, 300], [-1600, 330], [-1560, 420], [-1580, 520], [-1660, 560], [-1760, 530], [-1800, 430]] },
];

/** Atlas landmarks that are district anchors (areas full of ordinary houses), not buildings. */
export const DISTRICT_LANDMARKS = new Set(['subura', 'jewish-transtiberim']);

/** Atlas landmarks whose ground stays wild / wooded rather than paved. */
export const WILD_LANDMARKS = new Set(['tarpeian-rock', 'asylum', 'monte-testaccio', 'vatican-necropolis', 'lucus-furrinae', 'camenae-grove', 'adonaea']);

/**
 * Landmarks whose sightlines must survive (GDD §12.3): within 150 game m, blocks stay 2–4 storeys.
 * Every priority-1 landmark taller than 20 m (real) also counts.
 */
export const SIGHTLINE_LANDMARKS = new Set([
  'temple-jupiter-capitolinus', 'colosseum', 'column-trajan', 'colossus-sol', 'domus-augustana', 'basilica-ulpia', 'circus-maximus',
]);

/** GDD §12.3 radius (game m) around a major landmark inside which blocks stay ≤ 4 storeys. */
export const SIGHTLINE_RADIUS = 150;

/** Aqueducts left out on purpose (GDD E1: no Janiculum water-mills in 113). */
export const SKIPPED_AQUEDUCTS = new Set(['janiculum-mill-race']);

/**
 * Streets the city adds where the atlas has a gap the game needs (REAL meters, atlas Road shape).
 * The atlas ends the Via Appia at the Porta Capena and starts the valley roads ~150 m inside it,
 * so nothing led from the gate (the spawn) into the city: the road through the gate forks to the
 * street under the Palatine (N side of the Circus, and the triumphal road to the Colosseum) and to
 * the street under the Aventine (S side of the Circus).
 */
export const EXTRA_ROADS: { id: string; name: string; kind: 'via' | 'clivus' | 'vicus' | 'street'; width: number; paving: 'basalt' | 'gravel' | 'dirt'; points: readonly P2[] }[] = [
  { id: 'porta-capena-intra', name: 'Road inside the Porta Capena', kind: 'street', width: 8, paving: 'basalt', points: [[507, 955], [472, 912], [436, 868], [410, 835]] },
  { id: 'porta-capena-circus-south', name: 'Road from the Porta Capena to the Aventine side of the Circus', kind: 'street', width: 5, paving: 'basalt', points: [[472, 912], [420, 940], [370, 968], [330, 990]] },
];

/**
 * The golden path (GDD §17.2: Porta Capena → Circus valley → Velabrum → Vicus Tuscus → Forum)
 * and the Via Appia outside the gate where the player spawns. Blocks within `r` (real m) of these
 * lines are always built (no garden lots), packed with shops, and dressed with more lamps, stalls
 * and street furniture: the first minutes of the game must never cross empty ground.
 */
export const CORRIDORS: { id: string; points: readonly P2[]; r: number; density: number; wealth: number }[] = [
  { id: 'via-appia-suburb', points: [[507, 955], [560, 1030], [620, 1110], [700, 1185]], r: 70, density: 0.92, wealth: 0.35 },
  { id: 'capena-valley', points: [[507, 955], [472, 912], [436, 868], [406, 840], [156, 657], [-96, 471], [-180, 398]], r: 75, density: 0.95, wealth: 0.45 },
  { id: 'circus-south', points: [[472, 912], [370, 968], [330, 990], [239, 949], [119, 855], [-1, 773], [-70, 703], [-150, 640]], r: 60, density: 0.9, wealth: 0.4 },
  { id: 'velabrum-tuscus', points: [[-150, 560], [-73, 452], [-45, 311], [45, 140], [66, 131], [97, 62]], r: 75, density: 0.95, wealth: 0.5 },
  { id: 'velabrum-pons-aemilius', points: [[-60, 380], [-150, 368], [-260, 362], [-340, 352]], r: 55, density: 0.92, wealth: 0.45 },
  { id: 'triumphal-road', points: [[410, 835], [490, 459], [501, 432], [512, 330]], r: 55, density: 0.85, wealth: 0.5 },
];
