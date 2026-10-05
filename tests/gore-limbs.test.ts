import { describe, expect, it } from 'vitest';
import { B } from '../src/actors/avatar/rig';
import { chooseParts, dropletsFor, partMask, partTriangles, subtree, type Part } from '../src/combat/gore/limbs';

/** A deterministic stream of 0..1 values. */
const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length];
};

describe('what a cut takes with it (combat/gore/limbs.ts)', () => {
  it('a bone takes its descendants: the forearm takes the hand and fingers, not the upper arm', () => {
    const s = subtree('forearmR');
    expect([...s].sort((a, b) => a - b)).toEqual([B.forearmR, B.handR, B.fingersR, B.indexR].sort((a, b) => a - b));
    expect(s.has(B.upperArmR)).toBe(false);
    expect([...subtree('head')]).toEqual([B.head]);
    expect(subtree('thighL').has(B.toeL)).toBe(true);
  });

  it('a vertex goes with the part when at least half its skin weight is on the part', () => {
    const bones = subtree('forearmL');
    // v0: all forearm; v1: half elbow; v2: mostly upper arm; v3: hand.
    const si = [B.forearmL, 0, 0, 0, B.forearmL, B.upperArmL, 0, 0, B.upperArmL, B.forearmL, 0, 0, B.handL, 0, 0, 0];
    const sw = [1, 0, 0, 0, 0.5, 0.5, 0, 0, 0.7, 0.3, 0, 0, 1, 0, 0, 0];
    expect([...partMask(si, sw, bones)]).toEqual([1, 1, 0, 1]);
  });

  it('only triangles wholly on the part leave with it', () => {
    const mask = new Uint8Array([1, 1, 0, 1]);
    expect(partTriangles([0, 1, 3, 0, 1, 2], mask)).toEqual([0, 1, 3]);
  });
});

describe('what a killing blow severs', () => {
  const blade = (power: boolean, rng: () => number, direction?: 'none' | 'sideways' | 'forward') => ({ blade: true, power, direction, rng });

  it('nothing with gore off, or from a club, fists or a spear', () => {
    expect(chooseParts(blade(true, seq(0)), 'off')).toEqual([]);
    expect(chooseParts({ blade: false, power: true, rng: seq(0) }, 'ultra')).toEqual([]);
  });

  it('on ultra every killing cut severs something; on normal a light cut only sometimes', () => {
    for (let i = 0; i < 50; i++) {
      const r = Math.random;
      expect(chooseParts(blade(false, r), 'ultra').length).toBeGreaterThanOrEqual(1);
    }
    expect(chooseParts(blade(false, seq(0.9)), 'normal')).toEqual([]);
    expect(chooseParts(blade(false, seq(0.1, 0.1, 0.1)), 'normal')).toEqual(['head']);
  });

  it('an overhead or a sweep goes for the head first', () => {
    // chance roll, side, part roll (0.5 < 0.6 → head)
    expect(chooseParts(blade(true, seq(0, 0.3, 0.5, 0.99), 'sideways'), 'ultra')[0]).toBe('head');
  });

  it('never cuts what is already gone, nor a forearm off an arm already off at the shoulder', () => {
    const gone = new Set<Part>(['head', 'armL', 'armR', 'legL', 'legR']);
    for (let i = 0; i < 40; i++) expect(chooseParts(blade(true, Math.random), 'ultra', gone)).toEqual([]);
  });

  it('blood: more for a cut than a club, more on ultra, none when off', () => {
    expect(dropletsFor(20, false, 'normal')).toBeGreaterThan(dropletsFor(20, true, 'normal'));
    expect(dropletsFor(20, false, 'ultra')).toBeGreaterThan(dropletsFor(20, false, 'normal'));
    expect(dropletsFor(20, false, 'off')).toBe(0);
    expect(dropletsFor(0, false, 'ultra')).toBe(0);
  });
});
