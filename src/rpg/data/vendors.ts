/**
 * Vendor kinds — docs/GDD.md §7.3. An NPC is a vendor of a kind through the tag `vendor:<id>`;
 * its NpcDef.vendor gives stock (and may override the purse or what it buys). Purses refresh every
 * 2 game days. `grade` sets the haggle DC (stall 10, shop 25, banker 40); `plebeian` vendors give
 * the street-wise discount; `stall` vendors give the market-day discount.
 */
import type { ItemType } from '../types';
import { VENDORS_LIFE } from './vendors-life';

export interface VendorKind {
  id: string;
  name: string;
  /** Purse in den. (refreshes every 2 game days). */
  purse: number;
  /** Item types it buys (fences buy anything stolen). */
  buys: ItemType[];
  grade: 'stall' | 'shop' | 'banker';
  /** Its customers are the plebs (street-wise −5%). */
  plebeian?: boolean;
  /** A market stall (−10% on market days). */
  stall?: boolean;
  /** Repairs arms and armor at the smith's price. */
  repairs?: boolean;
  /** Buys stolen goods (at half the normal sell price). */
  fence?: boolean;
}

export const VENDORS: Record<string, VendorKind> = Object.fromEntries(
  ([
    { id: 'popina', name: 'Tavern keeper', purse: 40, buys: ['consumable'], grade: 'stall', plebeian: true, stall: true },
    { id: 'caupona', name: 'Innkeeper', purse: 60, buys: ['consumable'], grade: 'shop', plebeian: true },
    { id: 'pistor', name: 'Baker', purse: 20, buys: [], grade: 'stall', plebeian: true, stall: true },
    { id: 'macellarius', name: 'Market stallholder', purse: 50, buys: ['consumable', 'ingredient'], grade: 'stall', plebeian: true, stall: true },
    { id: 'armorum-negotiator', name: 'Arms dealer', purse: 500, buys: ['weapon', 'armor', 'shield', 'ammo'], grade: 'shop', repairs: true },
    { id: 'faber-ferrarius', name: 'Smith', purse: 300, buys: ['weapon', 'armor', 'shield', 'tool'], grade: 'shop', repairs: true },
    { id: 'vestiarius', name: 'Clothier', purse: 150, buys: ['clothing'], grade: 'shop' },
    { id: 'fullo', name: 'Fuller', purse: 30, buys: ['clothing'], grade: 'shop', plebeian: true },
    { id: 'seplasiarius', name: 'Druggist and perfumer', purse: 120, buys: ['ingredient', 'consumable'], grade: 'shop' },
    { id: 'medicus', name: 'Physician', purse: 150, buys: ['consumable', 'ingredient'], grade: 'shop' },
    { id: 'librarius', name: 'Bookseller', purse: 200, buys: ['book'], grade: 'shop' },
    { id: 'argentarius', name: 'Banker', purse: 3000, buys: ['misc'], grade: 'banker' },
    { id: 'receptator', name: 'Fence', purse: 400, buys: ['weapon', 'armor', 'shield', 'clothing', 'misc', 'tool', 'book'], grade: 'shop', fence: true },
    { id: 'lanista', name: 'Gladiator trainer', purse: 400, buys: ['weapon', 'armor', 'shield'], grade: 'shop' },
    { id: 'aedituus', name: 'Temple custodian', purse: 100, buys: [], grade: 'shop' },
    { id: 'haruspex', name: 'Diviner', purse: 50, buys: [], grade: 'stall' },
    { id: 'mathematicus', name: 'Astrologer', purse: 50, buys: [], grade: 'stall' },
    { id: 'magus', name: 'Magus', purse: 50, buys: [], grade: 'stall' },
    { id: 'tonsor', name: 'Barber', purse: 20, buys: [], grade: 'stall', plebeian: true },
    // Phase 2's kinds (the SHOPS crew's ./vendors-life.ts: margaritarius, vinarius).
    ...VENDORS_LIFE,
  ] as VendorKind[]).map((v) => [v.id, v]),
);
