import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/Events';
import { GameTime } from '../src/core/GameTime';
import { ArrestView, type ArrestOutcome } from '../src/game/law';
import { CrimeSystem } from '../src/rpg/crime';
import { ITEMS } from '../src/rpg/data/items';
import { FactionSystem } from '../src/rpg/factions';
import { InventoryImpl } from '../src/rpg/inventory';
import { ItemDb } from '../src/rpg/items';
import { CharacterSheetImpl } from '../src/rpg/sheet';
import { Standing } from '../src/rpg/standing';

function setup(denarii: number, roll = 0.99) {
  const events = new EventBus<GameEvents>();
  const time = new GameTime(events);
  const sheet = new CharacterSheetImpl({ events });
  const inventory = new InventoryImpl(new ItemDb(ITEMS), { events, sheet });
  inventory.addDenarii(denarii);
  const crime = new CrimeSystem({ events, inventory, sheet, time, factions: new FactionSystem(undefined, events), standing: new Standing(events), rng: { next: () => roll } });
  let outcome: ArrestOutcome | null = null;
  const talk = () => new ArrestView(crime, 'cit-1', 'Soldier of the Urban Cohorts', undefined, (o) => (outcome = o));
  return { crime, inventory, time, talk, outcome: () => outcome };
}

const pick = (v: ArrestView, re: RegExp) => v.choose(v.choices.findIndex((c) => re.test(c.text)));

describe('the guard\'s arrest talk (game/law.ts)', () => {
  it('offers the fine, a word, a bribe (a corruptible guard), the Carcer and resisting for a small bounty', () => {
    const { crime, talk } = setup(100, 0.01);
    crime.commit('vis', { witnessed: true });
    const v = talk();
    expect(v.line.text).toMatch(/Stop right there/);
    expect(v.choices.map((c) => c.text)).toEqual([
      'Pay the fine.',
      'It was a misunderstanding, officer.',
      'Perhaps we can come to an arrangement…',
      "I'll come quietly. (The Carcer: 1 day)",
      "I won't be taken. (Resist arrest)",
    ]);
    expect(v.choices[0].disabled).toBeFalsy();
  });

  it('paying clears the bounty and costs the fine; the talk ends after the answer', () => {
    const { crime, inventory, talk, outcome } = setup(100);
    crime.commit('vis', { witnessed: true });
    const v = talk();
    pick(v, /Pay the fine/);
    expect(crime.bounty()).toBe(0);
    expect(inventory.denarii).toBe(60);
    expect(v.choices).toEqual([]);
    expect(v.ended).toBe(false);
    v.advance();
    expect(v.ended).toBe(true);
    expect(outcome()).toEqual({ paid: true });
  });

  it("can't pay without the money; the Carcer passes the days and clears the bounty", () => {
    const { crime, time, talk, outcome } = setup(5);
    crime.commit('vis', { witnessed: true });
    const v = talk();
    expect(v.choices[0].disabled).toBe(true);
    const h0 = time.totalHours;
    pick(v, /come quietly/);
    v.advance();
    expect(crime.bounty()).toBe(0);
    expect(time.totalHours - h0).toBe(24);
    expect(outcome()?.jailed?.days).toBe(1);
  });

  it('a murderer is called one, and serves the Carcer (the sentence ad ludum has no bouts yet)', () => {
    const { crime, talk, outcome } = setup(5);
    crime.commit('homicidium', { witnessed: true });
    const v = talk();
    expect(v.line.text).toMatch(/Murderer/);
    expect(v.choices.some((c) => /misunderstanding|arrangement/.test(c.text))).toBe(false);
    const days = crime.jailDays();
    expect(days).toBeGreaterThanOrEqual(8); // 10, a quarter less for a citizen
    pick(v, /come quietly/);
    v.advance();
    expect(crime.bounty()).toBe(0);
    expect(outcome()?.jailed?.days).toBe(days);
  });

  it('walking away from the guard is resisting arrest: +50 % and the watch attacks on sight', () => {
    const { crime, talk, outcome } = setup(100);
    crime.commit('vis', { witnessed: true });
    const v = talk();
    v.end();
    expect(crime.bounty()).toBe(60);
    expect(crime.guardResponse()).toBe('attack');
    expect(outcome()).toEqual({ resisted: true });
  });

  it('a failed word keeps the talk open without that option', () => {
    const { crime, talk } = setup(100);
    crime.commit('vis', { witnessed: true });
    const v = talk();
    pick(v, /misunderstanding/);
    if (crime.bounty() === 40) {
      expect(v.line.text).toMatch(/Save your breath/);
      expect(v.choices.some((c) => /misunderstanding/.test(c.text))).toBe(false);
      expect(v.ended).toBe(false);
    } else {
      expect(v.choices).toEqual([]);
    }
  });
});
