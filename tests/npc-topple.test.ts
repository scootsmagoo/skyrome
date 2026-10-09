/**
 * The topple gate (src/npc/topple.ts): walking never fells anyone, a run makes people stumble,
 * a sprint rarely fells an average adult who sees it coming and often a slight, old, loaded one
 * from behind; each contact is resolved once.
 */
import { describe, expect, it } from 'vitest';
import { PLAYER_SPEEDS } from '../src/player/PlayerController';
import { BRUSH_COOLDOWN, resistanceOf, resolveContact, ToppleGate, TOPPLE_COOLDOWN, type Resistor } from '../src/npc/topple';

/** Fraction of 200 evenly spread rolls that fall / stumble. */
function rates(approach: number, r: Resistor, facing: number) {
  let fall = 0;
  let stumble = 0;
  const N = 200;
  for (let i = 0; i < N; i++) {
    const o = resolveContact({ approach, facing }, r, (i + 0.5) / N);
    if (o === 'fall') fall++;
    else if (o === 'stumble') stumble++;
  }
  return { fall: fall / N, stumble: stumble / N };
}

const adult: Resistor = { build: 'average', age: 'adult' };
const frail: Resistor = { build: 'slight', age: 'old', load: 'basket' };
const S = PLAYER_SPEEDS.sprint;

describe('topple gate thresholds', () => {
  it('a walk never fells anyone, and does not stagger an adult', () => {
    for (const r of [adult, frail]) expect(rates(PLAYER_SPEEDS.walk, r, -1).fall).toBe(0);
    expect(rates(PLAYER_SPEEDS.walk, adult, -1).stumble).toBe(0);
  });

  it('a run makes people stumble but does not fell an adult', () => {
    const x = rates(PLAYER_SPEEDS.run, adult, 0);
    expect(x.fall).toBe(0);
    expect(x.stumble).toBeGreaterThan(0.9);
  });

  it('a sprint rarely fells an average adult who sees it coming', () => {
    expect(rates(S, adult, 1).fall).toBeLessThanOrEqual(0.1);
  });

  it('a sprint from behind fells an average adult sometimes, not always', () => {
    const f = rates(S, adult, -1).fall;
    expect(f).toBeGreaterThan(0.15);
    expect(f).toBeLessThan(0.85);
  });

  it('a sprint fells a slight, old person with a basket on the head', () => {
    expect(rates(S, frail, 0).fall).toBeGreaterThan(0.9);
    expect(rates(S, frail, 1).fall).toBeGreaterThan(0.7);
  });

  it('a braced guard is not felled by a sprint', () => {
    const guard: Resistor = { build: 'muscular', age: 'adult', braced: true };
    expect(rates(S, guard, 0).fall).toBe(0);
  });

  it('resistance grows with build and shrinks with a load or old age', () => {
    expect(resistanceOf({ build: 'heavy', age: 'adult' }, 0)).toBeGreaterThan(resistanceOf({ build: 'slight', age: 'adult' }, 0));
    expect(resistanceOf({ ...adult, load: 'amphora' }, 0)).toBeLessThan(resistanceOf(adult, 0));
    expect(resistanceOf({ ...adult, age: 'old' }, 0)).toBeLessThan(resistanceOf(adult, 0));
    expect(resistanceOf(adult, -1)).toBeLessThan(resistanceOf(adult, 1));
  });
});

describe('topple gate cooldown', () => {
  it('resolves a contact once, then the NPC is out of the gate for the cooldown', () => {
    const gate = new ToppleGate();
    const hard = { approach: S, facing: -1 };
    expect(gate.resolve('a', 10, hard, frail, 0.5)).toBe('fall');
    // Every physics step of the same contact: nothing more happens.
    for (let t = 10.016; t < 10 + TOPPLE_COOLDOWN - 0.01; t += 0.016) expect(gate.resolve('a', t, hard, frail, 0.5)).toBe('none');
    expect(gate.cooling('a', 11)).toBe(true);
    expect(gate.resolve('a', 10 + TOPPLE_COOLDOWN + 0.01, hard, frail, 0.5)).toBe('fall');
  });

  it('keeps cooldowns per NPC, and a mere brush is short', () => {
    const gate = new ToppleGate();
    const hard = { approach: S, facing: -1 };
    expect(gate.resolve('a', 0, hard, frail, 0.5)).toBe('fall');
    expect(gate.resolve('b', 0.1, hard, frail, 0.5)).toBe('fall');
    expect(gate.resolve('c', 0, { approach: 1.5, facing: 0 }, adult, 0.5)).toBe('none');
    expect(gate.cooling('c', BRUSH_COOLDOWN - 0.01)).toBe(true);
    expect(gate.cooling('c', BRUSH_COOLDOWN + 0.01)).toBe(false);
  });
});
