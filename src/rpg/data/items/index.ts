/**
 * Item catalogue — docs/GDD.md §7.2 (prices) and §8, with the GDD's ids. Values are in denarii
 * (1 as = 1/16, 1 quadrans = 1/64). A few period items beyond the GDD tables are kept (marked
 * "extra") for loot and flavour. The in-world texts (letters, notices, a playbill…) come from the
 * content module (src/content/texts.ts); quest-only items ship with their quests.
 */
import { TEXT_ITEMS } from '../../../content/texts';
import type { ItemDef } from '../../types';
import { ARMOR, SHIELDS } from './armor';
import { BOOKS } from './books';
import { CLOTHING, JEWELLERY } from './clothing';
import { FOOD, INGREDIENTS, REMEDIES } from './consumables';
import { TOOLS } from './misc';
import { AMMO, BASE_WEAPONS, UNIQUES, VARIANTS } from './weapons';

export { AS } from './build';

export const ITEMS: ItemDef[] = [
  ...BASE_WEAPONS,
  ...VARIANTS,
  ...UNIQUES,
  ...AMMO,
  ...SHIELDS,
  ...CLOTHING,
  ...JEWELLERY,
  ...ARMOR,
  ...FOOD,
  ...REMEDIES,
  ...INGREDIENTS,
  ...TOOLS,
  ...BOOKS,
  ...TEXT_ITEMS,
];
