import { describe, expect, it } from 'vitest';
import { bashDamage, DOOR_HP, isLocked, lockDetail, lockedAction, withinHours } from '../src/world/doors/rules';

describe('door rules', () => {
  it('reads opening hours, also past midnight', () => {
    expect(withinHours(10, [6, 20])).toBe(true);
    expect(withinHours(20, [6, 20])).toBe(false);
    expect(withinHours(5.9, [6, 20])).toBe(false);
    expect(withinHours(23, [20, 4])).toBe(true);
    expect(withinHours(3, [20, 4])).toBe(true);
    expect(withinHours(12, [20, 4])).toBe(false);
  });

  it('holds a lock unless it is open hours, unlocked or broken; a bar always holds', () => {
    const lock = { tier: 'simplex' as const, openHours: [6, 20] as const };
    expect(isLocked(undefined, undefined, 2)).toBe(false);
    expect(isLocked(lock, undefined, 10)).toBe(false);
    expect(isLocked(lock, undefined, 22)).toBe(true);
    expect(isLocked(lock, { unlocked: true }, 22)).toBe(false);
    expect(isLocked(lock, { broken: true }, 22)).toBe(false);
    expect(isLocked({ tier: 'firma', barred: true }, { unlocked: true }, 10)).toBe(true);
  });

  it('takes more blows for a better lock, and power blows count most', () => {
    const blows = (hp: number, dmg: number) => Math.ceil(hp / dmg);
    expect(blows(DOOR_HP.simplex, bashDamage(true))).toBe(2);
    expect(blows(DOOR_HP.firma, bashDamage(true))).toBe(6);
    expect(blows(DOOR_HP.simplex, bashDamage(false))).toBe(5);
    expect(bashDamage(true, 50)).toBeGreaterThan(bashDamage(true, 0));
  });

  it('prefers the key, then a pick', () => {
    const lock = { tier: 'mediocris' as const, key: 'clavis' };
    expect(lockedAction(lock, { key: true, picks: 3, canPick: true })).toBe('key');
    expect(lockedAction(lock, { key: false, picks: 3, canPick: true })).toBe('pick');
    expect(lockedAction(lock, { key: false, picks: 0, canPick: true })).toBe('none');
    expect(lockedAction(lock, { key: false, picks: 2, canPick: false })).toBe('none');
    expect(lockedAction({ tier: 'simplex', barred: true }, { key: true, picks: 2, canPick: true })).toBe('none');
  });

  it('describes the lock', () => {
    expect(lockDetail({ tier: 'mediocris' }, true)).toBe('Locked (Mediocris, 3 tumblers)');
    expect(lockDetail({ tier: 'mediocris' }, false)).toBeNull();
    expect(lockDetail({ tier: 'simplex', barred: true }, true)).toBe('Barred');
  });
});
