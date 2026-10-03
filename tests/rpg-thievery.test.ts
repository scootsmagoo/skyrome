import { describe, expect, it } from 'vitest';
import { fallDamage } from '../src/rpg/combat-math';
import { CharacterSheetImpl } from '../src/rpg/sheet';
import { LOCK_TIERS, lockXp, lockZoneWidth, pickpocketChance, pickpocketXp } from '../src/rpg/thievery';

describe('locks and seals (GDD §14.3)', () => {
  it('set zone = 22% × (1 + locks/100) × tier factor, widened by Light Touch, Portunus and luck', () => {
    const s = new CharacterSheetImpl();
    expect(lockZoneWidth('simplex', s)).toBeCloseTo(0.22 * 1.1);
    expect(lockZoneWidth('firma', s)).toBeCloseTo(0.22 * 1.1 * 0.45);
    expect(Object.values(LOCK_TIERS).map((t) => t.tumblers)).toEqual([2, 3, 4, 5]);
    s.setSkill('locks-seals', 50);
    s.grantPerk('perk-locks-light-touch');
    expect(lockZoneWidth('mediocris', s)).toBeCloseTo(0.22 * 1.5 * 0.8 * 1.2);
    s.applyCondition('benedictio-portunus');
    expect(lockZoneWidth('mediocris', s)).toBeCloseTo(0.22 * 1.5 * 0.8 * 1.35);
    s.applyCondition('infaustus');
    expect(lockZoneWidth('mediocris', s)).toBeCloseTo(0.22 * 1.5 * 0.8 * 1.25);
    expect([lockXp('simplex'), lockXp('mediocris'), lockXp('difficilis'), lockXp('firma')]).toEqual([8, 15, 25, 40]);
  });
});

describe('pickpocketing (GDD §14.4)', () => {
  it('p = clamp(0.05, 0.95, 0.40 + skill/150 + crowd 0.15 + unaware 0.15 − 0.04 kg − value/400 − alert 0.30)', () => {
    const s = new CharacterSheetImpl();
    const purse = { weight: 0.05, value: 2, crowd: true, unaware: true };
    expect(pickpocketChance(s, purse)).toBeCloseTo(0.4 + 10 / 150 + 0.3 - 0.002 - 0.005);
    expect(pickpocketChance(s, { ...purse, alert: true })).toBeCloseTo(0.4 + 10 / 150 - 0.002 - 0.005);
    expect(pickpocketChance(s, { weight: 20, value: 400 })).toBe(0.05);
    s.setSkill('pickpocket', 100);
    s.grantPerk('perk-pickpocket-light-fingers');
    expect(pickpocketChance(s, purse)).toBe(0.95);
    expect(pickpocketChance(s, { weight: 1, value: 40 })).toBe(0.95);
    const t = new CharacterSheetImpl();
    t.setSkill('pickpocket', 40);
    expect(pickpocketChance(t, { weight: 1, value: 40 })).toBeCloseTo(0.4 + 40 / 150 - 0.04 - 0.1);
  });

  it('a lift trains Pickpocket by 10 + value/5, at most 60', () => {
    expect(pickpocketXp(0)).toBe(10);
    expect(pickpocketXp(25)).toBe(15);
    expect(pickpocketXp(1000)).toBe(60);
  });
});

describe('falls (GDD §6.6)', () => {
  it('(h − 4) × 10 above 4 game metres; Roof-runner takes nothing below 6 m', () => {
    expect(fallDamage(3)).toBe(0);
    expect(fallDamage(6)).toBe(20);
    expect(fallDamage(15)).toBe(110);
    expect(fallDamage(18)).toBe(140);
    const s = new CharacterSheetImpl();
    s.grantPerk('perk-athletics-roof-runner');
    expect(fallDamage(5.9, s)).toBe(0);
    expect(fallDamage(8, s)).toBe(40);
  });
});
