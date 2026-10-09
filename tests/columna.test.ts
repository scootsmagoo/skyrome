/**
 * The Column's interior cells (src/world/interiors/columna.ts, spec §3.2 and §3.3): the stair is
 * walkable by the real Actor (the player at 4.4 m/s, a townsman-sized NPC at 1.3 m/s) from the
 * entry to the top and back, with headroom on the walking line; the landings are flat; the platform
 * holds a walker against its rail. registerColumnInteriors places the cells from the Column's frame
 * and gates the outside door on its flag.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Game } from '../src/core/Game';
import { Layer, initPhysics, type Physics } from '../src/core/Physics';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { COLUMN_LOCAL, columnHeading, columnLocalToWorld } from '../src/world/landmarks/columnFrame';
import { DUN_COLUMNA, columnaSumma, dunColumna, registerColumnInteriors } from '../src/world/interiors/columna';
import type { InteriorBuild, InteriorDef, Vec3 } from '../src/world/interiors/types';
import { makeWorld, walk, type TestWorld } from './arch.walker';

const PLAYER = { radius: 0.35, layer: Layer.Player };
const NPC = { radius: 0.3, layer: Layer.Npc };
/** The Column's stair top (185 risers of 0.19 m). */
const STAIR_TOP = 185 * 0.19;
const ctx = { game: {} as Game, builder: () => new MeshBuilder() };

/** A physics world holding a def's build at the identity origin (optionally on a ground slab). */
function buildWorld(def: InteriorDef, ground = false): { w: TestWorld; built: InteriorBuild } {
  const w = makeWorld(ground);
  const built = def.build(ctx);
  const p: Physics = w.physics;
  for (const c of built.colliders) {
    if (c.kind === 'box') p.addOrientedBox(c.center, c.half, c.rotation ?? new THREE.Quaternion());
    else if (c.kind === 'cylinder') p.addCylinder(c.center, c.halfHeight, c.radius);
    else p.addTrimesh(c.geometry, c.matrix);
  }
  p.step(1 / 60);
  return { w, built };
}

function spot(built: InteriorBuild, id: string): THREE.Vector3 {
  const s = built.spots.find((x) => x.id === id);
  if (!s) throw new Error(`no spot ${id}`);
  return s.position.clone();
}

/** Distance up from a point to the first World surface (Infinity if none). */
function headroom(w: TestWorld, p: Vec3): number {
  const hit = w.physics.raycast({ x: p.x, y: p.y + 0.02, z: p.z }, { x: 0, y: 1, z: 0 }, 30, Layer.World);
  return hit ? hit.distance : Infinity;
}

/** The stair's walking route in the cell (local). */
function route(): Vec3[] {
  const r = dunColumna.route;
  return typeof r === 'function' ? r() : (r ?? []);
}

describe('the stair cell dun-columna', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('the route is a walking line: the entry, the mouth, then the stair up to the top', () => {
    const r = route();
    expect(r.length).toBeGreaterThan(60);
    expect(r[0].z).toBeCloseTo(-3.1, 2);
    expect(r[r.length - 1].y).toBeCloseTo(STAIR_TOP, 2);
  });

  it.each([
    ['the player capsule (4.4 m/s)', PLAYER, 4.4],
    ['an NPC capsule (1.3 m/s)', NPC, 1.3],
  ])('%s climbs from the entry to the top and back down', (_name, body, speed) => {
    const { w } = buildWorld(dunColumna);
    const r = route();
    const up = r.slice(1).map((p) => ({ to: [p.x, p.z] as [number, number], seconds: 6, speed, reach: 0.2 }));
    const down = r
      .slice(0, -1)
      .reverse()
      .map((p) => ({ to: [p.x, p.z] as [number, number], seconds: 6, speed, reach: 0.2 }));
    const res = walk(w, { x: r[0].x, y: 0.05, z: r[0].z }, [...up, ...down], body);
    const n = up.length;
    // The top: reached at the stair's height.
    const topEnd = res.ends[n - 1];
    expect(Math.abs(topEnd.y - STAIR_TOP)).toBeLessThan(0.25);
    // Back at the entry, on the vestibule floor.
    const back = res.ends[res.ends.length - 1];
    expect(Math.hypot(back.x - r[0].x, back.z - r[0].z)).toBeLessThan(0.5);
    expect(Math.abs(back.y)).toBeLessThan(0.25);
  });

  it('has at least 2.0 m of headroom above every point of the route', () => {
    const { w } = buildWorld(dunColumna);
    for (const p of route()) {
      expect(headroom(w, p), `headroom at ${p.y.toFixed(2)} m`).toBeGreaterThanOrEqual(2.0);
    }
  });

  it('the landings are flat: a ray down at each landing hits the same height across the landing', () => {
    const { w, built } = buildWorld(dunColumna);
    for (const id of ['landing-1', 'landing-2']) {
      const s = spot(built, id);
      const a = Math.atan2(s.x, s.z);
      const r = Math.hypot(s.x, s.z);
      for (const da of [-0.4, 0, 0.4]) {
        const x = r * Math.sin(a + da);
        const z = r * Math.cos(a + da);
        const hit = w.physics.raycast({ x, y: s.y + 1, z }, { x: 0, y: -1, z: 0 }, 3, Layer.World);
        expect(hit, `${id} at ${da}`).not.toBeNull();
        expect(Math.abs(hit!.distance - 1)).toBeLessThan(0.03);
      }
    }
  });

  it('the top faces along the walking line (the way up), as the landings do', () => {
    const { built } = buildWorld(dunColumna);
    const top = spot(built, 'top');
    const a = Math.atan2(top.x, top.z);
    const h = built.spots.find((s) => s.id === 'top')!.heading ?? 0;
    // Forward is (sin h, cos h); the walking tangent at angle a is (cos a, −sin a), so h = a + π/2.
    expect(Math.sin(h)).toBeCloseTo(Math.cos(a), 2);
    expect(Math.cos(h)).toBeCloseTo(-Math.sin(a), 2);
  });

  it('the platform door sends the player to the top of the stair facing the same way', () => {
    const h = built().spots.find((s) => s.id === 'top')!.heading ?? 0;
    const down = columnaSumma.doors!.find((d) => d.id === 'columna-summa:down')!;
    const to = down.to;
    expect(to.interior).toBe(DUN_COLUMNA);
    expect(to.heading).toBeCloseTo(h, 9);
  });
});

/** The cell's built spots (the identity build is cheap, and no physics is needed to read them). */
function built(): InteriorBuild {
  return dunColumna.build(ctx);
}

describe('the platform columna-summa', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('a walker goes once round the drum on the slab, and the rail holds a walker pushed at it', () => {
    const { w, built } = buildWorld(columnaSumma, false);
    const hatch = spot(built, 'hatch');
    expect(hatch.y).toBeCloseTo(0, 3);
    const R = 1.9;
    const pts: [number, number][] = [
      [-R, 0],
      [0, R],
      [R, 0],
      [0, -R],
    ];
    const legs = pts.map(([x, z]) => ({ to: [x, z] as [number, number], seconds: 6, speed: 4.4, reach: 0.2 }));
    const res = walk(w, { x: hatch.x, y: 0.05, z: hatch.z }, legs, PLAYER);
    for (const e of res.ends) {
      expect(Math.abs(e.y)).toBeLessThan(0.05);
      expect(Math.hypot(e.x, e.z)).toBeGreaterThan(1.4);
    }
    // Pushed toward the rail (+x) from the east side: the rail stops the walker, and the walker stays on the slab.
    const push = walk(w, { x: R, y: 0.05, z: 0 }, [{ dir: [1, 0], seconds: 3, speed: 4.4 }], PLAYER);
    expect(push.x).toBeGreaterThan(1.9);
    expect(push.x).toBeLessThan(2.6);
    expect(Math.abs(push.y)).toBeLessThan(0.05);
  });

  it('the spots: hatch and bitus stand on the slab, the hatch faces away from the drum', () => {
    const { built } = buildWorld(columnaSumma, false);
    for (const id of ['hatch', 'bitus', 'view']) {
      const s = spot(built, id);
      expect(Math.abs(s.y)).toBeLessThan(0.01);
      expect(Math.hypot(s.x, s.z)).toBeLessThan(2.6);
    }
    const h = built.spots.find((s) => s.id === 'hatch')!;
    expect(h.heading).toBeCloseTo(Math.PI, 3);
  });
});

describe('registerColumnInteriors', () => {
  const placed = () => ({ landmarks: new Map([['column-trajan', { position: new THREE.Vector3(10, 4, -20), rotationY: 0.6 }]]) });

  it('registers both cells, with origins from the Column frame', () => {
    const defs: InteriorDef[] = [];
    const game = { ...placed(), interiors: { register: (d: InteriorDef) => defs.push(d) } } as unknown as Game;
    registerColumnInteriors(game);
    expect(defs).toEqual([dunColumna, columnaSumma]);

    const axis = columnLocalToWorld(game, COLUMN_LOCAL.axis)!;
    const o = dunColumna.origin(game)!;
    expect(o.x).toBeCloseTo(axis.x, 6);
    expect(o.z).toBeCloseTo(axis.z, 6);
    expect(o.y).toBeCloseTo(axis.y - 120, 6);
    expect(o.rotY).toBeCloseTo(0.6, 9);

    const top = columnLocalToWorld(game, { x: COLUMN_LOCAL.axis.x, y: COLUMN_LOCAL.abacusTop, z: COLUMN_LOCAL.axis.z })!;
    const so = columnaSumma.origin(game)!;
    expect(so.x).toBeCloseTo(top.x, 6);
    expect(so.y).toBeCloseTo(top.y, 6);
    expect(so.z).toBeCloseTo(top.z, 6);
    expect(so.rotY).toBeCloseTo(0.6, 9);
  });

  it('gives no origin until the Column is placed', () => {
    const game = { landmarks: new Map() } as unknown as Game;
    expect(dunColumna.origin(game)).toBeNull();
    expect(columnaSumma.origin(game)).toBeNull();
  });

  it('refuses the outside door without the flag and allows it with the flag', () => {
    const door = dunColumna.doors!.find((d) => d.id === 'dun-columna:in')!;
    const shut = { ...placed(), quests: { flags: { get: () => undefined } } } as unknown as Game;
    const open = { ...placed(), quests: { flags: { get: (k: string) => (k === 'columna-open' ? true : undefined) } } } as unknown as Game;
    expect(door.locked!(shut)).toMatch(/sealed with lead/);
    expect(door.locked!(open)).toBeNull();
  });

  it('standing on the platform hides the Column top it stands in for, and showing it again restores it', () => {
    const scene = new THREE.Group();
    const top = new THREE.Group();
    top.name = 'column-trajan:lod:column-top';
    const capital = new THREE.Group();
    capital.name = 'column-trajan:lod:column';
    scene.add(top, capital);
    const game = { ...placed(), scene } as unknown as Game;
    columnaSumma.onEnter!(game);
    expect(top.visible).toBe(false);
    expect(capital.visible).toBe(true);
    columnaSumma.onExit!(game);
    expect(top.visible).toBe(true);
  });

  it('the exit from the stair turns the player to face away from the door', () => {
    const game = { ...placed() } as unknown as Game;
    const out = dunColumna.doors!.find((d) => d.id === 'dun-columna:out')!;
    const h = out.to.heading as (g: Game) => number;
    expect(h(game)).toBeCloseTo(0.6 + Math.PI, 9);
    expect(columnHeading(game, 0)).toBeCloseTo(0.6, 9);
  });
});
