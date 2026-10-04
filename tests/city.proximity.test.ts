/** ProximityColliders: colliders exist only near the player, with hysteresis. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ProximityColliders } from '../src/world/city/proximity';

describe('proximity colliders', () => {
  it('creates colliders within `near`, keeps them to `far`, removes them beyond', () => {
    let live = 0, made = 0;
    const host = { add: () => (live++, made++, {}), remove: () => void live-- };
    const p = new ProximityColliders(host, { near: 80, far: 110 });
    const spec = () => [{ kind: 'box' as const, center: new THREE.Vector3(), half: new THREE.Vector3(1, 1, 1) }];
    p.add(0, 0, 10, () => [...spec(), ...spec()]);
    p.add(500, 0, 10, spec);
    p.update({ x: 0, z: 0 });
    expect(live).toBe(2);
    expect(p.live).toBe(2);
    // 105 m away: inside the hysteresis band, kept.
    p.update({ x: 115, z: 0 });
    expect(live).toBe(2);
    // Beyond far: removed; near the other patch: created.
    p.update({ x: 450, z: 0 });
    expect(live).toBe(1);
    expect(made).toBe(3);
    // No movement: nothing re-evaluated.
    p.update({ x: 451, z: 0 });
    expect(made).toBe(3);
    p.clear();
    expect(live).toBe(0);
  });
});
