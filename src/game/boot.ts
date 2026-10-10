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
import { classicRequested, loadRealBodies } from '../actors/avatar/real/RealBody';
import { installFaces } from '../actors/avatar/real/faces';
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
import { installInteriors } from '../world/interiors/install';
import { shouldWelcome, showWelcome } from './welcome';
import { FIGHTS, startBout } from './bouts';
import { applyCheckpoint, checkpoint } from './checkpoints';
import { installConsole } from '../dev/console/Console';
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
  /** `?fight=nereus` (or pullus, auctus): straight into that Ludus bout, for testing. */
  fight: number | null;
  /** `?part=castor` etc.: straight into one portion of the opening (game/checkpoints). */
  part: string | null;
  /** `?story=1`: no menus, but the story's own opening (the cart at the Porta Capena, Festus speaking first). */
  story: boolean;
}

/**
 * A plain link (no options) is the owner's test build: no menus, the default character, in the Forum
 * at mid-morning (PLAY_SPAWN/PLAY_HOUR) with the opening skipped. `?story=1` plays the story's real
 * opening instead: the night cart at the Porta Capena, 11 May at 04:30, with the courier Festus
 * talking first (docs/STORY.md). `?menu=1` runs the full flow (control preset, title, character
 * creation, then the same opening); `?quick=1` is the agents' quick start at the Porta Capena
 * (nobody talks first); `?at=<landmark>` spawns there. `?fight=nereus` (or `pullus`, `auctus`) skips the Ludus
 * questline up to that bout and starts it: the boss fight, one click away for testing.
 */
export const PLAY_SPAWN = 'rostra';
export const PLAY_HOUR = 10;

export function romeParams(search: string): RomeParams {
  const q = new URLSearchParams(search);
  const menu = q.get('menu') === '1';
  const fight = FIGHTS.indexOf((q.get('fight') ?? '').toLowerCase()) + 1 || null;
  const part = checkpoint(q.get('part'));
  const plain = !menu && q.get('quick') !== '1' && !q.get('at') && !fight && !part;
  const story = plain && q.get('story') === '1';
  // The plain link drops the player in the Forum at mid-morning, past the opening.
  const forum = plain && !story;
  const at = q.get('at') || (part ? part.at : fight ? 'ludus-magnus' : forum ? PLAY_SPAWN : null);
  const hour = q.get('hour');
  return {
    quick: q.get('quick') === '1' || plain || (!!at && !menu),
    story,
    at,
    hour: hour !== null && hour !== '' && Number.isFinite(Number(hour)) ? Number(hour) : part ? part.hour : fight || forum ? PLAY_HOUR : null,
    fight,
    part: part?.id ?? null,
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
  // The realistic bodies load beside the city build; every avatar from here on starts with one.
  if (!classicRequested()) await loadRealBodies(game.renderer).catch(() => {});
  const player = setupPlayer(game, { x: 0, y: 30, z: 0 }, 0, createHumanoid(outfitAppearance(look, {})));
  avatarLod.viewer = game.camera;
  const rpg = installRpg(game, { newGame: false, systems: V01_SYSTEMS });
  registerAtlasLocations(game);
  registerMarkerResolvers(game);
  const audio = installGameAudio(game);
  const opts: FlowOptions = { quick: params.quick, story: params.story, at: params.at, hour: params.hour, character: params.character, audio };
  const flow = new GameFlow(game, ui, rpg, opts);
  game.flow = flow;
  game.addSystem(flow);
  wireUi(game, ui, rpg, flow);
  installConsole(game, ui);
  guardUnload(flow);
  installInteriors(game);
  await installOptionalModules(game);
  installFaces(game);
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
    // The shareable build's first view: a welcome card with the keys that matter.
    if (params.story && shouldWelcome(location.search)) void showWelcome(game, ui.root);
    if (params.fight) void startBout(game, params.fight);
    const cp = checkpoint(params.part);
    if (cp) void applyCheckpoint(game, cp);
    if (game.gpu?.software) {
      // The browser draws 3D on the CPU: no setting can make up for that.
      setTimeout(() => game.events.emit('ui:notify', { text: 'Your browser isn’t using the graphics card (hardware acceleration is off), so the game will be slow. Turn it on in the browser’s settings and restart it.', kind: 'warning' }), 2500);
    }
  } else {
    ui.block('loading', false);
    await flow.showTitle();
    void loading.done();
  }
  return flow;
}
