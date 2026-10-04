import { describe, expect, it } from 'vitest';
import { ANCHORS, Calendar, dateOfOrdinal, festivalsOn, ordinalOf } from '../src/game/calendar';

const MAY11 = ordinalOf(4, 11);

describe('calendar dates', () => {
  it('converts day-of-year both ways', () => {
    expect(ordinalOf(0, 1)).toBe(0);
    expect(ordinalOf(4, 11)).toBe(130);
    for (const o of [0, 58, 59, 130, 364]) {
      const d = dateOfOrdinal(o);
      expect(ordinalOf(d.month, d.day)).toBe(o);
    }
    expect(dateOfOrdinal(365)).toEqual({ year: 114, month: 0, day: 1 });
  });

  it('knows the Lemuria (9, 11, 13 May) and the Mercuralia', () => {
    expect(festivalsOn(4, 11).map((f) => f.id)).toContain('fest-lemuria');
    expect(festivalsOn(4, 12).map((f) => f.id)).toEqual(['fest-columna']);
    expect(festivalsOn(4, 15).map((f) => f.id)).toContain('fest-mercuralia');
  });
});

describe('the pridie clamp (GDD §14.10)', () => {
  it('holds 11 May while the Column quest is pending, and the Lemuria is a festival only once', () => {
    const cal = new Calendar(113, MAY11, () => false);
    expect(cal.formatRoman()).toBe('a.d. V Id. Mai. DCCCLXVI AUC');
    expect(cal.isFestival('fest-lemuria')).toBe(true);
    expect(cal.clamp).toBe('mq-04-columna');
    cal.sync(1);
    expect(cal.date()).toEqual({ year: 113, month: 4, day: 11 });
    expect(cal.isFestival('fest-lemuria')).toBe(false); // "the eve of the Column"
    cal.sync(5);
    expect(cal.date().day).toBe(11);
  });

  it('runs freely once the anchor quest is done, and steps onto the anchor day', () => {
    let done = false;
    const cal = new Calendar(113, MAY11, (q) => done && q === 'mq-04-columna');
    expect(cal.stepToAnchor()).toBe(true);
    expect(cal.date().day).toBe(12);
    expect(cal.isFestival('fest-columna')).toBe(true);
    done = true;
    cal.sync(1);
    expect(cal.date().day).toBe(13);
    expect(cal.isFestival('fest-lemuria')).toBe(true);
    // The next anchor (the Vestalia, 9 June) holds 8 June.
    cal.sync(60);
    expect(cal.date()).toEqual({ year: 113, month: 5, day: 8 });
    expect(cal.clamp).toBe('mq-10-penus-vestae');
  });

  it('runs to the end of the year with every anchor done', () => {
    const cal = new Calendar(113, MAY11, () => true);
    cal.sync(30);
    expect(cal.date()).toEqual({ year: 113, month: 5, day: 10 });
    expect(cal.clamp).toBeNull();
    expect(ANCHORS.map((a) => a.quest)).toContain('mq-15-profectio');
  });

  it('saves and restores', () => {
    const cal = new Calendar(113, MAY11, () => false);
    cal.sync(2);
    const saved = JSON.parse(JSON.stringify(cal.serialize()));
    const other = new Calendar(113, 0, () => false);
    other.restore(saved, { ordinal: 0, elapsed: 0 });
    expect(other.date()).toEqual(cal.date());
    expect(other.isFestival('fest-lemuria')).toBe(false);
    other.restore(undefined, { ordinal: MAY11, elapsed: 0 });
    expect(other.isFestival('fest-lemuria')).toBe(true);
  });
});
