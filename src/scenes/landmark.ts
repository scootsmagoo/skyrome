/**
 * Landmark viewer: real terrain, only the listed landmarks, sky, a player in front.
 *   ?scene=landmark&id=colosseum[&ids=meta-sudans,arch-titus][&cam=front|aerial|side|back|inside|player][&hour=9][&dist=1.0]
 * `cam` views are framed from the landmark's footprint and facade bearing; `dist` scales the distance.
 */
import * as THREE from 'three';
import * as atlas from '../data/atlas';
import type { Game } from '../core/Game';
import { devCamera } from '../dev/devCamera';
import { whenTexturesLoaded } from '../gfx/materials';
import { Interactions } from '../interaction/Interactions';
import { WorldRegistry } from '../world/WorldRegistry';
import { toGame } from '../world/coords';
import { buildLandmarks } from '../world/landmarks/buildLandmarks';
import { footprintRadius } from '../world/landmarks/footprint';
import { buildHeightmap } from '../world/terrain/heightmap';
import { Terrain } from '../world/terrain/Terrain';
import { landmarkPads, spawnAtLandmark } from '../world/rome/buildRome';
import { installSky } from '../world/sky';
import { setupPlayer } from './common';
import type { SceneDef } from './types';

const scene: SceneDef = {
  title: 'Landmark viewer',
  description: 'One landmark on the real terrain',
  async setup(game: Game) {
    const p = new URLSearchParams(location.search);
    const id = p.get('id') ?? 'colosseum';
    const ids = [id, ...(p.get('ids')?.split(',').filter(Boolean) ?? [])];
    const lm = atlas.LANDMARK_BY_ID[id];
    if (!lm) throw new Error(`Unknown landmark id "${id}"`);
    game.world = game.addSystem(new WorldRegistry(game));
    game.interactions = game.addSystem(new Interactions(game));
    // Terrain around the landmark only (fast), with the same pads as the full game.
    const r = Math.max(400, footprintRadius(lm) * 2.5);
    const b = { minX: lm.center[0] - r, maxX: lm.center[0] + r, minZ: lm.center[1] - r, maxZ: lm.center[1] + r };
    const hm = buildHeightmap({ ...atlas, bounds: b } as any, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
    game.heightmap = hm;
    game.terrain = new Terrain(game, hm);
    await buildLandmarks(game, atlas.LANDMARKS, hm, { only: ids, highDetailPriority: 3 });
    await whenTexturesLoaded().catch(() => {});
    const R = footprintRadius(lm) * 0.6;
    const spawn = spawnAtLandmark(game, id, R + 8) ?? { position: new THREE.Vector3(), heading: 0 };
    const player = setupPlayer(game, spawn.position, spawn.heading);
    player.yaw = spawn.heading + Math.PI;
    const hour = p.get('hour');
    game.time.totalHours = hour ? Number(hour) : 9.5;
    installSky(game);

    const cam = p.get('cam') ?? 'player';
    if (cam !== 'player') {
      const k = Number(p.get('dist') ?? 1);
      const [gx, gz] = toGame(lm.center[0], lm.center[1]);
      const gy = hm.heightAt(gx, gz);
      const th = (lm.rotation * Math.PI) / 180;
      const fx = Math.sin(th), fz = -Math.cos(th); // facade normal
      const H = Math.max(10, lm.height * 0.6);
      const D = (R + 20) * 1.6 * k;
      const target = new THREE.Vector3(gx, gy + H * 0.4, gz);
      const views: Record<string, THREE.Vector3> = {
        front: new THREE.Vector3(gx + fx * D, gy + 2 + H * 0.25, gz + fz * D),
        back: new THREE.Vector3(gx - fx * D, gy + 2 + H * 0.25, gz - fz * D),
        side: new THREE.Vector3(gx - fz * D, gy + 2 + H * 0.25, gz + fx * D),
        aerial: new THREE.Vector3(gx + fx * D * 0.8 - fz * D * 0.5, gy + D * 0.9, gz + fz * D * 0.8 + fx * D * 0.5),
        inside: new THREE.Vector3(gx + fx * 2, gy + 1.7, gz + fz * 2),
      };
      const from = views[cam] ?? views.front;
      if (cam === 'inside') target.set(gx - fx * 20, gy + 1.7, gz - fz * 20);
      devCamera(game).look(from, target);
    }
  },
};
export default scene;
