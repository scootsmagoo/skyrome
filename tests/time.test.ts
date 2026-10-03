import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/Events';
import { GameTime, romanDate, toRoman } from '../src/core/GameTime';

describe('Roman calendar', () => {
  it('formats numerals', () => {
    expect(toRoman(866)).toBe('DCCCLXVI');
    expect(toRoman(113)).toBe('CXIII');
  });
  it('formats dates', () => {
    expect(romanDate(4, 1)).toBe('Kal. Mai.');
    expect(romanDate(4, 7)).toBe('Non. Mai.');
    expect(romanDate(4, 15)).toBe('Id. Mai.');
    expect(romanDate(4, 14)).toBe('prid. Id. Mai.');
    expect(romanDate(4, 10)).toBe('a.d. VI Id. Mai.');
    expect(romanDate(4, 16)).toBe('a.d. XVII Kal. Iun.');
    expect(romanDate(2, 15)).toBe('Id. Mart.');
    expect(romanDate(0, 13)).toBe('Id. Ian.');
    expect(romanDate(11, 31)).toBe('prid. Kal. Ian.');
  });
  it('advances days across months and fires hour events', () => {
    const ev = new EventBus();
    const hours: number[] = [];
    ev.on('time:hour', (e) => hours.push(e.hour));
    const t = new GameTime(ev, { year: 113, month: 4, day: 30 }, 22);
    t.advanceHours(3);
    expect(hours).toEqual([23, 0, 1]);
    const d = t.date();
    expect([d.month, d.day, d.hour]).toEqual([4, 31, 1]);
    t.advanceHours(24);
    expect(t.date().month).toBe(5);
    expect(t.date().day).toBe(1);
  });
});
