/**
 * Item catalogue — docs/GDD.md §7.2 (prices) and §8, with the GDD's ids, plus the content bible's
 * additions (docs/CONTENT.md §4: the NEW items in content.ts, the quest items in quest.ts). Values
 * are in denarii (1 as = 1/16, 1 quadrans = 1/64). A few period items beyond the GDD tables are
 * kept (marked "extra") for loot and flavour; two readable extras come from src/content/texts.ts.
 */
import { TEXT_ITEMS } from '../../../content/texts';
import type { ItemDef } from '../../types';
import { ARMOR, SHIELDS } from './armor';
import { BOOKS } from './books';
import { CLOTHING, JEWELLERY } from './clothing';
import { FOOD, INGREDIENTS, REMEDIES } from './consumables';
import { CONTENT_ITEMS } from './content';
import { TOOLS } from './misc';
import { QUEST_ITEMS } from './quest';
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
  ...CONTENT_ITEMS,
  ...QUEST_ITEMS,
  ...TEXT_ITEMS,
];
