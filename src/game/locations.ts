/**
 * Every atlas landmark as a named, discoverable location (GDD §15.1 discovery banner, AC-12):
 * entering its footprint radius fires 'location:discovered' (the flow's DiscoverySpotter also
 * discovers landmarks on sight, see discovery.ts), and the HUD shows the inscriptional Latin
 * name with the English one below. The named hills are regions too (Mons Palatinus…).
 * Atlas names are clean (no research notes); the display helpers here are the one name pipeline
 * for banner, map, compass and journal and strip any stray note. Pure mapping + registration helpers.
 */
import type { Game } from '../core/Game';
import { HILLS, LANDMARKS, LOWLANDS, type Hill, type Landmark } from '../data/atlas';
import type { LocationDef } from '../npc/types';
import type { MapIconKind } from '../ui/types';
import { WORLD_SCALE, toGame } from '../world/coords';
import { footprintRadius } from '../world/landmarks/footprint';
import type { LandmarkData } from '../world/landmarks/types';

type Marker = NonNullable<LocationDef['mapMarker']>;

/** Location marker (registry vocabulary) for a landmark category. */
export function markerFor(category: string): Marker {
  switch (category) {
    case 'temple':
    case 'shrine':
      return 'temple';
    case 'forum':
    case 'basilica':
    case 'curia':
      return 'forum';
    case 'baths':
      return 'baths';
    case 'amphitheatre':
    case 'circus':
    case 'stadium':
      return 'arena';
    case 'market':
    case 'warehouse':
    case 'harbor':
      return 'market';
    case 'gate':
      return 'gate';
    case 'palace':
      return 'palace';
    case 'house':
      return 'house';
    case 'camp':
      return 'camp';
    case 'prison':
      return 'dungeon';
    default:
      return 'landmark';
  }
}

/** Map/compass icon (the UI's richer vocabulary) for a landmark category. */
export function iconFor(category: string): MapIconKind {
  switch (category) {
    case 'theatre':
    case 'odeum':
      return 'theatre';
    case 'monument':
    case 'column':
    case 'arch':
    case 'tomb':
    case 'fountain':
      return 'monument';
    case 'garden':
      return 'garden';
    default:
      return markerFor(category);
  }
}

/** Landmarks that are not places you walk into (buried, underground). */
export function isDiscoverable(lm: Pick<Landmark, 'siting' | 'status113'>): boolean {
  return lm.siting !== 'underground';
}

// ------------------------------------------------------------------ display names

/**
 * The English name for the banner, compass, journal, pause clock, saves and map: the atlas name
 * without parentheticals. The atlas names are already clean and unique (tests/names.test.ts); the
 * stripping is a safety net so a stray research note can never reach the player.
 */
export function displayName(name: string): string {
  const s = name.replace(/\s*\([^()]*\)/g, '').replace(/\s+/g, ' ').trim();
  return s || name;
}

/** The map label: one name pipeline, so the map, banner, compass and journal always agree. */
export const mapName = displayName;

/** 'Before the Rostra', 'Before Trajan\'s Column': the article is dropped before a possessive. */
export function beforeName(name: string): string {
  const n = displayName(name);
  return /^(?:The|[A-Z][a-z]+'s)\b/.test(n) ? `Before ${n.replace(/^The\b/, 'the')}` : `Before the ${n}`;
}

/**
 * The Latin line: the first alternative ('Asylum / Inter duos lucos' → 'Asylum') without
 * parentheticals ('Equus Domitiani (removed)' → 'Equus Domitiani'); none when the whole value
 * is a note ('(Vatican necropolis)', '(insula)') or repeats the English name.
 */
export function displayLatin(latin: string | undefined, name?: string): string | undefined {
  if (!latin) return undefined;
  const t = latin.trim();
  if (/^\(.*\)$/.test(t)) return undefined;
  const s = t.split(/\s+\/\s+/)[0].replace(/\s*\([^()]*\)/g, '').replace(/\s+/g, ' ').trim();
  if (!s || (name !== undefined && s.toLowerCase() === name.toLowerCase())) return undefined;
  return s;
}

// ------------------------------------------------------------------ geometry (game meters)

type Pt = readonly [number, number];

/** Is (x, z) inside the polygon (even-odd rule)? */
export function insidePolygon(x: number, z: number, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from (x, z) to the polygon's edge (0 inside). */
export function distanceToPolygon(x: number, z: number, poly: readonly Pt[]): number {
  if (insidePolygon(x, z, poly)) return 0;
  return edgeDistance(x, z, poly);
}

function edgeDistance(x: number, z: number, poly: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j];
    const [bx, bz] = poly[i];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}

/**
 * Radius of a polygon region seen from a point inside it: the distance to the nearest edge (the
 * circumscribed circle of a district would spill over its neighbours: the Subura's covered the
 * whole Forum). Falls back to the equal-area radius when the point is outside.
 */
export function inscribedRadius(cx: number, cz: number, poly: readonly Pt[]): number {
  if (insidePolygon(cx, cz, poly)) return edgeDistance(cx, cz, poly);
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.sqrt(Math.abs(a / 2) / Math.PI);
}

// ------------------------------------------------------------------ landmarks

/**
 * Location radius in game meters ('location:entered', the current place, discovery on entry):
 * the footprint's circle, at least 6 m; polygon regions use their inscribed radius.
 */
export function discoveryRadius(lm: LandmarkData): number {
  const fp = lm.footprint;
  if (fp.kind === 'poly') {
    const r = inscribedRadius(lm.center[0], lm.center[1], fp.points);
    return Math.max(6, Math.min(r, footprintRadius(lm)) * WORLD_SCALE);
  }
  return Math.max(6, footprintRadius(lm) * WORLD_SCALE);
}

/**
 * Walled precincts (the imperial fora): long narrow rectangles that touch each other, so a circle
 * round one covers the next (standing in the Forum of Caesar was being "in" the Forum of Nerva).
 * They count as entered when you are inside their outline, and are discovered on entry rather
 * than on sight: their walls hide them until you are in.
 */
export function isEnclosure(lm: Pick<Landmark, 'category' | 'footprint'>): boolean {
  return lm.category === 'forum' && lm.footprint.kind === 'rect';
}

/** A rectangular footprint's corners in game meters (the atlas rotation convention). */
export function footprintOutline(lm: Pick<Landmark, 'center' | 'rotation' | 'footprint'>): [number, number][] | undefined {
  const fp = lm.footprint;
  if (fp.kind !== 'rect') return undefined;
  const th = (lm.rotation * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const out: [number, number][] = [];
  for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = (lx * fp.w) / 2;
    const z = (lz * fp.d) / 2;
    out.push(toGame(lm.center[0] + x * c - z * s, lm.center[1] + x * s + z * c));
  }
  return out;
}

/** One atlas landmark → LocationDef (game meters), with player-facing names. */
export function landmarkLocation(lm: Landmark, heightAt?: (x: number, z: number) => number): LocationDef {
  const [x, z] = toGame(lm.center[0], lm.center[1]);
  const name = displayName(lm.name);
  return {
    id: lm.id,
    name,
    latin: displayLatin(lm.latin, name),
    position: { x, y: heightAt?.(x, z), z },
    radius: discoveryRadius(lm as unknown as LandmarkData),
    area: isEnclosure(lm) ? footprintOutline(lm) : undefined,
    mapMarker: markerFor(lm.category),
    parent: lm.within,
    discoverable: isDiscoverable(lm),
  };
}

export function atlasLocations(heightAt?: (x: number, z: number) => number): LocationDef[] {
  return LANDMARKS.map((lm) => landmarkLocation(lm, heightAt));
}

// ------------------------------------------------------------------ regions (hills, valleys)

/** A polygon region (game meters) as a location: centred, inscribed radius, no map marker. */
export function regionLocation(id: string, name: string, latin: string | undefined, poly: readonly Pt[], heightAt?: (x: number, z: number) => number): LocationDef {
  let x = 0;
  let z = 0;
  for (const [px, pz] of poly) {
    x += px;
    z += pz;
  }
  x /= poly.length;
  z /= poly.length;
  return {
    id,
    name,
    latin: displayLatin(latin, name),
    position: { x, y: heightAt?.(x, z), z },
    radius: Math.max(20, inscribedRadius(x, z, poly)),
    discoverable: true,
  };
}

/** The named hills that are places (not terraces, not unnamed plateaus such as '(ager …)'). */
export function namedHills(list: readonly Hill[] = HILLS): Hill[] {
  return list.filter((h) => h.kind !== 'terrace' && !h.parent && !!displayLatin(h.latin) && h.outline.length >= 3);
}

/** A hill's plateau outline in game meters. */
export function hillOutline(h: Hill): [number, number][] {
  return h.outline.map(([x, z]) => toGame(x, z) as [number, number]);
}

/**
 * A named hill as a region: the map already labels hills, so no marker. Discovered by walking
 * under it (DiscoverySpotter) or onto it.
 */
export function hillLocation(h: Hill, heightAt?: (x: number, z: number) => number): LocationDef {
  return regionLocation(h.id, displayName(h.name), h.latin, hillOutline(h), heightAt);
}

/**
 * The valleys of the golden path (GDD §17.2: "up the Circus valley … through the Velabrum"),
 * atlas lowland ids → names. Other lowlands are terrain shaping, not places.
 */
export const NAMED_LOWLANDS: Record<string, { name: string; latin: string }> = {
  'vallis-murcia': { name: 'The Circus Valley', latin: 'Vallis Murcia' },
  velabrum: { name: 'The Velabrum', latin: 'Velabrum' },
};

export function lowlandOutline(id: string): [number, number][] | null {
  const l = LOWLANDS.find((x) => x.id === id);
  return l ? l.polygon.map(([x, z]) => toGame(x, z) as [number, number]) : null;
}

/** The named valleys as region locations (ids `area-<lowland id>`, clear of landmark ids). */
export function lowlandLocations(heightAt?: (x: number, z: number) => number): LocationDef[] {
  const out: LocationDef[] = [];
  for (const [id, n] of Object.entries(NAMED_LOWLANDS)) {
    const poly = lowlandOutline(id);
    if (poly) out.push(regionLocation(`area-${id}`, n.name, n.latin, poly, heightAt));
  }
  return out;
}

/** Register every atlas landmark, named hill and valley with game.locations (content's ids win). */
export function registerAtlasLocations(game: Game): number {
  const reg = game.locations;
  if (!reg) return 0;
  const heightAt = game.heightmap ? (x: number, z: number) => game.heightmap.heightAt(x, z) : undefined;
  const landmarkIds = new Set(LANDMARKS.map((l) => l.id));
  const hills = namedHills().filter((h) => !landmarkIds.has(h.id)).map((h) => hillLocation(h, heightAt));
  const defs = [...atlasLocations(heightAt), ...hills, ...lowlandLocations(heightAt)].filter((d) => !reg.get(d.id));
  reg.add(defs);
  return defs.length;
}
