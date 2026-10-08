import { describe, expect, it } from 'vitest';
import { attendance, boutsIn, munusOn, munusPhase, NAMES, pairOf, PAIRINGS, verdictFor } from '../src/arena/munus';
import { caveaSeats } from '../src/arena/spectators';
import { caveaGaps, colosseumLayout } from '../src/world/landmarks/builders/colos-colosseum';

describe('munus calendar and programme', () => {
  it('runs through the game window with a rest day every fourth day', () => {
    const shows = [0, 1, 2, 3, 4, 5, 6, 7].map((d) => !!munusOn({ month: 4, day: 11 }, d));
    expect(shows).toEqual([true, true, true, false, true, true, true, false]);
    expect(munusOn({ month: 3, day: 20 }, 0)).toBeNull();
    expect(munusOn({ month: 10, day: 2 }, 0)).toBeNull();
  });

  it('never rests on a great day', () => {
    const d = munusOn({ month: 4, day: 12 }, 3);
    expect(d?.grand).toBe(true);
    expect(d?.editor).toContain('Traianus');
  });

  it('follows the day: gates, practice bouts, the interval, the pompa, the pairs, the exit', () => {
    expect(munusPhase(-0.5)).toBe('closed');
    expect(munusPhase(0.5)).toBe('gates');
    expect(munusPhase(3)).toBe('prolusio');
    expect(munusPhase(6)).toBe('meridies');
    expect(munusPhase(7)).toBe('pompa');
    expect(munusPhase(9)).toBe('pairs');
    expect(munusPhase(11.5)).toBe('exit');
    expect(munusPhase(13)).toBe('closed');
    expect(boutsIn('prolusio')).toBe('lusio');
    expect(boutsIn('pairs')).toBe('ferrum');
    expect(boutsIn('meridies')).toBeNull();
  });

  it('fills the house through the morning, thins at midday and empties at dusk', () => {
    expect(attendance(-1)).toBe(0);
    expect(attendance(13)).toBe(0);
    expect(attendance(9)).toBeGreaterThan(0.9);
    expect(attendance(6)).toBeLessThan(attendance(4));
    expect(attendance(0.5)).toBeLessThan(attendance(2));
  });
});

describe('the card', () => {
  it('pairs classic armaturae with distinct stage names, the same every time for a day', () => {
    for (let n = 1; n < 30; n++) {
      const p = pairOf('4-11-0', n, false);
      expect(PAIRINGS.some((x) => x.a === p.a.armatura && x.b === p.b.armatura)).toBe(true);
      expect(p.a.name).not.toBe(p.b.name);
      expect(NAMES[p.a.armatura]).toContain(p.a.name);
      expect(p.a.wins).toBeLessThanOrEqual(p.a.fights);
    }
    expect(pairOf('4-11-0', 3, false)).toEqual(pairOf('4-11-0', 3, false));
    expect(pairOf('4-11-0', 3, true).a.tier).toBe('thug');
    expect(pairOf('4-11-0', 3, false, true).a.tier).toBe('champion');
  });

  it('spares practice fighters always and most beaten men', () => {
    expect(verdictFor({ lusio: true, foughtWell: false, grand: true }, 0.99)).toBe('mitte');
    expect(verdictFor({ lusio: false, foughtWell: true, grand: false }, 0.5)).toBe('mitte');
    expect(verdictFor({ lusio: false, foughtWell: false, grand: false }, 0.95)).toBe('iugula');
    let spared = 0;
    for (let i = 0; i < 100; i++) if (verdictFor({ lusio: false, foughtWell: i % 2 === 0, grand: false }, (i + 0.5) / 100) === 'mitte') spared++;
    expect(spared).toBeGreaterThan(70);
  });
});

describe('the seats', () => {
  const L = colosseumLayout();
  const seats = caveaSeats(L);

  it('seats several thousand round the bowl, on the treads, facing the sand', () => {
    expect(seats.length).toBeGreaterThan(6000);
    expect(seats.length).toBeLessThan(14000);
    const ys = new Set(L.section.rows.map((r) => r.y));
    for (const s of seats.slice(0, 500)) {
      expect(ys.has(s.y)).toBe(true);
      // Facing inward: forward points back toward the centre.
      expect(Math.sin(s.h) * -s.x + Math.cos(s.h) * -s.z).toBeGreaterThan(0);
    }
    for (const t of [0, 1, 2, 3]) expect(seats.some((s) => s.tier === t)).toBe(true);
  });

  it('leaves the boxes, vomitoria and aisles clear', () => {
    for (const g of caveaGaps(L)) {
      const [ox, oz] = L.oval.point(g.t, 0);
      const [nx, nz] = L.oval.normal(g.t);
      for (const s of seats) {
        if (s.tier !== g.tier) continue;
        const row = L.section.rows.find((r) => r.tier === s.tier && r.y === s.y)!;
        if (row.row >= g.rows) continue;
        const dx = s.x - ox;
        const dz = s.z - oz;
        if (dx * nx + dz * nz < 0) continue;
        expect(Math.abs(dx * -nz + dz * nx)).toBeGreaterThanOrEqual(g.hw);
      }
    }
  });
});
