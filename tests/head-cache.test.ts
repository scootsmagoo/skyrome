import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Cache } from '../src/actors/avatar/real/head/index';

type Val = { geometry: THREE.BufferGeometry; triangles: number };

const make = () => {
  const geometry = new THREE.BufferGeometry();
  let disposed = 0;
  geometry.addEventListener('dispose', () => disposed++);
  return { value: { geometry, triangles: 1 } as Val, count: () => disposed };
};

describe('head geometry cache', () => {
  it('keeps a new entry when every older one is held (it used to evict and orphan it)', () => {
    const cache = new Cache<Val>(2);
    const made = new Map<string, ReturnType<typeof make>>();
    const get = (k: string) =>
      cache.acquire(k, () => {
        const m = make();
        made.set(k, m);
        return m.value;
      });
    get('a');
    get('b');
    get('c'); // full of held entries: the map grows, nothing is evicted
    expect(cache.stats()).toEqual({ entries: 3, held: 3, max: 2 });
    for (const m of made.values()) expect(m.count()).toBe(0);
    // Released, 'c' is found again and held, not rebuilt.
    cache.release('c');
    expect(get('c').value).toBe(made.get('c')!.value);
    expect(made.size).toBe(3);
  });

  it('disposes an unheld entry exactly once when the cap is passed, never a held one', () => {
    const cache = new Cache<Val>(2);
    const made = new Map<string, ReturnType<typeof make>>();
    const get = (k: string) =>
      cache.acquire(k, () => {
        const m = make();
        made.set(k, m);
        return m.value;
      });
    get('a');
    get('b');
    cache.release('a');
    get('c'); // over the cap: 'a' (unheld) goes
    expect(made.get('a')!.count()).toBe(1);
    expect(made.get('b')!.count()).toBe(0);
    expect(made.get('c')!.count()).toBe(0);
    expect(cache.stats().entries).toBe(2);
  });
});
