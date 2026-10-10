/**
 * Sound for Rome: the audio engine, the player's footsteps on the ground under them, ambience zones
 * (the fora's crowds, the markets, the Tiber; the hour curves already bring crickets, owls and night
 * carts after dark) and the music state (explore; combat and tension when the combat module says so).
 */
import { installAudio, type AudioEngine, type Surface } from '../audio';
import type { Game, System } from '../core/Game';
import type { MusicRequest } from '../audio';
import * as atlas from '../data/atlas';
import type { Surface as TerrainSurface } from '../world/terrain/Terrain';
import { footstepSound } from '../world/terrain/surface';
import { L } from '../world/terrain/splat';
import { WORLD_SCALE as K, toGame } from '../world/coords';
import { footprintContains } from '../content/ground';
import { templesShut, todaysFestivals } from '../content/director';
import { bridgeFloor, categorySpace, flowMusic, interiorFloor, interiorReverb, landmarkFloor, lemuriaMusic, nearSegment, type Space } from '../audio/places';

/**
 * Terrain surface → footstep surface: the terrain module's own mapping (mud → dirt, gravel and
 * sand → gravel, paving and rock → stone), except that anything above the terrain (paving, steps,
 * floors, bridges) is stone. Pure.
 */
export function footstepSurface(terrain: TerrainSurface | null, aboveGround: number): Surface {
  if (aboveGround > 0.15 || !terrain) return 'stone';
  return footstepSound(terrain);
}

/**
 * What a walker hears underfoot: the terrain's surface refined for the city. Paving is marble where
 * the travertine layer is stronger (the fora) and cobbles where it is basalt (the roads); sand is its
 * own sound; anything built above or below the terrain (steps, floors, bridges, interiors) is worked
 * stone. `travertine` and `basalt` are the splat weights at the spot (only read for paving). Pure.
 */
export function groundSurface(terrain: TerrainSurface | null, offGround: number, travertine = 0, basalt = 0): Surface {
  if (!terrain || Math.abs(offGround) > 0.15) return 'stone';
  if (terrain === 'paved') return travertine > basalt ? 'marble' : 'cobbles';
  if (terrain === 'sand') return 'sand';
  return footstepSound(terrain);
}

/**
 * Is a walker on the bed of a river or pond, with water around the ankles to the waist? `depth` is
 * the water surface minus the ground (game m, negative on dry land), `offGround` the feet above the
 * ground. Deeper than a metre they swim, which has its own sounds. Pure.
 */
export function isWading(depth: number, offGround: number): boolean {
  return depth > 0.04 && depth < 1.1 && Math.abs(offGround) <= 0.3;
}

/** Crowds and markets by atlas landmark: [id, layer, volume, reverb]. */
const ZONES: [string, 'crowd' | 'market' | 'fountain', number, 'forum' | 'street' | 'open' | null][] = [
  ['forum-romanum', 'crowd', 1, 'forum'],
  ['rostra', 'crowd', 1, 'forum'],
  ['basilica-julia', 'crowd', 0.9, 'forum'],
  ['basilica-aemilia', 'crowd', 0.9, 'forum'],
  ['forum-caesar', 'crowd', 0.7, 'forum'],
  ['forum-augustus', 'crowd', 0.6, 'forum'],
  ['forum-nerva', 'crowd', 0.8, 'street'],
  ['forum-trajan', 'crowd', 0.8, 'forum'],
  ['markets-trajan', 'market', 1, 'street'],
  ['macellum-magnum', 'market', 1, 'street'],
  ['forum-boarium', 'market', 0.9, 'open'],
  ['forum-holitorium', 'market', 0.9, 'open'],
  ['portus-tiberinus', 'market', 0.7, 'open'],
  ['subura', 'crowd', 0.6, 'street'],
  ['circus-maximus', 'crowd', 0.35, 'open'],
  ['lacus-juturnae', 'fountain', 0.7, null],
  ['meta-sudans', 'fountain', 0.9, null],
  ['lacus-servilius', 'fountain', 0.7, null],
];

/** A building the walker can stand in: its footprint (real m, atlas), a quick reject circle and what it sounds like. */
interface Place {
  lm: atlas.Landmark;
  x: number;
  z: number;
  /** Radius (game m) that surely holds the footprint. */
  reach: number;
  space: Space | null;
  /** Footprint area (m²). */
  area: number;
}

interface Deck {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  half: number;
  floor: Surface;
}

function footprintExtent(fp: atlas.Landmark['footprint'], center: readonly [number, number]): { reach: number; area: number } {
  switch (fp.kind) {
    case 'rect':
      return { reach: Math.hypot(fp.w, fp.d) / 2, area: fp.w * fp.d };
    case 'ellipse':
      return { reach: Math.max(fp.rx, fp.rz), area: Math.PI * fp.rx * fp.rz };
    case 'circle':
      return { reach: fp.r, area: Math.PI * fp.r * fp.r };
    default: {
      let reach = 0;
      for (const [px, pz] of fp.points) reach = Math.max(reach, Math.hypot(px - center[0], pz - center[1]));
      return { reach, area: Math.PI * reach * reach * 0.6 };
    }
  }
}

/** Every landmark that has a floor or a room tone of its own, and every bridge deck (built once). */
function buildPlaces(): { places: Place[]; decks: Deck[] } {
  const places: Place[] = [];
  for (const lm of atlas.LANDMARKS) {
    const probe = landmarkFloor(lm.category, lm.id, false) ?? landmarkFloor(lm.category, lm.id, true);
    const { reach, area } = footprintExtent(lm.footprint, lm.center);
    const space = categorySpace(lm.category, lm.id, area);
    if (!probe && !space) continue;
    const [x, z] = toGame(lm.center[0], lm.center[1]);
    places.push({ lm, x, z, reach: reach * K + 3, space, area });
  }
  const decks: Deck[] = atlas.BRIDGES.map((b) => {
    const [ax, az] = toGame(b.a[0], b.a[1]);
    const [bx, bz] = toGame(b.b[0], b.b[1]);
    return { ax, az, bx, bz, half: (b.width * K) / 2 + 0.6, floor: bridgeFloor(b.arches) };
  });
  return { places, decks };
}

/** The music director's state follows combat ('combat' while fighting, 'tension' while hunted), the title and the Lemuria night. */
class MusicDriver implements System {
  readonly name = 'gameMusic';
  readonly priority = 104;
  private acc = 0;
  private secs = 0;
  private combat = false;
  private tension = false;
  private flow: MusicRequest | undefined;
  private lemuria: MusicRequest | null = null;
  private place: Place | null = null;
  private cell: string | null = null;
  private roomMusic: MusicRequest | null = null;

  constructor(
    private readonly game: Game,
    private readonly audio: AudioEngine,
  ) {}

  lateUpdate(dt: number) {
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const g = this.game as Game & { combat?: { active?: boolean; alerted?: boolean | (() => boolean) } };
    const combat = !!(g.combat?.active ?? g.player?.sheet?.vitals.inCombat);
    const alerted = typeof g.combat?.alerted === 'function' ? g.combat.alerted() : !!g.combat?.alerted;
    if (combat !== this.combat) this.audio.music.setOverride('combat', (this.combat = combat) ? 'combat' : null, 10);
    const tension = alerted && !combat;
    if (tension !== this.tension) this.audio.music.setOverride('tension', (this.tension = tension) ? 'tension' : null, 5);
    this.moments();
    this.rooms();
  }

  /** The title and the character stage play the Epitaph of Seikilos; the Lemuria night plays it again, for the dead. */
  private moments() {
    const g = this.game as Game & { flow?: { state?: string } };
    const flow = flowMusic(g.flow?.state);
    if (flow !== this.flow) {
      this.flow = flow;
      this.audio.music.setState(flow);
    }
    if ((this.secs += 0.25) < 2) return;
    this.secs = 0;
    const night = g.flow?.state === 'playing' ? lemuriaMusic(todaysFestivals(this.game), this.game.time.isNight) : null;
    if (night !== this.lemuria) this.audio.music.setOverride('lemuria', (this.lemuria = night), 3);
  }

  /** The room the player is in: a temple's cella, a basilica, the baths, the Column's stair (reverb, and a temple's music). */
  private rooms() {
    const p = this.game.player?.position;
    if (!p) return;
    const cell = this.game.interiors?.current() ?? null;
    let place = this.place;
    // Leave a place only a little beyond its edge, enter only well inside (no flapping on the threshold).
    if (place && !(footprintContains(place.lm, p.x, p.z, 1.5) && Math.abs(p.y - this.groundY(p.x, p.z, p.y)) < 12)) place = null;
    if (!place && !cell) place = this.placeAt(p.x, p.z, p.y);
    const space = cell ? null : (place?.space ?? null);
    if (place !== this.place || cell !== this.cell) {
      this.place = place;
      this.cell = cell;
      const reverb = (cell && interiorReverb(cell)) || space?.reverb || null;
      if (reverb) this.audio.prepareEnvironment(reverb);
      this.audio.ambience.forcedReverb = reverb;
    }
    // The music is re-read each time: a festival can begin or end while the player stands in the cella.
    const music = space?.music === 'temple' && templesShut(this.game) ? null : (space?.music ?? null);
    if (music !== this.roomMusic) this.audio.music.setOverride('room', (this.roomMusic = music), 1.5);
  }

  private groundY(x: number, z: number, y: number) {
    return this.game.terrain?.heightAt(x, z) ?? y;
  }

  private placeAt(x: number, z: number, y: number): Place | null {
    // A temple's cella is two storeys of stone under the player at most; ignore the roof of the city above.
    if (Math.abs(y - this.groundY(x, z, y)) > 12) return null;
    for (const pl of PLACES.places) {
      if (!pl.space || Math.hypot(x - pl.x, z - pl.z) > pl.reach) continue;
      if (footprintContains(pl.lm, x, z, -0.5)) return pl;
    }
    return null;
  }
}

const PLACES = buildPlaces();

/** The floor under (x, z) if a building or a bridge deck decides it, else null. */
function builtFloor(x: number, z: number, off: number): Surface | null {
  for (const d of PLACES.decks) if (off > 0.15 && nearSegment(x, z, d.ax, d.az, d.bx, d.bz, d.half)) return d.floor;
  for (const pl of PLACES.places) {
    if (Math.hypot(x - pl.x, z - pl.z) > pl.reach) continue;
    const f = landmarkFloor(pl.lm.category, pl.lm.id, off > 0.4);
    if (f && footprintContains(pl.lm, x, z)) return f;
  }
  return null;
}

export interface GameAudio {
  engine: AudioEngine;
  /** Re-attach the player's footsteps (voice follows the character's sex). */
  attachPlayer(sex: 'male' | 'female', gear: 'none' | 'cloth' | 'armor'): void;
}

export function installGameAudio(game: Game): GameAudio {
  const audio = installAudio(game);
  audio.ambience.setBase({ city: 0.8, birds: 0.6, swifts: 0.6, wind: 0.35, crickets: 0.8, owl: 0.6, carts: 0.6, dogs: 0.35, cicadas: 0.5 });
  // Game y of the valley floors (~8) and of the hilltops (~28).
  audio.ambience.altitude = { low: 10, high: 30 };
  for (const [id, layer, volume, reverb] of ZONES) {
    const lm = atlas.LANDMARK_BY_ID[id];
    if (!lm) continue;
    const [x, z] = toGame(lm.center[0], lm.center[1]);
    const fp = lm.footprint;
    const r = fp.kind === 'rect' ? Math.min(fp.w, fp.d) / 2 : fp.kind === 'ellipse' ? Math.min(fp.rx, fp.rz) : fp.kind === 'circle' ? fp.r : 40;
    const radius = Math.max(layer === 'fountain' ? 4 : 18, Math.min(120, r * K));
    audio.ambience.addZone({ name: id, center: { x, y: 0, z }, radius, fade: layer === 'fountain' ? 10 : undefined, layers: [{ id: layer, volume }], reverb: reverb ?? undefined });
  }
  // The Tiber: a chain of river zones along the core's stretch.
  const tiber = atlas.RIVERS.find((r) => r.id === 'tiber');
  const core = atlas.CORE_BOUNDS;
  if (tiber) {
    tiber.centerline.forEach(([rx, rz], i) => {
      if (rx < core.minX - 400 || rx > core.maxX + 400 || rz < core.minZ - 400 || rz > core.maxZ + 400) return;
      const [x, z] = toGame(rx, rz);
      audio.ambience.addZone({ name: `tiber-${i}`, center: { x, y: 0, z }, radius: Math.max(20, (tiber.width[i] ?? 80) * K * 0.5), fade: 35, layers: [{ id: 'river', volume: 0.8 }] });
    });
  }
  audio.music.setState('explore');
  game.addSystem(new MusicDriver(game, audio));

  let handle: { detach(): void } | null = null;
  // The Colosseum's arena floor is sand (the atlas gives it as 83 × 48 m inside a 188 × 156 m ellipse:
  // the ellipse shrunk by 31.5 game m on both axes leaves about that).
  const colosseum = atlas.LANDMARK_BY_ID['colosseum'];
  const [arenaX, arenaZ] = colosseum ? toGame(colosseum.center[0], colosseum.center[1]) : [0, 0];
  const surfaceAt = (x: number, y: number, z: number): Surface => {
    const t = game.terrain;
    if (!t) return 'stone';
    if (colosseum && Math.hypot(x - arenaX, z - arenaZ) < 30 && footprintContains(colosseum, x, z, -31.5)) return 'sand';
    const kind = t.surfaceAt(x, z);
    const off = y - t.heightAt(x, z);
    // Interior cells sit far under or over the world: their own floors.
    const cell = Math.abs(off) > 15 ? game.interiors?.current() : null;
    if (cell) return interiorFloor(cell);
    // Marble in the temples and basilicas, boards in the store-rooms and on timber bridges.
    const built = off > -1.5 ? builtFloor(x, z, off) : null;
    if (built) return built;
    // Wading: the river bed under shallow water splashes (the terrain has no water layer of its own).
    if (isWading(game.water?.depthAt(x, z) ?? -Infinity, off)) return 'water';
    if (kind !== 'paved' || Math.abs(off) > 0.15) return groundSurface(kind, off);
    const w = t.weightsAt(x, z);
    return groundSurface(kind, off, w[L.travertine], w[L.basalt]);
  };
  // Everyone's footsteps (the player's, the citizens', the combatants') read the same ground.
  audio.footsteps.surfaceAt = surfaceAt;
  return {
    engine: audio,
    attachPlayer(sex, gear) {
      handle?.detach();
      const p = game.player;
      if (!p) return;
      handle = audio.footsteps.attach(p, { surfaceAt, spatial: () => p.viewMode === 'third', voice: sex === 'female' ? 'f' : 'm', gear });
    },
  };
}
