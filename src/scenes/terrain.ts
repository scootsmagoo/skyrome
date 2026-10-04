/**
 * Terrain + Tiber test bed: the whole city's ground (CDLOD, splat textures), the river with its
 * quays and reeds, the sky, and the player. No landmarks unless asked (fast to boot).
 *
 *   ?scene=terrain[&cam=overview|river|palatine|capitol|island|aventine|cliffs|emporium|janiculum|player]
 *                 [&hour=9.5][&at=<landmark id>][&lm=1 core landmarks][&flat=1 no photo textures]
 *                 [&wire=1 LOD patch colours][&grass=0 no grass tufts]
 *
 * With a `cam` preset the camera flies freely: WASD move, arrow keys turn, Space / C rise and sink,
 * Shift goes faster. `cam=player` (or V) walks the player instead.
 */
import * as THREE from 'three';
import * as atlas from '../data/atlas';
import type { Game, System } from '../core/Game';
import { whenTexturesLoaded } from '../gfx/materials';
import { Interactions } from '../interaction/Interactions';
import { WorldRegistry } from '../world/WorldRegistry';
import { toGame } from '../world/coords';
import { buildLandmarks } from '../world/landmarks/buildLandmarks';
import { landmarkPads, spawnAtLandmark } from '../world/rome/buildRome';
import { installSky } from '../world/sky';
import { buildHeightmap } from '../world/terrain/heightmap';
import { Terrain } from '../world/terrain/Terrain';
import { addTerrainGrass } from '../world/terrain/grass';
import { buildWater } from '../world/water';
import { setupPlayer } from './common';
import type { SceneDef } from './types';

/** Camera presets in REAL atlas metres: [from x, from elev (m ASL), from z, to x, to elev, to z]. */
const VIEWS: Record<string, [number, number, number, number, number, number]> = {
  // The whole city from high above the Caelian, looking NW across the Tiber bend to the Vatican.
  overview: [1500, 1500, 1900, -900, 0, -500],
  // The great bend of the Tiber around the Campus Martius (Tarentum), from the SE.
  river: [-850, 150, -150, -1450, 5, -800],
  // From the Palatine over the Circus valley to the Aventine and the river.
  palatine: [180, 75, 380, -450, 10, 800],
  // From the Capitolium SW over the Tarpeian cliff to Tiber Island.
  capitol: [-190, 70, 90, -560, 5, 260],
  // Tiber Island and its bridges, low.
  island: [-380, 55, 120, -560, 6, 250],
  // The Aventine's river cliff and quays from across the water.
  aventine: [-820, 45, 660, -420, 30, 880],
  // The Capitoline cliffs from the Forum Holitorium.
  cliffs: [-330, 16, 200, -215, 40, 100],
  // The Emporium quays.
  emporium: [-700, 60, 1000, -950, 6, 1250],
  // The whole city from the Janiculum, looking east (performance worst case: everything in view).
  janiculum: [-1950, 170, 380, 100, 10, 150],
};

const scene: SceneDef = {
  title: 'Terrain and Tiber',
  description: 'City terrain (CDLOD splat), the Tiber, quays and reeds',
  async setup(game: Game) {
    const p = new URLSearchParams(location.search);
    game.world = game.addSystem(new WorldRegistry(game));
    game.interactions = game.addSystem(new Interactions(game));
    const t0 = performance.now();
    const hm = buildHeightmap(
      { BASE_ELEVATION: atlas.BASE_ELEVATION, HILLS: atlas.HILLS, LOWLANDS: atlas.LOWLANDS, RIVERS: atlas.RIVERS, ISLANDS: atlas.ISLANDS, ROADS: atlas.ROADS, bounds: atlas.CITY_BOUNDS },
      { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) },
    );
    const t1 = performance.now();
    game.heightmap = hm;
    game.terrain = new Terrain(game, hm, { flat: p.get('flat') === '1' });
    if (p.get('wire') === '1') game.terrain.uniforms.uDebugLod.value = 1;
    if (p.get('grass') !== '0') addTerrainGrass(game, game.terrain);
    const t2 = performance.now();
    await buildWater(game, atlas, hm);
    const t3 = performance.now();
    if (p.get('lm') === '1') {
      await buildLandmarks(game, atlas.LANDMARKS, hm, { bounds: atlas.CORE_BOUNDS, highDetailPriority: 1 });
    }
    await Promise.all([whenTexturesLoaded().catch(() => {}), game.terrain.ready]);
    console.info(`[terrain scene] heightmap ${(t1 - t0).toFixed(0)} ms, terrain ${(t2 - t1).toFixed(0)} ms, water ${(t3 - t2).toFixed(0)} ms`);
    (window as unknown as { __terrainTimings: object }).__terrainTimings = { heightmap: t1 - t0, terrain: t2 - t1, water: t3 - t2 };

    const at = p.get('at') ?? 'temple-portunus';
    const spawn = spawnAtLandmark(game, at, 22) ?? { position: new THREE.Vector3(0, 10, 0), heading: 0 };
    const player = setupPlayer(game, spawn.position, spawn.heading);
    player.yaw = spawn.heading + Math.PI;
    const hour = p.get('hour');
    game.time.totalHours = hour ? Number(hour) : 9.5;
    installSky(game);

    const cam = p.get('cam') ?? 'overview';
    const v = VIEWS[cam];
    if (v) {
      // The fly camera takes the controls: no camera rig, and the player stands still (its
      // controller would otherwise also consume the mouse look).
      for (const name of ['cameraRig', 'playerController']) {
        const sys = game.getSystem(name);
        if (sys) game.removeSystem(sys);
      }
      player.canMove = false;
      const [fx, fz] = toGame(v[0], v[2]);
      const [tx, tz] = toGame(v[3], v[5]);
      game.camera.position.set(fx, v[1] * 0.6, fz);
      game.camera.lookAt(tx, v[4] * 0.6, tz);
      game.addSystem(new FlyCamera(game));
    }
    game.world.refreshAll();

    // `window.__terrainBench(frames)`: synchronous render timing (scene + post) for shot.mjs.
    (window as unknown as { __terrainBench: (n?: number) => object }).__terrainBench = (frames = 120) => {
      const gl = game.renderer.getContext();
      const px = new Uint8Array(4);
      game.renderFrame();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) game.renderFrame();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const ms = (performance.now() - t0) / frames;
      game.renderFrame();
      const info = game.renderer.info.render;
      return { msPerFrame: +ms.toFixed(3), drawCalls: info.calls, triangles: info.triangles, terrain: game.terrain.lodStats };
    };
  },
};
export default scene;

/** Free camera for surveying (dev only). */
class FlyCamera implements System {
  readonly name = 'flyCamera';
  readonly priority = 100;
  private yaw: number;
  private pitch: number;
  constructor(private readonly game: Game) {
    const e = new THREE.Euler().setFromQuaternion(game.camera.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
  }
  lateUpdate(dt: number) {
    const { input, camera } = this.game;
    const look = input.consumeLook(dt);
    this.yaw += look.yaw;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch + look.pitch));
    const a = input.moveAxes();
    const speed = (input.down('sprint') ? 220 : 45) * dt;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    camera.position.addScaledVector(fwd, -a.z * speed).addScaledVector(right, a.x * speed);
    if (input.down('jump')) camera.position.y += speed;
    if (input.down('sneak')) camera.position.y -= speed;
    if (a.x || a.z || look.yaw || look.pitch) camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }
}
