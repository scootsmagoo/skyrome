/**
 * Torches, braziers and lamps of the Colosseum valley reach the sky module's light pool
 * (`game.lights`): the module queues them while the world is built, then requests one pooled
 * light per flame once the pool exists, from the landmark's final world matrix, and switches them
 * off while the landmark is culled.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Game, System } from '../src/core/Game';
import { LampSystem, addLamps, lampAt } from '../src/world/landmarks/builders/colos-kit';
import { builders as colosseum } from '../src/world/landmarks/builders/colos-colosseum';
import { builders as baths } from '../src/world/landmarks/builders/colos-baths';
import { builders as ludus } from '../src/world/landmarks/builders/colos-ludus';
import { builders as quarter } from '../src/world/landmarks/builders/colos-quarter';
import { ctxFor } from './colos-ctx';

interface Req {
  position: { x: number; y: number; z: number };
  night: boolean;
  dayScale: number;
  intensity: number;
}

/** The parts of Game the lamp module touches, with a fake light pool. */
function fakeGame(withLights: boolean) {
  const systems: System[] = [];
  const requests: (Req & { enabled: boolean; removed: boolean })[] = [];
  const game = {
    camera: new THREE.PerspectiveCamera(),
    addSystem<T extends System>(s: T): T {
      systems.push(s);
      return s;
    },
    getSystem: (name: string) => systems.find((s) => s.name === name),
    lights: withLights
      ? {
          request(r: Req) {
            const rec = { ...r, enabled: true, removed: false };
            requests.push(rec);
            return { setEnabled: (on: boolean) => (rec.enabled = on), remove: () => (rec.removed = true) };
          },
        }
      : undefined,
  };
  return { game: game as unknown as Game, systems, requests };
}

const step = (sys: System, n = 6) => {
  for (let i = 0; i < n; i++) sys.lateUpdate?.(1 / 60);
};

describe('lamp system', () => {
  it('waits for the light pool, then requests each flame at its world position', () => {
    const { game, systems, requests } = fakeGame(false);
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    scene.add(root);
    root.position.set(100, 5, -20);
    root.rotation.y = Math.PI / 2;
    addLamps(game, root, [lampAt('torch', 1, 2, 0), lampAt('brazier', 0, 1, 3, { distance: 7 }), lampAt('hearth', 0, 1, 0)]);
    expect(systems.length).toBe(1);
    const sys = systems[0] as LampSystem;
    step(sys, 30);
    expect(requests.length).toBe(0); // no pool yet
    // The sky module installs the pool after the world is built.
    const seen: Req[] = [];
    (game as unknown as { lights: { request: (r: Req) => unknown } }).lights = {
      request(r: Req) {
        seen.push(r);
        return { setEnabled() {}, remove() {} };
      },
    };
    step(sys, 12);
    expect(seen.length).toBe(3);
    // Local (1, 2, 0) with the root turned a quarter and moved: world (100, 7, -21).
    expect(seen[0].position.x).toBeCloseTo(100, 5);
    expect(seen[0].position.y).toBeCloseTo(7, 5);
    expect(seen[0].position.z).toBeCloseTo(-21, 5);
    // Torches are lit from dusk, braziers burn all day without lighting sunlit marble, hearths keep their light by day.
    expect(seen[0].night).toBe(true);
    expect(seen[1].night).toBe(false);
    expect(seen[1].dayScale).toBe(0);
    expect(seen[2].dayScale).toBeGreaterThan(0.5);
    // Requested once only.
    step(sys, 60);
    expect(seen.length).toBe(3);
  });

  it('switches the flames off while the landmark is culled', () => {
    const { game, systems, requests } = fakeGame(true);
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    scene.add(root);
    addLamps(game, root, [lampAt('torch', 0, 1, 0), lampAt('lamp', 2, 1, 0)]);
    const sys = systems[0];
    step(sys, 12);
    expect(requests.length).toBe(2);
    expect(requests.every((r) => r.enabled)).toBe(true);
    root.visible = false;
    step(sys, 12);
    expect(requests.every((r) => !r.enabled)).toBe(true);
    root.visible = true;
    step(sys, 12);
    expect(requests.every((r) => r.enabled)).toBe(true);
  });

  it('is a no-op without a game (unit tests) or without lamps', () => {
    const root = new THREE.Group();
    expect(() => addLamps(undefined, root, [lampAt('torch', 0, 0, 0)])).not.toThrow();
    const { game, systems } = fakeGame(true);
    addLamps(game, root, []);
    expect(systems.length).toBe(0);
  });
});

describe('the landmarks light their flames', () => {
  const cases: [string, typeof colosseum, number][] = [
    ['colosseum', colosseum, 20],
    ['baths-titus', baths, 8],
    ['baths-trajan', baths, 10],
    ['ludus-magnus', ludus, 6],
    ['moneta', quarter, 4],
  ];
  it.each(cases)('%s registers at least %i flames with the pool', (id, set, min) => {
    const { game, systems } = fakeGame(true);
    const ctx = { ...ctxFor(id), game };
    const b = set.find((x) => x.handles.includes(id))!;
    const out = b.build(ctx);
    const lamp = systems.find((s) => s.name === 'colos-lamps') as LampSystem | undefined;
    expect(lamp, `${id}: no lamp system`).toBeDefined();
    const scene = new THREE.Scene();
    scene.add(out.object);
    const seen: Req[] = [];
    (game as unknown as { lights: unknown }).lights = {
      request(r: Req) {
        seen.push(r);
        return { setEnabled() {}, remove() {} };
      },
    };
    step(lamp!, 12);
    expect(seen.length).toBeGreaterThanOrEqual(min);
    // Some are night-only torches/lamps, some burn all day.
    expect(seen.some((r) => r.night)).toBe(true);
  });
});
