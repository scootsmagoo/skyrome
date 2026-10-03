/**
 * Places the v0.1 content refers to (quest objectives, NPC homes, schedules and patrol routes) as
 * LocationDefs, following docs/CONTENT.md §1:
 *
 * - LANDMARKS: atlas landmarks the content names, by atlas id, at the atlas centre. If the world
 *   later registers every atlas landmark itself, those replace these.
 * - CONTRACT SPOTS: the ids the landmark builders expose ('spawn-capena', 'castor-strongroom',
 *   'ludus-arena-center', 'armory'…). The content targets these; their fallback positions here are
 *   the CONTENT.md coordinates of the same places. A spot the world registers later with the same
 *   id replaces the fallback (LocationRegistry.add keeps the last one).
 * - CONTENT.md SPOTS (§1.1–1.3): every other proposed spot the v0.1 content uses, at the bible's
 *   coordinates (real metres → game metres). Where the bible names a place that is also a contract
 *   spot (castor-loculi = castor-strongroom, ludus-cavea = ludus-arena-center…), the bible id is
 *   registered too, as an alias at the same position (CONTRACT_ALIASES).
 * - A few content-only helper areas (the 40 m fight area at the gate, evidence points inside the
 *   leaning insula).
 *
 * Positions are game metres (atlas real metres × WORLD_SCALE). Installed through
 * src/quests/content/places.ts (installRpg registers the `locations` export of every quest module).
 */
import { LANDMARK_BY_ID, ROADS, BRIDGES, ISLANDS, GATES, type Landmark } from '../data/atlas';
import type { LocationDef } from '../npc/types';
import { elevToY, toGame, WORLD_SCALE } from '../world/coords';

type Marker = NonNullable<LocationDef['mapMarker']>;

const MARKER_BY_CATEGORY: Partial<Record<Landmark['category'], Marker>> = {
  temple: 'temple', shrine: 'temple', forum: 'forum', basilica: 'forum', curia: 'forum', monument: 'landmark', column: 'landmark',
  arch: 'landmark', fountain: 'landmark', amphitheatre: 'arena', circus: 'arena', camp: 'arena', gate: 'gate', market: 'market',
  warehouse: 'market', palace: 'palace', house: 'house', prison: 'landmark', portico: 'landmark', baths: 'baths', harbor: 'bridge',
};

/** Horizontal half-extent of an atlas footprint in game metres. */
export function footprintHalf(lm: Landmark): { w: number; d: number } {
  const f = lm.footprint;
  if (f.kind === 'rect') return { w: (f.w / 2) * WORLD_SCALE, d: (f.d / 2) * WORLD_SCALE };
  if (f.kind === 'circle') return { w: f.r * WORLD_SCALE, d: f.r * WORLD_SCALE };
  if (f.kind === 'ellipse') return { w: f.rx * WORLD_SCALE, d: f.rz * WORLD_SCALE };
  let r = 0;
  const [cx, cz] = lm.center;
  for (const [x, z] of f.points) r = Math.max(r, Math.hypot(x - cx, z - cz));
  return { w: r * WORLD_SCALE, d: r * WORLD_SCALE };
}

/** Game-space point at a landmark's facade frame: `forward` along the facade normal, `side` to its right (game m). */
export function atLandmark(id: string, forward = 0, side = 0): { x: number; y: number; z: number } {
  const lm = LANDMARK_BY_ID[id];
  if (!lm) throw new Error(`[content] unknown landmark "${id}"`);
  const [gx, gz] = toGame(lm.center[0], lm.center[1]);
  const th = (lm.rotation * Math.PI) / 180;
  return {
    x: round1(gx + Math.sin(th) * forward + Math.cos(th) * side),
    y: round1(elevToY(lm.baseElevation ?? 13)),
    z: round1(gz - Math.cos(th) * forward + Math.sin(th) * side),
  };
}

/** Game-space point from atlas REAL metres (CONTENT.md §1 coordinates). */
export function atReal(x: number, z: number, elevation = 13): { x: number; y: number; z: number } {
  const [gx, gz] = toGame(x, z);
  return { x: round1(gx), y: round1(elevToY(elevation)), z: round1(gz) };
}

/** A LocationDef for an atlas landmark (radius from its footprint, clamped 8…60 m). */
export function landmarkLocation(id: string, extra: Partial<LocationDef> = {}): LocationDef {
  const lm = LANDMARK_BY_ID[id];
  if (!lm) throw new Error(`[content] unknown landmark "${id}"`);
  const [x, z] = toGame(lm.center[0], lm.center[1]);
  const h = footprintHalf(lm);
  const radius = Math.max(8, Math.min(60, Math.max(h.w, h.d) + 6));
  return {
    id,
    name: lm.name,
    latin: lm.latin,
    position: { x: round1(x), y: round1(elevToY(lm.baseElevation ?? 13)), z: round1(z) },
    radius: Math.round(radius),
    mapMarker: MARKER_BY_CATEGORY[lm.category] ?? 'landmark',
    discoverable: true,
    ...extra,
  };
}

/** A spot at CONTENT.md real coordinates. */
function spot(id: string, name: string, real: [number, number], radius: number, extra: Partial<LocationDef> = {}): LocationDef {
  return { id, name, position: atReal(real[0], real[1]), radius, discoverable: false, ...extra };
}

/** Atlas landmarks the content names (objectives, homes, schedules, patrol routes). */
export const CONTENT_LANDMARK_IDS = [
  'porta-capena', 'circus-maximus', 'arch-titus-circus', 'forum-boarium', 'portus-tiberinus', 'cloaca-maxima-outlet', 'temple-portunus',
  'miliarium-aureum', 'rostra', 'temple-saturn', 'basilica-julia', 'basilica-aemilia', 'curia-julia', 'shrine-venus-cloacina', 'lacus-juturnae',
  'temple-castor-pollux', 'temple-vesta', 'atrium-vestae', 'regia', 'carcer-tullianum', 'horrea-agrippiana', 'horrea-piperataria',
  'arch-titus', 'colossus-sol', 'velia-vestibule', 'porticus-margaritaria', 'meta-sudans', 'colosseum', 'ludus-magnus', 'baths-titus',
  'forum-trajan', 'column-trajan', 'basilica-ulpia', 'equus-traiani', 'domus-augustana', 'castra-peregrina', 'castra-praetoria',
  'statio-vigiles-v', 'temple-aesculapius',
] as const;

/** Landmarks whose trigger radius the content widens (the Golden Milestone stands for the Forum). */
const LANDMARK_OVERRIDES: Record<string, Partial<LocationDef>> = {
  'miliarium-aureum': { radius: 22 },
  'meta-sudans': { radius: 16 },
};

export const LANDMARK_LOCATIONS: LocationDef[] = CONTENT_LANDMARK_IDS.map((id) => landmarkLocation(id, LANDMARK_OVERRIDES[id]));

/** CONTENT.md §1.1 (v0.1) and the §1.2 spots the v0.1 content uses, at the bible's coordinates. */
export const BIBLE_SPOTS: LocationDef[] = [
  // §1.1 — the golden path, vendors, shrines, the v0.1 interiors
  spot('capena-extra', 'Outside the Capena Gate', [523, 974], 8, { parent: 'porta-capena', latin: 'extra Portam Capenam' }),
  spot('fons-mercurii', 'Mercury’s Spring', [488, 968], 4, { parent: 'porta-capena', latin: 'aqua Mercurii', mapMarker: 'landmark', discoverable: true }),
  spot('temple-mercury', 'Temple of Mercury', [232, 978], 12, { latin: 'Aedes Mercurii', mapMarker: 'temple', discoverable: true }),
  spot('compitum-capenae', 'Crossroads Shrine by the Capena Gate', [470, 915], 3, { mapMarker: 'temple', discoverable: true }),
  spot('compitum-circi', 'Crossroads Shrine below the Palatine', [300, 755], 3, { mapMarker: 'temple', discoverable: true }),
  spot('astrologi-circi', 'Astrologers’ Arcade', [200, 690], 10, { parent: 'circus-maximus', latin: 'sub arcubus Circi', mapMarker: 'shop', discoverable: true }),
  spot('caupona-carcerum', 'The Inn at the Starting Gates', [-175, 520], 6, { mapMarker: 'tavern', discoverable: true }),
  spot('popina-vici-tusci', 'The Silver Pig', [2, 215], 6, { latin: 'Ad Porcum Argenteum', mapMarker: 'tavern', discoverable: true }),
  spot('seplasia-vici-tusci', 'Fadia’s Perfumery', [18, 178], 4, { mapMarker: 'shop', discoverable: true }),
  spot('taberna-collapsa', 'The Burned Taberna', [-8, 262], 4, { mapMarker: 'dungeon', discoverable: true }),
  spot('taberna-collapsa-puteus', 'Light well of the burned taberna', [-20, 275], 3, { parent: 'taberna-collapsa' }),
  spot('compitum-vici-tusci', 'Crossroads Shrine of the Vicus Tuscus', [-33, 290], 3, { mapMarker: 'temple', discoverable: true }),
  spot('signum-vortumni', 'Statue of Vortumnus', [92, 64], 3, { latin: 'signum Vortumni', mapMarker: 'temple', discoverable: true }),
  spot('castor-loculi', 'Strongrooms of Castor', [88, 98], 5, { parent: 'temple-castor-pollux', latin: 'loculi aedis Castoris', discoverable: true }),
  spot('tabernae-aemiliae', 'Shops of the Basilica Paulli', [135, 12], 8, { parent: 'basilica-aemilia', latin: 'tabernae', mapMarker: 'market' }),
  spot('basilica-julia-gradus', 'Steps of the Basilica Julia', [44, 44], 10, { parent: 'basilica-julia' }),
  spot('cloaca-grate-aemiliae', 'Drain Grate by the Basilica Paulli', [118, 22], 3),
  spot('taberna-armorum', 'Euhodus’ Arms Shop', [478, 268], 6, { latin: 'arma venalia', mapMarker: 'shop', discoverable: true }),
  spot('compitum-acili', 'Crossroads Shrine of Acilius', [455, 125], 3, { latin: 'Compitum Acili', mapMarker: 'temple', discoverable: true }),
  spot('lacus-metae', 'Basin by the Meta Sudans', [530, 262], 3, { parent: 'meta-sudans' }),
  spot('ludus-cavea', 'Practice Arena of the Ludus Magnus', [875, 285], 22, { parent: 'ludus-magnus', mapMarker: 'arena' }),
  spot('ludus-armamentarium', 'Ludus Armory', [834, 297], 5, { parent: 'ludus-magnus' }),
  spot('ludus-saniarium', 'Ludus Infirmary', [916, 273], 5, { parent: 'ludus-magnus', latin: 'saniarium' }),
  spot('ludus-cellae', 'Ludus Barracks', [885, 257], 8, { parent: 'ludus-magnus' }),
  spot('lectica-statio-forum', 'Litter Stand (Forum)', [62, 32], 4),
  spot('lectica-statio-capena', 'Litter Stand (Capena Gate)', [492, 930], 4),
  spot('lectica-statio-metae', 'Litter Stand (Meta Sudans)', [540, 300], 4),
  spot('statio-cohortium-urbanarum', 'Post of the Urban Cohorts', [30, -62], 6, { mapMarker: 'camp', discoverable: true }),
  // §1.2 — used by v0.1 people and quests (and the three ids src/rpg/data already references)
  spot('insula-mariorum', 'Insula of the Marii', [-82, 345], 8, { mapMarker: 'house', discoverable: true }),
  spot('insula-nutans', 'The Leaning Insula', [-42, 352], 8, { latin: 'Insula Nutans', mapMarker: 'house', discoverable: true }),
  spot('insula-tuccii', 'Insula of Tuccius the Cooper', [-55, 420], 8, { mapMarker: 'house' }),
  spot('excubitorium-velabri', 'Watch Post of the Vigiles, Velabrum', [-110, 300], 6, { latin: 'Excubitorium', mapMarker: 'camp', discoverable: true }),
  spot('compitum-velabri', 'Crossroads Shrine of the Velabrum', [-125, 355], 3, { mapMarker: 'temple', discoverable: true }),
  spot('lacus-velabri', 'Velabrum Basin', [-140, 375], 3),
  spot('fullonica-velabri', 'Fullery of the Velabrum', [-150, 320], 5, { latin: 'Fullonica', mapMarker: 'shop', discoverable: true }),
  spot('pistrinum-velabri', 'Bakery of the Velabrum', [-95, 395], 5, { latin: 'Pistrinum', mapMarker: 'shop', discoverable: true }),
  spot('officina-columnae', 'Carvers’ Hut at the Column', [-18, -366], 5, { parent: 'column-trajan' }),
  spot('taberna-vestiarii', 'Clothier in the Horrea Agrippiana', [28, 205], 4, { parent: 'horrea-agrippiana', mapMarker: 'shop', discoverable: true }),
  spot('domus-vettii', 'House of Sex. Vettius Crispinus', [545, -30], 10, { mapMarker: 'house', discoverable: true }),
  spot('fullonica-suburana', 'The Fullery off the Clivus Suburanus', [620, -250], 6),
  spot('stabula-factionum', 'Stables of the Circus Factions', [-1040, -470], 25, { latin: 'stabula IIII factionum', mapMarker: 'camp', discoverable: true }),
];

/** CONTENT.md §1.3: features from other atlas arrays registered as places (roads at their midpoint). */
function featureLocations(): LocationDef[] {
  const out: LocationDef[] = [];
  const mid = (pts: readonly (readonly [number, number])[]) => pts[Math.floor(pts.length / 2)];
  // Roads are corridors; a circle at the middle vertex is the closest a LocationDef can come.
  for (const id of ['vicus-tuscus', 'street-north-of-circus', 'clivus-victoriae', 'gradus-monetae']) {
    const r = ROADS.find((x) => x.id === id);
    if (r?.points.length) out.push(spot(id, r.name, [mid(r.points)[0], mid(r.points)[1]], 18, { latin: r.latin }));
  }
  for (const id of ['pons-sublicius', 'pons-aemilius']) {
    const b = BRIDGES.find((x) => x.id === id);
    if (b) out.push(spot(id, b.name, [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2], id === 'pons-sublicius' ? 35 : 45, { latin: b.latin, mapMarker: 'bridge', discoverable: true }));
  }
  const isle = ISLANDS.find((x) => x.id === 'insula-tiberina');
  if (isle) {
    const c = isle.outline.reduce((s, [x, z]) => [s[0] + x / isle.outline.length, s[1] + z / isle.outline.length], [0, 0]);
    out.push(spot('insula-tiberina', isle.name, [c[0], c[1]], 60, { mapMarker: 'landmark', discoverable: true }));
  }
  const gate = GATES.find((g) => g.id === 'porta-lavernalis');
  if (gate) out.push(spot('porta-lavernalis', gate.name, [gate.at[0], gate.at[1]], 8, { mapMarker: 'gate' }));
  return out;
}

export const FEATURE_LOCATIONS: LocationDef[] = featureLocations();

/** Spot ids the landmark builders are asked to expose (the content contract). */
export const CONTRACT_SPOT_IDS = ['spawn-capena', 'night-cart', 'courier-ambush', 'castor-strongroom', 'ludus-gate', 'ludus-arena-center', 'lanista', 'armory', 'medicus'] as const;

/** Contract spot → the CONTENT.md id of the same place (both are registered, at the same position). */
export const CONTRACT_ALIASES: Record<(typeof CONTRACT_SPOT_IDS)[number], string | null> = {
  'spawn-capena': 'capena-extra', // the new-game spawn: the cart stand 25 m outside the gate
  'night-cart': 'capena-extra', // Dromo's cart (prop-plaustrum-dromonis)
  'courier-ambush': null, // under the arch of the porta-capena (the bible's "within 6 m of the arch")
  'castor-strongroom': 'castor-loculi',
  'ludus-gate': null, // the gate on the Ludus' WNW facade
  'ludus-arena-center': 'ludus-cavea',
  lanista: 'ludus-cellae', // the procurator's office in the barracks block
  armory: 'ludus-armamentarium',
  medicus: 'ludus-saniarium',
};

const bible = (id: string) => BIBLE_SPOTS.find((s) => s.id === id)!;
function alias(id: string, of: string, radius?: number, extra: Partial<LocationDef> = {}): LocationDef {
  const b = bible(of);
  return { ...b, id, radius: radius ?? b.radius, discoverable: false, mapMarker: undefined, ...extra };
}

export const CONTRACT_SPOTS: LocationDef[] = [
  alias('spawn-capena', 'capena-extra', 8, { name: 'Outside the Capena Gate (the night cart)' }),
  alias('night-cart', 'capena-extra', 5, { name: 'Dromo’s cart' }),
  { id: 'courier-ambush', name: 'Under the dripping arch', position: atReal(507, 955), radius: 6, parent: 'porta-capena' },
  alias('castor-strongroom', 'castor-loculi', 5, { name: 'Strongrooms of Castor' }),
  { id: 'ludus-gate', name: 'Gate of the Ludus Magnus', position: atLandmark('ludus-magnus', 35, 0), radius: 6, parent: 'ludus-magnus' },
  alias('ludus-arena-center', 'ludus-cavea', 22),
  alias('lanista', 'ludus-cellae', 5, { name: 'The procurator’s office' }),
  alias('armory', 'ludus-armamentarium', 5),
  alias('medicus', 'ludus-saniarium', 5),
];

/** Helper areas only the content uses. */
export const CONTENT_SPOTS: LocationDef[] = [
  // mq-01: "If the player runs more than 40 m away, the grassatores give up" (CONTENT.md §3.1.1).
  { id: 'capena-fight-area', name: 'Around the Capena Gate', position: atReal(507, 955), radius: 40, parent: 'porta-capena' },
  // misc-insula-nutans: evidence points inside the leaning insula (child spots, CONTENT.md §3.3.3).
  spot('insula-nutans-taberna', 'Ground-floor wall behind the taberna', [-38, 350], 2.5, { parent: 'insula-nutans' }),
  spot('insula-nutans-scalae', 'The propped stair', [-44, 356], 2.5, { parent: 'insula-nutans' }),
  spot('insula-nutans-tectum', 'Top floor of the leaning insula', [-42, 354], 2.5, { parent: 'insula-nutans' }),
  spot('insula-nutans-cenaculum', 'Iulia Prima’s flat', [-46, 349], 2.5, { parent: 'insula-nutans' }),
];

/** Every location the content installs. */
export const CONTENT_LOCATIONS: LocationDef[] = [...LANDMARK_LOCATIONS, ...BIBLE_SPOTS, ...FEATURE_LOCATIONS, ...CONTRACT_SPOTS, ...CONTENT_SPOTS];

const KNOWN = new Set(CONTENT_LOCATIONS.map((l) => l.id));

/** Every id content may target: content locations plus any atlas landmark. */
export function isKnownPlace(id: string): boolean {
  return KNOWN.has(id) || !!LANDMARK_BY_ID[id];
}

/**
 * Keep the bible aliases on top of the world's spots: once the world has registered a contract
 * spot (castor-strongroom, ludus-arena-center…), copy its position to the CONTENT.md id of the same
 * place. Call after the world's spots are in `game.locations`.
 */
export function syncAliases(locations: { get(id: string): LocationDef | undefined; add(d: LocationDef): void }) {
  for (const [contract, bibleId] of Object.entries(CONTRACT_ALIASES)) {
    const world = locations.get(contract);
    const b = bibleId ? locations.get(bibleId) : undefined;
    if (world && b && (world.position.x !== b.position.x || world.position.z !== b.position.z)) locations.add({ ...b, position: { ...world.position } });
  }
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
}
