import { describe, expect, it } from 'vitest';
import { Mover } from '../src/ai/life/mover';
import { NavGrid } from '../src/ai/life/navgrid';
import { NavService } from '../src/ai/life/nav';
import { DEFAULT_STEER, MAX_SEPARATION_SPEED, avoidance, seek, separation, steer, stuckAction, StuckMonitor, type SteerNeighbor, type Vec2 } from '../src/ai/life/steering';
import { Rng } from '../src/core/Rng';
import { FakeWorld } from './npc-fakes';

const v = (): Vec2 => ({ x: 0, z: 0 });

describe('steering', () => {
  it('people stacked on one spot split different ways, at a walk (the Ludus regulars ran off as one)', () => {
    const at = { x: 525, z: 171, vx: 0, vz: 0, radius: 0.28, maxSpeed: 1.6 };
    const stack: SteerNeighbor[] = [0, 1, 2, 3].map(() => ({ x: 525, z: 171, vx: 0, vz: 0, radius: 0.28, weight: 1 }));
    const dirs = [11, 512, 873].map((seed) => {
      const out = separation({ ...at, seed }, stack, DEFAULT_STEER, v());
      expect(Math.hypot(out.x, out.z)).toBeLessThanOrEqual(MAX_SEPARATION_SPEED + 1e-9);
      return Math.atan2(out.z, out.x);
    });
    expect(new Set(dirs.map((d) => d.toFixed(2))).size).toBe(3);
    const w = steer({ ...at, seed: 11 }, v(), stack, DEFAULT_STEER, v());
    expect(Math.hypot(w.x, w.z)).toBeLessThanOrEqual(MAX_SEPARATION_SPEED + 1e-9);
  });

  it('seeks and arrives', () => {
    const o = seek(0, 0, 10, 0, 1.5, 2, v());
    expect(o.x).toBeCloseTo(1.5);
    const near = seek(0, 0, 0.5, 0, 1.5, 2, v());
    expect(near.x).toBeLessThan(0.5);
    expect(near.x).toBeGreaterThan(0);
  });

  it('separates overlapping walkers', () => {
    const a = { x: 0, z: 0, vx: 0, vz: 0, radius: 0.3, maxSpeed: 1.3 };
    const n: SteerNeighbor = { x: 0.3, z: 0, vx: 0, vz: 0, radius: 0.3, weight: 1 };
    const s = separation(a, [n], DEFAULT_STEER, v());
    expect(s.x).toBeLessThan(0);
    expect(Math.abs(s.z)).toBeLessThan(1e-9);
    // The player (weight 2.2) pushes harder than another citizen.
    const sp = separation(a, [{ ...n, weight: 2.2 }], DEFAULT_STEER, v());
    expect(Math.abs(sp.x)).toBeGreaterThan(Math.abs(s.x));
  });

  it('two walkers meeting head-on both keep to their right', () => {
    const a = { x: 0, z: 0, vx: 0, vz: 1.3, radius: 0.3, maxSpeed: 1.3 };
    const b: SteerNeighbor = { x: 0, z: 4, vx: 0, vz: -1.3, radius: 0.3, weight: 1 };
    const da = avoidance(a, { x: 0, z: 1.3 }, [b], DEFAULT_STEER, v());
    // a walks +z (south); its right is -x.
    expect(da.x).toBeLessThan(0);
    const db = avoidance({ x: 0, z: 4, vx: 0, vz: -1.3, radius: 0.3, maxSpeed: 1.3 }, { x: 0, z: -1.3 }, [{ x: 0, z: 0, vx: 0, vz: 1.3, radius: 0.3, weight: 1 }], DEFAULT_STEER, v());
    // b walks -z (north); its right is +x.
    expect(db.x).toBeGreaterThan(0);
  });

  it('steer never reverses a walker that wants to go forward', () => {
    const a = { x: 0, z: 0, vx: 0, vz: 1.2, radius: 0.3, maxSpeed: 1.3 };
    const crowd: SteerNeighbor[] = [];
    for (let i = 0; i < 6; i++) crowd.push({ x: (i - 2.5) * 0.5, z: 1.2, vx: 0, vz: -1.2, radius: 0.3, weight: 1 });
    const o = steer(a, { x: 0, z: 1.2 }, crowd, DEFAULT_STEER, v());
    expect(Math.hypot(o.x, o.z)).toBeLessThanOrEqual(Math.max(1.3, 3) + 1e-6);
  });
});

describe('stuck detection', () => {
  it('flags a blocked walker within about a second, never a moving one', () => {
    const m = new StuckMonitor();
    m.reset(0, 0);
    let t = 0;
    while (t < 1.05) {
      m.update(1 / 60, 0, 0, true, 1.3);
      t += 1 / 60;
    }
    expect(m.stuckTime).toBeGreaterThanOrEqual(0.5);
    expect(stuckAction(m.stuckTime)).not.toBe('none');

    const ok = new StuckMonitor();
    ok.reset(0, 0);
    for (let i = 0; i < 600; i++) ok.update(1 / 60, i * 0.02, 0, true, 1.3);
    expect(ok.stuckTime).toBe(0);
    // Idling on purpose is never "stuck".
    const idle = new StuckMonitor();
    for (let i = 0; i < 600; i++) idle.update(1 / 60, 0, 0, false, 0);
    expect(idle.stuckTime).toBe(0);
  });

  it('escalates sidestep → replan → new goal → unstick', () => {
    expect(stuckAction(0.2)).toBe('none');
    expect(stuckAction(0.6)).toBe('sidestep');
    expect(stuckAction(1.2)).toBe('replan');
    expect(stuckAction(2)).toBe('newGoal');
    expect(stuckAction(2.6)).toBe('unstick');
  });
});

/**
 * A crowd in a walled yard with pillars, a narrow doorway and a dead end, run with the real
 * Mover + NavGrid + steering and a character-controller-like integrator (slides along walls,
 * agents are soft to each other like crowd NPCs). AC-22: nobody may be stuck for more than 3 s.
 */
function simulate(agents: number, seconds: number, seed: number) {
  const w = new FakeWorld();
  // Outer walls of a 50 × 40 yard.
  w.wall(-26, -21, 26, -20).wall(-26, 20, 26, 21).wall(-26, -21, -25, 21).wall(25, -21, 26, 21);
  // A dividing wall with a 2 m door.
  w.wall(0, -20, 1, -1).wall(0, 1, 1, 20);
  // Pillars and statue bases.
  for (let i = 0; i < 6; i++) w.wall(-20 + i * 3, 8, -19.2 + i * 3, 8.8);
  w.wall(10, -10, 13, -7).wall(15, 5, 17, 12);
  // A dead-end pocket.
  w.wall(-20, -15, -10, -14).wall(-20, -15, -19, -6);
  const grid = new NavGrid(w, { radius: 60 });
  grid.setFocus(0, 0);
  grid.buildAll();
  grid.flood(-10, 0, 1e6);
  const nav = new NavService(grid);
  const rng = new Rng(seed);
  const pick = () => {
    for (;;) {
      const p = grid.randomWalkable(() => rng.next(), 0, 0, 24, 30);
      if (p && grid.reachable(p.x, p.z) && !w.hits(p.x, p.z, 0.3)) return p;
    }
  };
  const list = Array.from({ length: agents }, () => {
    const p = pick();
    const m = new Mover();
    const g = pick();
    m.setGoal(g.x, g.z, 1.1 + rng.next() * 0.5);
    return { x: p.x, z: p.z, vx: 0, vz: 0, m, noProgress: 0, maxNoProgress: 0, winX: p.x, winZ: p.z, winT: 0 };
  });
  const dt = 1 / 60;
  let arrivals = 0;
  let unsticks = 0;
  const desired = v();
  const out = v();
  const ns: SteerNeighbor[] = [];
  for (let step = 0; step < seconds * 60; step++) {
    nav.beginStep();
    for (const a of list) {
      const ev = a.m.update(dt, a.x, a.z, nav, desired);
      if (ev === 'arrived' || ev === 'failed' || ev === 'blocked') {
        if (ev === 'arrived') arrivals++;
        const g = pick();
        a.m.setGoal(g.x, g.z, 1.1 + rng.next() * 0.5);
      } else if (ev === 'stuck') {
        // What NpcManager.unstick does out of sight: hop to a free cell on the way.
        unsticks++;
        const c = a.m.corner();
        const p = (c && grid.nearestWalkable(c.x, c.z, 3)) || grid.nearestWalkable(a.x, a.z, 3);
        if (p) {
          a.x = p.x;
          a.z = p.z;
        }
        a.m.stuck.reset(a.x, a.z);
        a.noProgress = 0;
        a.winX = a.x;
        a.winZ = a.z;
        const g = pick();
        a.m.setGoal(g.x, g.z, 1.3);
      }
      ns.length = 0;
      for (const o of list) {
        if (o === a) continue;
        if (Math.abs(o.x - a.x) < 3 && Math.abs(o.z - a.z) < 3) ns.push({ x: o.x, z: o.z, vx: o.vx, vz: o.vz, radius: 0.28, weight: 1 });
      }
      steer({ x: a.x, z: a.z, vx: a.vx, vz: a.vz, radius: 0.28, maxSpeed: 1.7 }, desired, ns, DEFAULT_STEER, out);
      a.vx += (out.x - a.vx) * 0.2;
      a.vz += (out.z - a.vz) * 0.2;
      // KCC-like move: full, else slide along x or z, else stay.
      const nx = a.x + a.vx * dt;
      const nz = a.z + a.vz * dt;
      if (!w.hits(nx, nz, 0.3)) {
        a.x = nx;
        a.z = nz;
      } else if (!w.hits(nx, a.z, 0.3)) a.x = nx;
      else if (!w.hits(a.x, nz, 0.3)) a.z = nz;
      // Independent watchdog: time without 15 cm of progress while wanting to move.
      a.winT += dt;
      if (a.winT >= 0.5) {
        const moved = Math.hypot(a.x - a.winX, a.z - a.winZ);
        if (a.m.active && moved < 0.15) a.noProgress += a.winT;
        else a.noProgress = 0;
        a.maxNoProgress = Math.max(a.maxNoProgress, a.noProgress);
        a.winT = 0;
        a.winX = a.x;
        a.winZ = a.z;
      }
    }
  }
  return { arrivals, unsticks, maxStuck: Math.max(...list.map((a) => a.maxNoProgress)), insideWalls: list.filter((a) => w.hits(a.x, a.z, 0.2)).length };
}

describe('crowd simulation in a fake world (AC-22)', () => {
  it('40 walkers for 60 s: nobody stuck for more than 3 s, goals keep being reached', () => {
    const r = simulate(40, 60, 113);
    expect(r.maxStuck).toBeLessThanOrEqual(3);
    expect(r.insideWalls).toBe(0);
    expect(r.arrivals).toBeGreaterThan(80);
    // Unsticking is the last resort, not the way people get around.
    expect(r.unsticks).toBeLessThan(r.arrivals * 0.25);
  });

  it('holds for other seeds and a denser crowd', () => {
    for (const seed of [1, 2]) {
      const r = simulate(70, 30, seed);
      expect(r.maxStuck).toBeLessThanOrEqual(3);
      expect(r.insideWalls).toBe(0);
    }
  });
});
