/**
 * Discovery on sight (GDD §15.1, AC-12): a landmark is "discovered" when you come within seeing
 * distance of it, not only when you step inside its footprint, so a walk up the Circus valley
 * reads as a tour (a banner every 20–30 s) instead of a minute and a half of silence. Hills are
 * discovered from their foot. One discovery at most every `gapS` seconds, nearest first, so the
 * banners don't pile up into a queue when you walk into the Forum.
 *
 *   tier 1   footprint radius + 30 m      tier 2  + 15 m      tier 3  + 6 m
 *   big      palaces, temples, circuses, arenas, gates, fora, baths, theatres, arches: + 20 m more
 *   gates    at least 22 m (the Porta Capena fires as you arrive)
 *   hills    within (slope + 50 m) of the plateau edge: from the valley floor below them
 *   valleys  the Circus valley and the Velabrum, on entering (10 m margin)
 */
import type { Game, System } from '../core/Game';
import { LANDMARKS, type Hill, type Landmark } from '../data/atlas';
import { WORLD_SCALE as K, toGame } from '../world/coords';
import type { LandmarkData } from '../world/landmarks/types';
import { NAMED_LOWLANDS, discoveryRadius, distanceToPolygon, hillOutline, isDiscoverable, lowlandOutline, namedHills } from './locations';

const BIG = new Set(['palace', 'circus', 'amphitheatre', 'stadium', 'gate', 'forum', 'baths', 'theatre', 'odeum', 'arch', 'temple']);

/** How far away (game m) a landmark announces itself. Pure. */
export function sightRadius(lm: Landmark): number {
  const base = discoveryRadius(lm as unknown as LandmarkData);
  let r = base + (lm.priority === 1 ? 30 : lm.priority === 2 ? 15 : 6) + (BIG.has(lm.category) ? 20 : 0);
  if (lm.category === 'gate') r = Math.max(r, 22);
  return r;
}

export interface Sighting {
  id: string;
  /** Landmarks: the centre; hills: unused. */
  x: number;
  z: number;
  /** Landmarks: sight radius around the centre; hills: margin around the plateau outline. */
  r: number;
  poly?: [number, number][];
}

export function landmarkSightings(list: readonly Landmark[] = LANDMARKS): Sighting[] {
  return list.filter(isDiscoverable).map((lm) => {
    const [x, z] = toGame(lm.center[0], lm.center[1]);
    return { id: lm.id, x, z, r: sightRadius(lm) };
  });
}

export function hillSightings(list?: readonly Hill[]): Sighting[] {
  return namedHills(list).map((h) => ({ id: h.id, x: 0, z: 0, r: Math.max(30, h.slope * K + 50), poly: hillOutline(h) }));
}

export function lowlandSightings(): Sighting[] {
  const out: Sighting[] = [];
  for (const id of Object.keys(NAMED_LOWLANDS)) {
    const poly = lowlandOutline(id);
    if (poly) out.push({ id: `area-${id}`, x: 0, z: 0, r: 10, poly });
  }
  return out;
}

/** Everything the spotter watches for. */
export function allSightings(): Sighting[] {
  return [...landmarkSightings(), ...hillSightings(), ...lowlandSightings()];
}

/**
 * The sighting to discover from (x, z), or null. Landmarks rank by distance over sight radius;
 * hills rank after any landmark in view of the same strength, so the gate comes before the hill
 * it stands under. Pure.
 */
export function nextSighting(x: number, z: number, list: readonly Sighting[], isDiscovered: (id: string) => boolean): Sighting | null {
  let best: Sighting | null = null;
  let bestRank = Infinity;
  for (const s of list) {
    if (isDiscovered(s.id)) continue;
    const d = s.poly ? distanceToPolygon(x, z, s.poly) : Math.hypot(s.x - x, s.z - z);
    if (d > s.r) continue;
    const rank = s.poly ? 0.5 + d / (2 * s.r) : d / s.r;
    if (rank < bestRank) {
      bestRank = rank;
      best = s;
    }
  }
  return best;
}

export class DiscoverySpotter implements System {
  readonly name = 'discoverySpotter';
  readonly priority = 121;
  /** Seconds between two discoveries (a location banner shows for ~4.9 s). */
  gapS = 5;
  private acc = 0;
  private cooldown = 0;

  constructor(
    private readonly game: Game,
    private readonly sightings: readonly Sighting[],
    /** Only while playing (not on the title, in creation or while loading). */
    private readonly active: () => boolean,
  ) {}

  update(dt: number) {
    this.cooldown -= dt;
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const reg = this.game.locations;
    const p = this.game.player?.position;
    if (!reg || !p || this.cooldown > 0 || !this.active()) return;
    const s = nextSighting(p.x, p.z, this.sightings, (id) => reg.isDiscovered(id) || !reg.get(id));
    if (s && reg.discover(s.id)) this.cooldown = this.gapS;
  }
}
