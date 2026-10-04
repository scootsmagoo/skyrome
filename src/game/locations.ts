/**
 * Every atlas landmark as a named, discoverable location (GDD §15.1 discovery banner, AC-12):
 * entering its footprint radius fires 'location:discovered', and the HUD shows the inscriptional
 * Latin name with the English one below. Pure mapping + a registration helper.
 */
import type { Game } from '../core/Game';
import { LANDMARKS, type Landmark } from '../data/atlas';
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

/** Discovery radius in game meters: the footprint's circle, at least 6 m. */
export function discoveryRadius(lm: LandmarkData): number {
  return Math.max(6, footprintRadius(lm) * WORLD_SCALE);
}

/** One atlas landmark → LocationDef (game meters). */
export function landmarkLocation(lm: Landmark, heightAt?: (x: number, z: number) => number): LocationDef {
  const [x, z] = toGame(lm.center[0], lm.center[1]);
  return {
    id: lm.id,
    name: lm.name,
    latin: lm.latin && lm.latin !== lm.name ? lm.latin : undefined,
    position: { x, y: heightAt?.(x, z), z },
    radius: discoveryRadius(lm as unknown as LandmarkData),
    mapMarker: markerFor(lm.category),
    parent: lm.within,
    discoverable: isDiscoverable(lm),
  };
}

export function atlasLocations(heightAt?: (x: number, z: number) => number): LocationDef[] {
  return LANDMARKS.map((lm) => landmarkLocation(lm, heightAt));
}

/** Register every atlas landmark with game.locations (skipping ids content already defined). */
export function registerAtlasLocations(game: Game): number {
  const reg = game.locations;
  if (!reg) return 0;
  const heightAt = game.heightmap ? (x: number, z: number) => game.heightmap.heightAt(x, z) : undefined;
  const defs = atlasLocations(heightAt).filter((d) => !reg.get(d.id));
  reg.add(defs);
  return defs.length;
}
