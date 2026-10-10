/**
 * The map (Forma) and the compass's place list, generated from the atlas (AD 113 features only)
 * in game meters, with live discovery from game.locations and quest markers from game.quests.
 * The shape conversion is pure and unit-tested; the live parts read the game lazily.
 */
import * as atlas from '../data/atlas';
import type { Landmark } from '../data/atlas';
import type { LocationDef } from '../npc/types';
import type { MapDataSource, MapFabric, MapLabel, MapLandmark, MapLandmarkStyle, MapLine, MapLocation, MapQuestMarker, MapRiver, MapRoad, MapRouteView, MapShape } from '../ui/types';
import { WORLD_SCALE as K } from '../world/coords';
import { displayLatin, displayName, iconFor, namedHills } from './locations';

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
      name: displayName(lm.name),
      latin: displayLatin(lm.latin, displayName(lm.name)),
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
  for (const h of namedHills()) {
    const c = centroid(h.outline);
    out.push({ text: displayName(h.name).toUpperCase(), latin: displayLatin(h.latin, displayName(h.name)), x: c.x, z: c.z, kind: 'hill' });
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

/** The parts of the city plan (src/world/city/plan.ts) the map draws, in game metres. */
export interface PlanLike {
  blocks: readonly { outline: readonly (readonly [number, number])[]; kind: string }[];
  streets: readonly { points: readonly (readonly [number, number])[]; width: number }[];
  roads: readonly { points: readonly (readonly [number, number])[]; half: number }[];
  plazas: readonly { polygon: readonly (readonly [number, number])[] }[];
}

const flat = (pts: readonly (readonly [number, number])[]) => {
  const out = new Float32Array(pts.length * 2);
  pts.forEach(([x, z], i) => {
    out[i * 2] = x;
    out[i * 2 + 1] = z;
  });
  return out;
};

/** The city's blocks, streets and squares as map fabric (pure). Roads count as streets at their full width. */
export function fabricFromPlan(plan: PlanLike): MapFabric {
  return {
    blocks: plan.blocks.map((b) => ({ pts: flat(b.outline), garden: b.kind === 'garden' })),
    streets: [...plan.roads.map((r) => ({ pts: flat(r.points), width: r.half * 2 })), ...plan.streets.map((s) => ({ pts: flat(s.points), width: s.width }))],
    plazas: plan.plazas.map((p) => ({ pts: flat(p.polygon) })),
  };
}

export interface AtlasMapHooks {
  heightAt?: (x: number, z: number) => number;
  /** Registered locations (game.locations.all()) and whether each is discovered. */
  locations?: () => readonly LocationDef[];
  isDiscovered?: (id: string) => boolean;
  player?: () => { x: number; z: number; bearing: number } | null;
  questMarkers?: () => MapQuestMarker[];
  /** The city plan, once the city is built. */
  plan?: () => PlanLike | null | undefined;
  /** The quest route, when it is shown. */
  route?: () => MapRouteView | null;
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
  private fabricCache: { plan: unknown; fabric: MapFabric | null } = { plan: null, fabric: null };

  constructor(private readonly hooks: AtlasMapHooks = {}) {
    this.rivers = atlas.RIVERS.map((r) => ({ name: r.kind === 'canal' ? r.name : 'Tiberis', width: (r.width.reduce((a, b) => a + b, 0) / Math.max(1, r.width.length)) * K, points: pts(r.centerline) }));
    this.islands = atlas.ISLANDS.map((i) => ({ kind: 'poly', points: pts(i.outline) }) as MapShape);
    this.roads = atlas.ROADS.map((r) => ({ name: displayLatin(r.latin) ?? displayName(r.name), rank: r.kind === 'via' ? 'via' : 'street', points: pts(r.points) }) as MapRoad);
    this.walls = atlas.WALLS.filter((w) => w.state !== 'built-over').map((w) => ({ name: w.name, points: pts(w.points) }));
    this.aqueducts = atlas.AQUEDUCTS.filter((a) => a.kind !== 'underground').map((a) => ({ name: displayLatin(a.latin) ?? displayName(a.name), points: pts(a.points) }));
    this.bridges = atlas.BRIDGES.map((b) => ({ name: displayLatin(b.latin) ?? displayName(b.name), points: pts([b.a, b.b]) }));
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

  /** The same object for as long as the plan is (the renderers cache their paths on it). */
  fabric(): MapFabric | null {
    const plan = this.hooks.plan?.() ?? null;
    if (plan !== this.fabricCache.plan) this.fabricCache = { plan, fabric: plan ? fabricFromPlan(plan) : null };
    return this.fabricCache.fabric;
  }

  route(): MapRouteView | null {
    return this.hooks.route?.() ?? null;
  }
}
