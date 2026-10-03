import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/Events';
import { GameTime } from '../src/core/GameTime';
import { CrimeSystem, identifyChance, statusCrimeFor } from '../src/rpg/crime';
import { ITEMS } from '../src/rpg/data/items';
import { FactionSystem } from '../src/rpg/factions';
import { InventoryImpl } from '../src/rpg/inventory';
import { ItemDb } from '../src/rpg/items';
import { CharacterSheetImpl } from '../src/rpg/sheet';
import { Standing } from '../src/rpg/standing';
import { record } from './rpg-fakes';

function setup(opts: { palace?: boolean; rng?: number } = {}) {
  const events = new EventBus<GameEvents>();
  const time = new GameTime(events); // 13 May 113, 08:00 — daytime: the Urban Cohorts' watch
  const sheet = new CharacterSheetImpl({ events });
  const inventory = new InventoryImpl(new ItemDb(ITEMS), { events, sheet });
  const factions = new FactionSystem(undefined, events);
  const standing = new Standing(events);
  let palace = !!opts.palace;
  const crime = new CrimeSystem({ events, inventory, sheet, time, factions, standing, rng: { next: () => opts.rng ?? 0.5 }, inPalace: () => palace });
  return { events, time, sheet, inventory, factions, standing, crime, setPalace: (v: boolean) => (palace = v) };
}

describe('ledgers and guards (GDD §14.1)', () => {
  it('the city ledger is kept by the Urban Cohorts by day and the Vigiles by night; the Palatine and treason are the Praetorians’', () => {
    const { crime, time, setPalace } = setup();
    expect(crime.ledger).toBe('urbs');
    expect(crime.guardsFor()).toBe('cohortes-urbanae');
    time.advanceHours(13); // 21:00
    expect(crime.ledger).toBe('urbs');
    expect(crime.guardsFor()).toBe('vigiles');
    time.advanceHours(10); // 07:00 next day
    expect(crime.guardsFor()).toBe('cohortes-urbanae');
    expect(crime.ledgerFor('maiestas')).toBe('palatium');
    setPalace(true);
    expect(crime.ledgerFor('furtum')).toBe('palatium');
    expect(crime.guardsFor('palatium')).toBe('praetoriani');
    crime.override = 'ostia';
    expect(crime.ledger).toBe('ostia');
    expect(crime.ledgers().map((l) => l.id)).toEqual(['urbs', 'palatium']);
  });
});

describe('crime and bounty', () => {
  it('unwitnessed crimes add no bounty but are recorded', () => {
    const { crime, events } = setup();
    const log = record(events, ['crime:committed', 'crime:bounty']);
    expect(crime.commit('furtum', { witnessed: false, value: 100, victimId: 'pistor' })).toBe(0);
    expect(crime.commit('furtum-personae', { witnessed: [], value: 10 })).toBe(0);
    expect(crime.bounty()).toBe(0);
    expect(crime.guardResponse()).toBe('none');
    expect(log).toEqual([
      { type: 'crime:committed', e: { crime: 'furtum', victimId: 'pistor', witnessed: false, bounty: 0, jurisdiction: 'urbs' } },
      { type: 'crime:committed', e: { crime: 'furtum-personae', victimId: undefined, witnessed: false, bounty: 0, jurisdiction: 'urbs' } },
    ]);
    expect(crime.stats()).toEqual([
      { crime: 'furtum', committed: 1, reported: 0 },
      { crime: 'furtum-personae', committed: 1, reported: 0 },
    ]);
  });

  it('the bounty table: furtum 2 × value (min 5), pickpocketing 25 + 2 × value, vis 40, incendium 1,500, maiestas 5,000', () => {
    const { crime } = setup();
    expect(crime.bountyFor('furtum', 100)).toBe(200);
    expect(crime.bountyFor('furtum', 1)).toBe(5);
    expect(crime.bountyFor('furtum-personae', 4)).toBe(33);
    expect(crime.bountyFor('vis')).toBe(40);
    expect(crime.bountyFor('trespass')).toBe(5);
    expect(crime.bountyFor('effractio')).toBe(10);
    expect(crime.bountyFor('rixa')).toBe(10);
    expect(crime.bountyFor('sacrilegium')).toBe(250);
    expect(crime.bountyFor('violatio-sepulcri')).toBe(150);
    expect(crime.bountyFor('falsum')).toBe(500);
    expect(crime.bountyFor('homicidium')).toBe(1000);
    expect(crime.bountyFor('caedes-supplicis')).toBe(1000);
    expect(crime.bountyFor('incendium')).toBe(1500);
    expect(crime.bountyFor('maiestas')).toBe(5000);
    expect(crime.bountyFor('fuga')).toBe(100);
  });

  it('witnessed crimes add bounty: ≥ 1,000 guards attack on sight, ≥ 2,000 fugitivarii hunt you', () => {
    const { crime, events } = setup();
    const log = record(events, ['rpg:notify']);
    expect(crime.commit('furtum', { witnessed: true, value: 100 })).toBe(200);
    expect(log.at(-1)!.e).toEqual({ text: 'Crime witnessed: furtum (bounty 200 den.)', kind: 'crime' });
    expect(crime.commit('vis', { witnessed: ['miles-1'] })).toBe(40);
    expect(crime.bounty()).toBe(240);
    expect(crime.guardResponse()).toBe('arrest');
    crime.commit('incendium', { witnessed: true });
    expect(crime.guardResponse()).toBe('attack');
    expect(crime.huntersActive()).toBe(false);
    crime.commit('maiestas', { witnessed: true });
    expect(crime.bounty('palatium')).toBe(5000);
    expect(crime.bounty('urbs')).toBe(1740);
    expect(crime.totalBounty()).toBe(6740);
    expect(crime.huntersActive()).toBe(true);
  });

  it('a hooded culprit at night is identified half the time; an unidentified crime only raises the district alert (0–3, a day)', () => {
    const { crime, time } = setup();
    expect(identifyChance({ hooded: true, night: true })).toBe(0.5);
    expect(identifyChance({ hooded: true, night: false })).toBe(1);
    expect(crime.commit('furtum', { witnessed: true, identified: false, value: 10, district: 'subura' })).toBe(0);
    expect(crime.bounty()).toBe(0);
    expect(crime.alert('subura')).toBe(1);
    for (let i = 0; i < 5; i++) crime.commit('trespass', { witnessed: true, identified: false, district: 'subura' });
    expect(crime.alert('subura')).toBe(3);
    expect(crime.stats()[0]).toEqual({ crime: 'furtum', committed: 1, reported: 1 });
    time.advanceHours(25);
    expect(crime.alert('subura')).toBe(0);
  });

  it('members of the Urban Cohorts get 25% off new bounties (“by your word”)', () => {
    const { crime, factions } = setup();
    factions.join('cohortes-urbanae');
    expect(crime.commit('vis', { witnessed: true })).toBe(30);
  });

  it('paying: the bounty less 10% per Clientela rank (max 40%); stolen goods go to the evidence chest', () => {
    const { crime, inventory, events, factions } = setup();
    const log = record(events, ['crime:cleared']);
    inventory.add('argentum', 1, { stolenFrom: 'domus' });
    inventory.add('gladius');
    crime.commit('furtum', { witnessed: true, value: 10 });
    expect(crime.arrestOptions()).toMatchObject({ ledger: 'urbs', guards: 'cohortes-urbanae', bounty: 20, fine: 20, canPay: false, sentence: 'carcer' });
    factions.join('clientela');
    factions.addReputation('clientela', 25); // amicus: rank index 2 → 30% off
    expect(crime.fine()).toBe(14);
    expect(crime.payFine()).toBe(false);
    inventory.addDenarii(15);
    expect(crime.payFine()).toBe(true);
    expect(crime.bounty()).toBe(0);
    expect(inventory.denarii).toBe(1);
    expect(inventory.count('argentum')).toBe(0);
    expect(inventory.count('gladius')).toBe(1);
    expect(crime.evidence()).toEqual([{ itemId: 'argentum', count: 1, stolenFrom: 'domus' }]);
    expect(log).toEqual([{ type: 'crime:cleared', e: { jurisdiction: 'urbs', how: 'paid' } }]);
    expect(crime.reclaimEvidence().length).toBe(1);
    expect(inventory.count('argentum', { stolen: true })).toBe(1);
    expect(crime.evidence()).toEqual([]);
  });

  it('the Carcer: ceil(bounty/100) days, max 10, citizens 25% less; one random skill’s progress lost per day', () => {
    const { crime, inventory, sheet, time, standing } = setup({ rng: 0 });
    standing.setOrigin('peregrinus');
    sheet.useSkill('blades', 5);
    sheet.useSkill('stealth', 4);
    sheet.useSkill('spear', 3);
    sheet.useSkill('shield', 2);
    inventory.add('argentum', 1, { stolenFrom: 'x' });
    crime.commit('vis', { witnessed: true });
    crime.commit('sacrilegium', { witnessed: true });
    expect(crime.bounty()).toBe(290);
    expect(crime.jailDays()).toBe(3);
    const before = time.totalHours;
    const r = crime.goToJail()!;
    expect(r.days).toBe(3);
    expect(time.totalHours - before).toBe(72);
    expect(r.lostProgress).toEqual(['blades', 'stealth', 'spear']);
    expect(sheet.skillXp('shield')).toBeGreaterThan(0);
    expect(sheet.skillLevel('blades')).toBe(10);
    expect(r.confiscated.map((s) => s.itemId)).toEqual(['argentum']);
    expect(crime.bounty()).toBe(0);
    expect(crime.goToJail()).toBeNull();
    standing.grantCitizenship();
    crime.commit('vis', { witnessed: true });
    crime.commit('sacrilegium', { witnessed: true });
    expect(crime.jailDays()).toBe(2);
    crime.commit('incendium', { witnessed: true });
    standing.setOrigin('peregrinus');
    expect(crime.jailDays()).toBe(10);
  });

  it('a murder conviction or a bounty ≥ 3,000 means the gladiator school: three bouts to freedom (Infamia +30)', () => {
    const { crime, standing, events } = setup();
    const log = record(events, ['crime:sentenced', 'crime:cleared']);
    crime.commit('vis', { witnessed: true });
    expect(crime.sentence()).toBe('carcer');
    expect(crime.sentenceAdLudum()).toBe(false);
    crime.commit('homicidium', { witnessed: true });
    expect(crime.arrestOptions().sentence).toBe('ad-ludum');
    expect(crime.goToJail()).toBeNull();
    expect(crime.sentenceAdLudum()).toBe(true);
    expect(crime.condemned).toEqual({ ledger: 'urbs', bouts: 3 });
    expect(crime.guardResponse()).toBe('none');
    expect(crime.winLudusBout()).toBe(2);
    expect(crime.winLudusBout()).toBe(1);
    expect(crime.bounty()).toBe(1040);
    expect(crime.winLudusBout()).toBe(0);
    expect(crime.bounty()).toBe(0);
    expect(crime.condemned).toBeNull();
    expect(standing.infamia).toBe(30);
    expect(log).toEqual([
      { type: 'crime:sentenced', e: { jurisdiction: 'urbs', sentence: 'ludus' } },
      { type: 'crime:cleared', e: { jurisdiction: 'urbs', how: 'ludus' } },
    ]);
    crime.commit('incendium', { witnessed: true });
    crime.commit('incendium', { witnessed: true });
    expect(crime.sentence()).toBe('ad-ludum');
  });

  it('an eques pays twice the fine instead of the Carcer (not for treason)', () => {
    const { crime, standing, inventory } = setup();
    standing.raise('eques');
    crime.commit('vis', { witnessed: true });
    expect(crime.arrestOptions()).toMatchObject({ sentence: 'fine', equesFine: 80 });
    expect(crime.goToJail()).toBeNull();
    inventory.addDenarii(80);
    expect(crime.payEquesFine()).toBe(true);
    expect(inventory.denarii).toBe(0);
    expect(crime.bounty()).toBe(0);
    crime.commit('maiestas', { witnessed: true });
    expect(crime.sentence('palatium')).toBe('ad-ludum');
  });

  it('bribes: bounty ≤ 200 and a corruptible guard (vigiles 40%, urban 25%, praetorians 5%), 1.5 × bounty, no confiscation', () => {
    const { crime, inventory } = setup();
    inventory.add('argentum', 1, { stolenFrom: 'x' });
    crime.commit('vis', { witnessed: true });
    expect(crime.arrestOptions('urbs', { corruptible: false }).bribe).toBeUndefined();
    expect(crime.arrestOptions('urbs', { corruptible: true })).toMatchObject({ bribe: 60, canBribe: false, corruptible: true });
    inventory.addDenarii(60);
    expect(crime.bribe('urbs', { corruptible: true })).toBe(true);
    expect(inventory.denarii).toBe(0);
    expect(inventory.count('argentum')).toBe(1);
    crime.commit('furtum', { witnessed: true, value: 150 });
    expect(crime.arrestOptions('urbs', { corruptible: true }).bribe).toBeUndefined();
    // A guard is always corruptible or never; the rates hold over many guards.
    const share = (faction: string) => Array.from({ length: 2000 }, (_, i) => crime.isCorruptible({ id: `${faction}-${i}`, faction })).filter(Boolean).length / 2000;
    expect(share('vigiles')).toBeCloseTo(0.4, 1);
    expect(share('cohortes-urbanae')).toBeCloseTo(0.25, 1);
    expect(share('praetoriani')).toBeLessThan(0.1);
    expect(crime.isCorruptible({ id: 'vigiles-7', faction: 'vigiles' })).toBe(crime.isCorruptible({ id: 'vigiles-7', faction: 'vigiles' }));
  });

  it('persuasion: bounty < 200, DC min(85, 10 + bounty/20); success halves the bounty; a failure locks it for a day', () => {
    const { crime, sheet, time } = setup();
    crime.commit('furtum-personae', { witnessed: true, value: 4 });
    expect(crime.bounty()).toBe(33);
    expect(crime.persuadeDc(33)).toBe(12);
    expect(crime.persuadeDc(5000)).toBe(85);
    expect(crime.arrestOptions().persuade).toEqual({ skill: 'rhetoric', difficulty: 12, chance: 0.48 });
    expect(crime.persuade().pass).toBe(false); // the rng rolls 0.5
    expect(crime.bounty()).toBe(33);
    expect(crime.arrestOptions().persuade).toBeUndefined();
    time.advanceHours(24);
    sheet.setSkill('rhetoric', 60);
    expect(crime.arrestOptions().persuade?.chance).toBe(0.95);
    expect(crime.persuade().pass).toBe(true);
    expect(crime.bounty()).toBe(16);
    crime.commit('sacrilegium', { witnessed: true });
    expect(crime.arrestOptions().persuade).toBeUndefined();
  });

  it('flee +10%, resist +50% (guards attack); asylum for non-violent crimes ≤ 1,000, 1 game hour, once a day', () => {
    const { crime, time } = setup();
    crime.commit('furtum', { witnessed: true, value: 50 });
    crime.flee();
    expect(crime.bounty()).toBe(110);
    expect(crime.arrestOptions().canAsylum).toBe(true);
    expect(crime.seekAsylum()).toBe(true);
    expect(crime.guardResponse()).toBe('none');
    time.advanceHours(1.1);
    expect(crime.guardResponse()).toBe('arrest');
    expect(crime.seekAsylum()).toBe(false); // once a day
    crime.resistArrest();
    expect(crime.bounty()).toBe(165);
    expect(crime.guardResponse()).toBe('attack');
    time.advanceHours(24);
    crime.commit('vis', { witnessed: true });
    expect(crime.canSeekAsylum()).toBe(false); // violent
  });

  it('a city bounty under 40 lapses after 7 days without a new crime', () => {
    const { crime, time, events } = setup();
    const log = record(events, ['crime:cleared']);
    crime.commit('trespass', { witnessed: true });
    time.advanceHours(6 * 24);
    expect(crime.checkLapse()).toBe(false);
    crime.commit('trespass', { witnessed: false }); // any new crime resets the clock
    time.advanceHours(6 * 24 + 23);
    expect(crime.checkLapse()).toBe(false);
    time.advanceHours(2);
    expect(crime.checkLapse()).toBe(true);
    expect(crime.bounty()).toBe(0);
    expect(log).toEqual([{ type: 'crime:cleared', e: { jurisdiction: 'urbs', how: 'lapsed' } }]);
    crime.commit('vis', { witnessed: true });
    time.advanceHours(30 * 24);
    expect(crime.checkLapse()).toBe(false);
    expect(crime.bounty()).toBe(40);
  });

  it('state round-trips, including resisting, asylum, alerts, evidence and a sentence in progress', () => {
    const { crime, inventory, time } = setup();
    inventory.add('argentum', 1, { stolenFrom: 'x' });
    crime.commit('trespass', { witnessed: true, identified: false, district: 'velabrum' });
    crime.commit('furtum', { witnessed: true, value: 20 });
    crime.resistArrest();
    crime.seekAsylum();
    const saved = JSON.parse(JSON.stringify(crime.serialize()));
    const c2 = new CrimeSystem({ inventory, time });
    c2.restore(saved);
    expect(c2.serialize()).toEqual(crime.serialize());
    expect(c2.guardResponse()).toBe('none');
    time.advanceHours(2);
    expect(c2.guardResponse()).toBe('attack');
    expect(c2.alert('velabrum')).toBe(1);
    c2.restore({ bounties: { urbs: -5, palatium: 'x' }, booked: { urbs: ['vis', 'nope'] }, condemned: { ledger: 'urbs', bouts: 0 } });
    expect(c2.totalBounty()).toBe(0);
    expect(c2.condemned).toBeNull();
  });

  it('status crimes: the toga without citizenship or freedom (100), the gold ring without rank (200)', () => {
    const { standing } = setup();
    const db = new ItemDb(ITEMS);
    expect(statusCrimeFor(db.require('toga'), standing)).toBeNull();
    standing.setOrigin('libertus');
    expect(statusCrimeFor(db.require('toga'), standing)).toBeNull();
    standing.setOrigin('peregrinus');
    expect(statusCrimeFor(db.require('toga'), standing)).toEqual({ crime: 'usurpatio', bounty: 100 });
    expect(statusCrimeFor(db.require('toga-fina'), standing)).toEqual({ crime: 'usurpatio', bounty: 100 });
    expect(statusCrimeFor(db.require('anulus-aureus'), standing)).toEqual({ crime: 'usurpatio', bounty: 200 });
    expect(statusCrimeFor(db.require('tunica'), standing)).toBeNull();
    standing.grantCitizenship();
    standing.raise('eques');
    expect(statusCrimeFor(db.require('toga'), standing)).toBeNull();
    expect(statusCrimeFor(db.require('anulus-aureus'), standing)).toBeNull();
  });
});

describe('factions (GDD §9.1)', () => {
  it('join, gain Fama (−100…+100), rise through ranks', () => {
    const events = new EventBus<GameEvents>();
    const f = new FactionSystem(undefined, events);
    const log = record(events, ['faction:joined', 'faction:rank']);
    expect(f.rank('vigiles')).toBeUndefined();
    expect(f.join('vigiles')).toBe(true);
    expect(f.join('vigiles')).toBe(false);
    expect(f.rank('vigiles')!.id).toBe('vigil');
    expect(f.rankIndex('vigiles')).toBe(0);
    f.addReputation('vigiles', 10);
    expect(f.rank('vigiles')!.latin).toBe('Sebaciarius');
    f.addReputation('vigiles', 5000);
    expect(f.reputation('vigiles')).toBe(100);
    expect(f.rank('vigiles')!.id).toBe('centurio'); // no skill lookup: gates ignored
    expect(log.map((l) => l.type)).toEqual(['faction:joined', 'faction:rank', 'faction:rank']);
    expect(f.joinBlocker('latrones')).toBe('not-joinable');
    expect(f.join('latrones')).toBe(false);
    expect(f.joinBlocker('nope')).toBe('unknown');
  });

  it('upper ranks also need skills (any martial skill for the Ludus); capstones come from quests', () => {
    const f = new FactionSystem();
    let blades = 30;
    f.skillLevel = (id) => (id === 'blades' ? blades : 0);
    f.join('ludus-magnus');
    f.addReputation('ludus-magnus', 100);
    expect(f.rank('ludus-magnus')!.id).toBe('palus-tertius');
    expect(f.nextRank('ludus-magnus')).toMatchObject({ rank: { id: 'palus-secundus' }, reputation: 0, quest: false });
    expect(f.nextRank('ludus-magnus')!.skills).toEqual([{ skill: ['blades', 'spear', 'archery', 'shield', 'brawling', 'heavy-armor', 'light-armor'], level: 50 }]);
    blades = 70;
    expect(f.rank('ludus-magnus')!.id).toBe('primus-palus');
    expect(f.nextRank('ludus-magnus')).toMatchObject({ rank: { id: 'rudiarius' }, reputation: 0, skills: [], quest: true });
    expect(f.grantRank('ludus-magnus', 'rudiarius')).toBe(true);
    expect(f.rank('ludus-magnus')!.title).toBe('Freed Champion');
    expect(f.nextRank('ludus-magnus')).toBeUndefined();
    expect(f.grantRank('ludus-magnus', 'imperator')).toBe(false);
  });

  it('citizens only (Urban Cohorts) and exclusive colors (Greens vs Blues)', () => {
    const f = new FactionSystem();
    let citizen = false;
    f.isCitizen = () => citizen;
    expect(f.joinBlocker('cohortes-urbanae')).toBe('citizens-only');
    expect(f.join('vigiles')).toBe(true); // any status
    citizen = true;
    expect(f.join('cohortes-urbanae')).toBe(true);
    expect(f.join('factio-prasina')).toBe(true);
    expect(f.joinBlocker('factio-veneta')).toBe('exclusive');
    f.leave('factio-prasina');
    expect(f.join('factio-veneta')).toBe(true);
  });

  it('Laudatio multiplies gains; enemies and hostility; persistence', () => {
    const f = new FactionSystem();
    f.gainMultiplier = () => 1.25;
    f.addReputation('plebs', 40);
    f.addReputation('plebs', -20);
    expect(f.reputation('plebs')).toBe(30);
    f.addReputation('plebs', 500);
    expect(f.reputation('plebs')).toBe(100);
    expect(f.areEnemies('vigiles', 'grassatores')).toBe(true);
    expect(f.areEnemies('grassatores', 'vigiles')).toBe(true);
    expect(f.areEnemies('factio-prasina', 'vigiles')).toBe(false);
    expect(f.hostileToPlayer('latrones')).toBe(true);
    expect(f.hostileToPlayer('vigiles')).toBe(false);
    f.addReputation('vigiles', -60);
    expect(f.hostileToPlayer('vigiles')).toBe(true);
    f.join('sodales-invicti');
    f.grantRank('praetoriani', 'speculator');
    const f2 = new FactionSystem();
    f2.restore(JSON.parse(JSON.stringify(f.serialize())));
    expect(f2.serialize()).toEqual(f.serialize());
    expect(f2.isMember('sodales-invicti')).toBe(true);
    expect(f2.rank('praetoriani')!.id).toBe('speculator');
    f2.restore({ rep: { plebs: 900, nope: 3 }, members: ['nope', 'vigiles'], granted: { vigiles: 'imperator' } });
    expect(f2.reputation('plebs')).toBe(100);
    expect(f2.joined()).toEqual(['vigiles']);
  });
});
