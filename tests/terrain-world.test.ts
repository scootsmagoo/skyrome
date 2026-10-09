/**
 * Walkability of the river and the world's edge, driven through the REAL player controller, swim
 * system and Rapier: a swimmer can always climb out at a quay landing and walk up to the quay top,
 * the quay parapet keeps walkers out of the river, the canal is contained by its banks, falling out
 * of the world is caught. Plus the dressing rules and the footstep mapping.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Game } from '../src/core/Game';
import { EventBus } from '../src/core/Events';
import { initPhysics, Physics } from '../src/core/Physics';
import { registerColliders } from '../src/gfx/MeshBuilder';
import { Player } from '../src/player/Player';
import { PlayerController } from '../src/player/PlayerController';
import { WORLD_SCALE } from '../src/world/coords';
import { goldenRoute, stoneRule, treeRule } from '../src/world/terrain/dress';
import { buildHeightmap, canalBank, CANAL, type Heightmap, type TerrainSource } from '../src/world/terrain/heightmap';
import { chain, resolveQuays, type TerrainQuay } from '../src/world/terrain/riverbanks';
import { edgeWallBoxes, SafetyNet } from '../src/world/terrain/safety';
import { L, LAYER_COUNT } from '../src/world/terrain/splat';
import { footstepSound, type Surface } from '../src/world/terrain/surface';
import { bodyAt, makeWaterBodies } from '../src/world/water/bodies';
import { buildCanal, mergeSurfaces } from '../src/world/water/canal';
import { bridgeCorridors, buildIslandFacing, buildQuay, inCorridor, parapetPieces, QUAY } from '../src/world/water/quays';
import { findLedge, mantlePose, SwimSystem } from '../src/world/water/swim';

const S = WORLD_SCALE;
const DT = 1 / 60;

// A river flowing south (+z), 100 m wide, with a quay on its left (east) bank.
const river = { id: 'r', name: 'R', centerline: [[0, -600], [0, 600]] as [number, number][], width: [100, 100], waterLevel: 6, bankHeight: 10.5 };
const quay: TerrainQuay = { id: 'quay-test', name: 'Q', river: 'r', bank: 'left', from: [50, -100], to: [50, 100], top: 11, width: 12, confidence: 'high' };
const src: TerrainSource = {
  BASE_ELEVATION: 14,
  HILLS: [],
  LOWLANDS: [],
  RIVERS: [river],
  ISLANDS: [],
  bounds: { minX: -200, maxX: 200, minZ: -300, maxZ: 300 },
};

/** Heightfield colliders for a whole (small) grid. */
function addTerrain(physics: Physics, hm: Heightmap) {
  physics.addHeightfield(hm.minX, hm.minZ, hm.maxX - hm.minX, hm.maxZ - hm.minZ, hm.nx - 1, hm.nz - 1, hm.heights);
}

/** Held actions, as the real Input reports them. */
function fakeInput() {
  const held = new Set<string>();
  return {
    held,
    enabled: true,
    lookActive: false,
    consumeLook: () => ({ yaw: 0, pitch: 0 }),
    pressed: () => false,
    down: (a: string) => held.has(a),
    moveAxes: () => ({ x: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0), z: (held.has('back') ? 1 : 0) - (held.has('forward') ? 1 : 0) }),
  };
}

/** A stub Game with real physics, a real Player, its controller and (optionally) swimming. */
function makeGame(hm: Heightmap, start: THREE.Vector3Like, withSwim = true) {
  const physics = new Physics();
  addTerrain(physics, hm);
  const input = fakeInput();
  const systems = new Map<string, unknown>();
  const game = {
    physics,
    scene: new THREE.Scene(),
    events: new EventBus(),
    input,
    terrain: { heightAt: (x: number, z: number) => hm.heightAt(x, z) },
    getSystem: (n: string) => systems.get(n),
  } as unknown as Game;
  const player = new Player(game, start, 0);
  game.player = player;
  const pc = new PlayerController(game, player);
  systems.set('playerController', pc);
  const bodies = makeWaterBodies([river]);
  const swim = withSwim ? new SwimSystem(game, (x, z) => bodyAt(bodies, x, z)) : null;
  physics.step(DT);
  const run = (seconds: number, each?: () => boolean | void) => {
    for (let i = 0; i < seconds * 60; i++) {
      swim?.fixedUpdate(DT);
      pc.fixedUpdate(DT);
      physics.step(DT);
      if (each?.()) return;
    }
  };
  /** Face the camera along (dx, dz) (forward = that way). */
  const face = (dx: number, dz: number) => {
    player.yaw = Math.atan2(-dx, -dz);
  };
  return { game, physics, player, pc, swim, input, run, face };
}

describe('the river can always be left', () => {
  beforeAll(async () => {
    await initPhysics();
  });
  const hm = buildHeightmap(src, { spacing: 2, noise: 0, quays: [quay] });
  const rq = resolveQuays([quay], 'r', chain(river.centerline))[0];
  const q = buildQuay(river, rq, (x, z) => hm.heightAt(x, z), S);
  const level = 6 * S;
  const yTop = 11 * S;

  it('a swimmer at a quay landing climbs out and walks up to the quay top', () => {
    const land = q.landings[0];
    // The landing stands riverward (west) of the face; start 8 m out in deep water.
    const w = makeGame(hm, { x: land.x - 8, y: level - 1.38, z: land.z });
    registerColliders(w.game, q.colliders);
    w.physics.step(DT);
    let swam = false;
    let mantled = 0;
    w.game.events.on('player:mantle', () => mantled++);
    w.face(1, 0);
    w.input.held.add('forward');
    let t = 0;
    w.run(14, () => {
      if (process.env.DBG && t++ % 30 === 0) process.stderr.write(`\n${t} ${w.player.position.toArray().map((v) => v.toFixed(2))} sw=${w.player.swimming} v=${w.player.velocity.toArray().map((v) => v.toFixed(2))}`);
      swam ||= !!w.player.swimming;
      return w.player.grounded && !w.player.swimming && w.player.position.y > land.y - 0.05;
    });
    expect(swam).toBe(true);
    // Out of the water by the submerged steps (or a climb onto them).
    expect(w.player.position.y).toBeGreaterThan(land.y - 0.05);
    expect(mantled).toBeGreaterThanOrEqual(0);
    w.run(1);
    expect(w.player.swimming).toBeFalsy();
    expect(w.player.position.y).toBeGreaterThan(level - 1.2);
    // Up the steps onto the landing, then up the flight (+z) to its head, then onto the quay.
    w.run(2);
    w.face(0, 1);
    w.run(4);
    expect(w.player.position.y).toBeGreaterThan(yTop - 0.1);
    w.face(1, 0);
    w.run(3);
    expect(w.player.position.y).toBeCloseTo(yTop, 0);
    expect(w.player.position.x).toBeGreaterThan(land.x + 3);
  });

  it('a swimmer who reaches the stairs beside the landing still gets out', () => {
    const land = q.landings[0];
    for (const dz of [-4.5, 3.5, 5.5]) {
      const w = makeGame(hm, { x: land.x - 6, y: level - 1.38, z: land.z + dz });
      registerColliders(w.game, q.colliders);
      w.physics.step(DT);
      w.face(1, 0);
      w.input.held.add('forward');
      w.run(14, () => w.player.grounded && !w.player.swimming && w.player.position.y > level - 0.3);
      expect(w.player.swimming).toBeFalsy();
      expect(w.player.position.y).toBeGreaterThan(level - 0.3);
    }
  });

  it('a swimmer at the plain quay wall cannot climb the 2 m face (but the landing is reachable)', () => {
    const land = q.landings[0];
    const w = makeGame(hm, { x: land.x - 6, y: level - 1.38, z: land.z + 40 });
    registerColliders(w.game, q.colliders);
    w.physics.step(DT);
    w.face(1, 0);
    w.input.held.add('forward');
    w.run(8);
    expect(w.player.swimming).toBe(true);
    expect(w.player.position.y).toBeLessThan(level);
  });

  it('the parapet keeps a walker on the quay out of the river', () => {
    const land = q.landings[0];
    // On the quay top, 30 m along from the stairs, walking west toward the river.
    const x0 = land.x + 6;
    const w = makeGame(hm, { x: x0, y: yTop + 0.2, z: land.z + 30 }, false);
    registerColliders(w.game, q.colliders);
    w.physics.step(DT);
    w.face(-1, 0);
    w.input.held.add('forward');
    w.run(4);
    expect(w.player.position.y).toBeGreaterThan(yTop - 0.2);
    // Jumping doesn't clear it either.
    const p = w.player;
    for (let k = 0; k < 6; k++) {
      p.velocity.y = 5.6;
      p.grounded = false;
      w.run(0.5);
    }
    expect(p.position.y).toBeGreaterThan(yTop - 0.2);
  });

  it('ledge finding and the climb path', () => {
    // A ledge 1.2 m up, 0.7 m ahead (probe returns the top within reach).
    const probe = (x: number) => (x > 0.6 ? 1.2 : -2);
    const l = findLedge(probe, 0, 0, 1, 0, -1.2, 1.4);
    expect(l).not.toBeNull();
    expect(l!.top).toBeCloseTo(1.2);
    expect(l!.x).toBeGreaterThan(0.6);
    // Too tall: nothing.
    expect(findLedge((x) => (x > 0.6 ? 2.5 : -2), 0, 0, 1, 0, -1.2, 1.4)).toBeNull();
    // The path rises before it moves over the lip, and ends on top.
    const from = new THREE.Vector3(0, -1.4, 0);
    const a = mantlePose(from, l!, 0.3, new THREE.Vector3());
    expect(a.y).toBeGreaterThan(-0.2);
    expect(a.x).toBeLessThan(0.05);
    const e = mantlePose(from, l!, 1, new THREE.Vector3());
    expect(e.y).toBeCloseTo(l!.top + 0.04);
    expect(e.x).toBeCloseTo(l!.x);
  });

  it('parapet pieces leave the openings out; bridge corridors', () => {
    expect(parapetPieces(0, 10, [[2, 3], [9, 12]])).toEqual([[0, 2], [3, 9]]);
    expect(parapetPieces(0, 1, [[0.1, 0.95]])).toEqual([]);
    const c = bridgeCorridors([{ a: [0, 0], b: [100, 0], width: 8 }]);
    expect(inCorridor(c, 50, 6)).toBe(true);
    expect(inCorridor(c, -10, 0)).toBe(true); // the abutment ramp
    expect(inCorridor(c, 50, 9)).toBe(false);
  });

  it('the island facing has stairs to the water on both long sides', () => {
    const outline: [number, number][] = [[-130, -20], [130, -20], [140, 0], [130, 20], [-130, 20], [-140, 0]];
    const f = buildIslandFacing(outline, 11, 6, [], S);
    expect(f.landings.length).toBe(2);
    expect(Math.sign(f.landings[0].z)).not.toBe(Math.sign(f.landings[1].z));
    for (const l of f.landings) expect(l.y).toBeCloseTo(6 * S + 0.25);
    expect(f.colliders.length).toBeGreaterThan(100);
  });
});

describe('the canal is contained', () => {
  beforeAll(async () => {
    await initPhysics();
  });
  // Flat ground at 10 m with a canal whose water (10.5 m) stands above it, like the Euripus.
  const canal = { id: 'c', name: 'C', kind: 'canal' as const, centerline: [[-150, 0], [150, 0]] as [number, number][], width: [8, 8], waterLevel: 10.5, bankHeight: 11.5 };
  const csrc: TerrainSource = { BASE_ELEVATION: 10, HILLS: [], LOWLANDS: [], RIVERS: [canal], ISLANDS: [], bounds: { minX: -200, maxX: 200, minZ: -100, maxZ: 100 } };
  const hm = buildHeightmap(csrc, { spacing: 2, noise: 0 });

  it('banks rise above the water beside the channel and ramp down to the ground', () => {
    expect(canalBank(canal, 0, 4, 10)).toBeCloseTo(8.9);
    expect(canalBank(canal, 4 + CANAL.wall + 1, 4, 10)).toBeCloseTo(11);
    expect(canalBank(canal, 40, 4, 10)).toBe(10);
    // In the built grid (game m): the ground just beside the walls is at least 0.3 m (real) above the water.
    for (const zr of [7.5, -7.5, 8.5, -8.5]) expect(hm.heightAt(0, zr * S)).toBeGreaterThanOrEqual((10.5 + 0.3) * S);
    expect(hm.heightAt(0, 0)).toBeLessThan((10.5 - 1) * S);
    expect(hm.heightAt(0, 40 * S)).toBeCloseTo(10 * S, 1);
  });

  it('the water is a ribbon between the walls, and a wader can climb out', () => {
    const bodies = makeWaterBodies([canal]);
    const c = buildCanal(bodies[0], []);
    const ribbon = c.ribbon;
    expect(ribbon.index.length).toBeGreaterThan(100);
    for (let i = 0; i < ribbon.positions.length; i += 3) {
      expect(Math.abs(ribbon.positions[i + 2])).toBeLessThan(4 * S + 0.1);
      expect(ribbon.positions[i + 1]).toBeCloseTo(10.5 * S);
    }
    expect(mergeSurfaces([ribbon, ribbon]).index.length).toBe(ribbon.index.length * 2);
    // Every triangle faces up (the material is single-sided).
    const P = ribbon.positions, I = ribbon.index;
    const v = (k: number) => new THREE.Vector3(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]);
    for (let t = 0; t < I.length; t += 3) {
      const a = v(I[t]), n = new THREE.Vector3().subVectors(v(I[t + 1]), a).cross(new THREE.Vector3().subVectors(v(I[t + 2]), a));
      expect(n.y).toBeGreaterThan(0);
    }
    // Walk into the canal from the bank and out the other side.
    const physics = new Physics();
    addTerrain(physics, hm);
    const input = fakeInput();
    const systems = new Map<string, unknown>();
    const game = { physics, scene: new THREE.Scene(), events: new EventBus(), input, terrain: { heightAt: (x: number, z: number) => hm.heightAt(x, z) }, getSystem: (n: string) => systems.get(n) } as unknown as Game;
    registerColliders(game, c.builder.colliders);
    const player = new Player(game, { x: 0, y: 10.5 * S - 0.9, z: 0 }, 0);
    game.player = player;
    const pc = new PlayerController(game, player);
    systems.set('playerController', pc);
    const swim = new SwimSystem(game, (x, z) => bodyAt(bodies, x, z));
    let mantled = 0;
    game.events.on('player:mantle', () => mantled++);
    physics.step(DT);
    player.yaw = Math.PI; // forward = +z
    input.held.add('forward');
    for (let i = 0; i < 6 * 60; i++) {
      swim.fixedUpdate(DT);
      pc.fixedUpdate(DT);
      physics.step(DT);
    }
    // The 1.3 m wall is too tall to step: the wader pulls themselves up onto the kerb.
    expect(mantled).toBe(1);
    expect(player.position.z).toBeGreaterThan(4 * S + CANAL.wall * S);
    expect(player.position.y).toBeGreaterThan(10 * S - 0.1);
  });
});

describe('the edge of the world', () => {
  beforeAll(async () => {
    await initPhysics();
  });
  const hm = buildHeightmap(src, { spacing: 2, noise: 0 });

  it('walls close the grid, and the safety net returns a falling player', () => {
    const walls = edgeWallBoxes(hm);
    expect(walls.length).toBe(4);
    const physics = new Physics();
    addTerrain(physics, hm);
    for (const w of walls) physics.addBox(w.center, w.half);
    const game = { physics, scene: new THREE.Scene(), events: new EventBus(), input: fakeInput() } as unknown as Game;
    const player = new Player(game, { x: 0, y: hm.heightAt(0, hm.maxZ - 30) + 0.1, z: hm.maxZ - 30 }, 0);
    game.player = player;
    const net = new SafetyNet(game, hm);
    physics.step(DT);
    // Run south into the edge for 10 s: the wall stops the player on the grid.
    for (let i = 0; i < 600; i++) {
      player.locomote({ x: 0, y: 0, z: 7 }, DT);
      net.fixedUpdate(DT);
      physics.step(DT);
    }
    expect(player.position.z).toBeLessThan(hm.maxZ);
    expect(player.grounded).toBe(true);
    // Drop them out of the world: the net catches them and puts them back on the ground.
    let rescued = 0;
    game.events.on('player:rescued', () => rescued++);
    player.teleport({ x: 0, y: -500, z: 0 });
    net.fixedUpdate(DT);
    expect(rescued).toBe(1);
    expect(player.position.y).toBeGreaterThan(hm.heightAt(player.position.x, player.position.z) - 0.5);
    // In an interior cell built under the world (the Column's stair), the net leaves them be.
    (game as unknown as { interiors: { current(): string | null } }).interiors = { current: () => 'dun-columna' };
    player.teleport({ x: 0, y: -120, z: 0 });
    net.fixedUpdate(DT);
    expect(rescued).toBe(1);
    expect(player.position.y).toBeCloseTo(-120, 1);
  });
});

describe('dressing rules and footsteps', () => {
  const w = new Float32Array(LAYER_COUNT);
  const base = { x: 0, z: 0, ny: 1, nz: 0, hw: 5, roadSd: 8, padSd: 8, padKind: 0, urban: 0, lush: 0 };

  it('trees grow in gardens, on hills, by the river and along roads, never on roads or pads', () => {
    w.fill(0);
    w[L.grass] = 1;
    expect(treeRule({ ...base, lush: 1 }, w, false)!.grove).toBe('garden');
    expect(treeRule({ ...base, hw: 20 }, w, false)!.grove).toBe('hill');
    expect(treeRule(base, w, true)!.grove).toBe('river');
    expect(treeRule({ ...base, roadSd: 4 }, w, false)!.grove).toBe('road');
    expect(treeRule({ ...base, roadSd: 1 }, w, false)).toBeNull();
    expect(treeRule({ ...base, padSd: 1 }, w, false)).toBeNull();
    expect(treeRule({ ...base, hw: 0.3 }, w, true)).toBeNull();
    // The corridor of the first walk is denser.
    expect(treeRule({ ...base, roadSd: 4 }, w, false, 0.8)!.density).toBeGreaterThan(treeRule({ ...base, roadSd: 4 }, w, false)!.density);
    w.fill(0);
    w[L.basalt] = 1;
    expect(treeRule(base, w, false)).toBeNull();
    expect(goldenRoute().length).toBeGreaterThan(5);
  });

  it('stones on rock, beaches and dirt in the quarters', () => {
    w.fill(0);
    w[L.rock] = 0.8;
    w[L.grass] = 0.2;
    expect(stoneRule(base, w)!.kind).toBe('rock');
    w.fill(0);
    w[L.sand] = 1;
    expect(stoneRule({ ...base, hw: 1 }, w)!.kind).toBe('pebble');
    w.fill(0);
    w[L.grass] = 1;
    expect(stoneRule(base, w)).toBeNull();
  });

  it('every terrain surface has a footstep bank', () => {
    const all: Surface[] = ['grass', 'dirt', 'rock', 'paved', 'sand', 'water', 'gravel', 'mud'];
    const banks = new Set(['stone', 'dirt', 'grass', 'gravel', 'water']);
    for (const s of all) expect(banks.has(footstepSound(s))).toBe(true);
    expect(footstepSound('gravel')).toBe('gravel');
    expect(footstepSound('mud')).toBe('dirt');
    expect(footstepSound('paved')).toBe('stone');
    expect(QUAY.parapet + 0.2).toBeGreaterThan(0.78); // taller than a jump (5.6²/2/20 m)
  });
});
