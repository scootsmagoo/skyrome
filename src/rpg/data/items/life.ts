/**
 * Items phase 2 adds for the life of the city (docs/design/world-life.md §5.1, the CITY VOICE crew):
 * calda, linteum, lucerna, tabula-cerata, oleum, amphora-olei, clavis-pergulae and the job baskets.
 * Quest items that belong to one quest are exported by that quest module instead. Empty until the
 * crew fills it; index.ts merges it into ITEMS.
 */
import type { ItemDef } from '../../types';

export const LIFE_ITEMS: ItemDef[] = [];
