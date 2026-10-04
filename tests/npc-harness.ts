/**
 * A headless NpcManager: real Rapier physics (a flat ground plus whatever a test builds), the real
 * nav grid, brains, steering and character controllers, a perspective camera that follows a fake
 * player, and the game clock — no renderer, no atlas (unless asked for), no other modules.
 *
 *   const h = await npcHarness({ hour: 9, lanes, district });
 *   h.walk(0, 0, Math.PI / 2, 3.5);   // the player walks east at 3.5 m/s, looking where he goes
 *   h.run(20, () => sample(h));        // 20 simulated seconds
 */
import * as THREE from 'three';
import { ActorSystem } from '../src/actors/ActorSystem';
import { EventBus, type GameEvents } from '../src/core/Events';
import type { Game } from '../src/core/Game';
import { GameTime } from '../src/core/GameTime';
import { initPhysics, Physics } from '../src/core/Physics';
import { Rng } from '../src/core/Rng';
import { NpcManager, type NpcManagerOptions } from '../src/npc/NpcManager';
import type { Npc } from '../src/npc/Npc';

export interface HarnessPlayer {
  id: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  eyeHeight: number;
  combatStance: boolean;
  sprinting: boolean;
}

export interface Harness {
  game: Game;
  pop: NpcManager;
  physics: Physics;
  player: HarnessPlayer;
  camera: THREE.PerspectiveCamera;
  /** Simulated seconds so far. */
  time: number;
  /** Walk the player from (x, z) along heading θ (Actor convention) at `speed` m/s (0 = stand). */
  walk(x: number, z: number, heading: number, speed: number): void;
  /** Look along heading θ without moving. */
  face(heading: number): void;
  /** Run `seconds` of simulation (60 Hz fixed steps, a frame every 2 steps); `each` runs every frame. */
  run(seconds: number, each?: (t: number) => void): void;
  /** NPCs inside the camera frustum (bodies at chest height). */
  inView(filter?: (n: Npc) => boolean): Npc[];
}

export interface HarnessOptions {
  hour: number;
  /** Calendar start (default 11 May AD 113). */
  date?: { year: number; month: number; day: number };
  /** Add colliders (the ground is already there: y = 0, 800 m square). */
  build?: (physics: Physics) => void;
  /** Flat terrain height map (default: none). */
  heightmap?: boolean;
  opts?: NpcManagerOptions;
}

export async function npcHarness(o: HarnessOptions): Promise<Harness> {
  await initPhysics();
  const physics = new Physics();
  physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 400, y: 0.5, z: 400 });
  o.build?.(physics);
  physics.step(1 / 60);
  const events = new EventBus<GameEvents>();
  const time = new GameTime(events, o.date ?? { year: 113, month: 4, day: 11 }, o.hour);
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 2000);
  const scene = new THREE.Scene();
  scene.add(camera);
  const player: HarnessPlayer = { id: 'player', position: new THREE.Vector3(0, 0, 0), velocity: new THREE.Vector3(), eyeHeight: 1.62, combatStance: false, sprinting: false };
  const game = {
    physics,
    scene,
    camera,
    events,
    time,
    rng: new Rng(7),
    player,
    addSystem: <T>(s: T) => s,
  } as unknown as Game;
  if (o.heightmap) (game as unknown as { heightmap: { heightAt(x: number, z: number): number } }).heightmap = { heightAt: () => 0 };
  game.actors = new ActorSystem(game);
  const pop = new NpcManager(game, { seed: 5, vignettes: false, carts: false, named: false, stations: false, atlas: false, ...o.opts });
  game.population = pop;

  let heading = 0;
  let speed = 0;
  const placeCamera = () => {
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    camera.position.set(player.position.x - fx * 3.4, player.position.y + 1.9, player.position.z - fz * 3.4);
    camera.lookAt(player.position.x + fx * 20, player.position.y + 1.2, player.position.z + fz * 20);
    camera.updateMatrixWorld(true);
  };
  const frustum = new THREE.Frustum();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const h: Harness = {
    game,
    pop,
    physics,
    player,
    camera,
    time: 0,
    walk(x, z, th, sp) {
      player.position.set(x, 0.02, z);
      heading = th;
      speed = sp;
      player.velocity.set(Math.sin(th) * sp, 0, Math.cos(th) * sp);
      placeCamera();
    },
    face(th) {
      heading = th;
      speed = 0;
      player.velocity.set(0, 0, 0);
      placeCamera();
    },
    run(seconds, each) {
      const dt = 1 / 60;
      const steps = Math.round(seconds / dt);
      for (let i = 0; i < steps; i++) {
        player.position.x += Math.sin(heading) * speed * dt;
        player.position.z += Math.cos(heading) * speed * dt;
        pop.fixedUpdate(dt);
        physics.step(dt);
        h.time += dt;
        if (i % 2 === 1) {
          placeCamera();
          pop.update(dt * 2);
          pop.lateUpdate();
          each?.(h.time);
        }
      }
    },
    inView(filter) {
      camera.updateMatrixWorld(true);
      m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(m);
      return pop.list.filter((n) => !n.dead && frustum.containsPoint(v.set(n.position.x, n.position.y + 1.2, n.position.z)) && (!filter || filter(n)));
    },
  };
  h.face(0);
  return h;
}
