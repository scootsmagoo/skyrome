/**
 * Which sound a place has: the floor under a walker's feet (marble in a temple, boards in a
 * warehouse or on a timber bridge), the reverb of a building and the music it brings, and the music
 * of the game's moments (the title, the Lemuria night). Pure rules over atlas categories and flow
 * states; `src/game/audio.ts` applies them to the live world, and `tests/audio-places.test.ts`
 * checks them.
 */
import type { ReverbPreset } from './dsp/reverb';
import type { Surface } from './sounds/footsteps';
import type { MusicRequest } from './music/MusicDirector';

/** Atlas categories whose floors are marble or dressed stone laid smooth (hard, bright steps). */
const MARBLE_CATEGORIES: ReadonlySet<string> = new Set(['temple', 'basilica', 'curia', 'library', 'baths', 'palace', 'odeum']);
/** Floors of boards: store-rooms and the tenement and hut that have no stone to speak of. */
const WOOD_CATEGORIES: ReadonlySet<string> = new Set(['warehouse']);
const WOOD_IDS: ReadonlySet<string> = new Set(['insula-aracoeli', 'casa-romuli']);
/** Buildings with upper storeys of timber joists and boards (a raised floor inside them is wood). */
const BOARDED_UPPER: ReadonlySet<string> = new Set(['house', 'market', 'warehouse', 'prison', 'camp']);

/**
 * The floor inside a landmark's footprint, or null when it has no say (the terrain decides). `raised`
 * is true when the walker is more than a step above the ground (an upper storey, a gallery).
 */
export function landmarkFloor(category: string, id: string, raised: boolean): Surface | null {
  if (WOOD_IDS.has(id) || WOOD_CATEGORIES.has(category)) return 'wood';
  if (MARBLE_CATEGORIES.has(category)) return 'marble';
  if (raised && BOARDED_UPPER.has(category)) return 'wood';
  return null;
}

/** The deck of a bridge: a timber trestle (no arches) is boards, a masonry bridge is basalt-paved. */
export function bridgeFloor(arches: number): Surface {
  return arches === 0 ? 'wood' : 'cobbles';
}

/** Is (x, z) within `half` of the segment a-b? Pure. */
export function nearSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number, half: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t)) <= half;
}

/** Floors of the interior cells (src/world/interiors); a cell not listed is worked stone. */
export function interiorFloor(cell: string): Surface {
  return cell === 'columna-summa' ? 'marble' : 'stone';
}

/** The acoustic space of a building and the music it brings (a shut temple has none: the Lemuria). */
export interface Space {
  reverb: ReverbPreset;
  music: MusicRequest | null;
}

/** 'Temples' that are sacred areas or precincts around open courts: no cella tone (the sky is the roof). */
const OPEN_PRECINCTS: ReadonlySet<string> = new Set(['temple-divus-claudius', 'iseum-campense', 'iseum-labicana', 'largo-argentina-temples', 'sant-omobono-temples', 'templum-gentis-flaviae']);

export function categorySpace(category: string, id: string, area: number, templesShut = false): Space | null {
  switch (category) {
    case 'temple':
      return OPEN_PRECINCTS.has(id) ? null : { reverb: 'temple', music: templesShut ? null : 'temple' };
    case 'basilica':
    case 'curia':
    case 'library':
      return { reverb: 'hall', music: null };
    case 'baths':
      return area <= 20000 ? { reverb: 'baths', music: null } : null;
    case 'prison':
      return { reverb: 'cave', music: null };
    case 'amphitheatre':
    case 'theatre':
      return { reverb: 'arena', music: null };
    default:
      return null;
  }
}

/** The interior cell reverbs (the Column's stair is a stone tube). */
export function interiorReverb(cell: string): ReverbPreset | null {
  return cell === 'dun-columna' ? 'stair' : null;
}

/**
 * What the title and the character stage play: the Epitaph of Seikilos on the harp, then with a
 * flute, then a long silence. Everything else is the world's own music ('explore').
 */
export function flowMusic(flowState: string | undefined): MusicRequest {
  return flowState === 'title' || flowState === 'creation' ? 'seikilos' : 'explore';
}

/** The Lemuria night (9, 11, 13 May after dark): the dead are about, and the one tune for them. */
export function lemuriaMusic(festivals: readonly string[], isNight: boolean): MusicRequest | null {
  return isNight && festivals.includes('fest-lemuria') ? 'seikilos' : null;
}
