/**
 * The hand-built interiors of the named places (src/world/interiors/named, docs/modules/interiors.md
 * "Named cells"): each cell's frame holds its entry, route, way out and chests; the real player
 * capsule walks each route; the Ludus' door is where the court builder puts a cell door; the street
 * door finder (front.ts) finds a plain wall, hangs a door on it and a hatch on level ground; the
 * generic kits' chests (a tenant's chest, a house's strongbox) are deterministic, owned and locked as
 * the design says; and the content module places interior containers at their cell's floor and makes
 * runtime ones whose state outlives the cell.
 */
import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTAINERS, CONTAINER_STYLES } from '../src/content/containers';
import { installContent } from '../src/content/install';
import type { Game } from '../src/core/Game';
import { Layer, Physics, initPhysics } from '../src/core/Physics';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { installRpg } from '../src/rpg/install';
import { MemoryStorage } from '../src/save/storage';
import { WORLD_SCALE } from '../src/world/coords';
import { doorSeed } from '../src/world/interiors/generic';
import { domusKit } from '../src/world/interiors/kits/domus';
import { insulaStairKit } from '../src/world/interiors/kits/insulaStair';
import { NAMED_CELLS, NAMED_FRONTS } from '../src/world/interiors/named';
import { castorLoculi } from '../src/world/interiors/named/castor';
import { COLLAPSA } from '../src/world/interiors/named/collapsa';
import { inBounds, interiorContainers, namedDef, originOf, registerNamed, type NamedCell } from '../src/world/interiors/named/common';
import { CELL_DOOR_ALONG, ludusCellae } from '../src/world/interiors/named/ludus';
import { AEMILIA, registerAemiliaStrongbox, strongboxOffset } from '../src/world/interiors/named/shops';
import { faceScore, findHatchSpot, findWall, frontMatrix, PORCH } from '../src/world/interiors/named/front';
import { isLocked, withinHours } from '../src/world/doors/rules';
import { fakeGame } from './rpg-fakes';
import { makeWorld, walk } from './arch.walker';

const ctx = { game: {} as Game, builder: () => new MeshBuilder() };

beforeAll(async () => {
  await initPhysics();
});
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('the named cells', () => {
  it.each(NAMED_CELLS.map((c) => [c.id, c] as const))('%s: the entry, the route, the way out and the spots are inside its bounds', (_id, cell) => {
    const built = cell.build(ctx);
    expect(inBounds(cell, cell.entry.position), 'entry').toBe(true);
    cell.route.forEach((p, i) => expect(inBounds(cell, p), `route ${i}`).toBe(true));
    expect(inBounds(cell, cell.exit.at), 'exit').toBe(true);
    for (const o of cell.outside ?? []) if (o.from === cell.id && typeof o.at !== 'function') expect(inBounds(cell, o.at), o.id).toBe(true);
    for (const s of built.spots) expect(inBounds(cell, { x: s.position.x, y: s.position.y, z: s.position.z }), `spot ${s.id}`).toBe(true);
    expect(built.spots.some((s) => s.id === 'entry')).toBe(true);
    expect(built.colliders.length).toBeGreaterThan(10);
    for (const l of built.lamps ?? []) expect(inBounds(cell, l.position), 'lamp').toBe(true);
  });

  it('the cells have their own ids, depths and places, and one def each', () => {
    expect(new Set(NAMED_CELLS.map((c) => c.id)).size).toBe(NAMED_CELLS.length);
    expect(new Set(NAMED_CELLS.map((c) => c.slot)).size).toBe(NAMED_CELLS.length);
    for (const c of NAMED_CELLS) {
      const def = namedDef(c);
      expect(def.id).toBe(c.id);
      // The way out is a door from the cell to the world.
      const out = def.doors!.find((d) => d.id === `${c.id}:out`)!;
      expect(out.from).toBe(c.id);
      expect(out.to.interior).toBeNull();
    }
  });

  it('every interior container of the places has a chest in its cell: inside the bounds, off the walls, clear of the others', () => {
    const cellOf = (at: string): NamedCell | undefined => NAMED_CELLS.find((c) => c.at === at);
    for (const at of new Set(CONTAINERS.filter((c) => c.interior).map((c) => c.at as string))) {
      const specs = interiorContainers(at);
      const cell = cellOf(at);
      if (!cell) {
        // A place whose interior is a real room of the world (the Basilica Paulli's shop): it has no cell, but its box has a point.
        expect(at, 'a cell-less place must be one of the world-room places').toMatch(/^(tabernae-aemiliae|insula-.*|.*cenaculum|insula-nutans-tectum)$/);
        continue;
      }
      const built = cell.build(ctx);
      const world = makeWorld(false);
      for (const c of built.colliders) world.physics.addOrientedBox(c.kind === 'box' ? c.center : new THREE.Vector3(), c.kind === 'box' ? c.half : new THREE.Vector3(0.01, 0.01, 0.01), c.kind === 'box' ? c.rotation ?? new THREE.Quaternion() : new THREE.Quaternion());
      world.physics.step(1 / 60);
      for (const s of specs) {
        const p = { x: s.dx ?? 0, y: 0.3, z: s.dz ?? 0 };
        expect(inBounds(cell, p, 0.3), `${s.id} in ${cell.id}`).toBe(true);
        // Its chest is a solid box at that point (the cell drew it), 0.5–0.8 m high.
        const hit = world.physics.raycast({ x: p.x, y: 1.5, z: p.z }, { x: 0, y: -1, z: 0 }, 3, Layer.World);
        expect(hit, `${s.id}: a chest under the point`).not.toBeNull();
        expect(hit!.point.y, s.id).toBeGreaterThan(0.45);
        expect(hit!.point.y, s.id).toBeLessThan(0.85);
        for (const o of specs) if (o !== s) expect(Math.hypot((o.dx ?? 0) - (s.dx ?? 0), (o.dz ?? 0) - (s.dz ?? 0)), `${s.id} ~ ${o.id}`).toBeGreaterThan(0.9);
      }
    }
  });
});

describe('walking the named cells', () => {
  it.each(NAMED_CELLS.map((c) => [c.id, c] as const))('%s: the player capsule walks the whole route, and to every chest', (_id, cell) => {
    const built = cell.build(ctx);
    const w = makeWorld(false);
    for (const c of built.colliders) {
      if (c.kind === 'box') w.physics.addOrientedBox(c.center, c.half, c.rotation ?? new THREE.Quaternion());
      else if (c.kind === 'cylinder') w.physics.addCylinder(c.center, c.halfHeight, c.radius);
      else w.physics.addTrimesh(c.geometry, c.matrix);
    }
    w.physics.step(1 / 60);
    const legs = cell.route.slice(1).map((p) => ({ to: [p.x, p.z] as [number, number], seconds: 8, speed: 4.4, reach: 0.4 }));
    const res = walk(w, cell.entry.position, legs);
    cell.route.slice(1).forEach((p, i) => {
      expect(Math.hypot(res.ends[i].x - p.x, res.ends[i].z - p.z), `waypoint ${i + 1} of ${cell.id}`).toBeLessThan(0.7);
    });
    // The prompt of each chest (the floor point and the kind's height) is within reach of somewhere on the route.
    for (const s of interiorContainers(cell.at)) {
      const reach = 2.6;
      const p = new THREE.Vector3(s.dx ?? 0, CONTAINER_STYLES[s.kind].height, s.dz ?? 0);
      const near = cell.route.some((r) => Math.hypot(r.x - p.x, r.z - p.z) < reach - 0.2) || chestReachableOffRoute(cell, s.dx ?? 0, s.dz ?? 0);
      expect(near, `${s.id} is within reach of the route`).toBe(true);
    }
  });

  it('the burned cellar: the stair climbs from the floor to the hatch, and back', () => {
    const cell = NAMED_CELLS.find((c) => c.id === COLLAPSA)!;
    const built = cell.build(ctx);
    const w = makeWorld(false);
    for (const c of built.colliders) if (c.kind === 'box') w.physics.addOrientedBox(c.center, c.half, c.rotation ?? new THREE.Quaternion());
    w.physics.step(1 / 60);
    const top = cell.exit.at;
    const up = walk(w, cell.entry.position, [{ to: [0, 0.2], seconds: 3 }, { to: [0, top.z], seconds: 12, speed: 3, reach: 0.3 }]);
    expect(up.ends[1].y, 'the head of the stair').toBeGreaterThan(2.5);
    expect(Math.abs(up.ends[1].z - top.z)).toBeLessThan(0.6);
    // The prompt at the top is within reach of someone standing there.
    expect(Math.hypot(up.ends[1].x - top.x, up.ends[1].z - top.z, up.ends[1].y + 1.0 - top.y)).toBeLessThan(2.4);
  });
});

/** A chest off the walked route is still reachable if a free standing spot a metre in front of it is on the cell's floor (walk() proved the room's). */
function chestReachableOffRoute(cell: NamedCell, x: number, z: number): boolean {
  const w = makeWorld(false);
  const built = cell.build(ctx);
  for (const c of built.colliders) if (c.kind === 'box') w.physics.addOrientedBox(c.center, c.half, c.rotation ?? new THREE.Quaternion());
  w.physics.step(1 / 60);
  // Walk from the route point nearest the chest to within 2.0 m of it.
  let best = cell.route[0];
  for (const r of cell.route) if (Math.hypot(r.x - x, r.z - z) < Math.hypot(best.x - x, best.z - z)) best = r;
  const res = walk(w, { x: best.x, y: best.y + 0.05, z: best.z }, [{ to: [x, z], seconds: 6, speed: 4.4, reach: 1.6 }]);
  return Math.hypot(res.x - x, res.z - z) < 2.0;
}

describe('the fixed doorways', () => {
  /** A game with the landmark spots the cells hang from: the Castor strongroom door, the Ludus barracks. */
  function fixedGame(rotY: number): Game {
    const spots = new Map<string, { spots: { id: string; position: THREE.Vector3; heading: number }[]; rotationY: number }>();
    spots.set('temple-castor-pollux', { rotationY: rotY, spots: [{ id: 'castor-strongroom', position: new THREE.Vector3(100, 5, 40), heading: rotY + Math.PI / 2 }] });
    spots.set('ludus-magnus', { rotationY: rotY, spots: [{ id: 'ludus-cellae', position: new THREE.Vector3(550, 12, 186), heading: rotY }] });
    return { landmarks: spots } as unknown as Game;
  }

  it('the strongroom door: the cell sits under the spot, the prompt before the door, the way out onto the paving facing away', () => {
    const game = fixedGame(0.7);
    const o = originOf(game, castorLoculi)!;
    expect(o).toMatchObject({ x: 100, z: 40, rotY: 0 });
    expect(o.y).toBeLessThan(5 - 200);
    const door = castorLoculi.outside![0];
    const at = (door.at as (g: Game) => { x: number; y: number; z: number })(game);
    // 0.9 m ahead of the spot along its heading.
    expect(Math.hypot(at.x - 100, at.z - 40)).toBeCloseTo(0.9, 6);
    const h = 0.7 + Math.PI / 2;
    expect(at.x - 100).toBeCloseTo(Math.sin(h) * 0.9, 6);
    const out = castorLoculi.exit.to(game)!;
    expect(out.position).toMatchObject({ x: 100, y: 5, z: 40 });
    expect(out.heading).toBeCloseTo(h + Math.PI, 9);
    expect(door.from).toBeNull();
    expect(door.to.interior).toBe('castor-loculi');
  });

  it('nothing is registered before the landmark is placed', () => {
    const sys = { register: vi.fn() };
    const game = { interiors: sys, landmarks: new Map(), locations: { add: vi.fn(), get: () => undefined } } as unknown as Game;
    expect(registerNamed(game, castorLoculi)).toBe(false);
    expect(sys.register).not.toHaveBeenCalled();
  });

  it('registering a cell adds its def and the `<place>:interior` location at its floor', () => {
    const add = vi.fn();
    const sys = { register: vi.fn() };
    const game = { ...fixedGame(0), interiors: sys, locations: { add, get: () => undefined } } as unknown as Game;
    expect(registerNamed(game, ludusCellae)).toBe(true);
    expect(sys.register).toHaveBeenCalledTimes(1);
    const loc = add.mock.calls[0][0];
    expect(loc.id).toBe('ludus-cellae:interior');
    expect(loc.radius).toBeLessThan(1);
    expect(loc.y).toBeUndefined();
    expect(loc.position.y).toBeLessThan(-200);
  });

  it('the barracks door is the cell door the Ludus builder puts on its back wall, not the mess hall’s opening', () => {
    // colos-ludus.ts / colos-court.ts: W = 85 S, range 4.2: a cell door every len / floor(len / 3.2) along the inner back wall, left out
    // where a room opens (the mess hall at +7 from the middle, 6.2 wide, its opening 1.6) or within 0.6 of its width.
    const S = WORLD_SCALE;
    const len = 85 * S - 2 * 4.2;
    const n = Math.floor(len / 3.2);
    const roomC = len / 2 - 7;
    const kept: number[] = [];
    for (let i = 0; i < n; i++) {
      const c = ((i + 0.5) * len) / n;
      if (c > roomC - 0.8 - 0.9 && c < roomC + 0.8 + 0.9) continue;
      if (c > roomC - 3.1 - 0.6 && c < roomC + 3.1 + 0.6) continue;
      kept.push(-len / 2 + c);
    }
    // The spot of ludus-cellae is at x = −6.5 (local), before the mess hall's opening (at −7.0). The door the barracks use is
    // the first kept one beyond the hall, away from the spot toward −x: CELL_DOOR_ALONG from it.
    const left = kept.filter((x) => x < -6.5);
    const door = left.reduce((b, x) => (x > b ? x : b), -Infinity);
    expect(door + 6.5).toBeCloseTo(CELL_DOOR_ALONG, 2);
    // It is well clear of the hall's side (a change of the court's numbers that moved doors by a decimetre would not drop it).
    expect(roomC - 3.1 - 0.6 - (door + len / 2)).toBeGreaterThan(2);
  });

  it('the barracks door stands before the wall along the spot’s own wall direction', () => {
    const game = fixedGame(1.1);
    const door = ludusCellae.outside![0];
    const at = (door.at as (g: Game) => { x: number; y: number; z: number })(game);
    // From the spot (550, 186), CELL_DOOR_ALONG along the wall (cos h, −sin h) and 0.8 m toward it (sin h, cos h).
    const h = 1.1;
    expect(at.x).toBeCloseTo(550 + Math.cos(h) * CELL_DOOR_ALONG + Math.sin(h) * 0.8, 6);
    expect(at.z).toBeCloseTo(186 - Math.sin(h) * CELL_DOOR_ALONG + Math.cos(h) * 0.8, 6);
  });
});

describe('the street door finder', () => {
  /** A physics world: level ground at y = 8, and a wall with its face on the plane x = 6, `gap` cut out of it. */
  function street(opts: { gap?: [number, number, number, number]; blocker?: boolean; wallTop?: number } = {}) {
    const physics = new Physics();
    physics.addBox({ x: 0, y: 7.5, z: 0 }, { x: 60, y: 0.5, z: 60 });
    const top = opts.wallTop ?? 8 + 6;
    const piece = (z0: number, z1: number, y0: number, y1: number) => physics.addBox({ x: 6.5, y: (y0 + y1) / 2, z: (z0 + z1) / 2 }, { x: 0.5, y: (y1 - y0) / 2, z: (z1 - z0) / 2 });
    if (!opts.gap) piece(-12, 12, 8, top);
    else {
      const [z0, z1, y0, y1] = opts.gap;
      piece(-12, z0, 8, top);
      piece(z1, 12, 8, top);
      piece(z0, z1, 8, y0);
      piece(z0, z1, y1, top);
    }
    if (opts.blocker) physics.addBox({ x: 5.2, y: 8.9, z: 0 }, { x: 0.3, y: 0.9, z: 0.7 });
    physics.step(1 / 60);
    return { physics } as unknown as Game;
  }

  it('finds the plain wall and its normal; the door hangs 0.34 m out of it, +z into it', () => {
    const game = street();
    const face = findWall(game, 0, 0, 8, 11, 1.5, 2.3)!;
    expect(face).not.toBeNull();
    expect(face.point.x).toBeCloseTo(6, 2);
    expect(face.normal.x).toBeCloseTo(-1, 3);
    expect(face.groundY).toBeCloseTo(8, 2);
    expect(face.distance).toBeCloseTo(6, 1);
    const m = frontMatrix(face);
    const z = new THREE.Vector3(0, 0, 1).transformDirection(m);
    expect(z.x).toBeCloseTo(1, 6); // into the wall (+x)
    expect(new THREE.Vector3().setFromMatrixPosition(m).x).toBeCloseTo(6 - PORCH, 6);
    // The frame is right-handed: x × y = z.
    const x = new THREE.Vector3(1, 0, 0).transformDirection(m);
    const y = new THREE.Vector3(0, 1, 0).transformDirection(m);
    expect(x.clone().cross(y).distanceTo(z)).toBeLessThan(1e-6);
  });

  it('a wall with a window across the door’s place, or too low for the lintel, or with a barrel before it, is not a door’s wall (the door goes beside them, or nowhere)', () => {
    // (a window beside the door's place moves the door along the wall to plain stone; it never goes across the window)
    const beside = findWall(street({ gap: [-0.4, 0.4, 9.2, 10.4] }), 0, 0, 8, 11, 1.5, 2.3);
    if (beside) expect(Math.abs(beside.point.z)).toBeGreaterThan(0.4 + 0.75 + 0.35);
    expect(findWall(street({ wallTop: 8 + 1.9 }), 0, 0, 8, 11, 1.5, 2.3)).toBeNull();
    const clear = findWall(street({ blocker: true }), 0, 0, 8, 11, 1.5, 2.3);
    if (clear) expect(Math.abs(clear.point.z)).toBeGreaterThan(0.7 + 0.75);
  });

  it('prefers the nearer wall, and scores a level approach over a stepped one', () => {
    expect(faceScore(3, 0, 0)).toBeLessThan(faceScore(5, 0, 0));
    expect(faceScore(3, 0.3, 0)).toBeGreaterThan(faceScore(3, 0, 0));
  });

  it('a hatch goes on level, clear ground: where asked, else the nearest such place', () => {
    const game = street();
    expect(findHatchSpot(game, 0, 0, 8)).toMatchObject({ x: 0, z: 0 });
    // A barrel on the spot pushes it aside.
    const g2 = street({ blocker: true });
    const near = findHatchSpot(g2, 5.2, 0, 8)!;
    expect(near).not.toBeNull();
    expect(Math.hypot(near.x - 5.2, near.z)).toBeGreaterThan(0.9);
    // Under a wall's top: nowhere (a 3 m roof is clear above a 2.2 m check only if high enough).
    expect(findHatchSpot(game, 6.2, 0, 8)).not.toMatchObject({ x: 6.2, z: 0 });
  });

  it('the shops and the cellar have their doors configured: the popina and the arms shop lock, the hatch does not', () => {
    const byId = new Map(NAMED_FRONTS.map((f) => [f.id, f]));
    const pig = byId.get('front:popina-vici-tusci')!;
    const arms = byId.get('front:taberna-armorum')!;
    expect(pig.lock?.openHours).toEqual([5, 2]); // open late
    // The Pig is open at 23:00 and 01:00 and shut at 03:00; the arms shop is open at noon and shut at 20:00 (the wrap past midnight is the door rules').
    expect([23, 1, 3].map((h) => withinHours(h, pig.lock!.openHours!))).toEqual([true, true, false]);
    expect([isLocked(NAMED_FRONTS[1].lock, undefined, 12), isLocked(NAMED_FRONTS[1].lock, undefined, 20)]).toEqual([false, true]);
    expect(arms.lock?.openHours).toEqual([6, 19]);
    expect(pig.owner?.id).toBe('npc-chreste');
    expect(arms.owner?.id).toBe('npc-euhodus');
    const cellar = byId.get('front:taberna-collapsa')!;
    expect(cellar.hatch).toBeDefined();
    expect(cellar.lock).toBeUndefined();
    for (const f of NAMED_FRONTS) expect(NAMED_CELLS.some((c) => c.id === f.cell), f.id).toBe(true);
  });
});

describe('the bankers’ strongbox at the Basilica Paulli', () => {
  it('stands where the builder draws the box: left back corner of a money-changer’s shop, from its vendor spot', () => {
    const o = strongboxOffset(WORLD_SCALE);
    const bay = (100 * WORLD_SCALE - 1.2) / 16;
    expect(o.x).toBeCloseTo(-(bay - 0.6) / 2 + 0.55, 6);
    expect(o.z).toBeGreaterThan(1.4);
    expect(o.z).toBeLessThan(2.0);
  });

  it('is registered at the nearest argentarius to the place, rotated with the landmark', () => {
    const add = vi.fn();
    const spots = [
      { id: 'basilica-paulli-argentarius-0', position: new THREE.Vector3(-100, 9, 0), heading: 0 },
      { id: 'basilica-paulli-argentarius-5', position: new THREE.Vector3(90, 9.15, 0), heading: 0 },
      { id: 'basilica-paulli-mensa-5', position: new THREE.Vector3(89, 9, 3), heading: 0 },
    ];
    const rotY = 0.4;
    const game = {
      landmarks: new Map([['basilica-aemilia', { spots, rotationY: rotY }]]),
      locations: { get: (id: string) => (id === AEMILIA ? { id, position: { x: 82, y: 8, z: 6 }, radius: 8 } : undefined), add },
    } as unknown as Game;
    expect(registerAemiliaStrongbox(game)).toBe(true);
    const loc = add.mock.calls[0][0];
    const o = strongboxOffset();
    expect(loc.id).toBe('tabernae-aemiliae:interior');
    expect(loc.position.x).toBeCloseTo(90 + o.x * Math.cos(rotY) + o.z * Math.sin(rotY), 6);
    expect(loc.position.z).toBeCloseTo(0 - o.x * Math.sin(rotY) + o.z * Math.cos(rotY), 6);
    expect(loc.position.y).toBe(9.15);
  });
});

describe('the generic kits’ chests', () => {
  const build = (kit: typeof insulaStairKit, seed: number, wealth: number) => {
    const plan = kit.plan(seed, wealth);
    return { plan, built: kit.build({ game: {} as Game, cellId: `gen:t${seed}`, builder: () => new MeshBuilder(), seed, wealth, plan }) };
  };

  it('a flat has a tenant’s chest: inside the cell, owned by the tenant whose door it is, locked about half the time with a simple lock', () => {
    let locked = 0;
    const N = 160;
    for (let i = 0; i < N; i++) {
      const seed = doorSeed(`block-${i}:lot:door`);
      const { plan, built } = build(insulaStairKit, seed, (i % 10) / 10);
      expect(built.containers).toHaveLength(1);
      const c = built.containers![0];
      expect(c.id).toBe('chest');
      expect(c.spec.kind).toBe('cista-insulae');
      expect(c.spec.owner).toBe(`tenant:${seed}`);
      expect(c.spec.table).toBe(i % 10 > 6 ? 'chest.rich' : 'chest.common');
      expect(c.position.x).toBeGreaterThan(plan.bounds.min.x);
      expect(c.position.x).toBeLessThan(plan.bounds.max.x);
      expect(c.position.z).toBeGreaterThan(plan.bounds.min.z);
      expect(c.position.z).toBeLessThan(plan.bounds.max.z);
      // It stands on the flat's floor, a storey up (the landing's height).
      expect(c.position.y).toBeGreaterThan(2.5);
      if (c.spec.locked) {
        expect(c.spec.locked).toBe('simplex');
        locked++;
      }
    }
    expect(locked / N).toBeGreaterThan(0.35);
    expect(locked / N).toBeLessThan(0.65);
  });

  it('the flat’s door keeps the tenant it had (the chest and the door have one owner)', () => {
    const seed = doorSeed('same');
    const { built } = build(insulaStairKit, seed, 0.3);
    expect(built.doors![0].owner!.id).toBe(built.containers![0].spec.owner);
  });

  it('a house has a strongbox in the tablinum, locked by wealth, owned by the household', () => {
    for (const [wealth, tier, table] of [[0.3, 'mediocris', 'chest.common'], [0.6, 'mediocris', 'strongbox'], [0.9, 'difficilis', 'chest.rich']] as const) {
      const seed = doorSeed(`house-${wealth}`);
      const { plan, built } = build(domusKit, seed, wealth);
      expect(built.containers).toHaveLength(1);
      const c = built.containers![0];
      expect(c.id).toBe('arca');
      expect(c.spec.kind).toBe('arca-tabernae');
      expect(c.spec.label).toBe('The master’s strongbox');
      expect(c.spec.locked).toBe(tier);
      expect(c.spec.table).toBe(table);
      expect(c.spec.owner).toBe(`household:${seed}`);
      // In the tablinum, at the back of the house, inside the cell.
      expect(c.position.z).toBeGreaterThan(plan.route![3].z);
      expect(c.position.z).toBeLessThan(plan.bounds.max.z);
      expect(Math.abs(c.position.x)).toBeLessThan(plan.bounds.max.x);
    }
  });

  it('the same door always has the same chest', () => {
    const seed = doorSeed('block-9:lot-3:door');
    const a = build(insulaStairKit, seed, 0.4).built.containers;
    const b = build(insulaStairKit, seed, 0.4).built.containers;
    expect(a).toEqual(b);
    const c = build(domusKit, seed, 0.7).built.containers;
    const d = build(domusKit, seed, 0.7).built.containers;
    expect(c).toEqual(d);
  });
});

describe('containers in cells (content)', () => {
  function world(extra: (game: Record<string, unknown>) => void = () => {}) {
    const fg = fakeGame();
    const game = fg.game as unknown as Record<string, unknown>;
    extra(game);
    const items: { id: string; position(): THREE.Vector3; enabled?(): boolean; interact(g: Game): void; label?(): string; detail?(): string | null }[] = [];
    game.interactions = { add: (i: (typeof items)[number]) => (items.push(i), () => items.splice(items.indexOf(i), 1)), remove: () => {} };
    const views: { items(): { itemId: string; count: number }[]; takeAll(): void }[] = [];
    game.ui = { openBook: () => {}, openContainer: (v: (typeof views)[number]) => views.push(v) };
    game.lights = { request: () => ({ remove() {} }) };
    game.population ??= { witnesses: () => [] };
    const rpg = installRpg(fg.game, { storage: new MemoryStorage(), background: 'civis-suburanus' });
    return { ...fg, rpg, items, views, game: fg.game as Game };
  }

  it('interior containers appear only where their place has its `:interior` point, at that point plus (dx, dz), on the cell’s floor', () => {
    const w = world();
    const floor = -250;
    for (const cell of NAMED_CELLS) w.game.locations.add({ id: `${cell.at}:interior`, name: cell.name, position: { x: 1000 + cell.slot * 100, y: floor, z: 2000 }, radius: 0.3 });
    installContent(w.game);
    for (const cell of NAMED_CELLS) {
      for (const s of interiorContainers(cell.at)) {
        const it = w.items.find((i) => i.id === `container:${s.id}`);
        expect(it, s.id).toBeDefined();
        const p = it!.position();
        expect(p.x, s.id).toBeCloseTo(1000 + cell.slot * 100 + (s.dx ?? 0), 6);
        expect(p.z, s.id).toBeCloseTo(2000 + (s.dz ?? 0), 6);
        expect(p.y - floor, s.id).toBeGreaterThan(0.4);
        expect(p.y - floor, s.id).toBeLessThan(0.9);
      }
    }
    // The cells' containers are the barracks' six, the strongrooms' three, the cellar's, the Pig's and the arms dealer's, Malchus's strongbox and the couriers' three boxes.
    const mine = CONTAINERS.filter((c) => c.interior && NAMED_CELLS.some((n) => n.at === c.at));
    expect(mine.length).toBe(6 + 3 + 1 + 1 + 1 + 1 + 3);
  });

  it('a lockable interior chest can be picked and is owned: the prompt says whose it is', () => {
    const w = world();
    w.game.locations.add({ id: 'popina-vici-tusci:interior', name: 'x', position: { x: 0, y: -240, z: 0 }, radius: 0.3 });
    installContent(w.game);
    const it = w.items.find((i) => i.id === 'container:ctn-arca-porci')!;
    expect(it.label!()).toBe('A shop strongbox');
    expect(it.detail!()).toBe('Owned: Vibia Chreste');
    const spec = CONTAINERS.find((c) => c.id === 'ctn-arca-porci')!;
    expect(spec.locked).toBe('mediocris');
  });

  it('a runtime container (a flat’s chest) is the same interactable, its loot rolled from its id and kept in the world deltas', () => {
    const w = world();
    const content = installContent(w.game);
    const spec = { id: 'gen:door-1:chest', at: 'gen:door-1', kind: 'cista-insulae' as const, table: 'chest.common', owner: 'tenant:1', ownerName: 'the tenant', interior: true };
    const off = content.addContainer(spec, new THREE.Vector3(10, -150, 20));
    const it = w.items.find((i) => i.id === 'container:gen:door-1:chest')!;
    expect(it.position().toArray()).toEqual([10, -150, 20]);
    expect(it.label!()).toBe('A tenant’s chest');
    expect(it.detail!()).toBe('Owned: the tenant');
    it.interact(w.game);
    const view = w.views.at(-1)!;
    const before = view.items().map((i) => [i.itemId, i.count]);
    // The same chest in another game holds the same things.
    const w2 = world();
    const c2 = installContent(w2.game);
    c2.addContainer(spec, new THREE.Vector3(0, 0, 0));
    w2.items.find((i) => i.id === 'container:gen:door-1:chest')!.interact(w2.game);
    expect(w2.views.at(-1)!.items().map((i) => [i.itemId, i.count])).toEqual(before);
    // Taking everything is remembered; dropping the cell and rebuilding it brings back an empty chest, not the loot.
    view.takeAll();
    expect(view.items()).toEqual([]);
    expect(w.game.deltas.get('gen:door-1:chest')).toBeDefined();
    off();
    expect(w.items.some((i) => i.id === 'container:gen:door-1:chest')).toBe(false);
    content.addContainer(spec, new THREE.Vector3(10, -150, 20));
    const again = w.items.find((i) => i.id === 'container:gen:door-1:chest')!;
    expect(again.enabled!()).toBe(false);
  });

  it('a locked runtime chest stays shut until picked or keyed, and stays open once it is', () => {
    const w = world();
    const content = installContent(w.game);
    const spec = { id: 'gen:door-2:arca', at: 'gen:door-2', kind: 'arca-tabernae' as const, table: 'strongbox', owner: 'household:2', ownerName: 'the household', locked: 'mediocris' as const, interior: true, label: 'The master’s strongbox' };
    content.addContainer(spec, new THREE.Vector3());
    const it = w.items.find((i) => i.id === 'container:gen:door-2:arca')!;
    expect(it.label!()).toBe('The master’s strongbox');
    it.interact(w.game);
    // No lockpick service in this world: the chest says it cannot be opened; nothing was shown.
    expect(w.views).toHaveLength(0);
  });
});
