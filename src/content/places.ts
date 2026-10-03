/**
 * Places the v0.1 content refers to (quest objectives, NPC homes and schedules) as LocationDefs.
 *
 * - LANDMARKS: the atlas landmarks that quests and schedules name, by their atlas id, centered on
 *   the atlas position. If the world later registers every atlas landmark itself, those replace these.
 * - CONTRACT SPOTS: points the landmark builders expose ('spawn-capena', 'castor-strongroom',
 *   'ludus-arena-center'…). Here they are fallbacks computed from the atlas, so markers and
 *   'location:entered' work before (or without) the builders' spots. A spot registered later with
 *   the same id replaces the fallback (LocationRegistry.add keeps the last one).
 * - CONTENT SPOTS: places only the content needs (the popina on the Vicus Tuscus, the leaning
 *   insula, the bean-thrower's insula in the Velabrum…).
 *
 * Positions are game meters (atlas real meters × WORLD_SCALE). Spots near a landmark are given
 * relative to its facade: `forward` along the facade normal (outward, toward the street), `side` to
 * the right of someone standing at the facade looking out. Both are game meters.
 *
 * Content files are installed through src/quests/content/places.ts (installRpg registers the
 * `locations` export of every quest module).
 */
import { LANDMARK_BY_ID, type Landmark } from '../data/atlas';
import type { LocationDef } from '../npc/types';
import { elevToY, toGame, WORLD_SCALE } from '../world/coords';

type Marker = NonNullable<LocationDef['mapMarker']>;

const MARKER_BY_CATEGORY: Partial<Record<Landmark['category'], Marker>> = {
  temple: 'temple', shrine: 'temple', forum: 'forum', basilica: 'forum', curia: 'forum', monument: 'landmark', column: 'landmark',
  arch: 'landmark', fountain: 'landmark', amphitheatre: 'arena', circus: 'arena', camp: 'arena', gate: 'gate', market: 'market',
  warehouse: 'market', palace: 'palace', house: 'house', prison: 'landmark', portico: 'landmark', baths: 'baths', harbor: 'bridge',
};

/** Horizontal extent of an atlas footprint in game meters (half the larger side). */
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

/** Game-space point at a landmark's facade frame (see the header). */
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

/** Game-space point from atlas REAL meters (streets and quarters without a landmark). */
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

function spot(id: string, name: string, position: { x: number; y: number; z: number }, radius: number, extra: Partial<LocationDef> = {}): LocationDef {
  return { id, name, position, radius, discoverable: false, ...extra };
}

/** Atlas landmarks the content names (objectives, homes, schedules, patrol routes). */
export const CONTENT_LANDMARK_IDS = [
  'porta-capena', 'circus-maximus', 'obelisk-circus-maximus', 'ara-maxima', 'forum-boarium', 'temple-portunus',
  'miliarium-aureum', 'rostra', 'temple-saturn', 'basilica-julia', 'basilica-aemilia', 'curia-julia', 'shrine-venus-cloacina',
  'temple-castor-pollux', 'lacus-juturnae', 'temple-vesta', 'atrium-vestae', 'carcer-tullianum', 'horrea-agrippiana',
  'arch-titus', 'colossus-sol', 'velia-vestibule', 'porticus-margaritaria', 'meta-sudans', 'colosseum', 'ludus-magnus',
  'forum-trajan', 'column-trajan', 'forum-nerva', 'subura', 'statio-vigiles-v',
] as const;

export const LANDMARK_LOCATIONS: LocationDef[] = CONTENT_LANDMARK_IDS.map((id) => landmarkLocation(id));

/**
 * Spot ids the landmark builders are asked to expose (the content contract). Fallback positions
 * below; the real spots replace them when the world registers them as locations.
 */
export const CONTRACT_SPOT_IDS = ['spawn-capena', 'night-cart', 'courier-ambush', 'castor-strongroom', 'ludus-gate', 'ludus-arena-center', 'lanista', 'armory', 'medicus'] as const;

// The Porta Capena faces SE (bearing 140) out along the Via Appia; the city lies behind it (forward < 0).
// The Ludus Magnus faces WNW (289) toward the amphitheatre; its arena is in the middle of the courtyard.
// The Temple of Castor faces NNE (25) onto the Forum; the strongroom doors open in the side of the podium.
export const CONTRACT_SPOTS: LocationDef[] = [
  spot('spawn-capena', 'Porta Capena (inside the gate)', atLandmark('porta-capena', -14, 0), 6, { parent: 'porta-capena' }),
  spot('night-cart', 'The night cart', atLandmark('porta-capena', -8, 2.5), 5, { parent: 'porta-capena' }),
  // Far enough up the road that the player, spawning at 'spawn-capena', is not already inside it.
  spot('courier-ambush', 'Under the dripping arches', atLandmark('porta-capena', -36, -3), 9, { parent: 'porta-capena' }),
  spot('castor-strongroom', 'Strongrooms of the Temple of Castor', atLandmark('temple-castor-pollux', -3, -11.5), 6, { parent: 'temple-castor-pollux', latin: 'Loculi Aedis Castoris', mapMarker: 'shop' }),
  spot('ludus-gate', 'Gate of the Ludus Magnus', atLandmark('ludus-magnus', 35, 0), 6, { parent: 'ludus-magnus' }),
  spot('ludus-arena-center', 'Practice arena of the Ludus Magnus', atLandmark('ludus-magnus', 0, 0), 14, { parent: 'ludus-magnus' }),
  spot('lanista', 'The procurator’s office', atLandmark('ludus-magnus', 24, -14), 5, { parent: 'ludus-magnus' }),
  spot('armory', 'The armory of the Ludus', atLandmark('ludus-magnus', 20, 16), 5, { parent: 'ludus-magnus', latin: 'Armamentarium' }),
  spot('medicus', 'The Saniarium (infirmary)', atLandmark('ludus-magnus', -22, 16), 5, { parent: 'ludus-magnus', latin: 'Saniarium' }),
];

/** Places only the content needs. Street positions come from the atlas roads (real meters). */
export const CONTENT_SPOTS: LocationDef[] = [
  // Porta Capena and the Circus valley
  spot('capena-spring', 'Spring of Mercury by the Porta Capena', atLandmark('porta-capena', 12, -8), 5, { parent: 'porta-capena', latin: 'Aqua Mercurii' }),
  spot('circus-carceres', 'Starting gates of the Circus Maximus', atLandmark('circus-maximus', 190, 0), 14, { parent: 'circus-maximus', latin: 'Carceres' }),
  spot('circus-arcades', 'Arcades of the Circus (Palatine side)', atLandmark('circus-maximus', 60, 48), 10, { parent: 'circus-maximus' }),
  // Forum Romanum
  spot('castor-steps', 'Steps of the Temple of Castor', atLandmark('temple-castor-pollux', 16, 0), 6, { parent: 'temple-castor-pollux' }),
  spot('basilica-julia-steps', 'Steps of the Basilica Julia (the gaming boards)', atLandmark('basilica-julia', 16, 0), 10, { parent: 'basilica-julia' }),
  spot('basilica-aemilia-tabernae', 'Shops of the Basilica Aemilia', atLandmark('basilica-aemilia', 12, 8), 10, { parent: 'basilica-aemilia', latin: 'Tabernae Novae', mapMarker: 'shop' }),
  spot('forum-tonsor', 'A barber’s chair by the Rostra', atLandmark('rostra', 9, 6), 4, { parent: 'rostra' }),
  // Vicus Tuscus and the Velabrum (atlas road vicus-tuscus: (45,140) → (−45,311) → (−73,452) real).
  // Street-front spots sit on or beside the street line so NPCs stand at their doors, not in walls.
  spot('popina-vicus-tuscus', 'Popina of the Cockerel (Vicus Tuscus)', atReal(20, 188), 7, { latin: 'Popina ad Gallum', mapMarker: 'tavern', discoverable: true }),
  spot('insula-nutans', 'The leaning insula (Vicus Tuscus)', atReal(-8, 246), 9, { latin: 'Insula Nutans', mapMarker: 'house', discoverable: true }),
  spot('insula-nutans-scalae', 'Stairwell of the leaning insula', atReal(-4, 252), 3, { parent: 'insula-nutans' }),
  spot('insula-nutans-taberna', 'Ground-floor shop of the leaning insula', atReal(-6, 240), 3, { parent: 'insula-nutans' }),
  spot('insula-nutans-paries', 'Party wall of the leaning insula', atReal(-14, 250), 3, { parent: 'insula-nutans' }),
  spot('insula-fabaria', 'Insula of the Fabii (Velabrum)', atReal(-55, 335), 9, { latin: 'Insula Fabiorum', mapMarker: 'house', discoverable: true }),
  spot('insula-fabaria-atrium', 'Courtyard of the Insula of the Fabii', atReal(-58, 340), 4, { parent: 'insula-fabaria' }),
  spot('insula-fabaria-scalae', 'Back stairs of the Insula of the Fabii', atReal(-62, 346), 3, { parent: 'insula-fabaria' }),
  spot('fullonica-velabri', 'Fullery in the Velabrum', atReal(-36, 290), 6, { latin: 'Fullonica', mapMarker: 'shop', discoverable: true }),
  spot('pistrinum-velabri', 'Bakery in the Velabrum', atReal(-40, 318), 6, { latin: 'Pistrinum', mapMarker: 'shop', discoverable: true }),
  // Velia and the Colosseum valley (atlas road via-sacra: (343,209) → (505,269) real, by the Meta Sudans)
  spot('taberna-armorum', 'Arms dealer’s shop (Sacra Via)', atReal(498, 266), 6, { latin: 'Taberna Armorum', mapMarker: 'shop', discoverable: true }),
  spot('meta-sudans-ring', 'Around the Meta Sudans', atLandmark('meta-sudans', 0, 0), 14, { parent: 'meta-sudans' }),
  spot('ludus-palus', 'Training posts of the Ludus', atLandmark('ludus-magnus', 8, -20), 5, { parent: 'ludus-magnus', latin: 'Pali' }),
  spot('ludus-cellae', 'Barracks of the Ludus', atLandmark('ludus-magnus', -10, -22), 6, { parent: 'ludus-magnus' }),
  // Night watch: a provisional post in the Velabrum (the 14 excubitoria are unlocated, GDD §9.1)
  spot('excubitorium-velabri', 'Watch post in the Velabrum', atReal(-48, 365), 5, { latin: 'Excubitorium', mapMarker: 'camp' }),
];

/** Every location the content installs. */
export const CONTENT_LOCATIONS: LocationDef[] = [...LANDMARK_LOCATIONS, ...CONTRACT_SPOTS, ...CONTENT_SPOTS];

/** Every id content may target: content locations plus any atlas landmark. */
export function isKnownPlace(id: string): boolean {
  return !!LANDMARK_BY_ID[id] || CONTENT_LOCATIONS.some((l) => l.id === id);
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
}
