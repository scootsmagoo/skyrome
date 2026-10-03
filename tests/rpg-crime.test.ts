import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/Events';
import { GameTime } from '../src/core/GameTime';
import { CrimeSystem, statusCrimeFor } from '../src/rpg/crime';
import { ITEMS } from '../src/rpg/data/items';
import { FactionSystem } from '../src/rpg/factions';
import { InventoryImpl } from '../src/rpg/inventory';
import { ItemDb } from '../src/rpg/items';
import { CharacterSheetImpl } from '../src/rpg/sheet';
import { Standing } from '../src/rpg/standing';
import { record } from './rpg-fakes';

function setup(opts: { palace?: boolean } = {}) {
  const events = new EventBus<GameEvents>();
  const time = new GameTime(events); // 13 May 113, 08:00 — daytime: the Urban Cohorts' watch
  const sheet = new CharacterSheetImpl({ events });
  const inventory = new InventoryImpl(new ItemDb(ITEMS), { events, sheet });
  const factions = new FactionSystem(undefined, events);
  const standing = new Standing(events);
  let palace = !!opts.palace;
  const crime = new CrimeSystem({ events, inventory, sheet, time, factions, standing, rng: { next: () => 0.5 }, inPalace: () => palace });
  return { events, time, sheet, inventory, factions, standing, crime, setPalace: (v: boolean) => (palace = v) };
}

describe('jurisdiction by authority', () => {
  it('Urban Cohorts by day, Vigiles by night and for fire and burglary, Praetorians at the palace', () => {
    const { crime, time, setPalace } = setup();
    expect(crime.jurisdiction).toBe('cohortes-urbanae');
    expect(crime.jurisdictionFor('incendium')).toBe('vigiles');
    expect(crime.jurisdictionFor('effractura')).toBe('vigiles');
    time.advanceHours(12); // 20:00
    expect(crime.jurisdiction).toBe('vigiles');
    time.advanceHours(11); // 07:00 next day
    expect(crime.jurisdiction).toBe('cohortes-urbanae');
    setPalace(true);
    expect(crime.jurisdictionFor('furtum')).toBe('praetoriani');
    crime.override = 'ostia';
    expect(crime.jurisdiction).toBe('ostia');
    expect(crime.jurisdictions().map((j) => j.id)).toEqual(['cohortes-urbanae', 'vigiles', 'praetoriani']);
  });
});

describe('crime and bounty', () => {
  it('unwitnessed crimes add no bounty but are recorded', () => {
    const { crime, events } = setup();
    const log = record(events, ['crime:committed', 'crime:bounty']);
    expect(crime.commit('furtum', { witnessed: false, value: 100, victimId: 'pistor' })).toBe(0);
    expect(crime.commit('furtum-zonae', { witnessed: [], value: 10 })).toBe(0);
    expect(crime.bounty()).toBe(0);
    expect(crime.guardResponse()).toBe('none');
    expect(log).toEqual([
      { type: 'crime:committed', e: { crime: 'furtum', victimId: 'pistor', witnessed: false, bounty: 0, jurisdiction: 'cohortes-urbanae' } },
      { type: 'crime:committed', e: { crime: 'furtum-zonae', victimId: undefined, witnessed: false, bounty: 0, jurisdiction: 'cohortes-urbanae' } },
    ]);
    expect(crime.stats()).toEqual([
      { crime: 'furtum', committed: 1, reported: 0 },
      { crime: 'furtum-zonae', committed: 1, reported: 0 },
    ]);
  });

  it('witnessed crimes add bounty per jurisdiction (furtum = half the value); murder means attack on sight and hunters', () => {
    const { crime } = setup();
    expect(crime.commit('furtum', { witnessed: true, value: 100 })).toBe(50);
    expect(crime.commit('iniuria', { witnessed: ['miles-1'] })).toBe(40);
    expect(crime.bounty()).toBe(90);
    expect(crime.guardResponse()).toBe('arrest');
    crime.commit('incendium', { witnessed: true });
    expect(crime.bounty('vigiles')).toBe(500);
    expect(crime.totalBounty()).toBe(590);
    expect(crime.huntersActive()).toBe(false);
    crime.commit('caedes', { witnessed: true, victimId: 'ex-sextus' });
    expect(crime.guardResponse()).toBe('attack');
    expect(crime.guardResponse('vigiles')).toBe('arrest');
    expect(crime.huntersActive()).toBe(true);
  });

  it('members of the Urban Cohorts get 25% off new bounties (“by your word”)', () => {
    const { crime, factions } = setup();
    factions.join('cohortes-urbanae');
    expect(crime.commit('iniuria', { witnessed: true })).toBe(30);
  });

  it('paying the fine clears the bounty and confiscates stolen goods; a patron lowers the fine', () => {
    const { crime, inventory, events, factions } = setup();
    const log = record(events, ['crime:cleared']);
    inventory.add('argentum', 1, { stolenFrom: 'domus' });
    inventory.add('gladius');
    crime.commit('furtum', { witnessed: true, value: 40 });
    expect(crime.arrestOptions()).toMatchObject({ bounty: 20, fine: 20, canPay: false, jailDays: 1, adLudum: false });
    factions.join('clientela');
    factions.addReputation('clientela', 25); // amicus: rank index 2 → 30% off
    expect(factions.rank('clientela')!.id).toBe('amicus');
    expect(crime.fine()).toBe(14);
    expect(crime.payFine()).toBe(false);
    inventory.addDenarii(15);
    expect(crime.payFine()).toBe(true);
    expect(crime.bounty()).toBe(0);
    expect(inventory.denarii).toBe(1);
    expect(inventory.count('argentum')).toBe(0);
    expect(inventory.count('gladius')).toBe(1);
    expect(log).toEqual([{ type: 'crime:cleared', e: { jurisdiction: 'cohortes-urbanae', how: 'paid' } }]);
  });

  it('jail passes days, confiscates and costs skill progress', () => {
    const { crime, inventory, sheet, time } = setup();
    sheet.useSkill('blades', 5);
    sheet.useSkill('stealth', 4);
    sheet.useSkill('spear', 3);
    sheet.useSkill('shield', 2);
    inventory.add('argentum', 1, { stolenFrom: 'x' });
    crime.commit('iniuria', { witnessed: true });
    crime.commit('sacrilegium', { witnessed: true, value: 20 });
    expect(crime.bounty()).toBe(260);
    const before = time.totalHours;
    const r = crime.goToJail()!;
    expect(r.days).toBe(3);
    expect(time.totalHours - before).toBe(72);
    expect(r.lostProgress).toEqual(['blades', 'stealth', 'spear']);
    expect(sheet.skillXp('shield')).toBeGreaterThan(0);
    expect(r.confiscated.map((s) => s.itemId)).toEqual(['argentum']);
    expect(crime.bounty()).toBe(0);
    expect(crime.goToJail()).toBeNull();
  });

  it('severe bounties can be commuted to condemnation ad ludum (with Infamia)', () => {
    const { crime, standing, events } = setup();
    const log = record(events, ['crime:sentenced']);
    crime.commit('iniuria', { witnessed: true });
    expect(crime.sentenceAdLudum()).toBe(false);
    crime.commit('falsum', { witnessed: true });
    expect(crime.arrestOptions().adLudum).toBe(true);
    expect(crime.sentenceAdLudum()).toBe(true);
    expect(crime.bounty()).toBe(0);
    expect(standing.infamia).toBe(25);
    expect(log).toEqual([{ type: 'crime:sentenced', e: { jurisdiction: 'cohortes-urbanae', sentence: 'ludus' } }]);
  });

  it('small bounties can be bribed away (×1.5) without confiscation', () => {
    const { crime, inventory } = setup();
    inventory.add('argentum', 1, { stolenFrom: 'x' });
    crime.commit('iniuria', { witnessed: true });
    expect(crime.arrestOptions()).toMatchObject({ bribe: 60, canBribe: false });
    inventory.addDenarii(60);
    expect(crime.bribe()).toBe(true);
    expect(inventory.denarii).toBe(0);
    expect(inventory.count('argentum')).toBe(1);
    crime.commit('caedes', { witnessed: true });
    expect(crime.arrestOptions().bribe).toBeUndefined();
  });

  it('a Rhetoric check can waive a tiny bounty', () => {
    const { crime, sheet } = setup();
    crime.commit('furtum-zonae', { witnessed: true, value: 4 });
    expect(crime.bounty()).toBe(27);
    expect(crime.arrestOptions().persuade?.chance).toBe(0);
    expect(crime.persuade()).toBe(false);
    expect(crime.bounty()).toBe(27);
    sheet.setSkill('rhetoric', 60);
    expect(crime.arrestOptions().persuade?.chance).toBe(1);
    expect(crime.persuade()).toBe(true);
    expect(crime.bounty()).toBe(0);
    crime.commit('iniuria', { witnessed: true });
    expect(crime.arrestOptions().persuade).toBeUndefined();
  });

  it('resisting arrest raises the bounty and makes guards hostile; asylum buys time; state round-trips', () => {
    const { crime, inventory, time } = setup();
    crime.commit('violatio', { witnessed: true });
    crime.resistArrest();
    expect(crime.bounty()).toBe(55);
    expect(crime.stats().map((s) => s.crime)).toEqual(['violatio', 'resistentia']);
    expect(crime.guardResponse()).toBe('attack');
    crime.seekAsylum(6);
    expect(crime.guardResponse()).toBe('none');
    const saved = JSON.parse(JSON.stringify(crime.serialize()));
    const c2 = new CrimeSystem({ inventory, time });
    c2.restore(saved);
    expect(c2.guardResponse()).toBe('none');
    time.advanceHours(7);
    expect(c2.guardResponse()).toBe('attack');
    expect(c2.serialize()).toEqual({ ...crime.serialize() });
    inventory.addDenarii(55);
    expect(c2.payFine()).toBe(true);
    expect(c2.guardResponse()).toBe('none');
  });

  it('status crimes: the toga without citizenship or freedom, the gold ring without rank', () => {
    const { standing } = setup();
    const db = new ItemDb(ITEMS);
    expect(statusCrimeFor(db.require('toga'), standing)).toBeNull();
    standing.setOrigin('libertus');
    expect(statusCrimeFor(db.require('toga'), standing)).toBeNull();
    standing.setOrigin('peregrinus');
    expect(statusCrimeFor(db.require('toga'), standing)).toBe('usurpatio-togae');
    expect(statusCrimeFor(db.require('toga-fina'), standing)).toBe('usurpatio-togae');
    expect(statusCrimeFor(db.require('anulus-aureus'), standing)).toBe('usurpatio-anuli');
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
