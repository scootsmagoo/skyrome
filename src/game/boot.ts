/**
 * Boots the game in Rome (?scene=rome): the loading screen while the city is assembled, every
 * service installed and wired, then the title over the live city — or, with `&quick=1` or
 * `&at=<landmark>`, straight into play with the default character (agents, tests, landmark crews).
 *
 *   ?scene=rome                 title → New Game → creation → Porta Capena, 11 May 113, 04:30
 *   &quick=1                    skip the menus (default character, Porta Capena)
 *   &at=<landmark id>           skip the menus and spawn by that atlas landmark
 *   &hour=<0-24>                start hour (quick mode)
 *   &origin=<id>&sex=female     the quick-start character
 *   &extent=city                build every landmark (default: the core)
 *   &menu=1                     show the title even with &at=
 */
import type { Game } from '../core/Game';
import { whenTexturesLoaded } from '../gfx/materials';
import { Interactions } from '../interaction/Interactions';
import { createHumanoid } from '../actors/avatar/HumanoidAvatar';
import { avatarLod } from '../actors/avatar/lod';
import { installRpg } from '../rpg/install';
import { setupPlayer } from '../scenes/common';
import { installUI, showLoading } from '../ui';
import { WorldRegistry } from '../world/WorldRegistry';
import { buildRome, type RomeExtent } from '../world/rome/buildRome';
import { installSky } from '../world/sky';
import { installGameAudio } from './audio';
import { lookById, outfitAppearance, type CharacterSpec } from './character';
import { GameFlow, START_DATE, START_HOUR, TITLE_HOUR, type FlowOptions } from './GameFlow';
import { registerAtlasLocations } from './locations';
import { installOptionalModules } from './optional';
import { guardUnload, registerMarkerResolvers, wireUi } from './wiring';

/**
 * Perk systems that work in v0.1 (§17.1; the rules for these exist in src/rpg): perks needing any
 * other system (stealth, lockpicking, bows, crafting…) are hidden until it ships (§5.5).
 */
export const V01_SYSTEMS = ['bleeding', 'market-days', 'vows', 'omens', 'fences', 'investments'];

export interface RomeParams {
  quick: boolean;
  at: string | null;
  hour: number | null;
  extent: RomeExtent;
  character: Partial<CharacterSpec>;
}

export function romeParams(search: string): RomeParams {
  const q = new URLSearchParams(search);
  const at = q.get('at');
  const hour = q.get('hour');
  return {
    quick: q.get('quick') === '1' || (!!at && q.get('menu') !== '1'),
    at,
    hour: hour !== null && hour !== '' && Number.isFinite(Number(hour)) ? Number(hour) : null,
    extent: (q.get('extent') as RomeExtent) === 'city' ? 'city' : 'core',
    character: {
      origin: q.get('origin') ?? undefined,
      sex: q.get('sex') === 'female' ? 'female' : q.get('sex') === 'male' ? 'male' : undefined,
      name: q.get('name') ?? undefined,
    },
  };
}

export async function startRome(game: Game, uiRoot: HTMLElement, params: RomeParams): Promise<GameFlow> {
  const t0 = performance.now();
  // The calendar starts on 11 May AD 113 (GDD §2.1) before the sky reads the date.
  Object.assign(game.time.start, START_DATE);
  const loading = showLoading(uiRoot, { bindings: game.input.bindings });
  loading.progress(0.01, 'Preparing the city…');
  const ui = installUI(game, uiRoot);
  ui.block('loading', true);

  game.world = game.addSystem(new WorldRegistry(game));
  game.interactions = game.addSystem(new Interactions(game));
  await buildRome(game, { extent: params.extent, onProgress: (f, label) => loading.progress(0.04 + f * 0.82, label) });
  loading.progress(0.88, 'Fetching the marble');
  await whenTexturesLoaded().catch(() => {});
  game.time.restore({ totalHours: params.quick ? START_HOUR : TITLE_HOUR });
  installSky(game);

  // The player stands at the Porta Capena from the start (the creation stage is there too).
  loading.progress(0.92, 'Waking the city');
  const look = lookById('m-urbanus', 'male');
  const player = setupPlayer(game, { x: 0, y: 30, z: 0 }, 0, createHumanoid(outfitAppearance(look, {})));
  avatarLod.viewer = game.camera;
  const rpg = installRpg(game, { newGame: false, systems: V01_SYSTEMS });
  registerAtlasLocations(game);
  registerMarkerResolvers(game);
  const audio = installGameAudio(game);
  const opts: FlowOptions = { quick: params.quick, at: params.at, hour: params.hour, character: params.character, audio };
  const flow = new GameFlow(game, ui, rpg, opts);
  game.flow = flow;
  game.addSystem(flow);
  wireUi(game, ui, rpg, flow);
  guardUnload(flow);
  await installOptionalModules(game);
  const spawn = flow.spawnPoint(params.quick ? params.at : null);
  player.teleport(spawn.position, spawn.heading);
  player.yaw = spawn.heading + Math.PI;
  game.world.refreshAll();
  flow.timings.bootMs = Math.round(performance.now() - t0);

  loading.progress(1, 'Roma');
  if (params.quick) {
    await flow.quickStart();
    ui.block('loading', false);
    void loading.done();
  } else {
    ui.block('loading', false);
    await flow.showTitle();
    void loading.done();
  }
  return flow;
}
