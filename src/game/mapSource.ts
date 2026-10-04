/**
 * The map (Forma) and the compass's place list, generated from the atlas (AD 113 features only)
 * in game meters, with live discovery from game.locations and quest markers from game.quests.
 * The shape conversion is pure and unit-tested; the live parts read the game lazily.
 */
import * as atlas from '../data/atlas';
import type { Landmark } from '../data/atlas';
import type { LocationDef } from '../npc/types';
import type { MapDataSource, MapLabel, MapLandmark, MapLandmarkStyle, MapLine, MapLocation, MapQuestMarker, MapRiver, MapRoad, MapShape } from '../ui/types';
import { WORLD_SCALE as K } from '../world/coords';
import { displayLatin, iconFor, mapName } from './locations';

type P = readonly [number, number];
const pts = (list: readonly P[]): [number, number][] => list.map(([x, z]) => [x * K, z * K]);

export function styleFor(category: string): MapLandmarkStyle {
  switch (category) {
    case 'temple':
    case 'shrine':
      return 'temple';
    case 'amphitheatre':
    case 'circus':
    case 'stadium':
    case 'theatre':
    case 'odeum':
      return 'arena';
    case 'palace':
      return 'palace';
    case 'garden':
      return 'garden';
    case 'monument':
    case 'column':
    case 'arch':
    case 'tomb':
    case 'fountain':
    case 'gate':
      return 'monument';
    case 'camp':
      return 'camp';
    case 'house':
      return 'domestic';
    default:
      return 'public';
  }
}

/** A landmark footprint as a map shape (game meters, compass-bearing rotation like the atlas). */
export function landmarkShape(lm: Landmark): MapShape {
  const x = lm.center[0] * K;
  const z = lm.center[1] * K;
  const fp = lm.footprint;
  switch (fp.kind) {
    case 'rect':
      return { kind: 'rect', x, z, w: fp.w * K, d: fp.d * K, rot: lm.rotation };
    case 'ellipse':
      return { kind: 'ellipse', x, z, rx: fp.rx * K, rz: fp.rz * K, rot: lm.rotation };
    case 'circle':
      return { kind: 'ellipse', x, z, rx: fp.r * K, rz: fp.r * K, rot: 0 };
    case 'poly':
      return { kind: 'poly', points: pts(fp.points) };
  }
}

/** Every drawable landmark (not underground) as a map landmark. */
export function mapLandmarks(list: readonly Landmark[] = atlas.LANDMARKS): MapLandmark[] {
  return list
    .filter((lm) => lm.siting !== 'underground')
    .map((lm) => ({
      id: lm.id,
      name: mapName(lm.name),
      latin: displayLatin(lm.latin, mapName(lm.name)),
      shapes: [landmarkShape(lm)],
      style: styleFor(lm.category),
      labelAt: { x: lm.center[0] * K, z: lm.center[1] * K },
      labelMinZoom: lm.priority === 1 ? undefined : lm.priority === 2 ? 0.9 : 1.3,
    }));
}

function centroid(points: readonly P[]): { x: number; z: number } {
  let x = 0;
  let z = 0;
  for (const p of points) {
    x += p[0];
    z += p[1];
  }
  return { x: (x / Math.max(1, points.length)) * K, z: (z / Math.max(1, points.length)) * K };
}

/**
 * Hills and the Tiber. The fourteen Augustan regions are left off: their names repeat the
 * landmarks they are named after (Porta Capena, Circus Maximus) and crowd the plan.
 */
export function mapLabels(): MapLabel[] {
  const out: MapLabel[] = [];
  for (const h of atlas.HILLS) {
    if (h.kind === 'terrace' || h.parent) continue;
    const c = centroid(h.outline);
    out.push({ text: mapName(h.name).toUpperCase(), latin: displayLatin(h.latin, mapName(h.name)), x: c.x, z: c.z, kind: 'hill' });
  }
  const tiber = atlas.RIVERS.find((r) => r.id === 'tiber');
  if (tiber) {
    for (const i of [Math.floor(tiber.centerline.length * 0.35), Math.floor(tiber.centerline.length * 0.7)]) {
      const a = tiber.centerline[i];
      const b = tiber.centerline[Math.min(tiber.centerline.length - 1, i + 1)];
      if (!a || !b) continue;
      const angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      out.push({ text: 'Tiberis', x: a[0] * K, z: a[1] * K, kind: 'water', angle: ((angle + 90) % 180) - 90 });
    }
  }
  return out;
}

export interface AtlasMapHooks {
  heightAt?: (x: number, z: number) => number;
  /** Registered locations (game.locations.all()) and whether each is discovered. */
  locations?: () => readonly LocationDef[];
  isDiscovered?: (id: string) => boolean;
  player?: () => { x: number; z: number; bearing: number } | null;
  questMarkers?: () => MapQuestMarker[];
}

/** MapDataSource over the atlas. Build once and return the same object (terrain shading caches on it). */
export class AtlasMapSource implements MapDataSource {
  readonly bounds = {
    minX: atlas.CITY_BOUNDS.minX * K,
    maxX: atlas.CITY_BOUNDS.maxX * K,
    minZ: atlas.CITY_BOUNDS.minZ * K,
    maxZ: atlas.CITY_BOUNDS.maxZ * K,
  };
  readonly contourInterval = 3;
  readonly rivers: MapRiver[];
  readonly islands: MapShape[];
  readonly roads: MapRoad[];
  readonly walls: MapLine[];
  readonly aqueducts: MapLine[];
  readonly bridges: MapLine[];
  readonly landmarks: MapLandmark[];
  readonly labels: MapLabel[];
  private locCache: { at: number; list: MapLocation[] } = { at: -1, list: [] };

  constructor(private readonly hooks: AtlasMapHooks = {}) {
    this.rivers = atlas.RIVERS.map((r) => ({ name: r.kind === 'canal' ? r.name : 'Tiberis', width: (r.width.reduce((a, b) => a + b, 0) / Math.max(1, r.width.length)) * K, points: pts(r.centerline) }));
    this.islands = atlas.ISLANDS.map((i) => ({ kind: 'poly', points: pts(i.outline) }) as MapShape);
    this.roads = atlas.ROADS.map((r) => ({ name: r.latin ?? r.name, rank: r.kind === 'via' ? 'via' : 'street', points: pts(r.points) }) as MapRoad);
    this.walls = atlas.WALLS.filter((w) => w.state !== 'built-over').map((w) => ({ name: w.name, points: pts(w.points) }));
    this.aqueducts = atlas.AQUEDUCTS.filter((a) => a.kind !== 'underground').map((a) => ({ name: a.latin, points: pts(a.points) }));
    this.bridges = atlas.BRIDGES.map((b) => ({ name: b.latin, points: pts([b.a, b.b]) }));
    this.landmarks = mapLandmarks();
    this.labels = mapLabels();
  }

  heightAt(x: number, z: number): number {
    return this.hooks.heightAt ? this.hooks.heightAt(x, z) : 0;
  }

  locations(): MapLocation[] {
    // The compass asks 8× a second; rebuild at most every 250 ms.
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.locCache.at < 250) return this.locCache.list;
    const list: MapLocation[] = [];
    for (const d of this.hooks.locations?.() ?? []) {
      // Places you can't find (buried, underground) stay off the map and out of the count.
      if (!d.mapMarker || d.discoverable === false) continue;
      const lm = atlas.LANDMARK_BY_ID[d.id];
      list.push({
        id: d.id,
        name: d.name,
        latin: d.latin,
        x: d.position.x,
        z: d.position.z,
        icon: lm ? iconFor(lm.category) : (d.mapMarker as MapLocation['icon']),
        discovered: this.hooks.isDiscovered?.(d.id) ?? false,
        description: lm?.description,
      });
    }
    this.locCache = { at: now, list };
    return list;
  }

  player() {
    return this.hooks.player?.() ?? null;
  }

  questMarkers(): MapQuestMarker[] {
    return this.hooks.questMarkers?.() ?? [];
  }
}
