import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/Events';
import { GameTime } from '../src/core/GameTime';
import { addFavor, ARENA, arenaPurse, isPracticeWeapon, missioChance, stansMissusPossible, startingFavor, yieldOutcome } from '../src/rpg/arena';
import { ITEMS } from '../src/rpg/data/items';
import { InventoryImpl } from '../src/rpg/inventory';
import { ItemDb } from '../src/rpg/items';
import { bathe, fastTravelBlocker, restBlocker, sleep, wait, washAtFountain } from '../src/rpg/rest';
import { CharacterSheetImpl } from '../src/rpg/sheet';
import { Standing } from '../src/rpg/standing';
import { record } from './rpg-fakes';

const db = new ItemDb(ITEMS);

describe('arena (GDD §6.10)', () => {
  it('crowd favor starts at 30 (+10 with plebs Fama > 30); gains scale with arena.favor, losses don’t; 0–100', () => {
    expect(startingFavor(0)).toBe(30);
    expect(startingFavor(31)).toBe(40);
    expect(addFavor(30, 'parry')).toBe(36);
    expect(addFavor(30, 'riposte', 1.25)).toBe(40);
    expect(addFavor(30, 'strike-yielded', 1.25)).toBe(10);
    expect(addFavor(98, 'spare-right')).toBe(100);
    expect(addFavor(3, 'dirty-trick')).toBe(0);
    expect(ARENA.fullFavorReset).toBe(60);
  });

  it('missio: spared at ≥ 50, half at 30–49, one in ten below; Nemesis +15 points; Tiro always; stans missus', () => {
    expect(missioChance(50)).toBe(1);
    expect(missioChance(49)).toBe(0.5);
    expect(missioChance(30)).toBe(0.5);
    expect(missioChance(29)).toBe(0.1);
    expect(missioChance(35, { bonus: 15 })).toBe(1);
    expect(missioChance(0, { tiro: true })).toBe(1);
    expect(stansMissusPossible({ playerHealth: 0.25, foeHealth: 0.2, favor: 70 })).toBe(true);
    expect(stansMissusPossible({ playerHealth: 0.35, foeHealth: 0.2, favor: 90 })).toBe(false);
  });

  it('purse = base × (1 + favor/100); practice arms never kill (lusio); a refused missio in a lusio is the Saniarium, not death', () => {
    expect(arenaPurse(40, 50)).toBe(60);
    expect(isPracticeWeapon(db.require('rudis').weapon)).toBe(true);
    expect(isPracticeWeapon(db.require('tridens-lusorius').weapon)).toBe(true);
    expect(isPracticeWeapon(db.require('gladius').weapon)).toBe(false);
    expect(db.require('rudis').weapon).toMatchObject({ damage: 11, damageType: 'blunt', skill: 'blades', stagger: 14 });
    expect(yieldOutcome(true, false)).toBe('saniarium');
    expect(yieldOutcome(false, true)).toBe('saniarium-no-purse');
    expect(yieldOutcome(false, false)).toBe('death');
  });
});

function life(hour = 8) {
  const events = new EventBus<GameEvents>();
  const time = new GameTime(events, undefined, hour);
  const sheet = new CharacterSheetImpl({ events });
  const inventory = new InventoryImpl(db, { events, sheet });
  const standing = new Standing(events, () => time.totalHours);
  let trespassing = false;
  const d = { sheet, inventory, standing, time, events, trespassing: () => trespassing };
  return { ...d, d, setTrespassing: (v: boolean) => (trespassing = v) };
}

describe('rest and baths (GDD §14.8)', () => {
  it('sleep restores health and stamina; your own bed +10% XP, a rented one +5%; waiting just passes time; both ask for an autosave', () => {
    const { d, sheet, time, events } = life();
    const asks = record(events, ['save:request']);
    sheet.vitals.damage(60);
    sheet.vitals.drain('stamina', 50);
    expect(sleep(d, 8, 'own')).toEqual({ ok: true, hours: 8 });
    expect(time.totalHours).toBe(16);
    expect(sheet.vitals.health.current).toBe(100);
    expect(sheet.hasCondition('bene-quietus')).toBe(true);
    expect(sheet.modifier('xp.mult')).toBeCloseTo(0.1);
    sleep(d, 30, 'rented');
    expect(time.totalHours).toBe(40); // at most 24 hours
    expect(sheet.hasCondition('quietus')).toBe(true);
    sheet.vitals.damage(50);
    wait(d, 1);
    expect(sheet.vitals.health.current).toBe(50);
    expect(asks.length).toBe(3);
  });

  it('no sleeping, waiting or fast travel in combat or while trespassing; no fast travel over-encumbered', () => {
    const { d, sheet, inventory, setTrespassing } = life();
    sheet.vitals.inCombat = true;
    expect(restBlocker(d)).toBe('in-combat');
    expect(fastTravelBlocker(d)).toBe('in-combat');
    expect(sleep(d, 8, 'own').ok).toBe(false);
    sheet.vitals.inCombat = false;
    inventory.add('malleus', 12);
    expect(fastTravelBlocker(d)).toBe('over-encumbered');
    inventory.remove('malleus', 12);
    expect(fastTravelBlocker(d)).toBeNull();
    setTrespassing(true);
    expect(wait(d, 2)).toMatchObject({ ok: false, reason: 'trespassing' });
    expect(fastTravelBlocker(d)).toBe('trespassing');
  });

  it('the baths: 1 quadrans and an hour for lautus (12 hours); a massage restores stamina; no tip, 15% your cloak goes', () => {
    const { d, inventory, standing, sheet, time } = life();
    inventory.add('paenula');
    inventory.equip('paenula');
    inventory.addDenarii(1);
    sheet.vitals.drain('stamina', 70);
    standing.setCleanliness('sordidus');
    expect(bathe(d, { massage: true, tip: true })).toEqual({ ok: true, cost: 1 / 64 + 2 / 16 + 1 / 16, stolen: undefined });
    expect(time.totalHours).toBe(9);
    expect(standing.cleanliness).toBe('lautus');
    expect(sheet.vitals.stamina.current).toBe(100);
    expect(bathe(d, { rng: { next: () => 0.1 } }).stolen).toBe('paenula');
    expect(inventory.equipped('cloak')).toBeUndefined();
    expect(bathe({ ...d, inventory: new InventoryImpl(db) }).reason).toBe('no-money');
    time.advanceHours(12);
    expect(standing.cleanliness).toBe('normal');
    standing.setCleanliness('sordidus');
    expect(washAtFountain(d)).toBe(true);
    expect(standing.cleanliness).toBe('normal');
    expect(washAtFountain(d)).toBe(false);
  });
});

describe('Infamia (GDD §3.4)', () => {
  it('fades by 1 per 10 elapsed days without a new stain, never below 10 once branded; restitutio and the rudis lower it', () => {
    let hours = 0;
    const s = new Standing(undefined, () => hours);
    s.addInfamia(14);
    hours = 9 * 24;
    expect(s.recoverInfamia()).toBe(0);
    hours = 10 * 24;
    expect(s.recoverInfamia()).toBe(1);
    expect(s.infamia).toBe(13);
    hours = 45 * 24;
    s.recoverInfamia();
    expect(s.infamia).toBe(10);
    s.addInfamia(2); // a public bout: the clock restarts
    hours = 54 * 24;
    expect(s.recoverInfamia()).toBe(0);
    hours = 500 * 24;
    s.recoverInfamia();
    expect(s.infamia).toBe(0);
    s.addInfamia(20, { brand: true }); // the oath
    s.reduceInfamia(15); // restitutio
    expect(s.infamia).toBe(10);
    hours = 900 * 24;
    s.recoverInfamia();
    expect(s.infamia).toBe(10);
  });

  it('a gladiatrix takes arena Infamia 50% faster; one-off stains count once', () => {
    const s = new Standing();
    s.sex = 'female';
    s.addInfamia(2, { arena: true });
    expect(s.infamia).toBe(3);
    s.addInfamia(5, { once: 'toga-salutatio' });
    s.addInfamia(5, { once: 'toga-salutatio' });
    expect(s.infamia).toBe(8);
    const t = new Standing();
    t.restore(JSON.parse(JSON.stringify(s.serialize())));
    expect(t.serialize()).toEqual(s.serialize());
    t.addInfamia(5, { once: 'toga-salutatio' });
    expect(t.infamia).toBe(8);
  });
});
