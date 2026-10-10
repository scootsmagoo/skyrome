/**
 * Vendor kinds phase 2 adds (docs/design/world-life.md §4.2, the SHOPS crew): `margaritarius`
 * (buys jewellery), `vinarius`, and two stall kinds for the market-day potter and cloth-seller
 * (stalls take the market-day discount: 10% off the price, barter.ts). vendors.ts merges this into
 * VENDORS.
 */
import type { VendorKind } from './vendors';

export const VENDORS_LIFE: VendorKind[] = [
  // Pearls and gems of the Porticus Margaritaria: they buy jewellery (the 'misc' pearls and stones), nothing else.
  { id: 'margaritarius', name: 'Pearl-dealer', purse: 400, buys: ['misc'], grade: 'shop' },
  // Wine by the cup and the amphora: buys back what a drinker carries, and sells to the plebs.
  { id: 'vinarius', name: 'Wine-seller', purse: 80, buys: ['consumable'], grade: 'shop', plebeian: true },
  // A potter or lamp-seller at a stall: lamps and cups are tools and small goods.
  { id: 'figulus', name: 'Potter', purse: 25, buys: ['tool', 'misc'], grade: 'stall', plebeian: true, stall: true },
  // A cloth-seller's stall on market days: tunics and plain wraps.
  { id: 'pannarius', name: 'Cloth-seller', purse: 40, buys: ['clothing'], grade: 'stall', plebeian: true, stall: true },
];
