import { describe, expect, it } from 'vitest';
import { TREE_SPECIES, makeTree } from './species';
import { WIND, windProfile } from './wind';

describe('windProfile', () => {
  it('lets only leafy parts flutter: bark and far stand-ins only bend', () => {
    for (const sp of TREE_SPECIES) {
      const m = makeTree(sp, 0);
      for (const part of [...m.near, ...m.far]) {
        const p = windProfile(part);
        expect(p.sway).toBe(WIND[part.wind].sway);
        if (part.baked || part.material === 'bark') expect(p.flutter, `${sp} ${part.material}`).toBe(0);
        else expect(p.flutter, `${sp} ${part.material}`).toBeGreaterThan(0);
      }
    }
  });

  it('gives leaf cards the same branch flutter as the clumps they sit on', () => {
    const m = makeTree('plane', 0);
    const clumps = m.near.find((p) => p.material.startsWith('foliage') && !p.cards)!;
    const cards = m.near.find((p) => p.cards)!;
    expect(windProfile(cards).flutter).toBe(windProfile(clumps).flutter);
    expect(windProfile(cards).card).toBe(cards.cards);
  });
});
