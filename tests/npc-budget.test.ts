import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import { crowdBudget, dayPhase, NIGHT_CAP, pickRole, roleWeights } from '../src/npc/crowd/budget';
import { districtAt, poiBoosts, poisNear } from '../src/npc/crowd/districts';
import { CROWD_ROLES } from '../src/npc/crowd/roles';
import { sunTimes } from '../src/npc/schedules';
import { toGame } from '../src/world/coords';

const sun = sunTimes({ year: 113, month: 4, day: 13 });
const [fx, fz] = toGame(60, 20); // the middle of the Forum Romanum (real metres → game)
const forum = districtAt(fx, fz);

describe('districts', () => {
  it('knows the Forum, the Subura and the Colosseum valley from the atlas', () => {
    expect(forum.id).toBe('dist-forum-romanum');
    expect(districtAt(...toGame(400, -300)).id).toBe('dist-subura');
    expect(districtAt(...toGame(600, 300)).id).toBe('dist-vallis-colossei');
    expect(districtAt(...toGame(5000, 5000)).id).toBe('generic');
  });

  it('has points of interest on the forecourts of Forum landmarks', () => {
    const p = poisNear(fx, fz, 120);
    expect(p.some((x) => x.landmarkId === 'rostra' && x.kind === 'rostra')).toBe(true);
    expect(p.some((x) => x.kind === 'temple')).toBe(true);
    expect(p.some((x) => x.landmarkId === 'basilica-julia' && x.kind === 'steps')).toBe(true);
    // Vestals near the Atrium Vestae.
    const [vx, vz] = toGame(190, 120);
    expect(poiBoosts(vx, vz).vestal).toBeGreaterThan(0);
  });
});

describe('crowd budget (AC-10)', () => {
  it('fills the Forum by day: ≥ 60 at the peak hours, ≥ 30 all morning and afternoon', () => {
    for (const h of [8, 9, 10, 11]) expect(crowdBudget(h, sun, forum.density).citizens).toBeGreaterThanOrEqual(60);
    for (const h of [7, 9, 12, 14, 16]) expect(crowdBudget(h, sun, 1).citizens).toBeGreaterThanOrEqual(30);
  });

  it('thins out at night to ≤ 25 people including the vigiles, and only then come the carts', () => {
    for (const h of [21.5, 23, 0.5, 2, 3.5]) {
      const b = crowdBudget(h, sun, forum.density, 2); // even with a big density setting
      expect(b.night).toBe(true);
      expect(b.citizens + b.vigiles).toBeLessThanOrEqual(NIGHT_CAP);
      expect(b.vigiles).toBeGreaterThan(0);
      expect(b.carts).toBeGreaterThan(0);
    }
    for (const h of [6, 9, 12, 14]) {
      const b = crowdBudget(h, sun, 1);
      expect(b.carts).toBe(0); // the cart ban: sunrise to the 10th hour
      expect(b.vigiles).toBe(0);
    }
    // The 10th hour (≈ 15:35 in May) lets the first carts in.
    expect(crowdBudget(16.5, sun, 1).carts).toBeGreaterThan(0);
  });

  it('peaks in the morning and dips at the midday rest', () => {
    const at = (h: number) => crowdBudget(h, sun, 1).citizens;
    expect(at(9)).toBeGreaterThan(at(13.5));
    expect(at(13.5)).toBeGreaterThan(at(23));
  });

  it('day phases follow the Roman hours', () => {
    expect(dayPhase(5.5, sun)).toBe('salutatio');
    expect(dayPhase(9, sun)).toBe('morning');
    expect(dayPhase(12.5, sun)).toBe('midday');
    expect(dayPhase(23, sun)).toBe('night');
    expect(dayPhase(3.5, sun)).toBe('predawn');
  });
});

describe('who is out', () => {
  const ids = (w: [string, number][]) => w.map(([r]) => r);

  it('by day: senators, matrons, children; no revelers', () => {
    const w = ids(roleWeights(forum, 9, sun));
    for (const r of ['senator', 'matron', 'child', 'porter', 'merchant']) expect(w).toContain(r);
    expect(w).not.toContain('reveler');
    expect(w).not.toContain('vigil'); // vigiles come from their own budget
  });

  it('at night: revelers, no matrons, children or priests', () => {
    const w = ids(roleWeights(forum, 23, sun));
    expect(w).toContain('reveler');
    for (const r of ['matron', 'child', 'priest', 'senator']) expect(w).not.toContain(r);
  });

  it('never picks escort-only roles from the mix', () => {
    for (const h of [5, 9, 14, 23]) for (const r of ids(roleWeights(forum, h, sun))) expect(CROWD_ROLES[r as keyof typeof CROWD_ROLES].escortOnly).toBeFalsy();
  });

  it('boosts Vestals by the Atrium Vestae', () => {
    const w = roleWeights(forum, 9, sun, { vestal: 3 });
    expect(ids(w)).toContain('vestal');
    const rng = new Rng(5);
    let vestals = 0;
    for (let i = 0; i < 500; i++) if (pickRole(rng, w) === 'vestal') vestals++;
    expect(vestals).toBeGreaterThan(5);
  });
});
