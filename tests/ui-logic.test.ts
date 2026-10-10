import { describe, expect, it } from 'vitest';
import {
  formatClock,
  formatDuration,
  formatMoney,
  formatWeight,
  paragraphs,
  romanHour,
  skillCheckChance,
  smartQuotes,
  toCapitals,
  toInscription,
} from '../src/ui/format';
import {
  bearingOfDir,
  bearingTo,
  cardinalLabels,
  compassPosition,
  edgeFade,
  relativeBearing,
} from '../src/ui/hud/compassMath';
import {
  adjustDeal,
  categoryOf,
  emptyDeal,
  filterEntries,
  primaryAction,
  sortEntries,
  stepIndex,
  summarizeDeal,
} from '../src/ui/models';
import type { ItemDef } from '../src/rpg/types';
import type { InventoryEntry, TradeItem } from '../src/ui/types';

describe('format', () => {
  it('writes inscriptional capitals', () => {
    expect(toInscription('Forum Romanum')).toBe('FORVM · ROMANVM');
    expect(toInscription('Iulius', false)).toBe('IVLIVS');
    expect(toInscription('Jupiter')).toBe('IVPITER');
    expect(toInscription('Rōma')).toBe('ROMA');
    // An English name keeps its spelling: V for U is Latin's alone.
    expect(toCapitals('Statue of Vortumnus')).toBe('STATUE · OF · VORTUMNUS');
    expect(toCapitals('Mercury’s Spring', false)).toBe('MERCURY’S SPRING');
  });
  it('names Roman hours and night watches', () => {
    expect(romanHour(6).latin).toBe('Hora prima');
    expect(romanHour(11.9).latin).toBe('Hora sexta');
    expect(romanHour(17.5).latin).toBe('Hora duodecima');
    expect(romanHour(19).latin).toBe('Prima vigilia');
    expect(romanHour(23).latin).toBe('Secunda vigilia');
    expect(romanHour(1).latin).toBe('Tertia vigilia');
    expect(romanHour(5.9).latin).toBe('Quarta vigilia');
  });
  it('formats clock, money, weight, durations', () => {
    expect(formatClock(8.5)).toBe('08:30');
    expect(formatClock(23.999)).toBe('00:00');
    expect(formatMoney(152)).toBe('152');
    expect(formatMoney(12.25)).toBe('12 d 1 s');
    expect(formatMoney(0.0625)).toBe('1 a');
    expect(formatMoney(1, true)).toBe('1 denarius');
    expect(formatMoney(2.5, true)).toBe('2 denarii 2 sestertii');
    expect(formatWeight(1)).toBe('1');
    expect(formatWeight(1.25)).toBe('1.3');
    expect(formatWeight(0.05)).toBe('0.05');
    expect(formatDuration(3 * 3600 + 5 * 60)).toBe('3h 05m');
    expect(formatDuration(45 * 60)).toBe('45m');
  });
  it('computes skill check chances per the dialogue contract', () => {
    expect(skillCheckChance(40, 40)).toBe(1);
    expect(skillCheckChance(30, 40)).toBeCloseTo(0.6);
    expect(skillCheckChance(10, 40)).toBe(0);
  });
  it('splits paragraphs', () => {
    expect(paragraphs('a\nb\n\n  c  \n\n\n')).toEqual(['a b', 'c']);
  });
  it('makes typographic quotes', () => {
    expect(smartQuotes('"You don\'t read it," he said.')).toBe('“You don’t read it,” he said.');
    expect(smartQuotes("the 'Venus' throw")).toBe('the ‘Venus’ throw');
    expect(smartQuotes('(\"a\")')).toBe('(“a”)');
  });
});

describe('compass math', () => {
  it('uses compass bearings with north = -z', () => {
    expect(bearingOfDir(0, -1)).toBeCloseTo(0);
    expect(bearingOfDir(1, 0)).toBeCloseTo(90);
    expect(bearingOfDir(0, 1)).toBeCloseTo(180);
    expect(bearingOfDir(-1, 0)).toBeCloseTo(270);
    expect(bearingTo(10, 10, 10, 0)).toBeCloseTo(0);
  });
  it('agrees with the camera yaw convention (yaw ψ looks along (-sin ψ, -cos ψ))', () => {
    const yaw = 0.7;
    const b = bearingOfDir(-Math.sin(yaw), -Math.cos(yaw));
    expect(b).toBeCloseTo((((-yaw * 180) / Math.PI) % 360 + 360) % 360);
  });
  it('wraps relative bearings', () => {
    expect(relativeBearing(350, 10)).toBeCloseTo(20);
    expect(relativeBearing(10, 350)).toBeCloseTo(-20);
    expect(relativeBearing(0, 180)).toBeCloseTo(180);
    expect(relativeBearing(90, 270)).toBeCloseTo(180);
  });
  it('places markers and clamps tracked ones to the edge', () => {
    expect(compassPosition(0)).toBe(0);
    expect(compassPosition(45)).toBeCloseTo(0.5);
    expect(compassPosition(-90)).toBeCloseTo(-1);
    expect(compassPosition(120)).toBeNull();
    expect(compassPosition(-120, 180, true)).toBe(-1);
    expect(edgeFade(0.5)).toBe(1);
    expect(edgeFade(1)).toBe(0);
  });
  it('has distinct Latin cardinal labels', () => {
    const t = cardinalLabels(true).map((c) => c.text);
    expect(new Set(t).size).toBe(4);
    expect(cardinalLabels(false).map((c) => c.text)).toEqual(['N', 'E', 'S', 'W']);
  });
});

describe('list navigation', () => {
  const enabled = (dis: number[]) => (i: number) => !dis.includes(i);
  it('skips disabled entries and clamps or wraps', () => {
    expect(stepIndex(0, 1, 5, enabled([1]))).toBe(2);
    expect(stepIndex(4, 1, 5)).toBe(4);
    expect(stepIndex(4, 1, 5, undefined, true)).toBe(0);
    expect(stepIndex(0, -1, 5, enabled([4]), true)).toBe(3);
    expect(stepIndex(-1, 1, 3)).toBe(0);
    expect(stepIndex(2, 1, 0)).toBe(-1);
    expect(stepIndex(1, 1, 3, enabled([0, 2]), true)).toBe(1);
  });
});

const item = (p: Partial<ItemDef> & { id: string }): ItemDef => ({
  name: p.id,
  type: 'misc',
  description: '',
  weight: 1,
  value: 1,
  ...p,
});

describe('inventory model', () => {
  const gladius = item({ id: 'gladius', name: 'Gladius', type: 'weapon', value: 60, weight: 1.2, weapon: { class: 'blade', damage: 9, speed: 1, reach: 0.7, stagger: 1, skill: 'blades' } });
  const scutum = item({ id: 'scutum', name: 'Scutum', type: 'shield', value: 45, weight: 7, shield: { rating: 14, blockMitigation: 0.7 } });
  const bread = item({ id: 'bread', name: 'Panis', type: 'consumable', value: 1, weight: 0.3 });
  const letter = item({ id: 'letter', name: 'Sealed letter', type: 'book', value: 0, weight: 0.05, questItem: true });
  const entries: InventoryEntry[] = [gladius, scutum, bread, letter].map((def) => ({ itemId: def.id, def, count: 1 }));

  it('categorizes like Skyrim (shields under armor, quest items separate)', () => {
    expect(categoryOf(scutum)).toBe('armor');
    expect(categoryOf(letter)).toBe('quest');
    expect(filterEntries(entries, 'weapons').map((e) => e.itemId)).toEqual(['gladius']);
    expect(filterEntries(entries, 'all')).toHaveLength(4);
  });
  it('sorts by stat, value and name', () => {
    expect(sortEntries(entries, 'stat').map((e) => e.itemId).slice(0, 2)).toEqual(['scutum', 'gladius']);
    expect(sortEntries(entries, 'value')[0].itemId).toBe('gladius');
    expect(sortEntries(entries, 'name').map((e) => e.def.name)).toEqual(['Gladius', 'Panis', 'Scutum', 'Sealed letter']);
  });
  it('picks the primary action', () => {
    expect(primaryAction(gladius)).toBe('equip');
    expect(primaryAction(bread)).toBe('use');
    expect(primaryAction(letter)).toBe('read');
    expect(primaryAction(item({ id: 'lamp' }))).toBeNull();
  });
});

describe('barter model', () => {
  const amphora = item({ id: 'amphora', name: 'Amphora of wine', value: 20, weight: 12 });
  const ring = item({ id: 'ring', name: 'Iron ring', value: 5, weight: 0.05 });
  const merchant: TradeItem[] = [{ itemId: 'amphora', def: amphora, count: 3, price: 24 }];
  const player: TradeItem[] = [
    { itemId: 'ring', def: ring, count: 2, price: 3 },
    { itemId: 'hot', def: ring, count: 1, price: 2, refuse: 'Stolen goods' },
  ];

  it('adds and removes lines clamped to stock', () => {
    let d = adjustDeal(emptyDeal(), 'buy', 'amphora', 5, 3);
    expect(d.buy).toEqual([{ itemId: 'amphora', count: 3 }]);
    d = adjustDeal(d, 'buy', 'amphora', -1, 3);
    expect(d.buy[0].count).toBe(2);
    d = adjustDeal(d, 'buy', 'amphora', -9, 3);
    expect(d.buy).toEqual([]);
  });
  it('totals a deal and validates funds and refusals', () => {
    let d = adjustDeal(emptyDeal(), 'buy', 'amphora', 2, 3);
    d = adjustDeal(d, 'sell', 'ring', 2, 2);
    const s = summarizeDeal(d, player, merchant, 50, 100);
    expect(s.cost).toBe(48);
    expect(s.income).toBe(6);
    expect(s.net).toBe(-42);
    expect(s.playerAfter).toBe(8);
    expect(s.weightDelta).toBeCloseTo(24 - 0.1);
    expect(s.ok).toBe(true);
    expect(summarizeDeal(d, player, merchant, 10, 100).reason).toBe('You cannot afford this.');
    const bad = adjustDeal(emptyDeal(), 'sell', 'hot', 1, 1);
    expect(summarizeDeal(bad, player, merchant, 10, 100).ok).toBe(false);
    expect(summarizeDeal(emptyDeal(), player, merchant, 10, 100).ok).toBe(false);
  });
});
