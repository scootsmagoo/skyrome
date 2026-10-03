/**
 * Pure models behind the menus: list navigation, inventory categories and sorting, barter deals.
 * No DOM; unit-tested in tests/ui-models.test.ts.
 */
import type { ItemDef, ItemType } from '../rpg/types';
import type { Deal, DealLine, InventoryEntry, TradeItem } from './types';

// ------------------------------------------------------------------ list navigation

/**
 * Next selectable index moving `delta` steps from `current`, skipping disabled entries.
 * Returns `current` when nothing else is selectable; -1 for an empty list.
 */
export function stepIndex(
  current: number,
  delta: number,
  n: number,
  enabled: (i: number) => boolean = () => true,
  wrap = false,
): number {
  if (n <= 0) return -1;
  if (delta === 0) return current;
  const dir = Math.sign(delta);
  let i = current < 0 ? (dir > 0 ? -1 : n) : current;
  let steps = Math.abs(delta);
  let last = current;
  for (let guard = 0; guard < n * 2 + Math.abs(delta) && steps > 0; guard++) {
    i += dir;
    if (i < 0 || i >= n) {
      if (!wrap) break;
      i = (i + n) % n;
    }
    if (enabled(i)) {
      last = i;
      steps--;
    }
    if (i === current) break;
  }
  return last;
}

/** First enabled index at or after `from` (or before it, if none after). */
export function firstEnabled(n: number, enabled: (i: number) => boolean, from = 0): number {
  for (let i = Math.max(0, from); i < n; i++) if (enabled(i)) return i;
  for (let i = Math.min(from, n) - 1; i >= 0; i--) if (enabled(i)) return i;
  return -1;
}

// ------------------------------------------------------------------ inventory

export type InventoryCategory = 'all' | 'weapons' | 'armor' | 'clothing' | 'consumables' | 'books' | 'misc' | 'quest';

export const INVENTORY_CATEGORIES: { id: InventoryCategory; label: string; latin: string }[] = [
  { id: 'all', label: 'All', latin: 'Omnia' },
  { id: 'weapons', label: 'Weapons', latin: 'Arma' },
  { id: 'armor', label: 'Armor', latin: 'Armatura' },
  { id: 'clothing', label: 'Clothing', latin: 'Vestis' },
  { id: 'consumables', label: 'Consumables', latin: 'Cibaria' },
  { id: 'books', label: 'Books', latin: 'Libri' },
  { id: 'misc', label: 'Misc', latin: 'Varia' },
  { id: 'quest', label: 'Quest', latin: 'Res gestae' },
];

const TYPE_CATEGORY: Record<ItemType, InventoryCategory> = {
  weapon: 'weapons',
  ammo: 'weapons',
  shield: 'armor',
  armor: 'armor',
  clothing: 'clothing',
  consumable: 'consumables',
  ingredient: 'consumables',
  book: 'books',
  key: 'misc',
  tool: 'misc',
  misc: 'misc',
  quest: 'quest',
};

export function categoryOf(def: ItemDef): InventoryCategory {
  if (def.questItem) return 'quest';
  return TYPE_CATEGORY[def.type] ?? 'misc';
}

export function inCategory(def: ItemDef, cat: InventoryCategory): boolean {
  return cat === 'all' || categoryOf(def) === cat;
}

export type SortKey = 'name' | 'stat' | 'weight' | 'value';

export const SORT_KEYS: { id: SortKey; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'stat', label: 'Dmg / Arm' },
  { id: 'weight', label: 'Weight' },
  { id: 'value', label: 'Value' },
];

/** Damage for weapons, rating for armor/shields, else null. */
export function primaryStat(def: ItemDef): number | null {
  if (def.weapon) return def.weapon.damage;
  if (def.armor) return def.armor.rating;
  if (def.shield) return def.shield.rating;
  return null;
}

/** Sorted copy. Numeric keys sort descending by default (best first), names ascending. */
export function sortEntries(entries: readonly InventoryEntry[], key: SortKey, descending?: boolean): InventoryEntry[] {
  const desc = descending ?? key !== 'name';
  const val = (e: InventoryEntry): number | string => {
    switch (key) {
      case 'name': return e.def.name.toLowerCase();
      case 'stat': return primaryStat(e.def) ?? -1;
      case 'weight': return e.def.weight;
      case 'value': return e.def.value;
    }
  };
  return [...entries].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    let c = va < vb ? -1 : va > vb ? 1 : 0;
    if (desc) c = -c;
    if (c === 0) c = a.def.name.localeCompare(b.def.name);
    return c;
  });
}

export function filterEntries(entries: readonly InventoryEntry[], cat: InventoryCategory): InventoryEntry[] {
  return entries.filter((e) => inCategory(e.def, cat));
}

export type ItemAction = 'equip' | 'use' | 'read' | null;

/** What Enter/E does to an item. */
export function primaryAction(def: ItemDef): ItemAction {
  if (def.type === 'book') return 'read';
  if (def.type === 'consumable' || def.type === 'ingredient') return 'use';
  if (def.slot || def.weapon || def.armor || def.shield || def.type === 'clothing') return 'equip';
  return null;
}

// ------------------------------------------------------------------ barter

export interface DealSummary {
  /** Denarii the player pays for what they buy. */
  cost: number;
  /** Denarii the merchant pays for what the player sells. */
  income: number;
  /** income − cost: positive means the player ends up with more money. */
  net: number;
  playerAfter: number;
  merchantAfter: number;
  /** kg the player gains (negative when selling more than buying). */
  weightDelta: number;
  ok: boolean;
  reason?: string;
}

export function emptyDeal(): Deal {
  return { buy: [], sell: [] };
}

export function dealCount(lines: readonly DealLine[], itemId: string): number {
  return lines.find((l) => l.itemId === itemId)?.count ?? 0;
}

/** Returns a new deal with `delta` (±) units of `itemId` on one side, clamped to 0..available. */
export function adjustDeal(deal: Deal, side: 'buy' | 'sell', itemId: string, delta: number, available: number): Deal {
  const lines = deal[side];
  const next = Math.max(0, Math.min(available, dealCount(lines, itemId) + delta));
  const out: DealLine[] = [];
  let found = false;
  for (const l of lines) {
    if (l.itemId !== itemId) out.push(l);
    else {
      found = true;
      if (next > 0) out.push({ itemId, count: next }); // keeps its place in the list
    }
  }
  if (!found && next > 0) out.push({ itemId, count: next });
  return { ...deal, [side]: out };
}

export function summarizeDeal(
  deal: Deal,
  playerGoods: readonly TradeItem[],
  merchantGoods: readonly TradeItem[],
  playerDenarii: number,
  merchantDenarii: number,
): DealSummary {
  const find = (list: readonly TradeItem[], id: string) => list.find((t) => t.itemId === id);
  let cost = 0;
  let income = 0;
  let weightDelta = 0;
  let reason: string | undefined;
  for (const l of deal.buy) {
    const t = find(merchantGoods, l.itemId);
    if (!t) { reason = 'An item is no longer for sale.'; continue; }
    cost += t.price * l.count;
    weightDelta += t.def.weight * l.count;
  }
  for (const l of deal.sell) {
    const t = find(playerGoods, l.itemId);
    if (!t) { reason = 'You no longer have an item.'; continue; }
    if (t.refuse) reason = `${t.def.name}: ${t.refuse}`;
    income += t.price * l.count;
    weightDelta -= t.def.weight * l.count;
  }
  const net = income - cost;
  const playerAfter = playerDenarii + net;
  const merchantAfter = merchantDenarii - net;
  if (!reason && playerAfter < 0) reason = 'You cannot afford this.';
  if (!reason && merchantAfter < 0) reason = 'The merchant has not enough coin.';
  if (!reason && deal.buy.length === 0 && deal.sell.length === 0) reason = 'Nothing offered.';
  return { cost, income, net, playerAfter, merchantAfter, weightDelta, ok: !reason, reason };
}
