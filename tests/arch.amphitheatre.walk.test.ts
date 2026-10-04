/**
 * The Colosseum must be enterable on foot (real generator, real Actor): through a ground-floor
 * arch and an arena gate onto the sand, and through a vomitorium up to the first praecinctio
 * walkway, then up an aisle onto the seat rows.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { amphitheatre, caveaSection, ellipseAt, ellipseNormal, type AmphitheatreSpec } from '../src/arch/classical/amphitheatre';
import { colosseumStoreys } from '../src/arch/classical/arch';
import { initPhysics } from '../src/core/Physics';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { addColliders, makeWorld, walk, type Leg } from './arch.walker';

const K = 0.6;
/** The gallery's Colosseum (src/scenes/arch.ts), at low detail (colliders are the same). */
const SPEC: AmphitheatreSpec = {
  facade: { rx: 94 * K, rz: 78 * K, bays: 80, storeys: colosseumStoreys(K), depth: 2.4 * K, corridor: 6 * K, material: 'travertine', detail: 'low', columnDetail: 'low' },
  cavea: {
    arenaRx: 43 * K,
    arenaRz: 27 * K,
    podium: 4 * K,
    tiers: [{ rows: 6, rise: 0.4, depth: 0.7 }, { rows: 9, rise: 0.4, depth: 0.7, wall: 1.0 }, { rows: 5, rise: 0.4, depth: 0.7, wall: 1.0 }],
    segments: 96,
    aisles: 20,
    topPortico: { order: 'corinthian', columnHeight: 7 },
    detail: 'low',
  },
};

/** A point on the curve parallel to the arena edge at distance d. */
function onRing(t: number, d: number): [number, number] {
  const [x, z] = ellipseAt(SPEC.cavea.arenaRx, SPEC.cavea.arenaRz, t);
  const [nx, nz] = ellipseNormal(SPEC.cavea.arenaRx, SPEC.cavea.arenaRz, t);
  return [x + nx * d, z + nz * d];
}

describe('amphitheatre access', () => {
  let world: ReturnType<typeof makeWorld>;
  let r: ReturnType<typeof amphitheatre>;
  beforeAll(async () => {
    await initPhysics();
    const b = new MeshBuilder();
    r = amphitheatre(b, SPEC);
    world = makeWorld();
    addColliders(world.physics, b);
    world.physics.step(1 / 60);
  });

  it('has the four axial entrances: arches (not piers) on both axes, gates on the major one', () => {
    const gates = r.entrances.filter((e) => e.kind === 'gate');
    expect(gates.length).toBe(2);
    for (const g of gates) expect(Math.abs(g.z)).toBeLessThan(1e-6);
    // the bays centred on the minor axis are entrances too
    expect(r.entrances.some((e) => Math.abs(e.x) < 1e-6 && e.z > 0)).toBe(true);
    expect(r.entrances.some((e) => Math.abs(e.x) < 1e-6 && e.z < 0)).toBe(true);
    // a ray along the major axis from outside reaches the arena: nothing solid in the way
    const hit = world.physics.raycast({ x: SPEC.facade.rx + 5, y: 1.0, z: 0 }, { x: -1, y: 0, z: 0 }, SPEC.facade.rx + 5 - SPEC.cavea.arenaRx + 2);
    expect(hit).toBeNull();
  });

  it('walks in through the east arch and the Porta onto the arena sand', () => {
    const e = r.entrances.find((x) => x.kind === 'gate' && x.x > 0)!;
    const legs: Leg[] = [
      { to: [e.x - e.nx * 1.0, e.z - e.nz * 1.0], seconds: 6 },
      { to: [0, 0], seconds: 20, reach: 1.0 },
    ];
    const res = walk(world, { x: e.x + e.nx * 5, y: 0.05, z: e.z + e.nz * 5 }, legs);
    expect(Math.hypot(res.x, res.z)).toBeLessThan(2);
    expect(res.y).toBeLessThan(0.2);
  });

  it('climbs a vomitorium to the first walkway, then an aisle onto the seat rows', () => {
    const sec = caveaSection(SPEC.cavea);
    const wl = sec.walls[0];
    const e = r.entrances.find((x) => x.kind === 'vomitorium' && x.x > 0 && x.z > 0)!;
    const p = e.passage;
    const at = (d: number): [number, number] => [p.x + p.dx * d, p.z + p.dz * d];
    const walkD = (wl.walk0 + wl.x) / 2;
    const aisle = r.cavea.aisles.reduce((best, a) => (Math.abs(a.t - p.t) < Math.abs(best.t - p.t) ? a : best));
    // Along the walkway (its flights sit only at the aisles), then line up in front of the
    // aisle's flight at the walkway's inner edge.
    const [axw, azw] = onRing(aisle.t, walkD);
    const along: Leg[] = [];
    for (let k = 1; k <= 8; k++) {
      const q = onRing(p.t + ((aisle.t - p.t) * k) / 8, walkD);
      if (Math.hypot(q[0] - axw, q[1] - azw) > 1.4) along.push({ to: q, seconds: 3, reach: 0.25 });
    }
    along.push({ to: onRing(aisle.t, wl.walk0 + 0.1), seconds: 4, reach: 0.15 });
    const legs: Leg[] = [
      { to: [e.x - e.nx * 1.0, e.z - e.nz * 1.0], seconds: 6 },
      { to: at(p.outer + 1.0), seconds: 6 },
      { to: at(p.mouth - 0.9), seconds: 12 },
      ...along,
      { dir: [aisle.nx, aisle.nz], seconds: 5, speed: 3 },
    ];
    const res = walk(world, { x: e.x + e.nx * 5, y: 0.05, z: e.z + e.nz * 5 }, legs);
    // on the walkway at the top of the flight
    expect(res.ends[2].y).toBeCloseTo(wl.y0, 1);
    // then up the aisle, over the praecinctio wall and onto the rows of the second tier
    expect(res.maxY).toBeGreaterThan(wl.y1 + 0.75);
  });

  it('keeps the seat rows solid on both sides of a vomitorium', () => {
    const e = r.entrances.find((x) => x.kind === 'vomitorium')!;
    const p = e.passage;
    const sec = caveaSection(SPEC.cavea);
    const row = sec.rows[10];
    const d = (row.x0 + row.x1) / 2;
    for (const side of [-1, 1]) {
      const lat = side * (p.width / 2 + 0.6);
      const x = p.x + p.dx * d - p.dz * lat;
      const z = p.z + p.dz * d + p.dx * lat;
      expect(world.physics.groundHeight(x, z, 60)).toBeCloseTo(row.y, 1);
    }
  });
});
