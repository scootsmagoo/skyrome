import { describe, expect, it } from 'vitest';
import { closestOnLane, laneAt, LaneSet, makeLane } from '../src/ai/life/lanes';
import { Rng } from '../src/core/Rng';
import { atlasLanes, cartLane } from '../src/npc/crowd/atlasLanes';
import { toGame } from '../src/world/coords';

// An L-shaped street: 100 m east along z = 0, then 60 m south; and a side street at x = 40.
const main = makeLane('main', [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 60 }], 6);
const side = makeLane('side', [{ x: 40, z: 0 }, { x: 40, z: -50 }], 4);
const set = new LaneSet([main, side]);
const rand = () => new Rng(3);

describe('lanes', () => {
  it('measures arc length and finds the closest point', () => {
    expect(main.length).toBeCloseTo(160);
    const c = closestOnLane(main, 30, 5);
    expect(c.s).toBeCloseTo(30);
    expect(c.d).toBeCloseTo(5);
    expect(c.dx).toBeCloseTo(1);
    const c2 = closestOnLane(main, 104, 30);
    expect(c2.s).toBeCloseTo(130);
    expect(c2.dz).toBeCloseTo(1);
  });

  it('puts people on the right of their direction of travel (+x east, +z south)', () => {
    // Walking east, the right hand is south (+z).
    expect(laneAt(main, 50, 1).z).toBeCloseTo(1);
    // Walking south, the right hand is west (−x).
    expect(laneAt(main, 130, 1).x).toBeCloseTo(99);
  });

  it('samples points on the streets inside a ring around a point, heading along the street', () => {
    const r = rand();
    for (let i = 0; i < 50; i++) {
      const p = set.sample(() => r.next(), 50, 0, 10, 30);
      expect(p).not.toBeNull();
      const d = Math.hypot(p!.x - 50, p!.z);
      expect(d).toBeGreaterThan(8);
      expect(d).toBeLessThan(32);
      // On the street it was sampled on (within its half width).
      const near = closestOnLane(p!.lane, p!.x, p!.z);
      expect(near.d).toBeLessThanOrEqual(near.lane.width / 2 + 1e-9);
      // Heading along the street it was sampled on (east/west on main, north/south on side).
      const along = Math.abs(Math.sin(p!.heading) * near.dx + Math.cos(p!.heading) * near.dz);
      expect(along).toBeGreaterThan(0.99);
    }
    expect(set.sample(() => 0.5, 500, 500, 0, 30)).toBeNull();
  });

  it('walks on in the direction faced, and turns at the end of a street', () => {
    const r = rand();
    // Heading east (+x): the next leg is further east.
    const a = set.ahead(() => r.next(), 20, 1, Math.PI / 2, 25)!;
    expect(a.x).toBeGreaterThan(40);
    expect(Math.abs(a.z)).toBeLessThan(3);
    // Heading west from x = 10: past the start the walk turns back (or takes a junction).
    const b = set.ahead(() => r.next(), 10, 0, -Math.PI / 2, 25)!;
    expect(b).not.toBeNull();
    expect(b.x).toBeGreaterThanOrEqual(-1);
    // Round the corner: 30 m on from (90, 0) heading east ends up going south.
    const c = set.ahead(() => r.next(), 90, 0, Math.PI / 2, 30)!;
    expect(c.z).toBeGreaterThan(10);
    // Off the streets: nothing.
    expect(set.ahead(() => r.next(), 60, 40, 0, 25, 12)).toBeNull();
  });
});

describe('atlas lanes (Rome)', () => {
  const lanes = atlasLanes();

  it('covers the golden path from the Porta Capena to the Forum (GDD §17.2)', () => {
    // Real-metre points along the route: outside the gate, inside it, the Circus valley, the
    // Velabrum, the Vicus Tuscus, the Forum end of the Vicus Tuscus.
    for (const [x, z] of [
      [520, 975],
      [460, 890],
      [300, 760],
      [-60, 420],
      [0, 220],
      [80, 100],
    ] as const) {
      const [gx, gz] = toGame(x, z);
      expect(lanes.nearest(gx, gz, 8), `${x},${z}`).not.toBeNull();
    }
  });

  it('joins the Via Appia to the streets of the Circus valley through the gate', () => {
    const intra = lanes.lanes.find((l) => l.id === 'conn-capena-intra')!;
    const appia = lanes.lanes.find((l) => l.id === 'via-appia')!;
    expect(Math.hypot(intra.pts[0].x - appia.pts[0].x, intra.pts[0].z - appia.pts[0].z)).toBeLessThan(1);
    const end = intra.pts[intra.pts.length - 1];
    const circus = lanes.lanes.find((l) => l.id === 'street-north-of-circus')!;
    expect(closestOnLane(circus, end.x, end.z).d).toBeLessThan(2);
  });

  it('keeps carts off stairs and paths', () => {
    for (const l of lanes.lanes) if (l.kind === 'stairs') expect(cartLane(l)).toBe(false);
    expect(cartLane(lanes.lanes.find((l) => l.id === 'via-appia')!)).toBe(true);
  });
});
