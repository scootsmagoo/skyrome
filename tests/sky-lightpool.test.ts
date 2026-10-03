import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Game } from '../src/core/Game';
import { LightPool } from '../src/world/lights/LightPool';
import { dayLightScale } from '../src/world/lights/logic';

interface FakeSky {
  lampFactor: number;
  daylight: number;
  indoor: number;
}

/** Just enough of a Game for the light pool: scene, camera, renderer size, time and sky. */
function fakeGame(sky: FakeSky) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  scene.add(camera);
  const game = {
    scene,
    camera,
    sky,
    time: { isNight: sky.daylight < 0.5 },
    renderer: { getDrawingBufferSize: (v: THREE.Vector2) => v.set(1280, 720) },
  } as unknown as Game;
  return game;
}

const night = (): FakeSky => ({ lampFactor: 1, daylight: 0, indoor: 0 });
const noon = (): FakeSky => ({ lampFactor: 0, daylight: 1, indoor: 0 });

function run(pool: LightPool, seconds: number, dt = 1 / 60) {
  for (let t = 0; t < seconds - 1e-9; t += dt) pool.lateUpdate(dt);
}

const lights = (game: Game) => game.scene.children.filter((o): o is THREE.PointLight => (o as THREE.PointLight).isPointLight);
const maxIntensity = (game: Game) => Math.max(...lights(game).map((l) => l.intensity));
const glowPos = (pool: LightPool, i: number) => [pool.glows.pos.getX(i), pool.glows.pos.getY(i), pool.glows.pos.getZ(i)];

describe('light pool handles', () => {
  it('a removed handle never writes into another light’s glow slot', () => {
    const game = fakeGame(night());
    const pool = new LightPool(game);
    const a = pool.request({ position: { x: 1, y: 2, z: 3 } });
    const b = pool.request({ position: { x: 10, y: 20, z: 30 }, intensity: 7 });
    a.remove();
    expect(pool.size).toBe(1);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(true);
    // B moved into index 0 when A was swap-removed.
    expect(glowPos(pool, 0)).toEqual([10, 20, 30]);
    const colorBefore = Array.from(pool.glows.color.array.slice(0, 4));
    a.setPosition({ x: 999, y: 999, z: 999 });
    a.setIntensity(500);
    a.setColor(0x0000ff);
    a.setEnabled(false);
    expect(glowPos(pool, 0)).toEqual([10, 20, 30]);
    expect(Array.from(pool.glows.color.array.slice(0, 4))).toEqual(colorBefore);
    a.remove(); // twice is harmless
    expect(pool.size).toBe(1);
    // B still works.
    b.setPosition({ x: 4, y: 5, z: 6 });
    expect(glowPos(pool, 0)).toEqual([4, 5, 6]);
  });

  it('removing the last entry leaves the others intact', () => {
    const game = fakeGame(night());
    const pool = new LightPool(game);
    const a = pool.request({ position: { x: 1, y: 2, z: 3 } });
    const b = pool.request({ position: { x: 10, y: 20, z: 30 } });
    b.remove();
    b.setPosition({ x: 7, y: 7, z: 7 });
    expect(glowPos(pool, 0)).toEqual([1, 2, 3]);
    a.setPosition({ x: 2, y: 2, z: 2 });
    expect(glowPos(pool, 0)).toEqual([2, 2, 2]);
  });

  it('a removed light fades out instead of popping, and its slot is reused', () => {
    const game = fakeGame(night());
    const pool = new LightPool(game, { count: 1 });
    const a = pool.request({ position: { x: 0, y: 1, z: -3 }, intensity: 20 });
    run(pool, 0.5);
    expect(maxIntensity(game)).toBeCloseTo(20, 5);
    a.remove();
    pool.lateUpdate(1 / 60);
    const i1 = maxIntensity(game);
    expect(i1).toBeGreaterThan(0);
    expect(i1).toBeLessThan(20);
    run(pool, 0.3);
    expect(maxIntensity(game)).toBe(0);
    // The freed slot serves a new request.
    const b = pool.request({ position: { x: 0, y: 1, z: -5 }, intensity: 9 });
    run(pool, 0.5);
    expect(maxIntensity(game)).toBeCloseTo(9, 5);
    expect(lights(game)[0].position.z).toBe(-5);
    expect(b.alive).toBe(true);
  });
});

describe('light pool by day', () => {
  it('always-burning fires light nothing in full daylight and leave the pool', () => {
    const sky = noon();
    const game = fakeGame(sky);
    const pool = new LightPool(game, { count: 2 });
    pool.request({ position: { x: 0, y: 1, z: -3 }, intensity: 40 });
    pool.request({ position: { x: 2, y: 1, z: -3 }, intensity: 40 });
    run(pool, 0.5);
    expect(maxIntensity(game)).toBe(0);
    // The flame glow still shows, dimmed.
    expect(pool.glows.params.getX(0)).toBeCloseTo(pool.dayGlow, 5);
    // At night the same fires light up fully.
    sky.daylight = 0;
    sky.lampFactor = 1;
    run(pool, 0.5);
    expect(maxIntensity(game)).toBeCloseTo(40, 5);
    // And fade out again after sunrise.
    sky.daylight = 1;
    sky.lampFactor = 0;
    run(pool, 0.5);
    expect(maxIntensity(game)).toBe(0);
  });

  it('dayScale keeps a fraction by day; indoors fires are full', () => {
    const sky = noon();
    const game = fakeGame(sky);
    const pool = new LightPool(game, { count: 1 });
    pool.request({ position: { x: 0, y: 1, z: -3 }, intensity: 40, dayScale: 0.5 });
    run(pool, 0.5);
    expect(maxIntensity(game)).toBeCloseTo(20, 5);
    sky.indoor = 1;
    run(pool, 0.1);
    expect(maxIntensity(game)).toBeCloseTo(40, 5);
  });

  it('night lamps are dark by day regardless of dayScale', () => {
    const game = fakeGame(noon());
    const pool = new LightPool(game, { count: 1 });
    pool.request({ position: { x: 0, y: 1, z: -3 }, intensity: 40, night: true, dayScale: 1 });
    run(pool, 0.5);
    expect(maxIntensity(game)).toBe(0);
  });

  it('dayLightScale blends from 1 (dark) to dayScale (full daylight)', () => {
    expect(dayLightScale(0)).toBe(1);
    expect(dayLightScale(1)).toBe(0);
    expect(dayLightScale(0.5)).toBeCloseTo(0.5);
    expect(dayLightScale(1, 0.2)).toBeCloseTo(0.2);
    expect(dayLightScale(0, 0.2)).toBe(1);
    expect(dayLightScale(2, -1)).toBe(0);
  });
});
