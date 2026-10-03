/**
 * The game world: Rome, AD 113.
 * URL options: &at=<landmark id> spawn near a landmark · &extent=city build every landmark ·
 * &hour=<0-24> start hour · &fly=1 free camera height boost for surveying.
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import { whenTexturesLoaded } from '../gfx/materials';
import { WorldRegistry } from '../world/WorldRegistry';
import { buildRome, spawnAtLandmark, type RomeExtent } from '../world/rome/buildRome';
import { installSky } from '../world/sky';
import { Interactions } from '../interaction/Interactions';
import { setupPlayer } from './common';
import { createHumanoid } from '../actors/avatar/HumanoidAvatar';
import { randomAppearance } from '../actors/avatar/variants';
import { Rng } from '../core/Rng';
import type { SceneDef } from './types';

const scene: SceneDef = {
  title: 'Rome',
  description: 'Rome, AD 113 — the game world',
  async setup(game: Game, ui: HTMLElement) {
    const params = new URLSearchParams(location.search);
    game.world = game.addSystem(new WorldRegistry(game));
    game.interactions = game.addSystem(new Interactions(game));
    const loading = simpleLoading(ui);
    await buildRome(game, {
      extent: (params.get('extent') as RomeExtent) ?? 'core',
      onProgress: (f, label) => loading.set(f, label),
    });
    await whenTexturesLoaded().catch(() => {});

    const at = params.get('at') ?? 'arch-titus';
    const spawn = spawnAtLandmark(game, at, 18) ?? { position: new THREE.Vector3(0, 10, 0), heading: 0 };
    const app = randomAppearance(new Rng('player'), 'legionary');
    const player = setupPlayer(game, spawn.position, spawn.heading, createHumanoid(app));
    player.yaw = spawn.heading + Math.PI;

    const hour = params.get('hour');
    if (hour) game.time.totalHours = Number(hour);
    installSky(game);
    game.world.refreshAll();
    loading.done();
  },
};
export default scene;

/** Minimal loading overlay until the UI module's loading screen is wired in. */
function simpleLoading(ui: HTMLElement) {
  const el = document.createElement('div');
  el.style.cssText =
    'position:absolute;inset:0;display:grid;place-items:center;background:#120d0a;color:#e8d9b8;font:20px/1.4 Cinzel,serif;letter-spacing:.08em;z-index:50';
  el.innerHTML = '<div style="text-align:center"><div style="font-size:42px">SKYROME</div><div class="lbl" style="font-size:14px;opacity:.8;margin-top:10px">…</div><div style="width:320px;height:4px;background:#3a2c20;margin:14px auto"><div class="bar" style="height:100%;width:0;background:#d9b35a"></div></div></div>';
  ui.appendChild(el);
  const lbl = el.querySelector('.lbl') as HTMLElement;
  const bar = el.querySelector('.bar') as HTMLElement;
  return {
    set(f: number, label: string) {
      bar.style.width = `${Math.round(f * 100)}%`;
      lbl.textContent = label;
    },
    done() {
      el.remove();
    },
  };
}
