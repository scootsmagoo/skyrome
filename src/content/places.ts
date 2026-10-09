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
import { beforeName, displayLatin, displayName } from '../game/locations';
import { frontOf, pushOutOfFootprints } from './ground';
import { onPath } from './route';

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

/**
 * Atlas real metres on the line of an atlas road at real z (the roads here run north to south, so z
 * is single-valued), `west` metres toward −x. Open street by construction: nothing is ever built on
 * the road itself, whatever stands beside it.
 */
function onRoad(roadId: string, z: number, west = 0): [number, number] {
  const pts = ROADS.find((r) => r.id === roadId)?.points;
  if (!pts?.length) throw new Error(`[content] unknown road "${roadId}"`);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[i + 1];
    if (z >= Math.min(z0, z1) && z <= Math.max(z0, z1)) return [x0 + ((x1 - x0) * (z - z0)) / (z1 - z0 || 1) - west, z];
  }
  throw new Error(`[content] z = ${z} is off the road "${roadId}"`);
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
    name: displayName(lm.name),
    latin: displayLatin(lm.latin, displayName(lm.name)),
    position: { x: round1(x), y: round1(elevToY(lm.baseElevation ?? 13)), z: round1(z) },
    radius: Math.round(radius),
    mapMarker: MARKER_BY_CATEGORY[lm.category] ?? 'landmark',
    discoverable: true,
    ...extra,
  };
}

/**
 * A spot at CONTENT.md real coordinates. A spot the bible puts inside a building the world builds
 * as solid masonry (the strongrooms in Castor's podium, the steps of the Basilica Julia) stands at
 * the edge of it instead, on the side the bible names, until the building has an inside.
 */
function spot(id: string, name: string, real: [number, number], radius: number, extra: Partial<LocationDef> = {}): LocationDef {
  const p = atReal(real[0], real[1]);
  const out = pushOutOfFootprints(p.x, p.z);
  return { id, name, position: { x: out.x, y: p.y, z: out.z }, radius, discoverable: false, ...extra };
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
  // Martial's bookseller Tryphon (4.72, 13.3), by the statue of Vertumnus at the Forum end (mq-03).
  spot('taberna-tryphonis', 'Tryphon’s Bookshop', [24, 160], 4, { latin: 'Taberna Tryphonis', mapMarker: 'shop', discoverable: true }),
  spot('taberna-collapsa', 'The Burned Taberna', [-8, 262], 4, { mapMarker: 'dungeon', discoverable: true }),
  spot('taberna-collapsa-puteus', 'Light well of the burned taberna', [-20, 275], 3, { parent: 'taberna-collapsa' }),
  spot('compitum-vici-tusci', 'Crossroads Shrine of the Vicus Tuscus', [-33, 290], 3, { mapMarker: 'temple', discoverable: true }),
  spot('signum-vortumni', 'Statue of Vortumnus', [92, 64], 3, { latin: 'signum Vortumni', mapMarker: 'temple', discoverable: true }),
  // The deposit vaults (the bible: 88, 98, which falls on the built podium, 4.2 m up): the fallback is the Forum
  // builder's own `castor-strongroom`, 1.2 m in front of the barred door in the podium's W flank, on the paving of
  // the Vicus Tuscus (forum-temples.ts), so the quest and the people at the vaults stand in the street.
  { id: 'castor-loculi', name: 'Strongrooms of Castor', position: atLandmark('temple-castor-pollux', -0.1, -10.7), radius: 5, discoverable: true, parent: 'temple-castor-pollux', latin: 'loculi aedis Castoris' },
  spot('tabernae-aemiliae', 'Shops of the Basilica Paulli', [135, 12], 8, { parent: 'basilica-aemilia', latin: 'tabernae', mapMarker: 'market' }),
  spot('basilica-julia-gradus', 'Steps of the Basilica Julia', [44, 44], 10, { parent: 'basilica-julia' }),
  spot('cloaca-grate-aemiliae', 'Drain Grate by the Basilica Paulli', [118, 22], 3),
  spot('taberna-armorum', 'Euhodus’ Arms Shop', [478, 268], 6, { latin: 'arma venalia', mapMarker: 'shop', discoverable: true }),
  spot('compitum-acili', 'Crossroads Shrine of Acilius', [455, 125], 3, { latin: 'Compitum Acili', mapMarker: 'temple', discoverable: true }),
  spot('lacus-metae', 'Basin by the Meta Sudans', [530, 262], 3, { parent: 'meta-sudans' }),
  spot('ludus-cavea', 'Practice Arena of the Ludus Magnus', [875, 285], 22, { parent: 'ludus-magnus', mapMarker: 'arena' }),
  spot('ludus-armamentarium', 'Ludus Armory', [834, 297], 5, { parent: 'ludus-magnus' }),
  spot('ludus-saniarium', 'Ludus Infirmary', [916, 273], 5, { parent: 'ludus-magnus', latin: 'saniarium' }),
  // The barracks (CONTENT.md has them at 885, 257): the built school has its stands there (4.8 m up),
  // so the fallback is the Ludus Magnus builder's own `ludus-cellae`, under the back portico of the court.
  { id: 'ludus-cellae', name: 'Ludus Barracks', position: atLandmark('ludus-magnus', -27.6, -6.5), radius: 8, discoverable: false, parent: 'ludus-magnus' },
  spot('lectica-statio-forum', 'Litter Stand at the Forum', [62, 32], 4),
  spot('lectica-statio-capena', 'Litter Stand at the Capena Gate', [492, 930], 4),
  spot('lectica-statio-metae', 'Litter Stand at the Meta Sudans', [540, 300], 4),
  spot('statio-cohortium-urbanarum', 'Post of the Urban Cohorts', [30, -62], 6, { mapMarker: 'camp', discoverable: true }),
  // §1.2 — used by v0.1 people and quests (and the three ids src/rpg/data already references)
  spot('insula-mariorum', 'Insula of the Marii', [-82, 345], 8, { mapMarker: 'house', discoverable: true }),
  // The bible puts the Leaning Insula (-42, 352) and Tuccius' house (-55, 420) beside the Vicus Tuscus,
  // on the lots the Lupercal's row of blocks now stands on: the builder's spots (WORLD_SPOTS below) are
  // their real places. These fallbacks, for a world without that row, are on the street in front of them.
  spot('insula-nutans', 'The Leaning Insula', onRoad('vicus-tuscus', 352), 8, { latin: 'Insula Nutans', mapMarker: 'house', discoverable: true }),
  spot('insula-tuccii', 'Insula of Tuccius the Cooper', onRoad('vicus-tuscus', 420), 8, { mapMarker: 'house' }),
  spot('excubitorium-velabri', 'Watch Post of the Vigiles, Velabrum', [-110, 300], 6, { latin: 'Excubitorium', mapMarker: 'camp', discoverable: true }),
  spot('compitum-velabri', 'Crossroads Shrine of the Velabrum', [-125, 355], 3, { mapMarker: 'temple', discoverable: true }),
  spot('compitum-boarii', 'Crossroads Shrine of the Cattle Market', [-215, 445], 3, { parent: 'forum-boarium', mapMarker: 'temple', discoverable: true }),
  spot('lacus-velabri', 'Velabrum Basin', [-140, 375], 3),
  spot('fullonica-velabri', 'Fullery of the Velabrum', [-150, 320], 5, { latin: 'Fullonica', mapMarker: 'shop', discoverable: true }),
  spot('pistrinum-velabri', 'Bakery of the Velabrum', [-95, 395], 5, { latin: 'Pistrinum', mapMarker: 'shop', discoverable: true }),
  spot('officina-columnae', 'Carvers’ Hut at the Column', [-18, -366], 5, { parent: 'column-trajan' }),
  // The bible's (28, 205) is in the Horrea's flank, where the Forum builder now has its row of tabernae on the Vicus
  // Tuscus; the clothier's is the first (textile) one, and the fallback is its own `horrea-agrippiana-taberna-0`: the
  // shopkeeper's place on the raised floor of the shop, open to the walk.
  { id: 'taberna-vestiarii', name: 'Clothier in the Horrea Agrippiana', position: atLandmark('horrea-agrippiana', -14.4, -15.8), radius: 4, discoverable: true, parent: 'horrea-agrippiana', mapMarker: 'shop' },
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
  'spawn-capena': null, // the new-game spawn (the flow reads the Porta Capena builder's spot)
  'night-cart': 'capena-extra', // Dromo's cart, the bible's cart stand outside the gate
  'courier-ambush': null, // under the arch of the porta-capena (the bible's "within 6 m of the arch")
  'castor-strongroom': 'castor-loculi',
  'ludus-gate': null, // the gate on the Ludus' WNW facade
  'ludus-arena-center': 'ludus-cavea',
  lanista: null, // the procurator's office in the front range; the barracks (`ludus-cellae`) are a place of their own
  armory: 'ludus-armamentarium',
  medicus: 'ludus-saniarium',
};

const bible = (id: string) => BIBLE_SPOTS.find((s) => s.id === id)!;
function alias(id: string, of: string, radius?: number, extra: Partial<LocationDef> = {}): LocationDef {
  const b = bible(of);
  return { ...b, id, radius: radius ?? b.radius, discoverable: false, mapMarker: undefined, ...extra };
}

/**
 * The opening scene until the Porta Capena has a builder with a passage (its spots then replace
 * these: see mirrorLandmarkSpots). The fallback gate is a solid block, and the flow puts the player
 * `SPAWN_INSIDE` (10 m) inside it on the city side, facing down the Circus valley
 * (src/game/GameFlow.ts). So the night cart stands there, beside the player, and the knife-men wait
 * a dozen metres further down the street: everything happens in front of the player, on open
 * ground, and nothing stands in or on the gate. Gate frame: `forward` along the façade normal
 * (the city side is negative), `side` along the façade (positive is the walker's left).
 *
 * The cart, its driver and Festus stand on the road itself (|side| < 2 m): the Porta Capena builder's
 * quarter inside the gate lines that street with shops and houses from 3.5 m either side, and a cart
 * a little further out, where the open ground of the solid-gate world was, would be inside one of them.
 */
export const CAPENA_FALLBACK_SPAWN = 10;
const gate = (forward: number, side: number) => atLandmark('porta-capena', forward, side);
export const OPENING_SPOTS: LocationDef[] = [
  { id: 'spawn-capena', name: 'Inside the Capena Gate, by the night cart', position: gate(-CAPENA_FALLBACK_SPAWN, 0), radius: 6, parent: 'porta-capena' },
  { id: 'night-cart', name: 'Dromo’s cart', position: gate(-14.5, -0.9), radius: 5, parent: 'porta-capena' },
  { id: 'night-cart-driver', name: 'Beside Dromo’s cart', position: gate(-14.5, 1.1), radius: 1.5, parent: 'porta-capena' },
  { id: 'night-cart-courier', name: 'Where Festus waits by the cart', position: gate(-12.4, 1.9), radius: 1.5, parent: 'porta-capena' },
  { id: 'courier-ambush', name: 'Below the dripping arch', position: gate(-23, -2.5), radius: 5, parent: 'porta-capena' },
  { id: 'capena-grassator-a', name: 'Where the first knife-man waits', position: gate(-26.5, -4.5), radius: 2, parent: 'porta-capena' },
  { id: 'capena-grassator-b', name: 'Where the second knife-man waits', position: gate(-21, 1.5), radius: 2, parent: 'porta-capena' },
];
const opening = (id: string) => OPENING_SPOTS.find((s) => s.id === id)!;

export const CONTRACT_SPOTS: LocationDef[] = [
  ...OPENING_SPOTS.filter((s) => (CONTRACT_SPOT_IDS as readonly string[]).includes(s.id)),
  alias('castor-strongroom', 'castor-loculi', 5, { name: 'Strongrooms of Castor' }),
  { id: 'ludus-gate', name: 'Gate of the Ludus Magnus', position: atLandmark('ludus-magnus', 35, 0), radius: 6, parent: 'ludus-magnus' },
  alias('ludus-arena-center', 'ludus-cavea', 22),
  // The office: a room in the front range at street level (the builder's own `lanista`).
  { id: 'lanista', name: 'The procurator’s office', position: atLandmark('ludus-magnus', 31.7, 8.2), radius: 5, parent: 'ludus-magnus' },
  alias('armory', 'ludus-armamentarium', 5),
  alias('medicus', 'ludus-saniarium', 5),
];

/**
 * Door-side spots of buildings the content's people visit (`<landmark>:front`): 2.5 m in front of
 * the façade. Until interiors exist the aedituus waits on Castor's steps, the bankers by the
 * Basilica Paulli's door and the Vestal before her house, instead of on a roof or a podium (where a
 * schedule at the building's centre would put them).
 */
export const FRONT_LANDMARK_IDS = [
  'temple-castor-pollux', 'basilica-aemilia', 'basilica-ulpia', 'curia-julia', 'domus-augustana', 'atrium-vestae', 'temple-vesta', 'rostra',
  'meta-sudans', 'colossus-sol', 'column-trajan', 'shrine-venus-cloacina', 'arch-titus', 'baths-titus',
] as const;

/** The `:front` spot id of a building. */
export const front = (id: (typeof FRONT_LANDMARK_IDS)[number]) => `${id}:front`;

/**
 * Buildings whose façade is reached by a stair or a porch: `:front` is beyond its foot, on the paving, not 2.5 m from
 * the wall (the Curia's Chalcidicum and nine marble steps, 1.7 m up). Metres beyond the footprint's edge; the Forum
 * builder's `curia-forecourt` is the same place (WORLD_SPOTS).
 */
const FRONT_OUT: Partial<Record<(typeof FRONT_LANDMARK_IDS)[number], number>> = { 'curia-julia': 7.4 };

export const FRONT_SPOTS: LocationDef[] = FRONT_LANDMARK_IDS.map((id) => {
  const lm = LANDMARK_BY_ID[id];
  const f = frontOf(lm, FRONT_OUT[id] ?? 2.5);
  const out = pushOutOfFootprints(f.x, f.z);
  return { id: `${id}:front`, name: beforeName(lm.name), position: { x: out.x, y: round1(elevToY(lm.baseElevation ?? 13)), z: out.z }, radius: 4, parent: id, discoverable: false };
});

/**
 * Street stations on the golden path (GDD §17.2, the owner's "bland corridor" feedback): the places
 * where the dawn shift stands, from the gate to the Velabrum. Distances are real metres along
 * src/content/route.ts, sides real metres to the right of the walking direction (the Circus is on
 * the left). The ids are what src/npc/content/corridor.ts schedules refer to. [G] positions.
 */
function onRoute(id: string, name: string, d: number, side: number, radius: number, extra: Partial<LocationDef> = {}): LocationDef {
  const [x, z] = onPath(d, side);
  return { id, name, position: atReal(x, z), radius, discoverable: false, ...extra };
}

export const STREET_SPOTS: LocationDef[] = [
  onRoute('capena-intus', 'Inside the Capena Gate', 34, 4, 5, { parent: 'porta-capena' }),
  onRoute('capena-statio', 'Gate post of the Capena Gate', 60, -5, 5, { parent: 'porta-capena' }),
  onRoute('via-scopator', 'The Street below the Palatine, sweepers\u2019 corner', 110, 3, 6),
  onRoute('via-carbonarius', 'Charcoal stand on the Via Appia', 150, -3, 5),
  onRoute('via-lucernarius', 'Lamp-seller on the Via Appia', 200, 4, 5),
  onRoute('via-plaustrum', 'The broken cart', 255, 0, 6),
  onRoute('circi-mimus', 'The mime’s corner at the Circus', 345, -4, 6),
  onRoute('circi-ficus', 'Fig stall under the Circus arches', 380, -3, 5),
  onRoute('circi-botularius', 'Sausage stand under the Circus arches', 405, -2, 5),
  onRoute('circi-factiones', 'The Circus wall with the fans’ graffiti', 470, -3, 6),
  onRoute('schola-viae', 'The street school', 520, 4, 6),
  onRoute('via-aquarius', 'Water stand below the Palatine', 560, -4, 5),
  onRoute('via-capraria', 'The goat-milk corner', 660, 3, 6),
  onRoute('via-augur', 'The augur’s post on the Palatine slope', 720, 10, 6),
  onRoute('via-tusci-alta', 'The upper Vicus Tuscus', 1175, 4, 6),
];

/** Helper areas only the content uses. */
export const CONTENT_SPOTS: LocationDef[] = [
  // mq-01: "If the player runs more than 40 m away, the grassatores give up" (CONTENT.md §3.1.1).
  // Centred on the ambush (moved with it when the world provides the spot).
  { id: 'capena-fight-area', name: 'Around the Capena Gate', position: { ...opening('courier-ambush').position }, radius: 40 },
  opening('night-cart-driver'),
  opening('night-cart-courier'),
  opening('capena-grassator-a'),
  opening('capena-grassator-b'),
  // misc-insula-nutans: evidence points inside the leaning insula (child spots, CONTENT.md §3.3.3).
  // (Fallbacks on the street, as above; the builder's spots stand at the real building's door, stair and front.)
  spot('insula-nutans-taberna', 'Ground-floor wall behind the taberna', onRoad('vicus-tuscus', 347, -1.2), 2.5, { parent: 'insula-nutans' }),
  spot('insula-nutans-scalae', 'The propped stair', onRoad('vicus-tuscus', 357, 1.2), 2.5, { parent: 'insula-nutans' }),
  spot('insula-nutans-tectum', 'Top floor of the leaning insula', onRoad('vicus-tuscus', 354), 2.5, { parent: 'insula-nutans' }),
  spot('insula-nutans-cenaculum', 'Iulia Prima’s flat', onRoad('vicus-tuscus', 346, 1.2), 2.5, { parent: 'insula-nutans' }),
  // mq-04: the Column's bronze door, in front of the facade at 2.55 m and 1.04 m to its left (COLUMN_LOCAL.door in
  // world/landmarks/columnFrame.ts; the builder's `column-door` spot replaces it).
  { id: 'column-door', name: 'The Column’s door', position: atLandmark('column-trajan', 2.55, -1.04), radius: 3, discoverable: false, parent: 'column-trajan' },
];

/** Every location the content installs. */
export const CONTENT_LOCATIONS: LocationDef[] = [...LANDMARK_LOCATIONS, ...BIBLE_SPOTS, ...FEATURE_LOCATIONS, ...CONTRACT_SPOTS, ...STREET_SPOTS, ...CONTENT_SPOTS, ...FRONT_SPOTS];

/**
 * Where Mus sits (his schedule's place). It is registered only while the player is on his trail
 * (the hideout is known, or mq-02 sends them after him) and he is still there: the population module
 * spawns nobody at a place that does not exist, so before that he is nowhere to be seen
 * (src/content/install.ts keeps it in step). At the burned taberna on the Vicus Tuscus.
 */
export const MUS_HIDEOUT: LocationDef = { ...bible('taberna-collapsa'), id: 'mus-latebra', name: 'The Mouse’s corner', radius: 3, discoverable: false, mapMarker: undefined, parent: 'taberna-collapsa' };

/** Gemellus' hiding place in Tryphon's back room: there only while mq-03 looks for him (install.ts). */
export const GEMELLUS_HIDEOUT: LocationDef = { ...bible('taberna-tryphonis'), id: 'gemellus-latebra', name: 'Tryphon’s back room', radius: 3, discoverable: false, mapMarker: undefined, parent: 'taberna-tryphonis' };

const KNOWN = new Set([...CONTENT_LOCATIONS.map((l) => l.id), MUS_HIDEOUT.id, GEMELLUS_HIDEOUT.id]);

/** Every id content may target: content locations plus any atlas landmark. */
export function isKnownPlace(id: string): boolean {
  return KNOWN.has(id) || !!LANDMARK_BY_ID[id];
}

/**
 * Copy the position of contract spots the world provides onto the CONTENT.md id of the same place
 * (castor-strongroom → castor-loculi, ludus-arena-center → ludus-cavea…). `only`: the contract ids
 * that came from the world (the content's own fallbacks are already where their aliases are).
 */
export function syncAliases(locations: { get(id: string): LocationDef | undefined; add(d: LocationDef): void }, only?: Iterable<string>) {
  const ids = only ? new Set(only) : null;
  for (const [contract, bibleId] of Object.entries(CONTRACT_ALIASES)) {
    if (ids && !ids.has(contract)) continue;
    const world = locations.get(contract);
    const b = bibleId ? locations.get(bibleId) : undefined;
    if (world && b && (world.position.x !== b.position.x || world.position.z !== b.position.z)) locations.add({ ...b, position: { ...world.position } });
  }
}

/**
 * Spots of landmark builders the content uses (by id, or `<landmark>:<id>`), with the radius and
 * name the content gives them, and the content place each one also moves.
 */
export const WORLD_SPOTS: Record<string, { radius: number; name: string; also?: string[] }> = {
  'spawn-capena': { radius: 6, name: 'Outside the Capena Gate, by the night cart' },
  'night-cart': { radius: 5, name: 'Dromo’s cart', also: ['capena-extra', 'night-cart-courier'] },
  'night-cart-driver': { radius: 1.5, name: 'Beside Dromo’s cart' },
  'courier-ambush': { radius: 6, name: 'Under the dripping arch', also: ['capena-fight-area'] },
  'capena-grassator-a': { radius: 2, name: 'Where the first knife-man waits' },
  'capena-grassator-b': { radius: 2, name: 'Where the second knife-man waits' },
  'capena-mercury-spring': { radius: 4, name: 'Mercury’s Spring', also: ['fons-mercurii'] },
  'castor-strongroom': { radius: 5, name: 'Strongrooms of Castor', also: ['castor-loculi'] },
  // The Column's bronze door on the court side (trajan-column.ts, mq-04): where the dedication's post is, and the stair's entrance.
  'column-door': { radius: 3, name: 'The Column’s door' },
  // The Forum builders' street-level places (forum-curia.ts, forum-velia.ts): the paving at the foot of the Curia's
  // stair, where the senators wait (the Chalcidicum above it is 1.7 m up), and the clothier's shop on the Vicus Tuscus.
  'curia-forecourt': { radius: 4, name: 'Before the Senate House', also: ['curia-julia:front'] },
  'horrea-agrippiana-taberna-0': { radius: 4, name: 'Clothier in the Horrea Agrippiana', also: ['taberna-vestiarii'] },
  'ludus-gate': { radius: 6, name: 'Gate of the Ludus Magnus' },
  'ludus-arena-center': { radius: 22, name: 'Practice Arena of the Ludus Magnus', also: ['ludus-cavea'] },
  lanista: { radius: 5, name: 'The procurator’s office' },
  'ludus-cellae': { radius: 8, name: 'Ludus Barracks' },
  // The Lupercal builder's row on the Vicus Tuscus (src/world/landmarks/builders/palcirc-germalus.ts): the
  // Leaning Insula (its cobbler's front, stair door, and the sidewalk below the crack that runs up its
  // front) and Tuccius' stair, all at street level; the upper floors have no way in.
  'insula-nutans': { radius: 8, name: 'The Leaning Insula' },
  'insula-nutans-taberna': { radius: 2.5, name: 'Ground-floor wall behind the taberna' },
  'insula-nutans-scalae': { radius: 2.5, name: 'The propped stair' },
  'insula-nutans-tectum': { radius: 2.5, name: 'Top floor of the leaning insula' },
  'insula-nutans-cenaculum': { radius: 2.5, name: 'Iulia Prima’s flat' },
  'insula-tuccii': { radius: 8, name: 'Insula of Tuccius the Cooper' },
  armory: { radius: 5, name: 'Ludus Armory', also: ['ludus-armamentarium'] },
  medicus: { radius: 5, name: 'Ludus Infirmary', also: ['ludus-saniarium'] },
};

interface PlacedLike {
  spots: { id: string; position: { x: number; y: number; z: number } }[];
}

/**
 * Mirror the spots the landmark builders expose (`game.landmarks`) into the location registry, so the
 * quests, schedules and props use the world's real cart, arch and strongroom instead of the
 * fallbacks above; the content places they stand for (`also`) move with them, keeping their own
 * radius (capena-fight-area stays 40 m round the new ambush). Returns the mirrored spot ids.
 */
export function mirrorLandmarkSpots(
  landmarks: { values(): Iterable<PlacedLike> } | undefined,
  locations: { get(id: string): LocationDef | undefined; add(d: LocationDef | LocationDef[]): void } | undefined,
): Set<string> {
  const done = new Set<string>();
  if (!landmarks || !locations) return done;
  for (const placed of landmarks.values()) {
    for (const s of placed.spots ?? []) {
      const key = WORLD_SPOTS[s.id] ? s.id : Object.keys(WORLD_SPOTS).find((k) => s.id.endsWith(`:${k}`));
      if (!key || done.has(key)) continue;
      const def = WORLD_SPOTS[key];
      const position = { x: round1(s.position.x), y: round1(s.position.y), z: round1(s.position.z) };
      const prev = locations.get(key);
      locations.add({ ...(prev ?? {}), id: key, name: def.name, position, radius: def.radius, discoverable: prev?.discoverable ?? false });
      for (const other of def.also ?? []) {
        const o = locations.get(other);
        if (o) locations.add({ ...o, position: { ...position } });
      }
      done.add(key);
    }
  }
  return done;
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
}
