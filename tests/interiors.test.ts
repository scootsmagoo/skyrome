/**
 * Interior cells (src/world/interiors): building once, 3D inside tests, moving the player through
 * doors, quest markers, and hidden-outside visibility. Runs on a fake game: no WebGL, no WASM
 * physics (a recording stand-in for the Physics API), no DOM.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/Events';
import type { Game } from '../src/core/Game';
import type { Interactable } from '../src/interaction/Interactions';
import { installInteriors } from '../src/world/interiors/install';
import { InteriorSystem, localToWorld, worldToLocal } from '../src/world/interiors/InteriorSystem';
import type { InteriorDef, InteriorDoor } from '../src/world/interiors/types';

/** Records the colliders it is given; the handles are the specs themselves. */
class FakePhysics {
  live = new Set<unknown>();
  added = 0;
  addOrientedBox(_c: unknown, _h: unknown, _q: unknown, _o: unknown) {
    return this.track({ kind: 'box' });
  }
  addCylinder(_c: unknown, _h: number, _r: number, _o: unknown) {
    return this.track({ kind: 'cylinder' });
  }
  addTrimesh(_g: unknown, _m: unknown, _o: unknown) {
    return this.track({ kind: 'trimesh' });
  }
  removeCollider(c: unknown) {
    this.live.delete(c);
  }
  private track(c: unknown) {
    this.added++;
    this.live.add(c);
    return c;
  }
}

interface World {
  game: Game;
  events: EventBus<GameEvents>;
  scene: THREE.Scene;
  physics: FakePhysics;
  items: Set<Interactable>;
  player: { position: THREE.Vector3; heading: number; teleport(p: { x: number; y: number; z: number }, h?: number): void };
  sky: { indoor: number };
  discovered: string[];
  notes: string[];
  fades: number;
}

function fakeWorld(opts: { player?: boolean } = {}): World {
  const events = new EventBus<GameEvents>();
  const scene = new THREE.Scene();
  const physics = new FakePhysics();
  const items = new Set<Interactable>();
  const player = {
    position: new THREE.Vector3(),
    heading: 0,
    teleport(p: { x: number; y: number; z: number }, h?: number) {
      this.position.set(p.x, p.y, p.z);
      if (h !== undefined) this.heading = h;
    },
  };
  const sky = { indoor: 0 };
  const discovered: string[] = [];
  const notes: string[] = [];
  const w = { fades: 0 } as { fades: number };
  const ui = {
    name: 'ui',
    fade: () => {
      w.fades++;
      return Promise.resolve();
    },
  };
  const game = {
    events,
    scene,
    physics,
    player: opts.player === false ? undefined : player,
    sky,
    locations: { discover: (id: string) => (discovered.push(id), true) },
    interactions: {
      add: (i: Interactable) => (items.add(i), () => items.delete(i)),
      remove: (i: Interactable) => items.delete(i),
    },
    getSystem: (name: string) => (name === 'ui' ? ui : undefined),
    addSystem: <T>(s: T) => s,
  } as unknown as Game;
  events.on('ui:notify', (e) => notes.push(e.text));
  return { game, events, scene, physics, items, player, sky, discovered, notes, get fades() { return w.fades; } } as World;
}

const ORIGIN = { x: 100, y: -120, z: 50, rotY: Math.PI / 2 };

/** A 4 x 3 x 4 box cell with one spot ('hall', local (0, 0, -1.5)). Its doors are added by the caller. */
function cellDef(over: Partial<InteriorDef> = {}, doors: InteriorDoor[] = []): InteriorDef {
  return {
    id: 'cell-a',
    name: 'Cell A',
    origin: () => ORIGIN,
    build: ({ builder }) => {
      const b = builder();
      b.box('travertine', 4, 3, 4, new THREE.Matrix4().makeTranslation(0, 1.5, 0), { collide: true });
      const object = b.build('cell-a');
      return {
        object,
        colliders: b.colliders,
        spots: [{ id: 'hall', kind: 'spot', position: new THREE.Vector3(0, 0, -1.5), heading: 0 }],
      };
    },
    bounds: { min: { x: -2, y: -0.5, z: -2 }, max: { x: 2, y: 3, z: 2 } },
    doors,
    ...over,
  };
}

/** A world point inside the cell (local (0, 0, -1)) on its floor. */
const INSIDE = { x: 99, y: -120, z: 50 };

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('interior frames', () => {
  it('maps local to world and back through rotY', () => {
    const local = { x: 1, y: 2, z: 3 };
    const world = localToWorld(ORIGIN, local);
    const back = worldToLocal(ORIGIN, world);
    expect(back.x).toBeCloseTo(1, 6);
    expect(back.y).toBeCloseTo(2, 6);
    expect(back.z).toBeCloseTo(3, 6);
    // rotY = 90°: local +x points along world -z (three's rotation.y convention).
    const east = localToWorld(ORIGIN, { x: 1, y: 0, z: 0 });
    expect(east.x).toBeCloseTo(100, 6);
    expect(east.z).toBeCloseTo(49, 6);
  });
});

describe('InteriorSystem', () => {
  it('ensure builds once and adds colliders once', () => {
    const w = fakeWorld();
    const sys = installInteriors(w.game);
    sys.register(cellDef());
    expect(sys.ensure('cell-a')).toBe(true);
    const added = w.physics.added;
    expect(added).toBeGreaterThan(0);
    expect(sys.ensure('cell-a')).toBe(true);
    expect(w.physics.added).toBe(added);
    expect(w.scene.getObjectByName('interior:cell-a')).toBeTruthy();
  });

  it('dispose removes the object, the colliders and the doors', () => {
    const w = fakeWorld();
    const sys = new InteriorSystem(w.game);
    sys.register(cellDef({}, [{ id: 'cell-a:out', label: 'Out', verb: 'Go out', at: { x: 0, y: 0, z: -1.8 }, from: 'cell-a', to: { interior: null, position: { x: 0, y: 0, z: 0 }, heading: 0 } }]));
    sys.ensure('cell-a');
    expect(w.items.size).toBe(1);
    sys.dispose('cell-a');
    expect(w.scene.getObjectByName('interior:cell-a')).toBeUndefined();
    expect(w.physics.live.size).toBe(0);
    expect(w.items.size).toBe(0);
  });

  it('isInside is 3D: the same x and z but another height is outside', () => {
    const w = fakeWorld();
    const sys = new InteriorSystem(w.game);
    sys.register(cellDef());
    w.player.position.set(INSIDE.x, INSIDE.y, INSIDE.z);
    expect(sys.isInside('cell-a')).toBe(true);
    expect(sys.current()).toBe('cell-a');
    w.player.position.set(INSIDE.x, INSIDE.y + 10, INSIDE.z);
    expect(sys.isInside('cell-a')).toBe(false);
    expect(sys.current()).toBeNull();
    w.player.position.set(INSIDE.x, INSIDE.y - 5, INSIDE.z);
    expect(sys.isInside('cell-a')).toBe(false);
  });

  it('enter teleports into the cell and emits interior:entered; leave emits interior:exited', async () => {
    const w = fakeWorld();
    const sys = new InteriorSystem(w.game);
    sys.register(cellDef({ indoor: 0.5 }));
    const log: string[] = [];
    w.events.on('interior:entered', (e) => log.push(`in:${e.id}`));
    w.events.on('interior:exited', (e) => log.push(`out:${e.id}`));

    await sys.enter('cell-a', { x: 0, y: 0, z: -1 }, 0);
    expect(w.player.position.x).toBeCloseTo(INSIDE.x, 6);
    expect(w.player.position.y).toBeCloseTo(INSIDE.y, 6);
    expect(w.player.position.z).toBeCloseTo(INSIDE.z, 6);
    // Local heading 0 becomes world heading rotY.
    expect(w.player.heading).toBeCloseTo(Math.PI / 2, 6);
    expect(w.fades).toBe(1);
    expect(log).toEqual(['in:cell-a']);
    expect(w.sky.indoor).toBe(0.5);
    expect(w.discovered).toEqual(['cell-a']);
    expect(sys.isInside('cell-a')).toBe(true);

    await sys.leave({ x: 0, y: 0, z: 0 }, 1);
    expect(w.player.position.x).toBe(0);
    expect(w.player.heading).toBe(1);
    expect(log).toEqual(['in:cell-a', 'out:cell-a']);
    expect(w.sky.indoor).toBe(0);
  });

  it('enter does nothing for an unknown cell or one with no origin yet', async () => {
    const w = fakeWorld();
    const sys = new InteriorSystem(w.game);
    sys.register(cellDef({ origin: () => null }));
    await sys.enter('cell-a', { x: 0, y: 0, z: 0 }, 0);
    await sys.enter('nope', { x: 0, y: 0, z: 0 }, 0);
    expect(w.player.position.length()).toBe(0);
    expect(sys.ensure('cell-a')).toBe(false);
  });

  it('a door refuses while locked and says why; unlocked, it moves the player', async () => {
    const w = fakeWorld();
    const sys = new InteriorSystem(w.game);
    let locked: string | null = 'The bronze door is shut and sealed with lead.';
    const door: InteriorDoor = {
      id: 'out-world',
      label: 'The bronze door',
      verb: 'Enter the stair',
      at: { x: 10, y: 0, z: 10 },
      from: null,
      to: { interior: 'cell-a', position: { x: 0, y: 0, z: -1 }, heading: 0 },
      locked: () => locked,
    };
    sys.register(cellDef({}, [door]));
    const item = [...w.items].find((i) => i.id === 'door:out-world')!;
    expect(item).toBeTruthy();
    expect(item.verb()).toBe('Enter the stair');
    expect(item.position().x).toBe(10);

    item.interact(w.game);
    await flush();
    expect(w.notes).toEqual(['The bronze door is shut and sealed with lead.']);
    expect(w.player.position.length()).toBe(0);
    expect(sys.get('cell-a')).toBeDefined();
    expect(w.scene.getObjectByName('interior:cell-a')).toBeUndefined();

    locked = null;
    item.interact(w.game);
    await flush();
    expect(w.player.position.x).toBeCloseTo(INSIDE.x, 6);
    expect(sys.isInside('cell-a')).toBe(true);
  });

  it('an inside door leaves to the world and is only usable from its cell', async () => {
    const w = fakeWorld();
    const sys = new InteriorSystem(w.game);
    const out: InteriorDoor = {
      id: 'cell-a:out',
      label: 'The door',
      verb: 'Go out',
      at: { x: 0, y: 0, z: -1.8 },
      from: 'cell-a',
      to: { interior: null, position: { x: 7, y: 0, z: 7 }, heading: 2 },
    };
    sys.register(cellDef({}, [out]));
    sys.ensure('cell-a');
    const item = [...w.items].find((i) => i.id === 'door:cell-a:out')!;
    expect(item.enabled!()).toBe(false);
    w.player.position.set(INSIDE.x, INSIDE.y, INSIDE.z);
    sys.check();
    expect(item.enabled!()).toBe(true);
    // Door position follows the cell's frame: local (0, 0, -1.8).
    expect(item.position().x).toBeCloseTo(100 - 1.8, 6);
    item.interact(w.game);
    await flush();
    expect(w.player.position.x).toBe(7);
    expect(w.player.heading).toBe(2);
    expect(sys.isInside('cell-a')).toBe(false);
  });

  it('resolve("interior:<id>:<spot>") is the spot in the world', () => {
    const w = fakeWorld();
    const sys = new InteriorSystem(w.game);
    sys.register(cellDef());
    const p = sys.resolve('interior:cell-a:hall')!;
    expect(p).toBeTruthy();
    // Local (0, 0, -1.5) with rotY 90° lands at world x = 100 - 1.5.
    expect(p.x).toBeCloseTo(98.5, 6);
    expect(p.y).toBeCloseTo(-120, 6);
    expect(p.z).toBeCloseTo(50, 6);
    expect(sys.resolve('interior:cell-a:missing')).toBeNull();
    expect(sys.resolve('interior:nope:hall')).toBeNull();
    expect(sys.resolve('forum-trajan')).toBeNull();
  });

  it('routeWorld maps the route through the frame', () => {
    const w = fakeWorld();
    const sys = new InteriorSystem(w.game);
    sys.register(cellDef({ route: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] }));
    const r = sys.routeWorld('cell-a');
    expect(r).toHaveLength(2);
    expect(r[1].z).toBeCloseTo(49, 6);
  });

  it('hiddenOutside cells are visible only while the player is inside', () => {
    const w = fakeWorld();
    const sys = new InteriorSystem(w.game);
    sys.register(cellDef());
    sys.ensure('cell-a');
    const obj = w.scene.getObjectByName('interior:cell-a')!;
    expect(obj.visible).toBe(false);
    w.player.position.set(INSIDE.x, INSIDE.y, INSIDE.z);
    sys.check();
    expect(obj.visible).toBe(true);
    w.player.position.set(0, 0, 0);
    sys.check();
    expect(obj.visible).toBe(false);
  });

  it('a cell that is not hidden outside stays visible', () => {
    const w = fakeWorld();
    const sys = new InteriorSystem(w.game);
    sys.register(cellDef({ id: 'cell-open', hiddenOutside: false, origin: () => ORIGIN }));
    sys.ensure('cell-open');
    expect(w.scene.getObjectByName('interior:cell-open')!.visible).toBe(true);
  });

  it('check reports entering and leaving, and calls onEnter and onExit', () => {
    const w = fakeWorld();
    const sys = new InteriorSystem(w.game);
    const calls: string[] = [];
    sys.register(cellDef({ onEnter: () => calls.push('enter'), onExit: () => calls.push('exit') }));
    const log: string[] = [];
    w.events.on('interior:entered', (e) => log.push(`in:${e.id}`));
    w.events.on('interior:exited', (e) => log.push(`out:${e.id}`));
    w.player.position.set(INSIDE.x, INSIDE.y, INSIDE.z);
    sys.check();
    sys.check();
    w.player.position.set(0, 0, 0);
    sys.check();
    expect(log).toEqual(['in:cell-a', 'out:cell-a']);
    expect(calls).toEqual(['enter', 'exit']);
  });

  it('works without a player, a scene or physics', async () => {
    const w = fakeWorld({ player: false });
    const sys = new InteriorSystem({ ...w.game, scene: undefined, physics: undefined } as unknown as Game);
    sys.register(cellDef());
    expect(sys.current()).toBeNull();
    expect(sys.ensure('cell-a')).toBe(true);
    sys.fixedUpdate(1);
    await sys.enter('cell-a', { x: 0, y: 0, z: 0 }, 0);
    expect(sys.resolve('interior:cell-a:hall')).not.toBeNull();
  });

  it('installInteriors installs one service on the game', () => {
    const w = fakeWorld();
    const a = installInteriors(w.game);
    expect(w.game.interiors).toBe(a);
    expect(installInteriors(w.game)).toBe(a);
  });
});
