/**
 * Sound for Rome: the audio engine, the player's footsteps on the ground under them, ambience zones
 * (the fora's crowds, the markets, the Tiber; the hour curves already bring crickets, owls and night
 * carts after dark) and the music state (explore; combat and tension when the combat module says so).
 */
import { installAudio, type AudioEngine, type Surface } from '../audio';
import type { Game, System } from '../core/Game';
import * as atlas from '../data/atlas';
import type { Surface as TerrainSurface } from '../world/terrain/Terrain';
import { WORLD_SCALE as K, toGame } from '../world/coords';

/** Terrain surface → footstep surface. Above the terrain (paving, steps, floors) is stone. Pure. */
export function footstepSurface(terrain: TerrainSurface | null, aboveGround: number): Surface {
  if (aboveGround > 0.15 || !terrain) return 'stone';
  switch (terrain) {
    case 'grass':
      return 'grass';
    case 'dirt':
      return 'dirt';
    case 'sand':
      return 'gravel';
    case 'water':
      return 'water';
    default:
      return 'stone';
  }
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

/** The music director's state follows combat: 'combat' while fighting, 'tension' while hunted. */
class MusicDriver implements System {
  readonly name = 'gameMusic';
  readonly priority = 104;
  private acc = 0;
  private combat = false;
  private tension = false;

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
  }
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
  const surfaceAt = (x: number, y: number, z: number): Surface => {
    const t = game.terrain;
    if (!t) return 'stone';
    return footstepSurface(t.surfaceAt(x, z), y - t.heightAt(x, z));
  };
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
