/**
 * The character controller must be able to walk up the kit's stairs (temple podia, tholos podia,
 * cavea aisles). These tests drive the real Actor (tests/arch.walker.ts), so a regression in
 * Actor.locomote (velocity bleeding vs autostep) is caught here too.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { cavea } from '../src/arch/classical/amphitheatre';
import { temple } from '../src/arch/classical/temple';
import { tholos } from '../src/arch/classical/tholos';
import { stairs } from '../src/arch/common/stairs';
import { initPhysics } from '../src/core/Physics';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { addColliders, makeWorld, walk } from './arch.walker';

describe('stairs are walkable (real Actor)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  for (const mode of ['steps', 'ramp'] as const) {
    it(`climbs a 13-step temple flight (${mode} colliders)`, () => {
      const w = makeWorld();
      const b = new MeshBuilder();
      const s = stairs(b, { width: 6, rise: 0.228, run: 0.34, count: 13, collider: mode });
      // landing on top
      b.box('travertine', 6, s.height, 30, new THREE.Matrix4().makeTranslation(0, s.height / 2, s.depth + 15), { collide: true });
      addColliders(w.physics, b);
      const r = walk(w, { x: 0, y: 0.05, z: -2 }, [{ dir: [0, 1], seconds: 4 }]);
      expect(r.z).toBeGreaterThan(s.depth + 0.5);
      expect(r.y).toBeCloseTo(s.height, 1);
    });
  }

  it('a grounded actor pushing into a wall stops and reports ~0 speed (no running in place)', () => {
    const w = makeWorld();
    w.physics.addBox({ x: 0, y: 2, z: 3 }, { x: 5, y: 2, z: 0.5 });
    const r = walk(w, { x: 0, y: 0.05, z: 0 }, [{ dir: [0, 1], seconds: 2 }]);
    expect(r.z).toBeLessThan(2.5 - 0.3);
    expect(r.speed).toBeLessThan(0.5);
    // Pushing diagonally into the wall slides along it at the tangential speed only.
    const d = walk(makeWorldWithWall(), { x: 0, y: 0.05, z: 0 }, [{ dir: [Math.SQRT1_2, Math.SQRT1_2], seconds: 2 }]);
    expect(d.speed).toBeLessThan(4.4 * Math.SQRT1_2 + 0.3);
    expect(d.x).toBeGreaterThan(3);
  });

  it('climbs the real hexastyle temple podium stairs', () => {
    const w = makeWorld();
    const b = new MeshBuilder();
    const r = temple(b, { order: 'corinthian', plan: 'pseudoperipteral', front: 6, width: 18, detail: 'low' });
    addColliders(w.physics, b);
    const st = r.layout.stairs;
    const x = (st.x0 + st.x1) / 2 + 0.6; // between the central columns' axes
    const res = walk(w, { x, y: 0.05, z: st.z0 - 2 }, [{ dir: [0, 1], seconds: 6 }]);
    expect(res.y).toBeCloseTo(r.layout.podiumHeight, 1);
  });

  it('climbs the Temple of Vesta podium stairs (flight against the round podium)', () => {
    const w = makeWorld();
    const b = new MeshBuilder();
    const t = tholos(b, { radius: 5.2, columns: 18, columnHeight: 6.4, base: 'podium', baseHeight: 2.0, detail: 'low' });
    addColliders(w.physics, b);
    // up the centre line, and 0.45 m off it (the flight's sides meet the curved podium face)
    for (const x of [0, 0.45, -0.45]) {
      const res = walk(w, { x, y: 0.05, z: -t.outerRadius - 6 }, [{ dir: [0, 1], seconds: 5 }]);
      expect(res.y, `x = ${x}`).toBeCloseTo(t.baseHeight, 1);
    }
  });

  it('lateral flights (Castor type) end on a walled landing and lead onto the podium', () => {
    const w = makeWorld();
    const b = new MeshBuilder();
    const { layout: L } = temple(b, { order: 'ionic', plan: 'prostyle', front: 4, D: 0.8, pronaos: 2, sides: 6, stairs: 'sides', podiumHeight: 2.2, detail: 'low' });
    addColliders(w.physics, b);
    expect(L.landings.length).toBe(2);
    for (const [i, f] of L.flights.entries()) {
      const cx = (f.x0 + f.x1) / 2;
      const ld = L.landings[i];
      // Straight up the flight and on: the end wall stops the walker on the landing (no drop).
      const up = walk(w, { x: cx, y: 0.05, z: f.z0 - 2 }, [{ dir: [0, 1], seconds: 6 }]);
      expect(up.y, `flight ${i}`).toBeCloseTo(L.podiumHeight, 1);
      expect(up.z).toBeLessThan(ld.z1);
      // Then turn inward onto the podium, between the flank columns.
      const inward = i === 0 ? 1 : -1;
      const on = walk(w, { x: cx, y: 0.05, z: f.z0 - 2 }, [
        { to: [cx, (ld.z0 + ld.z1) / 2 + 0.3], seconds: 6 },
        { dir: [inward, 0], seconds: 2 },
      ]);
      expect(on.y).toBeCloseTo(L.podiumHeight, 1);
      expect(Math.abs(on.x)).toBeLessThan(Math.abs(cx) - 1);
      // The parapet keeps the walker from stepping off the flight's outer side.
      const side = walk(w, { x: cx, y: 0.05, z: f.z0 - 2 }, [
        { to: [cx, (f.z0 + f.z1) / 2], seconds: 4 },
        { dir: [-inward, 0], seconds: 2 },
      ]);
      expect(Math.abs(side.x)).toBeLessThan(Math.max(Math.abs(f.x0), Math.abs(f.x1)));
    }
  });

  it('climbs the Hercules Victor crepidoma', () => {
    const w = makeWorld();
    const b = new MeshBuilder();
    const t = tholos(b, { radius: 6.6 * 0.6 * 1.4, columns: 20, columnHeight: 10.6 * 0.6, base: 'steps', baseHeight: 0.9, detail: 'low' });
    addColliders(w.physics, b);
    const res = walk(w, { x: 0, y: 0.05, z: -t.outerRadius - 3 }, [{ dir: [0, 1], seconds: 3 }]);
    expect(res.y).toBeCloseTo(t.baseHeight, 1);
  });

  it('climbs the cavea by its aisles (half-height steps), not over the 0.4 m seat rows', () => {
    const w = makeWorld();
    const b = new MeshBuilder();
    const c = cavea(b, { arenaRx: 20, arenaRz: 14, podium: 2.4, tiers: [{ rows: 6, rise: 0.4, depth: 0.7 }, { rows: 4, rise: 0.4, depth: 0.7, wall: 1.2 }], segments: 64, aisles: 8, topWalk: 3 });
    addColliders(w.physics, b);
    const a = c.aisles[0];
    // start on the podium walkway at the first aisle and walk radially outward up the aisle
    const up = walk(w, { x: a.x + a.nx * 1.2, y: 2.45, z: a.z + a.nz * 1.2 }, [{ dir: [a.nx, a.nz], seconds: 16, speed: 3 }]);
    expect(up.maxY).toBeCloseTo(c.height, 0);
    // away from the aisles the rows are a wall for the character (it stays on the walkway)
    const m = c.aisles[1];
    const tMid = (a.t + m.t) / 2;
    const ex = 20 * Math.cos(tMid);
    const ez = 14 * Math.sin(tMid);
    const nl = Math.hypot(Math.cos(tMid) / 20, Math.sin(tMid) / 14);
    const nx = Math.cos(tMid) / 20 / nl;
    const nz = Math.sin(tMid) / 14 / nl;
    const blocked = walk(w, { x: ex + nx * 1.2, y: 2.45, z: ez + nz * 1.2 }, [{ dir: [nx, nz], seconds: 3, speed: 3 }]);
    expect(blocked.maxY).toBeLessThan(2.6);
  });
});

function makeWorldWithWall() {
  const w = makeWorld();
  w.physics.addBox({ x: 0, y: 2, z: 3 }, { x: 20, y: 2, z: 0.5 });
  return w;
}
