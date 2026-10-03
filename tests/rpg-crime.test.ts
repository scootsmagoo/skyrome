import { describe, expect, it } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/Events';
import { GameTime } from '../src/core/GameTime';
import { CrimeSystem } from '../src/rpg/crime';
import { ITEMS } from '../src/rpg/data/items';
import { FactionSystem } from '../src/rpg/factions';
import { InventoryImpl } from '../src/rpg/inventory';
import { ItemDb } from '../src/rpg/items';
import { CharacterSheetImpl } from '../src/rpg/sheet';
import { record } from './rpg-fakes';

function setup() {
  const events = new EventBus<GameEvents>();
  const time = new GameTime(events);
  const sheet = new CharacterSheetImpl({ events });
  const inventory = new InventoryImpl(new ItemDb(ITEMS), { events, sheet });
  const crime = new CrimeSystem({ events, inventory, sheet, time, rng: { next: () => 0.5 } });
  return { events, time, sheet, inventory, crime };
}

describe('crime and bounty', () => {
  it('unwitnessed crimes add no bounty but are recorded', () => {
    const { crime, events } = setup();
    const log = record(events, ['crime:committed', 'crime:bounty']);
    expect(crime.commit('theft', { witnessed: false, value: 100, victimId: 'baker' })).toBe(0);
    expect(crime.commit('pickpocket', { witnessed: [], value: 10 })).toBe(0);
    expect(crime.bounty()).toBe(0);
    expect(crime.guardResponse()).toBe('none');
    expect(log).toEqual([
      { type: 'crime:committed', e: { crime: 'theft', victimId: 'baker', witnessed: false, bounty: 0, jurisdiction: 'roma' } },
      { type: 'crime:committed', e: { crime: 'pickpocket', victimId: undefined, witnessed: false, bounty: 0, jurisdiction: 'roma' } },
    ]);
    expect(crime.stats()).toEqual([
      { crime: 'theft', committed: 1, reported: 0 },
      { crime: 'pickpocket', committed: 1, reported: 0 },
    ]);
  });

  it('witnessed crimes add bounty (theft = half the value) per jurisdiction; murder means attack on sight', () => {
    const { crime } = setup();
    expect(crime.commit('theft', { witnessed: true, value: 100 })).toBe(50);
    expect(crime.commit('assault', { witnessed: ['guard_1'] })).toBe(40);
    expect(crime.bounty()).toBe(90);
    expect(crime.guardResponse()).toBe('arrest');
    crime.commit('trespass', { witnessed: true, jurisdiction: 'ostia' });
    expect(crime.bounty('ostia')).toBe(5);
    expect(crime.totalBounty()).toBe(95);
    crime.commit('murder', { witnessed: true, victimId: 'ex_sextus' });
    expect(crime.guardResponse()).toBe('attack');
    expect(crime.guardResponse('ostia')).toBe('arrest');
  });

  it('paying the fine clears the bounty and confiscates stolen goods', () => {
    const { crime, inventory, events } = setup();
    const log = record(events, ['crime:cleared']);
    inventory.add('calix_argenteus', 1, { stolenFrom: 'domus' });
    inventory.add('gladius');
    crime.commit('theft', { witnessed: true, value: 40 });
    expect(crime.arrestOptions()).toMatchObject({ bounty: 20, canPay: false, jailDays: 1 });
    expect(crime.payFine()).toBe(false);
    inventory.addDenarii(25);
    expect(crime.arrestOptions().canPay).toBe(true);
    expect(crime.payFine()).toBe(true);
    expect(crime.bounty()).toBe(0);
    expect(inventory.denarii).toBe(5);
    expect(inventory.count('calix_argenteus')).toBe(0);
    expect(inventory.count('gladius')).toBe(1);
    expect(log).toEqual([{ type: 'crime:cleared', e: { jurisdiction: 'roma', how: 'paid' } }]);
  });

  it('jail passes days, confiscates and costs skill progress', () => {
    const { crime, inventory, sheet, time } = setup();
    sheet.useSkill('blades', 5);
    sheet.useSkill('sneak', 4);
    sheet.useSkill('spear', 3);
    sheet.useSkill('block', 2);
    inventory.add('aureus', 1, { stolenFrom: 'x' });
    crime.commit('assault', { witnessed: true });
    crime.commit('sacrilege', { witnessed: true, value: 20 });
    expect(crime.bounty()).toBe(260);
    const before = time.totalHours;
    const r = crime.goToJail()!;
    expect(r.days).toBe(3);
    expect(time.totalHours - before).toBe(72);
    expect(r.lostProgress).toEqual(['blades', 'sneak', 'spear']);
    expect(sheet.skillXp('block')).toBeGreaterThan(0);
    expect(r.confiscated.map((s) => s.itemId)).toEqual(['aureus']);
    expect(crime.bounty()).toBe(0);
    expect(crime.goToJail()).toBeNull();
  });

  it('small bounties can be bribed away (×1.5) without confiscation', () => {
    const { crime, inventory } = setup();
    inventory.add('aureus', 1, { stolenFrom: 'x' });
    crime.commit('assault', { witnessed: true });
    expect(crime.arrestOptions()).toMatchObject({ bribe: 60, canBribe: false });
    inventory.addDenarii(60);
    expect(crime.bribe()).toBe(true);
    expect(inventory.denarii).toBe(0);
    expect(inventory.count('aureus')).toBe(1);
    crime.commit('murder', { witnessed: true });
    expect(crime.arrestOptions().bribe).toBeUndefined();
  });

  it('a Rhetoric check can waive a tiny bounty', () => {
    const { crime, sheet } = setup();
    crime.commit('pickpocket', { witnessed: true, value: 4 });
    expect(crime.bounty()).toBe(27);
    expect(crime.arrestOptions().persuade?.chance).toBe(0);
    expect(crime.persuade()).toBe(false);
    expect(crime.bounty()).toBe(27);
    sheet.setSkill('rhetoric', 60);
    expect(crime.arrestOptions().persuade?.chance).toBe(1);
    expect(crime.persuade()).toBe(true);
    expect(crime.bounty()).toBe(0);
    crime.commit('assault', { witnessed: true });
    expect(crime.arrestOptions().persuade).toBeUndefined();
  });

  it('resisting arrest makes guards hostile until the bounty is cleared; state round-trips', () => {
    const { crime, inventory } = setup();
    crime.commit('trespass', { witnessed: true });
    crime.resistArrest();
    expect(crime.guardResponse()).toBe('attack');
    const saved = JSON.parse(JSON.stringify(crime.serialize()));
    const c2 = new CrimeSystem({ inventory });
    c2.restore(saved);
    expect(c2.guardResponse()).toBe('attack');
    expect(c2.bounty()).toBe(5);
    expect(c2.serialize()).toEqual(crime.serialize());
    inventory.addDenarii(5);
    expect(c2.payFine()).toBe(true);
    expect(c2.guardResponse()).toBe('none');
  });
});

describe('factions', () => {
  it('join, gain reputation, rise through ranks', () => {
    const events = new EventBus<GameEvents>();
    const f = new FactionSystem(undefined, events);
    const log = record(events, ['faction:joined', 'faction:rank']);
    expect(f.rank('vigiles')).toBeUndefined();
    expect(f.join('vigiles')).toBe(true);
    expect(f.join('vigiles')).toBe(false);
    expect(f.rank('vigiles')!.id).toBe('miles');
    expect(f.rankIndex('vigiles')).toBe(0);
    f.addReputation('vigiles', 120);
    expect(f.rank('vigiles')!.latin).toBe('Sebaciarius');
    f.addReputation('vigiles', 5000);
    expect(f.reputation('vigiles')).toBe(1000);
    expect(f.rank('vigiles')!.id).toBe('tribunus');
    expect(log.map((l) => l.type)).toEqual(['faction:joined', 'faction:rank', 'faction:rank']);
    expect(f.join('latrones')).toBe(false); // not joinable
  });

  it('Clientela multiplies gains; enemies and hostility; persistence', () => {
    const f = new FactionSystem();
    f.gainMultiplier = () => 1.25;
    f.addReputation('populus', 100);
    f.addReputation('populus', -20);
    expect(f.reputation('populus')).toBe(105);
    expect(f.areEnemies('vigiles', 'grassatores')).toBe(true);
    expect(f.areEnemies('grassatores', 'vigiles')).toBe(true);
    expect(f.areEnemies('prasina', 'vigiles')).toBe(false);
    expect(f.hostileToPlayer('latrones')).toBe(true);
    f.addReputation('mercatores', -600);
    expect(f.hostileToPlayer('mercatores')).toBe(true);
    f.join('mithraei');
    const f2 = new FactionSystem();
    f2.restore(JSON.parse(JSON.stringify(f.serialize())));
    expect(f2.serialize()).toEqual(f.serialize());
    expect(f2.isMember('mithraei')).toBe(true);
  });
});
