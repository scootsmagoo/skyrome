/**
 * Vendor kinds phase 2 adds (docs/design/world-life.md §4.2, the SHOPS crew): `margaritarius`
 * (buys jewellery) and `vinarius`. Empty until the crew fills it; vendors.ts merges it into VENDORS.
 */
import type { VendorKind } from './vendors';

export const VENDORS_LIFE: VendorKind[] = [];
