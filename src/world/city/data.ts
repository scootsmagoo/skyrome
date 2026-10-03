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
