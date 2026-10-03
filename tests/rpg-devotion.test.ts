import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/Events';
import { DEVOTION } from '../src/rpg/data/balance';
import { ITEMS } from '../src/rpg/data/items';
import { Devotion } from '../src/rpg/devotion';
import { InventoryImpl } from '../src/rpg/inventory';
import { ItemDb } from '../src/rpg/items';
import { CharacterSheetImpl } from '../src/rpg/sheet';
import { Standing } from '../src/rpg/standing';
import { record } from './rpg-fakes';

function setup() {
  const events = new EventBus<GameEvents>();
  const sheet = new CharacterSheetImpl({ events });
  const inventory = new InventoryImpl(new ItemDb(ITEMS), { events, sheet });
  let day = 0;
  const devotion = new Devotion({ sheet, inventory, events, day: () => day });
  return { events, sheet, inventory, devotion, nextDay: () => day++ };
}

describe('patron deity', () => {
  it('the first patron is free; changing costs an offering; the passive follows the patron', () => {
    const { devotion, sheet, inventory, events } = setup();
    const log = record(events, ['devotion:patron']);
    expect(devotion.all().length).toBe(12);
    expect(devotion.choosePatron('mercurius')).toEqual({ ok: true, cost: 0 });
    expect(sheet.modifier('price.buy')).toBeCloseTo(0.05);
    expect(devotion.choosePatron('mercurius').reason).toBe('same');
    expect(devotion.choosePatron('hercules')).toEqual({ ok: false, cost: DEVOTION.rechooseCost, reason: 'no-money' });
    inventory.addDenarii(60);
    expect(devotion.choosePatron('hercules').ok).toBe(true);
    expect(inventory.denarii).toBe(10);
    expect(sheet.modifier('price.buy')).toBe(0);
    expect(sheet.modifier('carry.max')).toBe(15);
    expect(devotion.choosePatron('iuppiter').reason).toBe('unknown');
    expect(log.length).toBe(2);
  });

  it('invocation spends pietas (half full at the start) and applies its effects (Labor: stagger immunity)', () => {
    const { devotion, sheet } = setup();
    expect(devotion.invoke().reason).toBe('no-patron');
    devotion.choosePatron('hercules');
    expect(devotion.invocationCost()).toBe(25);
    expect(sheet.vitals.pietas.current).toBe(25);
    expect(devotion.invoke().ok).toBe(true);
    expect(sheet.hasFlag('stagger.immune')).toBe(true);
    expect(sheet.vitals.pietas.current).toBe(0);
    expect(devotion.invoke().reason).toBe('no-pietas');
    sheet.tick(11);
    expect(sheet.hasFlag('stagger.immune')).toBe(false);
  });

  it('Pax Deorum: +25 pietas and invocations cost 20% less', () => {
    const { devotion, sheet } = setup();
    devotion.choosePatron('mars');
    sheet.grantPerk('perk-religio-pax-deorum');
    expect(sheet.vitals.pietas.max).toBe(75);
    expect(devotion.invocationCost()).toBe(20);
    const before = sheet.vitals.pietas.current;
    devotion.invoke();
    expect(sheet.vitals.pietas.current).toBe(before - 20);
    expect(sheet.hasFlag('power.free')).toBe(true);
  });

  it('Isis’s Salvation cures poison and bleeding; Minerva speeds Smithing; Venus’s Charis fortifies Rhetoric', () => {
    const { devotion, sheet } = setup();
    devotion.choosePatron('isis');
    sheet.applyCondition('aconitum');
    sheet.applyCondition('cruor');
    devotion.invoke();
    expect(sheet.activeEffects.length).toBe(0);
    const b = setup();
    b.devotion.choosePatron('minerva');
    b.sheet.useSkill('fabrica', 1);
    expect(b.sheet.skillXp('fabrica')).toBeCloseTo(1.1);
    const v = setup();
    v.devotion.choosePatron('venus');
    expect(v.sheet.modifier('persuade.chance')).toBeCloseTo(0.2);
    v.devotion.invoke();
    expect(v.sheet.skillLevel('rhetoric')).toBe(35);
  });
});

describe('devotion refills pietas', () => {
  it('the daily prayer refills once per game day, blesses, and trains Rites (8 XP)', () => {
    const { devotion, sheet, nextDay } = setup();
    sheet.vitals.spend('pietas', 20);
    const r = devotion.devote('dailyPrayer', { god: 'mars' });
    expect(r.restored).toBe(45);
    expect(r.blessed).toBe('mars');
    expect(sheet.hasCondition('mars')).toBe(true);
    expect(sheet.skillXp('religio')).toBe(8);
    sheet.vitals.spend('pietas', 40);
    expect(devotion.canPrayToday()).toBe(false);
    expect(devotion.devote('dailyPrayer', { god: 'venus' }).restored).toBe(0);
    expect(sheet.hasCondition('venus')).toBe(true); // the blessing is still renewed
    expect(sheet.skillXp('religio')).toBe(8);
    nextDay();
    expect(devotion.devote('dailyPrayer').restored).toBe(40);
  });

  it('offerings consume incense, wine or food and train Rites by value; festivals refill fully', () => {
    const { devotion, sheet, inventory } = setup();
    sheet.vitals.spend('pietas', 25);
    expect(devotion.offer('tus')).toBeNull();
    inventory.add('tus');
    inventory.add('gladius');
    expect(devotion.offer('gladius')).toBeNull();
    expect(devotion.offer('tus', 'fortuna')!.restored).toBeCloseTo(50 * DEVOTION.restore.offering);
    expect(inventory.count('tus')).toBe(0);
    expect(sheet.hasCondition('fortuna')).toBe(true);
    expect(sheet.skillXp('religio')).toBeCloseTo(5 + 1 / 16 / 2);
    devotion.devote('offering', { offeringValue: 100 });
    expect(sheet.skillXp('religio')).toBeCloseTo(5 + 1 / 32 + 30); // capped at 30
    sheet.vitals.spend('pietas', sheet.vitals.pietas.current);
    expect(devotion.devote('festival').restored).toBe(50);
  });

  it('the Lararium perk fully restores pietas at home once a day; Isis cures disease on prayer', () => {
    const { devotion, sheet, nextDay } = setup();
    sheet.vitals.spend('pietas', 25);
    expect(devotion.devote('lararium').restored).toBe(25);
    sheet.grantPerk('perk-religio-lararium');
    sheet.vitals.spend('pietas', sheet.vitals.pietas.current);
    expect(devotion.devote('lararium').restored).toBe(50);
    sheet.vitals.spend('pietas', 50);
    expect(devotion.devote('lararium').restored).toBe(25);
    nextDay();
    sheet.vitals.spend('pietas', sheet.vitals.pietas.current);
    expect(devotion.devote('lararium').restored).toBe(50);
    const b = setup();
    b.devotion.choosePatron('isis');
    b.sheet.applyCondition('febris');
    expect(b.devotion.devote('dailyPrayer').cured).toBe(1);
    expect(b.sheet.hasCondition('febris')).toBe(false);
  });

  it('impiety leaves you ill-omened until a piaculum; state round-trips', () => {
    const { devotion, sheet, inventory } = setup();
    devotion.impiety();
    expect(sheet.hasCondition('infaustus')).toBe(true);
    expect(devotion.expiate(10)).toBe(false);
    inventory.addDenarii(10);
    expect(devotion.expiate(10)).toBe(true);
    expect(sheet.hasCondition('infaustus')).toBe(false);
    expect(devotion.expiate(10)).toBe(false);
    devotion.choosePatron('laverna');
    devotion.devote('dailyPrayer');
    const saved = JSON.parse(JSON.stringify(devotion.serialize()));
    const b = setup();
    b.devotion.restore(saved);
    expect(b.devotion.patron!.id).toBe('laverna');
    expect(b.sheet.modifier('stealth.noise')).toBeCloseTo(0.15);
    expect(b.devotion.canPrayToday()).toBe(false);
    expect(b.devotion.patronCost('mars')).toBe(DEVOTION.rechooseCost);
    b.devotion.restore(undefined);
    expect(b.devotion.patron).toBeUndefined();
    expect(b.sheet.modifier('stealth.noise')).toBe(0);
  });
});

describe('standing (GDD §3.4)', () => {
  it('Dignitas from legal status, citizenship and rank; only citizens and freedmen may wear the toga', () => {
    const events = new EventBus<GameEvents>();
    const s = new Standing(events);
    const log = record(events, ['standing:changed']);
    expect(s.isCitizen).toBe(true);
    expect(s.dignitas).toBe('civis');
    s.setOrigin('latinus-iunianus');
    expect(s.isCitizen).toBe(false);
    expect(s.mayWearToga).toBe(false);
    expect(s.dignitas).toBe('peregrinus');
    expect(s.rank).toBe(0);
    s.setOrigin('libertus');
    expect(s.mayWearToga).toBe(true);
    expect(s.isCitizen).toBe(false);
    expect(s.dignitas).toBe('libertus');
    s.grantCitizenship();
    expect(s.isCitizen).toBe(true);
    expect(s.dignitas).toBe('civis');
    s.raise('libertus'); // never lowers
    expect(s.dignitas).toBe('civis');
    s.raise('eques');
    expect(s.rank).toBe(4);
    s.demote('cliens-notus');
    expect(s.dignitas).toBe('cliens-notus');
    expect(log.length).toBeGreaterThanOrEqual(5);
  });

  it('Infamia 0…100, district Fama ±100, the equestrian census, cleanliness and debt', () => {
    let hours = 0;
    const s = new Standing(undefined, () => hours);
    expect(s.canBecomeEques(25_000)).toBe(true);
    expect(s.canBecomeEques(24_999)).toBe(false);
    s.addInfamia(30);
    expect(s.canBecomeEques(30_000)).toBe(false);
    s.addInfamia(200);
    expect(s.infamia).toBe(100);
    s.addFame('subura', 40);
    s.addFame('subura', -10);
    expect(s.fame('subura')).toBe(30);
    s.addFame('subura', 500);
    expect(s.fame('subura')).toBe(100);
    expect(s.cleanliness).toBe('normal');
    s.setCleanliness('lautus');
    hours = 11;
    expect(s.cleanliness).toBe('lautus');
    hours = 12;
    expect(s.cleanliness).toBe('normal');
    s.setCleanliness('sordidus');
    s.origin = 'eques-lapsus';
    s.debt = 2000;
    const t = new Standing();
    t.restore(JSON.parse(JSON.stringify(s.serialize())));
    expect(t.serialize()).toEqual(s.serialize());
    t.restore({ legal: 'rex', dignitas: 'deus', infamia: -5, debt: -1 });
    expect(t.serialize()).toMatchObject({ legal: 'civis', dignitas: 'civis', infamia: 0, debt: 0 });
  });
});
