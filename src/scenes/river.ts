/**
 * River district test bed: the Forum Boarium, Portus Tiberinus, Forum Holitorium, Theatre of
 * Marcellus, Porticus Octaviae, Circus Flaminius, Tiber Island and the Tiber bridges on the real
 * terrain, with a flat stand-in water surface (until the water module lands).
 *   ?scene=river[&at=<landmark or bridge id>][&hour=9][&water=0][&far=1 (all bridges, wide terrain)]
 *   [&cam=x,y,z,tx,ty,tz (game metres)]
 */
import * as THREE from 'three';
import * as atlas from '../data/atlas';
import type { Game } from '../core/Game';
import { devCamera } from '../dev/devCamera';
import { getMaterial, whenTexturesLoaded } from '../gfx/materials';
import { Interactions } from '../interaction/Interactions';
import { WorldRegistry } from '../world/WorldRegistry';
import { buildBridges } from '../world/bridges';
import { buildLandmarks } from '../world/landmarks/buildLandmarks';
import { buildHeightmap } from '../world/terrain/heightmap';
import { Terrain } from '../world/terrain/Terrain';
import { landmarkPads, spawnAtLandmark } from '../world/rome/buildRome';
import { buildWater } from '../world/water';
import { installSky } from '../world/sky';
import { setupPlayer } from './common';
import type { SceneDef } from './types';

/** Every landmark the river module builds (prefix river-). */
export const RIVER_IDS = [
  'forum-boarium', 'portus-tiberinus', 'temple-portunus', 'temple-hercules-victor', 'ara-maxima', 'cloaca-maxima-outlet',
  'forum-holitorium', 'temple-janus-holitorium', 'temple-juno-sospita', 'temple-spes', 'columna-lactaria',
  'theatre-marcellus', 'temple-apollo-sosianus', 'temple-bellona', 'columna-bellica', 'porticus-octaviae', 'circus-flaminius',
  'temple-aesculapius', 'island-prow', 'island-obelisk',
];

const scene: SceneDef = {
  title: 'River district',
  description: 'Forum Boarium, Holitorium, Theatre of Marcellus, Tiber Island and the bridges',
  async setup(game: Game) {
    const p = new URLSearchParams(location.search);
    game.world = game.addSystem(new WorldRegistry(game));
    game.interactions = game.addSystem(new Interactions(game));
    const far = p.get('far') === '1';
    const b = far ? atlas.CITY_BOUNDS : { minX: -1000, maxX: -50, minZ: -350, maxZ: 800 };
    const hm = buildHeightmap({ ...atlas, bounds: b } as any, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
    game.heightmap = hm;
    game.terrain = new Terrain(game, hm);
    const only = p.get('ids')?.split(',').filter(Boolean) ?? RIVER_IDS;
    await buildLandmarks(game, atlas.LANDMARKS, hm, { only, highDetailPriority: 3 });
    await buildWater(game, atlas, hm);
    await buildBridges(game, atlas, hm, far ? {} : { only: ['pons-fabricius', 'pons-cestius', 'pons-aemilius', 'pons-sublicius'] });
    if (p.get('water') !== '0') {
      // Stand-in water: a flat sheet at the river level over the district.
      const w = new THREE.Mesh(new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ).rotateX(-Math.PI / 2), getMaterial('water'));
      w.position.set(((b.minX + b.maxX) / 2) * 0.6, hm.waterLevelY, ((b.minZ + b.maxZ) / 2) * 0.6);
      w.scale.setScalar(0.6);
      w.receiveShadow = true;
      w.name = 'stand-in water';
      game.scene.add(w);
    }
    await whenTexturesLoaded().catch(() => {});
    const at = p.get('at') ?? 'temple-portunus';
    let spawn = spawnAtLandmark(game, at, 14);
    const br = game.bridges?.get(at);
    if (br) {
      const s = br.spots.find((x) => x.id.endsWith(':end-a'));
      if (s) spawn = { position: s.position.clone().setY(s.position.y + 0.1), heading: s.heading ?? 0 };
    }
    spawn ??= { position: new THREE.Vector3(-170, 8, 220), heading: 0 };
    const player = setupPlayer(game, spawn.position, spawn.heading);
    player.yaw = spawn.heading + Math.PI;
    const hour = p.get('hour');
    game.time.totalHours = hour ? Number(hour) : 9.5;
    installSky(game);
    const cam = p.get('cam')?.split(',').map(Number);
    if (cam && cam.length === 6) devCamera(game).look({ x: cam[0], y: cam[1], z: cam[2] }, { x: cam[3], y: cam[4], z: cam[5] });
  },
};
export default scene;
