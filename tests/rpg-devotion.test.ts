import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/Events';
import { DEVOTION } from '../src/rpg/data/tuning';
import { blessingAt } from '../src/rpg/data/religio';
import { patronAt } from '../src/rpg/data/religio';
import { ITEMS } from '../src/rpg/data/items';
import { Devotion } from '../src/rpg/devotion';
import { InventoryImpl } from '../src/rpg/inventory';
import { ItemDb } from '../src/rpg/items';
import { CharacterSheetImpl } from '../src/rpg/sheet';
import { Standing } from '../src/rpg/standing';
import { record } from './rpg-fakes';

function setup(rolls: number[] = []) {
  const events = new EventBus<GameEvents>();
  const sheet = new CharacterSheetImpl({ events });
  const inventory = new InventoryImpl(new ItemDb(ITEMS), { events, sheet });
  let day = 0;
  const queue = [...rolls];
  const devotion = new Devotion({ sheet, inventory, events, day: () => day, rng: { next: () => queue.shift() ?? 0.9 } });
  return { events, sheet, inventory, devotion, nextDay: (n = 1) => (day += n), pietas: () => sheet.vitals.pietas.current };
}

describe('patron deity (GDD §14.6)', () => {
  it('the first patron is free; changing costs 100 den. and waits 7 days; the passive follows the patron', () => {
    const { devotion, sheet, inventory, events, nextDay } = setup();
    const log = record(events, ['devotion:patron']);
    expect(devotion.all().length).toBe(12);
    expect(devotion.all().every((d) => d.id.startsWith('patronus-'))).toBe(true);
    expect(devotion.choosePatron('patronus-mercurius')).toEqual({ ok: true, cost: 0 });
    expect(sheet.modifier('price.buy')).toBeCloseTo(0.05);
    expect(devotion.choosePatron('patronus-mercurius').reason).toBe('same');
    expect(devotion.choosePatron('patronus-hercules')).toEqual({ ok: false, cost: 100, reason: 'too-soon', waitDays: 7 });
    nextDay(7);
    expect(devotion.choosePatron('patronus-hercules')).toEqual({ ok: false, cost: 100, reason: 'no-money' });
    inventory.addDenarii(110);
    expect(devotion.choosePatron('patronus-hercules').ok).toBe(true);
    expect(inventory.denarii).toBe(10);
    expect(sheet.modifier('price.buy')).toBe(0);
    expect(sheet.modifier('carry.max')).toBe(15);
    expect(devotion.choosePatron('patronus-iuppiter').reason).toBe('unknown');
    expect(log.length).toBe(2);
    expect(patronAt('temple-mars-ultor')!.id).toBe('patronus-mars');
  });

  it('invocations spend pietas (half full at the start): Labor costs 30 and makes you stagger-immune for 10 s', () => {
    const { devotion, sheet, pietas } = setup();
    expect(devotion.invoke().reason).toBe('no-patron');
    devotion.choosePatron('patronus-hercules');
    expect(devotion.invocationCost()).toBe(30);
    expect(pietas()).toBe(25);
    expect(devotion.invoke().reason).toBe('no-pietas');
    devotion.gainPietas(10);
    expect(devotion.invoke().ok).toBe(true);
    expect(sheet.hasFlag('stagger.immune')).toBe(true);
    expect(pietas()).toBe(5);
    sheet.tick(11);
    expect(sheet.hasFlag('stagger.immune')).toBe(false);
  });

  it('Pax Deorum: +25 pietas and invocations 20% cheaper; Invictus (50) only once a day', () => {
    const { devotion, sheet, pietas, nextDay } = setup();
    devotion.choosePatron('patronus-mars');
    sheet.grantPerk('perk-religio-pax-deorum');
    expect(sheet.vitals.pietas.max).toBe(75);
    expect(devotion.invocationCost()).toBe(24);
    devotion.invoke();
    expect(pietas()).toBe(50 - 24);
    expect(sheet.hasFlag('power.free')).toBe(true);
    const m = setup();
    m.devotion.choosePatron('patronus-mithras');
    m.devotion.gainPietas(50);
    expect(m.devotion.invoke().ok).toBe(true);
    expect(m.sheet.hasFlag('invictus')).toBe(true);
    m.devotion.gainPietas(50);
    expect(m.devotion.invoke().reason).toBe('used-today');
    m.nextDay();
    expect(m.devotion.invoke().ok).toBe(true);
    expect(m.sheet.modifier('poise.max')).toBe(15);
    void nextDay;
  });

  it('Isis’ Salvation cures poison and bleeding; Minerva speeds Smithing; Venus’ Charis gives +25 persuasion', () => {
    const { devotion, sheet } = setup();
    devotion.choosePatron('patronus-isis');
    devotion.gainPietas(10);
    sheet.applyCondition('aconitum');
    sheet.applyCondition('cruentus');
    expect(devotion.invoke().ok).toBe(true);
    expect(sheet.activeEffects.length).toBe(0);
    const b = setup();
    b.devotion.choosePatron('patronus-minerva');
    b.sheet.useSkill('fabrica', 1);
    expect(b.sheet.skillXp('fabrica')).toBeCloseTo(1.1);
    const v = setup();
    v.devotion.choosePatron('patronus-venus');
    expect(v.sheet.modifier('persuade.chance')).toBeCloseTo(0.05);
    v.devotion.gainPietas(10);
    v.devotion.invoke();
    expect(v.sheet.modifier('persuade.chance')).toBeCloseTo(0.3);
  });
});

describe('pietas from devotion (GDD §14.6)', () => {
  it('a compitum prayer: +5 once per shrine per day, the Lares favor every time, Rites XP 8', () => {
    const { devotion, sheet, pietas, nextDay, events } = setup();
    const log = record(events, ['rpg:notify']);
    expect(devotion.prayAtCompitum('compitum-vicus-tuscus')).toMatchObject({ ok: true, pietas: 5, blessing: 'favor-larum' });
    expect(log.map((l) => l.e)).toContainEqual({ text: '+5 Pietas', kind: 'effect' });
    expect(pietas()).toBe(30);
    expect(sheet.hasCondition('favor-larum')).toBe(true);
    expect(sheet.modifier('stamina.regen')).toBeCloseTo(0.1);
    expect(sheet.skillXp('religio')).toBe(8);
    expect(devotion.canPrayAt('compitum-vicus-tuscus')).toBe(false);
    expect(devotion.prayAtCompitum('compitum-vicus-tuscus').pietas).toBe(0);
    expect(devotion.prayAtCompitum('compitum-velabrum').pietas).toBe(5);
    nextDay();
    expect(devotion.prayAtCompitum('compitum-vicus-tuscus').pietas).toBe(5);
  });

  it('a temple prayer needs an offering (a libum, incense, or 1 den.): +10 once a day and the temple’s blessing', () => {
    const { devotion, sheet, inventory, pietas } = setup();
    expect(devotion.prayAtTemple('temple-mars-ultor')).toMatchObject({ ok: false, reason: 'no-offering' });
    inventory.add('gladius');
    expect(devotion.prayAtTemple('temple-mars-ultor', { itemId: 'gladius' }).ok).toBe(false);
    expect(devotion.prayAtTemple('temple-mars-ultor', { itemId: 'libum' }).ok).toBe(false); // not owned
    inventory.add('libum');
    expect(devotion.prayAtTemple('temple-mars-ultor', { itemId: 'libum' })).toMatchObject({ ok: true, pietas: 10, blessing: 'benedictio-mars' });
    expect(inventory.count('libum')).toBe(0);
    expect(pietas()).toBe(35);
    expect(sheet.skillXp('religio')).toBeCloseTo(5 + 1 / 32);
    expect(devotion.prayAtTemple('temple-mars-ultor', { denarii: 1 }).ok).toBe(false); // no coin
    inventory.addDenarii(3);
    expect(devotion.prayAtTemple('temple-mars-ultor', { denarii: 1 })).toMatchObject({ ok: true, pietas: 0, blessing: 'benedictio-mars' });
    expect(inventory.denarii).toBe(2);
    // AC-18: an offering at the Temple of Castor gives a blessing; another temple's replaces it.
    expect(devotion.prayAtTemple('temple-castor-pollux', { denarii: 1 }).blessing).toBe('benedictio-castores');
    expect(sheet.hasCondition('benedictio-mars')).toBe(false);
    expect(sheet.modifier('speed.move')).toBeCloseTo(0.05);
    sheet.vitals.spend('pietas', 30);
    expect(devotion.prayAtTemple('temple-concord', { denarii: 1 })).toMatchObject({ ok: true, pietas: 10, blessing: undefined });
    expect(blessingAt('temple-hercules-victor')!.id).toBe('benedictio-hercules');
  });

  it('the lararium: +15 once a day (a full refill with the perk); festivals +25; with Isis prayer cures ailments', () => {
    const { devotion, sheet, pietas, nextDay } = setup();
    sheet.vitals.spend('pietas', 25);
    expect(devotion.prayAtLararium().pietas).toBe(15);
    expect(devotion.prayAtLararium().pietas).toBe(0);
    nextDay();
    sheet.grantPerk('perk-religio-lararium');
    expect(devotion.prayAtLararium().pietas).toBe(35);
    expect(pietas()).toBe(50);
    sheet.vitals.spend('pietas', 50);
    expect(devotion.festivalRite('fest-lemuria').pietas).toBe(25);
    expect(devotion.festivalRite('fest-lemuria').pietas).toBe(0);
    expect(sheet.skillXp('religio')).toBeCloseTo(8 + 8 + 25);
    const b = setup();
    b.devotion.choosePatron('patronus-isis');
    b.sheet.applyCondition('febris');
    b.sheet.applyCondition('taxus');
    expect(b.devotion.prayAtCompitum('compitum-x').cured).toBe(2);
    expect(b.sheet.hasCondition('febris')).toBe(false);
  });

  it('impiety: killing a yielded foe −15; temple theft −25 and infaustus; sparing +5, burying +10', () => {
    const { devotion, sheet, pietas } = setup();
    devotion.impiety('killYielded');
    expect(pietas()).toBe(10);
    expect(sheet.hasCondition('infaustus')).toBe(false);
    devotion.sparedYielded();
    devotion.buriedDead();
    expect(pietas()).toBe(25);
    devotion.impiety('templeTheft');
    expect(pietas()).toBe(0);
    expect(sheet.hasCondition('infaustus')).toBe(true);
    expect(DEVOTION.loss.killInTemple.pietas).toBe(30);
  });
});

describe('vows, omens and curses (GDD §14.6)', () => {
  it('a vow gives votum until the quest ends; pay it within 3 days for pietas, Rites XP and a votive tablet', () => {
    const { devotion, sheet, inventory, pietas } = setup();
    expect(devotion.vow('q-test', 50)).toBe(true);
    expect(devotion.vow('q-test', 50)).toBe(false);
    expect(sheet.hasCondition('votum')).toBe(true);
    expect(sheet.modifier('damage.taken')).toBeCloseTo(-0.1);
    devotion.resolveVow('q-test', true);
    expect(sheet.hasCondition('votum')).toBe(false);
    expect(devotion.vows()).toEqual([{ questId: 'q-test', value: 50, state: 'owed', due: 3 }]);
    expect(devotion.payVow('q-test')).toBe(false);
    inventory.addDenarii(50);
    expect(devotion.payVow('q-test')).toBe(true);
    expect(pietas()).toBe(50); // +30 for a vow of 25 den. or more, capped at the max
    expect(sheet.skillXp('religio')).toBe(40);
    expect(inventory.count('tabella-votiva')).toBe(1);
    expect(devotion.vows()).toEqual([]);
  });

  it('Votum makes vow buffs 50% stronger; failed quests release the vow; unpaid vows break (−30, infaustus; piaculum 2 × V)', () => {
    const { devotion, sheet, inventory, nextDay } = setup();
    sheet.grantPerk('perk-religio-votum');
    devotion.vow('q-a', 30);
    expect(sheet.modifier('damage.taken')).toBeCloseTo(-0.15);
    devotion.vow('q-b', 5);
    devotion.resolveVow('q-a', true);
    expect(sheet.hasCondition('votum')).toBe(true); // q-b still running
    devotion.resolveVow('q-b', false);
    expect(sheet.hasCondition('votum')).toBe(false);
    nextDay(3);
    expect(devotion.checkVows()).toBe(0);
    nextDay();
    expect(devotion.checkVows()).toBe(1);
    expect(sheet.hasCondition('infaustus')).toBe(true);
    expect(sheet.vitals.pietas.current).toBe(0);
    expect(devotion.piaculumCost()).toBe(60);
    inventory.addDenarii(59);
    expect(devotion.expiate()).toBe(false);
    inventory.addDenarii(1);
    expect(devotion.expiate()).toBe(true);
    expect(sheet.hasCondition('infaustus')).toBe(false);
    expect(devotion.piaculumCost()).toBe(DEVOTION.piaculumMin);
  });

  it('the daily omen: good waits to be accepted; bad takes hold unless refused or turned by an amulet; once a day', () => {
    const { devotion, sheet, nextDay } = setup([0.1, 0.3, 0.3, 0.5]);
    expect(devotion.rollOmen()).toEqual({ omen: 'good', options: ['good'] });
    expect(devotion.rollOmen()).toBeNull();
    expect(devotion.acceptOmen()).toBe(true);
    expect(sheet.hasCondition('omen-faustum')).toBe(true);
    expect(sheet.skillXp('religio')).toBe(10);
    nextDay();
    expect(devotion.rollOmen()!.omen).toBe('bad');
    expect(sheet.hasCondition('omen-malum')).toBe(true);
    expect(devotion.refuseOmen()).toBe(true);
    expect(sheet.hasCondition('omen-malum')).toBe(false);
    nextDay();
    sheet.setFlagSource('equip:neck', ['amulet']);
    expect(devotion.rollOmen()!.omen).toBe('bad');
    expect(sheet.hasCondition('omen-malum')).toBe(false);
    nextDay();
    expect(devotion.rollOmen()!.omen).toBe('none');
  });

  it('Augur’s Eye offers a choice of two omens; curse tablets work only through belief (an amulet negates them)', () => {
    const { devotion, sheet } = setup([0.3, 0.1]);
    sheet.grantPerk('perk-religio-augur');
    expect(devotion.rollOmen()).toEqual({ omen: 'bad', options: ['bad', 'good'] });
    expect(sheet.hasCondition('omen-malum')).toBe(false);
    expect(devotion.chooseOmen(1)).toBe('good');
    expect(devotion.acceptOmen()).toBe(true);
    expect(devotion.learnOfCurse()).toBe(true);
    expect(sheet.hasCondition('defixus')).toBe(true);
    expect(sheet.modifier('luck')).toBeCloseTo(-0.05);
    const b = setup();
    b.sheet.setFlagSource('equip:neck', ['amulet']);
    expect(b.devotion.learnOfCurse()).toBe(false);
  });

  it('state round-trips', () => {
    const { devotion, inventory, nextDay } = setup([0.1]);
    devotion.choosePatron('patronus-laverna');
    devotion.prayAtCompitum('compitum-a');
    inventory.add('tus');
    devotion.prayAtTemple('temple-portunus', { itemId: 'tus' });
    devotion.vow('q-1', 12);
    devotion.rollOmen();
    nextDay(0);
    const saved = JSON.parse(JSON.stringify(devotion.serialize()));
    const b = setup();
    b.devotion.restore(saved);
    expect(b.devotion.serialize()).toEqual(devotion.serialize());
    expect(b.devotion.patron!.id).toBe('patronus-laverna');
    expect(b.sheet.modifier('stealth.noise')).toBeCloseTo(0.2);
    expect(b.devotion.canPrayAt('compitum-a')).toBe(false);
    expect(b.devotion.patronWait()).toBe(7);
    b.devotion.restore(undefined);
    expect(b.devotion.patron).toBeUndefined();
    expect(b.sheet.modifier('stealth.noise')).toBe(0);
  });
});

describe('impietas, vow tiers and closed temples (GDD §14.6, §14.10)', () => {
  function world(o: { closed?: boolean; sex?: 'male' | 'female'; vowMult?: number } = {}) {
    const events = new EventBus<GameEvents>();
    const sheet = new CharacterSheetImpl({ events });
    const inventory = new InventoryImpl(new ItemDb(ITEMS), { events, sheet });
    const state = { closed: !!o.closed, sex: o.sex ?? 'male', vowMult: o.vowMult ?? 1 };
    const devotion = new Devotion({ sheet, inventory, events, templesClosed: () => state.closed, sex: () => state.sex, vowMult: () => state.vowMult });
    return { sheet, inventory, devotion, state, pietas: () => sheet.vitals.pietas.current };
  }

  it('a loss the pool can’t cover becomes impietas: infaustus until devotion pays it off', () => {
    const { devotion, sheet, pietas } = world();
    devotion.impiety('killYielded');
    devotion.impiety('falseOath');
    expect(pietas()).toBe(0);
    expect(devotion.debt).toBe(0); // 15 + 10 = 25, exactly the pool
    devotion.impiety('killYielded');
    expect(devotion.debt).toBe(15);
    expect(sheet.hasCondition('infaustus')).toBe(true);
    expect(devotion.prayAtCompitum('compitum-a').pietas).toBe(0); // all 5 go to the debt
    expect(devotion.debt).toBe(10);
    devotion.festivalRite('fest-lemuria');
    expect(devotion.debt).toBe(0);
    expect(pietas()).toBe(15);
    expect(sheet.hasCondition('infaustus')).toBe(false); // the omen came only from the debt
  });

  it('an impious act’s omen stays until a piaculum, which also clears the debt', () => {
    const { devotion, sheet, inventory } = world();
    devotion.impiety('killInTemple'); // −30 and infaustus: 25 from the pool, 5 owed
    expect(devotion.debt).toBe(5);
    devotion.gainPietas(10);
    expect(devotion.debt).toBe(0);
    expect(sheet.hasCondition('infaustus')).toBe(true);
    inventory.addDenarii(20);
    expect(devotion.expiate()).toBe(true);
    expect(sheet.hasCondition('infaustus')).toBe(false);
    devotion.impiety('killYielded');
    devotion.impiety('killYielded');
    expect(devotion.debt).toBeGreaterThan(0);
    inventory.addDenarii(20);
    expect(devotion.expiate()).toBe(true);
    expect(devotion.debt).toBe(0);
  });

  it('vows: V ≥ max(5, 10% of the reward); votum 5% / 10% / 15% and pietas 20 / 30 / 50 by V; festivals multiply', () => {
    const { devotion, sheet, inventory, pietas, state } = world();
    expect(devotion.vow('q-a', 4)).toBe(false);
    expect(devotion.vow('q-a', 10, { expectedReward: 200 })).toBe(false);
    expect(devotion.minVow(200)).toBe(20);
    expect(devotion.vow('q-a', 5)).toBe(true);
    expect(sheet.modifier('damage.taken')).toBeCloseTo(-0.05);
    expect(sheet.modifier('stamina.regen')).toBeCloseTo(0.05);
    devotion.vow('q-b', 100);
    expect(sheet.modifier('damage.taken')).toBeCloseTo(-0.15); // the largest vow decides
    devotion.resolveVow('q-b', true);
    expect(sheet.modifier('damage.taken')).toBeCloseTo(-0.05);
    inventory.addDenarii(100);
    sheet.vitals.spend('pietas', 25);
    devotion.payVow('q-b');
    expect(pietas()).toBe(50);
    expect([5, 24, 25, 99, 100].map((v) => devotion.vowTier(v).pietas)).toEqual([20, 20, 30, 30, 50]);
    state.vowMult = 1.5; // the Ludi Augustales
    devotion.vow('q-c', 30);
    expect(sheet.modifier('damage.taken')).toBeCloseTo(-0.15);
  });

  it('on the Lemuria the temple cellae are shut (no blessings, vows or patrons) but the compitum shrines are open', () => {
    const { devotion, inventory, state } = world({ closed: true });
    inventory.addDenarii(5);
    expect(devotion.prayAtTemple('temple-castor-pollux', { denarii: 1 })).toMatchObject({ ok: false, reason: 'closed' });
    expect(devotion.vow('q-a', 10)).toBe(false);
    expect(devotion.choosePatron('patronus-mars').reason).toBe('closed');
    expect(devotion.prayAtCompitum('compitum-a')).toMatchObject({ ok: true, pietas: 5, blessing: 'favor-larum' });
    state.closed = false;
    expect(devotion.prayAtTemple('temple-castor-pollux', { denarii: 1 })).toMatchObject({ ok: true, blessing: 'benedictio-castores' });
  });

  it('women are barred from the Ara Maxima’s rites and pray to Hercules at Hercules Victor', () => {
    const { devotion, inventory } = world({ sex: 'female' });
    inventory.addDenarii(5);
    expect(devotion.prayAtTemple('ara-maxima', { denarii: 1 })).toMatchObject({ ok: false, reason: 'barred' });
    expect(devotion.prayAtTemple('temple-hercules-victor', { denarii: 1 })).toMatchObject({ ok: true, blessing: 'benedictio-hercules' });
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
