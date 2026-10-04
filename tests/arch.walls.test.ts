/**
 * wall(): niches must be closed recesses (no see-through holes, from either side), closed doors
 * must block the character, and window fills must cover the whole (arched) outline.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { wall, type Opening } from '../src/arch/common/walls';
import { initPhysics } from '../src/core/Physics';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { addColliders, makeWorld, walk } from './arch.walker';

/** First front-facing hit of a ray against the built group (materials are FrontSide). */
function hit(group: THREE.Object3D, origin: THREE.Vector3, dir: THREE.Vector3) {
  const rc = new THREE.Raycaster(origin, dir.clone().normalize(), 0, 100);
  group.updateMatrixWorld(true);
  return rc.intersectObject(group, true)[0] ?? null;
}

describe('wall niches', () => {
  const t = 0.7;
  const niche: Opening = { kind: 'niche', x: 2, width: 1.1, height: 2.0 };
  const b = new MeshBuilder();
  wall(b, { length: 4, height: 4, thickness: t, material: 'brick', openings: [niche] });
  const g = b.build('w');
  const y0 = 0.6;
  const ys = y0 + 2.0 - 0.55; // springing of the semicircular head

  it('a ray along +z through the niche head hits geometry before the back face', () => {
    for (const [dx, dy] of [[0, 0.3], [0.3, 0.2], [-0.4, 0.1], [0, 0.5], [0.2, -0.5], [0, -1]]) {
      const h = hit(g, new THREE.Vector3(2 + dx, ys + dy, -3), new THREE.Vector3(0, 0, 1));
      expect(h, `(${dx}, ${dy})`).not.toBeNull();
      expect(h!.point.z, `(${dx}, ${dy})`).toBeLessThan(t / 2 - 0.05);
      // the surface seen is inside the recess or the front face, never the far side of the wall
      expect(h!.point.z).toBeGreaterThanOrEqual(-t / 2 - 1e-4);
    }
  });

  it('oblique views into the head and from behind are closed too', () => {
    // looking up into the head from below the springing, at an angle
    for (const dir of [new THREE.Vector3(0, 0.6, 1), new THREE.Vector3(0.4, 0.5, 1), new THREE.Vector3(-0.4, 0.8, 1)]) {
      const o = new THREE.Vector3(2, ys - 0.3, -t / 2 - 0.01).addScaledVector(dir.clone().normalize(), -0.5);
      const h = hit(g, o, dir);
      expect(h).not.toBeNull();
      expect(h!.point.z).toBeLessThan(t / 2 - 0.05);
    }
    // from behind, the wall's back face is intact over the niche
    for (const dy of [-1, 0, 0.3]) {
      const h = hit(g, new THREE.Vector3(2, ys + dy, 3), new THREE.Vector3(0, 0, -1));
      expect(h).not.toBeNull();
      expect(h!.point.z).toBeCloseTo(t / 2, 3);
    }
  });

  it('the recess is as deep as asked at its centre', () => {
    const h = hit(g, new THREE.Vector3(2, ys - 0.5, -3), new THREE.Vector3(0, 0, 1))!;
    expect(h.point.z).toBeCloseTo(-t / 2 + 0.6 * t, 2);
  });
});

describe('wall doors and windows', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('closed door leaves block the character and are reported for a lock system', () => {
    const b = new MeshBuilder();
    const r = wall(b, { length: 9, height: 5, thickness: 0.7, material: 'brick', openings: [{ kind: 'door', x: 4.5, width: 1.6, height: 2.8, id: 'front' }] });
    expect(r.doors.length).toBe(1);
    const d = r.doors[0];
    expect(d.id).toBe('front');
    expect(d.collider).not.toBeNull();
    expect(b.colliders).toContain(d.collider);
    expect(d.position.x).toBeCloseTo(4.5, 6);
    const w = makeWorld();
    addColliders(w.physics, b);
    const res = walk(w, { x: 4.5, y: 0.05, z: -3 }, [{ dir: [0, 1], seconds: 3 }]);
    expect(res.z).toBeLessThan(-0.35);
    // open leaves: walk straight through
    const b2 = new MeshBuilder();
    const r2 = wall(b2, { length: 9, height: 5, thickness: 0.7, material: 'brick', openings: [{ kind: 'door', x: 4.5, width: 1.6, height: 2.8, leaves: 'open' }] });
    expect(r2.doors[0].collider).toBeNull();
    const w2 = makeWorld();
    addColliders(w2.physics, b2);
    expect(walk(w2, { x: 4.5, y: 0.05, z: -3 }, [{ dir: [0, 1], seconds: 3 }]).z).toBeGreaterThan(2);
  });

  it('windows are real openings by default; a dark fill covers the whole arched outline', () => {
    const mk = (fill?: Opening['fill']) => {
      const b = new MeshBuilder();
      wall(b, { length: 4, height: 5, thickness: 0.7, material: 'reticulatum', openings: [{ kind: 'window', x: 2, width: 1.1, height: 1.6, sill: 2.4, arched: true, fill }] });
      return b.build('w');
    };
    const open = mk();
    const dark = mk('dark');
    // through the rectangle and through the arched head
    for (const y of [2.8, 3.75]) {
      expect(hit(open, new THREE.Vector3(2, y, -3), new THREE.Vector3(0, 0, 1))).toBeNull();
      const h = hit(dark, new THREE.Vector3(2, y, -3), new THREE.Vector3(0, 0, 1));
      expect(h).not.toBeNull();
      expect(h!.point.z).toBeGreaterThan(0.3);
    }
  });
});
